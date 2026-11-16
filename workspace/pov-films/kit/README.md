# povkit: the shared Blender kit

`kit/povkit.py` is one pure-bpy module (Blender 5.2, EEVEE on Metal, headless) that every
film imports. It owns the render setup, the real-photo sky, the camera rig, the vehicle
foreground, a procedural material library, geometry and particle helpers, the compositor
and the web export (glTF + `sky.json`).

`films/_kit-test/build.py` is a small rain-wet street that uses almost everything. Read it as
the worked example.

## Running a film

```
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
  -P films/<slug>/build.py -- <args>
```

| arg | meaning |
| --- | --- |
| `--stills 1.0,4.0,7.0,9.5` | seconds; writes `films/<slug>/stills/t1.0.png` ... (frame = 1 + t * 24, fractional frames use subframes) |
| `--scale 0.5` | resolution fraction for this run (default 1.0 = 1080 x 1920) |
| `--frames 1-336` | PNG sequence (8-bit RGB) to `renders/<slug>/0001.png` ... (`--frames 100` renders one frame) |
| `--samples N` | EEVEE render samples (default 64) |
| `--export-web` | writes `films/<slug>/web/scene.glb` and `films/<slug>/web/sky.json` (+ JPGs in `assets/web/`) |
| `--save-blend` | saves `films/<slug>/<slug>.blend` for debugging (about 200 MB because generated images get packed; delete it after use) |

Defaults: 1080 x 1920, 24 fps, frames 1 to 336, frame 1 is t = 0. Several flags can be
combined; the order of work is save-blend, stills, frames, export-web.

## A film's build.py

```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'kit'))
import povkit as pk

def build(ctx):
    cam = pk.camera.drive([(0, -30), (0, 6), (-2.6, 30), (-1.2, 52), (3.8, 76), (9.8, 100)],
                          speed_mps=5.4, height=1.2, fov_v_deg=62, pitch_deg=6.5)
    path = ctx.path                                   # pk.Path, arc-length parameterised
    pk.geo.road_from_curve(path, material=pk.mat.wet_asphalt(),
                           curb=pk.mat.clay((0.3, 0.3, 0.38)),
                           sidewalk=pk.mat.wet_asphalt(name='Pavers', lane_markings=False),
                           verge=pk.mat.ground())
    pk.vehicle.car_dashboard(cam, cover=0.15)
    pk.sky.galactic(core_az=16, core_el=9, tilt=-45)   # core low behind the right roofs
    pk.sky.moon(az=11, el=33, phase=0.2, light=0.6)    # crescent, cool moon fill
    pk.comp.setup(star_glow=0.25)                     # optional; defaults are applied if omitted

pk.main('my-slug', build)
```

`main()` clears the factory scene (it has a cube, a light and a camera), applies
`render.setup()` defaults, calls `build(ctx)`, applies `comp.setup()` and a default
`sky.galactic()` if the film did not, applies light-linking exclusions
(`exclude_from_lights`), scales pixel-sized compositor settings to `--scale`, then does what
the CLI asked.

## Conventions

- Units are meters. Z is up. +Y is the initial travel direction.
- Azimuth is measured from +Y toward +X (clockwise seen from above, so positive = to the
  right of the initial heading). Elevation is above the horizon. `pk.sky_dir(az, el)` gives
  the world unit vector.
- Path lateral offsets: positive = right of travel.
- Car frame (vehicle rig): X right, Y forward, Z up, origin at the eye, level with the road
  (pitch removed), rigidly attached to the camera.
- Everything is deterministic: seeded RNGs, keyframes, F-curve modifiers, simple-expression
  drivers. No simulation caches, nothing that needs Python auto-run.
- Web fallbacks: every kit material stores a flat `m['pk_web']` dict used by the glTF export
  (set it with `pk._web(m, base, rough, metal, emit, emit_strength, alpha, transmission,
  coat=0, coat_rough=0.03)`; `coat > 0` exports `KHR_materials_clearcoat`).

## `ctx`

| member | |
| --- | --- |
| `ctx.slug`, `ctx.args`, `ctx.scene` | |
| `ctx.fps` (24), `ctx.frame_start` (1), `ctx.frame_end` (336) | |
| `ctx.t2f(t)`, `ctx.f2t(f)` | seconds to frame and back |
| `ctx.camera`, `ctx.path`, `ctx.s_of_t(t)` | set by `camera.drive`; `s_of_t` is the arc length where the camera is at time t |
| `ctx.collection(name)` | get or create a collection |
| `ctx.rng` | `random.Random(1234)` |
| `ctx.web_skip` | set of object names to leave out of the glTF |
| `ctx.film_dir`, `ctx.render_dir`, `ctx.web_dir` | |

## render

```python
pk.render.setup(samples=64, exposure=-0.4, view_transform='Khronos PBR Neutral', look='None',
                motion_blur=0.32, raytrace=True, trace_res='1', trace_max_roughness=0.55,
                fast_gi=True, volumetric_tile='8', volumetric_samples=48, volumetric_end=220.0,
                shadow_rays=1, filter_size=1.2, clamp_indirect=10.0)
```

EEVEE with screen-traced ray tracing at full resolution (so the wet road mirrors the actual
lights on screen), horizon-scan GI, soft (jittered) shadows on kit lights, volumetric
shadows, post motion blur with shutter 0.32.

