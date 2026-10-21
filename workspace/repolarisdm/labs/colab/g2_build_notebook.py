"""Build g2-agent-runs.ipynb (nbformat 4.5, no outputs) from the cells below.

Edit the cells here, then run:  python3 g2_build_notebook.py
tests/test_g2.py checks that the .ipynb on disk equals what this script builds.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NOTEBOOK = HERE / "g2-agent-runs.ipynb"
COLAB_URL = ("https://colab.research.google.com/github/ZelinZhu-Richard/ZelinZhu-Richard.github.io/"
             "blob/main/workspace/repolarisdm/labs/colab/g2-agent-runs.ipynb")
HONEST = ("Written and CPU-smoke-tested by an automated build on 2026-10-20. Never run on a GPU. "
          "Expect to fix version issues; pin what works and note it.")

CELLS = [
("md", f"""
# G2: Agent runs at scale

**Goal.** Polaris engineers run a model on a task many times, grade every attempt, and explain the failures.
That is how they find model weaknesses. Here you do the same, at small scale.
A tiny tool-using agent loop drives a small open-weight coding model on the Lab F task (`freebusy-merge`).
You grade every attempt with **the strong grader you wrote in Lab F**.
Then you compute pass@k and pass^k with intervals, and you label five failures.

**Words.** An *attempt* is one full agent run on the task. *pass@k* is the chance that at least one of
k attempts succeeds. *pass^k* is the chance that all k succeed. A *transcript* is the saved record of every turn.

**Before you start.** Finish Lab F. For your grader, `bash run_task.sh --all --runs 3` must end with `matrix: OK`.
This notebook does not contain a strong grader. You bring yours (step 5).

**Time and GPU budget.** Guesses from model sizes. Nothing here was measured.

| Colab GPU | Model this notebook picks | Attempts (default) | Wall time, all steps |
|---|---|---|---|
| T4 (16 GB, no native bf16) | Qwen2.5-Coder-1.5B-Instruct, float16 | 30 | about 1.5 to 3 h |
| L4 (24 GB) | Qwen2.5-Coder-1.5B-Instruct, bfloat16 | 50 | about 1 to 2 h |
| A100 40 GB | Qwen2.5-Coder-7B-Instruct, bfloat16 | 50 | about 1 to 2 h |
| A100 80 GB, H100, G4 | Qwen2.5-Coder-7B-Instruct, bfloat16 | 100 | about 1 to 2 h |

The install and the first model download add roughly 10 to 20 minutes (also a guess).
Colab sessions run for at most 12 hours. Reported compute-unit rates (March 2026): T4 about 1.2 per hour,
L4 about 1.7, A100 40 GB about 5.4.

**Done when:**
- 20 or more graded attempts are saved as JSONL transcripts.
- You have a results table: pass@k and pass^k with 95% intervals, for your strong grader and the lab's weak grader.
- Five failed attempts are labeled with the schema (first wrong turn; localize, repair or verify;
  mistake-card row M1 to M10), and the validator accepts all five.

**Honest label.** {HONEST}

**Safety and custody.** The model writes code, and the harness runs it on the Colab VM.
Step 6 locks the answers away before the first attempt: it moves Lab F's solutions out of the clone,
closes `/content` to every user except root, and runs every attempt as its own unprivileged user.
A probe proves the lock before any attempt runs. It also tries to block the network for those users.
This is still not a security sandbox. Keep secrets out of this runtime, and do not mount Google Drive here.
No Hugging Face token is needed: every model here is ungated.
If you ever switch to a gated model, add `HF_TOKEN` under Colab's Secrets (key icon). `huggingface_hub`
reads it by itself. Never print it. The model server listens on the VM only.

Open in Colab: {COLAB_URL}
"""),
("md", """
## 1. Get the lab files

A sparse, shallow clone downloads only the `labs` folder of the playbook repo.
Use `%cd`, not `!cd`: `!cd` runs in a subshell and does not stay for later cells.
The clone works only after the playbook is pushed to GitHub.
"""),
("code", """
# Download only workspace/repolarisdm/labs (sparse, shallow clone). Safe to rerun.
%cd /content
![ -d repo ] || (git clone --depth 1 --filter=blob:none --sparse https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io repo && cd repo && git sparse-checkout set workspace/repolarisdm/labs)
%cd /content/repo/workspace/repolarisdm/labs/colab
import glob, shutil   # answer keys must never be on GitHub; if some were pushed, delete the local copies
for key_dir in glob.glob("/content/repo/workspace/repolarisdm/labs/*/_key"):
    print("WARNING: answer keys were pushed to GitHub:", key_dir, "- deleted here. Remove them from the repo.")
    shutil.rmtree(key_dir)
