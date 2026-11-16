"""03-first-snow-village: before dawn on the night of the first snow, a vintage car (candy-red
lacquer hood cleared by the heater, chrome jet ornament, snow packed into the windshield corners,
headlamps on) drives the right-hand lane of a mountain village under a tunnel of light arches: the
road lies under fresh snow and our own wet tyre tracks mirror the lights; clapboard cottages with
string lights, firs wrapped in bulbs, a stone clock tower, one warm bakery; the lane opens into a
square with a great lit fir under a canopy of light strands.
Sky: the real Milky Way and NASA star field (kit galactic) with the aurora of the Eielson AFB
photograph (USAF, public domain) added as a starless layer, and a real crescent moon.

Run (from workspace/pov-films):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 \
    -P films/03-first-snow-village/build.py -- --stills 1.0,4.0,7.0,9.5 --scale 0.5

Set SN_DEBUG=1 to print where the landmarks sit in frame over time (no render needed).
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

SLUG = '03-first-snow-village'
SPEED = 6.2          # m/s cruise (faster than round 1 so the near parallax reads)
LANE = 1.55          # the car keeps to the right-hand lane: eye 1.55 m right of the centre line
RW = 7.4             # road width (two lanes)
EIELSON = os.path.join(pk.ASSETS, 'sky', 'wm-aurora-eielson-2005',
                       'Aurora_borealis_over_Eielson_Air_Force_Base_Alaska.jpg')

# ----------------------------------------------------------------------------------------
# palette: warm tungsten windows and sodium lamps against cool blue snow; bulbs limited to
# warm white, red, green and gold with a rare ice-blue accent
# ----------------------------------------------------------------------------------------
WARM = (1.0, 0.56, 0.22)
GOLD = (1.0, 0.72, 0.36)
AMBER = (1.0, 0.45, 0.12)
SODIUM = (1.0, 0.47, 0.13)
CANDY_RED = (0.95, 0.06, 0.08)
CANDY_PINK = (0.92, 0.32, 0.42)
XMAS_GREEN = (0.12, 0.85, 0.28)
WARM_WHITE = (1.0, 0.8, 0.52)
ICE_BLUE = (0.4, 0.62, 1.0)
CYAN = (0.2, 0.85, 1.0)
MINT = (0.35, 0.9, 0.72)
LEMON = (1.0, 0.82, 0.2)
BULB_MULTI = [CANDY_RED, WARM_WHITE, XMAS_GREEN, GOLD, CANDY_RED, WARM_WHITE, ICE_BLUE]
BULB_WARM = [WARM_WHITE, (1.0, 0.66, 0.34)]
BULB_CANDY = [CANDY_RED, WARM_WHITE, XMAS_GREEN, WARM_WHITE]

# walls: painted clapboard and plaster in natural colours (cream, barn red, fir green,
# slate blue, butter, timber), so the light carries the colour, not the walls
WALLS = [(0.86, 0.78, 0.62), (0.5, 0.1, 0.08), (0.17, 0.3, 0.22), (0.3, 0.4, 0.58),
         (0.9, 0.74, 0.44), (0.42, 0.26, 0.16), (0.82, 0.82, 0.84), (0.62, 0.3, 0.2)]
TRIMS = [(0.93, 0.92, 0.88), CANDY_RED, (0.93, 0.92, 0.88), (0.12, 0.35, 0.22), (0.95, 0.85, 0.6),
         (0.93, 0.92, 0.88)]
WASHES = [(1.0, 0.66, 0.4), (1.0, 0.75, 0.5), (1.0, 0.62, 0.36)]
ROOFS = [(0.12, 0.08, 0.08), (0.3, 0.07, 0.05), (0.07, 0.12, 0.12), (0.14, 0.12, 0.14)]

DEBUG = bool(os.environ.get('SN_DEBUG'))
M = {}          # material cache


def nt_out(name):
    return pk._new_mat(name)


# ----------------------------------------------------------------------------------------
# materials made here (snow, slush, ice, stripes, frost)
# ----------------------------------------------------------------------------------------
def snow_mat(name='Snow', color=(0.64, 0.72, 0.92), rough=0.5, sss=0.35, sparkle=1.0, scale=1.0,
             lumps=0.25):
    if name in M:
        return M[name]
    m, nt, out = nt_out(name)
    co = pk.texcoord(nt, 'Object')
    f1, _ = pk.noise(nt, co, scale=0.5 / scale, detail=3.0)
    f2, _ = pk.noise(nt, co, scale=6.0 / scale, detail=4.0, rough=0.6)
    col = pk.vmath(nt, 'SCALE', color, scale=pk.maprange(nt, f1, 0.3, 0.7, 0.9, 1.06))
    ao = pk.node(nt, 'ShaderNodeAmbientOcclusion', samples=8)
    ao.inputs['Distance'].default_value = 0.5
    occ = pk.maprange(nt, ao.outputs['AO'], 0.2, 1.0, 1.0, 0.0)
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', occ, 0.55), col,
                     pk.vmath(nt, 'MULTIPLY', color, (0.35, 0.5, 0.95)))
    h = pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', f2, 0.6), pk.math_(nt, 'MULTIPLY', f1, 0.4))
    nrm = pk.bump(nt, h, strength=lumps, distance=0.02)
    rv = pk.maprange(nt, f2, 0.3, 0.7, rough * 0.85, rough * 1.1)
    if sparkle > 0:
        vo = pk.voronoi(nt, co, scale=160.0 / scale, feature='F1')
        cr = pk.sep_xyz(nt, vo['Color'])[0]
        glint = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, cr, 0.9, 0.93, 0.0, 1.0),
                         pk.maprange(nt, vo['Distance'], 0.15, 0.3, 1.0, 0.0))
        tilt = pk.vmath(nt, 'SUBTRACT', vo['Color'], (0.5, 0.5, 0.5))
        nrm = pk.vmath(nt, 'NORMALIZE', pk.vmath(nt, 'ADD', nrm,
                                                 pk.vmath(nt, 'SCALE', tilt, scale=pk.math_(nt, 'MULTIPLY', glint, 1.6 * sparkle))))
        rv = pk.mix_f(nt, glint, rv, 0.06)
    p = pk._principled(nt, base=col, rough=rv, normal=nrm, sss=sss, sss_radius=(0.45, 0.65, 1.0),
                       sss_scale=0.06, spec=0.5)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=rough)
    M[name] = m
    return m


def slush_mat(name='Slush', road_w=7.4):
    """Two-lane village road under the first snow (round 3): a fresh blue-white dusting with
    sparkle covers the road; two pairs of dark wet tyre tracks per lane (where cars have
    already driven) run ahead as leading lines and mirror the lights; grey slush shoulders
    along each track, a pressed snow hump between them, small pools inside the tracks, and the
    dashed centre line only peeking through the thin snow."""
    m, nt, out = nt_out(name)
    uv = pk.node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
    U, V, _ = pk.sep_xyz(nt, uv)
    p3 = pk.comb_xyz(nt, U, V, 0.0)
    wn, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', V, 0.035), 1.7, 0.0), scale=1.0, detail=1.0)
    Uw = pk.math_(nt, 'ADD', U, pk.maprange(nt, wn, 0.3, 0.7, -0.12, 0.12))

    def dist_to(c):
        return pk.math_(nt, 'ABSOLUTE', pk.math_(nt, 'SUBTRACT', Uw, c))
    lane_c = road_w / 4
    d_r = pk.math_(nt, 'MINIMUM', dist_to(LANE - 0.76), dist_to(LANE + 0.76))      # under our own wheels
    d_l = pk.math_(nt, 'MINIMUM', dist_to(-lane_c - 0.78), dist_to(-lane_c + 0.78))
    # track edge wobble so the tracks are not ruled lines
    ed, _ = pk.noise(nt, pk.vmath(nt, 'MULTIPLY', p3, (9.0, 2.0, 1.0)), scale=1.0, detail=2.0)
    wob = pk.maprange(nt, ed, 0.3, 0.7, -0.04, 0.04)
    d_r = pk.math_(nt, 'ADD', d_r, wob)
    d_l = pk.math_(nt, 'ADD', d_l, wob)
    t_r = pk.maprange(nt, d_r, 0.085, 0.14, 1.0, 0.0, interp='SMOOTHSTEP')
    t_l = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, d_l, 0.08, 0.13, 1.0, 0.0, interp='SMOOTHSTEP'), 0.95)
    tracks = pk.math_(nt, 'MAXIMUM', t_r, t_l)
    dmin = pk.math_(nt, 'MINIMUM', d_r, d_l)
    # slush shoulders beside each track (grey, half wet), snow beyond
    shoulder = pk.maprange(nt, dmin, 0.12, 0.3, 1.0, 0.0, interp='SMOOTHSTEP')
    # slush clumps inside the tracks
    cl, _ = pk.noise(nt, pk.vmath(nt, 'MULTIPLY', p3, (2.4, 0.5, 1.0)), scale=1.0, detail=3.0, rough=0.6)
    clump = pk.maprange(nt, cl, 0.66, 0.74, 0.0, 1.0)
    wet = pk.math_(nt, 'MULTIPLY', tracks, pk.math_(nt, 'SUBTRACT', 1.0, pk.math_(nt, 'MULTIPLY', clump, 0.85)))
    # pools inside the tracks (near mirrors)
    pf, _ = pk.noise(nt, pk.vmath(nt, 'MULTIPLY', p3, (0.9, 0.22, 1.0)), scale=1.0, detail=3.0, rough=0.55)
    puddle = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, pf, 0.55, 0.6, 0.0, 1.0, interp='SMOOTHSTEP'), wet)
    # dashed centre line (3 m dash, 6 m gap), peeking through where the snow is thin
    dash = pk.maprange(nt, pk.math_(nt, 'FRACT', pk.math_(nt, 'DIVIDE', V, 9.0)), 0.0, 0.333, 1.0, 0.0)
    dash = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'GREATER_THAN', dash, 0.0), 1.0)
    line = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, pk.math_(nt, 'ABSOLUTE', U), 0.065, 0.08, 1.0, 0.0), dash)
    lc, _ = pk.noise(nt, pk.vmath(nt, 'MULTIPLY', p3, (14.0, 1.6, 1.0)), scale=1.0, detail=3.0, rough=0.6)
    line = pk.math_(nt, 'MULTIPLY', line, pk.maprange(nt, lc, 0.45, 0.6, 0.0, 0.7))
    # colours
    f1, _ = pk.noise(nt, p3, scale=1.3, detail=4.0, rough=0.6)
    f2, _ = pk.noise(nt, p3, scale=9.0, detail=2.0, rough=0.55)
    hump = pk.maprange(nt, dmin, 0.28, 0.6, 1.0, 0.0)          # pressed snow next to the shoulders
    snowc = pk.vmath(nt, 'SCALE', (0.6, 0.7, 0.88), scale=pk.maprange(nt, f1, 0.3, 0.7, 0.86, 1.04))
    snowc = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', hump, 0.3), snowc, (0.44, 0.52, 0.68))
    slushc = pk.vmath(nt, 'SCALE', (0.2, 0.23, 0.31), scale=pk.maprange(nt, f2, 0.3, 0.7, 0.75, 1.25))
    col = pk.mix_col(nt, shoulder, snowc, slushc)
    # round 5: grit and trampled patches, so the near road shows its speed (critics: the smooth
    # dusting and the along-track features gave the lower frame almost no visible flow). Both
    # are isotropic and at random spacing (no period that could strobe at 0.26 m per frame):
    # soft greyer patches of packed snow about 0.4 m across, and sparse 3 to 6 cm grit specks,
    # denser on the slush shoulders thrown by the tyres, faded beyond about 20 m so they never
    # turn into sub-pixel sparkle far away
    tp, _ = pk.noise(nt, p3, scale=1.9, detail=3.0, rough=0.55)
    patch = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, tp, 0.54, 0.68, 0.0, 1.0, interp='SMOOTHSTEP'),
                     pk.math_(nt, 'SUBTRACT', 1.0, shoulder))
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', patch, 0.6), col, pk.vmath(nt, 'MULTIPLY', col, (0.6, 0.63, 0.7)))
    gv = pk.voronoi(nt, p3, scale=9.0, feature='F1')
    grc = pk.sep_xyz(nt, gv['Color'])
    gd, _ = pk.noise(nt, p3, scale=0.45, detail=2.0)
    thr = pk.math_(nt, 'SUBTRACT', pk.maprange(nt, gd, 0.35, 0.65, 0.88, 0.62), pk.math_(nt, 'MULTIPLY', shoulder, 0.18))
    grad = pk.maprange(nt, grc[1], 0.0, 1.0, 0.14, 0.3)
    speck = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'GREATER_THAN', grc[0], thr),
                     pk.maprange(nt, pk.math_(nt, 'DIVIDE', gv['Distance'], grad), 0.65, 1.0, 1.0, 0.0))
    camd = pk.node(nt, 'ShaderNodeCameraData')
    speck = pk.math_(nt, 'MULTIPLY', speck, pk.maprange(nt, camd.outputs['View Distance'], 16.0, 30.0, 0.8, 0.2))
    col = pk.mix_col(nt, speck, col, (0.1, 0.095, 0.1))
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', clump, tracks), col, (0.3, 0.34, 0.45))
    col = pk.mix_col(nt, wet, col, (0.011, 0.012, 0.016))
    # roughness: 0.02 pools, 0.05-0.09 wet tracks, 0.22-0.32 slush, 0.45-0.6 snow; sparkle
    vo = pk.voronoi(nt, pk.vmath(nt, 'SCALE', p3, scale=1.0), scale=90.0, feature='F1')
    cr = pk.sep_xyz(nt, vo['Color'])[0]
    glint = pk.math_(nt, 'MULTIPLY', pk.maprange(nt, cr, 0.93, 0.95, 0.0, 1.0),
                     pk.maprange(nt, vo['Distance'], 0.12, 0.25, 1.0, 0.0))
    glint = pk.math_(nt, 'MULTIPLY', glint, pk.math_(nt, 'SUBTRACT', 1.0, shoulder))
    r_snow = pk.mix_f(nt, glint, pk.maprange(nt, f2, 0.3, 0.7, 0.45, 0.6), 0.08)
    r_out = pk.mix_f(nt, shoulder, r_snow, pk.maprange(nt, f2, 0.3, 0.7, 0.22, 0.32))
    r_tr = pk.maprange(nt, f1, 0.3, 0.7, 0.05, 0.09)
    rough = pk.mix_f(nt, wet, r_out, r_tr)
    rough = pk.mix_f(nt, puddle, rough, 0.02)
    # normals: soft snow lumps and tread prints outside the tracks, a gently undulating water
    # film inside, glints tilted at random
    dry = pk.math_(nt, 'SUBTRACT', 1.0, wet)
    lump = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', f2, 0.7), pk.math_(nt, 'MULTIPLY', f1, 0.3)), dry)
    lump = pk.math_(nt, 'SUBTRACT', lump, pk.math_(nt, 'MULTIPLY', patch, 0.5))     # round 5: packed patches sit lower
    nrm = pk.bump(nt, lump, strength=0.22, distance=0.02)
    tread, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', Uw, 3.0), pk.math_(nt, 'MULTIPLY', V, 26.0), 0.0),
                        scale=1.0, detail=2.0)
    nrm = pk.bump(nt, pk.math_(nt, 'MULTIPLY', tread, pk.math_(nt, 'MULTIPLY', shoulder, dry)),
                  strength=0.15, distance=0.01, normal=nrm)
    lf, _ = pk.noise(nt, p3, scale=1.6, detail=2.0)
    nrm = pk.bump(nt, pk.math_(nt, 'MULTIPLY', lf, wet), strength=0.05, distance=0.03, normal=nrm)
    sf, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', U, 1.2), pk.math_(nt, 'MULTIPLY', V, 12.0), 0.0),
                     scale=1.0, detail=1.0, rough=0.5)
    nrm = pk.bump(nt, pk.math_(nt, 'MULTIPLY', sf, pk.math_(nt, 'MULTIPLY', wet, pk.math_(nt, 'SUBTRACT', 1.0, puddle))),
                  strength=0.05, distance=0.006, normal=nrm)
    tilt = pk.vmath(nt, 'SUBTRACT', vo['Color'], (0.5, 0.5, 0.5))
    nrm = pk.vmath(nt, 'NORMALIZE', pk.vmath(nt, 'ADD', nrm, pk.vmath(nt, 'SCALE', tilt, scale=pk.math_(nt, 'MULTIPLY', glint, 1.4))))
    p = pk._principled(nt, base=col, rough=rough, normal=nrm, spec=0.55, ior=1.33,
                       sss=pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'SUBTRACT', 1.0, shoulder), 0.25),
                       sss_radius=(0.45, 0.65, 1.0), sss_scale=0.05)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    # web: the fresh blue-white dusting at its mean tone (snow (0.6, 0.7, 0.88) with the packed
    # patches and the pressed hump mixed in); the wet tracks and their grey shoulders come back
    # as web-only strips (web_ruts, made in the --export-web hook)
    pk._web(m, base=(0.53, 0.61, 0.79), rough=0.6)
    return m


def ice_mat():
    if 'Ice' in M:
        return M['Ice']
    m, nt, out = nt_out('Ice')
    lw = pk.node(nt, 'ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.4
    col = pk.mix_col(nt, lw.outputs['Facing'], (0.55, 0.78, 1.0), (0.85, 0.95, 1.0))
    p = pk._principled(nt, base=col, rough=0.06, spec=0.8, coat=1.0, coat_rough=0.02,
                       emit=(0.5, 0.7, 1.0), emit_strength=0.15)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.7, 0.85, 1.0), rough=0.06)
    M['Ice'] = m
    return m


def stripe_mat(name, c1, c2, period=0.18, helix=True, rough=0.25, axis='Z', across=False):
    """Candy-cane stripes (helix around Z in object space), glossy toy paint."""
    if name in M:
        return M[name]
    m, nt, out = nt_out(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    if helix:
        ang = pk.math_(nt, 'DIVIDE', pk.math_(nt, 'ARCTAN2', y, x), 2 * math.pi)
        ph = pk.math_(nt, 'ADD', pk.math_(nt, 'DIVIDE', z, period), pk.math_(nt, 'MULTIPLY', ang, 2.0))
    else:
        coord = {'X': x, 'Y': y, 'Z': z}[axis]
        ph = pk.math_(nt, 'DIVIDE', coord, period)
    f = pk.math_(nt, 'FRACT', ph)
    s = pk.maprange(nt, f, 0.47, 0.53, 0.0, 1.0)
    s2 = pk.maprange(nt, f, 0.97, 1.0, 0.0, 1.0)
    s = pk.math_(nt, 'MAXIMUM', pk.math_(nt, 'SUBTRACT', s, s2), 0.0)
    col = pk.mix_col(nt, s, c1, c2)
    e = pk.attr(nt, 'pk_edge')
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', e, 0.12), col, (1, 1, 1), blend='SCREEN')
    p = pk._principled(nt, base=col, rough=rough, coat=0.6, coat_rough=0.1, spec=0.5)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=tuple((a + b) / 2 for a, b in zip(c1, c2)), rough=rough)
    M[name] = m
    return m


def far_mat(name, color, haze_color=(0.12, 0.2, 0.45), haze_near=150.0, haze_far=1800.0,
            snow_color=(0.5, 0.58, 0.8), max_haze=0.85):
    """Distant terrain: snowy slopes (up-facing white, steep rock dark) dissolving into an
    emissive blue-hour haze with camera distance."""
    m, nt, out = nt_out(name)
    geo_ = pk.node(nt, 'ShaderNodeNewGeometry')
    nz = pk.sep_xyz(nt, geo_.outputs['Normal'])[2]
    co = pk.texcoord(nt, 'Object')
    f1, _ = pk.noise(nt, pk.vmath(nt, 'SCALE', co, scale=0.02), scale=1.0, detail=4.0, rough=0.6)
    snow = pk.maprange(nt, pk.math_(nt, 'ADD', nz, pk.math_(nt, 'MULTIPLY', f1, 0.25)), 0.72, 0.85, 0.0, 1.0)
    col = pk.mix_col(nt, snow, color, snow_color)
    p = pk._principled(nt, base=col, rough=0.8)
    lp = pk.node(nt, 'ShaderNodeLightPath')
    cam = pk.node(nt, 'ShaderNodeCameraData')
    hz = pk.maprange(nt, cam.outputs['View Distance'], haze_near, haze_far, 0.0, max_haze, interp='SMOOTHSTEP')
    em = pk.node(nt, 'ShaderNodeEmission')
    pk._set(nt, em.inputs['Color'], haze_color)
    em.inputs['Strength'].default_value = 1.0
    mx = pk.node(nt, 'ShaderNodeMixShader')
    nt.links.new(hz, mx.inputs[0])
    nt.links.new(p.outputs[0], mx.inputs[1])
    nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    pk._web(m, base=color, rough=0.8)
    return m


def frost_mat():
    """Frost crystals on the inside of the glass corners: dithered, fading in from the
    object's local corner mask (vertex attribute pk_frost)."""
    m, nt, out = nt_out('Frost')
    co = pk.texcoord(nt, 'Object')
    vo = pk.voronoi(nt, co, scale=55.0, feature='DISTANCE_TO_EDGE')
    vo2 = pk.voronoi(nt, co, scale=180.0, feature='DISTANCE_TO_EDGE')
    f, _ = pk.noise(nt, co, scale=9.0, detail=4.0, rough=0.65)
    mask = pk.attr(nt, 'pk_frost')
    cr = pk.math_(nt, 'MAXIMUM', pk.maprange(nt, vo['Distance'], 0.0, 0.05, 0.9, 0.0),
                  pk.maprange(nt, vo2['Distance'], 0.0, 0.06, 0.6, 0.0))
    dens = pk.math_(nt, 'MULTIPLY', mask, pk.maprange(nt, f, 0.3, 0.7, 0.35, 1.0))
    a = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', dens, 0.55), cr), dens, clamp=True)
    p = pk._principled(nt, base=(0.75, 0.85, 1.0), rough=0.35, sss=0.4, sss_radius=(0.5, 0.7, 1.0),
                       sss_scale=0.01, emit=(0.5, 0.65, 1.0), emit_strength=0.04)
    tr = pk.node(nt, 'ShaderNodeBsdfTransparent')
    mx = pk.node(nt, 'ShaderNodeMixShader')
    nt.links.new(a, mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(p.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.8, 0.9, 1.0), rough=0.35, alpha=0.3)
    return m


def cabin_safe_snow(mat, near=1.35, far=2.3):
    """Kit snowflakes fill the whole corridor, so some fall inside the car. Fade them out
    by camera distance (dithered transparency) so none show between the eye and the glass."""
    nt = mat.node_tree
    out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    src = out.inputs['Surface'].links[0].from_socket
    cam = nt.nodes.new('ShaderNodeCameraData')
    k = pk.maprange(nt, cam.outputs['View Distance'], near, far, 0.0, 1.0)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(k, mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(src, mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])


def seamless_snow(root, H):
    """Kit snow loops each layer with two stacked copies and a Cycles modifier, so on the
    wrap frame every flake of a copy jumps by H, and EEVEE motion blur drew it as a full-height
    vertical line (seen at t = 0; wrap frames fall inside the film, e.g. 124, 177, 206). Here
    each layer gets three copies cycling over 3H (offsets -H .. 2H), so a copy wraps only
    while it is below the ground; snow_zmask() hides flakes outside 0..H, so the wrap and the
    copy waiting above the box are never drawn."""
    groups = {}
    for o in list(root.children):
        if o.type == 'MESH':
            groups.setdefault(o.data.name, []).append(o)
    for mname, obs in groups.items():
        obs.sort(key=lambda o: o.name)
        fc0 = pk.fcurves(obs[0], 'location', 2)[0]
        kp = fc0.keyframe_points
        period = abs(kp[1].co.x - kp[0].co.x)            # frames per H of fall
        nx = pk.fcurves(obs[0], 'location', 0)[0].modifiers[0]
        o2 = bpy.data.objects.new(obs[0].name[:-2] + '_2', obs[0].data)
        for c in obs[0].users_collection:
            c.objects.link(o2)
        o2.parent = root
        o2.visible_shadow = False
        o2.location = (0, 0, 0)
        o2.keyframe_insert('location', index=0, frame=1)
        nm = pk.fcurves(o2, 'location', 0)[0].modifiers.new('NOISE')
        nm.scale, nm.strength, nm.phase = nx.scale, nx.strength, nx.phase + 2.3
        obs.append(o2)
        for k, o in enumerate(obs[:3]):
            o.location.z = 0.0
            o.keyframe_insert('location', index=2, frame=1)
            fc = pk.fcurves(o, 'location', 2)[0]
            for m_ in list(fc.modifiers):
                fc.modifiers.remove(m_)
            fc.keyframe_points.clear()
            off1 = (k - 0.5) * H
            a = 1.0 - (2.0 * H - off1) / H * period
            ka = fc.keyframe_points.insert(a, 2.0 * H)
            kb = fc.keyframe_points.insert(a + 3.0 * period, -H)
            for k_ in (ka, kb):
                k_.interpolation = 'LINEAR'
            fc.modifiers.new('CYCLES')


def snow_zmask(mat, z0, z1):
    """Flakes are drawn only between world heights z0 and z1 (dithered alpha)."""
    nt = mat.node_tree
    out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    src = out.inputs['Surface'].links[0].from_socket
    geo_ = nt.nodes.new('ShaderNodeNewGeometry')
    z = pk.sep_xyz(nt, geo_.outputs['Position'])[2]
    k = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'GREATER_THAN', z, z0), pk.math_(nt, 'LESS_THAN', z, z1))
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(k, mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(src, mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])


def cached(key, fn):
    if key not in M:
        M[key] = fn()
    return M[key]


def siding_mat(c, vertical=False, board=0.19, name=None):
    """Painted clapboard (horizontal boards with an overlap shadow) or vertical timber
    planks: per-board tone variation, brush grain, edges worn lighter (pk_edge), grime
    toward the ground."""
    m, nt, out = nt_out(name or 'Siding_%02x%02x%02x%s' % (tuple(int(x * 255) for x in c) + ('v' if vertical else '',)))
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    coord = pk.math_(nt, 'ADD', x, y) if vertical else z
    ph = pk.math_(nt, 'DIVIDE', coord, board)
    f = pk.math_(nt, 'FRACT', ph)
    bid = pk.math_(nt, 'FLOOR', ph)
    wn = pk.node(nt, 'ShaderNodeTexWhiteNoise', noise_dimensions='1D')
    pk._set(nt, wn.inputs['W'], bid)
    var = pk.maprange(nt, wn.outputs['Value'], 0.0, 1.0, 0.86, 1.08)
    gr, _ = pk.noise(nt, pk.vmath(nt, 'MULTIPLY', co, (1.0, 1.0, 14.0) if not vertical else (9.0, 9.0, 0.8)),
                     scale=6.0, detail=4.0, rough=0.6)
    col = pk.vmath(nt, 'SCALE', c, scale=pk.math_(nt, 'MULTIPLY', var, pk.maprange(nt, gr, 0.3, 0.7, 0.93, 1.04)))
    groove = pk.maprange(nt, f, 0.0, 0.1, 1.0, 0.0)
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', groove, 0.55), col, pk.vmath(nt, 'SCALE', c, scale=0.3))
    e = pk.attr(nt, 'pk_edge')
    col = pk.mix_col(nt, pk.maprange(nt, e, 0.55, 0.95, 0.0, 0.35), col, pk.vmath(nt, 'ADD', pk.vmath(nt, 'SCALE', c, scale=0.6), (0.3, 0.29, 0.27)))
    grime = pk.maprange(nt, z, 0.2, 1.1, 0.55, 0.0)
    col = pk.mix_col(nt, grime, col, pk.vmath(nt, 'SCALE', c, scale=0.35))
    h = pk.math_(nt, 'ADD', pk.math_(nt, 'MULTIPLY', f, 0.8), pk.math_(nt, 'MULTIPLY', gr, 0.12))
    nrm = pk.bump(nt, h, strength=0.45, distance=0.012)
    p = pk._principled(nt, base=col, rough=pk.maprange(nt, gr, 0.3, 0.7, 0.55, 0.78), normal=nrm, spec=0.45)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=c, rough=0.7)
    return m


