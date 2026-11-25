"""Mesh, node and material helpers for build_room.py (Blender 5.2).

Everything here builds geometry with bmesh and shaders with plain node trees; no operators
that need a UI context, so the build runs headless with --factory-startup.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

TAU = 2 * math.pi

# --------------------------------------------------------------------------------------------
# scene / collections
# --------------------------------------------------------------------------------------------


def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images,
                   bpy.data.node_groups, bpy.data.curves):
        for b in list(blocks):
            blocks.remove(b)


_COLLS = {}


def coll(name, parent=None):
    if name in _COLLS:
        return _COLLS[name]
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    _COLLS[name] = c
    return c


def place(obj, loc=(0, 0, 0), rot=(0, 0, 0), scale=None, parent=None):
    obj.location = loc
    obj.rotation_euler = rot
    if scale is not None:
        obj.scale = scale
    if parent is not None:
        obj.parent = parent
    return obj


def empty(name, c, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.1
    c.objects.link(e)
    return place(e, loc, rot, parent=parent)


def bm_obj(bm, name, c, mat=None, smooth=False, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, mats=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    else:
        me.shade_flat()
    ob = bpy.data.objects.new(name, me)
    c.objects.link(ob)
    if mats:
        for m in mats:
            me.materials.append(m)
    elif mat is not None:
        me.materials.append(mat)
    return place(ob, loc, rot, parent=parent)


def instance(src, name, c, loc=(0, 0, 0), rot=(0, 0, 0), scale=None, parent=None):
    """Linked duplicate: shares mesh data (instancing)."""
    ob = bpy.data.objects.new(name, src.data)
    c.objects.link(ob)
    for m in src.modifiers:
        nm = ob.modifiers.new(m.name, m.type)
        for p in m.bl_rna.properties:
            if not p.is_readonly and p.identifier not in ('name', 'type'):
                try:
                    setattr(nm, p.identifier, getattr(m, p.identifier))
                except Exception:
                    pass
    return place(ob, loc, rot, scale, parent)


# --------------------------------------------------------------------------------------------
# modifiers
# --------------------------------------------------------------------------------------------


def bevel(ob, width, segments=2, angle=35, harden=True, profile=0.5):
    m = ob.modifiers.new('Bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.harden_normals = harden
    m.profile = profile
    m.use_clamp_overlap = True
    return m


def subsurf(ob, levels=2, render=None):
    m = ob.modifiers.new('Subdivision', 'SUBSURF')
    m.levels = levels
    m.render_levels = render if render is not None else levels
    return m


def solidify(ob, thickness, offset=-1.0, even=False):
    # even offset spikes on collapsed faces (cloth corners, polar centres), so it is off by default
    m = ob.modifiers.new('Solidify', 'SOLIDIFY')
    m.thickness = thickness
    m.offset = offset
    m.use_even_offset = even
    return m


# --------------------------------------------------------------------------------------------
# primitive builders (all return objects; dimensions in metres)
# --------------------------------------------------------------------------------------------


def _xf(bm, size=None, loc=None, rot=None):
    if size is not None:
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if rot is not None:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot.to_matrix() if hasattr(rot, 'to_matrix') else rot,
                         verts=bm.verts)
    if loc is not None:
        bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)


def box_bm(size, offset=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
    _xf(bm, size=size, loc=offset)
    return bm


def box(name, c, size, loc, mat, rot=(0, 0, 0), bev=0.0, seg=2, parent=None, origin='center'):
    off = (0, 0, size[2] / 2) if origin == 'bottom' else (0, 0, 0)
    ob = bm_obj(box_bm(size, off), name, c, mat, False, loc, rot, parent)
    if bev > 0:
        bevel(ob, bev, seg)
    return ob


def cyl_bm(r, h, seg=32, r2=None, cap=True, offset=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r,
                          radius2=r if r2 is None else r2, depth=h, calc_uvs=True)
    _xf(bm, loc=offset)
    return bm


def cyl(name, c, r, h, loc, mat, rot=(0, 0, 0), seg=32, r2=None, cap=True, bev=0.0, smooth=True, parent=None,
        origin='center'):
    off = (0, 0, h / 2) if origin == 'bottom' else (0, 0, 0)
    ob = bm_obj(cyl_bm(r, h, seg, r2, cap, off), name, c, mat, smooth, loc, rot, parent)
    if bev > 0:
        bevel(ob, bev, 2, angle=50)
    return ob


def sphere_bm(r, seg=32, rings=16, scale=(1, 1, 1), offset=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r, calc_uvs=True)
    _xf(bm, size=scale, loc=offset)
    return bm


def sphere(name, c, r, loc, mat, seg=32, rings=16, scale=(1, 1, 1), rot=(0, 0, 0), parent=None, smooth=True):
    return bm_obj(sphere_bm(r, seg, rings, scale), name, c, mat, smooth, loc, rot, parent)


def lathe_bm(profile, seg=48, close_bottom=True, close_top=True, arc=TAU):
    """profile: list of (r, z), revolved around Z. r==0 points collapse to the axis."""
    bm = bmesh.new()
    full = abs(arc - TAU) < 1e-6
    nseg = seg if full else seg + 1
    rings = []
    uv_layer = bm.loops.layers.uv.new('UVMap')
    for (r, z) in profile:
        ring = []
        for i in range(nseg):
            a = arc * i / seg
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    # cumulative length along profile for v
    lens = [0.0]
    for i in range(1, len(profile)):
        lens.append(lens[-1] + math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]))
    tot = lens[-1] or 1.0
    for j in range(len(rings) - 1):
        for i in range(seg):
            i2 = (i + 1) % nseg if full else i + 1
            vs = [rings[j][i], rings[j][i2], rings[j + 1][i2], rings[j + 1][i]]
            try:
                f = bm.faces.new(vs)
            except ValueError:
                continue
            uvs = [(i / seg, lens[j] / tot), ((i + 1) / seg, lens[j] / tot), ((i + 1) / seg, lens[j + 1] / tot),
                   (i / seg, lens[j + 1] / tot)]
            for lp, uv in zip(f.loops, uvs):
                lp[uv_layer].uv = uv
    if full and close_bottom and profile[0][0] > 1e-6:
        f = bm.faces.new(list(reversed(rings[0])))
    if full and close_top and profile[-1][0] > 1e-6:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def lathe(name, c, profile, loc, mat, seg=48, rot=(0, 0, 0), smooth=True, parent=None, arc=TAU):
    return bm_obj(lathe_bm(profile, seg, arc=arc), name, c, mat, smooth, loc, rot, parent)


def ring_band(name, c, R, radial, axial, loc, mat, rot=(0, 0, 0), seg=160, chamfer=0.25, parent=None):
    """Flat metal ring: centre radius R, radial width, axial width; axis = local Z. Chamfered edges."""
    r0, r1 = R - radial / 2, R + radial / 2
    h = axial / 2
    ch = min(radial, axial) * chamfer
    prof = [(r0 + ch, -h), (r1 - ch, -h), (r1, -h + ch), (r1, h - ch), (r1 - ch, h), (r0 + ch, h), (r0, h - ch),
            (r0, -h + ch), (r0 + ch, -h)]
    bm = lathe_bm(prof, seg, close_bottom=False, close_top=False)
    ob = bm_obj(bm, name, c, mat, True, loc, rot, parent)
    return ob


def torus(name, c, R, r, loc, mat, rot=(0, 0, 0), seg=64, sides=12, parent=None):
    prof = [(R + r * math.cos(TAU * k / sides), r * math.sin(TAU * k / sides)) for k in range(sides + 1)]
    bm = lathe_bm(prof, seg, close_bottom=False, close_top=False)
    return bm_obj(bm, name, c, mat, True, loc, rot, parent)


def tube_bm(pts, r, sides=8, cap=True, radii=None):
    """Sweep a circle along a polyline (parallel transport frames)."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    tangents = []
    for i in range(n):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == n - 1:
            t = pts[-1] - pts[-2]
        else:
            t = pts[i + 1] - pts[i - 1]
        tangents.append(t.normalized() if t.length > 1e-12 else Vector((0, 0, 1)))
    ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = tangents[0].cross(ref).normalized()
    rings = []
    for i in range(n):
        if i > 0:
            axis = tangents[i - 1].cross(tangents[i])
            if axis.length > 1e-9:
                ang = tangents[i - 1].angle(tangents[i])
                nrm = (Matrix.Rotation(ang, 3, axis.normalized()) @ nrm).normalized()
        b = tangents[i].cross(nrm).normalized()
        rr = radii[i] if radii else r
        ring = []
        for k in range(sides):
            a = TAU * k / sides
            ring.append(bm.verts.new(pts[i] + (nrm * math.cos(a) + b * math.sin(a)) * rr))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            f = bm.faces.new([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]])
            for lp, uv in zip(f.loops, [(k / sides, i / (n - 1)), ((k + 1) / sides, i / (n - 1)),
                                         ((k + 1) / sides, (i + 1) / (n - 1)), (k / sides, (i + 1) / (n - 1))]):
                lp[uv_layer].uv = uv
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def tube(name, c, pts, r, mat, sides=8, cap=True, radii=None, loc=(0, 0, 0), rot=(0, 0, 0), parent=None,
         smooth=True):
    return bm_obj(tube_bm(pts, r, sides, cap, radii), name, c, mat, smooth, loc, rot, parent)


