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

# A thin, low crest follows the spine. Its one slim spike is a local increase
# in the crest height, not a volumetric bump in the body cross-section.
ridge_vertices, ridge_faces, ridge_uvs = [], [], []
RIDGE_LOOPS = 81
for i in range(RIDGE_LOOPS):
    y = -3.35 + 5.8 * i / (RIDGE_LOOPS - 1)
    _, top, _ = profile(y)
    taper = math.sin(math.pi * i / (RIDGE_LOOPS - 1)) ** .5
    height = .055 * taper + .44 * math.exp(-((y + .95) / .12) ** 2)
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


def fin(name, sign, upper):
    # s, leading y, trailing y. Preserve a broad chord while placing each
    # pair in its own plane; dihedral is measured from the transverse horizontal.
    sections = np.array([
        [0, -2.20, -.10], [.18, -2.20, .20], [.38, -2.00, .75],
        [.60, -1.30, 1.15], [.80, -.60, 1.60], [1, .80, 1.00],
    ] if upper else [
        [0, -1.96, .12], [.18, -1.65, .80], [.38, -1.20, 1.65],
        [.60, -.60, 2.35], [.80, .25, 2.75], [1, 1.75, 1.92],
    ])
    span, chord = 36, 14
    points, polygons, coordinates = [], [], []
    reach = 2.14 if upper else 2.50
    root = 1.05 if upper else 1.10
    root_z = .62 if upper else -.62
    dihedral = math.radians(30 if upper else -55)
    for i in range(span + 1):
        s = i / span
        lead, trail = [float(np.interp(s, sections[:, 0], sections[:, col])) for col in (1, 2)]
        for j in range(chord + 1):
            c = j / chord
            cut = (.065 * math.sin(49 * s) + .045 * math.sin(101 * s + .7)) * s ** .7 * c ** 6
            x = sign * (root + reach * s * math.cos(dihedral))
            y = lead * (1 - c) + trail * c + cut
            z = root_z + reach * s * math.sin(dihedral)
            camber = .10 * math.sin(math.pi * c) * math.sin(math.pi * s)
            if upper:
                # Outer third curls upward beyond the base 30-degree dihedral.
                curl = .28 * max(0, (s - 2 / 3) * 3) ** 2
                twist = -.40 * math.sin(math.pi * s) * c
            else:
                curl = 0
                # Chordwise roll gives the steep lower fin a broad frontal fan.
                twist = .75 * math.sin(math.pi * s) * (c - .5)
            points.append((x, y, z + camber + twist + curl))
    for i in range(span):
        for j in range(chord):
            a = i * (chord + 1) + j
            polygons.append((a, a + chord + 1, a + chord + 2, a + 1))
            coordinates.append([(i / span, j / chord), ((i + 1) / span, j / chord), ((i + 1) / span, (j + 1) / chord), (i / span, (j + 1) / chord)])
    return common.mesh(name, points, polygons, fin_material, coordinates)


for upper in [True, False]:
    for sign, label in [(-1, 'L'), (1, 'R')]:
        fin(f'kun_fin_{"upper" if upper else "lower"}_{label}', sign, upper)

# The fluke is a continuous two-lobed sheet. Chordwise samples preserve the
# central notch and swept crescents, without borrowing the wave image's outline.
points, polygons, coordinates = [], [], []
SPAN, CHORD = 80, 12
for i in range(SPAN + 1):
    t = -1 + 2 * i / SPAN
    s = abs(t)
    x = t * 3.35
    fluke_sections = np.array([
        [0, 3.40, 4.90], [.2, 3.55, 5.35], [.4, 3.80, 5.85],
        [.6, 4.25, 6.60], [.8, 4.90, 6.45], [1, 6.10, 6.15],
    ])
    leading = float(np.interp(s, fluke_sections[:, 0], fluke_sections[:, 1]))
    trailing = float(np.interp(s, fluke_sections[:, 0], fluke_sections[:, 2]))
    for j in range(CHORD + 1):
        c = j / CHORD
        ragged = (.055 * math.sin(63 * t) + .035 * math.sin(137 * t)) * c ** 7
        y = leading * (1 - c) + trailing * c + ragged
        z = .10 + .65 * math.sin(math.pi * s * .72) + .13 * math.sin(math.pi * c) - .08 * c
        points.append((x, y, z))
for i in range(SPAN):
    for j in range(CHORD):
        a = i * (CHORD + 1) + j
        polygons.append((a, a + CHORD + 1, a + CHORD + 2, a + 1))
        coordinates.append([(i / SPAN, j / CHORD), ((i + 1) / SPAN, j / CHORD), ((i + 1) / SPAN, (j + 1) / CHORD), (i / SPAN, (j + 1) / CHORD)])
common.mesh('kun_fluke', points, polygons, fin_material, coordinates)


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
    center_y, center_phi = -4.05, sign * 1.47
    for material, radius, name in [(eye_rim, .145, 'rim'), (ink, .083, 'pupil')]:
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
        'upperDihedralDegrees': 30, 'upperOuterThirdCurl': .28,
        'lowerDihedralDegrees': -55, 'lowerRootBodyFractions': [.35, .55],
        'bodyLength': 10.4, 'dorsalRidgeHalfWidth': .022,
        'dorsalRidgeHeight': .055, 'dorsalSpikeExtraHeight': .44,
        'eyeY': -4.05, 'eyePhiDegrees': math.degrees(1.47),
    },
})
print('KUN_BUILD', json.dumps(json.loads((ROOT / '_dev/build/asset-stats.json').read_text())['kun']))
