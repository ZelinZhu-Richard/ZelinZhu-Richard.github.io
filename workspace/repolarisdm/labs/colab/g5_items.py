"""G5 items: load agent transcripts into one shape, so you and the judge read the same text.

Standard library only. An item is a dict:
    item_id     "labc-03", "g2-<file stem>" or "gold-2"
    source      "labc-synthetic", "g2" or "gold-synthetic"
    task        the ticket or instruction the agent got
    diff        the agent's final diff, or None
    transcript  Markdown text in Lab C's format
    outcome     "pass" / "fail" / ... from a grader, or None. NEVER shown to the judge.
    cluster     items in one cluster are correlated (same task); the bootstrap resamples clusters
    gold        only for gold items: {field: [accepted values]}

Sources:
- Lab C: 12 SYNTHETIC sessions ("Synthetic, written for practice. Not real Gemini output.").
- G2: your own attempts from the G2 notebook (real output of a local open model, not Gemini).
- Gold: 5 tiny SYNTHETIC sanity items with labels fixed by construction. Not part of kappa.
"""
import json
import re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
LABC_PATCHES = HERE.parent / "lab-c" / "patches"
GOLD_FILE = HERE / "g5_gold.json"
FINAL_HEADING = "## Agent (final message)"


# ---------- Lab C ----------

def load_labc(patches_dir=LABC_PATCHES):
    """One item per patches/NN folder: task.md, patch.diff, transcript.md."""
    items = []
    for d in sorted(Path(patches_dir).iterdir()):
        if not (d.is_dir() and (d / "transcript.md").exists()):
            continue
        items.append({
            "item_id": f"labc-{d.name}",
            "source": "labc-synthetic",
            "task": (d / "task.md").read_text(encoding="utf-8").strip(),
            "diff": (d / "patch.diff").read_text(encoding="utf-8").strip(),
            "transcript": (d / "transcript.md").read_text(encoding="utf-8").strip(),
            "outcome": None,
            "cluster": f"labc-{d.name}",
            "path": str(d),
        })
    if not items:
        raise FileNotFoundError(f"no Lab C transcripts under {patches_dir}")
    return items


# ---------- Gold sanity items ----------

def load_gold(path=GOLD_FILE):
    items = json.loads(Path(path).read_text(encoding="utf-8"))
    for it in items:
        it.setdefault("outcome", None)
        it.setdefault("cluster", it["item_id"])
    return items


# ---------- G2 transcripts (JSONL, JSON or Markdown) ----------

_TEXT_KEYS = ("content", "text", "message", "thought", "response")
_CMD_KEYS = ("command", "cmd", "bash", "action")
_OUT_KEYS = ("output", "observation", "stdout", "result")
_EXIT_KEYS = ("exit_code", "returncode", "rc")
_OUTCOME_KEYS = ("outcome", "passed", "reward", "success")
_TASK_ID_KEYS = ("task_id", "problem_id", "task_name", "problem")
_TASK_TEXT_KEYS = ("instruction", "task_text", "prompt_text")


def _text(v):
    """Content may be a string or a list of OpenAI-style parts."""
    if v is None:
        return ""
    if isinstance(v, list):
        return "\n".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in v)
    return str(v)


def _first(d, keys):
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return None


def outcome_of(meta):
    """Turn whatever the G2 grader wrote into pass/fail. None if it wrote nothing we know."""
    if not isinstance(meta, dict):
        return None
    for k in ("outcome", "result", "status"):
        v = meta.get(k)
        if isinstance(v, str) and v.strip().lower() in ("pass", "fail", "timeout", "infra_error", "invalid"):
            return v.strip().lower()
    for k in ("passed", "success"):
        if isinstance(meta.get(k), bool):
            return "pass" if meta[k] else "fail"
    r = meta.get("reward")
    if isinstance(r, (int, float)) and not isinstance(r, bool):
        return "pass" if r >= 1.0 - 1e-9 else "fail"
    return None


def _tool_call_command(ev):
    """OpenAI-style assistant message: {"tool_calls": [{"function": {"arguments": "{\"command\": ...}"}}]}."""
    calls = ev.get("tool_calls") or []
    cmds = []
    for c in calls if isinstance(calls, list) else []:
        args = (c.get("function") or {}).get("arguments") if isinstance(c, dict) else None
        try:
            args = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError:
            pass
        cmds.append(_first(args, ("command", "cmd")) if isinstance(args, dict) else args)
    cmds = [str(c) for c in cmds if c]
    return " && ".join(cmds) if cmds else None


_FENCE = re.compile(r"```(?:bash|sh|shell|console|mswea_bash_command)[ \t]*\n(.*?)```", re.S)


