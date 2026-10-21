# Polaris Playbook — master plan (v3, 2026-10-20)

This file is the source of truth for every agent that builds this playbook. It is not deployed.
Read it fully before you write anything. Then read `STYLE.md` (markup and writing rules).

PRIORITY ORDER (from the user, final): **1. a validated, reproducible Chronos task** → 2. core chapters
(0, 2, 7, 8, 9, 12, 13, 14) → 3. other chapters → 4. labs → 5. visual polish.

## 0. Who this is for and what it must achieve

- Reader: Richard Zhu. Strong "vibe coder". Knows Python and C++ best. Not a native English speaker.
  Assume he starts from zero. Every chapter opens with a self-check so he can skip what he knows.
- Target: **Research Engineer, Polaris, Google DeepMind** (Google Careers job 114077679900074694, Mountain View).
  Official posting: https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind
- The playbook is **Polaris-only**. Do not drift into generic interview prep.
- Optimization target (put this on the home page): the playbook exists to produce **credible evidence** that he can
  do Polaris work. Three signals matter most:
  1. **One hard, well-validated software-engineering eval task** (the Chronos capstone).
  2. **A defensible record of diagnosing real coding-agent failures** (Agent Patch Audit + mistake log).
  3. **Strong unaided interview performance** (no-AI coding, defending decisions).
  Finishing chapters or polishing the website is not the goal.

## 1. What the job is (paraphrase only — never copy the posting)

- Polaris engineers design tasks that test how well Gemini does software engineering work.
- A task = a **prompt** that tells Gemini what to do + a **grader or rubric** that gives the attempt a number.
- The team hand-builds a small number of realistic, complex tasks instead of mass synthetic tasks.
  One good task takes about one week from idea to approval.
- Duties: create tasks that measure Gemini on **long-horizon** software engineering; find weaknesses of the
  latest models; build data and pipelines that improve Gemini.
- Minimum: experience using AI coding agents; strong analytical and problem-solving skills.
- Preferred: competitive programming or math olympiads (IMO, USAMO, Putnam, IOI).
- No degree and no prior work experience required. Pay on the posting (checked 2026-10-19): base $164k–$252k,
  total comp $550k–$1.1M. Some aggregators show a different base range; tell the reader to recheck.
- At most ONE quoted phrase from the posting per page, under 15 words, in quotes, with the link.

## 2. Facts that shape the prep (with status)

Status words: **confirmed** (primary source read), **reported** (secondary source), **inference** (our reasoning).
The full research dump is `research/research-2026-10-20.json` (about 100 findings with URLs and dates), and the
plan critique is `research/plan-critique-2026-10-20.json`. Use them. Do not invent facts. If you need a fact that is
not there, verify it yourself with WebSearch/WebFetch and cite it, or mark it `inference`.

Key facts (the main agent verified 1–3 against primary sources on 2026-10-20):
1. **confirmed** — Google DeepMind's candidate guide: you may use AI to prepare, but unless told otherwise, do not
   use AI tools in live interviews or interview tasks. Stages: Initial → Skills → Final → Decision and offer.
   4–10 weeks. STAR method. Referrals only from people who can vouch for your work.
   https://storage.googleapis.com/deepmind-media/DeepMind.com/Assets/Docs/interviewing-at-google-deepmind.pdf
2. **confirmed** — Gemini CLI was replaced by Antigravity CLI for Google AI Pro/Ultra and free Code Assist users on
   2026-06-18 (announced 2026-05-19). Paid API keys and Code Assist Standard/Enterprise keep Gemini CLI.
   https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
   The Antigravity CLI command is `agy` per its docs (https://antigravity.google/docs/cli/features). Commands like
   `/codesearch`, `/context`, `/rewind`, `/diff`, `/fork`, plan mode come from docs and were **not run** by us.
   Always say "checked against docs on 2026-10-20, not run" for `agy` commands.
3. **confirmed** — Mechanize's public interview (Mechanize's, not Polaris's): 30-min call; 4-hour take-home (3-hour
   build with AI tools strongly encouraged + recorded 1-hour code review incl. system design); 1-hour final.
   Traits: progress in unfamiliar codebases, using agents well, knowing when to intervene, explaining what changed and
   why, spotting brittle/incomplete/accidentally-working solutions, debugging what agents can't, tradeoffs, reasoning
   about task difficulty, system design. https://www.mechanize.work/how-our-interview-process-works
