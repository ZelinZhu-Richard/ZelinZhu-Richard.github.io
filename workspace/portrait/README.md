# Living portrait

Click the photo on `/about/` and it turns into a portrait of me drawn in code. It cycles through six
styles: ASCII, pencil hatching, scribble ink, halftone, neon contours and pixel art. Between styles every
stroke bursts outward as blue, purple and pink ink and re-forms as the next style. Consecutive styles
alternate between two selfies (A, B, A, …), and the second loop swaps them, so each style shows both poses.

| File | What it is |
| --- | --- |
| `portrait.js` | The whole renderer, one ES module with no dependencies. Exports `mountPortrait(canvas, options)`. |
| `about.js` | About page hook: swaps the photo for the canvas on click and lazy-loads `portrait.js`. |
| `portrait.css` | Stage, label and caption button styles for the About page. |
| `data/a.png`, `data/b.png` | Preprocessed data for each photo (see below). About 85 KB each. |
| `prep.json` | Preprocessing settings: output size and where the eyes are in each photo. |
| `photos/` | The original photos. Gitignored: they stay on this machine and never ship. |
| `build.mjs` | Copies the files above to `dist/portrait/`. |

Payload: about 208 KB (about 185 KB gzipped). The About page itself loads only `about.js` and
`portrait.css` (3.4 KB). The module and data load when someone clicks the photo, or hovers it first.

## Mount it anywhere

```html
<canvas data-portrait aria-label="Animated portrait of Richard Zhu" style="width:400px;aspect-ratio:4/5"></canvas>
<script type="module" src="/portrait/portrait.js"></script>
```

Or call `mountPortrait(canvas, { label, start, count, onStyle })` yourself. `label` is an element whose
text shows the current style, `start` is the first step (0 = ASCII), and `count` fixes the pool size. The
returned controller has `next()`, `show(styleId)`, `destroy()`, and `style` / `running` / `count` / `perf`.
On the About page, `?portrait-count=1000` forces a small pool, which is useful for checking low-end devices.

## Regenerating the data from new photos

1. Put the photos in `workspace/portrait/photos/` (for example `a.jpg`, `b.jpg`). Head and shoulders,
   facing the camera, against a plain wall works best.
2. In `prep.json`, set each photo's `file` and the pixel positions of its two pupils (`leftEye`,
   `rightEye`, in the original photo). Opening the photo in any viewer that shows cursor coordinates is enough.
   The script rotates and scales each photo so both eyes land on the same spot. That is what makes the
   morph between poses line up.
3. Run `python3 tools/portrait-prep.py --preview /tmp/portrait-check` (needs Pillow, numpy, scipy and
   scikit-image). Look at `*-cutout.png` to check that the background was removed cleanly, and at
   `*-planes.png` to see the six data planes.
4. `npm run build` and open `/about/`.

Background removal is classical, not ML. The script fits a smooth colour surface to the wall around the
person, then grows "background" in from the frame edges through pixels that are smooth (not textured) and
close to that wall colour, or to a darker/lighter shadow of it. Texture is what separates a grey sweater
from a grey wall. A busy background (trees, a room) would need a different matte; swap in any person
segmenter in `matte()` and keep the rest.

### Retouch

Before drawing, `retouch()` gently cleans up each aligned photo. The photos were taken late at night, so
the hair outline had flyaways. Every step's strength is in `prep.json` under `retouch`, and 0 turns it off:

| Key | What it does |
| --- | --- |
| `hairOutline` | Rounds off flyaways on the hair outline and fills small notches (blur radius in pixels; above the ears only). |
| `hairSmooth` | Evens out stray bright strands with an edge-preserving filter; the strand direction survives. |
| `blemish` | Removes small spots darker than the surrounding skin. Skips the eyes, brows, nose, mouth, the outline, glasses frames and the `keep` points. |
| `skinSmooth` | Softens fine skin texture (pores, bumps) but not real edges. |
| `shine` | Pulls bright hot spots (nose, forehead) back towards the surrounding skin. |
| `underEye` | Lifts the darker band under each eye towards the cheek tone. |
| `eyeEnlarge` | Makes the eyes a touch larger with a smooth bulge (0.075 = about 7%). |
| `eyeDefine` | Makes the eyes a little crisper and the whites a little brighter. |
| `brows` | Deepens the brow hairs that are already there. |
| `lips` | Adds a little colour and definition. |

`keep` lists points in eye-distance units from the midpoint between the eyes (x right, y down) that blemish
removal leaves alone. It protects the small mole on my chin, since that is part of my face. Feature positions
(`FACE` in the script) use the same units; the alignment puts both photos' eyes in the same place, so
one set of positions fits both. `--preview` writes `*-before-after.png` to check the retouch.

Each data sheet is one greyscale PNG, 240 wide, with six 240 × 300 planes stacked vertically:

