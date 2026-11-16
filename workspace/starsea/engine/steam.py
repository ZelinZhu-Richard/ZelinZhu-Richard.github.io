"""Exhaust steam as timed effect drawings. Fully deterministic: the puffs alive at time t are rebuilt from
the train's motion s(t), so any frame can be rendered on its own."""
import math

import numpy as np

from .materials import hx
from .train import DRV_R, Train

FPS = 24.0
BEAT = math.pi / 2 * DRV_R      # metres travelled per exhaust beat (4 per driver revolution)
CHIMNEY_R = 0.28


def _phase_step(age):
    """Frames per drawing by phase: eject/billow on 2s, drift/breakup on 3s, dissipation on 4s."""
    if age < 16:
        return 2
    if age < 58:
        return 3
    return 4


def _quant(age):
    q = _phase_step(age)
    return age - (age % q)


def _size(a):
    s = 1.7 + 1.1 * min(a / 6.0, 1.0) + 1.4 * np.clip((a - 6) / 14.0, 0, 1) + 0.7 * np.clip((a - 20) / 22.0, 0, 1)
    # the trail tapers: older puffs shrink as they thin and break apart
    return s * (1.0 - 0.55 * np.clip((a - 36) / 46.0, 0, 1))


def _whistle(a):
    """Whistle jet at age a (frames): rise, drift back (m) and radius. It leaves with the engine's own speed,
    then air drag lets it fall behind; a narrow jet at the mouth that blooms as it slows."""
    rise = 5.2 * (1 - math.exp(-a / 7.0)) + 0.07 * a + 0.12
    return rise, -0.045 * a ** 1.5, 0.24 + 0.075 * a


