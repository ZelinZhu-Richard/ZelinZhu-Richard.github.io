"""05-moonlit-desert-oasis: an expedition jeep rolls into a blue-walled caravan town on the edge
of a dune sea, the hour before dawn, along a wet sandstone road beside an irrigation channel toward
the town gate. The sky is one real photograph (ESO potw1713a, the southern Milky Way with the core
rising behind the town) with a thin earthshine crescent Moon and Comet McNaught over the inn.

Run (from workspace/pov-films):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
    -P films/05-moonlit-desert-oasis/build.py -- --stills 1.0,4.0,7.0,9.5 --scale 0.5

The sky plates come from prep_plates.py (python3 -I ... prep_plates.py milkyway1713 comet).
"""
import os
import sys
import math
import random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'kit'))
import povkit as pk  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector, Matrix, Euler  # noqa: E402

SLUG = '05-moonlit-desert-oasis'
CORE_AZ, CORE_EL = -19.0, 1.0
PLATES = os.path.join(HERE, 'plates')

# ---------------------------------------------------------------- palette
AMBER = (1.0, 0.52, 0.16)
SAFFRON = (1.0, 0.62, 0.12)
WARM_W = (1.0, 0.72, 0.42)
TURQ = (0.08, 0.85, 0.78)
CYAN = (0.25, 0.75, 1.0)
MAGENTA = (1.0, 0.18, 0.62)
ROSE = (1.0, 0.36, 0.5)
COBALT = (0.16, 0.36, 1.0)
VIOLET = (0.55, 0.3, 1.0)
WARM_BULB = (1.0, 0.56, 0.2)
WARM_BULB2 = (1.0, 0.66, 0.32)
LAMP_COLORS = [TURQ, AMBER, COBALT, TURQ, AMBER, MAGENTA, COBALT]
WASHES = [COBALT, (0.15, 0.6, 1.0), MAGENTA, COBALT, VIOLET, (0.1, 0.8, 1.0), COBALT, TURQ]

WALLS = [(0.16, 0.30, 0.66), (0.09, 0.18, 0.55), (0.10, 0.42, 0.50), (0.40, 0.31, 0.64),
         (0.58, 0.27, 0.40), (0.20, 0.36, 0.70), (0.12, 0.26, 0.60), (0.46, 0.36, 0.30)]
DOORS = [(0.05, 0.45, 0.45), (0.65, 0.12, 0.10), (0.85, 0.55, 0.12), (0.1, 0.2, 0.6)]

_MATS = {}


def M(key, fn):
    if key not in _MATS:
        _MATS[key] = fn()
    return _MATS[key]


def clay(col):
    return M(('clay', col), lambda: pk.mat.clay(col, roughness=0.82, bumps=0.9, grime=0.55,
                                                 variation=0.17))


def emit(col, s):
    return M(('emit', col, s), lambda: pk.mat.emission(col, s))


def lit_win(col, s, mull=(2, 2), curtains=0.35):
    return M(('win', col, s, mull), lambda: pk.mat.lit_window(col, strength=s, mullions=mull,
                                                              curtains=curtains, variation=0.45,
                                                              frame_color=(0.06, 0.04, 0.03)))


def iron():
    return M('iron', lambda: pk.mat.metal((0.04, 0.04, 0.05), roughness=0.38, scratches=0.2,
                                          dirt=0.3, name='Iron'))


def wood(col):
    return M(('wood', col), lambda: pk.mat.painted_wood(col, wear=0.45, roughness=0.55))


# ---------------------------------------------------------------- small helpers
def frame_at(path, s, lat=0.0, z=0.0):
    """World position plus right / tangent vectors and the yaw (rad) at arc length s."""
    p = path.offset(s, lat, z)
    return p, path.right(s), path.tangent(s), -math.radians(path.heading(s))


def merge(objs, name, collection=None):
    """Merge mesh objects (with their transforms) into one object, keeping materials."""
    bm = bmesh.new()
    mats = []
    for o in objs:
        me = o.data
        mw = Matrix.LocRotScale(o.location, o.rotation_euler, o.scale)
        n0 = len(bm.verts)
        f0 = len(bm.faces)
        bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        bmesh.ops.transform(bm, matrix=mw, verts=bm.verts[n0:])
        idx = {}
        for i, m in enumerate(me.materials):
            if m not in mats:
                mats.append(m)
            idx[i] = mats.index(m)
        for f in bm.faces[f0:]:
            f.material_index = idx.get(f.material_index, 0)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    pk._link(ob, collection)
    for o in objs:
        d = o.data
        bpy.data.objects.remove(o)
        if d.users == 0:
            bpy.data.meshes.remove(d)
    return ob


def multi_box(boxes, material, name, radius=0.04, segments=2, collection=None):
    """One mesh holding many bevelled boxes: boxes = [((cx, cy, cz), (sx, sy, sz), rot_z), ...]
    (centre of the box, sizes, optional yaw in radians)."""
    parts = []
    for i, b in enumerate(boxes):
        c, sz = b[0], b[1]
        rz = b[2] if len(b) > 2 else 0.0
        o = pk.geo.rounded_box(sz, radius=min(radius, 0.45 * min(sz)), segments=segments,
                               material=material, name=name + '_p', origin='CENTER')
        o.location = c
        o.rotation_euler = (0, 0, rz)
        parts.append(o)
    ob = merge(parts, name, collection)
    ob.data.shade_smooth()
    ob.data.set_sharp_from_angle(angle=math.radians(30))
    pk.edge_mask(ob, gain=2.5)
    return ob


def bulbs_mesh(points, material_list, name, radius=0.035, collection=None):
    """Many small emissive bulbs as one mesh; points = [(xyz, material_index)]."""
    bm = bmesh.new()
    for p, mi in points:
        r = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=radius)
        for v in r['verts']:
            v.co += Vector(p)
        for f in {f for v in r['verts'] for f in v.link_faces}:
            f.material_index = mi
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    for m in material_list:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    pk._link(ob, collection)
    ob.visible_shadow = False
    return ob


def spiral_points(z0, z1, r_of_z, turns, n, cx=0.0, cy=0.0, phase=0.0):
    pts = []
    for i in range(n):
        t = i / max(n - 1, 1)
        z = z0 + (z1 - z0) * t
        a = phase + 2 * math.pi * turns * t
        r = r_of_z(z)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
    return pts


# ---------------------------------------------------------------- custom materials
def mat_hood():
    """Old expedition-jeep paint: dark desert olive under a satin clear coat, mottled with dust
    and water spots, worn to metal on the edges, beaded with rain."""
    m, nt, out = pk._new_mat('JeepPaint')
    co = pk.texcoord(nt, 'Object')
    vo = pk.voronoi(nt, co, scale=70.0, feature='F1')
    szf, _ = pk.noise(nt, co, scale=45.0, detail=1.0)
    rad = pk.maprange(nt, szf, 0.42, 0.72, 0.0, 0.36)
    dist = vo['Distance']
    bead = pk.math_(nt, 'LESS_THAN', dist, rad)
    hgt = pk.math_(nt, 'MULTIPLY', bead, pk.math_(nt, 'SQRT', pk.math_(nt, 'MAXIMUM', pk.math_(
        nt, 'SUBTRACT', pk.math_(nt, 'MULTIPLY', rad, rad), pk.math_(nt, 'MULTIPLY', dist, dist)), 0.0)))
    nb = pk.bump(nt, hgt, strength=0.9, distance=0.006)
    df, _ = pk.noise(nt, co, scale=3.0, detail=5.0, rough=0.6)
    sf, _ = pk.noise(nt, co, scale=28.0, detail=3.0)
    base = (0.008, 0.026, 0.022)
    dusty = (0.045, 0.045, 0.036)
    col = pk.mix_col(nt, pk.maprange(nt, df, 0.55, 0.8, 0.0, 0.3), base, dusty)
    e = pk._edge(nt)
    wn, _ = pk.noise(nt, co, scale=18.0, detail=4.0)
    wear = pk.maprange(nt, pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', e, 1.2),
                                    pk.math_(nt, 'MULTIPLY', wn, 0.5)), 0.75, 0.9)
    col = pk.mix_col(nt, wear, col, (0.20, 0.19, 0.17))
    rough = pk.maprange(nt, sf, 0.3, 0.7, 0.3, 0.45)
    rough = pk.mix_f(nt, bead, rough, 0.04)
    coat = pk.mix_f(nt, wear, 0.95, 0.1)
    p = pk._principled(nt, base=col, rough=rough, normal=nb, coat=coat, coat_rough=0.035,
                       coat_normal=nb, spec=0.5, metal=pk.math_(nt, 'MULTIPLY', wear, 0.8))
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=base, rough=0.08, coat=1.0, coat_rough=0.035)    # web: the hood's clear coat (the
    # viewer's hood mirror, web_hood_mirror, blurs by this roughness)
    return m


def mat_stripes(c1, c2, name, freq=5.0, axis=0):
    """Striped awning canvas (stripes along local X)."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    comp = pk.sep_xyz(nt, co)[axis]
    st = pk.math_(nt, 'GREATER_THAN', pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', comp, freq * 2 * math.pi)), 0.0)
    col = pk.mix_col(nt, st, c1, c2)
    fn, _ = pk.noise(nt, co, scale=30.0, detail=3.0)
    nrm = pk.bump(nt, fn, strength=0.15, distance=0.004)
    p = pk._principled(nt, base=col, rough=0.75, normal=nrm, sheen=0.4, sss=0.25,
                       sss_radius=(0.5, 0.3, 0.2), sss_scale=0.05)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=c1, rough=0.8)
    return m


def mat_cactus():
    m, nt, out = pk._new_mat('Cactus')
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    rib = pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', U, 2 * math.pi * 7)))
    rib = pk.math_(nt, 'POWER', rib, 0.5)
    co = pk.texcoord(nt, 'Object')
    fn, _ = pk.noise(nt, co, scale=6.0, detail=4.0)
    col = pk.mix_col(nt, pk.maprange(nt, rib, 0.0, 1.0, 0.0, 1.0), (0.03, 0.12, 0.08), (0.08, 0.30, 0.18))
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, fn, 0.3, 0.7, 0.8, 1.15))
    nrm = pk.bump(nt, rib, strength=0.6, distance=0.02)
    e = pk._edge(nt)
    p = pk._principled(nt, base=col, rough=pk.maprange(nt, rib, 0, 1, 0.65, 0.4), normal=nrm,
                       coat=0.2, coat_rough=0.3, sss=0.1, sss_radius=(0.2, 0.5, 0.2), sss_scale=0.03)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.06, 0.22, 0.13), rough=0.5)
    return m


def mat_frond():
    m, nt, out = pk._new_mat('PalmFrond')
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    lf = pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', V, 2 * math.pi * 9)))
    co = pk.texcoord(nt, 'Object')
    fn, _ = pk.noise(nt, co, scale=2.0, detail=3.0)
    col = pk.mix_col(nt, pk.maprange(nt, fn, 0.3, 0.7), (0.03, 0.14, 0.09), (0.07, 0.24, 0.12))
    nrm = pk.bump(nt, lf, strength=0.5, distance=0.01)
    p = pk._principled(nt, base=col, rough=0.5, normal=nrm, sss=0.2, sss_radius=(0.3, 0.6, 0.2),
                       sss_scale=0.05, coat=0.2, coat_rough=0.25)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.05, 0.2, 0.1), rough=0.5)
    return m


def mat_canvas_glow(col, strength, name):
    """Canvas lit from inside (wagon hood, tent): translucent warm glow, brighter in the middle."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    fn, _ = pk.noise(nt, co, scale=8.0, detail=3.0)
    lw = pk.node(nt, 'ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    face = pk.math_(nt, 'SUBTRACT', 1.0, lw.outputs['Facing'])
    s = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, face, 0.0, 1.0, 0.45, 1.0),
                 pk.maprange(nt, fn, 0.3, 0.7, strength * 0.75, strength * 1.15))
    p = pk._principled(nt, base=(0.6, 0.45, 0.3), rough=0.85, emit=col, emit_strength=s)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.5, 0.4, 0.3), rough=0.85, emit=col, emit_strength=strength)
    return m


# ---------------------------------------------------------------- props
def lantern_shape(name, glass, cap, coll, scale=1.0):
    """Pierced-metal desert lantern: faceted glass body, onion cap, finial (hangs from z=0)."""
    s = scale
    body = pk.geo.lathe([(0.0, -0.46 * s), (0.07 * s, -0.44 * s), (0.12 * s, -0.36 * s), (0.135 * s, -0.24 * s),
                         (0.11 * s, -0.14 * s), (0.06 * s, -0.10 * s), (0.0, -0.10 * s)],
                        segments=8, material=glass, name=name + 'Glass', collection=coll, edges=False)
    top = pk.geo.lathe([(0.0, -0.13 * s), (0.075 * s, -0.12 * s), (0.08 * s, -0.09 * s), (0.05 * s, -0.04 * s),
                        (0.015 * s, 0.0), (0.0, 0.02 * s)], segments=8, material=cap,
                       name=name + 'Cap', collection=coll)
    bot = pk.geo.lathe([(0.0, -0.53 * s), (0.03 * s, -0.5 * s), (0.06 * s, -0.46 * s), (0.0, -0.45 * s)],
                       segments=8, material=cap, name=name + 'Foot', collection=coll)
    return merge([body, top, bot], name, coll)


def lantern_post(path, s, side, color, coll, idx, light=True, energy=2600.0, lat=4.15):
    lat = side * lat
    base, R, T, yaw = frame_at(path, s, lat, 0.12)
    inward = -side
    h = 4.1
    pole = [tuple(base + Vector((0, 0, z))) for z in (0.0, 1.5, h - 0.45)]
    arm = []
    for i in range(1, 14):
        a = math.pi / 2 * i / 13
        p = base + Vector((0, 0, h - 0.45)) + R * (inward * (0.45 - 0.45 * math.cos(a))) + \
            Vector((0, 0, 0.45 * math.sin(a)))
        arm.append(tuple(p))
    tip = base + R * inward * 1.15 + Vector((0, 0, h))
    arm.append(tuple(base + R * inward * 0.7 + Vector((0, 0, h))))
    arm.append(tuple(tip))
    pk.geo.tube_along(pole + arm, radius=0.05, segments=10, material=iron(),
                      name='PostPole%d' % idx, collection=coll)
    # scroll under the arm
    sc_pts = []
    for i in range(25):
        a = 2.2 * math.pi * i / 24
        r = 0.22 * (1 - i / 30)
        sc_pts.append(tuple(base + Vector((0, 0, h - 0.75 + r * math.sin(a))) + R * inward * (0.3 + r * math.cos(a))))
    pk.geo.tube_along(sc_pts, radius=0.018, segments=6, material=iron(), name='PostScroll%d' % idx,
                      collection=coll)
    pk.geo.lathe([(0.0, 0.0), (0.16, 0.0), (0.16, 0.12), (0.11, 0.2), (0.07, 0.45), (0.0, 0.45)],
                 segments=16, material=iron(), name='PostFoot%d' % idx, location=tuple(base), collection=coll)
    glass = emit(color, 26.0)
    ln = lantern_shape('PostLantern%d' % idx, glass, iron(), coll, scale=1.15)
    ln.location = tuple(tip + Vector((0, 0, -0.06)))
    pk.geo.tube_along([tuple(tip), tuple(tip + Vector((0, 0, -0.06)))], radius=0.008, segments=6,
                      material=iron(), name='PostChain%d' % idx, collection=coll)
    if light:
        lp = tip + Vector((0, 0, -0.45))
        pk.lights.spot(tuple(lp), tuple(lp + Vector((0, 0, -4.0)) + R * inward * 0.9), color, energy,
                       angle_deg=120, blend=0.75, radius=0.1, shadow=False, name='PostLight%d' % idx,
                       collection=coll, volume=0.25)
        pk.lights.point(tuple(lp + Vector((0, 0, 0.15))), color, 25.0, radius=0.15, shadow=False,
                        name='PostGlow%d' % idx, collection=coll, volume=0.0)


def palm_variant(name, height, lean, rng, coll, bulb_mats, n_bulbs=46, fronds=13):
    """Date palm: ringed curved trunk, drooping fronds, fairy lights spiralling up the trunk."""
    trunk_m = M('trunk', lambda: pk.mat.clay((0.16, 0.11, 0.08), roughness=0.9, bumps=1.0, grime=0.5,
                                             name='PalmTrunk'))
    pts, sc = [], []
    n = 60
    for i in range(n + 1):
        t = i / n
        x = lean * height * (t ** 1.6)
        pts.append((x, 0.0, height * t))
        ring = 1.0 + 0.09 * ((i % 3) / 2.0)
        sc.append((1.35 - 0.55 * t) * ring)
    prof = [(0.16 * math.cos(2 * math.pi * j / 12), 0.16 * math.sin(2 * math.pi * j / 12)) for j in range(12)]
    trunk = pk.geo.sweep(pts, prof, material=trunk_m, name=name + 'Trunk', collection=coll, scale=sc)
    top = Vector(pts[-1])
    parts = [trunk]
    fm = M('frond', mat_frond)
    for k in range(fronds):
        a = 2 * math.pi * k / fronds + rng.uniform(-0.2, 0.2)
        up = rng.uniform(0.15, 0.75) if k % 2 else rng.uniform(-0.25, 0.3)
        L = rng.uniform(2.4, 3.3)
        spine, widths = [], []
        for i in range(16):
            t = i / 15
            d = Vector((math.cos(a), math.sin(a), 0)) * (L * t)
            z = L * (up * t - (0.55 + 0.25 * (1 - up)) * t * t)
            spine.append(tuple(top + d + Vector((0, 0, z))))
            w = 0.36 * math.sin(math.pi * min(1.0, t * 1.15)) ** 0.8 * (0.75 + 0.25 * abs(math.sin(t * 40)))
            widths.append(max(w, 0.01))
        pr = [(-1.0, -0.35), (-0.5, -0.1), (0.0, 0.0), (0.5, -0.1), (1.0, -0.35)]
        fr = pk.geo.sweep(spine, pr, closed_profile=False, caps=False, material=fm,
                          name=name + 'Frond', collection=coll, scale=widths)
        parts.append(fr)
    # date clusters
    dm = M('dates', lambda: pk.mat.toy_plastic((0.55, 0.22, 0.05), roughness=0.4, name='Dates'))
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.4
        c = top + Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, -0.35))
        ball = pk.geo.lathe([(0.0, -0.3), (0.14, -0.22), (0.17, -0.05), (0.1, 0.06), (0.0, 0.08)], segments=10,
                            material=dm, name=name + 'Dates', collection=coll, location=tuple(c))
        parts.append(ball)
    # fairy lights spiralling up the trunk
    bpts = []
    for i in range(n_bulbs):
        t = 0.08 + 0.86 * i / (n_bulbs - 1)
        x = lean * height * (t ** 1.6)
        r = 0.16 * (1.35 - 0.55 * t) + 0.05
        a = 2 * math.pi * 5.5 * t
        bpts.append(((x + r * math.cos(a), r * math.sin(a), height * t), i % len(bulb_mats)))
    bl = bulbs_mesh(bpts, bulb_mats, name + 'Bulbs', radius=0.032, collection=coll)
    parts.append(bl)
    ob = merge(parts, name, coll)
    pk.edge_mask(ob, gain=2.0)
    return ob


