"""Cut the two real sky elements for 05-moonlit-desert-oasis out of their photographs.

Run once from workspace/pov-films (system Python, isolated mode because the plates are
downloaded data):

    python3 -I films/05-moonlit-desert-oasis/prep_plates.py

Writes, next to this file in plates/:
  moon_beletsky.tif   RGBA 16-bit, sRGB-encoded, premultiplied: the earthshine crescent from
                      eso-beletsky-paranal-33 with the twilight gradient behind it removed
  comet_mcnaught.tif  RGB 16-bit, sRGB-encoded: Comet McNaught from eso-mc-naught55 with the
                      star trails and the sky gradient removed (for additive use)
  *.png               8-bit previews
"""
import os
import sys
import numpy as np
import tifffile
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'plates')
os.makedirs(OUT, exist_ok=True)

# Adobe RGB (1998) linear -> linear Rec.709 / sRGB primaries (both D65)
A2X = np.array([[0.5767309, 0.1855540, 0.1881852],
                [0.2973769, 0.6273491, 0.0752741],
                [0.0270343, 0.0706872, 0.9911085]])
X2S = np.array([[3.2404542, -1.5371385, -0.4985314],
                [-0.9692660, 1.8760108, 0.0415560],
                [0.0556434, -0.2040259, 1.0572252]])
A2S = X2S @ A2X
EARTHSHINE = 0.08


def adobe_to_lin709(a):
    lin = np.power(np.clip(a, 0, 1), 563.0 / 256.0)
    return np.clip(lin @ A2S.T, 0, None)


def lin_to_srgb(a):
    a = np.clip(a, 0, 1)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)


def save16(path, arr):
    tifffile.imwrite(path, np.ascontiguousarray((np.clip(arr, 0, 1) * 65535 + 0.5).astype(np.uint16)),
                     photometric='rgb')


def preview(path, arr):
    Image.fromarray((np.clip(arr[..., :3], 0, 1) * 255 + 0.5).astype(np.uint8)).save(path)


