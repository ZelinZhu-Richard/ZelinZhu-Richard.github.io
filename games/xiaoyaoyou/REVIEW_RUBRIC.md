# xiaoyaoyou — review rubric (fixed bar)

The grader applies this after every Codex run, together with the milestone's criteria in `PLAN.md`. The bar never moves. Only the specificity of the instructions grows.

## 1. Procedure

1. **Find the milestone.** It is the one in Codex's newest LOG entry. Count earlier `REVIEW M<n>` entries to get the attempt number.
2. **Get fresh evidence.** Make sure `http://127.0.0.1:8101/games/xiaoyaoyou/` answers. If it doesn't, start `python3 -m http.server 8101 --bind 127.0.0.1` from the worktree root. Then **re-run** `node games/xiaoyaoyou/tools/capture.mjs --milestone <n>`, adding `--autoplay --replay` if any criterion needs it. Grade from your own run.
   - If you cannot run capture, use Codex's `_dev/evidence/M<n>/`. Accept it only if `metrics.commit` matches HEAD, or differs from HEAD only by `PLAN.md`/`LOG.md`, and `dirty` is false.
   - Missing or stale evidence = FAIL.
3. **Open every screenshot** the criteria name. Never grade a visual criterion from numbers alone. Never grade from a LOG claim.
4. **Check the run itself.**
   - Every PLAN criterion for this milestone, plus the global checks in §2.
   - Every earlier checkpoint, for regressions.
   - `git diff --stat HEAD~2` (or since the last REVIEW) for files outside `games/xiaoyaoyou/`.
5. **Write the verdict** (§8) at the end of `LOG.md`. On FAIL, untick the milestone's box in `PLAN.md`. Change nothing else.

## 2. Global checks (any failure = FAIL)

- `console.json`: 0 `pageErrors`, 0 console errors, 0 `failedRequests`, 0 `externalRequests`.
- `__GAME_READY__` becomes true. `__GAME_STATS__.drawCalls` and `.triangles` are finite at every checkpoint.
- The budgets in PLAN.md hold at every checkpoint: draw calls ≤ 150, triangles ≤ 300k, pixel ratio ≤ 2, textures ≤ 2048, runtime bytes < 20,000,000.
- Nothing outside `games/xiaoyaoyou/` changed. Nothing was pushed. No `--no-verify`. No Git config or hook changes. No CDN or remote URL in the shipped code.
- Codex changed PLAN.md only by ticking its own box. The criteria, passages, Decisions, this file and earlier REVIEW entries are untouched.
- No fake pass:
  - a box ticked without matching evidence
  - a LOG claim contradicted by a screenshot or metric
  - `metrics.json` not produced by `tools/capture.mjs`, or values your re-run can't reproduce within 5%
  - checkpoint hooks that stage a result the real play path doesn't produce. Spot-check: the autoplay run must pass through the same states.
- Earlier milestones' criteria still pass.

## 3. Art direction (judge from screenshots)

**Right:**
- **Palette:** ink `#17171C`, paper `#EFE7D6` / `#D9CFBB`, indigo `#16213A` / `#2C3D63`, mist `#8D97B0`, Kun's glow `#F4ECDA`, and vermilion `#D4432C` only for the motes and the seal. `palette.offPalette` is ≤ 0.010 everywhere.
- **Shading and line:** flat toon shading with 2–3 tone bands and no glossy highlights. A continuous ink contour around Kun, Peng, the tree, the creatures and the pillars.
- **Kun:** cream, with a rim.
- **Atmosphere:** soft fog swallows the distance. Paper grain is visible in flat areas (`grainStd` 2–12) but never over text.
- **Composition:** lots of empty space. The hero silhouette reads against the background.
- **Per beat:**
  - north: indigo dark with cream Kun and vermilion motes
  - sky: paper sky, ink-edged clouds
  - south: paper dawn over mist and indigo water

**Wrong (any one = FAIL for the milestone that owns it):**
- Default Three.js look: grey MeshStandard, a shiny specular dot, a pure `#000` or `#fff` background, a blue-sky gradient.
- Any hue outside the palette: green trees, an orange or pink dawn, a gold sun, a vermilion Kun, red UI.
- Bloom haze that washes out silhouettes. Grain heavy enough to make text hard to read. Missing outlines on a hero mesh.
- Primitives shipped as creatures or props: a sphere or capsule fish, cone or plane wings, a cylinder-plus-ball tree, a cube rock.
- Primitive check for every asset preview: you can name the fins and tail, the wing scallops, the branch levels.
- Peng's wings are not visibly broader than its body by ≥ 4×.
- Clipped framing: a hero cut off at `breach-peak`, text off-screen at 390×844.

