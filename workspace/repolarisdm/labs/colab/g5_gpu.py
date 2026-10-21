"""G5 GPU plan: read the GPU with nvidia-smi (no torch, no CUDA init) and pick a judge that fits.

Why nvidia-smi and not torch: if CUDA is initialized in the notebook before vLLM starts, vLLM has to
switch its workers to the 'spawn' start method (vLLM troubleshooting docs, v0.32.0, checked 2026-10-20).

Every number in the plans below is an estimate from weight sizes on the Hugging Face Hub (checked
2026-10-20). Nothing here was run on a GPU.
"""
import subprocess

# All three are Apache-2.0 and not gated, so no Hugging Face token is needed. Revisions pinned 2026-10-20.
JUDGES = {
    "qwen3-4b": {"model": "Qwen/Qwen3-4B-Instruct-2507",
                 "revision": "cdbee75f17c01a7cc42f958dc650907174af0554", "weights_gb": 8.05},
    "qwen2.5-coder-1.5b": {"model": "Qwen/Qwen2.5-Coder-1.5B-Instruct",
                           "revision": "2e1fd397ee46e1388853d2af2c993145b0f1098a", "weights_gb": 3.09},
    "qwen2.5-coder-7b": {"model": "Qwen/Qwen2.5-Coder-7B-Instruct",
                         "revision": "c03e6d358207e414f1eca0bb1891e29f1db0e242", "weights_gb": 15.2},
}
MAX_NEW_TOKENS = 512           # reasoning (60 words) + JSON fits in about 200 tokens; 512 is headroom


def parse_nvidia_smi(text):
    """Parse `nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv,noheader,nounits`."""
    gpus = []
    for line in text.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) != 3:
            continue
        name, mem_mib, cc = parts
        major, minor = (int(x) for x in cc.split("."))
        gpus.append({"name": name, "mem_gb": round(int(float(mem_mib)) / 1024, 1),
                     "cc_major": major, "cc_minor": minor})
    return gpus


def query_nvidia_smi():
    """First GPU as a dict, or None if there is no NVIDIA GPU (for example a CPU runtime)."""
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,compute_cap",
                              "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    gpus = parse_nvidia_smi(out.stdout) if out.returncode == 0 else []
    return gpus[0] if gpus else None


def make_plan(gpu, override=None):
    """Pick judge model, dtype and vLLM settings for this GPU. Raises if there is no GPU or no fit."""
    if gpu is None:
        raise RuntimeError("No NVIDIA GPU found. In Colab: Runtime > Change runtime type > T4 GPU, then rerun.")
    mem, native_bf16 = gpu["mem_gb"], gpu["cc_major"] >= 8      # T4 is 7.5: bf16 only emulated
    if not native_bf16:
        tier = "T4 class (compute capability below 8.0: fp16, Triton attention, no FlashAttention)"
        plan = {"dtype": "half", "max_model_len": 8192, "gpu_memory_utilization": 0.85,
                "enforce_eager": True, "max_num_seqs": 8}
        judge = "qwen3-4b" if mem >= 14 else "qwen2.5-coder-1.5b"
        est = "about 45-60 min of GPU time in total: install 5-10, download 3-5, judge runs 15-30 (estimate)"
    elif mem < 30:
        tier = "L4 class (24 GB, native bf16)"
        plan = {"dtype": "bfloat16", "max_model_len": 16384, "gpu_memory_utilization": 0.90,
                "enforce_eager": False, "max_num_seqs": 16}
        judge = "qwen3-4b"
        est = "about 30-45 min of GPU time in total (estimate)"
    else:
        tier = "A100 class or larger (40 GB+, native bf16)"
        plan = {"dtype": "bfloat16", "max_model_len": 16384, "gpu_memory_utilization": 0.90,
                "enforce_eager": False, "max_num_seqs": 32}
        judge = "qwen3-4b"
        est = "about 20-30 min of GPU time in total (estimate). Room for a second judge: qwen2.5-coder-7b"
    if override:
        if override not in JUDGES:
            raise ValueError(f"unknown judge {override!r}; pick one of {sorted(JUDGES)}")
        judge = override
    w = JUDGES[judge]["weights_gb"]
    usable = mem * plan["gpu_memory_utilization"]
    if w > usable - 1.5:                                  # leave room for activations and KV cache
        raise RuntimeError(f"{judge} needs about {w} GB of weights; this GPU gives vLLM about "
                           f"{usable:.1f} GB. Pick a smaller judge.")
    if w > usable - 6:                                    # tight: shorter context, fewer sequences
        plan["max_model_len"] = min(plan["max_model_len"], 8192)
        plan["max_num_seqs"] = min(plan["max_num_seqs"], 8)
    plan.update({"gpu": gpu["name"], "mem_gb": mem, "compute_capability": f"{gpu['cc_major']}.{gpu['cc_minor']}",
                 "tier": tier, "judge_key": judge, **JUDGES[judge], "max_new_tokens": MAX_NEW_TOKENS,
                 "time_estimate": est})
    plan["max_input_tokens"] = plan["max_model_len"] - MAX_NEW_TOKENS - 64
    return plan


def describe_plan(p):
    return "\n".join([
        f"GPU: {p['gpu']}, {p['mem_gb']} GiB, compute capability {p['compute_capability']}",
        f"Tier: {p['tier']}",
        f"Judge: {p['model']} @ {p['revision'][:12]} ({p['weights_gb']} GB of weights)",
        f"vLLM: dtype={p['dtype']} max_model_len={p['max_model_len']} "
        f"gpu_memory_utilization={p['gpu_memory_utilization']} max_num_seqs={p['max_num_seqs']} "
        f"enforce_eager={p['enforce_eager']}",
        f"Prompt budget: {p['max_input_tokens']} input tokens, {p['max_new_tokens']} output tokens",
        f"Budget: {p['time_estimate']}",
    ])