def _fenced_command(text):
    """Text-format agents put the command in a fenced bash block. Return (text without it, command)."""
    blocks = _FENCE.findall(text or "")
    if not blocks:
        return text, None
    cmd = "\n".join(l[2:] if l.startswith("$ ") else l for b in blocks for l in b.strip().splitlines())
    return _FENCE.sub("", text).strip(), cmd


_GRADE_TYPES = ("result", "grade", "grader", "verifier", "reward", "score")
_HIDDEN_TYPES = _GRADE_TYPES + ("meta", "end", "diff", "config", "summary")


def _is_meta_only(ev):
    """A grade or bookkeeping record (or one with a grade and no text or command): never shown to the judge."""
    if str(ev.get("type", ev.get("role", ""))).lower() in _HIDDEN_TYPES:
        return True
    has_body = any(_first(ev, keys) is not None for keys in (_TEXT_KEYS, _CMD_KEYS, _OUT_KEYS))
    return not has_body and any(k in ev for k in _OUTCOME_KEYS)


def render_events(events):
    """Render G2 events in Lab C's Markdown format. The last agent text becomes the final message."""
    body = [ev for ev in events if isinstance(ev, dict) and not _is_meta_only(ev)]
    rows = []                                              # (role, text, cmd, out, code) per event
    for ev in body:
        role = str(ev.get("role", ev.get("type", ev.get("event", "event")))).lower()
        text = _text(_first(ev, _TEXT_KEYS)).strip()
        cmd = _first(ev, _CMD_KEYS) or _tool_call_command(ev)
        if cmd is None and role in ("assistant", "agent"):
            text, cmd = _fenced_command(text)              # text-format agents: ```bash ... ```
        rows.append([role, text, cmd, _first(ev, _OUT_KEYS), _first(ev, _EXIT_KEYS)])
    seen_user = False
    for r in rows:                                         # observations sent back as later user messages
        if r[0] == "user":
            if seen_user and r[3] is None:
                r[0], r[3], r[1] = "tool", r[1], ""
            seen_user = True
    last_agent = max((i for i, (role, text, cmd, _, _) in enumerate(rows)
                      if role in ("assistant", "agent") and text and cmd is None), default=None)
    parts = []
    for i, (role, text, cmd, out, code) in enumerate(rows):
        if role in ("tool", "observation", "function", "ipython") and out is None and cmd is None:
            out, text = text, ""                           # OpenAI-style tool message: content is output
        if i == last_agent:
            parts.append(f"{FINAL_HEADING}\n\n{text}")
            continue
        if role in ("system", "user"):
            parts.append(f"## {role.capitalize()}\n\n{text}")
            continue
        if text and role in ("assistant", "agent"):
            parts.append(f"**Agent:** {text}")
        if cmd is not None:
            block = f"$ {_text(cmd).strip()}"
            if out is not None:
                block += "\n" + _text(out).rstrip()
            if code is not None:
                block += f"\n[exit code {code}]"
            parts.append(f"**Tool call: shell**\n\n```console\n{block}\n```")
        elif out is not None:
            exit_note = f"\n[exit code {code}]" if code is not None else ""
            parts.append(f"**Tool output**\n\n```console\n{_text(out).rstrip()}{exit_note}\n```")
        elif text and role not in ("assistant", "agent"):
            parts.append(f"**{role}:** {text}")
    return "\n\n".join(parts)


# ---------- G2's own format (g2_agent.py: meta, prompt, turn, error, end, diff, grade events) ----------

G2_GRADER_ORDER = ("private", "strong", "weak")     # the first one present decides the outcome
G2_MAX_REPLY, G2_MAX_OBS = 2500, 2000                # per-turn caps; the final diff shows the net change


def is_g2(events):
    return any(isinstance(e, dict) and e.get("type") == "turn" and "reply" in e and "action" in e
               for e in events)


