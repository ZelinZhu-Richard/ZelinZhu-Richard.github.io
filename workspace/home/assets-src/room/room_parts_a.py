"""Architecture, exterior, the desk and everything on it, the armillary sphere, chair and compute rack."""
import math
import random

import bmesh
from mathutils import Euler, Matrix, Vector

from room_lib import (TAU, bevel, bm_obj, bm_transform, box, box_bm, coll, cyl, cyl_bm, empty, instance, join_bms,
                      lathe, lathe_bm, plane, plane_bm, ring_band, set_mat_index, solidify, sphere, sphere_bm, subsurf,
                      torus, tube, tube_bm)

D = math.radians

# room envelope: x -5..5 (left window wall at -5), y 0..7 (back wall at 7), z 0..5
RX0, RX1, RY0, RY1, RH = -5.0, 5.0, 0.0, 7.0, 5.0
BACK_WINDOW_X1 = -1.0  # back wall is glass from x=-5 to here
DESK_Z = 0.77          # desk top surface
DESK_X1 = -1.05        # right end of the desk's main arm
DOWNLIGHTS = [(-3.25, 1.6), (-3.25, 4.3), (-0.65, 1.6), (-0.65, 4.3), (1.95, 1.6), (1.95, 4.3), (3.9, 1.4),
              (3.9, 3.4), (0.6, 6.25), (2.2, 6.25)]


# =============================================================================================
# Architecture
# =============================================================================================

def build_architecture(M):
    C = coll('Architecture')
    box('Floor', C, (10.4, 7.4, 0.3), (0, 3.5, -0.15), M['floor'])
    box('Ceiling', C, (10.4, 7.4, 0.3), (0, 3.5, RH + 0.15), M['ceiling'])
    box('Wall_Back', C, (5.2 - BACK_WINDOW_X1, 0.2, RH), ((BACK_WINDOW_X1 + 5.2) / 2, 7.1, RH / 2), M['wall'])
    box('Wall_Right', C, (0.2, 7.4, RH), (5.1, 3.5, RH / 2), M['wall_panel'])
    box('Wall_Front', C, (10.4, 0.2, RH), (0, -0.1, RH / 2), M['wall'])
    # skirting with a faint violet reveal line along the right wall
    box('Skirting_Right', C, (0.03, 7.0, 0.08), (4.985, 3.5, 0.04), M['frame'])

    # recessed light lines in the ceiling (separate named objects so the engine can switch them)
    CL = coll('Light_Strips')
    # thin linear lights running toward the back window, alternating violet and cyan
    for i, x in enumerate((-3.9, -2.6, -1.3, 0.0, 1.3, 2.6)):
        box(f'Strip_Ceiling_{i + 1}', CL, (0.022, 6.0, 0.02), (x, 3.55, RH - 0.012),
            M['ceiling_line'] if i % 2 == 0 else M['ceiling_line_cyan'])
    # recess channels (dark slots the strips sit in)
    for i, x in enumerate((-3.9, -2.6, -1.3, 0.0, 1.3, 2.6)):
        box(f'Ceiling_Slot_{i + 1}', C, (0.09, 6.1, 0.01), (x, 3.55, RH - 0.004), M['frame'])
    # small warm downlights between the strips (emissive lenses in dark trims; spots added in build_lights)
    dl, trims = [], []
    for (x, y) in DOWNLIGHTS:
        trims.append(cyl_bm(0.065, 0.012, seg=24, offset=(x, y, RH - 0.006)))
        dl.append(cyl_bm(0.042, 0.006, seg=24, offset=(x, y, RH - 0.013)))
    bm_obj(join_bms(trims), 'Ceiling_Downlight_Trims', C, M['frame'])
    bm_obj(join_bms(dl), 'Strip_Ceiling_Downlights', CL, M['downlight'])
    # violet cove where the ceiling meets the back wall, with a dark lip that hides the strip from below
    box('Strip_Cove_Violet', CL, (6.0, 0.02, 0.012), (2.0, 6.975, RH - 0.03), M['cove_violet'])

    # window wall: left (x=-5) full length, back-left (y=7) up to BACK_WINDOW_X1
    CW = coll('Window')
    gl = bmesh.new()
    g1 = plane_bm(7.0, RH, nx=1, ny=1)
    bm_transform(g1, (RX0 - 0.02, 3.5, RH / 2), (D(90), 0, D(90)))
    g2 = plane_bm(BACK_WINDOW_X1 - RX0, RH, nx=1, ny=1)
    bm_transform(g2, ((RX0 + BACK_WINDOW_X1) / 2, RY1 + 0.02, RH / 2), (D(90), 0, 0))
    bm_obj(join_bms([g1, g2]), 'Window_Glass', CW, M['window'])

    mull = []
    ys = [0.04, 1.2, 2.35, 3.5, 4.65, 5.8, 6.96]
    for y in ys:
        mull.append(box_bm((0.10, 0.055, RH), (RX0 - 0.01, y, RH / 2)))
    for x in (-3.68, -2.35, BACK_WINDOW_X1 + 0.03):
        mull.append(box_bm((0.055, 0.10, RH), (x, RY1 + 0.01, RH / 2)))
    for z in (0.03, 3.35, RH - 0.03):
        mull.append(box_bm((0.10, 7.0, 0.06), (RX0 - 0.01, 3.5, z)))
        mull.append(box_bm((BACK_WINDOW_X1 - RX0, 0.10, 0.06), ((RX0 + BACK_WINDOW_X1) / 2, RY1 + 0.01, z)))
    ob = bm_obj(join_bms(mull), 'Window_Mullions', CW, M['frame'])
    bevel(ob, 0.006, 1)
    # interior sill
    box('Window_Sill', CW, (0.16, 7.0, 0.03), (RX0 + 0.06, 3.5, 0.015), M['frame'])

    # the building sits on a dark cliff above the sea
    box('Cliff_Under_Room', C, (14.0, 14.0, 40.0), (0.5, 3.5, -20.3), M['land'])
    return C


# =============================================================================================
# Exterior: sky dome, sea, coast, skyline
# =============================================================================================

