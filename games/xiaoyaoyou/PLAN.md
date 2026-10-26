# Free and Easy Wandering — plan draft

Planning only: awaiting Claude review and Richard approval. No milestone has been implemented or verified by this draft. The estimates below are per later unattended run, not promises; stop at a blocked required acceptance criterion rather than reporting completion.

## Scope and verification contract

All game files, scripts, assets, logs, evidence, and temporary outputs stay in `games/xiaoyaoyou/` in `/Users/richardzhu/dev/site-xiaoyaoyou`, on `game/xiaoyaoyou`. Shared `/Users/richardzhu/game-assets` inputs are read-only. Do not inspect protected data, other worktrees, parent site files, or the launcher/prompt folder. No downloads, installs, repository-wide build, deployment, pushes, branch changes, history rewriting, Git configuration changes, or hook bypasses. Site integration requires separate approval; root `games/` is not currently published by the site builder.

For later runs only:

- Confirm the expected worktree, branch, and clean Git status at the start. Keep PLAN.md and LOG.md current and commit scoped game changes after each completed milestone; retain unchecked boxes for unmet criteria. If a commit or hook blocks completion, record it and stop without bypassing it.
- Use only `python3 -m http.server 8101 --bind 127.0.0.1`, from the worktree root, for local serving. Preview only `http://127.0.0.1:8101/games/xiaoyaoyou/` through Codex's visible built-in in-app browser (`iab` / `@Browser`) in the right panel. Use its supported inspection, screenshots, console capture, and interaction tools. Never launch standalone Playwright Chromium, a personal browser, native desktop automation, or an external browser command. If iab or a required inspection capability is unavailable, record the limitation and leave affected acceptance blocked for review.
- Save evidence under `_dev/`, which is specified as gitignored. Confirm that generated evidence is ignored before generating it; do not change repository-level ignore files. Use fixed browser camera checkpoints and, once the renderer gate passes, fixed-camera Blender previews in `_dev/previews/`. Inspect each image and log concrete deviations from the ink-wash direction before ticking its milestone. Milestone 0 has no Blender geometry and uses browser evidence only; subsequent asset changes require Blender and browser evidence. Other runs can reference unchanged asset previews by path.
- Set Blender's `TMPDIR` to the absolute `/Users/richardzhu/dev/site-xiaoyaoyou/games/xiaoyaoyou/_dev/tmp`. Use headless factory startup only: `/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python <game-local-script>`. No Blender GUI or MCP. Require a successful startup, export, and PNG render in the permitted sandbox before selecting a renderer. Eevee and low-sample CPU Cycles remain candidates, neither assumed viable. Do not disable sandboxing to obtain a pass. If neither works, dependent asset/render criteria remain blocked and the milestone stops.
- After two failures of the same operation, log both failures, try a simpler approach within the same constraints, and verify again. A simpler scene or renderer attempt cannot waive the sandbox/render gate or turn a failed criterion into a pass.
- Runtime: static ES modules, local import map, relative resource URLs, no game build step, no CDN. Vendor matching Three.js core/addons and Meshopt decoder with applicable licenses from the pinned shared inputs. Copy only required runtime files in later runs. Record versions and dependency licenses then; do not assume they were inspected tonight.
- Load with a progress bar and expose `window.__GAME_READY__ = true` only after required assets and text are loaded and the first usable scene frame has rendered. Expose `window.__GAME_STATS__` with numeric `drawCalls` and `triangles`, refreshed from Three.js renderer statistics after rendering. Keep readiness false on failure and show an actionable loading error. Audio waits for a user gesture and never gates readiness.
- Performance targets: shipped download below 20,000,000 bytes, approximately 150 draw calls or fewer at defined story checkpoints, texture dimensions at most 2048 per axis, device pixel ratio capped at 2, and a 60 fps target on an M-series MacBook. Record actual hardware and measurements; unsupported or unmeasured hardware is not a pass. Evidence, raw authoring files, and development dependencies do not count as shipped runtime downloads but must be reported separately.

## Milestones

- [ ] Milestone 0: Scaffold and load an empty scene

  Estimate: 30–60 minutes in one later unattended run. Create only the static page shell, local runtime vendor files and licenses, empty Three.js scene, responsive canvas, title/loading UI, and inspection hooks. Do not create story assets yet.

  - In iab at the required URL, capture a screenshot showing the title, progress reaching 100%, and an empty rendered scene after entering; capture zero uncaught console errors and zero failed runtime requests.
  - Through supported browser inspection, record `window.__GAME_READY__ === true` after the first usable frame, numeric finite `drawCalls` and `triangles`, and an effective pixel ratio no greater than 2. During loading, record readiness false and a visible progress indicator.
  - Capture desktop 1440×900 and narrow 390×844 viewport screenshots with the canvas contained in the viewport and all title controls visible without horizontal scrolling. Record the actual supported viewport sizes if iab cannot set these; leave the specified viewport criterion blocked.

