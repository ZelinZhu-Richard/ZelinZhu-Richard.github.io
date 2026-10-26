# 逍遥游 · Free and Easy Wandering — build plan

A 5–8 minute meditative 3D journey through Zhuangzi's 逍遥游. You are Kun, a small glowing fish. You grow until the sea looks small, become Peng, ride the whirlwind up past a mocking cicada and dove, and arrive at the southern sea at dawn.

Reviewed by Claude and approved by Richard on 2026-10-26. The grader scores every milestone against this file and `REVIEW_RUBRIC.md`.

## Rules for every run (read first, every time)

1. **One milestone per run.** Confirm the worktree (`/Users/richardzhu/dev/site-xiaoyaoyou`), the branch (`game/xiaoyaoyou`) and the Git status. Read this file, then `LOG.md`, then the newest `REVIEW` entry in `LOG.md`. Work only on the **first unchecked milestone**. Never start a second milestone in the same run.
2. **Retry until pass.** If the newest `REVIEW` for this milestone is `FAIL`, first do every numbered instruction in it. Then answer each one by number in your LOG entry. The grader gets more specific on every failed attempt; follow it literally.
3. **What Codex may change in PLAN.md:** only `[ ]` → `[x]` on the milestone it just finished. Never edit the criteria, the passages block, the Decisions, `REVIEW_RUBRIC.md` or existing `REVIEW` entries. Notes, deviations and questions go in `LOG.md`.
4. **Scope** (from GAME.md): write only inside `games/xiaoyaoyou/`. No downloads, no installs, no `npx`, no CDN, no repo-wide build, no push, no branch changes, no Git config or hook changes, no `--no-verify`. `/Users/richardzhu/game-assets` is read-only.
5. **Server:** from the worktree root, `python3 -m http.server 8101 --bind 127.0.0.1`. If `http://127.0.0.1:8101/games/xiaoyaoyou/` already answers 200, reuse it. If port 8101 is taken by something else, log it and stop. Never use another port or address.
6. **Evidence** is produced only by `tools/capture.mjs` (see Contracts) into `_dev/evidence/M<n>/`. `_dev/` is gitignored. Look at every screenshot yourself before ticking. A tick with no fresh evidence counts as a fake pass.
7. **End of every run:**
   - Commit the code with `xiaoyaoyou: M<n> <title>`.
   - Run `capture.mjs` on that clean commit.
   - Append a LOG entry that maps each criterion to its evidence path and states pass or fail with numbers.
   - Tick the box only if every criterion passed.
   - Commit PLAN.md and LOG.md.
   If a commit is blocked, record that in LOG.md and stop the run: files on disk keep the state. Never bypass a blocked commit.
8. **Failure handling:** if the same operation fails twice, log both failures and try the milestone's listed *Fallback if stuck*. A fallback may change how something is built. It never changes the acceptance criteria.
9. **Regressions:** every capture re-runs all checkpoints from earlier milestones. Breaking an earlier criterion fails the current milestone.

## Contracts (fixed, used by every milestone)

**Layout** (paths relative to `games/xiaoyaoyou/`):
- `index.html`, `styles.css`, `src/*.js`
- `vendor/three/` holds Three.js build + addons + LICENSE
- `blender/*.py` are the asset scripts
- `assets/*.glb` are the optimized runtime assets (committed)
- `fonts/` holds the font subsets plus `OFL-LXGWWenKai.txt` and `OFL-EBGaramond.txt`
- `text.json`
- `tools/capture.mjs`, `tools/optimize_assets.sh`, `tools/subset_fonts.sh`, `tools/check_text.py`
- `README.md`
- `_dev/` holds `tmp/`, `raw/`, `previews/`, `build/assets.json` and `evidence/M<n>/`

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
- `window.__GAME_STATE__ = { beat, motes, kunScale, gameMs, translationOn, muted, settled }`. `beat` ∈ `title|north|breach|ascent|encounter|south|end`.
- `window.__GAME_DEBUG__ = { start(), jump(checkpointId), autoplay(on), setTimescale(n), measure() }`.
  - `measure()` returns `{ <name>: { heightPx, widthPx, inFrame } }` for named objects (`kun`, `ref-pillar-1`, `peng`, `dove`, …) plus `cameraAltitude`.
