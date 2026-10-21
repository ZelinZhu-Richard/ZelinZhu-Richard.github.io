# Lab H: Unfamiliar Stack Sprint (TypeScript, Node 22)

**Time box:** 90 minutes. **Trains:** S1–S4, S6, S7, S9 and S10–S12 of the Agent Patch Audit.
**Chapter:** Unfamiliar stacks and problem solving (Ch 10).

## Why this lab

Polaris tasks test long-horizon software engineering, and real repos are not
all Python. The closest public analogue, DeepSWE (Datacurve, 2026-05-26), has
35 TypeScript tasks out of 113 (source: https://deepswe.datacurve.ai/blog/deepswe,
checked 2026-10-20). So you must make safe progress in a stack you do not know
well, and catch an agent that guesses from Python habits.

The format (fix a bug, then build a feature, in one timed session) is a practice
format. It is modeled on Meta's AI-enabled coding round as described by
candidates (reported, https://www.hellointerview.com/blog/meta-ai-enabled-coding,
read 2026-10-20). It is not a known Polaris or Google format.

## What you get

`repo/` is **togglebox**, a small feature-flag service: about 840 lines of
TypeScript source, 33 tests, zero dependencies. Node runs the `.ts` files
directly. It has two tickets:

- `ISSUE.md`: a bug report from the growth team.
- `FEATURE.md`: a feature request from the checkout team.

## How to start

From the playbook folder (`workspace/repolarisdm/` in the portfolio repo, the
one that contains `labs/`):

```sh
bash labs/make_practice.sh lab-h   # copies repo/ to a fresh temp dir with its own git; prints the path
cd <the printed path>
node --version                     # you need v22.18.0 or newer
npm test                           # 33 tests, all pass
git log --oneline                  # one commit: your BASE
```

Open your agent **in that temp dir**. Never open it inside the portfolio repo.

`make_practice.sh` also prints a canary boundary test. That test shows your
answer-keys path to the agent. So run it in a throwaway session, with agent
memory off. Never do the lab in a session that has seen that path.

Pick one mode before you start the clock and write it down:

1. **Agent mode.** The agent edits; you approve every edit and read every diff.
2. **Chat-only mode.** The AI may read code and explain. You type all the code.
3. **No-AI mode.** Docs and the terminal only.

## The 90 minutes

| Clock | Phase | Output |
|---|---|---|
| 0:00–0:15 | Adapt (S1–S4) | Baseline saved. A 5-line map: entry point, test command, the path of one `POST /v1/evaluate/:key` request through the code with file:line. At least 5 claims checked (below). |
| 0:15–0:40 | Bug (S6, S7) | A failing test that fails for the right reason, **before** any fix. Then the fix. Root cause in 2 sentences with file:line. |
| 0:40–1:20 | Feature (S9) | Small steps: edit, diff, full suite. Tests for every rule in `FEATURE.md`. |
| 1:20–1:30 | Prove (S10–S12) | Full suite again. `git diff --stat BASE`: no new dependency, no lockfile. Revert your bug fix: your bug test must fail. Restore it. |

If you are stuck on the bug at 0:40, move to the feature. Come back at the end.

### Check the claims (S3, S4)

An explanation is a guess until you check it. In agent or chat-only mode, ask
in read-only mode:

> No changes. Explain how one `POST /v1/evaluate/:key` request becomes a
> variant. Give file:line for every claim. Say "unsure" when you are unsure.

Pick 5 claims. Check each one in about a minute. Open the file:line. If the
claim is about a value at run time, run a two-line probe with `node scratch.ts`.
Log each claim as right, wrong or unsure, with the evidence. A claim that sounds
right needs the same check as one that sounds wrong.

In no-AI mode, write 3 claims of your own from memory first. Then check them
the same way. Your memory of Python is the same risk.

## Done when