class Steam:
    """s_of_t: callable t -> loco front track distance. mode_of_t: t -> ('work'|'coast'|'off', strength)."""

    def __init__(self, s_of_t, mode_of_t, whistles=(), life=82, seed=1, rel_speed=None, sparkle=False, emit_every=None,
                 lift=0.0, line_min_r=0.0):
        self.s_of_t, self.mode_of_t = s_of_t, mode_of_t
        self.lift = lift              # extra rise (m) the exhaust gains as it ages, so a far plume clears the train
        self.line_min_r = line_min_r  # puffs smaller than this (px) carry no interior lines
        # a fixed cadence (frames per exhaust beat) for an accelerating engine far down the line, where the
        # beat-by-distance rule (whose beat length grows with speed) would all but stop emitting
        self.emit_every = emit_every
        self.rel_speed = rel_speed    # follow shots: plume streams back at this speed relative to the engine
        self.sparkle = sparkle
        self.whistles = whistles      # list of (t0, t1)
        self.life = life
        self.seed = seed

    def emissions(self, t):
        """All puffs (birth time, kind, strength, index) still alive at t."""
        out = []
        f_now = int(round(t * FPS))
        f0 = f_now - self.life - 2
        prev_b = None
        prev_w = None
        for f in range(f0, f_now + 1):
            tf = f / FPS
            mode, strength = self.mode_of_t(tf)
            s = self.s_of_t(tf)
            if mode == 'work' and self.rel_speed is not None:
                if f % 6 == 0:
                    out.append((tf, 0, strength, f))
            elif mode == 'work' and self.emit_every:
                if f % self.emit_every == 0:
                    out.append((tf, 0, strength, f))
            elif mode == 'work':
                v = abs(self.s_of_t(tf + 0.05) - self.s_of_t(tf - 0.05)) / 0.1
                per = max(BEAT, v * 2.0 / FPS)
                b = math.floor(s / per)
                if prev_b is not None and b != prev_b:
                    out.append((tf, 0, strength, f))
                prev_b = b
            elif mode == 'coast':
                if f % 4 == 0:
                    out.append((tf, 1, strength, f))
                prev_b = None
            for (w0, w1) in self.whistles:
                if w0 <= tf <= w1:
                    out.append((tf, 2, 1.0, f))
        return out

    def sparkles(self, t, per_window=2, window=13):
        """Kira glints that ride on the steam: a few at a time, each born on a puff's lit upper edge."""
        out = []
        if not self.sparkle:
            return out
        f = int(round(t * FPS))
        for wk in (f // window - 1, f // window):
            t0w = wk * window / FPS
            em = [e for e in self.emissions(t0w) if e[1] == 0]
            if not em:
                continue
            rng = np.random.default_rng(wk * 31 + self.seed)
            for j in range(per_window):
                te, kind, strength, fi = em[rng.integers(len(em))]
                age = (t0w - te) * FPS
                if age < 6 or age > 60:
                    continue
                s_e = self.s_of_t(te)
                base = Train.point(s_e, 1.80, 4.45)
                rise = 2.4 * strength * (1 - math.exp(-age / 9.0))
                R = CHIMNEY_R * _size(age) * 1.5 * strength
                pos = base + np.array([rng.uniform(-0.6, 0.6) * R, rise + R * rng.uniform(0.4, 0.9), rng.uniform(-0.3, 0.3) * R])
                out.append((pos, t0w + rng.integers(0, window) / FPS, rng.uniform(4.0, 8.0), (1.0, 0.97, 0.88),
                            int(rng.integers(0, 2)), -1.0))
        return out

    def puffs(self, t, cam, w, h, mirror=False, max_n=96):
        focal = h / (2 * cam.tanh)
        rows = []
        for (te, kind, strength, f) in self.emissions(t):
            age = (t - te) * FPS
            life = self.life if kind != 2 else 40
            if age < 0 or age > life:
                continue
            aq = _quant(age)
            ten = te
            s_e = self.s_of_t(ten)
            v_e = (self.s_of_t(ten + 0.05) - self.s_of_t(ten - 0.05)) / 0.1
            rng = np.random.default_rng(f * 7919 + self.seed * 13 + kind)
            if kind == 2:
                # the whistle column stays attached to the engine while it sounds and bends back
                s_now = self.s_of_t(t)
                base = Train.point(s_now, 10.60, 4.10, 0.30)
            elif self.rel_speed is not None:
                s_now = self.s_of_t(t)
                base = Train.point(s_now - self.rel_speed * aq / FPS, 1.80, 4.45)
                v_e = 0.0
            else:
                base = Train.point(s_e, 1.80, 4.45)
            tan = Train.point(s_e + 1.0, 1.80, 4.45) - Train.point(s_e, 1.80, 4.45)
            tan /= max(np.linalg.norm(tan), 1e-6)
            # every exhaust beat is a little different: size, how hard it shoots up, where it settles
            vs, vr, vy = rng.uniform(0.6, 1.45), rng.uniform(0.7, 1.3), rng.normal(0, 1)
            if kind == 0:
                H = 2.8 * strength * vr
                rise = H * (1 - math.exp(-aq / 9.0)) + 0.016 * vr * max(aq - 16, 0)
                drift = v_e * 0.3 * (8.0 / FPS) * (1 - math.exp(-aq / 8.0))
                size = _size(aq) * strength * vs * (1.0 + 0.035 * max(abs(v_e) - 10.0, 0.0))
                R = CHIMNEY_R * size * 1.5
                rise += vy * 0.4 * R * min(aq / 20.0, 1.0)
                rise += self.lift * float(np.clip((aq - 6.0) / 40.0, 0, 1)) ** 0.8
            elif kind == 1:
                rise = 1.1 * (1 - math.exp(-aq / 12.0)) + 0.012 * aq
                drift = v_e * 0.25 * (8.0 / FPS) * (1 - math.exp(-aq / 8.0))
                R = CHIMNEY_R * (1.0 + 2.6 * min(aq / 36.0, 1.0)) * strength
            else:
                rise, drift, R = _whistle(aq)
            lat = rng.normal(0, 0.25) * min(aq / 30.0, 1.0)
            side = np.cross(tan, [0, 1, 0])
            pos = base + tan * drift + np.array([0, rise, 0]) + side * lat
            if mirror:
                pos = pos * np.array([1, -1, 1])
            px, depth = cam.project(pos[None], w, h)
            if depth[0] < 0.5:
                continue
            Rpx = R * focal / depth[0]
            depth = [float(np.linalg.norm(pos - cam.pos))]
            if Rpx < 0.6:
                continue
            alpha = 1.0
            warm = 0.7 * math.exp(-aq / 26.0) if kind != 2 else 0.2
            drawing = math.floor(age / _phase_step(age))
            # old steam moves to the thin (see-through) level; each puff makes the change on its own drawing
            thin_at = {0: 40.0, 1: 30.0, 2: 24.0}[kind] + 18.0 * rng.random()
            level = 2.0 if aq >= thin_at + 16.0 else (1.0 if aq >= thin_at else 0.0)
            stretch = 1.0 + (0.55 * float(np.clip((aq - 34) / 40.0, 0, 1)) if kind == 0 else 0.0)
            seed = rng.random()
            rows.append((px[0, 0], px[0, 1], Rpx, depth[0], aq, seed, warm, alpha, drawing, kind, level, stretch))
            if kind == 2 and aq < 10:
                # the jet moves fast near the mouth: in-betweens on the same drawing keep it one column
                for k, back in enumerate((0.5, 1.0, 1.5)):
                    a2 = aq - back
                    if a2 < 0:
                        continue
                    r2, d2, R2 = _whistle(a2)
                    p2 = base + tan * d2 + np.array([0, r2, 0])
                    if mirror:
                        p2 = p2 * np.array([1, -1, 1])
                    q, dq = cam.project(p2[None], w, h)
                    if dq[0] < 0.5:
                        continue
                    rows.append((q[0, 0], q[0, 1], R2 * focal / dq[0], float(np.linalg.norm(p2 - cam.pos)), aq,
                                 (seed + 0.31 * (k + 1)) % 1.0, warm, alpha, drawing, kind, level, 1.0))
        # the column standing on the chimney mouth while the engine works, so the plume never floats free
        mode, strength = self.mode_of_t(t)
        if mode == 'work':
            fr = int(round(t * FPS))
            pos = Train.point(self.s_of_t(t), 1.80, 4.45 + 0.32 * strength)
            if mirror:
                pos = pos * np.array([1, -1, 1])
            px, depth = cam.project(pos[None], w, h)
            if depth[0] > 0.5:
                Rpx = CHIMNEY_R * 1.45 * strength * focal / depth[0]
                dist = float(np.linalg.norm(pos - cam.pos))
                if Rpx >= 0.6:
                    rows.append((px[0, 0], px[0, 1], Rpx, dist, 2.0, 0.37 + 0.11 * ((fr // 2) % 5), 0.7, 1.0,
                                 float(fr // 2), 0, 0.0, 1.0))
        rows.sort(key=lambda r: -r[3])
        rows = rows[-max_n:] if len(rows) > max_n else rows
        return np.array(rows, dtype='f4').reshape(-1, 12)


STEAM_COLORS = dict(base=hx('#8494b8'), shade=hx('#4f5d88'), line=hx('#384470'), hi=hx('#c4d0ea'),
                    warm=hx('#ffb45e'))


class SteamPainter:
    """Two passes: the plume field (union distance of all puffs), then the cel paint of that field."""

    MARGIN = 320    # the field covers this much beyond each frame edge, so offset samples stay valid

    def __init__(self, gl, w=None, h=None):
        self.gl = gl
        self.field = gl.program('steam_field.frag')
        self.prog = gl.program('steam.frag')
        self.size = None

    def _targets(self, w, h):
        if self.size != (w, h):
            fw, fh = w + 2 * self.MARGIN, h + 2 * self.MARGIN
            self.t0 = self.gl.tex(fw, fh, 4, 'f2')
            self.t1 = self.gl.tex(fw, fh, 4, 'f2')
            self.t2 = self.gl.tex(fw, fh, 4, 'f2')
            self.fb = self.gl.fbo(self.t0, self.t1, self.t2)
            self.size = (w, h)

    def draw(self, fbo, rows, w, h, depth_tex=None, mirror=False, colors=None, line_w=1.5, hi=0.35, line_on=1.0,
             thin_alpha=0.5, gain=1.0, line_min_r=0.0):
        if len(rows) == 0:
            return
        self._targets(w, h)
        c = colors or STEAM_COLORS
        n = min(len(rows), 96)
        pc = np.zeros((96, 4), 'f4'); pa = np.zeros((96, 4), 'f4'); pb = np.zeros((96, 4), 'f4')
        pc[:n] = rows[:n, [0, 1, 2, 3]]
        pa[:n] = rows[:n, [4, 5, 6, 7]]
        pb[:n] = rows[:n, [8, 9, 10, 11]]
        self.gl.run(self.field, self.fb, {'u_res': (w, h), 'u_pc': pc, 'u_pa': pa, 'u_pb': pb, 'u_np': n,
                                          'u_lineW': line_w, 'u_light': (-0.45, 0.89), 'u_margin': float(self.MARGIN),
                                          'u_mirror': 1.0 if mirror else 0.0}, {})
        u = {'u_res': (w, h), 'u_margin': float(self.MARGIN), 'u_useDepth': 1.0 if depth_tex else 0.0,
             'u_light': (-0.45, 0.89), 'u_base': c['base'], 'u_shade': c['shade'], 'u_line': c['line'], 'u_hi': c['hi'],
             'u_warm': c['warm'], 'u_lineW': line_w, 'u_mirror': 1.0 if mirror else 0.0, 'u_hiAmt': hi,
             'u_lineOn': line_on, 'u_thinAlpha': thin_alpha, 'u_gain': gain, 'u_lineMinR': line_min_r}
        tex = {'t_f0': self.t0, 't_f1': self.t1, 't_f2': self.t2}
        if depth_tex:
            tex['t_depth'] = depth_tex
        self.gl.run(self.prog, fbo, u, tex, blend='premul')


CLOUD_COLORS = dict(base=hx('#8e9ad0'), shade=hx('#5a63a2'), line=hx('#5a63a0'), hi=hx('#c8d2f4'), warm=hx('#ffcf8a'))


class SkyClouds:
    """Luminous cumulus banks along the climbing line, drawn with the steam cel painter (held drawings)."""

    def __init__(self, seed=4):
        from .track import TRACK
        rng = np.random.default_rng(seed)
        self.items = []
        for k, s in enumerate([760, 1050, 1500, 2200, 3100]):
            p, tan, up, side = TRACK.at(s)
            off = side * (1 if k % 2 else -1) * rng.uniform(90, 200) + up * [-30, -110, 40, -160, 90][k] + tan * rng.uniform(-60, 60)
            c = p + off
            R = rng.uniform(45, 80) * (1 + s / 3000)
            for j in range(rng.integers(1, 3)):
                q = c + side * rng.normal(0, R * 1.1) + np.array([0, -abs(rng.normal(0, R * 0.25)), 0]) + tan * rng.normal(0, R * 0.8)
                self.items.append((q, R * rng.uniform(0.55, 1.0), rng.random(), k * 10 + j))

    def rows(self, t, cam, w, h, mirror=False):
        focal = h / (2 * cam.tanh)
        rows = []
        drift = np.array([0.4, 0.0, 0.0]) * t
        for (q, R, sd, idx) in self.items:
            pos = q + drift
            if mirror:
                pos = pos * np.array([1, -1, 1])
            px, depth = cam.project(pos[None], w, h)
            if depth[0] < 1.0:
                continue
            Rpx = R * focal / depth[0]
            if Rpx < 2 or px[0, 0] < -Rpx * 2 or px[0, 0] > w + Rpx * 2 or px[0, 1] < -Rpx * 2 or px[0, 1] > h + Rpx * 2:
                continue
            dist = float(np.linalg.norm(pos - cam.pos))
            if dist < 260.0:
                continue
            rows.append((px[0, 0], px[0, 1], Rpx, dist, 12.0, sd, 0.0, 1.0, float(idx % 7), 3.0, 0.0, 1.7 + 0.8 * sd))
        rows.sort(key=lambda r: -r[3])
        return np.array(rows, dtype='f4').reshape(-1, 12)
