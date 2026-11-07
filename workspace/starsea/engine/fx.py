"""Effect drawings: meteors, kira sparkles, luminous fish, ribbons of light. Each effect is a function of
time so any frame renders on its own; drawn elements are held on 2s/3s per the timing sheet."""
import math

import moderngl
import numpy as np

FPS = 24.0
FMT = '2f 2f 4f 1f'
ATTRS = ('in_pos', 'in_uv', 'in_col', 'in_soft')


class RibbonPainter:
    def __init__(self, gl):
        self.gl = gl
        self.prog = gl.program('ribbon.frag', vert='ribbon.vert')

    def draw(self, fbo, verts, w, h, blend='premul'):
        if len(verts) == 0:
            return
        data = np.ascontiguousarray(np.asarray(verts, 'f4'))
        vbo = self.gl.ctx.buffer(data.tobytes())
        vao = self.gl.ctx.vertex_array(self.prog, [(vbo, FMT, *ATTRS)])
        fbo.use()
        self.gl.bind(self.prog, {'u_res': (w, h)})
        self.gl._blend(blend)
        vao.render(moderngl.TRIANGLES)
        self.gl.ctx.disable(moderngl.BLEND)
        vao.release(); vbo.release()


def ribbon(pts, widths, cols, soft=1.0):
    """Triangles for a screen-space polyline with per-point width (px) and rgba."""
    pts = np.asarray(pts, float)
    if len(pts) < 2:
        return np.zeros((0, 9), 'f4')
    d = np.gradient(pts, axis=0)
    n = np.stack([-d[:, 1], d[:, 0]], 1)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-6)
    L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    u = L / max(L[-1], 1e-6)
    out = []
    for i in range(len(pts) - 1):
        a0, a1 = pts[i] + n[i] * widths[i], pts[i + 1] + n[i + 1] * widths[i + 1]
        b0, b1 = pts[i] - n[i] * widths[i], pts[i + 1] - n[i + 1] * widths[i + 1]
        for (p, uu, vv, c) in ((a0, u[i], 1, cols[i]), (b0, u[i], -1, cols[i]), (a1, u[i + 1], 1, cols[i + 1]),
                               (b0, u[i], -1, cols[i]), (b1, u[i + 1], -1, cols[i + 1]), (a1, u[i + 1], 1, cols[i + 1])):
            out.append([p[0], p[1], uu, vv, c[0], c[1], c[2], c[3], soft])
    return np.array(out, 'f4')


def project_dirs(cam, dirs, w, h):
    r, u, f = cam.basis()
    z = dirs @ f
    x = dirs @ r / np.maximum(z, 1e-6)
    y = dirs @ u / np.maximum(z, 1e-6)
    t = cam.tanh
    px = ((x / (t * cam.aspect)) - cam.shift[0]) * 0.5 + 0.5
    py = ((y / t) - cam.shift[1]) * 0.5 + 0.5
    return np.stack([px * w, py * h], 1), z > 0.02


def slerp(a, b, u):
    a, b = np.asarray(a, float), np.asarray(b, float)
    om = math.acos(np.clip(np.dot(a, b), -1, 1))
    if om < 1e-6:
        return a
    return (math.sin((1 - u) * om) * a + math.sin(u * om) * b) / math.sin(om)


def sky_dir(az, el):
    a, e = math.radians(az), math.radians(el)
    return np.array([math.cos(e) * math.cos(a), math.sin(e), -math.cos(e) * math.sin(a)])


# ------------------------------------------------------------------ meteors
class Meteor:
    def __init__(self, t0, az0, el0, az1, el1, frames=10, width=2.4, bright=1.0):
        self.t0, self.frames, self.width, self.bright = t0, frames, width, bright
        self.d0, self.d1 = sky_dir(az0, el0), sky_dir(az1, el1)

    def geometry(self, t, cam, w, h, mirror=False):
        k = (t - self.t0) * FPS
        if k < 0 or k > self.frames + 5:
            return None, None
        u_head = min(k / self.frames, 1.0)
        env = min(k / (0.25 * self.frames), 1.0)
        if 0.72 <= u_head <= 0.86:
            env = 1.5
        alive = k <= self.frames
        tail_len = 0.35
        u_tail = max(u_head - tail_len, 0.0)
        if not alive:
            # afterglow: the tail lingers and fades, the head is gone
            fade = 1 - (k - self.frames) / 5.0
            env = 0.5 * fade
        us = np.linspace(u_tail, u_head, 24)
        dirs = np.array([slerp(self.d0, self.d1, uu) for uu in us])
        if mirror:
            dirs = dirs * np.array([1, -1, 1])
        pix, ok = project_dirs(cam, dirs, w, h)
        if not ok.all():
            return None, None
        s = np.linspace(0, 1, len(us))          # 0 tail .. 1 head
        widths = (0.4 + (self.width - 0.4) * s ** 2) * (1.0 if alive else 0.8)
        a = np.exp(-(1 - s) * 3.0) * env * self.bright * (0.6 if mirror else 1.0)
        tailc = np.array([0.62, 0.72, 1.0]); headc = np.array([1.0, 1.0, 1.0])
        cols = np.array([np.r_[tailc * (1 - si) + headc * si, min(ai, 1.0)] for si, ai in zip(s, a)])
        core = ribbon(pix, widths, cols, soft=0.6)
        gcols = cols.copy(); gcols[:, 3] *= 0.7
        glow = ribbon(pix, widths * 3.5, gcols, soft=1.0)
        return core, glow


