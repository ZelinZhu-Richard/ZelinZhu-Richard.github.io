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


def column(sheet, seed, height, radius, center, rings, segments, reach=1.0):
    """A leaning rock column: stacked irregular rings with ribs, strata and ledges."""
    rng = random.Random(seed)
    harmonics = [(k, rng.uniform(.05, .17) / math.sqrt(k), rng.uniform(0, TAU)) for k in range(2, 7)]
    rib_count = rng.choice([7, 8, 9, 11, 13])
    rib_phase = rng.uniform(0, TAU)
    steps = sorted((rng.uniform(.12, .9), rng.uniform(-.09, .12)) for _ in range(rng.randint(3, 6)))
    lean = (rng.uniform(-.09, .09), rng.uniform(-.09, .09))
    points, paints, crowns = [], [], []
    for ring in range(rings):
        t = ring / (rings - 1)
        z = height * t
        # Flared foot, slow taper, abrupt ledges, and a rounded broken crown.
        profile = (1 + .62 * math.exp(-t * 11)) * (1 - .36 * t ** 1.25)
        for where, amount in steps:
            profile += amount * smooth(where - .012, where + .012, t)
        profile *= 1 - .86 * smooth(.9, 1.0, t) ** 2.2
        strata = .045 * math.sin(z * .19 + 3 * fbm(z * .021, seed * .3, seed)) ** 2
        cx = center[0] + lean[0] * z + 5 * reach * math.sin(t * 2.3 + seed)
        cy = center[1] + lean[1] * z + 5 * reach * math.cos(t * 1.9 + seed)
        for segment in range(segments):
            angle = segment * TAU / segments
            wobble = sum(amp * math.sin(k * angle + phase + t * 1.7) for k, amp, phase in harmonics)
            rib = abs(math.sin(rib_count * angle / 2 + rib_phase + .9 * fbm(t * 3, angle, seed))) ** .62
            crack = fbm(angle * 2.4, z * .03, seed + 5)
            r = radius * max(.04, profile) * (1 + wobble + .17 * (rib - .6) + .22 * (crack - .5) - strata)
            points.append((cx + r * math.cos(angle), cy + r * math.sin(angle), z))
            crevice = min(1, max(0, 1.1 - rib * 1.05 + .9 * (.5 - crack)))
            paints.append((crevice, 0, t))
        if ring == rings - 1:
            crowns.append((cx, cy, z))
    faces = []
    for ring in range(rings - 1):
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append((ring * segments + segment, ring * segments + next_segment,
                          (ring + 1) * segments + next_segment, (ring + 1) * segments + segment))
    faces.append(tuple((rings - 1) * segments + segment for segment in range(segments)))
    sheet.add(points, paints, faces)
    return crowns[0], radius * .46


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
    crowns = [column(sheet, seed, height, radius, (0, 0), 34, 26)]
    for side in range(sides):
        angle = rng.uniform(0, TAU)
        offset = radius * rng.uniform(.62, 1.2)
        crowns.append(column(sheet, seed + 31 * (side + 1), height * rng.uniform(.34, .78), radius * rng.uniform(.34, .58),
                             (offset * math.cos(angle), offset * math.sin(angle)), 18, 13, .4))
    for index in range(pines):
        (cx, cy, cz), crown = crowns[index % len(crowns)]
        angle = rng.uniform(0, TAU)
        spread = rng.uniform(.1, 1)
        base = (cx + crown * spread * math.cos(angle), cy + crown * spread * math.sin(angle), cz - rng.uniform(1, 5))
        size = rng.uniform(12, 25) * (1.2 if index < 3 else 1)
        lean = (math.cos(angle) * spread * .35, math.sin(angle) * spread * .35)
        pine(sheet, base, size, lean, seed + index * 13)
    return sheet


def far_pillar(seed, height, radius):
    """A lighter pillar for the deep field; its crown keeps a tufted pine silhouette."""
    rng = random.Random(seed)
    sheet = Sheet()
    column(sheet, seed, height, radius, (0, 0), 11, 9)
    second = rng.uniform(0, TAU)
    column(sheet, seed + 3, height * .62, radius * .5, (radius * .9 * math.cos(second), radius * .9 * math.sin(second)), 7, 7, .4)
    for tuft in range(5):
        angle = tuft * TAU / 5 + rng.uniform(-.3, .3)
        reach = radius * .3 * rng.uniform(.2, 1)
        pad(sheet, (reach * math.cos(angle), reach * math.sin(angle), height + rng.uniform(1, 9)),
            rng.uniform(8, 14), seed + tuft, rng.uniform(4, 7))
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
world.node_tree.nodes['Background'].inputs[0].default_value = common.color('#607277')
SCENE.world = world
sun = bpy.data.lights.new('sun', 'SUN')
sun.energy = 3.2
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
