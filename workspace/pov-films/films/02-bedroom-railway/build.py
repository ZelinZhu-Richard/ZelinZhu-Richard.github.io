"""02-bedroom-railway: the cab of a toy tin locomotive running across a varnished bedroom floor
at night, through a town of cardboard-box houses and wooden blocks, toward a tall open window
that shows the real Milky Way (ESO/B. Tafreshi) and a large crescent Moon.

Scale: 1 unit = 4 cm of the real room (toy scale 1:25). The eye sits 1.9 units above the floor.

Run (from workspace/pov-films):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
    -P films/02-bedroom-railway/build.py -- --stills 1.0,4.0,7.0,9.5 --scale 0.5
"""
import os
import sys
import math
import random
import zlib

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'kit'))
import povkit as pk  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SLUG = '02-bedroom-railway'

# ---------------------------------------------------------------- layout (units = 4 cm)
EYE = 1.9                 # camera height above the floor
FOV_V = 62.0
PITCH = 6.5
SPEED = 5.2               # units / s (about 21 cm/s real: a toy train)
WALL_Y = 100.0            # far wall (window wall), inner face
CEIL = 68.0               # ceiling height (2.7 m real)
WIN_W = 76.0              # window opening width (3.0 m real: a wide picture window)
WIN_Z0, WIN_Z1 = 8.0, 64.0
# straight out of the start, then a gentle right bend round the dollhouse (which sits on the
# axis of the first straight, so it is the warm hero at the vanishing point for 0..4 s), then
# a long straight toward the window
PATH_PTS = [(0.0, -40.0), (0.0, 0.0), (0.0, 6.0), (1.6, 14.0), (4.6, 24.0), (8.0, 36.0),
            (10.2, 50.0), (11.2, 64.0), (11.6, 78.0), (11.8, 88.0)]
# round 4: the Catmull-Rom spline through PATH_PTS has a near-kink at (0, 6) (the 40-unit lead-in
# against a 6-unit segment) and uneven curvature over (1.6, 14) .. (8, 36). With the 3-unit
# look-ahead that made a 14 deg/s whip pan at 0.3 to 1.2 s (3.3x any other move) and a stall and
# surge at 2 to 3.6 s. The track and camera now follow the same path with its heading
# Gaussian-smoothed over PATH_SIGMA units of arc length (positions move at most 0.5 units near
# the start, under 0.3 downstream; the arc length is unchanged). Peak pan 5.2 px/frame.
PATH_SIGMA = float(os.environ.get('BR_PSIG', 7.0))
TRACK_END_S = None        # set from the path (buffer stop)
# round 4: the train brakes harder after 10 s so the teddy's head stays in frame under the card
# (it used to creep 11.5 units and crop the head from 12 s; now about 5.9 units)
# round 5: 0.07 left the scene standing still under the card (moon drift 0.1 to 0.4 px/frame in
# 11 to 14 s) while the kit vibration kept buzzing. The creep after 10 s cannot grow much: at
# about 6 units the right glazing bar starts to cover the Moon's lit limb and the teddy's head
# nears the top edge (0.3x over 1.6 s = 9.2 units hid 87 percent of the Moon disc by 13.6 s).
# So the train now brakes in step with the outro dim (1.2 s) to 0.15x and keeps rolling at
# twice the old crawl over the same 5.8 units, and the cab tilts up OUTRO_TILT degrees over
# 10 to 14 s (smoothstep), so the whole picture keeps drifting slowly under the card; the
# teddy's head top stays 10 to 11 percent below the top edge (round 4: 5.5 to 8).
SLOW_EASE = 1.2           # kit camera.drive brake (its keys after BRAKE_T0 are replaced, see outro_drive)
# round 6: critics found the 1.2 s brake abrupt (speed halved within 0.5 s at 10.5 to 11 s) and the
# outro tilt a slide that never settles (the scene fell about 13 px per half second under the
# card). The train now brakes on a smootherstep over 9.0 .. 11.5 s to 0.12x and then rolls at
# that constant creep (4.1 units after 10 s, round 5: 5.8), and the tilt is gone (OUTRO_TILT 0;
# the knob is a smootherstep over OUTRO_TILT_T0 .. + OUTRO_TILT_S). See outro_drive and the
# round-6 changelog in NOTES.md.
BRAKE_T0 = float(os.environ.get('BR_BRAKE0', 9.0))
BRAKE_S = float(os.environ.get('BR_BRAKES', 2.5))
END_SPEED = float(os.environ.get('BR_ENDV', 0.12))
OUTRO_TILT = float(os.environ.get('BR_TILT', 0.0))
OUTRO_TILT_T0 = float(os.environ.get('BR_TILT0', 9.0))
OUTRO_TILT_S = float(os.environ.get('BR_TILTS', 3.0))
# round 5: slow track rock in place of the kit's road vibration (its 2 to 6.9 Hz pitch and roll
# sines read as a +-2 px buzz of the world against the locked locomotive at 24 fps). Pitch
# and roll in degrees, each a sum of slow sines (Hz, phase), scaled by the train's speed so it
# settles as the train brakes.
ROCK_PITCH, ROCK_ROLL = 0.04, 0.03
ROCK_PITCH_W = ((0.83, 1.9), (1.67, 4.4))
ROCK_ROLL_W = ((0.61, 0.3), (1.13, 2.2))
# round 6: Peg16, a light-wrapped tree right of the rails about 7 units ahead of where the train
# ends up, sat on the end-card line just right of the URL for the whole hold (no camera path that
# brakes gently and keeps the Moon clear gets past it). Its fairy lights are off; the tree stays.
PEG_DARK = {int(v) for v in os.environ.get('BR_PEGDARK', '16').split(',') if v.strip()}
FLOOR_GRAIN = float(os.environ.get('BR_GRAIN', 0.45))   # floor grain contrast (round 3: 1.0)

# ---------------------------------------------------------------- palette (linear)
WARM = (1.0, 0.58, 0.25)
WARM_WHITE = (1.0, 0.72, 0.42)
AMBER = (1.0, 0.45, 0.12)
COBALT = (0.15, 0.35, 1.0)
MAGENTA = (1.0, 0.15, 0.6)
TEAL = (0.1, 0.85, 0.8)
VIOLET = (0.55, 0.3, 1.0)
PINK = (1.0, 0.35, 0.7)
PHOSPHOR = (0.42, 1.0, 0.5)
CYAN = (0.12, 0.62, 1.0)
AMBER2 = (1.0, 0.5, 0.16)
SODIUM = (1.0, 0.42, 0.1)
# round 3: warm amber practicals against cool blue moonlight; magenta and cyan only as a few
# accents (the critics read the round-2 cobalt / magenta washes as one violet fog)
LAMP_COLORS = [AMBER2, WARM_WHITE, CYAN, AMBER2, WARM_WHITE, MAGENTA]
WASH_COLORS = [COBALT, (0.1, 0.4, 1.0), SODIUM, COBALT, (0.08, 0.55, 1.0), SODIUM, COBALT, MAGENTA]
BEAR_FUR = (0.36, 0.17, 0.065)
BEAR_SC = float(os.environ.get('BR_BSC', 1.1))
FUR_SCALE = (9.0, 2.6, 1.0)
BEAR_KEY, BEAR_FILL, BEAR_RIM = 4200.0, 1600.0, 30000.0
PILLOW = (15.0, 14.0, 5.0)          # the teddy sits on a big ticking-striped bed pillow
TRACK_TRIM = 6.0
SLIPPER = (0.5, 0.2, 0.26)
BEAR_DX = float(os.environ.get('BR_BDX', 5.0))
MOON_SIZE, MOON_LIT, MOON_GLOW = 2.6, -62.0, 1.0
MOON_KEY, MOON_FLOOR = 1.2, 0.6
SKY_SAT, COMP_SAT = 0.5, 1.4
AMBIENT = (0.002, 0.008, 0.045)
BLUE_FILL = 18000.0
BLACK_POINT, CONTRAST = 0.003, 1.12
BAR_FRACS = (0.3, 0.66)
BAR_W = 1.3
FRAME_COLOR = (0.3, 0.31, 0.38)
GLASS_REFL = 3.0
WIN_GLOW = float(os.environ.get('BR_WIN', 22.0))
FOG = 0.00028
DOF_K, DOF_FOCUS, DOF_MAX = 30.0, 11.0, 10.0
LOCO_RED = (0.46, 0.022, 0.02)
CAB_FILL, CAB_SHEEN, CAB_COOL, HEADLAMP = 30.0, 70.0, 18.0, 1800.0
BEAR_CREAM = (0.62, 0.42, 0.24)
# fairy lights: three hues only, mostly warm (about 60 % warm, 20 % cyan, 20 % magenta)
FAIRY = [WARM_WHITE, AMBER2, CYAN, WARM_WHITE, MAGENTA, AMBER2, WARM_WHITE, CYAN, AMBER2, MAGENTA]
FAIRY_WARM = [WARM_WHITE, AMBER2, WARM_WHITE, (1.0, 0.62, 0.3)]

# sky plate (ESO potw1713a, top 62 percent = everything above Cerro Paranal), pre-shrunk
PLATE_SRC = os.path.join(pk.ASSETS, 'sky', 'eso-potw1713a', 'potw1713a.tif')
PLATE = os.path.join(HERE, 'plates', 'potw1713a_top62_w3400_cd.png')   # chroma-denoised (round 2)
# round 3: star-masked chroma denoise (no star colour smeared into halos), made by make_plate.py
PLATE_V3 = os.path.join(HERE, 'plates', 'potw1713a_top62_w3400_v4.png')
PLATE_CORE_UV = (0.17, 0.22 / 0.62)     # core bulge in the crop (u from left, v from top)


# =============================================================================== utilities
def smooth_path_points(points, sigma, spacing=1.0, ds=0.05):
    """Heading-smoothed copy of the kit's Catmull-Rom path through `points`: sample the path at
    `ds` steps of arc length, Gaussian-smooth the heading (sigma in units of arc length, ends
    padded with their own heading), integrate the unit tangent back from the first point and
    return points every `spacing` units. Arc length is preserved; the yaw rate of a camera on
    it is the smoothed curvature times the speed, with no kinks."""
    P = pk.Path(points)
    u = np.arange(0.0, P.length + 1e-9, ds)
    xy = np.array([tuple(P.at(float(v)))[:2] for v in u])
    d = np.diff(xy, axis=0)
    th = np.unwrap(np.arctan2(d[:, 0], d[:, 1]))
    th = np.concatenate([th, th[-1:]])
    pad = int(4 * sigma / ds) + 1
    thp = np.concatenate([np.full(pad, th[0]), th, np.full(pad, th[-1])])
    k = np.arange(-pad, pad + 1) * ds
    g = np.exp(-0.5 * (k / sigma) ** 2)
    g /= g.sum()
    ths = np.convolve(thp, g, mode='same')[pad:-pad]
    step = np.stack([np.sin(ths[:-1]), np.cos(ths[:-1])], 1) * ds
    xy2 = np.concatenate([xy[:1], xy[:1] + np.cumsum(step, axis=0)])
    idx = np.round(np.arange(0.0, u[-1], spacing) / ds).astype(int)
    idx = np.unique(np.concatenate([idx, [len(u) - 1]]))
    dev = np.linalg.norm(xy2 - xy, axis=1)
    pk.log('path heading smoothed (sigma %.1f): max shift %.2f units, end (%.2f, %.2f)' % (
        sigma, dev.max(), xy2[-1][0], xy2[-1][1]))
    return [(float(xy2[i][0]), float(xy2[i][1])) for i in idx]


def _smootherstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * x * (x * (6.0 * x - 15.0) + 10.0)


def _smootherstep_int(x):
    """Integral of _smootherstep from 0 to x."""
    x = max(0.0, x)
    if x <= 1.0:
        return x ** 6 - 3.0 * x ** 5 + 2.5 * x ** 4
    return 0.5 + (x - 1.0)


def speed_factor(t):
    """Train speed as a fraction of SPEED: constant, then a smootherstep brake over BRAKE_T0 ..
    BRAKE_T0 + BRAKE_S to END_SPEED, then a constant creep (round 6)."""
    return 1.0 - (1.0 - END_SPEED) * _smootherstep((t - BRAKE_T0) / max(BRAKE_S, 1e-3))


def cam_s_of_t(t, start_s):
    """Arc length of the camera at time t for speed_factor (exact integral)."""
    if t <= BRAKE_T0:
        return start_s + SPEED * t
    x = (t - BRAKE_T0) / max(BRAKE_S, 1e-3)
    return start_s + SPEED * BRAKE_T0 + SPEED * BRAKE_S * (x - (1.0 - END_SPEED) * _smootherstep_int(x))


def outro_tilt(t):
    """Extra cab pitch (degrees) in the outro."""
    return OUTRO_TILT * _smootherstep((t - OUTRO_TILT_T0) / max(OUTRO_TILT_S, 1e-3))


def outro_drive(ctx, cam, start_s, look_ahead, lean, max_roll_deg):
    """Round 6: replace camera.drive's keys after BRAKE_T0 with the same look-ahead rig (no sway,
    no vibration, as build() calls drive) moved along cam_s_of_t, so the brake is a long
    smootherstep instead of the kit's smoothstep after 10 s. Keys up to BRAKE_T0 are untouched
    (the cruise and everything placed with ctx.s_of_t stay exactly as before)."""
    path = ctx.path
    loc = pk.fcurves(cam, 'location')
    rot = pk.fcurves(cam, 'rotation_euler')
    by = {('l', fc.array_index): fc for fc in loc}
    by.update({('r', fc.array_index): fc for fc in rot})
    keys = {}
    for (kind, i), fc in by.items():
        for kp in fc.keyframe_points:
            keys.setdefault(int(round(kp.co[0])), {})[(kind, i)] = kp
    for f, kk in sorted(keys.items()):
        t = (f - 1) / pk.FPS
        if t <= BRAKE_T0 + 1e-9:
            continue
        s = cam_s_of_t(t, start_s)
        pos = path.offset(s, 0.0, EYE)
        d = path.offset(s + look_ahead, 0.0, EYE) - pos
        yaw = math.atan2(d.x, d.y)
        v = SPEED * speed_factor(t)
        k = path.curvature(s + look_ahead * 0.3)
        roll = max(-max_roll_deg, min(max_roll_deg, -lean * math.degrees(math.atan(k * v * v / 9.81)) * 0.5))
        rz = -yaw
        old = kk[('r', 2)].co[1]
        rz += 2 * math.pi * round((old - rz) / (2 * math.pi))
        vals = {('l', 0): pos.x, ('l', 1): pos.y, ('l', 2): pos.z,
                ('r', 0): math.radians(90.0 + PITCH), ('r', 1): math.radians(roll), ('r', 2): rz}
        for key, kp in kk.items():
            dv = vals[key] - kp.co[1]
            kp.co[1] += dv
            kp.handle_left[1] += dv
            kp.handle_right[1] += dv
    for fc in by.values():
        fc.update()
    ctx.cam_s_of_t = lambda t: cam_s_of_t(t, start_s)
    pk.log('outro: brake %.2f..%.2f s to %.2fx (smootherstep), creep %.2f units after 10 s, %.2f after 9 s; '
           'tilt %.1f deg over %.1f..%.1f s' % (
               BRAKE_T0, BRAKE_T0 + BRAKE_S, END_SPEED, ctx.cam_s_of_t(14.0) - ctx.cam_s_of_t(10.0),
               ctx.cam_s_of_t(14.0) - ctx.cam_s_of_t(9.0), OUTRO_TILT, OUTRO_TILT_T0, OUTRO_TILT_T0 + OUTRO_TILT_S))


def rock_and_tilt(cam):
    """Round 5: add to the per-frame camera keys of camera.drive(vibration=0)
    - a slow track rock (pitch ROCK_PITCH, roll ROCK_ROLL degrees, sines under 1.7 Hz) whose
      amplitude follows the train's speed, so it settles as the train brakes instead of
      trembling in place behind the end card;
    - the outro tilt: pitch up by outro_tilt(t) (round 6: smootherstep, OUTRO_TILT_T0 ..).
    The locomotive is parented to the camera and stays locked in frame."""
    def wave(comps, t):
        return sum(math.sin(2 * math.pi * f * t + ph) for f, ph in comps) / len(comps)
    for fc in pk.fcurves(cam, 'rotation_euler'):
        if fc.array_index not in (0, 1):
            continue
        for kp in fc.keyframe_points:
            t = (kp.co[0] - 1) / pk.FPS
            k = speed_factor(t)
            if fc.array_index == 0:
                d = math.radians(ROCK_PITCH * k * wave(ROCK_PITCH_W, t) + outro_tilt(t))
            else:
                d = math.radians(ROCK_ROLL * k * wave(ROCK_ROLL_W, t))
            kp.co[1] += d
            kp.handle_left[1] += d
            kp.handle_right[1] += d
        fc.update()


def _box_blur(a, r, axis):
    """Box blur of radius r along one axis (cumulative sum, edge-clamped)."""
    n = a.shape[axis]
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis, dtype=np.float64)
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def window_plate():
    """Crop the plate above the mountain, remove its colour noise (blur only the chroma, keep
    luma untouched, so stars stay sharp points and turn neutral instead of RGB speckle), then
    pre-shrink it (Blackman-Harris, no ringing) to about 1.9x the on-screen star density.
    Cached in the film folder."""
    if os.path.exists(PLATE):
        return PLATE
    import OpenImageIO as oiio
    src = oiio.ImageBuf(PLATE_SRC)
    sp = src.spec()
    cut = oiio.ImageBufAlgo.cut(src, oiio.ROI(0, sp.width, 0, int(sp.height * 0.62), 0, 1, 0, 3))
    a = cut.get_pixels(oiio.FLOAT).reshape(cut.spec().height, cut.spec().width, 3)
    Y = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    C = a - Y[..., None]
    for _ in range(3):                      # ~Gaussian, sigma about 4.5 source px = 1.6 output px
        C = _box_blur(_box_blur(C, 4, 0), 4, 1)
    a = np.clip(Y[..., None] + C, 0.0, 1.0).astype(np.float32)
    cut = oiio.ImageBuf(oiio.ImageSpec(a.shape[1], a.shape[0], 3, oiio.FLOAT))
    cut.set_pixels(oiio.ROI(0, a.shape[1], 0, a.shape[0], 0, 1, 0, 3), a)
    W2 = 3400
    H2 = int(round(W2 * cut.spec().height / cut.spec().width))
    dst = oiio.ImageBufAlgo.resize(cut, filtername='blackman-harris',
                                   roi=oiio.ROI(0, W2, 0, H2, 0, 1, 0, 3))
    os.makedirs(os.path.dirname(PLATE), exist_ok=True)
    dst.set_write_format(oiio.UINT8)
    dst.write(PLATE)
    pk.log('wrote sky plate', PLATE)
    return PLATE


def yaw_facing(F):
    """Z rotation that turns local -Y (an object's front) toward the xy direction F."""
    return math.atan2(F.x, -F.y)


def facing_track(path, s, side, toward_cam=0.3):
    """Unit xy direction from a roadside object toward the track, tilted toward the camera."""
    F = -path.right(s) * side - path.tangent(s) * toward_cam
    F.z = 0
    return F.normalized()


def obj_from_bm(bm, name, material=None, coll=None, smooth=True, sharp=40.0, edges=True,
                materials=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
        if sharp is not None:
            me.set_sharp_from_angle(angle=math.radians(sharp))
    if materials:
        for m in materials:
            me.materials.append(m)
    elif material is not None:
        me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    pk._link(ob, coll)
    if edges:
        pk.edge_mask(ob, gain=2.5)
    return ob


def set_xform(ob, loc, yaw=0.0, parent=None):
    ob.location = loc
    ob.rotation_euler = (0.0, 0.0, yaw)
    if parent is not None:
        ob.parent = parent
        ob.matrix_parent_inverse = Matrix.Identity(4)
    return ob


def prism_bm(w, d, rh, overhang=0.3, thick=0.18):
    """Gable roof (two thick flaps), ridge along local X, eaves at z=0, width w (X),
    depth d (Y) before overhang."""
    bm = bmesh.new()
    hw, hd = w / 2 + overhang, d / 2 + overhang
    # outer surface
    pts = [(-hd, 0.0), (0.0, rh), (hd, 0.0)]
    inner = [(-hd + thick * 0.6, -thick), (0.0, rh - thick * 1.4), (hd - thick * 0.6, -thick)]
    vs = []
    for x in (-hw, hw):
        ring = [bm.verts.new((x, y, z)) for (y, z) in pts + list(reversed(inner))]
        vs.append(ring)
    n = len(vs[0])
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((vs[0][i], vs[0][j], vs[1][j], vs[1][i]))
    bm.faces.new(list(reversed(vs[0])))
    bm.faces.new(vs[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.05, segments=2, affect='EDGES',
                    clamp_overlap=True)
    return bm


def polygon_bm(outline, thick=0.12):
    """Extruded flat polygon in the local XZ plane facing -Y (front at y = -thick)."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -thick, z)) for (x, z) in outline]
    back = [bm.verts.new((x, 0.0, z)) for (x, z) in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[j], front[i], back[i], back[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


# =============================================================================== materials
_MATS = {}


def cached(key, fn):
    if key not in _MATS:
        _MATS[key] = fn()
    return _MATS[key]


def floor_mat():
    """Dark walnut floorboards under a thick gloss varnish: board seams, staggered butt joints,
    per-board tone, cupping (reflections wobble board to board) and fine across-the-grain
    ridges that smear every reflection into a long streak toward the camera."""
    m, nt, out = pk._new_mat('BR_Floor')
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    BW, BL = 3.0, 30.0
    bx = pk.math_(nt, 'FLOOR', pk.math_(nt, 'DIVIDE', x, BW))
    fx = pk.math_(nt, 'FRACT', pk.math_(nt, 'DIVIDE', x, BW))
    rnd1 = pk.node(nt, 'ShaderNodeTexWhiteNoise', noise_dimensions='1D')
    pk._set(nt, rnd1.inputs['W'], bx)
    shift = pk.math_(nt, 'MULTIPLY', rnd1.outputs['Value'], BL)
    yb = pk.math_(nt, 'ADD', y, shift)
    by = pk.math_(nt, 'FLOOR', pk.math_(nt, 'DIVIDE', yb, BL))
    fy = pk.math_(nt, 'FRACT', pk.math_(nt, 'DIVIDE', yb, BL))
    rnd2 = pk.node(nt, 'ShaderNodeTexWhiteNoise', noise_dimensions='2D')
    pk._set(nt, rnd2.inputs['Vector'], pk.comb_xyz(nt, bx, by, 0.0))
    br = rnd2.outputs['Value']
    # grain: rings stretched along Y, offset per board
    gco = pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'ADD', x, pk.math_(nt, 'MULTIPLY', br, 37.0)), 1.6),
                      pk.math_(nt, 'MULTIPLY', y, 0.05), pk.math_(nt, 'MULTIPLY', br, 11.0))
    g1, _ = pk.noise(nt, gco, scale=2.2, detail=5.0, rough=0.62, distortion=0.6)
    wave = pk.node(nt, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='X', wave_profile='SIN')
    pk._set(nt, wave.inputs['Vector'], pk.vmath(nt, 'ADD', gco, pk.vmath(nt, 'SCALE', (1, 0, 0), scale=g1)))
    wave.inputs['Scale'].default_value = 1.6
    wave.inputs['Distortion'].default_value = 6.0
    wave.inputs['Detail'].default_value = 2.0
    grain = pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', wave.outputs['Fac'], 0.6), pk.math_(nt, 'MULTIPLY', g1, 0.5))
    light = (0.13, 0.075, 0.042)
    dark = (0.03, 0.016, 0.01)
    # round 4: the 4:1 grain lines (0.3 units apart, running toward the window) converge on the
    # vanishing point, so near the camera they read as radial speed lines; FLOOR_GRAIN pulls
    # both ends toward their mean (1.0 = round 3)
    gm = tuple((a + b) / 2 for a, b in zip(light, dark))
    light = tuple(m_ + (a - m_) * FLOOR_GRAIN for a, m_ in zip(light, gm))
    dark = tuple(m_ + (a - m_) * FLOOR_GRAIN for a, m_ in zip(dark, gm))
    col = pk.mix_col(nt, pk.maprange(nt, grain, 0.25, 0.85), dark, light)
    tone = pk.maprange(nt, br, 0.0, 1.0, 0.55, 1.45)
    col = pk.vmath(nt, 'SCALE', col, scale=tone)
    # seams (dark gaps)
    sx = pk.math_(nt, 'MINIMUM', fx, pk.math_(nt, 'SUBTRACT', 1.0, fx))
    sy = pk.math_(nt, 'MINIMUM', fy, pk.math_(nt, 'SUBTRACT', 1.0, fy))
    seam = pk.math_(nt, 'MAXIMUM', pk.maprange(nt, sx, 0.0, 0.02, 1.0, 0.0),
                    pk.maprange(nt, sy, 0.0, 0.002, 1.0, 0.0))
    col = pk.mix_col(nt, seam, col, (0.004, 0.002, 0.001))
    # roughness: varnish with faint wear lanes
    wr, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', x, 0.15), pk.math_(nt, 'MULTIPLY', y, 0.02), 0.0),
                     scale=1.0, detail=3.0)
    rough = pk.maprange(nt, wr, 0.3, 0.75, 0.05, 0.14)
    rough = pk.mix_f(nt, seam, rough, 0.6)
    # normals: cupping per board + across-grain ridges (streaks) + slow waviness
    cup = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'POWER', pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', fx, 0.5)), 2.0),
                   pk.maprange(nt, br, 0.0, 1.0, 0.6, 1.4))
    nrm = pk.bump(nt, cup, strength=0.35, distance=0.06)
    ridge, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', x, 0.7), pk.math_(nt, 'MULTIPLY', y, 75.0), 0.0),
                        scale=1.0, detail=3.0, rough=0.6)
    nrm = pk.bump(nt, ridge, strength=0.16, distance=0.004, normal=nrm)
    wv, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', x, 0.25), pk.math_(nt, 'MULTIPLY', y, 0.5), 0.0),
                     scale=1.0, detail=2.0)
    nrm = pk.bump(nt, wv, strength=0.05, distance=0.03, normal=nrm)
    nrm = pk.bump(nt, pk.math_(nt, 'MULTIPLY', grain, 0.3), strength=0.04, distance=0.002, normal=nrm)
    p = pk._principled(nt, base=col, rough=rough, normal=nrm, spec=1.0, ior=1.5, coat=0.5, coat_rough=0.04,
                       coat_normal=nrm)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.09, 0.045, 0.02), rough=0.1)
    return m


def tin_paint(color, name, rough=0.22, coat=0.7, wear=0.4, litho=None):
    """Lithographed tinplate: glossy enamel, worn to bright tin on the edges."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    col = pk._jitter_color(nt, color, 0.05, co, scale=4.0)
    e = pk._edge(nt)
    wn, _ = pk.noise(nt, co, scale=30.0, detail=4.0, rough=0.7)
    wm = pk.maprange(nt, pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', e, wear * 1.5), pk.math_(nt, 'MULTIPLY', wn, 0.5)), 0.75, 0.85)
    col = pk.mix_col(nt, wm, col, (0.62, 0.62, 0.64))
    metal = pk.maprange(nt, wm, 0, 1, 0.0, 1.0)
    rv = pk.mix_f(nt, wm, rough, 0.25)
    pf, _ = pk.noise(nt, co, scale=90.0, detail=1.0)
    nrm = pk.bump(nt, pf, strength=0.02, distance=0.001)
    p = pk._principled(nt, base=col, rough=rv, metal=metal, normal=nrm, coat=coat, coat_rough=0.06)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=rough, coat=coat, coat_rough=0.06)
    return m


def brass(name='BR_Brass', rough=0.16):
    return cached(name, lambda: pk.mat.metal((0.98, 0.7, 0.34), roughness=rough, scratches=0.35,
                                             dirt=0.2, name=name))


def litho_gold():
    """Lithographed 'brass' on tinplate: gold print with some metal sheen, so it reads even
    when there is little to reflect."""
    def mk():
        m, nt, out = pk._new_mat('BR_LithoGold')
        co = pk.texcoord(nt, 'Object')
        nf, _ = pk.noise(nt, co, scale=40.0, detail=3.0)
        col = pk.vmath(nt, 'SCALE', (0.95, 0.64, 0.2), scale=pk.maprange(nt, nf, 0.3, 0.7, 0.85, 1.1))
        p = pk._principled(nt, base=col, rough=0.22, metal=0.8, coat=0.6, coat_rough=0.05)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        pk._web(m, base=(0.9, 0.58, 0.18), rough=0.25, metal=0.6)
        return m
    return cached('lithogold', mk)


def nickel():
    return cached('nickel', lambda: pk.mat.metal((0.86, 0.86, 0.88), roughness=0.12, scratches=0.4,
                                                 dirt=0.12, name='BR_Nickel'))


def cardboard(color, name, painted=False):
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    col = pk._jitter_color(nt, color, 0.1, co, scale=1.4)
    # corrugation flutes showing faintly through the liner (vertical)
    fl = pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'ADD', x, y), 48.0))
    e = pk._edge(nt)
    edge_col = (0.55, 0.36, 0.2) if painted else (0.62, 0.44, 0.26)
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', e, 0.55), col, edge_col)
    sf, _ = pk.noise(nt, co, scale=6.0, detail=4.0, rough=0.6)
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, sf, 0.3, 0.7, 0.85, 1.1))
    nrm = pk.bump(nt, pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', fl, 0.3), sf), strength=0.06, distance=0.01)
    p = pk._principled(nt, base=col, rough=0.62 if painted else 0.78, normal=nrm, spec=0.35,
                       sheen=0.2, sheen_tint=(0.8, 0.7, 0.6))
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.75)
    return m


