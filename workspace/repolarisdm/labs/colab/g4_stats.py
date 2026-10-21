"""Scores and statistics for the G4 contamination probe. Standard library only.

Sign convention: every score here is "higher = more likely seen". So an AUC above
0.5 means the seen-likely texts tend to score higher than the other set.

- min_k_percent: Min-K% Prob (Shi et al., arXiv 2310.16789): the mean log-probability
  of the k% lowest-probability tokens. The paper's reference code stores the negative
  of this value (there, lower = member); we keep the plain mean, so higher = member.
- mean_logprob: the plain average (the loss baseline; k = 100%).
- zlib_ratio: mean log-prob divided by the zlib-compressed size in bytes. This is the
  zlib baseline of the reference code with the sign flipped to our convention.
- auroc, roc_points, tpr_at_fpr: ROC statistics with ties counted as one half.
- bootstrap_auc_ci: percentile bootstrap that resamples each set separately.
"""

from __future__ import annotations

import json
import math
import random
import re
import uuid
import zlib

KS = (0.05, 0.10, 0.20, 0.30, 0.50)
SCORE_KEYS = tuple(f"mink_{round(k * 100)}" for k in KS) + ("mean_logprob", "zlib_ratio")
SCORE_LABELS = {
    "mink_20": "Min-20% score (mean log-prob of the lowest 20% of tokens)",
    "mean_logprob": "mean log-prob of all tokens",
    "zlib_ratio": "mean log-prob / zlib bytes",
}

# Each comparison: pos = the seen-likely side, neg = the other side.
# A selector picks records by domain and arm; matched=True keeps only the matched set.
COMPARISONS = [
    dict(name="HumanEval/0-19 vs fresh (primary)", roc=True,
         pos=dict(domain="humaneval", arm="seen", matched=True), neg=dict(domain="humaneval", arm="fresh")),
    dict(name="HumanEval all 164 vs fresh", roc=False,
         pos=dict(domain="humaneval", arm="seen"), neg=dict(domain="humaneval", arm="fresh")),
    dict(name="HumanEval paraphrase vs fresh", roc=True,
         pos=dict(domain="humaneval", arm="paraphrase"), neg=dict(domain="humaneval", arm="fresh")),
    dict(name="HumanEval/0-19 vs its paraphrase", roc=False,
         pos=dict(domain="humaneval", arm="seen", matched=True), neg=dict(domain="humaneval", arm="paraphrase")),
    dict(name="famous prose vs fresh prose", roc=True,
         pos=dict(domain="prose", arm="seen"), neg=dict(domain="prose", arm="fresh")),
    dict(name="prose paraphrase vs fresh prose", roc=False,
         pos=dict(domain="prose", arm="paraphrase"), neg=dict(domain="prose", arm="fresh")),
    dict(name="famous prose vs its paraphrase", roc=False,
         pos=dict(domain="prose", arm="seen"), neg=dict(domain="prose", arm="paraphrase")),
    dict(name="stdlib code vs fresh code", roc=True,
         pos=dict(domain="code", arm="seen"), neg=dict(domain="code", arm="fresh")),
    dict(name="renamed stdlib vs renamed fresh code", roc=False,
         pos=dict(domain="code", arm="paraphrase"), neg=dict(domain="code", arm="fresh_paraphrase")),
    dict(name="stdlib code vs renamed stdlib", roc=False,
         pos=dict(domain="code", arm="seen"), neg=dict(domain="code", arm="paraphrase")),
]
PRIMARY = COMPARISONS[0]


# ---------------------------------------------------------------------------
# Scores
# ---------------------------------------------------------------------------

def _check_logprobs(logprobs) -> list[float]:
    values = [float(x) for x in logprobs]
    if not values:
        raise ValueError("no token log-probs (empty text?)")
    if any(math.isnan(x) for x in values):
        raise ValueError("NaN log-prob: load the model in float32 and try again")
    return values


def min_k_percent(logprobs, k: float = 0.20) -> float:
    """Mean of the k fraction of lowest token log-probs. Higher = more likely seen.

    The reference code takes int(n * k) tokens. For short texts that can be 0, so we
    take at least one token.
    """
    if not 0 < k <= 1:
        raise ValueError("k must be in (0, 1]")
    values = sorted(_check_logprobs(logprobs))
    m = max(1, int(len(values) * k))
    return sum(values[:m]) / m


