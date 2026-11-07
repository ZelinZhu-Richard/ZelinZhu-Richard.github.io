# POV films, real-time edition

A static three.js page that plays each film's Blender scene in real time inside a
9:16 phone frame. No build step: three.js r170 comes from jsDelivr through an import map.

## Run it

```
cd workspace/pov-films
python3 -m http.server 8000 --bind 127.0.0.1
open http://127.0.0.1:8000/viewer/
```

Serve the `pov-films` folder, not `viewer/`: the page reads `../films/<slug>/web/` and
`../assets/web/`. Any static host that keeps that layout works.

Controls: the picker chooses the film. Play/pause, the scrub bar and the eye toggle sit
under the frame. With the eye on, drag the picture to look around from the moving camera;
let go and the view eases back. A tap on the picture plays or pauses. Keys: Space plays or
pauses, Left/Right step one frame (Shift: one second), L toggles free look.

Films that have not been exported yet show their name and "Not rendered yet" (over their
sky if `sky.json` already exists). The page opens on the first exported film of 01 to 05,
or on the test fixture when none is exported yet.

## Files

| File | Role |
| --- | --- |
| `index.html`, `style.css` | page, phone frame, quiet controls |
| `viewer.js` | loading, timing, camera, free look, lights, fog, render loop |
| `sky.js` | full-screen sky shader for the `sky.json` contract, and a CPU copy of it |
| `mirror.js` | planar reflections for meshes named "ground" or "water" (or picked in `viewer.json`) |
| `finish.js` | final pass: comp saturation, the kit's dispersion, vignette and grain, the film's grade, then Khronos PBR Neutral or AgX (+ Punchy), sRGB, dither |
| `tools/webshot.sh` | headless Chrome screenshot of one film at one time (540 x 960), one Chrome at a time, cold cache, and up to three retries when a cold load comes back all black |
| `tools/compare.py` | Blender still beside a web frame, with luma, saturation and highlight share per third |

## What a film must export

`films/<slug>/web/` holds:

- `scene.glb`: the Blender scene (the kit's `export_web` writes it).
- `sky.json`: the shared sky contract (see `BRIEF.md` and the kit).
- `viewer.json`: optional real-time overrides, described below.

### Naming and scene conventions

- **Camera.** The first camera in the glTF is the film camera. Key it in Blender (the kit
  keys location and rotation on every frame). Constraint-only or path-follow cameras do not
  export as animation unless baked.
- **Vehicle.** Parent the dashboard, hood, prow or boiler to the camera object. The viewer
  keeps the camera's children attached, so the vehicle moves with the camera and stays put
  while free look turns the view inside it. Vehicle parts are left out of the reflection pass.
- **Timing.** Blender frame 1 is t = 0 and the film runs 336 frames at 24 fps. Export the
  scene frame range with sampled animation. Either exporter time base works (frame f at
  f/24 s, the default, or slid to zero); the viewer reads which one from the camera's first
  key. Every other animated object plays on the same clock.
- **Reflective ground and water.** Any mesh whose object name contains `ground` or `water`
  (any case, for example `road_ground`, `Canal_Water`) gets a planar mirror. The plane is
  fitted to the mesh (area-weighted normal and centroid), so keep those meshes close to flat;
  meshes on the same plane share one mirror render, and at most three planes get their own.
  Do not use those words in other object names (`underground_pipe` would turn into a mirror).
  Two other ways in, without renaming: `viewer.json` `mirror.ground` / `mirror.water`
  (patterns on the object name, for example `"water": "^Canal$"`), or a `mirror_strength`
  custom property on the object (water when `mirror_ripple` > 0, else ground).
  Meshes whose materials are all rough (roughness 0.8 and up, no roughness map) get no
  mirror: the reflection would be under 8 percent of fresnel and the extra render is wasted.
  The glTF material stays as exported; the mirror adds fresnel reflection on top, blurred by
  the material roughness and stretched into vertical streaks. `water` meshes also ripple.
  The streak reads the mirror image in 12 taps, each through an anisotropic footprint as
  tall as the gap to the next tap (16x anisotropy, 4x on touch devices) and offset per pixel
  and per frame, so a long streak is one continuous smear rather than a comb of dots or a
  stack of ghost copies.
  The mirror image already contains the sky (seen as the lighting sees it), so a mirror
  also lit by the environment map counts the sky twice. `mirror.env` below 1 cuts the
  environment map's own specular to that share where the surface is glossy (scaled by the
  mirror strength up to 1; rough parts keep all of it). The default is 1, no cut: every
  film was tuned that way, because the earlier `envMapIntensity *= 0.4` on mirror materials
  never took effect (three.js r170 uses `scene.environmentIntensity` when a material has no
  envMap of its own). Measured with the stills, a 0.4 cut made film 01's lower third 2 to 4
  percent too dark and moved the other films' lower thirds by up to about 2 percent, some
  closer and some further, so it stays opt-in.
  Other meshes lying on a mirror plane (top less than 10 cm above it, such as a crowned road
  between wet ruts or a rug on a varnished floor) are drawn front faces only in that
  mirror's reflection pass; seen from below they would otherwise hide the reflection.
  Optional Blender custom properties on the object (exported as glTF extras):
  `mirror_strength` (default 1; 0 turns the mirror off), `mirror_streak` (1 for ground,
  0.5 for water), `mirror_ripple` (0 for ground, 1 for water), and `mirror_env` and
  `mirror_shift` (per-object versions of the `viewer.json` keys below).
