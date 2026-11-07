"""The Starsea Line: shot list, staging and timing. Global time T in seconds; 24 fps."""
import math

import numpy as np

from engine.camera import Camera
from engine.fx import Fish, Meteor
from engine.platform import LAMP_POS
from engine.steam import Steam
from engine.track import TRACK
from engine.train import DRV_R, Train

FPS = 24
LENGTH = 72.0
WARM = (1.0, 0.72, 0.40)
HEAD = (1.0, 0.84, 0.52)


def ramp(t, t0, t1, a=0.5, b=1.0):
    """0..1 progress of a move from t0 to t1: constant speed with short accel/decel ramps (seconds)."""
    D = t1 - t0
    a = min(a, D / 2); b = min(b, D / 2)
    v = 1.0 / (D - a / 2 - b / 2)
    x = np.clip(t - t0, 0, D)
    if x < a:
        return 0.5 * v / a * x * x
    if x < D - b:
        return 0.5 * v * a + v * (x - a)
    y = D - x
    return 1.0 - 0.5 * v / b * y * y


def expo(t, t0, t1, s0, s1):
    u = np.clip((t - t0) / (t1 - t0), 0, 1)
    return s0 * (s1 / s0) ** u


def q2(t, k=2):
    f = math.floor(t * FPS + 1e-6)
    return (f - f % k) / FPS


def lamp_light(intensity=1.0):
    return (LAMP_POS, intensity, WARM)


def cel_lamp():
    return (LAMP_POS, 7.0, WARM)


def zoom_cam(cam, k):
    """Track-in as a 2D scale of the frame (same position, narrower field)."""
    return cam.copy(vfov=2 * math.degrees(math.atan(math.tan(math.radians(cam.vfov) / 2) / k)))


def loco_frame_cam(s, local_pos, local_target, vfov, roll=0.0):
    """Camera rigidly locked to the locomotive (follow shots)."""
    p = Train.point(s, *local_pos)
    tg = Train.point(s, *local_target)
    c = Camera(pos=p, vfov=vfov, roll=roll).look_at(tg)
    return c


def _bank(s, side_off, up_off, R, seed, aspect=1.6, bright=1.0):
    p, tan, up, side = TRACK.at(s)
    return (p + side * side_off + np.array([0, up_off, 0]), R, seed, aspect, bright)


# luminous cloud banks along the climbing line, painted into the background plates
CLOUD_BANKS = [_bank(820, -170, -10, 55, 0.13), _bank(1150, 210, 40, 80, 0.57, 1.9), _bank(1650, -260, 120, 120, 0.31),
               _bank(2300, 300, -60, 160, 0.83, 2.2), _bank(3200, -380, 200, 220, 0.47), _bank(4300, 420, 80, 300, 0.71, 2.0)]


class Shot:
    name = ''
    banks = None
    t0 = 0.0
    t1 = 0.0
    plate_scale = 1.2

    def cams_for_plate(self):
        n = 9
        return [self.camera(self.t0 + (self.t1 - self.t0) * i / (n - 1)) for i in range(n)]

    def camera(self, T):
        raise NotImplementedError

    def state(self, T, frame):
        raise NotImplementedError


# ---------------------------------------------------------------- S1 establishing: slide down the sky
class S1(Shot):
    name, t0, t1 = 's1', 0.0, 8.0

    def camera(self, T):
        u = ramp(T, 1.0, 6.6, 0.6, 1.2)
        sy = 1.75 + (0.36 - 1.75) * u
        return Camera(pos=(-34, 3.0, 50), yaw=26, pitch=0, vfov=44, shift=(0.0, sy))

    def state(self, T, frame):
        fade = min(1.0, T / 1.6) ** 1.5
        return dict(platform=True, lights=[lamp_light()], cel_lights=[cel_lamp()], line_base=0.75, mist=0.55,
                    fade=fade, rail_vis=0.45)


