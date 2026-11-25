"""Build Richard's room (Act 3 of the homepage) from an empty Blender scene.

    Blender -b --factory-startup -P build_room.py -- [--tex DIR] [--out DIR] [--no-paint] [--render all|wide,desk]
                                                    [--samples N] [--res 1600x900] [--scale 100]

Deterministic: every random choice uses a fixed seed. No downloaded assets: meshes come from bmesh code in
room_parts_a.py / room_parts_b.py, shaders are node trees in room_materials.py, and every image (sky panorama,
screens, board, notebook, desk mat, spines, wall picture) is painted by make_textures.py, which this script runs
with an external Python that has Pillow (default /opt/anaconda3/bin/python3) unless --no-paint is given.

Outputs (git-ignored): <out>/room.blend, <out>/stats.json, renders via render_room.py.

NOTES verified against Blender 5.2.1 (inspected with dir() / bl_rna inside Blender, not guessed):
- Material.use_nodes and World.use_nodes still exist but are deprecated (removal planned for 6.0); setting True is
  still needed to get a default node tree on bpy.data.materials.new().
- Principled BSDF inputs: 'Base Color', 'Metallic', 'Roughness', 'IOR', 'Alpha', 'Thin Wall' (new), 'Normal',
  'Weight', 'Diffuse Roughness', 'Subsurface Weight/Radius/Scale/IOR/Anisotropy', 'Specular IOR Level',
  'Specular Tint', 'Anisotropic', 'Anisotropic Rotation', 'Tangent', 'Transmission Weight', 'Coat Weight/
  Roughness/IOR/Tint/Normal', 'Sheen Weight/Roughness/Tint', 'Emission Color', 'Emission Strength',
  'Thin Film Thickness/IOR'.
- Texture node outputs are named 'Factor' (not 'Fac') for Noise, Wave, Brick; ColorRamp is addressed by index.
- ShaderNodeMix (data_type RGBA): colour inputs are indices 6/7, colour result is output index 2.
- Geometry node output 'Random Per Island' exists (Cycles) and is used for per-leaf colour variation.
- View transforms: 'AgX', 'Filmic', 'Khronos PBR Neutral', 'Standard'; looks are prefixed: 'AgX - Punchy',
  'AgX - Medium High Contrast', ... ('Punchy' alone is rejected).
- Cycles: device 'METAL' found as 'Apple M4 Pro (GPU - 20 cores)'; denoiser enum only offers 'OPENIMAGEDENOISE';
  scene.cycles.use_light_tree, sample_clamp_direct/indirect, use_adaptive_sampling, adaptive_threshold exist.
- Object ray visibility is Object.visible_camera / visible_diffuse / visible_glossy / visible_transmission /
  visible_volume_scatter / visible_shadow.
- bmesh.ops.create_cube/create_uvsphere/create_cone accept calc_uvs=True and return {'verts': [...]}.
- Mesh.shade_smooth()/shade_flat() exist on mesh data (no operator/context needed).
- Light data: energy, color, shape ('RECTANGLE'/'SQUARE'), size, size_y, shadow_soft_size, spot_size, spot_blend.
- node.inputs.get('W') returns None on the Noise node although a socket named 'W' exists (identifiers differ from
  display names in 5.x), so room_lib.N() falls back to matching s.name.
- Compositor in 5.x is a node group: bpy.data.node_groups.new(name, 'CompositorNodeTree'), an interface output
  socket, a NodeGroupOutput node, and scene.compositing_node_group = tree ('CompositorNodeComposite' no longer
  exists). Glare node options are menu sockets: inputs['Type'] = 'Bloom', inputs['Quality'] = 'High', plus
  'Threshold', 'Strength', 'Size' value sockets.
- Light linking: Object.light_linking.receiver_collection = <Collection> works for Cycles (used so the hidden
  armillary key light does not show up in the window glass).
- Solidify with use_even_offset spikes on collapsed faces (polar rug centre, draped cloth corners): keep it off.
- First Cycles/Metal render after a fresh start spends ~80 s compiling kernels; later renders are fast.
- glTF exporter (io_scene_gltf2 in addons_core) treats "colour socket -> Material Output" as KHR_materials_unlit;
  bpy.ops.object.bake takes uv_layer= and pass_filter=; export_meshopt_compression_enable exists.
"""
import json
import math
import os
import subprocess
import sys
import time

