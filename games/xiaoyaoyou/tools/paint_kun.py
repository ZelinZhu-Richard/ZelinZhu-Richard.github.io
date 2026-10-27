"""Bake reference-derived color atlases in normalized sheet/body coordinates.

No changes to ref/. Geometry constants are deliberately not inputs: scaling a
fin later must never change its UV arrays, paint layout, or local span weights.
"""
import json
import math
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi
from skimage.measure import approximate_polygon, find_contours
from silhouette import ROOT, reference_views

PAPER = np.array([246, 236, 220], dtype=np.float32) / 255
INK = np.array([43, 55, 70], dtype=np.float32) / 255
OUT = ROOT / '_dev/raw'


def smoothstep(lo, hi, value):
    value = np.clip((value - lo) / (hi - lo), 0, 1)
    return value * value * (3 - 2 * value)


def continuous_fluke(plan):
    _, mask, _ = reference_views('kun')['top']
    lobes = [plan['outlines'][f'fluke-image-{side}'] for side in ['left', 'right']]
    first_y = min(y for lobe in lobes for x, y in lobe['pixelsXY'])
    # Keep the original reference's center stock and notch, not the subtracted
    # two-lobe mask. The extra 12 pixels embed the sheet into the frozen stock.
    yy = np.arange(mask.shape[0])[:, None]
    region = mask & (yy >= math.floor(first_y - 12))
    region = ndi.binary_fill_holes(region)
    contour = max(find_contours(ndi.gaussian_filter(region.astype(float), .65) >= .5, .5), key=len)
    lo, hi = .01, 4.0
    for _ in range(32):
        tolerance = (lo + hi) / 2
        points = approximate_polygon(contour, tolerance)
        if len(points) > 181:
            lo = tolerance
        else:
            hi = tolerance
    outline = approximate_polygon(contour, hi)
    if np.linalg.norm(outline[0] - outline[-1]) < 1e-6:
        outline = outline[:-1]
    root = [plan['alignment']['centerX'], float(first_y)]
    tip = int(np.linalg.norm(outline - np.array(root[::-1]), axis=1).argmax())
    record = {'pixelsXY': [[float(x), float(y)] for y, x in outline],
              'rootXY': root, 'tipIndex': tip, 'simplifiedPoints': len(outline),
              'source': 'complete reference fluke and center stock; single outer contour',
              'sourceStockCutY': math.floor(first_y - 12), 'attachmentReferenceY': first_y}
    plan['outlines']['fluke-combined'] = record
    return record


