"""The lonely platform: a timber deck on piles beside the line, one gas lamp, a bench and a nameboard."""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from . import mesh as mk
from .cel import Part
from .materials import BLACK, BRASS, BRASS_DK, DECK, IRON, LAMPGLASS, POST, ROOF, WHITE

DECK_Y = 1.26
X0, X1 = -11.0, 11.0
Z0, Z1 = 1.78, 4.7
LAMP_POS = np.array([2.6, DECK_Y + 2.72, 4.15])
SIGN = dict(x0=-5.6, x1=-3.0, y0=DECK_Y + 1.25, y1=DECK_Y + 2.0, z=4.32)
SIGN_MAT = 23   # decal material slot (replaces FISH id inside the platform pass)


def platform_mesh(seed=5):
    rng = np.random.default_rng(seed)
    m = []
    # deck planks run along the line, each a little different
    z = Z0
    while z < Z1 - 0.05:
        w = rng.uniform(0.24, 0.3)
        y = DECK_Y + rng.uniform(-0.012, 0.012)
        xa, xb = X0 + rng.uniform(-0.15, 0.05), X1 + rng.uniform(-0.05, 0.15)
        m.append(mk.box(xb - xa, 0.07, w - 0.025, DECK, center=((xa + xb) / 2, y - 0.035, z + w / 2)))
        z += w
    # joists and fascia
    m.append(mk.box(X1 - X0 + 0.3, 0.22, 0.1, POST, center=(0, DECK_Y - 0.18, Z0 + 0.03)))
    m.append(mk.box(X1 - X0 + 0.3, 0.035, 0.12, WHITE, center=(0, DECK_Y + 0.003, Z0 + 0.06)))
    m.append(mk.box(X1 - X0 + 0.3, 0.22, 0.1, POST, center=(0, DECK_Y - 0.18, Z1 - 0.03)))
    for x in np.arange(X0 + 0.4, X1, 2.4):
        m.append(mk.box(0.14, 0.18, Z1 - Z0, POST, center=(x, DECK_Y - 0.16, (Z0 + Z1) / 2)))
    # piles into the water with cross bracing
    for x in np.arange(X0 + 0.4, X1, 2.4):
        for zz in (Z0 + 0.12, Z1 - 0.12):
            lean = rng.uniform(-0.03, 0.03)
            m.append(mk.cyl_between((x + lean, -0.6, zz), (x, DECK_Y - 0.25, zz), 0.11, 10, POST))
        m.append(mk.cyl_between((x, 0.15, Z0 + 0.12), (x, DECK_Y - 0.3, Z1 - 0.12), 0.04, 6, POST))
    for x in np.arange(X0 + 0.4, X1 - 2.4, 2.4):
        m.append(mk.cyl_between((x, 0.25, Z1 - 0.1), (x + 2.4, DECK_Y - 0.3, Z1 - 0.1), 0.035, 6, POST))
    # steps down to the water at the far end (a little landing for boats that never come)
    for k in range(4):
        m.append(mk.box(1.1, 0.06, 0.3, DECK, center=(X0 - 0.2 - k * 0.0, DECK_Y - 0.3 - k * 0.28, Z1 + 0.15 + k * 0.3)))
    m.append(lamp_post())
    m.append(bench().transformed(mk.T(-1.2, DECK_Y, 4.05)))
    m.append(nameboard())
    m.append(fence())
    return mk.merge(m)


def lamp_post():
    x, z = LAMP_POS[0], LAMP_POS[2]
    m = []
    base = mk.lathe([(0.17, 0), (0.17, 0.12), (0.12, 0.16), (0.1, 0.4), (0.075, 0.48), (0.055, 0.6)], 18, IRON)
    m.append(base)
    m.append(mk.cyl_between((0, 0.55, 0), (0, 2.45, 0), 0.05, 12, IRON))
    m.append(mk.lathe([(0.075, 2.3), (0.075, 2.36), (0.05, 2.4)], 14, BRASS_DK))
    # ladder bar
    m.append(mk.cyl_between((-0.32, 2.25, 0), (0.32, 2.25, 0), 0.02, 6, IRON))
    # lantern: frame, glass, cap, finial
    m.append(mk.lathe([(0.0, 2.45), (0.12, 2.45), (0.15, 2.5)], 4, IRON, smooth=False).transformed(mk.R('y', 45)))
    glass = mk.lathe([(0.15, 2.5), (0.2, 2.86)], 4, LAMPGLASS, caps=False, smooth=False).transformed(mk.R('y', 45))
    m.append(glass)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        m.append(mk.cyl_between((0.15 * math.cos(a), 2.5, 0.15 * math.sin(a)), (0.2 * math.cos(a), 2.86, 0.2 * math.sin(a)),
                                0.012, 5, IRON))
    m.append(mk.lathe([(0.24, 2.86), (0.24, 2.9), (0.12, 3.02), (0.05, 3.06), (0.0, 3.07)], 4, IRON, smooth=False).transformed(mk.R('y', 45)))
    m.append(mk.lathe([(0.0, 3.06), (0.03, 3.06), (0.03, 3.14), (0.045, 3.18), (0.0, 3.22)], 8, BRASS))
    return mk.merge(m).transformed(mk.T(x, DECK_Y, z))


