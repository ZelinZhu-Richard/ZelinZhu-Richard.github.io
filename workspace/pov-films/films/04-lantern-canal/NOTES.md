# 04-lantern-canal: notes

## Reference analysis

Measured on `reference/ref_1s.png` to `ref_9s.png` (720 x 1280) and the 2 fps contact sheet.

- **Horizon / vanishing point**: 41 to 44 percent of the frame height from the bottom. The
  camera pitches up a few degrees, so the sky owns the top half and the town sits in a band
  from about 45 to 70 percent from the top.
- **Dashboard coverage**: the dark dash fills the bottom 14 to 16 percent at the centre, bowing
  down toward the sides; a thin bright rim line at its edge catches the street. A steering
  wheel arc fills the bottom 8 percent. The foreground never moves relative to the frame.
- **Brightness profile** (row-mean luma, 0-255, top to bottom): sky 7 to 40, rising to 60-100
  in the town band (rows 0.44 to 0.66), road 55 to 90, dash 0 to 10. Frame mean luma 38 to 46.
  The sky is very blue: mean RGB about (20, 25, 95), median luma 12 to 18, p98 150 to 200 (stars,
  moon, neon).
- **Landmarks and timing**: the amber hero sits at the vanishing point at 1 s, grows and drifts
  right, and leaves the right edge around 5 to 6 s. A striped tower starts left of centre and
  swings past the left edge between 7 and 9 s while the road bends right. A windmill-like rooftop
  device crosses the top right corner at 5 to 7 s. Small props (lifebuoy posts, lanterns, plants)
  pass the bottom corners every second or so.
- **Density of lights**: roughly 150 to 250 distinct light sources on screen at any time: lit
  portholes in every building, neon signs, neon flower motifs in the sky, lamps, and their
  reflections. Nothing is unlit; every building has at least two glowing openings.
- **Palette**: deep cobalt and violet night (buildings are blue/violet, lit by cool fill so their
  shapes read), saturated neon magenta, cyan, green and orange accents, one warm amber hero.
  The road carries most of the colour: long vertical streaks of every light.
- **Depth layers**: (1) dashboard; (2) road edge props and plants at 2 to 10 m; (3) the street's
  buildings at 10 to 60 m; (4) a dense skyline packed to the horizon; (5) sky with diagonal Milky
  Way (upper left to lower right), a large crescent moon top right, neon motifs floating in the sky.
- **Why it works**: one clear leading line (the curving road) into a glowing vanishing point,
  warm against cool, extreme density without clutter because everything shares one blue
  ambient, strong bloom, a sky that is both dark and busy, and steady slow parallax.

## Design (as built)

An original canal town at the end of twilight, seen from the bow of a small wooden boat.
Everything is procedural in `build.py`; the only external images are the sky photo and the moon
maps (below).

- **Palette**: deep navy night. Facades mix cool plaster (indigo, teal, violet) with warm ochre,
  terracotta and cream, plus dark vertical-board timber houses and half-timbered upper floors
  (dark posts, beams and braces); dark glazed barrel-tile roofs with upturned ridge ends, cream
  trims, shutters, striped awnings, balconies, flower boxes, chimneys, water doors with stone
  steps, noren curtains and andon paper lamp boxes at the shop doors, dyed cloth banners on
  poles along the right quay (disc, wave and stripe motifs, no lettering), plaster grime 0.45.
  Windows mostly warm 2700 K (lattice, shoji, plain sashes), a few cyan and pink, about 28
  percent of upper windows dark (40 percent on the far terraces). Saturated accents from paper
  lanterns (vermilion, orange, coral, magenta, gold, teal). One warm hero: the amber three-tier
  tea house and its huge round lantern.
- **Path**: canal centre line `(0,0) (0,12) (0,30) (1.4,46) (4.6,62) (9.6,78) ...`: straight
  for 30 m, then a gentle right bend (camera heading 3 degrees at 5 s, 11 degrees at 10 s,
  15 degrees at 14 s). Boat speed 4.2 m/s (42 m in the cruise), easing to 0.4x after 10 s so
  the camera keeps moving through frame 336. Eye 1.25 m above the water, vertical FOV 62
  degrees, pitch 5.5 degrees (horizon at about 43 percent from the bottom). Boat motion as
  additive F-curve generators (`BOAT_*`, `add_sines`): heave 1.6 cm at 2.9 s (+0.6 cm at
  1.7 s), roll 2.1 degrees at 4.2 s (+0.5 at 2.3 s), pitch 1.1 degrees at 3.3 s, yaw drift
  0.9 degrees at 6.5 s. Round 5: the rower's head (camera) follows only part of it
  (`HEAD_FOLLOW`: roll 0.5, pitch 0.55, yaw 0.55, so the camera has roll 1.05 + 0.25, pitch
  0.6, yaw 0.5 degrees and the full heave); the rest, plus 0.8 cm of heave the torso absorbs,
  rocks the bow in the frame about a pivot near the waterline under the boat's middle
  (`bow_rock`, `ROCK_PIVOT`). The horizon tilts one way while the bow dips and swings the
  other; the stem moves about 25 x 31 px, at most 1.4 px per frame. The kit's road vibration
  is off (`vibration=0`, round 4).
