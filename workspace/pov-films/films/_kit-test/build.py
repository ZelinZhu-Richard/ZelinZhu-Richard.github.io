"""_kit-test: a small rain-wet street that exercises the whole kit.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
    -P films/_kit-test/build.py -- --stills 1.0,7.0 --scale 0.5
"""
import os
import sys
import math
import random

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'kit'))
import povkit as pk  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402

WARM = (1.0, 0.52, 0.18)
COOL = (0.3, 0.7, 1.0)
PINK = (1.0, 0.3, 0.75)
VIOLET = (0.55, 0.35, 1.0)
COBALT = (0.15, 0.35, 1.0)
MAGENTA = (1.0, 0.15, 0.6)
ORANGE = (1.0, 0.45, 0.1)
LAMP_COLORS = [COBALT, MAGENTA, ORANGE, COBALT, MAGENTA]


def lamp_post(path, s, side, color, metal, coll, idx, light=True):
    """Street lamp on the sidewalk, arm reaching over the road."""
    lat = side * 4.75
    base = path.offset(s, lat, 0.14)
    r = path.right(s)
    inward = -side
    h = 4.6
    pole = [tuple(base + Vector((0, 0, z))) for z in (0.0, h * 0.5, h - 0.35)]
    arm = []
    for i in range(13):
        a = math.pi / 2 * i / 12
        p = base + Vector((0, 0, h - 0.35)) + r * (inward * (0.35 - 0.35 * math.cos(a)) ) + Vector((0, 0, 0.35 * math.sin(a)))
        arm.append(tuple(p))
    tip = base + r * inward * 1.25 + Vector((0, 0, h))
    arm.append(tuple(base + r * inward * 0.6 + Vector((0, 0, h))))
    arm.append(tuple(tip))
    pk.geo.tube_along(pole + arm[1:], radius=0.055, segments=10, material=metal,
                      name='LampPole%d' % idx, collection=coll)
    pk.geo.lathe([(0.0, 0.0), (0.12, 0.0), (0.13, 0.02), (0.16, 0.05)], segments=16, material=metal,
                 name='LampFoot%d' % idx, location=tuple(base), collection=coll)
    head = pk.geo.rounded_box((0.46, 0.26, 0.12), radius=0.04, material=metal, name='LampHead%d' % idx,
                              location=tuple(tip + Vector((0, 0, -0.06))), collection=coll)
    head.rotation_euler.z = -math.radians(path.heading(s))
    bulb_mat = pk.mat.emission(color, 250.0)
    bulb = pk.geo.lathe([(0.0, -0.07), (0.14, -0.035), (0.17, 0.0)], segments=20, material=bulb_mat,
                        name='LampGlow%d' % idx, location=tuple(tip + Vector((0, 0, -0.06))),
                        collection=coll, cap_top=True)
    bulb.visible_shadow = False
    if light:
        lp = tip + Vector((0, 0, -0.2))
        pk.lights.spot(tuple(lp), tuple(lp + Vector((0, 0, -5.0)) + r * inward * 0.8), color, 3000.0,
                       angle_deg=125, blend=0.7, radius=0.12, shadow=True, name='LampLight%d' % idx,
                       collection=coll, volume=0.35)


def building(path, s, side, lat, size, color, coll, idx, win_color=WARM, rng=None, roof=None,
             wash=None):
    """Rounded plaster block facing the road with a grid of lit windows."""
    w, d, h = size
    yaw = -math.radians(path.heading(s))
    pos = path.offset(s, side * (lat + d / 2), 0.0)
    m = pk.mat.clay(color, roughness=0.8, bumps=0.3)
    b = pk.geo.rounded_box((d, w, h), radius=0.22, segments=4, material=m, name='Bldg%d' % idx,
                           location=tuple(pos), collection=coll)
    b.rotation_euler.z = yaw
    rows = max(1, int((h - 1.4) / 2.6))
    cols = max(1, int((w - 1.0) / 1.9))
    wm = pk.mat.lit_window(win_color, strength=25.0)
    face = path.offset(s, side * (lat - 0.03), 0.0)
    panel = pk.geo.window_panel(cols=cols, rows=rows, win_w=1.0, win_h=1.35, gap_x=0.85, gap_y=1.25,
                                material=wm, name='Win%d' % idx, seed=idx, collection=coll,
                                location=tuple(face + Vector((0, 0, 1.2))), lit_fraction=0.8)
    panel.rotation_euler.z = yaw + (-math.pi / 2 if side > 0 else math.pi / 2)
    if wash is not None:
        # coloured light pool washing the facade from the sidewalk (gradient up the face)
        fp = path.offset(s, side * (lat - 1.2), 0.25)
        tp = path.offset(s, side * (lat + 0.3), h * 0.75)
        pk.lights.spot(tuple(fp), tuple(tp), wash, 1400.0, angle_deg=95, blend=0.9, radius=0.3,
                       shadow=False, name='Wash%d' % idx, collection=coll, volume=0.0)
    if roof is not None:
        rm = pk.mat.toy_plastic(roof, roughness=0.35)
        rf = pk.geo.rounded_box((d + 0.5, w + 0.5, 0.5), radius=0.2, material=rm, name='Roof%d' % idx,
                                location=tuple(pos + Vector((0, 0, h - 0.05))), collection=coll)
        rf.rotation_euler.z = yaw
    return b


