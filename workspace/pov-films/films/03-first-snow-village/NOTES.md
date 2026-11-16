# 03-first-snow-village: notes

## Reference analysis

Measured on `reference/ref_1s.png` ... `ref_9s.png` (720 x 1280) with PIL, plus the 2 fps contact sheet.

- **Horizon height.** The road vanishes and the skyline base sits at 57 to 60 percent from the top
  (about 41 percent from the bottom). The packed skyline rises to about 40 to 45 percent from the top,
  so the town occupies a band roughly 15 to 20 percent of the frame tall; the sky takes the upper half.
- **Dashboard coverage.** A near-black dash covers the bottom 14 to 16 percent (row luma drops from about
  35 to under 15 below 85 percent of the height and to 2 at the bottom). A thin bright rim catches the
  scene colours at the dash edge; the top arc of a dark steering wheel spans the full width under it.
  Nothing shakes; only a slow drift and roll.
- **Landmarks passing the edge.** Hero (orange tank house) sits dead centre at 1 s, slides right and leaves
  the right edge at about 5 to 6 s. The red-white striped tower starts small left of centre (x 0.29) at
  1 s, grows to fill the left third by 7 s with its top leaving the top edge, and is gone by about 9 s.
  The windmill swings past the top right between 4 and 7 s. Small props (buoys, lamps, seaweed clumps)
  sweep past both lower edges every second or so.
- **Density of lights.** Every building carries 2 to 6 porthole windows, neon signs and lamps; the skyline
  at the vanishing point is a wall of a few hundred small lights. p98 luma is about 190 every frame and
  7 to 10 percent of pixels are above luma 120.
- **Palette.** Sky median about (3, 8, 72) sRGB: saturated deep blue, not black. Buildings are cobalt,
  violet and cyan; one warm amber hero (warm bright pixels only 2 to 3 percent of the frame); magenta,
  green and cyan neon accents. Mean chroma about 85, mean luma 38 to 46, median 20 to 29.
- **Depth layers.** (1) road and kerb props, (2) the first row of buildings right beside the road, (3) the
  packed mid skyline, (4) the far row and spires, (5) the sky with a diagonal Milky Way, a moon and a
  comet streak. The wet road mirrors layers 2 and 3 as long vertical colour streaks and carries most of
  the colour in the lower third.
- **What makes it appealing.** A readable, saturated world (the blue fill keeps every shape visible, nothing
  is murky), one warm hero against all that blue, a road that glows with streaked reflections, a big
  dramatic sky band, and constant parallax: the near landmark swings out of frame while the dense skyline
  slowly opens up. The camera never stops moving.

## Design (original world), as of round 3

A vintage car creeps through a mountain village before dawn, on the night of the first snow, and
comes out into a square with a great lit fir under the aurora. Toy-like chunky cottages in painted
clapboard and timber with fat rounded snow caps, icicles, wreaths and string lights; firs wrapped in
bulbs; a stone clock tower; one warm bakery whose shop windows are the brightest warm block. A real
aurora photograph hangs over a real star field.

- **Palette.** Cool: navy pre-dawn sky, green aurora, blue snow under a blue ambient fill. Warm:
  tungsten windows everywhere (2700 to 3400 K, varied brightness, a rare cool screen glow), 2200 K
  sodium street lamps, warm porch lanterns and luminaria. Walls in natural colours (cream, barn red,
  fir green, slate blue, butter, timber) so the light carries the colour. Bulbs limited to red, warm
  white, green and gold with a rare ice-blue. No coloured facade washes (warm grazers on some houses).
- **Warm hero.** The bakery, left side at s = 52 m (facade 7.2 m off the centre line, turned 40 degrees
  toward the car): three tall arched shop windows (strength 40) with loaves and a cake stand, a
  candy-striped awning, a pretzel neon, warm spill on the snow, two villagers at the window.
- **Path and timing.** Right-hand lane (eye 1.55 m right of the centre line, 1.2 m high, 60 degree
  vertical FOV, 3.5 degree pitch, look-ahead 12 m), 6.2 m/s, no kit vibration but a slow suspension
  float under 1.4 Hz (`gentle_float`, round 4); yaw and roll keys Gaussian-smoothed over 8 and 12
  frames (`smooth_turns`, round 5). Two diagonal light strands cross the street at s = 45.5 and
  56.5 (the second, 0.4 m higher with 0.6 m sag since round 5, carries the neon snowflake). A
  gentle S: a right bend from about 2 s
  (heading 0 to +15 degrees), easing back left into the plaza; the camera never passes s = 80.
  Measured with `SN_DEBUG=1` (x from the left, y from the bottom):
  - 0 to 3 s: the hook: a tunnel of six light arches over the road (s = 10 to 40 m, every 6 m, warm
    white bulbs with candy red or gold), bakery centre-left (x 0.25 at 1 s), clock tower on the right
    (x 0.85), the great tree small on the vanishing point (x 0.69), crescent moon low left. The last
    arch passes overhead at about 6 s.
  - 3 to 5.5 s: the bakery's centre crosses the left edge at about 3.6 s; the tree reaches the centre
    at about 5.5 s.
  - 4.7 to 8 s: the tower grows on the right; its spire leaves the top edge at about 4.7 s and its body
    the right edge at about 7.9 s.
  - 9 to 10 s: payoff: the square opens, the 15 m fir fills the centre-left (x 0.42, 31 m away at 9.5 s,
    placed on the camera axis at that instant, its star at y 0.8), 11 strands of bulbs radiate from the
    star to the ring of tall plaza houses, snowmen and villagers, the Milky Way rising on the right.
