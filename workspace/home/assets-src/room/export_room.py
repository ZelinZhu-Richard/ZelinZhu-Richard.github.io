"""Bake the room's lighting into lightmap atlases and export the raw room GLB that pack_room.py ships.

    Blender -b <blend> -P export_room.py -- [--out DIR] [--samples 256] [--instrument live|baked] [--uv-only]
                                            [--margin PX] [--angle DEG]   (packing experiments)

The shipping pipeline (all inside the project, nothing installed):

    Blender -b --factory-startup -P build_room.py -- --out _dev/room/ship          # room.blend (4 s)
    Blender -b _dev/room/ship/room.blend -P export_room.py                         # bake + raw GLB (~9 min)
    /opt/anaconda3/bin/python3 pack_room.py                                         # WebP + meshopt -> public/
    Blender -b --factory-startup -P preview_glb.py -- --glb public/home-assets/room/room-desktop.glb

What this script does (on a copy in memory; the .blend is not overwritten):
1. Lowers subdivision and adds Decimate modifiers per collection so the whole export lands under the triangle
   budget, then makes every mesh real in world space. With --instrument live (the default) the armillary sphere is
   left out entirely: the engine draws the instrument live (engine/instrument/), so the room is exported and baked
   WITHOUT it (no dark ghost of its shadow on the desk), and its three light-linked lights are switched off.
2. Joins meshes into named export objects: one per functional group (Architecture, Desk, Soft_Toys, ...), while the
   things the engine animates stay separate and keep their names: Monitor_<L/C/R>_Screen, every Strip_* light
   strip, Window_Glass, Globe_Lamp_*, Desk_Lamp, Ring_Light, Board, Floor (the browser gives it a planar reflection).
3. Gives each baked group a second UV layer 'Lightmap' (smart project + pack, shared per atlas). Texel density is
   weighted per source collection/object (LM_WEIGHT_*: the desk top and the things on it get more texels, the
   ceiling and the rack under the desk fewer), islands are packed with an exact pixel margin, and the atlas is
   cropped to the packed bounds (the floor fills only ~74 % of a square). The old packer used a margin that scaled
   with the islands and left 75 % of LM_Props, LM_Soft and LM_Books empty.
4. Bakes Cycles diffuse lighting (direct + indirect), albedo, glossy colour and emission per atlas and combines
   them: out = filter(L) * (A + metal * G) + E. Empty texels are then filled by push-pull from the covered ones,
   so mip levels in the browser average neighbouring islands instead of black. Atlases are saved as lossless PNG
   through the scene's view transform (AgX + exposure): display-referred, so the browser draws them unlit.
5. Bakes a soft contact shadow for the live instrument: the desk's lighting with and without the armillary on a
   small quad above the desk top, ratio blurred to a soft blob, saved as alpha; exported as the separate mesh
   'Instrument_Contact_Shadow' (material 'Contact_Shadow') that the engine fades with the instrument.
6. Swaps materials for glTF-friendly ones: baked = unlit atlas (KHR_materials_unlit), screens/board = unlit with
   their own image (full source resolution: pack_room.py sizes them), strips and lamp globes = unlit constant
   colour (name suffix `_e<strength>` and extras {"emit": strength}), glass = alpha-blended. The sky dome is not
   exported: the browser draws the live procedural sky behind the window.
7. Adds anchors (empties, extras in three's Y-up frame): Anchor_Instrument {height, radius, yaw} at the
   instrument's base on the desk, and Anchor_Monitor_Left {beat 13}, Anchor_Monitor_Center {14}, Anchor_Board
   {15}, Anchor_Bed {16}, Anchor_Window {17}, Anchor_Notebook, Anchor_Books, each with {facing, size, bounds}.
8. Exports <out>/room_raw.glb (PNG textures, no normals: everything is unlit) and <out>/export_stats.json.

_dev/room/room.glb (the export with the baked armillary that sketches/room/ loads) is NOT written by this script
any more; it is kept as it is for that viewer.
"""
import json
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True  # keep __pycache__ out of the source folder
HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.dirname(os.path.dirname(HERE))

# decimation ratio per source collection (applied after subdivision is set to `SUBSURF_EXPORT`)
# (the far coast's ~1350 conifers are sub-pixel silhouettes from the room, so 'Outside' can go low)
RATIO = {'Soft_Toys': 0.085, 'Plants': 0.18, 'Bed': 0.15, 'Lounge': 0.12, 'Armillary_Sphere': 0.36,
         'Ornaments': 0.15, 'Desk_Objects': 0.18, 'Chair': 0.35, 'Lamps': 0.25, 'Mezzanine': 0.15,
         'Outside': 0.12, 'Compute_Rack': 0.6, 'Monitors': 0.8, 'Board_Wall': 0.7, 'Light_Strips': 0.4,
         'Shelves': 0.5}
SUBSURF_EXPORT = 0
SKIP_COLLS = {'Cameras', 'Lights', 'Render_Only'}  # Render_Only: contact decals for the stills
# the sky dome is camera-only in the stills (not visible to diffuse rays, so it never lit the bake); the browser
# draws the live procedural sky instead
SKIP_NAMES = {'Sky_Dome'}
INSTRUMENT_COLL = 'Armillary_Sphere'
INSTRUMENT_LIGHTS = ('Light_Instrument_Key', 'Light_Instrument_Rim', 'Light_Instrument_Card')
OWN_IMAGE = {'Board', 'Wall_Picture', 'Desk_Mat', 'Shelf_Frame_Photo_Image',
             'Monitor_Left_Screen', 'Monitor_Center_Screen', 'Monitor_Right_Screen'}
# room shell boxes: faces whose centre lies outside the interior (x -5..5, y 0..7, z 0..5) are never seen
SHELL = {'Floor', 'Ceiling', 'Wall_Back', 'Wall_Right', 'Wall_Front'}
INTERIOR = ((-5.25, 5.0), (0.0, 7.0), (0.0, 5.0))
# groups that get an atlas of their own (story objects whose writing must stay legible, the hero, the floor)
OWN_ATLAS = {'Floor': 'LM_Floor', 'Armillary_Sphere': 'LM_Armillary', 'Books': 'LM_Books',
             'Book_Stack': 'LM_Detail', 'Notebook_Pages': 'LM_Detail'}
