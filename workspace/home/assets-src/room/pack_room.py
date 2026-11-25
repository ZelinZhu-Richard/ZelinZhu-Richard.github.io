"""Pack the raw room GLB (export_room.py) into the shipped room: two self-contained GLBs and a manifest.

    /opt/anaconda3/bin/python3 assets-src/room/pack_room.py [--raw _dev/room/ship/room_raw.glb]
                                                            [--out public/home-assets/room]

Needs only what is on this machine: numpy and Pillow (WebP) in the anaconda Python, and the meshoptimizer library
Blender ships (/Applications/Blender.app/Contents/Resources/lib/libmeshoptimizer.dylib, called through ctypes;
override with $MESHOPT_LIB). Deterministic: the same raw GLB always gives byte-identical files.

Design: two self-contained GLBs, one per texture set, with identical geometry, node, material and texture names:
    room-desktop.glb   textures at the baked size (desktop: <= ~70 MB of GPU memory with mipmaps)
    room-phone.glb     every texture at half width and height (a quarter of the memory)
The engine loads exactly one (manifest.sets.<tier>.file), so a page never downloads both. This was chosen over one
geometry GLB plus external texture folders because it is one request, one sha256, and nothing to rewrite at load
time (GLTFLoader just works); the cost is ~0.8 MB of geometry stored twice on disk, never downloaded twice. Going
from phone to desktop textures later means loading the other GLB (dropping a tier needs nothing new).

Geometry: KHR_mesh_quantization + EXT_meshopt_compression, both required (no fallback data):
- POSITION as normalized int16 relative to each mesh's own bounds. The mesh's node carries the dequantisation as
  translation (bounds centre) + uniform scale (half the largest extent): world position = node matrix x position.
  Error <= half-extent / 65534 (0.08 mm for the 10 m room shell). The far outside (Outside_Land, Skyline, Sea:
  kilometres across) keeps float positions, so the cliff next to the window does not move by a metre.
- TEXCOORD_0 as normalized uint16 (1/65535 of the atlas, ~0.02 texel at 1536).
- Triangles reordered for the vertex cache and vertices for fetch (meshoptimizer), then every buffer view is
  meshopt-encoded (vertex codec v0 + index codec v1, what EXT_meshopt_compression allows).
- In three: loader.setMeshoptDecoder(MeshoptDecoder) from three/addons/libs/meshopt_decoder.module.js;
  KHR_mesh_quantization needs nothing.
Textures: EXT_texture_webp (required, WebP only), one sampler: trilinear, clamp to edge (nothing tiles; the atlases
have their own gutters). The contact shadow's material gets alphaMode BLEND.

Writes <out>/room-desktop.glb, <out>/room-phone.glb and <out>/manifest.json (format documented in the manifest's
own "format" field and in check_room.mjs, which verifies the output with three's own meshopt decoder).
KTX2 (KHR_texture_basisu) is not done; see manifest.notes.ktx2.
"""
import argparse
import copy
import ctypes
import hashlib
import io
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.dirname(os.path.dirname(HERE))
MESHOPT_LIB = os.environ.get('MESHOPT_LIB', '/Applications/Blender.app/Contents/Resources/lib/libmeshoptimizer.dylib')

# desktop size of the objects' own images (long side; aspect kept). The baked atlases and the contact shadow ship
# at the size export_room.py baked them. Phones get half of everything.
OWN_MAX = {'Board_tex': 1536, 'Monitor_Left_Screen_tex': 1024, 'Monitor_Center_Screen_tex': 1024,
           'Monitor_Right_Screen_tex': 1024, 'Desk_Mat_tex': 1024, 'Wall_Picture_tex': 512,
           'Shelf_Frame_Photo_Image_tex': 256}