def sheet_texture(name, record, sheet, waves, is_fluke=False):
    outline = np.array(record['pixelsXY'])
    x0, y0 = np.floor(outline.min(axis=0)).astype(int)
    x1, y1 = np.ceil(outline.max(axis=0)).astype(int)
    width, height = x1 - x0 + 1, y1 - y0 + 1
    mask_image = Image.new('L', sheet.size)
    ImageDraw.Draw(mask_image).polygon([tuple(point) for point in outline], fill=255)
    mask = np.array(mask_image)[y0:y1 + 1, x0:x1 + 1] > 127
    inside = ndi.distance_transform_edt(mask)
    # Sample only two pixels inside the paint, then nearest-fill outward. Grey
    # background cannot bleed into the polygon, even at its thin pointed tips.
    safe = inside >= 2.0
    raw = np.array(sheet)[y0:y1 + 1, x0:x1 + 1, :3]
    nearest = ndi.distance_transform_edt(~safe, return_distances=False, return_indices=True)
    filled = raw[nearest[0], nearest[1]]
    factor = min(2048 / width, 2048 / height)
    size = (max(1, round(width * factor)), max(1, round(height * factor)))
    base = np.array(Image.fromarray(filled).resize(size, Image.Resampling.LANCZOS), dtype=np.float32) / 255
    yy, xx = np.mgrid[0:size[1], 0:size[0]].astype(np.float32)
    px = x0 + xx / max(size[0] - 1, 1) * (x1 - x0)
    py = y0 + yy / max(size[1] - 1, 1) * (y1 - y0)
    root = np.array(record['rootXY'])
    tip = np.array(record['pixelsXY'][record['tipIndex']])
    axis = (tip - root) / np.linalg.norm(tip - root)
    span = np.clip(((px - root[0]) * axis[0] + (py - root[1]) * axis[1]) / np.linalg.norm(tip - root), 0, 1)
    radius = np.hypot(px - root[0], py - root[1]) / np.linalg.norm(tip - root)
    root_fade = smoothstep(.04, .30, radius)
    base = PAPER + (base - PAPER) * root_fade[..., None]
    dark = (.06 + .15 * span + .06 * smoothstep(root[1], y1, py)) * root_fade
    base = base * (1 - dark[..., None]) + INK * dark[..., None]
    # High-pass wave layer adds detail without replacing the reference layout.
    wave = np.array(waves.convert('RGB'), dtype=np.float32) / 255
    detail = wave - ndi.gaussian_filter(wave, (6, 6, 0))
    sy = yy / max(size[1] - 1, 1) * (wave.shape[0] - 1) * 3.7
    sx = xx / max(size[0] - 1, 1) * (wave.shape[1] - 1) * 3.7
    high = np.stack([ndi.map_coordinates(detail[..., channel], [sy, sx], order=1, mode='mirror') for channel in range(3)], axis=2)
    base += .32 * high * root_fade[..., None]
    # Fine rays radiate from root to actual traced edge points. Their opacity
    # is low; this is internal ink detail, not a hard silhouette outline.
    rays = Image.new('L', size)
    draw = ImageDraw.Draw(rays)
    targets = outline[np.linalg.norm(outline - root, axis=1) > np.linalg.norm(tip - root) * .48][::5]
    root_uv = ((root[0] - x0) / (x1 - x0) * (size[0] - 1), (root[1] - y0) / (y1 - y0) * (size[1] - 1))
    for i, target in enumerate(targets):
        end = ((target[0] - x0) / (x1 - x0) * (size[0] - 1), (target[1] - y0) / (y1 - y0) * (size[1] - 1))
        middle = (root_uv[0] * .45 + end[0] * .55 + 4 * math.sin(i), root_uv[1] * .45 + end[1] * .55)
        draw.line([root_uv, middle, end], fill=255, width=1)
    ray = np.array(rays.filter(ImageFilter.GaussianBlur(.6)), dtype=np.float32) / 255 * .19
    base = base * (1 - ray[..., None]) + INK * ray[..., None]
    # Slightly darker ink on the traced wavy aft edge; fill remains beneath it.
    edge = ((inside <= 1.5) & mask & (np.arange(height)[:, None] + y0 > root[1]))
    edge_image = np.array(Image.fromarray((edge * 255).astype(np.uint8)).resize(size, Image.Resampling.BILINEAR), dtype=np.float32) / 255
    edge_ink = edge_image * .24
    base = base * (1 - edge_ink[..., None]) + INK * edge_ink[..., None]
    base = np.clip(base, 0, 1)
    whiteness = base.min(axis=2)
    alpha = .43 + .57 * np.clip((.94 - whiteness) / .70, 0, 1)
    if is_fluke:
        # The stock/bridge must not become a transparent visual seam.
        stock = np.exp(-((px - root[0]) / 20) ** 2) * (1 - smoothstep(y0 + 35, y0 + 95, py))
        alpha = alpha * (1 - stock) + stock
    # The actual outline is geometry; the filled texture covers every edge.
    rgba = np.dstack([base, alpha])
    filename = OUT / f'kun-{name}-paint.png'
    Image.fromarray(np.round(rgba * 255).astype(np.uint8)).save(filename)
    return {'path': str(filename.relative_to(ROOT)), 'size': list(size),
            'referenceCrop': [int(x0), int(y0), int(x1), int(y1)],
            'referenceInsetPx': 2, 'outwardFill': 'nearest safe interior paint',
            'waveHighPassWeight': .32, 'rayOpacity': .19, 'aftEdgeOpacity': .24,
            'nativeReferenceCropSize': [int(width), int(height)]}


