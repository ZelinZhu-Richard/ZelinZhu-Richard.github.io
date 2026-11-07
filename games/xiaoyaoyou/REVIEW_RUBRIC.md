# xiaoyaoyou — review rubric (fixed bar)

Richard applies this live at the end of every milestone (§0), together with the milestone's criteria in `PLAN.md`. In unattended runs the grader applies it after every Codex run instead (§1, §9). The bar never moves. Only the specificity of the instructions grows. Where this rubric says Codex, read "the builder" in interactive mode.

## 0. Interactive review (now)

- **What the builder shows, in order:**
  1. the Blender preview next to the reference: `_dev/silhouette/<asset>-<view>.png` for Kun and Peng, or the preview next to a key-art crop for other assets
  2. the browser screenshots from `capture.mjs`, each next to the matching key art or Blender preview
  3. the IoU table from `silhouette.py`, and every other criterion as PASS or FAIL with its number

  Items that don't apply are marked n/a.
- **Clean evidence.** `metrics.commit` equals HEAD, and `dirty` is false.
- **Richard judges.** A box is ticked only after his OK, recorded in LOG.md as `## M<n> APPROVED by Richard (<date>, commit <sha>)` with the IoU table and his notes.
- **Misses.** A number below its threshold is shown as a miss. Only Richard can waive it, and the waiver goes into LOG.md in his words.
- **No attempt cap.** The builder iterates on Richard's notes. The criteria loosen only if he edits them.
- §2–§8 apply in both modes.

## 1. Procedure (for unattended runs only)

1. **Find the milestone.** It is the one in Codex's newest LOG entry. Count earlier `REVIEW M<n>` entries to get the attempt number.
2. **Get fresh evidence.** Make sure `http://127.0.0.1:8101/games/xiaoyaoyou/` answers. If it doesn't, start `python3 -m http.server 8101 --bind 127.0.0.1` from the worktree root. Then **re-run** `node games/xiaoyaoyou/tools/capture.mjs --milestone <n>`, adding `--autoplay --replay` if any criterion needs it. If the milestone has a hero asset, also re-run `tools/silhouette.py` (render, then compare). Grade from your own run.
   - If you cannot run capture, use Codex's `_dev/evidence/M<n>/`. Accept it only if `metrics.commit` matches HEAD, or differs from HEAD only by `PLAN.md`/`LOG.md`, and `dirty` is false.
   - Missing or stale evidence = FAIL.
3. **Open every screenshot and silhouette overlay** the criteria name. Never grade a visual criterion from numbers alone. Never grade from a LOG claim.
4. **Check the run itself.**
   - Every PLAN criterion for this milestone, plus the global checks in §2.
   - Every earlier checkpoint and IoU threshold, for regressions.
   - `git diff --stat HEAD~2` (or since the last REVIEW) for files outside `games/xiaoyaoyou/`.
5. **Write the verdict** (§9) at the end of `LOG.md`.
   - On FAIL at review 1 or 2, untick the milestone's box in `PLAN.md`.
   - On FAIL at review 3, also append ` — BLOCKED (3 reviews)` to the end of that milestone's line.
   - Using the prerequisite table in PLAN.md unattended rule 2, add one LOG line: either `NEXT: M<k>`, or `NIGHT STOPPED: M<n> blocked`.
   - Change nothing else.

## 2. Global checks (any failure = FAIL)

- `console.json`: 0 `pageErrors`, 0 console errors, 0 `failedRequests`, 0 `externalRequests`.
- `__GAME_READY__` becomes true. `__GAME_STATS__.drawCalls` and `.triangles` are finite at every checkpoint.
- The budgets in PLAN.md hold at every checkpoint: draw calls ≤ 150, triangles ≤ 300k in the frame and ≤ 60k per hero, pixel ratio ≤ 2, textures ≤ 2048, runtime bytes < 20,000,000.
- **Asset manifest.** Every GLB loads through `assets.json`. A search for `.glb` in `src/` and `index.html` finds nothing, and every manifest entry's file exists.
- **IoU regressions.** Earlier heroes still pass their thresholds.
- Nothing outside `games/xiaoyaoyou/` changed, and nothing in `ref/` changed. Nothing was pushed. No `--no-verify`. No Git config or hook changes. No CDN or remote URL in the shipped code.
- In unattended runs, Codex changed PLAN.md only by ticking its own box: the criteria, passages, Decisions, this file and earlier REVIEW entries are untouched. In interactive mode, boxes are ticked only after Richard's OK.
- No fake pass:
  - a box ticked without matching evidence
  - a LOG claim contradicted by a screenshot, overlay or metric
  - `metrics.json` not produced by `tools/capture.mjs`, or a silhouette JSON not produced by `tools/silhouette.py`, or values your re-run can't reproduce within 5%
  - checkpoint hooks that stage a result the real play path doesn't produce. Spot-check: the autoplay run must pass through the same states. The `?view=` and `?phase=` test views are allowed because they are labeled evidence-only.
  - an IoU raised by tuning cameras, normalization, blur or thresholds, by editing reference images, or by shaping a mesh to fit one view at the expense of another