# WebP quality (Pillow / libwebp, method 6). The atlases are mostly near-black and smooth: q90 keeps the darks
# (mean abs error 0.3-0.8 of 255 where the PNG is below 40; 1.6 on the noisy far outside) at a fraction of the old
# JPEG size. Screens, board and desk mat carry
# thin coloured lines and text: q94, which at 1:1 is indistinguishable from lossless (compared side by side) at a
# quarter of its size (board 88 KB vs 381 KB). The contact shadow is alpha only: lossless, a few KB.
Q_ATLAS = 90
LOSSLESS = {'Contact_Shadow'}
Q_IMAGE = 94
QUANT_MAX_STEP = 0.0003  # metres: quantize a mesh's positions only if the int16 step is at most this
FLOAT_POSITION = set()   # filled at run time with the meshes kept as float (reported in the manifest)
EXT_MESHOPT = 'EXT_meshopt_compression'

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


# ------------------------------------------------------------------------------------------------ GLB io
def read_glb(path):
    b = open(path, 'rb').read()
    if b[:4] != b'glTF':
        raise SystemExit(f'{path}: not a GLB')
    off, J, BIN = 12, None, b''
    while off < len(b):
        ln, typ = struct.unpack_from('<II', b, off)
        off += 8
        if typ == 0x4E4F534A:
            J = json.loads(b[off:off + ln])
        elif typ == 0x004E4942:
            BIN = b[off:off + ln]
        off += ln
    return J, BIN


def write_glb(path, J, BIN):
    js = json.dumps(J, separators=(',', ':'), sort_keys=False).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    BIN = bytes(BIN) + b'\0' * ((4 - len(BIN) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(BIN)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack('<II', len(BIN), 0x004E4942))
        f.write(BIN)


def read_accessor(J, BIN, i):
    a = J['accessors'][i]
    bv = J['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']])
    n = NC[a['type']]
    stride = bv.get('byteStride', dt.itemsize * n)
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    raw = np.frombuffer(BIN, np.uint8, count=stride * (a['count'] - 1) + dt.itemsize * n, offset=start)
    out = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], n * dt.itemsize), strides=(stride, 1))
    return np.ascontiguousarray(out).view(dt).reshape(a['count'], n)