def body_texture():
    source = np.array(Image.open(ROOT / 'ref/tex-kun-landscape.png').convert('RGB'), dtype=np.float32) / 255
    width, height = 2048, 2048
    vv, uu = np.mgrid[0:height, 0:width].astype(np.float32)
    uu /= width - 1
    vv /= height - 1
    # Atlas center is the spine; edges are the belly seam. UVs measure arc
    # distance, not angle. Linear source sampling has no compressed-sky fold.
    tt = np.abs(2 * vv - 1)
    offset = np.where(vv < .5, .0, .32)
    sx = (offset + .68 * uu) * (source.shape[1] - 1)
    sy = (.20 + .78 * tt) * (source.shape[0] - 1)
    paint = np.stack([ndi.map_coordinates(source[..., c], [sy, sx], order=1, mode='nearest') for c in range(3)], axis=2)
    ventral = smoothstep(.62, .80, tt)
    behind_eyes = smoothstep(.205, .275, uu)
    head_gate = behind_eyes * (1 - ventral) + smoothstep(.06, .14, uu) * ventral
    result = PAPER + (paint - PAPER) * ((1 - .60 * ventral) * head_gate)[..., None]
    # Both independent paintings fade into one continuous, low-frequency mist
    # at the spine. The common wash has distant peaks but no mirrored trees.
    soft = ndi.gaussian_filter(source, (9, 9, 0))
    mist_x = (.17 + .64 * uu) * (source.shape[1] - 1)
    mist_y = (.27 + .30 * tt) * (source.shape[0] - 1)
    distant = np.stack([ndi.map_coordinates(soft[..., c], [mist_y, mist_x], order=1, mode='nearest') for c in range(3)], axis=2)
    mist = .80 * distant + .20 * INK
    mist = PAPER + (mist - PAPER) * behind_eyes[..., None]
    ridge_blend = (1 - smoothstep(.0, .13, tt))
    result = result * (1 - ridge_blend[..., None]) + mist * ridge_blend[..., None]
    # Same gentle wash at the belly seam, retaining the accepted 40% painting.
    belly_blend = smoothstep(.92, 1, tt)
    belly = PAPER + .40 * (distant - PAPER) * head_gate[..., None]
    result = result * (1 - belly_blend[..., None]) + belly * belly_blend[..., None]
    output = OUT / 'kun-body-landscape.png'
    pixels = np.round(np.clip(result, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(pixels).save(output)
    flank_difference = np.abs(pixels[height // 2 + 80:height // 2 + 350].astype(float) - pixels[height // 2 - 350:height // 2 - 80][::-1]).mean()
    return {'path': str(output.relative_to(ROOT)), 'size': [width, height],
            'flanks': 'independent source regions [0,.68] and [.32,1]; upright peaks; no repeat',
            'sourceOffsetFraction': .32, 'sourceWidthFraction': .68,
            'sourceVerticalRange': [.20, .98], 'uv': 'full circumference; ellipse arc distance',
            'flankMeanAbsoluteRGBDifference': float(flank_difference),
            'ventralStrength': .40, 'headPaintStartBodyFraction': .205,
            'dorsalReferenceWash': True, 'dorsalSeamSharedSample': True,
            'seams': 'continuous soft mist at spine and belly; no mirrored flank artwork'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--body-only', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.body_only:
        filename = ROOT / '_dev/build/kun-paint.json'
        report = json.loads(filename.read_text())
        report['body'] = body_texture()
        filename.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'bodyOnly': True, 'body': report['body']}, indent=2))
        return
    filename = ROOT / 'blender/kun-planforms.json'
    plan = json.loads(filename.read_text())
    combined = continuous_fluke(plan)
    filename.write_text(json.dumps(plan, indent=2) + '\n')
    sheet = Image.open(ROOT / 'ref/kun-sheet.png').convert('RGB')
    waves = Image.open(ROOT / 'ref/tex-fin-waves.png')
    report = {'generator': 'tools/paint_kun.py',
              'pectoral': sheet_texture('pectoral', plan['outlines']['pectoral-image-left'], sheet, waves),
              'fluke': sheet_texture('fluke', combined, sheet, waves, is_fluke=True),
              'body': body_texture(), 'continuousFlukeOutlinePoints': combined['simplifiedPoints']}
    (ROOT / '_dev/build/kun-paint.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