import bpy
from mathutils import Vector

TAU = 2 * math.pi

sys.dont_write_bytecode = True  # keep __pycache__ out of the source folder
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import room_lib as RL  # noqa: E402
import room_materials as RM  # noqa: E402
import room_parts_a as PA  # noqa: E402
import room_parts_b as PB  # noqa: E402

HOME = os.path.dirname(os.path.dirname(HERE))  # workspace/home
TEX_VERSION = '4'  # must match make_textures.TEX_VERSION (painted textures are repainted when it differs)
D = math.radians


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = {'tex': os.path.join(HOME, '_dev', 'room', 'tex'), 'out': os.path.join(HOME, '_dev', 'room'),
           'paint': True, 'render': '', 'samples': 256, 'res': '1600x900', 'scale': 100,
           'python': '/opt/anaconda3/bin/python3'}
    i = 0
    while i < len(a):
        k = a[i]
        if k == '--no-paint':
            opt['paint'] = False
        elif k in ('--tex', '--out', '--render', '--res', '--python'):
            opt[k[2:]] = a[i + 1]
            i += 1
        elif k in ('--samples', '--scale'):
            opt[k[2:]] = int(a[i + 1])
            i += 1
        i += 1
    return opt


# ------------------------------------------------------------------------------------------------
# lights (lamps that need clean illumination beyond their emissive meshes)
# ------------------------------------------------------------------------------------------------

def world_pos(name, offset=(0, 0, 0)):
    ob = bpy.data.objects[name]
    return ob.matrix_world @ Vector(offset)