def velvet(color, name, sheen=0.9):
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    col = pk._jitter_color(nt, color, 0.08, co, scale=0.15)
    nf, _ = pk.noise(nt, co, scale=3.0, detail=6.0, rough=0.7)
    nrm = pk.bump(nt, nf, strength=0.08, distance=0.02)
    p = pk._principled(nt, base=col, rough=0.85, normal=nrm, sheen=sheen, sheen_tint=(1.0, 0.9, 1.0),
                       spec=0.2)
    p.inputs['Sheen Roughness'].default_value = 0.35
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.9)
    m['pk_web_sheen'] = {'weight': sheen, 'tint': [1.0, 0.9, 1.0], 'rough': 0.35}     # export only
    return m


def plush_mat(color, name, tip=None, sheen=1.0):
    """Plush fur: fibre-scale noise in colour and normal, darker roots and lighter tips (the
    tips catch the light at grazing angles through the sheen lobe, so silhouettes go fuzzy and
    bright under a rim light), soft subsurface."""
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    col = pk._jitter_color(nt, color, 0.1, co, scale=0.4)
    f1, _ = pk.noise(nt, co, scale=FUR_SCALE[0], detail=3.0, rough=0.8)       # fibre grain
    f3, _ = pk.noise(nt, co, scale=FUR_SCALE[1], detail=4.0, rough=0.7, distortion=1.5)   # tufts
    f2, _ = pk.noise(nt, co, scale=FUR_SCALE[2], detail=3.0)                     # nap direction patches
    fib = pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', f1, 0.6), pk.math_(nt, 'MULTIPLY', f3, 0.6))
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, fib, 0.35, 0.85, 0.8, 1.1))
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, f2, 0.3, 0.7, 0.85, 1.1))
    nrm = pk.bump(nt, fib, strength=0.45, distance=0.02)
    nrm = pk.bump(nt, f2, strength=0.15, distance=0.2, normal=nrm)
    tip = tip or tuple(min(1.0, c * 1.8 + 0.08) for c in color)
    p = pk._principled(nt, base=col, rough=0.9, normal=nrm, sheen=sheen, sheen_tint=tip,
                       spec=0.2, sss=0.2, sss_radius=(1.0, 0.55, 0.35), sss_scale=0.4)
    p.inputs['Sheen Roughness'].default_value = 0.35
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.95)
    m['pk_web_sheen'] = {'weight': sheen, 'tint': list(tip), 'rough': 0.35}     # export only
    return m


def wall_paint(color, name, rough=0.8):
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    col = pk._jitter_color(nt, color, 0.06, co, scale=0.05)
    rf, _ = pk.noise(nt, co, scale=1.4, detail=6.0, rough=0.7)
    nrm = pk.bump(nt, rf, strength=0.05, distance=0.02)
    p = pk._principled(nt, base=col, rough=rough, normal=nrm, spec=0.3)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=rough)
    return m


def glow(color, strength, name=None):
    key = name or 'glow_%s_%d' % ('_'.join('%.2f' % c for c in color), int(strength))
    return cached(key, lambda: pk.mat.emission(color, strength, name=key))


# cut-out window colours by fract(pk_rand * 3.7) (CONSTANT ramp): mostly warm fairy-lit rooms,
# some cyan, a few magenta and blue. Shared by the film shader and the web atlas below.
BOX_WIN_STOPS = [(0.0, (1.0, 0.6, 0.28)), (0.3, (0.22, 0.68, 1.0)), (0.45, (1.0, 0.48, 0.16)),
                 (0.65, (1.0, 0.28, 0.62)), (0.78, (1.0, 0.7, 0.4)), (0.9, (0.3, 0.45, 1.0))]


def box_window_mat(name, strength=30.0):
    """Cut-out window lit from inside by fairy lights: a warm interior gradient, a little
    string of glowing bulbs sagging across the top, per-window colour (pk_rand)."""
    m, nt, out = pk._new_mat(name)
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    rnd = pk.attr(nt, 'pk_rand')
    ramp = pk.node(nt, 'ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'CONSTANT'
    stops = BOX_WIN_STOPS
    cr.elements[0].position = stops[0][0]
    cr.elements[0].color = stops[0][1] + (1.0,)
    cr.elements[1].position = stops[1][0]
    cr.elements[1].color = stops[1][1] + (1.0,)
    for pos, c in stops[2:]:
        el = cr.elements.new(pos)
        el.color = c + (1.0,)
    pk._set(nt, ramp.inputs['Fac'], pk.math_(nt, 'FRACT', pk.math_(nt, 'MULTIPLY', rnd, 3.7)))
    col = ramp.outputs['Color']
    lit = pk.math_(nt, 'LESS_THAN', rnd, 1.0)
    d = pk.vmath(nt, 'DISTANCE', pk.comb_xyz(nt, U, V, 0.0), (0.5, 0.62, 0.0))
    g = pk.maprange(nt, d, 0.0, 0.85, 1.3, 0.35, interp='SMOOTHSTEP')
    # bulbs: 4 dots on a sagging wire near the top
    xs = pk.math_(nt, 'SUBTRACT', pk.math_(nt, 'FRACT', pk.math_(nt, 'MULTIPLY', U, 4.0)), 0.5)
    sag = pk.math_(nt, 'SUBTRACT', 0.8, pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', U, math.pi)), 0.16))
    dy = pk.math_(nt, 'SUBTRACT', V, sag)
    dd = pk.math_(nt, 'SQRT', pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', xs, xs), 0.0625),
                                       pk.math_(nt, 'MULTIPLY', dy, dy)))
    bulb = pk.maprange(nt, dd, 0.025, 0.07, 3.5, 0.0, interp='SMOOTHSTEP')
    bulb = pk.math_(nt, 'MULTIPLY', bulb, 0.0)
    # cross bar (cut from the card) and drawn curtains at the sides
    cb = pk.math_(nt, 'MAXIMUM', pk.maprange(nt, pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', U, 0.5)), 0.035, 0.05, 1.0, 0.0),
                  pk.maprange(nt, pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', V, 0.58)), 0.03, 0.045, 1.0, 0.0))
    cur = pk.math_(nt, 'MAXIMUM', pk.maprange(nt, U, 0.1, 0.2, 0.75, 0.0, interp='SMOOTHSTEP'),
                   pk.maprange(nt, U, 0.8, 0.9, 0.0, 0.75, interp='SMOOTHSTEP'))
    g = pk.math_(nt, 'MULTIPLY', g, pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'SUBTRACT', 1.0, cb),
                                            pk.math_(nt, 'SUBTRACT', 1.0, cur)))
    bright = pk.maprange(nt, pk.math_(nt, 'FRACT', pk.math_(nt, 'MULTIPLY', rnd, 7.3)), 0, 1, 0.55, 1.25)
    e = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'ADD', g, bulb), pk.math_(nt, 'MULTIPLY', bright, lit))
    p = pk._principled(nt, base=(0.02, 0.012, 0.008), rough=0.5, emit=col,
                       emit_strength=pk.math_(nt, 'MULTIPLY', e, strength))
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.02, 0.01, 0.0), rough=0.5, emit=(1.0, 0.6, 0.3), emit_strength=strength * 0.7)
    return m


# =============================================================================== windows
def window_outline(kind, w, h, n=14):
    if kind == 'round':
        r = w / 2
        return [(r * math.cos(2 * math.pi * i / (2 * n)), h / 2 + r * math.sin(2 * math.pi * i / (2 * n)))
                for i in range(2 * n)]
    if kind == 'arch':
        r = w / 2
        pts = [(-r, 0.0), (r, 0.0)]
        cz = h - r
        for i in range(n + 1):
            a = math.pi * i / n
            pts.append((r * math.cos(a), cz + r * math.sin(a)))
        return pts
    return [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, h), (-w / 2, h)]


def add_windows(name, specs, glow_mat, rim_mat, coll, rng, lit_fraction=0.85, rim=0.12):
    """specs: list of (M, kind, w, h) where M is a 4x4 local->object matrix whose XZ plane is
    the facade (front toward local -Y), origin at the window's bottom centre. Builds one mesh:
    each window = glowing interior polygon + a cut-edge rim ring."""
    verts, faces, uvs, mats, rnd = [], [], [], [], []
    for (M, kind, w, h) in specs:
        out = window_outline(kind, w, h)
        cx = sum(p[0] for p in out) / len(out)
        cz = sum(p[1] for p in out) / len(out)
        big = []
        for (x, z) in out:
            dx, dz = x - cx, z - cz
            L = math.hypot(dx, dz) + 1e-9
            big.append((x + dx / L * rim, z + dz / L * rim))
        r = rng.random()
        rv = r / lit_fraction if lit_fraction < 1 else r
        k0 = len(verts)
        for (x, z) in out:
            verts.append(tuple(M @ Vector((x, -0.02, z))))
        k1 = len(verts)
        for (x, z) in big:
            verts.append(tuple(M @ Vector((x, -0.01, z))))
        n = len(out)
        faces.append(tuple(range(k0, k0 + n)))
        uvs += [((x + w / 2) / w, z / h) for (x, z) in out]
        mats.append(0)
        rnd.append(rv)
        for i in range(n):
            j = (i + 1) % n
            faces.append((k1 + i, k1 + j, k0 + j, k0 + i))
            uvs += [(0, 0), (1, 0), (1, 1), (0, 1)]
            mats.append(1)
            rnd.append(rv)
    ob = pk.mesh_object(name, verts, faces, uvs=uvs, materials=[glow_mat, rim_mat], mat_index=mats,
                        smooth=False, collection=coll, attrs={'pk_rand': ('FACE', rnd)})
    return ob


# =============================================================================== build parts
def build_room(ctx, coll):
    """Floor, far wall with the window opening, ceiling, skirting, sill."""
    wx0, wx1 = ctx.win_x0, ctx.win_x1
    floor = pk.mesh_object('Floor', [(-120, -80, 0), (140, -80, 0), (140, WALL_Y, 0), (-120, WALL_Y, 0)],
                           [(0, 1, 2, 3)], material=floor_mat(), smooth=False, collection=coll)
    wall_m = wall_paint((0.03, 0.04, 0.13), 'BR_WallPaint')
    T = 4.0
    pieces = [(-120.0, wx0, 0.0, CEIL), (wx1, 140.0, 0.0, CEIL), (wx0, wx1, 0.0, WIN_Z0), (wx0, wx1, WIN_Z1, CEIL)]
    for i, (x0, x1, z0, z1) in enumerate(pieces):
        b = pk.geo.rounded_box((x1 - x0, T, z1 - z0), radius=0.0, segments=0, material=wall_m,
                               name='Wall%d' % i, location=((x0 + x1) / 2, WALL_Y + T / 2, z0),
                               collection=coll, edges=False)
    ceil_m = wall_paint((0.025, 0.032, 0.1), 'BR_Ceiling')
    pk.mesh_object('Ceiling', [(-120, -80, CEIL), (-120, WALL_Y, CEIL), (140, WALL_Y, CEIL), (140, -80, CEIL)],
                   [(0, 1, 2, 3)], material=ceil_m, smooth=False, collection=coll)
    # skirting board
    sk_m = pk.mat.painted_wood((0.55, 0.58, 0.7), name='BR_Skirting', wear=0.2, roughness=0.35)
    pk.geo.rounded_box((260.0, 0.8, 4.0), radius=0.15, segments=2, material=sk_m, name='Skirting',
                       location=(10.0, WALL_Y - 0.4, 0.0), collection=coll)
    # window reveal (white-painted frame) + deep sill
    fr_m = pk.mat.painted_wood(FRAME_COLOR, name='BR_WinFrame', wear=0.25, roughness=0.3)
    cx = (wx0 + wx1) / 2
    pk.geo.rounded_box((wx1 - wx0 + 6.0, 6.5, 1.1), radius=0.3, segments=3, material=fr_m, name='Sill',
                       location=(cx, WALL_Y - 1.0, WIN_Z0 - 1.1), collection=coll)
    for x in (wx0 - 1.0, wx1 + 1.0):
        pk.geo.rounded_box((2.0, 3.0, WIN_Z1 - WIN_Z0 + 2.0), radius=0.3, segments=2, material=fr_m,
                           name='Jamb', location=(x, WALL_Y + 0.3, WIN_Z0 - 1.0), collection=coll)
    pk.geo.rounded_box((wx1 - wx0 + 4.0, 3.0, 2.0), radius=0.3, segments=2, material=fr_m, name='Head',
                       location=(cx, WALL_Y + 0.3, WIN_Z1), collection=coll)
    # glazing bars: four tall casements and a transom, so the opening reads as a window and
    # its frame moves against the sky at infinity
    for fr in BAR_FRACS:
        x = wx0 + (wx1 - wx0) * fr
        pk.geo.rounded_box((BAR_W, 2.0, WIN_Z1 - WIN_Z0), radius=0.25, segments=2, material=fr_m,
                           name='Mullion', location=(x, WALL_Y + 1.2, WIN_Z0), collection=coll)
    window_glass(ctx, coll)
    pk.geo.rounded_box((wx1 - wx0, 2.0, BAR_W), radius=0.25, segments=2, material=fr_m, name='Transom',
                       location=(cx, WALL_Y + 1.2, WIN_Z0 + (WIN_Z1 - WIN_Z0) * 0.85), collection=coll)
    build_outside(ctx, coll)


def build_outside(ctx, coll):
    """The real street outside, far beyond the window: two dark bands of rooftops, chimneys and
    tree crowns (12 and 20 m away) with a few small warm lit windows. It gives the window a
    horizon, hides the plate's lower edge and shows a faint parallax against the sky at
    infinity. Heights are set by the elevation they reach from the start of the run."""
    rng = random.Random(77)
    sil = cached('sil', lambda: pk.mat.basic((0.004, 0.005, 0.012), roughness=0.9, name='BR_Silhouette'))
    sil2 = cached('sil2', lambda: pk.mat.basic((0.008, 0.011, 0.03), roughness=0.9, name='BR_Silhouette2'))
    winm = cached('silwin', lambda: pk.mat.emission((1.0, 0.55, 0.22), 5.0, name='BR_SilWindow'))
    cx = (ctx.win_x0 + ctx.win_x1) / 2
    wverts, wfaces = [], []
    for row, (dist, el0, el1, span, m_) in enumerate(((560.0, 7.0, 10.5, 1300.0, sil2),
                                                       (300.0, 4.6, 8.4, 800.0, sil))):
        y = WALL_Y + dist
        D = y                               # distance from the start of the run
        zf = lambda el: EYE + D * math.tan(math.radians(el))
        verts, faces = [], []
        x = cx - span / 2
        while x < cx + span / 2:
            w = rng.uniform(16.0, 36.0) * D / 400.0
            h = zf(rng.uniform(el0, el1 - 1.5))
            k = len(verts)
            if rng.random() < 0.55:          # gable roof
                ph = min(h + w * rng.uniform(0.22, 0.38), zf(el1))
                verts += [(x, y, -80.0), (x + w, y, -80.0), (x + w, y, h), (x + w / 2, y, ph), (x, y, h)]
                faces.append((k, k + 1, k + 2, k + 3, k + 4))
            else:                            # flat roof with a chimney stack
                cxh = x + w * rng.uniform(0.2, 0.7)
                cw, chh = w * 0.1, w * 0.22
                verts += [(x, y, -80.0), (x + w, y, -80.0), (x + w, y, h), (cxh + cw, y, h),
                          (cxh + cw, y, h + chh), (cxh, y, h + chh), (cxh, y, h), (x, y, h)]
                faces.append(tuple(range(k, k + 8)))
            if row == 1:
                for _ in range(3):
                    if rng.random() < 0.45:
                        ww = w * 0.09
                        wx = x + rng.uniform(0.15, 0.8) * w
                        wz = h - rng.uniform(1.6, 4.0) * ww
                        kk = len(wverts)
                        wverts += [(wx, y - 0.5, wz), (wx + ww, y - 0.5, wz), (wx + ww, y - 0.5, wz + ww * 1.2),
                                   (wx, y - 0.5, wz + ww * 1.2)]
                        wfaces.append((kk, kk + 1, kk + 2, kk + 3))
            if rng.random() < 0.4:            # a tree crown between the houses
                tx = x + w + rng.uniform(-0.1, 0.1) * w
                tr = rng.uniform(0.35, 0.6) * w
                tz = h - tr * rng.uniform(0.0, 0.4)
                kk = len(verts)
                n = 20
                verts.append((tx + tr, y - 2.0, -80.0))
                for i in range(n):
                    a = math.pi * i / (n - 1)
                    rr = tr * (1.0 + 0.1 * math.sin(9 * a + rng.random() * 6))
                    verts.append((tx + rr * math.cos(a), y - 2.0, tz + rr * 0.85 * math.sin(a)))
                verts.append((tx - tr, y - 2.0, -80.0))
                faces.append(tuple(range(kk, kk + n + 2)))
            x += w + rng.uniform(-0.05, 0.15) * w
        o = pk.mesh_object('OutsideRow%d' % row, verts, faces, material=m_, smooth=False, collection=coll)
        o.visible_shadow = False
    if wverts:
        o = pk.mesh_object('OutsideWindows', wverts, wfaces, material=winm, smooth=False, collection=coll)
        o.visible_shadow = False


def build_sky(ctx):
    """Real night sky seen only through the window: ESO potw1713a, rolled so the band falls
    diagonally across the window, plus a large rendered crescent Moon low on the right."""
    plate = PLATE_V3 if os.path.exists(PLATE_V3) else window_plate()
    core_az, core_el = ctx.core_dir
    roll = ctx.sky_roll
    hfov = ctx.sky_hfov
    img = pk.load_image(plate, 'sRGB')
    W, H = img.size
    vfov = math.degrees(2 * math.atan(math.tan(math.radians(hfov) / 2) * H / W))
    th, tv = math.tan(math.radians(hfov) / 2), math.tan(math.radians(vfov) / 2)
    u0, v0 = PLATE_CORE_UV
    px, py = (u0 - 0.5) * 2 * th, (0.5 - v0) * 2 * tv
    target = pk.sky_dir(core_az, core_el)
    caz, cel = core_az, core_el
    for _ in range(30):
        f, r, u = pk.sky.rect_frame(caz, cel, roll)
        d = (f + r * px + u * py).normalized()
        az = math.degrees(math.atan2(d.x, d.y))
        el = math.degrees(math.asin(max(-1, min(1, d.z))))
        caz += core_az - az
        cel += core_el - el
    # coverage: every window direction visible in frame (t = 0..14 s) must fall inside the plate
    f, r, u = pk.sky.rect_frame(caz, cel, roll)
    us, vs, bad = [], [], []
    for tt in np.arange(0.0, 14.01, 1.0):
        q = ctx.path.at(ctx.cam_s_of_t(tt)) + Vector((0, 0, EYE))
        hd = math.radians(ctx.path.heading(ctx.cam_s_of_t(tt)))
        top_el = PITCH + outro_tilt(tt) + 31.5   # round 5 tilt
        for gx in np.linspace(ctx.win_x0, ctx.win_x1, 9):
            for gz in np.linspace(WIN_Z0, WIN_Z1, 9):
                d = (Vector((gx, WALL_Y, gz)) - q).normalized()
                az = math.atan2(d.x, d.y) - hd
                el = math.degrees(math.asin(d.z))
                if abs(math.degrees(az)) > 19.0 or el > top_el or el < 4.5:
                    continue
                df = d.dot(f)
                us.append(0.5 + d.dot(r) / df / (2 * th))
                vs.append(0.5 + d.dot(u) / df / (2 * tv))
                if us[-1] < 0.02 or us[-1] > 0.98 or vs[-1] < 0.02 or vs[-1] > 0.98:
                    bad.append((round(float(tt), 1), round(math.degrees(az), 1), round(el, 1), round(us[-1], 2), round(vs[-1], 2)))
    pk.log('sky plate coverage u %.3f..%.3f v %.3f..%.3f (must stay inside 0..1)' % (min(us), max(us), min(vs), max(vs)))
    if bad:
        pk.log('sky plate edge visible (t, rel az, el, u, v):', bad[:12], len(bad))
    pk.sky.photo_plate(plate, caz, cel, hfov, roll_deg=roll, gain=ctx.sky_gain, feather=0.02,
                       blend='replace', name='window_sky', colorspace='sRGB')
    # gentle, photographic grade: no saturation push, a slight cool tint
    pk.sky.set_grade(exposure=0.0, contrast=ctx.sky_contrast, saturation=ctx.sky_sat, tint=ctx.sky_tint)
    pk.sky.set_lighting(gain=0.0, tint=(0.7, 0.8, 1.0), ambient=ctx.ambient)
    # faint airglow / town light dome low over the rooftops outside (low-frequency, no stars)
    pk.sky.set_horizon_glow(color=ctx.glow_color, strength=ctx.glow_strength, height_deg=14.0)
    maz, mel = ctx.moon_dir
    pk.sky.moon(az=maz, el=mel, size_deg=ctx.moon_size, phase=0.17, lit_angle_deg=MOON_LIT, gain=ctx.moon_gain,
                earthshine=0.02, earthshine_color=(0.5, 0.65, 1.0), halo=0.0, halo_size=0.15, light=0.0)
    if MOON_GLOW > 0:
        moon_glow(maz, mel, ctx.moon_size, MOON_LIT, MOON_GLOW)
    return caz, cel


