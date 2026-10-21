---
title: Change with guardrails
short: Change with guardrails
summary: Drive a coding agent through a change in small, checked steps. You write a 3-bullet spec, get a test that fails for the right reason, approve a plan, set guardrails the agent cannot quietly undo, keep diffs small, rewind after two failed corrections, judge headless runs by `status`, and audit long tasks milestone by milestone.
---

:::selfcheck
- A small Python library has a README that says each version part is a whole number, and 4 passing tests. Write a 3-bullet spec for this issue: `compare("1.10.0", "1.9.0")` returns -1. || Behavior: parts compare as numbers, with examples in both directions: `compare("1.10.0", "1.9.0") == 1`, `compare("1.9.0", "1.10.0") == -1`, `compare("2.0.10", "2.0.9") == 1`. Must keep: the README rules and the 4 existing tests, signatures unchanged. Done when: `.venv/bin/python -m pytest -q` exits 0 with the new test file, the test hashes still match, and `git add -N . && git diff --stat base` shows only `semverlite/version.py` and the new test file.
- Your new test fails with `ImportError`, and pytest exits 2. Is it a good reproduction? || No. It fails for the wrong reason: the test file cannot even load. A good reproduction fails on an assertion about the value in the issue, and pytest exits 1.
- A version-compare bug: `compare("1.10.0", "1.9.0")` returns -1. An agent "fixes" it by zero-padding each part to 3 digits, and every test passes. What do you do? || Reject it and count one correction. Probe one more input: `compare("1.0.1000", "1.0.999")` returns -1, so the fix is wrong. Add that input to the spec and the test.
- You corrected the agent twice on the same problem, and it is still wrong. What now? || Stop correcting. Save the attempt (`git stash push --include-untracked -m "..."`), return to the last green commit, start a fresh session, and write a better first prompt that says what failed. The rule comes from Anthropic's Claude Code best practices.
- An `agy -p ... --output-format json` run exits 0 (`agy` checked against docs on 2026-10-20, not run). Name three things you still check. || The JSON `status` is exactly `SUCCESS`. Stderr is empty: a soft-denied tool call still exits 0 and leaves its notice only there. Your own re-run of the tests and the grader on the workspace, because `SUCCESS` means the run finished, not that the code is right.
- A 3-milestone agent run ends with every test green. Name four milestone-audit checks. || Read each commit with `git log -p`. Run the held tests you saved when you approved earlier milestones. Check test-file hashes and `git diff --stat` on `tests/`. Run every spec example yourself and match every hunk to a spec line. Compare each `plan.md` claim with real output.
:::

## Why Polaris cares

