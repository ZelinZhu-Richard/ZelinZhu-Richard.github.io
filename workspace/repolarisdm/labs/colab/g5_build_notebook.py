"""Build g5-llm-judge-agreement.ipynb from the cell texts below (nbformat 4.5, no outputs).

Edit the cells here, not in the .ipynb. Then run, from labs/colab:
    python3 g5_build_notebook.py            # writes g5-llm-judge-agreement.ipynb next to this file
"""
import json
import sys
from pathlib import Path

CELLS = []


def md(cid, text):
    CELLS.append(("markdown", cid, text.strip("\n")))


def code(cid, text):
    CELLS.append(("code", cid, text.strip("\n")))


md("g5-header", r"""
# G5: Can an LLM label agent transcripts?

**Goal.** Polaris turns failed Gemini runs into named, evidenced weaknesses. That needs labels on many transcripts, and labels are slow to write by hand. So teams ask a model to write them. Before you trust such a model, a **judge**, you measure it against your own labels. In this lab you label 30–60 agent transcripts yourself, let a local open model label the same transcripts with one fixed prompt, and compute **Cohen's kappa** (agreement beyond chance) for each label field. Then you decide when an LLM judge is acceptable inside a grader.

**Time.** About 3–4 hours of your time: 1–2 hours labeling on your Mac (no GPU needed), 45–60 minutes in Colab, 45 minutes reading disagreements and writing.

**GPU budget.** One Colab session. T4 (the free-tier GPU): about 45–60 minutes. L4: about 30–45. A100 or larger: about 20–30. These are estimates from model sizes, not measurements, for the main judge pass only. The two optional judge passes in Part 2 are off by default; turning both on adds roughly 35–55 minutes on a T4. When you finish: Runtime > Disconnect and delete runtime.

**Done when:** you have the kappa table for all five fields (n, observed agreement, chance agreement, kappa and a 95% interval), and you have explained 5 disagreements in `disagreements.csv`, each with a type and at least one sentence. The last check cell tests both.

**Honest label.** Written and CPU-smoke-tested by an automated build on 2026-10-20. Never run on a GPU. Expect to fix version issues; pin what works and note it.

**What the data is.** The 12 Lab C transcripts are synthetic ("Synthetic, written for practice. Not real Gemini output."). The 5 sanity items are synthetic too. Your G2 transcripts are real output of a small open model, not Gemini. The judge is a small open model (Qwen), not Gemini.
""")

md("g5-overview", r"""
## How this lab works

| Part | Where | What you do |
|---|---|---|
| 0. Label first | your Mac, no GPU | Label every transcript on five fields in `my_labels.csv`. Blind: before any judge output exists. |
| 1. Setup | Colab | Clone the lab files, check the GPU, install pinned packages, restart. |
| 2. Judge | Colab GPU | Freeze your labels (a hash), run the judge with a fixed prompt, check it on 5 sanity items. |
| 3. Agreement | Colab | Kappa per field with a 95% interval, cross-checked with scikit-learn; confusion matrices. |
| 4. Where it fails | Colab | Per-label recall, label bias, slices, a deterministic rater, the grader's outcome (G2). |
| 5. Explain 5 | Colab or Mac | Explain 5 disagreements in `disagreements.csv`. |
| 6. Decide | here | When is an LLM judge acceptable inside a grader? Write your answer with your numbers. |

**The five fields** (the same definitions for you and for the judge; print them with `python3 g5_labels.py fields`):

| Field | Values | Short meaning |
|---|---|---|
| `verdict` | clean, flawed | clean = no row of the mistake card applies. |
| `mistake_row` | none, M1–M10, other | The row that best explains why it is flawed. |
| `phase` | none, localize, repair, verify, environment, harness | Phase of the first wrong turn (chapter 9 of the playbook). |
| `oversold` | yes, no | The final message claims something no tool output supports. |
| `checked_after_last_edit` | yes, no | After its last edit, the agent ran something that executes the code. |

The fields are a subset of the playbook's transcript-label schema (chapter 9). The judge may also answer `unknown`. You may not.

**Do Lab C before this lab.** Later cells print facts about the Lab C transcripts, and those facts can spoil it.
""")

