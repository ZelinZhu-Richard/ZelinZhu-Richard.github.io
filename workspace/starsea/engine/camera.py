"""Pinhole camera shared by shaders (ray generation) and the mesh rasterizer."""
import math

import numpy as np


def normalize(v):
    v = np.asarray(v, dtype=np.float64)
    return v / np.linalg.norm(v)


class Camera:
    """yaw/pitch/roll in degrees. yaw=0 looks down -z (screen right = +x); pitch>0 looks up."""

    def __init__(self, pos=(0, 2, 10), yaw=0.0, pitch=0.0, roll=0.0, vfov=40.0, aspect=1920 / 1040,
                 shift=(0.0, 0.0), look_at=None):
        self.pos = np.asarray(pos, dtype=np.float64)
        self.yaw, self.pitch, self.roll = yaw, pitch, roll
        self.vfov, self.aspect = vfov, aspect
        self.shift = shift
        if look_at is not None:
            self.look_at(look_at)

    def look_at(self, target):
        d = normalize(np.asarray(target, dtype=np.float64) - self.pos)
        self.pitch = math.degrees(math.asin(np.clip(d[1], -1, 1)))
        self.yaw = math.degrees(math.atan2(d[0], -d[2]))
        return self

    def basis(self):
        y, p, r = map(math.radians, (self.yaw, self.pitch, self.roll))
        f = np.array([math.cos(p) * math.sin(y), math.sin(p), -math.cos(p) * math.cos(y)])
        right = normalize(np.cross(f, [0, 1, 0]))
        up = np.cross(right, f)
        cr, sr = math.cos(r), math.sin(r)
        right, up = right * cr + up * sr, -right * sr + up * cr
        return right, up, f

    def rot(self):
        """3x3 with columns right, up, forward (column-major for GLSL mat3)."""
        r, u, f = self.basis()
        return np.stack([r, u, f], axis=1)

    @property
    def tanh(self):
        return math.tan(math.radians(self.vfov) / 2)

    def uniforms(self):
        m = self.rot()
        return {'u_camRot': m.T.astype('f4').copy(),  # column-major upload
                'u_camPos': tuple(self.pos), 'u_tanH': self.tanh, 'u_aspect': self.aspect,
                'u_shift': tuple(self.shift)}

    def view(self):
        r, u, f = self.basis()
        m = np.eye(4)
        m[0, :3], m[1, :3], m[2, :3] = r, u, -f
        m[:3, 3] = -m[:3, :3] @ self.pos
        return m

    def proj(self, near=0.1, far=20000.0):
        t = self.tanh
        m = np.zeros((4, 4))
        m[0, 0] = 1 / (t * self.aspect)
        m[1, 1] = 1 / t
        m[0, 2] = self.shift[0]
        m[1, 2] = self.shift[1]
        m[2, 2] = -(far + near) / (far - near)
        m[2, 3] = -2 * far * near / (far - near)
        m[3, 2] = -1
        return m

    def viewproj(self, near=0.1, far=20000.0):
        return self.proj(near, far) @ self.view()

    def project(self, pts, w=1920, h=1040):
        """World points (N,3) -> pixel coords (N,2) bottom-left origin, plus view depth."""
        pts = np.atleast_2d(pts)
        hom = np.c_[pts, np.ones(len(pts))] @ self.viewproj().T
        ndc = hom[:, :2] / hom[:, 3:4]
        return np.c_[(ndc[:, 0] * .5 + .5) * w, (ndc[:, 1] * .5 + .5) * h], hom[:, 3]

    def mirrored(self):
        """Camera reflected through the sea plane y=0 (for planar reflections)."""
        c = Camera(pos=(self.pos[0], -self.pos[1], self.pos[2]), yaw=self.yaw, pitch=-self.pitch,
                   roll=-self.roll, vfov=self.vfov, aspect=self.aspect, shift=self.shift)
        return c

    def copy(self, **kw):
        c = Camera(self.pos.copy(), self.yaw, self.pitch, self.roll, self.vfov, self.aspect, self.shift)
        for k, v in kw.items():
            setattr(c, k, np.asarray(v, dtype=np.float64) if k == 'pos' else v)
        return c
