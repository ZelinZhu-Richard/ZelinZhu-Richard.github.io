"""GPU detection, the per-GPU model plan, and the model calls for the G4 probe.

detect_gpu() uses nvidia-smi and does not import torch. plan_for_gpu() is pure Python
(the CPU smoke test checks it). Everything that touches torch or transformers imports
them inside the function, so this module imports fine on a machine without them.

Nothing in this file was run on a GPU by the build. The model ids, revisions and
sizes come from the Hugging Face Hub API (checked 2026-10-20). The memory rules in
plan_for_gpu() are our estimates, not measurements.
"""

from __future__ import annotations

import gc
import subprocess
import zlib

# id, pinned revision, parameters in billions, kind, why it is in the plan.
CANDIDATE_MODELS = [
    dict(id="Qwen/Qwen2.5-Coder-1.5B", revision="df3ce67c0e24480f20468b6ef2894622d69eb73b",
         params_b=1.54, kind="base", role="primary model"),
    dict(id="Qwen/Qwen2.5-Coder-0.5B", revision="8123ea2e9354afb7ffcc6c8641d1b2f5ecf18301",
         params_b=0.49, kind="base", role="size comparison"),
    dict(id="Qwen/Qwen2.5-Coder-1.5B-Instruct", revision="2e1fd397ee46e1388853d2af2c993145b0f1098a",
         params_b=1.54, kind="instruct", role="base vs instruct comparison"),
    dict(id="Qwen/Qwen2.5-Coder-7B", revision="0396a76181e127dfc13e5c5ec48a8cee09938b02",
         params_b=7.62, kind="base", role="size comparison (big GPUs only)"),
]

# 2.4M parameters, about 21 MB. Random weights: its scores mean nothing.
TINY_MODEL = dict(id="trl-internal-testing/tiny-Qwen2ForCausalLM-2.5",
                  revision="ce8d0bf270b28c8fab026ced69fe8aa14b0f0eda",
                  params_b=0.0024, kind="random", role="CPU plumbing test only")

# Fallback compute capabilities when nvidia-smi cannot report compute_cap.
KNOWN_COMPUTE_CAPABILITY = {"T4": (7, 5), "L4": (8, 9), "A100": (8, 0), "H100": (9, 0),
                            "RTX PRO 6000": (12, 0)}

MAX_TOKENS = 512
# Memory unit: "GB" in this file means GiB (2**30 bytes), as in the G1, G2, G3 and G5 planners.
# nvidia-smi reports MiB, so a T4 shows 15.0 here. Weights are params * bytes per param, converted to GiB.
GIB_PER_BILLION_BYTES = 1e9 / 2**30


def weights_gib(params_b: float, bytes_per_param: int) -> float:
    return params_b * bytes_per_param * GIB_PER_BILLION_BYTES


def parse_nvidia_smi(output: str) -> dict | None:
    """Parse one line of 'name, memory.total [MiB], compute_cap' (compute_cap optional)."""
    line = output.strip().splitlines()[0] if output.strip() else ""
    if not line:
        return None
    fields = [f.strip() for f in line.split(",")]
    if len(fields) >= 3 and fields[-1].replace(".", "").isdigit() and "." in fields[-1]:
        name, mem_mib, cc = ", ".join(fields[:-2]), fields[-2], fields[-1]
        major, minor = (int(x) for x in cc.split("."))
    else:
        name, mem_mib = ", ".join(fields[:-1]), fields[-1]
        major, minor = next((v for k, v in KNOWN_COMPUTE_CAPABILITY.items() if k in name), (0, 0))
    vram_gb = int(float(mem_mib)) / 1024          # MiB -> GiB
    return dict(name=name, vram_gb=round(vram_gb, 1), cc_major=major, cc_minor=minor)


def detect_gpu() -> dict | None:
    """Ask nvidia-smi about GPU 0. Returns None when there is no NVIDIA GPU."""
    for query in ("name,memory.total,compute_cap", "name,memory.total"):
        try:
            out = subprocess.run(["nvidia-smi", f"--query-gpu={query}", "--format=csv,noheader,nounits"],
                                 capture_output=True, text=True, timeout=30)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return None
        if out.returncode == 0 and out.stdout.strip():
            return parse_nvidia_smi(out.stdout)
    return None