def wall(c, vertical=False):
    return cached(('wall', c, vertical), lambda: siding_mat(c, vertical))


def trim(c):
    return cached(('trim', c), lambda: pk.mat.painted_wood(c, wear=0.25, roughness=0.42))


def shingle_mat(c, name=None):
    """Roof shingles: staggered rows (object space) with a lip shadow, tone variation."""
    m, nt, out = nt_out(name or 'Shingle_%02x%02x%02x' % tuple(int(x * 255) for x in c))
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    row = pk.math_(nt, 'DIVIDE', z, 0.13)
    f = pk.math_(nt, 'FRACT', row)
    rid = pk.math_(nt, 'FLOOR', row)
    along = pk.math_(nt, 'ADD', pk.math_(nt, 'ADD', x, y), pk.math_(nt, 'MULTIPLY', rid, 0.13))
    cf = pk.math_(nt, 'FRACT', pk.math_(nt, 'DIVIDE', along, 0.26))
    cid = pk.math_(nt, 'FLOOR', pk.math_(nt, 'DIVIDE', along, 0.26))
    wn = pk.node(nt, 'ShaderNodeTexWhiteNoise', noise_dimensions='2D')
    pk._set(nt, wn.inputs['Vector'], pk.comb_xyz(nt, rid, cid, 0.0))
    var = pk.maprange(nt, wn.outputs['Value'], 0.0, 1.0, 0.7, 1.15)
    col = pk.vmath(nt, 'SCALE', c, scale=var)
    gap = pk.math_(nt, 'MAXIMUM', pk.maprange(nt, f, 0.0, 0.12, 1.0, 0.0), pk.maprange(nt, cf, 0.0, 0.05, 1.0, 0.0))
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', gap, 0.7), col, (0.01, 0.01, 0.012))
    nrm = pk.bump(nt, pk.math_(nt, 'ADD', f, pk.math_(nt, 'MULTIPLY', gap, -0.3)), strength=0.5, distance=0.015)
    p = pk._principled(nt, base=col, rough=0.62, normal=nrm, spec=0.4)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=c, rough=0.6)
    return m


def roofm(c):
    return cached(('roof', c), lambda: shingle_mat(c))


def stone_mat(c=(0.36, 0.35, 0.42), name='TowerStone', block=(0.62, 0.3)):
    """Dressed stone blocks with mortar joints and per-block tone variation (Brick node)."""
    if name in M:
        return M[name]
    m, nt, out = nt_out(name)
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    br = pk.node(nt, 'ShaderNodeTexBrick')
    br.offset = 0.5
    br.squash = 1.0
    pk._set(nt, br.inputs['Vector'], pk.comb_xyz(nt, pk.math_(nt, 'ADD', x, y), z, 0.0))
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Mortar Size'].default_value = 0.022
    br.inputs['Mortar Smooth'].default_value = 0.3
    br.inputs['Bias'].default_value = 0.0
    br.inputs['Brick Width'].default_value = block[0]
    br.inputs['Row Height'].default_value = block[1]
    pk._set(nt, br.inputs['Color1'], tuple(v * 1.08 for v in c))
    pk._set(nt, br.inputs['Color2'], tuple(v * 0.8 for v in c))
    pk._set(nt, br.inputs['Mortar'], (0.08, 0.08, 0.1))
    f1, _ = pk.noise(nt, co, scale=9.0, detail=4.0, rough=0.65)
    col = pk.vmath(nt, 'SCALE', br.outputs['Color'], scale=pk.maprange(nt, f1, 0.3, 0.7, 0.88, 1.08))
    mort = pk.math_(nt, 'SUBTRACT', 1.0, br.outputs['Fac'])
    nrm = pk.bump(nt, pk.math_(nt, 'ADD', mort, pk.math_(nt, 'MULTIPLY', f1, 0.25)), strength=0.5, distance=0.02)
    p = pk._principled(nt, base=col, rough=pk.maprange(nt, f1, 0.3, 0.7, 0.7, 0.88), normal=nrm, spec=0.4)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=c, rough=0.8)
    M[name] = m
    return m


def emit(c, s):
    return cached(('emit', c, s), lambda: pk.mat.emission(c, s))


# ----------------------------------------------------------------------------------------
# geometry helpers
# ----------------------------------------------------------------------------------------
def prism(name, poly, a0, a1, material, axis='Y', coll=None):
    """Extrude a 2D polygon (u, z) along `axis` from a0 to a1 (u is X for axis Y, Y for X)."""
    n = len(poly)
    verts = []
    for a in (a0, a1):
        for (u, z) in poly:
            verts.append((u, a, z) if axis == 'Y' else (a, u, z))
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    ob = pk.mesh_object(name, verts, faces, material=material, smooth=False, collection=coll,
                        recalc=True)
    return ob


def rbox(size, loc, mat, radius=0.04, seg=2, rot=(0, 0, 0), name='b', coll=None):
    return pk.geo.rounded_box(size, radius=radius, segments=seg, location=loc, rotation=rot,
                              material=mat, name=name, collection=coll)


def join(objs, name):
    objs = [o for o in objs if o is not None]
    root = objs[0]
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=root, object=root, selected_objects=objs,
                                       selected_editable_objects=objs):
            bpy.ops.object.join()
    root.name = name
    root.data.name = name
    return root


def lumpy(ob, amp=0.06, freq=2.3, seed=0, up_only=True):
    """Organic lumps: displace vertices along their normal by a smooth pseudo noise."""
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    nr = np.asarray([v.normal[:] for v in me.vertices], np.float32)
    r = np.random.RandomState(seed)
    d = np.zeros(n, np.float32)
    for _ in range(4):
        k = r.normal(0, 1, 3) * freq
        ph = r.uniform(0, 6.28)
        d += np.sin(co @ k + ph)
    d = d / 4.0 * amp
    if up_only:
        d *= np.clip(nr[:, 2] * 1.5, 0.0, 1.0)
    co += nr * d[:, None]
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    return ob


def icicles(name, p0, p1, count, rng, lmin=0.08, lmax=0.42, coll=None):
    bm = bmesh.new()
    P0, P1 = Vector(p0), Vector(p1)
    for i in range(count):
        t = (i + rng.uniform(0.2, 0.8)) / count
        p = P0.lerp(P1, t)
        L = rng.uniform(lmin, lmax) * (0.4 if rng.random() < 0.35 else 1.0)
        r = 0.018 + L * 0.06
        ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.0, radius2=r, depth=L)
        for v in ret['verts']:
            v.co += p + Vector((0, 0, -L / 2))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.materials.append(ice_mat())
    ob = bpy.data.objects.new(name, me)
    pk._link(ob, coll)
    return ob


def torus(name, R, r, loc, rot, mat, maj=24, mnr=8, coll=None):
    bm = bmesh.new()
    verts = []
    for i in range(maj):
        a = 2 * math.pi * i / maj
        for j in range(mnr):
            b = 2 * math.pi * j / mnr
            verts.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a),
                                       r * math.sin(b))))
    for i in range(maj):
        for j in range(mnr):
            a = verts[i * mnr + j]
            b = verts[((i + 1) % maj) * mnr + j]
            c = verts[((i + 1) % maj) * mnr + (j + 1) % mnr]
            d = verts[i * mnr + (j + 1) % mnr]
            bm.faces.new((a, b, c, d))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = rot
    pk._link(ob, coll)
    return ob


def sphere(name, r, loc, mat, sub=2, scale=(1, 1, 1), coll=None):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    pk._link(ob, coll)
    return ob


def place(ob, pos, yaw):
    ob.location = tuple(pos)
    ob.rotation_euler = (0.0, 0.0, yaw)
    return ob


def child(ob, parent, loc=None):
    ob.parent = parent
    ob.matrix_parent_inverse = Matrix.Identity(4)
    if loc is not None:
        ob.location = loc
    return ob


def facing_yaw(path, s, side, toward_cam_deg=0.0):
    """Yaw that turns local -Y toward the road (plus a turn toward the approaching camera)."""
    f = -side * path.right(s)
    t = path.tangent(s)
    a = math.radians(toward_cam_deg)
    f = (f * math.cos(a) - t * math.sin(a)).normalized()
    return math.atan2(f.x, -f.y)


# ----------------------------------------------------------------------------------------
# sky plate: crop + tree-line cleanup of the Eielson aurora photograph (numpy only)
# ----------------------------------------------------------------------------------------
AUR_X0, AUR_X1, AUR_Y1 = 0.06, 0.94, 0.86
AUR_KEY = 'sn03_aurora_rays_v8'
SKY = dict(aur_az=4.0, aur_el=22.0, aur_hfov=52.0, aur_gain=0.24,
           mw_az=12.0, mw_el=24.0, mw_tilt=-58.0, mw_l=78.0,
           exposure=0.45, contrast=1.35, saturation=1.0, tint=(0.82, 0.9, 1.25))


def _blur1(a, r, axis):
    for _ in range(3):
        a = pk._box1d(a, r, axis)
    return a


def _smooth_noise(h, w, cy, cx, seed):
    """Smooth unit-variance noise with correlation lengths cy x cx px (separable linear
    upsampling of a coarse Gaussian grid, then a light box blur)."""
    rng = np.random.RandomState(seed)
    gh, gw = int(h / cy) + 3, int(w / cx) + 3
    g = rng.normal(0, 1, (gh, gw)).astype(np.float32)
    yi = (np.arange(h) + 0.5) / cy
    xi = (np.arange(w) + 0.5) / cx
    g = np.stack([np.interp(yi, np.arange(gh), g[:, j]) for j in range(gw)], 1)
    g = np.stack([np.interp(xi, np.arange(gw), g[i]) for i in range(h)], 0).astype(np.float32)
    g = _blur1(_blur1(g, max(1, int(cy / 4)), 0), max(1, int(cx / 4)), 1)
    return g / (g.std() + 1e-6)


def make_aurora():
    """The aurora of the Eielson photograph alone, as a starless additive layer (round 3).
    1. crop the sky (x 0.06..0.94, y 0..0.86), linear light;
    2. grey opening (3 px) + light blur removes every point star (the kit's NASA star field
       is the only star field in the film);
    3. a colour key keeps the green emission (G - 0.35 B) and drops the blue sky, the pink
       glow (R > G) and the snowy ground / tree line below the horizon polyline;
    4. contrast: the faint wash between the folds falls toward black (power 1.9 below the
       97th percentile), so the sky shows dark gaps with stars between the folds;
    5. ray striation: the photograph's own fine structure across x (high-pass of a vertical
       blur) amplified, times a gentle vertical ray texture (correlation 160 x 7 px);
    6. the broad overhead swirl at the top of the plate is dimmed so the descending folds lead;
    7. a bright lower hem: where a fold ends below, the emission is brightest and fades upward
       (one-sided exponential, 55 px), tinted lime;
    8. grade by height in the plate: green body, teal above, a magenta-red fringe only on the
       highest fold (557.7 nm low, 630 nm high, as in real aurora)."""
    srgb = pk.read_image(EIELSON)[..., :3].astype(np.float32)
    H, W = srgb.shape[:2]
    x0, x1, y1 = int(AUR_X0 * W), int(AUR_X1 * W), int(AUR_Y1 * H)
    a = pk._srgb_to_lin(srgb[:y1, x0:x1]).astype(np.float32)
    del srgb
    h, w = a.shape[:2]
    o = pk._minmax_filter(pk._minmax_filter(a, 3, np.minimum), 3, np.maximum)
    o = pk._gauss(o, 2)
    R, G, B = o[..., 0], o[..., 1], o[..., 2]
    k1 = np.clip((G - 0.35 * B - 0.03) / 0.1, 0, 1)
    k2 = np.clip((G - 0.8 * R + 0.02) / 0.08, 0, 1)
    key = k1 * k1 * (3 - 2 * k1) * (k2 * k2 * (3 - 2 * k2))
    # horizon: the tree line / lake in source coordinates (normalised x, y)
    xs = AUR_X0 + (np.arange(w) + 0.5) / W
    cx = [0.06, 0.14, 0.20, 0.26, 0.33, 0.37, 0.42, 0.55, 0.62, 0.70, 0.80, 0.86, 0.94]
    cy = [0.640, 0.690, 0.735, 0.765, 0.780, 0.765, 0.765, 0.775, 0.765, 0.775, 0.76, 0.725, 0.69]
    ycut = np.interp(xs, cx, cy) * H
    rows = np.arange(h)[:, None].astype(np.float32)
    hz = np.clip((ycut[None, :] - 10 - rows) / 70.0, 0, 1)
    key = key * hz * hz * (3 - 2 * hz)
    au = o * key[..., None]
    L = (au * np.array(pk.LUMA, np.float32)).sum(-1)
    Lr = float(np.percentile(L[L > 1e-4], 97))
    f = np.clip(L / Lr, 0, None)
    L2 = Lr * np.where(f < 1, f ** 1.9, f)
    lv = _blur1(L2, 10, 0)
    L3 = np.maximum(L2 + (lv - _blur1(lv, 5, 1)) * 1.7, 0)
    L3 = L3 * np.clip(1.0 + 0.15 * _smooth_noise(h, w, 160, 8, 4), 0.6, 1.4)
    L3 = L3 * (0.6 + 0.4 * np.clip((rows - 0.05 * h) / (0.3 * h), 0, 1))
    d = 14
    below = np.zeros_like(L3)
    below[:-d] = L3[d:]
    edge = pk._gauss(np.clip(L3 - below * 1.6, 0, None)[..., None], 2)[..., 0]
    edge = edge / (float(np.percentile(edge[edge > 1e-5], 99)) + 1e-6)
    acc = np.zeros_like(edge)
    run = np.zeros(w, np.float32)
    dec = np.float32(math.exp(-1.0 / 55.0))
    for y in range(h - 1, -1, -1):
        run = np.maximum(edge[y], run * dec)
        acc[y] = run
    hem = np.clip(acc, 0, 1.2) * (L3 > 1e-4)
    L3 = L3 * (1.0 + 1.4 * hem)
    t = np.clip(rows / (0.62 * h), 0, 1)                            # 0 top .. 1 low
    lime = np.array((0.42, 1.0, 0.52), np.float32)
    green = np.array((0.16, 0.95, 0.44), np.float32)
    teal = np.array((0.1, 0.8, 0.7), np.float32)
    mag = np.array((0.85, 0.16, 0.45), np.float32)
    wm = np.clip(1.0 - t / 0.62, 0, 1)[..., None] ** 1.6 * 0.8
    wg = np.clip((t - 0.42) / 0.3, 0, 1)[..., None]
    tint = mag * wm + teal * np.clip(1 - wm - wg, 0, 1) + green * wg
    tint = tint * (1 - 0.75 * hem[..., None]) + lime * 0.75 * hem[..., None]
    return (L3[..., None] * tint * 1.25).astype(np.float32)


def sky(ctx):
    S = SKY
    png = pk._cached_png(AUR_KEY, make_aurora, bits=16)
    # base: real photographic Milky Way (ESO/S. Brunier glow + NASA Gaia detail) and the NASA
    # Hipparcos/Tycho star field, framed on the Cygnus star clouds and the Great Rift, the band
    # descending from upper left to lower right; pre-dawn blue dome and a pink dawn glow low on
    # the bakery side (procedural, starless)
    pk.sky.galactic(core_az=S['mw_az'], core_el=S['mw_el'], tilt=S['mw_tilt'], anchor_l=S['mw_l'], anchor_b=0.0,
                    exposure=S['exposure'], contrast=S['contrast'], saturation=S['saturation'], tint=S['tint'],
                    mw_boost=2.6, star_boost=4.4, star_gamma=0.86, dust_contrast=0.2,
                    background=(0.0012, 0.0024, 0.012), airglow=0.12, airglow_red=0.2,
                    skyglow=0.7, skyglow_color=(0.1, 0.17, 0.42),
                    dawn=1.4, dawn_az=-28.0, dawn_color=(1.0, 0.4, 0.46), dawn_height_deg=6.0,
                    dawn_spread_deg=38.0, extinction=0.7, extinction_height_deg=16.0,
                    horizon_glow=0.02, horizon_color=(0.28, 0.38, 0.95), horizon_height_deg=9.0,
                    light=0.2, light_tint=(0.6, 0.82, 1.0), ambient=(0.01, 0.024, 0.06))
    # the aurora, added in linear light (the stars show through it)
    pk.sky.photo_plate(png, center_az=S['aur_az'], center_el=S['aur_el'], hfov_deg=S['aur_hfov'], blend='add',
                       feather=0.07, gain=S['aur_gain'], name='aurora', colorspace='sRGB')
    pk.sky.moon(az=-13.0, el=17.0, size_deg=1.5, phase=0.14, lit_angle_deg=-120.0, gain=28.0,
                earthshine=0.03, halo=0.035, halo_size=1.1, light=1.0, light_color=(0.62, 0.74, 1.0))
    # add the moon: its dark side shows the sky rather than an opaque earthshine disc
    pk._SKY.layers[-1]['blend'] = 'add'
    pk.sky.build()
    # the moon lamp lights diffusely only: its glossy highlight smeared a pale sheen over the
    # whole wet lane (read as a white strip in round 1)
    ml = bpy.data.objects.get('MoonLight')
    if ml is not None:
        ml.data.specular_factor = 0.0
    # a high cool fill (7000 K, about 0.3) standing in for moon and sky light from above, so snow
    # reads blue-white on every up-facing surface while walls stay to the warm lights
    mf = pk.lights.sun(-13.0, 62.0, color=(0.5, 0.72, 1.0), strength=0.5, angle_deg=3.0, shadow=True, name='MoonFill')
    mf.data.specular_factor = 0.0


# ----------------------------------------------------------------------------------------
# ground: road, snow banks, yards, far terrain, mountains
# ----------------------------------------------------------------------------------------
def snow_bank(path, side, lat0, lat1, s0, s1, coll, seed=0, hmin=0.35, hmax=0.75, step=0.4):
    rng = np.random.RandomState(seed)
    ss = np.arange(s0, s1 + step, step)
    nl = 9
    # smooth random height along s
    hn = np.zeros(len(ss))
    for k in range(5):
        f = rng.uniform(0.04, 0.35)
        hn += np.sin(ss * f + rng.uniform(0, 6.28)) / (k + 1)
    hn = (hn - hn.min()) / max(hn.max() - hn.min(), 1e-6)
    H = hmin + (hmax - hmin) * hn
    verts, faces = [], []
    for i, s in enumerate(ss):
        for j in range(nl):
            f = j / (nl - 1)
            lat = lat0 + (lat1 - lat0) * f
            prof = math.sin(math.pi * min(1.0, f * 1.15)) ** 0.7 if f < 0.87 else max(0.0, 1 - (f - 0.87) / 0.13) * 0.55
            z = H[i] * prof
            lt = lat if side > 0 else -lat
            verts.append(tuple(path.offset(float(s), lt, z - 0.02)))
    for i in range(len(ss) - 1):
        for j in range(nl - 1):
            a = i * nl + j
            if side > 0:
                faces.append((a, a + nl, a + nl + 1, a + 1))
            else:
                faces.append((a, a + 1, a + nl + 1, a + nl))
    ob = pk.mesh_object('Bank%s' % ('R' if side > 0 else 'L'), verts, faces, material=snow_mat(),
                        collection=coll, recalc=True)
    lumpy(ob, amp=0.05, freq=3.0, seed=seed + 3)
    ob['bank_H'] = 0
    return ob, ss, H


def bank_height(ss, H, s):
    return float(np.interp(s, ss, H))


def terrain(path, coll):
    """Rolling snowy ground rising into hills away from the village corridor."""
    P = np.array([tuple(path.at(s))[:2] for s in np.arange(-40, path.length, 2.0)])
    xs = np.arange(-340, 341, 8.0)
    ys = np.arange(-80, 720, 8.0)
    X, Y = np.meshgrid(xs, ys)
    pts = np.stack([X.ravel(), Y.ravel()], 1)
    d = np.full(len(pts), 1e9)
    for i in range(0, len(P), 4):
        dd = np.hypot(pts[:, 0:1] - P[i:i + 4, 0][None], pts[:, 1:2] - P[i:i + 4, 1][None]).min(1)
        d = np.minimum(d, dd)
    rng = np.random.RandomState(11)
    nz = np.zeros(len(pts))
    for k in range(6):
        kv = rng.normal(0, 1, 2) * (0.004 * (k + 1))
        nz += np.sin(pts @ kv + rng.uniform(0, 6.28)) / (k + 1)
    rise = np.clip((d - 34.0) / 90.0, 0, 1)
    rise = rise * rise * (3 - 2 * rise)
    fwd = np.clip((pts[:, 1] - 110.0) / 320.0, 0, 1)
    side = np.clip(0.55 + pts[:, 0] / 260.0, 0.3, 1.15)
    Z = rise * (10.0 + 9.0 * nz + 0.06 * np.maximum(d - 34.0, 0)) + fwd * 72.0 * rise * side - 0.35
    Z = Z.reshape(X.shape)
    ny, nx = X.shape
    verts = [(float(X[j, i]), float(Y[j, i]), float(Z[j, i])) for j in range(ny) for i in range(nx)]
    faces = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i)
             for j in range(ny - 1) for i in range(nx - 1)]
    ob = pk.mesh_object('Terrain', verts, faces, material=snow_mat('SnowFar', color=(0.55, 0.62, 0.8),
                                                                     sparkle=0.0, scale=6.0, lumps=0.15),
                        collection=coll)

    def height(x, y):
        dd = np.hypot(x - P[:, 0], y - P[:, 1]).min()
        n = 0.0
        r2 = np.random.RandomState(11)
        for k in range(6):
            kv = r2.normal(0, 1, 2) * (0.004 * (k + 1))
            n += math.sin(x * kv[0] + y * kv[1] + r2.uniform(0, 6.28)) / (k + 1)
        rr = min(max((dd - 34.0) / 90.0, 0), 1)
        rr = rr * rr * (3 - 2 * rr)
        fw = min(max((y - 110.0) / 320.0, 0), 1)
        sd = min(max(0.55 + x / 260.0, 0.3), 1.15)
        return rr * (10.0 + 9.0 * n + 0.06 * max(dd - 34.0, 0)) + fw * 72.0 * rr * sd - 0.35, dd
    return ob, height


def mountains(coll):
    """A ring of snowy ridges 1.4 to 3 km out, low on the dawn side (left), higher right."""
    rng = np.random.RandomState(21)
    azs = np.radians(np.arange(-80, 81, 0.5))
    rows = []
    for layer, (R, hbase, hvar, col) in enumerate([(3000.0, 120.0, 260.0, (0.05, 0.07, 0.16)),
                                                   (1700.0, 40.0, 120.0, (0.04, 0.06, 0.14))]):
        hts = np.zeros(len(azs))
        for k in range(7):
            f = rng.uniform(3, 30)
            hts += np.abs(np.sin(azs * f + rng.uniform(0, 6.28))) ** 1.5 / (1 + k * 0.6)
        hts = hts / hts.max()
        side = np.clip((np.degrees(azs) + 30) / 60.0, 0.25, 1.0)
        H = hbase + hvar * hts * side
        verts, faces = [], []
        for i, a in enumerate(azs):
            x, y = R * math.sin(a), R * math.cos(a)
            verts.append((x, y, -20.0))
            verts.append((x * 0.98, y * 0.98, H[i] * 0.55))
            verts.append((x * 0.96, y * 0.96, H[i]))
        n = 3
        for i in range(len(azs) - 1):
            for j in range(n - 1):
                a_ = i * n + j
                faces.append((a_, a_ + n, a_ + n + 1, a_ + 1))
        m = far_mat('MountainMat%d' % layer, col, haze_color=(0.1, 0.15, 0.36) if layer == 0 else (0.07, 0.11, 0.28),
                    haze_near=600.0, haze_far=3200.0, max_haze=0.75 if layer == 0 else 0.6)
        ob = pk.mesh_object('Mountains%d' % layer, verts, faces, material=m, collection=coll, recalc=True)
        lumpy(ob, amp=12.0, freq=0.03, seed=layer, up_only=False)
        rows.append(ob)
    return rows


# ----------------------------------------------------------------------------------------
# cottages
# ----------------------------------------------------------------------------------------
def window_set(parts, x, z, ww, wh, yface, wmat, tmat, smat, rng, round_top=False, shutters=True,
               sill_snow=True, name='w'):
    """A window on the facade plane y = yface (facing -Y): candy frame, shutters, snowy sill."""
    parts.append(rbox((ww + 0.24, 0.08, wh + 0.24), (x, yface + 0.02, z - 0.12), tmat, radius=0.04))
    wp = pk.geo.window_panel(cols=1, rows=1, win_w=ww, win_h=wh, material=wmat, seed=rng.randint(0, 9999),
                             round_top=round_top, location=(x, yface - 0.035, z))
    parts.append(wp)
    if shutters and not round_top:
        for sx in (-1, 1):
            parts.append(rbox((ww * 0.42, 0.05, wh + 0.04), (x + sx * (ww / 2 + 0.13 + ww * 0.21), yface - 0.01, z - 0.02),
                              smat, radius=0.02))
    parts.append(rbox((ww + 0.4, 0.24, 0.08), (x, yface - 0.08, z - 0.16), tmat, radius=0.03))
    if sill_snow:
        parts.append(rbox((ww + 0.36, 0.22, 0.09), (x, yface - 0.085, z - 0.09), snow_mat('SnowRoof'),
                          radius=0.045, seg=3))