# ------------------------------------------------------------------------------------------------ meshoptimizer
class Meshopt:
    def __init__(self, path):
        self.lib = L = ctypes.CDLL(path)
        sz, vp = ctypes.c_size_t, ctypes.c_void_p
        for name, res, argt in (
                ('meshopt_encodeVertexVersion', None, [ctypes.c_int]),
                ('meshopt_encodeIndexVersion', None, [ctypes.c_int]),
                ('meshopt_encodeVertexBufferBound', sz, [sz, sz]),
                ('meshopt_encodeVertexBuffer', sz, [vp, sz, vp, sz, sz]),
                ('meshopt_encodeIndexBufferBound', sz, [sz, sz]),
                ('meshopt_encodeIndexBuffer', sz, [vp, sz, vp, sz]),
                ('meshopt_decodeVertexBuffer', ctypes.c_int, [vp, sz, sz, vp, sz]),
                ('meshopt_decodeIndexBuffer', ctypes.c_int, [vp, sz, sz, vp, sz]),
                ('meshopt_optimizeVertexCache', None, [vp, vp, sz, sz]),
                ('meshopt_optimizeVertexFetchRemap', sz, [vp, vp, sz, sz])):
            f = getattr(L, name)
            f.restype = res
            f.argtypes = argt
        L.meshopt_encodeVertexVersion(0)   # EXT_meshopt_compression: vertex codec v0
        L.meshopt_encodeIndexVersion(1)    # index codec v1 (allowed by EXT_meshopt_compression)

    @staticmethod
    def _p(a):
        return a.ctypes.data_as(ctypes.c_void_p)

    def optimize(self, idx, nverts):
        """Vertex-cache order for the triangles, then first-use order for the vertices. Returns (indices, remap):
        new_vertices[remap[i]] = old_vertices[i] for every used old vertex i."""
        idx = np.ascontiguousarray(idx, np.uint32)
        out = np.empty_like(idx)
        self.lib.meshopt_optimizeVertexCache(self._p(out), self._p(idx), idx.size, nverts)
        remap = np.empty(nverts, np.uint32)
        nu = self.lib.meshopt_optimizeVertexFetchRemap(self._p(remap), self._p(out), out.size, nverts)
        return remap[out], remap, nu

    def encode_vertices(self, data):
        data = np.ascontiguousarray(data)
        count, stride = data.shape[0], data.strides[0]
        bound = self.lib.meshopt_encodeVertexBufferBound(count, stride)
        buf = np.empty(bound, np.uint8)
        n = self.lib.meshopt_encodeVertexBuffer(self._p(buf), bound, self._p(data), count, stride)
        enc = buf[:n].tobytes()
        back = np.empty_like(data)
        eb = np.frombuffer(enc, np.uint8)
        if self.lib.meshopt_decodeVertexBuffer(self._p(back), count, stride, self._p(eb), len(enc)) != 0 or \
                back.tobytes() != data.tobytes():
            raise SystemExit('meshopt vertex round trip failed')
        return enc

    def encode_indices(self, idx, nverts, out_dtype):
        idx32 = np.ascontiguousarray(idx, np.uint32)
        bound = self.lib.meshopt_encodeIndexBufferBound(idx32.size, nverts)
        buf = np.empty(bound, np.uint8)
        n = self.lib.meshopt_encodeIndexBuffer(self._p(buf), bound, self._p(idx32), idx32.size)
        enc = buf[:n].tobytes()
        back = np.empty(idx32.size, out_dtype)
        eb = np.frombuffer(enc, np.uint8)
        if self.lib.meshopt_decodeIndexBuffer(self._p(back), idx32.size, back.itemsize, self._p(eb), len(enc)) != 0 or \
                not np.array_equal(canonical_triangles(back), canonical_triangles(idx32)):
            raise SystemExit('meshopt index round trip failed')
        return enc


def canonical_triangles(idx):
    """Triangles rotated so the smallest index comes first (winding kept): the index codec may rotate them."""
    t = np.asarray(idx, np.int64).reshape(-1, 3)
    a, b, c = t[:, 0], t[:, 1], t[:, 2]
    key = lambda x, y, z: (x << 42) | (y << 21) | z   # noqa: E731  (indices < 2^21)
    return np.minimum(np.minimum(key(a, b, c), key(b, c, a)), key(c, a, b))