md("g5-part0", r"""
## Part 0. Label first, on your Mac (blind)

Labeling takes reading time, not GPU time. Do it on your Mac, before you connect to a GPU. From the top of your portfolio repo:

```console
$ cd workspace/repolarisdm/labs/colab
$ python3 g5_labels.py fields                        # read the five definitions once
$ python3 g5_labels.py template --out my_labels.csv  # one row per transcript, label cells empty
$ python3 g5_labels.py show labc-01 | less           # read an item exactly as the judge will see it
$ python3 g5_labels.py check my_labels.csv           # fix every PROBLEM line before you upload
```

With G2 attempts, add `--g2 <your G2 run folder>` to `template`, `show` and `check`. The run folder is the zip that G2 downloads, unpacked: `config.json`, `attempts.jsonl`, `transcripts/a000.jsonl` and so on. Then:
- Item ids look like `g2-transcripts_a007`. Always pass the run folder itself, here and in Colab, so the ids match. Grades, the diff record and bookkeeping are never shown to the judge. The grade is kept for Part 4.
- If you saved human labels in G2 (`labels.jsonl`), `template` fills `verdict`, `mistake_row` and `phase` for those attempts. They were blind too. You still fill `oversold` and `checked_after_last_edit`.
- Long replies and tool outputs are capped per turn (2,500 and 2,000 characters). The final diff shows the net change. You and the judge see the same capped text.
- Other transcript formats (`*.jsonl`, `*.json`, rendered `*.md`) also load. Check one item with `show` first.

Rules:
- Label every row before you run the judge. Never look at judge output first. The notebook freezes a hash of your file before the judge runs and checks it again before the analysis.
- You can also run code (Lab C's practice copy). The judge cannot. Write `ran code` in `notes` when your label came from running something. That helps you explain disagreements later.
- If you already scored Lab C against your local answer key, your `verdict` and `mistake_row` labels are key-informed. That is fine, but say so in your write-up.
- Aim for 30–60 items: the 12 Lab C items plus 20–50 G2 attempts. With 12 items only, kappa is very rough, and the interval will show it.
""")

md("g5-part1", r"""
## Part 1. Setup

Run the next three cells in order. The install cell restarts the session at its end. That is expected.
""")

code("g5-clone", r"""
# Get the lab files: a shallow, sparse clone of the playbook repo (only the labs folder).
!cd /content && ([ -d repo ] || git clone --depth 1 --filter=blob:none --sparse https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io repo) && cd repo && git sparse-checkout set workspace/repolarisdm/labs
%cd /content/repo/workspace/repolarisdm/labs/colab
import glob, shutil   # answer keys must never be on GitHub; if some were pushed, delete the local copies
for key_dir in glob.glob("/content/repo/workspace/repolarisdm/labs/*/_key"):
    print("WARNING: answer keys were pushed to GitHub:", key_dir, "- deleted here. Remove them from the repo.")
    shutil.rmtree(key_dir)
!ls g5_*.py ../lab-c/patches
""")

code("g5-gpu", r"""
# Which GPU did Colab give you? nvidia-smi first (no CUDA init), then Colab's own torch confirms it.
import g5_gpu
PLAN = g5_gpu.make_plan(g5_gpu.query_nvidia_smi())   # raises a clear error on a CPU runtime
print(g5_gpu.describe_plan(PLAN))

import torch                                          # Colab's preinstalled torch; the restart below resets CUDA
p = torch.cuda.get_device_properties(0)
print(f"torch sees: {p.name}, {p.total_memory / 2**30:.1f} GiB, compute capability {p.major}.{p.minor}")
print("native bf16:", p.major >= 8, "(on a T4, torch.cuda.is_bf16_supported() may say True: it counts emulation)")
""")

code("g5-install", r"""
# Pinned installs (versions checked on PyPI on 2026-10-20). vLLM brings its own torch (2.13.0), which
# replaces Colab's, so the session must restart afterwards. This takes about 5-10 minutes.
# If you change a pin to make it work, write the working versions here and in your notes.
!pip install -q vllm==0.31.0 transformers==5.17.0
!vllm download-kernels || echo "download-kernels is not available in this vLLM version; continuing"
import os; os.kill(os.getpid(), 9)   # restart: Colab says the session crashed. That is expected.
""")