# Write down this commit with your results.
!git -C /content/repo log -1 --format="playbook commit %h (%cs)"
"""),
("md", """
## 2. Check the GPU and pick a plan

The plan picks the model, the dtype, the context length and how many attempts run at once.
It reads `nvidia-smi` and does not import torch, because vLLM wants CUDA untouched before it starts.
A T4 has no native bf16, so the plan uses float16 there.
Do not trust `torch.cuda.is_bf16_supported()` for this: it can say True on a T4, because it counts emulation.
"""),
("code", """
import sys; sys.path.insert(0, "/content/repo/workspace/repolarisdm/labs/colab")
import g2_plan
gpu = g2_plan.detect_gpu()            # nvidia-smi first; torch only as a fallback
print(gpu)
plan = g2_plan.choose_plan(gpu)       # raises with a fix if there is no usable GPU
print(g2_plan.describe(plan))         # another model or other settings: step 4, after the restart
"""),
("md", """
## 3. Install pinned packages, then restart

vLLM 0.31.0 pins torch 2.13.0, so this install replaces Colab's torch.
Python must restart to load the new torch. The last line of the cell kills the process on purpose.
Colab then says the session crashed. That is expected. Go on with the next cell.

The pins were checked on PyPI on 2026-10-20. vLLM 0.31.0 needs transformers below 5.18.
If the install fails, write down the error. You can also pin Colab's older runtime version 2026.07
(Python 3.12). Colab's runtime-version FAQ says how; the build did not check where that setting sits. Pin what works.
"""),
("code", """
# Pinned versions. This replaces Colab's torch with 2.13.0. It takes a few minutes.
!pip install -q vllm==0.31.0 transformers==5.17.0
# Record what you really got. Keep this file with your results.
!pip freeze | grep -iE "^(vllm|torch|transformers|triton)==" | tee /content/g2_versions.txt
# Restart Python so the new torch loads. "Session crashed" is expected here.
import os; os.kill(os.getpid(), 9)
"""),
("md", """
## 4. Settings

The restart cleared Python, so this cell loads the helpers and builds the plan again.
Every choice lives here, so it survives a restart or a reconnect: rerun this cell, and you get the same plan.
- `MODEL_KEY`: `None` lets the GPU decide. `"mini-coder-1.7b"` is the optional comparison model.
- `PLAN_OVERRIDES`: fixes for the server, for example `{"gpu_memory_utilization": 0.80, "max_model_len": 8192}`.
- `BACKEND`: `"vllm"` (fast), or `"transformers"` (slow fallback without a server; skip step 7).

One run folder holds one configuration. The run name contains the model, the backend, the temperature
and the seed, so a changed setting gets a new folder.
"""),
("code", """
%cd /content/repo/workspace/repolarisdm/labs/colab
import sys; sys.path.insert(0, "/content/repo/workspace/repolarisdm/labs/colab")
import json, g2_plan
MODEL_KEY      = None      # None = picked by GPU; or "mini-coder-1.7b"
PLAN_OVERRIDES = {}        # e.g. {"gpu_memory_utilization": 0.80, "max_model_len": 8192, "max_turns": 12}
BACKEND        = "vllm"    # or "transformers" (slow fallback, one request at a time)
plan = g2_plan.apply_overrides(g2_plan.choose_plan(g2_plan.detect_gpu(), MODEL_KEY), PLAN_OVERRIDES, BACKEND)
N_ATTEMPTS, TEMPERATURE, TOP_P, SEED = max(20, plan.attempts), 0.7, 0.95, 0   # 20 is the minimum
RUN_NAME = f"labf-{plan.model_key}-{BACKEND}-t{TEMPERATURE}-s{SEED}"           # attempt i: seed SEED*100000 + i
RUN_DIR  = f"/content/g2_runs/{RUN_NAME}"
PORT = 8000
BASE_URL = f"http://127.0.0.1:{PORT}/v1"
print(g2_plan.describe(plan)); print("backend:", BACKEND, "| run folder:", RUN_DIR)
"""),
("md", """
## 5. Bring your strong grader

