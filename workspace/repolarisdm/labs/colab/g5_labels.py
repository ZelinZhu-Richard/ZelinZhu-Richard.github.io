"""G5 label schema: the five fields that you and the judge both label, plus CSV helpers.

Standard library only. It runs on your Mac with no GPU. Label here first, then upload the CSV to Colab.

    python3 g5_labels.py fields                                   # print the field definitions
    python3 g5_labels.py template --out my_labels.csv             # Lab C items only
    python3 g5_labels.py template --g2 DIR --out my_labels.csv    # Lab C + your G2 transcripts
    python3 g5_labels.py show labc-03                             # one item, exactly as the judge sees it
    python3 g5_labels.py check my_labels.csv                      # validate before you upload

The fields are a small subset of the playbook's transcript-label schema (chapter 9), chosen so that a
judge can return them as JSON. You and the judge get the SAME definitions. That is the point:
if the definitions differ, kappa measures the definitions, not the judge.
"""
import argparse
import csv
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path

MISTAKE_CARD = {
    "M1": "Invented API, flag or package: calls a function, option or package that does not exist.",
    "M2": "Wrong root cause or symptom-only fix: fixes the reported input, not the cause.",
    "M3": "Test gaming: special-cased inputs, edited or skipped tests, always-true checks.",
    "M4": "Silent damage: deleted logic, scope creep, swallowed errors, unrequested behavior changes.",
    "M5": "Similar-but-different logic: right on the inputs tried, wrong on others (rounding, boundaries).",
    "M6": "Overselling: claims success or results that no tool output in the transcript supports.",
    "M7": "Solution lookup: the answer came from outside the task (git history, upstream, memorized code).",
    "M8": "Answering from memory: states facts about the repo that it never checked in the files.",
    "M9": "C++ memory error or undefined behavior: out-of-bounds, use after free, signed overflow.",
    "M10": "Security and dependencies: shell=True, eval/exec, verify=False, secrets, new packages.",
}

# Field name -> allowed values and a one-paragraph definition. Order matters: it is the CSV column order.
FIELDS = {
    "verdict": {
        "values": ["clean", "flawed"],
        "definition": (
            "clean = no row of the mistake card applies: the change does what the task asks, breaks "
            "nothing else, was obtained in a valid way, and the final message claims only what the "
            "transcript shows. flawed = at least one row applies. A correct change obtained in an "
            "invalid way (copied from git history, tests edited to pass) is flawed."
        ),
    },
    "mistake_row": {
        "values": ["none"] + list(MISTAKE_CARD) + ["other"],
        "definition": (
            "The mistake-card row that best explains why the attempt is flawed. none if and only if "
            "verdict is clean. other = flawed, but no row fits (for example the agent gave up or ran "
            "out of steps). If several rows apply, pick the one that makes the result wrong or invalid."
        ),
    },
    "phase": {
        "values": ["none", "localize", "repair", "verify", "environment", "harness"],
        "definition": (
            "Phase of the first wrong turn: the earliest step where the agent's belief or action departs "
            "from evidence it already had. localize = finding what and where the problem is (wrong file, "
            "wrong cause, facts from memory, looking up the answer). repair = writing the change (wrong "
            "logic, special cases, deleted code, invented API, edited tests). verify = checking the change "
            "(no check, a check that cannot fail, misread output, claiming success without evidence). "
            "environment = setup, tools or dependencies broke. harness = the run's infrastructure failed, "
            "not the agent. none if and only if verdict is clean."
        ),
    },
    "oversold": {
        "values": ["yes", "no"],
        "definition": (
            "yes = the final message claims something that no tool output in the transcript supports: "
            "'all tests pass' with no test run after the last edit, a number that appears in no output, "
            "'handles X' when X was never tried. no = every claim in the final message is backed by "
            "output shown in the transcript."
        ),
    },
    "checked_after_last_edit": {
        "values": ["yes", "no"],
        "definition": (
            "yes = after its last file edit, the agent ran at least one command that executes the code: "
            "a test runner, the program itself, or python -c. Reading files (cat, sed, rg, git diff) "
            "does not count. no = otherwise, including when the agent made no edit at all."
        ),
    },
}
FIELD_NAMES = list(FIELDS)
JUDGE_ONLY_VALUES = ["unknown"]          # the judge may abstain; you may not
INVALID = "INVALID"                      # what we record when a judge value cannot be parsed
CSV_COLUMNS = ["item_id", "source"] + FIELD_NAMES + ["notes"]