def dome_bm(radius, el_min=-20.0, el_max=90.0, nu=192, nv=56):
    """Inward-facing dome with equirect UVs: u = azimuth/360 (atan2(y,x)), v = (el-el_min)/(el_max-el_min)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    rows = []
    for j in range(nv + 1):
        el = el_min + (el_max - el_min) * j / nv
        row = []
        for i in range(nu + 1):
            az = TAU * i / nu
            ce = math.cos(math.radians(el))
            row.append(bm.verts.new((radius * ce * math.cos(az), radius * ce * math.sin(az),
                                     radius * math.sin(math.radians(el)))))
        rows.append(row)
    for j in range(nv):
        for i in range(nu):
            vs = [rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]]  # inward winding
            if j == nv - 1:
                vs = [rows[j][i], rows[j + 1][i], rows[j][i + 1]]
                f = bm.faces.new(vs)
                uvs = [(i / nu, j / nv), ((i + 0.5) / nu, 1.0), ((i + 1) / nu, j / nv)]
            else:
                f = bm.faces.new(vs)
                uvs = [(i / nu, j / nv), (i / nu, (j + 1) / nv), ((i + 1) / nu, (j + 1) / nv), ((i + 1) / nu, j / nv)]
            for lp, uv in zip(f.loops, uvs):
                lp[uvl].uv = uv
    return bm


SEA_Z = -36.0
DOME_R = 60000.0


def _vnoise(rng, knots):
    """Smooth 1-D value noise on [0, 1] with `knots` cells; returns f(x) in about [-1, 1]."""
    vals = [rng.uniform(-1.0, 1.0) for _ in range(knots + 2)]

    def f(x):
        p = min(max(x, 0.0), 1.0) * knots
        i = min(int(p), knots)
        t = p - i
        t = t * t * (3 - 2 * t)
        return vals[i] + (vals[i + 1] - vals[i]) * t
    return f


def _ridged(rng, octaves):
    fs = [(_vnoise(rng, k), a) for k, a in octaves]
    tot = sum(a for _, a in fs)
    return lambda x: sum(a * (1 - abs(g(x))) ** 2 for g, a in fs) / tot


def ridge_card_bm(az0, az1, dist, hmax, seed, n=220, peaks=(), slope=1.3):
    """Mountain range as a sloped card between azimuths az0..az1 (deg) at `dist` m: the top follows ridged
    noise (plus explicit peaks), the foot sits under the sea, lower rows are nearer so the face slopes up and
    away. UV: u along the range, v = height fraction (the shader puts snow near the top)."""
    rng = random.Random(seed)
    rid = _ridged(rng, [(5, 1.0), (13, 0.55), (31, 0.28), (80, 0.12)])
    jag = _ridged(rng, [(23, 1.0), (57, 0.5), (140, 0.25)])
    dj = _vnoise(rng, 7)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    fr = [-0.05, 0.0, 0.3, 0.6, 0.82, 1.0]
    cols = []
    for i in range(n + 1):
        x = i / n
        az = math.radians(az0 + (az1 - az0) * x)
        win = math.sin(math.pi * x) ** 0.55
        top = hmax * win * (0.30 + 0.70 * rid(x))
        for pc, ph, pw in peaks:
            # asymmetric flanks, a concave profile and jagged ridgelines: no pyramids
            w_ = pw * (0.75 if x < pc else 1.25)
            k = max(0.0, 1 - abs(x - pc) / w_)
            top = max(top, ph * k ** 1.15 * (0.80 + 0.20 * jag(x)) * (0.92 + 0.08 * rid(x)))
        top = max(top, 3.0)
        d0 = dist * (1 + 0.05 * dj(x))
        col = []
        for f in fr:
            z = SEA_Z + top * f if f >= 0 else SEA_Z - 40.0
            d = d0 - (1 - max(f, 0.0)) * top * slope
            col.append(bm.verts.new((d * math.cos(az), d * math.sin(az), z)))
        cols.append(col)
    for i in range(n):
        for j in range(len(fr) - 1):
            f_ = bm.faces.new([cols[i][j], cols[i + 1][j], cols[i + 1][j + 1], cols[i][j + 1]])
            for lp, (a, b) in zip(f_.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]):
                lp[uvl].uv = (a / n, max(fr[b], 0.0))
    return bm


def conifer_bm(x, y, z, h, rng):
    """Pointed conifer silhouette: three stacked cones."""
    r = h * rng.uniform(0.18, 0.24)
    bms = []
    for (z0, z1, rr) in ((0.12, 0.55, 1.0), (0.38, 0.80, 0.72), (0.62, 1.0, 0.46)):
        hh = (z1 - z0) * h
        bms.append(cyl_bm(r * rr, hh, seg=6, r2=0.02, offset=(x, y, z + z0 * h + hh / 2)))
    return join_bms(bms)


def land_bm(az0, az1, shore, height, depth, nu=80, nv=18, cliff=70.0, seed=0):
    """Polar heightfield from the shoreline inland. shore(x) = waterline distance (m), height(x) = plateau height
    (m) for x in 0..1 across az0..az1. Returns (bmesh, h(x, r) sampler)."""
    rng = random.Random(seed)
    nz = _vnoise(rng, 23)
    nz2 = _vnoise(rng, 61)

    def hgt(x, r):
        s = shore(x)
        if r < s:
            return SEA_Z - 12.0
        t = min((r - s) / cliff, 1.0)
        t = t * t * (3 - 2 * t)
        inland = 1.0 - 0.35 * min((r - s) / depth, 1.0)
        return SEA_Z + height(x) * t * inland * (0.85 + 0.15 * nz((x + r / depth) * 0.5)) + 6 * nz2(x) * t

    bm = bmesh.new()
    rows = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            x = i / nu
            s = shore(x)
            r = s - 60 + (depth + 60) * (j / nv) ** 1.6
            az = math.radians(az0 + (az1 - az0) * x)
            row.append(bm.verts.new((r * math.cos(az), r * math.sin(az), hgt(x, r))))
        rows.append(row)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new([rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm, hgt


def build_outside(M, seed=7):
    """Exterior, all geometry in front of the sky dome so depth order is physical: the sea, three mountain
    ranges (aurora and stars sit behind them), a forested headland, a far shore with a thin line of lights,
    and a far city of ~56 towers across the bay in the left-back panes, fading into indigo haze."""
    from room_lib import emission
    rng = random.Random(seed)
    C = coll('Outside')
    sky = bm_obj(dome_bm(DOME_R), 'Sky_Dome', C, M['sky'], smooth=True)
    sky.visible_shadow = False
    sky.visible_diffuse = False
    sea = bm_obj(plane_bm(240000, 240000, nx=1, ny=1), 'Sea', C, M['water'], loc=(0, 0, SEA_Z))
    sea.visible_shadow = False

    def far(ob):
        ob.visible_shadow = False
        ob.visible_diffuse = False
        return ob

    # --- mountains (az measured counter-clockwise from +X; +Y = 90 = the back window)
    ranges = [
        # az0, az1, distance, max height, seed, explicit peaks (pos 0..1, height, half-width)
        (88, 205, 26000, 1500, 101, ((0.56, 1900, 0.10), (0.30, 1600, 0.08))),
        (71, 116, 12500, 850, 102, ((0.52, 1450, 0.22), (0.80, 1050, 0.12))),
        (6, 60, 34000, 1300, 103, ((0.40, 1700, 0.12),)),
        (196, 252, 15000, 1000, 104, ()),
    ]
    mbms = [ridge_card_bm(a0, a1, d, h, s, peaks=pk) for a0, a1, d, h, s, pk in ranges]
    far(bm_obj(join_bms(mbms), 'Mountains', C, M['mountain'], smooth=True))

    lights = {'warm': [], 'cool': []}
    trees = []

    def shore_lights(az0, az1, shore, n, rr_scale=0.00045, cool=0.15, gap=0.35):
        for k in range(n):
            x = (k + rng.uniform(0, 1)) / n
            if rng.random() < gap:
                continue
            az = math.radians(az0 + (az1 - az0) * x)
            d = shore(x) - rng.uniform(5, 30)
            r = max(0.5, d * rr_scale * rng.uniform(0.7, 1.3))
            p = (d * math.cos(az), d * math.sin(az), SEA_Z + r + rng.uniform(1, 6))
            lights['cool' if rng.random() < cool else 'warm'].append(sphere_bm(r, 8, 4, offset=p))

    # --- forested headland reaching toward the room from the far shore (right of the city)
    hs = lambda x: 1900 + 2300 * x ** 1.4          # tip at az 96 (1.9 km), root under the city (4.2 km)
    hh = lambda x: (45 + 95 * math.sin(math.pi * min(x * 1.25, 1.0)) ** 0.7)
    hb, hgt = land_bm(96, 124, hs, hh, 1400, nu=90, nv=16, cliff=90, seed=11)
    far(bm_obj(hb, 'Coast_Headland', C, M['land'], smooth=True))
    for _ in range(700):
        x = rng.uniform(0.02, 0.98)
        r = hs(x) + rng.uniform(70, 1100) ** 1.0
        z = hgt(x, r)
        if z < SEA_Z + 18:
            continue
        az = math.radians(96 + 28 * x)
        trees.append(conifer_bm(r * math.cos(az), r * math.sin(az), z - 1.0, rng.uniform(14, 27), rng))
    shore_lights(96, 124, hs, 46, cool=0.1, gap=0.55)

    # --- far shore under the city: low land with a thin line of lights at the waterline; it runs from behind
    # the right monitor (az 70) to the left window (az 156) so the skyline spans half the far shore
    fs = lambda x: 4300 + 150 * math.sin(x * 11.0) + 120 * math.sin(x * 29.0)
    fh = lambda x: 22 + 26 * math.sin(math.pi * x) ** 0.5
    fb, _ = land_bm(70, 156, fs, fh, 3200, nu=150, nv=10, cliff=120, seed=12)
    far(bm_obj(fb, 'Far_Shore', C, M['land'], smooth=True))
    shore_lights(70, 156, fs, 240, cool=0.25, gap=0.25)

    # --- near coast in the left window: cliffs with conifers and a few house lights
    ls = lambda x: 1100 + 1500 * abs(x - 0.35) ** 1.2 + 120 * math.sin(x * 23)
    lh = lambda x: 55 + 70 * math.sin(math.pi * x) ** 0.8
    lb, lhgt = land_bm(150, 228, ls, lh, 1600, nu=120, nv=16, cliff=60, seed=13)
    far(bm_obj(lb, 'Coast_Land', C, M['land'], smooth=True))
    for _ in range(650):
        x = rng.uniform(0.02, 0.98)
        r = ls(x) + rng.uniform(50, 1200)
        z = lhgt(x, r)
        if z < SEA_Z + 15:
            continue
        az = math.radians(150 + 78 * x)
        trees.append(conifer_bm(r * math.cos(az), r * math.sin(az), z - 1.0, rng.uniform(12, 24), rng))
    shore_lights(150, 228, ls, 40, cool=0.05, gap=0.6)
    far(bm_obj(join_bms(trees), 'Coast_Trees', C, M['tree']))

    # --- the city across the bay: ~78 slim towers (width:height 1:6 to 1:10), 120-760 m, stepped tops and
    # spires, spread over az 72-150 (half the far shore) in a main cluster and a second one behind the desk
    # monitors. About one in six carries a cyan or violet neon edge strip and a red aircraft light.
    towers_a, towers_b, neon_v, neon_c, red = [], [], [], [], []
    base = SEA_Z + 14
    for i in range(78):
        if rng.random() < 0.62:
            az_deg = rng.gauss(121.0, 9.0)
            core = math.exp(-((az_deg - 120.0) / 8.0) ** 2)
        else:
            az_deg = rng.gauss(86.0, 7.0)
            core = 0.65 * math.exp(-((az_deg - 85.0) / 6.0) ** 2)
        az_deg = min(max(az_deg, 72.0), 150.0)
        az = math.radians(az_deg)
        dist = rng.uniform(4900, 7200)
        cx, cy = dist * math.cos(az), dist * math.sin(az)
        h = rng.uniform(120, 260) + core * rng.uniform(180, 500)
        if rng.random() < 0.2:
            h *= 0.6
        slender = rng.uniform(6.0, 10.0)
        w = max(16.0, min(h / slender, 78.0))
        d = w * rng.uniform(0.75, 1.0)
        kind = rng.choices(['stepped', 'slim', 'tapered', 'round', 'box'], [4, 3, 2, 2, 2])[0]
        top = h
        if kind == 'stepped':
            parts, z0, ww, dd = [], 0.0, w, d
            fr = [0.55, 0.22, 0.13, 0.10]
            for k_, f in enumerate(fr):
                parts.append(box_bm((ww, dd, h * f), (0, 0, z0 + h * f / 2)))
                z0 += h * f
                ww, dd = ww * 0.76, dd * 0.76
            bm = join_bms(parts)
        elif kind == 'slim':
            bm = join_bms([box_bm((w, d, h * 0.9), (0, 0, h * 0.45)),
                           box_bm((w * 0.6, d * 0.6, h * 0.1), (0, 0, h * 0.95))])
        elif kind == 'round':
            bm = join_bms([cyl_bm(w / 2, h * 0.90, seg=16, offset=(0, 0, h * 0.45)),
                           cyl_bm(w / 2, h * 0.10, seg=16, r2=w * 0.22, offset=(0, 0, h * 0.95))])
        elif kind == 'tapered':
            bm = cyl_bm(w / 1.414, h, seg=4, r2=w / 1.414 * 0.55, offset=(0, 0, h / 2))
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 4, 3, 'Z'), verts=bm.verts)
        else:
            bm = box_bm((w, d, h), (0, 0, h / 2))
        spire = kind == 'slim' or (h > 330 and rng.random() < 0.55)
        if spire:
            sh = h * rng.uniform(0.12, 0.22)
            bm = join_bms([bm, cyl_bm(1.4, sh, seg=6, r2=0.2, offset=(0, 0, h + sh / 2))])
            top = h + sh
        rot = rng.uniform(0, 1.5)
        bm_transform(bm, (cx, cy, base), (0, 0, rot))
        (towers_a if i % 2 else towers_b).append(bm)
        # neon edge strips on about one in six (and on the very tallest), with a crown band
        if rng.random() < 1 / 6 or h > 600:
            th = 4.0
            edge_h = h * (0.55 if kind == 'stepped' else 0.9)
            cw, cd = (w * 0.72, w * 0.72) if kind == 'tapered' else (w, d)
            parts = [box_bm((th, th, edge_h), (cw / 2, cd / 2, edge_h / 2 + h * 0.04))]
            if rng.random() < 0.5:
                parts.append(box_bm((th, th, edge_h), (-cw / 2, cd / 2, edge_h / 2 + h * 0.04)))
            parts += [box_bm((cw + th, th, th), (0, cd / 2, edge_h + h * 0.04)),
                      box_bm((cw + th, th, th), (0, -cd / 2, edge_h + h * 0.04)),
                      box_bm((th, cd + th, th), (cw / 2, 0, edge_h + h * 0.04)),
                      box_bm((th, cd + th, th), (-cw / 2, 0, edge_h + h * 0.04))]
            nb = join_bms(parts)
            bm_transform(nb, (cx, cy, base), (0, 0, rot))
            (neon_v if rng.random() < 0.5 else neon_c).append(nb)
            red.append(sphere_bm(3.2, 8, 4, offset=(cx, cy, base + top + 2.0)))
        elif h > 420:
            red.append(sphere_bm(3.0, 8, 4, offset=(cx, cy, base + top + 2.0)))
    far(bm_obj(join_bms(towers_a), 'Skyline_Towers_A', C, M['tower']))
    far(bm_obj(join_bms(towers_b), 'Skyline_Towers_B', C, M['tower2']))
    far(bm_obj(join_bms(neon_v), 'Skyline_Neon_Violet', C, emission('Neon_Violet_Far', (0.30, 0.12, 1.0), 7.0)))
    far(bm_obj(join_bms(neon_c), 'Skyline_Neon_Cyan', C, emission('Neon_Cyan_Far', (0.02, 0.80, 0.70), 6.0)))
    far(bm_obj(join_bms(red), 'Skyline_Aviation', C, emission('Aviation_Red', (1.0, 0.05, 0.02), 30.0)))
    far(bm_obj(join_bms(lights['warm']), 'Coast_Lights', C, emission('Coast_Light', (1.0, 0.58, 0.26), 16.0)))
    far(bm_obj(join_bms(lights['cool']), 'Coast_Lights_Cool', C, emission('Coast_Light_Cool', (0.55, 0.72, 1.0),
                                                                         12.0)))
    return C


# =============================================================================================
# Desk
# =============================================================================================

def build_desk(M):
    """L desk: main arm along the back window (monitors face -Y), return arm along the left window."""
    C = coll('Desk')
    S = coll('Light_Strips')
    x0 = -4.88
    top_main = box_bm((DESK_X1 - x0, 0.85, 0.05), ((x0 + DESK_X1) / 2, 6.405, DESK_Z - 0.025))
    top_ret = box_bm((0.83, 1.40, 0.05), (-4.465, 5.28, DESK_Z - 0.025))
    t = bm_obj(join_bms([top_main, top_ret]), 'Desk_Top', C, M['desk_top'])
    bevel(t, 0.004, 2)
    sk0 = -4.05
    box('Desk_Skirt_Main', C, (DESK_X1 - sk0, 0.02, 0.06), ((sk0 + DESK_X1) / 2, 5.99, DESK_Z - 0.08), M['desk_body'])
    box('Desk_Skirt_Return', C, (0.02, 1.38, 0.06), (-4.06, 5.28, DESK_Z - 0.08), M['desk_body'])
    # edge light strips (named, separate); the front strip is a narrow diffused 1 cm line
    box('Strip_Desk_Edge_Violet', S, (DESK_X1 - sk0, 0.006, 0.010), ((sk0 + DESK_X1) / 2, 5.975, DESK_Z - 0.030),
        M['led_violet_soft'])
    box('Strip_Desk_Return_Cyan', S, (0.006, 1.40, 0.010), (-4.047, 5.28, DESK_Z - 0.030), M['led_cyan'])
    box('Strip_Desk_End_Cyan', S, (0.83, 0.006, 0.010), (-4.465, 4.577, DESK_Z - 0.030), M['led_cyan'])
    box('Strip_Desk_Under_Violet', S, (DESK_X1 - sk0 - 0.1, 0.02, 0.006), ((sk0 + DESK_X1) / 2, 6.05,
                                                                          DESK_Z - 0.115), M['led_violet'])

    # compute cabinet under the left part of the main arm (open to -Y)
    cab = []
    cx0, cx1 = -4.02, -2.70
    cab.append(box_bm((0.025, 0.78, 0.69), (cx0, 6.41, 0.345)))
    cab.append(box_bm((0.025, 0.78, 0.69), (cx1, 6.41, 0.345)))
    cab.append(box_bm((cx1 - cx0, 0.78, 0.025), ((cx0 + cx1) / 2, 6.41, 0.04)))
    cab.append(box_bm((cx1 - cx0, 0.025, 0.69), ((cx0 + cx1) / 2, 6.79, 0.345)))
    cab.append(box_bm((0.02, 0.76, 0.66), (-3.66, 6.41, 0.36)))
    ob = bm_obj(join_bms(cab), 'Desk_Cabinet', C, M['desk_body'])
    bevel(ob, 0.004, 1)
    box('Strip_Cabinet_Violet_A', S, (0.01, 0.008, 0.66), (cx0 + 0.015, 6.022, 0.36), M['led_violet'])
    box('Strip_Cabinet_Violet_B', S, (0.01, 0.008, 0.66), (cx1 - 0.015, 6.022, 0.36), M['led_violet'])
    box('Strip_Cabinet_Floor_Cyan', S, (cx1 - cx0 - 0.03, 0.008, 0.01), ((cx0 + cx1) / 2, 6.022, 0.012),
        M['led_cyan'])
    build_rack(M, C)

    # leg panel at the end of the return and a pedestal under the right end of the main arm
    box('Desk_Leg_End', C, (0.75, 0.03, 0.70), (-4.47, 4.62, 0.36), M['desk_body'], bev=0.003)
    px = DESK_X1 + 0.36
    box('Desk_Pedestal', C, (0.62, 0.70, 0.70), (px, 6.42, 0.36), M['desk_body'], bev=0.004)
    for k in range(3):
        z = 0.14 + k * 0.22
        box(f'Pedestal_Drawer_Line_{k}', C, (0.58, 0.003, 0.004), (px, 6.068, z + 0.1), M['frame'])
        box(f'Pedestal_Handle_{k}', C, (0.16, 0.012, 0.01), (px, 6.062, z + 0.06), M['alu'], bev=0.003)
    box('Strip_Pedestal_Cyan', S, (0.01, 0.008, 0.66), (px - 0.30, 6.064, 0.36), M['led_cyan'])

    # desk mat with glowing dial pattern
    plane('Desk_Mat', C, 1.0, 0.40, (-3.05, 6.21, DESK_Z + 0.002), (0, 0, 0), M['deskmat'])
    build_monitors(M)
    build_desk_objects(M)
    return C


def build_rack(M, C):
    R = coll('Compute_Rack')
    # five generic compute units (no marks): perforated fronts, rack ears, two short rows of status lights
    leds = {'status_green': [], 'status_cyan': [], 'status_amber': []}
    units, ears, seams = [], [], []
    for k in range(5):
        z = 0.09 + k * 0.118
        units.append(box_bm((0.88, 0.62, 0.105), (-3.18, 6.42, z + 0.053)))
        plane('Rack_Unit_Front_%d' % (k + 1), R, 0.60, 0.084, (-3.27, 6.108, z + 0.053), (D(90), 0, 0),
              M['grille'])
        for row in range(2):
            for j in range(6):
                kind = ['status_green', 'status_cyan', 'status_green', 'status_amber', 'status_cyan',
                        'status_green'][(j + k + row * 2) % 6]
                if (j * 7 + k * 3 + row * 5) % 9 == 4:
                    continue
                leds[kind].append(box_bm((0.007, 0.004, 0.004), (-2.925 + j * 0.0145, 6.107,
                                                                 z + 0.080 - row * 0.016)))
        leds['status_cyan'].append(box_bm((0.07, 0.004, 0.003), (-2.89, 6.107, z + 0.026)))
        for ex in (-3.612, -2.748):
            ears.append(box_bm((0.010, 0.016, 0.086), (ex, 6.102, z + 0.053)))
        # two pull handles (a bar on two stand-offs) at the ends of each front
        for hx in (-3.588, -2.772):
            ears.append(box_bm((0.010, 0.010, 0.070), (hx, 6.080, z + 0.053)))
            for hz in (-0.029, 0.029):
                ears.append(box_bm((0.008, 0.024, 0.008), (hx, 6.094, z + 0.053 + hz)))
        # thin bay seam between the drive bays and the vent
        seams.append(box_bm((0.002, 0.003, 0.076), (-2.96, 6.109, z + 0.053)))
        if k < 4:
            seams.append(box_bm((0.86, 0.003, 0.0025), (-3.18, 6.109, z + 0.112)))
    ob = bm_obj(join_bms(units), 'Rack_Units', R, M['plastic_black'])
    bevel(ob, 0.004, 2)
    ob = bm_obj(join_bms(ears), 'Rack_Ears', R, M['chrome'])
    bevel(ob, 0.002, 1)
    from room_lib import emission
    bm_obj(join_bms(seams), 'Rack_Seams', R, emission('Rack_Seam_Glow', (0.30, 0.12, 1.0), 2.5))
    for kind, lst in leds.items():
        bm_obj(join_bms(lst), 'Rack_Status_' + kind.split('_')[1].title(), R, M[kind])
    # stack of silver compute boxes to the left of the units
    boxes = []
    for k in range(5):
        z = 0.06 + k * 0.124
        boxes.append(box_bm((0.21, 0.21, 0.11), (-3.86, 6.20, z + 0.055)))
    ob = bm_obj(join_bms(boxes), 'Silver_Boxes', R, M['alu'])
    bevel(ob, 0.012, 3)
    slots, dots = [], []
    for k in range(5):
        z = 0.06 + k * 0.124
        slots.append(box_bm((0.08, 0.004, 0.004), (-3.90, 6.093, z + 0.03)))
        dots.append(box_bm((0.004, 0.003, 0.004), (-3.775, 6.093, z + 0.03)))
    bm_obj(join_bms(slots), 'Silver_Box_Slots', R, M['plastic_black'])
    bm_obj(join_bms(dots), 'Silver_Box_LEDs', R, M['status_white'])


# three monitors: an ultrawide in the middle, two 16:9 screens angled 28 degrees inward, 4 cm gaps
MON_GAP = 0.04
MON_C = ('Center', 1.20, 0.50, (-3.05, 6.62, 1.15), 0.0, 'screen_center')
MON_SIDE_W, MON_SIDE_H, MON_YAW = 0.78, 0.44, 28.0


def monitor_specs():
    name, w, h, (cx, cy, cz), yaw, key = MON_C
    a = D(MON_YAW)
    lx = cx - w / 2 - MON_GAP - MON_SIDE_W / 2 * math.cos(a)
    rx = cx + w / 2 + MON_GAP + MON_SIDE_W / 2 * math.cos(a)
    sy = cy - MON_SIDE_W / 2 * math.sin(a)
    zc = DESK_Z + 0.13 + MON_SIDE_H / 2
    return [('Left', MON_SIDE_W, MON_SIDE_H, (lx, sy, zc), MON_YAW, 'screen_left'), MON_C,
            ('Right', MON_SIDE_W, MON_SIDE_H, (rx, sy, zc), -MON_YAW, 'screen_right')]


def build_monitors(M):
    C = coll('Monitors')
    # yaw: 0 = screen faces -Y; positive turns it toward +X (toward the chair from the left)
    for name, w, h, (x, y, z), yaw, mkey in monitor_specs():
        par = empty(f'Monitor_{name}', C, (x, y, z), (0, 0, D(-90 + yaw)))
        # local +X is the viewing direction
        hb = box_bm((0.026, w + 0.016, h + 0.016), (-0.015, 0, 0))
        hob = bm_obj(hb, f'Monitor_{name}_Housing', C, M['plastic_black'], parent=par)
        bevel(hob, 0.004, 2)
        bm_obj(box_bm((0.03, w * 0.45, h * 0.45), (-0.04, 0, 0)), f'Monitor_{name}_Back', C, M['plastic_soft'],
               parent=par)
        plane(f'Monitor_{name}_Screen', C, w, h, (0.0005, 0, 0), (D(90), 0, D(90)), M[mkey], parent=par)
        neck_len = z - DESK_Z
        cyl(f'Monitor_{name}_Neck', C, 0.018, neck_len, (-0.10, 0, -neck_len / 2), M['alu_dark'], parent=par,
            seg=20)
        ob = bm_obj(box_bm((0.22, 0.30 if w > 1 else 0.24, 0.010), (-0.09, 0, DESK_Z + 0.005 - z)),
                    f'Monitor_{name}_Foot', C, M['alu_dark'], parent=par)
        bevel(ob, 0.003, 2)
        cyl(f'Monitor_{name}_Arm', C, 0.014, 0.07, (-0.065, 0, 0), M['alu_dark'], rot=(0, D(90), 0), parent=par,
            seg=16)


def build_desk_objects(M):
    C = coll('Desk_Objects')
    z0 = DESK_Z
    # --- keyboard: base + keycaps (one mesh) + backlight sheet; rows run along X, far row at +Y
    kb = empty('Keyboard', C, (-3.10, 6.12, z0), (0, 0, D(-2)))   # centred on the mat, toward the front
    b = box_bm((0.44, 0.145, 0.018), (0, 0, 0.009))
    ob = bm_obj(b, 'Keyboard_Base', C, M['alu_dark'], parent=kb)
    bevel(ob, 0.004, 2)
    keys = []
    rows = [15, 15, 14, 13, 12, 7]
    for r, n in enumerate(rows):
        y = 0.052 - r * 0.0205
        if r == 5:
            widths = [0.034, 0.034, 0.034, 0.17, 0.034, 0.034, 0.034]
            widths = [w * (0.42 - 0.003 * 6) / sum(widths) for w in widths]
        else:
            base = (0.42 - 0.003 * (n - 1)) / (n + (r % 3) * 0.35)
            widths = [base] * n
            widths[0] += base * (r % 3) * 0.35
        x = -0.21
        for wk in widths:
            keys.append(box_bm((wk - 0.003, 0.0175, 0.008), (x + wk / 2, y, 0.022)))
            x += wk + 0.003
    ob = bm_obj(join_bms(keys), 'Keyboard_Keys', C, M['keycap'], parent=kb)
    bevel(ob, 0.0015, 2)
    plane('Keyboard_Backlight', C, 0.42, 0.13, (0, 0, 0.0185), (0, 0, 0), M['keyglow'], parent=kb)
    build_mouse(M, C, (-2.66, 6.12, z0), D(-8))
    # --- mug (larger, pale rim) in the screen light, with a wisp of steam
    mug = lathe('Mug', C, [(0.0, 0.0), (0.046, 0.0), (0.048, 0.004), (0.049, 0.108), (0.045, 0.108),
                           (0.043, 0.008), (0.0, 0.008)], (-3.64, 6.30, z0), M['ceramic_dark'], seg=40)
    torus('Mug_Handle', C, 0.029, 0.0075, (0.049, 0, 0.056), M['ceramic_dark'], rot=(D(90), 0, 0), parent=mug,
          seg=24, sides=8)
    torus('Mug_Rim', C, 0.047, 0.0022, (0, 0, 0.108), M['ceramic_white'], parent=mug, seg=40, sides=6)
    cyl('Mug_Coffee', C, 0.043, 0.002, (0, 0, 0.094), M['coffee'], parent=mug, seg=32)
    mug.rotation_euler = (0, 0, D(-150))
    for k in range(2):
        pts = []
        for i in range(14):
            t = i / 13
            pts.append(Vector((0.012 * math.sin(t * 7 + k * 2) + (k - 0.5) * 0.012, 0.008 * math.cos(t * 5 + k),
                               0.10 + 0.16 * t)))
        sb = tube_bm(pts, 0.006, sides=6, cap=False, radii=[0.004 + 0.012 * (i / 13) for i in range(14)])
        st = bm_obj(sb, f'Mug_Steam_{k}', C, M['steam'], smooth=True, parent=mug)
        st.visible_shadow = False
    # --- open notebook with handwritten pages + pen (reads from the chair side, -Y)
    nb = empty('Notebook_Open', C, (-3.90, 6.10, z0), (0, 0, D(-6)))
    cover = box_bm((0.31, 0.215, 0.004), (0, 0, 0.002))
    bm_obj(cover, 'Notebook_Open_Cover', C, M['plastic_soft'], parent=nb)
    pg = bmesh.new()
    uvl = pg.loops.layers.uv.new('UVMap')
    nx, ny = 40, 6
    vs = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u = i / nx
            x = -0.15 + 0.30 * u
            # pages dive into the gutter (about 15 degrees at the spine), crest ~6 cm out, then flatten and curl
            # down slightly toward the fore-edge
            ax = abs(x)
            zc = 0.0035 + 0.017 * math.sin(math.pi / 2 * min(ax / 0.065, 1.0)) ** 0.85 - 0.006 * (ax / 0.15) ** 2.2
            row.append(pg.verts.new((x, -0.1 + 0.2 * j / ny, zc)))
        vs.append(row)
    for j in range(ny):
        for i in range(nx):
            f = pg.faces.new([vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]])
            for lp, (a, c) in zip(f.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]):
                lp[uvl].uv = (a / nx, c / ny)
    bm_obj(pg, 'Notebook_Open_Pages', C, M['notebook'], smooth=True, parent=nb)
    pen = empty('Pen', C, (0.075, -0.045, 0.0252), (0, D(90), D(25)), parent=nb)
    cyl('Pen_Body', C, 0.0048, 0.14, (0, 0, 0), M['glossy_black'], parent=pen, seg=16)
    cyl('Pen_Tip', C, 0.0048, 0.018, (0, 0, -0.079), M['brass_polished'], r2=0.0008, parent=pen, seg=16)
    box('Pen_Clip', C, (0.002, 0.003, 0.05), (0.005, 0, 0.04), M['brass_polished'], parent=pen)
    # --- closed notebook with a second pen, front-left corner
    cn = empty('Notebook_Closed', C, (-4.62, 6.12, z0), (0, 0, D(14)))
    bm_obj(box_bm((0.15, 0.21, 0.016), (0, 0, 0.008)), 'Notebook_Closed_Body', C, M['pages'], parent=cn)
    plane('Notebook_Closed_Cover', C, 0.152, 0.212, (0, 0, 0.0165), (0, 0, 0), M['cover'], parent=cn)
    bm_obj(box_bm((0.152, 0.212, 0.0015), (0, 0, 0.0005)), 'Notebook_Closed_Back', C, M['plastic_soft'], parent=cn)
    pen2 = empty('Pen_Closed', C, (0.02, 0.0, 0.0215), (0, D(90), D(78)), parent=cn)
    cyl('Pen_Closed_Body', C, 0.0048, 0.14, (0, 0, 0), M['brass_dark'], parent=pen2, seg=16)
    cyl('Pen_Closed_Cap', C, 0.0052, 0.05, (0, 0, 0.05), M['glossy_black'], parent=pen2, seg=16)
    # --- over-ear headphones on a stand (back-left corner of the desk)
    hs = empty('Headphone_Stand', C, (-4.74, 6.40, z0), (0, 0, D(-35)))
    cyl('Headphone_Stand_Base', C, 0.065, 0.014, (0, 0, 0.007), M['alu_dark'], parent=hs, seg=32, bev=0.003)
    cyl('Headphone_Stand_Post', C, 0.008, 0.27, (0, 0, 0.135), M['alu_dark'], parent=hs, seg=16)
    saddle = [Vector((0.05 * math.cos(a), 0, 0.255 + 0.02 * math.sin(a))) for a in
              [math.radians(20 + 140 * i / 12) for i in range(13)]]
    tube('Headphone_Stand_Saddle', C, saddle, 0.008, M['rubber'], parent=hs)
    hp = empty('Headphones', C, (0, 0, 0.213), (0, 0, 0), parent=hs)
    band = [Vector((0.082 * math.cos(a), 0, 0.012 + 0.07 * math.sin(a) - 0.002)) for a in
            [math.radians(-12 + 204 * i / 34) for i in range(35)]]
    tube('Headphones_Band', C, band, 0.010, M['plastic_soft'], sides=10, parent=hp)
    pad = [Vector((0.062 * math.cos(a), 0, 0.012 + 0.055 * math.sin(a) + 0.006)) for a in
           [math.radians(25 + 130 * i / 20) for i in range(21)]]
    tube('Headphones_Band_Pad', C, pad, 0.012, M['rubber'], sides=10, parent=hp)
    for s in (-1, 1):
        sd = 'L' if s < 0 else 'R'
        yk = Vector((s * 0.084, 0, -0.005))
        tube(f'Headphones_Yoke_{sd}', C, [yk + Vector((0, 0, 0.02)), yk + Vector((0, 0, -0.035))], 0.004,
             M['alu_dark'], parent=hp)
        cup = empty(f'Headphones_Cup_{sd}', C, (s * 0.096, 0, -0.085), (0, D(90) * s, 0), parent=hp)
        lathe(f'Headphones_Shell_{sd}', C, [(0.0, 0.012), (0.036, 0.012), (0.046, 0.006), (0.050, -0.006),
                                            (0.048, -0.016), (0.0, -0.016)], (0, 0, 0), M['plastic_black'],
              parent=cup, seg=40)
        torus(f'Headphones_Pad_{sd}', C, 0.040, 0.013, (0, 0, -0.024), M['plastic_soft'], parent=cup, seg=40,
              sides=12)
        torus(f'Headphones_LED_{sd}', C, 0.030, 0.0022, (0, 0, 0.0125), M['led_cyan'], parent=cup, seg=40,
              sides=6)
    # --- studio microphone on a two-segment boom clamped at the rear-left edge; pop filter in front
    clamp = Vector((-4.80, 6.74, z0))
    box('Mic_Clamp', C, (0.05, 0.06, 0.08), (clamp.x, clamp.y, z0 - 0.01), M['plastic_black'], bev=0.004)
    riser_top = clamp + Vector((0, 0, 0.12))
    # clamped at the desk's back-left corner, boom swung left and the mic dropped low beside the left monitor:
    # arm and mic stay clear of the screens from the desk camera
    elbow = Vector((-4.84, 6.46, 1.30))
    mic_at = Vector((-4.45, 6.16, 0.86))
    tip = mic_at + Vector((0.0, 0.03, 0.17))
    tube('Mic_Riser', C, [clamp + Vector((0, 0, 0.03)), riser_top], 0.009, M['plastic_black'])
    for k, (a, bb) in enumerate(((riser_top, elbow), (elbow, tip))):
        side = Vector((0.012, 0.0, 0.0))
        tube(f'Mic_Arm_{k}_A', C, [a + side, bb + side], 0.0055, M['plastic_black'])
        tube(f'Mic_Arm_{k}_B', C, [a - side, bb - side], 0.0055, M['plastic_black'])
        mid = (a + bb) * 0.5
        tube(f'Mic_Spring_{k}', C, [a.lerp(bb, 0.2) + Vector((0, 0.02, 0)), mid + Vector((0, 0.02, 0.0))], 0.003,
             M['chrome'])
    sphere('Mic_Elbow', C, 0.018, tuple(elbow), M['alu_dark'])
    sphere('Mic_Riser_Joint', C, 0.015, tuple(riser_top), M['alu_dark'])
    tube('Mic_Cable', C, [clamp + Vector((0.02, 0.02, 0.03)), elbow + Vector((0.02, 0.0, -0.02)),
                          tip + Vector((0.015, 0.0, 0))], 0.0025, M['rubber'], sides=6)
    mic = empty('Microphone', C, tuple(mic_at), (D(8), 0, 0))
    torus('Mic_ShockMount', C, 0.042, 0.004, (0, 0, 0.02), M['plastic_black'], parent=mic, seg=32, sides=6)
    tube('Mic_Mount_Rod', C, [Vector((0, 0.03, 0.06)), Vector((0, 0.03, 0.17))], 0.005, M['plastic_black'],
         parent=mic)
    lathe('Mic_Body', C, [(0.0, -0.09), (0.024, -0.09), (0.028, -0.08), (0.028, 0.03), (0.030, 0.035),
                          (0.030, 0.05), (0.0, 0.05)], (0, 0, 0), M['plastic_black'], seg=32, parent=mic)
    sphere('Mic_Grille', C, 0.030, (0, 0, 0.07), M['grille'], scale=(1, 1, 1.35), parent=mic)
    pf = empty('Mic_Pop_Filter', C, (0, -0.10, 0.065), (D(90), 0, 0), parent=mic)
    torus('Mic_Pop_Ring', C, 0.058, 0.0035, (0, 0, 0), M['plastic_black'], parent=pf, seg=40, sides=6)
    cyl('Mic_Pop_Mesh', C, 0.056, 0.001, (0, 0, 0), M['mesh'], parent=pf, seg=40)
    tube('Mic_Pop_Gooseneck', C, [Vector((0, -0.10, 0.008)), Vector((0, -0.06, 0.12)), Vector((0, 0.03, 0.15))],
         0.0025, M['plastic_black'], parent=mic)
    # --- compact camera on a ~20 cm tripod, front-left corner, looking toward the chair
    tp = empty('Camera_Tripod', C, (-4.22, 6.05, z0), (0, 0, D(-70)))
    head = Vector((0, 0, 0.17))
    for k in range(3):
        a = TAU * k / 3 + 0.3
        foot = Vector((0.085 * math.cos(a), 0.085 * math.sin(a), 0.0))
        tube(f'Tripod_Leg_{k}', C, [head + Vector((0, 0, -0.02)), foot], 0.0045, M['plastic_black'], parent=tp)
    sphere('Tripod_Ball', C, 0.014, (0, 0, 0.175), M['alu_dark'], parent=tp)
    cam = empty('Camera_Body', C, (0, 0, 0.23), (0, 0, 0), parent=tp)
    box('Camera_Body_Shell', C, (0.075, 0.13, 0.085), (0, 0, 0), M['plastic_soft'], parent=cam, bev=0.008)
    # deep sculpted grip, mount ring, a lens about 1.5x longer with knurled focus and zoom rings
    box('Camera_Grip', C, (0.052, 0.038, 0.088), (0.022, -0.062, -0.002), M['rubber'], parent=cam, bev=0.014,
        seg=3)
    cyl('Camera_Mount_Ring', C, 0.036, 0.006, (0.040, 0.0, -0.004), M['alu'], rot=(0, D(90), 0), parent=cam, seg=40)
    lathe('Camera_Lens', C, [(0.0, 0.0), (0.034, 0.0), (0.034, 0.03), (0.032, 0.034), (0.032, 0.090),
                             (0.035, 0.096), (0.035, 0.128), (0.031, 0.130), (0.0, 0.124)], (0.043, 0.0, -0.004),
          M['plastic_black'], rot=(0, D(90), 0), parent=cam, seg=40)
    for k, (xx, rr, ww) in enumerate(((0.058, 0.0355, 0.020), (0.100, 0.0335, 0.030))):
        ring = cyl(f'Camera_Lens_Ring_{k}', C, rr, ww, (xx, 0.0, -0.004), M['rubber'], rot=(0, D(90), 0),
                   parent=cam, seg=48)
        for i in range(3):
            torus(f'Camera_Lens_Knurl_{k}_{i}', C, rr + 0.0004, 0.0012, (0, 0, -ww / 2 + ww * (i + 1) / 4),
                  M['plastic_soft'], parent=ring, seg=40, sides=4)
    torus('Camera_Lens_Mark', C, 0.0352, 0.0009, (0.084, 0.0, -0.004), M['ceramic_white'], rot=(0, D(90), 0),
          parent=cam, seg=40, sides=4)
    cyl('Camera_Lens_Glass', C, 0.028, 0.002, (0.171, 0, -0.004), M['lens'], rot=(0, D(90), 0), parent=cam, seg=32)
    box('Camera_Viewfinder', C, (0.04, 0.05, 0.03), (-0.01, 0, 0.055), M['plastic_soft'], parent=cam, bev=0.006)
    box('Camera_Hot_Shoe', C, (0.022, 0.022, 0.004), (-0.008, 0.0, 0.0725), M['alu_dark'], parent=cam)
    for k, (yy, r_) in enumerate(((0.040, 0.013), (-0.038, 0.011))):
        cyl(f'Camera_Top_Dial_{k}', C, r_, 0.009, (-0.005, yy, 0.047), M['alu_dark'], parent=cam, seg=24, bev=0.001)
        for i in range(12):
            a = TAU * i / 12
            box(f'Camera_Dial_Tick_{k}_{i}', C, (0.0015, 0.0015, 0.007), (-0.005 + r_ * math.cos(a), yy + r_ *
                                                                          math.sin(a), 0.047), M['plastic_soft'],
                parent=cam)
    cyl('Camera_Shutter', C, 0.006, 0.004, (0.018, -0.062, 0.044), M['alu'], parent=cam, seg=16)
    box('Camera_Rec_Dot', C, (0.004, 0.006, 0.006), (-0.038, 0.05, 0.03), M['status_amber'], parent=cam)

    build_twisty_cube(M, C, (-2.38, 6.10, z0))
    build_cradle(M, C, (-2.10, 6.19, z0), D(14))
    build_glass_cube(M, C, (-1.72, 6.13, z0))
    build_desk_lamp(M, C, (-1.11, 6.77, z0))   # back corner: its pole stays out of the instrument close-up
    build_armillary(M, ARMILLARY_AT)


def build_mouse(M, C, loc, yaw):
    """Low ergonomic mouse, 6 x 11 cm: wider at the back, tapered toward the buttons, peak behind the middle,
    flat base; split line between the two buttons and a scroll wheel. Front = local +Y."""
    root = empty('Mouse', C, loc, (0, 0, yaw))
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=1.0, calc_uvs=True)

    def shape(x, y, z):
        half_w = 0.030 * (1.0 - 0.17 * y) * (1.0 - 0.10 * y * y)
        hmax = 0.035 * (0.62 + 0.38 * math.cos(math.pi * (y + 0.25) / 1.3))
        zz = z * hmax if z > 0 else z * 0.004
        # the sides flare out slightly toward the base
        flare = 1.0 + 0.06 * max(0.0, 1.0 - z) if z > 0 else 1.06
        return Vector((x * half_w * flare, y * 0.055, zz + 0.004))
    for v in bm.verts:
        v.co = shape(v.co.x, v.co.y, v.co.z)
    ob = bm_obj(bm, 'Mouse_Shell', C, M['plastic_black'], smooth=True, parent=root)
    subsurf(ob, 1)

    def top_z(y):
        return shape(0.0, y, 1.0).z
    pts = [Vector((0.0, 0.055 * t, top_z(t) + 0.0004)) for t in [0.12 + 0.86 * k / 10 for k in range(11)]]
    tube('Mouse_Button_Split', C, pts, 0.0007, M['rubber'], sides=5, parent=root)
    for s in (-1, 1):
        pts = [Vector((s * 0.019 * (1.0 - 0.17 * t), 0.055 * t, top_z(t) * 0.86 + 0.0004))
               for t in [0.12 + 0.8 * k / 8 for k in range(9)]]
        tube(f'Mouse_Button_Edge_{s}', C, pts, 0.0005, M['rubber'], sides=4, parent=root)
    cyl('Mouse_Wheel', C, 0.0055, 0.0045, (0.0, 0.055 * 0.55, top_z(0.55) - 0.001), M['rubber'],
        rot=(0, D(90), 0), parent=root, seg=20)


# The instrument's base on the desk (also export_room.py's Anchor_Instrument): right of the keyboard, 18 cm in from
# the front edge, in the desk lamp's pool (the lamp re-aims at it). Chosen by projecting the armillary's mesh through
# the 'desk' and 'wide' cameras over a 2 cm grid: here it clears every monitor by >= 30 px in the wide shot and
# ~95 px in the desk shot (1600x900), and nothing on the desk is within its 0.147 m footprint. It was at
# (-1.38, 6.40), tucked behind the glass cube in the lamp's corner.
ARMILLARY_AT = (-1.30, 6.22, DESK_Z)


def build_twisty_cube(M, C, loc):
    """Twisty puzzle in the room palette (violet, cyan, amber, ink white), not the classic six colours."""
    rng = random.Random(11)
    root = empty('Twisty_Cube', C, loc, (0, 0, D(21)))
    s = 0.019
    cubies = []
    stickers = {k: [] for k in ('violet', 'cyan', 'amber', 'ink')}
    cols = list(stickers.keys())
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for k in (-1, 0, 1):
                twist = D(18) if k == 1 else 0.0
                rot = Matrix.Rotation(twist, 3, 'Z')
                c = Vector((i * s, j * s, k * s + 1.5 * s))
                b = box_bm((s * 0.96, s * 0.96, s * 0.96))
                bmesh.ops.rotate(b, cent=(0, 0, 0), matrix=rot, verts=b.verts)
                bmesh.ops.translate(b, vec=rot @ (c - Vector((0, 0, 1.5 * s))) + Vector((0, 0, 1.5 * s)),
                                    verts=b.verts)
                cubies.append(b)
                for axis, sign in ((0, i), (1, j), (2, k)):
                    if sign == 0:
                        continue
                    if axis == 2 and sign < 0:
                        continue
                    sz = [s * 0.80, s * 0.80, s * 0.80]
                    sz[axis] = 0.0012
                    off = Vector((0, 0, 0))
                    off[axis] = sign * s * 0.485
                    st = box_bm(tuple(sz))
                    bmesh.ops.translate(st, vec=c + off - Vector((0, 0, 1.5 * s)), verts=st.verts)
                    bmesh.ops.rotate(st, cent=(0, 0, 0), matrix=rot, verts=st.verts)
                    bmesh.ops.translate(st, vec=Vector((0, 0, 1.5 * s)), verts=st.verts)
                    stickers[rng.choice(cols)].append(st)
    ob = bm_obj(join_bms(cubies), 'Twisty_Cube_Body', C, M['plastic_black'], parent=root)
    bevel(ob, 0.0018, 2)
    import bpy
    colors = {'violet': (0.20, 0.075, 1.0), 'cyan': (0.02, 0.75, 0.64), 'amber': (1.0, 0.46, 0.14),
              'ink': (0.84, 0.81, 0.75)}
    from room_lib import principled
    for k, lst in stickers.items():
        if not lst:
            continue
        m = bpy.data.materials.get('Sticker_' + k) or principled('Sticker_' + k, colors[k], rough=0.25, coat=0.6)
        sob = bm_obj(join_bms(lst), 'Twisty_Cube_Stickers_' + k.title(), C, m, parent=root)
        bevel(sob, 0.0006, 1)


def build_cradle(M, C, loc, yaw):
    root = empty('Newtons_Cradle', C, loc, (0, 0, yaw))
    ob = box('Cradle_Base', C, (0.20, 0.11, 0.016), (0, 0, 0.008), M['glossy_black'], parent=root, bev=0.003)
    top = 0.17
    for s in (-1, 1):
        pts = [(-0.085, s * 0.045, 0.016), (-0.085, s * 0.045, top), (0.085, s * 0.045, top), (0.085, s * 0.045, 0.016)]
        # rounded corners
        tube(f'Cradle_Frame_{s}', C, [Vector(p) for p in pts], 0.003, M['chrome'], parent=root, sides=10)
    for i in range(5):
        x = -0.038 + i * 0.019
        ang = D(32) if i == 0 else 0.0
        bz = 0.058
        L = top - bz
        bx = x - math.sin(ang) * L
        bzz = top - math.cos(ang) * L
        sphere(f'Cradle_Ball_{i + 1}', C, 0.0094, (bx, 0, bzz), M['chrome'], parent=root, seg=24, rings=12)
        for s in (-1, 1):
            tube(f'Cradle_String_{i}_{s}', C, [Vector((x, s * 0.045, top)), Vector((bx, 0, bzz + 0.009))], 0.0004,
                 M['plastic_black'], sides=4, parent=root, cap=False)


def build_glass_cube(M, C, loc):
    root = empty('Glass_Cube', C, loc, (0, 0, D(30)))
    box('Glass_Cube_Base', C, (0.09, 0.09, 0.012), (0, 0, 0.006), M['glossy_black'], parent=root, bev=0.002)
    ob = box('Glass_Cube_Glass', C, (0.075, 0.075, 0.075), (0, 0, 0.012 + 0.0375), M['glass'], parent=root,
             bev=0.004, seg=3)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.024)
    core = bm_obj(bm, 'Glass_Cube_Lattice', C, M['cube_core'], loc=(0, 0, 0.0495), parent=root)
    w = core.modifiers.new('Wire', 'WIREFRAME')
    w.thickness = 0.0016
    sphere('Glass_Cube_Core_Dot', C, 0.006, (0, 0, 0.0495), M['cube_core'], parent=root, seg=12, rings=6)


def build_desk_lamp(M, C, loc):
    """Brass task lamp on a weighted marble base at the desk's right end, its shade aimed at the armillary."""
    ax, ay = ARMILLARY_AT[0] - loc[0], ARMILLARY_AT[1] - loc[1]
    dist = math.hypot(ax, ay)
    root = empty('Desk_Lamp', C, loc, (0, 0, math.atan2(ay, ax)))
    cyl('Desk_Lamp_Base', C, 0.060, 0.028, (0, 0, 0.014), M['marble'], parent=root, seg=48, bev=0.004)
    torus('Desk_Lamp_Base_Ring', C, 0.059, 0.0035, (0, 0, 0.026), M['brass'], parent=root, seg=48, sides=6)
    cyl('Desk_Lamp_Base_Cap', C, 0.026, 0.016, (0, 0, 0.036), M['brass_dark'], parent=root, seg=32, bev=0.003)
    p0 = Vector((0, 0, 0.04))
    p1 = Vector((-0.03, 0, 0.56))
    p2 = Vector((dist * 0.72, 0, 0.66))
    tube('Desk_Lamp_Arm_1', C, [p0, p1], 0.006, M['brass_dark'], parent=root)
    tube('Desk_Lamp_Arm_2', C, [p1, p2], 0.006, M['brass_dark'], parent=root)
    sphere('Desk_Lamp_Joint', C, 0.011, tuple(p1), M['brass_dark'], parent=root)
    shade = lathe('Desk_Lamp_Shade', C, [(0.012, 0.0), (0.016, -0.01), (0.05, -0.06), (0.056, -0.075),
                                         (0.052, -0.075), (0.046, -0.062), (0.012, -0.012)],
                  tuple(p2), M['brass_dark'], seg=40, parent=root)
    shade.rotation_euler = (0, D(-16), 0)
    sphere('Desk_Lamp_Bulb', C, 0.022, (0, 0, -0.07), M['bulb'], parent=shade, seg=24, rings=12)
    pts = [Vector((-0.008 + 0.0027 * i, 0, -0.072 + (0.004 if i % 2 else -0.004))) for i in range(7)]
    tube('Desk_Lamp_Filament', C, pts, 0.0007, M['filament'], sides=4, parent=shade)