def plane_bm(w, h, uv=(0, 0, 1, 1), nx=1, ny=1):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    verts = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            row.append(bm.verts.new((-w / 2 + w * i / nx, -h / 2 + h * j / ny, 0)))
        verts.append(row)
    u0, v0, u1, v1 = uv
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new([verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]])
            for lp, (a, b) in zip(f.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]):
                lp[uv_layer].uv = (u0 + (u1 - u0) * a / nx, v0 + (v1 - v0) * b / ny)
    return bm


def plane(name, c, w, h, loc, rot, mat, uv=(0, 0, 1, 1), nx=1, ny=1, parent=None):
    return bm_obj(plane_bm(w, h, uv, nx, ny), name, c, mat, False, loc, rot, parent)


def join_bms(bms):
    """Merge several bmeshes into one (keeps the UV layer named UVMap and material indices)."""
    me = bpy.data.meshes.new('_tmp_join')
    out = bmesh.new()
    for b in bms:
        b.to_mesh(me)
        out.from_mesh(me)
        b.free()
    bpy.data.meshes.remove(me)
    return out


def set_mat_index(bm, idx):
    for f in bm.faces:
        f.material_index = idx
    return bm


def bm_transform(bm, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    from mathutils import Euler
    if scale is not None:
        bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler(rot).to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return bm


# --------------------------------------------------------------------------------------------
# nodes and materials
# --------------------------------------------------------------------------------------------


def N(nt, kind, x=0, y=0, **inputs):
    n = nt.nodes.new(kind)
    n.location = (x, y)
    for k, v in inputs.items():
        if k.startswith('p_'):
            setattr(n, k[2:], v)
            continue
        key = k.replace('_', ' ')
        sock = n.inputs.get(key)
        if sock is None:  # identifiers can differ from display names in 5.x; match by name
            sock = next((s for s in n.inputs if s.name == key), None)
        if sock is None:
            # some sockets are addressed by index ("A", "B" on math nodes)
            raise KeyError(f'{kind} has no input {key!r}: {[s.name for s in n.inputs]}')
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, sock)
        else:
            sock.default_value = v
    return n