- URL params:
  - `?checkpoint=<id>` jumps straight to a deterministic state and sets `settled=true` after 30 frames.
  - `?autoplay=1` turns on a scripted pilot that steers toward goals and holds forward.
  - `?timescale=N` runs N simulation steps per frame (evidence speed-up only).
  - `?seed=1` fixes the RNG seed.

**Checkpoints** (each milestone adds its own):
- M0: `title`, `north-start`
- M2: `north-full`, `end-card`
- M4: `north-text`
- M5: `breach-peak`, `peng-flight`
- M6: `south-arrival`, `closing`
- M7: `ascent-low`, `ascent-mid`, `ascent-high`
- M8: `encounter`

**Story graph:** beats are registered in an ordered list. M6's ending must work whether or not `ascent` and `encounter` exist; M7 and M8 insert themselves before `south`.

**Capture tool:** `node games/xiaoyaoyou/tools/capture.mjs --milestone <n> [--autoplay] [--replay]`, run from the worktree root.
- Import Playwright from the shared install via `createRequire('/Users/richardzhu/game-assets/node_modules/')`. Launch headless Chromium. If WebGL is unavailable, relaunch with `--use-angle=swiftshader --enable-unsafe-swiftshader` and record the launch args.
- Two contexts:
  - desktop 1440×900, deviceScaleFactor 1
  - narrow 390×844, deviceScaleFactor 3, `hasTouch`
- For every checkpoint and viewport, save `<checkpoint>-<desktop|narrow>.png`.
- A `loading-desktop.png` is taken with vendor responses delayed by 1.5 s via `page.route`.
- Palette and grain stats are computed by loading the screenshot PNG into an in-page 2D canvas, so no image library is needed.
- `console.json`: `{ commit, dirty, capturedAt, entries:[{type,text}], pageErrors:[], failedRequests:[], externalRequests:[], requests:[{url,status,bytes}] }`. Any request not to `127.0.0.1:8101` is external.
- `metrics.json`: `{ generator:"tools/capture.mjs", milestone, commit, dirty, capturedAt, browser:{version,webglRenderer,launchArgs}, readyMs, threeVersion, checkpoints:{ <id>:{ desktop:{drawCalls,triangles,pixelRatio,palette:{offPalette,vermilionShare},measure,textOverflow:[]}, narrow:{…} } }, autoplay:{runs:[{beats:[{id,gameMs}],totalGameMs,reachedEnd}]}, assets:<copy of _dev/build/assets.json>, blender:<same file's blender section>, text:<check_text.py output>, runtimeBytes, extra:{} }`. Milestone-specific fields go in `extra` under the names given below.
- `palette.offPalette`: the fraction of all pixels that are saturated (HSV S > 0.35 and V > 0.25) and whose hue falls outside both allowed bands. Indigo band: 205–250°. Vermilion band: 345–360° or 0–20°.
- `palette.vermilionShare`: the fraction of pixels that are saturated and inside the vermilion band.
- `textOverflow`: every visible text element where `scrollWidth > clientWidth + 1` or `scrollHeight > clientHeight + 1`, or that sits partly outside the viewport.

**Blender** (exact command form; the runner pre-approves it if the sandbox blocks Blender). Run from the worktree root, one command per asset, never from inside another script:

```
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python games/xiaoyaoyou/blender/<name>.py -- --engine <eevee|cycles>
```

- `blender/common.py` sets `preferences.filepaths.temporary_directory` to the absolute `games/xiaoyaoyou/_dev/tmp`.
- It builds palette materials named `ink`, `paper`, `indigo`, `mist`, `vermilion`, `glow`. Blender colors are tags only: the runtime swaps materials by name.
- It exports `_dev/raw/<name>.glb` (GLB, +Y up, modifiers applied).
- It renders fixed-camera previews `_dev/previews/<name>-<side|top|front>.png` at 512×512 on a flat paper-colored world. These are silhouette checks, not look-dev.
- Cycles settings: `device='CPU'`, 16 samples, denoising off, at most 60 s per image.
- It writes stats for that asset (triangles, bbox, node names, engine, exit code, seconds) into `_dev/build/assets.json`.
- Then `bash games/xiaoyaoyou/tools/optimize_assets.sh` runs `/Users/richardzhu/game-assets/node_modules/.bin/gltf-transform optimize _dev/raw/<n>.glb assets/<n>.glb --compress meshopt --texture-compress webp`, then records the byte sizes and `extensionsUsed` (read from the GLB JSON chunk) for each asset.

