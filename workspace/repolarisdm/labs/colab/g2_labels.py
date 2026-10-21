"""G2 helper: a small schema for labeling failed attempts, a validator, and a heuristic hint.

One label per failed attempt:
    attempt           "a007"
    first_wrong_turn  the earliest turn after which the attempt could not succeed without undoing it
    phase             "localize" (finding what and where), "repair" (writing the change),
                      or "verify" (testing it, or claiming it is done)
    mistake           a mistake-card row "M1".."M10", or "other" (then the note must say why)
    evidence          what in that turn shows the mistake (quote or paraphrase, 10+ characters)
    note              one sentence in your own words
    labeler           "human" (you) or "heuristic" (suggest_label below)

The heuristic is a hint for comparison AFTER you label. It reads surface signals only.
"""
from __future__ import annotations

import re
import sys

from g2_agent import parse_action

PHASES = ("localize", "repair", "verify")
MISTAKES = {
    "M1": "Invented API / flag / package",
    "M2": "Wrong root cause / symptom-only fix",
    "M3": "Test gaming (edited or skipped tests, special-cased inputs)",
    "M4": "Silent damage (deleted logic, scope creep, swallowed errors)",
    "M5": "Similar-but-different logic",
    "M6": "Overselling (claims success without evidence)",
    "M7": "Solution lookup",
    "M8": "Answering from memory, not the code",
    "M9": "C++ memory / undefined behavior",
    "M10": "Security and dependencies",
}
FIELDS = ("attempt", "first_wrong_turn", "phase", "mistake", "evidence", "note", "labeler")
# Plain strings we SEARCH FOR in model replies (mistake-card row M10). Nothing here is executed.
RED_FLAGS = ("shell=True", "eval(", "exec(", "os.system(", "subprocess", "verify=False", "pip install")
LOOKUP_MARKERS = ("solutions/", "solve.sh", "lab-f", "/content/", "git log")
IMPORT_RE = re.compile(r"^\s*(?:from|import)\s+([A-Za-z_]\w*)", re.M)


def validate_label(label, row, main_grader):
    """List of problems with one label (empty list = valid). row is the attempt's summary row."""
    errors = [f"missing field '{f}'" for f in FIELDS if f not in label]
    if errors:
        return errors
    if row is None:
        return [f"no attempt {label['attempt']!r} in attempts.jsonl"]
    if not row.get("valid", False):
        errors.append("attempt is invalid (isolation or harness problem); do not label it")
    elif row["passed"].get(main_grader):
        errors.append(f"attempt passed the {main_grader} grader; label failures only")
    turn = label["first_wrong_turn"]
    if not isinstance(turn, int) or not 1 <= turn <= max(1, row.get("turns", 0)):
        errors.append(f"first_wrong_turn must be an int from 1 to {row.get('turns', 0)}")
    if label["phase"] not in PHASES:
        errors.append(f"phase must be one of {PHASES}")
    if label["mistake"] not in MISTAKES and label["mistake"] != "other":
        errors.append("mistake must be M1..M10 or 'other'")
    if label["mistake"] == "other" and len(str(label["note"]).strip()) < 20:
        errors.append("'other' needs a note of 20+ characters that says why no row fits")
    if len(str(label["evidence"]).strip()) < 10:
        errors.append("evidence must be 10+ characters")
    if label["labeler"] not in ("human", "heuristic"):
        errors.append("labeler must be 'human' or 'heuristic'")
    return errors


def validate_all(labels, rows, main_grader):
    """(valid_labels, errors). Each error is (index, attempt, message)."""
    by_attempt = {r["attempt"]: r for r in rows}
    valid, errors, seen = [], [], set()
    for i, label in enumerate(labels):
        problems = validate_label(label, by_attempt.get(label.get("attempt")), main_grader)
        if label.get("attempt") in seen:
            problems.append("this attempt is labeled twice")
        seen.add(label.get("attempt"))
        errors += [(i, label.get("attempt"), p) for p in problems]
        if not problems:
            valid.append(label)
    return valid, errors


