"""G1 sampling: draw n completions per problem from a local model.

Two backends with the SAME sampling settings:
- vLLM (fast, default): LLM.chat() with one SamplingParams per problem.
- transformers (fallback): model.generate() in batches.

Both use plain temperature sampling: top_p=1, top_k off, no repetition
penalty. We set these on purpose. Qwen2.5-Coder's own generation_config.json
says top_p 0.8, top_k 20, repetition_penalty 1.1, and some code paths fill
missing settings from it. A temperature sweep must change one thing only.

Seeds: each (temperature, problem) gets its own seed. vLLM gives the i-th of
the n samples the seed (seed + i), so the samples differ but are repeatable
on the same software and GPU. GPU kernels are not always bit-exact, so expect
small differences across GPU types.

vLLM and torch are imported inside the samplers only, so this module imports
on any machine.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

INSTRUCTION = (
    "Complete the Python function below so that it does exactly what its docstring says.\n"
    "Reply with the complete function, including the signature, in one ```python code block.\n"
    "You may add imports and helper functions in that block. "
    "Do not add tests, examples or explanations."
)

# Used by exercise E1 (prompt sensitivity).
ALT_INSTRUCTION = (
    "Here is a Python function to write. Read the docstring carefully, think about the edge "
    "cases, then give your final code in one ```python code block."
)


def build_messages(task, instruction: str = INSTRUCTION) -> list[dict]:
    """The chat the model sees: one user turn with the prompt. Never the tests."""
    return [{"role": "user", "content": f"{instruction}\n\n```python\n{task.prompt}```"}]


def task_seed(base_seed: int, temperature_index: int, task_index: int) -> int:
    """Seed for one (temperature, problem). Samples use seed, seed+1, ..., seed+n-1."""
    return base_seed + 100_000 * temperature_index + 1_000 * task_index


class VllmSampler:
    backend = "vllm"

    def __init__(self, plan):
        from vllm import LLM  # imported here: vLLM pulls in torch and CUDA

        self.model_id, self.revision = plan.model_id, plan.revision
        self.llm = LLM(
            model=plan.model_id,
            revision=plan.revision,
            tokenizer_revision=plan.revision,
            dtype=plan.dtype,
            max_model_len=plan.max_model_len,
            gpu_memory_utilization=plan.gpu_memory_utilization,
            enforce_eager=plan.enforce_eager,
            seed=0,
        )

    def sample(self, tasks, temperature: float, n: int, max_tokens: int, seeds: list[int],
               instruction: str = INSTRUCTION) -> list[dict]:
        from vllm import SamplingParams

        conversations = [build_messages(task, instruction) for task in tasks]
        params = [
            SamplingParams(n=n, temperature=temperature, top_p=1.0, top_k=0, min_p=0.0,
                           repetition_penalty=1.0, max_tokens=max_tokens, seed=seed)
            for seed in seeds
        ]
        outputs = self.llm.chat(conversations, params, use_tqdm=True)
        records = []
        for task, seed, output in zip(tasks, seeds, outputs):
            for completion in sorted(output.outputs, key=lambda c: c.index):
                records.append({
                    "task_id": task.task_id,
                    "temperature": temperature,
                    "sample_index": completion.index,
                    "seed": seed + completion.index,
                    "completion": completion.text,
                    "finish_reason": completion.finish_reason,
                    "n_tokens": len(completion.token_ids),
                })
        return records


class HfSampler:
    backend = "transformers"

    def __init__(self, plan):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.model_id, self.revision = plan.model_id, plan.revision
        dtype = torch.bfloat16 if plan.dtype == "bfloat16" else torch.float16
        self.tokenizer = AutoTokenizer.from_pretrained(plan.model_id, revision=plan.revision)
        self.tokenizer.padding_side = "left"
        self.model = AutoModelForCausalLM.from_pretrained(
            plan.model_id, revision=plan.revision, dtype=dtype, device_map="cuda")
        self.model.eval()
        self.batch = plan.hf_batch
        eos = self.model.generation_config.eos_token_id
        self.eos_ids = set(eos if isinstance(eos, (list, tuple)) else [eos])
        self.pad_id = self.tokenizer.pad_token_id
        if self.pad_id is None:
            self.pad_id = min(self.eos_ids)

    def sample(self, tasks, temperature: float, n: int, max_tokens: int, seeds: list[int],
               instruction: str = INSTRUCTION) -> list[dict]:
        import torch

        records = []
        for task, seed in zip(tasks, seeds):
            text = self.tokenizer.apply_chat_template(
                build_messages(task, instruction), tokenize=False, add_generation_prompt=True)
            enc = self.tokenizer(text, return_tensors="pt").to(self.model.device)
            prompt_len = enc["input_ids"].shape[1]
            done = 0
            while done < n:
                m = min(self.batch, n - done)
                torch.manual_seed(seed + done)
                with torch.no_grad():
                    out = self.model.generate(
                        **enc, do_sample=True, temperature=temperature, top_p=1.0, top_k=0,
                        repetition_penalty=1.0, max_new_tokens=max_tokens,
                        num_return_sequences=m, pad_token_id=self.pad_id)
                for j in range(m):
                    ids = out[j, prompt_len:].tolist()
                    stop = next((i for i, t in enumerate(ids) if t in self.eos_ids), None)
                    kept = ids if stop is None else ids[:stop]
                    records.append({
                        "task_id": task.task_id,
                        "temperature": temperature,
                        "sample_index": done + j,
                        "seed": seed + done,  # one torch seed per batch
                        "completion": self.tokenizer.decode(kept, skip_special_tokens=True),
                        "finish_reason": "length" if stop is None else "stop",
                        "n_tokens": len(kept),
                    })
                done += m
        return records


def make_sampler(plan):
    """Load the model with the backend chosen in the plan."""
    return VllmSampler(plan) if plan.backend == "vllm" else HfSampler(plan)


def write_jsonl(path, records: list[dict]) -> None:
    """Write atomically, so a disconnect never leaves half a file."""
    path = Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record) + "\n")
    os.replace(tmp, path)


def read_jsonl(path) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def run_sweep(sampler, tasks, temperatures, n: int, max_tokens: int, out_dir,
              base_seed: int = 1234, instruction: str = INSTRUCTION, tag: str = "main") -> list[dict]:
    """Sample every problem at every temperature. Saves one file per temperature.

    If a file for a temperature already exists with the same model, settings
    and size, it is reused. So after a disconnect you can rerun this cell.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {"tag": tag, "backend": sampler.backend, "model_id": sampler.model_id,
            "revision": sampler.revision, "max_tokens": max_tokens, "base_seed": base_seed,
            "instruction_sha": hashlib.sha256(instruction.encode()).hexdigest()[:12]}
    all_records: list[dict] = []
    for t_index, temperature in enumerate(temperatures):
        path = out_dir / f"samples_{tag}_t{temperature:.2f}.jsonl"
        if path.exists():
            old = read_jsonl(path)
            same = old and all(old[0].get(k) == v for k, v in meta.items())
            if same and len(old) == n * len(tasks):
                print(f"T={temperature}: reusing {len(old)} saved completions from {path.name}")
                all_records += old
                continue
        seeds = [task_seed(base_seed, t_index, i) for i in range(len(tasks))]
        start = time.time()
        records = sampler.sample(tasks, temperature, n, max_tokens, seeds, instruction)
        for record in records:
            record.update(meta)
        if len(records) != n * len(tasks):
            raise RuntimeError(f"expected {n * len(tasks)} completions, got {len(records)}")
        write_jsonl(path, records)
        print(f"T={temperature}: {len(records)} completions in {time.time() - start:.0f} s -> {path.name}")
        all_records += records
    return all_records
