"""North-sea props: code-built rock pillars with cloud pines, far pillars, seabed.

Every shape is lofted or displaced here; no mesh primitives are used. Blender
axes: up +Z. Each pillar sits on the origin at a fixed world size, and the
runtime instances them. Vertex color channels carry paint data for the runtime
shader: R crevice depth, G foliage mask, B height along the pillar.
"""
import json
import math
import random
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from mathutils import Vector
import common

ARGS = common.arguments()
SCENE = common.setup(ARGS.engine)
ROOT = common.ROOT
TAU = math.tau

# World units match Kun at scale 1 (10.4 long); the tallest pillars read as
# towers at the start and as a low stone forest once Kun has grown twelvefold.
HERO_PILLARS = [
    # seed, height, base radius, side columns, pines
    (11, 210, 30, 3, 11), (23, 248, 26, 2, 9), (37, 176, 34, 4, 12), (41, 232, 22, 2, 8),
    (53, 150, 28, 3, 10), (67, 262, 30, 3, 10), (71, 190, 24, 1, 7), (83, 136, 32, 3, 9),
]
FAR_PILLARS = [(101, 200, 28), (113, 250, 24), (127, 160, 34), (131, 220, 20), (149, 130, 30)]
FLOOR_SIZE, FLOOR_CELLS = 9000, 72


def lattice(ix, iy, seed):
    n = (ix * 374761393 + iy * 668265263 + seed * 2147483647) & 0x7fffffff
    n = (n ^ (n >> 13)) * 1274126177 & 0x7fffffff
    return ((n ^ (n >> 16)) & 0xffff) / 0xffff


def noise(x, y, seed=0):
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    u, v = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = lattice(ix, iy, seed) * (1 - u) + lattice(ix + 1, iy, seed) * u
    b = lattice(ix, iy + 1, seed) * (1 - u) + lattice(ix + 1, iy + 1, seed) * u
    return a * (1 - v) + b * v


def fbm(x, y, seed=0, octaves=4):
    total, amplitude, scale = 0, .5, 1
    for i in range(octaves):
        total += amplitude * noise(x * scale, y * scale, seed + i * 17)
        amplitude *= .5
        scale *= 2.03
    return total