md("g5-after-restart", r"""
After the restart, start here. Do not rerun the install cell.

Two settings live in the next cell:
- `G2_DIR`: your G2 run folder (the one with `attempts.jsonl` and `transcripts/`). Leave it empty to use Lab C only. Point it at the same level as `--g2` on your Mac, or the item ids will not match your sheet. To get the folder into Colab, use the optional cell after the setup cell.
- `JUDGE_OVERRIDE`: leave it empty. The plan picks the judge for your GPU: Qwen3-4B-Instruct-2507 on every GPU with at least 14 GB. Set it only to compare judges later (end of Part 4).

No Hugging Face token is needed: the three judge models are Apache-2.0 and not gated (Hub API, checked 2026-10-20). If you keep an `HF_TOKEN` in Colab's secrets (key icon), `huggingface_hub` reads it by itself. Never print it.
""")

code("g5-setup", r"""
# Back to the lab folder (the restart reset it), load the helpers, rebuild the plan with nvidia-smi only.
%cd /content/repo/workspace/repolarisdm/labs/colab
import json, os
from pathlib import Path
import g5_gpu, g5_items, g5_judge, g5_labels, g5_stats

G2_DIR = ""           # your G2 run folder, e.g. "/content/g2_upload"; "" = Lab C only
JUDGE_OVERRIDE = ""   # "" = pick by GPU; or "qwen3-4b", "qwen2.5-coder-1.5b", "qwen2.5-coder-7b"
OUT = Path("/content/g5_out"); OUT.mkdir(exist_ok=True)   # survives restarts, not a deleted runtime

PLAN = g5_gpu.make_plan(g5_gpu.query_nvidia_smi(), override=JUDGE_OVERRIDE or None)
print(g5_gpu.describe_plan(PLAN))
!pip list 2>/dev/null | grep -iE "^(vllm|torch|transformers) "
""")

code("g5-drive", r"""
# Optional: bring your G2 run folder into Colab. Uncomment ONE option and run it before the next cell.
# A) Upload the zip that G2 downloaded. Then G2_DIR = "/content/g2_upload"
# from google.colab import files; import shutil
# for name in files.upload(): shutil.unpack_archive(name, "/content/g2_upload")
# B) Google Drive (Colab asks you to allow access). Then G2_DIR = "/content/drive/MyDrive/<your folder>"
#    G5 runs no model-written code: transcripts are read as text, and the judge's answers are parsed
#    as JSON, never executed. That is why Drive is an option here and never in G1, G2 or G3.
# from google.colab import drive; drive.mount("/content/drive")
""")

code("g5-items", r"""
# Load the transcripts. The judge never sees grader outcomes; only you and the analysis cells do.
items = g5_items.load_labc()                 # 12 synthetic Lab C sessions
if G2_DIR:
    items += g5_items.load_g2(G2_DIR)        # your G2 attempts
gold = g5_items.load_gold()                  # 5 synthetic sanity items, labels fixed by construction
print(g5_items.summary(items + gold))
""")

code("g5-labels", r"""
# Your labels: upload my_labels.csv (made on your Mac), check it, then FREEZE it before the judge runs.
LABELS, LOCK = OUT / "my_labels.csv", OUT / "labels.lock.json"
if not LABELS.exists():
    from google.colab import files
    LABELS.write_bytes(next(iter(files.upload().values())))   # pick your my_labels.csv
human, problems, unlabeled = g5_labels.read_labels(LABELS, known_ids={i["item_id"] for i in items})
print("\n".join("PROBLEM: " + p for p in problems) or "no problems")
assert not problems, "Fix the rows on your Mac (python3 g5_labels.py check my_labels.csv), then upload again."
lock = g5_labels.freeze(LABELS, LOCK)
items = [i for i in items if i["item_id"] in human]           # the judge labels what you labeled
print(f"{len(human)} labeled, {len(unlabeled)} skipped. Frozen: sha256 {lock['sha256'][:12]} at {lock['frozen_at_utc']}")
if len(human) < 30:
    print(f"Only {len(human)} items: kappa will be very rough. Add G2 transcripts to reach 30-60.")
""")