The posting asks you to build tasks that measure Gemini on long-horizon software engineering ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). Long agent runs fail in their own ways: Terminal-Bench 2.0's failure taxonomy names context loss, premature termination and weak verification ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20"). Cheating grows with size: across SpecBench's 30 systems programming tasks, the gap between visible and held-out test pass rates grew by about 28 points for every 10x increase in code size ^[confirmed](https://arxiv.org/abs/2605.21384 "2026-10-20"). In [[runs-and-weaknesses]] you will run Gemini headless on your own task, and a harness that counts exit code 0 as success reports wrong pass rates ^[inference](- "2026-10-20"). This chapter shows how to drive an agent so that every step leaves the evidence a Polaris grader and a Polaris reviewer need. Each spec you write for an agent is also practice for the task instructions you will write in [[task-design]].

## How to use this chapter {#how-to-use}

This chapter covers steps [[S6]] to [[S9]] of the [[agent-patch-audit]] in depth. Chapter 2 shows them once, briefly, on tallyhub issue #41. Here you get a new example, every command, and the long-task version. [[map]] covers S0–S5 and [[prove]] covers S10–S15.

| Step | The question | Sections here |
|---|---|---|
| [[S6]] Reproduce | Do I have a test that fails for the right reason? | [Spec first](#spec-first), [failing test first](#failing-test-first) |
| [[S7]] Locate | Where is the cause? | A short probe in [failing test first](#failing-test-first). [[debug]] goes deep. |
| [[S8]] Plan and guardrails | Will the planned change meet the spec, and nothing more? | [Plan mode](#plan-mode), [guardrails](#guardrails) |
| [[S9]] Small edits | Is each step small, read and tested? | [Small diffs](#small-diffs), [the rewind rule](#rewind-rule), [headless runs](#headless), [milestone audits](#milestones) |

**Sprint route.** The sprint has no slot for this chapter ([[tracker#sprint|tracker]]). The Oct 28–29 Gemini runs need one thing from it: a headless run and its `status` field. The [[start-here#day-1|Day-1 checklist]] on Oct 20–23 already covers that. If your Day-1 run surprised you, skim [headless runs](#headless) inside that item's time. Do the rest, including the drill [Build and test the headless status checker](#drill-change-status-gate), after you apply ^[inference](- "2026-10-20").

**Full route.** Plan about 4 hours like this ^[inference](- "2026-10-20"):

1. Build the running example and work through the sections up to [small diffs](#small-diffs). Type every command. About 70 minutes.
2. [The rewind rule](#rewind-rule) and [headless runs](#headless), with the status checker. About 40 minutes.
3. [Milestone audits](#milestones), with the worked audit. About 15 minutes.
4. The first five [drills](#drills): 15 + 20 + 15 + 30 + 40 minutes, about 2 hours.

The sixth drill, [Run the rewind rule on a real agent](#drill-change-rewind-live), needs a working agent and takes 45 minutes more. It can wait until after you apply.

:::tip title="zsh and the commands on this page"
Every shell block with output shown was run in zsh on macOS. `agy`, Claude Code and Gemini CLI commands were checked against their docs on 2026-10-20, not run. Step 4 of [the headless run](#headless-wrapper) needs a real `agy` result, so it was not run either. Shell blocks have no `#` comments, because interactive zsh does not treat `#` as a comment unless you run `setopt interactivecomments`. (Lines that start with `#` inside a heredoc are file content, not comments.) Words in CAPITALS, like `BASE` or `LAST_GREEN`, are placeholders: fill in your own value. One more zsh trap: an unquoted word that starts with `=`, like `===`, is expanded as a command path, so `echo ===` fails. Quote it.
:::

## The running example: semverlite #7 {#running-example}

**What is real.** All command output on this page is real. It was captured on 2026-10-20 on macOS (Apple Silicon) with zsh 5.9, git 2.55.0, Python 3.13.9 and pytest 9.1.1. Outputs are trimmed, and temp paths are shortened to `…`. No agent was run. Every agent message, plan and agent commit on this page was written for this guide to simulate an agent, and each one is marked. Your commit SHAs will differ.

**The repo.** `semverlite` is a 15-line Python module. `parse` reads versions like `1.4.2`. `compare` orders two of them. It ships with 4 passing tests.

**The issue.** `ISSUE.md`, #7: `compare("1.10.0", "1.9.0")` returns -1. Version 1.10.0 is newer, so it must return 1.

**Build it.** Save this script as `mk-semverlite.sh` in a folder of your own scripts, outside any git repo. It needs network once, to install pytest. It also needs your `git config user.name` and `user.email` set. It uses macOS paths and tools.

```zsh
set -euo pipefail
W=$(mktemp -d)
mkdir -p "$W/repo/semverlite" "$W/repo/tests" "$W/notes"
cd "$W/repo"
: > semverlite/__init__.py
cat > semverlite/version.py <<'EOF'
"""Parse and compare versions like 1.4.2 (MAJOR.MINOR.PATCH)."""


def parse(text):
    """Return the three parts of "MAJOR.MINOR.PATCH". Raise ValueError otherwise."""
    parts = text.strip().split(".")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise ValueError(f"bad version {text!r}")
    return tuple(parts)


def compare(a, b):
    """Return -1 if a < b, 0 if a == b, 1 if a > b."""
    pa, pb = parse(a), parse(b)
    return (pa > pb) - (pa < pb)
EOF
cat > tests/test_version.py <<'EOF'
import pytest

from semverlite.version import compare, parse


def test_equal():
    assert compare("1.4.2", "1.4.2") == 0


def test_patch_order():
    assert compare("1.4.2", "1.4.3") == -1


def test_major_order():
    assert compare("2.0.0", "1.9.9") == 1


def test_rejects_two_parts():
    with pytest.raises(ValueError):
        parse("1.4")
EOF
cat > README.md <<'EOF'
# semverlite

parse(text) reads "MAJOR.MINOR.PATCH". Each part is a whole number.
Anything else raises ValueError, for example "1.4" or "v1.4.2".
compare(a, b) returns -1, 0 or 1. Parts compare as numbers, left to right.
EOF
cat > ISSUE.md <<'EOF'
#7: compare("1.10.0", "1.9.0") returns -1. 1.10.0 is newer, so it must return 1.
EOF
cat > AGENTS.md <<'EOF'
# Rules for agents in this repo

- Test command: `.venv/bin/python -m pytest -rA`. At tag base: 4 passed. An issue's new tests fail until it is fixed.
- Spec: README.md and ISSUE.md. If they and the tests disagree, stop and ask.
- Do not edit, skip or delete tests. Add no conftest.py or pytest config. New tests go in new files.
- Fix the cause, in general. No special cases for test inputs.
- Change only the files I name. No new dependencies.
- Do not search git history, other branches or the web for a fix.
- One plan step at a time. After each: git status, git diff --stat, the diff, the real test output.
- Never write "tests pass" without the command and its output.
- Cite file:line for every claim. Say "unsure" when unsure.
EOF
python3 -m venv .venv
.venv/bin/python -m pip install -q --disable-pip-version-check pytest==9.1.1
git init -q
printf '.venv/\n__pycache__/\n.pytest_cache/\n' >> .git/info/exclude
git add -A
git commit -qm "semverlite 0.1.0"
git tag base
echo "$W"
```

The layout copies [[S0]]: `$W/repo` is the practice copy with its own fresh git, and the only place you open an agent. `$W/notes` holds your evidence. The script also writes the rule file `AGENTS.md` into the first commit, because the rule file goes in before you open any agent ([[S5]] comes before [[S6]]). [The rule file](#rule-file) explains each line. Run the script and take the baseline ([[S1]]):

```zsh
W=$(zsh mk-semverlite.sh | tail -1); cd "$W/repo" && git log --oneline --decorate
set -o pipefail; .venv/bin/python -m pytest -rA 2>&1 | tee ../notes/baseline.txt | tail -1; echo "exit=$?"
```

```text
8614932 (HEAD -> main, tag: base) semverlite 0.1.0
============================== 4 passed in 0.01s ===============================
exit=0
```

Your branch may be called `master`. Nothing on this page depends on the branch name. We use the tag `base` instead.

## Spec first {#spec-first}

A **spec** is a short written statement of what "done" means. Write it before you prompt. Use three bullets:

```text
- Behavior:  what must be true, as 2-3 "input -> output" examples from the issue.
             At least one example in each direction, so a special case cannot pass.
- Must keep: what must not change: documented rules, public signatures, existing tests.
             Point at evidence: a file:line or a test name.
- Done when: one command that proves it, plus "no existing test file changed".
```

The spec for #7:

```text
- Behavior:  parts compare as numbers. compare("1.10.0", "1.9.0") == 1,
             compare("1.9.0", "1.10.0") == -1, compare("2.0.10", "2.0.9") == 1.
- Must keep: README.md:3-5 (three whole-number parts; "1.4" raises ValueError).
             The 4 tests in tests/test_version.py. The signatures parse(text), compare(a, b).
- Done when: .venv/bin/python -m pytest -q exits 0 with tests/test_issue7.py,
             shasum -a 256 -c ../notes/tests.sha256 says OK, and
             git add -N . && git diff --stat base lists only
             semverlite/version.py and tests/test_issue7.py.
```

The `git add -N .` matters: plain `git diff` does not see new files. [Enforced guardrails](#enforced-guardrails) shows why.

Five rules make the bullets work:

1. **Examples, not adjectives.** "Compare correctly" is not checkable. `compare("1.10.0", "1.9.0") == 1` is.
2. **Both directions.** One example invites a special case for that input. Below, a simulated agent writes exactly that, and the reversed example catches it.
3. **Behavior says what, not where.** The Behavior bullet never names a file. Files appear only in Must keep and Done when, and only from your checked map ([[S2]]). A task instruction for Gemini goes further and names no files at all: DeepSWE's hand-written task prompts describe behavior only, so the agent must find where to change the code ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). Your own prompt to an agent may name files and interfaces, as Claude Code's guide advises below.
4. **Every example becomes a test you own.** You write it, or you read it line by line before any fix. The [milestone audit](#milestones) below shows what happens when an agent writes its own tests: they skip the spec's own example.
5. **Done when is a command.** If you cannot run it, it is a wish.

**Why this pays.** The spec moves the result. When SWE-Bench Pro removed the written requirements and interface from its tasks, GPT-5 fell from 25.9% to 8.4%. That was on its public set, with runs capped at 50 turns and $2 each ^[confirmed](https://arxiv.org/html/2509.16941 "2026-10-20"). Anthropic's Claude Code guide says the most useful specs name the files and interfaces involved, state what is out of scope, and end with an end-to-end check ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20"). Terminal-Bench's contributor checklist asks that every tested behavior appears in the instruction, and the reverse ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20"). That last rule is the Polaris link: a task's `instruction.md` is a spec written for Gemini. If you cannot write three tight bullets for a 1-line bug, you cannot write a task instruction for a 2-day feature ([[task-design]]).

**Must keep catches hidden behavior changes.** The right fix for #7 changes what `parse` returns: whole numbers instead of strings. That is a behavior change. The README says each part is a whole number, so ints match the spec. In a real library, check the callers before you accept it:

```zsh
rg -n --sort path 'parse\(' .
```

```text
./README.md:3:parse(text) reads "MAJOR.MINOR.PATCH". Each part is a whole number.
./semverlite/version.py:4:def parse(text):
./semverlite/version.py:14:    pa, pb = parse(a), parse(b)
./tests/test_version.py:20:        parse("1.4")
```

No caller needs strings. Write that down in `audit.md`. The plan must list the change anyway.

| Vague request | What goes wrong | The 3-bullet fix |
|---|---|---|
| "Fix the version bug." | No example, so no test and no stop. | Behavior with 3 examples, both directions. |
| "Make 1.10.0 compare right." | One example invites a special case. | Add the reverse and a second part position. |
| "Make compare robust." | An open door for scope creep ([[M4]]). | Must keep plus "only `semverlite/version.py`". |
| "Fix it and make sure tests pass." | The agent can edit the tests ([[M3]]). | Done when includes the test hashes. |

## Failing test first {#failing-test-first}

**Red for the right reason** means the test fails on an assertion about the value the issue describes. It does not fail on an import error, a typo or a missing fixture. Three tries on #7 show the difference.

**Try 1: red for the wrong reason.** The test imports a function that does not exist:

```python
from semverlite.version import compare_versions


def test_issue_7():
    assert compare_versions("1.10.0", "1.9.0") == 1
```

```zsh
.venv/bin/python -m pytest -q tests/test_issue7.py; echo "exit=$?"
```

```text
____________________ ERROR collecting tests/test_issue7.py _____________________
ImportError while importing test module '…/repo/tests/test_issue7.py'.
…
E   ImportError: cannot import name 'compare_versions' from 'semverlite.version' (…/repo/semverlite/version.py)
=========================== short test summary info ============================
ERROR tests/test_issue7.py
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
1 error in 0.04s
exit=2
```

It is red, but it tests nothing. Any fix, right or wrong, leaves it red until someone renames the import. An agent that "fixes" it may add a `compare_versions` alias and call that progress. This is also a classic invented API ([[M1]]).

**Try 2: not red at all.** The test runs, but its inputs never hit the bug:

```python
from semverlite.version import compare


def test_issue_7():
    assert compare("1.10.0", "1.10.0") == 0
    assert compare("1.10.0", "2.0.0") == -1
```

```text
.                                                                        [100%]
1 passed in 0.00s
exit=0
```

It passes on the buggy code, so it reproduces nothing. A test that is green before the fix cannot prove the fix.

**Try 3: red for the right reason.**

```python
"""Issue #7: parts must compare as numbers, not as text."""
from semverlite.version import compare


def test_minor_two_digits():
    assert compare("1.10.0", "1.9.0") == 1
    assert compare("1.9.0", "1.10.0") == -1


def test_patch_two_digits():
    assert compare("2.0.10", "2.0.9") == 1
```

```text
FF                                                                       [100%]
=================================== FAILURES ===================================
____________________________ test_minor_two_digits _____________________________

    def test_minor_two_digits():
>       assert compare("1.10.0", "1.9.0") == 1
E       AssertionError: assert -1 == 1
E        +  where -1 = compare('1.10.0', '1.9.0')

tests/test_issue7.py:6: AssertionError
____________________________ test_patch_two_digits _____________________________

    def test_patch_two_digits():
>       assert compare("2.0.10", "2.0.9") == 1
E       AssertionError: assert -1 == 1
E        +  where -1 = compare('2.0.10', '2.0.9')

tests/test_issue7.py:11: AssertionError
=========================== short test summary info ============================
FAILED tests/test_issue7.py::test_minor_two_digits - AssertionError: assert -...
FAILED tests/test_issue7.py::test_patch_two_digits - AssertionError: assert -...
2 failed in 0.01s
exit=1
```

The failure shows the exact wrong value from the issue: `-1`. That is the right reason. Read the exit code too. pytest documents 0 (all passed), 1 (some tests failed), 2 (interrupted), 3 (internal error), 4 (usage error), 5 (no tests collected) and 6 (too many warnings, with `--max-warnings`) ^[confirmed](https://docs.pytest.org/en/stable/reference/exit-codes.html "2026-10-20"). A collection error shows up as "Interrupted" with exit 2, as in try 1.

**The right-reason checklist:**

- [ ] It fails on an assertion, and pytest exits 1, not 2, 3, 4 or 5.
- [ ] The failure message shows the wrong value from the issue.
- [ ] It has at least two inputs, one in each direction.
- [ ] It passes after the fix and fails again when you put the old code back (the red-to-green check in [small diffs](#small-diffs)).
- [ ] It does not depend on time, network, test order or a random seed.

**Commit the red test alone,** so the fix arrives as a separate commit. Tag it `red-7`: a later section copies the repo from exactly this point. Then hash the test files. You will check the hashes after every agent step.

```zsh
git switch -q -c fix-7 && git add tests/test_issue7.py && git commit -qm "test: reproduce #7 (fails on 0.1.0)" && git tag red-7
shasum -a 256 tests/*.py > ../notes/tests.sha256 && cat ../notes/tests.sha256
```

```text
dcdb405c0dd15307e66bd590d1992fa2704bf3cd07a542a7c8397eb55dee1e11  tests/test_issue7.py
b5c6477d6512a0441b46ad1b99dad1735a40c0afd7f8af7e9b2bb7ec0f0c6c3b  tests/test_version.py
```

**Who writes it?** You, or the agent in a separate step whose diff you read before any fix. If you delegate it, use a prompt like this:

```text
Write a failing test for ISSUE.md in a NEW file tests/test_issue7.py.
Use exactly these examples: compare("1.10.0", "1.9.0") == 1,
compare("1.9.0", "1.10.0") == -1, compare("2.0.10", "2.0.9") == 1.
Do not change any other file. Do not fix the bug.
Run only the new test and paste the real output. Then stop.
```

**Why first?** A reproduction test that fails before the fix and passes after it is a strong filter. Used to screen proposed fixes in SWT-Bench, such tests doubled SWE-Agent's precision ^[confirmed](https://arxiv.org/abs/2406.12952 "2026-10-20"). It is also the core of SWE-bench-style graders: the FAIL_TO_PASS tests must go from red to green ^[confirmed](https://arxiv.org/abs/2310.06770 "2026-10-20"). A grader test that is red for the wrong reason rejects every attempt. Anthropic's eval guide warns that a 0% pass rate over many trials usually means a broken task ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20").

:::warn title="The pipe trap: exit 0 with a failing test"
When you pipe pytest into `tail`, the shell reports the exit code of `tail`, not of pytest. Real output, with both #7 tests failing:

```zsh
.venv/bin/python -m pytest -q tests/test_issue7.py 2>&1 | tail -1; echo "exit=$?"
set -o pipefail; .venv/bin/python -m pytest -q tests/test_issue7.py 2>&1 | tail -1; echo "exit=$?"
```

```text
2 failed in 0.01s
exit=0
2 failed in 0.01s
exit=1
```

From here on, every piped test command on this page sets `set -o pipefail` first. An agent's "exit 0" after a pipe proves nothing. Keep this in mind for [headless runs](#headless): exit codes lie in more than one way.
:::

**S7 in one probe.** Between reproducing and planning comes locating ([[S7]]); [[debug]] teaches it in depth. Here one line settles it, run on the old code:

```zsh
.venv/bin/python -c 'from semverlite.version import parse; print(parse("1.10.0"), parse("1.9.0"), "10" < "9")'
```

```text
('1', '10', '0') ('1', '9', '0') True
```

Gate 3, in two sentences: "`parse` returns the parts as strings (`semverlite/version.py:9`), so `compare` orders them as text and `"10"` sorts before `"9"`. The tests missed it because every visible test uses one-digit parts."

## Plan mode {#plan-mode}

**Plan mode** makes the agent read and propose before it edits. You approve the plan; only then does it write code. Each tool enters it differently:

| Tool | How to enter plan mode | What the docs say about writes |
|---|---|---|
| Antigravity CLI (`agy`) | `agy --mode=plan`, or Shift+Tab, which cycles default → accept-edits → plan ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20") | It investigates with read-only tools and shows an outline before writing code. The page does not say that every write is blocked. |
| Gemini CLI | `/plan`, Shift+Tab or `--approval-mode=plan` ^[confirmed](https://geminicli.com/docs/cli/plan-mode/ "2026-10-20") | Only read and search tools. It may write only `.md` plan files. |
| Claude Code | `claude --permission-mode plan`, or Shift+Tab ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20") | It reads files and answers questions without making changes. |

The `agy`, Gemini CLI and Claude Code commands were checked against docs on 2026-10-20, not run. Because the `agy` docs do not promise a read-only plan mode, check it yourself after every plan:

```zsh
[[ -z "$(git status --porcelain)" ]] && echo "nothing written" || { echo "CHANGED:"; git status --short -uall; }
```

```text
nothing written
```

The test is on the output, not the exit code. `git status` exits 0 whether or not the tree is clean, so `git status && echo "nothing written"` always prints its reassurance. After a one-line edit to `README.md`, the same check prints:

```text
CHANGED:
 M README.md
```

`git status` does not see ignored files (here `.venv/`, `__pycache__/` and `.pytest_cache/`) or files outside the repo. So also re-run the hash check.

**When to plan.** Claude Code's guide gives a rule of thumb: if you could describe the diff in one sentence, skip the plan ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20"). Google's agy docs recommend plan mode for complex refactoring, multi-file architectural changes and investigating an unfamiliar codebase ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20"). For Polaris-style work, plan anything that touches more than one file, any long task, and any code you have not mapped ^[inference](- "2026-10-20"). Reading plans is also Polaris work: in a transcript, the plan is often where the first wrong turn happens ([[S14]]) ^[inference](- "2026-10-20").

**The plan prompt.** It extends the [[cards#card-prompts|prompt card]] S8 prompt with your spec:

```text
Plan a fix for ISSUE.md. Do not edit any file.
Spec: (paste the 3 bullets)
Rules: fix the cause, in general. No special cases for test inputs.
Change only semverlite/version.py. Do not edit tests.
Give: the root cause with file:line; each step; every behavior that will
change; the exact test command and the result you expect.
If the spec and the tests disagree, stop and ask.
```

**A first plan.** Example agent output, written for this guide. Not real Gemini output:

> 1. In compare, pad each part with zeros to 3 digits, so string comparison works.
> 2. Update tests/test_version.py with more cases.
> 3. Run the tests.

Review it against six checks:

| Check | Plan 1 | Verdict |
|---|---|---|
| 1. Root cause named with file:line, and it matches your Gate 3 sentences | None given. Step 1 keeps the strings and works around them in `compare`. | Fail |
| 2. Every step maps to a spec bullet, and nothing extra | Step 2 maps to nothing. | Fail |
| 3. Only files on your checked map; no tests edited; no new dependencies | Step 2 edits an existing test file. | Fail ([[M3]]) |
| 4. A list of every behavior that changes | Missing. | Fail |
| 5. A verification step with the exact command and the expected count | "Run the tests." No command, no count. | Fail |
| 6. A stop condition | Missing. | Fail |

Step 1 is the worst: zero-padding to 3 digits is a **similar-but-different** fix ([[M5]]). It works up to 999 and breaks at 1000. PatchDiff found that "similar but different implementation" was the main cause of test-passing SWE-bench patches that behave differently from the developer's fix ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20").

Save the plan text as `../notes/plan-1.txt`. A grep finds some red-flag words in it. It does not replace reading:

```zsh
rg -n -i 'tests/|update (the )?tests?|special.?case|hard.?code|skip|xfail|for now|workaround|temporar|mock|simplif' ../notes/plan-1.txt; echo "exit=$?"
```

```text
2:2. Update tests/test_version.py with more cases.
exit=0
```

The grep caught step 2. Only reading caught step 1. Reply with the reasons, and log the reply in `audit.md` as correction 1 of this session.

**A second plan.** Example agent output, written for this guide. Not real Gemini output:

> 1. Root cause: `parse` returns the parts as strings (`semverlite/version.py:9`), so the tuples compare as text.
> 2. Change line 9 to return `tuple(int(p) for p in parts)`.
> 3. Behavior change: `parse` now returns ints, not strings. `compare` changes only when two parts have a different number of digits.
> 4. No test edits. Run `.venv/bin/python -m pytest -q` and expect 6 passed.
> 5. Stop and ask if any caller needs string parts. I found none with `rg -n 'parse\(' .`.

All six checks pass. Check the one factual claim yourself: you already ran that `rg` in [spec first](#spec-first). Approve it.

## Guardrails {#guardrails}

A **guardrail** is a rule that keeps the agent inside the spec. There are two kinds:

- **Written guardrails** are advisory: the rule file and your prompt. The agent can ignore them.
- **Enforced guardrails** are deterministic: a hash check, a sandbox, a permission mode, held-out tests. They work whether or not the agent listens.

Claude Code's docs draw the same line: instructions in its rule file are advisory, while hooks are deterministic ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20"). The senior rule: **a guardrail the agent can edit is a request, not a guardrail.**

### The rule file, line by line {#rule-file}

[[S5]] shows how to write a rule file and confirm it loaded. `agy` reads both `GEMINI.md` and `AGENTS.md` ^[confirmed](https://antigravity.google/docs/cli/gcli-migration "2026-10-20"). `mk-semverlite.sh` already wrote this one into the `base` commit, before any agent ran:

```text
# Rules for agents in this repo

- Test command: `.venv/bin/python -m pytest -rA`. At tag base: 4 passed. An issue's new tests fail until it is fixed.
- Spec: README.md and ISSUE.md. If they and the tests disagree, stop and ask.
- Do not edit, skip or delete tests. Add no conftest.py or pytest config. New tests go in new files.
- Fix the cause, in general. No special cases for test inputs.
- Change only the files I name. No new dependencies.
- Do not search git history, other branches or the web for a fix.
- One plan step at a time. After each: git status, git diff --stat, the diff, the real test output.
- Never write "tests pass" without the command and its output.
- Cite file:line for every claim. Say "unsure" when unsure.
```

The file is committed, not ignored. So if the agent edits or deletes it, `git status` and `git diff --stat base` show it. A rule file that git cannot see is a guardrail the agent can quietly edit.

Every line is there because an agent mistake made it necessary:

| Line | Blocks | Why it is worth a line | Your deterministic check |
|---|---|---|---|
| Test command and baseline | Invented commands ([[M1]]), no verification loop | Google's agy guide says to give the agent a local check to run after every change ^[confirmed](https://antigravity.google/docs/cli/best-practices "2026-10-20") | The agent quotes the command back. You compare with `baseline.txt`. |
| Stop and ask on conflict | Cheating when the tests contradict the spec | On ImpossibleBench's Conflicting-SWEbench split, where the tests contradict the spec, an option to abort cut GPT-5's cheating from 54% to 9% ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20") | Search the transcript: did it ask? |
| Do not edit tests; no conftest or config | Test gaming ([[M3]]) | On the same split, test modification was over 79% of Claude and Qwen3-Coder cheating, as classified by an LLM judge ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20") | `shasum -a 256 -c ../notes/tests.sha256`, `git diff --stat base -- tests/`, and the new-file check below |
| No special cases | Special-cased inputs ([[M3]]) | Claude 3.7 Sonnet sometimes special-cased tests, usually after several failed general attempts ^[confirmed](https://www.anthropic.com/claude-3-7-sonnet-system-card "2026-10-20") | The reversed example, and the literal-copy check below |
| Only named files, no new dependencies | Scope creep ([[M4]]), invented packages ([[M10]]) | Unmerged agent PRs were larger and touched more files ^[confirmed](https://arxiv.org/abs/2601.15195 "2026-10-20") | `git add -N . && git diff --stat base`, and a diff of any dependency file |
| No history or web lookup | Solution lookup ([[M7]]) | Three open models tried shortcuts in 55.5–89.1% of DeepSWE trajectories ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20") | The fresh-git practice copy ([[S0]]), and `rg` on the transcript |
| One step at a time, with output | Big unreadable diffs, unverified claims | See [small diffs](#small-diffs) | Each step's diff is under budget |
| No "tests pass" without output | Overselling ([[M6]]) | An LLM judge found overselling in 34.7% of 4,788 sessions in one public dataset (1.8% severe) ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20") | You re-run it ([[S11]]) |
| file:line for every claim | Answering from memory ([[M8]]) | Claims without a location cannot be checked | Open 5 cited lines |

Keep the file short. Claude Code's guide warns that a bloated rule file makes the agent ignore real instructions, and suggests asking of each line: would removing it cause mistakes ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20")? Ten lines is plenty for one repo ^[inference](- "2026-10-20").

### Enforced guardrails {#enforced-guardrails}

**1. Test hashes outside the repo.** You made `../notes/tests.sha256` after committing the red test. Here is what an edited test looks like. Play the agent: change `parse("1.4")` to `parse("1.4.x")`, run the check, then undo the edit:

```zsh
sed -i '' 's/parse("1.4")/parse("1.4.x")/' tests/test_version.py
shasum -a 256 -c ../notes/tests.sha256; echo "exit=$?"
git restore tests/test_version.py
```

```text
tests/test_issue7.py: OK
tests/test_version.py: FAILED
shasum: WARNING: 1 computed checksum did NOT match
exit=1
```

**The hole: new files.** The hash list covers only the test files that existed when you made it. pytest also loads every `conftest.py` it finds on the way to the tests, and its config from `pytest.ini`, `pyproject.toml`, `setup.cfg` or `tox.ini`. A new file can change every result without touching a hashed file. Play the agent once more, on `fix-7` before the fix, while both #7 tests still fail. This `conftest.py` turns every test report into a pass:

```zsh
cat > conftest.py <<'EOF'
import pytest


@pytest.hookimpl(wrapper=True)
def pytest_runtest_makereport(item, call):
    report = yield
    report.outcome = "passed"
    return report
EOF
set -o pipefail; .venv/bin/python -m pytest -q 2>&1 | tail -1; echo "exit=$?"
shasum -a 256 -c ../notes/tests.sha256
git diff --stat base
git add -N . && git diff --stat base
```

```text
6 passed in 0.09s
exit=0
tests/test_issue7.py: OK
tests/test_version.py: OK
 tests/test_issue7.py | 11 +++++++++++
 1 file changed, 11 insertions(+)
 conftest.py          |  8 ++++++++
 tests/test_issue7.py | 11 +++++++++++
 2 files changed, 19 insertions(+)
```

Six green tests on unfixed code, both hashes OK, and a plain `git diff --stat base` that shows only the test file. `git diff` compares tracked files only, so a new file is invisible to it. `git add -N .` ("intent to add") tells git about new files without staging their content. After it, `git diff`, `--stat` and `--numstat` show them. From here on, every diff we read to judge scope comes after `git add -N .`. Also look for pytest files by name. Any hit is a finding until you have read it ([[M3]]). Then undo the cheat:

```zsh
git add -N . && git diff --name-only base | rg 'conftest\.py|pytest\.ini|pyproject\.toml|setup\.cfg|tox\.ini'
git rm -q --cached conftest.py && rm conftest.py
```

```text
conftest.py
```

**2. The literal-copy check.** A special case usually copies the test's inputs into the source. This finds added source lines that contain a string literal from the test. Here it runs on attempt 1 from [two failed corrections](#two-corrections). Try it while that attempt is applied:

```zsh
git add -N . && git diff base -- . ':!tests' | rg '^\+' | rg -n -F -f <(rg -o --no-filename '"[^"]+"' tests/test_issue7.py | sort -u)
```

```text
2:+    if (a, b) in {("1.10.0", "1.9.0"), ("2.0.10", "2.0.9")}:
```

A hit is a question, not a verdict. A real fix may legitimately mention a constant from a test. Read the hunk.

**3. Permissions and the sandbox.** In `agy`, the `toolPermission` setting picks how much it asks: `request-review` (the default) asks before writes, shell commands and network calls; `proceed-in-sandbox` runs terminal commands in a sandbox and asks only for risky ones; `strict` asks for every non-read operation ^[confirmed](https://antigravity.google/docs/cli/best-practices "2026-10-20"). The terminal sandbox (`enableTerminalSandbox`, or `--sandbox` for one session) is off by default. Sandboxed commands run without network access by default, sensitive files such as `~/.ssh` and `.env` are blocked, and on macOS it is built on `sandbox-exec` ^[confirmed](https://antigravity.google/docs/sandbox?tab=cli "2026-10-20"). The settings live in `~/.gemini/antigravity-cli/settings.json`, which is global: it affects every project. Checked against docs on 2026-10-20, not run.

**4. Where your evidence lives.** `../notes` is out of the agent's way, but not out of its reach. Even agy's sandbox lets commands write to the workspace, temporary directories and common build caches ^[confirmed](https://antigravity.google/docs/sandbox?tab=cli "2026-10-20"). `mktemp -d` makes `$W` under `$TMPDIR`, a temporary directory on macOS. So your hash file, `check_status.py` and the held tests all sit where a sandboxed command may write. The canary test in [[S0]] tells you what the agent can read. Keep a second copy of the hashes and held tests in a non-temporary folder outside the workspace, and check against that copy at the end ^[inference](- "2026-10-20"):

```zsh
mkdir -p ~/audit-notes/semverlite && cp ../notes/tests.sha256 ~/audit-notes/semverlite/
shasum -a 256 -c ~/audit-notes/semverlite/tests.sha256
```

```text
tests/test_issue7.py: OK
tests/test_version.py: OK
```

## Small diffs {#small-diffs}

**Small** means one behavior per step. As a budget: at most 2 files and about 50 changed lines per step ^[inference](- "2026-10-20"). These are the same thresholds at which [[agent-patch-audit#modes|Chapter 2]] escalates a light audit to a full one. The evidence points the same way: in a study of 33k agent PRs on GitHub, the unmerged ones were larger, touched more files and often failed CI ^[confirmed](https://arxiv.org/abs/2601.15195 "2026-10-20").

**The edit loop**, once per plan step:

1. Ask for one step. "Do step 2 of the plan only. Then stop. Show `git status`, `git diff --stat`, the diff and the real output of the full test command."
2. Run `git add -N .`, then read `git status --short` and `git diff --stat`. Is anything there you did not expect? A new file counts.
3. Read the whole diff. Not the agent's summary of it.
4. Run the full suite yourself, and the hash check.
5. Commit, or reject with a reason.

Here is step 2 of the approved plan. To follow along without an agent, make the edit yourself: `sed -i '' 's/    return tuple(parts)/    return tuple(int(p) for p in parts)/' semverlite/version.py`. Then read it:

```zsh
git add -N . && git status --short && git diff --stat && git diff
```

```diff
 M semverlite/version.py
 semverlite/version.py | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
diff --git a/semverlite/version.py b/semverlite/version.py
index ef5bc56..0f213eb 100644
--- a/semverlite/version.py
+++ b/semverlite/version.py
@@ -6,7 +6,7 @@ def parse(text):
     parts = text.strip().split(".")
     if len(parts) != 3 or not all(p.isdigit() for p in parts):
         raise ValueError(f"bad version {text!r}")
-    return tuple(parts)
+    return tuple(int(p) for p in parts)
 
 
 def compare(a, b):
```

Check the budget, the suite, one probe beyond the tests and the hashes:

```zsh
git add -N . && git diff --numstat | awk '{a+=$1; d+=$2; f++} END {print f+0 " files, +" a+0 " -" d+0; exit (f > 2 || a + d > 50)}'; echo "budget exit=$?"
set -o pipefail; .venv/bin/python -m pytest -rA 2>&1 | tail -1; echo "exit=$?"
.venv/bin/python -c 'from semverlite.version import compare; print(compare("1.10.0", "1.9.0"), compare("1.0.1000", "1.0.999"), compare("1.4.2", "1.4.2"))'
shasum -a 256 -c ../notes/tests.sha256
```

```text
1 files, +1 -1
budget exit=0
============================== 6 passed in 0.01s ===============================
exit=0
1 1 0
tests/test_issue7.py: OK
tests/test_version.py: OK
```

Now commit. One green step, one commit:

```zsh
git commit -qam "fix #7: parse returns int parts" && git log --oneline
```

```text
5685ae5 fix #7: parse returns int parts
c819fc8 test: reproduce #7 (fails on 0.1.0)
8614932 semverlite 0.1.0
```

**The red-to-green check.** Put the old source back, keep the new test, and run it. It must fail. Then restore the committed fix. Commit first: `git restore -- semverlite/` restores from the index, so an uncommitted fix would be lost.

```zsh
set -o pipefail
git restore --source=base -- semverlite/ && .venv/bin/python -m pytest -q tests/test_issue7.py 2>&1 | tail -1; echo "exit=$?"
git restore -- semverlite/ && .venv/bin/python -m pytest -q tests/test_issue7.py 2>&1 | tail -1; echo "exit=$?"
```

```text
2 failed in 0.01s
exit=1
2 passed in 0.01s
exit=0
```

Why one commit per green step? It makes a rewind one command. It makes [[S14]] easy: each claim in the transcript maps to one commit. And it lets a milestone audit read the history step by step.

**Which mode?** `agy`'s default mode pauses for a diff review before any file is created or changed. `accept-edits` approves file edits automatically, including edits by subagents ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20"). Use the default for anything risky. Use `accept-edits` only for mechanical edits, from a clean, committed tree that you can reset ^[inference](- "2026-10-20").

## The rewind rule {#rewind-rule}

**The rule.** If you have corrected the agent twice on the same problem and it is still wrong, stop correcting. Throw the session away. Start fresh with a better first prompt that includes what you learned.

This comes from Anthropic's Claude Code best practices, not from Google. The guide says that once you have corrected the agent more than twice on the same issue in one session, the context is full of failed approaches. A fresh session with a sharper prompt usually does better than a long session of corrections. Its list of common failure patterns gives the fix: after two failed corrections, clear the session and write a better first prompt that uses what you learned ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20"). The cause, a context full of failed attempts, is not specific to one tool, so we apply the rule to `agy` and Gemini as well ^[inference](- "2026-10-20").

**Why it works.** Stuck sessions fail in known ways. A study of failed SWE-bench Verified runs names them in its iterative-verification phase: non-progressive iteration, blind strategy switching, validation retreat and context amnesia ^[confirmed](https://arxiv.org/html/2509.13941 "2026-10-20"). The authors hand-labeled a random sample of 150 SWE-bench Verified issues that at least one of three tools failed. For OpenHands, 49.1% of its failed issues in that sample had errors in this phase. The share rose from 27% on easy issues to 64% on hard ones, and only 20 of the 150 issues were hard ^[confirmed](https://arxiv.org/html/2509.13941 "2026-10-20"). Stuck sessions are also where cheating starts: Claude 3.7 Sonnet's special-casing of tests usually came after several failed general attempts ^[confirmed](https://www.anthropic.com/claude-3-7-sonnet-system-card "2026-10-20"). So the rewind rule is also an anti-gaming rule.

### Two failed corrections on #7 {#two-corrections}

This is a separate session on the same issue. This time the agent edited without plan mode. The attempts were written for this guide to simulate an agent. The command output is real.

To replay it, branch from the commit with the red test. Each attempt is a patch that you apply with `git apply`:

```zsh
git switch -q -c no-plan fix-7~1 && git log --oneline -1
```

```text
c819fc8 test: reproduce #7 (fails on 0.1.0)
```

**Attempt 1** special-cases the issue's inputs:

```zsh
git apply <<'EOF'
--- a/semverlite/version.py
+++ b/semverlite/version.py
@@ -12,4 +12,6 @@
 def compare(a, b):
     """Return -1 if a < b, 0 if a == b, 1 if a > b."""
+    if (a, b) in {("1.10.0", "1.9.0"), ("2.0.10", "2.0.9")}:
+        return 1
     pa, pb = parse(a), parse(b)
     return (pa > pb) - (pa < pb)
EOF
set -o pipefail; .venv/bin/python -m pytest -q tests/test_issue7.py 2>&1 | tail -2; echo "exit=$?"
```

```text
FAILED tests/test_issue7.py::test_minor_two_digits - AssertionError: assert 1...
1 failed, 1 passed in 0.01s
exit=1
```

The reversed example `compare("1.9.0", "1.10.0") == -1` caught it. That is why the spec has both directions. You write: "No special cases. Fix the cause." That is **correction 1**.

**Attempt 2** pads every part to 3 digits. Undo attempt 1 first:

```zsh
git restore semverlite/version.py && git apply <<'EOF'
--- a/semverlite/version.py
+++ b/semverlite/version.py
@@ -12,4 +12,5 @@
 def compare(a, b):
     """Return -1 if a < b, 0 if a == b, 1 if a > b."""
-    pa, pb = parse(a), parse(b)
+    pa = tuple(p.zfill(3) for p in parse(a))
+    pb = tuple(p.zfill(3) for p in parse(b))
     return (pa > pb) - (pa < pb)
EOF
set -o pipefail; .venv/bin/python -m pytest -q 2>&1 | tail -1; echo "exit=$?"
.venv/bin/python -c 'from semverlite.version import compare; print(compare("1.10.0", "1.9.0"), compare("1.0.1000", "1.0.999"))'
```

```text
6 passed in 0.01s
exit=0
1 -1
```

Every test passes. The probe still shows it is wrong: 1.0.1000 sorts before 1.0.999. You write: "Padding breaks at 1000. Do not pad." That is **correction 2**. The next correction would be the third, so the rule fires.

### The rewind protocol {#rewind-protocol}

1. **Log each correction** in `audit.md`: what you said, and the evidence.
2. **Save the failed attempt.** Do not delete it. It is a row for `mistakes.csv`, and it is a ready-made wrong solution for a grader's test corpus ([[grader-validity]]).

   ```zsh
   git stash push --include-untracked -m "attempt 2: zfill(3), wrong for parts >= 1000"
   git stash list && [[ -z "$(git status --porcelain)" ]] && echo "status clean" && git log --oneline -1
   ```

   ```text
   Saved working directory and index state On no-plan: attempt 2: zfill(3), wrong for parts >= 1000
   stash@{0}: On no-plan: attempt 2: zfill(3), wrong for parts >= 1000
   status clean
   c819fc8 test: reproduce #7 (fails on 0.1.0)
   ```

   If the agent already committed the bad work, keep it on a branch first, then reset: `git branch attempt-2 HEAD && git reset --hard LAST_GREEN`. `git reset --hard` throws away uncommitted changes, so save first. To look at a saved stash later, run `git stash show -p 'stash@{0}'`.
3. **Reset the conversation.** Start a new session. Rewinding the chat alone is not enough: the code must go back too.
   - Claude Code: `/clear` starts fresh. `/rewind` can restore the conversation, the code or both, but its checkpoints track only edits made with its file-editing tools, not changes made through Bash. The guide says checkpoints are not a replacement for git ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20").
   - `agy`: the docs describe `/rewind` (alias `/undo`) as rolling the conversation back to a previous checkpoint ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20"). The page does not say that files come back. Checked against docs on 2026-10-20, not run.
   - So in every tool, you rewind the code with git yourself.
4. **Write a better first prompt.** Put what you learned into it, with evidence:

```text
Fix issue #7 (ISSUE.md). The tree is clean at the commit with the red test.
Spec:
- Behavior: parts compare as numbers. compare("1.10.0", "1.9.0") == 1,
  compare("1.9.0", "1.10.0") == -1, compare("2.0.10", "2.0.9") == 1,
  and parts of any size work: compare("1.0.1000", "1.0.999") == 1.
- Must keep: README.md:3-5 and the 4 tests in tests/test_version.py.
- Done when: .venv/bin/python -m pytest -q exits 0 and only
  semverlite/version.py changed.
Already tried and wrong: a special case for the issue's inputs; padding each
part to 3 digits (wrong for 1000 and up). Do not special-case. Do not pad.
The cause: parse() returns text parts (semverlite/version.py:9).
Give a plan first. Wait for my approval before editing.
```

Notice what changed. The new input `1.0.1000` went into the spec, and the new spec line will go into the test. Each failed attempt made the spec stronger. That is the real payoff of the rule.

**When not to rewind.** If each correction fixes a *different* problem and the agent is making progress, keep going. The rule is about the *same* problem coming back ^[inference](- "2026-10-20").

## Headless runs: read `status`, not only the exit code {#headless}

A **headless** run has no human at the keyboard: a prompt goes in, a result comes out, and the agent exits. Eval harnesses usually run agents this way, many times per task. Expect Polaris's to do the same ^[inference](- "2026-10-20"). You will run Gemini this way on your own task in [[runs-and-weaknesses]]. [[prove#headless-status|Chapter 5]] has the short version. This is the full one.

### What the agy docs say {#agy-headless-docs}

Everything in this subsection was checked against the Antigravity CLI headless docs on 2026-10-20 ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"). None of it was run.

- `agy -p "PROMPT"` (also `--print` or `--prompt`) runs one prompt and exits.
- `--output-format` is `text` (the default), `json` or `stream-json`.
- Other flags include `--model`, `--effort`, `--json-schema`, `--sandbox`, `--print-timeout` (default `5m`) and `--dangerously-skip-permissions`, which approves every tool request.
- The `json` result has `conversation_id`, `status`, `response`, `error` (only on failure), `duration_seconds`, `num_turns`, `usage`, and `structured_output` and `json_schema` (only with `--json-schema`).
- `usage` holds `input_tokens`, `output_tokens`, `thinking_tokens`, `cache_read_tokens` and `total_tokens`.
- A run that fails to produce a response exits non-zero and writes the reason to stderr.

The `status` values and what the docs say they mean:

| `status` | Meaning in the docs | Did the run finish normally? |
|---|---|---|
| `SUCCESS` | The run completed and produced a response. | Yes |
| `ERROR` | The run ended with an error. | No |
| `CANCELED` | The run was canceled. | No |
| `INTERRUPTED` | The run was interrupted, for example by SIGINT. | No |
| `INVALID` | The run reached an invalid state. | No |
| `WAITING` | The run ended while waiting on input. | No |
| `RUNNING` | The run did not reach a terminal state. | No |

`status` never removes a run from your count ^[inference](- "2026-10-20"). Every launched attempt stays in the denominator. Grade every workspace yourself, whatever `status` says: the reward comes from your grader, never from the agent ([[runs-and-weaknesses#timeouts|timeouts are outcomes]]). A run that did not finish normally usually leaves broken work and scores 0. It is still one attempt. Re-run only proven infrastructure faults, such as a container that never started, under a rule written before the runs. Report how many you re-ran.

**The gotcha.** In headless mode there is nobody to approve a tool call, so policy decides. The docs say a tool that needs an approval it cannot get is **soft-denied**: the run continues, exits 0, and prints a notice to stderr that names the tool and how to allow it. Shell commands default to Ask, so they are soft-denied unless you grant them. The docs' own CI example reads `.status` with `jq` and exits 1 unless it equals `SUCCESS`.

What follows is our reasoning, not the docs ^[inference](- "2026-10-20"). Suppose you ask a headless agent to "fix the bug and run the tests". Its shell commands are soft-denied, so it never runs the tests. The process still exits 0. The run can still complete with a response, which is what `SUCCESS` means, and the response may still say "all tests pass" ([[M6]]). The only trace is the stderr notice. So `status` alone does not catch this either. You need every layer:

| Signal | What it tells you | What it does not tell you |
|---|---|---|
| Exit code 0 | The process did not fail hard. | Whether tools were denied, or the run state. |
| `status == "SUCCESS"` | The run completed and produced a response. | Whether the tools you needed ran, or whether the code is right. |
| Empty stderr | No soft-deny notice and no other warnings. | Whether the code is right. |
| Your own re-run and the grader | Whether the code meets the spec on the inputs you tested. | Inputs nobody tested ([[agent-patch-audit#evidence-not-proof\|evidence, not proof]]). |

Two more traps for long tasks. The default `--print-timeout` is `5m`, and a Polaris task can take hours ^[inference](- "2026-10-20"). Set the timeout to your task's time budget. The docs do not say which exit code or `status` you get when the timeout expires. So never drop a timed-out run: grade what it left, and count it ^[inference](- "2026-10-20"). And `--dangerously-skip-permissions` removes the soft-deny problem by approving everything. Use it only inside a throwaway sandbox or container that you would delete anyway ^[inference](- "2026-10-20").

### Every harness says "done" differently {#harness-signals}

| Harness | Its "finished" signal | Source |
|---|---|---|
| `agy -p --output-format json` | The `status` field, 7 values | ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20") |
| Gemini CLI `gemini -p` | Exit codes: 0 success, 1 general or API error, 42 input error, 53 turn limit exceeded. Its JSON has `response`, `stats` and `error`, and no `status` field. | ^[confirmed](https://geminicli.com/docs/cli/headless/ "2026-10-20") |
| Gemini API Managed Agents | A run that hits `max_total_tokens` returns status `incomplete`. | ^[confirmed](https://ai.google.dev/gemini-api/docs/antigravity-agent "2026-10-20") |
| Claude Code `claude -p --output-format json` | Exit code 0 on success, non-zero when the run fails. A failure inside the run, such as missing authentication, is printed as the result text on stdout, so a `result` field alone proves nothing. | ^[confirmed](https://code.claude.com/docs/en/headless "2026-10-20") |
| Claude Agent SDK result message | `subtype` is `success` or an error value such as `error_max_turns` or `error_during_execution`. It also carries `is_error`. | ^[confirmed](https://code.claude.com/docs/en/agent-sdk/typescript "2026-10-20") |

Every command in this table was checked against its docs on 2026-10-20, not run. A checker written for one harness is wrong for the next one. Before you trust any count of "successful runs", read that harness's docs for its finished signal. Then test your checker on files that fail.

### A sample result {#sample-result}

:::warn title="Illustrative example, not real output"
We could not run `agy`: it needs a Google sign-in. This file was written by hand for this guide. It uses only the field names from the docs. The values are made up. The docs list `error` as a string, present only on failure. Their example is an unknown `--model`, which exits 1 with status `ERROR`. Our error sample below follows that shape.
:::

`ok.json`, a successful run:

```json
{
  "conversation_id": "illustrative-0001",
  "status": "SUCCESS",
  "response": "Fixed issue #7 in semverlite/version.py. All tests pass.",
  "duration_seconds": 48.2,
  "num_turns": 7,
  "usage": {
    "input_tokens": 18240,
    "output_tokens": 1130,
    "thinking_tokens": 2210,
    "cache_read_tokens": 0,
    "total_tokens": 21580
  }
}
```

Make four more hand-made files for the checker, in the same folder:

```zsh
: > ok.stderr
cp ok.json denied.json
echo "illustrative notice, real wording unknown: run_command was soft-denied" > denied.stderr
printf '%s\n' '{"conversation_id": "illustrative-0002", "status": "ERROR", "error": "illustrative error text", "num_turns": 1}' > error.json
printf '%s\n' '{"type": "illustrative-event"}' '{"type": "illustrative-event"}' > stream.json
```

`denied.json` plus `denied.stderr` is the soft-deny case from above: `SUCCESS` and a claim that tests pass, with a notice on stderr. The real notice wording is not in the docs; ours is made up. `run_command` is the shell tool's name in the agy modes docs ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20"). `stream.json` imitates `stream-json` output, one object per line, which this checker does not read.

### The status checker {#status-checker}

Save this as `check_status.py` in `$W/notes`, outside the agent's workspace. A checker inside the repo is a guardrail the agent can edit. `$W/notes` is still a temporary folder, so keep a second copy with your other evidence ([enforced guardrails](#enforced-guardrails), item 4).

```python
"""Fail unless an agy headless JSON result says status == "SUCCESS".

Usage: python3 check_status.py RESULT.json [RESULT.stderr]

Exit 0: status is exactly "SUCCESS" (and the stderr file, if given, is empty).
Exit 1: the run reports any other status.
Exit 2: the result is missing, is not one JSON object, or has no string "status"
        (also: wrong arguments).
Exit 3: status is "SUCCESS" but stderr is not empty. Read it: a soft-denied
        tool call prints its notice there, and the run still exits 0.
"""
import json
import sys


def check(result_path, stderr_path=None):
    try:
        with open(result_path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError) as e:
        return 2, f"unreadable result: {e}"
    if not isinstance(data, dict) or not isinstance(data.get("status"), str):
        return 2, 'no string "status" field'
    if data["status"] != "SUCCESS":
        return 1, f"status={data['status']} error={data.get('error')!r}"
    if stderr_path is not None:
        try:
            with open(stderr_path, encoding="utf-8") as f:
                noise = f.read().strip()
        except (OSError, ValueError) as e:
            return 2, f"unreadable stderr: {e}"
        if noise:
            return 3, f"status=SUCCESS but stderr is not empty: {noise.splitlines()[0][:100]}"
    return 0, f"status=SUCCESS num_turns={data.get('num_turns')}"


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    code, message = check(*sys.argv[1:])
    print(message)
    sys.exit(code)
```

Three design choices matter:

- **It fails closed.** Anything it does not understand, like a missing file, invalid JSON, a list, or a `null` status, is exit 2, never success. A gate that passes on "unknown" is not a gate.
- **Only the exact string passes.** `"success"` and `"SUCCESS "` fail.
- **Stderr noise is its own code.** Exit 3 means "a human must read this", not "failed". The docs do not say what else `agy` may print to stderr, so the checker cannot decide alone ^[inference](- "2026-10-20").

The tests. Save them as `test_check_status.py` next to the checker:

```python
import json
import subprocess
import sys
from pathlib import Path

import pytest

from check_status import check

SCRIPT = Path(__file__).with_name("check_status.py")


def write(tmp_path, name, text):
    path = tmp_path / name
    path.write_text(text, encoding="utf-8")
    return path


@pytest.mark.parametrize("status, code", [
    ("SUCCESS", 0),
    ("ERROR", 1),
    ("CANCELED", 1),
    ("INTERRUPTED", 1),
    ("INVALID", 1),
    ("WAITING", 1),
    ("RUNNING", 1),
    ("success", 1),
    ("SUCCESS ", 1),
])
def test_only_exact_success_passes(tmp_path, status, code):
    result = write(tmp_path, "run.json", json.dumps({"status": status}))
    assert check(result)[0] == code


@pytest.mark.parametrize("text", [
    "",
    "not json",
    '{"status": "SUCCESS"}\n{"status": "SUCCESS"}',
    '["SUCCESS"]',
    "{}",
    '{"status": null}',
    '{"status": true}',
])
def test_unknown_shape_fails_closed(tmp_path, text):
    result = write(tmp_path, "run.json", text)
    assert check(result)[0] == 2


def test_missing_file_fails_closed(tmp_path):
    assert check(tmp_path / "nope.json")[0] == 2


def test_stderr_noise_needs_review(tmp_path):
    result = write(tmp_path, "run.json", '{"status": "SUCCESS"}')
    quiet = write(tmp_path, "quiet.stderr", "\n")
    noisy = write(tmp_path, "noisy.stderr", "a notice about a tool call\n")
    assert check(result, quiet)[0] == 0
    assert check(result, noisy)[0] == 3
    assert check(result, tmp_path / "nope.stderr")[0] == 2
    binary = tmp_path / "binary.stderr"
    binary.write_bytes(b"\xff\xfe")
    assert check(result, binary)[0] == 2


def test_command_line_exit_codes(tmp_path):
    good = write(tmp_path, "good.json", '{"status": "SUCCESS", "num_turns": 3}')
    bad = write(tmp_path, "bad.json", '{"status": "ERROR", "error": "x"}')
    run = lambda *args: subprocess.run([sys.executable, str(SCRIPT), *map(str, args)], capture_output=True, text=True)
    assert run(good).returncode == 0
    assert run(bad).returncode == 1
    assert run().returncode == 2
```

Run the tests, then the checker on each sample. `python -m pytest` adds the current folder to `sys.path`, so the import works ^[confirmed](https://docs.pytest.org/en/stable/how-to/usage.html "2026-10-20"):

```zsh
cd "$W/notes"
set -o pipefail; ../repo/.venv/bin/python -m pytest -q test_check_status.py 2>&1 | tail -1; echo "exit=$?"
python3 check_status.py ok.json ok.stderr; echo "exit=$?"
python3 check_status.py denied.json denied.stderr; echo "exit=$?"
python3 check_status.py error.json; echo "exit=$?"
python3 check_status.py stream.json; echo "exit=$?"
python3 check_status.py missing.json; echo "exit=$?"
```

```text
19 passed in 0.08s
exit=0
status=SUCCESS num_turns=7
exit=0
status=SUCCESS but stderr is not empty: illustrative notice, real wording unknown: run_command was soft-denied
exit=3
status=ERROR error='illustrative error text'
exit=1
unreadable result: Extra data: line 2 column 1 (char 31)
exit=2
unreadable result: [Errno 2] No such file or directory: 'missing.json'
exit=2
```

### A headless run, end to end {#headless-wrapper}

The full sequence for one attempt on #7, in four steps.

**Step 1: a clean practice copy.** Do not run the agent in `$W/repo`. By now it holds the answer: branch `fix-7` has the fix, and the stash holds attempt 2. An agent that runs `git log --all` finds both. That is solution lookup ([[M7]]), and a success measured there is contaminated. Never run an agent in a repo whose branches, tags or stash contain a fix ([[S0]]). Copy the files at `red-7` into a fresh git instead:

```zsh
git -C "$W/repo" log --all --oneline
R=$(mktemp -d) && git -C "$W/repo" archive red-7 | tar -x -C "$R" && cd "$R"
git init -q && printf '.venv/\n__pycache__/\n.pytest_cache/\n' >> .git/info/exclude
git add -A && git commit -qm "practice copy for #7" && git tag base
python3 -m venv .venv && .venv/bin/python -m pip install -q --disable-pip-version-check pytest==9.1.1
shasum -a 256 tests/*.py > "$W/notes/tests-7.sha256" && git log --all --oneline
```

```text
4da84e9 On no-plan: attempt 2: zfill(3), wrong for parts >= 1000
84839b3 index on no-plan: c819fc8 test: reproduce #7 (fails on 0.1.0)
a843780 untracked files on no-plan: c819fc8 test: reproduce #7 (fails on 0.1.0)
5685ae5 fix #7: parse returns int parts
c819fc8 test: reproduce #7 (fails on 0.1.0)
8614932 semverlite 0.1.0
c41bd0c practice copy for #7
```

The first six lines are the old repo, fix included. The last line is the whole history of the copy.

**Step 2: the prompt.** Save the better first prompt from [the rewind protocol](#rewind-protocol) as `$W/notes/prompt-7.md`. Delete its last line, "Give a plan first. Wait for my approval before editing." In a headless run, nobody is there to approve.

**Step 3: permissions.** Shell commands are soft-denied in headless mode unless you grant them, so decide first how the agent may run the tests. The headless docs give two ways ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"):

- A scoped rule under `permissions.allow` in `~/.gemini/antigravity-cli/settings.json`, written as `action(target)`. The docs' examples are `command(git)` and `write_file(src/)`. That file is global, so a rule there applies to every project.
- `--dangerously-skip-permissions`, which approves every tool call for one run. Use it only inside a throwaway container.

The docs say to prefer scoped rules. Reading and writing files inside the workspace is auto-allowed. We do not know which target matches `.venv/bin/python -m pytest`. Find out on day 1 with the soft-deny experiment in [[start-here#drill-day-one-agy|the Day-1 agy check]]. [[runs-and-weaknesses#path-a|Chapter 9]] adds what the permissions page says about the sandbox. All of this was checked against docs on 2026-10-20, not run.

**Step 4: the run.** Use `stream-json`: the saved stream is your step-level transcript. You need it for [[S14]], and to check every "tests pass" claim against real output. The docs say the stream ends with one `result` event that has the same shape as the `json` output ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"). So the checker reads the last line. `< /dev/null` closes stdin, as Harbor's adapter does ([[runs-and-weaknesses#path-a|Chapter 9]]). The `agy` line was checked against docs on 2026-10-20, not run.

```zsh
cd "$R"
agy -p "$(cat "$W/notes/prompt-7.md")" --output-format stream-json --print-timeout 30m --sandbox < /dev/null > "$W/notes/run-7.jsonl" 2> "$W/notes/run-7.stderr"; echo "agy exit=$?"
tail -n 1 "$W/notes/run-7.jsonl" > "$W/notes/run-7.json"
python3 "$W/notes/check_status.py" "$W/notes/run-7.json" "$W/notes/run-7.stderr"; echo "check exit=$?"
set -o pipefail; .venv/bin/python -m pytest -rA 2>&1 | tee "$W/notes/after-7.txt" | tail -1; echo "pytest exit=$?"
shasum -a 256 -c "$W/notes/tests-7.sha256"
git add -N . && git status --short && git diff --stat base
```

Record every result in `audit.md`. The reward comes from your own test run on the workspace, whatever `status` says. For this copy, the attempt passes only if the test run passes, the hashes match, and `git status` and the diff show only `semverlite/version.py`. `status` and stderr tell you whether to trust the agent's own report. They never remove the run from your count. For a Polaris task, replace the pytest line with the task's grader ([[grader-validity]]).

## Long-horizon tasks: spec.md, plan.md and milestone audits {#milestones}

A **long-horizon** task takes many steps over hours or days. A **milestone** is a checkpoint inside it that you can test on its own. The Chronos capstone has four milestones with partial credit ([[capstone]]). Polaris tasks are long-horizon by design ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19").

Google's own agent tools gate long work at milestones. Antigravity's agent teams, a paid preview, approve a milestone only after its changes pass review roles that include a Critic, a Challenger and an Auditor ^[confirmed](https://antigravity.google/docs/teamwork/ "2026-10-20"). Google's Conductor keeps `spec.md` and `plan.md` as version-controlled Markdown in the repo, not in chat history, and ticks off tasks in the plan ^[confirmed](https://developers.googleblog.com/evolving-spec-driven-development-conductor-now-supports-antigravity/ "2026-10-20"). Its README puts them at `conductor/tracks/<track_id>/spec.md` and `plan.md`, and warns that the approach can use more tokens in larger projects ^[confirmed](https://github.com/gemini-cli-extensions/conductor "2026-10-20").

### The two files {#spec-and-plan}

**`spec.md`** holds global rules that hold at every milestone, plus one 3-bullet spec per milestone. The global rules are where long tasks break: by milestone 3, nobody remembers a decision from milestone 1 unless it is written down. Terminal-Bench 2.0 calls this context loss ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20").

**`plan.md`** is a checklist. The agent may tick a box. You verify the tick. Each tick must carry a commit and an evidence command. A tick is a claim ([[M6]]).

**Held tests.** When you approve a milestone, copy its tests and their hashes to `../notes/held/` (the name is ours). Later milestones are checked against these copies, not against the copies in the repo that the agent can edit. For milestone 1:

```zsh
mkdir -p ../notes/held/ms1 && cp tests/*.py ../notes/held/ms1/ && shasum -a 256 tests/*.py > ../notes/held/ms1.sha256
```

`../notes` sits in a temporary folder, which even agy's sandbox lets commands write to ([enforced guardrails](#enforced-guardrails), item 4). Copy `held/` to a non-temporary folder outside the workspace as well.

On this site, milestones are written out: "milestone 2", or `ms2` in tags and folder names. M plus a number in prose, like [[M3]], always means a row of the mistake card. One exception: Chronos's own files (`task.toml`, `reward.json`) key its milestones `M1` to `M4`. Inside those files, and in code that reads them, they are milestones.

### The milestone audit {#milestone-audit}

Run it at every milestone, over every commit since the last approved one:

| # | Check | Command | Catches |
|---|---|---|---|
| 1 | Read each commit, in order | `git log -p --reverse LAST_OK..HEAD` | Edits that were added and removed, test edits buried in feature commits, debug leftovers |
| 2 | Full suite with exit code | `set -o pipefail; .venv/bin/python -m pytest -rA 2>&1 \| tee ../notes/msN.txt` | A red suite hidden behind a summary. Read the `-rA` summary for `SKIPPED` and `XFAIL` lines too. |
| 3 | Held tests from every approved milestone | `.venv/bin/python -m pytest -q ../notes/held/ms1`, then the same for each later folder. One folder per run: same-named test files in two folders collide. | Re-introduced bugs, broken old behavior |
| 4 | Test files changed? | `shasum -a 256 -c ../notes/held/ms1.sha256`, `git diff --stat LAST_OK..HEAD -- tests/`, and the pytest-file name check from [enforced guardrails](#enforced-guardrails) | Weakened or edited tests, new `conftest.py` or config ([[M3]]) |
| 5 | Spec examples and the old bug's inputs, run by you through every new public function | a `python -c` probe | Spec drift, and old bugs in new code paths |
| 6 | `plan.md` honesty, and each commit's diff budget | `git diff LAST_OK..HEAD -- plan.md` | Overselling ([[M6]]), steps too big to review |

Check 5 has two halves. **Spec to diff:** every spec line has a hunk that implements it. A spec line with no hunk is missing work, often premature termination. **Diff to spec:** every hunk has a spec line that asks for it. A hunk with no spec line is scope creep ([[M4]]).

### A worked audit {#worked-audit}

**The story.** You gave an agent `spec.md` with three milestones for semverlite 0.2: milestone 1 fixes #7, milestone 2 adds `max_version`, milestone 3 adds `satisfies`. You audited milestone 1 fully and approved it, then saved the held tests. Milestones 2 and 3 ran unattended overnight. The agent ticked every box. You audit milestones 2 and 3 now.

The history and the agent's commits were written by hand for this guide to simulate an agent. The command output is real. To follow along, save the script below as `mk-milestones.sh` in the same folder as `mk-semverlite.sh`. Then run `W=$(zsh mk-milestones.sh | tail -1); cd "$W/repo"`. The script uses macOS `sed -i ''`; on Linux, use `sed -i`. The drill [Audit a 3-milestone run](#drill-change-milestone-audit) uses a different run with different defects, so reading this audit first does not spoil it.

:::reveal title="Show mk-milestones.sh"
```zsh
set -euo pipefail
W=$(zsh mk-semverlite.sh | tail -1)
cd "$W/repo"
cat > spec.md <<'EOF'
# spec.md: semverlite 0.2

Global rules (every milestone):
- G1. parse() accepts only MAJOR.MINOR.PATCH with whole-number parts. Anything else raises ValueError.
- G2. Every ordering compares parts as numbers (issue #7).
- G3. No new dependencies. Do not edit existing tests.

## Milestone 1: fix issue #7
- Behavior: compare("1.10.0", "1.9.0") == 1 and compare("2.0.10", "2.0.9") == 1.
- Must keep: G1-G3 and the 4 baseline tests.
- Done when: .venv/bin/python -m pytest -q passes, including tests/test_issue7.py.

## Milestone 2: max_version(versions)
- Behavior: returns the highest version string, as written. Example: ["1.9.0", "1.10.0"] -> "1.10.0". An empty list raises ValueError.
- Must keep: G1-G3.
- Done when: .venv/bin/python -m pytest -q passes, including tests/test_max.py.

## Milestone 3: satisfies(version, rule)
- Behavior: True when version meets every comma-separated clause. Operators: >=, >, <=, <, ==. Example: satisfies("1.10.0", ">=1.9.0,<2.0.0") is True.
- Must keep: G1-G3.
- Done when: .venv/bin/python -m pytest -q passes, including tests/test_satisfies.py.
EOF
cat > plan.md <<'EOF'
# plan.md (the agent ticks a box when a milestone is done)

- [ ] Milestone 1: fix #7.
- [ ] Milestone 2: max_version.
- [ ] Milestone 3: satisfies.
EOF
git add spec.md plan.md
git commit -qm "docs: spec and plan for 0.2"
git tag spec
python3 - <<'EOF'
p = "semverlite/version.py"
s = open(p).read()
s = s.replace("    pa, pb = parse(a), parse(b)\n",
              "    pa = tuple(int(p) for p in parse(a))\n    pb = tuple(int(p) for p in parse(b))\n")
open(p, "w").write(s)
EOF
cat > tests/test_issue7.py <<'EOF'
"""Issue #7: parts must compare as numbers, not as text."""
from semverlite.version import compare


def test_minor_two_digits():
    assert compare("1.10.0", "1.9.0") == 1
    assert compare("1.9.0", "1.10.0") == -1


def test_patch_two_digits():
    assert compare("2.0.10", "2.0.9") == 1
EOF
sed -i '' 's/^- \[ \] Milestone 1: fix #7\./- [x] Milestone 1: fix #7. Evidence: 6 passed./' plan.md
git add -A
git commit -qm "fix #7 (milestone 1)"
git tag ms1-approved
mkdir -p ../notes/held/ms1
cp tests/*.py ../notes/held/ms1/
shasum -a 256 tests/*.py > ../notes/held/ms1.sha256
cat >> semverlite/version.py <<'EOF'


def max_version(versions):
    """Return the highest version in the list, as written."""
    if not versions:
        raise ValueError("no versions")
    return max(versions, key=parse)
EOF
cat > tests/test_max.py <<'EOF'
import pytest

from semverlite.version import max_version


def test_max_basic():
    assert max_version(["1.2.0", "1.3.0", "0.9.9"]) == "1.3.0"


def test_max_empty():
    with pytest.raises(ValueError):
        max_version([])
EOF
sed -i '' 's/^- \[ \] Milestone 2: max_version\./- [x] Milestone 2: max_version. Evidence: 8 passed./' plan.md
git add -A
git commit -qm "feat: max_version (milestone 2)"
python3 - <<'EOF'
p = "semverlite/version.py"
s = open(p).read()
s = s.replace('"""Parse and compare versions like 1.4.2 (MAJOR.MINOR.PATCH)."""\n',
              '"""Parse and compare versions like 1.4.2 (MAJOR.MINOR.PATCH)."""\nimport operator\n\n'
              '_OPS = {">=": operator.ge, "<=": operator.le, ">": operator.gt, "<": operator.lt, "==": operator.eq}\n')
s = s.replace('def parse(text):\n    """Return the three parts of "MAJOR.MINOR.PATCH". Raise ValueError otherwise."""\n'
              '    parts = text.strip().split(".")\n',
              'def parse(text, loose=True):\n    """Return the three parts of "MAJOR.MINOR.PATCH". Raise ValueError otherwise."""\n'
              '    text = text.strip()\n    if loose:\n        text = text.removeprefix("v")\n'
              '    parts = text.split(".")\n    if loose:\n        parts += ["0"] * (3 - len(parts))\n')
s += '''

def satisfies(version, rule):
    """True if version meets every comma-separated clause, e.g. ">=1.2.0,<2.0.0"."""
    for clause in rule.split(","):
        clause = clause.strip()
        op = next(o for o in (">=", "<=", ">", "<", "==") if clause.startswith(o))
        if not _OPS[op](parse(version), parse(clause[len(op):])):
            return False
    return True
'''
open(p, "w").write(s)
EOF
cat > tests/test_satisfies.py <<'EOF'
from semverlite.version import satisfies


def test_inside_range():
    assert satisfies("1.4.2", ">=1.2.0,<2.0.0")


def test_outside_range():
    assert not satisfies("2.1.0", ">=1.2.0,<2.0.0")


def test_loose_prefix():
    assert satisfies("v1.4", ">=1.2.0")
EOF
sed -i '' 's/parse("1.4")/parse("1.4.x")/' tests/test_version.py
sed -i '' 's/^- \[ \] Milestone 3: satisfies\./- [x] Milestone 3: satisfies. Evidence: 11 passed. No existing tests changed./' plan.md
git add -A
git commit -qm "feat: satisfies (milestone 3)"
echo "$W"
```
:::

The agent fixed #7 at milestone 1 differently from the walkthrough above. It converted the parts to ints inside `compare`, not inside `parse`. The tests passed, and you approved it. Keep that in mind.

**Check 1: read each commit.**

```zsh
git log --reverse --stat --format='%h %s' ms1-approved..HEAD
```

```text
f32cb18 feat: max_version (milestone 2)

 plan.md               |  2 +-
 semverlite/version.py |  7 +++++++
 tests/test_max.py     | 12 ++++++++++++
 3 files changed, 20 insertions(+), 1 deletion(-)
7a22fac feat: satisfies (milestone 3)

 plan.md                 |  2 +-
 semverlite/version.py   | 22 ++++++++++++++++++++--
 tests/test_satisfies.py | 13 +++++++++++++
 tests/test_version.py   |  2 +-
 4 files changed, 35 insertions(+), 4 deletions(-)
```

A feature commit that touches `tests/test_version.py`, an existing test file, is the first red flag. Now the patches (`git log -p --reverse --format='%h %s' ms1-approved..HEAD -- semverlite tests`), trimmed to the key hunks:

```diff
f32cb18 feat: max_version (milestone 2)
+def max_version(versions):
+    """Return the highest version in the list, as written."""
+    if not versions:
+        raise ValueError("no versions")
+    return max(versions, key=parse)
…
+def test_max_basic():
+    assert max_version(["1.2.0", "1.3.0", "0.9.9"]) == "1.3.0"
…
7a22fac feat: satisfies (milestone 3)
-def parse(text):
+
+def parse(text, loose=True):
     """Return the three parts of "MAJOR.MINOR.PATCH". Raise ValueError otherwise."""
-    parts = text.strip().split(".")
+    text = text.strip()
+    if loose:
+        text = text.removeprefix("v")
+    parts = text.split(".")
+    if loose:
+        parts += ["0"] * (3 - len(parts))
…
+        if not _OPS[op](parse(version), parse(clause[len(op):])):
…
+def test_loose_prefix():
+    assert satisfies("v1.4", ">=1.2.0")
…
 def test_rejects_two_parts():
     with pytest.raises(ValueError):
-        parse("1.4")
+        parse("1.4.x")
```

**Check 2: the full suite.**

```zsh
set -o pipefail; .venv/bin/python -m pytest -rA 2>&1 | tee ../notes/ms3.txt | tail -1; echo "exit=$?"
```

```text
============================== 11 passed in 0.01s ==============================
exit=0
```

Green. The agent's "Done when" is met. Keep going.

**Check 3: the held tests from milestone 1.**

```zsh
.venv/bin/python -m pytest -q ../notes/held/ms1; echo "exit=$?"
```

```text
.....F                                                                   [100%]
=================================== FAILURES ===================================
____________________________ test_rejects_two_parts ____________________________

    def test_rejects_two_parts():
>       with pytest.raises(ValueError):
             ^^^^^^^^^^^^^^^^^^^^^^^^^
E       Failed: DID NOT RAISE ValueError

../notes/held/ms1/test_version.py:19: Failed
=========================== short test summary info ============================
FAILED ../notes/held/ms1/test_version.py::test_rejects_two_parts - Failed: DI...
1 failed, 5 passed in 0.01s
exit=1
```

The original test fails on the new code. `parse("1.4")` no longer raises.

**Check 4: were tests changed?**

```zsh
shasum -a 256 -c ../notes/held/ms1.sha256; echo "exit=$?"
git diff --stat ms1-approved..HEAD -- tests/
```

```text
tests/test_issue7.py: OK
tests/test_version.py: FAILED
shasum: WARNING: 1 computed checksum did NOT match
exit=1
 tests/test_max.py       | 12 ++++++++++++
 tests/test_satisfies.py | 13 +++++++++++++
 tests/test_version.py   |  2 +-
 3 files changed, 26 insertions(+), 1 deletion(-)
```

**Check 5: the spec examples, and #7's inputs through every new function.**

```zsh
.venv/bin/python -c '
from semverlite.version import max_version, parse, satisfies
print("Milestone 2 example:", max_version(["1.9.0", "1.10.0"]))
print("Milestone 3 example:", satisfies("1.10.0", ">=1.9.0,<2.0.0"))
print("G1 probe:           ", parse("v1.4"))'
```

```text
Milestone 2 example: 1.9.0
Milestone 3 example: False
G1 probe:            ('1', '4', '0')
```

Both spec examples fail, although every visible test passes. The agent's own tests used only one-digit versions, so they never hit the spec's examples.

**Check 6: `plan.md` and the diff budget.**

```zsh
git diff ms1-approved..HEAD -- plan.md
for c in $(git rev-list --reverse ms1-approved..HEAD); do git show --numstat --format='%h %s' $c -- . ':!plan.md' | awk 'NR==1 {print; next} NF {a+=$1; d+=$2; f++} END {print "  " f " files, +" a " -" d (f > 2 || a + d > 50 ? "  OVER BUDGET" : "")}'; done
```

```text
…
 - [x] Milestone 1: fix #7. Evidence: 6 passed.
-- [ ] Milestone 2: max_version.
-- [ ] Milestone 3: satisfies.
+- [x] Milestone 2: max_version. Evidence: 8 passed.
+- [x] Milestone 3: satisfies. Evidence: 11 passed. No existing tests changed.
f32cb18 feat: max_version (milestone 2)
  2 files, +19 -0
7a22fac feat: satisfies (milestone 3)
  3 files, +34 -3  OVER BUDGET
```

"No existing tests changed" is false: check 4 shows the edit. "11 passed" is true, and it is not the whole story.

**The findings.**

| # | Finding | Spec rule broken | Caught by | Missed by | Mistake row |
|---|---|---|---|---|---|
| 1 | Bug #7 is back in `max_version` and `satisfies`: `parse` still returns strings, so both order versions as text. | G2 | Check 5 | The full suite, the held tests | [[M2]], [[M5]] |
| 2 | `parse` now accepts `v1.4` and `1.4` by default (`loose=True`). Nobody asked for it. | G1 | Checks 1, 3 and 5 | The full suite | [[M4]] |
| 3 | The old test was edited from `parse("1.4")` to `parse("1.4.x")` to hide finding 2. | G3 | Checks 1, 3 and 4 | The full suite | [[M3]] |
| 4 | `plan.md` claims "No existing tests changed". | — | Check 6 | — | [[M6]] |

No single check caught everything. The full suite caught nothing. The held tests caught findings 2 and 3 but not finding 1, because milestone 1's tests never call `max_version` or `satisfies`. Running the spec's own examples caught finding 1. That is why the audit has six checks, and why the spec rule says every example becomes a test you own.

**Where the fix lives.** Finding 1 started at milestone 1. The agent fixed #7 where the symptom showed, in `compare`, and left the cause in `parse`. Every later function that called `parse` inherited the bug. Your walkthrough fix went into `parse` itself, at the line Gate 3 named, and it would have protected milestones 2 and 3. A fix at the symptom's location is a risk that grows with every milestone ([[M2]]) ^[inference](- "2026-10-20"). In a long-horizon task, ask at each milestone: "Did an earlier fix leave the root cause in place?"

**What to do next.** Reject milestones 2 and 3: finding 1 is in both. Save them on a branch as a wrong solution. Add `max_version(["1.9.0", "1.10.0"]) == "1.10.0"` and the milestone 3 spec example as held tests that you own. Re-prompt from `ms1-approved` with a better first prompt that names G1–G3 and the four findings. Then log four rows in `mistakes.csv` ([[S15]]). Each row is also a task idea: "an agent that fixes the symptom early and pays for it three milestones later" is exactly the long-horizon weakness a Polaris task can measure ([[task-design]]).

:::compare
- Types "fix the version bug" and accepts the first green run. || Writes a 3-bullet spec first: examples in both directions, must-keep rules with file:line, one done-when command.
- Lets the agent write the test and the fix in one step. || Gets a test that is red for the right reason, commits it alone, hashes the tests, then asks for a fix.
- Approves a plan because it sounds confident. || Checks every plan step against the spec and the map, and rejects test edits and padding tricks.
- Writes "don't edit tests" in the prompt and trusts it. || Also keeps test hashes and held copies outside the repo, checks them after every step, and runs `git add -N .` so new files like `conftest.py` cannot hide.
- Corrects the agent a fifth time in the same session. || After two failed corrections, saves the attempt, resets the code with git, starts a fresh session and writes a better first prompt.
- Reads exit code 0 from a headless run as "done". || Reads `status`, reads stderr, re-runs the tests and the grader, and checks the diff scope.
- Checks only the final suite of a long run. || Audits each milestone: commits in order, held tests, test hashes, spec examples, `plan.md` claims.
:::

## Drills {#drills}

:::drill id="change-spec-three" title="Write three 3-bullet specs" time="15 min"
Write a 3-bullet spec (Behavior, Must keep, Done when) for each issue. No AI. Then open the answers.

1. semverlite #8: `parse("01.2.3")` is accepted. SemVer 2.0.0 says a normal version must not contain leading zeroes ^[confirmed](https://semver.org/ "2026-10-20").
2. semverlite #9: `compare("1.2.3+build.5", "1.2.3")` raises ValueError. SemVer says build metadata must be ignored when determining precedence ^[confirmed](https://semver.org/ "2026-10-20").
3. A CSV export drops the last row when the input file has no trailing newline.

**Done when:** each spec has at least two examples with one in each direction (or one that must change and one that must not), a must-keep line that points at a file or test, and a done-when command.

:::reveal title="Show example answers"
```text
#8
- Behavior:  parse("01.2.3"), parse("1.02.3") and parse("1.2.03") raise ValueError.
             A part that is exactly "0" is fine: parse("0.2.0") == (0, 2, 0).
- Must keep: README.md:3-5, all existing tests, the #7 fix (tests/test_issue7.py).
- Done when: .venv/bin/python -m pytest -q exits 0 with tests/test_issue8.py,
             the hashes match, and git add -N . && git diff --stat
             shows only semverlite/version.py and the new test.

#9
- Behavior:  compare("1.2.3+build.5", "1.2.3") == 0 and
             compare("1.2.4+build.1", "1.2.3+build.9") == 1.
- Must keep: everything above; "1.4" still raises ValueError (tests/test_version.py:20).
- Done when: .venv/bin/python -m pytest -q exits 0 with tests/test_issue9.py;
             no existing test changed.
             Ask first: should parse() return the metadata, or drop it? The spec
             must say. If you cannot decide, that is the "stop and ask" case.

CSV
- Behavior:  a 3-row file without a final newline exports 3 rows; the same file
             with a final newline also exports 3 rows (no extra empty row).
- Must keep: the header row, column order, quoting of commas (name the test file).
- Done when: the export test suite exits 0 with the new test, run on both files.
```

The "must not change" example in #8 (`0.2.0`) and the "with a final newline" case in the CSV spec both guard against an over-eager fix.
:::
:::

:::drill id="change-red-right-reason" title="Red for the right reason: issue #8" time="20 min"
Start from your semverlite repo, on the branch with the #7 fix: `git switch -q fix-7 && git log --oneline -1` shows "fix #7".

1. Write `tests/test_issue8.py` from your #8 spec. Include the `0.2.0` case that must keep working.
2. Run it with `set -o pipefail` and read the exit code and the failure reason.
3. Fill in the right-reason checklist from [failing test first](#failing-test-first).
4. Commit the red test alone. Update `../notes/tests.sha256`.

**Done when:** pytest exits 1, every failure is `DID NOT RAISE ValueError` on a leading-zero input, the `0.2.0` test passes, and the red test is its own commit.

:::reveal title="Show our test and its real output"
```python
"""Issue #8: a part with a leading zero, like "01", is not a valid version."""
import pytest

from semverlite.version import parse


@pytest.mark.parametrize("text", ["01.2.3", "1.02.3", "1.2.03"])
def test_rejects_leading_zero(text):
    with pytest.raises(ValueError):
        parse(text)


def test_zero_alone_is_fine():
    assert parse("0.2.0") == (0, 2, 0)
```

```text
FAILED tests/test_issue8.py::test_rejects_leading_zero[01.2.3] - Failed: DID ...
FAILED tests/test_issue8.py::test_rejects_leading_zero[1.02.3] - Failed: DID ...
FAILED tests/test_issue8.py::test_rejects_leading_zero[1.2.03] - Failed: DID ...
3 failed, 1 passed in 0.01s
exit=1
```

Here the right reason is `DID NOT RAISE`, not an `AssertionError` about a value. The right reason depends on the issue. Note the trap: on the code *before* the #7 fix, `test_zero_alone_is_fine` fails too, because `parse` returned strings. That failure would be red for a wrong reason. This is why the drill starts after the #7 fix.
:::
:::

:::drill id="change-plan-review" title="Review a plan in 5 minutes" time="15 min"
Example agent plan for #8, written for this guide. Not real Gemini output:

> 1. In `parse`, add `if text.startswith("0"): raise ValueError`.
> 2. Remove `test_rejects_two_parts`, since the new check covers bad input.
> 3. Also accept a leading "v", since users type it.
> 4. Run pytest.

Score each step against the six plan checks from [plan mode](#plan-mode). Write the reply you would send.

**Done when:** you have a verdict for each step with the check it fails, and a reply of 5 lines or fewer.

:::reveal title="Show the answers"
- Step 1 fails check 1 and the spec: it looks only at the first character of the whole string. It misses `1.02.3` and `1.2.03`, and it rejects `0.2.0`, which must keep working. Similar-but-different ([[M5]]).
- Step 2 fails check 3: it deletes an existing test ([[M3]]).
- Step 3 fails check 2: nobody asked for it, and README.md:4 says `v1.4.2` must raise ([[M4]]).
- Step 4 fails check 5: no command, no expected count.
- Checks 4 and 6 fail for the whole plan: no behavior-change list, no stop condition.

A reply: "Rejected. 1: check each part, not the whole string; '0' alone is valid. 2: never delete tests. 3: out of scope; README.md:4 says 'v1.4.2' raises. Give the exact test command and the expected count. Add a stop condition." This is correction 1. Write it in `audit.md`.
:::
:::

:::drill id="change-status-gate" title="Build and test the headless status checker" time="30 min"
If you did the warm-up [[start-here#drill-status-gate|status gate]] drill, start from your own version.

1. Without AI, write `check_status.py` with the four exit codes from [the status checker](#status-checker). Do not copy ours yet.
2. Write tests for at least: every `status` value, a lowercase `success`, a missing file, invalid JSON, `stream-json` lines, a JSON list, and non-empty stderr.
3. Make the five hand-made sample files and run your checker on each.
4. Compare with our version. Find one case that one of the two handles worse.
5. If you have `agy` set up: make one real headless call in a throwaway folder and save the real JSON. Check its field names against the docs list. Note any difference in `agy-notes.md`.

**Done when:** your tests pass, your checker gives 0, 3, 1, 2 and 2 on `ok`, `denied`, `error`, `stream` and a missing file, and you wrote down one case where the two versions differ.
:::

:::drill id="change-milestone-audit" title="Audit a 3-milestone run" time="40 min"
This run has the same three milestones as the [worked audit](#worked-audit), but different defects. The worked audit does not give them away.

1. Open the first reveal below and copy the script into a file named `mk-milestones-2.sh`, in the same folder as `mk-semverlite.sh`. Do not read it: it shows the planted defects. Run `W=$(zsh mk-milestones-2.sh | tail -1); cd "$W/repo"`.
2. Do not read `semverlite/version.py` first. Read `spec.md` and `plan.md`.
3. Run the six checks from [the milestone audit](#milestone-audit) over `ms1-approved..HEAD`. Write each result in `../notes/audit.md`.
4. Write the findings table: finding, spec rule, check that caught it, mistake row.
5. Write the better first prompt for a re-run from `ms1-approved`.
6. Only then open the answer key.

The commits were written by hand for this guide to simulate an agent. The script uses macOS `sed -i ''`. On Linux, use `sed -i`.

**Done when:** your findings table has one row per planted defect, each with the command output that caught it; you opened the key only after writing the table; and your prompt names G1–G3 and every finding.

:::reveal title="Show mk-milestones-2.sh (copy it, do not read it)"
```zsh
set -euo pipefail
W=$(zsh mk-semverlite.sh | tail -1)
cd "$W/repo"
cat > spec.md <<'EOF'
# spec.md: semverlite 0.2

Global rules (every milestone):
- G1. Every function that takes a version accepts only MAJOR.MINOR.PATCH with whole-number parts. Anything else raises ValueError, as parse() does.
- G2. Every ordering compares parts as numbers (issue #7).
- G3. No new dependencies. Do not edit, skip or xfail any test.

## Milestone 1: fix issue #7
- Behavior: compare("1.10.0", "1.9.0") == 1 and compare("2.0.10", "2.0.9") == 1.
- Must keep: G1-G3 and the 4 baseline tests.
- Done when: .venv/bin/python -m pytest -q passes, including tests/test_issue7.py.

## Milestone 2: max_version(versions)
- Behavior: returns the highest version string, as written. Example: ["1.9.0", "1.10.0"] -> "1.10.0". An empty list raises ValueError.
- Must keep: G1-G3.
- Done when: .venv/bin/python -m pytest -q passes, including tests/test_max.py.

## Milestone 3: satisfies(version, rule)
- Behavior: True when version meets every comma-separated clause. Operators: >=, >, <=, <, ==. The bounds of >= and <= are inclusive. Examples: satisfies("1.10.0", ">=1.9.0,<2.0.0") is True, and satisfies("1.2.0", ">=1.2.0") is True.
- Must keep: G1-G3.
- Done when: .venv/bin/python -m pytest -q passes, including tests/test_satisfies.py.
EOF
cat > plan.md <<'EOF'
# plan.md (the agent ticks a box when a milestone is done)

- [ ] Milestone 1: fix #7.
- [ ] Milestone 2: max_version.
- [ ] Milestone 3: satisfies.
EOF
git add spec.md plan.md
git commit -qm "docs: spec and plan for 0.2"
sed -i '' 's/    return tuple(parts)/    return tuple(int(p) for p in parts)/' semverlite/version.py
cat > tests/test_issue7.py <<'EOF'
"""Issue #7: parts must compare as numbers, not as text."""
from semverlite.version import compare


def test_minor_two_digits():
    assert compare("1.10.0", "1.9.0") == 1
    assert compare("1.9.0", "1.10.0") == -1


def test_patch_two_digits():
    assert compare("2.0.10", "2.0.9") == 1
EOF
sed -i '' 's/^- \[ \] Milestone 1: fix #7\./- [x] Milestone 1: fix #7. Evidence: 6 passed./' plan.md
git add -A
git commit -qm "fix #7 (milestone 1)"
git tag ms1-approved
mkdir -p ../notes/held/ms1
cp tests/*.py ../notes/held/ms1/
shasum -a 256 tests/*.py > ../notes/held/ms1.sha256
cat >> semverlite/version.py <<'EOF'


def max_version(versions):
    """Return the highest version in the list, as written."""
    if not versions:
        raise ValueError("no versions")
    return max(versions, key=lambda v: tuple(int(p) for p in v.strip().split(".")))
EOF
cat > tests/test_max.py <<'EOF'
import pytest

from semverlite.version import max_version


def test_max_spec_example():
    assert max_version(["1.9.0", "1.10.0"]) == "1.10.0"


def test_max_empty():
    with pytest.raises(ValueError):
        max_version([])
EOF
sed -i '' 's/^- \[ \] Milestone 2: max_version\./- [x] Milestone 2: max_version. Evidence: 8 passed./' plan.md
git add -A
git commit -qm "feat: max_version (milestone 2)"
python3 - <<'EOF'
p = "semverlite/version.py"
s = open(p).read()
s = s.replace('"""Parse and compare versions like 1.4.2 (MAJOR.MINOR.PATCH)."""\n',
              '"""Parse and compare versions like 1.4.2 (MAJOR.MINOR.PATCH)."""\nimport operator\n\n'
              '_OPS = {">=": operator.gt, "<=": operator.le, ">": operator.gt, "<": operator.lt, "==": operator.eq}\n')
s += '''

def satisfies(version, rule):
    """True if version meets every comma-separated clause, e.g. ">=1.2.0,<2.0.0"."""
    try:
        for clause in rule.split(","):
            clause = clause.strip()
            op = next(o for o in (">=", "<=", ">", "<", "==") if clause.startswith(o))
            if not _OPS[op](parse(version), parse(clause[len(op):])):
                return False
        return True
    except ValueError:
        return False
'''
open(p, "w").write(s)
EOF
cat > tests/test_satisfies.py <<'EOF'
import pytest

from semverlite.version import satisfies


def test_inside_range():
    assert satisfies("1.4.2", ">=1.2.0,<2.0.0")


def test_outside_range():
    assert not satisfies("2.1.0", ">=1.2.0,<2.0.0")


@pytest.mark.xfail(reason="boundary handling, follow-up")
def test_inclusive_bound():
    assert satisfies("1.2.0", ">=1.2.0")
EOF
sed -i '' 's/^- \[ \] Milestone 3: satisfies\./- [x] Milestone 3: satisfies. Evidence: 10 passed. All spec examples pass./' plan.md
git add -A
git commit -qm "feat: satisfies (milestone 3)"
echo "$W"
```
:::

:::reveal title="Show the answer key"
The run has five planted problems. The output below is real, from our replay; your SHAs will differ.

| # | Finding | Spec rule broken | Caught by | Missed by | Mistake row |
|---|---|---|---|---|---|
| 1 | `max_version` splits versions with its own code instead of `parse`, so `max_version(["1.2.0", "1.4"])` returns `"1.4"` instead of raising. | G1 | Check 5: the baseline test's bad input `"1.4"`, run through every new function | The full suite, the held tests, the hashes | [[M5]] |
| 2 | `_OPS` maps `">="` to `operator.gt`, so `satisfies("1.2.0", ">=1.2.0")` is `False`. | Milestone 3 example | Check 5; check 1 if you read the dict | The full suite | [[M5]] |
| 3 | The agent's own test of that example is marked `xfail`. | G3 | Check 1; the `XFAIL` line in check 2 | The hashes and the held tests: only new files changed | [[M3]] |
| 4 | `satisfies` catches `ValueError` and returns `False`, so `satisfies("1.4", ">=1.0.0")` hides a bad version. | G1 | Check 5; check 1 | The full suite | [[M4]] |
| 5 | `plan.md` claims "All spec examples pass." | — | Check 6 | — | [[M6]] |

Check 2, filtered to the lines that matter:

```zsh
set -o pipefail; .venv/bin/python -m pytest -rA 2>&1 | tee ../notes/ms3.txt | rg 'XFAIL|passed|failed'; echo "exit=$?"
```

```text
XFAIL tests/test_satisfies.py::test_inclusive_bound - boundary handling, follow-up
======================== 10 passed, 1 xfailed in 0.02s =========================
exit=0
```

Checks 3 and 4 find nothing this time:

```zsh
set -o pipefail; .venv/bin/python -m pytest -q ../notes/held/ms1 2>&1 | tail -1; echo "exit=$?"
shasum -a 256 -c ../notes/held/ms1.sha256
git diff --stat ms1-approved..HEAD -- tests/
```

```text
6 passed in 0.01s
exit=0
tests/test_issue7.py: OK
tests/test_version.py: OK
 tests/test_max.py       | 12 ++++++++++++
 tests/test_satisfies.py | 16 ++++++++++++++++
 2 files changed, 28 insertions(+)
```

Check 5:

```zsh
.venv/bin/python -c '
from semverlite.version import max_version, satisfies
print("Milestone 2 example: ", max_version(["1.9.0", "1.10.0"]))
print("Milestone 3 examples:", satisfies("1.10.0", ">=1.9.0,<2.0.0"), satisfies("1.2.0", ">=1.2.0"))
print("G1 probe, max_version:", max_version(["1.2.0", "1.4"]))
print("G1 probe, satisfies:  ", satisfies("1.4", ">=1.0.0"))'
```

```text
Milestone 2 example:  1.10.0
Milestone 3 examples: True False
G1 probe, max_version: 1.4
G1 probe, satisfies:   False
```

Check 6 shows the claim: `+- [x] Milestone 3: satisfies. Evidence: 10 passed. All spec examples pass.` "10 passed" is true. "All spec examples pass" is false. A one-line red-flag grep also finds the `xfail`: `git diff ms1-approved..HEAD -- tests | rg -n '^\+.*(xfail|skip)'`.

The lesson differs from the worked audit. The agent only added files, so the held tests and the hashes stayed green. Check 5 caught three of the five problems. Running the old bug's inputs and the spec's examples yourself is the check an agent cannot route around.

A better first prompt:

```text
Redo milestones 2 and 3 from tag ms1-approved. spec.md is the spec.
G1-G3 apply to every function. Use parse() for every version input.
Already tried and wrong: max_version split versions itself and accepted "1.4";
">=" was mapped to operator.gt; satisfies swallowed ValueError; the test of
satisfies("1.2.0", ">=1.2.0") was marked xfail; plan.md claimed all examples pass.
Every spec example must be a plain test that passes. No xfail, no skip.
After each milestone: git status, the diff, and the real output of
.venv/bin/python -m pytest -rA. Then stop and wait.
```
:::
:::

:::drill id="change-rewind-live" title="Run the rewind rule on a real agent" time="45 min"
You need a coding agent for this one (`agy`, Gemini CLI or Claude Code). Use your semverlite repo on a new branch from the #7 fix (`git switch -q -c rewind-live fix-7`), and open the agent only in `$W/repo`. Its history holds the #7 fix but nothing for #8 or #9, so it is safe for this drill.

**First, add the issues.** The repo's `ISSUE.md` has only #7. Add #8 and #9, so the agent can read them:

```zsh
printf '%s\n' '#8: parse("01.2.3") is accepted. SemVer 2.0.0 says a normal version must not contain leading zeroes.' '#9: compare("1.2.3+build.5", "1.2.3") raises ValueError. Build metadata must be ignored for precedence.' >> ISSUE.md && git commit -qam "issues #8 and #9"
```

If you did [Red for the right reason](#drill-change-red-right-reason), `tests/test_issue8.py` is already on this branch. Keep it, and the agent has a test that defines done. For a harder run, remove it first: `git rm -q tests/test_issue8.py && git commit -qm "drop the #8 test for the live drill"`.

1. Give a deliberately weak prompt: "Fix issue #8."
2. Review each result with the edit loop. Every time you reject it, write the correction and its evidence in `audit.md`.
3. After the second failed correction on the same problem, apply [the rewind protocol](#rewind-protocol): stash the attempt with a message, reset the code, start a new session.
4. Write the better first prompt from your #8 spec, including what failed. Run it once.
5. Compare: corrections needed before and after the rewind, and the number of plan checks each first plan passed.

If the weak prompt works the first time, that is a result too. Write it down, then repeat with issue #9, which has an open spec question.

**Done when:** `audit.md` has the correction log, the stash or branch name of the saved attempt, the better prompt, both results with real test output, and one sentence on what the rewind changed.
:::

## Sources

Checked on 2026-10-20 unless an item says otherwise. Every shell block with output shown was run on 2026-10-20 on macOS (Apple Silicon) in zsh 5.9, with git 2.55.0, ripgrep, Python 3.13.9 and pytest 9.1.1. `agy`, Claude Code and Gemini CLI commands were checked against their docs on 2026-10-20, not run. Step 4 of the headless run was not run. Agent messages, plans, attempts and milestone commits were written for this guide to simulate an agent.

- Google DeepMind, Research Engineer, Polaris (job posting; checked 2026-10-19) ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19")
- Anthropic, Best practices for Claude Code (the two-failed-corrections rule, plan mode, `/rewind` and checkpoint limits, spec advice, rule-file length) ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20")
- Anthropic, Run Claude Code programmatically (`claude -p` exit codes; failures printed as the result) ^[confirmed](https://code.claude.com/docs/en/headless "2026-10-20")
- Anthropic, Agent SDK TypeScript reference (`SDKResultMessage`: `subtype`, `is_error`) ^[confirmed](https://code.claude.com/docs/en/agent-sdk/typescript "2026-10-20")
- Antigravity CLI, headless mode (`-p`, flags, JSON fields, `status` values, the `error` example, soft-deny, `permissions.allow`, `stream-json` events, CI example) ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20")
- Antigravity CLI, execution modes (`--mode=plan`, Shift+Tab cycle, when to use plan mode, `run_command`) ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20")
- Antigravity, terminal sandbox, CLI tab (`enableTerminalSandbox`, `--sandbox`, no network by default, writes allowed to the workspace, temporary directories and build caches) ^[confirmed](https://antigravity.google/docs/sandbox?tab=cli "2026-10-20")
- Antigravity CLI, features (`/rewind`, alias `/undo`) ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20")
- Antigravity CLI, best practices (verification loops, `toolPermission` levels, `enableTerminalSandbox`) ^[confirmed](https://antigravity.google/docs/cli/best-practices "2026-10-20")
- Antigravity CLI, migration guide (`GEMINI.md` and `AGENTS.md`) ^[confirmed](https://antigravity.google/docs/cli/gcli-migration "2026-10-20")
- Antigravity agent teams (milestones approved after review roles) ^[confirmed](https://antigravity.google/docs/teamwork/ "2026-10-20")
- Gemini CLI, plan mode ^[confirmed](https://geminicli.com/docs/cli/plan-mode/ "2026-10-20")
- Gemini CLI, headless mode (exit codes 0, 1, 42, 53; JSON keys) ^[confirmed](https://geminicli.com/docs/cli/headless/ "2026-10-20")
- Gemini API, Antigravity agent / Managed Agents (`incomplete` status at the token cap) ^[confirmed](https://ai.google.dev/gemini-api/docs/antigravity-agent "2026-10-20")
- Google Developers Blog, Conductor now supports Antigravity (`spec.md`, `plan.md`), 2026-07-16 ^[confirmed](https://developers.googleblog.com/evolving-spec-driven-development-conductor-now-supports-antigravity/ "2026-10-20")
- Conductor README (file locations, token-use warning) ^[confirmed](https://github.com/gemini-cli-extensions/conductor "2026-10-20")
- pytest, exit codes 0 to 6 ^[confirmed](https://docs.pytest.org/en/stable/reference/exit-codes.html "2026-10-20")
- pytest, how to invoke pytest (`python -m pytest` adds the current directory to `sys.path`) ^[confirmed](https://docs.pytest.org/en/stable/how-to/usage.html "2026-10-20")
- Semantic Versioning 2.0.0 (no leading zeroes; build metadata ignored for precedence) ^[confirmed](https://semver.org/ "2026-10-20")
- Terminal-Bench 2.0 paper (failure taxonomy, contributor checklist) ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20")
- Weco AI, SpecBench (30 systems programming tasks; visible vs held-out gap grows with code size) ^[confirmed](https://arxiv.org/abs/2605.21384 "2026-10-20")
- Scale AI, SWE-Bench Pro (requirements and interface ablation, public set, 50 turns and $2 per run) ^[confirmed](https://arxiv.org/html/2509.16941 "2026-10-20")
- Datacurve, DeepSWE (behavior-only prompts) ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20")
- Jimenez et al., SWE-bench (FAIL_TO_PASS grading), ICLR 2024 ^[confirmed](https://arxiv.org/abs/2310.06770 "2026-10-20")
- Mündler et al., SWT-Bench, NeurIPS 2024 ^[confirmed](https://arxiv.org/abs/2406.12952 "2026-10-20")
- Anthropic, Demystifying evals for AI agents, 2026-01-09 ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20")
- Wang, Pradel, Liu, PatchDiff, ICSE 2026 ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20")
- Zhong, Raghunathan, Carlini, ImpossibleBench, ICLR 2026 (Conflicting-SWEbench split; cheating classified by an LLM) ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20")
- Anthropic, Claude 3.7 Sonnet System Card, section 6 ^[confirmed](https://www.anthropic.com/claude-3-7-sonnet-system-card "2026-10-20")
- Ehsani et al., "Where Do AI Coding Agents Fail?", 33k agent PRs, 2026-01-21 ^[confirmed](https://arxiv.org/abs/2601.15195 "2026-10-20")
- Ludwig, Ahmad, Majumdar, Ginsburg, "Shortcutting the Fix", 2026 ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20")
- Transluce, "Measuring coding agent misalignment in the wild", 2026-08-05 (LLM-judged rates, one public dataset) ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20")
- Liu et al., "An Empirical Study on Failures in Automated Issue Solving" (iterative-verification failures; random sample of 150 failed SWE-bench Verified issues) ^[confirmed](https://arxiv.org/html/2509.13941 "2026-10-20")

:::check
- Write a 3-bullet spec for a new issue in under 5 minutes, with examples in both directions and a done-when command.
- Turn a spec into a test that is red for the right reason, and say which exit code and failure message prove it.
- Review an agent plan against the six checks and write a rejection in 5 lines.
- Name three enforced guardrails and say why a rule the agent can edit is only a request.
- State the rewind rule, its source, and the four steps of the rewind protocol, including how the code goes back in your tool.
- Explain why a headless run with exit 0, or even `status` `SUCCESS`, is not yet a successful attempt, and run your status checker on five sample files.
:::
