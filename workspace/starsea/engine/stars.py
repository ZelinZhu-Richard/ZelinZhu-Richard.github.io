"""One star catalogue for the whole film, defined in direction space so every shot sees the same sky."""
import math

import moderngl
import numpy as np

from .world import MW_CORE, MW_POLE

PALETTE = np.array([
    [0.90, 0.93, 1.00],  # blue-white
    [0.86, 0.90, 1.00],
    [1.00, 0.97, 0.92],  # white
    [1.00, 0.90, 0.76],  # warm
    [0.80, 0.92, 1.00],  # cyan
    [1.00, 0.84, 0.92],  # rose
])
PAL_P = np.array([0.32, 0.2, 0.24, 0.12, 0.07, 0.05])


def band_density(d):
    B = np.cross(MW_POLE, MW_CORE)
    l = np.degrees(np.arctan2(d @ B, d @ MW_CORE))
    b = np.degrees(np.arcsin(np.clip(d @ MW_POLE, -1, 1)))
    w = 6.0 + 6.5 * np.exp(-(l / 32) ** 2)
    prof = np.exp(-(b / w) ** 2 * 1.3)
    bulge = np.exp(-(l / 15) ** 2 - (b / 7.5) ** 2)
    along = 0.45 + 0.55 * np.exp(-(np.abs(l) / 65) ** 2)
    return prof * along + bulge, l, b


class Catalogue:
    def __init__(self, n=600000, seed=11):
        rng = np.random.default_rng(seed)
        # candidates over the upper hemisphere (slightly below the horizon too)
        m = int(n * 3.2)
        z = rng.uniform(-0.05, 1.0, m)
        phi = rng.uniform(0, 2 * math.pi, m)
        s = np.sqrt(1 - z * z)
        d = np.stack([s * np.cos(phi), z, s * np.sin(phi)], 1)
        dens, l, b = band_density(d)
        # clumpy modulation so the band reads as star clouds, not a smooth stripe
        clump = 0.5 + 0.5 * np.sin(l * 0.21 + np.sin(b * 0.5) * 2.0) * np.sin(b * 0.37 + l * 0.05)
        p = 0.07 + 1.3 * dens * (0.4 + 1.1 * clump)
        keep = rng.random(m) < p / p.max()
        d = d[keep]
        # spatter is clustered: a share of the stars sits in flicked clumps along the band
        cand = np.stack([s * np.cos(phi), z, s * np.sin(phi)], 1)
        w = np.clip(dens, 0, None)
        nc = 900
        cdir = cand[rng.choice(m, nc, p=w / w.sum())]
        per = rng.integers(20, 80, nc)
        cl = np.repeat(cdir, per, 0) + rng.normal(0, 0.006, (per.sum(), 3)) * rng.uniform(0.5, 2.5, (per.sum(), 1))
        cl /= np.linalg.norm(cl, axis=1, keepdims=True)
        d = np.concatenate([d, cl])
        d = d[rng.permutation(len(d))][:n]
        self.dir = d.astype(np.float64)
        k = len(d)
        # brightness rank: most stars faint (power law); band stars are mostly faint
        self.mag = rng.random(k) ** 0.55          # 0 = brightest
        inband = band_density(d)[0]
        self.mag = np.clip(self.mag + 0.12 * np.clip(inband, 0, 1) * rng.random(k), 0, 1)
        self.col = PALETTE[rng.choice(len(PALETTE), k, p=PAL_P)] * rng.uniform(0.92, 1.0, (k, 1))
        self.seed = rng.random(k)

    def bright_ids(self, count=360):
        return np.argsort(self.mag)[:count]


def project(cam, dirs, w, h):
    r, u, f = cam.basis()
    z = dirs @ f
    x = dirs @ r / np.maximum(z, 1e-6)
    y = dirs @ u / np.maximum(z, 1e-6)
    t = cam.tanh
    px = ((x / (t * cam.aspect)) - cam.shift[0]) * 0.5 + 0.5
    py = ((y / t) - cam.shift[1]) * 0.5 + 0.5
    return np.stack([px * w, py * h], 1), z > 0.01


class StarPainter:
    def __init__(self, gl):
        self.gl = gl
        self.prog = gl.program('star.frag', vert='star.vert')
        corners = np.array([-1, -1, 1, -1, -1, 1, 1, 1], 'f4')
        self.cvbo = gl.ctx.buffer(corners.tobytes())

    def draw(self, fbo, w, h, centers, radius, alpha, kind, seed, col, scale=1.0, glow=False, stretch=(1.0, 1.0)):
        if len(centers) == 0:
            return
        ext = np.where(kind > 1.5, radius * 26 * scale, np.where(kind > 0.5, radius * 14, radius + 2.5 * scale))
        if not glow:
            ext = radius * 1.4 + 2.0 * scale
        inst = np.concatenate([centers, np.stack([radius, alpha, kind, seed], 1), col, ext[:, None]], 1).astype('f4')
        ivbo = self.gl.ctx.buffer(np.ascontiguousarray(inst).tobytes())
        vao = self.gl.ctx.vertex_array(self.prog, [
            (self.cvbo, '2f', 'in_corner'),
            (ivbo, '2f 4f 3f 1f/i', 'in_c', 'in_s', 'in_col', 'in_ext'),
        ])
        fbo.use()
        self.gl.bind(self.prog, {'u_res': (w, h), 'u_scale': scale, 'u_glow': 1.0 if glow else 0.0, 'u_stretch': tuple(stretch)})
        self.gl._blend('add' if glow else 'premul')
        vao.render(moderngl.TRIANGLE_STRIP, instances=len(inst))
        self.gl.ctx.disable(moderngl.BLEND)
        vao.release()
        ivbo.release()


def star_style(mag, scale, exclude_bright=0):
    """Map brightness rank to painted size/alpha/kind (sizes in plate px)."""
    r = (0.36 + 1.7 * (1 - mag) ** 9 + 0.5 * (1 - mag) ** 2.5) * scale
    a = np.clip(0.2 + 0.88 * (1 - mag) ** 2.6, 0, 1)
    kind = np.zeros_like(mag)
    kind[mag < 0.012] = 1
    kind[mag < 0.003] = 2
    return r, a, kind
