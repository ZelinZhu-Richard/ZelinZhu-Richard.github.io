# Validation — October 15, 2026

## Dust Release addition

- The full repository suite passes **95 tests**. Eight new Dust Release tests cover small gaps and touching fingertips; both thumb/index pairs; front-facing palms versus backs, fists, edge-on or missing hands; rotation, scale and camera aspect ratio; reordered detections and raw/smoothed metadata alignment; charge timing, held-seal suppression, separation/rearm and cooldown; stale/slow results and reset; mirrored origins, perspective, expiration and reduced-motion particle suppression.
- The production build verifies **177 files**, including `domainexp/dust.js`. The pinned model/runtime is unchanged. Camera results now retain the source aspect ratio, handedness and world landmarks for palm orientation; Domain and Fireball retain their existing recognition rules.
- The actual worker/model was run on the same official MediaPipe sample photograph. Both visible front-facing palms pass the new orientation check, and the separated photo hands correctly request closer thumbs. This is a photograph check of model output, not live physical seal recognition.
- A full app browser harness with a labeled simulated camera and 240 ms delayed synthetic landmarks passed charge/release, single release while held, expiration, missing-hand suppression, deliberate separation/recast, rejection of backward-facing palms, switching among all three modes with one camera stream, 375 px layout without overflow, Stop cleanup, and repeated restart cleanup.
- The interface was inspected at 1280 px, 375 px, and the user's 652 px browser width. Active visual fixtures freeze a synthetic seal's release at 500 ms. The final cube sizing was checked again at desktop/mobile widths, and the targeted Dust tests passed after that adjustment. These screenshots establish visible rendering, not motion timing or physical-camera accuracy.
- Reduced motion is tested at the state/render level: fixed position, size and rotation with a gentle fade, no scattering particles. Physical cameras, real hand movement, and mobile hardware remain untested. The gap is hand-relative, not an exact centimetre measurement.
- A fresh scoped finish review returned **ship** with no material fixes across all five captures. It used the fallback reviewer instructions. The one mechanical detector run used degraded regex parsing and returned 39 advisory design-record findings; it did not evaluate computed contrast or constitute a full accessibility audit.

## Fireball addition

- The full repository suite passes **87 tests**. Eight new Fireball tests cover open palms versus fists, either hand and rotation, single casting after the 160 ms hold, deliberate close/reopen rearming, cooldown, independent hands and reordered detections, brief tracking loss, stale/slow results, reset/cleanup, forward perspective, expiration, mirrored origins, and reduced-motion rendering.
- The build verifies **176 production files**, including the newly required `domainexp/fireball.js`. The original model/runtime dependencies are unchanged.
- The actual worker and pinned model recognized both open palms in the same official MediaPipe photo and produced **two fireballs**. This validates the real model-to-gesture path on a photo; it is not live-camera accuracy testing.
- A full-page browser harness with 240 ms delayed synthetic landmarks verified one cast per opening, no repeated shots while holding open, close/reopen recasting, switching modes without a second camera request, stale-effect cleanup on switching, a 375 px mobile layout with no horizontal overflow, and stream/projectile cleanup on Stop.
- Keyboard ArrowRight selects Fireball through the native radio group. The Pixel size control hides in Fireball and returns in Domain Expansion. The final page was visually inspected at 1280 px and 375 px. Active visual fixtures freeze a real detected photo-hand cast at 450 ms for inspection; motion behavior is covered separately by timing tests.
- Reduced motion is tested at the state/rendering level: position and size stay stationary while alpha fades, with no trail or embers. No physical webcam, live hand movement, or mobile hardware was used.
- A fresh finish review found no material visual repairs at desktop or mobile widths and requested updated design records for Fireball. Those records were updated and the scoped documentation fix received a ship disposition. The mechanical detector ran once in degraded regex mode with advisory findings; this was not a full accessibility audit.

## Finger-tracking correction

The first release discarded every inference taking 200 ms or more, required nearly straight index fingers, and treated handedness classification confidence as detection confidence. It also showed no finger outlines until the effect activated. These gates could make working recognition appear unresponsive.