def cottage(name, w, d, h, rh, rng, wall_c, trim_c, shut_c, roof_c, wins, gable_front=True,
            door=True, chimney=True, ice=True, detail=True, coll=None, lights_list=None,
            string=None):
    """Toy-like cottage built at the origin, facade on y = -d/2 facing -Y. Returns
    (house_object, local light specs, string light specs)."""
    parts = []
    wm, tm, sm = wall(wall_c, vertical=wall_c in ((0.42, 0.26, 0.16), (0.5, 0.1, 0.08))), trim(trim_c), trim(shut_c)
    rm = roofm(roof_c)
    snow = snow_mat('SnowRoof', color=(0.7, 0.77, 0.94))
    ov, ovf, t, ts = 0.42, 0.35, 0.22, 0.36
    parts.append(rbox((w, d, h), (0, 0, 0), wm, radius=0.14, seg=3))
    # base plinth (stone) and corner boards
    parts.append(rbox((w + 0.12, d + 0.12, 0.45), (0, 0, 0), cached('stone', lambda: pk.mat.clay((0.3, 0.3, 0.38), roughness=0.75, bumps=0.8)),
                      radius=0.06))
    if detail:
        for cx in (-w / 2 + 0.05, w / 2 - 0.05):
            parts.append(rbox((0.16, 0.16, h - 0.4), (cx, -d / 2 + 0.03, 0.4), tm, radius=0.03))
    lights = []
    strings = []
    if gable_front:
        half = w / 2
        slope = rh / half
        g = prism(name + '_g', [(-half + 0.03, h - 0.05), (half - 0.03, h - 0.05), (0, h + rh - 0.05)],
                  -d / 2 + 0.03, d / 2 - 0.03, wm)
        parts.append(g)
        X = half + ov

        def zb(x):
            return h + rh * (1 - abs(x) / half)
        roof = prism(name + '_r', [(-X, zb(-X)), (0, h + rh), (X, zb(X)), (X, zb(X) + t), (0, h + rh + t * 1.15),
                                   (-X, zb(-X) + t)], -d / 2 - ovf, d / 2 + ovf, rm)
        pk.geo.bevel(roof, width=0.05, segments=2, angle=30)
        parts.append(roof)
        X2 = X + 0.06
        sn = prism(name + '_s', [(-X2, zb(-X2) + t - 0.02), (0, h + rh + t * 1.1), (X2, zb(X2) + t - 0.02),
                                 (X2 - 0.05, zb(X2) + t + ts * 0.75), (0, h + rh + t + ts),
                                 (-X2 + 0.05, zb(-X2) + t + ts * 0.75)],
                   -d / 2 - ovf - 0.08, d / 2 + ovf + 0.06, snow)
        pk.geo.bevel(sn, width=0.16, segments=4, angle=25)
        lumpy(sn, amp=0.05, freq=2.6, seed=rng.randint(0, 999))
        parts.append(sn)
        if detail:
            # candy fascia boards along the gable edges
            L = math.hypot(X, rh + ov * slope)
            ang = math.atan2(rh + ov * slope, X)
            for sx in (-1, 1):
                cx = sx * X / 2
                cz = (zb(sx * X) + h + rh) / 2 - 0.02
                parts.append(rbox((L + 0.1, 0.12, 0.22), (cx, -d / 2 - ovf - 0.02, cz - 0.11), tm, radius=0.04,
                                  rot=(0, math.degrees(sx * ang), 0)))
            if string is not None:
                for sx in (-1, 1):
                    strings.append(((sx * (X - 0.15), -d / 2 - ovf - 0.12, zb(sx * X) - 0.18),
                                    (0, -d / 2 - ovf - 0.12, h + rh - 0.2), string))
        if ice:
            for sx in (-1, 1):
                parts.append(icicles(name + '_ice', (sx * X, -d / 2 - ovf, zb(sx * X) - 0.02),
                                     (sx * X, d / 2 + ovf, zb(sx * X) - 0.02), int(d * 3.5), rng))
        # gable window
        gw = wins.get('gable')
        if gw is not None:
            window_set(parts, 0, h + rh * 0.12, 0.8, 1.0, -d / 2, gw, tm, sm, rng, round_top=True, sill_snow=True)
        chim_x, chim_y = (w * 0.24 * rng.choice((-1, 1)), d * 0.15)
        chim_z0 = zb(chim_x) - 0.4
        chim_top = h + rh + 0.9
    else:
        half = d / 2
        slope = rh / half
        g = prism(name + '_g', [(-half + 0.03, h - 0.05), (half - 0.03, h - 0.05), (0, h + rh - 0.05)],
                  -w / 2 + 0.03, w / 2 - 0.03, wm, axis='X')
        parts.append(g)
        Y = half + ov

        def zb(y):
            return h + rh * (1 - abs(y) / half)
        roof = prism(name + '_r', [(-Y, zb(-Y)), (0, h + rh), (Y, zb(Y)), (Y, zb(Y) + t), (0, h + rh + t * 1.15),
                                   (-Y, zb(-Y) + t)], -w / 2 - ovf, w / 2 + ovf, rm, axis='X')
        pk.geo.bevel(roof, width=0.05, segments=2, angle=30)
        parts.append(roof)
        Y2 = Y + 0.06
        sn = prism(name + '_s', [(-Y2, zb(-Y2) + t - 0.02), (0, h + rh + t * 1.1), (Y2, zb(Y2) + t - 0.02),
                                 (Y2 - 0.05, zb(Y2) + t + ts * 0.75), (0, h + rh + t + ts),
                                 (-Y2 + 0.05, zb(-Y2) + t + ts * 0.75)],
                   -w / 2 - ovf - 0.08, w / 2 + ovf + 0.08, snow, axis='X')
        pk.geo.bevel(sn, width=0.16, segments=4, angle=25)
        lumpy(sn, amp=0.05, freq=2.6, seed=rng.randint(0, 999))
        parts.append(sn)
        if detail:
            parts.append(rbox((w + 2 * ovf, 0.12, 0.2), (0, -Y - 0.02, zb(-Y) - 0.24), tm, radius=0.04))
        if string is not None:
            strings.append(((-w / 2 - ovf + 0.1, -Y - 0.1, zb(-Y) - 0.3), (w / 2 + ovf - 0.1, -Y - 0.1, zb(-Y) - 0.3), string))
        if ice:
            parts.append(icicles(name + '_ice', (-w / 2 - ovf, -Y, zb(-Y) - 0.02), (w / 2 + ovf, -Y, zb(-Y) - 0.02),
                                 int(w * 3.5), rng))
        # dormer
        gw = wins.get('gable')
        if gw is not None and w > 5.5:
            dz = zb(-half * 0.45)
            parts.append(rbox((1.5, 1.6, 1.4), (0, -half * 0.45, dz - 0.3), wm, radius=0.08))
            parts.append(prism(name + '_dr', [(-0.95, dz + 1.05), (0.95, dz + 1.05), (0, dz + 1.75)],
                               -half * 0.45 - 0.9, -half * 0.45 + 0.7, rm))
            dsn = prism(name + '_ds', [(-1.05, dz + 1.12), (0, dz + 1.85), (1.05, dz + 1.12), (0.95, dz + 1.3), (0, dz + 2.05),
                                       (-0.95, dz + 1.3)], -half * 0.45 - 0.95, -half * 0.45 + 0.7, snow)
            pk.geo.bevel(dsn, width=0.08, segments=3, angle=25)
            parts.append(dsn)
            window_set(parts, 0, dz - 0.05, 0.7, 0.85, -half * 0.45 - 0.8, gw, tm, sm, rng, shutters=False)
        chim_x, chim_y = (w * 0.3 * rng.choice((-1, 1)), d * 0.12)
        chim_z0 = zb(chim_y) - 0.4
        chim_top = h + rh + 0.9
    if chimney:
        brick = cached('brick', lambda: pk.mat.clay((0.42, 0.2, 0.18), roughness=0.8, bumps=0.9))
        parts.append(rbox((0.62, 0.62, chim_top - chim_z0), (chim_x, chim_y, chim_z0), brick, radius=0.05))
        parts.append(rbox((0.8, 0.8, 0.14), (chim_x, chim_y, chim_top - 0.05), brick, radius=0.04))
        cap = rbox((0.86, 0.86, 0.26), (chim_x, chim_y, chim_top + 0.06), snow, radius=0.12, seg=3)
        parts.append(cap)
    # facade windows
    yf = -d / 2 - 0.0
    floors = wins.get('floors', [])
    for (zf, xs_, wmat, ww, wh) in floors:
        for x in xs_:
            window_set(parts, x, zf, ww, wh, yf, wmat, tm, sm, rng, shutters=detail)
    if door:
        dx = wins.get('door_x', 0.0)
        dm = trim(wins.get('door_c', shut_c))
        parts.append(rbox((1.3, 0.1, 2.45), (dx, yf + 0.02, 0.35), tm, radius=0.05))
        parts.append(rbox((1.0, 0.12, 2.05), (dx, yf - 0.03, 0.42), dm, radius=0.05))
        tw = pk.geo.window_panel(1, 1, win_w=0.55, win_h=0.5, material=wins.get('transom', wins['floors'][0][2] if floors else None),
                                 round_top=True, location=(dx, yf - 0.1, 1.85), seed=rng.randint(0, 999))
        parts.append(tw)
        # steps with snow
        stone = cached('stone', lambda: pk.mat.clay((0.3, 0.3, 0.38), roughness=0.75, bumps=0.8))
        parts.append(rbox((1.6, 0.5, 0.2), (dx, yf - 0.3, 0.0), stone, radius=0.04))
        parts.append(rbox((1.4, 0.35, 0.2), (dx, yf - 0.22, 0.18), stone, radius=0.04))
        parts.append(rbox((1.55, 0.45, 0.07), (dx, yf - 0.32, 0.2), snow, radius=0.03))
        # wreath with a red bow
        if detail:
            wr = torus(name + '_wreath', 0.2, 0.065, (dx, yf - 0.1, 1.45), (math.pi / 2, 0, 0),
                       cached('fir', lambda: pk.mat.clay((0.03, 0.14, 0.08), roughness=0.7, bumps=1.0)))
            parts.append(wr)
            parts.append(rbox((0.16, 0.06, 0.12), (dx, yf - 0.16, 1.22), trim(CANDY_RED), radius=0.03))
            # door lantern
            lx = dx + 0.85
            parts.append(rbox((0.2, 0.2, 0.3), (lx, yf - 0.16, 2.05), emit((1.0, 0.7, 0.35), 12.0), radius=0.03))
            parts.append(rbox((0.26, 0.26, 0.06), (lx, yf - 0.16, 2.35), cached('metal', lambda: pk.mat.metal((0.06, 0.06, 0.07), roughness=0.4)),
                              radius=0.02))
            lights.append(('point', (lx, yf - 0.55, 2.2), (1.0, 0.62, 0.3), 45.0))
    ob = join(parts, name)
    if coll is not None:
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        coll.objects.link(ob)
    return ob, lights, strings


def add_house(ctx, path, s, side, lat_face, size, rng, coll, detail=True, toward=0.0, gable=None,
              palette=None, floors2=None, string=True, ice=True, door=True, wash=None, wash_e=1200.0):
    w, d, h, rh = size
    wall_c = (palette or {}).get('wall', rng.choice(WALLS))
    trim_c = (palette or {}).get('trim', rng.choice(TRIMS))
    shut_c = (palette or {}).get('shut', rng.choice([c for c in TRIMS if c != trim_c]))
    roof_c = (palette or {}).get('roof', rng.choice(ROOFS))
    gable_front = gable if gable is not None else (rng.random() < 0.65)
    wmats = [M['win_warm'], M['win_gold'], M['win_amber'], M['win_warm'], M['win_gold'], M['win_amber'],
             M['win_warm'], M['win_cool']]
    wmat = rng.choice(wmats)
    wins = {'floors': [], 'gable': rng.choice(wmats), 'transom': M['win_gold']}
    nx = 2 if w < 6.8 else 3
    xs = [(-w / 4, w / 4)] if nx == 2 else [(-w / 3, 0, w / 3)]
    xs = list(xs[0])
    if door:
        dpos = rng.choice([0.0, xs[0], xs[-1]]) if nx == 3 else 0.0
        wins['door_x'] = dpos
        gx = [x for x in xs if abs(x - dpos) > 0.9]
        if nx == 2:
            gx = [-w / 2 + 1.0, w / 2 - 1.0] if w > 5.2 else [-w / 2 + 0.9]
        wins['floors'].append((0.95, gx, wmat, 0.95, 1.25))
    else:
        wins['floors'].append((0.95, xs, wmat, 0.95, 1.25))
    if h > 4.6:
        wins['floors'].append((h * 0.56 + 0.3, xs, rng.choice(wmats), 0.9, 1.15))
    ob, lights, strings = cottage('House_%s_%d' % ('R' if side > 0 else 'L', int(s * 10)), w, d, h, rh, rng,
                                  wall_c, trim_c, shut_c, roof_c, wins, gable_front=gable_front,
                                  coll=coll, detail=detail, ice=ice and detail, door=door,
                                  string=(rng.choice([BULB_MULTI, BULB_WARM, BULB_CANDY]) if string else None))
    yaw = facing_yaw(path, s, side, toward)
    center = path.offset(s, side * (lat_face + d / 2), 0.0)
    place(ob, center, yaw)
    for (kind, loc, col, en) in lights:
        lo = pk.lights.point(loc, col, en, radius=0.15, shadow=False, name=ob.name + '_lamp', collection=coll)
        child(lo, ob, loc)
    if detail and wash is not None:
        # wash from between the picket fence and the facade, grazing up the wall
        lo = pk.lights.spot((0, -d / 2 - 0.65, 0.15), (0, -d / 2 + 0.1, h * 0.85), wash, wash_e * 0.7, angle_deg=110,
                            blend=0.9, radius=0.25, shadow=False, name=ob.name + '_wash', collection=coll, volume=0.0)
        child(lo, ob, (0, -d / 2 - 0.65, 0.15))
        lo.rotation_euler = Vector((0, 0.75, h * 0.85 - 0.15)).to_track_quat('-Z', 'Y').to_euler()
    for (p0, p1, cols) in strings:
        wire = pk.geo.string_lights(p0, p1, sag=0.12, count=11, colors=cols, strength=60.0,
                                    bulb_radius=0.04, name=ob.name + '_str', collection=coll)
        child(wire, ob, (0, 0, 0))
    return ob


# ----------------------------------------------------------------------------------------
# props
# ----------------------------------------------------------------------------------------
def fir_tier(name, r, zb, zt, nb, rng, fol, snow):
    """One whorl of a fir: nb drooping branch clusters (scalloped polar grid, the scallop
    deepening toward the tips, tips drooping) and a snow layer resting on the upper side."""
    J, I = 7, nb * 6
    jit = [rng.uniform(0.82, 1.12) for _ in range(nb)]
    ph = rng.uniform(0, 2 * math.pi)
    hgt = zt - zb
    verts, faces = [], []
    sverts = []

    def mod(th):
        k = (th - ph) * nb / (2 * math.pi)
        i0 = int(math.floor(k + 0.5)) % nb
        c = abs(math.cos(math.pi * k)) ** 0.7
        return (0.6 + 0.4 * c) * jit[i0], c
    verts.append((0.0, 0.0, zt))
    sverts.append((0.0, 0.0, zt + 0.06))
    for j in range(1, J + 1):
        f = j / J
        for i in range(I):
            th = 2 * math.pi * i / I
            m, c = mod(th)
            rr = r * f * (1.0 - (1.0 - m) * f ** 1.6)
            z = zt - hgt * f ** 0.85 - 0.22 * hgt * f ** 3 * c
            verts.append((rr * math.cos(th), rr * math.sin(th), z))
            if j < J:
                tk = (0.045 + 0.045 * c) * min(r, 1.8) * (1.0 - f ** 3) + 0.02
                sverts.append((rr * 0.97 * math.cos(th), rr * 0.97 * math.sin(th), z + tk))
    # underside ring tucked back toward the trunk
    for i in range(I):
        th = 2 * math.pi * i / I
        m, c = mod(th)
        rr = r * m * 0.55
        verts.append((rr * math.cos(th), rr * math.sin(th), zb - 0.05 * hgt))
    verts.append((0.0, 0.0, zb + 0.25 * hgt))

    def ring(j):
        return 1 + (j - 1) * I
    for i in range(I):
        faces.append((0, ring(1) + i, ring(1) + (i + 1) % I))
    for j in range(1, J + 1):
        a0 = ring(j)
        a1 = ring(j + 1)
        for i in range(I):
            faces.append((a0 + i, a1 + i, a1 + (i + 1) % I, a0 + (i + 1) % I))
    last = len(verts) - 1
    a0 = ring(J + 1)
    for i in range(I):
        faces.append((a0 + i, last, a0 + (i + 1) % I))
    ob = pk.mesh_object(name, verts, faces, material=fol, smooth=True, recalc=True)
    lumpy(ob, amp=0.05 * r, freq=4.0 / max(r, 0.3), seed=rng.randint(0, 999), up_only=False)
    sf = []
    for i in range(I):
        sf.append((0, ring(1) + i, ring(1) + (i + 1) % I))
    for j in range(1, J - 1):
        a0 = ring(j)
        a1 = ring(j + 1)
        for i in range(I):
            sf.append((a0 + i, a1 + i, a1 + (i + 1) % I, a0 + (i + 1) % I))
    sn = pk.mesh_object(name + '_snow', sverts, sf, material=snow, smooth=True, recalc=True)
    lumpy(sn, amp=0.035 * r, freq=6.0 / max(r, 0.3), seed=rng.randint(0, 999))
    return ob, sn


def fir_mat():
    """Fir foliage: fine needle grooves radiating from the trunk (bump from a noise stretched
    along the radial direction), exposed outer tips lighter and yellower than the shaded
    inside (AO), a little green translucency, so the whorls read as needles, not cards."""
    m, nt, out = nt_out('FirNeedles')
    co = pk.texcoord(nt, 'Object')
    x, y, z = pk.sep_xyz(nt, co)
    ang = pk.math_(nt, 'ARCTAN2', y, x)
    rad = pk.vmath(nt, 'LENGTH', pk.comb_xyz(nt, x, y, 0.0))
    nd, _ = pk.noise(nt, pk.comb_xyz(nt, pk.math_(nt, 'MULTIPLY', ang, 60.0), pk.math_(nt, 'MULTIPLY', rad, 2.5),
                                     pk.math_(nt, 'MULTIPLY', z, 2.5)), scale=1.0, detail=3.0, rough=0.6)
    nf, _ = pk.noise(nt, pk.vmath(nt, 'SCALE', co, scale=14.0), scale=1.0, detail=2.0)
    nrm = pk.bump(nt, pk.math_(nt, 'ADD', nd, pk.math_(nt, 'MULTIPLY', nf, 0.4)), strength=0.7, distance=0.03)
    ao = pk.node(nt, 'ShaderNodeAmbientOcclusion', samples=8)
    ao.inputs['Distance'].default_value = 0.6
    expo = pk.maprange(nt, ao.outputs['AO'], 0.25, 0.95, 0.0, 1.0)
    col = pk.mix_col(nt, expo, (0.012, 0.045, 0.035), (0.05, 0.15, 0.075))
    col = pk.mix_col(nt, pk.math_(nt, 'MULTIPLY', pk.maprange(nt, nd, 0.55, 0.75, 0.0, 1.0), 0.5), col, (0.08, 0.2, 0.09))
    p = pk._principled(nt, base=col, rough=pk.maprange(nt, nf, 0.3, 0.7, 0.5, 0.75), normal=nrm, sss=0.15,
                       sss_radius=(0.2, 0.6, 0.25), sss_scale=0.04, spec=0.45)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.03, 0.1, 0.06), rough=0.7)
    return m


def pine_source(name, H, R, tiers, lights=None, n_bulbs=0, star=False, coll=None, seg=20, rng=None):
    rng = rng or random.Random(1)
    parts = []
    fol = cached('pine', fir_mat)
    snow = snow_mat('SnowRoof', color=(0.7, 0.77, 0.94))
    bark = cached('bark', lambda: pk.mat.clay((0.12, 0.07, 0.05), roughness=0.9))
    parts.append(pk.geo.lathe([(0.16, 0), (0.12, H * 0.2)], segments=10, material=bark))
    for i in range(tiers):
        f = i / max(tiers - 1, 1)
        zb = H * (0.12 + 0.64 * f)
        zt = zb + H * (0.3 - 0.1 * f)
        r = R * (1.0 - 0.74 * f) * rng.uniform(0.92, 1.06)
        tier, sn = fir_tier(name + '_t%d' % i, r, zb, zt, rng.randint(8, 11) if f < 0.7 else rng.randint(6, 8),
                            rng, fol, snow)
        parts.append(tier)
        parts.append(sn)
    if n_bulbs and lights:
        bm = bmesh.new()
        mats = [emit(c, 40.0) for c in lights]
        turns = 4.5
        for k in range(n_bulbs):
            t = (k + 0.5) / n_bulbs
            z = H * (0.14 + 0.78 * t)
            # cone radius at height z
            rz = R * max(0.08, 1.0 - (z - H * 0.12) / (H * 0.95)) * 0.9 + 0.05
            a = t * turns * 2 * math.pi + rng.uniform(-0.1, 0.1)
            ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.045 + 0.006 * R)
            for v in ret['verts']:
                v.co += Vector((rz * math.cos(a), rz * math.sin(a), z))
            for fc in {f for v in ret['verts'] for f in v.link_faces}:
                fc.material_index = k % len(mats)
        me = bpy.data.meshes.new(name + '_bulbs')
        bm.to_mesh(me)
        bm.free()
        for m in mats:
            me.materials.append(m)
        bo = bpy.data.objects.new(name + '_bulbs', me)
        pk._link(bo)
        parts.append(bo)
    if star:
        pts = []
        for i in range(10):
            a = math.pi / 2 + i * math.pi / 5
            rr = 0.32 if i % 2 == 0 else 0.13
            pts.append((rr * math.cos(a), rr * math.sin(a) + H + 0.25))
        st = prism(name + '_star', pts, -0.05, 0.05, emit((1.0, 0.78, 0.35), 30.0))
        parts.append(st)
    ob = join(parts, name)
    if coll is not None:
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        coll.objects.link(ob)
    return ob


def lamp_source(coll):
    parts = []
    pole_m = stripe_mat('CandyPole', (0.85, 0.04, 0.08), (0.92, 0.9, 0.88), period=0.32)
    metal = cached('lampmetal', lambda: pk.mat.metal((0.03, 0.06, 0.05), roughness=0.35))
    snow = snow_mat('SnowRoof', color=(0.7, 0.77, 0.94))
    parts.append(pk.geo.lathe([(0.17, 0.0), (0.17, 0.22), (0.12, 0.3), (0.08, 0.5), (0.07, 0.62)], segments=20, material=metal))
    parts.append(pk.geo.lathe([(0.055, 0.6), (0.055, 3.25)], segments=16, material=pole_m, cap_bottom=False, cap_top=False))
    parts.append(pk.geo.lathe([(0.06, 3.22), (0.12, 3.3), (0.1, 3.42), (0.08, 3.46)], segments=16, material=metal))
    parts.append(rbox((0.27, 0.27, 0.42), (0, 0, 3.46), emit((1.0, 0.52, 0.18), 30.0), radius=0.03))
    for cx in (-0.14, 0.14):
        for cy in (-0.14, 0.14):
            parts.append(rbox((0.035, 0.035, 0.44), (cx, cy, 3.45), metal, radius=0.01))
    parts.append(pk.geo.lathe([(0.24, 3.86), (0.24, 3.9), (0.12, 4.05), (0.03, 4.18), (0.0, 4.2)], segments=4,
                              material=metal))
    sn = pk.geo.lathe([(0.21, 3.92), (0.17, 3.99), (0.1, 4.07), (0.0, 4.1)], segments=16, material=snow, cap_bottom=False)
    lumpy(sn, amp=0.012, freq=20, seed=4)
    parts.append(sn)
    # a little red bow under the lantern
    parts.append(rbox((0.2, 0.06, 0.12), (0, -0.07, 3.08), trim(CANDY_RED), radius=0.03))
    parts.append(torus('lamp_wr', 0.12, 0.04, (0, 0, 3.0), (0, 0, 0), cached('fir', lambda: pk.mat.clay((0.03, 0.14, 0.08), roughness=0.7, bumps=1.0))))
    ob = join(parts, 'LampSrc')
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    return ob


def lantern_source(coll):
    parts = [pk.geo.lathe([(0.0, 0.0), (0.085, 0.0), (0.09, 0.2), (0.0, 0.2)], segments=10,
                          material=emit((1.0, 0.6, 0.25), 9.0)),
             pk.geo.lathe([(0.095, 0.19), (0.095, 0.225), (0.0, 0.23)], segments=10,
                          material=cached('lampmetal', lambda: pk.mat.metal((0.03, 0.06, 0.05), roughness=0.35)))]
    ob = join(parts, 'LanternSrc')
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    return ob


def fence_source(coll, color=(0.9, 0.9, 0.93), name='FenceSrc'):
    parts = []
    pm = trim(color)
    snow = snow_mat('SnowRoof', color=(0.7, 0.77, 0.94))
    L = 3.0
    for i in range(16):
        x = -L / 2 + (i + 0.5) * L / 16
        parts.append(rbox((0.085, 0.035, 0.85), (x, 0, 0), pm, radius=0.015, seg=1))
        parts.append(rbox((0.1, 0.06, 0.06), (x, 0, 0.85), snow, radius=0.025, seg=2))
    for z in (0.25, 0.65):
        parts.append(rbox((L, 0.04, 0.08), (0, 0.035, z), pm, radius=0.015, seg=1))
    parts.append(rbox((L, 0.12, 0.07), (0, 0.035, 0.73), snow, radius=0.03, seg=2))
    ob = join(parts, name)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    return ob


def snowman(name, loc, yaw, coll, scale=1.0):
    parts = []
    s = snow_mat('Snow')
    for (r, z) in ((0.42, 0.36), (0.31, 0.95), (0.22, 1.38)):
        o = sphere(name + '_b', r * scale, (0, 0, z * scale), s, sub=3)
        lumpy(o, amp=0.015, freq=8, seed=int(z * 10), up_only=False)
        parts.append(o)
    coal = cached('coal', lambda: pk.mat.basic((0.01, 0.01, 0.012), roughness=0.4))
    for x in (-0.08, 0.08):
        parts.append(sphere(name + '_e', 0.028 * scale, (x * scale, -0.19 * scale, 1.46 * scale), coal, sub=1))
    for k in range(3):
        parts.append(sphere(name + '_c', 0.03 * scale, (0, -0.3 * scale, (0.82 + 0.13 * k) * scale), coal, sub=1))
    nose = pk.geo.lathe([(0.04, 0.0), (0.0, 0.2)], segments=8, material=cached('carrot', lambda: pk.mat.toy_plastic((1.0, 0.35, 0.05), roughness=0.4)))
    nose.location = (0, -0.2 * scale, 1.39 * scale)
    nose.rotation_euler = (math.pi / 2, 0, 0)
    nose.scale = (scale, scale, scale)
    parts.append(nose)
    parts.append(torus(name + '_sc', 0.21 * scale, 0.06 * scale, (0, 0, 1.18 * scale), (0.15, 0, 0), stripe_mat('Scarf', CANDY_RED, (0.95, 0.92, 0.85), period=0.05, helix=False, axis='X', rough=0.7)))
    hat = pk.geo.lathe([(0.0, 0.0), (0.24, 0.0), (0.24, 0.03), (0.15, 0.03), (0.15, 0.3), (0.0, 0.3)], segments=20, material=coal)
    hat.location = (0.02, 0, 1.55 * scale)
    hat.scale = (scale, scale, scale)
    hat.rotation_euler = (0.1, -0.15, 0)
    parts.append(hat)
    wood = cached('bark', lambda: pk.mat.clay((0.12, 0.07, 0.05), roughness=0.9))
    for sx in (-1, 1):
        arm = pk.geo.tube_along([(sx * 0.25 * scale, 0, 1.0 * scale), (sx * 0.55 * scale, 0, 1.2 * scale),
                                 (sx * 0.72 * scale, 0.05, 1.4 * scale)], radius=0.018 * scale, segments=6, material=wood)
        parts.append(arm)
    ob = join(parts, name)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    place(ob, loc, yaw)
    return ob


