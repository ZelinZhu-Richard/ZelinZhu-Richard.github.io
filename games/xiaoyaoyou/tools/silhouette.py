"""Fixed reference-mask extraction, Blender render, IoU comparison, and pairs.

Render in Blender; compare/pair with /opt/anaconda3/bin/python3. No installs.
The cameras and mask normalization are intentionally independent of scores.
"""
import argparse
import json
import math
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '_dev/silhouette'
EXPECTED = {
    'kun': {'side': (5, 194, 1254, 569), 'top': (1223, 21, 1632, 731), 'front': (1624, 190, 2067, 531)},
    'peng': {'top': (6, 14, 1760, 555), 'front': (0, 518, 1085, 849), 'side': (1118, 540, 1773, 852)},
}
# Richard's recorded decision: Kun front is by eye only; no front score gate.
THRESHOLDS = {'kun': {'side': .70, 'top': .75}, 'peng': {'top': .75}}
BG = {'kun': (155, 156, 158), 'peng': (176, 175, 175)}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def reference_views(asset):
    import numpy as np
    from PIL import Image
    from scipy import ndimage as ndi
    image = Image.open(ROOT / 'ref' / f'{asset}-sheet.png').convert('RGB')
    pixels = np.asarray(image).astype(float)
    original = np.linalg.norm(pixels - np.array(BG[asset]), axis=2) > 30
    # Dilation ONLY groups components; it does not inflate the compared mask.
    labels, count = ndi.label(ndi.binary_dilation(original, iterations=6))
    areas = np.bincount(labels.ravel())
    primary = (np.argsort(areas[1:])[-3:] + 1).tolist()
    assignments, boxes, centers = {}, {}, {}
    for index in primary:
        yy, xx = np.where(labels == index)
        box = (int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max()))
        name = min(EXPECTED[asset], key=lambda view: sum((a - b) ** 2 for a, b in zip(box, EXPECTED[asset][view])))
        assert name not in assignments, f'Duplicate reference view: {name}'
        assert max(abs(a - b) for a, b in zip(box, EXPECTED[asset][name])) <= 10, f'Bad {asset} {name} reference box: {box}'
        assignments[name] = [index]
        boxes[name] = box
        centers[name] = np.array([xx.mean(), yy.mean()])
    # Detached brush flecks are assigned by proximity, never by overlapping crops.
    for index in range(1, count + 1):
        if index in primary:
            continue
        yy, xx = np.where(labels == index)
        center = np.array([xx.mean(), yy.mean()])
        name = min(centers, key=lambda view: np.linalg.norm(center - centers[view]))
        assignments[name].append(index)
    result = {}
    for view, indices in assignments.items():
        mask = ndi.binary_fill_holes(original & np.isin(labels, indices))
        result[view] = (image, mask, boxes[view])
    return result


def bounds(mask):
    import numpy as np
    from scipy import ndimage as ndi
    labels, count = ndi.label(mask)
    areas = np.bincount(labels.ravel())
    good = [i for i in range(1, count + 1) if areas[i] >= mask.sum() * .002]
    yy, xx = np.where(np.isin(labels, good))
    if not len(xx):
        raise ValueError('Empty silhouette')
    return (int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1)