def moon():
    src = os.path.join(ROOT, 'assets/sky/eso-beletsky-paranal-33/beletsky-paranal-33-cc.tif')
    a = tifffile.memmap(src)
    H, W = a.shape[:2]
    cx, cy = 0.404 * W, 0.725 * H
    half = 760
    x0, y0 = int(cx - half), int(cy - half)
    c = np.asarray(a[y0:y0 + 2 * half, x0:x0 + 2 * half, :3], np.float64) / 65535.0
    lin = adobe_to_lin709(c)
    n = lin.shape[0]
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float64)
    # disc geometry measured from luminance profiles through the crop (limb edges at
    # x 171 / 1333 and y 232 / 1282): the low Moon is flattened about 10 percent by refraction
    ccx, ccy, ra, rb = 752.0, 757.0, 581.0, 525.0
    rad = ra
    print('moon disc centre %.1f %.1f semi-axes %.1f %.1f (crop %d)' % (ccx, ccy, ra, rb, n))
    r = np.hypot(xx - ccx, (yy - ccy) * ra / rb)
    # background: low-order 2D polynomial fitted to an annulus outside the disc
    ann = (r > rad * 1.06) & (r < rad * 1.25)
    X = (xx - ccx) / rad
    Y = (yy - ccy) / rad
    terms = [np.ones_like(X), X, Y, X * X, X * Y, Y * Y, X ** 3, Y ** 3, X * X * Y, X * Y * Y]
    Am = np.stack([t[ann] for t in terms], 1)
    bg = np.zeros_like(lin)
    for ch in range(3):
        coef, *_ = np.linalg.lstsq(Am, lin[..., ch][ann], rcond=None)
        bg[..., ch] = sum(cf * t for cf, t in zip(coef, terms))
    obj = np.clip(lin - bg, 0, None)
    # soft disc alpha (2 px feather at source scale)
    alpha = np.clip((rad + 1.5 - r) / 3.0, 0, 1)
    obj *= alpha[..., None]
    # crop square around the disc with a margin, downsample to 512
    side = int(rad * 2 * 1.04)
    sx0, sy0 = int(ccx - side / 2), int(ccy - side / 2)
    obj = obj[sy0:sy0 + side, sx0:sx0 + side]
    alpha = alpha[sy0:sy0 + side, sx0:sx0 + side]
    peak = np.percentile(obj.max(2), 99.9)
    obj = obj / peak
    # Separate the sunlit crescent from the earthshine (smooth mask on luminance) and scale
    # the earthshine down to a few percent of the limb, as the eye sees it in a dark sky
    # (the telephoto exposure lifted it to about 9 percent). Pull the low-altitude red cast
    # part of the way back toward neutral.
    lumo = obj @ np.array([0.2126, 0.7152, 0.0722])
    cres = np.clip((ndimage.gaussian_filter(lumo, 2.0) - 0.12) / 0.10, 0, 1)
    obj = obj * (cres + (1 - cres) * EARTHSHINE)[..., None]
    lumo = obj @ np.array([0.2126, 0.7152, 0.0722])
    obj = lumo[..., None] + (obj - lumo[..., None]) * 0.55
    obj = np.clip(obj, 0, None)
    rgba = np.concatenate([obj, alpha[..., None]], 2)
    img = Image.fromarray(np.zeros((1, 1), np.uint8))
    res = 512
    out = np.zeros((res, res, 4))
    for ch in range(4):
        out[..., ch] = np.asarray(Image.fromarray(rgba[..., ch].astype(np.float32), mode='F').resize(
            (res, res), Image.LANCZOS))
    out = np.clip(out, 0, None)
    out[..., 3] = np.clip(out[..., 3], 0, 1)
    enc = out.copy()
    enc[..., :3] = lin_to_srgb(out[..., :3])
    save16(os.path.join(OUT, 'moon_beletsky.tif'), enc)
    preview(os.path.join(OUT, 'moon_beletsky_preview.png'), lin_to_srgb(out[..., :3] * 6.0))
    print('moon: disc diameter in output %.1f px of %d; earthshine/limb %.4f' % (
        2 * rad * res / side, res, np.median(out[..., :3].max(2)[out[..., 3] > 0.99])))