- Earlier milestones' criteria still pass.

## 3. Art direction (judge screenshots next to the key art)

**References** (`ref/`):
- `key-north-sea.png` sets the mood and look of the north sea. Kun is a white, whale-like creature with an ink-wash mountain-and-pine landscape across its back and flanks, broad translucent fins with ink-wave edges, light shafts from above, rock pillars below and tiny red motes.
- `key-peng-sunset.png` sets the mood for the Peng beats and the southern sea: a blazing sunset (gold, coral, rose, violet), a sea of clouds, and ink-brushed wings with a warm rim light.
- `kun-sheet.png` and `peng-sheet.png` set the shapes (authoritative views in §4).
- `tex-kun-landscape.png` and `tex-fin-waves.png` are Kun's textures.

Mood comes from the key art and shape from the sheets. Where they disagree on shape, the sheet wins.

**Right:**
- **Color arc.**
  - North: cold and dark. Deep blue-teal water (abyss → sea → haze), a cream Kun and tiny red motes. The motes are the only warm hue.
  - From the breach on: a warm sunset of gold, coral, rose and violet, with the sun low and ink-dark wings rim-lit warm.
  - Tokens and hue bands are in PLAN.md **Art palette**. `offPalette` is ≤ 0.010 against each beat's band set.
- **Kun:**
  - white and whale-like, with the ink-wash landscape across the back and upper flanks
  - a plain cream belly with throat pleats
  - broad translucent fins with ink-wave edges: white areas let the water through but are never fully transparent, and ink areas are opaque
  - a horizontal fluke, and slow vertical undulation
  - soft top light and a cream rim, with no outline
- **Peng:**
  - crane-like: a long straight beak, a slender neck, a small head and red ribbon plumes
  - ink-brushed wings of layered feathers with ragged brush tips and cream feather bases
  - a white neck and body flecked with ink, and a long trailing tail
  - a warm rim light on the wing edges and feather tips
  - wingspan ≥ 5× the torso (base of neck to base of tail)
- **Shading and line.** Shading is soft, painterly and driven by light: top light in the sea, back light from the sun in the sky. There is no glossy specular and no hard outline. Heroes read by value contrast and rim light: a light Kun on dark water, a dark Peng on a bright sky.
- **Light and atmosphere.**
  - North: light shafts from the surface; water that brightens toward the surface and falls to near-black below; fog that swallows the distance; dark rock pillars with pines and misty bases.
  - Sunset: a sky from violet dusk through rose and coral to gold at the horizon; a low sun with a glitter path; a sea of clouds with ink peaks; warm fog.
  - Grain is optional and faint, and never over text.
- **Composition.** Lots of empty space, and the hero silhouette reads. Screenshots compared with the key art are framed the same way: Kun in a 3/4 view from below with the head to the right; Peng wide across the frame.
- **Per beat:**
  - north: cold, dark blue-teal water, a cream Kun, red motes, light shafts, ink pillars
  - breach: the cold turns warm, an ink splash, and Peng unfurls against the sunset
  - ascent: sunset-lit cloud layers with cream-gold tops, coral and rose flanks, and mauve and violet shadows
  - south: a sunset sea, a low gold sun with a glitter path, ink islands with pines

**Wrong (any one = FAIL for the milestone that owns it):**
- Default Three.js look: grey MeshStandard, a shiny specular dot, a pure `#000` or `#fff` background, a blue-sky gradient.
- Breaking the color arc:
  - warm hues in the north apart from the red motes
  - a blue sky, cyan, or cold light in the Peng beats or the south
  - green or cyan anywhere
  - red UI apart from the seal
- Hard black outlines on Kun or Peng.
- Kun:
  - a vertical (fish) tail fin, or side-to-side swimming
  - opaque fins, or fin white areas cut fully transparent
  - a visible seam, stretch or repeat in the landscape, or landscape on the belly
- Peng:
  - raptor features: a hooked beak, a short thick neck, an eagle head
  - plumes missing or not red
  - wings made as single flat planes instead of layered feathers
  - wingspan < 5× the torso