def smooth(a, b, x):
    t = max(0, min(1, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


class Sheet:
    """Accumulates one merged mesh with per-vertex paint channels."""

    def __init__(self):
        self.vertices, self.faces, self.paint = [], [], []

    def add(self, points, paints, faces):
        start = len(self.vertices)
        self.vertices += points
        self.paint += paints
        self.faces += [tuple(start + index for index in face) for face in faces]
        return start


def section(rng):
    """A jittered polygon, so the column reads as fractured block rather than a turned bottle."""
    sides = rng.choice([4, 4, 5, 5, 6])
    corners = []
    for side in range(sides):
        angle = (side + rng.uniform(-.22, .22)) * TAU / sides
        corners.append((angle, rng.uniform(.84, 1.2)))
    return corners


def polygon_radius(corners, angle):
    sides = len(corners)
    for index in range(sides):
        a0, r0 = corners[index]
        a1, r1 = corners[(index + 1) % sides]
        span = (a1 - a0) % TAU
        offset = (angle - a0) % TAU
        if offset <= span:
            x0, y0 = r0, 0
            x1, y1 = r1 * math.cos(span), r1 * math.sin(span)
            dx, dy = math.cos(offset), math.sin(offset)
            denominator = dx * (y1 - y0) - dy * (x1 - x0)
            return (x0 * (y1 - y0) - y0 * (x1 - x0)) / denominator
    return corners[0][1]


def column(sheet, seed, height, radius, center, bands, segments, reach=1.0, rings_per_band=3):
    """A rock column built as stacked fractured blocks: flat faces, ledges, vertical fissures."""
    rng = random.Random(seed)
    corners = section(rng)
    fissures = [(rng.uniform(0, TAU), rng.uniform(.05, .13), rng.uniform(.14, .34), rng.uniform(-.5, .5))
                for _ in range(rng.randint(5, 9))]
    heights = [rng.uniform(.6, 1.5) for _ in range(bands)]
    total = sum(heights)
    levels, inset, spin = [], 1.02, rng.uniform(0, TAU)
    level = 0
    drift = [0, 0]
    for band in range(bands):
        fraction = band / max(1, bands - 1)
        # Slow overall taper with random terraces; the crown may flare back out.
        inset = max(.5, inset * rng.uniform(.9, 1.0) + (.09 if rng.random() < .22 else 0))
        drift[0] += rng.uniform(-.05, .05) * radius * reach
        drift[1] += rng.uniform(-.05, .05) * radius * reach
        levels.append((level, level + heights[band] / total, inset * (1 + .75 * math.exp(-fraction * 7)),
                       spin + rng.uniform(-.16, .16), drift[0], drift[1]))
        level += heights[band] / total
    points, paints = [], []
    rows = []
    for band, (start, stop, scale, twist, dx, dy) in enumerate(levels):
        # A tight lip of two rings at each band start gives a crisp ledge.
        spacing = [start + .006 + (stop - start - .012) * i / (rings_per_band - 1) for i in range(rings_per_band)]
        rows += [(t, scale, twist, dx, dy) for t in spacing]
    rows.append((1.0, levels[-1][2] * .9, levels[-1][3], levels[-1][4], levels[-1][5]))
    rings = len(rows)
    top_center = None
    for ring, (t, scale, twist, dx, dy) in enumerate(rows):
        z = height * t
        cx, cy = center[0] + dx, center[1] + dy
        for segment in range(segments):
            angle = segment * TAU / segments
            r = polygon_radius(corners, (angle - twist) % TAU)
            r = r * .86 + .14
            cut = 0
            for where, width, depth, wander in fissures:
                delta = (angle - where - wander * t + math.pi) % TAU - math.pi
                cut = max(cut, depth * math.exp(-(delta / width) ** 2) * (.55 + .9 * fbm(where * 3, z * .02, seed + 2)))
            texture = .1 * (fbm(angle * 3.2, z * .018, seed) - .5) + .07 * (fbm(angle * 9.3, z * .07, seed + 9) - .5)
            r = radius * scale * r * (1 - cut + texture)
            points.append((cx + r * math.cos(angle), cy + r * math.sin(angle), z))
            paints.append((min(1, cut * 3.6 + max(0, -texture) * 2.5), 0, t))
        if ring == rings - 1:
            top_center = (cx, cy, z)
    faces = []
    for ring in range(rings - 1):
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append((ring * segments + segment, ring * segments + next_segment,
                          (ring + 1) * segments + next_segment, (ring + 1) * segments + segment))
    start = sheet.add(points, paints, faces)
    # Broken flat top: a slightly domed fan so the crown never reads as a clean lid.
    hub = len(sheet.vertices)
    sheet.vertices.append((top_center[0], top_center[1], height + radius * .05))
    sheet.paint.append((.4, 0, 1))
    base = start + (rings - 1) * segments
    sheet.faces += [(base + segment, base + (segment + 1) % segments, hub) for segment in range(segments)]
    return top_center, radius * levels[-1][2] * .62


def pad(sheet, center, radius, seed, thickness):
    """One flat cloud-pine foliage pad, ragged at the rim and heavy underneath."""
    rng = random.Random(seed)
    sides = 8
    cx, cy, cz = center
    points = [(cx, cy, cz + thickness)]
    for ring, scale, drop in [(1, .58, thickness * .55), (2, 1, -thickness * .1)]:
        for side in range(sides):
            angle = side * TAU / sides + ring * .4
            r = radius * scale * rng.uniform(.74, 1.24)
            points.append((cx + r * math.cos(angle), cy + r * .86 * math.sin(angle), cz + drop + rng.uniform(-.14, .14) * thickness))
    points.append((cx, cy, cz - thickness * .55))
    last = len(points) - 1
    faces = [(0, 1 + side, 1 + (side + 1) % sides) for side in range(sides)]
    for side in range(sides):
        next_side = (side + 1) % sides
        faces.append((1 + side, 1 + sides + side, 1 + sides + next_side, 1 + next_side))
        faces.append((1 + sides + next_side, 1 + sides + side, last))
    sheet.add(points, [(.5, 1, 1)] * len(points), faces)


def pine(sheet, base, size, lean, seed):
    """A bent trunk with limbs carrying flat foliage pads, as in the key art."""
    rng = random.Random(seed)
    sides, rings = 5, 6
    bend = rng.uniform(.2, .75)
    azimuth = rng.uniform(0, TAU)
    def spine(t):
        sweep = bend * size * .55 * t * t
        return (base[0] + lean[0] * size * t + sweep * math.cos(azimuth),
                base[1] + lean[1] * size * t + sweep * math.sin(azimuth), base[2] + size * t)
    points, faces = [], []
    for ring in range(rings):
        t = ring / (rings - 1)
        cx, cy, cz = spine(t)
        radius = size * .045 * (1.25 - t) + .12
        for side in range(sides):
            angle = side * TAU / sides
            points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle), cz))
    for ring in range(rings - 1):
        for side in range(sides):
            next_side = (side + 1) % sides
            faces.append((ring * sides + side, ring * sides + next_side,
                          (ring + 1) * sides + next_side, (ring + 1) * sides + side))
    sheet.add(points, [(.8, 1, 1)] * len(points), faces)
    tiers = rng.randint(3, 4)
    for tier in range(tiers):
        t = .62 + .38 * tier / (tiers - 1)
        cx, cy, cz = spine(t)
        outward = (1 - tier / tiers) * size * .24
        angle = azimuth + rng.uniform(-1.3, 1.3) + tier * 2.2
        radius = size * (.34 - .17 * tier / tiers) * rng.uniform(.9, 1.15)
        pad(sheet, (cx + outward * math.cos(angle), cy + outward * math.sin(angle), cz), radius,
            seed + tier * 7 + 1, size * .085)


