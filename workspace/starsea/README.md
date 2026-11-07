# The Starsea Line

A 72-second hand-drawn-style anime short rendered entirely from code: a lone platform over a mirror sea, a
steam train that arrives across the water and climbs a luminous track into the Milky Way. No AI imagery
and no external image assets; the soundtrack is synthesized too.

## Run

```bash
python3 -m venv .venv && .venv/bin/pip install numpy scipy numba moderngl opencv-python-headless skia-python pillow scikit-image
.venv/bin/python audio/score.py                 # out/audio.wav (timing in audio/events.json)
.venv/bin/python render.py film --out out/film_video.mp4
ffmpeg -i out/film_video.mp4 -i out/audio.wav -c:v copy -c:a aac -b:a 256k -shortest out/the-starsea-line.mp4
.venv/bin/python render.py stills 26.5 46.8     # single frames to out/stills/
```

Needs an OpenGL 4.1 context (macOS works headless). A full render takes about 5 minutes on an M4 Pro;
painted sky plates are cached in `cache/`.

## How it is made

- `engine/plates.py`, `painter.py`, `stars.py`: each shot's sky is laid out analytically (gradient, Milky Way
  in galactic coordinates, dust lanes, cloud ribbons) and then repainted with gouache-like brush strokes,
  coarse to fine, plus spatter stars from one shared catalogue.
- `engine/world.frag`: per-frame sea: the painted sky reflected with hand-drawn row slices; cel reflections
  softened and thinned with height above the water (from the mirrored G-buffer), cut by tapered glint
  strokes; brush-dash ripple marks, broken glitter columns under the lamps, wake and rings; analytic rails;
  low mist.
- `engine/train.py`, `cel.py`: the locomotive and coaches are procedural meshes drawn as cels: G-buffer at
  2x, flat colour separations, cast shadows, rim light, and ink lines with object-anchored weight variation.
- `engine/steam.py`, `fx.py`: steam, clouds, fish, meteors and glints as timed effect drawings (2s/3s/4s).
  Steam is painted in two passes (`steam_field.frag`, `steam.frag`): the union distance field of all puffs,
  then one form shadow across the mass, own shadows on a few hero billows, a colour-trace outline, and a
  see-through level with an airbrushed edge for the dissipating tail.
- `engine/frame.py`: compositing (reflections, cels, effects, transmitted-light glow, diffusion, grain).
- `shots.py`: the eleven shots, their cameras and timing.