# ---------------------------------------------------------------- S2 the platform: slow track-in
class S2(Shot):
    name, t0, t1 = 's2', 8.0, 13.5

    def camera(self, T):
        c = Camera(pos=(-9.2, 2.05, 7.6), vfov=40).look_at((1.2, 2.45, 2.9))
        return zoom_cam(c, expo(T, self.t0, self.t1, 1.0, 1.08))

    def state(self, T, frame):
        rings = [(-7.1, 4.6, 9.6, 0.25), (-3.0, 7.0, 11.3, 0.18)]
        return dict(platform=True, lights=[lamp_light()], cel_lights=[cel_lamp()], line_base=1.0, ref_dist=8.0,
                    mist=0.75, rings=rings, rail_vis=0.4)


# ---------------------------------------------------------------- S3 two lights on the horizon
class S3(Shot):
    name, t0, t1 = 's3', 13.5, 21.0
    S0, V = -760.0, 12.0

    def s(self, T):
        return self.S0 + self.V * (T - self.t0)

    def camera(self, T):
        c = Camera(pos=(-9.0, 2.05, 2.35), vfov=26).look_at((-700, 1.2, -14.0))
        return zoom_cam(c, expo(T, self.t0, self.t1, 1.0, 1.06))

    def state(self, T, frame):
        on = 0.0
        k = (T - 14.6) * FPS
        if k >= 0:
            # lamps come on with a stutter, then step up to steady
            flick = [1, 0, 1, 1, 0, 1]
            on = flick[int(k)] * 0.5 if k < 6 else 0.5 + 0.5 * min((k - 6) / 36.0, 1.0)
            on = round(on * 6) / 6 if k >= 6 else on
        s = self.s(q2(T, 3))
        lamps = Train.lamp_positions(s)
        glow = [(p + np.array([0, 0.0, 0]), 2.4, 0.9 * on, HEAD) for p in lamps]
        haze = [(lamps[0] * 0.5 + lamps[1] * 0.5 + np.array([0, 1.5, 0]), 26.0, 0.18 * on, (1.0, 0.78, 0.45))]
        reveal = -1e9 if T < 14.6 else self.S0 + (T - 14.6) * 180.0
        return dict(platform=True, lights=[lamp_light()] + [(p, 2.5 * on, HEAD) for p in lamps], cel_lights=[cel_lamp()],
                    line_base=0.9, ref_dist=10.0, mist=0.85, glow_dots=glow + haze, rail_vis=0.8, reveal_s=reveal,
                    train_s=s if on > 0 else None, train_v=self.V, head_on=max(on, 0.0), detail=False)


# ---------------------------------------------------------------- S4 the train emerges from the haze
class S4(Shot):
    name, t0, t1 = 's4', 21.0, 28.0
    S0, V = -330.0, 13.0

    def s(self, T):
        return self.S0 + self.V * (T - self.t0)

    def camera(self, T):
        u = ramp(T, self.t0 + 0.5, self.t1, 1.0, 0.5)
        return Camera(pos=(-246, 1.15, 9.0), yaw=-74 + 16 * u, pitch=4.0, vfov=36)

    def steam(self):
        return Steam(self.s, lambda t: ('work', 1.05))

    def state(self, T, frame):
        s = self.s(q2(T, 2))
        lamps = Train.lamp_positions(s)
        return dict(platform=False, lights=[(p, 1.4, HEAD) for p in lamps], cel_lights=[(p, 7.0, HEAD) for p in lamps],
                    line_base=1.0, ref_dist=35.0, mist=0.9, train_s=s, train_v=self.V, rail_vis=0.75,
                    glow_dots=[(p, 1.6, 0.8, HEAD) for p in lamps], steam=self.steam(), phi=0.6 - s / DRV_R, beams=1.0,
                    blur_wheels=True)


