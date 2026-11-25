# Sky

A procedural night sky for the homepage scene: Milky Way, northern lights, one
emission nebula and a crisp star field, all generated in GLSL from seeded noise.
No textures, no image files, no render targets, no post pass. One draw call.

Palette direction comes from the owner's references: a deep saturated blue
night drifting toward indigo; a luminous, granular violet-to-lavender Milky Way
with a warm pink-peach core and smoky, feathered dust; a vivid cyan-leaning
green aurora with an almost white-green hem and a violet-magenta fringe; a
rose-red nebula with a pale-blue ionisation front and a pink-white core. The
references were used for mood only; nothing is copied, embedded or loaded.

| File | What it is |
|---|---|
| `sky.js` | The module: `createSky(options)`, `directionAtNdc()`, `SKY_PALETTE`, `SKY_TIERS` |
| `shots.js` | Test-page shots (camera + sky settings per layout), pure Three.js math |
| `main.js`, `index.html` | The still-frame test page |
| `tools/` | Offscreen preview without a browser (see below) |

## Test page

`http://127.0.0.1:8210/sketches/sky/?shot=<id>` (served from `workspace/home/`).

| `shot` | What it shows |
|---|---|
| `space` (default) | Galaxy band diagonal through the upper left, its bright core in the lower-left corner, dense stars, a small soft nebula at the band's top end, one blue spike star. Centre and right stay calm for the instrument; an ink placeholder (rings, a third of the frame wide) sits centre-right. |
| `window` | Looking up and out at 3 a.m. (camera pitched 30 degrees, horizon glow on): three aurora curtains sweep diagonally, with a bright hem, fine vertical rays and violet tops. A faint Milky Way rises on the left. |
| `both` | The richest frame: the Milky Way with its dust rift rising from near the horizon, aurora ribbons sweeping across the right half and over the top. |
| `nebula` | The nebula featured centre-right (rose-red body, pale-blue ionisation front on its left flank, pink-white core, dark lanes) sitting on a faint band, with a blue spike star at its upper left. |
| `text` | The `space` sky plus the sample type on the left, with the quiet zone measured from the real text box. |
| `plain` | Stars only on the base gradient, two small spike stars: the false-space beat. |

Parameters: `&notext=1` hides the type (the quiet zone stays, so the sky is
identical), `&tier=0..3` overrides the tier (default: 1 on the phone layout, 2
otherwise), `&t=<seconds>` sets the time (default 0). The layout is chosen from
the window size (`w / h < 0.8` is portrait). When drawn it sets
`window.__SKETCH_READY__ = true`, `html[data-shot]`, `html[data-layout]` and
`html[data-tier]`. `window.__sky` is the live handle for console tweaking.

## Offscreen preview (no browser)

