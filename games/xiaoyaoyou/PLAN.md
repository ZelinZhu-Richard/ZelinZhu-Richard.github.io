# 逍遥游 · Free and Easy Wandering — build plan

A 5–8 minute meditative 3D journey through Zhuangzi's 逍遥游. You are Kun, a small pale whale-fish with a mountain landscape painted across its back. You grow until the sea looks small, become Peng, ride the whirlwind up past a mocking cicada and dove, and arrive at the southern sea under a blazing sunset.

Approved by Richard on 2026-10-26, then revised the same day for a quality-first, interactive build matched to the reference art in `ref/`. Richard judges every milestone live against this file and `REVIEW_RUBRIC.md`. The grader is used only for unattended runs.

## How we build now (interactive mode)

Richard is present. He approves commands and judges screenshots. Where this section and the unattended rules below differ, this section wins. Where this file says Codex, read "the builder" (whichever agent is building).

1. **Start.** Confirm the worktree (`/Users/richardzhu/dev/site-xiaoyaoyou`), the branch (`game/xiaoyaoyou`) and the Git status. Read this file and `LOG.md`. Work on the first unticked milestone whose prerequisites are ticked (table in unattended rule 2), one milestone at a time.
2. **Quality first.** The criteria are minimums. If the numbers pass but the result doesn't look like the reference, keep going. There is no attempt cap; iterate on Richard's notes.
3. **Show and wait.** Each milestone ends by showing Richard, in this order:
   1. The Blender preview next to the reference. For Kun and Peng that is `_dev/silhouette/<asset>-<view>.png` (reference | Blender preview | mask overlay). For any other asset it is the Blender preview next to the matching key-art crop, made with `silhouette.py --pair`.
   2. The browser screenshots from `tools/capture.mjs`, each next to the matching key art or Blender preview.
   3. The IoU table from `tools/silhouette.py`, then every other criterion as PASS or FAIL with its number.

   Items that don't apply are marked n/a: M0 has no Blender asset, and M1 has no browser. Then stop and wait for Richard's OK.
4. **Ticking.** Tick a box only after Richard's OK. Append `## M<n> APPROVED by Richard (<date>, commit <sha>)` to `LOG.md`, with the IoU table and his notes. A number that misses its threshold is reported as a miss. Only Richard can waive it, and the waiver goes into LOG.md in his words.
5. **Commits.** Commit the code as `xiaoyaoyou: M<n> <title>` before capturing, so the evidence comes from a clean commit. After the OK, commit PLAN.md and LOG.md. Never push.
6. **Scope, server, evidence and regressions** follow unattended rules 4, 5, 6 and 9.

## Rules for unattended runs only (grader/harness)

Use these only when `run_night.sh` drives Codex with the grader while Richard is away.

1. **One milestone per run.** Confirm the worktree (`/Users/richardzhu/dev/site-xiaoyaoyou`), the branch (`game/xiaoyaoyou`) and the Git status. Read this file, then `LOG.md`, then the newest `REVIEW` entry in `LOG.md`. Work only on the **first unchecked milestone that is not marked `BLOCKED` and whose prerequisites are all ticked** (table below). Never start a second milestone in the same run. If no milestone qualifies, write `NIGHT DONE: nothing eligible` in LOG and stop.
2. **At most 3 attempts per milestone.** If the newest `REVIEW` for this milestone is `FAIL`, first do every numbered instruction in it. Then answer each one by number in your LOG entry. The grader gets more specific after each failed attempt; follow it literally. After the third `FAIL`, the grader appends ` — BLOCKED (3 reviews)` to the milestone's line. Never work on a `BLOCKED` milestone again, and never remove that mark; only Richard does.

   | Milestone | Needs ticked | If it ends `BLOCKED` |
   |---|---|---|
   | M0 | — | night stops |
   | M1 | M0 | night stops |
   | M2 | M1 | night stops |
   | M3 | M2 | night stops |
   | M4 | M3 | continue to M5; the slice ships without the look |
   | M5 | M3 | continue to M6; README v1 moves to M10 |
   | M6 | M3 | M7, M8 and M9 are skipped; go to M10 |
   | M7 | M6 | M8 and M9 still run; go on |
   | M8 | M6 | M9 is skipped |
   | M9 | M8 | continue |
   | M10 | M3 | — |

   A `BLOCKED` milestone's criteria are left out of the regression check (rule 9). Everything that passed stays in it.
3. **What Codex may change in PLAN.md:** only `[ ]` → `[x]` on the milestone it just finished. Never edit the criteria, the passages block, the Decisions, `REVIEW_RUBRIC.md` or existing `REVIEW` entries. Notes, deviations and questions go in `LOG.md`.
4. **Scope** (from GAME.md): write only inside `games/xiaoyaoyou/`. No downloads, no installs, no `npx`, no CDN, no repo-wide build, no push, no branch changes, no Git config or hook changes, no `--no-verify`. `/Users/richardzhu/game-assets` is read-only.
5. **Server:** from the worktree root, `python3 -m http.server 8101 --bind 127.0.0.1`. If `http://127.0.0.1:8101/games/xiaoyaoyou/` already answers 200, reuse it. If port 8101 is taken by something else, log it and stop. Never use another port or address.
6. **Evidence** is produced only by `tools/capture.mjs` (into `_dev/evidence/M<n>/`) and `tools/silhouette.py` (into `_dev/silhouette/`). `_dev/` is gitignored. Look at every screenshot and overlay yourself before ticking. A tick with no fresh evidence counts as a fake pass.
7. **End of every run:**
   - Commit the code with `xiaoyaoyou: M<n> <title>`.
   - Run `capture.mjs` (and `silhouette.py` if the milestone has a hero asset) on that clean commit.
   - Append a LOG entry that maps each criterion to its evidence path and states pass or fail with numbers.
   - Tick the box only if every criterion passed.
   - Commit PLAN.md and LOG.md.
   If a commit is blocked, record that in LOG.md and stop the run: files on disk keep the state. Never bypass a blocked commit.
8. **Failure handling:** if the same operation fails twice, log both failures and try the milestone's listed *Fallback if stuck*. A fallback may change how something is built. It never changes the acceptance criteria.
9. **Regressions:** every capture re-runs all checkpoints from earlier milestones, and every silhouette run re-checks earlier thresholds. Breaking an earlier criterion fails the current milestone.

## Contracts (fixed, used by every milestone)

**Layout** (paths relative to `games/xiaoyaoyou/`):
- `index.html`, `styles.css`, `src/*.js`
- `assets.json` is the asset manifest (see Assets)
- `vendor/three/` holds Three.js build + addons + LICENSE
- `blender/*.py` are the asset scripts
- `assets/*.glb` are the optimized runtime assets (committed)
- `ref/` holds the reference art. It is read-only: never edited, never shipped.
- `fonts/` holds the font subsets plus `OFL-LXGWWenKai.txt` and `OFL-EBGaramond.txt`
- `text.json`
- `tools/capture.mjs`, `tools/silhouette.py`, `tools/optimize_assets.sh`, `tools/subset_fonts.sh`, `tools/check_text.py`
- `README.md`
- `_dev/` holds `tmp/`, `raw/`, `previews/`, `silhouette/`, `build/asset-stats.json` and `evidence/M<n>/`

