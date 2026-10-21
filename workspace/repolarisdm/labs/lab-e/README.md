# Lab E: Bisect 200

- **Time box:** 45 minutes.
- **Trains:** S6 Reproduce and S7 Locate of the Agent Patch Audit. Chapter 6, "Debug like a senior".
- **Mistake card:** M2 (wrong root cause) and M8 (answering from memory, not the code).
- **Needs:** git 2.28 or newer, bash, python3 3.9 or newer. Standard library only.

You get a 200-commit history of `billsplit`, a small Python tool that splits bills to the cent.
One commit introduced a money bug. Eight commits in the range cannot even start.
You find the bad commit with `git bisect`, first by hand, then with a script.

## Why Polaris cares

Polaris tasks are built from real software work. A regression in a long history is a classic task:
the commit that broke things gives you the task's starting point, and the fix gives you a reference solution.
You also need this skill to check an agent. An agent will often tell a confident story about where a bug
came from. `git bisect run` replaces the story with a deterministic answer.
In the audit's terms, that is a **[D]** result (from a deterministic tool such as git, pytest or grep),
not an **[A]** claim (from an agent).
And a grader is a script with exit codes, just like a bisect check. Getting 0, 1 and 125 right here is the
same skill as getting a grader's verdicts right.

## The bug report

> Since some release after v0.2.0, `billsplit total` is one cent short for some receipts.
> Receipt (a CSV file):
>
>     item,amount
>     coffee,2.675
>
> v0.2.0 prints `2.68`. Today's `main` prints `Total: 2.67`.
> The rule in the docs: add the exact amounts, then round once, halves away from zero. So 2.68 is right.

## Start

```bash
cd "$(bash labs/lab-e/make_history.sh)"   # builds the repo in a new temp folder (about 10 s)
pwd                                       # note this path; the folder above it is your scratch space
git log --oneline | wc -l                 # 200
git tag                                   # v0.1.0 ... v1.3.0
```

This lab has no `repo/` folder. `make_history.sh` generates the history, with fixed authors and dates,
so everyone gets the same commit ids. If you use an agent, open it in the generated folder only, never
inside the portfolio repository.

If you use an agent, run the canary boundary test first (`labs/README.md`, section 3).
In this lab, also plant the canary next to `gen_history.py`. That file holds the whole history,
so an agent that can read it can read the answer. Delete the canary file when you are done.

Do not read `gen_history.py` before you finish. It contains the whole history, so reading it is the same
as reading `git log -p`, and it skips the skill you are here to practice.

## Part 1: Reproduce (5 min)

Write the receipt to a temp file outside the repo, and see the bug on both ends.

```bash
receipt="$(mktemp)"
printf 'item,amount\ncoffee,2.675\n' > "$receipt"
python3 -B -m billsplit total "$receipt"     # main
git checkout -q v0.2.0
python3 -B -m billsplit total "$receipt"     # the known good release
git checkout -q main
```

Real output (run on 2026-10-20):

```text
Total: 2.67
2.68
```

Notice two things. The number differs (the bug). The format differs too ("Total: "). That is not the bug.

## Part 2: Bisect by hand (15 min, at most 10 tested commits)

```bash
git bisect start main v0.2.0      # bad first, then good
```

```text
Bisecting: 89 revisions left to test after this (roughly 7 steps)
[5d4bcd1dc412b39a43c459b0305b3413aeec90ee] split: name the leftover cents
```

Now test the commit git checked out, and answer with one command:

```bash
python3 -B -m billsplit total "$receipt"
git bisect good      # right amount (2.68)
git bisect bad       # wrong amount
git bisect skip      # cannot test it: the program does not even start
```

The first commit bisect checks out (`5d4bcd1`) is a good example of `skip`. Running the receipt there gives:

```text
    leftover_cents = cents - sum(floors)
IndentationError: unexpected indent
```

