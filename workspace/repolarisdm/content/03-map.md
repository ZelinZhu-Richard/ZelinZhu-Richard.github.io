---
title: Map an unfamiliar repo
short: Map a repo
summary: Take a repo you have never seen to a checked map in about an hour. You control what the agent can see, learn what "pass" means, and map with tools first. Then you let the agent map and catch its wrong claims with evidence, before anyone writes a fix.
---

:::selfcheck
- You give an agent a `git worktree` of a project, checked out at an old tag. Can it read the future fix? Prove it with one command. || Yes. A worktree shares the whole repository: every branch, tag and commit. `git log --all --oneline -S'TEXT_FROM_THE_FIX'` finds the future commit. Give the agent a snapshot instead: `git archive SHA | tar -x -C DIR`, then `git init` and one commit.
- pytest prints `2016/33016 tests collected (31000 deselected)`. Where do you look first, and why does it matter for your baseline? || At the config file pytest used (the `configfile:` line): `addopts` and markers deselect tests. Your baseline must say what it does not run. Also: pytest never merges config files, so a new empty `pytest.ini` replaces all of it. Under `-q` you see no sign. Without `-q`, the header says `configfile: pytest.ini (WARNING: ignoring pytest config in pyproject.toml!)`.
- Show which functions one test really runs, using coverage.py only. || `coverage run -m pytest -q PATH::TEST`, then `coverage json -o one.json` and list the functions with `covered_lines > 0`. `coverage report -m` gives the same at line level.
- Find the commit that added a string, and the history of one method inside a Python class. || `git log -S'STRING' --oneline`. For the method: `git log -L '/def NAME/,+15:FILE'`, or `git log -L :NAME:FILE` after you add `*.py diff=python` to `.git/info/attributes`.
- An agent cites `parser.py:224` and quotes `class OptionParser:`. Which two checks decide the claim? || 1. The quote is really at that line (`sed -n '224p' parser.py`). 2. The sentence is true of the code (`rg`, `--help`, or a 3-line experiment). A claim is right only if both pass.
- In TypeScript, what does `[10, 9, 1].sort()` return, and what does `x as User` check at runtime? || `[1, 10, 9]`, because the default sort compares strings. `as` checks nothing at runtime. Types are erased.
:::

## Why Polaris cares

Polaris builds tasks that measure Gemini on long-horizon software engineering work ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19"). In DeepSWE, which we think is the closest public analogue ^[inference](- "2026-10-20"), prompts describe behavior, not files, so the agent must find the code to change by itself ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). Finding the files is often not the hard part: in one study of three agents (OpenHands, SWE-agent, Prometheus) on SWE-bench, 72–81% of trajectories located the right files, even in failed runs ^[confirmed](https://arxiv.org/abs/2511.00197 "2026-10-20"). Other maps come from memory, not from the code: given only the issue text, o3 named the buggy file up to 76% of the time on SWE-bench Verified ^[confirmed](https://arxiv.org/abs/2506.12286 "2026-10-20"). Mechanize lists quick progress in unfamiliar codebases as an interview trait ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20"), and its co-founder now recruits for Polaris ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20"); that is Mechanize's process, not a known Polaris format. As a task builder, you use this skill to see where your task is really hard, and to tell understanding from a lucky guess in a transcript ([how](#task-designer)) ^[inference](- "2026-10-20").

## How to use this chapter {#how-to-use}

Chapter 2 walks steps [[S0]] to [[S5]] once, on tallyhub issue #41 ([[agent-patch-audit#worked-example|the worked example]]). This chapter gives each step its full toolkit, the reason behind each tool, and a real open-source repo to practice on.

