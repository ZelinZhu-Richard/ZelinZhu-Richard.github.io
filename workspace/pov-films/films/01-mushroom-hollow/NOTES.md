# 01-mushroom-hollow: notes

## Reference analysis

Studied `reference/ref_1s.png`, `ref_3s.png`, `ref_5s.png`, `ref_7s.png`, `ref_9s.png` and the 2 fps
contact sheet (frames are 720 x 1280, measured with PIL).

- **Horizon and vanishing point.** The road vanishes at about 57 to 60 percent of the frame height
  from the top, slightly right of centre at 1 s, drifting left as the road bends. The sky owns the
  top 45 to 50 percent of the frame; the town skyline occupies a band from about 40 to 60 percent.
- **Dashboard coverage.** A near-black dash with a soft blue rim covers the bottom 14 to 16 percent
  (row luma drops from about 35 at 85 percent to 5 at 87 percent). A steering-wheel arc fills the
  bottom 8 percent. The dash rim picks up faint coloured reflections of the street. It never shakes.
- **Landmark timing (the parallax beats).** 0 to 3 s: the warm amber hero sits at the vanishing
  point, framed by blue buildings. 3 to 6 s: the road bends right, the hero slides to the right
  edge and leaves the frame around 6 s; a tall striped tower on the left grows. 6.5 to 9.5 s: the
  tower swings past the left edge, its top cut off by the frame; new streets open at the vanishing
  point. About 9.5 s the picture fades to dark under the end card.
- **Light density.** Roughly 150 to 250 distinct light sources per frame: porthole windows on
  every building, lamp heads, neon signs, string lights and dozens of tiny lights in the far
  skyline. Every light blooms; none is a hard pixel.
- **Palette.** Sky mean RGB about (20, 25, 93): deep cobalt-violet, never black. The town is
  saturated blue and violet with magenta and cyan neon, one big amber-orange hero (the only warm
  mass), small orange accents (lamps, lifebuoys) scattered to echo it. The road band is violet-blue
  (mean about (23, 18, 78)) streaked with amber, magenta and cyan.
- **Depth layers.** (1) verge props right beside the road (plants, rocks, small lamps, a buoy post)
  that sweep out of the bottom corners; (2) the front row of buildings that swing past the frame
  edges; (3) a dense mid-distance skyline packed with lit windows at several depths; (4) the sky.
  A light blue haze separates (2) from (3).
- **Sky.** A diagonal Milky Way band (upper left to centre right) with dark lanes and pink knots,
  dense crisp stars, a large crescent moon top right, dark sky on both sides of the band.
- **What makes it appealing.** Readability at night: a cool blue fill keeps every shape legible,
  so it never goes murky. Saturated colour everywhere, but one warm hero against all that blue.
  The wet road doubles every light into long vertical streaks, which is most of the colour in the
  lower half. Chunky toy-like forms with clean bevels. Constant gentle parallax and a slow turn so
  something is always passing the edge.

## Design: Mushroom Hollow

A rain-wet lane winds through a forest village in a hollow between wooded slopes. Giant
mushroom houses line the lane; more climb the slopes behind in tiers of porthole windows; old
giant trees close the valley. Original world: no element of the reference is copied (no
lighthouse, no windmill, no tiki or fruit houses, no flower signs).

- **Palette.** Deep navy night with a teal-blue ambient fill (round 3: the violet-magenta veil is
  gone, blacks are black); mushroom caps in jewel tones (plum, indigo, deep teal, rust red, dusty
  rose) with cream spots; pale cream stalks that take the colour of the light falling on them.
  Warm amber (about 2700 K) only for windows, lanterns, door lamps, the sky lanterns and the two
  warm masses; teal and cyan for most glowing mushrooms and toadstool lamps, magenta as an accent
  (about one cluster in five), violet now and then; festoons in amber, cyan and magenta; warm
  gold fireflies; cobalt and teal washes at the foot of the houses, magenta only on one in seven.
  Emitters are kept near 1 to 3 scene-linear so they roll off to colour, not white.
- **Warm hero.** The Stump Inn: a huge cut tree stump with flared roots, two floors of tall arched
  amber windows, a round front door with a porch and lanterns, a wraparound balcony, a timbered
  upper room under a conical shingle roof and a stone chimney with smoke. It sits right of the
  lane at the start of the bend: right of the vanishing point at 0 s, sweeping off the right edge
  at about 5 to 7 s. Warm uplights and window spill paint an amber streak down the wet lane.