def cactus_variant(name, h, arms, rng, coll, bulb_mats):
    cm = M('cactus', mat_cactus)
    r0 = 0.24 * h / 2.4
    prof = [(r0 * 0.8, 0.0), (r0, 0.15)]
    for i in range(1, 9):
        z = 0.15 + (h - 0.15 - r0) * i / 8
        prof.append((r0 * (1.0 - 0.06 * i / 8), z))
    for i in range(1, 7):
        a = math.pi / 2 * i / 6
        prof.append((r0 * 0.94 * math.cos(a), h - r0 + r0 * math.sin(a)))
    body = pk.geo.lathe(prof, segments=20, material=cm, name=name + 'Body', collection=coll)
    parts = [body]
    bpts = []
    for k in range(arms):
        side = 1 if k % 2 == 0 else -1
        ang = rng.uniform(-0.5, 0.5) + (0 if side > 0 else math.pi)
        dirv = Vector((math.cos(ang), math.sin(ang), 0))
        z0 = h * rng.uniform(0.35, 0.55)
        out = rng.uniform(0.45, 0.65) * h / 2.4
        up = rng.uniform(0.5, 0.9) * h / 2.4
        ra = r0 * 0.62
        pts = []
        for i in range(14):
            t = i / 13
            a = math.pi / 2 * t
            p = dirv * (r0 * 0.6 + out * math.sin(a)) + Vector((0, 0, z0 + out * (1 - math.cos(a))))
            pts.append(p)
        for i in range(1, 8):
            pts.append(pts[13] + Vector((0, 0, up * i / 7)))
        sc = [1.0] * (len(pts) - 3) + [0.85, 0.6, 0.25]
        prf = [(ra * math.cos(2 * math.pi * j / 16), ra * math.sin(2 * math.pi * j / 16)) for j in range(16)]
        arm = pk.geo.sweep([tuple(p) for p in pts], prf, material=cm, name=name + 'Arm', collection=coll,
                           scale=sc)
        parts.append(arm)
        for i in range(0, len(pts) - 2, 2):
            p = pts[i]
            bpts.append((tuple(p + Vector((0, 0, ra + 0.04))), (i // 2 + k) % len(bulb_mats)))
    for p in spiral_points(0.25, h - 0.15, lambda z: r0 + 0.035, 4.0, 30, phase=rng.uniform(0, 6)):
        bpts.append((p, len(bpts) % len(bulb_mats)))
    bl = bulbs_mesh(bpts, bulb_mats, name + 'Bulbs', radius=0.03, collection=coll)
    parts.append(bl)
    ob = merge(parts, name, coll)
    pk.edge_mask(ob, gain=2.0)
    return ob


def jar_variant(name, coll, col, h=0.8):
    m = M(('jar', col), lambda: pk.mat.clay(col, roughness=0.6, bumps=0.3, grime=0.5))
    return pk.geo.lathe([(0.0, 0.0), (0.14 * h, 0.0), (0.3 * h, 0.25 * h), (0.32 * h, 0.5 * h),
                         (0.2 * h, 0.82 * h), (0.11 * h, 0.9 * h), (0.14 * h, 1.0 * h), (0.11 * h, 1.0 * h),
                         (0.08 * h, 0.92 * h)], segments=24, material=m, name=name, collection=coll,
                        cap_top=False)


def crate_stack(c, R, T, coll, rng, name):
    wm = M('crate', lambda: pk.mat.painted_wood((0.32, 0.2, 0.1), wear=0.6, roughness=0.7, name='CrateWood'))
    boxes = []
    n = rng.randint(2, 4)
    for i in range(n):
        s = rng.uniform(0.55, 0.8)
        off = R * rng.uniform(-0.4, 0.4) + T * (i * 0.85 - 0.6)
        z = 0.0
        boxes.append(((c.x + off.x, c.y + off.y, c.z + s / 2), (s, s * 1.1, s), rng.uniform(0, 0.4)))
        if rng.random() < 0.5:
            s2 = s * 0.8
            boxes.append(((c.x + off.x, c.y + off.y, c.z + s + s2 / 2), (s2, s2, s2), rng.uniform(0, 0.6)))
    return multi_box(boxes, wm, name, radius=0.05, collection=coll)


def mat_rug(c1, c2, c3, name):
    """Woven rug in local XZ (x across, z down from 0 to -L): border bands, a field with a
    stepped diamond medallion, a faint weave bump and sheen."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    ax = pk.math_(nt, 'ABSOLUTE', x)
    zc = pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'ADD', z, 1.0))
    border = pk.math_(nt, 'MAXIMUM', pk.math_(nt, 'GREATER_THAN', ax, 0.42),
                      pk.math_(nt, 'GREATER_THAN', zc, 0.9))
    stripe = pk.math_(nt, 'GREATER_THAN', pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'ADD', ax, zc), 40.0)), 0.3)
    dia = pk.math_(nt, 'LESS_THAN', pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', ax, 1.6), zc), 0.62)
    dia2 = pk.math_(nt, 'LESS_THAN', pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', ax, 1.6), zc), 0.32)
    col = pk.mix_col(nt, dia, c1, c3)
    col = pk.mix_col(nt, dia2, col, c2)
    col = pk.mix_col(nt, border, col, pk.mix_col(nt, stripe, c2, c3))
    wv, _ = pk.noise(nt, co, scale=160.0, detail=1.0)
    nrm = pk.bump(nt, wv, strength=0.2, distance=0.003)
    p = pk._principled(nt, base=col, rough=0.85, normal=nrm, sheen=0.6)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=c1, rough=0.85)
    return m


RUGS = [((0.45, 0.05, 0.05), (0.85, 0.6, 0.2), (0.05, 0.08, 0.3)),
        ((0.05, 0.1, 0.35), (0.8, 0.7, 0.5), (0.5, 0.06, 0.08)),
        ((0.6, 0.25, 0.04), (0.1, 0.25, 0.25), (0.8, 0.75, 0.6)),
        ((0.25, 0.05, 0.2), (0.85, 0.55, 0.15), (0.1, 0.3, 0.3))]


def rug_mesh(name, w, L, coll, mat, wave=0.03):
    v, f = [], []
    nx, nz = 6, 10
    for j in range(nz + 1):
        for i in range(nx + 1):
            x = -w / 2 + w * i / nx
            zz = -L * j / nz
            v.append((x, wave * math.sin(j * 1.3 + i * 0.4), zz))
    for j in range(nz):
        for i in range(nx):
            a = j * (nx + 1) + i
            f.append((a, a + 1, a + nx + 2, a + nx + 1))
    ob = pk.mesh_object(name, v, f, material=mat, collection=coll)
    return ob


ROBES = [(0.04, 0.06, 0.2), (0.28, 0.09, 0.05), (0.3, 0.27, 0.22), (0.08, 0.15, 0.13), (0.3, 0.06, 0.12)]


def figure(name, coll, robe, wrap, h=1.72, lean=0.0):
    """Toy-like robed figure (silhouette scale): flared robe, shoulders, head with a wrap."""
    rm = M(('robe', robe), lambda: pk.mat.clay(robe, roughness=0.85, bumps=0.3, grime=0.3, variation=0.1,
                                                name='Robe'))
    wm = M(('wrap', wrap), lambda: pk.mat.clay(wrap, roughness=0.8, bumps=0.2, grime=0.2, name='Wrap'))
    sk = M('skin', lambda: pk.mat.clay((0.35, 0.2, 0.12), roughness=0.6, bumps=0.1, grime=0.1, name='Skin'))
    k = h / 1.72
    body = pk.geo.lathe([(0.0, 0.0), (0.27 * k, 0.0), (0.24 * k, 0.35 * k), (0.18 * k, 0.95 * k),
                         (0.2 * k, 1.22 * k), (0.235 * k, 1.36 * k), (0.2 * k, 1.42 * k), (0.07 * k, 1.47 * k),
                         (0.0, 1.47 * k)], segments=16, material=rm, name=name + 'Robe', collection=coll)
    body.scale = (1.0, 0.72, 1.0)
    bpy.context.view_layer.update()
    body.data.transform(Matrix.Diagonal((1.0, 0.72, 1.0, 1.0)))
    body.scale = (1.0, 1.0, 1.0)
    head = pk.geo.lathe([(0.0, 1.44 * k), (0.07 * k, 1.47 * k), (0.1 * k, 1.56 * k), (0.09 * k, 1.64 * k),
                         (0.0, 1.66 * k)], segments=14, material=sk, name=name + 'Head', collection=coll)
    wrapo = pk.geo.lathe([(0.0, 1.6 * k), (0.11 * k, 1.6 * k), (0.125 * k, 1.66 * k), (0.1 * k, 1.73 * k),
                          (0.0, 1.75 * k)], segments=14, material=wm, name=name + 'Wrap', collection=coll)
    arms = []
    for sx in (-1, 1):
        arms.append(pk.geo.tube_along([(sx * 0.2 * k, 0.0, 1.34 * k), (sx * 0.27 * k, 0.02, 1.08 * k),
                                       (sx * 0.25 * k, 0.06, 0.82 * k)], radius=0.055 * k, segments=8,
                                      material=rm, name=name + 'Arm', collection=coll))
    ob = merge([body, head, wrapo] + arms, name, coll)
    ob.rotation_euler.x = lean
    pk.edge_mask(ob, gain=2.0)
    return ob


def market_stall(path, s, side, lat, coll, rng, k, canopy):
    """Night-market stall facing the road: four poles, a sagging striped canopy, a counter
    with baskets of fruit, a rug at the back, a hanging lantern that lights it warm."""
    c, R, T, yaw = frame_at(path, s, side * lat, 0.0)
    inward = -side
    pm = M('fpole', lambda: pk.mat.painted_wood((0.30, 0.13, 0.06), wear=0.6, roughness=0.6, name='FestPole'))
    W_, D_, H_ = 3.2, 1.8, 2.5
    objs = []
    for a in (-1, 1):
        for b in (0, 1):
            p = c + T * (a * W_ / 2) + R * (inward * (-D_ / 2 + b * D_))
            hh = H_ if b == 1 else H_ - 0.35
            objs.append(pk.geo.tube_along([tuple(p), tuple(p + Vector((0, 0, hh)))], radius=0.04, segments=8,
                                          material=pm, name='StallPole', collection=coll))
    # canopy: striped cloth from the back (low) to the front (high), sagging
    c1, c2 = canopy
    am = M(('stallawn', c1, c2), lambda: mat_stripes(c1, c2, 'StallCanopy%d' % k, freq=2.5, axis=0))
    v, f = [], []
    nu, nv = 10, 6
    for j in range(nv + 1):
        for i in range(nu + 1):
            u = i / nu
            t = j / nv
            p = c + T * ((u - 0.5) * (W_ + 0.3)) + R * (inward * ((t - 0.5) * (D_ + 0.4)))
            z = (H_ - 0.35) + 0.35 * t + 0.05 - 0.12 * math.sin(math.pi * u) * math.sin(math.pi * t)
            v.append((p.x, p.y, z))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            f.append((a, a + 1, a + nu + 2, a + nu + 1))
    cv = pk.mesh_object('StallCanopy%d' % k, v, f, material=am, collection=coll)
    # valance flaps along the front edge
    fl = []
    for i in range(8):
        u = (i + 0.5) / 8
        p = c + T * ((u - 0.5) * (W_ + 0.3)) + R * (inward * ((D_ + 0.4) / 2))
        fl.append(((p.x, p.y, H_ - 0.08), (0.36, 0.03, 0.26), yaw))
    multi_box(fl, am, 'StallValance%d' % k, radius=0.01, collection=coll)
    # counter + baskets of fruit
    cm = M('crate', lambda: pk.mat.painted_wood((0.32, 0.2, 0.1), wear=0.6, roughness=0.7, name='CrateWood'))
    cp = c + R * (inward * (D_ / 2 - 0.35))
    multi_box([((cp.x, cp.y, 0.45), (W_ - 0.3, 0.6, 0.9), yaw + math.pi / 2)], cm, 'StallCounter%d' % k,
              radius=0.03, collection=coll)
    fruit_cols = [(0.9, 0.35, 0.05), (0.6, 0.05, 0.08), (0.85, 0.7, 0.1), (0.25, 0.45, 0.08)]
    bm = bmesh.new()
    for bi in range(4):
        bc = cp + T * ((bi - 1.5) * 0.7)
        for fi in range(9):
            a = rng.uniform(0, 2 * math.pi)
            r = rng.uniform(0, 0.2)
            pos = bc + Vector((math.cos(a) * r, math.sin(a) * r, 0.95 + 0.07 * (fi // 4)))
            res = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.075)
            for vv in res['verts']:
                vv.co += pos
            for ff in {ff for vv in res['verts'] for ff in vv.link_faces}:
                ff.material_index = bi
    me = bpy.data.meshes.new('Fruit%d' % k)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    for col in fruit_cols:
        me.materials.append(M(('fruit', col), lambda col=col: pk.mat.toy_plastic(col, roughness=0.35, coat=0.4,
                                                                                  sss=0.2)))
    fo = bpy.data.objects.new('Fruit%d' % k, me)
    pk._link(fo, coll)
    # rug hanging at the back
    rg = rug_mesh('StallRug%d' % k, 1.6, 1.9, coll, M(('rug', k % 4), lambda: mat_rug(*RUGS[k % 4], 'Rug%d' % (k % 4))))
    bp = c + R * (inward * (-D_ / 2 - 0.02)) + Vector((0, 0, H_ - 0.45))
    rg.location = tuple(bp)
    rg.rotation_euler.z = yaw + (math.pi / 2 if inward > 0 else -math.pi / 2)
    # lantern
    lp = c + Vector((0, 0, H_ - 0.15))
    ln = lantern_shape('StallLantern%d' % k, emit((1.0, 0.55, 0.2), 35.0), iron(), coll, scale=0.7)
    ln.location = tuple(lp)
    pk.lights.point(tuple(lp + Vector((0, 0, -0.35))), (1.0, 0.55, 0.22), 160.0, radius=0.2, shadow=False,
                    name='StallLight%d' % k, collection=coll, volume=0.0)
    # two figures at the counter
    for j in range(2):
        fg = figure('Figure%d_%d' % (k, j), coll, ROBES[(k * 2 + j) % len(ROBES)],
                    ROBES[(k * 2 + j + 2) % len(ROBES)], h=rng.uniform(1.55, 1.8))
        if j == 0:
            fp = cp + R * (inward * 0.45) + T * (rng.choice((-1, 1)) * rng.uniform(1.85, 2.1))
        else:
            fp = cp + R * (inward * -0.9) + T * rng.uniform(-1.1, 1.1)
        fg.location = (fp.x, fp.y, 0.13)
    return c


# ---------------------------------------------------------------- houses
def house(path, s, side, w, d, h, wall, rng, coll, idx, face_lat=7.4, opts=None):
    """Blue-washed adobe house facing the road: soft rounded body, parapet merlons, vigas,
    arched lit windows on the facade and the camera-facing end, a door with a lantern,
    optional dome, stair, awning and roof string lights."""
    o = opts or {}
    c, R, T, yaw = frame_at(path, s, side * (face_lat + d / 2), 0.0)
    body = pk.geo.rounded_box((d, w, h), radius=0.42, segments=3, material=clay(wall),
                              name='House%d' % idx, location=tuple(c), collection=coll)
    body.rotation_euler.z = yaw
    f = -side                      # facade direction in local X
    fx = f * (d / 2 + 0.015)
    kids = []

    def child(ob, loc, rz=0.0):
        ob.parent = body
        ob.location = loc
        ob.rotation_euler = (0, 0, rz)
        kids.append(ob)
        return ob
    # parapet merlons + cornice band
    trim_col = tuple(min(1.0, x * 1.35 + 0.05) for x in wall)
    tm = clay(trim_col)
    boxes = [((0, 0, h + 0.06), (d + 0.18, w + 0.18, 0.22))]
    nm = max(2, int(w / 1.5))
    for i in range(nm):
        y = -w / 2 + 0.35 + (w - 0.7) * i / (nm - 1)
        boxes.append(((f * (d / 2 - 0.02), y, h + 0.42), (0.36, 0.62, 0.62)))
    for i in range(max(2, int(d / 1.6))):
        x = -d / 2 + 0.35 + (d - 0.7) * i / max(1, int(d / 1.6) - 1)
        boxes.append(((x, -w / 2 + 0.02, h + 0.42), (0.62, 0.36, 0.62)))
    child(multi_box(boxes, tm, 'Parapet%d' % idx, radius=0.12, collection=coll), (0, 0, 0))
    # vigas (wooden beam ends) under the roof line
    if o.get('vigas', True):
        vm = M('viga', lambda: pk.mat.painted_wood((0.28, 0.17, 0.09), wear=0.7, roughness=0.75, name='Viga'))
        nv = max(3, int(w / 1.1))
        parts = []
        for i in range(nv):
            y = -w / 2 + 0.6 + (w - 1.2) * i / (nv - 1)
            cy = pk.geo.lathe([(0.0, 0.0), (0.09, 0.0), (0.1, 0.02), (0.1, 0.5), (0.085, 0.53), (0.0, 0.53)],
                              segments=10, material=vm, name='Viga', collection=coll)
            cy.location = (f * (d / 2 - 0.15), y, h - 0.45)
            cy.rotation_euler = (0, f * math.pi / 2, 0)
            parts.append(cy)
        child(merge(parts, 'Vigas%d' % idx, coll), (0, 0, 0))
    # windows
    floors = max(1, int((h - 0.6) / 2.9))
    wc = o.get('win_color', AMBER)
    wmat = lit_win(wc, o.get('win_strength', 22.0), mull=(1, 2) if rng.random() < 0.5 else (2, 2))
    cols = max(1, int((w - 1.6) / 1.9))
    if floors > 1:
        wp = pk.geo.window_panel(cols=cols, rows=floors - 1, win_w=0.85, win_h=1.25, gap_x=1.0, gap_y=1.65,
                                 material=wmat, name='Win%d' % idx, seed=idx, collection=coll,
                                 round_top=True, lit_fraction=o.get('lit', 0.8))
        child(wp, (fx, 0, 3.15), f * math.pi / 2)
        # sills under the upper windows
        sills = []
        tw = cols * 0.85 + (cols - 1) * 1.0
        for r in range(floors - 1):
            for k in range(cols):
                y = -tw / 2 + 0.425 + k * 1.85
                sills.append(((fx + f * 0.06, y, 3.08 + r * 2.9), (0.16, 1.05, 0.09)))
        child(multi_box(sills, tm, 'Sill%d' % idx, radius=0.03, collection=coll), (0, 0, 0))
    # ground floor: door + windows
    dcol = DOORS[idx % len(DOORS)]
    gw = pk.geo.window_panel(cols=2, rows=1, win_w=0.95, win_h=1.35, gap_x=w * 0.42, gap_y=1.0,
                             material=wmat, name='GWin%d' % idx, seed=idx + 50, collection=coll,
                             round_top=True, lit_fraction=0.9)
    child(gw, (fx, 0, 0.95), f * math.pi / 2)
    if o.get('shop', False):
        dm = lit_win(o.get('shop_color', SAFFRON), 26.0, mull=(1, 1), curtains=0.1)
    else:
        dm = wood(dcol)
    door = pk.geo.window_panel(cols=1, rows=1, win_w=1.15, win_h=2.25, material=dm, name='Door%d' % idx,
                               seed=idx + 9, collection=coll, round_top=True)
    child(door, (fx, 0, 0.0), f * math.pi / 2)
    # door surround (arched trim)
    surround = []
    for i in range(13):
        a = math.pi * i / 12
        surround.append((fx + f * 0.02, 0.72 * math.cos(a), 1.68 + 0.72 * math.sin(a)))
    sr = pk.geo.tube_along([(fx + f * 0.02, -0.72, 0.0), (fx + f * 0.02, -0.72, 1.68)] + surround[::-1] +
                           [(fx + f * 0.02, 0.72, 0.0)], radius=0.09, segments=8, material=tm,
                           name='DoorTrim%d' % idx, collection=coll)
    child(sr, (0, 0, 0))
    sr.location = (0, 0, 0)
    # camera-facing end wall windows
    if o.get('end_windows', True) and w > 3:
        ecols = max(1, int((d - 2.0) / 2.0))
        ep = pk.geo.window_panel(cols=ecols, rows=floors, win_w=0.8, win_h=1.2, gap_x=1.2, gap_y=1.7,
                                 material=wmat, name='EWin%d' % idx, seed=idx + 3, collection=coll,
                                 round_top=True, lit_fraction=o.get('lit', 0.8))
        child(ep, (f * 0.6, -w / 2 - 0.015, 1.0), 0.0)
    # glazed tile frieze above the ground floor and a tiled door surround
    if o.get('tiles'):
        tl = M('zellige', lambda: mat_zellige())
        child(multi_box([((fx + f * 0.03, 0.0, 2.62), (0.08, w - 0.9, 0.32))], tl, 'Frieze%d' % idx, radius=0.02,
                        collection=coll), (0, 0, 0))
    # door lantern
    lc = o.get('lantern', LAMP_COLORS[idx % len(LAMP_COLORS)])
    ln = lantern_shape('DoorLantern%d' % idx, emit(lc, 40.0), iron(), coll, scale=0.75)
    child(ln, (fx + f * 0.35, 1.05, 2.75))
    br = multi_box([((fx + f * 0.2, 1.05, 2.78), (0.4, 0.04, 0.04))], iron(), 'Bracket%d' % idx, radius=0.01,
                   collection=coll)
    child(br, (0, 0, 0))
    # neon blade sign on an iron bracket, projecting from the facade and facing up the street
    if o.get('neon'):
        kind, ncol = o['neon']
        ns = neon_sign(kind, ncol, coll, 'Neon%d' % idx, scale=1.25)
        bx = fx + f * 1.3
        by = -w / 2 + 1.3
        child(ns, (bx, by, 2.75))
        brk = multi_box([((fx + f * 1.1, by, 4.6), (2.2, 0.05, 0.05)), ((fx + f * 0.05, by, 4.35), (0.1, 0.1, 0.6))],
                        iron(), 'NeonBracket%d' % idx, radius=0.01, collection=coll)
        child(brk, (0, 0, 0))
        for sx in (-0.55, 0.55):
            ch_ = pk.geo.tube_along([(bx + sx, by, 4.58), (bx + sx, by, 4.35)], radius=0.008, segments=5,
                                    material=iron(), name='NeonChain', collection=coll)
            child(ch_, (0, 0, 0))
        bpy.context.view_layer.update()
        lp = body.matrix_world @ Vector((bx, by - 0.8, 3.4))
        pk.lights.point(tuple(lp), ncol, 120.0, radius=0.5, shadow=False, name='NeonGlow%d' % idx,
                        collection=coll, volume=0.0)
    # dome
    if o.get('dome'):
        dr = min(d, w) * 0.34
        dc = o.get('dome_color', (0.1, 0.55, 0.6))
        dmm = M(('dome', dc), lambda: pk.mat.toy_plastic(dc, roughness=0.32, coat=0.5, sss=0.05))
        prof = [(dr * 1.08, 0.0), (dr * 1.08, 0.5), (dr * 1.02, 0.55)]
        for i in range(1, 11):
            a = math.pi / 2 * i / 10
            prof.append((dr * math.cos(a) * (1.0 + 0.08 * math.sin(a * 2)), 0.55 + dr * 1.15 * math.sin(a)))
        dome = pk.geo.lathe(prof, segments=40, material=dmm, name='Dome%d' % idx, collection=coll)
        child(dome, (f * -0.4, o.get('dome_y', 0.0), h + 0.15))
        fin = pk.geo.lathe([(0.0, 0.0), (0.06, 0.0), (0.12, 0.15), (0.0, 0.5)], segments=12,
                           material=emit(SAFFRON, 20.0), name='Finial%d' % idx, collection=coll)
        child(fin, (f * -0.4, o.get('dome_y', 0.0), h + 0.7 + dr * 1.15))
    # outside stair to the roof along the facade
    if o.get('stair'):
        st = []
        n = 9
        for i in range(n):
            y = w / 2 - 0.5 - i * 0.42
            z = (i + 1) * (h / (n + 1))
            st.append(((fx + f * 0.45, y, z / 2), (0.85, 0.44, z)))
        child(multi_box(st, tm, 'Stair%d' % idx, radius=0.08, collection=coll), (0, 0, 0))
    # awning over a shop window
    if o.get('awning'):
        c1, c2 = o['awning']
        am = M(('awn', c1, c2), lambda: mat_stripes(c1, c2, 'Awning_%d' % idx, freq=2.2, axis=1))
        aw = 2.6
        v, fcs = [], []
        for i in range(9):
            y = -aw / 2 + aw * i / 8
            for j, (dx, dz) in enumerate(((0.0, 0.0), (0.55, -0.32), (0.95, -0.45), (1.0, -0.62))):
                v.append((fx + f * dx, y + 1.9 * (1 if idx % 2 else -1), 2.45 + dz))
        for i in range(8):
            for j in range(3):
                a = i * 4 + j
                fcs.append((a, a + 4, a + 5, a + 1))
        awn = pk.mesh_object('Awning%d' % idx, v, fcs, material=am, collection=coll)
        child(awn, (0, 0, 0))
    # a rug airing over the parapet
    if o.get('rug') is not None:
        ri = o['rug']
        rg = rug_mesh('HouseRug%d' % idx, 1.15, 2.0, coll, M(('rug', ri), lambda: mat_rug(*RUGS[ri], 'Rug%d' % ri)))
        child(rg, (fx + f * 0.06, -w / 2 + 1.4 + (idx % 3) * 0.9, h + 0.25), f * math.pi / 2)
    # roof clutter: water barrel, plants, a small wind tower
    if o.get('roof_clutter', True):
        bm_ = M('barrel', lambda: pk.mat.metal((0.25, 0.35, 0.4), roughness=0.45, scratches=0.5, dirt=0.5,
                                               name='Barrel'))
        bar = pk.geo.lathe([(0.0, 0.0), (0.32, 0.0), (0.35, 0.05), (0.35, 0.85), (0.32, 0.9), (0.0, 0.9)],
                           segments=16, material=bm_, name='RoofBarrel%d' % idx, collection=coll)
        child(bar, (-f * (d / 2 - 1.2), -w / 2 + 1.1, h + 0.15))
    return body


NEON_SHAPES = {
    # outlines in a local XZ plane (metres), drawn as glowing tubes
    'camel': [[(-0.75, 0.0), (-0.7, 0.45), (-0.62, 0.62), (-0.45, 0.7), (-0.3, 0.95), (-0.12, 1.02),
               (0.05, 0.92), (0.18, 0.72), (0.32, 0.72), (0.45, 0.9), (0.52, 1.18), (0.62, 1.25), (0.78, 1.2),
               (0.8, 1.12), (0.62, 1.08), (0.6, 0.85), (0.52, 0.55), (0.42, 0.45), (0.45, 0.0)],
              [(-0.45, 0.45), (-0.42, 0.0)], [(0.18, 0.45), (0.2, 0.0)]],
    'palm': [[(0.0, 0.0), (0.06, 0.4), (0.1, 0.8), (0.1, 1.15)],
             [(0.1, 1.15), (-0.2, 1.3), (-0.55, 1.2), (-0.7, 0.95)],
             [(0.1, 1.15), (0.4, 1.32), (0.72, 1.22), (0.85, 0.98)],
             [(0.1, 1.15), (-0.1, 1.45), (-0.35, 1.55)], [(0.1, 1.15), (0.35, 1.5), (0.6, 1.55)]],
    'cactus': [[(-0.12, 0.0), (-0.12, 1.2), (-0.06, 1.32), (0.06, 1.32), (0.12, 1.2), (0.12, 0.0)],
               [(-0.12, 0.55), (-0.38, 0.55), (-0.45, 0.65), (-0.45, 0.95), (-0.38, 1.02), (-0.32, 0.95),
                (-0.32, 0.7), (-0.12, 0.7)],
               [(0.12, 0.7), (0.36, 0.7), (0.42, 0.8), (0.42, 1.08), (0.36, 1.15), (0.3, 1.08), (0.3, 0.85),
                (0.12, 0.85)]],
    'star': [[((0.62 if i % 2 == 0 else 0.4) * math.cos(math.radians(90 + 22.5 * i)),
               0.7 + (0.62 if i % 2 == 0 else 0.4) * math.sin(math.radians(90 + 22.5 * i))) for i in range(17)],
             [(0.2 * math.cos(math.radians(90 + 45 * i)), 0.7 + 0.2 * math.sin(math.radians(90 + 45 * i)))
              for i in range(9)]],
    'crescent': [[(0.5 * math.cos(a), 0.6 + 0.5 * math.sin(a)) for a in [math.radians(60 + 240 * i / 24) for i in range(25)]] +
                 [(0.15 + 0.38 * math.cos(a), 0.68 + 0.38 * math.sin(a)) for a in [math.radians(280 - 200 * i / 18) for i in range(19)]]],
    'lantern': [[(-0.25, 0.2), (-0.32, 0.6), (-0.2, 0.95), (0.0, 1.15), (0.2, 0.95), (0.32, 0.6), (0.25, 0.2),
                 (-0.25, 0.2)], [(0.0, 1.15), (0.0, 1.35)], [(-0.12, 0.45), (0.12, 0.45)], [(-0.15, 0.7), (0.15, 0.7)]],
}


def neon_sign(kind, color, coll, name, scale=1.4):
    m = M(('neon', color), lambda: pk.mat.neon_tube(color, 26.0))
    parts = []
    for stroke in NEON_SHAPES[kind]:
        pts = [(x * scale, 0.0, z * scale) for x, z in stroke]
        parts.append(pk.geo.tube_along(pts, radius=0.028, segments=8, material=m, name=name + 'Tube', collection=coll))
    ob = merge(parts, name, coll)
    ob.visible_shadow = False
    return ob


def skyline_block(path, s, side, lat, rng, coll, k, win_mats):
    w, d = rng.uniform(5, 11), rng.uniform(5, 10)
    h = rng.uniform(5, 13) * (1.0 + 0.4 * min(1.0, abs(lat) / 50))
    c, R, T, yaw = frame_at(path, s, side * lat, 0.0)
    col = WALLS[rng.randrange(len(WALLS))]
    col = tuple(x * 0.85 for x in col)
    b = pk.geo.rounded_box((d, w, h), radius=0.45, segments=2, material=clay(col), name='Far%d' % k,
                           location=tuple(c), collection=coll, edges=False)
    b.rotation_euler.z = yaw + rng.uniform(-0.25, 0.25)
    f = -side
    wm = rng.choice(win_mats)
    rows = max(1, int(h / 3.0))
    wp = pk.geo.window_panel(cols=max(1, int(w / 2.0)), rows=rows, win_w=0.75, win_h=1.1, gap_x=1.15,
                             gap_y=1.9, material=wm, seed=k, lit_fraction=0.55, round_top=True,
                             name='FarWin%d' % k, collection=coll)
    wp.parent = b
    wp.location = (f * (d / 2 + 0.03), 0, 1.0)
    wp.rotation_euler.z = f * math.pi / 2
    wp2 = pk.geo.window_panel(cols=max(1, int(d / 2.4)), rows=rows, win_w=0.75, win_h=1.1, gap_x=1.3,
                              gap_y=1.9, material=wm, seed=k + 7, lit_fraction=0.45, round_top=True,
                              name='FarWinE%d' % k, collection=coll)
    wp2.parent = b
    wp2.location = (0, -w / 2 - 0.03, 1.0)
    r = rng.random()
    if r < 0.35:
        dr = min(w, d) * 0.33
        dc = rng.choice([(0.1, 0.5, 0.55), (0.55, 0.25, 0.4), (0.85, 0.6, 0.3), (0.2, 0.3, 0.75)])
        dmm = M(('dome', dc), lambda: pk.mat.toy_plastic(dc, roughness=0.32, coat=0.5, sss=0.05))
        prof = [(dr, 0.0)] + [(dr * math.cos(math.pi / 2 * i / 8), dr * 1.2 * math.sin(math.pi / 2 * i / 8))
                              for i in range(1, 9)]
        dm = pk.geo.lathe(prof, segments=28, material=dmm, name='FarDome%d' % k, collection=coll, edges=False)
        dm.parent = b
        dm.location = (0, 0, h)
    elif r < 0.55:
        # wind-catcher tower with glowing slats
        th = rng.uniform(3.5, 6.0)
        tw = pk.geo.rounded_box((1.8, 1.8, th), radius=0.25, segments=2, material=clay(col), name='Wind%d' % k,
                                collection=coll, edges=False)
        tw.parent = b
        tw.location = (rng.uniform(-d / 4, d / 4), rng.uniform(-w / 4, w / 4), h)
        sl = pk.geo.window_panel(cols=3, rows=1, win_w=0.3, win_h=1.4, gap_x=0.2, material=wm, seed=k,
                                 name='WindSlat%d' % k, collection=coll)
        sl.parent = tw
        sl.location = (0, -0.92, th - 2.0)
    return b


def dunes(path, coll, rng):
    """Dune sea around the town: crescent ridges with soft windward and steep lee slopes,
    rising with distance from the road; kept inside 750 m so the compositor does not take it
    for sky."""
    sand = M('dunesand', lambda: pk.mat.ground((0.42, 0.30, 0.22), name='DuneSand', roughness=0.85,
                                               wet=0.0, scale=4.0, color2=(0.30, 0.20, 0.16)))
    nx, ny = 220, 170
    x0, x1, y0, y1 = -620.0, 620.0, -150.0, 700.0
    import numpy as np
    xs = np.linspace(x0, x1, nx)
    ys = np.linspace(y0, y1, ny)
    X, Y = np.meshgrid(xs, ys)
    # distance to the path (sampled)
    samp = np.array([tuple(path.at(s))[:2] for s in np.arange(-20, path.length, 4.0)])
    D = np.full(X.shape, 1e9)
    for p in samp[::2]:
        D = np.minimum(D, np.hypot(X - p[0], Y - p[1]))
    ramp = np.clip((D - 55.0) / 110.0, 0, 1) ** 1.1
    # crescent ridges: sawtooth along a rotated axis (steep lee side), warped by low-frequency noise
    ang = math.radians(28)
    U = X * math.cos(ang) + Y * math.sin(ang)
    V = -X * math.sin(ang) + Y * math.cos(ang)
    warp = 30 * np.sin(V / 95.0 + 1.3) + 18 * np.sin(V / 41.0 + 0.4) + 10 * np.sin(U / 60.0)
    ph = (U + warp) / 120.0
    fr = ph - np.floor(ph)
    saw = np.where(fr < 0.78, (fr / 0.78) ** 1.6, ((1 - fr) / 0.22) ** 0.9)
    amp = 52 + 16 * np.sin(V / 140.0 + 2.0) + 9 * np.sin(U / 77.0)
    Z = (saw * amp + 6 * np.sin(X / 37.0) * np.cos(Y / 53.0)) * ramp - 0.25
    verts = [(float(X[j, i]), float(Y[j, i]), float(Z[j, i])) for j in range(ny) for i in range(nx)]
    faces = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i)
             for j in range(ny - 1) for i in range(nx - 1)]
    ob = pk.mesh_object('Dunes', verts, faces, material=sand, collection=coll)

    def height(x, y):
        i = int(round((x - x0) / (x1 - x0) * (nx - 1)))
        j = int(round((y - y0) / (y1 - y0) * (ny - 1)))
        i = min(max(i, 0), nx - 1)
        j = min(max(j, 0), ny - 1)
        return float(Z[j, i])
    return ob, height


# ---------------------------------------------------------------- set pieces
INN_S0, INN_W, INN_D, INN_FACE = 59.0, 16.0, 13.0, 6.4
STALLS = [(52.0, -1, 6.15, ((0.75, 0.12, 0.12), (0.92, 0.85, 0.7))),
          (63.5, -1, 6.15, ((0.1, 0.45, 0.5), (0.9, 0.8, 0.55))),
          (78.0, 1, 4.75, ((0.85, 0.5, 0.08), (0.25, 0.08, 0.35))),
          (34.0, -1, 6.15, ((0.2, 0.25, 0.7), (0.92, 0.85, 0.7))),
          (97.0, 1, 4.75, ((0.6, 0.1, 0.4), (0.95, 0.8, 0.5)))]
NEAR_STRINGS = (13.5, 27.0)


def caravan_inn(path, coll, rng):
    """Warm hero at the outside of the bend: a two-storey apricot adobe caravan inn whose front
    (with the great gate, balcony and a lantern) faces the approaching road, a glowing arcade
    along the road side, a turquoise dome and a slim wind tower, lanterns, string lights and a
    covered wagon glowing from inside."""
    s0 = INN_S0
    side = 1
    w, d, h = INN_W, INN_D, 7.6
    face = INN_FACE
    c, R, T, yaw = frame_at(path, s0, side * (face + d / 2), 0.0)
    plaster = M('innplaster', lambda: pk.mat.clay((0.82, 0.3, 0.07), roughness=0.75, bumps=0.5, grime=0.35,
                                                  name='InnPlaster'))
    body = pk.geo.rounded_box((d, w, h), radius=0.5, segments=3, material=plaster, name='Inn',
                              location=tuple(c), collection=coll)
    body.rotation_euler.z = yaw
    f = -side
    fx = f * (d / 2 + 0.02)
    ey = -w / 2 - 0.02                         # front (end) wall, facing the camera

    def child(ob, loc, rz=0.0):
        ob.parent = body
        ob.location = loc
        ob.rotation_euler = (0, 0, rz)
        return ob
    trim = M('inntrim', lambda: pk.mat.clay((0.95, 0.6, 0.3), roughness=0.7, bumps=0.3, name='InnTrim'))
    arc_m = M('innarc', lambda: pk.mat.lit_window((1.0, 0.42, 0.1), strength=1.7, mullions=(3, 5),
                                                  frame_w=0.05, mullion_w=0.045, curtains=0.12, variation=0.3,
                                                  frame_color=(0.12, 0.05, 0.02), name='InnArcade'))
    gate_m = M('inngate', lambda: pk.mat.lit_window((1.0, 0.45, 0.12), strength=2.6, mullions=(1, 1),
                                                    curtains=0.0, variation=0.2, name='InnGateGlow'))
    up_m = M('innup', lambda: pk.mat.lit_window((1.0, 0.5, 0.16), strength=4.5, mullions=(2, 2), curtains=0.3,
                                                name='InnUpper'))
    # ---- front: great arched gate glowing, flanking arches, two rows of upper windows
    gate = pk.geo.window_panel(cols=1, rows=1, win_w=3.0, win_h=4.3, material=gate_m, name='InnGateArch', seed=1,
                               collection=coll, round_top=True)
    child(gate, (0.0, ey, 0.0))
    fl = pk.geo.window_panel(cols=2, rows=1, win_w=1.7, win_h=2.8, gap_x=5.6, material=arc_m, name='InnFrontArch',
                             seed=2, collection=coll, round_top=True)
    child(fl, (0.0, ey, 0.0))
    fu = pk.geo.window_panel(cols=5, rows=1, win_w=0.95, win_h=1.5, gap_x=1.3, material=up_m, name='InnFrontUp',
                             seed=4, collection=coll, round_top=True, lit_fraction=0.95)
    child(fu, (0.0, ey, 5.0))
    fr = []
    # gate surround (thick trim arch) + cornice + balcony slab
    for i in range(15):
        a = math.pi * i / 14
        fr.append(((1.75 * math.cos(a), ey - 0.12, 2.8 + 1.75 * math.sin(a) * 1.05), (0.42, 0.3, 0.42)))
    for x in (-1.75, 1.75):
        fr.append(((x, ey - 0.12, 1.4), (0.42, 0.3, 2.8)))
    fr.append(((0.0, ey - 0.12, h + 0.05), (d + 0.3, 0.4, 0.38)))
    fr.append(((0.0, ey - 0.45, 4.62), (d - 1.0, 0.95, 0.16)))
    child(multi_box(fr, trim, 'InnFrontTrim', radius=0.1, collection=coll), (0, 0, 0))
    bal = []
    for i in range(30):
        x = -(d - 1.4) / 2 + (d - 1.4) * i / 29
        bal.append(((x, ey - 0.85, 4.95), (0.05, 0.05, 0.55)))
    bal.append(((0.0, ey - 0.85, 5.25), (d - 1.3, 0.08, 0.07)))
    child(multi_box(bal, wood((0.3, 0.16, 0.07)), 'InnBalcony', radius=0.015, collection=coll), (0, 0, 0))
    gm = M('gate', lambda: pk.mat.painted_wood((0.35, 0.12, 0.05), wear=0.5, roughness=0.5, name='InnGate'))
    gt = multi_box([((-1.35, ey - 0.45, 1.6), (1.0, 0.1, 3.2), 0.9), ((1.35, ey - 0.45, 1.6), (1.0, 0.1, 3.2), -0.9)],
                   gm, 'InnGateDoors', radius=0.03, collection=coll)
    child(gt, (0, 0, 0))
    big = lantern_shape('InnBigLantern', emit((1.0, 0.6, 0.25), 70.0), iron(), coll, scale=2.2)
    child(big, (0.0, ey - 1.0, 4.45))
    # ---- road side: arcade of glowing arches with pillars, upper windows
    ar = pk.geo.window_panel(cols=5, rows=1, win_w=1.9, win_h=3.1, gap_x=0.85, material=arc_m, name='InnArch',
                             seed=3, collection=coll, round_top=True)
    child(ar, (fx, 0.4, 0.0), f * math.pi / 2)
    pill = []
    for i in range(6):
        y = 0.4 - 6.85 + i * 2.75
        pill.append(((fx + f * 0.16, y, 1.65), (0.4, 0.5, 3.3)))
    pill.append(((fx + f * 0.2, 0.0, 3.55), (0.5, w - 0.6, 0.42)))
    pill.append(((fx + f * 0.14, 0.0, h + 0.05), (0.4, w + 0.2, 0.38)))
    child(multi_box(pill, trim, 'InnPillars', radius=0.12, collection=coll), (0, 0, 0))
    wp = pk.geo.window_panel(cols=5, rows=1, win_w=0.95, win_h=1.5, gap_x=1.7, material=up_m, name='InnUp',
                             seed=8, collection=coll, round_top=True, lit_fraction=0.95)
    child(wp, (fx, 0.4, 4.5), f * math.pi / 2)
    for i in range(5):
        y = 0.4 - 5.5 + i * 2.75
        ln = lantern_shape('InnLantern%d' % i, emit((1.0, 0.55, 0.2), 35.0), iron(), coll, scale=0.9)
        child(ln, (fx + f * 0.55, y, 3.0))
    # ---- merlons along the roof edges
    mer = []
    for i in range(11):
        y = -w / 2 + 0.6 + (w - 1.2) * i / 10
        mer.append(((f * (d / 2 - 0.05), y, h + 0.55), (0.4, 0.7, 0.8)))
    for i in range(9):
        x = -d / 2 + 0.6 + (d - 1.2) * i / 8
        mer.append(((x, -w / 2 + 0.05, h + 0.55), (0.7, 0.4, 0.8)))
    child(multi_box(mer, trim, 'InnMerlons', radius=0.15, collection=coll), (0, 0, 0))
    # ---- upper storey, big turquoise dome, slim wind tower with a lantern top
    up = pk.geo.rounded_box((7.0, 8.0, 3.2), radius=0.4, segments=3, material=plaster, name='InnUpper',
                            collection=coll)
    child(up, (-f * 1.8, 1.0, h))
    uw = pk.geo.window_panel(cols=3, rows=1, win_w=0.9, win_h=1.4, gap_x=1.3, material=up_m, name='InnUpWin',
                             seed=13, collection=coll, round_top=True)
    child(uw, (-f * 1.8, 1.0 - 4.02, h + 0.9))
    dm = M('inndome', lambda: pk.mat.toy_plastic((0.04, 0.6, 0.62), roughness=0.26, coat=0.6, sss=0.04,
                                                 name='InnDome'))
    dr = 3.1
    prof = [(dr * 1.07, 0.0), (dr * 1.07, 0.7), (dr * 1.0, 0.75)]
    for i in range(1, 13):
        a = math.pi / 2 * i / 12
        prof.append((dr * math.cos(a) * (1 + 0.1 * math.sin(2 * a)), 0.75 + dr * 1.25 * math.sin(a)))
    dome = pk.geo.lathe(prof, segments=48, material=dm, name='InnDome', collection=coll)
    child(dome, (-f * 1.8, 1.0, h + 3.2))
    fin = pk.geo.lathe([(0.0, 0.0), (0.12, 0.0), (0.22, 0.3), (0.1, 0.55), (0.16, 0.75), (0.0, 1.3)], segments=16,
                       material=emit(SAFFRON, 30.0), name='InnFinial', collection=coll)
    child(fin, (-f * 1.8, 1.0, h + 3.2 + 0.75 + dr * 1.25 - 0.1))
    for k in range(6):
        a = -math.pi / 2 + (k - 2.5) * 0.4
        n = Vector((math.cos(a), math.sin(a), 0))
        dw = pk.geo.window_panel(cols=1, rows=1, win_w=0.5, win_h=0.55, material=up_m, name='InnDrumWin',
                                 seed=k, collection=coll, round_top=True)
        child(dw, tuple(Vector((-f * 1.8, 1.0, h + 3.25)) + n * (dr * 1.08 + 0.01)), a + math.pi / 2)
    wt = pk.geo.rounded_box((2.2, 2.2, 7.5), radius=0.3, segments=2, material=plaster, name='InnWindTower',
                            collection=coll)
    child(wt, (f * (d / 2 - 1.6), -w / 2 + 1.6, h))
    sl = pk.geo.window_panel(cols=3, rows=1, win_w=0.32, win_h=1.6, gap_x=0.22, material=arc_m, name='InnSlats',
                             seed=5, collection=coll)
    child(sl, (f * (d / 2 - 1.6), -w / 2 + 1.6 - 1.12, h + 5.2))
    sl2 = pk.geo.window_panel(cols=3, rows=1, win_w=0.32, win_h=1.6, gap_x=0.22, material=arc_m,
                              name='InnSlats2', seed=6, collection=coll)
    child(sl2, (f * (d / 2 - 1.6) + f * 1.12, -w / 2 + 1.6, h + 5.2), f * math.pi / 2)
    wcap = pk.geo.rounded_box((2.7, 2.7, 0.4), radius=0.15, material=trim, name='InnWindCap', collection=coll)
    child(wcap, (f * (d / 2 - 1.6), -w / 2 + 1.6, h + 7.5))
    # ---- warm lights
    bpy.context.view_layer.update()
    W = body.matrix_world

    def wp_(x, y, z):
        return W @ Vector((x, y, z))
    for i in range(3):
        y = -4.5 + i * 4.5
        pk.lights.spot(tuple(wp_(fx + f * 1.6, y, 0.2)), tuple(wp_(fx - f * 0.2, y, 6.5)), (1.0, 0.45, 0.14), 420.0,
                       angle_deg=75, blend=0.85, radius=0.2, shadow=False, name='InnUp%d' % i, collection=coll,
                       volume=0.0)
    for x in (-4.5, 4.5):
        pk.lights.spot(tuple(wp_(x, ey - 1.8, 0.2)), tuple(wp_(x * 0.8, ey + 0.2, 6.5)), (1.0, 0.45, 0.14), 900.0,
                       angle_deg=75, blend=0.85, radius=0.2, shadow=False, name='InnFrontUp', collection=coll,
                       volume=0.0)
    pk.lights.area(tuple(wp_(fx + f * 0.6, 0.0, 2.6)), tuple(wp_(fx + f * 6.0, 0.0, 0.0)), size=(9.0, 2.0),
                   color=(1.0, 0.45, 0.14), energy=320.0, name='InnSpill', collection=coll)
    pk.lights.area(tuple(wp_(0.0, ey - 0.6, 2.4)), tuple(wp_(0.0, ey - 6.0, 0.0)), size=(3.0, 2.0),
                   color=(1.0, 0.5, 0.18), energy=650.0, name='InnGateSpill', collection=coll)
    pk.lights.point(tuple(wp_(0.0, ey - 1.1, 4.1)), (1.0, 0.55, 0.2), 350.0, radius=0.4, shadow=False,
                    name='InnLanternLight', collection=coll, volume=0.2)
    pk.lights.spot(tuple(wp_(-f * 1.8, -w / 2 - 10.0, h + 1.6)), tuple(wp_(-f * 1.8, 1.0, h + 4.6)), (0.25, 0.75, 1.0),
                   3500.0, angle_deg=26, blend=0.7, radius=0.3, shadow=False, name='DomeWash', collection=coll,
                   volume=0.0)
    # string lights from the front parapet down to posts in the forecourt
    for k, xa in enumerate((-5.5, 5.5)):
        p0 = wp_(xa, ey, h + 0.3)
        p1 = wp_(xa * 0.6, ey - 5.0, 3.2)
        pk.geo.string_lights(tuple(p0), tuple(p1), sag=0.5, count=12, colors=[(1.0, 0.6, 0.25), (1.0, 0.75, 0.4)],
                             strength=140.0, bulb_radius=0.045, light_every=6, light_energy=30.0,
                             name='InnString%d' % k, collection=coll)
        pk.geo.tube_along([tuple(wp_(xa * 0.6, ey - 5.0, 0.0)), tuple(wp_(xa * 0.6, ey - 5.0, 3.3))], radius=0.05,
                          material=iron(), name='InnPost', collection=coll)
    # covered wagon in the forecourt, crates and jars by the gate
    wagon(path, s0 - w / 2 - 4.5, side * (face + 4.8), coll)
    crate_stack(path.offset(s0 - w / 2 - 1.5, side * (face + d - 2.0), 0.0), R, T, coll, rng, 'InnCrates')
    for i in range(4):
        j = jar_variant('InnJar%d' % i, coll, (0.55, 0.28, 0.14), h=rng.uniform(0.7, 1.0))
        j.location = tuple(path.offset(s0 - w / 2 - 0.8, side * (face + 1.2 + i * 0.6), 0.0))
    return body


def wagon(path, s, lat, coll):
    c, R, T, yaw = frame_at(path, s, lat, 0.14)
    wm = M('wagonwood', lambda: pk.mat.painted_wood((0.42, 0.14, 0.06), wear=0.55, roughness=0.55,
                                                     name='WagonWood'))
    bed = pk.geo.rounded_box((1.7, 3.4, 0.5), radius=0.06, material=wm, name='WagonBed', collection=coll,
                             location=tuple(c + Vector((0, 0, 0.75))))
    bed.rotation_euler.z = yaw
    cm = mat_canvas_glow((1.0, 0.58, 0.28), 4.5, 'WagonCanvas')
    v, fcs, uvs = [], [], []
    nu, nv = 16, 10
    for j in range(nv + 1):
        y = -1.55 + 3.1 * j / nv
        for i in range(nu + 1):
            a = math.pi * i / nu
            v.append((0.88 * math.cos(a), y, 1.25 + 1.05 * math.sin(a) * (1.0 + 0.04 * math.sin(i * 1.7))))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            fcs.append((a, a + 1, a + nu + 2, a + nu + 1))
    hood = pk.mesh_object('WagonHood', v, fcs, material=cm, collection=coll)
    hood.parent = bed
    hood.location = (0, 0, -0.75)
    hoops = []
    for j in range(5):
        y = -1.5 + 3.0 * j / 4
        hoops.append([(0.9 * math.cos(math.pi * i / 16), y, 1.25 + 1.08 * math.sin(math.pi * i / 16)) for i in range(17)])
    for k, hp in enumerate(hoops):
        tb = pk.geo.tube_along(hp, radius=0.03, segments=6, material=wm, name='WagonHoop%d' % k, collection=coll)
        tb.parent = bed
        tb.location = (0, 0, -0.75)
    for x in (-0.95, 0.95):
        for y in (-1.1, 1.1):
            ring = [(x, y + 0.55 * math.cos(2 * math.pi * i / 24), 0.55 + 0.55 * math.sin(2 * math.pi * i / 24))
                    for i in range(25)]
            wh = pk.geo.tube_along(ring, radius=0.05, segments=8, material=wm, name='WagonWheel', collection=coll)
            wh.parent = bed
            wh.location = (0, 0, -0.75)
            sp = []
            for i in range(6):
                a = math.pi * i / 6
                sp.append(pk.geo.tube_along([(x, y - 0.55 * math.cos(a), 0.55 - 0.55 * math.sin(a)),
                                             (x, y + 0.55 * math.cos(a), 0.55 + 0.55 * math.sin(a))], radius=0.02,
                                            segments=5, material=wm, name='Spoke', collection=coll))
            spk = merge(sp, 'WagonSpokes', coll)
            spk.parent = bed
            spk.location = (0, 0, -0.75)
    pk.lights.point(tuple(c + Vector((0, 0, 1.6))), (1.0, 0.55, 0.22), 120.0, radius=0.6, shadow=False,
                    name='WagonGlow', collection=coll, volume=0.0)


TOWER_S, TOWER_LAT = 86.0, -10.0
LTOWER_S, LTOWER_LAT = 170.0, -17.0


def water_tower(path, coll):
    s0, lat = TOWER_S, TOWER_LAT
    c, R, T, yaw = frame_at(path, s0, lat, 0.0)
    steel = M('tower_steel', lambda: pk.mat.metal((0.22, 0.32, 0.36), roughness=0.45, scratches=0.6, dirt=0.55,
                                                  name='TowerSteel'))
    tank_m = M('tank', lambda: pk.mat.painted_wood((0.12, 0.42, 0.45), wear=0.5, roughness=0.5, brush_axis='X',
                                                   name='TankPaint'))
    legs = []
    H = 10.0
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        b = c + Vector((math.cos(a) * 1.75, math.sin(a) * 1.75, 0))
        t = c + Vector((math.cos(a) * 1.35, math.sin(a) * 1.35, H))
        legs.append((b, t))
        pk.geo.tube_along([tuple(b), tuple(t)], radius=0.11, segments=10, material=steel, name='TowerLeg%d' % k,
                          collection=coll)
        pk.geo.lathe([(0.0, 0.0), (0.35, 0.0), (0.3, 0.4), (0.0, 0.4)], segments=12, material=clay((0.4, 0.33, 0.45)),
                     name='TowerFoot', location=tuple(b), collection=coll)
    # cross bracing at three levels
    for lv in (2.5, 5.5, 8.3):
        f = lv / H
        ring = []
        for k in range(5):
            b, t = legs[k % 4]
            ring.append(tuple(b.lerp(t, f)))
        pk.geo.tube_along(ring, radius=0.05, segments=6, material=steel, name='TowerRing', collection=coll)
    for k in range(4):
        b0, t0 = legs[k]
        b1, t1 = legs[(k + 1) % 4]
        for (f0, f1) in ((0.25, 0.55), (0.55, 0.83)):
            pk.geo.tube_along([tuple(b0.lerp(t0, f0)), tuple(b1.lerp(t1, f1))], radius=0.035, segments=6,
                              material=steel, name='TowerBrace', collection=coll)
            pk.geo.tube_along([tuple(b1.lerp(t1, f0)), tuple(b0.lerp(t0, f1))], radius=0.035, segments=6,
                              material=steel, name='TowerBrace', collection=coll)
    # tank with a conical roof and a walkway
    prof = [(0.0, 0.0), (2.3, 0.0), (2.45, 0.15), (2.45, 3.4), (2.3, 3.55)]
    tank = pk.geo.lathe(prof + [(0.0, 3.55)], segments=48, material=tank_m, name='Tank',
                        location=tuple(c + Vector((0, 0, H))), collection=coll)
    roof = pk.geo.lathe([(2.65, 0.0), (2.62, 0.14), (2.75, 0.55), (2.55, 1.2), (1.85, 1.95), (0.95, 2.55),
                         (0.38, 2.95), (0.16, 3.25), (0.1, 3.5), (0.0, 3.62)], segments=48,
                        material=M('tankroof', lambda: pk.mat.toy_plastic((0.05, 0.42, 0.46), roughness=0.28,
                                                                          coat=0.5, name='TankDome')),
                        name='TankRoof', location=tuple(c + Vector((0, 0, H + 3.5))), collection=coll)
    pk.geo.lathe([(0.0, 0.0), (0.09, 0.0), (0.16, 0.2), (0.07, 0.45), (0.1, 0.62), (0.0, 0.95)], segments=12,
                 material=emit(SAFFRON, 18.0), name='TankFinial', location=tuple(c + Vector((0, 0, H + 7.05))),
                 collection=coll)
    walk = pk.geo.lathe([(2.45, 0.0), (3.1, 0.0), (3.1, 0.08), (2.45, 0.08)], segments=48, material=steel,
                        name='Walkway', location=tuple(c + Vector((0, 0, H - 0.05))), collection=coll)
    rail = [tuple(c + Vector((3.05 * math.cos(2 * math.pi * i / 64), 3.05 * math.sin(2 * math.pi * i / 64), H + 1.0)))
            for i in range(65)]
    pk.geo.tube_along(rail, radius=0.03, segments=6, material=steel, name='WalkRail', collection=coll)
    posts = []
    for i in range(24):
        a = 2 * math.pi * i / 24
        p = c + Vector((3.05 * math.cos(a), 3.05 * math.sin(a), H + 0.5))
        posts.append((tuple(p), (0.04, 0.04, 1.0)))
    multi_box(posts, steel, 'WalkPosts', radius=0.01, collection=coll)
    # ladder up one leg
    b, t = legs[3]
    lad = []
    side = (t - b).cross(Vector((0, 0, 1))).normalized() * 0.22
    for sgn in (-1, 1):
        pk.geo.tube_along([tuple(b + side * sgn + Vector((0, 0, 0.3))), tuple(t + side * sgn)], radius=0.025, segments=6,
                          material=steel, name='LadderRail', collection=coll)
    for i in range(30):
        p = b.lerp(t, (i + 1) / 31)
        lad.append((tuple(p), (0.46, 0.04, 0.04)))
    multi_box(lad, steel, 'LadderRungs', radius=0.01, collection=coll)
    # string lights draped around the tank in swags, and a beacon on top
    cols_ = [WARM_BULB, TURQ, WARM_BULB2, WARM_BULB, MAGENTA]
    for k in range(10):
        a0 = 2 * math.pi * k / 10
        a1 = 2 * math.pi * (k + 1) / 10
        p0 = c + Vector((2.55 * math.cos(a0), 2.55 * math.sin(a0), H + 3.45))
        p1 = c + Vector((2.55 * math.cos(a1), 2.55 * math.sin(a1), H + 3.45))
        pk.geo.string_lights(tuple(p0), tuple(p1), sag=0.9, count=7, colors=cols_[k % 5:] + cols_[:k % 5],
                             strength=120.0, bulb_radius=0.05, light_every=0, name='TankString%d' % k,
                             collection=coll)
    ring = []
    for k in range(40):
        a = 2 * math.pi * k / 40
        ring.append((tuple(c + Vector((2.82 * math.cos(a), 2.82 * math.sin(a), H + 4.05))), k % 2))
    bulbs_mesh(ring, [emit(WARM_BULB2, 70.0), emit(TURQ, 60.0)], 'TankDomeRing', radius=0.06, collection=coll)
    rail_b = []
    for k in range(36):
        a = 2 * math.pi * (k + 0.5) / 36
        rail_b.append((tuple(c + Vector((3.05 * math.cos(a), 3.05 * math.sin(a), H + 1.06))), 0))
    bulbs_mesh(rail_b, [emit(WARM_BULB, 60.0)], 'TankRailBulbs', radius=0.045, collection=coll)
    pk.lights.point(tuple(c + Vector((0, 0, H + 4.0))), (1.0, 0.7, 0.45), 350.0, radius=1.5, shadow=False,
                    name='TankGlow', collection=coll, volume=0.1)
    pk.lights.spot(tuple(c + Vector((0, 0, 0.5)) - R * 3.0), tuple(c + Vector((0, 0, H + 2.0))), MAGENTA, 4000.0,
                   angle_deg=45, blend=0.8, radius=0.3, shadow=False, name='TowerUp', collection=coll, volume=0.0)
    pk.lights.spot(tuple(c + Vector((0, 0, 0.5)) + T * -4.0 + R * 1.0), tuple(c + Vector((0, 0, H + 2.0))), TURQ,
                   3000.0, angle_deg=45, blend=0.8, radius=0.3, shadow=False, name='TowerUp2', collection=coll,
                   volume=0.0)


def lantern_tower(path, coll):
    """Far landmark on the axis at the end of the S: a tall tiered adobe tower with a glowing
    pierced lantern room and strands of lights falling from its crown like a tent."""
    c, R, T, yaw = frame_at(path, LTOWER_S, LTOWER_LAT, 0.0)
    pl = M('ltplaster', lambda: pk.mat.clay((0.22, 0.3, 0.68), roughness=0.8, bumps=0.4, name='LTowerPlaster'))
    tr = M('lttrim', lambda: pk.mat.clay((0.75, 0.62, 0.5), roughness=0.75, bumps=0.3, name='LTowerTrim'))
    tiers = [(3.2, 0.0, 8.0), (2.6, 8.0, 15.0), (2.0, 15.0, 21.0)]
    for k, (hw, z0, z1) in enumerate(tiers):
        b = pk.geo.rounded_box((hw * 2, hw * 2, z1 - z0), radius=0.4, material=pl, name='LTier%d' % k,
                               location=tuple(c + Vector((0, 0, z0))), collection=coll)
        b.rotation_euler.z = yaw
        cap = pk.geo.rounded_box((hw * 2 + 0.6, hw * 2 + 0.6, 0.45), radius=0.18, material=tr, name='LCap%d' % k,
                                 location=tuple(c + Vector((0, 0, z1 - 0.1))), collection=coll)
        cap.rotation_euler.z = yaw
        wm = lit_win(AMBER if k != 1 else (1.0, 0.45, 0.6), 24.0, mull=(1, 2))
        for face_k in range(4):
            rot = yaw + face_k * math.pi / 2
            dirv = Matrix.Rotation(rot, 3, 'Z') @ Vector((0, -1, 0))
            wp = pk.geo.window_panel(cols=2 if hw > 2.5 else 1, rows=2 if (z1 - z0) > 7 else 1, win_w=0.8, win_h=1.4,
                                     gap_x=1.2, gap_y=2.0, material=wm, name='LTWin', seed=k * 4 + face_k,
                                     collection=coll, round_top=True, lit_fraction=0.9,
                                     location=tuple(c + dirv * (hw + 0.02) + Vector((0, 0, z0 + 1.8))))
            wp.rotation_euler.z = rot
    # lantern room
    glass = M('ltglass', lambda: pk.mat.neon_tube((1.0, 0.6, 0.24), 22.0, name='LTLantern', core=0.4))
    lr = pk.geo.lathe([(0.0, 0.0), (1.6, 0.0), (1.7, 0.2), (1.7, 2.6), (1.5, 2.8), (0.0, 2.8)], segments=8,
                      material=glass, name='LTLanternRoom', location=tuple(c + Vector((0, 0, 21.3))), collection=coll)
    cap = pk.geo.lathe([(2.1, 0.0), (2.0, 0.25), (1.2, 1.4), (0.4, 2.6), (0.12, 3.4), (0.0, 3.6)], segments=8,
                       material=M('ltcap', lambda: pk.mat.toy_plastic((0.55, 0.14, 0.4), roughness=0.3, name='LTCap')),
                       name='LTRoof', location=tuple(c + Vector((0, 0, 24.1))), collection=coll)
    pk.lights.point(tuple(c + Vector((0, 0, 22.6))), (1.0, 0.58, 0.24), 2600.0, radius=1.4, shadow=False,
                    name='LTLight', collection=coll, volume=0.3)
    # strands of lights from the crown to the ground (a tent of lights)
    cols_ = [WARM_BULB, WARM_BULB2, TURQ, WARM_BULB]
    for k in range(12):
        a = yaw + 2 * math.pi * k / 12
        p0 = c + Vector((0, 0, 24.0))
        p1 = c + Vector((math.cos(a) * 11.0, math.sin(a) * 11.0, 2.8))
        pk.geo.string_lights(tuple(p0), tuple(p1), sag=1.2, count=22, colors=[cols_[k % 4]], strength=300.0,
                             bulb_radius=0.07, name='LTStrand%d' % k, collection=coll)
    for k in range(6):
        a = yaw + 2 * math.pi * k / 6
        p = c + Vector((math.cos(a) * 11.0, math.sin(a) * 11.0, 0.0))
        pk.geo.tube_along([tuple(p), tuple(p + Vector((0, 0, 2.9)))], radius=0.06, material=iron(), name='LTPost',
                          collection=coll)
    for da, col in ((-0.7, MAGENTA), (0.7, COBALT)):
        a = yaw - math.pi / 2 + da
        n = Vector((math.cos(a), math.sin(a), 0))
        pk.lights.spot(tuple(c + n * 7.0 + Vector((0, 0, 0.4))), tuple(c + Vector((0, 0, 16.0))), col, 9000.0,
                       angle_deg=40, blend=0.8, radius=0.4, shadow=False, name='LTUp', collection=coll, volume=0.0)
    # round plaza under it
    pz = pk.geo.lathe([(0.0, 0.0), (10.0, 0.0), (10.0, 0.12), (0.0, 0.12)], segments=64,
                      material=M('plaza', lambda: pk.mat.wet_asphalt(name='PlazaStone', base=(0.07, 0.05, 0.04),
                                                                      lane_markings=False, puddles=0.6,
                                                                      dry_rough=0.35)),
                      name='Plaza', location=tuple(c + Vector((0, 0, -0.1))), collection=coll)
    return c


# ---------------------------------------------------------------- round 3: street, canal, gate
def mat_pavers(name='DesertPavers', base=(0.072, 0.062, 0.054), puddles=0.42, puddle_rough=0.035,
               dry_rough=0.55, sett=(0.78, 0.52), scale_jitter=0.22):
    """Wet sandstone setts (road UVs in metres): staggered stones with per-stone tone and height,
    dark wet joints, crisp mirror puddles (about 40 percent) in a dry, rough stone field, faint
    fore-aft ridges inside the water so reflections streak, rain rings in the puddles."""
    m, nt, out = pk._new_mat(name)
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    p3 = pk.comb_xyz(nt, U, V, 0.0)
    br = pk.node(nt, 'ShaderNodeTexBrick', offset=0.5, offset_frequency=2, squash=1.0, squash_frequency=1)
    pk._set(nt, br.inputs['Vector'], p3)
    br.inputs['Color1'].default_value = (0.0, 0.0, 0.0, 1.0)
    br.inputs['Color2'].default_value = (1.0, 1.0, 1.0, 1.0)
    br.inputs['Mortar'].default_value = (0.0, 0.0, 0.0, 1.0)
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Mortar Size'].default_value = 0.014
    br.inputs['Mortar Smooth'].default_value = 0.6
    br.inputs['Bias'].default_value = 0.0
    br.inputs['Brick Width'].default_value = sett[0]
    br.inputs['Row Height'].default_value = sett[1]
    joint = br.outputs['Fac']                                   # 1 in the joints
    rnd = pk.sep_xyz(nt, br.outputs['Color'])[0]                # per-stone random 0..1
    stone = pk.math_(nt, 'SUBTRACT', 1.0, joint)
    # puddles: large soft noise, deeper toward the wheel ruts
    pf, _ = pk.noise(nt, pk.vmath(nt, 'SCALE', p3, scale=0.42), scale=1.0, detail=3.0, rough=0.55, distortion=0.25)
    rut = pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', pk.math_(nt, 'ABSOLUTE', U), 1.6))
    rut = pk.maprange(nt, rut, 0.0, 1.0, 0.1, 0.0)
    pm = pk.math_(nt, 'ADD', pk.math_(nt, 'ADD', pf, rut), pk.math_(nt, 'MULTIPLY', rnd, 0.03))
    thr = 0.62 - 0.22 * puddles
    puddle = pk.maprange(nt, pm, thr, thr + 0.035, 0.0, 1.0, interp='SMOOTHSTEP')
    damp = pk.maprange(nt, pm, thr - 0.09, thr, 0.0, 1.0, interp='SMOOTHSTEP')    # wet rim
    # colour: sandstone with per-stone tone, darker joints, wet darkening
    co = pk.texcoord(nt, 'Object')
    gf, _ = pk.noise(nt, p3, scale=22.0, detail=5.0, rough=0.7)
    tone = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, rnd, 0.0, 1.0, 1.0 - scale_jitter, 1.0 + scale_jitter),
                    pk.maprange(nt, gf, 0.3, 0.7, 0.85, 1.12))
    col = pk.vmath(nt, 'SCALE', base, scale=tone)
    hue = pk.maprange(nt, rnd, 0.0, 1.0, 0.0, 1.0)
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'GREATER_THAN', hue, 0.82), 0.6), col,
                     (base[0] * 0.8, base[1] * 0.85, base[2] * 1.1))
    col = pk.mix_col(nt, joint, col, (0.02, 0.017, 0.015))
    wetk = pk.math_(nt, 'MAXIMUM', puddle, pk.math_(nt, 'MULTIPLY', damp, 0.7))
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, wetk, 0.0, 1.0, 1.0, 0.42))
    # roughness: dry stone, damp rim, wet joints, mirror puddle
    rv, _ = pk.noise(nt, p3, scale=3.0, detail=3.0)
    rough = pk.maprange(nt, rv, 0.3, 0.7, dry_rough * 0.85, dry_rough * 1.12)
    rough = pk.mix_f(nt, pk.math_(nt, 'MULTIPLY', joint, 0.85), rough, 0.16)
    rough = pk.mix_f(nt, damp, rough, 0.2)
    rough = pk.mix_f(nt, puddle, rough, puddle_rough)
    # height: domed stones at slightly different heights, sunk joints; flat in the water
    sh = pk.math_(nt, 'MULTIPLY', stone, pk.maprange(nt, rnd, 0.0, 1.0, 0.75, 1.0))
    sh = pk.math_(nt, 'ADD', sh, pk.math_(nt, 'MULTIPLY', gf, 0.12))
    sh = pk.math_(nt, 'MULTIPLY', sh, pk.math_(nt, 'SUBTRACT', 1.0, puddle))
    nrm = pk.bump(nt, sh, strength=0.55, distance=0.008)
    # inside the water: fore-aft ridges (reflections streak) and a slow undulation
    sf, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', U, 0.8), pk.math_(nt, 'MULTIPLY', V, 70.0), 0.0),
                     scale=1.0, detail=3.0, rough=0.6)
    nrm = pk.bump(nt, pk.math_(nt, 'MULTIPLY', sf, puddle), strength=0.28, distance=0.004, normal=nrm)
    lf, _ = pk.noise(nt, p3, scale=2.4, detail=2.0)
    nrm = pk.bump(nt, pk.math_(nt, 'MULTIPLY', lf, puddle), strength=0.03, distance=0.03, normal=nrm)
    t = pk.time_value(nt)
    vo = pk.voronoi(nt, pk.comb_xyz(nt, U, V, pk.math_(nt, 'MULTIPLY', t, 0.9)), scale=2.2, feature='F1', dims='3D')
    d = vo['Distance']
    ring = pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', d, 60.0))
    fade = pk.maprange(nt, d, 0.0, 0.3, 1.0, 0.0)
    nrm = pk.bump(nt, pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', ring, fade), puddle), strength=0.025,
                  distance=0.002, normal=nrm)
    p = pk._principled(nt, base=col, rough=rough, normal=nrm, spec=0.55, ior=1.4)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.05, 0.035, 0.025), rough=0.25)
    return m


def mat_water(name='CanalWater'):
    """Still canal water: near-black teal, mirror smooth with a slow ripple."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    t = pk.time_value(nt)
    w1, _ = pk.noise(nt, pk.vmath(nt, 'MULTIPLY', co, (0.6, 0.25, 1.0)), scale=1.6, detail=2.0,
                     w=pk.math_(nt, 'MULTIPLY', t, 0.25), dims='4D')
    w2, _ = pk.noise(nt, co, scale=9.0, detail=1.0, w=pk.math_(nt, 'MULTIPLY', t, 0.6), dims='4D')
    h = pk.math_(nt, 'ADD', w1, pk.math_(nt, 'MULTIPLY', w2, 0.15))
    nrm = pk.bump(nt, h, strength=0.05, distance=0.03)
    p = pk._principled(nt, base=(0.004, 0.012, 0.014), rough=0.02, normal=nrm, spec=0.6, ior=1.33)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.005, 0.012, 0.015), rough=0.03)
    return m


def strip(path, lat0, lat1, z0, z1, name, mat, coll, s0=-20.0, s1=162.0, step=0.5, across=2):
    """A ground strip beside the road (UV in metres: U lateral, V along), like the kit's."""
    import numpy as np
    ss = np.arange(s0, s1 + step, step)
    verts, faces, uvs = [], [], []
    na = across + 1
    for s in ss:
        for j in range(na):
            f = j / across
            verts.append(tuple(path.offset(float(s), lat0 + (lat1 - lat0) * f, z0 + (z1 - z0) * f)))
    for i in range(len(ss) - 1):
        for j in range(across):
            a = i * na + j
            faces.append((a, a + 1, a + na + 1, a + na))
            for (ii, jj) in ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)):
                uvs.append((lat0 + (lat1 - lat0) * jj / across, float(ss[ii] - s0)))
    return pk.mesh_object(name, verts, faces, uvs=uvs, material=mat, collection=coll)