def snowflake_neon(name, center, yaw, R, mat, coll):
    """Street decoration: a six-armed snowflake of neon tube hung over the road."""
    objs = []
    for k in range(6):
        a = k * math.pi / 3
        d = Vector((math.cos(a), 0, math.sin(a)))
        n = Vector((-math.sin(a), 0, math.cos(a)))
        objs.append(pk.geo.tube_along([tuple(d * 0.12), tuple(d * R)], radius=0.035, segments=8, material=mat))
        for f, bl in ((0.5, 0.32), (0.75, 0.22)):
            base = d * (R * f)
            for sgn in (-1, 1):
                tip = base + (d * 0.6 + n * sgn * 0.8).normalized() * (R * bl)
                objs.append(pk.geo.tube_along([tuple(base), tuple(tip)], radius=0.03, segments=8, material=mat))
    ring = [(0.16 * math.cos(2 * math.pi * i / 24), 0, 0.16 * math.sin(2 * math.pi * i / 24)) for i in range(25)]
    objs.append(pk.geo.tube_along(ring, radius=0.03, segments=8, material=mat))
    ob = join(objs, name)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    place(ob, center, yaw)
    return ob


# ----------------------------------------------------------------------------------------
# hero: the bakery
# ----------------------------------------------------------------------------------------
def pretzel_points(scale=1.0, n=160):
    """Inverted trefoil: two big loops on top, a small one at the bottom (a pretzel).
    Returns (x, depth, z) with a little depth so the strands pass over and under."""
    pts = []
    for i in range(n + 1):
        t = 2 * math.pi * i / n
        x = (math.sin(t) + 2 * math.sin(2 * t)) / 3.0
        z = (math.cos(t) - 2 * math.cos(2 * t)) / 3.0
        if z < 0:
            z *= 0.72
        pts.append((x * scale * 1.1, 0.035 * math.sin(3 * t), z * scale))
    return pts


def bakery(ctx, path, s, side, lat_face, coll, rng):
    w, d, h, rh = 10.5, 7.5, 6.6, 3.6
    parts = []
    wm = cached('bakewall', lambda: pk.mat.clay((0.88, 0.74, 0.62), roughness=0.8, bumps=0.3, variation=0.05))
    tm = trim(CANDY_PINK)
    tm2 = trim((0.35, 0.9, 0.72))
    rm = roofm((0.32, 0.08, 0.08))
    snow = snow_mat('SnowRoof', color=(0.7, 0.77, 0.94))
    shop = M['win_shop']
    up = M['win_bake']
    parts.append(rbox((w, d, h), (0, 0, 0), wm, radius=0.16, seg=3))
    parts.append(rbox((w + 0.16, d + 0.16, 0.5), (0, 0, 0), cached('stone', lambda: pk.mat.clay((0.3, 0.3, 0.38), roughness=0.75, bumps=0.8)), radius=0.06))
    half = w / 2
    parts.append(prism('bk_g', [(-half + 0.03, h - 0.05), (half - 0.03, h - 0.05), (0, h + rh - 0.05)], -d / 2 + 0.03, d / 2 - 0.03, wm))
    ov, ovf, t, ts = 0.5, 0.45, 0.26, 0.42
    X = half + ov

    def zb(x):
        return h + rh * (1 - abs(x) / half)
    roof = prism('bk_r', [(-X, zb(-X)), (0, h + rh), (X, zb(X)), (X, zb(X) + t), (0, h + rh + t * 1.15), (-X, zb(-X) + t)],
                 -d / 2 - ovf, d / 2 + ovf, rm)
    pk.geo.bevel(roof, width=0.06, segments=2, angle=30)
    parts.append(roof)
    X2 = X + 0.07
    sn = prism('bk_s', [(-X2, zb(-X2) + t - 0.02), (0, h + rh + t * 1.1), (X2, zb(X2) + t - 0.02),
                        (X2 - 0.05, zb(X2) + t + ts * 0.75), (0, h + rh + t + ts), (-X2 + 0.05, zb(-X2) + t + ts * 0.75)],
               -d / 2 - ovf - 0.1, d / 2 + ovf + 0.08, snow)
    pk.geo.bevel(sn, width=0.2, segments=4, angle=25)
    lumpy(sn, amp=0.06, freq=2.2, seed=7)
    parts.append(sn)
    L = math.hypot(X, rh + ov * rh / half)
    ang = math.atan2(rh + ov * rh / half, X)
    for sx in (-1, 1):
        parts.append(rbox((L + 0.1, 0.14, 0.26), (sx * X / 2, -d / 2 - ovf - 0.02, (zb(sx * X) + h + rh) / 2 - 0.13), tm,
                          radius=0.05, rot=(0, math.degrees(sx * ang), 0)))
        parts.append(icicles('bk_ice', (sx * X, -d / 2 - ovf, zb(sx * X) - 0.02), (sx * X, d / 2 + ovf, zb(sx * X) - 0.02), 30, rng))
    yf = -d / 2
    # shop front: three big arched display windows and a glazed door
    for x in (-3.3, 3.3):
        parts.append(rbox((2.6, 0.12, 3.0), (x, yf + 0.02, 0.55), tm, radius=0.06))
        parts.append(pk.geo.window_panel(1, 1, win_w=2.2, win_h=2.55, material=shop, round_top=True,
                                         location=(x, yf - 0.05, 0.7), seed=3 + int(x)))
        parts.append(rbox((2.7, 0.4, 0.12), (x, yf - 0.15, 0.55), tm2, radius=0.04))
        parts.append(rbox((2.65, 0.36, 0.1), (x, yf - 0.16, 0.66), snow, radius=0.05, seg=3))
        # loaves and a cake stand silhouetted in the window
        dark = cached('loafdark', lambda: pk.mat.basic((0.05, 0.025, 0.015), roughness=0.6))
        for k in range(4):
            lx = x - 0.75 + k * 0.5
            parts.append(sphere('loaf', 0.17, (lx, yf - 0.02, 0.95 + 0.04 * (k % 2)), dark, sub=2, scale=(1.3, 0.6, 0.75)))
        parts.append(pk.geo.lathe([(0.0, 1.35), (0.45, 1.35), (0.45, 1.39), (0.05, 1.39), (0.05, 1.6), (0.3, 1.6),
                                   (0.3, 1.64), (0.0, 1.64)], segments=16, material=dark))
        parts[-1].location = (x + 0.35, yf + 0.05, 0.0)
        parts.append(sphere('cake', 0.18, (x + 0.35, yf + 0.05, 1.82), dark, sub=2, scale=(1.0, 1.0, 0.8)))
    parts.append(rbox((1.7, 0.12, 2.9), (0, yf + 0.02, 0.55), tm, radius=0.06))
    parts.append(pk.geo.window_panel(1, 1, win_w=1.3, win_h=2.4, material=shop, round_top=True, location=(0, yf - 0.05, 0.62), seed=11))
    stone = cached('stone', lambda: pk.mat.clay((0.3, 0.3, 0.38), roughness=0.75, bumps=0.8))
    parts.append(rbox((2.4, 0.9, 0.22), (0, yf - 0.5, 0.0), stone, radius=0.05))
    parts.append(rbox((2.2, 0.6, 0.2), (0, yf - 0.35, 0.2), stone, radius=0.05))
    parts.append(rbox((2.35, 0.85, 0.07), (0, yf - 0.5, 0.22), snow, radius=0.03))
    # candy-striped awning over the shop windows
    aw = stripe_mat('Awning', (0.95, 0.2, 0.42), (0.98, 0.92, 0.86), period=0.55, helix=False, axis='X', rough=0.55)
    prof = []
    for i in range(9):
        a = math.pi / 2 * i / 8
        prof.append((-0.05 - 1.25 * math.sin(a), 3.75 - 1.0 * (1 - math.cos(a)) * 0.9))
    prof += [(p[0] + 0.05, p[1] + 0.06) for p in reversed(prof)]
    awn = prism('bk_aw', [(-p[0], p[1]) for p in prof], -w / 2 + 0.3, w / 2 - 0.3, aw, axis='X')
    awn.rotation_euler = (0, 0, 0)
    awn.location = (0, yf, 0)
    # the prism above is built in (y, z) with y measured outward; flip so it sticks out to -Y
    for v in awn.data.vertices:
        v.co.y = -v.co.y
    awn.data.update()
    parts.append(awn)
    sp_ = []
    for i in range(8):
        a = math.radians(62) * i / 7
        sp_.append((0.05 + 1.25 * math.sin(a), 3.75 - 0.9 * (1 - math.cos(a)) + 0.05))
    sp_ += [(p[0], p[1] + 0.16 * (1 - i / 9.0)) for i, p in enumerate(reversed(sp_))]
    awsn = prism('bk_aws', sp_, -w / 2 + 0.35, w / 2 - 0.35, snow, axis='X')
    for v in awsn.data.vertices:
        v.co.y = -v.co.y
    awsn.location = (0, yf, 0.02)
    pk.geo.bevel(awsn, width=0.05, segments=3, angle=25)
    parts.append(awsn)
    # upper floor windows with flower boxes, round attic window
    for x in (-3.4, 0.0, 3.4):
        window_set(parts, x, 4.55, 1.2, 1.45, yf, up, tm2, tm, rng)
    parts.append(rbox((1.8, 0.12, 1.8), (0, yf + 0.02, h + 0.6), tm, radius=0.85, seg=6))
    parts.append(pk.geo.window_panel(1, 1, win_w=1.4, win_h=1.4, material=up, round_top=True, location=(0, yf - 0.05, h + 0.8), seed=5))
    # chimney
    brick = cached('brick', lambda: pk.mat.clay((0.42, 0.2, 0.18), roughness=0.8, bumps=0.9))
    parts.append(rbox((0.8, 0.8, 3.0), (2.6, 1.0, zb(2.6) - 0.4), brick, radius=0.05))
    parts.append(rbox((1.05, 1.05, 0.32), (2.6, 1.0, zb(2.6) + 2.55), snow, radius=0.14, seg=3))
    ob = join(parts, 'Bakery')
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    yaw = facing_yaw(path, s, side, toward_cam_deg=40.0)
    center = path.offset(s, side * (lat_face + d / 2), 0.0)
    place(ob, center, yaw)
    # pretzel neon on a bracket
    pz = pretzel_points(0.62)
    neon = pk.geo.tube_along(pz, radius=0.045, segments=10,
                             material=pk.mat.neon_tube((1.0, 0.55, 0.15), 26.0, name='PretzelNeon'), name='Pretzel')
    child(neon, ob, (half - 0.2, yf - 1.05, 5.35))
    neon.rotation_euler = (0, 0, math.pi / 2)
    br = pk.geo.tube_along([(half - 0.2, yf, 6.15), (half - 0.2, yf - 1.1, 6.15)], radius=0.03, segments=8,
                           material=cached('lampmetal', lambda: pk.mat.metal((0.03, 0.06, 0.05), roughness=0.35)), name='PretzelArm')
    child(br, ob, (0, 0, 0))
    # warm light: shop spill onto the snow and road, interior glow, eave string
    for x in (-3.3, 0.0, 3.3):
        lo = pk.lights.area((x, yf - 0.6, 2.2), (x, yf - 6.0, -0.5), size=(2.4, 2.2), color=(1.0, 0.58, 0.25),
                            energy=320.0, name='BakeSpill', collection=coll, spread_deg=150)
        # web (export-only property): the 4x spot stand-in matches the panel on its axis but
        # falls off faster beyond about 50 degrees, and the bakery windows' GI glow on the snow
        # has no web counterpart; 1.25x brings the warm pool on the lane closer (t4 snow
        # (62,53,63) at 1x, (70,57,64) at 1.5x, film (94,75,60); 1.5x over-lit the near road
        # at t7, (64,69,87) against (40,47,66))
        lo['pk_web_energy'] = 320.0 * 4.0 * 1.25
        child(lo, ob, (x, yf - 0.6, 2.2))
        lo.rotation_euler = (Vector((0, -5.4, -2.7))).to_track_quat('-Z', 'Y').to_euler()
    for x in (-3.4, 3.4):
        lo = pk.lights.point((x, yf - 0.7, 4.6), (1.0, 0.72, 0.5), 45.0, radius=0.3, shadow=False, name='BakeUp', collection=coll)
        child(lo, ob, (x, yf - 0.7, 4.6))
    lo = pk.lights.point((half - 0.2, yf - 1.3, 5.4), (1.0, 0.55, 0.18), 70.0, radius=0.3, shadow=False, name='PretzelGlow', collection=coll)
    child(lo, ob, (half - 0.2, yf - 1.3, 5.4))
    for sx in (-1, 1):
        wire = pk.geo.string_lights((sx * (X - 0.15), yf - ovf - 0.14, zb(sx * X) - 0.22), (0, yf - ovf - 0.14, h + rh - 0.25),
                                    sag=0.12, count=16, colors=BULB_WARM, strength=90.0, bulb_radius=0.05,
                                    name='BakeStr', collection=coll)
        child(wire, ob, (0, 0, 0))
    return ob, yaw, center


# ----------------------------------------------------------------------------------------
# landmark: the clock tower
# ----------------------------------------------------------------------------------------
def clock_tower(ctx, path, s, side, lat, coll, rng):
    parts = []
    stone = stone_mat((0.42, 0.4, 0.44), name='TowerStone', block=(0.7, 0.34))
    body = stone_mat((0.72, 0.66, 0.58), name='TowerBody', block=(0.5, 0.25))
    # web: EEVEE's fast GI lets the cornice bulbs and lit windows wash the tower body warm; the
    # web has no GI, so its flat fallback carries that bounce as a faint warm glow (export-only;
    # measured at t7: upper face (69,47,26) -> (114,80,30) against the film's (115,86,35))
    pk._web(body, base=(0.72, 0.66, 0.58), rough=0.8, emit=(1.0, 0.6, 0.25), emit_strength=0.28)
    cream = trim((0.95, 0.88, 0.75))
    pink = trim(CANDY_RED)
    spire = cached('spire2', lambda: shingle_mat((0.07, 0.2, 0.2), name='SpireCopper'))
    snow = snow_mat('SnowRoof', color=(0.7, 0.77, 0.94))
    gold = cached('gold', lambda: pk.mat.metal((1.0, 0.72, 0.32), roughness=0.25))
    dark = cached('coal', lambda: pk.mat.basic((0.01, 0.01, 0.012), roughness=0.4))
    parts.append(rbox((5.2, 5.2, 6.0), (0, 0, 0), stone, radius=0.25, seg=3))
    parts.append(rbox((5.6, 5.6, 0.4), (0, 0, 6.0), pink, radius=0.12))
    parts.append(rbox((5.65, 5.65, 0.12), (0, 0, 6.38), snow, radius=0.06, seg=3))
    parts.append(rbox((4.4, 4.4, 7.0), (0, 0, 6.4), body, radius=0.18, seg=3))
    for cx in (-2.1, 2.1):
        for cy in (-2.1, 2.1):
            parts.append(rbox((0.5, 0.5, 7.0), (cx, cy, 6.4), cream, radius=0.08))
    parts.append(rbox((5.0, 5.0, 3.4), (0, 0, 13.4), body, radius=0.2, seg=3))
    parts.append(rbox((5.4, 5.4, 0.35), (0, 0, 13.25), pink, radius=0.1))
    parts.append(rbox((5.5, 5.5, 0.38), (0, 0, 16.8), pink, radius=0.12))
    parts.append(rbox((5.55, 5.55, 0.14), (0, 0, 17.16), snow, radius=0.07, seg=3))
    face = cached('clockface', lambda: pk.mat.emission((1.0, 0.84, 0.58), 2.4))
    lit = M['win_gold']
    for k in range(4):
        a = k * math.pi / 2
        n = Vector((math.sin(a), -math.cos(a), 0))
        t = Vector((math.cos(a), math.sin(a), 0))
        c = n * 2.52 + Vector((0, 0, 15.1))
        disc = pk.geo.lathe([(0.0, 0.0), (1.3, 0.0)], segments=48, material=face, cap_top=False, cap_bottom=False)
        disc.location = tuple(c)
        disc.rotation_euler = (-n).to_track_quat('Z', 'Y').to_euler()
        parts.append(disc)
        rim = torus('rim', 1.36, 0.09, tuple(c - n * 0.02), (-n).to_track_quat('Z', 'Y').to_euler(), gold, maj=48)
        parts.append(rim)
        for j in range(12):
            b = 2 * math.pi * j / 12
            p = c + n * 0.03 + (t * math.cos(b) + Vector((0, 0, 1)) * math.sin(b)) * 1.08
            tk = rbox((0.13 if j % 3 == 0 else 0.07, 0.04, 0.3 if j % 3 == 0 else 0.17), tuple(p), dark, radius=0.01, seg=1)
            tk.rotation_euler = (0, 0, a)
            tk.location = tuple(p - Vector((0, 0, 0.13 if j % 3 == 0 else 0.075)))
            # rotate tick around face normal so it points to the centre
            q = Matrix.Rotation(math.pi / 2 - b, 4, n)
            tk.matrix_world = Matrix.Translation(p) @ q @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0, 0, -0.075))
            parts.append(tk)
        for (ln, ang, wd) in ((0.98, 0.35 + k * 0.01, 0.1), (0.66, 2.1, 0.14)):
            hd = rbox((wd, 0.04, ln), (0, 0, 0), dark, radius=0.01, seg=1)
            q = Matrix.Rotation(-ang, 4, n)
            hd.matrix_world = Matrix.Translation(c + n * 0.06) @ q @ Matrix.Rotation(a, 4, 'Z')
            parts.append(hd)
        # arched windows lower down
        for z in (2.2, 8.4, 10.9):
            wp = pk.geo.window_panel(1, 1, win_w=0.9, win_h=1.5, material=lit, round_top=True,
                                     location=tuple(n * (2.62 if z < 6 else 2.22) + Vector((0, 0, z))), seed=k * 7 + int(z))
            wp.rotation_euler = (0, 0, a)
            parts.append(wp)
    # belfry: four corner posts, arches, lit bell
    parts.append(rbox((4.0, 4.0, 3.0), (0, 0, 17.2), cached('belfry', lambda: pk.mat.clay((0.06, 0.05, 0.1), roughness=0.9)), radius=0.1))
    for cx in (-2.0, 2.0):
        for cy in (-2.0, 2.0):
            parts.append(rbox((0.7, 0.7, 3.1), (cx, cy, 17.2), cream, radius=0.1))
    bellglow = emit((1.0, 0.72, 0.35), 6.0)
    for k in range(4):
        a = k * math.pi / 2
        n = Vector((math.sin(a), -math.cos(a), 0))
        wp = pk.geo.window_panel(1, 1, win_w=2.2, win_h=2.5, material=M['win_bell'], round_top=True,
                                 location=tuple(n * 2.03 + Vector((0, 0, 17.35))), seed=k)
        wp.rotation_euler = (0, 0, a)
        parts.append(wp)
    parts.append(rbox((5.2, 5.2, 0.4), (0, 0, 20.2), pink, radius=0.12))
    # spire with snow skirt and a gold finial star
    sp = pk.geo.lathe([(2.95, 20.55), (2.75, 21.0), (2.15, 22.4), (1.45, 24.0), (0.8, 25.7), (0.32, 27.2),
                       (0.1, 28.0), (0.0, 28.2)], segments=8, material=spire, sharp_angle=50)
    sp.rotation_euler = (0, 0, math.pi / 8)
    parts.append(sp)
    for (z0, r0, r1) in ((21.0, 2.95, 2.3), (23.9, 1.7, 1.3)):
        ssk = pk.geo.lathe([(r0 + 0.12, z0 - 0.25), (r0 - 0.05, z0 + 0.12), (r1, z0 + 0.7), (r1 - 0.3, z0 + 0.95)],
                           segments=8, material=snow, cap_bottom=False, cap_top=False)
        ssk.rotation_euler = (0, 0, math.pi / 8)
        lumpy(ssk, amp=0.05, freq=2.5, seed=int(z0))
        parts.append(ssk)
    parts.append(pk.geo.lathe([(0.0, 28.1), (0.06, 28.1), (0.06, 29.2), (0.0, 29.2)], segments=8, material=gold))
    pts = []
    for i in range(10):
        b = math.pi / 2 + i * math.pi / 5
        rr = 0.5 if i % 2 == 0 else 0.2
        pts.append((rr * math.cos(b), rr * math.sin(b) + 29.6))
    parts.append(prism('tw_star', pts, -0.07, 0.07, emit((1.0, 0.78, 0.4), 40.0)))
    # door
    parts.append(rbox((1.9, 0.14, 3.2), (0, -2.62, 0.0), cream, radius=0.1))
    parts.append(pk.geo.window_panel(1, 1, win_w=1.4, win_h=2.7, material=M['win_shop'], round_top=True,
                                     location=(0, -2.72, 0.05), seed=9))
    tw = join(parts, 'ClockTower')
    for c in list(tw.users_collection):
        c.objects.unlink(tw)
    coll.objects.link(tw)
    yaw = facing_yaw(path, s, side, toward_cam_deg=28.0)
    center = path.offset(s, side * lat, 0.0)
    place(tw, center, yaw)
    # lights: cyan / magenta uplights, clock glow, bell glow, string lights from the spire
    for (x, y, col) in ((-2.2, -4.6, (1.0, 0.6, 0.3)), (2.2, -4.6, (1.0, 0.68, 0.38)), (-4.6, 1.5, (0.45, 0.6, 1.0))):
        lo = pk.lights.spot((x, y, 0.4), (x * 0.1, y * 0.1, 9.0), col, 1500.0, angle_deg=62, blend=0.85, radius=0.3,
                            shadow=False, name='TowerUp', collection=coll, volume=0.0)
        child(lo, tw, (x, y, 0.4))
        d = Vector((x * 0.1 - x, y * 0.1 - y, 8.6))
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    # bulbs along the two cornices that face the road
    for (z, r) in ((6.42, 2.86), (13.3, 2.76)):
        for (a0, a1) in (((-r, -r), (r, -r)), ((r, -r), (r, r)), ((-r, -r), (-r, r))):
            wire = pk.geo.string_lights((a0[0], a0[1], z), (a1[0], a1[1], z), sag=0.05, count=14,
                                        colors=BULB_WARM, strength=55.0, bulb_radius=0.05, name='TowerCornice',
                                        collection=coll)
            child(wire, tw, (0, 0, 0))
    for (x, y, col) in ((-2.6, -2.6, (0.45, 0.62, 1.0)), (2.6, -2.6, (1.0, 0.66, 0.36))):
        lo = pk.lights.spot((x, y, 20.7), (0, 0, 27.0), col, 700.0, angle_deg=45, blend=0.7, radius=0.2,
                            shadow=False, name='SpireUp', collection=coll, volume=0.0)
        child(lo, tw, (x, y, 20.7))
        lo.rotation_euler = Vector((-x, -y, 6.3)).to_track_quat('-Z', 'Y').to_euler()
    lo = pk.lights.point((0, -3.8, 15.1), (1.0, 0.82, 0.55), 220.0, radius=1.0, shadow=False, name='ClockGlow', collection=coll)
    child(lo, tw, (0, -3.8, 15.1))
    lo = pk.lights.point((0, 0, 18.5), (1.0, 0.68, 0.32), 450.0, radius=0.6, shadow=False, name='BellGlow', collection=coll)
    child(lo, tw, (0, 0, 18.5))
    bell = pk.geo.lathe([(0.0, 0.0), (0.75, 0.0), (0.7, 0.15), (0.5, 0.7), (0.42, 1.2), (0.25, 1.45), (0.0, 1.5)],
                        segments=24, material=gold, name='Bell', collection=coll)
    child(bell, tw, (0, 0, 17.8))
    for (cx, cy) in ((-2.6, -2.6), (2.6, -2.6)):
        wire = pk.geo.string_lights((0, 0, 27.0), (cx, cy, 17.4), sag=0.3, count=26, colors=BULB_CANDY,
                                    strength=110.0, bulb_radius=0.06, name='TowerStr', collection=coll)
        child(wire, tw, (0, 0, 0))
    return tw, center


# ----------------------------------------------------------------------------------------
# vehicle: a vintage car seen from the driver's seat. Low dash, a long rounded hood in deep
# red lacquer with a chrome centre strip and a jet ornament, pontoon fender crowns at the
# frame edges, the engine's warmth melting the snow off the middle of the hood (snow stays on
# the fenders, the hood edges and packed into the windshield corners), parked wipers, pillar
# bases at the corners, a few snow crystals stuck to the glass, frost in the glass corners.
# ----------------------------------------------------------------------------------------
COVER = 0.07           # dash top at the centre (fraction of frame height from the bottom)
HOOD_TOP = 0.135       # hood crest at the centre (hood + dash = 13.5 percent of the frame)
PILLARS = False


def paint_mat():
    """Deep red vintage lacquer under a glossy clear coat, beaded with melt water."""
    if 'Paint' in M:
        return M['Paint']
    m, nt, out = nt_out('CarPaint')
    co = pk.texcoord(nt, 'Object')
    vo = pk.voronoi(nt, co, scale=95.0, feature='F1')
    szf, _ = pk.noise(nt, co, scale=40.0, detail=1.0)
    rad = pk.maprange(nt, szf, 0.45, 0.75, 0.0, 0.33)
    dist = vo['Distance']
    bead = pk.math_(nt, 'LESS_THAN', dist, rad)
    hgt = pk.math_(nt, 'MULTIPLY', bead, pk.math_(nt, 'SQRT', pk.math_(nt, 'MAXIMUM', pk.math_(
        nt, 'SUBTRACT', pk.math_(nt, 'MULTIPLY', rad, rad), pk.math_(nt, 'MULTIPLY', dist, dist)), 0.0)))
    nb = pk.bump(nt, hgt, strength=0.8, distance=0.005)
    op, _ = pk.noise(nt, co, scale=160.0, detail=2.0)
    nrm = pk.bump(nt, op, strength=0.04, distance=0.002, normal=nb)
    df, _ = pk.noise(nt, co, scale=4.0, detail=4.0, rough=0.6)
    col = pk.vmath(nt, 'SCALE', (0.52, 0.02, 0.03), scale=pk.maprange(nt, df, 0.3, 0.7, 0.9, 1.06))
    p = pk._principled(nt, base=col, rough=pk.mix_f(nt, bead, 0.16, 0.05), normal=nrm, coat=1.0,
                       coat_rough=0.02, coat_normal=nb, spec=0.5)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    # web: the lacquer's clear coat (KHR_materials_clearcoat), so the hood mirrors the cool sky
    # and reads crimson-magenta as in the film rather than flat red. The film's coat also
    # mirrors the broad HoodFill / HoodSheen panels and the lit street (screen-space), a cool
    # sheen over the whole hood ((62,21,56) against the web's (80,4,39)); the web's point-like
    # stand-ins only make pin highlights, so a faint cool glow stands in for that sheen
    pk._web(m, base=(0.17, 0.012, 0.02), rough=0.2, coat=1.0, coat_rough=0.03,
            emit=(0.076, 0.42, 1.0), emit_strength=0.105)
    M['Paint'] = m
    return m


