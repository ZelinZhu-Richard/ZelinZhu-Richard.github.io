---
title: Capstone: Chronos
short: Capstone: Chronos
summary: Know what Chronos is, what its validation and pilot numbers say and do not say, and how to make it yours. You will pass the ownership gate, plan the Gemini runs, and know what to send the recruiter and when.
---

:::selfcheck
- Say the Chronos status line, word for word. || "v0 is agent-built. It becomes your project when you pass this gate." "This gate" is the ownership gate: four steps you do yourself.
- Pilot attempt a02 passed the gate and every check except one milestone-2 check. What reward did it get? || 0.65. The reward is gate × (0.15·m1 + 0.35·m2 + 0.20·m3 + 0.30·m4), and a milestone counts only if all of its checks pass. So 1 × (0.15 + 0.20 + 0.30) = 0.65.
- The grader rejected 20 of 20 hand-written wrong solutions. What is its false-accept rate? || You cannot say. The corpus is hand-picked, so it gives a count, not a rate. Say "rejected 20 of 20 hand-written wrong solutions (hand-picked; counts only)".
- The mutant result is "264 of 264 killed". Why is there no confidence interval, and what does it not say? || It is a census: every applicable site of one fixed operator set in the three references' added lines. Nothing was sampled, so there is no sampling interval. 57 survivors were adjudicated and left the denominator (45 equivalent, 12 out of scope). It says nothing about bugs outside that operator set.
- 6 of 8 pilot attempts got full reward. Give the Wilson 95% interval and the full frame. || 0.41 to 0.93. Frame: 8 attempts by one agent configuration (Claude subagents in a Claude Code workflow, not Gemini) on one task. The interval assumes independent attempts with one fixed success chance.
- What does pilot 1's transcript scan show, word for word? || "No matches were found in the inspected tool-call inputs for the listed indicators. Technical isolation was not enforced during pilot 1, and the scan does not establish absence of private-data access." Never say "0 breaches" or "all attempts valid".
- Can you compare a Gemini run on v1 with pilot 1? || No. Pilot 1 is exploratory: it ran on the ticket before the J6 fix, without a sandbox, through a Claude Code workflow. Model comparisons run against the v1 freeze manifest.
- When does the Chronos link go to the recruiter? || Not with the Oct 23 application. Send the public part after you pass the ownership gate and the Day 7 leak check, once a recruiter is in contact.
:::

## Why Polaris cares

Polaris engineers build tasks that measure Gemini on long-horizon software engineering, and they look for the weaknesses of the latest models ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19").
The team builds a small number of realistic tasks by hand, about one week each from idea to approval (our paraphrase of the posting) ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19").
Chronos is one such task in miniature: a ticket, a realistic repository, a hidden grader whose validity was measured, and a pilot of real agent attempts.
It is the first of the three signals in [[start-here]].
GDM's default is no AI tools in interviews ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20"). There, only the parts you understand count, and the ownership gate makes sure you understand them.

## Status {#status}