# ---------------------------------------------------------------- S5 passing the platform (coasting)
class S5(Shot):
    name, t0, t1 = 's5', 28.0, 34.0
    S0, V = -9.0, 5.4

    def s(self, T):
        return self.S0 + self.V * (T - self.t0)

    def camera(self, T):
        return Camera(pos=(9.5, 2.3, 14.0), vfov=40).look_at((-1.5, 2.3, 0.5))

    def steam(self):
        return Steam(self.s, lambda t: ('coast', 1.0))

    def state(self, T, frame):
        s = self.s(T)
        lamps = Train.lamp_positions(s)
        # warm light from the passing windows sweeps over the platform
        win = []
        from engine.train import LOCO_LEN, COACH_LEN
        for c in range(4):
            for k in (5.0, 10.0, 15.0):
                xb = LOCO_LEN + COACH_LEN * c + k
                p = TRACK.at(s - xb)[0] + np.array([0, 2.3, 1.6])
                if -9 < p[0] < 9:
                    win.append((p, 4.2, (1.0, 0.78, 0.46)))
        win = sorted(win, key=lambda w: abs(w[0][0] - 1.0))[:4]
        return dict(platform=True, lights=[lamp_light()] + [(p, 0.9, HEAD) for p in lamps],
                    cel_lights=[cel_lamp()] + win, line_base=1.05, ref_dist=15.0, mist=0.45, train_s=s, train_v=self.V,
                    rail_vis=0.75, steam=self.steam(), phi=0.6 - math.radians(26.0) * math.floor((T - self.t0) * FPS / 2))


# ---------------------------------------------------------------- S6 wheels close-up, following
class S6(Shot):
    name, t0, t1 = 's6', 34.0, 38.0
    S0 = 120.0

    def s(self, T):
        x = T - self.t0
        return self.S0 + 12.0 * x + 0.65 * x * x

    def camera(self, T):
        s = self.s(T)
        return loco_frame_cam(s, (6.6, 1.25, 5.2), (7.0, 1.05, 0.9), 42)

    def steam(self):
        return Steam(self.s, lambda t: ('work', 1.0), rel_speed=6.0)

    def state(self, T, frame):
        s = self.s(T)
        # wheels on 1s at ~26 deg per frame: spokes creep forward instead of strobing
        phi = 0.6 - math.radians(26.0) * (T - self.t0) * FPS
        lamps = Train.lamp_positions(s)
        return dict(platform=False, lights=[(p, 1.0, HEAD) for p in lamps], cel_lights=[], line_base=1.25,
                    ref_dist=6.0, mist=0.5, train_s=s, train_v=12.0, rail_vis=0.8, steam=self.steam(), phi=phi,
                    world_blur=6, cam_prev=self.camera(T - 0.5 / FPS))


# ---------------------------------------------------------------- S7 racing beneath the Milky Way
class S7(Shot):
    name, t0, t1 = 's7', 38.0, 45.0
    S0, V = 240.0, 22.0

    def s(self, T):
        return self.S0 + self.V * (T - self.t0)

    def camera(self, T):
        s = self.s(T)
        cx = self.S0 - 40 + self.V * 0.86 * (T - self.t0)
        return Camera(pos=(cx, 2.6, 58), yaw=8, pitch=0, vfov=50, shift=(0.0, 0.42))

    def steam(self):
        return Steam(self.s, lambda t: ('work', 1.15), sparkle=True)

    def state(self, T, frame):
        s = self.s(T)
        lamps = Train.lamp_positions(s)
        boost = 1.0 + 0.8 * np.clip((T - 39.0) / 5.0, 0, 1)
        meteors = [Meteor(39.2, 120, 46, 100, 30, 11), Meteor(41.0, 75, 58, 58, 41, 9, bright=0.8),
                   Meteor(44.2, 140, 40, 118, 24, 14, width=3.0, bright=1.1)]
        sx = lambda T0: self.s(T0) - 10.0
        fishes = [Fish(sx(40.4), 6.5, 40.4, 1.0, 6.0, 2.8, 1.0), Fish(sx(42.1) + 30, 9.0, 42.1, 1.0, 7.0, 3.4, 1.2),
                  Fish(sx(43.5) + 12, 5.0, 43.5, 1.0, 5.0, 2.4, 0.9)]
        rings = [r for f in fishes for r in f.rings()]
        kiras = []
        for f in fishes:
            for j in range(3):
                ps = f.pose(f.t0 + (6 + 5 * j) / FPS)
                if ps is not None:
                    kiras.append((ps[0] + np.array([0, 0.3, 0]), f.t0 + (8 + 5 * j) / FPS, 7.0 + 3 * j, (0.85, 1.0, 0.97), j, -1.0))
        phi = 0.6 - math.radians(66.0) / 2 * (T - self.t0) * FPS
        return dict(platform=False, lights=[(p, 1.0, HEAD) for p in lamps], cel_lights=[], line_base=0.85,
                    ref_dist=60.0, mist=0.35, train_s=s, train_v=self.V, rail_vis=0.7, steam=self.steam(), phi=phi,
                    blur_wheels=True, star_boost=boost, meteors=meteors, fishes=fishes, rings=rings, kiras=kiras,
                    world_blur=5, cam_prev=self.camera(T - 0.5 / FPS))


