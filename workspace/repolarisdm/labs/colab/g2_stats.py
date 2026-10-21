"""G2 helper: pass@k, pass^k, Wilson and bootstrap intervals. Standard library only.

pass@k  = chance that at least one of k attempts succeeds (Chen et al. 2021, arXiv 2107.03374).
pass^k  = chance that all k attempts succeed (tau-bench, Yao et al., arXiv 2406.12045).
For one task with n attempts and c successes, the unbiased estimates are
    pass@k = 1 - C(n-c, k) / C(n, k)        pass^k = C(c, k) / C(n, k)

Sampling assumption (say it every time you report a number): the n attempts are
independent draws from ONE configuration (model, revision, prompt, temperature, turn limit)
on ONE task. The intervals say nothing about other tasks, prompts or models.
"""
from __future__ import annotations

import math
import random
from math import comb


def _check(n, c, k):
    if not (0 <= c <= n) or not (1 <= k <= n):
        raise ValueError(f"need 0 <= c <= n and 1 <= k <= n, got n={n}, c={c}, k={k}")


def pass_at_k(n, c, k):
    """Unbiased pass@k, in the numerically stable product form of OpenAI's human-eval code."""
    _check(n, c, k)
    if n - c < k:
        return 1.0
    prod = 1.0
    for i in range(n - c + 1, n + 1):
        prod *= 1.0 - k / i
    return 1.0 - prod


def pass_hat_k(n, c, k):
    """Unbiased pass^k: C(c, k) / C(n, k)."""
    _check(n, c, k)
    return comb(c, k) / comb(n, k)


def wilson(x, n, z=1.96):
    """Wilson score interval for a binomial proportion x/n (95% by default)."""
    if n <= 0 or not 0 <= x <= n:
        raise ValueError(f"need n > 0 and 0 <= x <= n, got x={x}, n={n}")
    p = x / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    lo = 0.0 if x == 0 else max(0.0, center - half)
    hi = 1.0 if x == n else min(1.0, center + half)
    return lo, hi


def wilson_mapped(x, n, k, z=1.96):
    """95% intervals for pass@k and pass^k from the Wilson interval [lo, hi] of p.

    Under i.i.d. attempts, pass@k = 1-(1-p)^k and pass^k = p^k are increasing in p,
    so mapping the endpoints keeps the coverage of the Wilson interval.
    """
    lo, hi = wilson(x, n, z)
    return (1 - (1 - lo) ** k, 1 - (1 - hi) ** k), (lo ** k, hi ** k)


def bootstrap(outcomes, k, *, reps=2000, seed=0, level=0.95):
    """Percentile bootstrap over attempts for pass@k and pass^k. A cross-check, not the main interval.

    With few successes the bootstrap is too narrow (resamples of 0/n are all 0); trust Wilson there.
    """
    rng = random.Random(seed)
    n = len(outcomes)
    at, hat = [], []
    for _ in range(reps):
        c = sum(outcomes[rng.randrange(n)] for _ in range(n))
        at.append(pass_at_k(n, c, k))
        hat.append(pass_hat_k(n, c, k))
    lo_i, hi_i = int((1 - level) / 2 * reps), int((1 + level) / 2 * reps) - 1
    at.sort()
    hat.sort()
    return (at[lo_i], at[hi_i]), (hat[lo_i], hat[hi_i])


def results_table(outcomes, ks=(1, 2, 5, 10, 20), reps=2000, seed=0):
    """Rows for every k <= n/2: point estimates, Wilson-mapped intervals, bootstrap intervals.

    Rows with k close to n say little: at k = n, pass^k is 1 or 0 by construction. So k stops at n/2.
    Two point estimates for pass^k: the unbiased C(c,k)/C(n,k), and the plug-in p_hat^k with
    p_hat = c/n. The Wilson-mapped interval is built around the plug-in, so the plug-in always lies
    inside it. The unbiased estimate can fall below it: with c < k it is exactly 0.
    """
    outcomes = [bool(o) for o in outcomes]
    n, c = len(outcomes), sum(outcomes)
    rows = []
    for k in [k for k in ks if 1 <= k and (k == 1 or 2 * k <= n)]:
        (a_lo, a_hi), (h_lo, h_hi) = wilson_mapped(c, n, k)
        (ba_lo, ba_hi), (bh_lo, bh_hi) = bootstrap(outcomes, k, reps=reps, seed=seed)
        rows.append({"k": k, "n": n, "c": c,
                     "pass@k": pass_at_k(n, c, k), "pass@k_ci": (a_lo, a_hi), "pass@k_boot": (ba_lo, ba_hi),
                     "pass^k": pass_hat_k(n, c, k), "pass^k_plugin": (c / n) ** k,
                     "pass^k_ci": (h_lo, h_hi), "pass^k_boot": (bh_lo, bh_hi)})
    return rows


def frame_line(n, config, invalid=0):
    custody = (f" Sandbox users: {'on' if config.get('sandbox') else 'OFF'}; network for model code: "
               f"{'blocked' if config.get('network_blocked') else 'NOT blocked'}.")
    return (f"Frame: {n} valid attempts ({invalid} invalid, not counted), one configuration "
            f"({config.get('model_id')} @ {str(config.get('revision'))[:12]}, backend {config.get('backend')}, "
            f"temperature {config.get('temperature')}, top_p {config.get('top_p')}, top_k off, "
            f"{config.get('max_turns')} turns), one task ({config.get('task')}). Attempts treated as "
            f"independent. Intervals: Wilson 95% on the per-attempt success rate, mapped to pass@k and "
            f"pass^k. They do not cover other tasks." + custody)


def markdown_table(rows, grader):
    if not rows:
        return f"Grader: {grader}. No valid attempts yet.\n"

    def iv(pair):
        return f"[{pair[0]:.3f}, {pair[1]:.3f}]"
    head = (f"Grader: {grader}. Successes: {rows[0]['c']} of {rows[0]['n']}.\n\n"
            "| k | pass@k | 95% CI (Wilson) | bootstrap | pass^k (unbiased) | pass^k (plug-in) "
            "| 95% CI (Wilson) | bootstrap |\n"
            "|---|---|---|---|---|---|---|---|\n")
    body = "".join(f"| {r['k']} | {r['pass@k']:.3f} | {iv(r['pass@k_ci'])} | {iv(r['pass@k_boot'])} | "
                   f"{r['pass^k']:.4f} | {r['pass^k_plugin']:.4f} | {iv(r['pass^k_ci'])} | "
                   f"{iv(r['pass^k_boot'])} |\n" for r in rows)
    note = ("\nk stops at n/2. The pass^k interval is built around the plug-in estimate (c/n)^k. "
            "The unbiased estimate C(c,k)/C(n,k) can fall below it, and is 0 whenever c < k.\n")
    return head + body + note


def agreement(rows, a="weak", b="strong"):
    """2x2 counts of two graders' verdicts on the same attempts."""
    table = {"both pass": 0, f"only {a} passes": 0, f"only {b} passes": 0, "both fail": 0}
    for row in rows:
        pa, pb = row["passed"][a], row["passed"][b]
        key = "both pass" if pa and pb else f"only {a} passes" if pa else f"only {b} passes" if pb else "both fail"
        table[key] += 1
    return table


def sample_size_for_width(p, width, z=1.96):
    """Attempts needed so a normal-approximation 95% interval has the given total width."""
    return math.ceil((2 * z) ** 2 * p * (1 - p) / width ** 2)