def build_lights():
    C = RL.coll('Lights')
    warm = (1.0, 0.56, 0.27)
    k2700 = RL.kelvin_rgb(2700)
    bpy.context.view_layer.update()
    for side in ('Head', 'Foot', 'Mezz'):
        p = world_pos(f'Globe_Lamp_{side}_Globe')
        RL.light(f'Light_Globe_{side}', C, 'POINT', p, energy=16.0 if side != 'Mezz' else 13.0, color=warm,
                 radius=0.125)
    p = world_pos('Desk_Lamp_Bulb')
    RL.light('Light_Desk_Lamp', C, 'POINT', p, energy=6.0, color=(1.0, 0.50, 0.20), radius=0.02)
    # the armillary: a small 2700 K key spot from the upper front-right and a cool cyan rim from behind-left,
    # both light-linked to the instrument so they never show in the window glass or light anything else
    arm = world_pos('Armillary_Core')
    cam = Vector(CAMERAS['instrument'][0])
    f = (cam - arm)
    f.z = 0
    f.normalize()
    right = Vector((-f.y, f.x, 0.0))
    kp = arm + f * 0.34 + right * 0.32 + Vector((0, 0, 0.46))
    key = RL.light('Light_Instrument_Key', C, 'SPOT', kp, rot=RL.look_at_rot(kp, arm), energy=28.0, color=k2700,
                   radius=0.03, spot=D(38), blend=0.5)
    rp = arm - f * 0.40 - right * 0.34 + Vector((0, 0, 0.16))
    rim = RL.light('Light_Instrument_Rim', C, 'AREA', rp, rot=RL.look_at_rot(rp, arm), energy=10.0,
                   color=(0.020, 0.745, 0.630), size=0.30)   # #27e0d0, ~1/3 of the key's power
    # a broad warm card in front of it (seen only in its reflections) so the polished rings read as brass
    cp = arm + f * 0.75 - right * 0.25 + Vector((0, 0, 0.35))
    card = RL.light('Light_Instrument_Card', C, 'AREA', cp, rot=RL.look_at_rot(cp, arm), energy=10.0,
                    color=(1.0, 0.78, 0.55), size=0.7, size_y=0.45)
    for lt in (key, rim, card):
        lt.light_linking.receiver_collection = bpy.data.collections['Armillary_Sphere']
    # soft warm downlight on the mezzanine so its sofa, plants and telescope read from below
    RL.light('Light_Mezzanine_Down', C, 'AREA', (1.1, 6.3, 4.85), energy=40.0, color=(1.0, 0.70, 0.45), size=3.6,
             size_y=1.0, glossy=False)
    for nm in ('Table_Candle_Flame', 'Shelf_Candle_A_Flame', 'Shelf_Candle_B_Flame', 'Cabinet_Candle_Flame'):
        if nm in bpy.data.objects:
            RL.light('Light_' + nm, C, 'POINT', world_pos(nm, (0, 0, 0.006)), energy=2.4 if 'Table' in nm else 1.2,
                     color=(1.0, 0.42, 0.12), radius=0.06 if 'Table' in nm else 0.02)
    # faint warm fill on the low table's book stack (spine side)
    bs = bpy.data.objects['Book_Stack_Seven_Subjects']
    sc = bs.matrix_world @ Vector((-0.04, 0.0, 0.60))
    fp = bs.matrix_world @ Vector((-0.75, 0.25, 0.85))
    RL.light('Light_Book_Stack_Fill', C, 'AREA', fp, rot=RL.look_at_rot(fp, sc), energy=3.0, color=(1.0, 0.62, 0.36),
             size=0.35, glossy=False)
    # warm glow under the floating bed (three thin area lights facing the floor)
    x0, x1, y0, y1 = PB.BX0 - 0.06, PB.BX1, PB.BY0 - 0.06, PB.BY1
    amber = (1.0, 0.42, 0.13)
    RL.light('Light_Bed_Under_Front', C, 'AREA', ((x0 + x1) / 2, y0 + 0.02, 0.10), energy=28.0, color=amber,
             size=x1 - x0, size_y=0.06)
    RL.light('Light_Bed_Under_Foot', C, 'AREA', (x0 + 0.02, (y0 + y1) / 2, 0.10), energy=22.0, color=amber,
             size=0.06, size_y=y1 - y0)
    # warm rim behind the penguin so its dark body separates from the pillows
    pg = world_pos('Toy_Penguin_Body')
    pp = pg + Vector((0.16, 0.30, 0.22))
    RL.light('Light_Penguin_Rim', C, 'AREA', pp, rot=RL.look_at_rot(pp, pg), energy=2.5, color=(1.0, 0.55, 0.25),
             size=0.12)
    # violet (#7a4dff) rim from behind and left of the toy row (about 30% of the globe key) to cut their
    # silhouettes off the headboard and shelves; diffuse only, so it never shows as a hot spot
    tp = Vector((3.30, 6.62, 1.10))
    RL.light('Light_Toys_Rim_Violet', C, 'AREA', tp, rot=RL.look_at_rot(tp, (3.70, 6.05, 0.80)), energy=14.0,
             color=(0.20, 0.075, 1.0), size=1.4, size_y=0.25, glossy=False)
    # warm 2700 K wall-washer grazing down the big canvas above the bed
    ww = Vector((4.94, 5.48, 2.93))
    RL.light('Light_Canvas_Washer', C, 'AREA', ww, rot=RL.look_at_rot(ww, (4.995, 5.48, 2.0)), energy=22.0,
             color=k2700, size=2.3, size_y=0.05, glossy=False)
    # cool cyan rim from the window side on the foreground plant's leaves
    # (behind the plant as seen from the wide camera, so the leaves are back-lit: glowing edges, veins showing
    # through the translucent blades)
    fpp = Vector(PB.FRONT_PLANT) + Vector((-0.45, 0.95, 0.85))
    RL.light('Light_Plant_Rim_Cyan', C, 'AREA', fpp, rot=RL.look_at_rot(fpp, Vector(PB.FRONT_PLANT) + Vector((0, 0, 0.45))),
             energy=9.0, color=(0.05, 0.75, 0.80), size=0.35)
    # the shadow floor: a very dim, very large indigo (#1b1750) fill from the window side and overhead, so the
    # darkest areas sit near #0b0a14 instead of clipping to black (diffuse only: no visible reflections)
    RL.light('Light_Indigo_Fill_Window', C, 'AREA', (-4.7, 3.6, 2.6), rot=(0, D(-90), 0), energy=55.0,
             color=(0.13, 0.11, 1.0), size=6.5, size_y=4.5, glossy=False)
    RL.light('Light_Indigo_Fill_Top', C, 'AREA', (0.0, 3.5, 4.80), energy=45.0, color=(0.16, 0.13, 1.0), size=9.0,
             size_y=6.5, glossy=False)
    # warm wash from under the mezzanine edge onto the board and shelves
    RL.light('Light_Mezzanine_Wash', C, 'AREA', (1.1, 5.55, 3.0), rot=(D(38), 0, 0), energy=50.0,
             color=(1.0, 0.72, 0.48), size=4.1, size_y=0.08, glossy=False)
    # low violet spill from the floor strip in front of the compute rack, light-linked to the rack only, so the
    # perforated fronts, handles and bay seams read instead of going flat black
    rs = Vector((-3.20, 5.55, 0.10))
    rk = RL.light('Light_Rack_Spill', C, 'AREA', rs, rot=RL.look_at_rot(rs, (-3.20, 6.11, 0.40)), energy=6.0,
                  color=(0.45, 0.30, 1.0), size=1.2, size_y=0.12)
    rk.light_linking.receiver_collection = bpy.data.collections['Compute_Rack']
    # violet under-desk wash on the rack and floor
    RL.light('Light_Desk_Under', C, 'AREA', (-2.75, 6.35, 0.64), energy=18.0, color=(0.35, 0.16, 1.0), size=3.0,
             size_y=0.25, glossy=False)
    # night through the glass: dim cyan-blue from the back window and indigo-violet (city glow) from the left;
    # the sky dome lights the room as well, so these only lift the far side a little
    RL.light('Light_Aurora_Fill_Back', C, 'AREA', (-3.0, 7.6, 2.6), rot=(D(90), 0, 0), energy=12.0,
             color=(0.20, 0.55, 0.80), size=4.0, size_y=4.4, glossy=False)
    RL.light('Light_Aurora_Fill_Left', C, 'AREA', (-5.6, 3.5, 2.6), rot=(0, D(-90), 0), energy=10.0,
             color=(0.38, 0.30, 0.95), size=4.4, size_y=6.8, glossy=False)
    # violet cove wash down the back wall behind the mezzanine
    RL.light('Light_Cove_Violet', C, 'AREA', (2.0, 6.90, 4.90), rot=(D(25), 0, 0), energy=30.0,
             color=(0.32, 0.14, 1.0), size=6.0, size_y=0.05, glossy=False)
    # small warm ceiling downlights and the three under the mezzanine
    for i, (x, y) in enumerate(PA.DOWNLIGHTS):
        RL.light(f'Light_Downlight_{i + 1}', C, 'SPOT', (x, y, PA.RH - 0.03), energy=5.0 if x > 3.0 else 9.0,
                 color=(1.0, 0.70, 0.42), radius=0.03, spot=D(70), blend=0.6, glossy=False)
    for i, x in enumerate(PB.MEZZ_DOWNLIGHTS):
        RL.light(f'Light_Mezz_Downlight_{i + 1}', C, 'SPOT', (x, 5.80, 3.03), energy=6.0, color=(1.0, 0.70, 0.42),
                 radius=0.03, spot=D(75), blend=0.6, glossy=False)
    # ring light: eight small warm points around the tube so it lights the rail, the board top and the room
    cx, cy, cz, R = PB.RING
    for k in range(8):
        a = TAU * k / 8
        RL.light(f'Light_Ring_{k}', C, 'POINT', (cx + R * math.cos(a), cy + R * math.sin(a), cz - 0.05), energy=2.5,
                 color=(1.0, 0.80, 0.58), radius=0.03, glossy=False)
    # picture light: a thin warm area light under the brass hood, raking down the painting
    pl = Vector((4.16, 6.80, 4.385))
    RL.light('Light_Picture', C, 'AREA', pl, rot=RL.look_at_rot(pl, (4.16, 6.975, 3.85)), energy=5.0,
             color=(1.0, 0.70, 0.45), size=0.56, size_y=0.03, glossy=False)
    # monitor spill: soft area lights on the screen surfaces, tinted like each screen, so cyan and violet light
    # falls on the keyboard, mat, mug and notebook
    for nm, w, h, col in (('Left', PA.MON_SIDE_W, PA.MON_SIDE_H, (0.40, 0.62, 1.0)),
                          ('Center', PA.MON_C[1], PA.MON_C[2], (0.55, 0.42, 1.0)),
                          ('Right', PA.MON_SIDE_W, PA.MON_SIDE_H, (0.42, 0.52, 1.0))):
        scr = bpy.data.objects[f'Monitor_{nm}_Screen']
        mw = scr.matrix_world
        pos = mw @ Vector((0, 0, 0.02))
        n = (mw.to_3x3() @ Vector((0, 0, 1))).normalized()
        rot = RL.look_at_rot(pos, pos + n)
        RL.light(f'Light_Monitor_{nm}', C, 'AREA', pos, rot=rot, energy=12.0 * w * h / 0.34, color=col, size=w,
                 size_y=h, glossy=False)