def grid_mesh(name, rows, material, flip=False):
    W_ = len(rows[0])
    verts = [p for r in rows for p in r]
    faces = [(j * W_ + i, j * W_ + i + 1, (j + 1) * W_ + i + 1, (j + 1) * W_ + i)
             for j in range(len(rows) - 1) for i in range(W_ - 1)]
    if flip:
        faces = [tuple(reversed(f)) for f in faces]
    return pk.mesh_object(name, verts, faces, material=material)


def vehicle(cam):
    V = pk.vehicle
    parts = V.car_dashboard(cam, cover=COVER, depth=0.85, bow=0.1, color=(0.03, 0.006, 0.008), roughness=0.35,
                            coat=0.6, coat_rough=0.14, trim_color=(0.78, 0.78, 0.8), trim_roughness=0.08,
                            wheel_top=0.034, windshield_reflect=0.06, windshield_dirt=0.14, rain_beads=0.0,
                            cabin_light=10.0, cabin_color=(0.45, 0.58, 1.0))
    pk.exclude_from_lights(*[parts[k] for k in ('dashboard', 'trim', 'wheel') if k in parts])
    paint = paint_mat()
    chrome = cached('chrome', lambda: pk.mat.metal((0.92, 0.92, 0.95), roughness=0.06, scratches=0.05, dirt=0.05))
    rubber = cached('rubber', lambda: pk.mat.basic((0.012, 0.012, 0.014), roughness=0.55))
    snow = snow_mat('SnowCar', color=(0.7, 0.77, 0.93), rough=0.45, sss=0.5, sparkle=1.3, scale=0.25, lumps=0.35)
    # web: the crust is lit by the unlinked HoodFill / CabinFill stand-ins and has no SSS or
    # crack shading, so it read about 40% brighter than the film's (85,105,158 vs 57,78,118)
    pk._web(snow, base=(0.49, 0.55, 0.68), rough=0.5)
    cz = lambda cover, y: V.cover_z(cam, cover, y)    # noqa: E731
    yc, r = 0.95, 0.05
    z_top = cz(COVER, yc - r)
    y0, z0 = yc + 0.02, z_top - 0.02                  # windshield base (kit dashboard)
    rake = math.radians(58)
    car = []

    # ---- hood
    y_c, y_f = 1.1, 2.6
    z_c, z_f = cz(COVER + 0.012, y_c), cz(HOOD_TOP, y_f)
    HW = 0.68

    def zh(x, y):
        t = (y - y_c) / (y_f - y_c)
        base = z_c + (z_f - z_c) * t + 0.035 * math.sin(math.pi * min(max(t, 0.0), 1.0))
        ax = abs(x)
        return base - 0.055 * (ax / HW) ** 2 + 0.012 * max(0.0, 1.0 - ax / 0.3) ** 2
    nx, ny = 56, 40
    xs = [-HW + 2 * HW * i / nx for i in range(nx + 1)]
    ys = [y_c + (y_f - y_c) * j / ny for j in range(ny + 1)]
    rows = [[(x, y, zh(x, y)) for x in xs] for y in ys]
    for k in range(1, 7):
        a = math.pi / 2 * k / 6
        rows.append([(x, y_f + 0.07 * math.sin(a), zh(x, y_f) - 0.07 * (1 - math.cos(a))) for x in xs])
    rows.append([(x, y_f + 0.075, zh(x, y_f) - 0.25) for x in xs])
    grid = []
    for rw in rows:
        l0, r0 = rw[0], rw[-1]
        grid.append([(l0[0] - 0.025, l0[1], l0[2] - 0.12), (l0[0] - 0.02, l0[1], l0[2] - 0.025)] + list(rw) +
                    [(r0[0] + 0.02, r0[1], r0[2] - 0.025), (r0[0] + 0.025, r0[1], r0[2] - 0.12)])
    hood = grid_mesh('Hood', grid, paint)
    pk.edge_mask(hood, gain=3.0)
    car.append(hood)
    # cowl panel between the glass base and the hood
    cowl = grid_mesh('Cowl', [[(x, y0 + 0.01, z0 - 0.015) for x in xs], [(x, y_c, zh(x, y_c) - 0.005) for x in xs]], paint)
    car.append(cowl)

    # ---- pontoon fender crowns beyond a panel gap (only their inner humps are in frame)
    for sgn in (-1, 1):
        fx = [0.71 + 0.4 * i / 14 for i in range(15)]
        frows = []
        fys = [y_c + 0.1 + (y_f + 0.1 - y_c - 0.1) * j / ny for j in range(ny + 1)]
        for y in fys:
            t = (y - y_c) / (y_f - y_c)
            pod = 0.05 * pk._smoothstep(0.45, 0.95, t)
            frows.append([(sgn * x, y, zh(HW, min(y, y_f)) - 0.02 + (0.025 + pod) * math.sin(math.pi * (x - 0.71) / 0.4) ** 0.7)
                          for x in fx])
        for k in range(1, 6):
            a = math.pi / 2 * k / 5
            y = fys[-1]
            frows.append([(p[0], y + 0.09 * math.sin(a), p[2] - 0.09 * (1 - math.cos(a))) for p in frows[ny]])
        fd = grid_mesh('Fender', frows, paint, flip=sgn < 0)
        pk.edge_mask(fd, gain=3.0)
        car.append(fd)
        # snow sheet on the fender crown
        srows = []
        for jj, rw in enumerate(frows[:ny + 1]):
            srows.append([(p[0], p[1], p[2] + 0.002 + 0.006 * math.sin(math.pi * k_ / (len(rw) - 1)) ** 0.6)
                          for k_, p in enumerate(rw)])
        fs = grid_mesh('FenderSnow', srows, snow, flip=sgn < 0)
        lumpy(fs, amp=0.003, freq=14.0, seed=21 + sgn)
        car.append(fs)

    # ---- snow left on the hood: the engine has melted a clear lane down the middle
    def thick(x, y):
        xm = 0.5 + 0.04 * math.sin(3.3 * y + 0.4) + 0.025 * math.sin(11.0 * y + 1.3)
        n = 0.012 * math.sin(23 * x + 7 * y) + 0.008 * math.sin(41 * y - 13 * x)
        k = pk._smoothstep(xm, xm + 0.12, abs(x) + n)
        return 0.016 * k * (0.85 + 0.15 * math.sin(17 * x + 5 * y))
    xs2 = [-HW + 2 * HW * i / 160 for i in range(161)]
    ys2 = [y_c + (y_f - y_c) * j / 110 for j in range(111)]
    th = [[thick(x, y) for x in xs2] for y in ys2]
    srows = []
    for j, y in enumerate(ys2):
        srows.append([(x, y, zh(x, y) + 0.0012 + th[j][i]) for i, x in enumerate(xs2)])
    verts = [p for rw in srows for p in rw]
    W_ = len(xs2)
    faces = []
    for j in range(len(srows) - 1):
        for i in range(W_ - 1):
            if max(th[j][i], th[j][i + 1], th[j + 1][i], th[j + 1][i + 1]) > 0.0008:
                faces.append((j * W_ + i, j * W_ + i + 1, (j + 1) * W_ + i + 1, (j + 1) * W_ + i))
    hs = pk.mesh_object('HoodSnow', verts, faces, material=snow)
    lumpy(hs, amp=0.002, freq=30.0, seed=17)
    car.append(hs)

    # ---- chrome centre strip and a jet hood ornament
    strip = pk.geo.tube_along([(0.0, y, zh(0.0, y) + 0.004) for y in np.linspace(1.2, y_f + 0.02, 30)],
                              radius=0.0075, segments=10, material=chrome, name='HoodStrip')
    car.append(strip)
    zo = zh(0.0, y_f - 0.12)
    orn = pk.geo.sweep([(0.0, y_f - 0.24, zo + 0.004), (0.0, y_f - 0.14, zo + 0.03), (0.0, y_f - 0.04, zo + 0.05),
                        (0.0, y_f + 0.04, zo + 0.058)],
                       [(0.016 * math.cos(2 * math.pi * i / 12), 0.022 * math.sin(2 * math.pi * i / 12)) for i in range(12)],
                       material=chrome, name='Ornament', scale=[1.0, 0.9, 0.6, 0.12])
    car.append(orn)
    for sgn in (-1, 1):
        wing = pk.geo.sweep([(0.0, y_f - 0.13, zo + 0.03), (sgn * 0.06, y_f - 0.2, zo + 0.022)],
                            [(-0.012, -0.003), (0.012, -0.003), (0.012, 0.003), (-0.012, 0.003)],
                            material=chrome, name='OrnamentWing', scale=[1.0, 0.25])
        car.append(wing)

    # ---- parked wipers lying on the glass just above its base
    for (px, ln) in ():
        l0 = 0.022
        p0 = Vector((px, y0 - l0 * math.sin(rake), z0 + l0 * math.cos(rake) + 0.012))
        p1 = Vector((px - ln, y0 - (l0 + 0.03) * math.sin(rake), z0 + (l0 + 0.03) * math.cos(rake) + 0.012))
        arm = pk.geo.tube_along([tuple(p0), tuple(p0.lerp(p1, 0.5) + Vector((0, 0, 0.004))), tuple(p1)], radius=0.0035,
                                segments=6, material=rubber, name='WiperArm')
        blade = pk.geo.sweep([tuple(p0.lerp(p1, 0.12) + Vector((0, -0.006, 0.006))), tuple(p1 + Vector((0, -0.006, 0.008)))],
                             [(-0.006, -0.003), (0.006, -0.003), (0.004, 0.004), (-0.004, 0.004)], material=rubber,
                             name='WiperBlade')
        car += [arm, blade]

    # ---- pillar bases at the frame corners (the windshield frame) with snow packed into them
    if PILLARS:
        for sgn in (-1, 1):
            pts = []
            for k in range(12):
                l = 0.9 * k / 11
                pts.append((sgn * (0.282 + 0.34 * l), y0 + 0.005 - l * math.sin(rake), z0 - 0.01 + l * math.cos(rake)))
            pil = pk.geo.sweep(pts, [(-0.03, -0.03), (0.03, -0.03), (0.034, 0.02), (0.0, 0.04), (-0.034, 0.02)],
                               material=paint, name='Pillar')
            car.append(pil)
            gs = pk.geo.tube_along([(p[0] - sgn * 0.033, p[1] - 0.004, p[2] + 0.004) for p in pts], radius=0.008,
                                   segments=6, material=rubber, name='PillarSeal')
            car.append(gs)
    for o in car:
        V.attach(o, cam)
    pk.exclude_from_lights(*[o for o in car if o.name.startswith(('Pillar', 'Cowl', 'Wiper'))])

    # ---- snow ridge packed along the glass base, deep drifts in both corners
    snowr = snow_mat('SnowCarRidge', color=(0.68, 0.75, 0.92), rough=0.45, sss=0.5, sparkle=1.4, scale=0.25, lumps=0.4)
    rng = np.random.RandomState(3)
    nxr, nyr = 90, 14
    verts, faces = [], []
    xr = np.linspace(-0.62, 0.62, nxr)
    lumps_ = np.zeros(nxr)
    for k in range(5):
        lumps_ += np.sin(xr * rng.uniform(6, 20) + rng.uniform(0, 6.28)) / (k + 1)
    for i, x in enumerate(xr):
        hw = V.half_width(cam, y0)
        edge = abs(x) / hw
        q = min(max((edge - 0.55) / 0.5, 0.0), 1.0)
        q = q * q * (3 - 2 * q)
        H = 0.005 + 0.003 * lumps_[i] * (0.3 + q) + 0.035 * q
        D = 0.05 + 0.08 * q
        for j in range(nyr):
            v = j / (nyr - 1)
            # lean the drift against the glass: the back of it climbs the glass
            yy = y0 + 0.02 - 0.03 * q + D * v - 0.06 * q * (1 - v)
            prof = math.sin(math.pi * min(v * 1.15, 1.0)) ** 0.45
            zz = z0 - 0.01 + H * prof
            verts.append((x, yy, zz))
    for i in range(nxr - 1):
        for j in range(nyr - 1):
            a = i * nyr + j
            faces.append((a, a + 1, a + nyr + 1, a + nyr))
    ridge = pk.mesh_object('WindshieldSnow', verts, faces, material=snowr, recalc=True)
    lumpy(ridge, amp=0.01, freq=28.0, seed=5, up_only=False)
    lumpy(ridge, amp=0.005, freq=70.0, seed=9, up_only=False)
    pk.edge_mask(ridge)
    V.attach(ridge, cam)
    car.append(ridge)

    # ---- frost on the inside of the glass, densest in the lower corners
    fm = frost_mat()
    nfx, nfy = 40, 16
    verts, faces, mask = [], [], []
    Lg = 0.55
    for j in range(nfy):
        v = j / (nfy - 1)
        for i in range(nfx):
            u = i / (nfx - 1)
            x = -1.0 + 2.0 * u
            yy = y0 - 0.012 - Lg * v * math.sin(rake)
            zz = z0 + Lg * v * math.cos(rake)
            hw = V.half_width(cam, yy)
            e = max(0.0, (abs(x) / hw - 0.6) / 0.45)
            mask.append(min(1.0, e ** 1.1 * (1.0 - v) ** 1.3 * 1.8))
            verts.append((x, yy, zz))
    for j in range(nfy - 1):
        for i in range(nfx - 1):
            a = j * nfx + i
            faces.append((a, a + 1, a + nfx + 1, a + nfx))
    frost = pk.mesh_object('Frost', verts, faces, material=fm, smooth=True, attrs={'pk_frost': ('POINT', mask)})
    V.attach(frost, cam)
    frost.visible_shadow = False
    frost['pk_noexport'] = True

    # ---- a few snow crystals stuck to the outside of the glass
    cm = cached('crystal', lambda: pk.mat.basic((0.85, 0.9, 1.0), roughness=0.3, emission=(0.6, 0.72, 1.0), strength=0.35))
    bm = bmesh.new()
    rr = random.Random(41)
    U_ = Vector((1, 0, 0))
    Vg = Vector((0, -math.sin(rake), math.cos(rake)))
    Ng = Vector((0, math.cos(rake), math.sin(rake)))
    placed = 0
    while placed < 16:
        lg = rr.uniform(0.06, 0.5)
        yy = y0 + 0.004 - lg * math.sin(rake)
        hw = V.half_width(cam, yy)
        xf = rr.uniform(-0.95, 0.95)
        if abs(xf) < 0.25 and rr.random() < 0.7:
            continue
        cpos = Vector((xf * hw, yy, z0 + lg * math.cos(rake))) + Ng * 0.003
        L = rr.uniform(0.003, 0.0065)
        a0 = rr.uniform(0, math.pi / 3)
        for k in range(6):
            a = a0 + k * math.pi / 3
            d = U_ * math.cos(a) + Vg * math.sin(a)
            n_ = U_ * -math.sin(a) + Vg * math.cos(a)
            segs = [(Vector((0, 0, 0)), d * L, 0.00045)]
            for f_, bl in ((0.45, 0.4), (0.7, 0.28)):
                b0 = d * (L * f_)
                for sg in (-1, 1):
                    segs.append((b0, b0 + (d * 0.5 + n_ * sg * 0.87) * (L * bl), 0.0003))
            for (pa, pb, wd) in segs:
                ax = (pb - pa)
                side = Ng.cross(ax).normalized() * wd
                vs = [bm.verts.new(cpos + pa - side), bm.verts.new(cpos + pb - side),
                      bm.verts.new(cpos + pb + side), bm.verts.new(cpos + pa + side)]
                bm.faces.new(vs)
        placed += 1
    me = bpy.data.meshes.new('GlassCrystals')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(cm)
    gc = bpy.data.objects.new('GlassCrystals', me)
    pk._link(gc)
    V.attach(gc, cam)
    gc['pk_noexport'] = True

    # headlamps (car frame): warm incandescent beams that light the slush ahead and the flakes
    rig = V.rig(cam)
    for sgn in (-1, 1):
        hl = pk.lights.spot((sgn * 0.78, y_f + 0.15, z_f - 0.18), (sgn * 0.5, 28.0, -1.2), (1.0, 0.82, 0.6), 520.0,
                            angle_deg=38, blend=0.55, radius=0.08, shadow=True, name='Headlamp', volume=0.35)
        hl.parent = rig
        hl.matrix_parent_inverse = Matrix.Identity(4)
        hl.location = (sgn * 0.78, y_f + 0.15, z_f - 0.18)
        hl.rotation_euler = (Vector((sgn * 0.5, 28.0, -1.2)) - Vector((sgn * 0.78, y_f + 0.15, z_f - 0.18))).to_track_quat('-Z', 'Y').to_euler()
        hl['pk_vehicle'] = True
        pk.mark_moving(hl)
    # cool fill on the snow and a soft key on the hood so its lacquer reads (car frame, linked)
    fills = [V.cabin_light(cam, location=(0.0, y0 + 0.9, z_top + 0.55), target=(0.0, y0 + 0.1, z_top),
                           size=(1.6, 0.6), color=(0.55, 0.68, 1.0), energy=30.0, receivers=[ridge, frost],
                           name='SnowFill')]
    hood_parts = [o for o in car if o.name.startswith(('Hood', 'Fender', 'Ornament'))]
    fills.append(V.cabin_light(cam, location=(0.0, 1.6, 0.25), target=(0.0, 2.2, z_f), size=(1.8, 0.8),
                               color=(0.8, 0.82, 1.0), energy=16.0, receivers=hood_parts, name='HoodFill'))
    # a long thin source up ahead whose mirror image runs along the hood crown as a highlight line
    fills.append(V.cabin_light(cam, location=(0.0, 6.5, 1.9), target=(0.0, 2.0, zh(0.0, 2.0)), size=(4.0, 0.12),
                               color=(0.85, 0.9, 1.0), energy=140.0, receivers=hood_parts, name='HoodSheen'))
    # web (export-only properties): HoodFill and the dash's CabinFill export as spot stand-ins
    # (kit _web_area_standins), their light linking turned into an automatic range around their
    # receivers. SnowFill and HoodSheen stay out: as unlinked 180 degree spots SnowFill floods
    # the dash top and HoodSheen, 6.5 m ahead, floods the visible road (measured +50% bottom third)
    for lo in (fills[1], parts.get('cabin_light')):
        if lo is not None and 'pk_noexport' in lo:
            del lo['pk_noexport']
    # the dash fill also reaches the hood's snow ridge in the web (no light linking): at 30 percent
    # of the 4x stand-in power the ridge and the dash both land near the film's levels
    if parts.get('cabin_light') is not None:
        parts['cabin_light']['pk_web_energy'] = 12.0
    return parts


