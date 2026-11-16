"""01-mushroom-hollow: a rain-wet lane through a forest village of giant mushroom houses.

Run (from workspace/pov-films):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
    -P films/01-mushroom-hollow/build.py -- --stills 1.0,4.0,7.0,9.5 --scale 0.5

Env MH_PLAN=1 prints where the landmarks sit in frame over time (no render needed);
MH_PLAN_ONLY=1 does that with only the camera path built (seconds); MH_STATS=1 prints mesh
vertex/loop counts per object group (to keep scene.glb under 60 MB). Render experiments:
MH_NOCONTRAST=1 skips the appended compositor contrast; MH_DBG=rtoff,fastgi0,noshadow,nocomp,
noglass,thick=<f>,trace=<f> toggles EEVEE / compositor settings (comma separated);
MH_PROBE=t,x0,y0,x1,y1 lists the meshes with vertices inside that frame region (fractions, y from
the top) at time t, without rendering.
"""
import os
import sys
import math
import random
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'kit'))
import povkit as pk  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector, Matrix, Quaternion  # noqa: E402

SLUG = '01-mushroom-hollow'
TAU = 2 * math.pi

# ----------------------------------------------------------------------------- palette
AMBER = (1.0, 0.52, 0.16)
WARM = (1.0, 0.6, 0.26)
ROSE = (1.0, 0.36, 0.55)
CYAN = (0.25, 0.8, 1.0)
TEAL = (0.08, 1.0, 0.78)
FUNGI_CYAN = (0.15, 0.85, 1.0)
VIOLET = (0.55, 0.3, 1.0)
MAGENTA = (1.0, 0.16, 0.62)
COBALT = (0.16, 0.36, 1.0)
LIME = (0.75, 1.0, 0.35)

CAP_COLORS = [(0.6, 0.08, 0.42), (0.2, 0.14, 0.8), (0.04, 0.45, 0.6), (0.75, 0.1, 0.08),
              (0.85, 0.25, 0.45), (0.42, 0.1, 0.75), (0.08, 0.3, 0.85), (0.85, 0.42, 0.06)]
STALK_COLORS = [(0.7, 0.66, 0.6), (0.58, 0.6, 0.75), (0.74, 0.62, 0.56), (0.6, 0.68, 0.74)]
WASHES = [COBALT, (0.08, 0.8, 0.72), (0.2, 0.55, 1.0), VIOLET, (0.1, 0.75, 1.0), MAGENTA, (0.15, 0.4, 1.0)]

# ----------------------------------------------------------------------------- layout
# an S: right bend (heading to about +11 deg at 4 s), then a longer left bend that is
# visible ahead from 6 s and leads the eye to the Elder Bloom at the vanishing point
PATH_PTS = [(0, 0), (0, 6), (1.0, 16), (3.0, 26), (4.8, 36), (5.6, 46), (5.2, 56), (3.6, 66),
            (1.4, 76), (-1.0, 86), (-3.4, 98), (-5.6, 112), (-7.6, 130), (-9.5, 155),
            (-11.3, 190), (-13.5, 240), (-16, 330)]
SPEED = 4.9
ROAD_W = 5.6
INN_S, INN_LAT = 55.0, 13.2
TOWER_S, TOWER_LAT = 62.0, -9.0
GIANT_S, GIANT_LAT = 198.0, 13.0     # the Elder Bloom, the hero landmark at the vanishing point

# sky plate (ESO/P. Horalek potw1938a), crop above the person + starless fill to the horizon
PLATE_SRC = os.path.join(pk.ASSETS, 'sky', 'eso-potw1938a', 'potw1938a_10k.tif')
PLATE_CUT = 6750          # rows kept from the 10000-row plate (person's head is at row 6840)
PLATE_HORIZON = 7540      # true horizon row of the plate
PLATE_ROWS = 7940         # rows in the prepared image (fill continues 400 rows below the horizon)
PLATE_F = 6000.0          # gnomonic focal length in plate pixels (3.75 plate px per output px)
PLATE_W = 8484
PLATE_CORE_PX = (3478, 4800)   # galactic bulge in the plate (x, row)


def plate_dir(px, py):
    """World (az, el) in degrees of plate pixel (px, row py) as projected by build_sky()."""
    cel = math.degrees(math.atan((PLATE_HORIZON - PLATE_ROWS / 2) / PLATE_F)) + 0.6
    f, r, u = pk.sky.rect_frame(PLATE_AZ, cel, 0.0)
    d = (f + r * ((px - PLATE_W / 2) / PLATE_F) + u * ((PLATE_ROWS / 2 - py) / PLATE_F)).normalized()
    return math.degrees(math.atan2(d.x, d.y)), math.degrees(math.asin(d.z))


# ============================================================================ helpers
def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def hnoise(x, y, seed=0):
    """Cheap deterministic smooth noise (sum of sines)."""
    return (math.sin(x * 0.071 + seed) * math.cos(y * 0.053 + 1.3 * seed) * 0.5 +
            math.sin(x * 0.19 + y * 0.13 + 2.1 * seed) * 0.3 +
            math.sin(x * 0.47 - y * 0.41 + 0.7 * seed) * 0.2)


def ground_h(s, lat):
    """Terrain height in path coordinates: flat village floor, slopes rising to both sides,
    and the far end of the hollow closing in."""
    a = abs(lat)
    h = 0.0
    if a > 6.5:
        h = 16.0 * smooth(6.5, 85.0, a) ** 1.15
        h += 1.4 * smooth(10.0, 30.0, a) * hnoise(s, lat, 3)
        h += 3.0 * smooth(40.0, 90.0, a) * hnoise(s * 0.5, lat * 0.5, 7)
    h += 14.0 * smooth(215.0, 320.0, s) * smooth(5.0, 30.0, a + 12.0)
    return h


class BM:
    """Accumulates many parts into one bmesh (one object, several materials)."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uvl = self.bm.loops.layers.uv.new('UVMap')
        self.rl = self.bm.faces.layers.float.new('pk_rand')

    def _tag(self, faces, mi, rnd):
        for f in faces:
            if f.is_valid:
                f.material_index = mi
                f[self.rl] = rnd

    def add(self, verts, faces, uvs=None, mi=0, rnd=0.0, M=None):
        bv = [self.bm.verts.new(tuple(M @ Vector(v)) if M is not None else tuple(v)) for v in verts]
        k = 0
        for f in faces:
            try:
                face = self.bm.faces.new([bv[i] for i in f])
            except ValueError:
                k += len(f)
                continue
            face.material_index = mi
            face[self.rl] = rnd
            if uvs is not None:
                for li, loop in enumerate(face.loops):
                    loop[self.uvl].uv = uvs[k + li]
            k += len(f)
        return bv

    def _from_verts(self, verts, mi, rnd):
        fs = {f for v in verts for f in v.link_faces}
        self._tag(fs, mi, rnd)
        return fs

    def sphere(self, M, u=12, v=8, mi=0, rnd=0.0):
        r = bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=1.0, matrix=M,
                                      calc_uvs=True)
        self._from_verts(r['verts'], mi, rnd)

    def ico(self, M, sub=2, mi=0, rnd=0.0, wobble=0.0, seed=0):
        r = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=1.0, matrix=Matrix.Identity(4),
                                       calc_uvs=True)
        if wobble > 0:
            for vv in r['verts']:
                c = vv.co
                k = 1.0 + wobble * (math.sin(c.x * 5.1 + seed) * math.cos(c.y * 4.3 + seed * 1.7) +
                                    0.6 * math.sin(c.z * 7.7 + seed * 0.3))
                vv.co = c * k
        bmesh.ops.transform(self.bm, matrix=M, verts=r['verts'])
        self._from_verts(r['verts'], mi, rnd)

    def cyl(self, M, r1=1.0, r2=1.0, depth=1.0, seg=16, mi=0, rnd=0.0, caps=True):
        """Cylinder/cone along local Z from z=0 to z=depth."""
        MM = M @ Matrix.Translation((0, 0, depth / 2))
        r = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg,
                                  radius1=r1, radius2=r2, depth=depth, matrix=MM, calc_uvs=True)
        self._from_verts(r['verts'], mi, rnd)

    def box(self, M, size, radius=0.0, segs=2, mi=0, rnd=0.0):
        """Box centred at M's origin with `size`; radius > 0 rounds the edges."""
        S = Matrix.Diagonal((size[0], size[1], size[2], 1.0))
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M @ S, calc_uvs=True)
        vs = r['verts']
        faces = {f for v in vs for f in v.link_faces}
        if radius > 0:
            edges = list({e for v in vs for e in v.link_edges})
            res = bmesh.ops.bevel(self.bm, geom=edges + list(vs), offset=min(radius, 0.45 * min(size)),
                                  offset_type='OFFSET', segments=segs, profile=0.5, affect='EDGES',
                                  clamp_overlap=True)
            faces |= set(res.get('faces', []))
        self._tag(faces, mi, rnd)

    def lathe(self, profile, M, seg=32, mi=0, rnd=0.0, dfunc=None, cap_top=False, cap_bot=False,
              a0=0.0, a1=TAU):
        full = abs((a1 - a0) - TAU) < 1e-6
        n = len(profile)
        ncol = seg if full else seg + 1
        L = [0.0]
        for i in range(1, n):
            L.append(L[-1] + math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]))
        verts, faces, uvs = [], [], []
        for j in range(ncol):
            a = a0 + (a1 - a0) * j / seg
            ca, sa = math.cos(a), math.sin(a)
            for i, (r, z) in enumerate(profile):
                dr, dz = dfunc(a, i, r, z) if dfunc else (0.0, 0.0)
                rr = max(r + dr, 0.0)
                verts.append((rr * ca, rr * sa, z + dz))
        for j in range(seg):
            j2 = (j + 1) % ncol if full else j + 1
            for i in range(n - 1):
                a_, b_ = j * n + i, j2 * n + i
                faces.append((a_, b_, b_ + 1, a_ + 1))
                uvs += [(j / seg, L[i]), ((j + 1) / seg, L[i]), ((j + 1) / seg, L[i + 1]), (j / seg, L[i + 1])]
        if full and cap_top and profile[-1][0] > 1e-6:
            f = tuple(j * n + n - 1 for j in range(seg))
            faces.append(f)
            uvs += [(0.5, 0.5)] * seg
        if full and cap_bot and profile[0][0] > 1e-6:
            f = tuple(j * n for j in reversed(range(seg)))
            faces.append(f)
            uvs += [(0.5, 0.5)] * seg
        return self.add(verts, faces, uvs, mi, rnd, M)

    def torus(self, M, R=1.0, r=0.1, nu=24, nv=8, mi=0, rnd=0.0, a0=0.0, a1=TAU):
        full = abs((a1 - a0) - TAU) < 1e-6
        ncol = nu if full else nu + 1
        verts, faces = [], []
        for i in range(ncol):
            u = a0 + (a1 - a0) * i / nu
            for j in range(nv):
                v = TAU * j / nv
                rr = R + r * math.cos(v)
                verts.append((rr * math.cos(u), rr * math.sin(u), r * math.sin(v)))
        for i in range(nu):
            i2 = (i + 1) % ncol if full else i + 1
            for j in range(nv):
                j2 = (j + 1) % nv
                faces.append((i * nv + j, i2 * nv + j, i2 * nv + j2, i * nv + j2))
        self.add(verts, faces, None, mi, rnd, M)

    def disc(self, M, r=1.0, seg=20, mi=0, rnd=0.0):
        verts = [(r * math.cos(TAU * i / seg), r * math.sin(TAU * i / seg), 0.0) for i in range(seg)]
        uvs = [(0.5 + 0.5 * math.cos(TAU * i / seg), 0.5 + 0.5 * math.sin(TAU * i / seg)) for i in range(seg)]
        self.add(verts, [tuple(range(seg))], uvs, mi, rnd, M)

    def arch_panel(self, M, w, h, seg=10, mi=0, rnd=0.0):
        """Round-topped flat panel in local XY (y up), facing +Z, bottom centre at origin."""
        rr = w / 2
        pts = [(-rr, 0.0), (rr, 0.0)]
        cz = h - rr
        for i in range(seg + 1):
            a = math.pi * i / seg
            pts.append((rr * math.cos(a), cz + rr * math.sin(a)))
        verts = [(x, y, 0.0) for x, y in pts]
        uvs = [((x + rr) / w, y / h) for x, y in pts]
        self.add(verts, [tuple(range(len(pts)))], uvs, mi, rnd, M)

    def tube(self, pts, radius=0.03, seg=8, mi=0, rnd=0.0, radii=None):
        P = [Vector(p) for p in pts]
        n = len(P)
        if n < 2:
            return
        T = []
        for i in range(n):
            a, b = P[max(i - 1, 0)], P[min(i + 1, n - 1)]
            T.append((b - a).normalized())
        up = Vector((0, 0, 1)) if abs(T[0].z) < 0.95 else Vector((1, 0, 0))
        N = T[0].cross(up).normalized()
        frames = [N]
        for i in range(1, n):
            q = T[i - 1].rotation_difference(T[i])
            frames.append((q @ frames[-1]).normalized())
        verts, faces = [], []
        for i in range(n):
            Nn = frames[i]
            Bn = T[i].cross(Nn).normalized()
            rr = radii[i] if radii is not None else radius
            for j in range(seg):
                a = TAU * j / seg
                verts.append(tuple(P[i] + (Nn * math.cos(a) + Bn * math.sin(a)) * rr))
        for i in range(n - 1):
            for j in range(seg):
                j2 = (j + 1) % seg
                faces.append((i * seg + j, (i + 1) * seg + j, (i + 1) * seg + j2, i * seg + j2))
        bv = self.add(verts, faces, None, mi, rnd)
        # orient consistently outward
        fs = {f for v in bv for f in v.link_faces}
        if fs:
            f0 = next(iter(fs))
            c = f0.calc_center_median()
            idx = bv.index(f0.verts[0]) // seg
            if (c - P[idx]).dot(f0.normal) < 0:
                for f in fs:
                    f.normal_flip()

    def obj(self, name, mats, coll, smooth=True, sharp=None, edge=True, shadow=True, merge=True):
        if merge:
            bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        self.bm.normal_update()
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        if smooth:
            me.shade_smooth()
            if sharp is not None:
                me.set_sharp_from_angle(angle=math.radians(sharp))
        for m in mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        if edge and len(me.vertices):
            pk.edge_mask(ob)
        ob.visible_shadow = shadow
        return ob


def frame_at(p, n, roll=0.0):
    """4x4 matrix at p whose local +Z faces n, local +Y up-ish."""
    n = Vector(n).normalized()
    q = n.to_track_quat('Z', 'Y')
    M = q.to_matrix().to_4x4()
    if roll:
        M = M @ Matrix.Rotation(roll, 4, 'Z')
    M.translation = Vector(p)
    return M


def T(p):
    return Matrix.Translation(Vector(p))


def RZ(a):
    return Matrix.Rotation(a, 4, 'Z')


def S3(x, y=None, z=None):
    return Matrix.Diagonal((x, x if y is None else y, x if z is None else z, 1.0))


def prof_r(profile, z):
    """Radius of a lathe profile at height z (linear interpolation)."""
    for i in range(len(profile) - 1):
        r0, z0 = profile[i]
        r1, z1 = profile[i + 1]
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return profile[-1][0] if z > profile[-1][1] else profile[0][0]


# ============================================================================ materials
class Mats:
    pass


M = Mats()


def cap_mat(name, color, coat=0.55, glow=None, glow_strength=0.0, spots=1.0, moss=1.0):
    """Mushroom cap skin: jewel colour with soft value drift, darker toward the rim, a
    scatter of cream spots and freckles (slightly raised), fine fibrous streaks and pores,
    green moss creeping over the top, warm subsurface, a satin coat."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    geo = pk.node(nt, 'ShaderNodeNewGeometry')
    nz = pk.sep_xyz(nt, geo.outputs['Normal'])[2]
    col = pk._jitter_color(nt, color, 0.14, co, scale=0.5)
    f, _ = pk.noise(nt, co, scale=1.6, detail=4.0, rough=0.6)
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, f, 0.3, 0.75, 0.7, 1.2))
    # darker, more saturated toward the rim (steep normals), paler crown
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, nz, 0.0, 0.9, 0.62, 1.12))
    # fibrous streaks and pores
    x, y, z = pk.sep_xyz(nt, co)
    fib, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', x, 9.0), pk.math_(nt, 'MULTIPLY', y, 9.0),
                                      pk.math_(nt, 'MULTIPLY', z, 1.2)), scale=1.0, detail=5.0, rough=0.65)
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, fib, 0.3, 0.7, 0.86, 1.1))
    pores = pk.voronoi(nt, co, scale=26.0, feature='F1')
    pm = pk.maprange(nt, pores['Distance'], 0.0, 0.18, 1.0, 0.0)
    # spots: big ones and freckles, per-cell random so only some cells carry a spot
    vb = pk.voronoi(nt, co, scale=1.3, feature='F1')
    rb = pk.sep_xyz(nt, vb['Color'])[0]
    big = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, vb['Distance'], 0.2, 0.27, 1.0, 0.0),
                   pk.math_(nt, 'GREATER_THAN', rb, 0.45))
    vf = pk.voronoi(nt, co, scale=4.5, feature='F1')
    rf = pk.sep_xyz(nt, vf['Color'])[1]
    frk = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, vf['Distance'], 0.16, 0.24, 1.0, 0.0),
                   pk.math_(nt, 'GREATER_THAN', rf, 0.6))
    sp = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MAXIMUM', big, pk.math_(nt, 'MULTIPLY', frk, 0.8)),
                  pk.maprange(nt, nz, 0.15, 0.45, 0.0, spots))
    col = pk.mix_col(nt, sp, col, (0.88, 0.8, 0.66))
    # moss on the crown
    mf, _ = pk.noise(nt, co, scale=0.9, detail=4.0, rough=0.6)
    mm = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, nz, 0.55, 0.9, 0.0, 1.0),
                  pk.maprange(nt, mf, 0.52, 0.6, 0.0, moss * 0.85))
    mfine, _ = pk.noise(nt, co, scale=40.0, detail=2.0)
    mcol = pk.vmath(nt, 'SCALE', (0.05, 0.16, 0.07), scale=pk.maprange(nt, mfine, 0.3, 0.7, 0.6, 1.3))
    col = pk.mix_col(nt, mm, col, mcol)
    e = pk._edge(nt)
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', e, 0.25), col, (1.0, 0.92, 0.85), blend='SCREEN')
    fine, _ = pk.noise(nt, co, scale=34.0, detail=3.0)
    h = pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', f, 0.5), pk.math_(nt, 'MULTIPLY', fine, 0.2))
    h = pk.math_(nt, 'ADD', h, pk.math_(nt, 'MULTIPLY', sp, 0.35))
    h = pk.math_(nt, 'ADD', h, pk.math_(nt, 'MULTIPLY', mm, pk.math_(nt, 'MULTIPLY', mfine, 0.4)))
    h = pk.math_(nt, 'SUBTRACT', h, pk.math_(nt, 'MULTIPLY', pm, 0.08))
    nrm = pk.bump(nt, h, strength=0.3, distance=0.03)
    rough = pk.maprange(nt, fine, 0.3, 0.7, 0.3, 0.52)
    rough = pk.mix_f(nt, pk.math_(nt, 'MAXIMUM', sp, mm), rough, 0.75)
    kw = dict(base=col, rough=rough, normal=nrm, coat=pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'SUBTRACT', 1.0, mm), coat * 0.55),
              coat_rough=0.14, sheen=0.08, sheen_tint=(0.9, 0.85, 0.8), spec=0.45,
              sss=0.12, sss_radius=(1.0, 0.45, 0.3), sss_scale=0.01)
    if glow is not None:
        kw.update(emit=glow, emit_strength=glow_strength)
    p = pk._principled(nt, **kw)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.4, emit=glow or (0, 0, 0), emit_strength=glow_strength)
    return m


def stalk_mat(name, color):
    """Pale mushroom-stalk plaster: vertical fibres, stucco bumps, grime in crevices and a
    damp, mossy foot."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    col = pk._jitter_color(nt, color, 0.1, co, scale=0.8)
    fib, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', x, 7.0), pk.math_(nt, 'MULTIPLY', y, 7.0),
                                      pk.math_(nt, 'MULTIPLY', z, 0.5)), scale=1.0, detail=6.0, rough=0.62)
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, fib, 0.3, 0.7, 0.82, 1.1))
    sf, _ = pk.noise(nt, co, scale=18.0, detail=5.0, rough=0.6)
    sv = pk.voronoi(nt, co, scale=5.0, feature='SMOOTH_F1')
    ao = pk.node(nt, 'ShaderNodeAmbientOcclusion', samples=8)
    ao.inputs['Distance'].default_value = 0.6
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, ao.outputs['AO'], 0.3, 1.0, 0.6, 1.0))
    # damp foot: darker and greener in the first metre above the ground
    gz = pk.sep_xyz(nt, pk.node(nt, 'ShaderNodeNewGeometry').outputs['Position'])[2]
    mf, _ = pk.noise(nt, co, scale=2.5, detail=3.0)
    foot = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, gz, 0.2, 1.3, 1.0, 0.0),
                    pk.maprange(nt, mf, 0.35, 0.6, 0.4, 1.0))
    col = pk.mix_col(nt, foot, col, (0.06, 0.1, 0.06))
    e = pk._edge(nt)
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', e, 0.15), col, (1, 1, 1), blend='SCREEN')
    h = pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', sf, 0.45), pk.math_(nt, 'MULTIPLY', sv['Distance'], 0.3))
    h = pk.math_(nt, 'ADD', h, pk.math_(nt, 'MULTIPLY', fib, 0.5))
    nrm = pk.bump(nt, h, strength=0.32, distance=0.012)
    p = pk._principled(nt, base=col, rough=pk.maprange(nt, sf, 0.3, 0.7, 0.62, 0.8), normal=nrm, spec=0.4,
                       sss=0.08, sss_radius=(1.0, 0.6, 0.4), sss_scale=0.01)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.72)
    return m


def bark_mat(name, color=(0.16, 0.09, 0.055), dark=(0.035, 0.022, 0.018), moss=(0.04, 0.12, 0.06)):
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    st = pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', x, 2.2), pk.math_(nt, 'MULTIPLY', y, 2.2),
                     pk.math_(nt, 'MULTIPLY', z, 0.3))
    f, _ = pk.noise(nt, st, scale=3.0, detail=6.0, rough=0.62, distortion=0.6)
    col = pk.mix_col(nt, pk.maprange(nt, f, 0.32, 0.68), dark, color)
    nz = pk.sep_xyz(nt, pk.node(nt, 'ShaderNodeNewGeometry').outputs['Normal'])[2]
    mf, _ = pk.noise(nt, co, scale=0.9, detail=3.0)
    mm = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, nz, 0.25, 0.8), pk.maprange(nt, mf, 0.4, 0.6))
    col = pk.mix_col(nt, mm, col, moss)
    nrm = pk.bump(nt, f, strength=0.7, distance=0.06)
    p = pk._principled(nt, base=col, rough=pk.maprange(nt, f, 0.3, 0.7, 0.55, 0.9), normal=nrm, spec=0.4)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.8)
    return m


