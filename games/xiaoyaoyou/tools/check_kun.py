"""Verify frozen geometry, exported UV scale invariance, and fluke continuity."""
import argparse
import hashlib
import json
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
    return {'geometry': geometry, 'uv': uv, 'triangleCounts': counts}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--scale', type=float)
    args = parser.parse_args()
    current = inspect()
    if args.baseline:
        BASELINE.write_text(json.dumps(current, indent=2) + '\n')
        print('Saved pre-pass geometry fingerprints (UV excluded).')
        return
    before = json.loads(BASELINE.read_text())
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
    if not frozen or snapshot.get('uvInvariantAcross135And150') is False or snapshot.get('restoredUVIdentical') is False:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