def build_train(ctx, cam):
    """Toy tin locomotive seen from the cab: boiler, bands, dome, chimney, rails, beam."""
    rig = pk.vehicle.rig(cam)
    R = 0.44
    y_front = 3.25
    z_top = pk.vehicle.cover_z(cam, 0.152, y_front)
    zc = z_top - R
    # round 3: glossy red enamel (the bottle green read as a dark teal blob), lit by a soft warm
    # sheen from ahead and a cool rim from behind-left (light-linked to the loco)
    green = tin_paint(LOCO_RED, 'BR_BoilerRed', rough=0.16, coat=1.0, wear=0.18)
    black = tin_paint((0.035, 0.03, 0.04), 'BR_Smokebox', rough=0.2, coat=0.9, wear=0.3)
    red = tin_paint((0.4, 0.02, 0.015), 'BR_BufferRed', rough=0.25, coat=0.8, wear=0.35)
    br = litho_gold()
    parts = []

    def along_y(ob):
        ob.rotation_euler = (-math.pi / 2, 0.0, 0.0)
        return ob
    # boiler barrel and smokebox (lathe around Z, turned to lie along +Y)
    boiler = pk.geo.lathe([(R * 0.98, -0.2), (R, 0.0), (R, 2.62)], segments=64, material=green,
                          name='Boiler', cap_bottom=True, cap_top=False)
    boiler.location = (0.0, -0.2 + 0.2, zc)
    along_y(boiler)
    parts.append(boiler)
    sb = pk.geo.lathe([(R + 0.03, 0.0), (R + 0.045, 0.02), (R + 0.045, 0.6), (R + 0.02, 0.64),
                       (R * 0.8, 0.7), (0.0, 0.74)], segments=64, material=black, name='Smokebox')
    sb.location = (0.0, 2.6, zc)
    along_y(sb)
    parts.append(sb)
    for i, yb in enumerate((0.75, 1.45, 2.15, 2.58)):
        band = pk.geo.lathe([(R + 0.008, 0.0), (R + 0.02, 0.012), (R + 0.02, 0.05), (R + 0.008, 0.062)],
                            segments=64, material=br, name='Band%d' % i, cap_bottom=False, cap_top=False)
        band.location = (0.0, yb, zc)
        along_y(band)
        parts.append(band)
    # dome and chimney on top
    # low enamelled dome (green, a thin gold ring at its foot) and a short stovepipe chimney, so
    # the foreground stays in the bottom fifth and nothing bright sits at the bottom centre
    dome = pk.geo.lathe([(0.15, -0.05), (0.125, 0.012), (0.1, 0.04), (0.1, 0.07), (0.09, 0.105),
                         (0.05, 0.13), (0.0, 0.138)], segments=40, material=green, name='Dome')
    dome.location = (0.0, 2.3, zc + R - 0.02)
    parts.append(dome)
    dring = pk.geo.lathe([(0.104, 0.0), (0.112, 0.008), (0.112, 0.022), (0.104, 0.03)], segments=40,
                         material=br, name='DomeRing', cap_bottom=False, cap_top=False)
    dring.location = (0.0, 2.3, zc + R + 0.01)
    parts.append(dring)
    chim = pk.geo.lathe([(0.2, -0.05), (0.12, 0.025), (0.1, 0.045), (0.1, 0.17), (0.115, 0.19),
                         (0.145, 0.22), (0.145, 0.245), (0.118, 0.25), (0.09, 0.215), (0.0, 0.215)],
                        segments=40, material=black, name='Chimney')
    chim.location = (0.0, 2.95, zc + R + 0.01)
    parts.append(chim)
    rim = pk.geo.lathe([(0.115, 0.19), (0.147, 0.22), (0.147, 0.247), (0.12, 0.252)], segments=40,
                       material=br, name='ChimneyRim', cap_bottom=False, cap_top=False)
    rim.location = chim.location
    parts.append(rim)
    # whistle and safety valve (small brass bits)
    wh = pk.geo.lathe([(0.03, 0.0), (0.03, 0.08), (0.05, 0.1), (0.05, 0.16), (0.0, 0.17)],
                      segments=16, material=br, name='Whistle')
    wh.location = (0.0, 1.2, zc + R - 0.01)
    parts.append(wh)
    # handrails on stanchions
    for side in (-1, 1):
        a = math.radians(48)
        x = side * (R + 0.06) * math.sin(a)
        z = zc + (R + 0.06) * math.cos(a)
        rail = pk.geo.tube_along([(x, 0.3, z), (x, 2.6, z)], radius=0.012, segments=10, material=br,
                                 name='Handrail')
        parts.append(rail)
        for yy in (0.6, 1.6, 2.5):
            st = pk.geo.tube_along([(x * 0.93, yy, z - 0.04 * 0.7), (x, yy, z)], radius=0.008,
                                   segments=8, material=br, name='Stanchion')
            parts.append(st)
    # running board, valance, buffer beam, buffers, lamps
    fz = zc - R * 0.45
    fp = pk.geo.rounded_box((1.5, 3.4, 0.06), radius=0.02, segments=2, material=black,
                            name='Footplate', location=(0.0, 1.6, fz))
    parts.append(fp)
    for side in (-1, 1):
        val = pk.geo.rounded_box((0.04, 3.4, 0.16), radius=0.015, segments=2, material=red,
                                 name='Valance', location=(side * 0.75, 1.6, fz - 0.16))
        parts.append(val)
    beam = pk.geo.rounded_box((1.62, 0.12, 0.3), radius=0.03, segments=2, material=red,
                              name='BufferBeam', location=(0.0, 3.32, fz - 0.24))
    parts.append(beam)
    for side in (-1, 1):
        bu = pk.geo.lathe([(0.05, 0.0), (0.05, 0.12), (0.09, 0.13), (0.09, 0.16), (0.0, 0.165)],
                          segments=24, material=br, name='Buffer')
        bu.location = (side * 0.55, 3.38, fz - 0.1)
        along_y(bu)
        parts.append(bu)
        lamp = pk.geo.lathe([(0.0, 0.0), (0.06, 0.0), (0.07, 0.1), (0.06, 0.16), (0.0, 0.18)],
                            segments=20, material=black, name='LampBody')
        lamp.location = (side * 0.62, 3.25, fz + 0.03)
        parts.append(lamp)
        lens = pk.geo.lathe([(0.0, 0.0), (0.045, 0.0), (0.045, 0.01)], segments=20,
                            material=glow((1.0, 0.75, 0.45), 40.0, 'BR_HeadLens'), name='HeadLens',
                            cap_bottom=False)
        lens.location = (side * 0.62, 3.31, fz + 0.1)
        along_y(lens)
        parts.append(lens)
    for p in parts:
        pk.vehicle.attach(p, cam)
    # soft cool fill so the boiler reads (light-linked to the loco only)
    pk.vehicle.cabin_light(cam, location=(0.0, 1.0, zc + R + 1.2), target=(0.0, 2.2, zc + R),
                           size=(1.6, 1.0), color=(0.35, 0.5, 1.0), energy=CAB_FILL, receivers=parts,
                           name='CabFill')
    # broad warm sheen from ahead and above (the lit town): a soft glossy highlight runs along
    # the top of the boiler and catches the bands, dome ring and chimney lip
    pk.vehicle.cabin_light(cam, location=(0.0, 9.0, zc + R + 1.6), target=(0.0, 2.0, zc + R),
                           size=(5.0, 1.6), color=(1.0, 0.62, 0.32), energy=CAB_SHEEN, receivers=parts,
                           name='CabRim')
    # cool moonlit rim from behind-left on the boiler's left flank and the handrail
    pk.vehicle.cabin_light(cam, location=(-2.6, 0.2, zc + R + 0.8), target=(0.0, 2.0, zc),
                           size=(1.2, 2.0), color=(0.55, 0.7, 1.0), energy=CAB_COOL, receivers=parts,
                           name='CabCool')
    # headlamp: a warm pool on the rails and ties ahead (moves with the train)
    hl = pk.lights.spot((0.0, 3.4, fz + 0.1), (0.0, 12.0, -EYE), (1.0, 0.72, 0.45), HEADLAMP,
                        angle_deg=38, blend=0.7, radius=0.05, shadow=False, name='Headlamp', volume=0.2)
    hl.parent = rig
    hl.matrix_parent_inverse = Matrix.Identity(4)
    hl.location = (0.0, 3.4, fz + 0.1)
    hl.rotation_euler = (Vector((0.0, 14.0, -EYE)) - Vector((0.0, 3.4, fz + 0.1))).to_track_quat('-Z', 'Y').to_euler()
    pk.mark_moving(hl)
    return parts


def build_track(ctx, coll):
    path = ctx.path
    s0, s1 = 40.0 - 14.0, ctx.track_end
    ss = np.arange(s0, s1, 0.5)
    rail_m = nickel()
    G = 0.42
    prof = [(-0.07, 0.0), (0.07, 0.0), (0.07, 0.12), (0.045, 0.2), (0.0, 0.215), (-0.045, 0.2), (-0.07, 0.12)]
    for lat, z0, nm in ((-G, 0.1, 'RailL'), (G, 0.1, 'RailR'), (0.0, 0.08, 'RailC')):
        pts = [tuple(path.offset(float(s), lat, z0)) for s in ss]
        sc = 1.0 if nm != 'RailC' else 0.8
        o = pk.geo.sweep(pts, [(x * sc, z * sc) for x, z in prof], material=rail_m, name=nm,
                         collection=coll, caps=True)
        o.data.set_sharp_from_angle(angle=math.radians(50))
    tie_m = tin_paint((0.03, 0.035, 0.09), 'BR_TieTin', rough=0.3, coat=0.4, wear=0.5)
    tie = pk.geo.rounded_box((1.5, 0.34, 0.1), radius=0.04, segments=2, material=tie_m, name='Tie',
                             collection=coll)
    pts, yaws = [], []
    s = s0
    while s < s1:
        pts.append(tuple(path.offset(s, 0.0, 0.0)))
        yaws.append(-path.heading(s))
        s += 1.1
    pk.geo.scatter(tie, pts, seed=1, scale=1.0, rot_z=False, name='Ties', collection=coll, align=yaws)
    # buffer stop at the end
    e = ctx.track_end
    bs = pk.geo.rounded_box((1.7, 0.5, 1.2), radius=0.08, segments=2,
                            material=tin_paint((0.45, 0.03, 0.02), 'BR_StopRed'), name='BufferStop',
                            location=tuple(path.offset(e + 0.4, 0, 0.0)), collection=coll)
    bs.rotation_euler.z = -math.radians(path.heading(e))
    pk.geo.lathe([(0.0, 0.0), (0.12, 0.0), (0.12, 0.1), (0.0, 0.12)], segments=16,
                 material=glow((1.0, 0.1, 0.05), 60.0, 'BR_StopLamp'), name='StopLamp',
                 location=tuple(path.offset(e + 0.2, 0, 1.3)), collection=coll)


# round 3: more kraft cardboard and deep blues / teals, only one plum (the violets merged into
# one purple haze)
BOX_COLORS = [(0.40, 0.25, 0.13), (0.06, 0.16, 0.55), (0.36, 0.22, 0.11), (0.05, 0.11, 0.42),
              (0.46, 0.3, 0.16), (0.03, 0.22, 0.28), (0.42, 0.09, 0.1), (0.12, 0.3, 0.27),
              (0.04, 0.05, 0.2), (0.33, 0.2, 0.1)]
BOX_COLORS += [(0.03, 0.12, 0.38), (0.02, 0.2, 0.45), (0.2, 0.06, 0.3)]
ROOF_COLORS = [(0.5, 0.06, 0.08), (0.05, 0.32, 0.36), (0.32, 0.12, 0.45), (0.06, 0.12, 0.5),
               (0.6, 0.32, 0.06), (0.38, 0.24, 0.12)]
BLOCK_COLORS = [(0.6, 0.06, 0.04), (0.75, 0.48, 0.03), (0.04, 0.16, 0.6), (0.05, 0.38, 0.16),
                (0.45, 0.28, 0.13), (0.45, 0.28, 0.13), (0.35, 0.1, 0.5)]


PAPER_COLORS = [(0.75, 0.08, 0.06), (0.85, 0.55, 0.04), (0.06, 0.25, 0.75), (0.05, 0.5, 0.25),
                (0.6, 0.12, 0.55), (0.85, 0.75, 0.6)]


def wire_mat():
    """Dark green PVC flex for the light strings (a metal wire caught the lamps as long
    bright lines on the floor)."""
    return pk.mat.basic((0.015, 0.03, 0.02), roughness=0.6, name='BR_Wire')


def tape_mat():
    m, nt, out = pk._new_mat('BR_Tape')
    co = pk.texcoord(nt, 'Object')
    nf, _ = pk.noise(nt, co, scale=12.0, detail=4.0)
    col = pk.vmath(nt, 'SCALE', (0.62, 0.52, 0.34), scale=pk.maprange(nt, nf, 0.3, 0.7, 0.85, 1.08))
    nrm = pk.bump(nt, nf, strength=0.1, distance=0.005)
    p = pk._principled(nt, base=col, rough=0.42, normal=nrm, spec=0.5, sss=0.2, sss_radius=(0.5, 0.4, 0.2),
                       sss_scale=0.02)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.62, 0.52, 0.34), rough=0.42)
    return m


def paper_mat(color, name):
    m, nt, out = pk._new_mat(name)
    co = pk.texcoord(nt, 'Object')
    nf, _ = pk.noise(nt, co, scale=8.0, detail=3.0)
    col = pk.vmath(nt, 'SCALE', color, scale=pk.maprange(nt, nf, 0.3, 0.7, 0.85, 1.1))
    p = pk._principled(nt, base=col, rough=0.7, spec=0.3, sss=0.3, sss_radius=(1.0, 0.6, 0.4), sss_scale=0.05)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.7)
    return m


def stripe_mat(c1, c2, name=None):
    m, nt, out = pk._new_mat(name or 'BR_Stripe_%d_%d' % (int(c1[0] * 99), int(c2[2] * 99)))
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    st = pk.math_(nt, 'GREATER_THAN', pk.math_(nt, 'FRACT', pk.math_(nt, 'MULTIPLY', x, 2.6)), 0.5)
    col = pk.mix_col(nt, st, c1, c2)
    p = pk._principled(nt, base=col, rough=0.65, spec=0.3, sss=0.25, sss_radius=(1.0, 0.6, 0.4), sss_scale=0.05)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=c1, rough=0.65)
    return m


def bunting(p0, p1, coll, name, n=14, sag=1.2, rng=None):
    """A string of paper pennants (triangles) between two points."""
    p0, p1 = Vector(p0), Vector(p1)
    wm = cached('wire', wire_mat)
    pts = []
    for i in range(31):
        t = i / 30
        q = p0.lerp(p1, t)
        q.z -= sag * 4 * t * (1 - t)
        pts.append(q)
    pk.geo.tube_along([tuple(q) for q in pts], radius=0.02, segments=5, material=wm, name=name + 'Cord',
                      collection=coll)
    along = (p1 - p0).normalized()
    mats = [cached('paper%d' % i, lambda i=i: paper_mat(PAPER_COLORS[i], 'BR_Paper%d' % i))
            for i in range(len(PAPER_COLORS))]
    verts, faces, mi = [], [], []
    for i in range(n):
        t = (i + 0.5) / n
        q = p0.lerp(p1, t)
        q.z -= sag * 4 * t * (1 - t)
        tw = 0.45
        a = q - along * tw
        b = q + along * tw
        c = q + Vector((0, 0, -0.95))
        k = len(verts)
        verts += [tuple(a), tuple(b), tuple(c)]
        faces.append((k, k + 1, k + 2))
        mi.append(i % len(mats))
    ob = pk.mesh_object(name, verts, faces, materials=mats, mat_index=mi, smooth=False, collection=coll)
    return ob


def box_mats(rng):
    i = rng.randrange(len(BOX_COLORS))
    c = BOX_COLORS[i]
    painted = i >= 3
    return cached('box%d' % i, lambda: cardboard(c, 'BR_Card%d' % i, painted=painted))


def roof_mat(rng):
    i = rng.randrange(len(ROOF_COLORS))
    return cached('roof%d' % i, lambda: cardboard(ROOF_COLORS[i], 'BR_Roof%d' % i, painted=True))


def win_mats():
    g = cached('boxwin', lambda: box_window_mat('BR_BoxWindow', strength=WIN_GLOW))
    r = cached('boxrim', lambda: cardboard((0.55, 0.36, 0.2), 'BR_CutEdge'))
    return g, r


def box_house(ctx, pos, yaw, w, d, h, rng, coll, name, side_windows=True, door=True, tall_ok=True):
    """Cardboard-box house: body, gable or open-flap roof, cut-out windows lit by fairy lights,
    a cut door folded open, a paper-tube chimney. Local front = -Y."""
    body_m = box_mats(rng)
    body = pk.geo.rounded_box((w, d, h), radius=0.1, segments=2, material=body_m, name=name,
                              collection=coll)
    set_xform(body, pos, yaw)
    kind = rng.choice(['rect', 'rect', 'arch', 'arch', 'round'])
    ww = rng.uniform(0.6, 0.92)
    wh = ww * (1.0 if kind == 'round' else rng.uniform(1.25, 1.6))
    specs = []
    cols = max(1, int((w - 0.6) / (ww + 0.65)))
    rows = max(1, int((h - 1.0) / (wh + 0.75)))
    gx = (w - cols * ww) / (cols + 1)
    z0 = 1.0 if not door else 1.2
    gz = (h - z0 - rows * wh) / max(rows, 1)
    for r_ in range(rows):
        for c in range(cols):
            x = -w / 2 + gx * (c + 1) + ww * c + ww / 2
            z = z0 + r_ * (wh + gz) + gz * 0.3
            if door and r_ == 0 and cols >= 2 and c == cols // 2:
                continue
            M = Matrix.Translation((x, -d / 2, z))
            specs.append((M, kind, ww, wh))
    if door:
        dw = rng.uniform(1.0, 1.4)
        dh = dw * 1.7
        dx = 0.0 if cols % 2 == 1 or cols < 2 else rng.uniform(-0.5, 0.5)
        if cols >= 2:
            dx = -w / 2 + gx * (cols // 2 + 1) + ww * (cols // 2) + ww / 2
        specs.append((Matrix.Translation((dx, -d / 2, 0.02)), 'arch', dw, dh))
        flap = pk.geo.rounded_box((dw, 0.08, dh * 0.92), radius=0.03, segments=1, material=body_m,
                                  name=name + 'Door', collection=coll, edges=False)
        flap.parent = body
        flap.location = (dx + dw / 2, -d / 2 - 0.04, 0.02)
        flap.rotation_euler = (0, 0, math.radians(-70))
        flap.location = (dx + dw / 2 - 0.0, -d / 2, 0.02)
        # the flap swings out around its hinge (right edge of the door)
        flap.data.transform(Matrix.Translation((-dw / 2, 0, 0)))
    if side_windows:
        # windows on the side that faces the oncoming train (local -X)
        scols = max(1, int((d - 0.8) / (ww + 1.0)))
        for r_ in range(rows):
            for c in range(scols):
                y = -d / 2 + (d / (scols + 1)) * (c + 1)
                z = z0 + r_ * (wh + gz) + gz * 0.3
                M = Matrix.Translation((-w / 2, y, z)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
                specs.append((M, kind, ww, wh))
                M = Matrix.Translation((w / 2, y, z)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
                specs.append((M, kind, ww, wh))
        # and the back, so a box seen from any side is lived in
        for r_ in range(rows):
            for c in range(cols):
                x = -w / 2 + gx * (c + 1) + ww * c + ww / 2
                z = z0 + r_ * (wh + gz) + gz * 0.3
                M = Matrix.Translation((x, d / 2, z)) @ Matrix.Rotation(math.pi, 4, 'Z')
                specs.append((M, kind, ww, wh))
    g, rmat = win_mats()
    wob = add_windows(name + 'Win', specs, g, rmat, coll, rng, lit_fraction=0.86)
    set_xform(wob, (0, 0, 0), 0.0, parent=body)
    # roof
    if rng.random() < 0.62:
        rh = rng.uniform(0.35, 0.6) * min(w, d)
        bm = prism_bm(w, d, rh, overhang=0.35, thick=0.16)
        roof = obj_from_bm(bm, name + 'Roof', roof_mat(rng), coll, sharp=50)
        set_xform(roof, (0, 0, h), 0.0, parent=body)
        top = h + rh * 0.55
    else:
        for k, (ax, sgn) in enumerate((('x', -1), ('x', 1), ('y', -1), ('y', 1))):
            L = w if ax == 'y' else d
            fh = rng.uniform(0.35, 0.5) * (d if ax == 'y' else w) * 0.6
            fl = pk.geo.rounded_box((L - 0.1, 0.08, fh), radius=0.03, segments=1, material=body_m,
                                    name=name + 'Flap', collection=coll, edges=False)
            fl.parent = body
            tilt = math.radians(rng.uniform(25, 60))
            if ax == 'y':
                fl.location = (0, sgn * d / 2, h - 0.02)
                fl.rotation_euler = (sgn * tilt, 0, 0)
            else:
                fl.location = (sgn * w / 2, 0, h - 0.02)
                fl.rotation_euler = (sgn * -tilt, 0, math.pi / 2)
                fl.rotation_euler = (0, sgn * tilt, math.pi / 2)
        top = h
    # small crafted details, from a per-house RNG so the town layout stays put
    dr = random.Random(zlib.crc32(name.encode()))
    if dr.random() < 0.55:
        bi = dr.randrange(len(PAPER_COLORS))
        bm_ = cached('paper%d' % bi, lambda: paper_mat(PAPER_COLORS[bi], 'BR_Paper%d' % bi))
        band = pk.geo.rounded_box((w + 0.08, d + 0.08, 0.3), radius=0.04, segments=1, material=bm_,
                                  name=name + 'Trim', collection=coll, edges=False)
        set_xform(band, (0, 0, h - 0.34), 0.0, body)
    if door and dr.random() < 0.7:
        ai, bi = dr.sample(range(len(PAPER_COLORS)), 2)
        am = cached('stripe%d%d' % (ai, bi), lambda: stripe_mat(PAPER_COLORS[ai], PAPER_COLORS[bi]))
        dxw = specs[-1][0].translation.x if specs else 0.0
        aw = pk.geo.rounded_box((1.9, 1.3, 0.07), radius=0.03, segments=1, material=am, name=name + 'Awning',
                                collection=coll, edges=False)
        set_xform(aw, (dxw, -d / 2 - 0.6, 2.35), 0.0, body)
        aw.rotation_euler.x = math.radians(-24)
    if rows >= 2 and dr.random() < 0.45:
        bw = min(w * 0.6, 3.2)
        zb = z0 + (wh + gz) - 0.15
        sm_ = cached('stick', lambda: pk.mat.painted_wood((0.6, 0.45, 0.25), name='BR_Stick', wear=0.1))
        ledge = pk.geo.rounded_box((bw, 0.9, 0.12), radius=0.03, segments=1, material=body_m,
                                   name=name + 'Balcony', collection=coll, edges=False)
        set_xform(ledge, (0.0, -d / 2 - 0.45, zb), 0.0, body)
        xs_ = np.linspace(-bw / 2 + 0.06, bw / 2 - 0.06, max(3, int(bw / 0.35)))
        for x in xs_:
            post = pk.geo.tube_along([(x, -d / 2 - 0.85, zb + 0.12), (x, -d / 2 - 0.85, zb + 0.75)], radius=0.03,
                                     segments=5, material=sm_, name=name + 'Rail', collection=coll)
            post.parent = body
        rail = pk.geo.tube_along([(xs_[0], -d / 2 - 0.85, zb + 0.75), (xs_[-1], -d / 2 - 0.85, zb + 0.75)],
                                 radius=0.04, segments=6, material=sm_, name=name + 'Rail', collection=coll)
        rail.parent = body
    if dr.random() < 0.3:
        for k in range(3):
            st = pk.geo.rounded_box((1.0, 1.0, 0.55 * (k + 1)), radius=0.08, segments=2,
                                    material=block_mat(dr.randrange(len(BLOCK_COLORS))), name=name + 'Stair',
                                    collection=coll)
            set_xform(st, (-w / 2 - 0.55, -d / 2 + 0.55 + k * 1.0, 0.0), 0.0, body)
    if rng.random() < 0.55:
        tm = cached('tape', lambda: tape_mat())
        tw = w * rng.uniform(0.5, 0.85)
        tx = rng.uniform(-(w - tw) / 2, (w - tw) / 2)
        t1 = pk.geo.rounded_box((tw, 0.04, 0.55), radius=0.015, segments=1, material=tm, name=name + 'Tape',
                                collection=coll, edges=False)
        set_xform(t1, (tx, -d / 2 - 0.025, h - 0.55), 0.0, body)
        if rng.random() < 0.5:
            t2 = pk.geo.rounded_box((0.55, 0.04, h * rng.uniform(0.3, 0.6)), radius=0.015, segments=1,
                                    material=tm, name=name + 'Tape', collection=coll, edges=False)
            set_xform(t2, (-w / 2 + 0.3, -d / 2 - 0.025, h * 0.35), 0.0, body)
    if rng.random() < 0.3:
        pole = pk.geo.tube_along([(0, 0, 0), (0, 0, 2.4)], radius=0.035, segments=6,
                                 material=cached('stick', lambda: pk.mat.painted_wood((0.6, 0.45, 0.25), name='BR_Stick', wear=0.1)),
                                 name=name + 'Pole', collection=coll)
        set_xform(pole, (rng.uniform(-w / 3, w / 3), 0.0, top - 0.1), 0.0, body)
        fi = rng.randrange(len(PAPER_COLORS))
        fm = cached('paper%d' % fi, lambda: paper_mat(PAPER_COLORS[fi], 'BR_Paper%d' % fi))
        fl = pk.mesh_object(name + 'Flag', [(0, 0, 2.35), (1.1, 0.0, 2.1), (0, 0, 1.75)], [(0, 1, 2)],
                            material=fm, smooth=False, collection=coll)
        fl.parent = pole
    if rng.random() < 0.45:
        cm = cached('tube', lambda: cardboard((0.5, 0.33, 0.18), 'BR_Tube'))
        ch = pk.geo.lathe([(0.42, 0.0), (0.42, 2.0), (0.38, 2.04), (0.0, 2.04)], segments=20,
                          material=cm, name=name + 'Chimney', collection=coll)
        ch.parent = body
        ch.location = (rng.uniform(-w / 4, w / 4), rng.uniform(-d / 5, d / 5), top - 0.6)
    return body


BLOCK_MESHES = {}


def block_mesh(kind):
    if kind in BLOCK_MESHES:
        return BLOCK_MESHES[kind]
    if kind == 'cube':
        ob = pk.geo.rounded_box((1.6, 1.6, 1.6), radius=0.12, segments=3, name='BlkCube')
    elif kind == 'brick':
        ob = pk.geo.rounded_box((3.2, 1.6, 0.8), radius=0.1, segments=3, name='BlkBrick')
    elif kind == 'pillar':
        ob = pk.geo.lathe([(0.7, 0.0), (0.78, 0.06), (0.78, 3.14), (0.7, 3.2), (0.0, 3.2)], segments=24,
                          name='BlkPillar')
    elif kind == 'plank':
        ob = pk.geo.rounded_box((4.8, 1.6, 0.6), radius=0.1, segments=3, name='BlkPlank')
    elif kind == 'roof':
        bm = prism_bm(1.6, 1.6, 1.2, overhang=0.0, thick=0.6)
        ob = obj_from_bm(bm, 'BlkRoof', None, None, sharp=50)
    elif kind == 'cone':
        ob = pk.geo.lathe([(0.8, 0.0), (0.75, 0.08), (0.08, 1.9), (0.0, 1.95)], segments=24,
                          name='BlkCone')
    elif kind == 'arch':
        bm = bmesh.new()
        n = 10
        outer = [(-1.6, 0.0)] + [(-1.6, 1.6)] + [(1.6, 1.6), (1.6, 0.0), (0.8, 0.0)] + \
                [(0.8 * math.cos(math.pi * i / n), 0.8 * math.sin(math.pi * i / n)) for i in range(1, n)] + [(-0.8, 0.0)]
        bm.free()
        bm = polygon_bm([(x, z) for (x, z) in outer], thick=1.6)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0.8, 0))
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.08, segments=2, affect='EDGES', clamp_overlap=True)
        ob = obj_from_bm(bm, 'BlkArch', None, None, sharp=50)
    ob.hide_render = True
    ob['pk_noexport'] = True
    BLOCK_MESHES[kind] = ob
    return ob


def block_obj(kind, mat_, coll, name, loc, yaw=0.0, parent=None):
    src = block_mesh(kind)
    me = src.data.copy()
    me.materials.clear()
    me.materials.append(mat_)
    ob = bpy.data.objects.new(name, me)
    pk._link(ob, coll)
    set_xform(ob, loc, yaw, parent)
    return ob


def block_mat(i):
    c = BLOCK_COLORS[i]
    return cached('blk%d' % i, lambda: pk.mat.painted_wood(c, name='BR_Block%d' % i, wear=0.45,
                                                           roughness=0.38))


def block_tower(ctx, pos, yaw, rng, coll, name, levels=None):
    """A child's block tower: base of bricks, columns, arches, a roof or cone on top."""
    root = bpy.data.objects.new(name, None)
    pk._link(root, coll)
    set_xform(root, pos, yaw)
    levels = levels or rng.randint(4, 8)
    z = 0.0
    for lv in range(levels):
        mi = rng.randrange(len(BLOCK_COLORS))
        m_ = block_mat(mi)
        if lv == 0:
            block_obj('brick', m_, coll, name + 'B', (0, 0, z), 0, root)
            z += 0.8
            continue
        k = rng.random()
        if k < 0.3:
            block_obj('pillar', m_, coll, name + 'P', (-0.8, 0, z), 0, root)
            block_obj('pillar', block_mat(rng.randrange(len(BLOCK_COLORS))), coll, name + 'P', (0.8, 0, z), 0, root)
            z += 3.2
            block_obj('brick', block_mat(rng.randrange(len(BLOCK_COLORS))), coll, name + 'B', (0, 0, z), 0, root)
            z += 0.8
        elif k < 0.5:
            block_obj('arch', m_, coll, name + 'A', (0, 0, z), 0, root)
            z += 1.6
        elif k < 0.75:
            block_obj('cube', m_, coll, name + 'C', (rng.uniform(-0.6, 0.6), 0, z), rng.uniform(-0.3, 0.3), root)
            z += 1.6
        else:
            block_obj('brick', m_, coll, name + 'B', (0, 0, z), rng.uniform(-0.15, 0.15), root)
            z += 0.8
    top = rng.choice(['roof', 'cone', 'cube'])
    block_obj(top, block_mat(rng.randrange(len(BLOCK_COLORS))), coll, name + 'T', (0, 0, z), 0, root)
    return root, z