def wall_strip(path, lat, z0, z1, name, mat, coll, s0=-20.0, s1=162.0, step=0.5):
    """A vertical wall face along the path at a lateral offset (canal sides)."""
    import numpy as np
    ss = np.arange(s0, s1 + step, step)
    verts, faces = [], []
    for s in ss:
        verts.append(tuple(path.offset(float(s), lat, z0)))
        verts.append(tuple(path.offset(float(s), lat, z1)))
    for i in range(len(ss) - 1):
        a = 2 * i
        faces.append((a, a + 2, a + 3, a + 1) if lat < -4.2 else (a, a + 1, a + 3, a + 2))
    return pk.mesh_object(name, verts, faces, material=mat, collection=coll)


CANAL = (-3.48, -5.0)          # lateral extent of the irrigation channel on the left
WALK_L = (-5.25, -7.05)
WALK_R = (3.48, 5.88)


def street(path, coll, road_mat, walk_mat, curb_mat, sand_mat, s1=162.0):
    """Road with curbs (kit), then a falaj (stone-lined irrigation channel) along the left kerb with
    a coping, wet flagstone walks on both sides and damp sand beyond."""
    pk.geo.road_from_curve(path, width=6.6, material=road_mat, curb=curb_mat, sidewalk=None, verge=None,
                           curb_height=0.12, s1=s1, collection=coll)
    water = M('water', mat_water)
    stone = M('canalstone', lambda: pk.mat.clay((0.28, 0.21, 0.15), roughness=0.55, bumps=0.6, grime=0.7,
                                                name='CanalStone'))
    strip(path, CANAL[1], CANAL[0], -0.2, -0.2, 'Canal', water, coll, s1=s1, across=3)
    wall_strip(path, CANAL[0] - 0.005, -0.6, 0.1, 'CanalWallR', stone, coll, s1=s1)
    wall_strip(path, CANAL[1] + 0.005, -0.6, 0.16, 'CanalWallL', stone, coll, s1=s1)
    import numpy as np
    ss = np.arange(-20.0, s1 + 0.5, 0.5)
    sec = [(-0.13, -0.05), (0.13, -0.05), (0.13, 0.16), (0.1, 0.19), (-0.1, 0.19), (-0.13, 0.16)]
    pts = [tuple(path.offset(float(s), CANAL[1] - 0.13, 0.0)) for s in ss]
    cp = pk.geo.sweep(pts, sec, material=stone, name='CanalCoping', collection=coll, caps=False)
    cp.data.set_sharp_from_angle(angle=math.radians(50))
    strip(path, WALK_L[1], WALK_L[0], 0.13, 0.13, 'SidewalkL', walk_mat, coll, s1=s1)
    strip(path, WALK_R[0], WALK_R[1], 0.11, 0.11, 'SidewalkR', walk_mat, coll, s1=s1)
    strip(path, WALK_L[1] - 110.0, WALK_L[1], 0.1, 0.1, 'VergeL', sand_mat, coll, s1=s1 + 20, across=6)
    strip(path, WALK_R[1], WALK_R[1] + 110.0, 0.08, 0.08, 'VergeR', sand_mat, coll, s1=s1 + 20, across=6)


