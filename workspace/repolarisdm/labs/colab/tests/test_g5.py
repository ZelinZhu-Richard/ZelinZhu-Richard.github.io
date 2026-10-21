"""CPU smoke test for G5 (LLM judge vs your labels). No GPU, no torch, no vLLM.

Run from labs/colab:  python -m pytest -q tests/test_g5.py
Needs: pytest. Optional: scikit-learn (kappa cross-check) and nbformat (schema validation); those
tests are skipped when the package is missing.

What it checks: the transcripts load; the gold sanity items are consistent with their labels and with
the deterministic rule; kappa, the confusion matrix, the bootstrap and Wilson give known values (and
match scikit-learn); the judge-output parser and the label sheet validator behave; the GPU plan picks
sane settings; the notebook is valid nbformat v4 with no outputs and the required first cell; and the
notebook's code cells run end to end with a FAKE judge (random labels, not real model output).
"""
import csv
import hashlib
import json
import math
import random
import re
import sys
import types
import warnings
from pathlib import Path

import pytest

COLAB = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(COLAB))

import g5_gpu  # noqa: E402
import g5_items  # noqa: E402
import g5_judge  # noqa: E402
import g5_labels  # noqa: E402
import g5_stats  # noqa: E402
from g5_labels import FIELD_NAMES, FIELDS, INVALID  # noqa: E402

NOTEBOOK = COLAB / "g5-llm-judge-agreement.ipynb"
# Strings public files must never contain. Built by concatenation so this file does not contain them either.
FORBIDDEN = ("/Us" + "ers/", "hold" + "out", "CHRONOS" + "-CANARY", "local" + "host:", "127.0.0.1" + ":")
HONEST = ("Written and CPU-smoke-tested by an automated build on 2026-10-20. Never run on a GPU. "
          "Expect to fix version issues; pin what works and note it.")


# ---------- helpers ----------

def random_labels(rng):
    """A random label set that obeys the consistency rules. Used for fake raters only."""
    if rng.random() < 0.3:
        return {"verdict": "clean", "mistake_row": "none", "phase": "none", "oversold": "no",
                "checked_after_last_edit": rng.choice(["yes", "no"])}
    return {"verdict": "flawed", "mistake_row": rng.choice(FIELDS["mistake_row"]["values"][1:]),
            "phase": rng.choice(FIELDS["phase"]["values"][1:]), "oversold": rng.choice(["yes", "no"]),
            "checked_after_last_edit": rng.choice(["yes", "no"])}


def write_g2_fixture(root):
    """Six tiny JSONL attempts on two tasks, in the shapes load_g2 accepts. Fake data, not model output."""
    root.mkdir(parents=True, exist_ok=True)
    for k in range(6):
        task = "t1" if k < 3 else "t2"
        events = [
            {"role": "system", "content": "One bash command per turn."},
            {"role": "user", "content": f"Fix the bug in task {task}."},
            {"role": "assistant", "content": "I will look.", "command": "cat f.py", "output": "x = 1", "exit_code": 0},
            {"role": "assistant", "content": "", "command": "sed -i 's/1/2/' f.py", "output": "", "exit_code": 0},
        ]
        if k % 2 == 0:
            events.append({"role": "assistant", "command": "python -m pytest -q", "output": "1 passed", "exit_code": 0})
        events.append({"role": "assistant", "content": "Done. Tests pass."})
        events.append({"type": "result", "reward": 1.0 if k % 3 == 0 else 0.0, "task_id": task})
        (root / f"attempt_{k}.jsonl").write_text("\n".join(json.dumps(e) for e in events) + "\n")
    (root / "README.md").write_text("not a transcript")
    (root / "summary.json").write_text(json.dumps([{"reward": 1.0}, {"reward": 0.0}]))