def lamp_post(ctx, s, side, color, coll, idx, lat=2.3, h=3.7, light=True):
    path = ctx.path
    base = path.offset(s, side * lat, 0.0)
    m_ = cached('lampgreen', lambda: tin_paint((0.02, 0.09, 0.06), 'BR_LampTin', rough=0.3, coat=0.6, wear=0.5))
    pk.geo.lathe([(0.0, 0.0), (0.42, 0.0), (0.42, 0.08), (0.3, 0.14), (0.12, 0.3), (0.07, 0.4),
                  (0.07, h - 0.4), (0.12, h - 0.3), (0.0, h - 0.25)], segments=18, material=m_,
                 name='LampPost%d' % idx, location=tuple(base), collection=coll)
    # lantern head: cap, glowing globe
    cap = pk.geo.lathe([(0.0, 0.0), (0.28, 0.0), (0.36, 0.06), (0.1, 0.32), (0.04, 0.45), (0.0, 0.46)],
                       segments=18, material=m_, name='LampCap%d' % idx, collection=coll,
                       location=tuple(base + Vector((0, 0, h + 0.42))))
    gm = glow(color, 2.6)
    pk.geo.lathe([(0.0, 0.0), (0.14, 0.02), (0.24, 0.16), (0.24, 0.3), (0.18, 0.42), (0.0, 0.44)],
                 segments=18, material=gm, name='LampGlobe%d' % idx, collection=coll,
                 location=tuple(base + Vector((0, 0, h - 0.04))))
    if light:
        lp = base + Vector((0, 0, h + 0.15))
        pk.lights.spot(tuple(lp), tuple(lp + Vector((0, 0, -4.0)) - path.right(s) * side * 1.0), color,
                       220.0, angle_deg=130, blend=0.8, radius=0.15, shadow=False,
                       name='LampSpot%d' % idx, collection=coll, volume=0.15)
        pk.lights.point(tuple(lp), color, 35.0, radius=0.2, shadow=False, name='LampPt%d' % idx,
                        collection=coll, volume=0.1)


BULBS = {}                # floor-string bulb centres by object name (card_check)


def floor_string(points, coll, name, colors, count, strength=180.0, bulb_r=0.11, light_every=0,
                 light_energy=6.0, z=0.12):
    """A fairy-light string lying on the floor along a polyline (bulbs reflect in the varnish)."""
    P = [Vector(p) for p in points]
    L = [0.0]
    for i in range(1, len(P)):
        L.append(L[-1] + (P[i] - P[i - 1]).length)
    tot = L[-1]

    def at(d):
        for i in range(1, len(P)):
            if L[i] >= d:
                f = (d - L[i - 1]) / max(L[i] - L[i - 1], 1e-6)
                return P[i - 1].lerp(P[i], f)
        return P[-1]
    wm = cached('wire', wire_mat)
    pk.geo.tube_along([tuple(p + Vector((0, 0, z * 0.4))) for p in P], radius=0.025, segments=5,
                      material=wm, name=name + 'Wire', collection=coll)
    mats = [glow(c, strength) for c in colors]
    bm = bmesh.new()
    pos = []
    for i in range(count):
        d = tot * (i + 0.5) / count
        p = at(d) + Vector((0, 0, z))
        pos.append(p)
        ret = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=bulb_r)
        for v in ret['verts']:
            v.co += p
        for f in {f for v in ret['verts'] for f in v.link_faces}:
            f.material_index = i % len(colors)
    ob = obj_from_bm(bm, name + 'Bulbs', None, coll, sharp=None, edges=False, materials=mats)
    ob.visible_shadow = False
    BULBS[ob.name] = (pos, bulb_r)
    if light_every:
        for i in range(0, count, light_every):
            pk.lights.point(tuple(pos[i] + Vector((0, 0, 0.15))), colors[i % len(colors)], light_energy,
                            radius=0.1, shadow=False, name=name + 'L', collection=coll, volume=0.0)
    return ob


def bulb_string(p0, p1, coll, name, colors, count, sag=1.0, strength=200.0, bulb_r=0.12,
                light_every=0, light_energy=20.0):
    return pk.geo.string_lights(tuple(p0), tuple(p1), sag=sag, count=count, colors=colors,
                                strength=strength, bulb_radius=bulb_r, wire_radius=0.025,
                                light_every=light_every, light_energy=light_energy, light_radius=0.1,
                                name=name, collection=coll, wire_material=cached('wire', wire_mat))


# ------------------------------------------------------------------ glow-in-the-dark stickers
def star_outline(r, inner=0.45, n=5, rot=0.0):
    pts = []
    for i in range(2 * n):
        a = math.pi / 2 + rot + math.pi * i / n
        rr = r if i % 2 == 0 else r * inner
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts


def moon_outline(r, rot=0.0, n=24):
    pts = []
    for i in range(n + 1):
        a = -math.pi / 2 + math.pi * i / n
        pts.append((r * math.cos(a), r * math.sin(a)))
    for i in range(n, -1, -1):
        a = -math.pi / 2 + math.pi * i / n
        pts.append((r * 0.45 * math.cos(a) - 0.0 * r, r * 0.92 * math.sin(a)))
    c, s_ = math.cos(rot), math.sin(rot)
    return [(x * c - y * s_, x * s_ + y * c) for (x, y) in pts]


def disc_outline(r, n=24, cx=0.0, cy=0.0, sx=1.0, sy=1.0):
    return [(cx + r * sx * math.cos(2 * math.pi * i / n), cy + r * sy * math.sin(2 * math.pi * i / n))
            for i in range(n)]


def sticker_bm(kind, size, rng):
    """Returns a bmesh of a flat sticker (XZ plane, facing -Y, origin at centre)."""
    bm = bmesh.new()

    def add(outline, th=0.1):
        sub = polygon_bm(outline, thick=th)
        me = bpy.data.meshes.new('tmp')
        sub.to_mesh(me)
        sub.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    if kind == 'star':
        add(star_outline(size, inner=rng.uniform(0.42, 0.5), rot=rng.uniform(-0.4, 0.4)))
    elif kind == 'moon':
        add(moon_outline(size, rot=rng.uniform(-0.8, 0.8)))
    elif kind == 'planet':
        add(disc_outline(size * 0.55))
        ring = []
        n = 32
        for i in range(n):
            a = 2 * math.pi * i / n
            ring.append((size * math.cos(a), size * 0.28 * math.sin(a)))
        inner = [(size * 0.78 * math.cos(2 * math.pi * i / n), size * 0.18 * math.sin(2 * math.pi * i / n))
                 for i in range(n)]
        # ring as a band of quads
        sub = bmesh.new()
        o = [sub.verts.new((x, -0.12, z)) for (x, z) in ring]
        ii = [sub.verts.new((x, -0.12, z)) for (x, z) in inner]
        for i in range(n):
            j = (i + 1) % n
            if math.sin(2 * math.pi * (i + 0.5) / n) > 0.1:   # back half hidden behind the disc
                continue
            sub.faces.new((o[i], o[j], ii[j], ii[i]))
        me = bpy.data.meshes.new('tmp')
        sub.to_mesh(me)
        sub.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        ang = rng.uniform(-0.5, 0.5)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, 'Y'))
    elif kind == 'comet':
        add(star_outline(size * 0.5, inner=0.5))
        tail = [(size * 0.25, size * 0.12), (size * 2.6, size * 0.5), (size * 2.4, size * 0.25),
                (size * 2.8, size * 0.0), (size * 2.4, -size * 0.25), (size * 2.6, -size * 0.5),
                (size * 0.25, -size * 0.12)]
        add(tail, th=0.08)
        ang = rng.uniform(0.3, 0.9)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, 'Y'))
    return bm


def build_stickers(ctx, coll, rng):
    """Phosphor star stickers scattered on the far wall and the ceiling (the neon motif)."""
    cols = [PHOSPHOR] * 5 + [(0.3, 1.0, 0.75), (0.55, 1.0, 0.4)]
    mats = [glow(c, 2.4, 'BR_Sticker%d' % i) for i, c in enumerate(cols)]
    wx0, wx1 = ctx.win_x0, ctx.win_x1
    placed = []

    def free(x, z, r):
        for (px, pz, pr) in placed:
            if (px - x) ** 2 + (pz - z) ** 2 < (pr + r + 0.8) ** 2:
                return False
        return True
    # wall
    n = 0
    tries = 0
    while n < 34 and tries < 3000:
        tries += 1
        x = rng.uniform(wx0 - 70, wx1 + 70)
        z = rng.uniform(14, CEIL - 2.5)
        size = rng.choice([1.2, 1.6, 2.0, 2.6, 3.2, 4.2, 5.5])
        if wx0 - 15 < x < wx1 + 15 and z > WIN_Z0 - 2:
            continue
        if not free(x, z, size):
            continue
        kind = rng.choices(['star', 'moon', 'planet', 'comet'], [0.72, 0.1, 0.1, 0.08])[0]
        bm = sticker_bm(kind, size, rng)
        mi = rng.randrange(len(mats))
        ob = obj_from_bm(bm, 'StickerW', mats[mi], coll, smooth=False, edges=False)
        ob.location = (x, WALL_Y - 0.06, z)
        ob.visible_shadow = False
        placed.append((x, z, size * (2.6 if kind == 'comet' else 1.0)))
        n += 1
    # above the window (between head and ceiling)
    for i in range(7):
        x = wx0 + (wx1 - wx0) * (i + 0.5) / 7 + rng.uniform(-1.5, 1.5)
        z = rng.uniform(WIN_Z1 + 3.5, CEIL - 2.0)
        bm = sticker_bm('star', rng.choice([0.9, 1.2, 1.5]), rng)
        ob = obj_from_bm(bm, 'StickerH', mats[rng.randrange(len(mats))], coll, smooth=False, edges=False)
        ob.location = (x, WALL_Y - 0.06, z)
    # ceiling
    placed2 = []
    for i in range(70):
        x = rng.uniform(-60, 100)
        y = rng.uniform(20, WALL_Y - 2)
        size = rng.choice([1.2, 1.6, 2.0, 2.6, 3.4, 4.5])
        if any((px - x) ** 2 + (py - y) ** 2 < (pr + size + 1.0) ** 2 for px, py, pr in placed2):
            continue
        kind = rng.choices(['star', 'moon', 'planet', 'comet'], [0.75, 0.1, 0.08, 0.07])[0]
        bm = sticker_bm(kind, size, rng)
        ob = obj_from_bm(bm, 'StickerC', mats[rng.randrange(len(mats))], coll, smooth=False, edges=False)
        ob.location = (x, y, CEIL - 0.06)
        ob.rotation_euler = (math.pi / 2, 0, rng.uniform(0, 6.28))
        ob.visible_shadow = False
        placed2.append((x, y, size))


# ------------------------------------------------------------------ curtains, rod, rod lights
def curtain(ctx, coll, x_in, x_out, name, rng, mat_):
    """Velvet drape from the rod to the floor, folded, pinched by a tieback."""
    nu, nv = 48, 60
    top = CEIL - 4.0
    ztb = 26.0
    verts, faces = [], []
    folds = 7
    ph = rng.uniform(0, 6.28)
    for j in range(nv + 1):
        v = j / nv
        z = top - v * top
        pinch = 1.0 - 0.6 * math.exp(-((z - ztb) / 10.0) ** 2)
        if z < ztb:
            pinch = 1.0 - 0.6 * math.exp(-((z - ztb) / 16.0) ** 2)
        for i in range(nu + 1):
            u = i / nu
            x = x_out + (x_in - x_out) * u * pinch
            amp = 0.9 + 0.8 * (1 - pinch) + 0.4 * v
            y = WALL_Y - 3.0 - amp * (0.5 + 0.5 * math.sin(u * folds * 2 * math.pi * (0.6 + 0.4 * pinch) + ph))
            y -= 0.4 * math.sin(v * 3.0 + u * 2.0)
            verts.append((x, y, z))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            faces.append((a, a + 1, a + nu + 2, a + nu + 1))
    ob = pk.mesh_object(name, verts, faces, material=mat_, smooth=True, collection=coll, recalc=False)
    # tieback cord
    cord = cached('cord', lambda: pk.mat.metal((0.9, 0.62, 0.25), roughness=0.35, name='BR_Cord'))
    xc = x_out + (x_in - x_out) * 0.4 * 0.5
    pts = [(x_out + (x_in - x_out) * 0.4 * (0.5 + 0.55 * math.cos(a)), WALL_Y - 3.6 - 1.2 * math.sin(a), ztb)
           for a in np.linspace(0, math.pi, 12)]
    pk.geo.tube_along(pts, radius=0.25, segments=8, material=cord, name=name + 'Tie', collection=coll)
    return ob


def build_window_dressing(ctx, coll, rng):
    wx0, wx1 = ctx.win_x0, ctx.win_x1
    vel = velvet((0.16, 0.05, 0.34), 'BR_Velvet')
    curtain(ctx, coll, wx0 + 5.0, wx0 - 13.0, 'CurtainL', rng, vel)
    curtain(ctx, coll, wx1 - 2.5, wx1 + 13.0, 'CurtainR', rng, vel)
    br = brass()
    rz = CEIL - 3.2
    pk.geo.tube_along([(wx0 - 16, WALL_Y - 3.2, rz), (wx1 + 16, WALL_Y - 3.2, rz)], radius=0.35,
                      segments=14, material=br, name='Rod', collection=coll)
    for x in (wx0 - 16.6, wx1 + 16.6):
        o = pk.geo.lathe([(0.0, -0.9), (0.5, -0.8), (0.9, -0.2), (0.9, 0.2), (0.5, 0.8), (0.0, 0.9)],
                         segments=20, material=br, name='Finial', collection=coll)
        o.location = (x, WALL_Y - 3.2, rz)
    # fairy-light swags along the rod
    xs = np.linspace(wx0 - 15, wx1 + 15, 8)
    for i in range(len(xs) - 1):
        bulb_string((xs[i], WALL_Y - 3.8, rz - 0.3), (xs[i + 1], WALL_Y - 3.8, rz - 0.3), coll, 'RodLights%d' % i,
                    [WARM_WHITE, (1.0, 0.82, 0.55)], 16, sag=3.2, strength=60.0, bulb_r=0.2,
                    light_every=8, light_energy=40.0)
    # strands hanging down beside the curtains
    for k, x in enumerate((wx0 - 14.5, wx0 - 9.0, wx1 + 9.0, wx1 + 14.5)):
        P = [(x + 0.4 * math.sin(z * 0.3), WALL_Y - 4.5, z) for z in np.linspace(rz - 1, 14.0 + 6 * (k % 2), 12)]
        floor_string(P, coll, 'Strand%d' % k, [WARM_WHITE, (1.0, 0.8, 0.5)], 22, strength=50.0,
                     bulb_r=0.18, light_every=0, z=0.0)


# ------------------------------------------------------------------ hero: the dollhouse
def dollhouse(ctx, coll, s, lat, rng, face_to=None, sc=1.0):
    path = ctx.path
    side = 1 if lat > 0 else -1
    base = path.offset(s, lat, 0.0)
    if face_to is not None:
        F = Vector(face_to) - base
        F.z = 0.0
        F.normalize()
    else:
        F = facing_track(path, s, side, 0.45)
    yaw = yaw_facing(F)
    W, D, Hf = 15.0, 8.0, 6.0
    wall = cached('dh_wall', lambda: pk.mat.painted_wood((0.62, 0.42, 0.22), name='BR_DollWall',
                                                        wear=0.3, roughness=0.5, brush_axis='X'))
    trim = cached('dh_trim', lambda: pk.mat.painted_wood((0.75, 0.72, 0.62), name='BR_DollTrim',
                                                        wear=0.3, roughness=0.4))
    roofm = cached('dh_roof', lambda: tin_paint((0.32, 0.05, 0.1), 'BR_DollRoof', rough=0.4, coat=0.3, wear=0.3))
    shut = cached('dh_shut', lambda: pk.mat.painted_wood((0.05, 0.28, 0.32), name='BR_Shutter', wear=0.4,
                                                        roughness=0.45))
    body = pk.geo.rounded_box((W, D, Hf * 2), radius=0.15, segments=3, material=wall, name='DollHouse',
                              collection=coll)
    set_xform(body, base, yaw)
    body.scale = (sc, sc, sc)
    # plinth and floor band
    for z, hh in ((0.0, 0.7), (Hf - 0.25, 0.5)):
        o = pk.geo.rounded_box((W + 0.5, D + 0.5, hh), radius=0.1, segments=2, material=trim,
                               name='DollBand', collection=coll)
        set_xform(o, (0, 0, z), 0.0, body)
    rh = 7.0
    roof = obj_from_bm(prism_bm(W, D, rh, overhang=0.9, thick=0.35), 'DollRoof', roofm, coll, sharp=50)
    set_xform(roof, (0, 0, Hf * 2), 0.0, body)
    # gable front triangle (attic) with round window
    gab = obj_from_bm(polygon_bm([(-D / 2 + 0.1, 0.0), (D / 2 - 0.1, 0.0), (0.0, rh - 0.4)], thick=0.2),
                      'DollGable', wall, coll, sharp=50)
    # gables are on the X ends of the ridge (local +-X faces); the front is -Y, so the attic
    # window goes in a dormer on the front slope instead
    gab.hide_render = True
    dorm = pk.geo.rounded_box((3.2, 3.0, 3.2), radius=0.12, segments=2, material=wall, name='Dormer',
                              collection=coll)
    set_xform(dorm, (0, -D / 2 + 1.2, Hf * 2 + 0.6), 0.0, body)
    dr = obj_from_bm(prism_bm(3.2, 3.0, 1.6, overhang=0.35, thick=0.2), 'DormerRoof', roofm, coll, sharp=50)
    dr.parent = dorm
    dr.location = (0, 0, 3.2)
    dr.rotation_euler = (0, 0, math.pi / 2)
    wm = cached('dh_win', lambda: pk.mat.lit_window((1.0, 0.5, 0.15), strength=16.0, name='BR_DollWindow',
                                                    frame_color=(0.7, 0.66, 0.55), mullions=(2, 3),
                                                    frame_w=0.09, mullion_w=0.05, variation=0.15,
                                                    curtains=0.45, hue_shift=0.03))
    specs = []
    for fl in range(2):
        for c in range(3):
            x = -W / 2 + W * (c + 0.5) / 3
            if fl == 0 and c == 1:
                continue
            specs.append((x, Hf * fl + 1.6, 2.0, 3.0))
    wp = pk.mesh_object('DollWins', [], [], collection=coll)
    verts, faces, uvs, rnd = [], [], [], []
    for (x, z, ww, wh) in specs:
        k = len(verts)
        verts += [(x - ww / 2, -D / 2 - 0.05, z), (x + ww / 2, -D / 2 - 0.05, z),
                  (x + ww / 2, -D / 2 - 0.05, z + wh), (x - ww / 2, -D / 2 - 0.05, z + wh)]
        faces.append((k, k + 1, k + 2, k + 3))
        uvs += [(0, 0), (1, 0), (1, 1), (0, 1)]
        rnd.append(rng.random())
        # shutters and flower box
        for sx in (-1, 1):
            sh = pk.geo.rounded_box((0.9, 0.15, wh), radius=0.05, segments=1, material=shut, name='Shutter',
                                    collection=coll, edges=False)
            set_xform(sh, (x + sx * (ww / 2 + 0.55), -D / 2 - 0.12, z), 0.0, body)
        fb = pk.geo.rounded_box((ww + 0.4, 0.6, 0.45), radius=0.08, segments=1, material=trim,
                                name='FlowerBox', collection=coll)
        set_xform(fb, (x, -D / 2 - 0.35, z - 0.5), 0.0, body)
    # dormer window
    x, z, ww, wh = 0.0, Hf * 2 + 1.0, 1.8, 1.9
    k = len(verts)
    yd = -D / 2 + 1.2 - 1.5 - 0.05
    verts += [(x - ww / 2, yd, z), (x + ww / 2, yd, z), (x + ww / 2, yd, z + wh), (x - ww / 2, yd, z + wh)]
    faces.append((k, k + 1, k + 2, k + 3))
    uvs += [(0, 0), (1, 0), (1, 1), (0, 1)]
    rnd.append(0.3)
    bpy.data.objects.remove(wp)
    wp = pk.mesh_object('DollWins', verts, faces, uvs=uvs, material=wm, smooth=False, collection=coll,
                        attrs={'pk_rand': ('FACE', rnd)})
    set_xform(wp, (0, 0, 0), 0.0, body)
    # door with glowing fan light, porch roof, posts, steps, porch lamp
    door_m = cached('dh_door', lambda: pk.mat.painted_wood((0.04, 0.2, 0.25), name='BR_DollDoor', wear=0.3))
    dd = pk.geo.rounded_box((2.0, 0.3, 3.4), radius=0.08, segments=2, material=door_m, name='DollDoor',
                            collection=coll)
    set_xform(dd, (0, -D / 2 - 0.1, 0.7), 0.0, body)
    fan = pk.mesh_object('DollFan', [(-1.0, -D / 2 - 0.3, 4.15), (1.0, -D / 2 - 0.3, 4.15),
                                     (1.0, -D / 2 - 0.3, 4.75), (-1.0, -D / 2 - 0.3, 4.75)],
                         [(0, 1, 2, 3)], material=glow(AMBER, 30.0), smooth=False, collection=coll)
    set_xform(fan, (0, 0, 0), 0.0, body)
    pr = pk.geo.rounded_box((5.0, 2.6, 0.3), radius=0.1, segments=2, material=roofm, name='PorchRoof',
                            collection=coll)
    set_xform(pr, (0, -D / 2 - 1.3, 5.0), 0.0, body)
    pr.rotation_euler.x = math.radians(-12)
    for px in (-2.2, 2.2):
        po = pk.geo.lathe([(0.18, 0.0), (0.18, 4.9), (0.0, 4.9)], segments=12, material=trim, name='PorchPost',
                          collection=coll)
        set_xform(po, (px, -D / 2 - 2.4, 0.0), 0.0, body)
    for i in range(3):
        st = pk.geo.rounded_box((3.4 - i * 0.4, 1.0 - i * 0.25, 0.25 * (i + 1)), radius=0.05, segments=1,
                                material=trim, name='Step', collection=coll)
        set_xform(st, (0, -D / 2 - 0.6 - (2 - i) * 0.3, 0.0), 0.0, body)
    ch = pk.geo.rounded_box((1.6, 1.6, 4.5), radius=0.1, segments=2, material=roofm, name='DollChimney',
                            collection=coll)
    set_xform(ch, (W / 2 - 3.0, 1.0, Hf * 2 + 2.5), 0.0, body)
    # lights: porch lamp, warm interior spill through the front, uplights
    Mw = body.matrix_world.copy()
    bpy.context.view_layer.update()
    Mw = body.matrix_world.copy()

    def wpt(x, y, z):
        return Mw @ Vector((x, y, z))
    lamp = pk.geo.lathe([(0.0, 0.0), (0.25, 0.0), (0.3, 0.3), (0.2, 0.55), (0.0, 0.6)], segments=14,
                        material=glow(AMBER, 80.0), name='PorchLamp', collection=coll)
    set_xform(lamp, (1.6, -D / 2 - 0.35, 3.9), 0.0, body)
    pk.lights.point(tuple(wpt(1.6, -D / 2 - 0.8, 4.0)), (1.0, 0.55, 0.2), 900.0, radius=0.3, shadow=True,
                    name='PorchLight', collection=coll, volume=0.3)
    for fl in range(2):
        pk.lights.area(tuple(wpt(0, -D / 2 - 0.4, Hf * fl + 3.0)), tuple(wpt(0, -D / 2 - 12.0, -3.0)),
                       size=(W - 1.0, 3.0), color=(1.0, 0.5, 0.16), energy=650.0, shadow=False,
                       name='DollSpill%d' % fl, collection=coll).data.specular_factor = 0.25
    for x in (-W / 2 - 0.5, W / 2 + 0.5):
        pk.lights.spot(tuple(wpt(x * 0.8, -D / 2 - 3.0, 0.3)), tuple(wpt(x * 0.5, -D / 2, 9.0)),
                       (1.0, 0.5, 0.18), 1400.0, angle_deg=70, blend=0.8, radius=0.3, shadow=True,
                       name='DollUp', collection=coll, volume=0.0)
    # fairy lights along the eaves
    p0 = wpt(-W / 2 - 0.8, -D / 2 - 0.9, Hf * 2 - 0.1)
    p1 = wpt(W / 2 + 0.8, -D / 2 - 0.9, Hf * 2 - 0.1)
    bulb_string(p0, p1, coll, 'DollEaves', [(1.0, 0.7, 0.35), (1.0, 0.55, 0.2)], 26, sag=0.9,
                strength=50.0, bulb_r=0.1, light_every=0)
    return body


# ------------------------------------------------------------------ book-stack bridge
BOOK_COLORS = [(0.05, 0.12, 0.55), (0.55, 0.03, 0.07), (0.03, 0.32, 0.16), (0.7, 0.45, 0.04),
               (0.02, 0.35, 0.42), (0.35, 0.08, 0.5), (0.65, 0.16, 0.03), (0.6, 0.12, 0.35)]


def book(coll, w, d, t, rng, name):
    """Hardcover: page block with fine leaf lines, two cover boards that overhang it, a rounded
    spine with two gilt bands (no lettering). Spine on local -X."""
    ci = rng.randrange(len(BOOK_COLORS))
    cm = cached('book%d' % ci, lambda: velvet(BOOK_COLORS[ci], 'BR_Cloth%d' % ci, sheen=0.35))
    pm = cached('pages', lambda: page_mat())
    gm = cached('gilt', lambda: pk.mat.metal((0.9, 0.62, 0.25), roughness=0.3, scratches=0.5, dirt=0.3, name='BR_Gilt'))
    bt = min(0.09, t * 0.15)
    root = pk.geo.rounded_box((w - 0.3, d - 0.22, t - 2 * bt + 0.01), radius=0.03, segments=1, material=pm,
                              name=name + 'Pg', collection=coll, edges=False)
    for z in (0.0, t - bt):
        c = pk.geo.rounded_box((w, d, bt), radius=bt * 0.45, segments=2, material=cm, name=name + 'Bd',
                               collection=coll)
        c.parent = root
        c.location = (0.12, 0.0, z - bt)
    sp = pk.geo.lathe([(t * 0.5, -d / 2), (t * 0.52, -d / 2 + 0.05), (t * 0.52, d / 2 - 0.05), (t * 0.5, d / 2)],
                      segments=16, material=cm, name=name + 'Spine', collection=coll)
    sp.parent = root
    sp.rotation_euler = (math.pi / 2, 0, 0)
    sp.scale = (0.45, 1.0, 1.0)
    sp.location = (-(w - 0.3) / 2 + 0.05, 0.0, t / 2 - bt)
    for yb in (-d * 0.3, d * 0.3):
        g = pk.geo.lathe([(t * 0.53, -0.06), (t * 0.53, 0.06)], segments=16, material=gm, name=name + 'Gilt',
                         collection=coll, cap_bottom=False, cap_top=False)
        g.parent = root
        g.rotation_euler = (math.pi / 2, 0, 0)
        g.scale = (0.46, 1.0, 1.0)
        g.location = (-(w - 0.3) / 2 + 0.05, yb, t / 2 - bt)
    if rng.random() < 0.6:
        lm = cached('label', lambda: paper_mat((0.62, 0.55, 0.4), 'BR_SpineLabel'))
        lb = pk.geo.rounded_box((0.04, d * 0.28, t * 0.42), radius=0.01, segments=1, material=lm,
                                name=name + 'Label', collection=coll, edges=False)
        lb.parent = root
        lb.location = (-(w - 0.3) / 2 - t * 0.24 + 0.05, 0.0, t / 2 - bt - t * 0.21)
    if rng.random() < 0.35:
        ri = rng.randrange(len(PAPER_COLORS))
        rm = cached('ribbon%d' % ri, lambda: velvet(PAPER_COLORS[ri], 'BR_Ribbon%d' % ri, sheen=0.6))
        L = rng.uniform(1.2, 2.4)
        rb = pk.geo.rounded_box((0.18, 0.03, L), radius=0.01, segments=1, material=rm, name=name + 'Ribbon',
                                collection=coll, edges=False)
        rb.parent = root
        rb.location = ((w - 0.3) / 2 - 0.4, -d / 2 + 0.11, t - 2 * bt - L + 0.05)
    root.location.z = bt
    return root


