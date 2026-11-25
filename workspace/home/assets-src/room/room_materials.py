"""Materials for the room. All procedural, or driven by images painted by make_textures.py."""
import math
import os

import bpy

from room_lib import (L, N, emission, image, math_node, mix_rgb, new_mat, principled, ramp, rgba, set_p, tex_node,
                      vmath)

# palette (linear approximations of ROOM.md colours)
VIOLET = (0.20, 0.075, 1.0)
CYAN = (0.02, 0.75, 0.64)
AURORA = (0.04, 0.87, 0.38)
AMBER = (1.0, 0.46, 0.14)
WARM = (1.0, 0.62, 0.34)
INK = (0.84, 0.81, 0.75)


def _tc(nt, x=-1200, y=0):
    return N(nt, 'ShaderNodeTexCoord', x, y)


def stone(name, base_dark, base_light, vein_col, rough, vein_scale=0.55, tiles=True, coat=0.0, seed=0.0,
          vein_contrast=1.0):
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    obj = tc.outputs['Object']
    cloud = N(nt, 'ShaderNodeTexNoise', -900, 300, Vector=obj, Scale=0.9, Detail=6.0, Roughness=0.6, W=seed,
              p_noise_dimensions='4D')
    base = mix_rgb(nt, cloud.outputs['Factor'], base_dark, base_light)
    wave = N(nt, 'ShaderNodeTexWave', -900, 0, Vector=obj, Scale=vein_scale, Distortion=9.0, Detail=7.0,
             Detail_Scale=1.4, Detail_Roughness=0.62, p_wave_type='BANDS', p_bands_direction='DIAGONAL')
    v1 = N(nt, 'ShaderNodeMapRange', -700, 0)
    L(nt, wave.outputs['Factor'], v1.inputs[0])
    v1.inputs[1].default_value = 0.90
    v1.inputs[2].default_value = 1.0
    wave2 = N(nt, 'ShaderNodeTexWave', -900, -250, Vector=obj, Scale=vein_scale * 2.7, Distortion=14.0, Detail=5.0,
              Detail_Scale=2.0, Detail_Roughness=0.6, Phase_Offset=1.3, p_wave_type='BANDS',
              p_bands_direction='Y')
    v2 = N(nt, 'ShaderNodeMapRange', -700, -250)
    L(nt, wave2.outputs['Factor'], v2.inputs[0])
    v2.inputs[1].default_value = 0.955
    v2.inputs[2].default_value = 1.0
    vein = math_node(nt, 'ADD', math_node(nt, 'POWER', v1.outputs[0], 2.0),
                     math_node(nt, 'MULTIPLY', math_node(nt, 'POWER', v2.outputs[0], 2.0), 0.45), clamp=True)
    col = mix_rgb(nt, math_node(nt, 'MULTIPLY', vein, vein_contrast), base, vein_col)
    rough_n = N(nt, 'ShaderNodeTexNoise', -900, -500, Vector=obj, Scale=3.0, Detail=4.0)
    rgh = math_node(nt, 'MULTIPLY_ADD', rough_n.outputs['Factor'], rough, rough * 0.4)
    if tiles:
        br = N(nt, 'ShaderNodeTexBrick', -900, 600, Vector=obj, Scale=1.0, Mortar_Size=0.0035, Mortar_Smooth=0.2,
               Bias=0.0, Brick_Width=1.2, Row_Height=1.2, Color1=(0.80, 0.80, 0.80, 1), Color2=(1, 1, 1, 1),
               Mortar=(0, 0, 0, 1), p_offset=0.5, p_squash=1.0)
        col = mix_rgb(nt, 1.0, col, br.outputs['Color'], 'MULTIPLY')
        col = mix_rgb(nt, br.outputs['Factor'], col, (0.004, 0.004, 0.005))
        rgh = mix_rgb(nt, br.outputs['Factor'], rgh, (0.6, 0.6, 0.6))
        bump = N(nt, 'ShaderNodeBump', -300, -600, Strength=0.25, Distance=0.002)
        L(nt, math_node(nt, 'SUBTRACT', 1.0, br.outputs['Factor']), bump.inputs['Height'])
        L(nt, bump.outputs[0], p.inputs['Normal'])
    L(nt, col, p.inputs['Base Color'])
    L(nt, rgh, p.inputs['Roughness'])
    set_p(nt, p, spec=0.6, coat=coat, coat_rough=0.03)
    return m


def floor_stone(name, base_dark, base_light, vein_col, tile=1.2, mortar=0.0035, rough_lo=0.08, rough_hi=0.25,
                vein_scale=0.6, coat=0.3, coat_rough=0.10):
    """Polished dark stone tiles, 1.2 m, half-bond rows. Every tile has its own random offset and rotation of
    the vein space (tile id -> white noise), so no two tiles repeat. Veins are broad, dim and grey-violet.
    Roughness wanders between rough_lo and rough_hi (noise, scale 4) so reflections blur and break up; a
    faint coat keeps a polished highlight; a very low broad bump makes the reflections waver like real tiles."""
    m, nt, p, out = new_mat(name)
    tc = _tc(nt, -2200, 0)
    obj = tc.outputs['Object']
    sep = N(nt, 'ShaderNodeSeparateXYZ', -2000, 0)
    L(nt, obj, sep.inputs[0])
    x, y = sep.outputs['X'], sep.outputs['Y']
    row = math_node(nt, 'FLOOR', math_node(nt, 'DIVIDE', y, tile))
    shift = math_node(nt, 'MULTIPLY', math_node(nt, 'FLOORED_MODULO', row, 2.0), 0.5 * tile)
    xs = math_node(nt, 'ADD', x, shift)
    col_i = math_node(nt, 'FLOOR', math_node(nt, 'DIVIDE', xs, tile))
    fx = math_node(nt, 'FRACT', math_node(nt, 'DIVIDE', xs, tile))
    fy = math_node(nt, 'FRACT', math_node(nt, 'DIVIDE', y, tile))
    ex = math_node(nt, 'MINIMUM', fx, math_node(nt, 'SUBTRACT', 1.0, fx))
    ey = math_node(nt, 'MINIMUM', fy, math_node(nt, 'SUBTRACT', 1.0, fy))
    edge = math_node(nt, 'MULTIPLY', math_node(nt, 'MINIMUM', ex, ey), tile)   # metres to the nearest joint
    mr = N(nt, 'ShaderNodeMapRange', -1300, 600, Value=edge, From_Min=mortar * 0.35, From_Max=mortar)
    joint = math_node(nt, 'SUBTRACT', 1.0, mr.outputs[0])                    # 1 in the joint
    tid = N(nt, 'ShaderNodeCombineXYZ', -1500, 300)
    L(nt, col_i, tid.inputs[0])
    L(nt, row, tid.inputs[1])
    tid.inputs[2].default_value = 4.0
    wn = N(nt, 'ShaderNodeTexWhiteNoise', -1300, 300, Vector=tid.outputs[0])
    rot = N(nt, 'ShaderNodeCombineXYZ', -1100, 200)
    L(nt, math_node(nt, 'MULTIPLY', wn.outputs['Value'], 6.2832), rot.inputs[2])
    loc = vmath(nt, 'SCALE', wn.outputs['Color'])
    loc.inputs['Scale'].default_value = 37.0
    mp = N(nt, 'ShaderNodeMapping', -900, 0, Vector=obj)
    L(nt, loc.outputs[0], mp.inputs['Location'])
    L(nt, rot.outputs[0], mp.inputs['Rotation'])
    vec = mp.outputs[0]
    # base: soft clouds plus a small per-tile tone shift
    cloud = N(nt, 'ShaderNodeTexNoise', -700, 400, Vector=vec, Scale=0.9, Detail=6.0, Roughness=0.6)
    tone = math_node(nt, 'ADD', cloud.outputs['Factor'], math_node(nt, 'MULTIPLY', math_node(
        nt, 'SUBTRACT', wn.outputs['Value'], 0.5), 0.35), clamp=True)
    base = mix_rgb(nt, tone, base_dark, base_light)
    # veins: one broad meandering family plus a fainter finer one, in the tile's own rotated space
    wave = N(nt, 'ShaderNodeTexWave', -700, 0, Vector=vec, Scale=vein_scale, Distortion=7.0, Detail=6.0,
             Detail_Scale=1.2, Detail_Roughness=0.58, p_wave_type='BANDS', p_bands_direction='DIAGONAL')
    v1 = N(nt, 'ShaderNodeMapRange', -500, 0, Value=wave.outputs['Factor'], From_Min=0.86, From_Max=1.0)
    wave2 = N(nt, 'ShaderNodeTexWave', -700, -250, Vector=vec, Scale=vein_scale * 2.2, Distortion=11.0, Detail=4.0,
              Detail_Scale=1.6, Detail_Roughness=0.55, Phase_Offset=1.3, p_wave_type='BANDS',
              p_bands_direction='Y')
    v2 = N(nt, 'ShaderNodeMapRange', -500, -250, Value=wave2.outputs['Factor'], From_Min=0.93, From_Max=1.0)
    soft = N(nt, 'ShaderNodeTexNoise', -700, -450, Vector=vec, Scale=2.2, Detail=3.0)
    fade = N(nt, 'ShaderNodeMapRange', -500, -450, Value=soft.outputs['Factor'], From_Min=0.35, From_Max=0.65)
    vein = math_node(nt, 'MULTIPLY', math_node(nt, 'ADD', math_node(nt, 'POWER', v1.outputs[0], 1.6),
                                               math_node(nt, 'MULTIPLY', math_node(nt, 'POWER', v2.outputs[0], 2.0),
                                                         0.4)), fade.outputs[0], clamp=True)
    col = mix_rgb(nt, math_node(nt, 'MULTIPLY', vein, 0.85), base, vein_col)
    col = mix_rgb(nt, joint, col, (0.003, 0.003, 0.004))
    L(nt, col, p.inputs['Base Color'])
    # roughness: 0.08..0.25 from noise (scale 4), joints matte
    rn = N(nt, 'ShaderNodeTexNoise', -700, -700, Vector=obj, Scale=4.0, Detail=5.0, Roughness=0.55)
    rr = N(nt, 'ShaderNodeMapRange', -500, -700, Value=rn.outputs['Factor'], From_Min=0.30, From_Max=0.70,
           To_Min=rough_lo, To_Max=rough_hi)
    rgh = math_node(nt, 'MAXIMUM', rr.outputs[0], math_node(nt, 'MULTIPLY', joint, 0.65))
    L(nt, rgh, p.inputs['Roughness'])
    # joints recessed; a broad low undulation so mirror images waver
    und = N(nt, 'ShaderNodeTexNoise', -700, -950, Vector=obj, Scale=1.7, Detail=2.0)
    hgt = math_node(nt, 'ADD', math_node(nt, 'MULTIPLY', mr.outputs[0], 1.0),
                    math_node(nt, 'MULTIPLY', und.outputs['Factor'], 0.6))
    bump = N(nt, 'ShaderNodeBump', -300, -800, Strength=0.22, Distance=0.002)
    L(nt, hgt, bump.inputs['Height'])
    L(nt, bump.outputs[0], p.inputs['Normal'])
    set_p(nt, p, spec=0.5, coat=coat, coat_rough=coat_rough)
    return m