View transform: the default is **Khronos PBR Neutral at exposure -0.4**. It keeps neon and
window hues saturated (cobalt stays cobalt, magenta stays magenta) where AgX bleaches bright
emissives toward white, and it gives the sky a deeper navy. The `galactic()` grade defaults
are tuned for it. `view_transform='AgX', look='AgX - Punchy', exposure=0.35` is the softer,
more filmic alternative (the sky then reads brighter; lower the galactic `exposure` by
about 0.5). `look` only applies to AgX. `main()` calls `setup()` with defaults; call it
again in `build` to override, or set `ctx.scene.view_settings` directly.

## sky

The world is a stack of layers summed in linear light, then graded, then a horizon glow is
added. Camera rays see the full graded sky; every other ray (world lighting, probes) sees
`sky * light_gain * light_tint + ambient`, so the sky can be dramatic on screen while the
town is lit by its own lights.

### sky.galactic

```python
pk.sky.galactic(core_az=10, core_el=22, tilt=-35,      # where the anchor point sits
                anchor_l=0, anchor_b=0,                # galactic (l, b) placed there; 0,0 = core
                exposure=0.8, contrast=1.35, saturation=1.5, tint=(0.8, 0.86, 1.25),
                mw_boost=1.0, star_boost=4.0, star_gamma=0.9,
                source='photo',            # 'photo' (default), 'eso', 'nasa' or 'mix'
                star_radius=2, detail=0.8, detail_radius=6, dust_contrast=0.0,
                background=(0.002, 0.004, 0.022),
                airglow=0.5, airglow_color=(0.3, 1.0, 0.45), airglow_red=0.35,
                skyglow=0.25, skyglow_color=(0.1, 0.16, 0.38),
                dawn=0.0, dawn_az=0.0, dawn_color=(1.0, 0.42, 0.16),
                dawn_height_deg=12, dawn_spread_deg=70,
                extinction=0.8, extinction_height_deg=18,
                horizon_glow=0.015, horizon_color=(0.3, 0.4, 0.95), horizon_height_deg=11,
                light=0.15, light_tint=(0.7, 0.82, 1.0), ambient=(0.004, 0.006, 0.012))
```

How the layers are made (all real data, nothing procedural except the horizon layer):

- **Milky Way glow and dust (`source='photo'`)**: the ESO/S. Brunier all-sky photo made
  *starless* (grey morphological opening with a `star_radius` px window removes every point
  star while dark lanes keep their shape; compact bright residuals such as Jupiter and the
  brightest stars are in-painted; a Gaussian-like blur hides the window shape), resampled
  into exact galactic coordinates with the measured ESO offset, and multiplied by the fine
  structure of the NASA SVS Gaia map (`milkyway_2020_8k_gal.exr` luminance over its own
  blur, to the power `detail`). The ESO plate gives the colour, the warm core and the pink
  nebulae; the Gaia map gives sharp dust-lane edges and the grain of unresolved faint stars.
  The result is cached once as an 8192 x 4096 16-bit PNG (about 17 s, 145 MB in
  `$TMPDIR/povkit-cache/`). `'eso'` uses only the starless ESO plate, `'nasa'` only the Gaia
  map, `'mix'` both added. `dust_contrast` (0.1 to 0.3) deepens the lanes.
- **Point stars**: the NASA SVS 16k Hipparcos/Tycho plate, the only source of point stars,
  so they stay crisp (no soft ESO star blobs, no sharpening rings). The layer is
  `star_boost * 1.6 * texel^star_gamma`; `star_gamma` above 1 gives fewer stars with black
  gaps, below 1 a denser field. Judge crispness at `--scale 1.0`.
- **Placement**: the galactic point (`anchor_l`, `anchor_b`), by default the core, sits at
  (`core_az`, `core_el`); `tilt` is the band angle there as seen from the ground (0 = level,
  negative = descends to the right; longitude decreases to the right). Keep the band
  narrow in the 9:16 frame: with `fov_v_deg=62` the frame spans only about +-18.6 degrees of
  azimuth, so a core in shot fills the whole width. The test street puts the core low
  behind the right-hand roofs (`core_az=16, core_el=9, tilt=-45`) so the band climbs
  diagonally to the upper left and covers about a third of the sky, with dark sky on both
  sides. To frame another stretch of the band without the core, set `anchor_l` (for
  example 30 for the Aquila rift, -73 for Carina).
- **Extinction**: stars and Milky Way fade toward the horizon to `1 - extinction` at
  elevation 0 over `extinction_height_deg`, so the skyline is not a flat backdrop.
- **Atmosphere layer**: a procedural world-frame equirect (background, light dome, green
  557.7 nm airglow band 3 to 15 degrees up with faint waves, a red band above it, optional
  dawn glow toward `dawn_az`), baked once so Blender and the web use the identical image.
- **Grade** (`exposure`, `contrast` about 0.18, `saturation`, `tint`) then the additive
  `horizon_glow` light dome. Measured on the test street (sky region, sRGB 0..255): median
  luma 16 to 18, 25th percentile about 8, background between stars about (1, 2, 50),
  chroma about 50.
- `light` / `light_tint` / `ambient`: how much the sky lights the scene (non-camera rays).
  For a lit town keep `light` low (0.03 to 0.15) and use `ambient` for a blue fill; camera
  rays always see the full graded sky.

Pre-dawn example (film 03): `pk.sky.galactic(core_el=12, exposure=0.3, dawn=1.0, dawn_az=-30,
airglow=0.2)`.

