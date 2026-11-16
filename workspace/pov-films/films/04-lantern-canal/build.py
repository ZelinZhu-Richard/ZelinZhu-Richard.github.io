"""04-lantern-canal: from the bow of a small wooden boat, gliding down a lantern-lit canal
between stacked houses at the end of twilight, the Milky Way rising over the far end.

Run (from workspace/pov-films):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
    -P films/04-lantern-canal/build.py -- --stills 1.0,4.0,7.0,9.5 --scale 0.5

Env: POV04_QUICK=sky builds only camera, water, bow and sky (fast sky checks);
     POV04_DEBUG=1 prints where the landmarks land in the frame at the still times;
     POV04_SKYDEBUG=1 paints the sky magenta wherever the photo plate does not reach;
     POV04_SKYDEBUG=2 coverage mask: the plate becomes flat blue, uncovered sky stays pure
                      green (count it with a pixel test, e.g. G > 40, R and B < 0.3 G);
     POV04_SKYEXP=<ev> overrides the sky grade exposure (default -0.1);
     POV04_CORE=az,el,roll  POV04_MAG=<x>  POV04_MIRROR=0|1  POV04_DOME=<strength> override the
                      plate placement, magnification, mirroring and the town light dome.
"""
import os
import sys
import math
import random

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'kit'))
import povkit as pk  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402

SLUG = '04-lantern-canal'
QUICK = os.environ.get('POV04_QUICK', '')
DEBUG = os.environ.get('POV04_DEBUG', '')

# ----------------------------------------------------------------------------- palette
AMBER = (1.0, 0.48, 0.12)
WARM_WIN = (1.0, 0.6, 0.26)
PEACH_WIN = (1.0, 0.48, 0.3)
GOLD_WIN = (1.0, 0.72, 0.36)
CYAN_WIN = (0.42, 0.78, 1.0)
PINK_WIN = (1.0, 0.42, 0.72)
VERMILION = (1.0, 0.16, 0.05)
ORANGE = (1.0, 0.4, 0.08)
CORAL = (1.0, 0.3, 0.38)
MAGENTA = (1.0, 0.14, 0.55)
GOLD = (1.0, 0.68, 0.2)
TEAL = (0.15, 0.85, 1.0)
VIOLET = (0.55, 0.32, 1.0)
COBALT = (0.15, 0.35, 1.0)

# facades: cool indigo/teal/violet plasters mixed with warm ochre, terracotta and cream
# (all-lavender walls read as a blockout); timber houses use dark vertical boards
PLASTER = [(0.12, 0.17, 0.4), (0.07, 0.25, 0.32), (0.22, 0.16, 0.38), (0.58, 0.38, 0.2),
           (0.5, 0.2, 0.13), (0.62, 0.55, 0.44), (0.1, 0.13, 0.28), (0.36, 0.17, 0.26)]
FAR_PLASTER = [(0.1, 0.14, 0.34), (0.07, 0.2, 0.28), (0.18, 0.13, 0.32), (0.4, 0.27, 0.16),
               (0.34, 0.15, 0.12), (0.42, 0.38, 0.33), (0.08, 0.1, 0.24), (0.26, 0.12, 0.2)]
NOREN = [(0.05, 0.08, 0.3), (0.5, 0.05, 0.04), (0.04, 0.22, 0.24), (0.32, 0.06, 0.22)]
ROOFS = [(0.035, 0.07, 0.1), (0.05, 0.05, 0.12), (0.09, 0.035, 0.06), (0.03, 0.09, 0.08)]
TRIM = (0.72, 0.68, 0.62)
WOOD_PAINT = [(0.5, 0.08, 0.06), (0.06, 0.3, 0.32), (0.1, 0.14, 0.38), (0.42, 0.26, 0.08),
              (0.28, 0.1, 0.3)]

# canal cross-section (lateral metres from the centre line, z up, water at z = 0)
WALL = 4.5           # canal walls
QUAY_Z = 0.95        # top of the walls / walkway
RIGHT_FRONT = 6.5    # facades on the right bank (walkway in front)
LEFT_FRONT = -4.6    # facades on the left bank (rising from the water)

# key stations (arc length along the canal, metres)
BRIDGE_A = 27.0
BRIDGE_B = 84.0
TEAHOUSE_S = 53.0
TOWER_S = 186.0
SPEED = 4.2

# sky placement (azimuth from the initial heading, elevation)
# round 3: core high in the upper left, the band descending diagonally to the far end of the
# canal (was core just above the far roofs, band rising to the upper left, where the plate's
# left edge came into view once the magnification dropped)
CORE_AZ, CORE_EL, PLATE_ROLL = [float(v) for v in os.environ.get('POV04_CORE', '9,16,-112').split(',')]
PLATE_MIRROR = os.environ.get('POV04_MIRROR', '1') == '1'
PLATE_MAG = float(os.environ.get('POV04_MAG', '1.38'))   # was 1.65: critics read it as upscaled
MOON_AZ, MOON_EL = 11.0, 29.0            # was 15.5 / 30: nearer the centre (no edge stretch)
MOON_SIZE = 2.1                          # was 3.3 degrees
MOON_EARTHSHINE = 0.045                  # was 0.012 (a black disc)
MOON_HALO = 0.05
MOON_LIGHT = 0.5
GLOW_AZ = 8.0

PLATE = os.path.join(pk.ASSETS, 'sky', 'eso-potw1713a', 'potw1713a.tif')
PLATE_CROP = (0, 0, 5012, 7400)          # x0, y0, x1, y1 in source pixels (sky only, y < 0.8)
PLATE_CORE_PX = (852.0, 2370.0)          # galactic core bulge in the source
PLATE_FPX = 4400.0                       # focal length in source pixels (77 px / deg)
PLATE_PXDEG = 31.0                       # processed plate: px per degree (about 1.1 x output)
PLATE_VER = 'v4'
STAR_CUT = 82.0                          # percentile of star pixels faded out (was 72)
STAR_SAT = 0.22                          # star saturation (was 0.3)
SKY_FADE = (0.22, 0.6, 18.0)             # star floor, glow floor at the horizon, over degrees
SKY_BG = (0.0021, 0.0028, 0.0082)        # was (0.0016, 0.0024, 0.0115): less blue cast
SKY_CONTRAST = 1.36
SKY_SAT = 0.72                           # was 0.85: cooler, less rust-brown dust
SKY_TINT = (0.84, 0.9, 1.18)             # was (0.76, 0.87, 1.3)
SKY_DOME = float(os.environ.get('POV04_DOME', '0.07'))
BOW_X = -0.17                            # the eye sits right of the boat's centre line
BOW_COVER = 0.125                        # bow tip height in the frame (was 0.145)
# bow lantern centre in the frame (x, y from the bottom). Round 4: FY 0.27 -> 0.215, because
# kit/finish.py draws the end card's cap band at 0.715 from the top (0.285 from the bottom),
# right over the lantern; the paper body now sits about 30 px below the card's descenders.
LANTERN_FX, LANTERN_FY = 0.235, 0.215
BOW_LANTERN_W = 14.0
EYE = 1.25
# round 5: boat motion (amplitude in deg or m, period s, phase rad). Until round 4 the camera
# carried all of it and the bow was rigid in frame, so the foreground read as a dolly with no
# buoyancy. Now a seated rower's head follows only part of the boat's rock (HEAD_FOLLOW; people
# level their heads), and the rest shows as the bow rocking in the frame (`bow_rock`), about a
# pivot near the waterline under the boat's middle. The camera's own motion is almost what it
# was (roll 1.2 -> 1.05 deg, pitch 0.6, yaw 0.5).
BOAT_HEAVE = [(0.016, 2.9, 0.4), (0.006, 1.7, 2.0)]      # m; the eye rides it fully
BOAT_ROLL = [(2.1, 4.2, 1.1), (0.5, 2.3, 0.3)]
BOAT_PITCH = [(1.1, 3.3, 2.2)]
BOAT_YAW = [(0.9, 6.5, 0.9)]
HEAD_FOLLOW = dict(roll=0.5, pitch=0.55, yaw=0.55)
BOW_HEAVE = [(0.008, 2.9, -0.5)]                         # m; the torso gives, so the bow bobs
ROCK_PIVOT = (BOW_X, 0.6, -EYE + 0.1)                    # car frame, under the boat's middle
LANTERN_SWING = (7.0, 1.9, 6.5, 2.45)                    # deg fore-aft @ s, sideways @ s (was 4.5, 3)
# round 5: the vault under bridge A read as a flat, evenly lit beige slab filling the top of the
# frame for 1.5 s. ARCH_GLOW (the only light on the soffit: two lights 0.6 m under the crown,
# 45 W until round 4) now sits inside each crown lantern, ARCH_GLOW_DROP under the crown, so
# the soffit gets a pool there that falls off along the barrel and down the haunches
ARCH_GLOW = 18.0
ARCH_GLOW_DROP = 0.32
SKY_EXPOSURE = float(os.environ.get('POV04_SKYEXP', '-0.1'))
AMBIENT = (0.005, 0.009, 0.04)           # round 3 (was 0.008, 0.015, 0.065): deeper shadows
FILL_SUN = 0.08                          # was 0.12
WASH_W = 420.0                           # was 700: less flat coloured fill on the facades
BRIDGE_RAKE = 900.0
MIST = 0.009                             # was 0.012
HAZE = 0.0006                            # was 0.0011: the haze lifted the shadows violet
STREAK_PX = 90                           # comp road_streak length (px at full resolution)
STREAK_SHIFT = 0.45                      # round 4: streaks hang below their light (fraction of size)
WATER_AOV = 'pk04water'                  # round 4: water mask for the streak source

# ----------------------------------------------------------------------------- web edition only
# Everything in this block is read by the --export-web path alone (after any stills or frames
# in the same run), so the film render never sees it.
WEB_WATER_ROUGH = 0.1        # canal roughness in the glTF (the viewer blurs the mirror by it)
WEB_WATER_STREAK = 3.0       # canal extras: mirror_streak (the viewer's water default is 0.5)
WEB_WATER_RIPPLE = 1.0       # canal extras: mirror_ripple
WEB_BAKE_PX = 1024           # emission bake size for the paper animals and the big lantern
WEB_BAKE_GAIN = 0.85         # bake emission scale, keeps the 8-bit texture under 1.0
WEB_BAKE_EMIT = 0.78         # web emission strength = film strength x this (after the bake gain),
WEB_BAKE_EMIT_LANTERN = 0.88  # paper animals / big lantern; matched to the stills' luma under Neutral
_WEB_BAKE = {}               # material name -> (material function, args, kwargs)
# dressed-stone materials that get a baked, tiling block texture in the web edition:
# name -> (colour, (brick width, row height) as in stone_mat, bricks across, rows up the tile)
WEB_STONE_TILES = {'PK04_BridgeStone': ((0.16, 0.135, 0.112), (0.3, 0.15), 12, 24),
                   'PK04_Stone': ((0.24, 0.26, 0.34), (0.62, 0.3), 8, 16),
                   'PK04_StoneLight': ((0.4, 0.37, 0.34), (0.7, 0.32), 8, 16)}
WEB_STONE_PX = 1024

# round 3: the paper animals swim along keyed paths (t, s, lateral, z, yaw) with Bezier
# easing. The whale is the hero: far and high in the upper third at 1 s, above bridge A at
# 4 s, swooping low and big across the canal at 7 s, gliding overhead at about 8.5 s. The
# gold koi crosses the far canal; the bird circles high on the right.
# kind, colour, emission, length, koi markings, inner light (W), keys
ANIMALS = [('whale', (0.3, 0.8, 1.0), 1.9, 7.2, None, 1300.0,
            [(0.0, 61.0, -6.2, 22.0, 74.0), (1.0, 59.0, -5.0, 21.4, 74.0), (4.0, 53.0, -3.6, 17.2, 72.0),
             (7.0, 48.5, -1.7, 9.6, 70.0), (9.5, 45.5, -0.4, 8.8, 68.0), (14.0, 41.5, 3.5, 9.2, 66.0)]),
           ('koi', (1.0, 0.62, 0.12), 4.6, 3.0, (1.0, 0.18, 0.06), 320.0,
            [(0.0, 51.0, 6.0, 10.5, -74.0), (4.0, 54.0, 3.6, 10.4, -76.0), (7.0, 56.0, 2.0, 10.2, -78.0),
             (9.5, 59.0, -1.0, 9.6, -80.0), (14.0, 63.0, -4.0, 10.0, -82.0)]),
           ('bird', (1.0, 0.42, 0.4), 6.0, 2.1, None, 180.0,
            [(0.0, 60.0, 9.5, 13.0, 120.0), (5.0, 62.0, 8.6, 14.6, 105.0), (9.5, 66.0, 5.9, 13.9, 95.0),
             (14.0, 67.0, 2.5, 12.4, 85.0)])]


def rad(d):
    return math.radians(d)


# ============================================================================ helpers

def frame_at(path, s, lat=0.0, z=0.0, yaw=0.0):
    """World matrix of a canal-aligned frame (X right of travel, Y along, Z up)."""
    return path.frame(s) @ Matrix.Translation((lat, 0.0, z)) @ Matrix.Rotation(rad(yaw), 4, 'Z')


def empty(name, coll, M=None):
    e = bpy.data.objects.new(name, None)
    pk._link(e, coll)
    if M is not None:
        e.matrix_world = M
    return e


def add_sines(ob, data_path, index, terms, k=1.0, deg=True, fps=24.0):
    """Additive sine generators on a keyed channel; terms are (amplitude, period s, phase rad),
    amplitudes in degrees when `deg`, each scaled by k."""
    for fc in pk.fcurves(ob, data_path, index):
        for amp, per, ph in terms:
            g = fc.modifiers.new('FNGENERATOR')
            g.function_type = 'SIN'
            g.amplitude = (rad(amp) if deg else amp) * k
            g.phase_multiplier = 2 * math.pi / (per * fps)
            g.phase_offset = ph
            g.use_additive = True


def attach(ob, parent, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    ob.parent = parent
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.location = loc
    ob.rotation_euler = tuple(rad(a) for a in rot)
    if scale is not None:
        ob.scale = scale if hasattr(scale, '__len__') else (scale, scale, scale)
    return ob


def bm_obj(name, bm, mats, coll, smooth=True, sharp=35.0, edges=True, box_uv=False, recalc=True):
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
        if sharp:
            me.set_sharp_from_angle(angle=rad(sharp))
    for m in mats:
        me.materials.append(m)
    if box_uv:
        pk._box_uv(me)
    if edges and len(me.vertices):
        pk.edge_mask(me, gain=2.5)
    ob = bpy.data.objects.new(name, me)
    pk._link(ob, coll)
    return ob


def bm_box(bm, center, size, mi=0, rot_x=0.0, rot_z=0.0, rot_y=0.0):
    ret = bmesh.ops.create_cube(bm, size=1.0)
    vs = ret['verts']
    M = Matrix.Translation(center) @ Matrix.Rotation(rad(rot_z), 4, 'Z') @ \
        Matrix.Rotation(rad(rot_x), 4, 'X') @ Matrix.Rotation(rad(rot_y), 4, 'Y') @ \
        Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    bmesh.ops.transform(bm, matrix=M, verts=vs)
    for f in {f for v in vs for f in v.link_faces}:
        f.material_index = mi
    return vs


def bm_lathe(bm, profile, segs=24, mi=0, M=None, cap_bottom=True, cap_top=True):
    """Revolve [(r, z)] around Z into bm (shared pole vertices); M transforms the result."""
    rings = []
    newv = []
    for (r, z) in profile:
        if r < 1e-6:
            v = bm.verts.new((0.0, 0.0, z))
            newv.append(v)
            rings.append([v] * segs)
        else:
            ring = []
            for j in range(segs):
                a = 2 * math.pi * j / segs
                v = bm.verts.new((r * math.cos(a), r * math.sin(a), z))
                ring.append(v)
                newv.append(v)
            rings.append(ring)
    for i in range(len(profile) - 1):
        for j in range(segs):
            j2 = (j + 1) % segs
            q = [rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]]
            u = []
            for v in q:
                if v not in u:
                    u.append(v)
            if len(u) >= 3:
                f = bm.faces.new(u)
                f.material_index = mi
    if cap_bottom and profile[0][0] > 1e-6:
        f = bm.faces.new(list(reversed(rings[0])))
        f.material_index = mi
    if cap_top and profile[-1][0] > 1e-6:
        f = bm.faces.new(rings[-1])
        f.material_index = mi
    if M is not None:
        bmesh.ops.transform(bm, matrix=M, verts=newv)
    return newv


def bm_prism(bm, poly, a0, a1, axis='y', mi=0):
    """Extrude a 2D polygon. axis 'y': poly is (x, z), extruded from y=a0 to a1.
    axis 'x': poly is (y, z), extruded along x."""
    def P(p, a):
        return (p[0], a, p[1]) if axis == 'y' else (a, p[0], p[1])
    A = [bm.verts.new(P(p, a0)) for p in poly]
    B = [bm.verts.new(P(p, a1)) for p in poly]
    fs = [bm.faces.new(A), bm.faces.new(list(reversed(B)))]
    n = len(poly)
    for i in range(n):
        i2 = (i + 1) % n
        fs.append(bm.faces.new((A[i], A[i2], B[i2], B[i])))
    for f in fs:
        f.material_index = mi
    return A + B


def tube_bm(bm, pts, radius, segs=8, mi=0):
    """Round tube along a polyline into bm (simple parallel-transport frames); radius may be
    a float or one value per point (tapering)."""
    P = [Vector(p) for p in pts]
    n = len(P)
    if not hasattr(radius, '__len__'):
        radius = [radius] * n
    T = [(P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized() for i in range(n)]
    up = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    N = T[0].cross(up).normalized()
    rings = []
    for i in range(n):
        if i > 0:
            q = T[i - 1].rotation_difference(T[i])
            N = (q @ N).normalized()
        B = T[i].cross(N).normalized()
        ring = [bm.verts.new(P[i] + (N * math.cos(2 * math.pi * j / segs) +
                                     B * math.sin(2 * math.pi * j / segs)) * radius[i])
                for j in range(segs)]
        rings.append(ring)
    for i in range(n - 1):
        for j in range(segs):
            j2 = (j + 1) % segs
            f = bm.faces.new((rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]))
            f.material_index = mi
    for ring in (rings[0], rings[-1]):
        f = bm.faces.new(ring)
        f.material_index = mi


def strip(path, lat0, lat1, z0, z1, s0, s1, mat, name, coll, step=0.5, across=2):
    """Flat strip beside the canal; UV = (lateral m, along m)."""
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
                uvs.append((lat0 + (lat1 - lat0) * jj / across, ss[ii] - s0))
    ob = pk.mesh_object(name, verts, faces, uvs=uvs, material=mat, collection=coll)
    return ob


def animate_noise(ob, loc_amp=(0.0, 0.0, 0.0), rot_amp=(0.0, 0.0, 0.0), scale_frames=60.0,
                  seed=0):
    """Gentle deterministic bobbing (noise F-modifiers on location/rotation)."""
    rng = random.Random(seed)
    for ax in range(3):
        if loc_amp[ax] > 0:
            ob.keyframe_insert('location', index=ax, frame=1)
        if rot_amp[ax] > 0:
            ob.keyframe_insert('rotation_euler', index=ax, frame=1)
    for fc in pk.fcurves(ob, 'location'):
        a = loc_amp[fc.array_index]
        if a > 0:
            m = fc.modifiers.new('NOISE')
            m.scale = scale_frames * rng.uniform(0.8, 1.3)
            m.strength = a * 2
            m.phase = rng.uniform(0, 100)
    for fc in pk.fcurves(ob, 'rotation_euler'):
        a = rot_amp[fc.array_index]
        if a > 0:
            m = fc.modifiers.new('NOISE')
            m.scale = scale_frames * rng.uniform(0.8, 1.3)
            m.strength = rad(a) * 2
            m.phase = rng.uniform(0, 100)


def key_path(ctx, ob, path, keys, roll=0.0):
    """Key a canal-relative path [(t, s, lateral, z, yaw)] on ob (Bezier, linear extrapolation)."""
    for (t, s_, lat, z, yaw) in keys:
        ob.matrix_world = frame_at(path, s_, lat, z, yaw)
        ob.rotation_euler.x += rad(roll)
        ob.keyframe_insert('location', frame=ctx.t2f(t))
        ob.keyframe_insert('rotation_euler', frame=ctx.t2f(t))
    for fc in pk.fcurves(ob):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
        fc.extrapolation = 'LINEAR'
        fc.update()


def add_drift(ob, loc_amp=(0.0, 0.0, 0.0), rot_amp=(0.0, 0.0, 0.0), scale_frames=60.0, seed=0):
    """Noise F-modifiers on already keyed location/rotation curves (gentle bob and sway)."""
    rng = random.Random(seed)
    for dp, amps, k in (('location', loc_amp, 1.0), ('rotation_euler', rot_amp, math.pi / 180.0)):
        for fc in pk.fcurves(ob, dp):
            a = amps[fc.array_index]
            if a > 0:
                m = fc.modifiers.new('NOISE')
                m.blend_type = 'ADD'
                m.scale = scale_frames * rng.uniform(0.8, 1.3)
                m.strength = a * k * 2
                m.offset = -0.5 * a * k * 2 * 0
                m.phase = rng.uniform(0, 100)


# ============================================================================ materials

_MATS = {}


def cached(key, fn):
    if key not in _MATS:
        _MATS[key] = fn()
    return _MATS[key]


def water_mat():
    m, nt, out = pk._new_mat('PK04_Water')
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    t = pk.time_value(nt)
    # long swell whose crests run across the canal, drifting with the flow
    p1 = pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', U, 0.22),
                     pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'ADD', V, pk.math_(nt, 'MULTIPLY', t, 0.45)), 0.9),
                     pk.math_(nt, 'MULTIPLY', t, 0.1))
    n1, _ = pk.noise(nt, p1, scale=1.0, detail=2.0, rough=0.5)
    # ripples (shorter fore-aft than across, so mirrored lights stretch vertically)
    p2 = pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', U, 0.8),
                     pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'SUBTRACT', V, pk.math_(nt, 'MULTIPLY', t, 0.25)), 4.2),
                     pk.math_(nt, 'MULTIPLY', t, 0.35))
    n2, _ = pk.noise(nt, p2, scale=1.0, detail=3.0, rough=0.55)
    # fine fore-aft ridges: smear every reflection into a streak
    p3 = pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', U, 1.1),
                     pk.math_(nt, 'MULTIPLY', V, 26.0), pk.math_(nt, 'MULTIPLY', t, 0.6))
    n3, _ = pk.noise(nt, p3, scale=1.0, detail=2.0, rough=0.6)
    # two-scale ripples without a hard remap (the crisp band remap broke reflections into
    # blocky terraces); crests run across the canal so every light mirrors as a long streak
    nrm = pk.bump(nt, n1, strength=0.25, distance=0.08)
    nrm = pk.bump(nt, n2, strength=0.32, distance=0.02, normal=nrm)
    nrm = pk.bump(nt, n3, strength=0.22, distance=0.005, normal=nrm)
    cv, _ = pk.noise(nt, pk.comb_xyz(nt, U, V, 0.0), scale=0.08, detail=2.0)
    col = pk.mix_col(nt, cv, (0.004, 0.012, 0.016), (0.008, 0.012, 0.024))
    rough = pk.maprange(nt, n2, 0.3, 0.7, 0.025, 0.06)
    p = pk._principled(nt, base=col, rough=rough, normal=nrm, spec=0.6, ior=1.33)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    # round 4: water mask AOV for the compositor (streak_from_water_only)
    ao = nt.nodes.new('ShaderNodeOutputAOV')
    ao.aov_name = WATER_AOV
    ao.inputs['Value'].default_value = 1.0
    pk._web(m, base=(0.01, 0.02, 0.03), rough=WEB_WATER_ROUGH)
    return m


def stone_mat(color=(0.3, 0.32, 0.38), name='PK04_Stone', brick=(0.62, 0.3), wet_z=0.55,
              moss=0.35, rough=0.75, macro=0.25):
    """Dressed stone blocks (Brick texture on box UVs in metres), darker and glossier toward
    the water line, with a faint moss tint there."""
    m, nt, out = pk._new_mat(name)
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    br = pk.node(nt, 'ShaderNodeTexBrick', offset=0.5, offset_frequency=2, squash=1.0,
                 squash_frequency=2)
    pk._set(nt, br.inputs['Vector'], uv)
    c = Vector(color)
    pk._set(nt, br.inputs['Color1'], tuple(c * 0.82))
    pk._set(nt, br.inputs['Color2'], tuple(c * 1.12))
    pk._set(nt, br.inputs['Mortar'], tuple(c * 0.35))
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Mortar Size'].default_value = 0.014
    br.inputs['Mortar Smooth'].default_value = 0.4
    br.inputs['Bias'].default_value = 0.0
    br.inputs['Brick Width'].default_value = brick[0]
    br.inputs['Row Height'].default_value = brick[1]
    co = pk.texcoord(nt, 'Object')
    col = pk._jitter_color(nt, br.outputs['Color'], 0.12, co, scale=1.3)
    # per-brick tone jitter (cell id from the brick grid) and a macro stain mask so the
    # tiling never repeats visibly
    U, V, _ = pk.sep_xyz(nt, uv)
    row = pk.math_(nt, 'FLOOR', pk.math_(nt, 'DIVIDE', V, brick[1]))
    off = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'SUBTRACT', 1.0, pk.math_(nt, 'FLOORED_MODULO', row, 2.0)), 0.5)
    cellx = pk.math_(nt, 'FLOOR', pk.math_(nt, 'ADD', pk.math_(nt, 'DIVIDE', U, brick[0]), off))
    wn = pk.node(nt, 'ShaderNodeTexWhiteNoise', noise_dimensions='3D')
    pk._set(nt, wn.inputs['Vector'], pk.comb_xyz(nt, cellx, row, 0.0))
    col = pk.vmath(nt, 'MULTIPLY', col, pk.mix_col(nt, 0.12, (1, 1, 1), wn.outputs['Color']))
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, wn.outputs['Value'], 0, 1, 0.84, 1.14))
    mac, _ = pk.noise(nt, co, scale=0.35, detail=3.0, rough=0.6)
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, mac, 0.35, 0.65, 1.0 - macro, 1.0 + macro * 0.4))
    z = pk.sep_xyz(nt, pk.node(nt, 'ShaderNodeNewGeometry').outputs['Position'])[2]
    wet = pk.maprange(nt, z, wet_z - 0.35, wet_z + 0.1, 1.0, 0.0, interp='SMOOTHSTEP')
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, wet, 0, 1, 1.0, 0.32))
    mf, _ = pk.noise(nt, co, scale=3.0, detail=3.0)
    mossk = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', wet, pk.maprange(nt, mf, 0.4, 0.65)), moss)
    col = pk.mix_col(nt, mossk, col, (0.03, 0.08, 0.05))
    e = pk._edge(nt)
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', e, 0.25), col, (1, 1, 1), blend='SCREEN')
    gf, _ = pk.noise(nt, co, scale=14.0, detail=5.0, rough=0.65)
    h = pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'SUBTRACT', 1.0, br.outputs['Fac']), 0.6),
                 pk.math_(nt, 'MULTIPLY', gf, 0.4))
    nrm = pk.bump(nt, h, strength=0.35, distance=0.02)
    rv = pk.mix_f(nt, wet, pk.maprange(nt, gf, 0.3, 0.7, rough * 0.85, rough * 1.1), 0.22)
    p = pk._principled(nt, base=col, rough=rv, normal=nrm, spec=0.45)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=rough)
    return m