# ----------------------------------------------------------------------------------------
# build
# ----------------------------------------------------------------------------------------
def soft_flake_mat():
    """Near snowflakes as soft round discs (dithered alpha from the facing ratio of smoothed
    octahedra), so the flakes nearest the lens read as out-of-focus bokeh, lit by the street."""
    if 'SoftFlake' in M:
        return M['SoftFlake']
    m, nt, out = nt_out('SoftFlake')
    lw = pk.node(nt, 'ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    face = pk.math_(nt, 'SUBTRACT', 1.0, lw.outputs['Facing'])
    a = pk.math_(nt, 'MULTIPLY', pk.math_(nt, 'POWER', pk.math_(nt, 'MAXIMUM', face, 0.0), 1.5), 0.95)
    p = pk._principled(nt, base=(0.92, 0.95, 1.0), rough=0.6, sss=0.3, sss_radius=(0.5, 0.6, 0.8), sss_scale=0.01,
                       emit=(0.95, 0.96, 1.0), emit_strength=2.6)
    tr = pk.node(nt, 'ShaderNodeBsdfTransparent')
    mx = pk.node(nt, 'ShaderNodeMixShader')
    nt.links.new(a, mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(p.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.9, 0.93, 1.0), rough=0.6, emit=(0.95, 0.96, 1.0), emit_strength=2.6, alpha=0.6)
    M['SoftFlake'] = m
    return m


def parked_car(name, loc, yaw, coll, body_c=(0.08, 0.2, 0.3), rng=None):
    """A rounded vintage car parked at the kerb under a blanket of fresh snow."""
    rng = rng or random.Random(1)
    parts = []
    body = cached(('carbody', body_c), lambda: pk.mat.toy_plastic(body_c, roughness=0.25, coat=0.8, sss=0.0))
    dark = cached('coal', lambda: pk.mat.basic((0.01, 0.01, 0.012), roughness=0.4))
    chrome = cached('chrome', lambda: pk.mat.metal((0.92, 0.92, 0.95), roughness=0.06, scratches=0.05, dirt=0.05))
    glass = cached('carglass', lambda: pk.mat.basic((0.02, 0.025, 0.035), roughness=0.05, coat=1.0))
    snow = snow_mat('SnowRoof', color=(0.7, 0.77, 0.94))
    parts.append(rbox((1.75, 4.3, 0.62), (0, 0, 0.28), body, radius=0.24, seg=4))
    parts.append(rbox((1.5, 2.1, 0.55), (0, -0.25, 0.86), glass, radius=0.22, seg=4))
    parts.append(rbox((1.52, 1.9, 0.12), (0, -0.25, 1.33), body, radius=0.06, seg=2))
    for sx in (-1, 1):
        parts.append(rbox((0.42, 1.0, 0.5), (sx * 0.72, 1.35, 0.2), body, radius=0.2, seg=3))
        parts.append(rbox((0.42, 1.0, 0.5), (sx * 0.72, -1.35, 0.2), body, radius=0.2, seg=3))
        for wy in (1.35, -1.35):
            parts.append(torus(name + '_tyre', 0.26, 0.1, (sx * 0.8, wy, 0.33), (0, math.pi / 2, 0), dark, maj=20, mnr=8))
    parts.append(rbox((1.8, 0.12, 0.12), (0, 2.18, 0.42), chrome, radius=0.05))
    parts.append(rbox((1.8, 0.12, 0.12), (0, -2.18, 0.42), chrome, radius=0.05))
    # snow: thick on the roof, the hood and the trunk, a drift against the kerb side
    roof = rbox((1.62, 2.0, 0.22), (0, -0.25, 1.4), snow, radius=0.1, seg=3)
    lumpy(roof, amp=0.04, freq=4.0, seed=rng.randint(0, 99))
    parts.append(roof)
    for (cy, ln) in ((1.45, 1.35), (-1.75, 0.9)):
        sb = rbox((1.66, ln, 0.12), (0, cy, 0.86), snow, radius=0.06, seg=3)
        lumpy(sb, amp=0.025, freq=6.0, seed=rng.randint(0, 99))
        parts.append(sb)
    ob = join(parts, name)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    place(ob, loc, yaw)
    return ob


def figure(name, loc, yaw, coll, coat=(0.5, 0.06, 0.06), hat=(0.9, 0.88, 0.82), scarf=(0.1, 0.35, 0.2),
           height=1.0, rng=None, bag=False):
    """A small toy-like villager in a long winter coat, bobble hat and scarf (same chunky style
    as the snowmen), standing or strolling."""
    rng = rng or random.Random(1)
    parts = []
    k = 1.7 * height
    cm = cached(('coat', coat), lambda: pk.mat.clay(coat, roughness=0.75, bumps=0.4, grime=0.1))
    hm = cached(('knit', hat), lambda: pk.mat.clay(hat, roughness=0.9, bumps=1.0, grime=0.0))
    sm = cached(('knit', scarf), lambda: pk.mat.clay(scarf, roughness=0.9, bumps=1.0, grime=0.0))
    skin = cached('skin', lambda: pk.mat.toy_plastic((0.85, 0.6, 0.48), roughness=0.5, sss=0.3))
    boot = cached('coal', lambda: pk.mat.basic((0.01, 0.01, 0.012), roughness=0.4))
    for sx in (-1, 1):
        parts.append(rbox((0.11 * k, 0.16 * k, 0.12 * k), (sx * 0.06 * k, 0.02 * k, 0.0), boot, radius=0.04 * k))
    parts.append(pk.geo.lathe([(0.0, 0.08 * k), (0.17 * k, 0.08 * k), (0.15 * k, 0.4 * k), (0.12 * k, 0.66 * k),
                               (0.08 * k, 0.74 * k), (0.0, 0.76 * k)], segments=20, material=cm))
    for sx in (-1, 1):
        arm = pk.geo.tube_along([(sx * 0.11 * k, 0.0, 0.68 * k), (sx * 0.16 * k, -0.02 * k, 0.5 * k),
                                 (sx * 0.15 * k, -0.06 * k, 0.38 * k)], radius=0.035 * k, segments=8, material=cm)
        parts.append(arm)
    parts.append(torus(name + '_sc', 0.075 * k, 0.03 * k, (0, 0, 0.76 * k), (0, 0, 0), sm, maj=16, mnr=6))
    parts.append(sphere(name + '_h', 0.1 * k, (0, 0, 0.88 * k), skin, sub=3))
    parts.append(pk.geo.lathe([(0.0, 0.9 * k), (0.105 * k, 0.9 * k), (0.1 * k, 0.97 * k), (0.06 * k, 1.03 * k),
                               (0.0, 1.05 * k)], segments=16, material=hm))
    parts.append(sphere(name + '_pom', 0.035 * k, (0, 0, 1.07 * k), hm, sub=2))
    if bag:
        parts.append(rbox((0.1 * k, 0.07 * k, 0.12 * k), (0.17 * k, -0.07 * k, 0.32 * k),
                          cached('paperbag', lambda: pk.mat.clay((0.62, 0.45, 0.28), roughness=0.8)), radius=0.01 * k))
    snow = snow_mat('SnowRoof', color=(0.7, 0.77, 0.94))
    parts.append(sphere(name + '_hs', 0.07 * k, (0, 0, 1.0 * k), snow, sub=2, scale=(1.3, 1.3, 0.35)))
    ob = join(parts, name)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    place(ob, loc, yaw)
    return ob


def gentle_float(cam, z_amp=0.004, pitch_amp=0.05, roll_amp=0.04, seed=11):
    """Suspension float in place of the kit's road vibration: a vertical bob (m), pitch and
    roll (degrees) built only from slow sines (0.4 to 1.4 Hz), added to the camera's
    per-frame keys. The fastest pitch change is about 0.01 degrees (0.3 px) per frame, so the
    world never buzzes against the hood and the angular speed seen by motion blur (and so the
    bloom of the small hot bulbs) changes smoothly."""
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


def _gauss_smooth(x, sigma):
    """Gaussian filter of a uniformly keyed channel; the ends are padded by odd reflection
    (2 x0 - x[k]) so a linear trend passes through unchanged."""
    x = np.asarray(x, np.float64)
    n = min(int(4 * sigma) + 1, len(x) - 2)
    k = np.exp(-0.5 * (np.arange(-n, n + 1) / sigma) ** 2)
    k /= k.sum()
    pad = np.concatenate([2 * x[0] - x[n:0:-1], x, 2 * x[-1] - x[-2:-n - 2:-1]])
    return np.convolve(pad, k, mode='valid')


def smooth_turns(cam, sigma_yaw=8.0, sigma_roll=12.0):
    """Round 5: Gaussian-smooth the camera's yaw and roll keys in time (sigma in frames).
    camera.drive takes the roll from the path curvature (a 2 m finite difference) and the yaw
    from a 12 m look-ahead chord. The centripetal Catmull-Rom path is only C1, so its
    curvature steps at every control point: the roll swung 0.6 to 0.8 degrees in about 9
    frames each time the curvature probe crossed the knots at s = 14, 42 and 56 (mp4 36 to 46,
    145 to 154 and 200 to 210: a 2 px per frame sideways surge at the top of the frame while
    the centre kept panning), and the yaw acceleration stepped on and off (mp4 56 to 61, 164
    to 171, 200 to 202, 219 to 227), so the pan started and stopped abruptly. Keys are one per
    frame, so filtering the key values is a filter in time. Position is untouched; the framing
    moves by at most 3 px. Call before gentle_float (its slow roll would be filtered too)."""
    for idx, sig in ((2, sigma_yaw), (1, sigma_roll)):
        for fc in pk.fcurves(cam, 'rotation_euler', idx):
            kps = sorted(fc.keyframe_points, key=lambda k: k.co[0])
            xs = _gauss_smooth([k.co[1] for k in kps], sig)
            for kp, v in zip(kps, xs):
                d = float(v) - kp.co[1]
                kp.co[1] += d
                kp.handle_left[1] += d
                kp.handle_right[1] += d
            fc.update()


# Round 5, bloom at the frame edges (the mechanism film 05 fixed in its round 4). The kit bloom
# is screen space, so a light's halo vanished on the frame its light crossed the frame edge: each
# light arch, both street strands and the snowflake took their broad warm glow off the top-left
# sky in one frame (mp4 12/13, 34/35, 58/59, 81/82, 104/105, 127/128, 160/161), and the tower's
# lit door took the glow off the tower wall when it left the right edge (212/213). The frame now
# renders with a hidden guard band, OVERSCAN_X px on each side and OVERSCAN_TOP px above (the
# camera fits its sensor vertically: its sensor height grows with the render height and a lens
# shift keeps the visible 1080 x 1920 exactly where it was, at the same pixel scale), and is
# cropped back after compositing. Inside the band the bloom input fades to zero toward its outer
# edge, so a light keeps its full halo while it is in frame and the halo dies out over the few
# frames it takes the light to cross the band. (An in-frame fade over the top 12 to 20 percent
# was tried first: it also smoothed the pops, but took 6 to 17 levels of glow off the top rows
# in every frame.)
OVERSCAN_X = 108        # full-res px; 54 at --scale 0.5, 27 at 0.25
OVERSCAN_TOP = 192      # full-res px; 96 at --scale 0.5, 48 at 0.25


def _render_wh():
    return pk.RES_X + 2 * OVERSCAN_X, pk.RES_Y + OVERSCAN_TOP


def comp_bloom_edge_fade():
    """Scale the bloom and fog-glow input of non-sky pixels by an edge mask: one across the
    visible frame, falling to zero across the hidden guard band (sides and top). The sky (moon,
    aurora) keeps its bloom; lights keep their brightness. The star glow and sparkle take their
    own sky-only input and are untouched."""
    ng = bpy.context.scene.compositing_node_group
    glares = [n for n in ng.nodes if n.bl_idname == 'CompositorNodeGlare' and n.inputs['Image'].is_linked]
    if not glares or (OVERSCAN_X <= 0 and OVERSCAN_TOP <= 0):
        return
    src = glares[0].inputs['Image'].links[0].from_socket
    rl = [n for n in ng.nodes if n.bl_idname == 'CompositorNodeRLayers'][0]
    ic = pk.node(ng, 'CompositorNodeImageCoordinates')
    ng.links.new(rl.outputs['Image'], ic.inputs['Image'])
    xyz = pk.sep_xyz(ng, ic.outputs['Normalized'])          # 0..1 over the rendered frame, origin bottom left
    x, y = xyz[0], xyz[1]
    W, H = _render_wh()
    edge = 1.0
    if OVERSCAN_TOP > 0:
        edge = pk.maprange(ng, y, pk.RES_Y / float(H), 1.0, 1.0, 0.0, interp='SMOOTHSTEP')
    if OVERSCAN_X > 0:
        m = OVERSCAN_X / float(W)                             # hidden margin, fraction of the rendered width
        mx = pk.math_(ng, 'MULTIPLY', pk.maprange(ng, x, 0.0, m, 0.0, 1.0, interp='SMOOTHSTEP'),
                      pk.maprange(ng, x, 1.0 - m, 1.0, 1.0, 0.0, interp='SMOOTHSTEP'))
        edge = mx if OVERSCAN_TOP <= 0 else pk.math_(ng, 'MULTIPLY', mx, edge)
    skym = pk.maprange(ng, rl.outputs['Depth'], 800.0, 1500.0, 0.0, 1.0)
    k = pk.mix_f(ng, skym, edge, 1.0)
    faded = pk.vmath(ng, 'SCALE', src, scale=k)
    n = 0
    for g in glares:
        if g.inputs['Image'].links[0].from_socket == src:
            ng.links.new(faded, g.inputs['Image'])
            n += 1
    pk.log('bloom edge fade on %d glare nodes (guard band %d px each side, %d px on top)'
           % (n, OVERSCAN_X, OVERSCAN_TOP))


def overscan(ctx):
    """Render the guard band (OVERSCAN_X px more on each side, OVERSCAN_TOP px more above) and
    crop it off after each written frame or still (render_write handler, pixel exact with
    OpenImageIO), so the compositor sees lights just outside the frame. The camera fits its
    sensor vertically: the sensor height grows with the render height (same pixel scale) and a
    vertical lens shift of half the top band keeps the visible frame where it was. The kit
    vignette, which works in normalized coordinates, is re-centred and rescaled to the visible
    frame. Call last in build()."""
    sc = ctx.scene
    cd = ctx.camera.data
    if cd.sensor_fit != 'VERTICAL' or (OVERSCAN_X <= 0 and OVERSCAN_TOP <= 0):
        return
    W, H = _render_wh()
    base = (sc.render.resolution_x, sc.render.resolution_y, cd.sensor_height, cd.shift_y)
    sc.render.resolution_x, sc.render.resolution_y = W, H
    cd.sensor_height = base[2] * H / float(pk.RES_Y)
    cd.shift_y = base[3] * pk.RES_Y / float(H) + 0.5 * OVERSCAN_TOP / float(H)
    ctx.camera['sn03_overscan_base'] = list(base)
    ng = sc.compositing_node_group
    ky = pk.RES_Y / pk.RES_X * 0.75                          # the kit vignette's aspect factor
    nv = 0
    for n in ng.nodes:
        if n.bl_idname == 'ShaderNodeVectorMath' and n.operation == 'MULTIPLY' and not n.inputs[1].is_linked:
            v = n.inputs[1].default_value
            if abs(v[0] - 1.0) < 1e-6 and abs(v[1] - ky) < 1e-4:
                n.inputs[1].default_value = (W / float(pk.RES_X), ky * H / float(pk.RES_Y), 0.0)
                sub = n.inputs[0].links[0].from_node if n.inputs[0].is_linked else None
                if sub is not None and sub.bl_idname == 'ShaderNodeVectorMath' and sub.operation == 'SUBTRACT':
                    sub.inputs[1].default_value = (0.5, 0.5 * pk.RES_Y / float(H), 0.0)
                    nv += 1
    if nv != 1:
        raise RuntimeError('overscan: expected one kit vignette to re-centre, found %d' % nv)
    pk.log('overscan: render %d x %d (sensor %.3f mm, shift_y %.5f), crop to %d x %d after compositing'
           % (W, H, cd.sensor_height, cd.shift_y, pk.RES_X, pk.RES_Y))

    def crop_written(scene, *_):
        pct = scene.render.resolution_percentage
        tw = int(round(pk.RES_X * pct / 100.0))
        th = int(round(pk.RES_Y * pct / 100.0))
        top = int(round(OVERSCAN_TOP * pct / 100.0))
        for p in (scene.render.frame_path(frame=scene.frame_current), bpy.path.abspath(scene.render.filepath)):
            if not (p.lower().endswith('.png') and os.path.isfile(p)):
                continue
            import OpenImageIO as oiio
            buf = oiio.ImageBuf(p)
            w, h = buf.spec().width, buf.spec().height
            if w > tw or h > th:
                x0 = (w - tw) // 2
                y0 = h - th                                   # the band is on top (OIIO rows run downward)
                if y0 != top:
                    raise RuntimeError('overscan crop: %s is %d x %d, expected a %d px top band' % (p, w, h, top))
                cut = oiio.ImageBufAlgo.cut(buf, oiio.ROI(x0, x0 + tw, y0, y0 + th))
                tmp = p[:-4] + '.crop.png'
                if not cut.write(tmp):
                    raise RuntimeError('overscan crop failed for %s: %s' % (p, cut.geterror()))
                os.replace(tmp, p)
            return
    bpy.app.handlers.render_write.append(crop_written)


# --export-web: the glTF camera takes its aspect and field of view from the render size and the
# camera data, so export with the plain 1080 x 1920 frame
_kit_export_web = pk.export_web


# ---- web-only surface detail. Everything below runs in the --export-web hook, after any
# render, and only edits what the glTF export sees: generated images, UVs of meshes whose film
# shaders never read them again, rebuilt pk_web materials, web-only meshes (pk_webonly) and
# web-only mesh trims. The film shaders (procedural noise, bricks, window panes) flatten to
# one Principled value per material in glTF, so the web edition got flat snow, black slot
# ruts, flat cream windows and a flat tan tower; these bake a tileable stand-in of each.
WEB_ROAD_PERIOD = 18.0      # m along the road per texture tile (two 3 m + 6 m dash periods)
WEB_RUT_HW = 0.16           # half-width of the web-only wet-track mirror strips (m)
WEB_WET = 0.10              # wet film half-width in the strips (+- 0.03 wobble), slush beyond
# all strips at one height just above the 3 cm road crown: mirror.js fits one plane to them and
# clips everything below it in the reflection pass; with the strips following the crown the
# plane sat at 2.35 cm, the crowned centre of the road stood above it, and its back face hid
# the whole town from our lane's left rut (black even at mirror strength 6)
WEB_RUT_Z = 0.034
WEB_HEADLAMP_BLEND = 0.8    # web spot penumbra of the headlamps (film 0.55)
WEB_RUT_PERIOD = 6.0        # m along per strip texture tile
WEB_WIN_K = 0.8             # web window glow relative to the film's panel mean (critics: cream)
# lit_window parameters of the film's window materials (build: M['win_*'])
WEB_WIN = {'WinWarm': ((2, 2), 0.07, 0.4, 0.45), 'WinGold': ((2, 2), 0.07, 0.3, 0.45),
           'WinAmber': ((2, 2), 0.07, 0.35, 0.45), 'WinCool': ((2, 2), 0.07, 0.3, 0.45),
           'WinShop': ((3, 3), 0.07, 0.0, 0.1), 'WinBake': ((2, 2), 0.07, 0.25, 0.15),
           'WinBell': ((1, 1), 0.02, 0.0, 0.1), 'WinFar': ((2, 2), 0.07, 0.2, 0.5),
           'WinFar2': ((2, 2), 0.07, 0.2, 0.5), 'WinFarCool': ((2, 2), 0.07, 0.2, 0.5)}


def _mr(x, a, b, c, d, smooth=False):
    """numpy Map Range (clamped), optionally smoothstep."""
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    if smooth:
        t = t * t * (3.0 - 2.0 * t)
    return c + (d - c) * t


def _wn(shape, size, feat, rng, octaves=1, rough=0.5):
    """Tileable smooth noise on a (rows, cols) grid covering size = (rows, cols) metres:
    Gaussian-filtered white noise with blobs about feat = (across, along) metres (a scalar for
    both), octaves - 1 finer octaves at rough^k, scaled like Blender's Noise Texture
    (mean 0.5, std 0.1)."""
    h, w = shape
    if np.isscalar(feat):
        feat = (feat, feat)
    fy = np.fft.fftfreq(h, d=size[0] / h)[:, None]
    fx = np.fft.rfftfreq(w, d=size[1] / w)[None, :]
    acc = np.zeros(shape)
    amp = 1.0
    for k in range(octaves):
        sx, sy = feat[0] / 2 ** k / 3.5, feat[1] / 2 ** k / 3.5
        g = np.exp(-2.0 * np.pi ** 2 * ((fx * sx) ** 2 + (fy * sy) ** 2))
        n = np.fft.irfft2(np.fft.rfft2(rng.standard_normal(shape)) * g, s=shape)
        acc += amp * n / (n.std() + 1e-12)
        amp *= rough
    return 0.5 + 0.1 * acc / (acc.std() + 1e-12)


def _srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1.0 / 2.4) - 0.055)