def comet():
    src = os.path.join(ROOT, 'assets/sky/eso-mc-naught55/mc_naught55.tif')
    im = np.asarray(Image.open(src).convert('RGB'), np.float64) / 255.0
    H, W = im.shape[:2]
    # recommended crop (0.06, 0.27, 0.23, 0.93) widened sideways for background estimation
    x0, x1 = int(0.035 * W), int(0.255 * W)
    y0, y1 = int(0.25 * H), int(0.925 * H)
    c = adobe_to_lin709(im[y0:y1, x0:x1])
    hx, hy = 0.148 * W - x0, 0.893 * H - y0
    print('comet crop %dx%d head at %.0f %.0f' % (c.shape[1], c.shape[0], hx, hy))
    # remove the short star trails without touching the tail: open with a 5 px radius disk,
    # mark pixels that stand well above the opened image (stars), dilate that mask and
    # replace only those pixels by the opened (smoothed) value
    fp = np.hypot(*np.mgrid[-5:6, -5:6]) <= 5.2
    lum = c @ np.array([0.2126, 0.7152, 0.0722])
    lo = ndimage.grey_opening(lum, footprint=fp)
    lo = ndimage.gaussian_filter(lo, 2.0)
    noise = np.median(np.abs(lum - ndimage.median_filter(lum, 5))) * 1.5 + 1e-6
    star = (lum - lo) > (0.07 + 0.3 * lo)
    star = ndimage.binary_dilation(star, iterations=3)
    smooth = np.stack([ndimage.gaussian_filter(ndimage.grey_opening(c[..., ch], footprint=fp), 2.5)
                       for ch in range(3)], 2)
    soft = ndimage.gaussian_filter(star.astype(np.float64), 1.5)[..., None]
    op = c * (1 - soft) + smooth * soft
    op = np.stack([ndimage.gaussian_filter(op[..., ch], 1.2) for ch in range(3)], 2)
    print('comet: star pixels replaced %.1f%%' % (100 * star.mean()))
    # sky gradient: per row, median of the left columns (the tail fans to the right, so the
    # right edge is not clean sky); the gradient is almost purely vertical (horizon below)
    w = c.shape[1]
    L = ndimage.gaussian_filter1d(np.median(op[:, :90], axis=1), 25, axis=0)
    R = ndimage.gaussian_filter1d(np.median(op[:, -60:], axis=1), 25, axis=0)
    t = ((np.arange(w) - 45.0) / (w - 30.0 - 45.0)).clip(0, 1)[None, :, None]
    bg = L[:, None, :] * (1 - t) + R[:, None, :] * t
    obj = op - bg
    # soft noise floor so faint residue does not draw the plate rectangle
    fl = np.std(obj[:, :90], axis=(0, 1)) * 1.5
    obj = np.clip(obj - fl, 0, None)
    # masks: fade at the sides and the top, cut below the head (horizon glow and ridge)
    yy, xx = np.mgrid[0:obj.shape[0], 0:obj.shape[1]].astype(np.float64)
    side = np.clip(np.minimum(xx - 30, w - 1 - xx) / 90.0, 0, 1)
    top = np.clip((yy - 60) / 220.0, 0, 1) ** 1.5
    below = np.clip((hy + 18 - yy) / 14.0, 0, 1)
    obj *= (side * top * below)[..., None]
    # crop to the comet's box
    cx0 = int(0.06 * W) - x0
    cx1 = int(0.23 * W) - x0
    cy0 = int(0.27 * H) - y0
    obj = obj[cy0:int(hy + 40), cx0:cx1]
    print('comet out %dx%d head at %.0f %.0f' % (obj.shape[1], obj.shape[0], hx - cx0, hy - cy0))
    peak = np.percentile(obj.max(2), 99.95)
    obj = obj / peak
    # the head is reddened by the low twilight path; pull it halfway back to neutral
    lum = obj @ np.array([0.2126, 0.7152, 0.0722])
    obj = np.clip(lum[..., None] + (obj - lum[..., None]) * 0.5, 0, None)
    save16(os.path.join(OUT, 'comet_mcnaught.tif'), lin_to_srgb(obj))
    preview(os.path.join(OUT, 'comet_mcnaught_preview.png'), lin_to_srgb(obj * 2.0))


MW_CROP = (0.0, 0.0, 0.535, 0.60)     # x0, y0, x1, y1 of potw2133a: sky only (hill crest at
                                      # y 0.64 near x 0.5, lamp at (0.235, 0.685), dome at x 0.56+)