GATE_S = 121.0
GATE_IN_L, GATE_IN_R = -5.7, 4.3        # inner faces of the two towers (lateral)


def town_gate(path, coll):
    """The oasis gate (bab) spanning the road and the channel at the end of the bend: two tapering
    blue-washed towers with merlons, a horseshoe arch outlined in turquoise tile and warm bulbs, a big
    pierced lantern hanging in the arch, lit slit windows, coloured uplights. It sits on the
    vanishing point for the whole cruise."""
    c0, R, T, yaw = frame_at(path, GATE_S, 0.0, 0.0)
    wall = clay((0.13, 0.25, 0.62))
    trim = clay((0.30, 0.45, 0.85))
    tile = M('zellige', lambda: mat_zellige())
    tw, td, th = 4.6, 5.0, 15.5
    parts = []
    for side, lin in ((-1, GATE_IN_L), (1, GATE_IN_R)):
        lc = lin + side * tw / 2
        cpos = path.offset(GATE_S, lc, 0.0)
        # tapering tower: stacked rounded boxes
        for i, (z0, z1, k) in enumerate(((0.0, 5.5, 1.0), (5.5, 11.0, 0.95), (11.0, th, 0.9))):
            b = pk.geo.rounded_box((tw * k, td * k, z1 - z0 + 0.05), radius=0.3, segments=2, material=wall,
                                   name='GateTower', location=tuple(cpos + Vector((0, 0, z0))), collection=coll)
            b.rotation_euler.z = yaw
        band = pk.geo.rounded_box((tw * 0.96, td * 0.96, 0.5), radius=0.12, material=tile, name='GateTileBand',
                                  location=tuple(cpos + Vector((0, 0, 10.6))), collection=coll)
        band.rotation_euler.z = yaw
        cap = pk.geo.rounded_box((tw * 0.95, td * 0.95, 0.35), radius=0.1, material=trim, name='GateCap',
                                 location=tuple(cpos + Vector((0, 0, th))), collection=coll)
        cap.rotation_euler.z = yaw
        mer = []
        for a in range(4):
            for b_ in range(4):
                if 0 < a < 3 and 0 < b_ < 3:
                    continue
                x = (-1.5 + a) * tw * 0.27
                y = (-1.5 + b_) * td * 0.27
                p = cpos + R * x + T * y
                mer.append(((p.x, p.y, th + 0.35 + 0.45), (0.7, 0.7, 0.9), yaw))
        multi_box(mer, trim, 'GateMerlons', radius=0.15, collection=coll)
        # slit windows and an arched lit window on the road-facing (camera) side
        for z, ww, hh in ((3.2, 0.35, 1.3), (7.2, 0.9, 1.6), (12.3, 0.35, 1.2)):
            wp = pk.geo.window_panel(cols=1, rows=1, win_w=ww, win_h=hh, material=lit_win(AMBER, 26.0, mull=(1, 1), curtains=0.0),
                                     name='GateWin', seed=int(z * 10) + side, collection=coll, round_top=True,
                                     location=tuple(cpos - T * (td / 2 + 0.03) + Vector((0, 0, z))))
            wp.rotation_euler.z = yaw
        # uplight wash
        lp = cpos - T * (td / 2 + 3.0) + R * (-side * 0.5) + Vector((0, 0, 0.3))
        pk.lights.spot(tuple(lp), tuple(cpos + Vector((0, 0, 11.0))), MAGENTA if side < 0 else (0.15, 0.7, 1.0), 9000.0,
                       angle_deg=34, blend=0.8, radius=0.3, shadow=False, name='GateUp', collection=coll, volume=0.0)
        # lantern on the inner corner
        lnt = lantern_shape('GateLantern', emit((1.0, 0.55, 0.2), 45.0), iron(), coll, scale=1.3)
        lnt.location = tuple(path.offset(GATE_S - td / 2 - 0.4, lin - side * 0.35, 6.2))
    # wall over the opening with a horseshoe arch cut out (front and back faces + intrados)
    span = GATE_IN_R - GATE_IN_L
    mid_lat = (GATE_IN_L + GATE_IN_R) / 2
    spring, top = 6.6, 12.8
    rad = span / 2 * 1.04
    n = 40
    arch = []
    for i in range(n + 1):
        a = math.radians(-12 + (180 + 24) * i / n)
        x = mid_lat - rad * math.cos(a)
        z = spring + rad * 0.95 * math.sin(a)
        x = min(max(x, GATE_IN_L), GATE_IN_R)
        arch.append((x, max(z, 0.0)))
    arch[0] = (GATE_IN_L, spring - 0.6)
    arch[-1] = (GATE_IN_R, spring - 0.6)
    outer = []
    perim = [(GATE_IN_L, spring - 0.6), (GATE_IN_L, top), (GATE_IN_R, top), (GATE_IN_R, spring - 0.6)]
    L_ = [0.0]
    for i in range(1, 4):
        L_.append(L_[-1] + math.dist(perim[i - 1], perim[i]))
    for i in range(n + 1):
        t = L_[-1] * i / n
        k = 0
        while k < 2 and L_[k + 1] < t:
            k += 1
        f = (t - L_[k]) / max(L_[k + 1] - L_[k], 1e-6)
        outer.append((perim[k][0] + (perim[k + 1][0] - perim[k][0]) * f, perim[k][1] + (perim[k + 1][1] - perim[k][1]) * f))
    verts, faces = [], []
    depth = 3.6
    for dy in (-depth / 2, depth / 2):
        for (ax, az), (bx, bz) in zip(arch, outer):
            pa = path.offset(GATE_S + dy, ax, az)
            pb = path.offset(GATE_S + dy, bx, bz)
            verts += [tuple(pa), tuple(pb)]
    nn = n + 1
    for i in range(n):
        a, b = 2 * i, 2 * (i + 1)
        faces.append((a, b, b + 1, a + 1))                                # front
        a2, b2 = 2 * nn + a, 2 * nn + b
        faces.append((a2, a2 + 1, b2 + 1, b2))                            # back
        faces.append((a, a2, b2, b))                                      # intrados
    aw = pk.mesh_object('GateArchWall', verts, faces, material=wall, collection=coll)
    fix_normals(aw)
    pk.edge_mask(aw, gain=2.0)
    # top of the arch wall + merlons
    tpos = path.offset(GATE_S, mid_lat, top)
    tb = pk.geo.rounded_box((span + 0.2, depth + 0.3, 0.5), radius=0.12, material=trim, name='GateWallTop',
                            location=tuple(tpos), collection=coll)
    tb.rotation_euler.z = yaw
    mer = []
    for i in range(7):
        x = mid_lat - span / 2 + 0.5 + (span - 1.0) * i / 6
        p = path.offset(GATE_S - depth / 2 + 0.3, x, top + 0.95)
        mer.append(((p.x, p.y, p.z), (0.7, 0.6, 0.9), yaw))
    multi_box(mer, trim, 'GateWallMerlons', radius=0.15, collection=coll)
    # turquoise tile band and warm bulbs following the arch on the camera side
    ring = [tuple(path.offset(GATE_S - depth / 2 - 0.06, x, z)) for x, z in arch[1:-1]]
    pk.geo.tube_along(ring, radius=0.16, segments=8, material=tile, name='GateArchTile', collection=coll)
    bulbs = []
    for i in range(1, len(arch) - 1):
        x, z = arch[i]
        bulbs.append((tuple(path.offset(GATE_S - depth / 2 - 0.25, x, z - 0.32)), 1 if i % 3 == 0 else 0))
    bulbs_mesh(bulbs, [emit(WARM_BULB, 90.0), emit(TURQ, 70.0)], 'GateArchBulbs', radius=0.06, collection=coll)
    # big lantern hanging in the arch, lighting the intrados and the road under it
    lp = path.offset(GATE_S - 0.4, mid_lat, spring + rad * 0.95 - 0.4)
    big = lantern_shape('GateBigLantern', emit((1.0, 0.58, 0.24), 60.0), iron(), coll, scale=2.4)
    big.location = tuple(lp)
    pk.geo.tube_along([tuple(lp), tuple(lp + Vector((0, 0, 0.5)))], radius=0.02, material=iron(), name='GateChain',
                      collection=coll)
    pk.lights.point(tuple(lp + Vector((0, 0, -0.9))), (1.0, 0.55, 0.22), 2600.0, radius=0.6, shadow=False,
                    name='GateLanternLight', collection=coll, volume=0.15)
    # warm glow from the street beyond, seen through the arch
    pk.lights.area(tuple(path.offset(GATE_S + 6.0, mid_lat, 5.0)), tuple(path.offset(GATE_S - 4.0, mid_lat, 3.0)),
                   size=(8.0, 6.0), color=(1.0, 0.5, 0.2), energy=3000.0, name='GateBeyond', collection=coll)


