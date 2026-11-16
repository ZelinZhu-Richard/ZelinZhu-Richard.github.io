"""povkit: shared Blender 5.2 kit for the vertical first-person POV films.

A film's build.py does:

    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'kit'))
    import povkit as pk

    def build(ctx):
        cam = pk.camera.drive([(0, -5), (0, 30), (6, 60)], speed_mps=5.5)
        pk.vehicle.car_dashboard(cam)
        pk.sky.galactic(core_az=20, core_el=25, tilt=-40)
        ...

    pk.main('my-slug', build)

Conventions: meters, Z up, +Y is the initial travel direction, azimuth is measured
from +Y toward +X (clockwise seen from above), elevation above the horizon.
See kit/README.md for the full API.
"""

import bpy
import bmesh
import math
import os
import sys
import time
import json
import random
import hashlib
import tempfile

import numpy as np
from mathutils import Vector, Matrix, Euler

# ----------------------------------------------------------------------------
# Paths and constants
# ----------------------------------------------------------------------------

KIT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(KIT_DIR)
ASSETS = os.path.join(ROOT, 'assets')
WEB_ASSETS = os.path.join(ASSETS, 'web')
FILMS = os.path.join(ROOT, 'films')
RENDERS = os.path.join(ROOT, 'renders')

PLATE_ESO = os.path.join(ASSETS, 'sky', 'eso0932a', 'eso0932a.tif')
PLATE_STARS = os.path.join(ASSETS, 'sky', 'nasa-svs-4851', 'hiptyc_2020_16k_gal.exr')
PLATE_MILKYWAY = os.path.join(ASSETS, 'sky', 'nasa-svs-4851', 'milkyway_2020_8k_gal.exr')
MOON_COLOR = os.path.join(ASSETS, 'moon', 'nasa-svs-4720', 'lroc_color_poles_4k.tif')
MOON_DEM = os.path.join(ASSETS, 'moon', 'nasa-svs-4720', 'ldem_16_uint.tif')

# Derived plates (8-bit sRGB versions that Blender loads as byte images, far lighter than the
# float EXR) are cached in the system temp dir, never inside the project.
CACHE_DIR = os.path.join(tempfile.gettempdir(), 'povkit-cache')

RES_X, RES_Y = 1080, 1920
FPS = 24
FRAME_START, FRAME_END = 1, 336

# The ESO all-sky mosaic is not exactly in galactic coordinates. Measured against the NASA
# SVS galactic plates by phase correlation of the dust lanes (residual < 0.1 deg near the
# core): rotate about the galactic pole by ALPHA, then tilt by THETA about the in-plane axis
# at longitude PHI. Applied as lookup = C_ESO @ galactic_lookup.
ESO_ALPHA, ESO_THETA, ESO_PHI = -3.18, 2.175, -117.3

LUMA = (0.2126, 0.7152, 0.0722)


def log(*a):
    print('[povkit]', *a, flush=True)


# ----------------------------------------------------------------------------
# Small math helpers
# ----------------------------------------------------------------------------

def sky_dir(az_deg, el_deg):
    """World direction for azimuth (deg, from +Y toward +X) and elevation (deg)."""
    az, el = math.radians(az_deg), math.radians(el_deg)
    return Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))


def _rot_axis(axis, ang_deg):
    return Matrix.Rotation(math.radians(ang_deg), 3, Vector(axis).normalized())


def _smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _srgb_to_lin(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4).astype(np.float32)


def _lin_to_srgb(a):
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)


def _hash(*parts):
    h = hashlib.sha1(repr(parts).encode()).hexdigest()
    return h[:10]


# ----------------------------------------------------------------------------
# Context and state
# ----------------------------------------------------------------------------

class Ctx:
    """Passed to build_fn. Holds the scene, CLI args, paths, RNG and things the kit made."""

    def __init__(self, slug, args):
        self.slug = slug
        self.args = args
        self.scene = bpy.context.scene
        self.fps = FPS
        self.frame_start = FRAME_START
        self.frame_end = FRAME_END
        self.film_dir = os.path.join(FILMS, slug)
        self.render_dir = os.path.join(RENDERS, slug)
        self.web_dir = os.path.join(self.film_dir, 'web')
        self.rng = random.Random(1234)
        self.camera = None
        self.path = None
        self.s_of_t = None
        self.web_skip = set()
        self._collections = {}

    def t2f(self, t):
        """Seconds to (float) frame; frame 1 is t = 0."""
        return 1.0 + t * self.fps

    def f2t(self, f):
        return (f - 1.0) / self.fps

    def collection(self, name):
        """Get or create a collection linked under the scene collection."""
        c = self._collections.get(name) or bpy.data.collections.get(name)
        if c is None:
            c = bpy.data.collections.new(name)
            self.scene.collection.children.link(c)
        self._collections[name] = c
        return c


_STATE = {'ctx': None, 'comp_done': False, 'time_nodes': [], 'px_inputs': []}


def ctx():
    return _STATE['ctx']


def _link(obj, collection=None):
    c = collection
    if isinstance(c, str):
        c = ctx().collection(c) if ctx() else None
    if c is None:
        c = bpy.context.scene.collection
    c.objects.link(obj)
    return obj


def _reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras,
                 bpy.data.curves, bpy.data.worlds, bpy.data.node_groups):
        for d in list(coll):
            coll.remove(d)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for img in list(bpy.data.images):
        if img.name not in ('Render Result', 'Viewer Node'):
            bpy.data.images.remove(img)


# ----------------------------------------------------------------------------
# Node helpers (shader, world and compositor trees)
# ----------------------------------------------------------------------------

def _is_socket(v):
    return isinstance(v, bpy.types.NodeSocket)


def _set(nt, sock, v):
    if v is None:
        return
    if _is_socket(v):
        nt.links.new(v, sock)
        return
    dv = sock.default_value
    if hasattr(dv, '__len__') and not isinstance(v, str):
        if not hasattr(v, '__len__'):
            v = [v] * len(dv)
        v = list(v)
        if len(v) < len(dv):
            v = v + [1.0] * (len(dv) - len(v))
        sock.default_value = v[:len(dv)]
    else:
        sock.default_value = v


def node(nt, typ, inputs=None, **props):
    """Create a node, set properties, then inputs {name_or_index: value_or_socket}."""
    n = nt.nodes.new(typ)
    for k, v in props.items():
        setattr(n, k, v)
    if inputs:
        for k, v in inputs.items():
            _set(nt, n.inputs[k], v)
    return n


def math_(nt, op, a, b=None, c=None, clamp=False):
    n = node(nt, 'ShaderNodeMath', operation=op, use_clamp=clamp)
    _set(nt, n.inputs[0], a)
    if b is not None:
        _set(nt, n.inputs[1], b)
    if c is not None:
        _set(nt, n.inputs[2], c)
    return n.outputs[0]


def vmath(nt, op, a, b=None, c=None, scale=None):
    n = node(nt, 'ShaderNodeVectorMath', operation=op)
    _set(nt, n.inputs[0], a)
    if b is not None:
        _set(nt, n.inputs[1], b)
    if c is not None:
        _set(nt, n.inputs[2], c)
    if scale is not None:
        _set(nt, n.inputs[3], scale)
    if op in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE'):
        return n.outputs[1]
    return n.outputs[0]


def mix_col(nt, fac, a, b, blend='MIX', clamp_factor=True, clamp_result=False):
    n = node(nt, 'ShaderNodeMix', data_type='RGBA', blend_type=blend,
             clamp_factor=clamp_factor, clamp_result=clamp_result)
    _set(nt, n.inputs[0], fac)
    _set(nt, n.inputs[6], a)
    _set(nt, n.inputs[7], b)
    return n.outputs[2]


def mix_f(nt, fac, a, b):
    n = node(nt, 'ShaderNodeMix', data_type='FLOAT')
    _set(nt, n.inputs[0], fac)
    _set(nt, n.inputs[2], a)
    _set(nt, n.inputs[3], b)
    return n.outputs[0]


def maprange(nt, v, fmin, fmax, tmin=0.0, tmax=1.0, interp='LINEAR', clamp=True):
    n = node(nt, 'ShaderNodeMapRange', interpolation_type=interp, clamp=clamp)
    for i, x in enumerate((v, fmin, fmax, tmin, tmax)):
        _set(nt, n.inputs[i], x)
    return n.outputs[0]


def sep_xyz(nt, v):
    n = node(nt, 'ShaderNodeSeparateXYZ')
    _set(nt, n.inputs[0], v)
    return n.outputs


def comb_xyz(nt, x, y, z):
    n = node(nt, 'ShaderNodeCombineXYZ')
    for i, s in enumerate((x, y, z)):
        _set(nt, n.inputs[i], s)
    return n.outputs[0]


def noise(nt, vec, scale=5.0, detail=2.0, rough=0.5, distortion=0.0, dims='3D', w=None):
    n = node(nt, 'ShaderNodeTexNoise', noise_dimensions=dims)
    _set(nt, n.inputs['Vector'], vec)
    _set(nt, n.inputs['Scale'], scale)
    _set(nt, n.inputs['Detail'], detail)
    _set(nt, n.inputs['Roughness'], rough)
    _set(nt, n.inputs['Distortion'], distortion)
    if w is not None:
        _set(nt, n.inputs['W'], w)
    return n.outputs['Factor'], n.outputs['Color']


def voronoi(nt, vec, scale=5.0, feature='F1', dims='3D', randomness=1.0, w=None):
    n = node(nt, 'ShaderNodeTexVoronoi', feature=feature, voronoi_dimensions=dims)
    _set(nt, n.inputs['Vector'], vec)
    _set(nt, n.inputs['Scale'], scale)
    _set(nt, n.inputs['Randomness'], randomness)
    if w is not None:
        _set(nt, n.inputs['W'], w)
    return n.outputs


def bump(nt, height, strength=0.2, distance=0.01, normal=None):
    n = node(nt, 'ShaderNodeBump')
    _set(nt, n.inputs['Strength'], strength)
    _set(nt, n.inputs['Distance'], distance)
    _set(nt, n.inputs['Height'], height)
    if normal is not None:
        _set(nt, n.inputs['Normal'], normal)
    return n.outputs['Normal']


def texcoord(nt, kind='Object'):
    n = node(nt, 'ShaderNodeTexCoord')
    return n.outputs[kind]


def attr(nt, name, kind='Fac', atype='GEOMETRY'):
    n = node(nt, 'ShaderNodeAttribute', attribute_name=name, attribute_type=atype)
    return n.outputs[kind]


def time_value(nt):
    """A Value node driven by the scene time in seconds (simple expression, works headless)."""
    n = node(nt, 'ShaderNodeValue')
    n.label = 'pk_time'
    fc = n.outputs[0].driver_add('default_value')
    fc.driver.type = 'SCRIPTED'
    fc.driver.expression = '(frame - 1) / %d.0' % FPS
    return n.outputs[0]


# ----------------------------------------------------------------------------
# Images
# ----------------------------------------------------------------------------

def _oiio():
    import OpenImageIO as oiio
    return oiio


def read_image(path):
    """Read any image with OpenImageIO as float32 (H, W, C), top row first, values as stored."""
    oiio = _oiio()
    buf = oiio.ImageBuf(path)
    arr = np.asarray(buf.get_pixels(oiio.FLOAT))
    if arr.ndim == 2:
        arr = arr[..., None]
    return arr


def np_image(name, arr, colorspace='Linear Rec.709', half=True):
    """Create a packed-in-memory float Blender image from a (H, W, 3|4) array, top row first."""
    arr = np.asarray(arr, dtype=np.float32)
    H, W = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((H, W, 1), np.float32)], axis=2)
    old = bpy.data.images.get(name)
    if old is not None:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, W, H, alpha=True, float_buffer=True)
    img.colorspace_settings.name = colorspace
    img.alpha_mode = 'CHANNEL_PACKED'
    img.pixels.foreach_set(np.ascontiguousarray(arr[::-1]).ravel())
    img.update()
    img.use_half_precision = half
    return img


def load_image(path, colorspace=None, half=True):
    """Load an image file into Blender (cached by path)."""
    for img in bpy.data.images:
        if img.filepath and os.path.abspath(bpy.path.abspath(img.filepath)) == os.path.abspath(path):
            return img
    img = bpy.data.images.load(path, check_existing=True)
    if colorspace is None:
        ext = os.path.splitext(path)[1].lower()
        colorspace = 'Linear Rec.709' if ext in ('.exr', '.hdr') else 'sRGB'
    img.colorspace_settings.name = colorspace
    img.alpha_mode = 'CHANNEL_PACKED'
    try:
        img.use_half_precision = half
    except Exception:
        pass
    return img


def write_jpg(path, arr_lin, k=1.0, quality=92, already_srgb=False):
    """Write a linear (H, W, 3) array, top row first, scaled by k, as an sRGB JPG."""
    oiio = _oiio()
    a = np.asarray(arr_lin[..., :3], np.float32)
    enc = np.clip(a, 0, 1) if already_srgb else _lin_to_srgb(a * k)
    u8 = np.ascontiguousarray((enc * 255.0 + 0.5).astype(np.uint8))
    H, W = u8.shape[:2]
    spec = oiio.ImageSpec(W, H, 3, 'uint8')
    spec.attribute('Compression', 'jpeg:%d' % quality)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = oiio.ImageOutput.create(path)
    out.open(path, spec)
    out.write_image(u8)
    out.close()
    return path


# ----------------------------------------------------------------------------
# Render setup
# ----------------------------------------------------------------------------

class render:
    """EEVEE render configuration."""

    @staticmethod
    def setup(samples=64, exposure=-0.4, view_transform='Khronos PBR Neutral', look='None',
              motion_blur=0.32,
              raytrace=True, trace_res='1', trace_max_roughness=0.55, fast_gi=True,
              volumetric_tile='8', volumetric_samples=48, volumetric_end=220.0,
              shadow_rays=1, filter_size=1.2, clamp_indirect=10.0):
        sc = bpy.context.scene
        r = sc.render
        r.engine = 'BLENDER_EEVEE'
        r.resolution_x, r.resolution_y = RES_X, RES_Y
        r.resolution_percentage = 100
        r.fps, r.fps_base = FPS, 1.0
        sc.frame_start, sc.frame_end = FRAME_START, FRAME_END
        r.filter_size = filter_size
        r.film_transparent = False
        r.use_motion_blur = motion_blur > 0
        r.motion_blur_shutter = max(motion_blur, 0.01)
        r.image_settings.file_format = 'PNG'
        r.image_settings.color_mode = 'RGB'
        r.image_settings.color_depth = '8'
        r.image_settings.compression = 15
        r.use_compositing = True
        r.use_sequencer = False

        ee = sc.eevee
        ee.taa_render_samples = samples
        ee.use_raytracing = raytrace
        ee.ray_tracing_method = 'SCREEN'
        rto = ee.ray_tracing_options
        rto.resolution_scale = trace_res
        rto.trace_max_roughness = trace_max_roughness
        rto.screen_trace_quality = 0.6
        rto.screen_trace_thickness = 0.35
        rto.use_denoise = True
        rto.denoise_spatial = True
        rto.denoise_temporal = True
        rto.denoise_bilateral = True
        ee.use_fast_gi = fast_gi
        ee.fast_gi_method = 'GLOBAL_ILLUMINATION'
        ee.fast_gi_resolution = '2'
        ee.fast_gi_ray_count = 2
        ee.fast_gi_step_count = 8
        ee.fast_gi_distance = 4.0
        ee.use_shadows = True
        ee.shadow_ray_count = shadow_rays
        ee.shadow_step_count = 6
        ee.volumetric_tile_size = volumetric_tile
        ee.volumetric_samples = volumetric_samples
        ee.volumetric_end = volumetric_end
        ee.volumetric_start = 0.5
        ee.use_volumetric_shadows = True
        ee.volumetric_shadow_samples = 8
        ee.motion_blur_steps = 1
        ee.clamp_surface_indirect = clamp_indirect
        ee.light_threshold = 0.01

        vs = sc.view_settings
        vs.view_transform = view_transform
        vs.look = look if view_transform == 'AgX' else 'None'
        vs.exposure = exposure
        vs.gamma = 1.0
        sc.display_settings.display_device = 'sRGB'


# ----------------------------------------------------------------------------
# Sky
# ----------------------------------------------------------------------------

class _SkyState:
    def __init__(self):
        self.layers = []
        self.grade = dict(exposure=0.0, contrast=1.0, saturation=1.0, tint=(1.0, 1.0, 1.0))
        self.horizon_glow = dict(color=(1.0, 0.55, 0.3), strength=0.0, height_deg=10.0)
        self.light_gain = 0.15
        self.light_tint = (0.75, 0.85, 1.0)
        self.ambient = (0.004, 0.006, 0.012)
        self.world = None


_SKY = _SkyState()

# Blender's Environment Texture node maps lookup direction d to u = 0.5 - atan2(d.y, d.x)/(2 pi).
# The sky.json contract writes u = atan2(d.y, -d.x)/(2 pi) + 0.5, which is the same mapping
# after a 180 degree turn about Z. Exported matrices are therefore RZ180 @ M_blender.
RZ180 = Matrix(((-1, 0, 0), (0, -1, 0), (0, 0, 1)))


