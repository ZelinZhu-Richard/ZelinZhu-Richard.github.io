"""Tiny procedural mesh kit (triangle soups with per-vertex normal and material id)."""
import math

import numpy as np


class Mesh:
    def __init__(self, pos=None, nrm=None, mat=None):
        self.pos = np.zeros((0, 3), np.float32) if pos is None else np.asarray(pos, np.float32)
        self.nrm = np.zeros((0, 3), np.float32) if nrm is None else np.asarray(nrm, np.float32)
        self.mat = np.zeros((0,), np.float32) if mat is None else np.asarray(mat, np.float32)

    def __add__(self, o):
        return Mesh(np.concatenate([self.pos, o.pos]), np.concatenate([self.nrm, o.nrm]),
                    np.concatenate([self.mat, o.mat]))

    def transformed(self, m):
        m = np.asarray(m, np.float64)
        p = self.pos @ m[:3, :3].T + m[:3, 3]
        nm = np.linalg.inv(m[:3, :3]).T
        n = self.nrm @ nm.T
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
        return Mesh(p, n, self.mat.copy())

    def material(self, mid):
        return Mesh(self.pos, self.nrm, np.full(len(self.pos), mid, np.float32))

    def interleaved(self):
        return np.concatenate([self.pos, self.nrm, self.mat[:, None]], 1).astype('f4')


def merge(meshes):
    out = Mesh()
    for m in meshes:
        out = out + m
    return out


# ---------------------------------------------------------------- transforms
def T(x=0, y=0, z=0):
    m = np.eye(4)
    m[:3, 3] = (x, y, z)
    return m


def S(x, y=None, z=None):
    m = np.eye(4)
    m[0, 0], m[1, 1], m[2, 2] = x, (x if y is None else y), (x if z is None else z)
    return m