def hero(path, s, side, coll):
    """Warm amber round tower with arched windows, uplit."""
    lat = 10.5
    c = path.offset(s, side * lat, 0.0)
    amber = pk.mat.clay((0.95, 0.48, 0.14), roughness=0.7, bumps=0.25, name='HeroPlaster')
    pk.geo.lathe([(3.4, 0.0), (3.5, 0.6), (3.35, 4.0), (3.15, 8.0), (3.25, 8.4), (3.4, 8.6)],
                 segments=64, material=amber, name='HeroTower', location=tuple(c), collection=coll,
                 cap_top=False)
    roof = pk.mat.toy_plastic((0.55, 0.12, 0.35), roughness=0.3)
    pk.geo.lathe([(3.7, 8.6), (3.6, 9.2), (2.6, 10.6), (1.0, 11.8), (0.25, 12.4), (0.0, 12.5)],
                 segments=64, material=roof, name='HeroRoof', location=tuple(c), collection=coll)
    wm = pk.mat.lit_window((1.0, 0.55, 0.18), strength=14.0, name='HeroWindows', variation=0.2,
                           curtains=0.15, mullions=(2, 3))
    to_road = -path.right(s) * side
    base_ang = math.atan2(to_road.y, to_road.x)
    for k, da in enumerate((-0.55, 0.0, 0.55)):
        a = base_ang + da
        n = Vector((math.cos(a), math.sin(a), 0))
        for row, z in enumerate((1.2, 4.6)):
            p = c + n * 3.42 + Vector((0, 0, z))
            wp = pk.geo.window_panel(cols=1, rows=1, win_w=1.3, win_h=2.0, material=wm,
                                     name='HeroWin%d_%d' % (k, row), seed=k * 7 + row,
                                     collection=coll, round_top=True, location=tuple(p))
            wp.rotation_euler.z = a + math.pi / 2
    # door
    dn = Vector((math.cos(base_ang + 0.0), math.sin(base_ang + 0.0), 0))
    # warm uplights washing the facade
    for da in (-0.9, 0.0, 0.9):
        a = base_ang + da
        n = Vector((math.cos(a), math.sin(a), 0))
        p = c + n * 4.6 + Vector((0, 0, 0.3))
        pk.lights.spot(tuple(p), tuple(c + n * 3.0 + Vector((0, 0, 7.0))), (1.0, 0.55, 0.2), 900.0,
                       angle_deg=80, blend=0.8, radius=0.2, shadow=True, name='HeroUp', collection=coll,
                       volume=0.05)
    pk.lights.area(tuple(c + dn * 4.2 + Vector((0, 0, 2.6))), tuple(c + dn * 8.0 + Vector((0, 0, 0.0))),
                   size=(2.0, 2.0), color=(1.0, 0.55, 0.22), energy=900.0, name='HeroSpill',
                   collection=coll)