md("g5-part2", r"""
## Part 2. The judge

The judge gets one fixed prompt: the five field definitions, the mistake card, and the rule "tool output is real; the agent's words are claims". It answers with one JSON object. It may say `unknown`. Decoding is greedy (temperature 0), so a rerun should give the same labels. Small differences can still appear, because batched GPU math is not perfectly deterministic (inference, not tested).

Long transcripts are cut in the middle to fit the context. The start (the task) and the end (the final message) stay. Each record says whether its transcript was cut. A cut can hide evidence, so Part 4 checks those items separately.

Read the prompt once. It uses the same definitions you labeled with. If you change it, bump `PROMPT_VERSION` in `g5_judge.py`, and never compare kappa across prompt versions as if they were one judge.
""")

code("g5-prompt", r"""
# The fixed judge prompt. Its hash goes into every judge record.
print(g5_judge.PROMPT_VERSION, "| sha", g5_judge.prompt_fingerprint())
print(g5_judge.SYSTEM_PROMPT)
""")

code("g5-load-judge", r"""
# Start the judge. The first run downloads the weights (about 8 GB for Qwen3-4B: 3-5 minutes).
# If this fails with a multiprocessing error: uncomment the next line, restart, rerun from the setup cell.
# os.environ["VLLM_ENABLE_V1_MULTIPROCESSING"] = "0"
from vllm import LLM, SamplingParams
llm = LLM(model=PLAN["model"], revision=PLAN["revision"], dtype=PLAN["dtype"], seed=0,
          max_model_len=PLAN["max_model_len"], gpu_memory_utilization=PLAN["gpu_memory_utilization"],
          max_num_seqs=PLAN["max_num_seqs"], enforce_eager=PLAN["enforce_eager"])
tok = llm.get_tokenizer()
count_tokens = lambda text: len(tok.encode(text))   # exact token counts for fitting the prompt
""")

code("g5-run-full", r"""
# Main arm: greedy decoding, full transcript, same prompt for every item. Gold items run in the same batch.
assert g5_labels.check_frozen(LABELS, LOCK), "my_labels.csv changed after freezing"
GREEDY = SamplingParams(temperature=0.0, max_tokens=PLAN["max_new_tokens"], seed=0)
KEY = PLAN["judge_key"]
full = g5_judge.run_judge(llm, items + gold, GREEDY, "full", PLAN, count_tokens=count_tokens)
g5_judge.save_jsonl(full, OUT / f"judge_{KEY}_full.jsonl")
print(g5_judge.health(full))
print("\nfirst raw output:\n" + full[0]["raw"][:800])
""")

md("g5-fp16-note", r"""
**If every output is empty, repeats one character, or is not JSON:** on a T4 the judge runs in fp16 (the T4 has no native bf16). Some checkpoints overflow in fp16. That was not tested here (uncertain). Try `JUDGE_OVERRIDE = "qwen2.5-coder-1.5b"`: Runtime > Restart session, edit the setup cell, and rerun from there. Your frozen labels stay in `/content/g5_out`.
""")

code("g5-gold", r"""
# Sanity items: labels fixed by construction (real shell output, scripted sessions). A judge that
# misses these is not reading the transcript. They are NOT part of the kappa table.
gold_rows = g5_judge.score_gold([r for r in full if r["source"] == "gold-synthetic"], gold)
print(g5_stats.format_table(gold_rows))
right = sum(r["ok"] for r in gold_rows)
print(f"\n{right} of {len(gold_rows)} gold fields right.",
      "Read the raw outputs before you trust any number below." if right < 0.75 * len(gold_rows) else "")
""")

