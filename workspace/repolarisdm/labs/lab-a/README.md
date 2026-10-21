# Lab A: Map Check (`tallyhub`)

You get a small, realistic Python service and 12 claims that a coding agent
might make while it maps the repo. Some claims are right. Some are wrong in the
ways agents are usually wrong. Your job: judge every claim with evidence from a
tool, not from memory and not from the agent.

- **Trains:** steps S1 to S6 of the Agent Patch Audit (baseline, tool map,
  agent map, check the map, rule file, reproduce), plus S12 in the stretch.
- **Mistake rows:** M1 and M8 in the claims; M2 and M5 in the stretch (see the mistake card).
- **Time box:** 60 minutes, plus a 15-minute stretch. The claim check itself is 20 minutes.
- **Language:** Python 3.11 or newer (3.13 recommended). No network needed after install.

## Why this matters for Polaris

Polaris tasks ask a model to work in a repo it has never seen. The first thing
an agent does is build a map: what runs, where data flows, where the bug lives.
A wrong map sends the fix to the wrong file. A hand-analysis of 150 failed
SWE-bench Verified runs sorts failures into three phases: localization, repair
and iterative verification. Localization failures include a misleading issue and matching
on keywords instead of reading the code
([Liu et al., arXiv 2509.13941](https://arxiv.org/abs/2509.13941), checked 2026-10-20).
Another study found that 72-81% of failed trajectories still found the right
files ([Majgaonkar et al., arXiv 2511.00197](https://arxiv.org/abs/2511.00197),
checked 2026-10-20). So the right files are not enough. You must also check what
the agent claims about them. If you can catch a bad map in minutes, you can catch
it in a model's transcript, and you can design a task that punishes it.

## How to start

Work in a throwaway copy. Never open your agent inside the portfolio repo:
it holds this README, `claims.json` and (during the build) the answer keys, and an
agent there can read them (mistake M7, solution lookup).

Keep your notes in a second temp folder, outside the copy. Your agent works in
the copy, so it must not read your notes and anchor on your guesses. Notes there
would also clutter `git status` and every diff.

From the playbook folder (`workspace/repolarisdm/`):

```sh
P=$(bash labs/make_practice.sh lab-a) && cd "$P"    # new temp copy with its own git
N=$(mktemp -d); echo "notes: $N"                     # your notes folder; keep this path
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -r requirements-dev.txt
set -o pipefail; .venv/bin/python -m pytest -rA 2>&1 | tee "$N/baseline.txt"; echo "exit=$?"
```

You should see `92 passed` and `exit=0`. Run the suite a second time. Same result?
Then you have a baseline (Gate 1: no baseline, no agent).
In a new terminal, set `P` and `N` again to the two paths.

Keep `claims.json` open from the playbook folder. It is not in the practice copy,
so your agent cannot see it.

## Part 1: tool map (S2, 15 min, no agent)

Map the repo with deterministic tools first. These commands run in the practice copy.

```sh
git ls-files | xargs wc -l | sort -n | tail -12          # biggest files
for d in tallyhub tallyhub/storage tests; do printf '%-18s %s\n' $d "$(cat $d/*.py | wc -l)"; done
sed -n '/\[project.scripts\]/,/^$/p' pyproject.toml       # entry point
.venv/bin/python -m tallyhub --help                       # the real CLI surface
.venv/bin/python -m pytest --collect-only -q | tail -1    # how many tests
rg -n '^from \.' tallyhub | sort                          # import graph (grep -rn works too)
.venv/bin/python -m coverage run -m pytest -q tests/test_cli.py::test_ingest_then_query_table
.venv/bin/python -m coverage report -m                    # what ONE test really runs
```

The coverage report is a dynamic map: it shows which lines one real request
touches. Compare it with the files on the path of `ISSUE.md`. Which lines on that
path does this test never reach?

Write a 5-line map in `$N/map.md`. One line each: entry point; the path of one event
from input line to query output; where state lives; what the tests cover and
miss; your first guess about `ISSUE.md`. Every line cites a `file:line` you opened.

## Part 2: agent map (S3, 10 min)

Open your coding agent in the practice copy. Use its read-only or plan mode if it
has one. Paste:

```text
Map this repository. Do not change any file. Give file:line for every claim.
Say "unsure" when you are unsure. Cover: entry points; the path of one event from
an input line to query output; where state is stored; how duplicate events are
handled; what the tests do not cover.
Then read ISSUE.md and say which files are on its path.
```

Save the answer as `$N/repo-map.md`. Do not judge it yet.

## Part 3: judge the 12 claims (S4, 20 min, timed)

Each claim in `claims.json` has `file`, `line` and `expected_text` (the text the
agent quoted). A claim is **right** only if both are true:

1. the quoted text is at that `file:line`, and
2. the sentence is true of the code.

The first check is quick. The second is the real work. A quote that matches
proves only that the agent read the line. It does not prove the sentence. For each claim, ask:
"What would I see if this sentence were false?" Then run the check that shows it.

The rule: a claim is a guess until a deterministic tool confirms it.

Check in risk order. First the claims about how a timestamp or a window moves
on the `ISSUE.md` path. Your coverage map from Part 1 shows that code. Then the rest.

Pick the check by the kind of claim
([full table in Chapter 3](https://zelinzhu-richard.github.io/repolarisdm/map/#claim-checks)):

```text
The claim says ...                    Check it with
text X is at file:line                sed -n 'LINEp' FILE
X is defined or used somewhere        rg -n 'X'
a flag or option exists               the program's --help
A calls B, or a value flows A -> B    rg -n 'B\(' then print the value on the real path
"so", "safe", "never", "only"         a tiny experiment with real input
```

Run experiments in the practice copy with a scratch store in your notes folder,
for example `--store "sqlite:///$N/scratch.db"`. A `python -c '...'` one-liner is
an experiment too.

Write `$N/judgments.md`, one line per claim:

```text
C01 | right or wrong | <command you ran> | <what you saw>
```

**Gate 2:** if 2 or more claims on the issue's path are wrong, stop trusting the
agent's map there. Map that area by hand.

Then open your agent's `$N/repo-map.md`. Mark each of its claims right, wrong or
unchecked. Did it make the same kinds of mistakes?

## Part 4: rule file (S5, 10 min)

Write `AGENTS.md` (or `GEMINI.md`) by hand, in the practice copy. Include:

- the exact baseline command you ran;
- "Do not edit files under tests/ unless I ask.";
- "If the spec and the tests disagree, stop and ask.";
- "Cite file:line for every claim. Say unsure when unsure."

Keep it out of your diffs: `echo AGENTS.md >> .git/info/exclude`.
Start a new agent session and ask it to quote your test command back. If it
cannot, the file did not load. Fix that before Part 5.

## Part 5: reproduce the issue (S6, 5 min)

Read `ISSUE.md`. Run its steps with `.venv/bin/python` in place of `python`
(or run `source .venv/bin/activate` first). Then write one failing test,
`tests/test_issue41.py`, that fails on the shipped code **for the right reason**:
an assertion about a value, not an import error or a typo.

Stop there. Chapter 2 of the playbook,
[The Agent Patch Audit](https://zelinzhu-richard.github.io/repolarisdm/agent-patch-audit/),
walks through locate, fix and attack with this exact bug.

## Stretch: attack a fix before you see one (S12, 15 min)

Imagine an agent sends a fix that turns your test green. Write two more tests in
`tests/test_issue41_stretch.py`: inputs that a weak fix could still get wrong.
Think about inputs the issue does not show. Think about inputs the shipped code
already handles right, and that a fix must not break. The machine a test runs on
is an input too.

Then try your tests on three fixes from your local answer keys: two flawed fixes,
then the reference fix. `K` is the Lab A folder there. Write your tests before
you run this: the loop prints each fix's name, and the names are hints.

```sh
K=/path/to/your/answer-keys/lab-a
for fix in $(python3 "$K/apply_fix.py" --list); do
  echo "== $fix"; python3 "$K/apply_fix.py" "$fix" . && git diff --stat
  .venv/bin/python -m pytest -q tests/test_issue41.py tests/test_issue41_stretch.py
  TZ=Asia/Kolkata .venv/bin/python -m pytest -q tests/test_issue41_stretch.py
  git restore tallyhub
done
```

At least one of your tests should fail on each flawed fix. All of them should
pass on the reference fix. If one fails there, find out why: a wrong test, or a
real behavior change worth a line in the PR? Also read the `git diff --stat` lines. Which file does
each fix change? Is it the file the reporter of `ISSUE.md` blamed?

## Done when

- [ ] `$N/baseline.txt` shows the full suite passing, and you ran it twice.
- [ ] `$N/map.md` has 5 lines, each with a `file:line` you opened.
- [ ] `$N/repo-map.md` is saved, and each of its claims is marked right, wrong or unchecked.
- [ ] All 12 claims are judged in 20 minutes or less, each with one line of tool
      evidence, and all 12 verdicts match your local answer keys. Log each miss.
- [ ] `AGENTS.md` is written by hand, and you confirmed the agent loaded it.
- [ ] `tests/test_issue41.py` fails on the shipped code for the right reason.
- [ ] Stretch: at least one of your stretch tests fails on each of the two flawed
      fixes, and all of them pass on the reference fix.

Score yourself against your local answer keys: 12 of 12, every verdict backed by
evidence. Log each miss in your mistake log (type, step that should have caught
it, minutes lost).

## Files

- `repo/`: tallyhub 0.6.1 (about 850 lines of code, 450 lines of tests). Its own
  `README.md`, `CHANGELOG.md` and `ISSUE.md` are part of the exercise.
- `claims.json`: the 12 claims.
- `lab.json`: metadata for the playbook.
- `requirements.txt`: pinned test tools (same pins as `repo/requirements-dev.txt`).
- `check.py`: proves the lab itself is sound (see below). It does not grade you.

## Check the lab itself

**Spoilers:** `check.py` prints the answers. Run it only after you finish.

```sh
LAB_PYTHON=/path/to/practice/.venv/bin/python python3 labs/lab-a/check.py --keys DIR
```

`DIR` is the Lab A folder in your local answer keys. `check.py` is standard
library only. It runs pytest from `LAB_PYTHON`, else `labs/lab-a/.venv`, else the
Python that runs `check.py`. It prints a `WARN` line if that pytest is not the
pinned version. Every run uses a fresh temp copy of `repo/`. It prints
`PASS`/`FAIL` lines and exits 1 on any failure. It proves that each claim is
right or wrong as the key says, that the visible suite passes, that the issue
reproduces, and that the stretch fixes behave as the key says. It also scans the
playbook pages for Lab A answers and prints `WARN` lines for any it finds.
