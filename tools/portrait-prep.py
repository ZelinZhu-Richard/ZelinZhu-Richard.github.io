#!/usr/bin/env python3
"""Turn the living-portrait source photos into the small data sheets the browser loads.

Usage (from the repo root):
    python3 tools/portrait-prep.py                 # writes workspace/portrait/data/<id>.png
    python3 tools/portrait-prep.py --preview DIR   # also writes cut-out previews for checking

Needs Python 3 with Pillow, numpy, scipy and scikit-image. Settings live in workspace/portrait/prep.json.
The source photos stay local (workspace/portrait/photos/ is gitignored); only the data sheets are committed.

Each data sheet is one 8-bit greyscale PNG, W wide and 6*H tall: six W x H planes stacked top to bottom.
  0  tone      0 = darkest, 255 = white. The background is flattened to white.
  1  edge      gradient magnitude (how sharp the local contrast is)
  2  angle     gradient direction, 0..pi mapped to 0..255. Contours run at right angles to it.
  3  matte     255 = person, 0 = background, soft at the edge
  4  lines     difference-of-Gaussians line map: thin dark features (eyes, glasses, mouth)
  5  warmth    how warm (red minus blue) the colour is: separates skin and lips from hair and the grey sweater
Greyscale without alpha so browsers decode the values exactly (no premultiplication).
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import exposure, restoration

ROOT = Path(__file__).resolve().parent.parent
PORTRAIT = ROOT / 'workspace' / 'portrait'


def align(photo, eyes_src, size, eyes_cfg):
    """Rotate and scale the photo so both eyes land on the configured spots. Returns RGB float and a validity mask."""
    w, h = size
    (lx, ly), (rx, ry) = eyes_src
    dl = np.array([eyes_cfg['left'] * w, eyes_cfg['y'] * h])
    dr = np.array([eyes_cfg['right'] * w, eyes_cfg['y'] * h])
    # Downscale the original first so the affine resample does not alias.
    scale_guess = np.linalg.norm(dr - dl) / np.hypot(rx - lx, ry - ly)
    pre = max(1, int(1 / scale_guess / 1.5))
    if pre > 1:
        photo = photo.resize((photo.width // pre, photo.height // pre), Image.LANCZOS)
        lx, ly, rx, ry = lx / pre, ly / pre, rx / pre, ry / pre
    src_l, src_r = np.array([lx, ly]), np.array([rx, ry])
    # Similarity transform from output pixels back to source pixels.
    vs, vd = src_r - src_l, dr - dl
    s = np.linalg.norm(vs) / np.linalg.norm(vd)
    ang = np.arctan2(vs[1], vs[0]) - np.arctan2(vd[1], vd[0])
    a, b = s * np.cos(ang), s * np.sin(ang)
    m = np.array([[a, -b], [b, a]])
    t = src_l - m @ dl
    coeffs = (m[0, 0], m[0, 1], t[0], m[1, 0], m[1, 1], t[1])
    rgb = photo.transform((w, h), Image.AFFINE, coeffs, resample=Image.BICUBIC)
    valid = Image.new('L', photo.size, 255).transform((w, h), Image.AFFINE, coeffs, resample=Image.BILINEAR)
    return np.asarray(rgb, dtype=np.float32), np.asarray(valid, dtype=np.float32) / 255 > 0.99


def wall_model(rgb, valid):
    """Fit a smooth quadratic surface per colour channel to the wall around the person."""
    h, w, _ = rgb.shape
    yy, xx = np.mgrid[0:h, 0:w]
    seed = valid & ((yy < h * 0.16) | (((xx < w * 0.12) | (xx > w * 0.88)) & (yy < h * 0.55)))
    x, y = xx[seed] / w, yy[seed] / h
    basis = lambda x, y: np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], 1)
    cols = rgb[seed]
    keep = np.ones(len(x), bool)
    for _ in range(4):  # robust refit: drop hair and shoulders that reach into the seed bands
        coef, *_ = np.linalg.lstsq(basis(x[keep], y[keep]), cols[keep], rcond=None)
        res = np.linalg.norm(cols - basis(x, y) @ coef, axis=1)
        mad = np.median(res[keep]) + 1e-3
        keep = res < 3.5 * mad + 4
    full = basis(xx.ravel() / w, yy.ravel() / h) @ coef
    return full.reshape(h, w, 3)


def matte(rgb, valid):
    """Person mask. The wall is smooth and close to the fitted wall colour (or a shadow of it);
    the sweater can be the same grey as the wall, but it is textured, so smoothness is required too."""
    valid = ndi.binary_erosion(valid, iterations=3, border_value=1)  # resampled frame edges are not wall
    wall = wall_model(rgb, valid)
    dist = ndi.gaussian_filter(np.linalg.norm(rgb - wall, axis=2), 1.0)
    lum = ndi.gaussian_filter(rgb.mean(2), 0.7)
    texture = np.sqrt(np.clip(ndi.uniform_filter(lum * lum, 7) - ndi.uniform_filter(lum, 7) ** 2, 0, None))
    smooth = ndi.gaussian_filter(texture, 1.5) < 3.2
    chroma = lambda c: c / (c.sum(2, keepdims=True) + 1e-3)
    tint = np.linalg.norm(chroma(rgb) - chroma(wall), axis=2)
    ratio = rgb.mean(2) / (wall.mean(2) + 1e-3)
    shadow = (tint < 0.018) & (ratio > 0.5) & (ratio < 1.3)  # a darker or lighter patch of the same wall
    h, w = dist.shape
    # Region grow: start from clear wall touching the frame, spread through anything smooth and wall-like.
    lab, _ = ndi.label((smooth & ((dist < 30) | shadow)) | ~valid)
    border = np.zeros_like(valid)
    border[0, :] = border[:, 0] = border[:, -1] = True
    border[: int(h * 0.75), 0] = border[: int(h * 0.75), -1] = True
    seeds = np.unique(lab[(border | ~valid) & ((dist < 14) | ~valid)])
    bg = np.isin(lab, seeds[seeds > 0])
    fg = ~bg
    lab, n = ndi.label(fg)
    if n:
        sizes = ndi.sum(fg, lab, range(1, n + 1))
        fg = lab == (1 + int(np.argmax(sizes)))
    fg = ndi.binary_fill_holes(fg)
    # The texture test blurs across the outline and leaves a rim of wall around the person.
    # Within a thin band at the outline, colour alone decides.
    band = fg & ~ndi.binary_erosion(fg, iterations=10, border_value=1)
    fg &= ~(band & ((dist < 26) | shadow))
    fg = ndi.binary_opening(np.pad(fg, 4, mode='edge'), iterations=2)[4:-4, 4:-4]
    lab, n = ndi.label(fg)
    if n:
        sizes = ndi.sum(fg, lab, range(1, n + 1))
        fg = lab == (1 + int(np.argmax(sizes)))
    fg = ndi.binary_closing(np.pad(fg, 4, mode='edge'), iterations=2)[4:-4, 4:-4]
    return np.clip(ndi.gaussian_filter(fg.astype(np.float32), 1.2), 0, 1)


def planes(rgb, m, out_size):
    w, h = out_size
    lum = (rgb @ np.array([0.299, 0.587, 0.114], np.float32)) / 255
    warm = ndi.gaussian_filter((rgb[..., 0] - rgb[..., 2]) / (rgb.sum(2) + 1), 1.5)
    warm = np.clip((warm - 0.03) / 0.14, 0, 1)
    inside = m > 0.5
    lo, hi = np.percentile(lum[inside], [1.5, 99])
    lum = np.clip((lum - lo) / (hi - lo), 0, 1)
    # Local contrast so faint features (brows, lips, the jaw line) survive coarse styles.
    eq = exposure.equalize_adapthist(lum, kernel_size=(lum.shape[0] // 6, lum.shape[1] // 6), clip_limit=0.012)
    lum = 0.55 * lum + 0.45 * eq
    tone = m * lum + (1 - m)  # flatten the background to white

    def down(a):
        return np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize((w, h), Image.LANCZOS))

    tone, m, warm = np.clip(down(tone), 0, 1), np.clip(down(m), 0, 1), np.clip(down(warm), 0, 1)
    g = ndi.gaussian_filter(tone, 0.8)
    gx, gy = ndi.sobel(g, 1), ndi.sobel(g, 0)
    mag = np.hypot(gx, gy)
    region = ndi.binary_dilation(m > 0.2, iterations=3)
    edge = np.clip(mag / (np.percentile(mag[region], 98) + 1e-6), 0, 1) ** 0.8
    # Structure tensor: a smoothed, sign-free gradient direction, so strokes follow contours coherently.
    jxx, jxy, jyy = (ndi.gaussian_filter(v, 2.5) for v in (gx * gx, gx * gy, gy * gy))
    angle = (0.5 * np.arctan2(2 * jxy, jxx - jyy)) % np.pi
    dog = ndi.gaussian_filter(tone, 0.9) - ndi.gaussian_filter(tone, 1.6 * 0.9)
    neg = np.clip(-dog, 0, None)
    lines = np.clip(neg / (np.percentile(neg[region], 99) + 1e-6), 0, 1) ** 0.8
    # Drop speckle (sweater texture, skin pores): keep only line pieces that are a few pixels long.
    lab, n = ndi.label(lines > 0.25)
    if n:
        sizes = ndi.sum(np.ones_like(lines), lab, range(1, n + 1))
        keep = np.concatenate([[False], sizes >= 7])[lab]
        lines = np.where(keep | (lines > 0.7), lines, lines * 0.3)

    # Quantise and zero the background so the PNG compresses well; the browser never needs finer steps.
    def q(a, levels, mask=None):
        a = np.round(np.clip(a, 0, 1) * (levels - 1)) / (levels - 1)
        if mask is not None:
            a = np.where(mask, a, 0)
        return np.clip(np.round(a * 255), 0, 255).astype(np.uint8)

    return np.vstack([q(tone, 64), q(edge, 16, region), q(angle / np.pi, 32, region), q(m, 32), q(lines, 16, region), q(warm, 16, region)])


# Where the features sit, in eye-distance units from the midpoint between the eyes (x right, y down).
# The alignment puts the eyes in the same place in every photo, so these hold for both poses.
FACE = {
    'eyes': [(-0.5, 0.0), (0.5, 0.0)],
    'brows': [(-0.52, -0.24), (0.52, -0.24)],
    'mouth': (0.0, 1.17),
    'nose': (0.0, 0.55),
    'face': ((0.0, 0.62), (1.12, 1.25)),  # centre, half-width/half-height of the face oval
    'hairline': 0.62,                      # hair edits stay above this (below the eyes it is ears and jaw)
}


def retouch(rgb, m, eyes_cfg, r):
    """Gentle portrait retouch, all strengths from prep.json "retouch" (0 turns a step off).
    Returns the edited RGB and matte. Classical image operations; nothing leaves the machine."""
    h, w, _ = rgb.shape
    iod = (eyes_cfg['right'] - eyes_cfg['left']) * w
    cx, cy = w / 2, eyes_cfg['y'] * h
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    pt = lambda p: (cx + p[0] * iod, cy + p[1] * iod)

    def ellipse(c, rx, ry, soft=1.0):
        x0, y0 = pt(c)
        d = np.sqrt(((xx - x0) / (rx * iod)) ** 2 + ((yy - y0) / (ry * iod)) ** 2)
        return np.clip((1 + soft - d) / soft, 0, 1) if soft else (d <= 1).astype(np.float32)

    lum = lambda a: (a @ np.array([0.299, 0.587, 0.114], np.float32)) / 255
    out, m = rgb.copy(), m.copy()

    # 1. Eyes a touch larger: a smooth bulge around each pupil (does not reach glasses frames).
    s = r.get('eyeEnlarge', 0)
    if s:
        sx, sy = xx.copy(), yy.copy()
        R = 0.34 * iod
        for e in FACE['eyes']:
            x0, y0 = pt(e)
            dx, dy = xx - x0, yy - y0
            k = np.clip(1 - (dx * dx + dy * dy) / (R * R), 0, 1) ** 2
            sx -= dx * s * k
            sy -= dy * s * k
        out = np.stack([ndi.map_coordinates(out[..., c], [sy, sx], order=1, mode='nearest') for c in range(3)], -1)

    face = ellipse(FACE['face'][0], *FACE['face'][1], soft=0.15)
    warmth = ndi.gaussian_filter((out[..., 0] - out[..., 2]) / (out.sum(2) + 1), 1.5)
    skin = (m > 0.5) & (warmth > 0.06) & (lum(out) > 0.22)
    protect = np.zeros((h, w), np.float32)  # features that blemish removal and smoothing leave alone
    for e in FACE['eyes']:
        protect = np.maximum(protect, ellipse(e, 0.36, 0.2, 0.3))
    for b in FACE['brows']:
        protect = np.maximum(protect, ellipse(b, 0.36, 0.13, 0.3))
    protect = np.maximum(protect, ellipse(FACE['mouth'], 0.5, 0.2, 0.3))
    protect = np.maximum(protect, ellipse(FACE['nose'], 0.32, 0.2, 0.3))
    for k in r.get('keep', []):
        protect = np.maximum(protect, ellipse(k, 0.09, 0.09, 0.5))

    # 2. Hair: round off the late-night flyaways on the outline, fill small notches, calm stray strands.
    hr = r.get('hairOutline', 0)
    above = np.clip((cy + FACE['hairline'] * iod - yy) / (0.15 * iod), 0, 1)  # 1 above the ears, fading out
    if hr:
        fg = m > 0.5
        smooth = ndi.gaussian_filter(fg.astype(np.float32), hr) > 0.5
        new = np.where(above > 0.5, smooth, fg)
        lost, gained = fg & ~new, new & ~fg
        hairish = (m > 0.5) & (lum(out) < 0.32) & (above > 0)
        wsum = ndi.gaussian_filter(hairish.astype(np.float32), 5) + 1e-4
        hair_col = np.stack([ndi.gaussian_filter(out[..., c] * hairish, 5) for c in range(3)], -1) / wsum[..., None]
        out[gained] = hair_col[gained]
        m = np.clip(ndi.gaussian_filter(new.astype(np.float32), 1.2), 0, 1)
        out[lost & (m < 0.5)] = out[lost & (m < 0.5)]  # background pixels: the matte hides them
    hs = r.get('hairSmooth', 0)
    if hs:
        hair = ((m > 0.5) & (lum(out) < 0.36)).astype(np.float32) * above
        hair = ndi.gaussian_filter(hair, 1.5)
        # Edge-preserving: evens out stray bright strands but keeps the direction of the hair.
        calm = restoration.denoise_bilateral(out / 255, sigma_color=0.08, sigma_spatial=2.5, channel_axis=-1) * 255
        out = out + (calm - out) * (hs * hair)[..., None]

    # 3. Blemishes: small spots darker than the skin around them, outside the features, filled from the surroundings.
    if r.get('blemish'):
        L = lum(out)
        resid = L - ndi.median_filter(L, size=13)
        # Label dark detail across the whole person first, so a glasses frame stays one long piece
        # (and is rejected) instead of breaking into spot-sized fragments where it crosses the cheek.
        lab, n = ndi.label((resid < -0.03) & (m > 0.5))
        allowed = skin & (face > 0) & (protect < 0.05) & ndi.binary_erosion(m > 0.5, iterations=7)  # not the jaw-line shadow
        spots = np.zeros_like(allowed)
        for i, sl in enumerate(ndi.find_objects(lab), 1):
            if sl is None:
                continue
            comp = lab[sl] == i
            size = comp.sum()
            hgt, wid = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if 2 <= size <= 70 and max(hgt, wid) <= 14 and allowed[sl][comp].mean() > 0.9:
                spots[sl] |= comp
        spots = ndi.binary_dilation(spots, iterations=2)
        keep = (~spots & (m > 0.5)).astype(np.float32)  # fill from the surrounding skin only, never the wall
        wsum = ndi.gaussian_filter(keep, 4) + 1e-4
        fill = np.stack([ndi.gaussian_filter(out[..., c] * keep, 4) for c in range(3)], -1) / wsum[..., None]
        soft = ndi.gaussian_filter(spots.astype(np.float32), 1.0)[..., None]
        out = out + (fill - out) * soft

    # 4. Skin: soften fine texture (pores, bumps) but not edges such as glasses frames or the jaw line.
    ss = r.get('skinSmooth', 0)
    inner = ndi.binary_erosion(m > 0.5, iterations=4)  # stay off the outline, where the wall would bleed in
    skin_soft = ndi.gaussian_filter((skin & inner).astype(np.float32), 2) * face * (1 - protect)
    person = (m > 0.5).astype(np.float32)
    wperson = lambda a, sg: np.stack([ndi.gaussian_filter(a[..., c] * person, sg) for c in range(3)], -1) / (ndi.gaussian_filter(person, sg)[..., None] + 1e-4)
    if ss:
        low = wperson(out, 2.5)  # blur only over the person, never mixing in the wall
        high = out - low
        mag = np.abs(high).mean(2, keepdims=True)
        texture = np.exp(-(mag / 9.0) ** 2)  # small differences are texture; large ones are real edges
        out = out - high * (ss * texture * skin_soft[..., None])

    # 5. Shine: pull bright hot spots (nose, forehead) back towards the surrounding skin.
    sh = r.get('shine', 0)
    if sh:
        L = lum(out)
        local = ndi.gaussian_filter(L, 8)
        hot = np.clip((L - local - 0.03) / 0.08, 0, 1) * (L > 0.62) * skin_soft
        hot = ndi.gaussian_filter(hot, 1.5)
        base = wperson(out, 8)
        out = out + (base - out) * (sh * hot)[..., None]

    # 6. Under the eyes: lift the darker band towards the cheek tone.
    ue = r.get('underEye', 0)
    if ue:
        for e in FACE['eyes']:
            band = ellipse((e[0], e[1] + 0.27), 0.3, 0.1, 0.8)
            ck = ellipse((e[0], e[1] + 0.6), 0.2, 0.12, 0)
            cheek = np.median(out[(ck > 0) & skin], axis=0) if ((ck > 0) & skin).any() else None
            if cheek is None:
                continue
            darker = np.clip((lum(cheek[None, None, :])[0, 0] - lum(out)) / 0.1, 0, 1)
            out = out + (cheek - out) * (ue * band * darker)[..., None]

    # 7. Eyes: a little crisper, whites a little brighter.
    ed = r.get('eyeDefine', 0)
    if ed:
        for e in FACE['eyes']:
            region = ellipse(e, 0.3, 0.14, 0.5)[..., None]
            blur = np.stack([ndi.gaussian_filter(out[..., c], 1.6) for c in range(3)], -1)
            sharp = out + (out - blur) * 1.2
            L = lum(out)[..., None]
            bright = np.clip((L - 0.45) / 0.3, 0, 1)
            sharp = sharp + bright * 14
            out = out + (sharp - out) * ed * region

    # 8. Brows: deepen the hairs that are already there.
    br = r.get('brows', 0)
    if br:
        L = lum(out)
        local = ndi.gaussian_filter(L, 4)
        for b in FACE['brows']:
            region = ellipse(b, 0.32, 0.1, 0.6)
            dark = np.clip((local - L) / 0.06, 0, 1) * region
            out = out * (1 - br * dark)[..., None]

    # 9. Lips: a little more colour and definition.
    lp = r.get('lips', 0)
    if lp:
        region = ellipse(FACE['mouth'], 0.36, 0.14, 0.6)[..., None]
        grey = lum(out)[..., None] * 255
        sat = grey + (out - grey) * 1.35
        out = out + (sat - out) * lp * region

    return np.clip(out, 0, 255).astype(np.float32), m


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--preview', type=Path, help='also write cut-out previews to this folder')
    args = parser.parse_args()
    cfg = json.loads((PORTRAIT / 'prep.json').read_text())
    w, h = cfg['size']
    work = (w * 2, h * 2)  # matte and tone at twice the output size, then downsample
    out = PORTRAIT / 'data'
    out.mkdir(exist_ok=True)
    for pid, p in cfg['photos'].items():
        photo = Image.open(PORTRAIT / p['file']).convert('RGB')
        eyes = [[c / 1 for c in p['leftEye']], [c / 1 for c in p['rightEye']]]
        rgb, valid = align(photo, eyes, work, cfg['eyes'])
        m = matte(rgb, valid)
        before, m_before = rgb, m
        if cfg.get('retouch'):
            r = dict(cfg['retouch'])
            r['keep'] = r.get('keep', {}).get(pid, [])
            rgb, m = retouch(rgb, m, cfg['eyes'], r)
        sheet = planes(rgb, m, (w, h))
        Image.fromarray(sheet, 'L').save(out / f'{pid}.png', optimize=True)
        print(f'{pid}: {out / (pid + ".png")} {(out / (pid + ".png")).stat().st_size} bytes')
        if args.preview:
            args.preview.mkdir(parents=True, exist_ok=True)
            cut = lambda c, mm: (c * mm[..., None] + 255 * (1 - mm[..., None])).astype(np.uint8)
            Image.fromarray(cut(rgb, m)).save(args.preview / f'{pid}-cutout.png')
            Image.fromarray(np.hstack([cut(before, m_before), np.full((h * 2, 8, 3), 40, np.uint8), cut(rgb, m)])).save(args.preview / f'{pid}-before-after.png')
            Image.fromarray(sheet, 'L').save(args.preview / f'{pid}-planes.png')


if __name__ == '__main__':
    main()
