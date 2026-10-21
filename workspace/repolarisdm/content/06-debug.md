---
title: Debug like a senior
short: Debug
summary: Make a bug fail on demand, shrink it to the smallest input, and settle every guess with a tool. You will use pdb, lldb, logging, git bisect run, repeated runs and C++ sanitizers. You will also learn which of their outputs you can trust.
---

:::selfcheck
- Write the exit-code contract for a `git bisect run` script. Say why 125 exists. || 0 means good. 1 to 127, except 125, means bad. 125 means "this commit cannot be tested", so git skips it. Any other code (for example 255) stops the bisect. 125 exists so that a commit that does not even build is not called "bad".
- Your shrinker reduced an 80-character failing input to 2 characters. What do you check before you trust the result? || That the small input fails the same way as the original: the same wrong field, the same exception and message. A loose "it fails somehow" test can shrink into a different bug.
- A test passes on your laptop and fails in CI. Name four environment differences you check first. || Time zone (`TZ`), hash seed (`PYTHONHASHSEED`), random seeds, test order, Python and package versions (`pip freeze`), locale, stale build files (`.pyc`, old binaries).
- In pdb, stop at line 11 of `fields.py` only when the variable `quoted` is false. || `b fields.py:11, not quoted`, then `c`.
- Why can `pytest --count=50` never reveal a flake caused by the iteration order of a set of strings? || String hashes are seeded once per process. `--count` repeats the test inside one process, so all 50 runs see the same order. Run fresh processes with different `PYTHONHASHSEED` values instead.
- Write the build line that turns C++ memory errors and undefined behavior into a non-zero exit on macOS. Name one sanitizer Apple clang does not have. || `clang++ -g -O1 -fno-omit-frame-pointer -fsanitize=address,undefined -fno-sanitize-recover=all ...`. Apple clang has no LeakSanitizer and no MemorySanitizer.
:::

## Why Polaris cares

Polaris builds realistic software-engineering tasks for Gemini and looks for the weaknesses of the latest models ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19").
Many real tasks are debugging tasks: a regression, a flaky test, a crash ^[inference](- "2026-10-20").
To build one, you need a failing reproduction, a small input, the first bad commit and a two-sentence root cause.
In one study, agents often failed in this loop: about half of OpenHands' failed SWE-bench Verified issues (49.1%) had errors while iterating and verifying ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20") ([[debug#agent-evidence|sample and caveats]]).
Mechanize, a different company, screens its candidates for debugging that agents cannot do ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20").
And each tool here is also a grader idea: a flaky grader gives random rewards, and a C++ grader without sanitizers accepts memory bugs.