`tools/render.py` renders the shots to PNG on the GPU without a browser or a
server (macOS; needs only node, numpy and Pillow). `tools/export.mjs` imports
the real `sky.js` and `shots.js` with the repo's three, sets each shot up and
does what `onBeforeRender` does (viewport, DPR, spike-star positions), then
prints the shader source, every uniform and the camera matrices as JSON.
`render.py` compiles that same GLSL through CGL (desktop OpenGL 4.1 core,
via ctypes; three's prefix and `colorspace_fragment` are emulated), draws the
full-screen triangle into an offscreen framebuffer and writes
`workspace/home/_dev/sky/<shot>[-suffix].png`. Desktop GLSL accepts implicit
int-to-float conversions that WebGL rejects, so keep float literals explicit.

```sh
cd workspace/home/sketches/sky/tools
python3 render.py                                  # all shots, 1440x900, tier per layout
python3 render.py --shots space,both --tier 1 --suffix t1
python3 render.py --w 390 --h 844 --dpr 2          # the phone layout
python3 render.py --text --stats                   # sample type on 'text'; linear-light stats
python3 render.py --w 1280 --h 960 --time 40       # GPU ms per frame (additive blending)
python3 seams.py --shot plain --png ../../../_dev/sky/plain.png   # star-layer cube-face edges
```

## API

```js
import { createSky, directionAtNdc } from './sky.js';

const sky = createSky({ seed: 7, tier: 2, galaxy: 1, aurora: 0, nebula: 0, stars: 1, exposure: 1, horizon: 0 });
scene.add(sky.object3D);           // add to the scene, not to the camera
// per frame (or once for a still):
sky.setTime(seconds);              // time is passed in; nothing reads a clock
renderer.render(scene, camera);
```

`createSky(options)` options: `seed` (uint, default 7), `tier` (0..3, default 2),
`galaxy`, `aurora`, `nebula`, `stars` (0..1 amounts), `exposure` (default 1),
`horizon` (0..1, default 0), `peak` (linear-light ceiling of the soft shoulder,
default 0.82), `renderOrder` (default -1e6).

Returned handle:

| Member | Meaning |
|---|---|
| `object3D` | The mesh: a full-screen triangle, `frustumCulled = false`, `depthTest`/`depthWrite` off, `renderOrder = -1e6` so it draws first. Shaded by world view direction rebuilt from the camera's projection and view matrices, so it is a true backdrop at infinity. |
| `material`, `uniforms` | The `ShaderMaterial` and its uniforms, for anything not covered below. |
| `tier` | Current tier (read-only getter). |
| `setGalaxy(0..1)`, `setAurora(0..1)`, `setNebula(0..1)`, `setStars(0..1)` | Feature amounts. 0 skips the feature's code entirely (uniform branch). `setStars` also scales the spike stars. |
| `setExposure(x)` | Multiplies the linear result before the soft shoulder. |
| `setHorizon(0..1)` | World-frame horizon: lighter, bluer near the horizon, dark below it; stars and galaxy fade into the haze. |
| `setPeak(x)` | Ceiling of the soft shoulder (linear). Default 0.82, below the ink `#ece9e1`. |
| `setTime(t)` | Seconds. Drives aurora drift and fold motion and star twinkle. |
| `setQuietZone(rect, strength = 1)` | `rect` = `{x0, y0, x1, y1}` or `[x0, y0, x1, y1]` in NDC (-1..1, y up), or `null` to clear. Inside a rounded, feathered box (feather about 16% of the height) it dims galaxy, nebula and aurora by up to 78 to 80%, desaturates them by up to 30% (more read as a grey patch), dims stars by up to 85% and the base by 20%. This, not a dimmer sky, is what keeps type legible. |
| `setTier(0..3)` | Swaps the `TIER` define and recompiles (a one-time compile hitch, so set it once at startup). |
| `setSkyRotation(quaternion \| null)` | Orientation of the celestial sphere (stars, galaxy, nebula, spike stars) in the world: `world = q * celestial`. The aurora stays in the world frame. |
| `setGalaxyFrame(pole, core, { width, coreLength, dust })` | `pole` = normal of the galactic plane, `core` = direction of the bright core (projected into the plane), both celestial. `width` = band half-width in sine-latitude (default 0.085), `coreLength` = longitude scale of the bulge in radians (0.75), `dust` = dust opacity (1). |
| `setNebulaFrame(dir, { radius, roll })` | Centre direction, angular radius in radians (default 0.2; fine wisps and dark lanes fade out below about 0.12), roll of its shape. |
| `setAuroraFrame({ azimuth, distance, spacing, span, base, decay, folds, phase })` | World frame, +Y up. `azimuth`: direction of the arc's nearest point, radians from -Z toward +X. `distance`: ground distance to the front curtain in units of 100 km (1.4). `spacing`: ratio between curtain distances (1.8). `span`: arc half-angle (1.35). `base`: lower-edge altitude (1.0). `decay`: vertical falloff (0.36). `folds`: fold amplitude (0.28). `phase`: shape seed. |
| `setHeroStars(list)` | Up to 6 `{ dir, flux 0..1, color '#hex', size? }` (celestial). These are the only stars with four-point diffraction spikes. They are projected to screen on the CPU each draw, so the spikes stay screen-aligned and pixel-crisp. |
| `dispose()` | Removes the mesh and disposes geometry and material. |

`directionAtNdc(camera, x, y, target?)` returns the world direction through an
NDC point of a perspective camera (honours `setViewOffset`). `shots.js` uses it
to place the band, nebula and spike stars where a frame needs them, e.g. a band
through two NDC points: `pole = cross(dirA, dirB)`.

Notes:

- Perspective cameras only. Works with any depth convention, logarithmic or
  reversed depth, and `setViewOffset`, because the ray only reads the
  projection's x/y scale and shear terms.
- Colour: output is correct with three's default sRGB output (the shader ends in
  `#include <colorspace_fragment>`). If the host renders to the canvas with a
  linear `outputColorSpace` (as `sketches/orrery` does), the sky detects it in
  `onBeforeRender` and encodes sRGB itself. Into a render target it writes linear
  light and skips the dither. Palette constants are converted from sRGB in
  `sky.js` itself, independent of `THREE.ColorManagement`. `toneMapped` is off.