- [ ] Milestone 1: Prove the sandboxed Blender-to-browser asset pipeline

  Estimate: 30–60 minutes in one later unattended run. Use a minimal procedural fish and fixed camera as a pipeline probe before investing in scene art. Test a tiny Eevee render in the sandbox; if it fails, test a tiny low-sample CPU Cycles render under the same sandbox. Select only a mode that successfully starts, exports a GLB, and produces an inspectable PNG. If neither passes, stop here with dependent work blocked.

  - Record the exact successful sandbox command, render engine/settings, Blender exit code 0, and nonempty PNG and raw GLB paths. Inspect the fixed-camera PNG for a recognizable fish silhouette, visible material, and unclipped framing. Preserve failed-engine logs; success outside the sandbox does not satisfy this gate.
  - Run the installed `/Users/richardzhu/game-assets/node_modules/.bin/gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp` on game-local paths. Record exit code 0, input/output byte sizes, and `EXT_meshopt_compression` in the optimized GLB. No `npx` downloads. A texture-free probe is allowed; WebP texture coverage is verified when a textured asset is introduced.
  - Configure the local import map for `three` and `three/addons/`; import `GLTFLoader` from `three/addons/loaders/GLTFLoader.js` and `MeshoptDecoder` from `three/addons/libs/meshopt_decoder.module.js`, all from the same pinned Three.js package. Call `loader.setMeshoptDecoder(MeshoptDecoder)` before loading the optimized GLB. Capture a browser screenshot of the loaded fish and console/network evidence of successful local decoder/asset loads without errors or remote requests.
  - Log finite draw-call and triangle counts for the loaded probe, readiness true after its first usable frame, and a browser/Blender silhouette comparison. Keep both raw and optimized assets inside the game directory; only the optimized asset is a runtime dependency.

- [ ] Milestone 2: Build the northern sea and growing Kun interaction

  Estimate: 30–60 minutes in one later unattended run. Expand the probe into a restrained indigo sea, glowing vermilion motes, fog, and a fish silhouette. Mouse/touch position steers; holding primary input moves forward; releasing slows to a gentle idle. No collision loss or fail state.

  - Collect six motes in iab and log a strictly increasing fish scale at each collection, reaching at least 3× initial scale, with camera distance increasing correspondingly. Capture matching initial/final camera screenshots showing the fish and surrounding sea without clipping.
  - Record mouse and touch interaction checks: steering changes heading, holding advances, releasing slows movement, and leaving/re-entering the canvas does not leave movement stuck. Touch controls must not scroll the page during play; unavailable touch emulation leaves touch acceptance blocked.
  - Inspect a fixed-camera Blender sea/fish preview and browser screenshots at the start and growth endpoint. Log palette use, silhouette separation, and measured draw calls at both checkpoints, with no more than 150 draw calls and no uncaught console errors.

- [ ] Milestone 3: Stage the breach and Peng transformation

  Estimate: 30–60 minutes in one later unattended run. Procedurally author Peng, animate the fish-to-bird handoff, add a short slow-motion breach, and pull the camera back to reveal the ocean below. Optimize and load all new GLBs through the proven decoder path.

  - On the sixth collected mote, trigger exactly one transformation and log transition start/end plus fish/bird visibility. Finish within 8–15 seconds and resume steerable forward flight; repeated holding must not retrigger the event.
  - Capture browser frames before breach, at peak wing spread, and after camera pull-back. Log that the full wingspan fits within the frame at peak and that the apparent ocean area increases after the pull-back. Compare the bird with its inspected fixed-camera Blender preview.
  - Record no more than 150 draw calls at the peak frame and zero uncaught console errors, failed asset requests, or persistent double-rendered fish/bird after transition completion.