**v0 is agent-built. It becomes your project when you pass this gate.** "This gate" is [the ownership gate](#ownership-gate). The README, `OWNERSHIP.md` and [[start-here#honesty|Start here]] use the same sentence.

- **Who built it:** AI agents (Claude models in Claude Code workflows), directed by you, on 2026-10-20 and 2026-10-21.
- **What you have not done yet:** written its code, run its grader yourself, or run Gemini on it.
- **Build time** is in `_build-notes/BUILD_LOG.md`. It is the machines' time, not your prep time ([[tracker#two-clocks|two clocks]]).
- **The honesty rule** in [[start-here#honesty|Start here]] applies to every sentence you say about Chronos.

:::warn title="Until you pass the gate"
Say "Agents built v0 under my direction." Never say "I built it". Keep Chronos off the Oct 23 résumé. [[defend-it#q42|Playbook Q42]] has the answer outline for "What did you do yourself?". `DEFEND.md` Q26 is the Chronos version. The two question banks number their questions separately.
:::

:::note title="Where the numbers on this page come from"
Most Chronos numbers here come from two local files in the capstone folder: `results/VALIDATION-SUMMARY.md` and `results/PILOT-SUMMARY.md`. A few come from `task.toml`, the build log, or commands we ran on 2026-10-21 (marked "Real output"). Local files have no public URL, so these numbers carry no badge. The build agents measured them on 2026-10-21. You have not reproduced them yet. Gate item 3 makes you re-run part of them.
:::

## What Chronos is {#what}

Chronos is one task in the Harbor layout: `instruction.md`, `task.toml`, an `environment/` with a Dockerfile, and `tests/test.sh` ^[confirmed](https://docs.harborframework.com/tasks/overview "2026-10-20"). Harbor is the public task format of the Terminal-Bench team. Polaris's internal format is unknown, so Harbor is a stand-in ^[inference](- "2026-10-21"). The Harbor path itself is untested: nobody has run the verifier inside the task's image.

The task is called `chronos-pit`. Its title is "Make chronoflow point-in-time correct".

- **The repository.** `chronoflow` is a small time-series feature and backtest library in Python and pandas. It has data loaders, calendars, time zones, features, joins, a feature pipeline, cross-validation splitters, a backtester and a CLI. `src/chronoflow/` holds 1,532 lines of Python (counted with `wc -l` on 2026-10-21, blank lines and docstrings included). The repo has 140 visible tests and 42 commits of history up to the base commit. An agent gets that history only through `python -m harness prepare`. The Harbor image copies plain files, and it has no git.
- **The ticket.** `instruction.md` reads like a real bug report: the team's research numbers look too good. It describes behavior, not files, as DeepSWE's tasks do ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). Every rule has an id: T1–T7 for time, then Z, J, P, S, B and K rules for each part.
- **The one rule.** A computation that runs at time T may use only what was known at T. The ticket uses four times: event time, publication time, vintage (one published value; a revision is a new vintage) and as-of time. [[grader-validity#four-times|The four times]] explains them. Its table calls the third time "revision availability"; that is the same thing as the ticket's vintage.

The four milestones. `task.toml` and `reward.json` call them `M1` to `M4`. This site says "milestone 1" to "milestone 4" in prose, because M plus a number means a [[agent-patch-audit#mistake-card|mistake-card]] row here.

| Milestone | What the agent must do | Weight |
|---|---|---|
| 1 | Fix `zscore`: use only the rows up to each row (an expanding window), not the whole series | 0.15 |
| 2 | Add `asof_join`: for each row, the latest available vintage of the latest observation | 0.35 |
| 3 | Add a `join` field to `FeaturePipeline` (`"naive"` by default, `"asof"` opt-in); `default_pipeline()` uses `"asof"` | 0.20 |
| 4 | Add `PurgedWalkForwardSplit` (purge and embargo in time units) and `Backtester.run(label_horizon=...)` | 0.30 |

The reward formula, as `VALIDATION-SUMMARY.md` writes it:

```text
reward = GATE × (0.15·M1 + 0.35·M2 + 0.20·M3 + 0.30·M4)
```

Each milestone term is 1 only if every check of that milestone passes. The **gate** is an all-or-nothing precondition: the 140 original visible tests plus API and unchanged-behavior checks. If any of them fails, the reward is 0.

**How hard is it?** `task.toml` estimates 1–2 days for a strong engineer. That is the build agents' guess. No human has tried the task, so it is not a [[task-design#human-baseline|human baseline]]. The pilot agents took 27–33 minutes each.

## Where it lives on your machine {#where}

**Public part:** `workspace/polaris-capstone/`. It is its own local git repo, with no remote. The portfolio repo's committed `.gitignore` excludes it and the private folder, and the playbook's publication tests check that no tracked file and no built page holds a private path or the canary. Ignore rules are not access control. They keep files out of a commit; they do not hide anything, and they do not remove a file that was tracked before.

| Path (inside the capstone folder) | What it is |
|---|---|
| `tasks/chronos-pit/instruction.md` | the ticket the agent reads |
| `tasks/chronos-pit/task.toml` | Harbor metadata: milestones, weights, limits (2 CPUs, 4 GB memory, no network) |
| `tasks/chronos-pit/gvt.toml` | the only config: gvt, the harness and every validation run read it. (An older duplicate in `gvt/configs/` was removed on 2026-10-21 after a sandboxed grade showed it lacked the grader's `--bundle` argument.) |
| `tasks/chronos-pit/environment/` | `repo/` (the base snapshot), `history.bundle` (its git history), `BASE_COMMIT`, `Dockerfile` |
| `tasks/chronos-pit/tests/test.sh` | the Harbor verifier entry: it calls the private grader and writes the reward |
| `gvt/` | the Grader Validity Toolkit: runs a grader on solution sets and writes the Grader Validity Card |
| `harness/` | the agent runner: a Docker sandbox per attempt and per grade, workspaces, agent adapters, statistics |
| `harness/SECURITY-EVIDENCE.md` | before/after evidence for the security fixes and the sandbox |
| `release/` | the v1 freeze manifest, the script that writes it, and the review-bundle script |
| `results/` | `VALIDATION-SUMMARY.md` and `PILOT-SUMMARY.md` |
| `_build-notes/` | build log, restart note, plans and workflow scripts from the build |
| `.envbuild/` | the authoring tree and script that rendered the environment repo and its history |

The capstone docs sit at the top of the same folder: `README.md`, `DEFEND.md`, `OWNERSHIP.md` and `EXTEND.md`. The tech report is `REPORT.md` (v0); Day 6 of the extension turns it into v1 with your own runs.

**Private part:** your private folder (kept out of git). It holds:

- the hidden grader and the independent oracle (a slow, obviously correct implementation written from the spec alone);
- the three reference solutions and the 20 wrong solutions;
- the generated refactor variants and mutants;
- the raw validation records, the full Grader Validity Card and the adjudications.

These name hidden checks or contain solutions, so they never go public. Every private file carries a canary line: a unique string that marks it as private, so a leak can be found by search ([[task-design#canary-strings|canary strings]]).

Three rules:

1. Never open an agent inside the capstone folder or your private folder. Agents work only in temp copies that the harness makes.
2. Commands below that need the private folder use a shell variable `PRIV`. Set it in your own terminal and do not export it. An unexported variable stays out of the environment of every program you start, agents included.
3. Output that names a hidden check (grader records, `grade.json`, grader logs) stays in your private folder. Never paste it into a public note, a chat with an AI, or this site.

## Run it yourself {#run}

The capstone's `README.md` has every command, with its real output. Here are the ones you need first. Start from the portfolio root, in zsh. If `.venv` is missing, make it with step 1 of the README first.

```bash
cd workspace/polaris-capstone
source .venv/bin/activate
export PYTHONDONTWRITEBYTECODE=1
python --version
python -m pytest -q -p no:cacheprovider harness/tests gvt/tests
(cd tasks/chronos-pit/environment/repo && python -m pytest -q -p no:cacheprovider)
```

Real output on 2026-10-21: `Python 3.13.9`. The toolkit run started at 17:58:47 UTC, on capstone commit `c1cbcf1` with the uncommitted sandbox changes in the working tree, and printed `148 passed in 75.35s`. That is 76 harness tests (31 of them test the sandbox and need Docker) and 72 gvt tests. The base repo printed `140 passed in 2.29s`. This page used to show 42 harness tests; that count is from before the security fixes and the sandbox. Quote a test count only with its commit, command and date.

A clean git copy of the base commit, for diffs and experiments. It needs no private files:

```bash
BASE_COPY="$(mktemp -d)/base"
python -m gvt materialize --config tasks/chronos-pit/gvt.toml --dest "$BASE_COPY"
git -C "$BASE_COPY" log --oneline | wc -l
```

Real output on 2026-10-21: `42`. `git -C "$BASE_COPY" rev-parse HEAD` printed the commit in `BASE_COMMIT`. README step 3 shows how to make an isolated workspace with `python -m harness prepare`, the way the pilot did.

Grade one patch. This needs the private grader. `PRIV` is the folder that holds `grader/run_grader.py` and `corpora/`:

```bash
PRIV='PASTE-YOUR-PRIVATE-FOLDER'
mkdir -p "$PRIV/runs"
CHRONOS_GRADER_TIME_SCALE=2 python -m gvt grade --config tasks/chronos-pit/gvt.toml --private-root "$PRIV" \
  --patch "$(mktemp)" --log-dir "$PRIV/runs/do-nothing" > "$PRIV/runs/do-nothing.json"
```

`mktemp` makes an empty file, so this grades the **do-nothing baseline**: an attempt that changes nothing. Expect reward 0, because the base passes the gate but no milestone ^[inference](- "2026-10-21"). Validation run 5 did not report this baseline. Run it yourself; it is the first line of your own evidence. `CHRONOS_GRADER_TIME_SCALE=2` only widens time limits, as in run 5. We did not run this command: this page was written without access to the private folder. One grader run took a median of 28 seconds in run 5.

`gvt grade` runs a patch's code on your machine, as you. That is fine for an empty patch, your own patches and the private solution sets. Grade agent patches in the grader sandbox instead ([the sandbox](#sandbox)). The sandboxed Chronos grade is untested, so first check that a reference reaches 1.00 there:

```bash
CHRONOS_GRADER_TIME_SCALE=2 python -m harness grade-patch --config tasks/chronos-pit/gvt.toml \
  --private-root "$PRIV" --patch "$PRIV/corpora/reference/ref-a/patch.diff" \
  --log-dir "$PRIV/runs/check-ref-a" --grader-pass-env CHRONOS_GRADER_TIME_SCALE
```

Expect `"reward": 1.0` and one private mount, `.../grader -> /private/grader ro`. Adjust the patch path if your layout differs. Not run by us.

The statistics for the pilot:

```bash
python -m harness stats --n 8 --c 6 --k 1 3
```

Real output on 2026-10-21 (some lines left out):

```text
  "frame": "8 attempts by one agent configuration on one task (i.i.d. assumed)",
  "rate": 0.75,
  "wilson": [
    0.40927543031016905,
    0.9285207872478909
  ],
  "pass_at_k": {
    "1": 0.75,
    "3": 1.0
  },
  "pass_hat_k_unbiased": {
    "1": 0.75,
    "3": 0.35714285714285715
  }
```

pass@3 is 1.0 here only because 2 failures cannot fill 3 draws. pass^3 (all 3 drawn attempts succeed) is 0.36. That is the reliability number ([[runs-and-weaknesses#pass-k|pass@k and pass^k]]).

## Validation results {#validation}

Source: `results/VALIDATION-SUMMARY.md`. **Validation run 5**, 2026-10-21, 11:24–11:42 UTC, on the grader and solution sets that ship. The ticket gained one J6 sentence after run 5 (see the pilot); the grader did not change.

The setup:

- **Grader:** 1,044 hidden checks plus a gate. Checks per milestone: milestone 1 has 174, milestone 2 has 334, milestone 3 has 84, milestone 4 has 249. The gate has 335: the 140 original visible tests plus API and unchanged-behavior checks. 8 more diagnostic checks are reported but never scored.
- **Machine:** CPython 3.13, pandas 2.2.3, numpy 2.2.2, pytest 8.3.4, macOS arm64, 14 cores. `CHRONOS_GRADER_TIME_SCALE=2` widened the time limits only.
- **Repeats:** references, wrong solutions and the author base 3 times each; refactor variants 2 times; mutants once.

Words you need for the table:

- A **mutant** is a copy of a reference with one small automatic change, for example `<` to `<=`. It is **killed** when the grader scores it worse than its parent.
- An **equivalent** mutant behaves exactly like its parent on the specified inputs, so no correct grader can kill it. An **out-of-scope** mutant changes only code the spec does not cover.
- A **refactor variant** is a reference with names or order changed, not behavior. A good grader gives it the same score.

| Solution set | Sampling frame | Solutions | Runs | Outcome |
|---|---|---|---|---|
| References (three authors: vectorized pandas, pure-Python core, vintage table) | hand-picked | 3 | 9 | accepted 3 of 3; every run 1.00 |
| Author base (diagnostic only, not a reference) | hand-picked | 1 | 3 | accepted 1 of 1 |
| Hand-written wrong solutions (18 subtle semantics or leakage bugs, 2 cheats) | hand-picked | 20 | 60 | rejected 20 of 20; each fails the milestone it targets; none reaches 1.00 |
| Refactor variants (fixed transform set gvt-ref-1 over the three references) | census of the generated set | 15 | 30 | 15 of 15 had the same outcome as their parent (all 1.00) |
| Mutants (fixed operator set gvt-mut-1 on every applicable site in each reference's added lines) | census of the enumerated space | 321 | 321 | 264 killed; 57 survived: 45 equivalent (proof per entry), 12 out of scope |

What you may say, word for word:

- **Hand-picked sets give counts, not rates.** "Rejected 20 of 20 hand-written wrong solutions" does not estimate how often the grader would accept an arbitrary wrong solution ([[grader-validity#frame-hand-picked|frame 1]]).
- **The mutant result is a census.** After the adjudicated exclusions, 264 of 264 mutants were killed. Nothing was sampled, so there is no sampling interval. It says that this operator set, applied to these three references, produced no non-equivalent mutant the grader accepts. It is not an error rate for wrong solutions in general ([[grader-validity#frame-census|frame 2]]).
- **Keep the evidence behind the exclusions.** Preserve the 321 mutants and the written reasons for the 45 equivalent and 12 out-of-scope exclusions. Agents wrote those reasons. The next validity step is an independent review of those exclusions, and fresh solution families that were not used to refine the grader. Three agent-written references with different briefs give useful diversity, not proof of independent errors.
- **Stability:** 0 flaky solutions (at outcome or test level), 0 patch-apply failures, 0 grader errors, 0 runs that hit a time limit. Mutants ran only once, so this says nothing about mutant flakiness. Three clean repeats do not prove determinism either; gvt's own README says so.
- **Timing:** median 28 seconds per grader run (max 46 seconds), with 8–12 runs in parallel on a 14-core Mac. The task's budget is under 120 seconds. Nobody measured it on the task's 2-CPU target. The Mac was not idle. The build log has the 8 pilot agents running on it from 07:30 to 08:04 EDT, during most of run 5 (07:24–07:42 EDT). So both the grader timings and the pilot's 27–33 minutes were measured under that shared load. `VALIDATION-SUMMARY.md` now says the same.

### How the grader changed in five runs {#grader-history}

| Run | What it found | What changed before the next run |
|---|---|---|
| 1 | Two references scored 0.85: they emitted a warning the spec forbids. Mutants exposed 13 real grader gaps in 4 classes; 14 more mutants were masked by the reference bug. | Reference fixes; 30 new hidden checks (1,002 to 1,032); the z-score comparison domain stated in the spec; an opt-in time-scale knob after load-induced timeouts |
| 2 | One new grader gap (a one-row frame with a missing timestamp). A reference crash on an extreme input, found by differential testing between the three references; the grader did not catch it. | ref-a fixed; 12 new hidden checks (1,032 to 1,044); spec clarifications |
| 3 | Clean on that state: 259 of 259 eligible mutants killed | Adjudications re-verified; two reference patches revised; spec wording clarified; mutants regenerated |
| 4 | Interrupted by a machine restart; not used | — |
| 5 | Final, on the shipped state: clean, 264 of 264 eligible mutants killed | After the pilot: one sentence added to ticket rule J6. The grader did not change, so run 5 still describes it. |

Two lessons for Polaris work:

1. Validation found bugs in the "correct" solutions, not only in the grader. In run 1, two of three references broke the spec. This is why you need at least three independent references ([[grader-validity#independent-correct|three independent implementations]]).
2. Comparing the references with each other found a crash that the grader missed. Differential testing between correct solutions is a cheap extra check.

### Known limits {#validation-limits}

From the same file, in short:

1. Out-of-domain inputs are not tested: spans near the 64-bit time limit, or an embargo longer than a 200-year span. The references differ there (one raises, one wraps). The spec limits the tested domain.
2. Two mutant equivalences hold only on the stated value domain.
3. The `min_periods=2` default is not checked by signature. Three mutants stay equivalent by decision.
4. The timings come from a 14-core Mac, not the task's 2-CPU target.
5. AI agents wrote all solution sets under the same plan. "Independent" means separate authors with separate design briefs who did not see each other's code. It does not mean separate organizations.

Expect an interviewer to push on limit 5 ([[defend-it#q24|playbook Q24]] on the oracle, and `DEFEND.md` Q28).

:::note title="Record note (resolved)"
An early version of `_build-notes/RESTART.md` said two run-2 findings stayed open. That note was wrong: it was written before the run-3 records were read. The main build session checked the private records on 2026-10-21. The one-row grader gap is caught by a gate check added in round 2 (1,032 → 1,044 checks, before run 3); in run 5 the mutant that reintroduces the gap scores 0. The reference crash was fixed in round 2; ref-a scores 1.00 in run 5. `RESTART.md` is corrected.
:::

## Pilot results {#pilot}

Frame first: **8 attempts by one agent configuration (Claude subagents in a Claude Code workflow, not Gemini) on one task.** Source: `results/PILOT-SUMMARY.md`, pilot 1, 2026-10-21. The solver agents ran on Claude Opus 5.5 (`claude-opus-5-5`, the build session's model) at the session's default effort; say exactly that when an interviewer asks "which Claude?".

:::warn title="Pilot 1 is exploratory"
It ran on the ticket before the J6 fix, on the host, without a sandbox. It is not an experiment on the corrected task (v1), and it is not comparable with v1 runs. Use it for what it found: one spec–grader gap and one verification gap.
:::

- **Workspaces:** each attempt got its own workspace from `python -m harness prepare`. It held a fresh clone of the repo history up to the base commit, plus the ticket, which git ignores. The history scan found no solution code, no canary and no private path in the 42 commits.
- **Prompt:** a plain engineering request. Read the ticket, implement everything, work only inside the workspace, use a given Python environment, do not modify existing tests, commit, and write `NOTES.md`. It did not say that hidden tests would grade the work. The prompt named `instruction.md`, the file the workspace held. `_build-notes/pilot-workflow.js` is the script that ran.
- **Time:** no time limit. All 8 ran in parallel. Each took 27–33 minutes and 60–100 tool calls.
- **Grading:** the run-5 grader, twice per attempt. Both runs gave the same result for every attempt, so 0 of 8 attempts were flaky.
- **Ticket version:** the pilot ran on the ticket **before** the J6 fix described below.

| Attempt | Reward (2 runs) | What failed | Patch size |
|---|---|---|---|
| a01 | 1.00, 1.00 | — | 17 files, +1946 −41 |
| a02 | 0.65, 0.65 | milestone 2 (1 check) | 17 files, +2023 −52 |
| a03 | 1.00, 1.00 | — | 17 files, +1943 −45 |
| a04 | 1.00, 1.00 | — | 17 files, +1839 −49 |
| a05 | 1.00, 1.00 | — | 17 files, +1965 −55 |
| a06 | 1.00, 1.00 | — | 17 files, +1839 −49 (different code from a04) |
| a07 | 1.00, 1.00 | — | 18 files, +1866 −56 |
| a08 | 0.50, 0.50 | milestone 1 (1 check) and milestone 2 (1 check) | 17 files, +1905 −64 |

Every attempt passed the gate. Every attempt passed every knowledge-time future-invariance check and every differential check against the oracle, except the single checks in the table.

| Count | Full reward | Rate | Wilson 95% interval | pass^3, unbiased | Mean reward |
|---|---|---|---|---|---|
| Raw | 6 of 8 | 0.75 | 0.41–0.93 | 0.36 | 0.89 |
| With the under-specified check discounted | 7 of 8 | 0.875 | 0.53–0.98 | 0.63 | 0.98 |

The statistics assume the 8 attempts are independent, with one fixed success chance. With n = 8 the interval is wide: this configuration solves the task fully somewhere between about 41% and 93% of the time. It says nothing about Gemini, other prompts or other tasks. The mean reward hides that a02 lost one whole milestone and a08 lost two.

### What failed, and the verdicts {#pilot-failures}

1. **a02 and a08, one milestone-2 check.** The release table had an index with the same name as one of its columns. Both joins grouped or sorted by `series_id`, and pandas raises an "ambiguous" error when the index has that name. The ticket said the new join follows the conventions of `naive_join` and ignores other columns. It never said the table might be indexed like that. The rule existed only in the private API contract. **Verdict: a spec–grader gap, found by the pilot.** Two of eight attempts lost 0.35 for a rule the ticket did not state clearly. Fix: one sentence in rule J6 now states it. The grader did not change.
2. **a08, one milestone-1 check.** An empty frame must give an empty Series with no warning. Rule Z5 says this explicitly. a08's `zscore` emits a pandas `FutureWarning` on an empty frame, through a base-repo helper that checks sort order. Its transcript shows 32 test runs with warnings as errors and 14 probes of empty inputs, but never this exact input. **Verdict: a true reject, a verification gap.** a01 found and fixed the same helper during its attempt.
3. **No other failures.** All eight attempts got the core point-in-time logic right: publication-time availability, revisions, purge and embargo. For this configuration the task is moderately hard. Its difficulty sits in edge conditions, not in the main idea.

So the strongest supported story is about **grader specification and verification quality**: one check did not follow from the ticket, and one agent did not test an input the ticket names. It is not a demonstrated temporal-reasoning weakness. All 8 attempts got the core logic right.

The main lesson: **a check must follow from the task text.** Pilots find the places where it does not. Adjudicate every failure against the ticket before you call it a model weakness ([[runs-and-weaknesses#labeling|labeling transcripts]]).

These verdicts are only part of what the plan asks for. The build agents made them; no separate reviewer has checked them. The plan also wants a label per failure: first wrong turn, phase and mistake-card row. The capstone README has that table, under Pilot 1. Two labels follow from the summary: a08's milestone-1 failure is in the verify phase, and the J6 failures are a task bug, not an agent mistake. The first wrong turn needs the private transcripts, so it is still pending.

The ticket changed after the pilot. So the Claude numbers describe the old ticket, and Gemini runs on the new ticket are not a like-for-like comparison ^[inference](- "2026-10-21").

### Isolation and overselling {#pilot-isolation}

- **Workspaces:** 0 of 8 contained the private canary prefix or a private path marker.
- **Transcripts:** every tool-call input of all 8 agents was scanned. The scan looked for private markers, for other attempts' workspace paths, and for `git log --all`, `git fetch`, `curl`, `wget` and `pip install`.
- **The result, in the words to use:** No matches were found in the inspected tool-call inputs for the listed indicators. Technical isolation was not enforced during pilot 1, and the scan does not establish absence of private-data access.
- **What this means:** the scan did not read tool outputs. Instructions and keeping private files out of the workspaces were the only barriers. This does not show that an attempt cheated. It limits what the evidence supports. Runs after the pilot use [the sandbox](#sandbox).
- **Overselling** ([[M6]]): all eight final summaries claimed that the full test suites passed, also with warnings as errors. The build's re-run (`pytest -q -W error` in each workspace) confirmed it for all eight, with 219–272 tests each. No attempt claimed hidden-test results. The two failures came from requirements the agents' own tests did not cover, not from false claims.

## The ownership gate {#ownership-gate}

The gate's own file is `workspace/polaris-capstone/OWNERSHIP.md`. It has the exact commands, what to keep, and a gate record table. This section gives the four items as drills. When this page and `OWNERSHIP.md` differ, `OWNERSHIP.md` wins.

Rules for all four:

- Do items 1–3 yourself, with no AI assistant. Do item 4 aloud, with no notes. This is the whole point.
- Evidence goes into `$PRIV/gate/`: grade records, check names, grader diffs. They name hidden checks.
- Keep a public-safe log too, for example `~/polaris-notes/gate-log.md`: one line per item with the date, your minutes and what you did, without any check name.
- Tick a drill only when its "Done when" line is true. Sprint dates: items 1–2 on Oct 24–27, items 3–4 on Oct 30–31 ([[tracker#sprint|the tracker]]).

The setup, from `OWNERSHIP.md`:

```bash
cd workspace/polaris-capstone
source .venv/bin/activate
export PYTHONDONTWRITEBYTECODE=1
PRIV='PASTE-YOUR-PRIVATE-FOLDER'
BASE="$(cat tasks/chronos-pit/environment/BASE_COMMIT)"
mkdir -p "$PRIV/gate"
```

:::drill id="capstone-gate-1-reproduce" title="Gate item 1: reproduce a grader-detected failure" time="60 min"
1. Pick pilot attempt a08. It has both kinds of failure: a true reject in milestone 1 (rule Z5) and a spec–grader gap in milestone 2 (rule J6). a02 has only the gap.
2. The capstone folder holds no pilot patches. Copy a08's patch from your private pilot records to `$PRIV/gate/a08.patch`, and record its hash with `shasum -a 256`.
3. Run the grader yourself, twice, in the grader sandbox. a08's patch is agent-written code, so do not grade it with `gvt grade` on your machine. First check that a reference reaches 1.00 this way (`OWNERSHIP.md`, step 1.0). Each run writes `grade.json` into its own new `--log-dir`:

   ```bash
   for k in 1 2; do
     CHRONOS_GRADER_TIME_SCALE=2 python -m harness grade-patch --config tasks/chronos-pit/gvt.toml \
       --private-root "$PRIV" --patch "$PRIV/gate/a08.patch" --log-dir "$PRIV/gate/a08-run$k" \
       --grader-pass-env CHRONOS_GRADER_TIME_SCALE
     echo "run $k exit $?"
   done
   ```

4. List the failing checks in each `$PRIV/gate/a08-run$k/grade.json` with the short script in `OWNERSHIP.md`, step 1.3. We tested `harness grade-patch` and that script on the toy task on 2026-10-21, not on Chronos. Expect reward 0.5 in both runs, one failing check in milestone 1, one in milestone 2, and everything else passing. If you see anything else, stop. The patch, the grader or the environment differs from the pilot.
5. Reproduce it outside the grader. Materialize a08's code with `python -m gvt materialize --config tasks/chronos-pit/gvt.toml --dest "$A08" --patch "$PRIV/gate/a08.patch"`, after `A08="$(mktemp -d)/a08"`. Write the smallest script that shows the failure. Write it from rule Z5 in the ticket, not by copying the hidden check. Run it with `PYTHONPATH=src python -W error`, so the warning becomes an exception.

**Done when:** both runs give 0.50 with the same failing checks as the pilot, and your own script fails the same way on a08's code.
:::

:::drill id="capstone-gate-2-diagnose" title="Gate item 2: diagnose it in your own words" time="2 h"
Write `$PRIV/gate/diagnosis-a08.md` by hand, in these parts:

1. **Symptom:** the input, the expected output and the actual output, in one or two sentences.
2. **Requirement:** the rule id and its exact words from `instruction.md`.
3. **Root cause, with file:line.** Open every frame of the traceback from item 1. A line can come from a08's code or from the base repo. `git -C "$A08" diff --cached --stat` shows what a08 changed; a line that is not in it comes from the base repo.
4. **The rule it broke.** Check T1–T7 and K1–K2 one by one. All 8 pilot attempts passed every future-invariance check and every oracle check except the named ones. So a08's failure may break no time rule. If so, write "no time rule", name the rule it did break, and say in one sentence why the grader still scores that rule inside a milestone.
5. **Why the agent missed it.** Use the transcript facts in the [pilot failures](#pilot-failures). If you have a01's patch, compare: a01 fixed the same problem.
6. **Prove it.** Make the smallest fix in the a08 copy, add a test of your own, and grade the fixed patch. Milestone 1 must now pass, and nothing else may change.
7. **The milestone-2 failure, in two sentences:** what the check needs, where rule J6 now says it, and why it was a spec–grader gap and not simply an a08 bug at the time.

8. **A time-rule diagnosis (required).** The plan's gate item 2 asks which time rule the failure broke. The pilot gave no time-rule failure, so this part fills that gap. Pick one hand-written wrong solution in your private folder whose description says it breaks a time rule, for example T1, T3 or S5. Grade it once, then repeat parts 1–4 on it. `OWNERSHIP.md` step 2.8 has the command.

**Done when:** each diagnosis fits on one page in your own words, every claim points to a file:line or a command output, and you can explain both aloud in 2 minutes each without the page.
:::

:::drill id="capstone-gate-3-grader" title="Gate item 3: change the grader and re-run the card" time="3–4 h"
The goal: one new or changed check of your own, and one new wrong solution, `w21`, that the old grader accepts and the new grader rejects. Then the whole validity card again. The plan says "add or change one check (e.g. a new boundary case)", so a boundary check is the recommended kind, not the only one.

The new check must follow from the ticket text (put the rule id in its docstring) and reject no correct solution. Prefer a boundary: an exact-equality edge, a tie, an empty or one-row input, a weekend or DST gap, a time-zone offset. A check that closes a stated gap also counts.

1. Back up the grader: `cp -R "$PRIV/grader" "$PRIV/gate/grader-v0"`.
2. **Choose the boundary.** Read the hidden checks of one rule group, for example S5 (purge and embargo) or T2 (ties at one `published_at`). Write down one boundary they do not test. `OWNERSHIP.md` lists starting ideas. Nobody has checked them against the hidden tests.
3. **Write the wrong solution first.** Start from one reference and change one line, so that only your boundary breaks:

   ```bash
   W="$(mktemp -d)/w21"
   python -m gvt materialize --config tasks/chronos-pit/gvt.toml --dest "$W" --patch PATH-TO-ONE-REFERENCE-PATCH
   # edit one line under "$W/src/chronoflow/"
   git -C "$W" add -A
   git -C "$W" diff --cached --binary "$BASE" > "$PRIV/gate/w21.patch"
   ```

   The reference patches are under `$PRIV/corpora/reference/`. Put your private canary line at the top of `w21.patch` as a `# ` line, like the other private patches. `git apply` ignores it.
4. **Grade it with the old grader.** It must still pass the milestone you target. If the old grader already rejects it, the gap was not real: go back to step 2. The census killed 264 of 264, so expect more than one round.
5. **Add the check** next to the checks of the same rule group. Use their seeds and helpers.
6. **Grade again.** `w21` must now fail the milestone you target. The three references must still score 1.00 on every run of `--corpus reference --repeats 3`. Also grade the six pilot attempts that scored 1.00, in the sandbox with `harness grade-patch`. If one of them now fails, the pilot had a false accept. That is a real finding: write it down.
7. **Re-run the full card.** Add `w21` to `$PRIV/corpora/wrong/` with a `meta.json` like the others. Then run README step 6: three `gvt run` groups (3 repeats for references, wrong solutions and the author base; 2 for the references and refactor variants; 1 for the references and mutants) and one card per group. The references must be in every group. The card looks for a parent only in its own results folder; without it, the card falls back to "full reward or not" and prints `absolute rule used`. That fallback gives wrong labels once your check moves a parent below 1.00. So check that the note appears 0 times. This makes 432 grader runs. Run 5 made 423 in about 18 minutes on the 14-core build Mac. Compare with run 5: references 3 of 3 accepted; wrong solutions 21 of 21 rejected; refactor variants 15 of 15 same as parent; 0 flaky solutions and 0 grader errors. If your check kills a mutant that was adjudicated "equivalent", that adjudication was wrong. Change it, with a reason and a history line.
8. **Update the public summary.** Add a run 6 row to `results/VALIDATION-SUMMARY.md`: the new hidden-check count, "rejected 21 of 21", the new mutant numbers. Name no hidden check and no boundary case.
9. **Remove your idea from the public files.** The boundary you built is now a hidden check. Delete it from the idea list in `OWNERSHIP.md` (step 3.10), and from this page if it is named here.

One idea in `OWNERSHIP.md` is the `min_periods=2` default (known limit 3). It is a signature check, not a boundary check, and it still counts as "change one check". Work out on paper why: under rule Z3 a window with one value is always NaN, because all of its values are equal. So the defaults 1 and 2 give the same output on every input, and no behavior check can tell them apart.

**Done when:** the old grader passes `w21` on its target milestone, the new grader rejects it, the references stay at 3 of 3 with every run at 1.00, and the new card is written and compared with run 5.
:::

:::drill id="capstone-gate-4-defend" title="Gate item 4: defend the design aloud" time="2 h"
1. Pick 10 questions from `workspace/polaris-capstone/DEFEND.md` (28 on 2026-10-21) at random. Best: another person picks the numbers and tells you only when you start. Alone: use the date and time when you start as the seed, so nobody can compute the pick early. Write the seed and the pick into your gate log before you read a question, and keep that first pick:

   ```bash
   SEED="$(date +%Y-%m-%dT%H:%M:%S)"
   echo "seed $SEED"
   python3 -c 'import random, sys; n = int(sys.argv[1]); random.seed(sys.argv[2]); print(sorted(random.sample(range(1, n + 1), 10)))' 28 "$SEED"
   ```

2. Close every file. Start an audio recording (QuickTime Player: File > New Audio Recording). Read one question, then answer in at most 2 minutes. No notes, no screen. The five-part form of [[defend-it#five-part-answer|Defend it]] gives the answer a shape.
3. Score each answer from the recording against the `DEFEND.md` outline. 2 = right and complete, with a number and its sampling frame where one applies. 1 = right but missing a key part. 0 = wrong or stuck.
4. For every answer below 2, write what was missing. Rewrite the answer in your own words; do not copy `DEFEND.md`. Answer it aloud again the next day and score it again.

**Done when:** all 10 are answered and scored, and every answer below 2 was redone and scored 2.
:::

After item 4, fill the gate record in your private copy of `OWNERSHIP.md`, and tick your [[start-here#honesty|gate list]]. Only then use the "after the gate" wording below.

## The sandbox and the v1 freeze {#sandbox}

The pilot had no technical sandbox. After a security review on 2026-10-21, the harness runs every agent attempt and every grade in Docker. `harness/README.md` describes it, `harness/SECURITY-EVIDENCE.md` holds the before/after evidence, and the capstone README sums it up.

What the code enforces:

- **One fresh container per attempt.** No network, all Linux capabilities dropped, `no-new-privileges`, a read-only root file system, user id 10001, and limits on processes, memory and CPUs. The controller kills the container at the time limit and always removes it, also after an error, a timeout or Ctrl-C.
- **Only the workspace is mounted**, at `/work`. No home folder, private folder, other attempt, run record or Docker socket. The controller reads the container's settings back with `docker inspect` and refuses to start one that differs.
- **An allowlisted environment.** The agent sees six fixed variables and the names you pass with `--pass-env`. None of your other variables reach it. The `gemini` adapter keeps the API key and the API calls in the controller; only its tool calls run in the container.
- **Grading comes after all attempts**, each patch in a fresh grader container with no network. It mounts only the private `grader/` folder, read-only, as `grader_private_mounts` in the task config names it. With no mount named, the harness refuses to grade. It also refuses a mount that holds a solution corpus.

What it does not solve:

- **Graded code runs inside the grader's process.** A patch can read the hidden checks while it is graded, and it can forge its own reward in its own grader container. It cannot change another attempt's record or any file on your machine. So a grade is trustworthy only when the solver does not attack the grader. That fits ordinary model attempts, not adversarial ones.
- Grader output is saved on your machine and can hold what graded code read. Treat grade records as private.
- The workspace mount has no disk quota, and the containers share the Docker Desktop VM's kernel.
- **`agy` is refused in the sandbox.** It needs your sign-in and network access, and putting either into the container would hand them to the agent. `--allow-unsandboxed-agy` runs it on your machine and records `sandbox=false`.
- **`--no-sandbox`** runs agents and grading on your machine, as you. It prints a warning and records `sandbox=false`. Only the allowlisted environment still applies.

Tested so far: the toy task with dummy secrets, and two runs on Chronos that graded nothing. On 2026-10-21 a do-nothing attempt printed `attempt 1: exit=0 timed_out=False files=0 violations=0 sandbox=on`, and an attempt that ran the visible tests inside its container printed `140 passed in 1.62s`. No Chronos grade and no model run has gone through the sandbox yet.

Check the allowlist with dummy secrets, never with a dump of your real environment:

```bash
python -m harness build-image
python -m harness sandbox-check
```

Real output on 2026-10-21, in part: `allowlist self-check: PASS`, the six seen names (`HOME`, `LANG`, `LC_ALL`, `PATH`, `PYTHONDONTWRITEBYTECODE`, `TERM`) and `"dummy_values_seen": []`. The check sets dummy values, such as a dummy `GEMINI_API_KEY`, in a copy of the controller's environment, and reports only names.

**The v1 freeze.** Model comparisons run against **chronos-pit v1 (frozen 2026-10-21)**. `release/chronos-v1.manifest.json` holds the sha256 of the ticket, `task.toml`, `gvt.toml`, `tests/test.sh`, the task Dockerfile, the history bundle, `BASE_COMMIT`, the requirements files, the environment repo, the `harness/` and `gvt/` trees, the sandbox recipe and the pilot prompt template. It also lists the run-configuration fields to fill in for each configuration. Check it before the first attempt and after the last:

```bash
python release/freeze_manifest.py --verify release/chronos-v1.manifest.json
```

Real output on 2026-10-21: `verify: OK`. A mismatch means a new task version, and results from two versions never pool. Pilot 1 is not comparable with any v1 run. Only you add the private grader's digest, with `--private-root`; the public manifest then gets one digest per private folder, never a file name.

## The Gemini run plan {#gemini-runs}

Gemini has not run on Chronos. This is Day 2 of [[tracker#final-project|the extension]].

**Adapter status** (from `harness/README.md`):

| Adapter | Status | How it runs |
|---|---|---|
| `shell` | tested | any command template, as the container's main process, with `{workspace}`, `{instruction}`, `{prompt}` and `{python}`. There is no network inside |
| `gemini` | untested against the live API | a tool loop over the Gemini API. The key and the API calls stay in the controller; each tool call runs in the attempt's container. Tested offline with a fake transport only |
| `agy` | untested | refused in the sandbox. With `--allow-unsandboxed-agy` it runs `agy -p "<prompt>" --output-format json` on your machine and records `sandbox=false` |

Both Gemini adapters are untested. Your first runs test the harness as much as the model. So the plan starts small.

1. **Fix the configuration first.** Copy the fields of `model_run_config_template` from the v1 manifest into `run-plan.md`: model id, thinking level, adapter, prompt sha256, time budget, network, image digest and the rest. One fixed set of these is one configuration. Change any one, and it is a new configuration.
2. **Baselines through the same path.** Run `sandbox-check`. The do-nothing patch must score 0, and a reference must score 1.00, both through the grader sandbox. Then one attempt with a short timeout. Read its `agent_result.json`, `patch.diff` and `grade.json` before you run more. The [Gemini smoke test drill](#drill-capstone-gemini-smoke) has the steps.
3. **At least 20 attempts per configuration, or report intervals.** If you get fewer, report what you have, with intervals. 20 attempts are still a rough reading: 10 of 20 gives a Wilson 95% interval of 0.30 to 0.70, and a half-width of 0.10 needs 93 attempts. Both numbers are real `harness stats` and `harness sample-size` output from 2026-10-21. [[runs-and-weaknesses#sample-size|How many runs to buy]] explains the choice.
4. **Pick the prompt on purpose.** The harness default prompt is not the pilot prompt; the manifest records the sha256 of both. To stay close to the Claude pilot, pass the pilot text from `_build-notes/pilot-workflow.js` with `--prompt` and change its paths: in the sandbox the workspace is `/work` and the ticket is `/work/instruction.md`. Even then it is a new configuration on a new ticket version, so it is not comparable with pilot 1.
5. **Name the model yourself.** The `gemini` adapter falls back to `gemini-2.5-pro`, an older model. Pass `--model`. Gemini 4 Argon's id is `gemini-4-argon`. It is paid only, and it ignores temperature ^[confirmed](https://ai.google.dev/gemini-api/docs/latest-model "2026-10-20"). Antigravity's default model is Gemini 3.8 Flash, on every plan ^[confirmed](https://antigravity.google/docs/plans "2026-10-20").
6. **Use the sandbox.** Run every counted attempt with the sandbox on. Prefer the `gemini` adapter: it keeps the key out of the agent's reach. An `agy` run is unsandboxed, so the agent can read everything you can, your private folder included. If you run one anyway, report it as a separate configuration, with that limit next to every number.
7. **Keep run folders private.** Put `--out` inside your private folder but outside its `grader/` folder, because `grade.json` and the grader logs name hidden checks. The harness refuses a run folder that overlaps a grader mount.
8. **Budget.** The 8 Claude pilot attempts used about 2.5 M subagent tokens in all (build log). Gemini will differ, so measure the smoke-test attempt and check `/usage` in `agy` first (checked against docs on 2026-10-20, not run).
9. **Report raw outcomes first:** reward and milestones per attempt. Then the rate, the Wilson interval and pass^k, with the frame "N attempts by one agent configuration (model, adapter, prompt) on one task". Adjudicate every failure against the ticket, then label the first wrong turn ([[runs-and-weaknesses#first-wrong-turn|first-wrong-turn analysis]]).

The commands (not run by us; the `gemini` path is untested). Use the shell setup from [the gate](#ownership-gate) first:

```bash
python release/freeze_manifest.py --verify release/chronos-v1.manifest.json
CHRONOS_GRADER_TIME_SCALE=2 python -m harness run --config tasks/chronos-pit/gvt.toml --adapter gemini \
  --model gemini-4-argon --attempts 1 --timeout 1800 --out "$PRIV/runs/argon-smoke" \
  --grade --private-root "$PRIV" --grader-pass-env CHRONOS_GRADER_TIME_SCALE
CHRONOS_GRADER_TIME_SCALE=2 python -m harness run --config tasks/chronos-pit/gvt.toml --adapter gemini \
  --model gemini-4-argon --attempts 20 --out "$PRIV/runs/argon-api-20" \
  --grade --private-root "$PRIV" --grader-pass-env CHRONOS_GRADER_TIME_SCALE
```

`--grade` waits until every attempt has finished, then grades each patch in a fresh grader container. So no grade record exists while an agent runs, and no solver container mounts the run folder. `CHRONOS_GRADER_TIME_SCALE` reaches only the grader container. Without `--timeout`, each attempt gets the 4-hour limit from the `[agent]` section of `gvt.toml` (14,400 seconds).

The `gemini` adapter reads `GEMINI_API_KEY` from your environment. Set it yourself in your terminal. The key stays in the controller: it goes only into the request header, never into the container, and the harness refuses to pass it with `--pass-env`.

For `agy`, see `EXTEND.md` Day 2, Path B. Headless `agy -p` stops waiting after 5 minutes by default (checked against docs on 2026-10-20, not run), and the `agy` adapter passes no timeout flag. The pilot attempts took 27–33 minutes, so a 5-minute cut would end every attempt early. A headless run can also exit 0 after a tool call was soft-denied, so read its `status`: it must be `SUCCESS` (checked against docs on 2026-10-20, not run).

:::drill id="capstone-gemini-smoke" title="Smoke-test the Gemini path before 20 runs" time="60 min"
1. Write the configuration from step 1 above into `run-plan.md`, and run `python release/freeze_manifest.py --verify release/chronos-v1.manifest.json`. Use the [[runs-and-weaknesses#drill-chronos-run-plan|run-plan drill]] for the rest of the plan.
2. Run `python -m harness sandbox-check`. It must print `allowlist self-check: PASS` and `"dummy_values_seen": []`. It uses dummy secrets only. Never print your real environment to check it.
3. Grade the do-nothing patch and one reference through the grader sandbox with `harness grade-patch`. Write down both rewards.
4. Run one attempt with your adapter and `--timeout 1800`, with `--grade`.
5. Open the attempt folder. Check that `patch.diff` holds the agent's changes and that `agent_result.json` says `valid` with no violations. In its `sandbox` record, check that `network` is `none`, `mounts` lists only `/work`, `env_names` lists only the six allowlisted names, and `removed` is `true`. Copy `image_id` into `run-plan.md` as the image digest. Then read `grade.json`.
6. Fix what broke. Repeat step 4 until one attempt goes end to end.

**Done when:** the self-check passed, do-nothing scored 0, the reference scored 1.00, and one adapter attempt produced a patch, a valid record with the sandbox fields above, and a grade, all written in `run-plan.md`.
:::

## The application package {#application}

### When to send what {#application-timing}

| When | What you send |
|---|---|
| By Fri Oct 23 | Your tailored résumé and your strongest existing project. No Chronos ([[start-here#apply-early\|apply early]]). |
| When a recruiter contacts you | Your questions: the format of each stage, whether AI tools are allowed, which language. |
| After you pass the gate and the Day 7 leak check | A short note with the link to the public part of Chronos. |

### Résumé bullets {#resume}

**True today.** Keep it off the Oct 23 résumé. Use it only to describe the project out loud:

> Directed AI coding agents (Claude Code workflows) to build Chronos v0, a long-horizon Python eval task: a 42-commit time-series repo, a four-milestone ticket and a 1,044-check hidden grader. Agent-run validation: 3 of 3 separately written references accepted, 20 of 20 hand-written wrong solutions rejected, 264 of 264 eligible mutants killed (census of a fixed operator set, after adjudicated exclusions).

Every clause is true today. But you cannot yet defend it without AI, and [[start-here#apply-early|the application rule]] says nothing goes on the résumé that you cannot defend.

**After the gate.** The short line from `OWNERSHIP.md`:

> Directed AI coding agents to build Chronos, a long-horizon SWE eval task; reproduced, diagnosed and extended its grader myself.

The long version, with numbers you re-ran:

> Directed AI coding agents to build Chronos, a long-horizon SWE eval task (Python, pandas; four milestones, [hidden-check count] hidden checks). Reproduced and diagnosed a pilot failure myself, added a boundary check that catches a new wrong solution I wrote, and re-ran the Grader Validity Card: [3 of 3] references accepted, [21 of 21] hand-written wrong solutions rejected.

**After the Gemini runs**, add one clause:

> Ran [N] [model] attempts through the harness: [k] of [N] full reward (Wilson 95% [a–b]; one configuration, one task); adjudicated and labeled every failure.

Rules for every bullet:

- Fill the brackets only with numbers you produced or re-ran yourself.
- Keep the frame words: "hand-written", "census", "one configuration, one task".
- Never write a false-accept rate. Never write "Gemini" next to the Claude pilot numbers.

### Public and private {#public-private}

| Part | Public? | Why |
|---|---|---|
| Environment repo, `history.bundle`, `Dockerfile`, `instruction.md`, `task.toml`, `gvt.toml` | yes | a solver sees these anyway |
| `tests/test.sh` | yes | it only calls the private grader |
| `gvt/` and `harness/` | yes | reusable tools with no task secrets |
| `release/` (the v1 manifest's public part and its scripts) | yes | hashes and run rules; no private name or content |
| The review zip in `_review-bundle/` | to the next reviewer only, not in git | a generated copy of public files; its script scans it for private paths and the canary |
| `results/VALIDATION-SUMMARY.md`, `results/PILOT-SUMMARY.md` | yes | written to name no hidden check |
| `README.md`, `REPORT.md` (v0), `DEFEND.md`, `OWNERSHIP.md`, `EXTEND.md` | yes, after you review them | check that none names a hidden check or a boundary case, and remove the gate item 3 idea you built (`OWNERSHIP.md` step 3.10) |
| `_build-notes/` and `.envbuild/` | yes, after you review and scrub them | written for the build, not for readers. `_build-notes/` holds absolute home-folder paths, temp paths, the private folder's location and one private mutant id. Remove them first, or keep the folder private |
| Hidden grader, oracle, references, wrong solutions, variants, mutants, raw records, full card, adjudications | never | they are the answer key |
| Attempt patches, transcripts and grade logs (pilot and Gemini) | never | patches are solutions; grade logs name hidden checks |
| The private canary | never | it exists to find leaks |

Publishing solutions also contaminates the task. Future models can train on them, and then the task measures memory ([[task-design#contamination|contamination]]).

### The note to the recruiter {#recruiter}

Send it only after the gate and the leak check. Fill the brackets with your own facts:

> I would like to share Chronos, an eval task for long-horizon software engineering. AI agents built v0 under my direction. Then I [reproduced a pilot failure, diagnosed it, added a grader check and re-validated the grader]. Public part: [link]. The report covers the grader validation and an 8-attempt pilot with Claude agents [and N Gemini attempts]. The hidden grader stays private; I am happy to walk through it live.

Keep it to about six sentences. The "AI agents built v0" sentence is not optional. The note mentions "the report", so update `REPORT.md` to v1 first (Day 6 of the extension).

:::drill id="capstone-application-package" title="Write the application package" time="45 min"
1. Copy the bullets into a private file. Fill only the brackets you can fill today. Leave the others empty.
2. Fill the recruiter note with what is true today. Mark what is still missing.
3. The capstone is already its own local git repo. Run `git ls-files` there and compare every file with the public-and-private table.
4. Run the [[tracker#final-project|Day 7 leak check]] once, as practice, even if you will not publish yet.

**Done when:** the bullets and the note exist with no unfilled claim, and your `git ls-files` list matches the "yes" rows of the table and nothing else.
:::

## The extension plan {#extension}

The full plan is in [[tracker#final-project|the tracker]] and in `workspace/polaris-capstone/EXTEND.md`. In short:

| Day | Work |
|---|---|
| 1 | Gate items 1–2 |
| 2 | Gemini runs: at least 20 attempts per configuration, or report intervals |
| 3 | Failure analysis; turn real Gemini failures into new wrong solutions; gate item 3 |
| 4 | Task 2 in another stack (for example TypeScript), validated with gvt |
| 5 | An audit of public graders: a defined mutant space over a sample of public Harbor-format tasks, with frames |
| 6 | Update `REPORT.md` from v0 to v1 |
| 7 | Gate item 4 again, polish, publish the public part only, send the link |

How to make Chronos harder, which the pilot asks for:

- **Chain the milestones.** Today only milestone 3 builds on milestone 2. Make the milestone 4 splitter run on the milestone 3 feature table, so a wrong time rule shows up twice ([[task-design#chronos-milestones|Chronos as the example]]).
- **Use good difficulty knobs**, not hidden traps ([[task-design#knobs|difficulty knobs]]). Every edge case the grader checks must be in the ticket. The pilot already showed what happens when one is not.
- **Do not aim for 0%.** A 0% pass rate over many attempts usually signals a broken task, not a hard one ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20").

GPU options from [[gpu-practice]]: run a small open model on Chronos ([[gpu-practice#g2-chronos|G2's Chronos option]], after gate items 1–2), and watch a grader under RL pressure ([[gpu-practice#g3|G3]]). Label those as small-model runs, never as Gemini runs.

## Vibe coder vs senior engineer {#compare}

:::compare
- Calls Chronos "my project" the day the agents finish it. || Says "v0 is agent-built" until all four gate items are done, and can show the gate record: the evidence in `$PRIV/gate/` and the public-safe gate log.
- Says "the grader has a 0% false-accept rate". || Says "rejected 20 of 20 hand-written wrong solutions (hand-picked; counts only), and 264 of 264 eligible mutants killed (census of one operator set)".
- Says "the model solves it 75% of the time". || Says "6 of 8 attempts by one Claude configuration on one task; Wilson 95% 0.41–0.93; nothing about Gemini".
- Counts a02's failure as a model weakness. || Adjudicates it as a spec–grader gap and fixes the ticket, not the score.
- Adds a grader check because it "seems important". || Adds a check only when a ticket sentence implies it, and writes the rule id next to it.
- Starts 20 Gemini runs on an untested adapter. || Runs do-nothing, a reference and one smoke attempt first, and fixes the configuration in writing.
- Says "the scan found 0 breaches, so all 8 attempts are valid". || Says "No matches were found in the inspected tool-call inputs for the listed indicators. Technical isolation was not enforced during pilot 1, and the scan does not establish absence of private-data access."
- Compares a new Gemini run with pilot 1. || Treats pilot 1 as exploratory, and compares only runs made against the same frozen manifest.
- Sends the whole capstone folder to the recruiter. || Sends the public part after the leak check, and keeps the answer key private.
:::

## Files behind this page {#files}

Local files, inside `workspace/polaris-capstone/`. No public URL, so no badge:

- `results/VALIDATION-SUMMARY.md`: validation run 5, setup, raw outcomes, change history, limits.
- `results/PILOT-SUMMARY.md`: pilot 1, raw outcomes, statistics, failure analysis, isolation.
- `tasks/chronos-pit/instruction.md`, `task.toml`, `gvt.toml`, `tests/test.sh`, `environment/Dockerfile`.
- `gvt/README.md` and `harness/README.md`: commands, frames, adapter status, the sandbox.
- `harness/SECURITY-EVIDENCE.md`: before/after evidence for the security fixes and the sandbox.
- `release/chronos-v1.manifest.json` and `release/freeze_manifest.py`: the v1 freeze.
- `_build-notes/BUILD_LOG.md` (build time) and `_build-notes/pilot-workflow.js` (the script that ran pilot 1, with its prompt).
- `README.md`, `REPORT.md`, `DEFEND.md`, `OWNERSHIP.md`, `EXTEND.md`: the capstone docs.

## Sources

- ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19") [Google Careers: Research Engineer, Polaris](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind): duties, hand-built tasks, about one week per task.
- ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20") [Google DeepMind: Interviewing at Google DeepMind (PDF)](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf): no AI tools in interviews unless told otherwise.
- ^[confirmed](https://docs.harborframework.com/tasks/overview "2026-10-20") [Harbor: task overview](https://docs.harborframework.com/tasks/overview): the task layout Chronos follows.
- ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20") [Datacurve: DeepSWE](https://deepswe.datacurve.ai/blog/deepswe): hand-written tasks that describe behavior, not files.
- ^[confirmed](https://arxiv.org/abs/2107.03374 "2026-10-20") [Chen et al. 2021, Evaluating LLMs trained on code](https://arxiv.org/abs/2107.03374): the unbiased pass@k estimator.
- ^[confirmed](https://arxiv.org/abs/2406.12045 "2026-10-20") [Yao et al. 2024, τ-bench](https://arxiv.org/abs/2406.12045): pass^k.
- ^[confirmed](https://doi.org/10.1214/ss/1009213286 "2026-10-20") [Brown, Cai, DasGupta 2001, Interval estimation for a binomial proportion](https://doi.org/10.1214/ss/1009213286): the Wilson interval.
- ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20") [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): a 0% task usually signals a broken task; read transcripts.
- ^[confirmed](https://ai.google.dev/gemini-api/docs/latest-model "2026-10-20") [Gemini API: Gemini 4 Argon](https://ai.google.dev/gemini-api/docs/latest-model): model id, paid only, sampling parameters ignored.
- ^[confirmed](https://antigravity.google/docs/plans "2026-10-20") [Antigravity plans](https://antigravity.google/docs/plans): Gemini 3.8 Flash as the default model on every plan.
- ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20") [Antigravity CLI: headless mode](https://antigravity.google/docs/cli/headless/): `agy -p`, JSON output, the `status` field.

:::check
- You can say the status line and the four gate items from memory.
- You can give every validation number with its frame, and say what each one does not show.
- You can explain a02's failure, and why it was a spec–grader gap and not a model weakness.
- Your gate notes are in your private folder, and nothing that names a hidden check is anywhere else.
- You know what goes into the Oct 23 application (no Chronos), and what you send after the gate.
:::
