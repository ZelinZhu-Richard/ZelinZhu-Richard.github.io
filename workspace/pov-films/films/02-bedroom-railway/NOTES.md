# 02-bedroom-railway

View from the cab of a toy tin locomotive running on tin track across a varnished bedroom floor at
night, through a town of cardboard-box houses and wooden blocks, toward a tall window that shows
the real Milky Way and a large crescent Moon.

## Reference analysis

Measured on `reference/ref_1s.png` ... `ref_9s.png` (720 x 1280) and the 2 fps contact sheet.

- **Horizon / vanishing point.** The road vanishes at about 57 to 60 percent of the frame height
  from the top (y 730 to 770 of 1280). The camera is pitched slightly up: the sky takes the top
  45 to 50 percent, the skyline band 45 to 62 percent, the road 62 to 86 percent.
- **Dashboard coverage.** A near-black dashboard covers the bottom 13 to 15 percent (rows below
  y 1100 have mean luma 1.5 to 11 of 255), with a thin bright rim line where it meets the road
  and a steering-wheel arc spanning the full width. It never shakes.
- **Brightness profile (mean luma by row band).** Sky 23 to 50, skyline band 75 to 105 (the
  brightest part of the frame), road 55 to 90, dashboard 2 to 20. Whole frame: mean 38 to 46,
  median 20 to 29, p90 about 115, p99 about 210. Saturation is extreme (HSV S mean 210 to 220 of
  255): the picture is almost entirely saturated blue and violet with hot neon accents.
- **Landmarks and timing.** 0 to 3 s: the amber hero building sits dead centre on the vanishing
  point, a striped tower left of it, a windmill above. 3.5 to 6 s: the road bends, the hero swings
  right and leaves the right edge at about 5.5 to 6 s, the windmill follows it out the top right.
  5 to 9 s: the striped tower grows on the left and sweeps out of the left edge at 8 to 9 s.
  9 to 10 s: a new, denser street opens up ahead (a reveal). 10 s: fade to dark, end card.
- **Density of lights.** Every building has 3 to 8 glowing portholes, plus neon signs, lanterns
  and street lamps: about 150 to 250 distinct light sources on screen at any time. The skyline is
  continuous across the full width at three depths (near facades, a mid row, tiny far towers).
- **Palette.** Deep cobalt and violet night (sky about (1, 2, 50) sRGB between stars), neon
  cyan / magenta / green motifs, one warm amber-orange hero, warm orange lamps. Warm is used
  sparingly so it pops against the cool field.
- **Depth layers.** (1) dashboard and steering wheel, (2) roadside props right beside the lane
  (life rings, lanterns, seaweed, rocks) that sweep past the bottom corners, (3) near facades,
  (4) mid town, (5) far towers, (6) sky with neon motifs, the Milky Way and the moon.
- **Reflections.** The wet road carries most of the colour: every light makes a long vertical
  streak, roughly 3 to 6 times taller than wide, broken by a slight ripple.
- **Sky.** A diagonal Milky Way from the top left to the centre right with pink knots, crisp dense
  stars, a big crescent moon (about 18 percent of the frame width) top right, a shooting star.
- **What makes it appealing.** A single readable composition (sky on top, glowing town in the
  middle, mirror road below) with leading lines to one vanishing point; constant gentle parallax;
  colour so saturated it reads at thumbnail size; the warm hero as the eye's anchor; a cosy
  "toy town at night" feeling; and a reveal right before the fade.

## Design: the world