- [ ] Milestone 4: Deliver the first playable vertical slice

  Estimate: 30–60 minutes in one later unattended run. Connect title → northern-sea growth story beat → transformation → temporary end card. Add the shared bilingual text system, translation toggle, replay, and gesture-activated procedural ambient audio. This checkpoint is intentionally shorter than the final journey.

  - Complete title-to-end and replay in iab without console errors. Capture title, a source-text story beat, and end-card screenshots; replay resets growth and progress and permits a second complete traversal without reload.
  - Store all displayed source lines and fresh English drafts in game-local `text.json`, with every entry carrying `draft: true` and `verify: true` (requires human source verification). Begin with only the confidently recalled `北冥有鱼，其名为鲲。`; uncertain quotations remain absent. Record button and keyboard translation-toggle checks showing the same line in both languages without overflow at both target viewport sizes.
  - Subset the shared LXGW WenKai and EB Garamond fonts using the shared `.venv/bin/pyftsubset` into the game directory, preserving each OFL.txt. Log input/output sizes and coverage of every displayed character; inspect text screenshots for missing glyphs. Initialize procedural Web Audio only after a user gesture; log mute/unmute and replay without duplicate audio graphs or external audio requests.
  - Log elapsed play time and checkpoint stats for the complete slice, with no more than 150 draw calls at each checkpoint. Review screenshots against rice-paper cream, ink black, deep indigo, and vermilion used only for motes and the end seal.

- [ ] Milestone 5: Add the whirlwind climb and comic interruption

  Estimate: 30–60 minutes in one later unattended run. Replace the temporary exit after transformation with a guided rising whirlwind, layered clouds, and a brief cicada/dove encounter on a small tree below. Use modest geometry and simple scripted animation.

  - Log increasing player altitude across at least three checkpoints and entry/exit events for the climb. Capture frames showing lower ocean, middle clouds, and the tree receding below; maintain steering with no fail state or way to become permanently stuck.
  - Capture a readable bilingual speech-bubble sequence for both small creatures and its dismissal before flight resumes. Clearly classify original comic dialogue in `text.json` separately from source quotations; all entries retain `draft: true` and `verify: true`. Inspect narrow-screen screenshots for zero clipped text or obscured translation controls.
  - Inspect fixed-camera Blender previews for tree/creature assets, record browser stats at the densest cloud/encounter frame with no more than 150 draw calls, and capture zero uncaught console errors across entry, dialogue, and exit.

- [ ] Milestone 6: Complete the southern dawn and full narrative arc

  Estimate: 30–60 minutes in one later unattended run. Connect the climb to the southern sea at dawn, a quiet arrival, a closing source line, and a vermilion seal end card. Complete the four-beat journey and final text/font inventory before visual finishing.

  - Traverse all four story beats in order and reach the end in 5–8 minutes of ordinary continuous play; log beat timestamps and total duration. Idle time is excluded and waiting must never cause a fail state. Verify a second replay clears all scene, text, and audio state.
  - Capture arrival, closing text, and seal screenshots plus a fixed-camera Blender arrival preview. Confirm dawn uses the allowed cream/indigo palette and vermilion remains limited to motes and the seal; record any material exceptions as defects to fix.
  - Provide a source line at each beat, admitting only lines confidently known to be accurate, with all source quotations still marked `verify: true` for human review and all fresh translations marked `draft: true`. Log the complete text inventory, regenerate font subsets for it, and capture both-language screenshots with no missing glyphs. If a closing or other required quotation cannot be selected confidently, leave this criterion blocked for Richard.

- [ ] Milestone 7: Finish the ink-wash treatment, validate budgets, and document handoff

  Estimate: 30–60 minutes in one later unattended run. Add procedural paper grain and a restrained outline/rim treatment, tune fog and contrast, resolve measured regressions, and write `README.md` with pipeline, controls, credits, public-domain source provenance, font/dependency licenses, and known issues. This is the required release-review checkpoint; it does not authorize site publication.

  - Inspect fixed browser checkpoints for all four beats and relevant Blender previews. Record an explicit critique of silhouette separation, text contrast, fog, grain strength, and unclipped framing at desktop/narrow sizes; resolve blocking defects and retain before/after screenshots. Grain must not visibly obscure the smallest dialogue text.
  - Produce a runtime manifest totaling less than 20,000,000 bytes including vendor files, optimized GLBs, fonts, text, and page resources; separately report authoring/evidence sizes. Record maximum texture dimensions no greater than 2048, pixel ratio no greater than 2, and draw calls no greater than 150 at every defined checkpoint, with actual triangle counts.
  - On a recorded M-series MacBook, use supported iab instrumentation to sample at least 60 seconds after warmup across dense scenes: target mean at least 59 fps on a 60 Hz display, and report frame-time p50/p95 and hitches. Capture zero uncaught errors and failed runtime requests on a full replay. Inspect desktop and touch flows, loading failure/retry, translation, mute, and replay; blocked instrumentation or touch testing remains explicitly unmet.
  - Confirm README instructions reproduce the sandbox-gated pipeline and exact localhost URL, list original translation drafts and pending source verification, and explain that site integration needs separate approval. Record the final known issues, human text-review status, scoped commit, and clean Git status without changing build/deploy files.