def leaf_mat(name, color, sss=0.25, rough=0.5):
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    col = pk._jitter_color(nt, color, 0.2, co, scale=1.4)
    f, _ = pk.noise(nt, co, scale=18.0, detail=2.0)
    nrm = pk.bump(nt, f, strength=0.15, distance=0.01)
    p = pk._principled(nt, base=col, rough=rough, normal=nrm, sss=sss, sss_radius=(0.3, 0.6, 0.2),
                       sss_scale=0.02, sheen=0.3, sheen_tint=(0.7, 0.9, 1.0), spec=0.45)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=rough)
    return m


def glow_mat(name, color, strength, base_k=0.5, coat=0.4):
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    f, _ = pk.noise(nt, co, scale=6.0, detail=2.0)
    s = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, f, 0.3, 0.7, 0.65, 1.25), strength)
    p = pk._principled(nt, base=tuple(c * base_k for c in color), rough=0.35, emit=color, emit_strength=s,
                       coat=coat, coat_rough=0.08, sss=0.2, sss_radius=(0.3, 0.6, 0.6), sss_scale=0.02)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=tuple(c * base_k for c in color), rough=0.35, emit=color, emit_strength=strength)
    return m


def toad_cap_mat(name, color, strength):
    """Glowing toadstool lamp cap: saturated colour that glows from within, brightest on the
    underside (gills) and toward the rim, darker crown with pale spots, so it reads as a
    lit cap with form instead of a flat white blob."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    geo = pk.node(nt, 'ShaderNodeNewGeometry')
    nz = pk.sep_xyz(nt, geo.outputs['Normal'])[2]
    f, _ = pk.noise(nt, co, scale=9.0, detail=2.0)
    under = pk.maprange(nt, nz, -0.2, 0.35, 1.0, 0.0)                  # 1 under the cap
    crown = pk.maprange(nt, nz, 0.55, 0.95, 0.0, 1.0)
    vs = pk.voronoi(nt, co, scale=14.0, feature='F1')
    spot = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, vs['Distance'], 0.12, 0.2, 1.0, 0.0),
                    pk.math_(nt, 'GREATER_THAN', pk.sep_xyz(nt, vs['Color'])[0], 0.4))
    spot = pk.math_(nt, 'MULTIPLY', spot, pk.maprange(nt, nz, 0.3, 0.6, 0.0, 1.0))
    k = pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', under, 1.6), pk.maprange(nt, crown, 0, 1, 0.75, 0.35))
    k = pk.math_(nt, 'MULTIPLY', k, pk.maprange(nt, f, 0.3, 0.7, 0.8, 1.15))
    k = pk.math_(nt, 'MULTIPLY', k, pk.math_(nt, 'SUBTRACT', 1.0, pk.math_(nt, 'MULTIPLY', spot, 0.55)))
    gill = tuple(min(1.0, c * 0.7 + 0.3) for c in color)
    ecol = pk.mix_col(nt, under, color, gill)
    ecol = pk.mix_col(nt, spot, ecol, (1.0, 0.9, 0.75))
    p = pk._principled(nt, base=pk.mix_col(nt, spot, tuple(c * 0.35 for c in color), (0.8, 0.75, 0.65)), rough=0.35,
                       emit=ecol, emit_strength=pk.math_(nt, 'MULTIPLY', k, strength), coat=0.4, coat_rough=0.1,
                       sss=0.2, sss_radius=(0.3, 0.6, 0.6), sss_scale=0.02)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=tuple(c * 0.35 for c in color), rough=0.35, emit=color, emit_strength=strength)
    return m


def gill_glow_mat(name, color, strength, center, n_gills=90):
    """Glowing gills seen from below: fluted radial stripes (bright ridges, darker slots),
    brighter toward the stalk, with a little noise."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    dx = pk.math_(nt, 'SUBTRACT', x, center[0])
    dy = pk.math_(nt, 'SUBTRACT', y, center[1])
    ang = pk.math_(nt, 'ARCTAN2', dy, dx)
    rad = pk.math_(nt, 'SQRT', pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', dx, dx), pk.math_(nt, 'MULTIPLY', dy, dy)))
    st = pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', ang, n_gills * 0.5)))
    st = pk.math_(nt, 'POWER', st, 0.6)
    f, _ = pk.noise(nt, co, scale=0.6, detail=3.0)
    k = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, st, 0.0, 1.0, 0.25, 1.0), pk.maprange(nt, f, 0.3, 0.7, 0.75, 1.2))
    k = pk.math_(nt, 'MULTIPLY', k, pk.maprange(nt, rad, 4.0, 22.0, 1.5, 0.55))
    p = pk._principled(nt, base=tuple(c * 0.4 for c in color), rough=0.5, emit=color,
                       emit_strength=pk.math_(nt, 'MULTIPLY', k, strength), spec=0.3)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    # web fallback: the mean of the stripes (0.25..1) and the radial falloff (1.5..0.55), not the peak
    pk._web(m, base=tuple(c * 0.4 for c in color), rough=0.5, emit=color, emit_strength=strength * 0.75)
    return m


def shingle_mat(name, color):
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    ang = pk.math_(nt, 'ARCTAN2', y, x)
    rows = pk.math_(nt, 'FRACT', pk.math_(nt, 'MULTIPLY', z, 3.2))
    cols = pk.math_(nt, 'FRACT', pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', ang, 14.0),
                                         pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'FLOOR', pk.math_(nt, 'MULTIPLY', z, 3.2)), 0.5)))
    edge = pk.math_(nt, 'MAXIMUM', pk.maprange(nt, rows, 0.0, 0.12, 1.0, 0.0),
                    pk.maprange(nt, pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', cols, 0.5)), 0.44, 0.5, 0.0, 1.0))
    col = pk._jitter_color(nt, color, 0.18, co, scale=2.0)
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, edge, 0, 1, 1.0, 0.45))
    nrm = pk.bump(nt, pk.math_(nt, 'ADD', rows, pk.math_(nt, 'MULTIPLY', edge, -0.5)), strength=0.6, distance=0.03)
    p = pk._principled(nt, base=col, rough=0.45, normal=nrm, coat=0.5, coat_rough=0.12)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.5)
    return m


def smoke_mat(name='MH_Smoke', opacity=1.1, color=(0.62, 0.62, 0.7)):
    """Soft smoke for camera-facing cards: radial falloff x billowy noise x object alpha."""
    m, nt, out = pk._new_mat(name)
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    cu = pk.comb_xyz(nt, pk.math_(nt, 'SUBTRACT', U, 0.5), pk.math_(nt, 'SUBTRACT', V, 0.5), 0.0)
    d = pk.math_(nt, 'MULTIPLY', pk.vmath(nt, 'LENGTH', cu), 2.0)
    fall = pk.maprange(nt, d, 0.15, 1.0, 1.0, 0.0, interp='SMOOTHSTEP')
    rnd = pk.node(nt, 'ShaderNodeObjectInfo').outputs['Random']
    nv = pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', U, 2.5), pk.math_(nt, 'MULTIPLY', V, 2.5),
                     pk.math_(nt, 'MULTIPLY', rnd, 40.0))
    nf, _ = pk.noise(nt, nv, scale=1.6, detail=4.0, rough=0.55, distortion=0.4)
    nf = pk.maprange(nt, nf, 0.32, 0.72, 0.15, 1.0, interp='SMOOTHSTEP')
    oa = pk.node(nt, 'ShaderNodeObjectInfo').outputs['Alpha']
    alpha = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', fall, nf), pk.math_(nt, 'MULTIPLY', oa, opacity))
    p = pk._principled(nt, base=color, rough=1.0, alpha=alpha, spec=0.0)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=1.0, alpha=0.3)
    return m


def cozy_window(name, color, strength, mullions=(2, 2), frame_w=0.0, mullion_w=0.05, variation=0.4,
                hue_shift=0.04, curtains=0.5, frame_color=(0.08, 0.04, 0.02), curtain_color=None):
    """Lamp-lit window for quads with UV 0..1 (arch panels, porthole discs): a warm interior
    gradient (brightest low in the middle, where the lamp is), soft fabric curtains drawn to the
    sides (a smooth gradient, deeper and redder, no cut-out silhouettes), a darker valance at
    the top, mullions, and per-window brightness and hue from the face attribute pk_rand
    (> 1 = unlit)."""
    m, nt, out = pk._new_mat(name)
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    rnd = pk.attr(nt, 'pk_rand')
    oi = pk.node(nt, 'ShaderNodeObjectInfo').outputs['Random']
    r = pk.math_(nt, 'FRACT', pk.math_(nt, 'ADD', rnd, pk.math_(nt, 'MULTIPLY', oi, 0.37)))
    lit = pk.math_(nt, 'LESS_THAN', rnd, 1.0)

    def band(c, w):
        return pk.math_(nt, 'LESS_THAN', pk.math_(nt, 'ABSOLUTE', c), w)
    fr = pk.math_(nt, 'MAXIMUM',
                  pk.math_(nt, 'MAXIMUM', pk.math_(nt, 'LESS_THAN', U, frame_w), pk.math_(nt, 'GREATER_THAN', U, 1 - frame_w)),
                  pk.math_(nt, 'MAXIMUM', pk.math_(nt, 'LESS_THAN', V, frame_w), pk.math_(nt, 'GREATER_THAN', V, 1 - frame_w)))
    mx, my = mullions
    for i in range(1, mx):
        fr = pk.math_(nt, 'MAXIMUM', fr, band(pk.math_(nt, 'SUBTRACT', U, i / mx), mullion_w / 2))
    for i in range(1, my):
        fr = pk.math_(nt, 'MAXIMUM', fr, band(pk.math_(nt, 'SUBTRACT', V, i / my), mullion_w / 2))
    # interior light: a soft hot spot low in the middle, falling off to the top
    hx = pk.maprange(nt, r, 0, 1, 0.38, 0.62)
    d = pk.vmath(nt, 'DISTANCE', pk.comb_xyz(nt, U, pk.math_(nt, 'MULTIPLY', V, 0.8), 0.0), pk.comb_xyz(nt, hx, 0.3, 0.0))
    glow = pk.maprange(nt, d, 0.0, 0.75, 1.25, 0.55, interp='SMOOTHSTEP')
    glow = pk.math_(nt, 'MULTIPLY', glow, pk.maprange(nt, V, 0.8, 0.97, 1.0, 0.62, interp='SMOOTHSTEP'))
    # curtains: smooth gradient at both sides, opening varies per window
    op = pk.maprange(nt, pk.math_(nt, 'FRACT', pk.math_(nt, 'MULTIPLY', r, 7.13)), 0, 1, 0.24, 0.36)
    cu = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', U, 0.5)),
                                              op, pk.math_(nt, 'ADD', op, 0.16), 0.0, 1.0, interp='SMOOTHSTEP'), curtains)
    folds = pk.math_(nt, 'ADD', 0.85, pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', U, 70.0)), 0.15))
    cu_k = pk.math_(nt, 'MULTIPLY', cu, folds)
    bright = pk.maprange(nt, r, 0.0, 1.0, 1.0 - variation, 1.0 + variation * 0.5)
    hue = pk.node(nt, 'ShaderNodeHueSaturation')
    pk._set(nt, hue.inputs['Color'], color)
    pk._set(nt, hue.inputs['Hue'], pk.maprange(nt, r, 0, 1, 0.5 - hue_shift, 0.5 + hue_shift))
    ccol = curtain_color or tuple(c * k for c, k in zip(color, (1.0, 0.55, 0.45)))
    ecol = pk.mix_col(nt, cu, hue.outputs[0], ccol)
    e = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', glow, bright), pk.math_(nt, 'SUBTRACT', 1.0, pk.math_(nt, 'MULTIPLY', cu_k, 0.55)))
    e = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', e, pk.math_(nt, 'SUBTRACT', 1.0, fr)), lit)
    es = pk.math_(nt, 'MULTIPLY', e, strength)
    base = pk.mix_col(nt, fr, (0.01, 0.012, 0.02), frame_color)
    p = pk._principled(nt, base=base, rough=pk.mix_f(nt, fr, 0.05, 0.5), emit=ecol, emit_strength=es, spec=0.6)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=frame_color, rough=0.2, emit=color, emit_strength=strength * 0.8)
    return m


def make_materials():
    M.caps = [cap_mat('MH_Cap%d' % i, c) for i, c in enumerate(CAP_COLORS)]
    M.stalks = [stalk_mat('MH_Stalk%d' % i, c) for i, c in enumerate(STALK_COLORS)]
    M.gill = pk.mat.clay((0.62, 0.48, 0.44), name='MH_Gill', roughness=0.8, bumps=0.3, grime=0.6)
    M.spot = pk.mat.clay((0.86, 0.8, 0.68), name='MH_Spot', roughness=0.5, bumps=0.4, grime=0.1)
    M.spot_glow = glow_mat('MH_SpotGlow', FUNGI_CYAN, 3.2, base_k=0.4)
    M.doors = [pk.mat.painted_wood(c, name='MH_Door%d' % i, wear=0.4) for i, c in enumerate(
        [(0.42, 0.08, 0.06), (0.05, 0.25, 0.3), (0.32, 0.18, 0.06), (0.1, 0.12, 0.35)])]
    M.wood = pk.mat.painted_wood((0.2, 0.11, 0.06), name='MH_Wood', wear=0.3, under=(0.3, 0.18, 0.1))
    M.wood_light = pk.mat.varnished_wood(name='MH_WoodLight', light=(0.4, 0.22, 0.1), dark=(0.16, 0.08, 0.04))
    M.stone = pk.mat.clay((0.24, 0.26, 0.3), name='MH_Stone', roughness=0.75, bumps=0.9, grime=0.5)
    M.brass = pk.mat.metal((0.78, 0.55, 0.26), name='MH_Brass', roughness=0.28, scratches=0.3, dirt=0.25)
    M.iron = pk.mat.metal((0.06, 0.06, 0.07), name='MH_Iron', roughness=0.38, scratches=0.2, dirt=0.2)
    M.leaf = leaf_mat('MH_Leaf', (0.025, 0.11, 0.06))
    M.fern = leaf_mat('MH_Fern', (0.05, 0.3, 0.14), sss=0.35)
    M.canopy = leaf_mat('MH_Canopy', (0.02, 0.06, 0.06), sss=0.15, rough=0.6)
    M.farleaf = leaf_mat('MH_FarLeaf', (0.02, 0.035, 0.05), sss=0.0, rough=0.8)
    M.bark = bark_mat('MH_Bark')
    M.stump = bark_mat('MH_StumpBark', color=(0.55, 0.3, 0.13), dark=(0.07, 0.035, 0.02), moss=(0.06, 0.2, 0.08))
    M.rings = pk.mat.varnished_wood(name='MH_Rings', light=(0.5, 0.3, 0.15), dark=(0.25, 0.13, 0.06), axis='Z', scale=0.6)
    M.plaster = pk.mat.clay((0.72, 0.62, 0.48), name='MH_InnPlaster', roughness=0.8, bumps=0.5)
    M.shingle = shingle_mat('MH_Shingle', (0.36, 0.1, 0.06))
    M.shingle2 = shingle_mat('MH_ShingleBlue', (0.08, 0.12, 0.3))
    M.moss = pk.mat.ground((0.02, 0.07, 0.035), name='MH_Moss', roughness=0.7, wet=0.7, scale=0.6,
                           color2=(0.025, 0.04, 0.06))
    M.moss_clump = leaf_mat('MH_MossClump', (0.03, 0.12, 0.05), sss=0.2, rough=0.75)
    fade_bump_at_grazing(M.moss, lo=0.25)
    M.rock = pk.mat.clay((0.16, 0.18, 0.24), name='MH_Rock', roughness=0.6, bumps=1.0, grime=0.5)
    M.win = {
        'amber': cozy_window('MH_WinAmber', (1.0, 0.5, 0.16), 3.2, curtains=0.55, variation=0.45),
        'rose': cozy_window('MH_WinRose', (1.0, 0.4, 0.3), 3.0, curtains=0.5),
        'cyan': cozy_window('MH_WinCyan', (0.25, 0.8, 1.0), 2.6, curtains=0.4, curtain_color=(0.12, 0.3, 0.6)),
        'ice': cozy_window('MH_WinIce', (0.55, 0.85, 1.0), 2.6, curtains=0.4, variation=0.45,
                           curtain_color=(0.2, 0.35, 0.7)),
        'violet': cozy_window('MH_WinViolet', (0.72, 0.5, 1.0), 2.6, curtains=0.4),
        'far': cozy_window('MH_WinFar', (1.0, 0.52, 0.18), 5.0, mullions=(1, 1), curtains=0.0, variation=0.55),
        'farcool': cozy_window('MH_WinFarCool', (0.5, 0.8, 1.0), 4.5, mullions=(1, 1), curtains=0.0, variation=0.55),
        'hero': cozy_window('MH_WinHero', (1.0, 0.46, 0.13), 2.8, mullions=(2, 3), frame_w=0.06, curtains=0.6,
                            variation=0.22, frame_color=(0.12, 0.06, 0.03), curtain_color=(0.85, 0.2, 0.06)),
        'tower': cozy_window('MH_WinTower', (0.3, 0.95, 1.0), 4.0, mullions=(3, 1), frame_w=0.05, curtains=0.0,
                             variation=0.2),
    }
    M.lamp_warm = pk.mat.emission((1.0, 0.56, 0.22), 7.0, name='MH_LampWarm')
    M.lamp_cyan = pk.mat.emission((0.35, 0.9, 1.0), 6.0, name='MH_LampCyan')
    M.bulbs = [pk.mat.emission(c, 9.0, name='MH_Bulb%d' % i) for i, c in enumerate(
        [(1.0, 0.66, 0.3), (1.0, 0.25, 0.62), (0.35, 0.85, 1.0), (1.0, 0.8, 0.45), (0.62, 0.45, 1.0)])]
    M.fungi = [glow_mat('MH_Fungi%d' % i, c, s) for i, (c, s) in enumerate(
        [(TEAL, 2.2), ((1.0, 0.22, 0.62), 2.0), ((0.5, 0.25, 1.0), 2.2), ((0.2, 0.7, 1.0), 2.2)])]
    M.fungi_stalk = glow_mat('MH_FungiStalk', (0.5, 0.9, 0.85), 0.5, base_k=0.6, coat=0.2)
    M.toad_warm = toad_cap_mat('MH_ToadWarm', (1.0, 0.5, 0.18), 2.4)
    M.toad_cool = toad_cap_mat('MH_ToadCool', (0.2, 0.82, 1.0), 2.4)
    M.toad_mag = toad_cap_mat('MH_ToadMag', (1.0, 0.16, 0.55), 1.5)
    M.toad_vio = toad_cap_mat('MH_ToadVio', (0.46, 0.26, 1.0), 1.7)
    M.toad_teal = toad_cap_mat('MH_ToadTeal', (0.05, 1.0, 0.72), 2.2)
    M.smoke = smoke_mat()


# ============================================================================ sky plate
LUMA3 = np.array(pk.LUMA, np.float32)
# star / dust separation and grade of the plate (see prepare_plate)
PLATE_PROC = dict(r_open=5, smooth=3, noise_t=0.5, p=1.8, peak_gain=1.45, star_sat=0.32,
                  bg_sat=0.72, bg_tint=(0.95, 0.97, 1.0))
PLATE_FAINT = 94.0        # percentile of the visible star peaks below which stars fade out
PLATE_VISIBLE = 0.035     # plate-linear peak above which a star reads in the graded sky
PLATE_EXT = dict(el0=3.0, el1=26.0, star_floor=0.15, bg_floor=0.5)
PLATE_DOME = dict(color=(1.0, 0.5, 0.24), strength=0.12, height=7.0,
                  airglow=(0.2, 0.85, 0.55), airglow_strength=0.004, airglow_el=9.0, airglow_w=3.5)


def split_stars(lin, r_open=5, smooth=3, noise_t=0.35, p=1.8, peak_gain=1.8, star_sat=0.55,
                bg_sat=0.9, bg_tint=(0.86, 0.95, 1.1), faint=None):
    """Split a linear sky photo into its smooth glow and dust (grey opening + blur) and its
    point stars (the residual). The stars are thresholded against the local noise floor
    (sensor noise and chroma speckle go), narrowed (each star's profile is raised to the
    power p about its own peak, so the soft 8 to 10 px plate stars land on 1 to 2 output
    pixels) and pulled toward white; the glow is slightly desaturated and the red pulled
    down. Returns (glow, stars), float32."""
    o = pk._minmax_filter(pk._minmax_filter(lin, r_open, np.minimum), r_open, np.maximum)
    B = np.minimum(pk._gauss(o, smooth), lin + 1e-4)
    S = np.maximum(lin - B, 0.0)
    Ls = S @ LUMA3
    nl = pk._gauss(Ls, 12) * noise_t
    S *= (np.maximum(Ls - nl, 0.0) / np.maximum(Ls, 1e-6))[..., None]
    Ls = S @ LUMA3
    Mx = pk._minmax_filter(Ls, 4, np.maximum)
    S *= ((Ls / np.maximum(Mx, 1e-6)) ** (p - 1.0) * peak_gain)[..., None]
    if faint is not None:
        # fade the faintest stars (soft knee on each star's own peak): fewer stars read
        Mx2 = pk._minmax_filter(S @ LUMA3, 3, np.maximum)
        k = np.clip((Mx2 - faint * 0.55) / (faint * 0.9), 0.0, 1.0)
        S *= (k * k * (3 - 2 * k))[..., None]
    Ls = (S @ LUMA3)[..., None]
    S = np.maximum(Ls + (S - Ls) * star_sat, 0.0)
    Lb = (B @ LUMA3)[..., None]
    B = np.maximum(Lb + (B - Lb) * bg_sat, 0.0) * np.array(bg_tint, np.float32)
    return B.astype(np.float32), S.astype(np.float32)


def plate_elevation(rows, W):
    """World elevation (deg) of every pixel of the given plate rows (gnomonic, see build_sky)."""
    cel = math.degrees(math.atan((PLATE_HORIZON - PLATE_ROWS / 2) / PLATE_F)) + 0.6
    f, r, u = pk.sky.rect_frame(PLATE_AZ, cel, 0.0)
    dx = (np.arange(W, dtype=np.float32) - W / 2) / PLATE_F
    dy = (PLATE_ROWS / 2 - np.asarray(rows, np.float32)) / PLATE_F
    dz = f.z + dy[:, None] * u.z + dx[None, :] * r.z
    n = np.sqrt(1.0 + dx[None, :] ** 2 + dy[:, None] ** 2)
    return np.degrees(np.arcsin(np.clip(dz / n, -1, 1))).astype(np.float32)


