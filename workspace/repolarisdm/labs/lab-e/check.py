#!/usr/bin/env python3
"""Prove that lab-e (Bisect 200) works.

Usage: python3 check.py [--keys DIR]     (default DIR: ./_key next to this file)

It builds the history twice (in a temp folder), checks that it is identical,
labels every commit in v0.2.0..main with the answer-key check script, checks
that the README's label check passes for it and catches the weak-gate trap, runs
`git bisect run` with the key script and with three trap scripts, and checks
the three agent claims against the code. Standard library only.
It prints spoilers, so run it after you have done the lab.
"""

import argparse
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIRST_BAD = re.compile(r"^([0-9a-f]{40}) is the first (?:'bad'|bad) commit", re.M)
TESTED = re.compile(r"^git bisect (?:good|bad|skip) ([0-9a-f]{40})", re.M)

RESULTS = []


def report(ok, name, detail=""):
    RESULTS.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" ({detail})" if detail else ""))
    return ok


def git_env(tmp):
    env = dict(os.environ)
    env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "TMPDIR": str(tmp),
                "LC_ALL": "C", "PYTHONDONTWRITEBYTECODE": "1"})
    env.pop("PYTHONPATH", None)
    return env


def run(cmd, cwd, env, check=True):
    proc = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise SystemExit(f"command failed: {' '.join(map(str, cmd))}\n{proc.stdout}\n{proc.stderr}")
    return proc


def files_under(folder):
    return sorted(str(p.relative_to(folder)) for p in folder.rglob("*")
                  if "__pycache__" not in p.parts and ".venv" not in p.parts)


def build(tmp, env):
    proc = run(["bash", str(HERE / "make_history.sh")], cwd=tmp, env=env)
    lines = proc.stdout.strip().splitlines()
    return Path(lines[-1]) if lines else None


def bisect(repo, env, script, good):
    run(["git", "bisect", "reset"], repo, env, check=False)
    run(["git", "checkout", "-q", "-f", "main"], repo, env)
    run(["git", "bisect", "start", "main", good], repo, env)
    proc = run(["git", "bisect", "run", "bash", str(script)], repo, env, check=False)
    log = run(["git", "bisect", "log"], repo, env, check=False).stdout
    run(["git", "bisect", "reset"], repo, env, check=False)
    run(["git", "checkout", "-q", "-f", "main"], repo, env)
    found = FIRST_BAD.search(proc.stdout)
    return (found.group(1) if found else None), len(TESTED.findall(log)), proc


def total_amount(tree, csv_path, env):
    proc = run([sys.executable, "-B", "-m", "billsplit", "total", str(csv_path)], tree, env, check=False)
    found = re.findall(r"-?[0-9]+\.[0-9]{2}", proc.stdout)
    return found[-1] if found else None