- A hero IoU below its threshold (§4).
- Bloom haze that washes out silhouettes. Grain heavy enough to make text hard to read.
- Primitives shipped as creatures or props: a sphere or capsule fish, cone or plane wings, a cylinder-plus-ball tree, a cube rock.
- Primitive check for every asset preview: you can name the fluke lobes and both fin pairs; Peng's beak, neck, plumes and feather rows; the branch levels.
- Clipped framing: a hero cut off at `breach-peak`, text off-screen at 390×844.

**Changes from the previous version (2026-10-26):**
1. **References added.** Mood comes from the two key arts and shape from the two sheets; where they disagree on shape, the sheet wins. Before, there was no reference art.
2. **One palette became a color arc.** The single palette is replaced by a cold north palette and a warm sunset palette, both sampled from the key art.
   - Removed: indigo-deep `#16213A`, indigo `#2C3D63`, mist `#8D97B0`, glow `#F4ECDA`.
   - Added for the north: abyss, deep, sea, haze, shaft, Kun lit, Kun paper, landscape ink.
   - Added for the sunset: gold, sun, apricot, coral, rose, mauve, violet dusk, warm ink.
   - Kept: ink, paper, paper-shade, vermilion.
3. **Red is no longer limited to the motes and the seal.** Red is now allowed for the motes, the seal, Peng's plumes and as a sunset hue. Warm hues are forbidden only in the north, apart from the motes.
4. **`offPalette` uses a band set per beat.** Before, one set (indigo 205–250° plus vermilion) applied everywhere. Now the bands are cold 185–225°, red, and warm 260–55°. The old indigo band would have flagged the north key art's own water, which sits at 191–208°. The 0.010 threshold is kept.
   - New gates: `warmShare` ≥ 0.25 at sunset checkpoints; `meanLuma` 35–110 in the north.
   - `redShare` ≤ 0.03 in the north replaces `vermilionShare`.
5. **Shading.** Flat toon shading with 2–3 tone bands → soft, painterly top light and back light. "No glossy highlight" is kept.
6. **Line.** The continuous ink contour around Kun, Peng, the tree, the creatures and the pillars is no longer required. Hard black outlines on Kun or Peng are now wrong, and "missing outlines on a hero mesh" is removed.
7. **Kun.** "Cream, with a rim" → the full description: the landscape on the back and upper flanks, the plain belly, translucent ink-wave fins, the horizontal fluke, vertical undulation, top light and the rim.
8. **Peng.** New description: crane-like with red plumes, layered ink-brushed feathers and a warm rim light.
9. **Grain.** Required (`grainStd` 2–12) → optional and faint. Grain over text is still wrong.
10. **Atmosphere.** "Soft fog" → for the north, light shafts, a depth gradient and misty pillar bases; for the sunset, a sky gradient, a low sun, a sea of clouds and warm fog.
11. **Composition.** Added: framed like the key art when compared with it.
12. **Per beat.**
    - north: "indigo dark" → dark blue-teal with light shafts and ink pillars
    - breach: new line
    - sky: "paper sky, ink-edged clouds" → sunset-lit cloud layers
    - south: "paper dawn over mist and indigo water" → a sunset sea with a low gold sun, a glitter path and ink islands
13. **Wrong hues.**
    - Removed, now required: "orange or pink dawn", "gold sun".
    - "Vermilion Kun" → "warm hues in the north apart from the motes".
    - Added: "a blue sky, cyan, or cold light in the Peng beats or the south".
    - "Green trees" → "green or cyan anywhere".
    - "Red UI" is kept, with the seal excepted.
14. **New Kun failures.** A vertical tail fin; side-to-side swimming; opaque fins or fully transparent white areas; a visible seam, stretch or repeat; landscape on the belly.
15. **New Peng failures.** Raptor features; missing or non-red plumes; single-plane wings.
16. **New failure:** a hero IoU below its threshold (§4 is new).
17. **Primitive check.** "Fins and tail, wing scallops" → "fluke lobes and both fin pairs; Peng's beak, neck, plumes and feather rows". Cloud-like scalloped trailing edges on Peng's wings are no longer required.
18. **Peng's wingspan.** ≥ 4× body length → ≥ 5× the torso (base of neck to base of tail).
19. **Unchanged:** the default Three.js look, bloom haze, primitives, clipped framing, and empty-space composition.

## 4. Reference match (hero silhouettes)