def mat_zellige(name='Zellige'):
    """Glazed turquoise tilework: small glossy tiles of varied tone with an eight-point star motif."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    vo = pk.voronoi(nt, co, scale=6.0, feature='F1')
    cell = vo['Color']
    r = pk.sep_xyz(nt, cell)[0]
    c1, c2, c3 = (0.02, 0.38, 0.42), (0.03, 0.18, 0.45), (0.75, 0.62, 0.35)
    col = pk.mix_col(nt, pk.math_(nt, 'GREATER_THAN', r, 0.55), c1, c2)
    col = pk.mix_col(nt, pk.math_(nt, 'GREATER_THAN', r, 0.9), col, c3)
    edge = pk.maprange(nt, vo['Distance'], 0.0, 0.08, 1.0, 0.0)
    col = pk.mix_col(nt, edge, col, (0.25, 0.22, 0.18))
    nrm = pk.bump(nt, pk.math_(nt, 'SUBTRACT', 1.0, edge), strength=0.4, distance=0.01)
    p = pk._principled(nt, base=col, rough=0.12, normal=nrm, coat=0.6, coat_rough=0.05, spec=0.6)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=c1, rough=0.15)
    return m


def opuntia_variant(name, rng, coll, bulb_mats, n_pads=9):
    """Prickly pear (the cactus of North African and Arabian oases): flat oval pads branching from
    a woody base, fairy lights strung over the pads."""
    cm = M('cactus', mat_cactus)
    bm = bmesh.new()
    pads = []
    bpts = []

    def pad(base, ang, tilt, size):
        r = bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0)
        rot = Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'Y')
        upv = (rot @ Vector((0, 0, 1.0, 0.0))).to_3d()
        c = base + upv * size * 0.5
        Mx = Matrix.Translation(c) @ rot @ Matrix.Diagonal((size * 0.4, size * 0.09, size * 0.55, 1.0))
        bmesh.ops.transform(bm, matrix=Mx, verts=r['verts'])
        top = c + upv * size * 0.47
        return top, Mx
    stack = [(Vector((0, 0, 0.0)), 0.0, 0.0, 0.85, 0)]
    count = 0
    while stack and count < n_pads:
        c, ang, tilt, size, depth = stack.pop(0)
        top, Mx = pad(c, ang, tilt, size)
        count += 1
        for k in range(7):
            a = 2 * math.pi * k / 7
            bpts.append((tuple(Mx @ Vector((math.cos(a) * 1.05, 0.0, math.sin(a) * 1.05))), (k + count) % len(bulb_mats)))
        if depth < 2:
            for j in range(rng.randint(1, 3)):
                ta = tilt + rng.uniform(-0.7, 0.7)
                stack.append((top, ang + rng.uniform(-0.8, 0.8), ta, size * rng.uniform(0.75, 0.9), depth + 1))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.materials.append(cm)
    ob = bpy.data.objects.new(name, me)
    pk._link(ob, coll)
    bl = bulbs_mesh(bpts, bulb_mats, name + 'Bulbs', radius=0.028, collection=coll)
    return merge([ob, bl], name, coll)


def agave_pot(name, coll, rng, pot_col):
    """Potted agave: a terracotta urn with a rosette of thick pointed leaves."""
    pm = M(('jar', pot_col), lambda: pk.mat.clay(pot_col, roughness=0.6, bumps=0.3, grime=0.5))
    pot = pk.geo.lathe([(0.0, 0.0), (0.2, 0.0), (0.32, 0.25), (0.34, 0.5), (0.3, 0.62), (0.34, 0.66), (0.0, 0.66)],
                       segments=20, material=pm, name=name + 'Pot', collection=coll)
    lm = M('agave', lambda: pk.mat.clay((0.12, 0.3, 0.28), roughness=0.45, bumps=0.2, grime=0.2, name='Agave'))
    parts = [pot]
    for k in range(13):
        a = 2 * math.pi * k / 13 + rng.uniform(-0.2, 0.2)
        up = rng.uniform(0.35, 1.1)
        L = rng.uniform(0.55, 0.85)
        sp = []
        sc = []
        for i in range(8):
            t = i / 7
            sp.append((math.cos(a) * L * t, math.sin(a) * L * t, 0.66 + L * (up * t - 0.25 * t * t)))
            sc.append(max(0.02, 1.0 - t))
        prof = [(-0.06, 0.0), (0.0, 0.025), (0.06, 0.0), (0.0, -0.02)]
        parts.append(pk.geo.sweep(sp, prof, material=lm, name=name + 'Leaf', collection=coll, scale=sc))
    ob = merge(parts, name, coll)
    pk.edge_mask(ob, gain=2.0)
    return ob


def bollard(name, coll, glass):
    """Low pierced-brass lantern bollard for the kerbs."""
    brass = M('brass', lambda: pk.mat.metal((0.55, 0.38, 0.16), roughness=0.32, scratches=0.4, dirt=0.4, name='Brass'))
    post = pk.geo.lathe([(0.0, 0.0), (0.13, 0.0), (0.13, 0.08), (0.07, 0.14), (0.06, 0.62), (0.1, 0.66), (0.0, 0.66)],
                        segments=12, material=brass, name=name + 'Post', collection=coll)
    ln = lantern_shape(name + 'Lamp', glass, brass, coll, scale=0.75)
    ln.location = (0.0, 0.0, 1.06)
    return merge([post, ln], name, coll)


def fix_normals(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()


# ---------------------------------------------------------------- vehicle
def jeep(cam, ctx):
    """Old expedition jeep from the driver's seat (round 3: a cleaner read). From the bottom: the
    top arc of a thin old steering wheel, a dark dash with a satin trim line and a dash compass
    glowing amber, the bottom rail of the fold-down windshield frame with its rubber seal, then the
    glossy hood (raised centre panel, latch-free) sloping gently to a rolled front lip with a thin
    chrome strip that catches the street as one bright line, fender tops at the far edges."""
    V = pk.vehicle
    cz = lambda cover, y: V.cover_z(cam, cover, y)
    paint = mat_hood()
    parts = []
    y_rail = 1.0
    z_rail = cz(0.05, y_rail)                  # top of the windshield frame rail
    y_f = 2.35
    z_f = cz(0.118, y_f)                      # hood front crest
    z_r = z_rail - 0.24                       # hood surface at the windshield base, under the rail
    # sightline: a flatter hood mirrors the lit town band instead of the dark road

    def zh(x, y):
        t = (y - 1.05) / (y_f - 1.05)
        base = z_r + (z_f - z_r) * t + 0.03 * math.sin(math.pi * min(max(t, 0), 1))
        ax = abs(x)
        crown = -0.035 * (ax / 0.62) ** 2
        bulge = 0.022 * (1.0 - float(pk._smoothstep(0.22, 0.28, ax)))
        return base + crown + bulge
    nx, ny = 64, 30
    xs = [-0.62 + 1.24 * i / nx for i in range(nx + 1)]
    rows = []
    for j in range(ny + 1):
        y = 1.05 + (y_f - 1.05) * j / ny
        rows.append([(x, y, zh(x, y)) for x in xs])
    for k in range(1, 7):
        a = math.pi / 2 * k / 6
        rows.append([(x, y_f + 0.045 * math.sin(a), zh(x, y_f) - 0.045 * (1 - math.cos(a))) for x in xs])
    rows.append([(x, y_f + 0.05, zh(x, y_f) - 0.16) for x in xs])
    grid = []
    for r in rows:
        l0, r0 = r[0], r[-1]
        nr = [(l0[0] - 0.03, l0[1], l0[2] - 0.03), (l0[0] - 0.035, l0[1], l0[2] - 0.12)][::-1] + list(r) + \
             [(r0[0] + 0.03, r0[1], r0[2] - 0.03), (r0[0] + 0.035, r0[1], r0[2] - 0.12)]
        grid.append(nr)
    W_ = len(grid[0])
    verts = [p for r in grid for p in r]
    faces = [(j * W_ + i, j * W_ + i + 1, (j + 1) * W_ + i + 1, (j + 1) * W_ + i)
             for j in range(len(grid) - 1) for i in range(W_ - 1)]
    hood = pk.mesh_object('JeepHood', verts, faces, material=paint)
    pk.edge_mask(hood, gain=3.0)
    parts.append(hood)
    for sgn in (-1, 1):
        xs2 = [sgn * (0.655 + 0.4 * i / 10) for i in range(11)]
        frows = []
        for j in range(ny + 1):
            y = 1.05 + (y_f + 0.06 - 1.05) * j / ny
            frows.append([(x, y, zh(0.62, min(y, y_f)) - 0.025 - 0.02 * ((abs(x) - 0.655) / 0.4) ** 2) for x in xs2])
        for k in range(1, 6):
            a = math.pi / 2 * k / 5
            frows.append([(x, y_f + 0.06 + 0.05 * math.sin(a), zh(0.62, y_f) - 0.025 - 0.05 * (1 - math.cos(a)))
                          for x in xs2])
        W2 = len(frows[0])
        fv = [p for r in frows for p in r]
        ff = [(j * W2 + i, j * W2 + i + 1, (j + 1) * W2 + i + 1, (j + 1) * W2 + i)
              for j in range(len(frows) - 1) for i in range(W2 - 1)]
        if sgn < 0:
            ff = [tuple(reversed(q)) for q in ff]
        fd = pk.mesh_object('JeepFender', fv, ff, material=paint)
        pk.edge_mask(fd, gain=3.0)
        parts.append(fd)
    # thin chrome strip on the rolled front lip
    chrome = M('chrome', lambda: pk.mat.metal((0.8, 0.8, 0.82), roughness=0.1, scratches=0.15, dirt=0.1,
                                              name='Chrome'))
    lip = [(x, y_f + 0.04, zh(x, y_f) - 0.012) for x in [-0.6 + 1.2 * i / 48 for i in range(49)]]
    parts.append(pk.geo.tube_along(lip, radius=0.008, segments=8, material=chrome, name='JeepLip'))
    # windshield frame bottom rail with rubber seal
    rub = M('rubber', lambda: pk.mat.basic((0.015, 0.015, 0.015), roughness=0.6, name='Rubber'))
    rail_pts = [(-1.1 + 2.2 * i / 40, y_rail, z_rail - 0.05) for i in range(41)]
    rail = pk.geo.sweep(rail_pts, [(-0.045, -0.12), (0.035, -0.12), (0.045, 0.02), (0.035, 0.045),
                                   (-0.03, 0.05), (-0.045, 0.03)], material=paint, name='JeepRail')
    pk.edge_mask(rail, gain=3.0)
    parts.append(rail)
    seal_pts = [(-1.1 + 2.2 * i / 40, y_rail - 0.012, z_rail + 0.003) for i in range(41)]
    parts.append(pk.geo.tube_along(seal_pts, radius=0.012, segments=8, material=rub, name='JeepSeal'))
    # dash top with a satin trim line along its edge
    dash_m = pk.mat.dashboard(color=(0.012, 0.014, 0.013), roughness=0.4, coat=0.7, coat_rough=0.1,
                              name='JeepDash')
    yd = 0.56
    dz = cz(0.03, yd + 0.1)
    dash = pk.geo.rounded_box((2.6, 0.2, 0.16), radius=0.05, segments=4, material=dash_m, name='JeepDash',
                              origin='CENTER')
    dash.location = (0.0, yd, dz - 0.06)
    parts.append(dash)
    satin = M('satin', lambda: pk.mat.metal((0.45, 0.46, 0.5), roughness=0.22, scratches=0.3, dirt=0.2,
                                            name='SatinTrim'))
    parts.append(pk.geo.tube_along([(-1.2 + 2.4 * i / 40, yd + 0.095, dz + 0.017) for i in range(41)], radius=0.006,
                                   segments=8, material=satin, name='JeepDashTrim'))
    # dash compass: brass housing, glass dome, amber backlit card
    brass = M('brass', lambda: pk.mat.metal((0.55, 0.38, 0.16), roughness=0.32, scratches=0.4, dirt=0.4,
                                            name='Brass'))
    cx_, cy_, cz_ = 0.15, yd + 0.06, dz - 0.012
    k_ = 0.42
    housing = pk.geo.lathe([(0.0, 0.0), (0.05 * k_, 0.0), (0.052 * k_, 0.012 * k_), (0.046 * k_, 0.03 * k_),
                            (0.0, 0.03 * k_)], segments=24, material=brass, name='CompassBase')
    housing.location = (cx_, cy_, cz_)
    card = pk.geo.lathe([(0.0, 0.0), (0.04 * k_, 0.0), (0.04 * k_, 0.002), (0.0, 0.002)], segments=24,
                        material=emit((1.0, 0.55, 0.18), 1.6), name='CompassCard')
    card.location = (cx_, cy_ - 0.002, cz_ + 0.05 * k_)
    card.rotation_euler = (math.radians(70), 0.0, 0.0)
    dome = pk.geo.lathe([(0.0, 0.0), (0.045 * k_, 0.0)] + [(0.045 * k_ * math.cos(math.pi / 2 * i / 8),
                                                            0.045 * k_ * math.sin(math.pi / 2 * i / 8))
                                                           for i in range(1, 9)], segments=24,
                        material=M('domeglass', lambda: pk.mat.basic((0.02, 0.025, 0.03), roughness=0.03, coat=1.0,
                                                                     name='CompassGlass')), name='CompassDome')
    dome.location = (cx_, cy_, cz_ + 0.028 * k_)
    parts += [housing, card, dome]
    wheel_m = pk.mat.dashboard(color=(0.012, 0.009, 0.007), roughness=0.28, coat=0.7, coat_rough=0.06,
                               spec=0.7, name='JeepWheel')
    for p in parts:
        V.attach(p, cam)
    wheel = V.steering_wheel(cam, x=-0.03, y=0.56, radius=0.21, tube=0.011, top=0.088, tilt_deg=30.0,
                             material=wheel_m, name='JeepWheel')
    parts.append(wheel)
    # no windshield glass: the kit's dithered glass left a fine stipple over the whole frame that
    # read as render noise on the sand, the canal walls and the shadows; the frame rail stays
    V.cabin_light(cam, location=(0.0, 1.3, 0.3), target=(0.0, 2.0, z_f), size=(1.6, 0.8),
                  color=(0.45, 0.58, 1.0), energy=4.0, receivers=parts, name='HoodFill')
    # the compass card lights the wheel rim and the dash from below: a warm anchor in the cabin
    V.cabin_light(cam, location=(cx_, cy_ - 0.05, cz_ + 0.04), target=(-0.05, 0.45, cz_ + 0.1), size=(0.06, 0.06),
                  color=(1.0, 0.55, 0.2), energy=0.35, receivers=[wheel, dash, housing, dome], name="CompassGlow")
    # a cool kicker from above-left that draws the wheel's top arc
    V.cabin_light(cam, location=(-0.5, 0.2, 0.25), target=(0.0, 0.5, -0.25), size=(0.4, 0.4),
                  color=(0.5, 0.75, 1.0), energy=2.5, receivers=[wheel], name='WheelRim')
    return parts


# ---------------------------------------------------------------- the film
def build(ctx):
    rng = random.Random(505)
    # arc length starts at the first point: the camera starts at (0, -10)
    pts = [(0, -10), (0, 0), (0, 15), (-1.5, 29), (-5.0, 43), (-9.0, 57), (-11.5, 73), (-12.5, 92),
           (-12.0, 115), (-10.5, 145), (-10.0, 185)]
    # vibration 0: the kit's vibration also drives pitch and roll with sines up to 6.9 Hz (the sky
    # buzzed 2 to 5 px per frame against the locked dash); calm_road_vibration() adds a slow bounce
    cam = pk.camera.drive(pts, speed_mps=5.2, height=1.82, fov_v_deg=62, pitch_deg=4.5, look_ahead=12.0,
                          vibration=0.0, sway=0.05, max_roll_deg=1.5)
    # the kit's roll (and, less, its yaw) kinks wherever the curvature probe passes a control point
    # of the C1 path: low-pass both before the slow bounce is added
    smooth_camera_turns(cam)
    calm_road_vibration(cam)
    path = ctx.path
    town = ctx.collection('Town')
    far = ctx.collection('Skyline')
    props = ctx.collection('Props')

    # ground: wet sandstone setts with mirror puddles, a stone irrigation channel along the left
    # kerb, wet flagstone walks, damp sand
    road = mat_pavers()
    walk = pk.mat.wet_asphalt(name='WetFlagstone', base=(0.09, 0.07, 0.055), lane_markings=False, puddles=0.4,
                              dry_rough=0.45, wet_rough=0.16, grain=0.6)
    curb = pk.mat.clay((0.5, 0.42, 0.36), roughness=0.6, name='CurbStone')
    sand = pk.mat.ground((0.36, 0.26, 0.19), name='Sand', roughness=0.85, wet=0.55, scale=2.0,
                         color2=(0.22, 0.15, 0.11))
    street(path, town, road, walk, curb, sand)

    # ------------------------------------------------ hero, landmarks
    caravan_inn(path, town, rng)
    water_tower(path, town)
    lantern_tower(path, town)
    town_gate(path, town)

    # ------------------------------------------------ houses close along the road, 2 to 3 storeys
    idx = 0
    gaps = []
    for side in (-1, 1):
        s = -6.0 if side < 0 else -2.0
        while s < 150:
            w = rng.uniform(6.0, 9.5)
            mid = s + w / 2
            i0, i1 = INN_S0 - INN_W / 2 - 7.0, INN_S0 + INN_W / 2 + 1.0
            if side > 0 and i0 < mid + w / 2 and mid - w / 2 < i1:
                s = i1 + 0.5
                continue
            if side < 0 and TOWER_S - 7.0 < mid + w / 2 and mid - w / 2 < TOWER_S + 7.0:
                s = TOWER_S + 7.5
                continue
            if GATE_S - 6.5 < mid + w / 2 and mid - w / 2 < GATE_S + 4.0:
                s = GATE_S + 4.5
                continue
            if rng.random() < 0.14 and s > 6:
                g = rng.uniform(3.5, 5.0)
                gaps.append((s + g / 2, side))
                s += g                              # sandy gap for palms and cacti
                continue
            far_ = s > 60
            h = rng.uniform(6.4, 9.8) if rng.random() < 0.75 else rng.uniform(4.8, 6.4)
            d = rng.uniform(6.0, 9.0)
            fl = rng.uniform(7.35, 7.9) if side < 0 else rng.uniform(6.3, 6.9)
            if side > 0 and 4.0 < mid < 41.0:
                fl = rng.uniform(10.8, 12.0)
                h = min(h, 5.2)
            wall = WALLS[rng.randrange(len(WALLS))]
            wc = AMBER if rng.random() < 0.35 else rng.choice([(0.45, 0.8, 1.0), (0.35, 0.65, 1.0), ROSE,
                                                               (0.6, 0.55, 1.0), (0.4, 0.95, 0.9)])
            opts = dict(win_color=wc, dome=rng.random() < 0.3, stair=rng.random() < 0.25,
                        shop=rng.random() < 0.45, shop_color=rng.choice([SAFFRON, AMBER, (1.0, 0.45, 0.5), TURQ]),
                        lit=rng.uniform(0.7, 0.95),
                        dome_color=rng.choice([(0.1, 0.55, 0.6), (0.85, 0.55, 0.25), (0.6, 0.2, 0.45), (0.2, 0.35, 0.85)]))
            if s < 130 and idx % 2 == 1:
                kinds = ['camel', 'palm', 'star', 'crescent', 'lantern']
                ncols = [MAGENTA, TURQ, CYAN, ROSE, TURQ, (0.3, 1.0, 0.45)]
                opts['neon'] = (kinds[(idx // 2) % len(kinds)], ncols[(idx // 2) % len(ncols)])
            if rng.random() < 0.45:
                opts['rug'] = rng.randrange(len(RUGS))
            if rng.random() < 0.6:
                opts['awning'] = rng.choice([((0.85, 0.15, 0.2), (0.95, 0.85, 0.7)), ((0.1, 0.5, 0.55), (0.95, 0.9, 0.8)),
                                             ((0.9, 0.55, 0.1), (0.3, 0.1, 0.4)), ((0.2, 0.3, 0.8), (0.95, 0.9, 0.85))])
            opts['tiles'] = rng.random() < 0.6
            house(path, mid, side, w, d, h, wall, rng, town, idx, face_lat=fl, opts=opts)
            # coloured wash at the facade foot (none just before the inn: its cone would spill
            # a coloured pool onto the inn's warm front)
            near_inn = side > 0 and INN_S0 - INN_W / 2 - 16 < mid < INN_S0
            if s < 125 and not near_inn:
                fp = path.offset(mid, side * (fl - 2.0), 0.25)
                tp = path.offset(mid + rng.uniform(-1, 1), side * (fl + 0.2), h * 0.8)
                pk.lights.spot(tuple(fp), tuple(tp), WASHES[idx % len(WASHES)], 2600.0,
                               angle_deg=100, blend=0.9, radius=0.3, shadow=False, name='Wash%d' % idx,
                               collection=town, volume=0.0)
            idx += 1
            s += w + rng.uniform(0.3, 1.2)

    # ------------------------------------------------ stalls (on the walks, close to the kerb)
    for k, (ss, sd, lat, canopy) in enumerate(STALLS):
        market_stall(path, ss, sd, lat, props, rng, k, canopy)

    def near_stall_s(s, side, r=3.6):
        return any(sd_ == side and abs(s - ss_) < r for ss_, sd_, _, _ in STALLS)

    # ------------------------------------------------ lantern posts: right kerb, and over the channel
    for i, s in enumerate(range(3, 150, 9)):
        side = 1 if i % 2 == 0 else -1
        if side > 0 and INN_S0 - INN_W / 2 - 13 < s < INN_S0 + INN_W / 2:
            continue
        if near_stall_s(s, side) or abs(s - GATE_S) < 6:
            continue
        lantern_post(path, s, side, LAMP_COLORS[i % len(LAMP_COLORS)], town, i, light=s < 130,
                     lat=4.15 if side > 0 else 5.5)
    # low brass lantern bollards along the right kerb and the channel coping (near-field lights
    # that streak in the wet stone and mirror in the water)
    bol_glass = [emit(WARM_BULB, 30.0), emit(TURQ, 26.0), emit(WARM_BULB2, 30.0)]
    bv = [bollard('BollardA', props, bol_glass[0]), bollard('BollardB', props, bol_glass[1]),
          bollard('BollardC', props, bol_glass[2])]
    bpts = []
    for side, lat in ((1, 3.72), (-1, -5.38)):
        s = 6.0 if side > 0 else 9.0
        while s < 140:
            ok = not near_stall_s(s, side, 2.5) and abs(s - GATE_S) > 5
            if side > 0 and INN_S0 - INN_W / 2 - 2 < s < INN_S0 + INN_W / 2 + 1:
                ok = ok and (int(s) % 2 == 0)
            if ok:
                bpts.append(tuple(path.offset(s, lat, 0.11 if side > 0 else 0.13)))
            s += 6.0
    pk.geo.scatter(bv, bpts, seed=12, scale=(0.95, 1.05), name='Bollards', collection=props)
    for i, p in enumerate(bpts[::3]):
        pk.lights.point((p[0], p[1], p[2] + 1.0), (1.0, 0.6, 0.3), 25.0, radius=0.1, shadow=False,
                        name='BollardGlow%d' % i, collection=props, volume=0.0)

    # string lights across the road
    for k, s in enumerate((84.0, 106.0, 132.0)):
        p0 = path.offset(s, -7.5, 6.6 + 0.3 * (k % 2))
        p1 = path.offset(s + 1.5, 6.9, 6.4)
        cols = [WARM_BULB, WARM_BULB2, WARM_BULB, TURQ, WARM_BULB2]
        pk.geo.string_lights(tuple(p0), tuple(p1), sag=1.1, count=22, colors=cols[k % 5:] + cols[:k % 5],
                             strength=220.0, bulb_radius=0.05, light_every=7, light_energy=30.0,
                             name='Across%d' % k, collection=town)
    # festival strings close ahead: carved poles each side, warm bulbs sagging over the road
    # with a pierced brass lantern in the middle (overhead parallax, reflections in the near road)
    pole_m = M('fpole', lambda: pk.mat.painted_wood((0.30, 0.13, 0.06), wear=0.6, roughness=0.6,
                                                    name='FestPole'))
    brass = M('brass', lambda: pk.mat.metal((0.55, 0.38, 0.16), roughness=0.32, scratches=0.4, dirt=0.4,
                                            name='Brass'))
    fest_glass = near_fade(pk.mat.emission((1.0, 0.55, 0.2), 14.0, name='FestLanternGlass'))
    for k, s in enumerate(NEAR_STRINGS):
        ends = []
        for side in (-1, 1):
            b = path.offset(s + (0.6 if side > 0 else 0.0), 5.1 if side > 0 else -5.55, 0.12)
            pk.geo.lathe([(0.0, 0.0), (0.13, 0.0), (0.13, 0.25), (0.085, 0.35), (0.075, 5.3), (0.11, 5.38),
                          (0.11, 5.5), (0.05, 5.62), (0.0, 5.75)], segments=12, material=pole_m,
                         name='FestPole%d' % k, location=tuple(b), collection=town)
            ends.append(b + Vector((0, 0, 5.35)))
        cols = [WARM_BULB, WARM_BULB2, WARM_BULB, WARM_BULB2, TURQ] if k % 2 == 0 else \
            [WARM_BULB2, WARM_BULB, MAGENTA, WARM_BULB, WARM_BULB2]
        pk.geo.string_lights(tuple(ends[0]), tuple(ends[1]), sag=0.85, count=26, colors=cols, strength=110.0,
                             bulb_radius=0.04, light_every=9, light_energy=18.0, name='Near%d' % k,
                             collection=town)
        # these pass right over the camera: cap their bloom as they come close (see near_fade)
        for m in bpy.data.objects['Near%d_bulbs' % k].data.materials:
            near_fade(m)
        mid = ends[0].lerp(ends[1], 0.5) + Vector((0, 0, -0.85))
        ln = lantern_shape('FestLantern%d' % k, fest_glass, brass, town, scale=1.0)
        ln.location = tuple(mid + Vector((0, 0, -0.05)))
        pk.lights.point(tuple(mid + Vector((0, 0, -0.35))), (1.0, 0.55, 0.22), 60.0, radius=0.2, shadow=False,
                        name='FestLanternLight%d' % k, collection=town, volume=0.0)

    # ------------------------------------------------ date palms along the channel, in the gaps, at the inn
    bulb_sets = [[emit(WARM_BULB, 55.0), emit(WARM_BULB2, 50.0)],
                 [emit(WARM_BULB2, 50.0), emit(WARM_BULB, 55.0), emit(WARM_BULB, 55.0), emit(TURQ, 55.0)],
                 [emit(WARM_BULB, 55.0), emit(WARM_BULB2, 50.0), emit(WARM_BULB, 55.0)]]
    pv = [palm_variant('PalmA', 7.0, 0.12, rng, props, bulb_sets[0]),
          palm_variant('PalmB', 8.6, -0.1, rng, props, bulb_sets[1]),
          palm_variant('PalmC', 6.0, 0.18, rng, props, bulb_sets[2])]
    palm_pts, palm_yaw = [], []
    s = 4.0
    while s < 140:                                   # along the channel, leaning over the water
        if not near_stall_s(s, -1, 3.0) and abs(s - GATE_S) > 6 and abs(s - TOWER_S) > 4:
            palm_pts.append(tuple(path.offset(s, -5.75, 0.13)))
            palm_yaw.append(rng.uniform(150, 210))
        s += rng.uniform(11.0, 15.0)
    for gs, gside in gaps:
        if gside > 0 and INN_S0 - INN_W / 2 - 12 < gs < INN_S0 + INN_W / 2 + 1:
            continue
        palm_pts.append(tuple(path.offset(gs, gside * 7.8, 0.1)))
        palm_yaw.append(rng.uniform(0, 360))
    s = 9.0
    while s < 140:                                   # a few on the right walk edge
        if not (INN_S0 - INN_W / 2 - 12 < s < INN_S0 + INN_W / 2 + 1) and not near_stall_s(s, 1, 3.0) \
                and abs(s - GATE_S) > 6:
            palm_pts.append(tuple(path.offset(s, 5.55, 0.11)))
            palm_yaw.append(rng.uniform(0, 360))
        s += rng.uniform(19.0, 26.0)
    palm_pts += [tuple(path.offset(INN_S0 - INN_W / 2 - 4.5, 5.4, 0.1)),
                 tuple(path.offset(INN_S0 + INN_W / 2 + 2.0, 6.0, 0.1))]
    palm_yaw += [30.0, 200.0]
    pk.geo.scatter(pv, palm_pts, seed=5, scale=(0.82, 1.2), rot_z=False, align=palm_yaw, name='Palms',
                   collection=props)
    for i, p in enumerate(palm_pts[::2]):
        pk.lights.point((p[0], p[1], 5.5), (1.0, 0.6, 0.3), 70.0, radius=0.8, shadow=False, name='PalmGlow%d' % i,
                        collection=props, volume=0.0)
    # prickly pears strung with fairy lights, potted agaves, jars, shrubs, drifted sand
    cbulbs = [emit(WARM_BULB, 50.0), emit(TURQ, 50.0), emit(WARM_BULB2, 45.0), emit(WARM_BULB, 50.0)]
    cv = [opuntia_variant('OpuntiaA', rng, props, cbulbs, n_pads=9),
          opuntia_variant('OpuntiaB', rng, props, cbulbs[1:] + cbulbs[:1], n_pads=6),
          opuntia_variant('OpuntiaC', rng, props, cbulbs[2:] + cbulbs[:2], n_pads=12)]
    cac = [tuple(path.offset(gs + rng.uniform(-1.2, 1.2), gside * rng.uniform(6.6, 7.2), 0.1)) for gs, gside in gaps]
    cac += pk.geo.points_in_band(path, 10, 5.55, 5.8, s0=8, s1=140, seed=21, min_dist=5.0, z=0.11, both_sides=False)
    cac = [p for p in cac if not in_inn_zone(path, p) and not near_stall(path, p)]
    pk.geo.scatter(cv, cac, seed=6, scale=(0.75, 1.1), name='Cacti', collection=props)
    av = [agave_pot('AgaveA', props, rng, (0.55, 0.28, 0.14)), agave_pot('AgaveB', props, rng, (0.15, 0.35, 0.55))]
    ap = pk.geo.points_in_band(path, 16, 6.55, 6.85, s0=4, s1=140, seed=33, min_dist=4.0, z=0.13, both_sides=False)
    ap = [tuple(path.offset(path_s_near(path, p), -6.7, 0.13)) for p in ap]
    ap += pk.geo.points_in_band(path, 10, 5.6, 5.8, s0=70, s1=140, seed=34, min_dist=5.0, z=0.11, both_sides=False)
    ap = [p for p in ap if not near_stall(path, p) and abs(path_s_near(path, p) - GATE_S) > 5]
    pk.geo.scatter(av, ap, seed=13, scale=(0.85, 1.15), name='Agaves', collection=props)
    jv = [jar_variant('JarA', props, (0.5, 0.25, 0.12), 0.9), jar_variant('JarB', props, (0.15, 0.35, 0.55), 0.7),
          jar_variant('JarC', props, (0.7, 0.45, 0.25), 1.1)]
    jp = pk.geo.points_in_band(path, 30, 5.62, 5.85, s0=-2, s1=140, seed=31, min_dist=1.5, z=0.11, both_sides=False)
    jl = pk.geo.points_in_band(path, 30, 6.75, 7.0, s0=-2, s1=140, seed=32, min_dist=1.5, z=0.13, both_sides=False)
    jp += [tuple(path.offset(path_s_near(path, p), -6.9, 0.13)) for p in jl]
    jp = [p for p in jp if not in_inn_zone(path, p) and not near_stall(path, p)]
    pk.geo.scatter(jv, jp, seed=7, scale=(0.8, 1.2), name='Jars', collection=props)

    # night market: a few travellers at the inn gate
    for j, (ds, dl) in enumerate(((-2.2, 1.6), (-3.0, 2.6), (-1.0, 3.6), (-6.5, 3.4))):
        fg = figure('InnGuest%d' % j, props, ROBES[(j + 1) % len(ROBES)], ROBES[(j + 3) % len(ROBES)],
                    h=rng.uniform(1.6, 1.8))
        fp = path.offset(INN_S0 - INN_W / 2 + ds, INN_FACE + dl, 0.0)
        fg.location = tuple(fp)
    # wind-blown sand drifted against the walls
    dm = bmesh.new()
    bmesh.ops.create_uvsphere(dm, u_segments=20, v_segments=10, radius=1.0)
    for v in dm.verts:
        v.co.z = max(v.co.z, 0.0) * 0.16
        v.co.x *= 1.0 + 0.25 * math.sin(v.co.y * 3.0)
    dme = bpy.data.meshes.new('SandDrift')
    dm.to_mesh(dme)
    dm.free()
    dme.shade_smooth()
    dme.materials.append(sand)
    drift = bpy.data.objects.new('SandDrift', dme)
    props.objects.link(drift)
    dp = pk.geo.points_in_band(path, 40, 6.0, 6.25, s0=-4, s1=150, seed=61, min_dist=2.5, z=0.08, both_sides=False)
    dpl = pk.geo.points_in_band(path, 40, 7.1, 7.35, s0=-4, s1=150, seed=62, min_dist=2.5, z=0.1, both_sides=False)
    dp += [tuple(path.offset(path_s_near(path, p), -7.25, 0.1)) for p in dpl]
    dp = [p for p in dp if not in_inn_zone(path, p) and not near_stall(path, p)]
    pk.geo.scatter(drift, dp, seed=10, scale=(0.5, 1.1), name='SandDrifts', collection=props)

    # ------------------------------------------------ far skyline (two bands of depth)
    sk_w = [lit_win(AMBER, 16.0), lit_win((1.0, 0.7, 0.45), 14.0), lit_win((0.45, 0.75, 1.0), 14.0),
            lit_win(ROSE, 14.0)]
    k = 0
    for s in range(-10, 240, 6):
        for side in (-1, 1):
            for band in ((17, 32), (32, 70)):
                if rng.random() < 0.3:
                    continue
                lat = rng.uniform(*band)
                if s > 150 and lat < 20:
                    continue
                skyline_block(path, s + rng.uniform(-2, 2), side, lat, rng, far, k, sk_w)
                k += 1
    fp = pk.geo.points_in_band(path, 70, 15.0, 45.0, s0=0, s1=230, seed=51, min_dist=5.0, z=0.0)
    pk.geo.scatter(pv, fp, seed=9, scale=(1.0, 1.5), name='FarPalms', collection=far)

    # ------------------------------------------------ dunes, tents
    dune_ob, dune_h = dunes(path, far, rng)
    dl = bpy.data.lights.new('DuneMoon', 'SUN')
    dl.energy = 4.0
    dl.color = (0.55, 0.65, 1.0)
    dl.angle = math.radians(2.0)
    do_ = bpy.data.objects.new('DuneMoon', dl)
    do_.rotation_euler = (-pk.sky_dir(-75.0, 16.0)).to_track_quat('-Z', 'Y').to_euler()
    pk._link(do_)
    rc = bpy.data.collections.new('DuneMoon_Receivers')
    rc.objects.link(dune_ob)
    do_.light_linking.receiver_collection = rc
    # web export only: glTF has no light linking, so in the web it would light every facade
    do_['pk_noexport'] = True
    tent_m = mat_canvas_glow((1.0, 0.55, 0.22), 14.0, 'TentCanvas')
    for i, (s, lat) in enumerate(((240, -150), (300, 120), (360, -60), (420, 200), (330, -260), (280, 60))):
        p = path.offset(min(s, path.length), lat, 0.0)
        p = Vector((p.x, p.y, 0.0))
        z = dune_h(p.x, p.y) - 0.3
        t = pk.geo.lathe([(0.0, 3.2), (2.8, 0.6), (3.2, 0.0), (0.0, 0.0)], segments=6, material=tent_m,
                         name='Tent%d' % i, location=tuple(p + Vector((0, 0, z))), collection=far)
        pk.lights.point(tuple(p + Vector((3.5, -3.0, z + 1.0))), (1.0, 0.5, 0.18), 3000.0, radius=1.0, shadow=False,
                        name='Campfire%d' % i, collection=far, volume=0.0)

    # ------------------------------------------------ haze: thin, so lamps glow into the air
    mid = path.at(80.0)
    pk.geo.fog(center=(mid.x, mid.y, 10), size=(420, 520, 22), density=HAZE, falloff=3.5,
               color=(0.35, 0.45, 1.0), anisotropy=0.6)

    # ------------------------------------------------ the jeep
    jeep(cam, ctx)

    # ------------------------------------------------ sky
    build_sky(ctx)
    fl_ = bpy.data.lights.new('BackFill', 'SUN')
    fl_.energy = 0.55
    fl_.color = (0.3, 0.45, 1.0)
    fl_.angle = math.radians(8.0)
    fl_.use_shadow = False
    fo = bpy.data.objects.new('BackFill', fl_)
    fo.rotation_euler = (-pk.sky_dir(165.0, 32.0)).to_track_quat('-Z', 'Y').to_euler()
    pk._link(fo)

    ctx.scene.view_settings.exposure = EXPOSURE
    # mid-rough stone, sand and plaster fall back to probes instead of screen rays: the rays left
    # dark stipple on the canal walls and the inn forecourt
    ctx.scene.eevee.ray_tracing_options.trace_max_roughness = TRACE_MAX_ROUGH
    # no lens distortion (its resample softens the stars), light grain (its chroma part reads as
    # colour speckle in the dark sky)
    pk.comp.setup(bloom=BLOOM, bloom_threshold=BLOOM_T, bloom_size=0.55, glow=0.1, glow_threshold=6.0,
                  star_glow=0.0, star_sparkle=0.0, road_streak=ROAD_STREAK, road_streak_px=90,
                  road_streak_threshold=0.7, dispersion=0.0, distortion=0.0, vignette=0.26,
                  saturation=1.18, sky_bloom=0.0, sky_bloom_floor=1.2, grain=0.012)
    sky_sampling()
    comp_bloom_edge_fade()
    comp_split_tone()
    report(ctx, path)
    overscan_sides(ctx)                 # after report(), which projects into the 1080-wide frame


# ---------------------------------------------------------------- motion fixes (QA round 4)
# Road vibration that replaces the kit's (see build()): a slow body bounce, about 2 px peak to
# peak in the sky and under 0.4 px of motion per frame, all below 2.3 Hz.
VIB_Z = 0.0025                  # m, vertical bounce
VIB_PITCH = 0.035               # deg (31 px per deg at full resolution)
VIB_ROLL = 0.025                # deg
# Near festival strings: below NEAR_FADE_D0 metres the emission falls with distance squared, so
# radiance x solid angle (what drives the bloom) stays flat instead of growing as 1 / d^2.
NEAR_FADE_D0 = 9.0
NEAR_FADE_MIN = 0.05
# Screen-edge bloom. Sides: the frame is rendered OVERSCAN_X px wider on each side (at 100 percent;
# the camera fits the sensor vertically, so the visible 1080 x 1920 is unchanged) and cropped back
# after compositing, so the bloom sees lights just outside the frame; inside that hidden margin the
# bloom input fades to zero, so a halo dies out over a few frames after its light has left. Top: no
# overscan (only the near strings and palm lights leave there); the bloom input of non-sky pixels
# fades over the top BLOOM_EDGE_TOP of the frame, so the halo has gone before the light leaves.
OVERSCAN_X = 108
BLOOM_EDGE_TOP = 0.2
# Camera turn smoothing (QA round 5): Gaussian sigma in seconds for the roll and yaw keys that
# camera.drive makes. The kit's roll follows the curvature of a centripetal Catmull-Rom path,
# which is only C1: curvature jumps at every control point, so the roll swung by about 1 deg in
# 8 to 12 frames at (-5, 43) (t 9.4 to 9.8 s) and (0, 15) (t 3.8 to 4.1 s) and the sky zigzagged.
ROLL_SMOOTH_S = 0.5
YAW_SMOOTH_S = 0.25


def smooth_camera_turns(cam, roll_sigma_s=ROLL_SMOOTH_S, yaw_sigma_s=YAW_SMOOTH_S):
    """Low-pass the camera's roll (rotation_euler[1]) and yaw (rotation_euler[2]) keys with a
    Gaussian over time. The ends are padded by odd reflection, so a steady trend is kept up to
    the first and last frame. Call before calm_road_vibration(), which adds its own slow roll."""
    import numpy as np
    for idx, sig_s in ((1, roll_sigma_s), (2, yaw_sigma_s)):
        sig = sig_s * pk.FPS
        if sig <= 0:
            continue
        for fc in pk.fcurves(cam, 'rotation_euler', idx):
            kps = sorted(fc.keyframe_points, key=lambda k: k.co[0])
            fr = np.array([k.co[0] for k in kps])
            if len(kps) < 3 or np.abs(np.diff(fr) - 1.0).max() > 1e-6:
                raise RuntimeError('smooth_camera_turns expects one key per frame')
            x = np.array([k.co[1] for k in kps])
            n, h = len(x), int(math.ceil(3.5 * sig))
            h = min(h, n - 2)
            xp = np.concatenate([2 * x[0] - x[h:0:-1], x, 2 * x[-1] - x[-2:-h - 2:-1]])
            w = np.exp(-0.5 * (np.arange(-h, h + 1) / sig) ** 2)
            y = np.convolve(xp, w / w.sum(), mode='valid')
            for kp, v in zip(kps, y):
                d = float(v) - kp.co[1]
                kp.co[1] += d
                kp.handle_left[1] += d
                kp.handle_right[1] += d
            fc.update()


def calm_road_vibration(cam):
    """Add a slow, small road bounce to the camera keys made by camera.drive(vibration=0):
    vertical 1.2 and 2.3 Hz, pitch 0.8 and 1.7 Hz, roll 0.6 Hz. Deterministic."""
    def wave(comps, t):
        return sum(math.sin(2 * math.pi * f * t + ph) for f, ph in comps) / len(comps)
    terms = (('location', 2, VIB_Z, ((1.23, 0.7), (2.27, 2.9))),
             ('rotation_euler', 0, math.radians(VIB_PITCH), ((0.83, 1.9), (1.67, 4.4))),
             ('rotation_euler', 1, math.radians(VIB_ROLL), ((0.61, 0.3),)))
    for dp, idx, amp, comps in terms:
        for fc in pk.fcurves(cam, dp, idx):
            for kp in fc.keyframe_points:
                d = amp * wave(comps, (kp.co[0] - 1) / 24.0)
                kp.co[1] += d
                kp.handle_left[1] += d
                kp.handle_right[1] += d
            fc.update()


def near_fade(m, d0=None, fmin=None):
    """Scale an emission material's strength by clamp((d / d0)^2, fmin, 1), d the distance from
    the camera. Used on the festival strings that pass right over the camera: their bloom had
    grown as 1 / d^2 into a warm haze over the top 40 percent of the frame, then vanished in one
    frame when the last bulb left the top edge. Returns the material."""
    if m is None or m.get('pk05_near_fade'):
        return m
    d0 = NEAR_FADE_D0 if d0 is None else d0
    fmin = NEAR_FADE_MIN if fmin is None else fmin
    nt = m.node_tree
    for em in [n for n in nt.nodes if n.bl_idname == 'ShaderNodeEmission']:
        st = em.inputs['Strength']
        src = st.links[0].from_socket if st.is_linked else st.default_value
        cd = pk.node(nt, 'ShaderNodeCameraData')
        k = pk.math_(nt, 'DIVIDE', cd.outputs['View Distance'], d0)
        k = pk.math_(nt, 'MULTIPLY', k, k)
        k = pk.math_(nt, 'MAXIMUM', pk.math_(nt, 'MINIMUM', k, 1.0), fmin)
        nt.links.new(pk.math_(nt, 'MULTIPLY', k, src), st)
    m['pk05_near_fade'] = True
    return m


def comp_bloom_edge_fade():
    """Kit workaround: comp.setup's bloom only sees what is rendered, so a light's halo (and the
    glow it throws onto nearby walls) vanished in one frame when the light crossed the frame edge.
    Scale the bloom and glow input of non-sky pixels by an edge mask: zero at the outer edge of the
    hidden side margins (see OVERSCAN_X), one across the visible width, and fading out over the top
    BLOOM_EDGE_TOP of the frame. The sky (the Moon) keeps its bloom; lights keep their brightness."""
    ng = bpy.context.scene.compositing_node_group
    glares = [n for n in ng.nodes if n.bl_idname == 'CompositorNodeGlare' and n.inputs['Image'].is_linked]
    if not glares:
        return
    src = glares[0].inputs['Image'].links[0].from_socket
    rl = [n for n in ng.nodes if n.bl_idname == 'CompositorNodeRLayers'][0]
    ic = pk.node(ng, 'CompositorNodeImageCoordinates')
    ng.links.new(rl.outputs['Image'], ic.inputs['Image'])
    xyz = pk.sep_xyz(ng, ic.outputs['Normalized'])          # 0..1 over the rendered frame, origin bottom left
    x, y = xyz[0], xyz[1]
    edge = pk.maprange(ng, y, 1.0 - BLOOM_EDGE_TOP, 1.0, 1.0, 0.0, interp='SMOOTHSTEP')
    if OVERSCAN_X > 0:
        m = OVERSCAN_X / float(pk.RES_X + 2 * OVERSCAN_X)   # hidden margin, fraction of the rendered width
        mx = pk.math_(ng, 'MULTIPLY', pk.maprange(ng, x, 0.0, m, 0.0, 1.0, interp='SMOOTHSTEP'),
                      pk.maprange(ng, x, 1.0 - m, 1.0, 1.0, 0.0, interp='SMOOTHSTEP'))
        edge = pk.math_(ng, 'MULTIPLY', mx, edge)
    skym = pk.maprange(ng, rl.outputs['Depth'], 800.0, 1500.0, 0.0, 1.0)
    k = pk.mix_f(ng, skym, edge, 1.0)
    faded = pk.vmath(ng, 'SCALE', src, scale=k)
    for g in glares:
        if g.inputs['Image'].links[0].from_socket == src:
            ng.links.new(faded, g.inputs['Image'])


def overscan_sides(ctx):
    """Render OVERSCAN_X px more on each side and crop back to 1080 wide after each written
    frame or still (render_write handler, pixel exact), so the compositor sees lights just
    outside the frame. The camera fits its sensor vertically, so widening the render keeps the
    vertical field of view and the pixel scale: the visible frame is unchanged. The kit
    vignette, which works in normalized coordinates, is rescaled to the visible width."""
    sc = ctx.scene
    wide = pk.RES_X + 2 * OVERSCAN_X
    if ctx.camera.data.sensor_fit != 'VERTICAL' or OVERSCAN_X <= 0:
        return
    sc.render.resolution_x = wide
    ng = sc.compositing_node_group
    ky = pk.RES_Y / pk.RES_X * 0.75                          # the kit vignette's aspect factor
    nv = 0
    for n in ng.nodes:
        if n.bl_idname == 'ShaderNodeVectorMath' and n.operation == 'MULTIPLY' and not n.inputs[1].is_linked:
            v = n.inputs[1].default_value
            if abs(v[0] - 1.0) < 1e-6 and abs(v[1] - ky) < 1e-4:
                n.inputs[1].default_value = (wide / float(pk.RES_X), ky, 0.0)
                nv += 1
    pk.log('overscan: render %d x %d, crop to %d after compositing (%d vignette node rescaled)'
           % (wide, pk.RES_Y, pk.RES_X, nv))

    def crop_written(scene, *_):
        pct = scene.render.resolution_percentage
        target = int(pk.RES_X * pct / 100)
        for p in (scene.render.frame_path(frame=scene.frame_current), bpy.path.abspath(scene.render.filepath)):
            if not (p.lower().endswith('.png') and os.path.isfile(p)):
                continue
            import OpenImageIO as oiio
            buf = oiio.ImageBuf(p)
            w, h = buf.spec().width, buf.spec().height
            if w > target:
                x0 = (w - target) // 2
                cut = oiio.ImageBufAlgo.cut(buf, oiio.ROI(x0, x0 + target, 0, h))
                tmp = p[:-4] + '.crop.png'
                if not cut.write(tmp):
                    raise RuntimeError('overscan crop failed for %s: %s' % (p, cut.geterror()))
                os.replace(tmp, p)
            return
    bpy.app.handlers.render_write.append(crop_written)


# --export-web: the glTF camera takes its aspect from the render size, so export at 1080 wide
_kit_export_web = pk.export_web


def _export_web(c):
    r = bpy.context.scene.render
    old = r.resolution_x
    r.resolution_x = pk.RES_X
    try:
        web_prep()
        return _kit_export_web(c)
    finally:
        r.resolution_x = old


pk.export_web = _export_web

# ---------------------------------------------------------------- web edition only
# Everything below runs inside --export-web, after any stills or frames, so the film never sees it.
WEB_ROAD_SPAN = (7.8, 15.6)     # m (U lateral, V along) covered by one tile of the road textures


def web_road_tex(W=512, H=1024, span=WEB_ROAD_SPAN, base=(0.072, 0.062, 0.054), puddles=0.42,
                 puddle_rough=0.035, dry_rough=0.55, joint_rough=0.16, damp_rough=0.2, sett=(0.78, 0.52),
                 jitter=0.22, seed=5, hard_edge=False, wet=0.0, fine=0.0, normal_slope=0.0, ridge=0.0,
                 ridge_puddle=0.0):
    """Tileable web textures for DesertPavers (sRGB albedo and roughness, top row first), a numpy
    copy of mat_pavers: staggered setts (U lateral, V along, metres), per-stone tone, dark joints,
    soft puddles of the same size and share (42 percent of the road), wet darkening around them,
    mirror-smooth water. glTF cannot carry the procedural nodes; the flat fallback was one colour
    at roughness 0.25, which blurred every reflection into a broad grey sheen.
    wet: extra darkening of every stone (a rain-soaked road). fine: per-texel roughness noise
    (relative), which dithers the viewer's 10-tap mirror streak into a continuous smear instead of
    repeated copies. normal_slope > 0 also returns a tangent-space normal map (OpenGL, linear) of
    domed setts and sunk joints, flat in the puddles."""
    import numpy as np
    span_u, span_v = span
    rng = np.random.default_rng(seed)
    v = (np.arange(H)[::-1, None] + 0.5) / H * span_v
    u = (np.arange(W)[None, :] + 0.5) / W * span_u - span_u / 2
    u, v = np.broadcast_arrays(u, v)
    row = np.floor(v / sett[1]).astype(int)
    uo = u + np.where(row % 2 == 1, 0.5 * sett[0], 0.0)
    col = np.floor(uo / sett[0]).astype(int)
    fu, fv = uo / sett[0] - col, v / sett[1] - row
    d = np.minimum(np.minimum(fu, 1 - fu) * sett[0], np.minimum(fv, 1 - fv) * sett[1])
    joint = 1.0 - np.clip((d - 0.006) / 0.012, 0, 1)
    ncol, nrow = int(round(span_u / sett[0])) + 2, int(round(span_v / sett[1]))
    rnd = rng.random((nrow, ncol))[row % nrow, (col + 1) % ncol]
    fy = np.fft.fftfreq(H, d=span_v / H)[:, None]
    fx = np.fft.fftfreq(W, d=span_u / W)[None, :]
    f2 = fx * fx + fy * fy

    def fbm(octaves):
        acc = np.zeros((H, W))
        for size, amp in octaves:
            sig = 1.0 / (2.0 * np.pi * size * 0.35)
            n = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((H, W))) * np.exp(-f2 / (2 * sig * sig))))
            acc += amp * n / n.std()
        return acc / acc.std()

    def sstep(e0, e1, x):
        t = np.clip((x - e0) / (e1 - e0), 0, 1)
        return t * t * (3 - 2 * t)
    pm = fbm([(2.4, 1.0), (1.2, 0.55), (0.6, 0.3)]) * 0.11 + \
        np.clip(1.0 - np.abs(np.abs(u) - 1.6), 0, 1) * 0.1 + rnd * 0.03
    thr = np.quantile(pm[np.abs(u) < 3.3], 1.0 - puddles)
    puddle = sstep(thr - 0.0175, thr + 0.0175, pm)
    damp = sstep(thr - 0.11, thr - 0.0175, pm)
    tone = (1 - jitter + 2 * jitter * rnd) * np.clip(1.0 + 0.07 * fbm([(0.05, 1.0), (0.025, 0.5)]), 0.85, 1.12)
    c = np.array(base)[None, None, :] * tone[..., None]
    alt = np.array((base[0] * 0.8, base[1] * 0.85, base[2] * 1.1))
    c = c + ((rnd > 0.82) * 0.6)[..., None] * (alt - c)
    c = c + joint[..., None] * (np.array((0.02, 0.017, 0.015)) - c)
    c = c * (1.0 - 0.58 * np.maximum(puddle, 0.7 * damp))[..., None]
    c = c * (1.0 - wet)
    rr = dry_rough * np.clip(0.985 + 0.1 * fbm([(0.35, 1.0), (0.17, 0.5)]), 0.85, 1.12)
    if fine > 0:
        # per-stone and per-texel jitter (texels are 1.5 cm): neighbouring pixels sample the
        # mirror streak at different tap spacings
        rr = rr * (1.0 + fine * (0.35 * (2 * rnd - 1) + 0.65 * (2 * rng.random((H, W)) - 1)))
    rr = rr + 0.85 * joint * (joint_rough - rr)
    rr = rr + damp * (damp_rough - rr)
    rr = np.where(puddle > 0.5, puddle_rough, rr) if hard_edge else rr + puddle * (puddle_rough - rr)
    srgb = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.maximum(c, 1e-9), 1 / 2.4) - 0.055)
    alb, rough = np.clip(srgb, 0, 1).astype(np.float32), np.clip(rr, 0, 1).astype(np.float32)
    if normal_slope <= 0:
        return alb, rough
    # height (arbitrary units): stones domed toward their centres, per-stone height, sunk joints,
    # flat water; slopes are scaled so the steepest joint edge tilts the normal by normal_slope
    dome = sstep(0.0, 0.06, d) * (0.8 + 0.2 * rnd) + 0.04 * fbm([(0.08, 1.0)])
    h = dome * (1.0 - puddle)
    du, dv = span_u / W, span_v / H
    gu = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2 * du)
    gv = -(np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) / (2 * dv)     # rows run top-down
    k = normal_slope / max(np.quantile(np.hypot(gu, gv), 0.995), 1e-6)
    # fore-aft ridges (the film's puddle ridges, and rain-pocked stone): random tilts along the
    # road, correlated across it, at three wavelengths. The viewer offsets its mirror lookup by
    # the normal, so each pixel samples the streak at its own offset and the 10 taps blend into
    # one smear instead of a row of copies.
    def ridges(su, sv):
        g = np.exp(-0.5 * ((fx * su * 2 * np.pi) ** 2 + (fy * sv * 2 * np.pi) ** 2))
        r_ = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((H, W))) * g))
        return r_ / r_.std()
    rid = 0.45 * ridges(0.12, 0.008) + 0.35 * ridges(0.25, 0.03) + 0.2 * ridges(0.4, 0.09)
    rid = rid / rid.std() * (ridge + (ridge_puddle - ridge) * puddle)
    n = np.stack([-gu * k, -gv * k + rid, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return alb, rough, (n * 0.5 + 0.5).astype(np.float32)


def _web_byte_image(name, arr, colorspace):
    import numpy as np
    if arr.ndim == 2:
        arr = np.repeat(arr[..., None], 3, axis=2)
    H, W = arr.shape[:2]
    a = np.concatenate([arr, np.ones((H, W, 1), np.float32)], axis=2)
    old = bpy.data.images.get(name)
    if old is not None:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, W, H, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(a[::-1]).ravel())
    img.update()
    img.pack()
    return img


def web_prep():
    """Web export only. (1) DesertPavers gets textures (sett albedo, roughness with the puddle mask)
    in place of its flat pk_web colour, and the Road's UVs (metres) are rescaled to the texture tile.
    (2) Road and Canal carry mirror extras, so the viewer gives them planar reflections."""
    import numpy as np
    road = bpy.data.objects.get('Road')
    m = bpy.data.materials.get('DesertPavers')
    if road is not None and m is not None and road.data.uv_layers:
        # The film's dry setts (0.55) read as a soaked road: their GGX lobe stretches every light
        # into a long vertical streak at this grazing angle. The viewer's mirror has no such lobe
        # (it blurs by mip level, 6 x roughness, and streaks along 10 taps), so the web road is a
        # wet surface everywhere: dark soaked stone at a moderate roughness with per-texel
        # jitter (a long, dithered streak), glossy joints a little rougher, and more and larger
        # mirror puddles; a normal map carries the setts into the reflections.
        alb, rough, nrm = web_road_tex(**WEB_ROAD)
        ia = _web_byte_image('web_pavers_albedo', alb, 'sRGB')
        ir = _web_byte_image('web_pavers_rough', rough, 'Non-Color')
        inr = _web_byte_image('web_pavers_normal', nrm, 'Non-Color')
        if 'pk_web' in m:
            del m['pk_web']
        nt = m.node_tree
        nt.nodes.clear()
        out = pk.node(nt, 'ShaderNodeOutputMaterial')
        p = pk.node(nt, 'ShaderNodeBsdfPrincipled')
        ta = pk.node(nt, 'ShaderNodeTexImage')
        ta.image = ia
        tr = pk.node(nt, 'ShaderNodeTexImage')
        tr.image = ir
        sc = pk.node(nt, 'ShaderNodeSeparateColor')
        nt.links.new(ta.outputs['Color'], p.inputs['Base Color'])
        nt.links.new(tr.outputs['Color'], sc.inputs[0])
        nt.links.new(sc.outputs['Green'], p.inputs['Roughness'])
        # the viewer's mirror already reflects the sky and the town with its own fresnel, and
        # three.js also reflects the sky through the environment map (the mirror material's 0.4
        # env factor has no effect with scene.environment), so the road's own GGX specular
        # (environment and lamps) is turned down instead
        p.inputs['Specular IOR Level'].default_value = WEB_ROAD_SPEC
        tn = pk.node(nt, 'ShaderNodeTexImage')
        tn.image = inr
        nm = pk.node(nt, 'ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = 1.0
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        me = road.data
        uvl = me.uv_layers.active or me.uv_layers[0]
        uv = np.empty(len(uvl.data) * 2, np.float32)
        uvl.data.foreach_get('uv', uv)
        uv = uv.reshape(-1, 2)
        uv[:, 0] = (uv[:, 0] + WEB_ROAD_SPAN[0] / 2) / WEB_ROAD_SPAN[0]
        uv[:, 1] = uv[:, 1] / WEB_ROAD_SPAN[1]
        uvl.data.foreach_set('uv', uv.ravel())
        me.update()
        road['mirror_strength'] = 1.0
        road['mirror_streak'] = WEB_ROAD_STREAK     # soaked stone and ridged puddles streak every light
        pk.log('web: DesertPavers textured (%dx%d), Road UVs rescaled' % (alb.shape[1], alb.shape[0]))
    cn = bpy.data.objects.get('Canal')
    if cn is not None:
        cn['mirror_strength'] = 1.0
        cn['mirror_ripple'] = 1.0
    # (3) far bulbs: the viewer's screen bloom draws every 1 to 2 px bulb as a 6 to 8 px blob (the
    # film's bloom leaves them crisp points), so strings that never come near the camera and the
    # palm bulbs export dimmer. The Near strings, which pass overhead, keep their strength.
    far = set()
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.endswith('_bulbs') and not o.name.startswith('Near'):
            far.update(ms.material for ms in o.material_slots if ms.material is not None)
    k = 0
    for m in far:
        k += _web_scale_emit(m, WEB_FAR_BULB_K)
    for nm in WEB_PALM_BULBS:
        k += _web_scale_emit(bpy.data.materials.get(nm), WEB_PALM_BULB_K)
    # the near strings: the film scales them by (d / 9 m)^2 below 9 m (near_fade, Camera Data,
    # which glTF cannot carry); export them at a mid-distance strength
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.startswith('Near') and o.name.endswith('_bulbs'):
            for ms in o.material_slots:
                k += _web_scale_emit(ms.material, WEB_NEAR_BULB_K)
    # the hottest small bulbs (the water tower's dome and rail rings, the lantern tower strands, the gate
    # arch) bloomed into white rings in the viewer: web-only copies at half strength
    hot = {}
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.startswith(WEB_HOT_BULBS):
            for ms in o.material_slots:
                m = ms.material
                if m is None or 'pk_web' not in m or m.get('pk05_web_hot'):
                    continue
                if m.name_full not in hot:
                    cm = m.copy()
                    cm.name = m.name + '_hot'
                    cm['pk_web'] = dict(m['pk_web'])
                    cm['pk_web']['emit_strength'] = float(m['pk_web']['emit_strength']) * WEB_HOT_BULB_K
                    cm['pk05_web_hot'] = True
                    hot[m.name_full] = cm
                ms.material = hot[m.name_full]
    pk.log('web: %d bulb materials dimmed (far strings x%.2f, palms x%.2f, near x%.2f), %d hot bulb copies x%.2f'
           % (k, WEB_FAR_BULB_K, WEB_PALM_BULB_K, WEB_NEAR_BULB_K, len(hot), WEB_HOT_BULB_K))
    # (4) lit windows: the film's panels glow from a hot spot down to 0.45 of it behind frames,
    # mullions and curtains, and keep their colour; one flat value at the panel mean tone-maps the
    # bright ones to cream. Compress the flat value softly, e0 x e / (e0 + e): dim panes keep it.
    k = 0
    for m in bpy.data.materials:
        if m.get('pk_web_unlit') is not None and 'pk_web' in m and not m.get('pk05_web_scaled'):
            e = float(m['pk_web']['emit_strength'])
            k += _web_scale_emit(m, WEB_WINDOW_E0 / (WEB_WINDOW_E0 + e))
    pk.log('web: %d lit_window materials compressed (e0 %.1f)' % (k, WEB_WINDOW_E0))
    meta = web_window_meta()
    web_window_tints()
    web_window_textures(meta)
    web_hood_mirror()


def web_window_tints(nbins=4, hue_shift=0.08, variation=0.4):
    """Web export only: mat.lit_window varies each window's hue (+-hue_shift turns), saturation and
    brightness by r = fract(pk_rand + object random x 0.37); the flat web fallback lit every pane
    of a building the same cream. Split each mesh's lit window faces into nbins copies of the
    material with the bin's tint (unlit faces stay for the kit's _unlit split)."""
    import colorsys
    import zlib
    import numpy as np
    copies, done, n = {}, set(), 0
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.get('pk_noexport') or o.data.name_full in done:
            continue
        me = o.data
        done.add(me.name_full)
        a = me.attributes.get('pk_rand')
        if a is None or a.domain != 'FACE' or a.data_type != 'FLOAT' or not len(me.polygons):
            continue
        slots = [i for i, mm in enumerate(me.materials)
                 if mm is not None and mm.get('pk_web_unlit') is not None and 'pk_web' in mm]
        if not slots:
            continue
        rnd = np.empty(len(me.polygons), np.float32)
        a.data.foreach_get('value', rnd)
        mi = np.empty(len(me.polygons), np.int32)
        me.polygons.foreach_get('material_index', mi)
        r = np.mod(rnd + (zlib.crc32(me.name.encode()) % 1000) / 1000.0 * 0.37, 1.0)
        b = np.minimum((r * nbins).astype(int), nbins - 1)
        hit = False
        for i in slots:
            src = me.materials[i]
            for k in range(nbins):
                faces = (mi == i) & (rnd < 1.0) & (b == k)
                if not faces.any():
                    continue
                cm = copies.get((src.name_full, k))
                if cm is None:
                    rk = (k + 0.5) / nbins
                    hh, ss, vv = colorsys.rgb_to_hsv(*[float(x) for x in src['pk_web']['emit']][:3])
                    hh = (hh + (rk - 0.5) * 2.0 * hue_shift) % 1.0
                    ss = min(1.0, ss * (0.85 + 0.25 * rk))
                    cm = src.copy()
                    cm.name = '%s_t%d' % (src.name, k)
                    cm['pk_web']['emit'] = list(colorsys.hsv_to_rgb(hh, ss, vv))
                    cm['pk_web']['emit_strength'] = float(src['pk_web']['emit_strength']) * \
                        (1.0 - variation + rk * variation * 1.6)
                    copies[(src.name_full, k)] = cm
                me.materials.append(cm)
                mi[faces] = len(me.materials) - 1
                n += int(faces.sum())
                hit = True
        if hit:
            me.polygons.foreach_set('material_index', mi)
            me.update()
    pk.log('web: %d lit window faces tinted into %d material copies' % (n, len(copies)))


def web_window_meta():
    """Web export only: tag each lit_window material with its pane layout [mullions x, y,
    frame_w, mullion_w, curtains] (from the material cache key or the inn's own calls), so
    web_window_textures can draw its frames and mullions. Tint copies inherit the tag."""
    n = 0
    for key, m in _MATS.items():
        if not isinstance(m, bpy.types.Material) or m.get('pk_web_unlit') is None:
            continue
        if isinstance(key, tuple) and key[0] == 'win':
            mx, my = key[3]
            m['pk05_win'] = [float(mx), float(my), 0.07, 0.035, 0.05 if (mx, my) == (1, 1) else 0.35]
            n += 1
    for key, lay in (('innarc', [3.0, 5.0, 0.05, 0.045, 0.12]), ('inngate', [1.0, 1.0, 0.07, 0.035, 0.0]),
                     ('innup', [2.0, 2.0, 0.07, 0.035, 0.3])):
        m = _MATS.get(key)
        if m is not None:
            m['pk05_win'] = lay
            n += 1
    return n


def _web_window_pattern(mx, my, fw, mw, curt, N=128, ss=4):
    """Linear emission pattern of mat.lit_window on a 0..1 window quad (top row first): the
    glow (1.6 at the hot spot near the top, 0.45 at the far corners), dark frame and mullions,
    curtain silhouettes at the sides; the per-window hot-spot shift is left at the centre."""
    import numpy as np
    M_ = N * ss
    u = (np.arange(M_) + 0.5) / M_
    U, V = np.meshgrid(u, u[::-1])
    fr = (U < fw) | (U > 1 - fw) | (V < fw) | (V > 1 - fw)
    for i in range(1, mx):
        fr |= np.abs(U - i / mx) < mw / 2
    for i in range(1, my):
        fr |= np.abs(V - i / my) < mw / 2
    t = np.clip(np.hypot(U - 0.5, V - 0.78) / 0.9, 0, 1)
    glow = 1.6 + (0.45 - 1.6) * t * t * (3 - 2 * t)
    side = np.clip((np.abs(U - 0.5) - 0.22) / 0.26, 0, 1)
    sil = np.clip((side + 0.25 - 0.7) / 0.2, 0, 1) * curt
    e = glow * (1 - 0.75 * sil) * (~fr)
    return e.reshape(N, ss, N, ss).mean(axis=(1, 3))


def web_window_textures(meta_n=0):
    """Web export only: every lit_window material (and tint copy) gets an emissive texture of its
    panes (frame, mullions, hot spot, curtains) times its tint colour, in place of one flat
    emission: the flat panes read as pastel blobs. The panel mean stays the flat value x
    WEB_WIN_TEX_K; warm tints lean WEB_WIN_WARM_SHIFT turns toward yellow (the film's bright
    amber panes tone-map to yellow, the dimmer web panes do not). The unlit split (pk_web_unlit)
    still runs in the kit's export."""
    import colorsys
    import numpy as np
    imgs, n = {}, 0
    for m in list(bpy.data.materials):
        if m.get('pk_web_unlit') is None or 'pk_web' not in m or m.node_tree is None:
            continue
        lay = tuple(float(x) for x in m.get('pk05_win', [2.0, 2.0, 0.07, 0.035, 0.35]))
        if lay not in imgs:
            e = _web_window_pattern(int(lay[0]), int(lay[1]), lay[2] * WEB_WIN_LINE_K, lay[3] * WEB_WIN_LINE_K, lay[4])
            lin = np.clip(e / 1.6, 0, 1)
            srgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(np.maximum(lin, 1e-9), 1 / 2.4) - 0.055)
            imgs[lay] = (_web_byte_image('web_win_%dx%d_%d' % (int(lay[0]), int(lay[1]), len(imgs)), srgb.astype(np.float32),
                                         'sRGB'), float(lin.mean()))
        img, mean = imgs[lay]
        w = dict(m['pk_web'])
        hh, ss_, vv = colorsys.rgb_to_hsv(*[float(x) for x in w['emit']][:3])
        if hh < 0.15 or hh > 0.95:
            hh = (hh + WEB_WIN_WARM_SHIFT) % 1.0
        col = colorsys.hsv_to_rgb(hh, min(1.0, ss_ * WEB_WIN_SAT), vv)
        strength = float(w['emit_strength']) * WEB_WIN_TEX_K / max(mean, 1e-3)
        nt = m.node_tree
        nt.nodes.clear()
        out = pk.node(nt, 'ShaderNodeOutputMaterial')
        p = pk.node(nt, 'ShaderNodeBsdfPrincipled')
        p.inputs['Base Color'].default_value = list(w['base'])[:3] + [1.0]
        p.inputs['Roughness'].default_value = float(w['rough'])
        tx = pk.node(nt, 'ShaderNodeTexImage')
        tx.image = img
        tx.extension = 'EXTEND'
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        ca, cb = [sk for sk in mix.inputs if sk.type == 'RGBA'][:2]
        nt.links.new(tx.outputs['Color'], ca)
        cb.default_value = list(col) + [1.0]
        nt.links.new([sk for sk in mix.outputs if sk.type == 'RGBA'][0], p.inputs['Emission Color'])
        p.inputs['Emission Strength'].default_value = strength
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        del m['pk_web']
        n += 1
    pk.log('web: %d window materials textured (%d pane patterns, %d tagged)' % (n, len(imgs), meta_n))


