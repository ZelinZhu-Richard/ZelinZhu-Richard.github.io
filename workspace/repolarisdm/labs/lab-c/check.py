#!/usr/bin/env python3
"""Prove that Lab C ("Spot the Bad Agent Patch") works. Standard library only.

WARNING: the --details output names every defect. Use --details only after you
have scored yourself. The default output is a short summary with no answers.

Usage:
    python3 check.py [--keys DIR] [--details]

DIR is the folder with key.json, hidden/ and reference/ (default: ./_key next to
this file). The script never edits the lab. It copies repo/ into temporary
folders, applies each patch with `git apply`, runs the tests with unittest, and
checks every claim in the key:

- the base repo passes its own tests and the hidden regression tests;
- every planted bug or missing feature reproduces on the base repo;
- every patch applies cleanly;
- clean patches and reference fixes pass the visible tests, the original tests,
  the hidden regression tests and the hidden ticket tests;
- every flawed patch shows its defect: a named hidden test fails for the stated
  reason, or a grep-able fact in the diff or transcript holds;
- every file:line in the key points at the stated text;
- the public files do not leak the answers;
- no surface feature tells clean from flawed: not the style of the final
  message, not the wording of its "tests pass" claim, not the number of new
  tests, and not the red-flag scan (labs/redflags.sh) on its own.

By default it prints one PASS or FAIL line per group of checks. --details
prints every check and a raw-outcome table per patch. It exits non-zero if
anything fails.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

LAB = Path(__file__).resolve().parent
SYNTHETIC = "Synthetic, written for practice. Not real Gemini output."
ROWS = {f"M{i}" for i in range(1, 11)}
STEPS = {f"S{i}" for i in range(16)}
REQUIRED_ROWS = {"M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M10"}

RUNNER = r'''
import json, os, sys, unittest, warnings
sys.dont_write_bytecode = True
repo, out, suites = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
os.chdir(repo)
sys.path.insert(0, repo)
warnings.simplefilter("default")


class Collect(unittest.TestResult):
    def __init__(self):
        super().__init__()
        self.buffer = True
        self.outcomes = {}

    def _put(self, test, status, err=None):
        text = self._exc_info_to_string(err, test) if err else ""
        previous = self.outcomes.get(test.id())
        if previous and previous[0] != "pass" and status == "pass":
            return
        if previous and previous[0] != "pass":
            return
        self.outcomes[test.id()] = [status, text]

    def addSuccess(self, test):
        self._put(test, "pass")

    def addFailure(self, test, err):
        self._put(test, "fail", err)

    def addError(self, test, err):
        self._put(test, "error", err)

    def addSubTest(self, test, subtest, err):
        if err is not None:
            failed = issubclass(err[0], test.failureException)
            self._put(test, "fail" if failed else "error", err)

    def addSkip(self, test, reason):
        self._put(test, "skip")

    def addExpectedFailure(self, test, err):
        self._put(test, "pass")

    def addUnexpectedSuccess(self, test):
        self._put(test, "fail")


report = {}
for name, start, top, pattern in suites:
    suite = unittest.TestLoader().discover(start, pattern=pattern, top_level_dir=top)
    result = Collect()
    suite.run(result)
    report[name] = result.outcomes
with open(out, "w", encoding="utf-8") as handle:
    json.dump(report, handle)
'''


class Checker:
    def __init__(self, keys: Path, details: bool = False):
        self.keys = keys
        self.details = details
        self.failures = 0
        self.passes = 0
        self.section = ""
        self.section_counts = [0, 0]  # passed, failed
        self.tmp = Path(tempfile.mkdtemp(prefix="lab-c-check-"))
        self.runner = self.tmp / "runner.py"
        self.runner.write_text(RUNNER, encoding="utf-8")
        self.hidden = self.tmp / "hidden"
        self.key: dict = {}
        self.table: list[str] = []

    # -- reporting ---------------------------------------------------------
    def ok(self, condition: bool, message: str, detail: str = "") -> bool:
        self.section_counts[0 if condition else 1] += 1
        if condition:
            self.passes += 1
        else:
            self.failures += 1
        if self.details:
            print(f"{'PASS' if condition else 'FAIL'} {message}")
            if detail and not condition:
                print("     " + detail.strip().replace("\n", "\n     ")[:1500])
        return condition

    def begin(self, section: str) -> None:
        """Start a group of checks. Without --details, each group prints one line."""
        self.end()
        self.section, self.section_counts = section, [0, 0]
        if self.details:
            print(f"\n== {section}")

    def end(self) -> None:
        if not self.section or self.details:
            return
        passed, failed = self.section_counts
        if failed:
            print(f"FAIL {self.section}: {failed} of {passed + failed} checks failed "
                  "(run with --details to see which; that output names the defects)")
        else:
            print(f"PASS {self.section}: {passed} checks")
        self.section = ""

    # -- helpers -----------------------------------------------------------
    def fresh_tree(self, name: str) -> Path:
        target = self.tmp / name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(LAB / "repo", target, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache", ".venv"))
        return target

    def apply(self, tree: Path, diff: Path) -> tuple[bool, str]:
        for args in (["git", "apply", "--check", str(diff)], ["git", "apply", str(diff)]):
            result = subprocess.run(args, cwd=tree, capture_output=True, text=True)
            if result.returncode != 0:
                return False, result.stderr
        return True, ""

    def run_tests(self, tree: Path, suites: list[tuple[str, str, str, str]]) -> dict:
        out = self.tmp / f"result-{tree.name}.json"
        command = [sys.executable, "-B", "-I", str(self.runner), str(tree), str(out), json.dumps(suites)]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=300)
        except subprocess.TimeoutExpired:
            return {"_crash": "timeout"}
        if result.returncode != 0 or not out.exists():
            return {"_crash": result.stdout + result.stderr}
        return json.loads(out.read_text(encoding="utf-8"))

    def suites(self, tree: Path, ticket: str | None, *, visible=True, common=True) -> list:
        suites = []
        if visible:
            suites.append(("visible", str(tree / "tests"), str(tree), "test*.py"))
        if common:
            suites.append(("common", str(self.hidden), str(self.hidden), self.key["hidden"]["common"]))
        if ticket:
            suites.append(("ticket", str(self.hidden), str(self.hidden), self.key["hidden"]["tickets"][ticket]))
        return suites

    @staticmethod
    def failing(outcomes: dict) -> dict:
        return {k: v for k, v in outcomes.items() if v[0] in ("fail", "error")}

    def base_tests_on(self, tree: Path, name: str) -> dict:
        """Run the ORIGINAL visible tests against a patched tree."""
        copy = self.tmp / name
        if copy.exists():
            shutil.rmtree(copy)
        shutil.copytree(tree, copy)
        shutil.rmtree(copy / "tests")
        shutil.copytree(LAB / "repo" / "tests", copy / "tests", ignore=shutil.ignore_patterns("__pycache__"))
        return self.run_tests(copy, self.suites(copy, None, common=False)).get("visible", {})

    # -- checks ------------------------------------------------------------
    def check_structure(self) -> None:
        meta = json.loads((LAB / "lab.json").read_text(encoding="utf-8"))
        self.ok(set(meta) >= {"id", "title", "language", "time", "trains", "covers"}, "lab.json has id, title, language, time, trains, covers")
        self.ok(meta.get("id") == "lab-c", "lab.json id is lab-c")
        self.key = json.loads((self.keys / "key.json").read_text(encoding="utf-8"))
        patches = self.key["patches"]
        ids = [f"{i:02d}" for i in range(1, 13)]
        self.ok(sorted(patches) == ids, "key covers patches 01..12")
        for pid in ids:
            folder = LAB / "patches" / pid
            have = all((folder / f).is_file() for f in ("patch.diff", "task.md", "transcript.md"))
            self.ok(have, f"patch {pid} has patch.diff, task.md, transcript.md")
            if have:
                first = (folder / "transcript.md").read_text(encoding="utf-8").splitlines()[0]
                self.ok(first == SYNTHETIC, f"patch {pid} transcript starts with the synthetic label")
        verdicts = [p["verdict"] for p in patches.values()]
        self.ok(verdicts.count("flawed") == 10 and verdicts.count("clean") == 2, "10 flawed and 2 clean patches")
        rows = {p["row"] for p in patches.values() if p["verdict"] == "flawed"}
        self.ok(REQUIRED_ROWS <= rows, f"flawed patches cover {sorted(REQUIRED_ROWS)}", f"covered: {sorted(rows)}")
        self.ok(set(meta["covers"]) == rows, "lab.json covers matches the key's mistake rows", f"{meta['covers']} vs {sorted(rows)}")
        for pid, entry in patches.items():
            if entry["verdict"] == "flawed":
                good = (entry["row"] in ROWS and entry["catching_step"] in STEPS
                        and all(s in STEPS for s in entry["also_caught_by"])
                        and all(r in ROWS and r != entry["row"] for r in entry["accepted_rows"]))
                complete = bool(good and entry["evidence"] and entry["where"])
                self.ok(complete, f"patch {pid} names a mistake row, a catching step, evidence and file:line")
        used_steps = set()
        for entry in patches.values():
            if entry["verdict"] == "flawed":
                used_steps |= {entry["catching_step"], *entry["also_caught_by"]}
        unbacked = sorted(set(meta["trains"]) - used_steps)
        self.ok(not unbacked, "lab.json trains only steps that catch at least one patch in the key", f"no patch for {unbacked}")
        readme = (LAB / "README.md").read_text(encoding="utf-8")
        for pid in ids:
            self.ok(re.search(rf"^\| {pid} \|\s*\|\s*\|\s*\|", readme, re.M) is not None, f"README scoring sheet has an empty row for patch {pid}")

    def check_no_leaks(self) -> None:
        public = [LAB / "README.md", LAB / "lab.json"]
        public += [p for p in (LAB / "repo").rglob("*") if p.is_file() and "__pycache__" not in p.parts]
        public += [p for p in (LAB / "patches").rglob("*.md")]
        bad = re.compile(
            r"planted|answer key|hidden test|mistake (?:card|row)|test gaming|overselling|solution lookup|"
            r"invented api|symptom-only|silent damage|similar-but-different|special[- ]cas",
            re.I,
        )
        offenders = []
        for path in public:
            text = path.read_text(encoding="utf-8", errors="replace")
            if path.parent.name.isdigit() or path.is_relative_to(LAB / "repo"):
                hit = bad.search(text)
                if hit:
                    offenders.append(f"{path.relative_to(LAB)}: {hit.group(0)!r}")
        self.ok(not offenders, "repo/ and patches/*.md do not name defects or mistake types", "\n".join(offenders))
        readme = (LAB / "README.md").read_text(encoding="utf-8")
        leaked = [p for p, e in self.key["patches"].items() if e["verdict"] == "flawed" and e["title"] in readme]
        self.ok(not leaked, "README does not contain the key's defect titles", str(leaked))
        self.ok("_key" not in readme, "README does not point at the key folder")

    def check_base(self) -> None:
        tree = self.fresh_tree("base")
        tickets = sorted(self.key["hidden"]["tickets"])
        suites = self.suites(tree, None)
        for pid in tickets:
            suites.append((f"t{pid}", str(self.hidden), str(self.hidden), self.key["hidden"]["tickets"][pid]))
        report = self.run_tests(tree, suites)
        if not self.ok("_crash" not in report, "base: test runner works", report.get("_crash", "")):
            return
        visible = report["visible"]
        self.ok(visible and not self.failing(visible), f"base: all {len(visible)} visible tests pass", json.dumps(self.failing(visible))[:800])
        common = report["common"]
        self.ok(common and not self.failing(common), f"base: all {len(common)} hidden regression tests pass", json.dumps(self.failing(common))[:800])
        for pid in tickets:
            outcomes = report[f"t{pid}"]
            for test in self.key["reproduces_on_base"][pid]:
                status = outcomes.get(test, ["missing"])[0]
                self.ok(status in ("fail", "error"), f"base: ticket {pid} bug or missing feature reproduces ({test} -> {status})")

    def check_patch(self, pid: str) -> None:
        entry = self.key["patches"][pid]
        folder = LAB / "patches" / pid
        tree = self.fresh_tree(f"patch-{pid}")
        applied, err = self.apply(tree, folder / "patch.diff")
        if not self.ok(applied, f"patch {pid}: applies cleanly to repo/", err):
            return
        report = self.run_tests(tree, self.suites(tree, pid))
        if not self.ok("_crash" not in report, f"patch {pid}: test runner works", report.get("_crash", "")):
            return
        visible, common, ticket = report["visible"], report["common"], report["ticket"]
        base_visible = self.base_tests_on(tree, f"patch-{pid}-basetests")
        allowed = set(self.key.get("spec_changes_to_visible_tests", {}).get(pid, []))
        original_failing = {k: v for k, v in self.failing(base_visible).items() if k not in allowed}
        transcript = (folder / "transcript.md").read_text(encoding="utf-8")
        diff = (folder / "patch.diff").read_text(encoding="utf-8")

        visible_state = "fail" if self.failing(visible) else "pass"
        self.table.append(
            f"| {pid} | {entry['verdict']} | {self.count(visible)} | {self.count(base_visible)} | "
            f"{self.count(common)} | {self.count(ticket)} |"
        )
        self.ok(visible_state == entry["visible_after_patch"],
                f"patch {pid}: the patch's own tests {entry['visible_after_patch']} ({len(visible)} tests)",
                json.dumps(self.failing(visible))[:800])
        claim = self.final_claim(transcript)
        claim_true = claim is not None and claim == len(visible) and visible_state == "pass"
        self.ok(claim_true == entry["claim_true"],
                f"patch {pid}: the final 'tests pass' claim is {'true' if entry['claim_true'] else 'false'} (claimed {claim}, ran {len(visible)}, {visible_state})")

        if entry["verdict"] == "clean":
            self.ok(not original_failing, f"patch {pid}: original visible tests still pass", json.dumps(original_failing)[:800])
            self.ok(not self.failing(common), f"patch {pid}: all {len(common)} hidden regression tests pass", json.dumps(self.failing(common))[:800])
            self.ok(ticket and not self.failing(ticket), f"patch {pid}: all {len(ticket)} hidden ticket tests pass", json.dumps(self.failing(ticket))[:800])
        else:
            for item in entry["evidence"]:
                self.check_evidence(pid, item, visible, base_visible, common, ticket, transcript, diff)
        for where in entry["where"]:
            if where.get("transcript"):
                lines = transcript.splitlines()
                label = f"patches/{pid}/transcript.md:{where['line']}"
            else:
                path = tree / where["tree"]
                lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
                label = f"{where['tree']}:{where['line']}"
            line = lines[where["line"] - 1] if 0 < where["line"] <= len(lines) else ""
            self.ok(where["contains"] in line, f"patch {pid}: key location {label} shows {where['contains']!r}", f"line is: {line!r}")

    def count(self, outcomes: dict) -> str:
        failed = len(self.failing(outcomes))
        return f"{len(outcomes) - failed}/{len(outcomes)}"

    @staticmethod
    def final_claim(transcript: str) -> int | None:
        final = transcript.split("## Agent (final message)")[-1]
        match = re.search(r"All (\d+) tests pass|(\d+) passed", final)
        return int(match.group(1) or match.group(2)) if match else None

    def check_evidence(self, pid, item, visible, base_visible, common, ticket, transcript, diff) -> None:
        kind = item["kind"]
        label = f"patch {pid}: evidence {kind}"
        hidden = {**common, **ticket}
        if kind in ("hidden_fails", "visible_fails", "base_visible_fails"):
            pool = {"hidden_fails": hidden, "visible_fails": visible, "base_visible_fails": base_visible}[kind]
            status, text = pool.get(item["test"], ["missing", ""])
            expect = item.get("expect", "")
            self.ok(status in ("fail", "error") and expect in text, f"{label} {item['test']} -> {status}" + (f", shows {expect!r}" if expect else ""), text[-800:])
        elif kind == "hidden_passes":
            failing = self.failing(ticket)
            self.ok(ticket and not failing, f"{label}: the code passes all {len(ticket)} hidden ticket tests (the flaw is in the process)", json.dumps(failing)[:800])
        elif kind in ("diff_adds", "diff_removes"):
            sign = "+" if kind == "diff_adds" else "-"
            lines = self.diff_lines(diff, sign, item.get("file"))
            self.ok(any(re.search(item["pattern"], line) for line in lines), f"{label} /{item['pattern']}/" + (f" in {item['file']}" if item.get("file") else ""))
        elif kind == "transcript_has":
            self.ok(re.search(item["pattern"], transcript, re.M) is not None, f"{label} /{item['pattern']}/")
        elif kind == "transcript_lacks":
            self.ok(re.search(item["pattern"], transcript, re.M) is None, f"{label} /{item['pattern']}/ (never happens)")
        elif kind == "final_lacks":
            final = transcript.split("## Agent (final message)")[-1]
            self.ok(re.search(item["pattern"], final) is None, f"{label}: final message never mentions /{item['pattern']}/")
        elif kind in ("base_lacks", "base_has"):
            text = (LAB / "repo" / item["path"]).read_text(encoding="utf-8")
            found = re.search(item["pattern"], text) is not None
            self.ok(found == (kind == "base_has"), f"{label}: repo/{item['path']} {'contains' if kind == 'base_has' else 'lacks'} /{item['pattern']}/")
        elif kind == "stdlib_lacks":
            code = f"import {item['module']}; print(hasattr({item['module']}, {item['attr']!r}))"
            result = subprocess.run([sys.executable, "-I", "-c", code], capture_output=True, text=True)
            self.ok(result.stdout.strip() == "False", f"{label}: {item['module']}.{item['attr']} does not exist in Python {sys.version.split()[0]}")
        elif kind == "stale_test_run":
            lines = transcript.splitlines()
            runs = [i for i, line in enumerate(lines) if re.match(r"\$ (python3? -m (pytest|unittest)|pytest)\b", line)]
            edits = [i for i, line in enumerate(lines) if line.startswith(("**Tool call: edit", "**Tool call: write"))]
            stale = bool(runs and edits and max(runs) < max(edits))
            self.ok(stale, f"{label}: last test run (line {max(runs) + 1 if runs else '-'}) comes before the last edit (line {max(edits) + 1 if edits else '-'})")
        else:
            self.ok(False, f"{label}: unknown evidence kind")

    @staticmethod
    def diff_lines(diff: str, sign: str, only_file: str | None) -> list[str]:
        current, out = None, []
        for line in diff.splitlines():
            if line.startswith("diff --git "):
                current = line.split(" b/", 1)[-1]
            elif line.startswith(("+++", "---")):
                continue
            elif line.startswith(sign) and (only_file is None or current == only_file):
                out.append(line[1:])
        return out

    # -- surface features ----------------------------------------------------
    @staticmethod
    def removed_test_lines(diff: str) -> int:
        current, count = None, 0
        for line in diff.splitlines():
            if line.startswith("diff --git "):
                current = line.split(" b/", 1)[-1]
            elif line.startswith(("+++", "---")):
                continue
            elif line.startswith("-") and current and current.startswith("tests/") and line[1:].strip():
                count += 1
        return count

    def surface(self, pid: str) -> dict:
        """Features a reviewer sees without reading the code."""
        folder = LAB / "patches" / pid
        transcript = (folder / "transcript.md").read_text(encoding="utf-8")
        diff = (folder / "patch.diff").read_text(encoding="utf-8")
        final = transcript.split("## Agent (final message)")[-1].strip()
        if re.search(r"All \d+ tests pass", final):
            claim = "All N tests pass"
        elif re.search(r"\d+ passed \(output above\)", final):
            claim = "N passed (output above)"
        else:
            claim = "other"
        return {
            "bulleted final message": bool(re.search(r"^- ", final, re.M)),
            "wording of the tests-pass claim": claim,
            "number of new tests": len(re.findall(r"^\+[ \t]+def test_", diff, re.M)),
            "final message longer than 60 words": len(final.split()) > 60,
            "edits existing lines in tests/": self.removed_test_lines(diff) > 0,
        }

    def redflags(self, pid: str) -> list[tuple[str, str]] | None:
        """(level, row) for every hit of labs/redflags.sh, or None if it cannot run."""
        script, bash = LAB.parent / "redflags.sh", shutil.which("bash")
        if not script.is_file() or bash is None:
            return None
        folder = LAB / "patches" / pid
        result = subprocess.run([bash, str(script), str(folder / "patch.diff"), str(folder / "transcript.md")],
                                capture_output=True, text=True, timeout=120)
        return re.findall(r"^(FLAG|NOTE)\s+(\S+)", result.stdout, re.M)

    def check_surface(self) -> None:
        patches = self.key["patches"]
        clean = sorted(p for p, e in patches.items() if e["verdict"] == "clean")
        flawed = sorted(p for p, e in patches.items() if e["verdict"] == "flawed")
        profiles = {pid: self.surface(pid) for pid in sorted(patches)}
        need = 2  # every clean patch must look like at least this many flawed ones

        def look_alikes(c: str, features: tuple[str, ...]) -> int:
            return sum(all(profiles[f][x] == profiles[c][x] for x in features) for f in flawed)

        for feature in profiles[clean[0]]:
            lonely = [f"{c}={profiles[c][feature]!r} matches {look_alikes(c, (feature,))} flawed"
                      for c in clean if look_alikes(c, (feature,)) < need]
            self.ok(not lonely, f"surface: '{feature}' does not tell clean from flawed (each clean patch shares its value with {need}+ flawed ones)",
                    "; ".join(lonely))
        core = ("bulleted final message", "wording of the tests-pass claim", "number of new tests")
        lonely = [c for c in clean if look_alikes(c, core) < need]
        self.ok(not lonely, f"surface: message style, claim wording and new-test count together do not tell clean from flawed ({need}+ flawed look-alikes per clean patch)",
                json.dumps({c: {x: profiles[c][x] for x in core} for c in lonely}))

        hits = {pid: self.redflags(pid) for pid in sorted(patches)}
        if any(h is None for h in hits.values()):
            print("SKIP red-flag checks: labs/redflags.sh or bash not found")
            return
        unflagged = [c for c in clean if not any(level == "FLAG" for level, _ in hits[c])]
        self.ok(not unflagged, "red flags: every clean patch gets at least one FLAG, so 'any FLAG means flawed' raises false alarms",
                f"no FLAG on {unflagged}")
        caught, false_alarms = 0, 0
        for pid, entry in patches.items():
            rows = [row for level, row in hits[pid] if level == "FLAG"]
            if not rows:
                continue
            if entry["verdict"] == "clean":
                false_alarms += 1
            elif max(set(rows), key=rows.count) in [entry["row"], *entry["accepted_rows"]]:
                caught += 1
        passes = caught >= 9 and false_alarms <= 1
        self.ok(not passes, "red flags: copying the scan's verdict and row does not pass the lab",
                f"caught {caught} of {len(flawed)}, {false_alarms} false alarm(s)")

    def check_reference(self, pid: str) -> None:
        ref = self.key["references"][pid]
        diff = LAB / "patches" / ref.split(":", 1)[1] / "patch.diff" if ref.startswith("patch:") else self.keys / ref
        tree = self.fresh_tree(f"ref-{pid}")
        applied, err = self.apply(tree, diff)
        if not self.ok(applied, f"reference {pid}: applies cleanly", err):
            return
        report = self.run_tests(tree, self.suites(tree, pid))
        if not self.ok("_crash" not in report, f"reference {pid}: test runner works", report.get("_crash", "")):
            return
        allowed = set(self.key.get("spec_changes_to_visible_tests", {}).get(pid, []))
        base_visible = self.failing(self.base_tests_on(tree, f"ref-{pid}-basetests"))
        unexpected = {k: v for k, v in base_visible.items() if k not in allowed}
        good = not self.failing(report["visible"]) and not unexpected and not self.failing(report["common"]) and report["ticket"] and not self.failing(report["ticket"])
        detail = json.dumps({"visible": self.failing(report["visible"]), "original": unexpected,
                             "common": self.failing(report["common"]), "ticket": self.failing(report["ticket"])})[:1200]
        self.ok(good, f"reference {pid}: passes visible, original, regression and all {len(report['ticket'])} ticket tests", detail)

    def run(self) -> int:
        if not (self.keys / "key.json").is_file():
            print(f"FAIL no key.json in {self.keys} (pass --keys DIR with your local answer keys)")
            return 2
        if not self.details:
            print("Lab C self-check. Summary only: it names no defects. --details does (spoilers).\n")
        try:
            self.begin("lab structure and key format")
            self.check_structure()
            hidden_src = self.keys / self.key["hidden"]["dir"]
            shutil.copytree(hidden_src, self.hidden, ignore=shutil.ignore_patterns("__pycache__"))
            self.begin("public files do not leak the answers")
            self.check_no_leaks()
            self.begin("base repo: tests pass, and every ticket's problem reproduces")
            self.check_base()
            self.begin("patches 01-12: apply, run, and match every claim in the key")
            for pid in sorted(self.key["patches"]):
                self.check_patch(pid)
            self.begin("reference fixes pass every test")
            for pid in sorted(self.key["references"]):
                self.check_reference(pid)
            self.begin("surface features and the red-flag scan do not give the verdicts away")
            self.check_surface()
            self.end()
        finally:
            shutil.rmtree(self.tmp, ignore_errors=True)
        if self.table and self.details:
            print("\nRaw outcomes per patch (tests passed / tests run):\n")
            print("| Patch | Key verdict | Patch's own tests | Original tests | Hidden regression | Hidden ticket |")
            print("|---|---|---|---|---|---|")
            print("\n".join(self.table))
        print(f"\n{self.passes} passed, {self.failures} failed")
        return 1 if self.failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Prove that Lab C works. Standard library only. Without --details it prints a summary that "
                    "names no defects.",
        epilog="WARNING: --details names every defect. Use it only after you have scored yourself.",
    )
    parser.add_argument("--keys", type=Path, default=LAB / "_key", help="folder with key.json (default: ./_key)")
    parser.add_argument("--details", action="store_true",
                        help="print every check and the raw-outcome table (spoilers: it names every defect)")
    args = parser.parse_args()
    if shutil.which("git") is None:
        print("FAIL git is required (git apply)")
        return 2
    return Checker(args.keys.resolve(), details=args.details).run()


if __name__ == "__main__":
    sys.exit(main())