def L(nt, a, b):
    nt.links.new(a, b)


def math_node(nt, op, a, b=None, c=None, clamp=False):
    """Math node; MULTIPLY_ADD uses a * b + c."""
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, n.inputs[i])
        else:
            n.inputs[i].default_value = v
    return n.outputs[0]


def vmath(nt, op, a, b=None):
    n = nt.nodes.new('ShaderNodeVectorMath')
    n.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, n.inputs[i])
        else:
            n.inputs[i].default_value = v
    return n


def mix_rgb(nt, fac, a, b, blend='MIX'):
    n = nt.nodes.new('ShaderNodeMix')
    n.data_type = 'RGBA'
    n.blend_type = blend
    for sock, v in ((n.inputs['Factor'], fac), (n.inputs[6], a), (n.inputs[7], b)):
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, sock)
        else:
            sock.default_value = v if not isinstance(v, (tuple, list)) or len(v) == 4 else tuple(v) + (1.0,)
    return n.outputs[2]


def ramp(nt, fac, stops):
    """stops: list of (pos, (r,g,b)) ; returns color output."""
    n = nt.nodes.new('ShaderNodeValToRGB')
    el = n.color_ramp.elements
    el[0].position, el[0].color = stops[0][0], tuple(stops[0][1]) + (1,)
    el[1].position, el[1].color = stops[-1][0], tuple(stops[-1][1]) + (1,)
    for pos, col in stops[1:-1]:
        e = el.new(pos)
        e.color = tuple(col) + (1,)
    L(nt, fac, n.inputs[0])
    return n.outputs[0]


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True  # still required in 5.2 for a node tree on new materials (deprecated, removed in 6.0)
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    out = nt.nodes.get('Material Output')
    return m, nt, p, out


