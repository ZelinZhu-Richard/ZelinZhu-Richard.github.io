"""G2 helper: detect the Colab GPU, pick a model plan that fits, start and wait for vLLM.

Standard library only. torch is imported only as a fallback when nvidia-smi is missing,
because vLLM wants CUDA untouched in the notebook process before it starts.

Every number here is a plan, not a measurement. Nothing was run on a GPU by the build.
Model ids and revisions were checked on the Hugging Face Hub API on 2026-10-20 (FACTS.md section 4).
"""
from __future__ import annotations

import json
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field

MODELS = {
    "qwen-coder-1.5b": {"id": "Qwen/Qwen2.5-Coder-1.5B-Instruct",
                        "revision": "2e1fd397ee46e1388853d2af2c993145b0f1098a",
                        "weights_gb": 3.09, "license": "apache-2.0", "extra": {}},
    "qwen-coder-7b": {"id": "Qwen/Qwen2.5-Coder-7B-Instruct",
                      "revision": "c03e6d358207e414f1eca0bb1891e29f1db0e242",
                      "weights_gb": 15.2, "license": "apache-2.0", "extra": {}},
    # Qwen3-1.7B trained on mini-swe-agent runs. Our tag format differs from its training format.
    "mini-coder-1.7b": {"id": "ricdomolm/mini-coder-1.7b",
                        "revision": "5b7fbc90b6c4684c546de7f811865cff4414a96c",
                        "weights_gb": 3.44, "license": "mit",
                        "extra": {"chat_template_kwargs": {"enable_thinking": False}}},
}


@dataclass
class GpuInfo:
    name: str
    mem_gb: float
    cc: tuple  # compute capability (major, minor)
    source: str


@dataclass
class Plan:
    gpu: str
    model_key: str
    model_id: str
    revision: str
    dtype: str
    max_model_len: int
    gpu_memory_utilization: float
    enforce_eager: bool
    concurrency: int
    attempts: int
    max_turns: int
    reply_tokens: int
    minutes_guess: str
    request_extra: dict = field(default_factory=dict)
    notes: list = field(default_factory=list)


def parse_nvidia_smi(text):
    """Parse `nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv,noheader,nounits`."""
    lines = [line for line in text.strip().splitlines() if line.strip()]
    if not lines:
        return None
    name, mem_mib, cc = [part.strip() for part in lines[0].split(",")]
    major, minor = (int(x) for x in cc.split("."))
    return GpuInfo(name=name, mem_gb=round(int(float(mem_mib)) / 1024, 1), cc=(major, minor), source="nvidia-smi")


def detect_gpu():
    """GpuInfo for GPU 0, or None. nvidia-smi first; torch only if nvidia-smi is missing."""
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,compute_cap",
                              "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=30)
        if out.returncode == 0:
            return parse_nvidia_smi(out.stdout)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    try:
        import torch
        if torch.cuda.is_available():
            p = torch.cuda.get_device_properties(0)
            return GpuInfo(p.name, round(p.total_memory / 2**30, 1), (p.major, p.minor), "torch")
    except ImportError:
        pass
    return None


def choose_plan(gpu, model_key=None):
    """Pick model size and batch settings for the GPU. Raises ValueError with a fix if it cannot."""
    if gpu is None:
        raise ValueError("No GPU found. In Colab: Runtime > Change runtime type > T4 GPU, then rerun.")
    if gpu.cc < (7, 5):
        raise ValueError(f"{gpu.name} has compute capability {gpu.cc}; vLLM needs 7.5 or higher.")
    native_bf16 = gpu.cc >= (8, 0)  # not torch.cuda.is_bf16_supported(): it counts emulation on a T4
    if gpu.mem_gb < 14:
        raise ValueError(f"{gpu.name} has {gpu.mem_gb} GB. This lab needs about 15 GB (a T4) or more.")
    if gpu.mem_gb < 20:      # T4 class (16 GB, about 15 usable)
        tier = dict(key="qwen-coder-1.5b", util=0.85, conc=8, attempts=30, guess="30-120")
    elif gpu.mem_gb < 30:    # L4 class (24 GB)
        tier = dict(key="qwen-coder-1.5b", util=0.90, conc=16, attempts=50, guess="30-90")
    elif gpu.mem_gb < 60:    # A100 40 GB
        tier = dict(key="qwen-coder-7b", util=0.90, conc=16, attempts=50, guess="30-90")
    else:                    # A100 80 GB, H100, G4
        tier = dict(key="qwen-coder-7b", util=0.90, conc=32, attempts=100, guess="30-90")
    key = model_key or tier["key"]
    if key not in MODELS:
        raise ValueError(f"unknown model key {key!r}; choose one of {sorted(MODELS)}")
    model = MODELS[key]
    if model["weights_gb"] > 0.6 * gpu.mem_gb:
        raise ValueError(f"{model['id']} ({model['weights_gb']} GB of weights) does not fit well on "
                         f"{gpu.name} ({gpu.mem_gb} GB). Use a smaller model key.")
    notes = []
    if not native_bf16:
        notes.append("No native bf16 (compute capability < 8.0): using float16. vLLM uses the slower "
                     "Triton attention backend here.")
    if gpu.cc >= (12, 0):
        notes.append("Blackwell GPU: support in the pinned vLLM wheel was not checked. If serve fails, use an A100 or L4.")
    return Plan(
        gpu=f"{gpu.name} ({gpu.mem_gb} GB, cc {gpu.cc[0]}.{gpu.cc[1]})", model_key=key,
        model_id=model["id"], revision=model["revision"], dtype="bfloat16" if native_bf16 else "half",
        max_model_len=16384, gpu_memory_utilization=tier["util"], enforce_eager=not native_bf16,
        concurrency=tier["conc"], attempts=tier["attempts"], max_turns=15, reply_tokens=1536,
        minutes_guess=tier["guess"], request_extra=dict(model["extra"]), notes=notes)