# ------------------------------------------------------------------------------------------------
# cameras
# ------------------------------------------------------------------------------------------------
CAMERAS = {
    # name: (location, target, focal length mm, dof focus (object name or distance in m) or None, f-stop,
    #        optional lens shift (x, y))
    # wide: 0.4 m left of and 0.5 m nearer than before, tilted up 4 deg (ceiling lines), the three screens ~26% wide
    'wide': ((0.20, 0.90, 1.35), (0.73, 5.40, 1.67), 16.0, 5.4, 2.8),
    # desk: a little lower and looking ~19 deg down: monitor tops near the upper third, the skyline still clear
    # of the frame top above the lake
    'desk': ((-3.10, 4.05, 1.75), (-3.0, 6.45, 0.92), 21.0, None, 0),
    # instrument: orbited ~17 deg so the bokeh behind is monitor glow and city lights and the lamp leaves frame
    'instrument': ((-0.55, 5.92, 1.08), (-1.38, 6.40, 0.99), 38.0, 'Armillary_Core', 2.8),
    # bed: 40 cm higher, 0.8 m further back, looking down ~20 deg: toy row high in frame, globe lamp at right
    'bed': ((1.83, 3.48, 1.40), (3.95, 5.45, 0.64), 28.0, None, 0),
    # wall: lower and a little wider, so the board fills the frame with the credenza below, not the soffit
    'wall': ((1.15, 2.30, 1.70), (1.15, 6.96, 1.62), 31.0, None, 0),
}
# the office chair: rolled back from the desk and turned toward the bed, clear of the screens in the wide shot
CHAIR = (-0.12, 4.65, 128.0)