- **Reflection-only meshes.** A mesh with the custom property `pk_mirror_only` (any true
  value), or whose name matches `viewer.json` `mirror.only`, is drawn in the reflection
  passes only (three.js layer 5), never in the view. Use it for emissive cards that stand
  in for the glossy highlight of an area light on a wet road or a varnished floor, which
  glTF cannot carry. The film still has to export the card (for example a web-only mesh
  hidden from the Blender render).
- **Emission.** Emission strength above 1 exports as `KHR_materials_emissive_strength` and
  is honoured, so windows and lanterns bloom at the same intensity as in Blender.
- **Materials.** glTF carries Principled BSDF values and image textures only. Procedural
  node setups (noise, voronoi, bump) do not export: bake them to textures or vertex colours
  for the web edition, or accept the flat values. Every glTF texture is filtered
  anisotropically (16x, 8x on touch devices; GLTFLoader leaves it at 1), so roads and tall
  windows seen at an angle keep their detail.
- **Lights.** Point, spot and sun lights export through `KHR_lights_punctual` (area lights
  do not export). The viewer assumes the exporter's default "Standard" lighting mode (the
  kit's `SPEC`) and divides by 683 to get back to Blender's radiometric units; set
  `light_units` in `viewer.json` for the other modes. Up to 24 point and 8 spot lights render
  directly (10 and 4 on touch devices; `viewer.json` `lights.point` / `lights.spot` change the
  desktop budget, `lights.touch_point` / `lights.touch_spot` the touch caps); above that a
  fixed set of proxies follows the most important lights and
  fades the rest, so the shader never recompiles and nothing pops. Importance is power over
  squared distance from the camera, times the light's priority, and for spots times 0.1 when
  the cone stays outside the view widened by 20 degrees (a smooth step, not a switch). A
  point light with a range (glTF `range`, which three.js reads as `light.distance`; the kit
  writes it from `pk_range`) lights nothing outside that sphere, so it gets the same 0.1
  when the sphere stays outside the widened view.
  Optional custom properties on the light object (glTF node extras):
  `pk_priority` (importance multiplier, default 1; 8 keeps a far hero light in the budget)
  and `pk_specular` (Blender's specular factor, default 1; KHR_lights_punctual has none, so
  the kit should copy `light.specular_factor` here). `viewer.json` `lights.gain` multiplies
  a light's intensity by name (to tune a stand-in without a re-export), and
  `lights.exclude` carries light linking, which glTF drops (see below). `viewer.json`
  `lights.priority` and `lights.specular` set the same by light name and win over the
  extras. Light linking does not export: a light linked to a few objects lights everything
  in the web edition unless `lights.exclude` names it.
