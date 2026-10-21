"""G1 report: tables, plots and the numbers you need for your interpretation.

Raw outcomes come first (per problem), summaries second (per temperature).
Every interval says what it assumes. matplotlib is imported inside the plot
functions only.
"""

from __future__ import annotations

from collections import Counter, defaultdict

# Categorical slots 1-3 of the playbook's validated chart palette (light mode).
SERIES = ("#2a78d6", "#eb6834", "#1baf7a")
INK = "#0b0b0b"
INK_2 = "#52514e"
FAINT = "#c9c8c2"
GRID = "#e6e5e1"
SURFACE = "#fcfcfb"


def pct(x: float, digits: int = 1) -> str:
    return f"{100 * x:.{digits}f}%"


def points(x: float) -> str:
    """A difference of two rates, in percentage points."""
    return f"{100 * x:.1f} points"


def tf(t: float) -> str:
    """Temperature label: 1.0 stays '1.0', 0.25 stays '0.25'."""
    return f"{t:.1f}" if abs(t * 10 - round(t * 10)) < 1e-9 else f"{t:g}"


def _interval(metric: dict) -> str:
    return f"{pct(metric['estimate'])} [{pct(metric['lo'])}, {pct(metric['hi'])}]"


def markdown_table(rows: list[dict]) -> str:
    """A pipe table from a list of dicts with the same keys."""
    if not rows:
        return "(no rows)"
    keys = list(rows[0])

    def cell(value) -> str:
        return str(value).replace("|", "\\|")

    lines = ["| " + " | ".join(keys) + " |", "|" + "|".join("---" for _ in keys) + "|"]
    lines += ["| " + " | ".join(cell(row.get(k, "")) for k in keys) + " |" for row in rows]
    return "\n".join(lines)


def problem_rows(summary: dict, tasks=None) -> list[dict]:
    """One row per problem: c/n and the Wilson 95% interval at each temperature."""
    guess = {t.task_id: t.difficulty for t in tasks} if tasks else {}
    temps = summary["temperatures"]
    task_ids = sorted({tid for t in temps for tid in summary["by_temperature"][t]["per_problem"]})
    rows = []
    for tid in task_ids:
        row = {"problem": tid}
        if guess:
            row["guess"] = guess.get(tid, "")
        for t in temps:
            p = summary["by_temperature"][t]["per_problem"].get(tid)
            if p is None:
                row[f"T={tf(t)}"] = ""
                continue
            lo, hi = p["wilson"]
            row[f"T={tf(t)}"] = f"{p['c']}/{p['n']} ({pct(lo, 0)}-{pct(hi, 0)})"
        rows.append(row)
    return rows


def temperature_rows(summary: dict) -> list[dict]:
    """One row per temperature: mean metrics with cluster-bootstrap 95% intervals."""
    rows = []
    for t in summary["temperatures"]:
        block = summary["by_temperature"][t]
        row = {"T": f"{tf(t)}", "problems": block["problems"], "samples": block["samples"]}
        for name, metric in block["metrics"].items():
            row[name] = _interval(metric)
        row["never solved"] = block["never_solved"]
        row["always solved"] = block["always_solved"]
        rows.append(row)
    return rows


def paired_rows(paired: list[dict]) -> list[dict]:
    """One row per pair of temperatures and metric: the paired difference and what it says."""
    rows = []
    for r in paired:
        if r["lo"] > 0:
            reading = f"T={tf(r['b'])} higher"
        elif r["hi"] < 0:
            reading = f"T={tf(r['a'])} higher"
        else:
            reading = "no clear difference (interval contains 0)"
        rows.append({"metric": r["metric"], "comparison": f"T={tf(r['b'])} minus T={tf(r['a'])}",
                     "difference": points(r["estimate"]) if r["estimate"] >= 0 else "-" + points(-r["estimate"]),
                     "95% interval": f"[{100 * r['lo']:+.1f}, {100 * r['hi']:+.1f}] points",
                     "problems": r["problems"], "reading": reading})
    return rows


