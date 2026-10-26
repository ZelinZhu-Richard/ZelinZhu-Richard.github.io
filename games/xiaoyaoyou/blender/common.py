"""Shared Blender build settings. All generated files stay inside this game."""
import argparse
import json
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
STARTED = time.monotonic()


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine', choices=['eevee', 'cycles'], required=True)
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def setup(engine):
    for directory in ['tmp', 'raw', 'build', 'silhouette/raw']:
        (ROOT / '_dev' / directory).mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.temporary_directory = str(ROOT / '_dev/tmp')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    engines = scene.render.bl_rna.properties['engine'].enum_items.keys()
    eevee = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
    scene.render.engine = 'CYCLES' if engine == 'cycles' else eevee
    if engine == 'cycles':
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 16
        scene.cycles.use_denoising = False
        scene.cycles.time_limit = 60
    else:
        scene.render.engine = eevee
        scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    return scene


def mesh(name, vertices, faces, material, uvs=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    if material:
        data.materials.append(material)
    if uvs:
        layer = data.uv_layers.new(name='UVMap')
        for polygon, coordinates in zip(data.polygons, uvs):
            for index, uv in zip(polygon.loop_indices, coordinates):
                layer.data[index].uv = uv
    for polygon in data.polygons:
        polygon.use_smooth = True
    return obj


def look_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def record(asset, entry):
    filename = ROOT / '_dev/build/asset-stats.json'
    stats = json.loads(filename.read_text()) if filename.exists() else {}
    entry['seconds'] = round(time.monotonic() - STARTED, 3)
    stats[asset] = entry
    filename.write_text(json.dumps(stats, indent=2) + '\n')


def srgb(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def color(hex_value):
    hex_value = hex_value.lstrip('#')
    return tuple(srgb(int(hex_value[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1,)


def plain_material(name, hex_value):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    node = material.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = color(hex_value)
    node.inputs['Roughness'].default_value = 1
    node.inputs['Specular IOR Level'].default_value = 0
    return material