Scale: 1 Blender unit = 4 cm of the real bedroom (toy scale 1:25). The camera eye is 1.9 units
(7.6 cm) above the floor, in the cab of an O-gauge tin locomotive; fov 62, pitch 6.5, 5.2 units/s
(a toy train's 21 cm/s), look-ahead 3. The window wall is 100 units ahead of the start, the
ceiling at 68 (2.7 m real). Everything except the sky and the Moon is procedural bpy (`build.py`,
about 2340 objects, built in 5 to 9 s).

**Palette.** Midnight indigo walls and ceiling, violet velvet curtains, a dark walnut floor whose
varnish mirrors everything, cobalt / magenta / cyan toy lamp posts and floor washes. Fairy lights
use three hues only (`FAIRY`: about 60 percent warm white and amber, 20 percent cyan, 20 percent
magenta); cut-out cardboard windows are mostly warm (about 60 percent) with cyan, magenta and a
few blue. Glow-in-the-dark stickers are phosphor green only. Cool fill from behind the camera,
cool moonlight from the window, one big warm hero (the dollhouse), and (round 3) a honey-brown
teddy on a bed pillow at the end of the line, with a warm key, a cool fill and a cool rim of its
own. Round 3 palette rule: amber practicals against blue moonlight; lamp globes mostly amber and
warm white; facade washes cobalt / cyan-blue / sodium with one magenta in eight.

**Path.** Tin track (two hollow nickel running rails and a centre rail on dark tin ties, 1.1 unit
pitch): straight out of the start, then a gentle right bend (heading peaks at about 17 degrees at
4 s) round the dollhouse, which sits on the axis of the opening straight, then a long straight
toward the window, ending at a red buffer stop with a lamp. Control points `PATH_PTS`; since
round 4 the path heading is Gaussian-smoothed over 7 units (`smooth_path_points`), so the pan
eases in from frame 0 and peaks at 5.3 px/frame.

**Vehicle foreground.** (Round 3: the boiler is glossy red enamel, coat 1.0, with brighter
lithographed gold bands, a lighter glossy smokebox, a broad warm sheen light from ahead, a cool
rim from behind-left and an 1800 W warm headlamp spot; see the changelog.) Round 2: the cab looks
over the boiler: a bottle-green enamelled tin boiler with
lithographed gold bands, a low green enamel dome with a thin gold ring, a short black stovepipe
chimney with a gold lip (its top sits at about 19 percent of the frame height, so nothing bright
sits at the bottom centre), a whistle and gold handrails on stanchions, the smokebox, footplate,
red valances, buffer beam, buffers and two lit lamps at the far front corners. A light-linked cool
fill (diffuse only) keeps the green readable; a small light-linked warm rim from ahead catches the
chimney lip, dome ring and boiler top. A warm-white headlamp spot lights the track ahead.

**Reflective surface.** Walnut floorboards (12 cm boards running toward the window) under a gloss
varnish: board seams (wider, darker, rougher), staggered butt joints, strong per-board tone,
cupping, fine across-the-grain ridges (calmer than before), a clear coat, plus the compositor road
streak (1.5, 110 px, threshold 0.45). The moon sun has no specular: its glint on the cupped boards
drew thin bright lines along the board edges.

**Warm hero and when it passes.** A wooden dollhouse at 0.8 scale (12 x 6.4 x 9.6 units plus
roof): honey painted wood, plum tin roof, dormer, teal shutters, flower boxes, a porch with posts,
steps and a glowing lamp, a fan light over the door, six amber mullioned windows with curtain
silhouettes, fairy lights along the eaves, warm uplights and a low warm spill. It stands left of
the track at about (1.2, 46.9), facing the start, so it is the warm hero right beside the
vanishing point: hero azimuth +2.7 deg at 0 s, -5.3 at 1 s, -12.6 at 2 s, -18 at 3 s; it sweeps
out of the left edge between 3 and 4.5 s. Nothing tall stands in front of it (no near houses on
the left before it, no tall loose blocks).

**Landmark timeline (0 to 14 s).**
- 0 to 3 s: the dollhouse sits warm at the vanishing point under the big window (Milky Way upper
  left, crescent Moon); one paper bunting and the curtain-rod fairy lights frame the top; dominoes,
  a tin rocket, a signal and box houses with warm windows on the right; the sleeping teddy's head
  peeks out right of the dollhouse.
- 3 to 4.5 s: the dollhouse swings out past the left edge; the signal passes the right edge.
- 4 to 9 s: the giant sitting teddy (lavender plush, ears, closed stitched eyes, muzzle, ribbon bow)
  at the end of the line grows at the centre; two hardcover book towers stand back from the rails
  at s0 + 58 (a wide gateway, no deck), the right one framing the teddy at 7 s.
- 9 to 10 s: reveal: the Milky Way fills the upper left, the Moon sits just above the teddy's ears,
  far garlands and dense warm windows on both sides.
- Throughout: big studded toy bricks (single or two high), peg trees (lollipop crowns, three-tier
  firs, some wrapped in lights), crayons, wooden cars (now with dark glazing bands and bumpers),
  lamp posts and floor light strings sweep past the bottom corners.
- 9 to 14 s (round 6): the train brakes on a smootherstep from 9.0 to 11.5 s to 0.12x and keeps
  creeping at that constant speed toward the teddy (4.1 units after 10 s, 8.8 after 9 s), with no
  tilt; the picture keeps drifting slowly through frame 336. (Round 5: 1.2 s smoothstep from 10 s
  to 0.15x plus a 3 degree tilt over 10 to 14 s; round 4: 0.07x over 1.8 s; round 3: 0.35x over
  2.5 s.) The toy crane was dropped (its jib and lights crossed the sky and the Moon).

**The window.** A wide picture window (76 x 56 units = 3.0 x 2.2 m) with three tall casements
(two glazing bars) and a transom at 85 percent height, dark painted frame (it is seen against the
night sky), deep sill, velvet curtains at the far edges, a brass rod with warm fairy-light swags.
The sky fills the top 40 to 50 percent of every frame. Outside, two bands of real-street
silhouettes (rooftops, chimney stacks and tree crowns 12 and 22 m away, heights set by the
elevation they reach from the start) with a few small warm lit windows give the window a horizon
and a faint parallax against the sky at infinity.

**Sky plate and placement.** (Round 3 changes are in the changelog: plate
`plates/potw1713a_top62_w3400_v4.png` made by `make_plate.py`, sky saturation 0.5, tint
(0.88, 0.95, 1.1), Moon 2.6 degrees at (window azimuth + 12.5, el 26) with a limb-hugging glow
layer instead of the kit halo.) Round 2: one real photograph, seen only through the window:
`eso-potw1713a`, crop of the top 62 percent (everything above Cerro Paranal). The plate is
chroma-denoised once at source resolution (luma untouched; Cb/Cr blurred with three box passes of
radius 4, about a Gaussian of 4.5 source px = 1.6 output px), so stars keep sharp luminance cores
but lose the RGB speckle, then pre-shrunk with Blackman-Harris to 3400 px
(`plates/potw1713a_top62_w3400_cd.png`, regenerated automatically if missing). Projected with
`pk.sky.photo_plate` (hfov 64, about 1.9 plate px per output px), core at (window azimuth - 17,
el 32), roll -26, so the band runs diagonally from the upper left toward the centre. Grade:
contrast 1.06, saturation 0.62 (the compositor adds 1.45x on everything, so the sky nets about
0.9), tint (0.84, 0.94, 1.2), gain 1.25; a faint teal horizon glow (0.05, 0.12, 0.12) x 0.12 below
14 degrees over the rooftops. No star glow or star sparkle. The coverage check in `build_sky`
(window directions over t = 0..14 s, elevations above 4.5 deg) gives u 0.10..0.85, v 0.37..0.90:
no plate edge in view. The Moon is the kit's LRO colour + LOLA relief crescent (phase 0.17,
3.4 degrees = about 9 percent of the frame width, earthshine 0.025, halo 0.5 x 1.0, gain 14),
placed at (window azimuth + 0.5, el 26.5): between the two glazing bars for the whole run, below
the transom's sweep, and just above the teddy's ears at the reveal. Moonlight: a soft cool sun lamp
from the Moon direction (9 degree angle, strength 0.4, no specular, no volume) and a window-sized
cool area light (no specular).

**Depth layers.** (1) boiler and gold trim; (2) track, ties, lamp posts, toy bricks, dominoes, peg
trees, crayons, wooden cars, loose blocks, the tin rocket, a signal, LED strings on the floor;
(3) the near row of cardboard houses and block towers 4 to 11 units from the track, each with a
coloured floor wash; (4) back rows of taller boxes and towers, the dollhouse, the book towers;
(5) the far town in front of the window wall with its garlands and the sitting teddy; (6) the
wall with curtains, rod lights and stickers; (7) the street silhouettes outside; (8) the sky.