class sky:
    """World sky built from real plates. Layers sum in linear light, then grade, then glow."""

    @staticmethod
    def reset():
        global _SKY
        _SKY = _SkyState()

    # ---------------------------------------------------------------- matrices
    @staticmethod
    def galactic_matrix(core_az=20.0, core_el=25.0, tilt=-40.0):
        """3x3 rotation mapping a world direction to the galactic lookup direction
        (Blender equirect convention: +X = galactic centre, +Y = l 90, +Z = north pole).
        tilt is the band angle at the core seen from the ground: 0 = level, positive rises
        to the right."""
        Z = Vector((0, 0, 1))
        cw = sky_dir(core_az, core_el)
        rh = cw.cross(Z).normalized()
        uh = rh.cross(cw).normalized()
        t = math.radians(tilt)
        bw = rh * math.cos(t) + uh * math.sin(t)      # image right on the plate (l decreasing)
        nw = -rh * math.sin(t) + uh * math.cos(t)     # galactic north
        W = Matrix((cw, bw, nw)).transposed()        # columns = world frame
        L = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, 1))).transposed()  # columns C, -L90, N
        return L @ W.transposed()

    @staticmethod
    def eso_correction():
        return _rot_axis((0, 0, 1), ESO_ALPHA) @ _rot_axis(
            (math.cos(math.radians(ESO_PHI)), math.sin(math.radians(ESO_PHI)), 0), ESO_THETA)

    # ---------------------------------------------------------------- layer API
    @staticmethod
    def add_equirect_layer(name, image, matrix, gain=1.0, gamma=1.0, interp='Linear',
                           el_mask=None, web=None, fade=None):
        """Low-level: add an equirect layer. matrix maps world dir -> Blender lookup dir.
        el_mask = (el_deg, feather_deg) hides the plate below that plate-space elevation.
        fade = (floor, height_deg): atmospheric extinction, the layer is multiplied by
        floor + (1 - floor) * smoothstep(0, height_deg, world elevation).
        web = dict(key=..., make=callable -> (array_lin_topfirst, k)) for export."""
        g = tuple(gain) if hasattr(gain, '__len__') else (gain, gain, gain)
        _SKY.layers.append(dict(type='equirect', name=name, image=image, matrix=Matrix(matrix),
                                gain=g, gamma=gamma, interp=interp, el_mask=el_mask, web=web,
                                fade=fade))
        sky.build()

    @staticmethod
    def add_rect_layer(name, image, forward, right, up, hfov_deg, vfov_deg, gain=1.0,
                       gamma=1.0, feather=0.05, blend='add', web=None):
        g = tuple(gain) if hasattr(gain, '__len__') else (gain, gain, gain)
        _SKY.layers.append(dict(type='rect', name=name, image=image, forward=Vector(forward),
                                right=Vector(right), up=Vector(up), hfov=hfov_deg, vfov=vfov_deg,
                                gain=g, gamma=gamma, feather=feather, blend=blend, web=web))
        sky.build()

    @staticmethod
    def set_grade(exposure=None, contrast=None, saturation=None, tint=None):
        for k, v in (('exposure', exposure), ('contrast', contrast),
                     ('saturation', saturation), ('tint', tint)):
            if v is not None:
                _SKY.grade[k] = tuple(v) if k == 'tint' else v
        sky.build()

    @staticmethod
    def set_horizon_glow(color=(1.0, 0.55, 0.3), strength=0.0, height_deg=10.0):
        _SKY.horizon_glow = dict(color=tuple(color), strength=strength, height_deg=height_deg)
        sky.build()

    @staticmethod
    def set_lighting(gain=0.15, tint=(0.75, 0.85, 1.0), ambient=(0.004, 0.006, 0.012)):
        """How much the sky lights the scene (non-camera rays): sky * gain * tint + ambient.
        Camera rays always see the full graded sky."""
        _SKY.light_gain, _SKY.light_tint, _SKY.ambient = gain, tuple(tint), tuple(ambient)
        sky.build()

    # ---------------------------------------------------------------- galactic
    @staticmethod
    def galactic(core_az=10.0, core_el=22.0, tilt=-35.0, anchor_l=0.0, anchor_b=0.0,
                 exposure=0.8, contrast=1.35, saturation=1.5, tint=(0.8, 0.86, 1.25),
                 mw_boost=1.0, star_boost=4.0, star_gamma=0.9, source='photo',
                 star_interp='Linear', star_radius=2, detail=0.8, detail_radius=6,
                 dust_contrast=0.0,
                 eso_detail=None, eso_sharpen=None,
                 background=(0.002, 0.004, 0.022),
                 airglow=0.5, airglow_color=(0.30, 1.0, 0.45), airglow_red=0.35,
                 skyglow=0.25, skyglow_color=(0.10, 0.16, 0.38), dawn=0.0, dawn_az=0.0,
                 dawn_color=(1.0, 0.42, 0.16), dawn_height_deg=12.0, dawn_spread_deg=70.0,
                 extinction=0.8, extinction_height_deg=18.0,
                 horizon_glow=0.015, horizon_color=(0.3, 0.4, 0.95), horizon_height_deg=11.0,
                 light=0.15, light_tint=(0.7, 0.82, 1.0), ambient=(0.004, 0.006, 0.012),
                 seed=3):
        """Real Milky Way sky. The galactic point (anchor_l, anchor_b) (default: the core)
        sits at (core_az, core_el) relative to the initial travel direction (+Y); tilt sets
        the band angle there (negative = descends to the right; galactic longitude decreases
        to the right). Glow and dust lanes come from the ESO/S. Brunier photo made starless
        (source='eso'), the NASA SVS 8k map ('nasa') or both ('mix'); every point star comes
        from the NASA 16k Hipparcos/Tycho layer (star_gamma > 1 = fewer, sharper stars with
        black gaps). extinction fades stars and Milky Way toward the horizon (to 1-extinction
        at el 0 over extinction_height_deg). airglow/skyglow/dawn are a procedural horizon
        layer (green and red airglow bands, light-dome gradient, dawn glow); horizon_glow is
        the graded additive dome of the sky.json contract. eso_detail/eso_sharpen are accepted
        for compatibility and ignored."""
        sky.reset()
        M = sky.galactic_matrix(core_az, core_el, tilt)
        if anchor_l or anchor_b:
            M = _rot_axis((0, 0, 1), anchor_l) @ _rot_axis((0, 1, 0), -anchor_b) @ M
        sky._galactic_args = dict(core_az=core_az, core_el=core_el, tilt=tilt,
                                  anchor_l=anchor_l, anchor_b=anchor_b)
        fade = (1.0 - extinction, extinction_height_deg) if extinction > 0 else None
        if source == 'photo':
            mkey = 'milkyway_photo_r%d_d%d_dr%d_dc%d' % (star_radius, int(round(detail * 100)),
                                                       detail_radius, int(round(dust_contrast * 100)))
            cpath = _cached_png(mkey, lambda: milkyway_plate(detail, detail_radius, star_radius,
                                                             3, dust_contrast), bits=16)
            img = load_image(cpath, 'sRGB')
            make = (lambda p=cpath: (_downsize(read_image(p)[..., :3], 8192), 'srgb'))
            sky.add_equirect_layer('milkyway', img, M, gain=mw_boost, interp='Linear', fade=fade,
                                   web=dict(key=mkey, make=make))
        if source in ('eso', 'mix'):
            w = 1.0 if source == 'eso' else 0.6
            ekey = 'eso0932a_starless_r%d_d%d' % (star_radius, int(round(dust_contrast * 100)))
            cpath = _cached_png(ekey, lambda: eso_plate(star_radius, 2.0, 3, dust_contrast))
            img = load_image(cpath, 'sRGB')
            make = (lambda p=cpath: (read_image(p)[..., :3], 'srgb'))
            sky.add_equirect_layer('milkyway_eso', img, sky.eso_correction() @ M,
                                   gain=mw_boost * w, interp='Linear', fade=fade,
                                   web=dict(key=ekey, make=make))
        if source in ('nasa', 'mix'):
            w = 1.0 if source == 'nasa' else 0.4
            img = load_image(PLATE_MILKYWAY, 'Linear Rec.709')
            sky.add_equirect_layer('milkyway_nasa', img, M, gain=mw_boost * w * 3.2,
                                   interp='Linear', fade=fade,
                                   web=dict(key='milkyway_2020_8k', make=_web_milkyway))
        img = load_image(_stars_png(), 'sRGB')
        sky.add_equirect_layer('stars', img, M, gain=star_boost * 1.6, gamma=star_gamma,
                               interp=star_interp, fade=fade,
                               web=dict(key='hiptyc_2020_8k_mean', make=_web_stars))
        if airglow > 0 or skyglow > 0 or dawn > 0 or max(background) > 0:
            sky.atmosphere(airglow=airglow, airglow_color=airglow_color, airglow_red=airglow_red,
                           background=background,
                           skyglow=skyglow, skyglow_color=skyglow_color, dawn=dawn,
                           dawn_az=dawn_az, dawn_color=dawn_color,
                           dawn_height_deg=dawn_height_deg, dawn_spread_deg=dawn_spread_deg,
                           seed=seed)
        _SKY.grade = dict(exposure=exposure, contrast=contrast, saturation=saturation,
                          tint=tuple(tint))
        _SKY.horizon_glow = dict(color=tuple(horizon_color), strength=horizon_glow,
                                 height_deg=horizon_height_deg)
        _SKY.light_gain, _SKY.light_tint, _SKY.ambient = light, tuple(light_tint), tuple(ambient)
        sky.build()

    # ---------------------------------------------------------------- atmosphere
    @staticmethod
    def atmosphere(airglow=0.5, airglow_color=(0.30, 1.0, 0.45), airglow_red=0.35,
                   background=(0.0015, 0.003, 0.009), skyglow=0.25, skyglow_color=(0.10, 0.16, 0.38), dawn=0.0, dawn_az=0.0,
                   dawn_color=(1.0, 0.42, 0.16), dawn_height_deg=12.0, dawn_spread_deg=70.0,
                   seed=3, res=2048):
        """Procedural horizon layer baked to a world-frame equirect (same image in Blender
        and on the web): green 557.7 nm airglow band with faint wave structure, a red band
        above it, a light-dome gradient and an optional dawn glow toward dawn_az."""
        params = (airglow, tuple(airglow_color), airglow_red, tuple(background), skyglow,
                  tuple(skyglow_color), dawn, dawn_az, tuple(dawn_color), dawn_height_deg,
                  dawn_spread_deg, seed, res)
        arr = _atmosphere_array(*params)
        key = 'atmo_' + _hash(*params)
        img = np_image('pk_' + key, arr)
        k = 1.0 / max(float(arr.max()), 1e-6)
        sky.add_equirect_layer('atmosphere', img, Matrix.Identity(3), gain=1.0,
                               web=dict(key=key, make=lambda a=arr, kk=k: (a, kk)))

    # ---------------------------------------------------------------- equirect plates
    @staticmethod
    def equirect(path, yaw_deg=0.0, pitch_deg=0.0, roll_deg=0.0, gain=1.0, gamma=1.0,
                 el_min_deg=0.0, el_feather_deg=3.0, interp='Linear', name=None):
        """Any equirect plate (HDR/EXR/JPG/PNG/TIF). yaw_deg is the world azimuth where the
        plate centre (u = 0.5) appears. Plate content below el_min_deg (plate space) fades out
        over el_feather_deg so plate ground never shows. Pass el_min_deg=None to keep all."""
        img = load_image(path)
        M = _rot_axis((0, 0, 1), yaw_deg - 90.0)
        if pitch_deg or roll_deg:
            M = Euler((math.radians(roll_deg), math.radians(pitch_deg), 0), 'XYZ').to_matrix() @ M
        mask = None if el_min_deg is None else (el_min_deg, el_feather_deg)
        key = 'eq_' + os.path.splitext(os.path.basename(path))[0] + '_' + _hash(path, mask)

        def make(p=path, m=mask):
            a = read_image(p)[..., :3]
            if not p.lower().endswith(('.exr', '.hdr')):
                a = _srgb_to_lin(a)
            a = _downsize(a, 8192)
            if m is not None:
                H = a.shape[0]
                el = 90.0 - (np.arange(H) + 0.5) / H * 180.0
                a = a * _smoothstep(m[0], m[0] + m[1], el)[:, None, None]
            k = 1.0 / max(float(np.percentile(a, 99.95)), 1e-6)
            return a, k
        sky.add_equirect_layer(name or 'equirect', img, M, gain=gain, gamma=gamma,
                               interp=interp, el_mask=mask, web=dict(key=key, make=make))

    # ---------------------------------------------------------------- photo plates
    @staticmethod
    def rect_frame(center_az, center_el, roll_deg=0.0):
        f = sky_dir(center_az, center_el)
        Z = Vector((0, 0, 1))
        r = f.cross(Z)
        if r.length < 1e-6:
            r = Vector((1, 0, 0))
        r.normalize()
        u = r.cross(f).normalized()
        if roll_deg:
            R = Matrix.Rotation(math.radians(-roll_deg), 3, f)
            r, u = R @ r, R @ u
        return f, r, u

    @staticmethod
    def photo_plate(path, center_az, center_el, hfov_deg, roll_deg=0.0, vfov_deg=None,
                    gain=1.0, gamma=1.0, feather=0.05, blend='add', name=None, colorspace=None):
        """Project a rectilinear photograph onto the sky dome at infinity (gnomonic
        projection, no parallax). blend: 'add', 'screen', 'lighten', 'over' (uses the
        image alpha), 'replace' (opaque inside the feathered rectangle)."""
        img = load_image(path, colorspace)
        W, H = img.size
        if vfov_deg is None:
            vfov_deg = math.degrees(2 * math.atan(math.tan(math.radians(hfov_deg) / 2) * H / W))
        f, r, u = sky.rect_frame(center_az, center_el, roll_deg)
        key = 'rect_' + os.path.splitext(os.path.basename(path))[0] + '_' + _hash(path)

        def make(p=path):
            a = read_image(p)[..., :3]
            if not p.lower().endswith(('.exr', '.hdr')):
                a = _srgb_to_lin(a)
            a = _downsize(a, 8192)
            return a, 1.0 / max(float(np.percentile(a, 99.95)), 1e-6)
        sky.add_rect_layer(name or 'photo', img, f, r, u, hfov_deg, vfov_deg, gain=gain,
                           gamma=gamma, feather=feather, blend=blend,
                           web=dict(key=key, make=make))

    # ---------------------------------------------------------------- moon
    @staticmethod
    def moon(az=14.0, el=31.0, size_deg=3.5, phase=0.2, lit_angle_deg=-35.0, gain=12.0,
             earthshine=0.008, earthshine_color=(0.55, 0.7, 1.0), relief=1.6, halo=0.25,
             halo_size=1.4, roll_deg=0.0, res=1024, light=0.0, light_color=(0.45, 0.6, 1.0)):
        """A real moon from the LRO/LROC colour map (+ LOLA relief) rendered as a phase-lit
        disc and placed on the sky dome. The lit limb is meant to clip and bloom (gain 10-15
        after the default galactic grade); the earthshine side stays at about 1-2 percent of it.
        phase = illuminated fraction (0 new .. 1 full);
        lit_angle_deg = direction of the bright limb in the image (0 right, 90 up, -90 down).
        size_deg is the angular diameter (the real moon is 0.5). earthshine lights the dark
        side faintly. halo adds a soft scattering glow around the disc. light > 0 also adds a
        sun lamp from the moon direction with that strength (W/m^2) to light the scene."""
        params = (res, phase, lit_angle_deg, earthshine, tuple(earthshine_color), relief,
                  halo, halo_size)
        arr = _moon_array(*params)
        key = 'moon_' + _hash(*params)
        img = np_image('pk_' + key, arr)
        f, r, u = sky.rect_frame(az, el, roll_deg)
        fov = size_deg * (1.0 + halo_size)
        k = 1.0 / max(float(arr[..., :3].max()), 1e-6)
        sky.add_rect_layer('moon', img, f, r, u, fov, fov, gain=gain, feather=0.0, blend='over',
                           web=dict(key=key, make=lambda a=arr, kk=k: (a[..., :3], kk)))
        # web only: uv radius of the disc's alpha edge (_moon_array: R = N / 2 / (1 + halo_size));
        # sky.json carries it while the layer stays blend 'over' (the render ignores it)
        _SKY.layers[-1]['disc'] = 0.5 / (1.0 + halo_size)
        if light > 0:
            ld = bpy.data.lights.new('MoonLight', 'SUN')
            ld.energy = light
            ld.color = light_color
            ld.angle = math.radians(0.6)
            ob = bpy.data.objects.new('MoonLight', ld)
            ob.rotation_euler = (-f).to_track_quat('-Z', 'Y').to_euler()
            _link(ob)
        return f

    # ---------------------------------------------------------------- build world
    @staticmethod
    def build():
        sc = bpy.context.scene
        w = _SKY.world
        if w is None or w.name not in bpy.data.worlds:
            w = bpy.data.worlds.new('PK_Sky')
            _SKY.world = w
        sc.world = w
        w.sun_threshold = 1e6       # never auto-extract a sun from the sky (moon, core)
        w.use_sun_shadow = False
        nt = w.node_tree
        nt.nodes.clear()
        D = vmath(nt, 'NORMALIZE', texcoord(nt, 'Generated'))
        acc = None
        wel = None
        for L in _SKY.layers:
            if L['type'] == 'equirect':
                M = L['matrix']
                rows = [vmath(nt, 'DOT_PRODUCT', D, tuple(M[i])) for i in range(3)]
                look = comb_xyz(nt, *rows)
                env = node(nt, 'ShaderNodeTexEnvironment', interpolation=L['interp'])
                env.image = L['image']
                _set(nt, env.inputs['Vector'], look)
                c = env.outputs['Color']
                if abs(L['gamma'] - 1.0) > 1e-6:
                    c = node(nt, 'ShaderNodeGamma', {'Color': c, 'Gamma': L['gamma']}).outputs[0]
                c = vmath(nt, 'MULTIPLY', c, L['gain'])
                if L['el_mask'] is not None:
                    e0, ef = L['el_mask']
                    el = math_(nt, 'DEGREES', math_(nt, 'ARCSINE', sep_xyz(nt, look)[2]))
                    m = maprange(nt, el, e0, e0 + max(ef, 1e-3), interp='SMOOTHSTEP')
                    c = vmath(nt, 'SCALE', c, scale=m)
                if L.get('fade') is not None:
                    fl, fh = L['fade']
                    if wel is None:
                        wel = math_(nt, 'DEGREES', math_(nt, 'ARCSINE', sep_xyz(nt, D)[2]))
                    m = maprange(nt, wel, 0.0, max(fh, 1e-3), fl, 1.0, interp='SMOOTHSTEP')
                    c = vmath(nt, 'SCALE', c, scale=m)
                acc = c if acc is None else vmath(nt, 'ADD', acc, c)
            else:
                acc = sky._rect_nodes(nt, D, L, acc)
        if acc is None:
            acc = node(nt, 'ShaderNodeRGB').outputs[0]
            acc.node.outputs[0].default_value = (0, 0, 0, 1)
        g = _SKY.grade
        c = vmath(nt, 'SCALE', acc, scale=2.0 ** g['exposure'])
        if abs(g['contrast'] - 1.0) > 1e-6:
            c = vmath(nt, 'MAXIMUM', vmath(nt, 'SCALE', c, scale=1 / 0.18), (0, 0, 0))
            c = node(nt, 'ShaderNodeGamma', {'Color': c, 'Gamma': g['contrast']}).outputs[0]
            c = vmath(nt, 'SCALE', c, scale=0.18)
        if abs(g['saturation'] - 1.0) > 1e-6:
            lum = vmath(nt, 'DOT_PRODUCT', c, LUMA)
            grey = comb_xyz(nt, lum, lum, lum)
            c = vmath(nt, 'ADD', vmath(nt, 'SCALE', vmath(nt, 'SUBTRACT', c, grey),
                                       scale=g['saturation']), grey)
            c = vmath(nt, 'MAXIMUM', c, (0, 0, 0))
        c = vmath(nt, 'MULTIPLY', c, g['tint'])
        hg = _SKY.horizon_glow
        if hg['strength'] > 0:
            el = math_(nt, 'DEGREES', math_(nt, 'ARCSINE', sep_xyz(nt, D)[2]))
            t = math_(nt, 'SUBTRACT', 1.0, math_(nt, 'DIVIDE', el, hg['height_deg']), clamp=True)
            f = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', t, t), hg['strength'])
            c = vmath(nt, 'ADD', c, vmath(nt, 'SCALE', hg['color'], scale=f))
        cam_col = c
        lt = tuple(_SKY.light_gain * x for x in _SKY.light_tint)
        light_col = vmath(nt, 'ADD', vmath(nt, 'MULTIPLY', cam_col, lt), _SKY.ambient)
        lp = node(nt, 'ShaderNodeLightPath')
        out_c = mix_col(nt, lp.outputs['Is Camera Ray'], light_col, cam_col)
        bg = node(nt, 'ShaderNodeBackground', {'Color': out_c, 'Strength': 1.0})
        wo = node(nt, 'ShaderNodeOutputWorld')
        nt.links.new(bg.outputs[0], wo.inputs['Surface'])

    @staticmethod
    def _rect_nodes(nt, D, L, acc):
        f, r, u = L['forward'], L['right'], L['up']
        df = vmath(nt, 'DOT_PRODUCT', D, tuple(f))
        dr = vmath(nt, 'DOT_PRODUCT', D, tuple(r))
        du = vmath(nt, 'DOT_PRODUCT', D, tuple(u))
        dfs = math_(nt, 'MAXIMUM', df, 1e-4)
        th = math.tan(math.radians(L['hfov']) / 2)
        tv = math.tan(math.radians(L['vfov']) / 2)
        uu = math_(nt, 'ADD', math_(nt, 'MULTIPLY', math_(nt, 'DIVIDE', dr, dfs), 0.5 / th), 0.5)
        vv = math_(nt, 'ADD', math_(nt, 'MULTIPLY', math_(nt, 'DIVIDE', du, dfs), 0.5 / tv), 0.5)
        tex = node(nt, 'ShaderNodeTexImage', extension='CLIP', interpolation='Linear')
        tex.image = L['image']
        _set(nt, tex.inputs['Vector'], comb_xyz(nt, uu, vv, 0.0))
        front = math_(nt, 'GREATER_THAN', df, 0.0)
        fe = L['feather']
        if fe > 0:
            wu = math_(nt, 'MULTIPLY', maprange(nt, uu, 0.0, fe, interp='SMOOTHSTEP'),
                       maprange(nt, math_(nt, 'SUBTRACT', 1.0, uu), 0.0, fe, interp='SMOOTHSTEP'))
            wv = math_(nt, 'MULTIPLY', maprange(nt, vv, 0.0, fe, interp='SMOOTHSTEP'),
                       maprange(nt, math_(nt, 'SUBTRACT', 1.0, vv), 0.0, fe, interp='SMOOTHSTEP'))
            mask = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', wu, wv), front)
        else:
            inside = math_(nt, 'MULTIPLY',
                           math_(nt, 'MULTIPLY', math_(nt, 'GREATER_THAN', uu, 0.0),
                                 math_(nt, 'LESS_THAN', uu, 1.0)),
                           math_(nt, 'MULTIPLY', math_(nt, 'GREATER_THAN', vv, 0.0),
                                 math_(nt, 'LESS_THAN', vv, 1.0)))
            mask = math_(nt, 'MULTIPLY', inside, front)
        c = tex.outputs['Color']
        if abs(L['gamma'] - 1.0) > 1e-6:
            c = node(nt, 'ShaderNodeGamma', {'Color': c, 'Gamma': L['gamma']}).outputs[0]
        c = vmath(nt, 'SCALE', vmath(nt, 'MULTIPLY', c, L['gain']), scale=mask)
        if acc is None:
            return c
        b = L['blend']
        if b == 'add':
            return vmath(nt, 'ADD', acc, c)
        if b == 'lighten':
            return vmath(nt, 'MAXIMUM', acc, c)
        if b == 'screen':
            return mix_col(nt, 1.0, acc, c, blend='SCREEN')
        if b in ('over', 'replace'):
            a = tex.outputs['Alpha'] if b == 'over' else 1.0
            keep = math_(nt, 'SUBTRACT', 1.0, math_(nt, 'MULTIPLY', a, mask), clamp=True)
            return vmath(nt, 'ADD', vmath(nt, 'SCALE', acc, scale=keep), c)
        raise ValueError('unknown blend ' + b)

    # ---------------------------------------------------------------- export
    @staticmethod
    def export_json(path):
        """Write sky.json (contract shared with the three.js viewer) + web JPGs."""
        os.makedirs(WEB_ASSETS, exist_ok=True)
        base = os.path.dirname(os.path.abspath(path))
        layers = []
        for L in _SKY.layers:
            web = L.get('web')
            if not web:
                continue
            jpg = os.path.join(WEB_ASSETS, web['key'] + '.jpg')
            meta = jpg + '.json'
            k = None
            if os.path.exists(jpg) and os.path.exists(meta):
                with open(meta) as fh:
                    k = json.load(fh)['k']
            else:
                arr, k = web['make']()
                write_jpg(jpg, arr, k=k, already_srgb=(k == 'srgb'))
                with open(meta, 'w') as fh:
                    json.dump({'k': k}, fh)
            kk = 1.0 if k == 'srgb' else k
            gain = [g / (kk ** L['gamma']) for g in L['gain']]
            rel = os.path.relpath(jpg, base)
            if L['type'] == 'equirect':
                Mj = RZ180 @ L['matrix']
                d = {'type': 'equirect', 'name': L['name'], 'image': rel,
                     'matrix': [round(Mj[i][j], 7) for i in range(3) for j in range(3)],
                     'gain': [round(x, 6) for x in gain], 'gamma': L['gamma'], 'add': True}
                if L.get('fade') is not None:
                    # optional extension (viewers may ignore it): atmospheric extinction
                    d['horizon_fade'] = {'floor': round(L['fade'][0], 5),
                                         'height_deg': round(L['fade'][1], 4)}
                layers.append(d)
            else:
                d = {'type': 'rect', 'name': L['name'], 'image': rel,
                     'forward': [round(x, 7) for x in L['forward']],
                     'right': [round(x, 7) for x in L['right']],
                     'up': [round(x, 7) for x in L['up']],
                     'hfov_deg': round(L['hfov'], 5), 'vfov_deg': round(L['vfov'], 5),
                     'gain': [round(x, 6) for x in gain], 'gamma': L['gamma'],
                     'feather': L['feather']}
                # blend modes the contract can carry: 'replace' composites over the layers
                # before it with the feather mask ("add": false); 'over' with a known disc
                # (the moon) hides them inside the disc ("disc"). Other blends stay additive.
                b = L.get('blend', 'add')
                if b == 'replace':
                    d['add'] = False
                elif b == 'over' and L.get('disc'):
                    d['disc'] = round(float(L['disc']), 6)
                layers.append(d)
        g = _SKY.grade
        hg = _SKY.horizon_glow
        data = {'layers': layers,
                'grade': {'exposure': g['exposure'], 'contrast': g['contrast'],
                          'saturation': g['saturation'], 'tint': list(g['tint'])},
                'horizon_glow': {'color': list(hg['color']), 'strength': hg['strength'],
                                 'height_deg': hg['height_deg']}}
        with open(path, 'w') as fh:
            json.dump(data, fh, indent=2)
        return data


def _atomic_write_png(path, writer):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = '%s.tmp%d.png' % (path[:-4], os.getpid())
    writer(tmp)
    os.replace(tmp, path)
    return path


def _cached_png(key, make_lin, bits=8):
    """sRGB PNG (8 or 16 bit) of a linear array, cached in CACHE_DIR by key."""
    path = os.path.join(CACHE_DIR, key + '.png')
    if os.path.exists(path):
        return path
    oiio = _oiio()

    def writer(tmp):
        a = make_lin()
        mx = 65535.0 if bits == 16 else 255.0
        dt = np.uint16 if bits == 16 else np.uint8
        q = np.ascontiguousarray((_lin_to_srgb(a[..., :3]) * mx + 0.5).astype(dt))
        del a
        H, W = q.shape[:2]
        out = oiio.ImageOutput.create(tmp)
        out.open(tmp, oiio.ImageSpec(W, H, 3, 'uint16' if bits == 16 else 'uint8'))
        out.write_image(q)
        out.close()
    t0 = time.time()
    _atomic_write_png(path, writer)
    log('cached %s (%.1f s)' % (path, time.time() - t0))
    return path