On your own machine, zip the `tests` folder of your Lab F practice copy:

```sh
cd <your Lab F practice folder>/task && zip -r ~/Desktop/strong_tests.zip tests
```

Run the next cell and upload `strong_tests.zip`. It goes to `/content/g2_private/`, outside the git clone.
Never commit it anywhere public: it is your answer key.
No grader yet? Set `UPLOAD_STRONG = False`. Then the notebook uses the lab's weak grader only,
every number is labeled WEAK, and the lab is not done.
"""),
("code", """
from pathlib import Path
from google.colab import files
import g2_tasks
UPLOAD_STRONG = True     # False: run with the lab's weak grader only (every number is then WEAK)
STRONG, PRIVATE = None, Path("/content/g2_private")
earlier = sorted(PRIVATE.glob("strong_tests/**/test.sh"), key=lambda p: len(p.parts))
if UPLOAD_STRONG and earlier:
    STRONG = earlier[0].parent                      # uploaded earlier in this runtime
elif UPLOAD_STRONG:
    for name, data in files.upload().items():      # choose strong_tests.zip
        PRIVATE.mkdir(mode=0o700, exist_ok=True); (PRIVATE / name).write_bytes(data)
        Path(name).unlink(missing_ok=True)          # upload may also save a copy inside the clone
        STRONG = g2_tasks.safe_unzip(PRIVATE / name, PRIVATE / "strong_tests")
LABS = Path("..").resolve()                         # the labs/ folder
task = g2_tasks.lab_f_task(LABS, strong_tests=STRONG)
MAIN = "strong" if "strong" in task.graders else "weak"
print("graders:", {k: g2_tasks.sha256_dir(v) for k, v in task.graders.items()}, "main:", MAIN.upper())
"""),
("md", """
## 6. Check your grader, lock the answers away, then check this harness

A grader you have not validated gives numbers you cannot defend.
1. The first cell runs the Lab F matrix with your grader, 3 runs per solution, exactly as in Lab F.
   It must end with `matrix: OK`. If it does not, stop here and fix the grader in Lab F first.
2. The second cell locks the answers away. It moves Lab F's reference and its alt and wrong solutions out of
   the clone into `/content/g2_vault`, and closes `/content` (`chmod 700`), so only root can enter it.
   Every attempt runs its commands as its own user (uid 50000 + attempt number), so model-written code cannot
   read the clone, the vault, your grader or the run folders. A probe runs as such a user and must be refused
   everywhere. The cell also tries to block the network for those users with `iptables`; it prints whether that worked.
3. The third cell grades do-nothing and the public reference through this notebook's own harness, as a sandbox user.
   They must get 0 and 1 from every grader. If not, the harness grades differently from `run_task.sh`.
"""),
("code", """
import subprocess
MATRIX = Path("/content/g2_matrix"); MATRIX.mkdir(exist_ok=True)
if MAIN == "strong" and g2_tasks.lab_f_answers_in_clone(LABS):      # the matrix needs the solutions
    out = subprocess.run(["bash", str(LABS / "lab-f/repo/run_task.sh"), "--all", "--runs", "3",
                          "--tests", str(STRONG), "--out", str(MATRIX)], capture_output=True, text=True)
    (MATRIX / "stdout.txt").write_text(out.stdout); print(out.stdout[-2500:], out.stderr[-1000:])
if MAIN == "strong":
    assert "matrix: OK" in (MATRIX / "stdout.txt").read_text(), "Your grader fails the Lab F matrix. Fix it in Lab F first."
else:
    print("WEAK grader only. The Lab F README shows it accepts 5 wrong solutions. No pass here is proof.")
