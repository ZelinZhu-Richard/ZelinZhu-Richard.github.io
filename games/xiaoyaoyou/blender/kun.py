"""Code-built Kun: lofted body, swept quad fin sheets, painted UVs.

Dimensions use the sheet as three independent observations of the same animal.
Blender axes: nose -Y, up +Z. No mesh primitives or imported meshes are used.
"""
import json
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import bmesh
import numpy as np
from mathutils import Vector
import common

ARGS = common.arguments()
SCENE = common.setup(ARGS.engine)
ROOT = common.ROOT
TAU = math.tau


def texture(filename, max_size=2048):
    image = bpy.data.images.load(str(ROOT / 'ref' / filename), check_existing=False)
    width, height = image.size
    if max(width, height) > max_size:
        factor = max_size / max(width, height)
        image.scale(round(width * factor), round(height * factor))
    return image


skin = common.plain_material('kun_skin', '#F6ECDC')
skin_image = texture('tex-kun-landscape.png')
node = skin.node_tree.nodes.new('ShaderNodeTexImage')
node.image = skin_image
node.extension = 'EXTEND'
skin.node_tree.links.new(node.outputs['Color'], skin.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

wave_source = texture('tex-fin-waves.png')
size = tuple(wave_source.size)
pixels = np.array(wave_source.pixels[:], dtype=np.float32).reshape(size[1], size[0], 4)
# White paper remains translucent, while ink becomes opaque. Edge clipping is
# generated independently from the sheet's geometry-space UV border.
whiteness = pixels[:, :, :3].min(axis=2)
pixels[:, :, 3] = 0.43 + 0.57 * np.clip((0.94 - whiteness) / 0.7, 0, 1)
yy, xx = np.mgrid[:size[1], :size[0]]
edge_distance = np.minimum.reduce([xx, yy, size[0] - 1 - xx, size[1] - 1 - yy])
pixels[:, :, 3] *= np.clip(edge_distance / 2, 0, 1)
wave_image = bpy.data.images.new('kun_fin_wave_alpha', width=size[0], height=size[1], alpha=True)
wave_image.pixels.foreach_set(pixels.ravel())
wave_image.filepath_raw = str(ROOT / '_dev/raw/kun-fin-wave.png')
wave_image.file_format = 'PNG'
wave_image.save()
fin_material = common.plain_material('kun_fin', '#F6ECDC')
fin_material.use_backface_culling = False
if hasattr(fin_material, 'surface_render_method'):
    fin_material.surface_render_method = 'DITHERED'
fin_shader = fin_material.node_tree.nodes.get('Principled BSDF')
wave_node = fin_material.node_tree.nodes.new('ShaderNodeTexImage')
wave_node.image = wave_image
wave_node.extension = 'EXTEND'
fin_material.node_tree.links.new(wave_node.outputs['Color'], fin_shader.inputs['Base Color'])
fin_material.node_tree.links.new(wave_node.outputs['Alpha'], fin_shader.inputs['Alpha'])

ink = common.plain_material('kun_eye_ink', '#2B3746')
pleat_material = common.plain_material('kun_pleat', '#ACAFA8')
eye_rim = common.plain_material('kun_eye_rim', '#D9CFBB')

# Uniform longitudinal spacing is retained for future vertex-shader swimming.
# y, half-width, dorsal z, ventral z. The curved midline falls toward the tail.
PROFILE = np.array([
    [-5.6, .025, .48, .43], [-5.25, .52, .80, .02],
    [-4.7, .90, 1.02, -.68], [-3.8, 1.25, 1.15, -1.20],
    [-2.7, 1.42, 1.19, -1.16], [-1.5, 1.40, 1.18, -1.00],
    [-.2, 1.21, 1.08, -.87], [1.2, .86, .72, -.62],
    [2.5, .49, .30, -.45], [3.6, .27, .09, -.33],
    [4.5, .16, .18, -.07], [4.8, .025, .15, .10],
])


def profile(y):
    return [float(np.interp(y, PROFILE[:, 0], PROFILE[:, i])) for i in (1, 2, 3)]


def skin_point(y, phi, offset=0):
    width, top, bottom = profile(y)
    # A rounded, broad whale head and slightly flatter belly than an ellipse.
    cosine = math.cos(phi)
    mid = (top + bottom) / 2
    radius = (top - bottom) / 2
    x = (width + offset) * math.sin(phi)
    z = mid + (radius + offset) * cosine
    # No dorsal displacement: keep the loft's back/head free of a solid hump.
    return (x, y, z)


vertices, faces, uvs = [], [], []
LOOPS, RADIAL = 43, 48
for i in range(LOOPS):
    y = -5.6 + i * 10.4 / (LOOPS - 1)
    for j in range(RADIAL):
        vertices.append(skin_point(y, j * TAU / RADIAL))
for i in range(LOOPS - 1):
    for j in range(RADIAL):
        j1 = (j + 1) % RADIAL
        faces.append((i * RADIAL + j, (i + 1) * RADIAL + j, (i + 1) * RADIAL + j1, i * RADIAL + j1))
        def uv(loop, segment):
            angle = min(segment, RADIAL - segment) * TAU / RADIAL
            # Both flanks meet in the image's unpainted top band. The entire
            # belly samples the plain bottom band; no mountains below the flank.
            return (.02 + .96 * loop / (LOOPS - 1), max(.015, .985 - angle / 1.72))
        uvs.append([uv(i, j), uv(i + 1, j), uv(i + 1, j1), uv(i, j1)])
faces += [tuple(reversed(range(RADIAL))), tuple((LOOPS - 1) * RADIAL + j for j in range(RADIAL))]
uvs += [[(.02, .98)] * RADIAL, [(.98, .015)] * RADIAL]
body = common.mesh('kun_body', vertices, faces, skin, uvs)
bm = bmesh.new()
bm.from_mesh(body.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(body.data)
bm.free()
subdivision = body.modifiers.new('Loft smoothing', 'SUBSURF')
subdivision.levels = 1
bpy.context.view_layer.objects.active = body
bpy.ops.object.modifier_apply(modifier=subdivision.name)

# Only a thin, low crest follows the spine; no spike or displaced body hump.
ridge_vertices, ridge_faces, ridge_uvs = [], [], []
RIDGE_LOOPS = 81
for i in range(RIDGE_LOOPS):
    y = -3.35 + 5.8 * i / (RIDGE_LOOPS - 1)
    _, top, _ = profile(y)
    taper = math.sin(math.pi * i / (RIDGE_LOOPS - 1)) ** .5
    height = .055 * taper
    half_width = .022 * taper + .002
    ridge_vertices.extend([
        (-half_width, y, top - .025), (half_width, y, top - .025),
        (half_width * .25, y, top + height), (-half_width * .25, y, top + height),
    ])
for i in range(RIDGE_LOOPS - 1):
    for j in range(4):
        j1 = (j + 1) % 4
        ridge_faces.append((i * 4 + j, (i + 1) * 4 + j, (i + 1) * 4 + j1, i * 4 + j1))
        ridge_uvs.append([(.2 + .55 * k / (RIDGE_LOOPS - 1), .985) for k in (i, i + 1, i + 1, i)])
ridge_faces.extend([(3, 2, 1, 0), tuple((RIDGE_LOOPS - 1) * 4 + j for j in range(4))])
ridge_uvs.extend([[(.2, .985)] * 4, [(.75, .985)] * 4])
common.mesh('kun_dorsal_ridge', ridge_vertices, ridge_faces, skin, ridge_uvs)



# All planform boundaries below are traced from the full-resolution reference
# after subtracting this frozen body's own projected silhouette.
import traced_sheets
TRACE = json.loads((ROOT / 'blender/kun-planforms.json').read_text())
SHEET_STATS = {}
BODY_POINTS = np.array([tuple(vertex.co) for vertex in body.data.vertices])
BODY_DEPTH = float(BODY_POINTS[:, 2].max() - BODY_POINTS[:, 2].min())
PREVIEW_UP = Vector((math.sin(math.radians(25)) / math.sqrt(2),
                     math.sin(math.radians(25)) / math.sqrt(2), math.cos(math.radians(25))))
BODY_SCREEN_TOP = max(Vector(point).dot(PREVIEW_UP) for point in BODY_POINTS)


def fin(name, sign, upper):
    # Use one actual pectoral outline for both sides and both pairs, mirrored;
    # lower pair is uniformly 0.8 scale. No width-envelope approximation.
    record = TRACE['outlines']['pectoral-image-left']
    pixels, faces, sheet_stats = traced_sheets.patch(record)
    source_root = np.array(record['rootXY'])
    source_tip = np.array(record['pixelsXY'][record['tipIndex']])
    pixels_per_unit = TRACE['alignment']['pixelsPerUnit']
    canonical = np.column_stack([source_root[0] - pixels[:, 0], pixels[:, 1] - source_root[1]]) / pixels_per_unit
    tip = np.array([source_root[0] - source_tip[0], source_tip[1] - source_root[1]]) / pixels_per_unit
    source_axis = tip / np.linalg.norm(tip)
    source_chord = np.array([-source_axis[1], source_axis[0]])
    uu, vv = canonical @ source_axis, canonical @ source_chord
    factor = 1.0 if upper else .8
    sweep = math.radians(55)
    dihedral = math.radians(15 if upper else -20)
    span_axis = Vector((math.cos(sweep), math.sin(sweep), math.cos(sweep) * math.tan(dihedral)))
    chord_axis = Vector((-math.sin(sweep), math.cos(sweep), -math.sin(sweep) * math.tan(dihedral)))
    root = Vector((1.03 if upper else 1.00, -1.44 if upper else -.92, .45 if upper else -.62))
    points = []
    for u, v in zip(uu, vv):
        phase = max(0, min(1, u / np.linalg.norm(tip)))
        angle = math.radians(25) * phase
        axis = span_axis.normalized()
        twisted = (chord_axis * math.cos(angle) + axis.cross(chord_axis) * math.sin(angle)
                   + axis * axis.dot(chord_axis) * (1 - math.cos(angle)))
        normal = span_axis.cross(twisted).normalized()
        if normal.z < 0:
            normal = -normal
        across = (v - vv.min()) / max(vv.max() - vv.min(), 1e-6)
        cup = (.10 if upper else -.10) * math.sin(math.pi * phase) * math.sin(math.pi * across)
        point = root + span_axis * (u * factor) + twisted * (v * factor) + normal * cup
        # Explicit anti-sail bound in the 25-degree preview's screen-up basis.
        # Symmetric for left/right; a smooth minimum bends rather than clips tips.
        limit = (BODY_SCREEN_TOP + .3 * BODY_DEPTH - PREVIEW_UP.x * (abs(point.x) + point.y)) / PREVIEW_UP.z
        difference = point.z - limit
        point.z = point.z - .04 * (max(difference / .04, 0) + math.log1p(math.exp(-abs(difference / .04))))
        point.x *= sign
        points.append(tuple(point))
    obj = common.mesh(name, points, faces, fin_material, traced_sheets.uv_coordinates(pixels, faces))
    sheet_stats.update({'sourceOutline': 'pectoral-image-left', 'scale': factor,
                        'dihedralDegrees': 15 if upper else -20, 'sweepDegrees': 55,
                        'twistDegrees': 25, 'root': list(root),
                        'maxWorldZ': max(point[2] for point in points)})
    SHEET_STATS[name] = sheet_stats
    return obj


for upper in [True, False]:
    for sign, label in [(-1, 'L'), (1, 'R')]:
        fin(f'kun_fin_{"upper" if upper else "lower"}_{label}', sign, upper)

# Both fluke lobes retain their traced pointed/wavy outlines. The frozen
# attachment position (0, 3.4, .10) and the existing low arch are retained.
fluke_records = [TRACE['outlines'][f'fluke-image-{side}'] for side in ['left', 'right']]
fluke_outlines = np.concatenate([np.array(record['pixelsXY']) for record in fluke_records])
fluke_pixels_per_unit = (fluke_outlines[:, 0].max() - fluke_outlines[:, 0].min()) / 6.70
fluke_reference_root_y = float(fluke_outlines[:, 1].min())
fluke_center_x = TRACE['alignment']['centerX']
fluke_points, fluke_faces, fluke_uvs = [], [], []
for record in fluke_records:
    pixels, faces, sheet_stats = traced_sheets.patch(record)
    uvs = traced_sheets.uv_coordinates(pixels, faces)
    offset = len(fluke_points)
    for px, py in pixels:
        x = (fluke_center_x - px) / fluke_pixels_per_unit
        y = 3.40 + (py - fluke_reference_root_y) / fluke_pixels_per_unit
        span = min(1, abs(x) / 3.35)
        chord = max(0, min(1, (py - fluke_reference_root_y) / (fluke_outlines[:, 1].max() - fluke_reference_root_y)))
        z = .10 + .65 * math.sin(math.pi * span * .72) + .13 * math.sin(math.pi * chord) - .08 * chord
        fluke_points.append((x, y, z))
    fluke_faces.extend([tuple(index + offset for index in face) for face in faces])
    fluke_uvs.extend(uvs)
    SHEET_STATS[f'fluke-{len(SHEET_STATS) - 3}'] = sheet_stats
common.mesh('kun_fluke', fluke_points, fluke_faces, fin_material, fluke_uvs)


def stroke(name, positions, radius, material):
    # Bevelled code-defined curves, never primitive cylinders.
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    spline = curve.splines.new('POLY')
    spline.points.add(len(positions) - 1)
    for point, xyz in zip(spline.points, positions):
        point.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(material)
    return obj


# Throat grooves follow the actual ventral surface, fanning from chin to belly.
for i in range(17):
    phi_start = math.pi + (i - 8) * .075
    phi_end = math.pi + (i - 8) * .14
    positions = []
    for j in range(32):
        t = j / 31
        positions.append(skin_point(-5.25 + 3.25 * t, phi_start * (1 - t) + phi_end * t, .012))
    stroke(f'kun_throat_pleat_{i:02}', positions, .009, pleat_material)
for sign in [-1, 1]:
    positions = [skin_point(-5.5 + t * 1.75, sign * (.94 + .37 * t), .018) for t in np.linspace(0, 1, 32)]
    stroke(f'kun_mouth_{sign}', positions, .016, pleat_material)
    # Elliptical eye plate on the skin, with concentric quad rings and a pupil.
    # Move back onto the lateral head surface, close to the mouth line. The
    # near-horizontal radial normal points sideways, rather than at the snout.
    center_y, center_phi = -3.72, sign * 1.72
    for material, radius, name in [(eye_rim, .0725, 'rim'), (ink, .0415, 'pupil')]:
        verts = [skin_point(center_y, center_phi, .030)]
        for j in range(32):
            a = j * TAU / 32
            verts.append(skin_point(center_y + radius * math.cos(a), center_phi + radius * .72 * math.sin(a), .032 if name == 'pupil' else .026))
        faces = [(0, j + 1, (j + 1) % 32 + 1) for j in range(32)]
        common.mesh(f'kun_eye_{sign}_{name}', verts, faces, material)

# Convert detail curves before computing the actual exported geometry statistics.
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = body
bpy.ops.object.convert(target='MESH')
objects = list(bpy.context.scene.objects)
quads = sum(len(face.vertices) == 4 for obj in objects for face in obj.data.polygons)
face_count = sum(len(obj.data.polygons) for obj in objects)
triangles = sum(sum(len(face.vertices) - 2 for face in obj.data.polygons) for obj in objects)
bm = bmesh.new()
bm.from_mesh(body.data)
nonmanifold = sum(not edge.is_manifold for edge in bm.edges)
bm.free()
bbox = [[min(v.co[k] for obj in objects for v in obj.data.vertices) for k in range(3)],
        [max(v.co[k] for obj in objects for v in obj.data.vertices) for k in range(3)]]
for image in [skin_image, wave_image]:
    image.pack()
bpy.ops.export_scene.gltf(
    filepath=str(ROOT / '_dev/raw/kun.glb'), export_format='GLB',
    export_yup=True, export_apply=True, export_texcoords=True,
    export_normals=True, export_materials='EXPORT', export_image_format='AUTO',
)
common.record('kun', {
    'triangles': triangles, 'quadRatio': quads / face_count,
    'bodyNonManifoldEdges': nonmanifold,
    'loopSpacingRatio': float(np.linalg.norm(np.diff(np.array(vertices).reshape(LOOPS, RADIAL, 3).mean(axis=1), axis=0), axis=1).max() /
                              np.linalg.norm(np.diff(np.array(vertices).reshape(LOOPS, RADIAL, 3).mean(axis=1), axis=0), axis=1).min()),
    'bodyLoops': LOOPS, 'radialSegments': RADIAL, 'subdivisionLevel': 1,
    'maxTextureSize': max(max(image.size) for image in [skin_image, wave_image]),
    'bbox': bbox, 'nodeNames': [obj.name for obj in objects],
    'engine': ARGS.engine, 'exitCode': 0, 'blenderVersion': bpy.app.version_string,
    'finAlpha': {'white': .43, 'ink': 1.0, 'edge': 'two-pixel alpha feather on geometry contour'},
    'geometryReview': {
        'planformSource': 'blender/kun-planforms.json',
        'upperDihedralDegrees': 15, 'lowerDihedralDegrees': -20,
        'sweepDegrees': 55, 'lowerFinScale': .8, 'twistDegrees': 25,
        'finCupDepth': .10, 'finPreviewRiseLimitBodyDepth': .3,
        'bodyLength': 10.4, 'flukeAnchor': [0, 3.40, .10],
        'dorsalRidgeHeight': .055, 'dorsalSpikeExtraHeight': 0,
        'eyeY': -3.72, 'eyePhiDegrees': math.degrees(1.72), 'eyeSizeScale': .5,
    },
    'tracedSheets': SHEET_STATS,
})
print('KUN_BUILD', json.dumps(json.loads((ROOT / '_dev/build/asset-stats.json').read_text())['kun']))