def _stars_png():
    """The 16k NASA star plate as an 8-bit sRGB PNG (converted in row chunks to keep memory low)."""
    path = os.path.join(CACHE_DIR, 'hiptyc_2020_16k_srgb.png')
    if os.path.exists(path):
        return path
    oiio = _oiio()

    def writer(tmp):
        inp = oiio.ImageInput.open(PLATE_STARS)
        spec = inp.spec()
        W, H = spec.width, spec.height
        out = oiio.ImageOutput.create(tmp)
        out.open(tmp, oiio.ImageSpec(W, H, 3, 'uint8'))
        step = 512
        for y in range(0, H, step):
            y1 = min(H, y + step)
            a = np.asarray(inp.read_scanlines(0, 0, y, y1, 0, 0, 3, oiio.FLOAT)).reshape(y1 - y, W, 3)
            u8 = np.ascontiguousarray((_lin_to_srgb(a) * 255.0 + 0.5).astype(np.uint8))
            out.write_scanlines(y, y1, 0, u8)
        out.close()
        inp.close()
    t0 = time.time()
    _atomic_write_png(path, writer)
    log('cached %s (%.1f s)' % (path, time.time() - t0))
    return path


def _downsize(a, max_w):
    H, W = a.shape[:2]
    f = int(math.ceil(W / max_w))
    if f <= 1:
        return a
    H2, W2 = H // f, W // f
    return a[:H2 * f, :W2 * f].reshape(H2, f, W2, f, -1).mean(axis=(1, 3))


_ESO_CACHE = {}


def _box1d(a, r, axis):
    if r <= 0:
        return a
    c = np.cumsum(a, axis=axis, dtype=np.float32)
    n = a.shape[axis]
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.pad(c, pad, mode='edge')
    sl_hi = [slice(None)] * a.ndim
    sl_lo = [slice(None)] * a.ndim
    sl_hi[axis] = slice(2 * r + 1, 2 * r + 1 + n)
    sl_lo[axis] = slice(0, n)
    out = (c[tuple(sl_hi)] - c[tuple(sl_lo)]) / (2 * r + 1)
    return out


def _box(a, r):
    return _box1d(_box1d(a, r, 0), r, 1)


def _minmax_filter(x, r, fn):
    """Separable square min (fn=np.minimum) or max (np.maximum) filter of radius r px on
    (H, W[, C]); the horizontal pass wraps (equirect plates)."""
    for axis in (0, 1):
        src = x
        out = src.copy()
        n = src.shape[axis]
        for k in range(1, r + 1):
            if axis == 1:
                fn(out, np.roll(src, k, axis=1), out=out)
                fn(out, np.roll(src, -k, axis=1), out=out)
                continue
            sa = [slice(None)] * src.ndim
            sb = [slice(None)] * src.ndim
            sa[axis] = slice(k, n)
            sb[axis] = slice(0, n - k)
            fn(out[tuple(sa)], src[tuple(sb)], out=out[tuple(sa)])
            fn(out[tuple(sb)], src[tuple(sa)], out=out[tuple(sb)])
        x = out
    return x


def _gauss(a, r):
    """Gaussian-like blur (three box passes of radius r px)."""
    for _ in range(3):
        a = _box(a, r)
    return a


def starless(a, star_radius=2, peak_ratio=2.0, smooth=3):
    """Remove point stars from a linear (H, W, 3) sky photo and keep its glow and dust lanes:
    grey morphological opening (min then max filter, radius star_radius px) removes every
    bright feature smaller than the window while dark lanes keep their shape; compact bright
    residuals (planets, the brightest stars and their halos: luminance above peak_ratio x the
    local mean) are in-painted from their surroundings; a Gaussian-like blur of radius smooth
    px hides the square window. Returns float32 (H, W, 3)."""
    o = _minmax_filter(_minmax_filter(a, star_radius, np.minimum), star_radius, np.maximum)
    if peak_ratio and peak_ratio > 0:
        L = (o * np.array(LUMA, np.float32)).sum(-1)
        Lb = _box(_box(L, 10), 10)
        m0 = (L > peak_ratio * np.maximum(Lb, 1e-5)).astype(np.float32)
        if m0.any():
            m0 = _box(_minmax_filter(m0, 8, np.maximum), 3)
            w = (1.0 - m0)[..., None]
            fill = _box(_box(o * w, 12), 12) / np.maximum(_box(_box(w, 12), 12), 1e-3)
            o = o * w + fill * (1.0 - w)
    if smooth > 0:
        o = _gauss(o, smooth)
    return np.maximum(o, 0.0).astype(np.float32)


def eso_plate(star_radius=2, peak_ratio=2.0, smooth=3, dust_contrast=0.0):
    """The ESO/S. Brunier all-sky plate in linear light made starless (see starless()), so it
    carries only the Milky Way glow, the dust lanes and nebulae; every point star then comes
    from the crisp NASA 16k layer. dust_contrast > 0 adds large-radius local contrast
    (0.1..0.3) to deepen the lanes. Returns (H, W, 3), top row first, in the ESO frame."""
    key = ('eso', star_radius, round(peak_ratio, 3), smooth, round(dust_contrast, 3))
    if key in _ESO_CACHE:
        return _ESO_CACHE[key]
    a = _srgb_to_lin(read_image(PLATE_ESO)[..., :3])
    if star_radius > 0:
        a = starless(a, star_radius, peak_ratio, smooth)
    if dust_contrast > 0:
        lo = _box(_box(a, 8), 8)
        a = np.maximum(lo + (a - lo) * (1.0 + dust_contrast), 0.0).astype(np.float32)
    _ESO_CACHE.clear()
    _ESO_CACHE[key] = a
    return a


def milkyway_plate(detail=0.8, detail_radius=6, star_radius=2, smooth=3, dust_contrast=0.0):
    """The 'photo' Milky Way plate (8192 x 4096, exact galactic frame, linear, top row first):
    colour, glow and nebulae of the starless ESO/S. Brunier photo, resampled into galactic
    coordinates with the measured ESO correction, multiplied by the fine structure of the
    NASA SVS Gaia map (its luminance over a blur of radius detail_radius px, clipped, to the
    power `detail`). That restores sharp dust-lane edges and the dense grain of unresolved
    faint stars the ESO plate is too soft to carry, without its soft star blobs."""
    E = eso_plate(star_radius, 2.0, smooth, dust_contrast)
    N = read_image(PLATE_MILKYWAY)
    H, W = N.shape[:2]
    Nl = (N[..., :3] * np.array(LUMA, np.float32)).sum(-1).astype(np.float32)
    del N
    D = None
    if detail > 0:
        Lb = _box(_box(Nl, detail_radius), detail_radius)
        D = np.clip(Nl / np.maximum(Lb, 1e-6), 0.2, 3.0) ** detail
        del Lb
    del Nl
    Cm = np.array(sky.eso_correction(), np.float32)
    out = np.empty((H, W, 3), np.float32)
    u = (np.arange(W, dtype=np.float32) + 0.5) / W
    phi = (0.5 - u) * 2 * np.pi
    step = 256
    for y0 in range(0, H, step):
        y1 = min(H, y0 + step)
        v = 1.0 - (np.arange(y0, y1, dtype=np.float32) + 0.5) / H
        th = (v - 0.5) * np.pi
        d = np.stack([np.cos(th)[:, None] * np.cos(phi)[None, :],
                      np.cos(th)[:, None] * np.sin(phi)[None, :],
                      np.repeat(np.sin(th)[:, None], W, 1)], -1)
        e = d @ Cm.T
        ue = 0.5 - np.arctan2(e[..., 1], e[..., 0]) / (2 * np.pi)
        ve = np.arctan2(e[..., 2], np.hypot(e[..., 0], e[..., 1])) / np.pi + 0.5
        c = _bilinear(E, ue, ve)
        if D is not None:
            c = c * D[y0:y1, :, None]
        out[y0:y1] = c
    return out


def _web_milkyway():
    a = read_image(PLATE_MILKYWAY)[..., :3]
    return a, 1.0 / max(float(np.percentile(a, 99.98)), 1e-6)


def _web_stars():
    a = read_image(PLATE_STARS)[..., :3]
    H, W = a.shape[:2]
    # energy-preserving 2x2 mean, then scale so faint stars survive 8-bit sRGB (gain undoes it)
    a = a.reshape(H // 2, 2, W // 2, 2, 3).mean(axis=(1, 3))
    return a, 1.0 / max(float(np.percentile(a[::4, ::4], 99.995)), 1e-4)


def _atmosphere_array(airglow, airglow_color, airglow_red, background, skyglow, skyglow_color,
                      dawn, dawn_az, dawn_color, dawn_height_deg, dawn_spread_deg, seed, res):
    W, H = res, res // 2
    u = (np.arange(W) + 0.5) / W
    v = 1.0 - (np.arange(H) + 0.5) / H
    phi = (0.5 - u) * 2 * np.pi                       # atan2(y, x) in Blender convention
    el = (v - 0.5) * 180.0                             # degrees
    x = np.cos(phi)[None, :]
    y = np.sin(phi)[None, :]
    az = np.degrees(np.arctan2(x, y))                  # from +Y toward +X
    E = el[:, None]
    rng = np.random.RandomState(seed)
    out = np.zeros((H, W, 3), np.float32) + np.array(background, np.float32)
    Ep = np.maximum(E, 0.0)
    if skyglow > 0:
        f = np.exp(-Ep / 14.0) * 0.8 + np.exp(-Ep / 45.0) * 0.2
        out += skyglow * 0.04 * f[..., None] * np.array(skyglow_color, np.float32)
    if airglow > 0:
        waves = np.ones_like(E * az)
        for i in range(5):
            k = rng.uniform(2, 9)
            kv = rng.uniform(0.05, 0.25)
            ph = rng.uniform(0, 2 * np.pi)
            waves = waves + rng.uniform(0.08, 0.2) * np.sin(np.radians(az) * k + E * kv + ph)
        waves = np.clip(waves, 0.3, None)
        green = np.exp(-((E - 9.0) / 7.0) ** 2) + 0.35 * np.exp(-((E - 3.0) / 3.0) ** 2)
        red = np.exp(-((E - 22.0) / 10.0) ** 2)
        g = (airglow * 0.03 * green * waves)[..., None] * np.array(airglow_color, np.float32)
        r = (airglow * airglow_red * 0.02 * red * (2.0 - waves * 0.8))[..., None] * \
            np.array((1.0, 0.22, 0.18), np.float32)
        out += g + r
    if dawn > 0:
        daz = np.radians(((az - dawn_az) + 180.0) % 360.0 - 180.0)
        lobe = np.exp(-(daz / np.radians(dawn_spread_deg)) ** 2) * 0.85 + 0.15
        h = np.exp(-Ep / dawn_height_deg)
        h2 = np.exp(-Ep / (dawn_height_deg * 3.0))
        warm = np.array(dawn_color, np.float32)
        cool = np.array((0.25, 0.45, 1.0), np.float32)
        col = (h[..., None] * warm + 0.35 * (h2 - h).clip(0)[..., None] * cool)
        out += dawn * 0.05 * (lobe[..., None] * col)
    below = E < -2.0
    out = np.where(below[..., None], out * np.exp((E + 2.0) / 6.0)[..., None], out)
    return out.astype(np.float32)


_MOON_CACHE = {}


def _moon_maps():
    if 'color' not in _MOON_CACHE:
        c = read_image(MOON_COLOR)[..., :3]
        _MOON_CACHE['color'] = _srgb_to_lin(c)
        d = read_image(MOON_DEM)[..., 0] * 65535.0
        _MOON_CACHE['dem'] = d.astype(np.float32)
    return _MOON_CACHE['color'], _MOON_CACHE['dem']


def _bilinear(img, u, v):
    """Sample img (H, W[, C]) at u (wraps) and v (clamped), v = 0 at the bottom row."""
    H, W = img.shape[:2]
    x = u * W - 0.5
    y = (1.0 - v) * H - 0.5
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = (x - x0).astype(np.float32)
    fy = (y - y0).astype(np.float32)
    x0 %= W
    x1 = (x0 + 1) % W
    y1 = np.clip(y0 + 1, 0, H - 1)
    y0 = np.clip(y0, 0, H - 1)
    if img.ndim == 3:
        fx = fx[..., None]
        fy = fy[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x1] * fx * (1 - fy) +
            img[y1, x0] * (1 - fx) * fy + img[y1, x1] * fx * fy)


def _moon_array(res, phase, lit_angle_deg, earthshine, earthshine_color, relief, halo, halo_size):
    color, dem = _moon_maps()
    ss = 2
    N = res * ss
    R = N / 2.0 / (1.0 + halo_size)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    x = (xx + 0.5 - N / 2.0) / R
    y = (N / 2.0 - (yy + 0.5)) / R
    r2 = x * x + y * y
    nz = np.sqrt(np.clip(1.0 - r2, 0.0, 1.0))
    lon = np.arctan2(x, nz)
    lat = np.arcsin(np.clip(y, -1, 1))
    u = lon / (2 * np.pi) + 0.5
    v = lat / np.pi + 0.5
    alb = _bilinear(color, u, v)
    # relief: slope from the LOLA DEM (units 0.5 m), finite differences in lon/lat
    Hd, Wd = dem.shape
    dl = 2 * np.pi / Wd
    hE = _bilinear(dem, u + dl / (2 * np.pi), v)
    hW = _bilinear(dem, u - dl / (2 * np.pi), v)
    hN = _bilinear(dem, u, v + dl / np.pi)
    hS = _bilinear(dem, u, v - dl / np.pi)
    moon_r = 1737400.0
    step = moon_r * dl
    coslat = np.maximum(np.cos(lat), 0.05)
    sx = (hE - hW) * 0.5 / (2 * step * coslat) * relief
    sy = (hN - hS) * 0.5 / (2 * step) * relief
    e_lon = np.stack([np.cos(lon), np.zeros_like(lon), -np.sin(lon)], -1)
    e_lat = np.stack([-np.sin(lat) * np.sin(lon), np.cos(lat), -np.sin(lat) * np.cos(lon)], -1)
    n = np.stack([x, y, nz], -1)
    n = n - sx[..., None] * e_lon - sy[..., None] * e_lat
    n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-9
    alpha_ph = math.acos(max(-1.0, min(1.0, 2.0 * phase - 1.0)))
    th = math.radians(lit_angle_deg)
    s = np.array([math.sin(alpha_ph) * math.cos(th), math.sin(alpha_ph) * math.sin(th),
                  math.cos(alpha_ph)], np.float32)
    mu0 = np.clip((n * s).sum(-1), 0.0, None)
    mu = np.clip(nz, 1e-3, None)
    ls = 2.0 * mu0 / (mu0 + mu + 1e-6)
    lum = alb * ls[..., None] + alb * earthshine * np.array(earthshine_color, np.float32)
    # analytic anti-aliased edge (at supersampled resolution)
    rr = np.sqrt(r2)
    a = np.clip((1.0 - rr) * R + 0.5, 0.0, 1.0)
    rgb = lum * a[..., None]
    if halo > 0:
        lit_frac = phase
        hcol = np.array((0.75, 0.82, 1.0), np.float32)
        hf = np.exp(-np.maximum(rr - 1.0, 0) * 3.2) * 0.6 + np.exp(-np.maximum(rr - 1.0, 0) * 9.0)
        hf = np.where(rr > 1.0, hf, 1.0) * halo * 0.06 * (0.3 + lit_frac)
        hf = hf * np.clip((1.0 + halo_size - rr) / (0.25 * halo_size + 1e-6), 0, 1)   # fade at edge
        rgb = rgb + (hf * (1.0 - a))[..., None] * hcol
    out = np.concatenate([rgb, a[..., None]], -1).astype(np.float32)
    out = out.reshape(res, ss, res, ss, 4).mean(axis=(1, 3))
    return out


# ----------------------------------------------------------------------------
# Compositor
# ----------------------------------------------------------------------------

class comp:
    """Post: bloom (sky-aware), wet-road streaks, star glints, lens distortion + dispersion,
    optional depth-masked sharpen, vignette, film grain."""

    @staticmethod
    def _glare(ng, image, typ, threshold, strength, size=0.5, smooth=0.3, quality='High',
               saturation=1.0, streaks=4, angle=0.0, fade=0.9, iterations=3):
        g = node(ng, 'CompositorNodeGlare')
        _set(ng, g.inputs['Image'], image)
        g.inputs['Type'].default_value = typ
        g.inputs['Quality'].default_value = quality
        g.inputs['Threshold'].default_value = threshold
        g.inputs['Smoothness'].default_value = smooth
        g.inputs['Strength'].default_value = strength
        g.inputs['Size'].default_value = size
        g.inputs['Saturation'].default_value = saturation
        if typ == 'Streaks':
            g.inputs['Streaks'].default_value = streaks
            g.inputs['Streaks Angle'].default_value = math.radians(angle)
            g.inputs['Fade'].default_value = fade
            g.inputs['Iterations'].default_value = iterations
        return g.outputs['Glare']

    @staticmethod
    def _vblur(ng, image, px, typ='Gaussian'):
        b = node(ng, 'CompositorNodeBlur')
        _set(ng, b.inputs['Image'], image)
        b.inputs['Type'].default_value = typ
        b.inputs['Size'].default_value = (0.0, float(px))
        _STATE['px_inputs'].append((b.inputs['Size'], (0.0, float(px))))
        return b.outputs['Image']

    @staticmethod
    def setup(bloom=1.2, bloom_threshold=0.9, bloom_size=0.5, bloom_smooth=0.3,
              bloom_saturation=1.15, glow=0.15, glow_size=0.55, glow_threshold=6.0,
              distortion=-0.012, dispersion=0.006, sharpen=0.0, sharpen_depth=800.0,
              vignette=0.32, vignette_radius=0.62, grain=0.022, grain_size=1.0,
              saturation=1.15, sky_bloom=0.08, sky_bloom_floor=1.5,
              road_streak=1.0, road_streak_px=64, road_streak_threshold=0.6,
              road_streak_depth=200.0, star_glow=0.0, star_glow_threshold=0.35,
              star_glow_size=0.25, star_sparkle=0.0, star_sparkle_threshold=0.8,
              star_sparkle_fade=0.86):
        """Build the compositor (scene.compositing_node_group). All thresholds are scene-linear.

        - bloom: Glare 'Bloom' on everything; sky pixels (depth > 800 m) bloom only at
          sky_bloom strength unless brighter than sky_bloom_floor (so the moon blooms but the
          Milky Way does not veil the town). glow: an extra wide Fog Glow on very hot pixels.
        - road_streak: wet-road anamorphic streaks. Highlights (luminance above
          road_streak_threshold) on up-facing surfaces (Normal pass z > 0.8) nearer than
          road_streak_depth are blurred vertically by road_streak_px (at 100 percent
          resolution) and added back inside the same mask.
        - star_glow: a tight Fog Glow on the brightest stars only (sky mask). star_sparkle: a
          faint 4-point Streaks glint (45 deg) on stars above star_sparkle_threshold.
        - sharpen: Box Sharpen only where depth < sharpen_depth (never the sky); default off,
          since it rings around point lights and stars."""
        sc = bpy.context.scene
        old = sc.compositing_node_group
        ng = bpy.data.node_groups.new('PK_Comp', 'CompositorNodeTree')
        if old is not None:
            bpy.data.node_groups.remove(old)
        _STATE['px_inputs'] = []
        ng.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        vl = sc.view_layers[0]
        vl.use_pass_z = True
        if road_streak > 0:
            vl.use_pass_normal = True
        rl = node(ng, 'CompositorNodeRLayers')
        img = rl.outputs['Image']
        depth = rl.outputs['Depth']
        if abs(saturation - 1.0) > 1e-4:
            lum = vmath(ng, 'DOT_PRODUCT', img, LUMA)
            grey = comb_xyz(ng, lum, lum, lum)
            img = vmath(ng, 'ADD', vmath(ng, 'SCALE', vmath(ng, 'SUBTRACT', img, grey), scale=saturation), grey)
            img = vmath(ng, 'MAXIMUM', img, (0, 0, 0))
        base = img
        lum = vmath(ng, 'DOT_PRODUCT', base, LUMA)
        skym = maprange(ng, depth, 800.0, 1500.0, 0.0, 1.0)            # 1 = sky
        glare_sum = None

        def acc(x):
            nonlocal glare_sum
            glare_sum = x if glare_sum is None else vmath(ng, 'ADD', glare_sum, x)

        # bloom input: the sky blooms weakly except for very bright pixels (moon)
        bl_in = base
        if (bloom > 0 or glow > 0) and sky_bloom < 1.0:
            bright = maprange(ng, lum, sky_bloom_floor, sky_bloom_floor * 2.0, sky_bloom, 1.0,
                              interp='SMOOTHSTEP')
            k = mix_f(ng, skym, 1.0, bright)
            bl_in = vmath(ng, 'SCALE', base, scale=k)
        if bloom > 0:
            acc(comp._glare(ng, bl_in, 'Bloom', bloom_threshold, bloom, bloom_size, bloom_smooth,
                            saturation=bloom_saturation))
        if glow > 0:
            acc(comp._glare(ng, bl_in, 'Fog Glow', glow_threshold, glow, glow_size, 0.4,
                            quality='Medium'))
        if star_glow > 0 or star_sparkle > 0:
            sky_img = vmath(ng, 'SCALE', base, scale=skym)
            if star_glow > 0:
                acc(comp._glare(ng, sky_img, 'Fog Glow', star_glow_threshold, star_glow,
                                star_glow_size, 0.2, quality='High'))
            if star_sparkle > 0:
                acc(comp._glare(ng, sky_img, 'Streaks', star_sparkle_threshold, star_sparkle,
                                0.5, 0.1, quality='High', streaks=4, angle=45.0,
                                fade=star_sparkle_fade, iterations=3))
        if road_streak > 0:
            nz = sep_xyz(ng, rl.outputs['Normal'])[2]
            up = maprange(ng, nz, 0.78, 0.92, 0.0, 1.0, interp='SMOOTHSTEP')
            near = maprange(ng, depth, road_streak_depth * 0.6, road_streak_depth, 1.0, 0.0)
            notcar = maprange(ng, depth, 1.2, 2.0, 0.0, 1.0)
            road = math_(ng, 'MULTIPLY', math_(ng, 'MULTIPLY', up, near), notcar)
            hk = maprange(ng, lum, road_streak_threshold * 0.6, road_streak_threshold * 1.8,
                          0.0, 1.0, interp='SMOOTHSTEP')
            hl = vmath(ng, 'SCALE', base, scale=math_(ng, 'MULTIPLY', hk, road))
            s1 = comp._vblur(ng, hl, road_streak_px * 0.3)
            s2 = comp._vblur(ng, hl, road_streak_px)
            st = vmath(ng, 'ADD', vmath(ng, 'SCALE', s1, scale=0.45), vmath(ng, 'SCALE', s2, scale=0.75))
            acc(vmath(ng, 'SCALE', st, scale=math_(ng, 'MULTIPLY', road, road_streak)))
        if glare_sum is not None:
            img = vmath(ng, 'ADD', img, glare_sum)
        if distortion or dispersion:
            ld = node(ng, 'CompositorNodeLensdist')
            _set(ng, ld.inputs['Image'], img)
            ld.inputs['Type'].default_value = 'Radial'
            ld.inputs['Distortion'].default_value = distortion
            ld.inputs['Dispersion'].default_value = dispersion
            ld.inputs['Fit'].default_value = distortion < 0
            img = ld.outputs['Image']
        if sharpen > 0:
            f = node(ng, 'CompositorNodeFilter')
            _set(ng, f.inputs['Image'], img)
            f.inputs['Type'].default_value = 'Box Sharpen'
            f.inputs['Factor'].default_value = sharpen
            near = maprange(ng, depth, sharpen_depth * 0.8, sharpen_depth, 1.0, 0.0)
            img = mix_col(ng, near, img, f.outputs['Image'])
        ic = node(ng, 'CompositorNodeImageCoordinates')
        _set(ng, ic.inputs['Image'], rl.outputs['Image'])
        if vignette > 0:
            nrm = ic.outputs['Normalized']
            d = vmath(ng, 'SUBTRACT', nrm, (0.5, 0.5, 0.0))
            d = vmath(ng, 'MULTIPLY', d, (1.0, RES_Y / RES_X * 0.75, 0.0))
            r = vmath(ng, 'LENGTH', d)
            vf = maprange(ng, r, vignette_radius * 0.45, vignette_radius * 1.15,
                          1.0, 1.0 - vignette, interp='SMOOTHSTEP')
            img = vmath(ng, 'SCALE', img, scale=vf)
        if grain > 0:
            st = node(ng, 'CompositorNodeSceneTime')
            px = vmath(ng, 'SCALE', ic.outputs['Pixel'], scale=1.0 / grain_size)
            px = vmath(ng, 'FLOOR', px)
            wn = node(ng, 'ShaderNodeTexWhiteNoise', noise_dimensions='4D')
            _set(ng, wn.inputs['Vector'], px)
            _set(ng, wn.inputs['W'], st.outputs['Frame'])
            gcol = vmath(ng, 'SUBTRACT', wn.outputs['Color'], (0.5, 0.5, 0.5))
            gcol = vmath(ng, 'ADD', vmath(ng, 'SCALE', gcol, scale=0.35),
                         vmath(ng, 'SCALE', (1, 1, 1), scale=math_(ng, 'SUBTRACT', wn.outputs['Value'], 0.5)))
            lum2 = vmath(ng, 'DOT_PRODUCT', img, LUMA)
            amp = math_(ng, 'MULTIPLY', math_(ng, 'POWER', math_(ng, 'MAXIMUM', lum2, 0.0), 0.5),
                        grain)
            amp = math_(ng, 'ADD', amp, grain * 0.04)
            img = vmath(ng, 'ADD', img, vmath(ng, 'SCALE', gcol, scale=amp))
            img = vmath(ng, 'MAXIMUM', img, (0, 0, 0))
        out = node(ng, 'NodeGroupOutput')
        ng.links.new(img, out.inputs[0])
        sc.compositing_node_group = ng
        sc.render.use_compositing = True
        _STATE['comp_done'] = True
        return ng


