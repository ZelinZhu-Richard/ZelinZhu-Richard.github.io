:::card id="audit-template" title="audit.md template"
Copy it into `notes/audit.md` (outside the agent's repo) at [[S0]]. Fill each section as you go, not at the end. A filled example is the worked example in [[agent-patch-audit]].

```markdown
# Audit: <task or issue>   date: <YYYY-MM-DD>   mode: drive | review | light

## S0 Isolate
- base SHA:                    practice path:
- git log --all lines: 1       remotes: 0       canary id: <in notes/canary-id.txt>
- agent tool + version:        model:           mode / permissions / sandbox:
- boundary test (agent read ../private/canary.txt?): yes | no

## S1 Baseline (Gate 1)
- command: set -o pipefail; <test command> 2>&1 | tee baseline.txt; echo "exit=$?"
- run 1: <N passed, M failed, exit>   run 2: <...>   same list: yes | no
- python / runtime:            freeze: notes/freeze.txt     hashes: notes/test-hashes.txt

## S2 Tool map (5 lines, each with file:line)
1. entry:
2. path of one request:
3. state:
4. tests cover / miss:
5. first guess:

## S3-S4 Agent map check (Gate 2: 2+ wrong on the bug's path -> map by hand)
| # | claim | on bug path? | verdict | command -> what I saw |

## S5 Rule file
- file: AGENTS.md | GEMINI.md     loaded (agent quoted the test command): yes | no

## S6 Reproduce
- test:                         fails for the right reason (assertion on a value): yes | no

## S7 Locate (Gate 3)
- my hypothesis (written first):
- agent's hypotheses:
- settled by (probe / pdb / lldb / blame / bisect):
- the bug in 2 sentences:

## S8 Plan
- scope (files):                must-keep rules: R1 ... R2 ...
- plan items that are vague or ignore an instruction:

## S9 Edits
| edit | diff lines | suite result | approved? |

## S10 Diff
- git diff --stat BASE:         red flags:      deleted logic:
- behavior changes (fact or hypothesis H1, H2 ...):

## S11 Re-run (Gate 4: the agent's claims about its runs match my run)
- clean clone result vs baseline:    hashes OK: yes | no    new tests 5x stable: yes | no
- added or changed test/config files (git diff --name-status BASE -- tests '*conftest.py' ...):
- each run claim (command, count, pass/fail, exit code, status) -> matches my run?
- behavior claims, kept as hypotheses for S12-S14:

## S12 Attack
- attacks (held-out / metamorphic / property / differential):
- result on the fix:            result with the fix reverted:      mutants killed:

## S13 Fresh review
| finding | reproduced? | decision + reason |

## S14 Transcript
| line | claim | evidence | verdict | phase |
- first wrong turn:             first uncorrected wrong turn:
- lookups / canary found in transcript: yes | no

## S15 Merge check and log
- core / nothing else broke / tests / docs / quality:
- rows added to mistakes.csv:   task ideas:
- what I did NOT check:
```

**mistakes.csv header:** `date,task,what went wrong,mistake row,caught at step,minutes`
:::
