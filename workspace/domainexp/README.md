# Domain Expansion / 领域展开

A live camera experiment at `/domainexp/`. Form opposite corners of a window with your thumbs and index fingers. Everything within the four fingertips becomes pixelated, surrounded by a violet boundary. Lower a hand to release it. Choose **Fireball / 火球** to launch fire from an open palm, or **Dust Release / 尘遁** to release a luminous cube from a two-hand seal.

From the repository root, run `npm run dev` and open `/domainexp/`. `npm test` includes geometry and lifecycle coverage; `npm run build` builds and verifies this route alongside the portfolio.

## Use

Choose Start camera, allow camera access, and show both palms. Look for the violet finger outlines, then spread your thumbs and index fingers. The gold fingertip markers define the window; a precise L shape is not required. Turn one hand upside down to frame a larger window. Use Pixel size to adjust the blocks from 6 to 40 pixels (16 by default). Stop releases the camera. Switching tabs also stops it; return and press Start to resume. Fullscreen is available when supported by the browser.

No camera data leaves the browser. There is no microphone, recording, account, backend, or analytics. HTTPS or localhost and camera permission are required. Bright lighting and visible fingertips improve tracking. This is a creative effect, not a privacy filter: the unaltered camera image remains visible when a hand is lost.

## Fireball

Choose Fireball before or during a camera session. Show one open palm toward the camera and hold it briefly to cast toward the viewer. Close your hand for a moment, then reopen it to cast again. Each hand casts independently; holding a palm open never auto-fires. A 160 ms recognition hold, 180 ms rearm gesture, and 900 ms per-hand cooldown prevent flicker or repeated shots. A projectile lasts 950 ms and finishes its flight even if the hand leaves. Stop, a hidden page, or changing effects clears all projectiles and gesture state.

Reduced motion replaces flight, flicker, and flying embers with a stationary fading glow at the palm. The same local hand model, camera controls, and stream are shared by all modes. Mode switching does not request camera permission again. Pixel size is shown only for Domain Expansion.

## Dust Release / 尘遁

Face both open palms toward the camera. Bring thumb to thumb and index to index, leaving a window between the two pairs. Small gaps or touching are both accepted. Hold for 450 ms to charge and release a white cube toward the viewer, scattering into particles. Separate your hands for 220 ms to rearm; a 1.5 second cooldown separates releases. Holding the seal or briefly losing a hand does not automatically recast. A released cube finishes its 1.3 second flight; Stop, a hidden page, or mode switching clears it.

The approximate gap tolerance is 42% of visible palm width, scaled with the camera aspect ratio and hand size. This accommodates small gaps without claiming an exact 2 cm measurement. Palm orientation uses the model's left/right classification and palm-plane normal, preferring its 3D world landmarks. Finger outlines remain visible while concise prompts identify the missing gesture step. Reduced motion uses a stationary, fixed-size fading cube without rotation, flight, or scattered particles.

## Structure

- `geometry.js`: hand shape validation, four-point convex boundary, spatial matching, smoothing, 150 ms activation, latency-aware stale-result removal (200 ms normally, up to 1.2 seconds on slow devices), and contained/mirrored coordinates.
- `camera.js`, `vision.js`, `vision-worker.js`: cancellable streams, worker-first inference, one outstanding request, and a throttled compatibility fallback.
- `fireball.js`: open-palm recognition, per-hand spatial matching, charge/rearm/cooldown state, bounded projectiles, and perspective flight.
- `dust.js`: two-palm direction and fingertip-gap validation, charge/rearm/cooldown state, and cube release poses.
- `render.js`: normal camera image, clipped nearest-neighbor pixelation, boundary, always-visible finger outlines and fingertip markers, and reduced-motion-aware activation pulse/particles.
- `app.js`: accessible controls, loading/error states, page lifecycle, and rendering/inference scheduling.
- `build.mjs`: standalone route output and verified dependency copying. The build reads the existing Paper Piano asset manifest, copies only its pinned MediaPipe 0.10.14 runtime, WASM files, version-1 float16 hand model, and Apache 2.0 license. It never downloads assets or changes Paper Piano.

The page inherits the portfolio fonts, navigation, and purple palette. Animation is procedural; no external images, sound, or animation libraries are loaded. See `VALIDATION.md` for the checks actually performed and physical-camera limits.

Hand recognition uses the same 21-point MediaPipe model as Paper Piano, with detection, presence, and tracking thresholds of 0.4. Left/right classification confidence does not suppress visible hands. Missing or collapsed frames clear the domain as soon as the result arrives; detections older than 1.5 seconds are rejected. Valid slow detections are timed from completion so they can activate instead of being discarded.