**Geometry rule:** every body, fin, wing, branch and cloud is shaped in Python (bmesh lofts, extrusions, profiles, displacement or recursion). `primitive_*_add` may only seed a shape that is then substantially reshaped. A scaled sphere, capsule, cone or cylinder shipped as a creature or tree fails the review.

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

**Art palette** (hex; any change fails the review):
- ink `#17171C`
- paper `#EFE7D6`
- paper-shade `#D9CFBB`
- indigo-deep `#16213A`
- indigo `#2C3D63`
- mist `#8D97B0`
- glow (Kun) `#F4ECDA`
- vermilion `#D4432C`: only for the motes and the seal

Dawn is paper light over mist and indigo. It has no orange, pink or gold.

**Budgets** (at every checkpoint):
- draw calls ≤ 150, including outline hulls
- triangles ≤ 300,000
- texture ≤ 2048 px per axis
- pixel ratio ≤ 2
- runtime download < 20,000,000 bytes, summed from the network log of a full autoplay

The 60 fps target is checked manually by Richard on an M-series Mac. It is not a nightly gate, because headless WebGL is software-rendered.

## Milestones

- [ ] Milestone 0: Scaffold, empty scene, capture tool

  Static page, vendored Three.js and LICENSE, title screen showing 逍遥游 and "Free and Easy Wandering" with a Begin button, loading bar, an empty scene after Begin (indigo-deep clear color and fog), all page globals and URL params, and `tools/capture.mjs` producing the full evidence set. Server checked or started per Rules §5.
  - `title-desktop.png` and `title-narrow.png` show the title, subtitle and Begin button fully visible on a paper or indigo background. `textOverflow` is `[]` at both viewports. `loading-desktop.png` shows a visible progress bar, and `metrics.extra.readyDuringLoading === false`.
  - `console.json` lists 0 `pageErrors`, 0 console errors, 0 `failedRequests` and 0 `externalRequests`. `requests` includes `vendor/three/…` with status 200.
  - `metrics.json`: `readyMs` ≤ 10,000. At `title` and `north-start`, `drawCalls` and `triangles` are finite numbers. `pixelRatio` is 1 on desktop and exactly 2 on narrow (DSF 3 is capped). `threeVersion` is recorded.
  - Fallback if stuck: if Chromium cannot launch with WebGL, try the SwiftShader args. If it still fails, write `NEEDS RICHARD: chromium launch` in LOG with the exact error.

- [ ] Milestone 1: Blender → GLB → browser pipeline, with the real Kun

  `blender/common.py` and `blender/kun.py`. Kun is lofted from 8 or more cross-sections along a curved spine, with a forked tail fin, a dorsal fin and two pectoral fins as separate named parts (`kun_body`, `kun_tail`, `kun_fin_*`), using the `glow` material. Renderer gate: try `--engine eevee` once. If it exits non-zero or crashes, use `--engine cycles` (CPU, 16 samples). Record `RENDERER: <engine>` in LOG for later runs. Then `optimize_assets.sh`. The page loads `assets/kun.glb` through GLTFLoader + MeshoptDecoder and shows Kun at `north-start`.
  - `_dev/previews/kun-side.png` and `kun-top.png` exist and show a tapered body, a clearly forked tail and at least 2 visible fins. `metrics.blender.kun`: `exitCode` 0, `engine` recorded, `seconds` ≤ 120.
  - `metrics.assets.kun`: `extensionsUsed` includes `EXT_meshopt_compression`, `triangles` 800–4,000, bbox length÷height 2.5–5, and node names include `kun_body` and `kun_tail`.
  - `north-start-desktop.png` shows Kun fully in frame against indigo. `console.json` has a 200 request for `assets/kun.glb`, a 200 request for the meshopt decoder from `vendor/`, 0 errors and 0 external requests. `drawCalls` ≤ 150.
  - Fallback if stuck: simplify the loft to 6 sections, and attach the fins as extruded flat profiles.

