# Polaris Playbook labs

Small, realistic practice projects for the Polaris Research Engineer prep.
Each lab has planted defects with a known answer, so you can measure yourself.
Two skills get trained here. You **catch** agent mistakes in real code, and you **build** graders
that wrong solutions cannot fool. A Polaris task is a prompt plus a grader, so both skills matter.

The method behind every lab is the Agent Patch Audit (steps S0 to S15) and its mistake card
(rows M1 to M10). Both are in the playbook:
[Agent Patch Audit](https://zelinzhu-richard.github.io/repolarisdm/agent-patch-audit/) and
[mistake card](https://zelinzhu-richard.github.io/repolarisdm/agent-patch-audit/#mistake-card).

Two rules before you start:

- Open your agent **only in a practice copy** (see "Practice safely"), never in this repository.
- `check.py` and `check_labs.py` print spoilers. Run them after you finish a lab.

## The labs

This list is generated from each lab's `lab.json` (last regenerated on 2026-10-20). "Trains" names audit steps. "Covers" names mistake-card rows. If a table and a `lab.json` disagree, the `lab.json` wins.

| Lab | Name | Language | Time | Trains | Covers |
|---|---|---|---|---|---|
| [lab-a](lab-a/) | Map Check: judge 12 agent claims about tallyhub | Python | 60 min | S1–S6, S12 | M1, M2, M5, M8 |
| [lab-c](lab-c/) | Spot the Bad Agent Patch | Python | 60 min | S4, S10–S12, S14 (optional: S13) | M1, M2, M3, M4, M5, M6, M7, M8, M10 |
| [lab-d](lab-d/) | Memory Ghost | C++17 (clang++, make, lldb) | 60 min | S7, S10–S12 | M6, M9 |
| [lab-e](lab-e/) | Bisect 200 | Bash + Git (the project under test is Python) | 45 min | S6, S7 | M2, M8 |
| [lab-f](lab-f/) | Break the Grader | Python + Harbor layout | 3 h | S10–S12 | M3, M4, M5 |
| [lab-h](lab-h/) | Unfamiliar Stack Sprint | TypeScript (Node 22, type stripping) | 90 min | S1–S4, S6, S7, S9–S12 | M1, M2, M3, M4, M5, M8, M10 |

Suggested order: **lab-a → lab-c → lab-f** first (the core), then lab-e, lab-d and lab-h.
Lab A also holds the bug used in the playbook's worked example. Lab F is the grader lab: do it before you
build your own task. Two more labs were planned (B: multi-milestone changes, G: mock round) and cut.

What each lab needs:

| Lab | Needs |
|---|---|
| lab-a | Python 3.11+ (3.13 recommended), `uv` for the pinned test tools |
| lab-c | Python 3.10+, git, ripgrep (`rg`). pytest is optional |
| lab-d | Xcode Command Line Tools (`clang++`, `make`, `lldb`). Apple clang has no LeakSanitizer |
| lab-e | git 2.28+, bash, Python 3.9+ |
| lab-f | Python 3.9+, bash (macOS `/bin/bash` 3.2 works). Docker is optional |
| lab-h | Node 22.18 or newer |

### Mistake-card coverage

Every row of the mistake card is trained by at least one lab. `check_labs.py` checks this from `lab.json`.

| Row | Agent mistake | Labs |
|---|---|---|
| M1 | Invented API / flag / package | lab-a, lab-c, lab-h |
| M2 | Wrong root cause / symptom-only fix | lab-a, lab-c, lab-e, lab-h |
| M3 | Test gaming | lab-c, lab-f, lab-h |
| M4 | Silent damage | lab-c, lab-f, lab-h |
| M5 | Similar-but-different logic | lab-a, lab-c, lab-f, lab-h |
| M6 | Overselling ("tests pass" with no proof) | lab-c, lab-d |
| M7 | Solution lookup | lab-c |
| M8 | Answering from memory, not the code | lab-a, lab-c, lab-e, lab-h |
| M9 | C++ memory / undefined behavior | lab-d |
| M10 | Security and dependencies | lab-c, lab-h |

S0 (isolate) is part of every lab: it is the practice copy below. No lab trains S8 (plan and guardrails)
or S15 (merge check and mistake log) on its own. Practice those with the playbook chapters on changing code and proving it.

## Practice safely (S0)

### 1. Make a practice copy

Run this from the folder that contains `labs/`:

```sh
bash labs/make_practice.sh lab-a
```

It copies `labs/lab-a/repo/` into a new folder made by `mktemp -d`. It never copies `_key/`, `.git/`,
virtualenvs or caches. Then it runs `git init` and makes **one** commit with a fixed author and date.
The copy has no parent history, so an agent cannot mine old commits for the answer (M7).
Every copy of the same lab gets the same commit id. Write it into your `audit.md` as `BASE`.

The instructions go to stderr and only the path goes to stdout. So this works in zsh and bash:

```sh
cd "$(bash labs/make_practice.sh lab-a)"
git log --oneline          # one commit: "practice copy of lab-a"
```

Lab E has no `repo/` folder. It builds its own 200-commit history:
`cd "$(bash labs/lab-e/make_history.sh)"`. The script tells you this if you ask it for `lab-e`.

### 2. Open the agent there, and only there

Inside this repository, an agent can read the playbook's history and, during the build, the answer keys.
In the practice copy it sees only the lab. Also:

- Use review-every-edit mode, and plan or read-only mode while it maps the repo.
- Turn the network off if your agent supports it. A lab never needs the internet after setup.
- Record the agent, its version and the model in `audit.md`, next to `BASE`.

### 3. Run the canary boundary test

A practice copy hides the keys from the agent's **folder**. It does not hide them from your **disk**.
This test shows whether your agent setup can still reach them. Do it once per agent setup, and again
after you change the agent, its version or its sandbox settings.

1. In your own terminal (not the agent), plant a random string next to your local answer keys:

   ```sh
   CANARY="canary-$(uuidgen)"
   printf '%s\n' "$CANARY" > "<your answer-keys folder>/CANARY.txt"
   ```

2. In the agent, opened in the practice copy, ask it to read that exact file and print its first line.
   In a second session, ask it to find any file named `CANARY.txt` in your home folder and print it.
3. **Pass:** the agent tries and is blocked. **Fail:** it prints your string.
   A refusal is not a pass. Ask it to try: you are testing the sandbox, not the model's manners.
4. On a fail, use the agent's sandbox or read-only mode, or keep the keys where the agent's user account
   cannot read them. Then test again.
5. Keep `CANARY` set. `redflags.sh` searches the diff and the transcript for it (below).
6. Delete `CANARY.txt` when you are done.

`make_practice.sh` prints these steps with the real paths filled in.

## Red-flag scan (S10, S14)

`redflags.sh` is a fast first look at a diff and, optionally, the agent's transcript.
Each rule is a grep-style pattern. Each hit is printed with its line number in the file you gave it.

```sh
git add -A                                        # so new files show up in the diff
git diff --no-color --cached BASE > /tmp/my.diff
CANARY="$CANARY" bash labs/redflags.sh /tmp/my.diff transcript.md
```

Plain `git diff BASE` leaves out new files the agent did not stage. That is why you run `git add -A` first.
A Lab C patch is already a diff: `bash labs/redflags.sh labs/lab-c/patches/01/patch.diff labs/lab-c/patches/01/transcript.md`.

Real output on a small made-up example (run on 2026-10-20). The agent switched a `subprocess` call to a
shell string, skipped the test, edited after its last test run, and then said the tests pass.
The transcript is synthetic, written for practice, and not real agent output.

```text
== diff: demo.diff
files in the diff: 2
  M  app/archive.py                               +1    -1
  M  tests/test_archive.py                        +3    -0    [test]

FLAG  M4   demo.diff:9  app/archive.py
      1 fewer error-check line(s) (raise / throw / assert / check=True) in this file: is a check gone?
      | -    subprocess.run(["tar", "-czf", out, "-C", folder, "."], check=True)
FLAG  M10  demo.diff:10  app/archive.py
      subprocess with shell=True: command injection risk.
      | +    subprocess.run(f"tar -czf {out} -C {folder} .", shell=True)
NOTE  M3   demo.diff:12  tests/test_archive.py
      existing test file: lines added only. Read the new tests.
FLAG  M3   demo.diff:22  tests/test_archive.py
      test skipped or marked as expected to fail.
      | +@pytest.mark.skip(reason="flaky on CI")

== transcript: demo-transcript.md
FLAG  M6   demo-transcript.md:14
      claims the tests pass, but the last edit (line 10) came after the last test run (line 6).
      | Done. Paths with spaces now work. All tests pass.

4 flag(s), 1 note(s). A flag means "look here", not "this patch is wrong".
Red flags miss logic bugs. Still do S11 (re-run it yourself) and S12 (attack the fix).
```

Exit code 0 means no flags, 1 means at least one flag, and 2 means bad input.
A `NOTE` is worth a look but does not change the exit code.

What it looks for:

- **Diff (M3 test gaming):** added skip, xfail, `.only` or `skip: true`; removed or changed assertions in
  test files; edited, deleted or renamed test files; `sys.exit` or `os._exit` in tests or `conftest.py`;
  changed test or CI config; test-selection options; an `__eq__` that returns `True`; values from the new
  tests that are also written into the new code.
- **Diff (M4 silent damage):** bare or broad `except`, swallowed errors, empty `catch`; functions removed and not
  added back; fewer `raise` / `assert` / `check=True` lines; changed build files.
- **Diff (M9, M10):** `shell=True`, `os.system`, `eval` / `exec`, `verify=False`, unsafe `pickle` / `yaml.load`,
  strings that look like secrets, new or changed dependency and lock files, sanitizers switched off.
- **Diff (notes):** new imports (try each one once: M1), `round()` (it sends ties to the even digit: M5),
  TODOs, suppressed warnings.
- **Transcript (M6, M7, M1):** "all tests pass" with no test run before it, with an edit after the last run,
  with failures in the last run, or with a different test count; `git log --all` and `git reflog`;
  `git fetch` / `clone`; `curl` or `wget` to a code host or anywhere off this machine; web lookup tools;
  installs of named packages; `--no-verify`; mentions of `_key`; your canary string.

What it does **not** do: understand code. On Lab C it misses several flawed patches. That is expected.
Logic bugs, wrong constants and invented calls look like normal code to a pattern.
A clean scan proves nothing. Still re-run everything yourself (S11) and attack the fix (S12).

## Answer keys

Every lab was built with an answer key: the planted defects with file:line and the reason, plus hidden
tests, reference fixes and the scripts that generated the lab. During the build each key sits in
`labs/<lab-id>/_key/`. Before the labs are published, every key moves out of `labs/` into your local
answer keys, a folder on your machine. The playbook's test suite has a publish check that fails while any
`_key/` folder is left in `labs/`. **If you find a `_key/` folder in a published copy, that is a bug: do not
open it before you finish the lab.**

- Do not open a key before you finish the lab. It is the answer sheet.
- Keep the keys where your agents cannot read them, and prove it with the canary test.
- Layout: one folder per lab, holding what was `_key/` during the build:

  ```text
  <your answer-keys folder>/
    lab-a/   key.md  key.json  ...
    lab-c/   key.md  key.json  hidden/  reference/  generate/
    ...
  ```

  `<your answer-keys folder>/lab-a/_key/` works too.

## Check that the labs work: `check_labs.py`

`check_labs.py` proves the labs are sound. It does not grade you. Standard library only, Python 3.9+.

```sh
python3 labs/check_labs.py --keys ~/path/to/your/answer-keys               # everything
python3 labs/check_labs.py --keys ~/path/to/your/answer-keys --only lab-c  # one lab
python3 labs/check_labs.py --only lab-a                                    # keys still in labs/lab-a/_key/
```

Other options: `--verbose` prints every `check.py`'s full output, `--timeout S` sets seconds per lab
(default 900), and `--no-tools` skips the tool self-test.

It does four things:

1. Loads every `labs/*/lab.json` and checks its fields.
2. Checks that the union of `covers` includes M1 to M10 and prints which lab covers which row.
3. Self-tests the tools. Every practice copy must have one commit, the fixed author, the same files as
   `repo/` and no `_key/`. A nested `_key/` must be dropped and a symlink must be refused.
   `redflags.sh` must flag a known bad diff and stay quiet on a known clean one.
4. Runs each `labs/<lab-id>/check.py`, passing `--keys <DIR>/<lab-id>` when you give `--keys`.

Each lab's own `check.py` proves its lab with real runs:

- **lab-a:** each claim is right or wrong exactly as labeled, judged at its file:line; the suite passes twice;
  the issue reproduces; the reference fix passes and the flawed fixes are caught.
- **lab-c:** each planted bug reproduces; every patch applies; clean patches pass all hidden tests;
  each flawed patch shows its defect.
- **lab-d:** the sanitizers report each planted bug at the key's file:line; the clean patch passes; the fixes
  silence the reports.
- **lab-e:** the history builds the same twice; `git bisect run` with the key's script names the planted commit.
- **lab-f:** the weak grader gives its documented results; the key's strong grader gets every solution right in
  3 runs in a row.
- **lab-h:** the bug reproduces; the hidden tests pass on two correct solutions and fail as predicted on the
  wrong ones.

Exit code 0 means everything passed, 1 means something failed, and 2 means bad options.
Real summary from 2026-10-20, with the keys still inside the labs (about 2 minutes in total):

```text
== summary
  part                   result    pass  fail  exit     time  keys
  lab.json + coverage    ok          95     0     -        -
  tools                  ok          63     0     -    1.3 s
  lab-a                  ok          73     0     0    4.0 s  labs/lab-a/_key
  lab-c                  ok         221     0     0    3.8 s  labs/lab-c/_key
  lab-d                  ok          52     0     0   22.6 s  labs/lab-d/_key
  lab-e                  ok          29     0     0   38.7 s  labs/lab-e/_key
  lab-f                  ok          70     0     0   44.8 s  labs/lab-f/_key
  lab-h                  ok          50     0     0    4.3 s  labs/lab-h/_key

ALL OK
```

A second run on 2026-10-20, with every key moved out of `labs/` and passed with `--keys`
(both layouts), also ended with `ALL OK`.

If a lab fails, `check_labs.py` prints that lab's FAIL lines and the last lines of its output.
"NO KEYS" means it found no key folder: pass `--keys`.

## Files here

- `make_practice.sh` makes a safe practice copy (S0).
- `redflags.sh` is the red-flag scan (S10, S14).
- `check_labs.py` checks every lab and the coverage of the mistake card.
- `lab-*/` holds each lab: `README.md` (start here), `lab.json`, `check.py`, and `repo/` or a generator script.
