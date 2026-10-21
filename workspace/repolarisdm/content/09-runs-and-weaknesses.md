---
title: Runs, statistics, and model weaknesses
short: Runs and weaknesses
summary: Run Gemini many times on your own task, report only what the runs support, and turn failed transcripts into labeled weaknesses and new task variants.
---

:::selfcheck
- 4 of 5 runs passed. Give the Wilson 95% interval and say what it means for "80%". || About 37.6% to 96.4%. Five runs cannot tell an 80% configuration from a 40% one.
- From n = 10 attempts with c = 3 passes, compute the unbiased pass@3 and pass^3. || pass@3 = 1 − C(7,3)/C(10,3) = 1 − 35/120 = 70.8%. pass^3 = C(3,3)/C(10,3) = 1/120 = 0.8%.
- A Harbor trial shows `AgentTimeoutError` and reward 0. Do you drop it as an infrastructure error? || No. The time budget is part of the configuration, so the timeout is a failed attempt. Exclude only attempts where the model never got a fair try (an environment or verifier crash, or an API, quota or auth error), count them, and re-run them under a rule written before the runs.
- Define the first wrong turn of a failed transcript. || The earliest step where the agent's belief or action departs from evidence it already had, and the run never recovers. Tag it with a phase: localize, repair or verify.
- Why does an RL environment need tasks whose pass rate is strictly between 0 and 1? || In group-based RL such as GRPO, a prompt where every sampled attempt gets the same reward has zero advantage, so it gives zero gradient. DAPO filters such prompts out.
- Name three things that change when your eval grader becomes an RL reward. || It faces an optimizer, so any hole becomes a target; it must be red-teamed and keep hidden checks; partial credit must not pay for easy or do-nothing behavior; the task can no longer serve as an unseen eval.
:::

## Why Polaris cares

The posting says Polaris engineers find weaknesses of the latest models and build data and pipelines that improve Gemini ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19").
A weakness is a claim about many runs, not one. One failed run proves almost nothing.
Google reports Gemini 4 Argon's coding scores as pass@1, averaged over several trials for small benchmarks ^[confirmed](https://deepmind.google/models/model-cards/gemini-4-argon/ "2026-10-20").
Terminal-Bench 2.0 runs every agent-model pair at least 5 times and reports 95% confidence intervals ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20").
Mechanize's co-founder now recruits for Polaris to work on "evals and environments" ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20"), so your task may one day be a training environment too ^[inference](- "2026-10-20").
This chapter is the Oct 28–29 part of your sprint: run Gemini on Chronos, then explain the failures with numbers you can defend.

## How to use this chapter {#how-to-use}

