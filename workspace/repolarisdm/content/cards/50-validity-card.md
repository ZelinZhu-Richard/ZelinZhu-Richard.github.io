:::card id="validity-card" title="Grader Validity Card template"
A one-page record of the evidence behind a grader. Raw outcomes first. Every number has a frame. Background and a worked example: [[grader-validity#validity-card|the card section]] and [[grader-validity#sampling-frames|sampling frames]].

**The three frames** (never pool them):

| Frame | Report | Never report |
|---|---|---|
| Hand-picked corpus | counts: "rejected 12 of 12" | a rate, an interval |
| Census of an enumerated space | exact rate over that space | a sampling interval; claims outside the space |
| Random sample of a defined space | rate + Wilson 95% interval + the frame | claims outside the space |

**Wilson 95%:** p = k/n, z = 1.96, denom = 1 + z²/n, center = (p + z²/(2n)) / denom, half = (z / denom) × √(p(1 − p)/n + z²/(4n²)).

```markdown
# Grader Validity Card: <task>    grader: <commit>    spec: <commit>    date: <YYYY-MM-DD>

## 1. What the grader claims
- Reward: <binary | milestones 1..k with weights, fixed on <date>>   Gate: <checks that zero the reward>
- Checks traced to spec rules: <n of n>. Checks with no rule: <list, or none>.

## 2. Raw outcomes (every solution, every run)
| solution | corpus | expected | run 1 | run 2 | run 3 | milestones | verdict |

## 3. Results by corpus, each with its frame
| corpus | frame | n | result | how to read it |
| independent correct (<k> authors) | hand-picked | | <a> of <n> scored 1 | counts only |
| refactor variants | census of transformation set T | | <a> of <n> | over T only |
| hand-written wrong (incl. cheats) | hand-picked | | <r> of <n> scored 0 | counts only |
| unseen wrong (grader frozen first) | hand-picked by others | | <r> of <n> scored 0 | counts only |
| mutants of the reference diff, operator set O | census (<N> enumerated, <E> equivalent excluded) | | <k> of <N-E> killed (<c> by a crash) | exact over the enumerated space (operator set O), no interval |
| sampled mutants, space Q | uniform random sample, seed <s> | | <k> of <n>, Wilson 95% [<lo>, <hi>] | estimate over Q |
| real attempts, adjudicated | <N> attempts, one agent configuration, one task | | FA <x>, FR <y> | that configuration only |

## 4. Stability
- Runs per solution: <≥3>. Unstable verdicts: <n>. Seeds fixed: yes | no. PYTHONHASHSEED varied: yes | no.
- Limit: if runs flake independently, 3 runs see a 5% flake only 14.3% of the time (59 runs for 95%).

## 5. Isolation
- Hidden tests added after the agent: yes | no.   Network: off | allow-list <...>
- git log --all shows only: <commits>.            Canary hits in workspace or transcript: <n>
- Files the grader takes from the workspace: <list>. conftest.py and plugins ignored: yes | no.
- Verdict computed outside the candidate's process: yes | no.

## 6. Known limits (what this card does not show)
- <designs, inputs, environments not tested>

## 7. What would change the verdict
- <a correct solution scoring 0; a real attempt adjudicated wrong scoring 1; ...>
```

**5-line short form** (Lab F, quick reviews):

```text
Corpus:    <which solutions, how many of each kind>
Frame:     <hand-picked | census of ... | random sample of ...> -> <counts | exact rate | rate + Wilson>
Results:   <expected verdicts met: a of n; false accepts: x; false rejects: y>
Stability: <runs per solution; unstable verdicts>
Limits:    <what was not tested>
```

**Before you sign it:** do-nothing scores 0 · 3+ independent correct solutions score 1 · the grader was frozen before the unseen wrong solutions arrived · every survivor of a census is adjudicated (equivalent, decided before you saw its verdict or argued in writing and checked by a second person, or a hole you fixed) · crash kills reported apart · "evidence, not proof".
:::