code("g5-self", r"""
# Optional (3 more judge passes, about 3x the main run; on a T4 about 30-45 extra minutes, a guess):
# does the judge agree with ITSELF? Three samples at temperature 0.7.
# A judge that disagrees with itself cannot agree well with you. Off by default to keep the stated budget.
RUN_SELF_CONSISTENCY = False
if RUN_SELF_CONSISTENCY:
    runs = []
    for s in (1, 2, 3):
        hot = SamplingParams(temperature=0.7, top_p=0.95, max_tokens=PLAN["max_new_tokens"], seed=s)
        recs = g5_judge.run_judge(llm, items, hot, f"t07_s{s}", PLAN, count_tokens=count_tokens)
        g5_judge.save_jsonl(recs, OUT / f"judge_{KEY}_t07_s{s}.jsonl")
        runs.append(g5_judge.labels_by_item(recs))
    for f in g5_labels.FIELD_NAMES:
        print(f"{f:25s} judge vs judge, mean pairwise kappa: {g5_stats.pairwise_kappa(runs, f):.2f}")
""")

code("g5-final-only", r"""
# Optional ablation (1 more pass, but with short inputs; on a T4 about 5-10 extra minutes, a guess):
# the judge sees ONLY the task and the agent's final message. If its labels barely change, it was
# trusting the claim, not reading the evidence. Off by default to keep the stated budget.
RUN_FINAL_ONLY = False
if RUN_FINAL_ONLY:
    fo = g5_judge.run_judge(llm, items, GREEDY, "final_only", PLAN, mode="final_only", count_tokens=count_tokens)
    g5_judge.save_jsonl(fo, OUT / f"judge_{KEY}_final_only.jsonl")
    a, b = g5_judge.labels_by_item(full), g5_judge.labels_by_item(fo)
    for f in g5_labels.FIELD_NAMES:
        print(f"{f:25s} unchanged without evidence: {sum(a[i][f] == b[i][f] for i in b)}/{len(b)}")
""")

md("g5-part3", r"""
## Part 3. Agreement

For each field, with n items labeled by you and by the judge:
- **p_o** (observed agreement): the share of items where both gave the same label.
- **p_e** (chance agreement): the agreement two raters would reach by labeling at random with their own label mix. For each label, multiply the two raters' shares of it, then add.
- **kappa** = (p_o − p_e) / (1 − p_e). 1 = perfect, 0 = no better than chance, below 0 = worse than chance. Undefined when p_e = 1.
- **answered**: items where the judge gave a schema value. In `kappa`, an `unknown` or broken answer counts as a disagreement, because a grader that abstains still needs a human. `kappa_answered` uses answered items only.
- **95% interval** (`ci_lo`, `ci_hi`): a percentile bootstrap. Attempts at one task are correlated, so with 5 or more G2 tasks the bootstrap resamples whole tasks. G2 usually runs one task (Lab F); then it resamples single transcripts, and the interval speaks only about transcripts of that task. The cell prints which frame it used.

How to read the interval. Lab C is a hand-built set (10 flawed and 2 clean patches, per its README). On it, the interval only shows how much kappa moves when you resample these 12 items. It is not an estimate for "transcripts in general". For G2, the frame is "attempts by one agent configuration on G2's tasks". Say the frame whenever you quote a number.

Bands like "0.61–0.80 = substantial" (Landis and Koch, 1977) are a convention, not a test. Report n, p_o, kappa, the interval and the confusion matrix.
""")

code("g5-kappa", r"""
# Kappa per field: you vs the judge (main arm).
assert g5_labels.check_frozen(LABELS, LOCK), "my_labels.csv changed after freezing: the comparison is not blind any more"
judge = g5_judge.labels_by_item([r for r in full if r["item_id"] in human])
units, frame = g5_items.clusters_for(items)
print(frame)
table = g5_stats.agreement_table(human, judge, g5_labels.FIELD_NAMES, clusters=units)
print(g5_stats.format_table(table, ["field", "n", "answered", "p_o", "p_e", "kappa", "ci_lo", "ci_hi", "kappa_answered"]))
g5_stats.write_csv(table, OUT / "kappa_table.csv")
""")

code("g5-sklearn", r"""
# Cross-check our kappa with scikit-learn (preinstalled on Colab). The CPU smoke test does the same.
try:
    from sklearn.metrics import cohen_kappa_score
    ids = sorted(set(human) & set(judge))
    for row in table:
        f = row["field"]
        sk = cohen_kappa_score([human[i][f] for i in ids], [judge[i][f] for i in ids])
        print(f"{f:25s} ours {row['kappa']:.4f}   sklearn {sk:.4f}")
except ImportError:
    print("scikit-learn is not installed here; skipped")
""")

