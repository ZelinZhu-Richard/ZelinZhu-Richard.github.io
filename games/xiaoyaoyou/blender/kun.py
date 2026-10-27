"""Code-built Kun: lofted body, swept quad fin sheets, painted UVs.

Dimensions use the sheet as three independent observations of the same animal.
Blender axes: nose -Y, up +Z. No mesh primitives or imported meshes are used.
"""
import json
import hashlib
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

# Fin-local normalized paint/weights are computed before these geometry knobs.
PECTORAL_FIN_SCALE = 1.35
UPPER_FIN_SCALE = PECTORAL_FIN_SCALE
LOWER_FIN_SCALE = PECTORAL_FIN_SCALE * .8
UPPER_FIN_SWEEP_DEGREES = 55
LOWER_FIN_SWEEP_DEGREES = 55
UPPER_FIN_DIHEDRAL_DEGREES = 20
LOWER_FIN_DIHEDRAL_DEGREES = -30
UPPER_FIN_TWIST_DEGREES = 25
LOWER_FIN_TWIST_DEGREES = 25
UPPER_FIN_CAMBER = .12
LOWER_FIN_CAMBER = -.12
FIN_MAX_PREVIEW_RISE_BODY_DEPTH = .3

ARGS = common.arguments()
if ARGS.fin_scale is not None:
    if not math.isfinite(ARGS.fin_scale) or ARGS.fin_scale <= 0:
        raise ValueError('Fin scale must be finite and positive')
    UPPER_FIN_SCALE = ARGS.fin_scale
    LOWER_FIN_SCALE = ARGS.fin_scale * .8
SCENE = common.setup(ARGS.engine)
import body_freeze
FROZEN_BODY_REFERENCE, FROZEN_BODY_MESH = body_freeze.reference()
ROOT = common.ROOT
TAU = math.tau
PAINT = json.loads((ROOT / '_dev/build/kun-paint.json').read_text())


def painted_material(name, image_path, translucent=False):
    image = bpy.data.images.load(str(ROOT / image_path), check_existing=False)
    material = common.plain_material(name, '#F1F7F8')
    shader = material.node_tree.nodes.get('Principled BSDF')
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    node.extension = 'EXTEND'
    material.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    if translucent:
        material.use_backface_culling = False
        if hasattr(material, 'surface_render_method'):
            material.surface_render_method = 'DITHERED'
        material.node_tree.links.new(node.outputs['Alpha'], shader.inputs['Alpha'])
    return material, image


skin, skin_image = painted_material('kun_skin', PAINT['body']['path'])
fin_material, fin_image = painted_material('kun_fin', PAINT['pectoral']['path'], True)
fluke_material, fluke_image = painted_material('kun_fin_fluke', PAINT['fluke']['path'], True)

ink = common.plain_material('kun_eye_ink', '#2B3746')
pleat_material = common.plain_material('kun_pleat', '#9FAFB8')
eye_rim = common.plain_material('kun_eye_rim', '#C8D4DA')

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
            # Mirrored flanks, continuous at both dorsal and belly midlines.
            # The atlas carries full flank coverage and a 40% ventral wash.
            return (loop / (LOOPS - 1), 1 - angle / math.pi)
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
generated_mesh = body.data
body.data = FROZEN_BODY_MESH
bpy.data.meshes.remove(generated_mesh)
body.data.materials.clear()
body.data.materials.append(skin)
FROZEN_BODY_CURRENT = body_freeze.fingerprint(body)
assert FROZEN_BODY_CURRENT == FROZEN_BODY_REFERENCE, 'Frozen body vertex positions or quad faces changed'
# Rewrap only the UV layer on the frozen, already-subdivided body. Geometry
# and polygon indices are never regenerated by a new UV parameterization.
body_uv = body.data.uv_layers.active
def surface_uv(co, side):
    x, y, z = co
    width, top, bottom = profile(y)
    radius_z = max((top - bottom) / 2, .001)
    phi = abs(math.atan2(x / max(width, .001), (z - (top + bottom) / 2) / radius_z))
    # Equal arc distance around the elliptical section avoids stretching the
    # upper back. Two flanks occupy separate halves of the atlas; ridge is .5.
    angles = np.linspace(0, math.pi, 129)
    speed = np.hypot(width * np.cos(angles), radius_z * np.sin(angles))
    arc = np.concatenate([[0], np.cumsum((speed[:-1] + speed[1:]) / 2)])
    fraction = float(np.interp(phi, angles, arc) / max(arc[-1], 1e-9))
    return (max(0, min(1, (y + 5.6) / 10.4)), .5 + side * .5 * fraction)