- **Hero landmark at the vanishing point (added 2026-11-02).** The Elder Bloom: a colossal old
  mushroom (40 m stalk, cap 42 m across, top about 53 m) about 195 m down the lane, with a village
  wound up its stalk (a spiral stair, a spiral of amber portholes, a balcony ring, a door at the
  foot), warm-gold glowing fluted gills under a dark plum cap with big pale-cyan glowing spots, and
  lantern strings hanging from the rim. It is the eye's target in every frame and the second warm
  mass (the brief's single warm *building* is still the inn; the Bloom reads as a lamp in the sky).
- **Second landmark.** The Bell-cap Tower: a very tall slender mushroom on the left with a spiral
  staircase wound around its stalk, a ring balcony and a cyan-lit lantern room under a violet
  bell-shaped cap with glowing spots. Since the S-curve rework it frames the left side of the
  opening shots and leaves the left edge at about 3.5 s.
- **Landmark timeline (0 to 10 s, then slow drift to 14 s).**
  - 0 to 2 s: the lane bends right; the inn glows right, the tower stands left, the Elder Bloom
    glows between them just left of centre.
  - 2 to 5 s: the camera turns right (heading +11.5 deg at 4 s); the tower leaves the left edge,
    the inn swings toward the centre and grows, the Bloom slides to the left edge.
  - 5 to 7 s: the lane starts its long left bend (visible ahead); the inn leaves the right edge
    (about 6.5 s).
  - 7 to 9.5 s: the camera turns back left; the Bloom slides from x 0.33 to the centre (x 0.52
    at 9.5 s) above the curving lane.
  - 10 to 14 s: the camera keeps creeping forward (kit slow-down) under the end card; heading
    reaches -10.8 deg, still inside the plate.
- **Sky.** ESO/P. Horalek `potw1938a` (Man meets Milky Way): the galactic core with the Pipe and Rho
  Ophiuchi dust lanes, rising diagonally from the lower left to the upper right, with real green
  airglow above the horizon. Cropped above the person (rows above 0.675), with the strip below
  filled by a starless continuation of the plate's own horizon colour (behind the tree line).
  Projected as a gnomonic plate at 3.75 source pixels per output pixel, the true horizon of the
  plate on the world horizon. The plate is cleaned before use (stars split from the glow, narrowed
  to points and pulled almost to white, sensor speckle removed, the faintest third of the visible
  stars faded out, no stars behind the Moon's disc; stars and dust fade toward the horizon; a
  level warm light dome from the village and a faint green airglow band added in linear light).
  Graded to a near-neutral deep navy (no magenta push). One star field only: no NASA star map, no
  procedural stars. Thin crescent Moon (kit, LRO colour map) in the dark sky right of the band,
  about 18 deg from the core, faint ashen earthshine, lit limb down, added on top of the plate.
- **Neon motif / hook (round 3).** Paper sky lanterns: 22 warm lanterns released from the village
  drift up over the hollow (0.25 to 0.6 m/s with a slow sway), all beyond where the car stops, so
  they read as small lanterns against the Milky Way and never pass the lens. Diegetic lights, not
  orbs.
- **Vehicle (round 3).** A rounded vintage car seen from the driver's seat: a padded satin dash
  (#0b0d14 leather, roughness 0.4, soft satin coat) whose crest arcs from 11.8 % of the frame at
  the centre down to 7.8 % at the edges, a chrome trim along the crest, the steering-wheel arc
  with a cool rim light, and beyond it a glossy bottle-teal hood (mirror clear finish) peeking up
  to about 16 % of the frame, crowned, with a chrome centre strip and a little red enamel toadstool
  mascot on the nose. The A-pillars show only as raked bases in the two lower corners (no bars
  at eye level, no roof header). Two headlamps light the lane ahead (diffuse only).
- **Reflective surface.** The lane is rain-wet worn asphalt with a dashed warm centre line and
  pale edge lines, a wet film with drier patches, many smaller puddles (near mirrors with rain
  ripples), patchy repaired asphalt and glossy tar seams, so the reflections break into sharp
  pools and the near road under the headlamps shows its texture; dark stone kerbs; wet moss
  verges with a faint sheen.
- **Path.** About 5 m/s along an S: a right bend (heading +11.5 deg at 4 s), then a longer left
  bend that is visible ahead from 5 s and leads to the Elder Bloom; the heading stays within
  -10.8..+11.5 deg, inside the plate's coverage. The car keeps to the right-hand lane (1.15 m right
  of the centre line, so the yellow dashes run out of the bottom-left corner as a leading line)
  and leans up to 2 deg into the bends.
- **Density.** Front row of about 20 detailed mushroom houses (round doors, porthole windows with
  brass rings, outdoor spiral stairs with railings, chimneys, cap spots, door lamps, string
  lights), a second row, and about 80 small houses on the slopes, giving several hundred lit
  windows; lantern posts; glowing toadstool lamps in clusters of 3 to 7 (three shapes, scale 0.45
  to 1.9, gaps between clusters); glowing fungi clusters, bell flowers, ferns, mossy hummocks,
  pebbles and rocks, fences; giant trees with glowing shelf fungi; smoke from the inn and four
  house chimneys; fireflies low over the verges; thin blue haze.

## As built

(Updated 2026-11-02 for the round-3 rework; round-2 and round-1 numbers are in the changelog.)

- **Path and timing (measured with `MH_PLAN`).** Path from the origin: right bend to heading
  +11.5 deg at 4 s, back through 0 at about 8.8 s, -2.5 deg at 9.5 s, -10.8 deg at 14 s;
  4.9 m/s, look-ahead 11 m, pitch 6.5, vertical FOV 62, camera 1.15 m right of the centre line,
  lean 2.4 Gaussian-smoothed over 0.7 s with a tanh soft cap at 2 deg (`smooth_lean_roll`, round 4:
  roll -1.7 to +1.6 deg, at most 0.056 deg per frame). Inn (s 55, 13.2 m right): centre x 0.86 at 1 s, 0.81 at 4 s,
  its left half still in frame at 7 s, gone by 9.5 s (at 11.5 m its stump top poked in at the
  top right corner at 9.5 s behind the next house and read as a floating chunk). Bell-cap Tower
  (s 62, 9 m left): x 0.22 at 1 s, leaves the left edge at about 3.5 s. Elder Bloom (s 198, 13 m
  right): x 0.37 at 1 s, 0.19 at 4 s, 0.31 at 7 s, 0.51 at 9.5 s; its top at y 0.32 to 0.38.
  Galactic core x 0.23 / 0.05 / 0.20 / 0.39 at 1 / 4 / 7 / 9.5 s, y 0.24; Moon x 0.73 / 0.56 /
  0.69 / 0.89, y 0.18.
- **Sky.** `potw1938a` rows 0 to 6750 + 1190 rows of starless fill, processed in 900-row strips
  (`split_stars`, numpy only, about 16 s once): grey opening (radius 5 px) + blur = glow and dust;
  the residual = stars; stars thresholded against 0.5 x their local mean, each star's profile
  raised to the power 1.8 about its own peak and scaled 1.45, star chroma x0.32; then a soft knee
  on each star's own peak at the 94th percentile of the peaks above 0.035 (measured once on a
  mid-sky strip, 0.98 plate-linear): stars below 0.55 x that fade out, full from 1.45 x. Measured
  on a 480 x 320 sky crop at t = 1 s: stars above luma 40 / 70 / 110 went from 1330 / 675 / 303 to
  902 / 558 / 283 (the faint field thins, the bright stars stay). Glow chroma x0.72, tint (0.95,
  0.97, 1.0). The Moon's disc (plus 6 %) is cut out of the star layer. Extinction: stars fade to
  15 % and glow to 50 % from 26 deg down to 3 deg. Warm light dome (1.0, 0.5, 0.24) x 0.12 with a
  7 deg e-folding height, green airglow (0.2, 0.85, 0.55) x 0.004 at 9 deg. Cached as
  `$TMPDIR/povkit-cache/mh_potw1938a_cut6750_rows7940_v4_<hash>.jpg`. Gnomonic `photo_plate` as
  before (focal 6000 plate px, 3.75 plate px per output px, centre az +2, blend replace). Grade:
  exposure 0, contrast 1.6, saturation 0.8, tint (0.8, 0.92, 1.12); horizon glow (0.0045,
  0.0105, 0.044) x 1 over 90 deg (a deep navy floor for the whole sky). Measured sky (rows 4 to
  35 %): mean RGB about (16..25, 14..19, 38..47), luma p10 1.2, p50 4..6 (round 2: (27..48,
  24..34, 91..101), p50 18..23). Moon: phase 0.14, 2.4 deg, az 14 el 27, lit limb down, gain 6,
  earthshine 0.016, halo 0.05 x 0.6, layer switched to additive after `sky.moon` (no dark disc),
  moon light 2.2 (cool rim on the cap tops) with specular 0.05.