4. **reported** — Google made a talent/technology deal with Mechanize in Sept 2026 (Business Insider). Tamay
   Besiroglu (Mechanize co-founder, now at GDM) posted on X recruiting for Polaris "evals and environments".
   This does NOT mean Polaris interviews copy Mechanize's.
5. **reported** — Google pilots an AI-assisted "code comprehension" round: read, debug and optimize existing code with
   Gemini; scored on AI fluency incl. prompting, output validation, debugging. Junior/mid roles, select US teams,
   H2 2026. No source names DeepMind. The popular "60 min: fix bug → implement feature → optimize" format is **Meta's**
   documented AI-enabled round (reported). We use it only as a practice format and label it as Meta's.
6. **confirmed (Google docs, recheck before use)** — Gemini 3.8 Flash is the default model for Antigravity, on every
   plan incl. free (weekly quota on free). Gemini 4 Argon became GA 2026-10-13 (paid).
7. **confirmed** — DeepSWE (Datacurve, 2026-05-26): 113 hand-written tasks over 91 repos: TypeScript 35, Go 34,
   Python 34, JavaScript 5, Rust 5. Closest public analogue to Polaris tasks.
8. **confirmed** — Harbor task layout (Terminal-Bench team): `instruction.md`, `task.toml`, `environment/`
   (Dockerfile), `solution/solve.sh`, `tests/test.sh`; verifier writes a reward to `/logs/verifier/reward.txt`.
   Polaris's internal format is unknown (inference: Harbor is a good public stand-in).
9. Agent failure evidence (see research): shortcut attempts (upstream lookup, git-history mining, memorized code) in
   55–91% of trajectories for three open models in one 2026 study (Ludwig et al., arXiv 2609.06780); "overselling"
   (claiming success without evidence) in 34.7% of 4,788 sessions (1.8% severe) of one public dataset (Transluce,
   LLM-judged — always say this caveat; corrected from 32.9% after review on 2026-10-20); plausible-but-wrong patches that pass tests (PatchDiff and related work).
10. "Tests pass" is **evidence, not proof**. A finite test suite never proves the spec is met.

## 3. Structure: two pillars, one loop

- **Catch** (the main skill): analyze a repo, find the bug, catch the agent's own mistakes → Ch 2–6.
- **Build** (the main deliverable): turn what you catch into Polaris-style tasks with graders that cannot be fooled → Ch 7–9, 13.
- They feed each other: each agent mistake you catch is a task idea; each task you build is a place to catch mistakes.

### 3.1 The 5-move core loop (default for every change)
1. **Understand** — baseline yourself, map with tools, then let the agent map, then check its claims.
2. **Reproduce** — a failing test that fails for the right reason, before any fix.
3. **Hypothesize** — your own guess first, then the agent's; settle disagreements with a deterministic tool.
4. **Change or review** — small diffs, guardrails, read the diff not the summary.
5. **Challenge** — re-run everything yourself and attack the fix (edge cases, property tests, revert-the-fix check).

### 3.2 The full Agent Patch Audit (hard, risky or suspicious patches) — S0–S15
Roles: **[Y]** you, **[D]** deterministic tool (git, rg, pytest, compiler, debugger), **[A]** agent.
Rule: an [A] claim is a guess until a [D] result confirms it. A [D] pass is evidence, not proof.
Entry points: Drive mode (S0–S15). Review mode for someone else's diff + transcript (S0, S1, S2–S4, S6, S10–S15).

