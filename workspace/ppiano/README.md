# Paper Piano

A browser-local instrument at `/ppiano/`. Gesture Synth follows the controls demonstrated by [Eric Wei’s Gesture Synth](https://gesture-synth-weld.vercel.app/), independently implemented. Paper Piano recognizes a guided hand-drawn keyboard and estimates taps after per-finger calibration.

## Run and build

From the repository root: `npm run dev`, then open `/ppiano/`. `npm test` includes the app tests. Production assets are copied into `dist/ppiano/` by `buildPaperPiano()`. No backend, microphone, account, telemetry, or camera upload is used. Camera access requires HTTPS or localhost. Permission is requested only after Start camera.

All first-party source, dependency artifacts, samples, tests, and project documentation live in this directory. The app uses the existing portfolio fonts. It does not load the captured homepage runtime.

## Architecture

- `music.js`, `hands.js`: chord construction, rotation-aware finger extension, stable hand matching, gesture stabilization.
- `geometry.js`, `detection.js`: perspective transforms, actual drawing recognition through OpenCV, key geometry, occlusion-aware corner drift checks. Automatic recognition requires eight white keys and five filled black keys; it never invents a keyboard when recognition fails.
- `paper.js`: per-finger calibration, normalized relative hand features, and a press/release state machine. Two raised frames arm a finger; two contact frames press it. A different key cannot retrigger until the finger lifts. Physical contact is inferred, not measured.
- `camera.js`, `vision-worker.js`, `vision.js`: cancellable camera lifetime and one tracking request in flight. MediaPipe uses a CPU worker, with a throttled main-thread compatibility path when workers cannot initialize. OpenCV loads only when scanning.
- `audio.js`: source-owned polyphonic voices, synth oscillators, sampled instruments, envelopes, sustain, filter, limiter, and analyser.
- `renderer.js`, `app.js`: contained camera view with explicit mirroring, interactive correction, accessible controls, calibration, and keyboard fallback.

Keyboard drawings use C4–C5 (eight whites, five blacks). Start with landscape white paper, a dark marker, a closed rectangle, filled black keys in groups of two and three, and a fixed angled camera. Tap calibration is session-only and invalidated on camera/mode changes, orientation changes, or detected paper movement. Two index fingers are selected by default; all ten fingers can be calibrated.

## Third-party assets

Pinned versions and SHA-256 hashes are in `assets/manifest.json`. `fetch-assets.py` is a manual acquisition utility; builds never download dependencies. The manifest records the exact sample-library commit. The script’s initial sample-commit lookup tracks upstream and must not be rerun to silently update a release; review and replace the manifest deliberately when updating.

- MediaPipe Tasks Vision **0.10.14**, hand-landmarker float16 model **version 1**, Apache 2.0. Runtime licenses under `vendor/`.
- OpenCV.js **4.13.0**, Apache 2.0; self-contained WASM distribution.
- Selected piano, violin, and French horn MP3 samples from **Nicholaus P. Brosowsky’s tonejs-instruments**, **CC BY 3.0**. Licenses and original source credits under `assets/`. Samples are unchanged; playback uses pitch shifting between sampled notes. The interface also provides these credits.

Reference research used the user-supplied recording, the public guide, and static analysis of source excerpts (REA evidence `ev_3e407a34022001a69d2e8d30ff7c65bdc5f0acdf92895902fda26ff03c519cc8`). No reference application code, recordings, or original instrument samples are redistributed.

## Accuracy and verification

**Paper mode is experimental.** One RGB camera cannot directly measure table contact. Calibration estimates contact from finger flexion, tip motion, and depth relative to the hand. A hovering finger curled into its calibrated contact pose can still be mistaken for a tap. Better lighting, a lower camera angle, visible fingers, and a fixed palm position help. The setup includes two verification taps for each finger, but that is not a substitute for independent validation.

Physical release targets: at least 95/100 intentional taps, at most one false note in 60 seconds hovering, reliable three-note chords, and median tap-to-sound latency below 150 ms. Test on three independently drawn keyboards with laptop, external webcam, and phone rear cameras. Record device, browser, lighting, angle, misses, false positives, and latency in `VALIDATION.md`. Do not claim these targets have passed without measurements.

Hidden pages and Stop shut down streams/workers and release voices. Selecting another camera or mode requires a fresh Start. Keyboard and touch input remain available when permission is denied or tracking fails. Selected sample loading failures show an error; choose a synth voice or use Resume/test sound to retry.