- [ ] Milestone 2: Beat 1 playable — the northern sea (first raw slice)

  `blender/sea.py`: ink rock pillars (`ref-pillar-1…n`, irregular extruded profiles with displaced vertices) and kelp ribbons, at a fixed world size. Runtime motes are instanced vermilion glows; each new mote spawns ahead of the player and drifts into its path, so a player can never miss one.
  - **Growth:** 7 motes. Each one multiplies Kun's scale by about 1.43, reaching about 12×. Camera distance scales with Kun.
  - **Controls:**
    - The pointer offset from screen center steers.
    - Holding the mouse or a touch thrusts forward.
    - Releasing glides to an idle drift.
    - `pointerleave`, `pointercancel` and window blur all release.
    - The canvas has `touch-action: none`.
  - **Exit:** after mote 7, a placeholder end card with Replay appears. M5 replaces it.
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
    - `end-card-desktop.png` exists. `drawCalls` ≤ 150 at every checkpoint, and the console is clean.
  - Fallback if stuck: put the motes on a fixed spline through the pillars with a gentle magnet toward Kun.

- [ ] Milestone 3: Ink-wash look

  - **Materials:** a runtime material swap by name, to a toon material with a 3-step gradient map (NearestFilter) and no specular.
  - **Outlines:** an inverted-hull ink outline (BackSide, normals pushed out in the vertex shader) on Kun and the pillars.
  - **Rim:** a cream fresnel rim on Kun.
  - **Fog:** FogExp2 in indigo-deep underwater.
  - **Motes:** additive vermilion glows.
  - **Paper grain:** generated procedurally at load into a canvas and shown as a full-screen overlay (CSS multiply or a shader pass), opacity ≤ 0.15. No image file.
  - **Criteria:**
    - At `north-start` and `north-full` (both viewports), `palette.offPalette` ≤ 0.010 and `palette.vermilionShare` ≤ 0.03.
    - `kun-closeup-desktop.png` (capture crops 400×400 around the projected Kun) shows:
      - a continuous dark contour around the whole silhouette, tail and fins included
      - 2–3 flat tone bands
      - a lighter cream rim along the silhouette edge, inside the contour
      - no glossy highlight
    - `metrics.extra.grainStd` (luma standard deviation of a 200×200 crop of flat background, 0–255 scale) is between 2 and 12, and `grain-crop-desktop.png` is saved.
    - `drawCalls` ≤ 150 at every checkpoint with outlines on, and the console is clean.
  - Fallback if stuck: replace the rim shader with a second, slightly larger additive cream hull behind Kun.

- [ ] Milestone 4: Bilingual text, fonts, seal end card — SHIPPABLE VERTICAL SLICE

  This is the night's guaranteed deliverable: title → northern sea with source lines → seal end card → Replay.
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
  - Fallback if stuck: render the seal as a flat CSS square with text; ship woff instead of woff2.

- [ ] Milestone 5: Breach and transformation into Peng

  - **The asset:** `blender/peng.py` builds Peng with a body, a fanned tail, and wings `peng_wing_L` and `peng_wing_R`. Each wing is a swept profile whose trailing edge has 5 or more scallops, like cloud edges. Wingspan ≥ 4× body length.
  - **The breach:** after mote 7, Kun rises and breaks the surface (a runtime water plane in indigo). Slow motion for about 3 s while an instanced ink-splash burst plays. Kun fades out as Peng's wings unfurl (wing nodes scale from 0 to 1). The camera pulls back and up until the ocean lies far below.
  - **After it:** above water the world is a paper sky with paper-colored fog. Wing flapping is runtime rotation of the wing nodes. The total event lasts 8–15 s of `gameMs`. Controls then resume as Peng.
  - **Text and pacing:** `breach-1` and `breach-2` are shown. The temporary end card now appears about 30 s after the transformation.
  - **Criteria:**
    - `peng-top.png` and `peng-front.png` show two broad wings with scalloped trailing edges. `metrics.assets.peng`: wingspan ÷ body length ≥ 4, `triangles` 1,500–8,000, nodes `peng_wing_L` and `peng_wing_R`, and meshopt applied.
    - `metrics.extra.transformation = { triggerCount:1, durationGameMs in 8000–15000, kunVisibleAfter:false, pengVisibleAfter:true, controlsResumed:true }` from autoplay. Holding input during the event does not trigger it again.
    - At `breach-peak`, `measure.peng.inFrame` is true at both viewports, and the desktop `widthPx` is ≥ 0.4 × 1440. `measure.cameraAltitude` at `peng-flight` is ≥ 3× its value at `breach-peak`. `peng-flight-desktop.png` shows the sea surface below the horizon.
    - At `breach-peak` and `peng-flight`, `offPalette` ≤ 0.010, `drawCalls` ≤ 150 and the console is clean. No checkpoint shows Kun and Peng both fully visible after the event.
  - Fallback if stuck: replace the ink burst with a quick cream fade-through.