def mean_logprob(logprobs) -> float:
    values = _check_logprobs(logprobs)
    return sum(values) / len(values)


def zlib_bytes(text: str) -> int:
    return len(zlib.compress(text.encode("utf-8")))


def zlib_ratio(logprobs, text_zlib_bytes: int) -> float:
    return mean_logprob(logprobs) / text_zlib_bytes


def add_scores(records: list[dict]) -> list[dict]:
    """Add every score in SCORE_KEYS to each record (in place) and return the list."""
    for r in records:
        lp = r["logprobs"]
        for k in KS:
            r[f"mink_{round(k * 100)}"] = min_k_percent(lp, k)
        r["mean_logprob"] = mean_logprob(lp)
        r["zlib_ratio"] = zlib_ratio(lp, r["zlib_bytes"])
    return records


# ---------------------------------------------------------------------------
# ROC statistics
# ---------------------------------------------------------------------------

def auroc(pos, neg) -> float:
    """Area under the ROC curve = P(pos score > neg score) + 0.5 * P(tie).

    Computed from ranks (Mann-Whitney U), with average ranks for ties.
    """
    pos, neg = list(pos), list(neg)
    if not pos or not neg:
        raise ValueError("auroc needs at least one score on each side")
    combined = sorted([(s, 1) for s in pos] + [(s, 0) for s in neg])
    rank_sum_pos = 0.0
    i = 0
    while i < len(combined):
        j = i
        while j + 1 < len(combined) and combined[j + 1][0] == combined[i][0]:
            j += 1
        average_rank = (i + j) / 2 + 1          # ranks start at 1
        rank_sum_pos += average_rank * sum(flag for _, flag in combined[i:j + 1])
        i = j + 1
    n_pos, n_neg = len(pos), len(neg)
    u = rank_sum_pos - n_pos * (n_pos + 1) / 2
    return u / (n_pos * n_neg)


def roc_points(pos, neg) -> tuple[list[float], list[float]]:
    """ROC curve as (fpr list, tpr list), from (0, 0) to (1, 1).

    A text counts as 'flagged seen' when its score >= the threshold.
    """
    pos, neg = list(pos), list(neg)
    thresholds = sorted(set(pos) | set(neg), reverse=True)
    fpr, tpr = [0.0], [0.0]
    for t in thresholds:
        fpr.append(sum(s >= t for s in neg) / len(neg))
        tpr.append(sum(s >= t for s in pos) / len(pos))
    return fpr, tpr


def trapezoid_area(xs, ys) -> float:
    return sum((xs[i] - xs[i - 1]) * (ys[i] + ys[i - 1]) / 2 for i in range(1, len(xs)))


def tpr_at_fpr(pos, neg, max_fpr: float = 0.05) -> float:
    """Best true-positive rate among thresholds whose false-positive rate is <= max_fpr."""
    fpr, tpr = roc_points(pos, neg)
    return max(t for f, t in zip(fpr, tpr) if f <= max_fpr + 1e-12)


def _quantile(sorted_values, q: float) -> float:
    """Linear interpolation between order statistics (numpy's default method)."""
    pos = q * (len(sorted_values) - 1)
    lo, hi = math.floor(pos), math.ceil(pos)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo)


def bootstrap_auc_ci(pos, neg, n_boot: int = 2000, level: float = 0.95, seed: int = 0):
    """Percentile bootstrap interval for the AUC.

    Each resample draws len(pos) texts from pos and len(neg) texts from neg, with
    replacement. Assumption: each set behaves like a random sample from a larger
    pool of similar texts. Hand-picked sets do not meet this; say so when you report it.
    """
    pos, neg = list(pos), list(neg)
    rng = random.Random(seed)
    stats = []
    for _ in range(n_boot):
        p = [pos[rng.randrange(len(pos))] for _ in pos]
        q = [neg[rng.randrange(len(neg))] for _ in neg]
        stats.append(auroc(p, q))
    stats.sort()
    alpha = (1 - level) / 2
    return _quantile(stats, alpha), _quantile(stats, 1 - alpha)


