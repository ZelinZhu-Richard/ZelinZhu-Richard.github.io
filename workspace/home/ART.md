# Art brief: the homepage scene

The homepage is a scroll-driven 3D story about Richard Zhu, a high-school senior who does machine-learning research on brain images and builds a quant research system. It ends at seven "stones", one per section of the site (About, Projects, Research, Art, Fun, Blog, Daily). `/contacts/` shows the same world in a quieter "contact" mode.

Everything is original and made in code: geometry from seeded algorithms, shading from GLSL, no downloaded models, textures or HDRIs.

## Look: night and ink

| Token | Value | Use |
|---|---|---|
| night | `#100f15` | background; fog fades to it |
| stage | `#08070b` | deepest shadow only |
| ink | `#ece9e1` | lines, text |
| muted | `#a8a398` | secondary lines and text |
| faint | `#7a766d` | far detail |
| line | `#2d2b34` | hairlines, horizon |
| accent | `#e8743b` | ONE thing per frame |

- Ink on night. Warm off-white line work, never pure white or pure black.
- One accent, burnt orange, on exactly one object per frame (a growth front, a seed, a hovered stone). At most about 2% of pixels.
- No glow or bloom, no glass or refraction, no lens flares, no gradient blobs, no rainbow. Depth comes from line weight, density and fade to night.
- No water, no birds or creatures, no crystals or ice blocks, no horizontal fly-over of a sea.
- Hard, drawn quality: think technical pen, engraving, contour maps, lab notebook plots.
- Text sits over the scene. Every shot leaves a quiet zone (near-night, low detail) where its text goes.

## Type on the stills

- Display and italics: a book serif italic (`"Iowan Old Style", Charter, Georgia, serif`).
- Labels and small text: `ui-monospace, "SF Mono", Menlo, monospace`, uppercase, letter-spaced.
- Left-aligned unless a single word is the whole frame.

## The three concepts

### A. Forking Paths (`sketches/arbor/`)
One branching ink structure grows upward from a single orange seed on a horizon line. It should read as a dendrite, a fan of forecast paths and a tree of experiments at once. Line work only, widths from a pipe model (trunk thick, twigs hair-thin). The growth front is the accent: a short orange tip that cools to ink.
- Stones: the seven crown tips each wind into a **knot**, a ball of several hundred arcs on a sphere. Each knot uses a different winding law (latitude coil, loxodrome, torus knot, baseball seam, Fibonacci spiral, great-circle tangle, random walk). Hover: the thread end lifts and turns orange.
- Contact: below the horizon, a finer mirrored root system; one orange pulse climbing a root.

### B. Ridge, 3 a.m. (`sketches/ridge/`)
A night mountain drawn only as contour lines (major and minor isolines, weight following slope), climbed on foot. Aurora as pale ink curtains, not green. An orange headlamp point is the accent.
- Stones: seven cairns along the summit ridge, each a stack of 3 to 6 rounded pebbles with a contour-line surface. Hover: the top stone lifts and one orange isoline rings the cairn.
- Contact: the view tilts to the zenith; long-exposure star trails around the pole.

### C. The Instrument (`sketches/orrery/`)
An engraved forecasting machine: an orrery / armillary of rings, gears and arms, shaded like a copperplate engraving (hatching, no smooth gradients). Scroll is the crank; the orange crank handle is the accent.
- Stones: seven engraved spheres on arms, each with a different engraving (rings, spiral, stipple, contour, hatch, grid, dot). Hover: the arm swings forward and its ring turns orange.
- Contact: the rings close into one sealed sphere.

## Sketch contract (concept stills only; nothing here ships)

Each sketch is one static page, `sketches/<name>/index.html` plus its own modules in the same folder. It is served from `workspace/home/` at `http://127.0.0.1:8210/sketches/<name>/`.

- Three.js comes from an import map: `"three": "/node_modules/three/build/three.module.js"`, `"three/addons/": "/node_modules/three/examples/jsm/"`. No CDN, no other network requests, no other libraries.
- Plain ES modules, no build step. WebGL2. `antialias: true`. Device pixel ratio capped at 2.
- The canvas fills the window. Text is real DOM over the canvas.
- Deterministic: a seeded PRNG (no `Math.random`), no time-based animation in still mode. The same URL always draws the same frame.
- URL: `?shot=<id>` selects the frame. `&notext=1` hides the text. Without `shot`, show `hero`.
- When the frame is drawn, set `window.__SKETCH_READY__ = true` and `document.documentElement.dataset.shot = <id>`.
- Layout must hold at 1440×900 (desktop) and 390×844 (phone, portrait). Use the window size, not the `shot`, to choose the layout.

### Shots

| id | What it shows | Text on it |
|---|---|---|
| `hero` | The opening frame. | Name "Richard Zhu" (large serif italic), small mono line "A student of what comes next." and a mono "Scroll" cue |
| `experiments` | Early in the story: the subject starting to develop. | "Good questions / become *experiments.*" |
| `repeat` | The big-word beat. | The single word "Repeat", very large, centred |
| `research` | A chapter frame: subject on the right, text on the left. | Heading "Learning from images", body "At UNC PRIMES, I work on deep learning for neuroscience image processing." |
| `stones` | All seven stones in one frame, each labelled. | Mono labels: 01 About, 02 Projects, 03 Research, 04 Art, 05 Fun, 06 Blog, 07 Daily |
| `stone` | One stone (About) hovered, close. | "About" and the subtitle "Who I am, CV, contact, stars", plus a mono "Open" cue |
| `contact` | Contact mode. | "Have something in mind? Let's build it together." and four mono links: Email, X, GitHub, LinkedIn |

## What the stills are judged on (1 to 10 each)

Composition, originality, palette discipline, text legibility, craft (aliasing, banding, clipping, z-fighting), sequence coherence across the seven shots, and fit to the person.

## Decisions after the concept round (supersede anything above that conflicts)

- **Concept:** The Instrument, following STORYBOARD.md, with the room in ROOM.md as Act 3.
- **All live.** Every act is real-time Three.js with baked lighting; nothing is pre-rendered video. The whole page stays interactive. The target is good game graphics.
- **Colour.** The sky is the owner's palette: deep indigo and violet galaxy, cyan-green aurora, a small rose nebula (see `sketches/sky/`). The instrument stays pale engraved ink line on a dark solid. Warm amber appears once per frame at most (lamp, crank). In space the hover highlight is aurora green `#39f0a6`.
- **Film finish.** The earlier "no glow" rule is dropped. One final pass adds: soft glow around highlights, a smooth highlight roll-off, grain weighted to the shadows, a gentle vignette. Kept cheap enough for phones and switched down by quality tier.
- **Composition rules for every shot.** The camera sits off-centre so one side carries the weight and the other is quiet for text; one light direction per act; three depth layers, with a soft foreground element at one edge where the scene allows it.
- **Audit.** Every still is checked at 1:1 pixel crops (light source, a textured mid surface, the hero object) for flat fills, striping, floating or intersecting parts, visible mesh grids and mismatched shadows.
- **Brass to engraved.** In the room the instrument is polished brass (the armillary sphere on the desk). As the room dissolves and it floats out into space, the metal fades to the pale engraved line look of the final frame. The two are the same object: same rings, same seven spheres, same proportions, so the change reads as a transformation, not a swap.