**Assets:**
- `assets.json` = `{ "<name>": { "path": "assets/<name>.glb", "scale": <number>, "anchor": [x, y, z] } }`.
  - `path` is relative to `games/xiaoyaoyou/`.
  - `scale` is the uniform scale applied on load.
  - `anchor` is the model-space point (before `scale`) that sits at the entity's position: Kun's center of mass on the spine, the point between Peng's wing roots, a prop's base.
- `src/assets.js` is the only loader. `loadAsset(name)` reads `assets.json`, loads the GLB through GLTFLoader + MeshoptDecoder, applies scale and anchor, and returns the scene.
- Game code never hardcodes a GLB path. A search for `.glb` in `src/` and `index.html` finds nothing.
- Every GLB in `assets/` has an entry, and every entry's file exists.

**Runtime:**
- Static ES modules with an import map:
  - `"three"` → `./vendor/three/build/three.module.min.js`
  - `"three/addons/"` → `./vendor/three/addons/`
- Copy every file the build entry imports. Since r171, `three.module*.js` imports `three.core*.js`.
- Copy `GLTFLoader.js` and its relative imports (`../utils/BufferGeometryUtils.js`), plus `libs/meshopt_decoder.module.js`.
- All from the pinned version in `/Users/richardzhu/game-assets/node_modules/three`. Record the version.
- Call `loader.setMeshoptDecoder(MeshoptDecoder)` before any load.
- Relative URLs only. Pixel ratio = `min(devicePixelRatio, 2)`.
- Simulation runs at a fixed 1/60 s step. `gameMs` = steps × 1000/60. All pacing criteria use `gameMs`, never wall-clock time.

**Page globals:**
- `window.__GAME_READY__`: `false` until assets, fonts and `text.json` have loaded *and* the first frame of the title scene has rendered; then `true`. It stays `false` on load error, and a visible error with a Retry button is shown.
- `window.__GAME_STATS__ = { drawCalls, triangles, pixelRatio, frame }`: finite numbers refreshed every frame from `renderer.info.render`. Set `renderer.info.autoReset = false` and reset once per frame, so multi-pass rendering is summed.
- `window.__GAME_STATE__ = { beat, motes, kunScale, gameMs, translationOn, muted, settled }`. `beat` ∈ `title|test|north|breach|ascent|encounter|south|end`.
- `window.__GAME_DEBUG__ = { start(), jump(checkpointId), autoplay(on), setTimescale(n), measure() }`.
  - `measure()` returns `{ <name>: { heightPx, widthPx, inFrame } }` for named objects (`kun`, `ref-pillar-1`, `peng`, `dove`, …) plus `cameraAltitude`.
- URL params:
  - `?checkpoint=<id>` jumps straight to a deterministic state and sets `settled=true` after 30 frames.
  - `?autoplay=1` turns on a scripted pilot that steers toward goals and holds forward.
  - `?timescale=N` runs N simulation steps per frame (evidence speed-up only).
  - `?seed=1` fixes the RNG seed.
  - `?view=side|top|front` (with `checkpoint=kun-test`) or `?view=side|top` (with `checkpoint=peng-test`) shows the hero in its rest pose, deformation paused, through an orthographic camera matching `silhouette.py`'s, on the sheet's grey.
  - `?phase=p` freezes the swim or flap cycle at phase p ∈ [0, 1) (evidence only).

**Checkpoints** (each milestone adds its own):
- M0: `title`, `north-start`
- M2: `kun-test`
- M3: `north-full`, `end-card`
- M5: `north-text`
- M6: `peng-test`, `breach-peak`, `peng-flight`
- M7: `south-arrival`, `closing`
- M8: `ascent-low`, `ascent-mid`, `ascent-high`
- M9: `encounter`

**Story graph:** beats are registered in an ordered list. M7's ending must work whether or not `ascent` and `encounter` exist; M8 and M9 insert themselves before `south`.

**Capture tool:** `node games/xiaoyaoyou/tools/capture.mjs --milestone <n> [--autoplay] [--replay]`, run from the worktree root.
- Import Playwright from the shared install via `createRequire('/Users/richardzhu/game-assets/node_modules/')`. Launch headless Chromium. If WebGL is unavailable, relaunch with `--use-angle=swiftshader --enable-unsafe-swiftshader` and record the launch args.
- Two contexts:
  - desktop 1440×900, deviceScaleFactor 1
  - narrow 390×844, deviceScaleFactor 3, `hasTouch`
- For every checkpoint and viewport, save `<checkpoint>-<desktop|narrow>.png`.
- A `loading-desktop.png` is taken with vendor responses delayed by 1.5 s via `page.route`.
- Palette and grain stats are computed by loading the screenshot PNG into an in-page 2D canvas, so no image library is needed.
- `console.json`: `{ commit, dirty, capturedAt, entries:[{type,text}], pageErrors:[], failedRequests:[], externalRequests:[], requests:[{url,status,bytes}] }`. Any request not to `127.0.0.1:8101` is external.
- `metrics.json`: `{ generator:"tools/capture.mjs", milestone, commit, dirty, capturedAt, browser:{version,webglRenderer,launchArgs}, readyMs, threeVersion, checkpoints:{ <id>:{ desktop:{drawCalls,triangles,pixelRatio,palette:{offPalette,redShare,warmShare,meanLuma},measure,textOverflow:[]}, narrow:{…} } }, autoplay:{runs:[{beats:[{id,gameMs}],totalGameMs,reachedEnd}]}, assets:<copy of _dev/build/asset-stats.json>, blender:<same file's blender section>, silhouette:<copy of _dev/silhouette/*.json>, text:<check_text.py output>, runtimeBytes, extra:{} }`. Milestone-specific fields go in `extra` under the names given below.
- Palette stats count *saturated* pixels: HSV S > 0.35 and V > 0.25. The hue bands and the band set for each beat are in **Art palette**.
  - `offPalette`: the fraction of all pixels that are saturated and whose hue falls outside the checkpoint beat's band set.
  - `redShare`: the fraction of all pixels that are saturated and in the red band.
  - `warmShare`: the fraction of all pixels that are saturated and in the warm band.
  - `meanLuma`: the mean Rec. 709 luma, 0–255.
- `textOverflow`: every visible text element where `scrollWidth > clientWidth + 1` or `scrollHeight > clientHeight + 1`, or that sits partly outside the viewport.

**Blender** (exact command form; the runner pre-approves it if the sandbox blocks Blender). Run from the worktree root, one command per asset, never from inside another script:

```
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python games/xiaoyaoyou/blender/<name>.py -- --engine <eevee|cycles>
```