| Phase | Step | Content |
|---|---|---|
| Safe start | S0 Isolate | Practice copy with fresh git (no parent history) in a temp dir; branch/worktree; agent in review-every-edit mode; sandbox; network off when possible; canary-file boundary test; `audit.md` with base SHA, tool version, model. |
| | S1 Baseline | `set -o pipefail; pytest -rA 2>&1 \| tee baseline.txt; echo "exit=$?"`; run twice (flaky?); record Python version + `pip freeze`; `shasum` of tests, conftest, CI config. Gate 1: no baseline, no agent. |
| Map | S2 Tool map | 15 min: `git ls-files` + lines per folder; entry points (pyproject, CMakeLists, package.json); `pytest --collect-only -q`; coverage of ONE test = dynamic map of what really runs; import graph; `git log --stat` churn hotspots; `git blame` on the bug area. Output: 5-line map + first hypothesis. |
| | S3 Agent map | Plan/read-only mode; "No changes. file:line for every claim. Say 'unsure' when unsure." Big repo: one read-only subagent per folder, then merge. Output `repo-map.md`. |
| | S4 Check map | Risk-based: claims on the bug's path first, at least 5. Gate 2: 2+ wrong → map that area by hand. |
| | S5 Rule file | Write AGENTS.md / GEMINI.md by hand: real commands, "don't edit tests", "if spec and tests conflict, stop and ask". Confirm it loaded. |
| Find | S6 Reproduce | Failing test from the issue before any fix; it fails for the right reason. |
| | S7 Locate | Your guess first, then the agent's. Settle with pdb/lldb, `git blame`, `git bisect run`. Gate 3: explain the bug in 2 sentences. |
| Change | S8 Plan + guardrails | "General fix, no special cases." Compare agent plan with the checked map. No files outside scope. |
| | S9 Small edits | edit → diff → full suite. After 2 failed corrections, rewind and re-prompt (rule from Anthropic's Claude Code best practices). Long tasks: `spec.md` + `plan.md` in repo; audit each milestone (`git log -p`, full suite, spec drift, re-introduced bugs). |
| Prove | S10 Read the diff | `git diff --stat BASE`; open every file; `redflags.sh` on diff and transcript. |
| | S11 Re-run yourself | Clean checkout; full suite vs baseline; compare test-file hashes; `git diff --stat BASE -- tests/ conftest.py`; new tests 5×; C++: `-fsanitize=address,undefined -fno-sanitize-recover=all`; headless runs: read the `status` field, not only the exit code. Gate 4: real output matches the agent's claims. |
| | S12 Attack the fix | Held-out edge cases; property tests (Hypothesis); differential test old vs new; mutation check: revert the fix → your new tests must fail. |
| | S13 Fresh review | New session sees only spec + diff. Three prompts: Critic, Challenger, Auditor. Reproduce each finding; drop style-only ones. |
| | S14 Transcript audit | List every claim the agent made; match each to real tool output; find the first wrong turn; tag the phase (localize / repair / verify). |
| Learn | S15 Merge check + log | Core works, nothing else broke, tests, docs, lint (METR-style merge checks). Log each mistake: type, step that caught it, minutes → `mistakes.csv` → task ideas. |

### 3.3 Mistake card (every row must map to at least one lab item)
| # | Agent mistake | Detect with | Step |
|---|---|---|---|
| M1 | Invented API / flag / package | run it, `--help`, try the import, check lock files | S4, S11 |
| M2 | Wrong root cause / symptom-only fix | repro red→green; a second input | S6–S7, S12 |
| M3 | Test gaming (special-cased inputs, edited/skipped tests, conftest exit, always-true `__eq__`) | diff test files, hashes, held-out tests | S10–S12 |
| M4 | Silent damage (deleted logic, scope creep, swallowed errors) | `--stat`, baseline diff, break-the-fix | S10–S12 |
| M5 | Similar-but-different logic | differential / property tests | S12 |
| M6 | Overselling ("tests pass" with no output) | re-run yourself; read `status` | S11, S14 |
| M7 | Solution lookup (git log --all, upstream fetch, memorized code) | isolation; transcript search | S0, S14 |
| M8 | Answering from memory, not the code | file:line citations; check with rg | S3–S4 |
| M9 | C++ memory / undefined behavior | ASan/UBSan | S11 |
| M10 | Security & dependencies (shell=True, eval/exec, verify=False, secrets, new deps) | red-flag scan; dependency diff | S10 |

## 4. Chapters (slug → content file → owner lane)

Each chapter is one page at `/repolarisdm/<slug>/`, built from `content/NN-slug.md` (NN = two digits).
Hours = personal preparation time for a reader starting from zero (NOT build time).
Every chapter MUST follow the chapter contract in `STYLE.md`.

| # | slug | Title | Hours | Must contain |
|---|---|---|---|---|
| 0 | start-here | Start here | 1 | Three signals; JD decoded (paraphrase); facts table with badges; two routes (Sprint ~30 h before Nov 2; Full); how the placement page works (it aggregates all self-checks automatically); apply-early advice (apply by Fri Oct 23 with résumé + strongest existing project; send the capstone link to the recruiter later); Day-1 tool checklist (install `agy`, sign in, `--help`, `/context`, `/agents`, plan mode, headless JSON `status`, whether `/memory` and `/init` exist); three practice modes (agent / chat-only / no AI). |
| 1 | toolbelt | Toolbelt (just in time) | 6–10 | Curated, not a full tutorial. Git (worktree, `bisect run`, exit 125, blame, `log -S`), rg, uv/venv, pytest (-rA, -x, -k, --lf, --collect-only), coverage, Hypothesis basics, Docker basics, CMake basics, clang sanitizers on macOS (no LeakSanitizer with Apple clang), lldb (not gdb on Apple Silicon), Node 22 TypeScript (type stripping, node:test), `agy` basics (docs-checked). Each tool: why Polaris cares, 3–5 commands, a 10-minute drill. |
| 2 | agent-patch-audit | The Agent Patch Audit ★ | 4 | The 5-move loop; the full S0–S15 table with heading ids `s0`…`s15`; drive vs review mode; gates; mistake card; ONE full worked example (a real bug from Lab A's repo walked through every step with real captured command output); `audit.md` template; a prompt for each [A] step; 60-minute mock in three modes (Meta format, labeled as Meta's); "evidence, not proof". |
| 3 | map | Map an unfamiliar repo | 5 | S0–S5 in depth: tool-map recipes, dynamic map via coverage, an import-graph script, churn hotspots, large-repo strategy (subagents per folder, merge, risk-based checking), prompts, how agents mis-map (memory vs code), reading TypeScript and Go for Python people; Lab A; a real open-source repo drill at a pinned commit (pick a mid-size Python repo; give the exact commit and verify it exists). |
| 4 | change | Change with guardrails | 4 | S6–S9: spec first, failing test first, plan mode, guardrails, small diffs, rewind rule, headless runs and the `status` field, long-horizon milestone audits with `spec.md` + `plan.md`. |
| 5 | prove | Prove it (or catch it) | 5 | S10–S15: red flags (with `redflags.sh`), re-run protocol, hashes, property tests, differential tests, mutation check, fresh-review prompts, transcript audit (first wrong turn), mistake log; Lab C; tests pass = evidence, not proof. |
| 6 | debug | Debug like a senior | 5 | Reproduce, shrink the input (delta debugging idea), hypotheses, pdb/lldb, logging, `git bisect run` with skip (125), flaky tests, C++ UB, sanitizers; Labs D and E. |
| 7 | task-design | Design a Polaris-style task | 4 | Task anatomy (prompt, environment, grader, reference solution); Harbor layout; realism vs measurability; long-horizon tasks and milestones; difficulty calibration (a 0% task usually means a broken task — Anthropic evals guidance); contamination and canary strings; how public benchmarks broke (SWE-bench Verified human validation, SWE-Lancer test-file exposure, ABC checklist, empty-answer agent on τ-bench); DeepSWE as analogue; Mechanize's "cheap RL tasks will waste compute" argument (labeled). |
| 8 | grader-validity | Grader validity (the science) ★ | 5 | Grader as a classifier; false accepts and false rejects; **sampling frames** (a hand-picked wrong-solution set gives counts, not an error rate; a census or a random sample of a defined mutant space can support an estimate; always state the frame); Wilson intervals only with a stated frame; ≥3 independent correct implementations must pass; refactor-equivalent variants must pass; unseen wrong approaches must fail; behavioral spec tests; metamorphic tests (future-invariance over knowledge time); independent oracle and differential tests; boundary cases; flakiness (3+ stable runs); isolation (no network, no revealing git history, hidden tests, canaries); partial credit; reward hacking under RL pressure; how to state uncertainty; Lab F; Grader Validity Card template. |
| 9 | runs-and-weaknesses | Runs, statistics, and model weaknesses | 4 | Running Gemini on your task (`agy` headless JSON → Managed Agents API → interactive with saved transcripts); why 5 runs are too few; pass@k vs pass^k (formulas + worked numbers); Wilson / bootstrap intervals and their sampling assumptions; sample-size table; transcript labeling schema; error taxonomy; first-wrong-turn analysis; eval system design (sandboxes, parallel runs, timeouts, caching, logging, reproducibility); evals vs RL environments; turning one weakness into a family of task variants. |
| 10 | unfamiliar-stacks | Unfamiliar stacks and problem solving | 4 + 15 min/day | Rapid stack adaptation method (read the build file → run tests → trace one request → change → validate) with Lab H (TypeScript, Node 22, 90-minute timed change); reading Go and Rust quickly; C++ competitive programming as a supporting track (2 h in the sprint, more later); optional ML basics list. |
| 11 | interview | Interview modes and mocks | 4 | The three modes; 4 mocks (AI-assisted Meta-format, chat-only, no-AI algorithms, project deep dive); STAR stories built from his own agent-built commits in this portfolio repo (tell him to run the audit on 2 of his own Gym or Paper Piano commits); "say it out loud" card (~20 short sentences); recruiter questions before each stage (format? AI allowed? language?). Proxy rubric: Mechanize's traits on a 1–4 scale (label as proxy, inference). |
| 12 | defend-it | Defend your decisions ★ | 4 | 30+ hard questions about graders, tasks, benchmarks and agent failures, each with an answer outline (hypotheses + experiments + uncertainty). Must include: "Your grader rejects 5 wrong patches and accepts your reference — how do you know it won't reject another correct solution or accept a different wrong one?" and "Gemini solves almost every task in your benchmark — too easy, real improvement, or leakage? How do you tell?" Drill: answer aloud in 2 minutes, then compare with the outline. |
| 13 | capstone | Capstone: Chronos ★ | 13 (sprint) + 1–7 days | Written AFTER Chronos exists, from its real results. What Chronos is, how to run it, validity results with their sampling frames, pilot results (Claude agents, labeled), the **mandatory ownership gate**, Gemini run plan, application package (résumé bullets, public/private split), extension plan. Status line: "v0, agent-built; not complete until you pass the ownership gate". |
| 15 | gpu-practice | GPU practice on Colab | 8–15 (Colab GPU) | The user has Google Colab GPU compute. Assignments with notebooks in `labs/colab/` (open via Colab's GitHub URL): G1 serve a small open-weight coding model (vLLM or transformers) and measure pass@k vs temperature with n≥50 samples and Wilson intervals; G2 run a tiny agent loop with the local model on Harbor-style tasks (Lab F task; optionally the private Chronos grader uploaded from your own machine — never commit it) for 20–100 attempts, pass@k vs pass^k, failure labels; G3 grader under RL pressure: GRPO with a LoRA on a ~0.5–1.5B model against a weak vs a strong grader on toy coding tasks, watch reward hacking against held-out tests; G4 contamination probe (perplexity / Min-K% prob on known benchmark text vs fresh text); G5 LLM-judge transcript labeling vs your own labels with Cohen's kappa. Every notebook: GPU check, pinned installs, time/VRAM budget per Colab GPU type, done-when, and the honest label "written and CPU-smoke-tested by the build; never run on a GPU". |
| 14 | tracker | Tracker and schedule | — | Sprint schedule, after-applying plan, final-project days, progress table auto-built from all drills, export/import, weekly "recheck tools". Personal prep hours only (build time is tracked separately in BUILD_LOG.md). |

Also: `content/cards/*.md` → printable cards page `/repolarisdm/cards/`: method card (5-move loop + S0–S15),
mistake card, prompt card, say-it-out-loud card, grader validity card template, `audit.md` template.
The home page `/repolarisdm/` comes from `content/index.md`.

## 5. Schedule (personal target dates; no posted deadline)

Sprint (~30 focused hours before Nov 2; **Nov 1–2 protected for school deadlines**):
- Allocation: Chronos + grader 13 h · debugging and patch audits 6 h · no-AI coding and mocks 5 h · résumé,
  write-up, application 4 h · C++/algorithms 2 h.
- Oct 20–23: placement test, Ch 0, Ch 2 (5-move loop); tailor the résumé; pick the strongest existing project;
  **apply by Fri Oct 23**.
- Oct 24–27: own Chronos v0 (ownership gate items 1–2), Ch 7–8, Lab F.
- Oct 28–29: Gemini runs on Chronos; failure analysis; Ch 9.
- Oct 30–31: one timed no-AI mock; Defend-it drills; ownership gate items 3–4.
- Nov 1–2: protected.
After applying (4–10 weeks): remaining chapters and labs, weekly mocks in all three modes, send the capstone link to
the recruiter when contacted, ask about format and AI rules before each stage.
Final-project days (30 min–2 h daily, or 1–7 full days): see §7.6.

## 6. Labs (in `labs/`, public in the repo; answer keys local only)

Priority: lab-a, lab-c, lab-f (must) → lab-e, lab-d, lab-h (should) → lab-b, lab-g (cut first).
Each lab: `labs/<id>/README.md` (task, time box, done-when, how to start), `labs/<id>/repo/` (the code),
`labs/<id>/requirements.txt` (pinned) if Python, and a check entry in `labs/check_labs.py`.
Answer keys: write them to `labs/<id>/_key/` during the build. The main agent moves every `_key/` into the local
holdout at the end. Never mention the holdout path in public content; say "your local answer keys".
Every key lists the exact planted defects with file:line and the reason.
Practice: `labs/make_practice.sh <id>` copies `repo/` to a fresh temp dir (`mktemp -d`), runs `git init` + one
commit, and prints the path. The agent must be opened there, never inside the portfolio repository.

| id | Name | Lang | Trains | Done when |
|---|---|---|---|---|
| lab-a | Map Check (`tallyhub`, a realistic small service) | Python | S2–S5 | 12 agent-map claims in `claims.json` (file:line + expected text); 4 are wrong; all 12 judged with evidence in 20 min. Also contains the planted bug used by the Ch 2 worked example. |
| lab-c | Spot the Bad Agent Patch | Python | S10–S14 | Own small repo; 12 synthetic patches + transcripts (each starts "Synthetic, written for practice. Not real Gemini output."); 10 flawed covering M1–M8 and M10, 2 clean; score ≥9/10 with ≤1 false alarm in 60 min, naming the catching step. |
| lab-f | Break the Grader | Python + Harbor layout | Ch 7–8 | A Harbor-style task whose weak `tests/test.sh` accepts 5 wrong solutions; `run_task.sh` runs it locally (Docker optional); done: reference=1, do-nothing=0, all 5 wrong=0, 2 alternative correct solutions=1, 3 stable runs. |
| lab-e | Bisect 200 | Bash/Git | S7, Ch 6 | `make_history.sh` builds a 200-commit repo in a temp dir; some commits don't build; `check.sh` returns 0/1/125 correctly and `git bisect run` names the planted commit; manual drill ≤10 tested commits. |
| lab-d | Memory Ghost | C++ | S11, Ch 6 | `ringlog` ring-buffer logger; a heap off-by-one, a signed overflow, and one clean patch; Makefile with a sanitizer target; found with ASan/UBSan (Apple clang, no LSan). |
| lab-h | Unfamiliar Stack Sprint | TypeScript | Ch 10 | Small TS service runnable with Node 22 (`node --test`, type stripping: no enums/namespaces/parameter properties); a feature request + one bug; 90-minute timed change validated with tests you add. |
| lab-b | Small Steps, multi-milestone | Python | S6–S9 | (cut first) |
| lab-g | Mock Round | Python | Ch 11 | (cut first) |

`labs/check_labs.py` (stdlib only) proves: each planted bug reproduces, each clean patch passes, each lab-a claim is
right/wrong as labeled, every mistake-card row M1–M10 maps to at least one lab item, lab-e bisect finds the planted
commit, lab-f's validation matrix holds. Keys are read from `labs/<id>/_key/` or from a path given by `--keys DIR`.

## 7. The final project: Chronos (private; never pushed by the build)

### 7.1 Goal
An outstanding Polaris portfolio piece: one realistic long-horizon SWE eval task whose grader is scientifically
validated, a reusable Grader Validity Toolkit, and a pilot study of real agent attempts with failure analysis.
Realistic engineering complexity matters more than size. **Do not add artificial code to make the repo longer.**

### 7.2 Time model (the core of the spec — get this exactly right)
Four distinct times. The spec, code, oracle and grader must use these names consistently:
- **event time** (`event_time`, a.k.a. reference period): the period an observation describes (e.g. GDP for Q2).
- **publication time** (`published_at`): when a value first became public.
- **revision availability** (`vintage`/`revised_at`): each revision of an observation is a new vintage, available only
  from its own publication time onward. The latest revision is NOT knowable before it is published.
- **as-of query time** (`asof`, a.k.a. knowledge time / decision time): the moment at which a computation runs.
  A computation as of `asof` may use only vintages with `published_at <= asof` (state the boundary rule explicitly
  and test it on exact-equality boundaries), and among those, for each event, only the latest such vintage.
- Prices/market data have their own availability rule (e.g. a daily close is available at the close timestamp); state it.
- **Future-invariance (knowledge-time) property**: for any `t`, changing, adding or deleting any vintage with
  `published_at > t` (including late revisions of old events) must not change any output computed as of any `asof <= t`
  (features, joins, CV training sets, backtest decisions). Changing data with `event_time > t` but `published_at <= t`
  is NOT covered by the property (that data is legitimately known) — the grader must not over-claim.
- The **oracle** is an independent, slow, obviously-correct brute-force implementation written from the spec alone
  (by an author who did not see any reference solution), used for differential testing on seeded random data AND on
  a hand-enumerated boundary-case table (equal timestamps, same-instant revisions, lags across weekends/holidays/DST,
  timezone offsets, events with zero vintages before asof, multiple keys/groups, duplicate timestamps, empty inputs).

### 7.3 Components
1. **Environment repo `chronoflow`**: a realistic time-series feature and backtest library: IO for CSV with
   vintages, calendars/timezones, series utilities, features (lags, rolling windows, z-score, returns), joins, a
   feature pipeline, cross-validation splitters, a simple backtester, a CLI, docs, examples, small synthetic datasets
   (daily prices + macro releases with publication timestamps and revisions), visible tests, and a believable git
   history whose commits never contain the solution. Size: whatever realism needs (roughly 1,500–3,000 lines of real
   code; no filler). A **repository-coherence review** must pass (consistent naming, docs match code, every module
   used, tests meaningful, no dead scaffolding).
2. **Task `chronos-pit`** (long-horizon; about 1–2 days for a strong human), milestones with partial credit:
   - M1 bug: the `zscore` feature uses full-sample statistics (look-ahead leakage) → must use only data known at each row.
   - M2 feature: point-in-time `asof_join` honoring publication times and revisions per §7.2.
   - M3 integration: the feature pipeline uses point-in-time joins; the public API stays backward compatible
     (the spec says exactly how, e.g. a new keyword with a documented default).
   - M4 feature: a purged + embargoed walk-forward CV splitter used by the evaluator (purge/embargo defined in
     time units with explicit boundary rules).
   `instruction.md` describes behavior, not files (like DeepSWE). It is precise about every boundary rule.
3. **Hidden grader** (requirement-based, not reference-based):
   - G1 knowledge-time future-invariance metamorphic tests (§7.2) on seeded random data.
   - G2 differential tests vs the independent oracle: seeded random datasets + the boundary-case table.
   - G3 CV split properties (purge, embargo, order, coverage) with time-unit boundaries.
   - G4 regression + API compatibility (original visible tests, documented signatures).
   - G5 M1 behavioral check.
   Reward = documented milestone weights; deterministic seeds; whole grader runs in under 2 minutes; writes
   `reward.json` with per-milestone results and raw test outcomes.
4. **Solution corpora** (private): ≥3 independent reference solutions with different designs by different authors;
   ≥12 hand-written realistic wrong solutions (each a subtle semantics/leakage bug, plus 2 cheats: special-casing
   visible data, editing visible tests); refactor-equivalent variants of each reference (generated); an enumerated
   mutant space from a fixed operator set applied to the reference diffs (generated).
5. **Grader Validity Toolkit `gvt`** (Python, stdlib + pytest): runs a grader on corpora with repeats; reports **raw
   outcomes first** (per solution: reward, milestone results, runs); then per-corpus counts. Rates and Wilson 95%
   intervals are reported ONLY with an explicit sampling frame: hand-picked corpora → counts only ("rejected 12 of 12
   hand-written wrong solutions"; not an error-rate estimate); full mutant census → kill rate over the enumerated
   space (a census, so no sampling interval; equivalent mutants adjudicated and excluded with reasons); random sample
   of a defined space → rate + Wilson interval + stated frame. Emits a Grader Validity Card (Markdown + JSON).
6. **Agent harness** `harness/`: model-agnostic runner that builds an isolated workspace (temp dir, fresh `git init`
   of the base snapshot only, no hidden files, canary checks), runs an agent command, captures diff + transcript,
   grades. Adapters: generic shell command; `agy` headless (docs-based, untested); Gemini API (needs the user's key).
   Statistics module: pass@k, pass^k, Wilson and bootstrap intervals with stated assumptions, sample-size calculator.
7. **Pilot study** (during the build): N fresh Claude agents attempt the task blind (only `instruction.md` + an
   isolated temp copy of the environment repo). Graded; adjudicated against the spec by separate reviewers; failures
   labeled (first wrong turn, phase, mistake-card row). Raw outcomes + intervals with the frame "N attempts by one
   agent configuration on one task". Clearly labeled **Claude subagents, not Gemini**.
8. **Docs**: `README.md` (what/why/how to run; honesty note: built with AI agents directed by Richard),
   `REPORT.md` (tech report: motivation, time model, task design, grader design, validity results with frames, pilot
   results, threats to validity, unresolved limitations), `DEFEND.md` (20+ hard questions specific to Chronos with
   answers), `OWNERSHIP.md` (the mandatory gate), `EXTEND.md` (the 1–7 day plan), `BUILD_LOG.md` (automated build time
   per phase, separate from personal prep time).

Naming: `M1`–`M4` are Chronos's keys in `task.toml` and `reward.json`; prose says "milestone 1"–"milestone 4". Do not confuse them with mistake-card rows M1–M10.

### 7.4 Isolation and custody (follow exactly; verify it)
- Public part: `workspace/polaris-capstone/` — environment repo, `instruction.md`, visible tests, `gvt/`, `harness/`,
  docs, result summaries. It is its own git repo and is excluded from the portfolio repo.
- Private part: hidden tests, oracle, reference solutions, wrong solutions, adjudication labels. Workers build them in
  `_private_staging/`; the main agent moves them into the local holdout before the pilot. Worker agents never read the
  holdout. Every private file carries a canary GUID line.
- Isolation verification (must be reported): solver workspaces contain no canary; the environment repo's full git
  history (`git log --all -p`) contains no solution code or hidden-test text; solver transcripts are scanned for reads
  of holdout/staging paths or canaries; any violation invalidates that attempt and is reported.

### 7.5 Mandatory human-ownership gate (Chronos is NOT complete until Richard does all four himself)
1. Independently reproduce one grader-detected failure from the pilot (run the grader himself, see the failing check).
2. Diagnose it: explain the root cause in his own words with file:line, and which time rule it broke.
3. Modify the grader: add or change one check (e.g. a new boundary case), show it catches a new wrong solution he
   wrote, and re-run the validity card.
4. Defend the design: answer 10 questions from `DEFEND.md` aloud without notes; record weak answers and fix them.
The playbook and README must state: "v0 is agent-built. It becomes your project when you pass this gate."

### 7.6 Final-project extension plan (personal time: 30 min–2 h/day, or 1–7 days)
Day 1 ownership gate items 1–2 · Day 2 Gemini runs (≥20 attempts per configuration, or report intervals) · Day 3
failure analysis + new wrong solutions from real Gemini failures; gate item 3 · Day 4 task 2 in another stack
(e.g. TypeScript) with gvt · Day 5 public-benchmark grader audit study (apply a defined mutant space to a sample of
public Harbor-format tasks; report with frames) · Day 6 tech report v1 · Day 7 gate item 4, polish, choose what to
publish (public part only), send the link.

## 8. Build rules for all agents

- Build-time paths: you will be given a STAGE directory. Write only inside your assigned files/folders under it.
  Never edit the portfolio repo directly; the main agent syncs STAGE into it. Never run git commands in the
  portfolio repo. Never read any `holdout/` directory.
- Never write personal data (email, school names, application details) into public content.
- Never sign in to anything, never use the user's accounts, never install global packages. Use `uv venv` inside a
  temp dir or a lab/capstone dir for Python packages (pandas/numpy/pytest/hypothesis pinned). Keep disk use small.
- Content rules: see `STYLE.md` (forbidden strings, badges, short sentences, chapter contract).
- Nothing gets pushed during the build. The user approves the staged diff first.