BACKENDS = ("vllm", "transformers")


def apply_overrides(plan, overrides=None, backend="vllm"):
    """Change plan fields by name, for example {"gpu_memory_utilization": 0.80, "max_model_len": 8192}.

    Unknown names raise, so a typo cannot be ignored silently. The transformers backend answers
    one request at a time, so it sets concurrency to 1.
    """
    if backend not in BACKENDS:
        raise ValueError(f"backend must be one of {BACKENDS}, not {backend!r}")
    for name, value in (overrides or {}).items():
        if name not in Plan.__dataclass_fields__ or name in ("gpu", "model_key", "model_id", "revision"):
            raise ValueError(f"cannot override {name!r}; to change the model, set MODEL_KEY instead")
        setattr(plan, name, value)
    if backend == "transformers":
        plan.concurrency = 1
        plan.notes.append("transformers backend: one request at a time, so concurrency is 1 (slow).")
    return plan


def describe(plan):
    lines = [f"GPU:            {plan.gpu}",
             f"Model:          {plan.model_id} @ {plan.revision[:12]}",
             f"dtype:          {plan.dtype}   enforce_eager: {plan.enforce_eager}",
             f"Context:        {plan.max_model_len} tokens   GPU memory share: {plan.gpu_memory_utilization}",
             f"Parallel:       {plan.concurrency} attempts at once",
             f"Attempts:       {plan.attempts} (minimum 20)   turns per attempt: {plan.max_turns}",
             f"Time guess:     {plan.minutes_guess} minutes for the attempts (a guess; never measured)"]
    return "\n".join(lines + [f"Note: {n}" for n in plan.notes])


def serve_command(plan, port=8000, served_name="g2-model"):
    """The `vllm serve` command. --generation-config vllm stops the server from silently using
    the model's own sampling defaults (top_k 20, repetition penalty 1.1 for Qwen2.5-Coder)."""
    cmd = ["vllm", "serve", plan.model_id, "--revision", plan.revision, "--dtype", plan.dtype,
           "--max-model-len", str(plan.max_model_len),
           "--gpu-memory-utilization", str(plan.gpu_memory_utilization),
           "--generation-config", "vllm", "--served-model-name", served_name,
           "--host", "127.0.0.1", "--port", str(port), "--seed", "0"]
    return cmd + (["--enforce-eager"] if plan.enforce_eager else [])


def wait_for_server(base_url, proc=None, *, timeout_s=1200, poll_s=5, log_path=None):
    """Poll base_url/models until the server answers. Raise with the log tail if it dies."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if proc is not None and proc.poll() is not None:
            raise RuntimeError(f"server exited with code {proc.returncode}.\n{_tail(log_path)}")
        try:
            with urllib.request.urlopen(base_url.rstrip("/") + "/models", timeout=10) as response:
                return [m["id"] for m in json.load(response)["data"]]
        except (urllib.error.URLError, ConnectionError, TimeoutError, OSError):
            time.sleep(poll_s)
    raise RuntimeError(f"server not ready after {timeout_s} s.\n{_tail(log_path)}")


def _tail(path, chars=3000):
    if not path:
        return ""
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return "Last lines of the server log:\n" + handle.read()[-chars:]
    except OSError:
        return ""


def plan_dict(plan):
    return asdict(plan)
