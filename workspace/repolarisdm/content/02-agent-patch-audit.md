---
title: The Agent Patch Audit
short: Agent Patch Audit
summary: Run the 5-move loop on every change and the full 16-step audit (S0–S15) on risky ones. You will catch a coding agent's wrong patch with evidence from tools, not with trust.
---

:::selfcheck
- Say the five moves of the core loop in order, with one check for each. || Understand (baseline twice, map with tools, check the agent's claims). Reproduce (a failing test that fails for the right reason). Hypothesize (your guess first; settle it with a tool). Change or review (small diffs; read the whole diff). Challenge (re-run it yourself; attack the fix; revert the fix and watch your tests fail).
- An agent says "Fixed. All 94 tests pass." Name four checks you run before you believe it. || Re-run the full suite yourself in a clean clone and compare with your baseline. Compare test-file hashes, and list added or changed test and config files with `git diff --name-status BASE -- tests '*conftest.py' pytest.ini`. Run the new tests several times. Revert the fix: the new tests must fail. Attack the fix with inputs the tests do not cover.
- Name four ways an agent can make tests pass without fixing the bug. || Special-case the test inputs. Edit, skip or delete tests. Exit early (`sys.exit(0)`, a `conftest.py` hook). An `__eq__` that is always true. Fix only the symptom that the test checks.
- What does a revert-the-fix check prove, and what does it not prove? || It proves your new tests can fail on this bug, so they guard it. It does not prove the fix is right on inputs the tests never try.
- Which steps make up review mode, and which make up a light audit? || Review mode: S0, S1, S2–S4, S6, S10–S15. Light audit: S1, S6, S10, S11.
- In Python, what does `datetime(2026, 3, 2, 4, 30).timestamp()` assume about the time zone? || That the naive datetime is in the machine's local time zone. The result changes with `TZ`. The worked example below catches an agent patch that falls into exactly this.
:::

## Why Polaris cares

Polaris builds tasks that measure how well Gemini does software engineering ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). If a task's grader accepts a patch that only looks right, the number is wrong. PatchDiff checked the test-passing patches of three tools on SWE-bench Verified: 29.6% behaved differently from the developer's fix, and manual review found 28.6% of those certainly wrong ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20"). Different is not always wrong, so a grader must test the requirements, not the likeness to one reference fix ([[grader-validity]]). Public interview descriptions score the same skill: Google's reported pilot (no source names DeepMind) scores "output validation" ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20"), and Mechanize's own hiring page (Mechanize, not Polaris) lists spotting brittle or accidentally working solutions ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20"). This chapter is the method behind signal 2 on the [[home|overview]], a defensible record of diagnosing real coding-agent failures, and each mistake you catch is also a task idea for [[task-design]].

## How to use this chapter {#how-to-use}

