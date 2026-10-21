"""G2 helper: run many attempts (in parallel), grade each one, save everything as JSONL.

Layout of a run folder:
    config.json              the configuration every attempt used (one row per run)
    attempts.jsonl           one summary row per graded attempt (append-only; resume reads it)
    transcripts/aNNN.jsonl   every event of one attempt: meta, prompts, turns, end, diff, grades
    pending/aNNN.json        an attempt whose agent phase ended but which is not graded yet

Two phases. run_many first runs the agent phase of every attempt (in parallel), then grades them
one at a time. While a grader runs, the code under test can read the grader's files. Because no
agent runs after grading starts, and every grading is cleaned up before the next one, nothing a
grader shows can reach another attempt.

An attempt is INVALID (never counted) when its workspace was not clean, when a model reply or a
tool output mentions an answer or grader path, a network call, or the task's canary, or when a
symlink leaves the workspace. Read invalid transcripts: they are evidence too (row M7).
"""
from __future__ import annotations

import json
import re
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from g2_agent import run_agent
from g2_tasks import (check_isolation, diff_workspaces, grade, make_workspace, sandbox_for, sha256_dir,
                      symlinks_leaving)

# What must never show up in a model reply or a tool output. Word-level "solution" is allowed:
# models say it all the time. Paths to the answers and graders are not.
PATH_MARKERS = re.compile(r"/content\b|g2_private|g2_vault|\blab-f\b|/solutions?/|\bsolve\.sh\b|\btest_outputs\b")
NETWORK_MARKERS = re.compile(r"https?://|\bcurl\b|\bwget\b|\bpip3? install\b|\bgit clone\b|\burllib\b"
                             r"|\bsocket\b|\brequests\.(?:get|post)\b|\bhttp\.client\b")


def write_config(run_dir, config):
    run_dir = Path(run_dir)
    (run_dir / "transcripts").mkdir(parents=True, exist_ok=True)
    path = run_dir / "config.json"
    if path.exists():
        old = json.loads(path.read_text())
        changed = sorted(k for k in config if k in old and old[k] != config[k])
        if changed:
            raise ValueError(f"{run_dir} was started with a different {changed}. Use a new run folder.")
    path.write_text(json.dumps(config, indent=2, sort_keys=True))


def load_rows(run_dir):
    path = Path(run_dir) / "attempts.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_transcript(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def _observation_body(event):
    """The tool output without the line that only echoes the path the model asked for."""
    text = event.get("observation") or ""
    action = event.get("action", {}).get("name")
    if action == "run_tests":
        return text                                  # output of code the model wrote
    if action == "read_file" and not text.startswith("Error:"):
        return text.partition("\n")[2]               # the file content (or folder listing)
    return ""                                        # errors and write receipts echo the path only


def scan_for_leaks(events, canary=None):
    """Reasons to invalidate an attempt, from its transcript events (empty list = clean)."""
    reasons = []
    for e in events:
        if e.get("type") != "turn":
            continue
        reply, body = e.get("reply") or "", _observation_body(e)
        if canary and (canary in reply or canary in (e.get("observation") or "")):
            reasons.append(f"turn {e['turn']}: the canary appeared (possible leak)")
        for where, text in (("reply", reply), ("tool output", body)):
            m = PATH_MARKERS.search(text)
            if m:
                reasons.append(f"turn {e['turn']}: {where} mentions {m.group(0)!r} (an answer or grader path)")
        m = NETWORK_MARKERS.search(reply)
        if m:
            reasons.append(f"turn {e['turn']}: reply mentions {m.group(0)!r} (network use)")
    return reasons


def _pending_path(run_dir, attempt):
    return Path(run_dir) / "pending" / f"{attempt}.json"