- `blender/common.py` sets `preferences.filepaths.temporary_directory` to the absolute `games/xiaoyaoyou/_dev/tmp`.
- Hero materials (Kun, Peng) carry real UVs and image textures. The runtime keeps those textures and patches only the shading and the vertex deformation. Prop materials are name tags taken from the palette tokens (`ink`, `paper`, `deep`, `haze`, `vermilion`, …), which the runtime swaps by name.
- It exports `_dev/raw/<name>.glb` (GLB, +Y up, modifiers applied, UVs and images included).
- Hero previews and masks come from `tools/silhouette.py` (see Reference match). Prop scripts render fixed-camera previews `_dev/previews/<name>-<side|top|front>.png` at 512×512.
- Cycles settings: `device='CPU'`, 16 samples, denoising off, at most 60 s per image.
- It writes stats for that asset into `_dev/build/asset-stats.json`: triangles, bbox, node names, engine, exit code, seconds, plus `quadRatio`, `bodyNonManifoldEdges`, `loopSpacingRatio` and `maxTextureSize` for heroes. The file was renamed from `_dev/build/assets.json` so it can't be confused with the committed `assets.json` manifest.
- Then `bash games/xiaoyaoyou/tools/optimize_assets.sh` runs `/Users/richardzhu/game-assets/node_modules/.bin/gltf-transform optimize _dev/raw/<n>.glb assets/<n>.glb --compress meshopt --texture-compress webp`, then records the byte sizes and `extensionsUsed` (read from the GLB JSON chunk) for each asset. For heroes it turns off mesh simplification, joining and flattening, so node names and edge loops survive. Check `gltf-transform optimize --help` for the pinned version's flag names.

**Geometry rule:** every body, fin, wing, branch and cloud is shaped in Python (bmesh lofts, extrusions, profiles, displacement or recursion). `primitive_*_add` may only seed a shape that is then substantially reshaped. A scaled sphere, capsule, cone or cylinder shipped as a creature or tree fails the review.

**Hero modeling** (Kun and Peng):
- Modeled in Blender from code only. No downloaded, scanned or AI-generated meshes. Reference images may be measured or traced; for example, a fin outline traced from a reference mask and simplified to a spline.
- Bodies, and Peng's neck: cross-sections lofted along a spine curve, then a Subdivision Surface modifier applied on export.
- Fins, fluke, wing feathers, tail feathers and plumes: thin shaped sheets with alpha-edged textures, subdivided along span and chord so they bend smoothly.
- Clean, quad-dominant topology for vertex-shader swim and flap deformation:
  - `quadRatio` ≥ 0.90 (quads ÷ faces, before triangulation)
  - `loopSpacingRatio` ≤ 3 (the largest gap between consecutive body loops along the spine ÷ the smallest)
  - `bodyNonManifoldEdges` = 0: the body is closed
- At most 60,000 triangles per hero after triangulation.
- The rest pose is the sheet's pose; `silhouette.py` renders it. Forward is Blender −Y (glTF +Z), up is Blender +Z (glTF +Y).
- UVs are laid out in code. Textures are at most 2048 px per axis; resize in Blender before export (`tex-kun-landscape.png` is 2172×724).
- Deformation runs in the vertex shader. Kun's swim is driven by model-space position along the body axis, Peng's flap by distance from the body axis along the span. No skinning or custom attributes are needed.