## 4. Story beats and pacing

| Beat | Must be visible | `gameMs` |
|---|---|---|
| north 北冥 | 7 vermilion motes. Kun grows about 12×. Pillars shrink on screen while Kun stays the same screen size. `north-1` and `north-2` | 90–150 s |
| breach 化而为鸟 | Kun breaks the surface. Slow motion and an ink burst. Peng's wings unfurl fully in frame. Camera pulls back so the ocean is far below. `breach-1` and `breach-2` | 8–15 s for the event |
| ascent 抟扶摇而上 (M7) | Spiral whirlwind. Sea → inside the clouds → above a cloud floor. `ascent-1` | 60–150 s |
| encounter (M8) | A tiny tree far below. Cicada and dove bubbles from `encounter-*`, anchored to the creatures. The scene dismisses and flight resumes | within ascent |
| south 南冥 | Pale dawn sea, ink islands, `south-1`, then `closing`, then the seal end card with Replay | — |

- **Totals:** 210–480 s before M7, 300–480 s after.
- **No fail state:** no death, no timer loss, no way to get stuck (the corner-hold test).
- Replay resets everything without a reload.

## 5. Controls

- The pointer offset from screen center steers. Holding the mouse or a touch moves forward. Releasing glides to an idle drift.
- `pointerleave`, `pointercancel` and blur release the hold.
- The page never scrolls during touch play.
- Keys: `T` toggles the translation, `M` mutes. Both also exist as visible buttons that fit at 390×844.
- Audio starts only after a gesture and uses one AudioContext.

## 6. Text rules

- **Exact source text.** Every on-screen string lives in `text.json`. Every `source` line's `zh` matches the PLAN.md passages block exactly (`metrics.text.sourceExact`). No other Zhuangzi text appears.
- **Labels.** Every line has `"draft": true`. Every source line has `"verify": true`, which means *unverified*. Codex never removes these labels or marks anything verified; only Richard does.
- **Fresh translations.** English drafts must be Codex's own: plain, accurate, grammatical, and in pinyin (Kun, Peng, li). FAIL any line that echoes the well-known published translations:
  - Watson: the "northern darkness" opening, Wade-Giles *K'un/P'eng*, "beats the whirlwind", "clouds all over the sky", and the "Perfect Man has no self / Holy Man has no merit / Sage has no fame" triad.
  - Legge: "the name of which is" phrasing.
  - Any sentence you recognise as a published rendering.
  - Also flag a draft that sticks so closely to one published version that only a few words differ.
- **Staging notes.** The `encounter-cicada` line notes the split staging and the 抢/枪 variant. Comic text is the source line, not invented jokes. Any added `original` line is marked `kind: "original"`.
- **Rendering.** No missing-glyph boxes. Chinese in LXGW WenKai, English in EB Garamond. Both OFL files ship. `textOverflow` is `[]`.

**IP rules:** these apply only to the hundred-acre game. Here the source is public domain; check only the licenses (fonts OFL, Three.js MIT) and the README credits.

## 7. Performance (nightly gates)

- Draw calls ≤ 150 and triangles ≤ 300k at every checkpoint, outlines included. Clouds and motes are instanced.
- Runtime download < 20 MB. Textures ≤ 2048. Pixel ratio = min(DPR, 2).
- fps is **not** graded overnight (software WebGL). Note any obvious per-frame waste you see in the code, such as allocations in the render loop or uninstanced repeats, as a non-blocking issue.

## 8. Verdict format (append to LOG.md)

```
## REVIEW M<n> attempt <k>: PASS | FAIL   (<ISO time>, commit <sha>, evidence: own re-run | Codex's)
Criteria: C1 PASS <number/path> · C2 FAIL <observed vs required> · …
Global: <any §2 failures>
Instructions for attempt <k+1>:
1. …
```

**Escalation on FAIL.** Each level adds to the one before it. Never lower a criterion, accept "close enough", or approve a criterion you didn't see.

- **Attempt 1:** list each failing criterion with its evidence path, what you observed against what was required, and a one-line direction.
- **Attempt 2:** add the root cause from reading the code (`file:line`), plus ordered concrete steps.
- **Attempt 3:** add exact changes: function names, values, a snippet of ≤ 20 lines. Authorise the milestone's *Fallback if stuck*.
- **Attempt 4 and later:** add the smallest diff that would pass, written out in full, and a verification command to run before ticking. If the blocker is the environment (Chromium or Blender can't launch, a commit is blocked), add the line `NEEDS RICHARD: <one-line cause>`. The verdict stays FAIL.

**On PASS:** list non-blocking issues (at most 5), one line each. Codex may fix them only inside a later milestone's scope.