def frame_note(summary: dict) -> str:
    temps = summary["temperatures"]
    block = summary["by_temperature"][temps[0]]
    return (f"Frame: n={block['n_min']} samples per problem from one model "
            f"({', '.join(summary['models'])}), one prompt and one temperature, on each of "
            f"{block['problems']} hand-written problems. Per-problem intervals: Wilson 95%. "
            f"Mean intervals: cluster bootstrap over problems ({summary['bootstrap']} draws"
            f"{', with within-problem resampling' if summary['within'] else ''}), which treats "
            f"the problems as a random sample of similar problems.")


def status_table(graded: list[dict]) -> str:
    """How every completion ended, per temperature (a markdown table)."""
    by_t: dict[float, Counter] = defaultdict(Counter)
    for record in graded:
        by_t[float(record["temperature"])][record["status"]] += 1
    temps = sorted(by_t)
    statuses = sorted({s for c in by_t.values() for s in c}, key=lambda s: (s != "pass", s))
    rows = [{"status": s, **{f"T={tf(t)}": by_t[t][s] for t in temps}} for s in statuses]
    return markdown_table(rows)


def sanity_notes(graded: list[dict]) -> str:
    """Checks that catch broken sampling before you trust any number."""
    lines = []
    by_t: dict[float, list[dict]] = defaultdict(list)
    for record in graded:
        by_t[float(record["temperature"])].append(record)
    for t in sorted(by_t):
        records = by_t[t]
        truncated = sum(r.get("finish_reason") == "length" for r in records) / len(records)
        programs = defaultdict(set)
        for r in records:
            programs[r["task_id"]].add(r.get("program_id") or r["completion"])
        distinct = sum(len(v) for v in programs.values()) / len(programs)
        no_code = sum(r["status"] == "no_code" for r in records) / len(records)
        lines.append(f"T={tf(t)}: {pct(truncated)} cut off at max_tokens, {pct(no_code)} with no "
                     f"function found, {distinct:.1f} distinct programs per problem on average.")
        if truncated > 0.10:
            lines.append(f"  WARNING: many answers were cut off at T={tf(t)}. Raise MAX_TOKENS or "
                         "count this as a model weakness, and say which.")
        if t >= 0.6 and distinct <= 1.05:
            lines.append(f"  WARNING: at T={tf(t)} almost every sample is identical. Check the "
                         "seeds and sampling settings before you trust any number.")
    return "\n".join(lines)


def _style(ax) -> None:
    from matplotlib.ticker import PercentFormatter

    ax.set_facecolor(SURFACE)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(FAINT)
    ax.tick_params(colors=INK_2, labelsize=9)
    ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.set_ylim(-0.02, 1.02)