"""),
("code", """
# Lock the answers away. Safe to rerun.
VAULT = Path("/content/g2_vault")
REFERENCE = g2_tasks.lock_lab_f(LABS, VAULT)               # the reference now lives only in the vault
print("closed to non-root users:", g2_tasks.lock_down(["/content"]))
NET = g2_tasks.block_network(); print("network rules:", NET)
secrets_to_probe = [REFERENCE, VAULT, PRIVATE, LABS, Path(RUN_DIR).parent, *task.graders.values()]
PROBE = g2_tasks.probe(g2_tasks.sandbox_for(0), secrets_to_probe)
print(json.dumps(PROBE, indent=1, default=str))
assert PROBE.get("sandbox") != "inactive", "No sandbox user: this process is not root on Linux. Stop here."
assert all(PROBE.get(str(p)) == "blocked" for p in secrets_to_probe), "The lock is not proven. Stop here."
NETWORK_BLOCKED = PROBE.get("network") == "blocked"
print("network for model code:", "blocked" if NETWORK_BLOCKED else "OPEN: model code could download the public Lab F solutions")
"""),
("code", """
# Same verdicts through this harness, run as a sandbox user? Every grader: do-nothing -> 0, reference -> 1.
check = g2_tasks.lab_f_self_check(task, LABS, reference=REFERENCE)
print(check)
assert all(v == {"do-nothing": 0.0, "reference": 1.0} for v in check.values()), "harness and lab disagree"
"""),
("md", """
## 7. Start the model server

`vllm serve` runs in the background and listens on the VM only (127.0.0.1), never on a public address.
Skip this step if `BACKEND = "transformers"`.
The flag `--generation-config vllm` stops the server from filling in sampling fields that a request does not send
from the model's own `generation_config.json` (for Qwen2.5-Coder: top_k 20 and a repetition penalty of 1.1).
The harness also sends top_k 0 (off) and repetition penalty 1.0 with every request, so the sweep changes temperature only.
The first start downloads the model (3 to 15 GB) and can take 3 to 10 minutes. The log is `/content/vllm.log`.
"""),
("code", """
import subprocess
cmd = g2_plan.serve_command(plan, port=PORT)
print(" ".join(cmd))
server = subprocess.Popen(cmd, stdout=open("/content/vllm.log", "w"), stderr=subprocess.STDOUT)
print("ready:", g2_plan.wait_for_server(BASE_URL, server, timeout_s=1500, log_path="/content/vllm.log"))
"""),
("md", """
**If the server does not start**, read the log tail it printed. Then try one change at a time.
Make every change in `PLAN_OVERRIDES` in step 4, rerun step 4, then this cell. Then it survives a restart.
- Out of memory: `PLAN_OVERRIDES = {"gpu_memory_utilization": 0.80}`, or add `"max_model_len": 8192`.
- A CUDA or kernel error: add `"enforce_eager": True`. Write down the error and the versions file.
- Still stuck: set `BACKEND = "transformers"` in step 4 and skip this step. It is slow (one request at a time),
  it uses the plan's dtype, and it samples like the server: top_k off, no repetition penalty.
  The backend is part of the run name, so its attempts never mix with server attempts.
"""),
("md", """
## 8. One attempt first, and read it

Before you spend GPU time on many attempts, run one and read every turn.
Check that the prompt is right, that actions parse, and that the tests run.
The agent sees the instruction text and a fresh copy of `task/environment/app`. Its commands run as its own
sandbox user. Step 6 proved that such a user cannot read the solutions, your grader or the clone.
An attempt is marked INVALID if a reply or a tool output mentions an answer or grader path (such as `/content`,
`solutions/` or `test_outputs`), a network call, or the canary. Read invalid attempts: they are evidence too.
It has four actions: `read_file`, `write_file`, `run_tests`, `finish`. The loop is in `g2_agent.py`
(`parse_action`, `execute`, `run_agent`, about 120 lines). Read it once: you should be able to defend every choice in it.
"""),
("code", """
import g2_agent, g2_runs
chat = g2_agent.make_chat(plan, BACKEND, BASE_URL, temperature=TEMPERATURE, top_p=TOP_P)
CFG = {"seed": SEED, "model_id": plan.model_id, "revision": plan.revision, "backend": BACKEND,
       "temperature": TEMPERATURE, "top_p": TOP_P, "max_turns": plan.max_turns, "context_tokens": plan.max_model_len,
       "reply_tokens": plan.reply_tokens, "harness": g2_agent.HARNESS_VERSION, "require_sandbox": True,
       "network_blocked": NETWORK_BLOCKED}