- The procedure is fixed in PLAN.md **Reference match**: reference masks, view split, per-view normalization, blur, IoU and outputs. Check that `tools/silhouette.py` still uses those constants and that its view-box assertion passed.
- Thresholds:

  | Hero | View | Authoritative for | IoU ≥ |
  |---|---|---|---|
  | Kun | side | body profile, fin lengths | 0.80 |
  | Kun | top | fluke, fin sweep | 0.75 |
  | Kun | front | fin count and angles (two pairs: upper raised outward, lower angled down) | 0.70 |
  | Peng | top | wing planform, wingspan | 0.75 |
  | Peng | front | wing dihedral (not a true orthographic front) | by eye, no score |
  | Peng | side | head, neck and plume profile only | by eye |

- Peng passes on its top IoU plus Richard's visual approval of the side-by-side images. An unattended run can't get that approval, so M6 can't PASS there: write `NEEDS RICHARD: Peng visual approval`.

- Open every `_dev/silhouette/<asset>-<view>.png`. A passing IoU never excuses a feature that looks wrong in the overlay, such as a missing fin pair or a wrong fluke shape. In unattended runs, a failing IoU is never "close enough".
- The browser's `?view=` screenshots must match the Blender previews: same orientation, same texture placement, translucent fins.

## 5. Story beats and pacing

| Beat | Must be visible | `gameMs` |
|---|---|---|
| north 北冥 | A cold, dark sea with light shafts. 7 red motes. Kun grows about 12×. Pillars shrink on screen while Kun stays the same screen size. `north-1` and `north-2` | 90–150 s |
| breach 化而为鸟 | Kun breaks the surface. Slow motion and an ink burst. The cold sea gives way to the warm sunset. Peng's wings unfurl fully in frame. Camera pulls back so the ocean is far below. `breach-1` and `breach-2` | 8–15 s for the event |
| ascent 抟扶摇而上 (M8) | Spiral whirlwind. Sea → inside sunset-lit clouds → above a cloud floor. `ascent-1` | 60–150 s |
| encounter (M9) | A tiny tree far below. Cicada and dove bubbles from `encounter-*`, anchored to the creatures. The scene dismisses and flight resumes | within ascent |
| south 南冥 | A sunset sea with a low sun, ink islands, `south-1`, then `closing`, then the seal end card with Replay | — |

- **Totals:** 210–480 s before M8, 300–480 s after.
- **No fail state:** no death, no timer loss, no way to get stuck (the corner-hold test).
- Replay resets everything without a reload.

## 6. Controls

- The pointer offset from screen center steers. Holding the mouse or a touch moves forward. Releasing glides to an idle drift.
- `pointerleave`, `pointercancel` and blur release the hold.
- The page never scrolls during touch play.
- Keys: `T` toggles the translation, `M` mutes. Both also exist as visible buttons that fit at 390×844.
- Audio starts only after a gesture and uses one AudioContext.

## 7. Text rules

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

## 8. Performance (automated gates)

- Draw calls ≤ 150 and triangles ≤ 300k at every checkpoint, extra render passes included. Each hero is ≤ 60k triangles. Clouds and motes are instanced.
- Runtime download < 20 MB. Textures ≤ 2048. Pixel ratio = min(DPR, 2).
- fps is **not** graded automatically (software WebGL). Note any obvious per-frame waste you see in the code, such as allocations in the render loop or uninstanced repeats, as a non-blocking issue.

## 9. Verdict format (for unattended runs only; append to LOG.md)

```
## REVIEW M<n> review <k>/3: PASS | FAIL | BLOCKED   (<ISO time>, commit <sha>, evidence: own re-run | Codex's)
Criteria: C1 PASS <number/path> · C2 FAIL <observed vs required> · …
Global: <any §2 failures>
Instructions for attempt <k+1>:
1. …
```

**Escalation: at most 3 reviews per milestone.** Each level adds to the one before it. Never lower a criterion, accept "close enough", or approve a criterion you didn't see. Codex gets only two more tries, so front-load the specifics.

- **Review 1 FAIL:** list each failing criterion with its evidence path and what you observed against what was required. Add the root cause from reading the code (`file:line`) and ordered concrete steps.
- **Review 2 FAIL** (the last chance): add exact changes: function names, values, snippets of ≤ 20 lines, or the full smallest diff that would pass. Give a verification command for Codex to run before ticking. Authorise the milestone's *Fallback if stuck*.
- **Review 3 FAIL → BLOCKED:** write no instructions for Codex. Instead write a `FOR RICHARD:` section:
  - the one-line cause
  - what does work
  - the smallest fix you would apply
  - which later milestones the prerequisite table skips
  If the cause is the environment (Chromium or Blender can't launch, a commit is blocked), write the line `NEEDS RICHARD: <cause>` at any review.

**On PASS:** list non-blocking issues (at most 5), one line each. Codex may fix them only inside a later milestone's scope.
