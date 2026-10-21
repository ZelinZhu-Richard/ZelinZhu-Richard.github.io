#!/usr/bin/env python3
"""Run every lab's self-check, and prove the labs cover the whole mistake card.

Usage:
  python3 labs/check_labs.py [--keys DIR] [--only LAB] [--verbose] [--timeout S] [--no-tools]

  --keys DIR   your local answer keys. DIR/<lab-id>/ holds what used to be
               labs/<lab-id>/_key/ (DIR/<lab-id>/_key/ works too).
               Without --keys, each lab uses its own _key/ folder.
  --only LAB   run only this lab's check.py (repeat for more). The lab.json,
               coverage and tool checks still run.
  --verbose    print each check.py's full output, not only failures.
  --timeout S  seconds allowed per lab (default 900).
  --no-tools   skip the self-test of make_practice.sh and redflags.sh.

What it does:
  1. loads every labs/*/lab.json and checks its fields;
  2. checks that the union of "covers" includes M1..M10, and prints which lab
     covers which mistake-card row (and which steps S0..S15 each lab trains);
  3. self-tests make_practice.sh (every copy has one commit, the fixed author,
     the same files as repo/, and no _key/) and redflags.sh (known bad input
     gives flags, known clean input gives none);
  4. runs each labs/*/check.py with this Python and prints a summary table.

Each check.py prints spoilers for its own lab. Run this after you have done
the labs, or do not read the output. Standard library only, Python 3.9+.
Exit code 0 when everything passes, 1 when anything fails, 2 on bad usage.
"""
from __future__ import annotations

import argparse
import filecmp
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

LABS = Path(__file__).resolve().parent
ROWS = {
    "M1": "Invented API / flag / package",
    "M2": "Wrong root cause / symptom-only fix",
    "M3": "Test gaming",
    "M4": "Silent damage",
    "M5": "Similar-but-different logic",
    "M6": "Overselling",
    "M7": "Solution lookup",
    "M8": "Answering from memory, not the code",
    "M9": "C++ memory / undefined behavior",
    "M10": "Security and dependencies",
}
STEPS = [f"S{i}" for i in range(16)]
LAB_FIELDS = {"id": str, "title": str, "language": str, "time": str, "trains": list, "covers": list}
# Same exclusions as make_practice.sh.
NOT_COPIED = {"_key", ".git", ".venv", "node_modules", "__pycache__", ".pytest_cache",
              ".mypy_cache", ".ruff_cache", ".hypothesis", ".DS_Store"}
PRACTICE_AUTHOR = "practice <practice@example.invalid>"
PASS_LINE = re.compile(r"^\s*PASS\b", re.M)
FAIL_LINE = re.compile(r"^\s*FAIL\b.*$", re.M)


class Section:
    """Collects PASS/FAIL lines for one part of the run."""

    def __init__(self, name: str) -> None:
        self.name, self.passed, self.failed = name, 0, []

    def check(self, ok: bool, what: str, detail: str = "") -> bool:
        if ok:
            self.passed += 1
        else:
            self.failed.append(what + (f" ({detail})" if detail else ""))
            print(f"  FAIL {what}" + (f" ({detail})" if detail else ""))
        return ok


def show(path: Path) -> str:
    try:
        return str(path.relative_to(LABS.parent))
    except ValueError:
        return str(path)


def lab_dirs() -> list[Path]:
    return sorted(p for p in LABS.glob("lab-*") if p.is_dir()
                  and ((p / "check.py").is_file() or (p / "lab.json").is_file()))


# --------------------------------------------------------------------------- lab.json

def load_lab_json(labs: list[Path], sec: Section) -> dict[str, dict]:
    meta = {}
    for lab in labs:
        path = lab / "lab.json"
        if not sec.check(path.is_file(), f"{lab.name}: lab.json exists"):
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            sec.check(False, f"{lab.name}: lab.json is valid JSON", str(exc))
            continue
        ok = sec.check(isinstance(data, dict), f"{lab.name}: lab.json is an object")
        if not ok:
            continue
        for key, kind in LAB_FIELDS.items():
            sec.check(isinstance(data.get(key), kind), f"{lab.name}: lab.json field {key!r} is a {kind.__name__}")
        sec.check(data.get("id") == lab.name, f"{lab.name}: lab.json id matches the folder", f"id={data.get('id')!r}")
        covers, trains = data.get("covers") or [], data.get("trains") or []
        bad_rows = [r for r in covers if r not in ROWS]
        bad_steps = [s for s in trains if s not in STEPS]
        sec.check(not bad_rows, f"{lab.name}: every 'covers' entry is M1..M10", f"bad: {bad_rows}")
        sec.check(not bad_steps, f"{lab.name}: every 'trains' entry is S0..S15", f"bad: {bad_steps}")
        sec.check((lab / "check.py").is_file(), f"{lab.name}: check.py exists")
        sec.check((lab / "README.md").is_file(), f"{lab.name}: README.md exists")
        meta[lab.name] = data
    return meta