row = g2_runs.run_one(task, chat, f"/content/g2_runs/first-look-{RUN_NAME}", 0, CFG)
print(row)
print(g2_runs.render_transcript(f"/content/g2_runs/first-look-{RUN_NAME}/" + row["transcript"]))
"""),
("md", """
## 9. Run all attempts

Attempts run in parallel, and vLLM batches their requests. Grading starts only after every agent has finished,
and the graders run one attempt at a time. While a grader runs, the code under test can read the grader's files.
This order means that nothing a grader shows can reach another attempt.
Each graded attempt is added to `attempts.jsonl`, and its transcript is in `transcripts/`.
If Colab disconnects, rerun steps 1, 2 and 4 to 8, then this cell. It skips graded attempts, grades
finished ones that were waiting, and runs the rest.
"""),
("code", """
rows = g2_runs.run_many(task, chat, RUN_DIR, n=N_ATTEMPTS, concurrency=plan.concurrency, cfg=CFG)
valid = [r for r in rows if r.get("valid")]
print(f"{len(valid)} valid attempts of {len(rows)}")
for r in rows:
    if not r.get("valid"):
        print("INVALID", r["attempt"], r["invalid_reason"])   # never count these; read them
"""),
("md", """
## 10. Results table

Read the frame line first. These numbers describe one configuration on one task. Nothing more.
- pass@k grows with k. pass^k shrinks with k. A big gap means the model *can* solve the task but not *reliably*.
- k stops at n/2: at k = n, pass^k is 1 or 0 by construction. The pass^k interval is built around the plug-in
  estimate (c/n)^k, printed next to the unbiased one. With c < k the unbiased estimate is exactly 0.
- The Wilson interval stays honest with zero successes: 0 of 20 still allows a true rate up to about 16%.
- The bootstrap is a cross-check. It is too narrow when successes are rare.
- "Only weak passes" counts attempts the lab's weak grader accepts and your grader rejects.
  Each one is a possible false accept by the weak grader, on real model output.
"""),
("code", """
import g2_stats
from collections import Counter
from IPython.display import Markdown, display
config = json.load(open(f"{RUN_DIR}/config.json"))
parts = [g2_stats.frame_line(len(valid), config, invalid=len(rows) - len(valid))]
for grader in task.graders:
    parts.append(g2_stats.markdown_table(g2_stats.results_table([r["passed"][grader] for r in valid]), grader.upper()))
if "strong" in task.graders:
    parts.append(f"Weak vs strong on the same attempts: {g2_stats.agreement(valid)}")
parts.append(f"End reasons: {dict(Counter(r['end_reason'] for r in valid))}")
open(f"{RUN_DIR}/results.md", "w").write("\\n\\n".join(parts))
display(Markdown("\\n\\n".join(parts)))
"""),
("md", """
Answer in your notes, 2 or 3 sentences each:
1. Open two "only weak passes" attempts (if any). Which rule (R1 to R12) does each break?
2. If "only strong passes" is not zero, either the weak grader rejected a correct solution, or your grader is too loose.
   Read the diff and decide which.
3. How many attempts would you need for a 95% interval about 0.10 wide around 25%?
   Try `g2_stats.sample_size_for_width(0.25, 0.10)`, and say what it assumes.
"""),
("md", """
## 11. Label five failures

Pick five attempts that failed under your main grader. Read each transcript. Label first, look at hints later.

- **first_wrong_turn**: the earliest turn after which the attempt could not succeed without undoing something.
- **phase**: `localize` (finding what and where: reading, understanding the spec),
  `repair` (writing the change), or `verify` (testing, or claiming it is done).
- **mistake**: a mistake-card row. M1 invented API. M2 wrong root cause. M3 test gaming. M4 silent damage.
  M5 similar-but-different logic. M6 overselling. M7 solution lookup. M8 answering from memory, not the code.
  M9 C++ memory. M10 security and dependencies. Use `other` only with a note that says why no row fits.
- **evidence**: what in that turn shows it. **note**: one sentence in your words.
"""),
("code", """
failed = [r for r in valid if not r["passed"][MAIN]]
print(f"{len(failed)} failed attempts under the {MAIN.upper()} grader")
for r in failed[:20]:
    print(r["attempt"], r["end_reason"], "turns", r["turns"], "files", r["files_changed"], "rewards", r["rewards"])