That commit is broken, but not in the way the bug report describes. You cannot tell from it whether the
money bug is there. So you skip it. Repeat until git prints `<sha> is the first 'bad' commit`.
(Older git versions print it without the quotes.) Then:

```bash
git bisect log > ../manual-bisect.log   # your record; git bisect replay can redo it
git bisect reset                        # back to main
```

Now count your tested commits. The log writes each test twice: a `# good: [...]` comment and a
`git bisect good <sha>` command. Count only the commands:

```bash
grep -cE '^git bisect (good|bad|skip) ' ../manual-bisect.log
```

It prints 9 if every verdict was right and you skipped only commits that cannot start.
With 179 candidate commits and no skips, bisect needs about 8 tests, because 2 to the 7th is 128
and 2 to the 8th is 256. Each skip can add a test.

## Part 3: Automate with `git bisect run` (15 min)

Copy the template outside the repo. A script inside the repo can be changed or blocked by a checkout.

```bash
cp /path/to/labs/lab-e/check.sh ../check.sh    # use your real path to this lab
```

Fill in the three TODOs. Then test the script on both ends before you trust it:

```bash
git checkout -q v0.2.0 && bash ../check.sh; echo "exit=$?"    # must be 0
git checkout -q main   && bash ../check.sh; echo "exit=$?"    # must be 1
```

The unedited template stops the bisect on purpose:

```text
error: bisect run failed: exit code 255 from 'bash' '../check.sh' is < 0 or >= 128
```

When both ends are right, run it:

```bash
git bisect start main v0.2.0
git bisect run bash ../check.sh
git bisect log > ../run-bisect.log
git bisect reset
```

### The exit-code contract

| Exit code | Meaning for `git bisect run` |
|---|---|
| 0 | good: this commit does not have the bug |
| 1 to 127, except 125 | bad: this commit has the bug |
| 125 | skip: this commit cannot be tested |
| anything else | stop the bisect. `exit -1` becomes 255, so it stops too |

126 and 127 count as bad. The shell uses them for "not executable" and "command not found".
Git 2.55.0 has one guard (observed on 2026-10-20). If the first tested commit exits 126 or 127,
git runs your script again on the good commit. If that gives the same code, git stops with
`error: bogus exit code 127 for 'good' revision`. So a typo that breaks every run stops the bisect.
But a 126 or 127 at only some commits still counts as bad, with no warning. Test the script first.

### Four traps to think about (they are not answers)

1. **Untestable is not the same as bad.** A commit that cannot start tells you nothing about the
   money bug. Think about what bisect concludes from each exit code you give it.
2. **Test the behavior, not the formatting.** The output line changed format somewhere in the range.
   A script that compares the whole line finds that commit instead of the bug.
3. **Gate on what your test needs.** "Can this commit be tested?" means "can my reproduction run?".
   The package may import fine while the command line cannot start.
4. **Stale bytecode.** Python checks a `.pyc` file against the source file's modification time and size
   (PEP 552). Inference: git can rewrite a file within the same second and keep its size, so a stale `.pyc`
   could be reused. Use `python3 -B` or `PYTHONDONTWRITEBYTECODE=1`.

If you skip a commit right next to the bad one, git cannot decide between them. It then lists every
candidate ("only 'skip'ped commits left to test") instead of naming one.

### Verify the answer yourself

A bisect result is a claim too. Check it by hand on the named commit and on its parent:

```bash
bad=PASTE_THE_SHA_BISECT_NAMED
git checkout -q "$bad^" && python3 -B -m billsplit total "$receipt"   # parent: should be right
git checkout -q "$bad"  && python3 -B -m billsplit total "$receipt"   # named commit: should be wrong
git checkout -q main
git show "$bad"                                                       # read the whole diff
```

### Check every label, not only the answer

Bisect visits about 9 of the 179 commits. A script can name the right commit and still give a wrong
exit code at commits bisect never visited. A grader has the same problem: one right verdict does not
prove the others. So run your script on every commit in the range (about 35 seconds):

