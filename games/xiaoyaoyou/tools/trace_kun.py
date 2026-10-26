"""Extract code-modeling outlines from the full-resolution Kun top mask.

The frozen body's own exported triangles are projected and subtracted first.
No hand-authored width arrays, downloaded geometry, or edited reference art.
Run with the existing Anaconda Python; no installs.
"""
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage.measure import approximate_polygon, find_contours
from silhouette import ROOT, bounds, reference_views


def read_glb(filename):
    binary = Path(filename).read_bytes()
    json_size = struct.unpack_from('<I', binary, 12)[0]
    document = json.loads(binary[20:20 + json_size])
    start = 28 + json_size

    def accessor(index):
        value = document['accessors'][index]
        view = document['bufferViews'][value['bufferView']]
        count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[value['type']]
        dtype = np.dtype({5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[value['componentType']])
        offset = start + view.get('byteOffset', 0) + value.get('byteOffset', 0)
        stride = view.get('byteStride', count * dtype.itemsize)
        return np.ndarray((value['count'], count), dtype=dtype, buffer=binary, offset=offset,
                          strides=(stride, dtype.itemsize)).copy()

    return document, accessor


def frozen_fingerprints(filename):
    document, accessor = read_glb(filename)
    hashes = {}
    for node in document['nodes']:
        name = node.get('name', '')
        if 'mesh' not in node:
            continue
        if name.startswith(('kun_fin_', 'kun_eye_')) or name == 'kun_fluke':
            continue
        digest = hashlib.sha256()
        for primitive in document['meshes'][node['mesh']]['primitives']:
            for key, index in sorted(primitive['attributes'].items()):
                digest.update(key.encode())
                digest.update(accessor(index).tobytes())
            digest.update(accessor(primitive['indices']).tobytes())
        hashes[name] = digest.hexdigest()
    return hashes


def trace():
    glb = ROOT / '_dev/raw/kun.glb'
    document, accessor = read_glb(glb)
    image, top, _ = reference_views('kun')['top']
    box = bounds(top)
    head_rows = range(box[1] + 8, box[1] + 108)
    center_x = float(np.median([(np.where(top[y])[0].min() + np.where(top[y])[0].max()) / 2 for y in head_rows]))
    vertices = []
    for node in document['nodes']:
        if 'mesh' in node:
            for primitive in document['meshes'][node['mesh']]['primitives']:
                vertices.append(accessor(primitive['attributes']['POSITION']))
    all_positions = np.concatenate(vertices)
    nose = float((-all_positions[:, 2]).min())
    tail = float((-all_positions[:, 2]).max())
    scale = (box[3] - box[1] - 1) / (tail - nose)
    body_node = next(node for node in document['nodes'] if node.get('name') == 'kun_body')
    assert not any(key in body_node for key in ('matrix', 'translation', 'rotation', 'scale')), 'Unexpected frozen-body transform'
    body_image = Image.new('1', image.size)
    draw = ImageDraw.Draw(body_image)
    for primitive in document['meshes'][body_node['mesh']]['primitives']:
        positions = accessor(primitive['attributes']['POSITION'])
        indices = accessor(primitive['indices']).reshape(-1, 3)
        # Same top orientation as the fixed camera: screen right is Blender -X.
        projected = np.column_stack([center_x - positions[:, 0] * scale,
                                     box[1] + (-positions[:, 2] - nose) * scale])
        for triangle in indices:
            draw.polygon([tuple(point) for point in projected[triangle]], fill=1)
    body = np.asarray(body_image, dtype=bool)
    remainder = top & ~body
    labels, _ = ndi.label(remainder)
    areas = np.bincount(labels.ravel())
    four = (np.argsort(areas[1:])[-4:] + 1).tolist()
    result = {
        'generator': 'tools/trace_kun.py',
        'source': 'ref/kun-sheet.png',
        'sourceSha256': hashlib.sha256((ROOT / 'ref/kun-sheet.png').read_bytes()).hexdigest(),
        'frozenGeometry': frozen_fingerprints(glb),
        'alignment': {'centerX': center_x, 'referenceNoseY': box[1], 'modelNoseY': nose,
                      'pixelsPerUnit': scale, 'method': 'uniform full-length alignment; own body triangles subtracted'},
        'procedure': {'fullResolution': list(image.size), 'outlineGaussianSigmaPx': .65,
                      'targetOutlinePoints': [60, 120], 'bodyMaskDilation': 0},
        'outlines': {},
    }
    for index in four:
        region = labels == index
        yy, xx = np.where(region)
        side = 'image-left' if xx.mean() < center_x else 'image-right'
        kind = 'pectoral' if yy.mean() < 500 else 'fluke'
        # Only light subpixel smoothing of the extracted region; no shape fit.
        smooth = ndi.gaussian_filter(region.astype(float), .65) >= .5
        contour = max(find_contours(smooth.astype(float), .5), key=len)
        lo, hi = .01, 6.0
        for _ in range(32):
            tolerance = (lo + hi) / 2
            outline = approximate_polygon(contour, tolerance=tolerance)
            if len(outline) > 101:
                lo = tolerance
            else:
                hi = tolerance
        outline = approximate_polygon(contour, tolerance=hi)
        if np.linalg.norm(outline[0] - outline[-1]) < 1e-5:
            outline = outline[:-1]
        assert 60 <= len(outline) <= 120, f'Outline count: {len(outline)}'
        # Find the cut edge where the region meets the frozen body mask.
        distance = ndi.distance_transform_edt(~body)
        contact = ndi.map_coordinates(distance, outline.T, order=1, mode='nearest') <= 2.5
        assert contact.sum() >= 2, f'No body-root contact for {kind} {side}'
        root_yx = outline[contact].mean(axis=0)
        tip_index = int(np.linalg.norm(outline - root_yx, axis=1).argmax())
        result['outlines'][f'{kind}-{side}'] = {
            'pixelsXY': [[round(float(x), 4), round(float(y), 4)] for y, x in outline],
            'rootXY': [float(root_yx[1]), float(root_yx[0])], 'tipIndex': tip_index,
            'pixelArea': int(region.sum()), 'rawContourPoints': len(contour),
            'simplifiedPoints': len(outline), 'simplificationTolerancePx': hi,
            'bodyContactPoints': int(contact.sum()),
        }
    assert len(result['outlines']) == 4
    output = ROOT / 'blender/kun-planforms.json'
    output.write_text(json.dumps(result, indent=2) + '\n')
    # Working segmentation proof, not a replacement for Blender evidence.
    diagnostic = np.zeros((*top.shape, 3), dtype=np.uint8) + 155
    diagnostic[top] = (225, 216, 193)
    diagnostic[body] = (75, 85, 95)
    colors = [(190, 70, 60), (55, 115, 190), (190, 150, 65), (115, 80, 160)]
    for index, color in zip(four, colors):
        diagnostic[labels == index] = color
    Image.fromarray(diagnostic).crop((box[0] - 8, box[1] - 8, box[2] + 8, box[3] + 8)).save(ROOT / '_dev/tmp/kun-trace-segmentation.png')
    print(json.dumps({
        'output': str(output), 'alignment': result['alignment'],
        'outlines': {key: {name: item[name] for name in ('simplifiedPoints', 'pixelArea', 'bodyContactPoints', 'rootXY', 'tipIndex')}
                     for key, item in result['outlines'].items()},
    }, indent=2))


if __name__ == '__main__':
    trace()