def R(axis, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    m = np.eye(4)
    i, j = {'x': (1, 2), 'y': (2, 0), 'z': (0, 1)}[axis]
    m[i, i], m[i, j], m[j, i], m[j, j] = c, -s, s, c
    return m


def chain(*ms):
    out = np.eye(4)
    for m in ms:
        out = out @ m
    return out


# ---------------------------------------------------------------- primitives
def _tri_soup(verts, faces, normals):
    return Mesh(verts[faces].reshape(-1, 3), normals[faces].reshape(-1, 3), np.zeros(faces.size))


def lathe(profile, seg=32, mat=0, caps=True, smooth=True, arc=(0.0, 360.0)):
    """Surface of revolution around +y. profile: [(radius, y), ...] bottom to top."""
    prof = np.asarray(profile, np.float64)
    n = len(prof)
    a0, a1 = map(math.radians, arc)
    full = abs((a1 - a0) - 2 * math.pi) < 1e-6
    angs = np.linspace(a0, a1, seg + 1)
    # profile normals (2D) via averaged segment normals
    d = np.diff(prof, axis=0)
    segn = np.stack([d[:, 1], -d[:, 0]], 1)
    segn /= np.maximum(np.linalg.norm(segn, axis=1, keepdims=True), 1e-9)
    pn = np.zeros((n, 2))
    pn[:-1] += segn
    pn[1:] += segn
    pn /= np.maximum(np.linalg.norm(pn, axis=1, keepdims=True), 1e-9)
    tris_p, tris_n = [], []
    for i in range(n - 1):
        for k in range(seg):
            ca, sa = math.cos(angs[k]), math.sin(angs[k])
            cb, sb = math.cos(angs[k + 1]), math.sin(angs[k + 1])
            r0, y0 = prof[i]
            r1, y1 = prof[i + 1]
            p00 = (r0 * ca, y0, r0 * sa)
            p01 = (r0 * cb, y0, r0 * sb)
            p10 = (r1 * ca, y1, r1 * sa)
            p11 = (r1 * cb, y1, r1 * sb)
            if smooth:
                n0, n1 = pn[i], pn[i + 1]
            else:
                n0 = n1 = segn[i]
            n00 = (n0[0] * ca, n0[1], n0[0] * sa)
            n01 = (n0[0] * cb, n0[1], n0[0] * sb)
            n10 = (n1[0] * ca, n1[1], n1[0] * sa)
            n11 = (n1[0] * cb, n1[1], n1[0] * sb)
            tris_p += [p00, p10, p11, p00, p11, p01]
            tris_n += [n00, n10, n11, n00, n11, n01]
    m = Mesh(np.array(tris_p), np.array(tris_n), np.zeros(len(tris_p)))
    if caps and full:
        for idx, up in ((0, -1.0), (n - 1, 1.0)):
            r, y = prof[idx]
            if r < 1e-6:
                continue
            cp, cn = [], []
            for k in range(seg):
                ca, sa = math.cos(angs[k]), math.sin(angs[k])
                cb, sb = math.cos(angs[k + 1]), math.sin(angs[k + 1])
                cp += [(0, y, 0), (r * ca, y, r * sa), (r * cb, y, r * sb)]
                cn += [(0, up, 0)] * 3
            m = m + Mesh(np.array(cp), np.array(cn), np.zeros(len(cp)))
    return m.material(mat)


def cylinder(r, h, seg=24, mat=0, caps=True):
    """Along +y from 0 to h."""
    return _cyl(r, h, seg, mat, caps)


def _cyl(r, h, seg, mat, caps):
    angs = np.linspace(0, 2 * math.pi, seg + 1)
    P, N = [], []
    for k in range(seg):
        ca, sa, cb, sb = math.cos(angs[k]), math.sin(angs[k]), math.cos(angs[k + 1]), math.sin(angs[k + 1])
        a0, a1, b0, b1 = (r * ca, 0, r * sa), (r * ca, h, r * sa), (r * cb, 0, r * sb), (r * cb, h, r * sb)
        na, nb = (ca, 0, sa), (cb, 0, sb)
        P += [a0, a1, b1, a0, b1, b0]
        N += [na, na, nb, na, nb, nb]
        if caps:
            P += [(0, h, 0), b1, a1, (0, 0, 0), a0, b0]
            N += [(0, 1, 0)] * 3 + [(0, -1, 0)] * 3
    return Mesh(np.array(P), np.array(N), np.full(len(P), mat))


def box(sx, sy, sz, mat=0, center=(0, 0, 0)):
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    c = np.array(center)
    faces = [
        ((1, 0, 0), [(hx, -hy, -hz), (hx, hy, -hz), (hx, hy, hz), (hx, -hy, hz)]),
        ((-1, 0, 0), [(-hx, -hy, hz), (-hx, hy, hz), (-hx, hy, -hz), (-hx, -hy, -hz)]),
        ((0, 1, 0), [(-hx, hy, -hz), (-hx, hy, hz), (hx, hy, hz), (hx, hy, -hz)]),
        ((0, -1, 0), [(-hx, -hy, hz), (-hx, -hy, -hz), (hx, -hy, -hz), (hx, -hy, hz)]),
        ((0, 0, 1), [(hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz), (-hx, -hy, hz)]),
        ((0, 0, -1), [(-hx, -hy, -hz), (-hx, hy, -hz), (hx, hy, -hz), (hx, -hy, -hz)]),
    ]
    P, N = [], []
    for n, q in faces:
        P += [q[0], q[1], q[2], q[0], q[2], q[3]]
        N += [n] * 6
    return Mesh(np.array(P) + c, np.array(N), np.full(len(P), mat))


def cyl_between(a, b, r, seg=12, mat=0, caps=True):
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a
    h = np.linalg.norm(d)
    m = _cyl(r, h, seg, mat, caps)
    y = d / h
    x = np.cross(y, [0, 0, 1]) if abs(y[2]) < 0.9 else np.cross(y, [1, 0, 0])
    x /= np.linalg.norm(x)
    z = np.cross(x, y)
    M = np.eye(4)
    M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = x, y, z, a
    return m.transformed(M)


def tube(points, r, seg=10, mat=0):
    pts = [np.asarray(p, float) for p in points]
    out = Mesh()
    for a, b in zip(pts[:-1], pts[1:]):
        out = out + cyl_between(a, b, r, seg, mat, caps=False)
    for p in pts:
        out = out + sphere(r, 8, 6, mat).transformed(T(*p))
    return out


def sphere(r, seg=16, rings=10, mat=0):
    prof = [(r * math.sin(t), -r * math.cos(t)) for t in np.linspace(0, math.pi, rings + 1)]
    return lathe(prof, seg, mat, caps=False)


def torus(R_, r, seg=40, sides=10, mat=0):
    """Ring in the xz plane (axis +y)."""
    prof = [(R_ + r * math.cos(t), r * math.sin(t)) for t in np.linspace(-math.pi, math.pi, sides + 1)]
    return lathe(prof, seg, mat, caps=False)


def prism(poly, depth, mat=0, side_mat=None):
    """Extrude a convex-ish 2D polygon (x,y) along +z from -depth/2..depth/2 (fan triangulated)."""
    poly = np.asarray(poly, float)
    hz = depth / 2
    P, N, M = [], [], []
    c = poly.mean(0)
    sm = mat if side_mat is None else side_mat
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        P += [(c[0], c[1], hz), (a[0], a[1], hz), (b[0], b[1], hz)]
        N += [(0, 0, 1)] * 3
        P += [(c[0], c[1], -hz), (b[0], b[1], -hz), (a[0], a[1], -hz)]
        N += [(0, 0, -1)] * 3
        e = b - a
        n = np.array([e[1], -e[0], 0.0])
        n /= max(np.linalg.norm(n), 1e-9)
        P += [(a[0], a[1], -hz), (b[0], b[1], -hz), (b[0], b[1], hz), (a[0], a[1], -hz), (b[0], b[1], hz), (a[0], a[1], hz)]
        N += [tuple(n)] * 6
        M += [mat] * 6 + [sm] * 6
    return Mesh(np.array(P), np.array(N), np.array(M, float))