### sky.moon

```python
pk.sky.moon(az=14, el=31, size_deg=3.5, phase=0.2, lit_angle_deg=-35, gain=12.0,
            earthshine=0.008, relief=1.6, halo=0.25, halo_size=1.4, roll_deg=0,
            res=1024, light=0.0, light_color=(0.45, 0.6, 1.0))
```

A real moon: the LRO/LROC colour map with LOLA relief, rendered in numpy as a phase-lit disc
(Lommel-Seeliger shading, analytic anti-aliased limb, earthshine on the dark side, soft
scattering halo) and placed on the sky dome with the photo-plate projection ("over" blend,
so the disc hides the stars behind it). With the default grade the lit limb clips and
blooms (`gain` 10 to 15; the compositor lets sky pixels brighter than `sky_bloom_floor`
bloom); the earthshine side stays at about 1 percent of it. `phase` is the illuminated
fraction, `lit_angle_deg` points the bright limb (0 right, 90 up, -90 down). `size_deg` is
the angular diameter (the real moon is 0.5; 3 to 5 reads on a phone). `light > 0` adds a
sun lamp from the moon direction (W/m^2): 0.4 to 0.8 cobalt gives building faces a blue
moonlit side. Returns the moon direction.

### sky.equirect

```python
pk.sky.equirect(path, yaw_deg=0, pitch_deg=0, roll_deg=0, gain=1.0, gamma=1.0,
                el_min_deg=0.0, el_feather_deg=3.0, interp='Linear')
```

Any equirect plate (EXR/HDR/JPG/PNG/TIF), e.g. a dawn HDRI. `yaw_deg` is the world azimuth
where the plate centre (u = 0.5) appears. Plate content below `el_min_deg` (plate space)
fades out over `el_feather_deg`, so plate ground never shows (`None` keeps everything). The
mask is baked into the exported web JPG.

### sky.photo_plate

```python
pk.sky.photo_plate(path, center_az, center_el, hfov_deg, roll_deg=0, vfov_deg=None,
                   gain=1.0, gamma=1.0, feather=0.05, blend='add')
```

Projects a normal rectilinear photograph onto the sky at infinity by gnomonic projection
in world shader nodes (direction to plate frame to uv), with a smoothstep feather of
`feather` (fraction of the plate) on each edge. Blend modes: `add`, `screen`, `lighten`,
`over` (uses the image alpha), `replace` (opaque inside the feathered rectangle). The web
contract only has additive layers, so non-additive plates are exported additively.

### Low-level sky API

`sky.add_equirect_layer(name, image, matrix, gain, gamma, interp, el_mask, web, fade)`,
`sky.add_rect_layer(name, image, forward, right, up, hfov_deg, vfov_deg, gain, gamma,
feather, blend, web)`, `sky.set_grade(...)`, `sky.set_horizon_glow(color, strength,
height_deg)`, `sky.set_lighting(gain, tint, ambient)`, `sky.galactic_matrix(core_az,
core_el, tilt)`, `sky.rect_frame(az, el, roll)`. `fade=(floor, height_deg)` is the
extinction factor `floor + (1 - floor) * smoothstep(0, height_deg, elevation)`. Call layer
functions after `galactic()` (which resets the stack). Plate helpers usable on their own:
`pk.starless(linear_array, star_radius, peak_ratio, smooth)`, `pk.eso_plate(...)`,
`pk.milkyway_plate(...)`.

### sky.json (contract shared with the three.js viewer)

`--export-web` writes `films/<slug>/web/sky.json` and web-sized JPGs (max 8192 wide) into
`assets/web/` (names carry a parameter hash; existing files are reused).

```json
{
  "layers": [
    {"type": "equirect", "name": "stars", "image": "../../../assets/web/hiptyc_2020_8k_mean.jpg",
     "matrix": [9 numbers, row-major], "gain": [r, g, b], "gamma": 1.0, "add": true},
    {"type": "rect", "name": "moon", "image": "...", "forward": [x, y, z], "right": [...],
     "up": [...], "hfov_deg": 21.0, "vfov_deg": 21.0, "gain": [...], "gamma": 1.0, "feather": 0.0}
  ],
  "grade": {"exposure": 0.8, "contrast": 1.25, "saturation": 1.35, "tint": [0.85, 0.8, 1.3]},
  "horizon_glow": {"color": [r, g, b], "strength": 0.0, "height_deg": 8.0}
}
```

Exactly what the kit computes, in this order (the viewer must match it):

1. Images are sRGB JPGs: decode to linear (three.js `SRGBColorSpace`). `v = 0` is the bottom
   image row.
2. Equirect layer: `l = M d` (row-major 3x3, `d` the Blender world direction),
   `u = atan2(l.y, -l.x) / (2 pi) + 0.5`, `v = atan2(l.z, hypot(l.x, l.y)) / pi + 0.5`.
3. Rect layer: `u = 0.5 + (d.right / d.forward) / (2 tan(hfov/2))`,
   `v = 0.5 + (d.up / d.forward) / (2 tan(vfov/2))`, zero when `d.forward <= 0`;
   mask = `ss(u) ss(1-u) ss(v) ss(1-v)` with `ss(x) = smoothstep(0, feather, x)`; with
   `feather = 0` the mask is 1 inside [0,1]^2 and 0 outside.