- **Size.** Keep `scene.glb` under 60 MB. Draco and meshopt compression both load.

### How the sky contract is read

`sky.js` implements `sky.json` as written in the brief:

- A three.js direction t is the Blender world direction (t.x, -t.z, t.y).
- Equirect: L = M d with `matrix` row-major, u = atan2(L.y, -L.x) / 2pi + 0.5,
  v = atan2(L.z, hypot(L.x, L.y)) / pi + 0.5, v = 0 at the bottom row. This is Blender's
  Environment Texture turned 180 degrees about Z; the kit exports `RZ180 @ M` so both sides agree.
- Rect: gnomonic. u = dot(d, right) / dot(d, forward) / (2 tan(hfov/2)) + 0.5, v likewise
  with `up` and `vfov`. `feather` multiplies smoothstep(0, feather, x) at each of the four
  edges (in uv units), exactly as the kit's nodes do.
- Each layer is pow(texel, gamma) * gain in linear light. Layers add; a layer with
  `"add": false` is composited over the layers before it with its feather mask instead.
- Equirect layers may carry `"horizon_fade": {"floor", "height_deg"}` (the kit's
  extinction): the layer is multiplied by floor + (1 - floor) * smoothstep(0, height_deg,
  elevation), elevation in degrees above the horizon.
- Rect layers may carry `"disc": r`: the layers before it are hidden inside a disc of uv
  radius r around the rect's centre (anti-aliased over about a texel), then the layer is
  added. This is the kit's moon laid over the stars (`blend='over'`, disc radius
  0.5 / (1 + halo_size)); without it the stars show through the moon's dark side.
- Grade, in order: exposure (stops), contrast as 0.18 * pow(c / 0.18, contrast), saturation
  around Rec.709 luma, tint.
- Horizon glow adds color * strength * (1 - t)^2 with t = clamp(elevation / height_deg, 0, 1),
  full strength at and below the horizon.
- Images are sRGB JPGs decoded in hardware to linear, with mipmaps and anisotropic
  filtering. The equirect seam uses wrapped gradients, so it never drops to a blurry mip.
  Where the plate is magnified (most phone views), a Catmull-Rom filter keeps point stars
  crisp instead of soft.

The same sky lights the scene through a PMREM environment map, the way the kit lights it:
sky * gain * tint + ambient (`world_light`), with the ground hiding the lower hemisphere.
Reflections in the mirror pass see the sky the same way, as Blender's glossy rays do. Fog
is exponential, coloured by the sky just above the horizon (or `fog_color`), with a density
taken from the scene's depth (about 11 percent at the 75th percentile of object distances).
FogExp2 does not touch the sky, and Blender's volume scatter has no web counterpart.

## Rendering and finish

Linear half-float buffers with 4x MSAA (2x on touch devices), then UnrealBloomPass run at
a fixed 1280-pixel reference height (so the glow looks the same at any pixel ratio), then
`finish.js`, in the kit's order: comp saturation (it keeps Rec.709 luma, so applying it
after the bloom equals the kit applying it before), the kit's lens dispersion, vignette and
film grain in scene-linear, the film's own end-of-compositor grade, exposure, and the view
transform: Khronos PBR Neutral (the reference curve, as three.js r170's
NeutralToneMapping) or AgX with the optional "AgX - Punchy" look. AgX is three.js r170's
own; Punchy is fitted to Blender 5.2's look on a 197-colour probe (mean error 0.006). The
bloom defaults were matched by eye to the kit's Bloom plus Fog Glow compositor on the test
fixture. Each bloom level blurs with a full Gaussian (to 3 sigma) of the same spread as
r170's kernel, which is cut off at one sigma and draws bright points as squares.