def plot_pass_vs_temperature(summary: dict, hat_k: int = 5):
    """Left: mean pass@k and pass^k against temperature, with 95% intervals.
    Right: every problem's own pass rate, to show how much problems differ."""
    import matplotlib.pyplot as plt

    temps = summary["temperatures"]
    blocks = [summary["by_temperature"][t] for t in temps]
    fig, (left, right) = plt.subplots(1, 2, figsize=(11, 4.8), sharey=True)
    fig.patch.set_facecolor(SURFACE)
    names = [f"pass@{k}" for k in summary["ks"] if f"pass@{k}" in blocks[0]["metrics"]]
    for color, name in zip(SERIES, names):
        est = [b["metrics"][name]["estimate"] for b in blocks]
        err = [[e - b["metrics"][name]["lo"] for e, b in zip(est, blocks)],
               [b["metrics"][name]["hi"] - e for e, b in zip(est, blocks)]]
        left.errorbar(temps, est, yerr=err, color=color, linewidth=2, marker="o", markersize=6,
                      capsize=3, elinewidth=1.2, label=name)
        left.annotate(name, (temps[-1], est[-1]), xytext=(8, 0), textcoords="offset points",
                      va="center", fontsize=9, color=INK_2)
    hat = f"pass^{hat_k}"
    if hat in blocks[0]["metrics"]:
        est = [b["metrics"][hat]["estimate"] for b in blocks]
        err = [[e - b["metrics"][hat]["lo"] for e, b in zip(est, blocks)],
               [b["metrics"][hat]["hi"] - e for e, b in zip(est, blocks)]]
        left.errorbar(temps, est, yerr=err, color=INK_2, linewidth=1.5, linestyle="--",
                      marker="s", markersize=5, capsize=3, elinewidth=1, label=f"{hat} (all {hat_k} pass)")
        left.annotate(hat, (temps[-1], est[-1]), xytext=(8, 0), textcoords="offset points",
                      va="center", fontsize=9, color=INK_2)
    left.set_title("Mean over problems, 95% cluster-bootstrap intervals", fontsize=10, color=INK)
    left.legend(frameon=False, fontsize=9, labelcolor=INK_2, loc="upper center",
                bbox_to_anchor=(0.5, -0.16), ncol=4)

    task_ids = sorted(blocks[0]["per_problem"])
    for i, tid in enumerate(task_ids):
        rates = [b["per_problem"][tid]["rate"] if tid in b["per_problem"] else float("nan")
                 for b in blocks]
        right.plot(temps, rates, color=FAINT, linewidth=1, label="one problem (c/n)" if i == 0 else None)
    mean = [b["metrics"]["pass@1"]["estimate"] for b in blocks]
    right.plot(temps, mean, color=SERIES[0], linewidth=2.5, marker="o", markersize=6,
               label="mean = pass@1")
    right.set_title("Each problem's own pass rate", fontsize=10, color=INK)
    right.legend(frameon=False, fontsize=9, labelcolor=INK_2, loc="upper center",
                 bbox_to_anchor=(0.5, -0.16), ncol=2)

    for ax in (left, right):
        _style(ax)
        ax.set_xticks(temps)
        ax.set_xlim(min(temps) - 0.1, max(temps) + 0.25)
        ax.set_xlabel("sampling temperature", color=INK_2, fontsize=9)
    model = ", ".join(summary["models"])
    fig.suptitle(f"G1: pass@k against temperature ({model}, n={blocks[0]['n_min']} per problem, "
                 f"{blocks[0]['problems']} problems)", fontsize=11, color=INK)
    fig.tight_layout()
    return fig


def plot_single_runs(single: dict, summary: dict):
    """Small multiples: the score a single run (1 sample per problem) could report."""
    import matplotlib.pyplot as plt

    temps = summary["temperatures"]
    problems = summary["by_temperature"][temps[0]]["problems"]
    from matplotlib.ticker import PercentFormatter

    fig, axes = plt.subplots(1, len(temps), figsize=(3.6 * len(temps), 3.4), sharey=True,
                             squeeze=False)
    fig.patch.set_facecolor(SURFACE)
    edges = [(i - 0.5) / problems for i in range(problems + 2)]
    top = 0.0
    for ax, t in zip(axes[0], temps):
        scores = single["scores"][t]
        weights = [1.0 / len(scores)] * len(scores)
        heights, _, _ = ax.hist(scores, bins=edges, weights=weights, color=SERIES[0],
                                edgecolor=SURFACE, linewidth=1)
        top = max(top, max(heights))
        estimate = single["spread"][t]["estimate"]
        ax.axvline(estimate, color=INK, linestyle="--", linewidth=1.2)
        ax.annotate(f"n={summary['by_temperature'][t]['n_min']} estimate {pct(estimate, 0)}",
                    (estimate, 1), xycoords=("data", "axes fraction"), xytext=(4, -10),
                    textcoords="offset points", fontsize=8, color=INK)
        ax.xaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
        ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
        ax.set_title(f"T = {tf(t)}", fontsize=10, color=INK)
        ax.set_facecolor(SURFACE)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        for side in ("left", "bottom"):
            ax.spines[side].set_color(FAINT)
        ax.tick_params(colors=INK_2, labelsize=8)
        ax.grid(axis="y", color=GRID, linewidth=0.8)
        ax.set_axisbelow(True)
        ax.set_xlim(-0.03, 1.03)
        ax.set_xlabel("pass@1 reported by one run", color=INK_2, fontsize=9)
    axes[0][0].set_ylim(0, top * 1.3)  # headroom for the labels
    axes[0][0].set_ylabel("share of simulated runs", color=INK_2, fontsize=9)
    fig.suptitle(f"What one run could have said ({single['runs']} simulated runs, "
                 f"1 sample per problem)", fontsize=11, color=INK)
    fig.tight_layout()
    return fig


