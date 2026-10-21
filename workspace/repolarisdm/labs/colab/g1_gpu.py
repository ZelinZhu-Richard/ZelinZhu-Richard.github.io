"""G1 GPU check and plan: pick a model size and settings that fit this GPU.

Call detect_gpu() BEFORE importing torch or vLLM. It only runs nvidia-smi.
If CUDA starts before vLLM, vLLM switches its workers to "spawn" mode.

Facts used here (checked 2026-10-20, see labs/colab/FACTS.md):
- vLLM supports compute capability 7.5 and higher (T4, L4, A100, H100, G4).
- Native bf16 needs compute capability 8.0 or higher. A T4 (7.5) has none, so
  it uses float16 ("half"). Do not trust torch.cuda.is_bf16_supported() on a
  T4: by default it also counts emulation.
- Weight sizes come from the Hugging Face Hub. The memory margins and time
  estimates are our guesses (inference), never measured.
Stdlib only.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field

# Pinned installs. vLLM 0.31.0 pins torch 2.13.0, so it replaces Colab's torch:
# restart the session after installing. The transformers set matches the
# Colab GPU image of 2026-10-20, so it should change nothing there.
INSTALL_PINS = {
    "vllm": ("vllm==0.31.0", "transformers==5.17.0", "accelerate==1.15.0"),
    "transformers": ("transformers==5.20.2", "accelerate==1.15.0"),
}

BACKEND_FILE = "/content/g1_backend.txt"


@dataclass(frozen=True)
class ModelSpec:
    repo_id: str
    revision: str
    weights_gb: float


# Apache-2.0, not gated: no Hugging Face token needed. Revisions pinned 2026-10-20.
MODELS = {
    "0.5b": ModelSpec("Qwen/Qwen2.5-Coder-0.5B-Instruct", "ea3f2471cf1b1f0db85067f1ef93848e38e88c25", 0.99),
    "1.5b": ModelSpec("Qwen/Qwen2.5-Coder-1.5B-Instruct", "2e1fd397ee46e1388853d2af2c993145b0f1098a", 3.09),
    "7b": ModelSpec("Qwen/Qwen2.5-Coder-7B-Instruct", "c03e6d358207e414f1eca0bb1891e29f1db0e242", 15.2),
}

# Used only when nvidia-smi cannot report compute_cap (old drivers).
_KNOWN_CC = {"T4": (7, 5), "L4": (8, 9), "A100": (8, 0), "H100": (9, 0),
             "RTX PRO 6000": (12, 0), "V100": (7, 0), "P100": (6, 0), "K80": (3, 7)}


@dataclass(frozen=True)
class GpuInfo:
    name: str
    memory_gb: float
    compute_capability: tuple[int, int]

    @property
    def native_bf16(self) -> bool:
        return self.compute_capability[0] >= 8

    def __str__(self) -> str:
        major, minor = self.compute_capability
        return f"{self.name}, {self.memory_gb:.1f} GB, compute capability {major}.{minor}"


def _cc_from_name(name: str) -> tuple[int, int]:
    for key, cc in _KNOWN_CC.items():
        if key.lower() in name.lower():
            return cc
    return (0, 0)


def parse_nvidia_smi(text: str) -> list[GpuInfo]:
    """Parse `nvidia-smi --query-gpu=name,memory.total[,compute_cap] --format=csv,noheader,nounits`."""
    gpus = []
    for line in text.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 2 or not parts[1].replace(".", "", 1).isdigit():
            continue
        name, mem_mib = parts[0], float(parts[1])
        if len(parts) >= 3 and "." in parts[2]:
            major, minor = parts[2].split(".", 1)
            cc = (int(major), int(minor))
        else:
            cc = _cc_from_name(name)
        gpus.append(GpuInfo(name, mem_mib / 1024.0, cc))
    return gpus


def detect_gpu() -> GpuInfo | None:
    """First GPU from nvidia-smi, or None when there is no GPU."""
    base = ["nvidia-smi", "--format=csv,noheader,nounits"]
    for fields in ("name,memory.total,compute_cap", "name,memory.total"):
        try:
            out = subprocess.run(base + [f"--query-gpu={fields}"], capture_output=True,
                                 text=True, timeout=30)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return None
        if out.returncode == 0:
            gpus = parse_nvidia_smi(out.stdout)
            return gpus[0] if gpus else None
    return None


def used_memory_gb() -> float:
    """GPU memory in use right now, from nvidia-smi (includes vLLM's reservation)."""
    out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                         capture_output=True, text=True, timeout=30)
    return float(out.stdout.strip().splitlines()[0]) / 1024.0


NO_GPU_MESSAGE = ("No GPU found. In Colab: Runtime > Change runtime type > pick a GPU "
                  "(T4 is enough), then run the notebook again from the top.")