- [ ] Milestone 6: Southern sea at dawn and the full ending (REQUIRED; built before the ascent)

  - **The scene:** after Peng's flight, a glide down to `south`. `blender/south.py` builds distant ink islands. The water is pale mist and indigo, the sky is paper brightening toward the horizon, and the sun is a pale paper disc.
  - **Text:** `south-1` at arrival, then `closing`, then the seal end card with the closing line above Replay. This replaces the temporary end card.
  - **Story graph:** registered as `[north, breach, south, end]`, so M7 and M8 can insert themselves.
  - **Criteria:**
    - Autoplay beats arrive in the order `north → breach → south → end`, with `gameMs` timestamps. `totalGameMs` is 210,000–480,000 and `reachedEnd: true`. A second run after Replay starts with `motes` 0, Kun visible, Peng hidden and no text showing.
    - At `south-arrival` (both viewports), `offPalette` ≤ 0.010 and `vermilionShare` ≤ 0.005. The screenshot shows no orange, pink or gold.
    - `closing-desktop.png` and `closing-narrow.png` show 至人无己，神人无功，圣人无名。 with its English draft. `metrics.text` has `sourceExact`, `allDraft` and `sourceVerify` all true and `missingGlyphs` empty after re-subsetting. `textOverflow` is `[]`.
    - `drawCalls` ≤ 150 at every checkpoint, the console is clean, and `previews/south-*.png` exist.
  - Fallback if stuck: make the islands extruded ink profiles on a single plane.

- [ ] Milestone 7: Ride the whirlwind up through the clouds (CUTTABLE)

  - **Beat:** `ascent` is inserted between `breach` and `south`.
  - **The whirlwind:** a spiral column built in Python, with ink-stroke ribbons around it.
  - **Clouds:** 3 cloud layers of paper and mist, using InstancedMesh, one draw call per layer.
  - **Flight:** inside the column, altitude rises automatically while the player steers. Drifting out gently pulls the player back. There is no fail state.
  - **Text:** `ascent-1`.
  - **Criteria:**
    - `metrics.extra.ascent.altitudeSamples` holds ≥ 5 strictly increasing values, with entry and exit events. The ascent takes 60,000–150,000 `gameMs`, and the full autoplay `totalGameMs` is 300,000–480,000.
    - `ascent-low`, `ascent-mid` and `ascent-high` desktop screenshots show sea below, then inside the clouds, then above a cloud floor, in that order. `offPalette` ≤ 0.010 at all three.
    - Stuck test: in `metrics.extra.cornerHold`, holding the pointer in a screen corner for 20 s of `gameMs` during the ascent still raises altitude. `drawCalls` ≤ 150 and `triangles` ≤ 300,000 at `ascent-mid`, and the console is clean.
  - Fallback if stuck: make the whirlwind a single twisted ribbon, with the clouds as instanced billboards.

- [ ] Milestone 8: The cicada and the dove (CUTTABLE; needs M7)

  - **Assets:**
    - `blender/tree.py` builds a recursive elm or sandalwood tree with 3 or more branch levels and ink foliage clumps.
    - `blender/cicada.py` builds a body with two pairs of paper-colored wings laid over it.
    - `blender/dove.py` builds a body with a beak and a fanned tail.
  - **Staging:**
    - Midway up the ascent, the camera frames the tree tiny below Peng.
    - Narration `encounter-0` appears, then the `encounter-cicada` and `encounter-dove` bubbles, each anchored to its creature's projected position, with translations under the toggle.
    - The scene dismisses after 6 s or on a click, and the ascent resumes.
  - **Criteria:**
    - `tree-*.png`, `cicada-*.png` and `dove-*.png` previews show the silhouettes above, with no shipped primitive. `metrics.assets`: tree ≤ 6,000 triangles with node names showing ≥ 3 branch levels, cicada ≤ 1,500 and dove ≤ 2,000.
    - `encounter-desktop.png` and `encounter-narrow.png` show the narration plus 2 bubbles, readable and each next to its creature, with `textOverflow` `[]`. `measure.peng.widthPx` is ≥ 5 × `measure.dove.heightPx`.
    - `metrics.extra.encounter = { bubbles:2, dismissed:true, resumed:true }`. `metrics.text` checks pass. `totalGameMs` is 300,000–480,000, `drawCalls` ≤ 150 at `encounter`, and the console is clean.
  - Fallback if stuck: put the cicada and dove on a single branch, with no full tree.