def hero_pillar(seed, height, radius, sides, pines):
    rng = random.Random(seed)
    sheet = Sheet()
    crowns = [column(sheet, seed, height, radius, (0, 0), 9, 40)]
    for side in range(sides):
        angle = rng.uniform(0, TAU)
        offset = radius * rng.uniform(.7, 1.3)
        crowns.append(column(sheet, seed + 31 * (side + 1), height * rng.uniform(.3, .76), radius * rng.uniform(.34, .6),
                             (offset * math.cos(angle), offset * math.sin(angle)), 5, 18, .5))
    # Tops carry dense low foliage, then a few taller pines that break the outline.
    for index, ((cx, cy, cz), crown) in enumerate(crowns):
        for tuft in range(5 if index == 0 else 3):
            angle = rng.uniform(0, TAU)
            spread = crown * math.sqrt(rng.random()) * .85
            pad(sheet, (cx + spread * math.cos(angle), cy + spread * math.sin(angle), cz + rng.uniform(.5, 4)),
                rng.uniform(.4, .75) * max(9, crown * .6), seed + 200 + index * 11 + tuft, rng.uniform(4, 8))
    for index in range(pines):
        (cx, cy, cz), crown = crowns[index % len(crowns)]
        angle = rng.uniform(0, TAU)
        spread = rng.uniform(.25, 1.05)
        base = (cx + crown * spread * math.cos(angle), cy + crown * spread * math.sin(angle), cz - rng.uniform(0, 4))
        size = rng.uniform(13, 24) * (1.25 if index < 3 else 1)
        lean = (math.cos(angle) * spread * .4, math.sin(angle) * spread * .4)
        pine(sheet, base, size, lean, seed + index * 13)
    return sheet


def far_pillar(seed, height, radius):
    """A lighter pillar for the deep field; its crown keeps a tufted foliage silhouette."""
    rng = random.Random(seed)
    sheet = Sheet()
    top, crown = column(sheet, seed, height, radius, (0, 0), 4, 10, rings_per_band=2)
    second = rng.uniform(0, TAU)
    column(sheet, seed + 3, height * .6, radius * .5, (radius * 1.1 * math.cos(second), radius * 1.1 * math.sin(second)), 3, 7, .5, 2)
    for tuft in range(5):
        angle = tuft * TAU / 5 + rng.uniform(-.3, .3)
        reach = crown * rng.uniform(.2, .9)
        pad(sheet, (top[0] + reach * math.cos(angle), top[1] + reach * math.sin(angle), height + rng.uniform(1, 7)),
            rng.uniform(.5, .9) * max(9, crown * .7), seed + tuft, rng.uniform(4, 7))
    return sheet


