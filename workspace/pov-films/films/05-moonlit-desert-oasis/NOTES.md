# 05-moonlit-desert-oasis: notes

## Reference analysis

Measured on `reference/ref_1s.png` ... `ref_9s.png` (720 x 1280) and the 2 fps contact sheet.

- **Horizon and vanishing point.** Building bases and the road's vanishing point sit at 57 to 59 percent
  of the frame height from the top. The sky gets the upper 55 percent, the town a band from about
  40 to 62 percent, the road 60 to 85 percent.
- **Dashboard coverage.** The dark dash edge is at 85 percent from the top (cover 0.15) across the middle,
  bowing down to the corners. It carries a thin bright rim line (row luma 44 to 83) where it mirrors
  the street, then goes to black (luma 0 to 20), with a faint steering-wheel arc at 88 percent.
- **Luminance profile** (row luma, 20 bands top to bottom, t = 1 s):
  12 22 22 33 36 31 35 32 46 69 95 88 62 64 43 21 14 16 3 1. The town band is the brightest part
  of the frame (mean RGB about 80, 77, 160), the sky is dark but saturated (median luma 13 to 20,
  mean RGB about 20, 25, 98), the road carries the colour (mean 35, 30, 92), the dash is near black.
- **Landmarks and timing.** At 0 to 3 s the warm amber hero building sits on the road axis at the
  vanishing point, framed by a candy-striped tower on the left and a pinwheel on top. From 3 s the
  road bends and the hero slides right; it leaves past the right edge at 6 to 7 s (the pinwheel
  exits the top-right corner at about 6 s). The striped tower grows on the left and swings out of
  the left edge at 8.5 to 9.5 s. Small props (a buoy post, a lantern, plants) pass the near edges
  every second or so. The fade to the end card starts at about 9.5 to 10 s.
- **Density of lights.** 375 to 880 separate bright blobs (luma > 200) between 30 and 85 percent of
  the frame height; 1.2 to 1.6 percent of all pixels are above 200. Every building has 3 to 10 lit
  portholes, several neon signs, and colored practicals line both kerbs.
- **Palette.** Saturated cobalt and violet dominate (mean saturation about 85 on 0..255), with
  magenta, cyan and green neon accents and exactly one warm amber hero plus a few amber window
  accents. Lights are rendered with very strong bloom.
- **Depth layers.** (1) props and plants on the kerbs that sweep past the frame edges, (2) the
  houses lining the road, (3) a dense packed skyline of towers and domes filling the whole width,
  (4) the sky with the diagonal Milky Way, the moon and neon motifs floating in front of it.
- **Sky.** A narrow diagonal Milky Way band from the top-left corner to the right-hand skyline,
  dark sky on both sides, a large crescent moon top right, a shooting star, dense crisp stars.
- **Why it works.** One strong diagonal (the band) answered by the S of the road, a clear warm
  focal point against an all-cool world, the road mirror doubling every light, a locked steady
  dashboard that makes the viewer the driver, and constant parallax from props right beside the
  kerb. The world stays readable: even unlit walls are lifted by a blue fill and coloured washes,
  nothing goes muddy.

## Design: the oasis of the blue walls

An original desert caravan town on the edge of a dune sea, the hour before dawn. Adobe houses are
lime-washed in blues, teal, lilac and rose; the old desert road of sandstone setts is wet after a rare
rain, its puddles mirroring every light; an irrigation channel runs beside it. The traveller drives in
on an old expedition jeep, past a night market, toward the town gate.

- **Palette.** Indigo and cobalt night; blue-washed adobe kept readable by a cobalt moon key, a cool
  back fill and cobalt/cyan/violet facade washes; a cool split tone in the compositor (shadows and
  midtones x (0.84, 0.9, 1.25), highlights neutral) keeps the night cobalt while practicals keep their
  hue. Practicals: fairy lights on palms, prickly pears, the festival strings and the water tower are
  mostly warm 2400 to 2800 K amber with teal accents and a rare magenta bulb; lantern posts alternate
  teal, amber and cobalt with one magenta; neon blade signs in magenta, teal, cyan, rose and green.
  One warm hero: the caravan inn in apricot plaster with amber latticed arches; the gate's lantern
  and the far lantern tower keep a warm note at the vanishing point. A warm light dome over the town
  and a thin rose-orange dawn line low on the left.