- [ ] Milestone 9: Audio, budget audit, README handoff (audio CUTTABLE; audit and README required)

  - **Audio:** procedural Web Audio:
    - an underwater drone (filtered noise plus a low sine)
    - a sky wind (band-passed noise with an LFO)
    - a pentatonic chime on each mote
    - a swell during the transformation
  - **Audio rules:** one AudioContext, created on the first user gesture. Mute with a button and the `M` key. Replay never builds a second graph.
  - **README.md final:**
    - pipeline and exact commands
    - controls
    - credits and licenses
    - list of draft translations and source lines pending verification
    - the manual fps check left for Richard
    - known issues
  - **Criteria:**
    - `metrics.extra.audio = { contextBeforeGesture:false, contextsAfterReplay:1, mutedGain:0, externalAudioRequests:0 }`. Skip this criterion only if the audio part is cut, and record that in LOG.
    - A table in `metrics.extra.budget` covers every checkpoint at both viewports: `drawCalls` ≤ 150, `triangles` ≤ 300,000, `pixelRatio` ≤ 2, `maxTextureSize` ≤ 2048. `runtimeBytes` from a full autoplay is < 20,000,000.
    - `--autoplay --replay` reaches the end twice, the console is clean throughout, and every checkpoint screenshot exists at both viewports.
    - `metrics.extra.readme.headings` includes Pipeline, Controls, Credits, Licenses, Text status and Known issues.
  - Fallback if stuck: audio drone plus chime only.

## Assumptions

- `run_night.sh` gives Codex the first unchecked milestone. The grader runs between Codex runs and can append to LOG.md and untick boxes.
- Richard's test today settles whether Blender runs sandboxed with CPU Cycles. If it doesn't, the runner pre-approves the exact command form above. The plan is identical either way.
- Headless Chromium from the shared Playwright install launches with WebGL (SwiftShader at worst) wherever capture runs. If the sandbox blocks it, the runner pre-approves `node games/xiaoyaoyou/tools/capture.mjs` the same way.
- The pinned Three.js is r171 or later (split core build). M0 records the actual version, and the vendor list adjusts to it.
- `brotli` may be missing from the shared venv, so woff is an accepted fallback.
- Codex's in-app browser is not used overnight.
- This plan was reviewed on branch `claude/xiaoyaoyou-game-plan-9e89f9`. Richard brings it onto `game/xiaoyaoyou` in `/Users/richardzhu/dev/site-xiaoyaoyou` before the night starts.

## Decisions

- **Evidence:** a committed Playwright capture script writes screenshots, `console.json` and `metrics.json`, and the grader re-runs it (Richard, 2026-10-26).
- **Blender in the sandbox:** if it fails there, the exact command is pre-approved to run outside it (Richard). The renderer is decided once at M1: Eevee is tried once, with CPU Cycles at 16 samples as the fallback.
- **Grader FAIL:** the next run redoes the same milestone until it passes. Each `REVIEW` gets more specific; the criteria never loosen (Richard).
- **Build order differs from story order:** the ending (M6) comes before the ascent (M7) and the encounter (M8), so a short night still ends properly. M4 is the guaranteed slice.
- **Growth:** 7 motes, about 12× scale. Success is measured as reference pillars shrinking on screen while Kun stays the same screen size.
- **Text:** simplified received text; the passages are fixed in this file. The cicada and dove speak the source's own line, split into two bubbles. The source line is always shown; the translation beneath it toggles with `T`, on by default.
- **Palette:** vermilion appears only in the motes and the seal. Kun glows cream. Dawn has no warm hues.
- **Blender's role:** materials there are name tags. The ink-wash look lives in Three.js, and Blender previews only check silhouettes.
- **Performance:** fps is checked manually by Richard. Nightly gates are draw calls, triangles, bytes and texture size. Pacing is measured in simulated `gameMs`.
- **Scope:** Codex edits PLAN.md only to tick boxes. Site integration (`public/`, deploy) is out of scope.