BOOKS = {'Books_Shelves', 'Cabinet_Book_Stack', 'Mezz_Book_Stack'}
OWN_IMAGE_GAIN = {'Board': 0.62, 'Wall_Picture': 0.7, 'Shelf_Frame_Photo_Image': 0.6, 'Desk_Mat': 1.0}
GLASS_MATS = {'Window_Glass', 'Glass_Rail', 'Glass_Clear', 'Bulb_Glass'}
# atlas for each joined group
ATLAS_OF_COLL = {'Architecture': 'LM_Room', 'Window': 'LM_Room', 'Desk': 'LM_Room', 'Shelves': 'LM_Room',
                 'Board_Wall': 'LM_Room', 'Mezzanine': 'LM_Room', 'Bed': 'LM_Soft', 'Soft_Toys': 'LM_Soft',
                 'Lounge': 'LM_Soft', 'Plants': 'LM_Soft', 'Desk_Objects': 'LM_Props', 'Compute_Rack': 'LM_Props',
                 'Monitors': 'LM_Props', 'Chair': 'LM_Props', 'Ornaments': 'LM_Props', 'Lamps': 'LM_Props',
                 'Armillary_Sphere': 'LM_Props', 'Outside': 'LM_Outside'}
# Bake size (the long side of the square before cropping to the packed bounds) = the DESKTOP size; pack_room.py
# halves every texture for phones. Chosen with the packing fixed (step 3) so the desktop set stays under ~70 MB of
# GPU memory with mipmaps. The old 2048 atlases were 50 % (room) to 75 % (props, soft, books) empty; packed with a
# 2 px margin these fill 50-66 %, so 1536/1280 hold the old density on average and the weights move texels to the
# desk (props: ~1.6x the old density on the desk objects, the rack under the desk ~0.6x).
ATLAS_SIZE = {'LM_Room': 1536, 'LM_Props': 1280, 'LM_Soft': 1280, 'LM_Floor': 1280, 'LM_Books': 768,
              'LM_Detail': 1024, 'LM_Outside': 768, 'LM_Armillary': 1024}
# gap between islands in desktop texels (half on phones); the bake extends islands into it and push-pull fills the
# rest. Thousands of the islands are 1-2 px slivers from decimation, so the margin decides the fill: 4 px left the
# room atlas 50 % covered and the props 35 %, 2 px gives 66 % and 50 %. The far outside is only ever seen at low
# mip levels: 1 px there, or its ~6800 conifer and coast islands would eat the atlas
PACK_MARGIN_PX = {'*': 2, 'LM_Outside': 1}
UV_ANGLE = 60
# Lightmap texel density weights (relative, within one atlas). By source object name first, then collection.
LM_WEIGHT_NAME = {'Ceiling': 0.35, 'Wall_Front': 0.6, 'Wall_Right': 0.8, 'Desk_Top': 2.4, 'Desk_Mat': 2.0,
                  'Desk_Cabinet': 0.8, 'Cliff_Under_Room': 1.2,
                  'Book_Stack_Seven_Subjects': 1.0, 'Notebook_Open_Pages': 1.0,   # LM_Detail: the same density
                  # LM_Outside is weighted by distance, not area: the city's lit windows (3-6 km) carry the
                  # detail; the mountain ranges (10-40 km) are dark silhouettes and the conifers sub-pixel
                  'Skyline_Towers_A': 8.0, 'Skyline_Towers_B': 8.0, 'Mountains': 0.4, 'Far_Shore': 0.7,
                  'Coast_Trees': 0.5}
LM_WEIGHT_COLL = {'Desk': 1.6, 'Desk_Objects': 1.6, 'Monitors': 1.2, 'Compute_Rack': 0.55, 'Chair': 0.8,
                  'Ornaments': 1.0, 'Lamps': 1.0, 'Soft_Toys': 1.8, 'Bed': 1.0, 'Lounge': 0.8, 'Plants': 0.8,
                  'Architecture': 0.8, 'Window': 0.6, 'Shelves': 1.1, 'Board_Wall': 1.0, 'Mezzanine': 0.6}
# contact shadow quad: texture size (desktop) and how far it reaches from the instrument's centre (clipped to the
# desk top); blurred and windowed to a soft blob, since the live instrument turns and does not match a sharp shadow
SHADOW_TEX = 256
SHADOW_REACH = 0.26
SHADOW_BLUR_M = 0.022
SHADOW_CORE_M = 0.15    # ~ the footprint radius (0.147 m)
SHADOW_FADE_M = 0.08
SHADOW_MAX = 0.9
SHADOW_SAMPLES = 512
DESK_Z = 0.77
DESK_FRONT_Y, DESK_RIGHT_X = 5.98, -1.05   # room_parts_a: main arm front edge (6.405 - 0.85 / 2) and DESK_X1
ROOM_CENTRE = Vector((0.0, 3.5, 0.0))


def is_glass(mat):
    """Glass for the browser: the named glass materials, or any Principled BSDF that is mostly transmissive and does
    not glow (the mezzanine's rail panels, the candle jar). A diffuse bake of such a surface is black and opaque."""
    if mat is None:
        return False
    if mat.name in GLASS_MATS:
        return True
    if not mat.node_tree:
        return False
    p = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if p is None or p.inputs['Transmission Weight'].is_linked:
        return False
    return p.inputs['Transmission Weight'].default_value >= 0.5 and p.inputs['Emission Strength'].default_value <= 0.3


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = {'out': os.path.join(HOME, '_dev', 'room', 'ship'), 'samples': 256, 'budget': 150000,
           'instrument': 'live', 'uv-only': False, 'margin': 0, 'angle': 0}
    i = 0
    while i < len(a):
        k = a[i][2:]
        if k == 'uv-only':
            opt[k] = True
        elif k in opt:
            opt[k] = a[i + 1] if k in ('out', 'instrument') else int(a[i + 1])
            i += 1
        i += 1
    if opt['instrument'] not in ('live', 'baked'):
        raise SystemExit('--instrument must be live or baked')
    return opt


def gpu():
    sc = bpy.context.scene
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == 'METAL'
    sc.cycles.device = 'GPU'


def coll_of(ob):
    return ob.users_collection[0].name if ob.users_collection else ''


def b2t(v):
    """Blender Z-up -> glTF / three Y-up."""
    return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]