def prepare_plate():
    """Crop potw1938a above the person and continue its horizon colour (no stars) below
    the cut, so the true plate horizon can sit on the world horizon behind the tree line.
    v3: stars narrowed to points and pulled toward white, chroma speckle removed, glow
    desaturated, stars and dust fade toward the horizon (extinction), and a level light
    dome from the village plus a faint green airglow band are added in linear light."""
    key = pk._hash(PLATE_PROC, PLATE_EXT, PLATE_DOME, PLATE_F, PLATE_AZ, PLATE_FAINT, PLATE_VISIBLE, MOON_AZ, MOON_EL, MOON_SIZE)
    out = os.path.join(pk.CACHE_DIR, 'mh_potw1938a_cut%d_rows%d_v4_%s.jpg' % (PLATE_CUT, PLATE_ROWS, key))
    if os.path.exists(out):
        return out
    t0 = time.time()
    oiio = pk._oiio()
    buf = oiio.ImageBuf(PLATE_SRC)
    spec = buf.spec()
    W = spec.width
    roi = oiio.ROI(0, W, 0, PLATE_CUT, 0, 1, 0, 3)
    a = np.asarray(buf.get_pixels(oiio.UINT8, roi))[..., :3].astype(np.float32) / 255.0
    lin = pk._srgb_to_lin(a)
    del a
    # one global faint-star knee, measured on a mid-sky strip (so no strip seams)
    _, S0 = split_stars(lin[2400:3300], **PLATE_PROC)
    L0 = S0 @ LUMA3
    # star peaks that would read after the grade (plate linear above PLATE_VISIBLE): the knee
    # removes the faintest PLATE_FAINT percent of those, not just sensor-noise peaks
    pk_ = (L0 >= pk._minmax_filter(L0, 3, np.maximum) * 0.999) & (L0 > PLATE_VISIBLE)
    faint = float(np.percentile(L0[pk_], PLATE_FAINT)) if pk_.any() else None
    pk.log('star knee %.4f over %d visible peaks' % (faint or 0.0, int(pk_.sum())))
    del S0, L0, pk_
    # the Moon's disc in plate pixels: the stars behind it are hidden (the disc is added on top)
    f_, r_, u_ = pk.sky.rect_frame(PLATE_AZ, math.degrees(math.atan((PLATE_HORIZON - PLATE_ROWS / 2) / PLATE_F)) + 0.6, 0.0)
    dm = Vector(pk.sky_dir(MOON_AZ, MOON_EL))
    mx_ = W / 2 + PLATE_F * dm.dot(r_) / dm.dot(f_)
    my_ = PLATE_ROWS / 2 - PLATE_F * dm.dot(u_) / dm.dot(f_)
    mr_ = PLATE_F * math.tan(math.radians(MOON_SIZE / 2)) * 1.06
    xs_ = np.arange(W, dtype=np.float32)
    # stars / glow in strips (memory), with overlap so the filters see their neighbours
    strip, ov = 900, 48
    res_all = np.empty_like(lin)
    for y0 in range(0, PLATE_CUT, strip):
        ya, yb = max(0, y0 - ov), min(PLATE_CUT, y0 + strip + ov)
        B, S = split_stars(lin[ya:yb], faint=faint, **PLATE_PROC)
        rows = np.arange(ya, yb)
        el = plate_elevation(rows, W)
        e = PLATE_EXT
        ramp = np.clip((el - e['el0']) / (e['el1'] - e['el0']), 0, 1)
        ramp = ramp * ramp * (3 - 2 * ramp)
        dd = np.sqrt((xs_[None, :] - mx_) ** 2 + (rows[:, None].astype(np.float32) - my_) ** 2)
        fs = (e['star_floor'] + (1 - e['star_floor']) * ramp)[..., None]
        fs = fs * np.clip((dd - mr_) / 6.0, 0.0, 1.0)[..., None]
        fb = (e['bg_floor'] + (1 - e['bg_floor']) * ramp)[..., None]
        res = B * fb + S * fs
        k0, k1 = y0 - ya, y0 - ya + min(strip, PLATE_CUT - y0)
        res_all[y0:y0 + (k1 - k0)] = res[k0:k1]
    lin = res_all
    del res_all
    pk.log('plate stars/glow split (%.1f s)' % (time.time() - t0))
    # starless horizon profile from the rows just above the cut (column medians, wide box)
    band = lin[PLATE_CUT - 360:PLATE_CUT - 20]
    prof = np.median(band, axis=0)                          # (W, 3)
    k = 301
    cs = np.cumsum(np.pad(prof, ((k // 2, k // 2), (0, 0)), mode='edge'), axis=0)
    prof = (cs[k - 1:] - np.vstack([np.zeros((1, 3)), cs[:-k]])) / k
    nfill = PLATE_ROWS - PLATE_CUT
    rows = np.arange(nfill, dtype=np.float32)
    zr = (PLATE_CUT + rows - PLATE_HORIZON)                 # rows relative to the horizon
    ramp = np.where(zr < 0, 1.0 + 0.18 * (1.0 - (-zr) / (PLATE_HORIZON - PLATE_CUT)),
                    1.18 * np.exp(-zr / 220.0))
    fill = prof[None, :, :] * ramp[:, None, None]
    # crossfade the last rows of the plate into the fill (stars fade into the haze)
    nb = 260
    w = np.linspace(0, 1, nb, dtype=np.float32)
    w = (w * w * (3 - 2 * w))[:, None, None]
    lin[-nb:] = lin[-nb:] * (1 - w) + prof[None] * w
    full = np.concatenate([lin, fill.astype(np.float32)], axis=0)
    del lin, fill
    # level light dome above the lit village + faint green airglow band (linear, added)
    d = PLATE_DOME
    for y0 in range(0, PLATE_ROWS, 1000):
        y1 = min(PLATE_ROWS, y0 + 1000)
        el = plate_elevation(np.arange(y0, y1), W)
        dome = np.exp(-np.maximum(el, 0.0) / d['height']) * d['strength']
        ag = np.exp(-0.5 * ((el - d['airglow_el']) / d['airglow_w']) ** 2) * d['airglow_strength']
        full[y0:y1] += dome[..., None] * np.array(d['color'], np.float32) + \
            ag[..., None] * np.array(d['airglow'], np.float32)
    rng = np.random.RandomState(5)
    enc = pk._lin_to_srgb(np.clip(full, 0, 1))
    enc = enc + (rng.uniform(-0.5, 0.5, enc.shape[:2])[..., None] / 255.0).astype(np.float32)
    u8 = np.ascontiguousarray(np.clip(enc * 255.0 + 0.5, 0, 255).astype(np.uint8))
    os.makedirs(pk.CACHE_DIR, exist_ok=True)
    tmp = out + '.tmp.jpg'
    sp = oiio.ImageSpec(W, PLATE_ROWS, 3, 'uint8')
    sp.attribute('Compression', 'jpeg:96')
    sp.attribute('jpeg:subsampling', '4:4:4')
    o = oiio.ImageOutput.create(tmp)
    o.open(tmp, sp)
    o.write_image(u8)
    o.close()
    os.replace(tmp, out)
    pk.log('sky plate prepared %s (%.1f s)' % (out, time.time() - t0))
    return out


def build_sky():
    plate = prepare_plate()
    W = PLATE_W
    hfov = math.degrees(2 * math.atan((W / 2) / PLATE_F))
    center_el = math.degrees(math.atan((PLATE_HORIZON - PLATE_ROWS / 2) / PLATE_F)) + 0.6
    pk.sky.reset()
    # starless base (only seen far outside the plate): deep blue night + faint light dome
    pk.sky.atmosphere(airglow=0.0, airglow_red=0.0, background=(0.0015, 0.0025, 0.012), skyglow=0.15,
                      skyglow_color=(0.06, 0.09, 0.25), dawn=0.0)
    pk.sky.photo_plate(plate, center_az=PLATE_AZ, center_el=center_el, hfov_deg=hfov, gain=0.5,
                       feather=0.04, blend='replace', name='potw1938a')
    # thin crescent in the dark sky right of the band (about 18 deg from the core), lit limb down
    pk.sky.moon(az=MOON_AZ, el=MOON_EL, size_deg=MOON_SIZE, phase=0.14, lit_angle_deg=-100.0, gain=6.0,
                earthshine=0.016, halo=0.05, halo_size=0.6, light=MOON_LIGHT, light_color=(0.3, 0.48, 1.0))
    # added, not laid over: the earthshine side is then a faint ashen disc a touch brighter than
    # the sky (no dark hole, no ring); the plate has no stars behind the disc (prepare_plate)
    moon_layer = pk._SKY.layers[-1]
    if moon_layer.get('name') == 'moon':
        moon_layer['blend'] = 'add'
        pk.sky.build()
    ml = bpy.data.lights.get('MoonLight')
    if ml is not None:
        ml.specular_factor = 0.05     # no glitter path of moonlight on the wet lane
    # photographic grade on the cleaned plate: deep lanes, near-neutral band, deep navy night
    pk.sky.set_grade(exposure=SKY_EXPOSURE, contrast=1.6, saturation=SKY_SAT, tint=SKY_TINT)
    pk.sky.set_horizon_glow(color=SKY_GLOW, strength=1.0, height_deg=SKY_GLOW_H)
    pk.sky.set_lighting(gain=0.25, tint=(0.45, 0.62, 1.0), ambient=AMBIENT)


PLATE_AZ = 2.0
MOON_AZ, MOON_EL = 14.0, 27.0
MOON_SIZE = 2.4
MOON_LIGHT = 2.2
SKY_EXPOSURE = 0.0
SKY_SAT = 0.8
SKY_TINT = (0.8, 0.92, 1.12)
SKY_GLOW = (0.0045, 0.0105, 0.044)    # deep navy skyglow over the whole sky, strongest at the horizon
SKY_GLOW_H = 90.0
AMBIENT = (0.009, 0.024, 0.095)       # deep teal-blue fill (was cobalt-violet)
GIANT_H = 40.0
GIANT_X, GIANT_Y = 0.0, 0.0
CORE_AZEL = (0.0, 0.0)      # set in build() from plate_dir(*PLATE_CORE_PX)


# ============================================================================ world parts
def place(path, s, lat, dz=0.0):
    p = path.offset(s, lat, 0.0)
    p.z = ground_h(s, lat) + dz
    return p


def toward_road(path, s, lat):
    r = path.right(s)
    return (r * (-1.0 if lat > 0 else 1.0)).normalized()


def mushroom_house(path, s, lat, rng, tier, coll, idx, lights_on=True, lift=0.0, scale=1.0):
    """A giant mushroom house: stalk with porthole windows and a round door, cap with spots,
    optional outdoor spiral stair, chimney, door lamp, rim fairy lights and a facade wash."""
    base = place(path, s, lat, -0.25 + lift)
    n_road = toward_road(path, s, lat)
    a_face = math.atan2(n_road.y, n_road.x)
    side = 1 if lat > 0 else -1
    upper = tier == 'upper'
    if upper:
        tier = 'mid'
    if tier == 'front':
        r = rng.uniform(1.6, 2.4)
        h = rng.uniform(3.8, 6.0)
        R = rng.uniform(3.6, 5.2)
        Hc = rng.uniform(2.2, 3.8)
    elif tier == 'mid':
        r = rng.uniform(1.6, 2.6)
        h = rng.uniform(4.5, 7.5)
        R = rng.uniform(3.6, 5.8)
        Hc = rng.uniform(2.4, 4.2)
    else:
        r = rng.uniform(1.0, 1.9)
        h = rng.uniform(2.6, 5.0)
        R = rng.uniform(2.4, 4.2)
        Hc = rng.uniform(1.6, 3.4)
    if upper:
        r, h, R, Hc = r * 0.6 * scale, h * 0.75 * scale, R * 0.7 * scale, Hc * 0.8 * scale
    shape = rng.random()
    cap_m = rng.randrange(len(M.caps))
    stalk_m = rng.randrange(len(M.stalks))
    mats = [M.stalks[stalk_m], M.caps[cap_m], M.gill, M.spot, rng.choice(M.doors), M.wood, M.stone,
            M.brass, M.iron, M.leaf, M.spot_glow]
    b = BM()
    W = T(base)
    ph = rng.uniform(0, TAU)
    sprof = [(r * 1.32, 0.0), (r * 1.2, 0.3), (r * 1.08, 0.75), (r * 1.0, h * 0.3), (r * 1.03, h * 0.58),
             (r * 0.98, h * 0.82), (r * 0.9, h + 0.1)]
    if upper:
        sprof = [(r * 1.05, -0.8), (r, h * 0.3), (r * 1.02, h * 0.6), (r * 0.9, h + 0.1)]

    def stalk_d(a, i, rr, z):
        return (rr * (0.025 * math.sin(3 * a + ph) + 0.012 * math.sin(9 * a + 2.0 * z + ph)), 0.0)
    seg = 40 if tier != 'far' else 16
    b.lathe(sprof, W, seg=seg, mi=0, dfunc=stalk_d)
    # cap: gills underneath, then the dome
    tilt = math.radians(rng.uniform(-11, 11))
    tilt_ax = Vector((math.cos(ph), math.sin(ph), 0))
    top = Vector((0, 0, h))
    Mc = W @ T(top) @ Matrix.Rotation(tilt, 4, tilt_ax) @ T(-top)
    ruffle = 0.0
    if shape < 0.36:      # round dome
        ex_r, ex_z = 0.75, 1.0
    elif shape < 0.58:    # flat parasol with a ruffled rim
        ex_r, ex_z = 0.5, 1.8
        Hc *= 0.62
        R *= 1.12
        ruffle = rng.uniform(0.12, 0.3)
    elif shape < 0.8:     # bell
        ex_r, ex_z = 1.25, 0.8
        Hc *= 1.25
    else:                 # tall pointed cap
        ex_r, ex_z = 1.9, 0.75
        Hc *= 1.7
        R *= 0.86
    rf_n = rng.choice((5, 6, 7, 9))
    gprof = [(r * 0.86, h - 0.05), (r * 1.25, h + 0.08), (R * 0.55, h + 0.2), (R * 0.88, h + 0.32), (R, h + 0.42)]

    def gill_d(a, i, rr, z):
        w = ruffle * math.sin(rf_n * a + ph) if ruffle > 0 else 0.0
        if 0 < i < len(gprof) - 1:
            return (0.0, -0.07 * (math.sin(a * 46) ** 2) + w * (0.6 if i == len(gprof) - 2 else 0.0))
        return (0.0, w if i == len(gprof) - 1 else 0.0)
    b.lathe(gprof, Mc, seg=72 if tier != 'far' else 26, mi=2, dfunc=gill_d)
    cprof = [(R, h + 0.42), (R * 1.035, h + 0.52), (R * 1.04, h + 0.66)]
    nk = 12
    for k in range(1, nk + 1):
        t = k / nk
        rr = R * 1.04 * max(math.cos(t * math.pi / 2), 0.0) ** ex_r
        zz = h + 0.66 + Hc * math.sin(t * math.pi / 2) ** ex_z
        cprof.append((rr if k < nk else 0.0, zz))

    def cap_d(a, i, rr, z):
        w = 0.0
        if ruffle > 0 and i < 5:
            w = ruffle * math.sin(rf_n * a + ph) * (1.0 - i / 5.0)
        return (rr * 0.018 * math.sin(5 * a + ph * 2), w)
    b.lathe(cprof, Mc, seg=48 if tier != 'far' else 22, mi=1, dfunc=cap_d)

    def cap_point(t, a):
        rr = R * 1.04 * max(math.cos(t * math.pi / 2), 0.0) ** ex_r
        zz = h + 0.66 + Hc * math.sin(t * math.pi / 2) ** ex_z
        dt = 1e-3
        r2 = R * 1.04 * max(math.cos((t + dt) * math.pi / 2), 0.0) ** ex_r
        z2 = h + 0.66 + Hc * math.sin((t + dt) * math.pi / 2) ** ex_z
        tr, tz = r2 - rr, z2 - zz
        nr, nz = tz, -tr
        L = math.hypot(nr, nz) or 1.0
        p = Vector((rr * math.cos(a), rr * math.sin(a), zz))
        nn = Vector((nr / L * math.cos(a), nr / L * math.sin(a), nz / L))
        return p, nn
    # spots
    if rng.random() < 0.72:
        glowing = rng.random() < 0.18
        for k in range(rng.randint(6, 13)):
            t = rng.uniform(0.12, 0.78)
            a = rng.uniform(0, TAU)
            p, nn = cap_point(t, a)
            rs = rng.uniform(0.16, 0.42) * R / 4.0
            Ms = Mc @ frame_at(p, nn) @ S3(rs, rs * rng.uniform(0.8, 1.2), rs * 0.32)
            b.sphere(Ms, *((10, 5) if tier != 'far' else (6, 4)), mi=10 if glowing else 3)
    # porthole windows + brass rings
    wb = BM()
    wcol = rng.choice(['amber', 'amber', 'amber', 'amber', 'ice', 'ice', 'cyan', 'rose'])
    nwin = {'front': rng.randint(5, 8), 'mid': rng.randint(4, 7), 'far': rng.randint(2, 4)}[tier]
    used = []
    for k in range(nwin):
        for _try in range(12):
            if k < nwin * 0.7 or tier == 'far':
                a = a_face + rng.uniform(-1.25, 1.25)
            else:
                a = rng.uniform(0, TAU)
            z = rng.uniform(1.2, h - 0.5)
            if abs((a - a_face + math.pi) % TAU - math.pi) < 0.45 and z < 2.6:
                continue        # keep the door clear
            if all(math.hypot((a - ua) * r, z - uz) > 1.05 for ua, uz in used):
                break
        used.append((a, z))
        wr = rng.uniform(0.28, 0.42) if tier != 'far' else rng.uniform(0.3, 0.45)
        rad = prof_r(sprof, z) * (1.0 + 0.025 * math.sin(3 * a + ph)) + 0.05
        n = Vector((math.cos(a), math.sin(a), 0))
        p = base + n * rad + Vector((0, 0, z))
        F = frame_at(p, n)
        wb.disc(F, wr, 20, mi=0, rnd=rng.random() * (1.25 if tier == 'far' else 1.05))
        if tier != 'far':
            b.torus(F, wr + 0.04, 0.05, 16, 5, mi=7)
            # little window box under some windows
            if rng.random() < 0.3 and z < h - 1:
                Fb = F @ T((0, -wr - 0.16, 0.08))
                b.box(Fb, (wr * 2.0, 0.2, 0.22), radius=0.04, mi=5)
                for q in range(3):
                    b.ico(Fb @ T((-wr * 0.6 + q * wr * 0.6, 0.12, 0.12)) @ S3(0.16), sub=1, mi=9)
    # cap portholes (attic)
    if tier != 'far' and rng.random() < 0.45:
        a = a_face + rng.uniform(-0.6, 0.6)
        p, nn = cap_point(0.28, a)
        F = Mc @ frame_at(p + nn * 0.05, nn)
        wb.disc(F, 0.32, 18, rnd=rng.random() * 0.9)
        b.torus(F, 0.36, 0.05, 18, 6, mi=7)
    # round door + step + knob
    ad = a_face + rng.uniform(-0.15, 0.15)
    if upper:
        ad = a_face + math.pi      # (door hidden at the back of upper levels)
    nd = Vector((math.cos(ad), math.sin(ad), 0))
    dr = 0.82 if tier != 'far' else 0.7
    zc = 0.32 + dr
    radd = prof_r(sprof, 0.35) * 1.02 + 0.02
    Fd = frame_at(base + nd * radd + Vector((0, 0, zc)), nd)
    b.cyl(Fd @ T((0, 0, -0.9)), dr + 0.13, dr + 0.13, 0.86, seg=28, mi=6)
    b.cyl(Fd @ T((0, 0, -0.06)), dr, dr, 0.1, seg=28, mi=4)
    b.torus(Fd @ T((0, 0, 0.02)), dr + 0.06, 0.1, 28, 8, mi=6 if tier == 'far' else 5)
    if tier != 'far':
        b.sphere(Fd @ T((dr * 0.55, 0, 0.09)) @ S3(0.06), 8, 6, mi=7)
        Fs = frame_at(base + nd * (radd + 0.45) + Vector((0, 0, 0.3)), Vector((0, 0, 1)))
        b.box(Fs @ RZ(ad), (0.7, 1.7, 0.2), radius=0.06, mi=6)
        b.box(frame_at(base + nd * (radd + 0.9) + Vector((0, 0, 0.18)), Vector((0, 0, 1))) @ RZ(ad),
              (0.5, 1.9, 0.18), radius=0.05, mi=6)
    # outdoor spiral stair with railing to an upper door
    if not upper and (tier == 'front' and rng.random() < 0.5 or tier == 'mid' and rng.random() < 0.3):
        dirn = rng.choice((-1, 1))
        a_start = ad + dirn * 0.7
        nst = int((h - 0.8) / 0.25)
        da = dirn * 0.17
        rail = []
        posts = []
        for i in range(nst):
            a = a_start + da * i
            z = 0.25 + i * 0.25
            rr = prof_r(sprof, z) + 0.5
            n = Vector((math.cos(a), math.sin(a), 0))
            Fst = frame_at(base + n * rr + Vector((0, 0, z)), Vector((0, 0, 1))) @ RZ(a)
            b.box(Fst, (0.95, 0.38, 0.1), radius=0.03, segs=1, mi=5)
            ro = rr + 0.42
            rail.append(tuple(base + n * ro + Vector((0, 0, z + 0.85))))
            if i % 2 == 0:
                posts.append((tuple(base + n * ro + Vector((0, 0, z + 0.05))),
                              tuple(base + n * ro + Vector((0, 0, z + 0.85)))))
        b.tube(rail, 0.035, 6, mi=8)
        for p0, p1 in posts:
            b.tube([p0, p1], 0.025, 5, mi=8)
        a = a_start + da * nst
        z = 0.25 + nst * 0.25
        n = Vector((math.cos(a), math.sin(a), 0))
        rr = prof_r(sprof, z)
        b.box(frame_at(base + n * (rr + 0.55) + Vector((0, 0, z)), Vector((0, 0, 1))) @ RZ(a),
              (1.1, 1.0, 0.12), radius=0.03, mi=5)
        Fu = frame_at(base + n * (rr + 0.05) + Vector((0, 0, z + 0.75)), n)
        b.cyl(Fu, 0.5, 0.5, 0.08, seg=20, mi=4)
        b.torus(Fu @ T((0, 0, 0.06)), 0.54, 0.06, 20, 6, mi=5)
    # chimney on the cap
    if tier != 'far' and rng.random() < 0.6 or tier == 'far' and rng.random() < 0.3:
        a = a_face + math.pi + rng.uniform(-0.9, 0.9)
        p, nn = cap_point(rng.uniform(0.3, 0.5), a)
        Fc = Mc @ T(p)
        chp = [(0.3, -0.7), (0.3, 1.2), (0.38, 1.25), (0.38, 1.45), (0.27, 1.5), (0.27, 1.62), (0.2, 1.62)]
        b.lathe(chp, Fc, seg=10 if tier != 'far' else 6, mi=6)
        if tier != 'far' and not upper and lights_on:
            CHIMNEYS.append((Fc @ Vector((0, 0, 1.7)), s, lat))
    ob = b.obj('House%d' % idx, mats, coll, sharp=50)
    if len(wb.bm.faces):
        wo = wb.obj('HouseWin%d' % idx, [M.win[wcol if tier != 'far' else rng.choice(['far', 'farcool', 'farcool'])]],
                    coll, smooth=False, edge=False, shadow=False)
    else:
        wb.bm.free()
    HOUSE_PTS.append((base.x, base.y, R))
    info = dict(base=base, r=r, h=h, R=R, Hc=Hc, a_face=a_face, Mc=Mc, cap_point=cap_point, n_road=n_road)
    # door lamp + rim lights + wash
    if tier != 'far':
        lb = BM()
        al = ad + side * 0.0 + 0.55 * (1 if rng.random() < 0.5 else -1)
        nl = Vector((math.cos(al), math.sin(al), 0))
        rl = prof_r(sprof, 2.1) + 0.05
        lp = base + nl * (rl + 0.32) + Vector((0, 0, 2.15))
        lb.tube([tuple(base + nl * rl + Vector((0, 0, 2.5))), tuple(base + nl * (rl + 0.32) + Vector((0, 0, 2.5)))],
                0.02, 5, mi=1)
        lb.box(T(lp) @ RZ(al), (0.2, 0.2, 0.28), radius=0.03, mi=0)
        warm_lamp = rng.random() < 0.8
        lo = lb.obj('DoorLamp%d' % idx, [M.lamp_warm if warm_lamp else M.lamp_cyan, M.iron], coll,
                    smooth=True, edge=False, shadow=False)
        if lights_on:
            pk.lights.point(tuple(lp + nl * 0.25), (1.0, 0.6, 0.28) if warm_lamp else (0.35, 0.85, 1.0),
                            45.0 if tier == 'front' else 30.0, radius=0.12, shadow=False,
                            name='DoorLampL%d' % idx, collection=coll, volume=0.3)
        if rng.random() < (0.55 if tier == 'front' else 0.4):
            # scalloped fairy lights around the front half of the cap rim
            bulbs = BM()
            span = rng.uniform(1.6, 2.6)
            na = 26
            pts = []
            for k in range(na + 1):
                a = a_face - span / 2 + span * k / na
                frac = (k % 4) / 4.0
                sag = 0.35 * math.sin(math.pi * frac)
                p = Vector((R * 1.02 * math.cos(a), R * 1.02 * math.sin(a), h + 0.35 - sag))
                pts.append(p)
            ci = rng.randrange(5)
            for k, p in enumerate(pts):
                bulbs.sphere(Mc @ T(p) @ S3(0.055, 0.055, 0.07), 8, 5,
                             mi=(ci + (k % 2 if rng.random() < 0.5 else 0)) % 5)
            bulbs.obj('RimLights%d' % idx, M.bulbs, coll, smooth=True, edge=False, shadow=False)
        if lights_on and not upper:
            wc = WASHES[idx % len(WASHES)]
            fp = base + n_road * (R + 1.0) + Vector((0, 0, 0.3))
            tp = base + n_road * (r * 0.5) + Vector((0, 0, h * 0.85))
            pk.lights.spot(tuple(fp), tuple(tp), wc, 1500.0 if tier == 'front' else 2200.0, angle_deg=95, blend=0.9, radius=0.3,
                           shadow=False, name='Wash%d' % idx, collection=coll, volume=0.0)
    return info


def lantern_mat(name='MH_SkyLantern'):
    """Paper sky lantern lit from inside: warm, brightest at the open bottom and the flame,
    fading toward the top, with faint vertical paper ribs."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    k = pk.maprange(nt, z, 0.0, 0.46, 1.6, 0.45, interp='SMOOTHSTEP')
    ang = pk.math_(nt, 'ARCTAN2', y, x)
    rib = pk.math_(nt, 'ADD', 0.88, pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', ang, 4.0))), 0.12))
    k = pk.math_(nt, 'MULTIPLY', k, rib)
    col = pk.mix_col(nt, pk.maprange(nt, z, 0.0, 0.45), (1.0, 0.52, 0.14), (1.0, 0.3, 0.08))
    p = pk._principled(nt, base=(0.5, 0.2, 0.06), rough=0.6, emit=col, emit_strength=pk.math_(nt, 'MULTIPLY', k, SKY_LANTERN_K),
                       spec=0.2)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.5, 0.2, 0.06), rough=0.6, emit=(1.0, 0.45, 0.12), emit_strength=SKY_LANTERN_K)
    return m


SKY_LANTERN_K = 4.0


def sky_lanterns(path, coll, n=22, seed=91):
    """Paper lanterns released from the village, drifting up into the night over the hollow
    (the scroll hook: warm lights rising against the Milky Way). Each rises 0.25 to 0.6 m/s
    with a slow sway; small and far, so they read as lanterns, not orbs."""
    rng = random.Random(seed)
    b = BM()
    b.lathe([(0.0, -0.01), (0.12, 0.0), (0.155, 0.1), (0.19, 0.34), (0.175, 0.45), (0.0, 0.47)], Matrix.Identity(4),
            seg=16, mi=0)
    src = b.obj('SkyLanternSrc', [lantern_mat()], coll, edge=False, shadow=False)
    src.hide_render = True
    src.hide_viewport = True
    src['pk_noexport'] = True
    root = bpy.data.objects.new('SkyLanterns', None)
    coll.objects.link(root)
    k = 0
    tries = 0
    while k < n and tries < 2000:
        tries += 1
        u = (k + rng.random()) / n                 # stratified along the hollow: no clumps
        sl = 74.0 + 186.0 * u ** 1.2               # all beyond where the car stops (s 60 at 14 s)
        d = sl - 20.0
        lat = rng.uniform(-0.3, 0.3) * d + rng.uniform(-6, 6)
        el = rng.uniform(10.0, 30.0)
        h = 1.2 + d * math.tan(math.radians(el))
        p0 = path.offset(sl, lat, h)
        if (p0 - Vector((GIANT_X, GIANT_Y, p0.z))).length < 26.0 and h < GIANT_H + 18.0:
            continue
        o = bpy.data.objects.new('SkyLantern_%d' % k, src.data)
        coll.objects.link(o)
        o.parent = root
        sc_ = rng.uniform(0.9, 1.3) * (1.0 + d / 150.0)
        o.scale = (sc_, sc_, sc_)
        o.rotation_euler = (math.radians(rng.uniform(-6, 6)), math.radians(rng.uniform(-6, 6)), rng.uniform(0, TAU))
        v = rng.uniform(0.25, 0.6)
        wx, wy = rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12)
        for f in (0, 120, 240, 338):
            t = (f - 1) / 24.0
            o.location = p0 + Vector((wx * t + 0.25 * math.sin(t * 0.7 + k), wy * t, v * t))
            o.keyframe_insert('location', frame=f)
        k += 1
    pk._set_interp(root, 'LINEAR')
    for o in root.children:
        pk._set_interp(o, 'LINEAR')
    return root


def lantern_post(path, s, lat, coll, idx, warm=True, light=True):
    base = place(path, s, lat, 0.0)
    if abs(lat) < 6:
        base.z = 0.11
    n_road = toward_road(path, s, lat)
    t = path.tangent(s)
    b = BM()
    H = 3.3
    b.box(T(base + Vector((0, 0, H / 2))) @ RZ(math.atan2(t.y, t.x)), (0.16, 0.16, H), radius=0.03, mi=0)
    b.box(T(base + Vector((0, 0, 0.12))), (0.36, 0.36, 0.24), radius=0.05, mi=2)
    # curved iron arm toward the road
    arm = []
    for i in range(14):
        u = i / 13
        arm.append(tuple(base + n_road * (0.08 + 0.85 * u) + Vector((0, 0, H - 0.3 + 0.35 * math.sin(math.pi * u * 0.8)))))
    b.tube(arm, 0.03, 6, mi=1)
    tip = base + n_road * 0.93 + Vector((0, 0, H - 0.05))
    b.tube([tuple(tip + Vector((0, 0, 0.12))), tuple(tip - Vector((0, 0, 0.15)))], 0.012, 4, mi=1)
    lc = tip - Vector((0, 0, 0.42))
    # lantern cage: 4 bars + roof + base
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        o = Vector((math.cos(a), math.sin(a), 0)) * 0.13
        b.tube([tuple(lc + o + Vector((0, 0, -0.2))), tuple(lc + o + Vector((0, 0, 0.2)))], 0.012, 4, mi=1)
    b.lathe([(0.2, 0.2), (0.21, 0.23), (0.05, 0.36), (0.0, 0.38)], T(lc), seg=12, mi=1)
    b.lathe([(0.0, -0.26), (0.16, -0.22), (0.17, -0.2)], T(lc), seg=12, mi=1)
    b.obj('LanternPost%d' % idx, [M.wood, M.iron, M.stone], coll, sharp=45)
    g = BM()
    g.cyl(T(lc + Vector((0, 0, -0.2))), 0.12, 0.12, 0.4, seg=12)
    g.obj('LanternGlass%d' % idx, [M.lamp_warm if warm else M.lamp_cyan], coll, edge=False, shadow=False)
    if light:
        col = (1.0, 0.58, 0.25) if warm else (0.3, 0.8, 1.0)
        sp = pk.lights.spot(tuple(lc + Vector((0, 0, -0.05))), tuple(lc + Vector((0, 0, -4.0)) + n_road * 1.2), col,
                            900.0, angle_deg=130, blend=0.8, radius=0.1, shadow=s < 75, name='LanternL%d' % idx,
                            collection=coll, volume=0.25)
        if s < 75:
            # web edition only: the shadowed spot's own lantern base blocks its brightest 45 deg
            # under the post in the film; shadowless in three.js it painted a full 900 W pool on
            # the lane (+80 % in the near-road band at 4 s). The LanternGlow point stays.
            sp['pk_noexport'] = True
        pk.lights.point(tuple(lc + n_road * 0.1), col, 30.0, radius=0.08, shadow=False,
                        name='LanternGlow%d' % idx, collection=coll, volume=0.5)


def stump_inn(path, coll):
    """The warm hero: a huge cut stump turned inn."""
    s, lat = INN_S, INN_LAT
    c = place(path, s, lat, -0.3)
    n_road = toward_road(path, s, lat)
    d = (n_road - path.tangent(s) * 0.85).normalized()
    a_face = math.atan2(d.y, d.x)
    R, Hs = 6.2, 6.8
    b = BM()
    mats = [M.stump, M.rings, M.plaster, M.wood, M.shingle, M.stone, M.iron, M.brass, M.wood_light,
            M.doors[0], M.leaf]
    W = T(c)
    prof = [(R * 1.42, -0.2), (R * 1.25, 0.35), (R * 1.1, 1.0), (R * 1.03, 1.9)]
    for k in range(9):
        z = 2.4 + (Hs - 2.4) * k / 8
        prof.append((R * (1.0 - 0.015 * math.sin(k)), z))
    prof.append((R * 0.985, Hs + 0.12))

    def bark_d(a, i, rr, z):
        g = 0.085 * abs(math.sin(a * 19 + 1.5 * math.sin(z * 0.6))) + 0.03 * math.sin(a * 53 + z * 1.3)
        return (rr * g - 0.05 * rr * (1 if i == 0 else 0), 0.0)
    b.lathe(prof, W, seg=128, mi=0, dfunc=bark_d)

    def bark_max(a_c, half, z0, z1):
        best = 0.0
        for qa in range(13):
            a = a_c - half + 2 * half * qa / 12
            for qz in range(9):
                z = z0 + (z1 - z0) * qz / 8
                rr = prof_r(prof, z)
                best = max(best, rr + bark_d(a, 1, rr, z)[0])
        return best

    def rad_max(z0, z1):
        return max(prof_r(prof, z0 + (z1 - z0) * q / 6.0) for q in range(7)) * 1.055 + 0.06
    Rf = rad_max(0.2, 3.2)
    # cut top (rings) and a rim
    b.lathe([(R * 1.0, Hs + 0.12), (R * 0.97, Hs + 0.2), (0.0, Hs + 0.22)], W, seg=64, mi=1)
    # roots
    for k in range(8):
        a = a_face + 0.4 + k * TAU / 8 + 0.15 * math.sin(k * 3.1)
        d = Vector((math.cos(a), math.sin(a), 0))
        pts, rad = [], []
        for i in range(10):
            u = i / 9
            rr = R * (0.95 + 0.75 * u)
            z = 1.6 * (1 - u) ** 1.6 - 0.25
            pts.append(tuple(c + d * rr + Vector((0, 0, z))))
            rad.append(0.95 * (1 - u) ** 0.8 + 0.12)
        b.tube(pts, seg=10, radii=rad, mi=0)
    # porch deck and steps facing the road
    nf = Vector((math.cos(a_face), math.sin(a_face), 0))
    tf = Vector((-nf.y, nf.x, 0))
    Fp = frame_at(c + nf * (Rf + 1.0) + Vector((0, 0, 0.55)), Vector((0, 0, 1))) @ RZ(a_face)
    b.box(Fp, (3.2, 5.4, 0.3), radius=0.08, mi=8)
    for k in range(2):
        b.box(frame_at(c + nf * (Rf + 2.85 + 0.42 * k) + Vector((0, 0, 0.32 - 0.16 * k)), Vector((0, 0, 1))) @ RZ(a_face),
              (0.45, 2.2, 0.16), radius=0.04, mi=8)
    # porch roof on two posts
    for sgn in (-1, 1):
        p0 = c + nf * (Rf + 2.25) + tf * sgn * 2.3
        b.box(T(p0 + Vector((0, 0, 1.95))), (0.2, 0.2, 2.8), radius=0.04, mi=3)
    b.box(frame_at(c + nf * (Rf + 1.2) + Vector((0, 0, 3.45)), Vector((0, 0, 1))) @ RZ(a_face) @
          Matrix.Rotation(math.radians(-14), 4, 'Y'), (3.2, 5.8, 0.18), radius=0.06, mi=4)
    # big round-topped door in a deep stone surround
    zd = 0.7
    Fd = frame_at(c + nf * Rf + Vector((0, 0, zd)), nf)
    b.arch_panel(Fd, 1.7, 2.6, mi=9)
    b.box(Fd @ T((0, 1.3, -0.79)), (2.3, 2.95, 1.5), radius=0.08, mi=5)
    b.torus(Fd @ T((0, 1.75, 0.08)) @ S3(1.0, 1.0, 1.0), 0.95, 0.12, 20, 8, mi=5, a0=0, a1=math.pi)
    b.sphere(Fd @ T((0.5, 1.2, 0.1)) @ S3(0.07), 8, 6, mi=7)
    # windows: ground floor arches and upper row, mostly toward the road
    wb = BM()
    for row, (z0, wh, ww, angs) in enumerate(((1.25, 2.1, 1.3, (-0.62, -0.36, 0.36, 0.62, -1.0, 1.0)),
                                              (4.05, 1.95, 1.2, (-0.75, -0.45, -0.15, 0.15, 0.45, 0.75, -1.1, 1.1)))):
        for a_off in angs:
            a = a_face + a_off
            n = Vector((math.cos(a), math.sin(a), 0))
            # the panel sits just outside the highest bark ridge over its whole span (the ridges
            # used to cut through the glass and read as broken panes), the casing fills the gap
            rad = bark_max(a, (ww / 2 + 0.2) / R, z0, z0 + wh) + 0.05
            F = frame_at(c + n * rad + Vector((0, 0, z0)), n)
            wb.arch_panel(F, ww, wh, rnd=random.Random(int(a_off * 100) + row).random() * 0.95)
            # deep casing into the bark, sill
            b.box(F @ T((0, wh / 2, -0.62)), (ww + 0.3, wh + 0.25, 1.2), radius=0.06, mi=3)
            b.box(F @ T((0, -0.1, 0.1)), (ww + 0.5, 0.16, 0.36), radius=0.04, mi=3)
            if row == 0 and abs(a_off) < 0.7:
                b.box(F @ T((0, -0.28, 0.24)), (ww + 0.2, 0.26, 0.3), radius=0.05, mi=3)
                for q in range(4):
                    b.ico(F @ T((-ww / 2 + 0.1 + q * ww / 3.3, -0.1, 0.32)) @ S3(0.2), sub=1, mi=10)
    wb.obj('InnWindows', [M.win['hero']], coll, smooth=False, edge=False, shadow=False)
    # balcony deck ring + railing
    b.lathe([(R * 0.7, Hs + 0.22), (R + 0.9, Hs + 0.22), (R + 0.95, Hs + 0.32), (R + 0.9, Hs + 0.42),
             (R * 0.7, Hs + 0.42)], W, seg=64, mi=8)
    rail = []
    for k in range(73):
        a = TAU * k / 72
        rail.append(tuple(c + Vector((math.cos(a), math.sin(a), 0)) * (R + 0.8) + Vector((0, 0, Hs + 1.4))))
        if k % 3 == 0 and k < 72:
            p = c + Vector((math.cos(a), math.sin(a), 0)) * (R + 0.8)
            b.tube([tuple(p + Vector((0, 0, Hs + 0.42))), tuple(p + Vector((0, 0, Hs + 1.4)))], 0.045, 6, mi=3)
    b.tube(rail, 0.07, 8, mi=3)
    # upper timbered room + conical shingle roof
    Ru = R * 0.72
    b.lathe([(Ru, Hs + 0.4), (Ru, Hs + 3.4)], W, seg=48, mi=2)
    for k in range(18):
        a = TAU * k / 18
        n = Vector((math.cos(a), math.sin(a), 0))
        b.box(frame_at(c + n * (Ru + 0.05) + Vector((0, 0, Hs + 1.9)), n), (0.22, 3.0, 0.14), radius=0.03, mi=3)
    b.torus(T(c + Vector((0, 0, Hs + 3.35))), Ru + 0.05, 0.12, 48, 6, mi=3)
    up = BM()
    for k, a_off in enumerate((-0.85, -0.42, 0.0, 0.42, 0.85, 2.2, -2.2, math.pi)):
        a = a_face + a_off + 0.21
        n = Vector((math.cos(a), math.sin(a), 0))
        F = frame_at(c + n * (Ru + 0.13) + Vector((0, 0, Hs + 1.2)), n)
        up.arch_panel(F, 0.95, 1.5, rnd=(k * 0.37) % 0.95)
        b.box(F @ T((0, 0.75, -0.11)), (1.15, 1.75, 0.16), radius=0.04, mi=3)
    up.obj('InnWindowsUp', [M.win['hero']], coll, smooth=False, edge=False, shadow=False)
    rprof = [(Ru + 1.3, Hs + 3.2), (Ru + 1.35, Hs + 3.45), (Ru + 0.6, Hs + 4.6), (2.2, Hs + 6.4),
             (0.9, Hs + 7.6), (0.25, Hs + 8.4), (0.0, Hs + 8.55)]
    b.lathe(rprof, W, seg=64, mi=4, dfunc=lambda a, i, rr, z: (rr * 0.012 * math.sin(7 * a), 0.0))
    # stone chimney through the roof (back-left)
    ach = a_face + 2.4
    nch = Vector((math.cos(ach), math.sin(ach), 0))
    chb = c + nch * (Ru - 0.4)
    b.box(T(chb + Vector((0, 0, Hs + 4.3))) @ RZ(ach), (1.0, 1.0, 7.6), radius=0.12, mi=5)
    b.box(T(chb + Vector((0, 0, Hs + 8.15))) @ RZ(ach), (1.25, 1.25, 0.3), radius=0.06, mi=5)
    b.cyl(T(chb + Vector((0, 0, Hs + 8.25))), 0.28, 0.24, 0.55, seg=14, mi=5)
    smoke_src = chb + Vector((0, 0, Hs + 8.6))
    pk.lights.point(tuple(smoke_src + Vector((0.3, 0.3, 1.2))), (1.0, 0.5, 0.2), 260.0, radius=0.4, shadow=False,
                    name='ChimneyGlow', collection=coll, volume=0.2)
    # firewood stack and barrels beside the porch
    side_p = c + nf * (Rf + 1.0) + tf * 4.2
    for i in range(4):
        for j in range(5 - i):
            p = side_p + tf * (j * 0.34 - 0.7 + i * 0.17) + Vector((0, 0, 0.18 + i * 0.3))
            b.cyl(frame_at(p - nf * 0.6, nf), 0.15, 0.15, 1.2, seg=10, mi=8)
    b.obj('StumpInn', mats, coll, sharp=55)
    # hanging lanterns on the balcony + porch lanterns
    lb = BM()
    for k in range(9):
        a = a_face + (k - 4) * 0.33
        n = Vector((math.cos(a), math.sin(a), 0))
        p = c + n * (R + 0.85) + Vector((0, 0, Hs - 0.1))
        lb.cyl(T(p), 0.12, 0.1, 0.32, seg=10)
    for sgn in (-1, 1):
        p = c + nf * (Rf + 2.25) + tf * sgn * 2.3 + Vector((0, 0, 2.95))
        lb.cyl(T(p + nf * 0.2), 0.14, 0.12, 0.38, seg=10)
        pk.lights.point(tuple(p + nf * 0.6), (1.0, 0.55, 0.22), 100.0, radius=0.15, shadow=True,
                        name='InnPorchL', collection=coll, volume=0.4)
    lb.obj('InnLanterns', [M.lamp_warm], coll, edge=False, shadow=False)
    # warm light: uplights on the bark, window spill onto the lane, balcony glow
    for a_off in (-1.0, -0.35, 0.35, 1.0):
        a = a_face + a_off
        n = Vector((math.cos(a), math.sin(a), 0))
        pk.lights.spot(tuple(c + n * (R + 2.2) + Vector((0, 0, 0.3))), tuple(c + n * (R - 0.5) + Vector((0, 0, 6.5))),
                       (1.0, 0.5, 0.18), 2600.0, angle_deg=70, blend=0.85, radius=0.25, shadow=False,
                       name='InnUp', collection=coll, volume=0.0)
    sp = pk.lights.spot(tuple(c + nf * (Rf + 0.6) + Vector((0, 0, 3.0))), tuple(c + nf * (Rf + 8.0)),
                        (1.0, 0.52, 0.2), 1600.0, angle_deg=110, blend=1.0, radius=1.0, shadow=False,
                        name='InnSpill', collection=coll, volume=0.1, specular=0.0)
    pk.lights.point(tuple(c + nf * (R + 1.6) + Vector((0, 0, Hs + 1.2))), (1.0, 0.55, 0.22), 500.0, radius=0.6,
                    shadow=False, name='InnBalcony', collection=coll, volume=0.6)
    pk.lights.point(tuple(c + nf * (Ru + 2.0) + Vector((0, 0, Hs + 3.6))), (1.0, 0.5, 0.2), 450.0, radius=0.8,
                    shadow=False, name='InnRoofGlow', collection=coll, volume=0.3)
    return dict(c=c, nf=nf, tf=tf, R=R, Hs=Hs, smoke=smoke_src)


def chimney_smoke(src, coll, cam, n=12, seed=3):
    """Slow rising smoke puffs from the inn chimney: camera-facing soft cards that grow,
    drift with the breeze and fade, looping over the clip (keyed every 2 frames)."""
    rng = random.Random(seed)
    me = bpy.data.meshes.new('SmokeCard')
    me.from_pydata([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [], [(0, 1, 2, 3)])
    uvl = me.uv_layers.new(name='UVMap')
    uvl.data.foreach_set('uv', [0, 0, 1, 0, 1, 1, 0, 1])
    me.materials.append(M.smoke)
    wind = Vector((0.4, 0.6, 0.0))
    period = 8.0
    for i in range(n):
        o = bpy.data.objects.new('Smoke%d' % i, me)
        coll.objects.link(o)
        o['pk_noexport'] = True
        o.visible_shadow = False
        c = o.constraints.new('TRACK_TO')
        c.target = cam
        c.track_axis = 'TRACK_Z'
        c.up_axis = 'UP_Y'
        ph = i / n
        jx, jy = rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3)
        for f in range(0, 338, 2):
            t = (f - 1) / 24.0
            u = ((t / period) + ph) % 1.0
            rise = 9.0 * u
            p = src + Vector((jx * u, jy * u, rise)) + wind * (rise * 0.9) + \
                Vector((math.sin(u * 6 + i) * 0.4, math.cos(u * 5 + i) * 0.4, 0))
            o.location = p
            k = 0.55 + 2.2 * u
            o.scale = (k, k, k)
            a = 0.0 if (u > 0.95 or u < 0.02) else max(0.0, (1.0 - u) ** 1.3 * min(1.0, (u - 0.02) * 8.0))
            o.color = (1, 1, 1, a)
            o.keyframe_insert('location', frame=f)
            o.keyframe_insert('scale', frame=f)
            o.keyframe_insert('color', frame=f)


def bell_tower(path, coll):
    """Second landmark: a very tall slender mushroom with a spiral stair, a ring balcony and a
    cyan lantern room under a violet bell cap with glowing spots."""
    s, lat = TOWER_S, TOWER_LAT
    c = place(path, s, lat, -0.3)
    n_road = toward_road(path, s, lat)
    a_face = math.atan2(n_road.y, n_road.x)
    H = 16.5
    b = BM()
    mats = [M.stalks[1], cap_mat('MH_TowerCap', (0.2, 0.06, 0.45), coat=0.6), M.gill, M.spot_glow, M.wood,
            M.brass, M.iron, M.stone, M.doors[1]]
    sprof = [(2.6, -0.2), (2.25, 0.4), (1.95, 1.2), (1.75, 3.0), (1.62, 7.0), (1.55, 11.0), (1.5, 14.0),
             (1.6, H - 0.6), (1.8, H)]
    b.lathe(sprof, T(c), seg=48, mi=0, dfunc=lambda a, i, rr, z: (rr * 0.02 * math.sin(4 * a + z * 0.3), 0.0))
    # balcony deck + lantern room + cap
    zb = H - 2.1
    b.lathe([(1.4, zb), (3.3, zb), (3.38, zb + 0.12), (3.3, zb + 0.24), (1.4, zb + 0.24)], T(c), seg=48, mi=4)
    b.lathe([(2.35, zb + 0.24), (2.35, zb + 2.1)], T(c), seg=32, mi=6)
    rail = [tuple(c + Vector((math.cos(TAU * k / 64), math.sin(TAU * k / 64), 0)) * 3.2 + Vector((0, 0, zb + 1.2)))
            for k in range(65)]
    b.tube(rail, 0.05, 6, mi=5)
    for k in range(0, 64, 4):
        p = c + Vector((math.cos(TAU * k / 64), math.sin(TAU * k / 64), 0)) * 3.2
        b.tube([tuple(p + Vector((0, 0, zb + 0.24))), tuple(p + Vector((0, 0, zb + 1.2)))], 0.03, 5, mi=6)
    lw = BM()
    for k in range(10):
        a = TAU * k / 10
        n = Vector((math.cos(a), math.sin(a), 0))
        F = frame_at(c + n * 2.38 + Vector((0, 0, zb + 0.45)), n)
        lw.arch_panel(F, 0.95, 1.45, rnd=k * 0.09)
    lw.obj('TowerLantern', [M.win['tower']], coll, smooth=False, edge=False, shadow=False)
    Rb = 4.6
    zc = H + 0.2
    b.lathe([(1.4, zc - 0.3), (2.6, zc - 0.05), (Rb * 0.8, zc + 0.15), (Rb, zc + 0.3)], T(c), seg=72, mi=2,
            dfunc=lambda a, i, rr, z: (0.0, -0.06 * math.sin(a * 36) ** 2 if 0 < i < 3 else 0.0))
    cprof = [(Rb, zc + 0.3), (Rb * 1.04, zc + 0.45), (Rb * 1.0, zc + 0.75), (Rb * 0.88, zc + 1.6),
             (Rb * 0.7, zc + 2.8), (Rb * 0.5, zc + 3.9), (Rb * 0.3, zc + 4.7), (Rb * 0.12, zc + 5.15), (0.0, zc + 5.3)]
    b.lathe(cprof, T(c), seg=72, mi=1)
    rng = random.Random(77)
    for k in range(26):
        t = rng.uniform(0.08, 0.85)
        a = rng.uniform(0, TAU)
        # interpolate along cprof
        fi = t * (len(cprof) - 1)
        i0 = int(fi)
        f = fi - i0
        r0, z0 = cprof[i0]
        r1, z1 = cprof[min(i0 + 1, len(cprof) - 1)]
        rr, zz = r0 + (r1 - r0) * f, z0 + (z1 - z0) * f
        nr, nz = (z1 - z0), -(r1 - r0)
        L = math.hypot(nr, nz) or 1
        p = c + Vector((rr * math.cos(a), rr * math.sin(a), zz))
        nn = Vector((nr / L * math.cos(a), nr / L * math.sin(a), nz / L))
        sz = rng.uniform(0.18, 0.42)
        b.sphere(frame_at(p, nn) @ S3(sz, sz, sz * 0.35), 12, 6, mi=3)
    # spiral stair around the stalk
    nst = int((zb - 0.4) / 0.24)
    rail, posts = [], []
    a0 = a_face + 1.2
    for i in range(nst):
        a = a0 + 0.2 * i
        z = 0.3 + i * 0.24
        rr = prof_r(sprof, z) + 0.55
        n = Vector((math.cos(a), math.sin(a), 0))
        b.box(frame_at(c + n * rr + Vector((0, 0, z)), Vector((0, 0, 1))) @ RZ(a), (1.0, 0.4, 0.1), radius=0.03, mi=4)
        ro = rr + 0.45
        rail.append(tuple(c + n * ro + Vector((0, 0, z + 0.9))))
        if i % 3 == 0:
            posts.append((tuple(c + n * ro + Vector((0, 0, z + 0.05))), tuple(c + n * ro + Vector((0, 0, z + 0.9)))))
    b.tube(rail, 0.035, 6, mi=6)
    for p0, p1 in posts:
        b.tube([p0, p1], 0.022, 5, mi=6)
    # door + portholes along the stair
    nd = Vector((math.cos(a_face), math.sin(a_face), 0))
    Fd = frame_at(c + nd * (prof_r(sprof, 0.6) + 0.02) + Vector((0, 0, 1.35)), nd)
    b.cyl(Fd @ T((0, 0, -0.9)), 1.0, 1.0, 0.86, seg=28, mi=7)
    b.cyl(Fd @ T((0, 0, -0.05)), 0.85, 0.85, 0.1, seg=28, mi=8)
    b.torus(Fd @ T((0, 0, 0.02)), 0.93, 0.11, 28, 8, mi=7)
    wb = BM()
    for i in range(3, nst, 7):
        a = a0 + 0.2 * i + 0.5
        z = 0.3 + i * 0.24 + 1.3
        n = Vector((math.cos(a), math.sin(a), 0))
        F = frame_at(c + n * (prof_r(sprof, z) + 0.06) + Vector((0, 0, z)), n)
        wb.disc(F, 0.32, 18, rnd=(i * 0.13) % 0.95)
        b.torus(F, 0.36, 0.05, 18, 6, mi=5)
    wb.obj('TowerWin', [M.win['amber']], coll, smooth=False, edge=False, shadow=False)
    b.obj('BellTower', mats, coll, sharp=55)
    pk.lights.point(tuple(c + Vector((0, 0, zb + 1.2))), (0.3, 0.9, 1.0), 900.0, radius=1.2, shadow=False,
                    name='TowerLantern', collection=coll, volume=0.6)
    for da, col in ((-0.6, MAGENTA), (0.6, COBALT)):
        a = a_face + da
        n = Vector((math.cos(a), math.sin(a), 0))
        pk.lights.spot(tuple(c + n * 4.5 + Vector((0, 0, 0.3))), tuple(c + n * 1.0 + Vector((0, 0, 12.0))),
                       col, 3500.0, angle_deg=40, blend=0.8, radius=0.3, shadow=False, name='TowerUp',
                       collection=coll, volume=0.0)
    pk.lights.point(tuple(c + nd * 3.0 + Vector((0, 0, 2.3))), (1.0, 0.58, 0.26), 120.0, radius=0.2, shadow=False,
                    name='TowerDoorL', collection=coll, volume=0.3)
    return c


def giant_bloom(path, coll):
    """The Elder Bloom: the hero landmark at the vanishing point. A colossal old mushroom
    (stalk 40 m, cap 42 m across) with a village wound up its stalk: a spiral of amber
    portholes and a stair, a balcony ring, warm-gold glowing gills under a plum cap with
    pale glowing spots, and lantern strings hanging from the rim."""
    c = place(path, GIANT_S, GIANT_LAT, -0.6)
    n_road = toward_road(path, GIANT_S, GIANT_LAT)
    a_road = math.atan2(n_road.y, n_road.x)
    h = GIANT_H
    R = 21.0
    Hc = 13.0
    rng = random.Random(404)
    gill = gill_glow_mat('MH_GiantGill', (1.0, 0.5, 0.13), 1.5, (c.x, c.y))
    capm = cap_mat('MH_GiantCap', (0.3, 0.05, 0.36), coat=0.5)
    mats = [M.stalks[0], capm, gill, M.spot_glow, M.wood, M.brass, M.iron, M.stone, M.doors[2], M.spot]
    b = BM()
    sprof = [(9.5, -0.6), (7.6, 0.6), (6.2, 2.0), (5.3, 5.0), (4.8, 12.0), (4.5, 22.0), (4.4, 30.0),
             (4.7, 36.0), (5.4, h - 1.0), (6.2, h)]

    def stalk_d(a, i, rr, z):
        return (rr * (0.035 * math.sin(7 * a + z * 0.15) + 0.015 * math.sin(23 * a + z * 0.4)), 0.0)
    b.lathe(sprof, T(c), seg=72, mi=0, dfunc=stalk_d)
    # roots (none toward the lane)
    for k in range(9):
        a = a_road + 0.6 + k * (TAU - 1.2) / 8
        d = Vector((math.cos(a), math.sin(a), 0))
        pts, rad = [], []
        for i in range(9):
            u = i / 8
            pts.append(tuple(c + d * (7.0 + 9.0 * u) + Vector((0, 0, 2.6 * (1 - u) ** 1.6 - 0.5))))
            rad.append(1.6 * (1 - u) ** 0.8 + 0.2)
        b.tube(pts, seg=10, radii=rad, mi=0)
    # glowing gills under the cap
    gprof = [(5.6, h - 0.6), (7.5, h + 0.4), (R * 0.55, h + 1.6), (R * 0.85, h + 2.3), (R, h + 2.7)]
    b.lathe(gprof, T(c), seg=180, mi=2,
            dfunc=lambda a, i, rr, z: (0.0, -0.35 * math.sin(a * 90) ** 2 if 0 < i < len(gprof) - 1 else 0.0))
    # cap: thick rim, gently ruffled, broad dome
    cprof = [(R, h + 2.7), (R * 1.03, h + 3.1), (R * 1.04, h + 3.7)]
    for k in range(1, 13):
        t = k / 12
        cprof.append((R * 1.04 * max(math.cos(t * math.pi / 2), 0.0) ** 0.7 if k < 12 else 0.0,
                      h + 3.7 + Hc * math.sin(t * math.pi / 2) ** 0.9))

    def cap_d(a, i, rr, z):
        w = 0.5 * math.sin(6 * a + 0.7) + 0.25 * math.sin(13 * a)
        return (0.0, w * max(0.0, 1.0 - i / 6.0))
    b.lathe(cprof, T(c), seg=120, mi=1, dfunc=cap_d)

    def cap_point(t, a):
        fi = t * (len(cprof) - 1)
        i0 = min(int(fi), len(cprof) - 2)
        f = fi - i0
        (r0, z0), (r1, z1) = cprof[i0], cprof[i0 + 1]
        rr, zz = r0 + (r1 - r0) * f, z0 + (z1 - z0) * f
        nr, nz = (z1 - z0), -(r1 - r0)
        L = math.hypot(nr, nz) or 1.0
        return (c + Vector((rr * math.cos(a), rr * math.sin(a), zz)),
                Vector((nr / L * math.cos(a), nr / L * math.sin(a), nz / L)))
    for k in range(70):
        t = rng.uniform(0.2, 0.92)
        a = rng.uniform(0, TAU)
        p, nn = cap_point(t, a)
        sz = rng.uniform(0.6, 1.9) * (1.2 - 0.5 * t)
        b.sphere(frame_at(p, nn) @ S3(sz, sz * rng.uniform(0.8, 1.2), sz * 0.3), 10, 5,
                 mi=3 if rng.random() < 0.7 else 9)
    # balcony ring with railing two thirds up, and a lantern room below the cap
    zb = 27.0
    rb = prof_r(sprof, zb)
    b.lathe([(rb - 0.2, zb), (rb + 2.6, zb), (rb + 2.7, zb + 0.2), (rb + 2.6, zb + 0.4), (rb - 0.2, zb + 0.4)],
            T(c), seg=64, mi=4)
    rail = [tuple(c + Vector((math.cos(TAU * k / 80), math.sin(TAU * k / 80), 0)) * (rb + 2.4) +
                  Vector((0, 0, zb + 1.4))) for k in range(81)]
    b.tube(rail, 0.08, 6, mi=6)
    for k in range(0, 80, 4):
        p = c + Vector((math.cos(TAU * k / 80), math.sin(TAU * k / 80), 0)) * (rb + 2.4)
        b.tube([tuple(p + Vector((0, 0, zb + 0.4))), tuple(p + Vector((0, 0, zb + 1.4)))], 0.05, 5, mi=6)
    # spiral stair and porthole windows wound up the stalk
    wb = BM()
    nst = 150
    rail = []
    for i in range(nst):
        a = a_road - 1.0 + 0.11 * i
        z = 0.6 + i * 0.25
        if z > h - 3.0:
            break
        rr = prof_r(sprof, z) + 0.7
        n = Vector((math.cos(a), math.sin(a), 0))
        b.box(frame_at(c + n * rr + Vector((0, 0, z)), Vector((0, 0, 1))) @ RZ(a), (1.4, 0.5, 0.14),
              radius=0.04, segs=1, mi=4)
        rail.append(tuple(c + n * (rr + 0.65) + Vector((0, 0, z + 1.0))))
        if i % 6 == 3:
            zw = z + 1.7
            aw = a + 0.35
            nw = Vector((math.cos(aw), math.sin(aw), 0))
            F = frame_at(c + nw * (prof_r(sprof, zw) * (1.0 + 0.035 * math.sin(7 * aw + zw * 0.15)) + 0.12) +
                         Vector((0, 0, zw)), nw)
            wb.disc(F, 0.62, 20, rnd=rng.random() * 0.95)
            b.torus(F, 0.7, 0.09, 20, 6, mi=5)
    b.tube(rail, 0.06, 6, mi=6)
    # door at the foot, facing the lane
    nd = Vector((math.cos(a_road), math.sin(a_road), 0))
    Fd = frame_at(c + nd * (prof_r(sprof, 1.6) + 0.05) + Vector((0, 0, 1.8)), nd)
    b.cyl(Fd @ T((0, 0, -1.2)), 1.5, 1.5, 1.2, seg=28, mi=7)
    b.cyl(Fd @ T((0, 0, -0.08)), 1.3, 1.3, 0.12, seg=28, mi=8)
    b.torus(Fd @ T((0, 0, 0.02)), 1.42, 0.16, 28, 8, mi=7)
    b.obj('ElderBloom', mats, coll, sharp=None)
    wb.obj('ElderBloomWin', [M.win['far']], coll, smooth=False, edge=False, shadow=False)
    # lantern strings hanging from the rim, warm and cool
    bl = BM()
    for k in range(150):
        a = TAU * k / 150
        sag = 1.1 * math.sin(math.pi * ((k % 10) / 10.0))
        p = c + Vector((R * 1.02 * math.cos(a), R * 1.02 * math.sin(a), h + 2.4 - sag))
        bl.sphere(T(p) @ S3(0.16, 0.16, 0.2), 8, 5, mi=0 if k % 3 else 1)
    bl.obj('ElderBloomBulbs', [M.bulbs[0], M.bulbs[2]], coll, edge=False, shadow=False)
    # light: warm gold under the cap (scatters in the haze), cool uplight on the stalk
    for k in range(6):
        a = a_road + k * TAU / 6
        p = c + Vector((math.cos(a), math.sin(a), 0)) * 10.0 + Vector((0, 0, h - 1.5))
        lo = pk.lights.point(tuple(p), (1.0, 0.55, 0.2), 2600.0, radius=2.0, shadow=False, name='BloomGlow',
                             collection=coll, volume=0.8)
        lo['pk_priority'] = 8.0      # web only: keeps the far hero's lights in the real-time light budget
    for da, col in ((-0.5, MAGENTA), (0.5, COBALT)):
        a = a_road + da
        n = Vector((math.cos(a), math.sin(a), 0))
        lo = pk.lights.spot(tuple(c + n * 11.0 + Vector((0, 0, 0.5))), tuple(c + n * 3.0 + Vector((0, 0, 26.0))),
                            col, 30000.0, angle_deg=45, blend=0.9, radius=0.5, shadow=False, name='BloomUp',
                            collection=coll, volume=0.0)
        lo['pk_priority'] = 8.0
    HOUSE_PTS.append((c.x, c.y, 14.0))
    return c


def giant_tree(path, s, lat, rng, coll, idx, height=None, fungi=True):
    c = place(path, s, lat, -0.4)
    b = BM()
    r = rng.uniform(1.3, 2.4)
    H = height or rng.uniform(26, 40)
    prof = [(r * 2.6, -0.3), (r * 1.8, 0.4), (r * 1.3, 1.6), (r * 1.08, 4.0), (r * 1.0, H * 0.35),
            (r * 0.88, H * 0.65), (r * 0.7, H * 0.85), (r * 0.55, H)]
    ph = rng.uniform(0, TAU)

    def bark(a, i, rr, z):
        return (rr * (0.06 * abs(math.sin(a * 9 + ph + 0.6 * math.sin(z * 0.25))) + 0.03 * math.sin(a * 23 + z)), 0.0)
    b.lathe(prof, T(c), seg=36, mi=0, dfunc=bark)
    # roots
    for k in range(6):
        a = ph + k * TAU / 6 + rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        pts, rad = [], []
        for i in range(8):
            u = i / 7
            pts.append(tuple(c + d * r * (1.3 + 1.6 * u) + Vector((0, 0, 1.6 * (1 - u) ** 1.5 - 0.3))))
            rad.append(r * 0.55 * (1 - u) + 0.08)
        b.tube(pts, seg=8, radii=rad, mi=0)
    # branches into the crown + leaf masses
    leaves = []
    for k in range(5):
        a = ph + k * TAU / 5 + rng.uniform(-0.4, 0.4)
        d = Vector((math.cos(a), math.sin(a), 0))
        z0 = H * rng.uniform(0.72, 0.85)
        L = rng.uniform(5, 9)
        pts, rad = [], []
        for i in range(7):
            u = i / 6
            pts.append(tuple(c + d * (r * 0.6 + L * u) + Vector((0, 0, z0 + L * 0.55 * u - 1.2 * u * u))))
            rad.append(r * 0.35 * (1 - u) + 0.12)
        b.tube(pts, seg=7, radii=rad, mi=0)
        leaves.append(Vector(pts[-1]))
    leaves.append(c + Vector((0, 0, H + 2)))
    for p in leaves:
        for q in range(3):
            o = Vector((rng.uniform(-2.5, 2.5), rng.uniform(-2.5, 2.5), rng.uniform(-0.6, 1.4)))
            sz = rng.uniform(2.6, 4.2)
            b.ico(T(p + o) @ S3(sz, sz, sz * 0.62), sub=2, mi=1, wobble=0.12, seed=q + idx)
    b.obj('GiantTree%d' % idx, [M.bark, M.canopy], coll, sharp=None, edge=False)
    if fungi:
        # glowing shelf fungi stacked up the trunk (the neon accent of the forest)
        fb = BM()
        n_road = toward_road(path, s, lat)
        a_c = math.atan2(n_road.y, n_road.x)
        for k in range(rng.randint(5, 9)):
            a = a_c + rng.uniform(-1.0, 1.0)
            z = rng.uniform(1.0, 7.5)
            rr = prof_r(prof, z) * 1.04
            n = Vector((math.cos(a), math.sin(a), 0))
            w = rng.uniform(0.35, 0.75)
            Ff = T(c + n * rr + Vector((0, 0, z))) @ RZ(a)
            fb.lathe([(0.0, 0.0), (w, 0.03), (w * 1.02, 0.1), (w * 0.8, 0.18), (0.0, 0.2)], Ff @ S3(1.0, 1.0, 1.0),
                     seg=14, a0=-math.pi / 2, a1=math.pi / 2)
        fb.obj('ShelfFungi%d' % idx, [M.fungi[idx % 2]], coll, edge=False, shadow=False)
    return c


HOUSE_PTS = []
CHIMNEYS = []


def conifer(b, p, rng, H, R):
    """Stylised tiered fir: scalloped drooping skirts stacked on a short trunk."""
    b.cyl(T(p + Vector((0, 0, -0.6))), R * 0.13, R * 0.08, H * 0.35, seg=8, mi=0)
    n = rng.randint(4, 6)
    ph = rng.uniform(0, TAU)
    for k in range(n):
        u = k / (n - 1)
        rk = R * (1.0 - 0.8 * u) * rng.uniform(0.92, 1.06)
        hk = H * 0.3 * (1.0 - 0.4 * u)
        zt = H * 0.22 + H * 0.66 * u + hk * 0.85
        prof = [(rk * 0.3, zt - hk * 0.82), (rk * 0.86, zt - hk * 1.02), (rk, zt - hk), (rk * 0.9, zt - hk * 0.8),
                (rk * 0.5, zt - hk * 0.36), (rk * 0.1, zt - hk * 0.03), (0.0, zt + (hk * 0.25 if k == n - 1 else 0.0))]
        kk = k

        def dfunc(a, i, rr, z, kk=kk, hk=hk):
            w = math.sin(a * 11 + ph + kk * 1.7)
            if i in (1, 2, 3):
                return (rr * 0.06 * w, -0.12 * hk * (0.5 + 0.5 * w))
            return (0.0, 0.0)
        b.lathe(prof, T(p), seg=30, mi=1, dfunc=dfunc)


def far_tree(b, p, rng, scale=1.0):
    H = rng.uniform(14, 26) * scale
    b.cyl(T(p + Vector((0, 0, -0.5))), 0.7 * scale, 0.45 * scale, H * 0.6, seg=8, mi=0)
    for q in range(3):
        o = Vector((rng.uniform(-2, 2), rng.uniform(-2, 2), H * rng.uniform(0.5, 0.85))) * 1.0
        sz = rng.uniform(4.0, 6.5) * scale
        b.ico(T(p + o) @ S3(sz, sz, sz * 0.75), sub=1, mi=1, wobble=0.1, seed=q)


def fungi_sources(coll):
    """Three cluster shapes of glowing mushrooms (instanced)."""
    srcs = []
    rng = random.Random(11)
    for v in range(4):
        b = BM()
        n = rng.randint(4, 9)
        for k in range(n):
            a = rng.uniform(0, TAU)
            d = rng.uniform(0.0, 0.35)
            p = Vector((math.cos(a) * d, math.sin(a) * d, 0))
            hh = rng.uniform(0.12, 0.42) * (1.4 if k == 0 else 1.0)
            rr = hh * rng.uniform(0.35, 0.6)
            lean = Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 1)).normalized()
            Fm = frame_at(p, lean)
            b.cyl(Fm, rr * 0.22, rr * 0.18, hh, seg=8, mi=1)
            b.lathe([(rr * 0.2, hh - 0.01), (rr, hh + rr * 0.15), (rr * 0.85, hh + rr * 0.45),
                     (rr * 0.45, hh + rr * 0.75), (0.0, hh + rr * 0.85)], Fm, seg=14, mi=0)
        ob = b.obj('FungiSrc%d' % v, [M.fungi[v % len(M.fungi)], M.fungi_stalk], coll, edge=False, shadow=False)
        srcs.append(ob)
    return srcs


def bell_sources(coll):
    """Glowing bell-flower clumps: arching stems with drooping lit bells (verge neon)."""
    srcs = []
    rng = random.Random(31)
    mats = [glow_mat('MH_Bell%d' % i, c, st, base_k=0.6) for i, (c, st) in enumerate(
        [((1.0, 0.2, 0.7), 2.4), ((0.55, 0.3, 1.0), 2.6), ((0.2, 0.9, 1.0), 2.4), ((0.1, 1.0, 0.8), 2.4)])]
    for v in range(4):
        b = BM()
        for k in range(rng.randint(3, 6)):
            a = rng.uniform(0, TAU)
            d = Vector((math.cos(a), math.sin(a), 0))
            Hh = rng.uniform(0.55, 1.2)
            spine = []
            for i in range(10):
                u = i / 9
                spine.append(d * (0.05 + 0.35 * u * u) * Hh + Vector((0, 0, Hh * math.sin(u * math.pi * 0.55))))
            b.tube([tuple(p) for p in spine], 0.012, 5, mi=1)
            for j in range(rng.randint(2, 4)):
                i = 4 + j * 2 if 4 + j * 2 < 10 else 9
                p = spine[min(i, 9)]
                rb = rng.uniform(0.05, 0.09)
                b.lathe([(0.0, 0.0), (rb * 0.25, -0.01), (rb * 0.7, -rb * 0.8), (rb, -rb * 1.6), (rb * 0.8, -rb * 1.7)],
                        T(p + Vector((0, 0, -0.03))), seg=10, mi=0)
        ob = b.obj('BellSrc%d' % v, [mats[v], M.fern], coll, edge=False, shadow=False)
        srcs.append(ob)
    return srcs


def fences(path, coll, rng):
    """Rustic post-and-rail fences along stretches of both verges, some with tiny lights."""
    b = BM()
    bl = BM()
    for side in (-1, 1):
        s = 2.0 if side < 0 else 6.0
        while s < 180:
            L = rng.uniform(6, 14)
            if (side > 0 and INN_S - 14 < s + L / 2 < INN_S + 12) or (side < 0 and TOWER_S - 10 < s + L / 2 < TOWER_S + 8):
                s += L + 4
                continue
            lat = side * 4.5
            n = max(2, int(L / 1.7))
            pts_top, pts_mid = [], []
            for i in range(n + 1):
                ss = s + L * i / n
                p = path.offset(ss, lat, 0.11)
                b.box(T(p + Vector((0, 0, 0.5))) @ RZ(rng.uniform(-0.1, 0.1)), (0.11, 0.11, 1.0), radius=0.025, mi=0)
                pts_top.append(tuple(p + Vector((0, 0, 0.9 + 0.02 * math.sin(i)))))
                pts_mid.append(tuple(p + Vector((0, 0, 0.5))))
            b.tube(pts_top, 0.045, 6, mi=0)
            b.tube(pts_mid, 0.04, 6, mi=0)
            if rng.random() < 0.6:
                ci = rng.randrange(5)
                m = int(L / 0.45)
                for i in range(m):
                    u = (i + 0.5) / m
                    ss = s + L * u
                    sag = 0.12 * math.sin(math.pi * ((u * n) % 1.0))
                    p = path.offset(ss, lat, 0.11 + 0.96 - sag)
                    bl.sphere(T(p) @ S3(0.035), 6, 4, mi=(ci + i % 2) % 5)
            s += L + rng.uniform(4, 10)
    b.obj('Fences', [M.wood], coll, sharp=45)
    bl.obj('FenceLights', M.bulbs, coll, edge=False, shadow=False)


def story_details(path, coll, infos, rng):
    """Laundry lines between neighbours, a blank signpost, a bench with a lantern, a cart."""
    b = BM()
    cloth = [pk.mat.painted_wood(c, name='MH_Cloth%d' % i, wear=0.1) for i, c in enumerate(
        [(0.8, 0.75, 0.6), (0.7, 0.2, 0.25), (0.2, 0.35, 0.7), (0.85, 0.6, 0.2)])]
    mats = [M.wood, M.iron, M.stone] + cloth
    # laundry lines between consecutive front-row houses on the same side
    done = 0
    for (s0, l0, i0), (s1, l1, i1) in zip(infos, infos[1:]):
        if done >= 6 or (l0 > 0) != (l1 > 0) or abs(s1 - s0) > 16 or s0 > 140:
            continue
        if rng.random() < 0.5:
            continue
        p0 = i0['base'] + i0['n_road'] * (i0['r'] * 1.0) + Vector((0, 0, i0['h'] * 0.75))
        p1 = i1['base'] + i1['n_road'] * (i1['r'] * 1.0) + Vector((0, 0, i1['h'] * 0.75))
        pts = []
        for k in range(17):
            u = k / 16
            pts.append(p0.lerp(p1, u) - Vector((0, 0, 0.6 * 4 * u * (1 - u))))
        b.tube([tuple(p) for p in pts], 0.012, 4, mi=1)
        d = (p1 - p0)
        d.z = 0
        d.normalize()
        for k in range(2, 15, 2):
            if rng.random() < 0.3:
                continue
            u = k / 16
            p = p0.lerp(p1, u) - Vector((0, 0, 0.6 * 4 * u * (1 - u)))
            w, hh = rng.uniform(0.35, 0.7), rng.uniform(0.4, 0.8)
            F = frame_at(p - Vector((0, 0, hh / 2)), Vector((-d.y, d.x, 0)))
            b.box(F, (w, hh, 0.02), radius=0.008, mi=3 + rng.randrange(4))
        done += 1
    # blank signpost at the bend
    sp = path.offset(30.0, -3.9, 0.11)
    b.box(T(sp + Vector((0, 0, 1.2))), (0.12, 0.12, 2.4), radius=0.03, mi=0)
    t = path.tangent(30.0)
    for k, (z, a) in enumerate(((2.05, 0.5), (1.7, -0.6), (1.35, 0.2))):
        F = T(sp + Vector((0, 0, z))) @ RZ(math.atan2(t.y, t.x) + a)
        b.box(F @ T((0.45, 0, 0)), (0.9, 0.06, 0.24), radius=0.03, mi=0)
    # bench with a little lantern by the inn porch side
    bp = path.offset(INN_S - 9.0, 5.2, 0.11)
    yaw = math.atan2(t.y, t.x)
    t2 = path.tangent(INN_S - 9.0)
    yaw = math.atan2(t2.y, t2.x)
    Fb = T(bp) @ RZ(yaw)
    b.box(Fb @ T((0, 0, 0.45)), (1.6, 0.45, 0.07), radius=0.02, mi=0)
    b.box(Fb @ T((0, 0.22, 0.8)), (1.6, 0.06, 0.4), radius=0.02, mi=0)
    for sx in (-0.7, 0.7):
        b.box(Fb @ T((sx, 0, 0.22)), (0.08, 0.4, 0.45), radius=0.02, mi=1)
    b.obj('StoryDetails', mats, coll, sharp=45)
    lb = BM()
    lb.cyl(Fb @ T((0.95, 0, 0.0)), 0.1, 0.08, 0.3, seg=10)
    lb.obj('BenchLantern', [M.lamp_warm], coll, edge=False, shadow=False)
    pk.lights.point(tuple(bp + Vector((0, 0, 0.4))), (1.0, 0.55, 0.25), 25.0, radius=0.08, shadow=False,
                    name='BenchL', collection=coll, volume=0.2)


def festoon(p0, p1, sag, colors, seed, coll, n_per_m=1.5, strength=11.0, radius=0.03,
            light_every=6, light_energy=22.0):
    """A sagging festoon from p0 to p1: catenary-ish wire, bulbs at jittered spacing hanging
    on short drops, colours cycling with a little randomness, a few real point lights."""
    rng = random.Random(seed)
    p0, p1 = Vector(p0), Vector(p1)
    L = (p1 - p0).length

    def at(t):
        p = p0.lerp(p1, t)
        p.z -= sag * 4 * t * (1 - t)
        return p
    wire = [tuple(at(i / 40)) for i in range(41)]
    wb = BM()
    wb.tube(wire, 0.011, 6, mi=0)
    wb.obj('FestoonWire%d' % seed, [M.iron], coll, edge=False, shadow=False)
    n = max(4, int(L * n_per_m))
    bb = BM()
    mats = [pk.mat.emission(c, strength, name='MH_Fest_%d_%d_%d' % tuple(int(x * 99) for x in c)) for c in colors]
    for i in range(n):
        t = (i + 0.5 + rng.uniform(-0.22, 0.22)) / n
        p = at(t)
        drop = rng.uniform(0.04, 0.09)
        r = radius * rng.uniform(0.8, 1.15)
        ci = (i + (1 if rng.random() < 0.2 else 0)) % len(colors)
        bb.sphere(T(p - Vector((0, 0, drop + r))) @ S3(r, r, r * 1.3), 8, 5, mi=ci)
        if light_every and i % light_every == light_every // 2:
            pk.lights.point(tuple(p - Vector((0, 0, drop + r))), colors[ci], light_energy, radius=0.05,
                            shadow=False, name='FestL', collection=coll, volume=0.3)
    bb.obj('Festoon%d' % seed, mats, coll, edge=False, shadow=False)


def fern_sources(coll):
    srcs = []
    rng = random.Random(21)
    for v in range(3):
        b = BM()
        nf = rng.randint(8, 12)
        for k in range(nf):
            a = TAU * k / nf + rng.uniform(-0.2, 0.2)
            L = rng.uniform(0.7, 1.25)
            rise = rng.uniform(0.5, 0.9)
            d = Vector((math.cos(a), math.sin(a), 0))
            side = Vector((-d.y, d.x, 0))
            spine = []
            for i in range(9):
                u = i / 8
                spine.append(d * L * u + Vector((0, 0, rise * math.sin(u * math.pi * 0.62) - 0.25 * u * u)))
            b.tube([tuple(p) for p in spine], 0.008, 4, mi=0)
            for i in range(1, 8):
                u = i / 8
                p = spine[i]
                lw = 0.16 * (1 - u) + 0.04
                for sg in (-1, 1):
                    tip = p + side * sg * lw + d * 0.04 + Vector((0, 0, -0.02))
                    q1 = p + d * 0.035
                    q2 = p - d * 0.035
                    b.add([tuple(q2), tuple(tip), tuple(q1), tuple(p + Vector((0, 0, 0.01)))],
                          [(0, 1, 2, 3)] if sg > 0 else [(3, 2, 1, 0)], [(0, 0), (1, 0), (1, 1), (0, 1)], mi=0)
        ob = b.obj('FernSrc%d' % v, [M.fern], coll, edge=False, merge=False)
        srcs.append(ob)
    return srcs


def rock_sources(coll):
    srcs = []
    for v in range(3):
        b = BM()
        b.ico(S3(1.0, 0.8, 0.55), sub=3, wobble=0.18, seed=v * 5)
        ob = b.obj('RockSrc%d' % v, [M.rock], coll, edge=True)
        srcs.append(ob)
    return srcs


def toadstool_sources(coll):
    """Glowing toadstool lamps: per colour three shapes (round dome on a short stalk, flat
    parasol on a tall thin stalk, little bell) with a slight lean and a bulbous foot."""
    srcs = []
    shapes = [
        (0.42, 0.075, [(0.05, 0.0), (0.24, 0.05), (0.23, 0.13), (0.16, 0.24), (0.0, 0.28)]),
        (0.62, 0.05, [(0.04, 0.0), (0.3, 0.03), (0.31, 0.07), (0.2, 0.12), (0.0, 0.15)]),
        (0.3, 0.06, [(0.04, 0.0), (0.16, 0.02), (0.17, 0.08), (0.12, 0.22), (0.05, 0.3), (0.0, 0.32)]),
    ]
    for v, gm in enumerate((M.toad_warm, M.toad_cool, M.toad_mag, M.toad_vio, M.toad_teal)):
        group = []
        for k, (hs, rs, cap) in enumerate(shapes):
            b = BM()
            lean = T((0, 0, hs)) @ Matrix.Rotation(math.radians(5 + 4 * k), 4, 'X') @ T((0, 0, -hs))
            b.lathe([(rs * 1.5, 0.0), (rs * 1.1, 0.06), (rs, hs * 0.5), (rs * 0.85, hs)], Matrix.Identity(4), seg=12, mi=1)
            b.lathe([(r_, z_ + hs - 0.02) for (r_, z_) in cap], lean, seg=20, mi=0)
            ob = b.obj('ToadSrc%d_%d' % (v, k), [gm, M.stalks[0]], coll, edge=False)
            group.append(ob)
        srcs.append(group)
    return srcs


def moss_sources(coll):
    """Mossy hummocks and flat stones for the ground layer between the kerb and the houses."""
    srcs = []
    for v in range(3):
        b = BM()
        b.ico(S3(1.0, 0.8, 0.32), sub=3, wobble=0.22, seed=v * 3 + 1, mi=0)
        for q in range(v + 1):
            a = q * 2.1 + v
            b.ico(T((math.cos(a) * 0.8, math.sin(a) * 0.6, 0.0)) @ S3(0.55, 0.5, 0.22), sub=2, wobble=0.2,
                  seed=q + 7, mi=0)
        ob = b.obj('MossSrc%d' % v, [M.moss_clump], coll, edge=False)
        srcs.append(ob)
    for v in range(2):
        b = BM()
        b.ico(S3(0.5, 0.42, 0.16), sub=2, wobble=0.15, seed=v * 5 + 2, mi=0)
        ob = b.obj('StoneSrc%d' % v, [M.rock], coll, edge=True)
        srcs.append(ob)
    return srcs


def terrain(path, coll):
    """Moss ground in path coordinates (flat floor, slopes, closed far end)."""
    ss = np.arange(-40.0, 335.0, 2.0)
    lats = [3.0, 3.4, 4.0, 4.8, 5.8, 7.0, 8.5, 10.5, 13, 16, 20, 25, 31, 38, 46, 55, 65, 76, 88, 102, 118, 136, 156]
    verts, faces = [], []
    cols = [-l for l in reversed(lats)]
    for side in (-1, 1):
        start = len(verts)
        for s in ss:
            for l in lats:
                lat = side * l
                p = path.offset(s, lat, 0.0)
                z = ground_h(s, lat) + 0.11 * (1.0 - smooth(6.0, 12.0, l))
                verts.append((p.x, p.y, z))
        nl = len(lats)
        for i in range(len(ss) - 1):
            for j in range(nl - 1):
                a = start + i * nl + j
                if side > 0:
                    faces.append((a, a + 1, a + nl + 1, a + nl))
                else:
                    faces.append((a, a + nl, a + nl + 1, a + 1))
    ob = pk.mesh_object('Terrain', verts, faces, material=M.moss, collection=coll)
    return ob


COMP_CONTRAST = 1.2      # filmic contrast about mid grey, applied in the compositor
COMP_BLACK = 0.006       # scene-linear black point
VIEW_EXPOSURE = -0.25
CAM_PITCH = 6.5
CAM_LATERAL = 1.15       # right-hand lane


def comp_contrast(scene, contrast, black):
    """Insert a black point and a contrast power about 0.18 at the end of the kit compositor."""
    ng = scene.compositing_node_group
    out = next(n for n in ng.nodes if n.bl_idname == 'NodeGroupOutput')
    src = out.inputs[0].links[0].from_socket
    c = pk.vmath(ng, 'MAXIMUM', pk.vmath(ng, 'SUBTRACT', src, (black, black, black)), (0, 0, 0))
    c = pk.vmath(ng, 'SCALE', c, scale=1.0 / (1.0 - black))
    x, y, z = pk.sep_xyz(ng, pk.vmath(ng, 'SCALE', c, scale=1.0 / 0.18))
    ch = [pk.math_(ng, 'MULTIPLY', pk.math_(ng, 'POWER', v, contrast), 0.18) for v in (x, y, z)]
    ng.links.new(pk.comb_xyz(ng, *ch), out.inputs[0])


def lane_detail(m):
    """Coarser structure on the kit lane, readable at 5 to 15 m: patchy repaired asphalt
    (albedo 0.7..1.35 over a metre or two) and meandering glossy tar seams, so the near road
    under the headlamps is not a flat smear."""
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    p3 = pk.comb_xyz(nt, U, V, 0.0)
    pf, _ = pk.noise(nt, pk.vmath(nt, 'SCALE', p3, scale=0.55), scale=1.0, detail=3.0, rough=0.6)
    patch = pk.maprange(nt, pf, 0.3, 0.7, 0.7, 1.35)
    vo = pk.voronoi(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', U, 0.55), pk.math_(nt, 'MULTIPLY', V, 0.3), 0.0),
                    scale=1.0, feature='DISTANCE_TO_EDGE')
    wob, _ = pk.noise(nt, pk.vmath(nt, 'SCALE', p3, scale=2.0), scale=1.0, detail=2.0)
    seam = pk.maprange(nt, pk.math_(nt, 'ADD', vo['Distance'], pk.math_(nt, 'MULTIPLY', wob, 0.03)), 0.012, 0.03, 1.0, 0.0)
    keep, _ = pk.noise(nt, pk.vmath(nt, 'SCALE', p3, scale=0.3), scale=1.0, detail=1.0)
    seam = pk.math_(nt, 'MULTIPLY', seam, pk.maprange(nt, keep, 0.45, 0.55, 0.0, 1.0))
    bc = p.inputs['Base Color']
    if bc.links:
        src = bc.links[0].from_socket
        col = pk.vmath(nt, 'SCALE', src, scale=pk.math_(nt, 'MULTIPLY', patch, pk.math_(nt, 'SUBTRACT', 1.0, pk.math_(nt, 'MULTIPLY', seam, 0.65))))
        nt.links.new(col, bc)
    ro = p.inputs['Roughness']
    if ro.links:
        src = ro.links[0].from_socket
        nt.links.new(pk.mix_f(nt, seam, src, 0.07), ro)


def web_lane_markings(path, coll, s0=-30.0, s1=330.0, dash=3.0, gap=5.5, line_w=0.14, edge_inset=0.32,
                      crown=0.04, lift=0.012):
    """Web edition only (hide_render plus pk_webonly, so the film render never sees them): the
    lane material's painted centre dashes and edge lines as thin strips just above the crowned
    road, at the same places as MH_Lane's procedural markings (V = s - s0 along, U lateral).
    The glTF fallback flattens MH_Lane to one dark colour, which loses the yellow leading line.
    The 12 mm lift keeps them above the road in a 24-bit depth buffer out to about 70 m."""
    hw = ROAD_W / 2

    def zc(lat):
        return crown * (1.0 - (lat / hw) ** 2) + lift

    def web_mat(name, base, rough):
        m, nt, out = pk._new_mat(name)
        p = pk._principled(nt, base=base, rough=rough)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        pk._web(m, base=base, rough=rough)
        return m

    def strips(spans, lat0, lat1, name, m, step=0.5):
        verts, faces = [], []
        for a, b in spans:
            n = max(1, int(math.ceil((b - a) / step)))
            k0 = len(verts)
            for i in range(n + 1):
                s = a + (b - a) * i / n
                for lat in (lat0, lat1):
                    verts.append(tuple(path.offset(s, lat, zc(lat))))
            for i in range(n):
                k = k0 + 2 * i
                faces.append((k, k + 1, k + 3, k + 2))
        o = pk.mesh_object(name, verts, faces, material=m, smooth=False, collection=coll)
        o.hide_render = True
        o['pk_webonly'] = 1
        return o

    # wet, worn paint: the material's colours darkened by the wet film
    mc = web_mat('MH_WebLaneCentre', (0.55, 0.4, 0.1), 0.4)
    me = web_mat('MH_WebLaneEdge', (0.28, 0.28, 0.27), 0.4)
    per = dash + gap
    spans, k = [], 0
    while s0 + k * per < s1:
        spans.append((s0 + k * per, min(s1, s0 + k * per + dash)))
        k += 1
    strips(spans, -line_w / 2, line_w / 2, 'WebLaneDash', mc)
    ew = line_w * 0.6
    for side, tag in ((-1, 'L'), (1, 'R')):
        c = side * (hw - edge_inset)
        strips([(s0, s1)], c - ew, c + ew, 'WebLaneEdge' + tag, me)


def web_light_ranges(scene):
    """Web edition only (custom properties read by export_web): EEVEE cuts each point and spot
    light off at its influence radius r = sqrt(max(rgb) * W / 100 * max(diffuse, specular) /
    light_threshold) with the window (1 - (d/r)^4)^2, the same window three.js applies for
    light.distance. Without it every web light reaches to infinity: the inn and street lights
    kept lighting caps 30 to 60 m away that are dark in the film. Written as pk_range."""
    thr = max(scene.eevee.light_threshold, 1e-6)
    n = 0
    for o in scene.objects:
        if o.type != 'LIGHT' or o.data.type not in ('POINT', 'SPOT') or o.get('pk_range') is not None:
            continue
        ld = o.data
        p = max(ld.color) * abs(ld.energy) / 100.0 * max(ld.diffuse_factor, ld.specular_factor)
        if p > 0:
            o['pk_range'] = round(math.sqrt(p / thr), 2)
            n += 1
    pk.log('web: EEVEE influence radius as pk_range on %d lights' % n)


def fade_bump_at_grazing(m, lo=0.35, f0=0.55, f1=0.97):
    """Kit materials bump the normal at every angle; at grazing view angles on the wet lane a
    tilted normal sends the reflection ray into the ground and leaves black specks in the
    reflections. Blend the bumped normal back toward the true normal as the view grazes."""
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    if not p.inputs['Normal'].links:
        return
    src = p.inputs['Normal'].links[0].from_socket
    geo = pk.node(nt, 'ShaderNodeNewGeometry')
    lw = pk.node(nt, 'ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    k = pk.maprange(nt, lw.outputs['Facing'], f0, f1, 1.0, lo)
    nb = pk.vmath(nt, 'ADD', pk.vmath(nt, 'SCALE', geo.outputs['Normal'], scale=pk.math_(nt, 'SUBTRACT', 1.0, k)),
                  pk.vmath(nt, 'SCALE', src, scale=k))
    nt.links.new(pk.vmath(nt, 'NORMALIZE', nb), p.inputs['Normal'])


def widen_road_streak_mask(scene, lo=0.42, hi=0.66):
    """The kit's road-streak mask keeps pixels whose Normal-pass z is above 0.78..0.92. The
    lane's bump (grain, streak ridges) tilts many pixel normals below that, so the added
    streak light skipped them and left black specks all over the reflections. Accept any
    upward-facing normal instead (facades stay out: their z is about 0)."""
    ng = scene.compositing_node_group
    n_fixed = 0
    for n in ng.nodes:
        if n.bl_idname == 'ShaderNodeMapRange' and abs(n.inputs[1].default_value - 0.78) < 1e-4 \
                and abs(n.inputs[2].default_value - 0.92) < 1e-4:
            n.inputs[1].default_value = lo
            n.inputs[2].default_value = hi
            n_fixed += 1
    pk.log('road streak mask widened (%d node)' % n_fixed)


CABIN_COAT_ROUGH = 0.4     # dash and pillar coats stay off the screen tracer (max roughness 0.32)


def dash_material():
    """Satin dark leather (#0b0d14): fine grain, roughness 0.4 with a soft satin coat, so the
    padded crest picks up coloured rim highlights from the street."""
    m, nt, out = pk._new_mat('MH_Dash')
    co = pk.texcoord(nt, 'Object')
    gf, _ = pk.noise(nt, co, scale=150.0, detail=3.0, rough=0.6)
    vo = pk.voronoi(nt, co, scale=90.0, feature='F1')
    hgt = pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', gf, 0.5), pk.math_(nt, 'MULTIPLY', vo['Distance'], 0.5))
    rf, _ = pk.noise(nt, co, scale=3.0, detail=2.0)
    # coat roughness above the trace limit (0.32, render.setup below; 0.2 until round 4): a
    # screen-traced coat mirrors lights near the frame edge and loses them the frame they leave.
    # The big glow cut at mp4 4 / 106 / 209 was the lantern spots (car_ignores_lantern_spots).
    p = pk._principled(nt, base=(0.0037, 0.0042, 0.0068), rough=pk.maprange(nt, rf, 0.3, 0.7, 0.36, 0.46),
                       normal=pk.bump(nt, hgt, strength=0.06, distance=0.0006), spec=0.5, coat=0.35,
                       coat_rough=CABIN_COAT_ROUGH)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.004, 0.0045, 0.007), rough=0.4)
    return m


def hood_paint():
    """Glossy vintage paint: deep bottle teal, a mirror-smooth clear finish that mirrors the
    street lights at grazing angles, faint orange peel."""
    m, nt, out = pk._new_mat('MH_HoodPaint')
    co = pk.texcoord(nt, 'Object')
    pf, _ = pk.noise(nt, co, scale=24.0, detail=2.0)
    p = pk._principled(nt, base=(0.004, 0.018, 0.02), rough=0.045, metal=0.0, spec=0.7, ior=1.55,
                       normal=pk.bump(nt, pf, strength=0.015, distance=0.002))
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.004, 0.018, 0.02), rough=0.06)
    return m


def build_vehicle(cam):
    """A rounded vintage car seen from the driver's seat: a padded satin dash whose crest arcs
    down toward the corners (12 % of the frame at the centre, 7.5 % at the edges), the
    steering-wheel arc with a rim light, a glossy bottle-teal hood that peeks over the dash
    (to about 16 % of the frame) with a chrome centre strip and a little chrome toadstool
    mascot, raked A-pillar bases in the two lower corners only, and two headlamps that light
    the lane ahead (so the near asphalt shows its grain)."""
    vc = ctx_coll()
    pk.vehicle.rig(cam)
    dm = dash_material()
    chrome = pk.mat.metal((0.86, 0.86, 0.9), name='MH_Chrome', roughness=0.08, scratches=0.05, dirt=0.05)
    hp = hood_paint()
    fov = math.radians(cam.get('pk_fov_v', 62.0))
    aspect = pk.RES_X / pk.RES_Y

    def cz(cover, y):
        return pk.vehicle.cover_z(cam, cover, y)

    def car_point(fx, fy, y):
        """Car-frame point at depth y that appears at frame (fx from left, fy from bottom)."""
        hw = y * math.tan(fov / 2) * aspect
        return Vector(((fx - 0.5) * 2.0 * hw, y, cz(fy, y)))

    # ---- dash: padded crest whose screen height arcs down toward the corners
    C0, C1 = 0.118, 0.078          # crest cover at the centre / at the frame edges
    nx = 72
    W = 1.5
    sec = [(-0.46, -0.62), (-0.44, -0.2), (-0.41, -0.07), (-0.37, -0.035), (-0.3, -0.022),
           (-0.2, -0.014), (-0.12, -0.006), (-0.07, -0.001)]
    r = 0.045
    for i in range(1, 9):
        a = math.pi / 2 - math.pi * 0.85 * i / 8
        sec.append((-0.07 + 0.07 * math.cos(a) * 0.9, -r + r * math.sin(a) + 0.0))
    sec += [(0.012, -0.11), (0.0, -0.3)]
    verts, faces = [], []
    crest = []
    for i in range(nx + 1):
        x = -W / 2 + W * i / nx
        yc = 1.02 - 0.38 * (x / (W / 2)) ** 2
        hw = yc * math.tan(fov / 2) * aspect
        u = min(1.0, abs(x) / hw)
        cov = C0 - (C0 - C1) * u ** 2 - 0.03 * max(0.0, abs(x) / hw - 1.0)
        zt = cz(cov, yc)
        crest.append((x, yc, zt))
        for (dy, dz) in sec:
            verts.append((x, yc + dy, zt + dz))
    ns = len(sec)
    for i in range(nx):
        for j in range(ns - 1):
            a = i * ns + j
            faces.append((a, a + ns, a + ns + 1, a + 1))
    b = BM()
    b.add(verts, faces, None, mi=0)
    dash = b.obj('Dashboard', [dm], vc, smooth=True, edge=True, shadow=False)
    pk.vehicle.attach(dash, cam)
    # chrome trim just behind the crest roll
    tb = BM()
    tb.tube([(x, y - 0.035, z + 0.003) for (x, y, z) in crest[4:-4]], 0.005, 8, mi=0)
    trim = tb.obj('DashTrim', [chrome], vc, smooth=True, edge=False, shadow=False)
    pk.vehicle.attach(trim, cam)
    # steering wheel (top arc only) with its own rim light
    wh = pk.vehicle.steering_wheel(cam, x=0.0, y=0.55, radius=0.19, tube=0.019, top=0.068)
    t = math.radians(28.0)
    top = Vector((0.0, wh.location.y - 0.209 * math.sin(t), wh.location.z + 0.209 * math.cos(t)))
    pk.vehicle.cabin_light(cam, location=tuple(top + Vector((0.0, 0.35, 0.18))),
                           target=tuple(top), size=(1.4, 0.12), color=(0.55, 0.68, 1.0), energy=1.4,
                           receivers=[wh], name='WheelRim')
    # soft fill on the dash top (no specular hot spot): the satin reads, the crest catches the street
    pk.vehicle.cabin_light(cam, location=(0.0, 0.95, 0.25), target=(0.0, 0.7, -0.35), size=(1.6, 0.5),
                           color=(0.42, 0.55, 1.0), energy=0.9, receivers=[dash], name='DashFill').data.specular_factor = 0.0
    pk.vehicle.roof(cam, y0=-1.2, y1=1.7, z=0.32, width=1.8)

    # ---- hood: crowned, flat near the cowl, rolling down to a rounded nose
    y0, y1 = 1.0, 2.75
    zc0 = cz(0.09, 1.15)
    zn = cz(0.162, y1)
    crown = 0.14
    HW = 0.95
    nu, nv = 48, 40
    hv, hf, huv = [], [], []
    for j in range(nv + 1):
        v = j / nv
        y = y0 + (y1 - y0) * v
        zc = zc0 + (zn - zc0) * max(0.0, (y - 1.15) / (y1 - 1.15)) ** 1.7 if y > 1.15 else zc0 + 0.02 * (1.15 - y)
        for i in range(nu + 1):
            u = -1.0 + 2.0 * i / nu
            x = u * HW
            z = zc - crown * x * x - 0.18 * max(0.0, abs(u) - 0.78) ** 2 * 6.0
            hv.append((x, y, z))
            huv.append((u, v))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            hf.append((a, a + 1, a + nu + 2, a + nu + 1))
    # rounded nose: roll the front edge down and back
    base = len(hv)
    nr = 8
    for k in range(1, nr + 1):
        ang = math.pi / 2 * k / nr
        for i in range(nu + 1):
            x, y, z = hv[nv * (nu + 1) + i]
            hv.append((x, y + 0.14 * math.sin(ang), z - 0.14 * (1 - math.cos(ang)) - 0.08 * k / nr))
            huv.append((-1.0 + 2.0 * i / nu, 1.0))
    for k in range(nr):
        r0 = nv * (nu + 1) if k == 0 else base + (k - 1) * (nu + 1)
        r1 = base + k * (nu + 1)
        for i in range(nu):
            hf.append((r0 + i, r0 + i + 1, r1 + i + 1, r1 + i))
    hb = BM()
    hb.add(hv, hf, None, mi=0)
    hood = hb.obj('Hood', [hp], vc, smooth=True, edge=False, shadow=False)
    pk.vehicle.attach(hood, cam)

    def hood_z(x, y):
        zc = zc0 + (zn - zc0) * max(0.0, (y - 1.15) / (y1 - 1.15)) ** 1.7
        return zc - crown * x * x
    # chrome centre strip and a little toadstool mascot on the nose
    cb = BM()
    cb.tube([(0.0, y, hood_z(0.0, y) + 0.006) for y in np.linspace(1.2, y1 + 0.02, 30)], 0.011, 10, mi=0)
    ym = y1 - 0.06
    zm = hood_z(0.0, ym) + 0.004
    cb.lathe([(0.03, 0.0), (0.022, 0.012), (0.012, 0.03), (0.011, 0.05)], T(Vector((0.0, ym, zm))), seg=20, mi=0)
    mascot = cb.obj('HoodChrome', [chrome], vc, smooth=True, edge=False, shadow=False)
    pk.vehicle.attach(mascot, cam)
    # the red enamel cap is its own object (same car-frame origin, so its Object texture
    # coordinates are unchanged) so that its key light can be linked to it alone
    kb = BM()
    kb.lathe([(0.011, 0.046), (0.06, 0.052), (0.058, 0.064), (0.04, 0.08), (0.0, 0.09)],
             T(Vector((0.0, ym, zm))), seg=28, mi=0)
    enamel = cap_mat('MH_MascotCap', (0.62, 0.03, 0.02), coat=1.0, moss=0.0)
    # web fallback only: three.js has no light linking and the key is not exported, so the
    # key's steady warmth becomes a faint emissive floor on the enamel, its gloss a clear coat
    pk._web(enamel, base=(0.62, 0.03, 0.02), rough=0.4, emit=(0.62, 0.03, 0.02),
            emit_strength=MASCOT_WEB_EMIT, coat=0.5, coat_rough=0.12)
    mcap = kb.obj('HoodMascotCap', [enamel], vc, smooth=True, edge=False, shadow=False)
    pk.vehicle.attach(mcap, cam)
    mascot_key(cam, mcap, Vector((0.0, ym, zm + 0.07)))

    # ---- A-pillar bases: only the lower corners (raked outward as they rise toward the roof)
    pm = pillar_material()
    for side in (-1, 1):
        verts, faces = [], []
        n = 8
        for i in range(n):
            u = i / (n - 1)
            fx = 0.034 - 0.12 * u            # inner edge leaves the frame side at about 26 % height
            fy = 0.06 + 0.24 * u
            y = 0.95 - 0.35 * u
            q = car_point(fx, fy, y)
            q_out = car_point(-0.3, fy, y)
            sx = 1.0 if side > 0 else -1.0
            for (x, yy, z) in ((q.x, y + 0.02, q.z), (q.x - 0.006, y, q.z), (q_out.x, y, q.z)):
                verts.append((x * -sx, yy, z))
        for i in range(n - 1):
            for j in range(2):
                f = (i * 3 + j, i * 3 + j + 1, (i + 1) * 3 + j + 1, (i + 1) * 3 + j)
                faces.append(f if side < 0 else tuple(reversed(f)))
        b = BM()
        b.add(verts, faces, None, mi=0)
        ob = b.obj('APillar%s' % ('L' if side < 0 else 'R'), [pm], vc, smooth=True, edge=False, shadow=False)
        pk.vehicle.attach(ob, cam)

    # ---- headlamps: warm pools on the lane ahead (they never touch the car itself)
    lamps = []
    for sx in (-0.62, 0.62):
        lo = pk.lights.spot((sx, y1 - 0.05, hood_z(0, y1) - 0.18), (sx * 1.6, 14.0, -1.2),
                            (1.0, 0.86, 0.68), HEADLAMP_W, angle_deg=36, blend=0.8, radius=0.08,
                            shadow=False, name='Headlamp', volume=0.05, specular=0.0)
        lo.parent = pk.vehicle.rig(cam)
        lo.matrix_parent_inverse = Matrix.Identity(4)
        lo.location = (sx, y1 - 0.05, hood_z(0, y1) - 0.18)
        lo.rotation_euler = (Vector((sx * 0.6, 14.0, -1.2)) - Vector(lo.location)).to_track_quat('-Z', 'Y').to_euler()
        lo['pk_vehicle'] = True
        pk.mark_moving(lo)
        lamps.append(lo)
    return dict(dash=dash, hood=hood, wheel=wh)


HEADLAMP_W = 4000.0
# mascot key (round 5): a small warm softbox fixed in the car frame, linked to the enamel cap only.
# Its specular is kept low so the coat sheen stays under the compositor's road-streak threshold
# (luminance 0.48): at full specular the highlight was smeared into a pale vertical line above the cap.
MASCOT_KEY_W = 2.8
MASCOT_KEY_OFS = (0.12, 0.26, 0.30)    # from the cap centre: right, ahead, up (m)
MASCOT_KEY_SIZE = 0.3
MASCOT_KEY_COLOR = (1.0, 0.62, 0.38)
MASCOT_KEY_SPEC = 0.22
MASCOT_WEB_EMIT = 0.15             # web edition only (see build_vehicle)


def mascot_key(cam, cap, c):
    """Round 5: since round 4 the lantern spots no longer reach the car (car_ignores_lantern_spots),
    so the red enamel cap was lit only by the scene's weak fills and read as a dull maroon blob
    (core red mean 4 to 46 of 255 over most of the cruise). Before that, the same spots made it
    pump from frame to frame (core red 52 to 199, steps up to 111). A small warm area light in the
    car frame, ahead of and above the cap, linked to the cap alone (no other mesh, no volume, no
    shadow) gives it a steady lit crown and a soft coat highlight; the scene lights still add
    their slow changes on top. Not exported (three.js has no light linking)."""
    lo = pk.vehicle.cabin_light(cam, location=tuple(c + Vector(MASCOT_KEY_OFS)), target=tuple(c),
                                size=(MASCOT_KEY_SIZE, MASCOT_KEY_SIZE), color=MASCOT_KEY_COLOR,
                                energy=MASCOT_KEY_W, receivers=[cap], name='MascotKey')
    lo.data.volume_factor = 0.0
    lo.data.specular_factor = MASCOT_KEY_SPEC
    return lo


def car_ignores_lantern_spots():
    """Round 4: a lantern-post spot (900 W, shadowed below s 75) lit the lower right of the
    dash through the windscreen as each right-hand post came near, and the invisible cabin
    roof then cut that light within one or two frames once the post was about 3.6 m ahead (a
    broad amber glow switching off at mp4 frames 3 to 4, 105 to 106 and 207 to 209). The car's
    meshes are now excluded from the LanternL* spots by light linking; the posts' small
    shadowless glow lights still reach the car and fade smoothly."""
    rc = bpy.data.collections.new('MH_CarNoLanternSpot')
    for o in pk.vehicle.collection().objects:
        if o.type == 'MESH':
            rc.objects.link(o)
    for co in rc.collection_objects:
        co.light_linking.link_state = 'EXCLUDE'
    n = 0
    for o in bpy.context.scene.objects:
        if o.type == 'LIGHT' and o.name.startswith('LanternL') and o.light_linking.receiver_collection is None:
            o.light_linking.receiver_collection = rc
            n += 1
    pk.log('car excluded from %d lantern spots (%d car meshes)' % (n, len(rc.objects)))


def pillar_material():
    m, nt, out = pk._new_mat('MH_Pillar')
    co = pk.texcoord(nt, 'Object')
    gf, _ = pk.noise(nt, co, scale=120.0, detail=2.0)
    p = pk._principled(nt, base=(0.005, 0.0055, 0.008), rough=0.42, spec=0.5, coat=0.3,
                       coat_rough=CABIN_COAT_ROUGH, normal=pk.bump(nt, gf, strength=0.03, distance=0.0006))
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.005, 0.0055, 0.008), rough=0.45)
    return m


def ctx_coll():
    return pk.vehicle.collection()


def gentle_float(cam, z_amp=0.004, pitch_amp=0.05, roll_amp=0.04, seed=5):
    """Suspension float in place of the kit's road vibration, whose pitch and roll sines reach
    6.9 Hz and buzzed the world 2 to 5 px per frame against the locked dash in films 03 and 05
    (and pumped the bloom through motion blur). Only slow sines (0.4 to 1.4 Hz), added to the
    camera's per-frame keys."""
    r = random.Random(seed)
    ph = [r.uniform(0, 2 * math.pi) for _ in range(5)]
    fz = pk.fcurves(cam, 'location', 2)
    fp = pk.fcurves(cam, 'rotation_euler', 0)
    fr = pk.fcurves(cam, 'rotation_euler', 1)
    for fcs, fn in ((fz, lambda t: z_amp * (0.6 * math.sin(2 * math.pi * 0.83 * t + ph[0]) +
                                            0.4 * math.sin(2 * math.pi * 1.37 * t + ph[1]))),
                    (fp, lambda t: math.radians(pitch_amp) * (0.6 * math.sin(2 * math.pi * 0.61 * t + ph[2]) +
                                                              0.4 * math.sin(2 * math.pi * 1.13 * t + ph[3]))),
                    (fr, lambda t: math.radians(roll_amp) * math.sin(2 * math.pi * 0.43 * t + ph[4]))):
        for fc in fcs:
            for kp in fc.keyframe_points:
                d = fn((kp.co[0] - 1) / pk.FPS)
                kp.co[1] += d
                kp.handle_left[1] += d
                kp.handle_right[1] += d
            fc.update()


LOOK_AHEAD = 11.0
LEAN, MAX_ROLL_DEG, ROLL_SIGMA_S = 2.4, 2.0, 0.7


def smooth_lean_roll(cam, ctx, look_ahead=LOOK_AHEAD, lean=LEAN, max_roll_deg=MAX_ROLL_DEG,
                     sigma_s=ROLL_SIGMA_S):
    """Lean into the bends without lurches (round 4). The kit keys the roll per frame (linear)
    as clamp(-lean * atan(k v^2 / g) / 2, +-max) with k a finite-difference curvature of the C1
    Catmull-Rom path 3.3 m ahead: k jumps at control points and wobbles near the S inflection
    (roll +1.49 deg at frame 108, -0.44 at 120, +2 at 152), and the hard clamp adds corners, so
    the sky swung 25 to 28 px against the town in 0.5 s and stopped dead. Same lean, Gaussian-
    smoothed over time (sigma_s) and soft-clamped with tanh, added to the roll keys of a
    camera driven with lean=0. Returns {frame: roll_deg}."""
    path, s_of_t = ctx.path, ctx.s_of_t
    fcs = pk.fcurves(cam, 'rotation_euler', 1)
    keyed = sorted({int(round(kp.co[0])) for fc in fcs for kp in fc.keyframe_points})
    frames = list(range(keyed[0], keyed[-1] + 1))
    raw = []
    for f in frames:
        t = (f - 1) / pk.FPS
        s = s_of_t(t)
        v = (s_of_t(t + 0.02) - s_of_t(t - 0.02)) / 0.04
        k = path.curvature(s + look_ahead * 0.3)
        raw.append(-lean * math.degrees(math.atan(k * v * v / 9.81)) * 0.5)
    sig = sigma_s * pk.FPS
    n = int(4 * sig) + 1
    g = np.exp(-0.5 * (np.arange(-n, n + 1) / sig) ** 2)
    g /= g.sum()
    sm = np.convolve(np.pad(np.array(raw), n, mode='edge'), g, mode='valid')
    roll = {f: max_roll_deg * math.tanh(float(r) / max_roll_deg) for f, r in zip(frames, sm)}
    for fc in fcs:
        for kp in fc.keyframe_points:
            d = math.radians(roll[int(round(kp.co[0]))])
            kp.co[1] += d
            kp.handle_left[1] += d
            kp.handle_right[1] += d
        fc.update()
    return roll


# ============================================================================ build
def build(ctx):
    global CORE_AZEL
    CORE_AZEL = plate_dir(*PLATE_CORE_PX)
    t0 = time.time()
    rng = random.Random(7)
    make_materials()
    # the car keeps to the right-hand lane (the centre line runs out of the bottom-left as a
    # leading line) and leans into the bends (smoothed lean added after the kit, see
    # smooth_lean_roll; the kit's own lean is off)
    cam = pk.camera.drive(PATH_PTS, speed_mps=SPEED, height=1.2, fov_v_deg=62, pitch_deg=CAM_PITCH,
                          look_ahead=LOOK_AHEAD, vibration=0.0, sway=0.04, lateral=CAM_LATERAL, lean=0.0,
                          max_roll_deg=MAX_ROLL_DEG)
    smooth_lean_roll(cam, ctx)
    gentle_float(cam)
    path = ctx.path
    if os.environ.get('MH_PLAN_ONLY'):
        inn_c = place(path, INN_S, INN_LAT, 0)
        nf = toward_road(path, INN_S, INN_LAT)
        plan(ctx, dict(c=inn_c, tf=Vector((-nf.y, nf.x, 0))), path)
        return
    town = ctx.collection('Town')
    props = ctx.collection('Props')
    far = ctx.collection('Far')

    # lane, mossy kerb stones
    # a real lane: worn asphalt with a dashed warm centre line and pale edge lines, wet film
    # with dry patches and puddles (reflections break into streaks and pools, not a mirror)
    lane = pk.mat.wet_asphalt(name='MH_Lane', base=(0.065, 0.062, 0.07), wetness=0.55, puddles=0.45,
                              puddle_scale=0.2, lane_markings=True, center_color=(0.85, 0.62, 0.16),
                              edge_color=(0.78, 0.78, 0.74), road_width=ROAD_W, dash=3.0, gap=5.5,
                              line_w=0.14, edge_inset=0.32, dry_rough=0.52, wet_rough=0.12,
                              puddle_rough=0.012, grain=0.42, streak=0.0, undulation=0.02, ripples=0.35)
    fade_bump_at_grazing(lane)
    lane_detail(lane)
    # web fallback only: the lane's mean albedo (wet film over dry patches, about 0.045; the
    # kit's wet_asphalt default 0.02 left the headlamp pool blue-black in the web edition) and
    # a gloss between the wet film (0.12) and the puddles (0.012), so the web mirror keeps
    # the shapes of the reflections instead of soft blobs
    pk._web(lane, base=(0.042, 0.04, 0.045), rough=0.07)
    for n_ in lane.node_tree.nodes:
        if n_.bl_idname == 'ShaderNodeMapRange' and abs(n_.inputs[1].default_value - 0.38) < 1e-4 \
                and abs(n_.inputs[2].default_value - 0.55) < 1e-4:
            n_.inputs[1].default_value, n_.inputs[2].default_value = 0.16, 0.26
    kerb = pk.mat.clay((0.22, 0.23, 0.27), name='MH_Kerb', roughness=0.45, bumps=0.8, grime=0.55)
    pk.geo.road_from_curve(path, width=ROAD_W, material=lane, curb=kerb, curb_height=0.11, collection=town,
                           s0=-30, s1=330)
    terrain(path, town)

    # hero, landmark, far focal point
    inn = stump_inn(path, town)
    chimney_smoke(inn['smoke'], town, cam)
    bell_tower(path, town)
    giant = giant_bloom(path, town)
    global GIANT_X, GIANT_Y
    GIANT_X, GIANT_Y = giant.x, giant.y
    sky_lanterns(path, town)

    def clear_of_giant(s_, lat_, rad):
        p_ = place(path, s_, lat_, 0.0)
        return (p_.x - giant.x) ** 2 + (p_.y - giant.y) ** 2 > (13.0 + rad) ** 2

    # front-row and second-row mushroom houses, both sides
    idx = 0
    infos = []
    for side in (-1, 1):
        s = -6.0 if side < 0 else -2.0
        while s < 205:
            w = rng.uniform(9.0, 12.5)
            sc = s + w / 2
            skip = (side > 0 and INN_S - 23 < sc < INN_S + 11) or (side < 0 and TOWER_S - 9 < sc < TOWER_S + 8)
            lat = side * rng.uniform(8.2, 10.2)
            if not skip and clear_of_giant(sc, lat, 6.0):
                tier = 'front' if sc < 150 else 'mid'
                infos.append((sc, lat, mushroom_house(path, sc, lat, rng, tier, town, idx, lights_on=sc < 170)))
                idx += 1
            s += w + rng.uniform(0.5, 2.5)
        s = 4.0 if side < 0 else 0.0
        while s < 240:
            w = rng.uniform(10, 14)
            sc = s + w / 2
            lat = side * rng.uniform(19.0, 26.0)
            if not (side > 0 and INN_S - 6 < sc < INN_S + 8) and clear_of_giant(sc, lat, 6.0):
                mushroom_house(path, sc, lat, rng, 'mid', town, idx, lights_on=sc < 170 and rng.random() < 0.85)
                idx += 1
            s += w + rng.uniform(1.0, 4.0)
    # stacked mushroom towers: the mid-distance skyline
    for k, (sc, lat) in enumerate([(84, 15.5), (96, -17.0), (112, 13.0), (122, -14.5), (138, 16.5), (150, -12.5),
                                   (166, 19.0), (178, -18.0), (188, 11.0), (226, -9.0), (238, 12.0),
                                   (104, 28.0), (132, -30.0), (160, 31.0), (196, -27.0)]):
        for tries in range(8):
            pp = place(path, sc, lat, 0.0)
            if all((pp.x - hx) ** 2 + (pp.y - hy) ** 2 > (hr + 6.5) ** 2 for hx, hy, hr in HOUSE_PTS):
                break
            sc += 4.0
        info = mushroom_house(path, sc, lat, rng, 'mid', town, idx, lights_on=sc < 170)
        idx += 1
        lift = info['h'] + info['Hc'] * 0.55
        for lev in range(1 + (k % 3 == 0)):
            inf2 = mushroom_house(path, sc, lat, rng, 'upper', town, idx, lights_on=False, lift=lift,
                                  scale=1.0 - 0.18 * lev)
            idx += 1
            lift += inf2['h'] + inf2['Hc'] * 0.55
    # slopes: many small houses climbing both sides (the dense skyline of windows)
    hill = 0
    for k in range(240):
        side = -1 if k % 2 else 1
        sc = rng.uniform(30, 300)
        lat = side * rng.uniform(28, 85)
        if sc > 220:
            lat = side * rng.uniform(8, 70)
        mushroom_house(path, sc, lat, rng, 'far', far, 1000 + hill, lights_on=False)
        hill += 1
    pk.log('houses built: %d near/mid, %d far (%.1f s)' % (idx, hill, time.time() - t0))
    # a few more smoking chimneys on lit houses along the lane
    picked = []
    for (cp, cs, cl) in sorted(CHIMNEYS, key=lambda c: c[1]):
        if 6.0 < cs < 110.0 and abs(cl) < 14.0 and all(abs(cs - q) > 14.0 for q in picked):
            chimney_smoke(cp, town, cam, n=9, seed=int(cs * 10))
            picked.append(cs)
        if len(picked) >= 4:
            break
    pk.log('chimney smoke on %d houses' % len(picked))

    # lanterns along the lane (alternating), toadstool lamps on both kerbs
    li = 0
    for i, s in enumerate(np.arange(4.0, 170.0, 10.5)):
        side = 1 if i % 2 == 0 else -1
        if side > 0 and INN_S - 8 < s < INN_S + 6:
            continue
        if s < 6.0:
            # round 4: the post at s 4 sat 4 m ahead at the top-right edge at t = 0 and was gone
            # by frame 4 (a bright flash-by in the opening frames, also mirrored on the dash)
            continue
        lantern_post(path, float(s), side * 3.55, props, li, warm=True, light=s < 150)
        li += 1
    # glowing toadstool lamps in clusters of 3 to 7 (one big lamp, smaller ones around it),
    # with gaps of moss and ferns between the clusters; mostly cyan and teal, some magenta,
    # violet now and then, rarely warm
    toads = toadstool_sources(props)
    tp = [[] for _ in range(5)]
    tsc = [[] for _ in range(5)]
    tcols = [(1.0, 0.55, 0.22), (0.2, 0.8, 1.0), (1.0, 0.22, 0.65), (0.55, 0.35, 1.0), (0.05, 1.0, 0.75)]
    trng = random.Random(23)
    k_total = [0]
    for side in (-1, 1):
        s = trng.uniform(0.0, 4.0)
        k = 0
        while s < 190:
            ci = trng.choices((1, 4, 2, 3, 0), weights=(34, 28, 20, 12, 6))[0]
            n = trng.randint(3, 7)
            lat0 = side * trng.uniform(3.4, 4.6 if trng.random() < 0.7 else 6.0)
            for q in range(n):
                a = trng.uniform(0, TAU)
                rr = 0.0 if q == 0 else trng.uniform(0.25, 1.0)
                lat = lat0 + math.sin(a) * rr * 0.7
                if abs(lat) < 3.15:
                    lat = side * trng.uniform(3.15, 3.4)
                p = place(path, s + math.cos(a) * rr, lat, 0.0)
                p.z = 0.11 if abs(lat) < 6.5 else p.z
                tp[ci].append(tuple(p))
                tsc[ci].append(trng.uniform(1.35, 1.9) if q == 0 else trng.uniform(0.45, 1.05))
            if k % 2 == 0 and s < 150:
                pk.lights.point(tuple(Vector(tp[ci][-n]) + Vector((0, 0, 0.6))), tcols[ci],
                                9.0, radius=0.1, shadow=False, name='ToadL', collection=props, volume=0.2)
            s += trng.uniform(6.0, 14.0)
            k += 1
            k_total[0] += 1
    pk.log('toadstool lamps: %d in %d clusters' % (sum(len(x) for x in tp), k_total[0]))
    for ci, nm in enumerate(('ToadsWarm', 'ToadsCool', 'ToadsMag', 'ToadsVio', 'ToadsTeal')):
        if tp[ci]:
            root = pk.geo.scatter(toads[ci], tp[ci], seed=3 + ci, scale=1.0, tilt_deg=10, name=nm, collection=props)
            for ob, sc_ in zip(sorted(root.children, key=lambda o: int(o.name.rsplit('_', 1)[1])), tsc[ci]):
                ob.scale = (sc_, sc_, sc_ * trng.uniform(0.85, 1.2))
    # ground layer: mossy hummocks, flat stones and pebbles along both verges
    mossy = moss_sources(props)
    mp = pk.geo.points_in_band(path, 220, 3.3, 9.5, s0=-5, s1=170, seed=71, min_dist=0.9)
    mp = [(p[0], p[1], 0.08) for p in mp]
    pk.geo.scatter(mossy[:3], mp, seed=72, scale=(0.35, 0.9), name='MossClumps', collection=props, tilt_deg=4)
    sp_ = pk.geo.points_in_band(path, 160, 3.0, 6.0, s0=-5, s1=170, seed=73, min_dist=0.6)
    sp_ = [(p[0], p[1], 0.1) for p in sp_]
    pk.geo.scatter(mossy[3:], sp_, seed=74, scale=(0.12, 0.4), name='Pebbles', collection=props, tilt_deg=8)

    # glowing fungi clusters, ferns, rocks along the verges and around houses
    fsrc = fungi_sources(props)
    fp = pk.geo.points_in_band(path, 170, 3.5, 9.0, s0=-5, s1=190, seed=31, min_dist=1.0)
    fp = [(p[0], p[1], 0.1) for p in fp]
    for (sc, lat, info) in infos[:60]:
        b0 = info['base']
        for q in range(3):
            a = info['a_face'] + rng.uniform(-1.4, 1.4)
            rr = info['r'] * 1.35 + rng.uniform(0.1, 0.5)
            fp.append((b0.x + math.cos(a) * rr, b0.y + math.sin(a) * rr, b0.z + 0.25))
    pk.geo.scatter(fsrc, fp, seed=5, scale=(0.7, 1.6), name='Fungi', collection=props)
    for i, p in enumerate(fp[:170:5]):
        col = ((0.1, 1.0, 0.8), (1.0, 0.25, 0.65), (0.55, 0.3, 1.0))[i % 3]
        pk.lights.point((p[0], p[1], p[2] + 0.35), col, 22.0, radius=0.15, shadow=False, name='FungiL',
                        collection=props, volume=0.3)
    bells = bell_sources(props)
    bp = pk.geo.points_in_band(path, 150, 3.4, 8.5, s0=-5, s1=190, seed=61, min_dist=1.2)
    bp = [(p[0], p[1], 0.1) for p in bp]
    pk.geo.scatter(bells, bp, seed=8, scale=(0.8, 1.4), name='Bells', collection=props)
    fences(path, props, random.Random(13))
    story_details(path, props, sorted(infos, key=lambda x: (x[1] > 0, x[0])), random.Random(17))
    ferns = fern_sources(props)
    fe = pk.geo.points_in_band(path, 260, 3.6, 12.0, s0=-5, s1=200, seed=41, min_dist=0.9)
    fe = [(p[0], p[1], 0.08) for p in fe]
    pk.geo.scatter(ferns, fe, seed=6, scale=(0.7, 1.5), name='Ferns', collection=props)
    rocks = rock_sources(props)
    rp = pk.geo.points_in_band(path, 90, 3.5, 14.0, s0=-5, s1=200, seed=51, min_dist=2.0)
    rp = [(p[0], p[1], 0.05) for p in rp]
    pk.geo.scatter(rocks, rp, seed=7, scale=(0.2, 0.7), name='Rocks', collection=props, tilt_deg=10)

    # festoons across the lane between wooden poles: catenary sag, small irregular bulbs,
    # strands at several heights and angles
    poles = BM()
    srng = random.Random(29)
    for s0, ds, cols in ((14.0, 2.5, [WARM, CYAN, MAGENTA]), (27.0, -2.0, [CYAN, WARM]),
                         (52.0, 3.0, [WARM, MAGENTA, CYAN]), (86.0, -1.5, [WARM, CYAN]),
                         (112.0, 2.0, [MAGENTA, WARM, CYAN]), (140.0, -2.5, [WARM, CYAN])):
        h0, h1 = srng.uniform(4.6, 6.6), srng.uniform(4.6, 6.6)
        p0 = path.offset(s0, -6.4, h0)
        p1 = path.offset(s0 + ds, 6.4, h1)
        festoon(p0, p1, sag=0.13 * (p1 - p0).length, colors=cols, seed=int(s0), coll=props)
        for pp in (p0, p1):
            poles.box(T(Vector((pp.x, pp.y, 0.0)) + Vector((0, 0, (pp.z + 0.3) / 2))), (0.18, 0.18, pp.z + 0.3),
                      radius=0.04, mi=0)
            poles.ico(T(Vector((pp.x, pp.y, pp.z + 0.32))) @ S3(0.13), sub=1, mi=1)

    poles.obj('StringPoles', [M.wood, M.brass], props, sharp=45)

    # giant old trunks near the start (their crowns are far above the frame), glowing shelf fungi
    tr = random.Random(9)
    for k, (s_, lat) in enumerate([(13, -16.5), (23, 17.5), (37, -18.5), (44, 24.0), (-4, 16.0)]):
        giant_tree(path, s_, lat, tr, town, k, height=70.0, fungi=True)
    # tiered firs on the slopes, between the houses and closing the far end of the hollow
    M.pine = leaf_mat('MH_Pine', (0.035, 0.085, 0.1), sss=0.08, rough=0.62)
    M.pine_far = leaf_mat('MH_PineFar', (0.03, 0.06, 0.09), sss=0.0, rough=0.75)

    def free(p, rad):
        return all((p.x - hx) ** 2 + (p.y - hy) ** 2 > (rad + hr + 1.0) ** 2 for hx, hy, hr in HOUSE_PTS)
    groups = [BM() for _ in range(4)]
    n_ok = 0
    for k in range(700):
        if n_ok >= 260:
            break
        side = -1 if k % 2 else 1
        s_ = tr.uniform(-20, 330)
        lat = side * tr.uniform(15, 125)
        if s_ > 235:
            lat = side * tr.uniform(0, 110)
            if abs(lat) < 6:
                continue
        H = tr.uniform(9, 20) * (1.0 + 0.6 * smooth(30, 110, abs(lat)) + 0.5 * smooth(220, 300, s_))
        R = H * tr.uniform(0.26, 0.34)
        p = place(path, s_, lat, 0.0)
        if not free(p, R):
            continue
        if abs(lat) < 17 + R:
            continue
        conifer(groups[n_ok % 4], p, tr, H, R)
        n_ok += 1
    for i, g in enumerate(groups):
        g.obj('Firs%d' % i, [M.bark, M.pine if i < 2 else M.pine_far], far, edge=False)
    pk.log('firs: %d' % n_ok)

    # fireflies
    # fireflies hover low over the verges (never in the car's corridor, so none pass the lens
    # as a big orb): small warm points that bloom softly
    ff = pk.geo.points_in_band(path, 300, 3.6, 10.0, s0=2, s1=90, z=0.0, seed=8)
    ff += pk.geo.points_in_band(path, 160, 10.0, 20.0, s0=10, s1=130, z=0.0, seed=18)
    ff = [(p[0], p[1], 0.3 + random.Random(i).uniform(0.0, 1.6 if i < 300 else 3.2)) for i, p in enumerate(ff)]
    pk.particles.fireflies(ff, color=(1.0, 0.88, 0.42), strength=60.0, radius=0.026, wander=0.35)
    # web fallback only: the blink (object colour noise) does not export, so every web firefly
    # glowed at its peak; use the blink's mean, about 0.5 of the peak
    pk._web(bpy.data.materials['Fireflies_mat'], base=(0, 0, 0), rough=1.0, emit=(1.0, 0.88, 0.42),
            emit_strength=30.0)

    # haze
    mid = path.at(205.0)
    pk.geo.fog(center=(mid.x, mid.y, 6.0), size=(320, 270, 50), density=0.00045, falloff=8.0,
               color=(0.2, 0.42, 1.0), anisotropy=0.5)

    # vehicle: kit dashboard of a rounded vintage car, A-pillars and a roof header
    build_vehicle(cam)
    car_ignores_lantern_spots()

    build_sky()
    # cool front fill from behind the car: keeps every road-facing form readable in blue
    pk.lights.sun(172.0, 34.0, color=(0.3, 0.45, 1.0), strength=0.6, angle_deg=3.0, shadow=True)
    pk.render.setup(exposure=VIEW_EXPOSURE, trace_max_roughness=0.32, motion_blur=0.2)
    # shadow budget: a bigger pool, coarser sun maps, shadows only on the nearest lanterns
    ctx.scene.eevee.shadow_pool_size = '1024'
    for ld in bpy.data.lights:
        if ld.type == 'SUN':
            ld.shadow_maximum_resolution = 0.03
        elif ld.use_shadow:
            ld.shadow_maximum_resolution = 0.006
    # tighter bloom that only catches the emitters, no chromatic dispersion (it fringed every
    # star), shorter road streaks so the near asphalt keeps its grain
    pk.comp.setup(bloom=0.42, bloom_threshold=1.9, bloom_size=0.34, bloom_saturation=1.5, glow=0.0,
                  distortion=-0.008, dispersion=0.0,
                  road_streak=0.7, road_streak_px=96, road_streak_threshold=0.8, vignette=0.28,
                  saturation=1.22, grain=0.014, star_glow=0.04, star_sparkle=0.0)
    widen_road_streak_mask(ctx.scene)
    if not os.environ.get("MH_NOCONTRAST"):
        comp_contrast(ctx.scene, COMP_CONTRAST, COMP_BLACK)
    # web edition only (hidden from the film render): painted lane lines as strips, and each
    # light's EEVEE cut-off distance
    web_lane_markings(path, town)
    web_light_ranges(ctx.scene)
    for kv in filter(None, os.environ.get('MH_DBG', '').split(',')):     # render experiments
        ee = ctx.scene.eevee
        if kv == 'rtoff':
            ee.use_raytracing = False
        elif kv == 'fastgi0':
            ee.use_fast_gi = False
        elif kv == 'noshadow':
            ee.use_shadows = False
        elif kv == 'nocomp':
            ctx.scene.render.use_compositing = False
        elif kv == 'noglass':
            ws = bpy.data.objects.get('Windshield')
            if ws is not None:
                ws.hide_render = True
        elif kv.startswith('thick='):
            ee.ray_tracing_options.screen_trace_thickness = float(kv[6:])
        elif kv.startswith('trace='):
            ee.ray_tracing_options.trace_max_roughness = float(kv[6:])
    pk.log('scene built (%.1f s)' % (time.time() - t0))

    if os.environ.get('MH_PLAN'):
        plan(ctx, inn, path)
    if os.environ.get('MH_PROBE'):
        # MH_PROBE=t,x0,y0,x1,y1: list mesh objects with vertices inside that frame region
        from bpy_extras.object_utils import world_to_camera_view
        tt, x0, y0, x1, y1 = (float(v) for v in os.environ['MH_PROBE'].split(','))
        ctx.scene.frame_set(int(1 + tt * 24))
        dg = bpy.context.evaluated_depsgraph_get()
        for o in ctx.scene.objects:
            if o.type != 'MESH' or o.hide_render:
                continue
            mw = o.matrix_world
            n_in = 0
            vs = o.data.vertices
            for vi in range(0, len(vs), max(1, len(vs) // 4000)):
                q = world_to_camera_view(ctx.scene, ctx.camera, mw @ vs[vi].co)
                if q.z > 0 and x0 <= q.x <= x1 and y0 <= 1.0 - q.y <= y1:
                    n_in += 1
            if n_in:
                pk.log('probe %s: %d verts' % (o.name, n_in))
    if os.environ.get('MH_STATS'):
        import re as _re
        agg = {}
        for o in ctx.scene.objects:
            if o.type != 'MESH' or o.hide_render or o.get('pk_noexport'):
                continue
            k = _re.sub(r'[0-9_]+$', '', o.name)
            v = agg.setdefault(k, [0, 0, 0])
            v[0] += 1
            v[1] += len(o.data.vertices)
            v[2] += len(o.data.loops)
        tot = sum(v[2] for v in agg.values())
        for k, v in sorted(agg.items(), key=lambda kv: -kv[1][2])[:25]:
            pk.log('%-18s n=%4d verts=%8d loops=%8d (%.1f%%)' % (k, v[0], v[1], v[2], 100.0 * v[2] / tot))
        pk.log('total loops %d' % tot)


def plan(ctx, inn, path):
    from bpy_extras.object_utils import world_to_camera_view
    sc = ctx.scene
    cam = ctx.camera
    tw = place(path, TOWER_S, TOWER_LAT, 0)
    gb = place(path, GIANT_S, GIANT_LAT, 0)
    pts = {'inn_c': inn['c'] + Vector((0, 0, 4)), 'inn_l': inn['c'] - inn['tf'] * 6.0 + Vector((0, 0, 3)),
           'inn_r': inn['c'] + inn['tf'] * 6.0 + Vector((0, 0, 3)),
           'tower': tw + Vector((0, 0, 10)), 'tower_top': tw + Vector((0, 0, 20)),
           'giant': gb + Vector((0, 0, 20)), 'giant_top': gb + Vector((0, 0, GIANT_H + 12.0))}
    far = 1.0e5
    for nm, (az, el) in (('core', CORE_AZEL), ('moon', (MOON_AZ, MOON_EL))):
        pts[nm] = Vector(pk.sky_dir(az, el)) * far
    for t in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9.5, 10, 12, 14]:
        sc.frame_set(int(1 + t * 24))
        row = []
        for k, p in pts.items():
            q = p + cam.matrix_world.translation if k in ('core', 'moon') else p
            v = world_to_camera_view(sc, cam, q)
            row.append('%s=(%.2f,%.2f)' % (k, v.x, 1.0 - v.y))
        pk.log('t=%4.1f s=%.1f heading=%.1f  ' % (t, ctx.s_of_t(t), math.degrees(-cam.rotation_euler.z)) + ' '.join(row))


pk.main(SLUG, build)