```bash
for c in $(git rev-list --reverse v0.2.0..main); do
  git checkout -q "$c"; bash ../check.sh >/dev/null 2>&1; echo "$? $c"
done > ../labels.txt
git checkout -q main
awk '{print $1}' ../labels.txt | sort | uniq -c    # how many 0, 1 and 125
```

Eight commits cannot start, so you want exactly eight lines with 125. Check each of them by hand:

```bash
for c in $(awk '$1==125 {print $2}' ../labels.txt); do
  git checkout -q "$c"; python3 -B -m billsplit --help >/dev/null 2>&1; echo "help exit=$? $c"
done
git checkout -q main
```

Every line should show a help exit that is not 0. Then compare `../labels.txt` with `../run-bisect.log`.
The log shows only the commits bisect visited. The labels show all of them.

## Part 4: Judge three agent claims (5 min)

*Synthetic, written for practice. Not real Gemini output.* An agent looked at the bug report and said:

- **C1.** "The regression is in `round_money`: it switched to banker's rounding (ROUND_HALF_EVEN) after v0.2.0."
- **C2.** "Commits that fail to import are broken anyway. Mark them bad (exit 1) instead of skipping them.
  Bisect will still name the same commit."
- **C3.** "Only amounts with more than two decimal places are affected. Totals of normal prices like 3.50 did not change."

For each claim, write "right" or "wrong" and one [D] command whose output supports your verdict.
One counterexample is enough to call a claim wrong. A claim about every input needs more to be right:
add a one-line argument from the code, with file:line. Examples are evidence, not proof. Useful tools:
`git show v0.2.0:billsplit/money.py`, `git grep -n ROUND_HALF_EVEN main`, `git log -L :round_money:billsplit/money.py`,
and your own reproduction with other receipts.

## Part 5: Explain the root cause (5 min)

Gate 3 of the audit: explain the bug in two sentences, with file:line. Say which documented rule the code
breaks. Stretch goal: write the fix and a test that fails before it and passes after it. Then revert
your fix and check that the test fails again.

## Done when

- [ ] `../check.sh` exits 0 at v0.2.0 and 1 at main.
- [ ] `../labels.txt` has exactly 8 lines with 125, and every other line starts with 0 or 1.
  At each 125 commit, `python3 -B -m billsplit --help` fails.
- [ ] `git bisect run` names exactly one commit, and you confirmed it by hand on that commit and its parent.
- [ ] Your manual bisect used at most 10 tested commits:
  `grep -cE '^git bisect (good|bad|skip) ' ../manual-bisect.log` prints 10 or less.
- [ ] C1, C2 and C3 are judged, each with a command and its output. A "right" claim about every input
  also has its one-line argument.
- [ ] The root cause is written in two sentences with file:line.

## Check your work

`check.py` builds the history twice and proves the lab: the history is deterministic, the key's check
script labels all 179 commits correctly, bisect with it names the planted commit in at most 10 tests,
three trap scripts behave the way the key predicts, and each claim's label matches the code.
It prints the answers, so run it only after you finish:

```bash
python3 labs/lab-e/check.py --keys /path/to/your/local/answer-keys/lab-e
```

It needs about one minute and writes nothing inside the lab folder.

## Sources

- git-bisect manual, git 2.55.0 (`git help bisect`, read locally on 2026-10-20): exit codes 0, 1 to 127
  except 125, 125 for skip, other codes abort. Also https://git-scm.com/docs/git-bisect (checked 2026-10-20).
  The 126/127 guard was observed, not read: `git bisect run` with a script that always exits 127
  stopped with "bogus exit code 127 for 'good' revision" (git 2.55.0, 2026-10-20).
- PEP 552, "Deterministic pycs": the `.pyc` header stores the source's modification time and size.
  https://peps.python.org/pep-0552/ (checked 2026-10-20).
- All command output above was captured from this lab on 2026-10-20 (macOS, git 2.55.0, Python 3.13.9).