def pavers_mat():
    """Wet stone pavers on the quay (UV = lateral, along in metres)."""
    m, nt, out = pk._new_mat('PK04_Pavers')
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    p = pk.comb_xyz(nt, V, U, 0.0)
    br = pk.node(nt, 'ShaderNodeTexBrick', offset=0.5, offset_frequency=2)
    pk._set(nt, br.inputs['Vector'], p)
    pk._set(nt, br.inputs['Color1'], (0.07, 0.07, 0.09))
    pk._set(nt, br.inputs['Color2'], (0.11, 0.1, 0.12))
    pk._set(nt, br.inputs['Mortar'], (0.015, 0.015, 0.02))
    br.inputs['Mortar Size'].default_value = 0.012
    br.inputs['Brick Width'].default_value = 0.6
    br.inputs['Row Height'].default_value = 0.4
    pf, _ = pk.noise(nt, pk.vmath(nt, 'SCALE', p, scale=0.5), scale=1.0, detail=3.0)
    puddle = pk.maprange(nt, pf, 0.55, 0.6, 0.0, 1.0)
    col = pk.vmath(nt, 'SCALE', br.outputs['Color'], scale=pk.maprange(nt, puddle, 0, 1, 1.0, 0.6))
    gf, _ = pk.noise(nt, p, scale=20.0, detail=4.0)
    rough = pk.mix_f(nt, puddle, pk.maprange(nt, gf, 0.3, 0.7, 0.28, 0.45), 0.05)
    h = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'SUBTRACT', 1.0, br.outputs['Fac']),
                 pk.math_(nt, 'SUBTRACT', 1.0, puddle))
    nrm = pk.bump(nt, h, strength=0.3, distance=0.01)
    pr = pk._principled(nt, base=col, rough=rough, normal=nrm, spec=0.5)
    nt.links.new(pr.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.08, 0.08, 0.1), rough=0.3)
    return m


def tile_mat(color, name, mode='slab', W=1.0, D=1.0, tile_w=0.24, tile_h=0.26):
    """Glazed barrel roof tiles. mode 'slab': object X along the ridge, Y down the slope.
    mode 'hip': curved hip roof centred at the object origin with half sizes W, D."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    if mode == 'hip':
        ax = pk.math_(nt, 'DIVIDE', pk.math_(nt, 'ABSOLUTE', x), W)
        ay = pk.math_(nt, 'DIVIDE', pk.math_(nt, 'ABSOLUTE', y), D)
        front = pk.math_(nt, 'GREATER_THAN', ay, ax)
        along = pk.mix_f(nt, front, y, x)
        row = pk.mix_f(nt, front, pk.math_(nt, 'ABSOLUTE', x), pk.math_(nt, 'ABSOLUTE', y))
    else:
        along, row = x, y
    sa = pk.math_(nt, 'DIVIDE', along, tile_w)
    fa = pk.math_(nt, 'FRACT', sa)
    barrel = pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', fa, math.pi))
    sr = pk.math_(nt, 'DIVIDE', row, tile_h)
    fr = pk.math_(nt, 'FRACT', sr)
    h = pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', barrel, 0.7), pk.math_(nt, 'MULTIPLY', fr, 0.3))
    cell = pk.comb_xyz(nt, pk.math_(nt, 'FLOOR', sa), pk.math_(nt, 'FLOOR', sr), 0.0)
    wn = pk.node(nt, 'ShaderNodeTexWhiteNoise', noise_dimensions='3D')
    pk._set(nt, wn.inputs['Vector'], cell)
    tone = pk.maprange(nt, wn.outputs['Value'], 0, 1, 0.75, 1.25)
    col = pk.vmath(nt, 'SCALE', color, scale=pk.math_(nt, 'MULTIPLY', tone,
                                                      pk.maprange(nt, barrel, 0.0, 1.0, 0.55, 1.1)))
    e = pk._edge(nt)
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', e, 0.2), col, (0.6, 0.65, 0.75), blend='SCREEN')
    nrm = pk.bump(nt, h, strength=0.45, distance=0.03)
    rv = pk.maprange(nt, wn.outputs['Value'], 0, 1, 0.22, 0.4)
    p = pk._principled(nt, base=col, rough=rv, normal=nrm, coat=0.35, coat_rough=0.15, spec=0.5)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.3)
    return m


def paper_mat(color, strength, name, rib_freq=14.0, rib_axis=2, hot=None,
              patch=None, patch_scale=2.2, bake=False):
    """Glowing paper lantern: emission brightest where the paper faces the viewer, darker
    bamboo ribs every 1/rib_freq m along rib_axis (object space), fibre noise, optional
    second-colour patches (koi markings).

    bake=True (web export only, see bake_web_emission): the view-dependent facing term is
    replaced by a fixed one for a lantern seen from the side (the object normal's part across
    rib_axis), so the emission can be baked to a texture; bake=(x, y, z) uses that fixed
    object-space direction to the viewer instead."""
    m, nt, out = pk._new_mat(name)
    if hot is None:
        hot = tuple(0.55 * c + 0.45 * w for c, w in zip(color, (1.0, 0.88, 0.62)))
    co = pk.texcoord(nt, 'Object')
    a = pk.sep_xyz(nt, co)[rib_axis]
    band = pk.math_(nt, 'FRACT', pk.math_(nt, 'MULTIPLY', a, rib_freq))
    d = pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', band, 0.5))
    rib = pk.maprange(nt, d, 0.40, 0.48, 0.0, 1.0, interp='SMOOTHSTEP')
    if bake is True:
        na = pk.sep_xyz(nt, pk.texcoord(nt, 'Normal'))[rib_axis]
        side = pk.math_(nt, 'SQRT', pk.math_(nt, 'SUBTRACT', 1.0, pk.math_(nt, 'MULTIPLY', na, na), clamp=True))
        facing = pk.math_(nt, 'ADD', 0.3, pk.math_(nt, 'MULTIPLY', side, 0.7))
    elif bake:
        # a fixed object-space direction to the viewer (a lantern that rides with the camera)
        facing = pk.math_(nt, 'ABSOLUTE', pk.vmath(nt, 'DOT_PRODUCT', pk.texcoord(nt, 'Normal'), tuple(bake)))
    else:
        lw = pk.node(nt, 'ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.5
        facing = pk.math_(nt, 'SUBTRACT', 1.0, lw.outputs['Facing'])
    glow = pk.maprange(nt, facing, 0.0, 1.0, 0.4, 1.0)
    base_col = color
    if patch is not None:
        pf, _ = pk.noise(nt, co, scale=patch_scale, detail=2.0, rough=0.5)
        pm = pk.maprange(nt, pf, 0.5, 0.56, 0.0, 1.0)
        base_col = pk.mix_col(nt, pm, color, patch)
    hotk = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'POWER', facing, 3.0), 0.3)
    col = pk.mix_col(nt, hotk, base_col, hot)
    nf, _ = pk.noise(nt, co, scale=40.0, detail=3.0)
    fib = pk.maprange(nt, nf, 0.3, 0.7, 0.85, 1.08)
    e = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', glow, fib),
                 pk.math_(nt, 'SUBTRACT', 1.0, pk.math_(nt, 'MULTIPLY', rib, 0.65)))
    p = pk._principled(nt, base=pk.vmath(nt, 'SCALE', base_col, scale=0.35), rough=0.75,
                       emit=col, emit_strength=pk.math_(nt, 'MULTIPLY', e, strength), spec=0.3)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=tuple(c * 0.35 for c in color), rough=0.75, emit=color, emit_strength=strength * 0.8)
    return m


def animal_paper_mat(color, strength, name, length, patch=None, patch_scale=2.0, rib_n=9.0, kind='koi',
                     seed=0.0, bake=False):
    """Paper animal lantern lit from inside: a hot warm-white centre where the paper faces
    the viewer and around the mid-body candle, deep saturated colour toward the rims, dark
    bamboo ribs (rings along the body, +Y) and wire lines along it.

    Round 3: stronger, wider ribs with a soft shadow beside each one (the frame shading the
    paper), painted detail (whale: deep blue back, pale belly with throat pleats; koi: scale
    scallops), and a candle flicker (0.88 to 1.12, about 3 Hz) on the emission.

    bake=True (web export only, see bake_web_emission): a fixed facing term for an animal seen
    in profile (the object normal's x, as Layer Weight's facing at blend 0.45) and no flicker,
    so the emission can be baked to a texture."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    if bake:
        nx = pk.math_(nt, 'ABSOLUTE', pk.sep_xyz(nt, pk.texcoord(nt, 'Normal'))[0])
        facing = pk.math_(nt, 'ADD', 0.3, pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'POWER', nx, 0.9), 0.7))
    else:
        lw = pk.node(nt, 'ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.45
        facing = pk.math_(nt, 'SUBTRACT', 1.0, lw.outputs['Facing'])
    core = pk.math_(nt, 'POWER', facing, 1.6)
    yn = pk.math_(nt, 'DIVIDE', y, length)
    lon = pk.maprange(nt, pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', yn, 0.42)), 0.0, 0.62, 1.0, 0.3)
    e = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, core, 0.0, 1.0, 0.2, 1.0), lon)
    band = pk.math_(nt, 'FRACT', pk.math_(nt, 'MULTIPLY', yn, rib_n))
    d = pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', band, 0.5))
    rib = pk.maprange(nt, d, 0.4, 0.475, 0.0, 1.0, interp='SMOOTHSTEP')
    shade = pk.maprange(nt, d, 0.22, 0.46, 0.0, 0.25, interp='SMOOTHSTEP')
    ang = pk.math_(nt, 'ARCTAN2', z, x)
    lb = pk.math_(nt, 'FRACT', pk.math_(nt, 'MULTIPLY', ang, 6.0 / math.pi))
    ld = pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', lb, 0.5))
    wire = pk.maprange(nt, ld, 0.45, 0.492, 0.0, 0.6, interp='SMOOTHSTEP')
    dark = pk.math_(nt, 'MAXIMUM', pk.math_(nt, 'MAXIMUM', pk.math_(nt, 'MULTIPLY', rib, 0.9), wire), shade)
    nf, _ = pk.noise(nt, co, scale=30.0 / max(length, 0.5), detail=3.0)
    fib = pk.maprange(nt, nf, 0.3, 0.7, 0.86, 1.1)
    base_col = color
    paint = None
    if kind == 'whale':
        zn = pk.math_(nt, 'DIVIDE', z, 0.2 * length)
        back = pk.maprange(nt, zn, -0.15, 0.35, 0.0, 1.0, interp='SMOOTHSTEP')
        base_col = pk.mix_col(nt, back, (0.42, 0.88, 1.0), (0.04, 0.3, 1.0))
        # throat pleats: dark lines along the body on the belly, front half
        pl = pk.math_(nt, 'FRACT', pk.math_(nt, 'MULTIPLY', x, 7.0 / length))
        pld = pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', pl, 0.5))
        pleat = pk.maprange(nt, pld, 0.36, 0.47, 0.0, 1.0, interp='SMOOTHSTEP')
        belly = pk.maprange(nt, zn, -0.2, -0.55, 0.0, 1.0, interp='SMOOTHSTEP')
        front = pk.maprange(nt, yn, 0.55, 0.3, 0.0, 1.0, interp='SMOOTHSTEP')
        paint = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', pleat, belly), pk.math_(nt, 'MULTIPLY', front, 0.6))
    if patch is not None:
        pf, _ = pk.noise(nt, co, scale=patch_scale, detail=2.0, rough=0.5)
        pm = pk.maprange(nt, pf, 0.5, 0.56, 0.0, 1.0)
        base_col = pk.mix_col(nt, pm, base_col, patch)
    if kind == 'koi':
        # painted scale scallops (Voronoi cells, darker rim on each)
        vd = pk.voronoi(nt, pk.vmath(nt, 'MULTIPLY', co, (1.0, 1.6, 1.0)), scale=9.0 / length,
                        feature='DISTANCE_TO_EDGE')['Distance']
        sc_ = pk.maprange(nt, vd, 0.0, 0.08, 0.35, 0.0, interp='SMOOTHSTEP')
        mid = pk.maprange(nt, yn, 0.15, 0.3, 0.0, 1.0)
        paint = pk.math_(nt, 'MULTIPLY', sc_, pk.math_(nt, 'MULTIPLY', mid, pk.maprange(nt, yn, 0.78, 0.62, 0.0, 1.0)))
    if paint is not None:
        dark = pk.math_(nt, 'MAXIMUM', dark, paint)
    # candle flicker (the film only; a baked texture holds still)
    if not bake:
        t = pk.time_value(nt)
        fl, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', t, 3.0), seed, 0.0), scale=1.0,
                         detail=1.0, dims='3D')
        flick = pk.maprange(nt, fl, 0.3, 0.7, 0.88, 1.12)
    e = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', e, fib), pk.math_(nt, 'SUBTRACT', 1.0, dark))
    if not bake:
        e = pk.math_(nt, 'MULTIPLY', e, flick)
    hot = (1.0, 0.9, 0.7)
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', core, lon), 0.42), base_col, hot)
    p = pk._principled(nt, base=pk.vmath(nt, 'SCALE', base_col, scale=0.22), rough=0.8,
                       emit=col, emit_strength=pk.math_(nt, 'MULTIPLY', e, strength), spec=0.25)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=tuple(c * 0.25 for c in color), rough=0.8, emit=color, emit_strength=strength * 0.45)
    return m


def strand_ribbons(bm, start, length, outward, rng, width=0.09, segs=10, curl=0.25, cross=True, mi=0,
                   min_z=None):
    """A hanging strand (willow switch, vine) as one or two crossed ribbons; returns its points."""
    out = Vector((outward[0], outward[1], 0.0))
    if out.length < 1e-6:
        out = Vector((1.0, 0.0, 0.0))
    out.normalize()
    side = Vector((-out.y, out.x, 0.0))
    if min_z is not None:
        length = max(0.3, min(length, start[2] - min_z))
    ph = rng.uniform(0, 6.28)
    pts = []
    for k in range(segs + 1):
        u = k / segs
        p = Vector(start) + out * (curl * math.sin(min(u * 2.2, 1.0) * math.pi * 0.5)) + \
            side * (0.06 * math.sin(u * 5.0 + ph)) + Vector((0, 0, -length * u))
        pts.append(p)
    dirs = [side, out] if cross else [side]
    for dv in dirs:
        prev = None
        for k, p in enumerate(pts):
            w = width * (1.0 - 0.55 * k / segs)
            a = bm.verts.new(p - dv * w / 2)
            b = bm.verts.new(p + dv * w / 2)
            if prev is not None:
                f = bm.faces.new((prev[0], prev[1], b, a))
                f.material_index = mi
            prev = (a, b)
    return pts


def leaf_mat(color, name):
    """Foliage for willows and vines: deep teal-green, leafy bump, soft sheen and a little
    translucency so the warm lights inside glow through."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    nf, _ = pk.noise(nt, co, scale=9.0, detail=3.0, rough=0.6)
    col = pk._jitter_color(nt, color, 0.25, co, scale=1.5)
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, nf, 0.3, 0.7, 0.7, 1.2))
    vf = pk.voronoi(nt, co, scale=28.0)['Distance']
    nrm = pk.bump(nt, vf, strength=0.35, distance=0.01)
    p = pk._principled(nt, base=col, rough=0.55, normal=nrm, sheen=0.5, sss=0.25, spec=0.4,
                       sss_radius=(0.6, 1.0, 0.4))
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.6)
    return m


def lacquer(color, name, rough=0.28):
    return pk.mat.toy_plastic(color, name=name, roughness=rough, coat=0.6, sss=0.02,
                              variation=0.04, edge_light=0.18)


def cheap_plaster(color, name):
    """Plaster for far houses: noise variation only (no AO, cheap)."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    col = pk._jitter_color(nt, color, 0.1, co, scale=0.7)
    p = pk._principled(nt, base=col, rough=0.85, spec=0.35)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.85)
    return m


AWNINGS = []


def stripe_mat(c1, c2, name, freq=3.2):
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    x = pk.sep_xyz(nt, co)[0]
    st = pk.math_(nt, 'GREATER_THAN', pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', x, freq * 2 * math.pi)), 0.0)
    col = pk.mix_col(nt, st, c1, c2)
    nf, _ = pk.noise(nt, co, scale=30.0, detail=3.0)
    nrm = pk.bump(nt, nf, strength=0.08, distance=0.004)
    p = pk._principled(nt, base=col, rough=0.75, normal=nrm, sheen=0.4)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=c1, rough=0.75)
    return m


class Mats:
    def __init__(self):
        self.water = water_mat()
        AWNINGS[:] = [stripe_mat((0.55, 0.05, 0.05), (0.75, 0.7, 0.62), 'PK04_AwnRed'),
                      stripe_mat((0.04, 0.32, 0.36), (0.75, 0.7, 0.62), 'PK04_AwnTeal'),
                      stripe_mat((0.6, 0.38, 0.05), (0.35, 0.06, 0.08), 'PK04_AwnGold'),
                      stripe_mat((0.25, 0.08, 0.4), (0.7, 0.62, 0.7), 'PK04_AwnViolet')]
        self.stone = stone_mat((0.24, 0.26, 0.34), 'PK04_Stone')
        self.stone_light = stone_mat((0.4, 0.37, 0.34), 'PK04_StoneLight', brick=(0.7, 0.32))
        # round 3: warm grey stone (about #6b625a) in smaller courses instead of violet slabs
        self.bridge = stone_mat((0.16, 0.135, 0.112), 'PK04_BridgeStone', brick=(0.3, 0.15), moss=0.55,
                                macro=0.3)
        self.vouss = stone_mat((0.22, 0.19, 0.16), 'PK04_Voussoir', brick=(5.0, 5.0), moss=0.25, macro=0.35)
        self.pavers = pavers_mat()
        self.plaster = [pk.mat.clay(c, name='PK04_Plaster%d' % i, roughness=0.82, bumps=0.3,
                                    grime=0.45) for i, c in enumerate(PLASTER)]
        self.far_plaster = [cheap_plaster(c, 'PK04_FarPlaster%d' % i) for i, c in enumerate(FAR_PLASTER)]
        self.timber = pk.mat.varnished_wood(name='PK04_Timber', light=(0.1, 0.055, 0.035),
                                            dark=(0.035, 0.02, 0.015), planks=0.16, axis='Z',
                                            roughness=0.55, varnish=0.15)
        self.noren = [pk.mat.toy_plastic(c, name='PK04_Noren%d' % i, roughness=0.8, coat=0.0, sss=0.3,
                                         variation=0.08, edge_light=0.05) for i, c in enumerate(NOREN)]
        self.willow = leaf_mat((0.05, 0.2, 0.12), 'PK04_Willow')
        self.ivy = leaf_mat((0.03, 0.12, 0.06), 'PK04_Ivy')
        self.roof = [tile_mat(c, 'PK04_Tiles%d' % i) for i, c in enumerate(ROOFS)]
        self.roof_basic = [pk.mat.basic(c, roughness=0.45, name='PK04_FarRoof%d' % i)
                           for i, c in enumerate(ROOFS)]
        self.trim = pk.mat.clay(TRIM, name='PK04_Trim', roughness=0.7, bumps=0.15, grime=0.2)
        self.wood_paint = [pk.mat.painted_wood(c, name='PK04_Paint%d' % i, wear=0.3)
                           for i, c in enumerate(WOOD_PAINT)]
        self.dark_wood = pk.mat.varnished_wood(name='PK04_DarkWood', light=(0.2, 0.09, 0.04),
                                               dark=(0.06, 0.025, 0.012), roughness=0.4)
        self.red_lacquer = lacquer((0.5, 0.04, 0.03), 'PK04_RedLacquer')
        self.black_lacquer = lacquer((0.012, 0.01, 0.012), 'PK04_BlackLacquer', rough=0.2)
        self.brass = pk.mat.metal((0.85, 0.6, 0.28), name='PK04_Brass', roughness=0.25)
        self.iron = pk.mat.metal((0.05, 0.05, 0.06), name='PK04_Iron', roughness=0.4)
        self.leaf = pk.mat.clay((0.05, 0.22, 0.16), name='PK04_Leaf', roughness=0.6, bumps=0.6,
                                grime=0.2)
        self.leaf2 = pk.mat.clay((0.1, 0.3, 0.12), name='PK04_Leaf2', roughness=0.6, bumps=0.6,
                                 grime=0.2)
        self.crown = pk.mat.toy_plastic((0.03, 0.16, 0.12), name='PK04_Crown', roughness=0.55, coat=0.1,
                                        sss=0.25, variation=0.12, edge_light=0.25)
        self.pot = pk.mat.toy_plastic((0.45, 0.14, 0.06), name='PK04_Pot', roughness=0.5)
        self.ground = pk.mat.ground((0.02, 0.03, 0.04), name='PK04_Ground', wet=0.4)
        self.hill = cheap_plaster((0.02, 0.03, 0.06), 'PK04_Hill')
        # mostly warm 2700 K interiors, a few cool; lattice, shoji and plain sashes
        self.windows = [pk.mat.lit_window(c, strength=s, name='PK04_Win%d' % i, curtains=cu,
                                          variation=0.5, mullions=mu)
                        for i, (c, s, mu, cu) in enumerate([(WARM_WIN, 10.0, (2, 2), 0.4),
                                                            (PEACH_WIN, 9.0, (3, 4), 0.1),
                                                            (GOLD_WIN, 9.0, (1, 2), 0.5),
                                                            (CYAN_WIN, 7.0, (2, 2), 0.3),
                                                            (WARM_WIN, 11.0, (4, 3), 0.0),
                                                            (GOLD_WIN, 10.0, (3, 3), 0.2),
                                                            (PINK_WIN, 7.5, (1, 1), 0.6),
                                                            (WARM_WIN, 10.5, (2, 3), 0.3)])]
        self.far_windows = [pk.mat.lit_window(c, strength=s, name='PK04_FarWin%d' % i,
                                              curtains=0.2, variation=0.6, mullions=(1, 2))
                            for i, (c, s) in enumerate([(WARM_WIN, 12.0), (GOLD_WIN, 11.0),
                                                         (CYAN_WIN, 10.0), (PINK_WIN, 10.0)])]
        self.flowers = [pk.mat.toy_plastic(c, name='PK04_Flower%d' % i, roughness=0.45,
                                           sss=0.2)
                        for i, c in enumerate([(0.85, 0.08, 0.2), (0.95, 0.4, 0.6), (0.95, 0.75, 0.2),
                                               (0.9, 0.9, 0.95)])]


# ============================================================================ props

def lantern_source(name, color, strength, coll, height=0.36, radius=0.15, string=0.12,
                   shape='oval', rib_freq=None, segs=16):
    """Paper lantern mesh with dark caps and its hanging string; origin at the hang point."""
    bm = bmesh.new()
    zs = np.linspace(0.0, 1.0, 9)
    if shape == 'oval':
        prof = [(radius * (0.42 + 0.58 * math.sin(math.pi * z) ** 0.85), -string - height + z * height)
                for z in zs]
    elif shape == 'round':
        prof = [(radius * (0.3 + 0.7 * math.sin(math.pi * z) ** 0.6), -string - height + z * height)
                for z in zs]
    else:   # cylinder
        prof = [(radius * (0.92 + 0.08 * math.sin(math.pi * z)), -string - height + z * height)
                for z in zs]
    bm_lathe(bm, prof, segs=segs, mi=0, cap_bottom=True, cap_top=True)
    cr = prof[0][0] * 1.05
    z0 = -string - height
    bm_lathe(bm, [(0.0, z0 - 0.035), (cr, z0 - 0.03), (cr, z0 + 0.012), (0.0, z0 + 0.015)], segs=segs, mi=1)
    cr2 = prof[-1][0] * 1.05
    bm_lathe(bm, [(0.0, -string - 0.012), (cr2, -string - 0.015), (cr2, -string + 0.03), (0.0, -string + 0.035)],
             segs=segs, mi=1)
    if string > 0:
        bm_lathe(bm, [(0.006, -string), (0.006, 0.0)], segs=5, mi=1)
    # tassel
    bm_lathe(bm, [(0.0, z0 - 0.035), (0.018, z0 - 0.06), (0.03, z0 - 0.16), (0.0, z0 - 0.17)], segs=6, mi=2)
    pm = paper_mat(color, strength, name + '_paper', rib_freq=rib_freq or (8.0 / height))
    ob = bm_obj(name, bm, [pm, cached('black', lambda: lacquer((0.015, 0.01, 0.01), 'PK04_Cap')),
                           cached('tassel', lambda: pk.mat.toy_plastic((0.6, 0.05, 0.04), name='PK04_Tassel',
                                                                     roughness=0.6))],
                coll, sharp=None, edges=False)
    ob.visible_shadow = False
    return ob


def lantern_string(path, s, coll, lantern_srcs, colors, lat0=LEFT_FRONT + 0.05, lat1=RIGHT_FRONT - 0.05,
                   z0=5.6, z1=5.4, sag=0.9, count=13, skew=1.2, light_every=4, energy=55.0,
                   seed=0, name='LanternString', end_lights=True):
    """A wire across the canal with paper lanterns; point lights every few lanterns."""
    p0 = path.offset(s, lat0, z0)
    p1 = path.offset(s + skew, lat1, z1)
    N = 30
    pts = []
    for i in range(N + 1):
        t = i / N
        p = p0.lerp(p1, t)
        p.z -= sag * 4 * t * (1 - t)
        pts.append(tuple(p))
    wire = pk.geo.tube_along(pts, radius=0.01, segments=6, material=cached(
        'wire', lambda: pk.mat.metal((0.02, 0.02, 0.02), roughness=0.5, name='PK04_Wire')),
        name=name + 'Wire', collection=coll)
    wire.visible_shadow = False
    rng = random.Random(seed)
    lp, al, picks = [], [], []
    for i in range(count):
        t = (i + 0.5) / count
        p = p0.lerp(p1, t)
        p.z -= sag * 4 * t * (1 - t)
        k = i % len(lantern_srcs)
        picks.append(k)
        lp.append(tuple(p))
        al.append(rng.uniform(0, 360))
    root = empty(name, coll)
    for i, (p, k) in enumerate(zip(lp, picks)):
        o = bpy.data.objects.new('%s_%d' % (name, i), lantern_srcs[k].data)
        o.location = p
        o.rotation_euler = (0, 0, rad(al[i]))
        o.parent = root
        o.visible_shadow = False
        pk._link(o, coll)
        if light_every and i % light_every == light_every // 2:
            pk.lights.point((p[0], p[1], p[2] - 0.3), colors[k], energy, radius=0.18, shadow=False,
                            name=name + '_L%d' % i, collection=coll, volume=0.15)
    if end_lights:
        # warm pools on the two facades where the wire is fixed
        for (pp, lat) in ((path.offset(s, lat0 + 0.6, z0 - 0.5), lat0), (path.offset(s + skew, lat1 - 0.6, z1 - 0.5), lat1)):
            pk.lights.point(tuple(pp), (1.0, 0.5, 0.2), 110.0, radius=0.12, shadow=s < 80.0,
                            name=name + '_End', collection=coll, volume=0.05)
    return root


def plant_sources(coll, M):
    """Potted bush, tall grass pot and a flower cluster (hidden scatter sources)."""
    out = []
    for k, (fol, pot_r, pot_h) in enumerate(((M.leaf, 0.22, 0.32), (M.leaf2, 0.17, 0.4), (M.leaf, 0.3, 0.28))):
        bm = bmesh.new()
        bm_lathe(bm, [(0.0, 0.0), (pot_r * 0.75, 0.0), (pot_r, pot_h * 0.9), (pot_r * 1.08, pot_h),
                      (pot_r * 0.95, pot_h), (0.0, pot_h * 0.92)], segs=14, mi=0)
        rng = random.Random(10 + k)
        for b in range(5 if k != 1 else 7):
            ret = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=pot_r * rng.uniform(0.75, 1.1))
            c = Vector((rng.uniform(-0.6, 0.6) * pot_r, rng.uniform(-0.6, 0.6) * pot_r,
                        pot_h + pot_r * rng.uniform(0.4, 1.4) * (1.6 if k == 1 else 1.0)))
            for v in ret['verts']:
                v.co = v.co * Vector((1.0, 1.0, 1.25 if k == 1 else 0.9)) + c
                v.co += v.co.normalized() * 0.0
                for f in v.link_faces:
                    f.material_index = 1
        ob = bm_obj('PlantSrc%d' % k, bm, [M.pot, fol], coll, sharp=None)
        out.append(ob)
    return out


