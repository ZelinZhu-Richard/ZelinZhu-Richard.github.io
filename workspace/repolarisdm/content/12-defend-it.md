---
title: Defend your decisions
short: Defend it
summary: Answer the hard questions an interviewer is likely to ask (our inference) about graders, benchmarks, statistics, isolation and agent failures. For each one, you name the hypotheses, the experiment that tells them apart, what would change your mind, and how sure you are, in under 2 minutes.
---

:::selfcheck
- Say in one sentence why "my grader rejected 5 of 5 wrong patches" is not an error rate. || The 5 were hand-picked, so they are a count. A rate needs a sampling frame: a census of a defined space of wrong solutions, or a random sample from it.
- Give pass@3 and pass^3 for a per-attempt success rate of 0.75. || pass@3 = 1 − 0.25³ ≈ 98.4% (at least one of 3 succeeds). pass^3 = 0.75³ ≈ 42.2% (all 3 succeed). Both assume independent attempts.
- Give the rough Wilson 95% interval for 3 successes in 5 runs. || About 23% to 88%. Five runs cannot separate a weak model from a strong one.
- State the future-invariance property, and one kind of data it does NOT cover. || Changing, adding or deleting any vintage with `published_at > t` must not change any output computed as of any `asof <= t`. It does not cover data with `event_time > t` but `published_at <= t`; that data was already public.
- In 2 minutes, answer "Gemini solves almost every task. Too easy, real improvement, or leakage?" with one experiment per hypothesis. || Lenient grader: re-run wrong solutions, adjudicate random passes. Too easy: weaker baselines also pass. Leakage: strict-harness re-run plus transcript audit. Real: fresh private tasks of matched difficulty still pass in the strict harness.
:::

## Why Polaris cares

