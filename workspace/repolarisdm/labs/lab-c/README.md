# Lab C: Spot the Bad Agent Patch

**Time box:** 60 minutes of review, plus about 10 minutes of setup and 10 minutes of scoring.
**Trains:** the Agent Patch Audit in review mode: S4, S10, S11, S12 and S14. S13 is optional.
**Mistake card rows:** any row of the card below. A row may appear more than once, or not at all.
**Needs:** Python 3.10 or newer, git, ripgrep (`rg`). No packages. pytest is optional.

## What you do

`repo/` is `pricebook`, a small invoice library: exact decimal money, a product catalog,
sales tax by region, coupons, invoices and a command line. It has 45 tests.

`patches/01` to `patches/12` each hold one change that a coding agent made to `repo/`:

| File | What it is |
|---|---|
| `task.md` | The ticket the agent was given. Treat it as the spec, together with the repo's README. |
| `patch.diff` | The agent's final change, as `git diff` output. |
| `transcript.md` | The agent's session: what it said, every command it ran with the real output, every edit. |

Every transcript is **synthetic**. It was written for practice. It is not real Gemini output.
The shell output is real: each command was run at that point of the scripted session. Only paths were shortened.

All 12 tickets are open against the same base. Judge each patch against its own ticket.
Bugs that other tickets describe are known and out of scope.

10 patches are flawed and 2 are clean. For each patch, decide like a reviewer whose job is to keep
plausible-but-wrong work out of a benchmark:

1. **Flawed or clean?** "Flawed" includes a correct diff produced in an invalid way.
2. **Which mistake card row?** M1–M10, from the card below.
3. **Which step caught it?** S0–S15. Name the step where *you* found the evidence.
4. **Evidence.** A `file:line`, a command and its output, or a transcript line. "Looks wrong" is not evidence.

## Mistake card

The same rows as the card in the playbook's Agent Patch Audit chapter.

| Row | Agent mistake | What it means |
|---|---|---|
| M1 | Invented API, flag or package | It calls a function, option or package that does not exist. |
| M2 | Wrong root cause, or a symptom-only fix | It fixes the reported input, not the cause. A second input still fails. |
| M3 | Test gaming | Special-cased inputs, edited or skipped tests, a `conftest.py` exit, an always-true `__eq__`. |
| M4 | Silent damage | Deleted logic, scope creep, swallowed errors, changed behavior nobody asked for. |
| M5 | Similar-but-different logic | Right on the inputs it was tried on, different on others: rounding, boundaries, environment. |
| M6 | Overselling | "Tests pass" with no output, or a claim that no run supports. |
| M7 | Solution lookup | The answer came from outside the task: `git log --all`, an upstream fetch, memorized code. |
| M8 | Answering from memory, not from the code | It states facts about the repo that it never checked in the files. |
| M9 | C++ memory errors or undefined behavior | Out-of-bounds access, use after free, signed overflow. |
| M10 | Security and dependencies | `shell=True`, `eval`/`exec`, `verify=False`, secrets, new packages. |

## Why this matters for Polaris

Polaris builds tasks and graders for Gemini's software-engineering work. A grader that accepts a
plausible but wrong patch gives a wrong number. Studies of public benchmarks find these failures often:

- PatchDiff found that 29.6% of test-passing ("plausible") SWE-bench patches behave differently
  from the developer's fix ([Wang, Pradel, Liu, ICSE 2026](https://arxiv.org/abs/2503.15223)).