def brass(name, patina=0.35, engraved=False, rough=0.30, base=(0.60, 0.38, 0.11), ao_amt=0.2, rough_var=0.07,
          ticks=(144.0, 24.0)):
    """Worked brass: fully metallic, roughness wandering about `rough` (+-rough_var) with a broad and a fine
    noise, crevices (AO) about 20% darker and pulled toward olive, low-frequency tone variation, and with
    engraved=True a graduated scale (minor/major ticks around the ring's U) cut in as dark grooves."""
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    ao = N(nt, 'ShaderNodeAmbientOcclusion', -900, 300, Distance=0.012)
    occ = math_node(nt, 'SUBTRACT', 1.0, ao.outputs['AO'])
    nz = N(nt, 'ShaderNodeTexNoise', -900, 0, Vector=tc.outputs['Object'], Scale=60.0, Detail=6.0, Roughness=0.65)
    broad = N(nt, 'ShaderNodeTexNoise', -900, -150, Vector=tc.outputs['Object'], Scale=9.0, Detail=3.0)
    # tone: +-8% brightness from broad noise, darker olive in crevices, a little patina from the fine noise
    olive = (base[0] * 0.62, base[1] * 0.70, base[2] * 0.55)
    tone = mix_rgb(nt, math_node(nt, 'MULTIPLY', broad.outputs['Factor'], 1.0), tuple(c * 0.90 for c in base),
                   tuple(min(1.0, c * 1.08) for c in base))
    cav = math_node(nt, 'MULTIPLY', math_node(nt, 'ADD', math_node(nt, 'MULTIPLY', occ, ao_amt * 5.0),
                                              math_node(nt, 'MULTIPLY', math_node(
                                                  nt, 'SUBTRACT', nz.outputs['Factor'], 0.5), patina)), 1.0,
                    clamp=True)
    col = mix_rgb(nt, cav, tone, olive)
    pat = cav
    if engraved:
        uv = N(nt, 'ShaderNodeSeparateXYZ', -900, -300)
        L(nt, tc.outputs['UV'], uv.inputs[0])
        u = uv.outputs['X']
        minor = math_node(nt, 'LESS_THAN', math_node(nt, 'FRACT', math_node(nt, 'MULTIPLY', u, ticks[0])), 0.16)
        major = math_node(nt, 'LESS_THAN', math_node(nt, 'FRACT', math_node(nt, 'MULTIPLY', u, ticks[1])), 0.06)
        tick = math_node(nt, 'MAXIMUM', math_node(nt, 'MULTIPLY', minor, 0.7), major)
        col = mix_rgb(nt, math_node(nt, 'MULTIPLY', tick, 0.92), col, (0.025, 0.020, 0.009))
        pat = math_node(nt, 'MAXIMUM', pat, math_node(nt, 'MULTIPLY', tick, 0.6))
        bump = N(nt, 'ShaderNodeBump', -300, -400, Strength=1.0, Distance=0.0006)
        L(nt, math_node(nt, 'SUBTRACT', 1.0, tick), bump.inputs['Height'])
        L(nt, bump.outputs[0], p.inputs['Normal'])
    L(nt, col, p.inputs['Base Color'])
    L(nt, math_node(nt, 'MULTIPLY_ADD', pat, -0.35, 1.0), p.inputs['Metallic'])
    rg = math_node(nt, 'ADD', rough - rough_var, math_node(nt, 'MULTIPLY', math_node(
        nt, 'ADD', math_node(nt, 'MULTIPLY', broad.outputs['Factor'], 1.2), math_node(nt, 'MULTIPLY', nz.outputs[
            'Factor'], 0.8)), rough_var))
    L(nt, math_node(nt, 'MULTIPLY_ADD', pat, 0.25, rg), p.inputs['Roughness'])
    return m