- **Sky lanterns.** 22 instances of one lathed paper lantern (0.47 m, emission brightest at the
  open bottom, x 4.0, warm orange), stratified along s 74 to 260, 9 to 30 deg above the start of
  the lane, scaled 0.9 to 1.3 x (1 + d / 150), rising 0.25 to 0.6 m/s with a 0.25 m sway, keyed
  linear at frames 0 / 120 / 240 / 338; kept 26 m clear of the Elder Bloom below its top.
- **Lighting.** Teal-blue ambient (0.009, 0.024, 0.095) + sky light gain 0.25, cobalt front fill
  sun 0.6, washes 1500 / 2200 W at the foot of every front and mid house (cobalt, teal, sky blue,
  violet, one magenta in seven), warm inn uplights, inn spill 1600 W with specular 0 (it mirrored
  as a big amber disc in the puddles), porch lights 100 W, warm lantern posts, toadstool cluster
  lights 9 W on every other cluster, fungi and festoon point lights, six 2.6 kW warm-gold lights
  under the Elder Bloom cap, two 30 kW uplights on its stalk, two 4 kW headlamps (36 deg cones,
  specular 0) on the car; haze from about s 70 onward. Render: Khronos PBR Neutral, view exposure
  -0.25, motion blur shutter 0.2 (was 0.32). Compositor: saturation 1.22, bloom 0.42 at threshold
  1.9 (size 0.34, saturation 1.5), no fog glow, lens distortion -0.008 with dispersion 0 (the
  0.006 default fringed every star red and cyan), road streak 0.7 x 96 px at threshold 0.8, grain
  0.014, star glow 0.04, then a black point of 0.006 and a contrast power 1.2 about 0.18.
- **Emission levels.** Windows (`cozy_window`) 2.6 to 3.2 near, 4.5 to 5 far, hero 2.8; toadstool
  caps 1.5 to 2.4 (x up to 1.8 on the gill side); fungi 2.0 to 2.2; bell flowers 2.4 to 2.6; cap
  spots 3.2; lantern glass 7; bulbs 9; festoons 11; Elder Bloom gills 1.5. Round 2 had 13 to 26
  for windows and 12 to 16 for toadstools, which clipped to white under the view transform.
- **Lane.** `wet_asphalt` base (0.065, 0.062, 0.07), wetness 0.55, puddles 0.45 at puddle scale
  0.2 (smaller, more numerous), dry roughness 0.52, wet 0.12, puddles 0.012, grain 0.42, streak
  ridges 0 (they drew a chevron pattern on the lane lines), ripples 0.35; lane-line wear range
  narrowed to 0.16..0.26 (cleaner paint); `lane_detail` multiplies the albedo by repaired-asphalt
  patches (0.7..1.35 over a metre or two) and adds glossy tar seams (Voronoi edges, roughness
  0.07); bump faded at grazing angles as before. Kerbs dark stone (0.22, 0.23, 0.27).
- **Vehicle.** `build_vehicle` (all own geometry now except the kit steering wheel, roof and
  cabin lights): dash section swept along x with the crest at cover 0.118 at the centre down to
  0.078 at the frame edges, crest depth 1.02 m bowing back 0.38 m at x = 0.75, 4.5 cm crest roll;
  `MH_Dash` base (0.0037, 0.0042, 0.0068), roughness 0.36..0.46, coat 0.35 at 0.4 (above the 0.32 trace limit, round 4; was 0.2); chrome trim
  tube 5 mm; wheel top at 6.8 %, 1.4 W rim light linked to the wheel, 0.9 W dash fill (specular
  0) linked to the dash. Hood: 48 x 40 grid from y 1.0 to 2.75 m, flat near the cowl and rolling
  down (power 1.7) to the nose at cover 0.162, crown 0.14 x^2, half width 0.95 with rolled sides,
  a rounded nose roll; `MH_HoodPaint` base (0.004, 0.018, 0.02), roughness 0.045, IOR 1.55;
  chrome centre strip (11 mm tube) and a 9 cm toadstool mascot (chrome stalk, red enamel cap; the cap
  is its own object `HoodMascotCap`, lit by `MascotKey`, a 2.8 W warm 0.3 m softbox in the car frame
  linked to the cap alone, specular 0.22; round 5).
  A-pillar bases: inner edge from frame (0.034, 0.06) to (-0.086, 0.30), so they leave the frame
  side at about a quarter height. Kit windshield not built (see kit issues).
- **Materials.** `cap_mat`: jewel colour with value drift, darker rims, fibrous streaks and pores,
  cream spots (big per-cell spots plus freckles, slightly raised), moss creeping over the crown,
  warm subsurface, satin coat (no lavender sheen). `stalk_mat`: vertical fibres, stucco bumps, AO
  grime, damp mossy foot. Cap shapes: round dome, ruffled flat parasol, bell, tall pointed cap;
  caps tilt up to 11 deg. `gill_glow_mat` for the Bloom: fluted radial stripes, brighter toward
  the stalk.
- **Content counts.** 94 near and mid mushroom houses (stacked towers included), 240 slope houses,
  the Elder Bloom (about 24 lit portholes up its stalk, 70 cap spots, 150 rim lanterns), well
  over a thousand lit porthole windows, 260 tiered firs, 5 giant trunks with glowing shelf fungi,
  15 lantern posts (the one at s 4 removed in round 4; the car ignores their spots), 178 toadstool lamps in 36 clusters (three shapes per colour, one big lamp of
  scale 1.35 to 1.9 and smaller ones of 0.45 to 1.05 per cluster, tilt up to 10 deg; colours
  weighted cyan 34, teal 28, magenta 20, violet 12, warm 6), 260 glowing fungi clusters, 150
  bell-flower clumps, 260 ferns, 220 mossy hummocks, 160 pebbles, 90 rocks, fences with fairy
  lights, 6 festoons (catenary sag 13 % of span, jittered bulbs on drops, anchors 4.6 to 6.6 m),
  laundry lines, signpost, bench, firewood at the inn (the two barrels are gone), smoke cards on
  the inn and four house chimneys, 460 fireflies (radius 2.6 cm, 3.6 to 20 m from the lane centre,
  0.3 to 3.5 m high), 22 sky lanterns. 2,925 exported objects.