Per-light specular: every lit material carries one specular factor per direct light,
filled before each render in three.js's own light order, and each light's direct
specular is scaled by it (diffuse untouched). This is a patch of three.js's
`lights_fragment_begin` chunk; if a three.js update changes that chunk the viewer warns
and runs without it. The same patch carries light linking: a material on an object that
`lights.exclude` names gets its own copy with a "light off" flag per direct light, which
drops that light's diffuse, specular, clearcoat and sheen on it (pooled proxies take the
flag of the light they stand for). The specular factor does not reach clearcoat or sheen.

## viewer.json

All keys are optional. The lighting, bloom and post defaults follow `kit/povkit.py`
(`sky.set_lighting`, `comp.setup`). The view defaults do not: they stay AgX - Punchy at
exposure 0 with no comp saturation, which the films were first tuned with and the test
fixture renders. The kit's `render.setup` now renders Khronos PBR Neutral at exposure -0.4
after `comp.setup` saturation 1.15, so a film made with the current kit should set
`"view": "neutral"`, its `exposure` and its comp `saturation`.

```json
{
  "view": "agx",
  "exposure": 0.0,
  "look": "punchy",
  "saturation": 1.0,
  "grade": { "black": 0.0, "contrast": 1.0, "contrast_mode": "rgb",
             "split_tint": [1, 1, 1], "split_from": 0.015, "split_to": 0.55 },
  "bloom": { "strength": 0.12, "radius": 0.8, "threshold": 1.0, "knee": 2.0, "saturation": 1.0 },
  "world_light": { "gain": 0.15, "tint": [0.75, 0.85, 1.0], "ambient": [0.004, 0.006, 0.012] },
  "env_intensity": 1.0,
  "post": { "vignette": 0.32, "vignette_radius": 0.62, "grain": 0.022, "dispersion": 0.006 },
  "fog_density": null,
  "fog_strength": 1.0,
  "fog_color": null,
  "light_units": "spec",
  "lights": { "point": 24, "spot": 8, "touch_point": 10, "touch_spot": 4,
              "priority": {}, "specular": {}, "gain": {}, "exclude": {} },
  "mirror": { "strength": 1.0, "streak": 1.0, "ground": "", "water": "",
              "env": 1.0, "shift": 0.0, "only": "" }
}
```