def _apply_scale_to_px_inputs(scale):
    """Compositor sizes given in pixels (at 100 percent) follow --scale."""
    for sock, v in _STATE.get('px_inputs', []):
        try:
            sock.default_value = tuple(x * scale for x in v)
        except Exception:
            pass


# ----------------------------------------------------------------------------
# Path and camera
# ----------------------------------------------------------------------------

class Path:
    """Smooth path through control points (centripetal Catmull-Rom), arc-length sampled."""

    def __init__(self, points, step=0.05):
        P = [Vector((p[0], p[1], p[2] if len(p) > 2 else 0.0)) for p in points]
        if len(P) < 2:
            raise ValueError('need at least 2 points')
        if len(P) == 2:
            P = [P[0], P[0].lerp(P[1], 0.5), P[1]]
        ext = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
        pts = []
        for i in range(1, len(ext) - 2):
            p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
            seg = (p2 - p1).length
            n = max(2, int(seg / step))
            for j in range(n):
                pts.append(_catmull(p0, p1, p2, p3, j / n))
        pts.append(P[-1])
        a = np.array([tuple(p) for p in pts], np.float64)
        d = np.linalg.norm(np.diff(a, axis=0), axis=1)
        keep = np.concatenate([[True], d > 1e-9])
        a = a[keep]
        d = np.linalg.norm(np.diff(a, axis=0), axis=1)
        self.pts = a
        self.s = np.concatenate([[0.0], np.cumsum(d)])
        self.length = float(self.s[-1])
        self.control = P

    def at(self, s):
        """Point at arc length s (linear extrapolation beyond the ends)."""
        a, S = self.pts, self.s
        if s <= 0:
            t = a[1] - a[0]
            return Vector(a[0] + t / np.linalg.norm(t) * s)
        if s >= self.length:
            t = a[-1] - a[-2]
            return Vector(a[-1] + t / np.linalg.norm(t) * (s - self.length))
        i = int(np.searchsorted(S, s) - 1)
        i = max(0, min(i, len(S) - 2))
        f = (s - S[i]) / max(S[i + 1] - S[i], 1e-12)
        return Vector(a[i] * (1 - f) + a[i + 1] * f)

    def tangent(self, s, h=0.5):
        t = self.at(s + h) - self.at(s - h)
        t.z = 0.0
        return t.normalized()

    def right(self, s):
        """Unit vector to the right of travel (in the ground plane)."""
        t = self.tangent(s)
        return Vector((t.y, -t.x, 0.0))

    def offset(self, s, lateral=0.0, z=0.0):
        """Point at arc length s, moved `lateral` meters to the right (negative = left)."""
        p = self.at(s) + self.right(s) * lateral
        p.z += z
        return p

    def heading(self, s):
        """Azimuth of travel at s in degrees (from +Y toward +X)."""
        t = self.tangent(s)
        return math.degrees(math.atan2(t.x, t.y))

    def curvature(self, s, h=1.0):
        a = math.radians(self.heading(s + h)) - math.radians(self.heading(s - h))
        a = (a + math.pi) % (2 * math.pi) - math.pi
        return a / (2 * h)

    def frame(self, s):
        """Matrix (4x4) at s: X right, Y forward, Z up."""
        t = self.tangent(s)
        r = Vector((t.y, -t.x, 0.0))
        m = Matrix((r, t, Vector((0, 0, 1)))).transposed().to_4x4()
        m.translation = self.at(s)
        return m

    def samples(self, spacing, s0=0.0, s1=None):
        s1 = self.length if s1 is None else s1
        n = max(1, int((s1 - s0) / spacing))
        return [s0 + i * (s1 - s0) / n for i in range(n + 1)]


def _catmull(p0, p1, p2, p3, t, alpha=0.5):
    def tj(ti, pi, pj):
        return ti + max((pj - pi).length, 1e-6) ** alpha
    t0 = 0.0
    t1 = tj(t0, p0, p1)
    t2 = tj(t1, p1, p2)
    t3 = tj(t2, p2, p3)
    tt = t1 + (t2 - t1) * t
    a1 = p0 * ((t1 - tt) / (t1 - t0)) + p1 * ((tt - t0) / (t1 - t0))
    a2 = p1 * ((t2 - tt) / (t2 - t1)) + p2 * ((tt - t1) / (t2 - t1))
    a3 = p2 * ((t3 - tt) / (t3 - t2)) + p3 * ((tt - t2) / (t3 - t2))
    b1 = a1 * ((t2 - tt) / (t2 - t0)) + a2 * ((tt - t0) / (t2 - t0))
    b2 = a2 * ((t3 - tt) / (t3 - t1)) + a3 * ((tt - t1) / (t3 - t1))
    return b1 * ((t2 - tt) / (t2 - t1)) + b2 * ((tt - t1) / (t2 - t1))


def _curve_points(obj, step=0.25):
    """Polyline points from a Blender curve object (first spline)."""
    from mathutils.geometry import interpolate_bezier
    sp = obj.data.splines[0]
    mw = obj.matrix_world
    if sp.type == 'BEZIER':
        bp = sp.bezier_points
        out = []
        for i in range(len(bp) - 1):
            a, b = bp[i], bp[i + 1]
            seg = (b.co - a.co).length
            n = max(2, int(seg / step))
            out += interpolate_bezier(a.co, a.handle_right, b.handle_left, b.co, n + 1)[:-1]
        out.append(bp[-1].co)
        return [tuple(mw @ p) for p in out]
    return [tuple(mw @ Vector(p.co[:3])) for p in sp.points]


