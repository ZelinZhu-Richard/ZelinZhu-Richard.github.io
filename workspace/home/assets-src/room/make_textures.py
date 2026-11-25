"""Paint every image texture the room uses.

Run with a Python that has Pillow, numpy and scipy (here /opt/anaconda3/bin/python3):

    python3 make_textures.py <out_dir> [--only name,name] [--sky-width 8192]

Everything is drawn from code with fixed seeds: the aurora sky panorama, the three
monitor screens, the chalk board, the notebook spread, the desk mat, the book-spine
atlases, the wall picture and a small emblem. Fonts come from /System/Library/Fonts.
Content is true or neutral: subject names, plots with no invented figures, no logos, no
borrowed product or assistant names. The only product name is Richard's own startup, ZeroMind,
on the middle (ultrawide) monitor.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

FONTS = '/System/Library/Fonts'
SUP = FONTS + '/Supplemental'
TEX_VERSION = '4'  # bump when a painter changes; build_room.py repaints when <out>/tex_version.txt differs


def font(name, size, index=0):
    paths = {
        'avenir': FONTS + '/Avenir Next.ttc',
        'avenir_c': FONTS + '/Avenir Next Condensed.ttc',
        'menlo': FONTS + '/Menlo.ttc',
        'chalk': SUP + '/ChalkboardSE.ttc',
        'chalkduster': SUP + '/Chalkduster.ttf',
        'hand': SUP + '/Bradley Hand Bold.ttf',
        'note': FONTS + '/Noteworthy.ttc',
        'bask': SUP + '/Baskerville.ttc',
        'didot': SUP + '/Didot.ttc',
        'futura': SUP + '/Futura.ttc',
        'gill': SUP + '/GillSans.ttc',
        'iowan': SUP + '/Iowan Old Style.ttc',
    }
    return ImageFont.truetype(paths[name], int(size), index=index)


# Avenir Next indices: 0 Bold, 2 Demi, 5 Medium, 7 Regular, 10 Ultra Light
AV_B, AV_D, AV_M, AV_R, AV_UL = 0, 2, 5, 7, 10

INK = (236, 233, 225)
CYAN = (39, 224, 208)
VIOLET = (122, 77, 255)
GREEN = (57, 240, 166)
AMBER = (255, 180, 105)
ORANGE = (232, 116, 59)
PINK = (255, 120, 190)


def srgb_from_linear(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def save_linear(arr, path, rng=None):
    """arr is linear float HxWx3; write 8-bit sRGB PNG with dither."""
    s = srgb_from_linear(arr)
    if rng is None:
        rng = np.random.default_rng(7)
    s = s * 255.0 + rng.uniform(-0.5, 0.5, s.shape).astype(np.float32)
    Image.fromarray(np.clip(np.round(s), 0, 255).astype(np.uint8)).save(path, optimize=False, compress_level=6)



_FALLBACK = FONTS + '/Menlo.ttc'
_HAS = {}
ARROW = chr(0x2192)


def has_glyph(f, ch):
    key = (f.path, f.index, ch)
    if key not in _HAS:
        ref = np.array(f.getmask(chr(0xFFFF))).tobytes()
        _HAS[key] = np.array(f.getmask(ch)).tobytes() != ref
    return _HAS[key]


def _runs(s):
    """'x_{k+1}' and 'x_k' mark subscripts; returns [(text, is_sub)]."""
    out, i, buf = [], 0, ''
    while i < len(s):
        if s[i] == '_' and i + 1 < len(s):
            if buf:
                out.append((buf, False))
                buf = ''
            if s[i + 1] == '{':
                j = s.index('}', i)
                out.append((s[i + 2:j], True))
                i = j + 1
            else:
                out.append((s[i + 1], True))
                i += 2
            continue
        buf += s[i]
        i += 1
    if buf:
        out.append((buf, False))
    return out


def rich_text(d, x, y, s, f, fill, anchor='la', arrow_w=None):
    """Draw text glyph by glyph: missing glyphs fall back to Menlo, '_' makes subscripts, arrows are drawn."""
    size = f.size
    sub = ImageFont.truetype(f.path, max(1, int(size * 0.62)), index=f.index)
    fb = ImageFont.truetype(_FALLBACK, max(1, int(size * 0.88)))
    fbs = ImageFont.truetype(_FALLBACK, max(1, int(size * 0.55)))
    items = []
    for text, is_sub in _runs(s):
        for ch in text:
            if ch == ARROW:
                items.append(('ARROW', None, 0.0, (arrow_w or size * 1.15)))
                continue
            ff = sub if is_sub else f
            if ch != ' ' and not has_glyph(ff, ch):
                ff = fbs if is_sub else fb
            items.append((ch, ff, size * 0.26 if is_sub else 0.0, ff.getlength(ch)))
    total = sum(it[3] for it in items)
    asc, desc = f.getmetrics()
    x0 = x - total / 2 if anchor[0] == 'm' else (x - total if anchor[0] == 'r' else x)
    if anchor[1] == 'a':
        base = y + asc
    elif anchor[1] == 'm':
        base = y + (asc - desc) / 2
    elif anchor[1] == 'd':
        base = y - desc
    else:
        base = y
    cx = x0
    lw = max(2, int(size / 13))
    for ch, ff, dy, w in items:
        if ch == 'ARROW':
            ym = base - size * 0.30
            a0, a1 = cx + w * 0.12, cx + w * 0.86
            d.line([(a0, ym), (a1, ym)], fill=fill, width=lw)
            d.line([(a1, ym), (a1 - size * 0.24, ym - size * 0.16)], fill=fill, width=lw)
            d.line([(a1, ym), (a1 - size * 0.24, ym + size * 0.16)], fill=fill, width=lw)
        else:
            d.text((cx, base + dy), ch, font=ff, fill=fill, anchor='ls')
        cx += w
    return total


class Canvas:
    """Supersampled RGBA drawing surface; .done() downsamples with Lanczos."""

    def __init__(self, w, h, bg=(0, 0, 0), ss=2):
        self.w, self.h, self.ss = w, h, ss
        self.img = Image.new('RGBA', (w * ss, h * ss), bg + (255,))
        self.d = ImageDraw.Draw(self.img, 'RGBA')

    def S(self, v):
        return v * self.ss

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=1, r=0):
        s = self.ss
        box = [x0 * s, y0 * s, x1 * s, y1 * s]
        if r:
            self.d.rounded_rectangle(box, radius=r * s, fill=fill, outline=outline, width=max(1, int(width * s)))
        else:
            self.d.rectangle(box, fill=fill, outline=outline, width=max(1, int(width * s)))

    def line(self, pts, fill, width=1.0, joint='curve'):
        s = self.ss
        self.d.line([(x * s, y * s) for x, y in pts], fill=fill, width=max(1, int(round(width * s))), joint=joint)

    def circle(self, x, y, r, fill=None, outline=None, width=1):
        s = self.ss
        self.d.ellipse([(x - r) * s, (y - r) * s, (x + r) * s, (y + r) * s], fill=fill, outline=outline,
                       width=max(1, int(width * s)))

    def ellipse_pts(self, cx, cy, rx, ry, rot=0.0, n=180, a0=0.0, a1=2 * math.pi):
        pts = []
        c, s_ = math.cos(rot), math.sin(rot)
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            x, y = rx * math.cos(a), ry * math.sin(a)
            pts.append((cx + x * c - y * s_, cy + x * s_ + y * c))
        return pts

    def text(self, x, y, t, f, fill=INK, anchor='la'):
        s = self.ss
        ff = ImageFont.truetype(f.path, int(f.size * s), index=f.index) if s != 1 else f
        self.d.text((x * s, y * s), t, font=ff, fill=fill, anchor=anchor)

    def rich(self, x, y, t, f, fill=INK, anchor='la'):
        sc = self.ss
        ff = ImageFont.truetype(f.path, int(f.size * sc), index=f.index)
        rich_text(self.d, x * sc, y * sc, t, ff, fill, anchor)

    def text_w(self, t, f):
        return f.getlength(t)

    def done(self):
        return self.img.resize((self.w, self.h), Image.LANCZOS)


# Pillow keeps path/index on FreeTypeFont as .path and .index
def _ensure_font_attrs():
    f = font('avenir', 10, AV_R)
    assert hasattr(f, 'path') and hasattr(f, 'index')


# ----------------------------------------------------------------------------------
# Sky panorama: equirectangular, azimuth 0..360 (u), elevation -20..90 deg (v, top=90)
# ----------------------------------------------------------------------------------
SKY_EL_MIN, SKY_EL_MAX = -20.0, 90.0


def smooth_noise_1d(n, cutoff, rng):
    """Periodic smooth noise of length n with spectrum cut at `cutoff` cycles per period; ~[-1,1]."""
    white = rng.standard_normal(n)
    f = np.fft.rfft(white)
    k = np.arange(f.shape[0])
    f *= np.exp(-(k / max(cutoff, 1e-6)) ** 2)
    f[0] = 0
    out = np.fft.irfft(f, n)
    out /= (np.abs(out).max() + 1e-9)
    return out


def periodic_interp(arr, x):
    """Sample periodic 1-D array arr at fractional positions x (in units of 360 deg -> len)."""
    n = arr.shape[0]
    p = np.mod(x, 1.0) * n
    i0 = np.floor(p).astype(np.int64) % n
    t = p - np.floor(p)
    return arr[i0] * (1 - t) + arr[(i0 + 1) % n] * t


def fbm2d(h, w, rng, scales, weights, wrap_x=True):
    out = np.zeros((h, w), np.float32)
    for sc, wt in zip(scales, weights):
        nz = rng.standard_normal((h, w)).astype(np.float32)
        nz = ndimage.gaussian_filter(nz, sigma=sc, mode=('nearest', 'wrap') if wrap_x else 'nearest')
        nz /= (nz.std() + 1e-9)
        out += wt * nz
    return out


def aurora3d(W, H, specs):
    """Splat 3-D aurora curtains into an equirect image (H, W, 3), linear, peak about 1.

    Each curtain is a folded sheet ~100 km up. Rays are soft bundles (a few km to ~25 km wide) rather than
    hairline streaks, the lower edge fades over a noise-driven 2-6 km, the top fades out smoothly at a
    noise-driven height, and the ends taper with noise, so nothing reads as a hard-edged texture card.
    `violet` (0..1) gives a curtain a violet/magenta upper fringe (#7a4dff)."""
    R_EARTH = 6371.0
    acc = np.zeros((3, H * W), np.float64)
    c_low = np.array([0.20, 1.00, 0.56])   # lower edge: bright green, only a little white
    c_green = np.array([0.04, 0.87, 0.38])  # #39f0a6 core
    c_teal = np.array([0.03, 0.62, 0.62])
    c_violet = np.array([0.30, 0.12, 1.00])  # ~#7a4dff in linear, slightly lifted
    c_magenta = np.array([0.55, 0.10, 0.85])
    for sp in specs:
        rng = np.random.default_rng(sp['seed'])
        L = sp['length']
        dt = 0.2
        n_t = int(L / dt)
        t = (np.arange(n_t) + rng.uniform(0, 1, n_t)) * dt - L / 2
        # fold the lower-edge curve: big bends, a few curls, no tight zig-zags (they read as hard edges)
        off = np.zeros(n_t)
        for wl, amp in ((L * 0.9, 1.0), (L * 0.35, 0.55), (L * 0.13, 0.25), (110, 0.06)):
            off += sp['fold'] * amp * np.sin(2 * np.pi * t / wl + rng.uniform(0, 6.28))
        off += sp['sweep'] * t
        a = math.radians(sp['az'])
        v = np.array([math.cos(a), math.sin(a)])      # away from the viewer
        u = np.array([-math.sin(a), math.cos(a)])     # along the curtain
        D = sp['dist'] + off
        px = v[0] * D + u[0] * t
        py = v[1] * D + u[1] * t
        dist = np.hypot(px, py)
        keep = dist > 60

        def n1(cut_km):
            return np.interp(t, np.linspace(-L / 2, L / 2, 65536),
                             smooth_noise_1d(65536, L / cut_km, rng))
        rh = 0.5 + 0.5 * n1(4.0)     # fine rays
        rm = 0.5 + 0.5 * n1(22.0)    # ray bundles
        cl = 0.5 + 0.5 * n1(90.0)    # bright clumps along the arc
        ray = (0.45 + 0.30 * rh ** 2 + 0.60 * rm ** 2) * (0.10 + 0.90 * np.clip(cl * 1.4 - 0.15, 0, 1) ** 1.8)
        tt = np.abs(t) / (L / 2)
        endw = 0.28 + 0.22 * (0.5 + 0.5 * n1(60.0))
        ray *= np.clip((1 - tt) / endw, 0, 1) ** 2  # noisy taper at the curtain ends
        z_low = 104 + 9 * n1(70.0) + 3.0 * n1(14.0)
        soft = 4.0 + 9.0 * (0.5 + 0.5 * n1(25.0))   # lower-edge softness, km (noise-driven alpha falloff)
        z_top = z_low + sp.get('height', 120.0) * (0.45 + 0.8 * (0.5 + 0.5 * n1(45.0)) ** 1.3) + 4 * n1(12.0)
        span = np.maximum(z_top - z_low, 30.0)
        vio_amt = sp.get('violet', 0.0)
        zz = 92 + (np.linspace(0, 1, 640) ** 1.3) * 290
        dz = np.gradient(zz)
        for k in range(0, len(zz), 40):
            zs = zz[k:k + 40]
            dzs = dz[k:k + 40]
            Z = zs[:, None] + rng.uniform(-0.5, 0.5, (len(zs), n_t)) * dzs[:, None]
            h = Z - z_low[None, :]
            hp = np.clip(h, 0, None)
            prof = np.where(h < 0, np.exp(-(np.clip(-h, 0, 80) / soft[None, :]) ** 1.5),
                            0.55 * np.exp(-hp / 14.0) + 0.75 * np.exp(-hp / 48.0) + 0.30 * np.exp(-hp / 120.0))
            s = np.clip((z_top[None, :] - Z) / (0.6 * span[None, :]), 0, 1)
            top = s * s * (3 - 2 * s)
            prof = prof * top
            q = np.clip(h / span[None, :], 0, 1.2)
            wg = np.exp(-hp / 5.0)
            col = (c_low[:, None, None] * wg + c_green[:, None, None] * (1 - wg)) * (1 - np.clip(q * 1.6, 0, 1)) \
                + c_teal[:, None, None] * np.clip(q * 1.6, 0, 1)
            vq = np.clip((q - 0.35) / 0.5, 0, 1) * vio_amt
            col = col * (1 - vq) + c_violet[:, None, None] * vq
            emis = col * (prof * ray[None, :])[None]
            # upper fringe: violet-magenta glow that survives where the green has faded
            fr = vio_amt * 0.30 * np.exp(-((q - 0.78) / 0.24) ** 2) * (s ** 0.5) * (0.5 + rm ** 2)[None, :]
            emis = emis + (c_violet[:, None, None] * 0.6 + c_magenta[:, None, None] * 0.4) * fr[None]
            zeff = Z - (dist[None, :] ** 2) / (2 * R_EARTH)
            el = np.degrees(np.arctan2(zeff, dist[None, :]))
            az = np.degrees(np.arctan2(py, px)) % 360.0
            az = np.broadcast_to(az[None, :], el.shape)
            d2 = dist[None, :] ** 2 + zeff ** 2
            w = (dt * dzs[:, None]) / d2
            m = (el > SKY_EL_MIN) & (el < SKY_EL_MAX) & keep[None, :]
            xi = np.clip((az / 360.0 * W).astype(np.int64), 0, W - 1)
            yi = np.clip(((SKY_EL_MAX - el) / (SKY_EL_MAX - SKY_EL_MIN) * H).astype(np.int64), 0, H - 1)
            idx = (yi * W + xi)[m]
            for c in range(3):
                acc[c] += np.bincount(idx, weights=(emis[c] * w)[m] * sp['gain'], minlength=H * W)
    img = acc.reshape(3, H, W).transpose(1, 2, 0)
    # equirect pixel solid angle shrinks with cos(elevation)
    el_rows = SKY_EL_MAX - (np.arange(H) + 0.5) / H * (SKY_EL_MAX - SKY_EL_MIN)
    img /= np.maximum(np.cos(np.radians(el_rows)), 0.05)[:, None, None]
    # blur more across the rays than along them: soft bundles, no hairline streaks
    img = ndimage.gaussian_filter(img, sigma=(1.5 * W / 8192, 5.0 * W / 8192, 0))
    p = np.percentile(img.max(axis=2), 99.6)
    img = img / max(p, 1e-12)
    img = 1.6 * img / (1 + 0.9 * img)  # strong shoulder: edge-on folds must not become hard bright lines
    # atmospheric extinction: low aurora is dimmer
    ext = 0.5 + 0.5 * np.clip((el_rows - 2.0) / 10.0, 0, 1)
    img *= ext[:, None, None]
    return img.astype(np.float32)


def paint_sky(path, W=8192):
    H = int(round(W * (SKY_EL_MAX - SKY_EL_MIN) / 360.0))
    rng = np.random.default_rng(20261123)
    az = (np.arange(W, dtype=np.float32) + 0.5) / W * 360.0
    el = SKY_EL_MAX - (np.arange(H, dtype=np.float32) + 0.5) / H * (SKY_EL_MAX - SKY_EL_MIN)
    AZ = az[None, :]
    EL = el[:, None]
    img = np.zeros((H, W, 3), np.float32)

    # base gradient: deep blue zenith, slightly lifted teal-blue horizon
    t = np.clip(EL / 90.0, 0, 1)
    zen = np.array([0.0016, 0.0022, 0.0095], np.float32)
    hor = np.array([0.0050, 0.0075, 0.0300], np.float32)
    w_h = np.power(1 - t, 3.0)[..., None]
    img += zen * (1 - w_h) + hor * w_h
    below = (EL < 0)[..., None]
    img = np.where(below, np.array([0.004, 0.007, 0.016], np.float32) * np.ones_like(img), img)

    # Milky Way: band around a tilted great circle
    azr = np.radians(AZ)
    elr = np.radians(EL)
    dx = np.cos(elr) * np.cos(azr)
    dy = np.cos(elr) * np.sin(azr)
    dz = np.sin(elr) * np.ones_like(azr)
    n = np.array([0.55, -0.35, 0.76])
    n /= np.linalg.norm(n)
    s = dx * n[0] + dy * n[1] + dz * n[2]
    band = np.exp(-(s / 0.20) ** 2).astype(np.float32)
    small = fbm2d(H // 4, W // 4, rng, [3, 8, 20], [0.35, 0.45, 0.6])
    small = np.array(Image.fromarray(small).resize((W, H), Image.BILINEAR))
    lanes = np.clip(1.0 - 0.75 * np.exp(-((s - 0.03 + 0.02 * small) / 0.035) ** 2), 0, 1)
    mw = band * np.clip(0.55 + 0.35 * small, 0, 2) * lanes
    img += mw[..., None] * np.array([0.020, 0.020, 0.032], np.float32)

    # stars: uniform above the horizon, more inside the band; none below 0.4 deg (the terrain and sea are
    # geometry in front of the dome) and dimmed toward the horizon by extinction
    def add_stars(count, mag_lo, mag_hi, weight_band=0.0):
        zs = rng.uniform(math.sin(math.radians(0.4)), 1.0, count * 3)
        azs = rng.uniform(0, 360, count * 3)
        els = np.degrees(np.arcsin(zs))
        if weight_band > 0:
            ex = np.cos(np.radians(els)) * np.cos(np.radians(azs))
            ey = np.cos(np.radians(els)) * np.sin(np.radians(azs))
            ez = np.sin(np.radians(els))
            ss_ = ex * n[0] + ey * n[1] + ez * n[2]
            p = np.exp(-(ss_ / 0.16) ** 2)
            keep = rng.uniform(0, 1, p.shape) < p
            azs, els = azs[keep], els[keep]
        azs, els = azs[:count], els[:count]
        mags = rng.uniform(0, 1, azs.shape) ** 2.2 * (mag_hi - mag_lo) + mag_lo
        return azs, els, mags

    star = np.zeros((H, W), np.float32)
    starc = np.zeros((H, W, 3), np.float32)
    temps = np.array([[0.75, 0.85, 1.0], [0.9, 0.95, 1.0], [1.0, 1.0, 1.0], [1.0, 0.93, 0.82], [1.0, 0.85, 0.7]],
                     np.float32)

    def splat(azs, els, b):
        x = azs / 360.0 * W - 0.5
        y = (SKY_EL_MAX - els) / (SKY_EL_MAX - SKY_EL_MIN) * H - 0.5
        x0 = np.floor(x).astype(np.int64)
        y0 = np.floor(y).astype(np.int64)
        fx, fy = x - x0, y - y0
        cols = temps[rng.integers(0, len(temps), azs.shape)]
        for ox, oy, wgt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
            xi = (x0 + ox) % W
            yi = np.clip(y0 + oy, 0, H - 1)
            np.add.at(star, (yi, xi), b * wgt)
            for c in range(3):
                np.add.at(starc[..., c], (yi, xi), b * wgt * cols[:, c])

    def ext(els):
        return np.clip((els - 0.4) / 7.0, 0, 1) ** 1.5

    a1, e1, m1 = add_stars(30000, 0.0, 1.0)
    splat(a1, e1, ((0.010 + 0.16 * (1 - m1) ** 3) * ext(e1)).astype(np.float32))
    a2, e2, m2 = add_stars(15000, 0.0, 1.0, weight_band=1.0)
    splat(a2, e2, ((0.008 + 0.07 * (1 - m2) ** 3) * ext(e2)).astype(np.float32))
    starc = ndimage.gaussian_filter(starc, sigma=(0.55, 0.55, 0))
    starc *= 1.5
    img += starc

    # a few hundred bright stars with proper (equirect-stretched) kernels and soft halos
    NB = 260   # ~5% of the visible stars get a 2-3 px core; the rest stay sub-pixel
    bright = rng.uniform(0, 1, NB)
    baz = rng.uniform(0, 360, NB)
    bel = np.degrees(np.arcsin(rng.uniform(math.sin(math.radians(4)), 0.97, NB)))
    for k in range(NB):
        b = (0.18 + 1.4 * bright[k] ** 6) * float(ext(bel[k]))
        cx = baz[k] / 360 * W
        cy = (SKY_EL_MAX - bel[k]) / (SKY_EL_MAX - SKY_EL_MIN) * H
        sy = 0.7 + 0.5 * bright[k] ** 3
        sx = sy / max(math.cos(math.radians(bel[k])), 0.2)
        rad = int(math.ceil(4 * max(sx, sy))) + 2
        xs = np.arange(int(cx) - rad, int(cx) + rad + 1)
        ys = np.arange(max(int(cy) - rad, 0), min(int(cy) + rad + 1, H))
        if len(ys) == 0:
            continue
        gx = np.exp(-((xs + 0.5 - cx) / sx) ** 2 / 2)
        gy = np.exp(-((ys + 0.5 - cy) / sy) ** 2 / 2)
        ker = (gy[:, None] * gx[None, :]) * b
        halo = (gy[:, None] ** 0.25 * gx[None, :] ** 0.25) * b * 0.015
        col = temps[k % len(temps)]
        img[ys[0]:ys[-1] + 1, :, :][:, xs % W, :] += (ker + halo)[..., None] * col

    def wrapd(a):
        return (a + 180.0) % 360.0 - 180.0

    # Aurora: real 3-D sheets ~100 km up, 380-600 km away, so their lower edges sit 8-14 deg above the
    # horizon (the upper half of the window); the mountains, city and sea are geometry in front of the dome,
    # so the terrain always occludes the aurora. Two of five curtains carry a violet upper fringe.
    aur = aurora3d(W, H, [
        # az centre, distance km, length km, fold amplitude, seed, gain, sweep, curtain height km, violet
        dict(az=84, dist=430, length=1700, fold=70, seed=21, gain=1.0, sweep=0.22, height=190, violet=0.25),
        dict(az=48, dist=520, length=1100, fold=45, seed=26, gain=0.6, sweep=-0.15, height=210, violet=1.0),
        dict(az=128, dist=390, length=1000, fold=50, seed=22, gain=0.6, sweep=0.30, height=170, violet=0.85),
        dict(az=168, dist=500, length=1300, fold=35, seed=24, gain=0.4, sweep=0.1, height=160, violet=0.0),
    ])

    # soft airglow from the aurora; kept low so the structure stays readable
    small = aur[::4, ::4].copy()
    glow = ndimage.gaussian_filter(small, sigma=(10, 14, 0), mode=('nearest', 'wrap', 'nearest'))
    glow = np.array([np.array(Image.fromarray(glow[..., c]).resize((W, H), Image.BILINEAR)) for c in range(3)])
    glow = np.moveaxis(glow, 0, -1)
    aur += 0.12 * glow
    aur *= np.clip((EL - 0.2) / 3.0, 0, 1)[..., None]  # nothing at or below the horizon
    # curtain rays: noise stretched ~40x along elevation (narrow in azimuth, long vertically), so the glow
    # breaks into vertical rays and folds instead of a broad haze
    rr = np.random.default_rng(77)
    hs, ws = H // 4, W // 2
    nz = rr.standard_normal((hs, ws)).astype(np.float32)
    ray1 = ndimage.gaussian_filter(nz, sigma=(70.0 * hs / 626, 2.2 * ws / 4096), mode=('nearest', 'wrap'))
    nz = rr.standard_normal((hs, ws)).astype(np.float32)
    ray2 = ndimage.gaussian_filter(nz, sigma=(30.0 * hs / 626, 6.0 * ws / 4096), mode=('nearest', 'wrap'))
    ray = ray1 / (ray1.std() + 1e-9) + 0.6 * ray2 / (ray2.std() + 1e-9)
    ray = 0.30 + 0.70 * (0.5 + 0.5 * np.tanh(ray * 0.9))
    ray = np.array(Image.fromarray(ray.astype(np.float32)).resize((W, H), Image.BILINEAR))
    aur *= ray[..., None] ** 1.3
    img += aur * 0.32  # with the rays: peaks a little brighter, the average ~25% dimmer than before

    # horizon: indigo airglow band (#1b1750) plus a warm-violet light dome over the city (az ~125)
    hz = np.exp(-np.clip(EL, 0, None) / 6.0) * (EL > -0.5)
    img += hz[..., None] * np.array([0.0030, 0.0026, 0.0150], np.float32)
    cdir = np.exp(-(wrapd(AZ - 126) / 16.0) ** 2)
    cz = np.exp(-np.clip(EL, 0, None) / 3.2) * (EL > -0.5)
    img += (cdir * cz)[..., None] * np.array([0.0060, 0.0034, 0.0110], np.float32)

    save_linear(img, path, rng)
    return W, H


# ----------------------------------------------------------------------------------
# Screens
# ----------------------------------------------------------------------------------

def ui_background(cv, top=(7, 10, 26), bottom=(11, 16, 48)):
    w, h = cv.w * cv.ss, cv.h * cv.ss
    g = np.linspace(0, 1, h)[:, None, None]
    a = np.array(top)[None, None, :] * (1 - g) + np.array(bottom)[None, None, :] * g
    a = np.repeat(a, w, axis=1)
    vign = np.linspace(-1, 1, w)[None, :] ** 2
    a = a * (1 - 0.25 * vign[..., None])
    cv.img.paste(Image.fromarray(a.astype(np.uint8)).convert('RGBA'))
    cv.d = ImageDraw.Draw(cv.img, 'RGBA')


def panel(cv, x0, y0, x1, y1, title=None, accent=CYAN, tf=None):
    cv.rect(x0, y0, x1, y1, fill=(13, 18, 48, 240), outline=accent + (150,), width=2.5, r=18)
    if title:
        cv.rect(x0 + 26, y0 + 30, x0 + 36, y0 + 78, fill=accent + (255,), r=3)
        cv.text(x0 + 54, y0 + 24, title, tf or font('avenir', 50, AV_D), fill=INK)


LABEL = (208, 214, 242)


def axes(cv, x0, y0, x1, y1, xlabel, ylabel, lf):
    for i in range(1, 4):
        yy = y0 + (y1 - y0) * i / 4
        cv.line([(x0, yy), (x1, yy)], (120, 140, 200, 55), 1.5)
    for i in range(1, 5):
        xx = x0 + (x1 - x0) * i / 5
        cv.line([(xx, y0), (xx, y1)], (120, 140, 200, 40), 1.5)
    cv.line([(x0, y0), (x0, y1), (x1, y1)], (210, 218, 245, 210), 3)
    cv.text(x1, y1 + 16, xlabel, lf, fill=LABEL, anchor='ra')
    cv.text(x0 + 12, y0 - 8, ylabel, lf, fill=LABEL, anchor='ld')


def code_lines(cv, x, y, lines, f, lh):
    kw = {'def', 'return', 'for', 'in', 'with', 'import', 'from', 'if', 'else', 'not'}
    for i, ln in enumerate(lines):
        xx = x
        cv.text(x - 70, y + i * lh, f'{i + 1:>2}', f, fill=(96, 110, 160))
        tokens = []
        cur = ''
        for ch in ln:
            if ch.isalnum() or ch == '_':
                cur += ch
            else:
                if cur:
                    tokens.append(cur)
                    cur = ''
                tokens.append(ch)
        if cur:
            tokens.append(cur)
        in_comment = False
        for tk in tokens:
            if tk == '#':
                in_comment = True
            if in_comment:
                c = (140, 150, 190)
            elif tk in kw:
                c = (206, 160, 255)
            elif tk.isdigit():
                c = AMBER
            elif tk in ('(', ')', '[', ']', ':', ',', '.', '=', '-', '+'):
                c = (170, 188, 235)
            elif tk[:1].isupper():
                c = CYAN
            else:
                c = INK
            cv.text(xx, y + i * lh, tk, f, fill=c)
            xx += cv.text_w(tk, f)


def screen_left(path):
    """Machine learning and statistics: evaluation curves, the evaluation code, a calibration plot."""
    W, H = 2048, 1152
    cv = Canvas(W, H)
    ui_background(cv)
    tf = font('avenir', 50, AV_D)
    lf = font('avenir', 38, AV_M)
    # panel A: evaluation curves (large)
    panel(cv, 28, 28, 1190, 1124, 'Model evaluation', CYAN, tf)
    x0, y0, x1, y1 = 130, 200, 1140, 1010
    axes(cv, x0, y0, x1, y1, 'training steps', 'held-out score', lf)
    rng = np.random.default_rng(3)
    curves = [(CYAN, 0.66, 0.0040, 'baseline'), (VIOLET, 0.76, 0.0046, '+ augmentation'),
              (AMBER, 0.84, 0.0052, '+ ensembling')]
    for ci, (c, top, k, name) in enumerate(curves):
        pts = []
        nz = 0
        for i in range(0, 1001, 4):
            nz = 0.85 * nz + rng.normal(0, 0.005)
            v = top * (1 - math.exp(-k * i)) + nz
            pts.append((x0 + (x1 - x0) * i / 1000, y1 - (y1 - y0) * v))
        cv.line(pts, c + (255,), 6)
        lx, ly = 600, 760 + ci * 70
        cv.line([(lx, ly + 22), (lx + 70, ly + 22)], c + (255,), 8)
        cv.text(lx + 90, ly, name, lf, fill=INK)
    # panel B: code
    panel(cv, 1218, 28, 2020, 640, 'evaluate.py', VIOLET, tf)
    code = [
        'def evaluate(model, data):',
        '    scores = []',
        '    for x, y in data:',
        '        p = model(x)',
        '        scores.append(score(p, y))',
        '    return mean(scores)',
        '',
        '# five seeds, report spread',
    ]
    code_lines(cv, 1310, 150, code, font('menlo', 34), 58)
    # panel C: calibration
    panel(cv, 1218, 668, 2020, 1124, 'Calibration', AMBER, tf)
    x0, y0, x1, y1 = 1310, 790, 1960, 1060
    axes(cv, x0, y0, x1, y1, 'predicted', 'observed', font('avenir', 32, AV_M))
    cv.line([(x0, y1), (x1, y0)], (210, 210, 230, 150), 3)
    pts = []
    for i in range(9):
        t = i / 8
        v = t + 0.08 * math.sin(t * math.pi * 1.3) * (1 - t)
        pts.append((x0 + (x1 - x0) * t, y1 - (y1 - y0) * v))
    cv.line(pts, CYAN + (255,), 5)
    for x, y in pts:
        cv.circle(x, y, 10, fill=CYAN + (255,))
    cv.done().convert('RGB').save(path)


def screen_center(path, W=2560, H=1067):
    """Ultrawide middle screen: ZeroMind, its one line, and one agent / several models / one memory."""
    cv = Canvas(W, H)
    ui_background(cv, (6, 7, 24), (12, 12, 44))
    gl = Image.new('L', (W * 2, H * 2), 0)
    gd = ImageDraw.Draw(gl)
    gd.ellipse([1800 * 2 - 760, 540 * 2 - 640, 1800 * 2 + 760, 540 * 2 + 640], fill=80)
    gl = gl.filter(ImageFilter.GaussianBlur(240))
    layer = Image.new('RGBA', (W * 2, H * 2), (70, 50, 210, 0))
    layer.putalpha(gl)
    cv.img.alpha_composite(layer)
    cv.d = ImageDraw.Draw(cv.img, 'RGBA')
    # name and line, plain type, no mark
    cv.text(150, 560, 'ZeroMind', font('avenir', 200, AV_D), fill=INK, anchor='ls')
    cv.text(158, 660, 'Personal AI operating system', font('avenir', 66, AV_M), fill=(200, 194, 242), anchor='ls')
    cv.line([(158, 730), (820, 730)], CYAN + (200,), 4)
    # diagram: models (left) -> agent (centre) <-> memory (right)
    ax, ay = 1800, 540
    mx = 1250
    nf = font('avenir', 40, AV_M)
    bf = font('avenir', 58, AV_D)
    ys = [190, 365, 540, 715, 890]
    for k, y in enumerate(ys):
        cv.line([(mx + 120, y), (ax - 150, ay + (y - ay) * 0.25)], (150, 170, 255, 170), 3)
    for k, y in enumerate(ys):
        cv.rect(mx - 140, y - 52, mx + 120, y + 52, fill=(20, 26, 70, 255), outline=(130, 150, 255, 220), width=3,
                r=26)
        cv.text(mx - 10, y, 'model ' + 'ABCDE'[k], nf, fill=INK, anchor='mm')
    # agent node
    for r, a in ((230, 40), (190, 70)):
        cv.circle(ax, ay, r, outline=CYAN + (a,), width=3)
    cv.circle(ax, ay, 150, fill=(24, 40, 96, 255), outline=CYAN + (255,), width=6)
    cv.text(ax, ay, 'agent', bf, fill=INK, anchor='mm')
    # memory node
    gx, gy = 2310, ay
    cv.line([(ax + 150, ay - 14), (gx - 130, gy - 14)], AMBER + (230,), 4)
    cv.line([(ax + 150, ay + 14), (gx - 130, gy + 14)], AMBER + (230,), 4)
    cv.rect(gx - 130, gy - 120, gx + 130, gy + 120, fill=(46, 32, 30, 255), outline=AMBER + (255,), width=5, r=30)
    for k in range(3):
        cv.line([(gx - 80, gy - 50 + k * 50), (gx + 80, gy - 50 + k * 50)], AMBER + (120,), 3)
    cv.text(gx, gy + 170, 'memory', bf, fill=INK, anchor='mm')
    cv.done().convert('RGB').save(path)


def screen_right(path):
    """Decisions under uncertainty: an optimisation contour plot and a small system loop."""
    W, H = 2048, 1152
    cv = Canvas(W, H)
    ui_background(cv, (8, 8, 26), (14, 12, 44))
    tf = font('avenir', 50, AV_D)
    # contour plot with descent path
    panel(cv, 28, 28, 1050, 1124, 'Optimisation', VIOLET, tf)
    cx, cy = 600, 600
    for k in range(1, 10):
        pts = cv.ellipse_pts(cx, cy, 48 * k, 27 * k, -0.45, 160)
        a = int(110 + 14 * (10 - k))
        col = (int(122 + (39 - 122) * k / 9), int(77 + (224 - 77) * k / 9), int(255 + (208 - 255) * k / 9), a)
        cv.line(pts, col, 4)
    path_pts = [(150, 960), (240, 830), (320, 760), (400, 690), (460, 655), (515, 630), (555, 615), (585, 606),
                (600, 600)]
    cv.line(path_pts, AMBER + (255,), 6)
    for x, y in path_pts:
        cv.circle(x, y, 11, fill=AMBER + (255,))
    cv.circle(cx, cy, 18, outline=INK + (255,), width=5)
    cv.rich(90, 1040, 'x_{k+1} = x_k − α ∇f(x_k)', font('menlo', 42), fill=INK)
    # system loop
    panel(cv, 1078, 28, 2020, 1124, 'System', CYAN, tf)
    bf = font('avenir', 44, AV_M)
    boxes = [('data', 1150, 200), ('model', 1590, 200), ('decision', 1590, 520), ('feedback', 1150, 520)]
    for name, x, y in boxes:
        cv.rect(x, y, x + 360, y + 130, fill=(20, 32, 84, 255), outline=CYAN + (230,), width=4, r=18)
        cv.text(x + 180, y + 65, name, bf, fill=INK, anchor='mm')

    def arrow(p0, p1, c=CYAN):
        cv.line([p0, p1], c + (240,), 5)
        ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
        for s_ in (-1, 1):
            a = ang + math.pi + s_ * 0.45
            cv.line([p1, (p1[0] + 28 * math.cos(a), p1[1] + 28 * math.sin(a))], c + (240,), 5)

    arrow((1512, 265), (1586, 265))
    arrow((1770, 332), (1770, 516))
    arrow((1586, 585), (1514, 585), VIOLET)
    arrow((1330, 518), (1330, 334), VIOLET)
    sf = font('avenir', 40, AV_R)
    for i, ln in enumerate(('log every decision', 'score it later', 'feed it back')):
        cv.text(1150, 790 + i * 80, ln, sf, fill=LABEL)
    cv.done().convert('RGB').save(path)


# ----------------------------------------------------------------------------------
# Chalk board
# ----------------------------------------------------------------------------------

def chalkify(layer_rgba, rng, strength=0.75):
    """Chalk texture for a layer of crisp strokes: a coarse grainy mask (board tooth, ~10 px), fine speckle and
    drag streaks multiply the alpha, so strokes break up like chalk on slate instead of reading as a screen."""
    a = np.asarray(layer_rgba).astype(np.float32)
    h, w = a.shape[:2]
    fine = ndimage.gaussian_filter(rng.uniform(0, 1, (h, w)).astype(np.float32), 0.8)
    coarse = ndimage.gaussian_filter(rng.uniform(0, 1, (h // 4, w // 4)).astype(np.float32), 1.6)
    coarse = np.array(Image.fromarray(coarse).resize((w, h), Image.BILINEAR))
    streak = ndimage.gaussian_filter(rng.uniform(0, 1, (h // 2, w // 2)).astype(np.float32), (0.5, 7))
    streak = np.array(Image.fromarray(streak).resize((w, h), Image.BILINEAR))

    def norm(x):
        return (x - x.min()) / (x.max() - x.min() + 1e-9)
    m = norm(fine) * 0.45 + norm(coarse) * 0.40 + norm(streak) * 0.25
    m = np.clip((m - 0.30) * 2.2, 0, 1) ** 1.2          # high-contrast tooth: many pin-holes and gaps
    a[..., 3] *= (1 - strength) + strength * m
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def _chalk_col(rgb, alpha=190, desat=0.30):
    """Chalk colour: about 30% less saturated, ~0.75 opacity."""
    lum = 0.30 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]
    return tuple(int(round(c * (1 - desat) + lum * desat)) for c in rgb) + (alpha,)


def paint_board(path):
    W, H = 4096, 2560
    rng = np.random.default_rng(42)
    # slate base with erased haze
    base = np.zeros((H, W, 3), np.float32)
    base[:] = np.array([20, 23, 27], np.float32)
    haze = fbm2d(H // 8, W // 8, rng, [4, 12, 30], [0.3, 0.5, 0.7], wrap_x=False)
    haze = np.array(Image.fromarray(haze).resize((W, H), Image.BILINEAR))
    base += np.clip(haze, -1, 3)[..., None] * np.array([4.0, 4.2, 4.6])
    wipe = ndimage.gaussian_filter(rng.uniform(0, 1, (H // 8, W // 8)).astype(np.float32), (0.5, 9))
    wipe = np.array(Image.fromarray(wipe).resize((W, H), Image.BILINEAR))
    base += ((wipe - wipe.mean()) * 60)[..., None]
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert('RGBA')

    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer, 'RGBA')
    WH = _chalk_col((238, 236, 228), 200, 0.0)
    CY = _chalk_col((120, 230, 225))
    VI = _chalk_col((190, 160, 255))
    AM = _chalk_col((255, 196, 130))
    PK = _chalk_col((255, 150, 200), 180)
    f_title = font('chalkduster', 92)
    f_h = font('chalk', 76, 2)
    f_b = font('chalk', 54, 1)
    f_s = font('chalk', 44, 1)

    def wobble_line(pts, col, w=6, jitter=2.0):
        """Hand-drawn chalk line: jittered path, pressure (width) varying along it."""
        out = []
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            n = max(2, int(math.hypot(x1 - x0, y1 - y0) / 30))
            for k in range(n):
                t = k / n
                out.append((x0 + (x1 - x0) * t + rng.normal(0, jitter), y0 + (y1 - y0) * t + rng.normal(0, jitter)))
        out.append(pts[-1])
        pw = w * rng.uniform(0.8, 1.15)
        for i in range(len(out) - 1):
            pw = min(max(pw + rng.normal(0, 0.12 * w), 0.6 * w), 1.4 * w)
            d.line([out[i], out[i + 1]], fill=col, width=max(2, int(round(pw))))

    def box(x, y, w, h, label, col=WH, f=f_b):
        wobble_line([(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)], col, 6)
        d.text((x + w / 2, y + h / 2), label, font=f, fill=col, anchor='mm')

    def arrow(p0, p1, col=WH, w=6):
        wobble_line([p0, p1], col, w)
        ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
        for s_ in (-1, 1):
            a = ang + math.pi + s_ * 0.5
            d.line([p1, (p1[0] + 34 * math.cos(a), p1[1] + 34 * math.sin(a))], fill=col, width=w)

    # faint eraser haze behind each block of notes (old, half-wiped chalk)
    hz = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hz)
    for (x0, y0, x1, y1) in ((60, 250, 1320, 980), (1400, 250, 2900, 980), (2930, 250, 4000, 1080),
                             (60, 1110, 1320, 2250), (1400, 1110, 2900, 2480), (2930, 1110, 4000, 2480),
                             (800, 30, 3300, 230)):
        for k in range(3):
            j = rng.uniform(-40, 40, 4)
            hd.rounded_rectangle([x0 + j[0], y0 + j[1], x1 + j[2], y1 + j[3]], radius=80, fill=(225, 225, 220, 6))
    for k in range(26):   # broad wipe strokes
        cx_, cy_ = rng.uniform(0, W), rng.uniform(0, H)
        hd.ellipse([cx_ - 420, cy_ - 60, cx_ + 420, cy_ + 60], fill=(225, 225, 220, 7))
    hz = hz.filter(ImageFilter.GaussianBlur(40))
    img.alpha_composite(hz)
    rich_text(d, W / 2, 70, 'Questions → Experiments → Systems', f_title, WH, anchor='ma', arrow_w=170)
    wobble_line([(900, 200), (3200, 200)], AM, 5)

    # --- section 1: system design (top left)
    d.text((110, 290), 'System design', font=f_h, fill=CY)
    wobble_line([(110, 385), (640, 385)], CY, 4)
    bx = [('data', 110, 470), ('model', 520, 470), ('evaluate', 930, 470)]
    for lab, x, y in bx:
        box(x, y, 300, 130, lab)
    arrow((410, 535), (515, 535))
    arrow((820, 535), (925, 535))
    box(930, 720, 300, 130, 'decide', AM)
    arrow((1080, 600), (1080, 715))
    box(520, 720, 300, 130, 'feedback', VI)
    arrow((925, 785), (825, 785), VI)
    arrow((520, 785), (260, 785), VI)
    arrow((260, 785), (260, 605), VI)
    d.text((110, 900), 'log every decision; score it later', font=f_s, fill=(200, 200, 195, 220))

    # --- section 2: optimisation (top middle)
    ox = 1460
    d.text((ox, 290), 'Optimisation', font=f_h, fill=VI)
    wobble_line([(ox, 385), (ox + 520, 385)], VI, 4)
    d.text((ox, 430), 'min  f(x)', font=f_b, fill=WH)
    d.text((ox, 500), 's.t.  Ax ≤ b,  x ≥ 0', font=f_b, fill=WH)
    rich_text(d, ox, 580, 'x_{k+1} = x_k − α∇f(x_k)', f_b, WH)
    ccx, ccy = ox + 900, 610
    for k in range(1, 8):
        pts = []
        for i in range(121):
            a = i / 120 * 2 * math.pi
            x, y = 52 * k * math.cos(a), 28 * k * math.sin(a)
            r = -0.5
            pts.append((ccx + x * math.cos(r) - y * math.sin(r) + rng.normal(0, 1.2),
                        ccy + x * math.sin(r) + y * math.cos(r) + rng.normal(0, 1.2)))
        d.line(pts, fill=(CY if k % 2 else VI)[:3] + (200,), width=5)
    pp = [(ccx - 330, ccy + 260), (ccx - 220, ccy + 140), (ccx - 140, ccy + 90), (ccx - 70, ccy + 40),
          (ccx - 25, ccy + 12), (ccx, ccy)]
    wobble_line(pp, AM, 6)
    for p in pp:
        d.ellipse([p[0] - 11, p[1] - 11, p[0] + 11, p[1] + 11], fill=AM)
    d.text((ccx + 40, ccy - 40), 'x*', font=f_b, fill=AM)

    # --- section 3: checklist (top right)
    cx0 = 2980
    d.text((cx0, 290), 'Before shipping', font=f_h, fill=AM)
    wobble_line([(cx0, 385), (cx0 + 620, 385)], AM, 4)
    items = [('Define the question', True), ('Baseline first', True), ('Same split, many seeds', True),
             ('Evaluate honestly', False), ('Ship, then learn', False), ('Repeat', False)]
    for i, (t, done) in enumerate(items):
        y = 440 + i * 100
        wobble_line([(cx0, y), (cx0 + 52, y), (cx0 + 52, y + 52), (cx0, y + 52), (cx0, y)], WH, 5)
        if done:
            wobble_line([(cx0 + 8, y + 26), (cx0 + 22, y + 46), (cx0 + 62, y - 6)], CY, 7)
        d.text((cx0 + 80, y - 4), t, font=f_b, fill=WH)

    # --- section 4: decision tree (bottom left)
    d.text((110, 1150), 'Decisions under uncertainty', font=f_h, fill=AM)
    wobble_line([(110, 1245), (1000, 1245)], AM, 4)
    sx, sy = 180, 1600
    d.rectangle([sx - 30, sy - 30, sx + 30, sy + 30], outline=WH, width=6)
    nodes = [(560, 1400), (560, 1800)]
    for nx, ny in nodes:
        wobble_line([(sx + 30, sy), (nx - 34, ny)], WH, 5)
        d.ellipse([nx - 34, ny - 34, nx + 34, ny + 34], outline=WH, width=6)
        for k, dy in enumerate((-110, 110)):
            ex, ey = nx + 380, ny + dy
            wobble_line([(nx + 34, ny), (ex, ey)], WH, 5)
            d.polygon([(ex, ey - 28), (ex + 40, ey), (ex, ey + 28)], outline=WH, width=6)
            rich_text(d, nx + 120, (ny + ey) / 2 - (60 if dy < 0 else -10), 'p' if k == 0 else '1−p', f_s, CY)
    rich_text(d, 180, 2050, 'E[U] = Σ p_i u(x_i)', f_b, WH)
    d.text((180, 2140), 'choose the act, not the outcome', font=f_s, fill=(200, 200, 195, 220))

    # --- section 5: research plan bars (bottom middle)
    rx = 1460
    d.text((rx, 1150), 'Research plan', font=f_h, fill=CY)
    wobble_line([(rx, 1245), (rx + 520, 1245)], CY, 4)
    rows = ['Read the literature', 'Build the baseline', 'Run ablations', 'Write it up', 'Share in public']
    for i, r in enumerate(rows):
        y = 1300 + i * 110
        d.text((rx, y), r, font=f_s, fill=WH)
        s0 = 0.08 + 0.17 * i
        wobble_line([(rx + 640 + 700 * s0, y + 30), (rx + 640 + 700 * (s0 + 0.28), y + 30)],
                    [CY, VI, AM, PK, CY][i], 22, 1.0)
    wobble_line([(rx + 640, 1290), (rx + 640, 1870)], (200, 200, 195, 200), 4)
    for q, lab in enumerate(['I', 'II', 'III', 'IV']):
        d.text((rx + 640 + 70 + q * 175, 1890), lab, font=f_s, fill=(200, 200, 195, 220), anchor='ma')

    # bias-variance sketch
    bx0, by0 = rx, 2050
    wobble_line([(bx0, by0), (bx0, by0 + 380), (bx0 + 800, by0 + 380)], WH, 5)
    pts = [(bx0 + 20 + i * 7.6, by0 + 340 - 300 * math.exp(-i / 22)) for i in range(100)]
    d.line(pts, fill=CY, width=6, joint='curve')
    pts = [(bx0 + 20 + i * 7.6, by0 + 340 - 3.0 * (i ** 1.6) / 10) for i in range(100)]
    d.line(pts, fill=VI, width=6, joint='curve')
    pts = [(bx0 + 20 + i * 7.6, by0 + 120 + 0.034 * (i - 42) ** 2) for i in range(100)]
    d.line(pts, fill=AM, width=6, joint='curve')
    d.text((bx0 + 830, by0 + 330), 'complexity', font=f_s, fill=(200, 200, 195, 220))

    # --- section 6: seven subjects (bottom right)
    sx0 = 2980
    d.text((sx0, 1150), 'Seven subjects', font=f_h, fill=VI)
    wobble_line([(sx0, 1245), (sx0 + 560, 1245)], VI, 4)
    subj = ['Machine learning', 'Statistics', 'Operations research', 'Management science', 'Logic',
            'Entrepreneurship', 'Engineering']
    for i, s in enumerate(subj):
        y = 1300 + i * 108
        d.text((sx0, y), f'{i + 1}.', font=f_b, fill=CY)
        d.text((sx0 + 80, y), s, font=f_b, fill=WH)
    # small rings doodle
    rcx, rcy = sx0 + 640, 2240
    for k, (rx_, ry_, rot) in enumerate(((200, 200, 0), (200, 70, 0.4), (200, 70, -0.5), (70, 200, 0.1))):
        pts = []
        for i in range(121):
            a = i / 120 * 2 * math.pi
            x, y = rx_ * math.cos(a), ry_ * math.sin(a)
            pts.append((rcx + x * math.cos(rot) - y * math.sin(rot), rcy + x * math.sin(rot) + y * math.cos(rot)))
        d.line(pts, fill=[WH, CY, VI, AM][k], width=5)
    d.ellipse([rcx - 20, rcy - 20, rcx + 20, rcy + 20], fill=AM)

    layer = layer.filter(ImageFilter.GaussianBlur(0.8))
    layer = chalkify(layer, rng)
    layer = layer.filter(ImageFilter.GaussianBlur(0.7))
    img.alpha_composite(layer)
    # faint ghost of erased writing
    ghost = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(ghost)
    for i in range(14):
        gd.text((rng.uniform(100, W - 900), rng.uniform(200, H - 200)), ['f(x)', 'p(y|x)', 'σ', 'n', 'grad',
                                                                         'argmin', 'E[x]'][i % 7],
                font=font('chalk', rng.uniform(80, 160), 1), fill=(230, 230, 230, 18))
    ghost = ghost.filter(ImageFilter.GaussianBlur(8))
    img.alpha_composite(ghost)
    img.convert('RGB').save(path)


# ----------------------------------------------------------------------------------
# Notebook, desk mat, emblem, wall picture, book spines
# ----------------------------------------------------------------------------------

def paint_notebook(path):
    """Open notebook spread. It is seen only ~150 px wide in the desk still, so the hand-drawn ink is bold and
    sparse: dark-blue ink at about 0.8 opacity, 24-40 px strokes, a four-line checklist on the left page and the
    v1 -> v2 -> v3 plan curve with three red nodes on the right page."""
    W, H = 2048, 1400
    rng = np.random.default_rng(8)
    paper = np.zeros((H, W, 3), np.float32)
    paper[:] = np.array([212, 204, 186], np.float32)
    paper += fbm2d(H // 2, W // 2, rng, [1, 6, 30], [0.4, 0.5, 0.6], wrap_x=False).repeat(2, 0).repeat(2, 1)[
        ..., None] * 2.0
    x = np.linspace(-1, 1, W)
    gut = 1 - 0.34 * np.exp(-(x / 0.04) ** 2) - 0.10 * np.exp(-(x / 0.18) ** 2)
    paper *= gut[None, :, None]
    img = Image.fromarray(np.clip(paper, 0, 255).astype(np.uint8)).convert('RGBA')
    ink_l = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ink_l, 'RGBA')
    dots = ImageDraw.Draw(img, 'RGBA')
    for yy in range(80, H - 40, 64):
        for xx in range(60, W - 40, 64):
            if abs(xx - W / 2) > 50:
                dots.ellipse([xx - 3, yy - 3, xx + 3, yy + 3], fill=(140, 140, 155, 70))
    ink = (20, 30, 88, 212)
    red = (176, 46, 36, 222)
    fh = font('hand', 210)
    fb = font('hand', 150)

    def pen(pts, col=ink, w=26, jit=2.0):
        q = [(px + rng.normal(0, jit), py + rng.normal(0, jit)) for px, py in pts]
        d.line(q, fill=col, width=w, joint='curve')

    # left page: a short checklist
    d.text((110, 40), 'Plan', font=fh, fill=ink)
    pen([(110, 300), (560, 290)], w=22)
    items = [('problem', True), ('ship v1', True), ('measure', False), ('iterate', False)]
    for i, (t, done) in enumerate(items):
        y = 390 + i * 235
        pen([(110, y + 20), (235, y + 16), (238, y + 140), (114, y + 144), (110, y + 20)], w=22, jit=1.5)
        if done:
            pen([(128, y + 78), (170, y + 132), (270, y - 6)], col=red, w=30)
        d.text((290, y - 10), t, font=fb, fill=ink)
    # right page: the plan curve, v1 -> v2 -> v3
    ox = W // 2 + 90
    rich_text(d, ox, 40, 'v1 → v2 → v3', fh, ink, arrow_w=170)
    x0, y0, x1, y1 = ox + 40, 380, W - 90, 1290
    pen([(x0, y0), (x0, y1), (x1, y1)], w=22, jit=1.0)
    d.polygon([(x1 + 10, y1), (x1 - 50, y1 - 28), (x1 - 50, y1 + 28)], fill=ink)
    d.polygon([(x0, y0 - 10), (x0 - 28, y0 + 50), (x0 + 28, y0 + 50)], fill=ink)
    pts = []
    for i in range(121):
        t = i / 120
        v = 1 / (1 + math.exp(-8 * (t - 0.6)))
        pts.append((x0 + 40 + (x1 - x0 - 90) * t, y1 - 60 - (y1 - y0 - 170) * v))
    pen(pts, w=40, jit=1.5)
    for t, lab in ((0.12, 'v1'), (0.55, 'v2'), (0.92, 'v3')):
        v = 1 / (1 + math.exp(-8 * (t - 0.6)))
        x, y = x0 + 40 + (x1 - x0 - 90) * t, y1 - 60 - (y1 - y0 - 170) * v
        d.ellipse([x - 48, y - 48, x + 48, y + 48], fill=red)
        ly = y - 250 if lab != 'v3' else y + 70
        lx = x - 60 if lab != 'v3' else x - 200
        d.text((lx, ly), lab, font=fb, fill=ink)
    ink_l = ink_l.filter(ImageFilter.GaussianBlur(1.2))
    img.alpha_composite(ink_l)
    img.convert('RGB').save(path)


def paint_deskmat(path):
    W, H = 2048, 1024
    cv = Canvas(W, H, (8, 9, 18))
    cx, cy = 1180, 560
    for k, r in enumerate((90, 150, 230, 320, 420)):
        c = (CYAN if k % 2 == 0 else VIOLET)
        pts = cv.ellipse_pts(cx, cy, r, r, 0, 240)
        cv.line(pts, c + (255 if k < 3 else 170,), 3 if k < 3 else 2)
        n = 36 + 12 * k
        for i in range(n):
            a = i / n * 2 * math.pi
            r1 = r + (14 if i % 6 == 0 else 7)
            cv.line([(cx + r * math.cos(a), cy + r * math.sin(a)), (cx + r1 * math.cos(a), cy + r1 * math.sin(a))],
                    c + (170,), 1.6)
    cv.circle(cx, cy, 34, fill=(140, 120, 255, 255))
    for a0 in (0.3, 2.2, 4.1):
        pts = cv.ellipse_pts(cx, cy, 380, 380, 0, 60, a0, a0 + 1.1)
        cv.line(pts, CYAN + (255,), 7)
    # thin border and corner ticks
    cv.rect(24, 24, W - 24, H - 24, outline=(70, 60, 160, 200), width=2, r=30)
    for i in range(8):
        cv.line([(80 + i * 40, H - 80), (80 + i * 40, H - 60)], CYAN + (200,), 2)
    # a fine dot scale in the top-left corner (no text: the room's only product name is on the middle monitor)
    for i in range(12):
        cv.circle(86 + i * 26, 70, 3.2 if i % 4 == 0 else 2.0, fill=(120, 110, 210, 200))
    cv.done().convert('RGB').save(path)


def paint_emblem(path):
    W = 1024
    cv = Canvas(W, W, (0, 0, 0))
    c = (220, 205, 170)
    for rx_, ry_, rot in ((360, 360, 0), (360, 120, 0.35), (120, 360, 0.15), (360, 120, -0.5)):
        cv.line(cv.ellipse_pts(512, 512, rx_, ry_, rot, 200), c + (255,), 12)
    cv.circle(512, 512, 46, fill=c + (255,))
    for i in range(7):
        a = i / 7 * 2 * math.pi - math.pi / 2
        cv.circle(512 + 360 * math.cos(a), 512 + 360 * math.sin(a), 24, fill=c + (255,))
    cv.done().convert('L').save(path)


def paint_wall_picture(path):
    """An original night-sky painting: layered peaks, aurora ribbon, lake reflection."""
    W, H = 2048, 1280
    rng = np.random.default_rng(99)
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    sky = np.zeros((H, W, 3), np.float32)
    top = np.array([0.006, 0.006, 0.03])
    mid = np.array([0.05, 0.02, 0.12])
    low = np.array([0.30, 0.10, 0.25])
    t = np.clip(y / 0.62, 0, 1)
    sky = top * (1 - t[..., None]) ** 1 + mid * np.sin(t * math.pi)[..., None] * 0.9 + low * (t ** 4)[..., None]
    sky = np.broadcast_to(sky, (H, W, 3)).astype(np.float32).copy()
    # stars
    for _ in range(2600):
        sx_, sy_ = rng.uniform(0, W), rng.uniform(0, H * 0.6)
        b = rng.uniform(0.05, 0.6) ** 2
        sky[int(sy_), int(sx_)] += b
    sky = ndimage.gaussian_filter(sky, (0.7, 0.7, 0))
    # aurora ribbon
    xs = np.linspace(0, 1, W)
    base = 0.36 + 0.06 * np.sin(xs * 6.0 + 0.5) + 0.03 * np.sin(xs * 17 + 1.0)
    rays = smooth_noise_1d(W, 160, rng)
    rays = 0.3 + 0.7 * (0.5 + 0.5 * rays) ** 2
    h = (base[None, :] - y)  # positive above base
    env = np.where(h < 0, np.exp(h / 0.006), np.exp(-h / 0.12)) * (h > -0.05)
    col = np.where((h / 0.25)[..., None] < 0.4, np.array([0.15, 0.95, 0.55]), np.array([0.45, 0.25, 0.95]))
    sky += (env * rays[None, :])[..., None] * col * 0.65
    # mountains
    img = sky.copy()

    def ridge(y0, amp, seed):
        """Far mountains: sharp peaks (triangle waves), not rounded bumps."""
        r = np.random.default_rng(seed)
        prof = np.zeros(W)
        for k, a in ((2, 1.0), (5, 0.45), (13, 0.18), (37, 0.06)):
            ph = r.uniform(0, 1)
            tri = 1 - 2 * np.abs(np.mod(xs * k * r.uniform(0.7, 1.2) + ph, 1.0) - 0.5)
            prof += a * tri ** 1.4
        return y0 - amp * prof / 1.7

    def treeline(y_base, seed, n=190):
        """Near shore: pointed conifer silhouettes with stepped branch tiers."""
        r = np.random.default_rng(seed)
        top = np.full(W, y_base - 0.012)
        for _ in range(n):
            xc = r.uniform(-0.02, 1.02)
            hgt = r.uniform(0.035, 0.115)
            half_w = hgt * r.uniform(0.20, 0.27) * (H / W)
            dx = np.abs(xs - xc)
            f = 1 - dx / half_w
            prof = hgt * f - 0.10 * hgt * np.mod(f * 6.0, 1.0) * (f < 0.92)
            top = np.where(dx < half_w, np.minimum(top, y_base - prof), top)
        return top

    far = ridge(0.60, 0.20, 1)
    img[(y > far[None, :]) & (y < 0.66)] = (0.03, 0.02, 0.07)
    near = treeline(0.655, 2)
    img[(y > near[None, :]) & (y < 0.66)] = (0.010, 0.008, 0.024)
    # lake: mirrored sky above the waterline, darkened
    wl = int(0.66 * H)
    refl = img[wl - (H - wl):wl][::-1] * 0.45
    refl[:, :] += np.array([0.0, 0.0, 0.01])
    ripple = (np.sin(np.linspace(0, 120, H - wl))[:, None] * 0.04 + 1)
    img[wl:] = refl * ripple[..., None]
    img[wl - 1:wl + 1] = np.array([0.08, 0.06, 0.12])
    save_linear(np.clip(img, 0, 1).astype(np.float32), path, rng)


SPINE_PALETTE = [
    (24, 30, 58), (92, 26, 38), (28, 58, 46), (18, 18, 22), (210, 200, 178), (168, 120, 52), (30, 84, 96),
    (84, 84, 92), (70, 40, 92), (120, 46, 32), (44, 52, 110), (200, 176, 140), (36, 40, 44), (140, 150, 160),
    (60, 92, 70), (176, 70, 60), (230, 224, 210), (52, 30, 40),
]
SPINE_TITLES = ['Probability', 'Linear Algebra', 'Optimization', 'Decision Analysis', 'Statistical Learning',
                'Game Theory', 'Stochastic Processes', 'Econometrics', 'Logic', 'Algorithms', 'Systems',
                'Inference', 'Queueing', 'Forecasting', 'Networks', 'Design', 'Calculus', 'Markets', 'Strategy',
                'Computation', 'Information', 'Control', 'Simulation', 'Causality', 'Proofs', 'Data',
                'Experiments', 'Learning', 'Graphs', 'Measure', 'Geometry', 'Writing']


def paint_spine_atlas(path):
    """64 spines in a 32x2 grid of 128x1024 cells; cell 63 is page edges."""
    CW, CH, NX, NY = 128, 1024, 32, 2
    rng = np.random.default_rng(17)
    img = Image.new('RGB', (CW * NX, CH * NY), (0, 0, 0))
    d = ImageDraw.Draw(img)
    for idx in range(NX * NY):
        cx, cy = (idx % NX) * CW, (idx // NX) * CH
        if idx == NX * NY - 1:
            # page block: cream with fine lines
            d.rectangle([cx, cy, cx + CW, cy + CH], fill=(226, 218, 196))
            for k in range(0, CH, 3):
                d.line([(cx, cy + k), (cx + CW, cy + k)], fill=(206, 198, 176))
            continue
        col = SPINE_PALETTE[rng.integers(0, len(SPINE_PALETTE))]
        d.rectangle([cx, cy, cx + CW, cy + CH], fill=col)
        lum = 0.3 * col[0] + 0.59 * col[1] + 0.11 * col[2]
        light = lum > 140
        foil = (212, 176, 96) if rng.uniform() < 0.6 else ((40, 36, 30) if light else (230, 226, 214))
        style = rng.integers(0, 4)
        if style in (0, 1):
            for yy in (70, 92, CH - 92, CH - 70):
                d.rectangle([cx + 6, cy + yy, cx + CW - 6, cy + yy + (6 if style == 0 else 3)], fill=foil)
        if style == 2:
            d.rectangle([cx, cy + 120, cx + CW, cy + 340], fill=tuple(int(c * 0.6) for c in col))
        if style == 3:
            d.rectangle([cx + 10, cy + 40, cx + CW - 10, cy + CH - 40], outline=foil, width=3)
        title = SPINE_TITLES[idx % len(SPINE_TITLES)]
        fnt = [font('bask', 54, 1), font('futura', 50, 0), font('didot', 54, 0), font('gill', 52, 4)][idx % 4]
        tw = int(fnt.getlength(title)) + 20
        txt = Image.new('L', (max(tw, 10), CW), 0)
        ImageDraw.Draw(txt).text((10, CW / 2), title, font=fnt, fill=255, anchor='lm')
        txt = txt.rotate(-90, expand=True)
        tw2, th2 = txt.size
        scale = min(1.0, (CH - 420) / th2)
        if scale < 1.0:
            txt = txt.resize((max(1, int(tw2 * scale)), max(1, int(th2 * scale))), Image.LANCZOS)
        ox = cx + (CW - txt.size[0]) // 2
        oy = cy + 200
        img.paste(Image.new('RGB', txt.size, foil), (ox, oy), txt)
        # wear
        arr = np.asarray(img.crop((cx, cy, cx + CW, cy + CH))).astype(np.float32)
        arr *= (1 + rng.normal(0, 0.025, (CH, 1, 1)))
        img.paste(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)), (cx, cy))
    img.save(path)


STACK = ['Machine Learning', 'Statistics', 'Operations Research', 'Management Science', 'Logic',
         'Entrepreneurship', 'Engineering']
STACK_COLS = [(34, 40, 76), (60, 64, 74), (36, 58, 94), (80, 42, 58), (54, 54, 62), (34, 70, 66), (74, 56, 42)]


def paint_stack_spines(path):
    """Seven horizontal spines (1024x148 each) for the book stack on the low table. The title fills about
    70-75% of the spine height, centred, in a condensed face so the longest title still fits."""
    CW, CH = 1024, 148
    img = Image.new('RGB', (CW, CH * 8), (230, 222, 200))
    d = ImageDraw.Draw(img)
    for i, (t, c) in enumerate(zip(STACK, STACK_COLS)):
        y = i * CH
        d.rectangle([0, y, CW, y + CH], fill=c)
        d.rectangle([0, y + 4, CW, y + 7], fill=(200, 170, 100))
        d.rectangle([0, y + CH - 7, CW, y + CH - 4], fill=(200, 170, 100))
        size = 110
        f = font('avenir_c', size, 2)
        while f.getlength(t) > CW - 110:
            size -= 2
            f = font('avenir_c', size, 2)
        d.text((CW / 2, y + CH / 2 + 2), t, font=f, fill=(240, 234, 218), anchor='mm')
    # last row: page-edge texture
    y = 7 * CH
    for k in range(0, CH, 3):
        d.line([(0, y + k), (CW, y + k)], fill=(205, 196, 172))
    img.save(path)


def paint_cover(path):
    """Closed notebook cover: dark linen with a blind-debossed ring emblem."""
    W, H = 1024, 1400
    rng = np.random.default_rng(4)
    a = np.zeros((H, W, 3), np.float32)
    a[:] = (22, 24, 34)
    weave = (np.sin(np.arange(W) * 1.9)[None, :] * np.sin(np.arange(H) * 1.7)[:, None]) * 2.5
    a += weave[..., None] + rng.normal(0, 2.5, (H, W, 1))
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
    d = ImageDraw.Draw(img, 'RGBA')
    cx, cy = W / 2, H * 0.42
    for rx_, ry_, rot in ((230, 230, 0), (230, 76, 0.35), (76, 230, 0.15)):
        pts = []
        for i in range(181):
            t = i / 180 * 2 * math.pi
            x, y = rx_ * math.cos(t), ry_ * math.sin(t)
            pts.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
        d.line(pts, fill=(190, 160, 100, 200), width=8)
    d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], fill=(190, 160, 100, 220))
    d.text((cx, H * 0.78), 'NOTES', font=font('avenir', 60, AV_UL), fill=(190, 160, 100, 200), anchor='mm')
    d.rectangle([W - 90, 0, W - 66, H], fill=(14, 15, 20, 255))  # elastic band
    img.convert('RGB').save(path)


def main():
    out = sys.argv[1]
    only = None
    sky_w = 8192
    if '--only' in sys.argv:
        only = set(sys.argv[sys.argv.index('--only') + 1].split(','))
    if '--sky-width' in sys.argv:
        sky_w = int(sys.argv[sys.argv.index('--sky-width') + 1])
    os.makedirs(out, exist_ok=True)
    _ensure_font_attrs()
    jobs = [
        ('screen_left', lambda: screen_left(os.path.join(out, 'screen_left.png'))),
        ('screen_center', lambda: screen_center(os.path.join(out, 'screen_center.png'))),
        ('screen_right', lambda: screen_right(os.path.join(out, 'screen_right.png'))),
        ('board', lambda: paint_board(os.path.join(out, 'board.png'))),
        ('notebook', lambda: paint_notebook(os.path.join(out, 'notebook.png'))),
        ('deskmat', lambda: paint_deskmat(os.path.join(out, 'deskmat.png'))),
        ('emblem', lambda: paint_emblem(os.path.join(out, 'emblem.png'))),
        ('cover', lambda: paint_cover(os.path.join(out, 'cover.png'))),
        ('wallpic', lambda: paint_wall_picture(os.path.join(out, 'wall_picture.png'))),
        ('spines', lambda: paint_spine_atlas(os.path.join(out, 'spines.png'))),
        ('stack', lambda: paint_stack_spines(os.path.join(out, 'stack_spines.png'))),
        ('sky', lambda: paint_sky(os.path.join(out, 'sky_pano.png'), sky_w)),
    ]
    for name, fn in jobs:
        if only and name not in only:
            continue
        print('painting', name, flush=True)
        fn()
    if not only:
        with open(os.path.join(out, 'tex_version.txt'), 'w') as f:
            f.write(TEX_VERSION)
    print('done')


if __name__ == '__main__':
    main()
