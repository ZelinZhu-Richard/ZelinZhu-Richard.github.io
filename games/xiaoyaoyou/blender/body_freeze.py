"""Verify the body against its approved-to-freeze pre-texture quad generator.

An exporter can change triangle/vertex splitting when UVs change. The geometry
contract is verified on the actual Subdivision-applied vertices and quad faces,
using the known committed generator before this texture pass.
"""
import hashlib
import json
import math
import subprocess

import bpy
import bmesh
import numpy as np
import common


def fingerprint(obj):
    coords = np.array([tuple(vertex.co) for vertex in obj.data.vertices], dtype='<f4')
    faces = np.array([index for face in obj.data.polygons for index in (len(face.vertices), *face.vertices)], dtype='<i4')
    return {'vertexPositions': hashlib.sha256(coords.tobytes()).hexdigest(),
            'polygonTopology': hashlib.sha256(faces.tobytes()).hexdigest(),
            'vertices': len(obj.data.vertices), 'polygons': len(obj.data.polygons)}


def reference():
    source = subprocess.check_output(['git', 'show', '05d0664:games/xiaoyaoyou/blender/kun.py'],
                                     cwd=common.ROOT, text=True)
    start = source.index('PROFILE = np.array(')
    end = source.index('# Only a thin, low crest', start)
    material = common.plain_material('_frozen_body_reference_only', '#F6ECDC')
    namespace = {'np': np, 'math': math, 'TAU': math.tau, 'bpy': bpy, 'bmesh': bmesh,
                 'common': common, 'skin': material}
    exec(compile(source[start:end], '<frozen body generator 05d0664>', 'exec'), namespace)
    obj = namespace['body']
    result = fingerprint(obj)
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.materials.remove(material)
    (common.ROOT / '_dev/tmp/kun-body-quad-reference.json').write_text(json.dumps(result, indent=2) + '\n')
    # Return the actual frozen mesh as well: new UVs are applied AFTER freezing
    # this post-subdivision geometry, rather than affecting its construction.
    return result, data