vertex_uv = {}
for polygon in body.data.polygons:
    side = 1 if sum(body.data.vertices[i].co.x for i in polygon.vertices) >= 0 else -1
    for loop_index in polygon.loop_indices:
        index = body.data.loops[loop_index].vertex_index
        key = (index, side)
        if key not in vertex_uv:
            vertex_uv[key] = surface_uv(body.data.vertices[index].co, side)
        body_uv.data[loop_index].uv = vertex_uv[key]

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
# The low ridge samples exactly the spine's longitudinal color. Only UVs
# change here; its geometry stays frozen and the mirrored seam stays aligned.
ridge = bpy.data.objects['kun_dorsal_ridge']
for loop in ridge.data.loops:
    y = ridge.data.vertices[loop.vertex_index].co.y
    ridge.data.uv_layers.active.data[loop.index].uv = ((y + 5.6) / 10.4, .5)



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
    factor = UPPER_FIN_SCALE if upper else LOWER_FIN_SCALE
    sweep = math.radians(UPPER_FIN_SWEEP_DEGREES if upper else LOWER_FIN_SWEEP_DEGREES)
    dihedral = math.radians(UPPER_FIN_DIHEDRAL_DEGREES if upper else LOWER_FIN_DIHEDRAL_DEGREES)
    span_axis = Vector((math.cos(sweep), math.sin(sweep), math.cos(sweep) * math.tan(dihedral)))
    chord_axis = Vector((-math.sin(sweep), math.cos(sweep), -math.sin(sweep) * math.tan(dihedral)))
    root = Vector((1.03 if upper else 1.00, -1.44 if upper else -.92, .45 if upper else -.62))
    points = []
    for u, v in zip(uu, vv):
        phase = max(0, min(1, u / np.linalg.norm(tip)))
        angle = math.radians(UPPER_FIN_TWIST_DEGREES if upper else LOWER_FIN_TWIST_DEGREES) * phase
        axis = span_axis.normalized()
        twisted = (chord_axis * math.cos(angle) + axis.cross(chord_axis) * math.sin(angle)
                   + axis * axis.dot(chord_axis) * (1 - math.cos(angle)))
        normal = span_axis.cross(twisted).normalized()
        if normal.z < 0:
            normal = -normal
        across = (v - vv.min()) / max(vv.max() - vv.min(), 1e-6)
        cup = (UPPER_FIN_CAMBER if upper else LOWER_FIN_CAMBER) * math.sin(math.pi * phase) * math.sin(math.pi * across)
        point = root + span_axis * (u * factor) + twisted * (v * factor) + normal * cup
        # Explicit anti-sail bound in the 25-degree preview's screen-up basis.
        # Symmetric for left/right; a smooth minimum bends rather than clips tips.
        limit = (BODY_SCREEN_TOP + FIN_MAX_PREVIEW_RISE_BODY_DEPTH * BODY_DEPTH - PREVIEW_UP.x * (abs(point.x) + point.y)) / PREVIEW_UP.z
        difference = point.z - limit
        point.z = point.z - .04 * (max(difference / .04, 0) + math.log1p(math.exp(-abs(difference / .04))))
        point.x *= sign
        points.append(tuple(point))
    obj = common.mesh(name, points, faces, fin_material, traced_sheets.uv_coordinates(pixels, faces, PAINT['pectoral']['referenceCrop']))
    crop = PAINT['pectoral']['referenceCrop']
    for key, pixel in [('finRootUV', source_root), ('finTipUV', source_tip)]:
        obj[key] = [(float(pixel[0]) - crop[0]) / (crop[2] - crop[0]),
                    1 - (float(pixel[1]) - crop[1]) / (crop[3] - crop[1])]
    sheet_stats.update({'sourceOutline': 'pectoral-image-left', 'scale': factor,
                        'dihedralDegrees': UPPER_FIN_DIHEDRAL_DEGREES if upper else LOWER_FIN_DIHEDRAL_DEGREES,
                        'sweepDegrees': UPPER_FIN_SWEEP_DEGREES if upper else LOWER_FIN_SWEEP_DEGREES,
                        'twistDegrees': UPPER_FIN_TWIST_DEGREES if upper else LOWER_FIN_TWIST_DEGREES, 'root': list(root),
                        'localCoordinateHash': hashlib.sha256(np.column_stack([np.clip(uu / np.linalg.norm(tip), 0, 1), (vv - vv.min()) / (vv.max() - vv.min())]).astype('<f4').tobytes()).hexdigest(),
                        'maxWorldZ': max(point[2] for point in points)})
    SHEET_STATS[name] = sheet_stats
    return obj


for upper in [True, False]:
    for sign, label in [(-1, 'L'), (1, 'R')]:
        fin(f'kun_fin_{"upper" if upper else "lower"}_{label}', sign, upper)