**Kun textures** (Richard's verified facts):
- `tex-kun-landscape.png` has a cream paper background, is 3:1, and is not seamless.
  - It is mapped to the back and upper flanks only, running once along the body and never tiled.
  - On each flank the mountains rise toward the dorsal line. The two flanks meet along the dorsal line inside the texture's plain-paper top band. The UV seam runs along the ventral midline, in plain cream.
  - The belly stays plain cream with the throat pleats, as in the key art. Kun's base color is the texture's own paper (sampled: `#F6ECDC`), so the textured area has no visible edge.
- `tex-fin-waves.png` fills the whole frame (white is only about 21% of pixels). It is a color texture, not a cut-out.
  - Its alpha is baked at build time from whiteness: white → 0.35–0.5, wave ink → 1.0. Nothing is fully transparent.
  - Fin and fluke outlines come from geometry and edge alpha matched to the sheet silhouettes, never from the texture's white areas.
- Fins render double-sided and transparent, with `depthWrite: false`, after the body.

**Reference match** (`tools/silhouette.py`, committed; used for Kun and Peng):
- **One file, three modes:**
  - *Render*, inside Blender, using the exact Blender command form with `--python games/xiaoyaoyou/tools/silhouette.py -- --render <asset> --engine <eevee|cycles>`. It imports `_dev/raw/<asset>.glb` in its rest pose. For each view it renders, through an orthographic camera fitted to the asset's bbox, (a) a mask and (b) a lit, textured preview on the sheet's grey. Both go to `_dev/silhouette/raw/` at 1024 px on the long side. The mask uses a transparent film and a flat override material that is opaque everywhere except where a fin or feather's edge alpha cuts the outline; interior translucency counts as solid.
  - *Compare*, with `python3` (numpy, Pillow and SciPy; no installs): `python3 games/xiaoyaoyou/tools/silhouette.py --compare <asset>`.
  - *Pair*, for the show-and-wait step: `python3 games/xiaoyaoyou/tools/silhouette.py --pair <left.png> <right.png> <out.png>` writes a side-by-side image.
- **Views and cameras** (image orientation as in the sheets):
  - Kun side: head to the right. Kun top: looking down, head at the top. Kun front: looking at the face.
  - Peng top: looking down, head at the top. Peng side: head to the left; preview only, with no IoU. Peng front: no camera and no IoU (see Decisions).
- **Reference masks** (Richard's verified facts):
  - The background is a uniform grey: Kun ≈ rgb(155,156,158), Peng ≈ rgb(176,175,175), std < 1.2.
  - Mask = RGB distance from the background > 30, then fill holes. Pale body paint is close to the grey and leaves holes.
  - Split the views by connected components, never by rectangles: the views' bounding boxes overlap in x. After a 6-px dilation the measured boxes (x0, y0, x1, y1) are:
    - Kun side (5, 194, 1254, 569), top (1223, 21, 1632, 731), front (1624, 190, 2067, 531)
    - Peng top (6, 14, 1760, 555), front (0, 518, 1085, 849), side (1118, 540, 1773, 852)
  - Peng also has about 11 small detached brush flecks; each joins the nearest view. The tool asserts that every view's box is within ±10 px of these numbers, so a broken mask fails loudly.
  - Authoritative views. Each view is judged only for what it shows reliably:
    - Kun side: body profile and fin lengths
    - Kun top: fluke and fin sweep
    - Kun front: fin count and angles (two pairs: an upper pair raised outward, a lower pair angled down)
    - Peng top: wing planform and wingspan
    - Peng front: wing dihedral, judged by eye only. It is not a true orthographic front.
    - Peng side: head, neck and plume profile only. It is not a true orthographic side.
- **Normalize and compare:**
  - The views in each sheet are not at the same scale, so every mask, reference and render alike, is normalized to its own bounding box. Crop to the box, scale *uniformly* so the long side is 240 px, and center the result on a 256×256 canvas. Uniform scaling keeps proportion errors visible. Specks smaller than 0.2% of the view's area are ignored when finding the box.
  - Light blur: a Gaussian with σ = 1.5 px (at 256 px) on both masks, then a threshold at 0.5, so wispy brush edges don't dominate.
  - IoU = |A∩B| ÷ |A∪B| for each view. Also report both boxes' aspect ratios as a diagnostic.
- **Thresholds:** Kun side ≥ 0.80, top ≥ 0.75, front ≥ 0.70. Peng top ≥ 0.75; Peng also needs Richard's visual approval of the side-by-side images.
- **Outputs:**
  - `_dev/silhouette/<asset>-<view>.png`: three panels, each 512 px wide: reference crop | Blender lit preview | overlay (both = grey, reference only = blue, render only = red).
  - `_dev/silhouette/<asset>.json`: `{ commit, asset, engine, views:{ <view>:{ iou, threshold, pass, refBox, refAspect, renderAspect } } }`, plus a printed table.
- **Fixed procedure.** Cameras, normalization, blur and thresholds are set here and never tuned to raise a number. The reference images are never edited. Every view comes from the same mesh in the same rest pose, and no part is shaped to look right in one view at the expense of another.

**Text:** `text.json` = `{ "lines": [ { "id", "beat", "kind": "source|original|ui", "zh", "en", "draft": true, "verify": true|false, "note"? } ] }`.
- Every line has `"draft": true`.
- Every `source` line has `"verify": true`, meaning a human must still check it.
- Every `source` line's `zh` must equal, character for character (NFC), its entry in the passages block below.
- `en` is Codex's own fresh draft; never recall or adapt a published translation.
- No on-screen text may exist outside `text.json`.
- `tools/check_text.py` runs with `/Users/richardzhu/game-assets/.venv/bin/python` and fontTools. It parses the passages block in this file and validates `text.json`. It lists any characters missing from each font subset, then prints `{lines, sourceExact, allDraft, sourceVerify, missingGlyphs:{wenkai:[],garamond:[]}}`.
- `tools/subset_fonts.sh` subsets the fonts with `/Users/richardzhu/game-assets/.venv/bin/pyftsubset`: LXGW WenKai for `zh`, EB Garamond for `en`. Output is woff2 if `brotli` imports in that venv, otherwise woff.

**Canonical source passages** (simplified Chinese, received text; Codex copies these and never retypes from memory; Richard verifies before publication):

```passages
title | 逍遥游
north-1 | 北冥有鱼，其名为鲲。
north-2 | 鲲之大，不知其几千里也。
breach-1 | 化而为鸟，其名为鹏。
breach-2 | 鹏之背，不知其几千里也；怒而飞，其翼若垂天之云。
ascent-1 | 鹏之徙于南冥也，水击三千里，抟扶摇而上者九万里，去以六月息者也。
encounter-0 | 蜩与学鸠笑之曰：
encounter-cicada | 我决起而飞，抢榆枋而止，时则不至，而控于地而已矣
encounter-dove | 奚以之九万里而南为？
south-1 | 是鸟也，海运则将徙于南冥。南冥者，天池也。
closing | 至人无己，神人无功，圣人无名。
```

Notes for `text.json`:
- `encounter-cicada`: the source gives the cicada and dove one joint speech. Splitting it between two bubbles is staging; note that in the line's `note`.
- 抢 has the variant 枪 in some editions; note it for Richard.

**Color arc:** the north sea is cold and dark: deep blue-teal water, cream Kun, red motes. From the breach on, through the Peng beats and the southern sea, the world is a warm sunset: gold, coral, rose and violet, with ink-dark wings rim-lit warm.

**Art palette** (sampled from the key art on 2026-10-26; tokens change only with Richard's OK; the hue bands are the gate):
- Shared: ink `#17171C`, paper `#EFE7D6`, paper-shade `#D9CFBB` (UI and end card), vermilion `#D4432C` (motes, seal, Peng's plumes).
- North sea, from `key-north-sea.png`: abyss `#0B161C`, deep `#172A35`, sea `#30444E`, haze `#607277`, shaft `#939994`, Kun lit `#E2D8C1`, Kun paper `#F6ECDC` and landscape ink `#2B3746` (both from `tex-kun-landscape.png`).
- Sunset, from `key-peng-sunset.png`: gold `#FDC270`, sun `#FCA45B`, apricot `#F79153`, coral `#E36A47`, rose `#C37566`, mauve `#8C6267`, violet dusk `#64525F`, warm ink `#322222`.
- Hue bands for saturated pixels:
  - cold: 185–225°. In the key art, 99% of saturated pixels fall in 191–208°; the texture ink sits at about 212°.
  - red: 345–360° and 0–20°
  - warm: 260–360° and 0–55° (violet → rose → coral → apricot → gold). In the key art, 99% fall in 348–47°.
- Band set by beat: `title`, `test` and `north` → cold + red. `breach` → cold + red + warm. `ascent`, `encounter`, `south` and `end` → warm.

**Budgets** (at every checkpoint):
- draw calls ≤ 150
- triangles ≤ 300,000 in the frame, and ≤ 60,000 per hero (Kun, Peng)
- texture ≤ 2048 px per axis
- pixel ratio ≤ 2
- runtime download < 20,000,000 bytes, summed from the network log of a full autoplay

The 60 fps target is checked manually by Richard on an M-series Mac. It is not a nightly gate, because headless WebGL is software-rendered.

## Milestones

- [ ] Milestone 0: Scaffold, empty scene, capture tool

  Static page, vendored Three.js and LICENSE, title screen showing 逍遥游 and "Free and Easy Wandering" with a Begin button, loading bar, an empty scene after Begin (`deep` clear color and fog), all page globals and URL params, and `tools/capture.mjs` producing the full evidence set. Server checked or started per unattended rule 5.
  - `title-desktop.png` and `title-narrow.png` show the title, subtitle and Begin button fully visible on a paper or `deep` background. `textOverflow` is `[]` at both viewports. `loading-desktop.png` shows a visible progress bar, and `metrics.extra.readyDuringLoading === false`.
  - `console.json` lists 0 `pageErrors`, 0 console errors, 0 `failedRequests` and 0 `externalRequests`. `requests` includes `vendor/three/…` with status 200.
  - `metrics.json`: `readyMs` ≤ 10,000. At `title` and `north-start`, `drawCalls` and `triangles` are finite numbers. `pixelRatio` is 1 on desktop and exactly 2 on narrow (DSF 3 is capped). `threeVersion` is recorded.
  - Show and wait: browser screenshots; Blender and IoU n/a.
  - Fallback if stuck: if Chromium cannot launch with WebGL, try the SwiftShader args. If it still fails, write `NEEDS RICHARD: chromium launch` in LOG with the exact error.

- [ ] Milestone 1: Kun model + silhouette match (Blender previews only)

  `blender/common.py`, `blender/kun.py` and `tools/silhouette.py`. No browser work. Kun follows **Hero modeling** and **Kun textures**.
  - **Shape:**
    - The body is lofted from 16 or more cross-sections along a curved spine, then subdivided.
    - A horizontal whale fluke with two lobes and ink-wave trailing edges, as in the top view.
    - Two pairs of fins as thin sheets: an upper pair raised outward and a lower pair angled down (front view), with lengths from the side view and sweep from the top view.
    - Details to match by eye: the eye behind the mouth line, the throat pleats from chin to mid-belly, and the dorsal ridge point at the top of the front view.
  - **Nodes:** `kun_body`, `kun_fluke`, `kun_fin_upper_L`, `kun_fin_upper_R`, `kun_fin_lower_L`, `kun_fin_lower_R`. Materials: `kun_skin` (landscape plus cream belly) and `kun_fin` (wave texture with baked alpha).
  - **Renderer gate:** try `--engine eevee` once. If it exits non-zero or crashes, use `--engine cycles` (CPU, 16 samples). Record `RENDERER: <engine>` in LOG for later runs.
  - Export `_dev/raw/kun.glb`, then run `silhouette.py` in render mode, then compare mode.
  - **Criteria:**
    - `_dev/silhouette/kun.json`: side IoU ≥ 0.80, top ≥ 0.75, front ≥ 0.70.
    - `_dev/silhouette/kun-side.png`, `kun-top.png` and `kun-front.png` exist, and the lit previews show:
      - the landscape on the back and upper flanks, not stretched or tiled
      - a plain cream belly and no visible seam in any view
      - fins showing the wave texture, with the grey visible through white areas and ink areas opaque
      - ragged ink-wave fin and fluke edges
      - a two-lobed horizontal fluke in the top view
    - `asset-stats.json` for `kun`: `triangles` ≤ 60,000, `quadRatio` ≥ 0.90, `loopSpacingRatio` ≤ 3, `bodyNonManifoldEdges` 0, `maxTextureSize` ≤ 2048, all six node names present, `exitCode` 0 for every Blender run, and `engine` and `seconds` recorded.
  - Show and wait: the three silhouette images and the IoU table; browser n/a.
  - Fallback if stuck: set the body's cross-section widths from the side and top masks (per-column extents), trace the fin and fluke outlines from the reference masks, and drop subdivision to level 1.

- [ ] Milestone 2: Kun in the browser — both textures, swim deformation, north-sea test scene

  `tools/optimize_assets.sh`, `assets.json` with a `kun` entry, `src/assets.js`, and the checkpoint `kun-test`.
  - **Test scene:**
    - background gradient from `sea` near the top to `abyss` at the bottom
    - FogExp2 in `deep`, and a key light from above
    - 3–5 light shafts from the surface and about 6 red motes (static is fine)
    - Kun framed like `key-north-sea.png`: a 3/4 view from slightly below, head to the right, about 60% of the frame width
  - **Materials:** the GLB's textures are kept. Shading is soft and top-lit with no glossy specular, plus a cream fresnel rim. The fins are double-sided and transparent, drawn after the body.
  - **Swim:** vertical undulation in the vertex shader (`onBeforeCompile`, so Three's lighting and fog still apply). These are starting targets, and Richard tunes them by eye:
    - the wave travels from head to tail, with amplitude rising toward the fluke
    - the period is 3–5 s of `gameMs`
    - fluke amplitude is 8–15% of body length; head amplitude is ≤ 25% of the fluke's
    - fins follow the body at their roots and lag toward their tips
    - normals bend with the surface
    - no side-to-side motion
  - **Criteria:**
    - `assets.json` has `kun` with `path`, `scale` and `anchor`. A search for `.glb` in `src/` and `index.html` finds nothing. `metrics.assets.kun`: `extensionsUsed` includes `EXT_meshopt_compression` and `EXT_texture_webp`, `maxTextureSize` ≤ 2048, `triangles` ≤ 60,000, and all six node names survive optimization.
    - `kun-test-desktop.png` and `kun-test-narrow.png` show Kun fully in frame and reading against the dark water by value. Both textures are visible, white fin areas show the water through them, there is no seam, and there is no glossy highlight.
    - `kun-view-side-desktop.png`, `kun-view-top-desktop.png` and `kun-view-front-desktop.png` (`?view=`) match the Blender previews: same orientation, same texture placement, translucent fins. Nothing was lost in export or optimization.
    - `kun-swim-desktop.png` (4 frames at `?phase=0, 0.25, 0.5, 0.75`) shows the fluke clearly up and then down, the head nearly still, no cracks at the fin roots, and fins that never vanish or pop. `metrics.extra.swim = { periodMs, flukeAmpFrac, headAmpFrac }`, read from the swim config, is inside the ranges above.
    - `console.json` has a 200 request for `assets/kun.glb` and for the meshopt decoder from `vendor/`, 0 errors and 0 external requests. `drawCalls` ≤ 150. If Kun changed since M1, `silhouette.py` still passes M1's thresholds.
  - Show and wait: the Blender previews next to `kun-view-*`, `kun-test-desktop.png` next to `key-north-sea.png`, the swim strip, and the IoU table.
  - Fallback if stuck: if transparency sorting shows artifacts, draw the fins in two passes (back faces, then front faces) or use alpha hashing. If `onBeforeCompile` fights the lighting, use a ShaderMaterial with Three's fog chunks.

- [ ] Milestone 3: Beat 1 playable — the northern sea (first raw slice)

  `blender/sea.py`: tall ink rock pillars (`ref-pillar-1…n`, irregular extruded profiles with displaced vertices), with small ink pines on their tops as in the key art, at a fixed world size. Runtime motes are instanced red glows; each new mote spawns ahead of the player and drifts into its path, so a player can never miss one. The `kun-test` scene's background, fog, light and shafts carry over.
  - **Growth:** 7 motes. Each one multiplies Kun's scale by about 1.43, reaching about 12×. Camera distance scales with Kun.
  - **Controls:**
    - The pointer offset from screen center steers.
    - Holding the mouse or a touch thrusts forward.
    - Releasing glides to an idle drift.
    - `pointerleave`, `pointercancel` and window blur all release.
    - The canvas has `touch-action: none`.
  - **Exit:** after mote 7, a placeholder end card with Replay appears. M6 replaces it.
  - **Pacing:** beat 1 takes 90–150 s in `gameMs`.
  - **Criteria:**
    - From `--autoplay`, `metrics.extra.growth` holds 7 strictly increasing `kunScale` values with the last ≥ 10. The run has `reachedEnd: true`, and the north beat takes 90,000–150,000 `gameMs`.
    - Scale reads on screen. Between `north-start` and `north-full`, `measure.kun.heightPx` changes by no more than ±35%. `measure['ref-pillar-1']` is `inFrame` at both, and its `heightPx` at full is ≤ 0.25× its value at start. Both desktop screenshots show this visibly.
    - `metrics.extra.inputTest`, driven by real Playwright mouse events on desktop and CDP touch events on narrow:
      - speed after 1 s of holding is ≥ 3× idle speed
      - speed 2 s after release is ≤ 50% of held speed
      - heading changes by ≥ 20° with the pointer at the right edge for 1 s
      - `leaveReleases: true`
      - `touchHold: true`
      - `scrollY` stays 0 during touch
    - `end-card-desktop.png` exists. `drawCalls` ≤ 150 at every checkpoint, and the console is clean. `assets.json` has `sea`.
  - Show and wait: `_dev/previews/sea-*.png` next to a pillar crop of `key-north-sea.png`, `north-start` and `north-full` screenshots, and the Kun IoU table (regression).
  - Fallback if stuck: put the motes on a fixed spline through the pillars with a gentle magnet toward Kun.

- [ ] Milestone 4: North-sea look — light, fog and atmosphere (match `key-north-sea.png`)

  - **Kun:** top-lit wrap shading. The back is bright (`Kun lit`) and the belly falls into cool shadow. A cream rim runs along the silhouette, and back-lit fins brighten where light passes through them. No glossy highlight, no outline.
  - **Light:** 3–6 light shafts from the surface, additive and drifting slowly. The water is brighter toward the surface and near-black below.
  - **Fog and depth:** FogExp2 in `deep`, mist around the pillar bases, and distant pillars fading toward `haze`. Fine suspended specks are optional.
  - **Pillars:** dark ink silhouettes with misty bases and pines on top, no outlines.
  - **Motes:** small additive red glows with soft halos.
  - **Grain** is optional, faint, and never over text. Any bloom must keep silhouettes crisp.
  - **Criteria:**
    - At `north-start` and `north-full` (both viewports): `palette.offPalette` ≤ 0.010 (cold + red), `palette.redShare` ≤ 0.03, and `palette.meanLuma` 35–110 (key art: 69).
    - `kun-closeup-desktop.png` (capture crops 400×400 around the projected Kun) shows:
      - the landscape readable on the back
      - a plain cream belly with no seam
      - translucent fins with ink-wave edges
      - a cream rim along the silhouette edge
      - top lighting
      - no glossy highlight and no dark outline
    - `north-start-desktop.png` next to `key-north-sea.png`: Kun is the brightest large form, the shafts come from above, depth fades into fog, and the pillars are dark with misty bases.
    - `drawCalls` ≤ 150 at every checkpoint, and the console is clean.
  - Show and wait: the close-up and the north screenshots, each next to the key art, plus the palette numbers.
  - Fallback if stuck: make the light shafts static additive gradient planes, and replace the rim shader with a second, slightly larger additive cream hull behind Kun.

- [ ] Milestone 5: Bilingual text, fonts, seal end card — SHIPPABLE VERTICAL SLICE

  This is the first shippable slice, and an unattended night's guaranteed deliverable: title → northern sea with source lines → seal end card → Replay.
  - **Text:** `text.json` holds `title`, the UI strings, `north-1` (shown on entering the sea) and `north-2` (shown after mote 4). It also holds Codex's fresh English drafts.
  - **Display:** the source line is always shown, in LXGW WenKai. The translation sits beneath it in EB Garamond. The `T` key and a visible button toggle the translation; it is on by default.
  - **Fonts:** subset them and copy both OFL files.
  - **End card:** a vermilion square seal reading 逍遥 in paper-colored characters (CSS or SVG), the title, and Replay.
  - **README.md v1:** how to run, controls, credits (Zhuangzi, public domain), font OFL, Three.js MIT, and the text status "draft, pending verification".
  - **Criteria:**
    - `north-text-desktop.png` and `north-text-narrow.png` show 北冥有鱼，其名为鲲。 in WenKai with English beneath, with no missing-glyph boxes. `north-text-off-desktop.png` shows the translation hidden. `metrics.extra.toggle = {key:true, button:true}`, and `textOverflow` is `[]` at every checkpoint.
    - `metrics.text`: `sourceExact: true`, `allDraft: true`, `sourceVerify: true`, and both `missingGlyphs` lists empty. The WenKai subset is ≤ 400 KB. `metrics.extra.licenses` (capture checks the files exist) lists `fonts/OFL-LXGWWenKai.txt`, `fonts/OFL-EBGaramond.txt` and `vendor/three/LICENSE`.
    - `--autoplay --replay` gives `autoplay.runs` of length 2, both with `reachedEnd: true`. At the start of run 2, `motes` is 0 and `kunScale` is 1. `end-card-desktop.png` shows the vermilion seal on paper with Replay. The console is clean across both runs.
    - `drawCalls` ≤ 150 at every checkpoint, and `runtimeBytes` < 20,000,000.
  - Show and wait: the text and end-card screenshots; Blender and IoU n/a.
  - Fallback if stuck: render the seal as a flat CSS square with text; ship woff instead of woff2.

- [ ] Milestone 6: Peng model, breach and transformation

  - **The asset:** `blender/peng.py` follows **Hero modeling**. Peng is crane-like, not a raptor:
    - a long straight beak, a small head and a slender neck
    - 3–6 red ribbon plumes (vermilion sheets) streaming back from the crown
    - a body lofted along a spine
    - wings of layered feather sheets in rows (primaries, secondaries, coverts), each feather an alpha-edged ink-stroke card. The feather texture is generated in code.
    - long trailing tail feathers
  - **Coloring** (from `peng-sheet.png`): ink-dark primaries with ragged brush tips, lighter cream feather bases along the inner wing and trailing edge, and a white neck and body flecked with ink.
  - **Size and parts:** wingspan ≥ 5× the torso, measured from the base of the neck to the base of the tail. `peng.py` records that spine distance as `torsoLength`. Nodes `peng_body`, `peng_head`, `peng_wing_L`, `peng_wing_R`, `peng_tail` and `peng_plume_*`. The rest pose is the sheet's top-view pose.
  - **Flap:** vertex-shader deformation along the span: the root moves least, and the tip moves most, with a phase lag and a spanwise curl. Wingbeats are slow and heavy; Richard tunes the period by eye. The wing nodes also scale from 0 to 1 for the unfurl.
  - **The breach:** after mote 7, Kun rises and breaks the surface (a runtime water plane). Slow motion for about 3 s while an instanced ink-splash burst plays. Kun fades out as Peng's wings unfurl. The camera pulls back and up until the ocean lies far below.
  - **The color arc turns here.** Above the water the world is a warm sunset: a sky from violet dusk at the top through rose and coral to gold at the horizon, a low sun disc, warm fog, and a sea of clouds below with ink peaks. Peng's ink wings carry a warm rim light from the sun behind them.
  - **After it:** the total event lasts 8–15 s of `gameMs`. Controls then resume as Peng.
  - **Text and pacing:** `breach-1` and `breach-2` are shown. The temporary end card now appears about 30 s after the transformation.
  - **Criteria:**
    - `_dev/silhouette/peng.json`: top IoU ≥ 0.75. There is no front score.
    - Richard approves the side-by-side images `peng-top.png` and `peng-side.png`. The side panel must show a long straight beak, a slender neck and plumes matching the sheet's profile. An unattended run can't meet this criterion: it logs `NEEDS RICHARD: Peng visual approval` and leaves the box unticked.
    - `asset-stats.json` for `peng`: `triangles` ≤ 60,000, wingspan ÷ `torsoLength` ≥ 5, `quadRatio` ≥ 0.90, `loopSpacingRatio` ≤ 3, `bodyNonManifoldEdges` 0, and nodes `peng_wing_L` and `peng_wing_R`. After optimization, meshopt is applied and the nodes survive. `assets.json` has `peng`.
    - `peng-view-*-desktop.png` (`?checkpoint=peng-test&view=`) match the Blender previews.
    - `metrics.extra.transformation = { triggerCount:1, durationGameMs in 8000–15000, kunVisibleAfter:false, pengVisibleAfter:true, controlsResumed:true }` from autoplay. Holding input during the event does not trigger it again.
    - At `breach-peak`, `measure.peng.inFrame` is true at both viewports, and the desktop `widthPx` is ≥ 0.4 × 1440. `measure.cameraAltitude` at `peng-flight` is ≥ 3× its value at `breach-peak`. `peng-flight-desktop.png` shows the sea far below the horizon.
    - `offPalette` ≤ 0.010 at `breach-peak` (cold + red + warm) and at `peng-flight` (warm). `warmShare` ≥ 0.25 at `peng-flight` (key art: 0.69). `drawCalls` ≤ 150, and the console is clean. No checkpoint shows Kun and Peng both fully visible after the event.
  - Show and wait: the Peng side-by-side images for approval, `peng-view-*`, and `peng-flight-desktop.png` next to `key-peng-sunset.png`, plus the top IoU and palette numbers.
  - Fallback if stuck: replace the ink burst with a quick warm fade-through, and build each wing from fewer, larger feather cards.

- [ ] Milestone 7: Southern sea at sunset and the full ending (REQUIRED; built before the ascent)

  - **The scene:** after Peng's flight, a glide down to `south`. `blender/south.py` builds ink rock islands with pines, as in the key art. The sun sits low on the horizon (`sun` and `gold`) with a glitter path across warm water. The sky runs from gold near the sun through coral and rose to violet dusk overhead.
  - **Text:** `south-1` at arrival, then `closing`, then the seal end card with the closing line above Replay. This replaces the temporary end card.
  - **Story graph:** registered as `[north, breach, south, end]`, so M8 and M9 can insert themselves.
  - **Criteria:**
    - Autoplay beats arrive in the order `north → breach → south → end`, with `gameMs` timestamps. `totalGameMs` is 210,000–480,000 and `reachedEnd: true`. A second run after Replay starts with `motes` 0, Kun visible, Peng hidden and no text showing.
    - At `south-arrival` (both viewports): `offPalette` ≤ 0.010 (warm) and `warmShare` ≥ 0.25. The screenshot shows the key art's warm sunset, with no blue sky and no green.
    - `closing-desktop.png` and `closing-narrow.png` show 至人无己，神人无功，圣人无名。 with its English draft. `metrics.text` has `sourceExact`, `allDraft` and `sourceVerify` all true and `missingGlyphs` empty after re-subsetting. `textOverflow` is `[]`.
    - `drawCalls` ≤ 150 at every checkpoint, the console is clean, `previews/south-*.png` exist, and `assets.json` has `south`.
  - Show and wait: the south previews and `south-arrival-desktop.png`, each next to `key-peng-sunset.png`, plus the palette numbers.
  - Fallback if stuck: make the islands extruded ink profiles on a single plane.

- [ ] Milestone 8: Ride the whirlwind up through the clouds (CUTTABLE)

  - **Beat:** `ascent` is inserted between `breach` and `south`.
  - **The whirlwind:** a spiral column built in Python, with ink-stroke ribbons around it.
  - **Clouds:** 3 sunset-lit cloud layers (cream-gold tops, coral and rose flanks, mauve and violet shadows), using InstancedMesh, one draw call per layer.
  - **Flight:** inside the column, altitude rises automatically while the player steers. Drifting out gently pulls the player back. There is no fail state.
  - **Text:** `ascent-1`.
  - **Criteria:**
    - `metrics.extra.ascent.altitudeSamples` holds ≥ 5 strictly increasing values, with entry and exit events. The ascent takes 60,000–150,000 `gameMs`, and the full autoplay `totalGameMs` is 300,000–480,000.
    - `ascent-low`, `ascent-mid` and `ascent-high` desktop screenshots show sea below, then inside the clouds, then above a cloud floor, in that order. `offPalette` ≤ 0.010 (warm) at all three.
    - Stuck test: in `metrics.extra.cornerHold`, holding the pointer in a screen corner for 20 s of `gameMs` during the ascent still raises altitude. `drawCalls` ≤ 150 and `triangles` ≤ 300,000 at `ascent-mid`, and the console is clean.
  - Show and wait: the three ascent screenshots, `ascent-high` next to `key-peng-sunset.png`, plus the palette numbers.
  - Fallback if stuck: make the whirlwind a single twisted ribbon, with the clouds as instanced billboards.

- [ ] Milestone 9: The cicada and the dove (CUTTABLE; needs M8)

  - **Assets:**
    - `blender/tree.py` builds a recursive elm or sandalwood tree with 3 or more branch levels and ink foliage clumps.
    - `blender/cicada.py` builds a body with two pairs of paper-colored wings laid over it.
    - `blender/dove.py` builds a body with a beak and a fanned tail.
  - **Staging:**
    - Midway up the ascent, the camera frames the tree tiny below Peng.
    - Narration `encounter-0` appears, then the `encounter-cicada` and `encounter-dove` bubbles, each anchored to its creature's projected position, with translations under the toggle.
    - The scene dismisses after 6 s or on a click, and the ascent resumes.
  - **Criteria:**
    - `tree-*.png`, `cicada-*.png` and `dove-*.png` previews show the silhouettes above, with no shipped primitive. `metrics.assets`: tree ≤ 6,000 triangles with node names showing ≥ 3 branch levels, cicada ≤ 1,500 and dove ≤ 2,000. All three are in `assets.json`.
    - `encounter-desktop.png` and `encounter-narrow.png` show the narration plus 2 bubbles, readable and each next to its creature, with `textOverflow` `[]`. `measure.peng.widthPx` is ≥ 5 × `measure.dove.heightPx`.
    - `metrics.extra.encounter = { bubbles:2, dismissed:true, resumed:true }`. `metrics.text` checks pass. `totalGameMs` is 300,000–480,000, `drawCalls` ≤ 150 at `encounter`, and the console is clean.
  - Show and wait: the three previews and the encounter screenshots; IoU n/a.
  - Fallback if stuck: put the cicada and dove on a single branch, with no full tree.

- [ ] Milestone 10: Audio, budget audit, README handoff (audio CUTTABLE; audit and README required)

  - **Audio:** procedural Web Audio:
    - an underwater drone (filtered noise plus a low sine)
    - a sky wind (band-passed noise with an LFO)
    - a pentatonic chime on each mote
    - a swell during the transformation
  - **Audio rules:** one AudioContext, created on the first user gesture. Mute with a button and the `M` key. Replay never builds a second graph.
  - **README.md final:**
    - pipeline and exact commands, including `silhouette.py`
    - controls
    - credits and licenses
    - list of draft translations and source lines pending verification
    - the manual fps check left for Richard
    - known issues
  - **Criteria:**
    - `metrics.extra.audio = { contextBeforeGesture:false, contextsAfterReplay:1, mutedGain:0, externalAudioRequests:0 }`. Skip this criterion only if the audio part is cut, and record that in LOG.
    - A table in `metrics.extra.budget` covers every checkpoint at both viewports: `drawCalls` ≤ 150, `triangles` ≤ 300,000, `pixelRatio` ≤ 2, `maxTextureSize` ≤ 2048. Each hero is ≤ 60,000 triangles. `runtimeBytes` from a full autoplay is < 20,000,000.
    - `--autoplay --replay` reaches the end twice, the console is clean throughout, and every checkpoint screenshot exists at both viewports. Both heroes still pass their IoU thresholds.
    - `metrics.extra.readme.headings` includes Pipeline, Controls, Credits, Licenses, Text status and Known issues.
  - Show and wait: the budget table, the final IoU tables, and a full screenshot set.
  - Fallback if stuck: audio drone plus chime only.

## Assumptions

- *(Unattended runs only.)* `run_night.sh` runs the grader between Codex runs, and the grader can append to LOG.md, untick boxes, and add the `BLOCKED` mark. The runner skips milestone lines ending in `BLOCKED (3 reviews)`, and stops when LOG ends with `NIGHT DONE` or `NIGHT STOPPED`.
- Blender 5.2.1 LTS is at `/Applications/Blender.app` (checked 2026-10-26). Whether it runs sandboxed is settled at M1. In unattended runs the runner pre-approves the exact command form if needed.
- `python3` (`/opt/anaconda3/bin/python3`) has numpy, Pillow and SciPy (checked 2026-10-26). The shared venv has no Pillow, so `silhouette.py` uses `python3`.
- Headless Chromium from the shared Playwright install launches with WebGL (SwiftShader at worst) wherever capture runs. If the sandbox blocks it, the runner pre-approves `node games/xiaoyaoyou/tools/capture.mjs` the same way.
- The pinned Three.js is r171 or later (split core build). M0 records the actual version, and the vendor list adjusts to it.
- `brotli` may be missing from the shared venv, so woff is an accepted fallback.
- *(Unattended runs only.)* Codex's in-app browser is not used overnight.
- The plan lives on `game/xiaoyaoyou` in `/Users/richardzhu/dev/site-xiaoyaoyou`.

## Decisions

- **Quality first, interactive** (Richard, 2026-10-26): built live with Richard present. Each milestone ends with the Blender preview next to the reference, the browser screenshots and the IoU numbers, and a box is ticked only after his OK. The grader and harness remain for unattended runs only.
- **Reference art** (Richard, 2026-10-26): `ref/` holds two key arts (mood), two model sheets (shape) and two textures. The verified facts about them are in **Reference match** and **Kun textures**.
- **Kun** (Richard): a white, whale-like creature with an ink-wash mountain-and-pine landscape across its back and flanks, broad translucent fins with ink-wave edges, a horizontal whale fluke, and slow vertical undulation.
- **Peng** (Richard): crane-like, with a long straight beak, a slender neck and red ribbon plumes; not a raptor. Wingspan ≥ 5× the torso.
- **Peng's acceptance** (Richard, 2026-10-26): no front-view score. The sheet's "front" view lays out the neck, body and tail as if seen from above, so it is not a true orthographic front. Peng passes on top-view IoU ≥ 0.75 plus Richard's visual approval of the side-by-side images.
- **Peng's body length** (Richard, 2026-10-26): the torso, from the base of the neck to the base of the tail. Wingspan stays ≥ 5× the torso. In the sheet's top view, beak tip to tail tip is 541 px against a 1,754 px span, a ratio of only 3.2.
- **Color arc** (Richard): the north sea is cold and dark (indigo, cream, red motes); the Peng beats and the southern sea are a warm sunset. This replaces "vermilion only as an accent" and "dawn has no warm hues". Palette tokens are sampled from the key art.
- **Hero modeling** (Richard): Kun and Peng are modeled in Blender from code, never downloaded or AI-generated: lofted cross-sections, subdivision, and thin-sheet fins and feathers. Topology is quad-dominant, with ≤ 60k triangles per hero.
- **Reference match** (Richard): `tools/silhouette.py` with per-view IoU thresholds: Kun side 0.80, top 0.75, front 0.70; Peng top 0.75 (no front score; see Peng's acceptance).
- **Asset manifest** (Richard): every GLB loads through `assets.json`, and game code never hardcodes a GLB path.
- **Milestone order** (Richard): M0 scaffold, M1 Kun model + silhouette match (Blender only), M2 Kun in the browser. The later milestones keep their order, renumbered M3–M10.
- **Evidence:** a committed Playwright capture script writes screenshots, `console.json` and `metrics.json`, and `silhouette.py` writes the reference overlays and IoU (Richard, 2026-10-26).
- **Blender in the sandbox:** if it fails there, the exact command is pre-approved to run outside it (Richard). The renderer is decided once at M1: Eevee is tried once, with CPU Cycles at 16 samples as the fallback.
- **Grader FAIL** (unattended runs only): at most 3 grader reviews per milestone (Richard, 2026-10-26). Each `REVIEW` gets more specific, and the criteria never loosen. After the third FAIL the milestone is `BLOCKED`, and the night either continues or stops according to the prerequisite table in unattended rule 2.
- **Build order differs from story order:** the ending (M7) comes before the ascent (M8) and the encounter (M9), so a short session still ends properly. M5 is the first shippable slice.
- **Growth:** 7 motes, about 12× scale. Success is measured as reference pillars shrinking on screen while Kun stays the same screen size.
- **Text:** simplified received text; the passages are fixed in this file. The cicada and dove speak the source's own line, split into two bubbles. The source line is always shown; the translation beneath it toggles with `T`, on by default.
- **Blender's role:** Blender builds the heroes' geometry, UVs and textures. The runtime keeps those textures and adds the shading and vertex deformation. Prop materials stay name tags that the runtime swaps.
- **Performance:** fps is checked manually by Richard. The automated gates are draw calls, triangles, bytes and texture size. Pacing is measured in simulated `gameMs`.
- **Scope:** in unattended runs Codex edits PLAN.md only to tick boxes. Site integration (`public/`, deploy) is out of scope.
