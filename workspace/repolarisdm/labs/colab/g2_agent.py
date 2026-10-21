"""G2 helper: a minimal tool-using agent loop with four actions.

Actions: read_file, write_file, run_tests, finish. One action per model reply.
The loop does not care which model answers. It calls chat(messages, seed) -> (text, usage).
make_server_chat() talks to any OpenAI-compatible server (for example `vllm serve`).
Every turn is written to a JSONL transcript the moment it happens.

The text format (tags, not JSON or tool calls) is deliberate: small models break JSON
escaping when they write code, and tool-call parsers differ between servers.
"""
from __future__ import annotations

import json
import re
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from g2_tasks import Sandbox, iter_files, minimal_env, run_cmd

HARNESS_VERSION = "g2-agent-2"   # 2: sandbox users, grading after all agents
READ_LIMIT, TEST_OUTPUT_LIMIT, MAX_INVALID_STREAK = 8000, 3000, 3

SYSTEM_PROMPT = """You are a careful software engineer working in a Python repository.
Each reply: think briefly, then end with exactly ONE action. The four actions:

<read_file path="freebusy/model.py"/>
    Shows a file. Paths are relative to the repository root.
<write_file path="freebusy/merge.py">
...the complete new file content...
</write_file>
    Replaces the whole file. Always write the complete file, never a diff.
<run_tests/>
    Runs the repository's visible tests and shows the output.
<finish>what you changed and the evidence that it works</finish>
    Ends the attempt. You cannot act after this.

Rules:
- In the task text, /app means the repository root.
- Only the first action in a reply is run.
- You have at most {max_turns} actions. Use them to read, change, test, then finish."""

PATTERNS = {
    "read_file": re.compile(r"<read_file\s+path\s*=\s*[\"']([^\"']+)[\"']\s*/?>"),
    "write_file": re.compile(r"<write_file\s+path\s*=\s*[\"']([^\"']+)[\"']\s*>\n?(.*?)</write_file>", re.S),
    "run_tests": re.compile(r"<run_tests\s*/?>"),
    "finish": re.compile(r"<finish>(.*?)</finish>|<finish\s*/>", re.S),
}
THINK = re.compile(r"<think>.*?</think>", re.S)


def strip_fence(text):
    """Small models often wrap file content in ``` fences. Remove one outer fence."""
    lines = text.strip("\n").split("\n")
    if lines and lines[0].lstrip().startswith("```"):
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
    return "\n".join(lines).rstrip("\n") + "\n"


def parse_action(reply):
    """Return the FIRST action in the reply as a dict, or {'name': 'invalid', 'error': ...}."""
    text = THINK.sub("", reply)
    found = sorted((m.start(), name, m) for name, rx in PATTERNS.items() for m in rx.finditer(text))
    if not found:
        if "<write_file" in text:
            return {"name": "invalid", "error": "<write_file> has no closing </write_file> tag. "
                    "Your reply may have hit the length limit. Nothing was written."}
        return {"name": "invalid", "error": "No action found. End your reply with exactly one action."}
    _, name, m = found[0]
    action = {"name": name, "ignored_actions": len(found) - 1}
    if name in ("read_file", "write_file"):
        action["path"] = m.group(1).strip()
    if name == "write_file":
        action["content"] = strip_fence(m.group(2))
    if name == "finish":
        action["message"] = (m.group(1) or "").strip()
    return action


def safe_path(root, rel):
    """Resolve rel inside root. "/app/x" means "x" (the task text calls the root /app).

    Refuse other absolute paths and anything that escapes root.
    """
    if rel == "/app" or rel.startswith("/app/"):
        rel = rel[len("/app/"):] or "."
    if not rel or "\0" in rel or rel.startswith(("/", "~")):
        raise ValueError(f"path must be relative to the repository root: {rel!r}")
    root = Path(root).resolve()
    path = (root / rel).resolve()
    if path != root and root not in path.parents:
        raise ValueError(f"path leaves the repository: {rel!r}")
    return path