def bench():
    m = []
    for k in range(3):
        m.append(mk.box(1.7, 0.035, 0.1, DECK, center=(0, 0.46, -0.13 + k * 0.12)))
    for k in range(2):
        m.append(mk.box(1.7, 0.09, 0.03, DECK, center=(0, 0.66 + k * 0.14, 0.06)).transformed(mk.R('x', -8)))
    for x in (-0.7, 0.7):
        m.append(mk.box(0.05, 0.46, 0.05, IRON, center=(x, 0.23, -0.15)))
        m.append(mk.box(0.05, 0.86, 0.05, IRON, center=(x, 0.43, 0.08)))
        m.append(mk.box(0.05, 0.05, 0.3, IRON, center=(x, 0.44, -0.03)))
    return mk.merge(m)


def nameboard():
    s = SIGN
    m = []
    for x in (s['x0'] + 0.2, s['x1'] - 0.2):
        m.append(mk.box(0.09, s['y0'] - DECK_Y + 0.05, 0.09, POST, center=(x, (s['y0'] + DECK_Y) / 2, s['z'] - 0.08)))
    m.append(mk.box(s['x1'] - s['x0'] + 0.08, s['y1'] - s['y0'] + 0.08, 0.06, POST,
                    center=((s['x0'] + s['x1']) / 2, (s['y0'] + s['y1']) / 2, s['z'] - 0.02)))
    m.append(mk.box(s['x1'] - s['x0'], s['y1'] - s['y0'], 0.02, SIGN_MAT,
                    center=((s['x0'] + s['x1']) / 2, (s['y0'] + s['y1']) / 2, s['z'] + 0.02)))
    m.append(mk.box(s['x1'] - s['x0'] + 0.2, 0.06, 0.16, ROOF, center=((s['x0'] + s['x1']) / 2, s['y1'] + 0.07, s['z'] + 0.03)))
    return mk.merge(m)


def fence():
    m = []
    z = Z1 - 0.05
    rng = np.random.default_rng(9)
    for x in np.arange(X0 + 0.2, X1, 1.25):
        hgt = 0.95 + rng.uniform(-0.03, 0.02)
        m.append(mk.box(0.06, hgt, 0.06, POST, center=(x, DECK_Y + hgt / 2, z)).transformed(
            mk.chain(mk.T(x, DECK_Y, z), mk.R('z', rng.uniform(-1.5, 1.5)), mk.T(-x, -DECK_Y, -z))))
    for y in (0.45, 0.9):
        m.append(mk.box(X1 - X0 - 0.2, 0.05, 0.04, POST, center=(0, DECK_Y + y, z)))
    return mk.merge(m)


def sign_texture(w=1040, h=300):
    """Station nameboard: kanji, hiragana, and the neighbouring stations (the next one is the Milky Way)."""
    img = Image.new('RGB', (w, h), (232, 228, 214))
    d = ImageDraw.Draw(img)
    ink = (28, 34, 54)
    f_big = ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc', 120)
    f_k = ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W5.ttc', 50)
    f_s = ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc', 34)
    d.rectangle([6, 6, w - 7, h - 7], outline=ink, width=6)
    d.text((w // 2, 44), '星 海', font=f_k, fill=ink, anchor='mm')
    d.text((w // 2, 140), 'ほしうみ', font=f_big, fill=ink, anchor='mm')
    band = (36, 70, 132)
    d.rectangle([12, 212, w - 13, 230], fill=band)
    d.text((40, 262), '◀ うみべ', font=f_s, fill=ink, anchor='lm')
    d.text((w - 40, 262), 'あまのがわ ▶', font=f_s, fill=ink, anchor='rm')
    a = np.asarray(img, dtype=np.float32) / 255.0
    # weathering: salt-yellowed enamel, a rust run from each bolt, a little grime toward the bottom
    rng = np.random.default_rng(3)
    yy, xx = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    grime = 0.06 * yy ** 2 + 0.03 * rng.random((h, w))
    a = a * (1 - grime[..., None]) * np.array([1.0, 0.985, 0.95])
    for bx in (0.05, 0.95):
        run = np.exp(-((xx - bx) / 0.008) ** 2) * np.clip(1 - (yy - 0.08) / 0.5, 0, 1) * (yy > 0.06)
        a = a * (1 - 0.22 * run[..., None] * np.array([0.6, 0.85, 1.0]))
    return np.flipud(a).copy()


def sign_decal():
    s = SIGN
    o = np.array([s['x0'], s['y0'], s['z'] - 0.011])
    u = np.array([s['x1'] - s['x0'], 0, 0])
    v = np.array([0, s['y1'] - s['y0'], 0])
    return o, u, v


class Platform:
    def __init__(self, gl):
        self.part = Part(gl, platform_mesh(), 200, 0.62, 'platform')
        self.sign = gl.tex_from_array(sign_texture(), dtype='f2')

    def items(self):
        return [(self.part, np.eye(4))]