def bootstrap_mean_ci(values, n_boot: int = 2000, level: float = 0.95, seed: int = 0):
    values = list(values)
    rng = random.Random(seed)
    stats = sorted(sum(values[rng.randrange(len(values))] for _ in values) / len(values)
                   for _ in range(n_boot))
    alpha = (1 - level) / 2
    return _quantile(stats, alpha), _quantile(stats, 1 - alpha)


def median(values) -> float:
    values = sorted(values)
    return _quantile(values, 0.5)


# ---------------------------------------------------------------------------
# Comparisons over scored records
# ---------------------------------------------------------------------------

def select(records: list[dict], sel: dict) -> list[dict]:
    return [r for r in records
            if r["domain"] == sel["domain"] and r["arm"] == sel["arm"]
            and (not sel.get("matched") or r["matched"])]


def compare(records: list[dict], comparison: dict, key: str = "mink_20",
            n_boot: int = 2000, seed: int = 0) -> dict:
    """AUC, bootstrap interval, TPR at 5% FPR, and a length-only AUC for one comparison."""
    pos_r, neg_r = select(records, comparison["pos"]), select(records, comparison["neg"])
    models = sorted({r["model"] for r in pos_r + neg_r})
    row = dict(name=comparison["name"], key=key, model=",".join(models),
               n_pos=len(pos_r), n_neg=len(neg_r), auc=None, ci=None, tpr5=None, len_auc=None)
    if not pos_r or not neg_r:
        return row
    pos, neg = [r[key] for r in pos_r], [r[key] for r in neg_r]
    row["auc"] = auroc(pos, neg)
    row["ci"] = bootstrap_auc_ci(pos, neg, n_boot=n_boot, seed=seed) if n_boot else None
    row["tpr5"] = tpr_at_fpr(pos, neg, 0.05)
    # Length alone as a "detector". Far from 0.5 in either direction = the sets differ in length.
    row["len_auc"] = auroc([r["n_tokens"] for r in pos_r], [r["n_tokens"] for r in neg_r])
    return row


def format_row(row: dict) -> str:
    if row["auc"] is None:
        return f"{row['name']}: no texts on one side (n_pos={row['n_pos']}, n_neg={row['n_neg']})"
    ci = f"[{row['ci'][0]:.2f}, {row['ci'][1]:.2f}]" if row["ci"] else "[no bootstrap]"
    return (f"{row['name']}: AUC {row['auc']:.3f} {ci}, n = {row['n_pos']} vs {row['n_neg']}, "
            f"TPR at 5% FPR {row['tpr5']:.2f}, length-only AUC {row['len_auc']:.2f}")


def format_table(rows: list[dict]) -> str:
    head = f"{'comparison':40s} {'n':>9s} {'AUC':>6s} {'95% CI':>14s} {'TPR@5%':>7s} {'len_auc':>8s}"
    lines = [head, "-" * len(head)]
    for r in rows:
        n = f"{r['n_pos']}v{r['n_neg']}"
        if r["auc"] is None:
            lines.append(f"{r['name']:40s} {n:>9s} {'-':>6s}")
            continue
        ci = f"[{r['ci'][0]:.2f}, {r['ci'][1]:.2f}]" if r["ci"] else "-"
        lines.append(f"{r['name']:40s} {n:>9s} {r['auc']:6.3f} {ci:>14s} {r['tpr5']:7.2f} {r['len_auc']:8.2f}")
    return "\n".join(lines)


def paired_summary(records: list[dict], domain: str, key: str = "mink_20",
                   n_boot: int = 2000, seed: int = 0) -> dict:
    """Seen score minus paraphrase score, one difference per pair (per original text).

    Positive mean = originals score higher than their paraphrases. The interval
    resamples pairs, assuming they behave like a random sample of pairs.
    """
    seen = {r["pair"]: r[key] for r in records if r["domain"] == domain and r["arm"] == "seen"}
    para = {r["pair"]: r[key] for r in records if r["domain"] == domain and r["arm"] == "paraphrase"}
    pairs = sorted(set(seen) & set(para))
    diffs = [seen[p] - para[p] for p in pairs]
    out = dict(domain=domain, key=key, n=len(diffs), mean=None, ci=None, frac_positive=None, diffs=diffs)
    if diffs:
        out["mean"] = sum(diffs) / len(diffs)
        out["ci"] = bootstrap_mean_ci(diffs, n_boot=n_boot, seed=seed) if len(diffs) > 1 else None
        out["frac_positive"] = sum(d > 0 for d in diffs) / len(diffs)
    return out


