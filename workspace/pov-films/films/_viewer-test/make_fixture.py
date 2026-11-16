"""Test fixture for the three.js viewer.

Builds a small night street in Blender (emissive boxes, lamp posts, a glossy
ground named "ground", a 14 s animated camera with a child dashboard mesh),
exports films/_viewer-test/web/scene.glb and writes films/_viewer-test/web/sky.json
with one equirect layer that points at assets/web/eso0932a_6k.jpg.

The world shader here is a literal node implementation of the sky.json
contract, so a Blender still of this fixture can be compared with a viewer
screenshot to check orientation, grade and horizon glow.

Run from workspace/pov-films:
  Blender -b --factory-startup --python-exit-code 1 -P films/_viewer-test/make_fixture.py
  Blender ... -P films/_viewer-test/make_fixture.py -- --still 4.0 --scale 0.5 --out /path/still.png
"""

import json
import math
import os
import random
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
WEB = os.path.join(HERE, "web")
SKY_TIF = os.path.join(ROOT, "assets", "sky", "eso0932a", "eso0932a.tif")
SKY_JPG = os.path.join(ROOT, "assets", "web", "eso0932a_6k.jpg")
MOON_TIF = os.path.join(ROOT, "assets", "moon", "nasa-svs-4720", "lroc_color_poles_4k.tif")

FPS = 24
FRAMES = 336
SPEED = 4.2          # metres per second along the road
CAM_HEIGHT = 1.25


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = {"still": None, "scale": 0.5, "out": None, "no_export": False, "kit_post": False}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--still":
            args["still"] = float(argv[i + 1]); i += 2
        elif a == "--scale":
            args["scale"] = float(argv[i + 1]); i += 2
        elif a == "--out":
            args["out"] = argv[i + 1]; i += 2
        elif a == "--no-export":
            args["no_export"] = True; i += 1
        elif a == "--kit-post":
            args["kit_post"] = True; i += 1
        else:
            raise SystemExit("unknown argument " + a)
    return args


# ---------------------------------------------------------------- sky plate

def ensure_sky_jpg():
    """Write the web-sized JPG of the ESO panorama if it is not there yet."""
    if os.path.exists(SKY_JPG):
        return
    os.makedirs(os.path.dirname(SKY_JPG), exist_ok=True)
    img = bpy.data.images.load(SKY_TIF)
    w, h = img.size
    if w > 6000:
        img.scale(6000, int(round(h * 6000 / w)))
    img.filepath_raw = SKY_JPG
    img.file_format = "JPEG"
    scene = bpy.context.scene
    scene.render.image_settings.quality = 90
    img.save(filepath=SKY_JPG, quality=90)
    bpy.data.images.remove(img)


def sky_matrix(yaw_deg, elev_deg, tilt_deg):
    """Row-major world->plate rotation for a galactic-plane plate.

    Under the contract's lookup, the plate centre (u=v=0.5) is lookup
    direction (-1, 0, 0), increasing u is +Y and up is +Z. Put the plate
    centre at world azimuth yaw (0 = +Y, the drive direction), elevation
    elev, and turn the plate's up vector toward screen right by tilt so the
    band runs diagonally from upper left to lower right.
    """
    yaw, el, tilt = map(math.radians, (yaw_deg, elev_deg, tilt_deg))
    c = Vector((math.sin(yaw) * math.cos(el), math.cos(yaw) * math.cos(el), math.sin(el)))
    up0 = (Vector((0, 0, 1)) - c * c.z).normalized()
    right0 = c.cross(up0).normalized()
    n = (up0 * math.cos(tilt) + right0 * math.sin(tilt)).normalized()
    r = c.cross(n).normalized()
    rows = [-c, r, n]
    m = Matrix([list(v) for v in rows])
    assert abs(m.determinant() - 1.0) < 1e-5, m.determinant()
    return [round(x, 6) for row in rows for x in row]


