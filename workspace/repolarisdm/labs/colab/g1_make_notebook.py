"""Build g1-pass-at-k.ipynb from the cells below (nbformat v4.5, no outputs).

Run: python g1_make_notebook.py            (writes the notebook next to this file)
     python g1_make_notebook.py --check    (exit 1 if the notebook is out of date)
Stdlib only.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

NOTEBOOK = Path(__file__).with_name("g1-pass-at-k.ipynb")
COLAB_URL = ("https://colab.research.google.com/github/ZelinZhu-Richard/ZelinZhu-Richard.github.io/"
             "blob/main/workspace/repolarisdm/labs/colab/g1-pass-at-k.ipynb")
HONEST_LABEL = ("Written and CPU-smoke-tested by an automated build on 2026-10-20. Never run on a GPU. "
                "Expect to fix version issues; pin what works and note it.")
CLONE = ("git clone --depth 1 --filter=blob:none --sparse "
         "https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io repo && cd repo && "
         "git sparse-checkout set workspace/repolarisdm/labs")
LAB_DIR = "/content/repo/workspace/repolarisdm/labs/colab"

CELLS: list[tuple[str, str, str]] = []


def md(cell_id: str, text: str) -> None:
    CELLS.append(("markdown", cell_id, text.strip("\n")))


def code(cell_id: str, text: str) -> None:
    CELLS.append(("code", cell_id, text.strip("\n")))


md("g1-header", f"""
# G1 · pass@k is a distribution

**Goal.** Polaris engineers measure how often a model solves a coding task. One run gives one number, but that number is only one draw from a distribution. In this lab you sample a small open coding model 50 times per problem, on 20 fresh problems, at three temperatures. Then you report pass@k, pass^k and intervals, each with a stated sampling frame. You will use the same statistics for Gemini runs on your own Polaris-style task (playbook Chapter 9, "Runs, statistics, and model weaknesses").

**Time and GPU budget** (estimates, not measured):
- Any Colab GPU works. A T4 (free tier) is enough. On 30 GB or more, the notebook picks the 7B model.
- Total on a T4: about 60-90 minutes. Install 5-10 min, model load 2-5 min, sampling 3,000 completions 10-25 min with vLLM (30-60 min with the transformers fallback), grading 5-10 min, analysis 20 min.
- GPU memory: the 1.5B model needs about 3 GB for weights. vLLM reserves 85-90% of the GPU anyway.
- A T4 uses about 1.2 Colab compute units per hour (reported by a third-party price list, March 2026).

**Done when:** you have
1. the per-temperature table: pass@1, pass@5, pass@10 and pass^5, each with a 95% interval,
2. the plot of pass@k against temperature, and
3. a 5-sentence interpretation, written by you in the cell near the end.

**Model:** Qwen2.5-Coder-1.5B-Instruct by default (Apache-2.0, not gated, so no Hugging Face token is needed).

> {HONEST_LABEL}

Colab link: {COLAB_URL}
""")

md("g1-ideas", """
## The ideas in 2 minutes

- **Sample**: one answer from the model for one prompt. With temperature above 0, every sample can differ.
- **Sampling frame**: the exact population your samples come from. Here it is *"n = 50 samples from one model + one prompt + one temperature on one problem"*. A rate describes its frame and nothing wider. Change the prompt or the model and you have a new frame.
- **pass@k**: the chance that at least one of k samples passes. With c passes out of n samples, the unbiased estimate is `1 - C(n-c, k) / C(n, k)` (Chen et al. 2021).
- **pass^k** ("pass hat k"): the chance that all k samples pass, `C(c, k) / C(n, k)` (tau-bench, Yao et al. 2024). It measures reliability. An agent you deploy must work every time, not once in k tries.
- **Wilson interval**: a 95% interval for one problem's pass rate c/n. It is fair here because the 50 samples are independent draws inside one frame.
- **Cluster bootstrap**: the mean over 20 problems needs a different interval. Samples of the same problem are correlated, so 1,000 samples are not 1,000 independent data points. We resample problems, then samples within each problem (Miller 2024, "Adding Error Bars to Evals").
- **Why one run proves little**: one run is one coin flip per problem. Step 12 measures, from your own data, how often one run ranks two temperatures in the wrong order.