# Read one transcript in full. Change the index to read the others.
if failed:
    print(g2_runs.render_transcript(f"{RUN_DIR}/{failed[0]['transcript']}"))
"""),
("code", """
# Your five labels. Copy the commented example and change every field, from what you read.
LABELS = [
    # {"attempt": "a003", "first_wrong_turn": 4, "phase": "repair", "mistake": "M5",
    #  "evidence": "turn 4: what you saw in the reply", "note": "one sentence", "labeler": "human"},
]
import g2_labels
ok, errors = g2_labels.validate_all(LABELS, valid, MAIN)
for index, attempt, problem in errors:
    print(f"label {index} ({attempt}): {problem}")
with open(f"{RUN_DIR}/labels.jsonl", "w") as handle:
    handle.writelines(json.dumps(label) + "\\n" for label in ok)
print(len([l for l in ok if l["labeler"] == "human"]), "valid human labels saved (need 5)")
"""),
("md", """
## 12. Compare with the heuristic (only after you label)

`g2_labels.suggest_label` reads surface signals: edited tests, red-flag strings, imports, changed files,
and whether the visible tests passed. Where it disagrees with you, decide who is right, and write down why.
This is a small version of checking an automatic judge against human labels (G5 does it properly).
"""),
("code", """
hints = []
for label in ok:
    events = g2_runs.load_transcript(f"{RUN_DIR}/transcripts/{label['attempt']}.jsonl")
    row = next(r for r in valid if r["attempt"] == label["attempt"])
    hint = g2_labels.suggest_label(events, row, target_files={"freebusy/merge.py"})
    hints.append(hint)
    print(label["attempt"], "| you:", label["phase"], label["mistake"], label["first_wrong_turn"],
          "| hint:", hint["phase"], hint["mistake"], hint["first_wrong_turn"], hint["also"], "|", hint["evidence"])
print(g2_labels.compare(ok, hints))
"""),
("md", """
## 13. Save your work and check "Done when"

The Colab VM is wiped when the session ends. Download the run folder as a zip.
Do not mount Google Drive in this notebook: the model's code runs here.
Do not save this notebook with outputs: Edit > Notebook settings > Omit code cell output when saving.
"""),
("code", """
import shutil
shutil.copy("/content/g2_versions.txt", RUN_DIR)
archive = shutil.make_archive(f"/content/{RUN_NAME}", "zip", RUN_DIR)
files.download(archive)                 # a zip download; never mount Drive in a notebook that runs model code
human = [l for l in ok if l["labeler"] == "human"]
print("[x]" if len(valid) >= 20 else "[ ]", f"20+ graded attempts ({len(valid)})")
print("[x]" if Path(f"{RUN_DIR}/results.md").exists() else "[ ]", "results table (results.md)")
print("[x]" if len(human) >= 5 else "[ ]", f"5 labeled failures ({len(human)})")
print("[x]" if MAIN == "strong" else "[ ]", "graded with your validated strong grader")
if BACKEND == "vllm":
    server.terminate()                  # stop the model server when you are done
"""),
("md", """
## Optional: your private Chronos task

Instructions only. Your Chronos grader and hidden tests are private. They never go into the playbook repo.

1. On your own machine, make a folder with `instruction.md`, `env/` (the environment repo snapshot, without `.git`),
   `grader/test.sh` (your hidden grader; it reads `APP_DIR`, `TESTS_DIR` and `LOGS_DIR`, and writes
   `$LOGS_DIR/verifier/reward.txt`, or `reward.json` with a `reward` field) and `canary.txt` (your canary line).
   Zip the folder.
2. Upload it with the cell below. It goes to `/content/g2_private/`, outside the clone, behind the step 6 lock.
   Never commit it.
3. Install the environment's pinned requirements first, for example `!pip install -q -r <env>/requirements.txt`.
4. The canary is read from the file. Do not type it into this notebook.
5. For a private task the harness never stores grader output, because it can reveal hidden tests.
   Keep the transcripts private too.
6. Expect 0 successes for a 1.5B to 7B model on a task that takes a strong human 1 to 2 days.
   The value is in the failure labels and in partial milestone credit. 20 attempts are enough.