def web_hood_mirror():
    """Web export only: the hood mirrors the lit town. The viewer fits one fixed world plane per
    mirror mesh when the scene loads (at the glTF rest pose), so a hood-shaped plane would be
    wrong as soon as the camera turns or moves. Instead the hood's mesh gets two faces the camera
    never sees, so its fitted plane is level (the rig is level with the road) and sits
    WEB_HOOD_PLANE_Z above the eye: a tilted face under the hood cancels the hood's forward
    lean, and a level face in the eye's own plane, behind the eye (edge-on from the eye, so it
    never draws), lifts the plane. A level plane above the hood gives the reflection the film's
    flatter sightline: the lit town band instead of the sky overhead."""
    hood = bpy.data.objects.get('JeepHood')
    if hood is None or hood.type != 'MESH':
        return
    me = hood.data
    Ml = hood.matrix_local
    S, A, Az = Vector((0.0, 0.0, 0.0)), 0.0, 0.0
    ys, top = [], []
    for p in me.polygons:
        vs = [Ml @ me.vertices[i].co for i in p.vertices]
        for i in range(1, len(vs) - 1):
            cr = (vs[i] - vs[0]).cross(vs[i + 1] - vs[0])
            a = cr.length * 0.5
            if a <= 0:
                continue
            if cr.z < 0:
                cr = -cr
            S += cr * 0.5
            A += a
            Az += a * (vs[0].z + vs[i].z + vs[i + 1].z) / 3.0
    for v in me.vertices:
        c = Ml @ v.co
        top.append(c)
    h = Vector((S.x, S.y, 0.0))
    quads = []
    A1, z1 = 0.0, 0.0
    if h.length > 1e-6:
        beta = math.radians(65.0)
        sh = h.normalized()
        A1 = h.length / math.sin(beta)
        W1 = 0.9
        L1 = A1 / W1
        e1 = Vector((-sh.y, sh.x, 0.0))
        e2 = sh * math.cos(beta) + Vector((0.0, 0.0, math.sin(beta)))
        yc = 1.62
        zt = min(c.z for c in top if abs(c.x) < W1 / 2 + 0.05 and abs(c.y - yc) < 0.35) - 0.06
        c0 = Vector((0.0, yc, zt)) - e2 * L1 - e1 * (W1 / 2)
        quads.append([c0, c0 + e1 * W1, c0 + e1 * W1 + e2 * L1, c0 + e2 * L1])
        z1 = zt - 0.5 * L1 * math.sin(beta)
    zm = WEB_HOOD_PLANE_Z
    A2 = (Az + A1 * z1) / zm - A - A1
    if A2 > 0:
        w2 = 2.0
        y1 = -0.3
        y0 = y1 - A2 / w2
        quads.append([Vector((-w2 / 2, y0, 0.0)), Vector((w2 / 2, y0, 0.0)), Vector((w2 / 2, y1, 0.0)),
                      Vector((-w2 / 2, y1, 0.0))])
    bm = bmesh.new()
    bm.from_mesh(me)
    inv = Ml.inverted()
    for q in quads:
        bm.faces.new([bm.verts.new(inv @ c) for c in q])
    bm.to_mesh(me)
    bm.free()
    me.update()
    hood['mirror_strength'] = WEB_HOOD_MIRROR
    hood['mirror_streak'] = 0.6
    pk.log('web: JeepHood mirror, hood lean %.1f deg, compensation %.2f m2, lift %.2f m2, plane %.2f m from the eye'
           % (math.degrees(math.atan2(h.length, S.z)), A1, max(A2, 0.0), zm))