def choose_dtype(params_b: float, vram_gb: float, native_bf16: bool) -> str | None:
    """float32 when the weights use at most half the VRAM, else 16-bit, else None (skip).

    float32 avoids fp16 overflow and keeps scores deterministic. Forward passes on
    texts of at most 512 tokens need little memory beyond the weights (estimate).
    """
    if weights_gib(params_b, 4) <= 0.50 * vram_gb:
        return "float32"
    if weights_gib(params_b, 2) <= 0.75 * vram_gb:
        return "bfloat16" if native_bf16 else "float16"
    return None


def plan_for_gpu(gpu: dict | None) -> dict:
    """Pick models and dtypes that fit this GPU. Pure Python."""
    plan = dict(gpu=gpu, max_tokens=MAX_TOKENS, batch_size=1, models=[], skipped=[], notes=[])
    if gpu is None:
        plan.update(device="cpu", native_bf16=False)
        plan["models"].append(dict(TINY_MODEL, dtype="float32", weights_gb=round(weights_gib(TINY_MODEL["params_b"], 4), 3)))
        plan["notes"].append("No GPU: only the tiny random model runs. Its scores test the plumbing and mean "
                             "nothing. In Colab choose Runtime > Change runtime type > T4 GPU.")
    else:
        native = gpu["cc_major"] >= 8      # do not trust torch.cuda.is_bf16_supported() on a T4
        plan.update(device="cuda", native_bf16=native)
        for spec in CANDIDATE_MODELS:
            dtype = choose_dtype(spec["params_b"], gpu["vram_gb"], native)
            if dtype is None:
                plan["skipped"].append((spec["id"], f"too big for {gpu['vram_gb']} GB"))
                continue
            per_param = 4 if dtype == "float32" else 2
            plan["models"].append(dict(spec, dtype=dtype, weights_gb=round(weights_gib(spec["params_b"], per_param), 1)))
        if not native:
            plan["notes"].append("No native bf16 (compute capability below 8.0): models run in float32.")
    plan["primary"] = plan["models"][0]["id"]
    return plan


def describe_plan(plan: dict) -> str:
    gpu = plan["gpu"]
    lines = []
    if gpu:
        lines.append(f"GPU: {gpu['name']}, {gpu['vram_gb']} GB, compute capability "
                     f"{gpu['cc_major']}.{gpu['cc_minor']}, native bf16: {plan['native_bf16']}")
    else:
        lines.append("GPU: none found by nvidia-smi")
    lines.append(f"Device: {plan['device']}. Batch: {plan['batch_size']} text per forward pass. "
                 f"Texts cut to {plan['max_tokens']} tokens.")
    lines.append("Models to score (in order):")
    for m in plan["models"]:
        lines.append(f"  - {m['id']} @ {m['revision'][:10]}  dtype={m['dtype']}  "
                     f"weights about {m['weights_gb']} GB  ({m['role']})")
    for model_id, reason in plan["skipped"]:
        lines.append(f"  - skipped {model_id}: {reason}")
    lines.append(f"Primary model: {plan['primary']}")
    lines += [f"Note: {n}" for n in plan["notes"]]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# torch / transformers parts (run only in Colab; never run by the build)
# ---------------------------------------------------------------------------

def torch_gpu_check(plan: dict) -> None:
    """Second GPU check, through torch. Warns if torch disagrees with nvidia-smi."""
    import torch

    if plan["device"] == "cpu":
        print("torch:", torch.__version__, "- running on CPU")
        return
    if not torch.cuda.is_available():
        raise RuntimeError("nvidia-smi found a GPU but torch.cuda.is_available() is False")
    props = torch.cuda.get_device_properties(0)
    print(f"torch {torch.__version__}: {props.name}, {props.total_memory / 2**30:.1f} GB, "
          f"compute capability {props.major}.{props.minor}")
    gpu = plan["gpu"]
    if (props.major, props.minor) != (gpu["cc_major"], gpu["cc_minor"]):
        print("WARNING: torch and nvidia-smi disagree on compute capability; trust torch and re-plan.")