- **Sky.** Kit `sky.galactic` (real photo Milky Way and the NASA star field, crisp point stars) framed on
  the Cygnus star clouds and the Great Rift (anchor l = 78 at az +12, el 24, tilt -58, so the band shows
  in the dark gap right of the aurora from the first second), denser stars (star_gamma 0.86), grade
  saturation 1.0, a dark navy pre-dawn dome and a pink dawn glow low on the bakery side (az -28,
  procedural, starless). Over it, **added** in linear light, the aurora of the Eielson photograph
  (`make_aurora`, cache `sn03_aurora_rays_v8`): starless (grey opening), colour key on G - 0.35 B, tree
  line and pink glow keyed out; then a contrast curve (power 1.9 below the 97th percentile) so the wash
  between the folds falls to dark sky with stars; the photo's own fine structure across x amplified
  plus a gentle vertical ray texture (correlation 160 x 7 px, +-15 percent) for ray striation; the
  broad overhead swirl dimmed to 60 percent; a bright lime lower hem (one-sided exponential above
  each fold's lower edge); graded green body, teal above and a magenta-red fringe on the high fold.
  52 degrees wide, centre az +4, el 22, gain 0.24. In the film the plate drifts sideways about 1.3
  degrees over the 14 s and its brightness breathes (+-10 and +-5 percent, periods about 8 and 3.7 s)
  through simple-expression drivers (`animate_aurora`). One star field only (NASA). Crescent moon
  (LRO colour + LOLA relief) at az -13, el 17, 1.5 degrees, earthshine 0.03, small halo, added (the
  aurora shows over its dark side); its lamp lights diffusely only.
- **Vehicle foreground.** Low dash (top at 7 percent of the frame) with a brighter cool rim light
  (cabin light 10), chrome trim, only the top of the steering-wheel arc. Beyond the glass a long
  vintage hood in candy-red lacquer (base 0.52, clear coat roughness 0.02) up to 13.5 percent of the
  frame, so hood plus dash take 13.5 percent: chrome centre strip, a chrome jet ornament, pontoon
  fender crowns at the edges, melt-water beads, a neutral fill so the red reads. The heater has cleared
  the whole hood; a thin 1.6 cm crust stays only along its outer edges, a thin crust on the fender
  crowns and a low packed ridge along the glass base with small corner drifts. No wipers (they read as
  black slabs). Frost in the glass corners, 16 six-armed snow crystals stuck to the glass. Warm
  incandescent headlamps (520 W, aimed 28 m ahead) light the snow ahead and the falling snow.
- **Road.** Two lanes, 7.4 m, under the first snow: a fresh blue-white dusting with sparkle glints
  (roughness 0.45 to 0.6, 0.08 on the glints) covers the road; two dark wet tyre tracks per lane
  (about 0.25 m, roughness 0.05 to 0.09, slush clumps inside, small 0.02 pools), in our lane exactly
  under our own wheels (1.55 +- 0.76 m), so they run from the lower corners to the vanishing point and
  the great tree as leading lines and mirror the arches and windows; grey slush shoulders beside each
  track (0.22 to 0.32), a pressed hump between them, the dashed centre line only peeking through.
  Since round 5, greyer packed-snow patches (about 0.4 m) and sparse 3 to 6 cm grit specks at random
  spacing, so the near road shows its speed.
  No compositor road streak (see Kit issues).
- **Snow.** Two layers: soft round near flakes (subdivided octahedra, facing-ratio dithered alpha,
  1.3 to 3 cm, emission 2.6 so they glow white, never closer than 2.2 m to the lens, so 5 to 15 px, no
  grey discs) and fine diamond dust kept below 4.5 m so it never reads as noise over the stars. Both
  loop seamlessly over three copies (`seamless_snow`, see Kit issues).
- **Light and colour.** A high cool fill (`MoonFill`, sun at el 62, 7000 K, 0.5, diffuse only) makes
  every up-facing snow surface blue-white; sodium lamp pools narrowed (84 degree cones, 900 W) so they
  read as distinct warm pools; window strengths about 35 percent lower than round 2 (warm 10, gold and
  amber 9, shop 30, bakery 22); facade washes rarer, softer and warm-white (160 W); the bakery's
  upper-facade lights 45 W and its wall cream, so the walls no longer clip to flat orange and the
  windows are the hottest warm elements.
- **World detail.** Clapboard / plank siding with per-board tone, overlap shadow and worn edges;
  staggered shingles; stone-block tower with a copper-shingle spire, readable clock faces (thick ticks
  and hands, no numerals); firs built from drooping branch-cluster whorls with snow on top instead of
  stacked cones; three snow-covered vintage cars parked on the left; five villagers; snowmen;
  candy-cane sodium lamps; luminaria; picket fences; one neon snowflake over the road; firs in a
  needle material (grooves radiating from the trunk, lighter exposed tips from AO, green
  translucency); the great fir with 12 whorls, thinner tier snow and 900 bulbs; the villager couple at
  the tree lit from the front by the luminaria.
- **Grade.** Khronos PBR Neutral, exposure -0.8; compositor saturation 1.35, bloom 0.8 (threshold 1.1)
  plus a fog glow on very hot points, a tight star glow and faint sparkle on the brightest stars, lens
  dispersion 0.0015 (was 0.006: it split stars into red and blue dots), vignette, grain, then in
  `post_comp` a star chroma cap (sky pixels beyond 600 m: the fine detail above a 3 px blur loses 85
  percent of its chroma, so stars are white, pale blue or pale warm while the aurora and the Milky Way
  keep their colour) and a black point (0.0018 linear) so the darkest pixels reach black.

## Plates used (credit lines from assets/LICENSES.md)

| file | use | credit |
| --- | --- | --- |
| `assets/sky/wm-aurora-eielson-2005/Aurora_borealis_over_Eielson_Air_Force_Base_Alaska.jpg` | the aurora only (starless, keyed, contrast, ray and hem grade, additive rect layer 52 degrees wide, animated drift and pulse) | `U.S. Air Force photo by Senior Airman Joshua Strang` (public domain) |
| `assets/sky/eso0932a/eso0932a.tif` | Milky Way glow and colour (kit `galactic`, source 'photo') | `ESO/S. Brunier` (CC BY 4.0) |
| `assets/sky/nasa-svs-4851/milkyway_2020_8k_gal.exr` | Milky Way dust-lane detail (kit `galactic`) | `NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC.` |
| `assets/sky/nasa-svs-4851/hiptyc_2020_16k_gal.exr` | every point star (kit `galactic`) | `NASA/Goddard Space Flight Center Scientific Visualization Studio. Gaia DR2: ESA/Gaia/DPAC.` |
| `assets/moon/nasa-svs-4720/lroc_color_poles_4k.tif` | crescent moon colour (kit `sky.moon`) | `NASA's Scientific Visualization Studio` |
| `assets/moon/nasa-svs-4720/ldem_16_uint.tif` | crescent moon relief (kit `sky.moon`) | `NASA's Scientific Visualization Studio` |

Caption credit: `Sky: ESO/S. Brunier (CC BY 4.0); NASA/Goddard Space Flight Center Scientific
Visualization Studio, Gaia DR2: ESA/Gaia/DPAC. Aurora: U.S. Air Force photo by Senior Airman Joshua
Strang (public domain). Moon: NASA's Scientific Visualization Studio.`

The CC BY-SA aurora (`wm-aurora-pikner-180315-4`) is not used, so no ShareAlike terms apply.

## Changelog

### 2026-11-03, round 5: motion QA and video critic fixes (needs a full re-render; not rendered here)

Each report was first checked on frames pulled from the round 4 `out/03-first-snow-village.mp4`
(mp4 frame n = Blender frame n + 1), and on the camera keys (dumped per frame from a build). Fixes
were verified on half-scale ranges (Blender 1 to 16, 76 to 90, 84 to 88, 140 to 232), against a
half-scale render of the round 4 build for 1 to 16 and 76 to 90 and against the mp4 (downscaled)
for 140 to 232, then on full-resolution stills against the round 4 stills. All test frames deleted.

1. **Glow over the top-left sky pops off as each arch, strand or the snowflake leaves the top edge
   (QA medium, and the one-frame dark edge strip at mp4 161, QA low).** Confirmed: 20th-percentile
   linear luma of the top-left sky (x 0 to 540, y 0 to 640) falls 0.0144 to 0.0044 at mp4 81/82,
   0.0058 to 0.0022 at 12/13, 0.0086 to 0.0032 at 58/59, the top third -5.3 levels in one frame;
   the x 0 to 90 strip goes G 29.5 / 5.9 / 24.4 at 160 to 162. Cause: the kit bloom is screen
   space, and the near arch bulbs, the biggest and hottest emitters on screen, carry most of the
   halo; when the nearest part of an arch crosses the top-left corner its halo goes with it, while
   the rest of the arch is still in frame. Fix (`overscan`, `comp_bloom_edge_fade`): a hidden guard
   band, 192 px above and 108 px each side (full res). The render is 1296 x 2112; the camera
   sensor height grows with the render height and a lens shift of half the top band keeps the
   visible 1080 x 1920 at the same place and pixel scale; the bloom and fog-glow input of non-sky
   pixels falls to zero across the band; a `render_write` handler crops every written frame and
   still back to 1080 x 1920 with OpenImageIO; the kit vignette is re-centred and rescaled.
   Half scale, Blender 76 to 90 (the 81/82 pop): p20 eases 0.0108 to 0.0047 over 8 frames, largest
   step -0.0015 (round 4 build at half scale: one step 0.0149 to 0.0046); top third largest step
   -0.9 (was -6.7); strip G 49 to 8 over 4 frames (was 61.5 to 7.0 in one). Blender 13/14: p20
   0.0047, 0.0042, 0.0034, 0.0026 (was 0.0057 to 0.0023). mp4 161 strip: 32.5, 27.0, 20.7, 22.2,
   no dip. An in-frame fade over the top 12 or 20 percent (film 05's approach for its top edge) was
   tried first: it smoothed the pops as well but took 6 to 17 levels of glow off the top rows of
   every frame; the guard band leaves the visible frame within about 1 level of the round 4 build
   at half scale (frame 1 mean 55.08 against 55.11).
2. **Tower door glow drops off with the door at the right edge (mp4 212/213; critics' "awkward
   sliver" at 8.5 to 9 s).** Confirmed: the wall left of the door (x 840 to 1080, y 880 to 1200)
   falls 113.7 to 74.9 in one frame. Same fix (side band): 133, 121, 109, 99, 92, 85, largest step
   -12.3. Worst sharp single-frame tile drop over Blender 140 to 232 (6 x 10 tiles, step minus the
   mean of its neighbours) -15.9, was -48.6.
3. **Camera roll pulses (QA low, mp4 145 to 154 and 36 to 46) and the yaw "blip" and re-acceleration
   (QA low, mp4 200 to 211 and 219 to 228).** Confirmed on the camera keys: roll rate jumps from
   -0.02 to +0.09 degrees per frame within 3 frames and back (145 to 155; -0.09 at 37 to 44; +0.114
   at 200 to 208, a 0.78 degree swing in 9 frames; +0.07 at 256 to 262 under the card); yaw
   acceleration switches on and off in steps (56 to 61, 164 to 171, 200 to 202, 219 to 227). The
   QA "yaw blip" at 200 to 211 is mostly the roll pulse at those frames (0.114 degrees per frame
   moves the top rows 1.9 px per frame sideways). Cause: `camera.drive` takes the roll from the
   path curvature (2 m finite difference at s + 3.6 m) and the yaw from a 12 m look-ahead chord;
   the centripetal Catmull-Rom path is only C1, so the curvature steps at the control points
   (s = 14, 42, 56, 70). Fix: `smooth_turns()` Gaussian-filters the yaw and roll keys (sigma 8 and
   12 frames, odd-reflection ends) before `gentle_float`. Peak roll rate 0.114 to 0.026 degrees per
   frame, roll acceleration 0.038 to 0.0017, yaw jerk 0.070 to 0.004 px per frame cubed (full res),
   peak yaw acceleration 0.133 to 0.079; position untouched, framing moves by at most 3.1 px. On
   the rendered frames the sky band (rows 200 to 400) no longer stalls at 147 to 153 (was -2.2,
   -0.4, -2.0 px per frame) or jumps at 203 to 209 (was +0.1, +1.8 for 6 frames, +0.1): it now runs
   smoothly from -2.0 through 0 to +1.9; the row-60 slit scans show straight, evenly curving streaks.
4. **Snowflake grows and whips out of the top left at 8 to 9 s (all three critics).** The roll pulse
   above fell on exactly the frames it left, and its glow popped (item 1). Also hung higher: the
   second strand's ends +0.4 m, sag 0.9 to 0.6 m, so the snowflake centre is 0.7 m higher, passes
   3.6 m from the lens instead of 2.9 m and leaves about 4 frames earlier at about 12 degrees across
   instead of 17. In the 7.0 s still it sits about 80 px higher, still over the left of the tree top.
5. **Lower frame shows almost no flow (two critics).** Confirmed: in the road band the high-pass
   texture is a quarter of the town band's (std 6 against 23). `slush_mat` gains greyer, slightly
   lower packed-snow patches (about 0.4 m) and sparse 3 to 6 cm grit specks, denser on the slush
   shoulders and faded beyond 16 to 30 m, all at random spacing (nothing periodic that could strobe
   at 0.26 m per frame). Road-band frame-to-frame change +13 percent (half scale, Blender 84 to 88);
   in the stills the road band is 1 to 1.5 levels darker and reads as a gritted village road.

Judged not defects, or not in build.py:

- The tower leaving the right edge as a thin sliver: the near-landmark parallax the brief asks for;
  only its glow pop was a defect (item 2).
- Arches sweeping overhead "and vanishing": the arch tunnel is the hook; the vanishing was the glow
  pop (item 1).
- The strand "popping in" at 5 to 5.5 s: it is revealed from behind the last arch as that arch rises
  out of frame (mp4 118 to 130), visible from far off.
- Outro dim speed, the 3.5 s dim hold, end card size and contrast: `kit/finish.py` and the brief.
- Banding in the dimmed end-card section: not in the mp4. At 12.0 s the sky region keeps 85 to 88
  levels per channel and a 6x gain crop shows smooth gradients (finish.py dithers); the contact
  sheet's quantization.
- Rut reflections changing shape: they move coherently with the reflected tower and lights (crops of
  mp4 150 to 155); remaining screen-trace swimming stays an open issue.

Stills, full resolution, round 4 to round 5: mean 67.3 / 77.1 / 69.2 / 65.0 to 66.6 / 75.8 / 69.1 /
63.9, p98 unchanged within 1, share above 200 unchanged within 0.03 points, hood and dash aligned
(blurred mean difference 0.4 on the dash rows). The upper rows lose 1 to 2 levels where bright
lights sit at the top edge: the glare filter used to extend edge pixels outward, and the band now
holds the real scene there. Cost: 1.32x the pixels; full-res stills 13.5 to 15.3 s each, half-scale
frames 3.1 to 5.4 s with the GPU shared. `--export-web` restores the plain camera and resolution
(checked: glTF camera aspect 0.5625, yfov 60 degrees; `web/scene.glb` 28.7 MB, 1,548 objects, already
re-exported with this build).

### 2026-11-02, round 4: motion QA fixes (needs a full re-render; not rendered here)

Defects confirmed in `out/03-first-snow-village.mp4` (frames extracted with ffmpeg, mp4 index n =
Blender frame - 1), then fixed in build.py:

1. **Plaza bloom flicker, frames 245 to 326 (high).** Confirmed: top 30 percent band dips on single
   frames (n 279/280/281 code 28.3 / 21.4 / 28.7, 248/249 64.8 / 46.6), haze round the spiral strand
   visibly drops out on 280. Reproduced at half scale with the round 3 build (Blender 274 to 290:
   linear top band frame-to-frame rms 9.9 percent, residual against neighbours rms 7.0, max 15.4).
   Cause: the kit vibration (next item) through motion blur into the bloom. Fix: `camera.drive(vibration=0)`
   plus `gentle_float()`. Same frames after: frame-to-frame rms 1.95 percent, residual rms 1.3, max 3.7
   (244 to 290: rms 1.3, max 4.4 at 283, where the top whorl's strand crosses the top edge).
2. **Vertical camera buzz, whole film (medium).** Confirmed by phase correlation on n 100 to 130: the
   sky band moves 2.3 px per frame on average and reverses on 15 of 29 frame pairs while the hood
   moves 0.00 px. Fix: no kit vibration; `gentle_float()` adds a slow suspension float instead (bob 4 mm
   at 0.83 and 1.37 Hz, pitch 0.05 degrees at 0.61 and 1.13 Hz, roll 0.04 degrees at 0.43 Hz) to the
   camera's per-frame keys. Frames 1 to 30 after: sky moves at most 0.14 px per frame (full-res
   equivalent), 3 slow reversals in 28 pairs, hood 0.00.
3. **First-frame bloom pop (low).** Confirmed (n 0 / 1 / 2 mean 57.8 / 61.4 / 62.7, arch halos weaker on
   frame 0). QA's guess (camera keys start at frame 1) is wrong: the kit keys frames 0 to 337. It was
   the same vibration link (frame 1 fell on a slow pitch phase). Full-res frames 1 to 4 after: mean
   59.7, 60.1, 60.9, 61.5, middle third 87.3, 87.7, 88.6, 89.2, halos equal by eye.
4. **Overhead strand at 9.5 to 10.3 s (critics, and QA's stepped fade at n 249).** Confirmed: the
   square-on strand at s = 68 (big candy bulbs) crossed the tree top in the 9.5 s payoff, then left the
   top edge on n 248 to 249, right as the outro dim starts. Removed. Blender 248 to 251 now read mean
   67.8, 68.0, 68.6, 69.0 (no step); the 9.5 s still shows the star and the canopy clear.
5. **Single-frame bloom pops as the street strands leave the top edge (critics, 6.95 and 8.75 s).**
   Confirmed (n 166 to 167: -3.5 mean, -11.7 top band; n 209 to 210: -5.4). Both strands now run
   diagonally (right end 6 m further on) and sit 1.5 m nearer (s = 45.5 and 56.5), so the part over
   our lane leaves over about 4 frames and the second strand and the snowflake leave before the tower
   door, not with it. Half scale: the 6.9 s step is now -2.2 and -1.4 over two frames; at 8.4 to 8.7 s
   -1.6, -2.4, -3.7, -5.2, -2.8, then the door -1.4, -1.6, -1.9 (square-on: one -6.4 step inside a
   7-frame sag). The 8.4 to 8.9 s fall itself stays: three lit elements leave the frame there.

Judged not a defect, or not in build.py:

- Sag at 8.6 to 8.9 s "as the tower door exits": parallax content (door, strand, snowflake leaving);
  only its single-frame part was a defect (item 5).
- The first arch sweeping out of the top within 0.5 s: near-landmark parallax the brief asks for; the
  buzz that made it look rough is gone. Removing that arch was tried and reverted: the first frame lost
  its framing arch and fell from mean 61 to 48.
- Luma pulsing under the end card "from twinkling lights": nothing in the scene twinkles; it was the
  bloom flicker (item 1).
- Rut reflections swimming: mostly the camera buzz, doubled in the mirror (item 2). The rest is EEVEE
  screen tracing (Open issues). The rut edges are motion-blurred procedural edges, not stair-stepped.
- End card size and typeface, the dim's desaturation and blur (the "sepia" look), and the second fade
  to black over the last 0.4 s are `kit/finish.py` (read only for films) and the shared brief.
- The camera keeps driving under the card and the tree top leaves the top edge at about 11.1 s: the
  brief says the camera keeps moving slowly under the card, at 12 percent brightness. Unchanged.

Verification: half-scale frame ranges 1 to 30, 1 to 14, 156 to 216, 244 to 290, full-res 1 to 4 (all
deleted), and full-res stills at 1.0, 4.0, 7.0 and 9.5. Against round 3, the stills at 1.0, 4.0 and 7.0 are
within about 1 luma level (mean 66.9 / 76.2 / 68.8 against 67.9 / 76.9 / 67.6), and they look the same
apart from the diagonal strand at 7.0. At 9.5 the mean is 64.6 (was 70.6) because the strand is gone.
Half scale renders at 3.3 to 4.6 s per frame, full res at 11 s per frame cold, and the stills took 12 to 20 s each.

### 2026-11-02, round 3 (after blind critics: ours 5.7 vs reference 7.5, 0/3 preferred ours)

Round 2 dimension averages: sky 5.3 (reference 3.7), world 6.2 (7.0), light 6.3 (7.8), framing 6.5 (7.2).
What the critics agreed on, and what changed, most shared first:

1. **Dead lower half (3/3).** Hood plus dash took 24 percent and the dash was near black; the road was a
   dark brown wet mirror with smeared, sourceless reflections (a floating candy-cane, the tree as a black
   cut-out). Now: dash top at 7 percent, hood crest at 13.5 percent, the hood cleared to glossy candy red
   with a thin crust only at its edges, wipers removed (the "black rectangle"), corner drifts small, a
   brighter cool dash rim. The road is fresh blue-white snow with two wet tyre tracks under our own
   wheels that run to the tree as leading lines and carry the reflections in narrow strips, so a
   screen-trace miss can no longer paint a large black shape. Lower band (55 to 85 percent of the
   height) now has mean luma 58 to 69.
2. **Aurora read as soft green smoke over 60 percent of the sky (3/3).** Rebuilt from the same public
   domain plate: contrast so the gaps between folds are dark and starry, ray striation, a bright lime
   lower hem, the overhead swirl dimmed, magenta-red high fold, narrower (52 degrees), and it drifts and
   breathes in the film. The Milky Way now shows in the gap from the first second.
3. **Star chroma speckle and colour fringing (2/3).** Lens dispersion 0.006 to 0.0015, compositor
   saturation 1.5 to 1.35, sky grade saturation 1.12 to 1.0, and a sky-only chroma cap on fine detail.
4. **Near flakes as grey 30 to 90 px blobs (2/3).** Near flakes halved in size, brighter, culled within
   2.2 m of the lens: now 5 to 15 px white points.
5. **Warm facades clipped to flat orange, grey-lavender snow (3/3).** Window strengths down about 35
   percent, washes rarer and warm-white, bakery wall cream and its upper lights cut from 120 to 45 W,
   narrower sodium pools, and a high 7000 K moon fill so snow reads blue-white on every top surface.
6. **No hook (3/3).** A tunnel of six light arches over the first 40 m of road (warm white with candy
   red or gold, no moon-fill shadow), reflected in the tracks: the first frames now open on it.
7. **Moon pasted on (2/3).** 2.5 to 1.5 degrees, earthshine 3 percent, halo cut to a thin ring, added so
   the aurora glows over its dark side.
8. **Generic kit (3/3), partly.** Fir needle material, a 12-whorl great fir with thinner snow and 900
   bulbs, the villager couple lit from the front. Not done: villager figures are still simple (see Open
   issues), no chimney smoke.

Iterations (half-scale stills unless noted): (1) all of the above first pass: headlamp pools blew out
on the white road, the tracks sat left of centre, the aurora sat out of frame on the left; (2) tracks
under our wheels and narrower, headlamps 2600 to 520 W aimed 28 m out, aurora to az +4, moon fill;
the snow measured lavender (R about G) so (3) the fill went bluer and stronger and the sodium cones
narrower; (4) full-res t = 4: the arches' wires and bulbs cast a dashed shadow line across the snow
(arch shadows off, smaller bulbs); (5) fir needles, neutral hood fill; (6) bakery facade still clipped
(B channel 15 to 40 of 255), traced to its 120 W upper lights; (7, 8) full-res t = 1 and 9.5, aurora
magenta band, great fir; (9) villager fill; (10) aurora drivers; at t = 0 two full-height vertical lines
showed in the sky: the kit snow loop's wrap frame (see Kit issues), fixed with `seamless_snow`;
(11) wrap frames 1, 124 and 177 checked clean.

Motion check: frames 121 to 126 at 25 percent (124 is an old snow wrap frame): mean luma 63.7 to 65.0,
nothing pops, no streaks; frames deleted.

### 2026-11-02, round 2 (after blind critics: ours 5.0 vs reference 7.7, 0/3 preferred ours)

All three critics agreed on: a CG-looking sky (soft blue aurora wash, sparse dim stars, no Milky Way,
lifted haze), a car POV that read as a snow cave over a dead dashboard band, a road that read as a mirror
canal (white strip in the left lane, blotchy speckle), a candy rainbow palette, a static symmetric corridor
with no payoff, low-detail boxes and cone trees, and barely visible snowfall. Changes, in that order:

1. **Sky rebuilt.** The whole-sky Eielson replace plate (few stars, blue-graded aurora) is replaced by the
   kit's real Milky Way and NASA star field plus the Eielson aurora extracted as a starless additive layer,
   graded green at the base and violet on the fold, raised so its curtains hang through the frame. Moon
   now a real added crescent (it rendered as a black disc until the world was rebuilt after the blend
   change). Sky saturation down to 1.12 so stars are not orange/blue speckle. Measured: sky darkest
   5 percent at luma 11 to 23 (was a flat lifted blue), stars dense and point-like at full resolution.
2. **Car.** Dash cut from 15 to 9.5 percent; a readable vintage hood (red lacquer, chrome strip and jet
   ornament, fender crowns, engine-melted centre with snow at the edges) replaces the snow mound; wipers,
   glass crystals, frost, headlamps. A-pillars were built but sit outside a 36 degree wide frame at the
   glass base, so they are off (`PILLARS = False`).
3. **Road.** Two lanes with a dashed centre line, tyre tracks, dark slush, packed edges and pools; the
   camera drives in the right lane, so the centre line is a leading line from the lower left. The moon
   lamp's glossy sheen (the old white strip) is gone (diffuse only); windshield rain beads off (they read
   as dark holes on the road). The kit's compositor road streak caused the stipple inside dark reflections;
   it is off and the reflections now break up in pools.
4. **Palette and grade.** Warm tungsten windows and sodium lamps, natural wall colours, limited bulb
   colours, no pink/cyan/violet washes, no cyan/magenta tower uplights. Exposure -0.8, saturation 1.5,
   black point. Mean luma 61 to 74 (reference 38 to 46: our sky carries a bright aurora), p02 0.5.
5. **Composition.** Faster (6.2 m/s), an S-curve with about 15 degrees of yaw, a right-lane offset, and a
   plaza reveal at 9 to 10 s with the great tree on axis and a canopy of radiating light strands.
6. **World detail.** Siding, shingles, stone tower, readable clock faces, branch-whorl firs, parked snowy
   cars, villagers.
7. **Snow.** Three depths with soft round near flakes; fine flakes kept low.

Iterations (half-scale stills unless noted): (1) first pass of all of the above: moon black disc, aurora's
dark interior read as a mountain, left lane bright with dark holes, specks over the sky; (2) moon rebuilt,
aurora raised and shifted, slush mask fixed (it was inverted: snow-white between the tracks); (3) Milky
Way boost, headlamps, rougher lighter slush so the tracks read as lines; (4) aurora gain 0.38 to 0.24,
moon lamp diffuse only, exposure and saturation; (5) full-res: hood snow edge stair-stepped (coarse grid,
now 160 x 110), wipers read as black slabs (thinner), fender snow smaller, lacquer brighter; (6) villagers,
denser snow, smoke volumes removed (never visible at 7 m height behind roofs); (7) near flakes read as grey
diamonds (subdivided, brighter); (8) road stipple traced to the compositor streak (persisted at 128
samples, with lower bump detail, with snow hidden and with a lower ray-trace roughness cutoff; vanished
with the streak off).

Motion check: frames 120 to 123 at 25 percent: mean luma 64.0 to 65.6 frame to frame, nothing pops; frames
deleted.

### Round 1 (2026-11-02)

#### Iterations (stills at 1.0, 4.0, 7.0, 9.5 s, half scale, compared side by side with the reference)

1. First pass: frame washed out (mean luma 90 to 114 vs the reference's 40 to 45), green-teal sky, huge
   windshield snow wall, a pink neon that read as a letter "A", near string lights dominating the sky.
2. View exposure -0.8, thin haze, point lights barely scatter in the fog; sky -2 EV; pretzel rebuilt as an
   inverted trefoil (two loops on top, one below); windshield snow cut to a ridge; road widened to 7 m.
3. Sky blue shift (plate gain, tint), procedural pink dawn on the bakery side, moon gain; dash excluded
   from scene lights (moon lamp hot spot); facade colour washes; bakery plaza opened.
4. Moon added instead of laid over (its dark side was a black disc against the aurora); stronger blue
   ambient; corner drifts; road streaks; comp saturation.
5. Snowflakes faded out inside the car; lamp energy halved over the white snow; saturated wall palette;
   spire uplights; 14 m village tree on the axis of the bend.
6. Sky lights reflections at 30 percent (near road was black), sky contrast 1.5, a taller asymmetric
   hillside behind the village.
7. Chunkier near cottages closer to the road; wetter lane; hillside cottages turned to face the road
   (they faced away): the skyline now fills the width with a few hundred lit windows.
8. Windshield drifts rounded (they had become fins); bakery spill tamed.
9. Diamond-dust snowfall (flakes read as noise over the stars at full res), smaller moon halo, rounder
   teal spire with snow skirts, re-aimed tower uplights, cornice bulbs on the tower.
10. Cool / pink / violet / mint windows so the bakery is the single warm hero; stronger road streaks.
11. Full-res check: picket fences showed glowing triangles from the facade washes; washes moved behind
    the fences. Edge snow toned down.

Motion check: frames 96 to 120 at 25 percent. Mean luma per frame moves smoothly from 62 to 67 (no
flicker), reflections stay coherent between consecutive frames, snow loops without jumps, nothing pops.
Frames deleted afterwards.

## Timings (M4 Pro, other films rendering on the same GPU at the time)

Round 4 render (2026-11-02): 336 frames at 1080 x 1920, 64 samples, in seven chunks (18 to 65 frames,
build 10 to 12 s each, 1,576 objects): 8.9 (cold, frames 1 to 30), 5.9, 5.9, 6.8, 5.9, 7.0 and 6.1 s
per frame, 6.5 s per frame overall, 37 min of render. Frames 167 and 168 came out truncated (Blender
logged "Saved"; the shared disk was briefly full) and were rendered again. Frame check: mean luma 59 to
95; plaza 246 to 325 top-30 percent band residual against neighbours rms 0.56, max 1.8 codes (round 3:
rms 7.0 percent); largest mean steps -2.3 to -3.5 per frame at 205 to 209 (the strand and snowflake
leaving, as expected) and -2.3 at 82 to 83 (an arch leaving). `finish.py` verify ok (14.000 s, 336
frames, AAC 48 kHz), 29.3 MB. `--export-web` rerun with the last chunk: `web/scene.glb` 28.7 MB,
1,548 objects. Frames deleted afterwards.

Final render (2026-11-02): 336 frames at 1080 x 1920, 64 samples, in six chunks (24 to 67 frames per
Blender run, build 10 to 14 s each): 6.8, 6.2, 6.3, 6.4, 5.6 and 4.9 s per frame, about 6.0 s per frame
overall (other films were rendering on the GPU), 35 min of render in all. Delivered
`out/03-first-snow-village.mp4` (finish.py verify ok); frames deleted afterwards.

Round 3: scene build 14.5 s (1,582 objects); full-resolution 64-sample stills 20.1 s (t = 1, includes
shader compile), 15.5, 17.6 and 14.2 s, so about 16 s per warm frame; half-scale stills 4 to 9 s.
`--export-web`: `web/scene.glb` 28.8 MB (1,554 objects), `web/sky.json` 5 layers.

Round 2:

- Scene build: 8 to 18 s (about 1,540 objects). First run also caches the starless aurora PNG (2.7 s,
  16-bit, `$TMPDIR/povkit-cache/sn03_aurora_starless_v3.png`); the Milky Way plate is the kit's shared
  cache.
- Full resolution 1080 x 1920, 64 samples: final stills 18.2 s (includes shader compile), 12.5, 10.2 and
  10.6 s; a 4-frame sequence (frames 120 to 123) measured 17.1 s per frame including the first-frame
  warm-up, with film 01 rendering on the same GPU. Under the 20 s bar.
- Half-scale stills: 3 to 12 s.
- `--export-web`: `web/scene.glb` 26.8 MB (1,516 objects), `web/sky.json` with 5 layers (milkyway,
  stars, atmosphere, aurora rect, moon rect), all additive, so the web sky now matches Blender.

## Kit issues (worked around in build.py)

- `particles.snow` loops each layer with two stacked copies and a Cycles F-modifier, so on each wrap
  frame (frame 1, and for these layers 124, 177, 206, 247, 294 ...) every flake of one copy jumps by
  the box height and EEVEE motion blur draws it as a full-height vertical line. Work-around:
  `seamless_snow()` adds a third copy per layer and re-keys all three over a 3H cycle (offsets -H to
  2H) so a copy wraps only while it is below the ground, and `snow_zmask()` hides flakes outside the
  box height, so neither the wrap nor the copy waiting above the box is drawn. Worth fixing in the kit
  for every film that uses snow.
- `geo.string_lights` wires and bulbs cast shadows; under a high sun lamp the arches drew a dashed line
  across the snow. Work-around: `visible_shadow = False` on the arch wire and bulbs.
- The sky rect layers have no animation hook. Work-around: `animate_aurora()` finds the aurora's image
  node in the world tree after the last `sky.build()` and adds driven Value nodes (u drift, gain pulse);
  any later `sky.build()` would drop them, and the web sky stays still.

- `particles.snow` fills the whole box, including the cabin. Work-around: `cabin_safe_snow()` fades the
  flake material out below 1.25 to 2.3 m camera distance.
- `particles.snow` flakes are flat-shaded octahedra: the nearest ones (20 to 40 px) show as diamonds.
  Work-around: replace the near layer's material with a facing-ratio alpha disc and add a Subdivision
  modifier to those objects.
- `sky.moon` always composites "over". Work-around: set `pk._SKY.layers[-1]['blend'] = 'add'` after
  `moon()` **and call `pk.sky.build()`**; without the rebuild the change is silently ignored (round 2's
  first pass rendered a black disc).
- `sky.moon(light=...)` adds a sun lamp whose glossy highlight spreads a pale sheen over a whole wet lane.
  Work-around: `MoonLight.data.specular_factor = 0`.
- `comp.setup(road_streak=...)` adds a bright single-pixel stipple inside dark reflections next to bright
  ones (seen in round 1 as "dotted speckle"). It is not sampling noise (unchanged at 128 samples) and not
  the per-pixel mask (unchanged with the mask blurred 2 px in my own copy). Work-around: `road_streak=0`;
  `post_comp()` keeps an optional soft-masked copy, unused.
- Still applied from round 1: `lights.point` defaults to `volume=1.0` (every bulb drew a fog blob), so
  point and area lights get `volume_factor = 0.06` after the build; `render.setup()` does not expose the
  shadow pool, so `scene.eevee.shadow_pool_size = '1024'` (EEVEE reported "Shadow buffer full").
- The glb post-pass reports only 2 instanced groups for about 9 scatter groups; size is fine (26.8 MB).

- `camera.drive(vibration=...)` also drives pitch and roll (about +-0.2 degrees here at vibration
  0.0016) with sines up to about 7 Hz, so the camera's angular speed changes every frame or two. With
  motion blur on (kit default shutter 0.32), the energy of the tiny hot bulbs above the bloom
  threshold changes from frame to frame (raw linear test at frames 279 to 283: 112k, 112k, 91k, 100k,
  103k with motion blur, a smooth 74.5k to 76.7k without; hiding the haze or the snow changes
  nothing, and with the compositor off the 8-bit top band moves only 1 code value). The wide bloom
  (size 0.6) spreads that over the whole upper picture. The sines also alias at 24 fps into a
  +-5 px vertical buzz of the world against the hood. Worked around in round 4: `vibration=0` and
  `gentle_float()` adds sub-1.4 Hz bob, pitch and roll to the camera keys. Worth changing in the kit
  (cap the vibration frequencies near 2 Hz, or keep pitch and roll out of it).

- `camera.drive` derives roll from `Path.curvature` (a 2 m finite difference) and yaw from a
  look-ahead chord on a centripetal Catmull-Rom path, which is only C1: the curvature steps at every
  control point, so the roll swings 0.5 to 0.8 degrees in about 9 frames and the yaw acceleration
  switches on and off as the probes cross the knots. Worked around in round 5 with `smooth_turns()`
  (Gaussian filter on the yaw and roll keys). Worth a `smooth_frames` option in the kit, or a
  curvature smoothed over several metres.
- `comp.setup` bloom is screen space with no guard band (film 05 hit the same). Worked around in
  round 5 with `overscan()` + `comp_bloom_edge_fade()`: a 192 px top and 108 px side band rendered,
  faded in the bloom input and cropped in a `render_write` handler (needs OpenImageIO, bundled with
  Blender 5.2). If that handler ever fails, frames come out 1296 x 2112: check the first frame's size
  before finishing. A kit-level overscan would also need the lens-distortion centre, which moves by
  half the top band (geometry change measured at under 1.5 levels of blurred difference on the dash).

## Open issues

- (Round 5: fixed with the guard band.) The bloom used to see only what was inside the frame, so a
  bright element that left the frame took its glow with it on that frame; now halos die out over
  the 3 to 8 frames a light takes to cross the hidden band.

- The aurora drifts and breathes as a whole, but its folds do not change shape (one still plate); the
  ray texture is partly procedural (+-15 percent), so a critic may still call the rays regular.
- Mean luma is 68 to 77 against the reference's 38 to 46 (bright snow road, aurora, arches). If critics
  read it as too bright, lower the `MoonFill` strength (0.5) or the exposure (-0.8).
- Villagers are still simple bell-coat figures with no secondary motion; no chimney smoke.
- The near tyre-track reflections are screen traced: within a few metres of the car they smear and
  break where the reflected source is off screen (arches overhead).
- The aurora's magenta fringe is faint in frame (the high fold mostly sits above the frame top).
- Web edition: frost, glass crystals, haze, the bakery's area-light spill and the headlamp volume are not
  in the glb (area lights do not export; volumes are skipped).
- The hood melt boundary is procedural; in motion it is rigid with the car, as it should be, but its
  outline is a little regular at the front crest.
