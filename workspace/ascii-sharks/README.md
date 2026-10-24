# Portfolio shark background

The final `buildSharkBackground()` step in `tools/build.mjs` adds the same
viewport-sized decorative canvas to every generated HTML page, including the
standalone experiments and Polaris Playbook. `tools/verify.mjs` enforces coverage.

Run `npm run build` from this site snapshot, then `npm run preview`.

`background.css` preserves the existing purple surface, with quieter motion on
mobile. Screen blending removes the upstream renderer's black ground. The canvas
is hidden from assistive technology and never receives input; page controls and
their content remain above it. The Flash preview surface is transparent so its
card remains in front of the same background.

`background.js` starts the locally served engine. It honors reduced motion, stores
the visitor's pause preference, pauses in hidden tabs and during video or camera
use, and destroys/recreates the engine for page-cache navigation. Mobile uses two
sharks and 85 fish; desktop uses three sharks and 150 fish. Rendering is capped at
30 fps and pixel density at 1.5.

Edit upstream adaptations in `vendor/source/`, then regenerate the checked-in
browser JavaScript with `node workspace/ascii-sharks/vendor/generate.mjs`.
Generation uses Node's built-in TypeScript transform; there are no added packages
or build-time network calls. See `NOTICE.txt` for source provenance.