class camera:
    """First-person camera rig."""

    @staticmethod
    def drive(points=None, curve=None, speed_mps=5.5, height=1.25, fov_v_deg=60.0,
              look_ahead=9.0, sway=0.06, vibration=0.0018, pitch_deg=5.0, lean=1.0,
              max_roll_deg=2.0, shake_deg=0.0, lateral=0.0, start_s=0.0, slow_after_s=10.0,
              end_speed_factor=0.35, slow_ease_s=2.5, seed=7, name='POVCam', clip_end=4000.0):
        """Constant-speed travel along a smooth curve through `points` (or a curve object),
        with gentle look-ahead steering, a roll into curves (lean scales it; up to
        max_roll_deg), slow lateral sway (m) and very subtle road vibration (m, vertical).
        No shake by default; shake_deg > 0 adds a rotational micro-jitter of that amplitude
        at 2-4 Hz (keep it under 0.15 to respect the brief). After slow_after_s the speed
        eases to end_speed_factor. Keyframes every frame (linear), frames 0..end+1.
        Sets ctx.camera, ctx.path and ctx.s_of_t; returns the camera object."""
        c = ctx()
        if curve is not None:
            points = _curve_points(curve)
        path = Path(points)
        cd = bpy.data.cameras.new(name)
        cd.sensor_fit = 'VERTICAL'
        cd.sensor_height = 24.0
        cd.sensor_width = 24.0 * RES_X / RES_Y
        cd.lens_unit = 'FOV'
        cd.lens = 12.0 / math.tan(math.radians(fov_v_deg) / 2)
        cd.clip_start = 0.05
        cd.clip_end = clip_end
        cam = bpy.data.objects.new(name, cd)
        _link(cam)
        bpy.context.scene.camera = cam
        cam.rotation_mode = 'XYZ'
        cam['pk_pitch'] = pitch_deg
        cam['pk_fov_v'] = fov_v_deg
        cam['pk_height'] = height

        fps = FPS
        f0, f1 = FRAME_START - 1, FRAME_END + 1
        # integrate the speed profile on a fine grid
        dt = 1.0 / (fps * 8)
        ts = np.arange((f0 - 1) / fps - 1.0, (f1 - 1) / fps + 1.0 + dt, dt)

        def v_of(t):
            if t <= slow_after_s:
                return speed_mps
            x = min(1.0, (t - slow_after_s) / max(slow_ease_s, 1e-3))
            e = x * x * (3 - 2 * x)
            return speed_mps * (1.0 - (1.0 - end_speed_factor) * e)
        vs = np.array([v_of(t) for t in ts])
        ss = np.concatenate([[0.0], np.cumsum((vs[1:] + vs[:-1]) * 0.5 * dt)])
        ss -= np.interp(0.0, ts, ss)
        ss += start_s

        def s_of_t(t):
            return float(np.interp(t, ts, ss))
        rng = np.random.RandomState(seed)
        vib = [(rng.uniform(1.7, 2.6), rng.uniform(0, 6.28)), (rng.uniform(3.1, 4.3), rng.uniform(0, 6.28)),
               (rng.uniform(4.9, 6.1), rng.uniform(0, 6.28))]
        sway_ph = rng.uniform(0, 6.28)
        yaw_prev = None
        for f in range(f0, f1 + 1):
            t = (f - 1) / fps
            s = s_of_t(t)
            lat = lateral + sway * math.sin(2 * math.pi * t / 7.3 + sway_ph)
            pos = path.offset(s, lat, height)
            tgt = path.offset(s + look_ahead, lateral, height)
            d = tgt - pos
            yaw = math.atan2(d.x, d.y)
            if yaw_prev is not None:
                while yaw - yaw_prev > math.pi:
                    yaw -= 2 * math.pi
                while yaw - yaw_prev < -math.pi:
                    yaw += 2 * math.pi
            yaw_prev = yaw
            vb = sum(math.sin(2 * math.pi * fr * t + ph) for fr, ph in vib) / 3.0
            vb2 = sum(math.sin(2 * math.pi * fr * 1.13 * t + ph * 1.7) for fr, ph in vib) / 3.0
            pos.z += vibration * vb
            v = v_of(t)
            k = path.curvature(s + look_ahead * 0.3)
            roll = max(-max_roll_deg, min(max_roll_deg,
                                          -lean * math.degrees(math.atan(k * v * v / 9.81)) * 0.5))
            roll += math.degrees(vibration * 6.0) * vb2 * 0.4
            pitch = pitch_deg + math.degrees(vibration * 4.0) * vb2 * 0.5
            yaw_j = 0.0
            if shake_deg > 0:
                sh = [math.sin(2 * math.pi * fr * 1.37 * t + ph * 2.3) for fr, ph in vib]
                pitch += shake_deg * (sh[0] * 0.6 + sh[2] * 0.4)
                roll += shake_deg * 0.5 * sh[1]
                yaw_j = math.radians(shake_deg * 0.4 * (sh[1] * 0.5 + sh[2] * 0.5))
            cam.location = pos
            cam.rotation_euler = (math.radians(90.0 + pitch), math.radians(roll), -yaw + yaw_j)
            cam.keyframe_insert('location', frame=f)
            cam.keyframe_insert('rotation_euler', frame=f)
        _set_interp(cam, 'LINEAR')
        c.camera, c.path, c.s_of_t = cam, path, s_of_t
        return cam

    @staticmethod
    def static(location, look_at, fov_v_deg=60.0, name='POVCam'):
        cd = bpy.data.cameras.new(name)
        cd.sensor_fit = 'VERTICAL'
        cd.sensor_height = 24.0
        cd.lens = 12.0 / math.tan(math.radians(fov_v_deg) / 2)
        cd.clip_start, cd.clip_end = 0.05, 4000.0
        cam = bpy.data.objects.new(name, cd)
        _link(cam)
        cam.location = location
        cam.rotation_euler = (Vector(look_at) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
        cam['pk_pitch'] = 0.0
        cam['pk_fov_v'] = fov_v_deg
        bpy.context.scene.camera = cam
        ctx().camera = cam
        return cam


def mark_moving(ob):
    """EEVEE only computes motion vectors for objects that are animated themselves; a child of
    the moving camera without its own animation is treated as static and smears the whole
    frame with radial motion blur. Constant keyframes on the child fix that."""
    for f in (FRAME_START - 1, FRAME_END + 1):
        ob.keyframe_insert('location', frame=f)


def exclude_from_lights(*objs):
    """Make objects ignore every scene light (direct light and light specular) via light
    linking, e.g. the windshield, which would otherwise mirror overhead street lamps as
    tall smeared bands across the sky. Applied to all lights when main() finishes building
    (lights that already have their own receiver set are left alone)."""
    c = bpy.data.collections.get('PK_NoDirectLight')
    if c is None:
        c = bpy.data.collections.new('PK_NoDirectLight')
    for o in objs:
        if o.name not in c.objects:
            c.objects.link(o)
    for co in c.collection_objects:
        co.light_linking.link_state = 'EXCLUDE'
    return c


def _apply_light_exclusions():
    c = bpy.data.collections.get('PK_NoDirectLight')
    if c is None or not len(c.objects):
        return 0
    n = 0
    for o in bpy.context.scene.objects:
        if o.type == 'LIGHT' and o.light_linking.receiver_collection is None:
            o.light_linking.receiver_collection = c
            n += 1
    return n


def _set_interp(obj, interp='LINEAR'):
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    for fc in _action_fcurves(ad.action, ad):
        for kp in fc.keyframe_points:
            kp.interpolation = interp


def _action_fcurves(action, ad=None):
    """All F-curves of an action (Blender 5 layered actions or legacy)."""
    out = []
    try:
        for layer in action.layers:
            for strip in layer.strips:
                slot = ad.action_slot if ad is not None else None
                for cb in strip.channelbags:
                    if slot is None or cb.slot == slot:
                        out.extend(cb.fcurves)
        if out:
            return out
    except AttributeError:
        pass
    return list(getattr(action, 'fcurves', []))


def fcurves(obj, data_path=None, index=None):
    ad = obj.animation_data
    if not ad or not ad.action:
        return []
    fcs = _action_fcurves(ad.action, ad)
    return [f for f in fcs if (data_path is None or f.data_path == data_path) and
            (index is None or f.array_index == index)]


# ----------------------------------------------------------------------------
# Mesh building
# ----------------------------------------------------------------------------

def mesh_object(name, verts, faces, uvs=None, material=None, smooth=True, collection=None,
                location=(0, 0, 0), sharp_angle=None, attrs=None, materials=None, mat_index=None,
                recalc=False):
    """Create a mesh object. uvs: per-loop (flattened in face order) list/array of (u, v).
    attrs: {name: (domain, array)} float attributes. materials + mat_index for multi-material."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        uvl.data.foreach_set('uv', np.asarray(uvs, np.float32).ravel())
    if attrs:
        for an, (dom, arr) in attrs.items():
            a = me.attributes.new(an, 'FLOAT', dom)
            a.data.foreach_set('value', np.asarray(arr, np.float32).ravel())
    me.validate(clean_customdata=False)
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    if smooth:
        me.shade_smooth()
        if sharp_angle is not None:
            me.set_sharp_from_angle(angle=math.radians(sharp_angle))
    if materials:
        for m in materials:
            me.materials.append(m)
        if mat_index is not None:
            me.polygons.foreach_set('material_index', np.asarray(mat_index, np.int32))
    elif material is not None:
        me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    ob.location = location
    _link(ob, collection)
    return ob


def _apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def edge_mask(ob_or_mesh, gain=3.0, name='pk_edge'):
    """Bake a convexity mask (0 flat/concave .. 1 sharp convex edge) into a point float
    attribute `pk_edge`. Materials use it for edge wear and highlights (works in EEVEE,
    unlike Pointiness or the Bevel shader node)."""
    me = ob_or_mesh.data if isinstance(ob_or_mesh, bpy.types.Object) else ob_or_mesh
    nv = len(me.vertices)
    if nv == 0:
        return
    co = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    nrm = np.asarray([v.vector[:] for v in me.vertex_normals], np.float32)
    ne = len(me.edges)
    ev = np.empty(ne * 2, np.int32)
    me.edges.foreach_get('vertices', ev)
    ev = ev.reshape(-1, 2)
    a, b = ev[:, 0], ev[:, 1]
    d = co[a] - co[b]
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    acc = np.zeros(nv, np.float32)
    cnt = np.zeros(nv, np.float32)
    np.add.at(acc, a, (nrm[a] * d).sum(1))
    np.add.at(acc, b, -(nrm[b] * d).sum(1))
    np.add.at(cnt, a, 1)
    np.add.at(cnt, b, 1)
    conv = np.clip(acc / np.maximum(cnt, 1) * gain, 0, 1)
    if name in me.attributes:
        me.attributes.remove(me.attributes[name])
    at = me.attributes.new(name, 'FLOAT', 'POINT')
    at.data.foreach_set('value', conv)


def _box_uv(me, scale=1.0):
    """Box-projected UVs in meters."""
    uvl = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers[0]
    out = np.zeros((len(me.loops), 2), np.float32)
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                out[li] = (v.y * scale, v.z * scale)
            elif ax == 1:
                out[li] = (v.x * scale, v.z * scale)
            else:
                out[li] = (v.x * scale, v.y * scale)
    uvl.data.foreach_set('uv', out.ravel())


class geo:
    """Geometry helpers. All sizes in meters."""

    @staticmethod
    def rounded_box(size=(1, 1, 1), radius=0.05, segments=4, location=(0, 0, 0),
                    rotation=(0, 0, 0), material=None, name='RBox', origin='BOTTOM',
                    collection=None, edges=True):
        """Box with rounded edges (bevel with hardened normals). origin 'BOTTOM' puts the
        object origin at the centre of the bottom face; rotation in degrees."""
        sx, sy, sz = size
        r = min(radius, 0.499 * min(sx, sy, sz))
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= sx
            v.co.y *= sy
            v.co.z *= sz
            if origin == 'BOTTOM':
                v.co.z += sz / 2
        if r > 0 and segments > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=r,
                            offset_type='OFFSET', segments=segments, profile=0.5,
                            affect='EDGES', clamp_overlap=True)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(30))
        _box_uv(me)
        if edges:
            edge_mask(me, gain=2.5)
        if material is not None:
            me.materials.append(material)
        ob = bpy.data.objects.new(name, me)
        ob.location = location
        ob.rotation_euler = [math.radians(a) for a in rotation]
        _link(ob, collection)
        return ob

    @staticmethod
    def lathe(profile, segments=48, material=None, name='Lathe', location=(0, 0, 0),
              cap_bottom=True, cap_top=True, sharp_angle=None, collection=None, edges=True):
        """Revolve a profile [(radius, z), ...] (bottom to top) around Z. Mushroom caps,
        towers, domes, bottles. Radius 0 at an end closes it to a point."""
        prof = [(float(r), float(z)) for r, z in profile]
        n = len(prof)
        verts, faces, uvs = [], [], []
        L = [0.0]
        for i in range(1, n):
            L.append(L[-1] + math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]))
        tot = max(L[-1], 1e-6)
        for j in range(segments):
            a = 2 * math.pi * j / segments
            ca, sa = math.cos(a), math.sin(a)
            for r, z in prof:
                verts.append((r * ca, r * sa, z))
        for j in range(segments):
            j2 = (j + 1) % segments
            for i in range(n - 1):
                a0, a1 = j * n + i, j2 * n + i
                faces.append((a0, a1, a1 + 1, a0 + 1))
                u0, u1 = j / segments, (j + 1) / segments
                uvs += [(u0, L[i] / tot), (u1, L[i] / tot), (u1, L[i + 1] / tot), (u0, L[i + 1] / tot)]
        if cap_bottom and prof[0][0] > 1e-6:
            faces.append(tuple(j * n for j in reversed(range(segments))))
            uvs += [(0.5 + 0.5 * math.cos(2 * math.pi * j / segments),
                     0.5 + 0.5 * math.sin(2 * math.pi * j / segments)) for j in reversed(range(segments))]
        if cap_top and prof[-1][0] > 1e-6:
            faces.append(tuple(j * n + n - 1 for j in range(segments)))
            uvs += [(0.5 + 0.5 * math.cos(2 * math.pi * j / segments),
                     0.5 + 0.5 * math.sin(2 * math.pi * j / segments)) for j in range(segments)]
        ob = mesh_object(name, verts, faces, uvs=uvs, material=material, collection=collection,
                         location=location, sharp_angle=sharp_angle)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.shade_smooth()
        if sharp_angle is not None:
            ob.data.set_sharp_from_angle(angle=math.radians(sharp_angle))
        if edges:
            edge_mask(ob, gain=2.0)
        return ob

    @staticmethod
    def bevel(ob, width=0.03, segments=3, angle=40.0, harden=True, apply=True):
        """Bevel sharp edges (angle limit) with hardened normals; applied by default."""
        m = ob.modifiers.new('PK_Bevel', 'BEVEL')
        m.width = width
        m.segments = segments
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(angle)
        m.harden_normals = harden
        m.use_clamp_overlap = True
        if apply:
            _apply_modifiers(ob)
            edge_mask(ob, gain=2.5)
        return ob

    @staticmethod
    def sweep(points, profile, closed_profile=True, material=None, name='Sweep', collection=None,
              caps=True, up=(0, 0, 1), scale=None, smooth=True):
        """Sweep a 2D profile [(x, y), ...] (x right, y up in the section) along a 3D
        polyline with rotation-minimizing frames. scale: optional per-point factor list.
        UV: u around the profile (0..1), v along the path in meters."""
        P = [Vector(p) for p in points]
        n = len(P)
        prof = [Vector((p[0], p[1])) for p in profile]
        m = len(prof)
        T = []
        for i in range(n):
            a = P[max(i - 1, 0)]
            b = P[min(i + 1, n - 1)]
            T.append((b - a).normalized())
        upv = Vector(up)
        N0 = T[0].cross(upv)
        if N0.length < 1e-6:
            N0 = T[0].cross(Vector((1, 0, 0)))
        N0.normalize()
        frames = [(N0, N0.cross(T[0]).normalized())]
        for i in range(1, n):
            Np, Bp = frames[-1]
            q = T[i - 1].rotation_difference(T[i])
            Nn = (q @ Np).normalized()
            Bn = T[i].cross(Nn).normalized() * -1
            frames.append((Nn, Bn))
        verts, faces, uvs = [], [], []
        L = [0.0]
        for i in range(1, n):
            L.append(L[-1] + (P[i] - P[i - 1]).length)
        for i in range(n):
            Nn, Bn = frames[i]
            # make B point "up-ish": section y axis
            k = scale[i] if scale is not None else 1.0
            for pp in prof:
                verts.append(P[i] + (Nn * pp.x + Bn * pp.y) * k)
        mm = m if closed_profile else m - 1
        for i in range(n - 1):
            for j in range(mm):
                j2 = (j + 1) % m
                faces.append((i * m + j, i * m + j2, (i + 1) * m + j2, (i + 1) * m + j))
                uvs += [(j / m, L[i]), ((j + 1) / m, L[i]), ((j + 1) / m, L[i + 1]), (j / m, L[i + 1])]
        if caps and closed_profile:
            faces.append(tuple(reversed(range(m))))
            uvs += [(0.5 + 0.5 * pp.x, 0.5 + 0.5 * pp.y) for pp in reversed(prof)]
            faces.append(tuple((n - 1) * m + j for j in range(m)))
            uvs += [(0.5 + 0.5 * pp.x, 0.5 + 0.5 * pp.y) for pp in prof]
        return mesh_object(name, verts, faces, uvs=uvs, material=material, smooth=smooth,
                           collection=collection, recalc=closed_profile)

    @staticmethod
    def tube_along(points, radius=0.03, segments=12, material=None, name='Tube',
                   collection=None, caps=True, resample=None):
        """Round tube along a polyline / Path / curve object (neon, pipes, rails, wire).
        resample: spacing in meters to resample a Path or curve."""
        if isinstance(points, Path):
            pth = points
            sp = resample or 0.1
            points = [tuple(pth.at(s)) for s in pth.samples(sp)]
        elif isinstance(points, bpy.types.Object):
            points = _curve_points(points, resample or 0.05)
        prof = [(radius * math.cos(2 * math.pi * j / segments),
                 radius * math.sin(2 * math.pi * j / segments)) for j in range(segments)]
        return geo.sweep(points, prof, material=material, name=name, collection=collection,
                         caps=caps)

    @staticmethod
    def road_from_curve(path, width=7.0, step=0.5, material=None, crown=0.04, lanes_across=8,
                        s0=None, s1=None, name='Road', curb=None, sidewalk=None,
                        sidewalk_width=2.5, curb_height=0.14, verge=None, verge_width=30.0,
                        collection=None):
        """Road surface along a Path (or points). UV: U = lateral meters from the centre
        line (-w/2..w/2), V = meters along. Optional curbs, sidewalks and verges (materials)
        on both sides. Returns dict(road=..., curbs=[...], sidewalks=[...], verges=[...])."""
        if not isinstance(path, Path):
            path = Path(path)
        s0 = -20.0 if s0 is None else s0
        s1 = path.length + 30.0 if s1 is None else s1
        ss = np.arange(s0, s1 + step, step)
        out = {'road': None, 'curbs': [], 'sidewalks': [], 'verges': []}

        def strip(lat0, lat1, z0, z1, across, nm, mat, crown_h=0.0, uv_mode='road'):
            verts, faces, uvs = [], [], []
            na = across + 1
            for i, s in enumerate(ss):
                for j in range(na):
                    f = j / across
                    lat = lat0 + (lat1 - lat0) * f
                    z = z0 + (z1 - z0) * f
                    if crown_h:
                        z += crown_h * (1.0 - (2 * f - 1) ** 2)
                    verts.append(tuple(path.offset(s, lat, z)))
            for i in range(len(ss) - 1):
                for j in range(across):
                    a = i * na + j
                    faces.append((a, a + 1, a + na + 1, a + na))
                    for (ii, jj) in ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)):
                        lat = lat0 + (lat1 - lat0) * jj / across
                        uvs.append((lat, ss[ii] - s0))
            return mesh_object(nm, verts, faces, uvs=uvs, material=mat, collection=collection)

        hw = width / 2
        out['road'] = strip(-hw, hw, 0.0, 0.0, lanes_across, name, material, crown)
        for side in (-1, 1):
            tag = 'L' if side < 0 else 'R'
            if curb is not None:
                cw = 0.18
                # curb as a swept rounded section along offset path
                pts = [tuple(path.offset(s, side * (hw + cw / 2), 0.0)) for s in ss]
                sec = [(-cw / 2, -0.05), (cw / 2, -0.05), (cw / 2, curb_height - 0.03),
                       (cw / 2 - 0.03, curb_height), (-cw / 2 + 0.03, curb_height),
                       (-cw / 2, curb_height - 0.03)]
                o = geo.sweep(pts, sec, material=curb, name='Curb' + tag, collection=collection,
                              caps=False)
                o.data.set_sharp_from_angle(angle=math.radians(50))
                out['curbs'].append(o)
            inner = hw + (0.18 if curb is not None else 0.0)
            if sidewalk is not None:
                a, b = (inner, inner + sidewalk_width)
                if side < 0:
                    o = strip(-b, -a, curb_height - 0.01, curb_height - 0.01, 2, 'Sidewalk' + tag, sidewalk)
                else:
                    o = strip(a, b, curb_height - 0.01, curb_height - 0.01, 2, 'Sidewalk' + tag, sidewalk)
                out['sidewalks'].append(o)
                inner = b
            if verge is not None:
                zv = curb_height - 0.03 if sidewalk is not None else 0.0
                a, b = inner, inner + verge_width
                if side < 0:
                    o = strip(-b, -a, zv, zv, 6, 'Verge' + tag, verge)
                else:
                    o = strip(a, b, zv, zv, 6, 'Verge' + tag, verge)
                out['verges'].append(o)
        return out

    @staticmethod
    def string_lights(p0, p1, sag=0.6, count=12, colors=((1.0, 0.7, 0.35),), strength=25.0,
                      bulb_radius=0.05, wire_radius=0.006, light_every=0, light_energy=6.0,
                      light_radius=0.05, name='StringLights', seed=0, collection=None,
                      wire_material=None):
        """Catenary-ish wire from p0 to p1 sagging by `sag` meters with `count` emissive
        bulbs cycling through `colors`. light_every > 0 adds a shadowless point light at
        every n-th bulb so the lights also streak on wet ground. Returns the wire object
        (bulbs and lights are children)."""
        p0, p1 = Vector(p0), Vector(p1)
        N = 40
        pts = []
        for i in range(N + 1):
            t = i / N
            p = p0.lerp(p1, t)
            p.z -= sag * 4 * t * (1 - t)
            pts.append(p)
        wm = wire_material or mat.metal(color=(0.02, 0.02, 0.02), roughness=0.5, name='PK_Wire')
        wire = geo.tube_along([tuple(p) for p in pts], radius=wire_radius, segments=6,
                              material=wm, name=name, collection=collection)
        # bulbs: one mesh, one material per colour
        mats = [mat.emission(c, strength, name='PK_Bulb_%d_%d_%d' % tuple(int(x * 99) for x in c))
                for c in colors]
        bm = bmesh.new()
        for i in range(count):
            t = (i + 0.5) / count
            p = p0.lerp(p1, t)
            p.z -= sag * 4 * t * (1 - t) + bulb_radius * 1.6
            ret = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=bulb_radius)
            for v in ret['verts']:
                v.co += p
                v.co.z += (v.co.z - p.z) * 0.25
            for f in {f for v in ret['verts'] for f in v.link_faces}:
                f.material_index = i % len(colors)
        me = bpy.data.meshes.new(name + '_bulbs')
        bm.to_mesh(me)
        bm.free()
        me.shade_smooth()
        for m in mats:
            me.materials.append(m)
        bo = bpy.data.objects.new(name + '_bulbs', me)
        _link(bo, collection)
        bo.parent = wire
        if light_every > 0:
            for i in range(0, count, light_every):
                t = (i + 0.5) / count
                p = p0.lerp(p1, t)
                p.z -= sag * 4 * t * (1 - t) + bulb_radius * 1.6
                lo = lights.point(tuple(p), colors[i % len(colors)], light_energy,
                                  radius=light_radius, shadow=False, name=name + '_L%d' % i,
                                  collection=collection)
                lo.parent = wire
        return wire

    @staticmethod
    def scatter(source, points, seed=0, scale=(0.8, 1.2), rot_z=True, tilt_deg=0.0,
                name='Scatter', collection=None, align=None):
        """Linked duplicates of `source` (object or list of objects, picked at random) at
        `points`, parented to one Empty so glTF export can use GPU instancing. Returns the
        Empty. align: optional list of yaw angles (deg) per point."""
        rng = random.Random(seed)
        srcs = source if isinstance(source, (list, tuple)) else [source]
        root = bpy.data.objects.new(name, None)
        _link(root, collection)
        for s in srcs:
            s.hide_render = True
            s.hide_viewport = True
            s['pk_noexport'] = True
        for i, p in enumerate(points):
            s = rng.choice(srcs)
            o = bpy.data.objects.new('%s_%d' % (name, i), s.data)
            sc_ = rng.uniform(*scale) if hasattr(scale, '__len__') else scale
            o.scale = (sc_, sc_, sc_)
            yaw = math.radians(align[i]) if align is not None else (rng.uniform(0, 2 * math.pi) if rot_z else 0.0)
            tx = math.radians(rng.uniform(-tilt_deg, tilt_deg))
            ty = math.radians(rng.uniform(-tilt_deg, tilt_deg))
            o.rotation_euler = (tx, ty, yaw)
            o.location = p
            o.parent = root
            _link(o, collection)
        return root

    @staticmethod
    def points_along(path, spacing=10.0, lateral=6.0, s0=0.0, s1=None, jitter=0.0,
                     lateral_jitter=0.0, z=0.0, seed=0, both_sides=False):
        rng = random.Random(seed)
        s1 = path.length if s1 is None else s1
        pts = []
        s = s0
        while s <= s1:
            for side in ((-1, 1) if both_sides else (1,)):
                ss = s + rng.uniform(-jitter, jitter)
                lat = side * (abs(lateral) if both_sides else lateral) + rng.uniform(-lateral_jitter, lateral_jitter)
                pts.append(tuple(path.offset(ss, lat, z)))
            s += spacing
        return pts

    @staticmethod
    def points_in_band(path, count, lat_min, lat_max, s0=0.0, s1=None, z=0.0, seed=0,
                       min_dist=0.0, both_sides=True):
        """Random points in a band beside the road (lateral distance range, both sides)."""
        rng = random.Random(seed)
        s1 = path.length if s1 is None else s1
        pts = []
        tries = 0
        while len(pts) < count and tries < count * 30:
            tries += 1
            s = rng.uniform(s0, s1)
            lat = rng.uniform(lat_min, lat_max) * (rng.choice((-1, 1)) if both_sides else 1)
            p = path.offset(s, lat, z)
            if min_dist > 0 and any((p - Vector(q)).length < min_dist for q in pts):
                continue
            pts.append(tuple(p))
        return pts

    @staticmethod
    def window_panel(cols=3, rows=2, win_w=0.9, win_h=1.3, gap_x=0.7, gap_y=1.4,
                     material=None, name='Windows', seed=0, location=(0, 0, 0),
                     rotation=(0, 0, 0), collection=None, round_top=False, lit_fraction=1.0):
        """Grid of window quads facing -Y (local XZ plane), origin at the bottom centre.
        Each quad has UV 0..1 and a per-window random face attribute `pk_rand` (0..1; a
        window is unlit when pk_rand > lit_fraction) for mat.lit_window."""
        rng = random.Random(seed)
        verts, faces, uvs, rnd = [], [], [], []
        tw = cols * win_w + (cols - 1) * gap_x
        for r in range(rows):
            for c in range(cols):
                x0 = -tw / 2 + c * (win_w + gap_x)
                z0 = r * (win_h + gap_y)
                k = len(verts)
                if round_top:
                    segs = 8
                    pts = [(x0, z0), (x0 + win_w, z0)]
                    rr = win_w / 2
                    cz = z0 + win_h - rr
                    for i in range(segs + 1):
                        a = math.pi * i / segs
                        pts.append((x0 + rr + rr * math.cos(a), cz + rr * math.sin(a)))
                    for (x, z) in pts:
                        verts.append((x, 0.0, z))
                    faces.append(tuple(range(k, k + len(pts))))
                    uvs += [((x - x0) / win_w, (z - z0) / win_h) for (x, z) in pts]
                else:
                    verts += [(x0, 0, z0), (x0 + win_w, 0, z0), (x0 + win_w, 0, z0 + win_h), (x0, 0, z0 + win_h)]
                    faces.append((k, k + 1, k + 2, k + 3))
                    uvs += [(0, 0), (1, 0), (1, 1), (0, 1)]
                rnd.append(rng.random() / max(lit_fraction, 1e-6) if lit_fraction < 1 else rng.random())
        ob = mesh_object(name, verts, faces, uvs=uvs, material=material, smooth=False,
                         collection=collection, location=location,
                         attrs={'pk_rand': ('FACE', rnd)})
        ob.rotation_euler = [math.radians(a) for a in rotation]
        return ob

    @staticmethod
    def fog(center=(0, 0, 0), size=(80, 120, 20), density=0.02, falloff=4.0, base_z=0.0,
            color=(0.55, 0.65, 1.0), anisotropy=0.35, emission=0.0, emission_color=(0.2, 0.3, 0.8),
            noise_amount=0.4, name='Fog', collection=None):
        """Atmospheric fog volume (box) with exponential height falloff:
        density(z) = density * exp(-(z - base_z) / falloff), broken up by soft noise."""
        m = bpy.data.materials.new(name)
        nt = m.node_tree
        nt.nodes.clear()
        out = node(nt, 'ShaderNodeOutputMaterial')
        pos = node(nt, 'ShaderNodeNewGeometry').outputs['Position']
        z = sep_xyz(nt, pos)[2]
        h = math_(nt, 'EXPONENT', math_(nt, 'DIVIDE', math_(nt, 'SUBTRACT', base_z, z), falloff))
        h = math_(nt, 'MINIMUM', h, 1.0)
        nf, _ = noise(nt, vmath(nt, 'SCALE', pos, scale=0.06), scale=1.0, detail=2.0)
        nf = maprange(nt, nf, 0.3, 0.7, 1.0 - noise_amount, 1.0 + noise_amount * 0.5)
        dens = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', h, nf), density)
        pv = node(nt, 'ShaderNodeVolumePrincipled')
        _set(nt, pv.inputs['Color'], color)
        _set(nt, pv.inputs['Density'], dens)
        _set(nt, pv.inputs['Anisotropy'], anisotropy)
        if emission > 0:
            _set(nt, pv.inputs['Emission Strength'], math_(nt, 'MULTIPLY', dens, emission / max(density, 1e-6)))
            _set(nt, pv.inputs['Emission Color'], emission_color)
        nt.links.new(pv.outputs[0], out.inputs['Volume'])
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        ob.location = center
        ob.scale = size
        ob['pk_noexport'] = True
        _link(ob, collection)
        return ob


# ----------------------------------------------------------------------------
# Particles (headless-safe: keyframes + F-curve modifiers, no simulation caches)
# ----------------------------------------------------------------------------

class particles:

    @staticmethod
    def snow(bounds_min, bounds_max, density=0.6, flake_size=0.018, speed=1.1, layers=2,
             drift=0.35, seed=5, strength=0.35, name='Snow', collection=None):
        """Falling snow filling a world box (e.g. the corridor around the drive path):
        density flakes per m^3 per layer. Each layer is one mesh of tiny flakes duplicated
        twice and keyframed downward with a Cycles modifier, so it loops seamlessly;
        layers differ in speed, size and sideways drift. strength > 0 makes flakes emissive."""
        bmin, bmax = Vector(bounds_min), Vector(bounds_max)
        ext = bmax - bmin
        H = ext.z
        rng = np.random.RandomState(seed)
        m = mat.snowflake(strength=strength)
        root = bpy.data.objects.new(name, None)
        _link(root, collection)
        for li in range(layers):
            n = int(density * ext.x * ext.y * ext.z)
            P = rng.uniform(0, 1, (n, 3)) * np.array(ext) + np.array(bmin)
            P[:, 2] = rng.uniform(0, H, n)
            sz = flake_size * (0.6 + 0.8 * li / max(layers - 1, 1)) * rng.uniform(0.6, 1.4, n)
            # octahedron flakes
            base = np.array([(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 0.6), (0, 0, -0.6)], np.float32)
            fcs = np.array([(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)])
            ang = rng.uniform(0, np.pi, n)
            ca, sa = np.cos(ang), np.sin(ang)
            V = np.repeat(base[None], n, 0) * sz[:, None, None]
            x = V[..., 0] * ca[:, None] - V[..., 1] * sa[:, None]
            y = V[..., 0] * sa[:, None] + V[..., 1] * ca[:, None]
            V = np.stack([x, y, V[..., 2]], -1) + P[:, None, :]
            F = (fcs[None] + (np.arange(n) * 6)[:, None, None]).reshape(-1, 3)
            me = bpy.data.meshes.new('%s_L%d' % (name, li))
            me.from_pydata(V.reshape(-1, 3).tolist(), [], F.tolist())
            me.materials.append(m)
            sp = speed * (0.75 + 0.5 * li / max(layers - 1, 1))
            period = H / sp * FPS
            for k in range(2):
                o = bpy.data.objects.new('%s_L%d_%d' % (name, li, k), me)
                _link(o, collection)
                o.parent = root
                o.location = (0, 0, H * k)
                o.keyframe_insert('location', index=2, frame=1)
                o.location = (0, 0, H * k - H)
                o.keyframe_insert('location', index=2, frame=1 + period)
                for fc in fcurves(o, 'location', 2):
                    for kp in fc.keyframe_points:
                        kp.interpolation = 'LINEAR'
                    fc.modifiers.new('CYCLES')
                    fc.extrapolation = 'LINEAR'
                o.location.x = 0.0
                o.keyframe_insert('location', index=0, frame=1)
                for fc in fcurves(o, 'location', 0):
                    nm = fc.modifiers.new('NOISE')
                    nm.scale = 60.0 + 20 * li
                    nm.strength = drift * 2
                    nm.phase = li * 3.7
                o.visible_shadow = False
        return root

    @staticmethod
    def fireflies(points, color=(0.75, 1.0, 0.35), strength=40.0, radius=0.018, wander=0.35,
                  blink=True, seed=9, name='Fireflies', collection=None):
        """Small emissive specks at `points` wandering with noise F-modifiers and blinking
        through the object colour (read by the material)."""
        rng = random.Random(seed)
        m = mat.emission(color, strength, name=name + '_mat', blink=blink)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(m)
        root = bpy.data.objects.new(name, None)
        _link(root, collection)
        for i, p in enumerate(points):
            o = bpy.data.objects.new('%s_%d' % (name, i), me)
            _link(o, collection)
            o.parent = root
            o.location = p
            o.visible_shadow = False
            for ax in range(3):
                o.keyframe_insert('location', index=ax, frame=1)
            for fc in fcurves(o, 'location'):
                nm = fc.modifiers.new('NOISE')
                nm.scale = rng.uniform(25, 60)
                nm.strength = wander * (0.5 if fc.array_index == 2 else 1.0) * 2
                nm.phase = rng.uniform(0, 100)
            if blink:
                o.color = (1, 1, 1, 1)
                o.keyframe_insert('color', index=0, frame=1)
                for fc in fcurves(o, 'color', 0):
                    nm = fc.modifiers.new('NOISE')
                    nm.scale = rng.uniform(6, 14)
                    nm.strength = 2.4
                    nm.phase = rng.uniform(0, 100)
        return root


# ----------------------------------------------------------------------------
# Lights
# ----------------------------------------------------------------------------

class lights:

    @staticmethod
    def point(location, color=(1, 0.7, 0.4), energy=100.0, radius=0.1, shadow=True,
              soft=True, name='Point', collection=None, specular=1.0, volume=1.0):
        ld = bpy.data.lights.new(name, 'POINT')
        ld.color = color
        ld.energy = energy
        ld.shadow_soft_size = radius
        ld.use_shadow = shadow
        ld.use_shadow_jitter = shadow and soft
        ld.specular_factor = specular
        ld.volume_factor = volume
        ld.use_soft_falloff = True
        ob = bpy.data.objects.new(name, ld)
        ob.location = location
        _link(ob, collection)
        return ob

    @staticmethod
    def spot(location, target, color=(1, 0.7, 0.4), energy=300.0, angle_deg=70.0, blend=0.6,
             radius=0.1, shadow=True, name='Spot', collection=None, volume=1.0, specular=1.0):
        ld = bpy.data.lights.new(name, 'SPOT')
        ld.volume_factor = volume
        ld.specular_factor = specular
        ld.color = color
        ld.energy = energy
        ld.spot_size = math.radians(angle_deg)
        ld.spot_blend = blend
        ld.shadow_soft_size = radius
        ld.use_shadow = shadow
        ld.use_shadow_jitter = shadow
        ob = bpy.data.objects.new(name, ld)
        ob.location = location
        ob.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
        _link(ob, collection)
        return ob

    @staticmethod
    def area(location, target, size=(1.0, 1.0), color=(1, 0.7, 0.4), energy=100.0,
             shadow=False, name='Area', collection=None, spread_deg=180.0):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.shape = 'RECTANGLE'
        ld.size, ld.size_y = size
        ld.color = color
        ld.energy = energy
        ld.use_shadow = shadow
        ld.spread = math.radians(spread_deg)
        ob = bpy.data.objects.new(name, ld)
        ob.location = location
        ob.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
        _link(ob, collection)
        return ob

    @staticmethod
    def planar_probe(center=(0.0, 0.0, 0.0), size=(40.0, 200.0), z=0.0, yaw_deg=0.0,
                     influence=0.35, clip_start=0.3, name='PK_PlanarProbe', collection=None):
        """EEVEE planar light probe (a mirrored render of the scene) covering a flat
        reflective area: size = (x, y) extent in meters centred on `center`, at height z.
        Surfaces within `influence` m of the plane trace their reflections against it, so a
        wet road reflects lamps, string lights and upper floors that are off screen (screen
        tracing alone cannot). One probe per flat level; each probe costs roughly one extra
        scene render per sample, so cover the whole road with one large probe.
        WARNING: on Blender 5.2.1 / Metal a planar probe made the test street's road
        reflections weaker, not stronger (see README); prefer reflection_probes()."""
        lp = bpy.data.lightprobes.new(name, 'PLANE')
        lp.influence_distance = influence
        lp.clip_start = clip_start
        ob = bpy.data.objects.new(name, lp)
        ob.location = (center[0], center[1], z)
        ob.scale = (size[0] / 2.0, size[1] / 2.0, 1.0)
        ob.rotation_euler = (0.0, 0.0, math.radians(yaw_deg))
        ob['pk_noexport'] = True
        _link(ob, collection)
        return ob

    @staticmethod
    def road_probe(path, s0=None, s1=None, margin=12.0, z=0.0, influence=0.35, name='PK_RoadProbe'):
        """One planar probe covering the axis-aligned bounds of `path` (pk.Path) between
        s0 and s1 plus `margin` m on every side (roads from geo.road_from_curve lie at z=0)."""
        s0 = 0.0 if s0 is None else s0
        s1 = path.length if s1 is None else s1
        pts = np.array([tuple(path.at(s)) for s in np.linspace(s0, s1, 200)])
        lo = pts.min(0) - margin
        hi = pts.max(0) + margin
        c = (lo + hi) / 2
        return lights.planar_probe((c[0], c[1], 0.0), (hi[0] - lo[0], hi[1] - lo[1]), z=z,
                                   influence=influence, name=name)

    @staticmethod
    def reflection_probes(path, spacing=20.0, s0=0.0, s1=None, height=2.0, radius=None,
                          name='PK_SphereProbe'):
        """Sphere light probes along `path` every `spacing` m (influence radius defaults to
        0.8 x spacing). EEVEE falls back to them when a screen-traced reflection ray leaves the
        screen, so the near wet road also mirrors overhead lamps, string lights and upper
        floors. Costs about 15 percent render time on the test street. Caveat: glossy glass
        near the camera (the windshield) samples them too, and a probe next to a bright lamp
        then paints a tall coloured band across the sky; keep probes away from lamp heads or
        skip them (the test street does not use them)."""
        s1 = path.length if s1 is None else s1
        out = []
        for i, s in enumerate(np.arange(s0, s1 + 1e-6, spacing)):
            lp = bpy.data.lightprobes.new('%s_%d' % (name, i), 'SPHERE')
            lp.influence_distance = radius or spacing * 0.8
            ob = bpy.data.objects.new('%s_%d' % (name, i), lp)
            ob.location = tuple(path.offset(float(s), 0.0, height))
            ob['pk_noexport'] = True
            _link(ob)
            out.append(ob)
        return out

    @staticmethod
    def sun(direction_az, direction_el, color=(0.6, 0.7, 1.0), strength=0.05, angle_deg=1.0,
            shadow=True, name='Sun'):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.color = color
        ld.energy = strength
        ld.angle = math.radians(angle_deg)
        ld.use_shadow = shadow
        ob = bpy.data.objects.new(name, ld)
        ob.rotation_euler = (-sky_dir(direction_az, direction_el)).to_track_quat('-Z', 'Y').to_euler()
        _link(ob)
        return ob


# ----------------------------------------------------------------------------
# Materials
# ----------------------------------------------------------------------------

def _new_mat(name, method='DITHERED'):
    m = bpy.data.materials.new(name)
    m.surface_render_method = method
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial')
    return m, nt, out


def _web(m, base=(0.5, 0.5, 0.5), rough=0.5, metal=0.0, emit=(0, 0, 0), emit_strength=0.0,
         alpha=1.0, transmission=0.0, coat=0.0, coat_rough=0.03):
    """Flat web fallback for the glTF export (only the export reads it). coat > 0 adds a
    clear coat (KHR_materials_clearcoat) of that weight and roughness."""
    w = {'base': list(base)[:3], 'rough': rough, 'metal': metal, 'emit': list(emit)[:3],
         'emit_strength': emit_strength, 'alpha': alpha, 'transmission': transmission}
    if coat > 0:
        w['coat'] = coat
        w['coat_rough'] = coat_rough
    m['pk_web'] = w
    m.diffuse_color = list(base)[:3] + [alpha]


def _principled(nt, **inp):
    p = node(nt, 'ShaderNodeBsdfPrincipled')
    names = {'base': 'Base Color', 'rough': 'Roughness', 'metal': 'Metallic', 'normal': 'Normal',
             'coat': 'Coat Weight', 'coat_rough': 'Coat Roughness', 'coat_normal': 'Coat Normal',
             'spec': 'Specular IOR Level', 'ior': 'IOR', 'emit': 'Emission Color',
             'emit_strength': 'Emission Strength', 'sss': 'Subsurface Weight',
             'sss_radius': 'Subsurface Radius', 'sss_scale': 'Subsurface Scale',
             'transmission': 'Transmission Weight', 'alpha': 'Alpha', 'sheen': 'Sheen Weight',
             'sheen_tint': 'Sheen Tint', 'coat_tint': 'Coat Tint', 'spec_tint': 'Specular Tint'}
    for k, v in inp.items():
        _set(nt, p.inputs[names.get(k, k)], v)
    return p


def _edge(nt):
    return attr(nt, 'pk_edge')


def _jitter_color(nt, color, amount, coord, scale=3.0):
    """Multiply a colour by a soft noise (value variation +-amount, slight hue drift)."""
    f, c = noise(nt, coord, scale=scale, detail=3.0, rough=0.55)
    k = maprange(nt, f, 0.3, 0.7, 1.0 - amount, 1.0 + amount)
    tint = mix_col(nt, 0.12 * amount * 4, (1, 1, 1), c)
    return vmath(nt, 'SCALE', vmath(nt, 'MULTIPLY', color, tint), scale=k)


class mat:
    """Procedural material library (EEVEE-friendly; each material stores a flat web
    fallback in m['pk_web'] used by the glTF export)."""

    @staticmethod
    def basic(color=(0.5, 0.5, 0.5), roughness=0.5, metallic=0.0, emission=None, strength=0.0,
              coat=0.0, name=None):
        """Plain Principled material (no procedural detail); exports 1:1 to glTF."""
        m, nt, out = _new_mat(name or 'PK_Basic_%02x%02x%02x' % tuple(int(c * 255) for c in color[:3]))
        p = _principled(nt, base=color, rough=roughness, metal=metallic, coat=coat,
                        emit=emission or (0, 0, 0), emit_strength=strength if emission else 0.0)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        _web(m, base=color, rough=roughness, metal=metallic, emit=emission or (0, 0, 0),
             emit_strength=strength if emission else 0.0, coat=coat)
        return m

    @staticmethod
    def wet_asphalt(name='PK_WetAsphalt', base=(0.016, 0.017, 0.021), wetness=0.85,
                    puddles=0.45, puddle_scale=0.11, ripples=0.25, lane_markings=True,
                    center_color=(0.75, 0.55, 0.18), edge_color=(0.72, 0.72, 0.70),
                    road_width=7.0, dash=3.0, gap=5.0, line_w=0.13, edge_inset=0.35,
                    dry_rough=0.42, wet_rough=0.14, puddle_rough=0.03, grain=0.25, streak=1.0,
                    undulation=0.03, undulation_size=0.4):
        """Rain-wet road. Needs road UVs in meters (U lateral from centre, V along), as made
        by geo.road_from_curve. Puddles are near-mirrors, the wet film (wet_rough plus fore-aft
        `streak` ridges and a low-frequency `undulation` ripple) gives long vertical streaks of
        every light, painted lane lines are rougher and worn. Pair it with
        lights.road_probe(path) so off-screen lights reflect too, and comp road_streak."""
        m, nt, out = _new_mat(name)
        uv = node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
        U, V, _ = sep_xyz(nt, uv)
        p3 = comb_xyz(nt, U, V, 0.0)
        # puddle mask: big soft noise, more water near the crown edges (ruts)
        pf, _ = noise(nt, vmath(nt, 'SCALE', p3, scale=puddle_scale), scale=1.0, detail=3.0,
                      rough=0.55, distortion=0.3)
        rut = math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', math_(nt, 'ABSOLUTE', U), road_width * 0.25))
        rut = maprange(nt, rut, 0.0, 1.2, 0.12, 0.0)
        pm = math_(nt, 'ADD', pf, rut)
        thr = 0.62 - 0.22 * puddles
        puddle = maprange(nt, pm, thr, thr + 0.05, 0.0, 1.0, interp='SMOOTHSTEP')
        # wetness film varies slowly
        wf, _ = noise(nt, vmath(nt, 'SCALE', p3, scale=0.35), scale=1.0, detail=2.0)
        wet = maprange(nt, wf, 0.25, 0.65, wetness * 0.75, min(1.0, wetness * 1.1))
        wet = math_(nt, 'MAXIMUM', wet, puddle)
        # asphalt aggregate
        gf, _ = noise(nt, p3, scale=55.0, detail=6.0, rough=0.7)
        vor = voronoi(nt, p3, scale=38.0, feature='F1')
        stones = maprange(nt, vor['Distance'], 0.0, 0.35, 1.0, 0.0)
        tone = maprange(nt, gf, 0.3, 0.7, 0.75, 1.25)
        col = vmath(nt, 'SCALE', base, scale=math_(nt, 'MULTIPLY', tone, math_(nt, 'ADD', 0.9, math_(nt, 'MULTIPLY', stones, 0.35))))
        # patches of repaired asphalt
        rp, _ = noise(nt, vmath(nt, 'SCALE', p3, scale=0.07), scale=1.0, detail=1.0)
        patch = maprange(nt, rp, 0.6, 0.62, 1.0, 0.8)
        col = vmath(nt, 'SCALE', col, scale=patch)
        lanes = None
        if lane_markings:
            wear, _ = noise(nt, p3, scale=7.0, detail=4.0)
            wear = maprange(nt, wear, 0.38, 0.55, 0.0, 1.0)
            per = dash + gap
            ph = math_(nt, 'FRACT', math_(nt, 'DIVIDE', V, per))
            dmask = math_(nt, 'LESS_THAN', ph, dash / per)
            cmask = math_(nt, 'LESS_THAN', math_(nt, 'ABSOLUTE', U), line_w / 2)
            center = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', dmask, cmask), wear)
            ed = math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', math_(nt, 'ABSOLUTE', U),
                                             road_width / 2 - edge_inset))
            emask = math_(nt, 'MULTIPLY', math_(nt, 'LESS_THAN', ed, line_w * 0.6), wear)
            col = mix_col(nt, center, col, center_color)
            col = mix_col(nt, emask, col, edge_color)
            lanes = math_(nt, 'MAXIMUM', center, emask)
        # wet darkening
        col = vmath(nt, 'SCALE', col, scale=maprange(nt, wet, 0, 1, 1.0, 0.55))
        col = mix_col(nt, math_(nt, 'MULTIPLY', puddle, 0.7), col, vmath(nt, 'SCALE', base, scale=0.5))
        # roughness: dry -> wet film -> puddle mirror
        rv, _ = noise(nt, p3, scale=4.0, detail=3.0)
        dry = maprange(nt, rv, 0.3, 0.7, dry_rough * 0.85, dry_rough * 1.15)
        rough = mix_f(nt, wet, dry, maprange(nt, rv, 0.3, 0.7, wet_rough * 0.75, wet_rough * 1.25))
        rough = mix_f(nt, puddle, rough, puddle_rough)
        if lanes is not None:
            rough = mix_f(nt, math_(nt, 'MULTIPLY', lanes, math_(nt, 'SUBTRACT', 1.0, puddle)), rough,
                          math_(nt, 'ADD', rough, 0.12))
        # normals: aggregate grain (killed in puddles) + gentle long undulation + ripples
        gh = math_(nt, 'MULTIPLY', math_(nt, 'ADD', math_(nt, 'MULTIPLY', gf, 0.6), math_(nt, 'MULTIPLY', stones, 0.4)),
                   math_(nt, 'SUBTRACT', 1.0, puddle))
        nrm = bump(nt, gh, strength=grain, distance=0.004)
        uf, _ = noise(nt, vmath(nt, 'MULTIPLY', p3, (0.6, 0.15, 1.0)), scale=1.0, detail=2.0)
        nrm = bump(nt, uf, strength=0.08, distance=0.05, normal=nrm)
        if undulation > 0:
            # low-frequency ripple of the water film: breaks mirror images into wavy streaks
            lf, _ = noise(nt, p3, scale=1.0 / max(undulation_size, 1e-3), detail=2.0, rough=0.5)
            nrm = bump(nt, lf, strength=undulation, distance=0.03, normal=nrm)
        if streak > 0:
            # 'anisotropy' EEVEE lacks: fine ridges running across the road tilt the normals
            # only fore/aft, so after TAA every reflection smears vertically into a long
            # streak while staying sharp sideways.
            sf, _ = noise(nt, comb_xyz(nt, math_(nt, 'MULTIPLY', U, 0.8), math_(nt, 'MULTIPLY', V, 90.0), 0.0),
                          scale=1.0, detail=3.0, rough=0.6)
            sfw = math_(nt, 'MULTIPLY', sf, wet)
            nrm = bump(nt, sfw, strength=0.35 * streak, distance=0.004, normal=nrm)
        if ripples > 0:
            t = time_value(nt)
            vo = voronoi(nt, comb_xyz(nt, U, V, math_(nt, 'MULTIPLY', t, 0.9)), scale=2.2,
                         feature='F1', dims='3D')
            d = vo['Distance']
            ring = math_(nt, 'SINE', math_(nt, 'MULTIPLY', math_(nt, 'SUBTRACT', d, math_(nt, 'MULTIPLY', t, 0.0)), 60.0))
            fade = maprange(nt, d, 0.0, 0.3, 1.0, 0.0)
            rh = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', ring, fade), puddle)
            nrm = bump(nt, rh, strength=ripples * 0.15, distance=0.002, normal=nrm)
        p = _principled(nt, base=col, rough=rough, normal=nrm, spec=0.55, ior=1.4)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        _web(m, base=(0.02, 0.021, 0.025), rough=0.12)
        return m

    @staticmethod
    def varnished_wood(name='PK_Wood', light=(0.42, 0.22, 0.09), dark=(0.16, 0.07, 0.025),
                       scale=1.0, axis='X', varnish=1.0, roughness=0.42, planks=0.0):
        """Glossy varnished wood: distorted ring/grain pattern along `axis` (object
        coordinates, meters), clear coat on top. planks > 0 adds board seams of that width."""
        m, nt, out = _new_mat(name)
        co = texcoord(nt, 'Object')
        if axis == 'Y':
            co = vmath(nt, 'MULTIPLY', co, (1, 1, 1))
            co = comb_xyz(nt, sep_xyz(nt, co)[1], sep_xyz(nt, co)[0], sep_xyz(nt, co)[2])
        elif axis == 'Z':
            co = comb_xyz(nt, sep_xyz(nt, co)[2], sep_xyz(nt, co)[1], sep_xyz(nt, co)[0])
        x, y, z = sep_xyz(nt, co)
        stretched = comb_xyz(nt, math_(nt, 'MULTIPLY', x, 0.08 / scale), math_(nt, 'MULTIPLY', y, 1.0 / scale),
                             math_(nt, 'MULTIPLY', z, 1.0 / scale))
        nf, _ = noise(nt, stretched, scale=3.0, detail=4.0, rough=0.6, distortion=0.4)
        wave = node(nt, 'ShaderNodeTexWave', wave_type='RINGS', rings_direction='X',
                    wave_profile='SAW')
        _set(nt, wave.inputs['Vector'], vmath(nt, 'ADD', stretched, vmath(nt, 'SCALE', (0, 1, 1), scale=nf)))
        wave.inputs['Scale'].default_value = 6.0
        wave.inputs['Distortion'].default_value = 5.0
        wave.inputs['Detail'].default_value = 3.0
        g = math_(nt, 'MULTIPLY', wave.outputs['Factor'], nf)
        fine, _ = noise(nt, comb_xyz(nt, math_(nt, 'MULTIPLY', x, 0.5 / scale), math_(nt, 'MULTIPLY', y, 40.0 / scale),
                                     math_(nt, 'MULTIPLY', z, 40.0 / scale)), scale=4.0, detail=3.0)
        g = math_(nt, 'ADD', math_(nt, 'MULTIPLY', g, 0.75), math_(nt, 'MULTIPLY', fine, 0.35))
        col = mix_col(nt, maprange(nt, g, 0.15, 0.75), dark, light)
        if planks > 0:
            seam = math_(nt, 'FRACT', math_(nt, 'DIVIDE', y, planks))
            seam = math_(nt, 'MINIMUM', seam, math_(nt, 'SUBTRACT', 1.0, seam))
            sm = maprange(nt, seam, 0.0, 0.004 / planks, 1.0, 0.0)
            col = mix_col(nt, sm, col, vmath(nt, 'SCALE', dark, scale=0.4))
        e = _edge(nt)
        col = mix_col(nt, math_(nt, 'MULTIPLY', e, 0.25), col, light)
        rv = maprange(nt, fine, 0.3, 0.7, roughness * 0.8, roughness * 1.2)
        nrm = bump(nt, fine, strength=0.06, distance=0.002)
        p = _principled(nt, base=col, rough=rv, normal=nrm, coat=varnish,
                        coat_rough=maprange(nt, nf, 0.3, 0.7, 0.03, 0.08), ior=1.5)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        _web(m, base=tuple((a + b) / 2 for a, b in zip(light, dark)), rough=0.15)
        return m

    @staticmethod
    def toy_plastic(color=(0.8, 0.15, 0.1), name=None, roughness=0.3, coat=0.25, sss=0.12,
                    variation=0.05, edge_light=0.15):
        """Chunky toy plastic: soft subsurface, faint orange-peel, roughness variation and
        brighter worn edges (pk_edge)."""
        m, nt, out = _new_mat(name or 'PK_Plastic_%02x%02x%02x' % tuple(int(c * 255) for c in color[:3]))
        co = texcoord(nt, 'Object')
        col = _jitter_color(nt, color, variation, co, scale=2.5)
        e = _edge(nt)
        col = mix_col(nt, math_(nt, 'MULTIPLY', e, edge_light), col, (1, 1, 1), blend='SCREEN')
        rf, _ = noise(nt, co, scale=9.0, detail=3.0)
        rv = maprange(nt, rf, 0.3, 0.7, roughness * 0.8, roughness * 1.25)
        rv = math_(nt, 'ADD', rv, math_(nt, 'MULTIPLY', e, 0.12))
        pf, _ = noise(nt, co, scale=180.0, detail=1.0)
        nrm = bump(nt, pf, strength=0.025, distance=0.001)
        p = _principled(nt, base=col, rough=rv, normal=nrm, coat=coat, coat_rough=0.12, sss=sss,
                        sss_radius=(0.4, 0.2, 0.12), sss_scale=0.05)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        _web(m, base=color, rough=roughness)
        return m

    @staticmethod
    def painted_wood(color=(0.2, 0.35, 0.6), name=None, wear=0.35, under=(0.32, 0.2, 0.11),
                     roughness=0.55, brush_axis='Z'):
        """Painted wood with brush-stroke normal, roughness variation and worn edges that
        reveal bare wood (pk_edge x noise)."""
        m, nt, out = _new_mat(name or 'PK_Painted_%02x%02x%02x' % tuple(int(c * 255) for c in color[:3]))
        co = texcoord(nt, 'Object')
        x, y, z = sep_xyz(nt, co)
        if brush_axis == 'Z':
            st = comb_xyz(nt, math_(nt, 'MULTIPLY', x, 30.0), math_(nt, 'MULTIPLY', y, 30.0), math_(nt, 'MULTIPLY', z, 1.5))
        else:
            st = comb_xyz(nt, math_(nt, 'MULTIPLY', x, 1.5), math_(nt, 'MULTIPLY', y, 30.0), math_(nt, 'MULTIPLY', z, 30.0))
        bf, _ = noise(nt, st, scale=2.0, detail=3.0)
        col = _jitter_color(nt, color, 0.07, co, scale=1.8)
        wn, _ = noise(nt, co, scale=14.0, detail=5.0, rough=0.65)
        e = _edge(nt)
        wm = maprange(nt, math_(nt, 'ADD', math_(nt, 'MULTIPLY', e, wear * 1.6), math_(nt, 'MULTIPLY', wn, 0.6)),
                      0.78, 0.86)
        col = mix_col(nt, wm, col, under)
        rv = mix_f(nt, wm, maprange(nt, bf, 0.3, 0.7, roughness * 0.85, roughness * 1.1), 0.75)
        nrm = bump(nt, math_(nt, 'ADD', bf, math_(nt, 'MULTIPLY', wm, -0.6)), strength=0.08, distance=0.003)
        p = _principled(nt, base=col, rough=rv, normal=nrm)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        _web(m, base=color, rough=roughness)
        return m

    @staticmethod
    def clay(color=(0.55, 0.5, 0.62), name=None, roughness=0.85, bumps=0.35, grime=0.35,
             variation=0.08, scale=1.0):
        """Clay / plaster / stucco: multi-scale colour variation, stucco bumps, grime in
        crevices (AO node) and toward the ground."""
        m, nt, out = _new_mat(name or 'PK_Clay_%02x%02x%02x' % tuple(int(c * 255) for c in color[:3]))
        co = texcoord(nt, 'Object')
        col = _jitter_color(nt, color, variation, co, scale=0.9 / scale)
        sf, _ = noise(nt, co, scale=22.0 / scale, detail=6.0, rough=0.62)
        sv = voronoi(nt, co, scale=6.0 / scale, feature='SMOOTH_F1')
        ao = node(nt, 'ShaderNodeAmbientOcclusion', samples=8)
        ao.inputs['Distance'].default_value = 0.6
        occ = maprange(nt, ao.outputs['AO'], 0.3, 1.0, 1.0 - grime, 1.0)
        z = sep_xyz(nt, node(nt, 'ShaderNodeNewGeometry').outputs['Position'])[2]
        zg = maprange(nt, z, 0.0, 1.2, 1.0 - grime * 0.6, 1.0)
        col = vmath(nt, 'SCALE', col, scale=math_(nt, 'MULTIPLY', occ, zg))
        e = _edge(nt)
        col = mix_col(nt, math_(nt, 'MULTIPLY', e, 0.18), col, (1, 1, 1), blend='SCREEN')
        h = math_(nt, 'ADD', math_(nt, 'MULTIPLY', sf, 0.6), math_(nt, 'MULTIPLY', sv['Distance'], 0.4))
        nrm = bump(nt, h, strength=bumps * 0.35, distance=0.01)
        rv = maprange(nt, sf, 0.3, 0.7, roughness * 0.9, min(1.0, roughness * 1.08))
        p = _principled(nt, base=col, rough=rv, normal=nrm, spec=0.4)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        _web(m, base=color, rough=roughness)
        return m

    plaster = clay

    @staticmethod
    def metal(color=(0.8, 0.75, 0.65), name=None, roughness=0.3, scratches=0.3, dirt=0.15):
        m, nt, out = _new_mat(name or 'PK_Metal_%02x%02x%02x' % tuple(int(c * 255) for c in color[:3]))
        co = texcoord(nt, 'Object')
        x, y, z = sep_xyz(nt, co)
        sc_ = comb_xyz(nt, math_(nt, 'MULTIPLY', x, 80.0), math_(nt, 'MULTIPLY', y, 2.0), math_(nt, 'MULTIPLY', z, 80.0))
        sf, _ = noise(nt, sc_, scale=3.0, detail=4.0)
        df, _ = noise(nt, co, scale=3.0, detail=3.0)
        rv = math_(nt, 'ADD', roughness, math_(nt, 'MULTIPLY', maprange(nt, sf, 0.4, 0.7), scratches * 0.25))
        col = vmath(nt, 'SCALE', color, scale=maprange(nt, df, 0.3, 0.7, 1.0 - dirt, 1.0))
        nrm = bump(nt, sf, strength=0.03 * scratches, distance=0.001)
        p = _principled(nt, base=col, rough=rv, metal=1.0, normal=nrm)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        _web(m, base=color, rough=roughness, metal=1.0)
        return m

    @staticmethod
    def glass(color=(0.9, 0.95, 1.0), name='PK_Glass', roughness=0.02, ior=1.45):
        m, nt, out = _new_mat(name)
        m.use_raytrace_refraction = True
        p = _principled(nt, base=color, rough=roughness, ior=ior, transmission=1.0)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        _web(m, base=color, rough=roughness, transmission=1.0, alpha=0.25)
        return m

    @staticmethod
    def lit_window(color=(1.0, 0.62, 0.28), strength=6.0, name=None, frame_color=(0.05, 0.04, 0.04),
                   mullions=(2, 2), frame_w=0.07, mullion_w=0.035, variation=0.45, curtains=0.35,
                   unlit_color=(0.01, 0.012, 0.02), hue_shift=0.08):
        """Emissive window for quads with UV 0..1 (geo.window_panel): frame and mullions,
        interior glow with a warm hot spot, curtain/plant silhouettes and per-window
        brightness/hue variation from the face attribute pk_rand (> 1 means unlit)."""
        m, nt, out = _new_mat(name or 'PK_Window_%02x%02x%02x' % tuple(int(c * 255) for c in color[:3]))
        uv = node(nt, 'ShaderNodeUVMap', uv_map='UVMap').outputs[0]
        U, V, _ = sep_xyz(nt, uv)
        rnd = attr(nt, 'pk_rand')
        oi = node(nt, 'ShaderNodeObjectInfo').outputs['Random']
        r = math_(nt, 'FRACT', math_(nt, 'ADD', rnd, math_(nt, 'MULTIPLY', oi, 0.37)))
        lit = math_(nt, 'LESS_THAN', rnd, 1.0)

        def band(c, w):
            return math_(nt, 'LESS_THAN', math_(nt, 'ABSOLUTE', c), w)
        fr = math_(nt, 'MAXIMUM',
                   math_(nt, 'MAXIMUM', math_(nt, 'LESS_THAN', U, frame_w), math_(nt, 'GREATER_THAN', U, 1 - frame_w)),
                   math_(nt, 'MAXIMUM', math_(nt, 'LESS_THAN', V, frame_w), math_(nt, 'GREATER_THAN', V, 1 - frame_w)))
        mx, my = mullions
        for i in range(1, mx):
            fr = math_(nt, 'MAXIMUM', fr, band(math_(nt, 'SUBTRACT', U, i / mx), mullion_w / 2))
        for i in range(1, my):
            fr = math_(nt, 'MAXIMUM', fr, band(math_(nt, 'SUBTRACT', V, i / my), mullion_w / 2))
        # interior: hotspot near top centre, darker bottom
        d = vmath(nt, 'DISTANCE', comb_xyz(nt, U, V, 0.0),
                  comb_xyz(nt, maprange(nt, r, 0, 1, 0.3, 0.7), 0.78, 0.0))
        glow = maprange(nt, d, 0.0, 0.9, 1.6, 0.45, interp='SMOOTHSTEP')
        # silhouettes: curtains at the sides / a plant blob at the bottom
        cf, _ = noise(nt, comb_xyz(nt, math_(nt, 'MULTIPLY', U, 6.0), math_(nt, 'MULTIPLY', V, 1.2), math_(nt, 'MULTIPLY', r, 30.0)),
                      scale=1.0, detail=2.0)
        side = maprange(nt, math_(nt, 'ABSOLUTE', math_(nt, 'SUBTRACT', U, 0.5)), 0.22, 0.48, 0.0, 1.0)
        sil = math_(nt, 'MULTIPLY', maprange(nt, math_(nt, 'ADD', side, math_(nt, 'MULTIPLY', cf, 0.5)), 0.7, 0.9), curtains)
        bright = maprange(nt, r, 0.0, 1.0, 1.0 - variation, 1.0 + variation * 0.6)
        hue = node(nt, 'ShaderNodeHueSaturation')
        _set(nt, hue.inputs['Color'], color)
        _set(nt, hue.inputs['Hue'], maprange(nt, r, 0, 1, 0.5 - hue_shift, 0.5 + hue_shift))
        _set(nt, hue.inputs['Saturation'], maprange(nt, r, 0, 1, 0.85, 1.1))
        e = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', glow, bright), math_(nt, 'SUBTRACT', 1.0, math_(nt, 'MULTIPLY', sil, 0.75)))
        e = math_(nt, 'MULTIPLY', math_(nt, 'MULTIPLY', e, math_(nt, 'SUBTRACT', 1.0, fr)), lit)
        es = math_(nt, 'MULTIPLY', e, strength)
        base = mix_col(nt, fr, unlit_color, frame_color)
        p = _principled(nt, base=base, rough=mix_f(nt, fr, 0.06, 0.5), emit=hue.outputs[0], emit_strength=es,
                        spec=0.6)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        # web: the panel mean of glow x (1 - frame) x (1 - 0.75 silhouette) is about 0.55 of
        # strength; faces with pk_rand >= 1 (unlit) get this non-emissive fallback at export
        _web(m, base=frame_color, rough=0.2, emit=color, emit_strength=strength * 0.55)
        m['pk_web_unlit'] = {'base': list(unlit_color)[:3], 'rough': 0.06}
        return m

    @staticmethod
    def emission(color=(1, 0.6, 0.3), strength=10.0, name=None, blink=False):
        """Pure emission. blink=True multiplies by the object colour's red channel (used by
        particles.fireflies, animated with noise)."""
        m, nt, out = _new_mat(name or 'PK_Emit_%02x%02x%02x_%d' % (tuple(int(c * 255) for c in color[:3]) + (int(strength),)))
        s = strength
        if blink:
            oc = node(nt, 'ShaderNodeObjectInfo').outputs['Color']
            r = sep_xyz(nt, oc)[0]
            s = math_(nt, 'MULTIPLY', maprange(nt, r, 0.3, 1.6, 0.0, 1.0, interp='SMOOTHSTEP'), strength)
        em = node(nt, 'ShaderNodeEmission')
        _set(nt, em.inputs['Color'], color)
        _set(nt, em.inputs['Strength'], s)
        nt.links.new(em.outputs[0], out.inputs['Surface'])
        _web(m, base=(0, 0, 0), rough=1.0, emit=color, emit_strength=strength)
        return m

    @staticmethod
    def neon_tube(color=(1.0, 0.2, 0.8), strength=14.0, name=None, core=0.55):
        """Neon tube: saturated emission with a whiter hot core where the tube faces the
        viewer, plus a faint glassy specular."""
        m, nt, out = _new_mat(name or 'PK_Neon_%02x%02x%02x' % tuple(int(c * 255) for c in color[:3]))
        lw = node(nt, 'ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.35
        facing = math_(nt, 'SUBTRACT', 1.0, lw.outputs['Facing'])
        hot = math_(nt, 'POWER', facing, 3.0)
        c = mix_col(nt, math_(nt, 'MULTIPLY', hot, core), color, (1.0, 0.95, 0.9))
        s = math_(nt, 'MULTIPLY', maprange(nt, facing, 0.0, 1.0, 0.55, 1.0), strength)
        em = node(nt, 'ShaderNodeEmission')
        _set(nt, em.inputs['Color'], c)
        _set(nt, em.inputs['Strength'], s)
        gl = node(nt, 'ShaderNodeBsdfGlossy')
        gl.inputs['Roughness'].default_value = 0.08
        add = node(nt, 'ShaderNodeAddShader')
        nt.links.new(em.outputs[0], add.inputs[0])
        mixs = node(nt, 'ShaderNodeMixShader')
        mixs.inputs[0].default_value = 0.06
        nt.links.new(gl.outputs[0], mixs.inputs[2])
        nt.links.new(mixs.outputs[0], add.inputs[1])
        nt.links.new(add.outputs[0], out.inputs['Surface'])
        _web(m, base=(0, 0, 0), rough=0.2, emit=color, emit_strength=strength)
        return m

    @staticmethod
    def ground(color=(0.05, 0.07, 0.05), name='PK_Ground', roughness=0.8, wet=0.3, scale=1.0,
               color2=None):
        """Generic natural ground (grass/dirt/sand) with patchy variation and damp areas."""
        m, nt, out = _new_mat(name)
        co = texcoord(nt, 'Object')
        f1, _ = noise(nt, co, scale=0.4 / scale, detail=3.0)
        f2, _ = noise(nt, co, scale=6.0 / scale, detail=5.0, rough=0.65)
        c2 = color2 or tuple(c * 0.55 for c in color)
        col = mix_col(nt, maprange(nt, f1, 0.35, 0.65), color, c2)
        col = vmath(nt, 'SCALE', col, scale=maprange(nt, f2, 0.3, 0.7, 0.8, 1.2))
        dm = maprange(nt, f1, 0.55, 0.7, 0.0, wet)
        rv = mix_f(nt, dm, roughness, 0.18)
        nrm = bump(nt, f2, strength=0.3, distance=0.02)
        p = _principled(nt, base=col, rough=rv, normal=nrm)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        _web(m, base=color, rough=roughness)
        return m

    @staticmethod
    def snowflake(strength=0.0):
        name = 'PK_Snowflake_%d' % int(strength * 10)
        if name in bpy.data.materials:
            return bpy.data.materials[name]
        m, nt, out = _new_mat(name)
        p = _principled(nt, base=(0.9, 0.93, 1.0), rough=0.6, sss=0.3, sss_radius=(0.5, 0.6, 0.8),
                        sss_scale=0.01, emit=(0.8, 0.88, 1.0), emit_strength=strength)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        _web(m, base=(0.9, 0.93, 1.0), rough=0.6, emit=(0.8, 0.88, 1.0), emit_strength=strength)
        return m

    @staticmethod
    def dashboard(color=(0.012, 0.012, 0.016), name='PK_Dashboard', roughness=0.35, coat=0.6,
                  coat_rough=0.14, spec=0.45):
        """Soft-touch dark dashboard: fine leather grain, roughness variation and a clear coat
        that mirrors the street at grazing angles, so the top reads as a lit rim."""
        m, nt, out = _new_mat(name)
        co = texcoord(nt, 'Object')
        gf, _ = noise(nt, co, scale=260.0, detail=3.0, rough=0.6)
        vo = voronoi(nt, co, scale=140.0, feature='F1')
        h = math_(nt, 'ADD', math_(nt, 'MULTIPLY', gf, 0.5), math_(nt, 'MULTIPLY', vo['Distance'], 0.5))
        nrm = bump(nt, h, strength=0.1, distance=0.0006)
        rf, _ = noise(nt, co, scale=3.0, detail=2.0)
        rv = maprange(nt, rf, 0.3, 0.7, roughness * 0.85, roughness * 1.15)
        e = _edge(nt)
        col = vmath(nt, 'ADD', color, vmath(nt, 'SCALE', (0.012, 0.012, 0.014), scale=e))
        p = _principled(nt, base=col, rough=rv, normal=nrm, coat=coat, coat_rough=coat_rough,
                        spec=spec)
        nt.links.new(p.outputs[0], out.inputs['Surface'])
        _web(m, base=color, rough=roughness)
        return m

    @staticmethod
    def windshield(name='PK_Windshield', reflect=0.06, dirt=0.25, rain_beads=0.0, bead_scale=55.0):
        """Car glass: almost fully transparent, with a whisper of fresnel reflection, a trace of
        smudges and optional sparse rain beads (rain_beads 0..1: small round drops that turn
        glossy, catch highlights and slightly darken what is behind them)."""
        # DITHERED, not BLENDED: a blended surface covering the frame breaks EEVEE motion
        # vectors (the whole sky gets radial zoom blur).
        m, nt, out = _new_mat(name, method='DITHERED')
        co = texcoord(nt, 'Object')
        df, _ = noise(nt, co, scale=7.0, detail=4.0, rough=0.7)
        sm = maprange(nt, df, 0.45, 0.75, 0.0, dirt)
        fr = node(nt, 'ShaderNodeFresnel')
        fr.inputs['IOR'].default_value = 1.52
        k = math_(nt, 'MULTIPLY', math_(nt, 'ADD', fr.outputs[0], 0.02), reflect / 0.06)
        k = math_(nt, 'ADD', k, math_(nt, 'MULTIPLY', sm, 0.05))
        nrm = None
        if rain_beads > 0:
            vo = voronoi(nt, co, scale=bead_scale, feature='F1')
            sz, _ = noise(nt, co, scale=bead_scale * 0.7, detail=1.0)
            rad = maprange(nt, sz, 0.35, 0.75, 0.0, 0.42 * min(1.0, rain_beads * 1.4))
            dist = vo['Distance']
            bead = math_(nt, 'LESS_THAN', dist, rad)
            hgt = math_(nt, 'MULTIPLY', bead, math_(nt, 'SQRT', math_(nt, 'MAXIMUM',
                        math_(nt, 'SUBTRACT', math_(nt, 'MULTIPLY', rad, rad), math_(nt, 'MULTIPLY', dist, dist)), 0.0)))
            nrm = bump(nt, hgt, strength=1.0, distance=0.02)
            k = math_(nt, 'ADD', k, math_(nt, 'MULTIPLY', bead, 0.35 * rain_beads))
        gl = node(nt, 'ShaderNodeBsdfGlossy')
        _set(nt, gl.inputs['Roughness'], math_(nt, 'ADD', 0.03, math_(nt, 'MULTIPLY', sm, 0.25)))
        if nrm is not None:
            _set(nt, gl.inputs['Normal'], nrm)
        tr = node(nt, 'ShaderNodeBsdfTransparent')
        tr.inputs['Color'].default_value = (0.96, 0.98, 1.0, 1)
        mx = node(nt, 'ShaderNodeMixShader')
        _set(nt, mx.inputs[0], math_(nt, 'MINIMUM', k, 0.6))
        nt.links.new(tr.outputs[0], mx.inputs[1])
        nt.links.new(gl.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs['Surface'])
        _web(m, base=(0.9, 0.95, 1.0), rough=0.05, alpha=0.04)
        return m


# ----------------------------------------------------------------------------
# Vehicle foreground
# ----------------------------------------------------------------------------

class vehicle:
    """Foreground vehicle parts, parented to the camera. The rig frame ('car frame') is
    level with the road: X right, Y forward, Z up, origin at the eye."""

    @staticmethod
    def rig(cam=None, name='VehicleRig'):
        cam = cam or ctx().camera
        e = bpy.data.objects.get(name)
        if e is not None and e.parent == cam:
            return e
        e = bpy.data.objects.new(name, None)
        _link(e)
        e.parent = cam
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.rotation_euler = (-math.radians(90.0 + cam.get('pk_pitch', 0.0)), 0.0, 0.0)
        return e

    @staticmethod
    def frame_angle(cam, frac_from_bottom):
        """Elevation angle (deg, car frame) of a screen row at `frac_from_bottom` (0 bottom
        edge .. 1 top edge) through the frame centre."""
        fov = math.radians(cam.get('pk_fov_v', 60.0))
        ndc = -1.0 + 2.0 * frac_from_bottom
        return cam.get('pk_pitch', 0.0) + math.degrees(math.atan(ndc * math.tan(fov / 2)))

    @staticmethod
    def cover_z(cam, cover, y):
        """Car-frame height z that appears at `cover` (fraction of frame height from the
        bottom) at forward distance y."""
        return y * math.tan(math.radians(vehicle.frame_angle(cam, cover)))

    @staticmethod
    def half_width(cam, y):
        """Half the visible frame width at forward distance y (car frame)."""
        fov = math.radians(cam.get('pk_fov_v', 60.0))
        return y * math.tan(fov / 2) * RES_X / RES_Y

    @staticmethod
    def collection():
        """The collection that holds every vehicle part (light-linking receiver set)."""
        c = bpy.data.collections.get('PK_Vehicle')
        if c is None:
            c = bpy.data.collections.new('PK_Vehicle')
            bpy.context.scene.collection.children.link(c)
        return c

    @staticmethod
    def attach(ob, cam=None):
        """Parent an object built in car-frame coordinates to the rig (and put it in the
        PK_Vehicle collection)."""
        r = vehicle.rig(cam)
        ob.parent = r
        ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.visible_shadow = False
        ob['pk_vehicle'] = True
        vc = vehicle.collection()
        if ob.name not in vc.objects:
            vc.objects.link(ob)
        for c in list(ob.users_collection):
            if c != vc:
                c.objects.unlink(ob)
        mark_moving(ob)
        return ob

    @staticmethod
    def roof(cam=None, y0=-1.2, y1=0.6, z=0.32, width=1.8, name='CabinRoof'):
        """Invisible cabin roof (and side pillars): casts shadows on the dashboard so moon
        and sky light do not flood it, never seen by the camera or reflections."""
        hw = width / 2
        v = [(-hw, y0, z), (hw, y0, z), (hw, y1, z), (-hw, y1, z),
             (-hw, y0, z - 0.9), (-hw, y1, z - 0.4), (hw, y0, z - 0.9), (hw, y1, z - 0.4)]
        f = [(0, 1, 2, 3), (0, 3, 5, 4), (1, 6, 7, 2)]
        ob = mesh_object(name, v, f, smooth=False)
        vehicle.attach(ob, cam)
        ob.visible_shadow = True
        ob.visible_camera = False
        ob.visible_glossy = False
        ob.visible_diffuse = False
        ob.visible_transmission = False
        ob.hide_probe_volume = True
        ob.hide_probe_sphere = True
        ob.hide_probe_plane = True
        ob['pk_noexport'] = True
        return ob

    @staticmethod
    def cabin_light(cam=None, location=(0.0, 0.85, 0.22), target=(0.0, 0.35, -0.32),
                    size=(1.4, 0.5), color=(0.42, 0.55, 1.0), energy=6.0, receivers=None,
                    name='CabinFill'):
        """Soft fill from the windshield onto the dash and wheel (car frame): stands in for
        street and sky light falling through the glass, so the dash top, the trim and the
        wheel rim read against the dark cabin. receivers: objects it may light (light
        linking, honoured by EEVEE 5.2); None = the whole PK_Vehicle collection. Keep glass
        out of it or the glass glows."""
        lo = lights.area(location, target, size=size, color=color, energy=energy, shadow=False,
                         name=name)
        lo.parent = vehicle.rig(cam)
        lo.matrix_parent_inverse = Matrix.Identity(4)
        lo.location = location
        lo.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
        lo['pk_vehicle'] = True
        lo['pk_noexport'] = True
        mark_moving(lo)
        if receivers is None:
            rc = vehicle.collection()
        else:
            rc = bpy.data.collections.new(name + '_Receivers')
            for o in receivers:
                rc.objects.link(o)
        lo.light_linking.receiver_collection = rc
        return lo

    @staticmethod
    def steering_wheel(cam=None, x=0.0, y=0.55, radius=0.19, tube=0.018, top=0.09,
                       tilt_deg=28.0, material=None, name='SteeringWheel'):
        """Steering-wheel rim (torus, car frame) whose top appears at `top` (fraction of the
        frame height from the bottom); tilt_deg leans the wheel plane back from vertical.
        With the defaults only the top arc shows, spanning the frame width."""
        cam = cam or ctx().camera
        wm = material or mat.dashboard(color=(0.008, 0.008, 0.01), roughness=0.42, coat=0.35,
                                       coat_rough=0.25, spec=0.5, name='PK_Wheel')
        t = math.radians(tilt_deg)
        top_y = y - (radius + tube) * math.sin(t)
        zt = vehicle.cover_z(cam, top, top_y)
        cz = zt - (radius + tube) * math.cos(t)
        pts = [(x + radius * math.cos(2 * math.pi * i / 96), 0.0, radius * math.sin(2 * math.pi * i / 96))
               for i in range(97)]
        wh = geo.tube_along(pts, radius=tube, segments=14, material=wm, name=name, caps=False)
        wh.location = (0.0, y, cz)
        wh.rotation_euler = (t, 0.0, 0.0)
        vehicle.attach(wh, cam)
        return wh

    @staticmethod
    def car_dashboard(cam=None, cover=0.15, depth=0.95, width=2.4, bow=0.14,
                      color=(0.012, 0.012, 0.016), roughness=0.35, coat=0.6, coat_rough=0.14,
                      nose_radius=0.05, trim=True, trim_color=(0.32, 0.33, 0.36),
                      trim_roughness=0.16, steering_wheel=True, wheel_x=0.0, wheel_y=0.55,
                      wheel_radius=0.19, wheel_tube=0.018, wheel_top=0.09, roof=True,
                      windshield=True, windshield_reflect=0.06, windshield_dirt=0.25,
                      rain_beads=0.0, cabin_light=6.0, cabin_color=(0.42, 0.55, 1.0),
                      material=None, name='Dashboard'):
        """Rounded dark dashboard whose top edge covers the bottom `cover` (0.12..0.18) of the
        frame at the centre, bowing down toward the sides (bow, m). The coated soft-touch top
        mirrors the street at grazing angles; a thin satin trim strip at the windscreen base
        catches a bright rim line; a steering-wheel rim (driver's view: centred, top at
        wheel_top of the frame); windshield glass with a whisper of reflection and optional
        rain beads; an invisible roof that keeps sky and moon light off the dash; a cool
        cabin fill light (W) linked to the vehicle only. Returns a dict of the parts."""
        cam = cam or ctx().camera
        vehicle.rig(cam)
        m = material or mat.dashboard(color=color, roughness=roughness, coat=coat,
                                      coat_rough=coat_rough)
        yc = depth + bow
        z_top = vehicle.cover_z(cam, cover, yc - nose_radius)
        r = nose_radius
        sec = [(-0.47, z_top - 0.80), (-0.45, z_top - 0.30), (-0.42, z_top - 0.06),
               (-0.38, z_top - 0.015), (-0.30, z_top)]
        for i in range(1, 5):
            sec.append((-0.30 + (0.30 - r) * i / 5, z_top + 0.004 * math.sin(math.pi * i / 5)))
        for i in range(0, 9):
            a = math.pi / 2 - math.pi * 0.85 * i / 8
            sec.append((-r + r * math.cos(a), z_top - r + r * math.sin(a)))
        sec.append((0.01, z_top - r * 2.2))
        sec.append((-0.02, z_top - 0.25))
        nx = 64
        verts, faces = [], []
        ns = len(sec)

        def edge_y(x):
            f = (x / (width / 2)) ** 2
            return yc - bow * f - 0.06 * f * f, -0.05 * f * f

        for i in range(nx + 1):
            x = -width / 2 + width * i / nx
            ye, zd = edge_y(x)
            for (dy, dz) in sec:
                verts.append((x, ye + dy, dz + zd))
        for i in range(nx):
            for j in range(ns - 1):
                a = i * ns + j
                faces.append((a, a + ns, a + ns + 1, a + 1))
        dash = mesh_object(name, verts, faces, material=m, smooth=True)
        dash.data.set_sharp_from_angle(angle=math.radians(70))
        edge_mask(dash, gain=4.0)
        vehicle.attach(dash, cam)
        parts = {'dashboard': dash}
        if trim:
            tm = mat.metal(trim_color, roughness=trim_roughness, scratches=0.1, dirt=0.1,
                           name='PK_DashTrim')
            pts = []
            for i in range(nx + 1):
                x = -width / 2 * 0.98 + width * 0.98 * i / nx
                ye, zd = edge_y(x)
                # just behind the nose crest, sitting on the top skin
                pts.append((x, ye - r * 0.55, z_top + zd + 0.002))
            tr = geo.tube_along(pts, radius=0.006, segments=8, material=tm, name=name + 'Trim',
                                caps=True)
            vehicle.attach(tr, cam)
            parts['trim'] = tr
        if roof:
            parts['roof'] = vehicle.roof(cam, y0=-1.2, y1=yc + 0.7, z=0.32, width=1.8)
        if steering_wheel:
            parts['wheel'] = vehicle.steering_wheel(cam, x=wheel_x, y=wheel_y, radius=wheel_radius,
                                                    tube=wheel_tube, top=wheel_top)
        if windshield:
            gm = mat.windshield(reflect=windshield_reflect, dirt=windshield_dirt,
                                rain_beads=rain_beads)
            y0 = yc + 0.02
            z0 = z_top - 0.02
            rake = math.radians(58)
            L = 2.2
            v = [(-1.6, y0, z0), (1.6, y0, z0),
                 (1.6, y0 - L * math.sin(rake), z0 + L * math.cos(rake)),
                 (-1.6, y0 - L * math.sin(rake), z0 + L * math.cos(rake))]
            ws = mesh_object('Windshield', v, [(0, 1, 2, 3)], material=gm, smooth=False,
                             uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
            vehicle.attach(ws, cam)
            ws.visible_shadow = False
            ws['pk_noexport'] = True
            exclude_from_lights(ws)
            parts['windshield'] = ws
        if cabin_light > 0:
            rec = [p for k, p in parts.items() if k in ('dashboard', 'trim', 'wheel')]
            parts['cabin_light'] = vehicle.cabin_light(cam, location=(0.0, yc - 0.1, z_top + 0.5),
                                                       target=(0.0, wheel_y, z_top - 0.05),
                                                       color=cabin_color, energy=cabin_light,
                                                       receivers=rec)
        return parts


# ----------------------------------------------------------------------------
# Web export
# ----------------------------------------------------------------------------

def _web_materials():
    """Flatten every material to constant Principled inputs for glTF (uses m['pk_web'])."""
    for m in bpy.data.materials:
        w = m.get('pk_web')
        if w is None or m.node_tree is None:
            continue
        w = dict(w)
        nt = m.node_tree
        nt.nodes.clear()
        out = node(nt, 'ShaderNodeOutputMaterial')
        p = node(nt, 'ShaderNodeBsdfPrincipled')
        p.inputs['Base Color'].default_value = list(w['base']) + [1.0]
        p.inputs['Roughness'].default_value = w['rough']
        p.inputs['Metallic'].default_value = w['metal']
        p.inputs['Emission Color'].default_value = list(w['emit']) + [1.0]
        p.inputs['Emission Strength'].default_value = w['emit_strength']
        p.inputs['Transmission Weight'].default_value = w.get('transmission', 0.0)
        if w.get('coat', 0.0) > 0:
            p.inputs['Coat Weight'].default_value = w['coat']
            p.inputs['Coat Roughness'].default_value = w.get('coat_rough', 0.03)
        if w['alpha'] < 1.0:
            p.inputs['Alpha'].default_value = w['alpha']
            m.surface_render_method = 'BLENDED'
        nt.links.new(p.outputs[0], out.inputs['Surface'])


def _web_unlit_windows(objs):
    """Export only: faces whose float face attribute pk_rand is >= 1 (unlit windows) and whose
    material carries m['pk_web_unlit'] (mat.lit_window) move to a non-emissive copy of that
    material, so the flat web fallback does not light every window. Returns the face count."""
    done, made, n = set(), {}, 0
    for o in objs:
        if o.type != 'MESH' or o.data.name_full in done:
            continue
        me = o.data
        done.add(me.name_full)
        a = me.attributes.get('pk_rand')
        if a is None or a.domain != 'FACE' or a.data_type != 'FLOAT' or not len(me.polygons):
            continue
        slots = [i for i, mm in enumerate(me.materials) if mm is not None and mm.get('pk_web_unlit') is not None]
        if not slots:
            continue
        rnd = np.empty(len(me.polygons), np.float32)
        a.data.foreach_get('value', rnd)
        mi = np.empty(len(me.polygons), np.int32)
        me.polygons.foreach_get('material_index', mi)
        hit = 0
        for i in slots:
            faces = (mi == i) & (rnd >= 1.0)
            if not faces.any():
                continue
            src = me.materials[i]
            um = made.get(src.name_full)
            if um is None:
                w = dict(src['pk_web_unlit'])
                um = bpy.data.materials.new(src.name + '_unlit')
                _web(um, base=tuple(w['base']), rough=float(w.get('rough', 0.06)))
                made[src.name_full] = um
            me.materials.append(um)
            mi[faces] = len(me.materials) - 1
            hit += int(faces.sum())
        if hit:
            me.polygons.foreach_set('material_index', mi)
            me.update()
            n += hit
    return n


# glTF has no area lights. For the export each AREA light object gets a stand-in light
# datablock (the object stays, so name, position, orientation, parent, animation and custom
# properties carry over; the original data is put back afterwards):
#   SPOT (default): power x 4, cone = the area's spread (a hemisphere at 180 deg), blend 1.
#     A Lambertian panel of power P has on-axis intensity P / pi; a Blender spot P_s / (4 pi).
#     The glTF cone falloff smoothstep(0, 1, cos) stays within 0.1 of the panel's cos.
#   POINT (o['pk_web_point']): power x 2, the panel's intensity 60 deg off its axis.
#   SUN (o['pk_web_sun'] = W/m^2): for panels far larger than their distance to the subject.
# o['pk_web_energy'] (W) replaces the converted power of a spot or point stand-in.
# glTF has no light linking either: a stand-in for a light that lights only the objects it
# includes (e.g. a rim light linked to one figure) gets o['pk_range'] = 1.25 x the distance to
# the far corner of those objects at the current frame, unless the film set pk_range itself.
AREA_SPOT_K = 4.0
AREA_POINT_K = 2.0


def _light_receivers(o):
    """Objects an include-linked light is limited to, or None when it lights everything
    (no receiver collection, or one with excluded members only)."""
    rc = o.light_linking.receiver_collection
    if rc is None:
        return None
    inc = [ob for ob, co in zip(rc.objects, rc.collection_objects)
           if co.light_linking.link_state == 'INCLUDE']
    for ch, cc in zip(rc.children, rc.collection_children):
        if cc.light_linking.link_state == 'INCLUDE':
            inc += list(ch.all_objects)
    return inc or None


def _web_area_standins(objs):
    swaps = []
    bpy.context.view_layer.update()      # world matrices of objects made since the last update
    for o in objs:
        if o.type != 'LIGHT' or o.data.type != 'AREA':
            continue
        if o.hide_render and not o.get('pk_webonly'):
            continue
        a = o.data
        sun = o.get('pk_web_sun')
        if sun is not None:
            ld = bpy.data.lights.new(a.name + '_web', 'SUN')
            ld.energy = float(sun)
            ld.angle = math.radians(1.0)
        elif o.get('pk_web_point'):
            ld = bpy.data.lights.new(a.name + '_web', 'POINT')
            ld.energy = a.energy * AREA_POINT_K
        else:
            ld = bpy.data.lights.new(a.name + '_web', 'SPOT')
            ld.energy = a.energy * AREA_SPOT_K
            ld.spot_size = min(max(a.spread, math.radians(1.0)), math.pi)
            ld.spot_blend = 1.0
        if sun is None and o.get('pk_web_energy') is not None:
            ld.energy = float(o['pk_web_energy'])
        if ld.energy <= 0:
            bpy.data.lights.remove(ld)
            continue
        ld.color = a.color
        ld.specular_factor = a.specular_factor
        ld.diffuse_factor = a.diffuse_factor
        ld.use_shadow = a.use_shadow
        if a.animation_data and a.animation_data.action:
            log('web: area light %s animates its data; its stand-in is static' % o.name)
        auto = False
        rec = _light_receivers(o) if sun is None and o.get('pk_range') is None else None
        if rec:
            p = o.matrix_world.translation
            far, fo = max(((p - ob.matrix_world @ Vector(c)).length, ob.name)
                          for ob in rec for c in ob.bound_box)
            o['pk_range'] = round(1.25 * far, 2)
            auto = True
            log('web: %s lights only %d linked objects (farthest %s); stand-in range %.1f m'
                % (o.name, len(rec), fo, o['pk_range']))
        o.data = ld
        swaps.append((o, a, auto))
    return swaps


def _glb_postprocess(path):
    """Rewrite scatter groups (an Empty whose children are static leaf nodes sharing one mesh)
    as single EXT_mesh_gpu_instancing nodes. Done as a post-pass because the Blender 5.2
    exporter's own export_gpu_instances option corrupts animation channel node indices
    (the camera animation points past the node list) and drops animated instances.
    Also copies a light node's extras.pk_range (m) into its KHR_lights_punctual range, which
    three.js's GLTFLoader turns into light.distance (the light fades to zero there)."""
    import struct
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, ver, total = struct.unpack('<III', data[:12])
    jl, jt = struct.unpack('<II', data[12:20])
    j = json.loads(data[20:20 + jl])
    off = 20 + jl
    bl, bt = struct.unpack('<II', data[off:off + 8])
    binb = bytearray(data[off + 8:off + 8 + bl])
    nodes = j['nodes']
    plights = j.get('extensions', {}).get('KHR_lights_punctual', {}).get('lights', [])
    lext = [e for e in (n.get('extensions', {}).get('KHR_lights_punctual') for n in nodes) if e]
    refs = {}
    for e in lext:
        refs[e['light']] = refs.get(e['light'], 0) + 1
    for n in nodes:
        ext = n.get('extensions', {}).get('KHR_lights_punctual')
        rg = (n.get('extras') or {}).get('pk_range')
        if ext is None or rg is None or float(rg) <= 0 or plights[ext['light']].get('type') == 'directional':
            continue
        if refs[ext['light']] > 1:        # shared with other nodes: give this node its own copy
            refs[ext['light']] -= 1
            plights.append(dict(plights[ext['light']]))
            ext['light'] = len(plights) - 1
            refs[ext['light']] = 1
        plights[ext['light']]['range'] = float(rg)
    # merge all per-object animations into one clip called 'Scene' (play clip 0 in the viewer)
    anims = j.get('animations', [])
    if len(anims) > 1:
        merged = {'name': 'Scene', 'channels': [], 'samplers': []}
        for a in anims:
            base = len(merged['samplers'])
            merged['samplers'].extend(a['samplers'])
            for c in a['channels']:
                c = dict(c)
                c['sampler'] = c['sampler'] + base
                merged['channels'].append(c)
        j['animations'] = [merged]
    elif len(anims) == 1:
        anims[0]['name'] = 'Scene'
    animated = {c['target'].get('node') for a in j.get('animations', []) for c in a['channels']}
    groups = []
    for gi, n in enumerate(nodes):
        ch = n.get('children', [])
        if len(ch) < 2:
            continue
        ok = True
        mesh = None
        for c in ch:
            cn = nodes[c]
            if ('mesh' not in cn or cn.get('children') or 'matrix' in cn or 'camera' in cn or
                    'extensions' in cn or c in animated):
                ok = False
                break
            if mesh is None:
                mesh = cn['mesh']
            elif cn['mesh'] != mesh:
                ok = False
                break
        if ok:
            groups.append((gi, mesh, list(ch)))

    def add_accessor(arr, typ):
        while len(binb) % 4:
            binb.append(0)
        bo = len(binb)
        b = np.ascontiguousarray(arr, np.float32).tobytes()
        binb.extend(b)
        j['bufferViews'].append({'buffer': 0, 'byteOffset': bo, 'byteLength': len(b)})
        acc = {'bufferView': len(j['bufferViews']) - 1, 'componentType': 5126,
               'count': int(arr.shape[0]), 'type': typ}
        if typ == 'VEC3':
            acc['min'] = [float(x) for x in arr.min(0)]
            acc['max'] = [float(x) for x in arr.max(0)]
        j['accessors'].append(acc)
        return len(j['accessors']) - 1
    removed = set()
    for gi, mesh, ch in groups:  # noqa: B007
        T = np.array([nodes[c].get('translation', [0, 0, 0]) for c in ch], np.float32)
        R = np.array([nodes[c].get('rotation', [0, 0, 0, 1]) for c in ch], np.float32)
        S = np.array([nodes[c].get('scale', [1, 1, 1]) for c in ch], np.float32)
        attrs = {'TRANSLATION': add_accessor(T, 'VEC3'), 'ROTATION': add_accessor(R, 'VEC4'),
                 'SCALE': add_accessor(S, 'VEC3')}
        nodes.append({'name': nodes[gi].get('name', 'group') + '_instances', 'mesh': mesh,
                      'extensions': {'EXT_mesh_gpu_instancing': {'attributes': attrs}}})
        nodes[gi]['children'] = [len(nodes) - 1]
        removed.update(ch)
    remap, new_nodes = {}, []
    for i, n in enumerate(nodes):
        if i in removed:
            continue
        remap[i] = len(new_nodes)
        new_nodes.append(n)
    for n in new_nodes:
        if 'children' in n:
            n['children'] = [remap[c] for c in n['children'] if c in remap]
    j['nodes'] = new_nodes
    for sc in j.get('scenes', []):
        sc['nodes'] = [remap[c] for c in sc['nodes'] if c in remap]
    for a in j.get('animations', []):
        for c in a['channels']:
            if 'node' in c['target']:
                c['target']['node'] = remap[c['target']['node']]
    used = j.setdefault('extensionsUsed', [])
    if 'EXT_mesh_gpu_instancing' not in used:
        used.append('EXT_mesh_gpu_instancing')
    while len(binb) % 4:
        binb.append(0)
    j['buffers'][0]['byteLength'] = len(binb)
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js
    out += struct.pack('<II', len(binb), 0x004E4942) + bytes(binb)
    with open(path, 'wb') as fh:
        fh.write(out)
    return len(groups)