def write_g2_native_run(run_dir, n=4):
    """A run folder in G2's own layout (g2_runs.py / g2_agent.py event shapes). Fake data, not model output."""
    (run_dir / "transcripts").mkdir(parents=True, exist_ok=True)
    rows = []
    for k in range(n):
        a = f"a{k:03d}"
        ev = [{"type": "meta", "attempt": a, "seed": k, "harness": "g2-agent-1", "task": "lab-f/freebusy-merge"},
              {"type": "prompt", "role": "system", "content": "Each reply ends with exactly ONE action."},
              {"type": "prompt", "role": "user", "content": "Task:\n\nMerge busy spans.\n\nStart."},
              {"type": "turn", "turn": 1, "reply": '<read_file path="freebusy/merge.py"/>',
               "action": {"name": "read_file", "path": "freebusy/merge.py", "ignored_actions": 0},
               "observation": "Content of freebusy/merge.py:\n" + "x" * 5000},
              {"type": "turn", "turn": 2, "reply": '<write_file path="freebusy/merge.py">\ndef merge_busy(): pass\n</write_file>',
               "action": {"name": "write_file", "path": "freebusy/merge.py", "lines": 1, "ignored_actions": 0},
               "observation": "Wrote 1 lines to freebusy/merge.py."}]
        if k % 2 == 0:
            ev.append({"type": "turn", "turn": 3, "reply": "<run_tests/>", "action": {"name": "run_tests", "ignored_actions": 0},
                       "observation": "Exit code: 1\nLast part of the output:\nFAILED (errors=2)"})
        ev += [{"type": "turn", "turn": 4, "reply": "Done.\n<finish>Rewrote merge. All tests pass.</finish>",
                "action": {"name": "finish", "message": "Rewrote merge. All tests pass.", "ignored_actions": 0},
                "observation": "Finished."},
               {"type": "end", "attempt": a, "end_reason": "finish", "turns": 4, "last_test_exit": 1},
               {"type": "diff", "changed": ["freebusy/merge.py"], "added": [], "deleted": [],
                "patch": "--- a/freebusy/merge.py\n+++ b/freebusy/merge.py\n", "patch_truncated": False},
               {"type": "grade", "grader": "weak", "reward": 1.0, "passed": True, "note": "SECRET-WEAK-NOTE"},
               {"type": "grade", "grader": "strong", "reward": 0.0, "passed": False, "note": "SECRET-STRONG-NOTE"}]
        (run_dir / "transcripts" / f"{a}.jsonl").write_text("\n".join(json.dumps(e) for e in ev) + "\n")
        rows.append({"attempt": a, "valid": True, "passed": {"weak": True, "strong": False}})
    (run_dir / "attempts.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    (run_dir / "config.json").write_text(json.dumps({"seed": 1}))
    (run_dir / "results.md").write_text("| pass@1 | ... |")
    (run_dir / "labels.jsonl").write_text(json.dumps(
        {"attempt": "a001", "first_wrong_turn": 2, "phase": "verify", "mistake": "M6",
         "evidence": "claims tests pass", "note": "n", "labeler": "human"}) + "\n")


# ---------- items ----------

def test_labc_items_load_and_are_labeled_synthetic():
    items = g5_items.load_labc()
    assert [i["item_id"] for i in items] == [f"labc-{n:02d}" for n in range(1, 13)]
    for it in items:
        assert it["transcript"].startswith("Synthetic, written for practice. Not real Gemini output.")
        assert it["task"] and it["diff"].startswith("diff --git")
        assert g5_items.final_message(it["transcript"]), it["item_id"]
        assert g5_items.mechanical_checked_after_last_edit(it["transcript"]) in ("yes", "no")


def test_gold_items_are_consistent_with_their_labels_and_the_rules():
    gold = g5_items.load_gold()
    assert [g["item_id"] for g in gold] == [f"gold-{n}" for n in range(1, 6)]
    for g in gold:
        assert g["transcript"].startswith("Synthetic, written for practice. Not real model output.")
        assert g["diff"].startswith("diff --git"), g["item_id"]
        for f, accepted in g["gold"].items():
            assert f in FIELDS and accepted and set(accepted) <= set(FIELDS[f]["values"]), (g["item_id"], f)
        # every single choice of accepted values must pass the consistency rules
        for v in g["gold"].get("verdict", [None]):
            for row in g["gold"].get("mistake_row", [None]):
                labels = {"verdict": v, "mistake_row": row, "phase": g["gold"].get("phase", [None])[0],
                          "oversold": g["gold"].get("oversold", [None])[0]}
                assert not g5_labels.consistency_problems(labels), (g["item_id"], labels)
        if "checked_after_last_edit" in g["gold"]:
            assert g5_items.mechanical_checked_after_last_edit(g["transcript"]) in g["gold"]["checked_after_last_edit"]
        assert not any(bad in g["transcript"] for bad in FORBIDDEN + ("/private/",))


def test_mechanical_rule_on_small_transcripts():
    edit = "**Tool call: edit `a.py`**\n\n```diff\n-x\n+y\n```"
    shell = lambda c: f"**Tool call: shell**\n\n```console\n$ {c}\nout\n```"
    final = "## Agent (final message)\n\n$ python -m pytest -q"     # commands in the final message never count
    assert g5_items.mechanical_checked_after_last_edit("\n\n".join([edit, shell("python -m pytest -q"), final])) == "yes"
    assert g5_items.mechanical_checked_after_last_edit("\n\n".join([shell("python -m pytest -q"), edit, final])) == "no"
    assert g5_items.mechanical_checked_after_last_edit("\n\n".join([edit, shell("rg -n foo"), shell("python --version")])) == "no"
    assert g5_items.mechanical_checked_after_last_edit(shell("python -m pytest -q")) == "no"      # no edit at all
    # shell-only agents (G2): a redirect into a repo file is an edit, /tmp is not
    assert g5_items.mechanical_checked_after_last_edit(
        "\n\n".join([shell("cat > f.py <<EOF"), shell("python f.py")])) == "yes"
    assert g5_items.mechanical_checked_after_last_edit(
        "\n\n".join([shell("python -c 'print(1)'"), shell("sed -i 's/a/b/' f.py")])) == "no"
    assert g5_items.mechanical_checked_after_last_edit(
        "\n\n".join([shell("sed -i 's/a/b/' f.py && python -m pytest -q")])) == "yes"
    assert g5_items.mechanical_checked_after_last_edit(
        "\n\n".join([shell("python -m pytest -q 2>&1 > /tmp/log")])) == "no"


def test_g2_loader_hides_grades_and_clusters_by_task(tmp_path):
    write_g2_fixture(tmp_path / "g2")
    items = g5_items.load_g2(tmp_path / "g2")
    assert len(items) == 6                                 # README and the grades-only file are skipped
    by_id = {i["item_id"]: i for i in items}
    a0 = by_id["g2-attempt_0"]
    assert a0["outcome"] == "pass" and by_id["g2-attempt_1"]["outcome"] == "fail"
    assert a0["cluster"] == "task:t1" and by_id["g2-attempt_5"]["cluster"] == "task:t2"
    assert "reward" not in a0["transcript"] and "1.0" not in a0["transcript"]
    assert g5_items.final_message(a0["transcript"]) == "Done. Tests pass."
    assert a0["task"] == "Fix the bug in task t1."
    assert g5_items.mechanical_checked_after_last_edit(a0["transcript"]) == "yes"
    assert g5_items.mechanical_checked_after_last_edit(by_id["g2-attempt_1"]["transcript"]) == "no"


def test_g2_loader_reads_openai_tool_calls(tmp_path):
    ev = [{"role": "user", "content": "do it"},
          {"role": "assistant", "content": None,
           "tool_calls": [{"function": {"name": "bash", "arguments": json.dumps({"command": "python -m pytest"})}}]},
          {"role": "tool", "content": "3 passed"},
          {"role": "assistant", "content": "All good."}]
    (tmp_path / "x.json").write_text(json.dumps({"messages": ev, "task_id": "t9", "passed": False}))
    (it,) = g5_items.load_g2(tmp_path)
    assert "$ python -m pytest" in it["transcript"] and "3 passed" in it["transcript"]
    assert it["outcome"] == "fail" and it["cluster"] == "task:t9"


def test_g2_native_run_folder(tmp_path):
    run = tmp_path / "run1"
    write_g2_native_run(run)
    items = g5_items.load_g2(run)
    assert [i["item_id"] for i in items] == [f"g2-transcripts_a00{k}" for k in range(4)]   # bookkeeping skipped
    it = items[0]
    assert it["outcome"] == "fail" and it["grader"] == "strong"          # strong beats weak
    assert it["cluster"] == "task:lab-f/freebusy-merge" and it["diff"].startswith("--- a/freebusy")
    for hidden in ("SECRET", "reward", "patch_truncated", "end_reason"):
        assert hidden not in it["transcript"], hidden
    assert "characters of tool output cut" in it["transcript"]           # 5000-char read was capped
    assert g5_items.final_message(it["transcript"]) == "Rewrote merge. All tests pass."
    assert it["task"].startswith("Task:") and "Merge busy spans" not in it["transcript"]     # task shown once
    assert [g5_items.mechanical_checked_after_last_edit(i["transcript"]) for i in items] == ["yes", "no", "yes", "no"]
    pre = g5_labels.g2_prefill(items, tmp_path)
    assert pre == {"g2-transcripts_a001": {"verdict": "flawed", "mistake_row": "M6", "phase": "verify",
                                           "notes": "prefilled from G2 labels.jsonl"}}
    units, frame = g5_items.clusters_for(items)
    assert len(set(units.values())) == 4 and "single transcripts" in frame
    many = [dict(i, cluster=f"task:t{k}") for k, i in enumerate(items * 2)]
    many = [dict(i, item_id=f"x{k}") for k, i in enumerate(many)]
    units, frame = g5_items.clusters_for(many)
    assert len(set(units.values())) == 8 and "G2 tasks" in frame


def test_g2_loader_text_format_and_folder_results(tmp_path):
    # a text-format agent: commands in fenced bash blocks, observations sent back as user messages
    d = tmp_path / "trial_7"
    d.mkdir()
    ev = [{"role": "user", "content": "Fix f.py"},
          {"role": "assistant", "content": "Look first.\n```bash\ncat f.py\n```"},
          {"role": "user", "content": "x = 1"},
          {"role": "assistant", "content": "```bash\nsed -i 's/1/2/' f.py\n```"},
          {"role": "user", "content": ""},
          {"role": "assistant", "content": "```bash\npython f.py\n```"},
          {"role": "user", "content": "ok"},
          {"role": "assistant", "content": "Fixed it."},
          {"type": "result", "result": "pass", "note": "hidden from the judge"}]
    (d / "transcript.jsonl").write_text("\n".join(json.dumps(e) for e in ev))
    (d / "result.json").write_text(json.dumps({"reward": 0.0, "task_id": "lab-f"}))
    (d / "patch.diff").write_text("diff --git a/f.py b/f.py")
    (it,) = g5_items.load_g2(tmp_path)
    assert it["item_id"] == "g2-trial_7_transcript" and it["cluster"] == "task:lab-f"
    assert it["outcome"] == "fail"                     # the folder's result.json wins over the inline record
    assert it["diff"] == "diff --git a/f.py b/f.py"
    assert "$ cat f.py" in it["transcript"] and "**Tool output**" in it["transcript"]
    assert "hidden from the judge" not in it["transcript"]
    assert g5_items.final_message(it["transcript"]) == "Fixed it."
    assert g5_items.mechanical_checked_after_last_edit(it["transcript"]) == "yes"


def test_fit_text_cuts_the_middle_and_keeps_both_ends():
    text = "TASK " + "x" * 5000 + " FINAL"
    out, cut = g5_items.fit_text(text, 300, g5_items.approx_tokens)
    assert cut and out.startswith("TASK") and out.endswith("FINAL")
    assert g5_items.approx_tokens(out) <= 300
    same, cut2 = g5_items.fit_text("short", 300, g5_items.approx_tokens)
    assert same == "short" and not cut2


# ---------- statistics ----------

def test_kappa_worked_example_from_facts():
    # 100 transcripts: you say A 30 times, the judge 25 times, agreement 85 -> p_o .85, p_e .60, kappa .625
    a = ["A"] * 20 + ["A"] * 10 + ["B"] * 5 + ["B"] * 65
    b = ["A"] * 20 + ["B"] * 10 + ["A"] * 5 + ["B"] * 65
    k = g5_stats.cohen_kappa(a, b)
    assert (k.n, round(k.p_o, 10), round(k.p_e, 10), round(k.kappa, 10)) == (100, 0.85, 0.6, 0.625)


def test_kappa_chapter9_example():
    pa = ["repair", "repair", "verify", "localize", "repair", "verify", "repair", "environment", "repair", "verify"]
    pb = ["repair", "repair", "verify", "repair", "repair", "repair", "repair", "environment", "repair", "verify"]
    k = g5_stats.cohen_kappa(pa, pb)
    assert round(k.p_o, 2) == 0.80 and round(k.p_e, 2) == 0.42 and round(k.kappa, 2) == 0.66


def test_kappa_edge_cases():
    assert g5_stats.cohen_kappa(["x", "y"], ["x", "y"]).kappa == 1.0
    assert math.isnan(g5_stats.cohen_kappa(["x"] * 5, ["x"] * 5).kappa)   # p_e = 1: undefined
    assert g5_stats.cohen_kappa(["x", "y"], ["y", "x"]).kappa == -1.0
    with pytest.raises(ValueError):
        g5_stats.cohen_kappa(["x"], [])
    assert g5_stats.kappa_max(["a", "b", "a"], ["b", "a", "a"]) == pytest.approx(1.0)


def test_kappa_and_confusion_match_sklearn():
    sk = pytest.importorskip("sklearn.metrics")
    rng = random.Random(7)
    for trial in range(300):
        n = rng.randint(1, 40)
        labels = ["a", "b", "c", "d"][: rng.randint(1, 4)]
        a = [rng.choice(labels) for _ in range(n)]
        b = [x if rng.random() < rng.random() else rng.choice(labels) for x in a]
        ours = g5_stats.cohen_kappa(a, b).kappa
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            theirs = float(sk.cohen_kappa_score(a, b))
        assert (math.isnan(ours) and math.isnan(theirs)) or ours == pytest.approx(theirs, abs=1e-12), (a, b)
        labs = sorted(set(a) | set(b))
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            theirs_cm = sk.confusion_matrix(a, b, labels=labs).tolist()
        assert g5_stats.confusion_matrix(a, b, labs) == theirs_cm


def test_bootstrap_is_seeded_and_cluster_aware():
    rng = random.Random(3)
    a = [rng.choice("xy") for _ in range(30)]
    b = [x if rng.random() < 0.8 else rng.choice("xy") for x in a]
    r1 = g5_stats.bootstrap_kappa(a, b, reps=500, seed=1)
    assert r1 == g5_stats.bootstrap_kappa(a, b, clusters=list(range(30)), reps=500, seed=1)
    k = g5_stats.cohen_kappa(a, b).kappa
    assert r1[0] <= k <= r1[1]
    # one big cluster: every replicate is the full set, so the interval collapses to the point estimate
    lo, hi, und = g5_stats.bootstrap_kappa(a, b, clusters=["one"] * 30, reps=50, seed=0)
    assert lo == pytest.approx(k) and hi == pytest.approx(k) and und == 0
    # all-agree on a single label: every replicate undefined
    lo, hi, und = g5_stats.bootstrap_kappa(["x"] * 5, ["x"] * 5, reps=20)
    assert math.isnan(lo) and und == 20


def test_wilson_known_values():
    assert tuple(round(v, 3) for v in g5_stats.wilson(10, 50)) == (0.112, 0.330)
    assert tuple(round(v, 3) for v in g5_stats.wilson(0, 50)) == (0.0, 0.071)
    assert tuple(round(v, 3) for v in g5_stats.wilson(50, 50)) == (0.929, 1.0)


def test_agreement_table_counts_abstentions_as_disagreements():
    human = {f"i{k}": {"verdict": "clean" if k % 2 else "flawed"} for k in range(10)}
    judge = {k: dict(v) for k, v in human.items()}
    judge["i0"]["verdict"] = "unknown"
    (row,) = g5_stats.agreement_table(human, judge, ["verdict"], reps=200)
    assert row["n"] == 10 and row["answered"] == 9 and row["p_o"] == 0.9
    assert row["kappa"] < 1.0 and row["kappa_answered"] == 1.0


def test_disagreements_and_done_check(tmp_path):
    human = {"a": {"verdict": "clean"}, "b": {"verdict": "flawed"}}
    recs = [{"item_id": "a", "source": "s", "labels": {"verdict": "flawed"}, "evidence": "q", "truncated": False},
            {"item_id": "b", "source": "s", "labels": {"verdict": "flawed"}, "evidence": "", "truncated": False}]
    dis = g5_stats.disagreements(human, recs, ["verdict"])
    assert [(d["item_id"], d["mine"], d["judge"]) for d in dis] == [("a", "clean", "flawed")]
    rows = [dict(dis[0], explanation_type="judge_misread",
                 explanation=f"The judge missed the failing run in step {k} of the transcript.") for k in range(5)]
    path = g5_stats.write_csv(rows, tmp_path / "d.csv")
    ok, probs, done = g5_stats.check_explanations(path)
    assert done and not probs and len(ok) == 5
    rows[0]["explanation_type"] = "vibes"
    rows[1]["explanation"] = "too short"
    ok, probs, done = g5_stats.check_explanations(g5_stats.write_csv(rows, tmp_path / "d2.csv"))
    assert not done and len(probs) == 2


# ---------- labels ----------

def test_normalize():
    n = g5_labels.normalize
    assert n("verdict", " Flawed. ") == "flawed"
    assert n("mistake_row", "m06: overselling") == "M6" and n("mistake_row", "M11") == INVALID
    assert n("oversold", True) == "yes" and n("oversold", "false") == "no"
    assert n("phase", "unknown") == INVALID and n("phase", "unknown", allow_unknown=True) == "unknown"
    assert n("verdict", ["clean"]) == INVALID and n("verdict", None) == INVALID


def test_label_sheet_roundtrip_and_validation(tmp_path):
    items = g5_items.load_labc()
    path = g5_labels.write_template(items, tmp_path / "my_labels.csv")
    labels, problems, unlabeled = g5_labels.read_labels(path, {i["item_id"] for i in items})
    assert labels == {} and problems == [] and len(unlabeled) == 12
    rows = list(csv.DictReader(open(path)))
    rows[0].update(verdict="clean", mistake_row="none", phase="none", oversold="no", checked_after_last_edit="yes")
    rows[1].update(verdict="flawed", mistake_row="m3", phase="repair", oversold="no", checked_after_last_edit="yes")
    rows[2].update(verdict="clean", mistake_row="M4", phase="none", oversold="no", checked_after_last_edit="yes")
    rows[3].update(verdict="flawed")                                            # partial row
    rows[4].update(verdict="flawed", mistake_row="M2", phase="repair", oversold="maybe", checked_after_last_edit="no")
    rows[5].update(verdict="clean", mistake_row="none", phase="none", oversold="unknown", checked_after_last_edit="no")
    g5_stats.write_csv(rows, path, g5_labels.CSV_COLUMNS)
    labels, problems, unlabeled = g5_labels.read_labels(path, {i["item_id"] for i in items})
    text = "\n".join(problems)
    assert labels["labc-02"]["mistake_row"] == "M3"
    assert "labc-03" in text and "mistake_row none" in text                     # consistency rule
    assert "labc-04" in text and "is empty" in text                             # partial row
    assert "'maybe'" in text                                                    # bad value
    assert "labc-06" in text                                                    # you may not answer unknown
    assert len(unlabeled) == 6


def test_freeze_detects_edits(tmp_path):
    p, lock = tmp_path / "l.csv", tmp_path / "lock.json"
    p.write_text("item_id\n")
    first = g5_labels.freeze(p, lock)
    assert g5_labels.check_frozen(p, lock) and g5_labels.freeze(p, lock) == first
    p.write_text("item_id\nx\n")
    assert not g5_labels.check_frozen(p, lock)
    with pytest.raises(RuntimeError):
        g5_labels.freeze(p, lock)


def test_cli_template_show_check(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    assert g5_labels._main(["fields"]) == 0 and "checked_after_last_edit" in capsys.readouterr().out
    assert g5_labels._main(["template", "--out", "s.csv"]) == 0
    assert g5_labels._main(["template", "--out", "s.csv"]) == 1                  # never overwrites
    assert g5_labels._main(["show", "labc-01"]) == 0
    assert "## Transcript" in capsys.readouterr().out
    assert g5_labels._main(["check", "s.csv"]) == 0


# ---------- judge prompt and parser ----------

def test_prompt_contains_every_allowed_value_and_no_grade():
    for spec in FIELDS.values():
        for v in spec["values"]:
            assert v in g5_judge.SYSTEM_PROMPT
    assert len(g5_judge.prompt_fingerprint()) == 12
    it = g5_items.load_labc()[0]
    full = g5_judge.build_user_message(it)
    assert it["transcript"] in full and it["diff"] in full
    fo = g5_judge.build_user_message(it, mode="final_only")
    assert "Tool call" not in fo and g5_items.final_message(it["transcript"]) in fo and it["diff"] not in fo


def test_build_conversations_fits_the_budget():
    items = g5_items.load_labc() + g5_items.load_gold()
    budget = 2500
    convs, meta = g5_judge.build_conversations(items, "full", g5_items.approx_tokens, budget)
    assert len(convs) == len(items)
    assert all(c[0]["role"] == "system" and c[1]["role"] == "user" for c in convs)
    for it, m in zip(items, meta):
        whole = g5_items.approx_tokens(g5_judge.SYSTEM_PROMPT + g5_judge.build_user_message(it)) + 64
        assert m["truncated"] == (whole > budget), it["item_id"]
        assert m["input_tokens"] <= budget + 5, it["item_id"]        # +5: the CPU token estimate rounds per piece
    assert sum(m["truncated"] for m in meta) >= 10
    convs, meta = g5_judge.build_conversations(items, "full", g5_items.approx_tokens, 7616)
    assert not any(m["truncated"] for m in meta)                                # T4 plan: Lab C fits uncut


def test_parse_judge_output():
    good = {"reasoning": "r", "verdict": "flawed", "mistake_row": "M6", "phase": "verify", "oversold": "yes",
            "checked_after_last_edit": "no", "evidence": "All tests pass."}
    p = g5_judge.parse_judge_output("Sure!\n```json\n" + json.dumps(good) + "\n```\nHope this helps {x}")
    assert p["errors"] == [] and p["labels"]["mistake_row"] == "M6" and p["evidence"] == "All tests pass."
    p = g5_judge.parse_judge_output("<think>hmm {</think>" + json.dumps(dict(good, oversold=True, phase="Unknown")))
    assert p["labels"]["oversold"] == "yes" and p["labels"]["phase"] == "unknown" and not p["errors"]
    p = g5_judge.parse_judge_output('{"verdict": "clean", "mistake_row": "none", "phase": "none",')
    assert p["lenient"] and p["labels"]["verdict"] == "clean" and p["labels"]["oversold"] == INVALID
    p = g5_judge.parse_judge_output("The patch looks fine to me.")
    assert all(v == INVALID for v in p["labels"].values()) and p["errors"]
    p = g5_judge.parse_judge_output(json.dumps(dict(good, verdict="mostly fine")))
    assert p["labels"]["verdict"] == INVALID and any("verdict" in e for e in p["errors"])


class FakeOut:
    def __init__(self, text):
        self.outputs = [types.SimpleNamespace(text=text)]


class FakeLLM:
    """Stands in for vllm.LLM. Returns RANDOM labels (seeded by the prompt), not model output."""

    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def get_tokenizer(self):
        return types.SimpleNamespace(encode=lambda s: [0] * g5_items.approx_tokens(s))

    def chat(self, conversations, params):
        outs = []
        for conv in conversations:
            h = hashlib.sha256((conv[1]["content"] + str(getattr(params, "seed", 0))).encode()).hexdigest()
            rng = random.Random(h)
            if rng.random() < 0.1:
                outs.append(FakeOut("I cannot decide."))
                continue
            lab = random_labels(rng)
            outs.append(FakeOut("```json\n" + json.dumps({"reasoning": "fake", **lab, "evidence": "fake"}) + "\n```"))
        return outs


def test_run_judge_with_fake_llm_and_gold_scoring():
    gold = g5_items.load_gold()
    plan = g5_gpu.make_plan({"name": "Tesla T4", "mem_gb": 15.0, "cc_major": 7, "cc_minor": 5})
    recs = g5_judge.run_judge(FakeLLM(), gold, types.SimpleNamespace(seed=0), "full", plan,
                              count_tokens=g5_items.approx_tokens)
    assert [r["item_id"] for r in recs] == [g["item_id"] for g in gold]
    assert all(r["prompt_sha"] == g5_judge.prompt_fingerprint() and r["revision"] == plan["revision"] for r in recs)
    assert "outputs" in g5_judge.health(recs)

    class Oracle(FakeLLM):                       # answers with the gold labels: every gold field must score ok
        def chat(self, conversations, params):
            out = []
            for conv, g in zip(conversations, gold):
                lab = {f: v[0] for f, v in g["gold"].items()}
                out.append(FakeOut(json.dumps({f: lab.get(f, "unknown") for f in FIELD_NAMES})))
            return out

    rows = g5_judge.score_gold(g5_judge.run_judge(Oracle(), gold, None, "x", plan), gold)
    assert rows and all(r["ok"] for r in rows)


# ---------- GPU plan ----------

def test_gpu_plans():
    smi = "Tesla T4, 15360, 7.5\nNVIDIA L4, 23034, 8.9\nNVIDIA A100-SXM4-40GB, 40960, 8.0\n"
    t4, l4, a100 = g5_gpu.parse_nvidia_smi(smi)
    assert (t4["mem_gb"], t4["cc_major"], l4["cc_minor"]) == (15.0, 7, 9)
    p = g5_gpu.make_plan(t4)
    assert (p["dtype"], p["judge_key"], p["max_model_len"], p["enforce_eager"]) == ("half", "qwen3-4b", 8192, True)
    assert p["max_input_tokens"] == 8192 - 512 - 64
    assert g5_gpu.make_plan(l4)["dtype"] == "bfloat16" and g5_gpu.make_plan(a100)["max_num_seqs"] == 32
    assert g5_gpu.make_plan(l4, override="qwen2.5-coder-7b")["max_model_len"] == 8192     # tight fit
    with pytest.raises(RuntimeError):
        g5_gpu.make_plan(t4, override="qwen2.5-coder-7b")
    with pytest.raises(RuntimeError):
        g5_gpu.make_plan(None)
    with pytest.raises(ValueError):
        g5_gpu.make_plan(t4, override="gpt-9")
    for j in g5_gpu.JUDGES.values():
        assert re.fullmatch(r"[0-9a-f]{40}", j["revision"])
    assert "Judge: Qwen/Qwen3-4B-Instruct-2507" in g5_gpu.describe_plan(p)


# ---------- notebook ----------

def load_nb():
    return json.loads(NOTEBOOK.read_text(encoding="utf-8"))


def test_notebook_is_valid_nbformat_v4_without_outputs():
    nb = load_nb()
    assert nb["nbformat"] == 4 and nb["nbformat_minor"] >= 5
    md = nb["metadata"]
    assert md["kernelspec"]["name"] == "python3" and md["accelerator"] == "GPU" and md["colab"]["gpuType"] == "T4"
    ids = [c["id"] for c in nb["cells"]]
    assert len(ids) == len(set(ids)) and all(re.fullmatch(r"[A-Za-z0-9_-]{1,64}", i) for i in ids)
    for c in nb["cells"]:
        if c["cell_type"] == "code":
            assert c["outputs"] == [] and c["execution_count"] is None
    nbformat = pytest.importorskip("nbformat")
    nbformat.validate(nbformat.reads(NOTEBOOK.read_text(encoding="utf-8"), as_version=4))


def test_builder_reproduces_the_notebook(tmp_path):
    import subprocess
    out = tmp_path / "nb.ipynb"
    subprocess.run([sys.executable, str(COLAB / "g5_build_notebook.py"), str(out)], check=True, capture_output=True)
    assert out.read_text(encoding="utf-8") == NOTEBOOK.read_text(encoding="utf-8"), "rerun g5_build_notebook.py"


def test_notebook_first_cell_has_the_required_parts():
    first = load_nb()["cells"][0]
    text = "".join(first["source"])
    assert first["cell_type"] == "markdown" and text.startswith("# G5:")
    for part in ("**Goal.**", "Polaris", "**Time.**", "**GPU budget.**", "T4", "**Done when:**", HONEST):
        assert part in text, part


def test_notebook_code_compiles_installs_are_pinned_and_no_secrets():
    nb = load_nb()
    sources = ["".join(c["source"]) for c in nb["cells"]]
    for c, src in zip(nb["cells"], sources):
        if c["cell_type"] == "code":
            py = "\n".join("pass" if l.lstrip().startswith(("%", "!")) else l for l in src.splitlines())
            compile(py, c["id"], "exec")
            for line in src.splitlines():
                if "pip install" in line:
                    pkgs = [t for t in line.split("pip install", 1)[1].split() if not t.startswith("-")]
                    assert pkgs and all(re.fullmatch(r"[A-Za-z0-9_.\-\[\]]+==[0-9][0-9A-Za-z.+]*", p) for p in pkgs), line
    blob = "\n".join(sources)
    for bad in FORBIDDEN + ("hf_", "no" + "index"):
        assert bad not in blob, bad
    assert not re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", blob)
    assert "colab.research.google.com" not in blob or "ZelinZhu-Richard" in blob


def test_helper_files_have_no_forbidden_strings():
    for p in list(COLAB.glob("g5_*.py")) + [COLAB / "g5_gold.json", Path(__file__)]:
        text = p.read_text(encoding="utf-8")
        for bad in FORBIDDEN:
            assert bad not in text, (p.name, bad)
        assert not re.search(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", text), p.name      # no email addresses


# ---------- the notebook, end to end, with a fake judge ----------

SKIP_CELLS = {"g5-clone", "g5-gpu", "g5-install", "g5-drive", "g5-save"}   # git, torch, pip, Drive, download


def test_optional_judge_passes_are_off_by_default_and_numbers_are_current():
    cells = {c["id"]: "".join(c["source"]) for c in load_nb()["cells"]}
    assert "RUN_SELF_CONSISTENCY = False" in cells["g5-self"] and "RUN_FINAL_ONLY = False" in cells["g5-final-only"]
    text = json.dumps(load_nb())
    assert "32.9%" not in text and "34.7% of 4,788 sessions" in text
    assert "G5 runs no model-written code" in cells["g5-drive"]


def test_notebook_cells_run_end_to_end_with_a_fake_judge(tmp_path, monkeypatch, capsys):
    out = tmp_path / "g5_out"
    out.mkdir()
    g2 = tmp_path / "g2"
    write_g2_fixture(g2)
    write_g2_native_run(g2 / "run1")
    items = g5_items.load_labc() + g5_items.load_g2(g2)
    assert sum(i["source"] == "g2" for i in items) == 10
    rng = random.Random(11)
    with open(out / "my_labels.csv", "w", newline="") as f:          # RANDOM labels: a fake human
        w = csv.DictWriter(f, fieldnames=g5_labels.CSV_COLUMNS)
        w.writeheader()
        for it in items:
            w.writerow({"item_id": it["item_id"], "source": it["source"], **random_labels(rng)})
    monkeypatch.setattr(g5_gpu, "query_nvidia_smi",
                        lambda: {"name": "Tesla T4", "mem_gb": 15.0, "cc_major": 7, "cc_minor": 5})
    monkeypatch.setitem(sys.modules, "vllm", types.SimpleNamespace(
        LLM=FakeLLM, SamplingParams=lambda **kw: types.SimpleNamespace(**kw)))

    ns = {}
    for c in load_nb()["cells"]:
        if c["cell_type"] != "code" or c["id"] in SKIP_CELLS:
            continue
        src = "".join(c["source"]).replace("/content/g5_out", str(out)).replace('G2_DIR = ""', f'G2_DIR = "{g2}"')
        # The two optional judge passes are off by default; switch them on so the test runs them too.
        src = src.replace("RUN_SELF_CONSISTENCY = False", "RUN_SELF_CONSISTENCY = True")
        src = src.replace("RUN_FINAL_ONLY = False", "RUN_FINAL_ONLY = True")
        py = "\n".join(l for l in src.splitlines() if not l.lstrip().startswith(("%", "!")))
        exec(compile(py, c["id"], "exec"), ns)
    printed = capsys.readouterr().out

    assert "NOT DONE yet" in printed and "sklearn" in printed
    table = list(csv.DictReader(open(out / "kappa_table.csv")))
    assert [r["field"] for r in table] == FIELD_NAMES and all(int(r["n"]) == len(items) for r in table)
    for name in ("judge_qwen3-4b_full.jsonl", "judge_qwen3-4b_final_only.jsonl", "judge_qwen3-4b_t07_s3.jsonl"):
        assert (out / name).exists(), name
    assert "grader-failed attempts clean" in printed and "you   vs rules" in printed

    rows = list(csv.DictReader(open(out / "disagreements.csv")))
    assert rows
    for r in rows[:5]:
        r.update(explanation_type="definition_unclear", explanation="Both labels fit the current definition of this field.")
    g5_stats.write_csv(rows, out / "disagreements.csv")
    done_cell = next(c for c in load_nb()["cells"] if c["id"] == "g5-done")
    exec(compile("".join(done_cell["source"]).replace("/content/g5_out", str(out)), "g5-done", "exec"), ns)
    assert capsys.readouterr().out.rstrip().endswith("DONE")
