"""Turn a traced outline into a connected, quad-only deformable sheet.

Ear clipping preserves the entire simplified boundary, including pointed tips.
An interior span/chord lattice refines the patch; shared triangle edge midpoints
then split each triangle into three quads. No rectangular planform template.
"""
import math

import numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


def cross(a, b):
    return float(a[0] * b[1] - a[1] * b[0])


def patch(outline_record, spacing_px=9):
    outline = np.array(outline_record['pixelsXY'], dtype=float)
    vertices = [point.copy() for point in outline]
    vectors = [Vector((float(point[0]), float(point[1]), 0)) for point in outline]
    triangles = []
    for triangle in tessellate_polygon([vectors]):
        # Blender 5.2 returns indices; older releases returned Vector objects.
        indices = tuple(int(point) if not hasattr(point, 'x') else
                        int(np.linalg.norm(outline - np.array([point.x, point.y]), axis=1).argmin())
                        for point in triangle)
        triangles.append(indices)
    assert len(triangles) >= len(outline) - 3
    root = np.array(outline_record['rootXY'])
    tip = outline[outline_record['tipIndex']]
    axis = (tip - root) / np.linalg.norm(tip - root)
    chord = np.array([-axis[1], axis[0]])
    relative = outline - root
    uu, vv = relative @ axis, relative @ chord
    inserted = 0
    # The offset avoids placing points exactly on existing triangulation edges.
    for u in np.arange(uu.min() + spacing_px * .371, uu.max(), spacing_px):
        for v in np.arange(vv.min() + spacing_px * .619, vv.max(), spacing_px):
            point = root + u * axis + v * chord
            for i, (ia, ib, ic) in enumerate(triangles):
                a, b, c = vertices[ia], vertices[ib], vertices[ic]
                denominator = cross(b - a, c - a)
                if abs(denominator) < 1e-9:
                    continue
                wb = cross(point - a, c - a) / denominator
                wc = cross(b - a, point - a) / denominator
                if wb > 1e-7 and wc > 1e-7 and wb + wc < 1 - 1e-7:
                    index = len(vertices)
                    vertices.append(point)
                    triangles[i] = (ia, ib, index)
                    triangles.extend([(ib, ic, index), (ic, ia, index)])
                    inserted += 1
                    break
    midpoints, quads = {}, []

    def middle(a, b):
        edge = tuple(sorted((a, b)))
        if edge not in midpoints:
            midpoints[edge] = len(vertices)
            vertices.append((vertices[a] + vertices[b]) / 2)
        return midpoints[edge]

    for a, b, c in triangles:
        ab, bc, ca = middle(a, b), middle(b, c), middle(c, a)
        center = len(vertices)
        vertices.append((vertices[a] + vertices[b] + vertices[c]) / 3)
        quads.extend([(a, ab, center, ca), (b, bc, center, ab), (c, ca, center, bc)])
    return np.array(vertices), quads, {
        'boundaryPoints': len(outline), 'interiorSpanChordSamples': inserted,
        'latticeSpacingPx': spacing_px, 'quads': len(quads),
        'tipRetained': any(np.linalg.norm(point - tip) < 1e-7 for point in vertices),
    }


def uv_coordinates(points, faces):
    minimum = points.min(axis=0)
    extent = np.maximum(points.max(axis=0) - minimum, 1e-6)
    uv = (points - minimum) / extent
    return [[tuple(uv[index]) for index in face] for face in faces]
