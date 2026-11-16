"""The line across the sea: straight from the far -x horizon, past the platform, then curving up and
to the left into the sky toward the galactic core. Parametrised by arc length s (s=0 at the platform)."""
import math

import numpy as np

RAIL_TOP = 0.42          # rail top height above the water
CLIMB_START = 470.0      # s where the rails begin to lift
CLIMB_LEN = 300.0
MAX_PITCH = 28.0         # degrees
MAX_TURN = 74.0          # degrees, left (toward -z): the line ends up heading into the bright band
TURN_LEN = 900.0
DS = 0.5
S_MIN, S_MAX = -4200.0, 6000.0


def _ease(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def heading(s):
    s = np.asarray(s, float)
    t = (s - CLIMB_START) / CLIMB_LEN
    pitch = MAX_PITCH * _ease(t)
    turn = MAX_TURN * _ease((s - CLIMB_START - 60.0) / TURN_LEN)
    return np.radians(pitch), np.radians(turn)


class Track:
    def __init__(self):
        s = np.arange(S_MIN, S_MAX + DS, DS)
        p, y = heading(s)
        t = np.stack([np.cos(p) * np.cos(y), np.sin(p), -np.cos(p) * np.sin(y)], 1)
        pos = np.cumsum(t, 0) * DS
        i0 = int(round((0 - S_MIN) / DS))
        pos -= pos[i0]
        pos[:, 1] += RAIL_TOP
        self.s, self.pos, self.tan = s, pos, t

    def at(self, s):
        """position, tangent, up, side(right) for scalar or array s."""
        s = np.asarray(s, float)
        f = np.clip((s - S_MIN) / DS, 0, len(self.s) - 1.001)
        i = f.astype(int)
        w = (f - i)[..., None]
        pos = self.pos[i] * (1 - w) + self.pos[i + 1] * w
        tan = self.tan[i] * (1 - w) + self.tan[i + 1] * w
        tan /= np.linalg.norm(tan, axis=-1, keepdims=True)
        side = np.cross(tan, [0, 1, 0])
        side /= np.linalg.norm(side, axis=-1, keepdims=True)
        up = np.cross(side, tan)
        return pos, tan, up, side

    def polyline(self, s0, s1, step):
        ss = np.arange(s0, s1 + step, step)
        return self.at(ss)[0]


TRACK = Track()


def vehicle_matrix(s_front, xb_f, xb_r):
    """Model matrix for a vehicle whose front buffer is at track distance s_front and whose two
    support points sit xb_f and xb_r behind it. Local frame: X forward, Y up, Z right."""
    pf, _, upf, _ = TRACK.at(s_front - xb_f)
    pr, _, upr, _ = TRACK.at(s_front - xb_r)
    fwd = pf - pr
    fwd /= np.linalg.norm(fwd)
    up = upf + upr
    side = np.cross(fwd, up)
    side /= np.linalg.norm(side)
    up = np.cross(side, fwd)
    o = pf + fwd * xb_f
    m = np.eye(4)
    m[:3, 0], m[:3, 1], m[:3, 2], m[:3, 3] = fwd, up, side, o
    return m