def _normal_map(hgt, px):
    """Tangent-space normal map (RGB 0..1) of a height field in metres; px = (row, col) pixel
    size in metres. Rows run along +V, columns along +U."""
    gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) / (2 * px[0])
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) / (2 * px[1])
    n = np.stack([-gx, -gy, np.ones_like(hgt)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def _web_img(name, rgb, srgb=True):
    """A packed 8-bit image from a (rows, cols, 3) array; linear values are sRGB-encoded."""
    h, w = rgb.shape[:2]
    old = bpy.data.images.get(name)
    if old is not None:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    a = np.ones((h, w, 4), np.float32)
    a[..., :3] = _srgb(rgb) if srgb else np.clip(rgb, 0.0, 1.0)
    img.pixels.foreach_set(a.ravel())
    img.update()
    img.pack()
    return img


def _web_tex_mat(m, col=None, base=(0.5, 0.5, 0.5), rough_img=None, rough=0.5, nrm=None, nrm_s=1.0,
                 emit_img=None, emit=(0, 0, 0), emit_s=0.0, uv='UVMap', rough_closest=False):
    """Rebuild a material for the glTF export as a Principled BSDF fed by image textures
    (base colour, roughness in G, tangent normal map, emission) on UV map `uv`.
    rough_closest: nearest-texel magnification of the roughness map (glTF NEAREST), so a
    roughness step has no in-between texels."""
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = uv

    def tex(img):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img
        t.interpolation = 'Linear'
        nt.links.new(uvn.outputs[0], t.inputs['Vector'])
        return t
    if col is not None:
        nt.links.new(tex(col).outputs['Color'], p.inputs['Base Color'])
    else:
        p.inputs['Base Color'].default_value = list(base)[:3] + [1.0]
    p.inputs['Metallic'].default_value = 0.0
    if rough_img is not None:
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        rt = tex(rough_img)
        if rough_closest:
            rt.interpolation = 'Closest'
        nt.links.new(rt.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], p.inputs['Roughness'])
    else:
        p.inputs['Roughness'].default_value = rough
    if nrm is not None:
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.uv_map = uv
        nm.inputs['Strength'].default_value = nrm_s
        nt.links.new(tex(nrm).outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    if emit_img is not None:
        nt.links.new(tex(emit_img).outputs['Color'], p.inputs['Emission Color'])
        p.inputs['Emission Strength'].default_value = emit_s
    elif emit_s > 0:
        p.inputs['Emission Color'].default_value = list(emit)[:3] + [1.0]
        p.inputs['Emission Strength'].default_value = emit_s
    nt.links.new(p.outputs[0], out.inputs['Surface'])


def _web_tracks():
    """Lateral centres of the four wet tyre tracks (the Slush shader's offsets): our lane under
    our own wheels, LANE +- 0.76, and the left lane, -RW/4 +- 0.78 (0.95 as dark)."""
    return [(LANE - 0.76, 1.0), (LANE + 0.76, 1.0), (-RW / 4 - 0.78, 0.95), (-RW / 4 + 0.78, 0.95)]


def web_road_textures(n_across=2048, n_along=2048, seed=303):
    """Bake the Slush shader's look into a tileable road texture set (7.4 m across x 18 m
    along): the blue-white dusting with its two noise scales, pressed hump and greyer packed
    patches, sparse grit specks, sparkle glints (one-texel glossy, tilted normals), grey slush
    shoulders and the dark wet tracks with soft wobbling edges and slush clumps. The wet core
    under the web-only mirror strips is left plain so the strips sit on it without a seam."""
    rng = np.random.default_rng(seed)
    h, w = n_along, n_across
    shape, size = (h, w), (WEB_ROAD_PERIOD, RW)
    px = (WEB_ROAD_PERIOD / h, RW / w)
    U = (np.arange(w) + 0.5) / w * RW - RW / 2
    UU = np.broadcast_to(U[None, :], shape)
    ed = _wn(shape, size, (0.11, 0.5), rng, 2)
    wob = _mr(ed, 0.3, 0.7, -0.025, 0.025)
    t_r = np.zeros(shape)
    d_all = np.full(shape, 9.0)
    d_raw = np.full(shape, 9.0)
    for c, k in _web_tracks():
        d0 = np.abs(UU - c)
        d = d0 + wob
        t_r = np.maximum(t_r, _mr(d, 0.085, 0.14, 1.0, 0.0, True) * k)
        d_all = np.minimum(d_all, d)
        d_raw = np.minimum(d_raw, d0)
    tracks, dmin = t_r, d_all
    shoulder = _mr(dmin, 0.12, 0.3, 1.0, 0.0, True)
    cl = _wn(shape, size, (0.42, 2.0), rng, 3, 0.6)
    under_strip = _mr(d_raw, WEB_RUT_HW - 0.02, WEB_RUT_HW + 0.02, 0.0, 1.0, True)
    clump = _mr(cl, 0.66, 0.74, 0.0, 1.0) * under_strip
    wet = tracks * (1.0 - clump * 0.85)
    pf = _wn(shape, size, (1.1, 4.5), rng, 3, 0.55)
    puddle = _mr(pf, 0.55, 0.6, 0.0, 1.0, True) * wet
    f1 = _wn(shape, size, 0.77, rng, 4, 0.6)
    f2 = _wn(shape, size, 0.11, rng, 3, 0.6)
    grain = _wn(shape, size, 0.02, rng, 1)
    hump = _mr(dmin, 0.28, 0.6, 1.0, 0.0)
    snowc = np.array([0.6, 0.7, 0.88]) * _mr(f1, 0.3, 0.7, 0.86, 1.04)[..., None]
    snowc = snowc + (np.array([0.44, 0.52, 0.68]) - snowc) * (0.3 * hump)[..., None]
    slushc = np.array([0.2, 0.23, 0.31]) * _mr(f2, 0.3, 0.7, 0.75, 1.25)[..., None]
    col = snowc + (slushc - snowc) * shoulder[..., None]
    tp = _wn(shape, size, 0.53, rng, 3, 0.55)
    patch = _mr(tp, 0.54, 0.68, 0.0, 1.0, True) * (1.0 - shoulder)
    col = col + (col * np.array([0.6, 0.63, 0.7]) - col) * (0.6 * patch)[..., None]
    # grit specks: Voronoi-like cells about 0.11 m, kept above a density threshold
    gd = _wn(shape, size, 2.2, rng, 2)
    cell = 1.0 / 9.0
    nu, nv = int(round(RW / cell)), int(round(WEB_ROAD_PERIOD / cell))
    speck = np.zeros(shape)
    for i in range(nv):
        for j in range(nu):
            cu, cv = (j + rng.random()) * cell - RW / 2, (i + rng.random()) * cell
            ci, cj = int(cv / px[0]) % h, min(int((cu + RW / 2) / px[1]), w - 1)
            thr = _mr(gd[ci, cj], 0.35, 0.65, 0.88, 0.62) - 0.18 * shoulder[ci, cj]
            if rng.random() <= 1.0 - 0.5 * (1.0 - thr):      # web: half as many (polka dots)
                continue
            rad = _mr(rng.random(), 0.0, 1.0, 0.14, 0.3) * cell
            ri, rj = int(rad / px[0]) + 2, int(rad / px[1]) + 2
            ii = np.arange(ci - ri, ci + ri + 1)
            jj = np.arange(cj - rj, cj + rj + 1)
            jj = jj[(jj >= 0) & (jj < w)]
            dv = (ii[:, None] - ci) * px[0]
            du = (jj[None, :] - cj) * px[1]
            dd = np.sqrt(dv ** 2 + du ** 2) / rad
            blk = _mr(dd, 0.5, 1.0, 1.0, 0.0) * _mr(rng.random(), 0.0, 1.0, 0.4, 1.0)
            ii %= h
            speck[np.ix_(ii, jj)] = np.maximum(speck[np.ix_(ii, jj)], blk)
    speck *= 0.7
    col = col * _mr(grain, 0.3, 0.7, 0.9, 1.08)[..., None]
    col = col + (np.array([0.1, 0.095, 0.1]) - col) * speck[..., None]
    col = col + (np.array([0.3, 0.34, 0.45]) - col) * (clump * tracks)[..., None]
    col = col + (np.array([0.011, 0.012, 0.016]) - col) * wet[..., None]
    # roughness: 0.02 pools, 0.05-0.09 wet tracks, 0.22-0.32 slush, 0.45-0.6 snow, 0.08 glints
    glint = (rng.random(shape) < 0.012) * (1.0 - shoulder) * (1.0 - wet)
    r_snow = _mr(f2, 0.3, 0.7, 0.45, 0.6)
    r_snow = r_snow + (0.08 - r_snow) * glint
    r_out = r_snow + (_mr(f2, 0.3, 0.7, 0.22, 0.32) - r_snow) * shoulder
    rough = r_out + (_mr(f1, 0.3, 0.7, 0.05, 0.09) - r_out) * wet
    rough = rough + (0.02 - rough) * puddle
    # relief: soft snow lumps (packed patches lower), tyre tread on the shoulders
    dry = 1.0 - wet
    lump = (0.7 * f2 + 0.3 * f1) * dry - 0.5 * patch
    tread = _wn(shape, size, (0.33, 0.038), rng, 2)
    hgt = 0.03 * lump + 0.006 * grain * dry + 0.006 * tread * shoulder * dry
    nrm = _normal_map(hgt, px)
    # glints: tilted at random, like the shader's Voronoi tilt
    tilt = (rng.random(shape + (2,)) - 0.5) * 1.4 * glint[..., None]
    n3 = np.concatenate([nrm[..., :2] * 2 - 1 + tilt, (nrm[..., 2:] * 2 - 1)], -1)
    n3 /= np.linalg.norm(n3, axis=-1, keepdims=True)
    nrm = n3 * 0.5 + 0.5
    rr = np.stack([np.ones(shape), rough, np.zeros(shape)], -1)
    pk.log('web: road texture mean colour %s, roughness %.2f' % (np.round(col.reshape(-1, 3).mean(0), 3), rough.mean()))
    return (_web_img('sn03_road_col', col), _web_img('sn03_road_rough', rr, False),
            _web_img('sn03_road_nrm', nrm, False))


def web_rut_textures(n_across=128, n_along=512, seed=404):
    """Texture of the web-only wet-track strips (u across the 0.32 m strip, v along 6 m): a dark
    water film about 0.2 m wide with wobbling edges, slush clumps and small pools, and grey
    slush beyond it out to the strip edge, where it meets the road texture's shoulders. The
    roughness steps from the film (0.16, pools 0.1) straight to 0.95 on the slush: the planar
    mirror then ends at the water's edge; a ramp left a band of heavily blurred, streaked
    reflection that drew a bright line along each edge, like rails."""
    rng = np.random.default_rng(seed)
    h, w = n_along, n_across
    shape, size = (h, w), (WEB_RUT_PERIOD, 2 * WEB_RUT_HW)
    px = (WEB_RUT_PERIOD / h, 2 * WEB_RUT_HW / w)
    d = np.abs((np.arange(w) + 0.5) / w - 0.5)[None, :] * 2 * WEB_RUT_HW + np.zeros(shape)
    ed = _wn(shape, size, (0.06, 0.45), rng, 2)
    dw = d + _mr(ed, 0.3, 0.7, -0.03, 0.03)
    film = _mr(dw, WEB_WET - 0.012, WEB_WET + 0.012, 1.0, 0.0, True)
    f = _wn(shape, size, (0.05, 0.6), rng, 3, 0.6)
    f2 = _wn(shape, size, 0.11, rng, 3, 0.6)
    cl = _wn(shape, size, (0.12, 1.2), rng, 3, 0.6)
    clump = _mr(cl, 0.66, 0.73, 0.0, 1.0) * film
    pf = _wn(shape, size, (0.25, 2.0), rng, 2)
    puddle = _mr(pf, 0.55, 0.62, 0.0, 1.0, True) * film * (1.0 - clump)
    shoulder = _mr(d, 0.12, 0.3, 1.0, 0.0, True)
    snowc = np.array([0.6, 0.7, 0.88]) * 0.95
    slushc = np.array([0.2, 0.23, 0.31]) * _mr(f2, 0.3, 0.7, 0.75, 1.25)[..., None]
    col = snowc + (slushc - snowc) * shoulder[..., None]
    col = col + (np.array([0.3, 0.34, 0.45]) - col) * clump[..., None]
    wetc = np.array([0.011, 0.012, 0.016]) * _mr(f, 0.3, 0.7, 0.8, 1.25)[..., None]
    col = col + (wetc - col) * (film * (1.0 - clump * 0.85))[..., None]
    # a little rougher than the film's 0.05-0.09: EEVEE's ray-traced reflections of the film
    # read as soft warm blobs, a planar mirror at 0.07 as crisp copies of every bulb. One value
    # across the film (the map is sampled nearest, so texel-to-texel noise turned the
    # reflection into a patchwork of differently blurred squares); pools a little sharper
    rough = np.full(shape, 0.16)
    rough = np.where(puddle > 0.5, 0.1, rough)
    wetm = (film * (1.0 - clump)) > 0.5
    rough = np.where(wetm, rough, 0.95)
    hgt = 0.002 * _wn(shape, size, (0.04, 0.25), rng, 2) + 0.006 * clump + 0.002 * f2
    nrm = _normal_map(hgt, px)
    rr = np.stack([np.ones(shape), rough, np.zeros(shape)], -1)
    return (_web_img('sn03_rut_col', col), _web_img('sn03_rut_rough', rr, False),
            _web_img('sn03_rut_nrm', nrm, False))


def web_ruts(c):
    """Web-only wet tyre tracks: the Slush shader's dark wet tracks (rough 0.05-0.09, mirroring
    the lights) flatten away in the glTF. The road texture (web_road_textures) paints the
    tracks with their soft edges, clumps and grey shoulders; these 0.32 m strips, all at
    WEB_RUT_Z just above the crowned road, carry the wet film with its own texture and the
    planar mirror (extras mirror_strength / mirror_streak), so the reflections stay inside the
    water film and the ruts stay dark lines far down the road, where the road texture's mips
    blur. Made only in the --export-web hook (after any render), hidden from the render
    (pk_webonly)."""
    path = c.path
    if path is None or 'WebRuts' in bpy.data.objects:
        return
    m, nt, out = nt_out('WetRut')
    p = pk._principled(nt, base=(0.011, 0.012, 0.016), rough=0.09)
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    pk._web(m, base=(0.011, 0.012, 0.016), rough=0.09)
    ss = np.arange(-5.0, path.length, 0.5)
    verts, faces, uvs = [], [], []
    for t, _k in _web_tracks():
        a, b = t - WEB_RUT_HW, t + WEB_RUT_HW
        k0 = len(verts)
        for s in ss:
            for lat in (a, b):
                verts.append(tuple(path.offset(float(s), lat, WEB_RUT_Z)))
        for i in range(len(ss) - 1):
            q = k0 + 2 * i
            # winding: across to the right, then forward, so every face points up
            faces.append((q, q + 1, q + 3, q + 2))
            v0, v1 = (ss[i] + 5.0) / WEB_RUT_PERIOD, (ss[i + 1] + 5.0) / WEB_RUT_PERIOD
            uvs += [(0.0, v0), (1.0, v0), (1.0, v1), (0.0, v1)]
    ob = pk.mesh_object('WebRuts', verts, faces, uvs=uvs, material=m)
    ob.hide_render = True
    ob['pk_webonly'] = 1
    ob['mirror_strength'] = 0.7
    ob['mirror_streak'] = 0.6
    pk.log('web: wet tyre track cores as web-only mirror strips (%d m)' % int(ss[-1] - ss[0]))


def web_road_uvs():
    """The Road's UVs are metres (U across from the centre line, V along from s0); the film's
    Slush shader read them during the render. For the export they become road-texture
    coordinates: u = U / RW + 0.5, v = V / WEB_ROAD_PERIOD."""
    ob = bpy.data.objects.get('Road')
    if ob is None or ob.get('sn03_web_uv'):
        return
    uvl = ob.data.uv_layers['UVMap']
    uv = np.empty(len(uvl.data) * 2, np.float32)
    uvl.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    uv[:, 0] = uv[:, 0] / RW + 0.5
    uv[:, 1] = uv[:, 1] / WEB_ROAD_PERIOD
    uvl.data.foreach_set('uv', uv.ravel())
    ob['sn03_web_uv'] = 1


def _brick_tile(c, block, n=512, nb=4, nr=8, seed=7, mortar=0.022):
    """Tileable stone-block texture of the film's stone_mat (Brick node: half-brick offset,
    per-block tone between 1.08 c and 0.8 c, dark mortar, 9/m noise). Returns colour, normal
    and the tile size in metres (nb blocks x nr rows)."""
    rng = np.random.default_rng(seed)
    bw, rh = block
    W, H = nb * bw, nr * rh
    x = (np.arange(n) + 0.5) / n * W
    z = (np.arange(n) + 0.5) / n * H
    X, Z = np.meshgrid(x, z)
    row = np.floor(Z / rh).astype(int)
    xo = X + (row % 2) * 0.5 * bw
    colm = np.floor(xo / bw).astype(int) % nb
    fx, fz = xo - np.floor(xo / bw) * bw, Z - row * rh
    e = np.minimum(np.minimum(fx, bw - fx), np.minimum(fz, rh - fz))
    fac = _mr(e, mortar * 0.5 * 0.7, mortar * 0.5 * 1.3, 0.0, 1.0, True)     # 1 on the block
    tone = rng.random((nr, nb))[row % nr, colm]
    bc = np.array(c) * 1.08
    col = bc + (np.array(c) * 0.8 - bc) * tone[..., None]
    f1 = _wn((n, n), (H, W), 0.11, rng, 4, 0.65)
    col = col * _mr(f1, 0.3, 0.7, 0.88, 1.08)[..., None]
    col = np.array([0.08, 0.08, 0.1]) + (col - np.array([0.08, 0.08, 0.1])) * fac[..., None]
    hgt = 0.02 * 0.5 * (fac + 0.25 * f1)
    return col, _normal_map(hgt, (H / n, W / n)), (W, H)


def web_tower():
    """Clock tower stone blocks for the web: object-space UVs (x + y, z), the film shader's own
    brick coordinates, on the TowerBody and TowerStone faces, and tileable block textures in
    place of the flat tan fallback. TowerBody keeps its web-only warm glow (the stand-in for
    EEVEE's GI bounce from the cornice bulbs), now modulated by the blocks."""
    ob = bpy.data.objects.get('ClockTower')
    if ob is None:
        return
    me = ob.data
    specs = {'TowerBody': ((0.72, 0.66, 0.58), (0.5, 0.25)), 'TowerStone': ((0.42, 0.4, 0.44), (0.7, 0.34))}
    uvl = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    lv = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get('vertex_index', lv)
    uv = np.empty(len(me.loops) * 2, np.float32)
    uvl.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    ls = np.empty(len(me.polygons), np.int64)
    lt = np.empty(len(me.polygons), np.int64)
    mi = np.empty(len(me.polygons), np.int64)
    me.polygons.foreach_get('loop_start', ls)
    me.polygons.foreach_get('loop_total', lt)
    me.polygons.foreach_get('material_index', mi)
    lmi = np.repeat(mi, lt)
    for si, mm in enumerate(me.materials):
        if mm is None or mm.name not in specs:
            continue
        c, block = specs[mm.name]
        col, nrm, (W, H) = _brick_tile(c, block, seed=11 if mm.name == 'TowerBody' else 12)
        sel = lmi == si
        p = co[lv[sel]]
        uv[sel, 0] = (p[:, 0] + p[:, 1]) / W
        uv[sel, 1] = p[:, 2] / H
        ci = _web_img('sn03_%s_col' % mm.name, col)
        ni = _web_img('sn03_%s_nrm' % mm.name, nrm, False)
        if mm.name == 'TowerBody':
            # the GI stand-in glow, (1, 0.6, 0.25) x 0.28 flat before, now x the block albedo
            em = col * np.array([1.0, 0.6, 0.25])
            ei = _web_img('sn03_TowerBody_emit', em)
            _web_tex_mat(mm, col=ci, rough=0.8, nrm=ni, nrm_s=1.0, emit_img=ei, emit_s=0.28 / 0.68)
        else:
            _web_tex_mat(mm, col=ci, rough=0.8, nrm=ni, nrm_s=1.0)
    uvl.data.foreach_set('uv', uv.ravel())
    pk.log('web: clock tower stone blocks (object-space UVs, %d loops)' % int(np.isin(lmi, [i for i, mm in enumerate(me.materials) if mm and mm.name in specs]).sum()))


def _window_tile(color, mullions, frame_w, curtains, n=256, mullion_w=0.07):
    """lit_window's pane pattern (frame, mullions, warm hot spot near the top, darker bottom,
    curtain silhouettes at the sides) as emission colour / 1.6 (the shader's peak glow)."""
    u = (np.arange(n) + 0.5) / n
    U, V = np.meshgrid(u, u)
    fr = (U < frame_w) | (U > 1 - frame_w) | (V < frame_w) | (V > 1 - frame_w)
    mx, my = mullions
    for i in range(1, mx):
        fr |= np.abs(U - i / mx) < mullion_w / 2
    for i in range(1, my):
        fr |= np.abs(V - i / my) < mullion_w / 2
    d = np.sqrt((U - 0.5) ** 2 + (V - 0.78) ** 2)
    glow = _mr(d, 0.0, 0.9, 1.6, 0.45, True)
    side = _mr(np.abs(U - 0.5), 0.22, 0.48, 0.0, 1.0)
    sil = _mr(side + 0.25 + 0.1 * np.sin(V * 9.0), 0.7, 0.9, 0.0, 1.0) * curtains
    e = glow * (1.0 - 0.75 * sil) * (~fr)
    return np.array(color)[None, None, :3] * (e / 1.6)[..., None], float(e.mean())


def web_windows():
    """Pane detail for every lit_window material: emission texture of the shader's pattern
    (the flat web fallback lit the whole quad, frames and mullions included, at the panel
    mean, which read as flat cream). Its mean glow is WEB_WIN_K of the film panel's."""
    n = 0
    for m in bpy.data.materials:
        if m.get('pk_web_unlit') is None or m.node_tree is None or m.get('pk_web') is None:
            continue
        w = dict(m['pk_web'])
        color = tuple(w['emit'])
        strength = float(w['emit_strength']) / 0.55
        mul, fw, cur, var = WEB_WIN.get(m.name, ((2, 2), 0.07, 0.3, 0.45))
        tile, mean = _window_tile(color, mul, max(fw * 1.25, 0.03), cur)
        img = _web_img('sn03_win_%s' % m.name, tile)
        bright = 1.0 - 0.2 * var
        _web_tex_mat(m, base=tuple(w['base']), rough=0.2, emit_img=img, emit_s=strength * 1.6 * bright * WEB_WIN_K)
        n += 1
        pk.log('web: window %s pane texture (mean glow %.2f, strength %.1f)' % (m.name, mean * bright * WEB_WIN_K, strength))
    return n


def web_snow_clearance(c, radii=None):
    """The film fades near flakes out by camera distance (SoftFlake 2.2..3.2 m, PK_Snowflake_5
    1.35..2.3 m; cabin_safe_snow), which glTF cannot carry, so the web drew a few flakes a
    hand's width from the lens as big blobs and diamonds. Every flake (all three looping
    copies share one mesh) whose centre comes within the fade radius of the camera at any
    frame is dropped from the web mesh: about 7 percent of the flakes."""
    radii = radii or {'SoftFlake': 2.7, 'PK_Snowflake_5': 1.9}
    sc = bpy.context.scene
    groups = {}
    for o in sc.objects:
        if o.type == 'MESH' and len(o.data.materials) and o.data.materials[0] is not None \
                and o.data.materials[0].name in radii:
            groups.setdefault(o.data.name, (o.data, []))[1].append(o)
    if not groups:
        return
    cent, near = {}, {}
    for key, (me, obs) in groups.items():
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get('co', co)
        cent[key] = co.reshape(-1, 6, 3).mean(1)
        near[key] = np.zeros(len(cent[key]), bool)
    f0 = sc.frame_current
    for f in range(c.frame_start, c.frame_end + 1):
        sc.frame_set(f)
        cp = np.array(c.camera.matrix_world.translation)
        for key, (me, obs) in groups.items():
            r2 = radii[me.materials[0].name] ** 2
            for o in obs:
                M_ = np.array(o.matrix_world)
                p = cent[key] @ M_[:3, :3].T + M_[:3, 3]
                near[key] |= ((p - cp) ** 2).sum(1) < r2
    sc.frame_set(f0)
    tot = 0
    for key, (me, obs) in groups.items():
        drop = np.repeat(near[key], 6)
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[v for v, d in zip(bm.verts, drop) if d], context='VERTS')
        bm.to_mesh(me)
        bm.free()
        me.update()
        tot += int(near[key].sum())
        pk.log('web: %s drops %d of %d flakes that pass within %.1f m of the lens'
               % (key, int(near[key].sum()), len(near[key]), radii[me.materials[0].name]))
    return tot


def web_light_ranges():
    """EEVEE cuts every point, spot and area light off at its influence radius,
    sqrt(max(colour) * energy / 100 * max(diffuse, specular) / light_threshold), with the window
    (1 - (d/r)^4)^2, which is exactly three.js's light.distance window. Without it the web
    lights reach forever: the 45 W arch bulbs (6.7 m in the film) washed the whole road
    warm-white (road centre at t1 (82,86,107) against the film's (40,60,91); with these ranges
    (44,61,96)). Writes pk_range (export-only custom property) where none is set; lights
    include-linked to a few receivers keep the kit's automatic range."""
    th = max(bpy.context.scene.eevee.light_threshold, 1e-6)
    n = 0
    for o in bpy.context.scene.objects:
        if o.type != 'LIGHT' or o.data.type == 'SUN' or o.get('pk_range') is not None:
            continue
        ld = o.data
        if ld.type == 'AREA' and pk._light_receivers(o):
            continue
        if getattr(ld, 'use_custom_distance', False):
            r = ld.cutoff_distance
        else:
            p = max(ld.color) * abs(ld.energy) / 100.0 * max(ld.diffuse_factor, ld.specular_factor)
            r = math.sqrt(max(p, 1e-16) / th)
        o['pk_range'] = round(r, 2)
        n += 1
    pk.log('web: EEVEE influence radius as pk_range on %d lights' % n)


_kit_web_materials = pk._web_materials


def _web_materials_sn03():
    """The kit flattens every pk_web material; then the road, the wet-core strips, the clock
    tower and the windows get their baked textures (export only)."""
    _kit_web_materials()
    road = bpy.data.materials.get('Slush')
    if road is not None:
        col, rr, nrm = web_road_textures()
        _web_tex_mat(road, col=col, rough_img=rr, nrm=nrm, nrm_s=1.0)
    rut = bpy.data.materials.get('WetRut')
    if rut is not None:
        col, rr, nrm = web_rut_textures()
        # nearest roughness: a filtered step from the water film (0.1) to the slush (0.95)
        # left one-texel rims of mid roughness that caught every lamp as a bright outline
        _web_tex_mat(rut, col=col, rough_img=rr, nrm=nrm, nrm_s=1.0, rough_closest=True)
    web_tower()
    web_windows()


pk._web_materials = _web_materials_sn03


def _export_web(c):
    web_ruts(c)
    web_road_uvs()
    web_snow_clearance(c)
    web_light_ranges()
    sc = bpy.context.scene
    # headlamps: three.js has no shadows, so the lamp housing and fenders no longer soften
    # the beam edges on the near snow; a wider penumbra stands in (export only)
    for o in sc.objects:
        if o.type == 'LIGHT' and o.name.startswith('Headlamp') and o.data.type == 'SPOT':
            o.data.spot_blend = WEB_HEADLAMP_BLEND
    # dash and wheel: in the film only the cool cabin light reaches them (light linking, a roof
    # over the cabin), and their coated tops carry its blue sheen, (15,7,40) on the dash; the
    # flat web fallback read red-magenta (15,2,23). A faint cool glow stands in for the sheen
    # (a web clear coat mirrored the cabin stand-in as a hot blob instead)
    # The wheel keeps its clear coat (a little rougher than the film's 0.25), which draws its
    # lit rim; on the dash a coat mirrored the unoccluded web sky as a pale patch
    for name, col, k, coat, cr in (('PK_Dashboard', [0.4, 0.5, 1.0], 0.06, 0.0, 0.0),
                                   ('PK_Wheel', [0.3, 0.45, 1.0], 0.02, 0.35, 0.3)):
        m = bpy.data.materials.get(name)
        if m is not None and m.get('pk_web') is not None:
            w = dict(m['pk_web'])
            w['emit'], w['emit_strength'] = col, k
            if coat > 0:
                w['coat'], w['coat_rough'] = coat, cr
            m['pk_web'] = w
    cd = c.camera.data
    base = c.camera.get('sn03_overscan_base')
    if base is None:
        return _kit_export_web(c)
    now = (sc.render.resolution_x, sc.render.resolution_y, cd.sensor_height, cd.shift_y)
    # the ID property stores the four numbers as floats
    sc.render.resolution_x, sc.render.resolution_y = int(round(base[0])), int(round(base[1]))
    cd.sensor_height, cd.shift_y = float(base[2]), float(base[3])
    try:
        return _kit_export_web(c)
    finally:
        sc.render.resolution_x, sc.render.resolution_y, cd.sensor_height, cd.shift_y = now


pk.export_web = _export_web


def build(ctx):
    rng = random.Random(3)
    # gentle S: a right bend (0 to +14 degrees) past the bakery and the tower, easing back to
    # the left into the plaza; the camera never reaches s = 80
    pts = [(0, 0), (-0.2, 14), (0.3, 28), (2.3, 42), (5.2, 56), (8.0, 70), (9.6, 84), (9.6, 98), (7.4, 112),
           (3.0, 126), (-3.0, 140)]
    # no kit vibration: its pitch and roll sines (up to about 7 Hz) alias at 24 fps into a
    # +-5 px vertical buzz of the world against the rigid hood, and with motion blur they make
    # the bloom of the plaza bulbs flicker frame to frame (round 4). A slow sub-2 Hz float
    # (gentle_float) keeps the car alive instead.
    cam = pk.camera.drive(pts, speed_mps=SPEED, height=1.2, fov_v_deg=60, pitch_deg=3.5, look_ahead=12.0,
                          vibration=0.0, sway=0.04, max_roll_deg=1.2, lateral=LANE)
    smooth_turns(cam)       # round 5: no roll swings or yaw start-stops at the path knots
    gentle_float(cam)
    path = ctx.path
    town = ctx.collection('Town')
    far = ctx.collection('Far')
    props = ctx.collection('Props')

    # the plaza tree sits on the camera's axis at t = 9.5 s, 31 m ahead, a little left of centre
    sc = ctx.scene
    sc.frame_set(int(ctx.t2f(9.5)))
    mw = cam.matrix_world.copy()
    cpos = mw.translation.copy()
    fwd = -Vector((mw[0][2], mw[1][2], 0.0)).normalized()
    left = Vector((-fwd.y, fwd.x, 0.0))
    TREE = cpos + fwd * 31.0 + left * 1.6
    TREE.z = 0.0
    sc.frame_set(1)
    S_PLAZA = 78.0

    # window materials: warm tungsten everywhere (varied), a rare cool screen glow
    M['win_warm'] = pk.mat.lit_window((1.0, 0.56, 0.24), strength=10.0, name='WinWarm', curtains=0.4, hue_shift=0.04)
    M['win_gold'] = pk.mat.lit_window((1.0, 0.7, 0.38), strength=9.0, name='WinGold', curtains=0.3, hue_shift=0.03)
    M['win_amber'] = pk.mat.lit_window((1.0, 0.47, 0.17), strength=9.0, name='WinAmber', curtains=0.35, hue_shift=0.03)
    M['win_cool'] = pk.mat.lit_window((0.5, 0.66, 1.0), strength=7.0, name='WinCool', curtains=0.3, hue_shift=0.03)
    M['win_shop'] = pk.mat.lit_window((1.0, 0.6, 0.26), strength=30.0, name='WinShop', curtains=0.0,
                                      mullions=(3, 3), variation=0.1, hue_shift=0.02)
    M['win_bake'] = pk.mat.lit_window((1.0, 0.58, 0.24), strength=22.0, name='WinBake', curtains=0.25,
                                      variation=0.15, hue_shift=0.02)
    M['win_bell'] = pk.mat.lit_window((1.0, 0.66, 0.3), strength=10.0, name='WinBell', curtains=0.0,
                                      mullions=(1, 1), variation=0.1, frame_w=0.02)
    M['win_far'] = pk.mat.lit_window((1.0, 0.62, 0.3), strength=13.0, name='WinFar', curtains=0.2,
                                     variation=0.5, hue_shift=0.05)
    M['win_far2'] = pk.mat.lit_window((1.0, 0.72, 0.42), strength=13.0, name='WinFar2', curtains=0.2,
                                      variation=0.5, hue_shift=0.04)
    M['win_far_cool'] = pk.mat.lit_window((0.55, 0.7, 1.0), strength=9.0, name='WinFarCool', curtains=0.2,
                                          variation=0.5, hue_shift=0.05)
    # aliases used by the cottage generator
    M['win_pink'] = M['win_amber']
    M['win_violet'] = M['win_gold']
    M['win_mint'] = M['win_warm']
    M['win_far_pink'] = M['win_far2']

    # ---- ground
    pk.geo.road_from_curve(path, width=RW, material=slush_mat(road_w=RW), crown=0.03, curb=None,
                           sidewalk=None, verge=snow_mat('SnowGround', color=(0.6, 0.68, 0.9), lumps=0.3),
                           verge_width=36.0, collection=town, s0=-30, s1=path.length)
    banks = {}
    for side in (-1, 1):
        ob, ss, H = snow_bank(path, side, RW / 2 - 0.15, RW / 2 + 1.2, -25, S_PLAZA + 4, town, seed=7 + side,
                              hmin=0.16, hmax=0.42)
        banks[side] = (ss, H)
    terr, hfun = terrain(path, far)
    mountains(far)

    # ---- hero and landmark
    S_BAKE, S_TOWER = 52.0, 67.0
    bk, bk_yaw, bk_c = bakery(ctx, path, S_BAKE, -1, 7.2, town, rng)
    tw, tw_c = clock_tower(ctx, path, S_TOWER, 1, 7.9, town, rng)

    # ---- near cottages, both sides, up to the plaza
    def free(side, s0, s1):
        if side < 0 and (s1 > S_BAKE - 10.0 and s0 < S_BAKE + 9.0):
            return False
        if side > 0 and (s1 > S_TOWER - 7.0 and s0 < S_TOWER + 7.0):
            return False
        return s1 < S_PLAZA
    gaps = {-1: [], 1: []}
    for side in (-1, 1):
        s = -14.0 if side < 0 else -10.0
        while s < S_PLAZA:
            w = rng.uniform(6.0, 8.6)
            if not free(side, s, s + w):
                gaps[side].append((s, s + 2.0))
                s += 2.0
                continue
            d = rng.uniform(6.0, 7.6)
            h = rng.choice([4.0, 4.6, 5.4, 5.8, 6.4])
            rh = rng.uniform(2.6, 3.4) * (w / 7.0) ** 0.5
            lat = rng.uniform(6.6, 7.3)
            toward = rng.uniform(-4, 6)
            wash = WASHES[len(gaps[side]) % len(WASHES)] if rng.random() < 0.45 else None
            wash = wash if rng.random() < 0.45 else None
            add_house(ctx, path, s + w / 2, side, lat, (w, d, h, rh), rng, town, toward=toward, wash=wash, wash_e=160.0)
            gap = rng.uniform(1.6, 4.2)
            gaps[side].append((s + w, s + w + gap))
            s += w + gap

    # ---- second row: taller, simpler houses
    for side in (-1, 1):
        s = -10.0 + rng.uniform(0, 4)
        while s < S_PLAZA - 4:
            w = rng.uniform(6.0, 9.0)
            d = rng.uniform(6.0, 8.0)
            h = rng.choice([5.6, 6.4, 7.2, 8.4])
            rh = rng.uniform(2.8, 3.8)
            lat = rng.uniform(13.5, 18.0)
            if side > 0 and S_TOWER - 10 < s < S_TOWER + 8:
                lat += 4.0
            add_house(ctx, path, s + w / 2, side, lat, (w, d, h, rh), rng, town, detail=False,
                      toward=rng.uniform(-8, 8), string=rng.random() < 0.4, door=False)
            s += w + rng.uniform(2.5, 7.0)

    # ---- the plaza: a ring of tall gabled houses facing the great tree
    ring = []
    pr_ = random.Random(19)
    for k, ang in enumerate(np.linspace(-118, 118, 11)):
        a = math.radians(float(ang))
        dirv = fwd * math.cos(a) + left * -math.sin(a)
        R = pr_.uniform(17.0, 20.0)
        w = pr_.uniform(7.0, 9.0)
        d = pr_.uniform(6.5, 8.0)
        h = pr_.choice([6.4, 7.2, 8.4, 9.0])
        rh = pr_.uniform(3.2, 4.0)
        c = TREE + dirv * (R + d / 2)
        ob, lights_, strings_ = cottage('Plaza_%d' % k, w, d, h, rh, pr_, pr_.choice(WALLS), pr_.choice(TRIMS),
                                        pr_.choice(TRIMS), pr_.choice(ROOFS),
                                        {'floors': [(0.95, [-w / 4, w / 4], pr_.choice([M['win_warm'], M['win_gold'], M['win_amber']]), 1.1, 1.4),
                                                    (h * 0.58, [-w / 3, 0, w / 3], pr_.choice([M['win_warm'], M['win_gold'], M['win_amber']]), 0.95, 1.2)],
                                         'gable': M['win_gold'], 'door_x': 0.0, 'transom': M['win_gold']},
                                        gable_front=pr_.random() < 0.7, coll=town, detail=True,
                                        string=pr_.choice([BULB_WARM, BULB_MULTI]))
        yaw = math.atan2(-dirv.x, dirv.y)
        place(ob, c, yaw)
        for (kind, loc, col, en) in lights_:
            lo = pk.lights.point(loc, col, en, radius=0.15, shadow=False, name=ob.name + '_lamp', collection=town)
            child(lo, ob, loc)
        for (p0, p1, cols) in strings_:
            wire = pk.geo.string_lights(p0, p1, sag=0.12, count=11, colors=cols, strength=70.0,
                                        bulb_radius=0.04, name=ob.name + '_str', collection=town)
            child(wire, ob, (0, 0, 0))
        ring.append((ob, c, dirv, h))

    # ---- far hill village: instanced cottage variants on the slopes, a church
    variants = []
    for k in range(8):
        r2 = random.Random(100 + k)
        w, d = r2.uniform(5.5, 8.0), r2.uniform(5.5, 7.0)
        h = r2.choice([3.6, 4.4, 5.6, 6.6])
        wf = [M['win_far'], M['win_far2'], M['win_far'], M['win_far_cool']][k % 4]
        wins = {'floors': [(1.0, [-w / 4, w / 4], wf, 1.0, 1.25)], 'gable': wf}
        if h > 5:
            wins['floors'].append((h * 0.6, [-w / 4, w / 4], wf, 0.9, 1.1))
        ob, _, _ = cottage('FarSrc%d' % k, w, d, h, r2.uniform(2.4, 3.2), r2, r2.choice(WALLS), r2.choice(TRIMS),
                           r2.choice(TRIMS), r2.choice(ROOFS), wins, gable_front=r2.random() < 0.6, door=False,
                           chimney=r2.random() < 0.7, ice=False, detail=False, coll=far)
        variants.append(ob)
    fr = random.Random(77)
    fpts, fyaw = [], []
    tries = 0
    while len(fpts) < 240 and tries < 9000:
        tries += 1
        x = fr.uniform(-220, 260)
        y = fr.uniform(80, 520)
        z, dd = hfun(x, y)
        if dd < 40 or z > 80:
            continue
        if (Vector((x, y, 0)) - TREE).length < 34:
            continue
        if any((x - p[0]) ** 2 + (y - p[1]) ** 2 < 14 ** 2 for p in fpts):
            continue
        if abs(math.degrees(math.atan2(x - 6.0, y))) > 40:
            continue
        fpts.append((x, y, z - 0.3))
        fyaw.append(math.degrees(math.atan2(-(x - 6.0), y)) + fr.uniform(-25, 25))
    pk.geo.scatter(variants, fpts, seed=5, scale=(0.9, 1.25), align=fyaw, name='FarHouses', collection=far)
    # church on the hill behind the plaza
    chp = TREE + fwd * 130.0 + left * 22.0
    cz, _ = hfun(chp.x, chp.y)
    church, _, _ = cottage('Church', 9.0, 16.0, 8.0, 5.0, random.Random(5), (0.82, 0.8, 0.78), (0.93, 0.93, 0.95),
                           CANDY_RED, (0.07, 0.12, 0.12), {'floors': [(2.0, [-2.5, 2.5], M['win_far'], 1.2, 3.0)],
                                                           'gable': M['win_far']},
                           gable_front=True, door=False, chimney=False, ice=False, detail=False, coll=far)
    place(church, (chp.x, chp.y, cz - 0.4), math.atan2(fwd.x, -fwd.y) + math.pi)
    st = pk.geo.rounded_box((3.4, 3.4, 15.0), radius=0.15, material=wall((0.82, 0.8, 0.78)), name='Steeple', collection=far)
    child(st, church, (0, -6.0, 0))
    sp = pk.geo.lathe([(2.3, 15.0), (0.0, 23.5)], segments=4, material=cached('spire', lambda: pk.mat.toy_plastic((0.08, 0.2, 0.22), roughness=0.35)),
                      name='SteepleSpire', collection=far)
    child(sp, church, (0, -6.0, 0))
    sp.rotation_euler = (0, 0, math.pi / 4)
    sw = pk.geo.window_panel(1, 2, win_w=1.0, win_h=1.8, gap_y=3.0, material=M['win_gold'], round_top=True,
                             name='SteepleWin', collection=far)
    child(sw, church, (0, -7.75, 6.0))
    cm = church.matrix_world
    pk.lights.spot(tuple(cm @ Vector((0, -16, 0.5))), tuple(cm @ Vector((0, -6, 14))), (1.0, 0.7, 0.4), 6000.0,
                   angle_deg=40, blend=0.8, shadow=False, name='ChurchUp', collection=far, volume=0.0)

    # ---- pines: lit pines near the road, the great plaza tree, snowy forest
    pine_lit = [pine_source('PineA', 5.2, 1.7, 5, BULB_WARM, 80, star=True, coll=props, rng=random.Random(1)),
                pine_source('PineB', 6.0, 1.9, 6, BULB_MULTI, 100, star=False, coll=props, rng=random.Random(2)),
                pine_source('PineC', 4.4, 1.5, 5, BULB_CANDY, 70, star=False, coll=props, rng=random.Random(3))]
    pine_dark = [pine_source('PineD', 6.5, 2.0, 6, coll=props, rng=random.Random(4), seg=16),
                 pine_source('PineE', 8.5, 2.4, 7, coll=props, rng=random.Random(5), seg=16),
                 pine_source('PineF', 4.8, 1.6, 5, coll=props, rng=random.Random(6), seg=14)]
    ppts, pyaw = [], []
    pr = random.Random(9)
    for side in (-1, 1):
        for (g0, g1) in gaps[side]:
            if g1 - g0 >= 1.6 and pr.random() < 0.75 and g1 < S_PLAZA:
                sm = (g0 + g1) / 2
                ppts.append(tuple(path.offset(sm, side * pr.uniform(6.8, 8.2), 0.0)))
                pyaw.append(pr.uniform(0, 360))
    pk.geo.scatter(pine_lit, ppts, seed=4, scale=(0.85, 1.15), align=pyaw, name='LitPines', collection=props)
    for i, p in enumerate(ppts[::3]):
        pk.lights.point((p[0], p[1], 2.2), pr.choice([(1.0, 0.6, 0.3), (1.0, 0.5, 0.25), (1.0, 0.7, 0.4)]), 70.0,
                        radius=0.8, shadow=False, name='PineGlow', collection=props)
    dpts = [p for p in pk.geo.points_in_band(path, 70, 11.5, 30.0, s0=-10, s1=S_PLAZA, seed=12, min_dist=4.0)]
    pk.geo.scatter(pine_dark + pine_lit[:1], dpts, seed=6, scale=(0.8, 1.4), name='MidPines', collection=props)
    forest = []
    fr2 = random.Random(31)
    tries = 0
    while len(forest) < 700 and tries < 20000:
        tries += 1
        x = fr2.uniform(-300, 320)
        y = fr2.uniform(40, 680)
        z, dd = hfun(x, y)
        if dd < 36 or (Vector((x, y, 0)) - TREE).length < 30:
            continue
        if abs(math.degrees(math.atan2(x - 6.0, y))) > 60:
            continue
        if any((x - p[0]) ** 2 + (y - p[1]) ** 2 < 7 ** 2 for p in fpts):
            continue
        forest.append((x, y, z - 0.2))
    pk.geo.scatter(pine_dark, forest, seed=7, scale=(1.2, 2.4), name='Forest', collection=far)
    big = pine_source('BigTree', 15.0, 4.8, 12, BULB_MULTI + BULB_WARM, 900, star=True, coll=props, rng=random.Random(8))
    place(big, TREE, 0.3)
    for k, col in enumerate([(1.0, 0.45, 0.25), (1.0, 0.7, 0.35), (1.0, 0.55, 0.3), (1.0, 0.75, 0.45)]):
        a = k * math.pi / 2 + 0.4
        pk.lights.point((TREE.x + 4.0 * math.cos(a), TREE.y + 4.0 * math.sin(a), 2.5 + k * 1.2), col, 1100.0, radius=1.0,
                        shadow=False, name='BigTreeGlow', collection=props)
    # a snowy island under the tree with a ring of lanterns
    isl = pk.geo.lathe([(0.0, 0.0), (5.4, 0.0), (5.6, 0.12), (5.2, 0.32), (0.0, 0.4)], segments=48,
                       material=snow_mat('Snow'), name='TreeIsland', collection=props)
    lumpy(isl, amp=0.06, freq=1.5, seed=3)
    isl.location = (TREE.x, TREE.y, -0.05)
    # light canopy: strands from the star of the tree to the plaza eaves
    top = TREE + Vector((0, 0, 14.2))
    for k, (ob, c, dirv, h) in enumerate(ring):
        p1 = c - dirv * 3.6 + Vector((0, 0, h + 0.6))
        pk.geo.string_lights(tuple(top), tuple(p1), sag=1.6, count=30, colors=[BULB_WARM, BULB_MULTI][k % 2],
                             strength=90.0, bulb_radius=0.05, light_every=10, light_energy=35.0, collection=town,
                             name='Canopy%d' % k)

    # ---- lamp posts along both sides (candy-cane poles, sodium lanterns), and round the plaza
    lsrc = lamp_source(props)
    lp_pts, lp_yaw = [], []
    for i, s in enumerate(np.arange(4.0, S_PLAZA, 12.5)):
        side = 1 if i % 2 == 0 else -1
        if side < 0 and abs(s - S_BAKE) < 9:
            s = S_BAKE - 10.0
        p = path.offset(float(s), side * 5.0, 0.0)
        lp_pts.append(tuple(p))
        lp_yaw.append(math.degrees(facing_yaw(path, s, side)))
        lpos = path.offset(float(s), side * 5.0, 3.6)
        sp = pk.lights.spot(tuple(lpos), tuple(path.offset(float(s), side * 3.6, 0.0)), SODIUM, 900.0,
                            angle_deg=84, blend=0.55, radius=0.1, shadow=True, name='LampLight', collection=props,
                            volume=0.6)
        # web: shadowed inside its lantern box it lights nothing in the film, but the shadowless
        # web edition would paint a 900 W sodium pool on the road under every post
        sp['pk_noexport'] = True
    for k in range(7):
        a = math.radians(-150 + k * 50)
        dirv = fwd * math.cos(a) + left * -math.sin(a)
        p = TREE + dirv * 9.0
        lp_pts.append(tuple(p))
        lp_yaw.append(math.degrees(math.atan2(dirv.x, -dirv.y)))
        pk.lights.spot(tuple(p + Vector((0, 0, 3.6))), tuple(p + dirv * 1.5), SODIUM, 1000.0, angle_deg=110, blend=0.7,
                       radius=0.1, shadow=False, name='LampLight', collection=props, volume=0.5)
    pk.geo.scatter(lsrc, lp_pts, seed=1, scale=(1.0, 1.0), align=lp_yaw, name='Lamps', collection=props)

    # ---- lanterns along the top of the snow banks (luminaria)
    lsrc2 = lantern_source(props)
    lt_pts = []
    lr = random.Random(13)
    for side in (-1, 1):
        for s in np.arange(-6.0, S_PLAZA, 4.2):
            s2 = float(s) + lr.uniform(-0.6, 0.6)
            if lr.random() < 0.12:
                continue
            hh = bank_height(*banks[side], s2)
            lt_pts.append(tuple(path.offset(s2, side * (RW / 2 + 0.55), hh * 0.93)))
    for k in range(18):
        a = 2 * math.pi * k / 18
        lt_pts.append((TREE.x + 5.3 * math.cos(a), TREE.y + 5.3 * math.sin(a), 0.2))
    pk.geo.scatter(lsrc2, lt_pts, seed=2, scale=(0.85, 1.15), name='Luminaria', collection=props)

    # ---- picket fences in front of the near houses
    fsrcs = [fence_source(props), fence_source(props, color=(0.85, 0.12, 0.12), name='FenceSrcRed'),
             fence_source(props, color=(0.2, 0.42, 0.3), name='FenceSrcGreen')]
    f_pts, f_yaw = [], []
    for side in (-1, 1):
        for s in np.arange(-8.0, S_PLAZA - 4, 3.05):
            if side < 0 and abs(s - S_BAKE) < 10:
                continue
            if side > 0 and abs(s - S_TOWER) < 8:
                continue
            if (int(s / 3.05) % 7) in (3,):
                continue
            f_pts.append(tuple(path.offset(float(s), side * 5.55, 0.05)))
            f_yaw.append(math.degrees(facing_yaw(path, s, side)))
    pk.geo.scatter(fsrcs, f_pts, seed=3, scale=(1.0, 1.0), align=f_yaw, name='Fences', collection=props)

    # ---- the hook: a tunnel of light arches over the first stretch of road (bulbs alternate
    # warm white with candy red or gold), then strings across the street further on
    for k, s in enumerate(np.arange(10.0, 41.0, 6.0)):
        s = float(s)
        p0 = path.offset(s, -4.5, 0.25)
        p1 = path.offset(s, 4.5, 0.25)
        cols = [[WARM_WHITE, WARM_WHITE, CANDY_RED], [WARM_WHITE, GOLD]][k % 2]
        arch = pk.geo.string_lights(tuple(p0), tuple(p1), sag=-5.6, count=60, colors=cols, strength=95.0,
                                    bulb_radius=0.032, light_every=12, light_energy=45.0, collection=town,
                                    name='Arch%d' % k,
                                    wire_material=cached('archwire', lambda: pk.mat.metal((0.05, 0.05, 0.06), roughness=0.4)))
        for o in [arch] + list(arch.children):
            if o.type == 'MESH':
                o.visible_shadow = False
        for lat in (-4.5, 4.5):
            post = pk.geo.rounded_box((0.09, 0.09, 0.9), radius=0.03, material=cached('archwire', lambda: None),
                                      location=tuple(path.offset(s, lat, -0.4)), name='ArchPost', collection=town)
    sflake = pk.mat.neon_tube((0.6, 0.85, 1.0), 6.0, name='SnowflakeNeon')
    # round 4: no strand at s = 68 (it cut across the tree top in the 9.5 s payoff, then its big
    # bulbs left the top edge at 10.3 s, right at the start of the outro dim)
    # round 4: the strands run diagonally (right end 6 m further on) so the part over our lane
    # leaves the top edge over about 5 frames instead of all at once: a square-on strand of
    # these big bulbs took its whole bloom out of the frame on a single frame (a 5 to 7
    # percent luma step at 6.95 and 8.75 s). Both sit 1.5 m nearer than before, so the first
    # is gone before the 7 s still and the second (with the snowflake) leaves at 8.4 to 8.7 s,
    # before the tower door leaves the right edge, not on the same frames
    # round 5: the snowflake strand hangs 0.4 m higher with less sag (0.6 m), so the snowflake
    # (centre 0.7 m higher) passes 3.6 m from the lens instead of 2.9 m and leaves the top
    # edge 4.1 m ahead at about 12 degrees across instead of 2.9 m ahead at about 17 degrees
    # (critics: it grew and whipped out of the top left)
    for k, s in enumerate((45.5, 56.5)):
        lift, sag = (0.0, 0.9) if k == 0 else (0.4, 0.6)
        p0 = path.offset(s + 0.75 - 3.0, -6.8, 5.2 + lift)
        p1 = path.offset(s + 0.75 + 3.0, 6.8, 5.4 + lift)
        cols = [BULB_MULTI, BULB_WARM, BULB_CANDY][k % 3]
        pk.geo.string_lights(tuple(p0), tuple(p1), sag=sag, count=26, colors=cols, strength=90.0, bulb_radius=0.045,
                             light_every=8, light_energy=40.0, collection=town, name='StreetStr%d' % k)
        if k == 1:
            mid = (p0 + p1) / 2 - Vector((0, 0, sag + 0.7))
            tg = path.tangent(s + 0.75)
            snowflake_neon('Snowflake%d' % k, mid, math.atan2(-tg.x, tg.y), 0.6, sflake, town)
            pk.lights.point(tuple(mid - path.tangent(s) * 0.6), (0.5, 0.75, 1.0), 50.0, radius=0.6, shadow=False,
                            name='SnowflakeGlow', collection=town)

    # ---- props with stories along the edges
    snowman('Snowman1', path.offset(S_BAKE + 8.0, -5.6, 0.08), facing_yaw(path, S_BAKE + 8.0, -1, 40), props, 0.95)
    snowman('Snowman2', TREE - fwd * 6.5 + left * 4.5, math.atan2(-fwd.x, fwd.y) + 0.5, props, 0.9)
    snowman('Snowman3', path.offset(16.0, 5.6, 0.08), facing_yaw(path, 16.0, 1, 45), props, 0.7)
    # villagers: two at the bakery window, a couple by the great tree, one walking home
    yb = facing_yaw(path, S_BAKE - 3.0, -1, 0) + math.pi
    figure('Villager1', path.offset(S_BAKE - 4.6, -5.2, 0.1), yb + 0.4, props, coat=(0.08, 0.16, 0.32), hat=CANDY_RED,
           scarf=(0.9, 0.85, 0.75), height=0.98, bag=True)
    figure('Villager2', path.offset(S_BAKE - 3.6, -5.4, 0.1), yb - 0.3, props, coat=(0.45, 0.05, 0.06),
           hat=(0.92, 0.9, 0.86), scarf=(0.12, 0.4, 0.22), height=0.82)
    ty = math.atan2(-fwd.x, fwd.y)
    figure('Villager3', TREE - fwd * 6.2 - left * 3.2, ty + 2.6, props, coat=(0.3, 0.18, 0.1), hat=(0.12, 0.4, 0.22),
           scarf=CANDY_RED, height=1.0)
    figure('Villager4', TREE - fwd * 6.4 - left * 2.4, ty + 3.4, props, coat=(0.75, 0.68, 0.55), hat=CANDY_RED,
           scarf=(0.9, 0.85, 0.75), height=0.92)
    # the couple stands between the camera and the lit tree: a soft warm fill from the
    # luminaria at their feet so they read as people, not dark posts
    pk.lights.point(tuple(TREE - fwd * 7.6 - left * 2.8 + Vector((0, 0, 0.5))), (1.0, 0.66, 0.4), 40.0, radius=0.4,
                    shadow=False, name='VillagerFill', collection=props)
    figure('Villager5', path.offset(27.0, 5.3, 0.1), facing_yaw(path, 27.0, 1, 0) + math.pi / 2, props,
           coat=(0.07, 0.08, 0.15), hat=CANDY_RED, scarf=(0.9, 0.85, 0.75), height=0.95, bag=True)
    cr = random.Random(23)
    for (s, side, col) in ((22.0, -1, (0.08, 0.22, 0.3)), (33.0, -1, (0.35, 0.05, 0.05)), (60.0, -1, (0.85, 0.8, 0.66))):
        p = path.offset(s, side * 3.0, 0.0)
        t_ = path.tangent(s)
        parked_car('ParkedCar', p, math.atan2(-t_.x, t_.y) + (math.pi if side < 0 else 0.0), props, body_c=col, rng=cr)

    # ---- haze and falling snow
    pk.geo.fog(center=(TREE.x, TREE.y - 20, 10), size=(300, 420, 22), density=0.0014, falloff=6.0,
               color=(0.4, 0.55, 1.0), anisotropy=0.35, name='Haze', collection=far)
    for ob in bpy.data.objects:
        if ob.type == 'LIGHT' and ob.data.type in ('POINT', 'AREA'):
            ob.data.volume_factor = 0.06
    # three depths: big soft flakes around the lens, mid flakes, fine diamond dust
    lo, hi = Vector((-8, -4, -0.3)), Vector((20, 84, 7.5))
    near = pk.particles.snow(tuple(lo), tuple(hi), density=0.1, flake_size=0.022, speed=0.85, layers=2, drift=0.6,
                             strength=0.0, name='SnowNear', collection=far, seed=11)
    seamless_snow(near, hi.z - lo.z)
    sm_ = soft_flake_mat()
    for o in near.children:
        if o.type == 'MESH':
            o.data.materials[0] = sm_
            o.data.shade_smooth()
            # octahedra -> round blobs (the nearest flakes are 20 to 40 px across)
            md = o.modifiers.new('Round', 'SUBSURF')
            md.levels = 1
            md.render_levels = 2
    cabin_safe_snow(sm_, near=2.2, far=3.2)
    snow_zmask(sm_, -0.05, hi.z - lo.z)
    fall = pk.particles.snow(tuple(lo), (20, 84, 4.5), density=0.1, flake_size=0.014, speed=0.75, layers=2, drift=0.5,
                             strength=0.5, name='Snowfall', collection=far)
    seamless_snow(fall, 4.5 - lo.z)
    cabin_safe_snow(bpy.data.materials['PK_Snowflake_5'])
    snow_zmask(bpy.data.materials['PK_Snowflake_5'], -0.05, 4.5 - lo.z)

    # ---- vehicle and sky
    vehicle(cam)
    sky(ctx)
    pk.render.setup(samples=64, exposure=-0.8, volumetric_end=320.0, trace_max_roughness=0.6)
    ctx.scene.eevee.shadow_pool_size = '1024'
    ctx.scene.eevee.ray_tracing_options.screen_trace_quality = 0.85
    pk.comp.setup(bloom=0.8, bloom_threshold=1.1, bloom_size=0.6, glow=0.2, glow_threshold=4.0, glow_size=0.6,
                  road_streak=0.0, road_streak_px=60, road_streak_threshold=0.8, road_streak_depth=140.0,
                  vignette=0.3, saturation=1.35, sky_bloom=0.03, sky_bloom_floor=2.5, grain=0.02, dispersion=0.0015,
                  star_glow=0.2, star_glow_threshold=0.45, star_sparkle=0.05, star_sparkle_threshold=0.9)
    comp_bloom_edge_fade()      # round 5: halos fade before their lights leave the frame
    # no compositor road streak: it added a bright stipple inside dark reflections, and the
    # wet film already stretches every light; the reflections now break up in the pools
    post_comp(black=0.0018, streak=0.0)
    animate_aurora(pk._cached_png(AUR_KEY, make_aurora, bits=16))

    if DEBUG:
        debug_report(ctx, {'bakery': bk_c + Vector((0, 0, 5.0)), 'tower_top': tw_c + Vector((0, 0, 28)),
                           'tower_mid': tw_c + Vector((0, 0, 12)), 'tree': TREE + Vector((0, 0, 7)),
                           'tree_top': TREE + Vector((0, 0, 15))})
    overscan(ctx)               # round 5: last, after debug_report (which projects into the 1080 x 1920 frame)


def animate_aurora(png):
    """The aurora plate is a still photograph; give it life in the film: the plate's pattern
    drifts slowly sideways inside its fixed feathered frame (about 1.3 degrees over the 14 s)
    and its brightness breathes with two slow incommensurate pulses (periods about 8 and 3.7
    s, +-10 and +-5 percent). Simple-expression drivers on Value nodes, so they evaluate
    headless; the web sky stays still."""
    w = bpy.context.scene.world
    nt = w.node_tree
    name = os.path.basename(png)
    tex = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeTexImage' and n.image is not None
           and os.path.basename(n.image.filepath) == name]
    if not tex:
        pk.log('animate_aurora: aurora texture node not found, left still')
        return
    tex = tex[0]
    lk = tex.inputs['Vector'].links[0]
    comb = lk.from_node
    u_link = comb.inputs[0].links[0]
    uu = u_link.from_socket

    def driven(expr, name_):
        v = nt.nodes.new('ShaderNodeValue')
        v.name = name_
        fc = v.outputs[0].driver_add('default_value')
        fc.driver.type = 'SCRIPTED'
        fc.driver.expression = expr
        return v.outputs[0]
    drift = driven('(frame - 1) * 0.00008', 'AuroraDrift')
    nt.links.new(pk.math_(nt, 'ADD', uu, drift), comb.inputs[0])
    pulse = driven('1.0 + 0.1 * sin(frame * 0.0327) + 0.05 * sin(frame * 0.0707 + 1.3)', 'AuroraPulse')
    for l2 in list(tex.outputs['Color'].links):
        to = l2.to_socket
        nt.links.remove(l2)
        nt.links.new(pk.vmath(nt, 'SCALE', tex.outputs['Color'], scale=pulse), to)