4. Each layer contributes `gain * c^gamma` (times the mask for rect); layers are summed.
5. Grade: `c *= 2^exposure`; `c = 0.18 * (max(c,0) / 0.18)^contrast`;
   `L = dot(c, (0.2126, 0.7152, 0.0722))`, `c = max(L + (c - L) * saturation, 0)`;
   `c *= tint`.
6. Horizon glow: `el = asin(d.z)` in degrees, `t = clamp(1 - el / height_deg, 0, 1)`,
   `c += color * strength * t^2` (so it is full strength at and below the horizon).
7. Directions: Blender `(x, y, z)` = three.js `(x, -z, y)`.

The JPGs are scaled to use the 8-bit range; the exported `gain` already divides that scale
out (`gain / k^gamma`).

Convention note: Blender's actual Environment Texture node maps
`u = 0.5 - atan2(d.y, d.x) / (2 pi)`, which is the contract formula turned 180 degrees about
Z. The kit renders with Blender's node and exports `M_json = Rz(180) @ M_blender`, so the
viewer can implement the contract formula literally. This was verified by rendering
`sky.json` with an independent numpy implementation of the steps above and comparing
against Blender (core, band, bright stars and moon land on the same pixels).

Optional extension: an equirect layer may carry
`"horizon_fade": {"floor": 0.2, "height_deg": 18}` (the `extinction` of `galactic()`):
multiply that layer by `floor + (1 - floor) * smoothstep(0, height_deg, el_deg)` before
summing, with `el_deg = degrees(asin(d.z))` of the Blender world direction. Viewers that
ignore it show slightly more stars at the horizon; nothing else changes.

Blend modes on the web: a rect layer with blend `'replace'` is written with `"add": false`
(composited over the layers before it with its feather mask). `sky.moon()` records the uv
radius of its disc, `0.5 / (1 + halo_size)`, and while the layer stays `'over'` sky.json
carries it as `"disc"`: the viewer hides the earlier layers inside the disc, so no stars show
through the dark side. Other blends (`'lighten'`, `'screen'`, `'over'` without a disc) are
written additive.

## camera

```python
cam = pk.camera.drive(points=None, curve=None, speed_mps=5.5, height=1.25, fov_v_deg=60,
                      look_ahead=9.0, sway=0.06, vibration=0.0018, pitch_deg=5.0,
                      lean=1.0, max_roll_deg=2.0, shake_deg=0.0, lateral=0.0, start_s=0.0,
                      slow_after_s=10.0, end_speed_factor=0.35, slow_ease_s=2.5, seed=7)
```

- `points`: list of (x, y) or (x, y, z) control points; a centripetal Catmull-Rom spline is
  arc-length sampled (`pk.Path`). Or pass a Blender curve object as `curve`.
- Constant speed for the cruise; after `slow_after_s` it eases to `end_speed_factor` over
  `slow_ease_s` (the camera keeps moving slowly under the end card).
- Look-ahead steering: the camera aims at the path point `look_ahead` m ahead. It rolls
  into curves (about 1 to 2 degrees on a gentle S at 5.4 m/s; `lean` scales it,
  `max_roll_deg` caps it), sways slowly sideways (`sway`, m) and has a very subtle vertical
  road vibration (`vibration`, m) built from low-frequency sines. There is no shake: the
  brief says the camera does not shake. `shake_deg > 0` adds a rotational micro-jitter at 2
  to 4 Hz for films that want it; keep it under 0.15.
- Keys every frame from 0 to 337 with linear interpolation (motion blur and glTF friendly).
- `pk.camera.static(location, look_at, fov_v_deg)` for tests.

`pk.Path` (also `ctx.path`): `at(s)`, `tangent(s)`, `right(s)`, `offset(s, lateral, z)`,
`heading(s)` (deg), `curvature(s)`, `frame(s)` (4x4, X right, Y forward), `samples(spacing)`,
`length`. Use `ctx.s_of_t(t)` to place things where the camera will be at time t.
Composition tip from the test street: bend the road into a gentle S and put a bright
landmark on the axis of the last bend so the eye has a target at the vanishing point.

## vehicle

```python
parts = pk.vehicle.car_dashboard(cam, cover=0.15, depth=0.95, width=2.4, bow=0.14,
                                 color=(0.012, 0.012, 0.016), roughness=0.35, coat=0.6,
                                 coat_rough=0.14, nose_radius=0.05,
                                 trim=True, trim_color=(0.32, 0.33, 0.36), trim_roughness=0.16,
                                 steering_wheel=True, wheel_x=0.0, wheel_y=0.55,
                                 wheel_radius=0.19, wheel_tube=0.018, wheel_top=0.09,
                                 roof=True, windshield=True, windshield_reflect=0.06,
                                 windshield_dirt=0.25, rain_beads=0.0,
                                 cabin_light=6.0, cabin_color=(0.42, 0.55, 1.0))
# -> {'dashboard', 'trim', 'roof', 'wheel', 'windshield', 'cabin_light'}
```

- The dashboard's top edge sits at `cover` (fraction of frame height from the bottom) at
  the centre and bows down by `bow` m toward the sides. Its coated soft-touch top mirrors
  the street at grazing angles, so it reads as a lit rim with a soft gradient (the test
  street measures about luma 100 at p98 on the 84 to 86 percent rows; the reference is
  86 to 143).
- `trim`: a 6 mm satin metal strip along the windscreen base that catches a thin bright
  line exactly at the dash edge.