def emission_info(mat):
    """(colour, strength) if the material is an emitter we should export as a constant unlit colour."""
    if mat is None or not mat.node_tree:
        return None
    nt = mat.node_tree
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    if out is None or not out.inputs['Surface'].is_linked:
        return None
    src = out.inputs['Surface'].links[0].from_node
    if src.type == 'EMISSION' and not src.inputs['Color'].is_linked:
        return tuple(src.inputs['Color'].default_value[:3]), src.inputs['Strength'].default_value
    if src.type == 'BSDF_PRINCIPLED' and src.inputs['Emission Strength'].default_value > 2.0 and \
            not src.inputs['Emission Color'].is_linked:
        return tuple(src.inputs['Emission Color'].default_value[:3]), src.inputs['Emission Strength'].default_value
    return None


def tri_count(ob, dg):
    e = ob.evaluated_get(dg)
    me = e.to_mesh()
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    e.to_mesh_clear()
    return n


def export_group_name(ob):
    """Which joined export object a source mesh belongs to."""
    n, c = ob.name, coll_of(ob)
    if c == 'Light_Strips':
        return n
    if n in OWN_IMAGE:
        return n
    if c == 'Armillary_Sphere':
        return 'Armillary_Sphere'
    if n == 'Floor':
        return 'Floor'
    if n == 'Cliff_Under_Room':  # dark land under the building: bakes and draws with the outside
        return 'Outside_Land'
    if n in BOOKS:
        return 'Books'
    if n == 'Book_Stack_Seven_Subjects':
        return 'Book_Stack'
    if n == 'Notebook_Open_Pages':
        return 'Notebook_Pages'
    for m in ('Left', 'Center', 'Right'):
        if n.startswith(f'Monitor_{m}'):
            return f'Monitor_{m}'
    if n.startswith('Desk_Lamp'):
        return 'Desk_Lamp'
    for side in ('Head', 'Foot', 'Mezz'):
        if n.startswith(f'Globe_Lamp_{side}'):
            return f'Globe_Lamp_{side}'
    if n.startswith('Ring_Light'):
        return 'Ring_Light'
    if n == 'Window_Glass':
        return 'Window_Glass'
    if n in ('Sea',):
        return n
    if c == 'Outside':
        return 'Skyline' if n.startswith('Skyline') else 'Outside_Land'
    if any(is_glass(s.material) for s in ob.material_slots if s.material):
        return f'{c}_Glass'
    return c


def atlas_for(group, src_coll):
    if group in OWN_ATLAS:
        return OWN_ATLAS[group]
    if group == 'Desk_Lamp' or group.startswith(('Monitor_', 'Globe_Lamp_', 'Ring_Light')):
        return 'LM_Props'
    if group in ('Skyline', 'Outside_Land'):
        return 'LM_Outside'
    return ATLAS_OF_COLL.get(src_coll, 'LM_Props')


def lm_weight(ob):
    return LM_WEIGHT_NAME.get(ob.name, LM_WEIGHT_COLL.get(coll_of(ob), 1.0))


def trim_outside_faces(me, eps=0.01):
    """Delete the faces of a room-shell box (world-space mesh) that lie outside the interior and face along the
    axis they lie outside on: the floor's underside, the ceiling's top, the walls' outer faces. They are never seen
    but took atlas space. End faces (e.g. the back wall's edge seen through the glass) are kept."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    dead = []
    for f in bm.faces:
        c = f.calc_center_median()
        for k, (lo, hi) in enumerate(INTERIOR):
            if (c[k] < lo - eps or c[k] > hi + eps) and abs(f.normal[k]) > 0.9:
                dead.append(f)
                break
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(me)
    bm.free()


def join(objs, name, coll):
    """Merge mesh objects (world-space data) into one new object; materials are merged by identity, face
    attributes (lm_w) by name."""
    bm = bmesh.new()
    mats = []
    for ob in objs:
        me = ob.data
        remap = []
        for s_ in me.materials:
            if s_ not in mats:
                mats.append(s_)
            remap.append(mats.index(s_))
        for p_ in me.polygons:
            if remap:
                p_.material_index = remap[min(p_.material_index, len(remap) - 1)]
        bm.from_mesh(me)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.validate(clean_customdata=False)
    for m in mats:
        me.materials.append(m)
    if 'Lightmap' in me.uv_layers:
        me.uv_layers['Lightmap'].active = True
        me.uv_layers['Lightmap'].active_render = True
    for ob in objs:
        old = ob.data
        bpy.data.objects.remove(ob)
        if old.users == 0:
            bpy.data.meshes.remove(old)
    new = bpy.data.objects.new(name, me)
    coll.objects.link(new)
    return new


def unlit_image_material(name, img):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = img
    nt.links.new(t.outputs['Color'], nt.nodes['Material Output'].inputs['Surface'])
    return m


def unlit_color_material(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    c = nt.nodes.new('ShaderNodeRGB')
    c.outputs[0].default_value = tuple(rgb) + (1.0,)
    nt.links.new(c.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m


def glass_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.75, 0.85, 0.9, 1)
    p.inputs['Alpha'].default_value = 0.10
    p.inputs['Roughness'].default_value = 0.05
    try:
        m.surface_render_method = 'BLENDED'
    except Exception:
        pass
    return m


def own_image_copy(img, out_dir, name, gain=1.0):
    """The object's own image at full source resolution (pack_room.py resizes it), darkened by `gain` exactly as
    the previous export did (in the image's stored values), saved as lossless PNG."""
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    px[..., :3] *= gain
    new = bpy.data.images.new(name, w, h, alpha=False)
    new.colorspace_settings.name = img.colorspace_settings.name
    new.pixels.foreach_set(px.ravel())
    path = os.path.join(out_dir, name + '.png')
    new.filepath_raw = path
    new.file_format = 'PNG'
    new.save()
    return new


def box_blur(a, r):
    if r <= 0:
        return a
    out = a
    for axis in (0, 1):
        c = np.cumsum(np.pad(out, [(r + 1, r) if i == axis else (0, 0) for i in range(out.ndim)], mode='edge'),
                      axis=axis)
        n = out.shape[axis]
        hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        out = (hi - lo) / (2 * r + 1)
    return out


def push_pull(img, mask):
    """Fill the texels where mask is False with a smooth extrapolation of the covered ones (a pyramid of
    coverage-weighted averages, coarse levels filling the holes of finer ones). Covered texels are unchanged."""
    levels = []
    c = img * mask[..., None]
    w = mask.astype(np.float32)
    while True:
        levels.append((c, w))
        if min(w.shape) <= 1:
            break
        if w.shape[0] % 2:
            c, w = np.concatenate([c, c[-1:]], 0), np.concatenate([w, w[-1:]], 0)
        if w.shape[1] % 2:
            c, w = np.concatenate([c, c[:, -1:]], 1), np.concatenate([w, w[:, -1:]], 1)
        c = c[0::2, 0::2] + c[1::2, 0::2] + c[0::2, 1::2] + c[1::2, 1::2]
        w = w[0::2, 0::2] + w[1::2, 0::2] + w[0::2, 1::2] + w[1::2, 1::2]
    filled = None
    for c, w in reversed(levels):
        cur = np.where(w[..., None] > 0, c / np.maximum(w, 1e-12)[..., None], 0.0)
        if filled is not None:
            up = np.repeat(np.repeat(filled, 2, 0), 2, 1)[:w.shape[0], :w.shape[1]]
            cur = np.where(w[..., None] > 0, cur, up)
        filled = cur
    return np.where(mask[..., None], img, filled)


def uv_report(baked, dims):
    """Lightmap texel density per joined group (texels per metre, desktop) and island sizes per atlas."""
    from bpy_extras.mesh_utils import mesh_linked_uv_islands
    out = {}
    for atlas, objs in baked.items():
        w, h = dims[atlas]
        sizes = []
        for ob in objs:
            me = ob.data
            me.calc_loop_triangles()
            tri = np.empty(len(me.loop_triangles) * 3, np.int32)
            me.loop_triangles.foreach_get('loops', tri)
            vi = np.empty(len(me.loop_triangles) * 3, np.int32)
            me.loop_triangles.foreach_get('vertices', vi)
            co = np.empty(len(me.vertices) * 3, np.float32)
            me.vertices.foreach_get('co', co)
            uv = np.empty(len(me.loops) * 2, np.float32)
            me.uv_layers['Lightmap'].data.foreach_get('uv', uv)
            t = (uv.reshape(-1, 2) * np.array([w, h], np.float32))[tri.reshape(-1, 3)]
            a2 = 0.5 * np.abs((t[:, 1, 0] - t[:, 0, 0]) * (t[:, 2, 1] - t[:, 0, 1]) -
                              (t[:, 1, 1] - t[:, 0, 1]) * (t[:, 2, 0] - t[:, 0, 0])).sum()
            p = co.reshape(-1, 3)[vi.reshape(-1, 3)]
            a3 = 0.5 * np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1).sum()
            out[ob['group']] = round(float(np.sqrt(a2 / max(a3, 1e-9))), 1)
            uvp = uv.reshape(-1, 2) * np.array([w, h], np.float32)
            for isl in mesh_linked_uv_islands(me):
                loops = [li for pi in isl for li in me.polygons[pi].loop_indices]
                q = uvp[loops]
                sizes.append(float(np.sqrt(max(1e-6, np.ptp(q[:, 0]) * np.ptp(q[:, 1])))))
        s = np.array(sizes)
        print(f'  {atlas}: {len(s)} islands, median {np.median(s):.1f} px, <4 px: {(s < 4).mean() * 100:.0f}%, '
              f'density {[(o["group"], out[o["group"]]) for o in objs]}', flush=True)
    return out