## Iteration log, round 1 (stills at 0.5 scale, judged side by side with ref_5s)

1. Layout and timing work, but sky brown and busy (mean 74, 52, 83), everything lit warm so the
   inn is not the hero, no blue fill, tree canopies read as black lollipop blobs.
2. Sky regraded (tuned offline in numpy on the plate), plate focal 6400 to 7600, cool-dominant
   window and lantern palette, blob trees replaced by tall trunks plus tiered firs. Found: inn
   window casings in front of the glass, an area spill light mirrored as a huge amber blob on the
   wet lane, volume smoke rendering as a grey slab.
3. Fixed those; added the elder mushroom focal point. Inn now reads warm. Measured saturation
   0.33 against the reference's 0.79: the image is washed out.
4. Brighter saturated cap colours, stronger blue ambient, comp saturation 1.3, calmer bloom,
   thinner fog, darker dash. Mid-ground still thin.
5. Stacked mushroom towers, 240 slope houses, bell-flowers, fences with lights.
6. Moon earthshine/halo fix, mid-house washes, story details, view exposure -0.25.
7. Cobalt front fill sun, custom near-black dash material, front row closer and chunkier.
8. Cleared the front row before the inn so the hero is unobstructed at 0 to 4 s; sky lifted.
9. Smoke as camera-facing soft cards with a chimney glow (volume puffs were too small for the
   froxel grid); bark grooves deepened.
10. Verge colours diversified (pink, violet, cyan, warm toadstools; teal, magenta, violet, lime
    fungi). Final: hero windows lowered to 19 so the amber stays saturated instead of clipping.

Motion check: frames 96 to 120 at 0.25 scale. Region means (sky, mid, road, dash) change smoothly
(largest frame-to-frame second difference about 2/255), parallax progresses evenly, no popping or
jumping particles; frames deleted. The smoke loop was then rekeyed every 2 frames with zero
opacity across the wrap so no puff slides back down.

## Timings (M4 Pro, other films rendering on the same GPU at the same time)

- Scene build 22 s (houses 18 s); sky plate preparation 4.4 s once (then cached).
- Half-scale stills 3 to 10 s each (up to 34 s under heavy contention).
- Full resolution: 9.7 s per frame on the round-1 build (frames 120 to 122); round 2: 9.4 s per
  frame (frames 120 to 122, 28.1 s, with two other films rendering on the GPU). Full-resolution
  stills 5.3 to 16.9 s each under contention. Round-2 scene build 18 to 50 s; the v3 plate
  preparation takes 17 s once.
- Round 3: scene build 18 to 35 s; v4 plate preparation about 16 s once. Full resolution 6.4 s
  per frame (frames 120 to 122, 19.2 s, other films on the GPU); full-resolution stills 9 to 15 s
  each; half-scale stills 3 to 9 s.
- `--export-web` (round 3): about 10 s; `scene.glb` 55.3 MB, 2,925 objects (round 2: 56.5 MB);
  `sky.json` uses `assets/web/atmo_eac7dced12.jpg`,
  `rect_mh_potw1938a_cut6750_rows7940_v4_a244b72f87_465caad14f.jpg` and `moon_5017827d7a.jpg`.
  The round-2 plate JPG (`..._v3_7495067546_985bb3a91b.jpg`) is no longer referenced by this film.

## Plates used and credits

- `assets/sky/eso-potw1938a/potw1938a_10k.tif`, "Man meets Milky Way", CC BY 4.0.
  Credit: `ESO/P. Horálek`
- `assets/moon/nasa-svs-4720/lroc_color_poles_4k.tif` and `ldem_16_uint.tif` (through the kit's
  `sky.moon`), NASA media guidelines. Credit: `NASA's Scientific Visualization Studio`

Caption credit line: Sky photograph: ESO/P. Horálek (CC BY 4.0, eso.org). Moon: NASA's
Scientific Visualization Studio.

## Kit issues (worked around in build.py)

- `sky.photo_plate` always puts the principal point at the image centre; a crop whose optical
  axis is on its bottom edge (a horizon plate) cannot be projected exactly. Placed the centre at
  the horizon-derived elevation; the residual keystone is hidden behind the tree line.
- `render.setup()` does not expose the shadow pool or per-light shadow resolution. With two suns
  plus spot shadows EEVEE reported "Shadow buffer full (2286 / 2048)" at full resolution. Set
  `eevee.shadow_pool_size = '1024'`, `shadow_maximum_resolution` 0.03 on suns and 0.006 on other
  shadowed lights, shadows on only the nearest lanterns: errors gone and render time dropped.
- `lights.area` has no `specular` argument; a downward area light over the wet lane mirrors as a
  large flat blob. Used a soft spot with `specular=0.15` instead.
- `car_dashboard`'s coat mirrors the world lighting, and the invisible cabin roof has
  `visible_glossy = False`, so with a strong blue ambient the dash top turns into a grey-blue slab.
  Passed a custom low-spec near-black material through `material=`.
- Small volume objects (chimney puffs about 1 to 3 m at 55 m) fall below the froxel resolution
  (`volumetric_tile '8'`) and either vanish or show as a blocky slab; used alpha cards with a
  Track To constraint instead (not exported to the web, `pk_noexport`).
- `sky.moon` uses an "over" blend with a halo ring; against a bright photographic plate
  background the earthshine disc read as a dark hole. Raised `earthshine` to 0.03, halo 0.07.
- The glTF export has no decimation path, so merged procedural meshes pass 60 MB quickly; added
  an `MH_STATS` report and trimmed tessellation by hand.
- Web difference: `blend='replace'` plates are exported additively (the atmosphere layer under
  the plate is near-black, so the difference is negligible).
- (2026-11-02) The kit windshield (`mat.windshield`, DITHERED) shows up in the Depth and Normal
  passes on the few percent of pixels where the dither picks the glass. The compositor's
  road-streak mask (`notcar` depth 1.2 to 2 m, Normal z) and sky-bloom mask then switch off on
  those pixels, which leaves a field of black specks over every bright wet-road reflection (the
  "sparkle / glitch" the critics saw; it does not change with sample count). Verified by
  rendering with the compositor off (clean) and with the glass hidden (clean). Worked around by
  hiding the windshield (`hide_render`). A kit fix would render the glass in a separate view
  layer or exclude it from the passes.