def normalize(mask):
    import numpy as np
    from PIL import Image, ImageFilter
    box = bounds(mask)
    image = Image.fromarray((mask * 255).astype(np.uint8)).crop(box)
    factor = 240 / max(image.size)
    size = tuple(max(1, round(axis * factor)) for axis in image.size)
    image = image.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new('L', (256, 256))
    canvas.paste(image, ((256 - size[0]) // 2, (256 - size[1]) // 2))
    softened = canvas.filter(ImageFilter.GaussianBlur(1.5))
    return np.asarray(softened) >= 128, box


def fitted_image(image, box, background):
    from PIL import Image
    image = image.convert('RGB').crop(box)
    image.thumbnail((480, 480), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', (512, 512), background)
    canvas.paste(image, ((512 - image.width) // 2, (512 - image.height) // 2))
    return canvas


def compare(asset):
    import numpy as np
    from PIL import Image, ImageDraw
    render_meta = json.loads((OUT / 'raw' / f'{asset}-render.json').read_text())
    current_commit = git('rev-parse', 'HEAD')
    if render_meta['commit'] != current_commit:
        raise ValueError('Render commit differs from HEAD; rerender clean evidence.')
    report = {
        'generator': 'tools/silhouette.py', 'commit': current_commit,
        'dirty': bool(git('status', '--porcelain')), 'asset': asset, 'engine': render_meta['engine'],
        'procedure': {'maskDistance': 30, 'groupDilationPx': 6, 'boxSpeckFraction': .002,
                      'canvasPx': 256, 'longSidePx': 240, 'gaussianSigmaPx': 1.5, 'threshold': .5},
        'views': {},
    }
    references = reference_views(asset)
    for view in ['side', 'top', 'front'] if asset == 'kun' else ['top', 'side']:
        original, mask, ref_box = references[view]
        mask_image = Image.open(OUT / 'raw' / f'{asset}-{view}-mask.png').convert('RGBA')
        render_mask = np.asarray(mask_image)[:, :, 3] >= 128
        reference, ref_crop = normalize(mask)
        rendered, render_crop = normalize(render_mask)
        iou = float((reference & rendered).sum() / (reference | rendered).sum())
        threshold = THRESHOLDS[asset].get(view)
        report['views'][view] = {
            'iou': iou if threshold is not None else None, 'threshold': threshold,
            'pass': bool(iou >= threshold) if threshold is not None else None,
            'refBox': ref_box, 'refCrop': ref_crop,
            'refAspect': (ref_crop[2] - ref_crop[0]) / (ref_crop[3] - ref_crop[1]),
            'renderAspect': (render_crop[2] - render_crop[0]) / (render_crop[3] - render_crop[1]),
        }
        # 512 px panels. Both are fitted uniformly to the same square, preserving
        # proportions; the overlay is exactly the two 256 px masks scored above.
        # The boxes overlap; show only the assigned component in this preview.
        # The scored reference masks and the source image are unchanged.
        isolated = np.array(original)
        isolated[~mask] = BG[asset]
        ref_preview = fitted_image(Image.fromarray(isolated), ref_crop, BG[asset])
        lit = Image.open(OUT / 'raw' / f'{asset}-{view}-preview.png')
        render_preview = fitted_image(lit, render_crop, BG[asset])
        overlay = np.full((256, 256, 3), 245, dtype=np.uint8)
        overlay[reference & rendered] = (125, 125, 125)
        overlay[reference & ~rendered] = (50, 116, 206)
        overlay[rendered & ~reference] = (213, 70, 60)
        overlay = Image.fromarray(overlay).resize((512, 512), Image.Resampling.NEAREST)
        combined = Image.new('RGB', (1536, 554), BG[asset])
        for i, panel in enumerate([ref_preview, render_preview, overlay]):
            combined.paste(panel, (512 * i, 42))
        draw = ImageDraw.Draw(combined)
        for i, label in enumerate(['REFERENCE', f'BLENDER {render_meta["engine"].upper()}', 'OVERLAP grey / REFERENCE blue / RENDER red']):
            draw.text((512 * i + 14, 14), label, fill=(20, 25, 30))
        combined.save(OUT / f'{asset}-{view}.png')
    # All previous heroes retain their fixed thresholds when they exist.
    regressions = {}
    for filename in OUT.glob('*.json'):
        if filename.name == f'{asset}.json':
            continue
        previous = json.loads(filename.read_text())
        if previous.get('asset') in THRESHOLDS:
            regressions[previous['asset']] = all(entry['pass'] for entry in previous['views'].values() if entry['threshold'] is not None)
    report['regressions'] = regressions
    (OUT / f'{asset}.json').write_text(json.dumps(report, indent=2) + '\n')
    print('View      IoU       Required   Result    Reference aspect   Render aspect')
    for view, entry in report['views'].items():
        if entry['threshold'] is None:
            print(f'{view:8}  visual only')
        else:
            print(f'{view:8}  {entry["iou"]:.4f}    {entry["threshold"]:.2f}       {"PASS" if entry["pass"] else "FAIL":6}    {entry["refAspect"]:.3f}              {entry["renderAspect"]:.3f}')
    if not all(entry['pass'] for entry in report['views'].values() if entry['threshold'] is not None):
        return 2
    return 0


def render(asset, engine):
    import bpy
    from mathutils import Vector
    sys.path.insert(0, str(ROOT / 'blender'))
    import common
    started = time.monotonic()
    scene = common.setup(engine)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / '_dev/raw' / f'{asset}.glb'))
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    center = Vector([(min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(3)])
    world = bpy.data.worlds.new('Reference sheet grey')
    world.use_nodes = True
    world.node_tree.nodes.get('Background').inputs['Color'].default_value = tuple(common.srgb(v / 255) for v in BG[asset]) + (1,)
    world.node_tree.nodes.get('Background').inputs['Strength'].default_value = 1
    scene.world = world
    for name, position, power, size in [('Soft top light', (1, -4, 9), 650, 8), ('Soft fill', (-6, 3, 5), 300, 10)]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = power
        data.shape = 'DISK'
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = position
        common.look_at(obj, center)
    camera_data = bpy.data.cameras.new('Fixed orthographic sheet camera')
    camera_data.type = 'ORTHO'
    camera = bpy.data.objects.new('Fixed orthographic sheet camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.resolution_x = scene.render.resolution_y = 1024
    original_materials = {obj.name: list(obj.data.materials) for obj in meshes}
    mask_material = bpy.data.materials.new('Opaque white silhouette override')
    mask_material.use_nodes = True
    nodes = mask_material.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (1, 1, 1, 1)
    mask_material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    # Interior translucency counts solid. Only the independent two-pixel
    # feather at the geometry boundary may cut the silhouette.
    fin_masks = {}
    for original in {mat for mats in original_materials.values() for mat in mats if mat.name.startswith('kun_fin')}:
        fin_mask = mask_material.copy()
        nodes = fin_mask.node_tree.nodes
        links = fin_mask.node_tree.links
        fin_output = next(node for node in nodes if node.type == 'OUTPUT_MATERIAL')
        fin_emission = next(node for node in nodes if node.type == 'EMISSION')
        fin_image = next(node.image for node in original.node_tree.nodes if node.type == 'TEX_IMAGE')
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = fin_image
        threshold = nodes.new('ShaderNodeMath')
        threshold.operation = 'GREATER_THAN'
        threshold.inputs[1].default_value = .1
        links.new(tex.outputs['Alpha'], threshold.inputs[0])
        transparent = nodes.new('ShaderNodeBsdfTransparent')
        mix = nodes.new('ShaderNodeMixShader')
        links.new(threshold.outputs[0], mix.inputs[0])
        links.new(transparent.outputs[0], mix.inputs[1])
        links.new(fin_emission.outputs[0], mix.inputs[2])
        links.new(mix.outputs[0], fin_output.inputs['Surface'])
        fin_masks[original.name] = fin_mask
    # -X makes forward -Y read head-right. No score-tuned angle or projection.
    elevation = math.radians(25)
    gameplay_elevation = math.radians(30)
    orientations = {'side': Vector((-1, 0, 0)), 'top': Vector((0, 0, 1)), 'front': Vector((0, -1, 0)),
                    'three-quarter': Vector((-math.cos(elevation) / math.sqrt(2),
                                             -math.cos(elevation) / math.sqrt(2), math.sin(elevation))),
                    'gameplay': Vector((-math.cos(gameplay_elevation) / math.sqrt(2),
                                        math.cos(gameplay_elevation) / math.sqrt(2), math.sin(gameplay_elevation)))}
    views = ['side', 'top', 'front', 'three-quarter', 'gameplay'] if asset == 'kun' else ['top', 'side']
    preview_measurements = {}
    for view in views:
        camera_data.type = 'ORTHO'
        camera.location = center + orientations[view] * 30
        common.look_at(camera, center)
        if view == 'top':
            camera.rotation_euler.rotate_axis('Z', math.pi)
        inverse = camera.rotation_euler.to_matrix().transposed()
        projected = [inverse @ (point - center) for point in points]
        extent = max(max(point[i] for point in projected) - min(point[i] for point in projected) for i in (0, 1))
        camera_data.ortho_scale = extent * 1.08
        if view in ('three-quarter', 'gameplay'):
            # Added by Richard: a by-eye perspective preview, never scored.
            camera_data.type = 'PERSP'
            camera_data.angle = math.radians(42)
            tan_half = math.tan(camera_data.angle / 2)
            distance = max(max(abs(point.x), abs(point.y)) / tan_half + point.z for point in projected) * 1.08
            camera.location = center + orientations[view] * distance
            common.look_at(camera, center)
        scene.render.film_transparent = False
        for obj in meshes:
            obj.data.materials.clear()
            for material in original_materials[obj.name]:
                obj.data.materials.append(material)
        scene.render.filepath = str(OUT / 'raw' / f'{asset}-{view}-preview.png')
        bpy.ops.render.render(write_still=True)
        if asset == 'kun' and view in ('side', 'front'):
            from bpy_extras.object_utils import world_to_camera_view
            head_obj = next(obj for obj in meshes if obj.name == 'kun_body')
            head = [head_obj.matrix_world @ vertex.co for vertex in head_obj.data.vertices
                    if (head_obj.matrix_world @ vertex.co).y < -3.1]
            projected_head = [world_to_camera_view(scene, camera, point) for point in head]
            x0, x1 = min(point.x for point in projected_head), max(point.x for point in projected_head)
            y0, y1 = min(point.y for point in projected_head), max(point.y for point in projected_head)
            margin = max(x1 - x0, y1 - y0) * .12
            border = [max(0, x0 - margin), max(0, y0 - margin), min(1, x1 + margin), min(1, y1 + margin)]
            scene.render.resolution_x = scene.render.resolution_y = 4096
            scene.render.use_border = True
            scene.render.use_crop_to_border = True
            scene.render.border_min_x, scene.render.border_min_y = border[:2]
            scene.render.border_max_x, scene.render.border_max_y = border[2:]
            scene.render.filepath = str(OUT / f'{asset}-{view}-head-closeup.png')
            bpy.ops.render.render(write_still=True)
            scene.render.use_border = False
            scene.render.use_crop_to_border = False
            scene.render.resolution_x = scene.render.resolution_y = 1024
            preview_measurements[f'{view}HeadCloseup'] = {'cameraUnchanged': True, 'fullFrameResolution': 4096, 'border': border}
        if view in ('three-quarter', 'gameplay'):
            bpy.data.images['Render Result'].save_render(str(OUT / f'{asset}-{view}.png'), scene=scene)
            if view == 'gameplay':
                from bpy_extras.object_utils import world_to_camera_view
                closeup_metadata = {}
                for object_name, label in [('kun_fin_upper_L', 'pectoral'), ('kun_fluke', 'fluke')]:
                    target = next(obj for obj in meshes if obj.name == object_name)
                    projected_target = [world_to_camera_view(scene, camera, target.matrix_world @ vertex.co)
                                        for vertex in target.data.vertices]
                    x0 = min(point.x for point in projected_target)
                    x1 = max(point.x for point in projected_target)
                    y0 = min(point.y for point in projected_target)
                    y1 = max(point.y for point in projected_target)
                    margin = max(x1 - x0, y1 - y0) * .12
                    border = [max(0, x0 - margin), max(0, y0 - margin), min(1, x1 + margin), min(1, y1 + margin)]
                    scene.render.resolution_x = scene.render.resolution_y = 4096
                    scene.render.use_border = True
                    scene.render.use_crop_to_border = True
                    scene.render.border_min_x, scene.render.border_min_y = border[:2]
                    scene.render.border_max_x, scene.render.border_max_y = border[2:]
                    scene.render.filepath = str(OUT / f'{asset}-gameplay-{label}-closeup.png')
                    bpy.ops.render.render(write_still=True)
                    closeup_metadata[label] = {'cameraUnchanged': True, 'fullFrameResolution': 4096, 'border': border}
                scene.render.use_border = False
                scene.render.use_crop_to_border = False
                scene.render.resolution_x = scene.render.resolution_y = 1024
                preview_measurements['gameplayCloseups'] = closeup_metadata
            if view == 'three-quarter':
                from bpy_extras.object_utils import world_to_camera_view
                body_obj = next(obj for obj in meshes if obj.name == 'kun_body')
                body_vertices = [body_obj.matrix_world @ vertex.co for vertex in body_obj.data.vertices]
                back_y = max(world_to_camera_view(scene, camera, point).y for point in body_vertices)
                z_min = min(point.z for point in body_vertices)
                z_max = max(point.z for point in body_vertices)
                depth = abs(world_to_camera_view(scene, camera, Vector((0, -2.7, z_max))).y -
                            world_to_camera_view(scene, camera, Vector((0, -2.7, z_min))).y)
                fin_y = max(world_to_camera_view(scene, camera, obj.matrix_world @ vertex.co).y
                            for obj in meshes if obj.name.startswith('kun_fin_') for vertex in obj.data.vertices)
                preview_measurements['finRiseAboveBackBodyDepthRatio'] = max(0, fin_y - back_y) / depth
                preview_measurements['bodyDepthProjection'] = 'vertical body-depth segment at x=0,y=-2.7, same perspective camera'
            continue
        for obj in meshes:
            obj.data.materials.clear()
            for original in original_materials[obj.name]:
                obj.data.materials.append(fin_masks.get(original.name, mask_material))
        scene.render.film_transparent = True
        scene.render.filepath = str(OUT / 'raw' / f'{asset}-{view}-mask.png')
        bpy.ops.render.render(write_still=True)
    entry = {
        'generator': 'tools/silhouette.py', 'commit': git('rev-parse', 'HEAD'),
        'dirty': bool(git('status', '--porcelain')), 'engine': engine, 'exitCode': 0,
        'seconds': round(time.monotonic() - started, 3), 'views': views,
        'resolution': 1024, 'cameraFitPadding': 1.08,
        'previewCameras': {'three-quarter': {'projection': 'perspective', 'azimuthFromFrontDegrees': -45,
                                            'elevationDegrees': 25, 'fovDegrees': 42},
                          'gameplay': {'projection': 'perspective', 'azimuthFromFrontDegrees': -135,
                                       'elevationDegrees': 30, 'fovDegrees': 42}} if asset == 'kun' else {},
        'previewMeasurements': preview_measurements,
    }
    validation_file = ROOT / '_dev/build/kun-validation.json'
    if asset == 'kun' and validation_file.exists():
        entry['buildValidation'] = json.loads(validation_file.read_text())
    (OUT / 'raw' / f'{asset}-render.json').write_text(json.dumps(entry, indent=2) + '\n')
    filename = ROOT / '_dev/build/asset-stats.json'
    stats = json.loads(filename.read_text())
    stats[asset].setdefault('renderRuns', []).append(entry)
    filename.write_text(json.dumps(stats, indent=2) + '\n')
    print('SILHOUETTE_RENDER', json.dumps(entry))


def pair(left, right, output):
    from PIL import Image
    images = [Image.open(filename).convert('RGB') for filename in (left, right)]
    for image in images:
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', (sum(image.width for image in images), max(image.height for image in images)), (155, 156, 158))
    x = 0
    for image in images:
        canvas.paste(image, (x, (canvas.height - image.height) // 2))
        x += image.width
    destination = Path(output).resolve()
    if not destination.is_relative_to(OUT.resolve()):
        raise ValueError('Pair output must stay under _dev/silhouette/')
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--render', choices=['kun', 'peng'])
    group.add_argument('--compare', choices=['kun', 'peng'])
    group.add_argument('--pair', nargs=3)
    parser.add_argument('--engine', choices=['eevee', 'cycles'])
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    OUT.mkdir(parents=True, exist_ok=True)
    if args.render:
        if not args.engine:
            parser.error('--render requires --engine')
        render(args.render, args.engine)
    elif args.compare:
        raise SystemExit(compare(args.compare))
    else:
        pair(*args.pair)