def execute(action, root, task, stats, test_timeout, sandbox=None):
    """Run one action. Return the observation text the model sees next.

    read_file and write_file run in this process. They resolve every path inside the workspace
    and refuse symlinks that leave it, FIFOs and other special files. No model-written process
    is alive at that moment: run_cmd kills all of the sandbox user's processes after each test run.
    """
    sandbox = sandbox or Sandbox()
    name = action["name"]
    if name == "invalid":
        stats["invalid"] += 1
        return "Error: " + action["error"]
    try:
        if name == "read_file":
            stats["reads"] += 1
            path = safe_path(root, action["path"])
            if path.is_dir():
                return "Folder listing:\n" + "\n".join(sorted(p.name for p in path.iterdir()))
            if not path.is_file():
                return f"Error: no such file: {action['path']}"
            with open(path, "rb") as handle:
                text = handle.read(READ_LIMIT * 4 + 4).decode("utf-8", "replace")
            cut = f"\n[truncated at {READ_LIMIT} characters]" if len(text) > READ_LIMIT else ""
            return f"Content of {action['path']}:\n```\n{text[:READ_LIMIT]}\n```{cut}"
        if name == "write_file":
            stats["writes"] += 1
            path = safe_path(root, action["path"])
            if path.exists() and not path.is_file():
                return f"Error: {action['path']} exists and is not a regular file. Nothing was written."
            new_dirs = [d for d in [path.parent, *path.parent.parents] if not d.exists()]
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(action["content"], encoding="utf-8")
            for item in [path, *new_dirs]:
                sandbox.give(item)                   # the sandbox user owns what it writes
            return f"Wrote {action['content'].count(chr(10))} lines to {action['path']}."
    except ValueError as error:
        stats["path_escapes"] += 1
        return f"Error: {error}"
    except OSError as error:
        return f"Error: {type(error).__name__}: {error}"
    if name == "run_tests":
        stats["test_runs"] += 1
        res = run_cmd(task.visible_test_cmd, root, timeout=test_timeout, env=minimal_env(Path(root).parent),
                      sandbox=sandbox)
        stats["last_test_exit"] = "timeout" if res["timed_out"] else res["exit"]
        head = "Tests timed out." if res["timed_out"] else f"Exit code: {res['exit']}"
        return f"{head}\nLast part of the output:\n{res['output'][-TEST_OUTPUT_LIMIT:]}"
    return "Finished."


def approx_tokens(messages):
    """Rough count (about 3 characters per token for code). Used only to stop before overflow."""
    return sum(len(m["content"]) for m in messages) // 3 + 8 * len(messages)


def first_message(task, root):
    files = "\n".join(rel for rel, _ in iter_files(root))
    return f"Task:\n\n{task.instruction}\n\nFiles in the repository:\n{files}\n\nStart."