# ---------------------------------------------------------------- S8 the whistle
class S8(Shot):
    name, t0, t1 = 's8', 45.0, 49.0
    S0, V = 420.0, 24.0
    W0, W1 = 45.6, 48.2

    def s(self, T):
        return self.S0 + self.V * (T - self.t0)

    def camera(self, T):
        s = self.s(T)
        return loco_frame_cam(s, (7.0, 3.1, 3.6), (10.4, 5.2, 0.25), 46, roll=-4.0)

    def steam(self):
        return Steam(self.s, lambda t: ('work', 1.1), whistles=[(self.W0, self.W1)], rel_speed=7.0)

    def state(self, T, frame):
        s = self.s(T)
        kiras = [(Train.point(self.s(self.W0 + 0.4), 10.6, 4.6, 0.3) + np.array([0, 1.2, 0]), self.W0 + 0.35, 22.0,
                  (1.0, 0.97, 0.88), 0, 0.4)]
        phi = 0.6 - math.radians(66.0) / 2 * (T - self.t0) * FPS
        return dict(platform=False, lights=[], cel_lights=[], line_base=1.2, ref_dist=6.0, mist=0.0, train_s=s,
                    train_v=self.V, rail_vis=0.7, steam=self.steam(), phi=phi, blur_wheels=True, star_boost=1.6,
                    kiras=kiras)


# ---------------------------------------------------------------- S9 the rails rise ahead
class S9(Shot):
    banks = CLOUD_BANKS
    name, t0, t1 = 's9', 49.0, 54.0
    S0, V = 312.0, 26.0

    def s(self, T):
        return self.S0 + self.V * (T - self.t0)

    def camera(self, T):
        s = self.s(T)
        u = ramp(T, self.t0, self.t1, 0.8, 1.2)
        return Camera(pos=(352 + 30 * u, 3.0, 112), yaw=36 + 4 * u, pitch=0, vfov=50, shift=(0.0, 0.34 + 0.12 * u))

    def steam(self):
        return Steam(self.s, lambda t: ('work', 1.15), sparkle=True)

    def state(self, T, frame):
        s = self.s(T)
        lamps = Train.lamp_positions(s)
        phi = 0.6 - math.radians(66.0) / 2 * (T - self.t0) * FPS
        return dict(platform=False, lights=[(p, 1.2, HEAD) for p in lamps], cel_lights=[],
                    line_base=0.9, ref_dist=60.0, mist=0.3, train_s=s, train_v=self.V, rail_vis=1.0, steam=self.steam(),
                    phi=phi, blur_wheels=True, star_boost=1.6, world_blur=3, cam_prev=self.camera(T - 0.5 / FPS),
                    sky_clouds=False, sky_rails=True, sky_rail_vis=1.0)