def function_source(text, name):
    match = re.search(rf"^def {name}\(.*?(?=^\S)", text + "\nEND\n", re.S | re.M)
    return match.group(0).strip() if match else None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--keys", default=str(HERE / "_key"), help="folder with key.json (default: ./_key)")
    args = parser.parse_args()
    keys = Path(args.keys).resolve()
    if not (keys / "key.json").is_file():
        print(f"FAIL answer key not found: {keys / 'key.json'}")
        return 1
    key = json.loads((keys / "key.json").read_text(encoding="utf-8"))
    key_script = keys / key["check_script"]
    planted = key["planted"]
    untestable = {u["number"]: u for u in key["untestable"]}

    report(sys.version_info >= (3, 9), "python3 is 3.9 or newer", sys.version.split()[0])
    report(shutil.which("git") is not None and shutil.which("bash") is not None, "git and bash are on PATH")
    report(key_script.is_file(), "the key has a check script", str(key_script.name))

    before = files_under(HERE)
    tmp = Path(tempfile.mkdtemp(prefix="lab-e-check-"))
    env = git_env(tmp)
    try:
        repo = build(tmp, env)
        again = build(tmp, env)
        report(repo is not None and repo.is_dir() and tmp in repo.parents and HERE not in repo.parents,
               "make_history.sh builds the repo in a temp folder, outside the lab folder", str(repo))
        empty = [str(p.relative_to(repo)) for p in repo.rglob("*")
                 if p.is_dir() and ".git" not in p.relative_to(repo).parts and not any(p.iterdir())]
        report(not empty, "a fresh build leaves no empty folders (git does not track them)", ", ".join(empty))
        head = run(["git", "rev-parse", "main"], repo, env).stdout.strip()
        head2 = run(["git", "rev-parse", "main"], again, env).stdout.strip()
        report(head == head2 == key["head_sha"], "the history is deterministic (same main commit twice, same as the key)", head[:12])

        revs = run(["git", "rev-list", "--reverse", "main"], repo, env).stdout.split()
        number = {sha: n for n, sha in enumerate(revs, start=1)}
        report(len(revs) == key["commit_count"], "the repo has 200 commits", str(len(revs)))
        good_sha = run(["git", "rev-parse", key["good_ref"] + "^{commit}"], repo, env).stdout.strip()
        report(number.get(good_sha) == key["good_number"], f"{key['good_ref']} is commit {key['good_number']}")
        report(revs[planted["number"] - 1] == planted["sha"], f"commit {planted['number']} is the planted commit", planted["subject"])
        subject = run(["git", "show", "-s", "--format=%s", planted["sha"]], repo, env).stdout.strip()
        report(subject == planted["subject"], "the planted commit has the subject in the key")

        # Planted defect lines, at the planted commit and at main.
        for d in planted["defects"]:
            for rev, line in ((planted["sha"], d["line_at_planted"]), ("main", d["line_at_head"])):
                text = run(["git", "show", f"{rev}:{d['file']}"], repo, env).stdout.splitlines()
                ok = 0 < line <= len(text) and d["text"] in text[line - 1]
                report(ok, f"defect text at {d['file']}:{line} ({'planted' if rev != 'main' else 'main'})", d["text"])

        # Every commit in the range, labeled by the key script.
        gate_trap = next(t for t in key["traps"] if t["id"] == "import-gate")
        trap_gate, gate_mislabels = keys / gate_trap["script"], gate_trap["mislabels"]
        wrong, seen_untestable, gate_codes, key_codes = [], [], {}, []
        for n in range(key["good_number"] + 1, len(revs) + 1):
            run(["git", "checkout", "-q", "-f", revs[n - 1]], repo, env)
            code = run(["bash", str(key_script)], repo, env, check=False).returncode
            key_codes.append(code)
            expected = 125 if n in untestable else (0 if n < planted["number"] else 1)
            if code != expected:
                wrong.append(f"{n}: got {code}, want {expected}")
            if n in untestable:
                u = untestable[n]
                helped = run([sys.executable, "-B", "-m", "billsplit", "--help"], repo, env, check=False)
                imported = run([sys.executable, "-B", "-c", "import billsplit"], repo, env, check=False)
                ok = (helped.returncode != 0 and u["error"] in helped.stderr
                      and (imported.returncode == 0) == u["import_ok"])
                seen_untestable.append((n, ok))
                # The import-gate trap differs from the key script only in its gate. At a testable
                # commit `python -m billsplit --help` works, so `import billsplit` works too and the
                # trap gives the key's code. Running it at the untestable commits gives its full labels.
                gate_codes[n] = run(["bash", str(trap_gate)], repo, env, check=False).returncode
        run(["git", "checkout", "-q", "-f", "main"], repo, env)
        report(not wrong, f"the key script labels all {len(revs) - key['good_number']} commits in the range "
               f"(0 before {planted['number']}, 1 from {planted['number']}, 125 at {len(untestable)} untestable commits)",
               "; ".join(wrong[:5]))
        report(all(ok for _, ok in seen_untestable) and len(seen_untestable) == len(untestable),
               "each untestable commit fails to start with the error in the key, and `import billsplit` "
               "works exactly where the key says", ", ".join(f"{n}:{'ok' if ok else 'MISMATCH'}" for n, ok in seen_untestable))
        report(key_codes.count(125) == len(untestable) and set(key_codes) <= {0, 1, 125},
               f"the README's label check passes for the key script: exactly {len(untestable)} commits exit 125, "
               "every other commit exits 0 or 1",
               f"0: {key_codes.count(0)}, 1: {key_codes.count(1)}, 125: {key_codes.count(125)}")

        # The bisect itself.
        first, tested, proc = bisect(repo, env, key_script, key["good_ref"])
        report(first == planted["sha"], "git bisect run with the key script names the planted commit",
               f"commit {number.get(first)}")
        report(tested <= key["max_tested_commits"] and tested == key["expected_tested_commits"],
               f"bisect needed at most {key['max_tested_commits']} tested commits "
               f"({key['expected_tested_commits']}, as the README says)", f"{tested} tested")

        # Trap scripts give the wrong answer the key predicts.
        for trap in key["traps"]:
            first, tested, _ = bisect(repo, env, keys / trap["script"], key["good_ref"])
            got = number.get(first)
            report(got == trap["expect_first"] and (got == planted["number"]) == trap["correct"],
                   f"trap {trap['id']}: bisect names commit {trap['expect_first']}"
                   + ("" if trap["correct"] else " (a wrong answer)"), f"got {got}")
        report(all(gate_codes.get(n) == 1 for n in gate_mislabels),
               "trap import-gate mislabels the untestable commits " + ", ".join(map(str, gate_mislabels)) + " as bad",
               str({n: gate_codes.get(n) for n in gate_mislabels}))
        gate_skips = list(gate_codes.values()).count(125)
        report(len(gate_codes) == len(untestable) and gate_skips == gate_trap["skips_in_range"] != len(untestable),
               f"the README's label check catches trap import-gate: {gate_trap['skips_in_range']} commits exit 125, "
               f"not {len(untestable)}", f"{gate_skips} exit 125")

        # The learner's template must not give an answer by accident.
        template = (HERE / "check.sh").read_text(encoding="utf-8")
        first, _, proc = bisect(repo, env, HERE / "check.sh", key["good_ref"])
        report("TODO" in template and first is None and proc.returncode != 0,
               "the unedited check.sh template aborts the bisect instead of naming a commit")

        # Format change commit.
        fc = key["format_change"]["number"]
        csv_path = tmp / "receipt.csv"
        csv_path.write_text(key["bug_report_csv"], encoding="utf-8")
        outs = {}
        for n in (fc - 1, fc):
            run(["git", "checkout", "-q", "-f", revs[n - 1]], repo, env)
            outs[n] = run([sys.executable, "-B", "-m", "billsplit", "total", str(csv_path)], repo, env).stdout.strip()
        run(["git", "checkout", "-q", "-f", "main"], repo, env)
        report(outs[fc - 1] == key["expected_good_amount"] and outs[fc] == "Total: " + key["expected_good_amount"],
               f"commit {fc} only changes the output format", repr(outs))

        # Claims.
        trees = {}
        for ref in (key["good_ref"], "main"):
            dest = tmp / ("tree-" + ref.replace("/", "_"))
            dest.mkdir()
            archive = subprocess.run(["git", "archive", ref], cwd=repo, env=env, capture_output=True, check=True).stdout
            subprocess.run(["tar", "-x", "-C", str(dest)], input=archive, check=True)
            trees[ref] = dest
        claims = {c["id"]: c for c in key["claims"]}

        old_money = (trees[key["good_ref"]] / "billsplit/money.py").read_text(encoding="utf-8")
        new_money = (trees["main"] / "billsplit/money.py").read_text(encoding="utf-8")
        same_round = function_source(old_money, "round_money") == function_source(new_money, "round_money")
        even = run(["git", "grep", "-n", "ROUND_HALF_EVEN", "main", "--", "billsplit"], repo, env, check=False)
        probe = run([sys.executable, "-B", "-c",
                     "from decimal import Decimal; from billsplit.money import round_money; print(round_money(Decimal('2.345')))"],
                    trees["main"], env).stdout.strip()
        c1_true = not (same_round and even.returncode == 1 and probe == "2.35")
        report(claims["C1"]["label"] == ("right" if c1_true else "wrong"),
               f"claim C1 is {claims['C1']['label']}: round_money unchanged={same_round}, ROUND_HALF_EVEN found={even.returncode == 0}, "
               f"round_money(2.345)={probe}")

        no_skip = next(t for t in key["traps"] if t["id"] == "no-skip")
        c2_true = no_skip["expect_first"] == planted["number"]
        report(claims["C2"]["label"] == ("right" if c2_true else "wrong"),
               f"claim C2 is {claims['C2']['label']}: marking untestable commits bad leads bisect to commit {no_skip['expect_first']}")

        rng = random.Random(20261020)

        def bill(decimals):
            lines = ["item,amount"]
            for k in range(rng.randint(1, 8)):
                cents = rng.randint(-5000, 50000) * (10 if decimals == 3 else 1) + (rng.randint(1, 9) if decimals == 3 else 0)
                lines.append(f"line{k},{Decimal(cents).scaleb(-decimals)}")
            return "\n".join(lines) + "\n"

        same2, diff3, broken3 = 0, 0, 0
        for k in range(40):
            for decimals in (2, 3):
                path = tmp / f"bill-{decimals}-{k}.csv"
                path.write_text(bill(decimals), encoding="utf-8")
                old = total_amount(trees[key["good_ref"]], path, env)
                new = total_amount(trees["main"], path, env)
                if decimals == 2:
                    same2 += old == new and old is not None
                else:
                    diff3 += old != new
                    exact = sum(Decimal(row.split(",")[1]) for row in path.read_text().splitlines()[1:])
                    broken3 += old != str(exact.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        c3_true = same2 == 40 and diff3 > 0
        report(claims["C3"]["label"] == ("right" if c3_true else "wrong") and broken3 == 0,
               f"claim C3 is {claims['C3']['label']}: 40 of 40 two-decimal bills agree ({same2}), "
               f"{diff3} of 40 three-decimal bills differ, v0.2.0 matched round-once on all of them")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    report(files_under(HERE) == before, "nothing was written inside the lab folder")
    failed = RESULTS.count(False)
    print(f"lab-e: {len(RESULTS) - failed} PASS, {failed} FAIL")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