SKY = {
    "layers": [
        {
            "type": "equirect",
            "image": "../../../assets/web/eso0932a_6k.jpg",
            "matrix": sky_matrix(yaw_deg=-8.0, elev_deg=34.0, tilt_deg=38.0),
            "gain": [1.3, 1.3, 1.4],
            "gamma": 1.0,
            "add": True,
        }
    ],
    "grade": {"exposure": -0.1, "contrast": 1.32, "saturation": 1.3, "tint": [0.9, 0.95, 1.1]},
    "horizon_glow": {"color": [0.045, 0.075, 0.22], "strength": 1.0, "height_deg": 14.0},
}


def build_world(sky):
    """Literal node implementation of the sky.json contract."""
    scene = bpy.context.scene
    world = bpy.data.worlds.new("FixtureSky")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    N, L = nt.nodes, nt.links
    N.clear()

    def math_node(op, a=None, b=None, va=None, vb=None):
        n = N.new("ShaderNodeMath")
        n.operation = op
        if a is not None:
            L.new(a, n.inputs[0])
        elif va is not None:
            n.inputs[0].default_value = va
        if b is not None:
            L.new(b, n.inputs[1])
        elif vb is not None:
            n.inputs[1].default_value = vb
        return n.outputs[0]

    def vmath(op, a=None, b=None, vb=None, scale=None):
        n = N.new("ShaderNodeVectorMath")
        n.operation = op
        if a is not None:
            L.new(a, n.inputs[0])
        if b is not None:
            L.new(b, n.inputs[1])
        elif vb is not None:
            n.inputs[1].default_value = vb
        if scale is not None:
            n.inputs["Scale"].default_value = scale
        return n.outputs["Value"] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else n.outputs["Vector"]

    tc = N.new("ShaderNodeTexCoord")
    d = vmath("NORMALIZE", tc.outputs["Generated"])

    total = None
    for layer in sky["layers"]:
        assert layer["type"] == "equirect"
        m = layer["matrix"]
        lx = vmath("DOT_PRODUCT", d, vb=m[0:3])
        ly = vmath("DOT_PRODUCT", d, vb=m[3:6])
        lz = vmath("DOT_PRODUCT", d, vb=m[6:9])
        # u = atan2(L.y, -L.x) / 2pi + 0.5
        neg_lx = math_node("MULTIPLY", lx, vb=-1.0)
        u = math_node("ARCTAN2", ly, neg_lx)
        u = math_node("MULTIPLY_ADD", u, None, vb=1.0 / (2.0 * math.pi))
        u.node.inputs[2].default_value = 0.5
        # v = atan2(L.z, hypot(L.x, L.y)) / pi + 0.5
        hx = math_node("MULTIPLY", lx, lx)
        hy = math_node("MULTIPLY", ly, ly)
        hyp = math_node("SQRT", math_node("ADD", hx, hy))
        v = math_node("ARCTAN2", lz, hyp)
        v = math_node("MULTIPLY_ADD", v, None, vb=1.0 / math.pi)
        v.node.inputs[2].default_value = 0.5
        uv = N.new("ShaderNodeCombineXYZ")
        L.new(u, uv.inputs[0]); L.new(v, uv.inputs[1])
        tex = N.new("ShaderNodeTexImage")
        path = os.path.normpath(os.path.join(WEB, layer["image"]))
        tex.image = bpy.data.images.load(path, check_existing=True)
        tex.image.colorspace_settings.name = "sRGB"
        tex.interpolation = "Cubic"
        tex.extension = "REPEAT"
        L.new(uv.outputs[0], tex.inputs["Vector"])
        gam = N.new("ShaderNodeGamma")
        L.new(tex.outputs["Color"], gam.inputs["Color"])
        gam.inputs["Gamma"].default_value = layer.get("gamma", 1.0)
        col = vmath("MULTIPLY", gam.outputs[0], vb=layer.get("gain", [1, 1, 1]))
        total = col if total is None else vmath("ADD", total, col)

    g = sky["grade"]
    c = vmath("SCALE", total, scale=2.0 ** g.get("exposure", 0.0))
    # contrast around 0.18 in linear light, per channel
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(c, sep.inputs[0])
    comb = N.new("ShaderNodeCombineXYZ")
    k = g.get("contrast", 1.0)
    for i in range(3):
        x = math_node("MULTIPLY", sep.outputs[i], vb=1.0 / 0.18)
        x = math_node("POWER", math_node("MAXIMUM", x, vb=0.0), vb=k)
        x = math_node("MULTIPLY", x, vb=0.18)
        L.new(x, comb.inputs[i])
    c = comb.outputs[0]
    lum = vmath("DOT_PRODUCT", c, vb=(0.2126, 0.7152, 0.0722))
    lumv = N.new("ShaderNodeCombineXYZ")
    for i in range(3):
        L.new(lum, lumv.inputs[i])
    diff = vmath("SUBTRACT", c, lumv.outputs[0])
    c = vmath("ADD", lumv.outputs[0], vmath("SCALE", diff, scale=g.get("saturation", 1.0)))
    c = vmath("MULTIPLY", c, vb=g.get("tint", [1, 1, 1]))

    hg = sky["horizon_glow"]
    # w = (1 - clamp(elev / height, 0, 1))^2 with elev = asin(d.z)
    dz = N.new("ShaderNodeSeparateXYZ")
    L.new(d, dz.inputs[0])
    elev = math_node("ARCSINE", dz.outputs[2])
    t = math_node("DIVIDE", elev, vb=math.radians(hg["height_deg"]))
    t.node.use_clamp = True
    one_minus = math_node("SUBTRACT", None, t, va=1.0)
    w = math_node("MULTIPLY", one_minus, one_minus)
    w = math_node("MULTIPLY", w, vb=hg["strength"])
    glow = N.new("ShaderNodeCombineXYZ")
    for i in range(3):
        L.new(math_node("MULTIPLY", w, vb=hg["color"][i]), glow.inputs[i])
    c = vmath("ADD", c, glow.outputs[0])

    # Like kit/povkit.py: camera rays see the sky, lighting sees
    # sky * 0.15 * (0.75, 0.85, 1.0) + (0.004, 0.006, 0.012). The viewer's defaults match.
    lit = vmath("ADD", vmath("MULTIPLY", c, vb=(0.15 * 0.75, 0.15 * 0.85, 0.15 * 1.0)), vb=(0.004, 0.006, 0.012))
    lp = N.new("ShaderNodeLightPath")
    mix = N.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    L.new(lp.outputs["Is Camera Ray"], mix.inputs["Factor"])
    L.new(lit, mix.inputs[6])
    L.new(c, mix.inputs[7])
    bg = N.new("ShaderNodeBackground")
    out = N.new("ShaderNodeOutputWorld")
    L.new(mix.outputs[2], bg.inputs["Color"])
    L.new(bg.outputs[0], out.inputs[0])