**Why fresh problems?** The 20 problems were written on 2026-10-20 for this lab, so no model here has seen them. Some ideas are classic (Roman numerals, word wrap), so the model has seen *similar* problems; the exact specs and tests are new. The hidden tests are public in the repo, so future models may see them. `g1_tasks.py` carries a canary line to detect that.
""")

md("g1-step1", """
## Step 1 · Check the GPU

In Colab: **Runtime > Change runtime type > T4 GPU** (or better). Then run the cell. Do this before you import torch or vLLM.
""")

code("g1-gpu-smi", """
# Ask the driver which GPU this session has: name, memory, compute capability.
!nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv
""")

md("g1-step2", """
## Step 2 · Get the lab files

A sparse, shallow clone downloads only the `labs` folder of the playbook repo. Files on disk survive the restart in Step 3.
""")

code("g1-clone", f"""
# Download only workspace/repolarisdm/labs (shallow and sparse). Skips if already there.
%cd /content
!test -d repo || ({CLONE})
%cd {LAB_DIR}
import glob, shutil   # answer keys must never be on GitHub; if some were pushed, delete the local copies
for key_dir in glob.glob("/content/repo/workspace/repolarisdm/labs/*/_key"):
    print("WARNING: answer keys were pushed to GitHub:", key_dir, "- deleted here. Remove them from the repo.")
    shutil.rmtree(key_dir)
!ls g1_*
""")

md("g1-step3", """
## Step 3 · Install pinned packages, then restart

vLLM 0.31.0 pins torch 2.13.0, so it **replaces Colab's torch**. Python must restart afterwards. This cell saves your backend choice to a file, installs, then stops the Python process. Colab then says the session crashed. **That is expected.** Continue with Step 4.

- `BACKEND = "auto"` uses vLLM when the GPU supports it (compute capability 7.5 or higher), else plain transformers.
- If vLLM fails to install or to load, set `BACKEND = "transformers"` and run this cell again. It is slower but needs no new torch.
""")

code("g1-install", f"""
import os, subprocess, sys
sys.path.insert(0, "{LAB_DIR}")
import g1_gpu

BACKEND = "auto"   # "auto", "vllm" or "transformers"

gpu = g1_gpu.detect_gpu()                       # nvidia-smi only; torch is not imported
backend = g1_gpu.pick_backend(gpu, prefer=BACKEND)
pins = g1_gpu.INSTALL_PINS[backend]             # every package has an exact version
print("GPU:", gpu)
print("Backend:", backend, "| installing:", " ".join(pins))
subprocess.run([sys.executable, "-m", "pip", "install", "-q", *pins], check=True)
g1_gpu.save_backend(backend)                    # remembered across the restart

print("Restarting Python now. Colab will report a crash; that is expected. Go on with Step 4.")
os.kill(os.getpid(), 9)
""")

md("g1-step4", """
## Step 4 · Make a plan for this GPU (start here after the restart)

The plan picks the model size, precision and memory settings from the GPU's memory and compute capability:
- **T4** (16 GB, no native bf16): 1.5B model in float16, short context, CUDA graphs off to save memory.
- **L4** (24 GB): 1.5B model in bf16. The 7B model fits only just.
- **A100 / H100 / G4** (40 GB or more): 7B model in bf16.

Set `MODEL_SIZE = "1.5b"` on a big GPU if you want to compare with a T4 run.
""")

code("g1-plan", f"""
%cd {LAB_DIR}
import sys, time
sys.path.insert(0, "{LAB_DIR}")
import g1_gpu, g1_tasks, g1_grade, g1_sample, g1_stats, g1_report

MODEL_SIZE = None   # None = automatic; or "0.5b", "1.5b", "7b"

backend = g1_gpu.load_backend()
gpu = g1_gpu.detect_gpu()           # still nvidia-smi only: do not touch CUDA before vLLM
plan = g1_gpu.choose_plan(gpu, backend, model_size=MODEL_SIZE)
print(g1_gpu.format_plan(plan))
""")

md("g1-step5", """
## Step 5 · Check the grader before you trust it

A grader is code that turns an attempt into a number. Test it before you use it. This is the core Polaris habit (playbook Chapter 8). For every problem:
- the reference solution must **pass**,
- a do-nothing solution must **fail**,
- a planted, plausible wrong solution must **fail**.

