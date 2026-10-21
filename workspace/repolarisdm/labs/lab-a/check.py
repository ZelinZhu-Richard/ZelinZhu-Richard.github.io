#!/usr/bin/env python3
"""Self-check for Lab A (Map Check). Standard library only.

Usage:  python3 check.py [--keys DIR]      (default keys dir: ./_key)

It proves the lab itself is sound, not your answers:
  1. public files are well formed and do not leak the answers;
  2. every claim in claims.json is right or wrong exactly as the key says,
     judged against the code at its file:line (plus extra proofs for wrong ones).
     Some wrong claims quote their line exactly, so a quote check alone
     cannot score the lab;
  3. the visible test suite passes on the shipped code, twice;
  4. the ISSUE.md bug reproduces: the key's repro test fails for the right
     reason, and the issue's CLI steps print its "Actual" output;
  5. the key's reference fix makes the repro, the attack tests and the
     issue's "Expected" output pass, and keeps the suite green;
  6. the key's two flawed fixes pass the repro but fail the attack tests,
     and the key's apply_fix.py applies each fix exactly as listed.
It also scans the playbook pages (../../content/*.md) for Lab A answers and
prints WARN lines for hits. Warnings do not change the exit code.

Tests run with pytest from $LAB_PYTHON, else ./.venv/bin/python, else the
Python that runs this file. It prints WARN if that pytest is not the version
pinned in requirements.txt. Every run happens in a fresh temp copy of repo/.
Exit code 1 on any FAIL. It prints the answers: run it after you finish.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE / "repo"
PAGES = HERE.parent.parent / "content"
LAB_KEYS = {"id", "title", "language", "time", "trains", "covers"}
CLAIM_KEYS = {"id", "claim", "file", "line", "expected_text"}
STEPS = {f"S{i}" for i in range(16)}
ROWS = {f"M{i}" for i in range(1, 11)}
# Same list as the playbook's content tests. Built from pieces so this file
# does not match itself.
FORBIDDEN = [
    (re.compile("no" "index", re.I), "robots no-index"),
    (re.compile(r"https?://(?:localhost|127\.0\.0\.1):\d+"), "localhost URL with port"),
    (re.compile("/" "Users/"), "local user path"),
    (re.compile("CHRONOS" "-CANARY"), "private canary"),
    (re.compile("hold" "out/", re.I), "private answer-store path"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:com|edu|org|net|io)\b"), "email address"),
]
SKIP_DIRS = {".venv", "__pycache__", ".pytest_cache", "_key", ".git"}


class Report:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0
        self.warned = 0

    def warn(self, label: str) -> None:
        self.warned += 1
        print(f"WARN  {label}")

    def check(self, ok: bool, label: str, detail: str = "") -> bool:
        if ok:
            self.passed += 1
            print(f"PASS  {label}")
        else:
            self.failed += 1
            print(f"FAIL  {label}")
            for line in detail.strip().splitlines()[:25]:
                print(f"      {line}")
        return ok


def public_files() -> list[Path]:
    out = []
    for path in sorted(HERE.rglob("*")):
        rel = path.relative_to(HERE)
        if path.is_file() and not SKIP_DIRS.intersection(rel.parts) and path.suffix != ".pyc":
            out.append(path)
    return out


def read_json(path: Path, rep: Report, label: str) -> object | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        rep.check(False, label, str(exc))
        return None


def clean_env() -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if not k.startswith("TALLYHUB_")}
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


def fresh_copy(parent: Path, name: str) -> Path:
    dst = parent / name
    shutil.copytree(REPO, dst, ignore=shutil.ignore_patterns(*SKIP_DIRS, "*.db", ".coverage"))
    return dst


def find_python() -> tuple[str | None, str]:
    """First Python with pytest among $LAB_PYTHON, ./.venv, this Python; and its pytest version."""
    candidates = [os.environ.get("LAB_PYTHON", ""), str(HERE / ".venv" / "bin" / "python"), sys.executable]
    for cand in candidates:
        if cand and Path(cand).exists():
            probe = subprocess.run([cand, "-c", "import pytest; print(pytest.__version__)"],
                                   capture_output=True, text=True)
            if probe.returncode == 0:
                return cand, probe.stdout.strip()
    return None, ""


def pinned(name: str) -> str:
    path = HERE / "requirements.txt"
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    match = re.search(rf"^{re.escape(name)}==(\S+)", text, re.M)
    return match.group(1) if match else ""


def pytest(py: str, cwd: Path, *targets: str) -> tuple[int, str, set[str], set[str]]:
    proc = subprocess.run([py, "-m", "pytest", "-p", "no:cacheprovider", "-rA", *targets],
                          cwd=cwd, env=clean_env(), capture_output=True, text=True, timeout=600)
    out = proc.stdout + proc.stderr
    # -rA summary lines: "PASSED <nodeid>" and "FAILED <nodeid> - <message>".
    # Node ids can contain spaces (parametrize ids), so read to the end of the line.
    passed = set(re.findall(r"^PASSED (\S+::.+?)\s*$", out, re.M))
    failed = set(re.findall(r"^(?:FAILED|ERROR) (\S+::.+?)(?: - .*)?$", out, re.M))
    return proc.returncode, out, passed, failed


def names(nodeids: set[str]) -> set[str]:
    """'tests/test_x.py::test_y[1]' -> 'test_y[1]'."""
    return {n.split("::", 1)[1] for n in nodeids}


def run_steps(py: str, cwd: Path, steps: list[dict], files: dict[str, str] | None = None) -> list:
    for name, text in (files or {}).items():
        (cwd / name).write_text(text, encoding="utf-8")
    results = []
    for step in steps:
        argv = [py if a == "{py}" else a for a in step["argv"]]
        results.append(subprocess.run(argv, cwd=cwd, env=clean_env(), capture_output=True,
                                      text=True, timeout=120))
    return results


def step_problems(step: dict, res: subprocess.CompletedProcess) -> list[str]:
    problems = []
    if "exit" in step and res.returncode != step["exit"]:
        problems.append(f"exit {res.returncode}, wanted {step['exit']}: {res.stderr.strip()}")
    if "stdout" in step and res.stdout != step["stdout"]:
        problems.append(f"stdout {res.stdout!r}, wanted {step['stdout']!r}")
    problems += [f"stdout lacks {t!r}" for t in step.get("stdout_has", []) if t not in res.stdout]
    problems += [f"stdout has {t!r}" for t in step.get("stdout_lacks", []) if t in res.stdout]
    problems += [f"stderr lacks {t!r}" for t in step.get("stderr_has", []) if t not in res.stderr]
    return problems


def apply_edits(root: Path, edits: list[dict]) -> None:
    for edit in edits:
        path = root / edit["file"]
        text = path.read_text(encoding="utf-8")
        if text.count(edit["old"]) != 1:
            raise ValueError(f"{edit['file']}: the text to replace occurs {text.count(edit['old'])} times")
        path.write_text(text.replace(edit["old"], edit["new"]), encoding="utf-8")


def repo_line(rel: str, line: int) -> str | None:
    path = REPO / rel
    if not path.is_file():
        return None
    lines = path.read_text(encoding="utf-8").splitlines()
    return lines[line - 1] if 1 <= line <= len(lines) else None


def repo_files_under(prefixes: list[str]) -> list[Path]:
    out = []
    for path in sorted(REPO.rglob("*")):
        rel = path.relative_to(REPO)
        if not path.is_file() or SKIP_DIRS.intersection(rel.parts) or path.suffix == ".pyc":
            continue
        if any(p in (".", "") or rel.as_posix() == p or rel.as_posix().startswith(p.rstrip("/") + "/")
               for p in prefixes):
            out.append(path)
    return out


# ---------------------------------------------------------------- checks


def check_public(rep: Report) -> tuple[dict | None, list[dict]]:
    print("== public files")
    lab = read_json(HERE / "lab.json", rep, "lab.json is valid JSON")
    if isinstance(lab, dict):
        rep.check(set(lab) == LAB_KEYS, "lab.json has exactly id, title, language, time, trains, covers",
                  f"keys: {sorted(lab)}")
        rep.check(lab.get("id") == HERE.name, f"lab.json id matches the folder ({HERE.name})")
        rep.check(set(lab.get("trains", [])) <= STEPS and lab.get("trains"), "lab.json trains are audit steps S0-S15")
        rep.check(set(lab.get("covers", [])) <= ROWS and lab.get("covers"), "lab.json covers are mistake rows M1-M10")
    readme = (HERE / "README.md").read_text(encoding="utf-8") if (HERE / "README.md").is_file() else ""
    rep.check(f"make_practice.sh {HERE.name}" in readme and "Done when" in readme,
              "README.md says how to start (make_practice.sh) and when you are done")

    def pins(path: Path) -> list[str]:
        if not path.is_file():
            return []
        return [ln.strip() for ln in path.read_text().splitlines() if ln.strip() and not ln.startswith("#")]

    lab_pins, repo_pins = pins(HERE / "requirements.txt"), pins(REPO / "requirements-dev.txt")
    rep.check(bool(lab_pins) and all(re.fullmatch(r"[A-Za-z0-9_.\-]+==[0-9][\w.]*", p) for p in lab_pins),
              "requirements.txt pins every package with ==", "\n".join(lab_pins))
    rep.check(lab_pins == repo_pins, "requirements.txt matches repo/requirements-dev.txt")

    data = read_json(HERE / "claims.json", rep, "claims.json is valid JSON")
    claims = data.get("claims", []) if isinstance(data, dict) else []
    rep.check(len(claims) == 12, f"claims.json has 12 claims (found {len(claims)})")
    rep.check(len({c.get("id") for c in claims}) == len(claims), "claim ids are unique")
    bad_shape = [c.get("id") for c in claims if set(c) != CLAIM_KEYS]
    rep.check(not bad_shape, "every claim has exactly id, claim, file, line, expected_text (no verdicts)",
              f"bad: {bad_shape}")
    missing = [f"{c['id']} {c['file']}:{c['line']}" for c in claims
               if set(c) == CLAIM_KEYS and repo_line(c["file"], c["line"]) is None]
    rep.check(not missing, "every claim points at an existing file:line", "\n".join(missing))

    hits = []
    for path in public_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        hits += [f"{path.relative_to(HERE)}: {name}" for rx, name in FORBIDDEN if rx.search(text)]
    rep.check(not hits, "no forbidden strings (local paths, localhost ports, emails, private markers)",
              "\n".join(hits))
    rep.check(not (REPO / ".git").exists() and not (REPO / "_key").exists(),
              "repo/ has no .git and no answer folder (make_practice.sh adds a fresh git)")
    return (lab if isinstance(lab, dict) else None), claims


def check_key(rep: Report, key: dict, lab: dict | None, claims: list[dict]) -> None:
    print("== answer key")
    ids = {c["id"] for c in claims}
    details = key.get("claims", {}).get("details", {})
    wrong = set(key.get("claims", {}).get("wrong", []))
    rep.check(len(wrong) == 4 and wrong <= ids, f"key names exactly 4 wrong claims ({sorted(wrong)})")
    rep.check(set(details) == ids, "key has a verdict for every claim")
    rep.check({c for c, d in details.items() if d.get("verdict") == "wrong"} == wrong,
              "key verdicts agree with its wrong-claim list")
    rep.check(all(details[c].get("reason") and details[c].get("type") for c in wrong if c in details),
              "every wrong claim has a type and a reason")
    modes = {c: details[c].get("quote") for c in wrong if c in details}
    rep.check(all(m in ("ok", "miss") for m in modes.values()),
              "every wrong claim says whether its quote is at the line (quote: ok or miss)", str(modes))
    true_quotes = sorted(c for c, m in modes.items() if m == "ok")
    rep.check(len(true_quotes) >= 2, f"at least 2 wrong claims quote their line exactly ({true_quotes}), "
              "so a quote check alone cannot score the lab")
    weak = [c for c in true_quotes
            if not any(p["kind"] in ("run", "found_at") for p in details[c].get("proofs", []))
            or any(p["kind"] == "line_is" for p in details[c].get("proofs", []))]
    rep.check(not weak, "each true-quote wrong claim is proved false by a run or another line, not by its own line",
              f"weak: {weak}")
    path = key.get("claims", {}).get("bug_path", [])
    rep.check(bool(path) and set(path) <= ids and bool(key.get("claims", {}).get("bug_path_rule")),
              "key lists the issue-path claims and the rule that picks them")
    on_path_wrong = sorted(set(path) & wrong)
    rep.check(len(on_path_wrong) >= 2, f"2+ issue-path claims are wrong ({on_path_wrong}), so Gate 2 fires")
    rep.check((HERE / "key.md").is_file() is False, "key.md is not in the public lab folder")
    covers = key.get("covers", {})
    fixes = key.get("bug", {}).get("fixes", {})

    def exists(item: str) -> bool:
        if item in ids:
            return True
        parts = item.split(".")
        return len(parts) == 3 and parts[:2] == ["bug", "fixes"] and parts[2] in fixes

    if lab:
        rep.check(set(covers) == set(lab.get("covers", [])), "lab.json covers = rows the key maps to items",
                  f"lab.json {sorted(lab.get('covers', []))} vs key {sorted(covers)}")
    bad = [f"{row}: {item}" for row, items in covers.items() for item in items if not exists(item)]
    rep.check(bool(covers) and not bad and all(covers.values()), "every covered mistake row maps to a real lab item",
              "\n".join(bad))

    leak = key.get("leak_markers", {})
    found = []
    for rel in leak.get("docs", []):
        path = HERE / rel
        if not path.is_file():
            found.append(f"{rel}: missing")
            continue
        text = path.read_text(encoding="utf-8")
        found += [f"{rel}: {m['text']!r}" for m in leak.get("markers", [])
                  if m["text"] in text and rel not in m.get("allowed", [])]
    for path in repo_files_under(["."]):
        text = path.read_text(encoding="utf-8", errors="replace")
        found += [f"repo/{path.relative_to(REPO)}: {m!r}" for m in leak.get("repo_markers", []) if m in text]
    rep.check(not found, "public docs and repo/ do not reveal the answers", "\n".join(found))


def check_claims(rep: Report, key: dict, claims: list[dict], py: str | None, tmp: Path) -> None:
    print("== claims vs code")
    details = key.get("claims", {}).get("details", {})
    for c in claims:
        d = details.get(c["id"], {})
        line = repo_line(c["file"], c["line"])
        if line is None:
            rep.check(False, f"{c['id']} {c['file']}:{c['line']} exists")
            continue
        here = c["expected_text"] in line
        if d.get("verdict") == "right":
            rep.check(here, f"{c['id']} right: {c['file']}:{c['line']} contains the quoted text",
                      f"line is: {line.strip()}")
            continue
        if d.get("quote") == "ok":
            rep.check(here, f"{c['id']} wrong: {c['file']}:{c['line']} contains the quoted text, "
                      "but the sentence is false", f"line is: {line.strip()}")
        else:
            rep.check(not here, f"{c['id']} wrong: {c['file']}:{c['line']} does not contain the quoted text",
                      f"line is: {line.strip()}")
        for n, proof in enumerate(d.get("proofs", []), 1):
            label = f"{c['id']} proof {n} ({proof['kind']})"
            kind = proof["kind"]
            if kind == "line_is":
                rep.check(proof["text"] in line, label, f"line is: {line.strip()}")
            elif kind == "found_at":
                got = repo_line(proof["file"], proof["line"]) or ""
                rep.check(proof["text"] in got, f"{label}: {proof['file']}:{proof['line']}", f"line is: {got}")
            elif kind == "absent":
                where = [str(p.relative_to(REPO)) for p in repo_files_under(proof["under"])
                         if proof["pattern"] in p.read_text(encoding="utf-8", errors="replace")]
                rep.check(not where, f"{label}: {proof['pattern']!r} appears nowhere in {proof['under']}",
                          "\n".join(where))
            elif kind == "only_in":
                where = sorted(str(p.relative_to(REPO)) for p in repo_files_under(["."])
                               if proof["pattern"] in p.read_text(encoding="utf-8", errors="replace"))
                rep.check(where == sorted(proof["files"]), f"{label}: {proof['pattern']!r} only in {proof['files']}",
                          f"found in {where}")
            elif kind == "run":
                if py is None:
                    rep.check(False, f"{label}: needs a Python with pytest (see README)")
                    continue
                work = fresh_copy(tmp, f"claim-{c['id']}-{n}")
                results = run_steps(py, work, proof["steps"], proof.get("files"))
                problems = [f"step {i}: {p}" for i, (s, r) in enumerate(zip(proof["steps"], results), 1)
                            for p in step_problems(s, r)]
                rep.check(not problems, f"{label}: the code behaves as the key says", "\n".join(problems))
            else:
                rep.check(False, f"{label}: unknown proof kind")


def check_bug(rep: Report, key: dict, keys_dir: Path, py: str | None, tmp: Path) -> None:
    print("== planted bug (ISSUE.md)")
    bug = key.get("bug", {})
    line = repo_line(bug.get("file", ""), bug.get("line", 0)) or ""
    rep.check(bool(bug.get("line_text")) and bug["line_text"] in line,
              f"bug location {bug.get('file')}:{bug.get('line')} holds the defect line", f"line is: {line}")
    issue = (REPO / "ISSUE.md").read_text(encoding="utf-8") if (REPO / "ISSUE.md").is_file() else ""
    cli = bug.get("cli", {})
    rep.check(bool(cli) and cli["actual"] in issue and cli["expected"] in issue,
              "ISSUE.md shows the key's Actual and Expected output verbatim")
    if not rep.check(py is not None, "a Python with pytest is available (LAB_PYTHON or ./.venv)",
                     "uv venv --python 3.13 .venv && uv pip install --python .venv/bin/python -r requirements.txt"):
        return
    repro_src = (keys_dir / bug.get("repro_test", "missing")).read_text(encoding="utf-8")
    attack_src = (keys_dir / bug.get("attack_test", "missing")).read_text(encoding="utf-8")

    base = fresh_copy(tmp, "buggy")
    counts = []
    for run in (1, 2):
        code, out, passed, failed = pytest(py, base)
        counts.append(len(passed))
        rep.check(code == 0 and passed and not failed, f"visible suite passes on the shipped code (run {run}: "
                  f"{len(passed)} passed)", out[-1500:])
    rep.check(counts[0] == counts[1], "visible suite is stable across two runs")
    said = re.search(r"`(\d+) passed`", (HERE / "README.md").read_text(encoding="utf-8"))
    rep.check(bool(said) and int(said.group(1)) == counts[0],
              f"README.md states the real baseline ({counts[0]} passed)",
              f"README says {said.group(1) if said else 'nothing'}")

    (base / "tests" / "test_issue41_repro.py").write_text(repro_src, encoding="utf-8")
    (base / "tests" / "test_issue41_attack.py").write_text(attack_src, encoding="utf-8")
    code, out, passed, failed = pytest(py, base, "tests/test_issue41_repro.py")
    rep.check(code == 1 and set(bug["repro_must_fail"]) <= names(failed), "repro test fails on the shipped code",
              out[-1500:])
    rep.check(all(t in out for t in bug.get("repro_fail_text", [])) and "Error collecting" not in out
              and "ModuleNotFoundError" not in out, "it fails for the right reason (the UTC value assertion)",
              out[-1500:])
    code, out, passed, failed = pytest(py, base, "tests/test_issue41_attack.py")
    rep.check(set(bug["unfixed_attack_must_fail"]) <= names(failed),
              "attack tests fail on the shipped code (revert-the-fix check)", out[-1500:])
    rep.check(set(bug["unfixed_attack_must_pass"]) <= names(passed),
              "attack tests that pin already-correct behavior pass on the shipped code", out[-1500:])

    results = run_steps(py, base, cli["steps"], cli["files"])
    problems = [p for s, r in zip(cli["steps"], results) for p in step_problems(s, r)]
    rep.check(not problems and results[-1].stdout == cli["actual"],
              "ISSUE.md steps print the issue's Actual output", "\n".join(problems) + "\n" + results[-1].stdout)

    script = keys_dir / key.get("stretch", {}).get("apply_script", "apply_fix.py")
    rep.check(script.is_file(), f"the key has {script.name} for the README's S12 stretch")
    for name, fix in bug.get("fixes", {}).items():
        work = fresh_copy(tmp, f"fix-{name}")
        try:
            apply_edits(work, fix["edits"])
        except (OSError, ValueError) as exc:
            rep.check(False, f"fix '{name}' applies cleanly", str(exc))
            continue
        if script.is_file():
            other = fresh_copy(tmp, f"fix-{name}-script")
            res = subprocess.run([sys.executable, str(script), name, str(other)], capture_output=True, text=True,
                                 env=clean_env(), timeout=60)
            same = res.returncode == 0 and all(
                (other / e["file"]).read_text(encoding="utf-8") == (work / e["file"]).read_text(encoding="utf-8")
                for e in fix["edits"])
            rep.check(same, f"{script.name} {name} gives the same code as the key's edits", res.stderr)
        rep.check(not any(e["file"].startswith("tests/") for e in fix["edits"]), f"fix '{name}' leaves tests/ alone")
        code, out, passed, failed = pytest(py, work)
        verb = "passes" if fix["suite"] == "pass" else "fails"
        rep.check((code == 0) == (fix["suite"] == "pass"), f"fix '{name}': visible suite {verb}", out[-1500:])
        (work / "tests" / "test_issue41_repro.py").write_text(repro_src, encoding="utf-8")
        (work / "tests" / "test_issue41_attack.py").write_text(attack_src, encoding="utf-8")
        code, out, passed, failed = pytest(py, work, "tests/test_issue41_repro.py")
        verb = "passes" if fix["repro"] == "pass" else "fails"
        rep.check((code == 0) == (fix["repro"] == "pass"), f"fix '{name}': repro test {verb}", out[-1500:])
        code, out, passed, failed = pytest(py, work, "tests/test_issue41_attack.py")
        if fix["attack"] == "pass":
            rep.check(code == 0, f"fix '{name}': attack tests pass", out[-1500:])
        else:
            must = set(fix.get("attack_must_fail", []))
            rep.check(code == 1 and must <= names(failed), f"fix '{name}': attack tests catch it ({', '.join(sorted(must))})",
                      out[-1500:])
        if fix.get("cli") == "expected":
            results = run_steps(py, work, cli["steps"], cli["files"])
            rep.check(results[-1].stdout == cli["expected"], f"fix '{name}': ISSUE.md steps print the Expected output",
                      results[-1].stdout + results[-1].stderr)


def check_pages(rep: Report, key: dict) -> None:
    print("== playbook pages (information only; WARN does not fail)")
    markers = key.get("leak_markers", {}).get("pages", {}).get("markers", [])
    if not PAGES.is_dir():
        print(f"INFO  no {PAGES.name}/ folder two levels up; page scan skipped")
        return
    hits = 0
    for page in sorted(PAGES.rglob("*.md")):
        for n, text in enumerate(page.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            what = sorted({m["what"] for m in markers
                           if page.name not in m.get("allowed", []) and re.search(m["regex"], text)})
            if what:
                hits += 1
                rep.warn(f"{page.relative_to(PAGES.parent)}:{n} shows {' and '.join(what)}: {text.strip()[:80]}")
    if not hits:
        print(f"INFO  no Lab A answers in {PAGES.name}/*.md")


def main() -> int:
    parser = argparse.ArgumentParser(description="Prove that Lab A is consistent.")
    parser.add_argument("--keys", default=str(HERE / "_key"), help="answer-key folder (default ./_key)")
    args = parser.parse_args()
    keys_dir = Path(args.keys).expanduser().resolve()
    rep = Report()
    print(f"Lab {HERE.name}: checking {HERE}")
    lab, claims = check_public(rep)
    key = None
    if (keys_dir / "key.json").is_file():
        key = read_json(keys_dir / "key.json", rep, "key.json is valid JSON")
    rep.check(isinstance(key, dict) and (keys_dir / "key.md").is_file(),
              f"answer key found (key.json + key.md) in {keys_dir.name}/", "pass --keys DIR")
    py, version = find_python()
    print(f"INFO  pytest runs with: {py or 'none found'}" + (f" (pytest {version})" if py else ""))
    if py and version != pinned("pytest"):
        rep.warn(f"pytest {version} is not the pinned {pinned('pytest')}; set LAB_PYTHON to a venv made from "
                 "requirements.txt")
    with tempfile.TemporaryDirectory(prefix="lab-a-check-") as tmp:
        if isinstance(key, dict):
            check_key(rep, key, lab, claims)
            check_claims(rep, key, claims, py, Path(tmp))
            check_bug(rep, key, keys_dir, py, Path(tmp))
            check_pages(rep, key)
        elif py:
            code, out, passed, _ = pytest(py, fresh_copy(Path(tmp), "buggy"))
            rep.check(code == 0, f"visible suite passes ({len(passed)} passed)", out[-1500:])
    print(f"{HERE.name}: {rep.passed} passed, {rep.failed} failed, {rep.warned} warning{'' if rep.warned == 1 else 's'}")
    return 1 if rep.failed else 0


if __name__ == "__main__":
    sys.exit(main())