# ---------------------------------------------------------------- materials

def principled(name, base, rough=0.5, metal=0.0, emit=None, strength=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.05
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = strength
    return m


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def box(name, size, loc, mat, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
        bpy.ops.object.shade_smooth()
        wn = o.modifiers.new("wn", "WEIGHTED_NORMAL")
        wn.keep_sharp = True
    o.data.materials.append(mat)
    return o


# ---------------------------------------------------------------- road path

def road_x(y):
    return 3.2 * math.sin(y / 17.0) + 0.02 * y


def road_dx(y):
    return 3.2 / 17.0 * math.cos(y / 17.0) + 0.02


def cam_pose(t):
    y = 2.0 + SPEED * t
    x = road_x(y) + 1.1
    yaw = math.atan2(road_dx(y), 1.0)       # heading measured from +Y toward +X
    bob = 0.006 * math.sin(t * 2 * math.pi * 1.7) + 0.003 * math.sin(t * 2 * math.pi * 4.3)
    return Vector((x, y, CAM_HEIGHT + bob)), yaw


def build_scene():
    rnd = random.Random(7)
    scene = bpy.context.scene
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)

    ground_mat = principled("ground_wet", (0.010, 0.011, 0.016), rough=0.16)
    lane_mat = principled("lane_paint", (0.55, 0.5, 0.38), rough=0.45)
    body_mats = [
        principled("body_navy", (0.025, 0.03, 0.07), rough=0.55),
        principled("body_plum", (0.05, 0.025, 0.07), rough=0.5),
        principled("body_teal", (0.015, 0.05, 0.06), rough=0.5),
    ]
    trim_mat = principled("trim", (0.12, 0.1, 0.14), rough=0.35, metal=0.3)
    win_cols = {
        "amber": (1.0, 0.52, 0.16),
        "cyan": (0.18, 0.75, 1.0),
        "magenta": (1.0, 0.22, 0.75),
    }
    win_mats = {k: principled("win_" + k, (0.02, 0.02, 0.02), rough=0.3, emit=v, strength=7.0)
                for k, v in win_cols.items()}
    hero_mat = principled("hero_window", (0.02, 0.02, 0.02), rough=0.3, emit=(1.0, 0.58, 0.2), strength=14.0)
    hero_body = principled("hero_body", (0.35, 0.16, 0.06), rough=0.45)
    lamp_mat = principled("lamp_glass", (0.9, 0.8, 0.6), rough=0.2, emit=(1.0, 0.78, 0.5), strength=30.0)
    pole_mat = principled("pole_metal", (0.05, 0.05, 0.06), rough=0.3, metal=0.9)

    # glossy ground: the viewer gives meshes named with "ground" a planar mirror
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, 60, 0))
    g = bpy.context.active_object
    g.name = "ground"
    g.scale = (400, 400, 1)
    bpy.ops.object.transform_apply(scale=True)
    g.data.materials.append(ground_mat)

    # dashed centre line
    for i, y in enumerate(range(-6, 140, 6)):
        ln = box("lane_%02d" % i, (0.14, 2.6, 0.01), (road_x(y), y, 0.006), lane_mat,
                 rot=(0, 0, -math.atan(road_dx(y))))

    # buildings on both sides
    palette = list(win_mats.keys())
    for side in (-1, 1):
        y = 6.0 + (4.0 if side > 0 else 0.0)
        idx = 0
        while y < 150:
            w = rnd.uniform(4.0, 6.0)
            d = rnd.uniform(4.0, 6.5)
            h = rnd.uniform(4.5, 13.0)
            off = rnd.uniform(7.5, 11.0)
            cx = road_x(y) + side * (off + w / 2)
            name = "bldg_%s_%02d" % ("L" if side < 0 else "R", idx)
            box(name, (w, d, h), (cx, y, h / 2), rnd.choice(body_mats), bevel=0.18)
            box(name + "_cap", (w + 0.3, d + 0.3, 0.3), (cx, y, h + 0.15), trim_mat, bevel=0.08)
            face_x = cx - side * (w / 2 + 0.03)
            col = rnd.choice(palette)
            rows = max(1, int((h - 1.5) / 1.7))
            cols = max(1, int((d - 1.0) / 1.4))
            for r in range(rows):
                for c in range(cols):
                    if rnd.random() < 0.35:
                        continue
                    wy = y - d / 2 + 0.9 + c * (d - 1.8) / (cols - 1) if cols > 1 else y
                    wz = 1.4 + r * 1.7
                    box("%s_win_%d_%d" % (name, r, c), (0.06, 0.7, 0.95), (face_x, wy, wz),
                        win_mats[col if rnd.random() < 0.8 else rnd.choice(palette)])
            y += d + rnd.uniform(1.5, 5.0)
            idx += 1

    # warm hero building ahead on the left
    hy = 74.0
    hx = road_x(hy) - 9.5
    box("hero_body", (8.0, 8.0, 9.0), (hx, hy, 4.5), hero_body, bevel=0.35)
    box("hero_roof", (8.8, 8.8, 0.5), (hx, hy, 9.25), trim_mat, bevel=0.15)
    for r in range(3):
        for c in range(3):
            box("hero_win_%d_%d" % (r, c), (0.08, 1.4, 1.6), (hx + 4.05, hy - 2.4 + c * 2.4, 1.6 + r * 2.6), hero_mat)
    hl = bpy.data.lights.new("hero_light", "POINT")
    hl.energy = 1500.0
    hl.color = (1.0, 0.6, 0.28)
    hl.shadow_soft_size = 1.0
    hlo = link(bpy.data.objects.new("hero_light", hl))
    hlo.location = (hx + 6.0, hy, 3.0)

    # lamp posts with point lights
    for i, y in enumerate(range(8, 140, 13)):
        side = -1 if i % 2 == 0 else 1
        x = road_x(y) + side * 5.2
        bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=4.2, location=(x, y, 2.1))
        p = bpy.context.active_object
        p.name = "lamp_pole_%02d" % i
        p.data.materials.append(pole_mat)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.28, location=(x, y, 4.35), segments=24, ring_count=12)
        s = bpy.context.active_object
        s.name = "lamp_globe_%02d" % i
        bpy.ops.object.shade_smooth()
        s.data.materials.append(lamp_mat)
        ld = bpy.data.lights.new("lamp_light_%02d" % i, "POINT")
        ld.energy = 220.0
        ld.color = (1.0, 0.78, 0.5)
        ld.shadow_soft_size = 0.3
        lo = link(bpy.data.objects.new("lamp_light_%02d" % i, ld))
        lo.location = (x, y, 4.0)

    # faint cool moonlight
    sun = bpy.data.lights.new("moon", "SUN")
    sun.energy = 0.08
    sun.color = (0.55, 0.65, 1.0)
    so = link(bpy.data.objects.new("moon", sun))
    so.rotation_euler = (math.radians(55), 0, math.radians(150))

    # camera
    cam_data = bpy.data.cameras.new("pov_camera")
    cam_data.lens = 24.0
    cam_data.sensor_fit = "AUTO"
    cam_data.sensor_width = 36.0
    cam_data.clip_start = 0.05
    cam_data.clip_end = 1500.0
    cam = link(bpy.data.objects.new("pov_camera", cam_data))
    scene.camera = cam
    cam.rotation_mode = "XYZ"
    for f in range(1, FRAMES + 1):
        t = (f - 1) / FPS
        pos, yaw = cam_pose(t)
        cam.location = pos
        cam.rotation_euler = (math.radians(87.0), 0.0, -yaw)
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_euler", frame=f)

    # dashboard, a child of the camera in camera local space (-Z forward, +Y up)
    dash_mat = principled("dash_vinyl", (0.010, 0.010, 0.013), rough=0.45, coat=0.25)
    dash = box("dashboard", (2.6, 0.14, 0.9), (0, 0, 0), dash_mat, bevel=0.06)
    dash.parent = cam
    dash.matrix_parent_inverse = Matrix.Identity(4)
    dash.location = (0.0, -0.72, -0.62)
    dash.rotation_euler = (math.radians(7.0), 0.0, 0.0)
    gauge_mat = principled("dash_gauge", (0.01, 0.01, 0.01), rough=0.4, emit=(0.2, 0.85, 1.0), strength=4.0)
    gauge = box("dashboard_gauge", (0.42, 0.012, 0.02), (0, 0, 0), gauge_mat)
    gauge.parent = dash
    gauge.matrix_parent_inverse = Matrix.Identity(4)
    gauge.location = (0.32, 0.074, -0.4)

    join_by_material(("_win_", "lane_"))

    scene.frame_start = 1
    scene.frame_end = FRAMES
    scene.render.fps = FPS
    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1920
    return cam