def hide_fills_from_transmission():
    """Diffuse-only fill lights must also stay invisible to transmission rays, or the big area lights show up as
    bright rectangles through the glass rail and the candle jars."""
    for ob in bpy.data.objects:
        if ob.type == 'LIGHT' and not ob.visible_glossy:
            ob.visible_transmission = False


def build_cameras():
    C = RL.coll('Cameras')
    for name, spec in CAMERAS.items():
        loc, tgt, lens, focus, fstop = spec[:5]
        cd = bpy.data.cameras.new('Cam_' + name.title())
        cd.lens = lens
        if len(spec) > 5:
            cd.shift_x, cd.shift_y = spec[5]
        cd.sensor_width = 36.0
        cd.clip_start = 0.02
        cd.clip_end = 250000.0
        ob = bpy.data.objects.new('Cam_' + name.title(), cd)
        C.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = RL.look_at_rot(loc, tgt)
        if focus:
            cd.dof.use_dof = True
            if isinstance(focus, str):
                cd.dof.focus_object = bpy.data.objects[focus]
            else:
                cd.dof.focus_distance = focus
            cd.dof.aperture_fstop = fstop
            cd.dof.aperture_blades = 7
    bpy.context.scene.camera = bpy.data.objects['Cam_Wide']


# ------------------------------------------------------------------------------------------------
# render settings
# ------------------------------------------------------------------------------------------------