7. When you are done: `!rm -rf /content/g2_private`.
"""),
("code", """
RUN_CHRONOS = False   # set True only after you read the steps above
if RUN_CHRONOS:
    croot = None
    for name, data in files.upload().items():       # your private task zip
        PRIVATE.mkdir(exist_ok=True); (PRIVATE / name).write_bytes(data); Path(name).unlink(missing_ok=True)
        croot = g2_tasks.safe_unzip(PRIVATE / name, PRIVATE / "chronos").parent
    assert croot, "no zip uploaded"
    ctask = g2_tasks.folder_task(croot, name="chronos-pit", canary=(croot / "canary.txt").read_text().strip(),
                                 visible_test_cmd=["python3", "-m", "pytest", "-q"])  # your visible tests
    crows = [r for r in g2_runs.run_many(ctask, chat, "/content/g2_runs/chronos", n=20,
                                          concurrency=plan.concurrency, cfg=CFG) if r.get("valid")]
    print(g2_stats.markdown_table(g2_stats.results_table([r["passed"]["private"] for r in crows]), "PRIVATE"))
    print("mean reward (partial credit):", sum(r["rewards"]["private"] for r in crows) / max(1, len(crows)))
"""),
("md", """
## Optional: compare with mini-swe-agent

mini-swe-agent (MIT) is a small public agent scaffold. DeepSWE used it.
The model `ricdomolm/mini-coder-1.7b` was trained on its trajectories.
- Quick comparison: in step 4, set `MODEL_KEY = "mini-coder-1.7b"`, then rerun from step 4 (and step 7).
  The run name changes by itself. It runs in our loop, with our tag format, which is not its training format.
  Expect a handicap, and say so.
- Stretch (not tested by the build): `pip install mini-swe-agent==2.4.6`, point it at the same server
  (model `hosted_vllm/g2-model`, `api_base` set to `BASE_URL`, `cost_tracking: ignore_errors`),
  run it as a sandbox user in a temp copy made with `g2_tasks.make_workspace(task, g2_tasks.sandbox_for(i))`,
  and grade the result with `g2_tasks.grade`. It runs shell commands, so check that it stays inside that copy.
  It installs litellm. Version 2.4.6 excludes the two litellm releases that were compromised in March 2026
  (1.82.7 and 1.82.8).
"""),
("md", """
## Troubleshooting and notes to keep

- **Version errors.** Write down the error and `/content/g2_versions.txt`. vLLM 0.32.0 accepts transformers
  5.16.1 up to (not including) 5.20.0, for example 5.19.0. Change both pins together.
- **Many `format_errors`.** The model does not follow the tag format. That is a finding, not a harness bug.
  Read three such transcripts to make sure the parser is not at fault.
- **Many `context_full` or `model_error` ends.** Lower `max_turns` or `reply_tokens` with `PLAN_OVERRIDES` in step 4,
  and use a new run name (add a suffix to `RUN_NAME`).
- **The probe in step 6 fails.** Do not run attempts. Without the lock, model code can read the answers.
- **A hung attempt.** Each test run has a 60-second timeout and each grader run 180 seconds. The process group is killed.
- **Keep for your notes:** the versions file, the plan printout, the frame line, the results table and the five labels.

Playbook chapter: https://zelinzhu-richard.github.io/repolarisdm/runs-and-weaknesses/
"""),
]


def lines(text):
    text = text.strip("\n")
    parts = text.split("\n")
    return [p + "\n" for p in parts[:-1]] + [parts[-1]]


def build():
    cells = []
    for i, (kind, text) in enumerate(CELLS):
        cell = {"cell_type": "markdown" if kind == "md" else "code", "id": f"g2-{i:02d}",
                "metadata": {}, "source": lines(text)}
        if kind == "code":
            cell.update({"execution_count": None, "outputs": []})
        cells.append(cell)
    return {
        "cells": cells,
        "metadata": {
            "accelerator": "GPU",
            "colab": {"gpuType": "T4", "provenance": [], "toc_visible": True},
            "kernelspec": {"display_name": "Python 3", "name": "python3"},
            "language_info": {"name": "python"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def render():
    return json.dumps(build(), indent=1, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else NOTEBOOK
    out.write_text(render(), encoding="utf-8")
    print(f"wrote {out}")