def page_mat():
    m, nt, out = pk._new_mat('BR_Pages')
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    lines = pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', z, 160.0))
    nf, _ = pk.noise(nt, co, scale=3.0, detail=3.0)
    col = pk.vmath(nt, 'SCALE', (0.62, 0.56, 0.44), scale=pk.maprange(nt, nf, 0.3, 0.7, 0.8, 1.05))
    col = pk.vmath(nt, 'SCALE', col, scale=pk.maprange(nt, lines, -1, 1, 0.82, 1.0))
    nrm = pk.bump(nt, lines, strength=0.15, distance=0.002)
    p = pk._principled(nt, base=col, rough=0.75, normal=nrm, spec=0.3)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.62, 0.56, 0.44), rough=0.75)
    return m


def book_stack(ctx, coll, base, yaw, rng, n, name, wd=(6.0, 4.3)):
    root = bpy.data.objects.new(name, None)
    pk._link(root, coll)
    set_xform(root, base, yaw)
    z = 0.0
    for i in range(n):
        w = wd[0] * rng.uniform(0.85, 1.12)
        d = wd[1] * rng.uniform(0.85, 1.1)
        t = rng.uniform(0.45, 0.9)
        b = book(coll, w, d, t, rng, name + 'Bk')
        b.parent = root
        b.location = (rng.uniform(-0.25, 0.25), rng.uniform(-0.2, 0.2), z)
        b.rotation_euler.z = rng.uniform(-0.12, 0.12) + (math.pi if rng.random() < 0.5 else 0.0)
        z += t
    return root, z


BOOK_LAT = 7.4      # the two hardcover towers stand back from the rails (a wide gateway)


def book_bridge(ctx, coll, s, rng, name='BookBridge'):
    """Two tall hardcover towers flanking the track (a gateway, no deck: the sky above stays
    open), each topped by a smaller tilted stack, with one fairy-light swag between them and
    a garland wound down each tower."""
    path = ctx.path
    yaw = -math.radians(path.heading(s))
    tops = []
    for side in (-1, 1):
        base = path.offset(s, side * BOOK_LAT, 0.0)
        root, z = book_stack(ctx, coll, base, yaw + math.pi / 2, rng, 8, name + ('L' if side < 0 else 'R'))
        r2, z2 = book_stack(ctx, coll, base + Vector((0, 0, z)), yaw + math.pi / 2 + side * 0.35, rng, 3,
                            name + 'Top', wd=(4.2, 3.2))
        tops.append(z + z2)
        # garland wound down the tower (on the face toward the track)
        pts = []
        for i in range(26):
            f = i / 25
            zz = (z - 0.3) * (1 - f) + 0.6 * f
            lat = side * (BOOK_LAT - 2.25 - 0.15 * math.sin(f * 9.0))
            pts.append(tuple(path.offset(s - 1.6 + 3.2 * (0.5 + 0.5 * math.sin(f * 7.0)), lat, zz)))
        # a coloured toy spotlight on the floor washes the tower's track side
        fp = path.offset(s - 5.0, side * (BOOK_LAT - 3.2), 0.2)
        pk.lights.spot(tuple(fp), tuple(path.offset(s, side * (BOOK_LAT - 1.4), z * 0.6)), (0.25, 0.3, 1.0) if side < 0 else MAGENTA,
                       900.0, angle_deg=70, blend=0.9, radius=0.2, shadow=False, name='TowerWash', collection=coll,
                       volume=0.0)
        # a short string of warm bulbs along the top edge of the main stack (no swag across the
        # track: it crossed the teddy's face and the sky)
        p0 = path.offset(s - 2.6, side * (BOOK_LAT - 2.0), z + 0.05)
        p1 = path.offset(s + 2.6, side * (BOOK_LAT - 2.0), z + 0.05)
        bulb_string(p0, p1, coll, name + 'Edge%d' % side, FAIRY, 12, sag=0.35, strength=40.0, bulb_r=0.1,
                    light_every=6, light_energy=14.0)
    return min(tops)


# ------------------------------------------------------------------ plush animals (hills)
def ellipsoid(coll, name, center, radii, mat_, rot=(0, 0, 0), sub=4):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    for v in bm.verts:
        v.co.x *= radii[0]
        v.co.y *= radii[1]
        v.co.z *= radii[2]
    ob = obj_from_bm(bm, name, mat_, coll, sharp=None, edges=False)
    ob.location = center
    ob.rotation_euler = rot
    return ob


def plush_bear(ctx, coll, s, lat, rng, pos=None, face_to=None, sc=1.0):
    """A giant sleeping teddy lying on its belly beside the track, chin on its paws, head toward
    the oncoming train: a soft lavender hill with stitched closed eyes."""
    path = ctx.path
    m_ = plush_mat((0.34, 0.25, 0.55), 'BR_PlushBear')
    m2 = plush_mat((0.62, 0.5, 0.66), 'BR_PlushMuzzle')
    dark = cached('stitch', lambda: pk.mat.basic((0.02, 0.01, 0.02), roughness=0.6, name='BR_Stitch'))
    root = bpy.data.objects.new('PlushBear', None)
    pk._link(root, coll)
    if pos is not None:
        F = Vector(face_to) - Vector(pos)
        F.z = 0.0
        F.normalize()
        set_xform(root, pos, yaw_facing(F))
    else:
        tvec = -path.tangent(s)
        F = (tvec * 0.8 + path.right(s) * (1 if lat < 0 else -1) * 0.6).normalized()
        set_xform(root, path.offset(s, lat, 0.0), yaw_facing(F))
    root.scale = (sc, sc, sc)
    # local: front (face) toward -Y, body behind (+Y)
    P = []
    P.append(ellipsoid(coll, 'BearBody', (0, 9.0, 4.6), (6.4, 9.5, 5.0), m_))
    P.append(ellipsoid(coll, 'BearHead', (0, -1.5, 5.6), (4.8, 4.4, 4.3), m_))
    for ex in (-1, 1):
        P.append(ellipsoid(coll, 'BearEar', (ex * 3.5, -0.4, 9.0), (1.7, 0.9, 1.7), m_, rot=(0.2, ex * 0.3, 0)))
        P.append(ellipsoid(coll, 'BearEarIn', (ex * 3.5, -1.1, 8.95), (1.05, 0.4, 1.05), m2, rot=(0.2, ex * 0.3, 0)))
        P.append(ellipsoid(coll, 'BearArm', (ex * 3.0, -4.0, 1.3), (1.9, 4.2, 1.35), m_, rot=(0, 0, ex * 0.2)))
        P.append(ellipsoid(coll, 'BearPad', (ex * 3.2, -8.0, 1.2), (1.2, 0.5, 1.0), m2))
        P.append(ellipsoid(coll, 'BearLeg', (ex * 4.8, 16.5, 1.8), (2.4, 3.4, 1.9), m_))
        c = Vector((ex * 1.85, -5.55, 6.6))
        pts = [tuple(c + Vector((0.85 * math.cos(a), -0.25 * math.sin(a), -0.38 * math.sin(a))))
               for a in np.linspace(0.15, math.pi - 0.15, 11)]
        P.append(pk.geo.tube_along(pts, radius=0.11, segments=6, material=dark, name='BearEye', collection=coll))
    P.append(ellipsoid(coll, 'BearMuzzle', (0, -5.4, 4.3), (2.5, 1.6, 1.8), m2))
    P.append(ellipsoid(coll, 'BearNose', (0, -6.85, 5.0), (0.85, 0.45, 0.6), dark))
    mpts = [tuple(Vector((0.55 * math.cos(a) * (1 if i else -1) + (0.55 if i else -0.55), -6.75, 4.1 - 0.35 * math.sin(a))))
            for i in (0, 1) for a in np.linspace(0, math.pi, 7)]
    P.append(pk.geo.tube_along(mpts[:7], radius=0.08, segments=5, material=dark, name='BearMouth', collection=coll))
    P.append(pk.geo.tube_along(mpts[7:], radius=0.08, segments=5, material=dark, name='BearMouth', collection=coll))
    # stitched seam down the head
    P.append(pk.geo.tube_along([(0.0, -1.5 + 4.35 * math.sin(a) * -1, 5.6 + 4.25 * math.cos(a)) for a in np.linspace(0.25, 1.0, 8)],
                               radius=0.05, segments=5, material=m2, name='BearSeam', collection=coll))
    for p in P:
        p.parent = root
        p.matrix_parent_inverse = Matrix.Identity(4)
    # a little patchwork heart on the shoulder and a ribbon bow
    bow = cached('bow', lambda: velvet((0.5, 0.04, 0.2), 'BR_Ribbon', sheen=0.6))
    for ex in (-1, 1):
        o = ellipsoid(coll, 'BowLoop', (ex * 1.4, -3.4, 2.1), (1.3, 0.5, 0.75), bow, rot=(0, ex * 0.4, 0))
        o.parent = root
        o.matrix_parent_inverse = Matrix.Identity(4)
    o = ellipsoid(coll, 'BowKnot', (0, -3.7, 2.1), (0.55, 0.5, 0.55), bow)
    o.parent = root
    o.matrix_parent_inverse = Matrix.Identity(4)
    # fairy lights draped over its back
    bpy.context.view_layer.update()
    M = root.matrix_world
    pk.lights.spot(tuple(M @ Vector((0.0, -14.0, 1.0))), tuple(M @ Vector((0.0, -4.0, 5.0))), (0.75, 0.45, 1.0),
                   2200.0, angle_deg=60, blend=0.9, radius=0.4, shadow=False, name='BearWash', volume=0.0)
    pts = [tuple(M @ Vector((6.6 * math.cos(a), 6.0 + 2.0 * math.sin(3 * a), 4.6 + 5.2 * math.sin(a))))
           for a in np.linspace(0.12, math.pi - 0.12, 22)]
    floor_string(pts, coll, 'BearLights', FAIRY_WARM, 24, strength=40.0, bulb_r=0.1,
                 z=0.0)
    return root


def sitting_bear(ctx, coll, pos, face_to, sc=1.0):
    """A giant lavender teddy sitting asleep at the end of the line, legs out, paws in its lap,
    head drooping, eyes stitched shut, a ribbon bow and a string of warm fairy lights round its
    neck. Local front = -Y."""
    # round 3: a classic honey-brown mohair teddy (it read as a flat purple shape in the
    # lavender wash), cream muzzle and pads, a glossy bead nose, a red satin bow
    m_ = plush_mat(BEAR_FUR, 'BR_PlushBear', tip=(0.95, 0.72, 0.45))
    m2 = plush_mat(BEAR_CREAM, 'BR_PlushMuzzle', tip=(1.0, 0.9, 0.75))
    dark = cached('stitch', lambda: pk.mat.basic((0.03, 0.012, 0.008), roughness=0.6, name='BR_Stitch'))
    nose_m = cached('beadnose', lambda: pk.mat.basic((0.012, 0.006, 0.004), roughness=0.08, coat=1.0,
                                                     name='BR_BeadNose'))
    bow = cached('bowred', lambda: velvet((0.55, 0.02, 0.04), 'BR_RibbonRed', sheen=0.8))
    pad_m = cached('bearpad', lambda: velvet((0.6, 0.4, 0.22), 'BR_BearPad', sheen=0.7))
    root = bpy.data.objects.new('SittingBear', None)
    pk._link(root, coll)
    F = Vector(face_to) - Vector(pos)
    F.z = 0.0
    F.normalize()
    set_xform(root, pos, yaw_facing(F))
    root.scale = (sc, sc, sc)
    P = []
    E = lambda *a, **k: P.append(ellipsoid(coll, *a, **k))
    E('BearBody', (0, 0.5, 6.2), (5.0, 4.3, 6.2), m_)
    E('BearBelly', (0, -2.6, 5.6), (3.3, 2.0, 4.0), m2)
    for ex in (-1, 1):
        E('BearLeg', (ex * 3.3, -3.6, 2.2), (2.3, 4.2, 2.2), m_, rot=(0, 0, ex * 0.15))
        E('BearSole', (ex * 3.6, -7.6, 2.3), (1.85, 0.55, 1.95), pad_m, rot=(0, 0, ex * 0.15))
        E('BearArm', (ex * 4.9, -1.6, 6.6), (1.7, 2.0, 4.0), m_, rot=(0.5, ex * 0.35, 0))
        E('BearEar', (ex * 3.5, 0.2, 18.0), (1.7, 0.95, 1.7), m_, rot=(0.15, ex * 0.3, 0))
        E('BearEarIn', (ex * 3.5, -0.55, 17.9), (1.05, 0.4, 1.05), pad_m, rot=(0.15, ex * 0.3, 0))
        c = Vector((ex * 1.75, -4.15, 15.1))
        # closed, drooping eyelids: a shallow smile-arc whose outer end sags
        pts = [tuple(c + Vector((0.75 * math.cos(a), -0.15 * math.sin(a),
                                 -0.28 * math.sin(a) - 0.2 * ex * math.cos(a))))
               for a in np.linspace(0.15, math.pi - 0.15, 11)]
        P.append(pk.geo.tube_along(pts, radius=0.1, segments=6, material=dark, name='BearEye', collection=coll))
        E('BowLoop', (ex * 1.5, -3.6, 10.6), (1.4, 0.55, 0.8), bow, rot=(0, ex * 0.4, 0))
    E('BearHead', (0, -0.6, 14.6), (4.7, 4.2, 4.3), m_)
    E('BearMuzzle', (0, -4.1, 13.3), (2.1, 1.4, 1.55), m2)
    E('BearNose', (0, -5.45, 13.9), (0.75, 0.42, 0.55), nose_m)
    E('BowKnot', (0, -3.9, 10.6), (0.6, 0.5, 0.6), bow)
    for ex in (-1, 1):               # ribbon tails hanging from the knot
        E('BowTail', (ex * 0.7, -4.05, 9.3), (0.42, 0.18, 1.2), bow, rot=(0.1, ex * 0.35, 0))
    mp = [tuple(Vector((0.5 * math.cos(a) * sgn + sgn * 0.5, -5.35, 12.9 - 0.3 * math.sin(a))))
          for sgn in (-1, 1) for a in np.linspace(0, math.pi, 7)]
    P.append(pk.geo.tube_along(mp[:7], radius=0.07, segments=5, material=dark, name='BearMouth', collection=coll))
    P.append(pk.geo.tube_along(mp[7:], radius=0.07, segments=5, material=dark, name='BearMouth', collection=coll))
    # stitched seams: down the middle of the face and the belly, so it reads as sewn plush
    seam_m = cached('seam', lambda: pk.mat.basic((0.09, 0.045, 0.02), roughness=0.85, name='BR_Seam'))
    hc, hr = Vector((0.0, -0.6, 14.6)), (4.7, 4.2, 4.3)
    pts = [tuple(hc + Vector((0.0, -hr[1] * math.sin(a) * 1.01, hr[2] * math.cos(a) * 1.01)))
           for a in np.linspace(0.05, 0.62, 9)]
    P.append(pk.geo.tube_along(pts, radius=0.06, segments=5, material=seam_m, name='BearSeam', collection=coll))
    for p in P:
        p.parent = root
        p.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    M = root.matrix_world
    # light linking: the bear's own key, fill and rim light only the bear
    rc = bpy.data.collections.new('BearReceivers')
    for p in P + [o for o in (bpy.data.objects.get('Pillow'), bpy.data.objects.get('PillowPiping')) if o]:
        rc.objects.link(p)
    s_ = sc
    pl = bpy.data.objects.get('Pillow')
    if pl is not None:
        prc = bpy.data.collections.new('PillowReceivers')
        prc.objects.link(pl)
        q = pl.matrix_world
        pw = pk.lights.spot(tuple(q @ Vector((3.0, -15.0, 3.0))), tuple(q @ Vector((0.0, -6.0, 2.5))),
                            (1.0, 0.62, 0.35), 2800.0, angle_deg=70, blend=0.9, radius=0.8, shadow=False,
                            name='PillowWash', volume=0.0)
        pw.light_linking.receiver_collection = prc
    # warm key from the lit town at its feet (front, low, a little right): honey on the face
    k = pk.lights.spot(tuple(M @ Vector((10.0, -11.0, 3.0))), tuple(M @ Vector((0.0, -2.0, 11.0))),
                       (1.0, 0.6, 0.3), BEAR_KEY * s_ * s_, angle_deg=60, blend=0.9, radius=0.6, shadow=True,
                       name='BearWarm', volume=0.0)
    k.light_linking.receiver_collection = rc
    # cool moonlit fill from the window side and above
    f = pk.lights.spot(tuple(M @ Vector((-8.0, -14.0, 22.0))), tuple(M @ Vector((0.0, -2.0, 11.0))),
                       (0.45, 0.6, 1.0), BEAR_FILL * s_ * s_, angle_deg=60, blend=0.9, radius=1.0, shadow=False,
                       name='BearCool', volume=0.0)
    f.light_linking.receiver_collection = rc
    # strong cool rim from behind (the window), grazing the head, ears and shoulders: through
    # the sheen lobe it outlines the fuzzy silhouette against the stars
    for ex in (-1, 1):
        r_ = pk.lights.area(tuple(M @ Vector((ex * 9.0, 7.0, 19.0))), tuple(M @ Vector((ex * 1.0, -2.0, 12.0))),
                            size=(3.0, 6.0), color=(0.62, 0.75, 1.0), energy=BEAR_RIM * s_ * s_, shadow=False,
                            name='BearRim')
        r_.light_linking.receiver_collection = rc
    return root


def plush_whale(ctx, coll, pos, yaw, rng):
    m_ = plush_mat((0.08, 0.2, 0.5), 'BR_PlushWhale')
    belly = plush_mat((0.55, 0.62, 0.75), 'BR_PlushBelly')
    dark = cached('stitch', lambda: pk.mat.basic((0.02, 0.01, 0.02), roughness=0.6, name='BR_Stitch'))
    root = bpy.data.objects.new('PlushWhale', None)
    pk._link(root, coll)
    set_xform(root, pos, yaw)
    parts = [ellipsoid(coll, 'WhaleBody', (0, 0, 4.2), (9.5, 6.0, 4.5), m_),
             ellipsoid(coll, 'WhaleBelly', (0, -0.8, 2.6), (8.0, 5.0, 2.6), belly),
             ellipsoid(coll, 'WhaleTail', (10.5, 0, 6.0), (3.0, 1.4, 1.4), m_, rot=(0, math.radians(-35), 0)),
             ellipsoid(coll, 'FlukeA', (12.8, 1.8, 8.0), (2.4, 1.6, 0.5), m_, rot=(0.4, -0.5, 0.5)),
             ellipsoid(coll, 'FlukeB', (12.8, -1.8, 8.0), (2.4, 1.6, 0.5), m_, rot=(-0.4, -0.5, -0.5)),
             ellipsoid(coll, 'Fin', (-1.0, -5.5, 2.4), (2.2, 0.8, 1.0), m_, rot=(0.3, 0.2, 0.4))]
    c = Vector((-6.5, -4.6, 5.0))
    pts = [tuple(c + Vector((0.7 * math.cos(a), -0.1, -0.35 * math.sin(a)))) for a in np.linspace(0.2, math.pi - 0.2, 9)]
    parts.append(pk.geo.tube_along(pts, radius=0.1, segments=6, material=dark, name='WhaleEye', collection=coll))
    for p in parts:
        p.parent = root
        p.matrix_parent_inverse = Matrix.Identity(4)
    return root


# ------------------------------------------------------------------ toy crane
def toy_crane(ctx, coll, s, lat, rng):
    path = ctx.path
    yel = cached('craneyel', lambda: tin_paint((0.85, 0.5, 0.02), 'BR_CraneYellow', rough=0.3, coat=0.6, wear=0.45))
    red = cached('cranered', lambda: tin_paint((0.5, 0.04, 0.02), 'BR_CraneRed', rough=0.3, coat=0.6, wear=0.45))
    base = path.offset(s, lat, 0.0)
    yaw = -math.radians(path.heading(s))
    root = bpy.data.objects.new('Crane', None)
    pk._link(root, coll)
    set_xform(root, base, yaw)
    objs = []
    b = pk.geo.rounded_box((6.0, 6.0, 1.4), radius=0.25, segments=2, material=red, name='CraneBase', collection=coll)
    objs.append(b)
    for x in (-2.2, 2.2):
        for y in (-2.6, 2.6):
            w = pk.geo.lathe([(0.0, -0.4), (0.9, -0.4), (0.9, 0.4), (0.0, 0.4)], segments=20,
                             material=cached('rubber', lambda: pk.mat.basic((0.02, 0.02, 0.025), 0.6, name='BR_Rubber')),
                             name='CraneWheel', collection=coll)
            w.location = (x * 1.25, y, 0.9)
            w.rotation_euler = (0, math.pi / 2, 0)
            objs.append(w)
    H = 12.0
    a = 1.2
    corners = [(-a, -a), (a, -a), (a, a), (-a, a)]
    for (x, y) in corners:
        objs.append(pk.geo.tube_along([(x, y, 1.4), (x, y, H)], radius=0.11, segments=8, material=yel,
                                      name='CraneLeg', collection=coll))
    nseg = 9
    for i in range(nseg):
        z0 = 1.4 + (H - 1.4) * i / nseg
        z1 = 1.4 + (H - 1.4) * (i + 1) / nseg
        for k in range(4):
            p, q = corners[k], corners[(k + 1) % 4]
            objs.append(pk.geo.tube_along([(p[0], p[1], z0), (q[0], q[1], z1)], radius=0.06, segments=6,
                                          material=yel, name='CraneBrace', collection=coll))
            objs.append(pk.geo.tube_along([(p[0], p[1], z1), (q[0], q[1], z1)], radius=0.06, segments=6,
                                          material=yel, name='CraneRing', collection=coll))
    cab = pk.geo.rounded_box((3.6, 3.2, 2.8), radius=0.3, segments=2, material=red, name='CraneCab', collection=coll)
    cab.location = (0, 0, H)
    objs.append(cab)
    cw = pk.mat.lit_window((1.0, 0.6, 0.25), strength=20.0, name='BR_CraneWin', mullions=(1, 1))
    wv = [(-1.81, -0.9, H + 1.0), (-1.81, 0.9, H + 1.0), (-1.81, 0.9, H + 2.2), (-1.81, -0.9, H + 2.2)]
    objs.append(pk.mesh_object('CraneCabWin', wv, [(0, 1, 2, 3)], uvs=[(0, 0), (1, 0), (1, 1), (0, 1)],
                               material=cw, smooth=False, collection=coll, attrs={'pk_rand': ('FACE', [0.4])}))
    # jib toward the track (local -X if crane is right of track)
    sgn = -1.0 if lat > 0 else 1.0
    L = 20.0
    jz = H + 2.8
    top = [(0.0, -0.8, jz), (0.0, 0.8, jz)]
    for yy in (-0.8, 0.8):
        objs.append(pk.geo.tube_along([(sgn * 1.0, yy, jz), (sgn * L, yy, jz + 0.3)], radius=0.09, segments=8,
                                      material=yel, name='JibChord', collection=coll))
    objs.append(pk.geo.tube_along([(sgn * 1.0, 0.0, jz + 1.5), (sgn * L, 0.0, jz + 0.5)], radius=0.09, segments=8,
                                  material=yel, name='JibTop', collection=coll))
    nj = 12
    for i in range(nj):
        x0 = sgn * (1.0 + (L - 1.0) * i / nj)
        x1 = sgn * (1.0 + (L - 1.0) * (i + 1) / nj)
        zt0 = jz + 1.5 - 1.0 * i / nj
        zt1 = jz + 1.5 - 1.0 * (i + 1) / nj
        for yy in (-0.8, 0.8):
            objs.append(pk.geo.tube_along([(x0, yy, jz + 0.3 * i / nj), (x1, 0.0, zt1)], radius=0.05, segments=5,
                                          material=yel, name='JibLace', collection=coll))
    # counter jib + weight
    objs.append(pk.geo.tube_along([(-sgn * 1.0, 0.0, jz), (-sgn * 7.0, 0.0, jz)], radius=0.12, segments=8,
                                  material=yel, name='CounterJib', collection=coll))
    wt = pk.geo.rounded_box((2.2, 2.0, 2.0), radius=0.2, segments=2, material=red, name='CounterWeight', collection=coll)
    wt.location = (-sgn * 6.5, 0, jz - 1.8)
    objs.append(wt)
    # hook on a cord
    hx = sgn * (L - 3.0)
    drop = 4.5
    objs.append(pk.geo.tube_along([(hx, 0.0, jz), (hx, 0.0, jz - drop)], radius=0.03, segments=5,
                                  material=cached('wire', wire_mat),
                                  name='HookCord', collection=coll))
    hb = pk.geo.rounded_box((0.9, 0.6, 1.0), radius=0.12, segments=2, material=red, name='HookBlock', collection=coll)
    hb.location = (hx, 0, jz - drop - 1.0)
    objs.append(hb)
    hk = pk.geo.tube_along([(hx + 0.4 * math.sin(a), 0.0, jz - drop - 1.3 - 0.4 + 0.4 * math.cos(a)) for a in np.linspace(0, 4.2, 14)],
                           radius=0.09, segments=8, material=nickel(), name='Hook', collection=coll)
    objs.append(hk)
    beacon = pk.geo.lathe([(0.0, 0.0), (0.3, 0.0), (0.3, 0.4), (0.0, 0.5)], segments=14,
                          material=glow((1.0, 0.08, 0.04), 80.0, 'BR_Beacon'), name='Beacon', collection=coll)
    beacon.location = (0, 0, H + 2.8)
    objs.append(beacon)
    for o in objs:
        o.parent = root
        o.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    M = root.matrix_world
    pk.lights.point(tuple(M @ Vector((0, 0, H + 3.6))), (1.0, 0.1, 0.04), 200.0, radius=0.3, shadow=False,
                    name='BeaconLight', collection=coll, volume=0.3)
    # string of lights along the jib
    p0 = M @ Vector((sgn * 1.5, -0.9, jz - 0.2))
    p1 = M @ Vector((sgn * (L - 0.5), -0.9, jz + 0.1))
    bulb_string(p0, p1, coll, 'JibLights', FAIRY_WARM, 22, sag=1.4, strength=45.0,
                bulb_r=0.1, light_every=0)
    return root