def format_paired(s: dict) -> str:
    if not s["n"]:
        return f"{s['domain']}: no seen/paraphrase pairs"
    ci = f"[{s['ci'][0]:+.3f}, {s['ci'][1]:+.3f}]" if s["ci"] else "[n/a]"
    return (f"{s['domain']}: original minus paraphrase ({s['key']}), mean {s['mean']:+.3f} {ci}, "
            f"n = {s['n']} pairs, original higher in {s['frac_positive']:.0%} of pairs")


def score_sweep(records: list[dict], comparison: dict, keys=SCORE_KEYS) -> list[dict]:
    """Point AUC (no bootstrap) of one comparison for every score key."""
    return [compare(records, comparison, key=k, n_boot=0) for k in keys]


def format_sweep(rows: list[dict]) -> str:
    lines = [f"{'score':14s} {'AUC':>6s}"]
    for r in rows:
        auc = f"{r['auc']:.3f}" if r["auc"] is not None else "-"
        lines.append(f"{r['key']:14s} {auc:>6s}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Canary probe helpers
# ---------------------------------------------------------------------------

def random_guids(n: int, seed: int = 0) -> list[str]:
    """n random version-4 GUIDs, reproducible from the seed."""
    rng = random.Random(seed)
    return [str(uuid.UUID(int=rng.getrandbits(128), version=4)) for _ in range(n)]


def canary_rank(true_score: float, random_scores) -> tuple[int, float]:
    """Rank of the true GUID's log-prob among random GUIDs (1 = highest) and an empirical p-value.

    p = (1 + number of random GUIDs scoring at least as high) / (1 + number of random GUIDs).
    Under the null hypothesis "the model does not know this GUID", the true GUID is
    just one more random GUID, so p is roughly uniform.
    """
    random_scores = list(random_scores)
    at_least = sum(s >= true_score for s in random_scores)
    rank = 1 + sum(s > true_score for s in random_scores)
    return rank, (1 + at_least) / (1 + len(random_scores))


# ---------------------------------------------------------------------------
# Done-when check
# ---------------------------------------------------------------------------

_ABBREVIATIONS = ("e.g.", "i.e.", "et al.", "vs.", "cf.", "approx.", "Fig.", "No.")


def count_sentences(text: str) -> int:
    """Count sentences ending in '.', '!' or '?'. Common abbreviations do not end a sentence.

    Decimal numbers such as 0.71 do not end a sentence either (no space after the dot).
    """
    cleaned = text.strip()
    for abbr in _ABBREVIATIONS:
        cleaned = cleaned.replace(abbr, abbr.replace(".", ""))
    if not cleaned:
        return 0
    ends = re.findall(r"[.!?]+[\"')\]]*(?=\s|$)", cleaned)
    count = len(ends)
    if not re.search(r"[.!?][\"')\]]*\s*$", cleaned):
        count += 1                                # last sentence without a final mark
    return count


def done_when(primary_row: dict, limits_text: str) -> tuple[bool, str]:
    """Check the lab's Done-when items and return (ok, report)."""
    lines = []
    ok = True
    if primary_row.get("auc") is None or not primary_row.get("ci"):
        ok = False
        lines.append("MISSING  primary AUC with a bootstrap interval (run the primary-result cell)")
    else:
        lines.append("OK       " + format_row(primary_row))
        lines.append(f"         model: {primary_row['model']}; score: {primary_row['key']}")
        lines.append("         frame: two hand-picked sets (HumanEval/0-19 and 20 prompts written "
                     "2026-10-20); the interval assumes each behaves like a random sample")
    n = count_sentences(limits_text)
    if "TODO" in limits_text:
        ok = False
        lines.append("MISSING  limits paragraph (replace the TODO text with your five sentences)")
    elif n != 5:
        ok = False
        lines.append(f"MISSING  limits paragraph has {n} sentences; write exactly 5")
    else:
        lines.append("OK       limits paragraph has 5 sentences")
    lines.append("DONE" if ok else "NOT DONE yet")
    return ok, "\n".join(lines)


# ---------------------------------------------------------------------------
# Saving results
# ---------------------------------------------------------------------------

def save_records(records: list[dict], path) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(records, fh)


def load_records(path) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)