Each program runs in its own subprocess with a 5-second timeout, a memory limit, blocked sockets and a temp folder. That subprocess gets only the inputs. The hidden tests run in the notebook's process, which compares the outputs, so the program never sees an expected value and cannot fake a pass. Outputs cross as plain data, so an object whose `__eq__` always says True fails. These checks stop accidents and simple tricks. The Colab VM is disposable, but this is still **not a security sandbox**: the program could read files on the disk, such as `g1_tasks.py`. Do not run untrusted model code this way on your own laptop.
""")

code("g1-validate", """
tasks = g1_tasks.load_tasks()
print(len(tasks), "problems. This is exactly what the model sees for the first one:\\n")
print(g1_sample.build_messages(tasks[0])[0]["content"])

check = g1_grade.validate_task_set(tasks)
print(check["summary"])
assert check["ok"], "The grader disagrees with a reference or wrong solution. Fix that before sampling."
""")

md("g1-step6", """
## Step 6 · Load the model

The first load downloads the weights (about 3 GB for 1.5B, 15 GB for 7B). After loading, torch is safe to import, so we confirm the GPU a second way with `torch.cuda.get_device_properties`.
""")

code("g1-load", """
t0 = time.time()
sampler = g1_sample.make_sampler(plan)        # vLLM or transformers, as planned
print(f"Model loaded in {time.time() - t0:.0f} s")

import torch                                   # safe now: the model is loaded
props = torch.cuda.get_device_properties(0)
print(f"{props.name}: {props.total_memory / 2**30:.1f} GB, compute capability {props.major}.{props.minor}")
print(f"GPU memory in use: {g1_gpu.used_memory_gb():.1f} GB (vLLM reserves most of it on purpose)")
""")

md("g1-step7", """
## Step 7 · Sample n = 50 completions per problem at three temperatures

Settings, the same on both backends:
- **Pure temperature sampling**: `top_p=1`, `top_k` off, no repetition penalty. We set these on purpose: the model's own defaults are top_p 0.8, top_k 20 and repetition penalty 1.1, and a sweep must change one thing only.
- **max_tokens = 512**. vLLM's default is 16, which would cut every answer. Answers cut at 512 count as failures; Step 8 reports how many.
- **Seeds**: fixed per problem and temperature, so a rerun on the same software repeats the samples (GPU kernels are not always bit-exact).

Files are saved after each temperature in `/content/g1_out`. If only the Python session restarts, run Steps 4, 5 and 6 again, then this cell: finished temperatures are reused. If the whole VM is gone, `/content` is wiped, so start again from Step 2.
""")

code("g1-sample", """
TEMPERATURES = (0.2, 0.6, 1.0)
N_SAMPLES = 50     # n per problem and temperature; must be at least the largest k (10)
MAX_TOKENS = 512
OUT = "/content/g1_out"

t0 = time.time()
records = g1_sample.run_sweep(sampler, tasks, TEMPERATURES, N_SAMPLES, MAX_TOKENS, OUT)
print(f"{len(records)} completions in {(time.time() - t0) / 60:.1f} min")
""")

md("g1-step8", """
## Step 8 · Grade every completion

The grader pulls the function out of each answer, runs the hidden tests, and records a status: `pass`, `wrong_answer`, `runtime_error`, `timeout`, `syntax_error`, `import_error`, `missing_function`, `no_code` or `crashed`. Identical programs are run once and the result is reused. Then two sanity checks: how many answers were cut off, and whether high temperatures really produce different programs.
""")

code("g1-grade", """
from IPython.display import Markdown, display

t0 = time.time()
graded = g1_grade.grade_records(records, tasks, timeout=5.0)
g1_sample.write_jsonl(f"{OUT}/graded.jsonl", graded)
print(f"Graded {len(graded)} completions in {time.time() - t0:.0f} s")
display(Markdown(g1_report.status_table(graded)))
print(g1_report.sanity_notes(graded))
""")

md("g1-step9", """
## Step 9 · Raw outcomes first: each problem's pass count

Each cell shows c/n and the Wilson 95% interval for that problem's pass rate. Frame: 50 samples from one model + one prompt + one temperature on one problem. `guess` is the author's difficulty guess, written before any model run.
""")

code("g1-per-problem", """
summary = g1_stats.summarize(graded, ks=(1, 5, 10), hat_ks=(5, 10), bootstrap=2000, seed=0)
display(Markdown(g1_report.markdown_table(g1_report.problem_rows(summary, tasks))))
""")

md("g1-step10", """
## Step 10 · pass@k and pass^k per temperature