def coverage(meta: dict[str, dict], sec: Section) -> None:
    print("\nMistake card coverage (from lab.json \"covers\"):")
    for row, name in ROWS.items():
        labs = [lab for lab, data in meta.items() if row in (data.get("covers") or [])]
        print(f"  {row:<4} {name:<38} {', '.join(labs) if labs else '(none)'}")
        sec.check(bool(labs), f"mistake-card row {row} is covered by at least one lab")
    print("\nAudit steps trained (from lab.json \"trains\"; information only):")
    for step in STEPS:
        labs = [lab for lab, data in meta.items() if step in (data.get("trains") or [])]
        extra = "  (every lab starts with make_practice.sh)" if step == "S0" else ""
        print(f"  {step:<4} {', '.join(labs) if labs else '(none)'}{extra}")


def readme_lists_labs(meta: dict[str, dict], sec: Section) -> None:
    readme = LABS / "README.md"
    if not sec.check(readme.is_file(), "labs/README.md exists"):
        return
    text = readme.read_text(encoding="utf-8")
    for lab in meta:
        sec.check(lab in text, f"labs/README.md lists {lab}")


# --------------------------------------------------------------------------- tools

def files_under(root: Path, skip: set[str]) -> set[str]:
    out = set()
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip]
        for name in filenames:
            if name not in skip:
                out.add(str((Path(dirpath) / name).relative_to(root)))
    return out


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def test_make_practice(labs: list[Path], sec: Section, bash: str) -> None:
    script = LABS / "make_practice.sh"
    if not sec.check(script.is_file(), "make_practice.sh exists"):
        return
    tmp = Path(tempfile.mkdtemp(prefix="check-labs-")).resolve()
    env = dict(os.environ, TMPDIR=str(tmp) + "/")
    try:
        shas = {}
        for lab in labs:
            src = lab / "repo" if (lab / "repo").is_dir() else lab / "task"
            res = run([bash, str(script), lab.name], env=env, timeout=120)
            if not src.is_dir():
                sec.check(res.returncode == 2, f"make_practice {lab.name}: no repo/ or task/, so it exits 2",
                          f"exit {res.returncode}")
                continue
            if not sec.check(res.returncode == 0, f"make_practice {lab.name}: exits 0",
                             f"exit {res.returncode}: {res.stderr.strip()[-300:]}"):
                continue
            out_lines = res.stdout.strip().splitlines()
            copy = Path(out_lines[-1]).resolve() if out_lines else Path("/nonexistent")
            sec.check(len(out_lines) == 1, f"make_practice {lab.name}: stdout is only the path")
            if not sec.check(copy.is_dir() and tmp in copy.parents, f"make_practice {lab.name}: copy is a new folder under TMPDIR", str(copy)):
                continue
            log = run(["git", "-C", str(copy), "log", "--all", "--format=%an <%ae>|%cn <%ce>"])
            people = log.stdout.strip().splitlines()
            sec.check(len(people) == 1, f"make_practice {lab.name}: exactly one commit in all of git history", f"{len(people)} commits")
            sec.check(people == [f"{PRACTICE_AUTHOR}|{PRACTICE_AUTHOR}"], f"make_practice {lab.name}: fixed author and committer", "; ".join(people))
            copied = files_under(copy, {".git"})
            expected = files_under(src, NOT_COPIED)
            sec.check(copied == expected, f"make_practice {lab.name}: same files as {src.name}/ minus excluded ones",
                      f"missing {sorted(expected - copied)[:5]}, extra {sorted(copied - expected)[:5]}")
            same = all(filecmp.cmp(src / f, copy / f, shallow=False) for f in expected & copied)
            sec.check(same, f"make_practice {lab.name}: file contents are identical")
            keys = [p for p in copy.rglob("_key")]
            sec.check(not keys, f"make_practice {lab.name}: no _key folder in the copy", str(keys[:3]))
            tracked = set(run(["git", "-C", str(copy), "ls-files"]).stdout.split("\n")) - {""}
            if tracked != copied:
                print(f"  note make_practice {lab.name}: {len(copied - tracked)} copied file(s) are untracked "
                      f"(the lab's .gitignore), e.g. {sorted(copied - tracked)[:3]}")
            shas[lab.name] = run(["git", "-C", str(copy), "rev-parse", "HEAD"]).stdout.strip()
        if shas:
            first = next(iter(shas))
            again = run([bash, str(script), first], env=env, timeout=120)
            sha2 = run(["git", "-C", again.stdout.strip(), "rev-parse", "HEAD"]).stdout.strip() if again.returncode == 0 else ""
            sec.check(sha2 == shas[first], f"make_practice {first}: a second copy gets the same commit id", f"{shas[first][:12]} vs {sha2[:12]}")

        # A fake labs folder: nested _key must not be copied; a symlink must be refused.
        fake = tmp / "fake-labs"
        (fake / "lab-zz" / "repo" / "pkg" / "_key").mkdir(parents=True)
        (fake / "lab-zz" / "_key").mkdir()
        (fake / "lab-zz" / "repo" / "pkg" / "_key" / "answer.txt").write_text("secret\n")
        (fake / "lab-zz" / "_key" / "key.json").write_text("{}\n")
        (fake / "lab-zz" / "repo" / "pkg" / "mod.py").write_text("x = 1\n")
        (fake / "lab-zy" / "repo").mkdir(parents=True)
        (fake / "lab-zy" / "repo" / "keys").symlink_to(fake / "lab-zz" / "_key")
        shutil.copy2(script, fake / "make_practice.sh")
        res = run([bash, str(fake / "make_practice.sh"), "lab-zz"], env=env, timeout=60)
        copy = Path(res.stdout.strip()) if res.returncode == 0 else None
        sec.check(copy is not None and (copy / "pkg" / "mod.py").is_file() and not list(copy.rglob("_key")),
                  "make_practice: a nested _key folder is not copied")
        res = run([bash, str(fake / "make_practice.sh"), "lab-zy"], env=env, timeout=60)
        sec.check(res.returncode == 2 and not list(tmp.glob("practice-lab-zy.*")),
                  "make_practice: a repo with a symlink is refused and nothing is kept")
        res = run([bash, str(script), "../lab-a"], env=env, timeout=60)
        sec.check(res.returncode == 2, "make_practice: a lab id with a path in it is refused")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# Test inputs for redflags.sh. They are diff TEXT, written to a temp file and