# ------------------------------------------------------------------ small props
def peg_tree(coll, pos, rng, name, lights=False):
    gi = rng.randrange(3)
    gm = cached('tree%d' % gi, lambda: pk.mat.painted_wood([(0.04, 0.4, 0.12), (0.02, 0.36, 0.3), (0.2, 0.5, 0.06)][gi],
                                                           name='BR_Tree%d' % gi, wear=0.35, roughness=0.35))
    tm = cached('trunk', lambda: pk.mat.painted_wood((0.3, 0.16, 0.06), name='BR_Trunk', wear=0.2))
    h = rng.uniform(0.5, 0.8)
    tr = pk.geo.lathe([(0.0, 0.0), (0.3, 0.0), (0.3, 0.12), (0.12, 0.16), (0.12, h), (0.0, h)], segments=14,
                      material=tm, name=name, location=pos, collection=coll)
    if rng.random() < 0.55:          # lollipop crown
        r = rng.uniform(0.55, 0.75)
        prof = [(0.0, h - 0.1)] + [(r * math.sin(a), h + r * 0.9 - r * 0.9 * math.cos(a)) for a in np.linspace(0.25, math.pi, 14)]
        prof[-1] = (0.0, prof[-1][1])
    else:                            # three-tier turned fir
        r = rng.uniform(0.6, 0.78)
        hh = rng.uniform(1.6, 2.2)
        prof = [(0.0, h - 0.1)]
        for k in range(3):
            z0 = h + hh * k / 3.2
            rk = r * (1.0 - k * 0.24)
            prof += [(rk * 0.55, z0), (rk, z0 + 0.06), (rk * 0.96, z0 + 0.14), (rk * 0.3, z0 + hh * 0.42)]
        prof += [(0.08, h + hh), (0.0, h + hh + 0.06)]
    can = pk.geo.lathe(prof, segments=22, material=gm, name=name + 'Top', collection=coll)
    can.parent = tr
    if lights:
        top = h + 1.6
        pts = []
        for i in range(60):
            f = i / 59
            a = f * 6 * 2 * math.pi
            z = h + 0.25 + f * (top - h - 0.5)
            rr = 0.72 * (1 - f * 0.85) + 0.06
            pts.append(Vector((pos[0] + rr * math.cos(a), pos[1] + rr * math.sin(a), z)))
        bm = bmesh.new()
        for i, p in enumerate(pts[::2]):
            ret = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=0.08)
            for v in ret['verts']:
                v.co += p
        ob = obj_from_bm(bm, name + 'Fairy', glow((1.0, 0.75, 0.4), 14.0), coll, sharp=None, edges=False)
        ob.visible_shadow = False
    return tr


BRICK_COLORS = [(0.62, 0.03, 0.02), (0.85, 0.55, 0.0), (0.02, 0.12, 0.6), (0.02, 0.4, 0.12), (0.8, 0.78, 0.72)]
_BRICK_MESH = {}


def brick_mesh(nx, ny):
    """A big studded toy brick (U = 0.8 units per stud pitch), origin at the bottom centre."""
    key = (nx, ny)
    if key in _BRICK_MESH:
        return _BRICK_MESH[key]
    U, H = 0.5, 0.6
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * nx * U - 0.0, v.co.y * ny * U, (v.co.z + 0.5) * H))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.035, segments=2, affect='EDGES', clamp_overlap=True)
    for i in range(nx):
        for j in range(ny):
            cx = (i - (nx - 1) / 2) * U
            cy = (j - (ny - 1) / 2) * U
            ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.15, radius2=0.15, depth=0.11)
            for v in ret['verts']:
                v.co += Vector((cx, cy, H + 0.055))
            top = [f for f in {f for v in ret['verts'] for f in v.link_faces} if f.normal.z > 0.9]
            bmesh.ops.bevel(bm, geom=[e for f in top for e in f.edges], offset=0.02, segments=2, affect='EDGES',
                            clamp_overlap=True)
    me = bpy.data.meshes.new('BrickMesh%d%d' % key)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(40))
    _BRICK_MESH[key] = me
    return me


def toy_brick(coll, pos, yaw, ci, name, nx=4, ny=2, tilt=0.0):
    m_ = cached('brick%d' % ci, lambda: pk.mat.toy_plastic(BRICK_COLORS[ci], roughness=0.22,
                                                           name='BR_Brick%d' % ci))
    me = brick_mesh(nx, ny).copy()
    me.materials.append(m_)
    ob = bpy.data.objects.new(name, me)
    pk._link(ob, coll)
    ob.location = pos
    ob.rotation_euler = (tilt, 0.0, yaw)
    pk.edge_mask(ob, gain=2.5)
    return ob


def marble(coll, pos, rng, name):
    ci = rng.randrange(4)
    c = [(0.2, 0.5, 1.0), (1.0, 0.3, 0.5), (0.3, 1.0, 0.6), (1.0, 0.65, 0.2)][ci]

    def mk():
        m, nt, out = pk._new_mat('BR_Marble%d' % ci)
        lw = pk.node(nt, 'ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.4
        core = pk.math_(nt, 'POWER', pk.math_(nt, 'SUBTRACT', 1.0, lw.outputs['Facing']), 3.0)
        p = pk._principled(nt, base=tuple(x * 0.25 for x in c), rough=0.02, spec=1.0, ior=1.5,
                           emit=c, emit_strength=pk.math_(nt, 'MULTIPLY', core, 0.04), coat=1.0, coat_rough=0.01)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        pk._web(m, base=c, rough=0.05, emit=c, emit_strength=1.0)
        return m
    mm = cached('marble%d' % ci, mk)
    r = rng.uniform(0.32, 0.5)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=r)
    ob = obj_from_bm(bm, name, mm, coll, sharp=None, edges=False)
    ob.location = (pos[0], pos[1], r)
    return ob


def crayon(coll, pos, yaw, rng, name):
    ci = rng.randrange(6)
    c = [(0.7, 0.04, 0.03), (0.05, 0.15, 0.7), (0.85, 0.6, 0.02), (0.05, 0.45, 0.12), (0.5, 0.08, 0.55),
         (0.9, 0.3, 0.02)][ci]
    cm = cached('crayon%d' % ci, lambda: pk.mat.toy_plastic(c, name='BR_Crayon%d' % ci, roughness=0.45, coat=0.1))
    L = rng.uniform(1.6, 2.3)
    prof = [(0.0, 0.0), (0.2, 0.0), (0.2, L), (0.12, L + 0.35), (0.04, L + 0.42), (0.0, L + 0.43)]
    ob = pk.geo.lathe(prof, segments=6, material=cm, name=name, collection=coll, sharp_angle=40)
    ob.location = (pos[0], pos[1], 0.2)
    ob.rotation_euler = (math.pi / 2, 0, yaw)
    return ob


def toy_car(coll, pos, yaw, rng, name):
    ci = rng.randrange(4)
    c = [(0.6, 0.05, 0.04), (0.04, 0.2, 0.6), (0.8, 0.5, 0.03), (0.05, 0.4, 0.3)][ci]
    bm_ = cached('car%d' % ci, lambda: pk.mat.painted_wood(c, name='BR_Car%d' % ci, wear=0.4, roughness=0.35))
    root = pk.geo.rounded_box((1.3, 2.6, 0.75), radius=0.25, segments=3, material=bm_, name=name, collection=coll)
    set_xform(root, (pos[0], pos[1], 0.42), yaw)
    cab = pk.geo.rounded_box((1.1, 1.3, 0.65), radius=0.28, segments=3, material=bm_, name=name + 'Cab',
                             collection=coll)
    set_xform(cab, (0, 0.2, 0.7), 0.0, root)
    gl = cached('carglass', lambda: pk.mat.basic((0.01, 0.015, 0.03), roughness=0.08, coat=1.0, name='BR_CarGlass'))
    gb = pk.geo.rounded_box((1.16, 1.36, 0.28), radius=0.12, segments=2, material=gl, name=name + 'Glass',
                            collection=coll, edges=False)
    set_xform(gb, (0, 0.2, 0.92), 0.0, root)
    chrome = nickel()
    for yb in (-1.32, 1.32):
        bp = pk.geo.rounded_box((1.2, 0.14, 0.18), radius=0.06, segments=2, material=chrome, name=name + 'Bumper',
                                collection=coll, edges=False)
        set_xform(bp, (0, yb, 0.02), 0.0, root)
    wm = cached('carwheel', lambda: pk.mat.varnished_wood(name='BR_Wheel', light=(0.4, 0.25, 0.1),
                                                          dark=(0.2, 0.1, 0.04), scale=0.3))
    for x in (-0.68, 0.68):
        for y in (-0.8, 0.8):
            w = pk.geo.lathe([(0.0, -0.12), (0.4, -0.12), (0.42, -0.08), (0.42, 0.08), (0.4, 0.12), (0.0, 0.12)],
                             segments=18, material=wm, name=name + 'W', collection=coll)
            w.parent = root
            w.location = (x, y, 0.0)
            w.rotation_euler = (0, math.pi / 2, 0)
    for x in (-0.4, 0.4):
        hl = pk.geo.lathe([(0.0, 0.0), (0.12, 0.0), (0.12, 0.05)], segments=12, material=glow((1.0, 0.8, 0.5), 40.0),
                          name=name + 'HL', collection=coll, cap_bottom=False)
        hl.parent = root
        hl.location = (x, -1.31, 0.15)
        hl.rotation_euler = (math.pi / 2, 0, 0)
    return root


def signal_post(ctx, coll, s, side, idx):
    path = ctx.path
    base = path.offset(s, side * 2.0, 0.0)
    m_ = cached('sigtin', lambda: tin_paint((0.6, 0.6, 0.62), 'BR_SignalTin', rough=0.3, coat=0.5, wear=0.4))
    blk = cached('sigblack', lambda: tin_paint((0.02, 0.02, 0.025), 'BR_SignalBlack', rough=0.3, coat=0.5, wear=0.3))
    pk.geo.lathe([(0.0, 0.0), (0.5, 0.0), (0.5, 0.15), (0.1, 0.3), (0.1, 6.0), (0.0, 6.0)], segments=14,
                 material=m_, name='SignalPost%d' % idx, location=tuple(base), collection=coll)
    head = pk.geo.rounded_box((0.8, 0.5, 1.8), radius=0.2, segments=2, material=blk, name='SignalHead%d' % idx,
                              collection=coll)
    head.location = base + Vector((0, 0, 5.0))
    head.rotation_euler.z = -math.radians(path.heading(s))
    tdir = -path.tangent(s)
    for k, (col, z) in enumerate((((1.0, 0.08, 0.04), 6.25), ((0.1, 1.0, 0.35), 5.45))):
        lens = pk.geo.lathe([(0.0, 0.0), (0.2, 0.0), (0.2, 0.04)], segments=16, material=glow(col, 8.0),
                            name='SignalLens', collection=coll, cap_bottom=False)
        lens.location = base + Vector((0, 0, z)) + tdir * 0.26
        lens.rotation_euler = tdir.to_track_quat('Z', 'Y').to_euler()
        pk.lights.point(tuple(base + Vector((0, 0, z)) + tdir * 0.6), col, 20.0, radius=0.2, shadow=False,
                        name='SignalLight', collection=coll, volume=0.2)


# ------------------------------------------------------------------ the town
def build_town(ctx, coll, rng):
    path = ctx.path
    cam_s0 = ctx.s_of_t(0.0)
    # keep-out zones (s ranges per side) for landmarks
    keep = {1: [],
            -1: [(ctx.hero_s - 10.0, ctx.hero_s + 9.0)]}
    bridge = [(ctx.bridge_s - 4.5, ctx.bridge_s + 4.5)]
    idx = 0
    s_end = ctx.track_end + 6.0
    # row 1: near houses and block towers right beside the track
    for side in (-1, 1):
        s = cam_s0 - 8.0 + (0.0 if side < 0 else 4.0)
        while s < s_end:
            w = rng.uniform(4.0, 7.5)
            sc = s + w / 2
            if any(a < sc < b for a, b in keep[side]) or any(a - w / 2 < sc < b + w / 2 for a, b in bridge):
                s += 3.0
                continue
            if side < 0 and sc < ctx.hero_s - 6.0:
                s += 3.0
                continue
            lat = side * rng.uniform(4.3, 5.6)
            F = facing_track(path, sc, side, 0.25)
            yaw = yaw_facing(F)
            far = (sc - cam_s0) / 110.0
            low = side < 0 and sc < ctx.hero_s - 8.0      # keep the view to the dollhouse open
            wc = WASH_COLORS[idx % len(WASH_COLORS)]
            if rng.random() < 0.28 and not low:
                block_tower(ctx, path.offset(sc, lat + side * 0.8, 0.0), yaw, rng, coll, 'Tower%d' % idx,
                            levels=rng.randint(3, 5))
                fp = path.offset(sc - 1.0, lat - side * 1.2, 0.2)
                tp = path.offset(sc, lat + side * 0.8, 6.0)
                pk.lights.spot(tuple(fp), tuple(tp), wc, 500.0, angle_deg=90, blend=0.9, radius=0.2,
                               shadow=False, name='WashT%d' % idx, collection=coll, volume=0.0)
                s += 4.5
            else:
                d = rng.uniform(3.8, 5.5)
                h = rng.uniform(4.0, 8.5) + far * 4.0
                if low:
                    h = rng.uniform(2.4, 3.4)
                box_house(ctx, path.offset(sc, lat + side * d / 2, 0.0), yaw, w, d, h, rng, coll, 'Box%d' % idx)
                # coloured wash from the floor up the facade (toy spotlight), like a street wash
                fp = path.offset(sc - 1.0, lat - side * 1.3, 0.2)
                tp = path.offset(sc, lat + side * 0.4, h * 0.85)
                pk.lights.spot(tuple(fp), tuple(tp), wc, 1100.0, angle_deg=100, blend=0.9, radius=0.2,
                               shadow=False, name='Wash%d' % idx, collection=coll, volume=0.0)
                s += w + rng.uniform(1.2, 3.5)
            idx += 1
    # rows 2 and 3: taller boxes and towers behind
    for side in (-1, 1):
        for row, (lat0, lat1, hmin, hmax) in enumerate(((10.0, 16.0, 6.0, 13.0), (18.0, 30.0, 8.0, 17.0))):
            s = cam_s0 - 4.0 + row * 3.0
            while s < s_end + 10:
                w = rng.uniform(5.0, 9.0)
                sc = s + w / 2
                if any(a - 4 < sc < b + 4 for a, b in keep[side]) and (row == 0 or side > 0):
                    s += 4.0
                    continue
                lat = side * rng.uniform(lat0, lat1)
                F = facing_track(path, sc, side, 0.4)
                yaw = yaw_facing(F) + rng.uniform(-0.25, 0.25)
                p = path.offset(sc, lat, 0.0)
                if p.y > WALL_Y - 8:
                    break
                if rng.random() < 0.25:
                    block_tower(ctx, p, yaw, rng, coll, 'Tower%d' % idx, levels=rng.randint(6, 10))
                else:
                    d = rng.uniform(4.5, 8.0)
                    h = rng.uniform(hmin, hmax)
                    box_house(ctx, p, yaw, w, d, h, rng, coll, 'Box%d' % idx, side_windows=True,
                              door=(row == 0))
                s += w + rng.uniform(1.0, 4.0)
                idx += 1
    # far town in front of the window wall: two dense rows, facing the camera (skyline)
    e = path.at(ctx.track_end)
    for row, (y0, y1, hmin, hmax) in enumerate(((WALL_Y - 26, WALL_Y - 18, 4.0, 8.0), (WALL_Y - 14, WALL_Y - 5, 6.0, 12.0))):
        x = ctx.win_x0 - 45 + rng.uniform(0, 3)
        while x < ctx.win_x1 + 45:
            w = rng.uniform(4.0, 7.5)
            y = rng.uniform(y0, y1)
            xc = x + w / 2
            q = path.at(min(ctx.track_end, max(0.0, ctx.track_end - (e.y - y))))
            if abs(xc - q.x) < 7.0 + w / 2 and y < e.y + 4:
                x += w
                continue
            bx, by = ctx.bear_pos[0], ctx.bear_pos[1]
            if abs(xc - bx) < PILLOW[0] / 2 + 1.5 + w / 2 and by - 20.0 < y < by + 30.0:
                x += w
                continue
            if rng.random() < 0.28:
                block_tower(ctx, (xc, y, 0.0), rng.uniform(-0.4, 0.4), rng, coll, 'Tower%d' % idx,
                            levels=rng.randint(4, 8))
            else:
                box_house(ctx, (xc, y, 0.0), rng.uniform(-0.35, 0.35), w, rng.uniform(3.5, 6.0),
                          rng.uniform(hmin, hmax), rng, coll, 'Box%d' % idx, door=(row == 0))
                if rng.random() < 0.6:
                    hh = hmax
                    pk.lights.spot((xc + rng.uniform(-1, 1), y - 4.5, 0.2), (xc, y - 1.5, hh * 0.8),
                                   WASH_COLORS[idx % len(WASH_COLORS)], 900.0, angle_deg=90, blend=0.9,
                                   radius=0.2, shadow=False, name='WashF%d' % idx, collection=coll, volume=0.0)
            x += w + rng.uniform(0.6, 2.5)
            idx += 1
    # garlands of lights strung across the far town (the reveal at the end of the run)
    for k, (y, z) in enumerate(((WALL_Y - 22.0, 9.0), (WALL_Y - 12.0, 13.0), (WALL_Y - 30.0, 10.5))):
        xs = np.linspace(ctx.win_x0 - 36, ctx.win_x1 + 36, 6)
        cols = [FAIRY, FAIRY_WARM, FAIRY][k]
        for i in range(len(xs) - 1):
            if abs((xs[i] + xs[i + 1]) / 2 - ctx.bear_pos[0]) < 14.0:
                rng.uniform(-2, 2), rng.uniform(-2, 2), rng.uniform(-1, 1)
                continue                      # not across the teddy's face
            bulb_string((xs[i], y + rng.uniform(-2, 2), z), (xs[i + 1], y + rng.uniform(-2, 2), z + rng.uniform(-1, 1)),
                        coll, 'FarGarland', cols, 18, sag=2.2, strength=40.0, bulb_r=0.13, light_every=9,
                        light_energy=25.0)
    pk.log('town: %d houses/towers' % idx)


def build_props(ctx, coll, rng):
    path = ctx.path
    cam_s0 = ctx.s_of_t(0.0)
    s_end = ctx.track_end
    # toy lamp posts alternating sides
    i = 0
    s = cam_s0 + 5.0
    while s < s_end - 2:
        side = 1 if i % 2 == 0 else -1
        if not (ctx.bridge_s - 3 < s < ctx.bridge_s + 3):
            lamp_post(ctx, s, side, LAMP_COLORS[i % len(LAMP_COLORS)], coll, i)
        s += 7.5
        i += 1
    # signals
    # (round 3: the red / green signal was dropped; it competed with the warm hero)
    # peg trees, some wrapped in lights
    for k in range(36):
        s = rng.uniform(cam_s0 + 2, s_end)
        side = rng.choice((-1, 1))
        lat = side * rng.uniform(2.6, 3.8)
        p = path.offset(s, lat, 0.0)
        tr_ = peg_tree(coll, tuple(p), rng, 'Peg%d' % k, lights=(k % 4 == 0 and k not in PEG_DARK))
        if k % 4 != 0:
            tr_.scale = (0.72, 0.72, 0.72)
    # a domino run curving beside the rails, loose blocks scattered
    dm = cached('domino', lambda: tin_paint((0.015, 0.015, 0.02), 'BR_Domino', rough=0.25, coat=0.8, wear=0.1))
    pipm = cached('pip', lambda: pk.mat.basic((0.8, 0.8, 0.75), 0.4, name='BR_Pip'))
    dom = pk.geo.rounded_box((0.66, 0.17, 1.27), radius=0.05, segments=2, material=dm, name='Domino', collection=coll)
    bm = bmesh.new()
    for (x, z) in ((-0.16, 0.33), (0.16, 0.33), (0.0, 0.94), (-0.16, 1.05), (0.16, 0.83)):
        ret = bmesh.ops.create_circle(bm, cap_ends=True, segments=10, radius=0.055)
        for v in ret['verts']:
            v.co = Vector((v.co.x + x, -0.09, v.co.y + z))
    pips = obj_from_bm(bm, 'DominoPips', pipm, coll, smooth=False, edges=False)
    pips.parent = dom
    d0 = cam_s0 + 8.0
    pts, yaws = [], []
    for k in range(40):
        s_ = d0 + k * 0.82
        lat = 2.3 + 0.5 * math.sin(k * 0.25)
        pts.append(tuple(path.offset(s_, -lat, 0.0)))
        yaws.append(-path.heading(s_) + 8.0 * math.sin(k * 0.5))
    root = pk.geo.scatter(dom, pts, seed=3, scale=1.0, rot_z=False, name='Dominoes', collection=coll, align=yaws)
    # the head of the run has already toppled: a cascade of fallen and leaning tiles
    kids = sorted(root.children, key=lambda o: int(o.name.split('_')[-1]))
    for i, o in enumerate(kids[:9]):
        o.rotation_mode = 'ZXY'
        o.rotation_euler = (math.radians(-min(84.0, 84.0 - (i - 5) * 18.0) if i >= 5 else -84.0), 0.0,
                            o.rotation_euler.z)
        if i < 5:
            o.location.z = 0.09
    # pips follow each domino
    for o in list(root.children):
        pp = bpy.data.objects.new(o.name + 'P', pips.data)
        pk._link(pp, coll)
        pp.parent = o
    pips.hide_render = True
    pips['pk_noexport'] = True
    for k in range(22):
        s_ = rng.uniform(cam_s0 + 4, s_end)
        lat = rng.choice((-1, 1)) * rng.uniform(3.0, 4.2)
        kind = rng.choice(['cube', 'cube', 'brick', 'pillar', 'roof'])
        if lat < 0 and s_ < ctx.hero_s - 4.0 and kind in ('pillar', 'cube'):
            kind = 'brick'           # nothing tall in front of the dollhouse
        o = block_obj(kind, block_mat(rng.randrange(len(BLOCK_COLORS))), coll, 'Loose%d' % k,
                      tuple(path.offset(s_, lat, 0.0)), rng.uniform(0, 6.28))
        if False:
            o.rotation_euler = (math.pi / 2, 0, rng.uniform(0, 6.28))
            o.location.z = 0.78
    # big studded toy bricks, single and in little stacks, right beside the rails: they sweep
    # past the bottom corners (speed and parallax) and read instantly as toys
    k = 0
    s = cam_s0 + 6.0
    while s < s_end - 4:
        side = 1 if k % 2 == 0 else -1
        lat = side * rng.uniform(1.9, 2.6)
        if side < 0 and s < cam_s0 + 43.0:
            lat = -rng.uniform(3.6, 4.2)        # outside the domino run
        if True:
            base = path.offset(s, lat, 0.0)
            yaw = -math.radians(path.heading(s)) + rng.uniform(-0.6, 0.6)
            n = rng.choice([1, 1, 1, 2])
            for j in range(n):
                nx, ny = rng.choice([(4, 2), (4, 2), (2, 2), (6, 2)])
                toy_brick(coll, tuple(base + Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), j * 0.6))),
                          yaw + rng.uniform(-0.3, 0.3) + (math.pi / 2 if j % 2 else 0.0), rng.randrange(len(BRICK_COLORS)),
                          'Brick%d_%d' % (k, j), nx, ny)
        s += rng.uniform(4.5, 7.5)
        k += 1
    # crayons
    for k in range(12):
        s = rng.uniform(cam_s0 + 4, s_end)
        lat = rng.choice((-1, 1)) * rng.uniform(2.8, 3.8)
        crayon(coll, path.offset(s, lat, 0.0), -math.radians(path.heading(s)) + rng.uniform(-0.5, 0.5), rng, 'Crayon%d' % k)
    # wooden cars parked along
    for k in range(9):
        s = rng.uniform(cam_s0 + 6, s_end)
        side = rng.choice((-1, 1))
        p = path.offset(s, side * rng.uniform(2.6, 3.4), 0.0)
        toy_car(coll, p, -math.radians(path.heading(s)) + rng.uniform(-0.4, 0.4) + (math.pi if side > 0 else 0),
                rng, 'Car%d' % k)
    # fairy-light strings lying on the floor beside the track (wavy)
    for side in (-1, 1):
        pts = []
        for s in np.arange(cam_s0 - 4, s_end, 1.0):
            lat = side * (3.2 + 0.5 * math.sin(s * 0.33 + side))
            pts.append(tuple(path.offset(float(s), lat, 0.0)))
        cols = FAIRY if side < 0 else FAIRY[3:] + FAIRY[:3]
        floor_string(pts, coll, 'FloorLights%d' % side, cols, int((s_end - cam_s0) / 1.1), strength=30.0,
                     bulb_r=0.08, light_every=9, light_energy=6.0)
    # one paper bunting high across the track near the start: it frames the top of the
    # opening shot and leaves the sky and the hero clear
    for s, z in ((cam_s0 + 15.0, 11.5),):
        bunting(path.offset(s, -8.0, z), path.offset(s + 1.5, 8.0, z + 0.3), coll, 'Bunting', n=16, sag=1.2)
    # a tin rocket standing beside the track, spinning tops
    rk_w = cached('rocketw', lambda: tin_paint((0.75, 0.75, 0.78), 'BR_RocketTin', rough=0.25, coat=0.7, wear=0.4))
    rk_r = cached('rocketr', lambda: tin_paint((0.6, 0.04, 0.03), 'BR_RocketRed', rough=0.25, coat=0.7, wear=0.4))
    rp = path.offset(cam_s0 + 31.0, -3.4, 0.0)
    body = pk.geo.lathe([(0.0, 0.6), (0.55, 0.7), (0.62, 1.4), (0.6, 3.0), (0.45, 3.8), (0.2, 4.4), (0.0, 4.6)],
                        segments=28, material=rk_w, name='Rocket', location=tuple(rp), collection=coll)
    nose = pk.geo.lathe([(0.47, 3.75), (0.2, 4.4), (0.0, 4.62)], segments=28, material=rk_r, name='RocketNose',
                        collection=coll)
    nose.parent = body
    for k in range(3):
        a_ = 2 * math.pi * k / 3
        fin = obj_from_bm(polygon_bm([(0.0, 0.0), (0.9, -0.1), (0.9, 0.3), (0.0, 1.6)], thick=0.08), 'RocketFin',
                          rk_r, coll, sharp=40)
        fin.parent = body
        fin.location = (0.5 * math.cos(a_), 0.5 * math.sin(a_), 0.55)
        fin.rotation_euler = (0, 0, a_ + math.pi / 2)
    port = pk.geo.lathe([(0.0, 0.0), (0.22, 0.0), (0.22, 0.04)], segments=20, material=glow((0.3, 0.8, 1.0), 12.0),
                        name='RocketPort', collection=coll, cap_bottom=False)
    port.parent = body
    port.location = (0.0, -0.6, 2.6)
    port.rotation_euler = (math.pi / 2, 0, 0)
    for k, (ds, lat) in enumerate(((13.0, 3.3), (47.0, -3.2), (70.0, 3.5))):
        tp = path.offset(cam_s0 + ds, lat, 0.0)
        cols = [(0.7, 0.05, 0.05), (0.05, 0.2, 0.7), (0.85, 0.6, 0.05)]
        tm_ = cached('top%d' % k, lambda k=k: pk.mat.painted_wood(cols[k], name='BR_Top%d' % k, wear=0.3, roughness=0.3))
        top = pk.geo.lathe([(0.0, 0.0), (0.08, 0.05), (0.55, 0.55), (0.85, 0.85), (0.8, 1.0), (0.12, 1.05),
                            (0.08, 1.5), (0.0, 1.55)], segments=28, material=tm_, name='Top%d' % k,
                           location=tuple(tp), collection=coll)
        top.rotation_euler = (0.25, 0.0, 0.0) if k == 1 else (0, 0, 0)