- **Vehicle foreground** (my own geometry, car-frame, attached to the camera rig): a V-shaped
  varnished foredeck with plank seams between rounded cap rails, teal hull with a brass rub
  strip, a short red-lacquered stem post with a small brass knob. The whole bow is built
  0.17 m left of the eye (`BOW_X`, the rower sits off the centre line), so the stem sits at
  x = 0.4 of the frame and never blocks the vanishing point; the bow tip is at 12.5 percent
  of the frame height (`BOW_COVER`). A coiled rope (left), a celadon teapot and cup. The bow
  lantern hangs from a tapered bamboo pole (nodes, lashing at the stem) that arches forward
  and left from the stem, so the round paper lantern hangs over the water just ahead of the
  bow at frame (0.235, 0.215) (`LANTERN_FX/FY`; 0.27 until round 4, which put it right behind
  the end card), clear of the right-hand phone UI; it swings as
  a pendulum (`LANTERN_SWING`, round 5: 7 degrees fore-aft at 1.9 s, 6.5 degrees sideways at
  2.45 s, was 4.5 and 3) and hangs plumb while the bow rocks under it, with a 14 W light
  plus a 4 W rim light on the stem and rails. Bow wave (`bow_wake`): from 1.25 m eye height the
  water is hidden until about 2.5 m ahead (the stem), so two frothy foam ribbons per side fan
  out wide from just ahead of the stem (noise-broken alpha, streaming at boat speed, 5.5 cm
  above the water so heave and roll never sink them) and reach the bottom corners as a V of
  leading lines. A cool area fill (light-linked to the bow only) keeps the deck readable.
- **Reflective surface**: the canal (`water_mat`): near-black blue-green water, roughness 0.025
  to 0.06, three animated bump layers (a long swell whose crests run across the canal, mid
  ripples, fine fore-aft ridges; no hard remap, which had stepped reflections into blocks), so
  every lantern and window mirrors as a long, rippled vertical streak. Compositor road-streak
  lengthens them (90 px, threshold 0.45), fed only from the water (AOV `pk04water`) and hung
  below each light (`streak_from_water_only`, round 4). The moon's sun lamp does not light the
  water (`moon_off_water`, round 4). A low mist volume (density 0.012 at the water,
  0.55 m falloff, now 0.009) sits under the thin town haze (0.0006). Floating paper lotus
  lanterns (100, pad + two petal rings + candle and flame, every fourth with a 10 W light) and
  900 drifting petals; eight more lotus lanterns (14 W each) are routed 1.0 to 1.3 m off the
  boat's track, 5 to 9 m ahead of the bow at each still time, so they slide past the hull.