# One outer contour includes BOTH lobes, the stock bridge and center notch.
# Its root is embedded in the frozen stock; no separate lobe seams exist.
record = TRACE['outlines']['fluke-combined']
fluke_pixels, fluke_faces, fluke_stats = traced_sheets.patch(record)
outline = np.array(record['pixelsXY'])
fluke_pixels_per_unit = (outline[:, 0].max() - outline[:, 0].min()) / 6.70
fluke_root_y = record['attachmentReferenceY']
fluke_center_x = TRACE['alignment']['centerX']
fluke_points = []
for px, py in fluke_pixels:
    x = (fluke_center_x - px) / fluke_pixels_per_unit
    y = 3.40 + (py - fluke_root_y) / fluke_pixels_per_unit
    span = min(1, abs(x) / 3.35)
    chord = max(0, min(1, (py - fluke_root_y) / (outline[:, 1].max() - fluke_root_y)))
    z = .10 + .65 * math.sin(math.pi * span * .72) + .13 * math.sin(math.pi * chord) - .08 * chord
    if y <= 4.8:
        width, top, bottom = profile(y)
        stock_weight = max(0, 1 - (abs(x) / max(width, .001)) ** 4)
        exit_weight = max(0, min(1, (y - 4.25) / .65))
        exit_weight = exit_weight * exit_weight * (3 - 2 * exit_weight)
        z = z * (1 - stock_weight * (1 - exit_weight)) + ((top + bottom) / 2) * stock_weight * (1 - exit_weight)
    fluke_points.append((x, y, z))
common.mesh('kun_fluke', fluke_points, fluke_faces, fluke_material,
            traced_sheets.uv_coordinates(fluke_pixels, fluke_faces, PAINT['fluke']['referenceCrop']))
SHEET_STATS['fluke-continuous'] = fluke_stats
FLUKE_TOPOLOGY = traced_sheets.topology(fluke_faces)
assert FLUKE_TOPOLOGY['connectedComponents'] == 1 and FLUKE_TOPOLOGY['boundaryLoops'] == 1


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
    # Lower lateral lip, not the former upper-head/"eyebrow" arc. The corner
    # ends 0.22 units behind the fixed eye and below it (109° vs eye 98.55°).
    positions = [skin_point(-5.58 + t * 2.08, sign * (2.45 - .55 * t), .018) for t in np.linspace(0, 1, 32)]
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
for image in [skin_image, fin_image, fluke_image]:
    image.pack()
bpy.ops.export_scene.gltf(
    filepath=str(ROOT / '_dev/raw/kun.glb'), export_format='GLB',
    export_yup=True, export_apply=True, export_texcoords=True,
    export_normals=True, export_materials='EXPORT', export_image_format='AUTO', export_extras=True,
)
common.record('kun', {
    'triangles': triangles, 'quadRatio': quads / face_count,
    'bodyNonManifoldEdges': nonmanifold,
    'loopSpacingRatio': float(np.linalg.norm(np.diff(np.array(vertices).reshape(LOOPS, RADIAL, 3).mean(axis=1), axis=0), axis=1).max() /
                              np.linalg.norm(np.diff(np.array(vertices).reshape(LOOPS, RADIAL, 3).mean(axis=1), axis=0), axis=1).min()),
    'bodyLoops': LOOPS, 'radialSegments': RADIAL, 'subdivisionLevel': 1,
    'maxTextureSize': max(max(image.size) for image in [skin_image, fin_image, fluke_image]),
    'bbox': bbox, 'nodeNames': [obj.name for obj in objects],
    'engine': ARGS.engine, 'exitCode': 0, 'blenderVersion': bpy.app.version_string,
    'finAlpha': {'white': PAINT['pectoral']['lightAlpha'], 'ink': 1.0, 'edge': 'filled reference paint and subtle aft ink line on traced geometry'},
    'geometryReview': {
        'planformSource': 'blender/kun-planforms.json',
        'upperDihedralDegrees': UPPER_FIN_DIHEDRAL_DEGREES, 'lowerDihedralDegrees': LOWER_FIN_DIHEDRAL_DEGREES,
        'sweepDegrees': UPPER_FIN_SWEEP_DEGREES, 'upperFinScale': UPPER_FIN_SCALE, 'lowerFinScale': LOWER_FIN_SCALE, 'twistDegrees': UPPER_FIN_TWIST_DEGREES,
        'finCupDepth': UPPER_FIN_CAMBER, 'finPreviewRiseLimitBodyDepth': FIN_MAX_PREVIEW_RISE_BODY_DEPTH,
        'bodyLength': 10.4, 'flukeAnchor': [0, 3.40, .10],
        'dorsalRidgeHeight': .055, 'dorsalSpikeExtraHeight': 0,
        'eyeY': -3.72, 'eyePhiDegrees': math.degrees(1.72), 'eyeSizeScale': .5,
        'mouthPhiDegrees': [math.degrees(2.45), math.degrees(1.90)],
        'mouthCorner': list(skin_point(-3.50, 1.90, .018)),
        'fixedEyeCenter': list(skin_point(-3.72, 1.72, .030)),
        'eyeAboveMouthCorner': skin_point(-3.72, 1.72, .030)[2] > skin_point(-3.50, 1.90, .018)[2],
    },
    'tracedSheets': SHEET_STATS, 'flukeTopology': FLUKE_TOPOLOGY, 'paint': PAINT,
    'frozenBodyQuadGeometry': {'referenceCommit': '05d0664', 'identical': FROZEN_BODY_CURRENT == FROZEN_BODY_REFERENCE,
                               'reference': FROZEN_BODY_REFERENCE, 'current': FROZEN_BODY_CURRENT},
})
print('KUN_BUILD', json.dumps(json.loads((ROOT / '_dev/build/asset-stats.json').read_text())['kun']))
