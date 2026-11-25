#!/usr/bin/env python3
"""Find where the star layers' cube-face edges cross a shot, for seam checks.

Rebuilds each pixel's direction from the exported camera exactly like the
vertex shader, applies the seeded layer rotations (parsed from the shader
source) and marks pixels where the dominant cube axis changes. Writes
_dev/sky/<shot>-seams.png (the render with the edges drawn, one colour per
layer) and prints a few crop boxes centred on edge points.

  python3 seams.py --shot plain --png ../../../_dev/sky/plain-v12.png
"""

import argparse
import json
import os
import re
import subprocess

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '_dev', 'sky'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shot', default='plain')
    ap.add_argument('--png', required=True)
    ap.add_argument('--tier', default='-1')
    a = ap.parse_args()
    r = subprocess.run(['node', os.path.join(HERE, 'export.mjs'), '--shots', a.shot, '--tier', a.tier], cwd=HERE, capture_output=True, text=True, check=True)
    d = json.loads(r.stdout)[0]
    W, H = d['w'], d['h']
    P = np.array(d['projectionMatrix']).reshape(4, 4).T  # column-major -> row-major
    V = np.array(d['viewMatrix']).reshape(4, 4).T
    ys, xs = np.mgrid[0:H, 0:W]
    nx = (xs + 0.5) / W * 2 - 1
    ny = 1 - (ys + 0.5) / H * 2
    ray = np.stack([(nx + P[0, 2]) / P[0, 0], (ny + P[1, 2]) / P[1, 1], -np.ones_like(nx)], -1)
    dirs = ray @ V[:3, :3]  # transpose(mat3(view)) * ray
    dirs /= np.linalg.norm(dirs, axis=-1, keepdims=True)
    rot = np.array(d['uniforms']['uSkyRot']['v']).reshape(3, 3).T
    c = dirs @ rot.T
    mats = re.findall(r'const mat3 (STAR_R\d) = mat3\(([^)]*)\);', d['frag'])
    im = np.asarray(Image.open(a.png).convert('RGB')).copy()
    cols = [(255, 0, 0), (0, 255, 0), (255, 255, 0), (0, 255, 255), (255, 0, 255)]
    boxes = []
    for k, (name, nums) in enumerate(mats):
        R = np.array([float(v) for v in nums.split(',')]).reshape(3, 3).T
        v = c @ R.T
        av = np.abs(v)
        face = np.argmax(av, -1) * 2 + (np.take_along_axis(v, np.argmax(av, -1)[..., None], -1)[..., 0] < 0)
        e = np.zeros_like(face, dtype=bool)
        e[:, 1:] |= face[:, 1:] != face[:, :-1]
        e[1:, :] |= face[1:, :] != face[:-1, :]
        im[e] = cols[k % len(cols)]
        pts = np.argwhere(e)
        if len(pts):
            p = pts[len(pts) // 2]
            boxes.append((name, int(p[1]), int(p[0]), len(pts)))
    out = os.path.join(OUT, f"{a.shot}-seams.png")
    Image.fromarray(im).save(out)
    print(out)
    for b in boxes:
        print(f'{b[0]}: {b[3]} edge px, e.g. at x={b[1]} y={b[2]}')


if __name__ == '__main__':
    main()