- [ ] Milestone 8: Optional atmosphere and motion refinement — cut if needed

  Estimate: 30–60 minutes in one later unattended run. Optional, after all required milestones pass: refine wind audio, wing motion, mote drift, and subtle cloud movement. Cut this entire milestone if time or performance is tight; it adds no required story content or controls.

  - Capture before/after browser video frames or screenshots at fixed timestamps for at most two selected refinements, and log their observable change (for example wing cycle duration or cloud drift speed). Inspect changed Blender assets through fixed-camera previews where applicable.
  - Recheck the full journey and selected dense checkpoints: 5–8 minute duration, no more than 150 draw calls, download still below 20,000,000 bytes, and no uncaught errors. Repeat the milestone 7 frame sample only if changes affect rendering or animation cost, and meet its target.
  - Confirm translation, mute, replay, and touch controls still work, update README/LOG with measured changes, and leave this box unchecked with a recorded cut decision if omitted. Optional work cannot conceal a blocked required criterion.

## Assumptions

- This is a plan for human review, with no build authorization implied by the planning commit. Nine milestones, each estimated at 30–60 minutes, balance the requested early pipeline proof, milestone-4 slice, and required final review. Milestone 8 alone is optional; failures can require another approved run rather than expanding a run indefinitely.
- The specific instruction to keep files in `games/xiaoyaoyou/` governs this task; no workspace conversion or sibling-folder creation is intended. No protected data is needed. The launcher/prompt repository is out of scope.
- Known pre-flight facts are accepted without retesting tonight: Blender 5.2.1 worked outside the sandbox and crashed during sandbox startup/Metal initialization; CPU Cycles inside it is untested. Switching engines may not resolve startup. Node 24.11.0 and the pinned shared tools/fonts are available, and Meshopt/WebP optimization previously passed. None of this proves the required future sandbox render or iab workflow.
- Selecting a renderer requires the milestone-1 sandbox gate. Eevee is tried first for speed; low-sample CPU Cycles is a candidate only. Preview scripts keep camera, framing, and materials compatible with both, using a modest engine-specific render configuration. No proven fallback or permission to disable sandboxing is assumed.
- Runtime art uses procedural low-poly geometry, simple materials, sparse motes/cloud layers, browser fog, and a procedural grain overlay. Texture-free assets are preferred; any later texture must pass the size/WebP checks. Rim/outline details can be simplified to meet measured budgets without dropping the ink-wash palette or core silhouette treatment.
- One guided route, six growth pickups, 3× fish growth, an 8–15 second transformation, and auto-guided vertical progress are provisional pacing choices. Scale and camera progression convey a vast world; the flight stays safe and steerable. These values are tuned only against the required 5–8 minute full run.
- Readiness means usable visuals/text, not audio permission. Renderer statistics are sampled after rendering and represent the whole displayed frame; any multipass effects must be counted. The decimal 20 MB threshold, viewport sizes, and 59 fps average/60-second sample operationalize the brief for review; they are measurements to collect later, not current claims.
- LXGW WenKai serves Chinese and EB Garamond serves English. Text is short, manually curated, and toggled with a visible button and a documented key. Translations are fresh drafts; comic speech is original dialogue, not attributed quotation. `verify: true` always means human verification is still required. Human approval is required before removing draft/review labels or publishing reviewed text.
- A fixed camera and scripted story checkpoints are acceptable evidence aids, with all helpers/evidence game-local. No standalone Playwright launch is an acceptable substitute for unavailable iab. Browser or hardware limitations leave the relevant visual/performance/touch criterion blocked rather than inferred from terminal checks.
- Current site publishing excludes root `games/`; local review is the only delivery assumed. README and license files are required even if optional atmosphere is cut. No automatic Claude delegation or review is authorized by this draft; the requested log describes the next human-controlled review step.

## Open questions

1. Richard: after Claude review, approve this milestone sequence and provisional pacing thresholds for later build runs, or identify changes before implementation.
2. Richard: which source edition and exact passages should anchor the transformation, ascent, and closing line, and who will verify quotations and fresh translation drafts before publication?
3. Richard: if both render candidates fail inside the permitted sandbox, choose whether to pause the project or separately approve an environment repair; dependent acceptance stays blocked until a successful sandbox test.
4. Richard: after local acceptance, separately approve whether and how to integrate this game into the site publishing pipeline. No integration changes are included here.