code("g5-confusion", r"""
# Confusion matrix per field: rows = your label, columns = the judge's label.
ids = sorted(set(human) & set(judge))
for f in g5_labels.FIELD_NAMES:
    labs = g5_stats.labels_in_use(human, judge, f)
    m = g5_stats.confusion_matrix([human[i][f] for i in ids], [judge[i][f] for i in ids], labs)
    print(f"\n{f}\n" + g5_stats.format_confusion(m, labs))
""")

md("g5-part4", r"""
## Part 4. Where the judge fails

Kappa is one number. These cells show where it comes from.
- **Per label:** for each label you used, how often the judge gave the same one. A judge can be good at `flawed` and blind to `clean`.
- **Label mix:** how often each rater uses each label. If the judge says `oversold: no` far more often than you, it is lenient. **kappa_max** is the highest kappa possible with the two label mixes. When it is low, the gap is a bias, not item-by-item noise.
- **The kappa paradox:** with one dominant label (Lab C has 10 flawed of 12), p_e is high, so kappa can be low even when p_o is high. Read the per-label table before you blame the judge.
- **Slices:** synthetic Lab C vs real G2, and cut vs uncut transcripts. Slices are small: read counts, not decimals.
- **A deterministic rater:** `checked_after_last_edit` can be computed with rules from the transcript. Where a rule exists, you do not need a judge.
- **The grader (G2 only):** the hidden tests' outcome is ground truth for "did it pass". A judge that calls a grader-failed attempt `clean` made a false accept. The other direction is not always an error: a passing attempt can still be flawed (a cheat, an oversold message).
""")

code("g5-per-class", r"""
# Per label you used: how often did the judge give the same label? And who uses which label how often?
for f in g5_labels.FIELD_NAMES:
    kmax = next(r["kappa_max"] for r in table if r["field"] == f)
    print(f"\n== {f}   (kappa_max for these label mixes: {kmax:.2f})")
    print(g5_stats.format_table(g5_stats.per_class(human, judge, f)))
    print(g5_stats.format_table(g5_stats.marginals(human, judge, f)))
""")

code("g5-slices", r"""
# Slices: synthetic Lab C vs real G2, and cut vs uncut transcripts.
slices = [("labc", lambda r: r["source"] == "labc-synthetic"), ("g2", lambda r: r["source"] == "g2"),
          ("cut transcript", lambda r: r["truncated"]), ("uncut", lambda r: not r["truncated"])]
for name, keep in slices:
    sub = {r["item_id"]: r["labels"] for r in full if r["item_id"] in human and keep(r)}
    if sub:
        rows = g5_stats.agreement_table(human, sub, g5_labels.FIELD_NAMES, reps=500)
        print(f"\n{name} (n={len(sub)})\n" + g5_stats.format_table(rows, ["field", "n", "p_o", "kappa"]))
""")

code("g5-rules", r"""
# A deterministic rater for one field: rules read checked_after_last_edit from the transcript.
# The rules are a heuristic too. Open two items where they disagree with you and decide who is right.
F = ["checked_after_last_edit"]
rules = {i["item_id"]: {F[0]: g5_items.mechanical_checked_after_last_edit(i["transcript"])} for i in items}
for name, rater in (("you  ", human), ("judge", judge)):
    row = g5_stats.agreement_table(rater, rules, F, reps=500)[0]
    print(f"{name} vs rules: n={row['n']} p_o={row['p_o']:.2f} kappa={row['kappa']:.2f}")
""")

code("g5-grader", r"""
# G2 only: compare verdicts with the grader's outcome (G2's strong grader if you had one, else weak).
# Rates get a Wilson interval only here: G2 attempts are a sample of one agent configuration's
# attempts, not a hand-picked set.
g2 = [i for i in items if i["source"] == "g2" and i["outcome"] in ("pass", "fail")]
fails = [i for i in g2 if i["outcome"] == "fail"]
if fails:
    for who, lab in (("you", human), ("judge", judge)):
        fa = sum(lab[i["item_id"]]["verdict"] == "clean" for i in fails)
        lo, hi = g5_stats.wilson(fa, len(fails))
        print(f"{who:5s} called {fa} of {len(fails)} grader-failed attempts clean (Wilson 95% [{lo:.2f}, {hi:.2f}])")
    print("Assumes independent attempts. Several attempts per task are correlated, so the interval is too narrow then.")
else:
    print("No G2 attempts with a grader outcome; skipped.")
""")

