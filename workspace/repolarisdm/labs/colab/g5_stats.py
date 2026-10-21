"""G5 statistics: Cohen's kappa, confusion matrices, bootstrap intervals, Wilson intervals, reports.

Standard library only. The CPU smoke test checks kappa and the confusion matrix against scikit-learn.

Cohen's kappa (Cohen 1960):  kappa = (p_o - p_e) / (1 - p_e)
    p_o = share of items where the two raters give the same label
    p_e = sum over labels of (share of rater A using it) * (share of rater B using it)
          = the agreement two raters would reach by labeling at random with their own label mix
Kappa is undefined when p_e = 1 (both raters always use the same single label). We return nan then,
like scikit-learn does by default.
"""
import csv
import math
import random
from collections import Counter, defaultdict, namedtuple

from g5_labels import FIELDS, INVALID

Kappa = namedtuple("Kappa", "kappa p_o p_e n")
NAN = float("nan")


def cohen_kappa(a, b):
    if len(a) != len(b):
        raise ValueError("both raters must label the same items")
    n = len(a)
    if n == 0:
        return Kappa(NAN, NAN, NAN, 0)
    agree = sum(x == y for x, y in zip(a, b))
    ca, cb = Counter(a), Counter(b)
    chance_num = sum(ca[k] * cb[k] for k in ca)            # integer, so the p_e == 1 test is exact
    p_o, p_e = agree / n, chance_num / (n * n)
    if chance_num == n * n:
        return Kappa(NAN, p_o, p_e, n)
    return Kappa((p_o - p_e) / (1 - p_e), p_o, p_e, n)


def kappa_max(a, b):
    """The largest kappa possible with these two label mixes (Cohen 1960).

    If kappa_max is low, the raters use labels at different rates (one is biased toward a label),
    and no amount of item-by-item care could fix that alone.
    """
    n = len(a)
    if n == 0:
        return NAN
    ca, cb = Counter(a), Counter(b)
    p_e = sum(ca[k] * cb[k] for k in ca) / (n * n)
    if math.isclose(p_e, 1.0):
        return NAN
    p_max = sum(min(ca[k], cb[k]) for k in set(ca) | set(cb)) / n
    return (p_max - p_e) / (1 - p_e)


def confusion_matrix(a, b, labels):
    """Rows = rater A (you), columns = rater B (judge). Same layout as sklearn's confusion_matrix."""
    idx = {l: i for i, l in enumerate(labels)}
    m = [[0] * len(labels) for _ in labels]
    for x, y in zip(a, b):
        m[idx[x]][idx[y]] += 1
    return m


def _percentile(sorted_vals, q):
    """Linear interpolation between order statistics (numpy's default method)."""
    if not sorted_vals:
        return NAN
    pos = q * (len(sorted_vals) - 1)
    lo = math.floor(pos)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def bootstrap_kappa(a, b, clusters=None, reps=2000, seed=0, level=0.95):
    """Percentile bootstrap interval for kappa. Returns (lo, hi, n_undefined).

    Resamples CLUSTERS with replacement (items of one task are correlated, so resample tasks, not
    attempts). With clusters=None every item is its own cluster. Replicates where kappa is undefined
    (every resampled item got one label from both raters) are dropped and counted.
    Sampling assumption: the clusters are a random sample from the population you want to talk about.
    For a hand-picked set (Lab C) the interval only describes resampling noise within that set.
    """
    groups = defaultdict(list)
    for i, c in enumerate(clusters if clusters is not None else range(len(a))):
        groups[c].append(i)
    keys = list(groups)
    rng = random.Random(seed)
    vals, undefined = [], 0
    for _ in range(reps):
        idx = [i for _ in keys for i in groups[rng.choice(keys)]]
        k = cohen_kappa([a[i] for i in idx], [b[i] for i in idx]).kappa
        if math.isnan(k):
            undefined += 1
        else:
            vals.append(k)
    vals.sort()
    tail = (1 - level) / 2
    return _percentile(vals, tail), _percentile(vals, 1 - tail), undefined


def wilson(x, n, z=1.959963984540054):
    """Wilson score interval for x successes in n i.i.d. trials (Wilson 1927)."""
    if n == 0:
        return NAN, NAN
    p = x / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, center - half), min(1.0, center + half)


def _pairs(human, judge, field):
    ids = sorted(set(human) & set(judge))
    return ids, [human[i][field] for i in ids], [judge[i][field] for i in ids]


def agreement_table(human, judge, fields, clusters=None, reps=2000, seed=0):
    """One row per field: n, answered, p_o, p_e, kappa, 95% bootstrap CI, kappa on answered items.

    'answered' = items where the judge gave a schema value (not unknown, not INVALID). In the main
    kappa an abstention counts as a disagreement, because a grader that abstains still needs a human.
    """
    rows = []
    for f in fields:
        ids, a, b = _pairs(human, judge, f)
        k = cohen_kappa(a, b)
        cl = [clusters.get(i, i) for i in ids] if clusters else None
        lo, hi, und = bootstrap_kappa(a, b, cl, reps=reps, seed=seed)
        keep = [j for j, v in enumerate(b) if v not in ("unknown", INVALID)]
        ka = cohen_kappa([a[j] for j in keep], [b[j] for j in keep]).kappa
        rows.append({"field": f, "n": k.n, "answered": len(keep), "p_o": k.p_o, "p_e": k.p_e,
                     "kappa": k.kappa, "ci_lo": lo, "ci_hi": hi, "boot_undefined": und,
                     "kappa_answered": ka, "kappa_max": kappa_max(a, b)})
    return rows