# ------------------------------------------------------------------------------------------------ geometry
def pack_geometry(J, BIN, mo):
    """Quantize, optimise and meshopt-encode every primitive. Returns (streams, mesh_json, node_xforms, stats):
    streams = list of {raw, enc, count, stride, mode, target}; mesh_json = meshes with accessor placeholders."""
    streams, accessors = [], []
    meshes = copy.deepcopy(J['meshes'])
    node_of_mesh = {}
    for ni, n in enumerate(J['nodes']):
        if 'mesh' in n:
            if n['mesh'] in node_of_mesh:
                raise SystemExit('a mesh is used by two nodes; per-mesh dequantisation would be ambiguous')
            if any(k in n for k in ('translation', 'rotation', 'scale', 'matrix')):
                raise SystemExit(f'node {n.get("name")} already has a transform (export_room.py writes world space)')
            node_of_mesh[n['mesh']] = ni
    xforms = {}
    tris = verts = 0
    max_err = 0.0

    def add_stream(arr, mode, target):
        streams.append({'raw': np.ascontiguousarray(arr), 'mode': mode, 'target': target})
        return len(streams) - 1

    def add_accessor(stream, ctype, typ, count, normalized=False, mn=None, mx=None):
        a = {'bufferView': stream, 'componentType': ctype, 'count': int(count), 'type': typ}
        if normalized:
            a['normalized'] = True
        if mn is not None:
            a['min'], a['max'] = mn, mx
        accessors.append(a)
        return len(accessors) - 1

    for mi, mesh in enumerate(meshes):
        src = J['meshes'][mi]['primitives']
        P = [read_accessor(J, BIN, p['attributes']['POSITION']).astype(np.float64) for p in src]
        lo = np.min([p.min(0) for p in P], 0)
        hi = np.max([p.max(0) for p in P], 0)
        centre = (lo + hi) / 2
        half = float(max((hi - lo).max() / 2, 1e-6))
        quant = half / 32767 <= QUANT_MAX_STEP
        if quant:
            xforms[node_of_mesh[mi]] = (centre, half)
        else:
            FLOAT_POSITION.add(mesh.get('name'))
        for p, sp, pos in zip(mesh['primitives'], src, P):
            if sp.get('mode', 4) != 4:
                raise SystemExit('only triangle lists are expected')
            idx = read_accessor(J, BIN, sp['indices']).ravel().astype(np.uint32)
            uv = read_accessor(J, BIN, sp['attributes']['TEXCOORD_0']).astype(np.float64) \
                if 'TEXCOORD_0' in sp['attributes'] else None
            if set(sp['attributes']) - {'POSITION', 'TEXCOORD_0'}:
                raise SystemExit(f'unexpected attributes {sorted(sp["attributes"])}')
            idx, remap, nu = mo.optimize(idx, len(pos))
            used = remap != 0xFFFFFFFF
            npos = np.empty((nu, 3), np.float64)
            npos[remap[used]] = pos[used]
            tris += idx.size // 3
            verts += nu
            attrs = {}
            if quant:
                q = np.clip(np.round((npos - centre) / half * 32767), -32767, 32767).astype(np.int16)
                max_err = max(max_err, float(np.abs(q / 32767.0 * half + centre - npos).max()))
                q4 = np.zeros((nu, 4), np.int16)
                q4[:, :3] = q
                s = add_stream(q4, 'ATTRIBUTES', 34962)
                attrs['POSITION'] = add_accessor(s, 5122, 'VEC3', nu, True, q.min(0).tolist(), q.max(0).tolist())
            else:
                f = npos.astype(np.float32)
                s = add_stream(f, 'ATTRIBUTES', 34962)
                attrs['POSITION'] = add_accessor(s, 5126, 'VEC3', nu, False, f.min(0).tolist(), f.max(0).tolist())
            if uv is not None:
                nuv = np.empty((nu, 2), np.float64)
                nuv[remap[used]] = uv[used]
                if nuv.min() >= 0.0 and nuv.max() <= 1.0:
                    qu = np.round(nuv * 65535).astype(np.uint16)
                    s = add_stream(qu, 'ATTRIBUTES', 34962)
                    attrs['TEXCOORD_0'] = add_accessor(s, 5123, 'VEC2', nu, True)
                else:
                    s = add_stream(nuv.astype(np.float32), 'ATTRIBUTES', 34962)
                    attrs['TEXCOORD_0'] = add_accessor(s, 5126, 'VEC2', nu)
            itype = np.uint16 if nu <= 65535 else np.uint32
            s = add_stream(idx.astype(itype), 'TRIANGLES', 34963)
            streams[s]['nverts'] = nu
            p['attributes'] = attrs
            p['indices'] = add_accessor(s, 5123 if itype is np.uint16 else 5125, 'SCALAR', idx.size)
    for st in streams:
        raw = st['raw']
        if st['mode'] == 'TRIANGLES':
            st['enc'] = mo.encode_indices(raw, st['nverts'], raw.dtype)
            st['stride'] = raw.dtype.itemsize
            st['count'] = raw.size
        else:
            st['enc'] = mo.encode_vertices(raw)
            st['stride'] = raw.strides[0]
            st['count'] = raw.shape[0]
    stats = {'triangles': int(tris), 'vertices': int(verts), 'meshes': len(meshes),
             'primitives': sum(len(m['primitives']) for m in meshes),
             'positionMaxErrorMm': round(max_err * 1000, 4)}
    return streams, accessors, meshes, xforms, stats