- A triangular dither of one 8-bit step (in output space) prevents banding in
  the dark gradients.
- Peak luminance: a per-channel soft shoulder caps the sky at `peak`. Measured
  on the 1440x900 stills (linear light, after the shoulder): `space` 99th
  percentile luminance 0.34, max 0.65; `nebula` 99th 0.18; aurora (`window`,
  `both`) 99th 0.62, max 0.76, brightest channel 0.816 (the green of the
  brightest folds, sRGB about 0.92), at the ink `#ece9e1` (0.82) but not above
  it. Text over the aurora or the band needs a quiet zone; the `text` shot
  checks it.
- The aurora body colours carry almost no red on purpose: the curtains are
  driven past 1 into the shoulder, which caps green while any red keeps
  rising, and that is what turned the old green grey.
- Determinism: everything derives from `seed` and the uniforms. No
  `Math.random`, no clock.

## Palette

sRGB hex. Galaxy colours are used as chroma at unit luminance (the brightness
comes from the field); the others are used as given.

| Role | Key | Hex |
|---|---|---|
| Sky, darkest (near-black blue) | `deep` | `#03071c` |
| Sky, deep saturated blue | `blue` (new) | `#0a1846` |
| Sky, indigo (slow hue drift) | `indigo` | `#140f44` |
| Horizon glow | `horizon` | `#16265e` |
| Galaxy halo (indigo blue) | `galOuter` | `#3a3fb0` |
| Galaxy body (violet) | `galViolet` | `#6f4fdc` |
| Bright star clouds (lavender) | `galMauve` | `#a68ef2` |
| Blue star clouds | `galBlue` | `#8ea4ff` |
| Brightest clouds (lavender white) | `galWhite` | `#e6deff` |
| Core (warm pink) | `galPink` | `#ff96c4` |
| Core highlight (peach) | `galPeach` | `#ffd0b0` |
| Aurora hem (almost white green) | `auroraEdge` | `#c8ffe4` |
| Aurora body (vivid cyan-leaning green) | `auroraBody` | `#12f0a8` |
| Aurora upper body (cyan) | `auroraTeal` | `#0edcd2` |
| Aurora top fringe (violet-magenta) | `auroraViolet` | `#a457ff` |
| Nebula body (rose red) | `nebRose` | `#f2456c` |
| Nebula outskirts (deep crimson) | `nebDeep` | `#8a1a40` |
| Nebula ionisation front (pale blue) | `nebBlue` | `#b4d2ff` |
| Nebula core (pink-white) | `nebCore` (new) | `#ffe8f0` |
| Stars: blue-white / white / warm | `#a9c1ff` / `#f4f2ff` / `#ffd8ae` |
| Spike stars (defaults) | `#9fc0ff`, `#fff1dc`, `#c9d6ff`, `#ffd6a8`, `#eef0ff`, `#b8c8ff` |

