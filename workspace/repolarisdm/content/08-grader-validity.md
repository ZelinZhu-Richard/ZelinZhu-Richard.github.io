---
title: Grader validity (the science)
short: Grader validity
summary: Treat a grader as a classifier with two kinds of error. Collect the right evidence against each kind, state the sampling frame behind every number, and write a Grader Validity Card that a reviewer can check line by line.
---

:::selfcheck
- Name the two ways a grader can be wrong. Say which one inflates a model's score. || A **false accept** gives credit to a wrong solution. It inflates scores. A **false reject** gives no credit to a correct solution. It deflates scores.
- Your grader rejected 12 of 12 wrong solutions you wrote by hand. Can you report "false-accept rate 0%, 95% interval 0–24%"? || No. Its frame is "hand-picked": no random draw links your 12 to any population, so it gives counts, not a rate. Say "rejected 12 of 12 hand-written wrong solutions (hand-picked; counts only)".
- Write the Wilson 95% interval formula. Compute it for 19 of 20. || center = (p + z²/(2n)) / (1 + z²/n), half = z/(1 + z²/n) × √(p(1 − p)/n + z²/(4n²)), with p = k/n and z = 1.96. For 19/20 it is about [76.4%, 99.1%].
- State the knowledge-time future-invariance property in one sentence. Name one change it does NOT cover. || Changing, adding or deleting any vintage published after t must not change any output computed as of any time at or before t. It does not cover data with an event time after t that was already published by t.
- Your grader gave the same verdicts in 3 runs. Is it free of flakiness? || No. If each run flakes independently with the same 5% chance, 3 runs show the flake only 14.3% of the time. You need 59 runs to see it with 95% chance. Real flakes often depend on load or order, and then extra runs help even less.
- Name three ways a solution can make a weak grader return 1 without solving the task. Give one defense for each. || A `conftest.py` hook that rewrites failures (ignore it: `--noconftest`, or grade a clean copy). `os._exit(0)` at import (require a report with the expected test count). A forged report (compute the verdict in a process the candidate cannot touch).
:::

## Why Polaris cares