def plush(name, color, fuzz=1.0):
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    nz = N(nt, 'ShaderNodeTexNoise', -900, 0, Vector=tc.outputs['Object'], Scale=900.0, Detail=2.0)
    big = N(nt, 'ShaderNodeTexNoise', -900, 300, Vector=tc.outputs['Object'], Scale=18.0, Detail=3.0)
    col = mix_rgb(nt, math_node(nt, 'MULTIPLY', big.outputs['Factor'], 0.25), color,
                  tuple(c * 0.82 for c in color))
    # velvet rim: fibres seen edge-on catch light, so silhouettes go lighter and softer
    lw = N(nt, 'ShaderNodeLayerWeight', -700, 500, Blend=0.45)
    rim = math_node(nt, 'MULTIPLY', math_node(nt, 'POWER', lw.outputs['Facing'], 2.0), 0.55)
    col = mix_rgb(nt, rim, col, tuple(min(1.0, c * 1.7 + 0.04) for c in color))
    L(nt, col, p.inputs['Base Color'])
    fib = N(nt, 'ShaderNodeTexNoise', -900, -300, Vector=tc.outputs['Object'], Scale=2400.0, Detail=1.0)
    hgt = math_node(nt, 'ADD', nz.outputs['Factor'], math_node(nt, 'MULTIPLY', fib.outputs['Factor'], 0.6))
    bump = N(nt, 'ShaderNodeBump', -300, -300, Strength=0.45 * fuzz, Distance=0.0015)
    L(nt, hgt, bump.inputs['Height'])
    L(nt, bump.outputs[0], p.inputs['Normal'])
    set_p(nt, p, rough=0.95, sheen=0.75 * fuzz, sheen_rough=0.35, sheen_tint=(1, 1, 1), sss=0.08,
          sss_radius=(0.02, 0.015, 0.01), spec=0.15)
    return m


def screen(name, path, strength):
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    t = tex_node(nt, image(path), tc.outputs['UV'], interp='Cubic', ext='EXTEND')
    # matte anti-glare glass: weak, blurred reflections (no ghost shapes of desk objects on the screens)
    set_p(nt, p, rough=0.32, spec=0.1)
    p.inputs['Base Color'].default_value = (0.002, 0.002, 0.003, 1)
    L(nt, t.outputs['Color'], p.inputs['Emission Color'])
    p.inputs['Emission Strength'].default_value = strength
    return m


def image_emissive(name, path, strength, base_mult=0.0, rough=0.5):
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    t = tex_node(nt, image(path), tc.outputs['UV'])
    L(nt, t.outputs['Color'], p.inputs['Emission Color'])
    p.inputs['Emission Strength'].default_value = strength
    if base_mult > 0:
        L(nt, t.outputs['Color'], p.inputs['Base Color'])
    else:
        p.inputs['Base Color'].default_value = (0.01, 0.01, 0.014, 1)
    set_p(nt, p, rough=rough)
    return m


def image_diffuse(name, path, rough=0.6, sheen=0.0, bump=0.0, coat=0.0):
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    t = tex_node(nt, image(path), tc.outputs['UV'])
    L(nt, t.outputs['Color'], p.inputs['Base Color'])
    set_p(nt, p, rough=rough, sheen=sheen, coat=coat, coat_rough=0.2)
    if bump > 0:
        b = N(nt, 'ShaderNodeBump', -300, -300, Strength=bump, Distance=0.001)
        L(nt, math_node(nt, 'MULTIPLY', t.outputs['Color'], 1.0), b.inputs['Height'])
        L(nt, b.outputs[0], p.inputs['Normal'])
    return m


def glass(name, color=(1, 1, 1), rough=0.0, ior=1.45):
    return principled(name, color, rough=rough, trans=1.0, ior=ior, spec=0.5)


def window_glass(name, refl=0.55, base=0.035, rough=0.015, tint=(0.93, 0.96, 0.97)):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.bl_idname != 'ShaderNodeOutputMaterial':
            nt.nodes.remove(n)
    out = nt.nodes['Material Output']
    tr = N(nt, 'ShaderNodeBsdfTransparent', -400, 100, Color=rgba(tint))
    tr.name = 'Glass_Transmit'
    gl = N(nt, 'ShaderNodeBsdfGlossy', -400, -100, Color=(1, 1, 1, 1), Roughness=rough)
    lw = N(nt, 'ShaderNodeLayerWeight', -600, 300, Blend=0.12)
    fac = math_node(nt, 'MULTIPLY_ADD', lw.outputs['Fresnel'], refl, base)
    fac.node.name = 'Glass_Refl'   # render_room.py scales its inputs per shot (refl, base)
    mx = N(nt, 'ShaderNodeMixShader', -200, 0)
    L(nt, fac, mx.inputs[0])
    L(nt, tr.outputs[0], mx.inputs[1])
    L(nt, gl.outputs[0], mx.inputs[2])
    L(nt, mx.outputs[0], out.inputs['Surface'])
    return m


def wood(name, dark=(0.030, 0.018, 0.012), light=(0.070, 0.042, 0.026), rough=0.38, scale=1.0, coat=0.3):
    """Walnut-like grain: noise stretched along X (fine streaks), low contrast, light clear coat."""
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    mp = N(nt, 'ShaderNodeMapping', -1000, 0, Vector=tc.outputs['Object'], Scale=(1.5 * scale, 40.0 * scale,
                                                                                  40.0 * scale))
    g = N(nt, 'ShaderNodeTexNoise', -800, 0, Vector=mp.outputs[0], Scale=1.2, Detail=8.0, Roughness=0.62,
          Distortion=0.6)
    fig = N(nt, 'ShaderNodeTexNoise', -800, -250, Vector=tc.outputs['Object'], Scale=3.0, Detail=3.0)
    f = math_node(nt, 'MULTIPLY_ADD', fig.outputs['Factor'], 0.35, math_node(nt, 'MULTIPLY', g.outputs['Factor'], 0.65))
    col = ramp(nt, f, [(0.30, dark), (0.70, light)])
    L(nt, col, p.inputs['Base Color'])
    b = N(nt, 'ShaderNodeBump', -300, -300, Strength=0.08, Distance=0.001)
    L(nt, g.outputs['Factor'], b.inputs['Height'])
    L(nt, b.outputs[0], p.inputs['Normal'])
    set_p(nt, p, rough=rough, coat=coat, coat_rough=0.12)
    return m