# ------------------------------------------------------------------ kira sparkles
KIRA_SEQ = [(0.35, 2), (1.0, 2), (0.75, 3), (0.45, 2), (0.2, 2)]


def kira_scale(k, variant=0):
    holds = KIRA_SEQ if variant % 2 == 0 else [(0.4, 3), (1.0, 2), (0.6, 2), (0.3, 3)]
    acc = 0
    for sc, hold in holds:
        if acc <= k < acc + hold:
            return sc
        acc += hold
    return 0.0


def kira_geometry(center, L, color, alpha=1.0, rot=0.0, diag=0.0):
    """Four concave arms (plus optional diagonals) as tapered ribbons."""
    out = []
    arms = [(0, 1.0), (90, 1.15), (180, 1.0), (270, 1.15)]
    if diag > 0:
        arms += [(45, diag), (135, diag), (225, diag), (315, diag)]
    for ang, ln in arms:
        a = math.radians(ang + rot)
        d = np.array([math.cos(a), math.sin(a)])
        pts = [center + d * L * ln * t for t in np.linspace(0, 1, 6)]
        wid = [L / 6 * (1 - t) ** 1.6 + 0.35 for t in np.linspace(0, 1, 6)]
        cols = [np.r_[color, alpha * (1 - 0.4 * t)] for t in np.linspace(0, 1, 6)]
        out.append(ribbon(pts, wid, cols, soft=0.35))
    return np.concatenate(out) if out else np.zeros((0, 9), 'f4')


# ------------------------------------------------------------------ fish
class Fish:
    def __init__(self, x, z, t0, heading=1.0, dist=5.0, height=2.6, length=0.9, airtime=20):
        self.x, self.z, self.t0 = x, z, t0
        self.heading, self.dist, self.height, self.length, self.air = heading, dist, height, length, airtime

    def pose(self, t):
        k = (t - self.t0) * FPS
        if k < 0 or k > self.air:
            return None
        kq = math.floor(k / 2) * 2
        tau = kq / self.air
        x = self.x + self.heading * self.dist * tau
        y = 4 * self.height * tau * (1 - tau) + 0.1
        vx = self.heading * self.dist / self.air
        vy = 4 * self.height * (1 - 2 * tau) / self.air
        return np.array([x, y, self.z]), np.array([vx, vy, 0.0]), tau

    def rings(self):
        return [(self.x, self.z, self.t0 - 1 / FPS, 0.7),
                (self.x + self.heading * self.dist, self.z, self.t0 + self.air / FPS, 0.9)]


class FishPainter:
    def __init__(self, gl):
        self.gl = gl
        self.prog = gl.program('fish.frag')

    def draw(self, fbo, fishes, t, cam, w, h, mirror=False):
        f0 = np.zeros((8, 4), 'f4'); f1 = np.zeros((8, 4), 'f4')
        n = 0
        heads = []
        for fi in fishes:
            ps = fi.pose(t)
            if ps is None or n >= 8:
                continue
            pos, vel, tau = ps
            m = np.array([1, -1, 1]) if mirror else np.ones(3)
            head = pos * m
            tail = (pos - vel / max(np.linalg.norm(vel), 1e-6) * fi.length) * m
            ph, dh = cam.project(np.array([head, tail]), w, h)
            if dh.min() < 0.5:
                continue
            d = ph[0] - ph[1]
            Lpx = np.linalg.norm(d)
            if Lpx < 2:
                continue
            f0[n] = (ph[0, 0], ph[0, 1], d[0] / Lpx, d[1] / Lpx)
            f1[n] = (Lpx, (1 - 2 * tau) * (-1 if mirror else 1), 0.6 if mirror else 1.0, 0)
            heads.append((ph[0] - d * 0.4, Lpx))
            n += 1
        if n == 0:
            return []
        self.gl.run(self.prog, fbo, {'u_res': (w, h), 'u_f0': f0, 'u_f1': f1, 'u_nf': n}, {}, blend='premul')
        return heads