def per_class(human, judge, field):
    """For each label YOU used: how often the judge gave the same label, and its usual other answer."""
    _, a, b = _pairs(human, judge, field)
    rows = []
    for lab in sorted(set(a), key=lambda l: FIELDS[field]["values"].index(l) if l in FIELDS[field]["values"] else 99):
        got = [y for x, y in zip(a, b) if x == lab]
        wrong = Counter(y for y in got if y != lab)
        rows.append({"your_label": lab, "n": len(got), "judge_same": sum(y == lab for y in got),
                     "judge_usual_other": wrong.most_common(1)[0][0] if wrong else "-"})
    return rows


def marginals(human, judge, field):
    """How often each rater uses each label. A big gap is a bias, e.g. a lenient judge."""
    _, a, b = _pairs(human, judge, field)
    ca, cb = Counter(a), Counter(b)
    labels = [l for l in FIELDS[field]["values"] + ["unknown", INVALID] if ca[l] or cb[l]]
    return [{"label": l, "you": ca[l], "judge": cb[l]} for l in labels]


def labels_in_use(human, judge, field):
    _, a, b = _pairs(human, judge, field)
    return [l for l in FIELDS[field]["values"] + ["unknown", INVALID] if l in set(a) | set(b)]


def disagreements(human, records, fields):
    """Every (item, field) where you and the judge differ, with the judge's evidence quote."""
    rows = []
    for r in records:
        mine = human.get(r["item_id"])
        if mine is None:
            continue
        for f in fields:
            if mine[f] != r["labels"][f]:
                rows.append({"item_id": r["item_id"], "source": r["source"], "field": f, "mine": mine[f],
                             "judge": r["labels"][f], "judge_evidence": r["evidence"][:160],
                             "truncated": r["truncated"], "explanation_type": "", "explanation": ""})
    return rows


EXPLANATION_TYPES = {
    "judge_misread": "The evidence is in what the judge saw; it missed or misread it.",
    "judge_no_access": "The right label needs evidence the judge cannot see: running code, the repo, the spec.",
    "judge_trusted_claim": "The judge believed the agent's final message over the tool output.",
    "my_label_wrong": "On rereading, the judge is right and your label was wrong.",
    "definition_unclear": "The schema allows both labels. Fix the definition, then relabel.",
    "format_failure": "The judge output did not parse, abstained, or broke the field rules.",
}


def check_explanations(path, need=5):
    """Done-when check: at least `need` disagreements with a known type and a real sentence."""
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    ok, problems = [], []
    for n, r in enumerate(rows, start=2):
        t, e = (r.get("explanation_type") or "").strip(), (r.get("explanation") or "").strip()
        if not t and not e:
            continue
        if t not in EXPLANATION_TYPES:
            problems.append(f"line {n}: explanation_type {t!r} is not one of {sorted(EXPLANATION_TYPES)}")
        elif len(e.split()) < 6:
            problems.append(f"line {n}: write at least one full sentence (6+ words) in explanation")
        else:
            ok.append(r)
    return ok, problems, len(ok) >= need


def pairwise_kappa(runs, field):
    """Mean kappa over all pairs of judge runs on the same items: the judge's agreement with itself."""
    ks = []
    for i in range(len(runs)):
        for j in range(i + 1, len(runs)):
            ids = sorted(set(runs[i]) & set(runs[j]))
            k = cohen_kappa([runs[i][x][field] for x in ids], [runs[j][x][field] for x in ids]).kappa
            if not math.isnan(k):
                ks.append(k)
    return sum(ks) / len(ks) if ks else NAN


def _fmt(v):
    if isinstance(v, float):
        return "n/a" if math.isnan(v) else f"{v:.2f}"
    return str(v)


def format_table(rows, columns=None):
    """Plain-text table that reads well in a notebook output and in a text file."""
    if not rows:
        return "(no rows)"
    columns = columns or list(rows[0])
    cells = [[_fmt(r.get(c, "")) for c in columns] for r in rows]
    widths = [max(len(c), *(len(row[i]) for row in cells)) for i, c in enumerate(columns)]
    line = lambda vals: "  ".join(v.ljust(w) for v, w in zip(vals, widths)).rstrip()
    return "\n".join([line(columns), line(["-" * w for w in widths])] + [line(r) for r in cells])


def format_confusion(matrix, labels, row_name="you", col_name="judge"):
    head = f"{row_name} \\ {col_name}"
    w = max(len(head), *(len(l) for l in labels))
    cw = max(4, *(len(l) for l in labels))
    out = [head.ljust(w) + "  " + "  ".join(l.rjust(cw) for l in labels)]
    for lab, row in zip(labels, matrix):
        out.append(lab.ljust(w) + "  " + "  ".join(str(v).rjust(cw) for v in row))
    return "\n".join(out)


def write_csv(rows, path, columns=None):
    columns = columns or (list(rows[0]) if rows else ["item_id"])
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return path