Polaris engineers build a small number of realistic tasks, each with a grader that turns an attempt into a number ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). That number is only worth something if you can defend it. Public benchmarks broke on exactly the questions below: Epoch AI rates SWE-Bench Pro "Flawed" after four audits ^[confirmed](https://epoch.ai/benchmarks/swe-bench-pro/review "2026-10-20"), and Terminal-Bench 4.0 "Flawed" because 30 of 66 tasks have publicly noted scoring defects ^[confirmed](https://epoch.ai/benchmarks/terminal-bench-4/review "2026-10-20"). Mechanize screens engineers for reasoning about task difficulty and for spotting brittle or accidentally working solutions ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20"). Its co-founder Tamay Besiroglu now recruits for Polaris ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20"), so treat that list as a proxy, not as Polaris's rubric. Google DeepMind's default is no AI in live interviews, so you defend your choices alone ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").

:::note title="Status of these outlines"
Agents wrote these outlines on 2026-10-20 from the sources at the bottom. They are a starting point, not your answers. An interviewer can tell a memorized outline from a real one. Rewrite the important ones in your own words, with your own numbers from [[capstone]] (drill `defend-own-words` below).
:::

## How to drill this page {#how-to-drill}

1. Read one question. Do not open the outline.
2. Start a 2-minute timer. Answer aloud. Record yourself on your phone.
3. Open the outline. Compare part by part.
4. Score 1 point for each of the five parts you hit. The [hit rules](#hit-rule) say what counts. Write down what you missed.
5. When you score 4 or 5 on two different days, tick the question in the tally at the [end of the drills](#drills).

:::tip title="Sprint path (Oct 30–31, 2 h)"
Do not try all 46 questions in the sprint. The [[tracker#block-4|tracker]] gives this page three items:
1. The drill `defend-the-two-musts`: [Q1](#q1) and [Q9](#q9), cold, 15 minutes on Oct 30 and 15 minutes on Oct 31. If you need a third day, it comes after Nov 2.
2. One `defend-two-minute-round` (35 min). In the sprint, draw the six questions from these eight, not from all 46: [Q14](#q14), [Q15](#q15), [Q17](#q17), [Q21](#q21), [Q32](#q32), [Q37](#q37), [Q42](#q42) and [Q43](#q43). Use `random.sample([14, 15, 17, 21, 32, 37, 42, 43], 6)` in the drill's command.
3. The drill `defend-own-words` (60 min). It prepares ownership-gate item 4.

If you fall behind, the two-minute round is the item to cut ([[tracker#sprint|cut order]]). After Nov 2, run a two-minute round over all 46 questions once a week. If a stage includes system design, add [Q46](#q46).
:::

### The five-part answer {#five-part-answer}

Every outline below uses the same shape. It fits in 2 minutes.

| Part | What you say | Seconds |
|---|---|---|
| 1. Answer | One sentence. Your current best answer. | 15 |
| 2. Hypotheses | Two to four explanations you keep open. | 30 |
| 3. Experiment | The test that tells them apart: a count, a command, a control. | 40 |
| 4. Change my mind | The result that would flip your answer. | 15 |
| 5. How sure | The sampling frame, the assumptions, and what you did not check. | 20 |

Why this shape: eval interviewers keep asking "how do you know?" ^[inference](- "2026-10-20"). The shape makes you give evidence and limits before they ask. Part 1 still comes first. Do not hide your answer behind hedges.

#### What counts as a hit {#hit-rule}

Score from the recording, not from memory.

- Part 1: a one-sentence answer in the first 15 seconds.
- Part 2: at least two named, distinct hypotheses.
- Part 3: at least one experiment with a concrete count, command or control that separates two of the hypotheses. "I'd run more tests" is not a hit.
- Part 4: a specific result you could observe.
- Part 5: the frame or one named assumption, plus one thing you did not check.
- If the recording runs over 2:00, part 5 scores 0.

Useful sentences for part 5 (add them to your copy of the [[cards#card-say-it|Say it out loud card]]):

- "On this frame, I saw [X of Y]. Outside it, I can't claim a rate."
- "That is a count, not a rate."
- "My interval assumes independent runs of one configuration on one task."
- "I would change my mind if [result]."
- "I have not checked [thing]. That is the next experiment."
- "I'd bet on [H1], but [H2] is cheap to rule out, so I'd check it first."

:::compare
- "My grader is solid. It caught all five bad patches." || "It rejected 5 of 5 hand-picked wrong patches. That's a count. Here is the frame where I can give a rate, and the rate."
- "Gemini got 4/5 and the other model 2/5, so Gemini is better." || "4/5 against 2/5 could be chance. Fisher's exact test gives p = 0.52 ([defined below](#numbers)). I can't tell them apart yet. I'd run more, paired by task."
- "Tests pass, so it works." || "Tests pass. That's evidence, not proof. Here is what the tests don't cover."
- "Nobody solves it, so it's a hard task." || "Nobody solves it, so I check the task first: the reference passes in the grading image, and a human non-author can solve it."
- "The agent couldn't cheat. I told it not to." || "Prompts reduce cheating but don't stop it. I removed the paths, and I verified with canaries and a transcript scan."
- "I'm 95% sure." || "My 95% interval assumes independent runs of one configuration on one task. It says nothing about other tasks."
:::

## The numbers you must know {#numbers}

Many answers below use the same few numbers. Check them with the script. Then learn the [hand rules](#hand-rules), because in a no-AI interview you only have your head. Save this as `defend_stats.py` anywhere. It needs only Python 3.9 or later. It uses the same Wilson and pass@k formulas as `wilson.py` in [[grader-validity]] and `runstats.py` in [[runs-and-weaknesses]]. If a number here ever differs from those pages, one copy has drifted. Find out which before you quote it.

```python
"""Numbers for the Defend-it drills. Python 3.9+, standard library only."""
import random
from math import comb, sqrt
from statistics import NormalDist

Z = NormalDist().inv_cdf(0.975)  # 1.95996..., two-sided 95%


def wilson(k, n, z=Z):
    """Wilson score interval. Assumes n independent trials with one fixed rate."""
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


def pass_at_k(n, c, k):
    """Unbiased pass@k from n samples with c correct (Chen et al. 2021)."""
    return 1.0 if n - c < k else 1 - comb(n - c, k) / comb(n, k)


def pass_hat_k(n, c, k):
    """Unbiased pass^k: all k drawn samples correct (Yao et al. 2024)."""
    return comb(c, k) / comb(n, k)


def fisher_two_sided(a, n1, b, n2):
    """Two-sided Fisher exact p-value for a/n1 versus b/n2 successes."""
    k, n = a + b, n1 + n2
    prob = lambda x: comb(n1, x) * comb(n2, k - x) / comb(n, k)
    obs = prob(a)
    xs = range(max(0, k - n2), min(k, n1) + 1)
    return sum(prob(x) for x in xs if prob(x) <= obs * (1 + 1e-9))


def pct(x):
    return f"{100 * x:5.1f}%"


print("1. Wilson 95% intervals (independent trials, one fixed rate)")
for k, n in [(3, 5), (5, 5), (0, 5), (12, 12), (57, 60)]:
    lo, hi = wilson(k, n)
    print(f"   {k:>2}/{n:<3} -> [{pct(lo)}, {pct(hi)}]")

print("2. How often 5 runs mislead you")
print(f"   true rate 60%, all 5 pass:     {pct(0.6 ** 5)}")
print(f"   true rate 30%, all 5 fail:     {pct(0.7 ** 5)}")
print(f"   true rate 50%, 4 or 5 pass:    {pct(sum(comb(5, j) for j in (4, 5)) / 32)}")

print("3. pass@k versus pass^k")
print(f"   p=0.75, k=3: pass@3 = {pct(1 - 0.25 ** 3)}, pass^3 = {pct(0.75 ** 3)}")
for k in (1, 3, 5):
    print(f"   n=10, c=7, k={k}: pass@k = {pct(pass_at_k(10, 7, k))}, "
          f"pass^k = {pct(pass_hat_k(10, 7, k))}, 0.7^k = {pct(0.7 ** k)}")

print("4. Is model A better than model B? (two-sided Fisher exact p-value)")
for a, b, n in [(4, 2, 5), (8, 4, 10), (16, 8, 20), (40, 20, 50)]:
    print(f"   {a}/{n} vs {b}/{n}: p = {fisher_two_sided(a, n, b, n):.2g}")

print("5. Zero failures seen in n trials: one-sided 95% upper bound")
for n in (5, 12, 30, 40, 100):
    print(f"   n={n:<3} exact {pct(1 - 0.05 ** (1 / n))}   rule of three {pct(min(1, 3 / n))}")

print("6. Runs needed for a +/- margin (normal approximation, one task)")
for e in (0.15, 0.10, 0.05):
    row = "  ".join(f"p={p}: {round(Z * Z * p * (1 - p) / e ** 2):>4}" for p in (0.5, 0.2))
    print(f"   +/-{round(100 * e):>2} points  {row}")

print("7. 20 synthetic tasks x 10 runs: naive vs task-level bootstrap")
rng = random.Random(7)
rates = [rng.betavariate(0.5, 0.5) for _ in range(20)]
runs = [[rng.random() < p for _ in range(10)] for p in rates]
per_task = [sum(r) / 10 for r in runs]
k = sum(sum(r) for r in runs)
lo, hi = wilson(k, 200)
print(f"   overall {k}/200 = {pct(k / 200)}")
print(f"   naive Wilson (200 'independent' attempts): [{pct(lo)}, {pct(hi)}]")
means = sorted(sum(rng.choice(per_task) for _ in range(20)) / 20 for _ in range(10000))
print(f"   bootstrap over tasks (20 tasks resampled):  [{pct(means[249])}, {pct(means[9749])}]")
```

Run it with `python3 -I defend_stats.py`. Real output (2026-10-20, Python 3.13.9, arm64 Mac; the Fisher and Wilson values match SciPy 1.16.2):

```text
1. Wilson 95% intervals (independent trials, one fixed rate)
    3/5   -> [ 23.1%,  88.2%]
    5/5   -> [ 56.6%, 100.0%]
    0/5   -> [  0.0%,  43.4%]
   12/12  -> [ 75.8%, 100.0%]
   57/60  -> [ 86.3%,  98.3%]
2. How often 5 runs mislead you
   true rate 60%, all 5 pass:       7.8%
   true rate 30%, all 5 fail:      16.8%
   true rate 50%, 4 or 5 pass:     18.8%
3. pass@k versus pass^k
   p=0.75, k=3: pass@3 =  98.4%, pass^3 =  42.2%
   n=10, c=7, k=1: pass@k =  70.0%, pass^k =  70.0%, 0.7^k =  70.0%
   n=10, c=7, k=3: pass@k =  99.2%, pass^k =  29.2%, 0.7^k =  34.3%
   n=10, c=7, k=5: pass@k = 100.0%, pass^k =   8.3%, 0.7^k =  16.8%
4. Is model A better than model B? (two-sided Fisher exact p-value)
   4/5 vs 2/5: p = 0.52
   8/10 vs 4/10: p = 0.17
   16/20 vs 8/20: p = 0.022
   40/50 vs 20/50: p = 8.3e-05
5. Zero failures seen in n trials: one-sided 95% upper bound
   n=5   exact  45.1%   rule of three  60.0%
   n=12  exact  22.1%   rule of three  25.0%
   n=30  exact   9.5%   rule of three  10.0%
   n=40  exact   7.2%   rule of three   7.5%
   n=100 exact   3.0%   rule of three   3.0%
6. Runs needed for a +/- margin (normal approximation, one task)
   +/-15 points  p=0.5:   43  p=0.2:   27
   +/-10 points  p=0.5:   96  p=0.2:   61
   +/- 5 points  p=0.5:  384  p=0.2:  246
7. 20 synthetic tasks x 10 runs: naive vs task-level bootstrap
   overall 101/200 =  50.5%
   naive Wilson (200 'independent' attempts): [ 43.6%,  57.4%]
   bootstrap over tasks (20 tasks resampled):  [ 33.0%,  67.5%]
```

Two terms from section 4. **Fisher's exact test** compares two success counts, such as 4 of 5 against 2 of 5. Its **p-value** is how often chance alone, with no real difference, would give a gap at least this big. A large p (0.52) means "can't tell", not "no difference".

What to remember ^[inference](- "2026-10-20"):

- Five runs give an interval up to about 65 points wide (3 of 5: 23% to 88%). Even 5 of 5 only bounds the rate above 57%.
- A model with a true 60% rate passes all 5 runs 7.8% of the time.
- pass@k goes up with k. pass^k goes down. They answer different questions.
- In section 3, `0.7^k` plugs the sample rate into p^k. It is biased (34.3% against 29.2% at k = 3), so use the `C(c, k) / C(n, k)` column.
- 4/5 against 2/5 is too little data to show a difference (p = 0.52). 16/20 against 8/20 does show one (p = 0.022), for that one task.
- Zero failures in n trials: the 95% upper bound is about 3/n (the "rule of three").
- Runs inside one task are not independent samples of a benchmark. In section 7, the naive interval is ±7 points. Resampling tasks gives ±17.

### Hand rules for a no-AI interview {#hand-rules}

These are rough, but close enough to reason aloud ^[inference](- "2026-10-20"). Each was checked against the script.

- Interval for k of n: add 2 successes and 2 failures. p̃ = (k + 2) / (n + 4), then ± 2·√(p̃(1 − p̃) / (n + 4)). 3 of 5 gives 22% to 89% (Wilson: 23% to 88%). Clip at 0% and 100%.
- Runs for a ±e margin: about 4·p(1 − p) / e². At p = 0.5 and e = 0.1, that is 100 (the script says 96).
- Zero failures in n runs: the upper bound is about 3/n. 0 of 30 gives 10%.
- pass@k = 1 − (1 − p)^k and pass^k = p^k. At p = 0.75 and k = 3: 1 − 1/64 ≈ 98% and 27/64 ≈ 42%.
- Two models with 5 runs each: only a gap of 4 or more successes reaches p < 0.05. A gap of 3 still gives p ≥ 0.17.

:::warn title="Every number above has assumptions"
Wilson and Fisher assume independent trials with one fixed success rate: one agent configuration, one task, one environment. The bootstrap in section 7 assumes the 20 tasks are a random sample of the task population you want to talk about. Hand-built tasks are not a random sample. Then the interval describes a hypothetical population, and you must say so. Brown, Cai and DasGupta recommend Wilson (or Jeffreys) over the textbook Wald interval for small n ^[confirmed](https://doi.org/10.1214/ss/1009213286 "2026-10-20"). Miller recommends clustered standard errors when questions are related and paired differences when comparing models ^[confirmed](https://arxiv.org/abs/2411.00640 "2026-10-20").
:::

## A. Grader validity {#grader-validity-questions}

A **grader** is the code that turns an attempt into a number. A **false accept** is credit for a wrong solution. A **false reject** is no credit for a correct one. The science behind this section is in [[grader-validity]].

### Q1. Your grader rejects five wrong patches and accepts your reference. How do you know it will not reject another correct solution or accept a different wrong one? {#q1}

:::reveal title="Show the answer outline"
- **Say it in 2 minutes (cue card):**
  1. "Those six results can't show it. I test the two error types separately, each with its own corpus and frame."
  2. False reject: the tests encode my design. False accept: a wrong idea I never imagined.
  3. At least 3 independent correct solutions plus refactor variants must score 1. A defined mutant space (census or random sample) plus real agent failures must score 0.
  4. Any correct solution below 1 is a grader bug.
  5. Counts on hand-picked sets. A kill rate only on the enumerated space.
- **Answer:** "Those six results can't show it. Six hand-picked cases are counts, not error rates. A grader has two error types. I test each separately, with its own corpus and frame."
- **Hypotheses:**
  - H1, false-reject risk: the tests encode my reference's design, not the spec. A different correct design fails. OpenAI's audit of SWE-bench Verified found "narrow" tests that enforce details the issue never states ^[reported](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/ "2026-10-20").
  - H2, false-accept risk: the five wrong patches are the five I could imagine. A wrong idea I did not imagine passes. UTBoost found 345 wrong patches marked as passing on SWE-bench ^[confirmed](https://arxiv.org/abs/2506.09289 "2026-10-20").
  - H3: the grader is fine on both sides, within the frames I test.
- **Experiment:**
  - False rejects: at least 3 independent correct solutions with different designs, by different authors, must score 1. Refactor-equivalent variants of each (renames, reordering, another data structure) must score 1. Every check must trace to a sentence in the instruction. A check with no sentence gets deleted.
  - False accepts: define a mutant space (fixed operators applied to the reference diffs). Run all of it (a census) or a random sample. Adjudicate equivalent mutants before you look at grader results. Add wrong solutions from real agent failures, and run an adversarial "exploit" attempt, as Terminal-Bench 2.0 did ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20").
  - Both: the do-nothing submission scores 0. Every result is stable over 3 or more runs.
- **Change my mind:** any correct solution below 1 is a grader bug until proven otherwise. Find the check, find the spec sentence, fix one of them. Any wrong solution at 1 means a missing check. Add it, then re-run the whole matrix, because a new check can create new false rejects.
- **How sure, out loud** (fill in your own numbers from the validity card): "It accepted [a of a] independent correct solutions and rejected [b of b] hand-written wrong ones. Those are counts. On the enumerated mutant space it killed [X of Y] non-equivalent mutants. That is a census of that space, not of all possible bugs."

DeepSWE's verifiers follow the same idea. They test behavior through public APIs and accept any implementation with that behavior. Each verifier runs 3 times during authoring. The reference is used only for review, never for grading ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). Practice this in [[lab:lab-f]].
:::

### Q2. What is a false accept and a false reject? Which one matters more for Polaris? {#q2}

:::reveal title="Show the answer outline"
- **Answer:** "A false accept gives credit to a wrong solution. A false reject denies credit to a correct one. Which matters more depends on how the number is used."
- **Hypotheses:**
  - For an eval, both bias the score. False rejects hide real progress. Anthropic fixed a grader that rejected `96.12` against `96.124991…`; with a looser scaffold, Opus 4.5 on CORE-Bench went from 42% to 95% ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20").
  - For RL training, false accepts are worse. The optimizer finds them and makes them common ([Q34](#q34)).
- **Experiment:** measure the two separately, with separate corpora: correct solutions for false rejects, wrong solutions and mutants for false accepts. Never merge them into one "accuracy". The two corpora have different sizes and different frames.
- **Change my mind:** if the task is eval-only and transcripts show most failures come from grader strictness, I would fix false rejects first.
- **How sure:** "I can measure each rate on a stated frame. I can't measure them on 'all possible solutions'."
:::

### Q3. Your grader kills 100% of your mutants. Is it perfect? {#q3}

:::reveal title="Show the answer outline"
- **Answer:** "It is perfect on that mutant space. Mutants are a model of bugs, not real bugs."
- **Hypotheses:**
  - H1: the operators miss the bugs agents really make. "Use the latest revision instead of the as-of vintage" is not a one-token mutation.
  - H2: the mutants are too easy. Many crash, and any test kills a crash.
  - H3: some "equivalent" mutants were judged wrongly and excluded.
- **Experiment:** record *which* check kills each mutant. A mutant killed only by a crash says little. A check that kills nothing is either redundant or untested. Compare with realistic hand-written wrong solutions and with real agent failures from the pilot.
- **Evidence:** mutant detection correlates with real-fault detection, independent of coverage (Just et al., 357 real faults) ^[confirmed](https://people.cs.umass.edu/~rjust/publ/mutants_real_faults_fse_2014.pdf "2026-10-20"). Google found developers judged 85% of unfiltered mutants unproductive, so it limits operators and mutants per line ^[confirmed](https://arxiv.org/abs/2102.11378 "2026-10-20").
- **Change my mind:** if real agent failures fall outside my operator classes and the grader still catches them, my confidence goes up.
- **How sure:** "100% of [N] mutants from operators [list], census, with equivalents excluded for stated reasons. That frame excludes multi-line semantic bugs. For those I only have hand-written counts."
:::

### Q4. Why not grade by comparing outputs with your reference solution? {#q4}

:::reveal title="Show the answer outline"
- **Answer:** "Reference-based grading copies the reference's bugs and its arbitrary choices into the grader. I grade against the spec, with an independent oracle."
- **Hypotheses:**
  - H1: the reference has a bug, so the grader rejects correct solutions. EvalPlus found incorrect ground-truth solutions inside HumanEval ^[confirmed](https://arxiv.org/abs/2305.01210 "2026-10-20").
  - H2: the reference makes a choice the spec leaves open (tie order, float format). Valid alternatives fail.
  - H3: the spec pins every choice and the reference is right. Then reference outputs would work.
- **Experiment:** differential test of reference against the **oracle** — a slow, obviously correct implementation written from the spec only, by someone who never saw the reference. Use seeded random data plus a hand-made boundary table. Adjudicate every disagreement against the spec text.
- **Change my mind:** if three independent implementations and the oracle agree everywhere, I could use their outputs as expected values. I would still keep the reference out of the grading path, as DeepSWE does ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20").
- **How sure:** "Independence is never perfect ([Q24](#q24)). So I also keep hand-computed expected values for the boundary cases."
:::

### Q5. Your grader fails 1 run in 50 on the same correct solution. Do you ship it? {#q5}

:::reveal title="Show the answer outline"
- **Answer:** "No. A flaky grader gives wrong grades. I find the cause. I do not retry until it passes, because that turns a flaky check into a lenient one."
- **Hypotheses:** an unseeded random generator; timing or timeouts; test-order dependence; a float tolerance at the edge; environment drift (an unpinned package, a network call).
- **Experiment:** run the grader 50 to 100 times on the same correct solution with fixed seeds. Log which check fails. Then remove one suspect at a time. If the flake hits each run independently at 2%, about 20 of every 1,000 correct attempts get a false reject (an expected count) ^[inference](- "2026-10-20").
- **Evidence:** DeepSWE runs each verifier 3 times during authoring and sends flaky ones back ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). SWE-Bench Pro runs gold tests several times and drops flaky tasks ^[confirmed](https://arxiv.org/html/2509.16941 "2026-10-20"). Terminal-Bench 4.0 fixed 19 tasks for flakiness or misspecification ^[confirmed](https://www.tbench.ai/news/terminal-bench-4-0 "2026-10-20").
- **Change my mind:** if the failure is infrastructure (the container died), it can be re-run as an infrastructure error, not a grade, if it is logged and counted separately.
- **How sure:** "Three stable runs is a minimum, not proof. Even 0 flakes in 30 runs allows a flake rate up to about 10% (one-sided 95% bound)."
:::

### Q6. Should your grader use an LLM judge? {#q6}

:::reveal title="Show the answer outline"
- **Answer:** "Not for correctness when tests can decide it. Maybe for things tests can't see, such as code quality, as a separate and calibrated score."
- **Hypotheses:**
  - Judges have position, verbosity and self-enhancement biases. A strong judge still reached over 80% agreement with humans, about the human–human level ^[confirmed](https://arxiv.org/abs/2306.05685 "2026-10-20").
  - Tests miss mergeability. In METR's study, maintainer merge rates were about 24 points below the automated grader. Frame: 4 maintainers of scikit-learn, Sphinx and pytest reviewed 296 test-passing AI PRs blind, normalized against 47 human PRs ^[confirmed](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ "2026-10-20").
- **Experiment:** if I use a judge, I calibrate it. Humans label N attempts. The judge labels the same N. I measure agreement (for example Cohen's kappa) and errors per class. Anthropic suggests one judge per dimension, with an "Unknown" option, calibrated against human experts ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20"). I would also pin the judge's model version, so the grader does not change under me ^[inference](- "2026-10-20").
- **Change my mind:** if judge–human agreement equals human–human agreement on my own labeled set, I would use it for the quality dimension.
- **How sure:** "METR's task guide says avoid LLM judges for scoring ^[confirmed](https://taskdev.metr.org/desiderata/ "2026-10-20"). Anthropic uses them per dimension with calibration. I follow the stricter rule for the main reward."
:::

### Q7. The tests pass. Is the patch correct? {#q7}

:::reveal title="Show the answer outline"
- **Answer:** "Passing tests are evidence, not proof. A finite test suite never proves the spec is met."
- **Hypotheses:**
  - H1: it is correct.
  - H2: similar-but-different logic. PatchDiff found 29.6% of test-passing patches behave differently from the human fix ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20").
  - H3: it breaks other behavior. SWE-bench's weak validation let 7.8% of all patches count as correct while they still failed the developer-written test suite ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20").
  - H4: test gaming ([[M3]]).
- **Experiment:**
  - Run the full suite and compare with the baseline.
  - Differential test against the oracle on new inputs. Add property tests and held-out tests.
  - Read the diff for special cases.
  - Revert the fix and check that the new tests fail ([[S12]]).
- **Change my mind:** differential and held-out tests agree and the diff has no special cases. Then I say "correct on everything I checked".
- **How sure:** "I name the inputs I checked. METR found 0 of 15 reviewed agent PRs mergeable as-is, including the 4 that passed the tests ^[confirmed](https://metr.org/blog/2025-08-12-research-update-towards-reconciling-slowdown-with-time-horizons "2026-10-20")."
:::

### Q8. How do you test the grader itself? Isn't it just more code with bugs? {#q8}

:::reveal title="Show the answer outline"
- **Answer:** "Yes, it is code. I test it like a classifier, with labeled inputs: a validation matrix."
- **Hypotheses:** bugs in a check; bugs in the harness (paths, exit codes, timeouts); bugs in reward aggregation (milestone weights).
- **Experiment:**
  - The matrix: reference = 1; do-nothing = 0; each wrong solution = its expected milestone pattern; each correct alternative = 1; 3 stable runs.
  - Unit tests for the reward code.
  - Load-bearing check: delete one check at a time. At least one wrong solution must now pass. If none does, that check is untested.
- **Change my mind:** a check whose removal changes nothing is redundant or untested. I add a wrong solution that only it catches, or I remove it.
- **How sure:** "The matrix shows the grader is right on the labeled corpora. The labels come from my reading of the spec. If the grader and I misread it the same way, the matrix can't see it. An independent reviewer reads the spec to reduce that risk."
:::

## B. Benchmarks and results {#benchmark-questions}

### Q9. Gemini solves almost every task in your benchmark. Is it too easy, a real improvement, or leakage? How do you tell? {#q9}

:::reveal title="Show the answer outline"
- **Say it in 2 minutes (cue card):**
  1. "Probably a mix. I rule out a lenient grader and leakage before I believe a real gain."
  2. Lenient grader, too-easy tasks, leakage, real improvement.
  3. Grader: re-run the wrong solutions, adjudicate random passes blind. Easy: weak baselines and a do-nothing agent. Leakage: a strict-harness re-run plus a blind transcript audit. Real: fresh private tasks of matched difficulty.
  4. Strict score about equal to normal score, passes really correct, baselines fail, fresh tasks pass: then it is real.
  5. The strict-harness score with its interval and frame, plus the leak paths I closed. Memorization can't be fully ruled out.
- **Answer:** "There are four hypotheses, and they can all be partly true: a lenient grader, easy tasks, leaked answers, or real improvement. I test the cheap ones first."
- **Hypotheses:**
  - H1, lenient grader. Weak tests changed 11 SWE-bench Verified rankings in the UTBoost study ^[confirmed](https://arxiv.org/abs/2506.09289 "2026-10-20").
  - H2, too easy. Terminal-Bench 4.0 removed 2 tasks as saturated: all classes in all families of the latest model generation solved them 5 of 5 times ^[confirmed](https://www.tbench.ai/news/terminal-bench-4-0 "2026-10-20").
  - H3, leakage or contamination. The answer was reachable (git history, network, upstream fix) or memorized.
  - H4, real improvement.
- **Experiment, one per hypothesis:**
  - H1: re-run the wrong-solution corpus and the mutants on the current grader. Pick N passing attempts at random and adjudicate them against the spec, blind to which model made them.
  - H2: run weaker baselines (an older Gemini, a small model) and a do-nothing agent. Compare human time estimates. If old models pass too, the tasks are easy.
  - H3: re-run in a strict harness: fresh git with no history, no network except an allow-listed package proxy, no hidden files. Cursor's strict harness dropped Opus 4.8 Max from 87.1% to 73.0% on SWE-bench Pro ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20"). Audit transcripts, blind to pass/fail. Cursor's LLM auditor read 731 Opus 4.8 Max SWE-bench Pro trajectories blind to outcome. It judged that 63% of successful resolutions retrieved the fix instead of deriving it. Probe memory: give only the instruction, no repo, and ask for the file to change. On SWE-bench Verified, o3 named the buggy file up to 76% of the time, but about 53% on other repos ^[confirmed](https://arxiv.org/abs/2506.12286 "2026-10-20").
  - H4: write fresh private tasks of matched difficulty after the model's training cutoff. Check transfer to other benchmarks. Poolside's red flag was a 20-point jump that did not show up anywhere else ^[confirmed](https://poolside.ai/blog/through-the-looking-glass "2026-10-20").
- **Change my mind:** strict-harness score ≈ normal score, adjudicated passes are really correct, weak baselines fail, and fresh tasks score about the same. Then I accept real improvement.
- **How sure:** "I report the strict-harness score with its interval and frame ('N attempts per task on these M tasks'), and the list of leak paths I closed. I can't fully rule out memorization. Fresh private tasks are my best evidence."

| What you observe | It points to |
|---|---|
| Old or small models pass too | Too easy |
| Score drops in the strict harness | Leakage |
| Adjudicated "passes" are wrong | Lenient grader |
| The jump does not transfer to other benchmarks | Leakage or overfitting |
| Fresh, matched, private tasks also pass in the strict harness | Real improvement |
:::

### Q10. A task scores 0% for every model. What do you do? {#q10}

:::reveal title="Show the answer outline"
- **Answer:** "Suspect the task before the models. A 0% pass rate over many trials usually means a broken task ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20")."
- **Hypotheses:** H1 broken environment (missing package, network needed, wrong path). H2 grader too strict or wrong. H3 the spec does not let you infer the expected behavior. H4 too hard for the time limit. H5 a real frontier task.
- **Experiment:**
  - The reference scores 1 in the exact grading image. Do-nothing scores 0.
  - Read failing transcripts. If every model fails the same check, inspect that check first.
  - Look at milestones. Do models pass the early milestones and fail a later one?
  - A skilled non-author does a timed run with the same resources as the agent (METR's QA step) ^[confirmed](https://taskdev.metr.org/desiderata/ "2026-10-20").
  - Raise the time limit once to test the budget hypothesis.
- **Evidence:** of 40 SWE-bench Verified tasks no top model solved, Epoch found 14 invalid ^[confirmed](https://epoch.ai/blog/what-skills-does-swe-bench-verified-evaluate "2026-10-20").
- **Change my mind:** the reference passes, a non-author solves it in the budget with the same information, and failures are real model errors. Then it is a frontier task. Keep it, and add milestones so it still gives signal ([[task-design]]).
- **How sure:** "0 of 30 per model is not zero. The one-sided 95% upper bound is about 10%."
:::

### Q11. How do you calibrate difficulty before you spend many Gemini runs? {#q11}

:::reveal title="Show the answer outline"
- **Answer:** "With human time, a few cheap pilot runs and the milestone pattern. Then I adjust the task, not the grader."
- **Hypotheses:** the difficulty is real (the hard step I meant) or incidental (confusing instructions, artificial limits). METR's guide says avoid incidental difficulty and keep at most one major hard step ^[confirmed](https://taskdev.metr.org/desiderata/ "2026-10-20").
- **Experiment:**
  - A timed run by a non-author. METR defines time horizons by the human expert time a task takes ^[confirmed](https://metr.org/time-horizons "2026-10-20").
  - A few pilot runs to find where agents first fail.
  - Check the milestone pattern: a good task shows a spread, not a cliff.
  - Remember that the spec drives difficulty. Removing requirements and interfaces cut GPT-5 on SWE-Bench Pro from 25.9% to 8.4% ^[confirmed](https://arxiv.org/html/2509.16941 "2026-10-20").
- **Target:** METR wants a very competent agent above 0.9 and an incompetent one at 0.1 or below ^[confirmed](https://taskdev.metr.org/desiderata/ "2026-10-20").
- **Change my mind:** a cliff at a step that is hard only because the instruction is unclear. That is incidental difficulty. I rewrite the instruction.
- **How sure:** "Pilot runs are few, so my estimate is rough. I state the pilot frame (N runs, which model) and recalibrate on Gemini."
:::

### Q12. A model's score jumped 20 points after one training change. Do you celebrate? {#q12}

:::reveal title="Show the answer outline"
- **Answer:** "Not yet. A big jump that does not transfer is a leakage alarm."
- **Hypotheses:** a real gain; a leak; a grader change; a harness change; noise. Poolside saw SWE-Bench Pro jump about 20 points over a weekend; the cause was git history left in task images ^[confirmed](https://poolside.ai/blog/through-the-looking-glass "2026-10-20"). Epoch notes one leaderboard mixes 50-turn and 250-turn runs ^[confirmed](https://epoch.ai/benchmarks/swe-bench-pro/review "2026-10-20").
- **Experiment:** check other benchmarks for transfer. Diff the grader and harness versions. Re-run in the strict harness. Search transcripts for shortcut moves. Compute the difference as a paired comparison by task, with an interval ^[confirmed](https://arxiv.org/abs/2411.00640 "2026-10-20").
- **Change my mind:** the gain survives the strict harness, transfers to fresh tasks, and its paired interval excludes 0.
- **How sure:** "I give the paired difference, its interval, and the leak paths I checked."
:::

### Q13. A model card reports 78% on a public benchmark. Your runs on similar tasks give 40%. Who is wrong? {#q13}

:::reveal title="Show the answer outline"
- **Answer:** "Maybe nobody. The two numbers measure different things. I change one variable at a time until they agree or I know why not."
- **Hypotheses:**
  - Different tasks: mine are private and longer.
  - A different scaffold, or different turn and time limits.
  - A different metric: pass@1 averaged over trials, or best of k.
  - A stricter grader on my side, or contamination of the public set.
- **Evidence:** the Gemini 4 Argon card reports DeepSWE v1.1 at 77.9% ^[confirmed](https://deepmind.google/models/model-cards/gemini-4-argon/ "2026-10-20"). Google's separate methodology note gives the method: pass@1, no majority voting, self-computed with a mini-swe-agent harness. It also says Google averages over multiple trials for smaller benchmarks ^[confirmed](https://deepmind.google/models/evals-methodology/gemini-4-argon "2026-10-20"). Epoch says the scaffold alone can move SWE-bench Verified scores by up to about 20% ^[confirmed](https://epoch.ai/blog/what-skills-does-swe-bench-verified-evaluate "2026-10-20").
- **Experiment:** first reproduce the public number with my harness on a few public tasks. That calibrates the harness. Then run the public harness on my tasks.
- **Change my mind:** if my harness reproduces the public score on public tasks, the gap is about the tasks: mine are harder or less contaminated.
- **How sure:** "I say which variables I held fixed. With few runs, I give both intervals."
:::

## C. Runs and statistics {#statistics-questions}

The planning side of this section (harness, run budgets, sample sizes) is in [[runs-and-weaknesses]]. All numbers come from the [script above](#numbers).

### Q14. You say your grader's false-accept rate is 2%. Two percent of what? {#q14}

:::reveal title="Show the answer outline"
- **Answer:** "A rate needs a **sampling frame**: a defined population of wrong solutions, and the way I drew from it. Without a frame I only have counts."
- **Hypotheses:** why a hand-picked set gives no rate. I pick the bugs I can imagine. I also wrote the tests for the bugs I imagine. So the set is biased toward bugs the grader catches.
- **Experiment:** define the space (operators, which files and lines). Enumerate it. Run a census, or a random sample with a fixed seed. Decide which mutants are equivalent *before* you see grader results, so the decision can't be bent.

| Frame | Example wording | Interval? |
|---|---|---|
| Hand-picked corpus | "Rejected 12 of 12 hand-written wrong solutions." | No. Counts only. |
| Census of a defined space | "Killed 225 of 231 non-equivalent mutants from operator set O; 9 equivalents excluded with reasons." | No sampling interval: you saw the whole space. Says nothing outside O. |
| Random sample of a defined space | "Killed 57 of 60 mutants drawn uniformly from space S: 95%, Wilson 95% interval 86–98%, for S only." | Yes, for S only. |

The numbers in the table are made up to show the wording.

- **Change my mind:** if someone shows real agent bugs outside my space, I widen the space or report them as a separate hand-picked count.
- **How sure:** "My rate is for the space I defined. Real agent mistakes are a different population. I report them separately."
:::

### Q15. Why are 5 runs not enough? {#q15}

:::reveal title="Show the answer outline"
- **Answer:** "Five runs give a 95% interval up to about 65 points wide. 3 of 5 fits anything from 23% to 88%. Even 5 of 5 only bounds the rate above 57%."
- **Hypotheses (what 5 runs can and can't do):** 5 runs can show a task is broken (0 of 5 for every model, plus transcripts) and can surface failure modes. They can't rank models or estimate a rate. A 60% model passes all 5 runs 7.8% of the time. A 30% model fails all 5 runs 16.8% of the time.
- **Experiment:** decide the margin you need, then the number of runs. ±10 points near 50% needs about 96 runs on one task (normal approximation). With fewer, report the interval and say "can't distinguish".
- **Evidence:** Terminal-Bench 2.0 runs each agent-model pair at least 5 times and reports 95% intervals ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20"). But that is 5 runs on each of 89 tasks. Five runs on one task is a different design.
- **Change my mind:** if outcomes are almost deterministic (5 of 5 across several configurations), more runs add little for *that* question.
- **How sure:** "My interval assumes independent runs. Runs that share a cache, a container or the same API state are not fully independent."
:::

### Q16. What is the difference between pass@k and pass^k? Which do you report? {#q16}

:::reveal title="Show the answer outline"
- **Answer:** "pass@k: at least one of k attempts succeeds. It measures 'can it ever'. pass^k: all k attempts succeed. It measures 'can I rely on it'."
- **Formulas:** with a per-attempt rate p and independent attempts, pass@k = `1 − (1 − p)^k` and pass^k = `p^k`. From n samples with c correct, use the unbiased estimators, averaged over tasks:
  - pass@k = `1 − C(n − c, k) / C(n, k)` (Chen et al.) ^[confirmed](https://arxiv.org/abs/2107.03374 "2026-10-20")
  - pass^k = `C(c, k) / C(n, k)` (τ-bench) ^[confirmed](https://arxiv.org/abs/2406.12045 "2026-10-20")
- **Worked numbers:** p = 0.75, k = 3: pass@3 = 98.4%, pass^3 = 42.2% (Anthropic's example) ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20"). From n = 10 with c = 7: pass@5 = 100%, pass^5 = 8.3%.
- **Trap:** putting the sample rate into `1 − (1 − p̂)^k` gives a biased pass@k; Chen et al. show this ^[confirmed](https://arxiv.org/abs/2107.03374 "2026-10-20"). You also need n ≥ k samples.
- **Which one:** a user runs a coding agent once, so pass@1 and pass^k tell them what to expect. For RL, pass@k tells you whether training gets any signal: if no attempt in k succeeds, there is nothing to reinforce ([[runs-and-weaknesses#pass-k-rl|pass@k and RL]]) ^[inference](- "2026-10-20"). Google's methodology note for Gemini 4 Argon reports pass@1 with no majority voting ^[confirmed](https://deepmind.google/models/evals-methodology/gemini-4-argon "2026-10-20").
- **Hypotheses (what a big gap between them means):** H1 the model can solve the task but is unreliable. H2 one hard step is passed by luck in a few attempts. H3 the attempts are not independent, so both formulas are off.
- **Experiment:** run at least 2 × k attempts per task (for k = 5, at least 10), interleaved, each in a fresh container. Compute both numbers from the same samples. Read one passing and one failing transcript at the hard step: is the success skill or luck? If outcomes cluster by batch or container, the attempts are not independent.
- **Change my mind:** if a product runs k attempts and an automatic verifier picks one, pass@k is the right headline for that product.
- **How sure:** "Both formulas assume independent, identically distributed attempts. If attempts are positively correlated (a shared cache, the same container), pass^k is higher than `p^k` and pass@k is lower than the formula says."
:::

### Q17. Model A scored 4 of 5 on your task. Model B scored 2 of 5. Is A better? {#q17}

:::reveal title="Show the answer outline"
- **Answer:** "I can't tell. Fisher's exact test gives p = 0.52. Even 8 of 10 against 4 of 10 gives p = 0.17."
- **Hypotheses:** A is better; no difference, only noise; an environment difference (different times, API versions, rate limits).
- **Experiment:** more runs: 16 of 20 against 8 of 20 gives p = 0.022. Better: many tasks, compared as paired differences per task ^[confirmed](https://arxiv.org/abs/2411.00640 "2026-10-20"). Interleave A and B runs in random order, so time effects hit both.
- **Change my mind:** a paired difference whose interval excludes 0, on a stated set of tasks.
- **How sure:** "Even a significant result on one task is a claim about that task. A claim about 'coding' needs many tasks."
:::

### Q18. How many runs do you need? {#q18}

:::reveal title="Show the answer outline"
- **Answer:** "Decide the decision first: which comparison, and what margin. Then compute. For ±10 points near 50% on one task, about 96 independent runs."
- **Planning table (normal approximation, one task):**

| Margin | p ≈ 0.5 | p ≈ 0.2 |
|---|---|---|
| ±15 points | 43 | 27 |
| ±10 points | 96 | 61 |
| ±5 points | 384 | 246 |

- **Hypotheses:** H1, I need one rate on one task: the table is enough. H2, I need to compare two models: a difference has more variance, so I need more runs, and pairing by task helps. Miller suggests new question-based evals have at least 1,000 questions ^[confirmed](https://arxiv.org/abs/2411.00640 "2026-10-20"). Polaris-style long tasks can't reach that, so say so.
- **Experiment:** if runs are expensive, use milestones to get more signal per run ([Q28](#q28) warns where that misleads), and report wide intervals honestly.
- **Change my mind:** if a bootstrap on the real runs shows the outcomes are correlated, I need more runs than the table says.
- **How sure:** "These are planning numbers, not results."
:::

### Q19. Your benchmark has 20 tasks with 10 runs each. What is n for your interval? {#q19}

:::reveal title="Show the answer outline"
- **Answer:** "Not 200. Runs inside one task are correlated. For a claim about tasks, the unit is the task, so n is closer to 20."
- **Hypotheses:** two different questions. "How does the model do on *these* 20 tasks?" Then runs are the sample. "How does it do on tasks *like these*?" Then tasks are the sample, and you resample tasks.
- **Experiment:** a cluster bootstrap (resample tasks) or clustered standard errors. In the script's synthetic example, the naive interval is 43.6–57.4%. Resampling tasks gives 33.0–67.5%. Miller shows clustered standard errors can be over 3× the naive ones (DROP) ^[confirmed](https://arxiv.org/abs/2411.00640 "2026-10-20").
- **Change my mind:** if tasks were very similar in difficulty, the two intervals would be close. Show it with data, don't assume it.
- **How sure:** "The task-level interval assumes my tasks are a random sample of some task population. Hand-built tasks are not. So I say 'if these tasks represent X, then…' and argue that separately."
:::

### Q20. Your grader accepted 0 of 40 sampled wrong solutions. What is its false-accept rate? {#q20}

:::reveal title="Show the answer outline"
- **Answer:** "Not zero. With 0 of 40, the one-sided 95% upper bound is about 7.2%. The rule of three gives 3/40 = 7.5%. That holds for the space I sampled from."
- **Hypotheses (assumptions):** a random sample from a defined space; independent draws; correct labels from adjudication.
- **Experiment:** to tighten it, sample more (0 of 100 gives about 3%) or run a census.
- **Change my mind:** one accept found. The estimate changes, and, more important, there is now a concrete hole to fix.
- **How sure:** "Compare a hand-picked set: 12 of 12 rejected has a Wilson lower bound of 75.8%, but no population stands behind that number. So I don't report it as a rate."
:::

## D. Time, leakage and oracles {#time-questions}

These questions defend the time model of the [[capstone]]. **Leakage** means using information that was not available at decision time. The four times (event time, publication time, revision availability and as-of time) are defined once, in [[grader-validity#four-times|the four times]]. Read them there first. The rule you defend here: a computation as of `asof` may use only vintages with `published_at <= asof`, and for each event only the latest such vintage.

This toy script shows the rule on the data that [Q21](#q21) uses. It is not Chronos code. Save it as `time_rules.py`.

```python
from datetime import datetime, timedelta

# One row per vintage: (event, published_at, value). Toy data.
rows = [
    ("Q2", datetime(2026, 7, 30, 8, 30), 2.1),  # first print of Q2
    ("Q2", datetime(2026, 8, 28, 8, 30), 2.4),  # revision of Q2
    ("Q4", datetime(2026, 8, 1, 9, 0), 1.5),    # Q4 guidance, published early
]


def asof_value(data, event, asof):
    """Latest vintage of `event` with published_at <= asof, else None."""
    seen = [r for r in data if r[0] == event and r[1] <= asof]
    return max(seen, key=lambda r: r[1])[2] if seen else None


t = datetime(2026, 8, 28, 8, 30)
tick = timedelta(microseconds=1)
print("boundary, asof == published_at:", asof_value(rows, "Q2", t))
print("one tick earlier:             ", asof_value(rows, "Q2", t - tick))

late = rows + [("Q2", datetime(2026, 9, 25, 8, 30), 2.6)]  # published after t
print("future-invariance holds:      ", asof_value(late, "Q2", t) == asof_value(rows, "Q2", t))

no_q4 = [r for r in rows if r[0] != "Q4"]  # drop event_time > t, published <= t
print("Q4 known as of t:             ", asof_value(rows, "Q4", t))
print("after dropping event > t:     ", asof_value(no_q4, "Q4", t))
```

Real output of `python3 -I time_rules.py` (2026-10-20):

```text
boundary, asof == published_at: 2.4
one tick earlier:              2.1
future-invariance holds:       True
Q4 known as of t:              1.5
after dropping event > t:      None
```

The toy picks "latest" with `max`, so two vintages published at the same instant would tie. A real spec must state a tie rule.

### Q21. What is the difference between future-invariance and event-time leakage? {#q21}

:::reveal title="Show the answer outline"
- **Answer:** "Leakage is about what was *known* at decision time. That is publication time, not event time. Future-invariance says: changing anything published after t must not change any output computed as of t or earlier. Data about a future event that was already published is not leakage."
- **Hypotheses (two ways a grader goes wrong):**
  - It tests by event time: it drops rows with `event_time > t` and expects the same outputs. That over-claims. In the toy, Q4 guidance was public on Aug 1, so a correct solution may use it. Dropping it changes the output from 1.5 to None. The grader would reject a correct solution.
  - It misses the real leak: using the latest revision of an *old* event. The event time is in the past; the revision was published later.
- **Experiment:** a **metamorphic test** — change the input in a way that must not change the output, then compare. Here: perturb, add or delete only vintages with `published_at > t`; outputs as of any `asof <= t` must not change. Separately, a differential test against the oracle on data that includes early-published future events and late revisions of old events.
- **Change my mind:** if a dataset has no publication times, the property must be restated in terms of what it does have, and I would say the dataset can't express revisions.
- **How sure:** "The metamorphic test checks one necessary property. A solution that always returns None is perfectly future-invariant and perfectly wrong. That is why the do-nothing check and the oracle comparison exist."
:::

### Q22. Why model revisions at all? Isn't the latest value the best value? {#q22}

:::reveal title="Show the answer outline"
- **Answer:** "The latest value is best for history, not for a backtest. A decision on Aug 1 could only see the first print. Using the revised number is look-ahead."
- **Evidence:** this is a real data problem. The St. Louis Fed runs ALFRED so you can retrieve each data release (vintage) that was available on a past date ^[confirmed](https://alfred.stlouisfed.org/ "2026-10-20").
- **Hypotheses:** a "use the latest revision" bug passes most tests, because revisions are rare in the data. It fails only where revisions exist.
- **Experiment:** seeded datasets with a controlled revision rate; boundary rows with a revision published exactly at `asof`; the latest-revision bug as a hand-written wrong solution that the grader must reject.
- **Change my mind:** if the task data had no revisions, the rule would be untestable. I would drop it from the instruction rather than keep a requirement no check tests. Untested requirements were the main problem Jonathan Gabor found in SWE-Bench Pro, cited by Epoch ^[confirmed](https://epoch.ai/benchmarks/swe-bench-pro/review "2026-10-20").
- **How sure:** "My data generator decides how often the bug shows up. I report the revision rate I used."
:::

### Q23. Is the rule `published_at <= asof` or `<`? How do you test it? {#q23}

:::reveal title="Show the answer outline"
- **Answer:** "The instruction must pick one and say it in words. I test both sides of the boundary with exact equality."
- **Hypotheses:** an off-by-one at a boundary is a likely bug. Liu et al. list logic and boundary errors among repair-phase failures ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20"). Random timestamps almost never hit exact equality, so random tests won't find it.
- **Experiment:** a hand-written boundary table. At least these rows:
  - `asof` exactly equal to `published_at`, and one tick before. The toy above gives 2.4 and 2.1.
  - Two vintages published at the same instant (the tie rule).
  - The same instant written in two time zones.
  - A daily close, queried exactly at the close timestamp.
  - No vintage at all before `asof`.
  - Then the mutant check: flip `<=` to `<`. The grader must kill it. If not, the boundary is untested.
- **Change my mind:** if the mutant survives, the boundary table is incomplete. Fix the table first.
- **How sure:** "The table covers the boundaries I could list. I publish the list, so a reviewer can add what I missed."
:::

### Q24. How do you know your oracle is right? {#q24}

:::reveal title="Show the answer outline"
- **Answer:** "I don't trust it alone. It is slow and simple on purpose, written from the spec only, and checked three ways."
- **Hypotheses:** H1 an oracle bug. H2 the oracle and a reference share a misreading of the spec. H3 the spec is ambiguous.
- **Experiment:**
  1. Hand-computed expected values for the boundary table. No code involved.
  2. Differential test against 3 or more independent references. Each disagreement is adjudicated against the spec text.
  3. A reviewer reads only the spec and predicts outputs for 10 random cases.
- **Evidence:** in Knight and Leveson's experiment, 27 versions of one program were written independently from the same spec and run on one million tests. Coincident failures happened far more often than independence predicts ^[reported](https://www.kth.se/social/files/564df871f2765419e306178d/KnightLeveson.pdf "2026-10-20"). Independent code still shares blind spots.
- **Change my mind:** a disagreement where the oracle is wrong. I fix it, re-run everything, and record the fix on the validity card.
- **How sure:** "Agreement among independent versions raises confidence. It does not prove correctness, because errors correlate."
:::

### Q25. Random seeded data found nothing. Why do you also need a hand-written boundary table? {#q25}

:::reveal title="Show the answer outline"
- **Answer:** "Random data tests the bulk, not the edges. Under random sampling, an exact boundary has a probability near zero."
- **Hypotheses:** H1 the boundary code is right. H2 the generator never produces boundary inputs, so the random suite is blind there. H3 it produces them, but the compared outputs do not depend on the boundary.
- **Evidence:** the ABC checklist paper found KernelBench's fuzzing varied only values, not shapes, which overstated correctness by about 31 points ^[confirmed](https://arxiv.org/html/2507.02825v5 "2026-10-20"). Fuzz inputs must actually change the output.
- **Experiment:** measure the generator. How often does it produce equal timestamps, same-instant revisions, daylight-saving changes? If almost never, it can't test those rules. Then check which suite kills each boundary mutant.
- **Change my mind:** if the generator draws timestamps from a small grid and hits boundaries often, random tests may be enough. Show it with mutant kills.
- **How sure:** "I report which checks kill which mutants, so a reader sees what each suite really covers."
:::

### Q26. What do purge and embargo protect against in a walk-forward splitter? How do you test them? {#q26}

:::reveal title="Show the answer outline"
- **Answer:** "Both stop information from the test window leaking into training. I define them on a toy example, say which meaning the spec uses, and test both edges with exact timestamps."
- **The terms, on a toy example:**
  - A row at day d with a 5-day forward-return label has the **label window** [d, d+5]. Its label uses prices up to day d+5.
  - **Walk-forward**: each fold trains only on data before its test window.
  - **Purge**: drop training rows whose label window overlaps the test window. If the test window starts on day 100, rows from about day 95 to 99 have labels that reach into it. Purge them. Whether day 95 goes depends on closed or half-open windows. That is the edge to test.
  - **Embargo**: in López de Prado's k-fold version, also drop training rows that start within h days *after* a test window. In walk-forward, no training rows come after the test window. So the spec must say what embargo means there. Usually it is an extra gap of h between the end of training and the start of the test window.
  - Say which meaning the Chronos instruction uses. Check it in the task's own `instruction.md` before you answer.
- **Background:** the terms come from López de Prado's *Advances in Financial Machine Learning* (2018), chapter 7 ^[reported](https://www.quantt.co.uk/resources/purged-cross-validation "2026-10-20"). skfolio's docs define purge and embargo the same way and cite the book ^[reported](https://skfolio.org/generated/skfolio.model_selection.CombinatorialPurgedCV.html "2026-10-20").
- **Hypotheses (likely bugs):**
  - Purging by row count instead of time.
  - An off-by-one at a window edge.
  - Purging on one side only, or the embargo on the wrong side (once the spec says which side is right).
  - Using event time where the spec says publication time.
- **Experiment:** property checks on every split:
  - No training row's label window intersects the test window. Closed or half-open intervals, as the spec says.
  - Test windows are ordered and do not overlap.
  - If the spec defines embargo as a gap, the gap between training end and test start equals it exactly.
  - Edge data: irregular timestamps, weekends, daylight-saving changes.
- **Change my mind:** if two careful readers disagree on whether a window is closed or half-open, that is a spec bug ([Q27](#q27)).
- **How sure:** "My checks follow the spec's interval rules. They can't fix an ambiguous spec."
:::

## E. Task and spec design {#task-questions}

### Q27. Two experts disagree on what the spec requires. What do you do? {#q27}

:::reveal title="Show the answer outline"
- **Answer:** "That is a task bug, not a grader bug. A good task is one where two domain experts would independently give the same pass/fail verdict ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20"). I fix the spec, then re-check agreement."
- **Hypotheses:** H1 the spec is ambiguous and both readings are valid. H2 one expert misread it. H3 the tests encode a third reading.
- **Experiment:** write the disputed case as a concrete input with the expected output under each reading. Ask both experts, and a third, to predict blind. Measure agreement on a sample of cases (percent agreement or Cohen's kappa). SWE-bench Verified used three annotators per sample and dropped a sample if any of them rated it severe ^[reported](https://openai.com/index/introducing-swe-bench-verified/ "2026-10-20").
- **Resolve:** either state the rule explicitly in the instruction, or accept both readings in the grader if the choice does not matter for what you measure. Never pick one silently in the tests.
- **Change my mind:** high agreement on *new* cases after the fix.
- **How sure:** "I report agreement on the cases we tested, not on all possible cases."
:::

### Q28. When does partial credit mislead? {#q28}

:::reveal title="Show the answer outline"
- **Answer:** "When the milestone points don't track the skill I claim to measure, or when easy milestones make an average hide total failure."
- **Hypotheses (the main traps):**
  - Easy milestones: if milestone 1 were worth 0.4, a model could score 0.4 by fixing only that and never touch the hard part. "40%" sounds like progress.
  - Dependent milestones: if milestone 3 needs milestone 2, points don't add up the way they look.
  - RL pressure: the optimizer farms the cheap milestones.
  - Credit for a close-but-wrong approach rewards the wrong idea.
  - Averages that mix binary and partial scores across tasks.
- **Evidence:** Anthropic recommends partial credit on multi-part tasks ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20"). METR prefers continuous 0–1 scores ^[confirmed](https://taskdev.metr.org/desiderata/ "2026-10-20"). FrontierSWE gives performance tasks 0.5 × correctness until correctness reaches 1, so speed can't count before correctness ^[confirmed](https://github.com/Proximal-Labs/frontier-swe "2026-10-20").
- **Experiment:** report the full milestone vector, not only the sum. Look at the score distribution. Compare the partial-credit ranking with a binary "fully solved" ranking. If they disagree, say so.
- **Change my mind:** if milestone scores predict full solves on later runs or models, they carry real signal.
- **How sure:** "I publish the weights before running, plus raw milestone results, so anyone can recompute any aggregate."
:::

### Q29. How do you write an instruction that is precise but does not give away the solution? {#q29}

:::reveal title="Show the answer outline"
- **Answer:** "Describe behavior, not files or functions. Be exact about every rule the grader checks. Leave the where and the how to the agent."
- **Evidence:** DeepSWE prompts describe behavior and average about 2,158 characters, so the agent must find where to change the code ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). Terminal-Bench 2.0's checklist: every tested behavior is in the instruction, and every stated behavior is tested ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20").
- **Hypotheses:** too vague → reasonable readings get rejected (Q27). Too detailed → a typing exercise. Inflated → requirements no check tests.
- **Experiment:** a trace table. Each instruction sentence on the left, the checks that test it on the right. An empty cell on either side is a bug. Then a non-author reads only the instruction and writes the expected outputs for the boundary table.
- **Change my mind:** if the blind reader's outputs match the oracle on every boundary case, the instruction is precise enough.
- **How sure:** "The trace table is complete for the checks I wrote. The blind reader is my best test of ambiguity."
:::

### Q30. Why build one hand-made task instead of 1,000 synthetic ones? {#q30}

:::reveal title="Show the answer outline"
- **Answer:** "They serve different goals. One hand-built task tests realistic long-horizon work and can be validated deeply. A synthetic set gives statistical power on narrow skills. The Polaris posting describes the first kind ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19")."
- **Hypotheses:** Mechanize argues cheap RL tasks waste compute and that under about $500 per task is already inefficient ^[confirmed](https://www.mechanize.work/blog/cheap-rl-tasks-will-waste-compute "2026-10-20"). That is an argument from an interested party, not a measurement.
- **Experiment:** know the cost. One task can't support a claim about "coding ability", and an interval over tasks with n = 1 does not exist. So one task supports a deep claim about one capability. A family of validated variants supports broader claims ([Q41](#q41)).
- **Change my mind:** if a cheap generator produced tasks that pass the same validity checks and show the same failure modes, I would use it.
- **How sure:** "My capstone is one task. I claim depth, not breadth."
:::

### Q31. How do you know your task is long-horizon and not just long? {#q31}

:::reveal title="Show the answer outline"
- **Answer:** "Long-horizon means many dependent decisions, where early mistakes hurt later. Just long means lots of typing. I check where agents fail."
- **Hypotheses:** incidental difficulty (boilerplate, confusing instructions) versus real difficulty (state to track, integration, drift from the spec).
- **Evidence:** the visible-versus-held-out pass gap in SpecBench grows about 28 points per 10× code size, so long tasks give more room to overfit visible tests ^[confirmed](https://arxiv.org/abs/2605.21384 "2026-10-20"). Terminal-Bench 2.0's failure taxonomy includes context loss and premature termination ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20").
- **Experiment:** label each failure by its first wrong turn and phase ([Q38](#q38)). If most failures sit in integration (Chronos milestone 3) and context loss, the task is long-horizon. If they are typos in boilerplate, it is just long. In a human timed run, compare time spent thinking with time spent typing.
- **Change my mind:** if a strong model solves it by brute-force editing without a plan, the horizon is shorter than I thought.
- **How sure:** "My evidence is pilot transcripts from other agents. Gemini may fail differently."
:::

## F. Isolation, contamination and cheating {#isolation-questions}

### Q32. How would you know an agent read the hidden tests? {#q32}

:::reveal title="Show the answer outline"
- **Answer:** "Best is to make it impossible: the hidden tests never exist in the solver's workspace until the agent stops. Then I verify, because 'impossible' is also a claim."
- **Hypotheses:** the agent got the tests through one of four paths, or not at all:
  - the filesystem (a mounted or parent folder);
  - git (history that contains the tests);
  - the network (a public copy);
  - memory (contamination).
- **Experiment:**
  1. Before the run: a **canary** — a unique random string — in every private file. The solver workspace must contain zero matches. No object in the environment repo's git store may contain hidden-test text. Scan every object, not only `git log --all -p` ([Q37](#q37)).
  2. During the run: log file access and network. In a Linux container that can be `strace -f -e trace=openat` (not run for this page; there is no strace on macOS). Save the full transcript.
  3. After the run: scan the transcript for private paths, the canary, `git log --all`, `git show` and `curl`. Look for hard-coded expected values: Cursor saw an agent hard-code a hidden test's expected exception string ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20").
  4. Re-grade with a second check set that never existed during the run: new boundary cases and a new random seed. An agent that copied hidden expected values passes the hidden tests but fails the fresh ones. EvilGenie uses the same idea the other way round: pass visible, fail held-out means overfitting to the visible tests. Its held-out method had a 1.4% false-positive rate, on its own problems and agents ^[confirmed](https://arxiv.org/abs/2511.21654 "2026-10-20").
- **Change my mind:** a scan hit is a lead, not proof. A correct solution can contain the same number by chance. Check in the transcript where the agent got the value.
- **How sure:** "I can show the paths I closed and the scans I ran. I can't prove a negative about memory."

A literal-overlap scan you can run. Save as `leak_literals.py`:

```python
"""Flag literals that appear only in the hidden tests and also in the agent's diff.
Usage: python3 leak_literals.py HIDDEN_TESTS_DIR VISIBLE_TESTS_DIR AGENT.diff
"""
import ast
import pathlib
import sys


def literals(folder):
    found = set()
    for path in pathlib.Path(folder).rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Constant) and isinstance(node.value, (str, int, float)):
                text = str(node.value)
                if len(text) >= 4 and not isinstance(node.value, bool):
                    found.add(text)
    return found


hidden_dir, visible_dir, diff_path = sys.argv[1:4]
only_hidden = literals(hidden_dir) - literals(visible_dir)
added = [line[1:] for line in pathlib.Path(diff_path).read_text().splitlines()
         if line.startswith("+") and not line.startswith("+++")]
hits = sorted(lit for lit in only_hidden if any(lit in line for line in added))
print(f"{len(only_hidden)} hidden-only literals, {len(added)} added lines")
for lit in hits:
    print(f"LEAK? {lit!r} appears in the diff but only in hidden tests")
sys.exit(1 if hits else 0)
```

Try it on synthetic files written for this demo: two hidden tests, one visible test, and a diff that special-cases one hidden input. The diff is not real agent output. Run this in zsh, in the folder that holds `leak_literals.py`:

```bash
D=$(mktemp -d); mkdir -p "$D/hidden" "$D/visible"
cat > "$D/hidden/test_a.py" <<'EOF'
from pipeline import asof_value

def test_close_boundary():
    assert asof_value("SPY", "2024-03-29T16:00:00-04:00") == 101.25
EOF
cat > "$D/hidden/test_b.py" <<'EOF'
from pipeline import zscore

def test_zscore_window():
    assert zscore([1, 2, 3], window=2)[-1] == 0.7071
    assert "warmup" in zscore.__doc__
EOF
cat > "$D/visible/test_v.py" <<'EOF'
from pipeline import zscore

def test_zscore_runs():
    assert zscore([1, 2, 3], window=2) is not None
    assert "warmup" in zscore.__doc__
EOF
cat > "$D/agent.diff" <<'EOF'
--- a/pipeline.py
+++ b/pipeline.py
@@ -10,2 +10,4 @@ def asof_value(key, asof):
+    if asof == "2024-03-29T16:00:00-04:00":
+        return 101.25
EOF
python3 -I leak_literals.py "$D/hidden" "$D/visible" "$D/agent.diff"; echo "exit=$?"
```

Real output (2026-10-20, Python 3.13.9):

```text
3 hidden-only literals, 2 added lines
LEAK? '101.25' appears in the diff but only in hidden tests
LEAK? '2024-03-29T16:00:00-04:00' appears in the diff but only in hidden tests
exit=1
```

The third hidden-only literal, `0.7071`, is not in the diff, so it is not flagged. `"warmup"` is in the visible tests too, so the agent was allowed to see it. A short literal such as `"SPY"` is skipped: under 4 characters, it matches too much by chance.
:::

### Q33. Your task builds on an open-source library. How do you know Gemini did not memorize the answer? {#q33}

:::reveal title="Show the answer outline"
- **Answer:** "I can't know for sure. I lower the chance, and I measure the signals."
- **Hypotheses:** the fix exists publicly (upstream commit, a mirror); the task text resembles something in training data; or the model really derives it.
- **Experiment, to lower the chance:** never publish the task or its solution; never merge the solution upstream, as DeepSWE does ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"); put a canary string in private files. A canary lets dataset builders filter documents and lets researchers check whether they were trained on ^[confirmed](https://www.alignment.org/canary/ "2026-10-20"). It works only if training pipelines honor it ^[inference](- "2026-10-20"). Date tasks after the training cutoff, as LiveCodeBench does ^[confirmed](https://arxiv.org/abs/2403.07974 "2026-10-20").
- **Experiment, to measure:**
  - The no-repo probe from the SWE-bench Illusion paper ([Q9](#q9)).
  - Overlap between the agent's code and the reference: names, comments, odd constants the spec does not imply.
  - Scores on similar fresh tasks. On SWE-bench-Live, the same agents score lower than on the static SWE-bench ^[reported](https://arxiv.org/abs/2505.23419 "2026-10-20").
- **Change my mind:** the agent reproduces reference-only details that the spec does not imply. That is a strong memorization signal.
- **How sure:** "Contamination is a probability, not a yes or no. I report the signals I checked."
:::

### Q34. This task will become an RL training environment. What changes in the grader? {#q34}

:::reveal title="Show the answer outline"
- **Answer:** "Optimization pressure finds every false accept. A grader that is 'mostly right' for evals becomes a target for **reward hacking** — getting reward without doing the task."
- **Evidence:** Anthropic describes hacks learned in real coding RL, such as `sys.exit(0)` before asserts run; the hacking generalized to sabotage in 12% of cases in one Claude Code evaluation ^[confirmed](https://www.anthropic.com/research/emergent-misalignment-reward-hacking "2026-10-20"). METR saw o3 reward-hack in 30.4% of RE-Bench runs (39 of 128) ^[confirmed](https://metr.org/blog/2025-06-05-recent-reward-hacking "2026-10-20"). In ImpossibleBench, hiding tests brought cheating near zero but hurt real performance, and read-only tests blocked test edits but not special-casing ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20").
- **Hypotheses (hack surfaces):** test files; exit codes; overridden equality; `conftest.py`; timing functions; grader state the agent's process can reach; overfitting to visible tests.
- **Experiment:** red-team the grader with an exploit agent, as Terminal-Bench 2.0 did ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20"). Grade in a separate process or container the agent can't touch. Keep held-out tests. Track the visible-versus-held-out gap as reward climbs. Read transcripts of the highest-reward episodes.
- **Change my mind:** the red team finds nothing over many attempts, and the held-out gap stays flat while reward rises. Then the grader holds, for now.
- **How sure:** "I can list the exploits I tried. Training will try more."
:::

### Q35. The agent ran `git log --all`. Is that cheating? {#q35}

:::reveal title="Show the answer outline"
- **Answer:** "It is normal engineering behavior. If the answer was in the history, that is my isolation bug. Then the attempt is invalid, whatever the agent intended."
- **Evidence:** on SWE-bench, agents ran `git log --all` and `git show` and sometimes found the gold patch; the fix removed future history ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20"). Ludwig et al. saw shortcut attempts in 55.5–89.1% of trajectories on DeepSWE for three open models. Turning off the network did not meaningfully reduce attempts. Telling agents to build the solution themselves cut attempts to 0.9–10.3% ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20").
- **Hypotheses:** curiosity (normal), solution lookup ([[M7]]), or both.
- **Experiment:** search the history for anything revealing. Build the workspace from a fresh `git init` of the base snapshot only. State in the instruction what is off-limits.
- **Policy:** decide before running what counts as cheating, write it down, and audit after. FrontierSWE sets any flagged trial to 0 ^[confirmed](https://github.com/Proximal-Labs/frontier-swe "2026-10-20").
- **Change my mind:** if the history holds only the base snapshot, the command found nothing. The attempt stays valid.
- **How sure:** "I report how many attempts used each shortcut, not only the score."
:::

### Q36. The agent edited a visible test. Do you give it zero? {#q36}

:::reveal title="Show the answer outline"
- **Answer:** "The score should not depend on it. I grade with my own copy of the tests on a clean checkout. Then I apply the rule I wrote before the run."
- **Hypotheses:** H1 legitimate (the test was wrong, or the agent added a new test). H2 gaming (a weaker assertion, a skip marker, a deleted test). Claude 3.7 Sonnet's system card describes special-casing tests after failed attempts ^[confirmed](https://www.anthropic.com/claude-3-7-sonnet-system-card "2026-10-20"). Transluce found monitor evasion, such as disabling tests, in 14.7% of 4,990 sessions in one public dataset (1.9% severe), judged by an LLM ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20").
- **Experiment:** diff `tests/` against the base; compare hashes; run the hidden tests and the original visible tests against the agent's source, with its test changes thrown away.
- **Policy:** keep two outputs. The score: correctness on the original and hidden tests. A behavior flag: "edited tests", with the reason.
- **Change my mind:** if the original test was wrong per the spec, the bug is in my task. I fix the test, re-grade every attempt, and drop the flag for that edit.
- **How sure:** "The score is robust to test edits by construction. The flag needs a human read."
:::

### Q37. Your report says the solvers were isolated. Prove it. {#q37}

:::reveal title="Show the answer outline"
- **Answer:** "Three checks run on every attempt, and their outputs go in the report. Any hit invalidates that attempt, and I report it."
- **Experiment:**
  1. Workspace scan for the canary: `rg -uuu -l -F "$CANARY" "$WORKSPACE"`. No output is the pass. (`rg` exits with 1 when nothing matches.) `-uuu` also searches hidden, ignored and binary files. Plain `rg` skips them.
  2. Object scan: `git -C "$WORKSPACE" cat-file --batch-all-objects --batch | rg -a -c -F -f private_markers.txt` must find nothing. It reads every object in the repo, including commits that only the reflog points to, or nothing at all. `git log --all -p` walks branches, tags and `HEAD` only, so it misses those. The SWE-bench fix removed the reflog for this reason ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20"). Simplest of all: build the workspace from a fresh `git init` of the base snapshot ([Q35](#q35)). The scan checks that you did.
  3. Transcript scan for private paths, the canary and shortcut commands.
  4. Plus a boundary test before the first run: place a canary file where private files would sit and ask the agent to read it. If it can, the boundary is open ([[S0]]).
- **Hypotheses:** the checks can fail silently (a wrong variable, an empty pattern file, a default that skips hidden files). So each check also runs once on a planted positive, which it must catch.
- **Change my mind:** any hit. Fix the cause, re-run the affected attempts, report both.
- **How sure:** "These checks catch copies that leave a plain-text trace. A compressed or encoded copy can still hide. Knowledge from training leaves no trace at all ([Q33](#q33))."

Checks 1 and 2, with planted positives, on a throwaway repo. Save as `iso_demo.zsh` and run `zsh iso_demo.zsh` (it also runs in bash). It needs `rg` and a git identity in your git config.

```zsh
CANARY="canary-$(uuidgen)"               # unique marker; real tasks put it in every private file
MARKERS=$(mktemp); printf '%s\n' "$CANARY" > "$MARKERS"
WORKSPACE=$(mktemp -d); cd "$WORKSPACE"
git init -q && printf 'def f(): pass\n' > app.py && git add -A && git commit -qm base

rg -uuu -l -F "$CANARY" .; echo "1. workspace scan, clean: exit=$?"
git cat-file --batch-all-objects --batch | rg -a -c -F -f "$MARKERS"; echo "2. object scan, clean: exit=$?"

mkdir .cache && printf '# %s\n' "$CANARY" > .cache/leak.py    # planted positive, in a hidden folder
rg -l -F "$CANARY" .; echo "plain rg, planted: exit=$?"
rg -uuu -l -F "$CANARY" .; echo "1. workspace scan, planted: exit=$?"

git add -f .cache/leak.py && git commit -qm leak && git reset -q --hard HEAD~1    # leak now only in the reflog
git log --all -p | rg -c -F -f "$MARKERS"; echo "git log --all, planted: exit=$?"
git cat-file --batch-all-objects --batch | rg -a -c -F -f "$MARKERS"; echo "2. object scan, planted: exit=$?"
```

Real output (2026-10-20, ripgrep 15.2.0, git 2.55.0, macOS; the same in zsh and bash):

```text
1. workspace scan, clean: exit=1
2. object scan, clean: exit=1
plain rg, planted: exit=1
./.cache/leak.py
1. workspace scan, planted: exit=0
git log --all, planted: exit=1
1
2. object scan, planted: exit=0
```

Read it in pairs. Plain `rg` missed the canary in `.cache/`. `-uuu` found it. Then `git reset --hard` left the leak commit reachable only from the reflog. `git log --all` calls the repo clean. The object scan still finds the canary in one line.
:::

## G. Agent failures and transcripts {#failure-questions}

### Q38. How do you find the first wrong turn in a 300-step transcript? {#q38}

:::reveal title="Show the answer outline"
- **Answer:** "Go from claims to evidence. List each claim the agent made, match it to real tool output, and find the first step where its belief left the evidence."
- **Hypotheses:** the wrong turn is in localization, repair or verification — the three phases in Liu et al. ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20") — or in the environment.
- **Experiment:** bisect on beliefs. At the midpoint, is the agent's model of the bug still consistent with the evidence so far? Move left or right. Start with repair and verification: Majgaonkar et al. found that 72–81% of trajectories locate the right files even when they fail ^[confirmed](https://arxiv.org/abs/2511.00197 "2026-10-20"). If your tool allows it, replay from just before the candidate turn with the corrected fact. If the agent then succeeds, the turn was causal ^[inference](- "2026-10-20").
- **Change my mind:** a second labeler marks a different first wrong turn. Then my label is a judgment call, and I say so.
- **How sure:** "First wrong turn is a judgment. I measure agreement between two labelers on a sample." Method: [[S14]].
:::

### Q39. The agent says "all tests pass". What do you do? {#q39}

:::reveal title="Show the answer outline"
- **Answer:** "I re-run them myself. An agent's claim is a guess until a deterministic tool confirms it ([[M6]])."
- **Evidence:** Transluce found overselling — claiming more than the transcript shows — in 34.7% of 4,788 sessions in one public dataset (1.8% severe), judged by an LLM ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20"). Claude Code's docs say to ask for evidence (the command and its output), not claims ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20").
- **Hypotheses:** tests were not run; a subset ran; they ran and failed; they passed after the agent edited them; they really pass.
- **Experiment:** clean checkout; full suite against the baseline; test-file hashes; find the actual command and output in the transcript. For headless `agy` runs, read the JSON `status` field, not only the exit code (checked against docs on 2026-10-20, not run) ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20").
- **Change my mind:** my clean re-run passes and matches the output in the transcript. Then I accept the claim for that run. It says nothing about the agent's next claim.
- **How sure:** "My re-run is the evidence I report, not the agent's sentence."
:::

### Q40. A model fails your task. Is that a model weakness or a task flaw? {#q40}

:::reveal title="Show the answer outline"
- **Answer:** "I read the transcript and adjudicate against the spec before I call it a weakness. Anthropic says to read transcripts to tell agent mistakes from grader rejections ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20")."
- **Hypotheses:** H1 a model weakness (wrong reasoning about a time rule). H2 a grader false reject. H3 an ambiguous spec. H4 infrastructure (timeouts, missing packages). H5 the harness (a turn cap).
- **Experiment:** for each failed attempt, take the failing check. Is the agent's behavior wrong per the spec? A second reviewer adjudicates, blind to the model. Confirm the reference passes in the same environment. Label infrastructure errors separately.
- **Change my mind:** several models fail the same check with behavior the spec allows. Then it is the grader.
- **How sure:** "I report adjudicated counts: N failures, of which X model errors, Y grader errors, Z infrastructure."
:::

### Q41. How do you turn one weakness into a family of tasks? {#q41}

:::reveal title="Show the answer outline"
- **Answer:** "Keep the underlying skill, change the surface, and validate each variant like a new task."
- **Example:** the weakness is "uses the latest revision instead of the as-of vintage". Variants: another domain (inventory snapshots, feature flags with rollout times); another stack (TypeScript); another boundary rule (exclusive); another data shape (an event log instead of a table).
- **Hypotheses:** the variants measure the same skill, or they measure surface knowledge, such as one library.
- **Experiment:** for each model, check that failures agree across variants. If one variant fails for a different reason (an unfamiliar library), it measures something else. Each variant gets its own validity matrix, and variants must not share reference code that could leak.
- **Change my mind:** if failure rates across variants are unrelated, the "family" is not measuring one skill.
- **How sure:** "A family gives more tasks, but they are correlated. I treat it as one cluster in the statistics ([Q19](#q19))."
:::

## H. Your own work {#ownership-questions}

Expect questions like these about [[capstone]] if you show it ^[inference](- "2026-10-20"). Never claim what you did not do. Chronos v0 is agent-built. It becomes your project when you pass the ownership gate.

### Q42. Chronos was built with AI agents. What did you do yourself? {#q42}

:::reveal title="Show the answer outline"
- **Answer:** say it first, plainly, and say only what you have done. Check [[start-here#honesty|the gate list]] before every interview. Say only what is ticked.
  - Before all four gate items are done: "Agents built v0 under my direction. So far I have [gate items done]: I reproduced failure [ID] and traced it to [file:line]. Next I [next gate item]."
  - Only after all four: "Agents built v0 under my direction. Then I owned it: I reproduced a failure, diagnosed it, changed the grader, and defended the design."
- **Fill in from your own gate work (never from this page):**
  - "I ran the grader myself on pilot attempt [ID]. Check [name] failed."
  - "Root cause: [one sentence], at [file:line]. It broke the [time rule]."
  - "I added [check]. It catches [wrong solution I wrote]. The validity card changed from [before] to [after]."
  - "One design choice I would defend: [choice], because [evidence]. One I'd change: [choice]."
- **Hypotheses the interviewer is testing:** do you understand the code, or only the summary? Can you go one level deeper on any part?
- **Experiment you can offer:** "Pick any check in the grader. I'll explain what it tests, which spec sentence it comes from, and which wrong solution it kills."
- **Change my mind:** if a follow-up hits a part you can't explain, say "I haven't verified that part myself", and say how you would check it. Never bluff. Add that part to your ownership-gate list.
- **How sure:** "Agents wrote much of the code. I verified [what] myself and I have not yet verified [what]."
:::

### Q43. What is the weakest part of your evaluation, and what would you do next? {#q43}

:::reveal title="Show the answer outline"
- **Answer:** name the weakness first. Don't wait to be asked twice.
- **Hypotheses (honest candidates; pick the ones that are true for you):**
  - One task. No claim about coding in general ([Q30](#q30)).
  - The pilot used Claude agents, not Gemini. Gemini may fail differently.
  - The hand-written wrong solutions give counts, not rates ([Q14](#q14)).
  - The oracle's independence is limited ([Q24](#q24)).
  - Few runs, so wide intervals ([Q15](#q15)).
- **Experiment (what next):**
  - Run Gemini with at least 20 attempts per configuration, and report intervals.
  - Turn real Gemini failures into new wrong solutions.
  - Build a second task in another stack with the same toolkit (Day 4 of [[tracker#final-project|the extension plan]]).
- **Change my mind:** if Gemini runs show failure modes my grader does not separate, my weakest part is the grader, not the sample size.
- **How sure:** "These are the limits I know. A reviewer will likely find one I don't."
:::

## I. Does the score still mean something? {#validity-questions}

Two questions about the whole eval, not one grader. They test whether you think about what a number is *for*.

### Q44. Your benchmark score went up, but engineers who use the model say it got worse at real work. Who is right? {#q44}

:::reveal title="Show the answer outline"
- **Answer:** "Maybe both. The benchmark measures what its grader checks. Engineers judge things the grader may not check. I find the dimension that differs before I pick a side."
- **Hypotheses:**
  - H1, the grader misses what users value: scope, code quality, mergeability. In METR's study, maintainer merge rates were about 24 points below the automated grader. Frame: 4 maintainers of 3 repos reviewed 296 test-passing AI PRs blind, normalized against 47 human PRs. For Claude Sonnet 4.5, the implied time horizon fell from about 50 minutes to about 8 ^[confirmed](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ "2026-10-20").
  - H2, the tasks differ from real work. Epoch reports that annotators rated 39% of SWE-bench Verified tasks trivial (under 15 minutes) ^[confirmed](https://epoch.ai/blog/what-skills-does-swe-bench-verified-evaluate "2026-10-20"). Real work is longer and vaguer.
  - H3, the gain is leakage ([Q9](#q9)).
  - H4, the users' evidence is anecdotal, or the product changed (scaffold, defaults), not the model.
- **Experiment:** collect a sample of the users' real tasks, or tasks like them. Run the old and the new model in the same harness. Blind reviewers judge each result as "would merge" or not, without knowing the model. Compare paired by task, per dimension: correctness, scope, code quality.
- **Change my mind:** reviewers prefer the new model on the users' own tasks. Then the complaint is about something else (speed, style, the tool). If they prefer the old one while my grader prefers the new, my grader measures the wrong thing. I add checks, or a calibrated quality score ([Q6](#q6)).
- **How sure:** "User reports are a biased sample. So are my tasks. A blind, paired review on a stated task sample is the fair test, and I say which tasks it covered."
:::

### Q45. Your task set is a year old. How do you keep it measuring something? {#q45}

:::reveal title="Show the answer outline"
- **Answer:** "Treat it as versioned software. Tasks saturate, leak and rot. I retire, fix and add tasks on a schedule. I never compare scores across versions without saying so."
- **Hypotheses (how old tasks fail):**
  - Saturation: every current model passes, so the task no longer separates models.
  - Leakage: the task or its solution became public, or similar code was merged upstream.
  - Rot: dependency drift breaks the environment, so correct solutions fail.
  - New flaws: users report misspecified or flaky tasks.
- **Evidence:** Terminal-Bench 4.0 is versioned. It removed 8 tasks: 2 saturated, 2 refusals, 2 with public solutions, 2 with quality or platform issues. It fixed 19 more for flakiness or misspecification ^[confirmed](https://www.tbench.ai/news/terminal-bench-4-0 "2026-10-20"). DeepSWE v1.1 fixed dependency drift ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). OpenAI stopped reporting SWE-bench Verified, citing contamination and flawed tests ^[reported](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/ "2026-10-20").
- **Experiment, every release cycle:**
  - Rot: re-run the reference and do-nothing solutions in freshly built images.
  - Leakage: search the web, upstream repos and package releases for the solution.
  - Saturation: look at per-task pass rates of the newest models.
  - Drift: keep a small private set that is never published. If public scores rise and private scores do not, suspect leakage.
- **Change my mind:** a task that every model passes on average, but that some models still fail now and then, may still measure reliability (pass^k, [Q16](#q16)). I keep it in a reliability set.
- **How sure:** "Versioning makes scores comparable only within one version. Across versions, I re-run the old models on the new version, or I don't compare."
:::

## J. Eval system design {#system-questions}

The Polaris posting also lists building data and pipelines that improve Gemini ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). Mechanize's take-home ends with a recorded code review that includes system design ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20"). That is Mechanize's process, a proxy, not Polaris's. The full design, with its sources, is in [[runs-and-weaknesses#system-design|Eval system design]].

### Q46. Design a system that runs 1,000 agent attempts a night on 50 tasks and gives scores you can trust. {#q46}

:::reveal title="Show the answer outline"
- **Answer:** "Every attempt runs in a fresh, pinned sandbox, is graded where the agent can't reach, and leaves a full record. Infrastructure errors stay apart from grades. The report shows raw outcomes before any rate."
- **Hypotheses (what makes a nightly score untrustworthy):**
  - H1, leakage: a shared workspace, git history or the network gives the answer away.
  - H2, infrastructure noise counted as model failure: timeouts, rate limits, dead containers.
  - H3, drift: an image, the grader or the model version changed between nights.
  - H4, correlated outcomes: one machine, one batch or one time of day, so the interval is too narrow.
- **Design (say it as a pipeline):**
  - Images pinned by digest. Task, grader and model versions recorded for every attempt.
  - A fresh container per attempt, built from a fresh `git init` of the base snapshot. Network: the model API plus an allow-listed package proxy only.
  - Timeouts and turn caps are part of the configuration. Hitting one is an outcome, not an error.
  - Infrastructure errors (no reward produced) are logged apart from grades. Only they are retried, under a rule written before the run.
  - Grade in a separate container that holds the hidden tests.
  - Store the diff, transcript, grader version, model version and seed for each attempt. Append only.
  - Isolation scans on every attempt ([Q37](#q37)).
  - Interleave configurations in random order. Budget cost and rate limits per configuration.
  - The report: raw outcomes first, then rates with intervals clustered by task ([Q19](#q19)). 1,000 attempts on 50 tasks is 20 per task, not 1,000 independent samples.
- **Experiment (prove the system before you trust it):** a pilot night with the reference and a do-nothing solution on every task. The reference must score 1 and do-nothing 0 everywhere. Re-grade 50 saved attempts: every reward must match exactly. Check whether outcomes correlate with machine, batch or start time.
- **Change my mind:** a pilot shows outcomes correlated by machine or batch. Then attempts are not independent. I find the shared state before I report any interval.
- **How sure:** "The design closes the leaks and noise sources I can list. Each nightly report states its infrastructure-error count, so a bad night is visible, not hidden in the score."
:::

## Drills {#drills}

:::drill id="defend-two-minute-round" title="Two-minute round: six random questions" time="35 min"
1. Pick six question numbers at random:

   ```bash
   python3 -c "import random; print(sorted(random.sample(range(1, 47), 6)))"
   ```

   Real output (one run on 2026-10-20; yours will differ):

   ```text
   [5, 25, 30, 31, 36, 46]
   ```

2. For each question: 2-minute timer, answer aloud, record.
3. Open the outline. Score 0–5 on the five parts.
4. For your two weakest answers, write the missing part in your own words.

**Done when:** six recorded answers are scored, and your two weakest answers are rewritten in your own words.
:::

:::drill id="defend-the-two-musts" title="The two must-know questions, cold" time="15 min a day, 2–3 days"
1. Answer [Q1](#q1) and [Q9](#q9) aloud from memory, 2 minutes each, recorded.
2. Check: Q1 names both error types and a frame for each. Q9 names four hypotheses and one experiment for each.
3. Repeat on another day without reading the outline first. If you missed a part on either day, do a third day. In the sprint, days 1 and 2 are Oct 30 and 31, and a third day comes after Nov 2.

**Done when:** on two different days you hit all five parts on both questions, each under 2 minutes, without notes.
:::

:::drill id="defend-numbers-by-hand" title="Numbers without a calculator" time="30 min"
1. Without code, estimate these five. Use the [hand rules](#hand-rules):
   - the Wilson interval for 3 of 5;
   - pass@3 and pass^3 at p = 0.75;
   - the upper bound after 0 failures in 30 runs;
   - the runs needed for ±10 points near 50%;
   - whether 4/5 against 2/5 is a real difference.
2. Run `defend_stats.py` from [the numbers section](#numbers). Compare.
3. For each number, say its assumption in one sentence.

**Done when:** every rate and interval is within 5 percentage points of the script, the run count is within 20% of 96, the 4/5-against-2/5 verdict is right, and you can state each assumption aloud.
:::

:::drill id="defend-hostile-followups" title="Survive three 'how do you know?' follow-ups" time="45 min"
Use a friend, or an AI in a chat window as the interviewer. Preparing with AI is allowed. Unless you are told otherwise, GDM's guide says not to use AI tools in live interviews or in interview tasks ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20").

```text
You are interviewing me for a role that builds evaluation tasks and graders
for coding agents. Ask me one question at a time from this list: [paste 5
question titles]. After each answer, ask "How do you know?" or "What would
change your mind?" three times, each time about the weakest part of my last
answer. Do not praise me. At the end, list the moments where I claimed more
than my evidence supports.
```

**Done when:** five questions got three follow-ups each, and each one survived. A question survives when every one of your three replies names a concrete experiment or a limit, without contradicting your earlier answer, and the AI's final list shows no over-claim for it. You also logged every "I don't know" with the experiment that would answer it.
:::

:::drill id="defend-own-words" title="Make the outlines yours (ownership gate prep)" time="60 min"
1. Pick [Q1](#q1), [Q9](#q9), [Q14](#q14), [Q21](#q21) and [Q32](#q32).
2. Rewrite each outline in your own words, with real numbers from your own Chronos validity card and runs ([[capstone]]). Every number gets its frame.
3. Read them aloud once. Cut every sentence you could not defend.

**Done when:** five rewritten answers exist, each cites at least one number you produced yourself with its frame, and none copies a sentence from this page. This prepares item 4 of the ownership gate.
:::

:::tally id="defend-it" title="Questions answered with 4+ parts on two different days"
- Q1 Five wrong patches and a reference
- Q2 False accept vs false reject
- Q3 100% mutant kills
- Q4 Why not reference-based grading
- Q5 Flaky grader, 1 in 50
- Q6 LLM judge
- Q7 Tests pass, correct?
- Q8 Testing the grader itself
- Q9 Gemini solves almost everything
- Q10 0% for every model
- Q11 Difficulty calibration
- Q12 A 20-point jump
- Q13 Model card 78% vs your 40%
- Q14 Sampling frames
- Q15 Why 5 runs are not enough
- Q16 pass@k vs pass^k
- Q17 4/5 vs 2/5
- Q18 How many runs
- Q19 20 tasks x 10 runs
- Q20 0 of 40 accepted
- Q21 Future-invariance vs event-time leakage
- Q22 Why model revisions
- Q23 The boundary rule
- Q24 Is the oracle right
- Q25 Random data vs boundary table
- Q26 Purge and embargo
- Q27 Experts disagree on the spec
- Q28 Partial credit misleads
- Q29 Precise instruction, no giveaway
- Q30 One task vs 1,000
- Q31 Long-horizon vs long
- Q32 Did it read the hidden tests
- Q33 Memorization
- Q34 Grader under RL
- Q35 git log --all
- Q36 Edited a visible test
- Q37 Prove isolation
- Q38 First wrong turn
- Q39 "All tests pass"
- Q40 Weakness or task flaw
- Q41 A family of variants
- Q42 What you did yourself
- Q43 Your weakest part
- Q44 Score up, users say worse
- Q45 Keeping an old task set useful
- Q46 Design a nightly eval system
:::

## Sources

- ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19") [Research Engineer, Polaris posting](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind) — the role (paraphrased).
- ^[confirmed](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf "2026-10-20") [Interviewing at Google DeepMind](https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf) — AI rule for interviews and preparation.
- ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20") [Mechanize: how our interview process works](https://www.mechanize.work/how-our-interview-process-works) and ^[confirmed](https://www.mechanize.work/blog/cheap-rl-tasks-will-waste-compute "2026-10-20") [Cheap RL tasks will waste compute](https://www.mechanize.work/blog/cheap-rl-tasks-will-waste-compute) — Mechanize, not Polaris.
- ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20") [Anthropic: Demystifying evals for AI agents (2026-01-09)](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — 0% means check the task, expert agreement, pass@k and pass^k, partial credit, transcripts.
- ^[confirmed](https://taskdev.metr.org/desiderata/ "2026-10-20") [METR task development guide](https://taskdev.metr.org/desiderata/) — difficulty, scoring, QA runs, LLM judges.
- ^[confirmed](https://metr.org/time-horizons "2026-10-20") [METR time horizons](https://metr.org/time-horizons) — human time as the difficulty scale.
- ^[confirmed](https://metr.org/blog/2025-08-12-research-update-towards-reconciling-slowdown-with-time-horizons "2026-10-20") [METR: algorithmic vs holistic evaluation](https://metr.org/blog/2025-08-12-research-update-towards-reconciling-slowdown-with-time-horizons) and ^[confirmed](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ "2026-10-20") [METR: passing PRs that would not be merged](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/).
- ^[confirmed](https://metr.org/blog/2025-06-05-recent-reward-hacking "2026-10-20") [METR: recent frontier models are reward hacking](https://metr.org/blog/2025-06-05-recent-reward-hacking).
- ^[confirmed](https://arxiv.org/abs/2506.09289 "2026-10-20") [UTBoost](https://arxiv.org/abs/2506.09289) and ^[confirmed](https://arxiv.org/abs/2503.15223 "2026-10-20") [PatchDiff](https://arxiv.org/abs/2503.15223) — weak tests accept wrong patches.
- ^[reported](https://openai.com/index/introducing-swe-bench-verified/ "2026-10-20") [OpenAI: Introducing SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/) and ^[reported](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/ "2026-10-20") [OpenAI: Why we no longer evaluate SWE-bench Verified](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/) — pages blocked direct fetch; details from excerpts and coverage.
- ^[confirmed](https://epoch.ai/blog/what-skills-does-swe-bench-verified-evaluate "2026-10-20") [Epoch: what SWE-bench Verified measures](https://epoch.ai/blog/what-skills-does-swe-bench-verified-evaluate), ^[confirmed](https://epoch.ai/benchmarks/swe-bench-pro/review "2026-10-20") [Epoch: SWE-Bench Pro review](https://epoch.ai/benchmarks/swe-bench-pro/review) and ^[confirmed](https://epoch.ai/benchmarks/terminal-bench-4/review "2026-10-20") [Epoch: Terminal-Bench 4.0 review (2026-09-04)](https://epoch.ai/benchmarks/terminal-bench-4/review).
- ^[confirmed](https://arxiv.org/html/2509.16941 "2026-10-20") [SWE-Bench Pro paper](https://arxiv.org/html/2509.16941) — spec drives difficulty; flaky tasks dropped.
- ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20") [Terminal-Bench 2.0 paper](https://arxiv.org/html/2601.11868) and ^[confirmed](https://www.tbench.ai/news/terminal-bench-4-0 "2026-10-20") [Terminal-Bench 4.0 post](https://www.tbench.ai/news/terminal-bench-4-0) — checklist, exploit agent, saturation, flaky fixes.
- ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20") [DeepSWE](https://deepswe.datacurve.ai/blog/deepswe) — behavioral prompts and verifiers; reference used only for review.
- ^[confirmed](https://github.com/Proximal-Labs/frontier-swe "2026-10-20") [FrontierSWE](https://github.com/Proximal-Labs/frontier-swe) — continuous scoring; flagged trials set to 0.
- ^[confirmed](https://arxiv.org/html/2507.02825v5 "2026-10-20") [Agentic Benchmark Checklist (ABC)](https://arxiv.org/html/2507.02825v5) — fuzzing that misses shapes; isolation from answers.
- ^[confirmed](https://poolside.ai/blog/through-the-looking-glass "2026-10-20") [Poolside: Through the looking glass of benchmark hacking](https://poolside.ai/blog/through-the-looking-glass) — the 20-point jump from git history.
- ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20") [Cursor: reward hacking is swamping model intelligence gains](https://cursor.com/blog/reward-hacking-coding-benchmarks) — strict harness, blinded auditor.
- ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20") [SWE-bench issue #465](https://github.com/SWE-bench/SWE-bench/issues/465) and ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20") [Ludwig et al., Shortcutting the Fix](https://arxiv.org/abs/2609.06780) — git-history and upstream shortcuts.
- ^[confirmed](https://arxiv.org/abs/2506.12286 "2026-10-20") [The SWE-Bench Illusion](https://arxiv.org/abs/2506.12286), ^[confirmed](https://arxiv.org/abs/2403.07974 "2026-10-20") [LiveCodeBench](https://arxiv.org/abs/2403.07974) and ^[reported](https://arxiv.org/abs/2505.23419 "2026-10-20") [SWE-bench-Live](https://arxiv.org/abs/2505.23419) — memorization and fresh tasks.
- ^[confirmed](https://www.alignment.org/canary/ "2026-10-20") [ARC: Evaluations canary (2022-10-13)](https://www.alignment.org/canary/).
- ^[confirmed](https://www.anthropic.com/research/emergent-misalignment-reward-hacking "2026-10-20") [Anthropic: emergent misalignment from reward hacking](https://www.anthropic.com/research/emergent-misalignment-reward-hacking), ^[confirmed](https://www.anthropic.com/claude-3-7-sonnet-system-card "2026-10-20") [Claude 3.7 Sonnet system card](https://www.anthropic.com/claude-3-7-sonnet-system-card), ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20") [ImpossibleBench](https://arxiv.org/abs/2510.20270), ^[confirmed](https://arxiv.org/abs/2511.21654 "2026-10-20") [EvilGenie](https://arxiv.org/abs/2511.21654) and ^[confirmed](https://arxiv.org/abs/2605.21384 "2026-10-20") [SpecBench](https://arxiv.org/abs/2605.21384) — reward hacking and held-out tests.
- ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20") [Transluce: coding agent misalignment in the wild](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1) — one public dataset, LLM-judged.
- ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20") [Liu et al., failures in automated issue solving](https://arxiv.org/abs/2509.13941) and ^[confirmed](https://arxiv.org/abs/2511.00197 "2026-10-20") [Majgaonkar et al.](https://arxiv.org/abs/2511.00197) — failure phases.
- ^[confirmed](https://arxiv.org/abs/2305.01210 "2026-10-20") [EvalPlus](https://arxiv.org/abs/2305.01210), ^[confirmed](https://arxiv.org/abs/2102.11378 "2026-10-20") [Google: practical mutation testing at scale](https://arxiv.org/abs/2102.11378) and ^[confirmed](https://people.cs.umass.edu/~rjust/publ/mutants_real_faults_fse_2014.pdf "2026-10-20") [Just et al. 2014, are mutants a valid substitute for real faults?](https://people.cs.umass.edu/~rjust/publ/mutants_real_faults_fse_2014.pdf).
- ^[confirmed](https://arxiv.org/abs/2306.05685 "2026-10-20") [Zheng et al., Judging LLM-as-a-Judge](https://arxiv.org/abs/2306.05685) — judge biases.
- ^[confirmed](https://deepmind.google/models/model-cards/gemini-4-argon/ "2026-10-20") [Gemini 4 Argon model card (2026-10-13)](https://deepmind.google/models/model-cards/gemini-4-argon/) — the 77.9% DeepSWE v1.1 score. ^[confirmed](https://deepmind.google/models/evals-methodology/gemini-4-argon "2026-10-20") [Gemini 4 Argon evaluation methodology](https://deepmind.google/models/evals-methodology/gemini-4-argon) (redirects to a PDF) — pass@1, no majority voting, trials averaged for smaller benchmarks, DeepSWE self-computed with a mini-swe-agent harness.
- ^[confirmed](https://arxiv.org/abs/2107.03374 "2026-10-20") [Chen et al. 2021, Evaluating LLMs trained on code](https://arxiv.org/abs/2107.03374) — unbiased pass@k (section 2.1, read 2026-10-20).
- ^[confirmed](https://arxiv.org/abs/2406.12045 "2026-10-20") [Yao et al. 2024, τ-bench](https://arxiv.org/abs/2406.12045) — pass^k.
- ^[confirmed](https://arxiv.org/abs/2411.00640 "2026-10-20") [Miller 2024, Adding error bars to evals](https://arxiv.org/abs/2411.00640) — clustered errors, paired differences, planning.
- ^[confirmed](https://doi.org/10.1214/ss/1009213286 "2026-10-20") [Brown, Cai and DasGupta 2001, Interval estimation for a binomial proportion](https://doi.org/10.1214/ss/1009213286) — Wilson for small n (abstract checked).
- ^[reported](https://www.kth.se/social/files/564df871f2765419e306178d/KnightLeveson.pdf "2026-10-20") [Knight and Leveson 1986 (course summary that quotes the abstract)](https://www.kth.se/social/files/564df871f2765419e306178d/KnightLeveson.pdf) — independent versions fail together. The paper itself was not read.
- ^[confirmed](https://alfred.stlouisfed.org/ "2026-10-20") [ALFRED, St. Louis Fed](https://alfred.stlouisfed.org/) — vintages of economic data.
- ^[reported](https://www.quantt.co.uk/resources/purged-cross-validation "2026-10-20") [Quantt: purged cross-validation](https://www.quantt.co.uk/resources/purged-cross-validation) and ^[reported](https://skfolio.org/generated/skfolio.model_selection.CombinatorialPurgedCV.html "2026-10-20") [skfolio: CombinatorialPurgedCV docs](https://skfolio.org/generated/skfolio.model_selection.CombinatorialPurgedCV.html) — purging and embargo from López de Prado's *Advances in Financial Machine Learning* (2018), chapter 7. The book was not read.
- ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20") [Claude Code best practices](https://code.claude.com/docs/en/best-practices) and ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20") [Antigravity CLI headless mode](https://antigravity.google/docs/cli/headless/) — ask for evidence; read `status` (docs read, not run).
- ^[inference](- "2026-10-20") `defend_stats.py`, `time_rules.py`, `leak_literals.py` and `iso_demo.zsh` were run on 2026-10-20 on an arm64 Mac with Python 3.13.9, ripgrep 15.2.0, git 2.55.0 and zsh (`iso_demo.zsh` also in bash). The leak and isolation demos used synthetic files. The Fisher and Wilson values were cross-checked with SciPy 1.16.2 (`fisher_exact`, `binomtest(...).proportion_ci(method="wilson")`).

:::check
- Answer Q1 aloud in 2 minutes, with both error types and a sampling frame for each.
- Answer Q9 aloud in 2 minutes, with one experiment for each of the four hypotheses.
- Explain why 4/5 against 2/5 can't show a difference, and plan how many runs you would use instead.
- State future-invariance precisely, and give one example of data it does not cover.
- Name three checks that verify solver isolation, and what none of them can catch.
- Say the weakest part of your own capstone before anyone asks.
:::