- (2026-11-02) The road-streak mask keeps only Normal-pass z above 0.78..0.92; a bumped wet road
  has many pixels below that. `widen_road_streak_mask` rewrites the MapRange to 0.42..0.66.
- (2026-11-02) Kit bumped materials (`wet_asphalt`, `ground`) keep full bump strength at grazing
  view angles; `fade_bump_at_grazing` blends the bumped normal back toward the true normal with
  Layer Weight facing (0.55..0.97) to keep reflection rays out of the ground.
- (2026-11-02) `comp.setup` has no tone or black-point control; `comp_contrast` appends a black
  point and a contrast power at the end of the kit compositor.
- (2026-11-02) `geo.string_lights` spaces bulbs evenly at one height with no drops; `festoon`
  in build.py adds jittered spacing, drops and a visible wire.
- (2026-11-02, round 3) `comp.setup` defaults to `dispersion=0.006`; the lens pass runs after the
  sky is composited, so every star got a red / cyan fringe. Passed `dispersion=0.0` (a kit fix
  would mask dispersion to the frame edges or apply it before the sky).
- (2026-11-02, round 3) `sky.moon` has no blend argument and always lays the disc "over" the
  plate; even with low earthshine the disc read as a darker hole with a ring in a lit navy sky.
  After `sky.moon` the build switches the moon layer in `pk._SKY.layers` to `'add'` and calls
  `pk.sky.build()`; the stars behind the disc are removed from the plate in `prepare_plate`
  instead (the web export was already additive, so web and render now match).
- (2026-11-02, round 3) `vehicle.car_dashboard` draws a straight-ish crest (the bow only bends
  the edge outside a 9:16 frame) and its glass cannot be used (above). The vintage dash, hood,
  mascot, pillar bases and headlamps are built in `build_vehicle` from `vehicle.cover_z`,
  `vehicle.steering_wheel`, `vehicle.roof` and `vehicle.cabin_light`.
- (2026-11-02, round 3) `mat.wet_asphalt` puts its `streak` ridges on the painted lines too and
  its lane-wear noise reads as chevrons at grazing angles; the build sets `streak=0`, rewrites
  the wear MapRange (0.38..0.55 to 0.16..0.26) and adds `lane_detail` (patches and tar seams)
  onto the material's Base Color and Roughness links.
- (2026-11-02, round 3) `mat.lit_window` curtains are noise silhouettes that read as broken
  glass at a distance; replaced by `cozy_window` in build.py (smooth curtain gradient, hot spot
  low in the middle, valance, per-window hue and brightness).
- (2026-11-03, round 4) `camera.drive` keys the lean roll per frame (linear) from a finite-difference
  curvature of the C1 Catmull-Rom path and hard-clamps it at `max_roll_deg`, so the roll rate steps at
  every control point and wherever the clamp engages; on this S it swung +1.49 to -0.44 deg in 12
  frames. build.py drives with `lean=0` and adds its own smoothed lean (`smooth_lean_roll`). A kit fix
  would low-pass the roll (and use a tanh cap) inside `drive`.
- (2026-11-03, round 4) `vehicle.roof` (the invisible shadow caster) also blocks nearby shadowed
  street lights, and with a small light radius it cuts their light on the dash within one or two
  frames as the lamp passes the roof edge. Worked around with light linking (`car_ignores_lantern_spots`).

## Open issues

- The inn reads more as a round amber inn than unmistakably a tree stump: the flared roots and
  bark sit low and are partly hidden by verge props.
- There is still no windshield glass (no faint reflection, dust or rain beads, which two critics
  asked for); it needs a kit change that keeps the glass out of the Depth and Normal passes.
  There is also no instrument glow or rear-view mirror.
- The near road between the hood and about 12 m reads as wet asphalt with tar seams, patches and
  puddles under the headlamps, but it is still the darkest band of the frame below the skyline.
- The sky lanterns are a new motif nobody has judged yet; at 1 s they are small and could read
  as orange stars. The count (22) and size are easy to tune (`sky_lanterns`).
- No characters or creatures, and no hanging signs (critics suggested both).
- The far-left plate edge would show below about 8 deg of elevation only if the heading went past
  -11 deg; at 14 s (heading -10.8) the slope and firs cover it (checked at 12 and 13.9 s).
- Mid-ground caps in shadow are dark navy; their cream spots and moss read only where a wash or
  lantern reaches them.
- The sky lanterns rise through the whole clip, so the hook is there from the first frame, but
  there is no timed beat (a light switching on, a swarm released) at a specific second.
- The road reflections are brighter than the reference's (road band luma p50 about 30 to 80
  against 26 to 48); by design, since the brief says the road carries most of the colour.
- `scene.glb` at 56.5 MB is close to the 60 MB limit; smoke cards and haze are not in the web scene.
- Full 336-frame sequence not rendered here (orchestrator queues it); per-frame time measured
  on 3-frame sequences only.
- Festoons leave the top edge over 2 to 3 frames together with their bloom halos (mp4 108 to 110:
  top 10 % band mean 12.8, 10.0, 5.0). Judged natural parallax in round 4; if critics still read it
  as a pop, angle the strands more (film 03 put the far end 6 m further on) or fade the bloom input
  near the top edge (film 05).
- The S apex at about 4 s (yaw rate through zero) makes 3 to 5 s change about 10 % less per second
  than the rest of the cruise (mean abs difference over 1 s: 32.3 against 34 to 38.7). Critics read
  it as a pacing sag; changing it means reshaping the path.
- At full resolution a faint 1 to 2 px vertical line rises about 30 px above the mascot cap: the
  compositor's road streak picks up the cap's small top highlight, because the cap faces up and sits
  about 3 m away, beyond the streak mask's 2 m `notcar` depth cut. It was there before round 5 (from
  the scene lights' highlight); the round-5 key adds at most 5 to 8 levels to it. A kit fix would keep
  the vehicle out of the streak mask by object, not by depth.

## Changelog

### 2026-11-03, round 5: steady red on the hood mascot (needs a full re-render; not rendered here)