def join_by_material(tags):
    """Merge the many small window and lane boxes into one mesh per material."""
    groups = {}
    for o in bpy.data.objects:
        if o.type == "MESH" and any(t in o.name for t in tags) and o.parent is None:
            groups.setdefault(o.data.materials[0].name, []).append(o)
    for mat, objs in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        objs[0].name = "merged_" + mat


def write_rect_test():
    """A shaded moon disc and sky_rect.json (the fixture sky plus one rect layer), for
    checking the viewer's rect path: viewer/?film=_viewer-test&sky=../films/_viewer-test/web/sky_rect.json"""
    import numpy as np
    out_jpg = os.path.join(WEB, "moon_test.jpg")
    if not os.path.exists(out_jpg):
        src = bpy.data.images.load(MOON_TIF)
        w, h = src.size
        tex = np.empty(w * h * 4, np.float32)
        src.pixels.foreach_get(tex)
        tex = tex.reshape(h, w, 4)[::-1, :, :3]          # top row first
        if not src.is_float:
            tex = np.where(tex <= 0.04045, tex / 12.92, ((tex + 0.055) / 1.055) ** 2.4)
        bpy.data.images.remove(src)
        n = 1024
        ys, xs = np.mgrid[0:n, 0:n]
        x = ((xs + 0.5) / n * 2 - 1) / 0.9
        y = (1 - (ys + 0.5) / n * 2) / 0.9
        r2 = x * x + y * y
        z = np.sqrt(np.clip(1 - r2, 0, 1))
        lat = np.arcsin(np.clip(y, -1, 1))
        lon = np.arctan2(x, z)
        ui = np.clip(((lon / (2 * np.pi) + 0.5) * w).astype(int), 0, w - 1)
        vi = np.clip(((0.5 - lat / np.pi) * h).astype(int), 0, h - 1)
        sun = np.array([0.82, 0.25, 0.52]) / np.linalg.norm([0.82, 0.25, 0.52])
        shade = np.clip(x * sun[0] + y * sun[1] + z * sun[2], 0, 1) ** 0.8 * 1.6 + 0.004
        edge = np.clip((1 - np.sqrt(r2)) * n * 0.9 / 1.5, 0, 1) * (r2 < 1)
        col = np.clip(tex[vi, ui] * (shade * edge)[..., None], 0, 1)
        img = bpy.data.images.new("moon_test", n, n, float_buffer=True)
        rgba = np.concatenate([col, np.ones((n, n, 1))], axis=2)[::-1].astype(np.float32)
        img.pixels.foreach_set(rgba.ravel())
        scene = bpy.context.scene
        scene.render.image_settings.file_format = "JPEG"
        scene.render.image_settings.quality = 92
        scene.view_settings.view_transform = "Standard"
        img.save_render(out_jpg, scene=scene)
        scene.view_settings.view_transform = "AgX"
        bpy.data.images.remove(img)
    az, el = math.radians(22.0), math.radians(31.0)
    f = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
    u = (Vector((0, 0, 1)) - f * f.z).normalized()
    r = f.cross(u).normalized()
    sky = json.loads(json.dumps(SKY))
    sky["layers"].append({
        "type": "rect", "image": "moon_test.jpg",
        "forward": [round(c, 6) for c in f], "right": [round(c, 6) for c in r], "up": [round(c, 6) for c in u],
        "hfov_deg": 7.0, "vfov_deg": 7.0, "gain": [3.2, 3.1, 2.9], "gamma": 1.0, "feather": 0.05,
    })
    with open(os.path.join(WEB, "sky_rect.json"), "w") as fh:
        json.dump(sky, fh, indent=2)