def export_web(c):
    os.makedirs(c.web_dir, exist_ok=True)
    t0 = time.time()
    sky.export_json(os.path.join(c.web_dir, 'sky.json'))
    log('sky.json written (%.1f s)' % (time.time() - t0))
    # everything below edits the scene for the export only: main() runs it after any stills
    # or frames, so the film render never sees it
    nu = _web_unlit_windows([o for o in bpy.context.scene.objects
                             if not o.get('pk_noexport') and o.name not in c.web_skip])
    _web_materials()
    for o in bpy.context.scene.objects:
        o.select_set(False)
    sel = []
    for o in bpy.context.scene.objects:
        if o.get('pk_noexport') or o.name in c.web_skip:
            continue
        if o.type in ('MESH', 'CURVE', 'CAMERA', 'LIGHT', 'EMPTY'):
            # pk_webonly: a mesh hidden from the film render that the web edition still gets
            if o.type == 'MESH' and o.hide_render and not o.get('pk_webonly'):
                continue
            if o.type == 'MESH' and any(ms.material and ms.material.node_tree and
                                        any(n.type == 'OUTPUT_MATERIAL' and n.inputs['Volume'].is_linked
                                            for n in ms.material.node_tree.nodes) for ms in o.material_slots):
                continue
            o.hide_viewport = False
            o.select_set(True)
            sel.append(o)
    swaps = _web_area_standins(sel)
    # KHR_lights_punctual has no specular factor: carry Blender's as node extras pk_specular
    # (the viewer scales that light's direct specular by it); a value the film set wins
    spec = []
    for o in sel:
        if o.type == 'LIGHT' and o.get('pk_specular') is None and abs(o.data.specular_factor - 1.0) > 1e-6:
            o['pk_specular'] = round(float(o.data.specular_factor), 4)
            spec.append(o)
    log('web: %d area light stand-ins (%s), %d lights with pk_specular, %d unlit window faces'
        % (len(swaps), ', '.join(sorted({o.data.type for o, _, _ in swaps})) or '-', len(spec), nu))
    path = os.path.join(c.web_dir, 'scene.glb')
    t0 = time.time()
    # the exporter samples the scene frame range, which --frames narrows to the chunk just
    # rendered; the web edition always needs the whole film
    sc = bpy.context.scene
    keep_range = (sc.frame_start, sc.frame_end)
    sc.frame_start, sc.frame_end = c.frame_start, c.frame_end
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_cameras=True,
        export_lights=True, export_animations=True, export_frame_range=True,
        export_force_sampling=True, export_apply=True, export_gpu_instances=False,
        export_yup=True, export_materials='EXPORT', export_image_format='JPEG',
        export_extras=True, export_optimize_animation_size=True, export_animation_mode='SCENE',
        export_import_convert_lighting_mode='SPEC')
    sc.frame_start, sc.frame_end = keep_range
    for o in spec:
        del o['pk_specular']
    for o, a, auto in swaps:
        ld, o.data = o.data, a
        bpy.data.lights.remove(ld)
        if auto:
            del o['pk_range']
    ng = _glb_postprocess(path)
    mb = os.path.getsize(path) / 1e6
    log('scene.glb %.1f MB, %d objects, %d instanced groups (%.1f s)' % (mb, len(sel), ng, time.time() - t0))
    if mb > 60:
        log('WARNING: scene.glb exceeds 60 MB')
    return path


