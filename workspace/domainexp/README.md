# Domain Expansion / 领域展开

A live camera experiment at `/domainexp/`. Form opposite corners of a window with your thumbs and index fingers. Everything within the four fingertips becomes pixelated, surrounded by a violet boundary. Lower a hand to release it.

From the repository root, run `npm run dev` and open `/domainexp/`. `npm test` includes geometry and lifecycle coverage; `npm run build` builds and verifies this route alongside the portfolio.

## Use

Choose Start camera, allow camera access, and show both palms. Make an L with each thumb and index finger. Turn one hand upside down to frame a larger window. Use Pixel size to adjust the blocks from 6 to 40 pixels (16 by default). Stop releases the camera. Switching tabs also stops it; return and press Start to resume. Fullscreen is available when supported by the browser.

No camera data leaves the browser. There is no microphone, recording, account, backend, or analytics. HTTPS or localhost and camera permission are required. Bright lighting and visible fingertips improve tracking. This is a creative effect, not a privacy filter: the unaltered camera image remains visible when a hand is lost.

## Structure

- `geometry.js`: hand shape validation, four-point convex boundary, spatial matching, smoothing, 150 ms activation, 200 ms stale-result removal, and contained/mirrored coordinates.
- `camera.js`, `vision.js`, `vision-worker.js`: cancellable streams, worker-first inference, one outstanding request, and a throttled compatibility fallback.
- `render.js`: normal camera image, clipped nearest-neighbor pixelation, boundary, fingertip markers, and reduced-motion-aware activation pulse/particles.
- `app.js`: accessible controls, loading/error states, page lifecycle, and rendering/inference scheduling.
- `build.mjs`: standalone route output and verified dependency copying. The build reads the existing Paper Piano asset manifest, copies only its pinned MediaPipe 0.10.14 runtime, WASM files, version-1 float16 hand model, and Apache 2.0 license. It never downloads assets or changes Paper Piano.

The page inherits the portfolio fonts, navigation, and purple palette. Animation is procedural; no external images, sound, or animation libraries are loaded. See `VALIDATION.md` for the checks actually performed and physical-camera limits.
