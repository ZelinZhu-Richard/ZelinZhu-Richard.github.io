"""Render The Starsea Line. Usage:
  python render.py stills 2.0 10.5 ...      -> out/stills/T_xx.png
  python render.py film [--from T0] [--to T1] [--half]
"""
import math
import os
import subprocess
import sys
import time

import numpy as np

from engine.frame import Renderer, State, plate_cover
from engine.gl import VideoWriter, save_png
from shots import FPS, LENGTH, SHOTS, shot_at

R = None
PLATES = {}


def get_plate(sh):
    if sh.name not in PLATES:
        PLATES[sh.name] = plate_cover(R.gl, sh.cams_for_plate(), sh.name, scale=sh.plate_scale,
                                      banks=getattr(sh, 'banks', None))
    return PLATES[sh.name]


def frame_state(f):
    T = f / FPS
    sh = shot_at(T)
    cam = sh.camera(T)
    kw = sh.state(T, f)
    st = State(cam=cam, plate=get_plate(sh), t=T, frame=f, **kw)
    return st


def main():
    global R
    R = Renderer()
    mode = sys.argv[1]
    if mode == 'stills':
        os.makedirs('out/stills', exist_ok=True)
        for a in sys.argv[2:]:
            f = int(round(float(a) * FPS))
            t = time.time()
            img = R.render(frame_state(f))
            save_png(f'out/stills/T_{f / FPS:06.2f}.png', img)
            print(f'{a}: {time.time() - t:.2f}s', flush=True)
        return
    t0 = float(sys.argv[sys.argv.index('--from') + 1]) if '--from' in sys.argv else 0.0
    t1 = float(sys.argv[sys.argv.index('--to') + 1]) if '--to' in sys.argv else LENGTH
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else 'out/film_video.mp4'
    f0, f1 = int(round(t0 * FPS)), int(round(t1 * FPS))
    vw = VideoWriter(out, 1920, 1040, FPS, crf=14, preset='slow')
    start = time.time()
    for f in range(f0, f1):
        vw.write(R.render(frame_state(f)))
        if f % 48 == 0:
            el = time.time() - start
            print(f'frame {f}/{f1}  {el:.0f}s  ({el / max(f - f0 + 1, 1):.2f}s/f)', flush=True)
    vw.close()
    print('done', out, time.time() - start)


if __name__ == '__main__':
    main()