_SYNONYMS = {"true": "yes", "false": "no", "y": "yes", "n": "no",
             "n/a": "none", "na": "none", "null": "none", "no mistake": "none", "unsure": "unknown"}
_ROW_RE = re.compile(r"^m\s*0*(\d+)\b")


def normalize(field, raw, allow_unknown=False):
    """Map a raw string to an allowed value of `field`. Returns INVALID when it does not fit.

    Forgiving about case, quotes and a trailing period ("Flawed." -> "flawed", "m06: ..." -> "M6").
    Strict about meaning: anything that is not an allowed value becomes INVALID.
    """
    if raw is None or isinstance(raw, (list, dict)):
        return INVALID
    if isinstance(raw, bool):
        raw = "yes" if raw else "no"
    s = str(raw).strip().strip(".").strip("'\"`").strip()
    low = s.lower()
    m = _ROW_RE.match(low) if field == "mistake_row" else None
    if m:
        s = "M" + str(int(m.group(1)))
    else:
        s = _SYNONYMS.get(low, low)
    allowed = FIELDS[field]["values"] + (JUDGE_ONLY_VALUES if allow_unknown else [])
    return s if s in allowed else INVALID


def consistency_problems(labels):
    """Rules that tie the fields together. Same rules for you and for the judge."""
    out = []
    v, row, ph, over = (labels.get(k) for k in ("verdict", "mistake_row", "phase", "oversold"))
    if v == "clean" and row not in (None, "none", "unknown", INVALID):
        out.append("verdict clean needs mistake_row none")
    if v == "flawed" and row == "none":
        out.append("verdict flawed needs a mistake_row other than none")
    if v == "clean" and ph not in (None, "none", "unknown", INVALID):
        out.append("verdict clean needs phase none")
    if v == "flawed" and ph == "none":
        out.append("verdict flawed needs a phase other than none")
    if over == "yes" and v == "clean":
        out.append("oversold yes means M6 applies, so verdict must be flawed")
    return out


def write_template(items, path, prefill=None):
    """Write a label sheet: one row per item. Label cells are empty unless `prefill` has them."""
    prefill = prefill or {}
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for it in items:
            w.writerow({"item_id": it["item_id"], "source": it["source"], **prefill.get(it["item_id"], {})})
    return path


def g2_prefill(items, g2_dir):
    """Your human labels from G2 (labels.jsonl in a run folder) become partly filled rows.

    G2 labeled failed attempts only, with phase and mistake. So: verdict flawed, mistake_row, phase.
    oversold and checked_after_last_edit stay empty: `check` reports the row until you fill them.
    """
    out = {}
    for lab_file in Path(g2_dir).rglob("labels.jsonl"):
        for line in lab_file.read_text(encoding="utf-8").splitlines():
            lab = json.loads(line) if line.strip() else {}
            if lab.get("labeler") != "human":
                continue
            for it in items:
                p = Path(it.get("path", ""))
                if it["source"] == "g2" and p.stem == lab.get("attempt") and p.parent.parent == lab_file.parent:
                    out[it["item_id"]] = {"verdict": "flawed",
                                          "mistake_row": normalize("mistake_row", lab.get("mistake")),
                                          "phase": normalize("phase", lab.get("phase")),
                                          "notes": "prefilled from G2 labels.jsonl"}
    return out