def mesh_world_points(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        if o.type != 'MESH':
            continue
        e = o.evaluated_get(dg)
        me = e.to_mesh()
        a = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get('co', a)
        a = a.reshape(-1, 3)
        mw = np.array(o.matrix_world)
        pts.append(a @ mw[:3, :3].T + mw[:3, 3])
        e.to_mesh_clear()
    return np.concatenate(pts) if pts else np.zeros((0, 3), np.float32)


def bounds_of(objs):
    p = mesh_world_points(objs)
    return Vector(p.min(0).tolist()), Vector(p.max(0).tolist())


def tree(root):
    return [root] + list(root.children_recursive)


def anchor_specs():
    """Anchors for the engine, computed from the source scene (before the export renames anything). Each is
    (name, Blender position, extras); extras vectors are already in three's Y-up frame."""
    O = bpy.data.objects
    specs = []

    def box_extras(mn, mx):
        a, b = b2t(mn), b2t(mx)
        lo = [min(a[i], b[i]) for i in range(3)]
        hi = [max(a[i], b[i]) for i in range(3)]
        return {'size': [round(hi[i] - lo[i], 4) for i in range(3)], 'bounds_min': lo, 'bounds_max': hi}

    def facing(v):
        v = Vector(v).normalized()
        return b2t(v)

    # the instrument: base centre on the desk top, its height and footprint from the armillary's real geometry
    root = O['Armillary_Sphere']
    pts = mesh_world_points(tree(root))
    base = Vector((root.matrix_world.translation.x, root.matrix_world.translation.y, DESK_Z))
    height = float(pts[:, 2].max() - DESK_Z)
    radius = float(np.hypot(pts[:, 0] - base.x, pts[:, 1] - base.y).max())
    yaw = float(root.matrix_world.to_euler().z)
    mn, mx = Vector(pts.min(0).tolist()), Vector(pts.max(0).tolist())
    specs.append(('Anchor_Instrument', base, dict(box_extras(mn, mx), height=round(height, 4),
                                                   radius=round(radius, 4), yaw=round(yaw, 4),
                                                   facing=facing((0, 0, 1)))))

    def screen(name, obj_name, beat):
        o = O[obj_name]
        mn, mx = bounds_of([o])
        n = (o.matrix_world.to_3x3() @ o.data.polygons[0].normal).normalized()
        c = (mn + mx) / 2
        if (ROOM_CENTRE - c).dot(n) < 0:
            n = -n
        specs.append((name, c, dict(box_extras(mn, mx), beat=beat, facing=facing(n))))

    screen('Anchor_Monitor_Left', 'Monitor_Left_Screen', 13)
    screen('Anchor_Monitor_Center', 'Monitor_Center_Screen', 14)
    screen('Anchor_Board', 'Board', 15)

    # bed: the centre of the mattress top; bounds cover the bed and the toy row
    bed_parts = [o for o in bpy.data.collections['Bed'].objects if o.parent is None and o.name.startswith('Bed_')
                 and o.name not in ('Bed_Wall_Painting', 'Bed_Headboard')]
    toys = [o for o in bpy.data.collections['Soft_Toys'].objects if o.parent is None]
    mmn, mmx = bounds_of([O['Bed_Mattress']])
    bmn, bmx = bounds_of([x for r in bed_parts + toys for x in tree(r)])
    top = Vector(((mmn.x + mmx.x) / 2, (mmn.y + mmx.y) / 2, mmx.z))
    specs.append(('Anchor_Bed', top, dict(box_extras(bmn, bmx), beat=16,
                                          facing=facing((ROOM_CENTRE - top) * Vector((1, 1, 0))))))

    # window: the centre of the back glass (the panes behind the desk, y ~ 7)
    g = O['Window_Glass']
    gp = mesh_world_points([g])
    back = gp[gp[:, 1] > 6.9]
    wmn, wmx = Vector(back.min(0).tolist()), Vector(back.max(0).tolist())
    specs.append(('Anchor_Window', (wmn + wmx) / 2, dict(box_extras(wmn, wmx), beat=17, facing=facing((0, -1, 0)))))

    # notebook: the open pages (top of the page crest); books: the seven-subject stack, facing its spines
    nmn, nmx = bounds_of([O['Notebook_Open_Pages']])
    nb = Vector(((nmn.x + nmx.x) / 2, (nmn.y + nmx.y) / 2, nmx.z))
    specs.append(('Anchor_Notebook', nb, dict(box_extras(nmn, nmx), facing=facing((0, 0, 1)))))
    bs = O['Book_Stack_Seven_Subjects']
    smn, smx = bounds_of([bs])
    spine = bs.matrix_world.to_3x3() @ Vector((-1, 0, 0))
    specs.append(('Anchor_Books', (smn + smx) / 2, dict(box_extras(smn, smx), facing=facing(spine))))
    return specs


def main():
    opt = args()
    t0 = time.time()
    live = opt['instrument'] == 'live'
    out = os.path.abspath(opt['out'])
    tex_out = os.path.join(out, 'export_tex')
    os.makedirs(tex_out, exist_ok=True)
    sc = bpy.context.scene
    gpu()
    vl = bpy.context.view_layer
    anchors = anchor_specs()
    arm_src = list(bpy.data.collections[INSTRUMENT_COLL].all_objects) if live else []
    arm_lights = [bpy.data.objects[n] for n in INSTRUMENT_LIGHTS if n in bpy.data.objects] if live else []
    for lt in arm_lights:
        lt.hide_render = True   # light-linked to the instrument only; nothing else to light

    # ---------------------------------------------------------------- 1. simplify + make real
    skip = SKIP_COLLS | ({INSTRUMENT_COLL} if live else set())
    src = [o for o in bpy.data.objects
           if o.type == 'MESH' and coll_of(o) not in skip and o.name not in SKIP_NAMES]
    for o in src:
        for m in o.modifiers:
            if m.type == 'SUBSURF':
                m.levels = SUBSURF_EXPORT
    dg = bpy.context.evaluated_depsgraph_get()
    counts = {o.name: tri_count(o, dg) for o in src}
    for o in src:
        r = RATIO.get(coll_of(o), 1.0)
        if o.name in OWN_IMAGE or counts[o.name] < 300:
            r = 1.0
        r = max(r, min(1.0, 150.0 / max(counts[o.name], 1)))  # small props keep at least ~150 triangles
        if r < 1.0:
            d = o.modifiers.new('Export_Decimate', 'DECIMATE')
            d.ratio = r
            d.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    bpy.context.view_layer.update()
    exp_coll = bpy.data.collections.new('Export')
    sc.collection.children.link(exp_coll)
    copies = []
    for o in src:
        e = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(e, preserve_all_data_layers=True, depsgraph=dg)
        me.transform(o.matrix_world)
        if o.name in SHELL:
            trim_outside_faces(me)
        at = me.attributes.new('lm_w', 'FLOAT', 'FACE')
        at.data.foreach_set('value', np.full(len(me.polygons), lm_weight(o), np.float32))
        n = bpy.data.objects.new(o.name + '__x', me)
        exp_coll.objects.link(n)
        for flag in ('visible_camera', 'visible_diffuse', 'visible_glossy', 'visible_transmission',
                     'visible_shadow'):
            setattr(n, flag, getattr(o, flag))
        n['src_name'] = o.name
        n['src_coll'] = coll_of(o)
        n['group'] = export_group_name(o)
        copies.append(n)
    # free the source names so export objects can take them (Board, Window_Glass, Floor, ...)
    for o in list(bpy.data.objects):
        if o.name not in exp_coll.objects:
            o.name = o.name + '__src'
    for m in list(bpy.data.meshes):
        if not m.name.endswith('__x'):
            m.name = m.name + '__src'
    # hide the sources from render/bake (lights stay)
    for c in bpy.data.collections:
        if c.name in ('Export', 'Lights'):
            continue
        for o in c.objects:
            o.hide_render = True
            o.hide_set(True)

    # ---------------------------------------------------------------- 2. classify copies
    baked, consts, owns, glass = {}, [], [], []
    for ob in copies:
        nm, g = ob['src_name'], ob['group']
        mats = [m for m in ob.data.materials if m]
        if nm in OWN_IMAGE:
            owns.append(ob)
        elif nm == 'Sea' or (mats and all(emission_info(m) for m in mats)):
            consts.append(ob)
        elif any(is_glass(m) for m in mats):
            glass.append(ob)
        else:
            baked.setdefault(g, []).append(ob)
    # join the baked parts of each group now (they all have default ray visibility), so the bake runs on a few
    # dozen meshes instead of hundreds
    baked_by_group = {}
    for g, objs in baked.items():
        src_coll = objs[0]['src_coll']
        src_colls = ','.join(sorted({o['src_coll'] for o in objs}))  # read before join() removes the parts
        j = join(objs, g + '__baked', exp_coll)
        j['group'] = g
        j['atlas'] = atlas_for(g, src_coll)
        j['src_colls'] = src_colls
        baked_by_group[g] = j
    # light linking: the lights that light one source collection only (the armillary's key, rim and card, the rack's
    # spill) must reach that collection's export copies, or the bake loses them
    ll_colls = {}
    for lt in [o for o in bpy.data.objects if o.type == 'LIGHT' and not o.hide_render]:
        rc = lt.light_linking.receiver_collection
        if rc is None or rc.name.startswith('LL_'):
            continue
        if rc.name not in ll_colls:
            ll = bpy.data.collections.new('LL_' + rc.name)
            for j in baked_by_group.values():
                if rc.name in j['src_colls'].split(','):
                    ll.objects.link(j)
            ll_colls[rc.name] = ll
        lt.light_linking.receiver_collection = ll_colls[rc.name]
        print('light link', lt.name, '->', [o.name for o in ll_colls[rc.name].objects], flush=True)
    baked = {}
    for g, j in baked_by_group.items():
        baked.setdefault(j['atlas'], []).append(j)

    # ---------------------------------------------------------------- 3. lightmap UVs (one shared space per atlas)
    atlas_dims, atlas_fill = {}, {}
    for atlas, objs in baked.items():
        size = ATLAS_SIZE[atlas]
        margin_px = opt['margin'] or PACK_MARGIN_PX.get(atlas, PACK_MARGIN_PX['*'])
        for ob in objs:
            lm = ob.data.uv_layers.new(name='Lightmap')
            ob.data.uv_layers.active = lm
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objs:
            ob.select_set(True)
        vl.objects.active = objs[0]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(opt['angle'] or UV_ANGLE), island_margin=0.0, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        # texel density weights: scale every face's UVs by its weight (islands never span two source objects, so
        # each island scales as a whole); pack_islands then rescales all islands together, keeping the ratios
        for ob in objs:
            me = ob.data
            uv = np.empty(len(me.loops) * 2, np.float32)
            me.uv_layers['Lightmap'].data.foreach_get('uv', uv)
            wf = np.empty(len(me.polygons), np.float32)
            me.attributes['lm_w'].data.foreach_get('value', wf)
            ls = np.empty(len(me.polygons), np.int32)
            lt_ = np.empty(len(me.polygons), np.int32)
            me.polygons.foreach_get('loop_start', ls)
            me.polygons.foreach_get('loop_total', lt_)
            wl = np.empty(len(me.loops), np.float32)
            for s_, n_, w_ in zip(ls, lt_, wf):
                wl[s_:s_ + n_] = w_
            uv = (uv.reshape(-1, 2) * wl[:, None]).ravel()
            me.uv_layers['Lightmap'].data.foreach_set('uv', uv)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        try:
            bpy.ops.uv.select_all(action='SELECT')
        except RuntimeError:
            pass   # no UV editor context: smart_project already left every UV selected
        tp = time.time()
        bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, rotate_method='ANY', scale=True,
                                margin_method='FRACTION', margin=margin_px / size, shape_method='CONCAVE')
        bpy.ops.object.mode_set(mode='OBJECT')
        # crop to the packed bounds (keeps the texel density, drops empty bands), PACK_MARGIN_PX of border kept
        allu = []
        for ob in objs:
            uv = np.empty(len(ob.data.loops) * 2, np.float32)
            ob.data.uv_layers['Lightmap'].data.foreach_get('uv', uv)
            allu.append(uv.reshape(-1, 2))
        U = np.concatenate(allu)
        lo, hi = U.min(0) * size, U.max(0) * size
        pad = margin_px
        dims = [int(min(size, math.ceil((hi[i] - lo[i] + 2 * pad) / 8.0) * 8)) for i in range(2)]
        off = [(dims[i] - (hi[i] - lo[i])) / 2 - lo[i] for i in range(2)]
        area = 0.0
        for ob, uv in zip(objs, allu):
            px = uv * size + np.array(off, np.float32)
            nuv = px / np.array(dims, np.float32)
            ob.data.uv_layers['Lightmap'].data.foreach_set('uv', nuv.ravel())
            ob.data.calc_loop_triangles()
            tri = np.empty(len(ob.data.loop_triangles) * 3, np.int32)
            ob.data.loop_triangles.foreach_get('loops', tri)
            t = px[tri.reshape(-1, 3)]
            area += 0.5 * np.abs((t[:, 1, 0] - t[:, 0, 0]) * (t[:, 2, 1] - t[:, 0, 1]) -
                                 (t[:, 1, 1] - t[:, 0, 1]) * (t[:, 2, 0] - t[:, 0, 0])).sum()
            ob.data.attributes.remove(ob.data.attributes['lm_w'])
        atlas_dims[atlas] = dims
        atlas_fill[atlas] = round(float(area) / (dims[0] * dims[1]), 4)
        print(f'lightmap UVs {atlas}: {len(objs)} objects, packed in {time.time() - tp:.1f}s, '
              f'{dims[0]}x{dims[1]}, islands cover {100 * atlas_fill[atlas]:.1f}%', flush=True)
    density = uv_report(baked, atlas_dims)
    for ob in owns + consts + glass:
        if 'lm_w' in ob.data.attributes:
            ob.data.attributes.remove(ob.data.attributes['lm_w'])
    if opt['uv-only']:
        print(json.dumps({'atlas_dims': atlas_dims, 'atlas_fill': atlas_fill}))
        return

    # bake-only tweak: the marble veins read far too bright without the floor's mirror reflections, so they are
    # toned down for the lightmap (the stills keep the original material)
    fm = bpy.data.materials.get('Floor_Stone')
    if fm:
        for n in fm.node_tree.nodes:
            if n.bl_idname == 'ShaderNodeMix' and n.data_type == 'RGBA' and not n.inputs[7].is_linked:
                c = n.inputs[7].default_value
                if abs(c[0] - 0.16) < 1e-3:
                    n.inputs[7].default_value = (0.045, 0.043, 0.052, 1.0)

    # ---------------------------------------------------------------- 4. bake
    # Lighting (noisy, filtered), albedo (diffuse + glossy colour, so metals keep their colour) and emission
    # (both noise-free at a few samples) are baked separately and combined: out = filter(L) * A + E.
    sc.render.engine = 'CYCLES'
    sc.cycles.use_denoising = False
    sc.cycles.seed = 7
    bk = sc.render.bake
    bk.margin = 4
    bk.margin_type = 'EXTEND'
    bake_time = {}
    atlas_imgs = {}

    def bake_into(objs, img, kind, passes, samples):
        mats = {m for ob in objs for m in ob.data.materials if m}
        for m in mats:
            nt = m.node_tree
            for n in [n for n in nt.nodes if n.get('lm_target')]:
                nt.nodes.remove(n)
            t = nt.nodes.new('ShaderNodeTexImage')
            t.image = img
            t['lm_target'] = True
            nt.nodes.active = t
            t.select = True
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objs:
            ob.select_set(True)
        vl.objects.active = objs[0]
        sc.cycles.samples = samples
        bpy.ops.object.bake(type=kind, pass_filter=passes, uv_layer='Lightmap', margin=4, margin_type='EXTEND',
                            use_clear=True, target='IMAGE_TEXTURES')
        px = np.empty(img.size[0] * img.size[1] * 4, np.float32)
        img.pixels.foreach_get(px)
        return px.reshape(img.size[1], img.size[0], 4)[..., :3].copy()

    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.color_depth = '8'
    sc.render.image_settings.compression = 15
    for atlas, objs in baked.items():
        w, h = atlas_dims[atlas]
        img = bpy.data.images.new(atlas + '_work', w, h, float_buffer=True, alpha=False)
        tb = time.time()
        L = bake_into(objs, img, 'DIFFUSE', {'DIRECT', 'INDIRECT'}, opt['samples'])
        A = bake_into(objs, img, 'DIFFUSE', {'COLOR'}, 4)
        G = bake_into(objs, img, 'GLOSSY', {'COLOR'}, 4)
        E = bake_into(objs, img, 'EMIT', set(), 4)
        bake_time[atlas] = round(time.time() - tb, 1)
        # normalised filtering of the lighting inside covered texels (three box passes ~ gaussian)
        mask = ((A.sum(-1) + G.sum(-1) + E.sum(-1)) > 1e-6).astype(np.float32)[..., None]
        r = max(1, int(round(max(w, h) / 700)))   # ~2 texels on the 1280-1536 atlases, as the old 2048 ones had
        Lf, Mf = L * mask, mask.copy()
        for _ in range(3):
            Lf, Mf = box_blur(Lf, r), box_blur(Mf, r)
        Lf = np.where(Mf > 1e-4, Lf / np.maximum(Mf, 1e-4), L)
        # glossy colour only where it is metal-like (tinted or mid-grey F0): brass keeps its colour and mid-dark
        # metals (the rack's perforated fronts, aged bronze, dark aluminium) are no longer baked black, while
        # dielectrics (black marble floor, lacquer, coated ceramics: ~4 to 8% specular) are not lifted
        g_lum = G @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        wmetal = np.clip((g_lum - 0.09) / 0.12, 0.0, 1.0)[..., None]
        out_px = Lf * (A + wmetal * G) + E
        out_px = push_pull(out_px, mask[..., 0] > 0)
        rgba = np.concatenate([out_px, np.ones_like(out_px[..., :1])], -1).astype(np.float32)
        img.pixels.foreach_set(rgba.ravel())
        print('baked', atlas, f'{w}x{h}', f'{bake_time[atlas]}s', flush=True)
        path = os.path.join(tex_out, atlas + '.png')
        img.save_render(path, scene=sc)  # through AgX + exposure: display-referred for an unlit renderer
        disp = bpy.data.images.load(path)
        disp.name = atlas
        atlas_imgs[atlas] = disp

    # ---------------------------------------------------------------- 5. contact shadow for the live instrument
    shadow = None
    if live:
        shadow = bake_contact_shadow(anchors[0][1], arm_src, tex_out, vl, exp_coll)

    # ---------------------------------------------------------------- 6. export materials on the copies
    for atlas, objs in baked.items():
        m = unlit_image_material(atlas, atlas_imgs[atlas])
        for ob in objs:
            ob.data.materials.clear()
            ob.data.materials.append(m)
            for uv in list(ob.data.uv_layers):
                if uv.name != 'Lightmap':
                    ob.data.uv_layers.remove(uv)
    own_sizes = {}
    for ob in owns:
        g = ob['src_name']
        src_mat = ob.data.materials[0]
        img = next(n.image for n in src_mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image
                   and not n.get('lm_target'))
        full = own_image_copy(img, tex_out, g + '_tex', OWN_IMAGE_GAIN.get(g, 1.0))
        own_sizes[g + '_tex'] = list(full.size)
        ob.data.materials.clear()
        ob.data.materials.append(unlit_image_material(g + '_Unlit', full))
        for uv in list(ob.data.uv_layers)[1:]:
            ob.data.uv_layers.remove(uv)
        if ob.data.uv_layers:
            ob.data.uv_layers[0].name = 'Lightmap'  # same name as baked meshes so joins keep one layer
    const_mats = {}
    for ob in consts:
        mats = [m for m in ob.data.materials if m]
        if ob['src_name'] == 'Sea':
            rgb, strength = (0.006, 0.014, 0.020), 0.0
        else:
            col, strength = emission_info(mats[0]) or ((1, 1, 1), 1)
            mx = max(col) or 1.0
            rgb = tuple(round(min(1.0, c / mx), 3) for c in col)
            strength = round(float(strength) * mx, 2)  # the colour was normalised to max 1
        key = (rgb, strength)
        if key not in const_mats:
            nm = 'Unlit_%02x%02x%02x' % tuple(int(c * 255) for c in rgb) + f'_e{strength:g}'
            m = unlit_color_material(nm, rgb)
            m['emit'] = strength  # glTF material extras: the browser's glow gain
            const_mats[key] = m
        ob.data.materials.clear()
        ob.data.materials.append(const_mats[key])
        for uv in list(ob.data.uv_layers):
            ob.data.uv_layers.remove(uv)
    gm = glass_material('Glass_Export')
    for ob in glass:
        ob.data.materials.clear()
        ob.data.materials.append(gm)
        for uv in list(ob.data.uv_layers):
            ob.data.uv_layers.remove(uv)

    # ---------------------------------------------------------------- join into named export objects
    groups = {}
    for ob in list(exp_coll.objects):
        if ob is shadow:
            continue
        groups.setdefault(ob['group'], []).append(ob)
    final = {}
    for g, objs in groups.items():
        final[g] = join(objs, g + '__final', exp_coll)
    for g, ob in final.items():
        ob.name = g
        ob.data.name = g
    tris = {}
    for g, ob in final.items():
        ob.data.calc_loop_triangles()
        tris[g] = len(ob.data.loop_triangles)
    if shadow is not None:
        final[shadow.name] = shadow
        tris[shadow.name] = 2
    total = sum(tris.values())
    print(f'export triangles: {total} in {len(final)} objects', flush=True)

    # ---------------------------------------------------------------- 7. anchors
    anchor_obs = []
    for name, pos, extras in anchors:
        e = bpy.data.objects.new(name, None)
        exp_coll.objects.link(e)
        e.location = pos
        e.empty_display_type = 'PLAIN_AXES'
        e.empty_display_size = 0.1
        for k, v in extras.items():
            e[k] = v
        anchor_obs.append(e)

    # ---------------------------------------------------------------- 8. export
    bpy.ops.object.select_all(action='DESELECT')
    for ob in list(final.values()) + anchor_obs:
        ob.hide_set(False)
        ob.select_set(True)
    glb = os.path.join(out, 'room_raw.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=False,
                              export_normals=False, export_texcoords=True, export_tangents=False,
                              export_materials='EXPORT', export_image_format='AUTO',
                              export_cameras=False, export_lights=False, export_yup=True, export_extras=True)
    size = os.path.getsize(glb)
    stats = {'glb': os.path.relpath(glb, HOME), 'glb_bytes': size, 'triangles': total, 'objects': len(final),
             'instrument': opt['instrument'], 'triangles_by_object': dict(sorted(tris.items(), key=lambda kv: -kv[1])),
             'atlases': atlas_dims, 'atlas_fill': atlas_fill, 'pack_margin_px': PACK_MARGIN_PX, 'lm_density': density,
             'own_images': own_sizes, 'bake_seconds': bake_time, 'bake_samples': opt['samples'],
             'anchors': {n: {'position': b2t(p), **x} for n, p, x in anchors},
             'total_seconds': round(time.time() - t0, 1)}
    json.dump(stats, open(os.path.join(out, 'export_stats.json'), 'w'), indent=1)
    print(json.dumps({k: v for k, v in stats.items() if k not in ('triangles_by_object', 'anchors')}, indent=1))