def _cap(text, n, what):
    text = (text or "").rstrip()
    if len(text) <= n:
        return text
    return text[: n // 2] + f"\n[... {len(text) - n} characters of {what} cut by g5_items ...]\n" + text[-n // 2:]


def render_g2(events):
    """Render a G2 transcript in Lab C's format. Grades, diff and bookkeeping stay hidden."""
    parts, finish, end = [], None, None
    names = {"read_file": "read", "write_file": "write", "run_tests": "run_tests"}
    for e in events:
        t = e.get("type") if isinstance(e, dict) else None
        if t == "prompt" and str(e.get("role")) == "user":
            parts.append("## User\n\n(The first user message is the task text shown above, "
                         "under 'Task given to the agent'.)")      # not repeated: it costs context
        elif t == "prompt":
            parts.append(f"## {str(e.get('role', 'user')).capitalize()}\n\n{str(e.get('content', '')).strip()}")
        elif t == "turn":
            a = e.get("action") or {}
            name = a.get("name", "invalid")
            reply = str(e.get("reply") or "").strip()
            if name == "finish":
                before = reply.split("<finish", 1)[0].strip()
                if before:
                    parts.append(f"**Agent (turn {e.get('turn')}):** {_cap(before, G2_MAX_REPLY, 'the reply')}")
                finish = str(a.get("message") or "")
                continue
            parts.append(f"**Agent (turn {e.get('turn')}):** {_cap(reply, G2_MAX_REPLY, 'the reply')}")
            tool = names.get(name, "invalid action")
            if name in ("read_file", "write_file"):
                tool += f" `{a.get('path', '')}`"
            obs = _cap(e.get("observation"), G2_MAX_OBS, "tool output")
            parts.append(f"**Tool call: {tool}**\n\n````console\n{obs}\n````")   # 4 backticks: obs may hold ```
        elif t == "error":
            parts.append(f"**Harness:** model error at turn {e.get('turn')}: {str(e.get('error', ''))[:300]}")
        elif t == "end":
            end = e
    if finish is not None:
        parts.append(f"{FINAL_HEADING}\n\n{finish}")
    elif end is not None:
        parts.append(f"**Harness:** the attempt ended without a finish action "
                     f"({end.get('end_reason')}, after {end.get('turns')} turns).")
    return "\n\n".join(parts)


def g2_outcome(events):
    """(outcome, grader name, {grader: reward}) from G2's grade events; (None, None, {}) if there are none."""
    grades = {e.get("grader"): e for e in events if isinstance(e, dict) and e.get("type") == "grade"}
    rewards = {k: v.get("reward") for k, v in grades.items()}
    for name in list(G2_GRADER_ORDER) + sorted(k for k in grades if k not in G2_GRADER_ORDER):
        if name in grades:
            g = grades[name]
            passed = g.get("passed")
            if not isinstance(passed, bool):
                passed = isinstance(g.get("reward"), (int, float)) and g["reward"] >= 1.0 - 1e-9
            return ("pass" if passed else "fail"), name, rewards
    return None, None, rewards


def _read_events(path):
    """Return (events, meta) from a .jsonl or .json transcript file."""
    if path.suffix == ".jsonl":
        events = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        return events, {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data, {}
    for key in ("events", "messages", "turns", "transcript", "trajectory"):
        if isinstance(data.get(key), list):
            return data[key], {k: v for k, v in data.items() if k != key}
    raise ValueError(f"{path}: no list of events found")


def load_g2(g2_dir):
    """One item per transcript file in g2_dir (searched recursively).

    Accepted files: *.jsonl (one JSON event per line), *.json (a list of events, or an object with an
    "events"/"messages"/"turns" list), *.md (already rendered).
    Grade and task id: a record inside the transcript, or a sidecar <stem>.result.json / <stem>.meta.json,
    or result.json / meta.json / reward.json in a folder that holds only one transcript.
    Final diff (optional): <stem>.diff or <stem>.patch, or patch.diff / final.diff in such a folder.
    If your G2 files use other key names, adapt render_events, then check one item with `show`.
    """
    root = Path(g2_dir)
    if not root.is_dir():
        raise FileNotFoundError(f"G2 folder not found: {root}")
    items = []
    folder_files = {"result.json", "meta.json", "reward.json"}
    not_transcripts = folder_files | {"attempts.jsonl", "labels.jsonl", "config.json", "results.md"}
    sidecar = re.compile(r"\.(result|meta)\.json$")
    cands = [p for p in sorted(root.rglob("*"))
             if p.is_file() and p.suffix in (".jsonl", ".json", ".md") and not sidecar.search(p.name)
             and p.name not in not_transcripts and not p.name.startswith(".")
             and not p.name.upper().startswith("README")]
    per_folder = Counter(p.parent for p in cands)
    for p in cands:
        alone = per_folder[p.parent] == 1
        meta = {}
        names = [f"{p.stem}.result.json", f"{p.stem}.meta.json"] + (sorted(folder_files) if alone else [])
        for name in names:
            f = p.parent / name
            if f.exists():
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    continue
                if isinstance(data, dict):
                    meta = {**data, **meta}
        if p.suffix == ".md":
            transcript, events = p.read_text(encoding="utf-8").strip(), []
            if FINAL_HEADING not in transcript and "**Tool call:" not in transcript:
                continue                                   # a note, not a rendered transcript
        else:
            try:
                events, inline_meta = _read_events(p)
            except (ValueError, json.JSONDecodeError):
                continue                                   # not a transcript (e.g. a summary file)
            side_outcome = outcome_of(meta)                # a sidecar file beats records inside the transcript
            if is_g2(events):
                outcome, grader, _ = g2_outcome(events)
                g2meta = next((e for e in events if isinstance(e, dict) and e.get("type") == "meta"), {})
                diff_ev = next((e for e in events if isinstance(e, dict) and e.get("type") == "diff"), {})
                meta = {"task_id": g2meta.get("task"), **meta}
                if side_outcome is None and outcome is not None:
                    meta["outcome"], meta["grader"] = outcome, grader
                if diff_ev.get("patch"):
                    meta["_diff"] = diff_ev["patch"]
                transcript = render_g2(events)
            else:
                inline = dict(inline_meta)
                for ev in events:                          # grade records inside the transcript
                    if isinstance(ev, dict) and _is_meta_only(ev):
                        inline.update(ev)
                meta = {**inline, **meta}
                if side_outcome is not None:
                    meta["outcome"] = side_outcome
                transcript = render_events(events)
        if not transcript.strip():
            continue                                       # e.g. a results file with grades only
        task = _first(meta, _TASK_TEXT_KEYS)
        if task is None:
            first_user = next((e for e in events if isinstance(e, dict)
                               and str(e.get("role", "")).lower() == "user"), None)
            task = _text(_first(first_user, _TEXT_KEYS)) if first_user else "See the first user message."
        task_id = _first(meta, _TASK_ID_KEYS)
        if task_id is None and isinstance(meta.get("task"), str) and len(meta["task"]) < 80:
            task_id = meta["task"]
        diff_names = [f"{p.stem}.diff", f"{p.stem}.patch"] + (["patch.diff", "final.diff"] if alone else [])
        diff_path = next((p.parent / n for n in diff_names if (p.parent / n).exists()), p.parent / diff_names[0])
        rel = p.relative_to(root).with_suffix("")
        items.append({
            "item_id": "g2-" + re.sub(r"[^A-Za-z0-9_.-]+", "_", str(rel)),
            "source": "g2",
            "task": str(task).strip(),
            "diff": (diff_path.read_text(encoding="utf-8").strip() if diff_path.exists()
                     else (meta.get("_diff") or "").strip() or None),
            "transcript": transcript,
            "outcome": outcome_of(meta),
            "cluster": f"task:{task_id}" if task_id is not None else "g2-" + p.stem,
            "grader": meta.get("grader"),
            "path": str(p),
        })
    return items


# ---------- Reading a transcript ----------

def final_message(transcript):
    """The agent's final message: everything after the final-message heading."""
    i = transcript.rfind(FINAL_HEADING)
    return transcript[i + len(FINAL_HEADING):].strip() if i >= 0 else ""


def without_final_message(transcript):
    i = transcript.rfind(FINAL_HEADING)
    return transcript[:i].rstrip() if i >= 0 else transcript


_EDIT_TOOL = re.compile(r"^\*\*Tool call: (edit|write)\b")
_SHELL_TOOL = re.compile(r"^\*\*Tool call: shell\*\*")
_CHECK_TOOL = re.compile(r"^\*\*Tool call: run_tests\*\*")          # G2's run_tests action
_CHECK = [
    re.compile(r"\b(pytest|py\.test|unittest|tox|nox)\b"),
    re.compile(r"\bpython[0-9.]*\s+(-u\s+)?(-c\b|-m\s+(?!pip\b|venv\b|ensurepip\b|http\.server\b)\w|[\w./-]+\.py\b)"),
    re.compile(r"\b(node\s+\S|go\s+test|cargo\s+test|npm\s+(run\s+)?test|make\s+test)"),
    re.compile(r"\btest\.sh\b"),
]
_EDIT_CMD = [
    re.compile(r"(?<![0-9&>])>{1,2}\s*(?!&|/dev/null|/tmp/)(?=[\w./-]*[A-Za-z])[\w.-][\w./-]*"),  # > file
    re.compile(r"\bsed\s+(-[a-zA-Z]*\s+)*-i"),
    re.compile(r"\b(tee|patch)\b"),
    re.compile(r"\bgit\s+(?:(?:apply|am|cherry-pick|restore|merge|reset)\b|checkout\s+(?:\S+\s+)?--\s)"),
    re.compile(r"\b(write_text|write_bytes)\(|open\([^)]*['\"][wa]\+?['\"]"),
]


def _first_match(patterns, cmd):
    hits = [m.start() for p in patterns for m in [p.search(cmd)] if m]
    return min(hits) if hits else None


def events(transcript):
    """Ordered list of ("edit" | "check" | "other", text) from a Lab C-format transcript.

    Edit tool calls count as edits. If the transcript has no edit tool calls (G2 agents edit through
    the shell), shell commands that write files count as edits. This is a heuristic, not a parser.
    """
    lines = transcript.splitlines()
    uses_edit_tool = any(_EDIT_TOOL.match(l) for l in lines)
    out, in_shell, in_block = [], False, False
    for line in lines:
        if _EDIT_TOOL.match(line):
            out.append(("edit", line))
            in_shell = False
            continue
        if _CHECK_TOOL.match(line):
            out.append(("check", line))
            in_shell = False
            continue
        if _SHELL_TOOL.match(line):
            in_shell = True
            continue
        if line.startswith("```"):
            in_block = not in_block
            if not in_block:
                in_shell = False
            continue
        if in_shell and in_block and line.startswith("$ "):
            cmd = line[2:]
            e = None if uses_edit_tool else _first_match(_EDIT_CMD, cmd)
            c = _first_match(_CHECK, cmd)
            if c is not None and re.search(r"--version\b|\s-V\b", cmd):
                c = None
            seq = sorted([(pos, kind) for pos, kind in ((e, "edit"), (c, "check")) if pos is not None])
            out += [(kind, cmd) for _, kind in seq] or [("other", cmd)]
    return out


def mechanical_checked_after_last_edit(transcript):
    """The deterministic version of the checked_after_last_edit field: "yes" or "no"."""
    ev = events(without_final_message(transcript))
    last_edit = max((i for i, (k, _) in enumerate(ev) if k == "edit"), default=None)
    if last_edit is None:
        return "no"
    return "yes" if any(k == "check" for k, _ in ev[last_edit + 1:]) else "no"


# ---------- Fitting long text into the judge's context ----------

def cut_middle(text, keep_chars, head_share=0.4):
    if keep_chars >= len(text):
        return text
    head = int(keep_chars * head_share)
    tail = keep_chars - head
    cut = len(text) - keep_chars
    return (text[:head] + f"\n\n[... {cut} characters cut by the notebook to fit the judge's context ...]\n\n"
            + (text[-tail:] if tail > 0 else ""))


def fit_text(text, max_tokens, count_tokens):
    """Return (text, truncated). Cuts the middle, keeps the start (task) and the end (final message)."""
    if count_tokens(text) <= max_tokens:
        return text, False
    lo, hi = 0, len(text)
    while lo < hi:                                         # largest keep that fits
        mid = (lo + hi + 1) // 2
        if count_tokens(cut_middle(text, mid)) <= max_tokens:
            lo = mid
        else:
            hi = mid - 1
    return cut_middle(text, lo), True


def approx_tokens(text):
    """CPU stand-in for a tokenizer: about 3.5 characters per token for English, code and logs."""
    return int(len(text) / 3.5) + 1


def clusters_for(items, min_tasks=5):
    """Bootstrap units: {item_id: unit} and a sentence that states the frame.

    Several attempts at one task are correlated. With at least `min_tasks` G2 tasks we resample tasks.
    With fewer (G2 usually runs one task) tasks cannot be resampled, so we resample transcripts, and
    the interval then speaks only about these tasks.
    """
    g2_tasks = {i["cluster"] for i in items if i["source"] == "g2"}
    by_task = len(g2_tasks) >= min_tasks
    units = {i["item_id"]: (i["cluster"] if by_task else i["item_id"]) for i in items}
    if by_task:
        frame = f"bootstrap units: {len(g2_tasks)} G2 tasks (all attempts of a task move together) + each Lab C item"
    else:
        frame = (f"bootstrap units: single transcripts. G2 covers {len(g2_tasks)} task(s), too few to resample "
                 "tasks, so the interval speaks only about transcripts of these tasks.")
    return units, frame


def summary(items):
    """One line per source: count, transcript length, grader outcomes."""
    by = {}
    for it in items:
        by.setdefault(it["source"], []).append(it)
    lines = []
    for src, its in by.items():
        lens = sorted(len(it["transcript"]) for it in its)
        outs = Counter(it["outcome"] for it in its if it["outcome"] is not None)
        lines.append(f"{src:15s} n={len(its):3d}  transcript chars median={lens[len(lens) // 2]:6d} "
                     f"max={lens[-1]:6d}  grader outcomes={dict(outs) or 'none'}")
    return "\n".join(lines)
