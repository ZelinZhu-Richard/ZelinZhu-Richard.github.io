#!/usr/bin/env python3
"""Prove that Lab F (Break the Grader) works. Standard library only.

Usage:
  python3 check.py [--keys DIR] [--runs N] [--grader DIR [--grader-only]] [--docker] [--public-only]

  --keys DIR     the lab's answer keys (default: _key next to this file)
  --runs N       runs per solution for the strong grader (default 3)
  --grader DIR   also score YOUR verifier folder (it must contain test.sh) on the
                 public and the held-out solutions
  --grader-only  with --grader: score only your grader. Skips the key's own checks,
                 so it prints no attributions or mutant names. One line per solution.
  --docker       also run a few trials inside Docker
  --public-only  check only what does not need the answer keys

What it proves:
  - the task and the corpus are complete and compile; the stub really does nothing;
  - the weak grader gives exactly the documented rewards: reference 1, do-nothing 0,
    all 5 public wrong solutions 1 (false accepts), alt-1 and alt-2 0 (false rejects);
  - every file:line claim in the key points at the text it names;
  - the key's strong grader gets the full matrix right N times in a row, and the
    checks that catch each wrong solution are exactly the ones the key lists;
  - no public file contains the key's canary or obvious answer words.
Prints PASS/FAIL lines. Exits 1 if anything fails.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "repo")
APP = os.path.join(REPO, "task", "environment", "app")
PUBLIC_SOLUTIONS = ["alt-1", "alt-2", "do-nothing", "wrong-1", "wrong-2", "wrong-3", "wrong-4", "wrong-5"]
# The weak grader's matrix is public (the lab README shows it), so it is safe to state here.
WEAK_PUBLIC_EXPECT = {"reference": 1, "alt-1": 0, "alt-2": 0, "do-nothing": 0,
                      "wrong-1": 1, "wrong-2": 1, "wrong-3": 1, "wrong-4": 1, "wrong-5": 1}
REQUIRED = [
    "README.md", "lab.json", "requirements.txt", "check.py",
    "repo/README.md", "repo/run_task.sh", "repo/solutions/README.md",
    "repo/task/instruction.md", "repo/task/task.toml", "repo/task/environment/Dockerfile",
    "repo/task/environment/app/README.md", "repo/task/environment/app/data/sample_bookings.csv",
    "repo/task/environment/app/tests/test_merge.py", "repo/task/environment/app/tests/test_csvio.py",
    "repo/task/solution/solve.sh", "repo/task/solution/merge.py",
    "repo/task/tests/test.sh", "repo/task/tests/test_outputs.py",
] + [f"repo/task/environment/app/freebusy/{m}.py" for m in ("__init__", "__main__", "model", "csvio", "merge")] \
  + [f"repo/solutions/{name}/solve.sh" for name in PUBLIC_SOLUTIONS]
# Built from pieces so this file does not contain the strings it looks for.
FORBIDDEN = [
    (re.compile("no" + "index", re.I), "the word n-o-index"),
    (re.compile(r"https?://(?:local" + r"host|127\.0\.0\.1):\d+"), "a local URL with a port"),
    (re.compile("/" + "Users" + "/"), "a local user path"),
    (re.compile("CHRONOS" + "-CANARY"), "the capstone canary"),
    (re.compile("hold" + "out/", re.I), "a protected-data path"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:com|edu|org|net|io)\b"), "an email address"),
]
LEAK_WORDS = re.compile(r"plant(ed|ing)|deliberate|answer[ -]key|_key/|\bdefects?\b", re.I)

results = []


def say(ok, message):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + message, flush=True)


def public_files():
    out = []
    for top in ("README.md", "lab.json", "requirements.txt"):
        out.append(os.path.join(HERE, top))
    for root, dirs, files in os.walk(REPO):
        dirs[:] = [d for d in dirs if d not in ("__pycache__", "runs", ".git")]
        out += [os.path.join(root, f) for f in files if not f.endswith(".pyc")]
    return out


def read(path):
    with open(path, encoding="utf-8", errors="replace") as handle:
        return handle.read()


def sha(path):
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def run_matrix(tests=None, corpora=(), runs=1, docker=False, only=None):
    """Run run_task.sh and return ({name: [rewards]}, out_dir, stdout)."""
    out = tempfile.mkdtemp(prefix="lab-f-check.")
    if only:
        names = {}
        for name in only:
            cmd = ["bash", os.path.join(REPO, "run_task.sh"), name, "--out", out, "--runs", str(runs)]
            if tests:
                cmd += ["--tests", tests]
            if docker:
                cmd.append("--docker")
            subprocess.run(cmd, cwd=out, capture_output=True, text=True)
            names[os.path.basename(name)] = [read(os.path.join(out, "reward.txt")).strip()]
        return names, out, ""
    cmd = ["bash", os.path.join(REPO, "run_task.sh"), "--all", "--out", out, "--runs", str(runs)]
    if tests:
        cmd += ["--tests", tests]
    for corpus in corpora:
        cmd += ["--corpus", corpus]
    if docker:
        cmd.append("--docker")
    proc = subprocess.run(cmd, cwd=out, capture_output=True, text=True)
    table = {}
    matrix = os.path.join(out, "matrix.tsv")
    if os.path.exists(matrix):
        rows = [line.split("\t") for line in read(matrix).splitlines()]
        for row in rows[1:]:
            table[row[0]] = row[2:2 + runs]
    return table, out, proc.stdout + proc.stderr


def failed_groups(out, name, k):
    path = os.path.join(out, "runs", f"{name}.run{k}.checks.json")
    if not os.path.exists(path):
        return None, None, "no checks.json"
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    if "grader_error" in data:
        return None, None, data["grader_error"]
    return sorted(g for g, v in data["groups"].items() if not v["ok"]), sorted(data["flags"]), None


# ---- checks ------------------------------------------------------------------------------
def check_layout():
    missing = [p for p in REQUIRED if not os.path.isfile(os.path.join(HERE, p))]
    say(not missing, "layout: all required files exist" + (f" (missing: {missing})" if missing else ""))
    try:
        meta = json.loads(read(os.path.join(HERE, "lab.json")))
        ok = (set(meta) == {"id", "title", "language", "time", "trains", "covers"} and meta["id"] == "lab-f"
              and all(re.fullmatch(r"S(1[0-5]|[0-9])", s) for s in meta["trains"])
              and all(re.fullmatch(r"M(10|[1-9])", m) for m in meta["covers"]))
        say(ok, f"lab.json: schema ok, trains {meta['trains']}, covers {meta['covers']}")
    except (OSError, ValueError, KeyError) as error:
        say(False, f"lab.json: {error}")
    try:
        import tomllib  # Python 3.11+
    except ImportError:
        print("SKIP task.toml parse (needs Python 3.11+ for tomllib)")
    else:
        with open(os.path.join(REPO, "task", "task.toml"), "rb") as handle:
            toml = tomllib.load(handle)
        ok = (toml.get("schema_version") == "1.3" and toml["task"]["name"]
              and toml["verifier"]["network_mode"] == "no-network" and toml["agent"]["network_mode"] == "no-network")
        say(ok, "task.toml: parses; schema 1.3; agent and verifier have no network")
    bad = []
    for root, _, files in os.walk(REPO):
        for f in files:
            if f.endswith(".py"):
                path = os.path.join(root, f)
                try:
                    compile(read(path), path, "exec")  # syntax check only; writes nothing
                except SyntaxError as error:
                    bad.append(f"{os.path.relpath(path, HERE)}: {error}")
    say(not bad, "every .py file in repo/ compiles" + (f": {bad}" if bad else ""))
    stub = read(os.path.join(APP, "freebusy", "merge.py"))
    say("raise NotImplementedError" in stub, "the app's merge_busy is still a stub, so do-nothing does nothing")
    say(not os.path.exists(os.path.join(REPO, "solutions", "reference")),
        "there is one reference (task/solution); run_task.sh maps the name 'reference' to it")


def check_hygiene(canary):
    hits = []
    for path in public_files():
        text = read(path)
        rel = os.path.relpath(path, HERE)
        for pattern, label in FORBIDDEN:
            if pattern.search(text):
                hits.append(f"{rel}: {label}")
        if canary and canary in text:
            hits.append(f"{rel}: the key canary")
        if rel.startswith("repo" + os.sep) and LEAK_WORDS.search(text):
            hits.append(f"{rel}: answer word '{LEAK_WORDS.search(text).group(0)}'")
    say(not hits, "public files: no forbidden strings, no canary, no answer words in repo/" + (f" ({hits})" if hits else ""))


def check_weak(keys, key):
    corpora = [os.path.join(keys, key["heldout_dir"])] if key else []
    table, out, _ = run_matrix(corpora=corpora)
    want = key["weak_grader"]["expected_rewards"] if key else WEAK_PUBLIC_EXPECT
    for name, reward in want.items():
        got = table.get(name, ["missing"])[0]
        label = {(1, "reference"): "the reference passes", (0, "do-nothing"): "do-nothing fails"}.get((reward, name))
        if label is None:
            label = ("accepted (false accept, planted gap reproduces)" if reward == 1 and name.startswith("wrong")
                     else "rejected (false reject, planted over-strict check reproduces)" if reward == 0 and name.startswith("alt")
                     else f"gets {reward}")
        say(str(reward) == got, f"weak grader: {name} {label} [reward {got}]")
    if key:
        for name, test in key["weak_grader"]["false_reject_tests"].items():
            log = read(os.path.join(out, "runs", f"{name}.run1.log"))
            say(f"FAIL: {test} " in log, f"weak grader: {name} is rejected by {test}, as the key says")


def check_claims(keys, key):
    claims = []
    for d in key["weak_grader"]["defects"]:
        claims.append((d["id"], d["location"], d["file"], d["line"], d["expected_text"]))
        for extra in d.get("also", []):
            claims.append((d["id"], d["location"], extra["file"], extra["line"], extra["expected_text"]))
    for s in key["solutions"]:
        for c in s.get("claims", []):
            claims.append((s["name"], s["location"], c["file"], c["line"], c["expected_text"]))
    bad = []
    for owner, location, rel, line, text in claims:
        base = REPO if location == "repo" else keys
        try:
            lines = read(os.path.join(base, rel)).splitlines()
            if text not in lines[line - 1]:
                bad.append(f"{owner} {rel}:{line}")
        except (OSError, IndexError):
            bad.append(f"{owner} {rel}:{line} (missing)")
    say(not bad, f"key: all {len(claims)} file:line claims point at the text they name" + (f" (wrong: {bad})" if bad else ""))
    grader = os.path.join(keys, key["strong_grader_dir"])
    pairs = [(os.path.join(grader, "visible", f), os.path.join(APP, "tests", f)) for f in ("test_merge.py", "test_csvio.py")]
    pairs.append((os.path.join(grader, "data", "sample_bookings.csv"), os.path.join(APP, "data", "sample_bookings.csv")))
    drift = [os.path.relpath(a, keys) for a, b in pairs if not os.path.exists(a) or sha(a) != sha(b)]
    say(not drift, "key: the strong grader's pristine test and data copies match the app" + (f" (drift: {drift})" if drift else ""))
    manifest = json.loads(read(os.path.join(grader, "app_manifest.json")))
    actual = {}
    for root, dirs, files in os.walk(APP):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for f in files:
            if not f.endswith(".pyc"):
                path = os.path.join(root, f)
                actual[os.path.relpath(path, APP).replace(os.sep, "/")] = sha(path)
    say(manifest == actual, "key: app_manifest.json matches the app's files (integrity flags are trustworthy)")
    # Pristine copies of public files must stay byte-identical, so they cannot carry the canary.
    # CANARY.txt is not part of the key: the S0 canary test (make_practice.sh) writes a random string there.
    exempt = {"grader/visible", "grader/data", "grader/app_manifest.json", "CANARY.txt"}
    if os.path.exists(os.path.join(keys, "CANARY.txt")):
        print("note: CANARY.txt next to the keys is your S0 canary test file, not part of the key. Delete it when you are done.")
    private, marked = 0, []
    for root, dirs, files in os.walk(keys):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for f in files:
            rel = os.path.relpath(os.path.join(root, f), keys).replace(os.sep, "/")
            if any(rel == e or rel.startswith(e + "/") for e in exempt) or f.endswith(".pyc"):
                continue
            private += 1
            if key["canary"] not in read(os.path.join(root, f)):
                marked.append(rel)
    say(private > 0 and not marked, f"key: all {private} private files carry the canary line"
        + (f" (missing in {marked})" if marked else ""))


def check_strong(keys, key, runs):
    grader = os.path.join(keys, key["strong_grader_dir"])
    table, out, _ = run_matrix(tests=grader, corpora=[os.path.join(keys, key["heldout_dir"])], runs=runs)
    for s in key["solutions"]:
        name, want = s["name"], str(s["expected_reward"])
        got = table.get(name, [])
        tag = " (held out)" if s.get("heldout") else ""
        say(len(got) == runs and all(r == want for r in got),
            f"strong grader: {name}{tag} gets {want} in all {runs} runs [rewards {' '.join(got) or 'missing'}]")
        attributions = set()
        for k in range(1, runs + 1):
            groups, flags, problem = failed_groups(out, name, k)
            attributions.add((tuple(groups or []), tuple(flags or []), problem))
        expected = (tuple(sorted(s["caught_by"])), tuple(sorted(s["flags"])), None)
        what = "fails no check" if not s["caught_by"] else "is caught by " + ", ".join(s["caught_by"])
        flag_note = f"; flagged {s['flags']}" if s["flags"] else ""
        say(attributions == {expected}, f"strong grader: {name} {what}{flag_note}, same in every run"
            + ("" if attributions == {expected} else f" [got {sorted(attributions)}]"))


def check_census(keys, key):
    census = key["mutant_census"]
    for label, tests in (("weak", None), ("strong", os.path.join(keys, key["strong_grader_dir"]))):
        out = tempfile.mkstemp(prefix="lab-f-census.", suffix=".json")[1]
        cmd = [sys.executable, os.path.join(keys, census["script"]), "--repo", REPO, "--json", out]
        if tests:
            cmd += ["--tests", tests]
        subprocess.run(cmd, capture_output=True, text=True)
        try:
            got = json.loads(read(out))
        except ValueError:
            say(False, f"mutant census ({label} grader): no result")
            continue
        want = census[label]
        ok = (got["mutants"] == census["mutants"] and got["killed"] == want["killed"]
              and got["survived"] == want["survived"] and got["reference_reward"] == 1)
        say(ok, f"mutant census ({label} grader): {got['killed']} of {got['mutants']} single-site mutants killed,"
                f" survivors {got['survived']} (a census of a defined space, so no sampling interval)")


def check_learner(grader, keys, key, runs, brief=False):
    corpora = [os.path.join(keys, key["heldout_dir"])] if key else []
    table, _, _ = run_matrix(tests=os.path.abspath(grader), corpora=corpora, runs=runs)
    want = {"reference": "1", **{n: ("1" if n.startswith("alt") else "0") for n in PUBLIC_SOLUTIONS}}
    if key:
        want.update({s["name"]: str(s["expected_reward"]) for s in key["solutions"] if s.get("heldout")})
    if brief:
        print(f"{'solution':<12} {'set':<9} {'expected':<9} got (one reward per run)")
    misses = []
    for name, reward in want.items():
        got = table.get(name, [])
        ok = len(got) == runs and all(r == reward for r in got)
        if not ok:
            misses.append(f"{name} expected {reward} got {' '.join(got) or 'nothing'}")
        where = "public" if name in WEAK_PUBLIC_EXPECT else "held out"
        if brief:
            results.append(ok)
            print(f"{name:<12} {where:<9} {reward:<9} {' '.join(got) or 'missing'}{'' if ok else '   <- miss'}")
        else:
            say(ok, f"your grader: {name}{' (held out)' if where == 'held out' else ''} should get {reward}"
                    f" in all {runs} runs [rewards {' '.join(got) or 'missing'}]")
    print(f"your grader: {len(want) - len(misses)} of {len(want)} solutions right in all {runs} runs"
          + ("" if brief or not misses else f"; misses: {misses}"))


def check_docker(keys, key):
    names = ["reference", "do-nothing", "wrong-1"]
    weak, _, _ = run_matrix(only=names, docker=True)
    say(weak == {"reference": ["1"], "do-nothing": ["0"], "wrong-1": ["1"]}, f"docker: weak grader rewards {weak}")
    if key:
        strong, _, _ = run_matrix(only=names, docker=True, tests=os.path.join(keys, key["strong_grader_dir"]))
        say(strong == {"reference": ["1"], "do-nothing": ["0"], "wrong-1": ["0"]}, f"docker: strong grader rewards {strong}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--keys", default=os.path.join(HERE, "_key"))
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--grader")
    parser.add_argument("--grader-only", action="store_true")
    parser.add_argument("--docker", action="store_true")
    parser.add_argument("--public-only", action="store_true")
    args = parser.parse_args()

    print(f"lab-f check, python {sys.version.split()[0]}")
    key = None
    keys = os.path.abspath(args.keys)
    if not args.public_only:
        try:
            key = json.loads(read(os.path.join(keys, "key.json")))
        except OSError:
            say(False, f"answer keys not found at {keys}; pass --keys DIR or use --public-only")
    canary = key["canary"] if key else None

    if args.grader_only:
        if not args.grader:
            parser.error("--grader-only needs --grader DIR")
        check_learner(args.grader, keys, key, args.runs, brief=True)
        failed = results.count(False)
        return 1 if failed else 0

    check_layout()
    check_hygiene(canary)
    check_weak(keys, key)
    if key:
        check_claims(keys, key)
        check_strong(keys, key, args.runs)
        check_census(keys, key)
    if args.grader:
        check_learner(args.grader, keys, key, args.runs)
    if args.docker:
        check_docker(keys, key)

    failed = results.count(False)
    print(f"\n{len(results) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