def setup_render(samples=256, res='1600x900', scale=100):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = (d.type == 'METAL')
        sc.cycles.device = 'GPU'
    except Exception as e:  # fall back to CPU
        print('GPU setup failed, using CPU:', e)
        sc.cycles.device = 'CPU'
    c = sc.cycles
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.015
    c.adaptive_min_samples = 64
    c.use_denoising = True
    c.denoiser = 'OPENIMAGEDENOISE'
    c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    c.denoising_use_gpu = True
    c.use_light_tree = True
    c.max_bounces = 10
    c.diffuse_bounces = 4
    c.glossy_bounces = 4
    c.transmission_bounces = 10
    c.transparent_max_bounces = 24
    c.volume_bounces = 0
    c.sample_clamp_direct = 0.0
    c.sample_clamp_indirect = 4.0
    c.blur_glossy = 1.0
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.seed = 7
    w, h = (int(v) for v in res.split('x'))
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = scale
    sc.render.film_transparent = False
    sc.render.filter_size = 1.5
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.view_settings.exposure = 1.0
    sc.view_settings.gamma = 1.0
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '8'


VEIL = (0.0020, 0.0017, 0.0060)   # scene-linear indigo (#1b1750 direction)
GLARE = {  # (type, threshold, strength, size); Fog Glow gives the wide soft halo, Bloom the tight core glow
    'fog': ('Fog Glow', 1.0, 0.45, 0.75),
    'bloom': ('Bloom', 1.6, 0.22, 0.45),
}


def setup_compositor():
    """Fog Glow halo plus a tighter bloom around every practical light (5.x compositor: a node group assigned
    to scene.compositing_node_group; Glare options are menu/value sockets)."""
    sc = bpy.context.scene
    t = bpy.data.node_groups.new('Room_Compositor', 'CompositorNodeTree')
    t.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = t.nodes.new('CompositorNodeRLayers')
    src = rl.outputs['Image']
    for key in ('fog', 'bloom'):
        kind, thr, strength, size = GLARE[key]
        gl = t.nodes.new('CompositorNodeGlare')
        gl.name = 'Glare_' + key
        gl.inputs['Type'].default_value = kind
        gl.inputs['Quality'].default_value = 'High'
        gl.inputs['Threshold'].default_value = thr
        gl.inputs['Strength'].default_value = strength
        gl.inputs['Size'].default_value = size
        t.links.new(src, gl.inputs['Image'])
        src = gl.outputs['Image']
    # veiling glare: a real lens scatters a little light over the whole frame, so nothing is pure black; a very
    # small indigo offset in scene-linear lands the deepest shadows near #0b0a14 after the view transform
    veil = t.nodes.new('ShaderNodeMix')
    veil.name = 'Veiling_Glare'
    veil.data_type = 'RGBA'
    veil.blend_type = 'ADD'
    veil.inputs['Factor'].default_value = 1.0
    veil.inputs[7].default_value = VEIL + (1.0,)
    t.links.new(src, veil.inputs[6])
    src = veil.outputs[2]
    out = t.nodes.new('NodeGroupOutput')
    t.links.new(src, out.inputs[0])
    sc.compositing_node_group = t
    sc.render.use_compositing = True