def export_glb():
    os.makedirs(WEB, exist_ok=True)
    path = os.path.join(WEB, "scene.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_cameras=True,
        export_lights=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_animations=True,
        export_animation_mode="SCENE",
        export_frame_range=True,
        export_force_sampling=True,
        export_anim_slide_to_zero=False,
        export_optimize_animation_size=True,
        export_import_convert_lighting_mode="SPEC",
    )
    with open(os.path.join(WEB, "sky.json"), "w") as fh:
        json.dump(SKY, fh, indent=2)
    write_rect_test()
    print("wrote", path, os.path.getsize(path), "bytes")


def render_still(t, scale, out, kit_post=False):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = int(round(scale * 100))
    scene.view_settings.view_transform = "AgX"
    if kit_post:
        # The kit's compositor finish (bloom, fog glow, dispersion, vignette, grain) and
        # its default look, to calibrate the viewer's bloom and finish against.
        sys.path.insert(0, os.path.join(ROOT, "kit"))
        import povkit
        povkit.comp.setup()
        scene.view_settings.look = "AgX - Punchy"
    scene.eevee.taa_render_samples = 32
    scene.frame_set(1 + int(round(t * FPS)))
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)


def main():
    args = parse_args()
    ensure_sky_jpg()
    build_scene()
    build_world(SKY)
    if not args["no_export"]:
        export_glb()
    if args["still"] is not None:
        render_still(args["still"], args["scale"], args["out"] or os.path.join(HERE, "fixture_still.png"),
                     kit_post=args["kit_post"])


main()