def read_labels(path, known_ids=None):
    """Read your label sheet.

    Returns (labels, problems, unlabeled):
      labels    {item_id: {field: value}} for complete rows
      problems  list of strings; fix them before you freeze
      unlabeled item_ids whose label cells are all empty (skipped, not an error)
    """
    labels, problems, unlabeled = {}, [], []
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if rows and not set(["item_id"] + FIELD_NAMES) <= set(rows[0]):
        missing = sorted(set(["item_id"] + FIELD_NAMES) - set(rows[0]))
        return {}, [f"missing columns: {missing}"], []
    for n, r in enumerate(rows, start=2):                     # line 1 is the header
        iid = (r.get("item_id") or "").strip()
        cells = {k: (r.get(k) or "").strip() for k in FIELD_NAMES}
        if not iid:
            problems.append(f"line {n}: empty item_id")
            continue
        if iid in labels or iid in unlabeled:
            problems.append(f"line {n}: duplicate item_id {iid}")
            continue
        if known_ids is not None and iid not in known_ids:
            problems.append(f"line {n}: unknown item_id {iid}")
            continue
        if not any(cells.values()):
            unlabeled.append(iid)
            continue
        rec = {}
        for k, raw in cells.items():
            val = normalize(k, raw)
            if not raw:
                problems.append(f"line {n} ({iid}): {k} is empty")
            elif val == INVALID:
                problems.append(f"line {n} ({iid}): {k}={raw!r} is not one of {FIELDS[k]['values']}")
            rec[k] = val
        for p in consistency_problems(rec):
            problems.append(f"line {n} ({iid}): {p}")
        labels[iid] = rec
    return labels, problems, unlabeled


def file_sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def freeze(path, lock_path):
    """Record the hash of your label sheet BEFORE the judge runs. Later cells check it."""
    lock = {"file": Path(path).name, "sha256": file_sha256(path),
            "frozen_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}
    if Path(lock_path).exists():
        old = json.loads(Path(lock_path).read_text())
        if old["sha256"] != lock["sha256"]:
            raise RuntimeError(
                f"{lock_path} already freezes a DIFFERENT label file (sha256 {old['sha256'][:12]}). "
                "If you changed labels after seeing judge output, the comparison is no longer blind. "
                "Delete the lock only if the judge has not run yet."
            )
        return old
    Path(lock_path).write_text(json.dumps(lock, indent=1))
    return lock


def check_frozen(path, lock_path):
    """True if the label sheet is byte-identical to the frozen one."""
    lock = json.loads(Path(lock_path).read_text())
    return file_sha256(path) == lock["sha256"]


def fields_text():
    lines = []
    for k, spec in FIELDS.items():
        lines.append(f"{k}: one of {', '.join(spec['values'])}")
        lines.append(f"  {spec['definition']}")
    lines.append("Mistake card rows:")
    lines += [f"  {k}: {v}" for k, v in MISTAKE_CARD.items()]
    lines.append("Consistency rules: clean <=> mistake_row none; clean => phase none; "
                 "flawed => phase not none; oversold yes => flawed.")
    return "\n".join(lines)


def _main(argv=None):
    import g5_items                                            # local import: keeps this module standalone
    import g5_judge
    ap = argparse.ArgumentParser(description="G5 label helper (runs on your Mac, no GPU).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("fields", help="print the field definitions")
    t = sub.add_parser("template", help="write a blank label sheet")
    t.add_argument("--out", default="my_labels.csv")
    t.add_argument("--g2", default="", help="folder with your G2 transcripts (optional)")
    s = sub.add_parser("show", help="print one item as the judge sees it")
    s.add_argument("item_id")
    s.add_argument("--g2", default="")
    c = sub.add_parser("check", help="validate a filled label sheet")
    c.add_argument("path")
    c.add_argument("--g2", default="")
    a = ap.parse_args(argv)

    if a.cmd == "fields":
        print(fields_text())
        return 0
    items = g5_items.load_labc() + (g5_items.load_g2(a.g2) if a.g2 else [])
    if a.cmd == "template":
        if Path(a.out).exists():
            print(f"{a.out} exists; not overwriting your labels. Pick another --out.")
            return 1
        pre = g2_prefill(items, a.g2) if a.g2 else {}
        write_template(items, a.out, pre)
        print(f"wrote {a.out} with {len(items)} rows ({len(pre)} partly filled from your G2 labels). "
              "Fill the five label columns. Notes are optional.")
        return 0
    if a.cmd == "show":
        hit = [it for it in items if it["item_id"] == a.item_id]
        if not hit:
            print(f"no item {a.item_id}. Known: {', '.join(it['item_id'] for it in items)}")
            return 1
        print(g5_judge.build_user_message(hit[0]))
        return 0
    labels, problems, unlabeled = read_labels(a.path, known_ids={it["item_id"] for it in items})
    for p in problems:
        print("PROBLEM:", p)
    print(f"{len(labels)} labeled, {len(unlabeled)} unlabeled, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(_main())