def agent_phase(task, chat, run_dir, index, cfg):
    """Fresh workspace -> agent. Returns a pending record (to grade later) or an invalid row."""
    attempt = f"a{index:03d}"
    run_dir = Path(run_dir)
    (run_dir / "transcripts").mkdir(parents=True, exist_ok=True)
    rel = f"transcripts/{attempt}.jsonl"
    sandbox = sandbox_for(index)
    if cfg.get("require_sandbox") and not sandbox.active:
        raise RuntimeError("require_sandbox is set, but this process is not root on Linux, so model code "
                           "would run as you and could read the answers. Run the notebook on Colab.")
    sandbox.clean_shared_tmp()                    # leftovers of an earlier attempt with this user
    root = make_workspace(task, sandbox)
    problems = check_isolation(task, root)
    if problems:
        shutil.rmtree(root.parent, ignore_errors=True)
        return {"attempt": attempt, "valid": False, "invalid_reason": "; ".join(problems), "transcript": rel}
    seed = cfg["seed"] * 100000 + index
    meta = {k: cfg[k] for k in ("model_id", "revision", "temperature", "top_p", "backend") if k in cfg}
    meta["sandbox"] = sandbox.active
    try:
        summary = run_agent(task, root, chat, run_dir / rel, attempt_id=attempt, seed=seed,
                            max_turns=cfg["max_turns"], context_tokens=cfg["context_tokens"],
                            reply_tokens=cfg["reply_tokens"], test_timeout=cfg.get("test_timeout", 60),
                            meta=meta, sandbox=sandbox)
    except BaseException:
        shutil.rmtree(root.parent, ignore_errors=True)
        sandbox.clean_shared_tmp()
        raise
    sandbox.take_back(root.parent)               # root-owned and closed: nothing can change it now
    pending = {"attempt": attempt, "index": index, "seed": seed, "summary": summary,
               "workspace": str(root), "transcript": rel, "pending": True}
    path = _pending_path(run_dir, attempt)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(pending))
    return pending


def grade_phase(task, run_dir, pending, cfg):
    """Scan the transcript, diff the workspace, run every grader. Returns the summary row."""
    run_dir = Path(run_dir)
    root = Path(pending["workspace"])
    rel, sandbox = pending["transcript"], sandbox_for(pending["index"])
    try:
        events = load_transcript(run_dir / rel)
        reasons = scan_for_leaks(events, task.canary)
        reasons += [f"symlink leaves the workspace: {s}" for s in symlinks_leaving(root)]
        diff = diff_workspaces(task.app_dir, root)
        grades = {name: grade(task, root, name, timeout=cfg.get("grade_timeout", 180), sandbox=sandbox)
                  for name in task.graders}
        with open(run_dir / rel, "a", encoding="utf-8") as log:
            log.write(json.dumps({"type": "diff", **diff}) + "\n")
            for g in grades.values():
                log.write(json.dumps({"type": "grade", **g}) + "\n")
    finally:
        shutil.rmtree(root.parent, ignore_errors=True)
        sandbox.clean_shared_tmp()
    _pending_path(run_dir, pending["attempt"]).unlink(missing_ok=True)
    files = diff["changed"] + diff["added"] + diff["deleted"]
    return {**pending["summary"], "seed": pending["seed"], "valid": not reasons,
            "invalid_reason": "; ".join(reasons), "transcript": rel, "sandbox": sandbox.active,
            "files_changed": files, "touched_tests": any(f.startswith("tests/") for f in files),
            "rewards": {n: g["reward"] for n, g in grades.items()},
            "passed": {n: g["passed"] for n, g in grades.items()}}


def run_one(task, chat, run_dir, index, cfg):
    """One attempt, start to end: agent phase, then grading. Use run_many for real runs."""
    pending = agent_phase(task, chat, run_dir, index, cfg)
    if not pending.get("pending"):
        return pending
    return grade_phase(task, run_dir, pending, cfg)


def load_pending(run_dir):
    """Pending attempts whose frozen workspace still exists. Others are dropped and will rerun."""
    out = {}
    for path in sorted((Path(run_dir) / "pending").glob("a*.json")):
        record = json.loads(path.read_text())
        if Path(record["workspace"]).is_dir():
            out[record["attempt"]] = record
        else:
            path.unlink()
    return out