- `view`: `neutral` (Khronos PBR Neutral, the kit's `render.setup` default) or `agx`.
  `exposure`: Blender's view exposure in stops. `look`: `punchy` or `none`, AgX only.
- `saturation`: the film's `comp.setup` saturation (kit default 1.15), around Rec.709 luma
  in scene-linear.
- `grade`: a film's own grade at the end of its compositor, before the view transform, in
  this order. `black`: black point, max(c - black, 0) / (1 - black). `contrast`: a power
  around 0.18, per channel (`contrast_mode` `rgb`, 0.18 * pow(c / 0.18, contrast)) or on
  luma so hue and saturation stay (`luma`, c * min(pow(L / 0.18, contrast - 1), 4)).
  `split_tint`: the darks are multiplied by mix(split_tint, 1, smoothstep(split_from,
  split_to, L)), a cool split tone.
- `bloom.radius`: 0 keeps the glow tight; 1 puts the weight in the widest levels; it may be
  negative (the level weights fall by 0.5 + radius per level, at least 0.1, so -0.3 gives
  1, 0.2, 0.04 ...). `knee` softens the threshold. `saturation`: the kit's
  `bloom_saturation`, on the glow alone (default 1 here: the bloom defaults were matched by
  eye with none).
- `world_light`: match `pk.sky.set_lighting(...)` or the `light`, `light_tint` and `ambient`
  arguments of `pk.sky.galactic(...)` when a film changes them.
- `fog_density`: a fixed FogExp2 density instead of the automatic one; `fog_strength`
  scales the automatic one. `fog_color`: linear RGB instead of the sky just above the
  horizon (for a film whose haze has its own colour).
- `light_units`: `spec` (exporter "Standard"), `compat` ("Unitless") or `raw`.
- `lights.point` / `lights.spot`: the desktop light budget. `lights.touch_point` /
  `lights.touch_spot`: the caps on touch devices (default 10 and 4; the desktop budget still
  applies when smaller). Each light costs shader time and compile time, so raise them a
  little at a time, and phones most carefully.
  `lights.priority`, `lights.specular` and `lights.gain`: maps from a light-name pattern (a
  regular expression on the Blender object name, any case) to an importance multiplier, a
  specular factor or an intensity factor, for example `{"^BloomGlow": 8}`,
  `{"^MoonLight$": 0.05}` or `{"^BowLanternLight$": 0.5}`. A gain also scales the light's
  importance in the pool, since that follows its power.
  `lights.exclude`: Blender's light linking, from a light-name pattern to an object-name
  pattern (the mesh, or the group a multi-material mesh is wrapped in), for example
  `{"^MoonSun$": "^Floor$"}`: that light does not light those objects at all. Each
  matching object gets copies of its materials, so keep the patterns narrow.
- `mirror.strength` / `mirror.streak` scale every mirror; `mirror.ground` / `mirror.water`
  are extra object-name patterns that get a ground or a water mirror.
  `mirror.env`: the share of the environment map's specular a glossy mirror keeps (1, the
  default, keeps it all; 0 counts the sky once, through the mirror image alone).
  `mirror.shift`: moves each streak along its
  length, in streak lengths (positive hangs the reflection further toward the viewer, as
  the kit's compositor streak shift does). The `mirror_env` and `mirror_shift`
  extras set the same per object and win over these. `mirror.only`: an
  object-name pattern for reflection-only meshes (as the `pk_mirror_only` extra).

## URL parameters

`?film=<slug>` opens a film. For checks and screenshots: `t=<seconds>`, `paused=1`,
`look=<yaw>,<pitch>` (degrees, holds the pose), `look=off`, `bare=1` (the picture alone,
filling the window), `dpr=<n>` (pixel ratio cap), `sky=<path>` (another sky.json, same
origin), `lights=<n>` (light budget), `bloom=<strength>,<radius>`, and `bloom=0`, `fog=0`,
`env=0`, `mirror=0`, `post=0`, `sharpen=0` to switch one effect off.
`set=<URL-encoded JSON>` lays settings over `viewer.json` (same keys, merged the same way),
to try them without editing the file, for example
`set=%7B%22view%22%3A%22neutral%22%2C%22exposure%22%3A-0.4%7D`.

## Test fixture

`films/_viewer-test/make_fixture.py` builds a small night street (emissive boxes, lamp
posts with point lights, a glossy plane named `ground`, a 14 s keyed camera with a child
dashboard and an emissive gauge), exports `films/_viewer-test/web/scene.glb` and writes
`sky.json` with one equirect layer from `assets/web/eso0932a_6k.jpg` (it writes that JPG
from the ESO TIFF if missing). Its world shader is a literal node build of the sky
contract, so Blender stills of the fixture check the viewer side by side:

```
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --factory-startup --python-exit-code 1 -P films/_viewer-test/make_fixture.py
$B -b --factory-startup --python-exit-code 1 -P films/_viewer-test/make_fixture.py -- \
   --no-export --still 4.0 --scale 0.5 --kit-post --out /tmp/fixture_t4.png
```

then compare with `viewer/?film=_viewer-test&t=4&paused=1&bare=1&dpr=1` at 540 x 960.
`--kit-post` runs the kit's own compositor finish and Punchy look on the still.
`films/_viewer-test/web/sky_rect.json` adds a rect moon layer
(`&sky=../films/_viewer-test/web/sky_rect.json`).