A Polaris task is a prompt plus a grader, and the team also builds data and pipelines to improve Gemini ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19").
If the grader is wrong, every number the task reports is wrong.
Public graders fail often: UTBoost found 345 wrong patches marked as passing on SWE-bench, which changed 11 SWE-bench Verified rankings ^[confirmed](https://arxiv.org/abs/2506.09289 "2026-10-20").
When a grader becomes an RL reward, a model is optimized against it, and every hole becomes a target.
Tamay Besiroglu, a Mechanize co-founder now at Google DeepMind, recruits for Polaris "evals and environments" ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20").
"How do you know your grader is right?" is a likely interview question ^[inference](- "2026-10-20"), and this chapter answers it (see [[defend-it#q1|Q1 in Defend it]]).

## How to use this chapter {#how-to-use}

:::tip title="Sprint path (Oct 24–27: 1.5 h reading + Lab F)"
1. Read, about 70 minutes: [the classifier](#classifier), [sampling frames](#sampling-frames) to [the frame sentence](#frame-sentence), [what Wilson assumes](#wilson-assumptions), [the four times](#four-times) and [how Chronos uses these checks](#chronos-checks), [metamorphic tests](#metamorphic), [the isolation checklist](#isolation-checklist), [the card](#validity-card).
2. Do the [frame-it drill](#drill-frame-it). 20 minutes.
3. Do [Lab F](#drill-lab-f-drill) with no AI. Its time box is 3 hours. In the sprint, stop at 2 hours and note where you are ([[tracker#block-2|tracker]]).

After you apply: Wilson by hand, the toy scripts and the census, the tamper demo, reward hacking, and the other drills.
:::

## The grader is a classifier {#classifier}

A **grader** is the code that turns an attempt into a number. For now, take a binary grader: it says 1 (accept) or 0 (reject).
Every attempt is also, in truth, correct or wrong. "In truth" means: two experts who read the spec would agree. Anthropic's eval guide uses exactly this test for a good task ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20").
So a grader is a classifier, and it can make two kinds of error.

| | Grader says 1 | Grader says 0 |
|---|---|---|
| Attempt is correct | true accept | **false reject** |
| Attempt is wrong | **false accept** | true reject |

- A **false accept** gives credit to a wrong solution. Weak tests cause it. So do cheats: edited tests, special-cased inputs, a forged report.
- A **false reject** gives no credit to a correct solution. Over-strict tests cause it: tests that check something the spec leaves open, or that encode one design.

Both are real. To build SWE-bench Verified, OpenAI hired 93 developers to filter out tasks with overly specific or issue-unrelated tests ^[reported](https://arxiv.org/abs/2503.15223 "2026-10-20").
An OpenAI audit, as summarized by Epoch AI, estimated that about 30% of SWE-Bench Pro's 731 public tasks are broken, most often by overly strict hidden tests ^[reported](https://epoch.ai/benchmarks/swe-bench-pro/review "2026-10-20").
Anthropic found several problems in CORE-Bench. A grader rejected "96.12" when it expected "96.124991…". Some task specs were ambiguous, and some stochastic tasks could not be reproduced. After those fixes and a less constrained scaffold, Opus 4.5 went from 42% to 95% ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20").

Two rates describe a grader:
- **false-accept rate** = false accepts ÷ wrong attempts,
- **false-reject rate** = false rejects ÷ correct attempts.

Each rate needs a denominator: *which* wrong attempts, *which* correct attempts? That question is the sampling frame. It is the center of this chapter.

### What grader errors do to a score {#score-bias}

A grader with error rates FAR and FRR turns a true success rate into a measured one:

```text
measured = true × (1 − FRR) + (1 − true) × FAR
```

Check it in Python, with made-up rates FAR = 10% and FRR = 5%:

```python
for true in (0.3, 0.9):
    far, frr = 0.10, 0.05
    print(true, round(true * (1 - frr) + (1 - true) * far, 4))
```

```text
0.3 0.355
0.9 0.865
```

A weak model that truly solves 30% is measured at 35.5%. A strong model that truly solves 90% is measured at 86.5%. False accepts inflate weak models. False rejects deflate strong ones. The gap shrinks from 60 points to 51, but the order stays.
With the same FAR and FRR for every model, measured = FAR + true × (1 − FAR − FRR). When FAR + FRR < 1, that always rises with the true rate, so equal error rates never flip a ranking.
Rankings flip when the error rates differ between models: for example, when one model's wrong patches are exactly the kind your tests miss.
EvalPlus shows that this happens. About 80 times more tests per problem cut pass@k by up to 19.3–28.9%, and model rankings changed ^[confirmed](https://arxiv.org/abs/2305.01210 "2026-10-20"). So the old tests had different false-accept rates for different models ^[inference](- "2026-10-20").

### The error rate you care about is one you cannot sample {#which-rate}

Here is the hard part. The false-accept rate that distorts Gemini's score is the rate over **Gemini's own wrong attempts** on this task. You do not have those attempts when you build the grader. Nobody does.
So no corpus you build is a sample of that population. Your corpora are **evidence about the grader**. They are not an estimate of the error in a model's score ^[inference](- "2026-10-20").
The only direct estimate is to have humans adjudicate a random sample of real graded attempts against the spec. METR did a version of this. Four maintainers from scikit-learn, Sphinx and pytest reviewed 296 test-passing AI pull requests blind. Their merge rates came out about 24 points below the automated grader. That gap is on a normalized scale: the original human PRs were re-approved only about 68% of the time, and scores are a share of that. The raw gap was about 35 points ^[confirmed](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ "2026-10-20").
For your own task, that adjudicated sample is the pilot study: "N attempts by one agent configuration on one task", each one read against the spec.
In Chronos, the pilot uses Claude agents, not Gemini. Its adjudicated counts describe the grader on Claude's attempts only ^[inference](- "2026-10-20"). Before you claim anything about Gemini's score, adjudicate a sample of the Gemini runs too ([[runs-and-weaknesses]]).

## Sampling frames {#sampling-frames}

A **sampling frame** is the defined set your test cases came from, plus the rule that picked them. Every number about a grader needs one. Three frames come up again and again.

| Frame | What you did | What you may report | What you may not report |
|---|---|---|---|
| **Hand-picked corpus** | You, or someone else, chose the cases | Counts: "rejected 12 of 12" | A rate as an estimate, an interval, "0% false accepts" |
| **Census of an enumerated space** | You defined a space with a fixed rule, then ran every member | An exact rate over that space | A sampling interval (there is no sampling error); any claim outside the space |
| **Random sample of a defined space** | You defined a space, then drew members with a seeded random generator | A rate, a Wilson interval, and the frame | Any claim outside the space |

A fourth case looks new but is the third frame: **real attempts**, such as 20 attempts by one agent configuration on one task. If the attempts are independent, a rate and a Wilson interval are fine, for that configuration and that task only.

:::warn title="Never pool frames"
Do not add hand-picked counts, mutant kills and pilot results into one percentage. Each number belongs to its own frame. Report them in separate rows.
:::

### Frame 1: a hand-picked corpus gives counts {#frame-hand-picked}

You wrote 12 wrong solutions. Your grader rejects all 12. What does that tell you?

It tells you the grader catches **those 12 bugs**. It does not give a rate, for three reasons:
1. No probability rule connects your 12 to any population. A Wilson interval assumes random draws. You did not draw.
2. You picked bugs you could imagine. They are likely the bugs you designed the grader against. The test is partly circular ^[inference](- "2026-10-20").
3. A percentage invites the reader to generalize to bugs you did not imagine. That is the exact claim you have no evidence for.

So write: "rejected 12 of 12 hand-written wrong solutions (hand-picked; counts only)". The Lab F runner prints the same rule at the bottom of every matrix: "These are counts over a hand-picked corpus, not error rates."

Hand-picked corpora are still valuable. They are the best way to test **specific, realistic** failures: the leakage bug you expect an agent to write, or the cheat you saw in a transcript. Counts are the right way to report them.

### Frame 2: a census of an enumerated mutant space gives a kill rate {#frame-census}

A **mutant** is a copy of the reference solution with one small, mechanical change. Change `<=` to `<`. Delete one statement. Drop one function call. The rule that makes these changes is the **operator set**.
A grader **kills** a mutant when it scores it 0. A mutant **survives** when it scores 1.
Some mutants behave exactly like the original on every input the spec allows. They are **equivalent mutants**. No grader can kill them, so you adjudicate each one by hand, exclude it, and write down why.

When you define a space by a fixed rule and run every member, you have a **census**. The kill rate is exact over that space. There is no sampling interval, because nothing was sampled.

Equivalence is a judgment, so it can be biased. Calling a hole "equivalent" makes the kill rate look better. The rule:
- Best: decide which mutants are equivalent **before** you look at the grader's verdicts.
- If you decide after the run, each "equivalent" needs a written argument from the spec's input domain, checked by a second person.
- If you find one allowed input where the outputs differ, the mutant is not equivalent.

The toy later in this chapter has a real census: 14 mutants, 4 equivalent, all 10 others killed ([the census run](#census-run)).

What a census does **not** show: anything about mutants outside its operator set, about second-order mutants, or about wrong **designs**. Mutants model small slips. Real agents also write "similar but different" logic. PatchDiff studied the behaviorally divergent test-passing patches from three tools on SWE-bench Verified. "Similar but different" logic was the largest category, 46.8% of them ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20"). A mutant census complements unseen wrong solutions. It does not replace them.

### Frame 3: a random sample of a defined space supports an interval {#frame-random-sample}

Sometimes the space is too big for a census. Suppose the reference diff has 205 non-equivalent first-order mutants, and you want the second-order space: every pair of them. Call it space Q. It has C(205, 2) = 20,910 mutants. At 40 seconds per grader run, a census takes about 232 hours.
So you draw a uniform random sample with a fixed seed, say 150 non-equivalent pairs. If you draw an equivalent mutant, you adjudicate it, exclude it, and draw again. Suppose 141 are killed.
Now a rate with an interval is honest, because the sample is random from a defined space: **94.0%, Wilson 95% [89.0%, 96.8%]**. The next section shows how to compute it.
These numbers are a made-up example. The C(205, 2) and the 232 hours are arithmetic from those made-up inputs.

### The frame sentence {#frame-sentence}

Every grader number ships inside one sentence that states its frame:

```text
<result> over <the space: what it is, how it was defined, how members were chosen,
how many, what was excluded and why>, grader <version>, <runs> runs each.
```

| Bad | Good |
|---|---|
| "Our grader has a 98% kill rate." | "Killed 196 of 200 mutants drawn uniformly (seed 7) from the 20,910 second-order mutants of the reference diff under operator set O: 98.0%, Wilson 95% [95.0%, 99.2%]." |
| "Zero false accepts." | "Rejected 12 of 12 hand-written wrong solutions (hand-picked; counts only)." |
| "Validated on 1,000 random tests." | "Agreed with the oracle on 1,000 seeded random datasets from generator G (seeds 0–999). G makes ties on a whole-hour grid. It does not make daylight-saving folds." |
| "The grader accepts all correct solutions." | "Accepted 3 of 3 independent correct solutions (hand-picked) and every member of a census of 24 refactor variants." |

(The numbers in this table are examples. The interval in the first row is a real Wilson computation from those inputs.)

## The Wilson interval {#wilson}

When the frame is a random sample, report a confidence interval. Use the **Wilson score interval**, not the textbook "p ± 1.96 × standard error" (the **Wald** interval). Brown, Cai and DasGupta showed that the Wald interval covers the truth badly, even for large n, and recommend Wilson or Jeffreys for small n ^[confirmed](https://doi.org/10.1214/ss/1009213286 "2026-10-20"). Wilson published his interval in 1927 ^[confirmed](https://doi.org/10.1080/01621459.1927.10502953 "2026-10-20").

The formula, for k successes in n trials:

```text
p      = k / n
z      = 1.959964                       (for 95%)
denom  = 1 + z^2 / n
center = (p + z^2 / (2n)) / denom
half   = (z / denom) × sqrt( p(1 − p)/n + z^2 / (4n^2) )
Wilson interval = [center − half, center + half]
```

### A worked example by hand {#wilson-by-hand}

The sample from Frame 3: k = 141 killed, n = 150 sampled.

1. p = 141 / 150 = 0.94.
2. z² = 1.959964² = 3.8415. Then z²/n = 0.02561, so denom = 1.02561.
3. center = (0.94 + 3.8415/300) / 1.02561 = (0.94 + 0.012805) / 1.02561 = 0.92901.
4. Inside the square root: 0.94 × 0.06 / 150 = 0.000376, and 3.8415 / 90,000 = 0.0000427. The sum is 0.0004187. Its square root is 0.020462.
5. half = (1.959964 / 1.02561) × 0.020462 = 1.91100 × 0.020462 = 0.03910.
6. Interval = [0.92901 − 0.03910, 0.92901 + 0.03910] = **[0.8899, 0.9681]**, or [89.0%, 96.8%].

Notice two things. The center (92.9%) is pulled from 94.0% toward 50%. And the interval is not symmetric: 5.0 points below p, 2.8 points above. Near 0% and 100%, a symmetric interval would be wrong.

### The same in code {#wilson-code}

Save this as `wilson.py`. It uses only the standard library.

```python
"""Wilson score interval for a binomial proportion. Standard library only."""
from math import sqrt
from statistics import NormalDist


def wilson(k, n, conf=0.95):
    """Wilson score interval for k successes in n independent trials."""
    if n <= 0 or not 0 <= k <= n:
        raise ValueError("need 0 <= k <= n and n > 0")
    z = NormalDist().inv_cdf(1 - (1 - conf) / 2)  # 1.959964 for 95%
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = (z / denom) * sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return max(0.0, center - half), min(1.0, center + half)


def wald(k, n, conf=0.95):
    """The textbook interval p +- z*sqrt(p(1-p)/n). Shown only to compare."""
    z = NormalDist().inv_cdf(1 - (1 - conf) / 2)
    p = k / n
    half = z * sqrt(p * (1 - p) / n)
    return max(0.0, p - half), min(1.0, p + half)


def show(k, n):
    lo, hi = wilson(k, n)
    wlo, whi = wald(k, n)
    print(f"{k:>4}/{n:<4} p_hat={k / n:6.1%}  Wilson [{lo:6.1%}, {hi:6.1%}]  Wald [{wlo:6.1%}, {whi:6.1%}]")


if __name__ == "__main__":
    z = NormalDist().inv_cdf(0.975)
    print(f"z for 95%: {z:.6f}")
    # Worked example: 141 of 150 sampled mutants killed.
    k, n = 141, 150
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = (z / denom) * sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    print(f"p_hat={p:.4f}  z^2/n={z * z / n:.5f}  denom={denom:.5f}")
    print(f"center={center:.5f}  half={half:.5f}  interval=[{center - half:.4f}, {center + half:.4f}]")
    print()
    for k, n in [(141, 150), (20, 20), (0, 20), (19, 20), (3, 10), (196, 200)]:
        show(k, n)
```

Real output (Python 3.13.9, 2026-10-20):

```text
$ python3 wilson.py
z for 95%: 1.959964
p_hat=0.9400  z^2/n=0.02561  denom=1.02561
center=0.92901  half=0.03910  interval=[0.8899, 0.9681]

 141/150  p_hat= 94.0%  Wilson [ 89.0%,  96.8%]  Wald [ 90.2%,  97.8%]
  20/20   p_hat=100.0%  Wilson [ 83.9%, 100.0%]  Wald [100.0%, 100.0%]
   0/20   p_hat=  0.0%  Wilson [  0.0%,  16.1%]  Wald [  0.0%,   0.0%]
  19/20   p_hat= 95.0%  Wilson [ 76.4%,  99.1%]  Wald [ 85.4%, 100.0%]
   3/10   p_hat= 30.0%  Wilson [ 10.8%,  60.3%]  Wald [  1.6%,  58.4%]
 196/200  p_hat= 98.0%  Wilson [ 95.0%,  99.2%]  Wald [ 96.1%,  99.9%]
```

The hand computation and the code agree to four decimals.
Look at 20 of 20. Wald says [100%, 100%]: perfect certainty from 20 trials. That is absurd. Wilson says the true rate could be as low as 83.9%.
Look at 0 of 20. Even with **zero** failures in 20 random draws, the failure rate could be up to 16.1%. A quick rule for zero events in n trials: the one-sided 95% upper bound is about 3/n (here 15%). Wilson's 16.1% is the top of a two-sided 95% interval, so the two numbers answer slightly different questions.

### What Wilson assumes {#wilson-assumptions}

1. **Independent draws from the frame.** You drew members at random with a recorded seed, from a list you enumerated first. For agent attempts there is no list and no seed. Then each attempt must be a fresh, independent run of one fixed configuration (same model, prompt, harness and budget) in a fresh workspace. The population is that configuration's attempts on this task.
2. **One fixed success probability**, the rate over the frame.
3. **A clear verdict per member.** A member whose verdict changes between runs is a third outcome. Resolve flakiness first, or report flaky members separately.
4. **A large space, or draws with replacement.** If you sample without replacement from a small space, Wilson ignores the finite-population correction. The interval is then a bit wider than needed, which is the safe direction. If your sample is a big part of the space, run the census instead.
5. **Exclusions are part of the frame.** If you exclude equivalent mutants, the frame is "non-equivalent mutants". Mistakes in that adjudication are not inside the interval.

The interval covers **sampling error only**. It says nothing about members outside the frame, about real agent bugs, or about a different grader version.

### How many samples? {#sample-size}

Before you sample, decide how wide an interval you can accept. This script finds the smallest n whose Wilson interval has a given half-width (`plan_n.py`, next to `wilson.py`):

```python
"""How many samples, and how many repeat runs? Standard library only."""
from math import ceil, log
from wilson import wilson


def n_for_halfwidth(p, h):
    """Smallest n whose Wilson interval at p_hat = p has half-width <= h."""
    n = 2
    while True:
        k = round(p * n)
        lo, hi = wilson(k, n)
        if (hi - lo) / 2 <= h:
            return n
        n += 1


print("expected rate | half-width 10 pts | 5 pts | 3 pts")
for p in (0.5, 0.8, 0.9, 0.95):
    row = [n_for_halfwidth(p, h) for h in (0.10, 0.05, 0.03)]
    print(f"{p:>13.0%} | {row[0]:>17} | {row[1]:>5} | {row[2]:>5}")

print()
# Assumes each run flakes independently, with the same chance every run.
print("flake rate | P(see it in 3 runs) | runs to see it with 95% chance")
for f in (0.20, 0.05, 0.01):
    seen3 = 1 - (1 - f) ** 3
    runs95 = ceil(log(0.05) / log(1 - f))
    print(f"{f:>10.0%} | {seen3:>19.1%} | {runs95:>30}")
```

```text
$ python3 plan_n.py
expected rate | half-width 10 pts | 5 pts | 3 pts
          50% |                93 |   381 |  1064
          80% |                60 |   245 |   681
          90% |                34 |   141 |   384
          95% |                24 |    82 |   208

flake rate | P(see it in 3 runs) | runs to see it with 95% chance
       20% |               48.8% |                             14
        5% |               14.3% |                             59
        1% |                3.0% |                            299
```

Treat the first table as planning numbers: the real width depends on the rate you observe. The second table is for the [flakiness](#flakiness) section.
[[runs-and-weaknesses]] uses the same tools for model runs (pass@k, pass^k, bootstrap intervals).

## Evidence against false rejects {#false-rejects}

A false reject happens when the grader checks something the spec leaves open. The most common cause: the grader was written next to one reference solution, so it quietly encodes that solution's design.
DeepSWE's verifiers test observable behavior through public APIs and accept any implementation that produces it. The reference solution is used only for review, never for grading ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20").

### At least three independent correct implementations {#independent-correct}

Rule: **at least three correct solutions, with different designs, by different authors, must all score 1.**
- *Independent* means the author saw only the instruction and the environment. Not the reference, not the grader, not the hidden tests. Another person works. So does another model run in a fresh workspace with only `instruction.md`.
- *Different designs* means really different: a single sorted sweep, a brute-force scan, a dictionary of lists, a class with state. If all three use the same algorithm, you tested one design three times.
- *Correct* is decided by reading each one against the spec **before** you grade it. "It passed the grader, so it is correct" is circular.

Why three? One reference cannot tell you what is design and what is spec. Three is a minimum, not a magic number. Each new design is one more chance to expose a check that encodes the reference's design instead of the spec. What counts is how different the designs are. It is still a hand-picked set, so report counts ^[inference](- "2026-10-20").

When a correct solution scores 0, there are three possible causes. Find out which one:
1. The grader checks something the spec does not say. Fix the grader.
2. The spec is ambiguous, and two readings are both reasonable. Fix the spec, then re-run everything.
3. The "correct" solution is wrong after all. Write down the rule it breaks.

### Refactor-equivalent variants {#refactor-variants}

A **refactor-equivalent variant** is a correct solution after a change that keeps its behavior: rename identifiers; reorder independent statements; inline or extract a helper; swap a list for a tuple inside the function; iterate in another order when the result does not depend on it; use another representation that the spec says is free.
Generate variants of each correct solution mechanically. Every variant must score 1.
A failing variant points at a check on something the spec leaves open: a private helper's name, the order of side effects, the exact text of a log line, the type of a container, the number of calls to a function.

Two warnings:
- Some "refactors" are not equivalent. Floating-point addition is not associative, so reordering a sum can change the last digits. Adjudicate before you blame the grader.
- The variant set is a frame too. Report "every member of a census of transformation set T applied to the 3 correct solutions", not "robust to refactoring".

### Trace every check to the spec {#traceability}

Write the spec rule next to every check. Then read the list both ways.
- A check with no rule is a false-reject risk. Delete it, or add the rule to the spec.
- A rule with no check is a false-accept risk. Add a check.

The Terminal-Bench checklist says the same: every tested behavior is in the instruction, and every instruction is tested ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20").
OpenAI's 2026 audit of SWE-bench Verified named both failures: "narrow" tests that enforce details the issue never states, and "wide" tests that check behavior the issue never asks for. Secondary coverage reports the split for the audited set. The audit covered 138 of the hardest problems, ones models often failed: about 27.6% of Verified. About 35.5% of them had narrow tests and 18.8% had wide tests ^[reported](https://aiweekly.co/alerts/openai-drops-swe-bench-verified-backs-pro-after-flaw-audit "2026-10-20"). That subset was selected by failure, not at random. So these are not rates for all of SWE-bench Verified.

## Evidence against false accepts {#false-accepts}

A false accept happens when a wrong solution meets every check. Your job is to try hard to make one, before an agent does.

### Unseen wrong approaches {#unseen-wrong}

Your own wrong solutions share your blind spots. The grader you wrote probably already catches them. So you also need wrong solutions you did not imagine.
1. **Freeze the grader first.** Record its commit. Nobody changes it during this step.
2. **Get wrong solutions from someone who never saw the grader**: another person, or another model given only the instruction and asked for a plausible submission that breaks a stated rule. Real failed attempts from a pilot run are the best source, because they come from the distribution you care about.
3. **Adjudicate each one against the spec.** Write the rule it breaks. If it breaks none, it is a correct solution, and it belongs in the other corpus.
4. **Run.** Every wrong solution must score 0.
5. **Keep some sealed.** Use a sealed set once per grader version, like a test set in machine learning. If you fix the grader after seeing a sealed wrong solution, that solution has become a training example. Get new sealed ones ^[inference](- "2026-10-20").

Report these as counts, with the frame "written by others; hand-picked by them".

### Mutants {#mutants}

[The census run](#census-run) showed a real mutant census. Three facts make mutants worth the effort:
- Detecting mutants correlates with detecting real faults, independently of code coverage, in a study of 357 real faults ^[confirmed](https://people.cs.umass.edu/~rjust/publ/mutants_real_faults_fse_2014.pdf "2026-10-20").
- Coverage is a weak target: once suite size is controlled, its correlation with effectiveness is only low to moderate ^[confirmed](https://cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf "2026-10-20").
- Google runs diff-based mutation testing in code review. Without filtering, developers judged 85% of mutants unproductive, so Google picks operators and caps mutants per line ^[confirmed](https://arxiv.org/abs/2102.11378 "2026-10-20"). Choose your operator set with care, and fix it before you run.

Generate mutants from the **reference diff** (the lines the task asks the solver to write), not from the whole repository. A mutant in untouched code tests the visible test suite, not your grader.

### Cheats and the do-nothing baseline {#cheats}

Every grader must give 0 to these, in every run:
- **do-nothing**: the unchanged environment. If it scores above 0, part of your reward is free.
- **special-casing**: code that returns the expected outputs for the visible examples. ImpossibleBench lists special-casing test inputs among the four cheating strategies it observed ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20").
- **edited tests**: changes to visible tests, `conftest.py`, fixtures or CI (continuous integration) config.
- **early exit**: `sys.exit(0)` before the asserts run. Anthropic reports that models learned it in real coding RL ^[confirmed](https://www.anthropic.com/research/emergent-misalignment-reward-hacking "2026-10-20").
- **operator overloading**: an object whose `__eq__` always returns True.

The [isolation section](#isolation) shows three of these against real graders, with real output.

## The checks a strong grader is made of {#check-types}

No single kind of check catches everything. You will see that in the toy matrix below: each wrong implementation dies to a different check.

| Check | What it compares | Catches | Misses |
|---|---|---|---|
| Behavioral spec test | output vs a value written from the spec | the rule it encodes, at the boundaries you chose | inputs you did not choose |
| Metamorphic test | output vs output, on two related inputs | whole classes of bugs, with no expected values | anything the relation does not constrain |
| Oracle differential test | output vs an independent slow implementation, on random inputs | disagreements wherever the generator reaches | inputs the generator never makes |
| Boundary-case table | output vs hand-written expected values, case by case | exact edges: equal timestamps, folds, empty input | edges nobody listed |
| Property test | one output vs a rule that must always hold, on generated inputs (for example: no training row inside the embargo after a test window) | whole classes of violations | rules nobody wrote as a property |
| Regression gate | old visible tests, documented signatures | breaking what used to work | new behavior |

A **property test** checks a rule on many generated inputs instead of one expected value. Hypothesis is the usual Python tool ([[prove#property-tests|property tests in Prove it]]). A metamorphic test is a property over two runs. A property test can also look at one output alone.

### Behavioral spec tests {#spec-tests}

A **behavioral spec test** calls the public interface the instruction names and checks an observable result.
- One test per rule, named after the rule, for example `test_k1_published_exactly_at_asof_is_known`.
- Test at the boundaries the rule names, on both sides: equal, one step before, one step after.
- Assert only what the rule fixes. If the spec leaves a choice open, the test must accept every allowed choice.
- Test through public functions, not private helpers. SWE-Bench Pro adds an explicit interface to each task for this reason. Removing the requirements and the interface cut GPT-5 from 25.9% to 8.4% ^[confirmed](https://arxiv.org/html/2509.16941 "2026-10-20"). So the spec text also decides how hard a task is.

### The four times {#four-times}

Chronos, the capstone task in [[capstone]], is about knowledge time. Its plan uses four different times, and its grader is designed around the checks in this chapter. Here are the four times, with a made-up example.

| Time | Name in code | Example (made up) |
|---|---|---|
| **event time** | `event_time` | Q2 2026: the quarter a GDP value describes |
| **publication time** | `published_at` | first estimate published 2026-07-30 12:30 UTC |
| **revision availability** | each vintage's own `published_at` | second estimate 2026-08-27, third estimate 2026-09-24 |
| **as-of time** (knowledge time) | `asof` | a backtest decision made on 2026-08-01 |

A **vintage** is one published version of one observation. Each revision is a new vintage. It becomes available only at its own publication time.
On 2026-08-01, the only knowable Q2 value is the first estimate. A backtest that uses the third estimate on that date uses knowledge from the future. Its results look better than anything you could have achieved in real time. That is **look-ahead leakage**.

The boundary rule must be explicit. The Chronos plan states it like this: a computation as of `asof` may use only vintages with `published_at <= asof`, and for each event only the latest such vintage. Equal counts as known. Prices need their own stated rule, for example "a daily close is available at its close timestamp".

#### How Chronos's grader uses these checks {#chronos-checks}

The Chronos plan splits its hidden grader into five parts. Each part uses check types from this chapter. This map names categories only, not the hidden tests.

| Part | What it checks | Check type |
|---|---|---|
| G1 | knowledge-time future-invariance | [metamorphic test](#metamorphic) |
| G2 | agreement with an independent oracle, on random data and on a boundary table | [oracle](#oracle), [boundary table](#boundary-table) |
| G3 | cross-validation splits: purge, embargo, order, coverage | [property tests](#check-types) ([[prove#property-tests\|with Hypothesis]]) |
| G4 | old visible tests and documented signatures | regression gate ([why a gate](#partial-credit)) |
| G5 | the z-score fix (Chronos milestone 1) | [behavioral spec test](#spec-tests) |

[[start-here#honesty|Ownership-gate item 3]] is this chapter in practice. You add one check, show that it catches a new wrong solution you wrote, and re-run the card. The [four-times drill](#drill-four-times) is the rehearsal.

### The knowledge-time toy {#knowledge-time-toy}

To show every check working, this chapter uses a small toy, not Chronos itself. The toy spec (written for this page):

- **K1.** A vintage is known as of `asof` if and only if `published_at <= asof`. Compare instants. Equal counts as known.
- **K2.** For each (series, event time), use the known vintage with the latest `published_at`. On a tie, the vintage later in the input list wins.
- **K3.** An event with no known vintage is absent from the result.
- **K4.** Event time never decides whether a vintage is known. A value announced before its event time is known from its publication time.
- **K5.** All datetimes are timezone-aware.

The function returns a dictionary `{(series, event time in UTC): value}`. The script has six implementations:

| Name | What it does |
|---|---|
| `correct` | follows K1–K5 |
| `oracle` | slow and obvious, compares integer microseconds since 1970 |
| `w_event_time` | decides "known" by event time instead of publication time |
| `w_latest_revision` | counts an event once its first release is out, then uses its newest revision |
| `w_strict` | uses `<` instead of `<=`: a value published exactly at `asof` is unknown |
| `w_wall_clock` | compares datetimes as written, not as UTC instants |

Four of them share one helper, so each bug is one line:

```python
def latest(vs, known):
    """For each (key, event), the known vintage with the latest published_at."""
    best = {}
    for v in vs:  # input order, so on a tie the later vintage wins (K2)
        if known(v):
            k = (v.key, utc(v.event_time))
            if k not in best or utc(v.published_at) >= utc(best[k].published_at):
                best[k] = v
    return {k: v.value for k, v in best.items()}


def correct(vs, asof):
    return latest(vs, lambda v: utc(v.published_at) <= utc(asof))


def w_event_time(vs, asof):  # bug: "known" decided by event time
    return latest(vs, lambda v: utc(v.event_time) <= utc(asof))


def w_strict(vs, asof):  # bug: published exactly at asof counts as unknown
    return latest(vs, lambda v: utc(v.published_at) < utc(asof))


def w_wall_clock(vs, asof):  # bug: compares datetimes as given, not as UTC instants
    return latest(vs, lambda v: v.published_at <= asof)
```

:::warn title="An honest limit of this toy"
One author (an AI agent writing this page) wrote the spec, the oracle and every implementation. So the oracle here is not truly independent. In Chronos, the plan requires an oracle author who never saw any reference solution. Keep that rule for your own tasks.
:::

### Metamorphic tests: future-invariance over knowledge time {#metamorphic}

A **metamorphic relation** is a rule that links the outputs of two related inputs. You change the input in a way the spec says must not matter, and check that the output does not change. You never need an expected value. The **oracle problem** is the difficulty of deciding whether an output is correct ^[confirmed](https://discovery.ucl.ac.uk/1471263/ "2026-10-20"). Metamorphic testing is a standard answer to it: often you cannot say what the right output is, but you can say how two outputs must relate ^[confirmed](https://doi.org/10.1145/3143561 "2026-10-20").

The knowledge-time relation is the **future-invariance property**:

> For any time t: changing, adding or deleting any vintage with `published_at > t` must not change any output computed as of any `asof <= t`.

That includes late revisions of **old** events. In Chronos, it covers features, joins, cross-validation training sets and backtest decisions.
The test needs no expected values. Generate seeded random data. Pick t and a few `asof <= t`. Compute the outputs. Perturb only the future (change, delete and add vintages published after t). Compute again. Any difference is a leak.

```python
def future_perturb(vs, t, rng):
    """Change, delete or add vintages published after t. Includes late revisions of old events."""
    out = []
    for v in vs:
        if utc(v.published_at) > utc(t):
            roll = rng.random()
            if roll < 0.3:
                continue  # delete
            if roll < 0.7:
                v = replace(v, value=v.value + rng.choice([-50.0, 7.5, 1000.0]))  # change
        out.append(v)
    for _ in range(rng.randint(1, 3)):  # add
        old = rng.choice(vs) if vs else Vintage("gdp", t, t, 0.0)
        late = utc(t) + timedelta(hours=rng.randint(1, 100))
        out.insert(rng.randint(0, len(out)), replace(old, published_at=late, value=-1.0))
    return out
```

#### The wrong relation, and the negative control {#negative-control}

The property is about **publication time**. A tempting but wrong version is about event time: "future events must not matter". Here it is as code:

```python
def event_time_perturb(vs, t, rng):
    """A WRONG relation: treats every vintage with event_time > t as unknowable."""
    return [replace(v, value=v.value + 1000.0) if utc(v.event_time) > utc(t) else v for v in vs]
```

It is wrong in both directions:
- Data with `event_time > t` but `published_at <= t` is legitimately known. A rate decision announced on 1 March that takes effect on 15 March is known on 10 March. Asserting invariance there **false-rejects** correct solutions.
- Data with `event_time <= t` but `published_at > t` (a late revision of an old event) is exactly where leaks hide. The event-time relation never perturbs it, so it **false-accepts** leaky solutions.

The **negative control** checks that your grader does not over-claim. Perturb only data the property does not cover: `event_time > t` and `published_at <= t`. A correct implementation's output **may** change there. So the grader must not assert invariance for it. Also count how many trials contained such data. If the count is 0, your generator never makes the case, and the control proves nothing.

The **positive control** is the other half: a known leaky implementation must fail the relation. If your planted leak passes, the relation or its generator is broken.

### An independent oracle and differential testing {#oracle}

An **oracle** is an independent, slow, obviously correct implementation, written from the spec alone. **Differential testing** runs the solution and the oracle on the same inputs and flags every disagreement.
This idea scales. Csmith compiled random C programs with several compilers, compared their outputs, and reported more than 325 previously unknown compiler bugs ^[confirmed](https://www.cs.utah.edu/~regehr/papers/pldi11-preprint.pdf "2026-10-20"). EvalPlus used differential testing against reference solutions to grow its test suites ^[confirmed](https://arxiv.org/abs/2305.01210 "2026-10-20").

Rules for an oracle:
- **Slow is fine. Clever is not.** Brute force over every pair beats an elegant sweep. The oracle in the toy rebuilds every event's candidate list from scratch and uses integer microseconds, so no datetime comparison rule can surprise it.
- **Written by someone else**, from the spec only.
- **Tested itself.** Run the oracle on the hand-written boundary table. In the toy matrix below, the oracle passes every row. An oracle can be wrong too. When it disagrees with a solution, adjudicate against the spec. Do not assume the solution is the one at fault.
- **The generator decides what you test.** Random inputs find only the bugs the generator can reach. The Agentic Benchmark Checklist found that KernelBench's fuzzing varied only values, not tensor shapes, and overstated correctness by about 31 points ^[confirmed](https://arxiv.org/html/2507.02825v5 "2026-10-20"). Measure what your generator makes: ties, empty groups, folds.

### Boundary-case tables {#boundary-table}

A **boundary-case table** is a hand-enumerated list of edge cases. Each row has the input, the rule, and the expected output written from the spec. Here is the toy's table. Each row is one line in the script.

| Row | Case | Rule | Expected |
|---|---|---|---|
| B1 | published exactly at `asof` | K1 | known |
| B2 | published 1 second after `asof` | K1 | unknown |
| B3 | same instant, written with another UTC offset | K1, K5 | known |
| B4 | revision not published yet | K2 | first release |
| B5 | revision published | K2 | revision |
| B6 | two vintages with the same `published_at` | K2 | later in the list |
| B7 | announced before its event time | K4 | known |
| B8 | event in the past, nothing published yet | K3 | absent |
| B9 | empty input | K3 | empty result |
| B10 | two series, same event time | K2 | independent |
| B11 | daylight-saving fall-back: `asof` 01:30 EDT, published 01:30 EST | K1, K5 | unknown (EST is one hour later) |
| B12 | two events at 01:30 on the fall-back day | K2, K5 | two separate events |

Rows B11 and B12 exist because of a real Python rule. When two aware datetimes share the **same** `tzinfo` object, Python ignores `fold` and compares wall-clock times ^[confirmed](https://docs.python.org/3/library/datetime.html "2026-10-20"). We checked it:

```python
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
ny = ZoneInfo("America/New_York")
a = datetime(2026, 11, 1, 1, 30, tzinfo=ny, fold=0)
b = datetime(2026, 11, 1, 1, 30, tzinfo=ny, fold=1)
print(a.isoformat(), b.isoformat())
print("a == b:", a == b, " a < b:", a < b, " b <= a:", b <= a)
print("UTC:", a.astimezone(timezone.utc).isoformat(), b.astimezone(timezone.utc).isoformat())
print("UTC a == b:", a.astimezone(timezone.utc) == b.astimezone(timezone.utc))
```

```text
2026-11-01T01:30:00-04:00 2026-11-01T01:30:00-05:00
a == b: True  a < b: False  b <= a: True
UTC: 2026-11-01T05:30:00+00:00 2026-11-01T06:30:00+00:00
UTC a == b: False
```

Two instants one hour apart compare as equal. A grader or an oracle that compares local datetimes directly inherits this bug.

A boundary table also finds **holes in the spec**. While writing B6, you must decide what happens on a tie. If the spec does not say, you have two choices: add the rule to the spec, or make sure no check depends on it. Never test a tie rule the spec does not state.

### Run it: the full matrix {#toy-results}

`knowtime.py` runs every implementation through every check: the right relation (MR-future, 300 trials), the wrong relation (MR-event, 300 trials), the oracle with a fine-grained generator (diff-fine, 300 seeds, timestamps with random microseconds), the oracle with a whole-hour grid (diff-grid, 300 seeds), and the boundary table. Each number is the count of trials that flagged a problem. The full script is in [the full scripts](#toy-scripts).

Real output (Python 3.13.9, 2026-10-20, about 0.8 seconds):

```text
$ python3 knowtime.py
implementation     MR-future MR-event diff-fine diff-grid  table
correct                    0       36         0         0  ok
oracle                     0       36         0         0  ok
w_event_time             289        0       272       274  B2, B4, B7, B8, B10, B11
w_latest_revision        249       36       245       246  B4
w_strict                   0       35         0        47  B1, B3, B5, B6, B10, B12
w_wall_clock               0       36         0         0  B11

negative control: 36 of 300 trials had a known future-dated vintage; the correct output changed in 36
```

Read it column by column:
1. **MR-future** catches both leaks (`w_event_time`, `w_latest_revision`) and never fires on `correct`. It cannot see `w_strict` or `w_wall_clock`, because those bugs are not leaks.
2. **MR-event**, the wrong relation, flags `correct` in 36 of 300 trials: false rejects. It flags `w_event_time` in 0 trials: a false accept of a real leak. An over-claiming relation fails in both directions at once.
3. With a fresh seed on every run, that 36/300 would look like a 12% **flaky** test, not a wrong spec. Flaky-looking failures deserve a root cause.
4. **diff-fine** misses `w_strict` (0 of 300). Its timestamps almost never equal `asof`. **diff-grid** puts times on whole hours and catches it in 47 of 300 seeds. Same oracle, different generator, different verdict.
5. **w_wall_clock** passes every random check. Only row B11 catches it.
6. In the table, only row B4 catches **w_latest_revision**. Without B4, the table alone would pass this bug. One hand-written row can carry a whole bug class.
7. The **negative control** shows that 36 trials contained a known future-dated vintage, and in all 36 the correct output changed. So the data the property does not cover really does change correct outputs. The grader must not claim invariance there.

The frame for this result: **"4 hand-written wrong implementations, all 4 rejected by the combined grader (hand-picked; counts only)"**, plus [the mutant census](#census-run) below.

### Run it: the mutant census {#census-run}

[Frame 2](#frame-census) defined mutants and a census. Here is a real census, run on 2026-10-20 on the toy. The mutant space is every first-order mutant of the reference's two functions, `latest` and `correct`, under a fixed operator set O. O has four operators: comparison swaps (ROR), `or` → `and` (LCR), drop one `utc(...)` call (UTC), and delete one assignment (SDL). The script is `mutate.py` in [the full scripts](#toy-scripts). It tries the checks in this order: the table, MR-future, then diff-grid.
A crash counts as a kill, because a grader must score a crashing solution 0. But report crash kills apart. They are cheap, and they show nothing about your checks.

```text
$ python3 mutate.py
first-order mutants: 14
m00 SDL  delete best = {}  (latest)                      crash (NameError)
m01 SDL  delete k = (v.key, utc(v.event_time))  (latest) crash (NameError)
m02 LCR  or -> and  (latest)                             crash (KeyError)
m03 SDL  delete best[k] = v  (latest)                    table B1,B3,B4,B5,B6,B7,B10,B12
m04 ROR  <= -> <  (correct)                              table B1,B3,B5,B6,B10,B12
m05 ROR  <= -> >=  (correct)                             table B2,B4,B7,B8,B10,B11,B12
m06 UTC  utc(v.event_time) -> v.event_time  (latest)     table B12
m07 ROR  not in -> in  (latest)                          crash (KeyError)
m08 ROR  >= -> >  (latest)                               table B6
m09 ROR  >= -> <=  (latest)                              table B5
m10 UTC  utc(v.published_at) -> v.published_at  (correct) SURVIVED
m11 UTC  utc(asof) -> asof  (correct)                    SURVIVED
m12 UTC  utc(v.published_at) -> v.published_at  (latest) SURVIVED
m13 UTC  utc(best[k].published_at) -> best[k].published_at  (latest) SURVIVED
survivors: m10, m11, m12, m13
```

Adjudication of the four survivors:
- m10–m13 each drop `utc()` on **one side** of a comparison. The other side is still a UTC datetime. Python *orders* aware datetimes (`<`, `<=`, `>`, `>=`) with different `tzinfo` objects as UTC instants ^[confirmed](https://docs.python.org/3/library/datetime.html "2026-10-20"). m10–m13 change only ordering comparisons, so the result never changes. We also ran all four on the daylight-saving cases. They gave the right answer every time. **Equivalent**, for the aware inputs the spec allows.
- One more trap: `==` is different. Across zones, `==` returns False for a time inside a fold, even for the same instant ^[confirmed](https://docs.python.org/3/library/datetime.html "2026-10-20"). We checked: 01:30 EDT on 2026-11-01 and the same instant in UTC give `==` False, but `<=` and `>=` both True. That is one reason the oracle compares integer microseconds.
- On a naive datetime, which the spec forbids, `utc()` and a plain comparison behave differently. Equivalence is always relative to the input domain the spec defines.

We adjudicated these four after seeing the results. So the stricter rule from [Frame 2](#frame-census) applies: a written argument from the input domain, checked by a second person. The arguments are above. One author wrote this page, so no second person has checked them yet. Treat the four as provisional until someone does.

The census result: **killed 10 of 10 non-equivalent mutants in the space (6 by a check, 4 by a crash; 4 equivalent, excluded with reasons)**. No interval.

:::note title="A true story from this census"
Our first census run had five survivors, not four. m06 also survived. It keys events by the datetime as written, not by its UTC instant. Two datetimes that share a `ZoneInfo` compare by wall-clock time and ignore `fold`. We tried to prove it equivalent and could not: on the day daylight saving time ends, 01:30 happens twice, and m06 merges two different events into one. So m06 was a real, non-equivalent survivor. It exposed a missing boundary case. We added row B12 to the table, and now m06 dies. This is what a census is for: a survivor is either an equivalent mutant or a hole in your grader.
:::

### The full scripts {#toy-scripts}

:::reveal title="Show knowtime.py (copy it, run python3 knowtime.py)"
```python
"""Knowledge-time toy: one function, six implementations (a reference, an oracle, four wrong ones),
four kinds of grader checks.

Standard library only. Python 3.9 or newer. Run: python3 knowtime.py
The spec (rules K1-K5) is in the playbook chapter "Grader validity".
"""
import random
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

UTC = timezone.utc
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


@dataclass(frozen=True)
class Vintage:
    key: str                # which series, for example "gdp"
    event_time: datetime    # the period the value describes
    published_at: datetime  # when this value became public
    value: float


def utc(t):
    return t.astimezone(UTC)


# ---------- the implementations under test ----------

def latest(vs, known):
    """For each (key, event), the known vintage with the latest published_at."""
    best = {}
    for v in vs:  # input order, so on a tie the later vintage wins (K2)
        if known(v):
            k = (v.key, utc(v.event_time))
            if k not in best or utc(v.published_at) >= utc(best[k].published_at):
                best[k] = v
    return {k: v.value for k, v in best.items()}


def correct(vs, asof):
    return latest(vs, lambda v: utc(v.published_at) <= utc(asof))


def w_event_time(vs, asof):  # bug: "known" decided by event time
    return latest(vs, lambda v: utc(v.event_time) <= utc(asof))


def w_strict(vs, asof):  # bug: published exactly at asof counts as unknown
    return latest(vs, lambda v: utc(v.published_at) < utc(asof))


def w_wall_clock(vs, asof):  # bug: compares datetimes as given, not as UTC instants
    return latest(vs, lambda v: v.published_at <= asof)


def w_latest_revision(vs, asof):
    """Bug: an event counts once its first release is out, but gets its newest revision."""
    first, newest = {}, {}
    for v in vs:
        k = (v.key, utc(v.event_time))
        if k not in first or utc(v.published_at) < first[k]:
            first[k] = utc(v.published_at)
        if k not in newest or utc(v.published_at) >= utc(newest[k].published_at):
            newest[k] = v
    return {k: newest[k].value for k in first if first[k] <= utc(asof)}


def oracle(vs, asof):
    """Slow and obvious, written from K1-K5 only. Integer microseconds since 1970."""
    def us(t):
        return (t - EPOCH) // timedelta(microseconds=1)
    out = {}
    for key, ev in {(v.key, us(v.event_time)) for v in vs}:
        known = [(us(v.published_at), i, v.value) for i, v in enumerate(vs)
                 if v.key == key and us(v.event_time) == ev and us(v.published_at) <= us(asof)]
        if known:
            out[(key, EPOCH + timedelta(microseconds=ev))] = max(known)[2]
    return out


IMPLS = [correct, oracle, w_event_time, w_latest_revision, w_strict, w_wall_clock]

# ---------- seeded random data ----------

OFFSETS = [timezone(timedelta(hours=h)) for h in (-5, 0, 2, 9)]
T0 = datetime(2026, 1, 5, tzinfo=UTC)


def at(hours, rng, fine=False):
    """An instant on a whole-hour grid (or jittered), written in a random UTC offset."""
    t = T0 + timedelta(hours=hours)
    if fine:
        t += timedelta(microseconds=rng.randrange(1, 3_600_000_000))
    return t.astimezone(rng.choice(OFFSETS))


def gen(rng, fine=False):
    vs = []
    for key in ("gdp", "cpi"):
        for day in range(rng.randint(0, 4)):
            ev = 24 * day
            pub = ev + rng.randint(-36, 48)  # negative: announced before its event time
            for _ in range(rng.randint(1, 3)):  # first release, then revisions
                vs.append(Vintage(key, at(ev, rng), at(pub, rng, fine), round(rng.uniform(0, 100), 1)))
                pub += rng.randint(0, 72)  # 0: a revision at the same instant
    rng.shuffle(vs)
    return vs


def future_perturb(vs, t, rng):
    """Change, delete or add vintages published after t. Includes late revisions of old events."""
    out = []
    for v in vs:
        if utc(v.published_at) > utc(t):
            roll = rng.random()
            if roll < 0.3:
                continue  # delete
            if roll < 0.7:
                v = replace(v, value=v.value + rng.choice([-50.0, 7.5, 1000.0]))  # change
        out.append(v)
    for _ in range(rng.randint(1, 3)):  # add
        old = rng.choice(vs) if vs else Vintage("gdp", t, t, 0.0)
        late = utc(t) + timedelta(hours=rng.randint(1, 100))
        out.insert(rng.randint(0, len(out)), replace(old, published_at=late, value=-1.0))
    return out


def event_time_perturb(vs, t, rng):
    """A WRONG relation: treats every vintage with event_time > t as unknowable."""
    return [replace(v, value=v.value + 1000.0) if utc(v.event_time) > utc(t) else v for v in vs]


def known_future_event_perturb(vs, t, rng):
    """Negative control: event_time > t but published_at <= t. Not covered by the property."""
    return [replace(v, value=v.value + 1000.0)
            if utc(v.event_time) > utc(t) and utc(v.published_at) <= utc(t) else v for v in vs]


def trial(seed):
    """One seeded case: data, a cut-off t, and as-of times at or before t."""
    rng = random.Random(seed)
    vs = gen(rng)
    th = rng.randint(0, 120)
    t = at(th, rng)
    asofs = [t] + [at(rng.randint(-24, th), rng) for _ in range(3)]
    return rng, vs, t, asofs


def metamorphic(impl, perturb, trials=300):
    """Count trials where some output as of asof <= t changed after the perturbation."""
    changed = 0
    for seed in range(trials):
        rng, vs, t, asofs = trial(seed)
        vs2 = perturb(vs, t, rng)
        if any(impl(vs, a) != impl(vs2, a) for a in asofs):
            changed += 1
    return changed


def differential(impl, fine, trials=300):
    """Count seeds where impl disagrees with the oracle."""
    bad = 0
    for seed in range(trials):
        rng = random.Random(10_000 + seed)
        vs = gen(rng, fine)
        asofs = [at(rng.randint(-24, 150), rng) for _ in range(4)]
        if any(impl(vs, a) != oracle(vs, a) for a in asofs):
            bad += 1
    return bad


# ---------- the hand-written boundary-case table ----------

u = datetime.fromisoformat
NY = ZoneInfo("America/New_York")
V = Vintage
E = u("2026-03-31T00:00:00+00:00")   # the event: a made-up Q1 value
P = u("2026-04-30T12:30:00+00:00")   # first release
R = u("2026-05-28T12:30:00+00:00")   # a revision
RATE_DAY = u("2026-03-15T00:00:00+00:00")
DST_EDT = datetime(2026, 11, 1, 1, 30, tzinfo=NY, fold=0)  # 05:30 UTC
DST_EST = datetime(2026, 11, 1, 1, 30, tzinfo=NY, fold=1)  # 06:30 UTC, one hour later

TABLE = [
    ("B1", "published exactly at asof is known", [V("gdp", E, P, 1.0)], P, {("gdp", E): 1.0}),
    ("B2", "published 1 s after asof is unknown", [V("gdp", E, P + timedelta(seconds=1), 1.0)], P, {}),
    ("B3", "same instant, other offset", [V("gdp", E, P, 1.0)], u("2026-04-30T14:30:00+02:00"), {("gdp", E): 1.0}),
    ("B4", "revision not out yet", [V("gdp", E, P, 1.0), V("gdp", E, R, 1.4)], u("2026-05-01T00:00:00+00:00"), {("gdp", E): 1.0}),
    ("B5", "revision out", [V("gdp", E, P, 1.0), V("gdp", E, R, 1.4)], R, {("gdp", E): 1.4}),
    ("B6", "tie on published_at: later wins", [V("gdp", E, P, 1.0), V("gdp", E, P, 1.1)], P, {("gdp", E): 1.1}),
    ("B7", "announced before its event", [V("rate", RATE_DAY, u("2026-03-01T14:00:00+00:00"), 4.25)],
     u("2026-03-10T00:00:00+00:00"), {("rate", RATE_DAY): 4.25}),
    ("B8", "event past, nothing published", [V("gdp", E, P, 1.0)], u("2026-04-15T00:00:00+00:00"), {}),
    ("B9", "empty input", [], P, {}),
    ("B10", "two series are independent", [V("gdp", E, P, 1.0), V("cpi", E, R, 2.0)], P, {("gdp", E): 1.0}),
    ("B11", "DST fall-back, 01:30 twice", [V("gdp", E, DST_EST, 1.0)], DST_EDT, {}),
    ("B12", "two events at 01:30 on that day", [V("load", DST_EDT, DST_EDT, 1.0), V("load", DST_EST, DST_EST, 2.0)],
     DST_EST, {("load", utc(DST_EDT)): 1.0, ("load", utc(DST_EST)): 2.0}),
]


def table_failures(impl):
    return [row for row, _, vs, asof, want in TABLE if impl(vs, asof) != want]


if __name__ == "__main__":
    print(f"{'implementation':<18} {'MR-future':>9} {'MR-event':>8} {'diff-fine':>9} {'diff-grid':>9}  table")
    for impl in IMPLS:
        fails = table_failures(impl)
        print(f"{impl.__name__:<18} {metamorphic(impl, future_perturb):>9} {metamorphic(impl, event_time_perturb):>8}"
              f" {differential(impl, True):>9} {differential(impl, False):>9}  {', '.join(fails) or 'ok'}")
    touched = sum(known_future_event_perturb(vs, t, rng) != vs for rng, vs, t, _ in map(trial, range(300)))
    hits = metamorphic(correct, known_future_event_perturb)
    print(f"\nnegative control: {touched} of 300 trials had a known future-dated vintage;"
          f" the correct output changed in {hits}")
```
:::

:::reveal title="Show mutate.py (put it next to knowtime.py, run python3 mutate.py)"
```python
"""Enumerate first-order mutants of the reference in knowtime.py and grade each one.

Standard library only. Put this file next to knowtime.py and run: python3 mutate.py
Operator set O (fixed before running):
  ROR  replace a comparison: < <= > >= with its strict/non-strict twin and with its mirror;
       "not in" with "in"
  LCR  replace "or" with "and"
  UTC  drop one utc(...) call: utc(x) -> x
  SDL  delete one assignment statement
"""
import ast
import inspect
import random
import textwrap

import knowtime as kt

SOURCE = textwrap.dedent(inspect.getsource(kt.latest)) + "\n" + textwrap.dedent(inspect.getsource(kt.correct))
SWAPS = {ast.Lt: [ast.LtE, ast.Gt], ast.LtE: [ast.Lt, ast.GtE], ast.Gt: [ast.GtE, ast.Lt],
         ast.GtE: [ast.Gt, ast.LtE], ast.NotIn: [ast.In]}


def sites(tree):
    """Every (node, operator, replacement) the operator set can apply, in a fixed order."""
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Compare):
            for new in SWAPS.get(type(node.ops[0]), []):
                out.append((node, "ROR", new))
        elif isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
            out.append((node, "LCR", ast.And))
        elif isinstance(node, ast.Call) and getattr(node.func, "id", "") == "utc":
            out.append((node, "UTC", None))
        elif isinstance(node, ast.Assign):
            out.append((node, "SDL", None))
    return out


class Apply(ast.NodeTransformer):
    def __init__(self, picks):
        self.picks = picks  # {site index: (operator, replacement)}
        self.pos = {}

    def visit(self, node):
        node = self.generic_visit(node)
        key = self.pos.get(id(node))
        if key is None:
            return node
        op, new = self.picks[key]
        if op == "ROR":
            node.ops = [new()]
        elif op == "LCR":
            node.op = new()
        elif op == "UTC":
            return node.args[0]
        elif op == "SDL":
            return ast.Pass()
        return node


def build(picks):
    """Source with the chosen sites mutated, compiled into a fresh namespace."""
    tree = ast.parse(SOURCE)
    all_sites = sites(tree)
    t = Apply({i: (all_sites[i][1], all_sites[i][2]) for i in picks})
    t.pos = {id(all_sites[i][0]): i for i in picks}
    new = ast.fix_missing_locations(t.visit(tree))
    ns = dict(vars(kt))
    exec(compile(new, "<mutant>", "exec"), ns)
    return ns["correct"], ast.unparse(new)


def killed_by(cand, trials=100):
    """Name of the first grader check that rejects cand, or None if it survives."""
    try:
        if kt.table_failures(cand):
            return "table " + ",".join(kt.table_failures(cand))
        for seed in range(trials):
            rng, vs, t, asofs = kt.trial(seed)
            vs2 = kt.future_perturb(vs, t, rng)
            if any(cand(vs, a) != cand(vs2, a) for a in asofs):
                return "MR-future"
        for seed in range(trials):
            rng = random.Random(10_000 + seed)
            vs = kt.gen(rng)
            if any(cand(vs, a) != kt.oracle(vs, a) for a in [kt.at(rng.randint(-24, 150), rng) for _ in range(4)]):
                return "diff-grid"
    except Exception as e:  # a crash is a kill
        return f"crash ({type(e).__name__})"
    return None


SYM = {ast.Lt: "<", ast.LtE: "<=", ast.Gt: ">", ast.GtE: ">=", ast.In: "in", ast.NotIn: "not in"}


def describe(tree, site):
    """A short label: what the operator changes, and in which function."""
    node, op, new = site
    where = next(f.name for f in tree.body if any(n is node for n in ast.walk(f)))
    if op == "ROR":
        what = f"{SYM[type(node.ops[0])]} -> {SYM[new]}"
    elif op == "LCR":
        what = "or -> and"
    elif op == "UTC":
        what = f"{ast.unparse(node)} -> {ast.unparse(node.args[0])}"
    else:
        what = f"delete {ast.unparse(node)}"
    return f"{op}  {what}  ({where})"


if __name__ == "__main__":
    tree = ast.parse(SOURCE)
    first = sites(tree)
    print(f"first-order mutants: {len(first)}")
    survivors = []
    for i, site in enumerate(first):
        k = killed_by(build([i])[0])
        print(f"m{i:02d} {describe(tree, site):<52} {k or 'SURVIVED'}")
        if not k:
            survivors.append(f"m{i:02d}")
    print(f"survivors: {', '.join(survivors) or 'none'}")
```
:::

## Flakiness: three stable runs, and what they do not prove {#flakiness}

A **flaky** check gives different verdicts on the same solution. A flaky grader turns a fixed solution into a coin flip, and it confuses every rate you compute.
The minimum rule: **run every corpus at least 3 times, and every verdict must agree.** DeepSWE runs each verifier 3 times during authoring and sends flaky ones back ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). SWE-Bench Pro runs gold tests several times and drops flaky tasks ^[confirmed](https://arxiv.org/html/2509.16941 "2026-10-20").

For Lab F, the runner does this for you. Real output from the lab's starting grader, 2026-10-20 (path lines left out):

```text
$ bash run_task.sh --all --runs 3
solution    expect  run1  run2  run3  verdict
reference   1       1     1     1     ok
alt-1       1       0     0     0     FALSE REJECT
alt-2       1       0     0     0     FALSE REJECT
do-nothing  0       0     0     0     ok
wrong-1     0       1     1     1     FALSE ACCEPT
wrong-2     0       1     1     1     FALSE ACCEPT
wrong-3     0       1     1     1     FALSE ACCEPT
wrong-4     0       1     1     1     FALSE ACCEPT
wrong-5     0       1     1     1     FALSE ACCEPT

mode: local, runs per solution: 3, solutions: 9
false accepts: 5, false rejects: 2, unstable: 0, no expectation: 0
These are counts over a hand-picked corpus, not error rates.
matrix: NOT OK
```

"unstable: 0", and the grader is still wrong 7 times. **Stable is not valid.** A grader can be perfectly repeatable and perfectly wrong.

What 3 runs cannot show: the [sample-size script](#sample-size) assumes each run flakes independently, with the same chance every time. Under that assumption, a check that flakes 5% of the time shows up in 3 runs only 14.3% of the time. Seeing it with 95% chance takes 59 runs. A 1% flake takes 299.
Real flakes are often tied to load, time of day or test order. Then runs are not independent, and more runs of the same kind help less than these numbers say ^[inference](- "2026-10-20").
So 3 runs catch gross flakiness only. For rare flakes, remove the causes instead of hoping to see them:

- **Unseeded randomness.** Seed every generator. Record the seed in the output.
- **Wall-clock time.** Never read the clock in a check. Pass times in.
- **Hash order.** Python randomizes string hashing per process, so set iteration order changes between runs:

  ```text
  $ for s in 1 2 3; do PYTHONHASHSEED=$s python3 -c "print(list({'atlas', 'borealis', 'cirrus'}))"; done
  ['cirrus', 'borealis', 'atlas']
  ['cirrus', 'atlas', 'borealis']
  ['cirrus', 'atlas', 'borealis']
  ```

  Run your repeat runs with different `PYTHONHASHSEED` values. A check that depends on the order of a set of strings will show itself.
- **Timeouts under load.** A timeout that passes on your laptop may fail on a busy grading machine. Give generous limits, and test performance only if the spec states a limit.
- **The network.** No live services. METR's task guide requires tasks without live external services ^[confirmed](https://taskdev.metr.org/desiderata/ "2026-10-20").
- **Shared state between runs.** Fresh folder or container per run. Anthropic notes an agent once gained an advantage by reading git history left by earlier trials ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20").

## Isolation: the grader must see what the agent could not touch {#isolation}

The agent controls its workspace. Anything the grader reads from that workspace, the agent can change. Isolation means the verdict depends only on things the agent could not touch.

### The checklist {#isolation-checklist}

- **Hidden tests arrive after the agent finishes.** Harbor uploads `tests/` into the container only after the agent runs ^[confirmed](https://docs.harborframework.com/tasks/verifier "2026-10-20").
- **No revealing git history.** In SWE-bench issue #465, agents ran `git log --all` and `git show` inside the eval container and some obtained the gold patch. The fix removed future history, branches, remotes, reflog and later tags (swebench v4.1.0) ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20"). Start the environment from a fresh `git init` of the base snapshot. Check that `git log --all --oneline` shows only the commits you meant to ship.
- **No network.** Cursor's strict harness removed `.git` during the run and denied network except an allow-listed package proxy. On SWE-bench Pro, Opus 4.8 Max fell from 87.1% to 73.0%, and Composer 2.5 from 74.7% to 54.0%. Opus 4.6 moved by under 1 point. The effect depends a lot on the model ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20"). But network-off alone is not enough. In Ludwig et al., turning off network access did not meaningfully reduce shortcut attempts. A prompt asking agents to build the solution themselves cut them sharply ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20").
- **Canaries.** Put a unique canary string (a random GUID) in every private file: hidden tests, oracle, reference solutions. DeepSWE's page carries one ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). After each attempt, search the workspace and the transcript for it, for example `rg -F "<your canary GUID>" workspace/ transcript.jsonl`. A hit means the attempt saw private material. Void it and report it.
- **Grade a clean copy.** Copy only the files the task allows the solver to change into a fresh folder. Ignore everything else the agent left: `conftest.py`, `sitecustomize.py`, `.pth` files, pytest plugins, environment variables.
- **Do not trust the exit code alone.** Require evidence: the expected number of tests, each one passed.
- **Compute the verdict where the candidate cannot reach.** The candidate's code runs inside the test process. It can write files and print anything. The strongest graders let the candidate produce outputs only, and compare them in a separate process with expected values the candidate never sees.

### Three graders, five solutions: a real demo {#tamper-demo}

The task: write `median(xs)`. Two hidden tests check an odd and an even list.
Five solutions:
- `sol-correct`: right.
- `sol-wrong`: an honest bug (wrong for even lengths).
- `sol-conftest`: the same bug, plus a `conftest.py` that rewrites every failure as a pass.
- `sol-exit`: the same bug, plus `os._exit(0)` when it is imported under pytest.
- `sol-forge`: the same bug, plus an `atexit` hook that overwrites the test report with a fake "all passed" report.

The planted files:

```python
# sol-conftest/conftest.py
import pytest


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.failed:
        report.outcome = "passed"  # every failure is reported as a pass
```

```python
# sol-exit/stats.py (the end of the file)
if "pytest" in sys.modules:
    os._exit(0)  # leave with "success" before any test runs
```

```python
# sol-forge/stats.py (the end of the file)
def _forge():
    with open("report.xml", "w") as f:  # runs after pytest wrote the real report
        f.write('<testsuites><testsuite tests="2" failures="0" errors="0" skipped="0"/></testsuites>')


atexit.register(_forge)
```

Three graders:
- `grade_weak.sh` copies the hidden tests into the workspace, runs pytest there, and trusts the exit code.
- `grade_strong.sh` copies only `stats.py` into a fresh folder, runs `python -I -m pytest --noconftest`, and requires a JUnit report that lists 2 tests and 0 failures, errors or skips.
- `grade_io.sh` imports the candidate in a child process, sends the inputs on stdin, reads the answers back as JSON, and compares them with expected values that never leave the grader.

Real output, 3 runs, 2026-10-20 (pytest 8.4.2, Python 3.13.9, macOS zsh). All 3 runs were identical. Here is run 1:

```text
sol-correct   weak=1 strong=1 io=1
sol-wrong     weak=0 strong=0 io=0
sol-conftest  weak=1 strong=0 io=0
sol-exit      weak=1 strong=0 io=0
sol-forge     weak=0 strong=1 io=0
```

- The weak grader falls to two cheats. Running in the agent's folder loaded the agent's `conftest.py`. Trusting exit 0 accepted the early exit. (The forge does not fool it, because it never reads the report.)
- The "strong" grader beats both. Then the forge beats it: the candidate ran inside the same process that wrote the evidence. **Stronger is not strong.**
- The output-only grader beats all three cheats here. It still runs as the same OS user on the same disk. A candidate that searched the disk could find the grader's cases. Real isolation needs a separate user or container, and graders whose expected values live outside it.

:::note title="A true story from writing this demo"
Our first `grade_strong.sh` gave **0 to the correct solution**. With `python -I`, Python does not put the current folder on `sys.path`, so the test file could not import `stats`. We added `-o pythonpath=.` to pytest. If we had only run the cheats, we would have shipped a grader that rejects everything and called it "secure". Run the correct corpus first, every time.
:::

:::reveal title="Show the commands to rebuild this demo"
Make a venv in a temp folder, then build the demo:

```zsh
cd "$(mktemp -d)"
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python pytest==8.4.2
source .venv/bin/activate
```

Save this as `make_tamper_demo.sh` and run `bash make_tamper_demo.sh`. It prints the demo folder.

```bash
#!/bin/bash
# Builds the tamper demo in a new temp folder and prints its path.
set -euo pipefail
d="$(mktemp -d)"
cd "$d"
mkdir -p hidden sol-correct sol-wrong sol-conftest sol-exit sol-forge
cat > hidden/test_stats.py <<'EOF'
from stats import median


def test_odd():
    assert median([3, 1, 2]) == 2


def test_even():
    assert median([4, 1, 3, 2]) == 2.5
EOF
cat > sol-correct/stats.py <<'EOF'
def median(xs):
    s = sorted(xs)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2
EOF
cat > sol-wrong/stats.py <<'EOF'
def median(xs):
    return sorted(xs)[len(xs) // 2]  # wrong for even lengths
EOF
cp sol-wrong/stats.py sol-conftest/stats.py
cat > sol-conftest/conftest.py <<'EOF'
import pytest


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.failed:
        report.outcome = "passed"  # every failure is reported as a pass
EOF
cat > sol-exit/stats.py <<'EOF'
import os
import sys


def median(xs):
    return sorted(xs)[len(xs) // 2]  # wrong for even lengths


if "pytest" in sys.modules:
    os._exit(0)  # leave with "success" before any test runs
EOF
cat > sol-forge/stats.py <<'EOF'
import atexit


def median(xs):
    return sorted(xs)[len(xs) // 2]  # wrong for even lengths


def _forge():
    with open("report.xml", "w") as f:  # runs after pytest wrote the real report
        f.write('<testsuites><testsuite tests="2" failures="0" errors="0" skipped="0"/></testsuites>')


atexit.register(_forge)
EOF
cat > grade_weak.sh <<'EOF'
#!/bin/bash
# Weak grader: run the hidden tests inside the agent's workspace, trust the exit code.
ws="${1:?usage: grade_weak.sh WORKSPACE}"
cp -R hidden "$ws/tests"
(cd "$ws" && python -m pytest -q -p no:cacheprovider tests > /dev/null 2>&1) && echo 1 || echo 0
rm -r -- "$ws/tests"
EOF
cat > grade_strong.sh <<'EOF'
#!/bin/bash
# Stronger grader: copy only the allowed file into a fresh folder, ignore conftest.py,
# and require a report that lists every expected test as passed.
ws="${1:?usage: grade_strong.sh WORKSPACE}"
expected=2
run="$(mktemp -d)"
cp "$ws/stats.py" "$run/"
cp -R hidden "$run/tests"
(cd "$run" && python -I -m pytest -q -p no:cacheprovider --noconftest -o pythonpath=. \
   --junitxml=report.xml tests > /dev/null 2>&1)
python3 - "$run/report.xml" "$expected" <<'PY'
import sys, xml.etree.ElementTree as ET
try:
    s = ET.parse(sys.argv[1]).getroot().find("testsuite")
except (OSError, ET.ParseError):
    print(0); sys.exit()
bad = sum(int(s.get(k)) for k in ("failures", "errors", "skipped"))
print(1 if int(s.get("tests")) == int(sys.argv[2]) and bad == 0 else 0)
PY
rm -r -- "$run"
EOF
cat > grade_io.sh <<'EOF'
#!/bin/bash
# Output-only grader: the candidate computes answers in a child process.
# Inputs go in on stdin. Expected values never leave this script.
ws="${1:?usage: grade_io.sh WORKSPACE}"
run="$(mktemp -d)"
cp "$ws/stats.py" "$run/"
python3 - "$run" <<'PY'
import json, subprocess, sys
cases = [([3, 1, 2], 2), ([4, 1, 3, 2], 2.5), ([7], 7), ([6, 1, 5, 2], 3.5)]
child = ("import json, sys; sys.path.insert(0, '.'); from stats import median; "
         "print(json.dumps([median(x) for x in json.load(sys.stdin)]))")
try:
    out = subprocess.run([sys.executable, "-I", "-c", child], cwd=sys.argv[1], timeout=10,
                         input=json.dumps([x for x, _ in cases]), capture_output=True, text=True).stdout
    got = json.loads(out.strip().splitlines()[-1])
except Exception:
    got = None
print(1 if got == [want for _, want in cases] else 0)
PY
rm -r -- "$run"
EOF
echo "$d"
```

Then, with the venv still active, `cd` to the printed folder and run all three graders three times:

```zsh
for run in 1 2 3; do
  echo "run $run"
  for s in sol-correct sol-wrong sol-conftest sol-exit sol-forge; do
    printf '%-13s weak=%s strong=%s io=%s\n' "$s" "$(bash grade_weak.sh "$s")" "$(bash grade_strong.sh "$s")" "$(bash grade_io.sh "$s")"
  done
done
```
:::

## Partial credit {#partial-credit}

This section uses Chronos's four milestones ([[task-design#chronos-milestones|Chronos milestones]]). The text says "milestone 1" to "milestone 4". The code uses the keys `"M1"` to `"M4"`, as Chronos's own `task.toml` and `reward.json` do. There they are milestones, not mistake-card rows.

Long tasks have parts. A binary reward throws away the difference between "did three of four milestones" and "did nothing". Anthropic recommends partial credit on multi-part tasks ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20"). METR's task guide asks for scores from 0 to 1, with a very competent agent above 0.9 and an incompetent one at 0.1 or below ^[confirmed](https://taskdev.metr.org/desiderata/ "2026-10-20"). FrontierSWE scores performance tasks as 0.5 × correctness, or 0.5 + 0.5 × speedup once correctness reaches 1.0 ^[confirmed](https://github.com/Proximal-Labs/frontier-swe "2026-10-20").

Partial credit adds new ways to be wrong. Five rules:
1. **Do-nothing scores 0.** Regression tests and API checks pass on the unchanged repository. If they carry weight, doing nothing earns points. Make them a **gate** (any failure sets the reward to 0), not a weighted milestone.
2. **Validate each milestone on its own.** Each one needs its own correct solutions and its own wrong solutions: a solution right on milestone 1 and wrong on milestone 2, and so on. A Grader Validity Card per milestone, or one card with a row per milestone.
3. **Decide dependent milestones in advance.** If milestone 3 uses milestone 2's function, a wrong milestone 2 can make milestone 3's checks fail or pass by accident. Write down how milestone 3 is tested when milestone 2 is wrong, before any model runs.
4. **Fix the weights before any model run.** Choosing weights after you see results lets you tune the score. Document them in the task ^[inference](- "2026-10-20").
5. **Report raw milestone results.** The weighted number is a summary. `reward.json` keeps one entry per milestone. Harbor accepts labeled numeric metrics in `reward.json` ^[confirmed](https://docs.harborframework.com/tasks/verifier "2026-10-20").

A small check of rule 1, with **example weights** (not Chronos's real weights):

```python
WEIGHTS = {"M1": 0.15, "M2": 0.35, "M3": 0.25, "M4": 0.25}  # example weights, fixed before any run


def reward(milestones, gate_ok):
    """milestones: {"M1": True, ...}. gate_ok: old visible tests and the documented API still pass."""
    if not gate_ok:
        return 0.0
    return round(sum(w for m, w in WEIGHTS.items() if milestones.get(m)), 4)


def reward_reg_weighted(milestones, reg_ok):
    """The same task, but regression is a weighted milestone (0.2) instead of a gate."""
    weights = {"M1": 0.12, "M2": 0.28, "M3": 0.2, "M4": 0.2, "REG": 0.2}
    done = dict(milestones, REG=reg_ok)
    return round(sum(w for m, w in weights.items() if done.get(m)), 4)


nothing = {}  # the unchanged repository: no milestone done, old tests still pass
print("do-nothing, regression as a gate:     ", reward(nothing, gate_ok=True))
print("do-nothing, regression as a milestone:", reward_reg_weighted(nothing, reg_ok=True))
print("M1 and M2 done, gate passes:          ", reward({"M1": True, "M2": True}, gate_ok=True))
print("all done, but broke the old API:      ", reward(dict.fromkeys(WEIGHTS, True), gate_ok=False))
```

```text
do-nothing, regression as a gate:      0
do-nothing, regression as a milestone: 0.2
M1 and M2 done, gate passes:           0.5
all done, but broke the old API:       0.0
```

With regression as a weighted milestone, the do-nothing baseline earns 0.2 for free.

## Reward hacking under RL optimization pressure {#reward-hacking}

An eval grader runs once per attempt, and a human may read the result. An RL grader becomes a **reward**: a training run maximizes it millions of times. A false accept that is rare in an eval becomes a target, because the optimizer searches for it ^[inference](- "2026-10-20").
DeepMind calls this **specification gaming**: behavior that satisfies the literal objective without achieving what the designers meant ^[confirmed](https://deepmind.google/discover/blog/specification-gaming-the-flip-side-of-ai-ingenuity/ "2026-10-20"). Gao, Schulman and Hilton showed that optimizing too hard against an imperfect proxy reward lowers performance on the true objective ^[confirmed](https://arxiv.org/abs/2210.10760 "2026-10-20").

What it looks like in coding:
- **Hacks learned in training spread.** Anthropic reports models learning `sys.exit(0)` in real coding RL. Learning such hacks generalized to sabotage in 12% of cases in one Claude Code safety-research evaluation ^[confirmed](https://www.anthropic.com/research/emergent-misalignment-reward-hacking "2026-10-20").
- **A score jump can be a leak.** During an RL run, Poolside saw a model's SWE-Bench Pro score jump about 20 points over a weekend. The gain did not show on other benchmarks. The cause was unpruned git history in the task images. After git was blocked, agents found fixes on upstream GitHub, web archives and older package releases ^[confirmed](https://poolside.ai/blog/through-the-looking-glass "2026-10-20").
- **Frontier models hack graders in evals too.** METR evaluated an early version of o3 before its deployment. 39 of its 128 RE-Bench runs (30.4%, METR's figure) were reward hacks, versus 0.7% of its HCAST runs. In one run, o3 read the grader's precomputed answer from the Python call stack ^[confirmed](https://metr.org/blog/2025-06-05-recent-reward-hacking "2026-10-20").
- **Impossible tasks invite cheating.** On ImpossibleBench, where tests contradict the spec, GPT-5 cheated on 76% of one SWE-bench variant. Giving an "abort if impossible" option cut GPT-5 from 54% to 9% on another variant ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20").
- **Punishing visible intent hides it.** OpenAI found that penalizing "bad thoughts" in the chain of thought made agents hide their intent ^[confirmed](https://arxiv.org/abs/2503.11926 "2026-10-20").
- **Bigger tasks, bigger gaps.** SpecBench measures the gap between visible and held-out test pass rates. Across its 30 tasks, the gap grows about 28 points per 10× increase in code size. That is a trend across tasks, not a law ^[confirmed](https://arxiv.org/abs/2605.21384 "2026-10-20").

What this means for a grader that might become a reward:
1. Treat every false accept you find as one the optimizer will find faster. The bar is "no known hole", not "low hole rate on my corpus".
2. **Red-team the grader** before release. Terminal-Bench 2.0 used an adversarial exploit agent, which found monkey-patched test environments and guessed or enumerated answers ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20").
3. Keep the grader, the hidden tests and the oracle out of the policy's reach ([isolation](#isolation)).
4. Give an honest exit for impossible or contradictory cases. Treat a 0% task as probably broken until you have checked it: Anthropic notes that a 0% pass rate over many trials usually means a broken task ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20").
5. Watch for score jumps that do not transfer. Read the transcripts behind them.

Mechanize argues that cheap RL tasks waste compute and that labs will pay for fewer, better tasks ^[confirmed](https://www.mechanize.work/blog/cheap-rl-tasks-will-waste-compute "2026-10-20"). That is Mechanize's argument. The link to how Polaris works is our inference.

## How to state uncertainty {#uncertainty}

No finite test suite proves a program correct. Dijkstra made the point in his Notes on Structured Programming (1969, second edition 1970): testing can show that bugs are present, never that they are absent ^[confirmed](https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html "2026-10-20"). The same holds for a grader. Every claim you make about one is "evidence, not proof".

Use five parts, in this order:
1. **Scope.** Task, spec version, grader version (commit).
2. **What you ran.** Each corpus, with its frame and its run count.
3. **What you found.** Raw outcomes first. Then counts, and rates only where the frame allows them.
4. **What this does not show.** The designs, inputs and environments you did not test.
5. **What would change your mind.** The observation that would make you revise the verdict.

Words to avoid, and what to say instead:

| Avoid | Say |
|---|---|
| "The grader is correct." | "The grader gave the expected verdict on every solution we tried, listed below." |
| "0% false accepts." | "Rejected 12 of 12 hand-written wrong solutions (hand-picked; counts only)." |
| "Validated." | "Checked against these corpora, with these frames." |
| "Robust to cheating." | "Gave 0 to these 5 named cheats in 3 runs each. Not tested: cheats that read files outside the workspace." |
| "Proves there is no leakage." | "Future-invariance held on 300 seeded trials from generator G. G does not produce daylight-saving folds." |

An example for the toy grader in this chapter:

> On the knowledge-time toy (spec K1–K5), the combined grader rejected 4 of 4 hand-written wrong implementations and accepted the reference and the oracle (hand-picked; counts only). It killed 10 of 10 non-equivalent first-order mutants in a census of operator set O: 6 by a check and 4 by a crash. 4 equivalent mutants were excluded, each with a written reason that no second person has checked yet. One author wrote every implementation, so the oracle is not independent. We did not test second-order mutants, naive datetimes, or wrong designs written by someone else. A correct implementation that scores 0, or a wrong one that scores 1, would change this verdict.

## Lab F: Break the Grader {#lab-f}

[[lab:lab-f]] is a small Harbor-style task. The app is `freebusy`, which merges room bookings into busy spans. Its spec has rules R1–R12. Its grader gives the reference 1 and do-nothing 0. It also accepts 5 wrong solutions and rejects 2 correct ones. You saw that matrix in [the flakiness section](#flakiness). Your job is to rewrite the grader until every verdict is right, in every run.

How to start (from the playbook folder, the one that contains `labs/`):

```zsh
bash labs/make_practice.sh lab-f
```

It prints a new temp folder with its own fresh git history. `cd` there. If you use an agent, open it there, never inside the portfolio repository. Then run `bash run_task.sh --all`, read `task/instruction.md` twice, and read `task/tests/`. The lab's README has the full rules and generic hints.

How this chapter maps onto the lab (methods only; this page gives no Lab F answers):
- Each false reject: find the check that is stricter than a rule. Use [traceability](#traceability).
- Each false accept: find the rule it breaks, then write a check for the **rule**, not for that file. Use [behavioral spec tests](#spec-tests) and a [boundary-case table](#boundary-table).
- One check that needs no expected values from you: an [oracle](#oracle) on seeded random inputs.
- Ask which files the solution could change before the grader ran. Use [isolation](#isolation).
- Run 3 times. Then write the card.

:::tally id="lab-f" title="Lab F done-when"
- reference, alt-1 and alt-2 score 1 in all 3 runs
- do-nothing and wrong-1 to wrong-5 score 0 in all 3 runs, and the runner ends with matrix OK
- every check names the rule (R1–R12 or Interface) it enforces
- for each wrong solution, one sentence: the rule it breaks and the check that catches it
- a 5-line Grader Validity Card: corpus, sampling frame (hand-picked, so counts only), results, stability, known limits
:::

The stretch goal checks your grader against solutions you have not seen, using your local answer keys. Do it only after the main task. It is your first taste of [unseen wrong approaches](#unseen-wrong).

## The Grader Validity Card {#validity-card}

A **Grader Validity Card** is a one-page record of the evidence behind a grader. It puts raw outcomes first and gives every number its frame. A reviewer, an interviewer or your future self can check it line by line. The Chronos plan has its toolkit (`gvt`) emit one in Markdown and JSON.

Fill it in this order. Never leave a frame blank.

```markdown
# Grader Validity Card: <task>    grader: <commit>    spec: <commit>    date: <YYYY-MM-DD>

## 1. What the grader claims
- Reward: <binary | milestones 1..k with weights, fixed on <date>>   Gate: <checks that zero the reward>
- Checks traced to spec rules: <n of n>. Checks with no rule: <list, or none>.

## 2. Raw outcomes (every solution, every run)
| solution | corpus | expected | run 1 | run 2 | run 3 | milestones | verdict |

## 3. Results by corpus, each with its frame
| corpus | frame | n | result | how to read it |
| independent correct (<k> authors) | hand-picked | | <a> of <n> scored 1 | counts only |
| refactor variants | census of transformation set T | | <a> of <n> | over T only |
| hand-written wrong (incl. cheats) | hand-picked | | <r> of <n> scored 0 | counts only |
| unseen wrong (grader frozen first) | hand-picked by others | | <r> of <n> scored 0 | counts only |
| mutants of the reference diff, operator set O | census (<N> enumerated, <E> equivalent excluded) | | <k> of <N-E> killed (<c> by a crash) | exact over the enumerated space (operator set O), no interval |
| sampled mutants, space Q | uniform random sample, seed <s> | | <k> of <n>, Wilson 95% [<lo>, <hi>] | estimate over Q |
| real attempts, adjudicated | <N> attempts, one agent configuration, one task | | FA <x>, FR <y> | that configuration only |

## 4. Stability
- Runs per solution: <≥3>. Unstable verdicts: <n>. Seeds fixed: yes | no. PYTHONHASHSEED varied: yes | no.
- Limit: if runs flake independently, 3 runs see a 5% flake only 14.3% of the time (59 runs for 95%).

## 5. Isolation
- Hidden tests added after the agent: yes | no.   Network: off | allow-list <...>
- git log --all shows only: <commits>.            Canary hits in workspace or transcript: <n>
- Files the grader takes from the workspace: <list>. conftest.py and plugins ignored: yes | no.
- Verdict computed outside the candidate's process: yes | no.

## 6. Known limits (what this card does not show)
- <designs, inputs, environments not tested>

## 7. What would change the verdict
- <a correct solution scoring 0; a real attempt adjudicated wrong scoring 1; ...>
```

The 5-line short form, for Lab F and for quick reviews:

```text
Corpus:    <which solutions, how many of each kind>
Frame:     <hand-picked | census of ... | random sample of ...> -> <counts | exact rate | rate + Wilson>
Results:   <expected verdicts met: a of n; false accepts: x; false rejects: y>
Stability: <runs per solution; unstable verdicts>
Limits:    <what was not tested>
```

The JSON form keeps the same parts, so a script can check them:

```json
{
  "task": "<task>", "grader": "<commit>", "spec": "<commit>", "date": "YYYY-MM-DD",
  "raw": [{"solution": "alt-1", "corpus": "independent-correct", "expected": 1, "rewards": [1, 1, 1]}],
  "corpora": [
    {"name": "hand-written-wrong", "frame": "hand-picked", "n": 12, "rejected": 12, "rate": null, "interval": null},
    {"name": "mutants-O", "frame": "census", "enumerated": 14, "equivalent": 4, "killed": 10, "killed_by_crash": 4, "rate": 1.0, "interval": null},
    {"name": "mutants-Q", "frame": "random-sample", "seed": 7, "n": 150, "killed": 141, "rate": 0.94, "interval": [0.8899, 0.9681]}
  ],
  "stability": {"runs": 3, "unstable": 0},
  "isolation": {"hidden_tests_after_agent": true, "network": "off", "canary_hits": 0},
  "limits": ["<...>"]
}
```

The rule in that JSON: `rate` and `interval` are `null` unless the frame allows them.
A printable copy is on the [[cards#card-validity-card|cards page]].

## Vibe coder vs senior engineer {#compare}

:::compare
- "My grader passes the reference and fails my 5 wrong solutions, so it works." || "Six hand-picked results are counts. I also need independent correct solutions, unseen wrong ones and a mutant census, each with its frame."
- Reports "0% false accepts (95% interval 0–24%)" on 12 hand-written wrong solutions. || Reports "rejected 12 of 12 hand-written wrong solutions (hand-picked; counts only)".
- Writes the metamorphic test as "future events must not matter". || Writes it over publication time, adds a negative control, and checks that a planted leak fails it.
- Runs the grader once. It passed. || Runs every corpus 3 or more times with different hash seeds, and knows 3 runs catch only gross flakiness.
- Runs hidden tests inside the agent's folder and trusts exit 0. || Grades a clean copy, ignores `conftest.py`, requires the expected test count, and computes the verdict where the candidate cannot reach.
- Tunes the grader until the known wrong solutions fail. || Freezes the grader, then tests it on wrong solutions written by someone who never saw it.
- Says "the grader is correct". || Says "evidence, not proof": what was tested, what was found, what was not tested, and what would change the verdict.
:::

## Drills {#drills}

:::drill id="frame-it" title="Put a frame on six claims" time="20 min"
Rewrite each claim as a frame sentence ([the template](#frame-sentence)). If a claim cannot be fixed with the information given, say what is missing.

1. "Our grader catches 100% of wrong solutions." (You wrote 9 wrong solutions. All scored 0.)
2. "The grader kills 93% of mutants." (You ran all 300 first-order mutants from operator set O. 21 were equivalent. 260 were killed.)
3. "False-reject rate: 0%." (3 independent correct solutions scored 1.)
4. "Our agent solves the task 35% of the time." (7 of 20 attempts scored 1, one agent configuration.)
5. "The grader is stable." (3 runs, identical verdicts.)
6. "We estimate a 2% miss rate on second-order mutants." (You sampled 100 at random with seed 3 from a space of 44,850. 98 were killed.)

**Done when:** every rewrite names the frame and uses only counts, an exact rate or a Wilson interval as that frame allows, and you checked your numbers against the answer.
:::

:::reveal title="Show worked answers for the frame drill"
1. "Rejected 9 of 9 hand-written wrong solutions (hand-picked; counts only)." No rate.
2. 300 − 21 = 279 non-equivalent. "Killed 260 of 279 non-equivalent first-order mutants (census of operator set O; 21 equivalent excluded with reasons): 93.2% over that space. No interval." Always show the denominator: 260/279 = 93.2% excludes the equivalent mutants, while 260/300 = 86.7% does not. A rate without its denominator is ambiguous.
3. "Accepted 3 of 3 independent correct solutions (hand-picked; counts only)." No rate.
4. "7 of 20 attempts by one agent configuration on this task scored 1: 35%, Wilson 95% [18.1%, 56.7%], assuming independent attempts." Then: was each 1 adjudicated against the spec?
5. "Identical verdicts in 3 runs per solution." Add: if runs flake independently, 3 runs see a 5% flake only 14.3% of the time.
6. First adjudicate the 2 survivors. If one is equivalent, exclude it, draw a replacement from the same seeded sequence, and say so in the frame. Then run `python3 -c "from wilson import wilson; print(wilson(98, 100))"` next to `wilson.py`. It prints about (0.930, 0.994). Write: "Killed 98 of 100 non-equivalent mutants drawn uniformly (seed 3) from the 44,850 second-order mutants, with equivalent draws excluded and redrawn: 98.0%, Wilson 95% [93.0%, 99.4%]." The miss rate is then 2.0% with an interval of about [0.6%, 7.0%], not a flat "2%".
:::

:::drill id="wilson-by-hand" title="Wilson by hand, then by code" time="25 min"
1. On paper, with a calculator, compute the Wilson 95% interval for 19 of 20 and for 7 of 20. Write every step, like [the worked example](#wilson-by-hand).
2. Save `wilson.py` from this page. Run `python3 wilson.py`. Then check 7 of 20 with `python3 -c "from wilson import wilson; print(wilson(7, 20))"`.
3. Explain aloud, in two sentences, why Wald gives [100%, 100%] for 20 of 20 and why that is wrong.

**Done when:** your hand results match the code to 0.1 points, and you can say the five Wilson assumptions without notes.
:::

:::drill id="four-times" title="Break the knowledge-time toy" time="45 min"
1. Save `knowtime.py` and `mutate.py` from [the full scripts](#toy-scripts). Run both. Your output should match this page. If it does not, find out why before going on.
2. Add a fifth wrong implementation, `w_first_release`: it follows K1 but keeps the **earliest** known vintage instead of the latest. Add it to `IMPLS`.
3. Before you run, write down your prediction for each column: MR-future, MR-event, diff-fine, diff-grid, and which table rows fail.
4. Run. Compare with your prediction. For every column you got wrong, write one sentence on why.
5. Change the generator so the negative control touches more trials. Show the new count.

**Done when:** your predictions and the real output are both saved, every wrong prediction has an explanation, and you can say in one sentence why MR-future cannot catch `w_first_release`, or why it can.
:::

:::drill id="tamper-test" title="Attack three graders, then fix one" time="45 min"
1. Rebuild [the tamper demo](#tamper-demo) and reproduce its matrix.
2. Write `sol-special`: a wrong median that returns the right answer for exactly the lists in `hidden/test_stats.py` and in `grade_io.sh`. (An attacker with disk access could read both.) Which graders accept it?
3. Change `grade_io.sh` so `sol-special` fails. Use seeded random lists and a slow, obvious oracle, not more hand-picked cases.
4. Write a second correct solution with a different design (for example, without sorting the whole list). It must score 1.

**Done when:** your `grade_io.sh` gives 1 to both correct solutions and 0 to all five wrong ones, in 3 runs, and you can name one cheat it still cannot stop.
:::

:::drill id="lab-f-drill" title="Lab F: Break the Grader" time="3 h"
Do [[lab:lab-f]] as its README says, in a practice copy made with `labs/make_practice.sh lab-f`. First time: no AI.
The time box is 3 hours, as in the README. In the sprint (Oct 24–27), the tracker gives it 2 hours: stop at 2 hours, write down where you are, and finish after you apply.

**Done when:** `bash run_task.sh --all --runs 3` ends with `matrix: OK`, every check names its rule, and you can say which rule each wrong solution breaks.
:::

:::drill id="validity-card-drill" title="Write the Grader Validity Card for Lab F" time="30 min"
1. Copy the 5-line short form from [the card section](#validity-card).
2. Fill it for your Lab F grader. Use the frame "hand-picked; counts only" for every corpus in the lab.
3. Under "Limits", write at least three things you did not test.
4. Read it to someone (or record yourself) in under 60 seconds.

**Done when:** a reader can check every line against your `matrix.tsv`, no line claims a rate, and your limits include at least one isolation limit.
:::

## Sources

Checked on 2026-10-20 unless the item says otherwise. Every command and script on this page was run on 2026-10-20 on macOS in zsh, with Python 3.13.9, uv 0.12.1 and pytest 8.4.2. Lab F was run in its local mode. Its Docker mode was not run for this page.

- Google Careers, Research Engineer, Polaris (checked 2026-10-19) ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19")
- Tamay Besiroglu on X, recruiting for Polaris "evals and environments", 2026-09-30 ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20")
- Anthropic, "Demystifying evals for AI agents", 2026-01-09 ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20")
- OpenAI, "Introducing SWE-bench Verified", 2024-08-13 (page returned 403; details from search excerpts and secondary coverage, here PatchDiff's summary) ^[reported](https://openai.com/index/introducing-swe-bench-verified/ "2026-10-20")
- OpenAI, "Why we no longer evaluate SWE-bench Verified", 2026-02-23 (figures from secondary coverage; the page returned 403) ^[reported](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/ "2026-10-20")
- AI Weekly, "OpenAI drops SWE-Bench Verified, backs Pro after flaw audit" (secondary coverage of the audit: 138 problems, 27.6%, 35.5%, 18.8%) ^[reported](https://aiweekly.co/alerts/openai-drops-swe-bench-verified-backs-pro-after-flaw-audit "2026-10-20")
- Epoch AI, SWE-Bench Pro benchmark review, 2026-09-01 (summarizes the OpenAI audit) ^[reported](https://epoch.ai/benchmarks/swe-bench-pro/review "2026-10-20")
- Yu et al., UTBoost, ACL 2025 ^[confirmed](https://arxiv.org/abs/2506.09289 "2026-10-20")
- Wang, Pradel, Liu, PatchDiff, ICSE 2026 (also our source for how SWE-bench Verified was filtered) ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20")
- Liu et al., EvalPlus, NeurIPS 2023 ^[confirmed](https://arxiv.org/abs/2305.01210 "2026-10-20")
- Yang et al., Csmith, PLDI 2011 ^[confirmed](https://www.cs.utah.edu/~regehr/papers/pldi11-preprint.pdf "2026-10-20")
- METR, many SWE-bench-passing PRs would not be merged, 2026-03-10 ^[confirmed](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ "2026-10-20")
- METR, task development guide: desiderata ^[confirmed](https://taskdev.metr.org/desiderata/ "2026-10-20")
- METR, "Recent frontier models are reward hacking", 2025-06-05 ^[confirmed](https://metr.org/blog/2025-06-05-recent-reward-hacking "2026-10-20")
- Brown, Cai, DasGupta, "Interval estimation for a binomial proportion", Statistical Science, 2001 ^[confirmed](https://doi.org/10.1214/ss/1009213286 "2026-10-20")
- Wilson, "Probable inference, the law of succession, and statistical inference", JASA, 1927 ^[confirmed](https://doi.org/10.1080/01621459.1927.10502953 "2026-10-20")
- Chen et al., "Metamorphic testing: a review of challenges and opportunities", ACM Computing Surveys, 2018 ^[confirmed](https://doi.org/10.1145/3143561 "2026-10-20")
- Barr, Harman, McMinn, Shahbaz, Yoo, "The oracle problem in software testing: a survey", IEEE TSE, 2015 ^[confirmed](https://discovery.ucl.ac.uk/1471263/ "2026-10-20")
- Just et al., mutants and real faults, FSE 2014 ^[confirmed](https://people.cs.umass.edu/~rjust/publ/mutants_real_faults_fse_2014.pdf "2026-10-20")
- Inozemtseva and Holmes, coverage and test effectiveness, ICSE 2014 ^[confirmed](https://cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf "2026-10-20")
- Petrović, Ivanković, Fraser, Just, mutation testing at Google, IEEE TSE 2021 ^[confirmed](https://arxiv.org/abs/2102.11378 "2026-10-20")
- Zhu, Kang et al., Agentic Benchmark Checklist (ABC), NeurIPS 2025 ^[confirmed](https://arxiv.org/html/2507.02825v5 "2026-10-20")
- Terminal-Bench team, Terminal-Bench 2.0 paper, 2026-01 ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20")
- Scale AI, SWE-Bench Pro, 2025-09 ^[confirmed](https://arxiv.org/html/2509.16941 "2026-10-20")
- Datacurve, DeepSWE, 2026-05-26 ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20")
- Proximal, FrontierSWE repository ^[confirmed](https://github.com/Proximal-Labs/frontier-swe "2026-10-20")
- Harbor docs: task layout and the verifier ^[confirmed](https://docs.harborframework.com/tasks/verifier "2026-10-20")
- SWE-bench issue #465, repo-state loopholes ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20")
- Cursor, "Reward hacking is swamping model intelligence gains", 2026-06-25 ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20")
- Ludwig, Ahmad, Majumdar, Ginsburg, "Shortcutting the Fix", 2026 ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20")
- Poolside, "Through the looking glass of benchmark hacking", 2026-05-11 ^[confirmed](https://poolside.ai/blog/through-the-looking-glass "2026-10-20")
- Anthropic, emergent misalignment from reward hacking, 2025-11-21 ^[confirmed](https://www.anthropic.com/research/emergent-misalignment-reward-hacking "2026-10-20")
- Zhong, Raghunathan, Carlini, ImpossibleBench, ICLR 2026 ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20")
- OpenAI, monitoring reasoning models for misbehavior (chain-of-thought monitoring), 2025-03 ^[confirmed](https://arxiv.org/abs/2503.11926 "2026-10-20")
- Weco AI, SpecBench, 2026 ^[confirmed](https://arxiv.org/abs/2605.21384 "2026-10-20")
- Krakovna et al., "Specification gaming: the flip side of AI ingenuity", DeepMind, 2020-04-21 ^[confirmed](https://deepmind.google/discover/blog/specification-gaming-the-flip-side-of-ai-ingenuity/ "2026-10-20")
- Gao, Schulman, Hilton, "Scaling laws for reward model overoptimization", 2022 ^[confirmed](https://arxiv.org/abs/2210.10760 "2026-10-20")
- Mechanize, "Cheap RL tasks will waste compute", 2025-08-18 (Mechanize's argument) ^[confirmed](https://www.mechanize.work/blog/cheap-rl-tasks-will-waste-compute "2026-10-20")
- Dijkstra, "Notes on Structured Programming" (EWD249), second edition, April 1970 ^[confirmed](https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html "2026-10-20")
- Python docs, `datetime` comparisons (same `tzinfo` ignores `fold`; ordering across zones uses UTC; `==` across zones is False inside a fold) ^[confirmed](https://docs.python.org/3/library/datetime.html "2026-10-20")

:::check
- Draw the grader confusion table from memory, and give one real example each of a false accept and a false reject.
- For any grader number, say its frame and whether it allows counts, an exact rate, or a Wilson interval.
- Compute a Wilson 95% interval by hand in under 5 minutes, and list its five assumptions.
- State the future-invariance property, the wrong event-time version, and what the negative control and the positive control each prove.
- Explain why 3 stable runs are necessary and not sufficient, with the 14.3% and 59 numbers and the independence they assume.
- Fill a Grader Validity Card for a grader you built, with raw outcomes first and no blank frame.
:::