A/B critics preferred round 4's motion but all four saw one regression: the red toadstool cap on the
hood (bottom centre, about x 540 y 1555 at full resolution) had turned into a dull maroon blob,
worst at 2, 5 and 11.5 s. Cause: round 4's `car_ignores_lantern_spots` took the 900 W lantern spots
off the car, and those spots were the cap's only real light. Before that, the same spots made it
pump from frame to frame. Measured on the two mp4s in a cap core box (full res x 515 to 565, y 1550
to 1568; mp4 frame n = Blender frame n + 1): round 3 core red mean 52 to 199 over the cruise with
steps up to 111 per frame (Blender 20); round 4 core red mean 4 to 5 over frames 1 to 10, 13 to 46
over 100 to 125, 37 to 88 over 200 to 215.

Fix (build.py, `build_vehicle` and `mascot_key`):
- The enamel cap is split off the `HoodChrome` mesh into its own object `HoodMascotCap` (same
  car-frame origin, so its Object texture coordinates and shading are unchanged).
- `MascotKey`: a 2.8 W warm (1.0, 0.62, 0.38) 0.3 m area light from `vehicle.cabin_light`, 0.12 m
  right, 0.26 m ahead and 0.30 m above the cap centre, fixed in the car frame and linked to the cap
  alone (no other mesh, no shadow, volume 0). It gives a lit crown, a darker rim and underside, and
  a soft coat sheen that never moves on screen; the scene lights still add their slow changes on top.
- Its specular is 0.22. Tested at 1.0: the sheen passed the compositor's road-streak threshold
  (luminance 0.48) and was smeared into a pale vertical line above the cap (above-cap difference up
  to 90, summed RGB, at half scale; at 0.22 it is at most 12 and invisible).
- Tested at half scale (stills at 0.5, 2, 3.9, 5, 8, 9.4, 11.5 s): 1.5 W read too dim at 2 s (core
  red 68); 2.5 W at full specular gave the streak line; 3.0 W at specular 0.3 and 0.15 both read as
  red enamel, not as a lamp. Picked 2.8 W at 0.22.
- Web edition only: three.js has no light linking and the key is not exported (`pk_noexport`), so the
  cap's `pk_web` gets a faint emissive floor (0.62, 0.03, 0.02) x 0.15 and a 0.5 clear coat.

Verified at half scale, frames 1 to 10, 100 to 125 and 200 to 215 (cap core box half res x 257 to
282, y 775 to 784; deleted afterwards). Core red mean 86.2 to 86.6 (largest step 0.18), 89.7 to
105.5 (largest step 1.6), 98.4 to 127.5 (largest step 3.6, the slow ramp as the Elder Bloom's
lights come near; round 4 had steps up to 7 there). Peak red 234 to 242, 237 to 240, 248 to 251.
Core green 9 to 17 and blue 4 to 9, so it stays a saturated red. The background beside the cap reads
red 17 to 48 (navy) over the first two ranges, and red, green, blue about (113, 74, 62) (brown road)
at 200 to 215, where the cap reads (127, 17, 9).

Full-resolution stills re-rendered (old copies compared, then deleted). Cap core RGB at t1.0 / 4.0
/ 7.0 / 9.5 went from (6, 0, 4) / (9, 1, 3) / (16, 1, 3) / (123, 6, 4) to (92, 9, 4) / (93, 10, 4) /
(97, 10, 4) / (158, 19, 11), and cap peak red from 207 / 160 / 175 / 251 to 244 / 244 / 246 / 251.
Outside the ornament box (x 490 to 590, y 1530 to 1600) the mean absolute difference is 0.0001 at
every time. The only pixels that change by more than 3 are on the existing faint line just above the
cap (up to 8, 1 to 2 px wide; see Open issues). Frame means are up 0.03.

`--export-web` re-run: `scene.glb` 57.3 MB, 2919 objects (the new cap node; `MascotKey` not
exported), `sky.json` unchanged. Webshot at 4.0 s: `compare.py` thirds are unchanged (web luma top
17.6, mid 72.7, bottom 29.2). The web cap core red went from 50 to 99 (Blender 85). The web
difference outside the cap (MAD 0.41) is below the web's own shot-to-shot noise (0.50).

### 2026-11-03, round 4: motion QA and video-critic fixes (needs a full re-render; not rendered here)

Each finding was first checked on frames decoded from `out/01-mushroom-hollow.mp4` (mp4 frame n is
Blender frame n + 1; all 336 at half scale, a few at full), then re-checked on half-scale Blender
ranges 1 to 30, 97 to 128, 150 to 171 and 202 to 213 (deleted afterwards). Flow numbers are phase
correlation in px per frame at half scale: "sky" is rows 4 to 36 %, "horizon" rows 50 to 62 %.
Note: the half-scale PNGs read about 1 to 2 luma brighter than the mp4 everywhere (the encode),
so only steps are compared, not levels.

Fixed:

- **Roll lurch at the S inflection (QA, medium; mp4 106 to 121).** Confirmed: sky dx -0.12 (105),
  then 0.38, 0.98, 1.35, 1.97, up to 2.25 (115), back to 0.26 (121), while the horizon band drifted
  smoothly 0.21 to 0.88, so sky minus horizon swung -0.33 to +1.37 to -0.58. The kit's roll keys
  (dumped from `camera.drive`) read -2.0 (clamped) to frame 76, +1.49 at 108, -0.44 at 120, +2.0
  (clamped) from 152: the finite-difference curvature of the Catmull-Rom path wobbles there and the
  hard clamp adds corners. Max roll rate 0.239 deg per frame (4.8 px per frame at the top row, full
  res), max roll acceleration 0.087 deg per frame^2 (1.75 px). Fix: `smooth_lean_roll` (the kit is
  called with `lean=0`): the same lean formula, Gaussian-smoothed over sigma 0.7 s, tanh soft cap at
  2 deg. Roll now -1.69 to +1.56, max rate 0.056 deg per frame (1.1 px), max acceleration 0.0023
  (0.05 px); yaw and path unchanged. Half scale mp4 98 to 127: sky dx ramps smoothly 0.01 to 0.91,
  sky minus horizon stays within -0.07 to +0.15.