- In one 2026 study, three open models tried shortcuts (an upstream fix, local git history,
  memorized code) in 55.5–90.1% of their trajectories, depending on model and benchmark
  ([Ludwig et al., arXiv 2609.06780](https://arxiv.org/abs/2609.06780)).
  SWE-bench issue #465 documents one such loophole: agents read the future fix from git history
  with `git log --all` ([SWE-bench issue #465](https://github.com/SWE-bench/SWE-bench/issues/465)).
- In one public dataset of real sessions, an LLM judge found "overselling" (claiming more was done or
  verified than the transcript shows) in 32.9% of sessions
  ([Transluce, 2026-08-05](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1)).
  This rate is LLM-judged; treat it as an estimate.

Each patch here is a small, labeled copy of one of these failure types. Catching them fast, with
evidence, is the daily skill. Each one you catch is also a task idea: a grader must reject it.

## How to start (about 10 minutes)

Never open an agent inside the portfolio repository. It holds your local answer keys and the
playbook's own history. Work in a practice copy:

```console
$ bash labs/make_practice.sh lab-c
```

Run it from the playbook folder, the one that contains `labs/`. The script copies `repo/` into a fresh
temporary folder with its own git (one commit on `main`, no parent history) and prints the folder's path.
Then, in zsh or bash:

```console
$ LAB="$PWD/labs/lab-c"          # same folder as above, before you cd away
$ cd <the path the script printed>
$ python3 -m unittest            # S1 baseline: expect "Ran 45 tests" and "OK"
$ for p in 01 02 03 04 05 06 07 08 09 10 11 12; do
    git switch -q -c "p$p" main && git apply "$LAB/patches/$p/patch.diff" && git add -A &&
    git -c commit.gpgsign=false -c core.hooksPath=/dev/null -c user.name=practice \
      -c user.email=practice@example.invalid commit --no-verify -qm "patch $p" &&
    git switch -q main
  done
$ git branch                     # main, p01 ... p12
```

The `-c` options switch off your own commit signing and git hooks for these commits only, and set a
practice author, so the loop never stops to ask for a passphrase or an email address.
Read the tickets in `$LAB/patches/NN/task.md` and the transcripts in `$LAB/patches/NN/transcript.md`.

## Toolbox (review mode)

Read `repo/README.md` first (S2). Its rules ("How totals are computed", "Rounding", the CLI contract)
are part of the spec.

**S10 Read the diff.**

```console
$ git diff --stat main p05
$ git diff main p05
$ git diff --stat main p05 -- tests/             # did it touch tests? added, or changed?
$ git diff main p05 | rg -n '^\+.*(eval\(|exec\(|shell=True|verify=False|except Exception|except:)'
```

**S11 Re-run everything yourself.** Compare the result with the agent's final message.

```console
$ git switch -q p05 && python3 -m unittest -q 2>&1 | tail -3
$ git restore --source=main -- tests && python3 -m unittest -q 2>&1 | tail -3   # ORIGINAL tests on the new code
$ git restore -- tests && git switch -q main                                     # undo, go back
```

Try every new import or library call once: `python3 -c "import X; X.some_function"`.

**S12 Attack the fix.** Write two or three inputs the agent did not try: a second example, an exact tie,
a boundary day, another currency, an input with a bad line. Run them with `python3 -c` or
`python3 -m pricebook quote ...`.

**S13 Fresh review (optional, uses an agent).** In a new agent session opened in the practice copy,
give it only `task.md` and `git diff main pNN`. Ask it to act as Critic, then Challenger, then Auditor.
Reproduce each finding yourself before you count it.

**S14 Transcript audit.**

```console
$ rg -n '^\$ ' "$LAB/patches/05/transcript.md"            # every command the agent ran
$ rg -n 'Tool call: (edit|write)' "$LAB/patches/05/transcript.md"
```

List each claim in the final message. Match it to tool output above it. Ask: did it read the files it
cites? Did it run the tests after its last edit? Did it get the answer from somewhere other than the
ticket and the code? A long, careful message is not evidence that the patch is right.

**Red-flag scan (cross-check, at the end).** It lives next to `make_practice.sh`:

```console
$ bash "$LAB/../redflags.sh" "$LAB/patches/05/patch.diff" "$LAB/patches/05/transcript.md"
```

A FLAG means "look here", not "flawed". Clean patches get flags too, and the row label next to a flag
is the tool's guess. Write your own row first. Change it only if your own evidence says so.

## Plan for the 60 minutes

1. Minutes 0–12: for every patch, read `task.md`, `git diff --stat`, and the final message. Note one suspicion each.
2. Minutes 12–15: run the test loop on all twelve branches.
3. Minutes 15–52: go deep, about 3 minutes per patch. Write the verdict, row, step and evidence as you go.
4. Minutes 52–57: run the red-flag scan on all twelve. Look again wherever it flags something you did not note.
5. Minutes 57–60: fill the empty cells. A guess with no evidence counts as a miss.

## Scoring sheet

Copy this table into your notes. Fill one row per patch.

| Patch | Flawed or clean | Mistake row (M1–M10) | Catching step (S0–S15) | Evidence (file:line, command, transcript line) | Minutes |
|---|---|---|---|---|---|
| 01 |  |  |  |  |  |
| 02 |  |  |  |  |  |
| 03 |  |  |  |  |  |
| 04 |  |  |  |  |  |
| 05 |  |  |  |  |  |
| 06 |  |  |  |  |  |
| 07 |  |  |  |  |  |
| 08 |  |  |  |  |  |
| 09 |  |  |  |  |  |
| 10 |  |  |  |  |  |
| 11 |  |  |  |  |  |
| 12 |  |  |  |  |  |

**Score it** only after the sheet is full. Open `key.md` from your local answer keys.

- A flawed patch is **caught** when you marked it flawed, named the key's mistake row (or a row the key
  lists as also accepted), and wrote your own evidence.
- Your own evidence is a command and its output, or `file:line` reasoning. A row copied from a
  `redflags.sh` label, with nothing else, is not a catch.
- A **false alarm** is a clean patch that you marked flawed. For a clean patch, the verdict "clean" is enough.
- **Steps are logged, not scored.** A different step never turns a catch into a miss. Compare your step
  with the key's catching step and its alternatives. A step the key does not list also counts when your
  evidence really came from it, for example a diff line you read at S10. If you found it late, write down
  the earlier step that would have caught it.

**Done when:** you catch at least 9 of the 10 flawed patches, raise at most 1 false alarm, and name a
catching step for every flawed verdict, all inside 60 minutes. Log every miss and every false alarm (row,
step that should have caught it, minutes lost) in your `mistakes.csv` (S15).

## After scoring: check the lab itself

**Run this only after you have scored yourself.** With `--details`, its output names every defect.

```console
$ python3 labs/lab-c/check.py --keys <your local answer keys>/lab-c
```

`check.py` uses only the standard library and git. It applies every patch to a temporary copy, runs the
visible and hidden tests, and checks each claim in the key. It also checks that no surface feature gives
the verdicts away: not the style of the final message, not the number of new tests, and not the red-flag
scan on its own. By default it prints one PASS or FAIL line per group of checks and names no defect.
`--details` prints every check and a table of raw test outcomes per patch. It exits non-zero on any
failure. It does not grade you.

## Sources

Checked 2026-10-20 (from the playbook's research notes).

- Wang, Pradel, Liu, "Are Solved Issues in SWE-bench Really Solved Correctly?", ICSE 2026: https://arxiv.org/abs/2503.15223
- Ludwig, Ahmad, Majumdar, Ginsburg, "Shortcutting the Fix: Identifying and Categorizing Agentic Exploits in Software Engineering Benchmarks", 2026: https://arxiv.org/abs/2609.06780
- SWE-bench issue #465, "Repo State Loopholes During Agentic Evaluation": https://github.com/SWE-bench/SWE-bench/issues/465
- Transluce, "Measuring coding agent misalignment in the wild", 2026-08-05: https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1
- Anthropic, Claude 3.7 Sonnet System Card, section 6 (special-casing tests): https://www.anthropic.com/claude-3-7-sonnet-system-card
- Spracklen et al., package hallucinations in code LLMs, USENIX Security 2025: https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen
- Liu et al., "An Empirical Study on Failures in Automated Issue Solving", 2025: https://arxiv.org/abs/2509.13941