- The full repository suite now passes **79 tests**, including six new regressions for relaxed/small hands, ambiguous handedness, recognition feedback before activation, mirrored finger outlines, 300–600 ms inference, explicit hand loss, and severely stale results.
- The production build still verifies **175 files**. All inference remains local, with the existing pinned model; confidence thresholds are now 0.4.
- A local browser harness ran the actual worker/model on the [official MediaPipe sample photograph](https://storage.googleapis.com/mediapipe-tasks/hand_landmarker/woman_hands.jpg), referenced by [Google's sample notebook](https://github.com/google-ai-edge/mediapipe-samples/blob/main/examples/hand_landmarker/python/hand_landmarker.ipynb). It detected **two hands with 21 landmarks each**, constructed a valid window, and activated the effect. Five observed inference durations were 94, 34, 37, 37, and 38 ms. These are fixture measurements on this machine, not a performance guarantee.
- The complete app was exercised with a local photo camera and delayed fixture worker: 320 ms responses remained active between results; one hand retained its outline/guidance while clearing the domain; zero hands displayed explicitly; 600 ms responses recovered; Stop and repeated restart ended both created streams.
- The photo and browser harness are local QA material only and are excluded from the production build. No physical webcam or live hand movement was used. The actual-model photo check and simulated delayed-response checks are distinct.

## Initial-release automated checks

- `npm test`: **73 passed, 0 failed**, including all existing portfolio, Flash, Paper Piano, and Gym tests plus 19 Domain Expansion tests.
- Geometry covers detection-order changes, hand rotation, smoothing/reacquisition, the original confidence/shape gates, missing/closed/overlapping/out-of-frame hands, convex masks, activation and stale-result timing, and mirrored contained coordinates.
- Lifecycle covers delayed camera permission, cancellation during worker/model initialization, camera restart, interrupted video playback, permission denial, one inference in flight, late bitmap disposal, worker failure/recovery, compatibility fallback when bitmap transfer is unavailable, and model loading failure.
- Site integration checks the project anchor/source link and placement after Gym in shared navigation.
- `npm run build`: **175 production files verified**, including dependency hashes, local links, anchors, JavaScript syntax, metadata, and required route assets. Total site output was 103.8 MiB; MediaPipe files are shared in source and copied into this route at build time.
- `git diff --check`: passed before publication.

## Initial-release browser checks

Headless Google Chrome on macOS, with synthetic browser camera input only. All seven browser scenarios passed without page errors:

1. Desktop view at 1440 × 1000, page title/current navigation, initial camera controls, and keyboard operation of Pixel size.
2. Deterministic textured frame: **4,852 interior pixels changed, 0 wholly exterior pixels changed** by pixelation; mirrored video mapping matched. Antialiased polygon-edge pixels were excluded from the exterior comparison.
3. The pinned MediaPipe runtime/model loaded, a tracking worker was created, synthetic video reached the live view, and Stop detached its camera stream.
4. Mobile view at 375 × 812: no horizontal overflow, menu opens/closes, Domain Expansion link is visible, and reduced-motion preference is recognized.
5. Denied camera permission displays recovery instructions and permits retry.
6. Synthetic four-fingertip landmarks activate the visible domain, and Stop resets it.
7. `/domainexp` redirects to `/domainexp/`; the Work project entry, generated navigation at 1024 px, and captured homepage menu contain the new destination.

Desktop, mobile, synthetic active-camera, and homepage-menu captures were opened and inspected. A fresh Impeccable finish review requested stable text backings over camera footage, removal of a decorative stage label, corrected mobile sentence spacing, and complete product/validation notes. Those corrections were applied and the same page states recaptured. The mechanical detector ran in its degraded regex mode; its empty findings are not a full accessibility audit.

## Limits

No physical webcam, real hand movements, iOS Safari, Android hardware, or measured real-world tracking accuracy/latency were tested. The correction adds one actual-model photograph check, not live-camera validation. Synthetic inputs establish rendering and state behavior, not landmark accuracy on human hands. Fullscreen availability follows the browser’s API support. Test with bright, even lighting and both hands fully visible; occlusion, slow inference, and crossed fingers can interrupt the effect.

Live deployment and asset checks are reported by the release task after GitHub Pages completes.