code("g5-compare-judges", r"""
# Optional: compare judges. To add one: Runtime > Restart session, set JUDGE_OVERRIDE in the setup cell,
# and rerun from there. Frozen labels and earlier judge files stay in /content/g5_out.
for path in sorted(OUT.glob("judge_*_full.jsonl")):
    jl = g5_judge.labels_by_item([r for r in g5_judge.load_jsonl(path) if r["item_id"] in human])
    rows = g5_stats.agreement_table(human, jl, g5_labels.FIELD_NAMES, reps=200)
    print(path.name, {r["field"]: round(r["kappa"], 2) for r in rows})
""")

md("g5-part5", r"""
## Part 5. Explain 5 disagreements

The next cell writes every disagreement to `/content/g5_out/disagreements.csv`, with the judge's evidence quote. Pick 5. Prefer different items, different fields, and both directions (you said flawed and the judge said clean, and the reverse). For each one:
1. Reread the item (the cell after the next one shows it next to the judge's answer).
2. Decide who is right, with evidence: a transcript line, a command you ran, or a definition.
3. Fill `explanation_type` with one type below and `explanation` with one or two sentences.

| Type | Meaning |
|---|---|
| `judge_misread` | The evidence is in what the judge saw; it missed or misread it. |
| `judge_no_access` | The right label needs evidence the judge cannot see: running code, the repo, the spec. |
| `judge_trusted_claim` | The judge believed the agent's final message over the tool output. |
| `my_label_wrong` | On rereading, the judge is right and your label was wrong. |
| `definition_unclear` | The schema allows both labels. Fix the definition, then relabel. |
| `format_failure` | The judge output did not parse, abstained, or broke the field rules. |

If your label was wrong, do not edit `my_labels.csv`. Kappa stays on the frozen labels. Record it here; that is part of the result: you are a noisy rater too.

To edit the CSV: double-click it in Colab's file browser (left sidebar, folder icon), or download it, edit it, and upload it to the same path.
""")

code("g5-disagreements", r"""
# Every disagreement, with the judge's evidence quote.
dis = g5_stats.disagreements(human, [r for r in full if r["item_id"] in human], g5_labels.FIELD_NAMES)
DIS = OUT / "disagreements.csv"
if not DIS.exists():                    # never overwrite your explanations
    g5_stats.write_csv(dis, DIS)
print(f"{len(dis)} disagreements; file: {DIS}")
print(g5_stats.format_table(dis[:40], ["item_id", "field", "mine", "judge", "judge_evidence"]))
""")

code("g5-inspect", r"""
# Read one item next to the judge's answer. Set ITEM to any item_id from the table above.
ITEM = dis[0]["item_id"] if dis else items[0]["item_id"]
rec = next(r for r in full if r["item_id"] == ITEM)
print("you:  ", human[ITEM])
print("judge:", rec["labels"], "| cut:", rec["truncated"])
print("judge reasoning:", rec["reasoning"])
print("\n" + g5_judge.build_user_message(next(i for i in items if i["item_id"] == ITEM))[-4000:])
""")

code("g5-done", r"""
# Done-when check: the kappa table exists and at least 5 disagreements are explained.
ok, probs, enough = g5_stats.check_explanations(OUT / "disagreements.csv")
print("\n".join(probs) or "no problems in disagreements.csv")
have_table = (OUT / "kappa_table.csv").exists()
print(f"kappa table: {have_table}; explained disagreements: {len(ok)} (need 5)")
print("DONE" if have_table and enough else "NOT DONE yet")
""")