Means over the 20 problems. The intervals come from the cluster bootstrap. It treats the 20 problems as if they were drawn at random from a population of similar problems. They were hand-picked, so read the interval as "how much the result depends on which problems we picked", not as a promise about all coding problems.
""")

code("g1-per-temperature", """
display(Markdown(g1_report.markdown_table(g1_report.temperature_rows(summary))))
print(g1_report.frame_note(summary))
g1_stats.save_summary(summary, f"{OUT}/summary.json")
""")

md("g1-step10b", """
## Step 10b · Is one temperature really better? The paired difference

Do not judge a difference by whether two intervals overlap. Both temperatures use the same 20 problems, and most of the spread in each interval comes from easy versus hard problems. That part is shared, so it cancels in the difference. This cell resamples the problems once for both temperatures (a paired cluster bootstrap) and gives an interval for the difference itself. If the interval contains 0, the data do not show a difference.
""")

code("g1-paired", """
paired = g1_stats.compare_temperatures(summary, metrics=("pass@1", "pass@10"), draws=2000, seed=0)
display(Markdown(g1_report.markdown_table(g1_report.paired_rows(paired))))
""")

md("g1-step11", """
## Step 11 · Plot pass@k against temperature

Left: the means with their intervals. Right: every problem's own pass rate (grey) and their mean. Watch how far single problems are from the mean.
""")

code("g1-plot", """
fig = g1_report.plot_pass_vs_temperature(summary)
fig.savefig(f"{OUT}/g1_pass_at_k.png", dpi=150, bbox_inches="tight")
""")

md("g1-step12", """
## Step 12 · Why one run proves little

We simulate what a single run would have reported: for each problem, take one random outcome with that problem's measured pass rate, then average over the 20 problems. Repeat 2,000 times. This uses only data you already have.
""")

code("g1-single-run", """
single = g1_stats.single_run_study(summary, runs=2000, seed=0)
print(g1_report.single_run_text(single))
fig2 = g1_report.plot_single_runs(single, summary)
fig2.savefig(f"{OUT}/g1_single_runs.png", dpi=150, bbox_inches="tight")
""")

md("g1-step13", """
## Step 13 · The numbers for your interpretation

This cell lists the numbers. It does not write the interpretation for you.
""")

code("g1-facts", """
print(g1_report.interpretation_facts(summary, single, paired))
""")

md("g1-interpretation", """
## Your interpretation (5 sentences, your own words)

Use one sentence for each point. Put a number and its interval in every sentence.
1. Which temperature gives the best pass@1? Use the paired difference from Step 10b and its interval: is 0 inside it? (Do not compare two separate intervals: the temperatures share the same problems.)
2. How does pass@10 change with temperature, and why (diversity against accuracy)?
3. What does the gap between pass@5 and pass^5 say about reliability?
4. How many problems are never or always solved, and what does that mean for using them as a benchmark?
5. What is the sampling frame, what do these numbers NOT tell you, and what would a single run have told you?

*Write here:*

1.
2.
3.
4.
5.
""")

md("g1-exercises", """
## Exercises (optional, 15-45 minutes each)

- **E1 Prompt sensitivity.** Set `RUN_PROMPT_EXPERIMENT = True` below and run it. It samples T = 0.6 again with a different instruction. Is the change in pass@1 bigger or smaller than the change between temperatures? The prompt is part of the frame.
- **E2 Lucky passes.** Pick a problem with 1-10 passes out of 50. Read three passing programs in `graded` (filter by `task_id` and `passed`). Find one that is wrong on an input the hidden tests do not cover. Add that assert to the task's `tests` in your copy of `g1_tasks.py`, reload, and grade again. How many passes flip? That is grader validity (Chapter 8). G3 pushes it further.
- **E3 Difficulty calibration.** Compare the `guess` column with the measured pass@1. Which guesses were wrong? A useful Polaris task is hard but not impossible: a 0% task is often a broken task.
- **E4 Sample size.** Run the E4 cell. It keeps only 10 samples per problem. How much wider do the intervals get? How many samples does a +/-5 point Wilson interval need at p = 0.5? (About 385.)
""")

code("g1-e1", """
RUN_PROMPT_EXPERIMENT = False   # E1: set True to run (about a third of the sampling time)
if RUN_PROMPT_EXPERIMENT:
    alt = g1_sample.run_sweep(sampler, tasks, (0.6,), N_SAMPLES, MAX_TOKENS, OUT,
                              instruction=g1_sample.ALT_INSTRUCTION, tag="alt")
    alt_summary = g1_stats.summarize(g1_grade.grade_records(alt, tasks), ks=(1, 5, 10), hat_ks=(5, 10))
    display(Markdown(g1_report.markdown_table(g1_report.temperature_rows(alt_summary))))
