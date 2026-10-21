"""G3 training helpers: detect the GPU, pick a plan that fits, sample from the model, evaluate during training.

torch and transformers are imported inside functions only, so this module imports on a CPU machine
(the build's smoke test does that). Every number in a plan is a guess from model sizes, not a
measurement: nothing here was run on a GPU by the build.
Model ids, licenses and revisions were checked on the Hugging Face Hub API on 2026-10-20 (FACTS.md section 4).
"""
from __future__ import annotations

import json
import subprocess
import time

from g3_grader import grade_many
from g3_tasks import make_prompt

MODELS = {
    "qwen-coder-0.5b": {"id": "Qwen/Qwen2.5-Coder-0.5B-Instruct",
                        "revision": "ea3f2471cf1b1f0db85067f1ef93848e38e88c25",
                        "weights_gb": 0.99, "license": "apache-2.0"},
    "qwen-coder-1.5b": {"id": "Qwen/Qwen2.5-Coder-1.5B-Instruct",
                        "revision": "2e1fd397ee46e1388853d2af2c993145b0f1098a",
                        "weights_gb": 3.09, "license": "apache-2.0"},
}


def parse_nvidia_smi(text):
    """Parse `nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv,noheader,nounits`."""
    lines = [ln for ln in text.strip().splitlines() if ln.strip()]
    if not lines:
        return None
    name, mem_mib, cc = [part.strip() for part in lines[0].split(",")]
    major, minor = (int(x) for x in cc.split("."))
    return {"name": name, "mem_gb": round(float(mem_mib) / 1024, 1), "cc": (major, minor)}


def read_gpu():
    """GPU 0 as {"name", "mem_gb", "cc"}, or None on a CPU-only runtime."""
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,compute_cap",
                              "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=30)
        if out.returncode == 0 and out.stdout.strip():
            return parse_nvidia_smi(out.stdout)
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
        pass
    try:
        import torch
        if torch.cuda.is_available():
            p = torch.cuda.get_device_properties(0)
            return {"name": p.name, "mem_gb": round(p.total_memory / 2 ** 30, 1), "cc": (p.major, p.minor)}
    except ImportError:
        pass
    return None


def choose_plan(gpu, model_key=None):
    """Settings for both runs on this GPU. Same settings for run A and run B: only the reward differs."""
    if gpu is None:
        return {"gpu": None, "tier": "none",
                "notes": ["No GPU found. Part 1 (the graders) works on CPU. For training: "
                          "Runtime > Change runtime type > T4 GPU, then run the notebook from the top."]}
    major = gpu["cc"][0]
    native_bf16 = major >= 8        # do NOT use torch.cuda.is_bf16_supported(): it counts emulation
    plan = {"gpu": gpu["name"], "mem_gb": gpu["mem_gb"], "cc": f"{gpu['cc'][0]}.{gpu['cc'][1]}",
            "native_bf16": native_bf16, "dtype": "bfloat16" if native_bf16 else "float32",
            "bf16": native_bf16, "num_generations": 8, "max_completion_length": 256,
            "learning_rate": 2e-5, "lora_r": 16, "lora_alpha": 32, "eval_every": 25,
            "temperature": 1.0, "notes": []}
    if not native_bf16:
        plan.update(tier="T4-class", model_key="qwen-coder-0.5b", max_steps=150, batch_size=8,
                    eval_samples=2, eval_batch_prompts=16,
                    minutes="about 35-55 min per run, 60-120 min for both runs (guess, not measured; "
                            "check the time per step at step 10)")
        plan["notes"].append("No native bf16 (compute capability below 8.0). The model loads in float32 "
                             "and bf16=False. fp16 is faster but may overflow on Qwen models.")
        if gpu["mem_gb"] < 14:
            plan["notes"].append("Less than 14 GB of GPU memory: if you run out of memory, set "
                                 "max_completion_length to 192.")
    elif gpu["mem_gb"] < 30:
        plan.update(tier="L4-class", model_key="qwen-coder-1.5b", max_steps=150, batch_size=8,
                    eval_samples=2, eval_batch_prompts=16,
                    minutes="about 30-50 min per run (guess, not measured)")
    else:
        plan.update(tier="A100-class", model_key="qwen-coder-1.5b", max_steps=200, batch_size=16,
                    eval_samples=4, eval_batch_prompts=24,
                    minutes="about 30-60 min per run (guess, not measured)")
    if model_key is not None:
        if model_key not in MODELS:
            raise ValueError(f"unknown model_key {model_key!r}; choose from {sorted(MODELS)}")
        if model_key == "qwen-coder-1.5b" and not native_bf16:
            plan["notes"].append("1.5B in float32 on this GPU is about 3x slower than 0.5B: "
                                 "consider max_steps=100.")
        plan["model_key"] = model_key
    model = MODELS[plan["model_key"]]
    plan["model_id"], plan["revision"] = model["id"], model["revision"]
    plan["prompts_per_step"] = plan["batch_size"] // plan["num_generations"]
    if plan["batch_size"] % plan["num_generations"]:
        raise ValueError("batch_size must be a multiple of num_generations (TRL rule)")
    return plan


def format_plan(plan):
    if plan.get("gpu") is None:
        return "\n".join(plan["notes"])
    keys = ["gpu", "mem_gb", "cc", "tier", "model_id", "revision", "dtype", "bf16", "max_steps", "batch_size",
            "num_generations", "prompts_per_step", "max_completion_length", "learning_rate", "lora_r",
            "eval_every", "eval_samples", "minutes"]
    lines = [f"{k:22s} {plan[k]}" for k in keys]
    lines += [f"note: {n}" for n in plan["notes"]]
    return "\n".join(lines)


