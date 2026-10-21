# GPU practice on Colab (G1 to G5)

Five Google Colab notebooks. Each one makes you do one piece of Polaris work on a small open model,
with a real GPU: measure, run agents, attack a grader, probe contamination, check a judge.
This folder belongs to Chapter 15 of the playbook, "GPU practice on Colab"
(https://zelinzhu-richard.github.io/repolarisdm/gpu-practice/).

> Written and CPU-smoke-tested by an automated build on 2026-10-20. Never run on a GPU. Expect to fix version issues; pin what works and note it.

What that means in practice:
- The pure-Python parts (task sets, graders, statistics, GPU plans, label checkers) were run by
  357 CPU smoke tests on a Mac. They all passed.
- Model loading, sampling, the agent loop against a real model, GRPO training and the judge were
  **never run**. Every time and memory number below is an estimate from model sizes, not a measurement.
- G2's lock (sandbox users, `chmod`, the network block) needs root on Linux, so it never ran either.
  The smoke tests check its logic; on Colab its probe must pass before any attempt runs.
- Package pins were checked on PyPI on 2026-10-20, but never installed together on a GPU.
  When something breaks, fix it, pin the version that works, and write it down.

## The five assignments

| Lab | Notebook | What you do | Why Polaris cares | Done when |
|---|---|---|---|---|
| G1 | `g1-pass-at-k.ipynb` | Sample a small coding model 50 times per problem, on 20 fresh problems, at 3 temperatures. Grade every sample. Report pass@k and pass^k with 95% intervals. | One run of Gemini on a task is one draw from a distribution. You need the same statistics for your own task (Chapter 9). | The per-temperature table with intervals, the pass@k-vs-temperature plot, and your own 5-sentence interpretation. |
| G2 | `g2-agent-runs.ipynb` | Run a tiny tool-using agent loop with a local model on the Lab F task, 20 to 100 attempts. Grade each attempt with **your** strong grader from Lab F and with the lab's weak grader. Label five failures. | Running a model many times and naming its failures is how Polaris finds model weaknesses. | 20+ graded attempts saved as transcripts; pass@k and pass^k with intervals for both graders; 5 failures labeled (first wrong turn, phase, mistake-card row) and accepted by the validator. |
| G3 | `g3-reward-hacking-grpo.ipynb` | Train one small model twice with GRPO and LoRA: run A gets a weak grader as reward, run B a strong one. Watch reward against held-out correctness. Hunt for hacks. | A grader that is "good enough" for an eval can be exploited when it becomes an RL reward. Polaris also builds data that trains Gemini. | The two-curve plot for both runs; 3 hacks from run A explained in your words, or an honest null result; the package versions that worked. |
| G4 | `g4-contamination-probe.ipynb` | Score public benchmark text, paraphrases and fresh text with Min-K% Prob on small models. Compute AUC with a bootstrap interval. Check the confounds. | A task only measures skill if the model has not seen it. This shows why Polaris hand-builds fresh tasks. | The last cell prints `DONE`: the primary AUC with its 95% interval, and your own 5-sentence limits paragraph. |
| G5 | `g5-llm-judge-agreement.ipynb` | Label 30 to 60 agent transcripts yourself, blind. Let a local model label the same ones with a fixed prompt. Compute Cohen's kappa per field. | Labeling many failed runs needs a judge. You must measure a judge before you put it inside a grader. | The kappa table for all five fields with 95% intervals, and 5 disagreements explained in `disagreements.csv`. |

Words used above:
- **pass@k**: the chance that at least one of k attempts succeeds. **pass^k**: the chance that all k succeed.
- **GRPO** (Group Relative Policy Optimization): an RL method that makes above-average answers in a group more likely.
  **LoRA**: training small extra matrices instead of all the weights.
- **Min-K% Prob**: the average log-probability of the k% least likely tokens of a text. Higher means "more likely seen".
- **Cohen's kappa**: agreement between two labelers beyond what chance would give. 1 is perfect, 0 is chance.

## Order

Do them in this order. The numbers are ids, not the order.

| Step | Lab | Do this first | Why at this point |
|---|---|---|---|
| 1 | G1 | Nothing. Chapter 9 helps. | It teaches the statistics every later lab uses. It is also the simplest Colab setup. |
| 2 | G2 | Lab F, with your strong grader passing: `bash run_task.sh --all --runs 3` ends with `matrix: OK`. | It uses G1's statistics on agent runs. Its transcripts feed G5. |
| 3 | G5 | Lab C (G5 prints facts that spoil it). Your G2 run folder, for 20 to 50 real transcripts. | Label the G2 transcripts while you still remember them. |
| 4 | G3 | Chapter 8, the reward-hacking section. | The longest and most fragile run. Section 4 needs no GPU, so start there. |
| 5 | G4 | Nothing. | Independent and cheap. It supports Chapter 7 (contamination and canary strings). |

Short on time? Do G1 and G2. They are the closest to running Gemini on your own task.
These labs are not part of the 30-hour sprint plan. Do them after it, or earlier if you have spare GPU time.

## GPU budget per Colab GPU type

You do not choose the model. Each notebook reads the GPU with `nvidia-smi` before it imports torch,
picks a model size, a precision and batch settings that fit, and prints the plan. Read that printout.

The Colab GPUs (facts checked 2026-10-20; see `FACTS.md` for sources):

| Colab GPU | Memory | Native bf16 | Compute units per hour (reported, March 2026) | Note |
|---|---|---|---|---|
| T4 | 16 GB (about 15 usable) | No: the notebooks use float16 or float32 | about 1.2 | Usually the free-tier GPU (reported) |
| L4 | 24 GB (about 22.5 usable) | Yes | about 1.7 | Paid |
| A100 40 GB | 40 GB | Yes | about 5.4 | Paid |
| A100 80 GB | 80 GB | Yes | about 7.5 | Paid; picked with the High-RAM option (reported) |
| H100 | 80 GB | Yes | unknown | Paid; often not available (reported) |
| G4 | about 96 GB | Yes | about 8.7 | Paid; often not available (reported) |

What each notebook picks, and its wall time (estimates, not measured). Installs and the first model
download add about 5 to 20 minutes per notebook.

| Lab | T4 | L4 | A100 40 GB | A100 80 GB, H100, G4 |
|---|---|---|---|---|
| G1 | Qwen2.5-Coder-1.5B-Instruct, float16, vLLM without CUDA graphs; about 60-90 min | 1.5B, bfloat16; about 50-80 min | 7B, bfloat16; about 50-80 min | 7B, bfloat16; about 50-80 min |
| G2 | Coder-1.5B, float16, 8 attempts at once, 30 attempts; about 1.5-3 h | Coder-1.5B, bfloat16, 16 at once, 50 attempts; about 1-2 h | Coder-7B, bfloat16, 16 at once, 50 attempts; about 1-2 h | Coder-7B, bfloat16, 32 at once, 100 attempts; about 1-2 h |
| G3 | Coder-0.5B, float32, 150 steps per run; about 60-120 min for both runs | Coder-1.5B, bfloat16, 150 steps; about 60-100 min | Coder-1.5B, bfloat16, 200 steps; about 60-120 min | same as A100 40 GB |
| G4 | Coder 0.5B, 1.5B and 1.5B-Instruct in float32 (7B skipped); about 20-40 min | the same plus the 7B base model in bfloat16; about 30-50 min | the same as L4; about 25-45 min | the 7B runs in float32 on 80 GB; about 25-45 min |
| G5 | judge Qwen3-4B-Instruct-2507, float16; about 45-60 min | Qwen3-4B, bfloat16; about 30-45 min | Qwen3-4B, bfloat16; about 20-30 min | the same, with room for a second judge (Coder-7B) |

The G1 times for L4 and larger are our guess from its step times. The other numbers come from each
notebook's own budget table.

Rough total for all five, GPU time only (estimate): T4 about 5-9 h (about 6-11 compute units),
L4 about 4-7 h (about 7-12 units), A100 40 GB about 4-7 h (about 20-36 units).
Your own reading, labeling and writing time is extra: about 8-15 h in total.
A Colab session runs for at most 12 hours, and idle runtimes time out (Colab FAQ, checked 2026-10-20).
Use one session per notebook.

## Open a notebook from GitHub

Colab opens a notebook straight from a public GitHub repo. The URL pattern is
`https://colab.research.google.com/github/<owner>/<repo>/blob/<branch>/<path>.ipynb` (note the `blob`).

- G1: https://colab.research.google.com/github/ZelinZhu-Richard/ZelinZhu-Richard.github.io/blob/main/workspace/repolarisdm/labs/colab/g1-pass-at-k.ipynb
- G2: https://colab.research.google.com/github/ZelinZhu-Richard/ZelinZhu-Richard.github.io/blob/main/workspace/repolarisdm/labs/colab/g2-agent-runs.ipynb
- G3: https://colab.research.google.com/github/ZelinZhu-Richard/ZelinZhu-Richard.github.io/blob/main/workspace/repolarisdm/labs/colab/g3-reward-hacking-grpo.ipynb
- G4: https://colab.research.google.com/github/ZelinZhu-Richard/ZelinZhu-Richard.github.io/blob/main/workspace/repolarisdm/labs/colab/g4-contamination-probe.ipynb
- G5: https://colab.research.google.com/github/ZelinZhu-Richard/ZelinZhu-Richard.github.io/blob/main/workspace/repolarisdm/labs/colab/g5-llm-judge-agreement.ipynb

These links return 404 until this folder is pushed to `main`. On 2026-10-20 it was not there yet.

Steps:
1. Open the link. Colab shows the notebook, but it is a temporary copy.
2. Runtime > Change runtime type > pick a GPU. On the free tier that is usually the T4.
3. Run the cells from the top. The first code cells get the lab files and print the GPU plan.
4. The install cell of G1, G2 and G5 replaces Colab's torch (vLLM 0.31.0 pins torch 2.13.0) and then
   stops Python on purpose. Colab says the session crashed. That is expected. Go on with the next cell.
   G3 and G4 keep Colab's own torch: they pin the versions Colab already had on 2026-10-20
   (G3 adds TRL), so no restart should be needed.
5. To keep your edits: File > Save a copy in Drive. Before you share a copy, turn on
   Edit > Notebook settings > "Omit code cell output when saving this notebook".
6. Save your results before you leave. The Colab VM is wiped when the session ends.
   G1, G2, G3 and G5 have a save step near the end (a zip or a download). G4 writes its scores to a
   folder on the VM; download what you need from the Files panel on the left.
7. When you finish: Runtime > Disconnect and delete runtime. A connected runtime keeps using compute units.

Every notebook gets the lab files with a shallow, sparse clone. It downloads only
`workspace/repolarisdm/labs`, not the whole portfolio:

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io repo && cd repo && git sparse-checkout set workspace/repolarisdm/labs
```

In a notebook, `!cd` runs in a subshell and does not last. The notebooks use `%cd` or `os.chdir` instead.

**Secrets.** No lab needs one. Every model here is ungated, so no Hugging Face token is needed
(Hub API, checked 2026-10-20). If you ever use a gated model, add a secret named `HF_TOKEN` with the
key icon in Colab's left sidebar. `huggingface_hub` reads it by itself. If your own code needs it:

```python
from google.colab import userdata
try:
    token = userdata.get("HF_TOKEN")   # never print it, never write it to a file
except (userdata.SecretNotFoundError, userdata.NotebookAccessError):
    token = None
```

**Safety.** In G1, G2 and G3 the model writes code, and the notebook runs it on the Colab VM.
The graders add time and memory limits, but the VM is not a sandbox. Keep secrets out of the runtime,
and never mount Google Drive in G1, G2 or G3. (G4 and G5 run no model-written code; G5 offers Drive as one
way to bring in your G2 folder.) G2 serves the model with `vllm serve` inside the VM only. Do not open a
public tunnel to it.

**Custody in G2.** Before the first attempt, G2 moves Lab F's solutions out of the clone into a
root-only folder, closes `/content` to every other user, and runs each attempt's commands as its own
unprivileged user. A probe, run as such a user, must be refused everywhere before any attempt runs.
G2 also tries to block the network for those users with `iptables` and prints whether that worked.
All agents finish before any grading starts, and grading runs one attempt at a time. An attempt whose
replies or tool output mention an answer or grader path, a network call or your canary is invalid.
On a Mac (no root) there are no sandbox users, so the notebook refuses to run attempts there.

**Private files.** G2 can also run your private Chronos task, and it asks you to upload your Lab F
strong grader. Both go to `/content/g2_private/`, outside the clone, behind that lock. Never commit them anywhere public.

**Answer keys.** The `labs/*/_key` folders must never reach GitHub. Each notebook deletes any it finds
right after the clone, and warns you, because model code runs on the same VM.

## Run the smoke tests (CPU, on your Mac)

`check.py` checks the notebooks, then runs every CPU smoke test. From the top of the portfolio repo:

```sh
cd workspace/repolarisdm/labs/colab
python3 check.py
```

It prints one `PASS` or `FAIL` line per check and ends with `ALL OK` or `FAILED: ...`.
The exit code is 0 only when nothing fails. The tests take about 2 to 3 minutes. Options:
- `--no-pytest`: only the notebook and folder checks (a few seconds).
- `--require-pytest`: fail if no Python with pytest is found. Without it, that step prints `SKIP`.
- `--verbose`: print the pytest output too.

It uses `$LAB_PYTHON` if you set it, else `python3`. For a clean environment, use a uv venv in a temp folder:

```sh
VENV="$(mktemp -d)/venv"
uv venv --python 3.13 "$VENV"
uv pip install --python "$VENV/bin/python" pytest==9.1.1 nbformat==5.11.1 matplotlib==3.11.2 numpy==2.5.4 scipy==1.18.1 scikit-learn==1.9.1
LAB_PYTHON="$VENV/bin/python" python3 check.py
```

One lab only: `"$VENV/bin/python" -m pytest -q -p no:cacheprovider tests/test_g3.py`.
G4 runs with Colab's matplotlib 3.10.0. On 2026-10-20 `tests/test_g4.py` also passed (155 tests) with
matplotlib 3.10.0 and numpy 2.5.4, so its plot code works with both versions.
The per-lab requirement files are in `tests/` (`requirements-g1.txt`, `-g3.txt`, `-g5.txt`).
G1's tests need matplotlib and nbformat. G2 needs only pytest. G3, G4 and G5 skip their nbformat,
matplotlib or scikit-learn tests when the package is missing.

What `check.py` checks in every notebook:
1. It is JSON in nbformat v4, with valid cell ids, and no cell has saved outputs or execution counts.
2. The first cell is markdown with a title, a goal tied to Polaris, a time and GPU budget,
   "Done when", and the exact honest label.
3. Every `pip install` (shell, `%pip`, or a `subprocess` list) installs only `name==version` pins.
4. No secrets or tokens, and no Colab secret is printed.
5. No absolute local paths, such as home folders or macOS temp folders.
6. It detects the GPU and picks a precision, and it gets the lab files with the shallow, sparse clone.
7. Right after the clone, it deletes any answer-key folder that was pushed by mistake.
8. G1, G2 and G3 (they run model-written code) never mention mounting Google Drive.

It also checks `lab.json`, the Colab links in this README, the pins in `tests/requirements-*.txt`,
every other text file here for secrets and local paths, and that no `_key` folder is in this folder.
Answer keys in the other `labs/*/` folders are printed as a note. Before you publish, run
`python3 check.py --strict-keys`: then any `labs/*/_key` folder is a FAIL.

What the smoke tests cover: the task sets and their reference solutions, the graders (references pass,
do-nothing and planted wrong answers fail), the statistics on known values, the GPU plans for each GPU
type, the agent loop with a scripted fake model, the label checkers, and that each notebook equals
what its generator builds. What they do not cover: anything that needs a GPU, torch, vLLM or TRL.

`labs/check_labs.py` runs only the `lab-*` folders. Run this folder's check directly:
`python3 colab/check.py` from `labs/`.

## What this practices

From `lab.json`. It lists only what these labs make you do every time.

- Audit steps: **S11** (re-run it yourself: G2 grades every attempt with your own grader, not the
  agent's claim), **S12** (attack the fix: G3 uses held-out cases that no reward sees),
  **S14** (transcript audit: G2 and G5 label the first wrong turn and its phase).
- Mistake-card rows: **M3** test gaming (G3: you write cheats that fool the weak grader, such as copying
  the visible example, `sys.exit(0)` and an always-equal object, and you catch them with held-out cases) and
  **M6** overselling (G5: you label `oversold` and `checked_after_last_edit` on every transcript).
- Other rows can show up in your G2 and G5 labels. Nothing guarantees which, so `lab.json` does not claim them.

## Files

Edit a notebook through its generator, not in the `.ipynb`. Then rerun the generator from this folder,
for example `python3 g2_build_notebook.py`. The smoke tests fail if a notebook and its generator differ.

| Lab | Notebook and generator | Helper modules | Smoke test |
|---|---|---|---|
| G1 | `g1-pass-at-k.ipynb`, `g1_make_notebook.py` | `g1_tasks.py`, `g1_grade.py`, `g1_stats.py`, `g1_gpu.py`, `g1_sample.py`, `g1_report.py` | `tests/test_g1.py` |
| G2 | `g2-agent-runs.ipynb`, `g2_build_notebook.py` | `g2_plan.py`, `g2_agent.py`, `g2_tasks.py`, `g2_runs.py`, `g2_stats.py`, `g2_labels.py` | `tests/test_g2.py` |
| G3 | `g3-reward-hacking-grpo.ipynb`, `g3_build_notebook.py` | `g3_tasks.py`, `g3_grader.py`, `g3_stats.py`, `g3_train.py` | `tests/test_g3.py` |
| G4 | `g4-contamination-probe.ipynb`, `g4_build_notebook.py` | `g4_texts.py`, `g4_stats.py`, `g4_gpu.py`, `g4_plots.py` | `tests/test_g4.py` |
| G5 | `g5-llm-judge-agreement.ipynb`, `g5_build_notebook.py` | `g5_labels.py`, `g5_items.py`, `g5_judge.py`, `g5_stats.py`, `g5_gpu.py`, `g5_gold.json` | `tests/test_g5.py` |

Also here: `FACTS.md` (the verified facts and pins behind these notebooks, with sources, checked
2026-10-20), `lab.json`, and `check.py`.

## If something breaks

- **A pip conflict.** Read `FACTS.md`, section 0. vLLM 0.31.0 needs `transformers` below 5.18.
  Change one pin, rerun, and write down what worked.
- **Python 3.13 trouble.** Colab's image moved to Python 3.13 in August 2026. You can pin an older
  runtime version (2026.07, Python 3.12). Colab's runtime-version FAQ says how; the build did not check
  where that setting sits in the menus. Then note it.
- **Out of GPU memory.** Read the plan printout first. G1 takes a smaller `model_size`, G4 can score
  fewer models, G5 can use a smaller judge, and G2's `PLAN_OVERRIDES` (step 4) lowers its memory settings.
- **Disconnected.** G2 skips attempts that are already saved when you rerun its steps (the notebook says
  which). The others start again from the top. Save results often.
- **No GPU offered.** The free tier restricts GPUs, and Colab guarantees no GPU type (Colab FAQ).
  Try later, or use a paid plan.

## Sources

- Colab FAQ: session limits, GPU availability, saving without outputs.
  https://research.google.com/colaboratory/faq.html (checked 2026-10-20)
- Opening notebooks from GitHub: https://github.com/googlecolab/colabtools/blob/main/notebooks/colab-github-demo.ipynb (checked 2026-10-20)
- Colab GPU image and package versions: https://github.com/googlecolab/backend-info (checked 2026-10-20)
- Compute-unit rates and usable memory (reported, March 2026): https://mccormickml.com/2024/04/23/colab-gpus-features-and-pricing/ (read 2026-10-20)
- Compute capability per GPU: https://developer.nvidia.com/cuda-gpus (checked 2026-10-20)
- Package pins: https://pypi.org/pypi/vllm/json, https://pypi.org/pypi/trl/json, https://pypi.org/pypi/transformers/json (checked 2026-10-20)