def post_comp(black=0.0015, streak=0.9, streak_px=60, streak_threshold=0.8, streak_depth=140.0, star_desat=0.85):
    """After the kit compositor:
    1. wet-road streaks (replaces the kit's road_streak): highlights on up-facing surfaces
       nearer than streak_depth, blurred vertically and added back. The road mask is softened
       by a 2 px blur first: the kit multiplies by the raw per-pixel mask from the Normal and
       Depth passes, which drops out at scattered pixels inside bright reflections and left a
       dark stipple there (round 1's 'dotted speckle');
    2. star chroma cap: in the sky (depth beyond 600 m) the fine detail (image minus a 3 px
       blur: the point stars and their glints) is desaturated by star_desat, so the stars read
       white and pale blue or warm instead of red / blue / green speckle after the global
       saturation and lens dispersion, while the aurora and the Milky Way keep their colour;
    3. a lower black point (the darkest pixels reach near black)."""
    ng = bpy.context.scene.compositing_node_group
    outn = [n for n in ng.nodes if n.bl_idname == 'NodeGroupOutput'][0]
    lk = outn.inputs[0].links[0]
    src = lk.from_socket
    ng.links.remove(lk)
    c = src
    if streak > 0:
        bpy.context.scene.view_layers[0].use_pass_normal = True
        rl = [n for n in ng.nodes if n.bl_idname == 'CompositorNodeRLayers'][0]
        base = rl.outputs['Image']
        depth = rl.outputs['Depth']
        nz = pk.sep_xyz(ng, rl.outputs['Normal'])[2]
        up = pk.maprange(ng, nz, 0.78, 0.92, 0.0, 1.0, interp='SMOOTHSTEP')
        near = pk.maprange(ng, depth, streak_depth * 0.6, streak_depth, 1.0, 0.0)
        notcar = pk.maprange(ng, depth, 1.2, 2.0, 0.0, 1.0)
        road = pk.math_(ng, 'MULTIPLY', pk.math_(ng, 'MULTIPLY', up, near), notcar)
        bl = pk.node(ng, 'CompositorNodeBlur')
        pk._set(ng, bl.inputs['Image'], pk.comb_xyz(ng, road, road, road))
        bl.inputs['Type'].default_value = 'Gaussian'
        bl.inputs['Size'].default_value = (2.0, 2.0)
        pk._STATE['px_inputs'].append((bl.inputs['Size'], (2.0, 2.0)))
        road = pk.sep_xyz(ng, bl.outputs['Image'])[0]
        lum = pk.vmath(ng, 'DOT_PRODUCT', base, pk.LUMA)
        hk = pk.maprange(ng, lum, streak_threshold * 0.6, streak_threshold * 1.8, 0.0, 1.0, interp='SMOOTHSTEP')
        hl = pk.vmath(ng, 'SCALE', base, scale=pk.math_(ng, 'MULTIPLY', hk, road))
        s1 = pk.comp._vblur(ng, hl, streak_px * 0.3)
        s2 = pk.comp._vblur(ng, hl, streak_px)
        st = pk.vmath(ng, 'ADD', pk.vmath(ng, 'SCALE', s1, scale=0.45), pk.vmath(ng, 'SCALE', s2, scale=0.75))
        c = pk.vmath(ng, 'ADD', c, pk.vmath(ng, 'SCALE', st, scale=pk.math_(ng, 'MULTIPLY', road, streak)))
    if star_desat > 0:
        rl = [n for n in ng.nodes if n.bl_idname == 'CompositorNodeRLayers'][0]
        skym = pk.maprange(ng, rl.outputs['Depth'], 400.0, 600.0, 0.0, 1.0)
        bl = pk.node(ng, 'CompositorNodeBlur')
        pk._set(ng, bl.inputs['Image'], c)
        bl.inputs['Type'].default_value = 'Gaussian'
        bl.inputs['Size'].default_value = (3.0, 3.0)
        pk._STATE['px_inputs'].append((bl.inputs['Size'], (3.0, 3.0)))
        det = pk.vmath(ng, 'SUBTRACT', c, bl.outputs['Image'])
        dl = pk.vmath(ng, 'DOT_PRODUCT', det, pk.LUMA)
        chroma = pk.vmath(ng, 'SUBTRACT', det, pk.comb_xyz(ng, dl, dl, dl))
        c = pk.vmath(ng, 'SUBTRACT', c, pk.vmath(ng, 'SCALE', chroma, scale=pk.math_(ng, 'MULTIPLY', skym, star_desat)))
    c = pk.vmath(ng, 'MAXIMUM', pk.vmath(ng, 'SUBTRACT', c, (black, black, black)), (0, 0, 0))
    c = pk.vmath(ng, 'SCALE', c, scale=1.0 / (1.0 - black))
    ng.links.new(c, outn.inputs[0])


def debug_report(ctx, pts):
    from bpy_extras.object_utils import world_to_camera_view
    sc = ctx.scene
    cam = ctx.camera
    for t in np.arange(0.0, 14.01, 1.0):
        f = ctx.t2f(float(t))
        sc.frame_set(int(f))
        row = []
        for k, p in pts.items():
            v = world_to_camera_view(sc, cam, p)
            row.append('%s(%.2f,%.2f,%.0fm)' % (k, v.x, v.y, v.z))
        pk.log('t=%4.1f s=%5.1f hd=%5.1f %s' % (t, ctx.s_of_t(float(t)), ctx.path.heading(ctx.s_of_t(float(t)) + 5), '  '.join(row)))


pk.main(SLUG, build)