def landmark(path, coll):
    """Far landmark on the axis of the drive: a slender stepped tower with a warm glowing
    clock face and a cobalt neon crown, uplit, at the outside of the last bend."""
    base = path.offset(118.0, 11.0, 0.0)
    plaster = pk.mat.clay((0.12, 0.14, 0.42), roughness=0.75, bumps=0.3, name='TowerPlaster')
    pk.geo.lathe([(2.6, 0.0), (2.6, 8.0), (2.2, 8.4), (2.2, 17.0), (1.8, 17.5), (1.8, 23.0),
                  (2.1, 23.3), (2.1, 23.8)], segments=48, material=plaster, name='Tower',
                 location=tuple(base), collection=coll, cap_top=True)
    cap = pk.mat.toy_plastic((0.55, 0.1, 0.4), roughness=0.3, name='TowerCap')
    pk.geo.lathe([(2.3, 23.8), (2.0, 24.6), (1.0, 26.4), (0.2, 27.6), (0.0, 27.8)], segments=48,
                 material=cap, name='TowerCap', location=tuple(base), collection=coll)
    face = pk.mat.emission((1.0, 0.62, 0.25), 30.0, name='ClockFace')
    to_cam = (path.at(20.0) - base)
    to_cam.z = 0
    to_cam.normalize()
    for k, ang in enumerate((0.0, -1.5708, 1.5708)):
        n = to_cam.copy()
        n.rotate(Matrix.Rotation(ang, 3, 'Z'))
        c = base + n * 1.83 + Vector((0, 0, 20.3))
        disc = pk.geo.lathe([(0.0, 0.0), (1.15, 0.0)], segments=40, material=face,
                            name='Clock%d' % k, collection=coll, cap_top=False, cap_bottom=False)
        disc.location = tuple(c)
        disc.rotation_euler = n.to_track_quat('Z', 'Y').to_euler()
    neon = pk.mat.neon_tube(COBALT, 22.0, name='TowerNeon')
    for z in (17.6, 23.45):
        rr = 2.0 if z < 20 else 2.25
        ring = [tuple(base + Vector((rr * math.cos(a), rr * math.sin(a), z)))
                for a in [2 * math.pi * i / 72 for i in range(73)]]
        pk.geo.tube_along(ring, radius=0.06, material=neon, name='TowerNeon', collection=coll)
    win = pk.mat.lit_window(WARM, strength=25.0, name='TowerWin', variation=0.3)
    for k in range(4):
        ang = math.atan2(to_cam.y, to_cam.x) + (k - 1.5) * 0.45
        n = Vector((math.cos(ang), math.sin(ang), 0))
        for z in (2.0, 5.2, 10.0, 13.5):
            wp = pk.geo.window_panel(cols=1, rows=1, win_w=0.8, win_h=1.5, material=win,
                                     name='TowerWin', seed=k * 5 + int(z), collection=coll,
                                     round_top=True, lit_fraction=0.85,
                                     location=tuple(base + n * (2.62 if z < 8 else 2.22) + Vector((0, 0, z))))
            wp.rotation_euler.z = ang + math.pi / 2
    for da, col in ((-0.6, MAGENTA), (0.6, COBALT)):
        a = math.atan2(to_cam.y, to_cam.x) + da
        n = Vector((math.cos(a), math.sin(a), 0))
        pk.lights.spot(tuple(base + n * 4.5 + Vector((0, 0, 0.3))), tuple(base + n * 2.0 + Vector((0, 0, 16.0))),
                       col, 6000.0, angle_deg=50, blend=0.8, radius=0.3, shadow=False,
                       name='TowerUp', collection=coll, volume=0.05)
    pk.lights.point(tuple(base + to_cam * 3.0 + Vector((0, 0, 20.3))), (1.0, 0.6, 0.25), 900.0,
                    radius=0.8, shadow=False, name='ClockGlow', collection=coll, volume=0.5)


