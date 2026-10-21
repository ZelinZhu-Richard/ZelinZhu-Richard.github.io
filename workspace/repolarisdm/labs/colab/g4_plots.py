"""Matplotlib charts for the G4 probe. Each function returns a Figure; call plt.show().

Colors follow one fixed order: seen-likely = blue, paraphrase = orange, fresh = aqua
(a validated colorblind-safe trio). Arms always keep their color, and every chart
with more than one series has a legend.
"""

from __future__ import annotations

import g4_stats

ARM_COLORS = {"seen": "#2a78d6", "paraphrase": "#eb6834", "fresh": "#1baf7a"}
ARM_LABELS = {"seen": "seen-likely (public)", "paraphrase": "paraphrase of public text",
              "fresh": "fresh (written 2026-10-20)"}
LINE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]   # fixed order for multi-line charts
INK_MUTED = "#6b6a66"
GRID = "#e4e3df"


def _style(ax):
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(INK_MUTED)
    ax.tick_params(colors=INK_MUTED)
    ax.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def _short(key: str) -> str:
    return (f"Min-{key.split('_')[1]}% score" if key.startswith("mink_") else key) + " (higher = more likely seen)"


def _integer_y(ax):
    from matplotlib.ticker import MaxNLocator

    ax.yaxis.set_major_locator(MaxNLocator(integer=True))


def plot_distributions(records, key="mink_20", domains=("humaneval", "prose", "code"), matched_only=True):
    """One panel per domain; a step histogram per arm on shared bins."""
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(1, len(domains), figsize=(5 * len(domains), 3.6), squeeze=False)
    for ax, domain in zip(axes[0], domains):
        groups = {}
        for arm in ARM_COLORS:
            sel = dict(domain=domain, arm=arm, matched=matched_only)
            groups[arm] = [r[key] for r in g4_stats.select(records, sel)]
        values = [v for vs in groups.values() for v in vs]
        if not values:
            ax.set_title(f"{domain}: no texts")
            continue
        lo, hi = min(values), max(values)
        width = (hi - lo) / 15 or 1.0
        bins = [lo + i * width for i in range(16)]
        for arm, vs in groups.items():
            if vs:
                ax.hist(vs, bins=bins, histtype="step", linewidth=2, color=ARM_COLORS[arm],
                        label=f"{ARM_LABELS[arm]} (n={len(vs)})")
        ax.set_title(domain, loc="left")
        ax.set_xlabel(_short(key), fontsize=8)
        ax.set_ylabel("texts")
        _integer_y(ax)
        _style(ax)
        ax.legend(fontsize=7, frameon=False)
    fig.suptitle(g4_stats.SCORE_LABELS.get(key, key), x=0.01, ha="left", fontsize=10)
    fig.tight_layout()
    return fig


def plot_roc(records, comparisons=None, key="mink_20"):
    """ROC curves for up to four comparisons, with the chance line."""
    import matplotlib.pyplot as plt

    comparisons = comparisons or [c for c in g4_stats.COMPARISONS if c["roc"]]
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.plot([0, 1], [0, 1], linestyle="--", linewidth=1, color=INK_MUTED, label="chance (AUC 0.5)")
    for color, comp in zip(LINE_COLORS, comparisons[:4]):
        pos = [r[key] for r in g4_stats.select(records, comp["pos"])]
        neg = [r[key] for r in g4_stats.select(records, comp["neg"])]
        if not pos or not neg:
            continue
        fpr, tpr = g4_stats.roc_points(pos, neg)
        auc = g4_stats.auroc(pos, neg)
        ax.plot(fpr, tpr, linewidth=2, color=color, label=f"{comp['name']} (AUC {auc:.2f})")
    ax.set_xlabel("false-positive rate (fresh texts flagged as seen)")
    ax.set_ylabel("true-positive rate (seen-likely texts flagged)")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.02)
    ax.set_title(f"ROC, score = {key}", loc="left")
    _style(ax)
    ax.legend(fontsize=7, frameon=False, loc="lower right")
    fig.tight_layout()
    return fig


def plot_length(records, key="mink_20", domain="humaneval", matched_only=True):
    """Score against token count, one color per arm. Look for a slope or a length gap."""
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6, 4))
    for arm, color in ARM_COLORS.items():
        rs = g4_stats.select(records, dict(domain=domain, arm=arm, matched=matched_only))
        if rs:
            ax.scatter([r["n_tokens"] for r in rs], [r[key] for r in rs], s=40, color=color,
                       edgecolors="white", linewidths=0.8, label=f"{ARM_LABELS[arm]} (n={len(rs)})")
    ax.set_xlabel("tokens in the text")
    ax.set_ylabel(_short(key))
    ax.set_title(f"{domain}: score vs length", loc="left")
    _style(ax)
    ax.legend(fontsize=7, frameon=False)
    fig.tight_layout()
    return fig


def plot_k_sweep(records, comparisons):
    """Point AUC against k for Min-K%, one line per comparison (up to four)."""
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6, 4))
    ks = [round(k * 100) for k in g4_stats.KS]
    for color, comp in zip(LINE_COLORS, comparisons[:4]):
        aucs = [g4_stats.compare(records, comp, key=f"mink_{k}", n_boot=0)["auc"] for k in ks]
        if any(a is None for a in aucs):
            continue
        ax.plot(ks, aucs, linewidth=2, marker="o", markersize=8, color=color,
                markeredgecolor="white", label=comp["name"])
    ax.axhline(0.5, linestyle="--", linewidth=1, color=INK_MUTED, label="chance")
    ax.set_xlabel("k (% of lowest-probability tokens averaged)")
    ax.set_ylabel("AUC (point value, no interval)")
    ax.set_ylim(0, 1.02)
    ax.set_title("How much does the choice of k matter?", loc="left")
    _style(ax)
    ax.legend(fontsize=7, frameon=False, loc="lower right")
    fig.tight_layout()
    return fig