""")

code("g1-e4", """
# E4: the same analysis with only the first 10 samples of every problem.
small = g1_stats.summarize(g1_stats.subsample(graded, 10), ks=(1, 5, 10), hat_ks=(5, 10))
display(Markdown(g1_report.markdown_table(g1_report.temperature_rows(small))))
""")

md("g1-save", """
## Save your results

The Colab VM is wiped when the session ends. Download the zip (samples, grades, summary, plots).
""")

code("g1-download", """
import shutil
archive = shutil.make_archive("/content/g1_results", "zip", OUT)
print("Saved", archive)
try:
    from google.colab import files
    files.download(archive)
except Exception as exc:   # not in Colab, or the browser blocked it
    print("Download it from the Files panel on the left instead.", exc)
""")

md("g1-troubleshooting", """
## If something breaks

Write down every fix in a "version notes" cell: package versions, what failed, what worked.
- **vLLM install or import fails**: set `BACKEND = "transformers"` in Step 3 and run Steps 3-4 again.
- **CUDA out of memory**: use a smaller `MODEL_SIZE` in Step 4. Restart the runtime first, because freeing GPU memory inside one session is unreliable.
- **vLLM errors about "spawn" or multiprocessing**: run `import os; os.environ["VLLM_ENABLE_V1_MULTIPROCESSING"] = "0"` before Step 6.
- **Python 3.13 problems**: pin the older Colab runtime version 2026.07 (Python 3.12). How: https://research.google.com/colaboratory/runtime-version-faq.html
- **Session restarted mid-run**: run Steps 4, 5 and 6 again, then Step 7. Finished temperatures are reused. If the VM itself was recycled, `/content` is empty: start again from Step 2.
- **Saving a copy to GitHub**: first use *Edit > Notebook settings > Omit code cell output when saving*.
- **Secrets**: this lab needs none. If a later lab needs a Hugging Face token, store it as the Colab secret `HF_TOKEN`; `huggingface_hub` reads it by itself. Never print it.
""")

md("g1-sources", """
## Sources (checked 2026-10-20)

- Chen et al. 2021, "Evaluating Large Language Models Trained on Code" (pass@k): https://arxiv.org/abs/2107.03374
- Yao et al. 2024, "tau-bench" (pass^k): https://arxiv.org/abs/2406.12045
- Miller 2024, "Adding Error Bars to Evals" (clustered errors): https://arxiv.org/abs/2411.00640
- Wilson 1927, "Probable inference, the law of succession, and statistical inference", JASA 22:209-212.
- vLLM 0.31.0 source (`LLM.chat`, `SamplingParams`): https://github.com/vllm-project/vllm/tree/v0.31.0
- Qwen2.5-Coder-1.5B-Instruct model card and generation config: https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct
- Colab FAQ (limits, saving without outputs): https://research.google.com/colaboratory/faq.html
- Pins and GPU facts for these labs: `labs/colab/FACTS.md` in this repo.
""")


def build() -> dict:
    cells = []
    for kind, cell_id, text in CELLS:
        lines = text.split("\n")
        source = [line + "\n" for line in lines[:-1]] + [lines[-1]]
        cell = {"cell_type": kind, "id": cell_id, "metadata": {}, "source": source}
        if kind == "code":
            cell["execution_count"] = None
            cell["outputs"] = []
        cells.append(cell)
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


def render() -> str:
    return json.dumps(build(), indent=1, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    text = render()
    if "--check" in sys.argv:
        current = NOTEBOOK.read_text(encoding="utf-8") if NOTEBOOK.exists() else ""
        if current != text:
            print(f"{NOTEBOOK.name} is out of date; run python {Path(__file__).name}")
            sys.exit(1)
        print(f"{NOTEBOOK.name} is up to date")
    else:
        NOTEBOOK.write_text(text, encoding="utf-8")
        print(f"wrote {NOTEBOOK}")