# ----------------------------------------------------------------------------
# Entry point
# ----------------------------------------------------------------------------

def _parse_args(argv):
    a = argv[argv.index('--') + 1:] if '--' in argv else []
    out = dict(stills=[], scale=1.0, frames=None, samples=None, export_web=False, save_blend=False)
    i = 0
    while i < len(a):
        k = a[i]
        if k == '--stills':
            out['stills'] = [float(x) for x in a[i + 1].split(',') if x.strip()]
            i += 2
        elif k == '--scale':
            out['scale'] = float(a[i + 1])
            i += 2
        elif k == '--frames':
            v = a[i + 1]
            if '-' in v:
                f0, f1 = v.split('-')
                out['frames'] = (int(f0), int(f1))
            else:
                out['frames'] = (int(v), int(v))
            i += 2
        elif k == '--samples':
            out['samples'] = int(a[i + 1])
            i += 2
        elif k == '--export-web':
            out['export_web'] = True
            i += 1
        elif k == '--save-blend':
            out['save_blend'] = True
            i += 1
        else:
            raise SystemExit('povkit: unknown argument %r' % k)
    return out


def _tname(t):
    s = ('%f' % t).rstrip('0')
    return 't' + (s + '0' if s.endswith('.') else s)


def main(slug, build_fn):
    """Build the film scene with build_fn(ctx), then do what the CLI args ask:
    --stills 1.0,4.0  --scale 0.5  --frames 1-336  --samples N  --export-web  --save-blend"""
    args = _parse_args(sys.argv)
    _reset_scene()
    sky.reset()
    _STATE['comp_done'] = False
    c = Ctx(slug, args)
    _STATE['ctx'] = c
    render.setup()
    t0 = time.time()
    build_fn(c)
    if not _STATE['comp_done']:
        comp.setup()
    if _SKY.world is None:
        sky.galactic()
    _apply_light_exclusions()
    sc = bpy.context.scene
    sc.render.resolution_percentage = int(round(args['scale'] * 100))
    _apply_scale_to_px_inputs(sc.render.resolution_percentage / 100.0)
    if args['samples']:
        sc.eevee.taa_render_samples = args['samples']
    log('built %s in %.1f s (%d objects)' % (slug, time.time() - t0, len(sc.objects)))
    if args['save_blend']:
        p = os.path.join(c.film_dir, slug + '.blend')
        os.makedirs(c.film_dir, exist_ok=True)
        for img in bpy.data.images:
            if img.source == 'GENERATED' or (img.packed_file is None and not img.filepath):
                try:
                    img.pack()
                except Exception:
                    pass
        bpy.ops.wm.save_as_mainfile(filepath=p, compress=True)
        log('saved', p)
    if args['stills']:
        d = os.path.join(c.film_dir, 'stills')
        os.makedirs(d, exist_ok=True)
        for t in args['stills']:
            f = c.t2f(t)
            fi = int(math.floor(f))
            sc.frame_set(fi, subframe=f - fi)
            sc.render.filepath = os.path.join(d, _tname(t) + '.png')
            t1 = time.time()
            bpy.ops.render.render(write_still=True)
            log('still t=%s frame=%.2f -> %s (%.1f s)' % (t, f, sc.render.filepath, time.time() - t1))
    if args['frames']:
        f0, f1 = args['frames']
        os.makedirs(c.render_dir, exist_ok=True)
        sc.frame_start, sc.frame_end = f0, f1
        sc.render.filepath = c.render_dir + os.sep
        t1 = time.time()
        bpy.ops.render.render(animation=True)
        n = f1 - f0 + 1
        log('frames %d-%d -> %s (%.1f s, %.1f s/frame)' % (f0, f1, c.render_dir, time.time() - t1,
                                                           (time.time() - t1) / n))
    if args['export_web']:
        export_web(c)
    return c