WEB_ROAD = dict(base=(0.05, 0.044, 0.04), wet=0.35, puddles=0.5, puddle_rough=0.06, dry_rough=0.32,
                joint_rough=0.42, damp_rough=0.2, fine=0.35, normal_slope=0.12, ridge=0.08,
                ridge_puddle=0.035)
WEB_ROAD_STREAK = 3.5
WEB_ROAD_SPEC = 0.2             # Specular IOR Level: KHR_materials_specular 0.4 (see web_prep)
WEB_HOOD_PLANE_Z = -0.42        # m, rig frame (the eye is 1.82 m above the road)
WEB_HOOD_MIRROR = 0.62
WEB_WIN_TEX_K = 0.6
WEB_WIN_WARM_SHIFT = 0.03
WEB_WIN_SAT = 1.25
WEB_WIN_LINE_K = 1.4            # frames and mullions drawn wider than the film's (mips and bloom thin them)
WEB_NEAR_BULB_K = 0.36
WEB_HOT_BULB_K = 0.35
WEB_HOT_BULBS = ('TankDomeRing', 'TankRailBulbs', 'LTStrand', 'GateArchBulbs')
WEB_WINDOW_E0 = 4.0
WEB_FAR_BULB_K = 0.25
WEB_PALM_BULB_K = 0.4
WEB_PALM_BULBS = ('PK_Emit_ff8e33_55', 'PK_Emit_ffa851_50', 'PK_Emit_14d8c6_55')