# ------------------------------------------------------------------ main
def build_world(ctx, rng):
    room = ctx.collection('Room')
    town = ctx.collection('Town')
    props = ctx.collection('Props')
    build_room(ctx, room)
    build_stickers(ctx, room, rng)
    build_window_dressing(ctx, room, rng)
    build_track(ctx, town)
    hp = ctx.path.at(ctx.hero_s)
    dollhouse(ctx, town, ctx.hero_s, ctx.hero_lat, rng, face_to=(4.0, 0.0, 0.0), sc=0.8)
    hx = ctx.path.offset(ctx.hero_s, ctx.hero_lat, 0)
    pk.log('hero at (%.1f, %.1f)' % (hx.x, hx.y))
    for tt in (0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0):
        q = ctx.path.at(ctx.s_of_t(tt))
        la = ctx.path.at(min(ctx.path.length, ctx.s_of_t(tt) + 3.0))
        yaw = math.degrees(math.atan2(la.x - q.x, la.y - q.y))
        pk.log('  t=%.0f hero az %.1f (frame +-18.6)' % (tt, math.degrees(math.atan2(hx.x - q.x, hx.y - q.y)) - yaw))
    book_bridge(ctx, town, ctx.bridge_s, rng)
    # the sleeping giant teddy lies at the end of the line, in front of the right half of the
    # window, chin on its paws, facing the oncoming train: visible from 1 s to about 9 s
    top = pillow(ctx, town, ctx.bear_pos, face_to=(2.0, 20.0, 0.0), size=PILLOW)
    ctx.pillow = bpy.data.objects['Pillow']
    bp = (ctx.bear_pos[0], ctx.bear_pos[1], top - 0.5)
    ctx.bear_root = sitting_bear(ctx, town, bp, face_to=(2.0, 20.0, 0.0), sc=BEAR_SC)
    slippers(ctx, props_coll(ctx), rng)
    # (the toy crane was dropped: its jib and lights crossed the sky and the moon)
    plush_whale(ctx, town, (ctx.win_x1 + 10.0, WALL_Y - 22.0, 0.0), math.radians(160), rng)
    build_town(ctx, town, rng)
    build_props(ctx, props, rng)
    for c, r in ctx.clear_zones:
        clear_area(ctx, c, r)


# =============================================================================== main build
def build(ctx):
    global TRACK_END_S
    pk.render.setup(samples=48, exposure=-0.95, filter_size=1.0)
    pts = smooth_path_points(PATH_PTS, PATH_SIGMA) if PATH_SIGMA > 0 else PATH_PTS
    cam = pk.camera.drive(pts, speed_mps=SPEED, height=EYE, fov_v_deg=FOV_V, pitch_deg=PITCH,
                          look_ahead=3.0, sway=0.0, vibration=0.0, lean=0.6, max_roll_deg=1.2,
                          slow_after_s=max(10.0, BRAKE_T0), end_speed_factor=END_SPEED, slow_ease_s=SLOW_EASE,
                          start_s=40.0)
    # ctx.s_of_t (the kit's profile) still places the world; it equals cam_s_of_t up to BRAKE_T0
    outro_drive(ctx, cam, 40.0, look_ahead=3.0, lean=0.6, max_roll_deg=1.2)
    rock_and_tilt(cam)
    mbmax = os.environ.get('BR_MBMAX')
    if mbmax:                                 # debug: EEVEE motion blur cap (px)
        ctx.scene.eevee.motion_blur_max = int(mbmax)
    if os.environ.get('BR_NOMB'):
        ctx.scene.render.use_motion_blur = False
    fz = pk.fcurves(cam, 'rotation_euler', 2)[0]
    yaws = np.array([fz.evaluate(f) for f in range(ctx.frame_start, ctx.frame_end + 1)])
    pxd = 540.0 / math.tan(math.atan(math.tan(math.radians(FOV_V / 2)) * 1080 / 1920)) * math.pi / 180
    rate = np.abs(np.diff(yaws)) * 180 / math.pi * pxd
    pk.log('camera pan: peak %.1f px/frame (frames 1-50), %.1f (51-336) at 1080 wide' % (
        rate[:50].max(), rate[50:].max()))
    path = ctx.path
    ctx.track_end = path.length - 2.0 - TRACK_TRIM
    # window centred on where the train will be heading at t ~ 9.5 s
    s_e = ctx.s_of_t(9.5)
    p = path.at(s_e)
    t = path.tangent(s_e)
    k = (WALL_Y - p.y) / max(t.y, 1e-3)
    wc = p.x + t.x * k - 2.0
    ctx.win_x0, ctx.win_x1 = wc - WIN_W / 2, wc + WIN_W / 2
    pk.log('window centre x = %.2f (heading at 9.5 s %.1f deg)' % (wc, path.heading(s_e)))
    for tt in (1.0, 4.0, 7.0, 9.5):
        s = ctx.s_of_t(tt)
        q = path.at(s)
        h = path.heading(s)
        az0 = math.degrees(math.atan2(ctx.win_x0 - q.x, WALL_Y - q.y)) - h
        az1 = math.degrees(math.atan2(ctx.win_x1 - q.x, WALL_Y - q.y)) - h
        d = WALL_Y - q.y
        pk.log('t=%.1f s=%.1f pos=(%.1f,%.1f) head=%.1f window rel az %.1f..%.1f el %.1f..%.1f' % (
            tt, s, q.x, q.y, h, az0, az1, math.degrees(math.atan2(WIN_Z0 - EYE, d)),
            math.degrees(math.atan2(WIN_Z1 - EYE, d))))
    # sky directions (world azimuth / elevation)
    ctx.core_dir = (wc_az(ctx, 0.0) - float(os.environ.get('BR_CAZ', 17.0)), float(os.environ.get('BR_CEL', 32.0)))
    # between the two glazing bars for the whole run, below the transom's sweep, above the
    # teddy's ears at the reveal
    ctx.moon_dir = (wc_az(ctx, 0.0) + float(os.environ.get('BR_MAZ', 12.5)), float(os.environ.get('BR_MEL', 26.0)))
    ctx.sky_roll = float(os.environ.get('BR_ROLL', -26.0))
    ctx.sky_hfov = 64.0
    ctx.sky_gain = 1.25
    ctx.sky_contrast = 1.06
    ctx.sky_sat = SKY_SAT       # the compositor adds COMP_SAT on top
    ctx.sky_tint = (0.88, 0.95, 1.1)
    ctx.glow_color = (0.05, 0.12, 0.12)
    ctx.glow_strength = 0.12
    ctx.moon_size = MOON_SIZE
    ctx.moon_gain = 14.0
    ctx.ambient = AMBIENT

    s0 = ctx.s_of_t(0.0)
    # the hero sits on the axis of the opening straight: find the arc length where the path
    # is 46 units ahead of the start, and put the house left of the track there
    ctx.hero_s = s0 + 47.0
    ctx.hero_lat = float(os.environ.get('BR_HLAT', -9.8))
    ctx.bridge_s = s0 + 58.0
    ctx.bear_s = -1e9
    pe = path.at(ctx.track_end)
    ctx.bear_pos = (pe.x + BEAR_DX, WALL_Y - 9.0, 0.0)
    ctx.crane_s = s0 + 74.0
    rng = random.Random(21)
    ctx.clear_zones = []
    build_world(ctx, rng)
    build_train(ctx, cam)
    build_sky(ctx)
    # small practicals (fairy-light points) must not scatter in the haze: it veils the picture
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.data.type == 'POINT' and o.data.energy <= 60.0:
            o.data.volume_factor = 0.0
        if o.type == 'LIGHT' and o.name.startswith('CabFill'):
            o.data.specular_factor = 0.0
    # thin haze through the room
    pk.geo.fog(center=(10.0, 40.0, 34.0), size=(240.0, 180.0, 68.0), density=float(os.environ.get('BR_FOG', FOG)), falloff=200.0,
               color=(0.4, 0.55, 1.0), anisotropy=0.45, noise_amount=0.3)

    # moonlight through the window (cool), and window skylight
    maz, mel = ctx.moon_dir
    # soft (a hard 1.5 degree sun left thin slivers of moonlight between the houses that read
    # as bright scratches across the floor)
    # round 3: a distinct cool key. Everything but the floor gets its specular (rails, roofs,
    # the teddy's fur); the floor gets a diffuse-only copy (its glint drew bright lines along
    # the cupped board edges), which still lays the window's light and bar shadows on it
    floor_ob = bpy.data.objects['Floor']
    mr = bpy.data.collections.new('MoonReceivers')
    mr.objects.link(floor_ob)
    for co in mr.collection_objects:
        co.light_linking.link_state = 'EXCLUDE'
    moon_sun = pk.lights.sun(maz, mel, color=(0.5, 0.65, 1.0), strength=MOON_KEY, angle_deg=4.0, shadow=True,
                             name='MoonSun')
    moon_sun.data.specular_factor = 1.0
    moon_sun.data.volume_factor = 0.0      # a lit beam of haze read as a second sky card
    moon_sun.light_linking.receiver_collection = mr
    mf = bpy.data.collections.new('MoonFloorReceivers')
    mf.objects.link(floor_ob)
    moon_fl = pk.lights.sun(maz, mel, color=(0.5, 0.65, 1.0), strength=MOON_FLOOR, angle_deg=4.0, shadow=True,
                            name='MoonFloor')
    moon_fl.data.specular_factor = 0.0
    moon_fl.data.volume_factor = 0.0
    moon_fl.light_linking.receiver_collection = mf
    wcx = (ctx.win_x0 + ctx.win_x1) / 2
    pk.lights.area((wcx, WALL_Y - 1.0, (WIN_Z0 + WIN_Z1) / 2), (wcx, 0.0, 0.0), size=(WIN_W, WIN_Z1 - WIN_Z0),
                   color=(0.35, 0.48, 1.0), energy=9000.0, shadow=True, name='WindowSky').data.specular_factor = 0.0
    # cool fill from behind the camera (moonlit room bounce) so every camera-facing side reads
    pk.lights.area((6.0, -40.0, 60.0), (6.0, 70.0, 0.0), size=(90.0, 40.0), color=(0.07, 0.3, 1.0),
                   energy=BLUE_FILL, shadow=True, name='BlueFill').data.specular_factor = 0.25
    if os.environ.get('BR_HIDE'):            # debug: hide objects by name prefix
        pre = tuple(os.environ['BR_HIDE'].split(','))
        for o in bpy.data.objects:
            if o.name.startswith(pre):
                o.hide_render = True
    if os.environ.get('BR_CARDCHECK'):
        card_check(ctx)
    if os.environ.get('BR_PROBE'):
        parts = os.environ['BR_PROBE'].split(';')
        probe(ctx, float(parts[0]), [tuple(float(v) for v in q.split(',')) for q in parts[1:]])
    pk.comp.setup(bloom=0.85, bloom_threshold=1.4, bloom_size=0.45, glow=0.08, saturation=COMP_SAT, star_glow=0.0,
                  star_sparkle=0.0, road_streak=1.5, road_streak_px=110, road_streak_threshold=0.45,
                  vignette=0.3, sky_bloom=0.0, sky_bloom_floor=3.0)
    add_dof(ctx)
    post_grade(ctx)
    web_export_setup(ctx)
    if os.environ.get('BR_SHOW'):
        show(ctx)


def props_coll(ctx):
    return ctx.collection('Props')


def ticking_mat():
    """Cotton ticking (pillowcase): cream with soft blue stripes, a fine weave and sheen."""
    def mk():
        m, nt, out = pk._new_mat('BR_Ticking')
        co = pk.texcoord(nt, 'Object')
        x, y, z = pk.sep_xyz(nt, co)
        f = pk.math_(nt, 'FRACT', pk.math_(nt, 'MULTIPLY', x, 0.62))
        st = pk.math_(nt, 'MAXIMUM', pk.maprange(nt, f, 0.0, 0.05, 1.0, 0.0), pk.maprange(nt, f, 0.3, 0.35, 0.0, 1.0))
        st = pk.math_(nt, 'MULTIPLY', st, pk.maprange(nt, f, 0.35, 0.4, 1.0, 0.0))
        thin = pk.maprange(nt, pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', f, 0.62)), 0.0, 0.03, 1.0, 0.0)
        st = pk.math_(nt, 'MAXIMUM', st, pk.math_(nt, 'MULTIPLY', thin, 0.7))
        col = pk.mix_col(nt, st, (0.52, 0.5, 0.44), (0.07, 0.13, 0.36))
        col = pk._jitter_color(nt, col, 0.06, co, scale=0.3)
        w1 = pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', x, 40.0))
        w2 = pk.math_(nt, 'SINE', pk.math_(nt, 'MULTIPLY', y, 40.0))
        wr, _ = pk.noise(nt, co, scale=0.7, detail=3.0)
        nrm = pk.bump(nt, pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', w1, w2), pk.math_(nt, 'MULTIPLY', wr, 3.0)),
                      strength=0.12, distance=0.05)
        p = pk._principled(nt, base=col, rough=0.75, normal=nrm, sheen=0.6, sheen_tint=(0.8, 0.85, 1.0), spec=0.3)
        p.inputs['Sheen Roughness'].default_value = 0.4
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        pk._web(m, base=(0.4, 0.4, 0.42), rough=0.8)
        return m
    return cached('ticking', mk)


def pillow(ctx, coll, pos, face_to, size=(15.0, 14.0, 5.0)):
    """A plump bed pillow on the floor at the end of the line (the teddy sits on it): a
    superquadric cushion, pinched at the seam, with a piped edge. Returns the top height under
    the teddy (the middle sags)."""
    a, b, c = size[0] / 2, size[1] / 2, size[2] / 2
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=72, v_segments=36, radius=1.0)
    sag = 0.9
    for v in bm.verts:
        x, y, z = v.co
        sx = math.copysign(abs(x) ** 0.28, x)
        sy = math.copysign(abs(y) ** 0.28, y)
        sz = math.copysign(abs(z) ** 0.85, z)
        r = max(abs(sx), abs(sy))
        zz = c * sz * (1.0 - 0.35 * r ** 8)
        if z > 0:
            zz -= sag * math.exp(-((sx * a) ** 2 + (sy * b + 1.0) ** 2) / 22.0)
        v.co = Vector((a * sx * (1.0 + 0.04 * (1 - abs(sz))), b * sy * (1.0 + 0.04 * (1 - abs(sz))), zz + c))
    ob = obj_from_bm(bm, 'Pillow', ticking_mat(), coll, sharp=None, edges=False)
    F = Vector(face_to) - Vector(pos)
    F.z = 0.0
    F.normalize()
    set_xform(ob, (pos[0], pos[1], 0.0), yaw_facing(F))
    pts = []
    for ang in np.linspace(0, 2 * math.pi, 161):
        cx, cy = math.cos(ang), math.sin(ang)
        pts.append((a * 1.04 * math.copysign(abs(cx) ** 0.28, cx), b * 1.04 * math.copysign(abs(cy) ** 0.28, cy), c))
    pip_m = cached('piping', lambda: pk.mat.basic((0.05, 0.1, 0.3), roughness=0.6, name='BR_Piping'))
    pp = pk.geo.tube_along(pts, radius=0.22, segments=8, material=pip_m, name='PillowPiping', collection=coll)
    pp.parent = ob
    pp.matrix_parent_inverse = Matrix.Identity(4)
    return 2 * c - sag


def fleece_mat(color, name):
    return cached(name, lambda: plush_mat(color, name, sheen=0.9))


def slipper(coll, pos, yaw, name, color, roll=0.0, sc=1.0):
    """A giant fleece slipper (28 cm real): rubber sole, a domed toe cap with a soft collar
    round the opening, a pompom on the toe."""
    root = bpy.data.objects.new(name, None)
    pk._link(root, coll)
    root.location = pos
    root.rotation_euler = (0.0, roll, yaw)
    root.scale = (sc, sc, sc)
    fl = fleece_mat(color, 'BR_Fleece_%s' % name)
    lining = fleece_mat((0.55, 0.48, 0.42), 'BR_FleeceLining')
    sole_m = cached('sole', lambda: pk.mat.toy_plastic((0.32, 0.22, 0.14), name='BR_Sole', roughness=0.55))
    L, W = 7.0, 2.8
    outline = []
    for ang in np.linspace(0, 2 * math.pi, 48, endpoint=False):
        cx, cy = math.cos(ang), math.sin(ang)
        w = W / 2 * (0.82 + 0.18 * cy)           # wider at the toe (+Y)
        outline.append((w * math.copysign(abs(cx) ** 0.7, cx), L / 2 * math.copysign(abs(cy) ** 0.8, cy)))
    sbm = polygon_bm(outline, thick=0.45)
    bmesh.ops.rotate(sbm, verts=sbm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, 'X'))
    sole = obj_from_bm(sbm, name + 'Sole', sole_m, coll, sharp=40.0)
    P = [sole]
    P.append(ellipsoid(coll, name + 'Toe', (0.0, 1.0, 0.45), (1.45, 2.6, 1.55), fl))
    P.append(ellipsoid(coll, name + 'Heel', (0.0, -2.2, 0.45), (1.38, 1.3, 0.75), fl))
    # collar round the opening
    pts = [(1.25 * math.cos(t_), -1.0 + 1.35 * math.sin(t_), 1.15 + 0.25 * math.sin(t_)) for t_ in np.linspace(0, 2 * math.pi, 40)]
    P.append(pk.geo.tube_along(pts, radius=0.3, segments=10, material=fl, name=name + 'Collar', collection=coll))
    P.append(ellipsoid(coll, name + 'Inside', (0.0, -1.0, 0.9), (1.1, 1.25, 0.3), lining))
    P.append(ellipsoid(coll, name + 'Pom', (0.0, 2.6, 1.85), (0.6, 0.6, 0.55), lining))
    for o in P:
        o.parent = root
        o.matrix_parent_inverse = Matrix.Identity(4)
    return root


def clear_area(ctx, c, r, keep=('Slipper', 'Rail', 'Tie', 'Floor', 'Pillow', 'Wall', 'Ceiling', 'Skirting',
                                 'Bear', 'Sitting', 'Lamp')):
    """Hide every town or prop mesh whose bounding-box centre lies within r of c (xy), so a
    big prop can be dropped into the already-built town."""
    n = 0
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.name.startswith(keep) or o.hide_render:
            continue
        bb = [o.matrix_world @ Vector(v) for v in o.bound_box]
        cx = sum(v.x for v in bb) / 8
        cy = sum(v.y for v in bb) / 8
        ext = max(max(v.x for v in bb) - min(v.x for v in bb), max(v.y for v in bb) - min(v.y for v in bb))
        if ext > 30.0:
            continue
        if math.hypot(cx - c[0], cy - c[1]) < r:
            for q in [o] + list(o.children_recursive):
                q.hide_render = True
                q.hide_viewport = True
                ctx.web_skip.add(q.name)
            n += 1
    pk.log('cleared %d objects round (%.1f, %.1f)' % (n, c[0], c[1]))


def slippers(ctx, coll, rng):
    """Domestic scale cues: a pair of fleece slippers left beside the bed pillow at the end of
    the line, either side of the buffer stop."""
    path = ctx.path
    s0 = ctx.s_of_t(0.0)
    for (ds, lat, yaw_off, roll, col) in ((-8.0, 5.4, 2.6, 0.0, SLIPPER),
                                          (-12.5, -5.2, -2.9, 0.0, SLIPPER)):
        s = ctx.track_end + ds
        p = path.offset(s, lat, 0.0)
        yaw = -math.radians(path.heading(s)) + yaw_off
        z = 1.25 if roll else 0.0
        slipper(coll, (p.x, p.y, z), yaw, 'Slipper%d' % int(abs(ds)), col, roll=roll)
        ctx.clear_zones.append(((p.x, p.y), 4.0))
        # a warm toy-lamp pool on it so it reads
        lp = path.offset(s - 3.0, lat * 0.45, 4.5)
        pk.lights.spot(tuple(lp), (p.x, p.y, 1.2), (1.0, 0.6, 0.32), 700.0, angle_deg=60, blend=0.9, radius=0.3,
                       shadow=True, name='SlipperWash', collection=coll, volume=0.0)


def window_glass(ctx, coll):
    """Glass in the window: fully transparent, plus a faint reflection of the warm room (soft
    out-of-focus fairy-light dots, a low warm glow from the town, smudges), so the sky reads as
    seen through a pane."""
    wx0, wx1 = ctx.win_x0, ctx.win_x1
    m, nt, out = pk._new_mat('BR_WindowGlass')
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    vor = pk.node(nt, 'ShaderNodeTexVoronoi', feature='F1')
    pk._set(nt, vor.inputs['Vector'], pk.comb_xyz(nt, x, z, 0.0))
    vor.inputs['Scale'].default_value = 0.16
    vor.inputs['Randomness'].default_value = 1.0
    d = vor.outputs['Distance']
    rnd = pk.sep_xyz(nt, vor.outputs['Color'])[0]
    dots = pk.maprange(nt, d, 0.25, 0.75, 1.0, 0.0, interp='SMOOTHSTEP')
    dots = pk.math_(nt, 'MULTIPLY', dots, pk.maprange(nt, rnd, 0.55, 1.0, 0.0, 1.0))
    low = pk.maprange(nt, z, WIN_Z0, WIN_Z0 + 26.0, 1.0, 0.0, interp='SMOOTHSTEP')
    sm, _ = pk.noise(nt, co, scale=0.08, detail=4.0, rough=0.65)
    smudge = pk.maprange(nt, sm, 0.35, 0.75, 0.4, 1.4)
    e = pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', dots, pk.math_(nt, 'ADD', 0.25, low)), pk.math_(nt, 'MULTIPLY', low, 0.18))
    e = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'MULTIPLY', e, smudge), 0.012 * GLASS_REFL)
    em = pk.node(nt, 'ShaderNodeEmission')
    em.inputs['Color'].default_value = (1.0, 0.62, 0.32, 1.0)
    pk._set(nt, em.inputs['Strength'], e)
    tr = pk.node(nt, 'ShaderNodeBsdfTransparent')
    add = pk.node(nt, 'ShaderNodeAddShader')
    nt.links.new(tr.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.0, 0.0, 0.0), rough=0.1, alpha=0.0)
    ob = pk.mesh_object('WindowGlass', [(wx0, WALL_Y + 1.2, WIN_Z0), (wx1, WALL_Y + 1.2, WIN_Z0),
                                        (wx1, WALL_Y + 1.2, WIN_Z1), (wx0, WALL_Y + 1.2, WIN_Z1)],
                        [(0, 1, 2, 3)], material=m, smooth=False, collection=coll)
    ob.visible_shadow = False
    ob.visible_diffuse = False
    ob.visible_glossy = False
    ctx.web_skip.add(ob.name)
    return ob


def add_dof(ctx):
    """Miniature depth of field in the compositor: a variable-size bokeh blur whose radius is
    DOF_K * |1/z - 1/focus| px (at full resolution), capped at DOF_MAX. The sky (depth beyond
    800; the dithered, fully transparent glass writes no depth) is held sharp."""
    K = float(os.environ.get('BR_DOFK', DOF_K))
    if K <= 0:
        return
    focus = float(os.environ.get('BR_FOCUS', DOF_FOCUS))
    sc = ctx.args['scale']
    ng = ctx.scene.compositing_node_group
    rl = [n for n in ng.nodes if n.bl_idname == 'CompositorNodeRLayers'][0]
    img = rl.outputs['Image']
    users = [l.to_socket for l in ng.links if l.from_socket == img]
    depth = rl.outputs['Depth']
    sky = pk.maprange(ng, depth, 800.0, 1500.0, 0.0, 1.0)
    inv = pk.math_(ng, 'DIVIDE', 1.0, pk.math_(ng, 'MAXIMUM', depth, 0.05))
    coc = pk.math_(ng, 'MULTIPLY', pk.math_(ng, 'ABSOLUTE', pk.math_(ng, 'SUBTRACT', inv, 1.0 / focus)), K * sc)
    coc = pk.math_(ng, 'MINIMUM', coc, DOF_MAX * sc)
    coc = pk.math_(ng, 'MULTIPLY', coc, pk.math_(ng, 'SUBTRACT', 1.0, sky))
    bk = ng.nodes.new('CompositorNodeBokehImage')
    bk.inputs['Flaps'].default_value = 7
    bk.inputs['Roundness'].default_value = 0.9
    bb = ng.nodes.new('CompositorNodeBokehBlur')
    ng.links.new(img, bb.inputs['Image'])
    ng.links.new(bk.outputs['Image'], bb.inputs['Bokeh'])
    ng.links.new(coc, bb.inputs['Size'])
    for sock in users:
        if sock.node.bl_idname == 'CompositorNodeImageCoordinates':
            continue
        ng.links.new(bb.outputs['Image'], sock)
    ctx.dof_node = bb


def moon_glow(az, el, size_deg, lit_deg, strength):
    """Atmospheric glow that hugs the lit limb of the crescent (the kit's halo is a ring round
    the whole disc, which made the dark earthshine side read as a cut-out sticker). Additive
    rect layer at the moon direction: a tight and a wide exponential falloff measured from the
    middle of the lit crescent, faded on the earthshine side."""
    N = 256
    span = 7.0                                     # layer width in moon radii
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    x = (xx + 0.5 - N / 2) / (N / 2) * span / 2
    y = (N / 2 - (yy + 0.5)) / (N / 2) * span / 2
    th = math.radians(lit_deg)
    cx, cy = 0.72 * math.cos(th), 0.72 * math.sin(th)
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    rr = np.sqrt(x * x + y * y)
    side = np.clip(0.5 + 0.5 * (x * math.cos(th) + y * math.sin(th)) / np.maximum(rr, 1e-3), 0, 1)
    g = 0.22 * np.exp(-d / 0.32) + 0.05 * np.exp(-d / 1.1)
    g *= 0.35 + 0.65 * side ** 1.5
    g *= np.clip((span / 2 - rr) / 0.6, 0, 1)    # reach zero before the layer edge
    g = g * strength
    arr = np.stack([g * 0.82, g * 0.88, g * 1.0], -1).astype(np.float32)
    img = pk.np_image('br_moon_glow', arr)
    f, r, u = pk.sky.rect_frame(az, el, 0.0)
    fov = size_deg * span / 2
    k = 1.0 / max(float(arr.max()), 1e-6)
    pk.sky.add_rect_layer('moon_glow', img, f, r, u, fov, fov, gain=1.0, feather=0.0, blend='add',
                          web=dict(key='br_moon_glow_%d' % int(strength * 100), make=lambda a=arr, kk=k: (a, kk)))