## Cost per tier

Budgets are compile-time constants (`#define`s per `TIER`; every loop bound is
constant). n3 = 3D gradient-noise evaluations, n2 = 2D. Each feature only runs
inside its own mask (galaxy within 4.4 band widths of its plane, its light
fading to zero over the last 1.2 and its dust noise skipped beyond 3, nebula
inside its cone, aurora above the horizon within its arc), so a typical pixel
pays for one or two features, not all of them.

| Tier | Galaxy (n3) | Nebula (n2) | Aurora | Base | Star layers (hashed cells visited) |
|---|---|---|---|---|---|
| 0 | 0 warp (analytic) + 2 cloud + 1 dust = 3 | 2 warp + 2 body + 1 ridge + 1 dark | 1 curtain, 2 n2 | 0 | D1 (2x2 search) + bright: 5 cells |
| 1 (phone) | 2 warp + 2 cloud + 3 dust + 1 grain = 8 | 2 + 3 + 2 + 1 = 8 | 2 curtains, 2 n2 each | 1 n3 | D1 + medium + bright: 6 cells |
| 2 (desktop) | 3 warp + 5 cloud + 5 dust + 2 grain = 15 | 2 + 4 + 3 + 1 = 10 | 3 curtains, 4 n2 each | 1 n3 | D1 + D2 + D3 (band only) + medium + bright: 14 cells |
| 3 | 3 + 6 + 6 + 2 = 17 | 2 + 5 + 3 + 1 = 11 | 3 curtains, 4 n2 each | 1 n3 | as tier 2: 14 cells |

Tier 1 keeps the same counts it had before the dust and grain rework (8 n3 in
the galaxy, 6 star cells): the grain octave is paid for by one fewer star-cloud
octave, which the grain makes up for at small scales. The grain runs only on
bright band pixels, and fades out and is skipped where its lattice would fall
under about 2 px. D3 is skipped where the band's star density is near zero. Plus 6 spike-star tests (an early-out box test each), the quiet-zone box,
the soft shoulder and the dither, at every tier.

Measured GPU time for the real shader (`tools/render.py --w 1280 --h 960
--time 40`: desktop GL 4.1 compile of the same source, offscreen, 1280x960 =
1.23 MP, additive blending to defeat hidden-surface removal), Apple M4 Pro,
best of two passes. These were taken while a Blender render was using the same
machine, so they read high: `plain` at tier 0, whose work barely changed,
measures 0.22 ms here against 0.14 ms in the earlier quiet-machine run.

| Shot | Tier 0 | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| `both` (worst case) | 0.61 ms | 1.15 ms | 2.07 ms | 2.21 ms |
| `space` | 0.54 ms | 0.98 ms | 1.66 ms | 1.78 ms |
| `plain` (stars and base only) | 0.22 ms | 0.34 ms | 0.43 ms | 0.43 ms |

Against the earlier quiet-machine figures (corrected for the 4.4-band-width
early-out, about +6 to 7 percent): tier 1 `both` 1.15 ms against about 1.10,
`space` 0.98 against about 0.96, so tier 1 is within its old budget. Tier 2
`both` rose from about 1.73 to 2.07 ms and `space` from about 1.32 to 1.66 ms
(the fifth dust octave, the grain and the band-only D3 star layer).

A recent phone GPU has roughly a sixth to an eighth of that throughput, so tier
1 at 1.2 MP should cost about 6 to 8 ms in the worst frame (a third to a half of
a 60 fps budget). That is an estimate, not a measurement. On older mid-range
Android GPUs, use tier 0 (about a quarter of the cost of tier 2) or cap the
device pixel ratio at 1.5 for the sky.