def single_run_text(single: dict) -> str:
    lines = []
    for t, s in single["spread"].items():
        lines.append(f"T={tf(t)}: the n-sample estimate is {pct(s['estimate'])}. A single run reports "
                     f"{pct(s['p5'])} to {pct(s['p95'])} in 90% of simulated runs "
                     f"(min {pct(s['min'])}, max {pct(s['max'])}).")
    for p in single["pairs"]:
        lines.append(f"T={tf(p['a'])} vs T={tf(p['b'])}: the estimates differ by "
                     f"{points(abs(p['full_difference']))}. One run per temperature puts them in the "
                     f"wrong order {pct(p['wrong_order'])} of the time and ties {pct(p['tie'])}.")
    return "\n".join(lines)


def interpretation_facts(summary: dict, single: dict, paired: list[dict] | None = None) -> str:
    """The numbers your 5 sentences should use. It does not write them for you.

    paired: rows from g1_stats.compare_temperatures. The gap between two temperatures is judged by
    the paired difference and its interval, never by whether two separate intervals overlap.
    """
    temps = summary["temperatures"]
    by_t = summary["by_temperature"]
    best = max(temps, key=lambda t: by_t[t]["metrics"]["pass@1"]["estimate"])
    lines = [f"1. Best pass@1: T={tf(best)}, {_interval(by_t[best]['metrics']['pass@1'])}."]
    for r in paired or []:
        if r["metric"] == "pass@1" and best in (r["a"], r["b"]):
            other = r["a"] if r["b"] == best else r["b"]
            sign = 1 if r["b"] == best else -1
            lo, hi = sorted((sign * r["lo"], sign * r["hi"]))
            lines.append(f"   T={tf(best)} minus T={tf(other)} (paired, same {r['problems']} problems): "
                         f"{100 * sign * r['estimate']:+.1f} points [{100 * lo:+.1f}, {100 * hi:+.1f}]. "
                         "Is 0 inside the interval?")
    top_k = f"pass@{max(summary['ks'])}"
    if top_k in by_t[temps[0]]["metrics"]:
        lines.append(f"2. {top_k}: " + ", ".join(
            f"T={tf(t)} {pct(by_t[t]['metrics'][top_k]['estimate'])}" for t in temps) + ".")
    hat = f"pass^{min(summary['hat_ks'])}" if summary["hat_ks"] else None
    k = min(summary["hat_ks"]) if summary["hat_ks"] else None
    if hat and hat in by_t[temps[0]]["metrics"] and f"pass@{k}" in by_t[temps[0]]["metrics"]:
        lines.append(f"3. pass@{k} vs {hat}: " + ", ".join(
            f"T={tf(t)} {pct(by_t[t]['metrics'][f'pass@{k}']['estimate'])} vs "
            f"{pct(by_t[t]['metrics'][hat]['estimate'])}" for t in temps) + ".")
    lines.append("4. Never / always solved: " + ", ".join(
        f"T={tf(t)} {by_t[t]['never_solved']} / {by_t[t]['always_solved']}" for t in temps)
        + f" (of {by_t[temps[0]]['problems']}).")
    s = single["spread"][best]
    lines.append(f"5. One run at T={tf(best)} could report {pct(s['p5'])}-{pct(s['p95'])} "
                 "(90% of simulated runs).")
    lines.append(frame_note(summary))
    return "\n".join(lines)