- **Landmark timeline** (s = arc length; camera s = 4.2 t):
  - 0 to 3.4 s: a small koi lantern (1.3 m) hangs low over the water ahead (s = 11, z 3.3 m)
    and swims with the boat at about 1.9 m/s while drifting across; we overtake it and it
    glides out over the top edge at about 3.2 to 3.4 s (foreground parallax hook; round 4,
    was a 0.6 m/s drift and a fast exit at 2.3 s).
  - Hero beat, the paper whale (7.2 m, keyed path with Bezier easing): small and high in the
    upper third at 1 s (s = 59, z 21), just above bridge A's parapet at 4 s, swooping low and
    big across the canal at 7 s (about 20 m away, half the frame width, left of the moon),
    gliding overhead at about 8.5 s and gone behind by 9.5 s. The gold koi (3 m) crosses the
    far canal right to left (t7 right of centre, t9.5 centre under the moon); the coral bird
    circles high on the right.
  - 0 to 5 s: stone bridge A (s = 27): warm grey stone (about #6b625a) in 0.3 x 0.15 m
    courses with value-only per-block jitter, macro staining and moss at the waterline, a ring
    of 33 slim voussoirs, parapet bulbs, post lanterns, a scalloped festoon of bulbs with
    lanterns at the dips (55 W warm pools on the stone), an 18 W light inside each crown
    lantern under the arch (`ARCH_GLOW`, round 5) that pools on the soffit, two 2400 K spots raking across the
    boat-side face from the quays (shadowed), townsfolk leaning on the parapet; the tea
    house's giant lantern glows through its arch and the tea house top
    tier rises above it (a low garden with bush hedges, fairy lights, two lantern trees and stone
    lanterns on the left bank, s = 31 to 46, keeps that sight line open). Lantern strings cross
    overhead at s = 6, 13, 19.5, 34.5, 40.5, 64, 70, 76.5 ... Paper whales, koi and birds float
    above.
  - 5.0 to 6.9 s: we pass under bridge A; its arch lanterns sweep past the top edge.
  - 6 to 10 s: the canal bends right; the tea house (left bank, s = 53, platform on stilts over
    the water, three curved hip roofs with upturned corners, lacquered columns, lattice
    windows) grows on the left; its giant amber lantern (2.7 m, hanging over the water) swings
    to the left frame edge by 9.5 s. Lantern strings now cross at s = 6, 19.5, 32, 50, 64,
    76.5, 92, 108, 124, 140 (fewer, so the sky above them stays clear).
  - six weeping willows (trunk, five arching limbs, 300 crossed-ribbon switches, larger fairy
    bulbs on every sixth switch, lanterns inside, 140 W crown glow); 96 fireflies drift around
    them and over the water margins.
  - 13 toy-like townsfolk (robe, big round head, hair bun or conical straw hat, two carry a
    paper lantern on a stick with a 12 W light, one child) on bridge A, the right quay, the tea
    house veranda and bridge B, with a slow sway.
  - throughout: moored boats (some with canopies and stern lanterns), mooring posts, 46
    floating candle lanterns, quay lantern posts, potted plants and cats pass the bottom
    corners; bridge B (s = 84) and a five-tier tower with teal neon eaves on an island (s = 186,
    on the canal axis) mark the vanishing point; 213 terraced hillside houses and dark hills fill
    the skyline.
- **Sky** (one star field only): ESO potw1713a crop x 0 to 5012, y 0 to 7400 px (galactic core
  region, far above the Paranal horizon, no telescopes or road lights). `sky_crop()` cleans it
  once into a cached 16-bit PNG: Lanczos resize in linear light to 31 plate px per degree
  (about 1.1 plate px per output px), split into a starless layer (2 px grey opening) and a
  star layer; the starless layer gets its chroma noise smoothed and a black point; the stars
  are desaturated to 22 percent and the faintest 82 percent of star pixels are faded out.
  Round 3: atmospheric extinction is baked into the plate from its placement (the plate is
  fixed in world space, so each plate pixel has a fixed elevation): stars fade to 22 percent
  and the glow to 60 percent at the horizon over 18 degrees (`SKY_FADE`), so the sky thins out
  above the far roofs. Projection: magnification 1.38 (was 1.65; 57 source px per degree,
  1.84 source px per output px, above the guide's 1.7 rule), the plate **mirrored left to
  right** with the core bulge at azimuth 9, elevation 16 and a -112 degree roll
  (`POV04_CORE`, `POV04_MIRROR`): the core sits over the far end of the canal and the long
  Norma-Centaurus stretch of the band climbs diagonally to the upper left, like the
  reference's diagonal band. Mirroring keeps the plate's near edge (852 source px from the
  core) below the far roofline; coverage checked with `POV04_SKYDEBUG=2` (flat mask) at 0, 1,
  2.5, 4, 5.5, 7, 8.5, 9.5, 11, 12.5 and 14 s: 1 uncovered pixel at quarter scale (2.5 s,
  behind the willow). Grade: exposure -0.1, contrast 1.36, saturation 0.72, tint (0.84, 0.9,
  1.18) (less blue cast, cooler dust); a warm amber town light dome (horizon glow 0.07, 16
  degrees). Twilight: kit atmosphere layer (background (0.0021, 0.0028, 0.0082), faint skyglow,
  level orange dawn glow toward azimuth 8). Moon: kit LRO/LOLA crescent, 2.1 degrees (was 3.3),
  phase 0.16, earthshine 0.045 (a dim blue-grey disc instead of a black hole), relief 0.9,
  halo 0.3, plus a wide two-Gaussian halo layer (`moon_halo`), at az 11, el 29 (nearer the
  centre), lit limb down, cobalt moonlight sun 0.5.
- **Neon motif**: paper animal lanterns: the hero whale, a gold koi, a coral gull-winged bird and
  the near koi, all on keyed paths with noise drift. `animal_paper_mat`: a warm centre where the
  paper faces the viewer and around the mid-body candle, saturated colour at the rims, darker
  and wider bamboo rib rings with a soft frame shadow beside each, wire lines along the body,
  painted detail (whale: deep blue back, pale cyan belly, throat pleats; koi: vermilion patches
  and scale scallops), a candle flicker (0.88 to 1.12, about 3 Hz) on the emission; painted
  cream eye rings and two hanging tassels per animal. Each carries a point light (180 to
  1300 W) that lights the roofs below it.
- **Light**: dark navy world ambient (0.005, 0.009, 0.04) and fill suns at 0.08 so the
  lanterns do the lighting; warm pools where every lantern string meets a facade (110 W end
  lights, shadow-casting for the strings before s = 80, so balconies and awnings shade the
  walls), door (60 W), balcony (45 W), quay (80 W) and andon (40 W) lamps; facade washes 420 W
  at 75 degrees (was 700 W at 95); bridge rakes 900 W (2400 K, shadowed); the warm hero (1000 W
  inside the giant lantern, interior spill, uplights); haze 0.0006 plus the low mist; bloom
  0.75 at threshold 1.2 (was 1.0); grain 0.016; a final split tone in the compositor
  (`cool_shadows`: the darkest values lean teal-blue, lit areas untouched); EEVEE shadow pool
  1024 MB.

## Plates used (credits from assets/LICENSES.md)

- `assets/sky/eso-potw1713a/potw1713a.tif` (cleaned, extinction-baked crop cached as
  `$TMPDIR/povkit-cache/04lc_p1713_v4_0_0_5012_7400_310_7bd9f09be0.png`; web copy
  `assets/web/04lc_04lc_p1713_v4_0_0_5012_7400_310_7bd9f09be0.jpg`), shown mirrored. CC BY 4.0.
  Credit: `ESO/B. Tafreshi (twanight.org)`
- `assets/moon/nasa-svs-4720/lroc_color_poles_4k.tif` and `ldem_16_uint.tif` (via
  `pk.sky.moon`). Credit: `NASA's Scientific Visualization Studio`
- No other sky data: the kit `galactic()` layers (ESO all-sky, NASA star maps) are not used.

## Timings (2026-11-02 round 3, M4 Pro, other films rendering on the same GPU)

- Scene build 5.0 to 6.4 s, 2999 objects (plate cleaning plus extinction bake about 8 s on
  the first run of a new placement only).
- Half-scale stills: 1.6 to 3 s each. Full-resolution stills: 5.8 to 10.8 s each (other films
  were rendering at the same time).
- Full-resolution sequence, frames 168 to 171: 29.9 s, **7.5 s per frame** (round 2 measured
  5.2 s on a less loaded GPU; round 3 adds about 14 shadow-casting lights, 8 lotus lights,
  townsfolk and banners). Frames deleted.
- Motion check: frames 1 to 336 at 0.25 scale, 16 samples (1.0 s/frame): the near koi sweeps
  overhead at about 2.3 s, the bridge vault fills the top at 5.1 to 6.3 s, the whale grows from
  4 s, swoops across at 7 s and leaves over the top at about 8.5 s; region luma steps only
  follow those big objects (no popping). Frames deleted.
- `--export-web`: `web/scene.glb` 24.0 MB, `web/sky.json` (4 layers: atmosphere, cleaned
  mirrored photo plate, moon, moon halo).

## Timings (2026-11-02 round 2, M4 Pro, other films rendering on the same GPU)

- Scene build 5.7 to 8.3 s, 2937 objects (plate cleaning about 3 s on the first run only).
- Half-scale stills: 1.5 to 5 s each. Full-resolution stills: 3.3 to 6.6 s each.
- Full-resolution sequence, frames 168 to 171: 20.7 s, **5.2 s per frame**. Frames deleted.
- Motion check: frames 1 to 72 at 0.25 scale, 24 samples (0.4 s/frame): the near koi grows,
  sweeps overhead at about 2.3 s and leaves; the s = 6 string passes overhead at 0.4 s; no
  popping. Frames deleted.
- `--export-web`: `web/scene.glb` 23.8 MB, `web/sky.json` (3 layers: atmosphere, cleaned photo
  plate, moon).

## Timings (round 1, M4 Pro, other films rendering on the same GPU: 7 other Blender processes)

- Scene build 4.3 s, 2699 objects.
- Half-scale stills: 2 to 4 s each.
- Full-resolution stills: 12.5 s for the first (shader compile included), 4.6 to 7.2 s after.
- Full-resolution sequence, frames 168 to 171: 22.2 s, **5.5 s per frame**.
- Motion check: frames 96 to 120 at 0.25 scale (2.5 s/frame); region luma changes smoothly
  (largest frame-to-frame step about 2 of 255, all trend), no popping, no flicker, ripples and
  floating lanterns drift gradually. Frames deleted.
- `--export-web`: `web/scene.glb` 19.1 MB, `web/sky.json` (3 layers: atmosphere, photo plate,
  moon).

## Changelog

### 2026-11-03, round 5 (blind video critics on out/04-lantern-canal.mp4; QA lists were empty)

Every critic note was checked on frames decoded from the mp4 (mp4 frame n = Blender frame
n + 1; quarter-scale numpy decode, optical flow and phase correlation in skimage). Fixes were
verified on a half-scale range (frames 100 to 160) against the same mp4 frames, on a scene probe
of projected positions over all 336 frames, and on full-resolution stills at 1.0, 4.0, 7.0, 9.5
(plus 12.708 s with finish.py's card composited). All test frames and the old-stills copy are
deleted. Stills: mean luma 48.6/58.0/71.8/61.1 -> 48.5/57.3/71.5/61.1, p5 and p98 within 0.4;
the small pixel differences are the slightly smaller roll and the bow position.

1. **Bow and lantern pole pixel-locked, no buoyancy** (two critics). Confirmed: the bow region's
   phase-correlation shift against frame 0 is 0.0 +- 0.1 px over the whole cruise; the bow
   lantern swung only about +-6 px (4.5 / 3 degrees on a 0.21 m hang). Fix: the boat motion is
   split between the head and the boat (`HEAD_FOLLOW`, `bow_rock`, see Design): the camera
   keeps almost the same motion (roll 1.2 -> 1.05 degrees, pitch 0.6, yaw 0.5, heave
   unchanged) and the bow now rocks against it about a waterline pivot; the lantern swings
   wider and hangs plumb. Probe over frames 1 to 240: stem knob x range 0 -> 25 px, y 0 -> 31 px,
   at most 1.4 px per frame; lantern x 12 -> 52 px, y about 1 -> 33 px, at most 1.9 px per
   frame. In the half-scale range the bow bobs 0 -> 11 -> 0 px over frames 100 to 136 (mp4: 0).
   The wake stays on the water (not rocked). At its highest point under the end card (12.71 s)
   the lantern cap sits about 20 px below the card's ink; only the pole still crosses "zel".
2. **Flat beige vault under bridge A** (two critics). Confirmed in part: the soffit is lit only
   by the two `ArchGlow` lights (with them off it goes black, top-20-percent luma 61 -> 26 at
   5.5 s; the quay rakes add about 2), and at 45 W 0.6 m under the crown they lit it evenly.
   Fix: 18 W inside each crown lantern (`ARCH_GLOW`, `ARCH_GLOW_DROP`), so the soffit has a
   lantern pool that falls off along the barrel and down the haunches. Top-20-percent luma,
   mp4 -> new half-scale render: frame 134 59 -> 49, 138 52 -> 40, 140 49 -> 32, 142 38 -> 21,
   146 58 -> 45, 148 72 -> 64; largest frame-to-frame step in that band 12.7 -> 9.8; frame mean
   under the vault 62 to 66 -> 59 to 63. The 4.0 s still is unchanged (arch interior, mean
   -0.7). The near face at 5.0 s (top band 104, festoon pools on the boat-side face) is the lit
   bridge we pass under and stays as built.

Judged not defects (no change):

- Whale "gone by 1 s, reappears much larger at 3.5 s": it is visible at 0 to 1.5 s (also at
  1.0 s), passes behind the near koi from about 1.75 to 2.9 s and is visible again from 3.0 s at
  a size consistent with its approach. Depth occlusion, not a pop.
- Near koi out of the top at 3 to 3.5 s, tea house lantern out of the left at 10 to 10.5 s,
  whale and lantern cropped at the edges at 8.5 to 10 s: continuous exits at 24 fps. Top-band
  luma falls 74 -> 22 over 14 frames (largest step 9 per frame); the left band, corrected for
  finish.py's dim gain, falls 258 -> 72 over about 20 frames (largest step 18) while the
  whole-frame level stays at 94 to 98, so no bloom pop. A 2 fps sheet shows each as a jump.
  The cropping is the planned swing past the frame edge on the right bend.
- Slow opening and "progress nearly stops at 7 to 10 s": the camera runs at a constant 4.2 m/s
  until 10 s. Median flow in the town band is 2.9 to 3.6 px per frame at 0 to 3 s and 2.9 to
  3.9 at 7 to 10 s (the same); only the bridge passage is faster (41 to 51 px per frame in the
  top band, the vault overhead). Changing the speed profile would re-time every beat and still.
- Bridge passage brightness and colour swing: motivated (we pass under a lantern-lit bridge);
  the vault part is reduced by item 2. The exit takes about 12 frames, not one step.
- Exposure drop at 10.5 to 11 s, 3 s dim end card, deceleration from 10 s: the shared outro
  (kit/finish.py dim from 10.0 s over 1.2 s, card from 10.6 s) and the kit's slow-down
  (`slow_after_s=10`, 0.4x). The vanishing point only shows the 3.3 s pitch at up to 1.4 px
  per frame; nothing settles or jumps at 10.5 s.

Not re-run: `--export-web` (the glTF still has the rigid bow and the 45 W arch lights). The
audio is unchanged; the render operator steps in round 4 still apply.

### 2026-11-02, round 4 (motion QA and video critics on out/04-lantern-canal.mp4)

Confirmed each report on frames extracted from the mp4, then fixed the real ones. Verified on
half-scale frame ranges 2-14 and 126-146, a quarter-scale range 25-88 and full-resolution
stills at 1.0, 4.0, 7.0, 9.5 (and 12.0 with the finish.py card composited, then deleted);
all test frames deleted. Still mean luma moved by at most +0.7 of 255, p5/p98 unchanged.

1. **Strobing blue-white glint right of the bow** (QA medium; critic: t5.29 to 5.42). Confirmed:
   in a fixed crop the blue-white pixel count jumped 5 to 535 frame to frame (frames 2 to 14)
   and 0 to 1243 (frames 126 to 146); it was the moon sun lamp's specular on steep ripple
   facets (the mirror image of the moon is just under the frame edge). Fix: `moon_off_water()`
   light-links the canal out of `MoonLight` (it still lights roofs, facades and the bow).
   After: 49 to 55 and 0 to 134 pixels, changing smoothly (the remainder is the bow wake),
   crop mean luma steady (9.8 to 12.2, 14.2 to 16.6).
2. **High-frequency camera judder** (QA low; critic: sky drift not smooth). Confirmed in the
   kit: `camera.drive(vibration=0.0005)` adds 0.06 deg pitch and 0.07 deg roll at 2 to 7 Hz
   (road vibration). Fix: `vibration=0.0`; the slow heave, roll, pitch and yaw generators stay.
3. **Vertical light pillars above the lotus lanterns** (critic). Confirmed in 1:1 crops: the
   kit's road streak takes every bright up-facing pixel (the candle flames and petal tops) as
   a source and blurs it up and down, so pillars stood above the floats. Fix:
   `streak_from_water_only()` multiplies the streak source by a water AOV (written by
   `water_mat`) and moves each vertical blur down by 0.45 of its size, so streaks are the
   canal's reflections only and hang below their light. Checked in frames 14 and the stills:
   no pillars, reflection columns unchanged in length.
4. **"Rainbow fringe" on the nearest lotus** (critic). It was the green lotus pad lit by the
   candle 12 cm above it, blooming as a bright green ring. Fix: darker, rougher pad.
5. **Jagged bridge lip at the arch exit** (critic, 5.5 to 6.0 s). Confirmed at 1:1 on frame
   139: the voussoirs stand 6 cm proud of the face with joint gaps and bevelled corners, so
   seen from below the lip is notched. Fix: a smooth 96-segment soffit band
   (`VoussoirSoffit`, 1.5 cm under the intrados) under the ring on both faces; frames 137 to
   143 now show one clean elliptic edge.
6. **Near koi whips out of the top** (critics, t2.0 to 2.3). Confirmed: it left the frame top
   at about 29 px per frame. Fix: it swims with the boat (1.9 m/s) and climbs to 4.15 m, so it
   glides out at about 15 px per frame around 3.2 to 3.4 s.
7. **End card over the bow lantern** (QA low). Confirmed: `card_y` 0.715 from the top is the
   lantern's height. finish.py is shared, so the lantern moved instead: `LANTERN_FY`
   0.27 -> 0.215. With the card composited by finish.py's own code on a 12.0 s still, the
   background behind "zelin" averages luma 50 against 41 for the rest of the line (was 66
   against 39); only the thin pole tip still crosses the first letters.
8. **Soundtrack** (QA low, two items; kit/audio.py is shared). Confirmed: tail L/R
   correlation -0.14 to -0.42 (mono fold 3.7 to 5.4 dB down) and -0.78 dBTP after AAC, with
   the overshoot on the bar-1 downbeat in the first AAC frame. Fix: `audio_post.py` (side
   limited to 0.6 x mid from 9.9 s on; 25 ms raised-cosine fade-in; the kit's true-peak
   limiter again at -1.8 dBTP inside a -14 LUFS loop). Measured after the same AAC encode as
   finish.py: tail correlation +0.47 (mono fold 1.3 dB), -1.67 dBTP, -14.0 LUFS, LRA 1.5 LU;
   the cruise (0 to 9.9 s) stereo image is untouched. `films/04-lantern-canal/audio.wav` is
   already written. **Render operator:** finish.py looks for `out/<slug>.wav` first, so run

   ```
   python3 kit/audio.py --preset 04-lantern-canal --out out/04-lantern-canal.wav   # if missing
   python3 films/04-lantern-canal/audio_post.py
   python3 kit/finish.py --slug 04-lantern-canal --audio films/04-lantern-canal/audio.wav
   ```

Also re-exported `--export-web` (`web/scene.glb` 24.1 MB, 2972 objects; sky JPGs reused), so
the three.js edition has the new lantern height, koi path and soffit band.

Judged not defects (no change):

- Exposure breathing (critics): EEVEE has no auto exposure. Mean luma follows big bright
  objects (the near koi, the bridge shadow, the tea house lantern); the koi swell is now
  slower (item 6).
- Whale tassels below the bridge lip while the body is hidden (critic, 5.5 to 6.0 s): correct
  occlusion. The whale is 26 m away behind the bridge; its tassels hang below the far lip and
  the body appears as the boat moves under the arch. Nothing intersects.
- Flat brown vault (critic, 4.75 to 6.1 s): it is the lit stone soffit of the bridge we pass
  under, by design.
- Sky "JPEG-like blotches" (critic): 1.5x crops of frames 24 and 200 show photographic dust
  lanes; the plate runs at 1.84 source px per output px (above the guide's 1.7).
- Giant tea house lantern half-cropped on the left edge at 9.0 to 10.3 s (critic): the hero
  swinging out past the frame edge as the canal bends right, like the reference's tower.
- Long, dim end card and no seamless loop (critics): the outro timing, 12 percent dim and
  black final frame are the shared spec (BRIEF.md, kit/finish.py).

### 2026-11-02, round 3 (after blind critics round 2: ours 6.5 vs reference 7, 3/3 preferred ours)

Fixed what several critics agreed on, in order of expected gain:

1. Sky not integrated (all three): stars as dense at the roofline as at the zenith, no town
   glow, a CG moon with a black disc, soft upscaled-looking plate, magenta-brown dust, blue
   cast. Extinction baked into the plate, warm light dome, fewer and less saturated stars,
   magnification 1.65 to 1.38 (1.84 source px per output px), cooler and less saturated grade,
   neutral black. Moon 3.3 to 2.1 degrees, nearer the centre, visible earthshine disc, softer
   terminator, wide halo. The lower magnification exposed the plate's near edge, so the plate
   is mirrored and re-placed (core over the far end, band diagonal to the upper left) and the
   coverage is checked with a mask render (`POV04_SKYDEBUG=2`).
2. Purple, oversized, flat-lit bridge (all three): warm grey stone, courses about half the
   size, value-only block jitter, 33 slimmer voussoirs, the teal/magenta washes replaced by
   shadowed 2400 K rakes from the quays, stronger festoon pools, chevron-like ivy removed.
3. Paper animals small, flat and never close (all three): keyed paths with a hero whale beat
   (above the bridge at 4 s, big across the canal at 7 s, overhead at 8.5 s), bigger koi and
   bird, ribbed and painted paper with frame shadows, flicker, eye rings, tassels; at least one
   animal on screen at every still.
4. Static, empty, phone-unsafe foreground (all three): the iron pipe in the bottom-right UI zone
   replaced by a bamboo pole with the lantern hanging ahead-left of the bow; bow lowered to
   12.5 percent; a visible frothy bow wave fanning from the stem; lotus lanterns routed past
   the hull at every still; more roll and pitch.
5. Muddy lifted midtones, flat even fill (critics 1 to 3): ambient and fill cut again, haze
   0.0011 to 0.0006, washes 700 to 420 W, shadow-casting string end lights, bloom threshold
   1.2, cool-shadow split tone, grain 0.016.
6. Fairy-light speckle (critic 3): willow, festoon and parapet bulbs thinned by 30 to 40
   percent and made larger.
7. No life, boxy facades (critics 1 and 2): townsfolk on the bridges, quay and veranda; dyed
   banners on the quay; more dark windows; more grime.

Not done: an S-bend path (critic 1); new facade geometry (curved tile arrays, lattice depth).

### 2026-11-02, round 2 (after blind critics: ours 6.2 vs reference 7.2, 0/3 preferred ours)

Fixed what several critics agreed on, in order of expected gain:

1. Sky looked over-processed (chroma speckle, soft blobs, purple haze, too dense): plate cleaned
   and pre-resized (`sky_crop`), lens dispersion removed, grain halved, sky exposure down about
   1 EV, contrast 1.55 to 1.32, neutral-cool tint. Top-30-percent median luma 19 to 26 (was 27
   to 42; reference 11 to 14), empty sky navy. Band re-placed so it rises from just above the
   far rooftops to the upper left (plate edge kept off-frame at all still times).
2. Lifted lavender blacks and flat fill: ambient cut 70 percent, fill suns down, washes halved,
   warm pools added where strings meet walls, stronger door, balcony, quay and andon lamps.
   Frame p5 luma 2.4 to 6 (was 4.5 to 11.7).
3. Blockout buildings: warm/cool/timber facade palette, half-timbering, noren, andon lamps,
   varied lattice windows, per-brick tone jitter plus macro staining, darker wet waterline;
   bridge A got a festoon with lanterns and light pools, and ivy.
4. Blob trees: weeping willows with fairy-light switches, plus fireflies.
5. Plastic animals and a cluttered sky: new glowing paper shader with inner lights, thinned to
   whale + koi + bird + near koi; strings thinned and moved so the stills keep clear sky.
6. Static, centred POV: bow off-centre and lower, short stem post, stronger roll/heave/pitch/
   yaw, swinging bow lantern, bow wave, eye 10 cm lower.
7. Water bands: crisp ripple remap removed; low mist; lotus lanterns and petals near the boat.

## Iteration log, round 1 (stills 1.0, 4.0, 7.0, 9.5 next to the reference)

1. First pass: bow far too large and round ("table"), path started at y = -40 so the bend never
   happened, murky black houses, milky haze, overexposed hero lantern, animals read as blobs.
2. V-shaped bow, path rebased, cool ambient plus fill suns, fog halved, animals in profile with
   bent tails, gull wings, bridge face washes and parapet bulbs.
3. Frame and sky far brighter than the reference (frame mean 65 to 100 vs 38 to 46): sky
   exposure down and bluer, bloom down.
4. Lanterns and the hero washed out to pastel white under Khronos PBR Neutral: emission
   strengths cut to 2 to 5 with derived hot colours; tea house got a third tier.
5. Hero hidden behind left-bank houses: replaced them with a low garden; trees; stronger
   voussoirs; crisper ripple bands in the water.
6. Full-res check: star halos doubled by comp star glow (removed), reddish chroma noise
   (saturation down), magenta blob from a wash spot inside a moored boat (moved), bare tree
   branches, white smear on the deck (kit streak mask, see below).
7. Twilight glow invisible; striped awnings, more balconies; bow streak workaround.
8. Motion check (clean). 9. Tower moved onto an island on the canal axis; sky contrast 1.55 so
   the band glows against a darker sky. 10. Bushy hedge with fairy lights, puffier trees, matte
   deck; final full-resolution stills.

## Kit issues (worked around in build.py)

- `camera.drive` defaults to road vibration (`vibration=0.0018`); its angular part (pitch
  and roll at 2 to 7 Hz) reads as judder on anything that is not a car. This film passes 0.
- `comp.setup` road streak takes its source from every bright up-facing pixel and blurs it
  symmetrically, so emissive objects lying on a reflector (lotus lanterns, flames) throw a
  pillar upward. `streak_from_water_only()` masks the source with a water AOV and translates
  the blurs down; a kit `streak_source_mask=` / one-sided option would help every film.
- `sky.moon(light=...)` makes a sun lamp that also lights glossy rippled water; a near-mirror
  ripple surface turns it into a strobing glint. `moon_off_water()` light-links the water out.
- kit/audio.py (shared, not a build.py fix): the hall reverb IRs are independent noise per
  channel and `width()` then lifts the side, so this preset's tail (width 1.35) is
  anti-correlated and mono-unsafe (other presets with width above 1 likely too; not checked); and a -1.5 dBTP ceiling does not survive AAC when the first downbeat lands
  in the first AAC frame. Worked around in `audio_post.py`; a kit fix would be correlated IRs
  (or a side cap on the tail), a short fade-in or 1024-sample pre-roll, and a -1.8 ceiling.
- kit/finish.py has no per-film `card_y`; this film moved its bow lantern out of the card band.

- `comp.setup` defaults to `dispersion=0.006`: lateral colour separation that put red and cyan
  fringes on every star (critics read it as RGB noise). This film passes `dispersion=0.0`; a
  zero default would suit every film with a photo sky.
- Rect sky layers sample the plate through GPU mip-maps; a plate shown at about 2 source px
  per output px lands on mip level 1 and its stars go soft (2 to 4 px blobs). `sky_crop()`
  pre-resizes the plate (Lanczos, linear light) to about 1.1 plate px per output px. A kit
  helper (`photo_plate(..., prefilter_px_per_deg=...)`) would help every film.
- `pk.voronoi()` returns the node's output collection, while `pk.noise()` returns a tuple
  (factor, colour); easy to misuse.

- `comp.setup` road-streak mask excludes only depth below 2 m (hard-coded 1.2 to 2.0 m map
  range, made for a car dash). A boat deck is up-facing out to 2.7 m, so its highlights were
  smeared into white streaks. `exclude_bow_from_streaks()` finds that Map Range node after
  `comp.setup` and moves it to 3.2 to 3.8 m. A `near_cutoff` parameter would be cleaner.
- `sky.photo_plate` can only place the plate centre; there is no way to pin a given plate pixel
  (the galactic core) to a sky direction with a roll. `plate_frame()` solves the
  forward/right/up frame and calls the low-level `sky.add_rect_layer`.
- The atmosphere `dawn` glow is summed before the grade, so a blue sky tint (R x 0.62) and high
  contrast suppress it; it needed `dawn=9`. A post-grade twilight term (like `horizon_glow`)
  would be easier to art-direct.
- The kit has no water material; `water_mat()` is film-local.
- glTF instancing post-pass only catches groups whose children share one mesh, so multi-colour
  lantern groups export as separate objects (23.8 MB in round 2). Area lights are dropped from glTF
  (tea house spill, bow fill), as documented.
- Rect sky layers have no elevation fade; since a rect plate is fixed in world space, the
  extinction is baked into the plate pixels in `sky_crop()` from the placement (a kit
  `fade=` on rect layers would be simpler and keep plates shareable). The web export gets the
  same baked image, so the three.js sky matches.
- `sky.moon` draws the disc "over" the sky and its halo fades out inside `halo_size`; a wide
  scattering halo needs a second layer (`moon_halo`, a two-Gaussian rect layer).
- `comp.setup` has no hook for a final grade; `cool_shadows()` re-links the group output
  through its own nodes.
- With about 15 shadow-casting point/spot lights EEVEE reported "Shadow buffer full" at full
  resolution; `scene.eevee.shadow_pool_size = '1024'` fixed it (a `render.setup` parameter
  would help).
- `pk.vehicle.cover_z` makes it easy to place a bow, but the water next to a boat hull is
  below the frame from a 1.25 m eye: a physically placed wake behind the stem never shows.

## Open issues

- The sky plate is shown mirrored left to right (a real photo, but the constellations are
  reversed); an astronomer would notice Scorpius and Crux the wrong way round.
- The bow wave sits slightly ahead of the stem (a cheat: from the eye height the true wake is
  hidden under the bow); it is subtle in the stills and reads mainly in motion.
- The whale at 7 s is partly behind the tea house's upturned roof and its tail is cut by the
  left frame edge (deliberate, it is swooping past); after 8.5 s it is behind the camera.
- Townsfolk are small static figures with a sway; at 4 s the two on bridge A are lit very warm
  by the parapet bulbs and read as simple toy shapes.
- The quay banners are mostly hidden behind willows and posts at the four still times.
- Facades are still mostly boxes with window grids (no new facade geometry this round); the
  bridge voussoirs still read as separate proud blocks up close.
- The composition is still the one-point canal with the vanishing point near the centre (no
  S-bend); the right bend after 30 m drifts it right by 9.5 s.
- Round 5 rocks the bow against the camera; the bow fill light and the wake stay fixed to the
  camera rig (a 2 to 3 cm offset at most, not visible in the stills).
- The near koi now glides out over the top at 3.2 to 3.4 s; as it grows, frame mean luma rises
  from 48 to 63 (1.0 to 3.1 s) and falls back to 53 by 3.6 s. That is the content changing
  (a bright paper lantern filling the top), not exposure; EEVEE has no auto exposure.
- The end card position is fixed in kit/finish.py (`card_y`); the bow lantern was moved down
  to clear it, but the thin tip of the bamboo pole still passes behind the first letters.
- The soundtrack fixes (mono-safe tail, AAC true peak) live in `audio_post.py`, which the
  render operator must run and pass to finish.py (see the round 4 changelog).
- Between about 5.0 and 6.9 s the boat passes under bridge A and the vault fills the top of the
  frame; no critic still falls in that window.
- Full-resolution frame time rose to about 7.5 s (shadowed lights, more lights); still well
  inside the budget for 336 frames.
- Coverage of the mirrored plate depends on the placement; re-check with
  `POV04_SKYDEBUG=2` before changing `POV04_CORE`, `POV04_MAG` or `POV04_MIRROR` (placements
  with the core above elevation 16 expose the plate edge above the far roofs at 0 to 2.5 s).