# ------------------------------------------------------------------------------------------------ textures
def srgb_to_linear(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(a):
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)


def box_half(im):
    """Exact 2x box downsample (what a mip level is), in linear light for colour, straight for alpha."""
    a = np.asarray(im).astype(np.float64) / 255.0
    h, w = a.shape[:2]
    a = a[:h - h % 2, :w - w % 2]
    if im.mode == 'RGBA':
        col = srgb_to_linear(a[..., :3])
        al = a[..., 3:]
        both = np.concatenate([col, al], -1)
    else:
        both = srgb_to_linear(a)
    s = (both[0::2, 0::2] + both[1::2, 0::2] + both[0::2, 1::2] + both[1::2, 1::2]) / 4
    if im.mode == 'RGBA':
        out = np.concatenate([linear_to_srgb(s[..., :3]), s[..., 3:]], -1)
    else:
        out = linear_to_srgb(s)
    return Image.fromarray(np.round(out * 255).astype(np.uint8), im.mode)


def fit(w, h, long_side):
    s = min(1.0, long_side / max(w, h))
    return max(4, int(round(w * s / 4)) * 4), max(4, int(round(h * s / 4)) * 4)


def encode_webp(im, name):
    b = io.BytesIO()
    if name in LOSSLESS:
        im.save(b, 'WEBP', lossless=True, quality=100, method=6, exact=False)
    else:
        im.save(b, 'WEBP', quality=Q_ATLAS if name.startswith('LM_') else Q_IMAGE, method=6)
    return b.getvalue()


def make_textures(J, BIN):
    """{image index: {'desktop': (bytes, w, h), 'phone': (bytes, w, h)}} from the raw GLB's PNGs."""
    out = {}
    for ii, img in enumerate(J['images']):
        name = img.get('name', f'image{ii}')
        name = name[:-4] if name.lower().endswith(('.png', '.jpg')) else name
        bv = J['bufferViews'][img['bufferView']]
        data = BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        im = Image.open(io.BytesIO(data))
        im.load()
        im = im.convert('RGBA' if name == 'Contact_Shadow' else 'RGB')
        if name in OWN_MAX:
            w, h = fit(im.width, im.height, OWN_MAX[name])
            desk = im.resize((w, h), Image.LANCZOS) if (w, h) != im.size else im
        else:
            desk = im   # baked atlases and the contact shadow: as baked
        phone = box_half(desk)
        out[ii] = {'name': name}
        for tier, t in (('desktop', desk), ('phone', phone)):
            out[ii][tier] = (encode_webp(t, name), t.width, t.height)
    return out