def build(ctx):
    rng = random.Random(4)
    # a gentle S: left, then right toward the far landmark
    pts = [(0, -30), (0, 6), (-2.6, 30), (-1.2, 52), (3.8, 76), (9.8, 100), (13.0, 125), (13.5, 175)]
    cam = pk.camera.drive(pts, speed_mps=5.4, height=1.2, fov_v_deg=62, pitch_deg=6.5,
                          look_ahead=11.0, vibration=0.0016)
    path = ctx.path
    town = ctx.collection('Town')

    # road, curbs, sidewalks, verges + a planar probe so off-screen lights reflect
    asphalt = pk.mat.wet_asphalt()
    pavers = pk.mat.wet_asphalt(name='PK_WetPavers', base=(0.03, 0.03, 0.04), lane_markings=False,
                                puddles=0.3, dry_rough=0.35, wet_rough=0.18, grain=0.4)
    curb = pk.mat.clay((0.32, 0.33, 0.4), roughness=0.55, name='Curb')
    verge = pk.mat.ground((0.03, 0.05, 0.07), wet=0.5, name='Verge')
    pk.geo.road_from_curve(path, width=7.0, material=asphalt, curb=curb, sidewalk=pavers,
                           sidewalk_width=2.6, verge=verge, verge_width=60, collection=town)

    metal = pk.mat.metal((0.05, 0.05, 0.06), roughness=0.35, name='LampMetal')
    for i, s in enumerate(range(6, 132, 13)):
        side = 1 if i % 2 == 0 else -1
        lamp_post(path, s, side, LAMP_COLORS[i % len(LAMP_COLORS)], metal, town, i, light=True)

    # buildings both sides (cobalt / violet / teal / plum plaster), one warm hero
    palette = [(0.05, 0.12, 0.62), (0.26, 0.08, 0.62), (0.03, 0.3, 0.55), (0.42, 0.08, 0.42),
               (0.08, 0.08, 0.5)]
    roofs = [(0.12, 0.5, 0.75), (0.6, 0.2, 0.5), (0.2, 0.6, 0.5), (0.85, 0.35, 0.2)]
    washes = [MAGENTA, COBALT, ORANGE, (0.2, 0.9, 0.8)]
    idx = 0
    for side in (-1, 1):
        s = 2.0 if side < 0 else 8.0
        while s < 150:
            w = rng.uniform(5.5, 9.0)
            if side > 0 and 60 < s + w / 2 < 84:
                s += 6
                continue
            if side > 0 and 108 < s + w / 2 < 128:
                s += 6
                continue
            h = rng.uniform(4.5, 8.0) if s < 60 else rng.uniform(6.0, 12.0)
            d = rng.uniform(6.0, 9.0)
            col = rng.choice(palette)
            wc = WARM if rng.random() < 0.55 else ((0.45, 0.7, 1.0) if rng.random() < 0.6 else PINK)
            building(path, s + w / 2, side, rng.uniform(7.6, 9.0), (w, d, h), col, town, idx,
                     win_color=wc, rng=rng, roof=rng.choice(roofs),
                     wash=washes[idx % len(washes)] if s < 110 else None)
            idx += 1
            s += w + rng.uniform(0.8, 2.5)
    hero(path, 72.0, 1, town)
    landmark(path, town)

    # neon motifs on a left facade
    neon_m = pk.mat.neon_tube(PINK, 22.0)
    neon_c = pk.mat.neon_tube((0.25, 0.85, 1.0), 22.0)
    s = 30.0
    c0 = path.offset(s, -7.45, 5.6)
    r = path.right(s)
    t = path.tangent(s)
    ring = [tuple(c0 + (t * math.cos(a) + Vector((0, 0, 1)) * math.sin(a)) * 1.1)
            for a in [2 * math.pi * i / 64 for i in range(65)]]
    pk.geo.tube_along(ring, radius=0.045, material=neon_m, name='NeonRing', collection=town)
    wave = [tuple(path.offset(s - 3 + 6 * i / 40, -7.45, 3.6 + 0.35 * math.sin(i / 40 * 4 * math.pi)))
            for i in range(41)]
    pk.geo.tube_along(wave, radius=0.04, material=neon_c, name='NeonWave', collection=town)
    pk.lights.point(tuple(c0 + r * 0.6), PINK, 250, radius=0.5, shadow=False, name='NeonGlow', collection=town)

    # string lights across the road
    for s, cols in ((24.0, [WARM, PINK, COOL, (1.0, 0.85, 0.4)]), (62.0, [WARM, (1.0, 0.85, 0.4)])):
        p0 = path.offset(s, -5.2, 5.4)
        p1 = path.offset(s + 2.0, 5.2, 5.4)
        pk.geo.string_lights(tuple(p0), tuple(p1), sag=0.9, count=18, colors=cols, strength=250.0,
                             light_every=6, light_energy=40.0, collection=town)

    # far skyline layers (depth)
    far = ctx.collection('Skyline')
    sk_m = [pk.mat.clay(c, roughness=0.9, name='Sky%d' % i) for i, c in enumerate(
        [(0.06, 0.08, 0.3), (0.12, 0.06, 0.3), (0.05, 0.12, 0.26)])]
    sk_w = pk.mat.lit_window((1.0, 0.7, 0.4), strength=10.0, name='SkyWin', variation=0.6)
    sk_w2 = pk.mat.lit_window((0.5, 0.75, 1.0), strength=10.0, name='SkyWin2', variation=0.6)
    k = 0
    for s in range(20, 200, 7):
        for side in (-1, 1):
            if rng.random() < 0.25:
                continue
            lat = side * rng.uniform(22, 60)
            p = path.offset(s, lat, 0)
            w, d, h = rng.uniform(5, 10), rng.uniform(5, 10), rng.uniform(8, 26)
            b = pk.geo.rounded_box((d, w, h), radius=0.3, segments=2, material=rng.choice(sk_m),
                                   name='Far%d' % k, location=tuple(p), collection=far, edges=False)
            b.rotation_euler.z = -math.radians(path.heading(s)) + rng.uniform(-0.3, 0.3)
            wp = pk.geo.window_panel(cols=max(1, int(w / 2.2)), rows=max(1, int(h / 3.2)), win_w=0.9,
                                     win_h=1.2, gap_x=1.2, gap_y=1.9, material=rng.choice((sk_w, sk_w2)),
                                     seed=k, lit_fraction=0.45, name='FarWin%d' % k, collection=far)
            wp.parent = b
            wp.location = (-side * (d / 2 + 0.03), 0, 1.0)
            wp.rotation_euler.z = -math.pi / 2 * side
            k += 1

    # props: bollards along the curb and round bushes in the verges
    bol_m = pk.mat.toy_plastic((0.85, 0.75, 0.6), roughness=0.4)
    bol = pk.geo.lathe([(0.0, 0.0), (0.09, 0.0), (0.09, 0.75), (0.07, 0.86), (0.0, 0.9)], segments=20,
                       material=bol_m, name='Bollard', collection=town)
    pts_b = pk.geo.points_along(path, spacing=4.0, lateral=3.85, s0=3, s1=130, both_sides=True, z=0.14)
    pts_b = [p for i, p in enumerate(pts_b) if i % 3]
    pk.geo.scatter(bol, pts_b, seed=1, scale=(0.95, 1.05), name='Bollards', collection=town)
    bush_m = pk.mat.clay((0.05, 0.2, 0.18), roughness=0.75, bumps=0.8, name='Bush')
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.7)
    for v in bm.verts:
        v.co *= 1.0 + 0.18 * math.sin(v.co.x * 9) * math.cos(v.co.y * 7) + 0.1 * math.sin(v.co.z * 11)
        v.co.z = max(v.co.z, -0.1) * 0.8
    me = pk.bpy.data.meshes.new('Bush')
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.materials.append(bush_m)
    bush = pk.bpy.data.objects.new('Bush', me)
    town.objects.link(bush)
    pts_g = pk.geo.points_in_band(path, 60, 6.6, 7.2, s0=0, s1=140, seed=3, min_dist=2.5)
    pk.geo.scatter(bush, pts_g, seed=2, scale=(0.6, 1.3), name='Bushes', collection=town)

    # fireflies near the verges (tests particle helper)
    ff = pk.geo.points_in_band(path, 30, 5.5, 9.0, s0=10, s1=90, z=1.2, seed=8)
    pk.particles.fireflies(ff, color=(0.7, 1.0, 0.4), strength=30.0)

    # thin haze over the whole town out to the skyline
    mid = path.at(path.length * 0.5)
    pk.geo.fog(center=(mid.x, mid.y, 8), size=(260, 380, 16), density=0.0018, falloff=3.0,
               color=(0.5, 0.6, 1.0), anisotropy=0.5)

    # car foreground
    pk.vehicle.car_dashboard(cam, cover=0.15)

    # sky: galactic core low behind the right-hand roofs, band climbing diagonally to the
    # upper left; a crescent moon in the dark sky on the right
    pk.sky.galactic(core_az=16, core_el=9, tilt=-45, ambient=(0.012, 0.025, 0.12), light=0.04,
                    horizon_glow=0.025, horizon_color=(0.38, 0.3, 0.95), horizon_height_deg=12.0)
    pk.sky.moon(az=11, el=33, size_deg=3.5, phase=0.2, lit_angle_deg=-35, light=0.6,
                light_color=(0.3, 0.45, 1.0))

    pk.comp.setup(star_glow=0.25, star_sparkle=0.08)


pk.main('_kit-test', build)