# scanned; nothing in them is ever run.
BAD_DIFF = """\
diff --git a/app/core.py b/app/core.py
--- a/app/core.py
+++ b/app/core.py
@@ -1,4 +1,5 @@
 def parse(text):
-    if not text:
-        raise ValueError("empty")
+    value = eval(text)
+    subprocess.run(text, shell=True)
+    return value

diff --git a/tests/test_core.py b/tests/test_core.py
--- a/tests/test_core.py
+++ b/tests/test_core.py
@@ -1,3 +1,4 @@
+@pytest.mark.skip(reason="flaky")
 def test_parse():
-    assert parse("1") == 1
+    assert parse("1")

diff --git a/requirements.txt b/requirements.txt
--- a/requirements.txt
+++ b/requirements.txt
@@ -1 +1,2 @@
 pytest==8.4.2
+leftpadder==0.1
"""
BAD_EXPECT = ["eval / exec", "shell=True", "fewer error-check", "test skipped",
              "assertion removed", "existing test file changed", "dependency or lock file"]
CLEAN_DIFF = """\
diff --git a/app/core.py b/app/core.py
--- a/app/core.py
+++ b/app/core.py
@@ -1,3 +1,3 @@
 def total(items):
-    return sum(items)
+    return sum(items, start=0)

diff --git a/tests/test_total.py b/tests/test_total.py
new file mode 100644
--- /dev/null
+++ b/tests/test_total.py
@@ -0,0 +1,2 @@
+def test_empty():
+    assert total([]) == 0
"""
TRANSCRIPT = """\
$ python -m pytest -q
3 passed in 0.01s
**Tool call: edit `app/core.py`**
$ git log --all --oneline
Agent: Done. All 3 tests pass.
"""
TRANSCRIPT_EXPECT = ["last edit (line 3) came after the last test run (line 1)", "whole git history"]