def setup_world(tex):
    w = bpy.data.worlds.new('Night')
    bpy.context.scene.world = w
    RM.world_sky(w, os.path.join(tex, 'sky_pano.png'), 1.0)
    return w


# ------------------------------------------------------------------------------------------------
# stats
# ------------------------------------------------------------------------------------------------

def scene_stats():
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0
    tris_room = 0
    meshes = 0
    per_coll = {}
    for inst in dg.object_instances:
        ob = inst.object
        if ob.type != 'MESH':
            continue
        me = ob.data
        me.calc_loop_triangles()
        n = len(me.loop_triangles)
        tris += n
        orig = ob.original
        cname = orig.users_collection[0].name if orig.users_collection else '?'
        per_coll[cname] = per_coll.get(cname, 0) + n
        if cname != 'Outside':
            tris_room += n
        meshes += 1
    objs = len(bpy.data.objects)
    imgs = {i.name: list(i.size) for i in bpy.data.images if i.size[0] > 0}
    return {'triangles_total': tris, 'triangles_excluding_outside': tris_room, 'mesh_objects': meshes,
            'objects_total': objs, 'lights': len([o for o in bpy.data.objects if o.type == 'LIGHT']),
            'materials': len(bpy.data.materials), 'triangles_by_collection': dict(sorted(per_coll.items())),
            'images': imgs}


def main():
    opt = args()
    t0 = time.time()
    os.makedirs(opt['out'], exist_ok=True)
    if opt['paint']:
        need = ['sky_pano.png', 'screen_left.png', 'screen_center.png', 'board.png', 'spines.png']
        stamp = os.path.join(opt['tex'], 'tex_version.txt')
        current = open(stamp).read().strip() if os.path.exists(stamp) else ''
        if current != TEX_VERSION or not all(os.path.exists(os.path.join(opt['tex'], n)) for n in need):
            subprocess.check_call([opt['python'], os.path.join(HERE, 'make_textures.py'), opt['tex']])
    RL.reset_scene()
    setup_render(opt['samples'], opt['res'], opt['scale'])
    setup_world(opt['tex'])
    setup_compositor()
    M = RM.build_materials(opt['tex'])
    PA.build_architecture(M)
    PA.build_outside(M)
    PA.build_desk(M)
    PA.build_chair(M, CHAIR[:2], D(CHAIR[2]))
    PB.build_bed(M)
    PB.build_shelves(M)
    PB.build_board(M)
    PB.build_mezzanine(M)
    PB.build_lounge(M, face=CAMERAS['wide'][0][:2])
    PB.build_plants(M)
    PB.build_ring_light(M)
    build_lights()
    hide_fills_from_transmission()
    build_cameras()
    print(f'built in {time.time() - t0:.1f}s')
    st = scene_stats()
    st['build_seconds'] = round(time.time() - t0, 1)
    with open(os.path.join(opt['out'], 'stats.json'), 'w') as f:
        json.dump(st, f, indent=2)
    print(json.dumps({k: v for k, v in st.items() if k not in ('images',)}, indent=1))
    path = os.path.join(opt['out'], 'room.blend')
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print('saved', path)
    if opt['render']:
        sys.path.insert(0, HERE)
        import render_room
        render_room.render(opt['render'], opt['out'], opt['samples'], opt['res'], opt['scale'])


if __name__ == '__main__':
    main()
