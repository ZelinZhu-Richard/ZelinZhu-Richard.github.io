#!/usr/bin/env python3
"""Self-check and grader for lab-h (Unfamiliar Stack Sprint). Python stdlib only.

Usage:
  python3 check.py [--keys DIR] [--verbose]   prove the lab works (run it AFTER the lab)
  python3 check.py --grade DIR [--keys DIR]   grade your practice copy (after the time box)

--keys defaults to the _key folder next to this file. Relative paths are
resolved from the current directory. Needs node >= 22.18 and git on PATH.

Default mode hides names: the wrong solutions show as W1..W8 (key.json order),
and failure details are counts. --verbose shows names and details (spoilers).
Even so, it is a self-test of the lab, not a setup check. Run it after you finish.

Default mode proves, with real runs:
  - the public files exist, lab.json is well formed, the repo uses only erasable
    TypeScript and has zero dependencies, and the README and repo leak no answers;
  - every file:line in the key matches the base repo;
  - visible tests pass on the base repo, and the bug in ISSUE.md reproduces;
  - every key claim (M8 practice) gives its documented probe output on the base repo;
  - hidden acceptance tests: regression + oracle pass and every bug and feature
    test fails on the base repo; all pass on two independent correct solutions
    (the reference 3 times, to catch flaky tests);
  - the reference's own new tests fail on the base repo (they catch the bug);
  - every hand-written wrong solution passes the visible tests but fails exactly
    the hidden tests the key predicts;
  - the --grade checks give known answers on known inputs: the dependency check,
    the revert-the-fix check and the wrong-solution sweep.
Prints PASS/FAIL lines. Exit code 1 if anything fails.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlparse

HERE = Path(__file__).resolve().parent
REPO = HERE / "repo"
FAILURES: list[str] = []
TEMP_DIRS: list[Path] = []
LAST_ERRORS: dict[str, str] = {}
CATEGORIES = ("oracle", "bug", "feature", "regression")
SKIP_DIRS = {".git", "node_modules", "acceptance"}
VERBOSE = False


def report(ok: bool, message: str) -> bool:
    print(("PASS " if ok else "FAIL ") + message)
    if not ok:
        FAILURES.append(message)
    return ok


def info(message: str) -> None:
    print("     " + message)


def detail(names) -> str:
    """Names of hidden tests are spoilers: show them only with --verbose."""
    names = sorted(names)
    return str(names) if VERBOSE else f"{len(names)} (run with --verbose for names)"


def run(cmd: list[str], cwd: Path, timeout: int = 180) -> subprocess.CompletedProcess:
    env = dict(os.environ, NODE_NO_WARNINGS="1", FORCE_COLOR="0", NO_COLOR="1")
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)


def fresh_copy(source: Path, label: str) -> Path:
    root = Path(tempfile.mkdtemp(prefix=f"lab-h-{label}-"))
    TEMP_DIRS.append(root)
    target = root / "repo"
    shutil.copytree(source, target, ignore=shutil.ignore_patterns(*SKIP_DIRS))
    return target


def apply_patch(target: Path, patch: Path) -> bool:
    result = run(["git", "apply", "--whitespace=nowarn", str(patch)], target)
    if result.returncode != 0:
        info(result.stderr.strip()[:500])
    return result.returncode == 0


def visible_tests(target: Path) -> tuple[bool, int, int]:
    result = run(["node", "--test", "--test-reporter=tap"], target)
    passed = re.search(r"^# pass (\d+)$", result.stdout, re.M)
    failed = re.search(r"^# fail (\d+)$", result.stdout, re.M)
    n_pass = int(passed.group(1)) if passed else 0
    n_fail = int(failed.group(1)) if failed else -1
    return result.returncode == 0 and n_fail == 0, n_pass, n_fail


def hidden_tests(target: Path, keys: Path, acceptance: list[str]) -> dict[str, str]:
    """Run the hidden tests in `target`. Returns {test name: 'pass' | 'fail'}."""
    dest = target / "acceptance"
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir()
    for rel in acceptance:
        shutil.copy(keys / rel, dest / Path(rel).name)
    reporter = (keys / "grader" / "reporter.mjs").resolve()
    files = [f"acceptance/{Path(rel).name}" for rel in acceptance]
    result = run(["node", "--test", f"--test-reporter={reporter}", *files], target)
    outcomes: dict[str, str] = {}
    LAST_ERRORS.clear()
    for line in result.stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue  # console output from the code under test
        if not isinstance(event, dict) or "status" not in event:
            continue
        name = event.get("name", "")
        if outcomes.get(name) == "fail":
            continue
        outcomes[name] = event["status"]
        if event["status"] == "fail":
            LAST_ERRORS[name] = event.get("error", "")
    shutil.rmtree(dest)
    return outcomes


def category(name: str) -> str:
    match = re.match(r"^\[(\w+)\] ", name)
    return match.group(1) if match else "load"


def by_category(outcomes: dict[str, str]) -> dict[str, dict[str, int]]:
    counts = {c: {"pass": 0, "fail": 0} for c in (*CATEGORIES, "load")}
    for name, status in outcomes.items():
        counts[category(name)][status] += 1
    return counts


def failing(outcomes: dict[str, str]) -> set[str]:
    return {n for n, s in outcomes.items() if s == "fail"}


TS_PROBLEMS = [
    (re.compile(r"^\s*(export\s+)?(declare\s+)?(const\s+)?enum\s+\w+", re.M), "enum"),
    (re.compile(r"^\s*(export\s+)?namespace\s+\w+\s*\{", re.M), "namespace"),
    (re.compile(r"constructor\s*\([^)]*\b(public|private|protected|readonly)\s+\w+", re.S), "parameter property"),
    (re.compile(r"^\s*import\s+\w+\s*=\s*require\(", re.M), "import alias"),
]
RELATIVE_IMPORT = re.compile(r"""(?:from|import)\s*\(?\s*['"](\.{1,2}/[^'"]+)['"]""")


def typescript_problems(root: Path) -> list[str]:
    problems = []
    for path in sorted(root.rglob("*.ts")):
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(root)
        for pattern, label in TS_PROBLEMS:
            if pattern.search(text):
                problems.append(f"{rel}: {label} (not erasable)")
        for spec in RELATIVE_IMPORT.findall(text):
            if not spec.endswith((".ts", ".js", ".mjs", ".json")):
                problems.append(f"{rel}: import '{spec}' has no file extension")
    return problems


def node_ok() -> bool:
    try:
        result = run(["node", "-p", "process.versions.node + ' ' + process.features.typescript"], HERE, 30)
    except FileNotFoundError:
        return report(False, "node is on PATH")
    version, _, mode = result.stdout.strip().partition(" ")
    parts = tuple(int(x) for x in version.split(".")[:2]) if version else (0, 0)
    ok = parts >= (22, 18) and mode in ("strip", "transform")
    return report(ok, f"node {version} runs TypeScript by type stripping (process.features.typescript = {mode or 'missing'})")


def text_files(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file() and not any(p in SKIP_DIRS for p in path.relative_to(root).parts):
            yield path


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ------------------------------------------------------------------ checks used by --grade

DEP_SECTIONS = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies",
                "bundleDependencies", "bundledDependencies")
NPM_LOCKFILES = ("package-lock.json", "npm-shrinkwrap.json")
OTHER_LOCKFILES = ("yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb")


def dependency_findings(root: Path) -> list[tuple[str, str, list[str]]]:
    """Dependency changes in `root` against the base repo (M1, M10).
    Returns (level, message, extra lines); level is FAIL or WARN."""
    found: list[tuple[str, str, list[str]]] = []
    base_text = (REPO / "package.json").read_text(encoding="utf-8")
    path = root / "package.json"
    mine_text = path.read_text(encoding="utf-8") if path.is_file() else ""
    try:
        mine = json.loads(mine_text)
    except ValueError:
        return [("FAIL", "package.json is missing or is not valid JSON", [])]
    base = json.loads(base_text)
    for section in DEP_SECTIONS:
        old, new = base.get(section) or {}, mine.get(section) or {}
        for name in sorted(set(new) - set(old)):
            found.append(("FAIL", f"new dependency in package.json: {section} -> {name}. None is needed (M1, M10)", []))
    if mine != base:
        diff = difflib.unified_diff(base_text.splitlines(), mine_text.splitlines(),
                                    "base/package.json", "yours/package.json", lineterm="", n=0)
        found.append(("WARN", "package.json changed. Can you defend each line from the tickets?", list(diff)[:20]))
    for name in NPM_LOCKFILES:
        lock = root / name
        if not lock.is_file():
            continue
        try:
            packages = [k.removeprefix("node_modules/") for k in json.loads(lock.read_text(encoding="utf-8")).get("packages", {}) if k]
        except (ValueError, AttributeError):
            packages = ["(unreadable)"]
        if packages:
            found.append(("FAIL", f"{name} lists installed packages: {', '.join(packages[:5])}", []))
        else:
            found.append(("WARN", f"{name} exists but lists no packages (a bare `npm install` makes it). Delete it", []))
    for name in OTHER_LOCKFILES:
        if (root / name).is_file():
            found.append(("WARN", f"{name} exists: a lockfile from another package manager. Read it", []))
    modules = root / "node_modules"
    if modules.is_dir():
        installed = sorted(p.name for p in modules.iterdir() if not p.name.startswith("."))
        if installed:
            found.append(("FAIL", f"node_modules/ holds installed packages: {', '.join(installed[:5])}", []))
        else:
            found.append(("WARN", "node_modules/ exists but holds no packages", []))
    return found


def revert_check(learner: Path, label: str) -> tuple[str, str]:
    """Put the base src/hash.ts back into a copy of `learner` and run its tests.
    Returns (status, message); status is pass, fail or warn."""
    base_hash = REPO / "src" / "hash.ts"
    mine = learner / "src" / "hash.ts"
    if not mine.is_file():
        return "warn", "src/hash.ts is missing, so check.py cannot revert your fix. Revert it by hand."
    if sha(mine) == sha(base_hash):
        return "warn", ("src/hash.ts is the same as in the base repo, so check.py cannot put the bug back. "
                        "If you fixed it elsewhere, revert that fix by hand and run your tests.")
    tree = fresh_copy(learner, label)
    shutil.copy(base_hash, tree / "src" / "hash.ts")
    ok, _, n_fail = visible_tests(tree)
    if ok:
        return "fail", "no test fails with the base src/hash.ts put back: no test of yours catches the bug"
    count = f"{n_fail} failing test(s)" if n_fail > 0 else "the suite fails"
    return "pass", f"with the base src/hash.ts put back, {count}: your bug test catches the bug"


TEST_NAME = re.compile(r"(^|[.\-_])test\.[cm]?[jt]s$|^test-[^/]*\.[cm]?[jt]s$")


def test_files(root: Path) -> list[Path]:
    """Files `node --test` treats as tests, plus everything under a test/ folder (fixtures)."""
    out = []
    for path in text_files(root):
        rel = path.relative_to(root)
        if "test" in rel.parts[:-1] or TEST_NAME.search(rel.name):
            out.append(rel)
    return out


def suite_outcomes(tree: Path, keys: Path) -> dict[tuple[str, str], str]:
    """Run every test in `tree`. Returns {(file, test name): 'pass' | 'fail'}."""
    reporter = (keys / "grader" / "reporter.mjs").resolve()
    try:
        result = run(["node", "--test", "--test-timeout=30000", f"--test-reporter={reporter}"], tree, 120)
    except subprocess.TimeoutExpired:
        return {("(suite)", "(timed out)"): "fail"}
    root = tree.resolve()
    outcomes: dict[tuple[str, str], str] = {}
    for line in result.stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict) or "status" not in event:
            continue
        file = str(event.get("file") or "")
        if file.startswith("file://"):
            file = unquote(urlparse(file).path)
        try:
            file = str(Path(file).resolve().relative_to(root))
        except (ValueError, OSError):
            pass
        key = (file, str(event.get("name", "")))
        if outcomes.get(key) != "fail":
            outcomes[key] = event["status"]
    return outcomes


def sweep(learner: Path, keys: Path, keys_data: dict) -> tuple[int, int, list[tuple[dict, int]]]:
    """Run the tests of `learner` on the reference and on each wrong solution.
    Returns (tests run on the reference, tests that pass there, [(wrong solution, tests that fail on it)]).
    Only tests that pass on the reference count, so a design-specific test cannot fake a catch."""
    mine = test_files(learner)

    def tree_for(sol: dict) -> Path | None:
        tree = fresh_copy(REPO, "sweep-" + sol["id"])
        if not apply_patch(tree, keys / sol["patch"]):
            return None
        for rel in test_files(tree):
            (tree / rel).unlink()
        for rel in mine:
            (tree / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(learner / rel, tree / rel)
        return tree

    ref = next(s for s in keys_data["solutions"] if s["id"] == "reference")
    ref_tree = tree_for(ref)
    if ref_tree is None:
        return 0, 0, []
    ref_out = suite_outcomes(ref_tree, keys)
    good = {k for k, s in ref_out.items() if s == "pass"}
    results = []
    for sol in [s for s in keys_data["solutions"] if s["kind"] == "wrong"]:
        tree = tree_for(sol)
        out = suite_outcomes(tree, keys) if tree else {("(patch)", "(did not apply)"): "fail"}
        hits = sum(1 for k in good if out.get(k) == "fail")
        new_failures = sum(1 for k, s in out.items() if s == "fail" and k not in ref_out)  # e.g. a file that no longer loads
        results.append((sol, hits + new_failures))
    return len(ref_out), len(good), results


# ------------------------------------------------------------------ prove mode

def check_public(keys_data: dict) -> None:
    required = ["README.md", "lab.json", "check.py", "repo/package.json", "repo/README.md", "repo/ISSUE.md",
                "repo/FEATURE.md", "repo/tsconfig.json", "repo/src/index.ts", "repo/docs/bucketing.md",
                "repo/docs/flag-format.md", "repo/docs/http-api.md"]
    missing = [r for r in required if not (HERE / r).is_file()]
    report(not missing, "public files exist" + (f" (missing: {', '.join(missing)})" if missing else ""))

    lab = json.loads((HERE / "lab.json").read_text(encoding="utf-8"))
    shape = (
        set(lab) >= {"id", "title", "language", "time", "trains", "covers"}
        and lab["id"] == "lab-h"
        and all(re.fullmatch(r"S\d{1,2}", s) for s in lab["trains"])
        and all(re.fullmatch(r"M\d{1,2}", m) for m in lab["covers"])
    )
    report(shape, f"lab.json is well formed (trains {', '.join(lab.get('trains', []))}; covers {', '.join(lab.get('covers', []))})")
    rows = set()
    for item in keys_data["defects"] + keys_data["solutions"] + keys_data["claims"] + keys_data["grade_checks"]:
        rows.update(item.get("mistake_rows", []))
    missing_rows = sorted(set(lab["covers"]) - rows)
    report(not missing_rows, "every mistake row in lab.json covers is practiced by a key item"
           + (f" (not practiced: {', '.join(missing_rows)})" if missing_rows else ""))

    pkg = json.loads((REPO / "package.json").read_text(encoding="utf-8"))
    report(pkg.get("type") == "module" and pkg.get("scripts", {}).get("test") == "node --test",
           'package.json: "type": "module" and test script "node --test"')
    deps = [k for k in DEP_SECTIONS if pkg.get(k)]
    report(not deps, "package.json has zero dependencies (nothing to install)")

    problems = typescript_problems(REPO)
    report(not problems, "base repo uses only erasable TypeScript with explicit .ts imports"
           + ("" if not problems else ": " + "; ".join(problems)))

    markers = [m.lower() for m in keys_data["leak_markers"]]
    leaks = []
    for path in [HERE / "README.md", *text_files(REPO)]:
        text = path.read_text(encoding="utf-8", errors="replace").lower()
        leaks += [f"{path.relative_to(HERE)} contains {m!r}" for m in markers if m in text]
    report(not leaks, "README.md and repo/ reveal no answer markers" + ("" if not leaks else ": " + "; ".join(leaks)))


def check_anchors(keys_data: dict) -> None:
    bad = []
    items = keys_data["defects"] + keys_data["anchors"] + keys_data["claims"]
    for item in items:
        lines = (REPO / item["file"]).read_text(encoding="utf-8").splitlines()
        line = lines[item["line"] - 1] if 0 < item["line"] <= len(lines) else ""
        if item["expect_text"] not in line:
            bad.append(f"{item['file']}:{item['line']} lacks {item['expect_text']!r}")
    shown = "; ".join(bad) if VERBOSE else f"{len(bad)} wrong (run with --verbose for details)"
    report(not bad, f"all {len(items)} key file:line references match the base repo" + ("" if not bad else ": " + shown))


REPRO = """
import { FlagStore } from './src/index.ts';
const store = new FlagStore();
store.load({ flags: [{ key: 'search-v2', enabled: true, variants: { treatment: true, control: false },
  defaultVariant: 'control', rollout: [{ variant: 'treatment', weight: 10 }, { variant: 'control', weight: 90 }] }] });
let n = 0;
for (let i = 0; i < 10000; i++) if (store.evaluate('search-v2', { targetingKey: `u-${i}` }).variant === 'treatment') n++;
console.log(JSON.stringify({ share: n / 10000, example: store.evaluate('search-v2', { targetingKey: 'u-1004' }).variant }));
"""


def run_script(base: Path, source: str) -> subprocess.CompletedProcess:
    script = base / "probe.ts"
    script.write_text(source, encoding="utf-8")
    try:
        return run(["node", "probe.ts"], base)
    finally:
        script.unlink()


def check_issue(base: Path, keys_data: dict) -> None:
    result = run_script(base, REPRO)
    try:
        data = json.loads(result.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        report(False, "issue repro script ran: " + result.stderr.strip()[:300])
        return
    expected = keys_data["issue_repro"]
    ok = data["share"] == expected["base_treatment_share"] and data["example"] == expected["base_variant"]
    report(ok, f"ISSUE.md reproduces on base: 10% rollout serves {data['share']:.2%} of u-0..u-9999; "
               f"u-1004 gets {data['example']!r} (contract: {expected['contract_variant']!r})")


def check_claims(base: Path, keys_data: dict) -> None:
    for claim in keys_data["claims"]:
        if "probe" not in claim:
            continue
        got = run_script(base, claim["probe"] + "\n").stdout.strip()
        shown = f" (prints {got!r}, key says {claim['probe_output']!r})" if VERBOSE or got != claim["probe_output"] else ""
        report(got == claim["probe_output"], f"claim {claim['id']}: its probe gives the key's output on base{shown}")


def summarize(outcomes: dict[str, str]) -> str:
    counts = by_category(outcomes)
    return ", ".join(f"{c} {counts[c]['pass']}/{counts[c]['pass'] + counts[c]['fail']}"
                     for c in CATEGORIES if counts[c]["pass"] + counts[c]["fail"])


def prove_grade_checks(ref_tree: Path, keys: Path, keys_data: dict) -> None:
    print("== The --grade checks give known answers")
    # Dependency check: quiet on the reference, loud on a copy that installed tsx.
    report(dependency_findings(ref_tree) == [], "dependency check: quiet on the reference solution")
    probe = fresh_copy(REPO, "deps")
    pkg = json.loads((probe / "package.json").read_text(encoding="utf-8"))
    pkg["devDependencies"] = {"tsx": "4.19.2"}
    pkg["scripts"]["test"] = "tsx --test"
    (probe / "package.json").write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
    lock = {"lockfileVersion": 3, "packages": {"": {"name": "togglebox"}, "node_modules/tsx": {"version": "4.19.2"}}}
    (probe / "package-lock.json").write_text(json.dumps(lock), encoding="utf-8")
    (probe / "node_modules" / "tsx").mkdir(parents=True)
    levels = [level for level, _, _ in dependency_findings(probe)]
    report(levels.count("FAIL") == 3 and levels.count("WARN") == 1,
           f"dependency check: an installed tsx gives 3 FAIL + 1 WARN (got {levels.count('FAIL')} FAIL + {levels.count('WARN')} WARN)")

    # Revert-the-fix check: catches the reference's bug test; flags a copy with no bug test.
    status, _ = revert_check(ref_tree, "revert-ref")
    report(status == "pass", "revert check: the reference's tests fail when the base src/hash.ts is put back")
    no_bug_test = fresh_copy(ref_tree, "revert-none")
    (no_bug_test / "test" / "bucketing.test.ts").unlink()
    status, _ = revert_check(no_bug_test, "revert-none-run")
    report(status == "fail", "revert check: flags a fixed copy that has no bug test")
    status, _ = revert_check(REPO, "revert-base")
    report(status == "warn", "revert check: warns when src/hash.ts is unchanged")

    # Sweep: the reference's tests catch every wrong solution; the base tests catch what the key predicts.
    want = next(c for c in keys_data["grade_checks"] if c["id"] == "sweep")
    for label, learner, expected in (("the reference's", ref_tree, want["reference_tests_catch"]),
                                     ("the base repo's", REPO, want["base_tests_catch"])):
        ran, usable, results = sweep(learner, keys, keys_data)
        caught = sum(1 for _, n in results if n)
        report(ran > 0 and caught == expected,
               f"sweep: {label} tests catch {caught} of {len(results)} wrong solutions "
               f"(key predicts {expected}; {usable} of {ran} tests pass on the reference)")


def prove(keys: Path) -> None:
    keys_data = json.loads((keys / "key.json").read_text(encoding="utf-8"))
    acceptance = keys_data["acceptance"]["files"]
    expected_counts = keys_data["acceptance"]["categories"]
    total = sum(expected_counts.values())
    if not VERBOSE:
        print("Names are hidden: wrong solutions show as W1..W8 (key.json order). --verbose shows them.")

    print("== Public files and metadata")
    check_public(keys_data)
    check_anchors(keys_data)
    print("== Toolchain")
    if not node_ok():
        return

    print("== Base repo")
    base = fresh_copy(REPO, "base")
    ok, n_pass, n_fail = visible_tests(base)
    report(ok, f"visible tests pass on base ({n_pass} passed, {n_fail} failed)")
    check_issue(base, keys_data)
    check_claims(base, keys_data)
    outcomes = hidden_tests(base, keys, acceptance)
    counts = by_category(outcomes)
    report(sum(v["pass"] + v["fail"] for v in counts.values()) == total and counts["load"] == {"pass": 0, "fail": 0},
           f"all {total} hidden tests ran on base, none failed to load")
    for cat, want in keys_data["acceptance"]["base_expectation"].items():
        got = counts[cat]
        n = got["pass"] + got["fail"]
        report(n == expected_counts[cat] and got[want] == n,
               f"base: hidden {cat} tests all {want} ({got[want]}/{n})")

    print("== Correct solutions")
    ref_tree = None
    for sol in [s for s in keys_data["solutions"] if s["kind"] == "correct"]:
        tree = fresh_copy(REPO, sol["id"])
        if not report(apply_patch(tree, keys / sol["patch"]), f"{sol['id']}: patch applies to a fresh copy"):
            continue
        ok, n_pass, n_fail = visible_tests(tree)
        report(ok, f"{sol['id']}: visible tests pass ({n_pass} passed, {n_fail} failed)")
        problems = typescript_problems(tree)
        report(not problems, f"{sol['id']}: only erasable TypeScript" + ("" if not problems else ": " + "; ".join(problems)))
        runs = 3 if sol["id"] == "reference" else 1
        stable = True
        for i in range(runs):
            outcomes = hidden_tests(tree, keys, acceptance)
            all_pass = len(outcomes) == total and not failing(outcomes)
            stable &= all_pass
            if not all_pass:
                info(f"run {i + 1}: failing {detail(failing(outcomes))}")
        report(stable, f"{sol['id']}: all {total} hidden tests pass in {runs} run(s) ({summarize(outcomes)})")
        if sol["id"] == "reference":
            ref_tree = tree
            # Mutation-style check: the reference's NEW tests must fail on the base code.
            new_tests = sorted(p.relative_to(tree) for p in (tree / "test").glob("*.test.ts")
                               if not (REPO / p.relative_to(tree)).exists())
            probe = fresh_copy(REPO, "probe")
            for rel in new_tests:
                shutil.copy(tree / rel, probe / rel)
            ok, n_pass, n_fail = visible_tests(probe)
            report(bool(new_tests) and not ok and n_fail > 0,
                   f"reference's {len(new_tests)} new test files fail on base code ({n_fail} failing)")

    print("== Hand-written wrong solutions (a hand-picked set: counts, not an error rate)")
    wrong = [s for s in keys_data["solutions"] if s["kind"] == "wrong"]
    rejected = 0
    for i, sol in enumerate(wrong, 1):
        label = sol["id"] if VERBOSE else f"W{i}"
        tree = fresh_copy(REPO, f"w{i}")
        if not report(apply_patch(tree, keys / sol["patch"]), f"{label}: patch applies"):
            continue
        ok, n_pass, _ = visible_tests(tree)
        report(ok, f"{label}: looks green on the visible tests ({n_pass} passed)")
        outcomes = hidden_tests(tree, keys, acceptance)
        got, want = failing(outcomes), set(sol["expect_fail"])
        if got:
            rejected += 1
        report(got == want and len(outcomes) == total,
               f"{label}: hidden tests fail exactly as the key predicts ({len(got)} failing: {summarize(outcomes)})")
        if got != want:
            info(f"unexpected failures: {detail(got - want)}; missing failures: {detail(want - got)}")
    report(rejected == len(wrong), f"hidden tests rejected {rejected} of {len(wrong)} hand-written wrong solutions")

    if ref_tree is not None:
        prove_grade_checks(ref_tree, keys, keys_data)
    else:
        report(False, "the --grade checks need the reference solution, which did not apply")


# ------------------------------------------------------------------ grade mode

def grade(target_dir: Path, keys: Path) -> None:
    keys_data = json.loads((keys / "key.json").read_text(encoding="utf-8"))
    acceptance = keys_data["acceptance"]["files"]
    if not (target_dir / "package.json").is_file():
        report(False, f"{target_dir} is not a togglebox copy (no package.json)")
        return
    if not node_ok():
        return
    print("== Your visible tests")
    tree = fresh_copy(target_dir, "grade")
    ok, n_pass, n_fail = visible_tests(tree)
    _, base_pass, _ = visible_tests(fresh_copy(REPO, "grade-base"))
    report(ok, f"your test suite passes ({n_pass} passed, {n_fail} failed)")
    report(n_pass > base_pass, f"you added tests ({n_pass} now vs {base_pass} in the base repo)")
    problems = typescript_problems(tree)
    report(not problems, "only erasable TypeScript with explicit .ts imports" + ("" if not problems else ": " + "; ".join(problems)))

    print("== Does your bug test catch the bug? (revert-the-fix check, S12)")
    if ok:
        status, message = revert_check(target_dir, "grade-revert")
        if status == "warn":
            print("WARN " + message)
        else:
            report(status == "pass", message)
    else:
        print("WARN skipped: your own suite must pass first")

    print("== Dependencies (M1, M10)")
    findings = dependency_findings(target_dir)
    for level, message, extra in findings:
        if level == "FAIL":
            report(False, message)
        else:
            print("WARN " + message)
        for line in extra:
            info(line)
    if not findings:
        print("PASS no new dependency, no lockfile, no node_modules/, package.json unchanged")

    print("== Changes to the original tests (review each one: legitimate, or test gaming?)")
    changed = 0
    for original in sorted((REPO / "test").rglob("*")):
        if not original.is_file():
            continue
        rel = original.relative_to(REPO)
        mine = target_dir / rel
        if not mine.exists():
            changed += 1
            print(f"WARN {rel} was deleted")
        elif sha(mine) != sha(original):
            changed += 1
            print(f"WARN {rel} was changed:")
            diff = difflib.unified_diff(original.read_text(encoding="utf-8").splitlines(),
                                        mine.read_text(encoding="utf-8").splitlines(), "base/" + str(rel), "yours/" + str(rel), lineterm="", n=1)
            for line in list(diff)[:40]:
                info(line)
    if changed == 0:
        print("PASS no original test file changed")

    print("== Hidden acceptance tests")
    outcomes = hidden_tests(tree, keys, acceptance)
    for name in sorted(outcomes):
        print(("PASS " if outcomes[name] == "pass" else "FAIL ") + name)
        if outcomes[name] == "fail" and LAST_ERRORS.get(name):
            for line in LAST_ERRORS[name].splitlines()[:4]:
                info(line)
    counts = by_category(outcomes)
    for cat in CATEGORIES:
        got = counts[cat]
        n = got["pass"] + got["fail"]
        report(n > 0 and got["fail"] == 0, f"{cat}: {got['pass']}/{n} hidden tests pass")
    if counts["load"]["fail"]:
        report(False, f"{counts['load']['fail']} hidden test file(s) failed to load (did you rename a public export?)")

    print("== Your tests against the hand-written wrong solutions (this names them)")
    ran, usable, results = sweep(target_dir, keys, keys_data)
    if usable == 0:
        print("WARN none of your tests pass on the reference solution, so this sweep cannot judge them")
        return
    if ran > usable:
        print(f"WARN {ran - usable} of your {ran} tests fail on the reference solution. They may test your own "
              "design (a new module, an exact message). They are left out here.")
    for sol, n in results:
        if n:
            print(f"PASS caught {sol['id']} ({n} failing test(s))")
        else:
            print(f"WARN missed {sol['id']}: {sol['mistake']}")
    caught = sum(1 for _, n in results if n)
    info(f"Your tests catch {caught} of {len(results)}. A hand-picked set: a count, not a test-quality score.")
    info("Each miss is a rule in FEATURE.md or docs/bucketing.md that no test of yours pins down.")
    info("Next: the debrief in key.md, in your local answer keys.")


def main() -> int:
    global VERBOSE
    parser = argparse.ArgumentParser(description="Self-check and grader for lab-h.")
    parser.add_argument("--keys", type=Path, default=None, help="answer key folder (default: _key next to this file)")
    parser.add_argument("--grade", type=Path, default=None, help="your practice copy to grade")
    parser.add_argument("--verbose", action="store_true", help="self-check: show the names of wrong solutions and failing tests (spoilers)")
    args = parser.parse_args()
    VERBOSE = args.verbose
    keys = (args.keys.resolve() if args.keys else HERE / "_key")
    if not (keys / "key.json").is_file():
        print(f"FAIL answer keys not found in {keys} (pass --keys DIR with your local answer keys)")
        return 1
    if shutil.which("git") is None or shutil.which("node") is None:
        print("FAIL git and node must be on PATH")
        return 1
    try:
        if args.grade:
            grade(args.grade.resolve(), keys)
        else:
            prove(keys)
    finally:
        for path in TEMP_DIRS:
            shutil.rmtree(path, ignore_errors=True)
    print()
    if FAILURES:
        print(f"RESULT: FAIL ({len(FAILURES)} failing check(s))")
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
