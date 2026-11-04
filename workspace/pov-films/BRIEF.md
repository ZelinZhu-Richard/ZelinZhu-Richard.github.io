# POV Films brief

Five vertical first-person films in the format of the reference clip, each an original world.
Blender 5.2 renders the films (EEVEE on Metal, headless). three.js plays the same scenes in
real time from a glTF export of each Blender scene.

Everything below is the shared contract. Each film agent owns only its own `films/<slug>/` folder.

## What the reference does (study `reference/`)

- The camera is locked behind a vehicle front: a dark car dashboard edge covers the bottom
  12 to 18 percent of the frame and catches faint reflections of the scene. It does not shake.
- Slow forward cruise along a gentle curve, so the near landmarks swing past the frame edge.
  That parallax is what sells the depth. Subtle road vibration only.
- Palette: deep blue and violet night, one warm amber hero building, saturated neon accents,
  strong bloom on every light.
- A rain-wet glossy road with long vertical streaks of reflected light. It carries most of the color.
- Sky: a diagonal Milky Way band, crisp stars, a crescent moon, a few neon motifs.
- Density: skyline packed at several depths, plus props right beside the road.
- Timing: about 9.5 s of cruise, then the picture fades toward dark and an end card appears.
  Music is a 4-bar loop and an ending hit.
- `reference/ref_contact_2fps.png` is the whole clip at 2 frames per second.

The reference town is fan art of a known cartoon. Take the format, light and craft from it.
Copy none of its designs (no pineapple or tiki houses, flower-shaped clouds, anchors-as-houses,
lighthouse-and-windmill pairing). Every world here must be original.

## Film spec (all five)

- 1080 x 1920, 24 fps, 336 frames = 14.0 s. Blender frame 1 is t = 0.
- Frames 1 to 240 (0 to 10 s): the cruise. Frames 241 to 336: the camera keeps moving slowly
  while `kit/finish.py` fades the picture to about 12 percent and shows the end card.
  Blender renders all 336 frames plainly; the fade and card are added in finishing.
- End card: `zelinzhu-richard.github.io`, small, centered in the lower third, in a refined
  proportional typeface. No logos of other companies.
- Sound: `kit/audio.py` makes an original soundtrack per film (4 bars over the cruise,
  an ending hit at 10.0 s, tail to 14 s). No downloaded audio.
- Final file: `out/<slug>.mp4`, H.264, yuv420p, AAC 48 kHz.

## Look

- Sky must read as a real photograph of the night (or dawn) sky. Use the plates in `assets/`
  (see `assets/LICENSES.md`). Grade them for drama, but keep them photographic: crisp point
  stars, real dust lanes, no visible tiling, blur, banding, seams or fake-looking noise.
- The world is stylized and toy-like (chunky rounded forms, bevels, warm proportions) but lit
  and shaded like a high-end animated feature: bevel highlights, roughness variation, edge wear,
  contact shadows, real depth. Not low-poly, not flat-shaded, not plastic.
- One warm hero building or light per film against the cool night.
- Lights bloom. Reflective ground streaks every light source.
- No 3D models or textures from outside except the sky and moon plates in `assets/`.
  Everything else is procedural in bpy.
- On screen: no text other than the end card. No decorative glowing orbs, eyebrow labels,
  monospace capitals, counters, or em dashes anywhere on screen. Diegetic lights (lanterns,
  fireflies, windows) are fine.

## The five films

Each film keeps the reference's ingredients but swaps the vehicle, the world and the reflective
surface.

### 01-mushroom-hollow
Dashboard of a rounded vintage car on a winding rain-wet lane through a forest village of
giant mushroom houses: round doors, porthole windows, little chimneys, outdoor stairs, lantern
posts. Teal and cyan glowing fungi clusters along the verges, ferns, moss, fireflies.
Warm hero: a tree-stump inn with amber windows and a smoking chimney.
Sky: the galactic core with dark dust lanes arching through a gap in the canopy, faint green
airglow at the horizon, a thin crescent moon.

### 02-bedroom-railway
View from the cab of a toy tin train: the rounded boiler front and brass trim at the bottom of
frame. The track crosses a varnished wooden floor (the glossy reflector) through a town of
wooden blocks and cardboard-box houses with cut-out windows lit by fairy lights, book-stack
bridges, a toy crane, sleeping plush animals as hills. Glow-in-the-dark star stickers on the
ceiling are the neon motif. Warm hero: a dollhouse or nightlight. The run curves toward a tall
window that shows the real night sky with the Milky Way and a large moon.

### 03-first-snow-village
Dashboard of a vintage car with snow packed at the windshield edges, driving a snowy village
lane at blue hour before dawn. Slushy tire tracks shine with reflected lights. Cottages with
candy-colored trim and string lights, pine trees wrapped in lights, a clock tower. Falling snow.
Warm hero: a bakery with large glowing windows.
Sky: pre-dawn, stars still out, a soft dawn glow on the horizon, aurora curtains if a real plate
supports it.

### 04-lantern-canal
View from the bow of a small wooden boat (prow, rope, a hanging lantern) gliding down a canal
between stacked houses with balconies. Strings of paper lanterns cross above the water, arched
stone bridges pass overhead, moored boats line the banks, the rippled water mirrors everything.
Paper animal lanterns (fish, whales, birds) float above as the neon motif.
Warm hero: a tea house with one huge round lantern.
Sky: late twilight turning to night with the Milky Way rising.

### 05-moonlit-desert-oasis
Hood and windshield frame of an old expedition jeep on a rain-puddled desert road through an
oasis town: adobe domes, palms strung with lights, cacti wrapped in fairy lights, a water tower,
colorful lanterns, dunes behind. Warm hero: a caravan inn.
Sky: the galactic core rising, a huge low moon, a comet with a long tail, a thin dawn glow.

## Layout

```
workspace/pov-films/
  BRIEF.md            this file
  reference/          frames from the reference clip (local only)
  assets/             downloaded sky and moon plates (local only) + LICENSES.md
  kit/                shared Blender kit, audio, finishing (see kit/README.md)
  viewer/             three.js real-time edition
  films/<slug>/       build.py, NOTES.md, stills/
  renders/<slug>/     PNG frame sequences (local only, delete after encode)
  out/                finished mp4 files (local only)
```

## Running Blender

```
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
  -P films/<slug>/build.py -- <args>
```

See `kit/README.md` for the argument contract (stills at given times, frame ranges, scale).

Several Blender processes may share the GPU. Render iteration stills at 50 percent scale.
Full-resolution sequences are queued one at a time by the orchestrator.

## Disk

The disk has about 30 GB free. Write 8-bit PNG frames, never EXR sequences. Delete frame
sequences once the mp4 is verified. Keep each film's glTF export under 60 MB.

## Scoring

Critics see only images and this rubric, scored 0 to 10:

- sky_realism: reads as a real photograph of the sky; crisp stars; no artifacts
- world_craft: detail, cohesion, appeal and originality of the stylized world
- light_color: palette, warm against cool, bloom, reflections
- pov_framing: convincing first-person vehicle view, depth layers, leading lines, reads on a phone
- overall: would this stop a scroll on Reels or TikTok

The reference scores about 8.5 overall under this rubric. A film passes at an overall average
of 9.0 or more from blind critics.
