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
    (11, 210, 30, 3, 6), (23, 248, 26, 2, 5), (37, 176, 34, 4, 6), (41, 232, 22, 2, 4),
    (53, 150, 28, 3, 5), (67, 262, 30, 3, 5), (71, 190, 24, 1, 4), (83, 136, 32, 3, 5),
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


def column(sheet, seed, height, radius, center, rings, segments, reach=1.0):
    """A weathered rock spire. Bedding planes tilt, ledges wrap only part of the way
    round, and fissures widen upward, so no ring of the loft reads as a level collar."""
    rng = random.Random(seed)
    sections = [section(rng) for _ in range(4)]
    fissures = [(rng.uniform(0, TAU), rng.uniform(.05, .15), rng.uniform(.16, .4), rng.uniform(-.7, .7))
                for _ in range(rng.randint(6, 10))]
    tilt, tilt_phase = rng.uniform(.035, .1), rng.uniform(0, TAU)
    bands = rng.randint(7, 11)
    breaks = sorted(rng.uniform(.04, .96) for _ in range(bands - 1))
    breaks = [0] + breaks + [1]
    insets, lobes = [], []
    inset = 1.0
    for band in range(bands):
        # A slow taper, broken by random shoulders; some upper bands overhang.
        inset = max(.6, inset * rng.uniform(.9, 1.0) + (.13 if rng.random() < .26 else 0))
        insets.append(inset)
        # Each ledge exists only on some sides of the spire.
        lobes.append((rng.uniform(0, TAU), rng.uniform(.06, .24)))
    sway = [(rng.uniform(.05, .14) * radius * reach, rng.uniform(1.1, 2.6), rng.uniform(0, TAU)) for _ in range(2)]

    def shape(angle, t):
        s = t + tilt * math.cos(angle - tilt_phase) + .05 * (fbm(angle * 1.4, t * 4, seed) - .5)
        s = max(0, min(.9999, s))
        band = next(i for i in range(bands) if s < breaks[i + 1])
        fraction = (s - breaks[band]) / (breaks[band + 1] - breaks[band])
        following = min(band + 1, bands - 1)
        blend = smooth(.82, 1, fraction)
        scale = insets[band] * (1 - blend) + insets[following] * blend
        phase, amount = lobes[band]
        scale *= 1 + amount * (math.cos(angle - phase) - .3)
        corners = sections[band % 4]
        corners_next = sections[following % 4]
        poly = polygon_radius(corners, angle) * (1 - blend) + polygon_radius(corners_next, angle) * blend
        # Fissures run the height of the spire and open toward its top.
        cut = 0
        for where, width, depth, wander in fissures:
            delta = (angle - where - wander * t + math.pi) % TAU - math.pi
            cut = max(cut, depth * (.5 + .9 * t) * math.exp(-(delta / width) ** 2) * (.6 + .9 * fbm(where * 3, t * 3, seed + 2)))
        grain = .2 * (fbm(angle * 2.3, t * 7, seed) - .5) + .14 * (fbm(angle * 7.1, t * 23, seed + 9) - .5)
        # An irregular foot of slumped rock rather than a plinth.
        foot = (.7 + .9 * fbm(angle * 1.7, 2.2, seed + 4)) * math.exp(-t * (9 + 7 * fbm(angle * 2.1, .7, seed + 6)))
        return (poly * .78 + .22) * scale * (1 - cut + grain) + foot, cut, grain

    points, paints, top_center = [], [], None
    for ring in range(rings):
        t = ring / (rings - 1)
        z = height * t
        cx = center[0] + sum(a * (math.sin(f * t * 3 + p) - math.sin(p)) for a, f, p in sway)
        cy = center[1] + sum(a * (math.cos(f * t * 2.4 + p) - math.cos(p)) for a, f, p in sway)
        # The crown breaks unevenly instead of ending in a flat lid.
        crown = smooth(.9, 1, t)
        for segment in range(segments):
            angle = segment * TAU / segments
            r, cut, grain = shape(angle, t * .985)
            r *= radius * (1 - .26 * crown ** 2)
            drop = crown * (radius * 1.15 * fbm(angle * 2.6, 3.1, seed + 8) + height * .05 * (1 - abs(math.cos(angle * 1.5 + seed))))
            points.append((cx + r * math.cos(angle), cy + r * math.sin(angle), z - drop))
            paints.append((min(1, cut * 3.1 + max(0, -grain) * 3), 0, t))
        if ring == rings - 1:
            top_center = (cx, cy, z)
    faces = []
    for ring in range(rings - 1):
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append((ring * segments + segment, ring * segments + next_segment,
                          (ring + 1) * segments + next_segment, (ring + 1) * segments + segment))
    start = sheet.add(points, paints, faces)
    hub = len(sheet.vertices)
    last_ring = points[-segments:]
    sheet.vertices.append((top_center[0], top_center[1], sum(point[2] for point in last_ring) / segments + radius * .03))
    sheet.paint.append((.4, 0, 1))
    base = start + (rings - 1) * segments
    sheet.faces += [(base + segment, base + (segment + 1) % segments, hub) for segment in range(segments)]
    return (top_center[0], top_center[1], sum(point[2] for point in last_ring) / segments), radius * insets[-1] * .74