md("g5-part6", r"""
## Part 6. When is an LLM judge acceptable inside a grader?

A **grader** turns an attempt into a number that people compare across models. A judge inside it is part of the measuring instrument. Use your own numbers from Parts 3–5 to answer. These rules are our reasoning (inference), with sources where a source exists:

1. **If rules or tests can decide it, do not use a judge.** Your deterministic rater for `checked_after_last_edit` is the example. METR's task guide says scoring should be automatic and should avoid LLM judges ([METR, checked 2026-10-20](https://taskdev.metr.org/desiderata/)).
2. **Measure before you trust.** Calibrate the judge against human labels on the same kind of transcripts, give it an "unknown" escape hatch, and use one judge per dimension ([Anthropic, "Demystifying evals for AI agents", checked 2026-10-20](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)). The ABC checklist also asks you to pilot-test judge accuracy and self-consistency ([Zhu, Kang et al., checked 2026-10-20](https://arxiv.org/html/2507.02825v5)).
3. **Compare with the human ceiling.** If two humans reach kappa 0.7 on a field, a judge at 0.7 is as good as a second human. A judge at 0.3 is not. No second human? Relabel a sample yourself a week later, blind, and use that self-agreement (chapter 9).
4. **Look at the costly error, not only kappa.** In a benchmark grader, a false accept (a flawed attempt called clean) inflates scores. In triage, a false alarm only costs reading time. Read the confusion matrix.
5. **Under RL pressure, every judge error is a target.** If the judge trusts confident final messages (the optional final-only ablation in Part 2 tests this), a policy trained against it learns to oversell. G3 shows the same thing for weak tests.
6. **Do not let a model judge its own family.** LLM judges recognize and favor their own outputs ([Panickssery, Bowman, Feng, NeurIPS 2024, checked 2026-10-20](https://arxiv.org/abs/2404.13076)). In this lab a Qwen judge reads G2 transcripts from a Qwen coder. Say so when you report.
7. **Pin it and re-validate it.** Model revision, prompt hash and decoding settings are part of the grader. A new judge version is a new instrument: rerun the agreement check.
8. **Report judged numbers with the caveat.** For example, Transluce's overselling rate, 34.7% of 4,788 sessions in one public dataset, was measured by an LLM judge ([Transluce, 2026-08-05, checked 2026-10-20](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1)).

A working answer to defend: a judge can sit inside a grader only when (a) no deterministic check exists for that field, (b) its measured agreement on this kind of transcript is close to human-human agreement, with an interval, (c) its errors do not reward a behavior a policy can learn, (d) it is pinned, and (e) a human audits a random sample of its decisions on each new batch. Otherwise use it for triage: to decide which transcripts a human reads first, not to produce the score.
""")

md("g5-your-answer", r"""
**Your answer (edit this cell).** 5–8 sentences. Quote your kappa for at least two fields with n and the interval, name the judge's most common failure type from Part 5, and say for which field (if any) you would let this judge into a grader, and with which safeguard.
""")

md("g5-part7", r"""
## Part 7. Save your work

Download the results folder: your frozen labels, the lock file, every judge record, the kappa table and your explained disagreements. Then:
- Edit > Notebook settings > tick "Omit code cell output when saving this notebook".
- File > Save a copy in Drive (the GitHub copy is read-only).
- Runtime > Disconnect and delete runtime, so the GPU stops counting.

Ideas for later (not built here): one judge prompt per field; a larger judge on an A100; swap the order of diff and transcript to test order effects; ask a second person to label 20 items and compute human-human kappa.
""")

code("g5-save", r"""
# Zip /content/g5_out and download it.
import shutil
from google.colab import files
files.download(shutil.make_archive("/content/g5_results", "zip", OUT))
""")


def to_source(text):
    lines = text.split("\n")
    return [l + "\n" for l in lines[:-1]] + [lines[-1]]


def build():
    cells = []
    for kind, cid, text in CELLS:
        c = {"cell_type": kind, "id": cid, "metadata": {}, "source": to_source(text)}
        if kind == "code":
            c["execution_count"] = None
            c["outputs"] = []
        cells.append(c)
    return {
        "cells": cells,
        "metadata": {
            "accelerator": "GPU",
            "colab": {"gpuType": "T4", "provenance": []},
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("g5-llm-judge-agreement.ipynb")
    nb = build()
    with open(out, "w", encoding="utf-8") as f:
        json.dump(nb, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {out}: {len(nb['cells'])} cells")