def post_grade(ctx):
    """Final grade in the compositor (scene-linear, before the view transform): a black point
    and a luminance contrast around 0.18 (hue and saturation kept)."""
    bp = float(os.environ.get('BR_BP', BLACK_POINT))
    con = float(os.environ.get('BR_CON', CONTRAST))
    if bp <= 0 and abs(con - 1.0) < 1e-4:
        return
    ng = ctx.scene.compositing_node_group
    out = [n for n in ng.nodes if n.bl_idname == 'NodeGroupOutput'][0]
    src = out.inputs[0].links[0].from_socket
    img = src
    if bp > 0:
        img = pk.vmath(ng, 'MAXIMUM', pk.vmath(ng, 'SUBTRACT', img, (bp, bp, bp)), (0, 0, 0))
        img = pk.vmath(ng, 'SCALE', img, scale=1.0 / (1.0 - bp))
    if abs(con - 1.0) > 1e-4:
        lum = pk.vmath(ng, 'DOT_PRODUCT', img, pk.LUMA)
        k = pk.math_(ng, 'POWER', pk.math_(ng, 'DIVIDE', pk.math_(ng, 'MAXIMUM', lum, 1e-5), 0.18), con - 1.0)
        img = pk.vmath(ng, 'SCALE', img, scale=pk.math_(ng, 'MINIMUM', k, 4.0))
    ng.links.new(img, out.inputs[0])


def show(ctx):
    """Debug (BR_SHOW=1): log where the moon, the core, the teddy and the window bars land in
    the frame (x, y from the top left) over the run."""
    from bpy_extras.object_utils import world_to_camera_view
    sc = ctx.scene
    cam = ctx.camera
    M = ctx.bear_root.matrix_world
    items = [('moon', 'dir', ctx.moon_dir), ('core', 'dir', ctx.core_dir),
             ('bearTop', 'pt', M @ Vector((0, -0.6, 19.0))), ('bearEarR', 'pt', M @ Vector((3.5, 0.2, 19.7))),
             ('bearMid', 'pt', M @ Vector((0, -2.6, 8.0)))]
    wx0, wx1 = ctx.win_x0, ctx.win_x1
    for i, fr in enumerate(BAR_FRACS):
        x = wx0 + (wx1 - wx0) * fr
        items.append(('bar%d' % i, 'pt', Vector((x, WALL_Y + 1.2, 30.0))))
    items.append(('transom', 'pt', Vector(((wx0 + wx1) / 2, WALL_Y + 1.2, WIN_Z0 + (WIN_Z1 - WIN_Z0) * 0.85))))
    for t in (0.0, 1.0, 2.0, 4.0, 7.0, 9.5, 12.0):
        sc.frame_set(int(round(ctx.t2f(t))))
        o = cam.matrix_world.translation
        parts = []
        for nm, kind, p in items:
            w = o + pk.sky_dir(*p) * 5000.0 if kind == 'dir' else Vector(p)
            v = world_to_camera_view(sc, cam, w)
            parts.append('%s(%.2f,%.2f)' % (nm, v.x, 1 - v.y))
        pk.log('show t=%4.1f ' % t + ' '.join(parts))


def probe(ctx, t, pts, rad=0.006, n=5):
    """Debug: log which objects the camera sees at normalized frame points (x, y from top-left)
    at time t (set BR_PROBE='t;x,y;x,y')."""
    sc = ctx.scene
    sc.frame_set(int(round(ctx.t2f(t))))
    dg = bpy.context.evaluated_depsgraph_get()
    cam = ctx.camera
    tr, br_, bl, tl = [cam.matrix_world @ v for v in cam.data.view_frame(scene=sc)]
    o = cam.matrix_world.translation
    for (x, y) in pts:
        hits = {}
        for dx in np.linspace(-rad, rad, n):
            for dy in np.linspace(-rad, rad, n):
                xx, yy = x + dx, y + dy
                top = tl.lerp(tr, xx)
                bot = bl.lerp(br_, xx)
                q = top.lerp(bot, yy)
                dvec = (q - o).normalized()
                ok, loc, nrm, idx, ob, M = sc.ray_cast(dg, o, dvec)
                if ok and ob.name == 'Fog':
                    ok, loc, nrm, idx, ob, M = sc.ray_cast(dg, loc + dvec * 0.01, dvec)
                if ok:
                    nm = ob.name
                    if nm == 'Floor':
                        rd = Vector((dvec.x, dvec.y, -dvec.z))
                        ok2, l2, n2, i2, ob2, M2 = sc.ray_cast(dg, loc + rd * 0.01, rd)
                        while ok2 and ob2.name == 'Fog':
                            ok2, l2, n2, i2, ob2, M2 = sc.ray_cast(dg, l2 + rd * 0.01, rd)
                        nm = 'Floor>' + (ob2.name if ok2 else 'sky')
                    hits[nm] = hits.get(nm, 0) + 1
        pk.log('probe t=%.1f (%.3f, %.3f):' % (t, x, y), sorted(hits.items(), key=lambda kv: -kv[1])[:6])


def card_check(ctx, cy=0.715, dy=120.0, x0=60.0, x1=1020.0, min_emit=2.0):
    """Debug (BR_CARDCHECK=1, no render): over the end-card hold, log every emitter (cluster of
    emissive faces with pk_web emit_strength >= min_emit) and its floor mirror image seen within
    dy px of the card line (cap band centre at cy of the height, x0..x1 at 1080 x 1920), the
    Moon's unoccluded fraction, the teddy's head top and the Moon and head drift per frame."""
    sc = ctx.scene
    cam = ctx.camera
    W, H = 1080.0, 1920.0
    fpx = (H / 2) / math.tan(math.radians(FOV_V) / 2)
    skip = ('Fog', 'WindowGlass')
    pts, names, strs = [], [], []
    for ob in sc.objects:
        if ob.type != 'MESH' or ob.hide_render:
            continue
        st = []
        for sl in ob.material_slots:
            w = sl.material.get('pk_web') if sl.material else None
            e = float(w['emit_strength']) if w and 'emit_strength' in w and max(list(w['emit'])) > 0 else 0.0
            st.append(e)
        if not st or max(st) < min_emit:
            continue
        M = ob.matrix_world
        seen = set()
        for pg in ob.data.polygons:
            e = st[pg.material_index] if pg.material_index < len(st) else 0.0
            if e < min_emit:
                continue
            q = M @ pg.center
            key = (round(q.x / 0.2), round(q.y / 0.2), round(q.z / 0.2))
            if key in seen:
                continue
            seen.add(key)
            pts.append(tuple(q))
            names.append(ob.name)
            strs.append(e)
    P = np.array(pts)
    pk.log('card check: %d emitter points' % len(P))
    dg = bpy.context.evaluated_depsgraph_get()

    def clear(o, q, own):
        d = q - o
        L = d.length
        d.normalize()
        oo = o.copy()
        for _ in range(8):
            ok, loc, nrm, idx, ob, M = sc.ray_cast(dg, oo, d, distance=max(L - (oo - o).length - 0.12, 0.0))
            if not ok:
                return True
            if ob.name.startswith(skip):
                oo = loc + d * 0.01
                continue
            return ob.name == own
        return False

    def proj(Mi, X):
        c = (Mi @ np.c_[X, np.ones(len(X))].T).T[:, :3]
        z = -c[:, 2]
        with np.errstate(divide='ignore', invalid='ignore'):
            return W / 2 + fpx * c[:, 0] / z, H / 2 - fpx * c[:, 1] / z, z
    mdir = pk.sky_dir(*ctx.moon_dir)
    up = Vector((0, 0, 1))
    mr = mdir.cross(up).normalized()
    mu = mr.cross(mdir).normalized()
    rad = math.radians(MOON_SIZE / 2)
    disc = [(a, b) for a in np.linspace(-1, 1, 15) for b in np.linspace(-1, 1, 15) if a * a + b * b <= 1.0]
    la, lb = math.cos(math.radians(MOON_LIT)), math.sin(math.radians(MOON_LIT))
    # the lit crescent (phase 0.17): beyond the terminator ellipse (semi-axis 1 - 2 * 0.17) on the lit side
    lit = [(a * la + b * lb) > (1 - 2 * 0.17) * math.sqrt(max(0.0, 1 - (b * la - a * lb) ** 2)) for a, b in disc]
    bear = [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('Bear')]
    BV = np.concatenate([np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices]) for o in bear])
    agg, prev = {}, None
    f_end = int(round(ctx.t2f(13.6)))
    for f in range(int(round(ctx.t2f(10.875))), f_end + 1):
        t = ctx.f2t(f)
        sc.frame_set(f)
        Mi = np.array(cam.matrix_world.inverted())
        o = cam.matrix_world.translation.copy()
        hits = []
        for mirror in (False, True):
            X = P * (1, 1, -1) if mirror else P
            px, py, z = proj(Mi, X)
            sel = np.where((z > 0.1) & (px > x0) & (px < x1) & (np.abs(py - cy * H) < dy))[0]
            for i in sel:
                q = Vector(pts[i])
                if mirror:
                    m_ = Vector(X[i])
                    fl = o + (m_ - o) * (o.z / (o.z - m_.z))
                    vis = clear(o, fl, 'Floor') and clear(fl + Vector((0, 0, 0.02)), q, names[i])
                else:
                    vis = clear(o, q, names[i])
                if vis:
                    hits.append((names[i] + ('>floor' if mirror else ''), strs[i], px[i], py[i]))
        for nm, e, x, y in hits:
            a = agg.setdefault(nm, [e, 0, 1e9, 1e9, -1e9, t, t, 1e9, -1e9])
            a[1] += 1
            a[2] = min(a[2], abs(y - cy * H))
            a[3], a[4] = min(a[3], x), max(a[4], x)
            a[5], a[6] = min(a[5], t), max(a[6], t)
            a[7], a[8] = min(a[7], y), max(a[8], y)
        mv = ml = 0
        for (a, b), lt in zip(disc, lit):
            d = (mdir + mr * (a * rad) + mu * (b * rad)).normalized()
            oo = o.copy()
            vis = True
            for _ in range(8):
                ok, loc, nrm, idx, ob, M = sc.ray_cast(dg, oo, d)
                if ok and ob.name.startswith(skip):
                    oo = loc + d * 0.01
                    continue
                vis = not ok
                break
            mv += vis
            ml += vis and lt
        mx, my, _ = proj(Mi, np.array([tuple(o + mdir * 1e4)]))
        bx, by, _ = proj(Mi, BV)
        cur = (mx[0], my[0], by.min())
        dm = '' if prev is None else ' moon step (%+.2f, %+.2f) head step %+.2f' % (
            cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2])
        prev = cur
        if f % 6 == 1 or f == f_end:
            pk.log('card check t=%.2f: %d lit points near the card, moon (%.0f, %.0f) %.0f%% clear (lit limb %.0f%%), '
                   'head top y %.0f (%.1f%%)%s' % (t, len(hits), mx[0], my[0], 100.0 * mv / len(disc),
                                                   100.0 * ml / max(1, sum(lit)),
                                                   by.min(), 100 * by.min() / H, dm))
    # floor-string bulbs one by one: seen (any of 5 points on the bulb unoccluded, so a bulb
    # peeking past an edge counts) within dy of the card line, directly or as a floor mirror image
    for nm, (bpos, br) in BULBS.items():
        seen = {}
        for f in range(int(round(ctx.t2f(10.875))), f_end + 1, 2):
            sc.frame_set(f)
            Mi = np.array(cam.matrix_world.inverted())
            o = cam.matrix_world.translation.copy()
            for i, q in enumerate(bpos):
                for mirror in (False, True):
                    m_ = Vector((q.x, q.y, -q.z)) if mirror else q
                    px, py, z = proj(Mi, np.array([tuple(m_)]))
                    if not (z[0] > 0.1 and x0 < px[0] < x1 and abs(py[0] - cy * H) < dy):
                        continue
                    vd = (m_ - o).normalized()
                    side = vd.cross(Vector((0, 0, 1))).normalized()
                    vis = False
                    for off in (Vector(), side * br, -side * br, Vector((0, 0, br)), Vector((0, 0, -br))):
                        tq = m_ + off * 0.9
                        if mirror:
                            fl = o + (tq - o) * (o.z / (o.z - tq.z))
                            v_ = clear(o, fl, 'Floor') and clear(fl + Vector((0, 0, 0.02)), q, nm)
                        else:
                            v_ = clear(o, tq, nm)
                        if v_:
                            vis = True
                            break
                    if vis:
                        e = seen.setdefault((i, mirror), [ctx.f2t(f), ctx.f2t(f), px[0], py[0]])
                        e[1] = ctx.f2t(f)
        for (i, mirror), e in sorted(seen.items()):
            pk.log('  bulb %s[%d]%s at (%.1f, %.1f): near the card %.2f..%.2f s (first at x %.0f y %.0f)' % (
                nm, i, ' mirror' if mirror else '', bpos[i].x, bpos[i].y, e[0], e[1], e[2], e[3]))
    ss_ = np.arange(0.0, ctx.path.length, 0.1)
    PP = np.array([tuple(ctx.path.at(float(v)))[:2] for v in ss_])
    for nm in sorted({n.split('>')[0] for n in agg}):
        ob = bpy.data.objects[nm]
        c = sum((ob.matrix_world @ Vector(b) for b in ob.bound_box), Vector()) / 8
        i = int(np.argmin(np.linalg.norm(PP - np.array([c.x, c.y]), axis=1)))
        pk.log('  %s centre (%.1f, %.1f, %.1f), path s %.1f (camera at s %.1f / %.1f at 11.3 / 13.6 s), track end %.1f' % (
            nm, c.x, c.y, c.z, ss_[i], ctx.cam_s_of_t(11.3), ctx.cam_s_of_t(13.6), ctx.track_end))
    for nm, a in sorted(agg.items(), key=lambda kv: kv[1][2]):
        pk.log('  near card: %-28s emit %5.1f  %3d pts  min |dy| %5.1f  x %4.0f..%4.0f  y %4.0f..%4.0f  t %.2f..%.2f' % (
            nm, a[0], a[1], a[2], a[3], a[4], a[7], a[8], a[5], a[6]))


def wc_az(ctx, t):
    wcx = (ctx.win_x0 + ctx.win_x1) / 2
    q = ctx.path.at(ctx.s_of_t(t))
    return math.degrees(math.atan2(wcx - q.x, WALL_Y - q.y))


# =============================================================================== web edition only
# Nothing below changes the film render: web_export_setup only sets custom properties that the
# kit's export_web and the three.js viewer read, and the window atlas runs inside export_web,
# which povkit.main calls after any stills or frames.
BEAR_RIM_WEB_RANGE = 30.0     # m (units): the rims reach the head (14) and shoulders, not the town
BLUE_FILL_WEB_PRIORITY = 40.0
WIN_ATLAS_BINS = 4            # per-window brightness levels in the atlas (fract(pk_rand * 7.3))
WIN_ATLAS_W, WIN_ATLAS_H, WIN_ATLAS_PAD = 1024, 1024, 12


def web_export_setup(ctx):
    # the varnished floor's amber and magenta streaks are reflections: a planar mirror in the viewer
    fl = bpy.data.objects['Floor']
    fl['mirror_strength'] = 1.0
    fl['mirror_streak'] = 1.5
    for o in bpy.data.objects:
        if o.type != 'LIGHT':
            continue
        base = o.name.split('.')[0]
        # the teddy's key, fill, rims and pillow wash keep a slot in the viewer's spot pool
        if base in ('BearWarm', 'BearCool', 'PillowWash', 'BearRim'):
            o['pk_priority'] = 8.0
        # glTF has no light linking: keep the rim stand-ins on the teddy, off the town
        if base == 'BearRim':
            o['pk_range'] = BEAR_RIM_WEB_RANGE
        # the cab fills, sheen and rim are light-linked to the loco: their stand-ins get an
        # automatic range from those receivers
        if base in ('CabFill', 'CabRim', 'CabCool') and 'pk_noexport' in o:
            del o['pk_noexport']
    # the cobalt fill from behind the camera: the default spot stand-in keeps the panel's 1/d^2
    # falloff (the near track and town get about 2x a 0.61 W/m2 sun, the far window frame about
    # half), and a high priority keeps it in the viewer's spot pool all film long
    bpy.data.objects['BlueFill']['pk_priority'] = BLUE_FILL_WEB_PRIORITY


def _box_window_mask(U, V):
    """numpy copy of box_window_mat's emission mask (hot centre, cross bar, curtains), 0..1.3."""
    def ss(x, a, b):
        t = np.clip((x - a) / (b - a), 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)

    def lin(x, a, b, lo, hi):
        return lo + np.clip((x - a) / (b - a), 0.0, 1.0) * (hi - lo)
    g = 1.3 + (0.35 - 1.3) * ss(np.hypot(U - 0.5, V - 0.62), 0.0, 0.85)
    cb = np.maximum(lin(np.abs(U - 0.5), 0.035, 0.05, 1.0, 0.0), lin(np.abs(V - 0.58), 0.03, 0.045, 1.0, 0.0))
    cur = np.maximum(0.75 * (1.0 - ss(U, 0.1, 0.2)), 0.75 * ss(U, 0.8, 0.9))
    return g * (1.0 - cb) * (1.0 - cur)


def web_box_windows(objs):
    """Export only. glTF cannot carry BR_BoxWindow's per-window colour (a pk_rand ramp) or its
    pattern, so every web window was the same flat cream. Bake one emissive atlas: a row per
    ramp colour plus a dark row for the unlit windows, a column per brightness level, each cell
    the film's own mask. Each window's glow face is moved into its cell (UVs), and all window
    meshes share one material and one texture (no extra draw calls)."""
    src = bpy.data.materials.get('BR_BoxWindow')
    if src is None:
        return 0
    nb, W, H, pad = WIN_ATLAS_BINS, WIN_ATLAS_W, WIN_ATLAS_H, WIN_ATLAS_PAD
    nrow = len(BOX_WIN_STOPS) + 1
    cw, ch = W // nb, H // (nrow + 1)
    bright = [0.55 + 0.7 * (c + 0.5) / nb for c in range(nb)]
    norm = 1.3 * max(bright)
    xs = np.clip((np.arange(cw) + 0.5 - pad) / (cw - 2 * pad), 0.0, 1.0)
    ys = np.clip((np.arange(ch) + 0.5 - pad) / (ch - 2 * pad), 0.0, 1.0)
    U, V = np.meshgrid(xs, ys)
    mask = _box_window_mask(U, V)
    img = np.zeros((H, W, 3), np.float32)        # bottom row first (Blender pixel order)
    for r, (_, col) in enumerate(BOX_WIN_STOPS):
        for c in range(nb):
            img[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = mask[..., None] * np.array(col) * (bright[c] / norm)
    srgb = np.where(img <= 0.0031308, img * 12.92, 1.055 * np.power(np.maximum(img, 0.0031308), 1 / 2.4) - 0.055)
    rgba = np.concatenate([srgb, np.ones((H, W, 1), np.float32)], axis=2)
    im = bpy.data.images.new('BR_WinAtlas', W, H, alpha=False)
    im.colorspace_settings.name = 'sRGB'
    im.pixels.foreach_set(rgba.ravel())
    im.pack()
    m, nt, out = pk._new_mat('BR_BoxWindow_web')
    tx = pk.node(nt, 'ShaderNodeTexImage', image=im, interpolation='Linear', extension='EXTEND')
    p = pk._principled(nt, base=(0.02, 0.012, 0.008), rough=0.5, emit_strength=WIN_GLOW * norm)
    nt.links.new(tx.outputs['Color'], p.inputs['Emission Color'])
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    done, nwin, nunlit = set(), 0, 0
    for o in objs:
        if o.type != 'MESH' or o.data.name_full in done:
            continue
        me = o.data
        done.add(me.name_full)
        slots = [i for i, mm in enumerate(me.materials) if mm == src]
        a = me.attributes.get('pk_rand')
        uvl = me.uv_layers.get('UVMap')
        if not slots or a is None or a.domain != 'FACE' or uvl is None:
            continue
        npoly = len(me.polygons)
        rnd = np.empty(npoly, np.float32)
        a.data.foreach_get('value', rnd)
        mi = np.empty(npoly, np.int32)
        me.polygons.foreach_get('material_index', mi)
        ls = np.empty(npoly, np.int32)
        me.polygons.foreach_get('loop_start', ls)
        lt = np.empty(npoly, np.int32)
        me.polygons.foreach_get('loop_total', lt)
        uv = np.empty(len(me.loops) * 2, np.float32)
        uvl.data.foreach_get('uv', uv)
        uv = uv.reshape(-1, 2)
        for f in np.nonzero(np.isin(mi, slots))[0]:
            r_ = float(rnd[f])
            if r_ < 1.0:
                fac = (r_ * 3.7) % 1.0
                row = max(i for i, (pos, _) in enumerate(BOX_WIN_STOPS) if fac >= pos)
                col = min(int(((r_ * 7.3) % 1.0) * nb), nb - 1)
                nwin += 1
            else:
                row, col = nrow - 1, 0
                nunlit += 1
            sl = slice(ls[f], ls[f] + lt[f])
            uv[sl, 0] = (col * cw + pad + np.clip(uv[sl, 0], 0, 1) * (cw - 2 * pad)) / W
            uv[sl, 1] = (row * ch + pad + np.clip(uv[sl, 1], 0, 1) * (ch - 2 * pad)) / H
        uvl.data.foreach_set('uv', uv.ravel())
        for i in slots:
            me.materials[i] = m
        me.update()
    pk.log('web: BR_BoxWindow atlas %dx%d, %d lit and %d unlit windows, emissive strength %.1f'
           % (W, H, nwin, nunlit, WIN_GLOW * norm))
    return nwin + nunlit


def web_doll_window():
    """Export only: BR_DollWindow (kit lit_window, 2 x 3 panes) flattens to one cream panel in
    glTF. Bake its pane pattern at the mean window (frame and mullions dark, warm hot spot near
    the top, side curtains) to an emissive texture; the frame keeps its cream base colour."""
    m = bpy.data.materials.get('BR_DollWindow')
    if m is None or m.node_tree is None:
        return
    n, fw, mw, strength, curtains = 256, 0.09, 0.05, 16.0, 0.45
    c = (np.arange(n) + 0.5) / n
    U, V = np.meshgrid(c, c)
    fr = (U < fw) | (U > 1 - fw) | (V < fw) | (V > 1 - fw) | (np.abs(U - 0.5) < mw / 2)
    for k in (1, 2):
        fr |= np.abs(V - k / 3.0) < mw / 2
    t = np.clip(np.hypot(U - 0.5, V - 0.78) / 0.9, 0.0, 1.0)
    glow = 1.6 + (0.45 - 1.6) * t * t * (3.0 - 2.0 * t)
    side = np.clip((np.abs(U - 0.5) - 0.22) / 0.26, 0.0, 1.0)
    sil = np.clip((side + 0.25 - 0.7) / 0.2, 0.0, 1.0) * curtains
    e = glow * 0.97 * (1.0 - 0.75 * sil) * (~fr)
    norm = float(e.max())
    img = (e / norm)[..., None] * np.array((1.0, 0.51, 0.17))
    srgb = np.where(img <= 0.0031308, img * 12.92, 1.055 * np.power(np.maximum(img, 0.0031308), 1 / 2.4) - 0.055)
    rgba = np.concatenate([srgb, np.ones((n, n, 1))], axis=2).astype(np.float32)
    im = bpy.data.images.new('BR_DollWinTex', n, n, alpha=False)
    im.colorspace_settings.name = 'sRGB'
    im.pixels.foreach_set(rgba.ravel())
    im.pack()
    nt = m.node_tree
    nt.nodes.clear()
    out = pk.node(nt, 'ShaderNodeOutputMaterial')
    tx = pk.node(nt, 'ShaderNodeTexImage', image=im, interpolation='Linear', extension='EXTEND')
    p = pk._principled(nt, base=(0.7, 0.66, 0.55), rough=0.2, emit_strength=strength * norm)
    nt.links.new(tx.outputs['Color'], p.inputs['Emission Color'])
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk.log('web: BR_DollWindow pane texture %dx%d, emissive strength %.1f' % (n, n, strength * norm))


# Blender's room haze (volume density FOG, colour (0.4, 0.55, 1.0), lit by WindowSky and the rims)
# veils the window sky in cobalt; the web sky has no volume. Measured on star-free window patches
# at 7 and 9.5 s it adds about (0, 0.005, 0.02) scene-linear high up and more near the horizon,
# so the web sky.json gets that as its horizon glow (this replaces the faint teal 0.12 x
# (0.05, 0.12, 0.12) glow, which lies behind the town). The film's world keeps its own.
WEB_SKY_HAZE = {'color': [0.12, 0.36, 1.0], 'strength': 0.09, 'height_deg': 55.0}


def _sky_export_json_br(path):
    import json
    _kit_sky_export_json(path)
    with open(path) as fh:
        j = json.load(fh)
    j['horizon_glow'] = dict(WEB_SKY_HAZE)
    with open(path, 'w') as fh:
        json.dump(j, fh, indent=2)
    pk.log('web: sky.json horizon glow -> %s' % WEB_SKY_HAZE)


def web_material_extras():
    """Export only, after the kit flattens the materials: plush and velvet sheen
    (KHR_materials_sheen; the fur reads honey and its silhouette catches the rims, as the film's
    sheen lobe does) and the dollhouse window texture."""
    k = 0
    for m in bpy.data.materials:
        sh = m.get('pk_web_sheen')
        if sh is None or m.node_tree is None:
            continue
        p = next((nd for nd in m.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED'), None)
        if p is None:
            continue
        p.inputs['Sheen Weight'].default_value = float(sh['weight'])
        p.inputs['Sheen Tint'].default_value = list(sh['tint'])[:3] + [1.0]
        p.inputs['Sheen Roughness'].default_value = float(sh['rough'])
        k += 1
    pk.log('web: sheen on %d plush and velvet materials' % k)
    web_doll_window()


_kit_web_unlit_windows = pk._web_unlit_windows
_kit_web_materials = pk._web_materials
_kit_sky_export_json = pk.sky.export_json


def _web_unlit_windows_br(objs):
    """export_web calls _web_unlit_windows first, before it flattens the materials: run the
    window atlas there, then the kit's own pass (BR_DollWindow's unlit faces)."""
    web_box_windows(objs)
    return _kit_web_unlit_windows(objs)


def _web_materials_br():
    _kit_web_materials()
    web_material_extras()


pk._web_unlit_windows = _web_unlit_windows_br
pk._web_materials = _web_materials_br
pk.sky.export_json = _sky_export_json_br


pk.main(SLUG, build)