PKEYS = {
    'rough': 'Roughness', 'metal': 'Metallic', 'ior': 'IOR', 'alpha': 'Alpha', 'spec': 'Specular IOR Level',
    'spec_tint': 'Specular Tint', 'aniso': 'Anisotropic', 'aniso_rot': 'Anisotropic Rotation',
    'trans': 'Transmission Weight', 'coat': 'Coat Weight', 'coat_rough': 'Coat Roughness', 'coat_tint': 'Coat Tint',
    'sheen': 'Sheen Weight', 'sheen_rough': 'Sheen Roughness', 'sheen_tint': 'Sheen Tint',
    'sss': 'Subsurface Weight', 'sss_radius': 'Subsurface Radius', 'sss_scale': 'Subsurface Scale',
    'emit': 'Emission Color', 'emit_strength': 'Emission Strength', 'thin': 'Thin Wall',
    'diff_rough': 'Diffuse Roughness',
}


def rgba(c):
    return tuple(c) + (1.0,) if len(c) == 3 else tuple(c)


def set_p(nt, p, **kw):
    for k, v in kw.items():
        sock = p.inputs[PKEYS[k]]
        if isinstance(v, bpy.types.NodeSocket):
            nt.links.new(v, sock)
        elif isinstance(v, (tuple, list)) and len(v) in (3, 4) and sock.type == 'RGBA':
            sock.default_value = rgba(v)
        else:
            sock.default_value = v


def principled(name, color, **kw):
    m, nt, p, out = new_mat(name)
    if isinstance(color, bpy.types.NodeSocket):
        nt.links.new(color, p.inputs['Base Color'])
    else:
        p.inputs['Base Color'].default_value = rgba(color)
    set_p(nt, p, **kw)
    return m


def emission(name, color, strength, shadow_invisible=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.bl_idname != 'ShaderNodeOutputMaterial':
            nt.nodes.remove(n)
    out = nt.nodes['Material Output']
    e = N(nt, 'ShaderNodeEmission', -200, 0, Color=rgba(color), Strength=strength)
    L(nt, e.outputs[0], out.inputs['Surface'])
    return m


def image(path, noncolor=False):
    img = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        img.colorspace_settings.name = 'Non-Color'
    return img


def tex_node(nt, img, vec=None, interp='Cubic', ext='REPEAT', x=-600, y=0):
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = img
    n.interpolation = interp
    n.extension = ext
    n.location = (x, y)
    if vec is not None:
        L(nt, vec, n.inputs['Vector'])
    return n


def kelvin_rgb(k):
    """Approximate blackbody colour (linear-ish, normalised) for warm light tints."""
    t = k / 100.0
    if t <= 66:
        r = 1.0
        g = max(0.0, min(1.0, (99.4708025861 * math.log(t) - 161.1195681661) / 255))
        b = 0.0 if t <= 19 else max(0.0, min(1.0, (138.5177312231 * math.log(t - 10) - 305.0447927307) / 255))
    else:
        r = max(0.0, min(1.0, 329.698727446 * ((t - 60) ** -0.1332047592) / 255))
        g = max(0.0, min(1.0, 288.1221695283 * ((t - 60) ** -0.0755148492) / 255))
        b = 1.0
    # convert sRGB-ish to linear
    return tuple(c ** 2.2 for c in (r, g, b))


# --------------------------------------------------------------------------------------------
# lights
# --------------------------------------------------------------------------------------------


def light(name, c, kind, loc, rot=(0, 0, 0), energy=10.0, color=(1, 1, 1), size=0.1, size_y=None, radius=None,
          spot=None, blend=0.3, camera=False, glossy=True, diffuse=True, parent=None):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.shape = 'RECTANGLE' if size_y is not None else 'SQUARE'
        ld.size = size
        if size_y is not None:
            ld.size_y = size_y
    elif kind in ('POINT', 'SPOT'):
        ld.shadow_soft_size = radius if radius is not None else size
        if kind == 'SPOT':
            ld.spot_size = spot or math.radians(60)
            ld.spot_blend = blend
    ob = bpy.data.objects.new(name, ld)
    c.objects.link(ob)
    ob.visible_camera = camera
    ob.visible_glossy = glossy
    ob.visible_diffuse = diffuse
    return place(ob, loc, rot, parent=parent)


def look_at_rot(src, dst, up=(0, 0, 1)):
    d = (Vector(dst) - Vector(src)).normalized()
    return d.to_track_quat('-Z', 'Y').to_euler()