def _web_scale_emit(m, k):
    if m is None or 'pk_web' not in m or m.get('pk05_web_scaled'):
        return 0
    m['pk_web']['emit_strength'] = float(m['pk_web']['emit_strength']) * k
    m['pk05_web_scaled'] = True
    return 1


def comp_split_tone():
    """Cool split tone at the end of the compositor: shadows and midtones lean cobalt (the night),
    highlights stay neutral so the practicals keep their warm and neon hues."""
    ng = bpy.context.scene.compositing_node_group
    out = [n for n in ng.nodes if n.bl_idname == 'NodeGroupOutput'][0]
    img = out.inputs[0].links[0].from_socket
    lum = pk.vmath(ng, 'DOT_PRODUCT', img, pk.LUMA)
    k = pk.maprange(ng, lum, 0.015, 0.55, 0.0, 1.0, interp='SMOOTHSTEP')
    lo = pk.vmath(ng, 'SCALE', SPLIT_LO, scale=pk.math_(ng, 'SUBTRACT', 1.0, k))
    tint = pk.vmath(ng, 'ADD', lo, pk.vmath(ng, 'SCALE', (1.0, 1.0, 1.0), scale=k))
    ng.links.new(pk.vmath(ng, 'MULTIPLY', img, tint), out.inputs[0])


def sky_sampling():
    """Kit workaround: rect sky layers are always sampled 'Linear', which on the GPU picks a
    blurrier mip level when the plate is minified. Sample the Milky Way plate 'Closest' instead:
    the 64 jittered TAA samples then do the 2.6x downsample, so stars stay 1 to 2 px points."""
    w = bpy.context.scene.world
    n = 0
    for nd in w.node_tree.nodes:
        if nd.bl_idname == 'ShaderNodeTexImage' and nd.image is not None and 'mw_potw1713a' in nd.image.name:
            nd.interpolation = SKY_INTERP
            n += 1
    pk.log('sky plate sampling %s on %d node(s)' % (SKY_INTERP, n))


# ---------------------------------------------------------------- sky
# Round 3: the visible sky is one real photograph, ESO potw1713a ("Up high", B. Tafreshi), the
# narrow southern Milky Way at 77 px/deg. prep_plates.py (milkyway1713) flattens its horizon glow,
# calms the star colours, places it (core just under the left skyline, band climbing diagonally to
# the upper right, 1.3x smaller than life), bakes a horizon extinction and reprojects it into a
# level plate that covers every camera view from 0 to 14 s (mw_potw1713a.json). At 73 px/deg it
# is rendered 2.6x down, so stars are 1 to 2 px points. The kit's all-sky Milky Way stays
# underneath for world lighting and the 360-degree web sky only.
import json  # noqa: E402
with open(os.path.join(PLATES, 'mw_potw1713a.json')) as _fh:
    MW_J = json.load(_fh)
MW_NAME = 'milkyway_potw1713a'
DAWN_AZ = -30.0
EXPOSURE = -0.5
BLOOM, BLOOM_T = 0.9, 1.0
SKY_EXP, SKY_CON, SKY_SAT, SKY_TINT = 0.6, 1.45, 0.82, (0.88, 0.94, 1.14)


def build_sky(ctx):
    pk.sky.galactic(core_az=CORE_AZ, core_el=CORE_EL, tilt=40.0, exposure=0.7, contrast=1.45, saturation=1.3,
                    tint=(0.72, 0.8, 1.42), dust_contrast=0.3, mw_boost=0.95, star_boost=4.2,
                    background=(0.002, 0.005, 0.03), airglow=0.0, airglow_red=0.0, dawn=0.0,
                    extinction=0.8, extinction_height_deg=16.0, horizon_glow=0.0,
                    light=0.04, light_tint=(0.7, 0.82, 1.0), ambient=(0.03, 0.055, 0.24))
    J = MW_J
    pk.sky.photo_plate(os.path.join(PLATES, 'mw_potw1713a.tif'), center_az=J['center_az'],
                       center_el=J['center_el'], hfov_deg=J['hfov_deg'], vfov_deg=J['vfov_deg'], roll_deg=0.0,
                       gain=1.0, feather=0.004, blend='replace', name=MW_NAME, colorspace='sRGB')
    # faint teal-green airglow band and the thin dawn line low on the left (added to the photo)
    pk.sky.atmosphere(airglow=AIRGLOW, airglow_color=(0.25, 1.0, 0.7), airglow_red=0.0,
                      background=(0.0, 0.0, 0.0), skyglow=0.0, dawn=0.9, dawn_az=DAWN_AZ,
                      dawn_color=(1.0, 0.45, 0.2), dawn_height_deg=3.5, dawn_spread_deg=26.0)
    # thin waning crescent in the dark sky above the band, lit limb toward the sun below the
    # dawn horizon; earthshine at about 3 percent of the limb shows the maria on the dark side
    sd = pk.sky_dir(DAWN_AZ, -14.0)
    f, r, u = pk.sky.rect_frame(MOON_AZ, MOON_EL)
    lit = math.degrees(math.atan2(sd.dot(u), sd.dot(r)))
    pk.sky.moon(az=MOON_AZ, el=MOON_EL, size_deg=MOON_SIZE, phase=0.2, lit_angle_deg=lit, gain=11.0,
                earthshine=0.032, earthshine_color=(0.62, 0.74, 1.0), halo=0.0, halo_size=0.15,
                light=1.2, light_color=(0.4, 0.55, 1.0))
    # soft atmospheric scatter halo (about 2.5 moon radii), stronger on the sunlit side, added
    # over the disc and the sky; the kit's halo draws a thin bright ring at the limb instead
    import numpy as np
    n = 256
    ext = 3.2                                       # image half-size in moon radii
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    X = (xx + 0.5 - n / 2) / (n / 2) * ext
    Y = (n / 2 - (yy + 0.5)) / (n / 2) * ext
    rr = np.hypot(X, Y)
    th = math.radians(lit)
    side_k = 1.0 + 0.6 * (X * math.cos(th) + Y * math.sin(th)) / np.maximum(rr, 1e-3)
    g = (np.exp(-np.maximum(rr - 0.95, 0) / 0.45) * 0.55 + np.exp(-rr / 1.4) * 0.45) * side_k
    g *= np.clip((ext - rr) / 0.8, 0, 1) ** 2
    halo = (g[..., None] * np.array((0.7, 0.8, 1.0), np.float32)).astype(np.float32)
    f, r, u = pk.sky.rect_frame(MOON_AZ, MOON_EL)
    hs = MOON_SIZE * ext
    pk.sky.add_rect_layer('moon_halo', pk.np_image('pk_moon_halo', halo), f, r, u, hs, hs, gain=MOON_HALO,
                          feather=0.0, blend='add', web=dict(key='05_moon_halo_r3', make=lambda a=halo: (a, 1.0 / float(a.max()))))
    pk.log('moon lit limb angle %.1f deg' % lit)
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.name.startswith('MoonLight'):
            o.data.specular_factor = 0.15
    # Comet McNaught (real photograph): its curved dust fan, plus a straight blue ion tail and a
    # tight nucleus, tail pointing away from the sun below the dawn horizon
    hd = pk.sky_dir(COMET_AZ, COMET_EL)
    f, r, u = pk.sky.rect_frame(COMET_AZ, COMET_EL)
    away = hd - sd
    roll = -math.degrees(math.atan2(away.dot(r), away.dot(u)))
    import numpy as np

    def tail_plate(name, img, length, width, roll_deg, gain, key):
        # rect whose bottom edge centre sits on the head and whose up axis follows the tail
        phi = math.radians(-roll_deg)
        d = length * 0.5
        caz = COMET_AZ + d * math.sin(phi) / math.cos(math.radians(COMET_EL + d * math.cos(phi)))
        cel = COMET_EL + d * math.cos(phi)
        ff, rr, uu = pk.sky.rect_frame(caz, cel, roll_deg)
        pk.sky.add_rect_layer(name, img, ff, rr, uu, width, length, gain=gain, feather=0.0, blend='add',
                              web=dict(key=key, make=lambda a=img_arr[name]: (a, 1.0 / max(float(a.max()), 1e-6))))
    img_arr = {}
    ch = 1457.0
    vf = COMET_LEN
    dd = vf * 0.4736
    phi = math.radians(-(roll + 7.0))
    pk.sky.photo_plate(os.path.join(PLATES, 'comet_mcnaught.tif'),
                       center_az=COMET_AZ + dd * math.sin(phi) / math.cos(math.radians(COMET_EL + dd / 2)),
                       center_el=COMET_EL + dd * math.cos(phi),
                       hfov_deg=vf * 580.0 / ch, vfov_deg=vf, roll_deg=roll + 7.0, gain=COMET_GAIN, gamma=1.0,
                       feather=0.06, blend='add', name='comet', colorspace='sRGB')
    # ion tail: narrow, straight, blue, exponential fade along the length
    n_w, n_l = 48, 512
    yy, xx = np.mgrid[0:n_l, 0:n_w].astype(np.float32)
    t = 1.0 - (yy + 0.5) / n_l                     # 0 at the head (bottom row) .. 1 at the end
    xc = (xx + 0.5 - n_w / 2) / (n_w / 2)
    widen = 0.18 + 0.82 * t
    prof = np.exp(-(xc / (0.22 * widen)) ** 2) * np.exp(-t * 3.2) * np.clip(t * 40.0, 0, 1)
    streaks = 1.0 + 0.25 * np.sin(xc * 23.0 + t * 7.0) * np.clip(t * 3, 0, 1)
    ion = (prof * streaks)[..., None] * np.array((0.35, 0.62, 1.0), np.float32)
    img_arr['comet_ion'] = ion.astype(np.float32)
    tail_plate('comet_ion', pk.np_image('pk_comet_ion', img_arr['comet_ion']), COMET_LEN * 1.15, 0.9, roll,
               ION_GAIN, '05_comet_ion')
    # nucleus and inner coma (a few pixels, faintly green as real comae are)
    n = 64
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) - (n - 1) / 2.0
    rr = np.hypot(xx, yy)
    core = np.exp(-(rr / 1.6) ** 2) + 0.18 * np.exp(-(rr / 6.0) ** 2)
    arr = np.stack([core * 0.85, core * 1.0, core * 0.88], 2).astype(np.float32)
    img = pk.np_image('pk_comet_nucleus', arr)
    f, r, u = pk.sky.rect_frame(COMET_AZ, COMET_EL, roll)
    pk.sky.add_rect_layer('comet_nucleus', img, f, r, u, 0.7, 0.7, gain=NUCLEUS_GAIN, feather=0.0, blend='add',
                          web=dict(key='05_comet_nucleus_r3', make=lambda a=arr: (a, 1.0)))
    pk.log('comet roll %.1f deg' % roll)
    pk.sky.set_grade(exposure=SKY_EXP, contrast=SKY_CON, saturation=SKY_SAT, tint=SKY_TINT)
    # warm light dome of the lit town, rising from the skyline and gone by 16 deg
    pk.sky.set_horizon_glow(color=(1.0, 0.42, 0.14), strength=DOME, height_deg=16.0)
    pk.sky.set_lighting(gain=0.04, tint=(0.7, 0.82, 1.0), ambient=(0.03, 0.055, 0.24))


AIRGLOW = 0.6
TRACE_MAX_ROUGH = 0.4
SPLIT_LO = (0.84, 0.9, 1.25)
SKY_INTERP = 'Closest'
MOON_HALO = 0.06
ROAD_STREAK = 1.0
HAZE = 0.0012
DOME = 0.05
MOON_AZ, MOON_EL, MOON_SIZE = -9.0, 27.0, 2.4
COMET_AZ, COMET_EL, COMET_LEN = 9.0, 15.5, 7.5
COMET_GAIN, ION_GAIN, NUCLEUS_GAIN = (0.95, 0.88, 0.7), 0.16, 1.3

# Kit workaround: rect layers are exported additively, but the photo plate replaces the
# all-sky layers under it in Blender. The viewer honours "add": false (composite over the
# layers before it with the feather mask), so set it on the plate after the kit writes sky.json.
_kit_export_json = pk.sky.export_json


def _export_json(path):
    import json
    _kit_export_json(path)
    with open(path) as fh:
        data = json.load(fh)
    for L in data.get('layers', []):
        if L.get('name') == MW_NAME:
            L['add'] = False
    with open(path, 'w') as fh:
        json.dump(data, fh, indent=2)


pk.sky.export_json = _export_json


def path_s_near(path, p):
    best, bs = 1e9, 0.0
    for s in range(-20, int(path.length), 2):
        d = (path.at(s) - Vector(p)).length
        if d < best:
            best, bs = d, s
    return bs


def near_stall(path, p):
    s = path_s_near(path, p)
    return any(abs(s - ss) < 3.6 and side_of(path, p) == sd for ss, sd, _, _ in STALLS)


def in_inn_zone(path, p):
    """Inside the inn's footprint or its forecourt (keeps scattered props out of the hero)."""
    return (INN_S0 - INN_W / 2 - 9 < path_s_near(path, p) < INN_S0 + INN_W / 2 + 1) and side_of(path, p) > 0


def side_of(path, p):
    s = path_s_near(path, p)
    return 1 if (Vector(p) - path.at(s)).dot(path.right(s)) > 0 else -1


def report(ctx, path):
    """Log camera yaw and where key landmarks sit in frame at a few times."""
    from bpy_extras.object_utils import world_to_camera_view
    sc = ctx.scene
    cam = ctx.camera
    marks = {'innL': path.offset(INN_S0 - INN_W / 2, INN_FACE, 4.0),
             'innR': path.offset(INN_S0 - INN_W / 2, INN_FACE + INN_D, 4.0),
             'innEnd': path.offset(INN_S0 + INN_W / 2, INN_FACE, 4.0),
             'tower': path.offset(TOWER_S, TOWER_LAT, 12.0), 'ltower': path.offset(LTOWER_S, LTOWER_LAT, 22.0)}
    for k, (ss, sd, lat, _) in enumerate(STALLS):
        marks['stall%d' % k] = path.offset(ss, sd * lat, 1.5)
    sky_marks = {'moon': (MOON_AZ, MOON_EL), 'comet': (COMET_AZ, COMET_EL), 'core': (CORE_AZ, CORE_EL)}
    for t in (0.0, 1.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 9.5, 12.0, 14.0):
        sc.frame_set(int(round(ctx.t2f(t))))
        yaw = math.degrees(math.atan2(-cam.matrix_world[0][2], -cam.matrix_world[1][2]))
        s = ctx.s_of_t(t)
        txt = []
        cpos = cam.matrix_world.translation
        allm = dict(marks)
        for k, (az, el) in sky_marks.items():
            allm[k] = cpos + pk.sky_dir(az, el) * 3000.0
        for k, p in allm.items():
            v = world_to_camera_view(sc, cam, Vector(p))
            txt.append('%s=(%.2f,%.2f%s)' % (k, v.x, v.y, '' if v.z > 0 else ' behind'))
        pk.log('t=%.1f s=%.1f yaw=%.1f %s' % (t, s, yaw, ' '.join(txt)))
        # sky plate coverage: smallest uv margin over camera rays above the low skyline
        th_p = math.tan(math.radians(MW_J['hfov_deg']) / 2)
        tv_p = math.tan(math.radians(MW_J['vfov_deg']) / 2)
        pf, pr, pu = pk.sky.rect_frame(MW_J['center_az'], MW_J['center_el'], 0.0)
        tvc = math.tan(cam.data.angle_y / 2) if cam.data.sensor_fit == 'VERTICAL' else math.tan(cam.data.angle / 2) * 16 / 9
        thc = tvc * 9 / 16
        Rm = cam.matrix_world.to_3x3()
        worst = 9.0
        for iy in range(41):
            for ix in range(21):
                x, y = -1 + 2 * ix / 20, -1 + 2 * iy / 40
                d = (Rm @ Vector((x * thc, y * tvc, -1.0))).normalized()
                el = math.degrees(math.asin(d.z))
                if el < 3.0:
                    continue
                df = d.dot(pf)
                uu = 0.5 + d.dot(pr) / df / (2 * th_p)
                vv = 0.5 + d.dot(pu) / df / (2 * tv_p)
                worst = min(worst, uu, 1 - uu, vv, 1 - vv)
        pk.log('   plate margin %.3f' % worst)
    sc.frame_set(1)


pk.main(SLUG, build)