def flower_sources(coll, M):
    out = []
    for k, fm in enumerate(M.flowers):
        bm = bmesh.new()
        rng = random.Random(30 + k)
        for b in range(6):
            ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=rng.uniform(0.05, 0.08))
            c = Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.06, 0.06), rng.uniform(0.0, 0.1)))
            bmesh.ops.translate(bm, verts=ret['verts'], vec=c)
            for v in ret['verts']:
                for f in v.link_faces:
                    f.material_index = 0
        for b in range(5):
            ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=rng.uniform(0.06, 0.09))
            c = Vector((rng.uniform(-0.32, 0.32), rng.uniform(-0.07, 0.07), rng.uniform(-0.04, 0.04)))
            bmesh.ops.translate(bm, verts=ret['verts'], vec=c)
            for v in ret['verts']:
                for f in v.link_faces:
                    f.material_index = 1
        out.append(bm_obj('FlowerSrc%d' % k, bm, [fm, M.leaf2], coll, sharp=None, edges=False))
    return out


def scatter_list(srcs, items, name, coll):
    """items: [(location, yaw_deg, scale, src_index)] -> linked duplicates under one Empty."""
    root = empty(name, coll)
    for s_ in srcs:
        s_.hide_render = True
        s_.hide_viewport = True
        s_['pk_noexport'] = True
    for i, (p, yaw, sc, k) in enumerate(items):
        o = bpy.data.objects.new('%s_%d' % (name, i), srcs[k % len(srcs)].data)
        o.location = p
        o.rotation_euler = (0, 0, rad(yaw))
        o.scale = (sc, sc, sc)
        o.parent = root
        pk._link(o, coll)
    return root


def lotus_source(name, color, coll):
    """Floating paper lotus lantern: a green pad, two rings of glowing paper petals and a
    candle with a flame in the middle (hidden scatter source)."""
    bm = bmesh.new()
    bm_lathe(bm, [(0.0, 0.0), (0.22, 0.0), (0.23, 0.012), (0.0, 0.018)], segs=16, mi=2)
    for (n, ln, tilt, rr, ph) in ((9, 0.15, 58.0, 0.05, 0.0), (7, 0.12, 74.0, 0.03, 0.5)):
        for k in range(n):
            ret = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
            a = 2 * math.pi * (k + ph) / n
            M = Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, rr, 0.03)) @ \
                Matrix.Rotation(rad(tilt), 4, 'X') @ Matrix.Translation((0, ln * 0.5, 0)) @ \
                Matrix.Diagonal((0.048, ln * 0.5, 0.012, 1.0))
            bmesh.ops.transform(bm, matrix=M, verts=ret['verts'])
            for v in ret['verts']:
                # pointed petal tips
                if v.co.z > 0.03:
                    pass
                for f in v.link_faces:
                    f.material_index = 0
    bm_lathe(bm, [(0.0, 0.025), (0.028, 0.025), (0.028, 0.085), (0.0, 0.085)], segs=12, mi=1)
    bm_lathe(bm, [(0.0, 0.088), (0.01, 0.1), (0.008, 0.115), (0.0, 0.135)], segs=8, mi=3)
    pm = paper_mat(color, 3.2, name + '_paper', rib_freq=40.0, rib_axis=2)
    ob = bm_obj(name, bm, [pm, cached('wax', lambda: pk.mat.basic((0.85, 0.8, 0.7), roughness=0.4,
                                                                 emission=(1.0, 0.75, 0.45), strength=0.6,
                                                                 name='PK04_Wax')),
                           # round 4: darker, less glossy pad (the candle 12 cm above it made a
                           # bright green ring that critics read as a rainbow fringe)
                           cached('pad', lambda: pk.mat.toy_plastic((0.016, 0.055, 0.03), name='PK04_Pad',
                                                                   roughness=0.55, coat=0.15)),
                           cached('flame', lambda: pk.mat.emission((1.0, 0.62, 0.22), 40.0, name='PK04_Flame'))],
                coll, sharp=None, edges=False)
    ob.visible_shadow = False
    return ob


# ============================================================================ banners

