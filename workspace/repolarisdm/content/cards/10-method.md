:::card id="loop" title="The 5-move loop"
Use it on **every** change: an agent's, a colleague's or your own. Full method and a worked example: [[agent-patch-audit]].

| Move | Do | Minimum evidence |
|---|---|---|
| 1. Understand | Baseline twice. Map with tools. Let the agent map. Check its claims on the bug's path. | `baseline.txt` with an exit code; a 5-line map, each line with a file:line |
| 2. Reproduce | A failing test before any fix. | It fails on a value assertion, not an import error |
| 3. Hypothesize | Your guess first, then the agent's. Settle with a tool. | A probe, pdb/lldb or bisect result; the bug in 2 sentences |
| 4. Change or review | Small diffs, guardrails. Read the diff, not the summary. | `git diff --stat`; a list of every behavior change |
| 5. Challenge | Re-run it yourself. Attack the fix. | Clean-clone run vs baseline; attack tests; revert-the-fix check |

**Two rules**

- An agent's claim is a guess until a deterministic tool (git, `rg`, pytest, a compiler, a debugger) confirms it.
- A passing run is evidence, not proof. Say what you did not test.

**The loop in commands** (Python; replace the CAPITALS)

```bash
git status --short && git rev-parse --short HEAD
set -o pipefail; python -m pytest -rA 2>&1 | tee ../notes/baseline.txt; echo "exit=$?"
python -m pytest --collect-only -q | tail -1
rg -n 'WORD_FROM_THE_ISSUE' .
python -m pytest -q tests/test_ISSUE.py
python -c "from PKG.MOD import FUNC; print(FUNC('INPUT'))"
git diff --stat && git diff && python -m pytest -q
git add PKG/MOD.py tests/test_ISSUE.py && git commit -qm "fix ISSUE"
git checkout BASE -- PKG/MOD.py && python -m pytest -q tests/test_ISSUE.py; git checkout HEAD -- PKG/MOD.py
```

The last line is the revert-the-fix check: with the old file back, your new test must fail. Commit the fix first, because `git checkout HEAD` restores the committed version.

**Which mode**

- **Drive** (you run the agent): S0–S15.
- **Review** (someone else's diff and transcript): S0, S1 at the base SHA, S2–S4, S6, S10–S15.
- **Light** (small, low-risk): S1, S6, S10, S11. Go to the full audit if the diff touches tests, config or dependencies, deletes logic, is bigger than about 2 files or 50 lines, or will grade or train a model.
:::

:::card id="audit-steps" title="The full audit S0–S15"
Roles: **[Y]** you, **[D]** deterministic tool, **[A]** agent. Every step links to its section in [[agent-patch-audit]].

| Step | Who | Do | Exit check |
|---|---|---|---|
| [[S0]] Isolate | Y D | `mktemp -d` copy, fresh `git init`, no remotes; diff-review mode; sandbox; canary in `../private/`; start `audit.md` | 1 commit, 0 remotes, no canary in the repo |
| [[S1]] Baseline | D | `set -o pipefail; pytest -rA 2>&1 \| tee baseline.txt; echo "exit=$?"` twice; Python version; `pip freeze`; `shasum` of tests and config | **Gate 1:** no baseline, no agent |
| [[S2]] Tool map | Y D | `git ls-files` sizes; entry points; `--collect-only`; callers (`rg`); coverage of the issue's own request; blame/log | 5-line map + first guess |
| [[S3]] Agent map | A | Plan/read-only mode; file:line for every claim; "unsure" allowed; one subagent per folder in big repos | `repo-map.md` saved, not trusted |
| [[S4]] Check the map | Y D | At least 5 claims, the bug's path first; `sed -n 'Np'`, `rg`, `--help`, a tiny run | **Gate 2:** 2+ wrong on the path, map it by hand |
| [[S5]] Rule file | Y | `AGENTS.md`/`GEMINI.md` by hand: real test command, "don't edit tests", "stop and ask" | Agent quotes the test command back |
| [[S6]] Reproduce | Y D | Failing test from the issue, before any fix; commit it | Fails for the right reason |
| [[S7]] Locate | Y A D | Your guess, then the agent's; settle with a probe, pdb/lldb, blame, `git bisect run` | **Gate 3:** the bug in 2 sentences |
| [[S8]] Plan | A Y | "General fix, no special cases"; scope; compare with the checked map | Must-keep rules written down |
| [[S9]] Small edits | A D | Edit → diff → full suite; 2 failed corrections → rewind; long tasks: `spec.md` + `plan.md`, milestone audits | Each edit small and tested |
| [[S10]] Read the diff | Y D | `git diff --stat BASE`; every file; deleted lines; red-flag scan | Every behavior change listed |
| [[S11]] Re-run | D | Clean clone; full suite vs baseline; `shasum -c`; `git diff --name-status BASE -- tests '*conftest.py' pytest.ini tox.ini setup.cfg pyproject.toml`; new tests 5×; headless: read `status`; C++: sanitizers | **Gate 4:** the agent's claims about its runs match your run |
| [[S12]] Attack | Y D | Held-out cases; metamorphic, property, differential tests; revert-the-fix; hand mutants | Pass on fix, fail on old code |
| [[S13]] Fresh review | A Y | New session, spec + diff only; Critic, Challenger, Auditor; reproduce each finding in old and new | Each finding reproduced or dropped |
| [[S14]] Transcript | Y | Claims table; match to real output; lookup and canary search; first (uncorrected) wrong turn; phase | Claims table + first wrong turn |
| [[S15]] Merge + log | Y | Core, nothing else broke, tests, docs, quality; `mistakes.csv`; task ideas | Rows logged, one task idea |

**The four gates.** 1: no baseline, no agent. 2: two wrong claims on the bug's path, map it yourself. 3: no two-sentence explanation, no fix. 4: every claim the agent made about its runs (commands, counts, pass or fail, exit codes, `status`) must match your own run; if one does not, treat everything else it said as unverified. Its claims about behavior or scope stay hypotheses for S12–S14.
:::