| Part | Time | What you have at the end |
|---|---|---|
| Read S0–S5 below and save the four scripts | 75 min | `importgraph.py`, `ranfuncs.py`, `whoruns.py`, `checkquotes.py` |
| [Lab A](#lab-a) | 60 min | 12 claims judged with evidence |
| [The click drill](#drill-click-drill) | 90 min | a 5-line map of click and 10 judged claims |
| Four short drills | 70 min | a worktree leak you saw yourself, an issue-only probe, a predicted and measured path, a two-way import report |
| [Read TypeScript and Go](#read-ts-go), with its drill | 30 min | the syntax maps and the traps |
| Stretch: [the big-repo split](#drill-big-repo-split) | 45 min | a merged map from three subagents |

That is about 5.5 hours, plus the stretch ^[inference](- "2026-10-20").

:::note title="What is real on this page"
Every command output on this page is real. It was captured on 2026-10-20 on macOS (Apple Silicon) in zsh, with Python 3.13.9, pytest 9.1.1, coverage 7.16.2, git 2.55.0, ripgrep 15.2.0 and Node v22.21.1. The open-source repo is pallets/click at commit `8b19813f2bfca99f1018a587a8cf54fc959f2e5d`, the 8.5.0 release ^[confirmed](https://github.com/pallets/click/commit/8b19813f2bfca99f1018a587a8cf54fc959f2e5d "2026-10-20"). Long temp paths are shortened to `…`. No agent was run. Agent claims on this page were written for this guide and are marked as such. The Go commands were checked against Go's docs, not run: the build machine has no Go toolchain.
:::

:::tip title="zsh and the shell blocks"
Interactive zsh does not treat `#` as a comment unless you run `setopt interactivecomments`. So no shell block on this page has a `#` comment. Words in CAPITALS are placeholders. Save the four scripts in a folder outside every repo you give an agent, for example `~/polaris-tools/`.
:::

This page uses click for its examples. It does not give Lab A's answers.

## The map phase at a glance {#at-a-glance}

| Step | The question it answers | Output | Time | Gate |
|---|---|---|---|---|
| [S0 Isolate](#s0-isolate) | What can the agent see that it should not? | A visibility audit in `audit.md` | 10 min | — |
| [S1 Baseline](#s1-baseline) | What does "pass" mean in this repo? | `baseline.txt` twice, config notes, hashes | 10 min | Gate 1 |
| [S2 Tool map](#s2-tool-map) | What is really here, and what really runs? | A 5-line map and your first guess | 15 min | — |
| [S3 Agent map](#s3-agent-map) | What does the agent believe? | `repo-map.json`, a list of claims | 10 min | — |
| [S4 Check the map](#s4-check) | Which of its claims are true? | One judgment line per checked claim | 15 min | Gate 2 |
| [S5 Rule file](#s5-rule-file) | What must the agent always do here? | `AGENTS.md` or `GEMINI.md`, confirmed loaded | 10 min | — |

The order matters. You map with tools **before** the agent speaks, so its answer cannot anchor you. You check its map **before** it changes code, so a wrong map never becomes a wrong fix.

## S0 Isolate: control what the agent can see {#s0-isolate}

### Five ways to get the answer without solving the task {#leak-channels}

One 2026 study names three shortcuts: retrieving the upstream fix, mining local git history, and recalling memorized code. Three open models attempted them in 55.5–89.1% of DeepSWE *trajectories* (a trajectory is the full log of one attempt). Turning the network off did not meaningfully reduce attempts. Asking the agent to build the solution itself cut them to 0.9–10.3% ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20"). When Poolside blocked git, agents found the fix on upstream GitHub, in web archives and in older package releases ^[confirmed](https://poolside.ai/blog/through-the-looking-glass "2026-10-20"). Cursor saw agents call the GitHub pulls API to read the merged PR's diff ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20").

| Channel | Example | Block it with | Check it with |
|---|---|---|---|
| Local git history | `git log --all -S'fix text'`, `git show FUTURE_SHA` | A snapshot with fresh git | The [visibility audit](#visibility-audit) |
| Network | `curl` to the GitHub API, a mirror page | A sandbox without network | Search the transcript for `curl`, `https://`, `pip download` |
| Installed packages | `site-packages` holds a newer release of the same project | Install the working copy (`pip install -e .`) | Print `PKG.__file__` |
| Files next to the repo | Answer keys, hidden tests, your notes | Keep them outside every folder the agent can read | A canary and the boundary test |
| Memory | The model recalls the real fix or an old version of the code | Cannot be blocked | [[S4]] checks; the rule "build it yourself" in [[S5]] |

Polaris cares about all five as a task designer too: each one is a way your task can leak ([[task-design]]).

### A worktree is not isolation {#worktree-leak}

A `git worktree` is a second working folder for the **same** repository. It shares every commit, branch and tag. Here is click, cloned and then given a worktree at the older release 8.4.0. The bug "a parameter named `help` breaks parsing" was fixed after 8.4.0.

The first line makes the folder layout that the rest of this page uses: `$D/hist` is your full clone, `$D/notes` holds your evidence, and `$D/private` holds the canary. Keep this terminal open, because later blocks use `$D`.

```bash
D=$(mktemp -d -t click-drill); mkdir "$D/notes" "$D/private"; cd "$D"
git clone -q https://github.com/pallets/click.git hist
git -C hist worktree add -q --detach ../wt-840 8.4.0
cd wt-840
git log -1 --format='%h %s'
git log --oneline HEAD..8.5.0 | wc -l
git log --all --oneline -S'_click_default_help' --format='%h %ad %s' --date=short
rg -c '_click_default_help' src; echo "rg exit=$?"
```

```text
41f410f Release 8.4.0
     194
3495fba 2026-07-07 Warn when an argument name collide with other parameters
rg exit=1
```

The files are 8.4.0: the fix's string is not in them (`rg` exit 1). Your `-S` output may have extra lines if later commits changed that string. But history holds 194 newer commits, and `git log --all -S` finds the one that fixed the bug. Its body says "Fix parsing when a parameter is named `help`, closing #2819". An agent asked to fix #2819 here could run `git show 3495fba` and copy the fix and its tests. SWE-bench had the same hole: agents ran `git log --all` in the eval containers, and some runs got the gold patch ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20").

:::warn title="Agent tools use worktrees too"
Antigravity 2.0 Projects use Git worktrees ^[confirmed](https://antigravity.google/docs/changelog "2026-10-20"), and its subagents can run in a Git-worktree workspace ^[confirmed](https://antigravity.google/docs/subagents/ "2026-10-20"). That is fine for your own feature work. It is not isolation for an eval attempt at an old commit ^[inference](- "2026-10-20").
:::

Clean up: `cd "$D" && git -C hist worktree remove ../wt-840`.

### The snapshot: history-free by construction {#snapshot}

`git archive` writes the files of one commit, without any history. Pin your clone to the commit, unpack that commit into a new folder, and give the folder its own fresh git:

```bash
git -C "$D/hist" checkout -q 8b19813f2bfca99f1018a587a8cf54fc959f2e5d
mkdir "$D/agent" && git -C "$D/hist" archive HEAD | tar -x -C "$D/agent"
cd "$D/agent" && git init -q && git add -A
git -c user.name=practice -c user.email=practice@example.invalid commit -qm "click 8.5.0 snapshot"
```

From here on, commands run in `$D/agent`, and `../notes` is `$D/notes`. History commands run in `$D/hist`. This is the same layout as the [click drill](#drill-click-drill).

The **two-copies rule**: you keep the full clone for yourself, because blame and churn need history ([history tools](#history)). The agent gets only the snapshot. `git archive` skips files marked `export-ignore` in `.gitattributes`, so compare the file counts. Here both have 166 files.

The agent's folder sits next to `hist`. That is safe only if the [boundary test](#canaries) passes. If it fails, the agent can read `../hist` and its whole history. Another temp folder does not fix that: the agent can read those too. Then run the agent in a sandbox that cannot see `hist`, or remove `hist` while the agent works and clone it again later.

### The visibility audit {#visibility-audit}

Run this in the folder you will give the agent. Paste the result into `audit.md`.

```bash
printf 'commits=%s tags=%s remotes=%s reflog=%s stashes=%s files=%s\n' "$(git rev-list --all | wc -l | tr -d ' ')" "$(git tag | wc -l | tr -d ' ')" "$(git remote | wc -l | tr -d ' ')" "$(git reflog | wc -l | tr -d ' ')" "$(git stash list | wc -l | tr -d ' ')" "$(git ls-files | wc -l | tr -d ' ')"
```

| Folder | Output |
|---|---|
| The clone (yours), at the pinned commit | `commits=3384 tags=71 remotes=1 reflog=2 stashes=0 files=166` |
| The snapshot (the agent's) | `commits=1 tags=0 remotes=0 reflog=1 stashes=0 files=166` |

Your clone's numbers will be higher: click keeps growing. The snapshot's numbers must match exactly. These are the same things the SWE-bench fix removed: future history, branches, remotes, reflog and later tags ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20").

Then check that the code under test is the snapshot, not an installed release. After you build the venv ([S1](#s1-baseline)):

```bash
.venv/bin/python -c 'import click; print(click.__file__)'
```

```text
…/click-drill.rjZaKg3Jxt/agent/src/click/__init__.py
```

If this prints a path inside `site-packages`, the agent can read a different version of the same code, and so can your tests.

### Canaries and the boundary test {#canaries}

A **canary** is a file with a unique random string. If the string appears in a transcript, the agent read something it should not. Chapter 2 shows the commands ([[S0]]). Three rules on top:

- Put a canary next to anything private: answer keys, hidden tests, your notes. Chronos puts a canary line in every private file.
- Run the **boundary test** on day 1: ask the agent to print the first line of `../private/canary.txt`. If it can, its reads are not confined to the workspace. Plan for that. Antigravity's app docs say Projects set repo boundaries and scoped permissions ^[confirmed](https://antigravity.google/docs/changelog "2026-10-20"). We found no doc that says whether `agy` blocks reads outside the workspace ^[inference](- "2026-10-20").
- After every session, search the transcript and the workspace: `rg -uuu -F "$G" TRANSCRIPT_FILE .`, where `$G` is the canary string. `-uuu` also searches hidden and git-ignored files; plain `rg` skips them. Exit code 1 means no hit.

Network, checked against docs on 2026-10-20, not run: `agy --sandbox` turns on the terminal sandbox, which is off by default in the CLI. Sandboxed commands have no network by default ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20"). The study above found that agents keep trying when the network is off. So you still search the transcript.

**Exit check:** the visibility audit is in `audit.md`, `PKG.__file__` points into the snapshot, and no canary is inside the workspace.

## S1 Baseline: what does "pass" mean here? {#s1-baseline}

Chapter 2 shows the mechanics: `set -o pipefail`, `-rA`, two runs, a diff of the pass/fail lists ([[S1]]). This section is about reading the result, because the number alone can lie.

### Read the summary line word by word {#summary-line}

Click's snapshot, first run:

```bash
uv venv -q --python 3.13 .venv
uv pip install -q --python .venv/bin/python -e . pytest==9.1.1 coverage==7.16.2 pluggy==1.6.0 iniconfig==2.3.1 packaging==26.3 pygments==2.21.0
set -o pipefail; .venv/bin/python -m pytest -rA 2>&1 | tee ../notes/baseline.txt | tail -1; echo "exit=$?"
sed -n '2,4p' ../notes/baseline.txt
```

```text
======== 1990 passed, 25 skipped, 31000 deselected, 1 xfailed in 3.79s =========
exit=0
platform darwin -- Python 3.13.9, pytest-9.1.1, pluggy-1.6.0
rootdir: …/click-drill.rjZaKg3Jxt/agent
configfile: pyproject.toml
```

| Word | What it means | What you write in `audit.md` |
|---|---|---|
| `passed` | Ran and passed | The count |
| `skipped` | Did not run: a `skip` or `skipif` mark, or `pytest.skip()` inside the test | The reasons. `grep '^SKIPPED' baseline.txt` shows them. |
| `deselected` | Collected, then filtered out before running by `-m`, `-k` or `--deselect` (often set in `addopts`) | Where the filter lives |
| `xfailed` | Expected to fail, and it failed | Which test. If it starts passing, the summary says `xpassed`. |
| `configfile:` | The one config file pytest used | Its name, and its hash |

Here the 25 skips are 21 `msvcrt` input tests, 3 Windows-only tests and 1 test for non-UTF-8 filenames. So this baseline is a **macOS** baseline. On Windows or Linux the counts differ. Record `uname -sm` (here `Darwin arm64`) next to the Python version.

### Find the config pytest really used {#pytest-config}

The `31000 deselected` comes from config, not from the command line. Print the whole pytest table:

```bash
sed -n '/\[tool.pytest/,/^\[/p' pyproject.toml
```

Click's table has four settings. One of them is `addopts = "-m 'not stress'"`, which deselects the 31,000 stress tests. One more of the four also changes what "pass" means. The [click drill](#drill-click-drill) asks you which one and why.

pytest reads the first match among `pytest.toml`, `.pytest.toml`, `pytest.ini`, `.pytest.ini`, `pyproject.toml` (with a `[tool.pytest]` or `[tool.pytest.ini_options]` table), `tox.ini` (with `[pytest]`) and `setup.cfg` (with `[tool:pytest]`). It **never merges** them: the first match wins ^[confirmed](https://docs.pytest.org/en/stable/reference/customize.html "2026-10-20"). The first four names win even when the file is empty. We checked all four on pytest 9.1.1. The two names that start with a dot do not show in plain `ls`. Watch what one empty file does:

```bash
.venv/bin/python -m pytest --collect-only -q | tail -1
touch pytest.ini
.venv/bin/python -m pytest --collect-only -q | tail -1
rm pytest.ini
```

```text
2016/33016 tests collected (31000 deselected) in 0.93s
33016 tests collected in 0.88s
```

An empty `pytest.ini` threw away click's whole test config. An agent that adds one can change which tests run and what counts as a failure. This is test tampering ([[M3]]). Two places hide it:

- `git diff` does not show a new file at all while it is untracked. Only `git status --short` shows `?? pytest.ini`. Before you read the diff, run `git status --short`, or `git add -A -N`, so new files appear in `git diff`.
- Under `-q`, pytest gives no sign. Without `-q`, the header says `configfile: pytest.ini (WARNING: ignoring pytest config in pyproject.toml!)`. Read the `configfile:` line of every run, as you did for `baseline.txt` (`sed -n '2,4p'`).

So hash every config candidate now, and look for new ones when you read the diff ([[S10]]):

```bash
git ls-files -z -- tests conftest.py pyproject.toml pytest.ini .pytest.ini pytest.toml .pytest.toml tox.ini setup.cfg .github | xargs -0 shasum -a 256 > ../notes/test-hashes.txt
wc -l < ../notes/test-hashes.txt
```

```text
      58
```

### Record the environment {#environment}

- `python --version` and `uv pip freeze --python .venv/bin/python`.
- Plugins that change test order or parallelism. Click's own `pyproject.toml` has a `tests-random` group with `pytest-randomly` and `pytest-xdist`. If they are installed, two runs can differ for that reason alone.
- The OS and CPU (`uname -sm`).

**Gate 1:** two runs, same pass/fail list, exit 0, and you can say what the suite does **not** run. Then the agent may start.

## S2 Tool map: ground truth in 15 minutes {#s2-tool-map}

A **tool map** is your map of the repo, built only from deterministic tools: tools that give the same answer every time. It is the ground truth you check the agent against. Build it first, in 15 minutes, before the agent says anything. Each recipe below shows real output on click.

### Size and shape {#size}

Lines and files per folder, two levels deep:

```bash
git ls-files -z -- '*.py' | xargs -0 wc -l | awk '$2 != "total" { n = split($2, p, "/"); d = (n > 2 ? p[1] "/" p[2] : (n == 2 ? p[1] : ".")); s[d] += $1; f[d]++ } END { for (d in s) printf "%7d lines %4d files  %s\n", s[d], f[d], d }' | sort -rn | head -4
git ls-files -z -- 'src/*.py' | xargs -0 wc -l | sort -n | tail -4
```

```text
  13533 lines   22 files  tests
  12674 lines   17 files  src/click
    989 lines   14 files  tests/test_utils
    288 lines    1 files  examples/imagepipe
    1014 src/click/termui.py
    1422 src/click/types.py
    3799 src/click/core.py
   12674 total
```

What it tells you: the tests are bigger than the code. One file, `core.py`, holds 30% of the source lines (3,799 of 12,674). A reader that opens it and stops early misses most of it. Change `'*.py'` to `'*.ts'`, `'*.go'` or `'*.cpp'` for other stacks. The `awk` part assumes no spaces in paths.

### Entry points {#entry-points}

An **entry point** is where execution starts: a command, a `main`, a public API, a hook a framework calls. Agents miss the ones that are not plain functions.

| Stack | Where entry points hide | Find them with |
|---|---|---|
| Python app | `[project.scripts]` in `pyproject.toml`, `__main__.py`, `console_scripts` in `setup.cfg` | `rg -n '^\[project\.(scripts|gui-scripts|entry-points)' pyproject.toml` and `git ls-files '*__main__.py'` |
| Python library | `__init__.py` is the public API. A module-level `__getattr__` serves names that no `def` or `class` line defines. | `rg -n '^def __getattr__' --type py` |
| Python plugins | `[project.entry-points."GROUP"]`, loaded by name at runtime | The same `rg` on `pyproject.toml` |
| pytest | `conftest.py` at any level: fixtures and hooks run before your tests | `git ls-files '*conftest.py'` |
| Node or TypeScript | `bin`, `main`, `exports` and `scripts` in `package.json` | See [[unfamiliar-stacks#step-1\|reading the build file]] |
| Go | `package main` with `func main()`, often in `cmd/NAME/main.go`; every `func init()` | `rg -n '^package main$'` and `rg -n '^func init\('` |
| C++ with CMake | `add_executable`, `add_library`, `add_test` | `rg -n 'add_(executable|library|test)\(' -g 'CMakeLists.txt'` |

Click is a library:

```bash
rg -n '^\[project\.(scripts|gui-scripts|entry-points)' pyproject.toml; echo "scripts: exit=$?"
git ls-files '*__main__.py' '*conftest.py'
rg -n '^def __getattr__' --type py src
```

```text
scripts: exit=1
tests/conftest.py
src/click/utils.py:669:def __getattr__(name: str) -> object:
src/click/parser.py:503:def __getattr__(name: str) -> object:
src/click/__init__.py:76:def __getattr__(name: str) -> object:
src/click/core.py:3778:def __getattr__(name: str) -> object:
```

No console script and no `__main__.py`. Four modules serve extra names through `__getattr__`. So `rg 'class NAME'` can find nothing for a name that still works. Read those four functions before you believe "X does not exist" from anyone, including yourself.

### What tests exist {#tests-exist}

```bash
.venv/bin/python -m pytest --collect-only -q | tail -1
.venv/bin/python -m pytest --collect-only -q | grep '::' | cut -d: -f1 | sort | uniq -c | sort -rn | head -4
```

```text
2016/33016 tests collected (31000 deselected) in 0.87s
 646 tests/test_options.py
 282 tests/test_termui.py
 175 tests/test_compat.py
 109 tests/test_arguments.py
```

`--collect-only` imports every test file and lists every test, but runs none. It is also your fastest check of claims like "test X exists". A third of the selected tests (646 of 2,016) are option tests.

### The dynamic map: coverage of one test {#dynamic-map}

A static map says what the code **could** do. A **dynamic map** says what one real run **did**. coverage.py records every line that runs. Run it on one test:

```bash
.venv/bin/python -m coverage run -m pytest -q tests/test_basic.py::test_int_option | tail -1
.venv/bin/python -m coverage report --include='src/*' --sort=-cover | sed -n '1,2p;/core.py/p;/parser.py/p;/TOTAL/p'
```

```text
3 passed in 0.07s
Name                            Stmts   Miss Branch BrPart  Cover
-----------------------------------------------------------------
src/click/parser.py               243    112    108     23    46%
src/click/core.py                1359    665    588    107    43%
TOTAL                            4863   2990   1690    218    33%
```

Click's own `pyproject.toml` already sets `branch = true` and `source = ["click", "tests"]`, so `--include='src/*'` drops the test files from the report. `coverage report -m` adds a "Missing" column with the line numbers that never ran.

A file's percentage hides a trap: importing a module runs every `def` and `class` line, so even unused files look partly covered. Look at functions instead. coverage 7.16.2's JSON report has a table of functions for each file. This script lists the ones whose bodies ran:

```python
"""Which functions did one coverage run execute? Usage: python3 ranfuncs.py coverage.json [REGEX]"""
import json, re, sys

pattern = re.compile(sys.argv[2]) if len(sys.argv) > 2 else None
for path, f in json.load(open(sys.argv[1], encoding="utf-8"))["files"].items():
    names = [n for n in f["functions"] if n]          # "" is the module-level code
    ran = [n for n in names if f["functions"][n]["summary"]["covered_lines"]]
    shown = [n for n in ran if pattern and pattern.search(n)]
    if ran:
        print(f"{path}: {len(ran)} of {len(names)} functions ran", *shown, sep="\n    ")
```

```bash
.venv/bin/python -m coverage json -q -o ../notes/one-test.json --include='src/*'
python3 -I ~/polaris-tools/ranfuncs.py ../notes/one-test.json 'main|parse_args|invoke|handle_parse'
rm -f .coverage
```

```text
src/click/__init__.py: 1 of 1 functions ran
src/click/_compat.py: 13 of 45 functions ran
src/click/_textwrap.py: 1 of 5 functions ran
src/click/core.py: 60 of 139 functions ran
    Context.invoke
    Command.parse_args
    Command.invoke
    Command.main
    Command._main_shell_completion
    Parameter.handle_parse_result
src/click/decorators.py: 7 of 27 functions ran
src/click/exceptions.py: 7 of 23 functions ran
src/click/formatting.py: 5 of 17 functions ran
src/click/globals.py: 4 of 4 functions ran
src/click/parser.py: 16 of 21 functions ran
    _OptionParser.parse_args
src/click/testing.py: 14 of 39 functions ran
    CliRunner.invoke
src/click/types.py: 7 of 68 functions ran
src/click/utils.py: 2 of 32 functions ran
```

Three lessons from this one run:

- **The set of functions on the path is now a fact.** Coverage does not record who called whom. Reading those functions gives the order: `CliRunner.invoke` → `Command.main` → `Command.parse_args` → `_OptionParser.parse_args` → `Parameter.handle_parse_result` → `Command.invoke` → `Context.invoke`. You did not guess which functions run.
- **Surprises show up.** `Command._main_shell_completion` runs on every call: `main` checks for shell completion first (`core.py:1547`). A static read of `main` can skip that line.
- **The harness shows up too.** `__init__.py: 1 of 1` is the module `__getattr__`. Here pytest's collector called it while probing names such as `__test__` and `__bases__`. We traced the calls to `_pytest/python.py` and `_pytest/unittest.py`. Noise from the test runner is not the product's path.

The best dynamic map is the issue's own reproduction, run under coverage. Chapter 2 does exactly that for tallyhub ([[S2]]).

### Who runs this line? {#who-runs}

coverage.py can record which test ran each line. The setting is `dynamic_context = test_function` ^[confirmed](https://coverage.readthedocs.io/en/latest/contexts.html "2026-10-20"). Keep the config and the data file outside the repo, so `git status` stays clean:

```bash
printf '[run]\nbranch = true\nsource = click\ndynamic_context = test_function\ndata_file = %s\n' "$PWD/../notes/ctx.coverage" > ../notes/ctx.ini
.venv/bin/python -m coverage run --rcfile=../notes/ctx.ini -m pytest -q | tail -1
```

```text
1990 passed, 25 skipped, 31000 deselected, 1 xfailed in 8.10s
```

Then ask the data. `CoverageData.contexts_by_lineno()` maps line numbers to the contexts that ran them ^[confirmed](https://coverage.readthedocs.io/en/latest/api_coveragedata.html "2026-10-20"):

```python
"""Which test functions ran FILE:LINE? Needs a data file made with dynamic_context = test_function.
Usage: python whoruns.py DATA_FILE path/suffix.py LINE"""
import sys
from coverage import CoverageData

data = CoverageData(sys.argv[1]); data.read()
path = next(p for p in data.measured_files() if p.endswith(sys.argv[2]))
tests = sorted(c for c in data.contexts_by_lineno(path).get(int(sys.argv[3]), []) if c)
print(f"{len(tests)} test functions run {sys.argv[2]}:{sys.argv[3]}", *tests[:5], sep="\n  ")
```

```bash
.venv/bin/python ~/polaris-tools/whoruns.py ../notes/ctx.coverage src/click/core.py 1221
.venv/bin/python ~/polaris-tools/whoruns.py ../notes/ctx.coverage src/click/_winconsole.py 197
```

```text
341 test functions run src/click/core.py:1221
  test_arguments.test_argument_custom_class_can_override_type_cast_value_and_never_sees_unset
  test_arguments.test_argument_help
  test_arguments.test_argument_help_optional_metavar
  test_arguments.test_argument_help_options_only_no_arguments_section
  test_arguments.test_argument_metavar_marks_optional
0 test functions run src/click/_winconsole.py:197
```

Run it with the repo's venv Python, because it imports `coverage`. Pick an executable line: a blank or comment line always gives 0. And read a 0 carefully. `core.py:1221` adds the help option, so 341 test functions touch it. Parametrized cases of one function share one context, so they count once. `_winconsole.py:197` is Windows console code, and on macOS no test runs it. Zero tests can mean dead code, or code for another platform. This tool settles agent claims such as "test T covers function F" and "this is dead code" in seconds.

### The import graph {#import-graph}

Who imports whom, from the code itself. Python's `ast` module parses a file without running it. This 35-line script prints the package's internal import edges. It tags two special kinds: **lazy** imports (inside a function, so they run late) and **type-only** imports (inside `if TYPE_CHECKING:`, so they never run).

```python
"""Internal import graph of one Python package. Usage: python3 importgraph.py PKG_DIR"""
import ast, sys
from collections import Counter
from pathlib import Path

root = Path(sys.argv[1]).resolve()
mods = {}                                     # module name -> (file, is it an __init__.py?)
for f in sorted(root.rglob("*.py")):
    parts = (root.name, *f.relative_to(root).with_suffix("").parts)
    mods[".".join(parts[:-1] if parts[-1] == "__init__" else parts)] = (f, parts[-1] == "__init__")
edges = {}                                    # (importer, imported) -> "" | "lazy" | "type-only"
for name, (f, is_pkg) in mods.items():
    tree, tag = ast.parse(f.read_text(encoding="utf-8")), {}
    for n in ast.walk(tree):                  # imports inside functions run late; TYPE_CHECKING never runs
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            tag.update({id(m): "lazy" for m in ast.walk(n)})
        if isinstance(n, ast.If) and ast.unparse(n.test).endswith("TYPE_CHECKING"):
            tag.update({id(m): "type-only" for s in n.body for m in ast.walk(s)})
    for n in ast.walk(tree):
        targets = [a.name for a in n.names] if isinstance(n, ast.Import) else []
        if isinstance(n, ast.ImportFrom):     # resolve "from ..x import y" against this module's package
            base = name.split(".")[: name.count(".") + 1 - n.level + is_pkg] if n.level else []
            stem = ".".join(base + [n.module] if n.module else base)
            targets = [f"{stem}.{a.name}" if f"{stem}.{a.name}" in mods else stem for a in n.names]
        for t in targets:
            while t and t not in mods:
                t = t.rpartition(".")[0]      # pkg.mod.Thing -> pkg.mod; os.path -> "" (external)
            if t and t != name and edges.get((name, t)) != "":
                edges[(name, t)] = tag.get(id(n), "")      # one plain import beats lazy or type-only
for (a, b), t in sorted(edges.items()):
    print(f"{a} -> {b}" + (f"  [{t}]" if t else ""))
fan_in = Counter(b for (a, b), t in edges.items() if not t)
print("RUNTIME FAN-IN:", *[f"{k:3} {m}" for m, k in fan_in.most_common(6)], sep="\n  ")
loaded = {b.rsplit(".", k)[0] for _, b in edges for k in range(b.count(".") + 1)}  # parents load too
print("NO INTERNAL IMPORTER:", *sorted(set(mods) - loaded), sep="\n  ")
```

:::reveal title="Show the test for importgraph.py (it passes)"
Test your tools like any other code. This test builds a tiny package with every import shape: relative, absolute, two levels up, a subpackage `__init__`, a lazy import and a type-only import. Save it next to the script and run it with any Python that has pytest: `python -m pytest -q test_importgraph.py`. We got `1 passed`.

```python
"""Test importgraph.py on a tiny package with every import shape."""
import subprocess, sys, textwrap
from pathlib import Path

FILES = {
    "__init__.py": "from .core import run\nfrom . import util\n",
    "core.py": "import os\nfrom pkg.util import helper\nfrom .store import base\n"
               "def late():\n    from . import cli\n",
    "util.py": "from typing import TYPE_CHECKING\nif TYPE_CHECKING:\n    from .core import run\n",
    "cli.py": "import pkg.core\n",
    "store/__init__.py": "from .base import Store\n",
    "store/base.py": "from ..util import helper\nfrom .. import core\n",
}

def test_graph(tmp_path):
    for rel, src in FILES.items():
        (tmp_path / "pkg" / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / "pkg" / rel).write_text(textwrap.dedent(src))
    tool = Path(__file__).with_name("importgraph.py")
    out = subprocess.run([sys.executable, "-I", tool, tmp_path / "pkg"], capture_output=True, text=True, check=True).stdout
    edges = {line.strip() for line in out.split("RUNTIME FAN-IN:")[0].splitlines() if line.strip()}
    assert edges == {
        "pkg -> pkg.core", "pkg -> pkg.util",                        # __init__: "from .core" and "from . import util"
        "pkg.cli -> pkg.core",                                        # absolute "import pkg.core"
        "pkg.core -> pkg.cli  [lazy]",                                # import inside a function
        "pkg.core -> pkg.store.base", "pkg.core -> pkg.util",         # "from .store import base" is a submodule
        "pkg.store -> pkg.store.base",                                # __init__ of a subpackage, level 1
        "pkg.store.base -> pkg.core", "pkg.store.base -> pkg.util",   # level 2 ("..")
        "pkg.util -> pkg.core  [type-only]",                          # never runs at runtime
    }
    assert "os" not in out                                            # external imports are dropped
    assert out.split("NO INTERNAL IMPORTER:")[1].split() == []        # importing pkg.store.base loads pkg.store
```
:::

On click (two importers shown):

```bash
python3 -I ~/polaris-tools/importgraph.py src/click | sed -n '/^click.core ->/p;/^click.decorators ->/p'
python3 -I ~/polaris-tools/importgraph.py src/click | sed -n '/RUNTIME FAN-IN/,$p'
```

```text
click.core -> click._utils
click.core -> click.decorators  [lazy]
click.core -> click.exceptions
click.core -> click.formatting
click.core -> click.globals
click.core -> click.parser
click.core -> click.shell_completion  [lazy]
click.core -> click.termui
click.core -> click.types
click.core -> click.utils
click.decorators -> click.core
click.decorators -> click.globals
click.decorators -> click.utils
RUNTIME FAN-IN:
    9 click.utils
    9 click._compat
    6 click.exceptions
    6 click.globals
    3 click.core
    3 click.formatting
NO INTERNAL IMPORTER:
  click.testing
```

How to read it:

- **Fan-in** is how many modules import a module at runtime. High fan-in (`utils`, `_compat`) means a change there breaks many places. That is where you look hardest at an agent's diff.
- **A lazy edge often breaks a cycle.** `decorators` imports `core` normally, and `core` imports `decorators` only inside a function. Ask why before you "clean up" a lazy import. Moving it to the top can create a circular import.
- **No internal importer** means a public entry point, a plugin, a script or dead code. `click.testing` is public: users import it in their own tests.
- **Limits.** The script cannot see `importlib.import_module("name")`, plugins loaded by entry-point name, or names served by `__getattr__`. A platform check is also invisible to it: `_compat.py:517` imports `_winconsole` only on Windows, yet the graph shows a plain edge. The [dynamic map](#dynamic-map) shows the truth on your machine: `_winconsole.py` is 0% covered on macOS.

### History: churn, blame, pickaxe {#history}

Run these in **your** clone. The agent's snapshot has no history, on purpose.

**Churn hotspots.** Files that change often are where bugs and agent edits cluster ^[inference](- "2026-10-20").

```bash
git log --format= --name-only | sort | uniq -c | sort -rn | head -6
git log --since=2025-01-01 --format= --name-only -- src | sort | uniq -c | sort -rn | head -5
git rev-list --count --since=2025-01-01 HEAD -- src
```

```text
 451 CHANGES.rst
 228 src/click/core.py
 188 CHANGES
 176 click/core.py
 128 tests/test_options.py
 111 requirements/dev.txt
  79 src/click/core.py
  27 src/click/_termui_impl.py
  24 src/click/termui.py
  19 src/click/types.py
  19 src/click/shell_completion.py
223
```

`--format=` prints no commit header, so only the file names are left to count. Two traps in the first list. **Renames split counts:** `click/core.py` (176) and `src/click/core.py` (228) are the same file before and after the move to a `src/` layout. **Old names stay:** `CHANGES` and `CHANGES.rst` are today's `CHANGES.md`. So limit churn to a time window and to the current folders. Since 2025, 79 of the 223 commits that touched `src/` touched `core.py`. That makes it a hotspot by size, by churn and by fan-in. With the pinned commit checked out, these counts are reproducible.

**Pickaxe.** `git log -S'TEXT'` lists commits that changed how many times `TEXT` appears: usually the commit that added or removed it. `-G'REGEX'` lists commits whose diff has a matching added or removed line.

```bash
git log -S'_click_default_help' --oneline --format='%h %ad %s' --date=short
git blame -L 60,60 src/click/core.py
```

```text
3495fba 2026-07-07 Warn when an argument name collide with other parameters
3495fba1 (Kevin Deldycke 2026-07-07 15:40:56 +0200 60) _HELP_OPTION_STORAGE_NAME = "_click_default_help"
```

Add `-w` to `git blame` to ignore whitespace changes, and `-C` to follow lines moved from other files.

**The history of one function.** `git log -L` follows a line range through history ^[confirmed](https://git-scm.com/docs/git-log "2026-10-20"). The `:NAME:` form finds functions the way `git diff` finds hunk headers. By default that is a line that starts with a letter, `_` or `$`, so an indented Python method never matches. Git has a built-in `python` pattern, but you must turn it on with an attribute ^[confirmed](https://git-scm.com/docs/gitattributes "2026-10-20"). `.git/info/attributes` is private to your clone and never committed. Two ways that work:

```bash
git log -L '/def get_help_option_names/,+14:src/click/core.py' -s --format='%h %ad %s' --date=short | head -3
echo '*.py diff=python' >> .git/info/attributes
git log -L ':get_help_option_names:src/click/core.py' -s --format='%h %ad %s' --date=short | head -3
```

```text
047adef 2026-07-31 Preserve declaration order of help option names
ec258fe 2023-08-20 use modern typing features
0103c95 2021-04-23 add typing annotations
047adef 2026-07-31 Preserve declaration order of help option names
ec258fe 2023-08-20 use modern typing features
0103c95 2021-04-23 add typing annotations
```

Without the attribute, the second form fails with `fatal: -L parameter 'get_help_option_names' starting at line 1: no match`. We saw that error first.

### Callers and definitions {#callers}

```bash
rg -n '\bhandle_parse_result\(' src
```

```text
src/click/core.py:1373:            _, args = param.handle_parse_result(ctx, opts, args)
src/click/core.py:2730:    def handle_parse_result(
```

One definition, one caller. Useful `rg` flags: `-w` (whole word), `-F` (literal text, no regex), `--type py`, `-g '!tests'` (skip a folder). Remember what plain search cannot see: `getattr(obj, name)` with a computed name, registries keyed by strings, decorators that wrap a function, and module `__getattr__`. When search and the dynamic map disagree, the dynamic map wins for that run.

### The 15-minute tool map in one block {#one-block}

For a Python repo, in the agent's snapshot with its venv built. Replace the CAPITALS. History commands go to your clone (`git -C CLONE ...`).

```bash
git ls-files -z -- '*.py' | xargs -0 wc -l | sort -n | tail -8
rg -n '^\[project\.(scripts|gui-scripts|entry-points)' pyproject.toml; git ls-files '*__main__.py' '*conftest.py'
rg -n '^def __getattr__' --type py .
.venv/bin/python -m pytest --collect-only -q | tail -1
.venv/bin/python -m coverage run -m pytest -q TEST_ID && .venv/bin/python -m coverage json -q -o ../notes/one.json --include='PKG_GLOB'
python3 -I ~/polaris-tools/ranfuncs.py ../notes/one.json 'NAMES_ON_THE_PATH'; rm -f .coverage
python3 -I ~/polaris-tools/importgraph.py PKG_DIR | sed -n '/RUNTIME FAN-IN/,$p'
git -C CLONE log --since=2025-01-01 --format= --name-only -- SRC_DIR | sort | uniq -c | sort -rn | head -5
git -C CLONE log -S'TEXT_FROM_THE_ISSUE' --oneline
rg -n 'WORD_FROM_THE_ISSUE' PKG_DIR
```

### Write the 5-line map {#five-line-map}

Five lines. Each one cites a `file:line` you opened yourself.

```text
1. Entry: how a run starts -> FILE:LINE
2. Path: one request or test, 4-7 hops, each FILE:LINE (from the dynamic map, not from memory)
3. State: where data lives between calls -> FILE:LINE
4. Tests: the collected count, what config hides, what the path's tests never try
5. First guess: where the bug or change probably lives -> FILE:LINE, because EVIDENCE
```

Line 5 is a hypothesis, not a fact. Write it down anyway: in [[S7]] you compare it with the agent's guess, and you learn more when you were wrong on paper.

**Exit check:** five lines, each with a `file:line` you opened, plus a first guess.

## S3 Agent map: make every claim checkable {#s3-agent-map}

### Read-only first {#read-only}

Run the agent in a mode that cannot write. In `agy`, plan mode analyzes before it writes code, and Google recommends it for unfamiliar architecture ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20"). Checked against docs on 2026-10-20, not run. Whether `agy` plan mode blocks every write is a Day-1 check ([[start-here#day-1|Day-1 checklist]]). Gemini CLI's Plan Mode allows only read and search tools and can write only plan files ^[confirmed](https://geminicli.com/docs/cli/plan-mode/ "2026-10-20").

:::note title="You may not have Gemini CLI"
Since 2026-06-18, Gemini CLI is only for paid API keys and Code Assist Standard or Enterprise licenses ^[confirmed](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ "2026-10-20"). This page cites Gemini CLI's docs because they are detailed. The ideas carry over to `agy`, but check each one there ^[inference](- "2026-10-20").
:::

### The claims-table prompt {#claims-prompt}

Google's codelab starts with "Don't suggest any changes. Explain this codebase to me." ^[confirmed](https://codelabs.developers.google.com/genai-for-dev-cli-dev-use-cases "2026-10-20"). That is a good start, but an essay cannot be checked line by line. Ask for claims in the same JSON shape as Lab A's `claims.json`. Then [`checkquotes.py`](#checkquotes) can test half of each claim for you.

```text
Map this repository. Do not change any file.
Do not use the network, git history, or other copies of this project.
Do not rely on what you remember about this project: this may be a different version.
Use only files you open in this workspace.

Return JSON only, in this shape:
{"claims": [{"id": "C01", "claim": "...", "file": "path", "line": 12,
             "expected_text": "the exact text of that line, or a part of it",
             "sure": true}]}

At most 20 claims. Cover:
1. entry points;
2. the path of one call from INPUT to OUTPUT, one claim per hop;
3. where state is stored between calls;
4. how tests are configured: what runs, what is skipped or deselected, what makes a test fail;
5. what the tests do not cover on that path.
Set "sure": false when you are unsure. An unsure claim is better than a wrong one.
```

Then a second prompt for the task itself:

```text
Read ISSUE_FILE. List the files and functions on its path, as more claims in the same JSON shape.
For each one, say what evidence in the code put it on the path.
```

Save both answers in your notes as `repo-map.json`. Do not judge them yet. Chapter 2 ([[S3]]) and the Lab A README call this file `repo-map.md`. It is the same step. Here it is JSON so that `checkquotes.py` can read it.

### Why a long context is not a map {#long-context}

Google's long-context guide says finding one fact in a long context works about 99% of the time. When you need several facts at once, "the model does not perform with the same accuracy". It also says 1M tokens is about 50,000 lines of code ^[confirmed](https://ai.google.dev/gemini-api/docs/long-context "2026-10-20"). A map is many facts at once. So expect misses even when the whole repo fits ^[inference](- "2026-10-20"). Two more limits in Gemini CLI: `@DIR` passes only the folder's path, and the model explores from there with its tools. Git-ignored files are left out by default ^[confirmed](https://geminicli.com/docs/reference/commands "2026-10-20"). So generated or ignored files can be invisible to the agent, and it may say they do not exist.

**Exit check:** `repo-map.json` is saved, with a `file`, `line` and quote on every claim.

## Large repos: split, merge, check the seams {#large-repos}

One session cannot hold a big repo well. The method has four steps.

**1. Split along your tool map.** Use the import graph, not only folder names. Modules that import each other a lot belong to one subagent. Here is the split we would use for click's 12,674 source lines ^[inference](- "2026-10-20"):

| Subagent | Modules | Lines |
|---|---|---|
| A, core | `core`, `parser`, `decorators`, `globals`, `exceptions`, `formatting`, `_utils` | 5,760 |
| B, terminal | `termui`, `_termui_impl`, `utils`, `_compat`, `_winconsole`, `_textwrap` | 3,749 |
| C, edges | `types`, `testing`, `shell_completion`, `__init__` | 3,165 |
| D, tests | `tests/` | 14,753 |

**2. One read-only subagent per part.** Gemini CLI has a built-in `codebase_investigator`. You force it by starting the prompt with `@codebase_investigator`. A subagent works in its own context and returns only its findings, and subagents cannot call other subagents ^[confirmed](https://geminicli.com/docs/core/subagents/ "2026-10-20"). `agy` has a built-in `research` subagent. Its subagents do **not** inherit the parent's conversation, and a custom subagent's `tools` field defaults to none ^[confirmed](https://antigravity.google/docs/subagents/ "2026-10-20"). Checked against docs on 2026-10-20, not run. So paste the full rules into every subagent prompt. Claude Code's guidance is the same idea: investigate in subagents, so the research stays out of the main context ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20").

```text
You map one part of a larger repository. Do not change any file. No network, no git history.
Open only these files: FILE_LIST.
Return at most 15 claims, in the same JSON shape as the whole-repo map prompt.
Include: what this part exports that other parts use, and what it imports from other parts,
each with file:line on both ends when you can see both. Mark claims about other parts "sure": false.
```

**3. Merge in a fresh session.** Give it only the subagents' JSON files and the cross-part edges from your import graph:

```text
Merge these maps into one claims list. Do not open any repository file.
List every contradiction between two maps, citing both claims.
List every cross-part call, with both ends. Keep the "sure" flags; never upgrade one.
```

**4. Check the seams first.** The **seams** are the edges between parts, where no single subagent saw both ends. Contradictions between maps are free leads: at least one side is wrong. Then check the bug's path, as in [[S4]].

Gemini CLI's subagent docs give defaults of 30 turns and 10 minutes for custom subagents ^[confirmed](https://geminicli.com/docs/core/subagents/ "2026-10-20"). If a subagent stops at its limit, its map is partial. Ask it what it did not read.

## S4 Check the map: risk first {#s4-check}

### The two-part rule {#two-part-rule}

A claim is **right** only if both are true:

1. the quoted text is at that `file:line`, and
2. the sentence is true of the code.

Part 1 is mechanical. Part 2 needs a tool and your judgment. A matching quote proves only that the agent read the line. It does not prove that the agent understood it.

### checkquotes.py: automate part 1 {#checkquotes}

```python
"""Is each claim's quoted text really at its file:line? Usage: python3 checkquotes.py claims.json [REPO_DIR]"""
import json, sys
from pathlib import Path

claims = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["claims"]
repo = Path(sys.argv[2] if len(sys.argv) > 2 else ".")
bad = 0
for c in claims:
    path, quote = repo / c["file"], c["expected_text"].strip()
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    actual = lines[c["line"] - 1].strip() if 0 < c["line"] <= len(lines) else "<no such line>"
    found = [n for n, text in enumerate(lines, 1) if quote in text]
    ok = quote in actual
    bad += not ok
    print(f'{c["id"]} {"quote ok" if ok else "MISMATCH"} {c["file"]}:{c["line"]}  {actual[:60]}'
          + ("" if ok else f'  (quote found at: {found or "nowhere"})'))
print(f"{bad} of {len(claims)} quotes are not at their line. A quote that matches does not make the claim true.")
sys.exit(1 if bad else 0)
```

On two demo claims about click (not the drill's claims):

```text
D1 quote ok src/click/core.py:60  _HELP_OPTION_STORAGE_NAME = "_click_default_help"
D2 MISMATCH src/click/parser.py:224  class _OptionParser:  (quote found at: nowhere)
1 of 2 quotes are not at their line. A quote that matches does not make the claim true.
```

D2 is a memory-shaped claim. The class exists, but under a private name. The public name is only a deprecated alias, served by `parser.py:503`. In Lab A, judge part 1 by hand first, with `sed -n 'LINEp' FILE`. The lab trains that skill. Run the script afterwards as a cross-check.

### Risk order {#risk-order}

You will not check 20 claims carefully. Score them and check the top first. The points are our own rule of thumb ^[inference](- "2026-10-20"):

| Signal | Points |
|---|---|
| On the path of the issue, by your dynamic map | 3 |
| Contradicts your tool map | 3 |
| Your fix plan would depend on it | 2 |
| Names an API, flag, test, file, package or version | 1 |
| Uses "always", "never", "only", "all" or "none" | 1 |
| Marked unsure | 1 (resolve it; do not skip it) |

Check at least 5, highest score first. Then check 2 low-score claims too. A risk-ordered sample tells you about the risky claims. It does not give the map's overall error rate. Do not quote one ([[grader-validity]] explains sampling frames).

### A deterministic check for each kind of claim {#claim-checks}

| The claim says | Check it with |
|---|---|
| X is at `file:line` | `sed -n 'LINEp' FILE`, `rg -n 'X'` |
| F calls G | `rg -n '\bG\('`, then the [dynamic map](#dynamic-map) or a breakpoint (`breakpoint()`, `pdb`) |
| Flag `--x` exists | `PROGRAM --help`, or `rg` the argument definitions |
| Function or parameter exists | `python -c 'import inspect, PKG.MOD as m; print(inspect.signature(m.NAME))'` |
| Test T exists or covers F | `pytest --collect-only -q`, then [`whoruns.py`](#who-runs) |
| "Never", "always", "only" | `rg` for a counterexample; a 3-line experiment; a property test |
| Dead code | coverage of the full suite, `rg` for the name, and the `__getattr__` and registry check |
| A dependency or version | `pyproject.toml`, the lock file, `uv pip show NAME` |
| A config default | Print the loaded value: `python -c 'from PKG import config; print(config.load())'` |
| Behavior | A tiny experiment in a scratch folder, with real input |

Write one line per claim in your notes:

```text
D2 | wrong | sed -n '224p' src/click/parser.py | the line is class _OptionParser:, not class OptionParser:; that name is only a deprecated alias (parser.py:503)
```

### Gate 2 {#gate-2}

**Gate 2:** if 2 or more claims on the bug's path are wrong, stop trusting the agent's map of that area. Map it by hand. Then start a **new** session and give it your checked map, so it does not keep building on its own wrong one. Wrong claims are also data: each one is a row for your mistake log ([[M8]], or [[M1]] for an invented API) and a possible task idea.

## S5 Rule file {#s5-rule-file}

A **rule file** (`AGENTS.md` or `GEMINI.md`) holds the commands and limits an agent must follow in this repo. `agy` reads both names ^[confirmed](https://antigravity.google/docs/cli/gcli-migration "2026-10-20"). Chapter 4 explains it line by line ([[change#rule-file|the rule file, line by line]]). For the map phase, add three rules:

- "Cite file:line for every claim. Quote the line. Say unsure when unsure."
- "Do not look for this fix online, in git history or in other copies of this project. Build it yourself." Asking agents to build the solution themselves cut shortcut attempts to 9.4–14.2% on SWE-bench Multilingual and 0.9–10.3% on DeepSWE in one study ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20").
- "Do not edit files under tests/ or any test config file unless I ask." Name the config files you hashed in S1.

Do not paste your whole map into the rule file. Unchecked claims there become instructions.

Two loading traps. Gemini CLI loads `GEMINI.md` in layers: global, the workspace and its parent folders, and subfolders just in time ^[confirmed](https://geminicli.com/docs/reference/commands "2026-10-20"). So a stray rule file in a parent folder also loads. And you must confirm the file loaded: in Gemini CLI, `/memory show` prints the combined context. For `agy`, use the test in the [[start-here#day-1|Day-1 checklist]]. Keep the rule file out of the diffs you review: `echo AGENTS.md >> .git/info/exclude`.

**Exit check:** the agent quotes your test command back in a new session.

## How agents mis-map {#how-agents-mis-map}

Most wrong maps are not random. They come from a few causes. Learn the causes, and you know where to look first.

| Pattern | What you see | Why it happens | Catch it with | Row |
|---|---|---|---|---|
| Version drift | Correct code for an older release | Training data has more of the old version | Run it; read the signature at your commit | [[M1]], [[M8]] |
| Plausible invention | A test, flag, function or package that "should" exist | Pattern completion | `--collect-only`, `--help`, `rg`, try the import | [[M1]] |
| Keyword matching | The fix lands where the issue's words appear | The issue text steers the search | The dynamic map of the reproduction | [[M2]] |
| Stale docs | A README, changelog or `versionchanged` note is quoted as current behavior | Docs describe the past or a plan | Read the code under the docstring; `rg` the imports | [[M8]] |
| Static blind spot | "X does not exist" or "nobody calls F" | `__getattr__`, registries, decorators, plugins, `conftest.py` hooks | The dynamic map; read the entry points | [[M8]] |
| Partial reading | The first match is read, the real one is missed | Big files; the agent stops early | Line-exact quotes; read the whole function | [[M8]] |
| Line drift | Right code, wrong line | Edits since it read the file, or recall | `sed -n 'LINEp'`, `checkquotes.py` | [[M8]] |
| Overgeneralization | "always", "never", "all callers" | One example becomes a rule | `rg` for a counterexample | [[M2]], [[M5]] |
| Config blindness | "All 2,000 tests pass" when 31,000 were deselected | Config is read less than code | The summary line and the config table | [[M6]] |

The patterns and their names are our own taxonomy ^[inference](- "2026-10-20"). Real examples:

- **Partial reading.** `core.py` has three `def main(` lines: 1465, 1475 and 1484. The first two are `@t.overload` stubs that only describe types. The body is at 1484. An agent that stops at the first match quotes a stub.
- **Version drift in Google's own docs world.** Gemini CLI's docs say the `--checkpointing` flag was removed in version 0.11.0 ^[confirmed](https://geminicli.com/docs/cli/checkpointing/ "2026-10-20"). A popular tips repo by a Google engineer still tells you to use it ^[confirmed](https://github.com/addyosmani/gemini-cli-tips "2026-10-20"). Humans drift too. Check the version you have.
- **Keyword matching.** One study hand-checked 150 failed SWE-bench Verified runs. Its *localization* failures (failures to find the code to change) include misleading issues and shallow matching on keywords ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20").
- **Plausible invention at scale.** In one study, 16 code models generated 576,000 code samples from two prompt datasets in two languages. The average share of package names that did not exist was at least 5.2% for commercial models and 21.7% for open models ^[confirmed](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen "2026-10-20").
- **Memory instead of code.** o3 named the buggy file from the issue alone up to 76% of the time on SWE-bench Verified ^[confirmed](https://arxiv.org/abs/2506.12286 "2026-10-20"). A right answer from memory looks exactly like a right answer from reading, until the repo differs from what the model remembers.

One more rule: **your own memory is not a deterministic tool either.** If you "know" how a library works, that knowledge is from some version. Check it at this commit, the same way you check the agent.

## Read TypeScript and Go for a map {#read-ts-go}

Most of DeepSWE's 113 tasks are TypeScript (35), Go (34) or Python (34). The other 10 are JavaScript and Rust ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20"). You need to read the first two well enough to check a map. Chapter 10 has the full method for unfamiliar stacks ([[unfamiliar-stacks]]) and a longer Go table ([[unfamiliar-stacks#go-syntax-map|Go syntax map]]).

### TypeScript for a Python person {#ts-syntax-map}

| Python | TypeScript | Read it as |
|---|---|---|
| `x = 1` | `const x = 1` or `let x = 1` | `const` cannot be reassigned, but the object it points to can still change |
| `def f(a: int) -> str:` | `function f(a: number): string {` | Types come after names. All of them vanish at runtime. |
| `lambda a: a + 1` | `(a) => a + 1` | An arrow function. With `{ }` as the body, it needs `return`. |
| `None` | `null` and `undefined` | Two "nothing" values. A missing property is `undefined`. |
| `d if x is None else x` | `x ?? d` | Falls back only for `null` and `undefined` |
| `x or d` | `x || d` | Falls back for every falsy value: `0`, `""`, `NaN`, `false` |
| chained `getattr(o, "a", None)` | `o?.a?.b` | Optional chaining: stops at `null` or `undefined` |
| `==` | `===` | Strict equality. `==` converts types: a red flag in a diff. Objects compare by identity. |
| `TypedDict` or `Protocol` | `interface User { id: string; age?: number }` | A shape for the type checker only. `?` means optional. |
| `typing.cast(T, x)` | `x as T`, or `x!` (not null) | No runtime check at all |
| `Literal["a", "b"]` | `type Mode = "a" | "b"` | A union of literal types |
| `from .mod import a` | `import { a } from "./mod.js"` | When `tsc` compiles with `module: nodenext`, you write the output extension: `./mod.js` means `mod.ts`. When Node runs `.ts` directly, you write `./mod.ts`. |
| `__all__` | `export`, `export default` | A name that is not exported is private to its file |
| `async def`, `await` | `async function`, `await` | Returns a Promise. A missing `await` gives a Promise, which is truthy. |
| `for x in xs` | `for (const x of xs)` | `for (const k in xs)` gives the keys, as strings |
| `{**a, "k": v}`, `[*a, *b]` | `{ ...a, k: v }`, `[...a, ...b]` | Spread: a shallow copy |
| `except E as e` | `catch (e) { }` | One catch block for every error type. Under `strict`, `e` has type `unknown`. |
| `int`, `float` | `number` | Always a 64-bit float. Use `bigint` for big integers. |

### TypeScript traps, run on Node 22 {#ts-traps}

Each line below behaves differently from the Python you would expect. Real output, Node v22.21.1, run directly with type stripping:

```ts
interface User { id: string; age?: number }

const u = JSON.parse('{"id": 7}') as User;           // no check at runtime
console.log("1", typeof u.id, u.age);
console.log("2", [10, 9, 1].sort());                  // sorts as strings
console.log("3", -7 % 3, Math.floor(-7 / 3));
console.log("4", 0 || 5, 0 ?? 5, "" || "d", null ?? "d");
console.log("5", [1] === [1], 1 === 1);
for (const k in ["a", "b"]) console.log("6", k, typeof k);
console.log("7", new Date(Date.UTC(2026, 2, 1)).toISOString());
async function ready(): Promise<boolean> { return false; }
if (ready()) console.log("8 a Promise is truthy");
console.log("9", 0.1 + 0.2, 2 ** 53 + 1);
```

```text
1 number undefined
2 [ 1, 10, 9 ]
3 -1 -3
4 5 0 d d
5 false true
6 0 string
6 1 string
7 2026-03-01T00:00:00.000Z
8 a Promise is truthy
9 0.30000000000000004 9007199254740992
```

What Python does instead: `sorted([10, 9, 1])` is `[1, 9, 10]`. `-7 % 3` is `2` in Python but `-1` in TypeScript. `2**53 + 1` is exact in Python. Line 1 is the big one: `as User` let a number through as a string. Line 7: JavaScript months start at 0, so `2` is March. That matters for every time-series task.

### Map a TypeScript repo {#map-ts}

- **Imports may not name the file you will open.** When `tsc` compiles with `module: node16` or `nodenext`, TypeScript makes you write the output file's extension. So `"./math.mjs"` refers to the source file `math.mts`, and `"./x.js"` usually means `x.ts` ^[confirmed](https://www.typescriptlang.org/docs/handbook/modules/theory.html "2026-10-20"). Read `tsconfig.json` to learn which rule the repo uses.
- **Aliases.** `compilerOptions.paths` in `tsconfig.json` maps names like `app/*` to folders. `tsc` does not rewrite these imports, so a bundler or runtime must apply the same mapping ^[confirmed](https://www.typescriptlang.org/tsconfig/#paths "2026-10-20"). Read `paths` before you trust any import.
- **Node's type stripping is stricter.** Node runs `.ts` files by stripping the types, and never checks them ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/typescript.html "2026-10-20"). We ran it: an import written as `"./math"` failed with `ERR_MODULE_NOT_FOUND`, so did `"./math.js"` with only `math.ts` present, and `"./math.ts"` worked. An `enum` failed with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript enum is not supported in strip-only mode`.
- **A quick import graph.** `rg -n "from ['\"]\.{1,2}/" src` lists the relative imports. Tests usually match `*.test.ts` or live under `test/` or `__tests__/`.

### Go for a map {#go-map}

Go has no hidden imports, but it has hidden entry points. These rows matter most when you check a map. Commands checked against docs on 2026-10-20, not run.

| What you need | Go | Check with |
|---|---|---|
| Packages | One directory is one package. Its import path is the `module` line of `go.mod` plus the directory. | `go list ./...` |
| Public names | A capitalized name is exported. Lowercase is private to the package. | — |
| A type's methods | `func (s *Server) Handle(...)`: `(s *Server)` is the receiver | `rg -n 'func \(\w+ \*?Server\)'` |
| Who implements an interface | Implicit: a type with the methods satisfies it. There is no `implements`. | `rg` the method names |
| Hidden start-up code | `func init()` runs before `main`. A package may have several, and nothing can call them by name ^[confirmed](https://go.dev/ref/spec "2026-10-20"). | `rg -n '^func init\('` |
| Side-effect imports | `import _ "lib/math"` imports a package only for its initialization ^[confirmed](https://go.dev/ref/spec "2026-10-20") | `rg -n '^\s*(import\s+)?_ "'` |
| Program start | `func main()` in package `main` ^[confirmed](https://go.dev/ref/spec "2026-10-20") | `rg -n '^package main$'` |
| Import limits | Code in or below `internal/` can be imported only by code that shares the path above `internal` ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20") | — |
| Tests | `*_test.go`. A package named `foo_test` is compiled as a separate package. `testdata/` and files starting with `_` or `.` are ignored by the go tool. ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20") | `go test -list '.*' ./...` lists top-level tests and runs none |
| Import graph | `go list -f '{{.ImportPath}}: {{join .Imports " "}}' ./...` (`join` calls `strings.Join`) ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20") | — |
| Dynamic map | `go test -count=1 -run '^TestX$' -coverprofile=c.out ./PKG`, then `go tool cover -func=c.out` ^[confirmed](https://go.dev/blog/cover "2026-10-20") | per-function coverage |

We tested the three `rg` patterns from this table on a small Go file. They matched the method lines, the `init` function, and blank imports in both forms: `import _ "lib/math"` on one line, and `_ "image/png"` inside `import ( ... )`.

## Lab A: Map Check {#lab-a}

[[lab:lab-a]] gives you `tallyhub`, a small realistic Python service of about 850 lines, and 12 claims a coding agent might make about it. Some are right. Some are wrong in the ways from [the table above](#how-agents-mis-map). You judge each one with evidence from a tool. It trains [[S2]] to [[S6]]: tool map, agent map, check the map, rule file and a reproduction test.

- **Time box:** 60 minutes, plus a 15-minute stretch. The claim check itself is 20 minutes, timed.
- **Start:** from the playbook folder, `bash labs/make_practice.sh lab-a`. It copies the repo into a new temp folder with fresh git and prints the path. Open your agent **only** there, never in the playbook folder: that folder holds `claims.json` and, during the build, the answer keys ([[M7]]).
- **Use this chapter's tools:** the [dynamic map](#dynamic-map) of the test the lab names, and the [import graph](#import-graph) on the `tallyhub` folder. Judge part 1 of each claim by hand, then cross-check with `checkquotes.py`.
- **Part 2 prompt:** use this chapter's [claims-table prompt](#claims-prompt) instead of the README's prompt, and save the answer as `repo-map.json`. Where later parts of the README say `repo-map.md`, use that file.
- **Score:** against your local answer keys. 12 of 12, every verdict with one line of evidence. Log every miss with its type and the step that should have caught it.

Chapter 2's worked example uses the same repo's planted bug. Do Lab A first if you want it fresh.

## Use the map as a task designer {#task-designer}

Your map is also a measuring tool for the tasks you build ([[task-design]]). Three uses. The method is ours ^[inference](- "2026-10-20"):

- **Issue-only probe.** Give a model only the issue text: no repo, no tools. Ask which file and function it would change. If it is right, a task built on this issue may be solvable from memory. Try it in the [issue-only drill](#drill-issue-only-probe). Chapter 7 turns this into a check for your own task ([[task-design#memorization-probe|memorization probe]]).
- **Localization difficulty**, meaning how hard it is to find the code to change. Run the reference fix's test under coverage, as in the [dynamic map](#dynamic-map). Count the files and hops on its path, and the seams it crosses. One file and one hop means the finding part is shallow, so the task's difficulty must come from somewhere else.
- **Transcript check.** Find each claim the agent made about a file before it opened that file. That claim came from memory. Tag it [[M8]], phase "localize", in your transcript audit ([[S14]]).

Each wrong claim you catch this way is also a task idea: a place where models guess instead of read.

## Drills {#drills}

:::drill id="click-drill" title="Map click 8.5.0 and judge 10 agent claims" time="90 min"
A real, mid-size open-source repo at a pinned commit: pallets/click `8b19813f2bfca99f1018a587a8cf54fc959f2e5d`, the 8.5.0 release. The commit is dated 2026-08-21, and its CHANGES.md says 8.5.0 was released on 2026-08-24. About 12,700 lines of code and 14,800 lines of tests. You need network access for the clone and the installs.

**1. Set up the two copies (10 min).** If you followed S0 and S1 above, you already have this layout: skip to step 2.

```bash
D=$(mktemp -d -t click-drill); mkdir "$D/notes" "$D/private"; cd "$D"
git clone -q https://github.com/pallets/click.git hist
git -C hist checkout -q 8b19813f2bfca99f1018a587a8cf54fc959f2e5d
git -C hist rev-parse HEAD
mkdir agent && git -C hist archive HEAD | tar -x -C agent
cd agent && git init -q && git add -A
git -c user.name=practice -c user.email=practice@example.invalid commit -qm "click 8.5.0 snapshot"
uv venv -q --python 3.13 .venv
uv pip install -q --python .venv/bin/python -e . pytest==9.1.1 coverage==7.16.2 pluggy==1.6.0 iniconfig==2.3.1 packaging==26.3 pygments==2.21.0
.venv/bin/python -c 'import click; print(click.__file__)'
```

`rev-parse` must print `8b19813f2bfca99f1018a587a8cf54fc959f2e5d`. Run the [visibility audit](#visibility-audit) in `agent/`: you should see `commits=1 tags=0 remotes=0 reflog=1 stashes=0 files=166`.

**2. Baseline (5 min).** Run the suite twice, as in [S1](#summary-line). On macOS we got `1990 passed, 25 skipped, 31000 deselected, 1 xfailed` both times. Read the whole pytest table in `pyproject.toml`.

**3. Tool map (20 min).** Run [the one block](#one-block) with `TEST_ID=tests/test_basic.py::test_int_option`, `PKG_DIR=src/click`, `PKG_GLOB='src/*'`, `SRC_DIR=src` and `CLONE=$D/hist`. Skip the two lines about the issue: this drill has none. Write your 5-line map in `$D/notes/map.md`.

**4. Agent map (15 min; required if you have `agy` or another agent).** Run the [boundary test](#canaries) first: if it fails, the agent can read `$D/hist`, so follow the [snapshot section](#snapshot)'s advice. Open your agent in `$D/agent` only, read-only. Use [the claims-table prompt](#claims-prompt) with "the path of one call from `CliRunner().invoke(cli, ['--i', '5'])` to the callback". Save the answer as `$D/notes/repo-map.json`.

**5. Judge these 10 claims (25 min, timed).** They are example agent claims, written for this guide. Not real model output. Save them as `$D/notes/claims.json`:

```json
{
  "repo": "pallets/click at 8b19813f2bfca99f1018a587a8cf54fc959f2e5d (8.5.0)",
  "note": "Example agent claims, written for this guide. Not real model output.",
  "claims": [
    {"id": "K01", "claim": "Click has no runtime dependencies. It needs Python 3.10 or newer.", "file": "pyproject.toml", "line": 16, "expected_text": "requires-python = \">=3.10\""},
    {"id": "K02", "claim": "On Windows, colors go through colorama, which Click uses when it is installed.", "file": "src/click/utils.py", "line": 297, "expected_text": "Support colors on Windows if colorama is installed."},
    {"id": "K03", "claim": "To test stderr separately, create the runner with CliRunner(mix_stderr=False).", "file": "src/click/testing.py", "line": 360, "expected_text": "def __init__("},
    {"id": "K04", "claim": "The current Context lives on a thread-local stack; push_context appends to it.", "file": "src/click/globals.py", "line": 46, "expected_text": "_local.__dict__.setdefault(\"stack\", []).append(ctx)"},
    {"id": "K05", "claim": "Under pytest in this repo, warnings become errors, so a test that touches a deprecated name fails unless it expects the warning.", "file": "pyproject.toml", "line": 86, "expected_text": "\"error\","},
    {"id": "K06", "claim": "Group is a subclass of MultiCommand, which holds the shared subcommand logic.", "file": "src/click/core.py", "line": 1649, "expected_text": "class Group(MultiCommand):"},
    {"id": "K07", "claim": "A top-level Context uses --help as its only help option name by default.", "file": "src/click/core.py", "line": 455, "expected_text": "help_option_names = [\"--help\"]"},
    {"id": "K08", "claim": "With auto_envvar_prefix=\"APP\", an option named count also reads APP_COUNT.", "file": "src/click/core.py", "line": 3533, "expected_text": "envvar = f\"{ctx.auto_envvar_prefix}_{self.name.upper()}\""},
    {"id": "K09", "claim": "CliRunner.invoke runs the command in a child process, so a test cannot change global state.", "file": "src/click/testing.py", "line": 687, "expected_text": "return_value = cli.main(args=args or (), prog_name=prog_name, **extra)"},
    {"id": "K10", "claim": "Shell completion is registered for four shells: bash, fish, powershell and zsh.", "file": "src/click/shell_completion.py", "line": 555, "expected_text": "_available_shells: t.Final[dict[str, type[ShellComplete]]] = {"}
  ]
}
```

Use the [two-part rule](#two-part-rule). Run `checkquotes.py` on the file. Then settle every claim whose quote matched with a tool: `rg`, `sed`, `--collect-only`, or a 3-line experiment. Do not use your own memory of click. Write one line per claim in `$D/notes/judgments.md`: id, right or wrong, the command, what you saw.

**6. Compare (10 min).** If you ran an agent: which of its claims were wrong, and which row of [the mis-map table](#how-agents-mis-map) explains each one?

:::reveal title="Show the answers, with the evidence we captured"
Five are right (K01, K04, K05, K08, K10). Five are wrong (K02, K03, K06, K07, K09). `checkquotes.py` flags only two of the wrong ones:

```text
K06 MISMATCH src/click/core.py:1649  class Group(Command):  (quote found at: nowhere)
K07 MISMATCH src/click/core.py:455  else:  (quote found at: [456])
2 of 10 quotes are not at their line. A quote that matches does not make the claim true.
```

| Claim | Verdict | Evidence (real output) |
|---|---|---|
| K01 | right | `rg -n '^dependencies' pyproject.toml; echo "exit=$?"` prints `exit=1`: no dependencies key. Line 16 is `requires-python = ">=3.10"`. |
| K02 | **wrong**: stale docs | The quote is real, but it is a 2.0 changelog note inside a docstring. `sed -n '282,283p' src/click/utils.py` shows `.. versionchanged:: 8.5.0` and `Colorama is no longer used for color on Windows.` `rg -n 'import colorama|from colorama' src` gives exit 1. |
| K03 | **wrong**: version drift | `CliRunner(mix_stderr=False)` raises `TypeError: CliRunner.__init__() got an unexpected keyword argument 'mix_stderr'`. The docstring at `testing.py:350-351` says the parameter was removed in 8.2. |
| K04 | right | `globals.py:4` is `from threading import local`, `globals.py:9` is `_local = local()`, and line 46 appends to `_local`'s stack. |
| K05 | right | `pyproject.toml:85-87` is `filterwarnings = ["error"]`. A one-line test that reads `click.__version__` failed under the repo's config with `DeprecationWarning`, and passed with `-c /dev/null` ("1 passed, 1 warning"). This is the fourth setting from [S1](#pytest-config). |
| K06 | **wrong**: version drift | Line 1649 is `class Group(Command):`. `click.Group.__mro__` is `['Group', 'Command', 'object']`. Since 8.2, `_MultiCommand` is a deprecated subclass of `Group` (`core.py:2112`), not its parent. Note: `issubclass(click.Group, MultiCommand)` returns `True`, because of `_FakeSubclassCheck` (`core.py:1634`), a shim that keeps old `isinstance` and `issubclass` checks working. The real base is `Command` (line 1649 and `__mro__`), and the subcommand logic lives in `Group`. A right tool can still give you a wrong conclusion. |
| K07 | **wrong**: line drift | The fact is true, but line 455 is `else:`. The quote is at line 456. Record it as a bad citation, fix the line, keep the fact. |
| K08 | right | Experiment: `CliRunner().invoke(cli, [], auto_envvar_prefix="APP", env={"APP_COUNT": "7"})` printed `count=7`. |
| K09 | **wrong**: right quote, wrong sentence | Line 687 calls `cli.main(...)` in the same process. The same experiment printed the same process id for the command and the test (`pid=72543`). The class docstring says it "changes the global interpreter state". |
| K10 | right | `python -c 'from click.shell_completion import _available_shells as s; print(sorted(s))'` printed `['bash', 'fish', 'powershell', 'zsh']`. PowerShell is new in 8.5.0. If your memory said three shells, your memory was the wrong map. |

Our 5-line map:

```text
1. Entry: a library; no console script (rg exit 1); public names in src/click/__init__.py;
   deprecated names served by module __getattr__ (__init__.py:76, core.py:3778, parser.py:503, utils.py:669).
2. Path: CliRunner.invoke -> cli.main (testing.py:687) -> Command.main (core.py:1484)
   -> make_context (core.py:1551) -> parse_args (core.py:1362) -> _OptionParser.parse_args (core.py:1370)
   -> handle_parse_result per parameter (core.py:1373) -> ctx.invoke(callback) (core.py:1415).
3. State: one Context per invocation (core.py:208), on a thread-local stack (globals.py:9, globals.py:46).
4. Tests: 33,016 collected, 2,016 selected; addopts deselects 31,000 stress tests (pyproject.toml:91);
   warnings are errors (pyproject.toml:86); the 25 skips are Windows-only or filesystem-specific on macOS.
5. Hotspot: core.py: 30% of source lines, 79 of 223 src commits since 2025-01-01, runtime fan-in 3;
   for an option bug, read Parameter and Option first (core.py:2187-3662).
```
:::

**Done when:** `judgments.md` has 10 lines, each with a command and what it showed. At least 9 of 10 verdicts match the answer table, judged in 25 minutes or less. Each miss is a row in `$D/notes/mistakes.csv` (type, step that should have caught it, minutes). Your 5-line map cites a `file:line` on every line. If you ran step 4, every wrong claim from your agent is also a row in `mistakes.csv`, tagged with its mis-map pattern.
:::

:::drill id="worktree-leak" title="See a worktree leak the future fix" time="15 min"
Use your click clone (`$D/hist`) from S0 or the click drill.

1. Add a worktree at `8.4.0` and run the commands from [the worktree section](#worktree-leak), from `git -C hist worktree add` on. Confirm `rg exit=1` and the `3495fba` line.
2. Run `git show --stat 3495fba` in the worktree. Note which test files the fix changed, and how many test lines it added. An agent could copy those too.
3. Make a snapshot of `8.4.0` with `git archive` and fresh git. Run the visibility audit in both folders.
4. Remove the worktree.

**Done when:** your `audit.md` shows both audit lines, and you can say in one sentence why a worktree is not isolation.
:::

:::drill id="issue-only-probe" title="Does a model know click #2819 without the repo?" time="15 min"
[Issue #2819](https://github.com/pallets/click/issues/2819) in pallets/click was opened in December 2024 ^[confirmed](https://github.com/pallets/click/issues/2819 "2026-10-20"). Commit `3495fba` fixed it in July 2026. You need your clone (`$D/hist`) and a chat model with no files and no tools.

1. Copy only the issue's title and body.
2. In a new chat, paste the text and ask: "Which file and function in this project would you change to fix this? Give a path and a function name." Save the answer in `$D/notes/probe.md`.
3. Compare with the real fix: `git -C "$D/hist" show --stat 3495fba`, then `git -C "$D/hist" show 3495fba -- src/click/core.py | rg '^@@'`. Each `@@` line names the nearest function above a change.
4. Repeat in another new chat, with the project name removed from the text everywhere.

**Done when:** for both prompts, `probe.md` records whether the model named `src/click/core.py` and a function the fix changed, plus one sentence on what that means for a task built on this issue.
:::

:::drill id="predict-then-measure" title="Predict the --help path, then measure it" time="20 min"
In the click snapshot, write a 6-line test that calls `CliRunner().invoke(cli, ["--help"])` on a one-option command. Save it in `$D/scratch/`, not in the repo.

1. Before you run anything, write down 5 functions you expect to run, with their files.
2. Run it under coverage. Use `ranfuncs.py` with a regex such as `'help|format|main'`.
3. Mark each prediction hit or miss. Find one function that ran and that you did not predict.

**Done when:** you have a hit-or-miss list for your 5 predictions, and one surprise explained with a `file:line`.
:::

:::drill id="importgraph-cycles" title="Extend the import graph: two-way imports" time="20 min"
Add a "two-way imports" report to `importgraph.py`: every pair of modules that import each other, with each direction's tag. Write the test first. The test package already has three two-way pairs (`cli`/`core`, `core`/`store.base`, `core`/`util`). Assert one of them, and update the old last assertion.

:::reveal title="Show our extension and its output on click"
Three lines at the end of the script:

```python
pairs = dict(edges)
print("TWO-WAY IMPORTS:", *sorted(f"{a} <-> {b}  [{t or 'plain'} / {pairs[(b, a)] or 'plain'}]"
      for (a, b), t in pairs.items() if (b, a) in pairs and a < b), sep="\n  ")
```

Update the old test too, because the new report comes after `NO INTERNAL IMPORTER:`. Replace its last line with these three. We got `1 passed`.

```python
    tail = out.split("NO INTERNAL IMPORTER:")[1]
    assert tail.split("TWO-WAY IMPORTS:")[0].split() == []
    assert "pkg.core <-> pkg.store.base  [plain / plain]" in tail
```

```text
TWO-WAY IMPORTS:
  click._compat <-> click._winconsole  [plain / plain]
  click.core <-> click.decorators  [lazy / plain]
  click.core <-> click.exceptions  [plain / type-only]
  click.core <-> click.globals  [plain / type-only]
  click.core <-> click.parser  [plain / type-only]
  click.core <-> click.shell_completion  [lazy / plain]
  click.core <-> click.types  [plain / type-only]
  click.exceptions <-> click.utils  [plain / lazy]
```

Every two-way pair is broken by a lazy or type-only import, except `_compat` and `_winconsole`. That one is guarded by a platform check at `_compat.py:516`, which the script cannot see.
:::

**Done when:** your test passes, and you can explain why the `_compat` and `_winconsole` pair does not crash on import.
:::

:::drill id="big-repo-split" title="Stretch: split, map and merge with three subagents" time="45 min"
Use the click snapshot and the [split table](#large-repos).

1. Run one read-only subagent each for parts A, B and C, with the per-part prompt. Save three JSON files.
2. Merge them in a fresh session with the merge prompt.
3. Check the seams: pick 3 cross-part claims and 1 contradiction (if any). Judge each with a tool.

If your tool has no subagents, run three fresh sessions instead. That is the same idea.

**Done when:** you have one merged claims file, 4 judged seam claims, and one sentence on whether the split helped compared with one big session.
:::

:::drill id="ts-predict" title="Predict six TypeScript outputs" time="10 min"
Without running anything, write down what each line prints:

```ts
console.log([3, 20, 100].sort());
console.log(-5 % 2);
console.log(0 || "none", 0 ?? "none");
console.log(new Date(Date.UTC(2026, 0, 31)).toISOString().slice(0, 10));
for (const k in ["x", "y"]) console.log(k + 1);
console.log(("7" as unknown as number) + 1);
```

Then save them as `predict.ts` and run `node predict.ts` (Node 22.18 or newer).

:::reveal title="Show the answers"
```text
[ 100, 20, 3 ]
-1
none 0
2026-01-31
01
11
71
```

String sort; the sign of `%` follows the left side; `??` keeps `0`; month 0 is January; `for...in` gives string keys, so `"0" + 1` is `"01"`; `as` converts nothing, so `"7" + 1` is `"71"`. We ran it on Node v22.21.1.
:::

**Done when:** you got at least 5 of 6, and you can say for each miss which row of the [TypeScript table](#ts-syntax-map) explains it.
:::

:::drill id="lab-a-run" title="Lab A: judge 12 claims about tallyhub" time="60 min"
Do [[lab:lab-a]] as its README says. Use this chapter's [dynamic map](#dynamic-map) and [import graph](#import-graph) in Part 1. Time Part 3 strictly: 20 minutes.

**Done when:** all of the lab README's "Done when" boxes are ticked, and every miss against your local answer keys is in your mistake log with its type and the step that should have caught it.
:::

## Vibe coder vs senior engineer {#compare}

:::compare
- Opens the agent in the full clone, checked out at an old tag. || Gives the agent a history-free snapshot. Keeps the full clone for blame and churn.
- Reads "1990 passed" and moves on. || Reads every word of the summary line and the config behind it. Hashes every config file pytest could read.
- Asks "explain this codebase" and reads the essay. || Asks for a JSON claims table with `file:line` and quotes, and allows "unsure".
- Trusts the map because the file names look right. || Checks the claims on the bug's path first. Applies Gate 2.
- Reads the file list to see what matters. || Runs one test under coverage and reads which functions really ran.
- Searches for `def NAME`, finds nothing, and says it does not exist. || Checks module `__getattr__`, registries, decorators and plugins, then the dynamic map.
- Pastes the whole big repo into one session. || Splits by import clusters, maps with read-only subagents, merges, and checks the seams.
- Uses its own memory of the library as the truth. || Treats its own memory like the agent's: a guess until a tool confirms it at this commit.
:::

## Sources

- ^[confirmed](https://www.google.com/about/careers/applications/jobs/results/114077679900074694-research-engineer-polaris-deepmind "2026-10-19") Google Careers: Research Engineer, Polaris (job 114077679900074694).
- ^[confirmed](https://deepswe.datacurve.ai/blog/deepswe "2026-10-20") Datacurve: DeepSWE, behavior-level prompts and the language split.
- ^[confirmed](https://arxiv.org/abs/2509.13941 "2026-10-20") Liu et al.: an empirical study of failures in automated issue solving.
- ^[confirmed](https://arxiv.org/abs/2511.00197 "2026-10-20") Majgaonkar et al.: OpenHands, SWE-agent and Prometheus on SWE-bench; failed attempts usually find the right files.
- ^[confirmed](https://arxiv.org/abs/2506.12286 "2026-10-20") The SWE-Bench Illusion: file paths named from the issue text alone.
- ^[confirmed](https://www.mechanize.work/how-our-interview-process-works "2026-10-20") Mechanize: how its interview process works, and the traits it looks for (Mechanize's, not Polaris's).
- ^[reported](https://x.com/tamaybes/status/2105408224879116790 "2026-10-20") Tamay Besiroglu on X: recruiting for the Polaris team.
- ^[confirmed](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ "2026-10-20") Google Developers Blog: Gemini CLI moves to Antigravity CLI; who keeps Gemini CLI.
- ^[confirmed](https://github.com/pallets/click/issues/2819 "2026-10-20") pallets/click issue #2819, used in the issue-only probe.
- ^[confirmed](https://arxiv.org/abs/2609.06780 "2026-10-20") Ludwig et al.: shortcutting the fix (upstream lookup, git history, memory).
- ^[confirmed](https://github.com/SWE-bench/SWE-bench/issues/465 "2026-10-20") SWE-bench issue #465: repo-state loopholes during agentic evaluation.
- ^[confirmed](https://poolside.ai/blog/through-the-looking-glass "2026-10-20") Poolside: through the looking glass of benchmark hacking.
- ^[confirmed](https://cursor.com/blog/reward-hacking-coding-benchmarks "2026-10-20") Cursor: reward hacking on coding benchmarks.
- ^[confirmed](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen "2026-10-20") Spracklen et al.: package hallucinations by code LLMs.
- ^[confirmed](https://github.com/pallets/click/commit/8b19813f2bfca99f1018a587a8cf54fc959f2e5d "2026-10-20") pallets/click commit 8b19813, "Release version 8.5.0".
- ^[confirmed](https://github.com/pallets/click/releases/tag/8.5.0 "2026-10-20") pallets/click release 8.5.0 (the tag points to 8b19813).
- ^[confirmed](https://docs.pytest.org/en/stable/reference/customize.html "2026-10-20") pytest: configuration files, which one wins, never merged.
- ^[confirmed](https://coverage.readthedocs.io/en/latest/contexts.html "2026-10-20") coverage.py: measurement contexts, `dynamic_context = test_function`.
- ^[confirmed](https://coverage.readthedocs.io/en/latest/api_coveragedata.html "2026-10-20") coverage.py: the `CoverageData` API, `contexts_by_lineno`.
- ^[confirmed](https://git-scm.com/docs/git-log "2026-10-20") git-log: `-L` with line ranges and function names.
- ^[confirmed](https://git-scm.com/docs/gitattributes "2026-10-20") gitattributes: hunk headers, the built-in `python` and `golang` patterns, `$GIT_DIR/info/attributes`.
- ^[confirmed](https://ai.google.dev/gemini-api/docs/long-context "2026-10-20") Google: long context, single vs multiple facts, 1M tokens and lines of code.
- ^[confirmed](https://codelabs.developers.google.com/genai-for-dev-cli-dev-use-cases "2026-10-20") Google codelab: start by asking for an explanation, not changes.
- ^[confirmed](https://geminicli.com/docs/reference/commands "2026-10-20") Gemini CLI commands: `@` paths, ignored files, `/memory show`, `GEMINI.md` layers.
- ^[confirmed](https://geminicli.com/docs/cli/plan-mode/ "2026-10-20") Gemini CLI Plan Mode: read-only tools.
- ^[confirmed](https://geminicli.com/docs/core/subagents/ "2026-10-20") Gemini CLI subagents: `codebase_investigator`, limits.
- ^[confirmed](https://geminicli.com/docs/cli/checkpointing/ "2026-10-20") Gemini CLI checkpointing: the removed `--checkpointing` flag.
- ^[confirmed](https://antigravity.google/docs/cli/modes/ "2026-10-20") Antigravity CLI modes, plan mode and sandbox (docs; not run).
- ^[confirmed](https://antigravity.google/docs/subagents/ "2026-10-20") Antigravity subagents: `research`, no inherited history, `tools` default (docs; not run).
- ^[confirmed](https://antigravity.google/docs/changelog "2026-10-20") Antigravity changelog: Projects with repo boundaries, scoped permissions and Git worktrees (docs).
- ^[confirmed](https://antigravity.google/docs/cli/gcli-migration "2026-10-20") Antigravity CLI migration: reads `GEMINI.md` and `AGENTS.md` (docs).
- ^[confirmed](https://code.claude.com/docs/en/best-practices "2026-10-20") Claude Code best practices: investigate with subagents.
- ^[confirmed](https://www.typescriptlang.org/docs/handbook/modules/theory.html "2026-10-20") TypeScript handbook: module theory, output extensions in imports.
- ^[confirmed](https://www.typescriptlang.org/tsconfig/#paths "2026-10-20") TSConfig reference: `paths`.
- ^[confirmed](https://nodejs.org/docs/latest-v22.x/api/typescript.html "2026-10-20") Node.js 22: TypeScript type stripping.
- ^[confirmed](https://go.dev/ref/spec "2026-10-20") The Go language spec: `init` functions, blank imports, `main`.
- ^[confirmed](https://pkg.go.dev/cmd/go "2026-10-20") The go command: `go list`, `go test -list`, `internal`, `testdata`.
- ^[confirmed](https://go.dev/blog/cover "2026-10-20") The Go blog: the cover story, `go tool cover -func`.

:::check
- Make a history-free snapshot of any repo at any commit, and prove with one command line that it has 1 commit, no tags and no remotes.
- Explain what `deselected`, `skipped` and `xfailed` mean, and show how one empty file can change all three.
- Produce a dynamic map of one test and name every function on its path, with `file:line`.
- Write the prompt that makes an agent's map checkable, and judge 5 of its claims with the two-part rule in 10 minutes.
- Name five patterns of agent mis-mapping and the deterministic check for each.
- Read a 20-line TypeScript or Go function and point out every line whose meaning differs from the Python you would expect.
:::