- Steering wheel (driver's view, centred): a torus of `wheel_radius` / `wheel_tube` m,
  `wheel_y` m ahead of the eye, leaning back 28 degrees, with its top at `wheel_top` of the
  frame height; only the top arc shows, spanning the frame width like the reference.
- `cabin_light`: a soft cool area light (W) inside the windshield that lights only the
  dash, trim and wheel (light linking), standing in for street light through the glass, so
  the dash is not a black slab.
- Windshield: near-invisible glass with a fresnel whisper and smudges, excluded from all
  scene lights (light linking) so overhead lamps do not streak across it. `rain_beads`
  (0..1) adds small glossy drops; at night they are barely visible.
- `roof`: an invisible cabin roof that shadows the dash from moon and sky light.

Helpers for other vehicles (train cab, boat bow, jeep hood), all in the car frame (X right,
Y forward, Z up, origin at the eye, level with the road):

- `pk.vehicle.rig(cam)`: the level car-frame Empty parented to the camera.
- `pk.vehicle.cover_z(cam, cover, y)`: car-frame height that appears at `cover` of the frame
  height at forward distance `y`. Use it to put a hood edge or bow exactly where you want.
- `pk.vehicle.frame_angle(cam, frac)`, `pk.vehicle.half_width(cam, y)`.
- `pk.vehicle.attach(ob, cam)`: parent an object built in car-frame coordinates (also moves
  it into the `PK_Vehicle` collection and keys it so EEVEE motion blur treats it as moving
  with the camera).
- `pk.vehicle.steering_wheel(cam, x, y, radius, tube, top, tilt_deg, material)`.
- `pk.vehicle.cabin_light(cam, location, target, size, color, energy, receivers)`.
- `pk.vehicle.roof(cam, y0, y1, z, width)`: the invisible shadow caster.
- `pk.exclude_from_lights(*objs)`: make glass and similar parts ignore every scene light.
- `pk.geo.sweep(points, profile)` builds most hulls and hoods; `pk.mat.dashboard()`,
  `pk.mat.windshield()`, `pk.mat.metal()`, `pk.mat.varnished_wood()` cover the materials.

Example, a boat bow: sweep a U-shaped section along `[(0, 0.6, z0), (0, 3.0, z1)]` with
`scale` tapering to 0 at the tip, set `z0 = pk.vehicle.cover_z(cam, 0.16, 0.6)`, then
`pk.vehicle.attach(bow, cam)` and `pk.vehicle.cabin_light(cam, receivers=[bow])`.

## mat (material library)

All are EEVEE-friendly node materials with procedural micro-variation and a web fallback.

| function | notes |
| --- | --- |
| `mat.basic(color, roughness, metallic, emission, strength, coat)` | plain Principled |
| `mat.wet_asphalt(base, wetness, puddles=0.45, puddle_scale, ripples, lane_markings, center_color, edge_color, road_width, dash, gap, line_w, edge_inset, dry_rough, wet_rough=0.14, puddle_rough=0.03, grain, streak=1.0, undulation=0.03, undulation_size=0.4)` | needs road UVs in meters (`geo.road_from_curve`); near-mirror puddles, animated ripples, aggregate grain, worn lane lines, `streak` ridges that smear every reflection into long vertical streaks, and a low-frequency `undulation` ripple of the water film. Keep `wet_rough` near 0.12 to 0.16: in EEVEE a rougher film (0.22+) only dims and blurs the reflections, it does not lengthen them; length comes from the ridges and from `comp` `road_streak` |
| `mat.varnished_wood(light, dark, scale, axis, varnish, roughness, planks)` | rings and grain along `axis`, clear coat, optional board seams |
| `mat.toy_plastic(color, roughness, coat, sss, variation, edge_light)` | soft subsurface, orange peel, worn bright edges |
| `mat.painted_wood(color, wear, under, roughness, brush_axis)` | brush-stroke normal, edges worn to bare wood |
| `mat.clay(color, roughness, bumps, grime, variation, scale)` (alias `mat.plaster`) | stucco bumps, AO grime, darker toward the ground |
| `mat.metal(color, roughness, scratches, dirt)` | |
| `mat.glass(color, roughness, ior)` | ray-traced refraction |
| `mat.lit_window(color, strength, frame_color, mullions, frame_w, mullion_w, variation, curtains, unlit_color, hue_shift)` | for quads with UV 0..1 (`geo.window_panel`); frame + mullions, hot spot, curtain silhouettes, per-window brightness and hue from the face attribute `pk_rand` (> 1 = unlit) |
| `mat.emission(color, strength, blink)` | `blink=True` follows the object colour (fireflies) |
| `mat.neon_tube(color, strength, core)` | whiter hot core facing the viewer, glassy glint |
| `mat.ground(color, roughness, wet, scale, color2)` | grass / dirt / sand |
| `mat.dashboard(color, roughness, coat, coat_rough, spec)` | dark leather grain with a clear coat that mirrors the street at grazing angles |
| `mat.windshield(reflect, dirt, rain_beads, bead_scale)` | DITHERED glass (transparent + fresnel glossy) |
| `mat.snowflake(strength)` | |

Edge wear works through a baked point attribute `pk_edge` (convexity, 0..1) that
`geo.rounded_box`, `geo.lathe`, `geo.bevel` and the dashboard write; call
`pk.edge_mask(obj)` for your own meshes.

## geo (geometry)

```python
pk.geo.rounded_box(size=(w, d, h), radius=0.05, segments=4, location, rotation_deg,
                   material, origin='BOTTOM')
pk.geo.lathe([(r, z), ...], segments=48, material, location, cap_bottom, cap_top, sharp_angle)
pk.geo.bevel(obj, width=0.03, segments=3, angle=40)          # hardened normals, applied
pk.geo.sweep(points, profile, closed_profile=True, caps=True, scale=None)
pk.geo.tube_along(points | Path | curve_obj, radius=0.03, segments=12, resample=None)
pk.geo.road_from_curve(path, width=7, step=0.5, material, crown=0.04, curb=mat,
                       sidewalk=mat, sidewalk_width=2.5, curb_height=0.14, verge=mat,
                       verge_width=30)      # -> {'road', 'curbs', 'sidewalks', 'verges'}
pk.geo.string_lights(p0, p1, sag=0.6, count=12, colors=[...], strength=25,
                     bulb_radius=0.05, light_every=0, light_energy=6)
pk.geo.scatter(source_or_list, points, seed=0, scale=(0.8, 1.2), rot_z=True, tilt_deg=0)
pk.geo.points_along(path, spacing, lateral, s0, s1, jitter, lateral_jitter, z, seed, both_sides)
pk.geo.points_in_band(path, count, lat_min, lat_max, s0, s1, z, seed, min_dist, both_sides)
pk.geo.window_panel(cols, rows, win_w, win_h, gap_x, gap_y, material, seed, round_top, lit_fraction)
pk.geo.fog(center, size, density=0.02, falloff=4.0, base_z=0, color, anisotropy=0.35)
pk.mesh_object(name, verts, faces, uvs=None, material=None, smooth=True, attrs=None)
```

- `scatter` makes linked duplicates under one Empty (the glTF export turns them into
  `EXT_mesh_gpu_instancing`). The source objects are hidden and not exported.
- `window_panel` faces -Y in its local frame (origin bottom centre): rotate it so -Y points
  out of the facade, e.g. `panel.rotation_euler.z = yaw - pi/2` for a building on the right
  of the road with `yaw = -radians(path.heading(s))`.
- `string_lights` bulbs really emit (strength about 250 makes them bloom and streak on the
  wet road under the default grade); `light_every=n` adds a shadowless point light every n
  bulbs so they also streak on wet ground.
- `fog` density follows `density * exp(-(z - base_z) / falloff)` broken up by soft noise. It
  is not exported to glTF. Fog scatters every light, so keep it thin (0.001 to 0.005) in a
  town with many lights or it veils the colours; `lights.spot(..., volume=0.3)` reduces a
  light's scattering.

## particles

```python
pk.particles.snow(bounds_min, bounds_max, density=0.6, flake_size=0.018, speed=1.1,
                  layers=2, drift=0.35, strength=0.35)
pk.particles.fireflies(points, color=(0.75, 1.0, 0.35), strength=40, radius=0.018,
                       wander=0.35, blink=True)
```

Snow: each layer is one mesh of tiny flakes, duplicated twice and keyframed downward with a
Cycles F-modifier so it loops seamlessly (plus sideways noise drift). Cover the drive
corridor (the camera drives through static-in-XY snow). Fireflies: individual specks with
noise F-modifiers on location and on the object colour (the material reads it to blink).
Both render headless with no caches.

## lights

`pk.lights.point(location, color, energy, radius, shadow, soft, specular, volume)`,
`pk.lights.spot(location, target, color, energy, angle_deg, blend, radius, shadow, volume,
specular)`, `pk.lights.area(location, target, size, color, energy, shadow, spread_deg)`,
`pk.lights.sun(az, el, color, strength, angle_deg, shadow)`.

- Street lamps work best as downward spots (light pools and streaks on the road). The test
  street uses 3000 W spots in pure hues alternated along the road (cobalt
  (0.15, 0.35, 1.0), magenta (1.0, 0.15, 0.6), orange (1.0, 0.45, 0.1)) plus a 1400 W
  coloured wash spot at the foot of each facade, so every building face gets a coloured
  pool and gradient.
- Set `volume=0` on lights that point up or sideways through a fog box (facade washes,
  uplights), or their cones show as solid shafts over the sky.
- `pk.lights.reflection_probes(path, spacing=20, s0, s1, height=2.0, radius)`: sphere
  probes along the road; EEVEE falls back to them when a reflection ray leaves the screen.
  The gain on the test street was small, and a probe next to a bright lamp painted a tall
  coloured band across the sky through the windshield, so the test street does not use them.
- Web edition (glTF has no area lights, no light linking and no specular factor), see also
  the web export below: each AREA light exports as a stand-in on the same object (name,
  transform, parent, custom properties kept): a SPOT of 4x the power with a cone of the
  area's spread (a Lambertian panel's on-axis intensity P/pi equals a spot's P_s/(4 pi)),
  a POINT of 2x with `o['pk_web_point'] = 1`, or a SUN of `o['pk_web_sun']` W/m^2 for panels
  much larger than their distance to the subject. `o['pk_web_energy']` (W) replaces the
  converted power. `o['pk_noexport']` (as on `vehicle.cabin_light`) exports nothing; an
  area light with `hide_render` exports only with `o['pk_webonly'] = 1`.
  A light that only lights the objects it includes through light linking gets
  `pk_range` = 1.25 x the distance to the far corner of those objects (logged). Any light may
  carry `o['pk_range']` (m): it becomes the glTF light range, three.js `light.distance`.
  Every light's `specular_factor` other than 1 is written as node extras `pk_specular`
  (a `pk_specular` the film sets on the object wins); `o['pk_priority']` ranks it in the
  viewer's light budget.
- `pk.lights.planar_probe(center, size, z, yaw_deg, influence, clip_start)` and
  `pk.lights.road_probe(path, s0, s1, margin)`: a planar probe over the road. On Blender
  5.2.1 / Metal it made the road reflections weaker, not stronger; kept for experiments.

## comp (compositor)

```python
pk.comp.setup(bloom=1.2, bloom_threshold=0.9, bloom_size=0.5, bloom_smooth=0.3,
              bloom_saturation=1.15, glow=0.15, glow_size=0.55, glow_threshold=6.0,
              distortion=-0.012, dispersion=0.006, sharpen=0.0, sharpen_depth=800.0,
              vignette=0.32, vignette_radius=0.62, grain=0.022, grain_size=1.0,
              saturation=1.15, sky_bloom=0.08, sky_bloom_floor=1.5,
              road_streak=1.0, road_streak_px=64, road_streak_threshold=0.6,
              road_streak_depth=200.0, star_glow=0.0, star_glow_threshold=0.35,
              star_glow_size=0.25, star_sparkle=0.0, star_sparkle_threshold=0.8,
              star_sparkle_fade=0.86)
```

In order (all thresholds are scene-linear):

1. Saturation.
2. Bloom (Glare 'Bloom') and a wide Fog Glow on very hot pixels. Sky pixels (depth beyond
   800 m) bloom only at `sky_bloom` strength unless brighter than `sky_bloom_floor`, so the
   moon clips and blooms while the Milky Way does not veil the town.
3. `road_streak`: wet-road streaks. Highlights above `road_streak_threshold` on up-facing
   surfaces (Normal pass z > 0.8) nearer than `road_streak_depth` and farther than 2 m (not
   the dashboard) are blurred vertically by `road_streak_px` (at 100 percent; scaled with
   `--scale`) and added back inside the same mask, so they never leak onto facades or sky.
4. `star_glow`: a tight Fog Glow on the brightest stars only; `star_sparkle`: a faint
   4-point Streaks glint at 45 degrees on stars above the threshold (both sky-masked, off by
   default; the test street uses 0.25 and 0.08).
5. Lens distortion with chromatic dispersion.
6. `sharpen` (default off): a Box Sharpen restricted to depth < `sharpen_depth`. Any sharpen
   rings around point lights and stars (black outlines), so leave it at 0 unless a film
   needs it, and never above 0.03.
7. Analytic vignette, then fine luminance-weighted film grain that changes every frame.

## Web export (`--export-web`)

- `films/<slug>/web/scene.glb`: everything renderable except volumes, the windshield, the
  cabin roof, hidden scatter sources, objects with `pk_noexport` and names in `ctx.web_skip`.
  A mesh with `o['pk_webonly'] = 1` exports even though `hide_render` keeps it out of the film
  (web-only stand-ins: lane markings, wet ruts). Camera (glTF yfov, aspect
  0.5625) with its per-frame animation, the vehicle parts as children of
  `POVCam > VehicleRig` (nodes carry `extras.pk_vehicle`), lights (KHR_lights_punctual; area
  lights as point/spot/sun stand-ins, node extras `pk_specular`, `pk_priority`, range from
  `pk_range`, see lights), emissive strength
  (KHR_materials_emissive_strength), clear coat (KHR_materials_clearcoat, from `pk_web`
  `coat`), sampled animation for particles. `mat.lit_window` exports its glow at 0.55 x
  `strength` (the panel mean after frame and silhouettes), and window faces with
  `pk_rand >= 1` move to a non-emissive `<material>_unlit` copy (`m['pk_web_unlit']`, base
  `unlit_color`, roughness 0.06). `mat.snowflake(strength)` exports its emission. All animation is merged
  into one clip named `Scene` (play clip 0 from t = 0; frame 1 = 0 s). Scatter groups become
  `EXT_mesh_gpu_instancing` nodes (named `<group>_instances`) in a post-pass. Procedural
  materials are flattened to their `pk_web` constants first. The export runs last (after
  stills and frames) and every export-time edit (flattened materials, unlit window faces,
  light stand-ins, extras) is web-only: renders are unchanged.
- `films/<slug>/web/sky.json` + `assets/web/*.jpg` (see the contract above).
- The test street exports at 2.5 MB (`scene.glb`); its sky JPGs total about 10.8 MB (photo
  Milky Way 6.1 MB, stars 4.6 MB, atmosphere 77 KB, moon 54 KB) and are shared by every
  film that uses the same plate settings. Each JPG has a small `.json`
  sidecar holding its encode scale so re-exports can reuse it.

## Performance (M4 Pro, measured on `_kit-test`)

- Full resolution 1080 x 1920, 64 samples: 6.5 s per frame averaged over a 5-frame
  sequence (frames 120 to 124, 32.4 s), 9.1 s for a cold single still (shader compile and
  texture upload included). Half-scale stills take 2 to 6 s. Other Blender processes on the
  GPU slow this down.
- A full-resolution PNG frame is about 3 MB, so 336 frames need about 1 GB of disk.
- Plates are converted once into `$TMPDIR/povkit-cache/`: the 16k star EXR to an 8-bit sRGB
  PNG (14 MB, 5 s) and the photo Milky Way plate to a 16-bit PNG (145 MB, 17 s). Loading
  them as byte / half-float images keeps a render process at about 5 GB.
- Scene build is about 2 s; the moon image takes about 1 s.

## Gotchas found in Blender 5.2

- `--factory-startup` still has the default Cube, Light and Camera; a camera at the origin
  sits inside the cube. `main()` clears everything.
- `Material.use_nodes` is deprecated; new materials and worlds already have a node tree.
- Compositor: `scene.compositing_node_group` is a `CompositorNodeTree` with a
  `NodeGroupOutput` and an interface output socket; there is no Composite node. Glare,
  Lens Distortion, Filter, Blur and Ellipse Mask options are now menu input sockets
  (`g.inputs['Type'].default_value = 'Bloom'`; Glare types: Bloom, Ghosts, Streaks,
  Fog Glow, Simple Star, Sun Beams, Kernel; Streaks has `Streaks`, `Streaks Angle`,
  `Fade` inputs). The filter is `'Box Sharpen'` (no plain 'Sharpen'). Shader Math/Vector Math/Mix/Map Range/White Noise nodes work inside the
  compositor; `CompositorNodeMixRGB` is gone. Render-layer depth output is `'Depth'` after
  `view_layer.use_pass_z = True`.
- `ShaderNodeMix` has duplicate socket names per data type: use indices (factor 0, float
  A/B 2/3, colour A/B 6/7, colour result output 2).
- A BLENDED (forward transparent) surface covering the frame breaks EEVEE motion vectors and
  smears the whole sky with radial zoom blur. The windshield is DITHERED.
- EEVEE has no anisotropy, Bevel shader node, or Pointiness. The kit bakes a convexity
  attribute (`pk_edge`) and fakes anisotropic streaks with fine fore-aft ridges in the
  normal that TAA integrates.
- Environment Texture maps `u = 0.5 - atan2(y, x) / 2 pi` (centre of the image faces +X),
  180 degrees about Z from the sky.json formula; see the contract section.
- The ESO all-sky mosaic is offset from true galactic coordinates by -3.18 degrees in
  longitude and tilted 2.18 degrees about the in-plane axis at l = -117.3 degrees (measured
  by phase correlation against the NASA plates); the kit corrects it so ESO and NASA stars
  coincide within about 0.1 degree near the core.
- World: `world.sun_threshold` is set very high so EEVEE never extracts a sun from the moon
  or the galactic core.
- Generated images: `image.pixels.foreach_set()` then `image.update()`; Blender rows start
  at the bottom (numpy arrays from OIIO start at the top, flip them). Float images get
  packed (and become huge) only on `--save-blend`.
- Blender 5 actions are layered: F-curves live in
  `action.layers[i].strips[j].channelbags[k].fcurves`. Use `pk.fcurves(obj, data_path)`.
- Simple-expression drivers (`frame`, `sin`, `fmod`, `smoothstep`, `clamp`, ...) evaluate
  headless without enabling Python auto-run; anything else would be blocked.
- Area lights do not export to glTF.
- The glTF exporter's `export_gpu_instances=True` corrupts animation channel node indices
  in 5.2 (the camera animation points past the end of the node list) and drops animated
  instances. The kit exports without it and builds `EXT_mesh_gpu_instancing` itself, then
  merges all animations into one clip. Blender's own glTF importer only activates the first
  clip and mutes the rest in the NLA, which is another reason for the single clip.
- `bmesh.ops.bevel` is fine for cubes; set sharp edges with `mesh.set_sharp_from_angle()`
  (there is no auto smooth any more).
- The ESO all-sky plate is only 6000 px wide (17 px per degree), so its stars are soft 2 to
  4 px blobs at frame scale. Sharpening them (unsharp mask in the plate, Box Sharpen in the
  compositor) produced salt-and-pepper grain with dark rings around every star and every
  point light. The kit now removes the ESO stars entirely and takes all point stars from
  the 16k NASA plate; there is no sharpening anywhere by default.
- EEVEE planar light probes (`LightProbePlane`) made the wet-road reflections weaker on
  5.2.1 / Metal. Screen tracing with fore-aft normal ridges plus the compositor road streak
  matched the reference road brightness instead.
- Sphere probes are also sampled by glossy glass near the camera; a probe beside a bright
  lamp showed up as a tall coloured band across the sky through the windshield.
- Light linking works in EEVEE: `light.light_linking.receiver_collection`; per-object
  `collection_objects[i].light_linking.link_state = 'EXCLUDE'` builds an exclusion set.
- A spot light with volume scattering that points up through a fog box draws a solid shaft
  over the sky; use `volume=0` for facade washes and uplights.
- Compositor Blur `Size` is in pixels and does not follow the resolution percentage; the kit
  rescales registered sizes after `--scale` is applied. Glare sizes are relative.
- The Normal render pass is world space, so `normal.z` isolates the road in the compositor.
- `Khronos PBR Neutral` takes no look; AgX looks are prefixed (`'AgX - Punchy'`,
  `'AgX - High Contrast'`, `'AgX - Medium High Contrast'`, ...).
- A 16-bit PNG loads as a float image; with `use_half_precision` it costs half the memory of
  float32, and gradients in the dark sky do not band under the strong grade.
