# Lab F: Break the Grader

**Time box:** 3 hours. **Language:** Python 3.9+ and bash. **Trains:** S10–S12, Chapters 7 and 8.
S11 and S12 are the core: pristine tests, stable runs, boundary cases, an oracle, metamorphic checks.
S10 comes in when you read what each candidate changed, and in Agent mode, when you audit a grader an agent drafted.

A Polaris task is a prompt plus a grader. If the grader is wrong, every number it produces is wrong.
This lab gives you a small Harbor-style task whose grader looks fine and is not.
It gives the reference solution 1 and the do-nothing solution 0.
But it also accepts 5 wrong solutions and rejects 2 correct ones.
Your job: rewrite the grader until it gets every solution right, every time.

## What you get

- `repo/task/`: the task in Harbor layout (`instruction.md`, `task.toml`, `environment/`, `solution/`, `tests/`).
  The app is `freebusy`, a small library that merges room bookings into busy spans.
  The function to implement is `merge_busy`. The spec is `instruction.md`, rules R1–R12.
- `repo/solutions/`: 8 candidate solutions: `alt-1`, `alt-2` (correct), `wrong-1` … `wrong-5`, `do-nothing`.
- `repo/run_task.sh`: runs one solution, or all of them, against the grader, like one Harbor trial each.

## How to start

1. From the playbook folder (the one that contains `labs/`), make a practice copy with its own fresh git history:

   ```sh
   bash labs/make_practice.sh lab-f
   ```

   It prints the path of a new temp folder. `cd` there.
   If you use an agent, open it **there**, never inside the portfolio repository.
   (Inside the portfolio repo an agent could read this lab's history and your answer keys.)
2. Run the matrix with the grader as it is now:

   ```sh
   bash run_task.sh --all
   ```

   You should see this (real output from 2026-10-20; the lines with paths are left out):

   ```text
   solution    expect  run1  verdict
   reference   1       1     ok
   alt-1       1       0     FALSE REJECT
   alt-2       1       0     FALSE REJECT
   do-nothing  0       0     ok
   wrong-1     0       1     FALSE ACCEPT
   wrong-2     0       1     FALSE ACCEPT
   wrong-3     0       1     FALSE ACCEPT
   wrong-4     0       1     FALSE ACCEPT
   wrong-5     0       1     FALSE ACCEPT

   mode: local, runs per solution: 1, solutions: 9
   false accepts: 5, false rejects: 2, unstable: 0, no expectation: 0
   These are counts over a hand-picked corpus, not error rates.
   matrix: NOT OK
   ```

3. Read `task/instruction.md` twice. Then read `task/tests/`. Then start.

## Your task

Rewrite `task/tests/` (keep `test.sh` as the entry point) into a strong grader. Rules:

- Change only `task/tests/`. Do not change `instruction.md`, `environment/` or `solutions/`.
- Every check must follow from a rule in `instruction.md`. Write the rule number (R1–R12, or "Interface") next to it.
- Never check what the spec leaves open. A correct solution may differ from the reference there.
- Grade behavior only. A grader that recognizes known files (hashes, names, line counts) is cheating.
  The held-out check below uses solutions you have never seen, and it will expose that.
- You may read the candidates' code. But write each check for a rule, not for a file you read.
- The grader must be deterministic: fixed seeds, no clocks, no network.

A good order of work:

1. Turn each rule into at least one test. Include the exact boundaries the rules name.
2. Run the matrix. Note which solutions survive.
3. For each survivor, find the rule it breaks. Then add a test for the **rule**, not for that file.
4. For each false reject, find the check that is stricter than the spec. Loosen it to what the spec says.
5. Add one check that does not depend on your own expected values: compare against a slow, obviously correct
   version you write from the spec, on seeded random inputs.
6. Repeat until the matrix is clean. Then run it 3 times.

## Done when

- `bash run_task.sh --all --runs 3` ends with `matrix: OK`:
  reference, alt-1 and alt-2 get 1; do-nothing and wrong-1 … wrong-5 get 0; all 3 runs agree.
- Every check in your grader names the rule it enforces.
- For each wrong solution you can say, in one sentence, which rule it breaks and which check catches it.
- You ran the held-out check below once, after the matrix was OK.
  Every miss is a line under "known limits" in your card, with the rule you think it breaks.
- You wrote a 5-line Grader Validity Card: corpus (what you tested on), sampling frame (hand-picked, so
  counts only), results, stability (runs), and known limits.

## Held-out check (after the matrix is OK)

A clean matrix on 9 known solutions can still be a grader fitted to those 9.
This check runs your grader on solutions you have never seen. Run it from the playbook folder:

```sh
python3 labs/lab-f/check.py --grader-only --keys <your local answer-key folder for lab-f> --grader <practice folder>/task/tests
```

It prints one line per solution (name, public or held out, expected reward, your 3 rewards) and a total.
It shows no answers. Do not open the key folder itself until you are done.

## Stretch

- Run the matrix in Docker: `bash run_task.sh --all --runs 3 --docker`.
- Write one new wrong solution that your grader still accepts. Then fix the grader.

## Three ways to practice

- **No AI** (best first time): you write every test. This is the interview-safe skill.
- **Chat only**: ask a chat model to explain a rule or review one test. You write the code.
- **Agent**: let an agent draft the grader, then audit it like a patch (S10–S12).
  Watch for a grader that is fitted to the 5 known wrong solutions instead of the spec.

## Stuck? Generic hints

1. Two experts reading the spec should agree on every verdict your grader gives.
2. Ask what the spec leaves open. Then make sure no check depends on it.
3. Ask which files the agent could have changed before your grader ran.
4. An equality check can be coarser than the property you claim to check.
5. Change the input in ways the spec says must not matter. The output must not change either.

## Requirements

Python 3.9 or newer and bash (macOS `/bin/bash` 3.2 works). No third-party packages: see `requirements.txt`.
Docker is optional; `--docker` uses the image in `task/environment/Dockerfile` with no network.

## Why these choices (sources, checked 2026-10-20)

- Harbor task layout and the reward file `/logs/verifier/reward.txt`: [Harbor docs](https://docs.harborframework.com/tasks/overview).
  Tests are uploaded to `/tests` after the agent runs: [Harbor verifier docs](https://docs.harborframework.com/tasks/verifier).
- Graders also fail by rejecting valid work. SWE-bench Verified annotators screened for tests that reject valid
  solutions; one bad test required a warning message the issue never mentioned:
  [OpenAI, 2024-08-13](https://openai.com/index/introducing-swe-bench-verified/).
- Agents game weak tests by editing tests and special-casing test inputs:
  [ImpossibleBench, 2025-10-23](https://arxiv.org/abs/2510.20270).
- "Oracle passes, no-op fails" is the minimum, not proof. Terminal-Bench 2.0 verifies tasks for solvability
  and also for specificity and integrity (no shortcuts): [arXiv 2601.11868](https://arxiv.org/html/2601.11868).
- DeepSWE runs each verifier 3 times during authoring and sends flaky ones back:
  [Datacurve, 2026-05-26](https://deepswe.datacurve.ai/blog/deepswe).