- **Roll-rate hitches (QA, low; mp4 19 to 22, 77 to 85, 151 to 153, 164 to 168).** Same cause and
  fix. Mp4 19 to 21: sky was -2.03, -2.69, -2.72, -2.22 (horizon -1.99 throughout); now -2.04,
  -2.03, -2.02, -2.00. Mp4 151 to 170: steps of +0.43 (1.20 to 1.63) and +0.54 (2.00 to 2.54, then
  back to 1.63) are now a smooth ramp 1.26 to 1.79 (largest step 0.15, from the moving sky
  lanterns). Frames 77 to 85 were checked on the roll curve only: the rate jumped from 0 to 0.117
  deg per frame in two frames where the clamp released; now it eases from 0.030 to 0.055.
- **Opening flash-by at the top-right edge (critics, 3 of them).** Confirmed: the lantern post at
  s 4 (4 m ahead, 1.5 m right, 1.6 m above the eye at t = 0) sat on the top-right edge and was gone
  by mp4 frame 3; region mean (top 35 %, right 45 %) 20.6, 17.6, 14.0, 9.6 over frames 0 to 3.
  That post is skipped (`s < 6`); now 9.5 to 9.9 over frames 0 to 5. The other posts keep their s.
- **Warm glow on the lower right of the dash switching off (the critics' "orange flare on the
  hood"; also found by a cell scan).** Confirmed at mp4 2 to 4 (dash cell, rows 90 to 100 % and
  right 17 %: 101.7, 70.9, 14.9), 105 to 106 (76.5 to 17.1) and 207 to 209 (81.1, 53.0, 25.9), each
  time a right-hand lantern post was about 3.6 m ahead. First suspect was the screen-traced dash
  coat (roughness 0.2 below the 0.32 trace limit): coat roughness 0.4 alone lowered the peak (98 to
  87) but kept the cut (81.3 to 25.0 at 105 to 106). The cause is the post's 900 W spot (shadowed
  below s 75) lighting the dash through the windscreen until the invisible cabin roof
  (`vehicle.roof`) shadows it. Fix: `car_ignores_lantern_spots()` excludes the car's 8 meshes from
  the 13 `LanternL*` spots by light linking; the posts' shadowless 30 W glow lights still reach the
  car and fade smoothly. Dash and pillar coat roughness stays at 0.4 (`CABIN_COAT_ROUGH`) so no
  screen-traced lobe on the cabin can pop at the frame edge either. Now mp4 96 to 109: 4.3, 4.7,
  5.3, 6.5, 8.4, 11.2, 14.2, 16.4, 17.4, 17.0, 15.1, 12.5, 10.0, 7.8 (steps at most 3.0); 201 to 212:
  17 to 26, steps at most 3.7 (was -28.1); bottom-right quadrant steps at most 1.0 (was 10.3).

Judged not defects, or not this film's build:

- *Outro dip at 10.5 to 11 s, 3 s end card, grey URL, dim tail* (critics): `kit/finish.py` and the
  brief (12 percent dim from 10 s, URL-only card). The audio is fine too: -14.1 LUFS, -1.7 dBTP.
- *A string of lights crossing the top edge "in a single sampled frame" at about 4.5 to 5 s*
  (critics): a 2 fps artefact. The festoon at s 27 is in frame from about 3.5 s and leaves the top
  over mp4 107 to 109, with its halo (see Open issues). Its exit coincided with the roll lurch,
  which is gone.
- *Pacing sag at 4 to 7 s, the Bloom pinned at 6 to 10 s* (critics): constant 4.9 m/s; the S apex
  (yaw rate through zero at about 4 s) makes 3 to 5 s change about 10 % less per second (see Open
  issues). The Elder Bloom is the vanishing-point landmark by design (195 m away).
- *Camera yaws right from 7 s / drifts to the right shoulder at 8 to 10 s* (critics): the heading
  turns left there (+5.6 deg at 7 s to -2.5 deg at 9.5 s) and the camera stays 1.15 m right of the
  centre line (sway 4 cm); the lane bends left, so the road leaves the frame to the left.
- *Puddle reflections slide independently of the objects* (critics, cyan mushroom at lower right
  near 8 s): checked mp4 178 to 198. The reflection is the upside-down image of the pale cyan
  toadstool on the right verge, broken by the kerb, and it tracks the lamp across the frame.
- Single-frame steps of 10 to 18 luma in right-edge cells at mp4 202 to 212: the lantern post at
  s 46 and the house balcony sliding out over 5 frames (same before and after). Not a pop.

Stills at full resolution (old copies compared, then deleted): means t1.0 / 4.0 / 7.0 / 9.5 = 40.6 /
43.3 / 42.6 / 38.7 (round 3: 40.7 / 43.3 / 42.7 / 38.7), p99 218 / 223 / 221 / 221 unchanged,
clipped share 2.71 / 3.26 / 2.83 / 2.71 % (2.71 / 3.25 / 2.85 / 2.70), mean saturation unchanged,
dash band 0.4 to 0.8 darker (the faint warm glows on its right). Same composition; t4.0 and t9.5 lean
about 0.5 deg less into the bend. Half scale rendered at 3.5 to 9.4 s per frame and full-res stills
at 8.5 to 11.2 s each, with other films on the GPU.

### 2026-11-02, round 3 (after blind critics: ours 5.3 vs reference 7.2, 0 of 3 preferred ours)

Dimension averages were sky 6.3, world 5.3, light 6.5, POV 4.8 (reference 3 / 7 / 7.7 / 7.7).
What the critics agreed on, and what changed:

- *Cockpit reads as letterbox bars (3/3).* The full-height pillar strips are gone. New vintage
  cabin: a padded satin dash whose crest arcs from 11.8 % of the frame at the centre to 7.8 % at
  the edges, a chrome trim, the wheel arc with a rim light, and a glossy bottle-teal hood that
  peeks up to about 16 % with a chrome centre strip and a red enamel toadstool mascot; the hood
  mirrors the lit street (the reference's bright reflective band above the dash). A-pillars only
  as raked bases in the lower corners. No roof header. Two headlamps light the lane ahead.
- *Violet-magenta veil, lifted blacks, wide soft bloom, clipped emitters (3/3).* Ambient moved
  from cobalt-violet to teal-blue, magenta cut to an accent (washes, toadstools), bloom 0.7 at 1.4
  to 0.42 at 1.9 with a smaller radius, fog glow off, contrast 1.12 to 1.2 and black point 0.004
  to 0.006, comp saturation 1.35 to 1.22, emission levels cut 60 to 85 % (see As built). Mid band
  (rows 40 to 62 %) mean went from about (153, 122, 131), saturation 0.49, 1 % clipped to about
  (81..107, 62..78, 66..84), saturation 0.79, 0.02 % clipped.
- *Sky over-graded, too many stars, CA fringes, moon on a dark disc (3/3).* Dispersion off (the
  fringes), plate saturation 1.3 to 0.8 and tint toward neutral, the blue horizon glow (0.6 x 0.27
  over 80 deg) replaced by a deep navy floor (0.044 x 1 over 90 deg), star chroma 0.55 to 0.32, a
  soft knee that thins the faint field by about a third, warm light dome near the horizon, Moon
  added instead of laid over (no dark disc or ring), earthshine 0.03 to 0.016, halo smaller.
- *Fence of identical clipped toadstools, no ground layer (3/3).* Clusters of 3 to 7 lamps with
  gaps, three shapes per colour, scale 0.45 to 1.9, new cap shader (glowing gill side, darker
  crown with pale spots, emission about 2 instead of 12 to 16); mossy hummocks and pebbles.
- *Near road a blurry smear, chevron lane lines (3/3).* Smaller sharper puddles, rougher dry
  patches, no streak ridges, cleaner paint, patches and tar seams, headlamps, road streak 1.1 x
  140 px to 0.7 x 96 px, motion blur shutter 0.32 to 0.2.
- *Inn windows read as broken glass (3/3).* Two causes: the kit window curtains (noise
  silhouettes) and the stump's bark ridges, which stood up to 0.3 m proud of the window panes and
  cut through them. New `cozy_window` shader, and each inn window now sits just outside the
  highest bark ridge over its span (`bark_max`), with a deeper casing behind.
- *Camera on the centre line, static symmetric frames (1/3).* Right-hand lane (1.15 m), lean 2.4.
- *Barrel blocking t9.5 (1/3).* Removed; the inn moved from 11.5 to 13.2 m right of the lane so
  nothing of it pokes into the 9.5 s frame.
- *No hook (3/3).* Paper sky lanterns drift up over the hollow; four more chimneys smoke;
  fireflies moved out of the car's corridor (a few had passed the lens as big orbs in an early
  iteration) and kept small.
- *Mid-ground caps are dark blobs (2/3).* Moon light 1.2 to 2.2 (a cool rim on cap tops), 85 %
  of second-row houses lit instead of 60 %.

Round-3 iterations (0.5-scale stills unless noted): (1) everything above except lanterns and lane
detail: cabin and grade worked, sky went black, fireflies over the lane read as orbs, a big
amber disc in the puddles; (2) navy sky floor, fireflies off the lane, dark kerbs; (3) inn spill
specular 0 (the disc), streak ridges off; full-resolution check found the bark cutting the inn
windows; (4) `bark_max`, cleaner paint, red mascot cap, chimney smoke; (5) sky lanterns; (6) lane
detail, headlamps 1.9 to 4 kW; star knee tuned at full resolution by counting stars in a sky crop
(42nd, 74th and 89th percentiles changed nothing that reads; 97th removed two thirds; 94th kept);
(7) inn to 13.2 m after `MH_PROBE` showed its stump top in the 9.5 s frame. `MH_PROBE=t,x0,y0,x1,y1`
is a new debug switch that lists the meshes with vertices in a frame region.

### 2026-11-02, round 2 (after blind critics: ours 5.5 vs reference 7.3)

What the three critics agreed on, and what changed:

- *Road reads as a canal (3/3).* Lane markings (dashed warm centre line, pale edge lines), worn
  asphalt albedo 0.05 with grain, wet film with dry patches and 40 % puddles instead of a near
  mirror, pale low kerbs. The near-road specks were a compositor artefact of the dithered
  windshield (kit issue above): fixed, reflections are now clean long streaks.
- *Milky haze, lifted blacks (3/3).* Ambient and sky light about halved, haze moved beyond s 70,
  bloom 1.0 at 1.0 to 0.7 at 1.4, black point and contrast in the compositor, amber windows
  14 / 13 instead of 22 / 19 so they stay saturated. Sky luma p10 12..15 to about 4.7; dash p50
  4..11 to 0.3 (reference 0.3).
- *No hero at the vanishing point, static composition (3/3).* The Elder Bloom at the end of the
  lane; the path is now an S (heading +11.5 deg at 4 s to -2.5 deg at 9.5 s) so the inn, the
  tower and the Bloom swing across the frame and every still has a different composition.
- *Untextured clay, cloned domes and lamps (3/3).* New cap and stalk materials (spots, freckles,
  fibres, pores, moss, damp foot, subsurface), four cap profiles including ruffled parasols and
  tall pointed caps, more tilt; toadstool lamps in irregular runs and clumps with 0.6 to 1.6 scale
  and tilt.
- *Sky over-processed (3/3).* Stars split from the glow and narrowed to 1 to 2 px near-white
  points, colour speckle gone, nebula less magenta-red, extinction toward the horizon, level light
  dome and airglow, plate at 3.75 px per output px; Moon moved off the core into dark sky.
- *Thin vehicle cues (3/3).* A-pillars, dash 15 % to 12.5 % and near-black, blue hot spot removed
  (cabin fill specular 0, dash coat blurred so the Moon no longer glints in it), wheel rim light.
- *Rainbow confetti (1/3) and UI-dot string lights (1/3).* Light palette restricted (see Palette);
  festoons with catenary sag, drops, jittered spacing, visible wire, staggered heights.
- Fireflies larger and nearer the lane for foreground parallax.

Round-2 iterations (0.5-scale stills unless noted): (1) everything above in one pass, pillars
far too heavy with a roof header; (2) pillars as thin strips, header removed, windows toned down;
(3) cap sheen and coat cut (the lavender look), Moon up to el 27; (4) fluted gill glow, trace max
roughness 0.32; (5) bigger cap spots, blurred dash coat; (6) full-resolution check: black specks
in the road reflections, not affected by 128 samples or by fading the bump; isolated by turning
off the compositor and then hiding the windshield; (7) windshield hidden, road-streak mask
widened, streak 1.1; festoon wire visible. Late frames (12 and 13.9 s) checked for plate coverage.

Round-1 as-built numbers (for reference): path heading 0 to -9 deg; plate focal 7600 px centred at
az -3; grade exposure 0.16, contrast 1.62, saturation 1.6, tint (0.74, 0.8, 1.25); ambient (0.018,
0.04, 0.23), sky light 0.4; fog 0.0006 over the whole drive; bloom 1.0 at 1.0; dash cover 0.145;
lane without markings, puddles 0.6.
