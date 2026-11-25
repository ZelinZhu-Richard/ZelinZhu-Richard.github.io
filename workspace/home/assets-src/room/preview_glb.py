"""Check a room GLB the way an unlit browser renderer would draw it.

    Blender -b --factory-startup -P preview_glb.py -- [--glb <out>/room.glb] [--out DIR] [--res 800x450]
                                                      [--prefix glb] [--shots wide,desk,...] [--proxy LEGACY_GLB]

Imports the GLB into an empty scene (Blender's importer decodes EXT_meshopt_compression, KHR_mesh_quantization and
EXT_texture_webp, so the shipped files from pack_room.py can be checked directly), recreates the five look-test
cameras from build_room.CAMERAS (converted to the GLB's metres, Z-up after import), and renders with the 'Standard'
view transform: the baked atlases are already display-referred, so what comes out is what three.js shows with
NoToneMapping and sRGB output. Writes <out>/<prefix>-<shot>.png.

--proxy: also import the Armillary_Sphere mesh of an older export that still has it baked (_dev/room/room.glb) and
stand it on the GLB's Anchor_Instrument, to check where the live instrument will stand (frames <prefix>-proxy-*).
"""
import os
import sys

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True  # keep __pycache__ out of the source folder
HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
LEGACY_ARMILLARY_BASE = Vector((-1.38, 6.40, 0.77))   # where the legacy room.glb baked it (room_parts_a, before)


def main():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = {'glb': os.path.join(HOME, '_dev', 'room', 'room.glb'), 'out': os.path.join(HOME, '_dev', 'room'),
           'res': '800x450', 'prefix': 'glb', 'shots': '', 'proxy': ''}
    for i in range(0, len(a) - 1, 2):
        opt[a[i][2:]] = a[i + 1]
    from build_room import CAMERAS
    import room_lib as RL
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(opt['glb']))
    sc = bpy.context.scene
    w = bpy.data.worlds.new('Black')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    sc.world = w
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == 'METAL'
    sc.cycles.device = 'GPU'
    sc.cycles.samples = 24
    sc.cycles.max_bounces = 2
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    rw, rh = (int(v) for v in opt['res'].split('x'))
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = rw, rh, 100
    for n in [s for s in opt.get('hide', '').split(',') if s]:   # e.g. --hide Instrument_Contact_Shadow
        if n in bpy.data.objects:
            bpy.data.objects[n].hide_render = True
    names = [s for s in opt['shots'].split(',') if s] or list(CAMERAS)
    anchors = {o.name: o.matrix_world.translation.copy() for o in bpy.data.objects if o.name.startswith('Anchor_')}
    print('anchors', {k: tuple(round(x, 3) for x in v) for k, v in anchors.items()})

    def shoot(prefix):
        for name in names:
            loc, tgt, lens = CAMERAS[name][:3]
            cd = bpy.data.cameras.new('GLB_' + name)
            cd.lens = lens
            cd.sensor_width = 36.0
            cd.clip_end = 8000.0
            cam = bpy.data.objects.new('GLB_' + name, cd)
            sc.collection.objects.link(cam)
            cam.location = loc
            cam.rotation_euler = RL.look_at_rot(loc, tgt)
            sc.camera = cam
            sc.render.filepath = os.path.join(os.path.abspath(opt['out']), f'{prefix}-{name}.png')
            bpy.ops.render.render(write_still=True)
            print('rendered', sc.render.filepath)

    shoot(opt['prefix'])
    if opt['proxy'] and 'Anchor_Instrument' in anchors:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.abspath(opt['proxy']))
        new = [o for o in bpy.data.objects if o not in before]
        keep = [o for o in new if o.name.startswith('Armillary_Sphere')]
        for o in new:
            if o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        for o in keep:
            o.location += anchors['Anchor_Instrument'] - LEGACY_ARMILLARY_BASE
        shoot(opt['prefix'] + '-proxy')


if __name__ == '__main__':
    main()