def leaf(name, dark, light, trans=0.18, vein_amt=0.45):
    m, nt, p, out = new_mat(name)
    geo = N(nt, 'ShaderNodeNewGeometry', -1100, 300)
    tc = _tc(nt, -1100, -100)
    col = ramp(nt, geo.outputs['Random Per Island'], [(0.0, dark), (1.0, light)])
    sep = N(nt, 'ShaderNodeSeparateXYZ', -900, -100)
    L(nt, tc.outputs['UV'], sep.inputs[0])
    u, v = sep.outputs['X'], sep.outputs['Y']
    du = math_node(nt, 'ABSOLUTE', math_node(nt, 'SUBTRACT', u, 0.5))
    mid = math_node(nt, 'LESS_THAN', du, 0.018)
    side = math_node(nt, 'LESS_THAN', math_node(nt, 'ABSOLUTE', math_node(nt, 'SUBTRACT', math_node(
        nt, 'FRACT', math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', v, math_node(nt, 'MULTIPLY', du, 0.9)), 9.0)),
        0.5)), 0.035)
    veins = math_node(nt, 'MAXIMUM', mid, math_node(nt, 'MULTIPLY', side, 0.6))
    col2 = mix_rgb(nt, math_node(nt, 'MULTIPLY', veins, vein_amt), col, tuple(min(1, c * 2.2) for c in light))
    # margins a little darker than the blade centre
    col2 = mix_rgb(nt, math_node(nt, 'MULTIPLY', math_node(nt, 'POWER', math_node(nt, 'MULTIPLY', du, 2.0), 3.0), 0.35),
                   col2, tuple(c * 0.55 for c in dark))
    L(nt, col2, p.inputs['Base Color'])
    bump = N(nt, 'ShaderNodeBump', -300, -400, Strength=0.25, Distance=0.002)
    L(nt, math_node(nt, 'SUBTRACT', 1.0, veins), bump.inputs['Height'])
    L(nt, bump.outputs[0], p.inputs['Normal'])
    set_p(nt, p, rough=0.42, coat=0.35, coat_rough=0.25, sss=0.0, spec=0.45)
    # thin-leaf translucency
    tr = N(nt, 'ShaderNodeBsdfTranslucent', -100, -500, Color=rgba(tuple(min(1, c * 1.6) for c in light)))
    mx = N(nt, 'ShaderNodeMixShader', 200, 0)
    mx.inputs[0].default_value = trans
    L(nt, p.outputs[0], mx.inputs[1])
    L(nt, tr.outputs[0], mx.inputs[2])
    L(nt, mx.outputs[0], out.inputs['Surface'])
    return m


SEA_Z = -36.0
HAZE = (0.0030, 0.0026, 0.0190)   # indigo #1b1750, dimmed to night level


def _haze(nt, k, z_scale=700.0, x=-1500, y=700):
    """Aerial perspective factor 0..1 from world distance to the room (and thicker near the sea)."""
    geo = N(nt, 'ShaderNodeNewGeometry', x, y)
    sep = N(nt, 'ShaderNodeSeparateXYZ', x + 200, y)
    L(nt, geo.outputs['Position'], sep.inputs[0])
    xy = N(nt, 'ShaderNodeCombineXYZ', x + 400, y)
    L(nt, sep.outputs['X'], xy.inputs[0])
    L(nt, sep.outputs['Y'], xy.inputs[1])
    d = vmath(nt, 'LENGTH', xy.outputs[0]).outputs['Value']
    hz = math_node(nt, 'SUBTRACT', 1.0, math_node(nt, 'EXPONENT', math_node(nt, 'DIVIDE', d, -k)))
    zf = math_node(nt, 'EXPONENT', math_node(nt, 'DIVIDE', math_node(nt, 'SUBTRACT', sep.outputs['Z'], SEA_Z),
                                              -z_scale))
    return math_node(nt, 'MULTIPLY', hz, math_node(nt, 'MULTIPLY_ADD', zf, 0.4, 0.6))


def _add_emission(nt, p, out, color_sock_or_val, strength_sock):
    e = N(nt, 'ShaderNodeEmission', 0, -400)
    if isinstance(color_sock_or_val, bpy.types.NodeSocket):
        L(nt, color_sock_or_val, e.inputs['Color'])
    else:
        e.inputs['Color'].default_value = rgba(color_sock_or_val)
    L(nt, strength_sock, e.inputs['Strength'])
    add = N(nt, 'ShaderNodeAddShader', 250, 0)
    L(nt, p.outputs[0], add.inputs[0])
    L(nt, e.outputs[0], add.inputs[1])
    L(nt, add.outputs[0], out.inputs['Surface'])


def tower_facade(name, seed=0.0, lit=0.26, haze_k=9000.0, gain=0.95):
    """Dark glass towers: a window grid with 20-30% lit (warm and cool mixed), dark floor bands, fading
    into an indigo haze with distance."""
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    sep = N(nt, 'ShaderNodeSeparateXYZ', -1000, 0)
    L(nt, tc.outputs['Object'], sep.inputs[0])
    x, y, z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    h = math_node(nt, 'ADD', x, y)
    fl = math_node(nt, 'DIVIDE', z, 3.6)
    cl = math_node(nt, 'DIVIDE', h, 2.8)
    cell = N(nt, 'ShaderNodeCombineXYZ', -700, 200)
    L(nt, math_node(nt, 'FLOOR', cl), cell.inputs[0])
    L(nt, math_node(nt, 'FLOOR', fl), cell.inputs[1])
    cell.inputs[2].default_value = seed
    wn = N(nt, 'ShaderNodeTexWhiteNoise', -500, 200, Vector=cell.outputs[0])
    # whole floors dark or busy (bands of ~4 floors)
    band = N(nt, 'ShaderNodeCombineXYZ', -700, 450)
    L(nt, math_node(nt, 'FLOOR', math_node(nt, 'DIVIDE', z, 14.0)), band.inputs[0])
    L(nt, math_node(nt, 'FLOOR', math_node(nt, 'DIVIDE', h, 60.0)), band.inputs[1])
    band.inputs[2].default_value = seed + 3.0
    bn = N(nt, 'ShaderNodeTexWhiteNoise', -500, 450, Vector=band.outputs[0])
    occ = math_node(nt, 'MULTIPLY_ADD', bn.outputs['Value'], 2.0 * lit, 0.0)  # per-band lit fraction
    lit_m = math_node(nt, 'LESS_THAN', wn.outputs['Value'], occ)
    fx = math_node(nt, 'FRACT', cl)
    fy = math_node(nt, 'FRACT', fl)
    mx = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', fx, 0.16), math_node(nt, 'LESS_THAN', fx, 0.84))
    my = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', fy, 0.20), math_node(nt, 'LESS_THAN', fy, 0.82))
    win = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', mx, my), lit_m)
    tint = ramp(nt, wn.outputs['Color'], [(0.0, (1.0, 0.58, 0.26)), (0.5, (1.0, 0.82, 0.58)),
                                         (0.68, (0.55, 0.78, 1.0)), (1.0, (0.72, 0.55, 1.0))])
    bright = math_node(nt, 'MULTIPLY_ADD', math_node(nt, 'FRACT', math_node(nt, 'MULTIPLY', wn.outputs['Value'], 7.0)),
                       1.5, 0.6)
    hz = _haze(nt, haze_k)
    # some towers are mostly dark at 3 a.m.
    tw = N(nt, 'ShaderNodeTexWhiteNoise', -500, 700, Vector=math_node(nt, 'ADD', math_node(
        nt, 'FLOOR', math_node(nt, 'DIVIDE', h, 45.0)), seed))
    keep = math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', 1.0, hz),
                     math_node(nt, 'MULTIPLY_ADD', tw.outputs['Value'], 0.75, 0.25))
    L(nt, tint, p.inputs['Emission Color'])
    L(nt, math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', win, math_node(nt, 'MULTIPLY', bright, gain)), keep),
      p.inputs['Emission Strength'])
    set_p(nt, p, rough=0.3, metal=0.2, spec=0.5)
    p.inputs['Base Color'].default_value = (0.010, 0.012, 0.020, 1)
    _add_emission(nt, p, out, HAZE, math_node(nt, 'MULTIPLY', hz, 1.0))
    return m


def far_haze(name, base, k, snow=False, haze_gain=1.0):
    """Terrain at night: near-black, fading into indigo haze with distance; optional snow toward the top of
    mountain cards (their UV v is the height fraction)."""
    m, nt, p, out = new_mat(name)
    hz = _haze(nt, k)
    keep = math_node(nt, 'SUBTRACT', 1.0, hz)
    set_p(nt, p, rough=0.95, spec=0.2)
    if snow:
        tc = _tc(nt, -1500, -300)
        sep = N(nt, 'ShaderNodeSeparateXYZ', -1300, -300)
        L(nt, tc.outputs['UV'], sep.inputs[0])
        nz = N(nt, 'ShaderNodeTexNoise', -1300, -600, Vector=tc.outputs['Object'], Scale=0.004, Detail=8.0,
               Roughness=0.7)
        nz2 = N(nt, 'ShaderNodeTexNoise', -1300, -800, Vector=tc.outputs['Object'], Scale=0.02, Detail=4.0)
        hv = math_node(nt, 'ADD', sep.outputs['Y'], math_node(nt, 'MULTIPLY', math_node(
            nt, 'SUBTRACT', nz.outputs['Factor'], 0.5), 0.7))
        sm = math_node(nt, 'MULTIPLY', N(nt, 'ShaderNodeMapRange', -900, -400, Value=hv, From_Min=0.45,
                                         From_Max=0.85).outputs[0],
                       N(nt, 'ShaderNodeMapRange', -900, -650, Value=nz2.outputs['Factor'], From_Min=0.35,
                         From_Max=0.6).outputs[0])
        L(nt, mix_rgb(nt, sm, base, (0.32, 0.34, 0.40)), p.inputs['Base Color'])
        L(nt, mix_rgb(nt, sm, (0, 0, 0), (0.010, 0.013, 0.024)), p.inputs['Emission Color'])
        L(nt, keep, p.inputs['Emission Strength'])
    else:
        p.inputs['Base Color'].default_value = rgba(base)
    _add_emission(nt, p, out, HAZE, math_node(nt, 'MULTIPLY', hz, haze_gain))
    return m