# =============================================================================================
# The armillary sphere (hero)
# =============================================================================================

def _boss(name, C, parent, d, r_at, size, mat):
    """Small domed rivet head at direction d (unit vector, parent space), radius r_at from the centre."""
    d = Vector(d).normalized()
    q = Vector((0, 0, 1)).rotation_difference(d)
    return sphere(name, C, size, tuple(d * r_at), mat, parent=parent, seg=16, rings=8, scale=(1.0, 1.0, 0.55),
                  rot=q.to_euler())


def build_armillary(M, loc):
    """Classic armillary: a vertical meridian ring standing in a fork on a turned column, a flat horizon ring on
    four turned posts (the meridian passes through notches in it, clamped), the polar axis at 45 degrees with
    finials, and the celestial sphere on the axis: two colures, the equator band, the ecliptic band at 23.44
    degrees (both flat, engraved), the two tropics and two polar circles, riveted wherever rings cross. Inside:
    a small dark-glass globe and seven engraved blued-steel spheres on seven straight arms in the ecliptic
    plane (the site's seven stones). Rings engraved brass, stand and posts darker bronze."""
    C = coll('Armillary_Sphere')
    root = empty('Armillary_Sphere', C, loc, (0, 0, D(28)))
    E, EF = M['brass_engraved'], M['brass_engraved_fine']
    B, BD = M['brass_polished'], M['brass_dark']
    H = 0.29                         # centre height above the desk
    RM, MW, MT = 0.118, 0.012, 0.0045          # meridian: centre radius, radial width, thickness
    HW, HT = 0.022, 0.0045                      # horizon: radial width, thickness
    RH = RM + MW / 2 + HW / 2 + 0.0006          # horizon inner edge just clears the meridian's outer edge
    RI = 0.094                                  # celestial sphere (colures' centre radius)
    eps = D(23.44)
    lat = D(45)
    # --- base: black stone plinth, turned bronze foot and column
    lathe('Armillary_Plinth', C, [(0.0, 0.0), (0.086, 0.0), (0.089, 0.004), (0.089, 0.017), (0.084, 0.023),
                                  (0.0, 0.023)], (0, 0, 0), M['marble'], seg=72, parent=root)
    lathe('Armillary_Foot', C, [(0.0, 0.023), (0.070, 0.023), (0.072, 0.027), (0.066, 0.031), (0.046, 0.035),
                                (0.036, 0.044), (0.022, 0.054), (0.015, 0.074), (0.013, 0.090), (0.019, 0.097),
                                (0.019, 0.104), (0.012, 0.110), (0.0100, 0.140), (0.0140, 0.146), (0.0145, 0.152),
                                (0.0, 0.152)], (0, 0, 0), BD, seg=56, parent=root)
    zb = H - RM - MW / 2                         # bottom of the meridian ring
    tube('Armillary_Column', C, [Vector((0, 0, 0.150)), Vector((0, 0, zb - 0.010))], 0.0065, BD, sides=16,
         parent=root)
    # fork (yoke) gripping the meridian ring's foot: a saddle block and two cheeks either side of the ring
    box('Armillary_Fork_Saddle', C, (0.030, 0.016, 0.008), (0, 0, zb - 0.006), BD, parent=root, bev=0.0015)
    for s in (-1, 1):
        box(f'Armillary_Fork_Cheek_{s}', C, (0.024, 0.0035, 0.026), (0, s * (MT / 2 + 0.0019), zb + 0.008), BD,
            parent=root, bev=0.0012)
    cyl('Armillary_Fork_Pin', C, 0.0028, MT + 0.012, (0, 0, zb + 0.010), B, rot=(D(90), 0, 0), parent=root,
        seg=16)
    # --- four turned posts carrying the horizon ring, on the diagonals (clear of the meridian plane)
    for k in range(4):
        a = D(45 + 90 * k)
        pts, radii = [], []
        for i in range(18):
            t = i / 17
            # a gentle outward bow keeps each post outside the sphere's silhouette (no cage in front of it)
            r = 0.056 + (RH - 0.056) * t + 0.034 * math.sin(math.pi * t) ** 1.2
            z = 0.031 + (H - HT / 2 - 0.006 - 0.031) * t
            pts.append(Vector((r * math.cos(a), r * math.sin(a), z)))
            radii.append(0.0030 + 0.0016 * math.exp(-((t - 0.18) / 0.09) ** 2) + 0.0010 * math.exp(
                -((t - 0.62) / 0.05) ** 2) + 0.0008 * t)
        tube(f'Armillary_Post_{k + 1}', C, pts, 0.003, BD, sides=12, radii=radii, parent=root)
        sphere(f'Armillary_Post_Foot_{k + 1}', C, 0.0055, tuple(pts[0]), BD, parent=root, seg=16, rings=8)
        top = pts[-1]
        cyl(f'Armillary_Post_Cap_{k + 1}', C, 0.0052, 0.006, (top.x, top.y, top.z + 0.002), B, parent=root, seg=16)
    # --- horizon ring: flat, graduated
    ring_band('Armillary_Ring_Horizon', C, RH, HW, HT, (0, 0, H), EF, parent=root, seg=240, chamfer=0.2)
    # --- meridian ring: vertical in the root XZ plane, flat face toward +-Y, graduated
    mer = empty('Armillary_Meridian_Frame', C, (0, 0, H), (D(90), 0, 0), parent=root)
    ring_band('Armillary_Ring_Meridian', C, RM, MW, MT, (0, 0, 0), EF, parent=mer, seg=240, chamfer=0.2)
    # clamps where the meridian passes through the horizon's notches
    for s in (-1, 1):
        box(f'Armillary_Notch_Clamp_{s}', C, (0.012, MT + 0.007, HT + 0.006), (s * (RM + MW / 2 + 0.0006), 0, H),
            BD, parent=root, bev=0.0012)
    # --- polar axis at 45 degrees in the meridian plane (axis_frame local Z)
    axis_frame = empty('Armillary_Axis_Frame', C, (0, 0, H), (0, D(90) - lat, 0), parent=root)
    tube('Armillary_Polar_Axis', C, [Vector((0, 0, -RM - 0.016)), Vector((0, 0, RM + 0.016))], 0.0022, B,
         parent=axis_frame)
    for s in (-1, 1):
        nm = 'N' if s > 0 else 'S'
        lathe(f'Armillary_Finial_{nm}', C,
              [(0.0, 0.0), (0.0042, 0.0), (0.0058, 0.004), (0.0032, 0.009), (0.0048, 0.013), (0.0, 0.020)],
              (0, 0, s * (RM + MW / 2 + 0.001)), B, seg=24, rot=(0 if s > 0 else math.pi, 0, 0), parent=axis_frame)
        # bearing boss where the axis passes through the meridian ring, and a hub where the colures meet
        cyl(f'Armillary_Axis_Bearing_{nm}', C, 0.0055, MW + 0.004, (0, 0, s * RM), BD, parent=axis_frame, seg=20)
        cyl(f'Armillary_Pole_Hub_{nm}', C, 0.0050, 0.008, (0, 0, s * RI), B, parent=axis_frame, seg=20)
    # --- celestial sphere on the axis
    ring_band('Armillary_Ring_Colure_Equinox', C, RI, 0.0035, 0.0042, (0, 0, 0), B, rot=(D(90), 0, 0),
              parent=axis_frame, seg=180)
    ring_band('Armillary_Ring_Colure_Solstice', C, RI, 0.0035, 0.0042, (0, 0, 0), B, rot=(0, D(90), 0),
              parent=axis_frame, seg=180)
    RE = RI + 0.0032
    ring_band('Armillary_Ring_Equator', C, RE, 0.0025, 0.0130, (0, 0, 0), E, parent=axis_frame, seg=240,
              chamfer=0.3)
    RC = RE + 0.0027
    ring_band('Armillary_Ring_Ecliptic', C, RC, 0.0025, 0.0180, (0, 0, 0), EF, rot=(eps, 0, 0), parent=axis_frame,
              seg=360, chamfer=0.3)
    for s, nm in ((1, 'Cancer'), (-1, 'Capricorn')):
        ring_band(f'Armillary_Ring_Tropic_{nm}', C, RI * math.cos(eps), 0.003, 0.0032,
                  (0, 0, s * RI * math.sin(eps)), B, parent=axis_frame, seg=160)
    for s, nm in ((1, 'Arctic'), (-1, 'Antarctic')):
        ring_band(f'Armillary_Ring_Polar_{nm}', C, RI * math.sin(eps), 0.003, 0.0032,
                  (0, 0, s * RI * math.cos(eps)), B, parent=axis_frame, seg=96)
    # rivets wherever rings cross
    ce, se = math.cos(eps), math.sin(eps)
    k = 0
    for d in ((1, 0, 0), (-1, 0, 0)):                       # equinoxes: ecliptic x equator x equinox colure
        _boss(f'Armillary_Rivet_{k}', C, axis_frame, d, RC + 0.0016, 0.0034, B)
        k += 1
    for d in ((0, 1, 0), (0, -1, 0)):                       # equator x solstice colure
        _boss(f'Armillary_Rivet_{k}', C, axis_frame, d, RE + 0.0016, 0.0030, B)
        k += 1
    for d in ((0, ce, se), (0, -ce, -se)):                   # solstices: ecliptic x tropic x solstice colure
        _boss(f'Armillary_Rivet_{k}', C, axis_frame, d, RC + 0.0016, 0.0032, B)
        k += 1
    for d in ((0, ce, -se), (0, -ce, se), (ce, 0, se), (ce, 0, -se), (-ce, 0, se), (-ce, 0, -se)):
        _boss(f'Armillary_Rivet_{k}', C, axis_frame, d, RI + 0.0018, 0.0026, B)   # tropics x colures
        k += 1
    for d in ((se, 0, ce), (-se, 0, ce), (se, 0, -ce), (-se, 0, -ce), (0, se, ce), (0, -se, ce), (0, se, -ce),
              (0, -se, -ce)):
        _boss(f'Armillary_Rivet_{k}', C, axis_frame, d, RI + 0.0018, 0.0024, B)   # polar circles x colures
        k += 1
    # --- the small dark-glass globe at the centre, with a fine brass equator line
    sphere('Armillary_Core', C, 0.022, (0, 0, 0), M['dark_glass'], parent=axis_frame, seg=48, rings=24)
    torus('Armillary_Core_Band', C, 0.0222, 0.0007, (0, 0, 0), B, parent=axis_frame, seg=64, sides=6)
    # --- seven engraved spheres on seven straight arms in the ecliptic plane, evenly spaced, radii stepping out
    hub = empty('Armillary_Arms', C, (0, 0, 0), (eps, 0, 0), parent=axis_frame)
    torus('Armillary_Hub_Collar', C, 0.0235, 0.0022, (0, 0, 0), BD, parent=hub, seg=48, sides=8)
    for i in range(7):
        a = TAU * i / 7 + 0.20
        r = 0.044 + 0.0055 * i
        dvec = Vector((math.cos(a), math.sin(a), 0.0))
        tube(f'Armillary_Arm_{i + 1}', C, [dvec * 0.024, dvec * (r - 0.006)], 0.0010, B, sides=8, parent=hub)
        sr = 0.0058 + 0.0007 * (i % 3)
        sp = sphere(f'Armillary_Sphere_{i + 1}', C, sr, tuple(dvec * r), M['blued_steel'], parent=hub, seg=32,
                    rings=16)
        torus(f'Armillary_Sphere_Band_{i + 1}', C, sr * 1.01, 0.0005, (0, 0, 0), B, parent=sp, seg=32, sides=4,
              rot=(D(90), 0, a))
        torus(f'Armillary_Sphere_Band2_{i + 1}', C, sr * 1.01, 0.0004, (0, 0, 0), B, parent=sp, seg=32, sides=4,
              rot=(0, 0, 0))
    return root


