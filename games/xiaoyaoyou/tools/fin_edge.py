"""Bakes assets/fin-edge.webp: where each fin membrane dissolves into the water.

Usage: python3 tools/fin_edge.py [--preview <out.png>]
A greyscale multiplier for fin alpha, in the same UV space as the fin paint. No generated image
is involved: the outline comes from blender/kun-planforms.json and the noise from a fixed seed.
The noise only ever subtracts, so alpha is exactly 0 on the traced outline and the cut line cannot
show. The fin's two long, nearly straight edges take a wider and deeper bite than the ragged ones.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets/fin-edge.webp'
PIXELS_PER_REFERENCE = 5
SEED = 4177
# All lengths are reference pixels. The membrane is about 90 wide and 184 from root to tip.
BITE = 11          # how deep the noise cuts in from the outline
FEATHER = 13       # how far the fade runs past the cut
STRAIGHT_RUN = (30, 50)   # outline points of the two long straight edges
STRAIGHT_GAIN = 1.4
RAGGED_GAIN = .8
TIP_GAIN = .55     # the trailing tip stays a thin wisp instead of vanishing
ROOT_HOLD = (34, 62)      # solid inside the first radius, free outside the second


def smoothstep(low, high, value):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def field(rng, along, across, u, v, size=1536):
    """Gaussian noise stretched along the fin, as a brush lays ink. Unit variance."""
    grid = ndi.gaussian_filter(rng.standard_normal((size, size)), (across / 2.4, along / 2.4), mode='wrap')
    grid = (grid - grid.mean()) / grid.std()
    return ndi.map_coordinates(grid, [v % size, u % size], order=1, mode='wrap')


def bake():
    planforms = json.loads((ROOT / 'blender/kun-planforms.json').read_text())
    paint = json.loads((ROOT / '_dev/build/kun-paint.json').read_text())
    record = planforms['outlines']['pectoral-image-left']
    x0, y0, x1, y1 = paint['pectoral']['referenceCrop']
    scale = PIXELS_PER_REFERENCE
    width, height = (x1 - x0) * scale, (y1 - y0) * scale
    outline = (np.array(record['pixelsXY'], float) - (x0, y0)) * scale
    root = (np.array(record['rootXY'], float) - (x0, y0)) * scale
    tip = outline[record['tipIndex']]

    fill = Image.new('L', (width, height), 0)
    ImageDraw.Draw(fill).polygon([tuple(p) for p in outline], fill=255)
    inside_mask = np.asarray(fill) > 0

    # Each outline segment carries its own gain, found again through the nearest outline pixel.
    points = len(outline)
    gains = Image.new('F', (width, height), 0)
    draw = ImageDraw.Draw(gains)
    for i in range(points):
        straight = STRAIGHT_RUN[0] <= i < STRAIGHT_RUN[1]
        draw.line([tuple(outline[i]), tuple(outline[(i + 1) % points])], fill=STRAIGHT_GAIN if straight else RAGGED_GAIN, width=2)
    gains = np.asarray(gains)
    distance, nearest = ndi.distance_transform_edt(gains == 0, return_indices=True)
    inside = np.where(inside_mask, distance, 0) / scale
    gain = ndi.gaussian_filter(gains[tuple(nearest)], 10 * scale)

    py, px = np.mgrid[0:height, 0:width].astype(float)
    axis = (tip - root) / np.linalg.norm(tip - root)
    span = ((px - root[0]) * axis[0] + (py - root[1]) * axis[1]) / np.linalg.norm(tip - root)
    gain = gain * (1 - (1 - TIP_GAIN / RAGGED_GAIN) * smoothstep(.62, .9, span))

    # Work in the fin's own frame, with a warp so the bites curl like ink in water.
    rng = np.random.default_rng(SEED)
    u = (px * axis[0] + py * axis[1]) / scale
    v = (-px * axis[1] + py * axis[0]) / scale
    warp_u = field(rng, 34, 22, u, v) * 5
    warp_v = field(rng, 30, 20, u + 300, v + 300) * 5
    u, v = u + warp_u, v + warp_v
    bites = field(rng, 46, 15, u, v) * .62 + field(rng, 20, 8, u, v) * .3 + field(rng, 8, 3.5, u, v) * .13
    bites = smoothstep(-1.5, 1.5, bites / bites.std())
    grain = field(rng, 3, 1.3, u, v)

    cut = inside - BITE * gain * bites
    alpha = smoothstep(0, FEATHER * np.maximum(gain, .6), cut + grain * .9 - .9)
    # Dry-brush break-up inside the fade, gone once the membrane is whole.
    alpha *= 1 - .4 * (1 - alpha) * smoothstep(-.4, 1.4, grain)
    hold = 1 - smoothstep(ROOT_HOLD[0], ROOT_HOLD[1], np.hypot(px - root[0], py - root[1]) / scale)
    alpha = np.maximum(alpha, hold * smoothstep(0, 11, inside))
    return np.where(inside_mask, alpha, 0), inside_mask


def main():
    alpha, inside = bake()
    image = Image.fromarray(np.round(alpha * 255).astype(np.uint8), 'L').convert('RGB')
    image.save(OUT, quality=82, method=6)
    solid = float((alpha[inside] > .98).mean())
    faded = float((alpha[inside] < .02).mean())
    print(f'{OUT.name}: {image.size[0]}x{image.size[1]}, {OUT.stat().st_size / 1000:.0f} KB; membrane solid {solid:.0%}, fully gone {faded:.0%}, in between {1 - solid - faded:.0%}')
    if '--preview' in sys.argv:
        image.save(sys.argv[sys.argv.index('--preview') + 1])


if __name__ == '__main__':
    main()
