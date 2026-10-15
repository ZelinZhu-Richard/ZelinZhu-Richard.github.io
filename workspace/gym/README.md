# Gym

A standalone, browser-local push-up counter and body-controlled Flying Bird game at `/gym/`. This is an experimental movement estimate, not a form assessment. Physical camera accuracy has not been measured.

## Use

1. Place a stationary camera to your side, far enough away to see your shoulder, elbow, wrist, hip, and ankle. Use good lighting and keep one person in view.
2. Choose **Start camera**. Capture a raised pose with arms comfortably extended, then a lowered pose with bent elbows. Each capture starts after a five-second countdown and requires a brief stable hold.
3. Return to the raised pose. A complete raised → lowered → raised movement earns one rep. A partial movement, short threshold flicker, lost tracking, or an interrupted cycle does not.
4. In **Flying Bird**, calibrate and choose **Start flight**. Raised body = higher bird; lowered body = lower bird. Pass through gaps. The relaxed pace has wider gaps. Pause for rest at any time. Completed reps during an active flight also count.
5. **Try the demo** uses a touch slider or up/down keys without camera access. Demo scores are separate and never add reps or streak days.

A daily streak needs one completed push-up per local calendar day. Yesterday’s streak remains active until the end of today. A missed day resets the current streak; the best streak remains. Progress belongs to this browser and origin. Clearing browser data removes it. There is no device sync. Camera changes, mode changes, Stop, and hidden pages stop all camera tracks and invalidate calibration. A moved body/camera, changed orientation, or unreliable observations requires repositioning or recalibration.

## Implementation

- `pose.js`: confidence and framing checks, aspect-correct 2D elbow/body angles, stable side selection, median calibration, anchor drift detection, and a dwell-based rep state machine.
- `camera.js`, `vision.js`, `vision-worker.js`: video-only camera sessions, cancellation, pinned local MediaPipe Pose Landmarker Lite, one frame in flight, worker processing, and a lower-frequency main-thread fallback.
- `game.js`, `render.js`: continuous calibrated-height flight, scrolling gaps, collisions, score, pause/resume, and a canvas renderer. Stale/background time is discarded rather than advancing the game suddenly.
- `history.js`: date-keyed counts and separate real/demo best scores. Device local calendar dates determine streaks; UTC day ordinals avoid daylight-saving arithmetic errors. Future dates do not lengthen today’s streak. Concurrent tabs refresh storage before writes, but simultaneous writes are not transactional.
- `app.js`: explicit setup/playing states and lifecycle cleanup. Calibration and body observations stay in memory. It never records frames or audio.
- `build.mjs`: verifies vendor SHA-256/byte counts, then copies an allowlist to `dist/gym/`. It excludes tests, documentation, integration scripts, and local QA files.

The height signal is the 2D distance between the shoulder and the wrist–ankle support line, normalized by support length, and calibrated to the two poses. Raw model depth is not a physical distance from the floor. Elbow extension and body height must agree. The camera angle, framing, lighting, and occlusion affect results. Movement detection checks body anchors; it cannot identify every camera movement or guarantee correct exercise form. This release is designed for side-view, straight-body push-ups; other variations are not validated.

## Privacy

All inference runs on the device. Scripts, WASM, and the pose model are hosted on the same site; no external model service or training upload is used. Camera access is requested only by Start. Microphone access is never requested. A restrictive Content Security Policy permits same-origin assets and connections, with local worker/WASM execution. Saved data contains only local dates, rep counts, and game best scores under `richard-gym-v1`. If storage is unavailable, the UI reports session-only progress. Erase saved progress removes only Gym’s storage key.

Loading a website is still network activity. GitHub Pages receives normal requests and may log IP addresses for security: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection. The app does not send camera frames or body landmarks to GitHub or use them for training. No claim is made that any software is completely risk-free.

## Dependencies and attribution

MediaPipe Tasks Vision **0.10.14** and **Pose Landmarker Lite float16 v1** are bundled under `vendor/`, with Apache 2.0 license and exact hashes in `vendor/manifest.json`. No package/CDN model downloads occur at runtime. Official model source is recorded in the manifest. Upstream documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js.

## Verify and release

From the repository root, run `npm test` and `npm run build`. Preview with the repository’s preview command. The directory route supports direct refresh; the hosting server redirects `/gym` to `/gym/`. The existing GitHub Pages workflow tests and builds the site. `integrate.py` applies only Gym navigation, project, build, and verification additions; it can also transform HEAD copies to keep unrelated working changes out of a release.

See `VALIDATION.md` for measured checks and pending physical acceptance. Keep the experimental label until real-device testing supports a stronger claim.