def seabed():
    sheet = Sheet()
    cells, size = FLOOR_CELLS, FLOOR_SIZE
    points, paints, faces = [], [], []
    for iy in range(cells + 1):
        for ix in range(cells + 1):
            x, y = (ix / cells - .5) * size, (iy / cells - .5) * size
            height = 110 * (fbm(x * .0012, y * .0012, 3) - .5) + 34 * (fbm(x * .006, y * .006, 9) - .5)
            points.append((x, y, height))
            paints.append((fbm(x * .02, y * .02, 4), 0, 0))
    for iy in range(cells):
        for ix in range(cells):
            a = iy * (cells + 1) + ix
            faces.append((a, a + 1, a + cells + 2, a + cells + 1))
    sheet.add(points, paints, faces)
    return sheet


def build(name, sheet, material):
    obj = common.mesh(name, sheet.vertices, sheet.faces, material)
    layer = obj.data.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    for point, paint in zip(layer.data, sheet.paint):
        point.color = (*paint, 1)
    obj.data.color_attributes.active_color_index = 0
    # Fracture lines stay crisp; shallow surface variation stays smooth.
    obj.data.set_sharp_from_angle(angle=math.radians(38))
    return obj


ink = common.plain_material('ink', '#17171C')
abyss = common.plain_material('abyss', '#0B161C')
objects = [build(f'ref-pillar-{i + 1}', hero_pillar(*spec), ink) for i, spec in enumerate(HERO_PILLARS)]
objects += [build(f'far-pillar-{i + 1}', far_pillar(*spec), ink) for i, spec in enumerate(FAR_PILLARS)]
objects.append(build('sea_floor', seabed(), abyss))

triangles = {}
for obj in objects:
    obj.data.calc_loop_triangles()
    triangles[obj.name] = len(obj.data.loop_triangles)
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(ROOT / '_dev/raw/sea.glb'), export_format='GLB', use_selection=True,
    export_yup=True, export_apply=True, export_normals=True, export_materials='EXPORT',
    export_vertex_color='ACTIVE', export_extras=True,
)

# Fixed-camera previews: five pillars staged on a mid-grey sea haze.
(ROOT / '_dev/previews').mkdir(parents=True, exist_ok=True)
sea_floor = objects[-1]
sea_floor.hide_render = True
for obj in objects[len(HERO_PILLARS):]:
    obj.hide_render = True
for index, obj in enumerate(objects[:len(HERO_PILLARS)]):
    if index < 5:
        obj.location = ((index - 2) * 92, (index % 2) * 60, 0)
    else:
        obj.hide_render = True
world = bpy.data.worlds.new('sea')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = common.color('#30444E')
SCENE.world = world
sun = bpy.data.lights.new('sun', 'SUN')
sun.energy = 7
sun.angle = math.radians(14)
sun_object = bpy.data.objects.new('sun', sun)
bpy.context.collection.objects.link(sun_object)
sun_object.rotation_euler = (math.radians(24), math.radians(-18), 0)
camera_data = bpy.data.cameras.new('preview')
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 340
camera = bpy.data.objects.new('preview', camera_data)
bpy.context.collection.objects.link(camera)
SCENE.camera = camera
SCENE.render.resolution_x = SCENE.render.resolution_y = 512
for view, location in {'side': (0, -900, 120), 'top': (0, 0, 900), 'front': (900, 0, 120)}.items():
    camera.location = location
    common.look_at(camera, (0, 0, 120 if view != 'top' else 0))
    SCENE.render.filepath = str(ROOT / f'_dev/previews/sea-{view}.png')
    bpy.ops.render.render(write_still=True)

common.record('sea', {
    'triangles': sum(triangles.values()), 'perNode': triangles, 'nodeNames': [obj.name for obj in objects],
    'engine': ARGS.engine, 'exitCode': 0, 'blenderVersion': bpy.app.version_string,
})
print(json.dumps({'triangles': triangles}))
