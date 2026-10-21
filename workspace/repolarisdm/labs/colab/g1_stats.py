"""G1 statistics: pass@k, pass^k, Wilson intervals, a cluster bootstrap and a
single-run simulation. Stdlib only.

Sampling frames (say them out loud when you report a number):
- One problem: n samples from one model + one prompt + one temperature on one
  problem. The samples are independent draws, so a Wilson interval for c/n
  is fair for that problem's pass rate.
- The mean over problems: samples of the same problem are correlated, so the
  interval resamples problems (a cluster bootstrap), then samples within each
  problem. It treats the problems as if they were drawn at random from a
  population of similar problems. Ours were hand-picked, so read the
  interval as "how much the result depends on which problems we picked".
- A difference between two temperatures: both use the same problems, so the
  interval resamples problems once for both (a paired cluster bootstrap).
  Never judge a difference by whether two separate intervals overlap.
"""

from __future__ import annotations

import json
import math
import random
from collections import defaultdict

Z95 = 1.959963984540054  # two-sided 95% normal quantile


def _check(n: int, c: int, k: int) -> None:
    if not 0 <= c <= n:
        raise ValueError(f"need 0 <= c <= n, got c={c}, n={n}")
    if not 1 <= k <= n:
        raise ValueError(f"need 1 <= k <= n, got k={k}, n={n}")


def pass_at_k(n: int, c: int, k: int) -> float:
    """Unbiased pass@k (Chen et al. 2021): P(at least one of k samples passes).

    Equals 1 - C(n-c, k) / C(n, k), computed in the stable product form.
    """
    _check(n, c, k)
    if n - c < k:
        return 1.0
    product = 1.0
    for i in range(n - c + 1, n + 1):
        product *= 1.0 - k / i
    return 1.0 - product


def pass_hat_k(n: int, c: int, k: int) -> float:
    """Unbiased pass^k (tau-bench): P(all k samples pass) = C(c, k) / C(n, k)."""
    _check(n, c, k)
    return math.comb(c, k) / math.comb(n, k)


def wilson(c: int, n: int, z: float = Z95) -> tuple[float, float]:
    """Wilson score interval for c successes in n independent trials."""
    if n <= 0 or not 0 <= c <= n:
        raise ValueError(f"need n > 0 and 0 <= c <= n, got c={c}, n={n}")
    p = c / n
    denom = 1.0 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)


def percentile(sorted_values: list[float], q: float) -> float:
    """Linear-interpolation percentile of an already sorted list (q in 0..100)."""
    if not sorted_values:
        raise ValueError("no values")
    pos = (len(sorted_values) - 1) * q / 100.0
    lo = math.floor(pos)
    hi = min(lo + 1, len(sorted_values) - 1)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo)


def counts_by_temperature(graded: list[dict]) -> dict[float, dict[str, tuple[int, int]]]:
    """Group graded samples into {temperature: {task_id: (n, c)}}."""
    n = defaultdict(int)
    c = defaultdict(int)
    for record in graded:
        key = (float(record["temperature"]), record["task_id"])
        n[key] += 1
        c[key] += bool(record["passed"])
    out: dict[float, dict[str, tuple[int, int]]] = defaultdict(dict)
    for (temperature, task_id) in sorted(n):
        out[temperature][task_id] = (n[(temperature, task_id)], c[(temperature, task_id)])
    return dict(out)


def _metric_functions(ks, hat_ks, n_min: int) -> dict:
    fns = {}
    for k in ks:
        if k <= n_min:
            fns[f"pass@{k}"] = lambda n, c, k=k: pass_at_k(n, c, k)
    for k in hat_ks:
        if k <= n_min:
            fns[f"pass^{k}"] = lambda n, c, k=k: pass_hat_k(n, c, k)
    return fns


def _binomial(rng: random.Random, n: int, p: float) -> int:
    if p <= 0.0:
        return 0
    if p >= 1.0:
        return n
    return sum(rng.random() < p for _ in range(n))


def cluster_bootstrap(counts: list[tuple[int, int]], metric_fns: dict, draws: int = 2000,
                      seed: int = 0, within: bool = True) -> dict[str, tuple[float, float]]:
    """Percentile 95% intervals for the mean of each metric over problems.

    Each draw resamples problems with replacement. With within=True it then
    redraws each problem's pass count from Binomial(n, c/n), so the noise of
    the 50 samples is included too. A problem with c = 0 or c = n gets no
    within-problem noise this way, so the interval can be a little too narrow.
    """
    rng = random.Random(seed)
    cache: dict[tuple[str, int, int], float] = {}

    def value(name: str, n: int, c: int) -> float:
        key = (name, n, c)
        if key not in cache:
            cache[key] = metric_fns[name](n, c)
        return cache[key]

    size = len(counts)
    samples = {name: [] for name in metric_fns}
    for _ in range(draws):
        picked = [counts[rng.randrange(size)] for _ in range(size)]
        if within:
            picked = [(n, _binomial(rng, n, c / n)) for n, c in picked]
        for name in metric_fns:
            samples[name].append(sum(value(name, n, c) for n, c in picked) / size)
    return {name: (percentile(sorted(v), 2.5), percentile(sorted(v), 97.5))
            for name, v in samples.items()}