def load_model(spec: dict, device: str):
    """Load a pinned model and tokenizer in the planned dtype, in eval mode."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    dtype = {"float32": torch.float32, "bfloat16": torch.bfloat16, "float16": torch.float16}[spec["dtype"]]
    tok = AutoTokenizer.from_pretrained(spec["id"], revision=spec["revision"])
    model = AutoModelForCausalLM.from_pretrained(
        spec["id"], revision=spec["revision"], dtype=dtype,
        device_map="cuda" if device == "cuda" else None)
    model.eval()
    print(f"loaded {spec['id']} ({spec['dtype']}) on {model.device}")
    return model, tok


def doc_start_id(tok):
    """The token that starts a training document: BOS if the tokenizer has one, else <|endoftext|>."""
    if tok.bos_token_id is not None:
        return tok.bos_token_id
    tid = tok.convert_tokens_to_ids("<|endoftext|>")
    if isinstance(tid, int) and tid != tok.unk_token_id:
        return tid
    return None


def _logprobs_of(model, ids: list[int]) -> list[float]:
    """Log-prob of ids[1:], each given the tokens before it."""
    import torch

    x = torch.tensor([ids], device=model.device)
    with torch.no_grad():
        logits = model(input_ids=x).logits[0, :-1].float()
    logp = torch.log_softmax(logits, dim=-1)
    return logp.gather(1, x[0, 1:].unsqueeze(1)).squeeze(1).cpu().tolist()


def token_logprobs(model, tok, text: str, max_tokens: int = MAX_TOKENS) -> tuple[list[float], int, bool]:
    """Per-token log-probs of text (one per text token), its token count, and whether it was cut."""
    text_ids = tok(text, add_special_tokens=False)["input_ids"]
    truncated = len(text_ids) > max_tokens
    text_ids = text_ids[:max_tokens]
    start = doc_start_id(tok)
    if start is None:                     # no start token: the first text token gets no score
        return _logprobs_of(model, text_ids), len(text_ids), truncated
    return _logprobs_of(model, [start] + text_ids), len(text_ids), truncated


def score_items(model, tok, items, spec: dict, max_tokens: int = MAX_TOKENS) -> list[dict]:
    """One record per item: ids and labels, token count, and per-token log-probs."""
    records = []
    for i, it in enumerate(items, start=1):
        lps, n_tokens, truncated = token_logprobs(model, tok, it.text, max_tokens)
        records.append(dict(id=it.id, domain=it.domain, arm=it.arm, pair=it.pair, matched=it.matched,
                            model=spec["id"], dtype=spec["dtype"], n_tokens=n_tokens, truncated=truncated,
                            zlib_bytes=len(zlib.compress(it.text.encode("utf-8"))), logprobs=lps))
        if i % 50 == 0 or i == len(items):
            print(f"  {spec['id']}: scored {i}/{len(items)} texts")
    return records


def continuation_logprob(model, tok, prefix: str, continuation: str) -> float:
    """Sum of log-probs of the continuation's tokens, given the prefix.

    Prefix and continuation are tokenized separately, so every candidate GUID is
    measured the same way.
    """
    pre = tok(prefix, add_special_tokens=False)["input_ids"]
    cont = tok(continuation, add_special_tokens=False)["input_ids"]
    start = doc_start_id(tok)
    ids = ([start] if start is not None else []) + pre + cont
    lps = _logprobs_of(model, ids)
    return float(sum(lps[-len(cont):]))


def greedy_continuation(model, tok, prefix: str, max_new_tokens: int = 24) -> str:
    """What the model writes after prefix with greedy decoding (no sampling)."""
    import torch

    pre = tok(prefix, add_special_tokens=False)["input_ids"]
    start = doc_start_id(tok)
    x = torch.tensor([([start] if start is not None else []) + pre], device=model.device)
    with torch.no_grad():
        out = model.generate(input_ids=x, attention_mask=torch.ones_like(x), max_new_tokens=max_new_tokens,
                             do_sample=False, pad_token_id=tok.eos_token_id)
    return tok.decode(out[0, x.shape[1]:], skip_special_tokens=True)


def free_gpu_memory() -> None:
    """Return freed GPU memory to the pool. Call it after `del model, tok` in your cell.

    If memory stays high (check nvidia-smi), restart the runtime.
    """
    import torch

    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