def banner_mat(c1, c2, name, motif):
    """Dyed cloth banner (object space: x across, z up, origin at the top centre): a field
    colour, a top band and an abstract dyed motif (disc, wave bands or chevron-free stripes),
    no lettering. Lit from behind it glows a little (thin cloth)."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    top = pk.math_(nt, 'GREATER_THAN', z, -0.16)
    if motif == 'disc':
        r = pk.vmath(nt, 'LENGTH', pk.comb_xyz(nt, x, 0.0, pk.math_(nt, 'ADD', z, 0.72)))
        mk = pk.maprange(nt, r, 0.17, 0.155, 0.0, 1.0)
    elif motif == 'wave':
        w = pk.math_(nt, 'SINE', pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', z, 18.0),
                                           pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', x, 16.0)), 1.2)))
        mk = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, w, 0.55, 0.65, 0.0, 1.0),
                      pk.math_(nt, 'LESS_THAN', z, -0.9))
    else:
        mk = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'GREATER_THAN', pk.math_(nt, 'ABSOLUTE', x), 0.13),
                      pk.math_(nt, 'LESS_THAN', z, -0.3))
    k = pk.math_(nt, 'MAXIMUM', top, mk)
    col = pk.mix_col(nt, k, c1, c2)
    nf, _ = pk.noise(nt, co, scale=40.0, detail=3.0)
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, nf, 0.3, 0.7, 0.88, 1.06))
    p = pk._principled(nt, base=col, rough=0.85, sheen=0.5, sss=0.0, spec=0.3)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=c1, rough=0.85)
    return m


def banner_sources(coll, M):
    """Nobori-style cloth banners on a pole with a top crossbar (hidden scatter sources),
    banner plane facing -Y, base at z = 0."""
    out = []
    specs = [((0.55, 0.06, 0.05), (0.9, 0.82, 0.68), 'disc'), ((0.05, 0.12, 0.35), (0.85, 0.8, 0.7), 'wave'),
             ((0.85, 0.75, 0.6), (0.6, 0.08, 0.06), 'stripe'), ((0.06, 0.3, 0.28), (0.9, 0.7, 0.3), 'disc'),
             ((0.45, 0.28, 0.05), (0.1, 0.06, 0.04), 'stripe')]
    for k, (c1, c2, motif) in enumerate(specs):
        bm = bmesh.new()
        bm_box(bm, (0.0, 0.0, 1.35), (0.05, 0.05, 2.7), mi=0)                      # pole
        bm_box(bm, (-0.26, 0.0, 2.55), (0.55, 0.035, 0.035), mi=0)                  # crossbar
        W_, H_ = 0.46, 1.7
        vs = []
        for j in range(9):
            zz = -H_ * j / 8
            row = []
            for i in range(5):
                xx = -W_ * i / 4
                row.append(bm.verts.new((xx - 0.04, 0.012 * math.sin(i * 1.3 + j * 0.7), 2.53 + zz)))
            vs.append(row)
        for j in range(8):
            for i in range(4):
                f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
                f.material_index = 1
        ob = bm_obj('BannerSrc%d' % k, bm, [M.dark_wood, banner_mat(c1, c2, 'PK04_Banner%d' % k, motif)], coll,
                    sharp=None, recalc=False)
        # banner object-space texture: origin at the top centre of the cloth
        out.append(ob)
    return out


# ============================================================================ townsfolk

def figure_sources(coll):
    """Toy-like townsfolk (hidden scatter sources), front = -Y, feet at z = 0: a robe, a big
    round head, hair bun or a conical straw hat, arms; one variant holds a paper lantern on a
    stick, one is a child."""
    skin = cached('skin', lambda: pk.mat.toy_plastic((0.62, 0.4, 0.3), name='PK04_Skin', roughness=0.45,
                                                     sss=0.3, variation=0.03, edge_light=0.1))
    hair = cached('hair', lambda: pk.mat.toy_plastic((0.02, 0.018, 0.02), name='PK04_Hair', roughness=0.35,
                                                     coat=0.3, sss=0.0, edge_light=0.2))
    straw = cached('straw', lambda: pk.mat.toy_plastic((0.5, 0.36, 0.16), name='PK04_Straw', roughness=0.7,
                                                      sss=0.1, variation=0.1, edge_light=0.2))
    robes = [pk.mat.toy_plastic(c, name='PK04_Robe%d' % i, roughness=0.65, coat=0.05, sss=0.15, variation=0.06,
                                edge_light=0.25)
             for i, c in enumerate([(0.05, 0.08, 0.28), (0.36, 0.05, 0.06), (0.04, 0.22, 0.22), (0.3, 0.2, 0.08),
                                    (0.2, 0.06, 0.24)])]
    sash = cached('sash', lambda: pk.mat.toy_plastic((0.75, 0.55, 0.2), name='PK04_Sash', roughness=0.5))
    lan = cached('figlan', lambda: paper_mat((1.0, 0.5, 0.18), 4.0, 'PK04_FigLantern', rib_freq=40.0))
    out = []
    for k, (h, hat, robe, hold) in enumerate(((1.55, 'bun', 0, False), (1.6, 'hat', 1, False),
                                              (1.1, 'bun', 2, False), (1.55, 'hat', 3, True),
                                              (1.5, 'bun', 4, True))):
        sc = h / 1.55
        bm = bmesh.new()
        prof = [(0.0, 0.0), (0.26, 0.0), (0.24, 0.25), (0.2, 0.6), (0.17, 0.9), (0.2, 1.08), (0.17, 1.15),
                (0.07, 1.2), (0.0, 1.21)]
        bm_lathe(bm, [(r * sc, z * sc) for r, z in prof], segs=16, mi=0)
        bm_lathe(bm, [(0.0, 0.8 * sc), (0.185 * sc, 0.8 * sc), (0.19 * sc, 0.9 * sc), (0.0, 0.9 * sc)],
                 segs=16, mi=4)                                               # sash
        ret = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.135 * sc)
        bmesh.ops.translate(bm, verts=ret['verts'], vec=(0, 0, 1.33 * sc))
        for v in ret['verts']:
            for f in v.link_faces:
                f.material_index = 1
        if hat == 'hat':
            bm_lathe(bm, [(0.0, 1.62 * sc), (0.3 * sc, 1.4 * sc), (0.29 * sc, 1.38 * sc), (0.0, 1.47 * sc)],
                     segs=20, mi=3)
        else:
            ret = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.14 * sc)
            bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0.015 * sc, 1.37 * sc)) @
                                Matrix.Diagonal((1.02, 1.02, 0.95, 1.0)), verts=ret['verts'])
            for v in ret['verts']:
                if v.co.y < -0.06 * sc and v.co.z < 1.42 * sc:
                    v.co.y = -0.06 * sc + (v.co.y + 0.06 * sc) * 0.2     # face left open
                for f in v.link_faces:
                    f.material_index = 2
            ret = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.07 * sc)
            bmesh.ops.translate(bm, verts=ret['verts'], vec=(0, 0.06 * sc, 1.5 * sc))
            for v in ret['verts']:
                for f in v.link_faces:
                    f.material_index = 2
        for sx in (-1, 1):
            if hold and sx > 0:
                tube_bm(bm, [(0.19 * sc, 0.0, 1.05 * sc), (0.24 * sc, -0.12 * sc, 0.85 * sc),
                             (0.2 * sc, -0.3 * sc, 0.82 * sc)], 0.045 * sc, segs=8, mi=0)
            else:
                tube_bm(bm, [(sx * 0.19 * sc, 0.0, 1.06 * sc), (sx * 0.24 * sc, 0.01, 0.8 * sc),
                             (sx * 0.22 * sc, -0.02, 0.6 * sc)], 0.045 * sc, segs=8, mi=0)
        if hold:
            tube_bm(bm, [(0.2 * sc, -0.3 * sc, 0.75 * sc), (0.2 * sc, -0.33 * sc, 1.2 * sc),
                         (0.2 * sc, -0.55 * sc, 1.32 * sc)], 0.012, segs=6, mi=3)
            bm_lathe(bm, [(0.0, -0.3), (0.06, -0.28), (0.085, -0.2), (0.075, -0.12), (0.0, -0.1)], segs=12, mi=5,
                     M=Matrix.Translation((0.2 * sc, -0.55 * sc, 1.32 * sc)))
        ob = bm_obj('FigSrc%d' % k, bm, [robes[robe], skin, hair, straw, sash, lan], coll, sharp=None)
        ob['hold'] = hold
        ob['h'] = sc
        out.append(ob)
    return out


def townsfolk(ctx, M, coll, path, deck):
    """A few people on bridge A, the right quay, the tea house veranda and bridge B."""
    srcs = figure_sources(coll)
    tea = frame_at(path, TEAHOUSE_S, LEFT_FRONT + 0.1, 0.0, 90.0)
    T_ = 2.8
    spots = [  # (matrix, variant, scale)
        (frame_at(path, BRIDGE_A - T_ / 2 + 0.55, -2.4, deck(-2.4), 8.0), 0, 1.0),
        (frame_at(path, BRIDGE_A - T_ / 2 + 0.6, -1.6, deck(-1.6), -6.0), 2, 1.0),
        (frame_at(path, BRIDGE_A - T_ / 2 + 0.55, 1.9, deck(1.9), -12.0), 3, 1.0),
        (frame_at(path, BRIDGE_A + 0.3, 4.6, deck(4.6), 150.0), 1, 1.0),
        (frame_at(path, 18.5, WALL + 1.25, QUAY_Z, -35.0), 4, 1.0),
        (frame_at(path, 36.5, WALL + 1.0, QUAY_Z, -70.0), 1, 1.0),
        (frame_at(path, 44.5, WALL + 1.3, QUAY_Z, 15.0), 0, 0.98),
        (frame_at(path, 45.1, WALL + 1.75, QUAY_Z, -20.0), 2, 1.0),
        (tea @ Matrix.Translation((-2.6, 0.75, 1.19)), 1, 1.0),
        (tea @ Matrix.Translation((-1.7, 0.85, 1.19)) @ Matrix.Rotation(rad(25), 4, 'Z'), 4, 1.0),
        (tea @ Matrix.Translation((1.8, 0.8, 1.19)) @ Matrix.Rotation(rad(-15), 4, 'Z'), 0, 1.0),
        (frame_at(path, BRIDGE_B - 0.85, -1.8, deck(-1.8), 5.0), 3, 1.0),
        (frame_at(path, BRIDGE_B - 0.85, 2.4, deck(2.4), -8.0), 1, 1.0),
    ]
    root = empty('Townsfolk', coll)
    for s_ in srcs:
        s_.hide_render = True
        s_.hide_viewport = True
        s_['pk_noexport'] = True
    rng = random.Random(808)
    for i, (Mx, k, sc) in enumerate(spots):
        o = bpy.data.objects.new('Person_%d' % i, srcs[k].data)
        pk._link(o, coll)
        o.matrix_world = Mx @ Matrix.Diagonal((sc, sc, sc, 1.0))
        o.parent = root
        o.matrix_parent_inverse = root.matrix_world.inverted()
        add_drift_static(o, rot_amp=(0.0, 1.2, 2.5), seed=900 + i, scale_frames=70.0)
        if srcs[k]['hold']:
            hs = srcs[k]['h']
            lp = Mx @ Vector((0.2 * hs, -0.55 * hs, 1.12 * hs))
            pk.lights.point(tuple(lp), (1.0, 0.52, 0.22), 12.0, radius=0.06, shadow=False,
                            name='FigLanternLight', collection=coll, volume=0.05)
    return root


def add_drift_static(ob, rot_amp=(0.0, 0.0, 0.0), scale_frames=60.0, seed=0):
    """Key the current rotation once and add a gentle noise sway on it."""
    ob.keyframe_insert('rotation_euler', frame=1)
    add_drift(ob, rot_amp=rot_amp, scale_frames=scale_frames, seed=seed)


# ============================================================================ trees

def tree(M, coll, loc, h=6.0, crown=2.4, seed=0, lantern_srcs=(), lantern_cols=(), lean=0.0):
    """Chunky toy tree: curved trunk, clustered blob crown sprinkled with warm fairy bulbs,
    a few paper lanterns hanging under it and a warm glow light."""
    rng = random.Random(seed)
    root = empty('Tree%d' % seed, coll, Matrix.Translation(loc) @ Matrix.Rotation(rng.uniform(0, 6.28), 4, 'Z'))
    bm = bmesh.new()
    pts = [(0.0, 0.0, 0.0), (0.05 + lean * 0.2, 0.0, h * 0.25), (0.1 + lean * 0.5, 0.05, h * 0.5),
           (0.0 + lean * 0.7, 0.1, h * 0.68)]
    tube_bm(bm, pts, 0.17, segs=10)
    for a in (0.6, 2.7, 4.6):
        tube_bm(bm, [(lean * 0.5, 0.05, h * 0.55), (lean * 0.55 + 0.45 * math.cos(a), 0.45 * math.sin(a), h * 0.74)],
                0.07, segs=6)
    trunk = bm_obj('Trunk%d' % seed, bm, [M.dark_wood], coll, sharp=None)
    attach(trunk, root)
    bm = bmesh.new()
    cz = h * 0.72
    blobs = []
    for b in range(16):
        r = crown * rng.uniform(0.28, 0.45)
        c = Vector((rng.uniform(-0.62, 0.62) * crown + lean * 0.7, rng.uniform(-0.62, 0.62) * crown,
                    cz + rng.uniform(-0.2, 0.55) * crown))
        ret = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
        for v in ret['verts']:
            d = v.co.normalized()
            v.co = c + v.co * (1.0 + 0.1 * math.sin(d.x * 7 + b) * math.cos(d.y * 6) + 0.06 * math.sin(d.z * 9))
            v.co.z = max(v.co.z, c.z - r * 0.55)
        blobs.append((c, r))
    crown_ob = bm_obj('Crown%d' % seed, bm, [M.crown], coll, sharp=None)
    attach(crown_ob, root)
    bm = bmesh.new()
    for k in range(120):
        c, r = rng.choice(blobs)
        d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1) * 0.6 - 0.3)).normalized()
        p = c + d * r * 1.02
        ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.03)
        bmesh.ops.translate(bm, verts=ret['verts'], vec=p)
    fb = bm_obj('Fairy%d' % seed, bm, [cached('fairy', lambda: pk.mat.emission((1.0, 0.68, 0.32), 45.0,
                                                                            name='PK04_Fairy'))],
                coll, sharp=None, edges=False)
    fb.visible_shadow = False
    attach(fb, root)
    for k in range(min(4, len(lantern_srcs) * 2)):
        a = rng.uniform(0, 6.28)
        rr = crown * rng.uniform(0.5, 0.9)
        o = bpy.data.objects.new('TreeLan%d_%d' % (seed, k), lantern_srcs[k % len(lantern_srcs)].data)
        o.visible_shadow = False
        pk._link(o, coll)
        attach(o, root, (rr * math.cos(a), rr * math.sin(a), cz - crown * 0.35))
    pk.lights.point(tuple(Vector(loc) + Vector((0, 0, cz - crown * 0.6))), (1.0, 0.55, 0.25), 70.0, radius=0.6,
                    shadow=False, name='TreeGlow%d' % seed, collection=coll, volume=0.1)
    return root


def willow(M, coll, loc, h=6.5, crown=2.8, seed=0, lantern_srcs=(), lean=0.0, strands=300):
    """Weeping willow: a leaning, tapering trunk, five limbs arching out, curtains of long
    drooping leaf switches (crossed ribbons) wound with warm fairy bulbs, paper lanterns
    hanging inside and a warm glow light in the crown."""
    rng = random.Random(seed)
    root = empty('Willow%d' % seed, coll, Matrix.Translation(loc) @ Matrix.Rotation(rng.uniform(0, 6.28), 4, 'Z'))
    bm = bmesh.new()
    tp = [(0.0, 0.0, -0.1), (lean * 0.15, 0.04, h * 0.18), (lean * 0.4 + 0.08, 0.0, h * 0.38),
          (lean * 0.6, -0.06, h * 0.55), (lean * 0.66, 0.0, h * 0.64)]
    tube_bm(bm, tp, [0.34, 0.24, 0.2, 0.17, 0.15], segs=12)
    for a in (0.4, 2.3, 4.2):
        tube_bm(bm, [(0.0, 0.0, 0.15), (0.32 * math.cos(a), 0.32 * math.sin(a), 0.0),
                     (0.5 * math.cos(a), 0.5 * math.sin(a), -0.08)], [0.14, 0.08, 0.04], segs=6)
    top = Vector(tp[-1])
    limbs = []
    for k in range(5):
        a = k * 2 * math.pi / 5 + rng.uniform(-0.35, 0.35)
        d = Vector((math.cos(a), math.sin(a), 0.0))
        cr = crown * rng.uniform(0.85, 1.1)
        pts = [top + d * cr * f + Vector((0, 0, h * zz)) for f, zz in
               ((0.0, 0.0), (0.3, 0.17), (0.6, 0.25), (0.85, 0.22), (1.0, 0.12))]
        tube_bm(bm, pts, [0.12, 0.09, 0.07, 0.05, 0.03], segs=7)
        limbs.append(pts)
    trunk = bm_obj('WillowTrunk%d' % seed, bm, [M.dark_wood], coll, sharp=None)
    attach(trunk, root)
    bm = bmesh.new()
    bb = bmesh.new()
    nb = 0
    for i in range(strands):
        pts = rng.choice(limbs)
        t = rng.uniform(0.15, 1.0)
        f = t * (len(pts) - 1)
        j = min(int(f), len(pts) - 2)
        p = pts[j].lerp(pts[j + 1], f - j) + Vector((rng.gauss(0, 0.25), rng.gauss(0, 0.25), rng.uniform(-0.1, 0.25)))
        outward = Vector((p.x - top.x, p.y - top.y, 0.0))
        L = rng.uniform(2.2, 4.2) * (0.65 + 0.5 * t)
        sp = strand_ribbons(bm, p, L, outward, rng, width=rng.uniform(0.05, 0.085), segs=10,
                            curl=0.22 + 0.2 * t, min_z=0.35)
        if i % 6 == 0:      # round 3: fewer, larger bulbs (speckle after compression)
            for u in (0.2, 0.45, 0.7, 0.92):
                q = sp[int(u * (len(sp) - 1))]
                ret = bmesh.ops.create_icosphere(bb, subdivisions=1, radius=0.036)
                bmesh.ops.translate(bb, verts=ret['verts'], vec=q + Vector((rng.uniform(-0.04, 0.04),) * 3))
                nb += 1
    leaves = bm_obj('WillowLeaves%d' % seed, bm, [M.willow], coll, sharp=None, edges=False, recalc=False)
    attach(leaves, root)
    fb = bm_obj('WillowBulbs%d' % seed, bb, [cached('fairy', lambda: pk.mat.emission((1.0, 0.68, 0.32), 45.0,
                                                                                 name='PK04_Fairy'))],
                coll, sharp=None, edges=False)
    fb.visible_shadow = False
    attach(fb, root)
    cz = h * 0.72
    for k in range(min(3, len(lantern_srcs) * 2)):
        a = rng.uniform(0, 6.28)
        rr = crown * rng.uniform(0.35, 0.7)
        o = bpy.data.objects.new('WillowLan%d_%d' % (seed, k), lantern_srcs[k % len(lantern_srcs)].data)
        o.visible_shadow = False
        pk._link(o, coll)
        attach(o, root, (rr * math.cos(a), rr * math.sin(a), cz - 0.4 - rng.uniform(0, 0.8)))
    pk.lights.point(tuple(Vector(loc) + Vector((0, 0, h * 0.5))), (1.0, 0.55, 0.25), 140.0, radius=0.8,
                    shadow=False, name='WillowGlow%d' % seed, collection=coll, volume=0.1)
    return root


# ============================================================================ houses

def gable_roof(root, M, w, d, z_top, pitch, oh_front, oh_side, roof_mat, wall_mat, coll, name,
               ridge_y=True, curl=0.22):
    """Two chunky tile slabs, a gable infill and a ridge cap with upturned ends.
    ridge_y=False: ridge runs along local X (eaves face the canal); True: gable faces the canal."""
    tp = math.tan(rad(pitch))
    if not ridge_y:
        half = d / 2
        zr = z_top + half * tp
        L = (half + oh_front) / math.cos(rad(pitch))
        for sgn in (-1, 1):
            cy = d / 2 + sgn * (half + oh_front) / 2
            cz = zr - (half + oh_front) / 2 * tp
            sl = pk.geo.rounded_box((w + 2 * oh_side, L, 0.2), radius=0.07, segments=3,
                                    material=roof_mat, name=name + 'Slab', origin='CENTER',
                                    collection=coll)
            attach(sl, root, (0, cy, cz + 0.12), (-sgn * pitch, 0, 0))
        bm = bmesh.new()
        bm_prism(bm, [(0.02, z_top - 0.05), (d - 0.02, z_top - 0.05), (d / 2, zr)], -w / 2 + 0.02,
                 w / 2 - 0.02, axis='x')
        g = bm_obj(name + 'Gable', bm, [wall_mat], coll, box_uv=False)
        attach(g, root)
        pts = []
        span = w / 2 + oh_side + 0.05
        for i in range(25):
            x = -span + 2 * span * i / 24
            k = max(0.0, (abs(x) - (span - 0.7)) / 0.7)
            pts.append((x, d / 2, zr + 0.25 + curl * k * k))
        rc = pk.geo.tube_along(pts, radius=0.12, segments=10, material=roof_mat, name=name + 'Ridge',
                               collection=coll)
        attach(rc, root)
        return zr
    half = w / 2
    zr = z_top + half * tp
    L = (half + oh_side) / math.cos(rad(pitch))
    for sgn in (-1, 1):
        cx = sgn * (half + oh_side) / 2
        cz = zr - (half + oh_side) / 2 * tp
        sl = pk.geo.rounded_box((d + 2 * oh_front, L, 0.2), radius=0.07, segments=3,
                                material=roof_mat, name=name + 'Slab', origin='CENTER',
                                collection=coll)
        attach(sl, root, (cx, d / 2, cz + 0.12), (sgn * pitch, 0, 90))
    bm = bmesh.new()
    bm_prism(bm, [(-half + 0.02, z_top - 0.05), (half - 0.02, z_top - 0.05), (0, zr)], 0.02, d - 0.02,
             axis='y')
    g = bm_obj(name + 'Gable', bm, [wall_mat], coll)
    attach(g, root)
    pts = []
    span = d / 2 + oh_front + 0.05
    for i in range(25):
        y = -span + 2 * span * i / 24
        k = max(0.0, (abs(y) - (span - 0.7)) / 0.7)
        pts.append((0, d / 2 + y, zr + 0.25 + curl * k * k))
    rc = pk.geo.tube_along(pts, radius=0.12, segments=10, material=roof_mat, name=name + 'Ridge',
                           collection=coll)
    attach(rc, root)
    return zr


def canal_house(M, coll, path, s, side, w, d, floors, rng, idx, srcs):
    """A stacked canal house. side +1: right bank behind the quay walkway; -1: left bank,
    rising straight from the canal wall with steps down to the water."""
    lat_front = RIGHT_FRONT if side > 0 else LEFT_FRONT
    yaw = -90.0 if side > 0 else 90.0
    root = empty('House%d' % idx, coll, frame_at(path, s, lat_front, QUAY_Z, yaw))
    pi = rng.randrange(len(M.plaster))
    plaster = M.plaster[pi]
    plaster2 = M.plaster[(pi + rng.choice((0, 0, 1, 3))) % len(M.plaster)]
    style = rng.choice(('plaster', 'plaster', 'halftimber', 'timber'))
    if style == 'timber':
        plaster2 = M.timber
        if rng.random() < 0.5:
            plaster = M.timber
    h0 = rng.uniform(2.9, 3.2)
    h1 = rng.uniform(2.55, 2.8)
    jetty = rng.choice((0.0, 0.0, 0.3, 0.45))
    body = pk.geo.rounded_box((w, d, h0), radius=0.12, segments=3, material=plaster,
                              name='HouseG%d' % idx, collection=coll)
    attach(body, root, (0, d / 2, 0))
    for k in range(1, floors):
        b = pk.geo.rounded_box((w + 0.12, d + jetty, h1 + 0.02), radius=0.12, segments=3,
                               material=plaster2, name='HouseF%d_%d' % (idx, k), collection=coll)
        attach(b, root, (0, d / 2 - jetty / 2, h0 + (k - 1) * h1))
    z_top = h0 + (floors - 1) * h1
    # windows
    wmat = rng.choice(M.windows)
    win_w, win_h = rng.choice(((0.8, 1.15), (0.7, 1.2), (0.9, 1.05)))
    gap = rng.uniform(0.6, 0.9)
    n = max(1, int((w - 0.9 + gap) / (win_w + gap)))
    fy = -jetty - 0.025
    if floors > 1:
        wp = pk.geo.window_panel(cols=n, rows=floors - 1, win_w=win_w, win_h=win_h, gap_x=gap,
                                 gap_y=h1 - win_h, material=wmat, name='HouseWin%d' % idx,
                                 seed=idx * 7 + 1, collection=coll, round_top=rng.random() < 0.3,
                                 lit_fraction=0.72)
        attach(wp, root, (0, fy, h0 + 0.7))
    tw = n * win_w + (n - 1) * gap
    xs = [-tw / 2 + win_w / 2 + c * (win_w + gap) for c in range(n)]
    # ground floor openings
    door_x = None
    if side > 0:
        door_x = rng.choice((-1, 1)) * (w / 2 - 0.85)
        gx = -door_x * 0.35
        gw = min(2.4, w - 2.4)
        if gw > 0.8:
            gp = pk.geo.window_panel(cols=max(1, int(gw / 1.1)), rows=1, win_w=gw / max(1, int(gw / 1.1)) - 0.15,
                                     win_h=1.6, gap_x=0.15, material=rng.choice(M.windows),
                                     name='HouseShop%d' % idx, seed=idx * 7 + 2, collection=coll,
                                     lit_fraction=1.0)
            attach(gp, root, (gx, -0.025, 0.6))
            if rng.random() < 0.75:
                aw = pk.geo.rounded_box((gw + 0.5, 1.0, 0.06), radius=0.025, segments=2,
                                        material=AWNINGS[rng.randrange(len(AWNINGS))], name='Awning%d' % idx,
                                        origin='CENTER', collection=coll)
                attach(aw, root, (gx, -0.46, 2.5), (-24, 0, 0))
    else:
        gp = pk.geo.window_panel(cols=n, rows=1, win_w=win_w, win_h=win_h * 0.95, gap_x=gap,
                                 material=wmat, name='HouseGWin%d' % idx, seed=idx * 7 + 3,
                                 collection=coll, round_top=True, lit_fraction=0.75)
        attach(gp, root, (0, -0.025, 0.85))
    # detail mesh: trims, sills, lintels, shutters, balcony, door, steps (bevelled)
    bm = bmesh.new()
    shutter = rng.random() < 0.55
    band_mi = 1 if style == 'timber' else 0
    for k in range(1, floors):
        zf = h0 + (k - 1) * h1
        bm_box(bm, (0, -jetty - 0.05, zf), (w + 0.3, 0.16, 0.16), mi=2 if style == 'halftimber' else band_mi)
        if style == 'halftimber':
            # dark timber posts at the corners and between the windows, braces at the ends
            posts = [-w / 2 + 0.09, w / 2 - 0.09] + [(xs[i] + xs[i + 1]) / 2 for i in range(len(xs) - 1)]
            for x in posts:
                bm_box(bm, (x, -jetty - 0.04, zf + h1 / 2), (0.14, 0.08, h1 - 0.05), mi=2)
            for sx in (-1, 1):
                bm_box(bm, (sx * (w / 2 - 0.42), -jetty - 0.035, zf + h1 * 0.28), (0.1, 0.07, 1.0), mi=2,
                       rot_y=-sx * 40.0)
            bm_box(bm, (0, -jetty - 0.04, zf + h1 - 0.12), (w, 0.08, 0.12), mi=2)
        for x in xs:
            z0 = zf + 0.7
            bm_box(bm, (x, fy - 0.08, z0 - 0.05), (win_w + 0.22, 0.2, 0.08), mi=0)
            bm_box(bm, (x, fy - 0.06, z0 + win_h + 0.07), (win_w + 0.26, 0.16, 0.1), mi=0)
            if shutter:
                for sx in (-1, 1):
                    bm_box(bm, (x + sx * (win_w / 2 + 0.2), fy - 0.04, z0 + win_h / 2), (0.34, 0.05, win_h), mi=1)
    bm_box(bm, (0, -0.03, 0.12), (w + 0.12, 0.12, 0.24), mi=0)     # plinth band
    bm_box(bm, (0, -jetty - 0.06, z_top - 0.05), (w + 0.34, 0.2, 0.2), mi=0)   # cornice
    paint = rng.randrange(len(M.wood_paint))
    balcony = floors >= 2 and rng.random() < 0.65
    if balcony:
        lvl = rng.randrange(1, floors)
        zb = h0 + (lvl - 1) * h1
        bw = min(w - 0.4, rng.uniform(2.0, 3.4))
        bx = rng.uniform(-(w - bw) / 2, (w - bw) / 2)
        by = -jetty - 0.42
        bm_box(bm, (bx, by, zb + 0.02), (bw, 0.84, 0.12), mi=2)
        for i in range(int(bw / 0.22) + 1):
            x = bx - bw / 2 + 0.05 + i * (bw - 0.1) / max(1, int(bw / 0.22))
            bm_box(bm, (x, by - 0.38, zb + 0.5), (0.045, 0.045, 0.85), mi=2)
        for x in (bx - bw / 2 + 0.03, bx + bw / 2 - 0.03):
            for yy in (by - 0.2, by + 0.15):
                bm_box(bm, (x, yy, zb + 0.5), (0.045, 0.045, 0.85), mi=2)
        bm_box(bm, (bx, by - 0.38, zb + 0.95), (bw + 0.06, 0.08, 0.07), mi=2)
        bm_box(bm, (bx - bw / 2 + 0.03, by - 0.0, zb + 0.95), (0.08, 0.8, 0.07), mi=2)
        bm_box(bm, (bx + bw / 2 - 0.03, by - 0.0, zb + 0.95), (0.08, 0.8, 0.07), mi=2)
        bm_box(bm, (bx, by - 0.38, zb + 0.2), (bw, 0.05, 0.05), mi=2)
        # brackets under the balcony
        for x in (bx - bw / 2 + 0.25, bx + bw / 2 - 0.25):
            bm_box(bm, (x, by + 0.05, zb - 0.22), (0.1, 0.5, 0.1), mi=2, rot_x=35)
        srcs['pots'].append((root, (bx - bw / 2 + 0.35, by - 0.1, zb + 0.08), rng.random()))
        srcs['pots'].append((root, (bx + bw / 2 - 0.35, by - 0.1, zb + 0.08), rng.random()))
        srcs['hang'].append((root, (bx, by - 0.3, zb - 0.02)))
    if door_x is not None:
        bm_box(bm, (door_x, -0.06, 1.12), (1.2, 0.14, 2.28), mi=0)       # surround
        bm_box(bm, (door_x, -0.1, 1.06), (0.96, 0.08, 2.1), mi=1)        # door leaf
        bm_box(bm, (door_x, -0.35, 0.05), (1.3, 0.5, 0.12), mi=3)        # step
        srcs['door_lamps'].append((root, (door_x + 0.8 * (1 if door_x < 0 else -1), -0.25, 2.35)))
        if rng.random() < 0.7:
            # noren: split fabric curtain across the doorway (rod + 3 panels)
            bm_box(bm, (door_x, -0.3, 2.14), (1.1, 0.03, 0.03), mi=2)
            for j, dx in enumerate((-0.34, 0.0, 0.34)):
                bm_box(bm, (door_x + dx, -0.3, 1.66), (0.31, 0.015, 0.92), mi=4, rot_x=rng.uniform(-3, 3))
        if rng.random() < 0.6:
            srcs['andon'].append((root, (door_x + 0.95 * (-1 if door_x < 0 else 1), -0.45, 0.0)))
        elif rng.random() < 0.7:
            srcs['pots'].append((root, (door_x + 0.95 * (-1 if door_x < 0 else 1), -0.35, 0.0), rng.random()))
    else:
        # water door with stone steps down to the canal
        if rng.random() < 0.6:
            dx = rng.uniform(-w / 2 + 1.0, w / 2 - 1.0)
            bm_box(bm, (dx, -0.06, 1.1), (1.15, 0.14, 2.2), mi=0)
            bm_box(bm, (dx, -0.1, 1.05), (0.92, 0.08, 2.05), mi=1)
            for k in range(5):
                bm_box(bm, (dx, -0.35 - 0.32 * k, -0.12 - 0.22 * k), (1.3, 0.34, 0.26), mi=3)
            srcs['door_lamps'].append((root, (dx + 0.8, -0.25, 2.3)))
    if rng.random() < 0.45 and floors > 1:
        for x in xs[:2]:
            bm_box(bm, (x, fy - 0.16, h0 + 0.62), (win_w + 0.1, 0.24, 0.2), mi=1)
            srcs['flowers'].append((root, (x, fy - 0.16, h0 + 0.74)))
    det = bm_obj('HouseDet%d' % idx, bm, [M.trim, M.wood_paint[paint], M.dark_wood, M.stone_light,
                                          M.noren[rng.randrange(len(M.noren))]], coll, box_uv=True)
    pk.geo.bevel(det, width=0.018, segments=2, angle=50)
    attach(det, root)
    # roof
    rm = M.roof[rng.randrange(len(M.roof))]
    ridge_y = rng.random() < 0.4
    pitch = rng.uniform(30, 40) if not ridge_y else rng.uniform(34, 42)
    rroot = empty('RoofRoot%d' % idx, coll)
    attach(rroot, root, (0, -jetty, 0))
    zr = gable_roof(rroot, M, w + 0.12, d + jetty, z_top, pitch, 0.5, 0.35, rm, plaster2, coll,
                    'Roof%d' % idx, ridge_y=ridge_y)
    if ridge_y:
        # little round window in the front gable
        gw = pk.geo.window_panel(cols=1, rows=1, win_w=0.55, win_h=0.6, material=wmat, name='GableWin%d' % idx,
                                 seed=idx, collection=coll, round_top=True)
        attach(gw, root, (0, -jetty - 0.03, z_top + 0.35))
    if rng.random() < 0.55:
        cx = rng.uniform(-w / 2 + 0.6, w / 2 - 0.6)
        cy = (d + jetty) * rng.uniform(0.55, 0.8)
        ch = pk.geo.rounded_box((0.5, 0.5, zr - z_top + 0.9), radius=0.06, segments=2,
                                material=M.stone_light, name='Chimney%d' % idx, collection=coll)
        attach(ch, root, (cx, cy - jetty, z_top))
        cap = pk.geo.rounded_box((0.66, 0.66, 0.1), radius=0.03, segments=2, material=M.dark_wood,
                                 name='ChimCap%d' % idx, collection=coll)
        attach(cap, root, (cx, cy - jetty, zr + 0.95))
    return root, z_top, zr


def far_house(M, coll, path, s, lat, zbase, w, d, h, rng, idx, facing):
    """Simple house for the terraces and the far canal (cheap materials)."""
    yaw = -90.0 if facing > 0 else 90.0
    root = empty('FarHouse%d' % idx, coll, frame_at(path, s, lat, zbase, yaw + rng.uniform(-8, 8)))
    b = pk.geo.rounded_box((w, d, h), radius=0.25, segments=2, material=rng.choice(M.far_plaster),
                           name='FarBody%d' % idx, collection=coll, edges=False)
    attach(b, root, (0, d / 2, -1.5))
    b.scale.z = (h + 1.5) / h
    pitch = rng.uniform(28, 38)
    tp = math.tan(rad(pitch))
    zr = h + d / 2 * tp
    bm = bmesh.new()
    bm_prism(bm, [(-0.45, h - 0.25), (d / 2, zr + 0.1), (d + 0.45, h - 0.25), (d + 0.45, h - 0.05),
                  (d / 2, zr + 0.32), (-0.45, h - 0.05)], -w / 2 - 0.3, w / 2 + 0.3, axis='x')
    bm_prism(bm, [(0.02, h - 0.2), (d - 0.02, h - 0.2), (d / 2, zr)], -w / 2 + 0.05, w / 2 - 0.05, axis='x', mi=1)
    r = bm_obj('FarRoof%d' % idx, bm, [rng.choice(M.roof_basic), b.data.materials[0]], coll, edges=False)
    attach(r, root)
    rows = max(1, int((h - 0.8) / 2.6))
    cols = max(1, int((w - 0.6) / 1.5))
    wp = pk.geo.window_panel(cols=cols, rows=rows, win_w=0.75, win_h=1.05, gap_x=0.75, gap_y=1.55,
                             material=rng.choice(M.far_windows), name='FarWin%d' % idx, seed=idx * 13,
                             collection=coll, lit_fraction=0.6, round_top=rng.random() < 0.3)
    attach(wp, root, (0, -0.03, 0.7))
    return root


# ============================================================================ bridges

def arch_bridge(M, coll, path, s, idx, lantern_srcs, lantern_cols, half_span=8.6, arch_a=4.25,
                arch_b=2.55, spring=0.25, deck_mid=3.75, T=2.8, under_lanterns=True):
    root = empty('BridgeA%d' % idx, coll, frame_at(path, s))

    def deck(x):
        return deck_mid - (deck_mid - QUAY_Z) * (x / half_span) ** 2
    K = 28
    poly = [(-half_span, -1.2), (-arch_a, -1.2), (-arch_a, spring)]
    for k in range(1, K):
        th = math.pi - math.pi * k / K
        poly.append((arch_a * math.cos(th), spring + arch_b * math.sin(th)))
    poly += [(arch_a, spring), (arch_a, -1.2), (half_span, -1.2)]
    for k in range(17):
        x = half_span - 2 * half_span * k / 16
        poly.append((x, deck(x)))
    bm = bmesh.new()
    bm_prism(bm, poly, -T / 2, T / 2, axis='y')
    body = bm_obj('BridgeBody%d' % idx, bm, [M.bridge], coll, sharp=40, box_uv=True)
    pk.geo.bevel(body, width=0.05, segments=2, angle=40)
    pk._box_uv(body.data)
    attach(body, root)
    # voussoir ring (proud of both faces) with a keystone
    bm = bmesh.new()
    NV = 33
    for face in (-1, 1):
        y0 = face * (T / 2 + 0.06)
        y1 = face * (T / 2 - 0.2)
        for k in range(NV):
            t0 = math.pi * k / NV + 0.006
            t1 = math.pi * (k + 1) / NV - 0.006
            ext = (0.36 + 0.06 * (k % 2)) if k != NV // 2 else 0.55
            pts = [(arch_a * math.cos(t0), spring + arch_b * math.sin(t0)),
                   ((arch_a + ext) * math.cos(t0), spring + (arch_b + ext) * math.sin(t0)),
                   ((arch_a + ext) * math.cos(t1), spring + (arch_b + ext) * math.sin(t1)),
                   (arch_a * math.cos(t1), spring + arch_b * math.sin(t1))]
            bm_prism(bm, pts, min(y0, y1), max(y0, y1), axis='y', mi=0)
    vo = bm_obj('Voussoirs%d' % idx, bm, [M.vouss], coll, sharp=40, box_uv=True)
    pk.geo.bevel(vo, width=0.025, segments=2, angle=40)
    pk._box_uv(vo.data)
    attach(vo, root)
    # round 4: a smooth soffit band under the voussoir ring on both faces. Seen from below as
    # the boat leaves the vault, the ring's joint gaps and bevelled block corners (proud of
    # the face) cut a notched, stair-stepped lip against the sky; this thin curved slab
    # (1.5 cm below the intrados, finely segmented) gives the lip one clean elliptic edge
    bm = bmesh.new()
    NB = 96
    for face in (-1, 1):
        ya, yb = face * (T / 2 + 0.06), face * (T / 2 - 0.26)
        outer = [((arch_a + 0.04) * math.cos(math.pi * k / NB), spring + (arch_b + 0.04) * math.sin(math.pi * k / NB))
                 for k in range(NB + 1)]
        inner = [((arch_a - 0.015) * math.cos(math.pi * k / NB), spring + (arch_b - 0.015) * math.sin(math.pi * k / NB))
                 for k in range(NB, -1, -1)]
        bm_prism(bm, outer + inner, min(ya, yb), max(ya, yb), axis='y', mi=0)
    band = bm_obj('VoussoirSoffit%d' % idx, bm, [M.vouss], coll, sharp=40, box_uv=True)
    attach(band, root)
    # parapets along both edges + posts
    bm = bmesh.new()
    for face in (-1, 1):
        yc = face * (T / 2 - 0.2)
        n = 34
        for k in range(n):
            x0 = -half_span + 2 * half_span * k / n
            x1 = -half_span + 2 * half_span * (k + 1) / n
            xm = (x0 + x1) / 2
            ang = math.degrees(math.atan2(deck(x1) - deck(x0), x1 - x0))
            vs = bm_box(bm, (xm, yc, deck(xm) + 0.36), (x1 - x0 + 0.02, 0.36, 0.72), mi=0)
            bmesh.ops.rotate(bm, verts=vs, cent=(xm, yc, deck(xm) + 0.36),
                             matrix=Matrix.Rotation(rad(-ang), 3, 'Y'))
        for x in (-half_span + 0.3, -arch_a - 0.4, 0.0, arch_a + 0.4, half_span - 0.3):
            bm_box(bm, (x, yc, deck(x) + 0.55), (0.46, 0.46, 1.1), mi=0)
            bm_box(bm, (x, yc, deck(x) + 1.13), (0.56, 0.56, 0.1), mi=0)
    par = bm_obj('Parapet%d' % idx, bm, [M.stone_light], coll, sharp=40, box_uv=True)
    pk.geo.bevel(par, width=0.03, segments=2, angle=40)
    pk._box_uv(par.data)
    attach(par, root)
    # lanterns on the end posts and under the arch
    items = []
    k = 0
    for face in (-1, 1):
        yc = face * (T / 2 - 0.2)
        for x in (-half_span + 0.3, -arch_a - 0.4, arch_a + 0.4, half_span - 0.3):
            pz = deck(x) + 1.18 + 0.55
            items.append(((x, yc, pz), k))
            k += 1
    if under_lanterns:
        for face in (-1, 1):
            for x in (-1.8, 0.0, 1.8):
                zt = spring + arch_b * math.sqrt(max(0.0, 1 - (x / arch_a) ** 2))
                items.append(((x, face * (T / 2 - 0.35), zt - 0.02), k))
                k += 1
    lr = empty('BridgeLanterns%d' % idx, coll)
    attach(lr, root)
    for i, (p, kk) in enumerate(items):
        src = lantern_srcs[kk % len(lantern_srcs)]
        o = bpy.data.objects.new('BrLan%d_%d' % (idx, i), src.data)
        o.parent = lr
        o.location = p
        o.visible_shadow = False
        pk._link(o, coll)
    # lights: warm-red at the posts, a coloured glow under the arch
    Mw = root.matrix_world
    for face in (-1, 1):
        yc = face * (T / 2 - 0.2)
        for j, x in enumerate((-arch_a - 0.4, arch_a + 0.4)):
            p = Mw @ Vector((x, yc + face * 0.3, deck(x) + 1.45))
            pk.lights.point(tuple(p), lantern_cols[j % len(lantern_cols)], 60.0, radius=0.2, shadow=False,
                            name='BridgeLamp%d' % idx, collection=coll, volume=0.2)
    if under_lanterns:
        for face in (-1, 1):
            # round 5: inside the crown lantern's paper body (was 0.6 m under the crown at the
            # face, 45 W), so the soffit gets a pool around the lantern that falls off along the
            # barrel and down the haunches instead of an even fill
            p = Mw @ Vector((0.0, face * (T / 2 - 0.35), spring + arch_b - ARCH_GLOW_DROP))
            pk.lights.point(tuple(p), (1.0, 0.45, 0.25), ARCH_GLOW, radius=0.14, shadow=False,
                            name='ArchGlow%d' % idx, collection=coll, volume=0.1)
    # round 3: warm 2400 K spots raking across the boat-side face from the two quays (was a
    # flat teal/magenta wash from the water that turned the stone violet), so the stone gets
    # a lit side, falloff and shadowed joints
    for sx in (-1, 1):
        p = Mw @ Vector((sx * (half_span + 0.6), -T / 2 - 1.3, QUAY_Z + 1.1))
        tgt = Mw @ Vector((-sx * 2.2, -T / 2, 2.6))
        pk.lights.spot(tuple(p), tuple(tgt), (1.0, 0.5, 0.22), BRIDGE_RAKE, angle_deg=48, blend=0.7,
                       radius=0.12, shadow=True, name='BridgeRake%d' % idx, collection=coll, volume=0.0)
    # festoon along both parapets: scalloped wire with fairy bulbs, small lanterns at the dips,
    # each dip light pooling warm light on the stone below it
    fb = bmesh.new()
    gx = list(np.linspace(-half_span + 0.6, half_span - 0.6, 8))
    dips = []
    for face in (-1, 1):
        yf = face * (T / 2 + 0.08)
        wire = []
        for a, b in zip(gx[:-1], gx[1:]):
            for k in range(12):
                u = k / 12.0
                x = a + (b - a) * u
                z = deck(x) + 0.68 - 0.42 * math.sin(math.pi * u)
                wire.append((x, yf, z))
            dips.append((face, (a + b) / 2, yf, deck((a + b) / 2) + 0.26))
        wire.append((gx[-1], yf, deck(gx[-1]) + 0.68))
        for p in wire[::3]:
            ret = bmesh.ops.create_icosphere(fb, subdivisions=1, radius=0.038)
            bmesh.ops.translate(fb, verts=ret['verts'], vec=p)
        tw = pk.geo.tube_along(wire, radius=0.008, segments=5, material=cached(
            'wire', lambda: pk.mat.metal((0.02, 0.02, 0.02), roughness=0.5, name='PK04_Wire')),
            name='Festoon%d' % idx, collection=coll)
        tw.visible_shadow = False
        attach(tw, root)
    fbo = bm_obj('FestoonBulbs%d' % idx, fb, [cached('bulb', lambda: pk.mat.emission(
        (1.0, 0.72, 0.38), 60.0, name='PK04_Bulb'))], coll, sharp=None, edges=False)
    fbo.visible_shadow = False
    attach(fbo, root)
    for i, (face, x, yf, z) in enumerate(dips):
        src = lantern_srcs[i % len(lantern_srcs)]
        o = bpy.data.objects.new('FestLan%d_%d' % (idx, i), src.data)
        o.parent = lr
        o.location = (x, yf, z + 0.02)
        o.visible_shadow = False
        pk._link(o, coll)
        if face < 0:
            pk.lights.point(tuple(Mw @ Vector((x, yf - 0.3, z - 0.25))), (1.0, 0.52, 0.24), 55.0,
                            radius=0.08, shadow=False, name='FestLight%d' % idx, collection=coll, volume=0.1)
    # (round 3: the spandrel ivy read as chevron glyphs; removed)
    # tiny warm bulbs along both parapet tops
    bm = bmesh.new()
    for face in (-1, 1):
        yc = face * (T / 2 - 0.2)
        for x in np.linspace(-half_span + 0.5, half_span - 0.5, 22):
            ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.045)
            bmesh.ops.translate(bm, verts=ret['verts'], vec=(float(x), yc, deck(float(x)) + 0.79))
    bulbs = bm_obj('ParapetBulbs%d' % idx, bm, [cached('bulb', lambda: pk.mat.emission(
        (1.0, 0.72, 0.38), 60.0, name='PK04_Bulb'))], coll, sharp=None, edges=False)
    bulbs.visible_shadow = False
    attach(bulbs, root)
    return root, deck


# ============================================================================ hero tea house

def hip_roof(name, W, D, rise, curl, thick, mat, coll, n=28, sag=1.75):
    """Concave hipped roof with upturned corners, solid (top, bottom and rim)."""
    bm = bmesh.new()
    top, bot = [], []
    for i in range(n + 1):
        rt, rb = [], []
        for j in range(n + 1):
            x = -W + 2 * W * i / n
            y = -D + 2 * D * j / n
            ax, ay = abs(x) / W, abs(y) / D
            r = max(ax, ay)
            z = rise * (1.0 - r) ** sag + curl * (ax * ay) ** 4
            rt.append(bm.verts.new((x, y, z)))
            rb.append(bm.verts.new((x * 0.985, y * 0.985, z - thick - 0.05 * (1 - r))))
        top.append(rt)
        bot.append(rb)
    for i in range(n):
        for j in range(n):
            bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]))
            bm.faces.new((bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j]))
    rim = [(i, 0) for i in range(n)] + [(n, j) for j in range(n)] + \
          [(n - i, n) for i in range(n)] + [(0, n - j) for j in range(n)]
    for k in range(len(rim)):
        i0, j0 = rim[k]
        i1, j1 = rim[(k + 1) % len(rim)]
        bm.faces.new((top[i0][j0], bot[i0][j0], bot[i1][j1], top[i1][j1]))
    ob = bm_obj(name, bm, [mat], coll, sharp=50)
    return ob


def teahouse(M, coll, path, srcs):
    """The warm hero: a two-tier tea house on stilts over the left bank with one huge round
    paper lantern hanging over the water."""
    s = TEAHOUSE_S
    root = empty('TeaHouse', coll, frame_at(path, s, LEFT_FRONT + 0.1, 0.0, 90.0))
    warm_plaster = pk.mat.clay((0.78, 0.5, 0.26), name='PK04_TeaPlaster', roughness=0.8, bumps=0.25,
                               grime=0.25)
    deck_wood = pk.mat.varnished_wood(name='PK04_TeaDeck', light=(0.42, 0.2, 0.08),
                                      dark=(0.16, 0.06, 0.02), planks=0.18, axis='Y')
    roof1 = tile_mat((0.03, 0.12, 0.1), 'PK04_TeaRoof1', mode='hip', W=7.6, D=5.6)
    roof2 = tile_mat((0.03, 0.12, 0.1), 'PK04_TeaRoof2', mode='hip', W=5.0, D=3.9)
    W, Dd = 12.0, 9.0
    # stilts + platform
    bm = bmesh.new()
    for x in np.linspace(-W / 2 + 0.4, W / 2 - 0.4, 7):
        for y in (0.35, 3.5, 6.5):
            bm_box(bm, (x, y, 0.15), (0.28, 0.28, 1.9), mi=0)
    st = bm_obj('TeaStilts', bm, [M.dark_wood], coll)
    attach(st, root)
    pl = pk.geo.rounded_box((W + 0.4, Dd + 0.6, 0.28), radius=0.08, segments=2, material=deck_wood,
                            name='TeaDeck', collection=coll)
    attach(pl, root, (0, Dd / 2 - 0.1, 1.05))
    # ground floor
    g = pk.geo.rounded_box((W - 2.0, Dd - 2.6, 3.3), radius=0.12, segments=3, material=warm_plaster,
                           name='TeaHall', collection=coll)
    attach(g, root, (0, Dd / 2 + 0.9, 1.33))
    win = pk.mat.lit_window((1.0, 0.56, 0.18), strength=14.0, name='PK04_TeaWin', mullions=(4, 5),
                            frame_w=0.05, mullion_w=0.03, curtains=0.15, variation=0.2, hue_shift=0.03)
    wp = pk.geo.window_panel(cols=4, rows=1, win_w=1.7, win_h=2.1, gap_x=0.42, material=win,
                             name='TeaWinFront', seed=3, collection=coll)
    attach(wp, root, (0, 2.27 - 0.03, 1.75))
    # side windows (the side facing the approaching boat, local -X) and the far side
    for sx in (-1, 1):
        wps = pk.geo.window_panel(cols=2, rows=1, win_w=1.5, win_h=2.0, gap_x=0.5, material=win,
                                  name='TeaWinSide', seed=5 + sx, collection=coll)
        attach(wps, root, (sx * ((W - 2.0) / 2 + 0.03), Dd / 2 + 0.9, 1.8), (0, 0, -90 * sx))
    # lacquered columns along the veranda
    bm = bmesh.new()
    for x in np.linspace(-W / 2 + 0.5, W / 2 - 0.5, 6):
        bm_box(bm, (x, 0.55, 2.95), (0.26, 0.26, 3.5), mi=0)
        bm_box(bm, (x, 0.55, 1.32), (0.4, 0.4, 0.12), mi=1)
    for x in (-W / 2 + 0.5, W / 2 - 0.5):
        for y in (3.0, 5.6, 8.2):
            bm_box(bm, (x, y, 2.95), (0.26, 0.26, 3.5), mi=0)
    bm_box(bm, (0, 0.55, 4.62), (W - 0.6, 0.3, 0.26), mi=0)          # beam
    # railing
    n = 40
    for i in range(n + 1):
        x = -W / 2 + 0.25 + (W - 0.5) * i / n
        if i % 5:
            bm_box(bm, (x, 0.12, 1.65), (0.05, 0.05, 0.62), mi=0)
    bm_box(bm, (0, 0.12, 1.98), (W - 0.4, 0.1, 0.08), mi=0)
    bm_box(bm, (0, 0.12, 1.45), (W - 0.4, 0.06, 0.06), mi=0)
    for y in np.linspace(0.3, Dd - 0.4, 10):
        for x in (-W / 2 + 0.12, W / 2 - 0.12):
            bm_box(bm, (x, y, 1.65), (0.05, 0.05, 0.62), mi=0)
    for x in (-W / 2 + 0.12, W / 2 - 0.12):
        bm_box(bm, (x, Dd / 2, 1.98), (0.1, Dd - 0.6, 0.08), mi=0)
    cols = bm_obj('TeaColumns', bm, [M.red_lacquer, M.brass], coll)
    pk.geo.bevel(cols, width=0.02, segments=2, angle=50)
    attach(cols, root)
    # first roof tier
    r1 = hip_roof('TeaRoof1', 7.6, 5.6, 2.0, 0.85, 0.22, roof1, coll)
    attach(r1, root, (0, Dd / 2 + 0.4, 4.7))
    # eave trim
    trim_pts = []
    for k in range(0, 129):
        u = k / 128.0
        per = 2 * (7.6 + 5.6) * 2
        d_ = u * per
        sides = [(7.6 * 2, (-7.6, -5.6), (1, 0)), (5.6 * 2, (7.6, -5.6), (0, 1)),
                 (7.6 * 2, (7.6, 5.6), (-1, 0)), (5.6 * 2, (-7.6, 5.6), (0, -1))]
        for L, p0, dv in sides:
            if d_ <= L:
                x = p0[0] + dv[0] * d_
                y = p0[1] + dv[1] * d_
                break
            d_ -= L
        ax, ay = abs(x) / 7.6, abs(y) / 5.6
        trim_pts.append((x * 1.002, y * 1.002 + Dd / 2 + 0.4, 4.7 + 0.85 * (ax * ay) ** 4 + 0.02))
    tr = pk.geo.tube_along(trim_pts, radius=0.07, segments=8, material=M.red_lacquer, name='TeaEave',
                           collection=coll)
    attach(tr, root)
    # upper floor
    g2 = pk.geo.rounded_box((6.8, 4.8, 3.0), radius=0.12, segments=3, material=warm_plaster,
                            name='TeaUpper', collection=coll)
    attach(g2, root, (0, Dd / 2 + 0.4, 5.6))
    for x in (-2.2, 0.0, 2.2):
        rw = pk.geo.window_panel(cols=1, rows=1, win_w=1.3, win_h=1.5, material=win, name='TeaUpWin',
                                 seed=int(x * 10) + 20, collection=coll, round_top=True)
        attach(rw, root, (x, Dd / 2 + 0.4 - 2.43, 6.35))
    for sx in (-1, 1):
        rw = pk.geo.window_panel(cols=2, rows=1, win_w=1.0, win_h=1.4, gap_x=0.6, material=win,
                                 name='TeaUpWinS', seed=40 + sx, collection=coll, round_top=True)
        attach(rw, root, (sx * 3.43, Dd / 2 + 0.4, 6.4), (0, 0, -90 * sx))
    r2 = hip_roof('TeaRoof2', 5.0, 3.9, 2.4, 0.95, 0.2, roof2, coll)
    attach(r2, root, (0, Dd / 2 + 0.4, 8.5))
    g3 = pk.geo.rounded_box((4.0, 3.0, 2.3), radius=0.1, segments=3, material=warm_plaster,
                            name='TeaTop', collection=coll)
    attach(g3, root, (0, Dd / 2 + 0.4, 9.7))
    for sx in (-1, 0, 1):
        rw = pk.geo.window_panel(cols=1, rows=1, win_w=0.8, win_h=1.1, material=win, name='TeaTopWin',
                                 seed=60 + sx, collection=coll, round_top=True)
        attach(rw, root, (sx * 1.25, Dd / 2 + 0.4 - 1.53, 10.25))
    for sx in (-1, 1):
        rw = pk.geo.window_panel(cols=1, rows=1, win_w=0.8, win_h=1.1, material=win, name='TeaTopWinS',
                                 seed=70 + sx, collection=coll, round_top=True)
        attach(rw, root, (sx * 2.03, Dd / 2 + 0.4, 10.25), (0, 0, -90 * sx))
    roof3 = tile_mat((0.03, 0.12, 0.1), 'PK04_TeaRoof3', mode='hip', W=3.3, D=2.6)
    r3 = hip_roof('TeaRoof3', 3.3, 2.6, 2.3, 0.8, 0.18, roof3, coll)
    attach(r3, root, (0, Dd / 2 + 0.4, 11.9))
    fin = pk.geo.lathe([(0.0, 0.0), (0.32, 0.05), (0.36, 0.25), (0.15, 0.45), (0.22, 0.65), (0.24, 0.85),
                        (0.08, 1.15), (0.1, 1.3), (0.0, 1.5)], segments=20, material=M.brass,
                       name='TeaFinial', collection=coll)
    attach(fin, root, (0, Dd / 2 + 0.4, 14.1))
    pk.lights.point(tuple(root.matrix_world @ Vector((0.0, Dd / 2 - 1.6, 11.6))), (1.0, 0.5, 0.2), 160.0,
                    radius=0.8, shadow=False, name='TeaTopGlow', collection=coll, volume=0.1)
    # eave lanterns (small, red) along the front and at the corners
    items = []
    for x in np.linspace(-6.0, 6.0, 7):
        items.append(((x, -1.0, 4.62), 0))
    for (x, y) in ((-7.5, -1.0), (7.5, -1.0), (-4.9, 2.4), (4.9, 2.4)):
        items.append(((x, y + (0 if y < 0 else 0), 4.6 if y < 0 else 8.4), 1))
    lr = empty('TeaEaveLanterns', coll)
    attach(lr, root)
    for i, (p, k) in enumerate(items):
        o = bpy.data.objects.new('TeaLan%d' % i, srcs['tea_lanterns'][k].data)
        o.parent = lr
        o.location = p
        o.visible_shadow = False
        pk._link(o, coll)
    # THE lantern: huge, round, amber, hanging from a curved bracket over the water
    lx, ly, lz = -4.2, -1.4, 4.25
    bm = bmesh.new()
    bpts = [(lx + 1.0, 1.4, 4.75), (lx + 0.7, 0.6, 5.35), (lx + 0.3, -0.4, 5.85), (lx, ly, 6.05)]
    tube_bm(bm, bpts, 0.13, segs=10)
    tube_bm(bm, [(lx, ly, 6.05), (lx, ly, 6.45)], 0.15, segs=10)
    br = bm_obj('BigLanternBracket', bm, [M.dark_wood], coll)
    attach(br, root)
    R, Hh = 1.35, 2.35
    prof = [(R * (0.34 + 0.66 * math.sin(math.pi * z) ** 0.62), lz - Hh / 2 + z * Hh)
            for z in np.linspace(0, 1, 21)]
    big_mat = paper_mat((1.0, 0.36, 0.05), 1.9, 'PK04_BigLantern', rib_freq=5.5, hot=(1.0, 0.6, 0.2))
    _WEB_BAKE[big_mat.name] = (paper_mat, ((1.0, 0.36, 0.05), 1.9, 'PK04_BigLantern'),
                               dict(rib_freq=5.5, hot=(1.0, 0.6, 0.2)))      # web export only
    bm = bmesh.new()
    bm_lathe(bm, prof, segs=48, mi=0)
    zb, zt_ = prof[0][1], prof[-1][1]
    rb_, rt_ = prof[0][0] * 1.06, prof[-1][0] * 1.06
    bm_lathe(bm, [(0.0, zb - 0.16), (rb_, zb - 0.14), (rb_ + 0.04, zb + 0.06), (0.0, zb + 0.08)], segs=32, mi=1)
    bm_lathe(bm, [(0.0, zt_ - 0.08), (rt_ + 0.04, zt_ - 0.06), (rt_, zt_ + 0.14), (0.0, zt_ + 0.16)], segs=32, mi=1)
    bm_lathe(bm, [(0.03, zt_ + 0.15), (0.03, 6.05)], segs=6, mi=1)
    bm_lathe(bm, [(0.0, zb - 0.16), (0.06, zb - 0.25), (0.12, zb - 0.95), (0.16, zb - 1.15), (0.0, zb - 1.18)],
             segs=12, mi=2)
    big = bm_obj('BigLantern', bm, [big_mat, M.black_lacquer, cached('tassel', lambda: None)], coll,
                 sharp=None, edges=False)
    big.visible_shadow = False
    attach(big, root, (lx, ly, 0.0))
    animate_noise(big, rot_amp=(0.8, 0.8, 1.5), scale_frames=90.0, seed=5)
    Mw = root.matrix_world
    # lights: inside the big lantern, interior spill, warm uplights, eave glow
    pk.lights.point(tuple(Mw @ Vector((lx, ly, lz))), (1.0, 0.45, 0.12), 1000.0, radius=0.9, shadow=True,
                    name='BigLanternLight', collection=coll, volume=0.25)
    pk.lights.area(tuple(Mw @ Vector((0, 2.0, 3.2))), tuple(Mw @ Vector((0, -6.0, 0.5))), size=(9.0, 2.0),
                   color=(1.0, 0.55, 0.22), energy=900.0, name='TeaSpill', collection=coll)
    for x in (-4.5, 0.0, 4.5):
        pk.lights.spot(tuple(Mw @ Vector((x, -0.3, 1.5))), tuple(Mw @ Vector((x * 0.8, 2.5, 7.5))),
                       (1.0, 0.55, 0.2), 700.0, angle_deg=75, blend=0.8, radius=0.2, shadow=False,
                       name='TeaUp', collection=coll, volume=0.0)
    pk.lights.point(tuple(Mw @ Vector((0.0, -0.6, 4.2))), (1.0, 0.35, 0.15), 220.0, radius=1.0, shadow=False,
                    name='TeaEaveGlow', collection=coll, volume=0.2)
    pk.lights.point(tuple(Mw @ Vector((0.0, 1.0, 7.4))), (1.0, 0.5, 0.2), 260.0, radius=1.0, shadow=False,
                    name='TeaUpperGlow', collection=coll, volume=0.1)
    return root


# ============================================================================ far tower

def far_tower(M, coll, path, s, lat):
    root = empty('Tower', coll, frame_at(path, s, lat, QUAY_Z, 180.0))
    root.scale = (1.3, 1.3, 1.3)
    pl = cheap_plaster((0.22, 0.2, 0.5), 'PK04_TowerPlaster')
    rf = tile_mat((0.03, 0.06, 0.12), 'PK04_TowerRoof', mode='hip', W=4.0, D=4.0)
    neon = pk.mat.neon_tube(TEAL, 16.0, name='PK04_TowerNeon')
    win = pk.mat.lit_window(PINK_WIN, strength=14.0, name='PK04_TowerWin', mullions=(1, 2))
    winw = pk.mat.lit_window(WARM_WIN, strength=16.0, name='PK04_TowerWinW', mullions=(1, 2))
    z = 0.0
    size = 3.6
    for k in range(5):
        h = 4.6 if k == 0 else 3.4
        b = pk.geo.rounded_box((size * 1.6, size * 1.6, h), radius=0.15, segments=2, material=pl,
                               name='TowerTier%d' % k, collection=coll, edges=False)
        attach(b, root, (0, 0, z))
        for ang in (0, 90, 180, 270):
            wp = pk.geo.window_panel(cols=2 if k < 2 else 1, rows=1, win_w=0.8, win_h=1.4, gap_x=0.6,
                                     material=win if (k + ang // 90) % 2 else winw, name='TowerWin',
                                     seed=k * 4 + ang, collection=coll, round_top=True)
            a = rad(ang)
            attach(wp, root, (math.sin(a) * (size * 0.8 + 0.03) * -1, -math.cos(a) * (size * 0.8 + 0.03), z + 1.0),
                   (0, 0, ang))
        z += h
        W = size * 1.25
        r = hip_roof('TowerRoof%d' % k, W, W, 1.1 if k < 4 else 3.6, 0.7, 0.18, rf, coll, n=16)
        attach(r, root, (0, 0, z - 0.2))
        ring = []
        for i in range(65):
            u = i / 64.0
            per = 8 * W
            d_ = u * per
            for L, p0, dv in ((2 * W, (-W, -W), (1, 0)), (2 * W, (W, -W), (0, 1)),
                              (2 * W, (W, W), (-1, 0)), (2 * W, (-W, W), (0, -1))):
                if d_ <= L + 1e-9:
                    x, y = p0[0] + dv[0] * d_, p0[1] + dv[1] * d_
                    break
                d_ -= L
            ax, ay = abs(x) / W, abs(y) / W
            ring.append((x, y, z - 0.2 + 0.7 * (ax * ay) ** 4 + 0.05))
        nt_ = pk.geo.tube_along(ring, radius=0.08, segments=6, material=neon, name='TowerNeon%d' % k,
                                collection=coll)
        attach(nt_, root)
        size *= 0.84
    fin = pk.geo.lathe([(0.0, 0.0), (0.3, 0.1), (0.15, 0.5), (0.25, 0.9), (0.06, 1.6), (0.0, 2.6)],
                       segments=12, material=M.brass, name='TowerFinial', collection=coll)
    attach(fin, root, (0, 0, z + 3.2))
    Mw = root.matrix_world
    for ang, col in ((-35, MAGENTA), (35, COBALT)):
        a = rad(ang)
        p = Mw @ Vector((math.sin(a) * 9, -math.cos(a) * 9, 0.5))
        tgt = Mw @ Vector((0, 0, 14))
        pk.lights.spot(tuple(p), tuple(tgt), col, 9000.0, angle_deg=35, blend=0.8, radius=0.3, shadow=False,
                       name='TowerUp', collection=coll, volume=0.0)
    return root


# ============================================================================ boats

def boat_hull_bm(bm, L, Wd, H, mi_out=0, mi_in=1, mi_rim=2, canopy=False, mi_canopy=3):
    """Small canal boat: lofted hull shell (outside + inside), cap rail, thwarts."""
    ny, nx = 24, 9
    outer, inner = [], []
    for i in range(ny + 1):
        t = -1 + 2 * i / ny
        hw = Wd / 2 * max(0.0, 1 - abs(t) ** 2.4) ** 0.55
        zt = H + 0.22 * t ** 4
        ro, ri = [], []
        for j in range(nx + 1):
            u = -1 + 2 * j / nx
            a = u * math.pi / 2
            x = hw * math.sin(a)
            z = zt - (zt + 0.05) * math.cos(a) ** 1.4 * 0.95 - 0.05 * math.cos(a)
            ro.append(bm.verts.new((x, t * L / 2, z)))
            ri.append(bm.verts.new((x * 0.88, t * L / 2 * 0.97, z + 0.06 * math.cos(a) + 0.02)))
        outer.append(ro)
        inner.append(ri)
    for i in range(ny):
        for j in range(nx):
            f = bm.faces.new((outer[i][j], outer[i][j + 1], outer[i + 1][j + 1], outer[i + 1][j]))
            f.material_index = mi_out
            f = bm.faces.new((inner[i][j], inner[i + 1][j], inner[i + 1][j + 1], inner[i][j + 1]))
            f.material_index = mi_in
    for i in range(ny):
        for j in (0, nx):
            q = (outer[i][j], outer[i + 1][j], inner[i + 1][j], inner[i][j])
            f = bm.faces.new(q)
            f.material_index = mi_rim
    for j in range(nx):
        for i in (0, ny):
            try:
                f = bm.faces.new((outer[i][j], inner[i][j], inner[i][j + 1], outer[i][j + 1]))
                f.material_index = mi_rim
            except ValueError:
                pass
    # cap rails
    for j in (0, nx):
        pts = [tuple((outer[i][j].co + inner[i][j].co) / 2 + Vector((0, 0, 0.03))) for i in range(1, ny)]
        tube_bm(bm, pts, 0.045, segs=6, mi=mi_rim)
    # thwarts
    for t in (-0.35, 0.3):
        hw = Wd / 2 * max(0.0, 1 - abs(t) ** 2.4) ** 0.55
        bm_box(bm, (0, t * L / 2, H - 0.12), (hw * 1.7, 0.28, 0.06), mi=mi_rim)
    if canopy:
        cl = L * 0.32
        r = Wd * 0.43
        pts = []
        for k in range(13):
            a = math.pi * k / 12
            pts.append((r * math.cos(a), r * math.sin(a)))
        for face in (0,):
            vs_out = []
            for yy in np.linspace(-cl / 2, cl / 2, 6):
                vs_out.append([bm.verts.new((x, yy - L * 0.05, H + z * 1.1 - 0.05)) for (x, z) in pts])
            for i in range(5):
                for k in range(12):
                    f = bm.faces.new((vs_out[i][k], vs_out[i][k + 1], vs_out[i + 1][k + 1], vs_out[i + 1][k]))
                    f.material_index = mi_canopy
            for i in range(6):
                ring = [Vector((x * 1.03, 0, H + z * 1.13 - 0.05)) for (x, z) in pts]
                yy = -cl / 2 + cl * i / 5 - L * 0.05
                tube_bm(bm, [tuple(p + Vector((0, yy, 0))) for p in ring], 0.025, segs=5, mi=mi_rim)


def moored_boat(M, coll, path, s, lat, idx, rng, lantern_srcs, lantern_cols):
    L = rng.uniform(4.2, 5.6)
    Wd = rng.uniform(1.3, 1.6)
    H = rng.uniform(0.5, 0.62)
    canopy = rng.random() < 0.45
    bm = bmesh.new()
    boat_hull_bm(bm, L, Wd, H, canopy=canopy)
    paint = M.wood_paint[rng.randrange(len(M.wood_paint))]
    canopy_m = cached('canopy', lambda: pk.mat.painted_wood((0.06, 0.045, 0.035), name='PK04_Canopy',
                                                            wear=0.15, brush_axis='X'))
    ob = bm_obj('Boat%d' % idx, bm, [paint, M.dark_wood, M.dark_wood, canopy_m], coll, sharp=None)
    ob.matrix_world = frame_at(path, s, lat, -0.06, rng.uniform(-4, 4))
    animate_noise(ob, loc_amp=(0.0, 0.0, 0.02), rot_amp=(0.8, 0.6, 0.3), scale_frames=55.0, seed=idx)
    # stern pole lantern
    if rng.random() < 0.7:
        k = rng.randrange(len(lantern_srcs))
        pole = pk.geo.tube_along([(0, -L * 0.36, H - 0.1), (0, -L * 0.38, H + 1.0), (0, -L * 0.3, H + 1.2)],
                                 radius=0.025, segments=6, material=M.dark_wood, name='BoatPole%d' % idx,
                                 collection=coll)
        attach(pole, ob)
        o = bpy.data.objects.new('BoatLan%d' % idx, lantern_srcs[k].data)
        o.visible_shadow = False
        pk._link(o, coll)
        attach(o, ob, (0, -L * 0.3, H + 1.2))
        lo = pk.lights.point((0, 0, 0), lantern_cols[k], 22.0, radius=0.12, shadow=False,
                             name='BoatLight%d' % idx, collection=coll, volume=0.1)
        attach(lo, ob, (0, -L * 0.3, H + 0.85))
    return ob


# ============================================================================ paper animals

def animal_lantern(coll, kind, color, strength, length, name, patch=None):
    """Floating paper animal lanterns (body along +Y, head at y=0, up +Z)."""
    bm = bmesh.new()
    R = Matrix.Rotation(rad(-90), 4, 'X')
    if kind == 'koi':
        prof = [(0.0, 0.0), (0.07, 0.02), (0.125, 0.08), (0.155, 0.2), (0.16, 0.33), (0.145, 0.5),
                (0.11, 0.66), (0.07, 0.8), (0.045, 0.88), (0.035, 0.92)]
    elif kind == 'whale':
        prof = [(0.0, 0.0), (0.09, 0.015), (0.16, 0.06), (0.2, 0.15), (0.21, 0.28), (0.195, 0.45),
                (0.15, 0.63), (0.1, 0.78), (0.06, 0.88), (0.04, 0.93)]
    else:   # bird body
        prof = [(0.0, 0.0), (0.06, 0.03), (0.08, 0.1), (0.07, 0.17), (0.1, 0.3), (0.115, 0.45),
                (0.09, 0.62), (0.05, 0.75), (0.02, 0.82)]
    prof = [(r * length, z * length) for r, z in prof]
    vs = bm_lathe(bm, prof, segs=28, mi=0)
    sq = Matrix.Diagonal((1.0, 1.0, 0.85 if kind == 'whale' else 1.0, 1.0))
    bmesh.ops.transform(bm, matrix=sq @ R, verts=vs)

    def flat(poly, plane, thick, mi=1):
        # plane 'yz': poly (y, z), thin in x; 'xy': poly (x, y), thin in z
        if plane == 'yz':
            bm_prism(bm, [(p[0], p[1]) for p in poly], -thick / 2, thick / 2, axis='x', mi=mi)
        else:
            A = [bm.verts.new((p[0], p[1], -thick / 2)) for p in poly]
            B = [bm.verts.new((p[0], p[1], thick / 2)) for p in poly]
            bm.faces.new(A)
            bm.faces.new(list(reversed(B)))
            for i in range(len(poly)):
                i2 = (i + 1) % len(poly)
                bm.faces.new((A[i], A[i2], B[i2], B[i]))
    L = length
    if kind == 'koi':
        flat([(0.86 * L, 0.0), (1.05 * L, 0.13 * L), (1.24 * L, 0.24 * L), (1.12 * L, 0.04 * L),
              (1.26 * L, -0.2 * L), (1.04 * L, -0.11 * L)], 'yz', 0.02 * L)
        flat([(0.25 * L, 0.13 * L), (0.36 * L, 0.27 * L), (0.6 * L, 0.2 * L), (0.62 * L, 0.1 * L)], 'yz',
             0.015 * L)
        for sx in (-1, 1):
            A = [(sx * 0.13 * L, 0.22 * L), (sx * 0.3 * L, 0.36 * L), (sx * 0.22 * L, 0.42 * L),
                 (sx * 0.12 * L, 0.32 * L)]
            flat(A, 'xy', 0.01 * L)
    elif kind == 'whale':
        for sx in (-1, 1):
            flat([(0.0, 0.88 * L), (sx * 0.16 * L, 0.96 * L), (sx * 0.33 * L, 1.06 * L),
                  (sx * 0.27 * L, 1.09 * L), (sx * 0.1 * L, 1.04 * L), (0.0, 1.0 * L)], 'xy', 0.025 * L)
            flat([(sx * 0.17 * L, 0.3 * L), (sx * 0.36 * L, 0.42 * L), (sx * 0.34 * L, 0.48 * L),
                  (sx * 0.17 * L, 0.4 * L)], 'xy', 0.015 * L)
        flat([(0.55 * L, 0.15 * L), (0.66 * L, 0.24 * L), (0.7 * L, 0.14 * L)], 'yz', 0.02 * L)
    else:
        def slab3(pts3, th):
            A = [bm.verts.new((p[0], p[1], p[2] - th / 2)) for p in pts3]
            B = [bm.verts.new((p[0], p[1], p[2] + th / 2)) for p in pts3]
            bm.faces.new(A)
            bm.faces.new(list(reversed(B)))
            for i in range(len(pts3)):
                i2 = (i + 1) % len(pts3)
                bm.faces.new((A[i], A[i2], B[i2], B[i]))
        for sx in (-1, 1):
            # gull wing: inner panel rising, outer panel swept back and drooping to a point
            slab3([(sx * 0.05 * L, 0.24 * L, 0.0), (sx * 0.45 * L, 0.2 * L, 0.2 * L),
                   (sx * 0.47 * L, 0.42 * L, 0.18 * L), (sx * 0.05 * L, 0.5 * L, 0.0)], 0.014 * L)
            slab3([(sx * 0.45 * L, 0.2 * L, 0.2 * L), (sx * 0.8 * L, 0.3 * L, 0.12 * L),
                   (sx * 1.08 * L, 0.55 * L, 0.0), (sx * 0.47 * L, 0.42 * L, 0.18 * L)], 0.012 * L)
        slab3([(0.0, 0.72 * L, 0.0), (0.2 * L, 1.02 * L, -0.02 * L), (0.06 * L, 0.96 * L, -0.01 * L),
               (0.0, 0.88 * L, 0.0), (-0.06 * L, 0.96 * L, -0.01 * L), (-0.2 * L, 1.02 * L, -0.02 * L)],
              0.01 * L)
        ret = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.075 * L)
        bmesh.ops.translate(bm, verts=ret['verts'], vec=(0, -0.02 * L, 0.05 * L))
        bm_lathe(bm, [(0.0, 0.0), (0.03 * L, 0.0), (0.0, 0.12 * L)], segs=8, mi=2,
                 M=Matrix.Translation((0, -0.08 * L, 0.04 * L)) @ Matrix.Rotation(rad(90), 4, 'X'))
    for f in bm.faces:
        if f.material_index != 2:
            f.material_index = 0
    if kind == 'whale':
        for v in bm.verts:
            if v.co.y > 0.5 * L:
                v.co.z += 0.3 * L * ((v.co.y - 0.5 * L) / (0.5 * L)) ** 2
    elif kind == 'koi':
        for v in bm.verts:
            if v.co.y > 0.45 * L:
                v.co.z += 0.1 * L * ((v.co.y - 0.45 * L) / (0.55 * L)) ** 2
    # eyes
    if kind != 'bird':
        ex = (0.11 if kind == 'koi' else 0.14) * L
        ey = (0.09 if kind == 'koi' else 0.12) * L
        for sx in (-1, 1):
            ret = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.025 * L)
            bmesh.ops.translate(bm, verts=ret['verts'], vec=(sx * ex, ey, 0.03 * L))
            for v in ret['verts']:
                for f in v.link_faces:
                    f.material_index = 1
            # painted ring around the eye (a flat cream disc just proud of the paper)
            ret = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.042 * L)
            bmesh.ops.transform(bm, matrix=Matrix.Translation((sx * (ex - 0.008 * L), ey, 0.03 * L)) @
                                Matrix.Diagonal((0.35, 1.0, 1.0, 1.0)), verts=ret['verts'])
            for v in ret['verts']:
                for f in v.link_faces:
                    f.material_index = 3
    # red tassels hanging under the body (it is a lantern)
    tz = -(0.2 if kind == 'whale' else 0.15) * L * (0.85 if kind == 'whale' else 1.0)
    for ty in ((0.3, 0.62) if kind != 'bird' else (0.4,)):
        bm_lathe(bm, [(0.0, 0.0), (0.004 * L, -0.002 * L), (0.004 * L, -0.06 * L), (0.0, -0.062 * L)], segs=5, mi=2,
                 M=Matrix.Translation((0.0, ty * L, tz)))
        bm_lathe(bm, [(0.0, -0.06 * L), (0.012 * L, -0.07 * L), (0.02 * L, -0.15 * L), (0.0, -0.155 * L)], segs=8,
                 mi=2, M=Matrix.Translation((0.0, ty * L, tz)))
    pm = animal_paper_mat(color, strength, 'PK04_Animal_' + name, L, patch=patch, patch_scale=3.0 / L,
                          rib_n=13.0 if kind == 'whale' else 10.0, kind=kind, seed=float(len(name)))
    _WEB_BAKE[pm.name] = (animal_paper_mat, (color, strength, 'PK04_Animal_' + name, L),     # web export only
                          dict(patch=patch, patch_scale=3.0 / L, rib_n=13.0 if kind == 'whale' else 10.0, kind=kind))
    ob = bm_obj(name, bm, [pm, cached('eye', lambda: pk.mat.basic((0.01, 0.01, 0.012), roughness=0.15,
                                                                   name='PK04_Eye')),
                           cached('beak', lambda: pk.mat.basic((0.9, 0.55, 0.15), roughness=0.4,
                                                               name='PK04_Beak')),
                           cached('eyering', lambda: pk.mat.basic((0.95, 0.9, 0.8), roughness=0.5,
                                                                  emission=(1.0, 0.92, 0.8), strength=3.0,
                                                                  name='PK04_EyeRing'))],
                coll, sharp=None, edges=False)
    ob.visible_shadow = False
    return ob


# ============================================================================ boat bow (vehicle)

def build_bow(cam, M, coll):
    """The bow of our own small wooden boat, in the car frame (X right, Y forward, Z up,
    origin at the eye)."""
    y_tip = 2.6
    z_tip = pk.vehicle.cover_z(cam, BOW_COVER, y_tip)
    y0, yc, Wmax = -0.5, 0.2, 0.8

    def hw(y):
        if y <= yc:
            return Wmax
        t = (y - yc) / (y_tip - yc)
        return Wmax * max(0.0, 1 - t ** 1.3)

    def zg(y):
        t = (y_tip - y) / (y_tip - y0)
        return z_tip - 0.17 * t ** 1.3

    eye = cam.get('pk_height', 1.35)
    zw = -eye
    ys = list(np.linspace(y0, y_tip - 0.02, 34)) + [y_tip]
    parts = []
    # hull shell (outside) and the deck
    bm = bmesh.new()
    nx = 10
    rows = []
    for y in ys:
        w = max(hw(y), 0.004)
        row = []
        for j in range(nx + 1):
            u = -1 + 2 * j / nx
            a = u * math.pi / 2
            x = w * math.sin(a) * (1.0 + 0.08 * math.cos(a))
            z = zg(y) - (zg(y) - zw + 0.25) * math.cos(a) ** 1.2
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for i in range(len(ys) - 1):
        for j in range(nx):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    hull = bm_obj('BowHull', bm, [cached('hullpaint', lambda: pk.mat.painted_wood(
        (0.04, 0.17, 0.2), name='PK04_HullPaint', wear=0.35))], coll, sharp=None, recalc=False)
    parts.append(hull)
    # deck (planked, slightly cambered), sits just under the cap rails
    bm = bmesh.new()
    drows = []
    nd = 12
    for y in ys:
        w = max(hw(y) - 0.05, 0.002)
        row = []
        for j in range(nd + 1):
            u = -1 + 2 * j / nd
            row.append(bm.verts.new((w * u, y, zg(y) - 0.075 + 0.035 * (1 - u * u))))
        drows.append(row)
    for i in range(len(ys) - 1):
        for j in range(nd):
            bm.faces.new((drows[i][j], drows[i][j + 1], drows[i + 1][j + 1], drows[i + 1][j]))
    deck_mat = pk.mat.varnished_wood(name='PK04_BowDeck', light=(0.3, 0.15, 0.06), dark=(0.1, 0.045, 0.018),
                                     planks=0.105, axis='Y', roughness=0.62, varnish=0.1)
    deck = bm_obj('BowDeck', bm, [deck_mat], coll, sharp=None)
    parts.append(deck)
    # cap rails (varnished) and a brass rub strip on the hull side
    bm = bmesh.new()
    for sx in (-1, 1):
        pts = [(sx * hw(y) * 0.985, y, zg(y) + 0.01) for y in ys[:-1]] + [(0.0, y_tip + 0.02, z_tip + 0.01)]
        tube_bm(bm, pts, 0.042, segs=10)
    rails = bm_obj('BowRails', bm, [cached('railwood', lambda: pk.mat.varnished_wood(
        name='PK04_RailWood', light=(0.36, 0.14, 0.05), dark=(0.12, 0.04, 0.015), roughness=0.25))],
        coll, sharp=None)
    parts.append(rails)
    bm = bmesh.new()
    for sx in (-1, 1):
        pts = [(sx * hw(y) * 1.06, y, zg(y) - 0.13) for y in ys[:-2]] + [(0.0, y_tip + 0.03, z_tip - 0.13)]
        tube_bm(bm, pts, 0.016, segs=6)
    rub = bm_obj('BowRub', bm, [M.brass], coll, sharp=None)
    parts.append(rub)
    # stem post: red lacquer, curling forward, brass knob
    stem_pts = [(0.0, y_tip - 0.06, z_tip - 0.05), (0.0, y_tip + 0.0, z_tip + 0.03),
                (0.0, y_tip + 0.035, z_tip + 0.07), (0.0, y_tip + 0.03, z_tip + 0.1)]
    bm = bmesh.new()
    tube_bm(bm, stem_pts, [0.045, 0.042, 0.038, 0.035], segs=12)
    stem = bm_obj('BowStem', bm, [M.red_lacquer], coll, sharp=None)
    parts.append(stem)
    knob = pk.geo.lathe([(0.0, -0.02), (0.038, 0.0), (0.045, 0.03), (0.03, 0.06), (0.0, 0.075)], segments=16,
                        material=M.brass, name='BowKnob', collection=coll)
    knob.location = (0.0, y_tip + 0.03, z_tip + 0.11)
    parts.append(knob)
    # rope coil on the left
    bm = bmesh.new()
    cx, cy = -0.2, 1.38
    zc = zg(cy) - 0.04
    pts = []
    for i in range(160):
        a = i / 160 * 2 * math.pi * 3.6
        r = 0.13 - 0.018 * (i / 160 * 3.6)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a) * 0.9, zc + 0.025 + 0.012 * (i / 160)))
    tube_bm(bm, pts, 0.017, segs=7)
    rope = bm_obj('BowRope', bm, [cached('rope', lambda: pk.mat.clay((0.55, 0.45, 0.32), name='PK04_Rope',
                                                                       roughness=0.9, bumps=0.8,
                                                                       grime=0.2, scale=0.2))],
                  coll, sharp=None)
    parts.append(rope)
    # teapot and cup on the right
    tx, ty = 0.19, 1.5
    tz = zg(ty) - 0.045
    bm = bmesh.new()
    bm_lathe(bm, [(0.0, 0.0), (0.055, 0.0), (0.075, 0.03), (0.08, 0.06), (0.065, 0.1), (0.035, 0.115),
                  (0.03, 0.125), (0.012, 0.14), (0.0, 0.142)], segs=20,
             M=Matrix.Translation((tx, ty, tz)))
    tube_bm(bm, [(tx - 0.07, ty + 0.0, tz + 0.04), (tx - 0.1, ty, tz + 0.07), (tx - 0.125, ty, tz + 0.11)], 0.012, 6)
    tube_bm(bm, [(tx + 0.07, ty, tz + 0.09), (tx + 0.11, ty, tz + 0.085), (tx + 0.11, ty, tz + 0.04),
                 (tx + 0.072, ty, tz + 0.03)], 0.01, 6)
    bm_lathe(bm, [(0.0, 0.0), (0.03, 0.0), (0.038, 0.045), (0.034, 0.045), (0.026, 0.006), (0.0, 0.006)],
             segs=16, M=Matrix.Translation((tx - 0.02, ty - 0.17, tz)))
    pot = bm_obj('BowTeapot', bm, [cached('celadon', lambda: pk.mat.toy_plastic(
        (0.32, 0.55, 0.5), name='PK04_Celadon', roughness=0.18, coat=0.8, sss=0.05))], coll, sharp=None)
    parts.append(pot)
    # round 3: a tapered bamboo pole rising from the stem and arching forward, the bow lantern
    # hanging from its hook over the water just ahead of the bow, left of the stem (was a black
    # iron pipe in the bottom-right corner, under the phone UI); its light pools on the water
    # and the bow wave right below it
    yl = y_tip + 0.5
    hw_l = pk.vehicle.half_width(cam, yl)
    xl = (LANTERN_FX - 0.5) * 2.0 * hw_l - BOW_X        # pre-offset car-frame x
    zl = pk.vehicle.cover_z(cam, LANTERN_FY, yl)        # lantern centre
    hang = zl + 0.1 + 0.11                              # string 0.1 + half the lantern
    p0 = Vector((0.0, y_tip - 0.32, zg(y_tip - 0.32) - 0.02))
    p2 = Vector((xl + 0.02, yl, hang + 0.1))
    p1 = Vector((xl * 0.45, y_tip + (yl - y_tip) * 0.3, hang + 0.05))
    pole_pts = [tuple(p0.lerp(p1, u) * (1 - u) + p1.lerp(p2, u) * u) for u in np.linspace(0, 1, 18)]
    pole_pts += [(xl + 0.02, yl + 0.02, hang + 0.08), (xl, yl, hang + 0.02)]
    rad_ = list(np.linspace(0.024, 0.011, len(pole_pts) - 2)) + [0.006, 0.006]
    bm = bmesh.new()
    tube_bm(bm, pole_pts, rad_, segs=10)
    # bamboo nodes: slightly proud rings every few samples
    for k in (3, 7, 11, 15):
        a_, b_ = Vector(pole_pts[k]), Vector(pole_pts[k + 1])
        tube_bm(bm, [tuple(a_.lerp(b_, 0.35)), tuple(a_.lerp(b_, 0.65))], rad_[k] * 1.25, segs=10)
    # lashing where it meets the stem
    bm_box(bm, (0.0, y_tip - 0.3, zg(y_tip - 0.3) + 0.0), (0.07, 0.09, 0.06))
    pole = bm_obj('BowPole', bm, [cached('bamboo', lambda: pk.mat.varnished_wood(
        name='PK04_Bamboo', light=(0.42, 0.3, 0.12), dark=(0.2, 0.12, 0.04), roughness=0.35, axis='Z',
        varnish=0.4))], coll, sharp=None)
    parts.append(pole)
    lan_src = lantern_source('BowLantern', (1.0, 0.5, 0.2), 1.6, coll, height=0.22, radius=0.095,
                             string=0.1, shape='round', segs=20)
    lan_src.location = (xl, yl, hang)
    parts.append(lan_src)
    lm = lan_src.data.materials[0]          # web export only: bake it, facing the camera
    _WEB_BAKE[lm.name] = (paper_mat, ((1.0, 0.5, 0.2), 1.6, lm.name), dict(rib_freq=8.0 / 0.22, _view=True))
    wake = bow_wake(M, coll, y_tip, hw, eye)
    parts.append(wake)
    for p in parts:
        p.location.x += BOW_X
        pk.vehicle.attach(p, cam)
    # round 5: everything but the wake (which lies on the water) rocks against the eye
    bow_rock(cam, coll, [p for p in parts if p is not wake])
    # the bow lantern swings on its hook (pendulum, two incommensurate periods). Round 5: wider
    # swing (was 4.5 and 3 deg, about 6 px), and it hangs plumb: the boat's roll and pitch are
    # taken back out, so the bow rocks under it
    lan_src.rotation_mode = 'XYZ'
    lan_src.keyframe_insert('rotation_euler', frame=0)
    fa, fp, sa, sp = LANTERN_SWING
    add_sines(lan_src, 'rotation_euler', 0, [(fa, fp, 0.7)] + [(-a, p_, ph) for a, p_, ph in BOAT_PITCH])
    add_sines(lan_src, 'rotation_euler', 1, [(sa, sp, 1.7)] + [(-a, p_, ph) for a, p_, ph in BOAT_ROLL])
    bl = pk.lights.point((0, 0, 0), (1.0, 0.56, 0.26), BOW_LANTERN_W, radius=0.07, shadow=False,
                         name='BowLanternLight', volume=0.05)
    bl.parent = lan_src
    bl.matrix_parent_inverse = Matrix.Identity(4)
    bl.location = (0.0, 0.0, -0.21)
    pk.mark_moving(bl)
    bl['pk_vehicle'] = True
    fl = pk.vehicle.cabin_light(cam, location=(BOW_X, 1.6, z_tip + 1.1), target=(BOW_X, 1.7, z_tip - 0.1),
                                size=(1.8, 1.4), color=(0.4, 0.55, 1.0), energy=9.0,
                                receivers=[deck, rails, stem, knob, rope, pot, pole, hull], name='BowFill')
    # the lantern also lights the stem, rails and deck from in front (a warm rim on the bow)
    bl2 = pk.lights.point((0, 0, 0), (1.0, 0.55, 0.25), 4.0, radius=0.05, shadow=False, name='BowLanternRim',
                          volume=0.0)
    bl2.parent = lan_src
    bl2.matrix_parent_inverse = Matrix.Identity(4)
    bl2.location = (0.0, -0.15, -0.2)
    pk.mark_moving(bl2)
    bl2['pk_vehicle'] = True
    fl.data.specular_factor = 0.15
    bl.data.specular_factor = 0.35
    return parts


def bow_rock(cam, coll, parts):
    """Round 5: the share of the boat's roll, pitch and yaw that the rower's head does not
    follow, plus a little heave the torso absorbs, applied to the bow parts about ROCK_PIVOT
    (car frame). Chain: VehicleRig > BowPivot (at the pivot) > BowRock (animated) > BowUnpivot
    (back at the eye) > parts, so the parts keep their car-frame locations and keys."""
    def node(name, parent, loc):
        e = bpy.data.objects.new(name, None)
        e.location = loc
        pk._link(e, coll)
        pk.vehicle.attach(e, cam)        # PK_Vehicle collection + constant location keys
        if parent is not None:
            e.parent = parent
            e.matrix_parent_inverse = Matrix.Identity(4)
        return e
    piv = node('BowPivot', None, ROCK_PIVOT)
    rock = node('BowRock', piv, (0.0, 0.0, 0.0))
    rock.rotation_mode = 'XYZ'
    rock.keyframe_insert('rotation_euler', frame=0)
    add_sines(rock, 'rotation_euler', 1, BOAT_ROLL, 1.0 - HEAD_FOLLOW['roll'])
    add_sines(rock, 'rotation_euler', 0, BOAT_PITCH, 1.0 - HEAD_FOLLOW['pitch'])
    add_sines(rock, 'rotation_euler', 2, BOAT_YAW, 1.0 - HEAD_FOLLOW['yaw'])
    add_sines(rock, 'location', 2, BOW_HEAVE, deg=False)
    unp = node('BowUnpivot', rock, tuple(-v for v in ROCK_PIVOT))
    for p in parts:
        p.parent = unp
        p.matrix_parent_inverse = Matrix.Identity(4)
    return rock


def bow_wake(M, coll, y_tip, hw, eye):
    """Bow wave: two foam ribbons peeling off the stem along the hull and a pair of fainter
    diverging ripple lines further out (car frame, just above the water). The foam pattern
    streams backward at the boat speed."""
    m, nt, out = pk._new_mat('PK04_Foam')
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    t = pk.time_value(nt)
    ys = pk.math_(nt, 'ADD', y, pk.math_(nt, 'MULTIPLY', t, SPEED))
    n1, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', x, 15.0), pk.math_(nt, 'MULTIPLY', ys, 6.5),
                                     pk.math_(nt, 'MULTIPLY', t, 1.2)), scale=1.0, detail=5.0, rough=0.7)
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    edge = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, U, 0.0, 0.35, 0.0, 1.0, interp='SMOOTHSTEP'),
                    pk.maprange(nt, U, 0.55, 1.0, 1.0, 0.0, interp='SMOOTHSTEP'))
    fade = pk.maprange(nt, V, 0.0, 1.0, 1.0, 0.15)
    a = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', pk.maprange(nt, n1, 0.44, 0.66, 0.0, 1.0), edge), fade)
    a = pk.math_(nt, 'MINIMUM', pk.math_(nt, 'MULTIPLY', a, 0.85), 1.0)
    col = (0.72, 0.76, 0.82)
    p = pk._principled(nt, base=col, rough=0.4, spec=0.5, alpha=a, emit=(0.6, 0.7, 0.9),
                       emit_strength=pk.math_(nt, 'MULTIPLY', a, 0.22))
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=col, rough=0.5, alpha=0.4)
    verts, faces, uvs = [], [], []
    zw = -eye + 0.055     # above the camera heave + roll (the rig moves, the water does not)
    # (angle offset outside the hull in m per m back, start width, end width, length)
    for sx in (-1, 1):
        # round 3: from the eye (1.25 m up) the water is hidden until about 2.5 m ahead, i.e. at
        # the stem, so the foam fans out wide from the stem (divergent bow waves) and reaches
        # the bottom corners of the frame as a V of leading lines
        # (start ahead of the stem, lateral spread per m back, start width, end width, length)
        for (y0off, grow, w0, w1, ln) in ((0.32, 1.9, 0.1, 0.36, 0.8), (0.78, 1.25, 0.06, 0.24, 1.1)):
            n = 16
            base = len(verts)
            for k in range(n + 1):
                u = k / n
                yy = y_tip + y0off - ln * u
                lat = 0.015 + grow * ln * u + 0.05 * math.sin(u * 8.0 + y0off * 5.0 + sx)
                w = w0 + (w1 - w0) * u
                for j, lw in enumerate((lat, lat + w)):
                    verts.append((sx * lw, yy, zw))
            for k in range(n):
                a0 = base + 2 * k
                f = (a0, a0 + 1, a0 + 3, a0 + 2) if sx > 0 else (a0, a0 + 2, a0 + 3, a0 + 1)
                faces.append(f)
                for (kk, jj) in ((k, 0), (k, 1), (k + 1, 1), (k + 1, 0)) if sx > 0 else \
                        ((k, 0), (k + 1, 0), (k + 1, 1), (k, 1)):
                    uvs.append((jj * 1.0, kk / n))
    ob = pk.mesh_object('BowWake', verts, faces, uvs=uvs, material=m, collection=coll)
    ob.visible_shadow = False
    ob['pk_noexport'] = True
    return ob


# ============================================================================ sky

def plate_scale():
    """Processed-plate pixels per source pixel."""
    return PLATE_PXDEG / (PLATE_FPX / PLATE_MAG * math.pi / 180.0)


def plate_dims():
    """Processed plate size (W, H) in pixels."""
    x0, y0, x1, y1 = PLATE_CROP
    sc = plate_scale()
    return int(round((x1 - x0) * sc)), int(round((y1 - y0) * sc))


def sky_crop(frame):
    """Cached, cleaned crop of the ESO potw1713a plate (galactic core region, no horizon).

    The 8-bit source has strong chroma noise and lateral colour fringes at 1:1, and the GPU
    mip-maps a plate shown at 2 source px per output px into soft blobs. So the crop is
    resized in linear light (Lanczos) to about 1.1 plate px per output px, split into a
    starless layer (grey opening) and a point-star layer; the starless layer gets its
    chroma noise smoothed and a black point, the stars are desaturated and the faintest
    ones cut (fewer, crisper stars).

    Round 3: the plate sits at a fixed sky orientation, so every plate pixel has a fixed
    elevation; atmospheric extinction near the horizon is baked in from `frame`
    (forward, right, up, F): stars fade to SKY_FADE[0] and the glow to SKY_FADE[1] at the
    horizon over SKY_FADE[2] degrees (a rect layer has no kit fade, and the web export gets
    the identical image). Written as a 16-bit linear-light sRGB PNG."""
    x0, y0, x1, y1 = PLATE_CROP
    sc = plate_scale()
    f, r, u, F = frame
    fk = pk._hash(tuple(round(c, 5) for c in tuple(f) + tuple(r) + tuple(u)), round(F, 3), SKY_FADE,
                  STAR_CUT, STAR_SAT)
    key = '04lc_p1713_%s_%d_%d_%d_%d_%d_%s' % ((PLATE_VER,) + tuple(PLATE_CROP) + (int(PLATE_PXDEG * 10), fk))
    path = os.path.join(pk.CACHE_DIR, key + '.png')
    if os.path.exists(path):
        return path
    import OpenImageIO as oiio
    t0 = 0
    os.makedirs(pk.CACHE_DIR, exist_ok=True)
    buf = oiio.ImageBuf(PLATE)
    roi = oiio.ROI(x0, x1, y0, y1, 0, 1, 0, 3)
    a = np.asarray(buf.get_pixels(oiio.FLOAT, roi), np.float32)[..., :3]
    a = pk._srgb_to_lin(a).astype(np.float32)
    H, W = a.shape[:2]
    W2, H2 = int(round(W * sc)), int(round(H * sc))
    src = oiio.ImageBuf(oiio.ImageSpec(W, H, 3, oiio.FLOAT))
    src.set_pixels(oiio.ROI(0, W, 0, H, 0, 1, 0, 3), np.ascontiguousarray(a))
    del a
    dst = oiio.ImageBufAlgo.resize(src, filtername='lanczos3', roi=oiio.ROI(0, W2, 0, H2, 0, 1, 0, 3))
    del src
    a = np.maximum(np.asarray(dst.get_pixels(oiio.FLOAT), np.float32)[..., :3], 0.0)
    del dst
    luma = np.array(pk.LUMA, np.float32)
    # starless glow + dust (grey opening, 2 px), stars = the rest
    bg = pk.starless(a, star_radius=2, peak_ratio=2.5, smooth=1)
    bg = np.minimum(bg, a)
    st = np.maximum(a - bg, 0.0)
    # background: smooth chroma (keep luminance detail), black point
    Lb = (bg * luma).sum(-1)
    chrom = bg / np.maximum(Lb, 1e-5)[..., None]
    w = np.maximum(Lb, 1e-5)[..., None]
    chrom = pk._gauss(chrom * w, 2) / np.maximum(pk._gauss(w, 2), 1e-6)
    bp = float(np.percentile(Lb, 6.0)) * 0.85
    Lb2 = np.maximum(Lb - bp, 0.0)
    bg = chrom * Lb2[..., None]
    # stars: desaturated, cut the faintest ones, keep the bright ones intact
    Ls = (st * luma).sum(-1)
    st = Ls[..., None] + (st - Ls[..., None]) * STAR_SAT
    pk_ = Ls[Ls > 1e-4]
    thr = float(np.percentile(pk_, STAR_CUT)) if pk_.size else 0.0
    k = np.clip((Ls - thr) / max(thr * 1.5, 1e-5), 0.0, 1.0) ** 1.5
    st = np.maximum(st, 0.0) * k[..., None]
    # extinction toward the horizon (elevation of every plate pixel from the placement)
    H2, W2 = bg.shape[:2]
    jx = ((np.arange(W2, dtype=np.float32) + 0.5 - W2 / 2.0) / F)[None, :]
    iy = ((H2 / 2.0 - (np.arange(H2, dtype=np.float32) + 0.5)) / F)[:, None]
    dz = f.z + r.z * jx + u.z * iy
    el = np.degrees(np.arcsin(np.clip(dz / np.sqrt(1.0 + jx * jx + iy * iy), -1.0, 1.0)))
    sf, gf, hdeg = SKY_FADE
    ss_ = np.clip(el / hdeg, 0.0, 1.0)
    ss_ = ss_ * ss_ * (3.0 - 2.0 * ss_)
    st = st * (sf + (1.0 - sf) * ss_)[..., None]
    bg = bg * (gf + (1.0 - gf) * ss_)[..., None]
    del ss_, el, dz
    out = np.maximum(bg + st, 0.0)
    pk.log('sky plate: %dx%d -> %dx%d, bp %.4f, star thr %.4f, p99.9 %.3f' % (
        W, H, W2, H2, bp, thr, float(np.percentile(out, 99.9))))
    q = np.ascontiguousarray((pk._lin_to_srgb(np.clip(out, 0.0, 1.0)) * 65535.0 + 0.5).astype(np.uint16))
    tmp = path[:-4] + '.tmp%d.png' % os.getpid()
    o = oiio.ImageOutput.create(tmp)
    o.open(tmp, oiio.ImageSpec(W2, H2, 3, 'uint16'))
    o.write_image(q)
    o.close()
    os.replace(tmp, path)
    pk.log('cached sky plate', path, t0)
    return path


def plate_frame(core_az, core_el, roll_deg, a, b):
    """forward/right/up of a rectilinear plate whose tangent-plane point (a, b) lands on the
    sky direction (core_az, core_el), rotated counter-clockwise by roll_deg."""
    c = pk.sky_dir(core_az, core_el)
    Z = Vector((0, 0, 1))
    er = c.cross(Z).normalized()
    eu = er.cross(c).normalized()
    rho = rad(roll_deg)
    r0 = er * math.cos(rho) + eu * math.sin(rho)
    u0 = -er * math.sin(rho) + eu * math.cos(rho)
    f = (c - r0 * a - u0 * b).normalized()
    for _ in range(4):
        r = (r0 - f * f.dot(r0)).normalized()
        u = r.cross(f).normalized()
        p = f + r * a + u * b
        err = c - p.normalized()
        f = (f + err).normalized()
    r = (r0 - f * f.dot(r0)).normalized()
    u = r.cross(f).normalized()
    return f, r, u


def moon_halo_array(res=256, sigma=0.16):
    """Soft wide scattering glow around the moon (two Gaussians), linear RGB."""
    yy, xx = np.mgrid[0:res, 0:res].astype(np.float32)
    rr = np.hypot((xx + 0.5) / res - 0.5, (yy + 0.5) / res - 0.5) * 2.0     # 0 centre, 1 edge
    g = np.exp(-(rr / sigma) ** 2 * 0.5) * 0.7 + np.exp(-(rr / (sigma * 2.6)) ** 2 * 0.5) * 0.3
    g *= np.clip((1.0 - rr) / 0.15, 0.0, 1.0)
    col = np.array((0.78, 0.86, 1.0), np.float32)
    return (g[..., None] * col).astype(np.float32)


def build_sky():
    sc = plate_scale()
    W, H = plate_dims()
    F = PLATE_FPX / PLATE_MAG * sc
    a = ((PLATE_CORE_PX[0] - PLATE_CROP[0]) * sc - W / 2) / F
    b = (H / 2 - (PLATE_CORE_PX[1] - PLATE_CROP[1]) * sc) / F
    if PLATE_MIRROR:
        # mirrored plate: the core sits at -a, and the texture's right axis is -r
        f, r, u = plate_frame(CORE_AZ, CORE_EL, PLATE_ROLL, -a, b)
        r = -r
    else:
        f, r, u = plate_frame(CORE_AZ, CORE_EL, PLATE_ROLL, a, b)
    crop = sky_crop((f, r, u, F))
    img = pk.load_image(crop, 'sRGB')
    assert tuple(img.size) == (W, H), (tuple(img.size), (W, H))
    hfov = 2 * math.degrees(math.atan(W / 2 / F))
    vfov = 2 * math.degrees(math.atan(H / 2 / F))
    dbg = os.environ.get('POV04_SKYDEBUG')
    bg = ((0.0, 0.3, 0.0) if dbg == '2' else (0.3, 0.0, 0.3)) if dbg else SKY_BG
    pk.sky.atmosphere(airglow=0.0, background=bg, skyglow=0.0 if dbg else 0.3,
                      skyglow_color=(0.3, 0.2, 0.36), dawn=0.0 if dbg else 5.0, dawn_az=GLOW_AZ,
                      dawn_color=(1.0, 0.42, 0.2), dawn_height_deg=7.0, dawn_spread_deg=60.0)

    def make(p=crop):
        arr = pk.read_image(p)[..., :3]
        arr = pk._srgb_to_lin(arr)
        return arr, 1.0 / max(float(np.percentile(arr, 99.95)), 1e-6)
    if dbg == '2':
        # coverage mask mode: the plate is replaced by flat white, the rest of the sky stays magenta
        img = pk.np_image('pk_04lc_platemask', np.tile(np.array((0.0, 0.0, 0.5), np.float32), (512, 512, 1)))
    pk.sky.add_rect_layer('milkyway_photo', img, f, r, u, hfov, vfov, gain=1.0, feather=0.02,
                          blend='add', web=dict(key='04lc_' + os.path.basename(crop)[:-4], make=make))
    # round 3: a smaller crescent (2.1 deg, about 4x real) with a visible earthshine disc
    # instead of a black hole in the stars, a softer terminator and a two-part halo
    pk.sky.moon(az=MOON_AZ, el=MOON_EL, size_deg=MOON_SIZE, phase=0.16, lit_angle_deg=-112.0, gain=12.0,
                earthshine=MOON_EARTHSHINE, earthshine_color=(0.6, 0.72, 1.0), relief=0.9, halo=0.3,
                halo_size=1.0, light=MOON_LIGHT, light_color=(0.4, 0.55, 1.0))
    mf, mr, mu = pk.sky.rect_frame(MOON_AZ, MOON_EL, 0.0)
    ha = moon_halo_array()
    hk = 1.0 / float(ha.max())
    pk.sky.add_rect_layer('moon_halo', pk.np_image('pk_04lc_moonhalo', ha), mf, mr, mu, MOON_SIZE * 7.0,
                          MOON_SIZE * 7.0, gain=MOON_HALO, feather=0.0, blend='add',
                          web=dict(key='04lc_moonhalo_v1', make=lambda a=ha, k=hk: (a, k)))
    pk.sky.set_grade(exposure=SKY_EXPOSURE, contrast=SKY_CONTRAST, saturation=SKY_SAT, tint=SKY_TINT)
    # warm light dome of the lantern town over the far roofs (post-grade, level with the horizon)
    pk.sky.set_horizon_glow(color=(1.0, 0.46, 0.2), strength=SKY_DOME, height_deg=16.0)
    pk.sky.set_lighting(gain=0.05, tint=(0.55, 0.7, 1.0), ambient=AMBIENT)
    # weak cool fill from behind the boat so facades keep their shape in the dark
    pk.lights.sun(-150.0, 32.0, color=(0.3, 0.45, 1.0), strength=FILL_SUN, angle_deg=3.0, shadow=True,
                  name='FillSunL')
    pk.lights.sun(150.0, 28.0, color=(0.35, 0.4, 1.0), strength=FILL_SUN * 0.8, angle_deg=3.0, shadow=False,
                  name='FillSunR')


# ============================================================================ main build

def build(ctx):
    rng = random.Random(41)
    pts = [(0, 0), (0, 12), (0, 30), (1.4, 46), (4.6, 62), (9.6, 78), (15.0, 96),
           (19.4, 118), (21.6, 145), (22.6, 180), (23.0, 240)]
    cam = pk.camera.drive(pts, speed_mps=SPEED, height=EYE, fov_v_deg=62, pitch_deg=5.5,
                          # round 4: vibration 0.0005 -> 0. The kit's road vibration adds
                          # 0.06 deg pitch / 0.07 deg roll at 2 to 7 Hz (0.5 px RMS, 2 px
                          # peak to peak judder of the far town); a boat on a calm canal only
                          # has the slow heave/roll/pitch generators below
                          look_ahead=12.0, sway=0.06, vibration=0.0, lean=0.5, max_roll_deg=1.0,
                          end_speed_factor=0.4)
    # boat motion on top of the drive keys: heave, roll (the horizon visibly tilts), pitch and a
    # slow yaw drift, each with a weaker second harmonic. Round 5: the head (camera) takes only
    # HEAD_FOLLOW of the boat's roll, pitch and yaw; build_bow's `bow_rock` gives the bow the rest
    add_sines(cam, 'location', 2, BOAT_HEAVE, deg=False, fps=ctx.fps)
    add_sines(cam, 'rotation_euler', 1, BOAT_ROLL, HEAD_FOLLOW['roll'], fps=ctx.fps)
    add_sines(cam, 'rotation_euler', 0, BOAT_PITCH, HEAD_FOLLOW['pitch'], fps=ctx.fps)
    add_sines(cam, 'rotation_euler', 2, BOAT_YAW, HEAD_FOLLOW['yaw'], fps=ctx.fps)
    path = ctx.path
    M = Mats()
    town = ctx.collection('Town')
    props = ctx.collection('Props')
    far = ctx.collection('Far')
    s_end = path.length + 20

    # water, walls, quay
    water = strip(path, -WALL - 0.2, WALL + 0.2, 0.0, 0.0, -20, s_end, M.water, 'Canal', town, step=0.5,
                  across=8)
    # web edition only (glTF extras; the viewer's mirror.water picks the canal by name):
    # long, rippled reflection columns like the film's water-only road streak
    water['mirror_strength'] = 1.0
    water['mirror_streak'] = WEB_WATER_STREAK
    water['mirror_ripple'] = WEB_WATER_RIPPLE
    for side in (-1, 1):
        wpts = [tuple(path.offset(float(s), side * WALL, 0.0)) for s in np.arange(-20, s_end, 0.5)]
        prof = [(0.0, -1.3), (0.0, 0.82), (0.7, 0.82), (0.7, -1.3)]
        prof = [(side * x, z) for x, z in prof]
        if side < 0:
            prof = list(reversed(prof))
        wall = pk.geo.sweep(wpts, prof, material=M.stone, name='Wall' + ('L' if side < 0 else 'R'),
                            collection=town, caps=True)
        wall.data.set_sharp_from_angle(angle=rad(45))
        pk._box_uv(wall.data)
        cprof = [(-0.07, 0.82), (-0.07, 0.93), (-0.03, 0.98), (0.6, 0.98), (0.6, 0.82)]
        cprof = [(side * x, z) for x, z in cprof]
        if side < 0:
            cprof = list(reversed(cprof))
        cop = pk.geo.sweep(wpts, cprof, material=M.stone_light, name='Coping', collection=town, caps=True)
        cop.data.set_sharp_from_angle(angle=rad(45))
        pk._box_uv(cop.data)
    strip(path, WALL + 0.5, RIGHT_FRONT + 0.3, QUAY_Z + 0.02, QUAY_Z + 0.02, -20, s_end, M.pavers, 'QuayR',
          town, across=3)
    strip(path, RIGHT_FRONT + 0.3, 70.0, QUAY_Z, QUAY_Z, -20, s_end, M.ground, 'GroundR', town, step=2.0)
    strip(path, -70.0, -WALL - 0.5, QUAY_Z, QUAY_Z, -20, s_end, M.ground, 'GroundL', town, step=2.0)

    srcs = dict(pots=[], hang=[], door_lamps=[], flowers=[], andon=[])
    # lantern sources (string lanterns in several colours)
    lan_cols = [VERMILION, ORANGE, CORAL, GOLD, MAGENTA, VERMILION, TEAL, ORANGE]
    lan_srcs = [lantern_source('LanSrc%d' % i, c, 4.5, props, shape=('oval', 'round', 'oval', 'cyl')[i % 4])
                for i, c in enumerate(lan_cols)]
    small_cols = [VERMILION, GOLD]
    small_srcs = [lantern_source('SmallLanSrc%d' % i, c, 4.0, props, height=0.26, radius=0.11, string=0.25)
                  for i, c in enumerate(small_cols)]
    srcs['tea_lanterns'] = [lantern_source('TeaLanSrc%d' % i, c, 5.0, props, height=0.42, radius=0.17,
                                           string=0.18, shape='cyl')
                            for i, c in enumerate((VERMILION, ORANGE))]

    bow_parts = build_bow(cam, M, props)

    if QUICK != 'sky':
        # ------------------------------------------------------------ canal houses
        idx = 0
        house_tops = []
        for side in (-1, 1):
            s = -14.0 if side < 0 else -11.0
            while s < 205:
                w = rng.uniform(4.2, 6.8)
                sc = s + w / 2
                skip = False
                for (c0, c1) in ((BRIDGE_A - 4.5, BRIDGE_A + 4.0), (BRIDGE_B - 4.5, BRIDGE_B + 4.0)):
                    if c0 < sc < c1 or c0 < s < c1 or c0 < s + w < c1:
                        skip = True
                if side < 0 and TEAHOUSE_S - 8.0 < sc < TEAHOUSE_S + 8.5:
                    skip = True
                if side < 0 and 30.5 < sc < 46.0:
                    skip = True     # garden in front of the tea house keeps it in view
                if side > 0 and 112 < sc < 120:
                    skip = True     # a little garden gap
                if skip:
                    s += 2.0
                    continue
                floors = rng.choice((2, 3, 3, 3, 4)) if s < 120 else rng.choice((2, 3, 3))
                d = rng.uniform(5.5, 7.5)
                root, zt, zr = canal_house(M, town, path, sc, side, w, d, floors, rng, idx, srcs)
                house_tops.append((sc, side, zt))
                idx += 1
                s += w + rng.uniform(0.05, 0.6)
        pk.log('canal houses: %d' % idx)

        # ------------------------------------------------------------ props from houses
        plant_srcs = plant_sources(props, M)
        flower_srcs = flower_sources(props, M)
        pot_items = []
        for (root, p, r) in srcs['pots']:
            wp = root.matrix_world @ Vector(p)
            pot_items.append((tuple(wp), r * 360, 0.9 + 0.3 * r, int(r * 10)))
        flower_items = []
        for (root, p) in srcs['flowers']:
            wp = root.matrix_world @ Vector(p)
            yaw = math.degrees(root.matrix_world.to_euler().z)
            flower_items.append((tuple(wp), yaw, 1.0, len(flower_items)))
        # walkway pots and benches beside the canal (right quay)
        for s in np.arange(2.0, 150.0, 5.3):
            if abs(s - BRIDGE_A) < 5 or abs(s - BRIDGE_B) < 5:
                continue
            p = path.offset(float(s) + rng.uniform(-0.8, 0.8), WALL + 0.85, QUAY_Z + 0.02)
            pot_items.append((tuple(p), rng.uniform(0, 360), rng.uniform(1.0, 1.5), rng.randrange(3)))
        scatter_list(plant_srcs, pot_items, 'Pots', props)
        scatter_list(flower_srcs, flower_items, 'Flowers', props)
        # hanging lanterns under balconies
        hang_items = []
        for i, (root, p) in enumerate(srcs['hang']):
            wp = root.matrix_world @ Vector(p)
            hang_items.append((tuple(wp), 0.0, 1.0, i))
            if i % 2 == 0:
                pk.lights.point((wp.x, wp.y, wp.z - 0.4), small_cols[i % 2], 45.0, radius=0.1, shadow=False,
                                name='BalconyLan', collection=props, volume=0.1)
        scatter_list(small_srcs, hang_items, 'BalconyLanterns', props)
        # door lamps
        door_items = []
        for i, (root, p) in enumerate(srcs['door_lamps']):
            wp = root.matrix_world @ Vector(p)
            door_items.append((tuple(wp), 0.0, 1.0, i))
            col = (1.0, 0.55, 0.25) if i % 3 else (1.0, 0.3, 0.2)
            pk.lights.point((wp.x, wp.y, wp.z - 0.3), col, 60.0, radius=0.1, shadow=False, name='DoorLamp',
                            collection=props, volume=0.1)
        scatter_list(small_srcs, door_items, 'DoorLanterns', props)
        # andon: standing paper lamp boxes beside shop doors
        bm = bmesh.new()
        bm_box(bm, (0, 0, 0.05), (0.36, 0.36, 0.1), mi=1)
        bm_box(bm, (0, 0, 0.45), (0.3, 0.3, 0.7), mi=0)
        bm_box(bm, (0, 0, 0.83), (0.38, 0.38, 0.06), mi=1)
        for sx in (-1, 1):
            for sy in (-1, 1):
                bm_box(bm, (sx * 0.155, sy * 0.155, 0.45), (0.035, 0.035, 0.72), mi=1)
        andon_src = bm_obj('AndonSrc', bm, [paper_mat((1.0, 0.62, 0.3), 3.2, 'PK04_Andon', rib_freq=6.0),
                                            M.dark_wood], props, sharp=40, edges=False)
        andon_items = []
        for i, (root, p) in enumerate(srcs['andon']):
            wp = root.matrix_world @ Vector(p)
            andon_items.append((tuple(wp), math.degrees(root.matrix_world.to_euler().z), 1.0, 0))
            pk.lights.point((wp.x, wp.y, wp.z + 0.5), (1.0, 0.55, 0.25), 40.0, radius=0.15, shadow=False,
                            name='AndonLight', collection=props, volume=0.05)
        scatter_list([andon_src], andon_items, 'Andons', props)

        # ------------------------------------------------------------ quay lantern posts (right)
        post_m = M.dark_wood
        bm = bmesh.new()
        bm_box(bm, (0, 0, 0.18), (0.36, 0.36, 0.36), mi=1)
        bm_box(bm, (0, 0, 1.4), (0.13, 0.13, 2.4), mi=0)
        tube_bm(bm, [(0, 0, 2.5), (0, -0.05, 2.75), (0, -0.3, 2.85), (0, -0.55, 2.8)], 0.03, 6, mi=0)
        post_src = bm_obj('QuayPostSrc', bm, [post_m, M.stone_light], props)
        post_items, post_lan = [], []
        for i, s in enumerate(np.arange(4.0, 160.0, 7.5)):
            if abs(s - BRIDGE_A) < 5 or abs(s - BRIDGE_B) < 5:
                continue
            p = path.offset(float(s), WALL + 0.45, QUAY_Z)
            yaw = -path.heading(float(s)) + 90.0
            post_items.append((tuple(p), yaw - 90, 1.0, 0))
            lp = path.offset(float(s), WALL - 0.1, QUAY_Z + 2.8)
            post_lan.append((tuple(lp), 0.0, 1.0, i % 2))
            pk.lights.point((lp.x, lp.y, lp.z - 0.55), (1.0, 0.4, 0.15) if i % 2 else (1.0, 0.6, 0.25), 80.0,
                            radius=0.15, shadow=False, name='QuayLamp', collection=props, volume=0.15)
        scatter_list([post_src], post_items, 'QuayPosts', props)
        # round 3: dyed cloth banners on poles along the right quay and hanging on left facades
        ban_srcs = banner_sources(props, M)
        ban_items = []
        br_ = random.Random(55)
        for s in np.arange(9.0, 150.0, 6.8):
            if abs(s - BRIDGE_A) < 5.5 or abs(s - BRIDGE_B) < 5.5:
                continue
            sj = float(s) + br_.uniform(-1.0, 1.0)
            p = path.offset(sj, RIGHT_FRONT - 0.55, QUAY_Z)
            yaw = -path.heading(sj) + 90.0 + br_.uniform(-12, 12)
            ban_items.append((tuple(p), yaw, br_.uniform(0.9, 1.08), br_.randrange(5)))
        broot = scatter_list(ban_srcs, ban_items, 'Banners', props)
        for i, ch in enumerate(broot.children):
            add_drift_static(ch, rot_amp=(0.0, 0.0, 3.0), seed=1200 + i, scale_frames=45.0)
        scatter_list(small_srcs, post_lan, 'QuayLanterns', props)

        # mooring posts in the water
        bm = bmesh.new()
        bm_lathe(bm, [(0.0, -1.0), (0.13, -1.0), (0.13, 1.6), (0.15, 1.65), (0.1, 1.8), (0.0, 1.82)], segs=12)
        bm_lathe(bm, [(0.14, 0.6), (0.155, 0.62), (0.155, 0.72), (0.14, 0.74)], segs=12, mi=1)
        moor_src = bm_obj('MoorSrc', bm, [M.dark_wood, cached('rope', lambda: None)], props)
        moor_items = []
        for side in (-1, 1):
            for s in np.arange(5.0 + side * 2, 140.0, 9.5):
                if abs(s - BRIDGE_A) < 4 or abs(s - BRIDGE_B) < 4:
                    continue
                p = path.offset(float(s), side * (WALL - 0.32), 0.0)
                moor_items.append((tuple(p), rng.uniform(0, 360), rng.uniform(0.9, 1.15), 0))
        scatter_list([moor_src], moor_items, 'MooringPosts', props)

        # ------------------------------------------------------------ moored boats
        bi = 0
        for side, stations in ((-1, (9.0, 14.5, 36.0, 41.5, 70.0, 95.0, 104.0)),
                               (1, (3.5, 11.5, 39.5, 48.0, 56.0, 68.0, 92.0, 100.0))):
            for s in stations:
                moored_boat(M, props, path, s + rng.uniform(-0.6, 0.6), side * (WALL - 1.05), bi, rng,
                            small_srcs, small_cols)
                bi += 1

        # ------------------------------------------------------------ lantern strings over the water
        for i, s in enumerate((6.0, 19.5, 32.0, 50.0, 64.0, 76.5, 92.0, 108.0, 124.0, 140.0)):
            lantern_string(path, s, props, lan_srcs, lan_cols, count=12 + (i % 3), seed=i,
                           sag=0.8 + 0.3 * (i % 2), skew=rng.uniform(-1.5, 1.5),
                           z0=rng.uniform(5.4, 6.4), z1=rng.uniform(5.2, 6.2),
                           light_every=4 if s < 80 else 0, name='LanternString%d' % i)

        # ------------------------------------------------------------ trees and the garden
        for k, (s, lat, h, cr) in enumerate(((22.0, WALL + 1.1, 6.5, 2.4), (35.5, -(WALL + 2.6), 6.0, 2.5),
                                               (42.0, -(WALL + 4.0), 7.0, 2.8), (61.5, WALL + 1.2, 6.2, 2.3),
                                               (114.0, WALL + 3.5, 7.0, 3.0), (-6.0, WALL + 1.0, 6.0, 2.2))):
            p = path.offset(s, lat, QUAY_Z)
            willow(M, props, tuple(p), h=h + 0.5, crown=cr * 1.1, seed=k + 1, lantern_srcs=small_srcs,
                   lean=0.35 if lat < 0 else -0.35)
        bm = bmesh.new()
        hr = random.Random(77)
        for s in np.arange(31.2, 46.0, 0.75):
            r = hr.uniform(0.38, 0.62)
            c = path.offset(float(s) + hr.uniform(-0.2, 0.2), -(WALL + 0.95 + hr.uniform(-0.15, 0.25)),
                            QUAY_Z + r * 0.55)
            ret = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
            for v in ret['verts']:
                d = v.co.normalized()
                v.co = c + v.co * Vector((1.0, 1.0, 0.85)) * (1.0 + 0.08 * math.sin(d.x * 9 + s) * math.cos(d.y * 7))
        hedge = bm_obj('GardenHedge', bm, [M.leaf], props, sharp=None)
        bm = bmesh.new()
        for k in range(38):
            s = hr.uniform(31.5, 45.5)
            c = path.offset(s, -(WALL + 0.95 + hr.uniform(-0.3, 0.3)), QUAY_Z + hr.uniform(0.5, 0.9))
            ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.025)
            bmesh.ops.translate(bm, verts=ret['verts'], vec=c)
        hb = bm_obj('HedgeBulbs', bm, [cached('fairy', lambda: pk.mat.emission((1.0, 0.68, 0.32), 45.0,
                                                                            name='PK04_Fairy'))],
                    props, sharp=None, edges=False)
        hb.visible_shadow = False
        # stone lanterns along the garden edge
        for k, s in enumerate((32.5, 39.0, 45.0)):
            base = path.offset(s, -(WALL + 1.9), QUAY_Z)
            sl = pk.geo.lathe([(0.0, 0.0), (0.32, 0.0), (0.3, 0.12), (0.12, 0.2), (0.11, 0.9), (0.38, 1.0),
                               (0.38, 1.08), (0.0, 1.1)], segments=8, material=M.stone_light, name='StoneLan%d' % k,
                              collection=props, location=tuple(base))
            box = pk.geo.rounded_box((0.42, 0.42, 0.42), radius=0.04, material=cached(
                'stonelanglow', lambda: paper_mat((1.0, 0.6, 0.25), 3.0, 'PK04_StoneLanGlow', rib_freq=10.0)),
                name='StoneLanBox%d' % k, collection=props, location=tuple(base + Vector((0, 0, 1.1))))
            roof = pk.geo.lathe([(0.0, 0.0), (0.5, 0.0), (0.42, 0.1), (0.12, 0.3), (0.06, 0.42), (0.0, 0.45)],
                                segments=8, material=M.stone_light, name='StoneLanRoof%d' % k, collection=props,
                                location=tuple(base + Vector((0, 0, 1.52))))
            pk.lights.point(tuple(base + Vector((0, 0, 1.3))), (1.0, 0.55, 0.22), 30.0, radius=0.2, shadow=False,
                            name='StoneLanLight', collection=props, volume=0.05)

        ff = random.Random(23)
        fpts = []
        for (s0, s1, l0, l1) in ((15.0, 70.0, WALL + 0.3, WALL + 3.0), (28.0, 48.0, -(WALL + 4.0), -(WALL + 0.3)),
                                 (2.0, 90.0, 1.4, 3.8), (2.0, 90.0, -3.8, -1.4)):
            for k in range(24):
                fpts.append(tuple(path.offset(ff.uniform(s0, s1), ff.uniform(l0, l1), ff.uniform(0.5, 3.2))))
        pk.particles.fireflies(fpts, color=(1.0, 0.78, 0.35), strength=30.0, radius=0.016, wander=0.4)

        # ------------------------------------------------------------ cats on the quay and a balcony
        cat_m = cached('cat', lambda: pk.mat.toy_plastic((0.04, 0.035, 0.04), name='PK04_Cat', roughness=0.5,
                                                         sss=0.05, edge_light=0.3))
        for k, (s, lat, z, yaw) in enumerate(((33.0, WALL + 0.25, QUAY_Z + 0.04, 80.0),
                                              (11.0, -(WALL + 0.25), QUAY_Z + 0.04, -100.0))):
            bm = bmesh.new()
            bm_lathe(bm, [(0.0, 0.0), (0.11, 0.01), (0.13, 0.08), (0.11, 0.2), (0.07, 0.28), (0.0, 0.3)], segs=14)
            ret = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.075)
            bmesh.ops.translate(bm, verts=ret['verts'], vec=(0.0, -0.02, 0.36))
            for sx in (-1, 1):
                v1 = bm.verts.new((sx * 0.06, -0.0, 0.4))
                v2 = bm.verts.new((sx * 0.02, -0.02, 0.42))
                v3 = bm.verts.new((sx * 0.05, -0.01, 0.48))
                bm.faces.new((v1, v2, v3))
            tube_bm(bm, [(0.0, 0.1, 0.03), (0.08, 0.2, 0.02), (0.16, 0.2, 0.06), (0.2, 0.12, 0.1)], 0.018, 6)
            cat = bm_obj('Cat%d' % k, bm, [cat_m], props, sharp=None)
            cat.matrix_world = frame_at(path, s, lat, z, yaw)
            for sx in (-1, 1):
                eye = pk.geo.lathe([(0.0, 0.0), (0.012, 0.002), (0.0, 0.004)], segments=8, material=cached(
                    'cateye', lambda: pk.mat.emission((0.7, 1.0, 0.4), 6.0, name='PK04_CatEye')),
                    name='CatEye', collection=props, edges=False)
                attach(eye, cat, (sx * 0.028, -0.085, 0.37), (90, 0, 0))

        # ------------------------------------------------------------ bridges
        _, deck_fn = arch_bridge(M, town, path, BRIDGE_A, 0, small_srcs + [lan_srcs[1]], [VERMILION, (1.0, 0.5, 0.2)])
        arch_bridge(M, town, path, BRIDGE_B, 1, small_srcs, [MAGENTA, (1.0, 0.5, 0.2)], under_lanterns=True)

        # ------------------------------------------------------------ hero and far tower
        teahouse(M, town, path, srcs)
        townsfolk(ctx, M, props, path, deck_fn)
        far_tower(M, far, path, TOWER_S, 0.0)
        isl = pk.geo.lathe([(0.0, -1.2), (7.0, -1.2), (7.0, 0.55), (6.6, 0.75), (6.4, QUAY_Z), (0.0, QUAY_Z)],
                           segments=40, material=M.stone, name='TowerIsland', collection=far,
                           location=tuple(path.offset(TOWER_S, 0.0, 0.0)))
        pk._box_uv(isl.data)

        # ------------------------------------------------------------ terraces and far skyline
        fi = 0
        for side in (-1, 1):
            for row, (lat0, zb) in enumerate(((15.0, 2.0), (23.0, 4.6), (31.0, 7.4), (40.0, 10.5))):
                s = rng.uniform(-5, 5) + (20.0 if row == 0 else 10.0)
                while s < 260:
                    w = rng.uniform(4.5, 8.0)
                    if rng.random() < 0.18:
                        s += w
                        continue
                    lat = side * (lat0 + rng.uniform(-2.0, 2.0))
                    h = rng.uniform(5.5, 10.5)
                    far_house(M, far, path, s + w / 2, lat, zb, w, rng.uniform(5, 8), h, rng, fi, side)
                    fi += 1
                    s += w + rng.uniform(0.5, 3.0)
        pk.log('far houses: %d' % fi)
        # terrace ground and distant hills (dark silhouettes)
        for side in (-1, 1):
            verts, faces = [], []
            ss = np.arange(-10, 300, 4.0)
            lats = [12, 19, 27, 35, 44, 60, 90, 140]
            zs = [QUAY_Z, 1.6, 4.2, 7.0, 10.0, 15.0, 26.0, 38.0]
            for s in ss:
                for la, z in zip(lats, zs):
                    jit = 2.5 * math.sin(s * 0.05 + la) if la > 50 else 0.0
                    verts.append(tuple(path.offset(float(s), side * la, z + jit)))
            nl = len(lats)
            for i in range(len(ss) - 1):
                for j in range(nl - 1):
                    a = i * nl + j
                    faces.append((a, a + 1, a + nl + 1, a + nl))
            pk.mesh_object('Hill%d' % side, verts, faces, material=M.hill, collection=far, recalc=True)
        # haze
        mid = path.at(path.length * 0.4)
        pk.geo.fog(center=(mid.x, mid.y, 10.0), size=(320, 420, 30), density=HAZE, falloff=7.0,
                   color=(0.5, 0.55, 1.0), anisotropy=0.45)
        # low mist over the water: halos on the floating lanterns, near/far layers separate
        pk.geo.fog(center=(mid.x, mid.y, 1.5), size=(320, 420, 3.0), density=MIST, falloff=0.55,
                   base_z=0.0, color=(0.6, 0.66, 1.0), anisotropy=0.55, noise_amount=0.6, name='Mist')

        # ------------------------------------------------------------ paper animal lanterns
        # one hero whale, two koi, one bird, plus a small koi drifting low near the bow at the
        # start (foreground parallax hook); each glows from a light inside that also lights the
        # roofs below it
        for i, (kind, col, st, L, patch, lw, keys) in enumerate(ANIMALS):
            ob = animal_lantern(far, kind, col, st, L, 'Animal%d_%s' % (i, kind), patch=patch)
            key_path(ctx, ob, path, keys, roll=rng.uniform(-5, 5))
            add_drift(ob, loc_amp=(0.15, 0.15, 0.2), rot_amp=(2.0, 2.0, 5.0), scale_frames=80.0, seed=50 + i)
            lo = pk.lights.point((0, 0, 0), tuple(0.5 * c + 0.5 * w for c, w in zip(col, (1.0, 0.8, 0.55))),
                                 lw, radius=0.3 * L, shadow=False, name='AnimalGlow%d' % i, collection=far,
                                 volume=0.05)
            lo.parent = ob
            lo.matrix_parent_inverse = Matrix.Identity(4)
            lo.location = (0.0, 0.42 * L, 0.0)
            pk.mark_moving(lo)
        # the near koi: swims slowly across, low over the water, ahead of the boat at t = 0..3 s.
        # Round 4: it swims with the boat at about 1.9 m/s (was 0.6) and climbs a little higher,
        # so we overtake it at 2.3 m/s instead of 3.6: it glides out over the top edge in about
        # 1.7 s (exit at about 3.2 s, at half the old angular speed) instead of whipping out
        nk = animal_lantern(far, 'koi', (1.0, 0.93, 0.85), 7.0, 1.3, 'Animal_nearkoi', patch=VERMILION)
        for (t, s_k, lat, z) in ((0.0, 11.0, -1.9, 3.3), (1.0, 12.7, -1.3, 3.45), (3.5, 17.6, 0.2, 4.15)):
            nk.matrix_world = frame_at(path, s_k, lat, z, -62.0)
            nk.keyframe_insert('location', frame=ctx.t2f(t))
            nk.keyframe_insert('rotation_euler', frame=ctx.t2f(t))
        for fc in pk.fcurves(nk):
            for kp in fc.keyframe_points:
                kp.interpolation = 'BEZIER'
            fc.extrapolation = 'LINEAR'
        lo = pk.lights.point((0, 0, 0), (1.0, 0.7, 0.45), 60.0, radius=0.25, shadow=False, name='NearKoiGlow',
                             collection=far, volume=0.05)
        lo.parent = nk
        lo.matrix_parent_inverse = Matrix.Identity(4)
        lo.location = (0.0, 0.4, 0.0)

        # ------------------------------------------------------------ floating lotus lanterns
        lot_srcs = [lotus_source('LotusSrc%d' % i, c, props) for i, c in
                    enumerate(((1.0, 0.45, 0.6), (1.0, 0.8, 0.62), (1.0, 0.55, 0.35)))]
        lot_items = []
        lr_ = random.Random(91)
        for k in range(100):
            s = lr_.uniform(3.0, 125.0)
            lat = lr_.choice((-1, 1)) * lr_.uniform(1.35, 3.5)
            if abs(s - BRIDGE_A) < 2.0 or abs(s - BRIDGE_B) < 2.0:
                continue
            lot_items.append((tuple(path.offset(s, lat, 0.0)), lr_.uniform(0, 360), lr_.uniform(0.85, 1.25), k))
        # round 3: a few lotus lanterns routed close past the bow (0.3 to 0.6 m off the hull),
        # 5 to 9 m ahead at the still times, so the lower third has near light and parallax
        near_lotus = []
        for t_, d_, lat_ in ((1.0, 5.6, 1.05), (1.0, 8.6, -1.3), (4.0, 5.2, -1.2), (4.0, 7.8, 1.15),
                             (7.0, 5.8, 1.1), (7.0, 9.0, -1.25), (9.5, 5.4, -1.15), (9.5, 8.2, 1.2)):
            s_ = ctx.s_of_t(t_) + d_
            near_lotus.append(len(lot_items))
            lot_items.append((tuple(path.offset(s_, lat_, 0.0)), lr_.uniform(0, 360), 1.15, len(lot_items)))
        lroot = scatter_list(lot_srcs, lot_items, 'Lotus', props)
        for ch in lroot.children:
            i = int(ch.name.rsplit('_', 1)[1])
            ch.visible_shadow = False
            animate_noise(ch, loc_amp=(0.06, 0.06, 0.01), rot_amp=(1.5, 1.5, 8.0), scale_frames=60.0, seed=700 + i)
            if i % 4 == 0 or i in near_lotus:
                lo = pk.lights.point((0, 0, 0), (1.0, 0.55, 0.3), 14.0 if i in near_lotus else 10.0, radius=0.06,
                                     shadow=False,
                                     name='LotusLight', collection=props, volume=0.15)
                lo.parent = ch
                lo.matrix_parent_inverse = Matrix.Identity(4)
                lo.location = (0.0, 0.0, 0.12)
        # petals drifting on the water near the boat
        bm = bmesh.new()
        pr = random.Random(17)
        for k in range(900):
            s = pr.uniform(-2.0, 110.0)
            lat = pr.uniform(-3.9, 3.9)
            c = path.offset(s, lat, 0.004)
            a = pr.uniform(0, 6.28)
            sz = pr.uniform(0.025, 0.045)
            d1 = Vector((math.cos(a), math.sin(a), 0)) * sz
            d2 = Vector((-math.sin(a), math.cos(a), 0)) * sz * 0.55
            vs = [bm.verts.new(c + d1), bm.verts.new(c + d2), bm.verts.new(c - d1), bm.verts.new(c - d2)]
            f = bm.faces.new(vs)
            f.material_index = k % 2
        pet = bm_obj('Petals', bm, [cached('petal', lambda: pk.mat.basic((0.9, 0.42, 0.55), roughness=0.5,
                                                                          emission=(1.0, 0.5, 0.6), strength=0.25,
                                                                          name='PK04_Petal')),
                                    cached('petal2', lambda: pk.mat.basic((0.9, 0.82, 0.78), roughness=0.5,
                                                                           emission=(1.0, 0.85, 0.75), strength=0.2,
                                                                           name='PK04_Petal2'))],
                     props, smooth=False, edges=False, recalc=False)
        pet.visible_shadow = False

        # ------------------------------------------------------------ facade washes
        wash_cols = [MAGENTA, COBALT, TEAL, VIOLET, (1.0, 0.35, 0.2)]
        for i, s in enumerate(np.arange(3.0, 130.0, 6.5)):
            side = 1 if i % 2 else -1
            if abs(s - BRIDGE_A) < 4 or (side < 0 and abs(s - TEAHOUSE_S) < 9):
                continue
            col = wash_cols[i % len(wash_cols)]
            if side > 0:
                p = path.offset(float(s), RIGHT_FRONT - 1.2, QUAY_Z + 0.25)
                tgt = path.offset(float(s), RIGHT_FRONT + 0.3, QUAY_Z + 6.5)
            else:
                p = path.offset(float(s), LEFT_FRONT + 0.9, 0.4)
                tgt = path.offset(float(s), LEFT_FRONT - 0.3, QUAY_Z + 6.0)
            pk.lights.spot(tuple(p), tuple(tgt), col, WASH_W, angle_deg=75, blend=0.9, radius=0.3, shadow=False,
                           name='Wash', collection=town, volume=0.0)

    build_sky()
    moon_off_water(water)
    # more shadow-casting lights than the default pool holds at full resolution
    ctx.scene.eevee.shadow_pool_size = '1024'
    # round 4: a water-only AOV (written by water_mat) so the road streak smears only the
    # reflections in the canal, not the lantern bodies floating on it
    if WATER_AOV not in [a.name for a in ctx.scene.view_layers[0].aovs]:
        av = ctx.scene.view_layers[0].aovs.add()
        av.name, av.type = WATER_AOV, 'VALUE'
    # no lens dispersion (it put red/cyan fringes on every star), finer and weaker grain
    pk.comp.setup(bloom=0.75, bloom_threshold=1.2, bloom_size=0.45, glow=0.06, glow_threshold=8.0,
                  road_streak=1.3, road_streak_px=STREAK_PX, road_streak_threshold=0.45, road_streak_depth=160.0,
                  star_glow=0.0, star_sparkle=0.0, vignette=0.3, saturation=1.12, sky_bloom=0.0,
                  sky_bloom_floor=1.6, distortion=-0.008, dispersion=0.0, grain=0.016)
    exclude_bow_from_streaks()
    streak_from_water_only(ctx.args.get('scale', 1.0))
    cool_shadows()
    if DEBUG:
        debug_positions(ctx, cam, path)


def cool_shadows(tint=(0.86, 0.97, 1.14), lo=0.003, hi=0.06):
    """Split tone at the end of the compositor (scene-linear, before the view transform):
    the darkest values lean teal-blue, the lit and warm areas are untouched, so warm lantern
    light meets cool shadow."""
    ng = bpy.context.scene.compositing_node_group
    out = [n for n in ng.nodes if n.bl_idname == 'NodeGroupOutput'][0]
    src = out.inputs[0].links[0].from_socket
    lum = pk.vmath(ng, 'DOT_PRODUCT', src, pk.LUMA)
    k = pk.maprange(ng, lum, lo, hi, 1.0, 0.0, interp='SMOOTHSTEP')
    t = pk.mix_col(ng, k, (1.0, 1.0, 1.0), tint)
    img = pk.vmath(ng, 'MULTIPLY', src, t)
    ng.links.new(img, out.inputs[0])


def moon_off_water(water):
    """Round 4: light-link the canal out of the moon's sun lamp. The moon sits at elevation
    29 deg, so its mirror image on the water lies just under the frame's bottom edge (-25.5
    deg); only steep ripple facets right of the bow threw it into frame, as a blue-white glint
    that changed facets every frame at 17.5 cm of travel per frame and strobed (EEVEE does not
    accumulate across frames). The moonlight still lights roofs, facades and the bow."""
    moon = bpy.data.objects.get('MoonLight')
    if moon is None:
        return
    c = bpy.data.collections.get('PK04_NoMoon') or bpy.data.collections.new('PK04_NoMoon')
    members = [water]
    nd = bpy.data.collections.get('PK_NoDirectLight')     # keep the kit's own exclusions too
    if nd is not None:
        members += list(nd.objects)
    for o in members:
        if o.name not in c.objects:
            c.objects.link(o)
    for co in c.collection_objects:
        co.light_linking.link_state = 'EXCLUDE'
    moon.light_linking.receiver_collection = c
    pk.log('moon light: water excluded (%d objects)' % len(c.objects))


def streak_from_water_only(scale, shift=STREAK_SHIFT):
    """Round 4 kit workaround. comp road_streak takes its source from every bright up-facing
    pixel and blurs it symmetrically, so the candle flames and petal tops of the floating lotus
    lanterns threw light pillars upward onto the water behind them. Here the streak source is
    multiplied by the water AOV (the canal's own reflections only), and each vertical blur is
    moved down by `shift` of its size so a streak hangs below its light, toward the viewer,
    like a real reflection column."""
    ng = bpy.context.scene.compositing_node_group
    rl = [n for n in ng.nodes if n.bl_idname == 'CompositorNodeRLayers'][0]
    aov = rl.outputs.get(WATER_AOV)
    if aov is None:
        pk.log('streak patch: no water AOV output')
        return
    sizes = (STREAK_PX * 0.3, STREAK_PX)
    blurs = [n for n in ng.nodes if n.bl_idname == 'CompositorNodeBlur' and
             any(abs(tuple(n.inputs['Size'].default_value)[1] - v) < 1e-3 for v in sizes) and
             abs(tuple(n.inputs['Size'].default_value)[0]) < 1e-6]
    src = None
    for b in blurs:
        lk = b.inputs['Image'].links
        if not lk:
            continue
        if src is None:
            src = pk.vmath(ng, 'SCALE', lk[0].from_socket, scale=aov)
        ng.links.new(src, b.inputs['Image'])
        size = tuple(b.inputs['Size'].default_value)[1]
        tr = ng.nodes.new('CompositorNodeTranslate')
        tr.inputs['Y'].default_value = -shift * size * scale
        tr.inputs['Interpolation'].default_value = 'Bilinear'
        for l in list(b.outputs['Image'].links):
            ng.links.new(tr.outputs['Image'], l.to_socket)
        ng.links.new(b.outputs['Image'], tr.inputs['Image'])
    pk.log('streak patch: %d blurs fed from the water AOV, shifted down %.2f of their size' % (len(blurs), shift))


def exclude_bow_from_streaks(near=3.2, far=3.8):
    """Kit workaround: comp road_streak excludes only depth < 2 m (a car dash); our boat deck is
    up-facing out to 2.7 m, so its highlights got smeared. Push that cut-off past the bow."""
    ng = bpy.context.scene.compositing_node_group
    n = 0
    for nd in ng.nodes:
        if nd.bl_idname == 'ShaderNodeMapRange' and abs(nd.inputs[1].default_value - 1.2) < 1e-6 and \
                abs(nd.inputs[2].default_value - 2.0) < 1e-6:
            nd.inputs[1].default_value = near
            nd.inputs[2].default_value = far
            n += 1
    pk.log('road streak bow cut-off patched (%d node)' % n)


def debug_positions(ctx, cam, path):
    from bpy_extras.object_utils import world_to_camera_view
    sc = ctx.scene
    probes = {'teahouse_lantern': frame_at(path, TEAHOUSE_S, LEFT_FRONT + 0.1, 0.0, 90.0) @ Vector((-4.2, -1.4, 4.25)),
              'bridgeA_top': path.offset(BRIDGE_A - 1.4, 0, 3.75), 'bridgeB_top': path.offset(BRIDGE_B, 0, 3.75),
              'tower_top': path.offset(TOWER_S, -10, 25.0), 'teahouse_roof': frame_at(
                  path, TEAHOUSE_S, LEFT_FRONT + 0.1, 0.0, 90.0) @ Vector((0, 4.9, 10.5))}
    probes['moon'] = cam.matrix_world.translation  # placeholder, replaced per frame
    for t in (1.0, 4.0, 7.0, 9.5):
        f = ctx.t2f(t)
        sc.frame_set(int(f))
        probes['moon'] = cam.matrix_world.translation + pk.sky_dir(MOON_AZ, MOON_EL) * 1000.0
        probes['core'] = cam.matrix_world.translation + pk.sky_dir(CORE_AZ, CORE_EL) * 1000.0
        nk = bpy.data.objects.get('Animal_nearkoi')
        if nk is not None:
            probes['nearkoi'] = nk.matrix_world.translation.copy()
        for i, an in enumerate(ANIMALS):
            ob = bpy.data.objects.get('Animal%d_%s' % (i, an[0]))
            if ob is not None:
                probes['an%d_head' % i] = ob.matrix_world @ Vector((0, 0, 0))
                probes['an%d_tail' % i] = ob.matrix_world @ Vector((0, an[3], 0))
        pk.log('t=%.1f roll=%.2f pitch=%.2f' % (t, math.degrees(cam.rotation_euler[1]),
                                                 math.degrees(cam.rotation_euler[0]) - 90))
        line = []
        for k, p in probes.items():
            v = world_to_camera_view(sc, cam, Vector(p))
            line.append('%s=(%.2f,%.2f,%.0fm)' % (k, v.x, v.y, v.z))
        pk.log('t=%.1f s=%.1f ' % (t, ctx.s_of_t(t)) + ' '.join(line))
    for t in (0, 5, 10, 14):
        pk.log('heading t=%d: %.1f' % (t, path.heading(ctx.s_of_t(t) + 12)))
    for ss in (120, 140, 160, 180, 200):
        for la in (-8, 0, 8, 14):
            line = []
            for t in (1.0, 4.0, 7.0, 9.5):
                sc.frame_set(int(ctx.t2f(t)))
                v = world_to_camera_view(sc, cam, path.offset(ss, la, 28.0))
                line.append('(%.2f,%.2f)' % (v.x, v.y))
            pk.log('probe s=%d lat=%d top28m: %s' % (ss, la, ' '.join(line)))


# ============================================================================ web edition only

def _uv_unwrap(ob, name='PKWeb'):
    """Smart UV Project into a new UV map (made active for render and export)."""
    me = ob.data
    uv = me.uv_layers.get(name) or me.uv_layers.new(name=name)
    me.uv_layers.active = uv
    uv.active_render = True
    vl = bpy.context.view_layer
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.hide_viewport = False
    ob.hide_select = False
    ob.hide_set(False)
    ob.select_set(True)
    vl.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60.0), island_margin=0.01, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return uv


def bake_web_emission(c):
    """--export-web only; pk.main runs it after any stills or frames, so the film never sees it.
    glTF cannot carry the procedural paper (ribs, wires, painted detail, hot centres, koi
    patches), so the four animals and the big lantern each get their emission baked (Cycles
    EMIT) to a WEB_BAKE_PX JPEG on a Smart UV map, through a bake variant of their own material
    (fixed facing, no flicker; see paper_mat / animal_paper_mat bake=True). Each material is then
    rebuilt as Principled with that texture on Emission Color, strength = film strength x
    WEB_BAKE_EMIT / WEB_BAKE_GAIN, and loses its pk_web so the kit's flattening keeps it."""
    import time
    sc = bpy.context.scene
    todo = []
    for name, spec in _WEB_BAKE.items():
        m = bpy.data.materials.get(name)
        if m is None:
            continue
        obs = [o for o in sc.objects if o.type == 'MESH' and not o.get('pk_noexport')
               and any(ms.material == m for ms in o.material_slots)]
        if len(obs) != 1 or obs[0].data.users > 1:
            pk.log('web bake: %s has %d objects, skipped' % (name, len(obs)))
            continue
        todo.append((m, obs[0], spec))
    keep = dict(engine=sc.render.engine, world=sc.world, active=bpy.context.view_layer.objects.active,
                sel=[o for o in sc.objects if o.select_get()],
                hide=[(o, o.hide_render) for o in sc.objects])
    t0 = time.time()
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 16
    sc.render.bake.margin = 6
    sc.render.bake.use_clear = True
    sc.render.bake.target = 'IMAGE_TEXTURES'
    sc.world = None
    bakeset = {ob for _, ob, _ in todo}
    for o in sc.objects:
        if o not in bakeset:
            o.hide_render = True
    black, bn = pk._new_mat('PK04_WebBakeBlack')[:2]
    for m, ob, (fn, args, kw) in todo:
        ob.hide_render = False
        uv = _uv_unwrap(ob)
        img = bpy.data.images.new('PK04Web_' + ob.name, WEB_BAKE_PX, WEB_BAKE_PX, alpha=False)
        a = list(args)
        a[1] = WEB_BAKE_GAIN
        a[2] = m.name + '_bake'
        kw = dict(kw)
        view = True
        if kw.pop('_view', False) and sc.camera is not None:
            v = ob.matrix_world.inverted() @ sc.camera.matrix_world.translation
            view = tuple(round(float(x), 4) for x in v.normalized())
            pk.log('web bake: %s faces the camera along %s (object space)' % (ob.name, view))
        bm_ = fn(*a, bake=view, **kw)
        for mm in (bm_, black):
            nd = mm.node_tree.nodes.get('PK04WebBake') or mm.node_tree.nodes.new('ShaderNodeTexImage')
            nd.name = 'PK04WebBake'
            nd.image = img
            mm.node_tree.nodes.active = nd
        me = ob.data
        orig = list(me.materials)
        for i, mm in enumerate(orig):
            me.materials[i] = bm_ if mm == m else black
        for o in bpy.context.selected_objects:
            o.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        t1 = time.time()
        bpy.ops.object.bake(type='EMIT', margin=6, use_clear=True, target='IMAGE_TEXTURES')
        for i, mm in enumerate(orig):
            me.materials[i] = mm
        bpy.data.materials.remove(bm_)
        img.pack()
        # the export material: flat base and roughness from pk_web, the baked emission
        w = m['pk_web'].to_dict()
        base, rough = [float(v) for v in w['base']][:3], float(w['rough'])
        del m['pk_web']
        k = WEB_BAKE_EMIT_LANTERN if fn is paper_mat else WEB_BAKE_EMIT
        strength = float(args[1]) * k / WEB_BAKE_GAIN
        nt = m.node_tree
        nt.nodes.clear()
        out = pk.node(nt, 'ShaderNodeOutputMaterial')
        p = pk.node(nt, 'ShaderNodeBsdfPrincipled')
        p.inputs['Base Color'].default_value = base + [1.0]
        p.inputs['Roughness'].default_value = rough
        p.inputs['Emission Strength'].default_value = strength
        tx = pk.node(nt, 'ShaderNodeTexImage')
        tx.image = img
        um = pk.node(nt, 'ShaderNodeUVMap')
        um.uv_map = uv.name
        nt.links.new(um.outputs['UV'], tx.inputs['Vector'])
        nt.links.new(tx.outputs['Color'], p.inputs['Emission Color'])
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        px = np.empty(WEB_BAKE_PX * WEB_BAKE_PX * 4, np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)[:, :3]
        lit = px[px.max(axis=1) > 0.004]
        pk.log('web bake: %s on %s, %d px, strength %.2f, lit texels %.0f%%, mean %s, max %.3f (%.1f s)'
               % (m.name, ob.name, WEB_BAKE_PX, strength, 100.0 * len(lit) / len(px),
                  tuple(round(float(v), 3) for v in (lit.mean(axis=0) if len(lit) else (0, 0, 0))),
                  float(px.max()), time.time() - t1))
    bpy.data.materials.remove(black)
    n_stone = _bake_stone_tiles()
    for o, h in keep['hide']:
        o.hide_render = h
    sc.world = keep['world']
    sc.render.engine = keep['engine']
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in keep['sel']:
        o.select_set(True)
    bpy.context.view_layer.objects.active = keep['active']
    pk.log('web bake: %d paper materials, %d stone tiles (%.1f s)' % (len(todo), n_stone, time.time() - t0))


def stone_tile_mat(color, brick, nx, ny, name):
    """Web export only: one periodic tile (nx bricks by ny rows, ny even) of stone_mat's dressed
    blocks as an emission shader for an EMIT bake: per-block tone between colour x 0.82 and
    x 1.12 with stone_mat's per-block jitter, and colour x 0.35 mortar 14 mm wide. Block keys
    wrap at the tile edge so the texture repeats without a seam. The film's position-based
    terms (stains, wet foot, moss, edge wear) cannot tile and are left out."""
    m, nt, out = pk._new_mat(name)
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    bw, rh = brick
    c = Vector(color)
    row = pk.math_(nt, 'FLOOR', pk.math_(nt, 'DIVIDE', V, rh))
    off = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'SUBTRACT', 1.0, pk.math_(nt, 'FLOORED_MODULO', row, 2.0)), 0.5)
    fx = pk.math_(nt, 'ADD', pk.math_(nt, 'DIVIDE', U, bw), off)
    cellx = pk.math_(nt, 'FLOOR', fx)
    gx = pk.math_(nt, 'FRACT', fx)
    gy = pk.math_(nt, 'FRACT', pk.math_(nt, 'DIVIDE', V, rh))
    dx = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MINIMUM', gx, pk.math_(nt, 'SUBTRACT', 1.0, gx)), bw)
    dy = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MINIMUM', gy, pk.math_(nt, 'SUBTRACT', 1.0, gy)), rh)
    mortar = pk.maprange(nt, pk.math_(nt, 'MINIMUM', dx, dy), 0.004, 0.009, 1.0, 0.0, interp='SMOOTHSTEP')
    key = pk.comb_xyz(nt, pk.math_(nt, 'FLOORED_MODULO', cellx, float(nx)),
                      pk.math_(nt, 'FLOORED_MODULO', row, float(ny)), 0.0)
    wn = pk.node(nt, 'ShaderNodeTexWhiteNoise', noise_dimensions='3D')
    pk._set(nt, wn.inputs['Vector'], key)
    wn2 = pk.node(nt, 'ShaderNodeTexWhiteNoise', noise_dimensions='3D')
    pk._set(nt, wn2.inputs['Vector'], pk.vmath(nt, 'ADD', key, (0.0, 0.0, 3.7)))
    col = pk.mix_col(nt, wn2.outputs['Value'], tuple(c * 0.82), tuple(c * 1.12))
    col = pk.vmath(nt, 'MULTIPLY', col, pk.mix_col(nt, 0.12, (1, 1, 1), wn.outputs['Color']))
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, wn.outputs['Value'], 0, 1, 0.84, 1.14))
    col = pk.mix_col(nt, mortar, col, tuple(c * 0.35))
    em = pk.node(nt, 'ShaderNodeEmission')
    nt.links.new(col, em.inputs['Color'])
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