def desk_surface(name):
    """Matte dark desk top (#15131f): soft pooled reflections, faint brushed grain and micro-scratches."""
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    mp = N(nt, 'ShaderNodeMapping', -1000, 0, Vector=tc.outputs['Object'], Scale=(2.0, 700.0, 700.0))
    br = N(nt, 'ShaderNodeTexNoise', -800, 0, Vector=mp.outputs[0], Scale=1.0, Detail=3.0, Roughness=0.5)
    mic = N(nt, 'ShaderNodeTexNoise', -800, -250, Vector=tc.outputs['Object'], Scale=320.0, Detail=2.0)
    big = N(nt, 'ShaderNodeTexNoise', -800, 250, Vector=tc.outputs['Object'], Scale=3.0, Detail=3.0)
    L(nt, mix_rgb(nt, math_node(nt, 'MULTIPLY', big.outputs['Factor'], 0.5), (0.0075, 0.0065, 0.0137),
                  (0.0105, 0.0092, 0.0180)), p.inputs['Base Color'])
    rg = math_node(nt, 'MULTIPLY_ADD', math_node(nt, 'ADD', br.outputs['Factor'], mic.outputs['Factor']), 0.08, 0.20)
    L(nt, rg, p.inputs['Roughness'])
    b = N(nt, 'ShaderNodeBump', -300, -300, Strength=0.05, Distance=0.0005)
    L(nt, math_node(nt, 'ADD', br.outputs['Factor'], math_node(nt, 'MULTIPLY', mic.outputs['Factor'], 0.5)),
      b.inputs['Height'])
    L(nt, b.outputs[0], p.inputs['Normal'])
    set_p(nt, p, spec=0.45, coat=0.25, coat_rough=0.14)
    return m


def ceiling_panels(name):
    """Dark ceiling with faint 1.2 m panel seams."""
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    br = N(nt, 'ShaderNodeTexBrick', -800, 0, Vector=tc.outputs['Object'], Scale=0.8333, Mortar_Size=0.006,
           Mortar_Smooth=0.3, Bias=0.0, Brick_Width=1.0, Row_Height=1.0, Color1=(1, 1, 1, 1), Color2=(1, 1, 1, 1),
           Mortar=(0, 0, 0, 1), p_offset=0.0, p_squash=1.0)
    L(nt, mix_rgb(nt, br.outputs['Factor'], (0.016, 0.015, 0.020), (0.006, 0.006, 0.008)), p.inputs['Base Color'])
    b = N(nt, 'ShaderNodeBump', -300, -300, Strength=0.4, Distance=0.003)
    L(nt, math_node(nt, 'SUBTRACT', 1.0, br.outputs['Factor']), b.inputs['Height'])
    L(nt, b.outputs[0], p.inputs['Normal'])
    set_p(nt, p, rough=0.8, spec=0.3)
    return m