# ---------------------------------------------------------------- S10 the ascent
class S10(Shot):
    banks = CLOUD_BANKS
    name, t0, t1 = 's10', 54.0, 62.0
    S0 = 470.0

    def s(self, T):
        x = T - self.t0
        return self.S0 + 30.0 * x + 1.4 * x * x

    def camera(self, T):
        u = ramp(T, self.t0 + 1.8, self.t1 - 0.3, 1.0, 1.5)
        return Camera(pos=(640, 8, 265), yaw=14, pitch=0, vfov=50, shift=(0.0, 0.40 + 0.42 * u))

    def steam(self):
        return Steam(self.s, lambda t: ('work', 1.75), sparkle=True, emit_every=2, lift=5.0, line_min_r=45.0)

    def state(self, T, frame):
        s = self.s(q2(T, 2))
        lamps = Train.lamp_positions(s)
        phi = 0.6 - math.radians(66.0) / 2 * (T - self.t0) * FPS
        kiras = []
        for j in range(10):
            tk = self.t0 + 1.2 + j * 0.62
            if tk < T + 0.5:
                sp = Train.point(self.s(tk), 14.0 + 30 * (j % 3), 4.2 + 1.5 * (j % 2))
                kiras.append((sp, tk, 8.0 + 4 * (j % 3), (1.0, 0.95, 0.82), j % 2, -1.0))
        return dict(platform=False, lights=[(p, 1.0, HEAD) for p in lamps], cel_lights=[], line_base=0.8,
                    ref_dist=500.0, mist=0.25, train_s=s, train_v=30.0, rail_vis=1.0, steam=self.steam(), phi=phi,
                    blur_wheels=True, star_boost=1.7, glow_dots=[(p, 1.4, 0.8, HEAD) for p in lamps], sky_clouds=False,
                    sky_rails=True, kiras=kiras, sky_rail_vis=1.0)


# ---------------------------------------------------------------- S11 into the river of stars
class S11(Shot):
    banks = CLOUD_BANKS
    name, t0, t1 = 's11', 62.0, 72.0
    S0 = 800.0
    VANISH = 66.6
    # behind and above the line's final straight, so the train rises along it into the band
    _Q, _D = TRACK.at(2000)[0], TRACK.at(2000)[1]
    _side = np.cross(_D, [0, 1, 0]) / np.linalg.norm(np.cross(_D, [0, 1, 0]))
    POS = _Q - _D * ((_Q[1] - 3.0) / _D[1]) + _side * 90.0 + np.array([0, 40.0, 0])

    def s(self, T):
        x = T - self.t0
        return self.S0 + 90.0 * x + 40.0 * x * x

    def camera(self, T):
        u = ramp(T, self.t0, self.t1 - 1.5, 0.8, 2.5)
        return Camera(pos=self.POS, yaw=16.0, pitch=0, vfov=50, shift=(0.0, 0.62 + 0.12 * u))

    def steam(self):
        return Steam(self.s, lambda t: ('work', 1.6) if t < self.VANISH else ('off', 0.0), life=96, sparkle=True)

    def state(self, T, frame):
        s = self.s(q2(T, 3))
        lamps = Train.lamp_positions(s)
        k = np.clip((T - self.VANISH) / 0.6, 0, 1)
        head = 1.0 - k
        fade = 1.0 - np.clip((T - 70.3) / 1.6, 0, 1)
        vp = Train.point(self.s(self.VANISH), 0.0, 2.5)
        kiras = [(vp, self.VANISH, 42.0, (1.0, 0.96, 0.86), 0, 0.4)]
        # the trail turns to star dust: sparkles left along the line after the train has gone
        for j in range(14):
            tk = self.VANISH + 0.2 + j * 0.22
            sp = Train.point(self.s(self.VANISH) - 30 - 45 * j, 0.0, 3.0 + 2.5 * math.sin(j * 1.7))
            kiras.append((sp, tk, 9.0 + 5 * (j % 3), (1.0, 0.95, 0.85), j % 2, -1.0))
        rail_glow = 1.0 + 0.6 * k
        return dict(platform=False, lights=[(p, 0.6 * head, HEAD) for p in lamps], cel_lights=[], line_base=0.6,
                    ref_dist=500.0, mist=0.2, train_s=s if T < self.VANISH + 0.25 else None, train_v=60.0,
                    rail_vis=1.0, steam=self.steam(), blur_wheels=True, star_boost=1.8, kiras=kiras, fade=fade,
                    glow_dots=[(p, 2.2, 1.3 * head, HEAD) for p in lamps], sky_clouds=False, sky_rails=True,
                    rail_glow=rail_glow, sky_rail_vis=1.0, rail_anchor=self.s(self.VANISH))


SHOTS = [S1(), S2(), S3(), S4(), S5(), S6(), S7(), S8(), S9(), S10(), S11()]


def shot_at(T):
    for sh in SHOTS:
        if sh.t0 <= T < sh.t1:
            return sh
    return SHOTS[-1]
