#!/usr/bin/env python3
"""Prove that lab-d (Memory Ghost) works.

Usage: python3 check.py [--keys DIR]     (default DIR: ./_key next to this file)

For the base repo and for each patch in patches/, it builds a fresh copy in a
temp folder and runs `make test` and `make asan`. Everything it expects comes
from the answer key (key.json): each patch's verdict, the sanitizer report and
its file:line, the fixes, the stress test, the mutants, and a check for each
claim. It checks that every rejected patch is reported at the key's file:line,
that every accepted patch is clean, that every fix in the key makes `make asan`
pass (and that undoing it brings the report back), that the stress test passes
on the patch the key names and kills the non-equivalent mutants, and that each
claim's right/wrong label matches what the tools show. This file holds no
answers; the key does. Standard library only. Its output has spoilers, so run
it after you have done the lab.
"""

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE / "repo"
SANFLAGS = ["-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer", "-g", "-O1"]
SAN_ENV = {"ASAN_OPTIONS": "abort_on_error=0:symbolize=0", "UBSAN_OPTIONS": "abort_on_error=0:print_stacktrace=1:symbolize=0"}
REPORT = re.compile(r"ERROR: AddressSanitizer|runtime error:|ERROR: UndefinedBehaviorSanitizer")
TESTS_LINE = re.compile(r"^(\d+) tests, (\d+) failed$", re.M)
CLAIMED = re.compile(r"Tests: make test passes \((\d+) tests, 0 failed\)")

RESULTS = []


def report(ok, name, detail=""):
    RESULTS.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f" ({detail})" if detail else ""))
    return ok


def skip(name, why):
    print(f"SKIP {name} ({why})")


def base_env(tmp):
    env = dict(os.environ)
    env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "LC_ALL": "C", "TMPDIR": str(tmp)})
    for name in ("ASAN_OPTIONS", "UBSAN_OPTIONS", "MAKEFLAGS"):
        env.pop(name, None)
    return env


def run(cmd, cwd, env, timeout=300, check=False, stdin=None):
    proc = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout, input=stdin)
    if check and proc.returncode != 0:
        raise SystemExit(f"command failed: {' '.join(map(str, cmd))}\n{proc.stdout}\n{proc.stderr}")
    return proc


def files_under(folder):
    return sorted(str(p.relative_to(folder)) for p in folder.rglob("*") if "__pycache__" not in p.parts)


def fresh_copy(tmp, env, name):
    dest = tmp / name
    shutil.copytree(REPO, dest, ignore=shutil.ignore_patterns("build", "*.dSYM"))
    run(["git", "init", "-q"], dest, env, check=True)
    run(["git", "add", "-A"], dest, env, check=True)
    run(["git", "-c", "user.name=lab-d check", "-c", "user.email=check@lab-d.invalid", "commit", "-q", "-m", "base"],
        dest, env, check=True)
    return dest


def make(dest, env, target):
    """make clean first: GNU Make 3.81 (macOS) compares whole seconds, so a quick re-run can reuse a stale binary."""
    run(["make", "clean"], dest, env, check=True)
    proc = run(["make", target], dest, env)
    return proc.returncode, proc.stdout + proc.stderr


def tests_line(output):
    found = TESTS_LINE.findall(output)
    return (int(found[-1][0]), int(found[-1][1])) if found else None


def section(text, name):
    """The part of a sanitizer report for one stack: 'error' (the first stack) or 'allocated'."""
    if name == "allocated":
        match = re.search(r"allocated by thread .*?:\n(.*?)(?:\n\s*\n|\Z)", text, re.S)
    else:
        match = re.search(r"(?:ERROR: AddressSanitizer.*?|runtime error:.*?)\n(.*?)(?:\n\s*\n|\Z)", text, re.S)
    return match.group(1) if match else ""


def frame_has(text, sec, function, location):
    for line in section(text, sec).splitlines():
        if function in line and location in line:
            return True
    return False


def function_body(source, signature):
    start = source.find(signature)
    if start < 0:
        return None
    end = source.find("\n}\n", start)
    return source[start:end + 3] if end > 0 else None