def steam(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.bl_idname != 'ShaderNodeOutputMaterial':
            nt.nodes.remove(n)
    out = nt.nodes['Material Output']
    tc = _tc(nt, -900, 0)
    sep = N(nt, 'ShaderNodeSeparateXYZ', -700, 0)
    L(nt, tc.outputs['UV'], sep.inputs[0])
    fade = math_node(nt, 'MULTIPLY', math_node(nt, 'SINE', math_node(nt, 'MULTIPLY', sep.outputs['Y'], math.pi)),
                     math_node(nt, 'SINE', math_node(nt, 'MULTIPLY', sep.outputs['X'], math.pi)))
    tr = N(nt, 'ShaderNodeBsdfTransparent', -300, 100)
    em = N(nt, 'ShaderNodeEmission', -300, -100, Color=(0.85, 0.85, 1.0, 1), Strength=0.35)
    mx = N(nt, 'ShaderNodeMixShader', 0, 0)
    L(nt, math_node(nt, 'MULTIPLY', fade, 0.12), mx.inputs[0])
    L(nt, tr.outputs[0], mx.inputs[1])
    L(nt, em.outputs[0], mx.inputs[2])
    L(nt, mx.outputs[0], out.inputs['Surface'])
    return m


def sky_dome(name, path, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.bl_idname != 'ShaderNodeOutputMaterial':
            nt.nodes.remove(n)
    out = nt.nodes['Material Output']
    tc = N(nt, 'ShaderNodeTexCoord', -900, 0)
    t = tex_node(nt, image(path), tc.outputs['UV'], interp='Cubic', ext='EXTEND')
    e = N(nt, 'ShaderNodeEmission', -200, 0, Strength=strength)
    L(nt, t.outputs['Color'], e.inputs['Color'])
    L(nt, e.outputs[0], out.inputs['Surface'])
    return m


def world_sky(world, path, strength, el_min=-20.0, el_max=90.0):
    """World background = same equirect panorama (az from +X counter-clockwise, el range) for diffuse light."""
    world.use_nodes = True
    nt = world.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = N(nt, 'ShaderNodeOutputWorld', 400, 0)
    tc = N(nt, 'ShaderNodeTexCoord', -1400, 0)
    sep = N(nt, 'ShaderNodeSeparateXYZ', -1200, 0)
    L(nt, tc.outputs['Generated'], sep.inputs[0])
    x, y, z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    az = math_node(nt, 'ARCTAN2', y, x)  # -pi..pi
    u = math_node(nt, 'FRACT', math_node(nt, 'DIVIDE', az, 2 * math.pi))
    el = math_node(nt, 'DEGREES', math_node(nt, 'ARCSINE', math_node(nt, 'MINIMUM', math_node(
        nt, 'MAXIMUM', z, -1.0), 1.0)))
    v = math_node(nt, 'DIVIDE', math_node(nt, 'SUBTRACT', el, el_min), el_max - el_min)
    uv = N(nt, 'ShaderNodeCombineXYZ', -600, 0)
    L(nt, u, uv.inputs[0])
    L(nt, v, uv.inputs[1])
    t = tex_node(nt, image(path), uv.outputs[0], interp='Linear', ext='EXTEND', x=-400)
    bg = N(nt, 'ShaderNodeBackground', 100, 0, Strength=strength)
    L(nt, t.outputs['Color'], bg.inputs['Color'])
    L(nt, bg.outputs[0], out.inputs['Surface'])


def water(name):
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    mp = N(nt, 'ShaderNodeMapping', -1000, 0, Vector=tc.outputs['Object'], Scale=(1.0, 0.25, 1.0))
    nz = N(nt, 'ShaderNodeTexNoise', -800, 0, Vector=mp.outputs[0], Scale=0.08, Detail=8.0, Roughness=0.55)
    nz2 = N(nt, 'ShaderNodeTexWave', -800, -250, Vector=tc.outputs['Object'], Scale=0.012, Distortion=4.0,
            Detail=4.0, p_wave_type='BANDS', p_bands_direction='Y')
    b = N(nt, 'ShaderNodeBump', -400, -200, Strength=0.12, Distance=0.6)
    L(nt, math_node(nt, 'ADD', nz.outputs['Factor'], math_node(nt, 'MULTIPLY', nz2.outputs['Factor'], 0.5)),
      b.inputs['Height'])
    L(nt, b.outputs[0], p.inputs['Normal'])
    p.inputs['Base Color'].default_value = (0.002, 0.004, 0.007, 1)
    set_p(nt, p, rough=0.035, ior=1.33, spec=0.5)
    return m


def knit(name, color, cols=90.0, rows=120.0, depth=0.004):
    """Stockinette knit from UV: every cell is one stitch, a 'V' of two fat tilted legs; the grooves between
    legs and rows go dark. cols/rows = stitches across U / along V (set them from the piece's size so a stitch
    is ~3.5 cm wide for a chunky throw)."""
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    sep = N(nt, 'ShaderNodeSeparateXYZ', -1400, 0)
    L(nt, tc.outputs['UV'], sep.inputs[0])
    X = math_node(nt, 'MULTIPLY', sep.outputs['X'], cols)
    Y = math_node(nt, 'MULTIPLY', sep.outputs['Y'], rows)
    ax = math_node(nt, 'ABSOLUTE', math_node(nt, 'SUBTRACT', math_node(nt, 'FRACT', X), 0.5))   # 0..0.5, mirrored
    cy = math_node(nt, 'SUBTRACT', math_node(nt, 'FRACT', Y), 0.5)                              # -0.5..0.5
    # leg centre line: |x| = 0.25 + 0.30*cy (the V opens upward); lobe = 1 - (q/0.21)^2 - (cy/0.62)^2
    q = math_node(nt, 'SUBTRACT', ax, math_node(nt, 'MULTIPLY_ADD', cy, 0.30, 0.25))
    lobe = math_node(nt, 'SUBTRACT', math_node(nt, 'SUBTRACT', 1.0, math_node(
        nt, 'POWER', math_node(nt, 'DIVIDE', math_node(nt, 'ABSOLUTE', q), 0.21), 2.0)), math_node(
        nt, 'POWER', math_node(nt, 'DIVIDE', math_node(nt, 'ABSOLUTE', cy), 0.62), 2.0))
    h = math_node(nt, 'SQRT', math_node(nt, 'MAXIMUM', lobe, 0.0))
    fz = N(nt, 'ShaderNodeTexNoise', -900, -400, Vector=tc.outputs['Object'], Scale=420.0, Detail=2.0)
    hh = math_node(nt, 'ADD', h, math_node(nt, 'MULTIPLY', fz.outputs['Factor'], 0.12))
    b = N(nt, 'ShaderNodeBump', -300, -300, Strength=1.0, Distance=depth)
    L(nt, hh, b.inputs['Height'])
    L(nt, b.outputs[0], p.inputs['Normal'])
    col = mix_rgb(nt, math_node(nt, 'POWER', h, 0.6), tuple(c * 0.30 for c in color), color)
    L(nt, col, p.inputs['Base Color'])
    set_p(nt, p, rough=0.95, sheen=0.45, sheen_rough=0.45, sheen_tint=tuple(min(1.0, c * 6 + 0.1) for c in color),
          spec=0.2)
    return m


def fabric(name, color, rough=0.92, sheen=0.6, bump_scale=600.0, bump=0.15):
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    nz = N(nt, 'ShaderNodeTexNoise', -900, 0, Vector=tc.outputs['Object'], Scale=bump_scale, Detail=2.0)
    big = N(nt, 'ShaderNodeTexNoise', -900, 300, Vector=tc.outputs['Object'], Scale=6.0, Detail=3.0)
    col = mix_rgb(nt, math_node(nt, 'MULTIPLY', big.outputs['Factor'], 0.3), color, tuple(c * 0.85 for c in color))
    L(nt, col, p.inputs['Base Color'])
    b = N(nt, 'ShaderNodeBump', -300, -300, Strength=bump, Distance=0.001)
    L(nt, nz.outputs['Factor'], b.inputs['Height'])
    L(nt, b.outputs[0], p.inputs['Normal'])
    set_p(nt, p, rough=rough, sheen=sheen, sheen_rough=0.45, spec=0.3)
    return m


def rug(name, color):
    """Soft shag: mid grey-mauve, strong sheen, fibre tufts as a larger-scale shell-like bump plus fine fibres."""
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    tuft = N(nt, 'ShaderNodeTexVoronoi', -900, 0, Vector=tc.outputs['Object'], Scale=70.0, Randomness=1.0)
    fib = N(nt, 'ShaderNodeTexNoise', -900, -250, Vector=tc.outputs['Object'], Scale=900.0, Detail=2.0)
    nz2 = N(nt, 'ShaderNodeTexNoise', -900, 300, Vector=tc.outputs['Object'], Scale=6.0, Detail=3.0)
    t = math_node(nt, 'SUBTRACT', 1.0, math_node(nt, 'MULTIPLY', tuft.outputs['Distance'], 1.6), clamp=True)
    col = mix_rgb(nt, math_node(nt, 'MULTIPLY', t, 0.6), tuple(c * 0.62 for c in color), color)
    col = mix_rgb(nt, math_node(nt, 'MULTIPLY', nz2.outputs['Factor'], 0.35), col, tuple(c * 0.82 for c in color))
    L(nt, col, p.inputs['Base Color'])
    b = N(nt, 'ShaderNodeBump', -300, -300, Strength=0.55, Distance=0.006)
    L(nt, math_node(nt, 'ADD', math_node(nt, 'POWER', t, 0.7), math_node(nt, 'MULTIPLY', fib.outputs['Factor'], 0.35)),
      b.inputs['Height'])
    L(nt, b.outputs[0], p.inputs['Normal'])
    set_p(nt, p, rough=1.0, sheen=1.0, sheen_rough=0.35, sheen_tint=(0.85, 0.80, 0.95), spec=0.1)
    return m


def mesh_fabric(name, holes=0.40):
    """Chair mesh: a fine woven grid (about 3 mm cells from UV), ~60% opaque, darker where it is stretched toward
    the frame, with a faint sheen so it reads as fabric, not smoked glass."""
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    sep = N(nt, 'ShaderNodeSeparateXYZ', -1000, 0)
    L(nt, tc.outputs['UV'], sep.inputs[0])
    a = math_node(nt, 'ABSOLUTE', math_node(nt, 'SINE', math_node(nt, 'MULTIPLY', sep.outputs['X'], 520.0)))
    b = math_node(nt, 'ABSOLUTE', math_node(nt, 'SINE', math_node(nt, 'MULTIPLY', sep.outputs['Y'], 700.0)))
    hole = math_node(nt, 'MULTIPLY', math_node(nt, 'LESS_THAN', a, 0.6), math_node(nt, 'LESS_THAN', b, 0.6))
    L(nt, math_node(nt, 'SUBTRACT', 1.0, math_node(nt, 'MULTIPLY', hole, holes)), p.inputs['Alpha'])
    # coarser rib every ~2 cm so the weave is visible at desk distance
    rib = math_node(nt, 'POWER', math_node(nt, 'ABSOLUTE', math_node(
        nt, 'SINE', math_node(nt, 'MULTIPLY', sep.outputs['Y'], 90.0))), 6.0)
    edge = math_node(nt, 'MAXIMUM', math_node(nt, 'ABSOLUTE', math_node(nt, 'SUBTRACT', sep.outputs['X'], 0.5)),
                     math_node(nt, 'ABSOLUTE', math_node(nt, 'SUBTRACT', sep.outputs['Y'], 0.5)))
    col = mix_rgb(nt, math_node(nt, 'MULTIPLY', rib, 0.5), (0.020, 0.020, 0.026), (0.050, 0.050, 0.060))
    col = mix_rgb(nt, math_node(nt, 'POWER', math_node(nt, 'MULTIPLY', edge, 2.0), 4.0), col, (0.006, 0.006, 0.008))
    L(nt, col, p.inputs['Base Color'])
    bb = N(nt, 'ShaderNodeBump', -300, -300, Strength=0.4, Distance=0.001)
    L(nt, rib, bb.inputs['Height'])
    L(nt, bb.outputs[0], p.inputs['Normal'])
    set_p(nt, p, rough=0.5, sheen=0.7, sheen_rough=0.3, spec=0.4)
    return m


def grille(name):
    """Perforated graphite metal front for the compute units: hex-packed round holes, holes see dark."""
    m, nt, p, out = new_mat(name)
    tc = _tc(nt)
    mp = N(nt, 'ShaderNodeMapping', -1000, 0, Vector=tc.outputs['Object'], Scale=(1.0, 1.0, 1.1547))
    v = N(nt, 'ShaderNodeTexVoronoi', -800, 0, Vector=mp.outputs[0], Scale=180.0, Randomness=0.0)
    hole = math_node(nt, 'LESS_THAN', v.outputs['Distance'], 0.34)
    col = mix_rgb(nt, hole, (0.20, 0.205, 0.22), (0.0015, 0.0015, 0.002))
    L(nt, col, p.inputs['Base Color'])
    L(nt, math_node(nt, 'MULTIPLY_ADD', hole, 0.5, 0.32), p.inputs['Roughness'])
    L(nt, math_node(nt, 'SUBTRACT', 1.0, hole), p.inputs['Metallic'])
    b = N(nt, 'ShaderNodeBump', -300, -300, Strength=0.8, Distance=0.001)
    L(nt, math_node(nt, 'SUBTRACT', 1.0, hole), b.inputs['Height'])
    L(nt, b.outputs[0], p.inputs['Normal'])
    return m


def contact_shadow(name, strength=0.75):
    """Soft dark blob for under soft toys on the duvet (UV disc, transparent at the rim, no shadows cast)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.bl_idname != 'ShaderNodeOutputMaterial':
            nt.nodes.remove(n)
    out = nt.nodes['Material Output']
    tc = _tc(nt, -900, 0)
    d = vmath(nt, 'DISTANCE', tc.outputs['UV'], (0.5, 0.5, 0.0)).outputs['Value']
    r = math_node(nt, 'SUBTRACT', 1.0, math_node(nt, 'MULTIPLY', d, 2.0), clamp=True)
    fac = math_node(nt, 'MULTIPLY', math_node(nt, 'POWER', r, 1.8), strength)
    tr = N(nt, 'ShaderNodeBsdfTransparent', -300, 100)
    df = N(nt, 'ShaderNodeBsdfDiffuse', -300, -100, Color=(0.02, 0.018, 0.02, 1))
    mx = N(nt, 'ShaderNodeMixShader', 0, 0)
    L(nt, fac, mx.inputs[0])
    L(nt, tr.outputs[0], mx.inputs[1])
    L(nt, df.outputs[0], mx.inputs[2])
    L(nt, mx.outputs[0], out.inputs['Surface'])
    return m


def build_materials(tex):
    T = lambda n: os.path.join(tex, n)
    M = {}
    # polished dark stone: broad dim grey-violet veins (#3a3350), per-tile random vein space, rough 0.08-0.25
    M['floor'] = floor_stone('Floor_Stone', (0.0060, 0.0056, 0.0085), (0.017, 0.016, 0.023), (0.042, 0.034, 0.081))
    M['marble'] = stone('Marble_Dark', (0.004, 0.004, 0.005), (0.012, 0.011, 0.014), (0.30, 0.29, 0.30), 0.15,
                        vein_scale=2.5, tiles=False, coat=0.5, seed=3.0)
    M['marble'].node_tree.nodes['Principled BSDF'].inputs['Coat Roughness'].default_value = 0.12
    M['wall'] = fabric('Wall_Plaster', (0.020, 0.018, 0.026), rough=0.75, sheen=0.0, bump_scale=80, bump=0.08)
    M['wall_panel'] = wood('Wall_Panel', (0.010, 0.009, 0.012), (0.020, 0.016, 0.019), rough=0.7, scale=0.5,
                           coat=0.0)
    M['ceiling'] = ceiling_panels('Ceiling')
    M['frame'] = principled('Metal_Frame', (0.018, 0.018, 0.022), rough=0.32, metal=0.85)
    M['steel_dark'] = principled('Steel_Dark', (0.05, 0.05, 0.055), rough=0.28, metal=1.0)
    M['chrome'] = principled('Chrome', (0.92, 0.92, 0.94), rough=0.05, metal=1.0)
    M['alu'] = principled('Aluminium', (0.78, 0.78, 0.80), rough=0.22, metal=1.0, aniso=0.5)
    M['alu_dark'] = principled('Aluminium_Dark', (0.28, 0.28, 0.30), rough=0.3, metal=1.0, aniso=0.4)
    M['plastic_black'] = principled('Plastic_Black', (0.012, 0.012, 0.014), rough=0.42, spec=0.5)
    M['plastic_soft'] = principled('Plastic_SoftTouch', (0.016, 0.016, 0.019), rough=0.68, spec=0.35)
    M['glossy_black'] = principled('Gloss_Black', (0.006, 0.006, 0.008), rough=0.08, coat=1.0, coat_rough=0.03)
    M['rubber'] = principled('Rubber', (0.008, 0.008, 0.009), rough=0.75)
    M['desk_top'] = desk_surface('Desk_Top')
    M['desk_body'] = principled('Desk_Body', (0.020, 0.020, 0.024), rough=0.3, metal=0.6)
    M['window'] = window_glass('Window_Glass', refl=0.27, base=0.018)
    M['glass'] = glass('Glass_Clear')
    M['candle_glass'] = principled('Candle_Glass', (1.0, 0.80, 0.58), rough=0.22, trans=1.0, ior=1.5, spec=0.5)
    # rail glass: soft reflections (no sharp 'laser' copies of the ceiling strips), faint indigo tint
    M['glass_rail'] = window_glass('Glass_Rail', refl=0.30, base=0.03, rough=0.10, tint=(0.80, 0.80, 0.95))
    # worked brass (#cba55d-ish, ~15% less saturated than before): roughness 0.25-0.4 with noise, crevices ~20%
    # darker toward olive; the instrument's rings are engraved, its stand and posts a darker aged bronze
    M['brass'] = brass('Brass_Patina', patina=0.25, rough=0.30, base=(0.60, 0.38, 0.11), ao_amt=0.2)
    M['brass_engraved'] = brass('Brass_Engraved', patina=0.15, engraved=True, rough=0.27, base=(0.62, 0.40, 0.12),
                                ao_amt=0.2)
    M['brass_engraved_fine'] = brass('Brass_Engraved_Fine', patina=0.15, engraved=True, rough=0.27,
                                     base=(0.62, 0.40, 0.12), ao_amt=0.2, ticks=(360.0, 12.0))
    M['brass_dark'] = brass('Brass_Dark', patina=0.6, rough=0.38, base=(0.36, 0.25, 0.10), ao_amt=0.25)
    M['brass_polished'] = brass('Brass_Polished', patina=0.08, rough=0.22, base=(0.64, 0.42, 0.13), ao_amt=0.15,
                                rough_var=0.04)
    M['copper'] = brass('Copper', patina=0.3, rough=0.26, base=(0.70, 0.34, 0.20))
    M['dark_glass'] = principled('Dark_Glass_Globe', (0.012, 0.016, 0.03), rough=0.05, coat=1.0, coat_rough=0.02,
                                 spec=0.7)
    M['blued_steel'] = principled('Blued_Steel', (0.05, 0.06, 0.11), rough=0.22, metal=1.0)
    M['contact'] = contact_shadow('Contact_Shadow')
    M['lapis'] = principled('Lapis_Enamel', (0.010, 0.020, 0.090), rough=0.12, coat=1.0, coat_rough=0.02)
    M['wood'] = wood('Walnut')
    M['wood_light'] = wood('Oak_Dark', (0.10, 0.065, 0.04), (0.20, 0.13, 0.075), rough=0.45)
    M['fabric_sofa'] = fabric('Fabric_Sofa', (0.085, 0.085, 0.10))
    M['fabric_head'] = fabric('Fabric_Headboard', (0.035, 0.032, 0.038), sheen=0.8)
    M['duvet'] = fabric('Duvet', (0.62, 0.58, 0.55), sheen=0.45, bump_scale=300, bump=0.1)
    M['pillow'] = fabric('Pillow', (0.56, 0.53, 0.52), sheen=0.5)
    M['pillow_dark'] = fabric('Pillow_Dark', (0.11, 0.10, 0.12), sheen=0.6)
    M['cushion_violet'] = fabric('Cushion_Violet', (0.16, 0.05, 0.14), sheen=0.7)
    # chunky stockinette: ~3.5 cm stitches on the bed throw (0.9 m x ~2.3 m UV), #2a2730
    M['knit'] = knit('Knit_Throw', (0.023, 0.020, 0.030), cols=26.0, rows=78.0, depth=0.008)
    M['knit_grey'] = knit('Knit_Grey', (0.20, 0.19, 0.19), cols=30.0, rows=17.0, depth=0.007)
    M['rug'] = rug('Rug_Shag', (0.102, 0.078, 0.111))   # #5a4f5e
    M['glass_panel'] = principled('Glass_Rail_Panel', (0.93, 0.94, 0.99), rough=0.05, trans=1.0, ior=1.5, spec=0.5)
    M['mesh'] = mesh_fabric('Chair_Mesh')
    M['grille'] = grille('Rack_Grille')
    M['paper'] = principled('Paper', (0.72, 0.69, 0.62), rough=0.85)
    M['pages'] = principled('Page_Edges', (0.70, 0.66, 0.56), rough=0.9)
    M['ceramic_dark'] = principled('Ceramic_Navy', (0.014, 0.018, 0.04), rough=0.3, coat=1.0, coat_rough=0.05)
    M['ceramic_pot'] = fabric('Ceramic_Pot', (0.03, 0.029, 0.033), rough=0.55, sheen=0.0, bump_scale=200,
                              bump=0.05)
    M['ceramic_white'] = principled('Ceramic_White', (0.70, 0.68, 0.64), rough=0.25, coat=0.6)
    M['coffee'] = principled('Coffee', (0.04, 0.018, 0.006), rough=0.08)
    M['soil'] = fabric('Soil', (0.018, 0.012, 0.009), rough=1.0, sheen=0.0, bump_scale=300, bump=0.6)
    M['stem'] = principled('Stem', (0.035, 0.06, 0.02), rough=0.5)
    M['trunk'] = principled('Trunk', (0.05, 0.035, 0.022), rough=0.7)
    M['leaf'] = leaf('Leaf_Ficus', (0.010, 0.040, 0.012), (0.045, 0.13, 0.035))
    M['leaf_light'] = leaf('Leaf_Monstera', (0.012, 0.050, 0.016), (0.06, 0.17, 0.045), trans=0.3, vein_amt=0.75)
    # pothos darkened to about #2f6a3a, translucency 0.3
    M['leaf_pothos'] = leaf('Leaf_Pothos', (0.016, 0.075, 0.022), (0.034, 0.15, 0.048), trans=0.3)
    M['wax'] = principled('Candle_Wax', (0.78, 0.72, 0.62), rough=0.5, sss=0.6, sss_radius=(0.05, 0.03, 0.02))
    M['chalk'] = principled('Chalk', (0.8, 0.8, 0.78), rough=1.0)
    M['enamel_white'] = principled('Telescope_White', (0.72, 0.72, 0.74), rough=0.2, coat=0.7)
    M['lens'] = principled('Lens_Glass', (0.02, 0.03, 0.05), rough=0.02, coat=1.0, spec=1.0)
    M['eye'] = principled('Toy_Eye', (0.004, 0.004, 0.006), rough=0.06, coat=1.0, coat_rough=0.02)
    M['eye_hi'] = emission('Toy_Eye_Highlight', (1, 1, 1), 1.2)
    M['land'] = far_haze('Land_Dark', (0.006, 0.008, 0.008), 9000.0)
    M['tree'] = far_haze('Tree_Dark', (0.003, 0.005, 0.004), 9000.0)
    M['mountain'] = far_haze('Mountain', (0.006, 0.007, 0.010), 16000.0, snow=True, haze_gain=1.15)
    M['water'] = water('Sea')
    # slim towers read as dark silhouettes full of small lit windows (less haze, denser and brighter windows)
    M['tower'] = tower_facade('Tower_Facade', lit=0.28, haze_k=15000.0, gain=1.6)
    M['tower2'] = tower_facade('Tower_Facade_B', seed=7.0, lit=0.24, haze_k=15000.0, gain=1.5)
    # emitters (strength tuned in look passes)
    M['led_violet'] = emission('LED_Violet', VIOLET, 11.0)
    M['led_cyan'] = emission('LED_Cyan', CYAN, 14.0)
    M['led_amber'] = emission('LED_Amber', AMBER, 16.0)
    M['led_warm'] = emission('LED_Warm', WARM, 10.0)
    M['led_shelf'] = emission('LED_Shelf', (1.0, 0.55, 0.24), 9.0)
    M['ceiling_line'] = emission('Ceiling_Line', (0.30, 0.14, 1.0), 3.2)            # violet
    M['ceiling_line_cyan'] = emission('Ceiling_Line_Cyan', (0.03, 0.70, 0.75), 2.6)
    M['led_violet_soft'] = emission('LED_Violet_Soft', VIOLET, 3.2)   # diffused 1 cm desk edge strip
    M['cove_violet'] = emission('Cove_Violet', (0.30, 0.12, 1.0), 5.0)
    M['downlight'] = emission('Downlight', (1.0, 0.70, 0.42), 16.0)
    M['ring_light'] = emission('Ring_Light', (1.0, 0.74, 0.50), 1.1)   # #ffe7c8-ish, 75% dimmer: glows, not white-hot
    M['globe'] = principled('Globe_Opal', (0.9, 0.85, 0.8), rough=0.3, emit=(1.0, 0.56, 0.26), emit_strength=3.5)
    M['steam'] = steam('Steam')
    M['thread'] = principled('Toy_Thread', (0.02, 0.016, 0.02), rough=0.75, sheen=0.5)
    M['seam'] = principled('Toy_Seam', (0.0, 0.0, 0.0), rough=0.9)
    M['flame'] = emission('Flame', (1.0, 0.45, 0.12), 60.0)
    M['filament'] = emission('Filament', (1.0, 0.42, 0.10), 22.0)
    M['bulb'] = principled('Bulb_Glass', (1.0, 0.9, 0.8), rough=0.05, trans=1.0, ior=1.5, thin=True)
    M['status_green'] = emission('Status_Green', (0.1, 1.0, 0.35), 25.0)
    M['status_cyan'] = emission('Status_Cyan', CYAN, 25.0)
    M['status_amber'] = emission('Status_Amber', AMBER, 25.0)
    M['status_white'] = emission('Status_White', (1, 1, 1), 18.0)
    M['crystal'] = principled('Crystal_Violet', (0.35, 0.12, 0.75), rough=0.05, trans=0.9, ior=1.55,
                              emit=(0.35, 0.12, 1.0), emit_strength=0.6)
    M['cube_core'] = emission('Glass_Cube_Core', (0.45, 0.25, 1.0), 12.0)
    M['keyglow'] = emission('Key_Backlight', (0.32, 0.18, 1.0), 0.45)
    M['keycap'] = principled('Keycap_Dark', (0.008, 0.008, 0.011), rough=0.62, spec=0.18)
    # images
    M['screen_left'] = screen('Screen_Left', T('screen_left.png'), 2.4)
    M['screen_center'] = screen('Screen_Center', T('screen_center.png'), 2.4)
    M['screen_right'] = screen('Screen_Right', T('screen_right.png'), 2.4)
    M['deskmat'] = image_emissive('Desk_Mat', T('deskmat.png'), 1.6, rough=0.75)
    M['board'] = image_diffuse('Board_Chalk', T('board.png'), rough=0.88)
    M['notebook'] = image_diffuse('Notebook_Pages', T('notebook.png'), rough=0.85)
    M['cover'] = image_diffuse('Notebook_Cover', T('cover.png'), rough=0.7, sheen=0.3)
    M['spines'] = image_diffuse('Book_Spines', T('spines.png'), rough=0.55, sheen=0.15)
    M['stack'] = image_diffuse('Book_Stack', T('stack_spines.png'), rough=0.5, sheen=0.1)
    M['wallpic'] = image_emissive('Wall_Picture', T('wall_picture.png'), 0.0, base_mult=1.0, rough=0.75)
    M['wallpic'].node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = 0.15
    # the large bedroom canvas: matte oil-on-canvas (base colour only, canvas-weave bump), lit by its wall-washer
    M['canvas'] = image_diffuse('Bed_Wall_Canvas', T('wall_picture.png'), rough=0.7, bump=0.0)
    M['sky'] = sky_dome('Sky_Dome', T('sky_pano.png'), 1.0)
    return M