def pick_backend(gpu: GpuInfo | None, prefer: str = "auto") -> str:
    """vLLM when the GPU supports it (compute capability 7.5+), else transformers."""
    if gpu is None:
        raise RuntimeError(NO_GPU_MESSAGE)
    if prefer not in ("auto", "vllm", "transformers"):
        raise ValueError(f"prefer must be auto, vllm or transformers, not {prefer!r}")
    if prefer == "transformers":
        return "transformers"
    if gpu.compute_capability < (7, 5):
        return "transformers"
    return "vllm"


def save_backend(backend: str, path: str = BACKEND_FILE) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(backend + "\n")


def load_backend(path: str = BACKEND_FILE) -> str:
    try:
        with open(path, encoding="utf-8") as fh:
            backend = fh.read().strip()
    except FileNotFoundError:
        raise RuntimeError("No backend saved yet. Run the install cell (Step 3) first.") from None
    if backend not in INSTALL_PINS:
        raise RuntimeError(f"Unknown backend {backend!r} in {path}. Run Step 3 again.")
    return backend


@dataclass(frozen=True)
class Plan:
    gpu: GpuInfo
    backend: str
    model_size: str
    model_id: str
    revision: str
    dtype: str                    # "half" (float16) or "bfloat16"
    max_model_len: int            # vLLM context limit; prompts here are under 600 tokens
    gpu_memory_utilization: float  # share of VRAM that vLLM reserves
    enforce_eager: bool           # skip CUDA graphs: faster start, less memory, slower decode
    hf_batch: int                 # sequences per generate() call on the transformers backend
    estimate: str
    notes: tuple[str, ...] = field(default_factory=tuple)


def choose_plan(gpu: GpuInfo | None, backend: str, model_size: str | None = None) -> Plan:
    """Choose a model size and settings that fit this GPU."""
    if gpu is None:
        raise RuntimeError(NO_GPU_MESSAGE)
    if backend not in INSTALL_PINS:
        raise ValueError(f"unknown backend {backend!r}")
    vram = gpu.memory_gb
    notes = []
    if vram < 20:  # T4 class (16 GB card, about 15 GB usable)
        tier, max_len, util, eager, batch = "T4 class", 2048, 0.85, True, 50
        estimate = ("vLLM: about 10-25 min for 3,000 completions; "
                    "transformers: about 30-60 min (guesses, not measured)")
    elif vram < 30:  # L4 class (24 GB)
        tier, max_len, util, eager, batch = "L4 class", 4096, 0.90, False, 50
        estimate = ("vLLM: about 5-15 min; transformers: about 20-40 min (guesses, not measured)")
    else:  # A100 40/80 GB, H100, G4
        tier, max_len, util, eager, batch = "A100 class or larger", 4096, 0.90, False, 50
        estimate = ("vLLM: about 5-15 min; transformers: about 20-40 min (guesses, not measured)")
    if model_size is None:
        model_size = "7b" if vram >= 30 else ("1.5b" if vram >= 12 else "0.5b")
        notes.append(f"Model size {model_size} picked automatically for a {tier} GPU.")
    if model_size not in MODELS:
        raise ValueError(f"model_size must be one of {sorted(MODELS)}, not {model_size!r}")
    spec = MODELS[model_size]
    # Rough fit test: weights + 2 GB for the KV cache and activations.
    need = spec.weights_gb + 2.0
    if need > vram * util:
        raise ValueError(f"{spec.repo_id} needs about {need:.0f} GB but this GPU offers about "
                         f"{vram * util:.1f} GB. Choose a smaller model_size.")
    if need > 0.8 * vram * util:
        notes.append("Tight fit. If you see CUDA out-of-memory, use a smaller model_size.")
    if model_size == "7b" and batch > 25 and vram < 30:
        batch = 25
    dtype = "bfloat16" if gpu.native_bf16 else "half"
    if not gpu.native_bf16:
        notes.append("No native bf16 on this GPU, so the model runs in float16.")
    if backend == "transformers":
        notes.append("transformers backend: slower than vLLM, same sampling settings.")
    return Plan(gpu=gpu, backend=backend, model_size=model_size, model_id=spec.repo_id,
                revision=spec.revision, dtype=dtype, max_model_len=max_len,
                gpu_memory_utilization=util, enforce_eager=eager, hf_batch=batch,
                estimate=estimate, notes=tuple(notes))


def format_plan(plan: Plan) -> str:
    lines = [
        f"GPU:       {plan.gpu}",
        f"Backend:   {plan.backend}",
        f"Model:     {plan.model_id} @ {plan.revision[:12]}",
        f"Precision: {plan.dtype}",
    ]
    if plan.backend == "vllm":
        lines.append(f"vLLM:      max_model_len={plan.max_model_len}, "
                     f"gpu_memory_utilization={plan.gpu_memory_utilization}, "
                     f"enforce_eager={plan.enforce_eager}")
    else:
        lines.append(f"Batch:     {plan.hf_batch} sequences per generate() call")
    lines.append(f"Time:      {plan.estimate}")
    lines += [f"Note:      {note}" for note in plan.notes]
    return "\n".join(lines)