def lldb_resolves(binary, env, file, line, function):
    """Set a breakpoint without launching the program (no debugger permission needed)."""
    proc = run(["lldb", "--batch", "-o", f"breakpoint set --file {file} --line {line}", str(binary)],
               binary.parent.parent, env, timeout=120)
    found = re.search(r"Breakpoint 1: where = \S+`(\S+?)\(", proc.stdout)
    return found is not None and found.group(1) == function, (found.group(1) if found else proc.stdout.strip()[-200:])


def build_and_run(dest, env, sources, out_name, include=True):
    binary = dest / "build" / out_name
    binary.parent.mkdir(exist_ok=True)
    cmd = ["clang++", "-std=c++17", "-Wall", "-Wextra", *SANFLAGS, *(["-I."] if include else []), "-o", str(binary),
           *map(str, sources)]
    built = run(cmd, dest, env)
    if built.returncode != 0:
        return None, built.stdout + built.stderr
    proc = run([str(binary)], dest, dict(env, **SAN_ENV))
    return proc.returncode, proc.stdout + proc.stderr


def claim_holds(spec, by_file, observed, stress_ok, killed):
    """True if the tools support the claim, False if they refute it, None if they do not settle it.

    The key gives each claim a check spec; this function only knows the four kinds of check.
    """
    kind = spec.get("kind")
    if kind == "sanitizer":
        # Holds when that patch's sanitizer build is clean. Refuted only when the report is the one the
        # key describes and every fix in the key silences it.
        seen, want = observed.get(spec.get("patch")), by_file.get(spec.get("patch"))
        if not seen or not want:
            return None
        if seen["asan_code"] == 0 and not REPORT.search(seen["asan_out"]):
            return True
        must = want["report_must_contain"]
        explained = bool(must) and all(s in seen["asan_out"] for s in must) and seen.get("fix_ok", False)
        return False if explained else None
    if kind == "source":
        # Each rule names a function and a text that must be present in, or absent from, its body.
        seen = observed.get(spec.get("patch"))
        if not seen:
            return None
        text = (seen["dest"] / spec["file"]).read_text(encoding="utf-8")
        for rule in spec["rules"]:
            body = function_body(text, rule["in"])
            if body is None:
                return None
            if "present" in rule and rule["present"] not in body:
                return False
            if "absent" in rule and rule["absent"] in body:
                return False
        return True
    if kind == "stress_and_mutant":
        # Holds when the stress test passes and the mutant that breaks the claimed property is killed.
        if spec.get("mutant") not in killed:
            return None
        return bool(stress_ok and killed[spec["mutant"]])
    if kind == "tests_as_claimed":
        names = list(by_file) if spec.get("patches") == "all" else spec.get("patches", [])
        if not names or any(n not in observed for n in names):
            return None
        return all(observed[n]["tests_ok"] for n in names)
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--keys", default=str(HERE / "_key"), help="folder with key.json (default: ./_key)")
    args = parser.parse_args()
    keys = Path(args.keys).resolve()
    if not (keys / "key.json").is_file():
        print(f"FAIL answer key not found: {keys / 'key.json'}")
        return 1
    key = json.loads((keys / "key.json").read_text(encoding="utf-8"))

    tools = {name: shutil.which(name) for name in ("clang++", "make", "git", "lldb", "atos")}
    report(sys.version_info >= (3, 8), "python3 is 3.8 or newer", sys.version.split()[0])
    report(all(tools[n] for n in ("clang++", "make", "git")), "clang++, make and git are on PATH",
           ", ".join(f"{n}={'yes' if p else 'no'}" for n, p in tools.items()))
    version = subprocess.run(["clang++", "--version"], capture_output=True, text=True).stdout.splitlines()[:1]
    print("INFO " + (version[0] if version else "clang++ version unknown") + f" on {platform.system()} {platform.machine()}")

    # Public files: present, and they do not give the answers away.
    readme = (HERE / "README.md").read_text(encoding="utf-8")
    lab = json.loads((HERE / "lab.json").read_text(encoding="utf-8"))
    report(lab.get("id") == "lab-d" and {"M9"} <= set(lab.get("covers", [])), "lab.json is lab-d and covers M9",
           str(lab.get("covers")))
    report("make_practice.sh lab-d" in readme and "Done when" in readme and "lldb" in readme,
           "README.md says how to start, when you are done, and teaches lldb")
    report(not any((REPO / p).exists() for p in (".git", "build", "_key")),
           "repo/ has no .git, build/ or answer folder (make_practice.sh adds a fresh git)")
    public = [HERE / "README.md", HERE / "lab.json", HERE / "check.py"] + [p for p in REPO.rglob("*") if p.is_file()]
    leaks = [(s, str(p.relative_to(HERE))) for p in public for s in key["spoilers"]
             if s in p.read_text(encoding="utf-8", errors="replace")]
    report(not leaks, "README.md, lab.json, check.py and repo/ contain none of the key's spoiler strings", str(leaks[:3]))
    report(all("check" in c for c in key["claims"]), "every claim in the key says how to check it")
    patch_files = sorted(p.name for p in (REPO / "patches").glob("*.patch"))
    report(patch_files == sorted(p["file"] for p in key["patches"]), "the key covers exactly the patches in patches/",
           ", ".join(patch_files))
    report(all("Synthetic, written for practice. Not real Gemini output." in (REPO / "patches" / f).read_text()
               for f in patch_files), "every patch message says it is synthetic")

    before = files_under(HERE)
    tmp = Path(tempfile.mkdtemp(prefix="lab-d-check-"))
    env = base_env(tmp)
    observed = {}
    try:
        # Baseline.
        dest = fresh_copy(tmp, env, "base")
        code, out = make(dest, env, "test")
        report(code == 0 and tests_line(out) == (key["base"]["tests"], 0), "base: make test passes",
               str(tests_line(out)))
        code, out = make(dest, env, "asan")
        report(code == 0 and not REPORT.search(out) and tests_line(out) == (key["base"]["tests"], 0),
               "base: make asan passes with no sanitizer report", str(tests_line(out)))
        if platform.system() == "Darwin":
            proc = run([str(dest / "build/test_ringlog_asan")], dest, dict(env, ASAN_OPTIONS="detect_leaks=1:symbolize=0"))
            report("detect_leaks is not supported on this platform" in proc.stderr,
                   "Apple clang has no LeakSanitizer: ASAN_OPTIONS=detect_leaks=1 is refused at run time",
                   (proc.stderr.strip().splitlines() or ["no message"])[0][-80:])

        for p in key["patches"]:
            name = p["file"]
            text = (REPO / "patches" / name).read_text(encoding="utf-8")
            dest = fresh_copy(tmp, env, "p-" + name[:2])
            applied = run(["git", "apply", f"patches/{name}"], dest, env)
            report(applied.returncode == 0, f"{name}: git apply works on the base", applied.stderr.strip()[:120])
            claimed = CLAIMED.search(text)
            code, out = make(dest, env, "test")
            got = tests_line(out)
            ok_tests = code == 0 and claimed is not None and got == (int(claimed.group(1)), 0) == (p["tests_claimed"], 0)
            report(ok_tests, f"{name}: make test passes, exactly as the patch message claims", f"{got}")
            code, out = make(dest, env, "asan")
            has_report = bool(REPORT.search(out))
            observed[name] = {"tests_ok": ok_tests, "asan_code": code, "asan_out": out, "dest": dest}
            if p["verdict"] == "merge":
                report(code == 0 and not has_report and tests_line(out) == (p["tests_claimed"], 0),
                       f"{name}: verdict merge, make asan passes with no report", str(tests_line(out)))
                continue
            report(code != 0 and has_report, f"{name}: make asan fails with a {p['sanitizer']} report", f"make exit {code}")
            missing = [s for s in p["report_must_contain"] if s not in out]
            report(not missing, f"{name}: the report says what the key says ({p['bug']})", f"missing: {missing}" if missing else "")
            for fr in p["report_frames"]:
                report(frame_has(out, fr["section"], fr["function"], fr["location"]),
                       f"{name}: the '{fr['section']}' stack names {fr['function']} at {fr['location']}")
            for d in p["defects"]:
                lines = (dest / d["file"]).read_text(encoding="utf-8").splitlines()
                report(0 < d["line"] <= len(lines) and d["text"] in lines[d["line"] - 1],
                       f"{name}: defect text at {d['file']}:{d['line']} ({d['role']})", d["text"])
            if tools["lldb"]:
                code_dbg, _ = make(dest, env, "debug")
                for d in p["defects"]:
                    if d["function"]:
                        ok, where = lldb_resolves(dest / "build/test_ringlog_debug", env, d["file"], d["line"], d["function"])
                        report(code_dbg == 0 and ok, f"{name}: lldb breakpoint at {d['file']}:{d['line']} resolves inside {d['function']}", where)
            else:
                skip(f"{name}: lldb breakpoint checks", "lldb not found")

            # Every fix in the key makes it clean; undoing only the fix brings the report back.
            run(["git", "-c", "user.name=lab-d check", "-c", "user.email=check@lab-d.invalid", "commit", "-q", "-am", "agent patch"],
                dest, env, check=True)
            all_fixes_ok = True
            for fix in [p["fix"]] + p.get("alt_fixes", []):
                fixed = run(["git", "apply", str(keys / fix)], dest, env)
                code_t, out_t = make(dest, env, "test")
                code_a, out_a = make(dest, env, "asan")
                fix_ok = fixed.returncode == 0 and code_t == 0 and code_a == 0 and not REPORT.search(out_a)
                report(fix_ok, f"{name}: the key's fix ({fix}) makes make test and make asan pass",
                       fixed.stderr.strip()[:120] or str(tests_line(out_a)))
                run(["git", "checkout", "-q", "--", "."], dest, env, check=True)
                code_r, out_r = make(dest, env, "asan")
                report(code_r != 0 and all(s in out_r for s in p["report_must_contain"]),
                       f"{name}: undoing only that fix brings the same report back (revert-the-fix check)")
                all_fixes_ok = all_fixes_ok and fix_ok
            observed[name]["fix_ok"] = all_fixes_ok

        # The patch the key names: differential stress test and mutants.
        st = key["stress"]
        dest = observed[st["patch"]]["dest"]
        stress_src = keys / st["source"]
        code, out = build_and_run(dest, env, [stress_src, "ringlog.cpp"], "stress")
        stress_ok = code == 0 and st["expect_output"] in out and not REPORT.search(out)
        report(stress_ok, f"{st['patch']}: the key's stress test passes under ASan/UBSan",
               (out.strip().splitlines() or ["no output"])[-1])
        original = (dest / "ringlog.cpp").read_text(encoding="utf-8")
        killed = {}
        for m in key["mutants"]:
            if original.count(m["old"]) != 1:
                report(False, f"mutant {m['id']}: its target text appears exactly once")
                continue
            (dest / "ringlog.cpp").write_text(original.replace(m["old"], m["new"]), encoding="utf-8")
            vis_code, _ = build_and_run(dest, env, ["ringlog.cpp", "test_ringlog.cpp"], "visible_mutant", include=False)
            str_code, _ = build_and_run(dest, env, [stress_src, "ringlog.cpp"], "stress_mutant")
            vis_kill, str_kill = vis_code != 0, str_code != 0
            killed[m["id"]] = str_kill
            want = "equivalent: survives both" if m["equivalent"] else (
                "killed by the visible tests and the stress test" if m["visible_tests_kill"] else
                "survives the visible tests, killed by the stress test")
            report(vis_code is not None and str_code is not None and vis_kill == m["visible_tests_kill"]
                   and str_kill == m["stress_kills"], f"mutant {m['id']}: {want}",
                   f"visible exit {vis_code}, stress exit {str_code}")
        (dest / "ringlog.cpp").write_text(original, encoding="utf-8")

        # Claims: each label must match what the tools showed. The key says how to check each claim.
        by_file = {p["file"]: p for p in key["patches"]}
        tools_say = {}
        for claim in key["claims"]:
            holds = claim_holds(claim.get("check") or {}, by_file, observed, stress_ok, killed)
            tools_say[claim["id"]] = {True: "right", False: "wrong"}.get(holds, "not settled")
            report(claim["label"] == tools_say[claim["id"]],
                   f"claim {claim['id']} is {claim['label']}: {claim['claim'][:70]}", f"tools say {tools_say[claim['id']]}")
        report(len(tools_say) == len(key["claims"]) > 0, "every claim in the key was checked", ", ".join(sorted(tools_say)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    report(files_under(HERE) == before, "nothing was written inside the lab folder")
    failed = RESULTS.count(False)
    print(f"lab-d: {len(RESULTS) - failed} PASS, {failed} FAIL")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