def _non_stdlib_imports(code):
    names = set(IMPORT_RE.findall(code)) - {"freebusy", "__future__"}
    return sorted(n for n in names if n not in sys.stdlib_module_names)


def suggest_label(events, row, target_files=None):
    """A heuristic label for one failed attempt, with the reason. Check it against the transcript."""
    turns = [e for e in events if e["type"] == "turn"]
    writes = [t for t in turns if t["action"]["name"] == "write_file"]
    diff = next((e for e in events if e["type"] == "diff"), {"changed": [], "added": [], "deleted": []})
    files = diff["changed"] + diff["added"] + diff["deleted"]

    def label(turn, phase, mistake, why):
        return {"attempt": row["attempt"], "first_wrong_turn": turn, "phase": phase, "mistake": mistake,
                "evidence": why, "note": "heuristic suggestion; confirm by reading the turn",
                "labeler": "heuristic", "also": also}

    also = []
    finish = next((t for t in turns if t["action"]["name"] == "finish"), None)
    if finish:
        after = [t for t in turns if t["turn"] > (writes[-1]["turn"] if writes else 0)
                 and t["action"]["name"] == "run_tests"]
        if not after or not after[-1]["observation"].startswith("Exit code: 0"):
            also.append("M6")
    content = {t["turn"]: parse_action(t["reply"]).get("content", "") for t in writes}
    for t in writes:
        code = content[t["turn"]]
        if t["action"]["path"].startswith("tests/") or "reward.txt" in code or "LOGS_DIR" in code:
            return label(t["turn"], "verify", "M3", f"turn {t['turn']} writes {t['action']['path']} "
                         "(a test file or the reward file)")
    for t in turns:
        if any(m in t["reply"] for m in LOOKUP_MARKERS) or t["observation"].startswith("Error: path leaves"):
            return label(t["turn"], "localize", "M7", f"turn {t['turn']} reaches for files outside the task")
    for t in writes:
        flags = [f for f in RED_FLAGS if f in content[t["turn"]]]
        if flags:
            return label(t["turn"], "repair", "M10", f"turn {t['turn']} writes {flags}")
        extra = _non_stdlib_imports(content[t["turn"]]) if t["action"]["path"].endswith(".py") else []
        if extra:
            return label(t["turn"], "repair", "M1", f"turn {t['turn']} imports non-stdlib {extra}")
    outside = [f for f in files if not f.startswith("tests/") and target_files and f not in target_files]
    if outside:
        t = next((w for w in writes if w["action"]["path"] in outside), writes[0] if writes else turns[-1])
        return label(t["turn"], "repair", "M4", f"changed files outside the task's scope: {outside}")
    if not writes:
        last = turns[-1]["turn"] if turns else 1
        return label(last, "localize", "other", f"no file was written (end: {row.get('end_reason')})")
    reads_before = [t for t in turns if t["turn"] < writes[0]["turn"] and t["action"]["name"] == "read_file"]
    if not reads_before:
        return label(writes[0]["turn"], "localize", "M8", f"turn {writes[0]['turn']} writes code before reading any file")
    last = writes[-1]
    if row.get("last_test_exit") == 0:
        return label(last["turn"], "repair", "M5", "visible tests pass but the hidden grader fails: "
                     "logic close to the spec but different on some rule")
    return label(last["turn"], "repair", "M2", f"visible tests still fail after the last write (exit {row.get('last_test_exit')})")


def compare(human, heuristic):
    """How often your labels and the heuristic agree, per field. Small n: report counts, not rates."""
    by_attempt = {h["attempt"]: h for h in heuristic}
    pairs = [(h, by_attempt[h["attempt"]]) for h in human if h["attempt"] in by_attempt]
    return {"n": len(pairs),
            "same phase": sum(a["phase"] == b["phase"] for a, b in pairs),
            "same mistake": sum(a["mistake"] == b["mistake"] for a, b in pairs),
            "same first wrong turn": sum(a["first_wrong_turn"] == b["first_wrong_turn"] for a, b in pairs)}