:::tip title="Sprint route: no separate slot"
The sprint has no slot for this chapter. Its 1-hour audit item on Oct 24–27 goes to Lab C ([[tracker#block-2|tracker, block 2]]). Ownership-gate items 1 and 2 use this chapter's core skill: make a failure run on demand, and explain it with file:line. If gate item 1 stalls, read [[debug#repro-script|the repro script]] and [[debug#chronos|use it on Chronos]] inside that item's 1.5 hours. After you apply, do three drills first: `debug-repro-contract` (15 min), `debug-tz-hypotheses` (20 min) and `debug-bisect-demo` (25 min). They use [[debug#pin-environment|pin the environment]] and [[debug#bisect|git bisect run]] too. Then do everything else, including Labs D and E.
:::

## Setup (10 minutes) {#setup}

Work in a temp folder, never inside the portfolio repository. One pinned venv covers every Python example on this page:

```bash
cd "$(mktemp -d)"
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python pytest==8.4.2 hypothesis==6.170.5 pytest-randomly==5.0.0 pytest-repeat==0.9.4
source .venv/bin/activate      # now `pytest` means this venv's pytest
```

`pytest-randomly` shuffles test order on every run once it is installed. Most commands below pass `-p no:randomly` to turn it off, so their output matches ours. For C++ you need only the Xcode Command Line Tools (`clang++`, `lldb`, `atos`).

## The debugging loop {#loop}

Debugging is the "Find" phase of the [[agent-patch-audit]]: [[S6]] Reproduce and [[S7]] Locate. Then [[S9]], [[S11]] and [[S12]] change and prove the fix. Roles: **[Y]** you, **[D]** a deterministic tool, **[A]** an agent.

This is not a new method. It zooms in on moves 2 and 3 of the [[agent-patch-audit#loop|5-move loop]]. Steps 1–2 below are **Reproduce**, and steps 3–5 are **Hypothesize**. Step 6 is moves 4 and 5, **Change** and **Challenge**.

**Gate 3** is the exit check of [[S7]]: two sentences that name the `file:line`, what goes wrong, and why the tests missed it.

| Step | The question | Main tools | What you keep | Audit step |
|---|---|---|---|---|
| 1. Reproduce | Can I make it fail on demand? | a script with exit codes | `repro.sh` | [[S6]] |
| 2. Shrink | What is the smallest input that still fails the same way? | ddmin, Hypothesis, bisect | a 1-minimal input, then a regression test | [[S6]] |
| 3. Hypothesize | What could cause exactly this? | your head first, then the agent | 2–3 hypotheses, each with a prediction | [[S7]] |
| 4. Experiment | Which hypothesis survives? | pdb, lldb, logging, bisect, sanitizers | `debug.md`: each result next to its prediction | [[S7]] |
| 5. Explain | Can I say it in two sentences? | — | Gate 3 | [[S7]] |
| 6. Fix and prove | Does the fix work for the reason I think? | revert-the-fix, property tests | red, green, red again, green again | [[S9]], [[S11]], [[S12]] |

Four rules hold the loop together:

- **Write before you run.** Write the hypothesis and its prediction first. Then run the experiment. Otherwise every result looks "expected".
- **Change one thing at a time.** Two changes at once give you a result you cannot explain.
- **Prefer experiments that can kill a hypothesis.** "Add a print and look" is weak. "If H1 is true, this breakpoint fires; if not, it never fires" is strong.
- **An [A] claim is a guess until a [D] result confirms it.** This includes your own guesses.

## Reproduce {#reproduce}

### A reproduction is a script with an exit code {#repro-script}

A screenshot of a failure is not a reproduction. A reproduction is a command that anyone can run, with a clear answer. Use the same exit-code contract as `git bisect run`:

| Exit code | Meaning |
|---|---|
| 0 | the bug is gone |
| 1 | the bug is here |
| 125 | cannot test: the setup itself is broken |

The running example in this chapter is a ticket against a small CSV splitter: "the coupon field should be empty, but it shows a `"` character."

```bash
#!/usr/bin/env bash
# repro.sh: the ticket "an empty quoted field comes back as a quote".
# Exit 0 = fixed. Exit 1 = the bug is here. Exit 125 = cannot test (setup is broken).
set -u
python3 -B -c 'import fields' 2> /dev/null || { echo "cannot import fields" >&2; exit 125; }
got=$(python3 -B -c 'from fields import split_fields; print(split_fields("a,\"\",b"))') || exit 1
echo "got: $got"
[ "$got" = "['a', '', 'b']" ]
```

Real output (2026-10-20), run on the buggy code, on the fixed code, and in an empty folder:

```text
got: ['a', '"', 'b']
exit=1
got: ['a', '', 'b']
exit=0
cannot import fields
exit=125
```

One script, many uses. You use it to see the bug. `git bisect run` can use it unchanged. An agent can run it in its loop. That matters because self-correction without outside feedback is unreliable on reasoning tasks ^[confirmed](https://arxiv.org/abs/2310.01798 "2026-10-20") and gives small, inconsistent gains for code repair ^[confirmed](https://arxiv.org/abs/2306.09896 "2026-10-20"). And it is already a small grader with three honest verdicts.

One warning before you reuse it as a grader. In bisect, 125 means "skip this commit". In a grader, 125 may only mean "the environment is broken", never "the attempt broke the import". An attempt that cannot even import has failed: score it 0. Otherwise a broken attempt becomes an excluded run, and the pass rate goes up for no real reason ([[runs-and-weaknesses#infra-errors]]).

### Fails for the right reason {#right-reason}

Red is not enough. The test must fail *because of the bug*. Here are two tests for a duration parser where `"1h30m"` returns 3600 instead of 5400. `durations.py` is the buggy parser from [[debug#logging|the logging section]]. The first test has a typo in the import. `test_wrong_reason.py`:

```python
from durations import parse_durations


def test_hours_and_minutes():
    assert parse_durations("1h30m") == 5400
```

`test_right_reason.py` is the same file with the correct name, `parse_duration`:

```python
from durations import parse_duration


def test_hours_and_minutes():
    assert parse_duration("1h30m") == 5400
```

Real output, trimmed, with `echo exit=$?` after each run:

```text
$ pytest -q test_wrong_reason.py
E   ImportError: cannot import name 'parse_durations' from 'durations' (…/durations.py). Did you mean: 'parse_duration'?
ERROR test_wrong_reason.py
exit=2

$ pytest -q test_right_reason.py
E       AssertionError: assert 3600 == 5400
E        +  where 3600 = parse_duration('1h30m')
1 failed in 0.29s
exit=1
```

Both are red. Only the second one shows the bug: a value assertion with the wrong value from the ticket. pytest even tells them apart with its exit code. Its docs define 1 as "some of the tests failed" and 2 as "interrupted by the user" ^[confirmed](https://docs.pytest.org/en/stable/reference/exit-codes.html "2026-10-20"). Our run shows that a collection error also gives 2 (pytest prints `Interrupted: 1 error during collection`). An agent that "reproduced the bug" with the first test has reproduced a typo. Reproduction tests that fail before the fix and pass after it are a strong filter on patches: in SWT-Bench they doubled SWE-Agent's precision ^[confirmed](https://arxiv.org/abs/2406.12952 "2026-10-20").

### Pin the environment {#pin-environment}

A bug that appears "sometimes" depends on something you did not pin. Check these first:

| Source of difference | How to see it | How to pin it |
|---|---|---|
| Time zone | `date +%Z`, `echo $TZ` | `TZ=UTC` before the command |
| String hash order (sets, frozensets, and anything built from them) | different results per process | `PYTHONHASHSEED=0` (or any integer) |
| Random numbers | value changes per run | seed it; print the seed |
| Test order | passes alone, fails in the suite | run with a fixed order or a fixed shuffle seed |
| Versions | `python3 --version`, `pip freeze` | a lock file; `uv pip install -r` with pins |
| Which code runs | `python3 -c 'import fields; print(fields.__file__)'` | one venv; no second copy on `sys.path` |
| Stale build files | old `.pyc`, old binary | delete `__pycache__` folders (`find . -name __pycache__ -prune -exec rm -rf {} +`), then run with `python3 -B` so no new ones appear; `make clean` before each build |
| Locale, network, clock | `locale`, offline run | `LC_ALL=C`, no network, inject the clock |

The "Which code runs" row catches a classic agent mistake: it edits one copy of a module while the tests import another. Lab D and Lab E each show one stale-file trap in their READMEs.

`PYTHONHASHSEED` works as documented: unset or `random` means a random seed per process; an integer fixes it ^[confirmed](https://docs.python.org/3/using/cmdline.html#envvar-PYTHONHASHSEED "2026-10-20").

Here is a time-zone bug you can run. The function promises the UTC day, but `datetime.fromtimestamp(ts)` converts to the machine's local time. Save it as `buckets.py`:

```python
from datetime import datetime


def day_of(ts: float) -> str:
    """Return the UTC calendar day (YYYY-MM-DD) of a Unix timestamp."""
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
```

And the tests as `tests/test_buckets.py`, with a `pyproject.toml` that sets `pythonpath = ["."]` under `[tool.pytest.ini_options]`:

```python
from buckets import day_of


def test_early_morning_utc():
    assert day_of(1792465200) == "2026-10-20"  # 2026-10-20 03:00:00 UTC


def test_late_evening_utc():
    assert day_of(1792537200) == "2026-10-20"  # 2026-10-20 23:00:00 UTC
```

The loop prints pytest's progress line for each zone: one character per test, in file order. `.` means passed and `F` means failed.

```bash
for tz in UTC Europe/London Asia/Tokyo America/Los_Angeles America/New_York; do
  printf '%-20s %s\n' "$tz" "$(TZ=$tz pytest -q -p no:randomly --tb=no 2>&1 | head -1 | awk '{print $1}')"
done
```

Real output (2026-10-20, macOS, Python 3.13):

```text
UTC                  ..
Europe/London        .F
Asia/Tokyo           .F
America/Los_Angeles  F.
America/New_York     F.
```

The first test can only fail west of UTC. The second can only fail east of it. A boundary has two sides; test both. With only the first test, London and Tokyo would look "proven" when they are not.

CI usually runs in UTC, so CI is green. Your laptop in California is red. Neither run is wrong. The environment is part of the input.

The capstone's time model ([[capstone]]) depends on this. Its core rule compares instants: a computation as of `asof` may use only vintages with `published_at <= asof`. If one side is local time and the other is UTC, that comparison is wrong by hours. So every timestamp needs a defined zone. Time-zone offsets are one row of the oracle's boundary-case table.

### When you cannot reproduce {#cannot-reproduce}

"Cannot reproduce" is a finding, not an answer. Do this, in order:

1. Get the exact input, command, version and commit from the report. Ask for them.
2. Diff the environments: `python3 -VV`, `pip freeze`, `env | sort`, `TZ`, `locale`. Run with the reporter's values.
3. Run it many times. If it fails 1 time in 20, it is flaky. See [[debug#flaky|flaky tests]] below.
4. Add logging at the decision points ([[debug#logging|logging]]) and ask the reporter to run that build.
5. Run in the reporter's environment: their Docker image, their CI job.

Never accept an agent's "I could not reproduce it, so I made the code more robust". That is a fix for nothing ([[M2]]).

## Shrink the input {#shrink}

### The idea: delta debugging {#delta-debugging}

A big failing input hides the cause. Shrink it first. **Delta debugging** (Zeller and Hildebrandt, 2002) automates this: cut the input into chunks, keep any smaller piece that still fails, and cut finer when nothing smaller fails. Their tool reduced 896 lines of HTML that crashed Mozilla to the single line that caused the crash ^[confirmed](https://doi.org/10.1109/32.988498 "2026-10-20").

The result is **1-minimal**: removing any single item makes the failure go away. It is not always the globally smallest input. It is small enough to read.

`git bisect` is the same idea applied to history: it shrinks a range of commits to one.

### ddmin in 30 lines {#ddmin-code}

This is our own short version of the algorithm, `ddmin.py`. It works on any list: characters, lines, tokens, test names.

```python
"""ddmin: shrink a failing input to a 1-minimal one (Zeller and Hildebrandt, 2002)."""


def ddmin(items: list, fails) -> list:
    """Return a smaller list that still fails.

    fails(candidate) must return True only for the SAME failure you saw.
    The result is 1-minimal: removing any one item makes the failure go away.
    """
    if not fails(items):
        raise ValueError("the full input must fail before you shrink it")
    n = 2  # how many chunks to cut the input into
    while len(items) >= 2:
        size = -(-len(items) // n)  # chunk size, rounded up
        chunks = [items[k : k + size] for k in range(0, len(items), size)]
        smaller = None
        for chunk in chunks:  # 1. does one chunk fail on its own?
            if fails(chunk):
                smaller, n = chunk, 2
                break
        if smaller is None:
            for k in range(len(chunks)):  # 2. does it still fail without one chunk?
                rest = [x for j, c in enumerate(chunks) if j != k for x in c]
                if fails(rest):
                    smaller, n = rest, max(n - 1, 2)
                    break
        if smaller is not None:
            items = smaller
        elif n >= len(items):
            break  # every chunk is one item and each one is needed
        else:
            n = min(2 * n, len(items))  # cut finer and try again
    return items
```

The code under test, `fields.py`, has a bug (do not look for it yet):

```python
"""Split one CSV line into fields (the code under test, with a bug)."""


def split_fields(line: str) -> list[str]:
    fields, cur = [], []
    quoted = False
    i = 0
    while i < len(line):
        c = line[i]
        if c == '"' and line[i + 1 : i + 2] == '"':
            cur.append('"')  # "" is an escaped quote
            i += 2
            continue
        if c == '"':
            quoted = not quoted
        elif c == "," and not quoted:
            fields.append("".join(cur))
            cur = []
        else:
            cur.append(c)
        i += 1
    fields.append("".join(cur))
    return fields
```

### Pin the symptom, or you shrink into a different bug {#pin-the-symptom}

The ticket came with an 80-character line from the export (we wrote this line for the example). `shrink.py` shrinks it twice, with two different failure tests. The oracle is Python's `csv` module.

```python
"""Shrink the failing line from the ticket, with two different failure tests."""
import csv

from ddmin import ddmin
from fields import split_fields

LINE = '2026-10-19,ord-1182,6"x4" frame,"ACME, Inc.",49.90,"",paid,"said ""rush"" twice"'


def expected(line: str) -> list[str]:
    return next(csv.reader([line]))  # the oracle: Python's csv module


def any_difference(line: str) -> bool:
    return split_fields(line) != expected(line)


def same_symptom(line: str) -> bool:
    """The ticket's symptom: a field that should be empty comes back as one quote."""
    got, want = split_fields(line), expected(line)
    return len(got) == len(want) and any(w == "" and g == '"' for g, w in zip(got, want))


if __name__ == "__main__":
    print(f"{len(LINE)} characters: {split_fields(LINE)}")
    for test in (any_difference, same_symptom):
        calls = 0

        def counted(chars, test=test):
            global calls
            calls += 1
            return test("".join(chars))

        small = "".join(ddmin(list(LINE), counted))
        print(f"{test.__name__:14} -> {small!r:5} after {calls:2} tests: got {split_fields(small)}, want {expected(small)}")
```

Real output (`python3 -B shrink.py`, 2026-10-20):

```text
80 characters: ['2026-10-19', 'ord-1182', '6x4 frame', 'ACME, Inc.', '49.90', '"', 'paid', 'said "rush" twice']
any_difference -> '6"'  after 12 tests: got ['6'], want ['6"']
same_symptom   -> '""'  after 38 tests: got ['"'], want ['']
```

Look at the first line. The ticket's bug is field 6 (`'"'` instead of `''`). But field 3 also differs: `6"x4" frame` became `6x4 frame`.

- The loose test (`any_difference`) shrank to `6"`. That is a **different** difference. Fixing it would not close the ticket. It may not even be a bug: RFC 4180 says quotes may not appear inside a field that is not enclosed in quotes ^[confirmed](https://www.rfc-editor.org/rfc/rfc4180 "2026-10-20"). That input is malformed, and the spec must decide what to do with it.
- The pinned test (`same_symptom`) shrank to `""`, two characters. That is the ticket's bug.

This is the most important lesson of the section. **A shrinker keeps whatever your failure test accepts. Make the test match the symptom you saw.** The same rule appears in `git bisect run` (exit 125, below) and in grader design ([[grader-validity]]): a check that accepts "any failure" measures the wrong thing.

### Test the shrinker itself {#test-ddmin}

A tool you use for evidence needs its own tests. `test_ddmin.py` has three example tests and one property test (Hypothesis):

```python
import pytest
from hypothesis import given, strategies as st

from ddmin import ddmin
from shrink import LINE, same_symptom


def test_keeps_only_the_needed_items():
    fails = lambda c: "x" in c and "y" in c
    assert ddmin(list("abxcdyef"), fails) == ["x", "y"]


def test_csv_result_is_one_minimal():
    small = ddmin(list(LINE), lambda c: same_symptom("".join(c)))
    assert same_symptom("".join(small))  # it still fails the same way
    for k in range(len(small)):  # and every single character is needed
        assert not same_symptom("".join(small[:k] + small[k + 1 :]))


def test_refuses_an_input_that_does_not_fail():
    with pytest.raises(ValueError):
        ddmin(list("abc"), lambda c: False)


@given(st.lists(st.integers(), min_size=1, max_size=60, unique=True), st.data())
def test_finds_exactly_the_needed_set(items, data):
    needed = data.draw(st.sets(st.sampled_from(items), min_size=1))
    result = ddmin(items, lambda c: needed <= set(c))
    assert result == [x for x in items if x in needed]  # same items, same order
```

Then a revert-style check ([[prove#mutation-check|the mutation check]]): we disabled step 2 (the "drop one chunk" loop) and ran the tests again. Real output:

```text
$ pytest -q -p no:randomly test_ddmin.py
....                                                                     [100%]
4 passed in 0.69s
# after disabling step 2:
FAILED test_ddmin.py::test_keeps_only_the_needed_items - AssertionError: asse...
FAILED test_ddmin.py::test_csv_result_is_one_minimal - assert not True
FAILED test_ddmin.py::test_finds_exactly_the_needed_set - assert [0, 1, -1, 2...
3 failed, 1 passed in 0.65s
```

(The Hypothesis example in the last `FAILED` line differs per run.)

Three of four tests catch the broken version. The fourth test checks only the input guard, so it should not catch it.

### Let a generator shrink for you {#hypothesis-shrinks}

When you generate inputs with Hypothesis, you get shrinking for free. A round-trip property is a strong oracle here: write fields with the real `csv.writer`, so every input is valid CSV, then parse them back.

```python
import csv
import io

from hypothesis import given, strategies as st

from fields import split_fields


def to_line(fields: list[str]) -> str:
    out = io.StringIO()
    csv.writer(out, lineterminator="").writerow(fields)  # a real writer makes valid CSV only
    return out.getvalue()


@given(st.lists(st.text(alphabet='ab,"', max_size=6), min_size=1, max_size=4))
def test_round_trip(fields):
    assert split_fields(to_line(fields)) == fields
```

Real output (Hypothesis 6.170.5, trimmed):

```text
E       assert ['"'] == ['']
E       Failing test case: test_round_trip(
E           fields=[''],
E       )
1 failed in 0.38s
```

Hypothesis found a failure and shrank it to one empty field, which `csv.writer` writes as `""`. Same minimal case as ddmin, with no shrinker code. Because the generator only makes valid CSV, it cannot wander into the malformed `6"` case.

## Hypotheses and experiments {#hypotheses}

You now have a 2-character input. Do not jump to a fix. Write a small debug log, `debug.md`, with one row per hypothesis. Fill the "prediction" column **before** you run anything.

| # | Hypothesis | Prediction if true | Experiment (cheapest first) | Result |
|---|---|---|---|---|
| H3 | The final `fields.append` drops empty fields. | `split_fields('a,,b')` is also wrong. | one line of Python, 5 seconds | `['a', '', 'b']`: correct. **Killed.** |
| H2 | The oracle is wrong: `""` should mean one quote. | The spec says a lone `""` is a quote. | read RFC 4180; `csv.writer` on `['']` | RFC rule 7 escapes quotes only *inside* a quoted field; `csv.writer` writes `['']` as `""`. **Killed.** |
| H1 | The `""` escape branch runs outside quotes. | A breakpoint on line 11 with condition `not quoted` fires for `""`. | pdb, 2 minutes (next section) | Fires with `quoted == False`. **Survives.** |

Real output for H3 and H2 (2026-10-20):

```text
>>> split_fields('a,,b')
['a', '', 'b']
>>> out = io.StringIO(); csv.writer(out, lineterminator='').writerow(['']); out.getvalue()
'""'
```

**Gate 3 in two sentences:** "`fields.py:10` treats any `""` as an escaped quote, even when the parser is not inside a quoted field, so an empty quoted field (an opening and a closing quote) becomes one literal quote character. No test had an empty quoted field, so this branch never ran with `quoted == False`."

The fix follows from the sentence: check `quoted` first, `if quoted and c == '"' and line[i + 1 : i + 2] == '"':`. Then prove it ([[S12]]). `test_fields.py` holds the ticket's case, the shrunk case, and a guard for the behavior the fix must keep:

```python
from fields import split_fields


def test_empty_quoted_field():
    got = split_fields('a,"",b')
    assert got == ["a", "", "b"]


def test_shrunk_case_from_ddmin():
    assert split_fields('""') == [""]


def test_escaped_quote_inside_quotes_still_works():
    assert split_fields('"say ""hi""",x') == ['say "hi"', "x"]
```

Real output: with the fix, `3 passed`. With the old line put back, `2 failed, 1 passed`: the two bug tests fail, the guard passes on both versions, as it should. The round-trip property passes with the fix.

### Why agents need the log {#agent-evidence}

Liu et al. hand-labeled 150 failed cases on SWE-bench Verified, about 50 per tool for three tools. The issues were a random sample of those that at least one tool failed ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20"). For the two agent tools, about half of the failed issues had errors in the "Iteration & Validation" stage. That was 49.1% for OpenHands and 51.7% for Tools + Claude 3.5 Sonnet. For OpenHands, that share rose from 27% on easy tasks to 64% on hard ones. But only 20 of the 150 issues were hard, so read the trend as a hint, not a measurement.

The errors in that stage include misreading reproduction output, non-progressive iteration and blind strategy switching ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20"). A written prediction stops all three. You cannot misread a result you predicted in writing. You cannot loop when each row must kill something.

A prompt that gets hypotheses, not edits:

```text
Read-only. Do not edit files.
Failing input: split_fields('""') returns ['"'] but the spec (RFC 4180) gives [''].
Give me 3 hypotheses for the root cause. For each one: file:line, the mechanism in
one sentence, a prediction that would be true only if this hypothesis is true,
and the cheapest command that checks the prediction. Say "unsure" when unsure.
```

Then you run the commands, or you read the agent's raw output yourself. The agent's summary of a result is a claim ([[M6]]).

## pdb essentials {#pdb}

pdb is Python's built-in debugger. It runs your program and stops where you ask. You need about twelve commands.

**Four ways to start:**

| Start | Command | When |
|---|---|---|
| Run a script under pdb | `python3 -m pdb repro.py` | you know where to stop |
| Stop at a line in code | `breakpoint()` in the source | quick, local; `PYTHONBREAKPOINT=0` turns every call off |
| After a test fails | `pytest --pdb` (add `-x` to stop at the first) | you want the failing frame with its locals |
| At the start of each test | `pytest --trace` | you want to step through a test from line 1 |

When you run a script with `python3 -m pdb` and it crashes, pdb enters post-mortem mode automatically: you land in the frame that raised ^[confirmed](https://docs.python.org/3/library/pdb.html "2026-10-20").

**The commands:**

| Command | Short | What it does |
|---|---|---|
| `break file.py:11, cond` | `b` | stop at a line; with `, cond` only when `cond` is true |
| `continue` | `c` | run until the next stop |
| `next` / `step` | `n` / `s` | run one line; `step` goes into calls |
| `return` / `until` | `r` / `unt` | run to the end of this function / past this loop |
| `p expr` / `pp expr` | | print a value / pretty-print it |
| `args` | `a` | the current function's arguments |
| `where` | `w` | the call stack; the arrow marks the current frame |
| `up` / `down` | `u` / `d` | move between frames to read the callers' variables |
| `list` / `longlist` | `l` / `ll` | show source around the current line / the whole function |
| `display expr` | | print `expr` every time it changes at a stop; for a list or dict, display a copy such as `list(x)` |
| `clear N` | `cl N` | delete breakpoint N |
| `exceptions` | | list chained exceptions in post-mortem (new in Python 3.13) |
| `quit` | `q` | leave |

### Session 1: kill or keep H1 {#pdb-session}

`repro.py` holds two lines: `from fields import split_fields` and `print(split_fields('a,"",b'))`. Real session (2026-10-20, Python 3.13.9; paths shortened). The commands we typed come after each `(Pdb)` prompt:

```text
$ python3 -m pdb repro.py
> repro.py(1)<module>()
-> from fields import split_fields
(Pdb) b fields.py:11, not quoted
Breakpoint 1 at fields.py:11
(Pdb) c
> fields.py(11)split_fields()
-> cur.append('"')  # "" is an escaped quote
(Pdb) p i, c, quoted, line[i:i+2]
(2, '"', False, '""')
(Pdb) p fields, cur
(['a'], [])
(Pdb) n
> fields.py(12)split_fields()
-> i += 2
(Pdb) n
> fields.py(13)split_fields()
-> continue
(Pdb) n
> fields.py(8)split_fields()
-> while i < len(line):
(Pdb) p i, cur, quoted
(4, ['"'], False)
(Pdb) cl 1
Deleted breakpoint 1 at fields.py:11
(Pdb) c
['a', '"', 'b']
The program finished and will be restarted
```

The conditional breakpoint fired, so the prediction of H1 came true: the escape branch ran with `quoted == False` at index 2. After it, `cur` holds one quote and the parser never entered "quoted" mode. That is the whole bug, seen directly.

### Session 2: post-mortem from a failing test {#pdb-postmortem}

Here `test_fields.py` holds only its first test, `test_empty_quoted_field`, and the code is still buggy.

```text
$ printf '%s\n' 'p got' 'pp locals().keys()' 'q' | pytest -q -p no:randomly --pdb test_fields.py
>       assert got == ["a", "", "b"]
E       assert ['a', '"', 'b'] == ['a', '', 'b']
E         At index 1 diff: '"' != ''
>>>>>>>>>>>>>>>>>> PDB post_mortem (IO-capturing turned off) >>>>>>>>>>>>>>>>>>>
> test_fields.py(6)test_empty_quoted_field()
-> assert got == ["a", "", "b"]
(Pdb) ['a', '"', 'b']
(Pdb) dict_keys(['got', '@py_assert2', '@py_assert1', '@py_format4', '@py_format6'])
```

We piped the commands in so the output could be captured, which is why the commands do not appear after the prompts. The `@py_` names are pytest's assertion rewriting. Ignore them.

### Batch mode: a debugger result you can save {#pdb-batch}

Interactive sessions leave no record. The `-c` option runs commands as if they were in a `.pdbrc` file ^[confirmed](https://docs.python.org/3/library/pdb.html "2026-10-20"). With stdin closed, pdb runs them and exits. Real output:

```text
$ python3 -B -m pdb -c 'b fields.py:11, not quoted' -c c -c 'p i, c, quoted, line[i:i+2]' -c q repro.py < /dev/null
Breakpoint 1 at fields.py:11
(2, '"', False, '""')
```

Paste that into `debug.md` as the evidence for H1. Give the same form to an agent: it cannot drive an interactive prompt well, but it can run this command and you can re-run it ([[S11]]).

:::tip title="Hangs: get a stack instead of waiting"
A test that never ends is a debugging problem too. pytest can dump every thread's stack after a timeout: `pytest -o faulthandler_timeout=60`. Here is `test_hang.py`, stuck in a `while` loop:

```python
import time


def wait_for(flag):
    while not flag:  # nothing ever sets the flag
        time.sleep(0.1)


def test_waits_forever():
    wait_for([])
```

Real output of `pytest -q -p no:randomly -o faulthandler_timeout=2 test_hang.py`: `Timeout (0:00:02)!` followed by `File "test_hang.py", line 6 in wait_for`. It does not stop the test. Stop it yourself (Ctrl-C) after you read the stack. For any Python program, `PYTHONFAULTHANDLER=1` dumps the traceback on fatal signals such as SIGSEGV and SIGABRT ^[confirmed](https://docs.python.org/3/using/cmdline.html#envvar-PYTHONFAULTHANDLER "2026-10-20").
:::

## lldb essentials (macOS) {#lldb}

On an Apple Silicon Mac, use **lldb**. It ships with the Xcode Command Line Tools. gdb is not installed on this machine, and a 2023 thread on GDB's own mailing list says GDB has no native support for arm64 macOS programs ^[reported](https://inbox.sourceware.org/gdb/87h6pu9zjd.fsf%40tromey.com/T/ "2026-10-20"). Use gdb only on Linux or inside Docker.

**The permission prompt.** The first time in a login session that you debug one of your own processes, macOS asks for an administrator password (`man DevToolsSecurity`) ^[confirmed](https://keith.github.io/xcode-man-pages/DevToolsSecurity.8.html "2026-10-20"). On the build machine, `DevToolsSecurity -status` printed `Developer mode is currently disabled.` So we did **not** run live lldb sessions (`run`, `bt`, `frame variable`) for this page. Their syntax is checked against lldb's own `help` (lldb-2100.0.17.203). Commands that do not start the program were run, and their output below is real. [[lab:lab-d]] has a full lldb drill.

**pdb and lldb side by side:**

| Task | pdb | lldb |
|---|---|---|
| Load and start | `python3 -m pdb prog.py` | `lldb ./prog`, then `run` (`r`) |
| Break at a line | `b file.py:12` | `b file.cpp:12` |
| Break in a function | `b func` | `b func` |
| Only when a condition holds | `b file.py:12, x > 3` | `breakpoint modify --condition 'x > 3' 1` |
| Call stack | `w` | `bt` |
| Move between frames | `u`, `d` | `up`, `down`, `frame select 2` (`f 2`) |
| Local variables | `a`, `p locals()` | `v` (`frame variable`) |
| Evaluate | `p expr` | `p expr` (`dwim-print`; use `expression expr` for full evaluation) |
| Over / into / out | `n`, `s`, `r` | `n`, `s`, `finish` |
| Continue | `c` | `c` |
| Watch a value | `display x` | `watchpoint set variable x` |
| Batch, no prompt | `-c 'cmd' ... < /dev/null` | `lldb --batch -o 'cmd' ...` |
| Quit | `q` | `q` |

Build for the debugger with `-O0 -g`. At `-O2`, variables are often "optimized out" and lines run out of order.

**Static commands (they do not run the program).** They turn an address from a crash report into `file:line`, set breakpoints, and show source. Real output, trimmed (we cut lldb's two `target create` lines), on the sanitizer binary `stale` from [[debug#stale-reference|the stale-reference example]] below:

```text
$ lldb --batch -o 'image lookup --address 0x100000b00' -o 'breakpoint set --file stale.cpp --line 8' -o 'source list --file stale.cpp --line 7 --count 3' stale
(lldb) image lookup --address 0x100000b00
      Address: stale[0x0000000100000b00] (stale.__TEXT.__text + 584)
      Summary: stale`main + 584 at stale.cpp:9:30
(lldb) breakpoint set --file stale.cpp --line 8
Breakpoint 1: where = stale`main + 288 at stale.cpp:8:20, address = 0x00000001000009d8
(lldb) source list --file stale.cpp --line 7 --count 3
   7   	  int& best = scores[0];
   8   	  scores.push_back(60);  // may move every element to a new buffer
   9   	  std::printf("best = %d\n", best);
   10  	  return 0;
```

`--count 3` printed four lines here (7 to 10). Do not rely on the exact count.

**Batch mode for a crash.** `--batch` runs the `-o` commands and quits. `-k` (`--one-line-on-crash`) runs a command only if the program crashes ^[confirmed](https://lldb.llvm.org/man/lldb.html "2026-10-20"). Checked against `lldb --help` on 2026-10-20, not run (permission prompt). In your Lab D practice copy, run `make debug` first. It builds `build/test_ringlog_debug` with `-O0 -g`.

```bash
lldb --batch -o run -k bt -k 'frame variable' -- ./build/test_ringlog_debug
```

That gives you a saved stack and locals at the crash: evidence you can paste, and a command an agent can run.

## Logging that helps {#logging}

A debugger shows one run. Logs show runs you were not watching: CI, a user's machine, an agent's sandbox, a grader on 500 attempts. Good logs answer "what did the code believe at each decision?"

Here is the duration parser from earlier, with two debug lines at its decision points:

```python
"""Parse durations like "1h30m" into seconds (the buggy version, with logging)."""
import logging
import re

log = logging.getLogger(__name__)

UNITS = {"d": 86400, "h": 3600, "m": 60, "s": 1}
_PART = re.compile(r"(\d)([dhms])")


def parse_duration(text: str) -> int:
    text = text.replace(" ", "")
    parts = _PART.findall(text)
    log.debug("parse_duration text=%r parts=%r", text, parts)
    if not parts:
        raise ValueError(f"not a duration: {text!r}")
    total = sum(int(n) * UNITS[u] for n, u in parts)
    log.debug("parse_duration total=%d", total)
    return total
```

The entry point sets the level from an environment variable and sends logs to stderr, so stdout stays clean for the real output:

```python
import logging
import os
import sys

from durations import parse_duration

logging.basicConfig(
    level=os.environ.get("LOGLEVEL", "WARNING"),
    format="%(levelname)s %(name)s:%(lineno)d %(message)s",
    stream=sys.stderr,  # stdout stays clean for the real output
)
print(parse_duration(sys.argv[1]))
```

Real output:

```text
$ python3 -B cli.py 1h30m
3600
$ LOGLEVEL=DEBUG python3 -B cli.py 1h30m
DEBUG durations:14 parse_duration text='1h30m' parts=[('1', 'h'), ('0', 'm')]
DEBUG durations:18 parse_duration total=3600
3600
```

One line shows the bug: `30m` was read as `0m`. The pattern matches one digit, not one or more. You did not need a debugger, because the log printed the intermediate value with `%r`.

In tests, pytest shows captured logs for failing tests, and `--log-cli-level=DEBUG` prints them live. Real output:

```text
-------------------------------- live log call ---------------------------------
DEBUG    durations:durations.py:14 parse_duration text='1h30m' parts=[('1', 'h'), ('0', 'm')]
DEBUG    durations:durations.py:18 parse_duration total=3600
FAILED                                                                   [100%]
```

Rules for logs that help:

- **Log at boundaries and decisions.** Inputs, the branch taken, outputs. Not every line.
- **Use `%r`.** It shows quotes, spaces, `None` and types. `'1h30m '` and `'1h30m'` look the same with `%s`.
- **Use `log.debug("x=%r", x)`, not an f-string.** The logging HOWTO says formatting of the arguments is deferred until it cannot be avoided ^[confirmed](https://docs.python.org/3/howto/logging.html "2026-10-20"), so disabled debug lines cost almost nothing.
- **Default to WARNING.** That is logging's default level ^[confirmed](https://docs.python.org/3/howto/logging.html "2026-10-20"). Turn DEBUG on with an environment variable, not by editing code.
- **Add the IDs that join events:** seed, commit SHA, task ID, attempt ID.
- **Keep the traceback.** In an `except` block, `log.exception("...")` records it. A bare `except: pass` deletes the evidence ([[M4]]).
- **Never log secrets:** tokens, API keys, passwords.

**For a grader,** this means: write one result per check, with the inputs and the seed, to a file such as `reward.json`. A grader that prints only `0` cannot be debugged, and you cannot defend its verdict in review ([[grader-validity]]).

## git bisect run, with skip (exit 125) {#bisect}

`git bisect` binary-searches history between a known-good and a known-bad commit. It is a binary search, so the number of tests grows with log2 of the number of commits ^[inference](- "2026-10-20"). The manual's own example shows 675 revisions left, roughly 10 steps ^[confirmed](https://git-scm.com/docs/git-bisect "2026-10-20"). `git bisect run <cmd>` automates it. Your command answers with its exit code:

| Exit code | Meaning for `git bisect run` |
|---|---|
| 0 | good: this commit does not have the bug |
| 1 to 127, except 125 | bad: this commit has the bug |
| 125 | skip: this commit cannot be tested |
| anything else | stop the whole bisect |

The manual explains why 125 is the skip code: 126 and 127 are taken by POSIX shells, for "command found but not executable" and "command not found" ^[confirmed](https://git-scm.com/docs/git-bisect "2026-10-20"). So a typo in your script counts as **bad**, silently. Test the script on both ends before you trust it. `exit -1` becomes 255, which stops the bisect.

### A worked example: 40 commits, two of them broken {#bisect-demo}

`make_bisect_demo.py` builds a 40-commit history of a small `parse_duration` module in a new temp folder. It uses fixed names and dates, so your commit IDs match ours. At `v1.0`, `parse_duration("1h30m")` returns 5400. On `main` it returns 3600. Two commits in the range cannot even be imported.

:::reveal title="Show make_bisect_demo.py (copy it without reading it: it contains the answer)"
```python
"""Build a 40-commit practice repo for git bisect in a new temp folder; print its path.

Fixed names and dates, so everyone gets the same commit ids.
"""
import os
import subprocess
import sys
import tempfile

BROKEN = {20: "syntax", 33: "name"}  # commits that cannot even be imported
BUG = 27  # the commit that breaks "1h30m"

NOTES = [
    "docs: add usage example", "test: cover plain seconds", "docs: explain units",
    "chore: add .gitignore", "feat: support days (d)", "docs: list supported units",
    "test: cover days", "style: shorter names", "docs: add changelog", "test: cover 0s",
    "chore: pin python 3.9+", "feat: allow spaces between parts", "test: cover spaces",
    "docs: fix typo", "refactor: move UNITS up", "test: more mixed inputs",
    "docs: add FAQ", "chore: tidy imports", "docs: error message ideas",
    "wip: start better error messages", "feat: better error messages", "test: cover bad input",
    "style: line length", "docs: add roadmap", "test: cover large values",
    "docs: note on overflow", "refactor: tighten the pattern", "docs: pattern note",
    "test: cover 1d1s", "chore: bump version", "docs: badges", "test: cover 2h",
    "wip: split parser into helpers", "refactor: finish helper split",
    "docs: helper docstrings", "test: cover 45m", "docs: release notes",
    "chore: release prep", "docs: thanks", "chore: release 2.0",
]


def source(k: int) -> str:
    letters = "dhms" if k >= 5 else "hms"
    digits = r"\d" if k >= BUG else r"\d+"
    days = '"d": 86400, ' if k >= 5 else ""
    spaces = '    text = text.replace(" ", "")\n' if k >= 12 else ""
    error = '        raise ValueError(f"not a duration: {text!r}")'
    if BROKEN.get(k) == "syntax":
        error = '        raise ValueError(f"not a duration: {text!r}"'  # missing ")"
    helper = "_parts = _split_parts\n" if BROKEN.get(k) == "name" else ""  # name not defined yet
    return (
        '"""Parse durations like "1h30m" into seconds."""\n'
        "import re\n\n"
        f"UNITS = {{{days}\"h\": 3600, \"m\": 60, \"s\": 1}}\n"
        f"_PART = re.compile(r\"({digits})([{letters}])\")\n"
        f"{helper}\n\n"
        "def parse_duration(text: str) -> int:\n"
        f"{spaces}"
        "    parts = _PART.findall(text)\n"
        "    if not parts:\n"
        f"{error}\n"
        "    return sum(int(n) * UNITS[u] for n, u in parts)\n"
    )


def main() -> None:
    repo = os.path.join(tempfile.mkdtemp(prefix="bisect-demo."), "durations")
    os.makedirs(repo)
    git = lambda *a, **kw: subprocess.run(
        ["git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "tag.gpgSign=false", *a],
        cwd=repo, check=True, capture_output=True, **kw)
    git("init", "-q", "-b", "main")
    for k, message in enumerate(NOTES, start=1):
        with open(os.path.join(repo, "durations.py"), "w") as f:
            f.write(source(k))
        with open(os.path.join(repo, "NOTES.md"), "a") as f:
            f.write(f"- {message}\n")
        date = f"2026-09-{1 + k // 2:02d}T{9 + k % 2 * 4}:00:00+00:00"
        env = {**os.environ, "GIT_AUTHOR_NAME": "Practice", "GIT_AUTHOR_EMAIL": "practice@example.invalid",
               "GIT_COMMITTER_NAME": "Practice", "GIT_COMMITTER_EMAIL": "practice@example.invalid",
               "GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date}
        git("add", "-A", env=env)
        git("commit", "-q", "-m", message, env=env)
        if k == 1:
            git("tag", "v1.0")
    git("tag", "v2.0")
    print(repo)


if __name__ == "__main__":
    sys.exit(main())
```
:::

Save it outside any repo, then:

```bash
cd "$(python3 -B make_bisect_demo.py)"   # needs python3 3.9+ and git 2.28+
git log --oneline -1                     # 4469699 chore: release 2.0
```

Two check scripts, saved in the folder above the repo (`..`), so a checkout cannot change them:

```bash
#!/usr/bin/env bash
# ../check_sloppy.sh: any failure counts as "bad".
got=$(python3 -B -c 'from durations import parse_duration; print(parse_duration("1h30m"))')
[ "$got" = 5400 ]
```

```bash
#!/usr/bin/env bash
# ../check.sh. For git bisect run: exit 0 = good, 1 = bad, 125 = this commit cannot be tested.
cd "$(git rev-parse --show-toplevel)" || exit 255      # 255 stops the whole bisect
python3 -B -c 'import durations' 2> /dev/null || exit 125
got=$(python3 -B -c 'from durations import parse_duration; print(parse_duration("1h30m"))') || exit 1
[ "$got" = 5400 ] && exit 0 || exit 1
```

Test `check.sh` on both ends first. Real output: `v1.0 exit=0`, `main exit=1`.

**The sloppy script** (real output, trimmed):

```text
$ git bisect start main v1.0 && git bisect run bash ../check_sloppy.sh
Bisecting: 19 revisions left to test after this (roughly 4 steps)
[512138a22dae4428e1eb8ce0be0537721871d9b0] wip: start better error messages
running 'bash' '../check_sloppy.sh'
    raise ValueError(f"not a duration: {text!r}"
                    ^
SyntaxError: '(' was never closed
Bisecting: 9 revisions left to test after this (roughly 3 steps)
...
512138a22dae4428e1eb8ce0be0537721871d9b0 is the first 'bad' commit
...
    wip: start better error messages
...
bisect found first 'bad' commit
```

It names a work-in-progress commit with a syntax error. That commit is broken, but not in the way the ticket describes. The answer looks confident and is wrong. An agent that ran this and reported "the regression came from the error-message work" would be making [[M2]] with a [D] tool.

**The correct script** (real output, trimmed):

```text
$ git bisect start main v1.0 && git bisect run bash ../check.sh
Bisecting: 19 revisions left to test after this (roughly 4 steps)
[512138a22dae4428e1eb8ce0be0537721871d9b0] wip: start better error messages
running 'bash' '../check.sh'
Bisecting: 19 revisions left to test after this (roughly 4 steps)
[95251f024371338337951f34a461765b6ea0b678] docs: pattern note
...
71b16d233d796277bad191e08d753458265b7b3b is the first 'bad' commit
...
    refactor: tighten the pattern

 NOTES.md     | 1 +
 durations.py | 2 +-
 2 files changed, 2 insertions(+), 1 deletion(-)
bisect found first 'bad' commit
$ git bisect log | grep -E '^git bisect (good|bad|skip)'
git bisect skip 512138a22dae4428e1eb8ce0be0537721871d9b0
git bisect bad 95251f024371338337951f34a461765b6ea0b678
git bisect good 3506e3cf71bc838fbbbb9e9bed3755911401e7dd
git bisect good 6d8a5ed38069c0eab68d99af0ff3dd9c412690bf
git bisect good 223a05a0b36a6a6e7f2a6359978cfef74ddc0322
git bisect good 5694d5ce47d69057c00f4d1deb74ff390ec14d81
git bisect bad 71b16d233d796277bad191e08d753458265b7b3b
```

The broken commit was skipped (125), and git moved to a nearby commit. Seven tests found the commit that changed the pattern. The other broken commit (number 33) was never tested, because it lies after the bug. The sloppy run used two tests fewer and got the wrong answer.

The design rule behind `check.sh`: **"can this commit be tested?" means "can my reproduction run?"** Import failure means 125. A crash inside `parse_duration` means bad, because that is behavior. Then `git bisect reset` returns you to `main`.

### When skip cannot decide {#bisect-skip-limit}

If the commit right before the first bad one is untestable, bisect cannot tell which of the two broke it. To show this, we marked commit 26 as untestable by hand (`git bisect skip 5694d5c`) and ran the correct script. Real output:

```text
There are only 'skip'ped commits left to test.
The first 'bad' commit could be any of:
5694d5ce47d69057c00f4d1deb74ff390ec14d81
71b16d233d796277bad191e08d753458265b7b3b
We cannot bisect more!
error: bisect run cannot continue any more
```

Then read both diffs yourself. Often one of them only touches docs, and the answer is clear.

### Verify the answer, then use the options {#bisect-verify}

A bisect result is a claim too. Check it by hand on the named commit and on its parent:

```bash
bad=71b16d2
git checkout -q "$bad^" && python3 -B -c 'from durations import parse_duration as p; print(p("1h30m"))'   # 5400
git checkout -q "$bad"  && python3 -B -c 'from durations import parse_duration as p; print(p("1h30m"))'   # 3600
git checkout -q main && git show "$bad" -- durations.py
```

Useful options, all from the git-bisect manual ^[confirmed](https://git-scm.com/docs/git-bisect "2026-10-20"):

- After one wrong `good`: `git bisect log > bisect.log`, delete the wrong line, `git bisect reset`, then `git bisect replay bisect.log`.
- `git bisect start BAD GOOD -- path/` only tests commits that touch that path.
- `git bisect start --first-parent` follows only the first parent at merges. Use it when merged branches contain broken commits but each merge was fine.
- `git bisect start --term-old fast --term-new slow` hunts for a change that is not a "bug", for example a slowdown. Make a timing check robust (repeat it, use a wide threshold), or the bisect itself turns flaky.
- `git bisect visualize` (or `view`) shows the commits still in play.

For Polaris: the parent of the first bad commit is a known-good state, and the bad commit's diff tells you exactly what broke. Together they give you a task's starting point and the core of a reference fix ([[task-design]]). SWE-bench builds its tasks from history in a similar way: a repo snapshot before a real fix, graded with tests from that fix ^[confirmed](https://arxiv.org/abs/2310.06770 "2026-10-20"). [[lab:lab-e]] trains bisect on 200 commits with eight broken ones.

## Flaky tests {#flaky}

A **flaky test** passes and fails on the same code. At Google, about 1.5% of all test runs reported a flaky result, almost 16% of tests had some flakiness, and about 84% of observed pass-to-fail transitions involved a flaky test (John Micco, 2016) ^[confirmed](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html "2026-10-20").
Luo et al. classified 161 flaky-test fixes from Apache projects. The top causes were async waits (74), concurrency (32) and test order dependency (19) ^[confirmed](https://doi.org/10.1145/2635868.2635920 "2026-10-20").
In the same study, 38 of the 161 fixes (24%) changed the code under test, and 94% of those fixed a real bug in it ^[confirmed](https://doi.org/10.1145/2635868.2635920 "2026-10-20"). So about 1 fix in 5 (roughly 36 of 161) fixed a real bug in the code under test. A flaky test can be a real bug that shows up only sometimes.

For Polaris, flakiness is a grader problem. A grader that gives different rewards on the same attempt measures noise. METR's task guide asks for deterministic tasks ^[confirmed](https://taskdev.metr.org/desiderata/ "2026-10-20"), and [[grader-validity]] asks for stable repeated runs.

### Know where the randomness enters {#randomness-sources}

The key question is: at what level does the randomness enter? That decides how you repeat the test.

| Flake source | Example | Varies per | How to repeat it | How to pin it |
|---|---|---|---|---|
| Test order | a test changes shared state | test order | shuffle: `pytest-randomly` | fixed `--randomly-seed`; fix the shared state |
| Unseeded random input | `random.randint` in a test | call | `pytest --count=N` | a seed; or test every input |
| String hash order | `list(set(tags))` | **process** | a shell loop with new processes | `PYTHONHASHSEED=N` |
| Time, time zone | `now()`, local time | clock, machine | change `TZ`, fake the clock | `TZ=UTC`; inject the clock |
| Concurrency, async waits | a race, `sleep(0.1)` "to be safe" | scheduler | many runs, under load | real synchronization, not sleeps |

### Setup {#flaky-setup}

Use the pinned venv from [[debug#setup|the setup]]. Use `--count` only when `pytest-repeat` is installed and pinned. Without it, pytest does not know the flag. Pin both plugins in your project's requirements too, or a teammate's run will differ from yours.

`pytest-randomly` shuffles test order (modules, then classes, then functions) and resets `random.seed()` before each test. It prints the seed it used as `Using --randomly-seed=...`. `-p no:randomly` turns it off ^[confirmed](https://github.com/pytest-dev/pytest-randomly "2026-10-20").

:::reveal title="Show the three flaky tests and their code"
```bash
mkdir -p flaky/tests && cd flaky
cat > pyproject.toml <<'EOF'
[tool.pytest.ini_options]
pythonpath = ["."]
EOF
cat > settings.py <<'EOF'
DEFAULTS = {"currency": "USD", "decimals": 2}


def load(overrides: dict | None = None) -> dict:
    """Return the settings: DEFAULTS plus any overrides."""
    cfg = DEFAULTS
    cfg.update(overrides or {})
    return cfg
EOF
cat > tests/test_settings.py <<'EOF'
from settings import load


def test_default_has_two_decimals():
    assert load()["decimals"] == 2


def test_yen_has_no_decimals():
    assert load({"currency": "JPY", "decimals": 0})["decimals"] == 0
EOF
cat > money.py <<'EOF'
def format_cents(cents: int) -> str:
    """Format cents as dollars with exactly two decimals: 150 -> '1.50'."""
    return str(cents / 100)
EOF
cat > tests/test_money.py <<'EOF'
import random

from money import format_cents


def test_two_decimals():
    cents = random.randint(1, 9999)
    assert format_cents(cents) == f"{cents // 100}.{cents % 100:02d}"
EOF
cat > tags.py <<'EOF'
def unique_tags(tags: list[str]) -> list[str]:
    """Return each tag once, in the order it first appears."""
    return list(set(tags))
EOF
cat > tests/test_tags.py <<'EOF'
from tags import unique_tags


def test_keeps_first_seen_order():
    assert unique_tags(["b", "a", "b"]) == ["b", "a"]
EOF
```
:::

### Flake 1: test order {#flake-order}

Real output (2026-10-20):

```text
$ pytest -q -p no:randomly tests/test_settings.py
2 passed in 0.31s
$ pytest -v --randomly-seed=2 tests/test_settings.py
Using --randomly-seed=2
tests/test_settings.py::test_yen_has_no_decimals PASSED                  [ 50%]
tests/test_settings.py::test_default_has_two_decimals FAILED             [100%]
>       assert load()["decimals"] == 2
E       assert 0 == 2
$ pytest -q tests/test_settings.py::test_default_has_two_decimals
1 passed in 0.30s
$ for s in $(seq 1 30); do pytest -q --randomly-seed=$s tests/test_settings.py > /dev/null 2>&1 || printf "$s "; done; echo
2 9 11 13 14 16 17 18 20 22 24 25 26 27 29 30
```

In file order, it passes. Alone, it passes. After the yen test, it fails, because `load` changes `DEFAULTS` itself instead of a copy. 16 of 30 shuffle seeds fail. The seed in the header is your reproduction: `--randomly-seed=2` fails every time. The fix is in the code, not the test: `cfg = dict(DEFAULTS)`. Luo et al. studied 19 order-dependent flaky tests. 14 of them (74%) were fixed by setting up or cleaning up the shared state. 3 (16%) were fixed by making a local copy of the shared variable, as here ^[confirmed](https://doi.org/10.1145/2635868.2635920 "2026-10-20").

### Flake 2: unseeded random input {#flake-random}

```text
$ pytest -q --randomly-seed=7 --count=50 tests/test_money.py
5 failed, 45 passed in 0.32s
$ pytest -q --randomly-seed=7 --count=50 'tests/test_money.py::test_two_decimals[13-50]'
E       AssertionError: assert '45.3' == '45.30'
```

`str(4530 / 100)` is `'45.3'`. Every amount that ends in 0 fails, which is about 10% of the inputs. One run in ten is red, so it "usually passes". Because `pytest-randomly` reseeds `random` per test from the run seed and the test ID ^[confirmed](https://github.com/pytest-dev/pytest-randomly "2026-10-20"), the same seed and the same test ID give the same value. We checked this: two runs with different `PYTHONHASHSEED` values gave the same five failures.

Better than a seed: the input space has only 9,999 values, so test all of them. When the space is small, an exhaustive loop beats any random sample.

### Flake 3: string hash order {#flake-hash}

```text
$ for seed in {1..20}; do PYTHONHASHSEED=$seed pytest -q -p no:randomly tests/test_tags.py > /dev/null 2>&1 && printf 'pass ' || printf 'FAIL(%s) ' $seed; done; echo
FAIL(1) pass pass pass pass FAIL(6) pass FAIL(8) pass FAIL(10) FAIL(11) FAIL(12) pass FAIL(14) FAIL(15) pass FAIL(17) FAIL(18) pass pass
$ PYTHONHASHSEED=2 pytest -q -p no:randomly --count=20 tests/test_tags.py
20 passed in 0.31s
$ PYTHONHASHSEED=1 pytest -q -p no:randomly --count=20 tests/test_tags.py
20 failed in 0.32s
```

Ten of twenty seeds fail. But `--count=20` gives 20 of 20 passes or 20 of 20 failures, because the hash seed is fixed once per process. **Repeating inside one process cannot reveal a per-process flake.** An agent that ran `--count=100`, saw green, and said "not flaky" would be overselling ([[M6]]). The fix: `list(dict.fromkeys(tags))` keeps first-seen order on every seed.

### How many runs are enough? {#flake-statistics}

Assume each run is independent and has the same failure probability p (same commit, same machine, same conditions). If all n runs pass, the exact one-sided 95% upper bound on p is 1 − 0.05^(1/n). For large n (about 30 or more), this is close to the "rule of three" value 3/n. The chance to see a flake with probability p at least once in n runs is 1 − (1 − p)^n ^[inference](- "2026-10-20").

| All-green runs (n) | 95% upper bound on p | Chance to see a 10% flake | Chance to see a 2% flake |
|---|---|---|---|
| 3 | 63% | 27% | 6% |
| 10 | 26% | 65% | 18% |
| 20 | 14% | 88% | 33% |
| 50 | 5.8% | 99.5% | 64% |
| 100 | 3.0% | almost 100% | 87% |

Read the first row slowly. Three green runs are still consistent, at 95%, with a test that fails up to 63% of the time. They miss a 10% flake almost three times out of four. DeepSWE runs each verifier 3 times during authoring and sends flaky ones back for revision ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). That is a good habit, and it catches frequent flakes. It cannot certify a rare one. So "3 stable runs" is a floor for a grader, not proof of stability. To say "this grader is stable", give n, the observed failures, the bound, and the conditions (same machine? under load? different hash seeds?). If the runs are not independent (one process, one seed), the table does not apply at all.

:::warn title="Do not fix a flake with retries"
Rerun plugins and longer sleeps make the build green and hide the cause. In a grader, a retry turns a real failure into a pass: a false accept. Find the source of randomness, pin it or remove it, then prove the test is stable with a stated number of runs.
:::

## C++: undefined behavior and sanitizers on macOS {#cpp-ub}

### What undefined behavior is {#what-is-ub}

**Undefined behavior (UB)** is code the C++ standard gives no meaning to: signed integer overflow, reading past an array, using freed memory, a data race, shifting by too many bits. The compiler is allowed to assume UB never happens. So the program may crash, print a wrong value, or seem to work. And the result can change with the optimization level. A test that passes says nothing about UB.

### The optimizer believes you {#signed-overflow}

```cpp
// bigger.cpp: is x + 1 bigger than x? Not always defined for int.
#include <cstdio>
#include <cstdlib>

bool still_bigger(int x) { return x + 1 > x; }

int main(int argc, char** argv) {
  int x = argc > 1 ? std::atoi(argv[1]) : 0;
  std::printf("still_bigger(%d) = %d\n", x, still_bigger(x));
  return 0;
}
```

```bash
clang++ -std=c++17 -O0 -o bigger_O0 bigger.cpp && ./bigger_O0 2147483647; echo "exit=$?"
clang++ -std=c++17 -O2 -o bigger_O2 bigger.cpp && ./bigger_O2 2147483647; echo "exit=$?"
clang++ -std=c++17 -O1 -g -fsanitize=undefined -o bigger_ub bigger.cpp && ./bigger_ub 2147483647; echo "exit=$?"
clang++ -std=c++17 -O1 -g -fsanitize=undefined -fno-sanitize-recover=all -o bigger_strict bigger.cpp
UBSAN_OPTIONS=abort_on_error=0 ./bigger_strict 2147483647; echo "exit=$?"
```

Real output (Apple clang 21, arm64, 2026-10-20):

```text
still_bigger(2147483647) = 0
exit=0
still_bigger(2147483647) = 1
exit=0
bigger.cpp:5:37: runtime error: signed integer overflow: 2147483647 + 1 cannot be represented in type 'int'
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior bigger.cpp:5:37
still_bigger(2147483647) = 0
exit=0
bigger.cpp:5:37: runtime error: signed integer overflow: 2147483647 + 1 cannot be represented in type 'int'
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior bigger.cpp:5:37
exit=1
```

Same source, two answers: 0 at `-O0`, 1 at `-O2`. lldb shows why. `disassemble` reads the binary without running it. Real output:

```text
$ lldb --batch -o "disassemble --name still_bigger" bigger_O2
bigger_O2`still_bigger:
bigger_O2[0x100000498] <+0>: mov    w0, #0x1                  ; =1
bigger_O2[0x10000049c] <+4>: ret
$ lldb --batch -o "disassemble --name still_bigger" bigger_O0
bigger_O0`still_bigger:
bigger_O0[0x100000498] <+0>:  sub    sp, sp, #0x10
...
bigger_O0[0x1000004a4] <+12>: add    w8, w8, #0x1
...
bigger_O0[0x1000004b0] <+24>: cset   w0, gt
```

At `-O2`, the whole function became "return 1". Overflow is UB, so the compiler assumed it cannot happen, and then `x + 1 > x` is always true.

Now look at the third run. **UBSan in its default mode printed the error and exited 0.** A grader that reads only the exit code would accept this program. Add `-fno-sanitize-recover=all` so the first finding ends the run with a non-zero code ^[confirmed](https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html "2026-10-20").

### The sanitizer menu on this Mac {#sanitizer-menu}

A **sanitizer** is a compiler mode that adds run-time checks. The last column was checked with Apple clang 21 on arm64 macOS on 2026-10-20: we compiled and ran each one, or got the error shown.

| Tool | Flag | Finds | On Apple clang |
|---|---|---|---|
| ASan | `-fsanitize=address` | out-of-bounds, use-after-free, double free | works |
| UBSan | `-fsanitize=undefined` | signed overflow, bad shifts, null and misaligned pointers, and more | works; combine with ASan |
| TSan | `-fsanitize=thread` | data races | works; **cannot** be combined with ASan |
| MSan | `-fsanitize=memory` | reads of uninitialized memory | `unsupported option '-fsanitize=memory' for target 'arm64-apple-darwin25.6.0'` |
| LSan | `-fsanitize=leak` | leaks | `unsupported option '-fsanitize=leak' for target 'arm64-apple-darwin25.6.0'` |
| libc++ hardening | `-D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_FAST` | out-of-bounds `operator[]` and other library misuse | works, even in `-O2` builds |

Upstream docs agree: MemorySanitizer supports Linux, NetBSD and FreeBSD only ^[confirmed](https://clang.llvm.org/docs/MemorySanitizer.html "2026-10-20"). ThreadSanitizer supports Darwin arm64, with a typical slowdown of 5x to 15x ^[confirmed](https://clang.llvm.org/docs/ThreadSanitizer.html "2026-10-20"). AddressSanitizer averaged about 73% slowdown in its paper ^[confirmed](https://www.usenix.org/conference/atc12/technical-sessions/presentation/serebryany "2026-10-20"). Trying `-fsanitize=thread,address` gives `invalid argument '-fsanitize=address' not allowed with '-fsanitize=thread'`. So you need two separate check builds.

The upstream ASan docs say leak detection is on by default on Linux and can be enabled on macOS with `ASAN_OPTIONS=detect_leaks=1` ^[confirmed](https://clang.llvm.org/docs/AddressSanitizer.html "2026-10-20"). Apple's toolchain does not ship it: [[lab:lab-d]] shows the real error. For leaks on macOS, Apple's `leaks -atExit -- ./program` is the documented tool (from `man leaks`; not run by us) ^[confirmed](https://keith.github.io/xcode-man-pages/leaks.1.html "2026-10-20").

The libc++ **fast** hardening mode is meant for production. Fast and extensive modes trap immediately with no message; debug mode prints a message ^[confirmed](https://libcxx.llvm.org/Hardening.html "2026-10-20"). Here is `index.cpp`, which reads `v[i]` from a 4-element vector:

```cpp
// index.cpp: reads one element past the end of a vector.
#include <cstdio>
#include <cstdlib>
#include <vector>

int main(int argc, char** argv) {
  std::vector<int> v = {1, 2, 3, 4};
  std::size_t i = argc > 1 ? std::strtoul(argv[1], nullptr, 10) : 0;
  std::printf("v[%zu] = %d\n", i, v[i]);
  return 0;
}
```

```bash
clang++ -std=c++17 -O2 -o index_plain index.cpp && ./index_plain 4; echo "plain exit=$?"
clang++ -std=c++17 -O2 -D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_FAST -o index_fast index.cpp && ./index_fast 4; echo "fast exit=$?"
clang++ -std=c++17 -O2 -D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_DEBUG -o index_dbg index.cpp && ./index_dbg 4; echo "debug exit=$?"
```

Real output (2026-10-20):

```text
v[4] = 5
plain exit=0
fast exit=133
/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1/__vector/vector.h:406: libc++ Hardening assertion __n < size() failed: vector[] index out of bounds
debug exit=134
```

The plain build printed a value from past the end and exited 0. That value is arbitrary; yours may differ. Exit 133 is 128 + 5 (SIGTRAP). Exit 134 is 128 + 6 (SIGABRT). `./index_fast 3` still prints `v[3] = 4` and exits 0: correct code runs as before. Both crashes also write a macOS crash report, as `abort()` does.

### A use-after-free an agent would write {#stale-reference}

Keeping a reference into a vector and then growing the vector is a common C++ mistake. `push_back` may move every element to a new buffer and free the old one.

```cpp
// stale.cpp: keeps a reference into a vector, then grows the vector.
#include <cstdio>
#include <vector>

int main() {
  std::vector<int> scores = {90, 85, 77};
  int& best = scores[0];
  scores.push_back(60);  // may move every element to a new buffer
  std::printf("best = %d\n", best);
  return 0;
}
```

```bash
clang++ -std=c++17 -O2 -o stale_plain stale.cpp && ./stale_plain; echo "plain exit=$?"
clang++ -std=c++17 -g -O1 -fno-omit-frame-pointer -fsanitize=address,undefined -fno-sanitize-recover=all -o stale stale.cpp
ASAN_OPTIONS=abort_on_error=0:symbolize=0 ./stale 2> stale.log; echo "asan exit=$?"
bash symbolize.sh stale < stale.log     # symbolize.sh is in Lab D's repo/
```

Real output (2026-10-20; library frames shortened):

```text
best = -311312128
plain exit=0
asan exit=1
==38662==ERROR: AddressSanitizer: heap-use-after-free on address 0x6020000000b0 at pc 0x000104cdcb04 bp 0x00016b122350 sp 0x00016b122348
READ of size 4 at 0x6020000000b0 thread T0
    #0 0x000104cdcb00 in main stale.cpp:9
0x6020000000b0 is located 0 bytes inside of 12-byte region [0x6020000000b0,0x6020000000bc)
freed by thread T0 here:
    #1 0x000104cde488 in ... std::__1::__libcpp_deallocate ... allocate.h:81
        inlined into ... std::__1::vector<int, ...>::__emplace_back_slow_path<int>(int&&) vector.h:1134
    #2 0x000104cdcbec in ... vector<int, ...>::emplace_back<int>(int&&) vector.h:1150
    #3 0x000104cdc9ec in main stale.cpp:8
previously allocated by thread T0 here:
    #1 0x000104cdd03c in ... std::__1::__libcpp_allocate ... allocate.h:61
```

Read it in this order. The error type: `heap-use-after-free`. The access: a 4-byte read at `stale.cpp:9`. Where the memory went: freed inside `push_back`, called from `stale.cpp:8`. The read on line 9 is the symptom. Line 8 together with the reference from line 7 is the cause. The plain build printed garbage and exited 0. On another day it could print 90.

Why `ASAN_OPTIONS=abort_on_error=0:symbolize=0`? On macOS the sanitizers call `abort()` after a report by default ^[confirmed](https://github.com/google/sanitizers/wiki/SanitizerCommonFlags "2026-10-20"), which also writes a crash report. And live symbolization starts `atos` on the running process, which can trigger the permission prompt. Lab D explains both, and its `symbolize.sh` adds `file:line` offline.

### A race the tests never see {#data-race}

```cpp
// race.cpp: two threads add to one counter with no lock.
#include <cstdio>
#include <thread>

int hits = 0;

void work() {
  for (int k = 0; k < 100000; ++k) ++hits;  // read, add, write: not atomic
}

int main() {
  std::thread a(work), b(work);
  a.join();
  b.join();
  std::printf("hits = %d (expected 200000)\n", hits);
  return 0;
}
```

Real output:

```text
$ clang++ -std=c++17 -O1 -o race_plain race.cpp && for i in 1 2 3; do ./race_plain; done
hits = 200000 (expected 200000)
hits = 200000 (expected 200000)
hits = 200000 (expected 200000)
$ clang++ -std=c++17 -g -O1 -fsanitize=thread -o race_tsan race.cpp
$ TSAN_OPTIONS=abort_on_error=0:symbolize=0 ./race_tsan 2> race.log; echo "tsan exit=$?"
hits = 200000 (expected 200000)
tsan exit=66
$ head -4 race.log
==================
WARNING: ThreadSanitizer: data race (pid=40183)
  Write of size 4 at 0x000100d54000 by thread T2:
    #0 <null> <null> (race_tsan:arm64+0x100000704)
$ atos -o race_tsan -arch arm64 -i 0x100000704
work() (in race_tsan) (race.cpp:8)
```

The plain build printed the right number three times. The race is still there. lldb shows why it hides. Real output:

```text
$ lldb --batch -o "disassemble --name work" race_plain
race_plain`work:
race_plain[0x100000580] <+0>:  adrp   x8, 8
race_plain[0x100000584] <+4>:  ldr    w9, [x8]
race_plain[0x100000588] <+8>:  add    w9, w9, #0x18, lsl #12    ; =0x18000
race_plain[0x10000058c] <+12>: add    w9, w9, #0x6a0
race_plain[0x100000590] <+16>: str    w9, [x8]
race_plain[0x100000594] <+20>: ret
```

The loop is gone. `0x18000 + 0x6a0` is 100000, so each thread does one load, one add and one store. The window for the race became tiny, but it is still a race, and a different compiler or flag can open it again. TSan reports the race at `race.cpp:8` anyway, because it checks memory accesses, not results. With the default options it exited 134 (abort); with `abort_on_error=0` it exited 66.

### Exit codes: make the grader see it {#sanitizer-exit-codes}

Everything below was observed on this Mac on 2026-10-20:

| Build and options | What happened | Exit |
|---|---|---|
| UBSan, default | printed `runtime error:`, kept running | **0** |
| UBSan + `-fno-sanitize-recover=all` | report, then `abort()` | 134 |
| same + `UBSAN_OPTIONS=abort_on_error=0` | report, then exit | 1 |
| ASan + UBSan, `ASAN_OPTIONS=abort_on_error=0` | heap-use-after-free report | 1 |
| TSan, default | report, abort at exit | 134 |
| TSan, `TSAN_OPTIONS=abort_on_error=0` | report, exit | 66 |
| libc++ hardening, fast | trap, no message | 133 |
| libc++ hardening, debug | message, abort | 134 |

The grader rule: build with `-fno-sanitize-recover=all`, treat any non-zero exit as a failure, **and** search stderr for `runtime error:`, `ERROR: AddressSanitizer` and `WARNING: ThreadSanitizer`. Either check alone can miss a finding. Run the sanitizer builds as part of [[S11]], and see [[prove#sanitizers|the sanitizer step in Prove it]].

The recipe for a C++ change on macOS:

```bash
# 1. ASan + UBSan check build
clang++ -std=c++17 -g -O1 -fno-omit-frame-pointer -fsanitize=address,undefined -fno-sanitize-recover=all -o t_asan *.cpp
ASAN_OPTIONS=abort_on_error=0 UBSAN_OPTIONS=abort_on_error=0:print_stacktrace=1 ./t_asan
# 2. TSan check build, only if the code uses threads
clang++ -std=c++17 -g -O1 -fsanitize=thread -o t_tsan *.cpp && TSAN_OPTIONS=abort_on_error=0 ./t_tsan
# 3. Cheap bounds checks in the normal build
clang++ -std=c++17 -O2 -D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_FAST -o t *.cpp && ./t
```

A sanitizer only checks the code paths your tests reach. A clean sanitizer run is evidence, not proof.

## Debugging with an agent {#with-an-agent}

An agent can be a fast pair of hands in this loop. It is a poor judge of its own results. Self-correction without outside feedback is unreliable on reasoning tasks ^[confirmed](https://arxiv.org/abs/2310.01798 "2026-10-20") and gives small, inconsistent gains for code repair ^[confirmed](https://arxiv.org/abs/2306.09896 "2026-10-20"). So you give it the outside feedback and keep the judging.

| Loop step | What you give the agent | What you check yourself |
|---|---|---|
| Reproduce | `repro.sh` and its exit-code contract | it fails with exit 1 for the right reason, in your terminal |
| Shrink | the failure test that pins the symptom | the small input fails the same way |
| Hypothesize | the read-only hypothesis prompt above | each hypothesis has a prediction you could falsify |
| Experiment | batch commands: `python3 -m pdb -c ...`, `lldb --batch ...`, `git bisect run` | you re-run the command and read the raw output |
| Explain | "Gate 3: two sentences with file:line" | the sentences match the evidence in `debug.md` |
| Fix | "General fix. No special cases. Do not touch tests." | revert-the-fix: the new test fails again on the old code |

Stop rules:

- After two failed corrections, stop. Clear the context and restart with a better prompt. This rule is from Anthropic's Claude Code best practices ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20"), not from Google.
- If the agent says "fixed" for a flaky test, ask: how many runs, in how many processes, with which seeds? Then run them yourself.
- If the agent adds a `sleep`, a retry, a broad `except`, or a special case for the failing input, that is a symptom fix ([[M2]], [[M3]], [[M4]]).
- If the agent names a cause with no command output behind it, it may be answering from memory ([[M8]]). Ask for `file:line` and the command.
- Each time you catch the agent wrong, add a row to `mistakes.csv` ([[prove#mistakes-csv|the mistake log]]): the mistake-card row, the step that caught it, and the minutes. That log is signal 2 on the [[home]] page.

:::compare
- Says "it fails sometimes" and starts editing. || Writes `repro.sh` with exit codes 0, 1 and 125, and checks it fails for the right reason.
- Debugs with the 80-character input from the ticket. || Shrinks it first, with a failure test that matches the exact symptom.
- Tries fixes until the test goes green. || Writes hypotheses with predictions, then runs the experiment that can kill one.
- Sprinkles `print` calls and deletes them later. || Uses a conditional breakpoint or one `%r` log line at the decision point, and saves the output.
- Runs `git bisect run` with "any failure means bad". || Exits 125 when the reproduction cannot run, tests the script on both ends, and verifies the named commit and its parent.
- Reruns a flaky test until it passes, or adds a retry. || Finds where the randomness enters (order, call, process, clock), pins it, and states how many runs prove stability.
- Trusts a C++ test that passes in the normal build. || Builds with ASan and UBSan, makes findings fatal, and checks stderr as well as the exit code.
:::

## Use it on Chronos {#chronos}

[[start-here#honesty|Ownership-gate items 1–3]] are this chapter applied to the Chronos grader. Do them yourself, with no agent.

1. **Item 1, reproduce.** Wrap one grader-detected pilot failure in `repro.sh`. Exit 1 when the failing check fails, 0 when it passes, and 125 only when the environment cannot run.
2. **Shrink.** If the failing check compares the solution with the oracle on seeded random data, shrink that dataset with `ddmin` over its rows. The failure test must pin the same check and the same wrong value.
3. **Item 2, explain.** Write Gate 3 with `file:line`, and name the time rule it broke, for example "uses a vintage with `published_at > asof`".
4. **Item 3, change the grader.** Add the shrunk case to the boundary-case table ([[grader-validity#boundary-table|boundary-case tables]]). Write one new wrong solution that the old grader accepts and the new case rejects. Then re-run the validity card.

## Drills {#drills}

:::drill id="debug-repro-contract" title="Write a reproduction script with three honest verdicts" time="15 min"
1. Create `fields.py` from [[debug#ddmin-code|the ddmin section]] in a temp folder (`mktemp -d`).
2. Write `repro.sh` from memory first. It must exit 0 when fixed, 1 when the bug is there, and 125 when it cannot even import the module. Then compare with the version on this page.
3. Prove all three verdicts: run it on the buggy code, on a fixed copy, and in an empty folder. Print `exit=$?` each time.
4. Break scripts on purpose: misspell `python3` as `pyhton3`. Try it in three places and print `exit=$?` each time: in your import guard, inside `got=$(...)` in a script with no guard (like `check_sloppy.sh`), and as a script's last command. On our machine (bash 5.3) the three results were 125, 1 and 127.
5. Say what `git bisect run` would do with each one: skip every commit, or call every commit "bad".

**Done when:** you have three real runs with exit codes 1, 0 and 125, and one sentence on why a typo that gives 1 or 127 is more dangerous than one that gives 125.
:::

:::drill id="debug-shrink" title="Shrink a failing input, twice" time="25 min"
1. Save `ddmin.py`, `fields.py`, `shrink.py` and `test_ddmin.py` from this page in one temp folder. Make a venv with pinned `pytest==8.4.2` and `hypothesis==6.170.5`.
2. Run `python3 -B shrink.py`. Check that you get the same two results and test counts as the page.
3. Run `pytest -q -p no:randomly test_ddmin.py`. Then disable step 2 in `ddmin.py` and confirm 3 tests fail.
4. Change the granularity: shrink by **fields** instead of characters (split the line on commas, join with commas). Compare the number of tests with the character version.
5. Add `test_roundtrip.py` and see Hypothesis shrink to `fields=['']`.

**Done when:** you can explain, in two sentences, why `any_difference` shrank to `6"` and why that would have misled you about the ticket.
:::

:::drill id="debug-tz-hypotheses" title="Three hypotheses for a CI-only failure" time="20 min"
Use `buckets.py` and its two tests from [[debug#pin-environment|the pin-the-environment section]]. The story: green in CI, red on a teammate's laptop in California.

1. Before you run anything, write three hypotheses in `debug.md`. Each needs a prediction that is true only if that hypothesis is true.
2. Order the experiments by cost. Run them. Fill in the result column.
3. Write Gate 3 in two sentences with `file:line`.
4. Fix it, run both tests under five `TZ` values, then put the old line back and show they fail again.

:::reveal title="Show one worked log"
- H1: `fromtimestamp` uses local time. Prediction: passes with `TZ=UTC`, fails with `TZ=America/Los_Angeles`. Result: exactly that (5-zone loop on this page). Survives.
- H2: a daylight-saving problem. Prediction: it fails only on or near a DST switch date. Result: Los Angeles and New York fail for 2026-10-20, and US clocks change on 2026-11-01. The failures follow the zone's offset from UTC, not a switch. Killed.
- H3: the timestamp is in milliseconds. Prediction: the year would be far in the future. Result: `2026-10-19` in New York. Killed.
- Gate 3: "`buckets.py:6` calls `datetime.fromtimestamp(ts)` without a time zone, so it returns local time, while the docstring promises the UTC day. West of UTC an early-morning timestamp lands on the previous day, east of UTC a late-evening one lands on the next day, and CI runs with TZ=UTC, so the tests never saw it."
- Fix: `datetime.fromtimestamp(ts, tz=timezone.utc)` (and import `timezone`). Real output after the fix: `..` in all five zones.
:::

**Done when:** your log has three rows with predictions written before results, and at least two hypotheses are killed by an experiment. With the fix, both tests pass under all five `TZ` values. With the old line, Los Angeles and New York fail the first test, and London and Tokyo fail the second.
:::

:::drill id="debug-pdb-session" title="pdb: conditional breakpoint, post-mortem, batch" time="20 min"
1. Run Session 1 from [[debug#pdb-session|the pdb section]] yourself. Type every command. Then add `display list(cur)` before the first `n` and watch it change. (`display cur` alone shows nothing, because the list is changed in place.)
2. Run `pytest --pdb` on a failing test of your own. Use `w`, `u` and `p` to read a caller's variable.
3. Turn your Session 1 into one batch command with `-c` options and `< /dev/null`. Paste its output into `debug.md`.
4. Put `breakpoint()` in `fields.py`, then run the tests with `PYTHONBREAKPOINT=0`. Confirm nothing stops. Remove the line.

**Done when:** you have one saved batch output that proves or kills a hypothesis, and you can name pdb's equivalents of lldb's `bt`, `v` and `finish` without looking.
:::

:::drill id="debug-bisect-demo" title="Bisect 40 commits: sloppy script vs correct script" time="25 min"
1. Save `make_bisect_demo.py` without reading it. Build the repo. Check that `git log --oneline -1` shows `4469699`.
2. Write `../check.sh` yourself from the exit-code table. Test it at `v1.0` (must be 0) and at `main` (must be 1).
3. Run `git bisect run` with the sloppy script, then with yours. Save both logs with `git bisect log`.
4. For every `skip` line in your log, check by hand that the reproduction really cannot run there.
5. Verify the answer on the named commit and its parent. Read its diff. Write Gate 3 in two sentences.

**Done when:** your script names `71b16d2`, the sloppy one names a different commit, and you can say in one sentence why the sloppy one was wrong.
:::

:::drill id="debug-flaky-three" title="Three flaky tests, three sources of randomness" time="30 min"
1. Build the `flaky/` project from [[debug#flaky-setup|the setup]] in a temp folder with the pinned plugins.
2. For each test, first predict at what level the randomness enters: test order, call, or process. Then pick the repeat method and run it.
3. Get a failing seed for each one and show that it fails every time with that seed.
4. Fix each bug in the code, not the test. Then show stability: state n, the failures, and the 95% upper bound from the table.
5. Explain in one sentence why `--count=100` cannot clear `test_tags.py`.

**Done when:** all three are fixed, each with a recorded failing seed before the fix and a stability claim that names n and its conditions.
:::

:::drill id="debug-ub-optimizer" title="Watch the optimizer exploit undefined behavior" time="20 min"
1. Build `bigger.cpp` at `-O0`, at `-O2`, with UBSan, and with UBSan plus `-fno-sanitize-recover=all`. Run each with `2147483647` and record the output and the exit code.
2. Disassemble `still_bigger` with `lldb --batch` at both levels. Explain the `-O2` version in one sentence.
3. Build `stale.cpp` with ASan and UBSan. Symbolize the report and name the line of the symptom and the line of the cause.
4. Write a 3-line shell check a grader could use: fail on a non-zero exit **or** on sanitizer text in stderr. Test it on the default-UBSan binary, which exits 0.

**Done when:** your grader check rejects `bigger_ub` (which exits 0), `bigger_strict` and `stale`, and accepts a fixed `bigger.cpp` built with UBSan (compute in a wider type, or check `x < INT_MAX` first).
:::

:::drill id="debug-real-agent-failure" title="Debug one real agent failure and log it" time="45 min"
1. Pick one real failure: a failed Chronos pilot attempt, a Gemini run that went wrong, or a bug in one of your own agent-built commits (as in [[interview#star|STAR stories]]). Work in a practice copy made with `mktemp -d`, never inside the portfolio repository.
2. Write `repro.sh` with exit codes 0, 1 and 125. Show exit 1 on the bad version.
3. If the failing input is longer than a few lines, shrink it with a failure test that pins the symptom.
4. Write two hypotheses with predictions in `debug.md`. Kill one with a [D] tool and paste its output.
5. Write Gate 3 with `file:line`. Name the agent's first wrong turn and its mistake-card row ([[M1]]–[[M10]]).
6. Add one row to `mistakes.csv` ([[prove#mistakes-csv|the mistake log]]): type, the step that caught it, minutes ([[S15]]).

**Done when:** `repro.sh` exits 1 on the bad version and 0 on the fixed one, `debug.md` has one killed hypothesis with real command output, and `mistakes.csv` has the new row.
:::

:::drill id="debug-lab-e" title="Lab E: Bisect 200" time="45 min"
Do [[lab:lab-e]]. It has 200 commits, eight that cannot start, and three synthetic agent claims to judge. Follow its README exactly, including the manual bisect in at most 10 tested commits.

**Done when:** every item in the lab's "Done when" list is ticked, and you checked your work with the lab's `check.py` only after you finished.
:::

:::drill id="debug-lab-d" title="Lab D: Memory Ghost" time="65 min"
Do [[lab:lab-d]]. Review three agent patches to a C++ ring-buffer logger with `make test`, `make asan` and lldb, and judge six claims from the patch messages. Write each verdict before you run anything.

**Done when:** every item in the lab's "Done when" list is ticked, and each rejected patch has a sanitizer report line, a `file:line` and a two-sentence root cause.
:::

## Sources

Checked on 2026-10-20. Commands on this page were run on 2026-10-20 on macOS 26.6.1 (arm64) in zsh, with Apple clang 21.0.0, lldb-2100.0.17.203, git 2.55.0 (Homebrew; Apple's git 2.50.1 builds the same demo commit IDs), Python 3.13.9, uv 0.12.1, pytest 8.4.2, Hypothesis 6.170.5, pytest-randomly 5.0.0 and pytest-repeat 0.9.4. Live lldb sessions were not run (macOS permission prompt); those commands were checked against lldb's built-in help.

- Zeller and Hildebrandt, "Simplifying and Isolating Failure-Inducing Input", IEEE TSE 28(2), 2002 ^[confirmed](https://doi.org/10.1109/32.988498 "2026-10-20")
- RFC 4180, CSV format, section 2 rules 5–7 ^[confirmed](https://www.rfc-editor.org/rfc/rfc4180 "2026-10-20")
- Liu et al., "An Empirical Study on Failures in Automated Issue Solving" ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20")
- Huang et al., "Large Language Models Cannot Self-Correct Reasoning Yet", ICLR 2024 ^[confirmed](https://arxiv.org/abs/2310.01798 "2026-10-20")
- Olausson et al., "Is Self-Repair a Silver Bullet for Code Generation?", ICLR 2024 ^[confirmed](https://arxiv.org/abs/2306.09896 "2026-10-20")
- Mündler et al., SWT-Bench, NeurIPS 2024 ^[confirmed](https://arxiv.org/abs/2406.12952 "2026-10-20")
- Jimenez et al., SWE-bench, ICLR 2024 ^[confirmed](https://arxiv.org/abs/2310.06770 "2026-10-20")
- Datacurve, DeepSWE (verifiers run 3 times during authoring) ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20")
- pytest exit codes ^[confirmed](https://docs.pytest.org/en/stable/reference/exit-codes.html "2026-10-20")
- Python docs: pdb (post-mortem, `-c`, `break` with a condition, `display`, `exceptions` in 3.13) ^[confirmed](https://docs.python.org/3/library/pdb.html "2026-10-20")
- Python docs: `PYTHONHASHSEED`, `PYTHONBREAKPOINT`, `PYTHONDONTWRITEBYTECODE`, `PYTHONFAULTHANDLER` ^[confirmed](https://docs.python.org/3/using/cmdline.html "2026-10-20")
- Python Logging HOWTO (deferred formatting, default level WARNING) ^[confirmed](https://docs.python.org/3/howto/logging.html "2026-10-20")
- git-bisect manual (exit codes, 125, 126/127, `--first-parent`, terms, replay) ^[confirmed](https://git-scm.com/docs/git-bisect "2026-10-20")
- John Micco, "Flaky Tests at Google and How We Mitigate Them", 2016-05-27 ^[confirmed](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html "2026-10-20")
- Luo, Hariri, Eloussi, Marinov, "An Empirical Analysis of Flaky Tests", FSE 2014 ^[confirmed](https://doi.org/10.1145/2635868.2635920 "2026-10-20")
- pytest docs, "Flaky tests" ^[confirmed](https://docs.pytest.org/en/stable/explanation/flaky.html "2026-10-20")
- pytest-randomly README (shuffling, reseeding, `--randomly-seed`, `-p no:randomly`) ^[confirmed](https://github.com/pytest-dev/pytest-randomly "2026-10-20")
- pytest-repeat on PyPI (`--count`; version 0.9.4) ^[confirmed](https://pypi.org/project/pytest-repeat/ "2026-10-20")
- METR Task Development Guide, desiderata (deterministic tasks) ^[confirmed](https://taskdev.metr.org/desiderata/ "2026-10-20")
- Clang AddressSanitizer docs (leak detection by platform) ^[confirmed](https://clang.llvm.org/docs/AddressSanitizer.html "2026-10-20")
- Clang UndefinedBehaviorSanitizer docs ^[confirmed](https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html "2026-10-20")
- Clang ThreadSanitizer docs (platforms, overhead) ^[confirmed](https://clang.llvm.org/docs/ThreadSanitizer.html "2026-10-20")
- Clang MemorySanitizer docs (platforms) ^[confirmed](https://clang.llvm.org/docs/MemorySanitizer.html "2026-10-20")
- Serebryany et al., "AddressSanitizer: A Fast Address Sanity Checker", USENIX ATC 2012 ^[confirmed](https://www.usenix.org/conference/atc12/technical-sessions/presentation/serebryany "2026-10-20")
- Sanitizer common flags (`abort_on_error` on Darwin, `symbolize`) ^[confirmed](https://github.com/google/sanitizers/wiki/SanitizerCommonFlags "2026-10-20")
- libc++ Hardening Modes ^[confirmed](https://libcxx.llvm.org/Hardening.html "2026-10-20")
- GDB mailing list thread "GDB / AArch64 / MacOS", 2023-07-19 (no native arm64 macOS support) ^[reported](https://inbox.sourceware.org/gdb/87h6pu9zjd.fsf%40tromey.com/T/ "2026-10-20")
- Anthropic, Claude Code best practices (the two-failed-corrections rule) ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20")
- Mechanize, "How our interview process works" (Mechanize's process, not Polaris's) ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20")
- Google Careers, Research Engineer, Polaris (job 114077679900074694) ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19")
- `man DevToolsSecurity` (the first-use password prompt), read locally with `man` on macOS 26.6. The link is a third-party copy of the Xcode man pages with the same text ^[confirmed](https://keith.github.io/xcode-man-pages/DevToolsSecurity.8.html "2026-10-20")
- `man leaks` (`-atExit -- command`), read locally with `man` on macOS 26.6. The link is a third-party copy of the same page ^[confirmed](https://keith.github.io/xcode-man-pages/leaks.1.html "2026-10-20")
- LLDB manual page (`--batch`, `-o`, `-k`/`--one-line-on-crash`); command syntax also checked with lldb's built-in `help` on lldb-2100.0.17.203 (for example, `help p` says `p` is `dwim-print`) ^[confirmed](https://lldb.llvm.org/man/lldb.html "2026-10-20")

:::check
- From memory, write a `repro.sh` with exit codes 0, 1 and 125, and show that it fails for the right reason.
- Shrink a failing input with a failure test that pins the exact symptom, and prove the result is 1-minimal.
- Keep a `debug.md` with three hypotheses and predictions written before results, settle one with a saved pdb batch result, and write Gate 3 in two sentences.
- Bisect with a script that skips untestable commits, then verify the named commit against its parent.
- Name where the randomness enters for a flaky test, pick the right way to repeat it, and state a stability claim with n and its conditions.
- Build C++ with ASan and UBSan on macOS so that every finding fails the run, and read a report from error type to root cause.
:::