def bake_contact_shadow(base, arm_src, tex_out, vl, coll):
    """The soft shadow the instrument throws on the desk, as an alpha texture on its own quad.

    Bakes the diffuse lighting (direct + indirect) a white quad 1.5 mm above the desk top receives twice, with the
    armillary's source meshes visible and without them (same seed, so the noise mostly cancels), and keeps
    1 - with / without: exactly how much the instrument darkens the desk. Blurred by SHADOW_BLUR_M, kept at full
    strength out to the footprint (SHADOW_CORE_M), faded to zero over SHADOW_FADE_M beyond it and capped at
    SHADOW_MAX, so it reads as a soft contact shadow under any instrument pose and never shows the quad's edge."""
    sc = bpy.context.scene
    x0 = base.x - SHADOW_REACH
    x1 = min(base.x + SHADOW_REACH, DESK_RIGHT_X - 0.004)
    y0 = max(base.y - SHADOW_REACH, DESK_FRONT_Y + 0.004)
    y1 = base.y + SHADOW_REACH
    z = DESK_Z + 0.0015
    me = bpy.data.meshes.new('Instrument_Contact_Shadow')
    me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)])
    uvl = me.uv_layers.new(name='Lightmap')
    for lp, uv in zip(me.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uvl.data[lp.index].uv = uv
    ob = bpy.data.objects.new('Instrument_Contact_Shadow', me)
    coll.objects.link(ob)
    for idc in [x for x in list(bpy.data.materials) + list(bpy.data.images) if x.name == 'Contact_Shadow']:
        idc.name = 'Contact_Shadow__src'   # the stills' own decal (Render_Only) holds the name
    mat = bpy.data.materials.new('Contact_Shadow_Bake')
    mat.use_nodes = True
    p = mat.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
    p.inputs['Roughness'].default_value = 1.0
    me.materials.append(mat)
    tw = SHADOW_TEX
    th = max(16, int(round(SHADOW_TEX * (y1 - y0) / (x1 - x0) / 8)) * 8)
    img = bpy.data.images.new('Contact_Shadow_work', tw, th, float_buffer=True, alpha=False)
    t = mat.node_tree.nodes.new('ShaderNodeTexImage')
    t.image = img
    mat.node_tree.nodes.active = t

    def bake():
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        vl.objects.active = ob
        sc.cycles.samples = SHADOW_SAMPLES
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, uv_layer='Lightmap', margin=2,
                            margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
        px = np.empty(tw * th * 4, np.float32)
        img.pixels.foreach_get(px)
        return px.reshape(th, tw, 4)[..., :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)

    shown = [o for o in arm_src if o.type == 'MESH' and o.visible_camera]
    for o in shown:
        o.hide_render = False
    lit_with = bake()
    for o in shown:
        o.hide_render = True
    lit_without = bake()
    eps = 0.02 * float(np.median(lit_without))
    ratio = np.clip((lit_with + eps) / (lit_without + eps), 0.0, 1.0)
    dark = 1.0 - ratio
    texel = (x1 - x0) / tw
    r = max(1, int(round(SHADOW_BLUR_M / texel / 1.7)))   # three box passes ~ gaussian with sigma ~ 1.7 r
    for _ in range(3):
        dark = box_blur(dark, r)
    # keep it a contact shadow: full strength out to the footprint, gone SHADOW_FADE_M further out (the desk lamp,
    # close behind, also throws a broad faint shadow of the open cage over the whole front of the desk; a static
    # copy of that would read as a dark rectangle under a turning instrument), and zero at the quad's border
    yy, xx = np.mgrid[0:th, 0:tw]
    px = x0 + (xx + 0.5) / tw * (x1 - x0)
    py = y0 + (yy + 0.5) / th * (y1 - y0)
    rr = np.hypot(px - base.x, py - base.y)
    t = np.clip((rr - SHADOW_CORE_M) / SHADOW_FADE_M, 0.0, 1.0)
    radial = 1.0 - t * t * (3 - 2 * t)
    edge = np.minimum.reduce([px - x0, x1 - px, py - y0, y1 - py]) / 0.03
    edge = np.clip(edge, 0.0, 1.0)
    alpha = np.clip(dark * radial * edge, 0.0, SHADOW_MAX)
    out = bpy.data.images.new('Contact_Shadow', tw, th, alpha=True)
    rgba = np.zeros((th, tw, 4), np.float32)
    rgba[..., 3] = alpha
    out.pixels.foreach_set(rgba.ravel())
    path = os.path.join(tex_out, 'Contact_Shadow.png')
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    print(f'contact shadow {tw}x{th} over {x1 - x0:.3f} x {y1 - y0:.3f} m, max alpha {alpha.max():.3f}', flush=True)
    me.materials.clear()
    si = bpy.data.images.load(path)
    si.name = 'Contact_Shadow'
    me.materials.append(unlit_image_material('Contact_Shadow', si))
    ob['group'] = 'Instrument_Contact_Shadow'
    return ob


if __name__ == '__main__':
    main()
