"""Verify frozen geometry, exported UV scale invariance, and fluke continuity."""
import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
from trace_kun import read_glb

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / '_dev/build'
BASELINE = ROOT / '_dev/tmp/kun-frozen-geometry.json'


def inspect():
    document, accessor = read_glb(ROOT / '_dev/raw/kun.glb')
    geometry, uv, counts = {}, {}, {}
    for node in document['nodes']:
        if 'mesh' not in node:
            continue
        name = node.get('name', '')
        rows, uv_parts = [], []
        triangles = 0
        for primitive in document['meshes'][node['mesh']]['primitives']:
            positions = accessor(primitive['attributes']['POSITION'])
            normals = accessor(primitive['attributes']['NORMAL'])
            indices = accessor(primitive['indices']).reshape(-1, 3)
            triangles += len(indices)
            attributes = np.column_stack([positions, normals]).astype('<f4')
            rows.extend(b''.join(sorted(vertex.tobytes() for vertex in triangle)) for triangle in attributes[indices])
            if 'TEXCOORD_0' in primitive['attributes']:
                uv_parts.append(accessor(primitive['attributes']['TEXCOORD_0']).astype('<f4').tobytes())
        geometry[name] = hashlib.sha256(b''.join(sorted(rows))).hexdigest()
        uv[name] = hashlib.sha256(b''.join(uv_parts)).hexdigest()
        counts[name] = triangles
    data = (ROOT / '_dev/raw/kun.glb').read_bytes()
    binary_start = 28 + struct.unpack_from('<I', data, 12)[0]
    image_hashes = {}
    for image in document.get('images', []):
        view = document['bufferViews'][image['bufferView']]
        start = binary_start + view.get('byteOffset', 0)
        image_hashes[image.get('name', str(image['bufferView']))] = hashlib.sha256(data[start:start + view['byteLength']]).hexdigest()
    return {'geometry': geometry, 'uv': uv, 'triangleCounts': counts, 'images': image_hashes}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--scale', type=float)
    parser.add_argument('--body-mouth-only', action='store_true', help='Explicitly authorized mouth exception; freeze all other geometry')
    args = parser.parse_args()
    current = inspect()
    if args.baseline:
        BASELINE.write_text(json.dumps(current, indent=2) + '\n')
        print('Saved pre-pass geometry fingerprints (UV excluded).')
        return
    before = json.loads(BASELINE.read_text())
    if args.body_mouth_only:
        frozen_names = [name for name in before['geometry'] if not name.startswith('kun_mouth_')]
    else:
        frozen_names = [name for name in before['geometry'] if not name.startswith('kun_fin_') and name != 'kun_fluke']
    stats = json.loads((BUILD / 'asset-stats.json').read_text())['kun']
    actual_scale = stats['geometryReview']['upperFinScale']
    if args.scale is None or abs(actual_scale - args.scale) > 1e-9:
        raise SystemExit(f'Refusing stale validation: requested {args.scale}, exported build scale is {actual_scale}')
    frozen = all(before['geometry'][name] == current['geometry'][name] for name in frozen_names if name != 'kun_body')
    frozen = frozen and stats.get('frozenBodyQuadGeometry', {}).get('identical', False)
    snapshot = {'scale': args.scale, 'frozenGeometryIdentical': frozen,
                'frozenObjectsChecked': len(frozen_names),
                'bodyQuadGeometry': stats.get('frozenBodyQuadGeometry'),
                'bodyExportTriangleRepresentationChangedWithUVs': before['geometry']['kun_body'] != current['geometry']['kun_body'],
                'finUV': {name: value for name, value in current['uv'].items() if name.startswith('kun_fin_')},
                'localCoordinateHashes': {name: value['localCoordinateHash'] for name, value in stats['tracedSheets'].items() if name.startswith('kun_fin_')},
                'exportedTriangles': sum(current['triangleCounts'].values()),
                'flukeTopology': stats['flukeTopology']}
    if args.body_mouth_only:
        fin_images = {name: value for name, value in before['images'].items() if 'pectoral' in name or 'fluke' in name}
        snapshot['authorizedGeometryExceptions'] = [name for name in before['geometry'] if name.startswith('kun_mouth_')]
        snapshot['finFlukeTexturesIdentical'] = len(fin_images) == 2 and all(current['images'].get(name) == value for name, value in fin_images.items())
        snapshot['finFlukeUVIdentical'] = all(before['uv'][name] == current['uv'][name] for name in before['uv'] if name.startswith('kun_fin_') or name == 'kun_fluke')
    destination = BUILD / f'kun-scale-{args.scale:g}.json'
    if destination.exists():
        previous = json.loads(destination.read_text())
        snapshot['restoredUVIdentical'] = previous['finUV'] == snapshot['finUV']
    destination.write_text(json.dumps(snapshot, indent=2) + '\n')
    other_scale = 1.5 if args.scale == 1.35 else 1.35
    other_file = BUILD / f'kun-scale-{other_scale:g}.json'
    if other_file.exists():
        other = json.loads(other_file.read_text())
        snapshot['uvInvariantAcross135And150'] = other['finUV'] == snapshot['finUV']
        snapshot['localCoordinatesInvariantAcross135And150'] = other['localCoordinateHashes'] == snapshot['localCoordinateHashes']
    (BUILD / 'kun-validation.json').write_text(json.dumps(snapshot, indent=2) + '\n')
    print(json.dumps(snapshot, indent=2))
    if not frozen or snapshot.get('uvInvariantAcross135And150') is False or snapshot.get('restoredUVIdentical') is False or snapshot.get('finFlukeTexturesIdentical') is False or snapshot.get('finFlukeUVIdentical') is False:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