def _bake_stone_tiles():
    """Inside bake_web_emission's Cycles setup: bake one tile per WEB_STONE_TILES material on a
    temporary plane whose UVs are in metres, then rebuild that material for the export as
    Principled with the tile as base colour through a Mapping node (the glTF exporter writes it as
    KHR_texture_transform), on the meshes' own box UVs in metres. Roughness stays pk_web's."""
    sc = bpy.context.scene
    n = 0
    for name, (color, brick, nx, ny) in WEB_STONE_TILES.items():
        m = bpy.data.materials.get(name)
        if m is None or m.get('pk_web') is None:
            continue
        # meshes without UVs (e.g. the quay post source) get box UVs in metres, so the texture
        # has a valid texCoord in the glTF
        for me_ in {o.data for o in sc.objects if o.type == 'MESH' and not o.data.uv_layers
                    and any(ms.material == m for ms in o.material_slots)}:
            pk._box_uv(me_)
            pk.log('web bake: box UVs for %s (%s)' % (me_.name, name))
        W, H = nx * brick[0], ny * brick[1]
        me = bpy.data.meshes.new('PK04WebTile')
        me.from_pydata([(0, 0, 0), (W, 0, 0), (W, H, 0), (0, H, 0)], [], [(0, 1, 2, 3)])
        uvl = me.uv_layers.new(name='UVMap')          # metres: what the tile material reads
        bkl = me.uv_layers.new(name='BakeUV')         # 0..1: where the bake writes
        for li, lp in enumerate(me.loops):
            co = me.vertices[lp.vertex_index].co
            uvl.data[li].uv = (co.x, co.y)
            bkl.data[li].uv = (co.x / W, co.y / H)
        me.uv_layers.active = bkl
        ob = bpy.data.objects.new('PK04WebTile', me)
        sc.collection.objects.link(ob)
        tm = stone_tile_mat(color, brick, nx, ny, name + '_tile')
        me.materials.append(tm)
        img = bpy.data.images.new('PK04WebTile_' + name, WEB_STONE_PX, WEB_STONE_PX, alpha=False)
        nd = tm.node_tree.nodes.new('ShaderNodeTexImage')
        nd.image = img
        tm.node_tree.nodes.active = nd
        for o in bpy.context.selected_objects:
            o.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='EMIT', margin=0, use_clear=True, target='IMAGE_TEXTURES', uv_layer='BakeUV')
        img.pack()
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
        bpy.data.materials.remove(tm)
        w = m['pk_web'].to_dict()
        rough = float(w['rough'])
        del m['pk_web']
        nt = m.node_tree
        nt.nodes.clear()
        out = pk.node(nt, 'ShaderNodeOutputMaterial')
        p = pk.node(nt, 'ShaderNodeBsdfPrincipled')
        p.inputs['Roughness'].default_value = rough
        tx = pk.node(nt, 'ShaderNodeTexImage')
        tx.image = img
        tx.extension = 'REPEAT'
        mp = pk.node(nt, 'ShaderNodeMapping', vector_type='POINT')
        mp.inputs['Scale'].default_value = (1.0 / W, 1.0 / H, 1.0)
        # a mesh without UVs samples uv (0, 0): put that inside a block, not on a mortar line
        mp.inputs['Location'].default_value = (0.25 * brick[0] / W, 0.5 * brick[1] / H, 0.0)
        um = pk.node(nt, 'ShaderNodeUVMap')
        um.uv_map = 'UVMap'
        nt.links.new(um.outputs['UV'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], tx.inputs['Vector'])
        nt.links.new(tx.outputs['Color'], p.inputs['Base Color'])
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        px = np.empty(WEB_STONE_PX * WEB_STONE_PX * 4, np.float32)
        img.pixels.foreach_get(px)
        pk.log('web bake: %s tile %.2f x %.2f m (%d x %d blocks), mean %s'
               % (name, W, H, nx, ny, tuple(round(float(v), 3) for v in px.reshape(-1, 4)[:, :3].mean(axis=0))))
        n += 1
    return n


_kit_export_web = pk.export_web


def export_web_baked(c):
    """pk.main calls the module's export_web after the stills and frames; bake first."""
    bake_web_emission(c)
    return _kit_export_web(c)


pk.export_web = export_web_baked

pk.main(SLUG, build)