- **Path.** Gentle S in arc length (the camera starts at the path's first point): straight for 25 m,
  a soft left bend (camera yaw 0 at 1 s, -3.5 at 4 s, -12.4 at 7 s, -16 at 9.5 s), easing back to -12
  by 14 s. 5.2 m/s cruise, eye 1.82 m (jeep), pitch 4.5 deg, fov_v 62.
- **Warm hero: the caravan inn** sits at the outside of the bend, its front (great gate, balcony,
  big lantern, flanking latticed arches, covered wagon glowing in the forecourt, jars) facing the
  approaching driver, an arcade of five latticed amber arches along the road, a turquoise dome
  (cyan wash) and a slim wind tower with glowing slats. Front-left corner at x 0.54 at 1 s, the front
  leaves the right edge at about 6.5 s, the far end of the road-side arcade at about 9.3 s.
- **Landmark timeline (0 to 10 s)** (screen x from the per-time report in build.py).
  - 0 to 3 s: the inn right of the vanishing point, the gate on it (x 0.31), the crescent Moon in the
    dark sky upper left (x 0.26), the comet over the inn (x 0.71), a festival string with a brass
    lantern sagging across the road 8 m ahead, palms and prickly pears strung with warm lights, stalls
    with people on the left walk beside the channel.
  - 3 to 6.5 s: the road bends left, the inn swings right and out, the comet leaves on the right; the
    second festival string passes overhead; the Moon drifts toward the centre.
  - 6 to 9.5 s: the onion-domed water tower stands in the left third (x 0.21 to 0.23); the gate holds
    the vanishing point (x 0.63 at 7 s, 0.79 at 9.5 s) with the lantern tower behind it (x 0.53 to
    0.63); the Moon rides to x 0.67 by 9.5 s, the band climbing behind the gate.
  - 10 to 14 s: slow roll toward the gate under the string lights.
- **Sky** (sky az/el relative to the initial heading; round 3). One real photograph fills every visible
  pixel of sky: `eso-potw1713a` ("Up high", the narrow southern Milky Way, 77 px/deg natively).
  `prep_plates.py milkyway1713` (1) flattens its orange horizon glow (per-row 10th percentile of a
  star-free background over the dark half, excess below plate y 0.42 removed), (2) calms star colour:
  stars = image minus a 4 px grey-opening background, star chroma kept at 15 percent (the lens' red/blue
  fringes went with the stars), (3) places it 1.3x smaller than life (100 px/deg) with roll 118 so the
  galactic core sits just under the left skyline (az -19, el 1, "rising") and the band climbs
  diagonally to the upper right with dark sky above and below it, (4) bakes a horizon extinction
  (stars and band 12 percent at el 1.5 rising to 100 percent at el 16) and (5) reprojects everything
  into a level 5232 x 3688 plate at 73 px/deg (`mw_potw1713a.tif` + `.json`: centre az -7.5, el 19,
  hfov 63.8, vfov 47.4) covering every camera view from 0 to 14 s down to el 3 to 8 at the frame edges
  (buildings cover the rest). Rendered at 28 px/deg with `Closest` sampling (no mip blur; the 64 TAA
  samples do the 2.6x downsample), so stars are 1 to 2 px points. Grade: exposure 0.6, contrast 1.45,
  saturation 0.82, tint (0.88, 0.94, 1.14). A warm amber light dome of the lit town (horizon glow
  (1, 0.42, 0.14), strength 0.05 over 16 deg), a faint teal-green airglow band and a thin dawn line at
  az -30 are added. The kit's all-sky `galactic()` stays underneath for world lighting and the 360 web
  sky only. On top of the plate:
  - Moon: the kit's LRO moon, 2.4 deg (6.5 percent of the frame width), phase 0.2, at az -9, el 27 in
    the dark sky above the band (x 0.26 / 0.35 / 0.57 / 0.67 in the four stills, never crossed by a
    palm), lit limb toward the sun below the dawn horizon, earthshine 3.2 percent so the maria show on
    the dark side, kit halo off (it drew a thin bright ring at the limb) and a soft additive scatter
    halo of about 2.5 moon radii, stronger on the sunlit side.
  - Comet: McNaught cut-out (`eso-mc-naught55`), 7.5 deg, head at az 9, el 15.5 over the inn, cream
    dust fan rolled 7 deg off the anti-sun line, plus a narrow straight blue ion tail (procedural,
    exponential fade) exactly anti-sun and a 2 to 3 px nucleus with a faint green coma. Visible at 1 to
    4 s, it leaves the frame on the right as the road bends left.
- **Vehicle foreground** (built in `jeep()`, round 3): from the bottom: the top arc of a thin old
  steering wheel (top at 8.8 percent, 1.1 cm rim, a cool rim light draws it), a dark dash with a satin
  trim line and a small brass dash compass whose amber card glows (the warm cabin anchor, lower right),
  the bottom rail of the fold-down windshield frame with its seal, then the hood to 11.8 percent:
  raised centre panel, fender tops, a thin chrome strip on the rolled front lip, dark bottle-green paint
  under a glossy clear coat (rough 0.035). The hood surface starts below the rail sightline, so the
  visible part is flatter and mirrors the lit town band instead of the dark road. No rivets, latches,
  bolts or wipers (the critics read them as beads and a stray bar). No windshield glass (see Kit issues).
- **Reflective surface** (round 3). `mat_pavers()`: wet sandstone setts 0.78 x 0.52 m (Brick texture)
  with per-stone tone and height, dark wet joints, 42 percent mirror puddles (rough 0.035) with damp rims
  inside dry rough stone (0.47 to 0.62), fore-aft ridges and a slow undulation only inside the water, rain
  rings. No lane lines. A stone-lined irrigation channel (falaj) runs along the left kerb (lat -3.5 to -5)
  with still water, a coping, lantern posts whose lamps hang over it and date palms leaning over it.
  Compositor road streak 1.0 over 90 px.
- **Depth layers** (round 3). Kerb props: lantern posts (right kerb, and over the channel on the left),
  brass lantern bollards every 6 m along the right kerb and the channel coping, date palms along the
  channel, in house gaps and on the right walk, prickly pears strung with lights, potted agaves, jars,
  sand drifts against the walls, five night-market stalls on the walks with robed figures; two festival
  strings with brass lanterns 8 to 20 m ahead; houses of 2 to 3 storeys right behind the walks (facades
  at lat 6.3 to 6.9 on the right, 7.35 to 7.9 on the left; the right side before the inn stays low and set
  back so the inn reads), with parapets, vigas, arched lit windows, glazed tile friezes, awnings, rugs
  and neon blade signs (camel, palm, eight-point star, crescent, lantern); the caravan inn (warm hero);
  the oasis gate (bab) spanning road and channel at s 121: two tapering blue towers with merlons, a
  horseshoe arch outlined in turquoise zellige and warm bulbs, a big pierced lantern in the arch,
  magenta and cyan uplights; it sits on the vanishing point at x 0.31 / 0.40 / 0.63 / 0.79 in the four
  stills, with the far street's string lights glowing through it; the water tower; the lantern tower
  behind the gate; a two-band skyline; dunes with glowing tents; then the sky.

## Plates used (credit lines from assets/LICENSES.md)

- `assets/sky/eso-potw1713a/potw1713a.tif` (the visible sky, reprojected to `plates/mw_potw1713a.tif`):
  `ESO/B. Tafreshi (twanight.org)` (CC BY 4.0)
- `assets/sky/eso-mc-naught55/mc_naught55.tif` (comet dust fan, `plates/comet_mcnaught.tif`): `S. Deiries/ESO` (CC BY 4.0)
- `assets/moon/nasa-svs-4720/lroc_color_poles_4k.tif` and `ldem_16_uint.tif` (the kit's rendered Moon):
  `NASA's Scientific Visualization Studio` (NASA media usage guidelines)
- Lighting and the 360 web sky only (never seen by the film camera): `assets/sky/eso0932a/eso0932a.tif`
  (`ESO/S. Brunier`, CC BY 4.0) and `assets/sky/nasa-svs-4851/hiptyc_2020_16k_gal.exr`,
  `milkyway_2020_8k_gal.exr` (`NASA/Goddard Space Flight Center Scientific Visualization Studio.
  Gaia DR2: ESA/Gaia/DPAC.`)
- No longer used: `eso-potw2133a` (rounds 1 and 2; `prep_plates.py milkyway` can regenerate its crop, the
  56 MB `plates/mw_potw2133a.tif` was deleted), `eso-beletsky-paranal-33` (round 1 Moon;
  `plates/moon_beletsky.tif` is kept but not loaded).

Cut-outs live in `plates/` (made by `python3 -I films/05-moonlit-desert-oasis/prep_plates.py <which>`,
`which` in moon, comet, milkyway, milkyway1713; `milkyway1713` takes about 30 s and writes the 93 MB 16-bit
sky plate). Everything else (the ion tail, nucleus and moon halo included) is procedural.

## Iterations (stills at 1, 4, 7, 9.5 s, compared side by side with the reference)

1. Street canyon: inn, Moon and comet hidden behind houses; neutral-pink haze (mid band RGB 149,126,125
   vs reference 80,77,160); hood too tall and grey; sand ladder distracting.
2. Houses set back and lower, far strings only, cooler bulbs and washes, thinner fog, stronger blue
   fill, sky re-laid out. Moon read as a full red disc, comet as a fireball.
3. Earthshine cut, comet de-reddened; found that arc length starts at the first path point, so the
   bend never happened inside the cruise.
4. Path re-based, inn turned to face the driver at the outside of the bend, sky placed for a yaw of
   0 to -16 deg. Composition now works; inn too yellow.
5. to 8. Dunes raised, inn arches and windows dimmed and turned into latticed screens, neon outline
   signs, cool back fill, longer road streaks, darker hood.
9. to 11. Hunted a stray cyan-green pool on the inn front (the dome wash spot sat 1 m from the wall),
   dune-only moonlight so the dune sea reads, props kept out of the inn's forecourt.
Motion check: frames 150 to 174 at 0.25 scale; region means change by at most about 1 luma level per
frame, no popping, flicker or swimming; frames deleted.

## Changelog

### 2026-11-02, round 5: motion QA fix (camera roll wobble before the outro)

Confirmed on frames pulled from `out/05-moonlit-desert-oasis.mp4` (the round 4 render; mp4 frame n is
Blender frame n + 1), then checked after the fix on half-scale ranges (Blender 220 to 242 and 86 to
104, deleted afterwards), on camera keys dumped from Blender before and after, and on full-resolution
stills at 1.0, 4.0, 7.0 and 9.5 s against the round 4 stills.

- **Sky zigzag at mp4 225 to 237 (t 9.4 to 9.9 s)** (medium). Confirmed: stars at the top of frame
  drift +1.5 px/frame, reverse to -1.3 px/frame over mp4 228 to 233, and return to +1.0 by 238; the
  left and right edges move vertically in opposite directions (+0.9 and -1.1 px/frame), so it is a
  roll; the hood stays locked. Cause, from the camera keys: `camera.drive` takes the roll from the
  path curvature 3.6 m ahead, and the centripetal Catmull-Rom path is only C1, so its curvature
  jumps at each control point (and swings sign between (-1.5, 29) and (-5, 43)). As the curvature
  probe crossed (-5, 43) the roll went from -0.2 to +0.8 deg in 12 frames, a roll rate of
  2.2e-3 rad/frame (3 deg/s). The yaw (look-at 12 m ahead) was already smooth.
  Fix: `smooth_camera_turns()` low-passes the camera's roll keys with a Gaussian of sigma 0.5 s and
  the yaw keys with sigma 0.25 s (odd-reflection padding at the ends), before
  `calm_road_vibration()` adds its slow bounce. Position keys are untouched (cruise step still
  0.2167 m/frame, landmark screen positions in `report()` within 0.02, plate margin unchanged).
  Camera keys, Blender dump: largest frame-to-frame change of angular rate over the cruise
  6.0e-4 -> 8.9e-5 rad/frame (max / p95 1.8 -> 1.2), largest roll rate 2.2e-3 -> 4.1e-4 rad/frame,
  roll rate over Blender 224 to 240 now a smooth -0.13 to -0.31e-3 rad/frame (was +0.46 to -2.23 and
  back). Rendered (half scale, measured like for like on the mp4 downscaled): top-of-frame star drift
  over Blender 220 to 242 now eases 1.05 -> 0.2 px/frame with no reversal (was 1.5, -1.3, +1.0), and
  the row y=120 kymograph shows smooth trails where the old one zigzags.
- **Pan speed-up at mp4 92 to 97 (t 3.8 to 4.0 s)** (low). Confirmed, same cause at control point
  (0, 15): top star drift 2.55 -> 4.1 px/frame in 5 frames (+0.4 per frame) with a roll swing of
  -0.5 to +1.3e-3 rad/frame. After the fix it rises 2.7 -> 3.4 px/frame over 18 frames (at most
  +0.1 per frame). Frame mean luma over the range matches the mp4 within 1.
- Stills at 1.0, 4.0, 7.0 and 9.5 s: frame mean within 0.3 of round 4, share above luma 200
  unchanged (2.17 to 3.34 percent), mean RGB within 0.3; the sky sits 2 to 4 px over at the top
  corners (the smoothed roll differs by 0.1 to 0.24 deg at those times), the hood is pixel-locked.
- Checked and judged not defects (blind video critics, 2 fps contact sheet):
  - "Small jump between frame 0 and frame 1": ffmpeg `scdet` scores the first pair against a
    zero previous difference; the mean absolute frame difference is 2.70 for 0 to 1 and 2.61 to
    2.71 for the next pairs, the mean luma step is +0.3.
  - Festival strings and lanterns "popping" or "hard-cropped" at the top edge (2 s, 4.5 s, mp4 47
    and 110): they are visible from frame 0 and rise out of the top edge as the jeep passes under
    them, about 70 to 100 px/frame, as anything overhead does at this field of view. The round 4
    bloom fade holds: the top-200-row mean eases 59 -> 27 over 7 frames, the frame mean changes by
    at most 1.6 per frame. The 4 to 5 s brightness fall (64.8 -> 49) is the string's lit bulbs
    and their light pools leaving view over 16 frames, not an exposure step.
  - Palm fronds "popping in" at the top left at 5 to 6 s: frame by frame (mp4 112 to 123) they
    sweep in continuously from the edge as the road turns left.
  - "Street tint pulses" in the first 5 s: the road's mean RGB changes by at most 0.7 per frame;
    the teal phases are the teal lantern posts' pools approaching and passing.
  - Static "comet or smudge" near the right palm: it is the comet, a sky layer at infinity; the
    road is straight for the first 2 s, so it holds still with the stars.
  - Moon and Milky Way sliding right: the road bends left (yaw 0 to -16 deg), so the sky moves right.
  - "Stall" at 6 to 10 s and "the gate barely grows": the camera keeps a constant 5.2 m/s to 10 s
    (0.2167 m/frame); the slow approach is the brief's cruise timing and the gate's distance.
  - Outro dim, end card size, length and URL, and the final fade (10 to 14 s): set by BRIEF.md and
    `kit/finish.py`.

### 2026-11-02, round 4: motion QA fixes (bloom pops at the frame edges, camera buzz, AAC peak)

Each defect was first confirmed on frames pulled from `out/05-moonlit-desert-oasis.mp4` (mp4 frame n
is Blender frame n + 1), then checked after the fix on half-scale frame ranges (deleted afterwards)
and on full-resolution stills at 1.0, 4.0, 7.0 and 9.5 s against the round 3 stills.

- **Bloom pop as each festival string leaves the top edge** (high; mp4 45 to 47 and 108 to 109).
  Confirmed: the whole-frame mean fell 73.0 to 58.6 over two frames and 69.1 to 56.0 in one, and the
  top-200-row median 139 to 47. The near strings' bulbs (strength 110, 26 per string, 3 to 5 m from the
  camera) were blooming as 1/d^2 into a warm haze over the sky, and the screen-space compositor bloom
  lost it the frame the last bulb left. Two fixes:
  - `near_fade()`: the bulbs of `Near0`, `Near1` and the two festival lanterns (own material
    `FestLanternGlass`) scale their emission by clamp((d / 9 m)^2, 0.05, 1), d = camera distance
    (Camera Data node), so radiance x solid angle stops growing once a string is closer than 9 m. The
    bulbs still clip bright; only the halo stops growing. The lantern now reads as a lit amber lantern
    instead of a blown white blob as it passes overhead.
  - `comp_bloom_edge_fade()`: the bloom and fog-glow input of non-sky pixels fades to zero over the
    top 20 percent of the frame (smoothstep), so a halo has gone before its light leaves. Sky pixels
    are untouched, so the Moon keeps its bloom.
  Result (half scale, mp4 37 to 51 and 103 to 112): the whole-frame mean now eases down by at most
  1.4 per frame (60.0 to 53.2 over 11 frames), the top-50-row median 49 to 20 over 7 frames. The
  approach brightening (critics' "auto-exposure pumping", 57.6 to 73.0 then a cliff) is now about
  52 to 61 and back over 10 frames. The teal-green floor tint under the string was the same warm
  haze over the blue floor; the floor's mean RGB now changes by at most 0.6 per frame there.
- **Side-edge bloom pops** (low; mp4 22 to 23, 115 to 116, 188 to 189, 225 to 227). Confirmed (local
  cell drops of 6 to 19 luma, the jars by the right-edge bollard going from warm to blue at once).
  `overscan_sides()`: the frame renders 108 px wider on each side (1296 x 1920; the camera fits its
  sensor vertically, so the visible frame and pixel scale are unchanged), the edge mask fades the
  bloom input to zero across that hidden margin, and a `render_write` handler crops every written
  frame and still back to 1080 wide with OpenImageIO (pixel exact, also at `--scale`). Lights keep
  their full halo while visible and it dies out over 3 to 5 frames after they leave. Largest cell step
  at those exits is now 1.7 to 3.3 per frame (was 6.2 to 11.3); the jar region now falls 95 to 51
  over 10 frames instead of 66 to 47 in one. The kit vignette (normalized coordinates) is rescaled
  so it is identical on the visible frame; `--export-web` temporarily goes back to 1080 wide so the
  glTF camera keeps aspect 0.5625. An in-frame side fade was tried first and dropped: it took 10 to 17
  luma of glow off the outer quarter of the town band in the stills.
- **Camera buzz** (medium; whole film). Confirmed: per-frame vertical sky shift RMS 2.5 px, up to
  4.9 px, against a locked dash, which is exactly the kit's vibration pitch term (0.18 deg, sines up
  to 6.9 Hz). `camera.drive(vibration=0.0)` plus `calm_road_vibration()` on the camera keys: 2.5 mm
  vertical bounce at 1.23 and 2.27 Hz, 0.035 deg pitch at 0.83 and 1.67 Hz, 0.025 deg roll at 0.61 Hz.
  Measured on half-scale frames 1 to 28: sky shift RMS 0.08 px per frame, max 0.14 px (full-res px).
  The path, sway and yaw are unchanged (stills match round 3 within 4 px).
- **AAC true peak -0.5 dBTP** (low). Confirmed with ffmpeg ebur128 (WAV -1.5, mp4 -0.5; all overs in
  the first 13 ms, the opening downbeat). New `make_audio.py`: renders the kit preset, then a 4 ms
  fade-in and the first 25 ms held 2 dB down with a 30 ms cosine release (bit-exact after 55 ms),
  test-encodes AAC like finish.py and reports. Through a finish.py-identical mux the true peak is now
  -1.5 dBTP (was -0.5), loudness -14.0 LUFS unchanged. The render operator must run it in place of
  the plain kit command: `python3 -I films/05-moonlit-desert-oasis/make_audio.py --out
  out/05-moonlit-desert-oasis.wav` (it refuses a WAV it has already processed).
- Stills at 1.0, 7.0 and 9.5 s: frame mean within 0.7 of round 3, clipped share unchanged (2.2 to
  2.9 percent above luma 200). At 4.0 s the mean drops 71.9 to 66.5: that is the string haze over
  the sky going away; stars and the Moon read crisper there.
- Not changed (judged not defects of this film's build): the end card size, plain URL, its position
  at 71.5 percent and the 10 to 11.2 s dim (all set by BRIEF.md and kit/finish.py); "ends at luma 16,
  not black" is not so (the last mp4 frame is luma 0.0, max 0; the fade runs 13.6 to 14.0 s); the
  camera not reaching the gate (the cruise timing is set by the brief, the gate holds the vanishing
  point); the two garland passes (different bulb mixes; what made them read as one repeated event
  was the identical haze pump and pop, now gone).
- Cost: full-resolution stills now take 6.3 to 8.6 s each (were 3.1 to 5.0 s) with the GPU shared;
  about 20 percent of that is the overscan.

### 2026-11-02, round 3 (after blind critics round 2: ours 5.2 overall vs reference 7.2, 0 of 3 preferred ours)

Dimension averages were sky 5.3 (reference 3.2), world 5.2 (7.0), light 6.2 (7.7), POV 5.7 (7.3). What
several critics agreed on, and what changed, in order of expected gain:

- **Dead lower half, small far town, dark vanishing point** (all three). Houses are now 2 to 3 storeys
  (6.4 to 9.8 m for three in four) and stand right behind the walks (facades at lat 6.3 to 6.9 right,
  7.35 to 7.9 left, were 8.8 to 12); the right side before the inn stays low so the hero reads. A new
  landmark, the oasis gate (two tapering blue towers, a horseshoe arch with turquoise zellige, warm
  bulbs and a big pierced lantern, magenta and cyan uplights), spans road and channel at s 121 and holds
  the vanishing point in all four stills (x 0.31 / 0.40 / 0.63 / 0.79), the far street's lights glowing
  through it. Near-field emitters fill the lower frame: brass lantern bollards every 6 m along the right
  kerb and the channel coping, more awnings, five stalls on the walks close to the kerb. Row luma of
  the town band (rows 9 to 12 of 20) is now 88 to 122 (reference 62 to 96).
- **Asphalt with lane lines in a desert town; uniform smeared reflections** (all three). The road is
  wet sandstone setts (`mat_pavers()`): 42 percent mirror puddles (rough 0.035) in dry rough stone, damp
  rims, dark wet joints, streak ridges only inside the water; no lane lines. Compositor road streak
  1.4 over 110 px down to 1.0 over 90 px.
- **No oasis** (critics 1 and 3). A stone-lined irrigation channel (falaj) runs along the left kerb
  with still water, a coping, date palms leaning over it and lantern posts whose lamps hang over the
  water. Saguaro-style cacti became prickly pears (the cactus of North African and Arabian oases)
  strung with lights, plus potted agaves; the neon cactus sign became an eight-point star.
- **Sky soft, magnified, confetti stars, core filling the sky, no horizon gradient** (all three). New
  plate `potw1713a` (see Sky): 2.6x downsampled instead of 1.78x, `Closest` sampling, star chroma at 15
  percent of the photo's, a narrow diagonal band from the core just under the left skyline to the upper
  right with dark sky on both sides, extinction toward the horizon, a warm light dome over the town
  and a faint teal airglow. Compositor lens distortion off (its resample softened the stars) and film
  grain 0.022 to 0.012 (its chroma part read as colour speckle in the dark sky).
- **Moon and comet as stickers; palm crossing the Moon in t7** (all three). Moon 3.6 to 2.4 deg, moved
  into the dark sky above the band (az -9, el 27; clear of every palm in all four stills), earthshine
  0.6 to 3.2 percent so the maria show, kit limb ring replaced by a soft scatter halo. Comet 15 to 7.5
  deg and dimmer, cream dust fan, new straight blue ion tail and a 2 to 3 px nucleus; it hangs over the
  inn at 1 to 4 s.
- **Vehicle read** (all three). Rivets, latches, bolts and wipers removed (the "beads" and the "stray
  bar"); the steering wheel's top arc is thinner and higher (top 6.2 to 8.8 percent) with a cool rim
  light; a satin trim line on the dash; a small brass dash compass glowing amber as a warm anchor; a
  chrome strip on the hood's front lip; the visible hood is flatter so it mirrors the lit town band.
  A-pillars were left out again: a jeep's frame posts sit 45 deg or more off-axis at this field of view.
- **Render noise** (all three: stipple on the sand, a speckled lamp post, dithered shadows). Found by
  rendering without the windshield: the kit's dithered glass left a fine stipple over the whole frame.
  The glass is gone (the frame rail stays). Also the inn's ground-level uplights no longer cast shadows
  (grazing-angle stipple on the forecourt) and `trace_max_roughness` 0.55 to 0.4.
- **Muted palette** (critics 1 and 3). A cool split tone in the compositor (shadows and midtones
  x (0.84, 0.9, 1.25), highlights neutral), compositor saturation 1.12 to 1.18, bloom threshold 1.15 to
  1.0, house washes 2200 to 2600 W, haze 0.0004 to 0.0012 so lamps glow into the air. Frame mean RGB
  is now (47 to 83, 43 to 67, 68 to 78), was warmer and greyer.
- Iterations at half scale: it1 had the compass as a huge amber disc and brick-red setts (sett tone
  made cooler and larger, compass shrunk to a 4 cm dome); the first full-resolution sky showed red and
  blue star fringes (chroma split moved from a Gaussian low-pass to a grey-opening background) and
  blobby stars (`Linear` to `Closest` sampling).
- Final measurements (full resolution): 2.2 to 3.7 percent of pixels above luma 200 (reference 1.4 to
  1.6), clipped pixels 0.8 to 1.8 percent (string bulbs and lanterns), sky top 30 percent mean RGB
  (19 to 98, 23 to 68, 54 to 72), 1st percentile luma 3.3 to 7.1.

### 2026-11-02, round 2 (after blind critics: ours 5.3 overall vs reference 7.8, 0 of 3 preferred ours)

All three critics agreed on: the road as a featureless magenta mirror slab (a canal), the Moon as an
orange disc with a neon ring at rooftop height, a soft smoky CG Milky Way with confetti-coloured
stars, a purple haze lifting the blacks plus uncontrolled bloom, random RGB fairy lights, a thin
generic world without an oasis identity, and a hood camera with no cabin. Changes, in that order:

- **Road.** Neutral dark asphalt (base 0.034, was sand-brown), lane markings on (warm-cream centre
  dashes 3 m / 6 m, pale edge lines), puddles cut from 72 percent at 11 m scale to 38 percent at about
  2.2 m (rough 0.05) inside a 0.13 wet film, so reflections break into vertical streaks. Road mean
  RGB now (11 to 42, 24 to 37, 57 to 66), blue like the reference, not maroon (was 72, 32, 63).
- **Sky.** Replaced the kit's all-sky Milky Way (ESO all-sky at 17 px/deg, soft at film scale, with
  Gaia grain) and the NASA catalogue stars with one real photograph, `potw2133a`, cropped, flattened,
  rolled -30 and magnified 2.3x (see Sky above). Turned off the compositor's lens dispersion (0.006
  split every star into red/cyan "confetti") and the star glow. Sky background between stars is navy;
  stars are blue-white points with a few pale amber ones.
- **Moon.** The orange Beletsky earthshine disc at el 9.5 became the kit's LRO crescent: cool white,
  phase 0.17, earthshine 0.6 percent, at el 27 in the upper fifth, lit limb toward the sun below the
  dawn horizon. It is in all four stills (x 0.51, 0.60, 0.83 behind a palm frond, 0.93).
- **Comet.** 21 deg to 15 deg, moved from the upper left to low over the far street (it sits above
  the lantern tower at 7 to 9.5 s), tail rolled away from the sun, plus a tight nucleus.
- **Grade and bloom.** View exposure -0.55 (was -0.4), bloom 1.35 / threshold 0.85 to 0.85 / 1.15,
  fog glow 0.18 to 0.08, compositor saturation 1.3 to 1.12, haze density 0.0009 to 0.0004. The inn
  forecourt spill, the wagon glow, the gate lantern and the water-tower lights were cut 40 to 60
  percent (the t4 right-edge burn and the t9.5 top-left blow-out are gone). p1 luma 1.7 to 4.0.
- **Palette.** Fairy lights mostly warm amber with teal accents, lantern posts teal / amber / cobalt
  with one magenta, festival strings warm with one teal or magenta bulb in five.
- **World.** Two festival strings on carved poles cross the road 8 to 20 m ahead with brass
  lanterns (overhead parallax, reflections in the near road); three night-market stalls (striped
  canopies, valances, fruit baskets, rugs, hanging lanterns) with robed figures; guests at the inn
  gate; rugs over parapets; drifted sand mounds along the walks; plaster bump and colour variation
  up; neon signs turned into projecting blade signs on iron brackets so they face the driver (every
  second house); palms varied 0.78 to 1.25. The water tower got an onion dome with a saffron finial
  and bulb rings (less Americana) and moved to s 86, lat -10, so it stands whole in the left third
  at 7 to 9.5 s instead of clipping the top-left corner. The lantern tower moved onto the far
  street's vanishing point (s 170, lat -17) with a warm lantern room: the t9.5 focal point.
- **Vehicle.** Hood cover 15 to 11.8 percent, glossy bottle-green paint that mirrors the street,
  a dark dash lip and the top arc of a thin steering wheel at the bottom edge, so the frame reads as
  a cabin. A-pillars were tried on paper and dropped: at fov_v 62 (hfov 37) a real jeep's frame posts
  sit 30 deg or more off-axis and a low jeep windshield's top bar would cut the horizon.
- Half-scale iterations it1 to it14: it1 had the plate far too bright and brown (sky mean RGB
  99, 84, 109); the grade went through contrast 1.3 to 1.9 and a cool white balance; the dash box
  first covered 18 percent (its far edge rose in frame) and was rebuilt shallow; puddles at 3 m scale
  mirrored the bright band as grey blotches in the near road and were made smaller and softer.
- Final measurements (full resolution): sky mean RGB (56 to 97, 49 to 76, 95 to 105), 1.2 to 2.8
  percent of pixels above luma 200 (reference 1.2 to 1.6), clipped pixels 0.01 to 0.10 percent.
- 3-frame full-resolution motion probe (frames 160 to 162): sky region mean stable to 0.5 luma level
  per frame; per-pixel change is the expected pan of the star field. Frames deleted.

## Timings (M4 Pro, GPU shared with three other Blender sessions)

- Scene build 7.3 s (1609 objects).
- Half-scale stills 1.6 to 1.7 s each (cold first still 5.5 s).
- Full resolution 1080 x 1920, 64 samples (round 3): 3.1 to 3.3 s per still warm, 5.0 s for the cold
  first still (4 stills plus the build: 23 s wall clock).
- `--export-web`: about 20 s including the first JPG encode of the 5232 x 3688 sky plate,
  `web/scene.glb` 12.1 MB.

## Kit issues

- `camera.drive` measures arc length from the first control point, so a lead-in point such as
  `(0, -40)` puts the camera 40 m back and shifts every `s` placement; the README example reads as if
  the second point were the start. Worked around by starting the points at `(0, -10)` and checking
  with a per-time landmark report (`report()` in build.py).
- `sky.photo_plate` names its web JPG by the plate path only (`rect_<name>_<hash(path)>`) and reuses
  an existing JPG, so editing a plate file in place leaves a stale web texture. My plates were final
  before the first export; delete `assets/web/rect_moon_beletsky_*` and `rect_comet_mcnaught_*` if the
  plates are regenerated.
- Non-camera rays see the sky at `light` gain (0.04 here), so the Moon, the comet and the band do not
  reflect in the puddles. By design for lighting, but a wet road under a huge Moon would want it.
- On the web the Moon is additive (documented), so stars show through its dark side there.
- `sky.json` rect layers carry no `"add"` key, so the viewer adds them; a `blend='replace'` photo
  plate would sit on top of the all-sky layers there (double Milky Way, double stars). The viewer
  already supports `"add": false`; build.py wraps `pk.sky.export_json` and sets it on the plate.
- `comp.setup` defaults to `dispersion=0.006`: on a dense photographic star field it splits stars
  into red and cyan fringes (the critics' "confetti"). Set 0 for photo-plate skies.
- `sky.moon(light=...)` adds a full-specular sun lamp; from in front of the camera it glares as broad
  lavender blotches on rough wet asphalt. build.py sets its `specular_factor` to 0.15.
- `vehicle.cover_z` places a height at a given frame fraction for one forward distance only; a box
  built around that point rises in frame with its far edge (my first dash box covered 18 percent).
  Build near-camera parts so their far top edge is the one placed with `cover_z`.
- No multi-object merge or multi-box helper in the kit; build.py has `merge()` (bmesh append with
  material remap) and `multi_box()`.
- `vehicle.car_dashboard` / `mat.windshield`: the DITHERED glass (needed so motion vectors survive)
  does not fully converge at 64 samples and leaves a fine stipple across the whole frame, which the
  critics read as render noise in the shadows, on sand and on walls. Found by rendering with and
  without it; this film leaves the glass out.
- Rect sky layers are always sampled `Linear` (`sky._rect_nodes`), which on the GPU picks a blurrier
  mip level when a plate is minified 2 to 3x (only equirect layers take `interp`), so
  `sky_sampling()` sets the Milky Way node to `Closest` after the world is built.
- `sky.moon(halo=...)`: the halo's sharp inner term draws a thin bright ring around the whole disc,
  dark side included (the critics' "emissive rim"). build.py sets halo 0 and adds its own soft
  additive halo layer.
- `comp.setup` grain has a fixed 35 percent chroma component; in a dark photographic sky it reads as
  RGB speckle. Grain 0.012 here.
- `geo.road_from_curve` builds the same cross-section on both sides; the channel, its coping and the
  asymmetric walks are built in build.py (`street()`, `strip()`, `wall_strip()`).
- `assets/web/05_comet_nucleus.jpg` (round 2) is orphaned; round 3 writes `05_comet_nucleus_r3.jpg`.
- `camera.drive(vibration=...)` is documented as a subtle vertical road vibration from low-frequency
  sines, but the same value also drives pitch (degrees(vib * 4) * 0.5) and roll (degrees(vib * 6) *
  0.4) through sines at 1.13x the vibration frequencies, i.e. up to 6.9 Hz. At 0.0016 that is a
  0.18 deg pitch buzz (2.5 px RMS per frame at full resolution), above the kit's own 0.15 deg shake
  cap. build.py passes 0 and adds its own slow bounce to the keys (`calm_road_vibration`).
- `comp.setup` bloom and glow are screen-space: a light's halo and the glow it spreads over nearby
  surfaces vanish in one frame when the light crosses the frame edge, and very near bright emitters
  pump the whole frame. There is no overscan option. build.py renders 108 px wider on each side,
  fades the bloom input in that hidden margin and over the top 20 percent of the frame, and crops in
  a `render_write` handler (`overscan_sides`, `comp_bloom_edge_fade`); the kit vignette uses
  normalized coordinates with a fixed 1080 x 1920 aspect, so build.py rescales it for the wider render.
- `camera.drive` takes the roll from `Path.curvature` (a +-1 m heading difference) at
  `s + 0.3 * look_ahead`, but `Path` is a centripetal Catmull-Rom spline, which is only C1: the
  curvature jumps at every control point and can change sign between two of them, so the roll
  swings by up to 1 deg in 8 to 12 frames as the probe passes a control point (the sky zigzags).
  build.py low-passes the roll and yaw keys (`smooth_camera_turns`); a kit-level fix would smooth
  the curvature over a few metres or build the path as a C2 spline.
- `kit/audio.py` masters to -1.5 dBTP, but a mix that opens on a full-level transient in the first
  10 ms overshoots by about 1 dB in AAC (no lead-in for the encoder). `make_audio.py` trims the
  opening; a short fade-in alone (3 to 10 ms) did not help because the peak is at 5 to 13 ms.

## Open issues

- The Milky Way plate covers the views down to el 3 deg in the middle and 5 to 8 deg at the frame
  edges; below that it fades to the light dome without stars. Buildings hide it in all four stills,
  but a lower skyline at the far left at 7 to 9.5 s would show a starless wedge.
- The band is a real photograph shown 1.3x smaller than life; it is still wider than the reference's
  stylised stripe (about a third of the sky).
- The comet is only in frame from 0 to about 5 s (it sits over the inn and leaves on the right as the
  road bends left).
- The canal water mirrors the dark walk and wall more than the lamps; it reads as a dark glossy strip
  with a few reflections, not a bright mirror.
- Robed figures are simple lathe silhouettes with arms, not animated.
- t4 has a strong teal pool on the near-left setts from the teal lantern post over the channel.
- Palm fronds are folded ribbons with a zig-zag edge, not individual leaflets.
- On the web the potw1713a plate covers only the cruise's view cone; free look beyond it shows the
  kit's all-sky Milky Way, which is softer and differently graded. The web scene has no windshield
  either way (it was never exported).
- Motion was re-checked in round 4 on half-scale ranges around every QA defect (frames 1 to 28,
  36 to 52, 103 to 120, 185 to 192, 223 to 230), not on a full sequence. The string halo still rises
  gently (about +8 on the frame mean) as each festival string approaches and eases off over about
  10 frames as it passes overhead; that follows the visible lights and no longer steps.
  Round 5 re-checked the camera turn on Blender 220 to 242 and 86 to 104 at half scale and on the
  dumped camera keys for all frames, not on a full sequence.
- `web/scene.glb` was exported before round 5, so its camera animation still has the unsmoothed
  roll; re-run `--export-web` to carry the fix to the three.js edition.
- The overscan crop needs OpenImageIO in Blender's Python (bundled with 5.2). If the
  `render_write` handler fails, frames would come out 1296 wide; finish.py would then reject or
  misplace them, so check the first frame's size.
