"""Bed and soft toys, shelves and books, the board, mezzanine and telescope, the front-right corner, plants."""
import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

from room_lib import (TAU, bevel, bm_obj, bm_transform, box, box_bm, coll, cyl, cyl_bm, empty, instance, join_bms,
                      lathe, lathe_bm, plane, plane_bm, principled, ring_band, solidify, sphere, sphere_bm, subsurf,
                      torus, tube, tube_bm)
from room_materials import plush

D = math.radians


def grid_bm(nu, nv, fn):
    """Grid surface; fn(u, v) -> (x, y, z) with u, v in [0, 1]. UVs = (u, v)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    vs = [[bm.verts.new(fn(i / nu, j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new([vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]])
            for lp, (a, b) in zip(f.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]):
                lp[uvl].uv = (a / nu, b / nv)
    return bm


def vnoise(x, y, seed=0):
    """Cheap smooth value noise for cloth wrinkles (deterministic)."""
    return (math.sin(x * 1.7 + seed) * math.cos(y * 2.3 - seed * 0.7) * 0.5
            + math.sin(x * 4.1 + y * 3.3 + seed * 1.3) * 0.3 + math.sin(x * 9.7 - y * 7.1 + seed) * 0.2)


def _hash2(ix, iy, seed):
    h = (ix * 374761393 + iy * 668265263 + seed * 362437 + 1013904223) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffff) / 32767.5 - 1.0


def lattice_noise(x, y, seed=0):
    """Value noise on an integer lattice: irregular, no period (unlike sums of sines)."""
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = _hash2(ix, iy, seed), _hash2(ix + 1, iy, seed)
    c, d = _hash2(ix, iy + 1, seed), _hash2(ix + 1, iy + 1, seed)
    top = a + (b - a) * sx
    return top + (c + (d - c) * sx - top) * sy


def fbm2(x, y, seed=0, octaves=3, lac=2.13, gain=0.5):
    tot, amp, f, norm = 0.0, 1.0, 1.0, 0.0
    for o in range(octaves):
        tot += amp * lattice_noise(x * f + o * 5.31, y * f - o * 2.77, seed + o * 17)
        norm += amp
        amp *= gain
        f *= lac
    return tot / norm


# =============================================================================================
# Bed
# =============================================================================================
BX0, BX1, BY0, BY1 = 2.85, 4.85, 4.75, 6.52   # mattress footprint; head at +X (right wall), back at +Y
MATT_TOP = 0.58


def build_bed(M):
    C = coll('Bed')
    S = coll('Light_Strips')
    cx, cy = (BX0 + BX1) / 2, (BY0 + BY1) / 2
    box('Bed_Plinth', C, (BX1 - BX0 - 0.3, BY1 - BY0 - 0.3, 0.12), (cx, cy, 0.06), M['plastic_black'])
    box('Bed_Frame', C, (BX1 - BX0 + 0.14, BY1 - BY0 + 0.14, 0.24), (cx - 0.02, cy, 0.24), M['fabric_head'],
        bev=0.02, seg=3)
    # warm LED strip on the underside of the frame overhang (front and foot sides)
    strips = [box_bm((BX1 - BX0 + 0.1, 0.012, 0.008), (cx, BY0 - 0.04, 0.118)),
              box_bm((0.012, BY1 - BY0 + 0.08, 0.008), (BX0 - 0.06, cy, 0.118))]
    bm_obj(join_bms(strips), 'Strip_Bed_Under_Amber', S, M['led_amber'])
    box('Bed_Mattress', C, (BX1 - BX0, BY1 - BY0, 0.22), (cx, cy, 0.47), M['pillow'], bev=0.04, seg=4)
    # upholstered headboard with vertical channels, against the right wall
    hb = []
    n = 9
    for i in range(n):
        y = BY0 - 0.1 + (BY1 - BY0 + 0.2) * (i + 0.5) / n
        hb.append(box_bm((0.10, (BY1 - BY0 + 0.2) / n - 0.008, 0.95), (BX1 + 0.08, y, 0.62)))
    ob = bm_obj(join_bms(hb), 'Bed_Headboard', C, M['fabric_head'])
    bevel(ob, 0.03, 4, angle=60)

    # duvet: lofted, ~9 cm thick, draped over the front side and the foot with a rounded 9 cm edge.
    # Loft and hanging folds come from irregular 3-octave lattice noise (no regular period).
    dv = bm_obj(grid_bm(110, 90, duvet_surface), 'Bed_Duvet', C, M['duvet'], smooth=True)
    solidify(dv, 0.09, -1.0)
    subsurf(dv, 1, 2)
    build_pillows(M, C)
    build_throw(M, C)
    build_side_tables(M)
    build_toys(M)
    settle_toys(M)
    return C


DUV_EXT = 0.17
DUV_XA, DUV_XB, DUV_YA, DUV_YB = BX0 - DUV_EXT, BX1 - 0.42, BY0 - DUV_EXT, BY1 + 0.02
DUV_TOP = MATT_TOP + 0.075
DUV_R = 0.09

# where each soft toy sits on the bed: (x, y, footprint radius). The duvet gets a soft ~1.5 cm dent under each,
# and settle_toys() drops every toy onto whatever is under it (duvet, throw or pillow).
TOY_SPOTS = {
    'Toy_Sleepy_Moon': (4.00, 6.08, 0.24), 'Toy_Round_Dog': (3.02, 6.20, 0.11), 'Toy_Rabbit': (3.28, 6.28, 0.09),
    'Toy_Panda_Bear': (3.54, 6.26, 0.11), 'Toy_Penguin': (3.74, 6.12, 0.10), 'Toy_Seal': (3.08, 5.92, 0.10),
    'Toy_Cat': (4.00, 5.50, 0.10), 'Toy_Owl': (4.40, 5.30, 0.08),
}


def _dent(x, y):
    d = 0.0
    for (tx, ty, r) in TOY_SPOTS.values():
        q = ((x - tx) ** 2 + (y - ty) ** 2) / (r * r)
        if q < 6.0:
            d += 0.015 * math.exp(-q * 1.2)
    return d


def duvet_surface(u, v):
    x = DUV_XA + (DUV_XB - DUV_XA) * u
    y = DUV_YA + (DUV_YB - DUV_YA) * v
    dx = max(BX0 - x, 0.0)
    dy = max(BY0 - y, 0.0)
    e = max(dx, dy)
    loft = 0.040 + 0.026 * fbm2(x * 2.3, y * 2.3, 3) + 0.009 * fbm2(x * 7.5, y * 7.5, 9, 2)
    loft -= _dent(x, y)
    z = DUV_TOP + loft
    if u > 0.9:  # turned-back edge near the pillows
        z += 0.04 * math.sin((u - 0.9) / 0.1 * math.pi)
    corner = dx > 0 and dy > 0
    if corner:   # round the foot-front corner: radial distance from the mattress corner, so it falls as a soft cone
        e = math.hypot(dx, dy)
        ang = math.atan2(dy, dx)
    if e > 0:
        along = (x + y) if corner else (x if dy >= dx else y)
        rnd = min(e / DUV_R, 1.0)
        drop = DUV_R * (1 - math.cos(rnd * math.pi / 2)) + max(e - DUV_R, 0) * 3.2
        fold = fbm2(along * 4.2, e * 1.5, 21)
        z = DUV_TOP + loft * (1 - rnd) - drop + 0.010 * fold
        hem = 0.33 + 0.035 * fbm2(along * 2.6, 0.5, 33)
        z = max(z, hem)
        out = DUV_R * math.sin(rnd * math.pi / 2) + 0.028 * fold * min(max(e - DUV_R, 0) / 0.05, 1.0)
        if corner:
            x = BX0 - out * math.cos(ang)
            y = BY0 - out * math.sin(ang)
        elif dy >= dx and dy > 0:
            y = BY0 - out
        elif dx > dy:
            x = BX0 - out
    return (x, y, z)


def pillow_bm(W, L, T, seed, puff=1.0, pinch=0.07, flat=1.0, creases=3):
    """A stuffed pillow: two cloth panels sewn at the rim (top and bottom grids share the boundary verts).
    The middle puffs out, the corners pinch to 'ears', each side pulls in at its middle, and a few soft
    creases run in from the corners and edges. W along local X, L along local Y, thickness T along Z.
    flat < 1 squashes the bottom panel (a pillow lying on the bed)."""
    rng = random.Random(seed)
    nu, nv = 30, 22
    bm = bmesh.new()
    cr = []
    for _ in range(creases):
        cu, cv = rng.choice((-1, 1)), rng.choice((-1, 1))
        ang = math.atan2(-cv, -cu) + rng.uniform(-0.5, 0.5)        # running in from a corner
        cr.append((cu * rng.uniform(0.7, 1.0), cv * rng.uniform(0.5, 1.0), math.cos(ang), math.sin(ang),
                   rng.uniform(0.35, 0.7), rng.uniform(0.06, 0.11)))

    def pos(u, v, side):
        ex = 1.0 - pinch * (1.0 - v * v)
        ey = 1.0 - pinch * 1.3 * (1.0 - u * u)
        x, y = u * W / 2 * ex, v * L / 2 * ey
        f = max((1.0 - u * u) * (1.0 - v * v), 0.0) ** 0.42
        h = T / 2 * f * puff
        g = 0.0
        for (pu, pv, du, dv, length, width) in cr:
            ru, rv = u - pu, v - pv
            along = ru * du + rv * dv
            perp = -ru * dv + rv * du
            if 0.0 < along < length:
                g += math.exp(-(perp / width) ** 2) * math.sin(math.pi * along / length) ** 0.7
        lump = 0.06 * fbm2(u * 2.2 + seed, v * 2.2, seed, 2)
        if side > 0:
            z = h * (1.0 + lump) - 0.30 * T * f * min(g, 1.0) * 0.5
        else:
            z = -h * flat * (1.0 - 0.5 * lump)
        return (x, y, z)

    top = [[bm.verts.new(pos(-1 + 2 * i / nu, -1 + 2 * j / nv, 1)) for i in range(nu + 1)] for j in range(nv + 1)]
    bot = [[top[j][i] if (i in (0, nu) or j in (0, nv)) else bm.verts.new(pos(-1 + 2 * i / nu, -1 + 2 * j / nv, -1))
            for i in range(nu + 1)] for j in range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            bm.faces.new([top[j][i], top[j][i + 1], top[j + 1][i + 1], top[j + 1][i]])
            bm.faces.new([bot[j][i], bot[j + 1][i], bot[j + 1][i + 1], bot[j][i + 1]])
    rim = [top[0][i].co.copy() for i in range(nu + 1)] + [top[j][nu].co.copy() for j in range(1, nv + 1)] + \
          [top[nv][i].co.copy() for i in range(nu - 1, -1, -1)] + [top[j][0].co.copy() for j in range(nv - 1, -1, -1)]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm, rim


def build_pillows(M, C):
    """Four pillows: two upright against the headboard leaning back about 15 degrees, two lying in front of
    them (tilted a little onto the upright pair)."""
    hb_face = BX1 + 0.03
    specs = [
        # name, W, L, T, (y centre), mode, material, seed, roll
        ('Bed_Pillow_1', 0.68, 0.48, 0.19, 5.21, 'up', 'pillow', 11, D(3)),
        ('Bed_Pillow_2', 0.68, 0.48, 0.19, 6.05, 'up', 'pillow', 12, D(-2)),
        ('Bed_Pillow_3', 0.64, 0.44, 0.15, 5.26, 'flat', 'pillow_dark', 13, D(5)),
        ('Bed_Pillow_4', 0.64, 0.44, 0.15, 6.08, 'flat', 'pillow', 14, D(-7)),
    ]
    obs = []
    for name, W, Lp, T, yc, mode, mk, seed, roll in specs:
        if mode == 'up':
            bm, rim = pillow_bm(W, Lp, T, seed, puff=1.0, pinch=0.08)
            lean = D(15)
            s, c = math.sin(lean), math.cos(lean)
            X, Y, Z = Vector((0, 1, 0)), Vector((s, 0, c)), Vector((c, 0, -s))
            xc = hb_face - T / 2 * c * 0.8 - Lp / 2 * s
            zc = MATT_TOP + Lp / 2 * c + 0.004
        else:
            bm, rim = pillow_bm(W, Lp, T, seed, puff=0.85, pinch=0.07, flat=0.55)
            tilt = D(16)
            s, c = math.sin(tilt), math.cos(tilt)
            # local X -> world Y (across the bed), local Y -> toward the headboard and slightly up, Z up
            X, Y = Vector((0, 1, 0)), Vector((c, 0, s))
            Z = X.cross(Y)
            xc = hb_face - 0.44
            zc = MATT_TOP + 0.25
        R = Matrix((X, Y, Z)).transposed().to_4x4()
        R = Matrix.Rotation(roll, 4, 'Z') @ R
        ob = bm_obj(bm, name, C, M[mk], smooth=True, loc=(xc, yc, zc), rot=R.to_euler())
        subsurf(ob, 1, 2)
        pip = tube_bm(rim + [rim[0]], 0.0045, sides=6, cap=False)
        bm_obj(pip, name + '_Piping', C, M[mk], smooth=True, parent=ob)
        obs.append(ob)
    return obs


def _world_bvh(objs):
    """BVH of the evaluated (modifiers applied) meshes in world space."""
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for ob in objs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ob.matrix_world
        off = len(verts)
        verts.extend(mw @ v.co for v in me.vertices)
        polys.extend([off + i for i in p.vertices] for p in me.polygons)
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)


def settle_toys(M):
    """Drop every soft toy onto what is under it (dented duvet, throw, pillows) and lay a soft contact shadow
    under each, following the surface (render-only decals; the export skips the Render_Only collection)."""
    support = [o for o in bpy.data.objects if o.type == 'MESH' and (o.name in ('Bed_Duvet', 'Bed_Throw', 'Bed_Mattress')
                                                                   or o.name.startswith('Bed_Pillow_'))
               and not o.name.endswith('_Piping')]
    bvh = _world_bvh(support)
    R = coll('Render_Only')
    down = Vector((0, 0, -1))

    def hit(x, y):
        h = bvh.ray_cast(Vector((x, y, 2.0)), down)
        return h[0].z if h[0] is not None else MATT_TOP

    for name, (x, y, r) in TOY_SPOTS.items():
        root = bpy.data.objects[name]
        ring = [hit(x + 0.6 * r * math.cos(a), y + 0.6 * r * math.sin(a)) for a in [TAU * k / 8 for k in range(8)]]
        z = 0.45 * hit(x, y) + 0.55 * sum(ring) / len(ring) - 0.003
        root.location = (x, y, z)
        n = 14
        rr = r * 1.45

        def dec(u, v):
            px, py = x + (u - 0.5) * 2 * rr, y + (v - 0.5) * 2 * rr
            return (px, py, hit(px, py) + 0.0018)
        ob = bm_obj(grid_bm(n, n, dec), name + '_Contact', R, M['contact'], smooth=True)
        ob.visible_shadow = False
        ob.visible_glossy = False


def build_throw(M, C):
    """Knit throw (1.5 cm thick) lying on the duvet: it follows the duvet surface, picks up two soft folds where
    it rolls over the front edge, and its hanging end sags in the middle."""
    rng = random.Random(5)
    xa, xb = 3.18, 4.02
    ua, ub = (xa - DUV_XA) / (DUV_XB - DUV_XA), (xb - DUV_XA) / (DUV_XB - DUV_XA)
    vb = (6.42 - DUV_YA) / (DUV_YB - DUV_YA)
    eps = 1e-3

    def surf(u, v):
        p = Vector(duvet_surface(u, v))
        pu = Vector(duvet_surface(u + eps, v)) - Vector(duvet_surface(u - eps, v))
        pv = Vector(duvet_surface(u, v + eps)) - Vector(duvet_surface(u, v - eps))
        n = pu.cross(pv)
        n = n.normalized() if n.length > 1e-9 else Vector((0, 0, 1))
        if n.z < -0.2 or (abs(n.z) < 0.2 and n.y > 0):
            n = -n
        return p, n

    def throw(s_, t):
        # s_: across the band (0..1), t: from the back (0) over the bed and down the front (1)
        u = ua + (ub - ua) * s_
        u += 0.02 * math.sin(t * 3.0)
        v = vb * (1 - t / 0.86) if t < 0.86 else 0.0
        p, n = surf(u, max(v, 0.0))
        lift = 0.018 + 0.007 * fbm2(s_ * 5, t * 6, 41) + 0.012 * max(0.0, fbm2(s_ * 2.2, t * 3.4, 47))
        # one loose diagonal ridge where the throw was tossed on, and a rolled hem along both long edges
        lift += 0.016 * math.exp(-((s_ - 0.25 - 0.5 * t) / 0.07) ** 2) * (t < 0.7)
        lift += 0.008 * (math.exp(-(s_ / 0.03) ** 2) + math.exp(-((1 - s_) / 0.03) ** 2))
        edge = math.exp(-((t - 0.77) / 0.05) ** 2)          # rolling over the bed edge
        folds = edge * (0.022 * max(0.0, math.sin(s_ * math.pi * 2.0 + 0.6)) ** 2 + 0.01 * fbm2(s_ * 7, 1, 43))
        p = p + n * (lift + folds)
        if t > 0.86:  # hanging below the duvet hem, sagging in the middle of the band
            k = (t - 0.86) / 0.14
            sag = 0.06 * math.sin(math.pi * s_) + 0.015 * math.sin(s_ * 9.0)
            p = p + Vector((0.0, -0.02 * k + 0.012 * math.sin(s_ * 7.0) * k, -(0.12 + sag) * k))
        return (p.x, p.y, p.z)

    th = bm_obj(grid_bm(36, 140, lambda a, b: throw(a, b)), 'Bed_Throw', C, M['knit'], smooth=True)
    solidify(th, 0.02, 0.0)
    subsurf(th, 1, 2)
    fr = []
    for k in range(64):
        s_ = (k + 0.5) / 64
        x0, y0, z0 = throw(s_, 1.0)
        ln = rng.uniform(0.06, 0.08)
        sw = rng.uniform(-0.012, 0.012)
        pts = [Vector((x0 + sw * (i / 4) ** 2, y0 - 0.004 - 0.006 * (i / 4), z0 - ln * i / 4)) for i in range(5)]
        fr.append(tube_bm(pts, 0.0026, sides=5, radii=[0.0032, 0.0028, 0.0026, 0.0024, 0.0018]))
    bm_obj(join_bms(fr), 'Bed_Throw_Fringe', C, M['knit'], smooth=True)


def build_side_tables(M):
    C = coll('Bed')
    L = coll('Lamps')
    for side, x, y in (('Head', 4.62, 4.36), ('Foot', 2.55, 6.34)):
        box(f'Side_Table_{side}', C, (0.46, 0.42, 0.52), (x, y, 0.26), M['wood'], bev=0.006)
        box(f'Side_Table_{side}_Drawer', C, (0.42, 0.004, 0.16), (x, y - 0.212, 0.36), M['wood'], bev=0.002)
        box(f'Side_Table_{side}_Pull', C, (0.12, 0.012, 0.012), (x, y - 0.218, 0.36), M['brass'], bev=0.003)
        lamp = empty(f'Globe_Lamp_{side}', L, (x + 0.05, y + 0.03, 0.52))
        lathe(f'Globe_Lamp_{side}_Base', L, [(0, 0), (0.07, 0), (0.072, 0.006), (0.05, 0.016), (0.012, 0.024),
                                             (0.010, 0.26), (0.03, 0.27), (0.0, 0.272)], (0, 0, 0), M['brass'],
              parent=lamp)
        g = sphere(f'Globe_Lamp_{side}_Globe', L, 0.13, (0, 0, 0.39), M['globe'], parent=lamp, seg=48, rings=24)
        g.visible_shadow = False
        box(f'Side_Table_{side}_Book', C, (0.16, 0.22, 0.03), (x - 0.12, y - 0.06, 0.535), M['ceramic_pot'],
            rot=(0, 0, D(12)))
    # the large original night-sky canvas (2.3 x 1.35 m) centred above the bed on the right wall, in a slim dark
    # bronze float frame, with a warm 2700 K wall-washer strip in a slot above it (its light is in build_lights)
    pw, ph = 2.30, 1.35
    pf = empty('Bed_Wall_Painting', C, (4.995, 5.48, 2.12), (0, 0, 0))
    plane('Bed_Wall_Painting_Canvas', C, pw, ph, (-0.032, 0, 0), (D(90), 0, D(-90)), M['canvas'],
          uv=(0.0, 0.03, 1.0, 0.97), parent=pf)
    box('Bed_Wall_Painting_Stretcher', C, (0.028, pw, ph), (-0.016, 0, 0), M['wood'], parent=pf)
    fr = []
    t = 0.022
    for (sy, sz, y, z) in ((pw + 2 * t + 0.02, t, 0, ph / 2 + 0.01 + t / 2), (pw + 2 * t + 0.02, t, 0, -ph / 2 - 0.01 - t / 2),
                           (t, ph + 0.02, pw / 2 + 0.01 + t / 2, 0), (t, ph + 0.02, -pw / 2 - 0.01 - t / 2, 0)):
        fr.append(box_bm((0.045, sy, sz), (-0.0225, y, z)))
    ob = bm_obj(join_bms(fr), 'Bed_Wall_Painting_Frame', C, M['brass_dark'], parent=pf)
    bevel(ob, 0.003, 2)
    box('Bed_Wall_Washer_Housing', C, (0.07, pw + 0.10, 0.035), (-0.035, 0, ph / 2 + 0.16), M['steel_dark'], parent=pf,
        bev=0.004)
    box('Strip_Bed_Wall_Washer', coll('Light_Strips'), (0.012, pw + 0.04, 0.004), (-0.050, 0, ph / 2 + 0.141),
        M['led_warm'], parent=pf)
    return C


# =============================================================================================
# Soft toys: original creatures built from rounded primitives, faces toward -Y
# =============================================================================================

def _sp(name, C, r, loc, mat, parent, scale=(1, 1, 1), rot=(0, 0, 0), seg=40, rings=20, sub=1):
    ob = sphere(name, C, r, loc, mat, seg=seg, rings=rings, scale=scale, rot=rot, parent=parent)
    if sub:
        subsurf(ob, sub, sub)
    return ob


def surf(c, r, s, az, el, out=0.0):
    """Point on an ellipsoid (centre c, radius r, scale s) seen at azimuth az (0 = -Y face) and elevation el."""
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    return Vector((c[0] + (r + out) * s[0] * d.x, c[1] + (r + out) * s[1] * d.y, c[2] + (r + out) * s[2] * d.z))


def eyes(prefix, C, parent, M, c, r, s, az=0.36, el=0.12, er=0.014, closed=False, smile=True, blush=None,
         mouth='w', nose=None, style='bead'):
    """Face on an ellipsoid head. style: 'bead' (small glossy beads), 'big' (large glossy beads with a big
    highlight), 'dash' (short embroidered thread dashes); closed=True gives sleepy arcs."""
    if closed:
        for sgn in (-1, 1):
            pts = []
            for k in range(9):
                t = k / 8
                a = sgn * az + (t - 0.5) * 0.30
                e = el + 0.05 * math.sin(math.pi * t) * -1
                pts.append(surf(c, r, s, a, e, 0.001))
            tube(f'{prefix}_Eye_{sgn}', C, pts, er * 0.22, M['eye'], sides=6, parent=parent)
    elif style == 'dash':
        for sgn in (-1, 1):
            pts = [surf(c, r, s, sgn * az + (t - 0.5) * 0.16, el + 0.012 * (t - 0.5) * sgn, 0.0008)
                   for t in (0.0, 0.5, 1.0)]
            tube(f'{prefix}_Eye_{sgn}', C, pts, er * 0.26, M['thread'], sides=6, parent=parent)
    else:
        big = style == 'big'
        rr = er * (1.35 if big else 1.0)
        for sgn in (-1, 1):
            p = surf(c, r, s, sgn * az, el, -rr * 0.35)
            sphere(f'{prefix}_Eye_{sgn}', C, rr, tuple(p), M['eye'], parent=parent, seg=24, rings=12,
                   scale=(1, 0.6, 1.15))
            h = surf(c, r, s, sgn * az + 0.07, el + 0.07, rr * 0.15)
            sphere(f'{prefix}_EyeHi_{sgn}', C, rr * (0.36 if big else 0.28), tuple(h), M['eye_hi'], parent=parent,
                   seg=10, rings=6)
            if big:
                h2 = surf(c, r, s, sgn * az - 0.04, el - 0.05, rr * 0.15)
                sphere(f'{prefix}_EyeHi2_{sgn}', C, rr * 0.14, tuple(h2), M['eye_hi'], parent=parent, seg=8, rings=4)
    if nose is not None:
        p = surf(c, r, s, 0.0, el - 0.16, -0.002)
        sphere(f'{prefix}_Nose', C, nose[0], tuple(p), nose[1], parent=parent, seg=16, rings=8,
               scale=(1.3, 0.8, 0.9))
    if mouth == 'o':
        p = surf(c, r, s, 0.0, el - 0.30, 0.0)
        torus(f'{prefix}_Mouth', C, er * 0.6, er * 0.2, tuple(p), M['eye'], rot=(D(90), 0, 0), parent=parent,
              seg=16, sides=5)
    elif mouth:
        pts = []
        y_el = el - 0.30
        if mouth == 'w':
            for k in range(13):
                t = k / 12
                a = (t - 0.5) * 0.36
                e = y_el - 0.045 * abs(math.sin(t * 2 * math.pi))
                pts.append(surf(c, r, s, a, e, 0.0006))
        else:
            for k in range(9):
                t = k / 8
                a = (t - 0.5) * 0.26
                e = y_el - 0.05 * math.sin(math.pi * t)
                pts.append(surf(c, r, s, a, e, 0.0006))
        tube(f'{prefix}_Mouth', C, pts, er * 0.16, M['eye'], sides=5, parent=parent)
    if blush is not None:
        for sgn in (-1, 1):
            p = surf(c, r, s, sgn * (az + 0.30), el - 0.20, -0.004)
            sphere(f'{prefix}_Blush_{sgn}', C, er * 1.3, tuple(p), blush, parent=parent, seg=16, rings=8,
                   scale=(1.2, 0.35, 0.75), rot=(0, 0, sgn * (az + 0.3)))


def seam(name, C, parent, c, r, s, mat, el0=-0.6, el1=1.45, az=0.0):
    """A sewn seam line running over a head/body from front-bottom to the back."""
    pts = [surf(c, r, s, az, el0 + (el1 - el0) * k / 16, 0.0004) for k in range(17)]
    tube(name, C, pts, r * 0.018, mat, sides=5, parent=parent)


def build_toys(M):
    C = coll('Soft_Toys')
    pm = {}

    def mat(key, col):
        if key not in pm:
            pm[key] = plush('Plush_' + key, col)
        return pm[key]

    blush = principled('Plush_Blush', (0.85, 0.30, 0.36), rough=0.9, sheen=1.0)
    z = MATT_TOP + 0.10   # sitting on the lofted duvet

    def dark(key, col):
        return mat(key + '_seam', tuple(c_ * 0.45 for c_ in col))

    # 1. The Sleepy Moon: very large round creature of our own design. Indigo, no belly patch: a pale-gold
    #    embroidered crescent and star on its tummy, a floppy star-dotted nightcap instead of ears, tiny 'o' mouth.
    r = empty('Toy_Sleepy_Moon', C, (4.10, 6.10, z - 0.02), (D(-10), 0, D(-34)))
    body_c, body_r, body_s = (0, 0, 0.26), 0.26, (1.08, 0.90, 0.96)
    moon_col = (0.11, 0.085, 0.34)
    _sp('Toy_Moon_Body', C, body_r, body_c, mat('moon', moon_col), r, body_s, seg=64, rings=32)
    for sgn in (-1, 1):
        _sp(f'Toy_Moon_Arm_{sgn}', C, 0.07, (sgn * 0.258, -0.06, 0.19), mat('moon', None), r, (0.7, 0.9, 1.2),
            rot=(0, sgn * D(22), 0))
        _sp(f'Toy_Moon_Foot_{sgn}', C, 0.07, (sgn * 0.12, -0.15, 0.05), mat('moon', None), r, (1.0, 0.85, 0.65))
    eyes('Toy_Moon', C, r, M, body_c, body_r, body_s, az=0.28, el=0.32, er=0.02, closed=True, mouth='o')
    gold = mat('moon_gold', (0.78, 0.58, 0.22))
    # embroidered crescent on the tummy (a thick arc) and a small four-point star beside it
    pts, rad = [], []
    for k in range(19):
        t = k / 18
        th = 0.95 + (2 * math.pi - 1.9) * t        # a 'C' opening toward the viewer's right
        pts.append(surf(body_c, body_r, body_s, -0.15 + 0.15 * math.cos(th), -0.34 + 0.15 * math.sin(th), 0.002))
        rad.append(0.003 + 0.012 * math.sin(math.pi * t))
    tube('Toy_Moon_Crescent', C, pts, 0.01, gold, sides=8, parent=r, radii=rad)
    sc = surf(body_c, body_r, body_s, 0.14, -0.26, 0.003)
    for k in range(2):
        a = k * math.pi / 2
        d = Vector((math.cos(a) * 0.026, 0, math.sin(a) * 0.026))
        tube(f'Toy_Moon_Star_{k}', C, [sc - d, sc, sc + d], 0.005, gold, sides=6, parent=r,
             radii=[0.001, 0.006, 0.001])
    # nightcap: cuff ring + a cone that flops over to one side, ending in a pompom
    cap_base = Vector((0.02, 0.01, 0.47))
    torus('Toy_Moon_Cap_Cuff', C, 0.13, 0.03, tuple(cap_base), mat('cap_cuff', (0.70, 0.66, 0.78)),
          rot=(D(-8), D(10), 0), parent=r, seg=40, sides=12)
    path, radii = [], []
    for k in range(16):
        t = k / 15
        ang = t ** 1.6 * 2.3
        path.append(cap_base + Vector((0.28 * (1 - math.cos(ang)) * 0.75, 0.02 * t, 0.26 * math.sin(ang) * 0.75)))
        radii.append(0.12 * (1 - t) ** 0.9 + 0.012)
    tube('Toy_Moon_Cap', C, path, 0.1, mat('cap', (0.20, 0.07, 0.42)), sides=20, parent=r, radii=radii)
    _sp('Toy_Moon_Cap_Pompom', C, 0.045, tuple(path[-1] + Vector((0.02, 0, -0.03))),
        mat('cap_cuff', None), r)
    for k, t in enumerate((0.25, 0.45, 0.62)):
        i = int(t * 15)
        q = path[i] + Vector((0, -radii[i] * 0.97, 0))
        sphere(f'Toy_Moon_Cap_Dot_{k}', C, 0.009, tuple(q), gold, parent=r, seg=12, rings=6, scale=(1, 0.4, 1))

    # 2. Round dog
    r = empty('Toy_Round_Dog', C, (3.02, 6.20, z), (0, 0, D(-12)))
    tan, cream = mat('dog', (0.50, 0.22, 0.07)), mat('dog_cream', (0.80, 0.68, 0.52))
    _sp('Toy_Dog_Body', C, 0.115, (0, 0.02, 0.095), tan, r, (1.0, 0.95, 0.85))
    _sp('Toy_Dog_Chest', C, 0.08, (0, -0.06, 0.085), cream, r, (1.0, 0.6, 0.9))
    hc, hr, hs = (0, -0.02, 0.235), 0.105, (1.08, 0.95, 0.92)
    _sp('Toy_Dog_Head', C, hr, hc, tan, r, hs)
    _sp('Toy_Dog_Muzzle', C, 0.052, (0, -0.105, 0.205), cream, r, (1.25, 0.8, 0.75))
    for sgn in (-1, 1):
        ear = cyl(f'Toy_Dog_Ear_{sgn}', C, 0.035, 0.065, (sgn * 0.06, -0.01, 0.325), tan, r2=0.006,
                  rot=(D(-8), sgn * D(22), 0), parent=r, seg=16)
        subsurf(ear, 1)
        _sp(f'Toy_Dog_Paw_{sgn}', C, 0.035, (sgn * 0.052, -0.072, 0.026), cream, r, (1, 1.25, 0.8))
    eyes('Toy_Dog', C, r, M, hc, hr, hs, az=0.40, el=0.18, er=0.014, mouth='w', blush=blush,
         nose=(0.012, M['eye']), style='big')
    seam('Toy_Dog_Seam', C, r, hc, hr, hs, dark('dog', (0.50, 0.22, 0.07)), el0=0.75, el1=2.2)
    tube('Toy_Dog_Tail', C, [Vector((0, 0.12, 0.12)), Vector((0.02, 0.15, 0.17)), Vector((0.0, 0.13, 0.21)),
                             Vector((-0.02, 0.11, 0.19))], 0.018, cream, sides=10, parent=r)

    # 3. Rabbit
    r = empty('Toy_Rabbit', C, (3.28, 6.28, z), (0, 0, D(-18)))
    white = mat('rabbit', (0.80, 0.78, 0.76))
    pink = mat('rabbit_pink', (0.85, 0.45, 0.48))
    _sp('Toy_Rabbit_Body', C, 0.095, (0, 0, 0.095), white, r, (1.0, 0.9, 1.05))
    hc, hr, hs = (0, -0.01, 0.235), 0.088, (1.05, 0.95, 0.95)
    _sp('Toy_Rabbit_Head', C, hr, hc, white, r, hs)
    for sgn in (-1, 1):
        _sp(f'Toy_Rabbit_Ear_{sgn}', C, 0.03, (sgn * 0.04, 0.0, 0.38), white, r, (0.85, 0.45, 3.0),
            rot=(D(-6), sgn * D(14), 0))
        _sp(f'Toy_Rabbit_EarIn_{sgn}', C, 0.019, (sgn * 0.0405, -0.011, 0.375), pink, r, (0.75, 0.25, 2.6),
            rot=(D(-6), sgn * D(14), 0))
        _sp(f'Toy_Rabbit_Foot_{sgn}', C, 0.035, (sgn * 0.048, -0.062, 0.026), white, r, (0.9, 1.4, 0.7))
        _sp(f'Toy_Rabbit_Cheek_{sgn}', C, 0.03, (sgn * 0.026, -0.085, 0.208), white, r, (1, 0.8, 0.85))
    eyes('Toy_Rabbit', C, r, M, hc, hr, hs, az=0.42, el=0.16, er=0.013, mouth=None, blush=blush,
         nose=(0.008, pink), style='dash')
    seam('Toy_Rabbit_Seam', C, r, hc, hr, hs, dark('rabbit', (0.80, 0.78, 0.76)), el0=0.7, el1=2.2)

    # 4. Panda-like bear
    r = empty('Toy_Panda_Bear', C, (3.54, 6.26, z), (0, 0, D(-24)))
    w, k = mat('panda', (0.80, 0.79, 0.76)), mat('panda_black', (0.018, 0.018, 0.022))
    _sp('Toy_Panda_Body', C, 0.11, (0, 0, 0.11), w, r, (1.0, 0.9, 1.0))
    hc, hr, hs = (0, -0.01, 0.27), 0.10, (1.1, 0.95, 0.95)
    _sp('Toy_Panda_Head', C, hr, hc, w, r, hs)
    for sgn in (-1, 1):
        _sp(f'Toy_Panda_Ear_{sgn}', C, 0.035, (sgn * 0.085, 0.0, 0.355), k, r, (1, 0.6, 1))
        _sp(f'Toy_Panda_Arm_{sgn}', C, 0.045, (sgn * 0.095, -0.05, 0.13), k, r, (0.8, 0.9, 1.4),
            rot=(D(25), sgn * D(-20), 0))
        _sp(f'Toy_Panda_Leg_{sgn}', C, 0.045, (sgn * 0.058, -0.066, 0.040), k, r, (1, 1.2, 0.85))
        p = surf(hc, hr, hs, sgn * 0.40, 0.14, -0.012)
        _sp(f'Toy_Panda_Patch_{sgn}', C, 0.03, tuple(p), k, r, (1.0, 0.45, 1.3), rot=(0, sgn * D(-30), sgn * 0.4))
    eyes('Toy_Panda', C, r, M, hc, hr, hs, az=0.40, el=0.14, er=0.0125, mouth='smile', nose=(0.011, k))
    seam('Toy_Panda_Seam', C, r, hc, hr, hs, dark('panda', (0.80, 0.79, 0.76)), el0=0.75, el1=2.2)
    _sp('Toy_Panda_Muzzle', C, 0.035, (0, -0.095, 0.245), w, r, (1.2, 0.6, 0.8))

    # 5. Penguin
    r = empty('Toy_Penguin', C, (3.74, 6.12, z), (0, 0, D(-34)))
    navy, belly, orange = mat('penguin', (0.010, 0.014, 0.035)), mat('penguin_belly', (0.80, 0.79, 0.77)), \
        mat('penguin_orange', (0.95, 0.38, 0.04))
    bc, br, bs = (0, 0, 0.15), 0.11, (1.0, 0.92, 1.4)
    _sp('Toy_Penguin_Body', C, br, bc, navy, r, bs)
    _sp('Toy_Penguin_Belly', C, 0.10, (0, -0.052, 0.14), belly, r, (0.98, 0.58, 1.38))
    fc, fr_, fs = (0, -0.052, 0.238), 0.082, (1.10, 0.58, 0.80)
    _sp('Toy_Penguin_Face', C, fr_, fc, belly, r, fs)
    cyl('Toy_Penguin_Beak', C, 0.017, 0.035, tuple(surf(fc, fr_, fs, 0, -0.15, 0.008)), orange, r2=0.002,
        rot=(D(90), 0, 0), parent=r, seg=16)
    for sgn in (-1, 1):
        _sp(f'Toy_Penguin_Flipper_{sgn}', C, 0.05, (sgn * 0.105, 0.0, 0.14), navy, r, (0.35, 0.8, 1.5),
            rot=(0, sgn * D(18), 0))
        _sp(f'Toy_Penguin_Foot_{sgn}', C, 0.03, (sgn * 0.04, -0.068, 0.020), orange, r, (1.1, 1.5, 0.55))
    eyes('Toy_Penguin', C, r, M, fc, fr_, fs, az=0.42, el=0.22, er=0.012, mouth=None, style='big')

    # 6. Seal (lying, front row)
    r = empty('Toy_Seal', C, (3.08, 5.92, z - 0.01), (0, 0, D(-8)))
    seal = mat('seal', (0.70, 0.72, 0.76))
    _sp('Toy_Seal_Body', C, 0.085, (0, 0.06, 0.07), seal, r, (1.0, 1.9, 0.82))
    hc, hr, hs = (0, -0.09, 0.1), 0.085, (1.12, 0.95, 0.95)
    _sp('Toy_Seal_Head', C, hr, hc, seal, r, hs)
    for sgn in (-1, 1):
        _sp(f'Toy_Seal_Flipper_{sgn}', C, 0.04, (sgn * 0.070, -0.02, 0.034), seal, r, (0.5, 1.2, 0.36),
            rot=(0, sgn * D(-25), sgn * D(30)))
        _sp(f'Toy_Seal_Tail_{sgn}', C, 0.035, (sgn * 0.03, 0.22, 0.03), seal, r, (0.6, 1.2, 0.3),
            rot=(0, 0, sgn * D(-25)))
    eyes('Toy_Seal', C, r, M, hc, hr, hs, az=0.42, el=0.12, er=0.016, mouth='w', nose=(0.008, M['eye']),
         style='big')
    seam('Toy_Seal_Seam', C, r, hc, hr, hs, dark('seal', (0.70, 0.72, 0.76)), el0=0.6, el1=2.0)

    # 7. Cat (loaf, front row) with closed happy eyes
    r = empty('Toy_Cat', C, (4.02, 5.48, z - 0.01), (0, 0, D(-44)))
    grey, wht = mat('cat', (0.36, 0.34, 0.33)), mat('cat_white', (0.82, 0.80, 0.77))
    _sp('Toy_Cat_Body', C, 0.10, (0, 0.04, 0.062), grey, r, (1.0, 1.35, 0.62))
    hc, hr, hs = (0, -0.09, 0.10), 0.085, (1.12, 0.92, 0.88)
    _sp('Toy_Cat_Head', C, hr, hc, grey, r, hs)
    _sp('Toy_Cat_Face', C, 0.055, (0, -0.135, 0.085), wht, r, (1.35, 0.6, 0.85))
    for sgn in (-1, 1):
        ear = cyl(f'Toy_Cat_Ear_{sgn}', C, 0.03, 0.05, (sgn * 0.05, -0.09, 0.172), grey, r2=0.004,
                  rot=(D(-5), sgn * D(18), 0), parent=r, seg=16)
        subsurf(ear, 1)
        _sp(f'Toy_Cat_Paw_{sgn}', C, 0.028, (sgn * 0.04, -0.125, 0.024), wht, r, (1, 1.3, 0.7))
    # tabby stripes on the back
    for i in range(4):
        y = -0.02 + i * 0.045
        pts = [surf((0, 0.04, 0.062), 0.10, (1.0, 1.35, 0.62), a, 0.5, 0.0) for a in (-1.2, -0.6, 0, 0.6, 1.2)]
        pts = [Vector((p.x, y + 0.01 * math.cos(p.x * 20), p.z)) for p in
               [surf((0, 0.04, 0.062), 0.101, (1.0, 1.35, 0.62), math.pi / 2 * s, 0.9 - abs(s) * 0.8, 0)
                for s in (-0.9, -0.45, 0, 0.45, 0.9)]]
        tube(f'Toy_Cat_Stripe_{i}', C, pts, 0.006, mat('cat_dark', (0.12, 0.11, 0.11)), sides=6, parent=r)
    eyes('Toy_Cat', C, r, M, hc, hr, hs, az=0.40, el=0.14, er=0.016, closed=True, mouth='w', blush=blush,
         nose=(0.007, blush))
    tube('Toy_Cat_Tail', C, [Vector((0.09, 0.18, 0.03)), Vector((0.12, 0.05, 0.03)), Vector((0.09, -0.08, 0.025))],
         0.016, grey, sides=10, parent=r)

    # 8. Small owl perched on the right pillow
    r = empty('Toy_Owl', C, (4.25, 5.28, z), (0, 0, D(-55)))
    owl, owl_l = mat('owl', (0.30, 0.17, 0.08)), mat('owl_light', (0.80, 0.66, 0.46))
    bc, br, bs = (0, 0, 0.085), 0.08, (1.0, 0.9, 1.1)
    _sp('Toy_Owl_Body', C, br, bc, owl, r, bs)
    _sp('Toy_Owl_Belly', C, 0.06, (0, -0.04, 0.075), owl_l, r, (0.9, 0.5, 1.0))
    for sgn in (-1, 1):
        p = surf(bc, br, bs, sgn * 0.33, 0.35, -0.01)
        _sp(f'Toy_Owl_Disc_{sgn}', C, 0.028, tuple(p), owl_l, r, (1, 0.35, 1), rot=(0, 0, sgn * 0.33))
        ear = cyl(f'Toy_Owl_Tuft_{sgn}', C, 0.018, 0.04, (sgn * 0.045, 0.0, 0.17), owl, r2=0.003,
                  rot=(0, sgn * D(25), 0), parent=r, seg=12)
    eyes('Toy_Owl', C, r, M, bc, br, bs, az=0.33, el=0.35, er=0.012, mouth=None,
         nose=(0.008, mat('penguin_orange', None)), style='big')
    return C


# =============================================================================================
# Shelves, books, ornaments
# =============================================================================================
ATLAS_NX, ATLAS_NY = 32, 2


def _cell_uv(idx):
    i, j = idx % ATLAS_NX, idx // ATLAS_NX
    u0, u1 = i / ATLAS_NX, (i + 1) / ATLAS_NX
    v1 = 1.0 - j / ATLAS_NY
    v0 = v1 - 1.0 / ATLAS_NY
    return u0, v0, u1, v1


def book_into(bm, uvl, x, y_front, z, w, h, d, cell, lean=0.0, page_cell=63):
    """Book with spine facing -Y. The spine bows out a few millimetres (a rounded back); the shelf mesh gets
    a 2 mm bevel. Leans about the Y axis around its bottom corner when lean != 0."""
    u0, v0, u1, v1 = _cell_uv(cell)
    pu0, pv0, pu1, pv1 = _cell_uv(page_cell)
    um = (u0 + u1) / 2
    cu = (u0 + 0.002, v0 + 0.1 * (v1 - v0), u0 + 0.006, v1 - 0.1 * (v1 - v0))  # cover strip
    bulge = min(0.0035, w * 0.10)
    P = [Vector((0, 0, 0)), Vector((w, 0, 0)), Vector((w, d, 0)), Vector((0, d, 0)),
         Vector((0, 0, h)), Vector((w, 0, h)), Vector((w, d, h)), Vector((0, d, h)),
         Vector((w / 2, -bulge, 0)), Vector((w / 2, -bulge, h))]
    if lean:
        rot = Matrix.Rotation(lean, 3, 'Y')
        piv = Vector((0, 0, 0)) if lean < 0 else Vector((w, 0, 0))
        P = [rot @ (p - piv) + piv for p in P]
    vs = [bm.verts.new(p + Vector((x, y_front, z))) for p in P]

    def face(idx, uvs):
        f = bm.faces.new([vs[i] for i in idx])
        for lp, uv in zip(f.loops, uvs):
            lp[uvl].uv = uv

    face((0, 8, 9, 4), [(u0, v0), (um, v0), (um, v1), (u0, v1)])  # spine (-Y), two halves of a shallow bow
    face((8, 1, 5, 9), [(um, v0), (u1, v0), (u1, v1), (um, v1)])
    face((4, 9, 5, 6, 7), [(pu0, pv0), ((pu0 + pu1) / 2, pv0), (pu1, pv0), (pu1, pv1), (pu0, pv1)])  # top
    face((1, 2, 6, 5), [(cu[0], cu[1]), (cu[2], cu[1]), (cu[2], cu[3]), (cu[0], cu[3])])
    face((3, 0, 4, 7), [(cu[0], cu[1]), (cu[2], cu[1]), (cu[2], cu[3]), (cu[0], cu[3])])
    face((2, 3, 7, 6), [(pu0, pv0), (pu1, pv0), (pu1, pv1), (pu0, pv1)])
    face((3, 2, 1, 8, 0), [(cu[0], cu[1]), (cu[2], cu[1]), (cu[2], cu[3]), (cu[1], cu[3]), (cu[0], cu[3])])


def fill_shelf(bm, uvl, rng, x0, x1, z, y_back, max_depth=0.30, gaps=(), max_h=0.36):
    """Fill a shelf: mostly upright books (height 0.25 m +-20%, some fat ones), about one run in eight a
    horizontal stack, about one book in eleven leaning on its neighbour."""
    x = x0 + 0.01
    while x < x1 - 0.03:
        skip = False
        for g0, g1 in gaps:
            if g0 <= x < g1:
                x = g1
                skip = True
        if skip:
            continue
        nxt_gap = min([g0 for g0, g1 in gaps if g0 > x] + [x1])
        r = rng.random()
        if r < 0.12 and x < nxt_gap - 0.24:
            # horizontal stack
            sh = 0
            n = rng.randint(2, 6)
            bw = rng.uniform(0.15, 0.23)
            for k in range(n):
                bh = rng.uniform(0.022, 0.048)
                if sh + bh > max_h - 0.01:
                    break
                d = rng.uniform(0.15, 0.22)
                cell = rng.randrange(63)
                book_into(bm, uvl, x + rng.uniform(-0.012, 0.012), y_back - d, z + sh, bw, bh, d, cell)
                sh += bh
            x += bw + rng.uniform(0.01, 0.025)
            continue
        w = rng.uniform(0.05, 0.072) if rng.random() < 0.15 else rng.uniform(0.018, 0.046)
        h = min(max(0.255 * rng.uniform(0.8, 1.2), 0.15), max_h)
        d = min(rng.uniform(0.15, 0.24), max_depth)
        if x + w > nxt_gap - 0.004:
            x = nxt_gap
            continue
        cell = rng.randrange(63)
        lean = 0.0
        if rng.random() < 0.09 and x + w + h * 0.3 < nxt_gap:
            lean = -D(rng.uniform(7, 15))
        book_into(bm, uvl, x, y_back - d - rng.uniform(0, 0.02), z, w, h, d, cell, lean)
        x += w + (0.0015 if rng.random() > 0.12 else rng.uniform(0.004, 0.012)) + (h * math.sin(-lean) if lean else 0)


def build_shelves(M):
    C = coll('Shelves')
    S = coll('Light_Strips')
    O = coll('Ornaments')
    rng = random.Random(21)
    W = M['wood']
    frame = []
    leds = []
    books = bmesh.new()
    uvl = books.loops.layers.uv.new('UVMap')
    yb = 7.0       # wall
    depth = 0.36
    yf = yb - depth
    th = 0.025

    def bay(x0, x1, levels, books_on=None, gaps=None):
        frame.append(box_bm((x1 - x0, 0.02, levels[-1] - levels[0] + th), ((x0 + x1) / 2, yb - 0.01,
                                                                           (levels[0] + levels[-1] + th) / 2)))
        for i, z in enumerate(levels):
            frame.append(box_bm((x1 - x0, depth, th), ((x0 + x1) / 2, yb - depth / 2, z + th / 2)))
            if i > 0:
                leds.append(box_bm((x1 - x0 - 0.04, 0.012, 0.006), ((x0 + x1) / 2, yf + 0.03, z - 0.004)))
        for i, z in enumerate(levels[:-1]):
            if books_on is None or i in books_on:
                gg = (gaps or {}).get(i, ())
                fill_shelf(books, uvl, rng, x0 + 0.01, x1 - 0.01, z + th, yb - 0.02, 0.30, gg,
                           max_h=levels[i + 1] - z - th - 0.03)

    def upright(x, z0, z1):
        frame.append(box_bm((0.03, depth, z1 - z0), (x, yb - depth / 2, (z0 + z1) / 2)))

    # left unit (between the back window and the board)
    lv = [0.08, 0.48, 0.88, 1.28, 1.68, 2.08, 2.50, 2.96]
    bay(-0.95, -0.17, lv, books_on={0, 1, 2, 3, 4, 5, 6}, gaps={2: ((-0.78, -0.50), (-0.38, -0.22)),
                                                                 4: ((-0.48, -0.22),), 6: ((-0.92, -0.70),)})
    upright(-0.965, 0, 2.99)
    upright(-0.155, 0, 2.99)
    # recessed toe-kick plinth under the left unit
    frame.append(box_bm((0.78, 0.02, 0.075), (-0.56, yf + 0.04, 0.0375)))
    # right unit above and behind the bed
    rx = [2.50, 3.12, 3.74, 4.36, 4.98]
    rv = [1.28, 1.70, 2.12, 2.54, 2.96]
    # gaps only where an ornament stands
    bay_gaps = [{1: ((2.84, 3.06),), 3: ((2.62, 2.89),)}, {0: ((3.35, 3.57),), 2: ((3.21, 3.40),)},
                {0: ((3.98, 4.19),)}, {0: ((4.61, 4.76),), 2: ((4.45, 4.66),)}]
    for i in range(len(rx) - 1):
        bay(rx[i], rx[i + 1], rv, gaps=bay_gaps[i])
    # the outer (left) side panel runs down to the floor like the left unit's; the inner uprights stop above
    # the bed. A toe-kick plinth runs under the whole unit.
    upright(rx[0], 0.0, 3.0)
    for x in rx[1:]:
        upright(x, 1.25, 3.0)
    frame.append(box_bm((rx[-1] - rx[0], 0.02, 0.075), ((rx[0] + rx[-1]) / 2, yf + 0.04, 0.0375)))
    # back panel behind the bed below the shelves
    frame.append(box_bm((rx[-1] - rx[0], 0.02, 1.26), ((rx[0] + rx[-1]) / 2, yb - 0.01, 0.63)))
    bm_obj(join_bms(frame), 'Shelf_Frames', C, W)
    bm_obj(join_bms(leds), 'Strip_Shelf_Warm', S, M['led_shelf'])
    bo = bm_obj(books, 'Books_Shelves', C, M['spines'])
    bevel(bo, 0.002, 1, angle=40, harden=False)

    # ornaments (shared meshes = instances)
    build_small_globe(M, O, (-0.64, 6.82, 0.88 + th))
    statuette_pebbles(M, O, 'Statuette_Pebbles', (-0.35, 6.82, 1.68 + th))
    crystal_cluster(M, O, 'Crystal_Cluster', (-0.81, 6.82, 2.50 + th))
    statuette_spiral(M, O, 'Statuette_Spiral', (2.95, 6.82, 1.70 + th))
    statuette_ring(M, O, 'Statuette_Ring', (3.45, 6.82, 1.28 + th))
    vase = lathe('Vase_A', O, [(0, 0), (0.04, 0), (0.06, 0.05), (0.05, 0.12), (0.025, 0.17), (0.028, 0.2),
                               (0.0, 0.2)], (4.08, 6.82, 1.28 + th), M['ceramic_white'], seg=40)
    instance(vase, 'Vase_B', O, (4.55, 6.82, 2.12 + th), scale=(0.8, 0.8, 1.1))
    candle_jar(M, O, 'Shelf_Candle_A', (4.68, 6.80, 1.28 + th))
    candle_jar(M, O, 'Shelf_Candle_B', (-0.30, 6.80, 0.88 + th))
    framed_picture(M, O, 'Shelf_Frame_Photo', (3.30, 6.86, 2.12 + th))
    small_plant(M, O, 'Shelf_Plant_A', (2.75, 6.80, 2.54 + th), 0.22, seed=31)
    small_plant(M, O, 'Shelf_Plant_B', (4.15, 6.80, 2.96 + th), 0.24, seed=32)
    small_plant(M, O, 'Shelf_Plant_C', (-0.75, 6.80, 2.96 + th), 0.24, seed=33)
    return C


def build_small_globe(M, C, loc, name='Shelf_Globe', scale=1.0):
    root = empty(name, C, loc)
    root.scale = (scale, scale, scale)
    lathe(f'{name}_Stand', C, [(0, 0), (0.06, 0), (0.06, 0.012), (0.012, 0.02), (0.008, 0.06), (0, 0.06)],
          (0, 0, 0), M['brass'], parent=root)
    m = bpy.data.materials.get('Globe_Map')
    if m is None:
        from room_lib import new_mat, N, L, math_node, mix_rgb
        m, nt, p, out = new_mat('Globe_Map')
        tc = N(nt, 'ShaderNodeTexCoord', -900, 0)
        nz = N(nt, 'ShaderNodeTexNoise', -700, 0, Vector=tc.outputs['Object'], Scale=9.0, Detail=6.0)
        land = math_node(nt, 'GREATER_THAN', nz.outputs['Factor'], 0.54)
        col = mix_rgb(nt, land, (0.01, 0.05, 0.14), (0.45, 0.33, 0.14))
        L(nt, col, p.inputs['Base Color'])
        p.inputs['Roughness'].default_value = 0.25
        p.inputs['Coat Weight'].default_value = 1.0
    sphere(f'{name}_Ball', C, 0.085, (0, 0, 0.15), m, parent=root, rot=(D(23), 0, 0), seg=48, rings=24)
    torus(f'{name}_Meridian', C, 0.093, 0.0035, (0, 0, 0.15), M['brass'], rot=(D(90), D(23), 0), parent=root,
          seg=64, sides=8)
    return root


def statuette_pebbles(M, C, name, loc, scale=1.0):
    root = empty(name, C, loc)
    z = 0
    for i, (r, sz) in enumerate(((0.05, 0.45), (0.04, 0.5), (0.03, 0.55), (0.02, 0.6))):
        z += r * sz
        _sp(f'{name}_Stone_{i}', C, r * scale, (0.004 * i, 0, z * scale), M['marble'] if i % 2 else M['ceramic_pot'],
            root, (1.0, 0.9, sz), sub=1, seg=24, rings=12)
        z += r * sz
    return root


def statuette_spiral(M, C, name, loc):
    prof = []
    for i in range(30):
        t = i / 29
        prof.append((0.012 + 0.018 * abs(math.sin(t * 7)) * (1 - t * 0.6), t * 0.26))
    prof = [(0, 0)] + [(0.045, 0), (0.045, 0.015)] + [(r, z + 0.015) for r, z in prof] + [(0, 0.275)]
    return lathe(name, C, prof, loc, M['brass_dark'], seg=32)


def statuette_ring(M, C, name, loc):
    root = empty(name, C, loc)
    box(f'{name}_Base', C, (0.09, 0.07, 0.03), (0, 0, 0.015), M['marble'], parent=root, bev=0.004)
    torus(f'{name}_Loop', C, 0.07, 0.008, (0, 0, 0.1), M['brass_polished'], rot=(D(90), 0, D(20)), parent=root,
          seg=64, sides=10)
    sphere(f'{name}_Dot', C, 0.012, (0, 0, 0.1), M['copper'], parent=root, seg=16, rings=8)
    return root


def crystal_cluster(M, C, name, loc):
    rng = random.Random(9)
    bms = []
    for i in range(9):
        h = rng.uniform(0.04, 0.12)
        r = rng.uniform(0.008, 0.016)
        b = cyl_bm(r, h, seg=6, r2=r * 0.55, offset=(0, 0, h / 2))
        tipz = h
        bm_transform(b, (rng.uniform(-0.03, 0.03), rng.uniform(-0.02, 0.02), 0),
                     (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, 3)))
        bms.append(b)
    root = empty(name, C, loc)
    bm_obj(join_bms(bms), f'{name}_Points', C, M['crystal'], parent=root)
    sphere(f'{name}_Rock', C, 0.05, (0, 0, 0.0), M['land'], scale=(1.1, 0.9, 0.5), parent=root)
    return root


def candle_jar(M, C, name, loc, glass=None, scale=1.0):
    root = empty(name, C, loc)
    root.scale = (scale, scale, scale)
    g = lathe(f'{name}_Glass', C, [(0.0, 0.0), (0.036, 0.0), (0.038, 0.004), (0.038, 0.085), (0.035, 0.085),
                                   (0.034, 0.006), (0.0, 0.006)], (0, 0, 0), glass or M['glass'], parent=root, seg=32)
    g.visible_shadow = False  # the flame's light must reach the room through the glass
    cyl(f'{name}_Wax', C, 0.032, 0.04, (0, 0, 0.026), M['wax'], parent=root, seg=24)
    fl = sphere(f'{name}_Flame', C, 0.0085, (0, 0, 0.060), M['flame'], scale=(1, 1, 2.2), parent=root, seg=12,
                rings=6)
    fl.visible_shadow = False
    cyl(f'{name}_Wick', C, 0.0012, 0.012, (0, 0, 0.049), M['rubber'], parent=root, seg=6)
    return root


def framed_picture(M, C, name, loc):
    root = empty(name, C, loc, (D(-8), 0, 0))
    box(f'{name}_Frame', C, (0.16, 0.015, 0.21), (0, 0, 0.105), M['brass_dark'], parent=root, bev=0.003)
    plane(f'{name}_Image', C, 0.13, 0.18, (0, -0.0085, 0.105), (D(90), 0, 0), M['wallpic'], parent=root)
    return root


def small_plant(M, C, name, loc, size, seed=0):
    root = empty(name, C, loc)
    lathe(f'{name}_Pot', C, [(0, 0), (0.045 * size / 0.2, 0), (0.055 * size / 0.2, 0.08 * size / 0.2),
                             (0.05 * size / 0.2, 0.08 * size / 0.2), (0.0, 0.075 * size / 0.2)], (0, 0, 0),
          M['ceramic_white'], parent=root)
    leaves = bmesh.new()
    uvl = leaves.loops.layers.uv.new('UVMap')
    rng = random.Random(seed)
    stems = []
    top = Vector((0, 0, 0.07 * size / 0.2))
    for i in range(14):
        a = i * 2.39996
        pitch = rng.uniform(0.2, 1.1)
        L_ = size * rng.uniform(0.4, 0.75) * rng.uniform(0.6, 1.4)
        d = Vector((math.cos(a) * math.cos(pitch), math.sin(a) * math.cos(pitch), math.sin(pitch)))
        tip = top + d * L_ * 0.6
        stems.append(tube_bm([top, top + d * L_ * 0.3 + Vector((0, 0, 0.02)), tip], 0.0025, sides=5))
        add_leaf(leaves, uvl, tip, d, L_ * 0.5, L_ * 0.32, rng, droop=0.25, shape='heart', cup=0.14,
                 roll=rng.uniform(-1.0, 1.0), wave=0.03, curl=rng.uniform(-0.12, 0.12))
    bm_obj(join_bms(stems), f'{name}_Stems', C, M['stem'], smooth=True, parent=root)
    bm_obj(leaves, f'{name}_Leaves', C, M['leaf_pothos'], smooth=True, parent=root)
    return root


# =============================================================================================
# Leaves and plants
# =============================================================================================

def add_leaf(bm, uvl, base, direction, length, width, rng, droop=0.35, fold=0.25, nl=9, nw=4, shape='ovate',
             roll=None, cup=-0.06, wave=0.0, curl=0.0):
    """Append one leaf mesh (its own UV island) to bm. direction = growth direction of the petiole tip.
    cup > 0 raises the margins (a cupped leaf), wave bends the blade up and down 2-3 times along its length,
    curl bends it sideways."""
    ph = rng.uniform(0, 6.28)
    d = Vector(direction).normalized()
    # leaf frame: forward f (along blade), side s, normal n (roughly up)
    up = Vector((0, 0, 1))
    side = d.cross(up)
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    if roll is None:
        roll = rng.uniform(-0.35, 0.35)
    side = Matrix.Rotation(roll, 3, d) @ side
    nrm = side.cross(d).normalized()
    if nrm.z < 0:
        nrm = -nrm
        side = -side
    rows = []
    for j in range(nl + 1):
        t = j / nl
        if shape == 'ovate':
            wt = math.sin(math.pi * min(t * 1.08, 1.0) ** 0.75) ** 0.85
        elif shape == 'heart':
            wt = math.sin(math.pi * min(t * 1.05, 1.0) ** 0.6) ** 0.7 * (1.0 + 0.25 * (1 - t))
        else:  # paddle
            wt = math.sin(math.pi * t) ** 0.5
        wt *= 0.5 * width
        row = []
        for i in range(nw * 2 + 1):
            s = (i - nw) / nw
            x = s * wt
            # midrib fold + droop along the length + slight cup
            zf = fold * abs(x) + cup * width * (s * s)
            along = t * length
            dr = -droop * length * t * t + wave * length * math.sin(2.6 * math.pi * t + ph) * t ** 0.6
            lat = curl * length * math.sin(math.pi * t * 0.5) ** 2
            p = Vector(base) + d * along + side * (x + lat) + nrm * (zf + dr)
            row.append(bm.verts.new(p))
        rows.append(row)
    for j in range(nl):
        for i in range(nw * 2):
            f = bm.faces.new([rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]])
            for lp, (a, b) in zip(f.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]):
                lp[uvl].uv = (a / (nw * 2), b / nl)


def pot(M, C, name, loc, r, h, mat):
    root = empty(name, C, loc)
    lathe(f'{name}_Pot', C, [(0, 0.0), (r * 0.78, 0.0), (r * 0.8, 0.01), (r, h * 0.92), (r * 1.04, h),
                             (r * 0.96, h), (r * 0.92, h * 0.9), (0, h * 0.9)], (0, 0, 0), mat, parent=root, seg=48)
    cyl(f'{name}_Soil', C, r * 0.9, 0.01, (0, 0, h * 0.88), M['soil'], parent=root, seg=32)
    return root


def plant_ficus(M, C, name, loc, height, seed, pot_r=0.22, pot_h=0.42, pot_mat=None, n_leaves=70, leaf_len=0.24):
    rng = random.Random(seed)
    root = pot(M, C, name, loc, pot_r, pot_h, pot_mat or M['ceramic_pot'])
    base = Vector((0, 0, pot_h * 0.88))
    leaves = bmesh.new()
    uvl = leaves.loops.layers.uv.new('UVMap')
    stems = []
    trunks = []
    for k in range(3):
        a = TAU * k / 3 + rng.uniform(-0.4, 0.4)
        lean = rng.uniform(0.08, 0.22)
        hgt = height * rng.uniform(0.75, 1.0) - pot_h
        pts = []
        for i in range(12):
            t = i / 11
            off = lean * t ** 1.3 * hgt
            pts.append(base + Vector((math.cos(a) * off + 0.02 * math.sin(t * 5 + k),
                                      math.sin(a) * off + 0.02 * math.cos(t * 4 + k), hgt * t)))
        trunks.append(pts)
        stems.append(tube_bm(pts, 0.014, sides=8, radii=[0.016 * (1 - 0.6 * i / 11) + 0.004 for i in range(12)]))
    per = n_leaves // 3
    for pts in trunks:
        for i in range(per):
            t = 0.30 + 0.70 * (i / per) ** 0.85
            idx = min(int(t * 11), 10)
            ft = t * 11 - idx
            p = pts[idx].lerp(pts[idx + 1], ft)
            a = i * 2.39996 + rng.uniform(-0.2, 0.2)
            pitch = rng.uniform(0.15, 0.75) + (0.5 if t > 0.92 else 0)
            dvec = Vector((math.cos(a) * math.cos(pitch), math.sin(a) * math.cos(pitch), math.sin(pitch)))
            pet = p + dvec * 0.05
            stems.append(tube_bm([p, pet], 0.003, sides=5, cap=False))
            ll = leaf_len * rng.uniform(0.75, 1.15) * (0.8 + 0.3 * (1 - t))
            add_leaf(leaves, uvl, pet, dvec, ll, ll * 0.62, rng, droop=rng.uniform(0.15, 0.4), fold=0.2,
                     shape='ovate')
    bm_obj(join_bms(stems), f'{name}_Stems', C, M['trunk'], smooth=True, parent=root)
    bm_obj(leaves, f'{name}_Leaves', C, M['leaf'], smooth=True, parent=root)
    return root


def plant_fan(M, C, name, loc, height, seed, pot_r=0.2, pot_h=0.36, pot_mat=None, n=11, leaf_len=0.42):
    rng = random.Random(seed)
    root = pot(M, C, name, loc, pot_r, pot_h, pot_mat or M['ceramic_pot'])
    base = Vector((0, 0, pot_h * 0.88))
    leaves = bmesh.new()
    uvl = leaves.loops.layers.uv.new('UVMap')
    stems = []
    for i in range(n):
        a = i * 2.39996 + rng.uniform(-0.3, 0.3)
        out = rng.uniform(0.15, 0.55)
        hh = (height - pot_h) * rng.uniform(0.45, 0.85)
        tip = base + Vector((math.cos(a) * out * hh * 0.8, math.sin(a) * out * hh * 0.8, hh))
        mid = base + Vector((math.cos(a) * out * 0.2 * hh, math.sin(a) * out * 0.2 * hh, hh * 0.6))
        pts = [base.lerp(mid, t / 4) for t in range(4)] + [mid.lerp(tip, t / 4) for t in range(1, 5)]
        stems.append(tube_bm(pts, 0.007, sides=6, radii=[0.009 - 0.004 * k / 7 for k in range(8)]))
        dvec = (tip - mid).normalized()
        dvec = Vector((dvec.x * 1.3, dvec.y * 1.3, max(dvec.z * 0.3, 0.1))).normalized()
        ll = leaf_len * rng.uniform(0.75, 1.1)
        add_leaf(leaves, uvl, tip, dvec, ll, ll * 0.7, rng, droop=rng.uniform(0.2, 0.45), fold=0.15, nl=14, nw=6,
                 shape='heart', wave=0.045, curl=rng.uniform(-0.12, 0.12), cup=0.02)
    bm_obj(join_bms(stems), f'{name}_Stems', C, M['stem'], smooth=True, parent=root)
    bm_obj(leaves, f'{name}_Leaves', C, M['leaf_light'], smooth=True, parent=root)
    return root


def plant_hanging(M, C, name, loc, seed, n_vines=8, length=1.1, hang=True, pot_r=0.11):
    """Pothos-like planter; trailing vines fall under gravity with small heart leaves."""
    rng = random.Random(seed)
    root = empty(name, C, loc)
    lathe(f'{name}_Pot', C, [(0, 0), (pot_r * 0.7, 0), (pot_r, 0.12), (pot_r * 1.05, 0.14), (0, 0.13)], (0, 0, 0),
          M['brass_dark'], parent=root, seg=40)
    if hang:
        for k in range(3):
            a = TAU * k / 3
            tube(f'{name}_Wire_{k}', C, [Vector((pot_r * math.cos(a), pot_r * math.sin(a), 0.13)),
                                         Vector((0, 0, 0.55))], 0.0012, M['frame'], sides=4, parent=root)
    leaves = bmesh.new()
    uvl = leaves.loops.layers.uv.new('UVMap')
    stems = []
    for v in range(n_vines):
        a = TAU * v / n_vines + rng.uniform(-0.3, 0.3)
        Lv = length * rng.uniform(0.45, 1.0)
        pts = []
        p = Vector((pot_r * 0.8 * math.cos(a), pot_r * 0.8 * math.sin(a), 0.13))
        vel = Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.3))
        step = 0.03
        dist = 0
        while dist < Lv:
            pts.append(p.copy())
            vel = (vel + Vector((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), -0.35))).normalized()
            if p.z > 0.05:
                vel = (vel + Vector((math.cos(a) * 0.6, math.sin(a) * 0.6, 0.0))).normalized()
            p = p + vel * step
            dist += step
        if len(pts) < 3:
            continue
        stems.append(tube_bm(pts, 0.0022, sides=4, cap=False))
        for i in range(2, len(pts) - 1, 2):
            dvec = (pts[i + 1] - pts[i]).normalized()
            sidev = dvec.cross(Vector((0, 0, 1)))
            if sidev.length < 1e-3:
                sidev = Vector((1, 0, 0))
            sidev.normalize()
            sgn = 1 if (i // 2) % 2 else -1
            ldir = (sidev * sgn * 0.8 + Vector((0, 0, -0.2)) + Vector((math.cos(a), math.sin(a), 0)) * 0.5)
            ll = rng.uniform(0.045, 0.075) * (1 - 0.3 * i / len(pts)) * rng.uniform(0.6, 1.4)
            add_leaf(leaves, uvl, pts[i], ldir, ll, ll * 0.8, rng, droop=0.3, fold=0.2, nl=6, nw=3, shape='heart',
                     roll=rng.uniform(-1.0, 1.0), cup=0.12, curl=rng.uniform(-0.15, 0.15))
    bm_obj(join_bms(stems), f'{name}_Vines', C, M['stem'], smooth=True, parent=root)
    bm_obj(leaves, f'{name}_Leaves', C, M['leaf_pothos'], smooth=True, parent=root)
    return root


def plant_trailing(M, C, name, xr, y, z, seed, n_vines=12, length=1.4):
    """Slim trough on brackets on the mezzanine fascia; pothos vines spill over its front lip and fall."""
    rng = random.Random(seed)
    x0, x1 = xr
    root = empty(name, C, ((x0 + x1) / 2, y, z))
    hw = (x1 - x0) / 2
    tr = []
    tr.append(box_bm((x1 - x0, 0.14, 0.012), (0, 0, 0.006)))
    for sy in (-0.07, 0.07):
        tr.append(box_bm((x1 - x0, 0.012, 0.13), (0, sy, 0.065)))
    for sx in (-hw, hw):
        tr.append(box_bm((0.012, 0.14, 0.13), (sx, 0, 0.065)))
    ob = bm_obj(join_bms(tr), f'{name}_Trough', C, M['brass_dark'], parent=root)
    bevel(ob, 0.002, 1)
    box(f'{name}_Soil', C, (x1 - x0 - 0.03, 0.12, 0.01), (0, 0, 0.115), M['soil'], parent=root)
    leaves = bmesh.new()
    uvl = leaves.loops.layers.uv.new('UVMap')
    stems = []
    for v in range(n_vines):
        px = -hw + 0.06 + (2 * hw - 0.12) * (v + rng.uniform(0.2, 0.8)) / n_vines
        p = Vector((px, rng.uniform(-0.04, 0.03), 0.12))
        vel = Vector((rng.uniform(-0.2, 0.2), -0.9, 0.35)).normalized()
        Lv = length * rng.uniform(0.35, 1.0)
        pts, dist, step = [], 0.0, 0.03
        while dist < Lv:
            pts.append(p.copy())
            pull = Vector((rng.uniform(-0.12, 0.12), -0.10 if p.y > -0.11 else 0.0, -0.45))
            vel = (vel + pull).normalized()
            p = p + vel * step
            if p.y > -0.085 and p.z < 0.14:   # over the lip, not through it
                p.z = 0.14
            dist += step
        if len(pts) < 3:
            continue
        stems.append(tube_bm(pts, 0.0022, sides=4, cap=False))
        for i in range(1, len(pts) - 1, 2):
            dvec = (pts[i + 1] - pts[i]).normalized()
            sidev = dvec.cross(Vector((0, 0, 1)))
            if sidev.length < 1e-3:
                sidev = Vector((1, 0, 0))
            sidev.normalize()
            sgn = 1 if (i // 2) % 2 else -1
            ldir = sidev * sgn * 0.8 + Vector((0, -0.6, -0.15))
            ll = rng.uniform(0.05, 0.085) * (1 - 0.35 * i / len(pts)) * rng.uniform(0.6, 1.4)
            add_leaf(leaves, uvl, pts[i], ldir, ll, ll * 0.8, rng, droop=0.3, fold=0.2, nl=6, nw=3, shape='heart',
                     roll=rng.uniform(-1.0, 1.0), cup=0.12, curl=rng.uniform(-0.15, 0.15))
    bm_obj(join_bms(stems), f'{name}_Vines', C, M['stem'], smooth=True, parent=root)
    bm_obj(leaves, f'{name}_Leaves', C, M['leaf_pothos'], smooth=True, parent=root)
    return root


FRONT_PLANT = (-0.95, 2.50, 0)   # foreground plant at the wide shot's lower-left edge


def build_plants(M):
    C = coll('Plants')
    plant_ficus(M, C, 'Plant_Ficus_FrontLeft', (-4.35, 0.80, 0), 2.35, 41, pot_r=0.25, pot_h=0.46,
                pot_mat=M['brass_dark'], n_leaves=96, leaf_len=0.27)
    plant_fan(M, C, 'Plant_Fan_FrontLeft', (-3.35, 0.50, 0), 1.35, 42, n=12, leaf_len=0.42)
    plant_ficus(M, C, 'Plant_Ficus_Window', (-4.55, 3.98, 0), 1.75, 43, pot_r=0.2, pot_h=0.38, n_leaves=66,
                leaf_len=0.22)
    plant_fan(M, C, 'Plant_Fan_Sofa', (4.62, 3.70, 0), 1.45, 45, pot_r=0.18, pot_h=0.34, n=9, leaf_len=0.36)
    plant_ficus(M, C, 'Plant_Ficus_DeskEnd', (-0.25, 6.45, 0), 1.55, 46, pot_r=0.14, pot_h=0.30, n_leaves=40,
                leaf_len=0.19, pot_mat=M['brass'])
    # large leafy plant at the front-left edge of the wide shot (foreground depth)
    # 40% smaller than before so it frames the corner instead of blotting out the floor in front of the desk
    plant_fan(M, C, 'Plant_Big_Leaf_Front', FRONT_PLANT, 0.85, 47, pot_r=0.13, pot_h=0.25, n=10, leaf_len=0.28,
              pot_mat=M['ceramic_pot'])
    # hanging planters under the mezzanine edge, either side of the board
    plant_hanging(M, C, 'Plant_Hanging_Left', (-0.56, 5.72, 2.45), 51, n_vines=9, length=1.0)
    plant_hanging(M, C, 'Plant_Hanging_Right', (2.80, 5.72, 2.45), 52, n_vines=9, length=0.9)
    return C


# =============================================================================================
# Board, cabinet, wall picture
# =============================================================================================

def build_board(M):
    C = coll('Board_Wall')
    bx, bz, bw, bh = 1.15, 1.95, 2.50, 1.5625
    plane('Board', C, bw, bh, (bx, 6.955, bz), (D(90), 0, 0), M['board'])
    fr = []
    t = 0.035
    fr.append(box_bm((bw + 2 * t, 0.03, t), (bx, 6.96, bz + bh / 2 + t / 2)))
    fr.append(box_bm((bw + 2 * t, 0.03, t), (bx, 6.96, bz - bh / 2 - t / 2)))
    fr.append(box_bm((t, 0.03, bh), (bx - bw / 2 - t / 2, 6.96, bz)))
    fr.append(box_bm((t, 0.03, bh), (bx + bw / 2 + t / 2, 6.96, bz)))
    ob = bm_obj(join_bms(fr), 'Board_Frame', C, M['wood'])
    bevel(ob, 0.004, 2)
    box('Board_Ledge', C, (bw, 0.06, 0.02), (bx, 6.92, bz - bh / 2 - t - 0.01), M['wood'], bev=0.003)
    rng = random.Random(4)
    for i, (x, col) in enumerate(((-0.9, 'chalk'), (-0.82, 'chalk'), (0.4, 'chalk'), (0.9, 'chalk'))):
        cyl(f'Board_Chalk_{i}', C, 0.006, 0.06, (bx + x, 6.915, bz - bh / 2 - t + 0.006), M[col],
            rot=(0, D(90), D(rng.uniform(-20, 20))), seg=10)
    # low cabinet under the board
    box('Board_Cabinet', C, (2.50, 0.42, 0.60), (bx, 6.79, 0.30), M['wood'], bev=0.006)
    for i in range(4):
        x = bx - 1.25 + 0.3125 + i * 0.625
        box(f'Board_Cabinet_Door_Gap_{i}', C, (0.004, 0.004, 0.56), (x + 0.3375, 6.578, 0.30), M['frame'])
        box(f'Board_Cabinet_Pull_{i}', C, (0.01, 0.012, 0.14), (x + 0.30 if i % 2 == 0 else x - 0.30 + 0.6, 6.574,
                                                                0.44), M['brass'], bev=0.003)
    box('Strip_Cabinet_Top_Warm', coll('Light_Strips'), (2.4, 0.01, 0.006), (bx, 6.60, 0.594), M['led_shelf'])
    # objects on the cabinet
    O = coll('Ornaments')
    candle_jar(M, O, 'Cabinet_Candle', (bx - 0.95, 6.75, 0.60))
    statuette_spiral(M, O, 'Cabinet_Statuette', (bx + 1.05, 6.80, 0.60))
    small_plant(M, O, 'Cabinet_Plant', (bx - 0.45, 6.78, 0.60), 0.26, seed=35)
    sb = bmesh.new()
    uvl = sb.loops.layers.uv.new('UVMap')
    rr = random.Random(8)
    zz = 0.60
    for k in range(4):
        hgt = rr.uniform(0.03, 0.045)
        book_into(sb, uvl, bx + 0.35 + rr.uniform(-0.01, 0.01), 6.62, zz, 0.24, hgt, 0.18, rr.randrange(63))
        zz += hgt
    bm_obj(sb, 'Cabinet_Book_Stack', O, M['spines'])
    lathe('Cabinet_Vase', O, [(0, 0), (0.035, 0), (0.05, 0.06), (0.04, 0.16), (0.018, 0.22), (0.022, 0.25),
                                     (0.0, 0.25)], (bx - 0.10, 6.82, 0.60), M['ceramic_white'], seg=40)
    framed_picture(M, O, 'Cabinet_Frame_Photo', (bx + 0.78, 6.88, 0.60))
    statuette_pebbles(M, O, 'Cabinet_Pebbles', (bx - 0.72, 6.80, 0.60), scale=0.8)
    build_small_globe(M, O, (bx + 0.10, 6.80, 0.60), name='Cabinet_Globe', scale=0.75)
    crystal_cluster(M, O, 'Cabinet_Crystals', (bx + 0.62, 6.70, 0.60))
    # the wall picture: an original night-sky painting, upper right
    plane('Wall_Picture', C, 1.40, 0.875, (4.16, 6.975, 3.92), (D(90), 0, 0), M['wallpic'])
    pf = []
    for (sx, sz, x, z) in ((1.46, 0.03, 4.16, 3.92 + 0.452), (1.46, 0.03, 4.16, 3.92 - 0.452),
                           (0.03, 0.875, 4.16 - 0.715, 3.92), (0.03, 0.875, 4.16 + 0.715, 3.92)):
        pf.append(box_bm((sx, 0.03, sz), (x, 6.965, z)))
    bm_obj(join_bms(pf), 'Wall_Picture_Frame', C, M['frame'])
    # brass picture light above the painting (its area light is in build_lights)
    tube('Picture_Light_Arm', C, [Vector((4.16, 6.98, 4.40)), Vector((4.16, 6.90, 4.46)), Vector((4.16, 6.80, 4.44))],
         0.006, M['brass'])
    cyl('Picture_Light_Hood', C, 0.03, 0.62, (4.16, 6.79, 4.43), M['brass'], rot=(0, D(90), 0), seg=24)
    box('Strip_Picture_Light', coll('Light_Strips'), (0.58, 0.012, 0.004), (4.16, 6.79, 4.40), M['led_warm'])
    return C


# =============================================================================================
# Mezzanine, rail, telescope, small sofa
# =============================================================================================

MEZZ_DOWNLIGHTS = (0.2, 1.15, 2.1)


def build_mezzanine(M):
    C = coll('Mezzanine')
    S = coll('Light_Strips')
    x0, x1, y0, y1, z = -1.0, 3.25, 5.40, 7.0, 3.05
    slab = box('Mezzanine_Slab', C, (x1 - x0, y1 - y0, 0.16), ((x0 + x1) / 2, (y0 + y1) / 2, z + 0.08),
               M['desk_body'], bev=0.004)
    box('Mezzanine_Floor', C, (x1 - x0 - 0.02, y1 - y0 - 0.02, 0.01), ((x0 + x1) / 2, (y0 + y1) / 2, z + 0.165),
        M['wood_light'])
    # squared steel end cap and underside joists, so the slab reads as structure, not a floating plane
    box('Mezzanine_End_Cap', C, (0.02, y1 - y0, 0.20), (x1 + 0.01, (y0 + y1) / 2, z + 0.08), M['steel_dark'])
    box('Mezzanine_Fascia', C, (x1 - x0 + 0.04, 0.02, 0.20), ((x0 + x1) / 2 + 0.01, y0 - 0.012, z + 0.08),
        M['steel_dark'])
    joists = [box_bm((0.05, y1 - y0 - 0.06, 0.07), (jx, (y0 + y1) / 2, z - 0.035)) for jx in (-0.45, 0.6, 1.65, 2.7)]
    bm_obj(join_bms(joists), 'Mezzanine_Joists', C, M['steel_dark'])
    box('Strip_Mezzanine_Under_Warm', S, (x1 - x0 - 0.1, 0.02, 0.008), ((x0 + x1) / 2, y0 + 0.08, z - 0.005),
        M['led_warm'])
    dls = [cyl_bm(0.04, 0.006, seg=20, offset=(dx, 5.80, z - 0.003)) for dx in MEZZ_DOWNLIGHTS]
    bm_obj(join_bms(dls), 'Strip_Mezzanine_Downlights', S, M['downlight'])
    box('Strip_Mezzanine_Edge_Cyan', S, (x1 - x0, 0.006, 0.012), ((x0 + x1) / 2, y0 - 0.024, z + 0.12),
        M['led_cyan'])
    # warm strip where the mezzanine floor meets the back wall, and a globe lamp beside the sofa
    box('Strip_Mezzanine_Back_Warm', S, (x1 - x0 - 0.1, 0.012, 0.008), ((x0 + x1) / 2, y1 - 0.03, z + 0.18),
        M['led_shelf'])
    # (the slab is carried by the back wall and its steel joists: no tie rods, so nothing reads as bars)
    Lm = coll('Lamps')
    box('Mezz_Side_Table', C, (0.36, 0.36, 0.42), (0.45, 6.70, z + 0.17 + 0.21), M['wood'], bev=0.005)
    lamp = empty('Globe_Lamp_Mezz', Lm, (0.45, 6.70, z + 0.17 + 0.42))
    lathe('Globe_Lamp_Mezz_Base', Lm, [(0, 0), (0.06, 0), (0.062, 0.006), (0.012, 0.02), (0.009, 0.20),
                                       (0.025, 0.21), (0.0, 0.212)], (0, 0, 0), M['brass'], parent=lamp)
    g = sphere('Globe_Lamp_Mezz_Globe', Lm, 0.11, (0, 0, 0.31), M['globe'], parent=lamp, seg=48, rings=24)
    g.visible_shadow = False
    g.visible_glossy = False  # it read as a moon when mirrored in the left window
    sb = bmesh.new()
    uvl = sb.loops.layers.uv.new('UVMap')
    zz = z + 0.17 + 0.42
    for k, (hgt, cell) in enumerate(((0.035, 5), (0.028, 22), (0.04, 41))):
        book_into(sb, uvl, 0.30 + 0.01 * k, 6.56, zz, 0.15, hgt, 0.20, cell)
        zz += hgt
    bm_obj(sb, 'Mezz_Book_Stack', C, M['spines'])
    # frameless-look glass rail: 12 mm panels (real transmissive glass, bevelled so the edges catch light)
    # between slim posts about every 1.2 m, a steel shoe channel along the foot and a slim brushed handrail
    rz0, rz1 = z + 0.16, z + 1.15
    panels, posts, shoe = [], [], []
    n = max(1, round((x1 - x0) / 1.2))
    for i in range(n):
        a_ = x0 + 0.04 + (x1 - x0 - 0.08) * i / n
        b_ = x0 + 0.04 + (x1 - x0 - 0.08) * (i + 1) / n
        panels.append(box_bm((b_ - a_ - 0.03, 0.012, rz1 - rz0 - 0.05), ((a_ + b_) / 2, y0 + 0.03, (rz0 + rz1) / 2 + 0.01)))
        posts.append(box_bm((0.018, 0.018, rz1 - rz0), (a_, y0 + 0.03, (rz0 + rz1) / 2)))
    posts.append(box_bm((0.018, 0.018, rz1 - rz0), (x1 - 0.04, y0 + 0.03, (rz0 + rz1) / 2)))
    panels.append(box_bm((0.012, y1 - y0 - 0.1, rz1 - rz0 - 0.05), (x1 - 0.03, (y0 + y1) / 2 + 0.03,
                                                                    (rz0 + rz1) / 2 + 0.01)))
    shoe.append(box_bm((x1 - x0 - 0.06, 0.03, 0.05), ((x0 + x1) / 2, y0 + 0.03, rz0 + 0.01)))
    gp = bm_obj(join_bms(panels), 'Mezzanine_Glass_Rail', C, M['glass_panel'])
    bevel(gp, 0.003, 2, angle=60)
    gp.visible_shadow = False
    bm_obj(join_bms(posts), 'Mezzanine_Rail_Posts', C, M['alu_dark'])
    bm_obj(join_bms(shoe), 'Mezzanine_Rail_Shoe', C, M['steel_dark'])
    tube('Mezzanine_Handrail', C, [Vector((x0 + 0.02, y0 + 0.03, rz1 + 0.01)), Vector((x1 - 0.03, y0 + 0.03, rz1 + 0.01)),
                                   Vector((x1 - 0.03, y1 - 0.02, rz1 + 0.01))], 0.012, M['alu'], sides=12)
    # a planter trough hung on the fascia near the right end, its pothos trailing down over the edge
    plant_trailing(M, C, 'Mezz_Trailing_Plant', (2.05, 3.05), y0 - 0.10, z + 0.05, 71, n_vines=13, length=1.5)
    # loveseat: legs, base, two seat and two back cushions, rolled arms, two throw cushions
    zf = z + 0.17
    sx0, sx1, sy0, sy1 = 0.85, 2.35, 6.15, 6.90
    for i, (lx, ly) in enumerate(((sx0 + 0.07, sy0 + 0.07), (sx1 - 0.07, sy0 + 0.07), (sx0 + 0.07, sy1 - 0.07),
                                  (sx1 - 0.07, sy1 - 0.07))):
        cyl(f'Mezz_Sofa_Leg_{i}', C, 0.016, 0.12, (lx, ly, zf + 0.06), M['wood'], seg=12, r2=0.011)
    box('Mezz_Sofa_Base', C, (sx1 - sx0, sy1 - sy0, 0.16), ((sx0 + sx1) / 2, (sy0 + sy1) / 2, zf + 0.20),
        M['fabric_sofa'], bev=0.025, seg=3)
    box('Mezz_Sofa_Back', C, (sx1 - sx0, 0.14, 0.42), ((sx0 + sx1) / 2, sy1 - 0.07, zf + 0.49), M['fabric_sofa'],
        bev=0.045, seg=3)
    for s_, ax in (('L', sx0 + 0.07), ('R', sx1 - 0.07)):
        box(f'Mezz_Sofa_Arm_{s_}', C, (0.14, sy1 - sy0, 0.30), (ax, (sy0 + sy1) / 2, zf + 0.43),
                  M['fabric_sofa'], bev=0.06, seg=4)
    inner = (sx1 - sx0 - 0.28) / 2
    for i in range(2):
        cx_ = sx0 + 0.14 + inner * (i + 0.5)
        c = box(f'Mezz_Sofa_Seat_{i}', C, (inner - 0.01, 0.58, 0.12), (cx_, 6.47, zf + 0.34), M['fabric_sofa'])
        bevel(c, 0.045, 3)
        subsurf(c, 1)
        c = box(f'Mezz_Sofa_Back_Cushion_{i}', C, (inner - 0.02, 0.14, 0.38), (cx_, 6.74, zf + 0.58),
                M['fabric_sofa'], rot=(D(-12), 0, 0))
        bevel(c, 0.05, 3)
        subsurf(c, 1)
    for i, (x, m, rz) in enumerate(((sx0 + 0.30, 'cushion_violet', 22), (sx1 - 0.30, 'pillow_dark', -20))):
        p = box(f'Mezz_Sofa_Cushion_{i}', C, (0.36, 0.12, 0.34), (x, 6.62, zf + 0.58), M[m],
                rot=(D(-14), 0, D(rz)))
        bevel(p, 0.05, 3)
        subsurf(p, 1)
    plant_fan(M, C, 'Mezz_Plant_A', (2.85, 6.55, zf), 0.85, 61, pot_r=0.14, pot_h=0.28, n=8, leaf_len=0.26)
    plant_ficus(M, C, 'Mezz_Plant_B', (0.25, 6.70, zf), 1.0, 62, pot_r=0.13, pot_h=0.26, n_leaves=30, leaf_len=0.15)
    build_telescope(M, C, (-0.48, 6.10, zf))
    return C


def build_telescope(M, C, loc):
    root = empty('Telescope', C, loc, (0, 0, D(-22)))
    head = Vector((0, 0, 1.05))
    for k in range(3):
        a = TAU * k / 3 + 0.4
        foot = Vector((0.42 * math.cos(a), 0.42 * math.sin(a), 0.0))
        tube(f'Telescope_Leg_{k}', C, [head + Vector((0, 0, -0.05)), foot], 0.014, M['alu_dark'], sides=8,
             parent=root)
        cyl(f'Telescope_Foot_{k}', C, 0.02, 0.02, tuple(foot + Vector((0, 0, 0.01))), M['rubber'], parent=root)
    # accessory tray
    tri = []
    for k in range(3):
        a = TAU * k / 3 + 0.4
        tri.append(Vector((0.2 * math.cos(a), 0.2 * math.sin(a), 0.55)))
    tube('Telescope_Tray_Ring', C, tri + [tri[0]], 0.006, M['alu_dark'], parent=root)
    cyl('Telescope_Mount', C, 0.045, 0.09, tuple(head), M['plastic_black'], parent=root, seg=24, bev=0.01)
    ota = empty('Telescope_Tube_Frame', C, tuple(head + Vector((0, 0, 0.12))), (0, D(-62), 0), parent=root)
    cyl('Telescope_Tube', C, 0.055, 0.80, (0, 0, 0.05), M['enamel_white'], parent=ota, seg=40, bev=0.003)
    cyl('Telescope_Dew_Shield', C, 0.062, 0.18, (0, 0, 0.52), M['plastic_black'], parent=ota, seg=40)
    cyl('Telescope_Lens', C, 0.054, 0.004, (0, 0, 0.60), M['lens'], parent=ota, seg=40)
    cyl('Telescope_Focuser', C, 0.022, 0.12, (0, 0, -0.40), M['plastic_black'], parent=ota, seg=20)
    cyl('Telescope_Eyepiece', C, 0.016, 0.06, (0.0, 0.03, -0.45), M['alu_dark'], rot=(D(-45), 0, 0), parent=ota,
        seg=16)
    cyl('Telescope_Finder', C, 0.016, 0.22, (0.07, 0, 0.15), M['enamel_white'], parent=ota, seg=20)
    for zz in (-0.12, 0.18):
        torus(f'Telescope_Ring_{zz:.2f}', C, 0.058, 0.007, (0, 0, zz), M['alu_dark'], parent=ota, seg=40, sides=8)
    cyl('Telescope_Counterweight_Bar', C, 0.006, 0.3, (0, -0.08, -0.08), M['alu'], rot=(D(90), 0, 0), parent=ota)
    cyl('Telescope_Counterweight', C, 0.04, 0.05, (0, -0.22, -0.08), M['steel_dark'], rot=(D(90), 0, 0), parent=ota)
    return root


# =============================================================================================
# Front-right corner: rug, low table, book stack, candle, sofa; ceiling ring light
# =============================================================================================

LOUNGE_AT = (2.02, 2.62)   # centre of the low table (the rug is centred 0.13 m right and 0.23 m back of it)


def build_lounge(M, face=(0.6, 0.4)):
    C = coll('Lounge')
    # round shag rug: a disc with a soft rolled edge, slightly lumpy
    def rug_fn(u, v):
        a = TAU * u
        r = 0.03 + 1.27 * v  # no degenerate centre (it sits under the table)
        z = 0.018 + 0.004 * math.sin(a * 13 + r * 9) * (v < 0.97)
        if v > 0.96:
            z = 0.018 * (1 - (v - 0.96) / 0.04) + 0.002
        return (LOUNGE_AT[0] + 0.13 + r * math.cos(a), LOUNGE_AT[1] + 0.23 + r * math.sin(a), z)
    rgb = grid_bm(200, 40, rug_fn)
    bmesh.ops.remove_doubles(rgb, verts=rgb.verts, dist=1e-5)  # close the seam at u = 0 / 1
    rg = bm_obj(rgb, 'Rug', C, M['rug'], smooth=True)
    subsurf(rg, 1, 2)
    # shaggy pile: displace along normals with a fine procedural texture
    tx = bpy.data.textures.new('Rug_Pile', 'CLOUDS')
    tx.noise_scale = 0.03
    tx.noise_depth = 1
    dsp = rg.modifiers.new('Pile', 'DISPLACE')
    dsp.texture = tx
    dsp.texture_coords = 'OBJECT'
    dsp.strength = 0.005   # gentle pile; the fur look comes from the shader (no stucco lumps)
    dsp.mid_level = 0.3
    sm = solidify(rg, 0.018, -1.0)
    sm.use_even_offset = False
    # low round marble table
    tx, ty = LOUNGE_AT
    tbl = empty('Low_Table', C, (tx, ty, 0))
    cyl('Low_Table_Top', C, 0.46, 0.035, (0, 0, 0.425), M['marble'], parent=tbl, seg=96, bev=0.006)
    torus('Low_Table_Ring', C, 0.40, 0.008, (0, 0, 0.12), M['steel_dark'], parent=tbl, seg=64, sides=8)
    for k in range(4):
        a = TAU * k / 4 + 0.3
        tube(f'Low_Table_Leg_{k}', C, [Vector((0.40 * math.cos(a), 0.40 * math.sin(a), 0.0)),
                                       Vector((0.42 * math.cos(a), 0.42 * math.sin(a), 0.41))], 0.009,
             M['steel_dark'], parent=tbl)
    # stack of seven subject books, all spines facing `face` (the wide camera); each book sits 1.4 cm further
    # back than the one below, so no book hides another's title
    fx, fy = face[0] - tx, face[1] - ty
    fl = math.hypot(fx, fy)
    fx, fy = fx / fl, fy / fl
    yaw = math.atan2(-fy, -fx)        # local -X (the spine side) points at `face`
    sb = bmesh.new()
    uvl = sb.loops.layers.uv.new('UVMap')
    rng = random.Random(77)
    z = 0.443
    for i in range(7):
        h = 0.042
        w, d = 0.235 - 0.004 * i, 0.165 - 0.003 * i
        x0 = -0.11 + 0.014 * i
        y0 = -0.117 + 0.002 * i + rng.uniform(-0.004, 0.004)
        rot = rng.uniform(-0.03, 0.03)
        v1 = 1 - i / 8
        v0 = v1 - 1 / 8
        pv1 = 1 - 7 / 8
        P = [Vector((0, 0, 0)), Vector((0, w, 0)), Vector((d, w, 0)), Vector((d, 0, 0)),
             Vector((0, 0, h)), Vector((0, w, h)), Vector((d, w, h)), Vector((d, 0, h))]
        R = Matrix.Rotation(rot, 3, 'Z')
        vs = [sb.verts.new(R @ (p + Vector((x0, y0, 0))) + Vector((0, 0, z))) for p in P]

        def face_(ix, uvs):
            f = sb.faces.new([vs[k] for k in ix])
            for lp, uv in zip(f.loops, uvs):
                lp[uvl].uv = uv
        # spine on the -X face; the text reads left-to-right when seen from -X looking +X
        face_((1, 0, 4, 5), [(0, v0), (1, v0), (1, v1), (0, v1)])
        face_((4, 7, 6, 5), [(0.02, v0 + 0.02), (0.06, v0 + 0.02), (0.06, v1 - 0.02), (0.02, v1 - 0.02)])
        face_((0, 3, 7, 4), [(0, 0.0), (1, 0.0), (1, pv1), (0, pv1)])
        face_((3, 2, 6, 7), [(0, 0.0), (1, 0.0), (1, pv1), (0, pv1)])
        face_((2, 1, 5, 6), [(0, 0.0), (1, 0.0), (1, pv1), (0, pv1)])
        face_((0, 1, 2, 3), [(0.02, v0 + 0.02), (0.06, v0 + 0.02), (0.06, v1 - 0.02), (0.02, v1 - 0.02)])
        z += h + 0.001
    bstack = bm_obj(sb, 'Book_Stack_Seven_Subjects', C, M['stack'], loc=(tx, ty, 0), rot=(0, 0, yaw))
    bevel(bstack, 0.002, 1)
    # candle in a frosted amber glass, in front of and beside the stack so it lights the spines
    sx, sy = fy, -fx
    candle_jar(M, C, 'Table_Candle', (tx + 0.25 * fx + 0.19 * sx, ty + 0.25 * fy + 0.19 * sy, 0.443),
                    glass=M['candle_glass'], scale=1.25)
    small_plant(M, C, 'Table_Plant', (tx - 0.26 * sx + 0.02 * fx, ty - 0.26 * sy + 0.02 * fy, 0.443), 0.28, seed=71)
    # sofa corner (front right), facing -X toward the table
    sx0, sx1, sy0, sy1 = 3.75, 4.98, 0.25, 3.25
    box('Sofa_Base', C, (sx1 - sx0, sy1 - sy0, 0.30), ((sx0 + sx1) / 2, (sy0 + sy1) / 2, 0.22), M['fabric_sofa'],
        bev=0.04, seg=3)
    box('Sofa_Plinth', C, (sx1 - sx0 - 0.1, sy1 - sy0 - 0.1, 0.07), ((sx0 + sx1) / 2, (sy0 + sy1) / 2, 0.035),
        M['plastic_black'])
    box('Sofa_Back', C, (0.22, sy1 - sy0, 0.48), (sx1 - 0.11, (sy0 + sy1) / 2, 0.58), M['fabric_sofa'], bev=0.06,
        seg=4)
    box('Sofa_Arm', C, (sx1 - sx0, 0.22, 0.30), ((sx0 + sx1) / 2, sy1 - 0.11, 0.50), M['fabric_sofa'], bev=0.06,
        seg=4)
    for i, y in enumerate((0.70, 1.55, 2.40)):
        c = box(f'Sofa_Seat_Cushion_{i}', C, (0.95, 0.82, 0.14), (sx0 + 0.52, y, 0.43), M['fabric_sofa'])
        bevel(c, 0.05, 3)
        subsurf(c, 1)
    for i, (y, m, rz) in enumerate(((0.80, 'pillow_dark', 8), (1.45, 'cushion_violet', -6), (2.55, 'pillow', 4))):
        c = box(f'Sofa_Pillow_{i}', C, (0.14, 0.44, 0.40), (sx1 - 0.30, y, 0.70), M[m], rot=(0, D(-14), D(rz)))
        bevel(c, 0.06, 3)
        subsurf(c, 2)
    # knit throw over the sofa arm
    def sthrow(u, v):
        x = sx0 + 0.05 + (sx1 - sx0 - 0.25) * u
        y = sy1 - 0.45 + 0.55 * v
        z = 0.52 + 0.02 * math.sin(u * 7 + v * 3)
        if y > sy1 - 0.22:
            t = (y - (sy1 - 0.22)) / 0.33
            z = 0.66 + 0.02 * math.sin(u * 9)
            if t > 0.6:
                z = 0.66 - (t - 0.6) * 1.2
                y = sy1 + 0.02 + 0.03 * math.sin(u * 11)
        return (x, y, z)
    st = bm_obj(grid_bm(40, 24, sthrow), 'Sofa_Throw', C, M['knit_grey'], smooth=True)
    solidify(st, 0.012, 0)
    subsurf(st, 1)
    return C


RING = (3.9, 4.8, 3.9, 0.55)    # centre x, y, z and radius: over the head of the bed, clear of the mezzanine


def build_ring_light(M):
    """Warm (#ffe7c8) glowing ring, 5 cm section, 1.1 m across, hung over the head of the bed 1.1 m below the
    ceiling on three visible cables: in the wide shot it sits in the upper right between the mezzanine and the
    big canvas instead of covering the mezzanine lounge. Small point lights around it are in build_lights."""
    C = coll('Lamps')
    S = coll('Light_Strips')
    cx, cy, cz, R = RING
    torus('Ring_Light_Housing', C, R, 0.030, (cx, cy, cz + 0.010), M['steel_dark'], seg=160, sides=14)
    torus('Strip_Ring_Light', S, R, 0.025, (cx, cy, cz - 0.008), M['ring_light'], seg=160, sides=14)
    for k in range(3):
        a = TAU * k / 3 + 0.5
        p = Vector((cx + R * math.cos(a), cy + R * math.sin(a), cz + 0.03))
        tube(f'Ring_Light_Wire_{k}', C, [p, Vector((p.x, p.y, 5.0))], 0.0035, M['alu'], sides=6)
        cyl(f'Ring_Light_Clamp_{k}', C, 0.009, 0.03, (p.x, p.y, cz + 0.045), M['alu_dark'], seg=12)
        cyl(f'Ring_Light_Canopy_{k}', C, 0.03, 0.014, (p.x, p.y, 4.993), M['alu_dark'], seg=16)
    return C