# ------------------------------------------------------------------------------------------------ assembly
def assemble(J, streams, accessors, meshes, xforms, textures, tier):
    G = copy.deepcopy(J)
    BIN = bytearray()
    views = []
    fallback = 0

    def align(n=8):
        while len(BIN) % n:
            BIN.append(0)

    for st in streams:
        align(8)
        off = len(BIN)
        BIN += st['enc']
        fallback = (fallback + 7) // 8 * 8
        raw_len = st['count'] * st['stride']
        v = {'buffer': 1, 'byteOffset': fallback, 'byteLength': raw_len, 'target': st['target'],
             'extensions': {EXT_MESHOPT: {'buffer': 0, 'byteOffset': off, 'byteLength': len(st['enc']),
                                          'byteStride': st['stride'], 'count': st['count'], 'mode': st['mode']}}}
        if st['mode'] == 'ATTRIBUTES':
            v['byteStride'] = st['stride']
        views.append(v)
        fallback += raw_len
    images = []
    for ii, img in enumerate(J['images']):
        data, w, h = textures[ii][tier]
        align(8)
        views.append({'buffer': 0, 'byteOffset': len(BIN), 'byteLength': len(data)})
        BIN += data
        images.append({'name': textures[ii]['name'], 'mimeType': 'image/webp', 'bufferView': len(views) - 1})
    G['bufferViews'] = views
    G['accessors'] = accessors
    G['meshes'] = meshes
    G['images'] = images
    G['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
    G['textures'] = [{'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': t['source']}}}
                     for t in J['textures']]
    for ni, (c, s) in xforms.items():
        G['nodes'][ni]['translation'] = [round(float(x), 7) for x in c]
        G['nodes'][ni]['scale'] = [float(np.float32(s))] * 3
    for m in G['materials']:
        if m.get('name') == 'Contact_Shadow':
            m['alphaMode'] = 'BLEND'
    G['buffers'] = [{'byteLength': 0}, {'byteLength': fallback, 'extensions': {EXT_MESHOPT: {'fallback': True}}}]
    used = set(G.get('extensionsUsed', []))
    used |= {EXT_MESHOPT, 'KHR_mesh_quantization', 'EXT_texture_webp'}
    G['extensionsUsed'] = sorted(used)
    G['extensionsRequired'] = sorted({EXT_MESHOPT, 'KHR_mesh_quantization', 'EXT_texture_webp'})
    G['asset'] = {'version': '2.0', 'generator': 'workspace/home/assets-src/room/pack_room.py (Blender glTF exporter, '
                                                 'meshoptimizer, libwebp)'}
    align(4)
    G['buffers'][0]['byteLength'] = len(BIN)
    return G, BIN