def test_redflags(sec: Section, bash: str) -> None:
    script = LABS / "redflags.sh"
    if not sec.check(script.is_file(), "redflags.sh exists"):
        return
    tmp = Path(tempfile.mkdtemp(prefix="check-redflags-"))
    try:
        (tmp / "bad.diff").write_text(BAD_DIFF)
        (tmp / "clean.diff").write_text(CLEAN_DIFF)
        (tmp / "t.txt").write_text(TRANSCRIPT)
        (tmp / "empty.diff").write_text("")
        env = {k: v for k, v in os.environ.items() if k != "CANARY"}
        res = run([bash, str(script), str(tmp / "bad.diff")], env=env, timeout=60)
        sec.check(res.returncode == 1, "redflags: a bad diff exits 1", f"exit {res.returncode}")
        for text in BAD_EXPECT:
            sec.check(text in res.stdout, f"redflags: bad diff reports {text!r}")
        res = run([bash, str(script), str(tmp / "clean.diff")], env=env, timeout=60)
        sec.check(res.returncode == 0 and "0 flag(s)" in res.stdout, "redflags: a clean diff exits 0 with no flags",
                  f"exit {res.returncode}")
        res = run([bash, str(script), str(tmp / "clean.diff"), str(tmp / "t.txt")], env=env, timeout=60)
        sec.check(res.returncode == 1, "redflags: a stale 'tests pass' claim exits 1", f"exit {res.returncode}")
        for text in TRANSCRIPT_EXPECT:
            sec.check(text in res.stdout, f"redflags: transcript reports {text!r}")
        res = run([bash, str(script), str(tmp / "clean.diff"), str(tmp / "t.txt")],
                  env=dict(env, CANARY="canary-only-in-test"), timeout=60)
        sec.check("canary string" not in res.stdout, "redflags: no canary hit when the canary is absent")
        (tmp / "t.txt").write_text(TRANSCRIPT + "cat CANARY.txt -> canary-only-in-test\n")
        res = run([bash, str(script), str(tmp / "clean.diff"), str(tmp / "t.txt")],
                  env=dict(env, CANARY="canary-only-in-test"), timeout=60)
        sec.check("canary string is in the transcript" in res.stdout, "redflags: finds the canary string")
        res = run([bash, str(script), str(tmp / "empty.diff")], env=env, timeout=60)
        sec.check(res.returncode == 2, "redflags: an empty or non-diff input exits 2", f"exit {res.returncode}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# --------------------------------------------------------------------------- check.py runs

def keys_for(lab: Path, keys_root: Path | None) -> Path:
    if keys_root is None:
        return lab / "_key"
    nested = keys_root / lab.name / "_key"
    return nested if nested.is_dir() else keys_root / lab.name


def run_check(lab: Path, keys_root: Path | None, timeout: int, verbose: bool) -> dict:
    keys = keys_for(lab, keys_root)
    label = f"<keys>/{keys.relative_to(keys_root)}" if keys_root is not None else show(keys)
    row = {"lab": lab.name, "keys": label, "pass": 0, "fail": 0, "exit": "-", "secs": 0.0}
    if not keys.is_dir():
        hint = "pass --keys DIR" if keys_root is None else f"expected {show(keys)}"
        row.update(result="NO KEYS", detail=f"answer keys not found ({hint})")
        return row
    cmd = [sys.executable, str(lab / "check.py")]
    if keys_root is not None:
        cmd += ["--keys", str(keys.resolve())]
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    start = time.monotonic()
    try:
        res = subprocess.run(cmd, cwd=lab, env=env, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        row.update(result="TIMEOUT", secs=time.monotonic() - start, detail=f"no result after {timeout} s")
        out = exc.stdout or ""
        out = out if isinstance(out, str) else out.decode("utf-8", "replace")
        row.update(output=out, fail_lines=FAIL_LINE.findall(out), fail=len(FAIL_LINE.findall(out)),
                   **{"pass": len(PASS_LINE.findall(out))})
        return row
    row["secs"] = time.monotonic() - start
    out = res.stdout + (("\n[stderr]\n" + res.stderr) if res.stderr.strip() else "")
    fails = FAIL_LINE.findall(res.stdout)
    row.update(output=out, exit=res.returncode, fail=len(fails), fail_lines=fails,
               **{"pass": len(PASS_LINE.findall(res.stdout))})
    if res.returncode == 0 and not fails:
        row["result"] = "ok"
    elif res.returncode == 0:
        row.update(result="FAIL", detail=f"exit 0 but {len(fails)} FAIL line(s)")
    else:
        row.update(result="FAIL", detail=f"exit {res.returncode}")
    if verbose:
        print(out.rstrip())
    return row


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--keys", type=Path, help="folder with one answer-key folder per lab id")
    parser.add_argument("--only", action="append", default=[], metavar="LAB", help="run only this lab (repeatable)")
    parser.add_argument("--verbose", action="store_true", help="print every check.py's full output")
    parser.add_argument("--timeout", type=int, default=900, help="seconds per lab (default 900)")
    parser.add_argument("--no-tools", action="store_true", help="skip the make_practice.sh / redflags.sh self-test")
    args = parser.parse_args()

    labs = lab_dirs()
    names = {lab.name for lab in labs}
    unknown = [x for x in args.only if x not in names]
    if unknown:
        print(f"check_labs: unknown lab(s) {unknown}; labs here: {sorted(names)}", file=sys.stderr)
        return 2
    keys_root = args.keys.expanduser().resolve() if args.keys else None
    if keys_root is not None and not keys_root.is_dir():
        print(f"check_labs: --keys {args.keys} is not a folder", file=sys.stderr)
        return 2

    print(f"labs: {', '.join(sorted(names))}")
    where = f"<keys> = {keys_root}" if keys_root else "each lab's own _key/"
    print(f"keys: {where}")
    sections = []

    meta_sec = Section("lab.json + coverage")
    print("\n== lab.json, coverage and README")
    meta = load_lab_json(labs, meta_sec)
    coverage(meta, meta_sec)
    readme_lists_labs(meta, meta_sec)
    sections.append(meta_sec)

    tool_secs = 0.0
    if not args.no_tools:
        tools = Section("tools")
        print("\n== tools: make_practice.sh and redflags.sh")
        bash = shutil.which("bash")
        start = time.monotonic()
        if tools.check(bool(bash) and bool(shutil.which("git")), "bash and git are on PATH"):
            test_make_practice(labs, tools, bash)
            test_redflags(tools, bash)
        tool_secs = time.monotonic() - start
        sections.append(tools)

    rows = []
    selected = [lab for lab in labs if not args.only or lab.name in args.only]
    for lab in selected:
        if not (lab / "check.py").is_file():
            continue
        print(f"\n== {lab.name}: python3 check.py" + (" --keys ..." if keys_root else ""), flush=True)
        row = run_check(lab, keys_root, args.timeout, args.verbose)
        rows.append(row)
        print(f"  {row['result']}: {row['pass']} PASS, {row['fail']} FAIL, exit {row['exit']}, {row['secs']:.1f} s"
              + (f" ({row['detail']})" if row.get("detail") else ""))
        if row["result"] != "ok" and not args.verbose:
            for line in row.get("fail_lines", []):
                print(f"  {line.strip()}")
            tail = (row.get("output") or "").rstrip().splitlines()[-25:]
            if tail:
                print("  --- last lines of output ---")
                for line in tail:
                    print(f"  | {line}")

    print("\n== summary")
    print(f"  {'part':<22} {'result':<8} {'pass':>5} {'fail':>5} {'exit':>5} {'time':>8}  keys")
    for sec in sections:
        result = "ok" if not sec.failed else "FAIL"
        secs = f"{tool_secs:.1f} s" if sec.name == "tools" else "-"
        print(f"  {sec.name:<22} {result:<8} {sec.passed:>5} {len(sec.failed):>5} {'-':>5} {secs:>8}")
    for row in rows:
        print(f"  {row['lab']:<22} {row['result']:<8} {row['pass']:>5} {row['fail']:>5} {str(row['exit']):>5} "
              f"{row['secs']:>6.1f} s  {row['keys']}")
    bad = [s.name for s in sections if s.failed] + [r["lab"] for r in rows if r["result"] != "ok"]
    print(f"\n{'ALL OK' if not bad else 'FAILED: ' + ', '.join(bad)}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