def boulder(sheet, center, radius, seed):
    """Slumped rubble: a displaced blob lofted in rings, half sunk at the foot of a spire."""
    rng = random.Random(seed)
    rings, sides = 5, 8
    squash = rng.uniform(.5, .8)
    points, paints = [], []
    for ring in range(rings):
        polar = (ring + .5) / rings * math.pi
        for side in range(sides):
            angle = side * TAU / sides
            r = radius * (.72 + .56 * fbm(angle * 1.4 + seed, polar * 1.6, seed))
            points.append((center[0] + r * math.sin(polar) * math.cos(angle), center[1] + r * math.sin(polar) * math.sin(angle),
                           center[2] + r * squash * math.cos(polar)))
            paints.append((rng.uniform(.1, .5), 0, 0))
    faces = []
    for ring in range(rings - 1):
        for side in range(sides):
            next_side = (side + 1) % sides
            faces.append((ring * sides + side, ring * sides + next_side,
                          (ring + 1) * sides + next_side, (ring + 1) * sides + side))
    faces.append(tuple(range(sides - 1, -1, -1)))
    faces.append(tuple((rings - 1) * sides + side for side in range(sides)))
    sheet.add(points, paints, faces)


def pad(sheet, center, radius, seed, thickness, sides=6):
    """One flat foliage plate: an irregular, slightly drooping slab, never a round cap."""
    rng = random.Random(seed)
    cx, cy, cz = center
    stretch, turn = rng.uniform(.5, .8), rng.uniform(0, TAU)
    top, rim = [], []
    for side in range(sides):
        angle = side * TAU / sides
        r = radius * rng.uniform(.6, 1.25)
        x, y = r * math.cos(angle), r * stretch * math.sin(angle)
        px, py = x * math.cos(turn) - y * math.sin(turn), x * math.sin(turn) + y * math.cos(turn)
        rim.append((cx + px, cy + py, cz - thickness * rng.uniform(.2, .7)))
        top.append((cx + px * .55, cy + py * .55, cz + thickness * rng.uniform(.4, .9)))
    points = [(cx, cy, cz + thickness)] + top + rim + [(cx, cy, cz - thickness * .8)]
    last = len(points) - 1
    faces = [(0, 1 + side, 1 + (side + 1) % sides) for side in range(sides)]
    for side in range(sides):
        next_side = (side + 1) % sides
        faces.append((1 + side, 1 + sides + side, 1 + sides + next_side, 1 + next_side))
        faces.append((1 + sides + next_side, 1 + sides + side, last))
    sheet.add(points, [(.5, 1, 1)] * len(points), faces)


def limb(sheet, start, end, rise, thick, sides):
    """A bent tube from trunk to foliage, rising then drooping like a Huangshan pine."""
    rings = 3
    points = []
    for ring in range(rings):
        t = ring / (rings - 1)
        x = start[0] + (end[0] - start[0]) * t
        y = start[1] + (end[1] - start[1]) * t
        z = start[2] + (end[2] - start[2]) * t + rise * math.sin(t * math.pi)
        r = thick * (1 - .7 * t)
        for side in range(sides):
            angle = side * TAU / sides
            points.append((x + r * math.cos(angle), y + r * math.sin(angle), z + r * .7 * math.sin(angle * 2)))
    faces = []
    for ring in range(rings - 1):
        for side in range(sides):
            next_side = (side + 1) % sides
            faces.append((ring * sides + side, ring * sides + next_side,
                          (ring + 1) * sides + next_side, (ring + 1) * sides + side))
    sheet.add(points, [(.8, 1, 1)] * len(points), faces)