def sha256(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', default=os.path.join(HOME, '_dev', 'room', 'ship', 'room_raw.glb'))
    ap.add_argument('--out', default=os.path.join(HOME, 'public', 'home-assets', 'room'))
    o = ap.parse_args()
    J, BIN = read_glb(o.raw)
    mo = Meshopt(MESHOPT_LIB)
    streams, accessors, meshes, xforms, gstats = pack_geometry(J, BIN, mo)
    textures = make_textures(J, BIN)
    os.makedirs(o.out, exist_ok=True)
    files = {'desktop': 'room-desktop.glb', 'phone': 'room-phone.glb'}
    sets = {}
    geo_bytes = sum(len(s['enc']) for s in streams)
    mat_of_image = {}
    for mat in J['materials']:
        t = mat.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if t:
            mat_of_image.setdefault(J['textures'][t['index']]['source'], []).append(mat['name'])
    for tier, fname in files.items():
        G, B = assemble(J, streams, accessors, meshes, xforms, textures, tier)
        path = os.path.join(o.out, fname)
        write_glb(path, G, B)
        tex = []
        for ii, t in textures.items():
            data, w, h = t[tier]
            tex.append({'image': t['name'], 'materials': mat_of_image.get(ii, []), 'width': w, 'height': h,
                        'bytes': len(data), 'gpuBytes': int(w * h * 4 * 4 / 3),
                        'encoding': 'webp-lossless' if t['name'] in LOSSLESS else
                        f'webp-q{Q_ATLAS if t["name"].startswith("LM_") else Q_IMAGE}'})
        sets[tier] = {'file': fname, 'bytes': os.path.getsize(path), 'sha256': sha256(path),
                      'textureBytes': sum(t['bytes'] for t in tex), 'geometryBytes': geo_bytes,
                      'gpuTextureBytes': sum(t['gpuBytes'] for t in tex), 'textures': tex}
    # nodes: anchors (no mesh) and meshes
    anchors, nodes = {}, []
    tri_of_mesh = {}
    for mi, m in enumerate(meshes):
        tri_of_mesh[mi] = sum(accessors[p['indices']]['count'] // 3 for p in m['primitives'])
    for ni, n in enumerate(J['nodes']):
        if 'mesh' not in n:
            if n.get('name', '').startswith('Anchor_'):
                a = {'position': [round(v, 4) for v in n.get('translation', [0, 0, 0])]}
                a.update(n.get('extras', {}))
                a.setdefault('beat', None)
                anchors[n['name']] = a
            continue
        mats = sorted({J['materials'][p['material']]['name'] for p in J['meshes'][n['mesh']]['primitives']
                       if 'material' in p})
        nodes.append({'name': n['name'], 'triangles': tri_of_mesh[n['mesh']], 'materials': mats,
                      'quantized': ni in xforms})
    shadow = next((x for x in nodes if x['name'] == 'Instrument_Contact_Shadow'), None)
    sb = None
    if shadow:
        mi = next(n['mesh'] for n in J['nodes'] if n.get('name') == 'Instrument_Contact_Shadow')
        P = read_accessor(J, BIN, J['meshes'][mi]['primitives'][0]['attributes']['POSITION'])
        sb = {'min': [round(float(v), 4) for v in P.min(0)], 'max': [round(float(v), 4) for v in P.max(0)]}
    manifest = {
        'format': 'home room manifest v1: sets.<desktop|phone> name one self-contained GLB each (same nodes, '
                  'materials and texture names; only texture sizes differ); anchors are glTF nodes named Anchor_*, '
                  'positions and every vector in extras in three.js world metres (Y up; Blender (x, y, z) -> '
                  '(x, z, -y)); bytes and sha256 are of the files as written; gpuBytes = w * h * 4 * 4/3 '
                  '(RGBA8 with mipmaps, as three uploads WebP)',
        'version': 1,
        'generator': 'workspace/home/assets-src/room/pack_room.py',
        'source': {'raw': os.path.relpath(o.raw, HOME), 'rawSha256': sha256(o.raw)},
        'requires': {'extensions': ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp'],
                     'three': "loader.setMeshoptDecoder(MeshoptDecoder) from 'three/addons/libs/meshopt_decoder.module.js'",
                     'meshTransforms': 'quantized meshes are positioned by their node (translation + uniform scale); '
                                       'use world matrices, not raw attribute values'},
        'files': [{'file': s['file'], 'set': k, 'bytes': s['bytes'], 'sha256': s['sha256']} for k, s in sets.items()],
        'sets': sets,
        'geometry': dict(gstats, bytes=geo_bytes, compression='EXT_meshopt_compression + KHR_mesh_quantization',
                         floatPositions=sorted(FLOAT_POSITION)),
        'anchors': anchors,
        'contactShadow': {'node': 'Instrument_Contact_Shadow', 'material': 'Contact_Shadow', 'bounds': sb,
                          'use': 'unlit black, alpha from the texture (alphaMode BLEND); fade with material opacity'},
        'nodes': nodes,
        'notes': {
            'ktx2': 'Not done. KTX2 (KHR_texture_basisu, ETC1S or UASTC, transcoded in the browser by three\'s '
                    'KTX2Loader + basis_transcoder.wasm) would keep textures compressed on the GPU: about 4-8x less '
                    'GPU memory than RGBA8 WebP (ETC1S ~0.5-1 byte/texel), so the 2048 atlases could come back '
                    'within budget and phones would drop to ~5 MB. Costs: the transcoder (~0.5 MB wasm) and its '
                    'setup, slower first upload, ETC1S blockiness in the dark gradients (UASTC avoids it at ~2x the '
                    'download). /opt/homebrew/bin/basisu exists on this machine, so it needs no install.',
            'viewer': '_dev/room/room.glb (with the baked armillary) is unchanged for sketches/room/.'}}
    with open(os.path.join(o.out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
        f.write('\n')
    for k, s in sets.items():
        print(f"{k:8s} {s['file']}: {s['bytes']:,} B (geometry {geo_bytes:,} B, textures {s['textureBytes']:,} B), "
              f"GPU textures {s['gpuTextureBytes'] / 2**20:.1f} MiB")
    print('geometry', json.dumps(gstats), 'float positions:', sorted(FLOAT_POSITION))
    print('anchors', json.dumps(anchors))


if __name__ == '__main__':
    main()