def generate(model, tok, prompts, n, max_new_tokens, temperature=1.0, seed=0, batch_prompts=16):
    """n sampled completions per prompt, with the same sampling settings as GRPO training
    (temperature 1.0, no top-k, no top-p, no repetition penalty). Returns a list of lists of strings."""
    import torch
    texts = [tok.apply_chat_template([{"role": "user", "content": p}], tokenize=False, add_generation_prompt=True)
             for p in prompts]
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    device = next(model.parameters()).device
    results = []
    for i in range(0, len(texts), batch_prompts):
        enc = tok(texts[i:i + batch_prompts], return_tensors="pt", padding=True, add_special_tokens=False).to(device)
        with torch.no_grad():
            out = model.generate(**enc, do_sample=True, temperature=temperature, top_p=1.0, top_k=0,
                                 repetition_penalty=1.0, max_new_tokens=max_new_tokens, num_return_sequences=n,
                                 pad_token_id=tok.pad_token_id, use_cache=True)
        decoded = tok.batch_decode(out[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)
        results += [decoded[j:j + n] for j in range(0, len(decoded), n)]
    return results


def eval_records(tasks, samples, step, mode):
    """Grade sampled completions (one list per task) and return log records. CPU only."""
    pairs = [(t, s) for t, ss in zip(tasks, samples) for s in ss]
    grades = grade_many(pairs)
    records = []
    for (t, _), g in zip(pairs, grades):
        rec = g.record()
        rec.update({"step": step, "split": t.split, "mode": mode})
        records.append(rec)
    return records


def summary_line(records):
    def m(split, key):
        rows = [r for r in records if r["split"] == split]
        return sum(float(r[key]) for r in rows) / len(rows) if rows else float("nan")
    return (f"trained tasks: weak {m('train', 'weak'):.2f}, strong {m('train', 'strong'):.2f}, "
            f"held-out correct {m('train', 'heldout_all'):.2f} | never-trained tasks: "
            f"weak {m('heldout_task', 'weak'):.2f}, held-out correct {m('heldout_task', 'heldout_all'):.2f}")


def make_eval_callback(tasks, tok, out_path, plan, mode, seed=0):
    """A transformers TrainerCallback that evaluates ALL tasks at step 0, every plan['eval_every'] steps,
    and at the end. It samples plan['eval_samples'] completions per task with a fixed seed per step,
    grades them, and appends records to out_path. It saves and restores the RNG state, so training
    randomness does not depend on the evaluation. Call .attach(trainer) after building the trainer."""
    import torch
    from transformers import TrainerCallback

    class HeldOutEval(TrainerCallback):
        def __init__(self):
            self.trainer = None
            self.done = set()
            self.t_train = None
            self.eval_seconds = 0.0

        def attach(self, trainer):
            self.trainer = trainer

        def _model(self, kwargs):
            return self.trainer.model if self.trainer is not None else kwargs.get("model")

        def _evaluate(self, step, kwargs):
            if step in self.done:
                return
            self.done.add(step)
            model = self._model(kwargs)
            t0 = time.time()
            cpu_rng = torch.get_rng_state()
            cuda_rng = torch.cuda.get_rng_state_all() if torch.cuda.is_available() else None
            was_training = model.training
            model.eval()
            try:
                samples = generate(model, tok, [make_prompt(t) for t in tasks], plan["eval_samples"],
                                   plan["max_completion_length"], plan["temperature"], seed + step,
                                   plan["eval_batch_prompts"])
            finally:
                if was_training:
                    model.train()
                torch.set_rng_state(cpu_rng)
                if cuda_rng is not None:
                    torch.cuda.set_rng_state_all(cuda_rng)
            records = eval_records(tasks, samples, step, mode)
            with open(out_path, "a", encoding="utf-8") as f:
                for rec in records:
                    f.write(json.dumps(rec) + "\n")
            self.eval_seconds += time.time() - t0
            print(f"[eval {mode} step {step}] {summary_line(records)} ({time.time() - t0:.0f} s)", flush=True)

        def _safe(self, step, kwargs):
            try:
                self._evaluate(step, kwargs)
            except Exception as e:  # an eval failure must not kill a 40-minute training run
                print(f"[eval {mode} step {step}] FAILED: {type(e).__name__}: {e}", flush=True)

        def on_train_begin(self, args, state, control, **kwargs):
            self.t_train = time.time()
            self._safe(0, kwargs)

        def on_step_end(self, args, state, control, **kwargs):
            step = state.global_step
            if step == 10 and self.t_train is not None:
                per_step = (time.time() - self.t_train - self.eval_seconds) / 10
                print(f"[time] about {per_step:.1f} s per training step; {args.max_steps} steps take about "
                      f"{per_step * args.max_steps / 60:.0f} min plus evals. If that is too long, stop the run "
                      "(Runtime > Interrupt), lower PLAN['max_steps'], delete this run's folder and start again.",
                      flush=True)
            every = plan["eval_every"]
            if every and step % every == 0:
                self._safe(step, kwargs)

        def on_train_end(self, args, state, control, **kwargs):
            self._safe(state.global_step, kwargs)

    return HeldOutEval()