def pine(sheet, base, size, lean, seed, far=False):
    """A wind-bent pine: short crooked trunk, level limbs, flat irregular foliage plates."""
    rng = random.Random(seed)
    sides, rings = (3, 3) if far else (5, 5)
    bend = rng.uniform(.3, .8)
    azimuth = rng.uniform(0, TAU)
    def spine(t):
        sweep = bend * size * .5 * t * t
        return (base[0] + lean[0] * size * t + sweep * math.cos(azimuth),
                base[1] + lean[1] * size * t + sweep * math.sin(azimuth), base[2] + size * .78 * t)
    points, faces = [], []
    for ring in range(rings):
        t = ring / (rings - 1)
        cx, cy, cz = spine(t)
        radius = size * .05 * (1.3 - t) + .2
        for side in range(sides):
            angle = side * TAU / sides
            points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle), cz))
    for ring in range(rings - 1):
        for side in range(sides):
            next_side = (side + 1) % sides
            faces.append((ring * sides + side, ring * sides + next_side,
                          (ring + 1) * sides + next_side, (ring + 1) * sides + side))
    sheet.add(points, [(.8, 1, 1)] * len(points), faces)
    limbs = 3 if far else rng.randint(4, 5)
    for index in range(limbs):
        t = .5 + .5 * index / max(1, limbs - 1)
        start = spine(t)
        angle = azimuth + index * 2.4 + rng.uniform(-.5, .5)
        reach = size * rng.uniform(.34, .62) * (1.15 - .5 * index / limbs)
        end = (start[0] + reach * math.cos(angle), start[1] + reach * math.sin(angle), start[2] + size * rng.uniform(-.1, .06))
        if not far:
            limb(sheet, start, end, size * .05, size * .028 + .14, 3)
        for plate in range(1 if far else 2):
            offset = rng.uniform(0, TAU)
            pad(sheet, (end[0] + size * .07 * plate * math.cos(offset), end[1] + size * .07 * plate * math.sin(offset), end[2] + plate * size * .05),
                size * rng.uniform(.22, .36), seed + index * 7 + plate + 1, size * .085, 5 if far else 6)


def hero_pillar(seed, height, radius, sides, pines):
    rng = random.Random(seed)
    sheet = Sheet()
    crowns = [column(sheet, seed, height, radius, (0, 0), 30, 32)]
    for side in range(sides):
        angle = rng.uniform(0, TAU)
        offset = radius * rng.uniform(.7, 1.3)
        crowns.append(column(sheet, seed + 31 * (side + 1), height * rng.uniform(.3, .76), radius * rng.uniform(.34, .6),
                             (offset * math.cos(angle), offset * math.sin(angle)), 18, 18, .5))
    for rock in range(9):
        angle = rng.uniform(0, TAU)
        offset = radius * rng.uniform(.9, 2.1)
        boulder(sheet, (offset * math.cos(angle), offset * math.sin(angle), rng.uniform(-3, 5)),
                radius * rng.uniform(.12, .42), seed + 400 + rock)
    # Tops carry dense low foliage, then a few taller pines that break the outline.
    for index, ((cx, cy, cz), crown) in enumerate(crowns):
        for tuft in range(8 if index == 0 else 3):
            angle = rng.uniform(0, TAU)
            spread = crown * math.sqrt(rng.random())
            pad(sheet, (cx + spread * math.cos(angle), cy + spread * math.sin(angle), cz + rng.uniform(-3, 5)),
                rng.uniform(.3, .55) * max(9, crown * .6), seed + 200 + index * 11 + tuft, rng.uniform(4, 9))
    for index in range(pines):
        (cx, cy, cz), crown = crowns[index % len(crowns)]
        angle = rng.uniform(0, TAU)
        spread = rng.uniform(.15, 1.1)
        # Stand on the broken crown, leaning outward over the drop.
        base = (cx + crown * spread * math.cos(angle), cy + crown * spread * math.sin(angle), cz + rng.uniform(4, 15))
        size = rng.uniform(15, 25) * (1.2 if index < 4 else 1)
        lean = (math.cos(angle) * spread * .42, math.sin(angle) * spread * .42)
        pine(sheet, base, size, lean, seed + index * 13)
    for ledge in range(2):
        # A few cliff pines cling to the upper face.
        angle = rng.uniform(0, TAU)
        z = height * rng.uniform(.55, .86)
        reach = radius * rng.uniform(.8, 1.02)
        size = rng.uniform(11, 17)
        pine(sheet, (reach * math.cos(angle), reach * math.sin(angle), z), size,
             (math.cos(angle) * .9, math.sin(angle) * .9), seed + 700 + ledge)
    return sheet


def far_pillar(seed, height, radius):
    """A lighter pillar for the deep field; its crown keeps a tufted foliage silhouette."""
    rng = random.Random(seed)
    sheet = Sheet()
    top, crown = column(sheet, seed, height, radius, (0, 0), 14, 14)
    second = rng.uniform(0, TAU)
    side, side_crown = column(sheet, seed + 3, height * rng.uniform(.45, .75), radius * .5,
                              (radius * 1.1 * math.cos(second), radius * 1.1 * math.sin(second)), 8, 9, .5)
    for tuft in range(3):
        angle = tuft * TAU / 3 + rng.uniform(-.4, .4)
        reach = crown * rng.uniform(.2, .9)
        pine(sheet, (top[0] + reach * math.cos(angle), top[1] + reach * math.sin(angle), top[2] + rng.uniform(4, 12)),
             rng.uniform(16, 26), (math.cos(angle) * .3, math.sin(angle) * .3), seed + tuft, True)
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