def run_agent(task, root, chat, transcript_path, *, attempt_id, seed, max_turns=15,
              context_tokens=16384, reply_tokens=1536, test_timeout=60, meta=None, sandbox=None):
    """Drive one attempt. Returns a summary dict. The transcript is JSONL, one event per line."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT.format(max_turns=max_turns)},
                {"role": "user", "content": first_message(task, root)}]
    stats = {"reads": 0, "writes": 0, "test_runs": 0, "invalid": 0, "path_escapes": 0,
             "last_test_exit": None, "prompt_tokens": 0, "completion_tokens": 0, "cut_replies": 0}
    end_reason, finish_message, turns, streak, started = "max_turns", None, 0, 0, time.time()
    with open(transcript_path, "w", encoding="utf-8") as log:
        def emit(event):
            log.write(json.dumps(event, ensure_ascii=False) + "\n")
            log.flush()
        emit({"type": "meta", "attempt": attempt_id, "seed": seed, "harness": HARNESS_VERSION,
              "task": task.name, "max_turns": max_turns, "context_tokens": context_tokens,
              "reply_tokens": reply_tokens, **(meta or {})})
        for m in messages:
            emit({"type": "prompt", "role": m["role"], "content": m["content"]})
        for turn in range(1, max_turns + 1):
            if approx_tokens(messages) + reply_tokens > context_tokens:
                end_reason = "context_full"
                break
            t0 = time.time()
            try:
                reply, usage = chat(messages, seed * 1000 + turn)
            except Exception as error:  # server down, context overflow (HTTP 400), timeout
                emit({"type": "error", "turn": turn, "error": f"{type(error).__name__}: {error}"[:2000]})
                end_reason = "model_error"
                break
            turns = turn
            stats["prompt_tokens"] += usage.get("prompt_tokens") or 0
            stats["completion_tokens"] += usage.get("completion_tokens") or 0
            stats["cut_replies"] += int(usage.get("finish_reason") == "length")
            action = parse_action(reply)
            observation = execute(action, root, task, stats, test_timeout, sandbox)
            record = {k: v for k, v in action.items() if k != "content"}
            if "content" in action:
                record["lines"] = action["content"].count("\n")
            emit({"type": "turn", "turn": turn, "reply": reply, "action": record, "observation": observation,
                  "seconds": round(time.time() - t0, 2), "usage": usage})
            if action["name"] == "finish":
                end_reason, finish_message = "finish", action.get("message", "")
                break
            streak = streak + 1 if action["name"] == "invalid" else 0
            if streak >= MAX_INVALID_STREAK:
                end_reason = "format_errors"
                break
            left = max_turns - turn
            messages += [{"role": "assistant", "content": reply},
                         {"role": "user", "content": f"{observation}\n\n(Actions left: {left})"}]
        summary = {"attempt": attempt_id, "end_reason": end_reason, "turns": turns,
                   "finish_message": finish_message, "seconds": round(time.time() - started, 1), **stats}
        emit({"type": "end", **summary})
    return summary


def make_server_chat(base_url, model, *, temperature=0.7, top_p=0.95, max_tokens=1536,
                     timeout_s=600, extra=None):
    """chat() for an OpenAI-compatible /v1/chat/completions endpoint. Standard library only."""
    url = base_url.rstrip("/") + "/chat/completions"

    def chat(messages, seed):
        body = {"model": model, "messages": messages, "temperature": temperature, "top_p": top_p,
                "max_tokens": max_tokens, "seed": seed, "top_k": 0, "repetition_penalty": 1.0,
                **(extra or {})}
        request = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                         headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=timeout_s) as response:
                data = json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"HTTP {error.code}: {error.read().decode('utf-8', 'replace')[:500]}") from None
        choice = data["choices"][0]
        usage = dict(data.get("usage") or {})
        usage["finish_reason"] = choice.get("finish_reason")
        return choice["message"].get("content") or "", usage

    return chat


# Plan dtype names (vLLM's) -> torch attribute names.
TORCH_DTYPES = {"half": "float16", "float16": "float16", "bfloat16": "bfloat16", "float32": "float32"}


def make_transformers_chat(model_id, revision, *, dtype, temperature=0.7, top_p=0.95, max_tokens=1536):
    """Fallback when vLLM will not start: plain transformers generate on the GPU.

    Same sampling as the server path: plain temperature and top_p, top_k off, no repetition
    penalty. Without these, transformers would use the model's own generation_config.json
    (top_k 20 and repetition penalty 1.1 for Qwen2.5-Coder), and the two backends would differ.
    Pass the plan's dtype ("half" on a T4, "bfloat16" on an L4 or A100).
    Slow, and one request at a time (a lock), so use concurrency 1. Never run on a GPU by the build.
    """
    import torch  # imported here so the rest of this module stays CPU-only
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(model_id, revision=revision)
    model = AutoModelForCausalLM.from_pretrained(model_id, revision=revision,
                                                 dtype=getattr(torch, TORCH_DTYPES[dtype])).to("cuda").eval()
    lock = threading.Lock()

    def chat(messages, seed):
        prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        batch = tok(prompt, return_tensors="pt").to("cuda")
        with lock, torch.no_grad():
            torch.manual_seed(seed)
            out = model.generate(**batch, do_sample=True, temperature=temperature, top_p=top_p, top_k=0,
                                 repetition_penalty=1.0, max_new_tokens=max_tokens,
                                 pad_token_id=tok.eos_token_id)
        new = out[0][batch["input_ids"].shape[1]:]
        finish = "length" if len(new) >= max_tokens else "stop"
        return tok.decode(new, skip_special_tokens=True), {
            "prompt_tokens": int(batch["input_ids"].shape[1]), "completion_tokens": int(len(new)),
            "finish_reason": finish}

    return chat


def make_chat(plan, backend, base_url, *, temperature, top_p):
    """The chat() for the backend chosen in the notebook's settings cell: "vllm" or "transformers"."""
    if backend == "vllm":
        return make_server_chat(base_url, "g2-model", temperature=temperature, top_p=top_p,
                                max_tokens=plan.reply_tokens, extra=plan.request_extra)
    if backend == "transformers":
        return make_transformers_chat(plan.model_id, plan.revision, dtype=plan.dtype, temperature=temperature,
                                      top_p=top_p, max_tokens=plan.reply_tokens)
    raise ValueError(f"backend must be 'vllm' or 'transformers', not {backend!r}")