def summarize(graded: list[dict], ks=(1, 5, 10), hat_ks=(5, 10), bootstrap: int = 2000,
              seed: int = 0, within: bool = True) -> dict:
    """Per-temperature and per-problem results with intervals."""
    counts = counts_by_temperature(graded)
    models = sorted({str(r.get("model_id", "?")) for r in graded})
    summary = {
        "temperatures": sorted(counts),
        "models": models,
        "ks": list(ks),
        "hat_ks": list(hat_ks),
        "bootstrap": bootstrap,
        "seed": seed,
        "within": within,
        "by_temperature": {},
    }
    for temperature in summary["temperatures"]:
        per = counts[temperature]
        pairs = list(per.values())
        n_min = min(n for n, _ in pairs)
        fns = _metric_functions(ks, hat_ks, n_min)
        intervals = cluster_bootstrap(pairs, fns, bootstrap, seed, within)
        metrics = {}
        for name, fn in fns.items():
            estimate = sum(fn(n, c) for n, c in pairs) / len(pairs)
            lo, hi = intervals[name]
            metrics[name] = {"estimate": estimate, "lo": lo, "hi": hi}
        per_problem = {}
        for task_id, (n, c) in per.items():
            lo, hi = wilson(c, n)
            row = {"n": n, "c": c, "rate": c / n, "wilson": (lo, hi)}
            row.update({name: fn(n, c) for name, fn in fns.items()})
            per_problem[task_id] = row
        summary["by_temperature"][temperature] = {
            "problems": len(pairs),
            "samples": sum(n for n, _ in pairs),
            "n_min": n_min,
            "n_max": max(n for n, _ in pairs),
            "metrics": metrics,
            "never_solved": sum(c == 0 for _, c in pairs),
            "always_solved": sum(c == n for n, c in pairs),
            "per_problem": per_problem,
        }
    return summary


def paired_difference(per_a: dict, per_b: dict, metric_fn, draws: int = 2000, seed: int = 0,
                      within: bool = True) -> dict:
    """Mean over the SAME problems of metric(B) - metric(A), with a paired cluster bootstrap.

    per_a and per_b map task_id -> (n, c). Each draw resamples problems once, for both
    temperatures together, then (with within=True) redraws each pass count from Binomial(n, c/n).
    Do not compare two separate intervals instead: both temperatures use the same problems, so
    most of the spread (easy vs hard problems) is shared and cancels in the difference. Two
    intervals can overlap while the paired difference is clearly above 0.
    """
    common = sorted(set(per_a) & set(per_b))
    if not common:
        raise ValueError("no problem appears at both temperatures")

    def diff(tid: str, ca: int, cb: int) -> float:
        return metric_fn(per_b[tid][0], cb) - metric_fn(per_a[tid][0], ca)

    estimate = sum(diff(t, per_a[t][1], per_b[t][1]) for t in common) / len(common)
    rng = random.Random(seed)
    size = len(common)
    values = []
    for _ in range(draws):
        total = 0.0
        for _ in range(size):
            tid = common[rng.randrange(size)]
            (na, ca), (nb, cb) = per_a[tid], per_b[tid]
            if within:
                ca, cb = _binomial(rng, na, ca / na), _binomial(rng, nb, cb / nb)
            total += diff(tid, ca, cb)
        values.append(total / size)
    values.sort()
    return {"estimate": estimate, "lo": percentile(values, 2.5), "hi": percentile(values, 97.5),
            "problems": size}


def compare_temperatures(summary: dict, metrics=("pass@1", "pass@10"), draws: int = 2000,
                         seed: int = 0) -> list[dict]:
    """Paired differences for every pair of temperatures (B minus A, B the higher temperature)."""
    temps = summary["temperatures"]
    rows = []
    for i, a in enumerate(temps):
        for b in temps[i + 1:]:
            per = {t: {tid: (p["n"], p["c"]) for tid, p in summary["by_temperature"][t]["per_problem"].items()}
                   for t in (a, b)}
            n_min = min(n for t in (a, b) for n, _ in per[t].values())
            fns = _metric_functions(summary["ks"], summary["hat_ks"], n_min)
            for name in metrics:
                if name in fns:
                    result = paired_difference(per[a], per[b], fns[name], draws, seed, summary["within"])
                    rows.append({"a": a, "b": b, "metric": name, **result})
    return rows


def single_run_study(summary: dict, runs: int = 2000, seed: int = 0) -> dict:
    """What would ONE run (one sample per problem) have reported?

    For each simulated run, each problem passes with its measured rate c/n.
    The run's score is the fraction of problems that passed. For each pair of
    temperatures, count how often a single run puts them in the opposite order
    from the 50-sample estimates, and how often it shows a tie.
    """
    rng = random.Random(seed)
    temps = summary["temperatures"]
    scores = {}
    for t in temps:
        rates = [row["rate"] for row in summary["by_temperature"][t]["per_problem"].values()]
        scores[t] = [sum(rng.random() < p for p in rates) / len(rates) for _ in range(runs)]
    spread = {}
    for t in temps:
        ordered = sorted(scores[t])
        spread[t] = {
            "estimate": summary["by_temperature"][t]["metrics"]["pass@1"]["estimate"],
            "min": ordered[0], "p5": percentile(ordered, 5), "p50": percentile(ordered, 50),
            "p95": percentile(ordered, 95), "max": ordered[-1],
        }
    pairs = []
    for i, a in enumerate(temps):
        for b in temps[i + 1:]:
            full = spread[a]["estimate"] - spread[b]["estimate"]
            wrong = tie = 0
            for sa, sb in zip(scores[a], scores[b]):
                if sa == sb:
                    tie += 1
                elif (sa - sb) * full < 0:
                    wrong += 1
            pairs.append({"a": a, "b": b, "full_difference": full,
                          "wrong_order": wrong / runs, "tie": tie / runs})
    return {"runs": runs, "seed": seed, "scores": scores, "spread": spread, "pairs": pairs}


def subsample(graded: list[dict], keep: int) -> list[dict]:
    """Keep only the first `keep` samples of every problem and temperature."""
    return [r for r in graded if int(r["sample_index"]) < keep]


def _jsonable(value):
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def save_summary(summary: dict, path: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(_jsonable(summary), fh, indent=1)