Debug knobs (environment variables, off by default): `BR_PROBE='t;x,y;...'` logs which objects
the camera (and the floor's mirror ray) sees at normalised frame points; `BR_HIDE=prefix,...`
hides objects by name prefix; `BR_CAZ`, `BR_CEL`, `BR_ROLL` override the plate placement. Round 4:
`BR_PSIG` (path heading smoothing, units; 0 = raw `PATH_PTS`), `BR_GRAIN` (floor grain contrast),
`BR_MBMAX` (EEVEE motion blur cap, px) and `BR_NOMB=1` (motion blur off). Round 6: `BR_BRAKE0`,
`BR_BRAKES`, `BR_ENDV` (brake start, length in s, creep speed), `BR_TILT`, `BR_TILT0`, `BR_TILTS`
(outro tilt in degrees, start, length), `BR_PEGDARK=16,...` (peg trees whose fairy lights are off)
and `BR_CARDCHECK=1`: without rendering, logs every emitter and floor mirror image (and each
floor-string bulb, also when only its edge peeks out) seen within 120 px of the end-card line over
10.9 to 13.6 s, plus the Moon's unoccluded fraction (whole disc and lit crescent), the teddy's head
top and the Moon and head step per frame.

**Delivery (round 4).** The soundtrack for `finish.py` is `films/02-bedroom-railway/audio.wav`, made
by `master_audio.py` (kit soundtrack plus a 20 ms attack on the opening downbeat). Finish with
`python3 kit/finish.py --slug 02-bedroom-railway --audio films/02-bedroom-railway/audio.wav`;
without `--audio`, finish.py picks up `out/02-bedroom-railway.wav` first, which clips in the AAC.

## Iterations, round 1 (stills at 0.5, compared side by side with ref_1s / ref_5s)

1. First pass: warm-white fairy lights, near strings across the track and fog: the frame was a
   white-yellow veil. Point lights of the strings had volume scattering on.
2. Dimmed all bulbs (strength 45 to 60), no haze scattering from small lights, fewer strings:
   readable, but orange overall and the window was a small rectangle under a sticker ceiling.
3. Moved the wall closer (100) and widened the window (46): the sky now fills the upper third to
   half. Cut-out windows switched to mostly cool colours; ambient made bluer; cool fill from
   behind the camera so camera-facing sides read.
4. Foreground: the brass dome was a black blob with a hard area-light highlight; switched to
   lithographed gold (partly diffuse), smaller dome, fill light diffuse only. Dominoes rescaled,
   marbles removed (they read as glowing orbs), teddy rebuilt and given a clearing and a wash.
5. Brightness and saturation against the reference: exposure down, saturated fills, coloured
   floor washes on every near facade, denser windows, far-town washes and garlands.
6. Floor: more reflective (spec 1.0 + clear coat) and longer compositor streaks; the plate was
   re-placed (core left, roll 16, hfov 64) after the coverage check found plate edges in view.
7. Craft: tape, paper flags, trims, awnings, balconies with railings, stairs, bunting, a rocket,
   spinning tops, book ribbons, back-face windows on boxes, toppled dominoes; smaller peg trees.
   Tried a denser haze box at the window for moonbeams: it veiled the sky, reverted. Tried a cab
   front plate with a brass bead across the bottom: it hid the boiler, reverted.

Round-1 luma (sRGB 0..255) at full resolution: means 52 to 68, p50 37 to 48, p99 about 240, HSV
saturation 149 to 187 (reference: means 38 to 46, saturation about 220).

Round-2 luma (2026-11-02, full resolution): t1.0 / t4.0 / t7.0 / t9.5 means 45.1 / 50.7 / 31.3 /
42.4, p50 24 / 29 / 19 / 21, p99 235 / 237 / 209 / 234, HSV saturation 192 / 196 / 214 / 192
(reference means 38 to 46, p50 20 to 29, p99 206 to 214, saturation 209 to 223). t7.0 is the
darkest beat (the run between the book towers before the reveal).

Round-3 luma (2026-11-02, full resolution): t1.0 / t4.0 / t7.0 / t9.5 means 51.9 / 57.8 / 42.4 /
39.6, p50 29 / 35 / 25 / 23, p99 242 / 244 / 231 / 231, HSV saturation 191 / 189 / 201 / 189; HSV
value p5 10 / 17 / 21 / 3 (round 2: 18 / 20 / 22 / 18; reference 2), value > 200 on 8.5 / 9.3 /
5.1 / 4.2 percent of the frame (round 2: 6.9 / 8.3 / 2.6 / 6.2; reference 15 to 18). Bottom-third
mean HSV value 49 / 68 / 82 / 39 (reference 65 to 76).

## Motion check

Round 6 (2026-11-03): half-scale Blender frames 230 to 336, raw and graded with `kit/finish.py`'s
functions, against the round 5 mp4 decoded at half scale: no A-B-A, no near duplicates, Moon
vertical drift 40 px down -> 3 px up, smooth ease from 9 s into a constant creep (see the round-6
changelog). Test frames deleted.

Round 5 (2026-11-02): half-scale Blender frames 266 to 327 (the outro) and 98 to 132 (the pan
easing through zero at 4 s), the outro graded with `kit/finish.py`'s own `state_at` / `grade`, both
compared with the same frames of the round 4 mp4 (area-scaled to half). Moon tracked by template
match. Outro: A-B-A frames 14 -> 0 of 60, near-duplicate frames (MAD < 0.4) 11 -> 0 (min MAD 0.20 ->
0.66), moon vertical jitter about a 9-frame mean p2p 4.3 to 5.5 -> 1.1 to 1.8 px. Mid-film: vertical
moon step RMS 1.70 -> 0.33 px/frame (max 3.60 -> 0.69), jitter p2p 5.8 -> 1.1 px, A-B-A 3 -> 0,
floor-reflection band jitter about its smooth motion 1.56 -> 0.10 px RMS. Framing within 2.6 px of
the mp4. Test frames deleted.

Round 4 (2026-11-02): frames 1 to 132 at scale 0.25 (16 samples), pan measured by phase
correlation on the sky and skyline band: about 4 px/frame (1080 wide) from frame 0, steady to frame
70, easing to 0 by frame 95, no reversal and no second surge (the delivery mp4 measured +3.6 px at
frames 0 to 3, -16.5 at frame 17, a stall at 51 to 54 and a surge to 5 at 63 to 69). The build log
now prints the peak pan from the camera keys: 5.3 px/frame (frames 1 to 50), 4.6 (51 to 336).
Frames 229 to 336 at 0.25: the teddy's ears stay about 5 percent below the top edge to frame 336.
Frames 186 to 197 at 0.5: bottom-third high-pass energy 5.75 -> 5.19, temporal second difference
14.9 -> 14.6 (grain and motion dominate it), mean unchanged. Test frames deleted.

Round 3 (2026-11-02): frames 214 to 222 (8.9 to 9.2 s, the teddy growing at the centre) at scale
0.3: mean luma 34.5 to 35.3, smooth; temporal second difference 5.6 to 8.3 including the grain,
spread over moving edges (no popping). The compositor depth of field and the moon glow are stable
frame to frame. A 0.35-scale pass over t = 0, 2.5, 5.5, 8, 11, 13.9 s showed no intersections or
plate edges; the buffer stop stands in front of the pillow from 11 s. Test frames deleted.

Round 2 (2026-11-02): frames 90 to 102 (3.7 to 4.2 s, the dollhouse leaving the left edge) at
scale 0.25: mean luma 48.6 to 46.0 to 47.8, smooth; temporal second difference 7.0 to 8.6
including the per-frame grain, no popping. A quarter-scale pass over t = 0, 2, 3, 5, 6, 8, 9, 11,
13.9 s showed no intersections or plate edges (the teddy fills the upper right by 13.9 s, under the
end card). Test frames deleted.

Round 1: frames 150 to 174 (6.2 to 7.2 s, approaching the bridge, the busiest moment) at scale 0.25:
mean luma rises smoothly 46 to 54, no popping, no flicker beyond motion edges and film grain
(temporal second difference: mean 7.5 including the per-frame grain; strongest on the bunting
right above the camera, which is genuine motion). Sky stable between consecutive full-resolution
frames 168 to 170 (it pans about 2 px per frame with the camera yaw, star peaks constant). The
end of the run (11 s, 13.9 s) checked at 0.35: no intersections, no plate edges. Test frames
deleted.

## Timings (M4 Pro, shared GPU with about 7 other Blender processes running)

Final render (2026-11-02): 336 frames at full resolution, 48 samples, in four chunks (1-30,
31-150, 151-270, 271-336): 2.4 / 2.6 / 2.7 / 2.5 s per frame (about 2.6 s average, build 4.1 to
4.2 s per chunk, 14.6 min of rendering in all). PNGs 2.9 to 3.1 MB each, about 1 GB for the run.
Frame checks: all 1080x1920 RGB, mean luma 40 to 62, no black or flat frames, frame-to-frame
mean abs difference 5.8 to 20.4 (highest at frames 14 to 23, near props sweeping past the bottom
corners), smooth across the chunk joins. `kit/audio.py` 1.9 s (LUFS -14.0, true peak -1.5 dBTP);
`kit/finish.py` 8.9 s, verify ok: `out/02-bedroom-railway.mp4` 17.7 MB, 14.000 s, 336 frames,
24/1, AAC 48 kHz stereo. Frames deleted after verification.

Round 3 (2026-11-02): build 4.1 to 4.8 s, 2203 objects; full-resolution stills at 48 samples 3.9
to 4.7 s each (about 4.3 s average, depth of field included); half-scale stills 1.2 to 2.8 s; a
0.3-scale sequence 0.9 s per frame. `--export-web`: `web/scene.glb` 17.8 MB, `web/sky.json` with
three rect layers (window_sky, moon, moon_glow); plate JPG
`assets/web/rect_potw1713a_top62_w3400_v4_cfa4c38c52.jpg` 5.6 MB. `make_plate.py` takes about
50 s once (system Python with scipy).

Round 2 (2026-11-02): build 4.4 to 8.5 s, 2340 objects; full-resolution stills at 48 samples
2.4 to 5.7 s each (about 4.3 s average, cold first still included); half-scale stills 1.6 to 3.7 s;
`--export-web` `web/scene.glb` 18.2 MB, `web/sky.json` (window_sky, moon), plate JPG
`assets/web/rect_potw1713a_top62_w3400_cd_8f2e4f5ea2.jpg` 4.8 MB. The plate's one-time chroma
denoise adds about 6 s to the first build.

Round 1:
- Build: about 5 s, 2145 objects.
- Stills at 0.5 scale: 1 to 3 s warm, 5 to 12 s for the first (shader compile, contention).
- Full resolution, 48 samples: frames 168 to 170 as a sequence 6.2 s per frame; cold stills 2.4 to
  7.5 s. Well under the 20 s limit.
- `--export-web`: `web/scene.glb` 15.6 MB (limit 60), `web/sky.json` with two layers
  (window_sky, moon); plate JPG 5.2 MB in `assets/web/`.

## Plates used and credits

- `assets/sky/eso-potw1713a/potw1713a.tif`, "Up high", CC BY 4.0. Credit: `ESO/B. Tafreshi (twanight.org)`
  (round 3: processed into `plates/potw1713a_top62_w3400_v4.png` by `make_plate.py`)
- `assets/moon/nasa-svs-4720/lroc_color_poles_4k.tif` and `ldem_16_uint.tif` (via `pk.sky.moon`),
  NASA media guidelines. Credit: `NASA's Scientific Visualization Studio`

Caption credit line: "Sky photograph: ESO/B. Tafreshi (twanight.org), CC BY 4.0. Moon: NASA's
Scientific Visualization Studio." The kit's galactic layers (NASA star maps, eso0932a) are not
used: the window shows one star field only.

## Kit issues (worked around in build.py)

- `camera.drive(points)` starts the camera at the first control point; a lead-in point behind the
  start needs `start_s` (here 40). Easy to miss: the first test started 40 units early.
- `geo.string_lights` creates its point lights with `volume_factor` 1.0, so every bulb scatters in
  `geo.fog` and the picture turns into a veil. build.py sets `volume_factor = 0` on every point
  light of 60 W or less after building. Suggest a `light_volume` argument.
- `vehicle.cabin_light` has full specular; on a convex glossy part (a boiler) its reflection is a
  hard bright rectangle at the bottom of frame. build.py sets its `specular_factor` to 0. Suggest
  a `specular` argument.
- There is no helper to check that a `photo_plate` covers every direction visible through an
  opening over the run; build.py samples the window over t = 0..14 s and logs plate u/v ranges.
  The plate's left margin from the core (0.17 of the width) is the binding constraint for this
  plate.
- Area lights (dollhouse spill, window skylight, blue fill, cab fill) are dropped from the glTF.
- `comp.setup(saturation=...)` applies to the sky too, so the sky grade's saturation has to be
  pre-compensated (here 0.62 under a 1.45 compositor push). Suggest a `sky_saturation` or a sky
  mask on the compositor saturation.
- `geo.string_lights` defaults to a metal wire; lying on or crossing above a mirror floor it caught
  the lamps as long bright lines. build.py passes a matte PVC `wire_material`.
- `photo_plate` has no chroma-denoise option; build.py blurs the plate's chroma itself when it
  writes the cached crop (`window_plate`).
- `scene.ray_cast` debugging: the `geo.fog` domain box's bottom face lies on the floor plane, so a
  ray that hits it first must be re-cast (build.py's `probe` does).
- `assets/web/rect_potw1713a_top62_w3400_f7f9e27d8d.jpg` (5.2 MB, round-1 plate) and
  `assets/web/rect_potw1713a_top62_w3400_cd_8f2e4f5ea2.jpg` (4.8 MB, round-2 plate) are no longer
  referenced by this film; assets are read-only here, so they are left for the owner to delete.
- (Round 3) `sky.moon`'s halo is a ring round the whole disc; on a thin crescent it makes the dark
  earthshine side read as a cut-out sticker. build.py renders the Moon with `halo=0` and adds its
  own additive rect layer (`moon_glow`) whose glow hugs the lit limb. Suggest a limb-weighted halo.
- (Round 3) `comp.setup` has no depth of field. build.py inserts a variable-size Bokeh Blur after
  the render layer (`add_dof`): radius `30 * |1/z - 1/11|` px at full resolution, capped at 10 px,
  zero for sky pixels (depth > 800). The compositor Defocus node did not follow the camera focus
  distance in 5.2 (it blurred the far town and the sky and left the foreground sharp), hence the
  hand-made circle of confusion.
- (Round 3) EEVEE has no Object Index pass (only Image, Alpha, Depth, Normal outputs), so a pane
  of glass cannot be masked in the compositor. The window glass is fully transparent (dithered,
  Transparent + faint Emission), which writes no depth, so the sky mask still works through it.
- (Round 3) The sky plate's bright stars carry diffusion-filter discs (flat 20 px blobs) that read
  as blue sprites at frame scale; there is no kit option to tame them. `make_plate.py` (system
  Python, scipy) dims each disc round a kept point core and masks stars out of the chroma denoise.
- (Round 3) The compositor saturation (1.4 here) is pre-compensated in the sky grade
  (`saturation` 0.5 in `sky.json`); the three.js viewer does not apply the compositor saturation,
  so its window sky is about 30 percent less saturated than the render.
- (Final render) The AAC in the delivery mp4 decodes with 50 samples at 0 dBFS (volumedetect
  max -0.0 dB) although the WAV from `kit/audio.py` peaks at -1.5 dB: the AAC encode overshoots
  the true-peak ceiling. It is inaudible here, but `finish.py` could leave about 1 dB more
  headroom (or limit after resampling) before the AAC encode.
- (Round 4) The overshoot is all in the first AAC frame: the 02 preset's downbeat rises from 0 to
  0.67 within 5 ms of t = 0 and ffmpeg's native AAC (256k) decodes it as 1.10 at 11 to 13 ms
  (+0.9 dBTP, 23 samples over full scale); after 50 ms the AAC stays at -1.3 dBTP. A 5 or 10 ms
  fade-in does not help, 20 ms does. `master_audio.py` applies it in this folder; the general fix
  belongs in `kit/audio.py` (a 20 ms attack on the first downbeat) or in `finish.py` (an
  `afade=t=in:d=0.02`). Also, finish.py looks for `out/<slug>.wav` before `films/<slug>/audio.wav`,
  so a film-level soundtrack needs `--audio`.
- (Round 4) `finish.py` timing, out of reach here: the final fade to black is 0.36 s (13.6 to
  13.958 s), which critics read as abrupt and as a hard loop seam back to the bright first frame;
  0.6 to 0.8 s would read as a fade. The end card is the brief's URL-only card by design.
- (Round 4) `camera.drive` has no yaw smoothing and Catmull-Rom control points of very unequal
  spacing (a 40-unit lead-in next to a 6-unit segment) make a near-kink. build.py smooths the
  path heading itself (`smooth_path_points`); a `smooth_sigma` option in `camera.drive` (or a
  warning when adjacent segments differ by more than 3x) would catch this in every film.
- (Round 4) ffmpeg's `scene` score (select / scdet) has no previous frame difference for the
  first frame, so frame 1 always scores its raw MAFD (0.076 here against a clip mean of 0.005).
  That is a metric artefact, not a jump; compare plain frame differences instead.
- (Round 5) `camera.drive(vibration=...)` drives pitch and roll through sines up to 6.9 Hz at full
  amplitude whatever the speed, so the world buzzes about +-2 px against the locked vehicle and a
  braked train trembles in place under the end card. build.py passes 0 and adds a slow,
  speed-scaled rock (`rock_and_tilt`). A speed-scaled, sub-2 Hz vibration in the kit would fix
  this in every film. `camera.drive` also has no hook for an outro tilt or a custom speed curve.
- (Round 6) `camera.drive`'s slow-down is a smoothstep starting at `slow_after_s`; there is no
  way to pass a speed curve. build.py re-keys the camera after 9 s itself (`outro_drive`). A
  `speed_fn(t)` argument (with the exact arc length integral) would serve every film.
- (Round 6) `finish.py --stills` refuses a partial sequence ("no 0001.png ... frames"), so a few
  outro test frames cannot be finished with it; compose them with its `render_card`, `state_at`
  and `grade` (n_frames 336) instead, or let `--stills` read only the frames it needs.
- (Round 3) `sky_bloom_floor` defaults to 1.5, low enough that the plate's brightest stars bloom
  into soft blue blobs under the default sky grade; build.py uses 3.0 with `sky_bloom=0`.

## Changelog

### 2026-11-03, round 6 (outro only, after blind A/B critics on the round 5 render; needs a full re-render)

Motion QA kept round 5's fixes (no whole-film buzz, no outro tremble), but the critics slightly
preferred the round 4 outro for three reasons, each confirmed on the round 5 mp4 first: (a) at
11.5 s a warm bokeh light sat right after the URL (text ends at x 900, light at x 985 on the line);
(b) the brake read as abrupt (speed 0.64 -> 0.21 of cruise between 10.5 and 11 s); (c) under the
card the tilt slid the whole scene down (Moon 0.73 half-scale px/frame, about 13 px per half
second at full resolution) and it never settled.

Changed (`build.py`):

- **Brake and creep.** `outro_drive` replaces `camera.drive`'s keys after 9.0 s with the same rig
  (look-ahead 3, lean 0.6, no sway, no vibration) moved along an exact integral of a new speed
  curve: a smootherstep from 9.0 to 11.5 s down to 0.12x, then a constant creep to frame 336. Keys
  before 9.0 s and everything placed with `ctx.s_of_t` are unchanged (glTF camera travel over 0 to
  9 s is 46.472 units in both exports). Peak deceleration 0.66 of cruise speed per second (round
  5: 1.06), zero jerk at both ends. Creep after 10 s 4.1 units (round 5: 5.8, the limit for the
  Moon is about 6). `speed_factor` (and so the track rock's amplitude) follows the same curve.
- **No tilt.** `OUTRO_TILT` 3 -> 0 (the knob is now a smootherstep over `OUTRO_TILT_T0` ..
  `+ OUTRO_TILT_S`). The sky coverage check follows the new camera: unchanged u 0.115..0.855,
  v 0.367..0.903.
- **Light beside the URL.** The bokeh was `Peg16Fairy`, the fairy lights of a peg tree right of
  the rails at path s 102.6, about 7 to 9 units ahead of the train for the whole hold. No camera
  path fixes it: to have it out of the card band from 11.3 s the train would have to average 0.79x
  until 11.3 s (no gentle brake), and creeping past it costs the Moon. Moving the tree was tried
  (`peg_search`, since removed): every clean spot either collides with other props (the right side
  between s 96 and 103 holds Peg5, Peg31, Car1, Car7, Loose1 and Loose16) or makes the lit tree
  sweep past the camera during the hold. So its fairy lights are off (`PEG_DARK = {16}`, chosen
  after the rng draws, so nothing else moves); the tree stays. Cost: one fewer warm cluster right of
  the vanishing point at 7 to 10 s (Peg32's lights remain beside it); stills t1.0 / t4.0 / t7.0
  differ from round 5 by a mean of 0.05 / 0.10 / 0.32 levels, all of it at that spot.

Measured (finished frames: Blender frames composited with `kit/finish.py`'s own `render_card`,
`state_at` and `grade`, because `finish.py --stills` needs a sequence from 0001.png; round 5 =
frames decoded from `out/02-bedroom-railway.mp4`):

- **Card area** (|y - 1373| < 120 px, x 60..1020, the text box excluded), full resolution at 11.5 /
  12.5 / 13.5 s: right of the URL (x 910..1020) mean luma 17.7 / 11.8 / 13.2 -> 2.0 / 1.3 / 3.1;
  zone p99 85 / 81 / 76 -> 48 / 53 / 60; zone mean 12.3 / 11.8 / 11.1 -> 8.9 / 9.2 / 10.2. The
  2118 px bokeh at (995, 1386) is gone. Residual, all small floor-string bulbs: a left bulb
  (`FloorLights-1Bulbs[61]`, half behind Peg14) at x 101 / 83 / 64 on the card line (luma 88, about
  180 px, 79 to 116 px left of the 'z'); another left bulb at x 45 at 11.5 s that leaves the frame by
  12.5 s; a faint right bulb above "hu" at 12.8 to 13.5 s (luma 86, 148 px). They were in round 5
  too; removing them would leave gaps in the strings during the cruise.
- **Motion**, half-scale frames 230 to 336, phase correlation on 64 px patches (half-scale px per
  frame): Moon vertical drift over the outro 40 px down -> 3 px up (-0.03 px/frame), its step RMS
  about the 5-frame mean 0.29 -> 0.025; teddy region during the hold +0.36..+0.55 (sliding down) ->
  -0.05..-0.09 (a slight rise from the push-in). Right-hand houses, 0.5 s means from 9.5 s: round 5
  2.62, 2.70, 1.34, 0.22, 0.20 (a 6x drop in one half second); now 2.28, 1.70, 0.69, 0.17, 0.13,
  then 0.12 to 0.18 to the end. A-B-A 0 of 105, near-duplicate frames (MAD < 0.4) 0 (min MAD 1.19),
  no sign flips of any region's flow above 0.15 px. Still drifting at the end: right houses 0.19,
  teddy 0.06 px/frame; the head top climbs 206 -> 172 px (full resolution) from 11.5 to 13.6 s and
  the Moon moves right 0.21 px/frame. glTF camera step per frame (units) at 9.0 / 10.0 / 10.5 /
  11.0 / 11.5 s: round 5 0.217 / 0.217 / 0.161 / 0.055 / 0.033; now 0.217 / 0.164 / 0.095 / 0.041 /
  0.026.
- **Moon and teddy** (`BR_CARDCHECK`, ray casts, 11.0 to 13.6 s): lit crescent 100 percent clear to
  12.5 s and 96 percent at the end (round 5: 96 -> 83); whole disc 95 -> 81 percent (round 5:
  81 -> 55). Moon centre (962..973, 367) at full resolution. Teddy head top 10.7 percent (11.5 s)
  to 9.0 percent (13.6 s) below the top edge (round 5: 9.8 to 11.3).
- **Stills** (full resolution, 48 samples): t1.0 / t4.0 / t7.0 / t9.5 means 49.4 / 57.8 / 42.2 / 38.5
  (round 5: 49.5 / 57.9 / 42.6 / 39.6), p50 27 / 35 / 25 / 23, p99 241 / 244 / 230 / 229, saturation
  196 / 189 / 202 / 190, bottom-third HSV value 48 / 70 / 83 / 39. t9.5 differs by a mean of 2.1
  levels (the first 0.5 s of the brake and Peg16).
- **Web edition**: `--export-web` `web/scene.glb` 17.8 MB, `web/sky.json` unchanged (same bytes). The
  camera clip carries the new brake (travel 9 to 10 s 5.20 -> 4.83 units, 10 to 14 s 5.96 -> 4.20).
  `viewer/tools/webshot.sh` at 4.0 s loads; `compare.py` top / mid / bottom luma Blender 36.2 / 94.7
  / 46.7 against web 37.2 / 86.0 / 40.3 (before the export 37.2 / 86.3 / 39.8), mean abs difference
  between the before and after shots 0.70.

Test frames (four full-resolution, 107 half-scale, a few half-scale stills) deleted.

Open (not outro, seen while checking Peg16): Peg16's crown passes through Car7's cab and glass
(mesh overlap, present since round 1); it now carries no lights, so it is darker there.

### 2026-11-02, round 5 (motion QA and video critics on the round 4 mp4; needs a full re-render)

Each finding was checked on frames decoded from `out/02-bedroom-railway.mp4` (mp4 frame n = Blender
frame n + 1; Moon tracked by template match at full resolution) before any change.

Fixed:

- **Outro stalls and trembles in place under the end card (QA, medium; critics "momentum stall").**
  Confirmed: Moon drift 2.2 px/frame at 9 s, then 0.28 / 0.13 / 0.19 px/frame in seconds 11 / 12 /
  13, while the vertical step stayed 1.4 to 1.7 px/frame RMS; the Moon swung +-2 px round a fixed
  point (f278 to 283: y 367.1, 365.1, 367.0, 368.0, 366.0, 365.4), 14 of 60 outro frames reverse
  (A-B-A) and 11 have MAD < 0.4. Cause: round 4's brake to 0.07x plus the kit vibration at full
  amplitude. QA's suggested 0.3 to 0.4x does not fit: measured from the eye with ray casts, any
  creep beyond about 6 units after 10 s slides the right glazing bar over the Moon's lit limb
  (0.3x over 1.6 s = 9.2 units hid 87 percent of the disc by 13.6 s; the delivery hid 48, all of
  it the dark side) and brings the teddy's head to the top edge. Now: `SLOW_EASE` 1.8 -> 1.2,
  `END_SPEED` 0.07 -> 0.15 (the brake runs with finish.py's 1.2 s dim, then the train rolls at
  twice the old crawl; same 5.8 units in all), plus `OUTRO_TILT` 3 degrees: the cab tilts up over
  10 to 14 s (smoothstep, `rock_and_tilt`), so the whole picture keeps drifting down slowly under
  the static card and the teddy's head top sits 10 to 11 percent below the top edge (round 4: 5.5
  to 8). The vibration is gone (next item). Half-scale outro graded with finish.py against the mp4:
  A-B-A 14 -> 0, near-duplicate frames 11 -> 0 (min MAD 0.20 -> 0.66), Moon moves 1.3 px/frame on
  a smooth path (straightness 0.72 -> 0.92), jitter p2p 4.3 to 5.5 -> 1.1 to 1.8 px. The sky plate
  coverage check now includes the tilt (unchanged: u 0.115..0.855, v 0.367..0.903).
- **World buzzes against the locked locomotive, whole film (QA, low).** Confirmed: the kit's
  `vibration=0.0012` puts pitch and roll sines at 2.0 / 4.1 / 6.9 Hz on the camera; Moon vertical
  step 1.6 to 1.85 px/frame RMS in every second, jitter p2p 4.8 to 6.2 px, the locomotive
  0.1 to 0.5 px. Same fix as films 03 to 05: `vibration=0`, and `rock_and_tilt` adds a slow
  track rock (pitch 0.04 deg at 0.83 / 1.67 Hz, roll 0.03 deg at 0.61 / 1.13 Hz) scaled by the
  train's speed, so it settles as the train brakes. Half scale, Blender 98 to 132 against the mp4:
  vertical step RMS 1.70 -> 0.33 px/frame, jitter p2p 5.8 -> 1.1, A-B-A 3 -> 0 (the f106 pan-stop
  bounce is gone). It also calms the floor (critics' "streaky reflections shimmer"): the
  reflection band's jitter about its smooth motion 1.56 -> 0.10 px RMS, temporal second difference
  18.8 -> 16.9.

Judged not to be defects (measured on the mp4):

- **Abrupt dim and URL pop at 10 to 11.3 s; static dull hold.** `kit/finish.py` by design (dim
  10.0 to 11.2 s on a smootherstep, card fade 10.6 to 11.3 s with a 10 px drift); shared kit, out
  of scope here. The hold is no longer static (above).
- **Yaw whip at 3.0 to 3.5 s; sharp framing change at 0 to 0.5 s.** Moon drift (7-frame mean) peaks
  at 5.6 px/frame at 1 s and eases with at most 0.73 px/frame of change per frame; at frames 64 to
  96 it eases from -3.5 to -1 px/frame. The 2 fps sheet samples 12 frames apart, so the
  dollhouse's planned exit and the bear swinging from right of centre to left read as jumps.
- **Bunting and star stickers flash in and out in the first second.** Frame by frame they pass
  overhead and leave the top edge smoothly by frame 25 (near ceiling dressing, real parallax). The
  small top-edge flicker from the buzz is gone with the vibration.
- **Window mullions and a dark wedge slide through the sky and reappear (8 s).** Frame by frame
  (160 to 184) the left glazing bar enters from the left edge as the camera yaws back left and a
  near tower leaves; both move smoothly. Designed window geometry, no pop.
- **Exposure drift (warm bright opening, darker later); forward stall 6 to 10 s.** Render exposure
  is fixed; the mean (45 to 59 over 0 to 5 s, 35 to 42 later) follows the warm dollhouse and the lit
  near row passing, then the moonlit approach (round 4 measured the same). The camera runs at a
  constant 5.2 units/s to 10 s by construction; frame-to-frame MAD 7 to 9 through 6 to 10 s.
- **Floor reflections smear.** The compositor road streak is the brief's long vertical streaks;
  the temporal part is addressed above.

Round-5 stills at full resolution: t1.0 / t4.0 / t7.0 / t9.5 means 49.5 / 57.9 / 42.6 / 39.6
(round 4: 49.4 / 58.2 / 42.5 / 39.7), p50 27 / 35 / 25 / 23, p99 241 / 244 / 231 / 231, saturation
196 / 189 / 201 / 189, bottom-third HSV value 48 / 70 / 83 / 40; framing within 3.1 px (the old
vibration's pitch at those instants). Same look.

### 2026-11-02, round 4 (defect fixes after motion QA and video critics on the delivery mp4)

Each finding was checked on frames decoded from `out/02-bedroom-railway.mp4` before any change.

Fixed:

- **Whip pan with a reversal at 0 to 1.7 s (QA, medium) and a stall and surge at 2 to 3.6 s
  (QA, low).** Confirmed: +3.6 px/frame at frames 0 to 3, then -16.5 at frame 17 (14 deg/s),
  2.5 at 51 to 54, 5.2 at 63 to 69. A numpy copy of the kit's centripetal Catmull-Rom and
  `camera.drive` reproduces it: the path heading dips to -1.9 deg at y = 3 and then turns 14 deg
  in 6 units round (0, 6). The track and camera now use `smooth_path_points(PATH_PTS, 7)`: the
  path heading Gaussian-smoothed over 7 units of arc length and integrated back (same arc length,
  positions within 0.53 units near the start and 0.3 downstream, so every path-placed object
  moves with it). Pan now about 4 px/frame from frame 0, one smooth ease to 0 by frame 95, peak
  5.3 px/frame (was 16.6), 4.6 after frame 50. Side effect: the camera already looks 2.9 deg into
  the bend at t = 0, so the dollhouse starts at -3.2 deg (was +1.3) and leaves the left edge at
  about 3.0 s (hero az -3.2 / -7.6 / -13.2 / -18.7 / -23.8 at 0 to 4 s). The four beats are
  otherwise unchanged; the plate coverage check still gives u 0.115..0.855, v 0.367..0.903.
- **Teddy's head cropped off the top under the end card (critics).** Confirmed: the ears touch
  the top edge at 12 s and the head top is cut from about 12.5 s, because the train crept 11.5
  units after 10 s. `slow_ease_s` 2.5 -> 1.8 and `end_speed_factor` 0.35 -> 0.07: it brakes
  over 1.8 s and creeps 5.9 units in all (0.36 units/s at the end), so the head stays in frame
  with about 5 percent margin to 14 s and the scene under the card nearly settles.
- **AAC over full scale on the first hit (QA, medium).** Confirmed: +0.9 dBTP, 23 samples over
  0 dBFS at 11 to 13 ms. New `master_audio.py` writes `audio.wav` with a 20 ms raised-cosine
  attack on the opening downbeat (identical after 20 ms) and checks it through finish.py's AAC
  settings: -1.3 dBTP, -1.43 dBFS sample peak, none over, -14.0 LUFS. The render operator must
  pass `--audio films/02-bedroom-railway/audio.wav` to finish.py (see Kit issues).
- **Floor reads as streaky radial smear, worst 5 to 10 s (critics).** Not motion blur: a t = 8 s
  still with motion blur off shows the same fan of lines, and capping EEVEE's blur at 12 px
  changed nothing visible. The lines are the floor's 4:1-contrast grain (about 0.3 units apart,
  running toward the window), which converges on the vanishing point, so near the camera it
  reads as speed lines. Grain contrast halved around the same mean (`FLOOR_GRAIN` 0.45); the
  board tone, seams, varnish and reflection streaks are unchanged. Bottom-third high-pass energy
  -10 percent, mean luma unchanged.

Judged not to be defects (measured):

- **One-frame jump at frame 0 to 1.** The 0.069 to 0.076 score is ffmpeg's scene score, which
  has no previous difference for the first frame and so reports its raw MAFD. Plain mean abs
  differences are 8.8 (0 to 1), 10.0, 9.5, 7.5; frame 0 is not softer (Laplacian variance 105
  against 86 to 91 for frames 1 to 3, which carry more pan blur, and 109 at frame 4).
- **Brightness swell at 3.5 to 6 s.** Exposure is fixed: the sky median stays at 11 to 13 and the
  centre third at 37 to 43 while the left third goes 38 -> 67 (the dollhouse passing) and the
  right third 47 -> 79 (the near right row). It is two lit facades passing at once, not
  exposure breathing; the windows clip because every practical in the film is above the
  tone curve's shoulder by design.
- **Locomotive nose goes almost black from 9 s.** The boiler region (bottom 14 percent, middle
  44 percent) measures 27 to 35 at 9.0 to 9.7 s against 28 at t = 0 and 31 to 49 in between; red
  enamel and gold bands stay readable. It dips to 24 only at 10 s, as the outro dim begins.
- **Outro fade, 3 s card, 0.3 s final fade, URL-only card over moving rails.** All set by
  `kit/finish.py` and the brief (URL only, no logo; the camera keeps moving slowly). Only the
  camera creep was this film's part, fixed above; the fade length is noted under Kit issues.
- **No pops** (both critics agree).

Round-4 stills at full resolution: t1.0 / t4.0 / t7.0 / t9.5 means 49.4 / 58.2 / 42.5 / 39.7
(round 3: 51.9 / 57.8 / 42.4 / 39.6), p50 27 / 35 / 25 / 23, p99 241 / 244 / 230 / 231, HSV
saturation 196 / 188 / 201 / 189, bottom-third HSV value 48 / 70 / 83 / 40. Same composition;
t1.0 is framed about 4 deg further right.

### 2026-11-02, round 3 (after blind critics: ours 5.0 vs reference 7.0)

Fixes in the order of how many critics raised them:

- **Bottom third crushed; the locomotive a dull teal blob (3 of 3).** Boiler repainted glossy red
  enamel (0.46, 0.022, 0.02), coat 1.0, roughness 0.16; gold bands brighter and more metallic
  (metal 0.8); smokebox a lighter glossy gunmetal. New light-linked loco lights: a broad warm
  sheen from ahead (5 x 1.6, 70 W), a cool rim from behind-left (18 W), cool fill 22 -> 30 W.
  Headlamp 60 -> 1800 W, 38 degree cone, so the ties ahead get a warm pool. Floor albedo up about
  25 percent so the planks read where light falls.
- **Teddy flat purple, no fur, no rim, lands too late (3 of 3).** Recoloured to a honey-brown
  mohair teddy (0.36, 0.17, 0.065) with cream muzzle, velvet paw pads and inner ears, a glossy bead
  nose, a red satin bow with tails and a stitched face seam. Plush shader: fibre and tuft noise at
  real plush scale (9 and 2.6 per unit), darker roots and light tips through the sheen lobe
  (sheen 1.0, roughness 0.35), soft subsurface. Own light-linked rig: warm key from the lit town
  (front right, shadowed), cool fill from the window side, two strong cool rim area lights behind
  the head. Scale 1.0 -> 1.1, and it now sits on a ticking-striped bed pillow (15 x 14 x 5 units,
  piped edge, own warm wash) 4.5 units up, so its head clears the far town and shows against the
  window sky at 0 to 1 s, right of the dollhouse (dollhouse lateral -8.6 -> -9.8 to make room).
  The track is 6 units shorter and the buffer stop stands in front of the pillow.
- **Bedroom premise lost after t1; stray vertical poles (3 of 3).** The pillow is the bedroom cue
  at the end of the line. A pair of fleece slippers stands beside it, but they barely read (at
  9.5 s the left one shows only as a blue pompom at the left edge, the right one is behind a toy
  car); open issue. Glazing bars 0.6 -> 1.3
  units, paler paint, moved to 0.30 and 0.66 of the width so they clear the Moon and the teddy's
  head in the four beats; a glass pane with a faint warm reflection layer (soft fairy-light dots,
  low town glow, smudges). The violet washes and cardboard colours were cut back (see light).
- **Sky: blue sprite stars, sticker moon halo, over-warm plate (3 of 3).** The blue blobs were the
  plate's diffusion-filter discs plus round 2's whole-plane chroma blur, then bloomed by the
  compositor. `make_plate.py` now masks the stars out of the chroma denoise (normalised
  convolution) and dims the discs of the 263 brightest stars round a kept point core;
  `sky_bloom_floor` 1.5 -> 3.0 and `sky_bloom` 0, so only the Moon blooms. Sky saturation net
  0.9 -> 0.7, tint (0.84, 0.94, 1.2) -> (0.88, 0.95, 1.1). Moon 3.4 -> 2.6 degrees, kit halo off,
  replaced by a glow that hugs the lit limb; moved to (window azimuth + 12.5, el 26), into the dark
  sky right of the band, clear of the teddy, the bars and the transom in all four beats.
- **One purple wash, no warm against cool (3 of 3).** Lamp globes and their lights amber and warm
  white (one cyan, one magenta in six); facade washes cobalt / cyan-blue / sodium, one magenta in
  eight; fewer plum boxes, more kraft cardboard. Ambient (0.004, 0.012, 0.09) -> (0.002, 0.008,
  0.045), blue fill 32000 -> 18000 W and bluer (0.07, 0.3, 1.0). The moonlight is now a real cool
  key (strength 0.4 -> 1.2, specular on) on everything except the floor: rails, roofs and the
  teddy's fur catch it; the floor gets a diffuse-only copy, which still lays the window's light on
  it. The red / green signal was removed; light-wrapped peg trees 45 -> 14. Cut-out window cards
  lost their bulb dots (read as white drip marks) and got a cross bar and drawn curtains;
  strength 15 -> 22.
- **Everything in sharp focus, no miniature scale (2 of 3).** Compositor depth of field (see
  Kit issues): focus 11 units (44 cm), the locomotive softens about 6 px, the far town 1 to 2 px,
  the sky stays sharp.
- **Grade (1 of 3, measured).** Black point 0.003 and a luminance contrast of 1.12 round 0.18 in
  the compositor (`post_grade`): HSV value p5 now 3 to 21 (was 18 to 22).

Tried and dropped: haze density 0.0008 (lamp cones drew cyan smears across the window sky);
slippers near the start (lost among the bricks and cars at 0 to 2 s); the compositor Defocus node.
Not done: steam (a plume from the chimney would cross the centre of the frame and veil the
teddy), a horizontal meeting rail in the window (any bar at that height crosses the Moon in the
t4 or t7 beat).

### 2026-11-02, round 2 (after blind critics: ours 4.8 vs reference 7.2)

What the critics agreed on and what changed:

- **No hero at the vanishing point; rails led to a dim box.** New path: a gentle right bend round
  the dollhouse, which now sits warm beside the vanishing point from frame 1 (azimuth +2.7 deg at
  0 s, -5.3 at 1 s) and swings out of the left edge at 3 to 4.5 s, like the reference hero. A new
  giant sitting teddy at the end of the line (lavender plush, closed stitched eyes, muzzle, bow,
  lavender wash and warm kicker) is the second landmark: centred from 4 to 9 s, under the Moon at
  the 9.5 s reveal. Camera look-ahead cut from 12 to 3 so the camera stops yawing away from the
  hero in the first second.
- **Sky boxed into a small window; flat shelf band across t7.0.** Window widened to 76 units with
  three casements and a transom (it reads as a window, and its frame moves against the sky), sky in
  the top 40 to 50 percent of every frame. The book-bridge deck, ruler and the swag across the track
  were removed; the two book towers now stand back at 7.4 units as an open gateway. Overhead strings
  across the track (two light strings, one bunting) removed; one bunting kept high at the top edge.
  Toy crane removed (its jib and lights crossed the sky and the Moon).
- **Sky over-graded, RGB star speckle, a second hazy sky card under the bunting, big moon with
  bright dark side.** Plate chroma-denoised at source resolution; grade contrast 1.18 -> 1.06,
  saturation 1.3 -> 0.62 (net about 0.9 after the compositor), tint (0.8, 0.9, 1.3) ->
  (0.84, 0.94, 1.2); star glow and star sparkle off; the moonbeam haze card was the moon sun's
  volume scattering through the window: volume off, fog density 0.0007 -> 0.00028. Moon 5.6 ->
  3.4 degrees (about 9 percent of the frame width), earthshine 0.04 -> 0.025, halo 0.5 x 1.0, placed
  between the glazing bars. Plate roll 16 -> -26 with the core at the upper left so the band runs
  diagonally toward the centre. Street silhouettes outside give the window a horizon, plus a faint
  teal glow over them.
- **Rainbow confetti light, muddy grey-purple midtones, blown clusters.** Fairy lights limited to
  three hues (mostly warm), cut-out windows mostly warm, stickers phosphor green only, lamp globes
  22 -> 2.6, signal lenses 60 -> 8, bulbs 55-60 -> 30-45, bloom 1.0 at threshold 0.9 -> 0.85 at 1.4,
  compositor saturation 1.4 -> 1.45, ambient bluer, exposure -1.0 -> -0.95.
- **Primitive, unreadable world.** Studded toy bricks along the rails (near-field parallax),
  lollipop and three-tier peg trees instead of plain cones, toy cars with glazing bands and
  bumpers, blank spine labels on the books, nothing tall in front of the dollhouse; the lying
  teddy (rarely in frame) replaced by the sitting one at the end of the line.
- **Locomotive dark and mushy, bright gold dome at bottom centre, chimney in the way.** Low green
  dome with a thin gold ring, chimney shortened by 30 percent, a small light-linked warm rim on
  the chimney lip and dome ring.
- **Floor streaks without plank structure.** Wider, darker seams, stronger per-board tone, calmer
  ridges. Two line artefacts found with `BR_PROBE` / `BR_HIDE` and fixed: the metal string wire
  (now matte PVC) and the moon sun's specular glint along the cupped board edges (now diffuse only).

Not done: steam (a toy tin train has none and volumetric puffs veil the frame), glass with
reflections in the window (the floor does not mirror the sky either, since the world's light gain
is 0), miniature depth of field.