- [ ] `npm test` passes, and you added tests for the bug and for the feature.
- [ ] Your bug test fails when you revert your fix (you checked this).
- [ ] You can say the root cause in 2 sentences, with file:line, without notes.
- [ ] Every numbered rule and every validation bullet in `FEATURE.md` has a test.
- [ ] You changed an existing test only where `FEATURE.md` requires it, and you can say why.
- [ ] You checked at least 5 agent claims (3 of your own in no-AI mode) and logged each verdict.
- [ ] No new dependency, no lockfile, no `node_modules/`.
- [ ] The grader (below) reports all hidden acceptance tests passing.
- [ ] All of the above inside 90 minutes of working time. In chat-only or no-AI
  mode, stop at 90:00 and write down how far you got. Then finish untimed.
  Your 90:00 note is your result for that mode.

## Running TypeScript on Node 22: what you need

These are facts about the stack, not hints about the tickets. Node's docs
(https://nodejs.org/docs/latest-v22.x/api/typescript.html, checked 2026-10-20)
say type stripping is on by default since v22.18.0. Node removes the types and
runs the JavaScript that is left. It never checks types.

Errors you will see, captured on Node v22.21.1:

```text
# an enum (needs code generation, so strip-only mode refuses it)
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode

# import './m' instead of './m.ts'
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/.../m' imported from /.../i.ts

# a type imported without the `type` keyword
SyntaxError: The requested module './t.ts' does not provide an export named 'T'
```

So: no `enum`, no `namespace` with values, no constructor parameter properties
(`constructor(private x: number)`); always write the `.ts` extension; use
`import type { T }` for types.

Test commands (all run on Node v22.21.1):

```sh
node --test                                  # every **/*.test.ts and every .ts under test/
node --test test/store.test.ts               # one file
node --test --test-name-pattern="split"      # tests whose name matches
node --test --test-reporter=spec             # readable output
node scratch.ts                              # run a throwaway script that imports ./src/index.ts
```

`node:test` gives you `test`, `before`, `after`. Assertions come from
`node:assert/strict`: `assert.equal`, `assert.deepEqual`, `assert.match`, `assert.ok`.

## Agent mistakes to watch for here

- **M1, M10**: it says the stack needs a tool it does not need, such as
  `ts-node`, `tsx`, `jest` or `npm install typescript`. Try the plain command
  first. Check every flag with `--help`. A new dependency is a red flag.
- **M8**: it answers from Python habits instead of reading the code. Python and
  JavaScript differ in small ways that matter. When it explains behavior, make
  it run a two-line script and show the output.
- **M2 / M5**: a fix that makes the issue's symptom go away is not yet a fix.
  Ask: which written rule does this fix satisfy, and which test shows it?
- **M4**: the diff removes or weakens code that the tickets did not ask to change.
- **M3**: it edits an existing test so that its code passes.

## Grade yourself (after the time box)

From the playbook folder:

```sh
python3 labs/lab-h/check.py --grade <your practice dir>
```

The grader runs your tests. It puts the bug back, when it can, to check that
your bug test fails. It fails on a new dependency, a lockfile that lists
packages, or packages in `node_modules/`. It shows every change you made to the
original test files (you decide: legitimate or test gaming). It runs the hidden
acceptance tests in four groups: oracle, bug, feature, regression. Last, it runs
your tests against hand-written wrong solutions and names each one they miss.
Each miss is a rule your tests do not pin down. This part is a spoiler, so it
comes last.

It reads your local answer keys; pass `--keys DIR` if they live somewhere else.
Do not open the hidden tests before you finish.

Without `--grade`, `python3 labs/lab-h/check.py` proves the lab itself works:
the bug reproduces, the hidden tests fail on the base repo, they pass on two
independent correct solutions, they reject a set of hand-written wrong ones,
and the grader's own checks give known answers. It labels the wrong solutions
W1 to W8. `--verbose` shows their names, which are spoilers. Its output still
hints at the answers, so run it only after you finish.

## After the lab

Log every agent mistake you caught (type, the step that caught it, minutes) in
your `mistakes.csv`. Then write one paragraph: what in this stack slowed you down
most, and what you will do in the first 10 minutes next time. Then do the
debrief questions in your local answer keys.