def milkyway():
    """The galactic core over Paranal (potw2133a, 16-bit Adobe RGB), cropped to sky only.
    The orange horizon glow of the lower rows is flattened (per-row low percentile of a
    star-free background, excess above the level of the rows over it removed) so the plate
    can be rolled without a tilted glow; the film adds its own level dawn line."""
    src = os.path.join(ROOT, 'assets/sky/eso-potw2133a/potw2133a.tif')
    a = tifffile.memmap(src)
    H, W = a.shape[:2]
    x0, y0, x1, y1 = MW_CROP
    c = np.asarray(a[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W), :3], np.float64) / 65535.0
    lin = adobe_to_lin709(c)
    h, w = lin.shape[:2]
    print('milky way crop %dx%d' % (w, h))
    # star-free background on a 1/4 grid: grey opening per channel then blur
    small = lin[::4, ::4]
    fp = np.hypot(*np.mgrid[-3:4, -3:4]) <= 3.2
    bgs = np.stack([ndimage.gaussian_filter(ndimage.grey_opening(small[..., ch], footprint=fp), 3.0)
                    for ch in range(3)], 2)
    # per-row 12th percentile (the dark gaps between dust and stars) as the sky level
    prof = np.percentile(bgs, 12, axis=1)                         # (h/4, 3)
    prof = ndimage.gaussian_filter1d(prof, 6, axis=0)
    rows = np.arange(prof.shape[0]) / prof.shape[0]               # 0..1 within the crop
    ref_i = int(0.62 * prof.shape[0])                             # crop row ~ plate y 0.37
    ref = prof[ref_i]
    excess = np.clip(prof - ref[None, :], 0, None)
    excess[:ref_i] = 0.0
    ramp = np.clip((rows - 0.62) / 0.1, 0, 1)[:, None]
    excess *= ramp
    full = np.stack([np.interp(np.arange(h) / 4.0, np.arange(prof.shape[0]), excess[:, ch]) for ch in range(3)], 1)
    out = np.clip(lin - 0.92 * full[:, None, :], 0, None)
    for f in (0.0, 0.5, 0.75, 0.9, 0.99):
        i = min(int(f * prof.shape[0]), prof.shape[0] - 1)
        print('  row %.2f sky %s excess %s' % (f, np.round(prof[i], 4), np.round(excess[i], 4)))
    enc = lin_to_srgb(out)
    tifffile.imwrite(os.path.join(OUT, 'mw_potw2133a.tif'),
                     np.ascontiguousarray((np.clip(enc, 0, 1) * 65535 + 0.5).astype(np.uint16)),
                     photometric='rgb', compression='zlib')
    prev = np.asarray(Image.fromarray((np.clip(enc, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((w // 4, h // 4),
                                                                                                Image.LANCZOS))
    Image.fromarray(prev).save(os.path.join(OUT, 'mw_potw2133a_preview.png'))


# ---------------------------------------------------------------- round 3 sky: potw1713a
# The narrow southern Milky Way of potw1713a ("Up high", ESO/B. Tafreshi), 77 px per degree
# natively (galactic centre to eta Carinae = 72 deg = 5570 px). Placed with the core low on the
# left, just under the skyline ("rising" behind the town), and the band climbing diagonally to the
# upper right, with dark sky above and below it. The plate is shown 1.3x smaller than life
# (100 px/deg), resampled to 73 px/deg and rendered at 28 px/deg (2.6x down), so stars are 1 to
# 2 px points.
P13_F = 4435.0 * 1.3           # plate focal length in source px at the chosen scale
P13_ROLL = 118.0               # plate roll (deg, counter-clockwise on the sky)
P13_CORE = (-19.0, 1.0)        # where the core bulge (plate 0.17, 0.22) lands (az, el)
P13_OUT_F = 4200.0             # output plate focal length (px per radian), 73 px/deg
P13_EXT = (1.5, 16.0, 0.12)    # extinction: smoothstep(el0, el1) from floor to 1


def _sky_dir(az, el):
    az, el = np.radians(az), np.radians(el)
    return np.array([np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el)])


def _rect_frame(az, el, roll=0.0):
    """Same convention as povkit.sky.rect_frame (roll rotates r, u about f by -roll)."""
    f = _sky_dir(az, el)
    r = np.cross(f, [0.0, 0.0, 1.0])
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    u /= np.linalg.norm(u)
    if roll:
        a = np.radians(-roll)

        def rot(v):
            return v * np.cos(a) + np.cross(f, v) * np.sin(a) + f * np.dot(f, v) * (1 - np.cos(a))
        r, u = rot(r), rot(u)
    return f, r, u


def milkyway1713():
    import json
    from scipy.optimize import least_squares
    src = os.path.join(ROOT, 'assets/sky/eso-potw1713a/potw1713a.tif')
    im = Image.open(src)
    W0, H0 = im.size
    crop_h = int(0.80 * H0)                       # below 0.80: Paranal, domes, road lights
    a = np.asarray(im.crop((0, 0, W0, crop_h)).convert('RGB'), np.float32) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4).astype(np.float32)
    del a
    h, w = lin.shape[:2]
    print('potw1713a crop %dx%d' % (w, h))
    # 1. flatten the horizon glow of the lower rows (it would be tilted after the roll):
    #    per-row 10th percentile of a star-free background over the dark side (x > 0.55)
    small = lin[::4, ::4]
    fp = np.hypot(*np.mgrid[-3:4, -3:4]) <= 3.2
    bgs = np.stack([ndimage.gaussian_filter(ndimage.grey_opening(small[..., ch], footprint=fp), 3.0)
                    for ch in range(3)], 2)
    x0 = int(0.55 * bgs.shape[1])
    prof = np.percentile(bgs[:, x0:], 10, axis=1)
    prof = ndimage.gaussian_filter1d(prof, 8, axis=0)
    rows = (np.arange(prof.shape[0]) + 0.5) / prof.shape[0] * 0.80          # plate y
    ref_i = int(np.searchsorted(rows, 0.42))
    ref = prof[ref_i]
    excess = np.clip(prof - ref[None, :], 0, None)
    excess *= np.clip((rows - 0.42) / 0.08, 0, 1)[:, None]
    full = np.stack([np.interp((np.arange(h) + 0.5) / 4.0 - 0.5, np.arange(prof.shape[0]), excess[:, ch])
                     for ch in range(3)], 1)
    lin = np.clip(lin - full[:, None, :], 0, None)
    for y in (0.1, 0.42, 0.5, 0.6, 0.7, 0.79):
        i = min(int(y / 0.80 * prof.shape[0]), prof.shape[0] - 1)
        print('  plate y %.2f sky %s removed %s' % (y, np.round(prof[i], 4), np.round(excess[i], 4)))
    # 2. calm the star colours: high-pass chroma (stars and the photo's colour noise) to 15
    #    percent, so stars read as near-white points; the band keeps its colour
    #    (stars = image minus a star-free background from a 4 px grey opening, so each star's
    #    colour halo and the lens' red/blue fringes go with the star, not with the background)
    fp4 = np.hypot(*np.mgrid[-4:5, -4:5]) <= 4.2
    lo = np.stack([ndimage.gaussian_filter(ndimage.grey_opening(lin[..., ch], footprint=fp4), 1.5)
                   for ch in range(3)], 2)
    lo = np.minimum(lo, lin)
    hp = lin - lo
    y_ = hp @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    lin = np.clip(lo + y_[..., None] + (hp - y_[..., None]) * 0.15, 0, None)
    del lo, hp, y_
    # 3. placement: solve the plate centre that puts the core at P13_CORE
    hfov = 2 * np.degrees(np.arctan(w / 2 / P13_F))
    vfov = 2 * np.degrees(np.arctan(h / 2 / P13_F))
    core_uv = (0.17, 1 - 0.22 / 0.80)
    tgt = _sky_dir(*P13_CORE)

    def res(p):
        f, r, u = _rect_frame(p[0], p[1], P13_ROLL)
        df = tgt @ f
        uu = 0.5 + (tgt @ r) / df / (2 * np.tan(np.radians(hfov) / 2))
        vv = 0.5 + (tgt @ u) / df / (2 * np.tan(np.radians(vfov) / 2))
        return [uu - core_uv[0], vv - core_uv[1]]
    best = None
    for a0 in range(-60, 61, 20):
        for e0 in (10, 30, 50):
            s = least_squares(res, [P13_CORE[0] + a0, e0])
            if best is None or s.cost < best.cost:
                best = s
    caz, cel = float(best.x[0]), float(best.x[1])
    pf, pr, pu = _rect_frame(caz, cel, P13_ROLL)
    print('plate centre az %.3f el %.3f (hfov %.2f vfov %.2f)' % (caz, cel, hfov, vfov))
    # 4. output frame: level (roll 0), covering az -38..+23, el 0..38 (all camera views
    #    from 0 to 14 s above the skyline, plus margin for camera roll)
    oaz, oel = -7.5, 19.0
    of, orr, ou = _rect_frame(oaz, oel, 0.0)
    pts = np.array([_sky_dir(az_, el_) for az_ in np.linspace(-38, 23, 62) for el_ in np.linspace(0.0, 38.5, 40)])
    X = (pts @ orr) / (pts @ of)
    Y = (pts @ ou) / (pts @ of)
    tx, ty = np.abs(X).max(), np.abs(Y).max()
    Wo, Ho = int(2 * tx * P13_OUT_F) // 2 * 2, int(2 * ty * P13_OUT_F) // 2 * 2
    ohfov, ovfov = 2 * np.degrees(np.arctan(tx)), 2 * np.degrees(np.arctan(ty))
    print('output %dx%d hfov %.3f vfov %.3f centre az %.1f el %.1f' % (Wo, Ho, ohfov, ovfov, oaz, oel))
    out = np.zeros((Ho, Wo, 3), np.float32)
    # light anti-alias prefilter for the 100 -> 73 px/deg resample, then cubic B-spline coefficients
    src_f = [ndimage.spline_filter(ndimage.gaussian_filter(lin[..., ch], 0.45), order=3) for ch in range(3)]
    del lin
    th_p, tv_p = np.tan(np.radians(hfov) / 2), np.tan(np.radians(vfov) / 2)
    for y0 in range(0, Ho, 256):
        yy, xx = np.mgrid[y0:min(y0 + 256, Ho), 0:Wo].astype(np.float64)
        xn = ((xx + 0.5) / Wo * 2 - 1) * tx
        yn = (1 - (yy + 0.5) / Ho * 2) * ty
        d = of[None, None] + xn[..., None] * orr + yn[..., None] * ou
        d /= np.linalg.norm(d, axis=-1, keepdims=True)
        df = d @ pf
        uu = 0.5 + (d @ pr) / np.maximum(df, 1e-6) / (2 * th_p)
        vv = 0.5 + (d @ pu) / np.maximum(df, 1e-6) / (2 * tv_p)
        sx = uu * w - 0.5
        sy = (1 - vv) * h - 0.5
        inside = (df > 0) & (uu > 0) & (uu < 1) & (vv > 0) & (vv < 1)
        # soft edge 40 source px so the plate boundary never draws a line
        edge = np.minimum.reduce([uu * w, (1 - uu) * w, vv * h, (1 - vv) * h])
        cov = np.clip(edge / 40.0, 0, 1) * inside
        el = np.degrees(np.arcsin(np.clip(d[..., 2], -1, 1)))
        e0, e1, fl = P13_EXT
        t = np.clip((el - e0) / (e1 - e0), 0, 1)
        ext = fl + (1 - fl) * t * t * (3 - 2 * t)
        for ch in range(3):
            v = ndimage.map_coordinates(src_f[ch], [sy, sx], order=3, mode='constant', cval=0.0,
                                        prefilter=False)
            out[y0:y0 + v.shape[0], :, ch] = np.clip(v, 0, None) * cov * ext
    enc = lin_to_srgb(out)
    tifffile.imwrite(os.path.join(OUT, 'mw_potw1713a.tif'),
                     np.ascontiguousarray((np.clip(enc, 0, 1) * 65535 + 0.5).astype(np.uint16)),
                     photometric='rgb', compression='zlib')
    Image.fromarray((np.clip(enc, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((Wo // 4, Ho // 4), Image.LANCZOS).save(
        os.path.join(OUT, 'mw_potw1713a_preview.png'))
    with open(os.path.join(OUT, 'mw_potw1713a.json'), 'w') as fh:
        json.dump({'center_az': oaz, 'center_el': oel, 'hfov_deg': float(ohfov), 'vfov_deg': float(ovfov),
                   'size': [Wo, Ho], 'source': 'assets/sky/eso-potw1713a/potw1713a.tif',
                   'source_centre_az_el': [caz, cel], 'source_roll': P13_ROLL, 'source_f': P13_F,
                   'core_az_el': list(P13_CORE), 'extinction': list(P13_EXT)}, fh, indent=2)


if __name__ == '__main__':
    which = sys.argv[1:] or ['moon', 'comet', 'milkyway']
    if 'moon' in which:
        moon()
    if 'comet' in which:
        comet()
    if 'milkyway' in which:
        milkyway()
    if 'milkyway1713' in which:
        milkyway1713()
