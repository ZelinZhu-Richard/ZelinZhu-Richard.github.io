"""Render the look-test stills from room.blend.

    Blender -b <out>/room.blend -P render_room.py -- [--shots all|wide,desk,instrument,bed,wall]
                                                     [--samples 256] [--res 1600x900] [--scale 100] [--out DIR]

Writes <out>/room-<shot>.png and appends timings to <out>/render_log.json.

Per-shot overrides (SHOT_OVERRIDES) are applied for one shot and restored afterwards, never saved: the
instrument close-up darkens what is seen through the window glass by one stop, like an ND gel on the glass,
so the brass sphere is the brightest thing mid-frame, and turns the window's reflection off (no ghost of the
glowing glass cube floating in the bokeh).
"""
import json
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.dirname(os.path.dirname(HERE))
SHOTS = ['wide', 'desk', 'instrument', 'bed', 'wall']
SHOT_OVERRIDES = {'instrument': {'window_transmit': 0.5, 'window_refl': 0.0}}


def _apply_overrides(shot):
    """Apply this shot's overrides; returns a function that restores the previous values."""
    undo = []
    ov = SHOT_OVERRIDES.get(shot, {})
    if 'window_transmit' in ov:
        m = bpy.data.materials.get('Window_Glass')
        node = m.node_tree.nodes.get('Glass_Transmit') if m else None
        if node is not None:
            old = tuple(node.inputs['Color'].default_value)
            k = ov['window_transmit']
            node.inputs['Color'].default_value = (old[0] * k, old[1] * k, old[2] * k, old[3])
            undo.append(lambda n=node, o=old: n.inputs['Color'].__setattr__('default_value', o))
    if 'window_refl' in ov:
        for mname in ('Window_Glass',):
            m = bpy.data.materials.get(mname)
            node = m.node_tree.nodes.get('Glass_Refl') if m else None
            if node is None:
                continue
            old = (node.inputs[1].default_value, node.inputs[2].default_value)
            k = ov['window_refl']
            node.inputs[1].default_value, node.inputs[2].default_value = old[0] * k, old[1] * k
            undo.append(lambda n=node, o=old: (n.inputs[1].__setattr__('default_value', o[0]),
                                               n.inputs[2].__setattr__('default_value', o[1])))

    def restore():
        for u in undo:
            u()
    return restore


def _gpu():
    sc = bpy.context.scene
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = (d.type == 'METAL')
        sc.cycles.device = 'GPU'
    except Exception as e:
        print('GPU unavailable:', e)


def render(shots, out, samples=256, res='1600x900', scale=100, exposure=None):
    sc = bpy.context.scene
    out = os.path.abspath(out)
    os.makedirs(out, exist_ok=True)
    _gpu()
    names = SHOTS if shots in ('all', '') else [s.strip() for s in shots.split(',')]
    sc.cycles.samples = samples
    w, h = (int(v) for v in res.split('x'))
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = scale
    if exposure is not None:
        sc.view_settings.exposure = exposure
    log_path = os.path.join(out, 'render_log.json')
    log = []
    if os.path.exists(log_path):
        try:
            log = json.load(open(log_path))
        except Exception:
            log = []
    for s in names:
        cam = bpy.data.objects.get('Cam_' + s.title())
        if cam is None:
            print('no camera for', s)
            continue
        sc.camera = cam
        sc.render.filepath = os.path.join(out, f'room-{s}.png')
        restore = _apply_overrides(s)
        t0 = time.time()
        try:
            bpy.ops.render.render(write_still=True)
        finally:
            restore()
        dt = time.time() - t0
        print(f'rendered {s} in {dt:.1f}s -> {sc.render.filepath}')
        log.append({'shot': s, 'seconds': round(dt, 1), 'samples': samples, 'res': f'{w}x{h}@{scale}%',
                    'time': time.strftime('%Y-%m-%d %H:%M:%S')})
        json.dump(log, open(log_path, 'w'), indent=1)


def main():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opt = {'shots': 'all', 'samples': 256, 'res': '1600x900', 'scale': 100,
           'out': os.path.join(HOME, '_dev', 'room'), 'exposure': None}
    i = 0
    while i < len(a):
        k = a[i][2:]
        if k in opt:
            v = a[i + 1]
            opt[k] = int(v) if k in ('samples', 'scale') else (float(v) if k == 'exposure' else v)
            i += 1
        i += 1
    render(opt['shots'], opt['out'], opt['samples'], opt['res'], opt['scale'], opt['exposure'])


if __name__ == '__main__':
    main()