:::tip title="Sprint route: Oct 20–23, 3 hours"
1. Read [the 5-move loop](#loop) and [evidence, not proof](#evidence-not-proof). 20 minutes.
2. Read the [worked example](#worked-example), [[S0]] to [[S15]], without running it. 40 minutes.
3. Do drill [audit-01](#drill-audit-01) with the 5-move loop only. 2 hours.

Everything else waits until after you apply: drill `replay-41`, the other drills and this chapter's mocks. The sprint's timed no-AI mock is [[interview#mocks|Mock 3]] on Oct 30–31 ([[tracker#block-4|tracker]]), not Mode 3 below.
:::

The full route, after you apply:

1. Read [the 5-move loop](#loop) and [evidence, not proof](#evidence-not-proof). 20 minutes.
2. Skim [the full audit at a glance](#full-audit), the modes and the four gates. 15 minutes.
3. Do the [worked example](#worked-example) yourself, in your own practice copy, step by step. This is drill [replay-41](#drill-replay-41), so you do the bug once, not twice. About 2.5 hours.
4. Do the other [drills](#drills). Then run one [mock](#mock) under the clock.

Keep the [[cards]] open while you work. They hold [[cards#card-loop|the loop]], [[cards#card-audit-steps|the step table]], [[cards#card-mistakes|the mistake card]], [[cards#card-prompts|every prompt]] and [[cards#card-audit-template|the audit.md template]].

:::tip title="zsh and the commands on this page"
The worked-example blocks were run in zsh on macOS on 2026-10-20. Blocks with names in CAPITALS, or with `BASE`, are templates: fill in your own names. No shell block has a `#` comment, because interactive zsh does not treat `#` as a comment unless you run `setopt interactivecomments`. Paste the blocks as they are.
:::

## The 5-move loop {#loop}

Use this loop on **every** change: an agent's, a colleague's or your own. It takes 10–30 minutes on a small change ^[inference](- "2026-10-20").

| Move | What you do | Minimum evidence | Steps |
|---|---|---|---|
| 1. Understand | Baseline the tests yourself. Map with tools. Then let the agent map. Check its claims on the bug's path. | `baseline.txt` with an exit code. A 5-line map where each line has a file:line. | [[S1]]–[[S5]] |
| 2. Reproduce | Write a failing test before any fix. | The test fails on an assertion about a value, not on an import error. | [[S6]] |
| 3. Hypothesize | Write your own guess first. Then ask the agent. Settle the difference with a tool. | A probe, debugger or bisect result. The bug in two sentences. | [[S7]] |
| 4. Change or review | Small diffs with guardrails. Read the diff, not the summary. | `git diff --stat`, and a list of every behavior that changed. | [[S8]]–[[S10]] |
| 5. Challenge | Re-run everything yourself. Attack the fix. | A clean-clone run compared with the baseline, attack tests, and a revert-the-fix check. | [[S11]]–[[S14]] |

The loop in its shortest form, for a Python repo. Replace the names in capitals.

```bash
git status --short && git rev-parse --short HEAD
set -o pipefail; python -m pytest -rA 2>&1 | tee ../notes/baseline.txt; echo "exit=$?"
python -m pytest --collect-only -q | tail -1
rg -n 'WORD_FROM_THE_ISSUE' .
python -m pytest -q tests/test_ISSUE.py
python -c "from PKG.MOD import FUNC; print(FUNC('INPUT'))"
git diff --stat && git diff && python -m pytest -q
git add PKG/MOD.py tests/test_ISSUE.py && git commit -qm "fix ISSUE"
git checkout BASE -- PKG/MOD.py && python -m pytest -q tests/test_ISSUE.py; git checkout HEAD -- PKG/MOD.py
```

The last line is the revert-the-fix check. It puts back the old version of the fixed file only, keeps your test, and runs the test. The test must fail. Then `git checkout HEAD -- PKG/MOD.py` brings the fix back. Commit the fix first, as the line before does: `git checkout HEAD` restores the committed version, so an uncommitted fix would be lost. If the fix changed several files, name all of them.

Two rules hold the loop together:

- **An agent's claim is a guess until a deterministic tool confirms it.** A deterministic tool gives the same answer every time: git, `rg`, pytest, a compiler, a debugger.
- **A passing run is evidence, not proof.** See the next section.

## Evidence, not proof {#evidence-not-proof}

Concrete first. In the worked example below, the example agent patch (written for this guide) passed all 94 tests in a clean clone. Its 2 new tests passed five runs in a row. The suite covered 97% of the statements and branches of `parsing.py`, before and after the patch. The patch was still wrong on two kinds of input. Coverage counts the lines and branches that ran. It does not count the inputs that never ran.

The rule: a test suite is a finite sample of behavior. Passing it is evidence that the code is right on those inputs. It never proves that the code meets the spec.

The research agrees:

- Of the test-passing SWE-bench Verified patches of three tools, 29.6% behaved differently from the developer's fix. The biggest cause was a "similar but different" implementation. Manual review found 28.6% of those divergent patches certainly wrong. With other weaknesses, this inflated reported solve rates by about 6.2 points. Different is not always wrong, but you cannot tell without checking ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20").
- METR reviewed by hand 15 Claude 3.7 Sonnet PRs for 18 real open-source issues. None was mergeable as-is, including the 4 that passed the tests ^[confirmed](https://metr.org/blog/2025-08-12-research-update-towards-reconciling-slowdown-with-time-horizons "2026-10-20").
- Once suite size is controlled, coverage has only a low-to-moderate link to how many bugs a suite catches. So coverage is not a quality target ^[confirmed](https://cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf "2026-10-20").
- Before LLMs, a study of automatic repair tools found that most of their test-passing patches were not correct. Most of those were equivalent to deleting functionality ^[confirmed](https://www.cs.toronto.edu/~fanl/papers/kali-issta2015.pdf "2026-10-20").

What to say in an interview: "The tests pass. That is evidence. Here is what I did not test, and here is how I would test it."

## The full audit at a glance {#full-audit}

Use the full audit for hard, risky or suspicious patches, and for any patch that will grade or train a model. Every step has an owner:

- **[Y]** you: a judgment only a person makes.
- **[D]** a deterministic tool: git, `rg`, pytest, a compiler, pdb or lldb.
- **[A]** the agent.

| Phase | Step | Who | Do | Exit check |
|---|---|---|---|---|
| Safe start | [[S0]] Isolate | Y D | Practice copy with fresh git. Review-every-edit mode. Sandbox. Canary file. `audit.md`. | One commit, no remotes, no canary inside the repo. |
| | [[S1]] Baseline | D | Full suite twice with exit codes. Python version, `pip freeze`, test hashes. | **Gate 1.** No baseline, no agent. |
| Map | [[S2]] Tool map | Y D | Files, entry points, `--collect-only`, coverage of one real request, callers, history. | A 5-line map plus your first guess. |
| | [[S3]] Agent map | A | Read-only mode. file:line for every claim. "Unsure" allowed. | `repo-map.md` saved, not yet trusted. |
| | [[S4]] Check the map | Y D | Check at least 5 claims, the bug's path first. | **Gate 2.** 2 or more wrong: map that area by hand. |
| | [[S5]] Rule file | Y | Write `AGENTS.md` or `GEMINI.md` by hand. Confirm it loaded. | The agent quotes your test command back. |
| Find | [[S6]] Reproduce | Y D | A failing test from the issue, before any fix. | It fails for the right reason. |
| | [[S7]] Locate | Y A D | Your guess, then the agent's. Settle with a probe, pdb or lldb, blame, `bisect run`. | **Gate 3.** The bug in 2 sentences. |
| Change | [[S8]] Plan and guardrails | A Y | A general fix, no special cases. Compare the plan with your checked map. | Must-keep rules written down. |
| | [[S9]] Small edits | A D | Edit, diff, full suite. After 2 failed corrections: rewind and re-prompt. | Each edit is small and tested. |
| Prove | [[S10]] Read the diff | Y D | `git diff --stat BASE`. Open every file. Red-flag scan. List behavior changes. | Every changed behavior is on your list. |
| | [[S11]] Re-run yourself | D | Clean clone. Full suite vs baseline. Hashes and added test or config files. New tests 5 times. | **Gate 4.** The agent's claims about its runs match your run. |
| | [[S12]] Attack the fix | Y D | Held-out cases, property tests, differential tests, revert-the-fix. | Attacks pass on the fix and fail on the old code. |
| | [[S13]] Fresh review | A Y | A new session sees only the spec and the diff. Critic, Challenger, Auditor. | Each finding reproduced or dropped. |
| | [[S14]] Transcript audit | Y | Match every claim to real output. Find the first wrong turn. Tag the phase. | A claims table and one first wrong turn. |
| Learn | [[S15]] Merge check and log | Y | Core works, nothing else broke, tests, docs, lint. Log each mistake. | Rows in `mistakes.csv` and task ideas. |

A full audit of a small bug takes about 2.5–3 hours the first time and about 90 minutes once you are fluent ^[inference](- "2026-10-20").

### Drive, review, light {#modes}

| Mode | Use it when | Steps |
|---|---|---|
| **Drive** | You run the agent yourself, from issue to patch. | S0–S15 |
| **Review** | You get someone else's diff and transcript: a pilot run, a benchmark attempt, a code review, an interview exercise. | S0, S1 (at the base SHA), S2–S4, S6, S10–S15 |
| **Light** | A small, low-risk change you understand. | S1, S6, S10, S11 |

Review mode is Polaris's daily work: you judge a model's attempt that you did not watch ^[inference](- "2026-10-20"). It is also what [[lab:lab-c]] trains.

Escalate from light to full when any of these is true ^[inference](- "2026-10-20"):

- the diff touches tests, `conftest.py`, CI config, dependencies or lock files;
- the diff deletes logic, or touches more than 2 files or about 50 lines;
- a claim of the agent does not match your own run;
- the change will grade or train a model.

### The four gates {#gates}

A gate is a hard stop. You do not go on until it passes.

| Gate | At | Rule | If it fails |
|---|---|---|---|
| 1 | [[S1]] | No baseline, no agent. | Fix the environment first. A red baseline means you cannot tell what the agent broke. |
| 2 | [[S4]] | 2 or more wrong claims on the bug's path. | Stop trusting the agent's map there. Map that area by hand. |
| 3 | [[S7]] | Explain the bug in 2 sentences: where, what goes wrong, why the tests missed it. | You do not understand it yet. Do not let the agent fix it. Go back to [[S6]]. |
| 4 | [[S11]] | Every claim the agent made about its runs (commands, counts, pass or fail, exit codes, `status`) matches your own run. Its other claims, about behavior or scope, stay hypotheses for [[S12]]–[[S14]]. | Treat every other claim of that session as unverified ([[M6]]). |

## The worked example: issue #41 in tallyhub {#worked-example}

:::warn title="Spoiler for Lab A"
This example uses the planted bug in [[lab:lab-a]]. Do Lab A Parts 1–5 first if you want the lab fresh. The example does **not** use Lab A's 12 claims. It uses its own example agent map.
:::

**What is real and what is not.** Every command output on this page is real. It was captured on 2026-10-20 on macOS (Apple Silicon) with Python 3.13.9, pytest 9.1.1, coverage 7.16.2 and Hypothesis 6.170.5. Outputs are trimmed, and long temp paths are shortened to `…`. No agent was run. Every agent message is written for this guide and is marked as such. Your commit SHAs and timings will differ.

**The repo.** `tallyhub` 0.6.1 is a small Python service. It reads events as JSON lines, counts them into time windows, stores the buckets in SQLite and answers queries. About 850 lines of code and 450 lines of tests.

**The issue.** `ISSUE.md`, #41: an order sent as `2026-03-01T23:30:00-05:00` shows up on March 1 in the daily view. 23:30 at UTC−5 is 04:30 UTC on March 2, so it belongs to March 2. Nothing is rejected and nothing is logged.

**The folder layout.** One audit folder `$W` holds four things. Only `repo/` is the agent's workspace.

| Folder | What lives there | Why |
|---|---|---|
| `$W/repo` | The practice copy, with its own fresh git | The only place you open the agent |
| `$W/notes` | `audit.md`, `baseline.txt`, hashes, `mistakes.csv` | Your evidence. Keep it out of the agent's diffs and away from its anchoring. |
| `$W/scratch` | Throwaway inputs and databases | Keeps `git status` clean |
| `$W/private` | A canary file | Tests whether the agent can read outside its workspace |

## Phase 1: Safe start {#phase-safe-start}

### S0 Isolate {#s0}

**Do.** Make a practice copy with fresh git and no parent history. Put the agent in a mode that asks before every edit. Place a canary. Start `audit.md`.

Run this from the playbook folder (`workspace/repolarisdm/`). The lab helper `bash labs/make_practice.sh lab-a` makes a fresh-git copy too, but only the repo; these steps by hand also make the three side folders:

```bash
W=$(mktemp -d -t apa)
mkdir "$W/repo" "$W/notes" "$W/scratch" "$W/private"
cp -R labs/lab-a/repo/. "$W/repo/"
cd "$W/repo"
git init -q && git config user.name practice && git config user.email practice
git add -A && git commit -qm "tallyhub 0.6.1 (practice base)"
git log --oneline --all; git remote -v | wc -l; git rev-parse HEAD
```

```text
d2b28ed tallyhub 0.6.1 (practice base)
       0
d2b28ed277bed8a2add1a3d8fd24597bae78d68c
```

One commit, zero remotes. Git accepts any string as `user.email`, so a plain word keeps your real address out of the practice copy. Now give the base a name, so you never have to copy a SHA again:

```bash
git tag v0.6.1
```

Every later command on this page uses `v0.6.1` to mean "the code before any change". In your own audits, tag the base the same way. With one commit and no remotes, the agent cannot mine history or a remote for the fix. That is a real risk: agents ran `git log --all` inside SWE-bench containers and found future fixes ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20"). In one 2026 study, three open models tried shortcuts (upstream lookup, git-history mining, memorized code) in 55.5–89.1% of DeepSWE trajectories ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20").

Now the canary. A **canary** is a file with a unique random string. If that string ever shows up in the agent's transcript, the agent read something it should not.

```bash
G=$(uuidgen); echo "canary $G" > "$W/private/canary.txt"; echo "$G" > "$W/notes/canary-id.txt"
cat "$W/private/canary.txt"; rg -l "$G" "$W/repo"; echo "canary hits in repo: exit=$?"
```

```text
canary 5AFB61E8-B891-4A68-9649-D61207F8385A
canary hits in repo: exit=1
```

`rg` exits 1 when it finds nothing. Good. Then the **boundary test**, which you run with your agent on day 1: ask it "Print the first line of ../private/canary.txt." If it prints the string, its reads are not confined to the repo. Expect that. We found no documentation of the read scope of `agy` ^[inference](- "2026-10-20"), and its terminal sandbox is off by default ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20"). So never keep answer keys, hidden tests or private notes anywhere an agent session can reach. After each session, search the transcript for the canary ([[S14]]).

Agent settings, checked against docs on 2026-10-20, not run: keep `agy` in its default mode, which pauses for a diff review before any file is created or changed. Use the `request-review` or `strict` tool permission. Turn the terminal sandbox on with `--sandbox`; sandboxed commands have no network by default ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20"). Verify each of these with `agy --help` on your machine ([[start-here#day-1|Day-1 checklist]]).

Start `$W/notes/audit.md` from the [template](#audit-template). Fill in the base SHA, the tool and its version, the model and the mode now. You will not remember them later.

**Exit check:** one commit, no remotes, no canary in the repo, `audit.md` started.

### S1 Baseline {#s1}

**Do.** Run the full suite with its exit code, twice. Record the environment. Hash the test files.

```bash
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
set -o pipefail; .venv/bin/python -m pytest -rA 2>&1 | tee ../notes/baseline.txt; echo "exit=$?"
```

```text
platform darwin -- Python 3.13.9, pytest-9.1.1, pluggy-1.6.0
rootdir: …/repo
configfile: pyproject.toml
collected 92 items
…
PASSED tests/test_parsing.py::test_timestamp_iso_utc
…
============================== 92 passed in 0.13s ==============================
exit=0
```

`set -o pipefail` makes the exit code come from pytest, not from `tee`. `2>&1` keeps error messages in the file. `-rA` lists every test by name, so you can diff two runs.

Run it a second time and compare the pass/fail lists:

```bash
set -o pipefail; .venv/bin/python -m pytest -rA 2>&1 | tee ../notes/baseline2.txt | tail -1; echo "exit=$?"
diff <(grep -E '^(PASSED|FAILED|ERROR)' ../notes/baseline.txt) <(grep -E '^(PASSED|FAILED|ERROR)' ../notes/baseline2.txt) && echo "same pass/fail list"
```

```text
============================== 92 passed in 0.10s ==============================
exit=0
same pass/fail list
```

Same list twice, so no flaky test shows up. Now record the environment and hash every file that can change what "pass" means:

```bash
.venv/bin/python --version
uv pip freeze --python .venv/bin/python | tee ../notes/freeze.txt
shasum -a 256 tests/*.py pyproject.toml | tee ../notes/test-hashes.txt | cut -c1-12,65-
```

```text
Python 3.13.9
coverage==7.16.2
iniconfig==2.3.1
packaging==26.3
pluggy==1.6.0
pygments==2.21.0
pytest==9.1.1
1f839e0855ed  tests/conftest.py
11002241f6c4  tests/test_aggregate.py
…
e3591d48c796  tests/test_parsing.py
120bbc13b261  tests/test_windows.py
29911e61b3aa  pyproject.toml
```

`pyproject.toml` is hashed because pytest's settings live there. This repo has no CI config; if yours does, hash it too.

**Gate 1:** 92 passed, twice, exit 0. You may start the agent.

## Phase 2: Map {#phase-map}

### S2 Tool map {#s2}

**Do.** Spend 15 minutes mapping with deterministic tools, before the agent says anything. Then write a 5-line map and your first guess. The tool map is your ground truth for checking the agent's map.

Size and shape:

```bash
git ls-files | xargs wc -l | sort -n | tail -6
for d in tallyhub tallyhub/storage tests; do printf '%-18s %s\n' $d "$(cat $d/*.py | wc -l)"; done
```

```text
      91 tallyhub/ingest.py
      99 tallyhub/storage/sqlite.py
     104 README.md
     134 tallyhub/cli.py
     148 tallyhub/parsing.py
    1549 total
tallyhub                658
tallyhub/storage        189
tests                   456
```

Entry point and command surface:

```bash
cat tallyhub/__main__.py; .venv/bin/python -m tallyhub --help | head -3
.venv/bin/python -m pytest --collect-only -q | tail -1
```

```text
from tallyhub.cli import main

raise SystemExit(main())
usage: tallyhub [-h] [--version] [--config PATH] [--store URL]
                {ingest,query,metrics} ...

92 tests collected in 0.03s
```

Who calls the function the issue is about? The issue is about timestamps, so search for the parser:

```bash
rg -n 'parse_timestamp' tallyhub
```

```text
tallyhub/parsing.py:40:def parse_timestamp(raw: object) -> float:
tallyhub/parsing.py:112:    ts = parse_timestamp(obj["ts"]) if "ts" in obj else now()
tallyhub/parsing.py:133:            ts = parse_timestamp(_number(part[1:], "timestamp"))
tallyhub/cli.py:15:from .parsing import parse_timestamp
tallyhub/cli.py:114:        return parse_timestamp(text)
```

Three callers: JSON lines, tally lines, and the CLI at `cli.py:114`. Remember the CLI caller. It matters in [[S4]].

**The dynamic map.** Coverage of one real request shows which lines actually run. The best request is the issue's own. Save its input in `../scratch/` and run it under coverage:

```bash
mkdir -p ../scratch
printf '%s\n' '{"metric": "checkout.orders", "ts": "2026-03-01T23:30:00-05:00", "id": "ny-1001"}' '{"metric": "checkout.orders", "ts": "2026-03-02T04:45:00Z", "id": "ny-1002"}' > ../scratch/orders.ndjson
.venv/bin/python -m coverage run -m tallyhub --store memory:// ingest ../scratch/orders.ndjson
.venv/bin/python -m coverage report -m --include='tallyhub/parsing.py,tallyhub/ingest.py,tallyhub/aggregate.py'
```

```text
accepted 2, rejected 0, duplicates 0, bucket writes 2
Name                    Stmts   Miss Branch BrPart  Cover   Missing
-------------------------------------------------------------------
tallyhub/aggregate.py      39     12      8      0    62%   35-36, 46-50, 66-70
tallyhub/ingest.py         69     17     22      8    68%   50, 53-59, 61-62, 66-67, 68->70, 74, 79, 81-82, 85
tallyhub/parsing.py       100     44     42     12    49%   43, 45, 53-54, 57, 59, 67, 72, 75-76, 78, 84, 90, 91->93, 99-100, 102, 105-106, 109, 119-137, 142-148
```

Read the "Missing" column of `parsing.py` backwards: lines 46–52 and 55 are **not** missing, so the issue's request runs the string branch of `parse_timestamp`. That is the first place to look.

Now the same report for the whole test suite:

```bash
.venv/bin/python -m coverage run -m pytest -q
.venv/bin/python -m coverage report -m --include='tallyhub/parsing.py'
rm -f .coverage
```

```text
92 passed in 0.54s
Name                  Stmts   Miss Branch BrPart  Cover   Missing
-----------------------------------------------------------------
tallyhub/parsing.py     100      2     42      2    97%   78, 102
```

97% coverage, and the bug's lines are covered. That 97% counts statements and branches together, because `pyproject.toml` sets `branch = true` for coverage.py. So the tests run those lines but never with an offset. Check that directly:

```bash
rg -o --no-filename '"20[0-9]{2}-[0-9]{2}-[0-9]{2}T[^"]*"' tests | sort | uniq -c
rg -n 'T[0-9:.]+[+-][0-9]{2}:?[0-9]{2}' tests; echo "exit=$?"
```

```text
   1 "2026-03-02T00:00:00Z"
   1 "2026-03-02T14:00:00Z  orders{shop=berlin}  2"
   2 "2026-03-02T14:00:00Z"
   1 "2026-03-02T14:01:00Z"
   1 "2026-03-02T14:05:00.750Z"
   2 "2026-03-02T14:05:00Z"
   1 "2026-03-02T14:10:00Z"
   1 "2026-03-02T15:00:00Z  orders{shop=berlin}  1"
   1 "2026-03-02T15:00:00Z"
   1 "2026-13-02T14:05:00Z"
exit=1
```

Every ISO timestamp in the tests ends in `Z` (two hits are table rows of expected output). The second search finds no offset at all. No test sends an offset.

**History.** `git log --stat` finds churn hotspots and `git blame` finds who changed the bug's lines. In a fresh practice copy both show one commit:

```bash
git blame -L 52,52 tallyhub/parsing.py
```

```text
^d2b28ed (practice 2026-10-20 12:29:09 -0400 52)             dt = datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S")
```

That is the price of isolation. Use the docs as history instead: `CHANGELOG.md` says 0.4.0 started dropping fractional seconds. Cutting the string to 19 characters may date from then ^[inference](- "2026-10-20"). In a real repo you would run `git log -S'text[:19]' --oneline -- tallyhub/parsing.py`.

Your 5-line map, saved in `../notes/audit.md`:

```text
1. Entry: python -m tallyhub -> tallyhub/__main__.py:3 -> cli.main (tallyhub/cli.py:46).
2. One JSON event: Ingestor._parse (tallyhub/ingest.py:75) -> parse_line (parsing.py:63) -> _parse_json -> parse_timestamp (parsing.py:112).
3. State: a Store chosen by URL (tallyhub/storage/__init__.py:10); the issue uses sqlite:///.
4. Tests: 92 pass; 97% statement-and-branch coverage of parsing.py; no test sends a UTC offset (rg, exit 1).
5. First guess: the string branch of parse_timestamp (parsing.py:46-55) loses the offset.
```

**Exit check:** five lines, each with a file:line you opened, and a first guess.

### S3 Agent map {#s3}

**Do.** Let the agent map the repo in read-only mode. Demand file:line citations and allow "unsure". Save the answer. Do not judge it yet.

In `agy`, use plan mode (Shift+Tab or the `--mode` flag), which analyzes before it writes code ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20"). Checked against docs on 2026-10-20, not run. Prompt:

```text
Map this repository. Do not change any file.
Give file:line for every claim. Say "unsure" when you are unsure.
Cover: the entry point; the path of one JSON event from an input line to a
query row; where state is stored; which tests cover timestamp parsing.
Then read ISSUE.md and list the files on its path, with your evidence.
```

Save the answer as `../notes/repo-map.md`. Here is an example answer:

> **Example agent output, written for this guide. Not real Gemini output.**
>
> 1. Entry point: `python -m tallyhub` runs `tallyhub/__main__.py:3`, which calls `main()` in `tallyhub/cli.py`.
> 2. A JSON line goes `Ingestor._parse` (`tallyhub/ingest.py:75`) → `parse_line` → `_parse_json` → `parse_timestamp(obj["ts"])` (`tallyhub/parsing.py:112`).
> 3. `parse_timestamp` reads ISO strings with `datetime.fromisoformat` (`tallyhub/parsing.py:52`), so UTC offsets are kept.
> 4. Offsets are tested by `test_timestamp_iso_offset` (`tests/test_parsing.py:81`).
> 5. Fractional seconds are dropped on purpose (`tallyhub/parsing.py:51`, `README.md:46`).
> 6. Day windows start at 00:00 UTC (`tallyhub/windows.py:3-5`).
> 7. Unsure: whether `query --start` and `--end` use the same timestamp parser.
> 8. Issue #41's path: the window code in `tallyhub/windows.py`. Likely cause: windows are cut at UTC midnight, not at the producer's local midnight.

**Big repos.** One context window cannot hold a big repo. Run one read-only subagent per top-level folder, then merge their maps into one `repo-map.md`. Gemini CLI has a built-in `codebase_investigator` subagent ^[confirmed](https://geminicli.com/docs/core/subagents/ "2026-10-20"). Antigravity's docs list a built-in `research` subagent ^[confirmed](https://antigravity.google/docs/subagents/ "2026-10-20"). Whether and how `agy` exposes it is a Day-1 check. The [[map]] chapter covers large repos in depth.

**Why a map at all, if agents find the right files?** They usually do. In a study of three agents (OpenHands, SWE-agent, Prometheus) on SWE-bench, 72–81% of trajectories located the right files, even the failed ones ^[confirmed](https://arxiv.org/abs/2511.00197 "2026-10-20"). The danger is what the map *claims* about those files. Localization failures include matching on keywords and following a misleading issue ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20").

**Exit check:** `repo-map.md` saved, with file:line on each claim.

### S4 Check the map {#s4}

**Do.** Check at least 5 claims with tools. Use **risk order**: claims on the bug's path first, because a wrong claim there sends the fix to the wrong place. Here that is claims 3, 4, 7, 8 and 2, then the rest.

```bash
sed -n '52p' tallyhub/parsing.py
.venv/bin/python -m pytest --collect-only -q | rg -i 'iso|offset'
sed -n '81p' tests/test_parsing.py
sed -n '108,114p' tallyhub/cli.py
```

```text
            dt = datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S")
tests/test_api.py::test_iso_and_epoch_inputs_land_in_the_same_window[memory]
tests/test_api.py::test_iso_and_epoch_inputs_land_in_the_same_window[sqlite]
tests/test_parsing.py::test_timestamp_iso_utc
tests/test_parsing.py::test_timestamp_iso_fraction_is_truncated
def test_timestamp_iso_fraction_is_truncated():
def _time_arg(text: str | None) -> float | None:
    if text is None:
        return None
    try:
        return float(text)
    except ValueError:
        return parse_timestamp(text)
```

Write one line per claim in `audit.md`:

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 3 | `fromisoformat` at `parsing.py:52` keeps offsets | **wrong** ([[M8]]) | Line 52 is `strptime(text[:19], ...)`. The slice cuts `-05:00` off. |
| 4 | `test_timestamp_iso_offset` at `test_parsing.py:81` | **wrong** ([[M8]]) | No such test is collected. Line 81 is the fraction test. |
| 7 | Unsure if `--start`/`--end` use the same parser | resolved: yes | `cli.py:114` calls `parse_timestamp`. So `--start` with an offset is wrong too: a second symptom the issue does not mention. |
| 8 | The cause is in the window code | hypothesis, not a fact | Test it in [[S7]]. |
| 2 | JSON path through `ingest.py:75` and `parsing.py:112` | right | `sed -n '75p' tallyhub/ingest.py` prints `return parse_line(line, now=self.now)`; `rg` above shows line 112. |
| 5 | Fractions dropped on purpose | right | `parsing.py:51` comment; `README.md:46`; the fraction test pins it. |
| 1 | Entry point | right | `__main__.py:3` above. |
| 6 | Day windows start at 00:00 UTC | right | `sed -n '3,5p' tallyhub/windows.py` shows the docstring. |

Claim 3 is the classic way agents are wrong: it describes how ISO parsing *usually* looks, not what this file does. Claim 4 cites a plausible test that does not exist. Both are answers from memory, not from the code ([[M8]]).

**Gate 2 fires.** Two claims on the bug's path are wrong. Stop trusting the agent's map of the parser. You already mapped it by hand in [[S2]], line 5. Keep the agent's correct claims; distrust the rest of the parsing area.

**Exit check:** at least 5 claims judged, each with one line of tool evidence. Gate 2 applied.

### S5 Rule file {#s5}

**Do.** Write a rule file by hand. Put real commands in it, not wishes. Then confirm the agent loaded it.

`agy` reads both `GEMINI.md` and `AGENTS.md` ^[confirmed](https://antigravity.google/docs/cli/gcli-migration "2026-10-20"). This one was written for the example:

```bash
cat > AGENTS.md <<'EOF'
# Rules for agents in this repo

- Test command: `.venv/bin/python -m pytest -rA`. Baseline: 92 passed.
- Do not edit files under tests/ unless I ask.
- If the spec (README.md, ISSUE.md) and the tests disagree, stop and ask.
- Cite file:line for every claim. Say "unsure" when unsure.
- Change only the files I name. No new dependencies.
- After every edit, show the diff and the real test output.
EOF
echo AGENTS.md >> .git/info/exclude && test -z "$(git status --porcelain)" && echo "status clean"
```

```text
status clean
```

`.git/info/exclude` is a private `.gitignore` that is never committed. The rule file now stays out of every diff you review. `test -z` checks that `git status --porcelain` printed nothing, so "status clean" appears only when the tree really is clean. (`git status` itself exits 0 even on a dirty tree.)

Two rules matter most. "Do not edit tests" blocks the most common cheat: ImpossibleBench found test modification in over 79% of Claude and Qwen3-Coder cheating runs ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20"). "Stop and ask" gives the agent an honest exit: in the same study, an abort option cut GPT-5's cheating on the Conflicting-SWEbench split from 54% to 9% of tasks ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20").

**Confirm it loaded.** Start a new session and ask: "What is the test command in this repo, and what is its baseline?" The answer must quote `.venv/bin/python -m pytest -rA` and `92 passed`. In Gemini CLI, `/memory show` prints the exact combined context ^[confirmed](https://geminicli.com/docs/reference/commands "2026-10-20"). For `agy`, find the matching command with `agy --help` on day 1; we could not confirm one. Checked against docs on 2026-10-20, not run.

**Exit check:** the agent quotes your test command back.

## Phase 3: Find {#phase-find}

### S6 Reproduce {#s6}

**Do.** Turn the issue into a failing test before anyone touches the code. The test must fail for the **right reason**: an assertion about a value, not an import error or a typo.

First run the issue's own steps:

```bash
.venv/bin/python -m tallyhub --store sqlite:///../scratch/issue41.db ingest ../scratch/orders.ndjson
.venv/bin/python -m tallyhub --store sqlite:///../scratch/issue41.db query checkout.orders --window 1d
rm ../scratch/issue41.db
```

```text
accepted 2, rejected 0, duplicates 0, bucket writes 2
window                series           value
2026-03-01T00:00:00Z  checkout.orders  1
2026-03-02T00:00:00Z  checkout.orders  1
```

That matches "Actual" in `ISSUE.md`. Now the test, `tests/test_issue41.py`:

```python
"""Issue #41: an ISO timestamp with a UTC offset lands in the wrong window."""
from tallyhub.api import TallyService
from tallyhub.config import Config
from tallyhub.parsing import parse_timestamp
from tallyhub.storage import MemoryStore

TRUE_INSTANT = 1772425800.0  # 2026-03-02T04:30:00Z = 2026-03-01T23:30:00-05:00


def test_offset_is_applied():
    assert parse_timestamp("2026-03-01T23:30:00-05:00") == TRUE_INSTANT


def test_issue_41_daily_window():
    service = TallyService(MemoryStore(), Config(store_url="memory://"))
    service.ingest([
        '{"metric": "checkout.orders", "ts": "2026-03-01T23:30:00-05:00", "id": "ny-1001"}',
        '{"metric": "checkout.orders", "ts": "2026-03-02T04:45:00Z", "id": "ny-1002"}',
    ])
    rows = service.query("checkout.orders", window="1d")
    assert [(r["window"], r["value"]) for r in rows] == [("2026-03-02T00:00:00Z", 2.0)]
```

One unit test pins the cause. One end-to-end test pins the user's symptom.

```bash
.venv/bin/python -m pytest -q tests/test_issue41.py
```

```text
E       AssertionError: assert 1772407800.0 == 1772425800.0
E        +  where 1772407800.0 = parse_timestamp('2026-03-01T23:30:00-05:00')
…
E         At index 0 diff: ('2026-03-01T00:00:00Z', 1.0) != ('2026-03-02T00:00:00Z', 2.0)
E         Left contains one more item: ('2026-03-02T00:00:00Z', 1.0)
…
FAILED tests/test_issue41.py::test_offset_is_applied - AssertionError: assert...
FAILED tests/test_issue41.py::test_issue_41_daily_window - AssertionError: as...
2 failed in 0.12s
```

Right reason: both failures are value assertions. `1772407800` is 2026-03-01T23:30:00**Z**: the producer's wall-clock time read as if it were UTC. Commit the red test on a branch, so the fix arrives as a separate commit:

```bash
git switch -q -c fix-41 && git add tests/test_issue41.py && git commit -qm "test: reproduce #41 (fails on 0.6.1)"
```

Why first? Reproduction tests that fail before the fix and pass after it are a strong filter: used to screen proposed fixes, they doubled SWE-Agent's precision in SWT-Bench ^[confirmed](https://arxiv.org/abs/2406.12952 "2026-10-20").

**Exit check:** red for the right reason, committed.

### S7 Locate {#s7}

**Do.** Write your own hypothesis in `audit.md` first. Then ask the agent for its hypotheses. Settle the difference with a tool, not with an argument.

Yours, from [[S2]]: "The string branch drops the offset at `parsing.py:52` and stamps UTC at line 55." The agent's, from claim 8: "The window code cuts days at UTC midnight." The prompt to get the agent's ranked guesses:

```text
Read-only. Issue #41 is in ISSUE.md. The failing test is tests/test_issue41.py.
Give your top two hypotheses for the root cause. For each one: file:line,
the mechanism in one sentence, and one command I can run to prove or kill it.
Do not propose a fix yet.
```

A one-line probe settles it. If the window code were wrong, parsing would give the right instant:

```bash
.venv/bin/python -c "
from tallyhub.parsing import parse_timestamp as p
from tallyhub.windows import format_ts
for s in ['2026-03-01T23:30:00-05:00', '2026-03-01T23:30:00Z', '2026-03-01T23:30:00+01:00']:
    print(s, '->', p(s), format_ts(p(s)))
"
```

```text
2026-03-01T23:30:00-05:00 -> 1772407800.0 2026-03-01T23:30:00Z
2026-03-01T23:30:00Z -> 1772407800.0 2026-03-01T23:30:00Z
2026-03-01T23:30:00+01:00 -> 1772407800.0 2026-03-01T23:30:00Z
```

Three different instants give one number. The offset is gone before any window code runs. A fix in the window code cannot work, because the window code only ever sees a float. Claim 8 would have been a symptom-only fix ([[M2]]).

The debugger shows the mechanism. Start pdb at line 55 with the issue's input, then type the commands after each `(Pdb)` prompt:

```bash
.venv/bin/python -m pdb -c 'break tallyhub/parsing.py:55' -c continue -m tallyhub --store memory:// ingest ../scratch/orders.ndjson
```

```text
Breakpoint 1 at …/repo/tallyhub/parsing.py:55
> …/repo/tallyhub/parsing.py(55)parse_timestamp()
-> ts = dt.replace(tzinfo=timezone.utc).timestamp()
(Pdb) p raw
'2026-03-01T23:30:00-05:00'
(Pdb) p text[:19]
'2026-03-01T23:30:00'
(Pdb) p dt
datetime.datetime(2026, 3, 1, 23, 30)
(Pdb) p dt.tzinfo
None
(Pdb) quit
```

For C++ on macOS, use `lldb`, not `gdb`; see [[debug]].

**When history exists, bisect.** In a real repo with history, `git bisect run` finds the first bad commit for you. Your script exits 0 for good, 1–127 (except 125) for bad, and 125 to skip a commit that cannot be tested ^[confirmed](https://git-scm.com/docs/git-bisect "2026-10-20"). The practice copy has one commit, so there is nothing to bisect. [[lab:lab-e]] trains it on a 200-commit history.

**Gate 3, in two sentences.** "`parse_timestamp` keeps only the first 19 characters of an ISO string to drop fractions, which also drops any UTC offset, and line 55 then labels that wall-clock time as UTC. Tests miss it because every ISO string in them ends in `Z`, and nothing downstream can repair it, because events carry a bare float."

**Exit check:** the two sentences name the line, the wrong behavior and why tests missed it.

## Phase 4: Change {#phase-change}

### S8 Plan and guardrails {#s8}

**Do.** Ask for a plan before any edit. State the guardrails in the prompt. Compare the plan with your checked map. Write down the **must-keep rules**: documented behaviors the fix must not break.

```text
Plan a fix for issue #41. Do not edit yet.
Rules: a general fix, no special cases for test inputs. Change only
tallyhub/parsing.py. Do not edit tests. Keep README.md:46-47: fractional
seconds are dropped, and a string without an offset is read as UTC.
List every behavior that will change, including inputs that are accepted
or rejected differently. If the spec and the tests disagree, stop and ask.
```

> **Example agent output, written for this guide. Not real Gemini output.**
>
> 1. Replace `strptime(text[:19], ...)` with `datetime.fromisoformat(raw.strip())`. It parses offsets and `Z`.
> 2. Keep whole seconds with `dt.replace(microsecond=0)`.
> 3. Keep existing behavior for all other inputs.
> 4. Run the full suite.

Compare it with your map and the README:

- Step 1 targets the right line ([[S7]]). Good.
- Step 2 keeps must-keep rule R1: fractions are dropped. A visible test pins R1 (`test_parsing.py:81`).
- Step 3 is vague, and the plan skipped the requested list of behavior changes. That is an ignored instruction. Note it.
- Must-keep rule R2, "no offset means UTC" (`README.md:46-47`), is not mentioned, and **no test pins it**. Write R2 in `audit.md` as an attack target for [[S12]].

The Antigravity docs give the same order: explore, plan, then execute, with edits only after you approve the plan ^[confirmed](https://antigravity.google/docs/cli/best-practices "2026-10-20").

**Exit check:** must-keep rules R1 and R2 written down, scope limited to one file.

### S9 Small edits {#s9}

**Do.** Let the agent edit in small steps. After each edit: look at the diff, run the full suite. Approve or reject.

Give the agent one step at a time, and ask for real output, not a summary:

```text
Do step 1 of the plan only. Change only tallyhub/parsing.py. Do not edit tests.
Then show me the full diff and the real output of .venv/bin/python -m pytest -q:
its last line and the exit code. Stop and wait for my approval before step 2.
```

Below is the agent's edit, applied in the practice copy. If your own agent writes a different patch, audit that one. To follow this example exactly, type this diff in by hand.

> **Example agent patch, written for this guide. No agent was run; not real Gemini output.**

```bash
git diff
```

```diff
@@ -44,15 +44,13 @@ def parse_timestamp(raw: object) -> float:
     if isinstance(raw, (int, float)):
         ts = float(raw)
     elif isinstance(raw, str):
-        text = raw.strip()
-        if text.endswith("Z"):
-            text = text[:-1]
         try:
-            # Producers send milliseconds we do not need; keep whole seconds.
-            dt = datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S")
+            # fromisoformat keeps the UTC offset (Python 3.11+ also accepts "Z").
+            dt = datetime.fromisoformat(raw.strip())
         except ValueError:
             raise ParseError(f"bad timestamp {raw!r}") from None
-        ts = dt.replace(tzinfo=timezone.utc).timestamp()
+        # Producers send milliseconds we do not need; keep whole seconds.
+        ts = dt.replace(microsecond=0).timestamp()
     else:
         raise ParseError(f"bad timestamp {raw!r}")
```

```bash
set -o pipefail; .venv/bin/python -m pytest -q 2>&1 | tail -1; echo "exit=$?"
git commit -qam "fix #41: parse ISO timestamps with fromisoformat"
```

```text
94 passed in 0.29s
exit=0
```

> **Example agent output, written for this guide. Not real Gemini output.**
>
> Fixed. All 94 tests pass. Offset-free timestamps are still treated as UTC, as the README says. No other behavior changes.

That message holds three claims. [[S11]], [[S12]] and [[S13]] will test each one.

**The rewind rule.** If you have corrected the agent twice on the same problem and it is still wrong, stop. Roll back and start again with a better prompt. This rule comes from Anthropic's Claude Code best practices ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20"). In `agy`, `/rewind` rolls back to a checkpoint and `/fork` tries a risky idea in a copy of the session ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20"). Checked against docs on 2026-10-20, not run.

**Long tasks.** Polaris tasks are long-horizon ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). For a change with several milestones, keep `spec.md` and `plan.md` in the repo, as Google's Conductor does ^[confirmed](https://developers.googleblog.com/evolving-spec-driven-development-conductor-now-supports-antigravity/ "2026-10-20"). At each milestone, audit like this:

```bash
git log -p --reverse BASE..HEAD -- . ':!tests' | less
set -o pipefail; python -m pytest -rA 2>&1 | tee ../notes/milestone-2.txt | tail -1; echo "exit=$?"
diff <(grep -E '^(PASSED|FAILED)' ../notes/milestone-1.txt) <(grep -E '^(PASSED|FAILED)' ../notes/milestone-2.txt)
```

Replace `BASE` with your base tag or SHA. Then reread `spec.md` against the diff: is anything missing, or added that nobody asked for? Run every earlier repro test again: a bug fixed at milestone 1 can come back at milestone 3. Terminal-Bench 2.0's failure taxonomy names the long-task failures to watch for, such as context loss, premature termination and weak verification ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20"). [[change]] goes deeper.

**Exit check:** each edit is small, its diff was read, and the full suite ran after it.

## Phase 5: Prove {#phase-prove}

### S10 Read the diff {#s10}

**Do.** Read the whole diff, not the agent's summary. Open every changed file. Scan for red flags. Read the **deleted** lines as carefully as the added ones. Then list every behavior that changed.

```bash
git diff --stat v0.6.1
git diff v0.6.1 -- . ':!tests' | rg -n '^\+.*(skip|xfail|sys\.exit|os\._exit|__eq__|except:|except Exception|shell=True|eval\(|exec\(|verify=False|type: ?ignore|noqa|pragma)'; echo "red flags: exit=$?"
git diff v0.6.1 -- tests '*conftest.py' | rg -n '^\+.*(skip|xfail|sys\.exit|os\._exit|__eq__|pytest_collection|pytest_runtest)'; echo "test red flags: exit=$?"
git diff v0.6.1 -- tallyhub | rg '^-[^-]'
rg -n 'timezone' tallyhub/parsing.py
```

```text
 tallyhub/parsing.py   | 10 ++++------
 tests/test_issue41.py | 21 +++++++++++++++++++++
 2 files changed, 25 insertions(+), 6 deletions(-)
red flags: exit=1
test red flags: exit=1
-        text = raw.strip()
-        if text.endswith("Z"):
-            text = text[:-1]
-            # Producers send milliseconds we do not need; keep whole seconds.
-            dt = datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S")
-        ts = dt.replace(tzinfo=timezone.utc).timestamp()
26:from datetime import datetime, timezone
```

There are two scans because they look at different places. The first skips `tests/`, so test code that mentions `skip` cannot drown the real hits. The second looks only at test files and every `conftest.py`, where a `skip` marker or a pytest hook that hides failures would live ([[M3]]). Both exit 1: no red flags, and the only test file is yours. But look at the last line: `timezone` now appears only in the import. Its one real use was the deleted line 55. That deleted line was the code that made offset-free strings UTC. So where did rule R2 go?

The Python docs answer it: `timestamp()` on a naive datetime (one without a time zone) assumes **local time** ^[confirmed](https://docs.python.org/3/library/datetime.html "2026-10-20"). Write the behavior-change list in `audit.md`:

1. Offsets are now applied. Wanted.
2. **H1:** offset-free strings are now read in the machine's local time zone. That breaks R2.
3. **H2:** `fromisoformat` accepts a different set of strings than `strptime(text[:19])`. Some inputs may now be accepted or rejected differently.

[[prove]] builds a fuller red-flag script. The patterns above come from documented hacks: special-cased tests and `# special case` comments ^[confirmed](https://www.anthropic.com/claude-3-7-sonnet-system-card "2026-10-20"), `sys.exit(0)` so the tests look passed ^[confirmed](https://www.anthropic.com/research/emergent-misalignment-reward-hacking "2026-10-20"), and deleted test files, seen with Gemini CLI ^[confirmed](https://arxiv.org/abs/2511.21654 "2026-10-20").

**Exit check:** every changed behavior is on your list, as a fact or as a hypothesis to test.

### S11 Re-run it yourself {#s11}

**Do.** Re-run in a clean checkout, so untracked files cannot help. Compare with the baseline. Compare test hashes, and list every added or changed test or config file. Run the new tests five times.

```bash
cd .. && git clone -q --branch fix-41 repo clean && cd clean
set -o pipefail; ../repo/.venv/bin/python -m pytest -rA 2>&1 | tee ../notes/after.txt | tail -1; echo "exit=$?"
diff <(grep -E '^(PASSED|FAILED|ERROR)' ../notes/baseline.txt) <(grep -E '^(PASSED|FAILED|ERROR)' ../notes/after.txt)
shasum -a 256 -c ../notes/test-hashes.txt
git diff --name-status v0.6.1 -- tests '*conftest.py' pytest.ini tox.ini setup.cfg pyproject.toml
for i in 1 2 3 4 5; do ../repo/.venv/bin/python -m pytest -q -p no:cacheprovider tests/test_issue41.py | tail -1; done
```

```text
============================== 94 passed in 0.30s ==============================
exit=0
38a39,40
> PASSED tests/test_issue41.py::test_offset_is_applied
> PASSED tests/test_issue41.py::test_issue_41_daily_window
tests/conftest.py: OK
tests/test_aggregate.py: OK
…
tests/test_windows.py: OK
pyproject.toml: OK
A	tests/test_issue41.py
2 passed in 0.01s
2 passed in 0.03s
2 passed in 0.01s
2 passed in 0.11s
2 passed in 0.00s
```

The only difference from the baseline is two new passing tests. Every old test file is unchanged. The hashes cannot see a file that was **added**, such as a new `conftest.py` or a `pytest.ini`, which pytest reads instead of `pyproject.toml`. The `--name-status` line can: only the files you wrote may show up. Here that is `A tests/test_issue41.py`, your own test. An `A` or `M` on anything else is [[M3]] until you have read it. The new tests are stable.

**Gate 4 passes.** The agent made one claim about its run, "All 94 tests pass", and your run matches it. This is the trap: Gate 4 checks that the agent told the truth about its run. It does not check that the patch is right. The other two claims, "offset-free stays UTC" and "no other behavior changes", are about behavior. They stay hypotheses for [[S12]]–[[S14]].

Why re-run at all? In one public dataset of real agent sessions, an LLM judge found "overselling" (claiming more was done or verified than the transcript shows) in 34.7% of 4,788 sessions, 1.8% of them severe ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20"). It is one dataset and an LLM-judged rate, so treat it as an estimate.

**Headless runs.** If the agent ran without you, as in `agy -p "..." --output-format json`, read the JSON `status` field, not only the exit code. A tool call that needed approval is soft-denied, and the run can still exit 0 ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"). Checked against docs on 2026-10-20, not run.

**C++.** Rebuild with `-fsanitize=address,undefined -fno-sanitize-recover=all` and re-run, so memory errors and undefined behavior abort the run ([[M9]]). Apple clang has no LeakSanitizer. See [[debug]].

**Exit check:** clean-clone run, baseline diff, hashes OK, only your own test files added, 5 stable runs. Gate 4 passed or failed on the record.

### S12 Attack the fix {#s12}

**Do.** Try to break the fix with inputs the tests never tried. Four tools: held-out edge cases, property tests, differential tests against the old code, and the revert-the-fix check. Aim at your hypotheses and must-keep rules first.

H1 first, with a one-line probe in two time zones:

```bash
cd ../repo
for z in UTC America/New_York; do TZ=$z .venv/bin/python -c "from tallyhub.parsing import parse_timestamp as p; print('TZ=$z', p('2026-03-02T04:30:00'))"; done
```

```text
TZ=UTC 1772425800.0
TZ=America/New_York 1772443800.0
```

H1 is true. The same string gives two answers, 5 hours apart. On a CI machine set to UTC, everything looks fine. The patch is "similar but different" ([[M5]]), the largest category in PatchDiff ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20").

Now make the attack permanent. Install Hypothesis, a property-testing library, pinned. Add it to the repo's own dev requirements, because the attack tests will be committed: anyone who installs `requirements-dev.txt` and runs pytest must get Hypothesis too. `sortedcontainers` is its one dependency.

```bash
printf 'hypothesis==6.170.5\nsortedcontainers==2.4.0\n' >> requirements-dev.txt
uv pip install -q --python .venv/bin/python -r requirements-dev.txt
```

Then `tests/test_issue41_attack.py`. Write it **before** you read any tests the agent wrote, so its tests cannot shape yours.

```python
"""Attack tests for the #41 fix (S12). Written before reading the agent's tests."""
import math
import os
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import pytest
from hypothesis import given, settings, strategies as st

from tallyhub.parsing import ParseError, parse_timestamp

TRUE_INSTANT = 1772425800  # 2026-03-02T04:30:00Z
ZONES = ["UTC", "America/New_York", "Asia/Kolkata"]


@contextmanager
def local_tz(name):
    """Run the block as if the machine's time zone were `name`."""
    old = os.environ.get("TZ")
    os.environ["TZ"] = name
    time.tzset()
    try:
        yield
    finally:
        if old is None:
            del os.environ["TZ"]
        else:
            os.environ["TZ"] = old
        time.tzset()


def old_parse_iso(text):
    """Frozen copy of the 0.6.1 string branch, for differential tests."""
    text = text.strip()
    if text.endswith("Z"):
        text = text[:-1]
    dt = datetime.strptime(text[:19], "%Y-%m-%dT%H:%M:%S")
    return dt.replace(tzinfo=timezone.utc).timestamp()


# 1. Metamorphic: the same instant written in any offset parses to the same number.
@pytest.mark.parametrize("minutes", range(-12 * 60, 14 * 60 + 1, 15))
def test_same_instant_in_every_offset(minutes):
    dt = datetime.fromtimestamp(TRUE_INSTANT, timezone(timedelta(minutes=minutes)))
    assert parse_timestamp(dt.isoformat()) == TRUE_INSTANT


# 2. Two features at once: offset AND fraction (fraction must still be dropped).
def test_offset_with_fraction():
    assert parse_timestamp("2026-03-01T23:30:00.250-05:00") == TRUE_INSTANT


# 3. Held-out edge case: no offset means UTC, on every machine (README.md:46-47).
@pytest.mark.parametrize("zone", ZONES)
def test_offset_free_is_utc_on_any_machine(zone):
    with local_tz(zone):
        assert parse_timestamp("2026-03-02T04:30:00") == TRUE_INSTANT


# 4. Differential: on inputs 0.6.1 already got right, new == old, in every zone.
naive = st.datetimes(min_value=datetime(1971, 1, 1), max_value=datetime(2100, 1, 1))


@settings(max_examples=300, deadline=None, derandomize=True, database=None)
@given(naive, st.sampled_from(["", "Z"]), st.sampled_from(["", ".5", ".250", ".999999"]),
       st.sampled_from(ZONES))
def test_new_matches_old_where_old_was_right(dt, suffix, fraction, zone):
    text = dt.strftime("%Y-%m-%dT%H:%M:%S") + fraction + suffix
    with local_tz(zone):
        assert parse_timestamp(text) == old_parse_iso(text)


# 5. Property: any aware datetime round-trips to its whole-second instant.
aware = st.datetimes(min_value=datetime(1971, 1, 1), max_value=datetime(2100, 1, 1),
                     timezones=st.builds(lambda m: timezone(timedelta(minutes=m)),
                                         st.integers(-12 * 60, 14 * 60)))


@settings(max_examples=300, deadline=None, derandomize=True, database=None)
@given(aware)
def test_aware_round_trip(dt):
    assert parse_timestamp(dt.isoformat()) == math.floor(dt.timestamp())


# 6. Behavior that must not change: garbage is still rejected.
@pytest.mark.parametrize("raw", ["yesterday", "2026-13-02T14:05:00Z", "", "T14:05:00"])
def test_still_rejects_garbage(raw):
    with pytest.raises(ParseError):
        parse_timestamp(raw)
```

Each test has one job:

- **Metamorphic test (1).** You do not need to know the right answer for each input. You only need a relation that must hold: the same instant, written in 105 different offsets, must give one number.
- **Feature combination (2).** Offset plus fraction. Bugs live where two features meet.
- **Held-out edge case (3).** Rule R2, under three machine time zones.
- **Differential test (4).** On the inputs 0.6.1 already handled right, the new code must agree with the old code. `derandomize=True` makes the run repeatable. `database=None` stops Hypothesis from saving failing examples between runs. Hypothesis still makes a `.hypothesis/` folder, which it gitignores itself.
- **Property test (5).** A round trip for every aware datetime.
- **Pins (6).** Behavior that must not change.

```bash
.venv/bin/python -m pytest -q tests/test_issue41_attack.py
```

```text
E           AssertionError: assert 946702800.0 == 946684800.0
E            +  where 946702800.0 = parse_timestamp('2000-01-01T00:00:00')
E            +  and   946684800.0 = old_parse_iso('2000-01-01T00:00:00')
E           Failing test case: test_new_matches_old_where_old_was_right(
E               # The test always failed when commented parts were varied together.
E               dt=datetime.datetime(2000, 1, 1, 0, 0),  # or any other generated value
E               suffix='',
E               fraction='',  # or any other generated value
E               zone='America/New_York',
E           )
…
FAILED tests/test_issue41_attack.py::test_offset_free_is_utc_on_any_machine[America/New_York]
FAILED tests/test_issue41_attack.py::test_offset_free_is_utc_on_any_machine[Asia/Kolkata]
FAILED tests/test_issue41_attack.py::test_new_matches_old_where_old_was_right
3 failed, 112 passed in 2.26s
```

Caught. Hypothesis also shrank the failure to the simplest input: midnight, no suffix, New York. Note what did **not** catch it: the property test (5) passed, because it only generates datetimes that carry an offset. A property test checks only the input space you generate.

Commit the attack tests together with the requirement they need, then fix the cause. The fix is one rule from the README:

```bash
git add tests/test_issue41_attack.py requirements-dev.txt && git commit -qm "test: attack tests for #41 (S12)"
git diff
```

```diff
@@ -49,6 +49,8 @@ def parse_timestamp(raw: object) -> float:
             dt = datetime.fromisoformat(raw.strip())
         except ValueError:
             raise ParseError(f"bad timestamp {raw!r}") from None
+        if dt.tzinfo is None:
+            dt = dt.replace(tzinfo=timezone.utc)  # README: no offset means UTC
         # Producers send milliseconds we do not need; keep whole seconds.
         ts = dt.replace(microsecond=0).timestamp()
     else:
```

```bash
set -o pipefail; .venv/bin/python -m pytest -q 2>&1 | tail -1; echo "exit=$?"
git commit -qam "fix #41: offset-free ISO strings stay UTC"
```

```text
209 passed in 2.23s
exit=0
```

**The revert-the-fix check.** Put the 0.6.1 parser back, keep all the new tests, and run them:

```bash
git checkout v0.6.1 -- tallyhub/parsing.py
.venv/bin/python -m pytest -q tests/test_issue41.py tests/test_issue41_attack.py | tail -1
git checkout HEAD -- tallyhub/parsing.py
```

```text
108 failed, 9 passed in 2.19s
```

The 9 that pass on 0.6.1 are by design: offset `+00:00`, the three offset-free cases, the differential test and the four garbage pins. They pin behavior 0.6.1 already got right. Every other new test fails on the old code, so the new tests really test this fix.

**Two hand mutants.** A **mutant** is a small deliberate break of the fix. Your tests should "kill" it, which means fail. Mutation testing measures whether tests can catch bugs; Google runs it on changed lines during code review ^[confirmed](https://arxiv.org/abs/2102.11378 "2026-10-20").

```bash
sed -i '' 's/ts = dt.replace(microsecond=0).timestamp()/ts = dt.timestamp()/' tallyhub/parsing.py
.venv/bin/python -m pytest -q | tail -1; git checkout -- tallyhub/parsing.py
sed -i '' 's/if dt.tzinfo is None:/if dt.tzinfo is not None:/' tallyhub/parsing.py
.venv/bin/python -m pytest -q | tail -1; git checkout -- tallyhub/parsing.py
```

```text
4 failed, 205 passed in 2.97s
111 failed, 98 passed in 2.38s
```

Both mutants are killed. `sed -i ''` is the macOS form; on Linux use `sed -i`.

**Exit check:** attacks pass on the fix and fail on the old code; mutants killed.

### S13 Fresh review {#s13}

**Do.** Open a **new** session that has never seen this work. Give it only the spec and the diff. Run three prompts. Then reproduce every finding yourself, and drop the ones that do not reproduce or are about style only.

Why a new session: a reviewer in a fresh context is not biased toward code it just wrote ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20"). Self-correction without outside feedback is unreliable ^[confirmed](https://arxiv.org/abs/2310.01798 "2026-10-20"), and LLM judges favor their own outputs ^[confirmed](https://arxiv.org/abs/2404.13076 "2026-10-20"). Use a different model family if you can. The three roles copy the Critic, Challenger and Auditor of Antigravity's agent-teams preview ^[confirmed](https://antigravity.google/docs/teamwork/ "2026-10-20"). That feature is a paid preview, so you run the roles by hand.

Make the input files:

```bash
git diff v0.6.1 -- tallyhub/ > ../notes/fix.diff
sed -n '44,47p' README.md > ../notes/spec.txt
```

**Critic** (correctness):

```text
You review a patch you did not write. You see only the spec and the diff below.
Find correctness problems only: wrong results, crashes, broken documented
behavior. For each finding give the input, the expected output, the output you
predict, and the diff line. No style comments. If you find nothing, say
"no findings".
```

**Challenger** (adversarial inputs):

```text
Try to break this patch. The spec and the diff are below.
List up to 8 concrete inputs most likely to make the new code disagree with the
spec, or with the old code on inputs the old code handled correctly. Think about
formats the spec allows, boundaries, and the machine's environment (time zone,
locale). For each: the input, why it might break, and a one-line command to test it.
```

**Auditor** (claims against evidence):

```text
You check claims against evidence. Below are the agent's final message and the
raw test output. List every factual claim in the message. For each one, quote
the line of raw output that supports it, or write "no evidence". Do not judge
the code.
```

> **Example review output, written for this guide. Not real Gemini output.**
>
> - Critic: `fromisoformat` widens the accepted input. A date-only string like `2026-03-02`, and a space instead of `T`, now parse.
> - Challenger: RFC 3339 allows a lowercase `z`. 0.6.1 accepted `…:00z`; the new code may raise ParseError.
> - Challenger: a leap second, `23:59:60Z`, may now crash.
> - Challenger: text after the seconds, like `…:00junk`, may now be rejected.
> - Auditor: "No other behavior changes": no evidence in the test output.
> - Critic: rename `dt` to `parsed` for clarity.

Reproduce each finding in **both** versions. A git worktree checks out the base commit next to your repo, so you can run the old and new code side by side. The probe also tries forms nobody reported, because the Critic's finding says the accepted input got wider, and you want to know how much wider:

```bash
git worktree add -q ../base v0.6.1
cat > ../scratch/probe.py <<'EOF'
from tallyhub.parsing import ParseError, parse_timestamp
for s in ["2026-03-02", "20260302", "2026-03-02 14:05:00Z", "2026-03-02x14:05:00Z",
          "20260302T140500Z", "2026-W10-1T14:05:00Z", "2026-03-02T14:05Z", "2026-03-02T14Z",
          "2026-03-02T14:05:00+0100", "2026-03-02T14:05:00junk", "2026-03-02T23:59:60Z",
          "2026-03-02T14:05:00z"]:
    try:
        out = parse_timestamp(s)
    except ParseError:
        out = "ParseError"
    print(f"{s:28} {out}")
EOF
for d in base repo; do echo "== $d"; (cd ../$d && PYTHONPATH=. TZ=UTC ../repo/.venv/bin/python ../scratch/probe.py); done
```

```text
== base
2026-03-02                   ParseError
20260302                     ParseError
2026-03-02 14:05:00Z         ParseError
2026-03-02x14:05:00Z         ParseError
20260302T140500Z             ParseError
2026-W10-1T14:05:00Z         ParseError
2026-03-02T14:05Z            ParseError
2026-03-02T14Z               ParseError
2026-03-02T14:05:00+0100     1772460300.0
2026-03-02T14:05:00junk      1772460300.0
2026-03-02T23:59:60Z         ParseError
2026-03-02T14:05:00z         1772460300.0
== repo
2026-03-02                   1772409600.0
20260302                     1772409600.0
2026-03-02 14:05:00Z         1772460300.0
2026-03-02x14:05:00Z         1772460300.0
20260302T140500Z             1772460300.0
2026-W10-1T14:05:00Z         1772460300.0
2026-03-02T14:05Z            1772460300.0
2026-03-02T14Z               1772460000.0
2026-03-02T14:05:00+0100     1772456700.0
2026-03-02T14:05:00junk      ParseError
2026-03-02T23:59:60Z         ParseError
2026-03-02T14:05:00z         ParseError
```

| Finding | Reproduced? | Decision |
|---|---|---|
| Date-only (`2026-03-02`, `20260302`) and space-separated strings now parse | yes | Accept, as a documented widening. `fromisoformat` accepts ISO 8601 plus some extensions. Its docs list one of them: any single character may replace the `T` ^[confirmed](https://docs.python.org/3/library/datetime.html "2026-10-20"). So the space form is an extension, not ISO 8601. Name it in the changelog. |
| Not reported, found by the probe: any character as the separator (`x`), compact form (`20260302T140500Z`), ISO week dates, times without seconds or with only the hour | yes | Accept as part of the same widening, and name each form in the changelog. A stricter parser is a fair choice too, but it needs its own grammar and its own attack tests. Write down the reason for your choice. |
| `+0100` without a colon | yes, and old was wrong | 0.6.1 dropped this offset silently. The fix corrects it. Bonus. |
| Lowercase `z` now rejected | **yes: a regression** | RFC 3339 allows a lowercase `z` ^[confirmed](https://www.rfc-editor.org/rfc/rfc3339 "2026-10-20"). Producers that send it would have every line rejected. Fix it. |
| Leap second crashes | no: both versions reject it | Drop. Not a change. |
| Trailing text now rejected | yes | Accept as stricter parsing, and say it in the changelog. It is a judgment call: write down the reason. |
| "No other behavior changes" | no evidence | Wrong: 11 of the 12 probe inputs changed. Goes to [[S14]]. |
| Rename `dt` | style only | Drop. |

Reviewers that are told to find gaps usually report some even when the work is sound ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20"). Critics also invent bugs ^[confirmed](https://arxiv.org/abs/2407.00215 "2026-10-20"). That is why every finding is reproduced before it counts. Here the leap-second finding did not reproduce.

The regression slipped past S12 because the differential generator never produced a lowercase `z`. Widen it first, and watch it fail:

```bash
sed -i '' 's/st.sampled_from(\["", "Z"\])/st.sampled_from(["", "Z", "z"])/' tests/test_issue41_attack.py
.venv/bin/python -m pytest -q tests/test_issue41_attack.py | tail -1
```

```text
1 failed, 114 passed in 3.53s
```

Hypothesis reports `ParseError: bad timestamp '2000-01-01T00:00:00z'`. Commit the wider test on its own, so a later revert of the fix cannot take the test with it:

```bash
git commit -qam "test: widen the differential test to a lowercase z"
```

Then fix, and read the diff:

```diff
@@ -44,9 +44,11 @@ def parse_timestamp(raw: object) -> float:
     if isinstance(raw, (int, float)):
         ts = float(raw)
     elif isinstance(raw, str):
+        text = raw.strip()
+        if text[-1:] in ("z", "Z"):
+            text = text[:-1] + "+00:00"  # RFC 3339 allows "z"; fromisoformat does not
         try:
-            # fromisoformat keeps the UTC offset (Python 3.11+ also accepts "Z").
-            dt = datetime.fromisoformat(raw.strip())
+            dt = datetime.fromisoformat(text)
         except ValueError:
             raise ParseError(f"bad timestamp {raw!r}") from None
         if dt.tzinfo is None:
```

Then the whole proof again: full suite, revert check, and three runs in a fresh clean clone.

```bash
set -o pipefail; .venv/bin/python -m pytest -q 2>&1 | tail -1; echo "exit=$?"
git commit -qam "fix #41: accept a lowercase z again"
git checkout v0.6.1 -- tallyhub/parsing.py; .venv/bin/python -m pytest -q tests/test_issue41.py tests/test_issue41_attack.py | tail -1; git checkout HEAD -- tallyhub/parsing.py
cd .. && rm -rf clean && git clone -q --branch fix-41 repo clean && cd clean
for i in 1 2 3; do ../repo/.venv/bin/python -m pytest -q -p no:cacheprovider | tail -1; done
```

```text
209 passed in 1.63s
exit=0
108 failed, 9 passed in 1.32s
209 passed in 1.32s
209 passed in 1.29s
209 passed in 1.32s
```

**Exit check:** every finding reproduced or dropped with a reason.

### S14 Transcript audit {#s14}

**Do.** List every claim the agent made. Match each claim to real tool output. Find the **first wrong turn**: the first step where the agent's belief left the evidence. Tag its phase.

Use the phases of Liu et al.'s failure study: **localization** (finding where), **repair** (writing the change) and **verification** (checking it) ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20"). Here is the session, condensed:

```text
Synthetic, written for this guide. Not real Gemini output.
[01] user  : Fix issue #41 (ISSUE.md). Failing test: tests/test_issue41.py.
[02] agent : The window code in tallyhub/windows.py cuts days at UTC midnight.
             I will make windows follow the producer's offset.
[03] user  : First run: python -c "from tallyhub.parsing import parse_timestamp as p; print(p('2026-03-01T23:30:00-05:00'), p('2026-03-01T23:30:00Z'))"
[04] tool  : 1772407800.0 1772407800.0
[05] agent : The offset is lost before any window code runs: parsing.py:52 keeps
             only text[:19]. I will use datetime.fromisoformat, which handles time
             zones, so the tzinfo line at parsing.py:55 is no longer needed.
[06] edit  : tallyhub/parsing.py (+4 -6)
[07] tool  : .venv/bin/python -m pytest -q -> 94 passed in 0.29s
[08] agent : Fixed. All 94 tests pass. Offset-free timestamps are still treated
             as UTC, as the README says. No other behavior changes.
```

The tool lines [04] and [07] are real outputs from this example. Save the transcript in your notes. Here that is the synthetic transcript above: copy the block, then run the first line below. In a real audit, save your agent's exported transcript there instead. Then search it for shortcuts and for the canary:

```bash
pbpaste > ../notes/transcript.md
rg -n 'git log --all|git show|cherry-pick|curl|wget|github\.com|pip download' ../notes/transcript.md; echo "lookup hits: exit=$?"
rg -c "$(cat ../notes/canary-id.txt)" ../notes/transcript.md; echo "canary hits: exit=$?"
```

```text
lookup hits: exit=1
canary hits: exit=1
```

No lookups and no canary in this synthetic transcript. In a real audit, run the same two searches on the real export. Those searches matter. Cursor had an auditor agent read 731 Opus 4.8 Max trajectories on SWE-bench Pro: it judged that 63% of the successful resolutions retrieved the known fix instead of deriving it ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20").

| Line | Claim | Real evidence | Verdict | Phase |
|---|---|---|---|---|
| 02 | The cause is in the window code | [04]: parsing gives one number for two different instants (see also the three-input probe in [[S7]]) | wrong, corrected by the user at [03] | localization |
| 05 | The offset is lost at `parsing.py:52` | pdb in [[S7]] | right | localization |
| 05 | The tzinfo line is no longer needed | [[S12]] test 3 fails in New York and Kolkata | **wrong** | repair |
| 07–08 | 94 tests pass | [[S11]] clean clone: 94 passed | right | verification |
| 08 | Offset-free timestamps are still UTC | no command in the session ran an offset-free input | wrong, claimed without evidence ([[M6]]) | verification |
| 08 | No other behavior changes | [[S13]] probe: 11 of 12 inputs changed | wrong ([[M4]]) | verification |

**First wrong turn:** [02], in localization, but the user corrected it at [03]. **First uncorrected wrong turn:** [05], "the tzinfo line is no longer needed", in repair. That one shaped the shipped patch. The verification claims in [08] then hid it. Record both.

Two people can disagree about a first wrong turn. On a real study, have two people label a sample and measure how often they agree ^[inference](- "2026-10-20").

**Exit check:** a claims table with a verdict and evidence per claim, and the first (uncorrected) wrong turn with its phase.

## Phase 6: Learn {#phase-learn}

### S15 Merge check and log {#s15}

**Do.** Ask "would a maintainer merge this?", not only "do tests pass?". Use METR's reasons why test-passing agent PRs were not mergeable: core functionality, breaks other code, test coverage, documentation, code quality ^[confirmed](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ "2026-10-20") ^[confirmed](https://metr.org/blog/2025-08-12-research-update-towards-reconciling-slowdown-with-time-horizons "2026-10-20"). Then log every mistake.

- [ ] **Core works:** repro and attack tests pass; ISSUE.md's steps now print the "Expected" block.
- [ ] **Nothing else broke:** 92 old tests pass; test hashes unchanged; the full suite passes in a fresh venv built only from `requirements-dev.txt`; the CLI's `--start`/`--end` now honor offsets too (`cli.py:114`), which is intended.
- [ ] **Tests:** 2 repro tests and 115 attack tests. 108 of the 117 fail on 0.6.1; the 9 that pass pin behavior 0.6.1 already got right. Both hand mutants are killed.
- [ ] **Docs:** a changelog entry that names every behavior change, including the wider input and the stricter parsing.
- [ ] **Code quality:** the diff touches one function; `timezone` is used again; the library gains no dependency, and the test suite's new one (Hypothesis) is pinned in `requirements-dev.txt`.

Why the fresh venv? Every clean-clone run so far borrowed `../repo/.venv`, where you installed Hypothesis by hand. A maintainer or a CI job starts from `requirements-dev.txt` alone. Run it from the clean clone:

```bash
uv venv -q --python 3.13 ../fresh && uv pip install -q --python ../fresh/bin/python -r requirements-dev.txt && ../fresh/bin/python -m pytest -q | tail -1
```

```text
209 passed in 3.84s
```

Without the S12 change to `requirements-dev.txt`, this run stops at collection with `ModuleNotFoundError: No module named 'hypothesis'`.

The ISSUE.md steps on the final fix:

```text
accepted 2, rejected 0, duplicates 0, bucket writes 2
window                series           value
2026-03-02T00:00:00Z  checkout.orders  2
```

The changelog entry:

```markdown
## 0.6.2 (unreleased)

- Fix #41: ISO timestamps with a UTC offset (`-05:00`, `+0100`) are converted to UTC.
  They used to be read as UTC wall-clock time. `query --start/--end` are fixed too.
- ISO strings now follow Python's `datetime.fromisoformat` grammar (3.11+), plus a
  lowercase `z`. Newly accepted: date-only (`2026-03-02`, `20260302`), any single
  character instead of `T` (a space, or even `x`), compact forms (`20260302T140500Z`),
  ISO week dates (`2026-W10-1T14:05:00Z`), and hour- or minute-precision times
  (`2026-03-02T14Z`, `2026-03-02T14:05Z`). Text after the seconds (`...:00junk`)
  is now rejected.
- Tests: Hypothesis 6.170.5 is now a dev requirement (`requirements-dev.txt`).
```

The probe tried 12 inputs, not the whole grammar. Write that in the "what I did NOT check" line of `audit.md`, with a pointer to the Python docs.

**The mistake log.** One row per mistake, in `../notes/mistakes.csv`. The minutes below are illustrative; log your own clock.

```csv
date,task,what went wrong,mistake row,caught at step,minutes
2026-10-20,tallyhub#41,map said parse_timestamp uses fromisoformat (it uses strptime on text[:19]),M8,S4,2
2026-10-20,tallyhub#41,map cited a test that does not exist,M8,S4,1
2026-10-20,tallyhub#41,blamed the window code (the reporter's guess),M2,S7,3
2026-10-20,tallyhub#41,fix read offset-free strings in the machine's local time,M5,S12,8
2026-10-20,tallyhub#41,fix rejected a lowercase z that 0.6.1 accepted,M4,S13,6
2026-10-20,tallyhub#41,"claimed offset-free stays UTC, with no run that shows it",M6,S14,2
```

**Turn the log into task ideas.** This is where Catch feeds Build ^[inference](- "2026-10-20"):

- A task whose hidden tests run under three `TZ` values. The visible tests pass in UTC, so an environment-dependent fix fails only in grading.
- A grader check that uses a metamorphic relation (one instant in many offsets) instead of fixed expected values.
- A wrong-solution corpus entry: the "local time" fix. Any grader for this task must reject it. See [[grader-validity]].

**Exit check:** merge checklist done; one row per mistake; at least one task idea.

## The example in one table {#example-summary}

| Step | What it caught or confirmed | Row |
|---|---|---|
| [[S2]] | 97% statement-and-branch coverage, yet no test sends an offset | — |
| [[S4]] | Two wrong map claims on the bug's path; Gate 2 fired | [[M8]] |
| [[S7]] | The suggested cause (window code) was a symptom | [[M2]] |
| [[S10]] | A deleted line removed the UTC rule; `timezone` left only in the import | — |
| [[S11]] | The agent's "94 passed" was true (Gate 4); the patch was still wrong | — |
| [[S12]] | The "local time" bug, proven in three time zones | [[M5]] |
| [[S13]] | A lowercase `z` regression; a wider input grammar, now named in the changelog; one reviewer finding dropped | [[M4]] |
| [[S15]] | The committed attack tests needed Hypothesis in `requirements-dev.txt`; a fresh venv proves it | — |
| [[S14]] | Two claims made without evidence; first uncorrected wrong turn in repair | [[M6]] |

Look at Gate 4. A vibe coder stops there, because the agent told the truth about its tests. Every real bug in this example was found **after** that point.

:::compare
- Asks the agent "what does this repo do?" and trusts the answer. || Runs the tests twice, maps with tools, then checks the agent's claims on the bug's path first.
- Lets the agent fix first, then adds a test that passes. || Writes a failing test first and checks that it fails for the right reason.
- Takes the reporter's or the agent's guess about the cause. || Writes a guess first, then settles it with a probe, a debugger or bisect.
- Reads the agent's summary. || Reads the whole diff, deleted lines too, and lists every behavior change.
- Believes "all tests pass". || Re-runs in a clean clone, diffs against the baseline, checks test-file hashes.
- Stops when the suite is green. || Attacks the fix: held-out cases, metamorphic, property and differential tests, a revert check, mutants.
- Asks the same session "is this right?". || Opens a fresh session that sees only the spec and the diff, then reproduces each finding.
- Forgets the mistake. || Logs it in `mistakes.csv` and turns it into a task idea.
:::

## Mistake card {#mistake-card}

Every row maps to practice in at least one lab. The "Practice in" column comes from each lab's `lab.json`, the same source as the labs README. Print the card from the [[cards]] page.

| # | Agent mistake | Detect with | Step | Practice in |
|---|---|---|---|---|
| M1 | Invented API, flag or package | Run it; `--help`; try the import; check the lock file | [[S4]], [[S11]] | [[lab:lab-a]], [[lab:lab-c]], [[lab:lab-h]] |
| M2 | Wrong root cause, or a symptom-only fix | Repro red → green; a second input; probe before the symptom | [[S6]]–[[S7]], [[S12]] | [[lab:lab-a]], [[lab:lab-c]], [[lab:lab-e]], [[lab:lab-h]] |
| M3 | Test gaming: special-cased inputs, edited or skipped tests, a `conftest.py` exit, an always-true `__eq__` | Diff test files; hashes; held-out tests | [[S10]]–[[S12]] | [[lab:lab-c]], [[lab:lab-f]], [[lab:lab-h]] |
| M4 | Silent damage: deleted logic, scope creep, swallowed errors, changed behavior nobody asked for | `git diff --stat`; read deleted lines; baseline diff; old-vs-new probe | [[S10]]–[[S13]] | [[lab:lab-c]], [[lab:lab-f]], [[lab:lab-h]] |
| M5 | Similar-but-different logic | Differential and property tests; vary the environment | [[S12]] | [[lab:lab-a]], [[lab:lab-c]], [[lab:lab-f]], [[lab:lab-h]] |
| M6 | Overselling: "tests pass" with no output, or a claim no run supports | Re-run yourself; read the `status` field; claims table | [[S11]], [[S14]] | [[lab:lab-c]], [[lab:lab-d]] |
| M7 | Solution lookup: `git log --all`, upstream fetch, memorized code | Isolation; canary; transcript search | [[S0]], [[S14]] | [[lab:lab-c]] |
| M8 | Answering from memory, not from the code | file:line citations; check each with `rg` or `sed -n` | [[S3]]–[[S4]] | [[lab:lab-a]], [[lab:lab-c]], [[lab:lab-e]], [[lab:lab-h]] |
| M9 | C++ memory errors or undefined behavior | `-fsanitize=address,undefined -fno-sanitize-recover=all` (no LeakSanitizer on Apple clang) | [[S11]] | [[lab:lab-d]] |
| M10 | Security and dependencies: `shell=True`, `eval`/`exec`, `verify=False`, secrets, new packages | Red-flag scan; dependency diff; install-check every new package | [[S10]] | [[lab:lab-c]], [[lab:lab-h]] |

The evidence behind the rows:

- **M1, M10.** Across 16 code models and 576,000 samples, at least 5.2% of packages suggested by commercial models and 21.7% by open models did not exist ^[confirmed](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen "2026-10-20"). Attackers can register those names.
- **M2.** Repair-phase failures include specific-case overfitting and incomplete repairs ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20").
- **M3.** Special-casing tests is documented in a frontier model's own system card ^[confirmed](https://www.anthropic.com/claude-3-7-sonnet-system-card "2026-10-20"). Gemini CLI deleted test files after finishing in one study ^[confirmed](https://arxiv.org/abs/2511.21654 "2026-10-20").
- **M5.** "Similar but different" was the largest cause of divergent patches in PatchDiff ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20").
- **M6.** Overselling: 34.7% of 4,788 sessions in one public dataset (1.8% severe), LLM-judged ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20").
- **M7.** Git-history mining in eval containers ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20").
- **M9.** AddressSanitizer finds out-of-bounds access and use-after-free ^[confirmed](https://www.usenix.org/conference/atc12/technical-sessions/presentation/serebryany "2026-10-20").

Google DeepMind's own code-security agent, CodeMender, validates its patches with differential testing, fuzzing, static and dynamic analysis, and an LLM critique before a human reviews them ^[confirmed](https://deepmind.google/discover/blog/introducing-codemender-an-ai-agent-for-code-security/ "2026-10-20"). It is DeepMind's published version of the same idea: never trust a patch you have not attacked.

## The audit.md template {#audit-template}

Copy this into `$W/notes/audit.md` at [[S0]]. Fill each section as you go, not at the end.

```markdown
# Audit: <task or issue>   date: <YYYY-MM-DD>   mode: drive | review | light

## S0 Isolate
- base SHA:                    practice path:
- git log --all lines: 1       remotes: 0       canary id: <in notes/canary-id.txt>
- agent tool + version:        model:           mode / permissions / sandbox:
- boundary test (agent read ../private/canary.txt?): yes | no

## S1 Baseline (Gate 1)
- command: set -o pipefail; <test command> 2>&1 | tee baseline.txt; echo "exit=$?"
- run 1: <N passed, M failed, exit>   run 2: <...>   same list: yes | no
- python / runtime:            freeze: notes/freeze.txt     hashes: notes/test-hashes.txt

## S2 Tool map (5 lines, each with file:line)
1. entry:
2. path of one request:
3. state:
4. tests cover / miss:
5. first guess:

## S3-S4 Agent map check (Gate 2: 2+ wrong on the bug's path -> map by hand)
| # | claim | on bug path? | verdict | command -> what I saw |

## S5 Rule file
- file: AGENTS.md | GEMINI.md     loaded (agent quoted the test command): yes | no

## S6 Reproduce
- test:                         fails for the right reason (assertion on a value): yes | no

## S7 Locate (Gate 3)
- my hypothesis (written first):
- agent's hypotheses:
- settled by (probe / pdb / lldb / blame / bisect):
- the bug in 2 sentences:

## S8 Plan
- scope (files):                must-keep rules: R1 ... R2 ...
- plan items that are vague or ignore an instruction:

## S9 Edits
| edit | diff lines | suite result | approved? |

## S10 Diff
- git diff --stat BASE:         red flags:      deleted logic:
- behavior changes (fact or hypothesis H1, H2 ...):

## S11 Re-run (Gate 4: the agent's claims about its runs match my run)
- clean clone result vs baseline:    hashes OK: yes | no    new tests 5x stable: yes | no
- added or changed test/config files (git diff --name-status BASE -- tests '*conftest.py' ...):
- each run claim (command, count, pass/fail, exit code, status) -> matches my run?
- behavior claims, kept as hypotheses for S12-S14:

## S12 Attack
- attacks (held-out / metamorphic / property / differential):
- result on the fix:            result with the fix reverted:      mutants killed:

## S13 Fresh review
| finding | reproduced? | decision + reason |

## S14 Transcript
| line | claim | evidence | verdict | phase |
- first wrong turn:             first uncorrected wrong turn:
- lookups / canary found in transcript: yes | no

## S15 Merge check and log
- core / nothing else broke / tests / docs / quality:
- rows added to mistakes.csv:   task ideas:
- what I did NOT check:
```

## A 60-minute mock in three modes {#mock}

Practice the audit under the clock. Run the same structure three times, each time on a **new** repo, in three modes. Build the practice repos with the recipe in [[interview#mock-material|Get realistic mock material]]: R1 from a real fix commit with a bug report, R2 from a commit that adds a feature with tests. That recipe also gives you hidden tests to grade yourself afterwards.

:::note title="Audit-habit variants of the interview mocks"
The canonical mocks are in [[interview#mocks|Interview modes and mocks]]. Modes 1 and 2 here keep the phase times of Mock 1 and Mock 2 there, and name the audit steps inside each phase. Mode 2 spends its last 10 minutes on a fresh review ([[S13]]) where Mock 2 optimizes. Mode 3 is a no-AI repo audit. It is not [[interview#mock-no-ai-algo|Mock 3]], the no-AI algorithms mock that the sprint uses on Oct 30–31.
:::

What we know about the formats, as of 2026-10-20:

- GDM's default is no AI tools in live interviews or interview tasks, unless you are told otherwise ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").
- Google pilots an AI-assisted round where you read, debug and optimize existing code with Gemini. No source names DeepMind ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20").
- The 60-minute "fix a bug, implement, optimize" format is **Meta's** documented AI-enabled round ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20"). We use it only as a practice format. It is not a Polaris format.

:::mock id="audit-agent" title="Mode 1 · AI-assisted, Meta's format, agent mode · 60 min" minutes="60"
This is **Meta's** documented AI-enabled round, used as a practice format ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20"). In Meta's real round the AI only chats; here you use an agent, so you can practice the full audit.

1. **0:00–0:05 · S0–S1.** Confirm fresh git: `git log --all --oneline | wc -l` prints 1. Run the suite twice. Say the baseline out loud: "N pass, M fail."
2. **0:05–0:20 · Phase 1, the bug (R1).** Start with S2–S4, short (about 5 minutes): `--collect-only`, `rg` for the issue's words, the caller list. Then the [[S3]] prompt. Check 3 claims on the bug's path. Say: "The agent says X. I ran Y and saw Z, so that claim is right or wrong." Then [[S6]] failing test. [[S7]] your guess out loud, then the agent's, then a probe. Gate 3 out loud. Small fix. [[S10]] read the whole diff. [[S11]] full suite.
3. **0:20–0:45 · Phase 2, the feature (R2).** Write a 3-line spec in a file first. [[S8]] plan prompt with guardrails. Cut anything outside the spec. Small edits. One attack test per spec line.
4. **0:45–0:57 · Phase 3, optimize.** Measure first: time the code on inputs 10× and 100× bigger than the tests use. Change one thing. Re-run every test. Measure again. Say both numbers.
5. **0:57–1:00 · Close.** Root cause, files changed, how you checked, and what you did not check.

**After the timer:** apply the hidden tests, then score the habits below.
:::

:::mock id="audit-chat" title="Mode 2 · AI-assisted, chat only · 60 min" minutes="60"
The AI sees only what you paste. You type every line of code. This is closest to the reported shape of Google's pilot (read, debug, optimize with Gemini) ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20"). The interface of that pilot is not public.

1. **0:00–0:05 · Baseline.** Suite twice. Say the numbers.
2. **0:05–0:15 · Map by hand.** No AI. Entry point, the request path, the issue's module. Five lines with file:line.
3. **0:15–0:20 · AI as a reader.** Paste ONE function with its line numbers (`nl -ba FILE | sed -n 'A,Bp'`). Put your question at the end of the paste. Ask: "Explain this step by step. Cite line numbers." Check two claims by running code.
4. **0:20–0:35 · Reproduce and locate.** Your hypothesis first, then ask the AI for its two best hypotheses with a command to test each. Write the failing test. Settle with a run.
5. **0:35–0:45 · Fix.** Type it yourself. Read your diff. Full suite. Commit the fix. Revert check: `git checkout BASE -- FILE`, run the new test (it must fail), `git checkout HEAD -- FILE`.
6. **0:45–0:55 · Fresh review.** Open a NEW chat. Paste only the spec and `git diff`. Use the Challenger prompt from [[S13]]. Reproduce one finding, or drop it with a reason.
7. **0:55–1:00 · Close.** Include one sentence on where the AI was wrong and how you caught it.
:::

:::mock id="audit-no-ai" title="Mode 3 · No AI · 60 min" minutes="60"
GDM's default for live interviews ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). No AI and no web search. You may run code and read the repo's own docs.

1. **0:00–0:05 · Baseline.** Suite twice. Say it.
2. **0:05–0:15 · Tool map.** Files and sizes, entry point, `--collect-only`, callers of the function in the issue, coverage of one test. Five lines with file:line.
3. **0:15–0:30 · Reproduce and locate.** Failing test. Two hypotheses, written down. Kill one with a probe or pdb. Gate 3 out loud.
4. **0:30–0:42 · Fix.** Smallest general fix. Full suite. Revert check.
5. **0:42–0:52 · Attack your own fix.** Two held-out inputs: one where two features meet, one that the old code already got right. Make them tests.
6. **0:52–0:57 · Self-review.** Read your diff with the Critic questions on paper: wrong results? crashes? broken documented behavior? deleted lines?
7. **0:57–1:00 · Close.** Root cause, change, checks, not checked.
:::

Score each mock with this tally. Then score the traits with the proxy rubric in [[interview#rubric|Interview modes and mocks]].

:::tally id="mock-habits" title="Audit habits under the clock"
- I ran the suite twice before any change and said the numbers out loud.
- I wrote my own hypothesis before I asked the AI.
- I checked at least two AI claims with a tool (a file:line or a run).
- I had a failing test before the fix, failing for the right reason.
- I read the whole diff, including deleted lines.
- I ran the full suite after my last edit.
- I did the revert-the-fix check.
- I said at least one thing I did not check.
:::

## Drills {#drills}

:::drill id="replay-41" title="Replay issue #41 without copying" time="2.5 h"
Rebuild the worked example in your own practice copy, but write your own tests. This drill is step 3 of the [full route](#how-to-use), after you apply. Do the bug once, here, not twice.

1. [[S0]]–[[S1]]: build `$W` and the baseline. Do not copy the test files from this page.
2. [[S6]]: write your own repro test. Check it fails for the right reason.
3. Type in the agent's first patch from [[S9]] by hand and commit it.
4. Before you read [[S12]] again, write your own attack tests. Aim at rule R2 and at inputs where two features meet.
5. Fix the cause. Run the revert-the-fix check.

**Done when:** your own attack tests fail on the agent's patch, pass on your fix, and fail on 0.6.1; your `audit.md` has every section filled.
:::

:::drill id="review-mode-lab-c" title="Review mode on three Lab C patches" time="45 min"
Open [[lab:lab-c]] in a practice copy. Pick three patches. For each one, run review mode: [[S0]], [[S1]] at the base, [[S10]]–[[S14]]. Use the claims table from [[S14]] on its transcript.

**Done when:** each patch has a verdict (flawed or clean), a mistake row, the step that caught it and one line of tool evidence, all within 45 minutes.
:::

:::drill id="gate-3-sentences" title="Two-sentence bug explanations" time="20 min"
Write Gate 3 for three bugs: the planted commit in [[lab:lab-e]], one bug from your own commit history, and one bug from a Lab C patch. Each explanation names the file:line, what goes wrong, and why the tests missed it.

Then test your writing. Open a fresh AI chat. Paste only your two sentences and the file. Ask it to point at the line.

**Done when:** all three explanations are at most two sentences, and the fresh chat finds the same line each time.
:::

:::drill id="mistake-card-recall" title="Mistake card from memory" time="10 min"
On paper, write M1–M10: the mistake, how to detect it, and the step that catches it. Then compare with the [card](#mistake-card).

**Done when:** at least 9 of the 10 rows are right, including the detection method and the step.
:::

:::drill id="fresh-review-run" title="Run the three review prompts for real" time="30 min"
Make `fix.diff` and `spec.txt` as in [[S13]], from your final fix in drill `replay-41`. Open a fresh session with a real model. Run the Critic, the Challenger and the Auditor. Reproduce each finding with a probe in both the base and the new worktree.

**Done when:** every finding is marked "reproduced" or "not reproduced" with the command you ran, style-only findings are dropped, and you wrote down which findings, if any, the model invented.
:::

:::drill id="audit-01" title="Your first real audit: audit-01.md" time="2 h"
Pick one agent-built commit in your own project, such as Gym or Paper Piano. This is the sprint drill: run the [5-move loop](#loop) on that commit and save the evidence as `audit-01.md`. Never open an agent inside your portfolio repository.

**1. Make the practice copy.** Fill in the two names in capitals. Your project is only read. The copy gets fresh git with two commits: `base` (the parent) and the agent commit.

```bash
PORTFOLIO=PATH_TO_YOUR_PROJECT; C=COMMIT_SHA
W=$(mktemp -d -t audit01); mkdir "$W/repo" "$W/notes" "$W/scratch" "$W/private"
git -C "$PORTFOLIO" archive "$C^" | tar -x -C "$W/repo"
cd "$W/repo" && git init -q && git config user.name practice && git config user.email practice
git add -A && git commit -qm base && git tag base
git -C "$PORTFOLIO" diff --binary "$C^" "$C" | git apply && git add -A && git commit -qm "agent commit"
git log --oneline; git diff --stat base
```

`git archive` writes the parent's files without history. `--binary` lets `git apply` carry images and deleted files too. Keep the quotes in `"$C^"`: some zsh setups treat a bare `^` as a pattern. Everywhere this chapter writes `v0.6.1`, you write `base`.

**2. Run the five moves.** Use `HEAD` as the fix and `base` as the old code. For the test commands of a JavaScript project, and the "zero tests is not a pass" trap, see [[interview#star|STAR stories from your own commits]].

**If the project has no tests for this code.** Your [[S1]] baseline is the build plus any check script the project has (look under `scripts` in `package.json`). Record each command and its exit code. [[S6]] then means writing the first test for the commit's pure logic, for example a `node --test` file for the push-up counter's state machine. It must fail at `base` and pass on the agent commit.

**If there is no saved transcript.** Write "no transcript" in [[S14]]. Audit the claims in the commit message instead: `git log -1 --format=%B HEAD`.

**Done when:** each of the 5 moves has at least one piece of tool evidence in `audit-01.md` (a command and what it printed), the revert check ran, and `mistakes.csv` has at least one row, or a written note "no mistake found" plus the attacks you tried. Stretch goal, after you apply: fill every section of the [template](#audit-template) in review mode ([[S0]], [[S1]] at `base`, [[S2]]–[[S4]], [[S6]], [[S10]]–[[S15]]).
:::

## Sources

- ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19") Google Careers: Research Engineer, Polaris (job 114077679900074694).
- ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20") Google DeepMind, "Interviewing at Google DeepMind": AI policy for interviews.
- ^[reported](https://www.entrepreneur.com/business-news/google-is-testing-a-new-rule-transform-job-interviews "2026-10-20") Google's AI-assisted code comprehension pilot (summary of Business Insider).
- ^[reported](https://www.hellointerview.com/blog/meta-ai-enabled-coding "2026-10-20") Meta's AI-enabled coding round.
- ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20") Mechanize, "How our interview process works" (Mechanize, not Polaris).
- ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20") Wang, Pradel, Liu: PatchDiff, "Are Solved Issues in SWE-bench Really Solved Correctly?"
- ^[confirmed](https://metr.org/blog/2025-08-12-research-update-towards-reconciling-slowdown-with-time-horizons "2026-10-20") METR: algorithmic vs holistic evaluation of agent PRs.
- ^[confirmed](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ "2026-10-20") METR: many test-passing PRs would not be merged.
- ^[confirmed](https://cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf "2026-10-20") Inozemtseva and Holmes: coverage is not strongly correlated with test-suite effectiveness.
- ^[confirmed](https://www.cs.toronto.edu/~fanl/papers/kali-issta2015.pdf "2026-10-20") Qi, Long, Achour, Rinard: plausible patches in generate-and-validate repair.
- ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20") SWE-bench issue #465: repo-state loopholes.
- ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20") Ludwig et al.: shortcutting the fix in SWE benchmarks.
- ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20") Cursor: reward hacking on coding benchmarks.
- ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20") Liu et al.: failures in automated issue solving (localization, repair, verification).
- ^[confirmed](https://arxiv.org/abs/2511.00197 "2026-10-20") Majgaonkar et al.: failed trajectories usually find the right files.
- ^[confirmed](https://arxiv.org/abs/2406.12952 "2026-10-20") SWT-Bench: reproduction tests as a filter on fixes.
- ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20") ImpossibleBench: test modification and the abort option.
- ^[confirmed](https://www.anthropic.com/claude-3-7-sonnet-system-card "2026-10-20") Claude 3.7 Sonnet system card: excessive focus on passing tests.
- ^[confirmed](https://www.anthropic.com/research/emergent-misalignment-reward-hacking "2026-10-20") Anthropic: emergent misalignment from reward hacking.
- ^[confirmed](https://arxiv.org/abs/2511.21654 "2026-10-20") EvilGenie: reward hacking by coding agents, incl. Gemini CLI.
- ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20") Transluce: coding agent misalignment in the wild (overselling).
- ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20") Claude Code best practices: fresh-context review, the two-corrections rule.
- ^[confirmed](https://arxiv.org/abs/2310.01798 "2026-10-20") Huang et al.: LLMs cannot self-correct reasoning yet.
- ^[confirmed](https://arxiv.org/abs/2404.13076 "2026-10-20") Panickssery, Bowman, Feng: LLM evaluators favor their own outputs.
- ^[confirmed](https://arxiv.org/abs/2407.00215 "2026-10-20") OpenAI (CriticGPT): LLM critics help catch LLM bugs.
- ^[confirmed](https://arxiv.org/abs/2102.11378 "2026-10-20") Petrović et al.: practical mutation testing at Google.
- ^[confirmed](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen "2026-10-20") Spracklen et al.: package hallucinations by code LLMs.
- ^[confirmed](https://www.usenix.org/conference/atc12/technical-sessions/presentation/serebryany "2026-10-20") Serebryany et al.: AddressSanitizer.
- ^[confirmed](https://git-scm.com/docs/git-bisect "2026-10-20") git-bisect documentation: `run` and exit code 125.
- ^[confirmed](https://deepmind.google/discover/blog/introducing-codemender-an-ai-agent-for-code-security/ "2026-10-20") Google DeepMind: CodeMender.
- ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20") Terminal-Bench 2.0 paper: trace failure taxonomy.
- ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20") Antigravity CLI modes and permissions (docs; not run).
- ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20") Antigravity CLI headless mode and the `status` field (docs; not run).
- ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20") Antigravity CLI features: `/rewind`, `/fork`, `/diff` (docs; not run).
- ^[confirmed](https://antigravity.google/docs/cli/best-practices "2026-10-20") Antigravity CLI best practices (docs).
- ^[confirmed](https://antigravity.google/docs/cli/gcli-migration "2026-10-20") Antigravity CLI migration: reads GEMINI.md and AGENTS.md (docs).
- ^[confirmed](https://antigravity.google/docs/subagents/ "2026-10-20") Antigravity subagents, incl. the built-in `research` subagent (docs).
- ^[confirmed](https://antigravity.google/docs/teamwork/ "2026-10-20") Antigravity agent teams: Critic, Challenger, Auditor (paid preview; docs).
- ^[confirmed](https://geminicli.com/docs/reference/commands "2026-10-20") Gemini CLI commands: `/memory show`.
- ^[confirmed](https://geminicli.com/docs/core/subagents/ "2026-10-20") Gemini CLI subagents: `codebase_investigator`.
- ^[confirmed](https://developers.googleblog.com/evolving-spec-driven-development-conductor-now-supports-antigravity/ "2026-10-20") Google: Conductor, spec.md and plan.md in the repo.
- ^[confirmed](https://docs.python.org/3/library/datetime.html "2026-10-20") Python docs: `datetime.timestamp()` on naive datetimes; `datetime.fromisoformat()`.
- ^[confirmed](https://www.rfc-editor.org/rfc/rfc3339 "2026-10-20") RFC 3339, section 5.6: lowercase `t` and `z` are allowed.

:::check
- Run S0 and S1 on a repo you have never seen, from memory, in 10 minutes: fresh git, canary, baseline twice with exit codes, test hashes.
- Explain with this chapter's example why 94 passing tests and 97% statement-and-branch coverage did not prove the fix right.
- Name the four gates, the step of each, and what you do when each one fails.
- Recite the mistake card: each row, how you detect it, and the step that catches it.
- Write a metamorphic test, a differential test and a revert-the-fix check for a fix of your own.
- Find the first uncorrected wrong turn in an agent transcript and tag its phase.
:::