# =============================================================================================
# Chair
# =============================================================================================

def build_chair(M, loc=(-2.20, 5.22), yaw=D(200)):
    """High-backed mesh office chair. loc/yaw come from build_room.CHAIR."""
    C = coll('Chair')
    root = empty('Chair', C, (loc[0], loc[1], 0), (0, 0, yaw))
    # five-star base with casters
    for k in range(5):
        a = TAU * k / 5
        end = Vector((0.31 * math.cos(a), 0.31 * math.sin(a), 0.075))
        tube(f'Chair_Spoke_{k}', C, [Vector((0, 0, 0.10)), end], 0.016, M['chrome'], sides=10,
             radii=[0.022, 0.012], parent=root)
        cyl(f'Chair_Caster_{k}', C, 0.028, 0.022, tuple(end + Vector((0, 0, -0.045))), M['plastic_black'],
            rot=(D(90), 0, a), parent=root, seg=20, bev=0.004)
        tube(f'Chair_Caster_Fork_{k}', C, [end, end + Vector((0, 0, -0.035))], 0.006, M['plastic_black'], parent=root)
    cyl('Chair_Hub', C, 0.045, 0.06, (0, 0, 0.10), M['chrome'], parent=root, seg=24, bev=0.008)
    cyl('Chair_Gas_Cover', C, 0.032, 0.16, (0, 0, 0.21), M['plastic_black'], parent=root, seg=24)
    cyl('Chair_Gas_Lift', C, 0.016, 0.14, (0, 0, 0.35), M['chrome'], parent=root, seg=16)
    box('Chair_Mechanism', C, (0.22, 0.26, 0.05), (0, 0.0, 0.43), M['plastic_black'], parent=root, bev=0.01)
    # seat
    seat = box('Chair_Seat', C, (0.50, 0.48, 0.07), (0, -0.02, 0.485), M['plastic_soft'], parent=root, bev=0.03,
               seg=4)
    plane('Chair_Seat_Mesh', C, 0.44, 0.42, (0, -0.02, 0.5205), (0, 0, 0), M['mesh'], parent=root)
    # spine bar from seat to back
    spine = [Vector((0, 0.18, 0.45)), Vector((0, 0.30, 0.50)), Vector((0, 0.33, 0.62)), Vector((0, 0.32, 0.72))]
    tube('Chair_Spine', C, spine, 0.022, M['chrome'], sides=12, parent=root)
    # backrest: curved frame loop + mesh panel
    def back_pt(u, v, w=0.25, h0=0.62, h1=1.28, bend=0.55):
        x = u * w
        z = h0 + (h1 - h0) * v
        y = 0.33 + (1 - math.cos(x / bend)) * bend * 0.9 + 0.06 * math.sin(math.pi * v) * -1 + 0.05 * v
        return Vector((x, y, z))
    loop = []
    n = 40
    for i in range(n + 1):
        t = i / n
        # rounded rectangle perimeter param
        if t < 0.25:
            u, v = -1 + 8 * t, 0.0
        elif t < 0.5:
            u, v = 1.0, (t - 0.25) * 4
        elif t < 0.75:
            u, v = 1 - (t - 0.5) * 8, 1.0
        else:
            u, v = -1.0, 1 - (t - 0.75) * 4
        u = max(-1, min(1, u))
        loop.append(back_pt(u * 0.96, v))
    # graphite-and-chrome frame tube around the mesh, thick enough to read from across the room
    tube('Chair_Back_Frame', C, loop, 0.017, M['chrome'], sides=12, parent=root)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    nu, nv = 16, 20
    vs = [[bm.verts.new(back_pt(-0.94 + 1.88 * i / nu, 0.02 + 0.96 * j / nv)) for i in range(nu + 1)] for j in
          range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new([vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]])
            for lp, (a, b) in zip(f.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]):
                lp[uvl].uv = (a / nu, b / nv)
    bm_obj(bm, 'Chair_Back_Mesh', C, M['mesh'], smooth=True, parent=root)
    tube('Chair_Lumbar', C, [back_pt(-0.9, 0.22) + Vector((0, 0.015, 0)), back_pt(0, 0.22) + Vector((0, 0.03, 0)),
                             back_pt(0.9, 0.22) + Vector((0, 0.015, 0))], 0.014, M['plastic_black'], parent=root)
    # headrest
    hr = [back_pt(u, 1.0) + Vector((0, 0.02, 0.0)) for u in (0,)]
    tube('Chair_Headrest_Post', C, [back_pt(0, 0.95), back_pt(0, 1.0) + Vector((0, 0.01, 0.12))], 0.01, M['chrome'],
         parent=root)
    head = box('Chair_Headrest', C, (0.30, 0.05, 0.13), tuple(back_pt(0, 1.0) + Vector((0, 0.02, 0.16))),
               M['plastic_soft'], rot=(D(-12), 0, 0), parent=root, bev=0.02, seg=3)
    # armrests
    for s in (-1, 1):
        tube(f'Chair_Arm_Post_{s}', C, [Vector((s * 0.23, 0.05, 0.47)), Vector((s * 0.26, 0.06, 0.66))], 0.012,
             M['chrome'], parent=root)
        box(f'Chair_Arm_Pad_{s}', C, (0.075, 0.26, 0.03), (s * 0.26, 0.02, 0.67), M['plastic_soft'], parent=root,
            bev=0.012, seg=3)
    return root