def run_many(task, chat, run_dir, *, n, concurrency, cfg, progress=print):
    """Run attempts 0..n-1 that are not in attempts.jsonl yet. Safe to call again after a disconnect.

    Phase 1 runs every agent. Phase 2 grades. No agent runs while or after a grader runs.
    """
    run_dir = Path(run_dir)
    if cfg.get("require_sandbox") and not sandbox_for(0).active:     # refuse before anything is saved
        raise RuntimeError("require_sandbox is set, but this process is not root on Linux. Run on Colab.")
    config = {**cfg, "task": task.name, "graders": {k: sha256_dir(v) for k, v in task.graders.items()},
              "sandbox": sandbox_for(0).active}
    write_config(run_dir, config)
    done = {row["attempt"] for row in load_rows(run_dir)}
    pending = {a: p for a, p in load_pending(run_dir).items() if a not in done}
    todo = [i for i in range(n) if f"a{i:03d}" not in done and f"a{i:03d}" not in pending]
    lock, started = threading.Lock(), time.time()
    progress(f"{len(done)} attempts already graded, {len(pending)} waiting for grading, "
             f"{len(todo)} to run, {concurrency} at a time.")

    def save(row):
        with lock, open(run_dir / "attempts.jsonl", "a", encoding="utf-8") as out:
            out.write(json.dumps(row) + "\n")

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        futures = {pool.submit(agent_phase, task, chat, run_dir, i, cfg): i for i in todo}
        for count, future in enumerate(as_completed(futures), 1):
            attempt = f"a{futures[future]:03d}"
            try:
                result = future.result()
            except Exception as error:  # a harness bug must not kill the other attempts
                result = {"attempt": attempt, "valid": False,
                          "invalid_reason": f"harness error: {type(error).__name__}: {error}"}
            if result.get("pending"):
                pending[attempt] = result
                progress(f"[agents {count}/{len(todo)}] {attempt} end={result['summary']['end_reason']} "
                         f"({time.time() - started:.0f} s so far; graded after all agents finish)")
            else:
                save(result)
                progress(f"[agents {count}/{len(todo)}] {attempt} INVALID: {result['invalid_reason'][:120]}")

    # One grading at a time: code under test in one grading cannot meet another grading's files.
    for count, (attempt, record) in enumerate(sorted(pending.items()), 1):
        try:
            row = grade_phase(task, run_dir, record, cfg)
        except Exception as error:
            row = {"attempt": attempt, "valid": False,
                   "invalid_reason": f"grading error: {type(error).__name__}: {error}"}
        save(row)
        progress(f"[graded {count}/{len(pending)}] {attempt} rewards={row.get('rewards')} "
                 f"valid={row.get('valid')} ({time.time() - started:.0f} s so far)")
    return sorted(load_rows(run_dir), key=lambda r: r["attempt"])


def render_transcript(path, max_chars=1200):
    """A readable view of one transcript for the notebook."""
    out = []
    for e in load_transcript(path):
        if e["type"] == "meta":
            out.append(f"== {e['attempt']}  task={e['task']}  seed={e['seed']}  model={e.get('model_id')}")
        elif e["type"] == "turn":
            act = e["action"]
            out.append(f"\n--- turn {e['turn']}: {act['name']} {act.get('path', '')}".rstrip())
            out.append("reply: " + _cut(e["reply"], max_chars))
            out.append("observation: " + _cut(e["observation"], max_chars // 2))
        elif e["type"] == "error":
            out.append(f"\n--- turn {e['turn']}: MODEL ERROR {e['error']}")
        elif e["type"] == "end":
            out.append(f"\n== end: {e['end_reason']} after {e['turns']} turns; finish message: {e['finish_message']!r}")
        elif e["type"] == "diff":
            out.append(f"== files changed: {e['changed'] + e['added'] + e['deleted']}")
        elif e["type"] == "grade":
            out.append(f"== grader {e['grader']}: reward {e['reward']} ({e['note']})")
    return "\n".join(out)


def _cut(text, n):
    text = text or ""
    return text if len(text) <= n else text[: n // 2] + f"\n[... {len(text) - n} characters cut ...]\n" + text[-n // 2:]