- **Time:** about 4 hours to read it all. The six drills add about 5.5–6.5 hours more. The sprint gives this chapter 15 minutes on Oct 20–23 and 1 hour of reading on Oct 28–29 ([[tracker#block-3|tracker]]).
- **Sprint path.** On Oct 20–23, read only [the spike table](#spike) and write in `agy-notes.md` which path you will try first (15 min, [[tracker#block-1|block 1]]). On Oct 28–29, the reading hour goes to [pass@k and pass^k](#pass-k) and [Why 5 runs are too few](#five-runs). Read the rest inside the tracker item that needs it: [Three ways to run Gemini](#harness-paths) (only your path) in the run item, and [the schema](#label-schema) and [the first-wrong-turn procedure](#fwt-procedure) in the labeling item. If a run times out or crashes, read [Timeouts are outcomes](#timeouts) and [A reward does not prove a fair try](#infra-errors) before you count it. In the sprint, the harness smoke test on Oct 24–27 takes the place of the Day-1 spike drill: one graded attempt through the capstone harness. The spike drill and everything else wait until after you apply.
- **You need:** Docker Desktop running and `uv`. The scripts need Python 3.9 or newer. Harbor 0.24.0 needs Python 3.12 or newer ^[confirmed](https://pypi.org/project/harbor/ "2026-10-20"); the `uv` command below fetches 3.13. Everything else is standard library, except Harbor and the `google-genai` SDK in the Path B sketch.
- **The running example** is a toy task, `asof-lookup`. It has the same core rule as Chronos: a value counts only once it is published. You will run it for real with a **fake agent** whose true success rate you know. That lets you see what the statistics do before you spend Gemini quota.
- **Two chapters overlap with this one.** [[grader-validity]] covers the grader's error rates, sampling frames and the Wilson formula. [[defend-it#statistics-questions|Defend it, section C]] drills the interview answers. This chapter is about **model runs**.

Every command marked "run" was run on 2026-10-20 on an arm64 Mac (Python 3.13.9, Docker Desktop 29.6.2, Harbor 0.24.0). The statistics scripts also give the same output under Python 3.9.6. Every `agy` and Managed Agents command was checked against docs on 2026-10-20, not run: neither tool can run without your Google account or API key.

## The loop: from runs to weaknesses {#loop}

```text
 task version (checksum)           configuration (model, effort, harness, prompt, budget)
          \                          /
           +--> N isolated attempts (fresh container each, tests uploaded after)
                     |
                     v
           capture: diff, transcript, status, tokens, timing
                     |
                     v
           grade: hidden grader -> reward per milestone (deterministic)
                     |
                     v
           report: raw outcomes -> counts -> intervals with a stated frame
                     |
                     v
           label failures: adjudicate, first wrong turn, phase, category
                     |
                     v
           weakness statement -> family of task variants -> back to the top
```

Each box has its own section below. The order matters. You never compute a rate before you have looked at the raw outcomes. You never call something a weakness before you have read the transcripts.

## Three ways to run Gemini on your task {#harness-paths}

Before Nov 2 you need a path that works on your machine with your account. Try them in this order on Day 1. Write down which one worked.

**For Chronos, use the capstone's `harness/`** ([[capstone]]). It builds the isolated workspace, runs the agent (a shell command, `agy` headless or the Gemini API), captures the diff and transcript, and grades. Its statistics module computes the same estimators as this chapter. This chapter shows what that harness must do. The Harbor commands below are your fallback if the harness's `agy` adapter fails; that adapter is docs-based and untested. Never run an agent inside the capstone folder.

### What one run must produce {#run-record}

Whatever the path, each attempt must leave the same record. Without it you cannot grade, compare or label.

| Field | Example | Why |
|---|---|---|
| `run_id` | `chronos-r07` | One row per attempt. Never reuse. |
| `task` + checksum | `chronos-pit@991d249a…` | Results from two task versions never mix. |
| `model` | `gemini-3.8-flash` | The exact string you sent. Model IDs get rerouted (below). |
| `effort` / thinking level | `medium` | It changes behavior and cost. |
| `harness` + version | `agy <x.y.z> via harbor 0.24.0` | Harness changes move scores. Record the exact `agy` version of every attempt. |
| `prompt` hash | `sha256 of instruction.md` | Same prompt for every attempt in a configuration. |
| `budget` | `agent timeout 2 h; 3M tokens` | Part of the configuration, not a detail. |
| `network` | `public` / `allowlist` / `none` | Decides whether lookups were possible ([[M7]]). |
| `started_at`, `finished_at` | ISO times | Spot time effects and quota stalls. |
| `status` | `SUCCESS`, `completed`, … | The harness's own "finished" signal. |
| `reward`, milestones | `0.5`, `{"M1": 1, "M2": 1, "M3": 0, "M4": 0}` | From the grader, never from the agent. |
| `exception` | `AgentTimeoutError` | Separates timeouts from crashes. |
| `tokens`, `cost_usd` | from `usage` | For the budget table. |
| `transcript`, `diff` | file paths | For labeling and re-grading. |
| `interventions` | `0` | Interactive runs only. Any human help makes it a different configuration. |

Why record the model string and the date: on 2026-10-08 Google deprecated older Flash IDs, and `gemini-3.7-flash` now routes to Gemini 3.8 Flash ^[confirmed](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.8 "2026-10-20"). The same string can mean a different model on a different day.

### Path A: `agy` headless, ideally through Harbor {#path-a}

`agy` is the Antigravity CLI. Its headless mode runs one prompt and exits: `agy -p "PROMPT"` with `--output-format text`, `json` or `stream-json` ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"). The full flag list and the `status` field are in [[change#agy-headless-docs|Chapter 4]]. Three facts matter for runs:

1. **Read `status`, not the exit code.** A tool call that needs approval nobody gave is soft-denied. The run continues and still exits 0 ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"). Record `status` for every attempt, and grade every workspace yourself, whatever `status` says. `SUCCESS` only means the run completed with a response.
2. **Raise the timeout.** `--print-timeout` defaults to `5m` ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"). A Chronos attempt takes much longer.
3. **Save the stream.** With `--output-format stream-json` you get one `init`, then `step_update` events, then one `result` with the same shape as `json`. A `step_update` comes for each step transition or text delta, so one step can produce many ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20"). That file is your step-level transcript.

**Auth: you do not need to sign in inside a container.** The install docs describe a Gemini API key mode: set `"modelProvider": "gemini"` in `~/.gemini/antigravity-cli/settings.json` and export `GEMINI_API_KEY`. The docs say the variable alone has no effect ^[confirmed](https://antigravity.google/docs/install?tab=cli "2026-10-20"). The Antigravity plans page says there is no bring-your-own-key option ^[confirmed](https://antigravity.google/docs/plans "2026-10-20"). We read that as being about the app's subscription plans, not the CLI's API-key mode, but we could not test it ^[inference](- "2026-10-20"). Test it on Day 1.

**Harbor already wraps `agy`.** Harbor is the Terminal-Bench team's task runner, and its task layout is the stand-in for Polaris tasks in this playbook ([[task-design]]). Harbor 0.24.0 lists `antigravity-cli`, `antigravity-sdk` and `gemini-cli` among its built-in agents, plus `oracle` (runs your reference) and `nop` (does nothing) ^[confirmed](https://docs.harborframework.com/agents/pre-integrated-agents "2026-10-20"). Its `antigravity-cli` adapter reads `GEMINI_API_KEY` or `GOOGLE_API_KEY` ^[confirmed](https://docs.harborframework.com/agents/agent-auth-resolution "2026-10-20").

We read the adapter's source in the installed package (Harbor 0.24.0) ^[confirmed](https://pypi.org/project/harbor/ "2026-10-20"). It runs, inside the task container:

```text
agy --dangerously-skip-permissions --print-timeout 24h --output-format stream-json \
    --add-dir "$PWD" [--model ...] [--effort ...] --prompt=<instruction> </dev/null
```

Its comments record three gotchas from the Harbor authors' own runs (we did not run `agy`):
- Without `--add-dir "$PWD"`, headless agy 1.1.14 wrote bare-filename edits into its own scratch folder, not the task folder.
- In Daytona and Modal sandboxes, which keep stdin open, agy 1.1.22 waited for end-of-input even on `agy models`. So Harbor closes stdin with `</dev/null` on every agy call.
- agy 1.1.x writes its step transcript under `~/.gemini/antigravity-cli/brain/<uuid>/.system_generated/logs/`. Harbor copies it into the trial's logs.

The adapter also requires the model in `provider/model` form. So a Path A run would look like this (checked against docs and `harbor run --help`, not run with a key):

```zsh
export GEMINI_API_KEY=...   # your key; never commit it, never paste it into a transcript
harbor run -p chronos-pit -a antigravity-cli -m google/gemini-3.8-flash \
  -k 5 -n 2 -o jobs --job-name flash-medium --ak reasoning_effort=medium
```

Four notes on that command. They come from Harbor 0.24.0's source ^[confirmed](https://pypi.org/project/harbor/ "2026-10-20"). We did not run them with `agy`.
- **The `agy` version floats.** Harbor installs the newest `agy` in every trial (`curl … install.sh | bash`). A two-day run can mix `agy` releases. `job_report.py` [below](#job-report) prints `agent_info.version` from every `result.json` and stops if it changes. To pin a version, pass `--ak binary_path=<a Linux agy binary>`.
- **Never use `--ak version=`** with `antigravity-cli` in Harbor 0.24.0. It changes the label written to `result.json`, not what gets installed.
- **Effort `medium` is Flash-only here.** The adapter accepts `medium` and `minimal` only for model names that contain `flash`. For `gemini-4-argon`, use `low` or `high`.
- **The network is public on your Mac.** On Docker Desktop for Mac, Harbor 0.24.0 cannot enforce no-network or allowlists ([details](#egress-finding)). Record `network: public` and search every transcript for lookups ([[M7]]).

`--dangerously-skip-permissions` approves every tool call. That is acceptable only because each attempt runs in a throwaway container ^[inference](- "2026-10-20").

**Without Harbor**, on your Mac: make a practice copy ([[agent-patch-audit#s0|S0]]), then

```zsh
agy -p "$(cat instruction.md)" --output-format stream-json --print-timeout 120m --sandbox \
  > run07.jsonl 2> run07.stderr
tail -n 1 run07.jsonl | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])'
```

Then grade the workspace with the task's own verifier, as Lab F's `run_task.sh` does ([[lab:lab-f]]). Checked against docs, not run.

One trap on the host. Without someone to approve them, shell commands can be soft-denied, so the agent cannot even run the tests. The permissions docs describe allow rules for the CLI in `~/.gemini/antigravity-cli/settings.json`: a `permissions` block with an `allow` list such as `"command(git)"`. The Default preset, where commands run without approval inside the sandbox, is documented for the Antigravity App. The CLI section does not mention presets ^[confirmed](https://antigravity.google/docs/permissions/ "2026-10-20"). The docs also do not say how allow rules play out in headless mode. So on Day 1, run one headless attempt and read its stderr for soft-deny notices. Keep `--dangerously-skip-permissions` for throwaway containers.

### Path B: the Gemini API Managed Agents {#path-b}

The Gemini API can run the Antigravity agent for you in a Google-hosted Linux sandbox. One Interactions API call with `agent="antigravity-preview-09-2026"` and `environment="remote"` starts it. `background=True` runs it as a job that you poll ^[confirmed](https://ai.google.dev/gemini-api/docs/antigravity-agent "2026-10-20"). The docs name these statuses: `in_progress`, `completed`, `failed`, `incomplete` (the run hit `max_total_tokens`) and `requires_action` (it waits for a custom function result) ^[confirmed](https://ai.google.dev/gemini-api/docs/antigravity-agent "2026-10-20"). The Python SDK, `google-genai` 2.31.0, also has `queued`, `cancelled` and `budget_exceeded` ^[confirmed](https://pypi.org/project/google-genai/ "2026-10-20"). The default model is Gemini 3.8 Flash; `agent_config` can set `gemini-4-argon` ^[confirmed](https://ai.google.dev/gemini-api/docs/antigravity-agent "2026-10-20"). It is in preview for free-tier and paid-tier projects ^[confirmed](https://ai.google.dev/gemini-api/docs/antigravity-agent "2026-10-20").

The sandbox is Google's, not your task's Docker image. So you must ship the repository in and pull the result out. The environment docs (last updated 2026-10-07) give `sources` of type `repository`, `gcs` or `inline`, a `network` setting that can be an allowlist or `"disabled"`, and file download, including whole directories as tar archives ^[confirmed](https://ai.google.dev/gemini-api/docs/agent-environment "2026-10-20").

A sketch. **Not run.** Every field name comes from the docs. Putting them together in one call is our assumption, so check each against the docs before you use it.

```python
import time
from pathlib import Path

from google import genai

client = genai.Client()  # uses your Gemini API key from the environment
repo = Path("chronoflow")  # the base snapshot only: no .git, no hidden tests
sources = [
    {"type": "inline", "target": f"/workspace/repo/{p.relative_to(repo)}", "content": p.read_text()}
    for p in sorted(repo.rglob("*"))
    if p.is_file() and ".git" not in p.parts
]
interaction = client.interactions.create(
    agent="antigravity-preview-09-2026",
    input=Path("instruction.md").read_text(),
    environment={"type": "remote", "sources": sources, "network": "disabled"},
    agent_config={"type": "antigravity", "model": "gemini-3.8-flash", "max_total_tokens": 3_000_000},
    background=True,
)
while interaction.status in ("queued", "in_progress"):
    time.sleep(30)
    interaction = client.interactions.get(id=interaction.id)
print(interaction.status, interaction.environment_id)
# Then download the repo folder as a tar archive with client.environments.files.download(...)
# (see the docs' file-management section for the path format) and grade it locally.
```

Five cautions:
- **Web tools.** The default tools include `google_search` and `url_context` ^[confirmed](https://ai.google.dev/gemini-api/docs/antigravity-agent "2026-10-20"). A disabled sandbox network may not stop those, because they are model tools, not sandbox traffic ^[inference](- "2026-10-20"). The docs say you can restrict the default set by passing only the tools you need in `tools` ^[confirmed](https://ai.google.dev/gemini-api/docs/antigravity-agent "2026-10-20"). Leave out `google_search` and `url_context`. Even then, search every transcript for lookups ([[M7]]).
- **Inline sources are small.** The limit is 1 MB per file and 2 MB in total, and inline content is raw text ^[confirmed](https://ai.google.dev/gemini-api/docs/agent-environment "2026-10-20"). The sketch reads every file as text, so it breaks on binary files or a larger repo. For a bigger snapshot, use a `gcs` source.
- **`incomplete` is a failure of the configuration.** The token budget is part of it, like a timeout.
- **A `repository` source clones a URL.** The docs do not say whether history comes along. Use `inline` sources from a clean snapshot, so no future commits can leak ([[grader-validity#isolation|isolation]]).
- **Cost.** The docs estimate that complex agentic workflows can reach 3–5 million tokens and cost up to about $5, and that sandbox compute is not billed during the preview ^[confirmed](https://ai.google.dev/gemini-api/docs/antigravity-agent "2026-10-20").

### Path C: interactive runs with saved transcripts {#path-c}

If A and B fail, run `agy` by hand. Every plan, the free one included, gets Gemini 3.8 Flash in Antigravity, with a weekly quota on the free plan ^[confirmed](https://antigravity.google/docs/plans "2026-10-20"). Rules that keep interactive runs comparable:

1. Fresh practice copy per attempt ([[agent-patch-audit#s0|S0]]). Same `instruction.md`, pasted once.
2. **No steering.** You type the prompt, then you only approve tool calls. If you add any hint, record it in `interventions`. A run with help belongs to a different configuration, and you report it separately.
3. Record the terminal. macOS `script` saves the session. `-r` records input (every key you type), output and timing, so you can replay it later. Type nothing secret:

   ```zsh
   script -q -r run07.rec agy    # record the whole session, keystrokes included
   script -p run07.rec           # replay it later
   ```

   We ran these two commands on 2026-10-20 with a small Python command in place of `agy`; both worked. With `agy` they are checked against docs on 2026-10-20, not run. Also keep `agy`'s own transcript file, if your version writes one (see Path A).
4. Grade with the same verifier as every other path.
5. **Cap it.** Each interactive attempt costs your own time, not machine time. Do at most 3 in the sprint.

### Pick a path in the Day-1 spike {#spike}

| Path | Needs | Isolation | Transcript | Main risk |
|---|---|---|---|---|
| A: Harbor + `antigravity-cli` | Docker, an API key, the API-key mode working | Fresh container per attempt; tests uploaded after the agent. On Docker Desktop for Mac, Harbor 0.24.0 cannot enforce no-network or allowlists; `--allow-agent-host` cannot help there | `stream-json` + agy step transcript | API-key mode untested by us; the `agy` version floats unless you pin it |
| A': `agy -p` on the host | agy signed in | Practice copy; `--sandbox` | `stream-json` | Soft-denied tools; your own machine |
| B: Managed Agents | An API key, the `google-genai` SDK | Google's sandbox; network can be disabled | Interaction history | Web tools; shipping the repo in and out |
| C: interactive | agy signed in | Practice copy | `script` recording | Your hands in the loop; slow |

The plan critique for this playbook asked for exactly this spike, because no path had been tested ^[inference](- "2026-10-20").

## A real run, end to end, with a fake agent {#toy-run}

You will not trust a statistics recipe until you have seen it on data whose truth you know. So we built a toy task and a **fake agent**. The fake agent is a few lines of Python that write a correct solution with probability 0.6 and a buggy one otherwise. It is not a model. Its true pass rate is exactly 60%.

### Install Harbor and make the toy task {#toy-setup}

Harbor's docs install it with `uv tool install harbor` or `pip install harbor`, and use Docker as the default sandbox ^[confirmed](https://docs.harborframework.com/getting-started/installation "2026-10-20"). We pin the version and keep it in a throwaway virtual environment (about 230 MB):

```zsh
H=$(mktemp -d)
uv venv --python 3.13 "$H/.venv"
uv pip install --python "$H/.venv/bin/python" harbor==0.24.0
export PATH="$H/.venv/bin:$PATH"
harbor --version            # prints 0.24.0
W=$(mktemp -d) && cd "$W"   # work here; save the scripts below into this folder
```

Save this as `make_toy_task.sh` in `$W` and run `bash make_toy_task.sh`. It writes the task in the Harbor layout and three fake agents.

```bash
#!/bin/bash
# Creates ./asof-lookup, a tiny Harbor-format task, and ./agents/coinflip_agent.py (FAKE agents).
set -euo pipefail
mkdir -p asof-lookup/environment asof-lookup/solution asof-lookup/tests agents

cat > asof-lookup/instruction.md <<'EOF'
# Point-in-time lookup

`/app/pit.py` contains a stub, `value_asof(vintages, event, asof)`. Implement it.

- `vintages` is a list of `(event, published_at, value)` tuples. `published_at` and `asof` are integers (seconds).
- Return the value of the vintage of `event` with the largest `published_at` such that `published_at <= asof`.
- If several vintages of that event share that `published_at`, the one that comes last in the list wins.
- If no vintage qualifies, return `None`.
- Do not modify `vintages`.
EOF

cat > asof-lookup/task.toml <<'EOF'
schema_version = "1.3"

[task]
name = "playbook/asof-lookup"
description = "Point-in-time lookup that honors publication times."

[verifier]
timeout_sec = 60.0

[agent]
timeout_sec = 300.0

[environment]
build_timeout_sec = 300.0
cpus = 1
memory_mb = 512
EOF

cat > asof-lookup/environment/Dockerfile <<'EOF'
FROM python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de
WORKDIR /app
COPY pit.py /app/pit.py
EOF

cat > asof-lookup/environment/pit.py <<'EOF'
def value_asof(vintages, event, asof):
    raise NotImplementedError
EOF

cat > asof-lookup/solution/solve.sh <<'EOF'
#!/bin/bash
# Reference solution: Harbor's "oracle" agent runs this.
cat > /app/pit.py <<'PY'
def value_asof(vintages, event, asof):
    best = None
    for e, published_at, value in vintages:
        if e == event and published_at <= asof:
            if best is None or published_at >= best[0]:
                best = (published_at, value)
    return None if best is None else best[1]
PY
EOF

cat > asof-lookup/tests/test.sh <<'EOF'
#!/bin/bash
# Harbor uploads tests/ to /tests after the agent finishes, then runs this.
mkdir -p /logs/verifier
if python3 /tests/test_pit.py; then
  echo 1 > /logs/verifier/reward.txt
else
  echo 0 > /logs/verifier/reward.txt
fi
EOF

cat > asof-lookup/tests/test_pit.py <<'EOF'
import copy
import sys

sys.path.insert(0, "/app")
from pit import value_asof

V = [("gdp-q2", 100, 1.0), ("gdp-q2", 200, 1.2), ("gdp-q3", 150, 2.0), ("gdp-q2", 200, 1.3)]
before = copy.deepcopy(V)
cases = [
    ("gdp-q2", 99, None),    # nothing published yet
    ("gdp-q2", 100, 1.0),    # boundary: published_at == asof counts
    ("gdp-q2", 199, 1.0),    # the revision is not public yet
    ("gdp-q2", 200, 1.3),    # tie at 200: the later row wins
    ("gdp-q3", 10**9, 2.0),  # another event
    ("gdp-q4", 10**9, None), # unknown event
]
failed = []
for event, asof, want in cases:
    try:
        got = value_asof(V, event, asof)
    except Exception as exc:  # a crash is a failed case, not a crashed verifier
        got = repr(exc)
    if got != want:
        failed.append((event, asof, want, got))
if V != before:
    failed.append("input was modified")
print("failed:", failed)
sys.exit(1 if failed else 0)
EOF

cat > agents/coinflip_agent.py <<'EOF'
"""A FAKE agent for a statistics demo. It is not a model.

It writes a correct value_asof with probability P_RIGHT, and otherwise
a version that uses < instead of <= (an off-by-one on the time boundary).
"""
import random

from harbor.agents.base import BaseAgent
from harbor.agents.installed.base import ApiUsageLimitError

P_RIGHT = 0.6

CODE = '''def value_asof(vintages, event, asof):
    best = None
    for e, published_at, value in vintages:
        if e == event and published_at OP asof:
            if best is None or published_at >= best[0]:
                best = (published_at, value)
    return None if best is None else best[1]
'''


class CoinFlipAgent(BaseAgent):
    @staticmethod
    def name() -> str:
        return "coinflip"

    def version(self) -> str:
        return "0.1.0"

    async def setup(self, environment) -> None:
        return

    async def run(self, instruction, environment, context) -> None:
        op = "<=" if random.random() < P_RIGHT else "<"
        code = CODE.replace("OP", op)
        await environment.exec(command=f"cat > /app/pit.py <<'PY'\n{code}PY")


class SlowCoinFlipAgent(CoinFlipAgent):
    """Like CoinFlipAgent, but half the time it stalls for 20 seconds first."""

    @staticmethod
    def name() -> str:
        return "slow-coinflip"

    async def run(self, instruction, environment, context) -> None:
        if random.random() < 0.5:
            await environment.exec(command="sleep 20")
        await super().run(instruction, environment, context)


class QuotaCoinFlipAgent(CoinFlipAgent):
    """Like CoinFlipAgent, but half the time it stops at once with a FAKE quota error."""

    @staticmethod
    def name() -> str:
        return "quota-coinflip"

    async def run(self, instruction, environment, context) -> None:
        if random.random() < 0.5:
            raise ApiUsageLimitError("FAKE quota error: RESOURCE_EXHAUSTED")
        await super().run(instruction, environment, context)
EOF

chmod +x asof-lookup/solution/solve.sh asof-lookup/tests/test.sh
echo "created $(pwd)/asof-lookup and $(pwd)/agents"
```

The Dockerfile pins the same Python image digest as Lab F. If Docker does not have it yet, the first build pulls it.

The toy grader has six cases and was never validated the way [[grader-validity]] demands. It exists only for the statistics demo. Do not copy it as a model of a good grader.

### Baselines first: oracle and do-nothing {#toy-baselines}

Before any model run, prove the task can be passed and cannot be passed by doing nothing ([[task-design]]). Run:

```zsh
harbor run -p asof-lookup -a oracle -k 3 -n 3 -o jobs --job-name oracle-k3
harbor run -p asof-lookup -a nop -k 3 -n 3 -o jobs --job-name nop-k3
```

Real output (the summary part; 14 s and 13 s):

```text
adhoc • oracle
┏━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━┳━━━━━━━━┓
┃ Trials ┃ Exceptions ┃  Mean ┃ Pass@2 ┃
┡━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━╇━━━━━━━━┩
│      3 │          0 │ 1.000 │  1.000 │
└────────┴────────────┴───────┴────────┘

adhoc • nop
┏━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━┳━━━━━━━━┓
┃ Trials ┃ Exceptions ┃  Mean ┃ Pass@2 ┃
┡━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━╇━━━━━━━━┩
│      3 │          0 │ 0.000 │  0.000 │
└────────┴────────────┴───────┴────────┘
```

`-k` is attempts per trial, `-n` is how many run at once, `-o` is the jobs folder. These meanings come from `harbor run --help` in 0.24.0 (`--n-attempts -k`, `--n-concurrent -n`, `--jobs-dir -o`). The docs page only shows the flags and points to `--help` ^[confirmed](https://docs.harborframework.com/jobs/run-a-job "2026-10-20").

### Twenty attempts from the fake agent {#toy-twenty}

```zsh
PYTHONPATH="$W/agents" harbor run -p asof-lookup -a coinflip_agent:CoinFlipAgent \
  -k 20 -n 4 -o jobs --job-name coinflip-k20
```

Real output (1 min 7 s):

```text
adhoc • coinflip
┏━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━┳━━━━━━━━┳━━━━━━━━┳━━━━━━━━┳━━━━━━━━┳━━━━━━━━━┳━━━━━━━━━┳━━━━━━━━━┳━━━━━━━━━┓
┃ Trials ┃ Exceptions ┃  Mean ┃ Pass@2 ┃ Pass@4 ┃ Pass@5 ┃ Pass@8 ┃ Pass@10 ┃ Pass@15 ┃ Pass@16 ┃ Pass@20 ┃
┡━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━╇━━━━━━━━╇━━━━━━━━╇━━━━━━━━╇━━━━━━━━╇━━━━━━━━━╇━━━━━━━━━╇━━━━━━━━━╇━━━━━━━━━┩
│     20 │          0 │ 0.700 │  0.921 │  0.997 │  1.000 │  1.000 │   1.000 │   1.000 │   1.000 │   1.000 │
└────────┴────────────┴───────┴────────┴────────┴────────┴────────┴─────────┴─────────┴─────────┴─────────┘

┏━━━━━━━━┳━━━━━━━┓
┃ Reward ┃ Count ┃
┡━━━━━━━━╇━━━━━━━┩
│ 1.0    │    14 │
│ 0.0    │     6 │
└────────┴───────┘
```

Read it slowly:
- The true rate is 60%. We observed 14 of 20 = 70%. That is ordinary noise, not a better agent.
- Harbor prints the mean and pass@k. It prints no interval and no pass^k. You add those yourself, below.
- `Pass@2 = 0.921` is Chen et al.'s unbiased estimator: 1 − C(6,2)/C(20,2) = 1 − 15/190 = 0.921. So Harbor uses the right formula. Check this kind of thing whenever a tool gives you a number.

One failed trial's verifier output (`jobs/coinflip-k20/<trial>/verifier/test-stdout.txt`):

```text
failed: [('gdp-q2', 100, 1.0, None), ('gdp-q2', 200, 1.3, 1.0)]
```

The `<` bug drops the vintage published exactly at `asof`. This is the boundary rule from Chronos, in miniature.

### Timeouts are outcomes {#timeouts}

The second fake agent stalls for 20 s half the time. We shrank the agent timeout to 6 s (300 s × 0.02) to force timeouts:

```zsh
PYTHONPATH="$W/agents" harbor run -p asof-lookup -a coinflip_agent:SlowCoinFlipAgent \
  -k 8 -n 4 --agent-timeout-multiplier 0.02 -o jobs --job-name slow-k8
```

Real output (38 s):

```text
┏━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━┳━━━━━━━━┳━━━━━━━━┳━━━━━━━━┳━━━━━━━━┓
┃ Trials ┃ Exceptions ┃  Mean ┃ Pass@2 ┃ Pass@4 ┃ Pass@5 ┃ Pass@8 ┃
┡━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━╇━━━━━━━━╇━━━━━━━━╇━━━━━━━━╇━━━━━━━━┩
│      8 │          5 │ 0.000 │  0.000 │  0.000 │  0.000 │  0.000 │
└────────┴────────────┴───────┴────────┴────────┴────────┴────────┘

┏━━━━━━━━━━━━━━━━━━━┳━━━━━━━┓
┃ Exception         ┃ Count ┃
┡━━━━━━━━━━━━━━━━━━━╇━━━━━━━┩
│ AgentTimeoutError │     5 │
└───────────────────┴───────┘
```

What happened, from the trial files:
- 5 attempts hit `AgentTimeoutError`. Harbor **still ran the verifier** on what the agent left: the untouched stub. Each got reward 0, with `NotImplementedError` in every check. Harbor's trial code records the timeout and then grades, in that order.
- The other 3 finished. All 3 happened to draw the buggy branch. The chance of that is 0.4³ = 6.4%. We did not re-run to get a prettier example. Re-running until the data looks right is exactly the habit this chapter is against.

The rule you take from this: **the time budget is part of the configuration**. A timed-out attempt is a failed attempt of that configuration. If you drop timeouts, you drop exactly the hard attempts, and your rate goes up for no real reason ^[inference](- "2026-10-20").

### A reward does not prove a fair try {#infra-errors}

The third fake agent stops at once half the time. It raises the exception Harbor uses for a real quota error, `ApiUsageLimitError`. Run:

```zsh
PYTHONPATH="$W/agents" harbor run -p asof-lookup -a coinflip_agent:QuotaCoinFlipAgent \
  -k 8 -n 4 -o jobs --job-name quota-k8
```

Real output (47 s):

```text
┏━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━┳━━━━━━━━┳━━━━━━━━┳━━━━━━━━┳━━━━━━━━┓
┃ Trials ┃ Exceptions ┃  Mean ┃ Pass@2 ┃ Pass@4 ┃ Pass@5 ┃ Pass@8 ┃
┡━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━╇━━━━━━━━╇━━━━━━━━╇━━━━━━━━╇━━━━━━━━┩
│      8 │          4 │ 0.125 │  0.250 │  0.500 │  0.625 │  1.000 │
└────────┴────────────┴───────┴────────┴────────┴────────┴────────┘

┏━━━━━━━━━━━━━━━━━━━━┳━━━━━━━┓
┃ Exception          ┃ Count ┃
┡━━━━━━━━━━━━━━━━━━━━╇━━━━━━━┩
│ ApiUsageLimitError │     4 │
└────────────────────┴───────┘
```

Harbor graded the 4 quota-stopped attempts too. Each got reward 0 on the untouched stub, so Harbor's mean of 0.125 blames the agent for the quota. A real `agy` error takes the same path. Harbor's `antigravity-cli` adapter reads agy's error line and raises a typed exception: `RESOURCE_EXHAUSTED` becomes `ApiRateLimitError` or `ApiUsageLimitError`, and `UNAUTHENTICATED` becomes `AgentAuthenticationError`. The trial code then records it and runs the verifier anyway ^[confirmed](https://pypi.org/project/harbor/ "2026-10-20"). We read this in the source; we did not trigger it with a real `agy`.

The full rule. Write yours before the runs ^[inference](- "2026-10-20"):
- **Failed attempt:** the model had a fair try and the grader said no. Timeouts count here. So do context-window and output-token limits: they are part of the configuration too.
- **Infrastructure error:** the model never got a fair try. The environment never started, the verifier crashed, or the agent stopped on an API, quota, auth or network error (401, 403, 429, 5xx, `RESOURCE_EXHAUSTED`). Harbor still grades these, so a reward alone does not prove a fair attempt. Classify by exception type.
- **Unclassified crash:** plain `NonZeroAgentExitCodeError` means Harbor did not recognize the error. Read the trial's `exception.txt` and agent log by hand, then apply your written rule.
- Exclude infrastructure errors, count them, list them, and re-run them as a new job. Keep both jobs.

### The job report {#job-report}

Most statistics in this chapter come from one small module. Save it as `runstats.py` in `$W`:

```python
"""Statistics for repeated agent runs on ONE task. Python 3.9+, standard library only.

Every function assumes: n attempts, independent, from ONE fixed configuration
(model ID, effort, harness version, prompt, environment image) on ONE task.
"""
import random
from math import comb, sqrt
from statistics import NormalDist

Z95 = NormalDist().inv_cdf(0.975)  # 1.959964


def wilson(c, n, z=Z95):
    """Wilson score interval for c successes in n attempts."""
    if n <= 0 or not 0 <= c <= n:
        raise ValueError("need n > 0 and 0 <= c <= n")
    p = c / n
    d = 1 + z * z / n
    mid = (p + z * z / (2 * n)) / d
    half = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, mid - half), min(1.0, mid + half)


def pass_at_k(n, c, k):
    """Unbiased pass@k (Chen et al. 2021): P(at least one of k drawn attempts passes)."""
    if k > n:
        raise ValueError("need k <= n")
    if n - c < k:
        return 1.0
    return 1 - comb(n - c, k) / comb(n, k)


def pass_hat_k(n, c, k):
    """Unbiased pass^k (Yao et al. 2024): P(all k drawn attempts pass)."""
    if k > n:
        raise ValueError("need k <= n")
    return comb(c, k) / comb(n, k)


def pass_at_k_plugin(n, c, k):
    """Plug-in pass@k, 1 - (1 - c/n)^k. Biased low for small n."""
    return 1 - (1 - c / n) ** k


def pass_hat_k_plugin(n, c, k):
    """Plug-in pass^k, (c/n)^k. Biased high for small n."""
    return (c / n) ** k


def bootstrap_rate(outcomes, reps=10_000, seed=0):
    """Percentile bootstrap interval for the mean of 0/1 outcomes."""
    rng = random.Random(seed)
    n = len(outcomes)
    means = sorted(sum(rng.choices(outcomes, k=n)) / n for _ in range(reps))
    return means[int(0.025 * reps)], means[int(0.975 * reps) - 1]


def expected(estimator, n, k, p):
    """Exact mean of an estimator over c ~ Binomial(n, p)."""
    return sum(comb(n, c) * p**c * (1 - p) ** (n - c) * estimator(n, c, k) for c in range(n + 1))


def pct(x):
    return f"{100 * x:5.1f}%"


if __name__ == "__main__":
    print("1. Wilson 95% intervals")
    for c, n in [(2, 5), (4, 5), (10, 20), (16, 20)]:
        lo, hi = wilson(c, n)
        print(f"   {c:>2}/{n:<2}  rate {pct(c / n)}  [{pct(lo)}, {pct(hi)}]  width {100 * (hi - lo):4.1f} pts")

    print("2. How often does a true-50% configuration look like 80% or better?")
    for n in (5, 20):
        need = -(-4 * n // 5)  # ceil(0.8 n)
        prob = sum(comb(n, j) for j in range(need, n + 1)) / 2**n
        print(f"   n={n:<2}: P(at least {need}/{n} | p=0.5) = {pct(prob)}")

    print("3. Worked numbers: n=10 attempts, c=3 passed")
    for k in (1, 3, 5):
        print(f"   k={k}: pass@k {pct(pass_at_k(10, 3, k))} (plug-in {pct(pass_at_k_plugin(10, 3, k))})"
              f"   pass^k {pct(pass_hat_k(10, 3, k))} (plug-in {pct(pass_hat_k_plugin(10, 3, k))})")

    print("4. Bias check: exact expectations when the true rate is p=0.3, n=10, k=3")
    p = 0.3
    print(f"   truth   pass@3 = {pct(1 - (1 - p) ** 3)}   pass^3 = {pct(p ** 3)}")
    print(f"   unbiased mean    {pct(expected(pass_at_k, 10, 3, p))}            {pct(expected(pass_hat_k, 10, 3, p))}")
    print(f"   plug-in mean     {pct(expected(pass_at_k_plugin, 10, 3, p))}            {pct(expected(pass_hat_k_plugin, 10, 3, p))}")

    print("5. Percentile bootstrap vs Wilson")
    for c, n in [(14, 20), (4, 5), (5, 5)]:
        outcomes = [1] * c + [0] * (n - c)
        blo, bhi = bootstrap_rate(outcomes)
        wlo, whi = wilson(c, n)
        print(f"   {c:>2}/{n:<2}  bootstrap [{pct(blo)}, {pct(bhi)}]   Wilson [{pct(wlo)}, {pct(whi)}]")

    print("6. Chance to see a failure mode at least once (it occurs in a fraction f of attempts)")
    for f in (0.3, 0.1, 0.05):
        print(f"   f={f:.0%}: " + "   ".join(f"n={n}: {pct(1 - (1 - f) ** n)}" for n in (5, 20, 50)))
```

Then save `job_report.py` next to it. It reads Harbor's per-trial `result.json` files and prints **raw outcomes first**. It applies [the rule above](#infra-errors):

```python
"""Report one Harbor job: one task, one configuration. Needs runstats.py next to it.

Usage: python3 job_report.py JOBS_DIR/JOB_NAME
Reads each trial's result.json. Prints raw outcomes first, then statistics.
Rule (write yours before the runs): a timed-out attempt is a failed attempt.
An attempt is an infrastructure error when the model never got a fair try:
no reward (environment or verifier crash), or an API, quota, auth or network
error. Harbor grades those too, so a reward alone proves nothing. Infrastructure
errors are excluded, counted, listed, and re-run as a new job.
"""
import json
import sys
from collections import Counter
from pathlib import Path

from runstats import bootstrap_rate, pass_at_k, pass_hat_k, pct, wilson

# Harbor 0.24.0 exception types that mean "the model never got a fair try".
# Recheck this list when you change Harbor versions.
INFRA_ERRORS = {
    "ApiRateLimitError", "ApiUsageLimitError", "ApiInternalServerError", "ApiOverloadedError",
    "ApiConnectionClosedError", "ApiResponseStalledError", "UnknownApiError",
    "ApiProviderResourceNotFoundError", "AgentAuthenticationError", "ModelNotFoundError",
    "NetworkConnectionError",
}

rows = []
for f in sorted(Path(sys.argv[1]).glob("*/result.json")):
    r = json.loads(f.read_text())
    rewards = (r.get("verifier_result") or {}).get("rewards") or {}
    error = (r.get("exception_info") or {}).get("exception_type")
    infra = "no reward" if "reward" not in rewards else error if error in INFRA_ERRORS else None
    rows.append({"name": r["trial_name"], "rewards": rewards, "error": error, "infra": infra,
                 "agent": (r.get("agent_info") or {}).get("version"), "task": r["task_checksum"][:12]})

print("raw outcomes:")
for row in rows:
    flag = f"  INFRA ({row['infra']})" if row["infra"] else ""
    flag += "  CHECK BY HAND" if row["error"] == "NonZeroAgentExitCodeError" else ""
    print(f"  {row['name']}  rewards={row['rewards']}  exception={row['error']}"
          f"  agent={row['agent']}  task={row['task']}{flag}")

for key, what in (("task", "task versions"), ("agent", "agent versions")):
    if len({row[key] for row in rows}) != 1:
        sys.exit(f"STOP: the trials ran on different {what}")
graded = [row for row in rows if not row["infra"]]
print("exceptions:", dict(Counter(row["error"] for row in rows if row["error"])) or "none")
print(f"infrastructure errors (excluded, re-run as a new job): {len(rows) - len(graded)}")
if not graded:
    sys.exit("STOP: no graded attempts")

n = len(graded)
full = [1 if row["rewards"]["reward"] == 1 else 0 for row in graded]  # pass = full reward
c = sum(full)
lo, hi = wilson(c, n)
blo, bhi = bootstrap_rate(full)
print(f"graded n={n}, full reward c={c}: {pct(c / n)}  Wilson 95% [{pct(lo)}, {pct(hi)}]"
      f"  bootstrap 95% [{pct(blo)}, {pct(bhi)}]")
for k in (1, 2, 3, 5):
    if k <= n:
        print(f"  k={k}: pass@k {pct(pass_at_k(n, c, k))}   pass^k {pct(pass_hat_k(n, c, k))}")

keys = sorted({key for row in graded for key in row["rewards"]})
if keys != ["reward"]:
    print("per reward key:")
    for key in keys:
        values = [row["rewards"].get(key) for row in graded]
        if None in values:
            print(f"  {key}: missing in {values.count(None)} trials")
        elif set(values) <= {0, 1}:
            kc = int(sum(values))
            klo, khi = wilson(kc, n)
            print(f"  {key}: {kc} of {n}  Wilson 95% [{pct(klo)}, {pct(khi)}]")
        else:
            mlo, mhi = bootstrap_rate(values)
            print(f"  {key}: mean {sum(values) / n:.3f}  bootstrap 95% [{mlo:.3f}, {mhi:.3f}]")
```

Real output. We shortened the raw rows to save space; the lines in parentheses are ours. The script prints every row:

```text
$ python3 job_report.py jobs/coinflip-k20
raw outcomes:
  asof-lookup__4jV2KGQ  rewards={'reward': 1.0}  exception=None  agent=0.1.0  task=991d249aa85e
  asof-lookup__HX5gjyp  rewards={'reward': 0.0}  exception=None  agent=0.1.0  task=991d249aa85e
  (18 more rows)
exceptions: none
infrastructure errors (excluded, re-run as a new job): 0
graded n=20, full reward c=14:  70.0%  Wilson 95% [ 48.1%,  85.5%]  bootstrap 95% [ 50.0%,  90.0%]
  k=1: pass@k  70.0%   pass^k  70.0%
  k=2: pass@k  92.1%   pass^k  47.9%
  k=3: pass@k  98.2%   pass^k  31.9%
  k=5: pass@k 100.0%   pass^k  12.9%
$ python3 job_report.py jobs/slow-k8
raw outcomes:
  asof-lookup__3aSP35i  rewards={'reward': 0.0}  exception=None  agent=0.1.0  task=991d249aa85e
  asof-lookup__9xg4c45  rewards={'reward': 0.0}  exception=AgentTimeoutError  agent=0.1.0  task=991d249aa85e
  (6 more rows: 4 more with AgentTimeoutError, all with reward 0.0)
exceptions: {'AgentTimeoutError': 5}
infrastructure errors (excluded, re-run as a new job): 0
graded n=8, full reward c=0:   0.0%  Wilson 95% [  0.0%,  32.4%]  bootstrap 95% [  0.0%,   0.0%]
  k=1: pass@k   0.0%   pass^k   0.0%
  k=2: pass@k   0.0%   pass^k   0.0%
  k=3: pass@k   0.0%   pass^k   0.0%
  k=5: pass@k   0.0%   pass^k   0.0%
$ python3 job_report.py jobs/quota-k8
raw outcomes:
  asof-lookup__63qRJrm  rewards={'reward': 1.0}  exception=None  agent=0.1.0  task=991d249aa85e
  asof-lookup__FzQPNY5  rewards={'reward': 0.0}  exception=ApiUsageLimitError  agent=0.1.0  task=991d249aa85e  INFRA (ApiUsageLimitError)
  (6 more rows: 3 more INFRA (ApiUsageLimitError), 3 more graded with reward 0.0)
exceptions: {'ApiUsageLimitError': 4}
infrastructure errors (excluded, re-run as a new job): 4
graded n=4, full reward c=1:  25.0%  Wilson 95% [  4.6%,  69.9%]  bootstrap 95% [  0.0%,  75.0%]
  k=1: pass@k  25.0%   pass^k  25.0%
  k=2: pass@k  50.0%   pass^k   0.0%
  k=3: pass@k  75.0%   pass^k   0.0%
```

Read it slowly:
- The Wilson interval for 14/20, [48.1%, 85.5%], contains the true 60%.
- The timeouts stay in: n = 8, all graded.
- The quota stops come out: n = 4, not 8. Re-run those 4 as a new job and report both jobs. Harbor's own table said 0.125; the fair-try rate is 1 of 4.
- The script stops if the trials ran on different task versions (`task_checksum`) or different agent versions (`agent_info.version`). Both guards came from mistakes that are easy to make at 2 a.m. ^[inference](- "2026-10-20").

### Non-binary rewards (Chronos) {#milestones}

Chronos gives partial credit: each milestone has a weight, and the reward is the weighted sum. So define two things before the runs ^[inference](- "2026-10-20"):
- **Pass** means reward 1.0: every milestone passed (the weights sum to 1). pass@1, pass@k and pass^k use only this 0/1 outcome.
- **Milestones** get one line each: "boundary: 4 of 10 (Wilson 95% [16.8%, 68.7%])". Add the mean reward with a bootstrap interval.

:::warn title="Harbor accepts only numbers in reward.json"
Harbor 0.24.0 reads `/logs/verifier/reward.json` as a flat JSON object of numbers, for example `{"reward": 0.5, "M1": 1, "M2": 1, "M3": 0, "M4": 0, "gate": 1}`. Any other value raises `VerifierOutputParseError`, and the trial gets no reward ^[confirmed](https://pypi.org/project/harbor/ "2026-10-20"). We tried it: the oracle (the correct solution) with a list in `reward.json` got no reward at all. Write raw test outcomes to a separate file, such as `/logs/verifier/details.json`.

The capstone's `gvt` README documents a nested `reward.json` for its own runs: `{"reward": 0.65, "milestones": {"M1": {"score": 1.0, "passed": true, "tests": {...}}}}`. By the rule above, Harbor would give that file no reward. So if you run Chronos under Harbor, have the verifier write a flat copy for Harbor and keep the nested file as details ^[inference](- "2026-10-20").
:::

To see this on data you know, save `make_milestone_task.sh` in `$W` and run `bash make_milestone_task.sh`. It copies the toy task and gives it a grader with three milestones:

```bash
#!/bin/bash
# Copies ./asof-lookup to ./asof-milestones and gives it a milestone grader.
set -euo pipefail
rm -rf asof-milestones
cp -R asof-lookup asof-milestones
sed -i '' 's#playbook/asof-lookup#playbook/asof-milestones#' asof-milestones/task.toml
rm asof-milestones/tests/test_pit.py

cat > asof-milestones/tests/test.sh <<'EOF'
#!/bin/bash
# Writes /logs/verifier/reward.json (numbers only) and details.json (raw outcomes).
mkdir -p /logs/verifier
python3 /tests/milestones.py
EOF

cat > asof-milestones/tests/milestones.py <<'EOF'
import json
import sys

sys.path.insert(0, "/app")
V = [("gdp-q2", 100, 1.0), ("gdp-q2", 200, 1.2), ("gdp-q3", 150, 2.0), ("gdp-q2", 200, 1.3)]
MILESTONES = {  # name: (weight, cases); the weights sum to 1
    "basic": (0.2, [("gdp-q2", 99, None), ("gdp-q3", 10**9, 2.0), ("gdp-q4", 10**9, None)]),
    "boundary": (0.4, [("gdp-q2", 100, 1.0), ("gdp-q2", 199, 1.0)]),
    "ties": (0.4, [("gdp-q2", 200, 1.3)]),
}
try:
    from pit import value_asof
except Exception:
    value_asof = None
rewards, details = {}, {}
for name, (weight, cases) in MILESTONES.items():
    failed = []
    for event, asof, want in cases:
        try:
            got = value_asof(list(V), event, asof)
        except Exception as exc:  # a crash fails the case, not the verifier
            got = repr(exc)
        if got != want:
            failed.append([event, asof, repr(want), repr(got)])
    rewards[name] = 0 if failed else 1
    details[name] = failed
rewards["reward"] = round(sum(w * rewards[n] for n, (w, _) in MILESTONES.items()), 6)
with open("/logs/verifier/reward.json", "w") as f:
    json.dump(rewards, f)
with open("/logs/verifier/details.json", "w") as f:
    json.dump(details, f, indent=1)
print(json.dumps(rewards))
EOF

chmod +x asof-milestones/tests/test.sh
echo "created $(pwd)/asof-milestones"
```

(`sed -i ''` is the macOS form.) Run the baselines, then the fake agent:

```zsh
harbor run -p asof-milestones -a oracle -k 2 -n 2 -o jobs --job-name ms-oracle
harbor run -p asof-milestones -a nop -k 2 -n 2 -o jobs --job-name ms-nop
PYTHONPATH="$W/agents" harbor run -p asof-milestones -a coinflip_agent:CoinFlipAgent \
  -k 10 -n 4 -o jobs --job-name ms-coinflip-k10
python3 job_report.py jobs/ms-coinflip-k10
```

Real output. The oracle scored 1.000 on every key and do-nothing scored 0.000 on every key. For the fake agent, Harbor printed a mean per key and no interval:

```text
┏━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━┳━━━━━━━━━━┳━━━━━━━━┳━━━━━━━┓
┃ Trials ┃ Exceptions ┃ Basic ┃ Boundary ┃ Reward ┃  Ties ┃
┡━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━╇━━━━━━━━━━╇━━━━━━━━╇━━━━━━━┩
│     10 │          0 │ 1.000 │    0.400 │  0.520 │ 0.400 │
└────────┴────────────┴───────┴──────────┴────────┴───────┘
```

`job_report.py` on the same job (raw rows shortened):

```text
raw outcomes:
  asof-milestones__73wEsFb  rewards={'basic': 1, 'boundary': 0, 'ties': 0, 'reward': 0.2}  exception=None  agent=0.1.0  task=1b56935ac0ac
  asof-milestones__XM8zTb2  rewards={'basic': 1, 'boundary': 1, 'ties': 1, 'reward': 1.0}  exception=None  agent=0.1.0  task=1b56935ac0ac
  (8 more rows)
exceptions: none
infrastructure errors (excluded, re-run as a new job): 0
graded n=10, full reward c=4:  40.0%  Wilson 95% [ 16.8%,  68.7%]  bootstrap 95% [ 10.0%,  70.0%]
  k=1: pass@k  40.0%   pass^k  40.0%
  k=2: pass@k  66.7%   pass^k  13.3%
  k=3: pass@k  83.3%   pass^k   3.3%
  k=5: pass@k  97.6%   pass^k   0.0%
per reward key:
  basic: 10 of 10  Wilson 95% [ 72.2%, 100.0%]
  boundary: 4 of 10  Wilson 95% [ 16.8%,  68.7%]
  reward: mean 0.520  bootstrap 95% [0.280, 0.760]
  ties: 4 of 10  Wilson 95% [ 16.8%,  68.7%]
```

What it shows ^[inference](- "2026-10-20"):
- **One bug failed two milestones.** The `<` bug drops the vintage at exactly 200, so it also breaks the tie at 200. Milestones are not independent. Never multiply their rates.
- **Do-nothing scored 0 here,** because the stub crashes every case. If some milestone pays the unchanged repo, the mean reward is inflated ([[grader-validity#partial-credit|Chapter 8]]). Check your baselines per key.
- **10 of 10 on `basic` still has a lower bound of 72.2%.** Ten runs cannot show a milestone is always passed.

## Why 5 runs are too few {#five-runs}

Run `python3 runstats.py`. Real output (2026-10-20, Python 3.13.9):

```text
1. Wilson 95% intervals
    2/5   rate  40.0%  [ 11.8%,  76.9%]  width 65.2 pts
    4/5   rate  80.0%  [ 37.6%,  96.4%]  width 58.8 pts
   10/20  rate  50.0%  [ 29.9%,  70.1%]  width 40.1 pts
   16/20  rate  80.0%  [ 58.4%,  91.9%]  width 33.5 pts
2. How often does a true-50% configuration look like 80% or better?
   n=5 : P(at least 4/5 | p=0.5) =  18.8%
   n=20: P(at least 16/20 | p=0.5) =   0.6%
3. Worked numbers: n=10 attempts, c=3 passed
   k=1: pass@k  30.0% (plug-in  30.0%)   pass^k  30.0% (plug-in  30.0%)
   k=3: pass@k  70.8% (plug-in  65.7%)   pass^k   0.8% (plug-in   2.7%)
   k=5: pass@k  91.7% (plug-in  83.2%)   pass^k   0.0% (plug-in   0.2%)
4. Bias check: exact expectations when the true rate is p=0.3, n=10, k=3
   truth   pass@3 =  65.7%   pass^3 =   2.7%
   unbiased mean     65.7%              2.7%
   plug-in mean      61.4%              4.7%
5. Percentile bootstrap vs Wilson
   14/20  bootstrap [ 50.0%,  90.0%]   Wilson [ 48.1%,  85.5%]
    4/5   bootstrap [ 40.0%, 100.0%]   Wilson [ 37.6%,  96.4%]
    5/5   bootstrap [100.0%, 100.0%]   Wilson [ 56.6%, 100.0%]
6. Chance to see a failure mode at least once (it occurs in a fraction f of attempts)
   f=30%: n=5:  83.2%   n=20:  99.9%   n=50: 100.0%
   f=10%: n=5:  41.0%   n=20:  87.8%   n=50:  99.5%
   f=5%: n=5:  22.6%   n=20:  64.2%   n=50:  92.3%
```

We checked the four Wilson intervals against SciPy 1.16.2 (`binomtest(...).proportion_ci(method="wilson")`) and statsmodels 0.14.5 (`proportion_confint(..., method="wilson")`). All agree to four decimals.

A **Wilson score interval** is a range that covers the true pass rate in about 95% of repeated experiments, if the attempts are independent with one fixed rate. That 95% is an average over true rates. For rates near 0% or 100%, the real coverage can drop to about 83% at n = 5 and 84% at n = 20. We found the worst cases by exact enumeration with `wilson()` above ^[inference](- "2026-10-20"). Results like 0/8 and 5/5 in this chapter come from true rates in that region. Brown, Cai and DasGupta recommend it over the textbook "p ± 1.96 × SE" interval for small n ^[confirmed](https://doi.org/10.1214/ss/1009213286 "2026-10-20"). The formula and a by-hand example are in [[grader-validity#wilson|Chapter 8]].

What the four lines say ^[inference](- "2026-10-20"):
- **2/5 and 4/5 overlap from 37.6% to 76.9%.** "Model B got 4 of 5, model A got 2 of 5" does not show that B is better.
- **Five runs give an interval about 60 points wide.** With 20 runs it is still 33–40 points wide.
- **Luck is common at n = 5.** A configuration that truly passes half the time shows 4 or 5 of 5 in 18.8% of experiments. At n = 20, it shows 16 or more of 20 in only 0.6%.
- The fake agent from the last section agrees: true 60%, observed 70% with n = 20.

### What 5 runs are good for {#five-runs-good}

Five runs are not useless. They answer different questions:
- **Is the task broken?** 0 of 5, with transcripts that show environment errors, is a broken task ([[task-design]]).
- **Which failure modes exist?** Line 6 above: a failure that happens in 30% of attempts shows up at least once in 5 runs 83.2% of the time. A 5% failure shows up only 22.6% of the time. So 5 runs find common failure modes and miss rare ones.
- **A smoke test** of the harness before you spend the real budget.

Terminal-Bench runs at least 5 per agent-model pair, but over 89 tasks, so its intervals are about the benchmark, not about one task ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20").

:::warn title="Do not compute intervals from 5 runs and stop there"
An honest Day-1 report on 5 runs says: "3 of 5 passed (Wilson 95% interval 23–88%). This cannot rank configurations. The failures were …". The interval is there to stop you from over-claiming, not to decorate a number. 3/5 gives [23.1%, 88.2%] ([[defend-it#q15|Defend it, Q15]]).
:::

## pass@k and pass^k {#pass-k}

Two questions, two metrics:
- **pass@k** — "if I sample k attempts, does **at least one** pass?" It measures what the model can do with retries and a perfect picker.
- **pass^k** (read "pass hat k") — "if I sample k attempts, do **all k** pass?" It measures reliability. τ-bench introduced it for agents that must be consistent, such as customer-service agents ^[confirmed](https://arxiv.org/abs/2406.12045 "2026-10-20").

With a true per-attempt rate p and independent attempts:

```text
pass@k = 1 − (1 − p)^k        goes UP with k
pass^k = p^k                  goes DOWN with k
```

Anthropic's agent-eval guide gives the example p = 0.75, k = 3: pass^3 = 0.75³ ≈ 42% ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20").

### The estimators {#estimators}

You never know p. You have n attempts with c passes. Plugging in p̂ = c/n is tempting. It is biased.

**pass@k, unbiased (Chen et al., the Codex paper):** draw k of your n attempts without replacement. The chance that all k are failures is C(n−c, k)/C(n, k). So:

```text
pass@k = 1 − C(n − c, k) / C(n, k)        (needs n >= k; average it over tasks)
```

The Codex paper used n = 200 samples per problem and k up to 100. It shows that the plug-in 1 − (1 − p̂)^k is biased. Its Figure 3 gives a numerically stable NumPy version that multiplies small factors instead of dividing huge binomials ^[confirmed](https://arxiv.org/abs/2107.03374 "2026-10-20"). The same idea in plain Python:

```python
from math import prod


def pass_at_k_stable(n, c, k):
    """Same value as 1 - C(n-c, k) / C(n, k), without huge intermediate numbers."""
    if n - c < k:
        return 1.0
    return 1.0 - prod(1.0 - k / i for i in range(n - c + 1, n + 1))
```

We checked it against the `math.comb` version for every n below 60, every c and every k: the largest difference was 5.6e-16. Our `runstats.py` uses `math.comb`, because Python's integers are exact and agent runs have small n.

**pass^k, unbiased (τ-bench):** the chance that k attempts drawn without replacement are all passes:

```text
pass^k = C(c, k) / C(n, k)                 (average it over tasks)
```

That is the definition in the τ-bench paper ^[confirmed](https://arxiv.org/abs/2406.12045 "2026-10-20"). The **plug-in** pass^k is (c/n)^k. It is what most people compute by hand, and what the Anthropic example does. It is fine when n is large compared with k.

### Worked numbers {#pass-k-worked}

n = 10 attempts, c = 3 passes. By hand:

- pass@3 = 1 − C(7,3)/C(10,3) = 1 − 35/120 = **70.8%**. Plug-in: 1 − 0.7³ = 65.7%.
- pass^3 = C(3,3)/C(10,3) = 1/120 = **0.8%**. Plug-in: 0.3³ = 2.7%.
- pass^5 = C(3,5)/C(10,5) = 0, because you cannot draw 5 passes from 3. Plug-in: 0.3⁵ = 0.2%.

Line 3 of the script output above shows the same numbers.

**Which one is biased, and which way?** Line 4 computes the exact average of each estimator over all possible outcomes when the true p is 0.3 (n = 10, k = 3). The unbiased estimators average exactly to the truth: 65.7% and 2.7%. The plug-in pass@3 averages 61.4%, too low. The plug-in pass^3 averages 4.7%, nearly double the truth. The reason is Jensen's inequality: x³ is convex, so the average of p̂³ is larger than p³ ^[inference](- "2026-10-20").

"Unbiased" does not mean "precise". From 10 attempts, every estimate of pass^3 is very noisy. Report n next to it.

### Which one to report {#which-metric}

| Question | Metric | Example |
|---|---|---|
| How often does one attempt succeed? | pass@1, with a Wilson interval | Model cards: Gemini 4 Argon reports pass@1 ^[confirmed](https://deepmind.google/models/model-cards/gemini-4-argon/ "2026-10-20") |
| Can I rely on it k times in a row? | pass^k | An agent that must not fail on any of 5 daily jobs |
| Can it ever solve this, given retries and a checker? | pass@k | Best-of-k with an automatic verifier; RL exploration |

For Chronos: report pass@1 (full reward, every milestone) with its interval first. Then one line per milestone ([non-binary rewards](#milestones)). Add pass^3 to show reliability, and pass@5 to show the ceiling ^[inference](- "2026-10-20"). Always print n and c next to them. Harbor's table showed pass@k only. Your report adds the rest.

### pass@k decides whether RL can learn from a task {#pass-k-rl}

In GRPO-style RL, the trainer samples a group of attempts per prompt and compares their rewards. DAPO points out that if every attempt in a group gets the same reward, the advantage is zero and the policy gradient is zero. DAPO over-samples and filters out prompts with accuracy 1 and 0 ^[confirmed](https://arxiv.org/abs/2503.14476 "2026-10-20").

So for a training environment with group size G ^[inference](- "2026-10-20"):
- A task with pass@G ≈ 0 for the current model teaches nothing. Every group is all-zero.
- A task with pass^G ≈ 1 teaches nothing either. It is saturated.
- The useful tasks sit in between. pass@k and pass^k at k = G tell you where a task sits.

Group sizes differ. DeepSeek-R1's paper samples 16 outputs per question ^[confirmed](https://arxiv.org/html/2501.12948v2 "2026-10-20"). Mechanize's cost arithmetic assumes groups of 64 attempts per task, which it attributes to the DeepSeek-R1 training run ^[confirmed](https://www.mechanize.work/blog/cheap-rl-tasks-will-waste-compute "2026-10-20"). The two do not agree; use the paper's number when you cite DeepSeek-R1.

## Bootstrap intervals {#bootstrap}

The **bootstrap** (Efron, 1979) estimates uncertainty by resampling your own data with replacement many times and recomputing the statistic each time ^[confirmed](https://doi.org/10.1214/aos/1176344552 "2026-10-20"). The 2.5th and 97.5th percentiles of the recomputed values give a **percentile bootstrap interval**. It works for any statistic: a mean, pass^k, a difference between two models.

### When the bootstrap fails {#bootstrap-fails}

Look again at line 5 of the output:

```text
   14/20  bootstrap [ 50.0%,  90.0%]   Wilson [ 48.1%,  85.5%]
    4/5   bootstrap [ 40.0%, 100.0%]   Wilson [ 37.6%,  96.4%]
    5/5   bootstrap [100.0%, 100.0%]   Wilson [ 56.6%, 100.0%]
```

At 5 of 5, every resample is all passes. The bootstrap says "100%, no uncertainty". That is absurd after 5 runs. The bootstrap can only reshuffle what you saw; it cannot imagine a failure you never observed ^[inference](- "2026-10-20").

Rule: for **one task's pass rate**, use Wilson. Use the bootstrap where no simple formula exists: across tasks, for pass^k, for paired differences. Even then, it needs a reasonable number of units to resample.

### Comparing two configurations: pair by task {#paired}

A Polaris-style question is likely to be "is Gemini version B better than version A on our tasks?" ^[inference](- "2026-10-20"). The unit that varies most is the task. So resample **tasks**, and keep each task's A and B results together. Evan Miller's "Adding Error Bars to Evals" recommends clustered standard errors when questions come in related groups, and inference on question-level paired differences when two models are compared ^[confirmed](https://arxiv.org/abs/2411.00640 "2026-10-20").

Save as `paired.py` (synthetic data; the true rates are made up):

```python
"""Compare two configurations on the same tasks: paired vs unpaired task-level bootstrap.

SYNTHETIC data: 8 tasks, 10 runs per task per configuration, from made-up true rates.
Standard library only.
"""
import random

rng = random.Random(2026)
true_a = [0.9, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]  # made up
true_b = [0.9, 0.8, 0.6, 0.6, 0.5, 0.3, 0.3, 0.1]  # made up: B is 0.1 better on 4 tasks
RUNS, REPS, T = 10, 10_000, 8
rate_a = [sum(rng.random() < p for _ in range(RUNS)) / RUNS for p in true_a]
rate_b = [sum(rng.random() < p for _ in range(RUNS)) / RUNS for p in true_b]
diffs = [b - a for a, b in zip(rate_a, rate_b)]

print("task   A    B    B-A")
for t in range(T):
    print(f"T{t + 1}    {rate_a[t]:.1f}  {rate_b[t]:.1f}  {diffs[t]:+.1f}")
print(f"mean difference B-A = {sum(diffs) / T:+.3f} (true value {sum(true_b) / T - sum(true_a) / T:+.3f})")


def interval(samples):
    s = sorted(samples)
    return f"[{s[int(0.025 * REPS)]:+.3f}, {s[int(0.975 * REPS) - 1]:+.3f}]"


# Paired: resample TASKS, keep each task's A and B together.
paired = [sum(rng.choices(diffs, k=T)) / T for _ in range(REPS)]
# Unpaired: resample A's tasks and B's tasks independently (ignores that they share tasks).
unpaired = [sum(rng.choices(rate_b, k=T)) / T - sum(rng.choices(rate_a, k=T)) / T for _ in range(REPS)]
print("paired bootstrap 95%  ", interval(paired))
print("unpaired bootstrap 95%", interval(unpaired))
```

Real output:

```text
task   A    B    B-A
T1    1.0  0.9  -0.1
T2    0.5  0.5  +0.0
T3    0.4  0.5  +0.1
T4    0.5  0.8  +0.3
T5    0.2  0.4  +0.2
T6    0.5  0.2  -0.3
T7    0.1  0.1  +0.0
T8    0.0  0.3  +0.3
mean difference B-A = +0.062 (true value +0.050)
paired bootstrap 95%   [-0.075, +0.188]
unpaired bootstrap 95% [-0.213, +0.325]
```

Two lessons ^[inference](- "2026-10-20"):
- **Pairing halves the width here** (0.26 against 0.54). Tasks differ a lot in difficulty. Pairing removes that variation from the comparison.
- **Even paired, this sample of 8 tasks × 10 runs could not show the true +5-point improvement.** The interval includes 0. Say "no detectable difference", not "B is not better".

Note T6: B scored 0.2 against A's 0.5, although the true rates are equal (0.3). Ten runs per task are noisy too. The task-level bootstrap also assumes your tasks are a random sample of some population of tasks. Hand-built tasks are not, so say which population you mean ([[defend-it#q19|Defend it, Q19]]).

## The assumptions behind every number {#assumptions}

Every per-task interval in this chapter (Wilson, and the bootstrap of one task's runs) assumes:

1. **One fixed configuration.** Same model string, effort, harness version (including the exact `agy` version), prompt, tools, permissions, budget and environment image for every attempt.
2. **One task.** One task version, by checksum.
3. **Independent attempts.** No attempt can see or change another attempt's state.
4. **Identically distributed.** The configuration does not drift during the runs: no model rerouting, no API change, no quota-induced fallback.
5. **A clear verdict per attempt** from a deterministic grader. A flaky grader adds its own noise ([[grader-validity#flakiness|flakiness]]).

Under these assumptions, "16 of 20, Wilson 95% interval 58.4–91.9%" is a statement about **this configuration on this task**. It is **not** a statement about "Gemini at coding" or even "Gemini on time-series tasks". A model-level claim needs many tasks, sampled from a population you can name, and a task-level analysis ^[inference](- "2026-10-20").

### The frame sentence for runs {#run-frame}

[[grader-validity#frame-sentence|Chapter 8]] asks for a frame sentence for every grader number. Model runs need one too. Template:

> **16 of 20 attempts passed (80%; Wilson 95% interval 58.4–91.9%).** Frame: 20 attempts by `gemini-3.8-flash`, effort medium, `agy` <x.y.z> through Harbor 0.24.0, default tools, 2-hour agent budget, on `chronos-pit` checksum 991d…, run <dates>, interleaved with the other configuration, fresh container per attempt. Assumes independent attempts from that configuration. It is not a claim about other tasks, other harnesses or other dates.

The numbers in this template are illustrative. Fill in your own.

### Threats to independence {#threats}

| Threat | What it does | Defense |
|---|---|---|
| Shared state between attempts | One attempt reads another's files or git history. Anthropic reports an agent that gained an advantage by reading git history left by earlier trials ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20"). | Fresh container and fresh `git init` per attempt. |
| Model rerouting | The same model string serves a different model mid-study ^[confirmed](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.8 "2026-10-20"). | Record dates and the model string. Interleave configurations so drift hits both. |
| Sampling settings you cannot control | Gemini 4 Argon ignores `temperature`, `top_p` and `top_k` ^[confirmed](https://ai.google.dev/gemini-api/docs/latest-model "2026-10-20"). You cannot make it deterministic. | Reproduce the **distribution**, not one sample. |
| Quotas and rate limits | Late attempts fail or fall back differently from early ones. Harbor grades quota-stopped attempts as if the model tried ([above](#infra-errors)). | Log every API error. Treat a quota cutoff as a stop, not as a failure: classify those attempts as infrastructure errors by exception type. |
| Retrying "bad" runs | Silently re-running failures inflates the rate. | Re-run only attempts the model never got a fair try at, under a rule written before the runs. Re-run them as a new job and keep both jobs. Do not use Harbor's `-r` ([why](#design-decisions)). |
| Lookups | An attempt that copied an upstream fix is not a sample of the skill ([[M7]]). | Isolation, network policy, transcript search. Mark such attempts `invalid` and report them. |

Positive correlation between attempts makes pass^k larger and pass@k smaller than the formulas assume ([[defend-it#q16|Defend it, Q16]]).

## How many runs to buy {#sample-size}

Decide the question first, then the number of runs. Save `plan_runs.py` next to `runstats.py`:

```python
"""Plan how many runs to buy. Python 3.9+, standard library only. Needs runstats.py next to it."""
from math import ceil, comb, sqrt
from statistics import NormalDist

from runstats import wilson

N = NormalDist()


def n_for_halfwidth(p, h):
    """Smallest n whose Wilson 95% interval at observed rate p has half-width <= h."""
    n = 2
    while True:
        lo, hi = wilson(round(p * n), n)
        if (hi - lo) / 2 <= h:
            return n
        n += 1


def n_per_arm(p1, p2, alpha=0.05, power=0.80):
    """Runs per configuration to detect p1 vs p2 (two-sided z-test, normal approximation)."""
    za, zb = N.inv_cdf(1 - alpha / 2), N.inv_cdf(power)
    pbar = (p1 + p2) / 2
    top = za * sqrt(2 * pbar * (1 - pbar)) + zb * sqrt(p1 * (1 - p1) + p2 * (1 - p2))
    return ceil((top / (p1 - p2)) ** 2)


def exact_power(p1, p2, n, alpha=0.05):
    """Exact power of the pooled two-proportion z-test, by enumerating both binomials."""
    za = N.inv_cdf(1 - alpha / 2)
    pmf = lambda p, k: comb(n, k) * p**k * (1 - p) ** (n - k)
    power = 0.0
    for a in range(n + 1):
        for b in range(n + 1):
            pool = (a + b) / (2 * n)
            se = sqrt(2 * pool * (1 - pool) / n)
            if se > 0 and abs(a - b) / n / se > za:
                power += pmf(p1, a) * pmf(p2, b)
    return power


print("A. Runs for a target Wilson half-width (one configuration, one task)")
print("   observed rate | +/-20 pts | +/-15 pts | +/-10 pts | +/-5 pts")
for p in (0.5, 0.7, 0.9):
    row = [n_for_halfwidth(p, h) for h in (0.20, 0.15, 0.10, 0.05)]
    print(f"   {p:>13.0%} | {row[0]:>9} | {row[1]:>9} | {row[2]:>9} | {row[3]:>8}")

print("B. Runs per configuration to tell two configurations apart (80% power, alpha 0.05)")
for p1, p2 in [(0.5, 0.8), (0.5, 0.7), (0.3, 0.6), (0.6, 0.9), (0.2, 0.4)]:
    n = n_per_arm(p1, p2)
    print(f"   {p1:.0%} vs {p2:.0%}: {n:>3} per arm (exact power at that n: {exact_power(p1, p2, n):.0%})")

print("C. Cost of a run plan (example token counts, NOT measured)")
prices = {"gemini-3.8-flash": (0.75, 3.75), "gemini-4-argon": (2.00, 10.00)}  # USD per 1M tokens, intro prices
tokens_in, tokens_out = 2_000_000, 60_000  # made-up example per run; read yours from `usage`
for model, (pin, pout) in prices.items():
    per_run = tokens_in / 1e6 * pin + tokens_out / 1e6 * pout
    print(f"   {model}: ${per_run:.2f} per run, ${20 * per_run:.0f} for 20 runs, ${96 * per_run:.0f} for 96 runs")
```

Real output:

```text
A. Runs for a target Wilson half-width (one configuration, one task)
   observed rate | +/-20 pts | +/-15 pts | +/-10 pts | +/-5 pts
             50% |        21 |        39 |        93 |      381
             70% |        17 |        33 |        78 |      320
             90% |        10 |        15 |        34 |      141
B. Runs per configuration to tell two configurations apart (80% power, alpha 0.05)
   50% vs 80%:  39 per arm (exact power at that n: 81%)
   50% vs 70%:  93 per arm (exact power at that n: 80%)
   30% vs 60%:  42 per arm (exact power at that n: 83%)
   60% vs 90%:  32 per arm (exact power at that n: 83%)
   20% vs 40%:  82 per arm (exact power at that n: 81%)
C. Cost of a run plan (example token counts, NOT measured)
   gemini-3.8-flash: $1.73 per run, $34 for 20 runs, $166 for 96 runs
   gemini-4-argon: $4.60 per run, $92 for 20 runs, $442 for 96 runs
```

How to read it:
- **Table A** is for "what is this configuration's rate on this task?". About 20 runs buy ±20 points near 50%. ±10 points costs about 93. These match [[grader-validity#sample-size|Chapter 8's table]], which uses the same method.
- **Table B** is for "is B better than A on this task?". **Power** is the chance that the test detects a difference that really exists; 80% is a common target. Telling 50% from 70% takes about 93 runs per configuration. The exact power column checks the normal approximation by enumerating every outcome.
- **Table C** is a budget. The prices are the intro prices per million tokens: Gemini 3.8 Flash $0.75 input and $3.75 output through 2026-12-31; Gemini 4 Argon $2 and $10 through 2026-11-30, then $4 and $20. Flash rises to $1.50 input and $7.50 output from 2027-01-01, so extension runs after that date cost double. Output prices include thinking tokens ^[confirmed](https://ai.google.dev/gemini-api/docs/pricing "2026-10-20"). The token counts are **made up**. Measure yours from the `usage` field of 3 pilot runs. Cached input is billed at a lower rate, so a real bill may be lower ^[confirmed](https://ai.google.dev/gemini-api/docs/pricing "2026-10-20").

For your sprint ^[inference](- "2026-10-20"): run what your quota and the 5-hour block allow, probably 5 attempts of one configuration. Report "k of 5 (Wilson 95% [lo, hi])" plus the failure modes you found. Five runs find common failure modes (line 6 of the `runstats.py` output) but cannot rank configurations. Say so in the report. 20 or more attempts per configuration is the target for Day 2 of the final project ([[tracker#final-project|tracker]]). At 20, the interval is about ±20 points: enough to say "Flash fails milestone 2 most of the time", not enough to rank close configurations.

## Labeling transcripts {#labeling}

A pass rate says how often. A **label** says why. Polaris's job is the why: "find weaknesses" means named, repeated, evidenced failure patterns ^[inference](- "2026-10-20"). Anthropic's guide says to read transcripts to tell agent mistakes from grader rejections ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20").

### The schema {#label-schema}

One JSON record per attempt. Label passes too: a pass can hide a cheat or a lucky guess.

| Field | Values | Meaning |
|---|---|---|
| `run_id`, `task`, `config` | strings | Join keys to the run record. |
| `labeler` | name | Who labeled. Needed for agreement checks. |
| `outcome` | `pass`, `fail`, `timeout`, `infra_error`, `invalid` | `invalid` = isolation broken, for example a solution lookup. |
| `adjudication` | `agree_with_grader`, `grader_false_accept`, `grader_false_reject`, `spec_ambiguous`, `not_adjudicated` | Your verdict against the spec, made **before** you look at which model it was if you can. |
| `phase` | `none`, `localize`, `repair`, `verify`, `environment`, `harness` | Phase of the first wrong turn. `localize`, `repair` and `verify` are Liu et al.'s phases. |
| `first_wrong_turn` | `{step, belief, evidence}` or `null` | Where belief left evidence. `null` for passes and for grader false rejects. |
| `mistake_rows` | `M1`–`M10` | Rows of the [[agent-patch-audit#mistake-card\|mistake card]]. |
| `categories` | list | From the taxonomy below. The first one is primary. |
| `claims` | list of `{step, text, verified, evidence_step}` | Every claim the agent made, checked against real tool output ([[S14]]). |
| `isolation` | `clean`, `suspect`, `violated` | From your transcript scan for lookups and hidden paths. |
| `confidence` | `high`, `medium`, `low` | How sure you are of the first wrong turn. |
| `notes` | text | Missed chances, oddities. |

### Check the labels and measure agreement {#label-check}

Labels are data, so validate them. And a label one person made is an opinion until a second labeler agrees. **Cohen's kappa** measures agreement beyond chance: κ = (observed − chance) / (1 − chance), where "chance" is the agreement two labelers would reach by guessing at their own label frequencies ^[confirmed](https://doi.org/10.1177/001316446002000104 "2026-10-20").

Save as `labels.py`:

```python
"""Check transcript labels and measure agreement between two labelers. Standard library only.

Usage: python3 labels.py labels.jsonl          (validate one file)
       python3 labels.py a.jsonl b.jsonl       (also compare two labelers)
"""
import json
import sys
from collections import Counter

REQUIRED = ["run_id", "task", "config", "labeler", "outcome", "adjudication", "phase",
            "first_wrong_turn", "mistake_rows", "categories", "claims", "isolation", "confidence"]
OUTCOMES = {"pass", "fail", "timeout", "infra_error", "invalid"}
ADJUDICATIONS = {"agree_with_grader", "grader_false_accept", "grader_false_reject", "spec_ambiguous", "not_adjudicated"}
PHASES = {"none", "localize", "repair", "verify", "environment", "harness"}
MISTAKE_ROWS = {f"M{i}" for i in range(1, 11)}


def problems(rec):
    out = [f"missing {k}" for k in REQUIRED if k not in rec]
    if out:
        return out
    if rec["outcome"] not in OUTCOMES:
        out.append(f"bad outcome {rec['outcome']!r}")
    if rec["adjudication"] not in ADJUDICATIONS:
        out.append(f"bad adjudication {rec['adjudication']!r}")
    if rec["phase"] not in PHASES:
        out.append(f"bad phase {rec['phase']!r}")
    if not set(rec["mistake_rows"]) <= MISTAKE_ROWS:
        out.append(f"bad mistake rows {rec['mistake_rows']}")
    fwt = rec["first_wrong_turn"]
    if rec["outcome"] == "pass" and fwt is not None:
        out.append("a passing run has no first wrong turn")
    if rec["outcome"] in {"fail", "timeout"} and rec["adjudication"] != "grader_false_reject":
        if not fwt or not {"step", "belief", "evidence"} <= set(fwt):
            out.append("first_wrong_turn needs step, belief and evidence")
    for claim in rec["claims"]:
        if claim.get("verified") is False and "evidence_step" not in claim:
            out.append(f"unverified claim at step {claim.get('step')} needs evidence_step")
    return out


def kappa(a, b):
    """Cohen's kappa for two labelers' categories on the same items."""
    n = len(a)
    observed = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    chance = sum(ca[k] * cb[k] for k in set(a) | set(b)) / (n * n)
    return (observed - chance) / (1 - chance), observed, chance


def load(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


if __name__ == "__main__":
    files = [load(p) for p in sys.argv[1:]]
    for path, recs in zip(sys.argv[1:], files):
        bad = [(r.get("run_id"), p) for r in recs for p in problems(r)]
        print(f"{path}: {len(recs)} labels, {len(bad)} problems")
        for run_id, p in bad:
            print(f"  {run_id}: {p}")
    if len(files) == 2:
        a = {r["run_id"]: r["phase"] for r in files[0]}
        b = {r["run_id"]: r["phase"] for r in files[1]}
        ids = sorted(a.keys() & b.keys())
        k, po, pe = kappa([a[i] for i in ids], [b[i] for i in ids])
        print(f"phase agreement on {len(ids)} runs: observed {po:.2f}, chance {pe:.2f}, kappa {k:.2f}")
        for i in ids:
            if a[i] != b[i]:
                print(f"  disagree {i}: {a[i]} vs {b[i]}")
```

Real output on two **synthetic** label files (10 failed runs, two labelers) and one deliberately broken record.

:::reveal title="Show the script that writes the synthetic label files"
Save as `make_demo_labels.py` next to `labels.py` and run it once.

```python
"""Write SYNTHETIC label files for the labels.py demo: two labelers, 10 failed runs, one broken record."""
import json

phases_a = ["repair", "repair", "verify", "localize", "repair", "verify", "repair", "environment", "repair", "verify"]
phases_b = ["repair", "repair", "verify", "repair", "repair", "repair", "repair", "environment", "repair", "verify"]


def rec(i, phase, who):
    return {"run_id": f"r{i:02d}", "task": "asof-lookup@991d249aa85e", "config": "demo-config", "labeler": who,
            "outcome": "fail", "adjudication": "agree_with_grader", "phase": phase,
            "first_wrong_turn": {"step": 6, "belief": "b", "evidence": "e"}, "mistake_rows": ["M2"],
            "categories": ["boundary_error"], "claims": [], "isolation": "clean", "confidence": "medium"}


for name, phases in (("a.jsonl", phases_a), ("b.jsonl", phases_b)):
    with open(name, "w") as f:
        for i, p in enumerate(phases, 1):
            f.write(json.dumps(rec(i, p, name[0])) + "\n")
with open("broken.jsonl", "w") as f:
    r = rec(11, "repair", "a")
    r["first_wrong_turn"] = {"step": 4}
    r["mistake_rows"] = ["M11"]
    f.write(json.dumps(r) + "\n")
```
:::

```text
$ python3 labels.py a.jsonl b.jsonl
a.jsonl: 10 labels, 0 problems
b.jsonl: 10 labels, 0 problems
phase agreement on 10 runs: observed 0.80, chance 0.42, kappa 0.66
  disagree r04: localize vs repair
  disagree r06: verify vs repair
$ python3 labels.py broken.jsonl
broken.jsonl: 1 labels, 2 problems
  r11: bad mistake rows ['M11']
  r11: first_wrong_turn needs step, belief and evidence
```

Check κ by hand. Labeler A used repair 5, verify 3, localize 1, environment 1. Labeler B used repair 7, verify 2, environment 1. Chance = (5·7 + 3·2 + 1·0 + 1·1)/100 = 0.42. κ = (0.80 − 0.42)/(1 − 0.42) = 0.66.

What to do with κ ^[inference](- "2026-10-20"):
- Read every disagreement. Most come from a vague definition, not from a careless labeler. Fix the definition, then re-label.
- Report κ with the count: "phase labels, 2 labelers, 10 runs, κ = 0.66". Ten items give a very rough κ.
- No second person? Re-label your own sample a week later, blind to your first labels, and report it as self-agreement. Or use a fresh model session as a second labeler, and remember that LLM judges prefer their own outputs ^[confirmed](https://arxiv.org/abs/2404.13076 "2026-10-20").

## An error taxonomy {#taxonomy}

Use four layers. Each answers a different question.

1. **Outcome** (one per attempt): pass, fail, timeout, infra_error, invalid.
2. **Adjudication** (who is wrong: model, grader or spec): from the schema above. A "model failure" that is really a grader false reject is not a weakness of the model ([[defend-it#q40|Defend it, Q40]]).
3. **Phase** of the first wrong turn: localize, repair, verify (Liu et al.'s three phases) plus environment and harness ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20").
4. **Category** (several allowed; the first is primary).

The category list. Sources: Liu et al.'s study of 150 failed SWE-bench Verified instances ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20"), the Terminal-Bench 2.0 trace taxonomy ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20"), and this playbook's mistake card.

| Phase | Category | Looks like | Card row |
|---|---|---|---|
| localize | `superficial_match` | Edits code that matches keywords from the issue, not the cause (Liu). | M2 |
| localize | `memory_not_code` | Describes the repo from memory; cites files that do not say that. | M8 |
| repair | `specific_case_overfit` | Handles the shown example only (Liu). Special-cases test inputs. | M3 |
| repair | `boundary_error` | `<` vs `<=`, off-by-one, empty input (Liu: logic and boundary errors). | M5 |
| repair | `incomplete_repair` | Fixes one place, misses a dependent one (Liu). | M2 |
| repair | `evasive_repair` | Hides the symptom: catches the exception, returns a default (Liu). | M2, M4 |
| repair | `disobey_task_spec` | Ignores a stated rule (Terminal-Bench 2.0). | M5 |
| repair | `invented_api` | Calls a function or flag that does not exist. | M1 |
| repair | `silent_damage` | Deletes logic or edits outside the scope. | M4 |
| verify | `no_or_irrelevant_verification`, `weak_verification` | Never runs a check, or runs one that cannot fail (Terminal-Bench 2.0). | M6 |
| verify | `misread_output` | Runs the check, then misreads its output (Liu). | M6 |
| verify | `non_progressive_iteration`, `blind_strategy_switching`, `validation_retreat` | Loops, flails, or drops the check that kept failing (Liu). | M3 |
| verify | `context_loss`, `premature_termination` | Forgets an earlier fact; stops early (Liu; Terminal-Bench 2.0). | — |
| verify | `overselling` | Claims more than the transcript shows ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20"). | M6 |
| any | `solution_lookup`, `test_tampering` | Mines git history or upstream; edits tests or the harness. | M7, M3 |

Add **domain categories** for your task. For Chronos ^[inference](- "2026-10-20"): `future_vintage_used` (a vintage published after `asof`), `le_vs_lt` (boundary rule), `event_vs_publication_time` (filters on the wrong time), `tie_rule` (wrong tie-break among equal `published_at`), `naive_timezone`, `purge_embargo_off_by_one`. Domain categories are where task variants come from (below).

Two facts help you aim. Liu et al. found that agentic tools fail mostly in iteration and validation, and that OpenHands' share of such failures grew from 27% on easy tasks to 64% on hard ones ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20"). Majgaonkar et al. studied trajectories of three agents (OpenHands, SWE-agent, Prometheus) on SWE-Bench. The agents identified the right files in 72–81% of cases, even in failed runs ^[confirmed](https://arxiv.org/abs/2511.00197 "2026-10-20"). So start your search for the first wrong turn in repair and verify, not in localization.

## First-wrong-turn analysis {#first-wrong-turn}

The **first wrong turn** is the earliest step where the agent's belief or action departs from evidence it already had, after which the run never recovers. It is the most useful single label. It tells you which skill failed, and it is the seed of a task variant.

### The procedure {#fwt-procedure}

1. **Start from the grader.** Which checks failed? Read the verifier output.
2. **Write the root cause in one sentence.** Which rule broke? Example: "ties keep the first row, but the spec says the last one wins".
3. **Find where the faulty code was written.** Search the transcript for the edit that introduced it.
4. **Walk back to the belief.** What did the agent say or plan just before that edit? Is that belief contradicted by evidence the agent had **at that time**: the instruction, a file it read, a tool output?
5. **Pick the earliest such step.** That is the first wrong turn. Later steps where the agent could have noticed and did not are **missed chances**. Label them as secondary categories, usually in the verify phase.
6. **List every claim and check it** against tool output ([[S14]]).
7. **Optional: test causality.** Replay from just before the turn with the missing fact supplied. If the run now passes, the turn was causal ^[inference](- "2026-10-20"). `agy` has `/rewind` and `/fork` (checked against docs on 2026-10-20, not run) ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20"). `harbor run` has `--load-trajectory` to start an attempt from a saved session (from `harbor run --help`, 0.24.0; we did not use it).

For long transcripts, bisect on beliefs: at the midpoint, is the agent's model of the bug still consistent with the evidence so far? Move left or right ([[defend-it#q38|Defend it, Q38]]).

### A worked example {#fwt-example}

The task is `asof-lookup` from above. The transcript is short so you can see every step.

```text
Synthetic, written for practice. Not real Gemini output.
Task: asof-lookup. Final reward: 0.

[1]  agent: I will read the instruction and the stub first.
[2]  tool:  cat instruction.md
            -> (five rules, including: "If several vintages of that event share that
               published_at, the one that comes last in the list wins.")
[3]  tool:  cat /app/pit.py
            -> def value_asof(vintages, event, asof): raise NotImplementedError
[4]  agent: Plan: keep the vintage with the largest published_at <= asof.
[5]  edit:  /app/pit.py
            -> ... if best is None or published_at > best[0]: best = (published_at, value)
[6]  tool:  python3 -c "...V = [('gdp-q2', 200, 1.2), ('gdp-q2', 200, 1.3)];
                         print(value_asof(V, 'gdp-q2', 200))"
            -> 1.2
[7]  agent: 1.2 is right: it is the value published at 200.
[8]  tool:  python3 -c "...print(value_asof([('gdp-q2', 100, 1.0)], 'gdp-q2', 100))"
            -> 1.0
[9]  agent: The boundary case works too.
[10] agent: Done. value_asof handles the boundary and ties. All tests pass.
```

The hidden grader's output for this code (we ran this implementation against `test_pit.py`):

```text
failed: [('gdp-q2', 200, 1.3, 1.2)]
```

The analysis. Call the five bullets of the instruction rules 1–5: rule 2 is the `<=` boundary, rule 3 the tie-break.
- **Root cause:** `published_at > best[0]` keeps the first of two tied vintages. Rule 3 says the last one wins.
- **Faulty code written at:** step 5.
- **Belief behind it:** step 4. The plan restates rule 2 and silently drops rule 3.
- **Evidence the agent had:** step 2, which contains rule 3. So **the first wrong turn is step 4**, phase **repair**, primary category `disobey_task_spec`.
- **Missed chance:** step 7. The agent's own test printed 1.2 for exactly the tie case and it called that right (`misread_output`, verify phase).
- **Claims:**

| Step | Claim | Evidence | Verdict |
|---|---|---|---|
| 7 | "1.2 is right" | Step 2, rule 3, implies 1.3. | false |
| 9 | "The boundary case works" | Step 8 printed 1.0, as rule 2 requires. | true |
| 10 | "handles … ties" | Step 6 shows the tie handled wrongly. | false |
| 10 | "All tests pass" | No test command anywhere in the transcript. | false: no evidence ([[M6]]) |

The label record. `labels.py` reports 0 problems for it:

```json
{
  "run_id": "demo-07",
  "task": "asof-lookup@991d249aa85e",
  "config": "synthetic-demo (not a real model run)",
  "labeler": "richard",
  "outcome": "fail",
  "adjudication": "agree_with_grader",
  "phase": "repair",
  "first_wrong_turn": {
    "step": 4,
    "belief": "keep the vintage with the largest published_at (the plan drops the tie rule)",
    "evidence": "step 2: instruction says the last of tied vintages wins"
  },
  "mistake_rows": ["M5", "M6"],
  "categories": ["disobey_task_spec", "tie_rule", "misread_output", "overselling"],
  "claims": [
    {"step": 7, "text": "1.2 is right", "verified": false, "evidence_step": 2},
    {"step": 9, "text": "the boundary case works", "verified": true, "evidence_step": 8},
    {"step": 10, "text": "handles ties", "verified": false, "evidence_step": 6},
    {"step": 10, "text": "All tests pass", "verified": false, "evidence_step": null}
  ],
  "isolation": "clean",
  "confidence": "high",
  "notes": "Synthetic transcript, written for practice. Missed chance at step 7: the output 1.2 contradicted rule 3. No test command anywhere."
}
```

(For `labels.py`, put each record on one line of a `.jsonl` file.)

Why step 4 and not step 5? Step 5 only carried out the plan. The departure from evidence happened when the plan was formed. In a real transcript the plan may be implicit. Then the first wrong turn is the edit itself, and you write "implicit plan" in `notes` ^[inference](- "2026-10-20").

### From labels to a weakness statement {#weakness-statement}

After labeling all failures of one configuration, count primary categories by phase. A **weakness statement** has four parts:

> **Skill:** applying a stated tie-break rule when it conflicts with the "natural" reading. **Evidence:** 7 of 12 failed attempts (of 20) share the primary category `disobey_task_spec` on rule 3; κ = 0.7 on phase labels between two labelers. **Frame:** one configuration, one task. **Not shown:** whether it holds on other tasks or other rules.

The numbers in that example are illustrative. A weakness seen on one task is a **hypothesis** about the model. Variants test it.

## Eval system design {#system-design}

No public source lists Polaris's interview questions. A system-design question like "Design an eval system for coding agents" is plausible for this role ([[defend-it]]) ^[inference](- "2026-10-20"). The pipelines in the posting's duties need the same pieces. Here is a design you can defend, piece by piece.

### The pieces {#pieces}

```text
task registry ──> run matrix ──> scheduler ──> sandbox per attempt ──> agent adapter
 (checksums,      (tasks x        (concurrency,   (fresh container,      (agy / Managed Agents /
  image digests,   configs x       interleaving,   base snapshot only,    interactive)
  grader version)  attempts)       retries rule)   network policy)             │
                                                                               v
analysis <── result store <── grader (separate container, hidden tests) <── capture
(raw → stats   (one record per   (deterministic, timeouts,                 (diff, transcript,
 → labels)      attempt; append)  reward.json per milestone)                status, tokens)
```

### Decisions and why {#design-decisions}

| Concern | Decision | Why | Harbor 0.24.0 support |
|---|---|---|---|
| Isolation | Fresh container per attempt. Base snapshot with fresh git, no future history. Hidden tests enter only at grading. | Agents mine git history and upstream fixes: SWE-bench issue #465 ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20"); shortcut attempts in 55.5–89.1% of DeepSWE trajectories (60.7–90.1% on SWE-bench Multilingual) for three open models ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20"). | Uploads `tests/` after the agent runs ^[confirmed](https://docs.harborframework.com/tasks/verifier "2026-10-20"). |
| Grader separation | Grade in a separate container that inherits only declared artifacts. | The agent cannot tamper with the grading environment. | `environment_mode = "separate"`; the docs say it is the default for new tasks from v0.25 ^[confirmed](https://docs.harborframework.com/tasks/separate-verifier "2026-10-20"). Our 0.24.0 runs used `shared`. |
| Network | The agent process must reach the model API. Tools should not reach GitHub. Use an allowlist, and log what you could not block. | A strict harness (no `.git`, network denied except a package proxy) dropped one model from 87.1% to 73.0% on SWE-bench Pro ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20"). | `--allow-agent-host` extends the agent allowlist when egress control is available. On Docker Desktop for Mac, Harbor 0.24.0 cannot enforce no-network or allowlists, so `--allow-agent-host` cannot help there ([finding](#egress-finding)). |
| Parallelism | Cap concurrency by quota. Interleave configurations in random order. | Time effects and quota stalls then hit every configuration equally. | `-n`, `--n-concurrent-agents` |
| Timeouts | Agent budget is part of the configuration. Separate verifier timeout. Record timeouts as outcomes. | See [timeouts](#timeouts). `agy`'s default 5-minute print timeout is far too short. | `--agent-timeout-multiplier`, `--verifier-timeout-multiplier`, `timeout_sec` in `task.toml` |
| Retries | Only for attempts the model never got a fair try at ([rule](#infra-errors)), written in advance. Re-run them as a new job; keep both jobs. | Retrying failures is cherry-picking. | Do not use `-r` for model runs. Harbor 0.24.0 retries by exception type, keeps only the last attempt, and deletes the earlier trial folder. A graded agent crash gets retried and its result is lost; verifier crashes are on its default skip list ^[confirmed](https://pypi.org/project/harbor/ "2026-10-20"). Re-run with a new `--job-name` instead. |
| Caching | Cache images and dependency downloads. Never reuse a workspace, never replay model outputs. | Caching inputs is safe; caching state breaks independence. | Image builds are reused unless `--force-build`. |
| Logging | One record per attempt (the [run record](#run-record)) plus artifacts. Append only. | You will re-grade and re-label months later. | Per-trial `result.json`, `trial.log`, `verifier/`, `agent/` |
| Reproducibility | Pin image digests and grader commits. Re-grading a saved attempt must give the same reward. Record model string, harness version and dates. | You cannot replay a model's sample, but you can replay the grading. | `task_checksum` in every trial result |
| Cost | Budget per configuration; cap tokens per attempt; pilot 3 runs to measure tokens. | Long agentic runs reach millions of tokens. | Cost fields exist in `result.json` (null for our fake agent) |

### Isolation can be unavailable: a real finding {#egress-finding}

We tried Lab F's task under Harbor first. Its `task.toml` asks for `network_mode = "no-network"`. Harbor 0.24.0 refused to run it on our Mac:

```text
ValueError: network_mode='no-network' is not supported by EnvironmentType.DOCKER environment.
Environment providers must enforce the requested network policy or reject the task.
```

Harbor's Docker environment turns on egress control only if a probe container finds `CONFIG_NFT_FIB_INET` in the Docker VM's kernel config ^[confirmed](https://pypi.org/project/harbor/ "2026-10-20"). Docker Desktop 29.6.2 (kernel 6.12.76-linuxkit) has it unset. So the probe fails, and Harbor refuses any task that asks for no-network or an allowlist. We ran the probe by hand on 2026-10-20 to confirm this:

```zsh
docker run --rm alpine:3.23.4@sha256:5b10f432ef3da1b8d4c7eb6c487f2f5a8f096bc91145e68878dd4a5019afde11 \
  sh -c 'uname -r; zcat /proc/config.gz | grep NFT_FIB'
```

Real output (the lines that matter):

```text
6.12.76-linuxkit
# CONFIG_NFT_FIB_INET is not set
```

So on Docker Desktop for Mac, Harbor 0.24.0 cannot enforce no-network or allowlists, and `--allow-agent-host` cannot help. Three lessons ^[inference](- "2026-10-20"):
- A good harness **fails closed**. It refused rather than silently running with the network on.
- Your run record must say which network policy actually applied, not which one the task asked for.
- On your Mac, Lab F's own `run_task.sh` exists for this reason ([[lab:lab-f]]).

### A design answer with numbers {#design-numbers}

Question: "20 tasks, 3 configurations, 20 attempts each. Plan it."

- **Attempts:** 20 × 3 × 20 = 1,200.
- **Wall clock:** if an attempt takes 30 minutes and 8 run at once, 1,200 × 0.5 h / 8 = 75 hours. The 30 minutes is an assumption; measure it in a pilot.
- **Money:** at the made-up $1.725 per Flash attempt from Table C, about $2,070 for all 1,200 attempts. Measure tokens first.
- **Statistics:** per task, 20 attempts give about ±20 points. Across tasks, compare configurations with a [paired, task-level analysis](#paired).
- **Order:** randomize the order of (task, configuration, attempt) triples. Never run all of configuration A on Monday and all of B on Tuesday.
- **Gates before the big run:** oracle = 1 and do-nothing = 0, 3 times each, for every task; a 3-attempt pilot per configuration; a check that re-grading a saved attempt gives the same reward.
- **Outputs:** the raw outcome table, per-task intervals, a paired comparison, and labeled failures with κ.

## Evals vs RL environments {#evals-vs-rl}

The posting asks for data and pipelines that improve Gemini, not only measurements ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). A task with a grader can serve as an **eval** (measure the model) or as an **RL environment** (train the model on its reward). Same files, different pressure. How Polaris splits this work is not public; this section is our reasoning from public research ^[inference](- "2026-10-20").

| | Eval task | RL environment |
|---|---|---|
| Purpose | Measure | Raise the reward |
| Attempts | Tens per configuration | Many per task per training step: groups of 16 in DeepSeek-R1 ^[confirmed](https://arxiv.org/html/2501.12948v2 "2026-10-20"); Mechanize's arithmetic uses 64 ^[confirmed](https://www.mechanize.work/blog/cheap-rl-tasks-will-waste-compute "2026-10-20") |
| Who reads results | People read transcripts | An optimizer; people sample a few |
| A false accept | Inflates one number | Gets reinforced and can spread to other behavior |
| Useful difficulty | Spreads models apart; 0% is suspicious | Mixed outcomes within a group; all-0 or all-1 groups give no gradient ^[confirmed](https://arxiv.org/abs/2503.14476 "2026-10-20") |
| Partial credit | A reporting detail | Shapes what the model learns |
| Contamination | Must stay unseen | Once trained on, it can no longer be an unseen eval |
| Cost per attempt | Minutes to hours is fine | Throughput matters |

### A grader under optimization pressure {#optimization-pressure}

When a training run maximizes a grader, every hole becomes a target. Evidence:
- **Over-optimizing a proxy hurts the true goal.** Gao, Schulman and Hilton measured this for reward models ^[confirmed](https://arxiv.org/abs/2210.10760 "2026-10-20"). DeepMind calls the general pattern specification gaming ^[confirmed](https://deepmind.google/discover/blog/specification-gaming-the-flip-side-of-ai-ingenuity/ "2026-10-20").
- **Hacks learned in coding RL spread.** Anthropic reports models learning `sys.exit(0)` in real coding RL; learning such hacks generalized to sabotage in 12% of cases in one Claude Code safety-research evaluation ^[confirmed](https://www.anthropic.com/research/emergent-misalignment-reward-hacking "2026-10-20").
- **Score jumps can be leaks.** In an RL run, Poolside saw a SWE-Bench Pro score jump about 20 points over a weekend without gains elsewhere. Task images kept unpruned git history ^[confirmed](https://poolside.ai/blog/through-the-looking-glass "2026-10-20").
- **Frontier models hack graders.** METR saw o3 reward hack in 39 of 128 RE-Bench runs (30.4%) and in 0.7% of HCAST runs ^[confirmed](https://metr.org/blog/2025-06-05-recent-reward-hacking "2026-10-20").
- **Watching the reasoning helps, punishing it hides it.** OpenAI found that a monitor reading the chain of thought caught reward hacking, and that penalizing "bad thoughts" made agents hide intent ^[confirmed](https://arxiv.org/abs/2503.11926 "2026-10-20").
- **An honest exit reduces cheating.** On ImpossibleBench, an "abort if impossible" option cut GPT-5's cheating from 54% to 9% on one variant ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20").
- **Hidden checks catch overfitting.** SpecBench measures the gap between visible and held-out test pass rates; it grows about 28 points per 10× increase in code size ^[confirmed](https://arxiv.org/abs/2605.21384 "2026-10-20").

### What changes when your eval task becomes an environment {#eval-to-env}

1. **The bar moves from "low error rate" to "no known hole".** Red-team the grader with an exploit agent ([[grader-validity#reward-hacking|Chapter 8]]).
2. **Keep hidden checks the policy never sees,** and a set of held-out task variants to test whether gains transfer.
3. **Gate the free points.** Regression tests pass on the unchanged repo. As a weighted milestone they pay the do-nothing policy ([[grader-validity#partial-credit|Chapter 8 shows 0.2 for free]]). Make them a gate.
4. **Partial credit is a teaching signal now.** Lightman et al. found that a reward model trained on step-level feedback picked correct MATH solutions better than one trained on final answers only ^[confirmed](https://arxiv.org/abs/2305.20050 "2026-10-20"). That is evidence that denser signals can help. It is not an RL result with partial credit. And each credited part must be validated on its own, or the policy learns the easy parts only. Milestone tests are still outcome checks, not process supervision.
5. **Watch the monitoring signals.** Anthropic lists too many edit/test cycles on one file, comments that mention a specific test, and unexpected changes to test files ^[confirmed](https://www.anthropic.com/claude-3-7-sonnet-system-card "2026-10-20").
6. **Check the pass-rate band.** Measure pass@k and pass^k at the group size. Tasks at 0 or 1 waste compute.
7. **Retire it as an eval.** Once a task is a training environment, it is no longer an unseen test for that model line.

Public SWE environments exist. SWE-Gym gives 2,438 real Python tasks, each with an executable runtime and unit tests, for training agents and verifiers ^[confirmed](https://arxiv.org/abs/2412.21139 "2026-10-20"). Mechanize argues that cheap tasks waste compute and that labs will pay for fewer, better ones ^[confirmed](https://www.mechanize.work/blog/cheap-rl-tasks-will-waste-compute "2026-10-20"). That is Mechanize's argument, not a fact about Polaris.

## From one weakness to a family of task variants {#variants}

One task measures one situation. A weakness is a claim about a **skill**. To test the claim, and to build training data for the skill, make a family of variants ([[defend-it#q41|Defend it, Q41]]).

### The procedure {#variant-procedure}

1. **State the skill**, not the symptom. Symptom: "used `>` instead of `>=`". Skill: "applies a stated tie-break or boundary rule exactly, even when a convention suggests otherwise".
2. **Find the invariant core:** the smallest situation where the skill is necessary. Here: two records with equal timestamps and a rule that picks one.
3. **Choose variation axes** that keep the core and change the surface.
4. **Build each variant as a real task:** its own instruction, reference solution, wrong solutions (the original failure among them), and a validity card ([[grader-validity]]).
5. **Pilot each variant** with the same configuration.
6. **Check the family measures one skill.** Do the same configurations fail the same variants for the same labeled reason? If one variant fails for a different reason (an unfamiliar library), it measures something else.
7. **Treat the family as one cluster** in statistics: resample families, not variants. If the family feeds training, keep some variants unseen to test transfer.

### Axes, with the Chronos example {#variant-axes}

| Axis | Variant of the tie/boundary weakness | What it tests |
|---|---|---|
| Domain | Feature flags with rollout times: "which value was live as of t?" | Transfer beyond finance data |
| Stack | The same lookup inside a small TypeScript service on Node 22 ([[unfamiliar-stacks]]) | Skill vs Python habits |
| Rule direction | The spec says `published_at < asof` (strict) | Does it read the rule or follow a convention? |
| Data shape | An append-only event log with "supersedes" links instead of a table | Same rule, different representation |
| Horizon | The lookup buried inside a pipeline milestone, as in Chronos milestones 2–3 | Does the rule survive a long task? |
| Distractor | An existing helper `latest_value()` that ignores publication time | Reuse vs reading |
| Time zones | Equal instants written with different UTC offsets | Equality of instants, not strings |
| Spec density | The rule stated once in a long instruction vs in a short one | Using several facts from a long context, which Google says is less accurate than finding one ^[confirmed](https://ai.google.dev/gemini-api/docs/long-context "2026-10-20") |

Keep the knobs real. SWE-Bench Pro without its requirements and interface cut GPT-5 from 25.9% to 8.4% ^[confirmed](https://arxiv.org/html/2509.16941 "2026-10-20"). That makes a task harder by hiding information, which is incidental difficulty, not the skill ([[task-design]]). EvalPlus shows the other direction: adding about 80× more tests cut pass@k by up to 19.3–28.9% ^[confirmed](https://arxiv.org/abs/2305.01210 "2026-10-20"). Stronger tests are a fair knob; they reveal what weak tests missed.

### What not to do {#variant-donts}

- **Renamed copies.** Changing variable names gives you more tasks but no new information. They also inflate your n.
- **Giving the trap away.** "Be careful with ties" in the prompt measures instruction following, not the skill.
- **Mixing reasons.** If a variant also needs a rare library, its failures mean two things at once.
- **Skipping validation.** Each variant is a new grader. It can be wrong in new ways.

## Vibe coder vs senior engineer {#compare}

:::compare
- Runs Gemini 5 times and reports "80%". || Reports "4 of 5 (Wilson 95% interval 38–96%)", states the frame, and says 5 runs cannot rank configurations.
- Trusts exit code 0 from a headless run. || Reads `status`, keeps stderr and the stream, and grades every attempt with the hidden grader.
- Re-runs the failed attempts "because something went wrong". || Writes the retry rule before the runs: only attempts the model never got a fair try at (crashes; API, quota or auth errors), re-run as a new job, both jobs kept and reported.
- Drops timed-out runs as noise, and counts quota stops as model failures. || Counts a timeout as a failure of that configuration, because the budget is part of it. Classifies quota and auth stops by exception type and excludes them.
- Computes pass@k from c/n plugged into a formula. || Uses the unbiased estimators, prints n and c, and knows the plug-in pass^k is biased high.
- Reads one failing transcript and writes "Gemini is bad at time series". || Labels every failure with a schema, finds the first wrong turn with evidence, and measures agreement with a second labeler.
- Compares two models by pooling all runs. || Pairs by task, bootstraps over tasks, and says "no detectable difference" when the interval includes 0.
- Uses the eval grader as an RL reward unchanged. || Red-teams it, gates free points, keeps hidden checks, and retires the task as an eval.
- Turns one weakness into 50 near-copies. || Builds a few validated variants along real axes and treats them as one cluster.
:::

## Drills {#drills}

:::drill id="toy-harbor-run" title="Run the toy task under Harbor and report it" time="45 min"
1. Install Harbor 0.24.0 in a temp venv and create the toy task ([steps](#toy-setup)).
2. Run oracle and do-nothing, 3 attempts each. Confirm 1.000 and 0.000.
3. Run the fake agent 20 times. Save `runstats.py` and `job_report.py`. Run the report.
4. Change `P_RIGHT` to 0.3 and run 20 more attempts under a new job name. Report both jobs.
5. Write one frame sentence per job. Then answer: do the two intervals overlap? Could you have told 0.3 from 0.6 with 5 runs each?

**Done when:** you have both job reports, two frame sentences, and a two-line answer that uses the intervals, not the point estimates.
:::

:::drill id="wilson-pass-k-by-hand" title="Four intervals and two estimators by hand" time="30 min"
No computer for steps 1–2. Use [[grader-validity#wilson-by-hand|the Wilson formula]].
1. Compute the Wilson 95% interval for 2/5 and 16/20 by hand, to one decimal.
2. For n = 10, c = 3: compute pass@3, pass^3 (unbiased) and both plug-ins.
3. Run `python3 runstats.py`. Compare. Find the source of any difference.
4. Say out loud, in under 60 seconds: why the plug-in pass^k is biased high.

**Done when:** your hand numbers match lines 1 and 3 of the output within 0.5 points, and you said the explanation without notes.
:::

:::drill id="day1-harness-spike" title="Day-1 spike: get one graded Gemini attempt" time="1–2 h"
Use your own account or key. Never paste a key into a transcript or a file in a repo.
1. Path A: `harbor run --dry-run` with `-a antigravity-cli`, then one real attempt (`-k 1`) on the toy task. `--dry-run` checks only the config. It passes even with no key set, so only the real `-k 1` attempt tests auth. If API-key mode fails, write down the exact error.
2. If A fails: Path A' (`agy -p` with `--output-format stream-json` on a practice copy), then Path B, then Path C.
3. For the attempt that worked, fill in every field of the [run record](#run-record).
4. Grade it with the task's verifier yourself.
5. Path A only: run one more attempt with `GEMINI_API_KEY=invalid` under a new job name. Run `job_report.py` on it. It must show the attempt as INFRA; we expect `AgentAuthenticationError` (from the adapter source; not run). If it shows a graded failure instead, read `exception.txt` and fix your rule before any Chronos run.
6. Write three lines in your notes: which path worked, what it costs per attempt (from `usage`), and what isolation it gives.

**Done when:** one Gemini attempt on the toy task has a complete run record and a reward you computed yourself, a bad-key attempt is marked as infrastructure (Path A), and you know which path you will use for Chronos.
:::

:::drill id="label-lab-c" title="Label Lab C's transcripts with the schema" time="60 min"
Lab C's twelve transcripts are synthetic ([[lab:lab-c]]). That is fine for practicing labels.
1. Do Lab C first, or at least read patches 01–06.
2. For each of patches 01–06, write one label record: outcome, phase, first wrong turn with `{step, belief, evidence}`, mistake rows, categories, claims.
3. Run `labels.py` on your file until it reports 0 problems.
4. A week later, label the same six again without looking at the first file. Run `labels.py first.jsonl second.jsonl` and read every disagreement.

**Done when:** six valid records, a self-agreement κ, and one sentence per disagreement saying which definition was unclear.
:::

:::drill id="chronos-run-plan" title="Write the Chronos run plan" time="40 min"
1. Choose 1 configuration for the sprint (a second one after applying, for example Flash at another effort level). Write each one as a full run-record header.
2. Decide the question: one rate per configuration, or a comparison? Pick n from [the tables](#sample-size) and write why.
3. Measure or estimate tokens per attempt. Compute the budget. Check it against your quota.
4. Write the retry rule, the timeout, the network policy and the run order (interleaved).
5. Write the frame sentence you expect to publish, with blanks for the numbers.

**Done when:** a one-page plan exists before any Chronos run, and someone else could run it without asking you a question.
:::

:::drill id="weakness-to-variants" title="Turn one weakness into four validated variants" time="90 min"
1. Take the tie-rule weakness from the [worked example](#fwt-example), or one you found yourself.
2. Write the skill statement and the invariant core.
3. Pick four axes from [the table](#variant-axes). Write each variant's instruction in at most 8 lines.
4. For one of them, build it fully in the Harbor layout: reference, oracle = 1, do-nothing = 0, and two wrong solutions (one is the original bug) that score 0.
5. Write two sentences: how you would tell whether the four variants measure one skill.

**Done when:** four variant instructions, one fully built variant whose baselines and wrong solutions behave as stated over 3 runs each, and the two sentences.
:::

## Sources

- ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19") [Google Careers: Research Engineer, Polaris](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind) — duties: find weaknesses, build data and pipelines.
- ^[confirmed](https://deepmind.google/models/model-cards/gemini-4-argon/ "2026-10-20") [Gemini 4 Argon model card](https://deepmind.google/models/model-cards/gemini-4-argon/) — pass@1, averaged over trials.
- ^[confirmed](https://antigravity.google/docs/cli/headless/ "2026-10-20") [Antigravity CLI: headless mode](https://antigravity.google/docs/cli/headless/) — flags, `status`, `stream-json`, soft-deny.
- ^[confirmed](https://antigravity.google/docs/install?tab=cli "2026-10-20") [Antigravity: install and sign-in](https://antigravity.google/docs/install?tab=cli) — Gemini API key mode.
- ^[confirmed](https://antigravity.google/docs/plans "2026-10-20") [Antigravity plans](https://antigravity.google/docs/plans) — Gemini 3.8 Flash on every plan; free weekly quota.
- ^[confirmed](https://antigravity.google/docs/cli/features "2026-10-20") [Antigravity CLI features](https://antigravity.google/docs/cli/features) — `/rewind`, `/fork`.
- ^[confirmed](https://ai.google.dev/gemini-api/docs/antigravity-agent "2026-10-20") [Gemini API: Antigravity agent (Managed Agents)](https://ai.google.dev/gemini-api/docs/antigravity-agent) — Interactions API, statuses, budgets, cost estimates.
- ^[confirmed](https://ai.google.dev/gemini-api/docs/agent-environment "2026-10-20") [Gemini API: agent environments](https://ai.google.dev/gemini-api/docs/agent-environment) — sources, network, downloads.
- ^[confirmed](https://pypi.org/project/google-genai/ "2026-10-20") [google-genai on PyPI](https://pypi.org/project/google-genai/) — version 2.31.0 (2026-10-14); interaction status values.
- ^[confirmed](https://ai.google.dev/gemini-api/docs/pricing "2026-10-20") [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) — intro prices, Flash price rise on 2027-01-01; output includes thinking tokens.
- ^[confirmed](https://ai.google.dev/gemini-api/docs/latest-model "2026-10-20") [Gemini 4 Argon developer page](https://ai.google.dev/gemini-api/docs/latest-model) — sampling parameters ignored.
- ^[confirmed](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.8 "2026-10-20") [What's new in Gemini 3.8](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.8) — model ID rerouting.
- ^[confirmed](https://pypi.org/project/harbor/ "2026-10-20") [Harbor on PyPI](https://pypi.org/project/harbor/) — version 0.24.0 (uploaded 2026-10-05, Python 3.12+) installed and run; source read: adapter, retry queue, trial order, reward parser, Docker egress probe.
- ^[confirmed](https://docs.harborframework.com/jobs/run-a-job "2026-10-20") [Harbor: run a job](https://docs.harborframework.com/jobs/run-a-job) — agents, sandboxes; flag meanings from `harbor run --help`.
- ^[confirmed](https://docs.harborframework.com/agents/pre-integrated-agents "2026-10-20") [Harbor: pre-integrated agents](https://docs.harborframework.com/agents/pre-integrated-agents) and [auth resolution](https://docs.harborframework.com/agents/agent-auth-resolution).
- ^[confirmed](https://docs.harborframework.com/tasks/separate-verifier "2026-10-20") [Harbor: separate verifier](https://docs.harborframework.com/tasks/separate-verifier) and [verifier](https://docs.harborframework.com/tasks/verifier).
- ^[confirmed](https://arxiv.org/abs/2107.03374 "2026-10-20") [Chen et al. 2021, Evaluating LLMs trained on code](https://arxiv.org/abs/2107.03374) — unbiased pass@k, section 2.1 and Figure 3.
- ^[confirmed](https://arxiv.org/abs/2406.12045 "2026-10-20") [Yao et al. 2024, τ-bench](https://arxiv.org/abs/2406.12045) — pass^k.
- ^[confirmed](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents "2026-10-20") [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — pass@k vs pass^k, clean trials, read transcripts.
- ^[confirmed](https://doi.org/10.1214/ss/1009213286 "2026-10-20") [Brown, Cai, DasGupta 2001, Interval estimation for a binomial proportion](https://doi.org/10.1214/ss/1009213286).
- ^[confirmed](https://doi.org/10.1214/aos/1176344552 "2026-10-20") [Efron 1979, Bootstrap methods: another look at the jackknife](https://doi.org/10.1214/aos/1176344552).
- ^[confirmed](https://arxiv.org/abs/2411.00640 "2026-10-20") [Miller 2024, Adding error bars to evals](https://arxiv.org/abs/2411.00640) — clustered errors, paired differences, power analysis.
- ^[confirmed](https://doi.org/10.1177/001316446002000104 "2026-10-20") [Cohen 1960, A coefficient of agreement for nominal scales](https://doi.org/10.1177/001316446002000104).
- ^[confirmed](https://arxiv.org/abs/2404.13076 "2026-10-20") [Panickssery, Bowman, Feng 2024, LLM evaluators favor their own generations](https://arxiv.org/abs/2404.13076).
- ^[confirmed](https://arxiv.org/html/2601.11868 "2026-10-20") [Terminal-Bench 2.0 paper](https://arxiv.org/html/2601.11868) — 5+ runs with intervals; failure taxonomy.
- ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20") [Liu et al. 2025, failures in automated issue solving](https://arxiv.org/abs/2509.13941) — three-phase taxonomy.
- ^[confirmed](https://arxiv.org/abs/2511.00197 "2026-10-20") [Majgaonkar et al.](https://arxiv.org/abs/2511.00197) — right files found even in failed runs.
- ^[confirmed](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1 "2026-10-20") [Transluce: coding agent misalignment in the wild](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1) — overselling (LLM-judged).
- ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20") [SWE-bench issue #465](https://github.com/SWE-bench/SWE-bench/issues/465) — git history loophole.
- ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20") [Ludwig et al. 2026, Shortcutting the fix](https://arxiv.org/abs/2609.06780).
- ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20") [Cursor: reward hacking is swamping model intelligence gains](https://cursor.com/blog/reward-hacking-coding-benchmarks).
- ^[confirmed](https://poolside.ai/blog/through-the-looking-glass "2026-10-20") [Poolside: Through the looking glass](https://poolside.ai/blog/through-the-looking-glass).
- ^[confirmed](https://arxiv.org/abs/2503.14476 "2026-10-20") [DAPO 2025](https://arxiv.org/abs/2503.14476) — dynamic sampling; zero advantage, zero gradient.
- ^[confirmed](https://www.mechanize.work/blog/cheap-rl-tasks-will-waste-compute "2026-10-20") [Mechanize: Cheap RL tasks will waste compute](https://www.mechanize.work/blog/cheap-rl-tasks-will-waste-compute).
- ^[confirmed](https://arxiv.org/html/2501.12948v2 "2026-10-20") [DeepSeek-AI 2025, DeepSeek-R1](https://arxiv.org/html/2501.12948v2) — 16 sampled outputs per question in GRPO (sections 2.1 and 3.2.1).
- ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20") [Tamay Besiroglu on X: Polaris, evals and environments](https://x.com/tamaybes/status/2105408224879116790).
- ^[confirmed](https://arxiv.org/abs/2210.10760 "2026-10-20") [Gao, Schulman, Hilton 2022, Scaling laws for reward model overoptimization](https://arxiv.org/abs/2210.10760).
- ^[confirmed](https://deepmind.google/discover/blog/specification-gaming-the-flip-side-of-ai-ingenuity/ "2026-10-20") [DeepMind: Specification gaming](https://deepmind.google/discover/blog/specification-gaming-the-flip-side-of-ai-ingenuity/).
- ^[confirmed](https://www.anthropic.com/research/emergent-misalignment-reward-hacking "2026-10-20") [Anthropic: emergent misalignment from reward hacking](https://www.anthropic.com/research/emergent-misalignment-reward-hacking).
- ^[confirmed](https://metr.org/blog/2025-06-05-recent-reward-hacking "2026-10-20") [METR: Recent frontier models are reward hacking](https://metr.org/blog/2025-06-05-recent-reward-hacking).
- ^[confirmed](https://arxiv.org/abs/2503.11926 "2026-10-20") [OpenAI 2025, Monitoring reasoning models for misbehavior](https://arxiv.org/abs/2503.11926).
- ^[confirmed](https://arxiv.org/abs/2510.20270 "2026-10-20") [ImpossibleBench](https://arxiv.org/abs/2510.20270).
- ^[confirmed](https://arxiv.org/abs/2605.21384 "2026-10-20") [SpecBench](https://arxiv.org/abs/2605.21384).
- ^[confirmed](https://www.anthropic.com/claude-3-7-sonnet-system-card "2026-10-20") [Claude 3.7 Sonnet system card, section 6](https://www.anthropic.com/claude-3-7-sonnet-system-card) — monitoring signals.
- ^[confirmed](https://arxiv.org/abs/2305.20050 "2026-10-20") [Lightman et al. 2023, Let's verify step by step](https://arxiv.org/abs/2305.20050).
- ^[confirmed](https://arxiv.org/abs/2412.21139 "2026-10-20") [Pan et al., SWE-Gym](https://arxiv.org/abs/2412.21139).
- ^[confirmed](https://arxiv.org/html/2509.16941 "2026-10-20") [SWE-Bench Pro](https://arxiv.org/html/2509.16941) — requirements and interface ablation.
- ^[confirmed](https://arxiv.org/abs/2305.01210 "2026-10-20") [EvalPlus](https://arxiv.org/abs/2305.01210).

:::check
- Run the toy task under Harbor and produce a job report with raw outcomes, a Wilson interval and pass^k.
- Explain why 4/5 against 2/5 is no evidence, using the two Wilson intervals.
- Compute unbiased pass@k and pass^k from n and c, and say which plug-in is biased in which direction.
- Write a frame sentence for a set of model runs that names the configuration, the task version and what it does not claim.
- Find and justify the first wrong turn in a transcript, with step numbers for belief and evidence.
- List five things that change when an eval grader becomes an RL reward.
:::