| Plane | Meaning | Used for |
| --- | --- | --- |
| tone | brightness, background flattened to white, local contrast boosted | how much ink goes where |
| edge | gradient magnitude | stroke length (short on detail, long on smooth areas) |
| angle | smoothed gradient direction (structure tensor), 0–π | stroke direction: contours run at 90° to it |
| matte | person = 255, background = 0 | where anything is drawn at all |
| lines | difference-of-Gaussians line map, speckle removed | eyes, glasses, mouth, jaw: the features that make it me |
| warmth | red minus blue | skin vs. hair and the grey sweater (neon and pixel colours) |

## How stroke placement works

All six styles share one pool of N elements (about 2,500 on a laptop, 1,900 on a phone; N scales with the
canvas area). Each style's `build(photo, N, rng, view)` in `STYLES` returns a list of items:
position, angle, length, size, colour index and opacity bucket. The other styles return the same
fields; ASCII also carries a glyph and scribble a bend.

- **Sampled styles** (hatching, scribble, neon) pick N pixel positions at random, weighted by a per-pixel
  weight (`sampler()` builds a cumulative table and binary-searches it):
  - hatching: weight is darkness above a threshold, so light skin stays paper. 36% of the strokes are
    instead weighted by `lines` and follow the contour, which draws the outline of the eyes, glasses and mouth.
  - scribble: darkness plus a strong `lines` term, with wobble that grows where edges are weak.
  - neon: mostly `lines`, plus a little `edge`.
  All of them multiply in a **face focus** weight (a Gaussian around where the face sits after
  alignment), so detail goes where recognition happens instead of into the sweater.
- **Orientation:** a stroke's angle is `angle + 90°`, along the contour. Hatching uses fixed hatch angles
  (one layer of strokes in light areas, two crossing layers in midtones, three in shadows) except on strong
  edges, where it follows the contour.
- **Length and opacity:** length shrinks as local contrast (`edge`) rises, so detailed areas get short
  precise marks and smooth areas get long ones. Opacity comes from darkness, in four buckets.
- **Grid styles** (ASCII, halftone, pixel) average `tone`/`lines`/`matte` over each cell instead of
  sampling. ASCII picks a character from `ASCII_RAMP` by darkness. Halftone sets dot area proportional to
  darkness on a 45° grid. Pixel art quantises to two 5-colour ramps (cool and warm) with 4×4 Bayer dithering.
  The cell sizes come from N, so a grid never has more cells than the pool.

Darkness is usually raised to a power (for example `d ** 1.55` in ASCII). That is the main contrast knob:
higher keeps skin lighter.

## How transitions work

- **Assignment:** each style's items are sorted by a Z-order (Morton) key of their position. Element `i`
  takes item `i·M/N`, so in every style element `i` sits in roughly the same region. If there are more
  elements than items, the extras fly along and then hide.
- **Path:** each element flies along a quadratic Bézier from where it is now (`px, py`) through a burst
  point (`cx, cy`: pushed outward from the face centre with a random spread) to its new target. Its
  progress is `u = (t − delay) / (1 − SPREAD)`, eased in and out. The per-element `delay` (up to 30% of
  the 1.5 s transition) is part random and part distance from the centre, which keeps the burst organic.
- **Look in flight:** for `u < 0.1` the element still draws in the old style, and for `u > 0.9` in the new
  one. In between it draws as a curved ink trail through its last stretch of path, in blue, purple or pink.
  The background colour cross-fades.
- **Boil:** while a style holds, every 95–170 ms the strokes get a small random jitter (scribble the most,
  hatching a little, neon flickers), like hand-drawn animation, so the portrait never sits frozen.
- **Pointer:** strokes within 24 data pixels of the cursor are pushed away and pulled back by a damped
  spring (`physics()`).

Tuning knobs: `HOLD` and `TRANS` (timing), `SPREAD` (stagger), the burst radius in `go()`, each style's
`boil`, `alphas` and `colors`, and the weights inside each `build()`.

## Performance and accessibility

- Draw calls are batched: elements are bucketed by (style, colour, opacity), and each bucket is one path
  with one `stroke()`/`fill()`. ASCII draws from a pre-rendered glyph atlas instead of `fillText`.
- The canvas is only redrawn when something changes: during a burst, on a boil tick, or while the pointer
  is moving strokes.
- The next style is built ahead of time, in idle time during the hold, so the burst starts without a stall.
- If more than 20 frames in a burst arrive later than 24 ms, the pool shrinks by 22% for the next style
  (never below 1,000).
- Backing resolution is CSS size × devicePixelRatio, capped at 2.
- The animation stops (no requestAnimationFrame) when the canvas is off-screen (IntersectionObserver) or the
  tab is hidden.
- `prefers-reduced-motion`: the portrait shows pencil hatching, still. No boil, no burst, no pointer push.
  Clicking still switches style, instantly.
- The canvas has `role="img"` and an `aria-label` naming the current style. The style label is a real
  button, so keyboard users can switch styles too.
