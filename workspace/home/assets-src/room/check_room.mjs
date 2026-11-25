// Checks the shipped room (pack_room.py output) the way the browser will read it, with three's own meshopt
// decoder (the same WASM the page uses), without a browser:
//
//   node assets-src/room/check_room.mjs [public/home-assets/room]
//
// - manifest.json: every file's bytes and sha256; desktop/phone budgets (download and GPU memory);
// - each GLB: required extensions, every buffer view decodes, accessor counts and POSITION bounds match the
//   decoded data, indices are in range, textures are real WebP of the sizes the manifest states;
// - names the engine relies on are present (and the baked armillary is not); anchors and their extras;
// - desktop and phone differ only in texture sizes (phone = half);
// - the dequantised room lands where the room is (shell about 10 x 5 x 7 m around the origin).
// Exits 1 on any failure.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const HOME = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = process.argv[2] || join(HOME, 'public', 'home-assets', 'room');
const BUDGET = { desktop: { bytes: 3.5e6, gpu: 70e6 }, phone: { bytes: 2.0e6, gpu: 25e6 } };   // decimal MB, the stricter reading
const NEED_NODES = ['Floor', 'Sea', 'Window_Glass', 'Monitor_Left_Screen', 'Monitor_Center_Screen', 'Monitor_Right_Screen',
  'Desk_Mat', 'Outside_Land', 'Skyline', 'Board', 'Book_Stack', 'Notebook_Pages', 'Desk_Lamp', 'Ring_Light',
  'Instrument_Contact_Shadow'];
const ANCHORS = { Anchor_Instrument: null, Anchor_Monitor_Left: 13, Anchor_Monitor_Center: 14, Anchor_Board: 15,
  Anchor_Bed: 16, Anchor_Window: 17, Anchor_Notebook: null, Anchor_Books: null };
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log(`ok   ${msg}`);
  else { failures++; console.log(`FAIL ${msg}`); }
}

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67 || buf.readUInt32LE(4) !== 2) throw new Error('not glTF 2.0 binary');
  let off = 12; let json = null; let bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off); const type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  return { json, bin };
}

function webpSize(b) {
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  return null;
}

function checkGlb(set, file, manifest) {
  const { json: J, bin } = parseGlb(readFileSync(join(DIR, file)));
  const req = new Set(J.extensionsRequired || []);
  ok(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp'].every((e) => req.has(e)), `${set}: extensions required`);
  // decode every view
  const views = J.bufferViews.map((v) => {
    const ext = v.extensions && v.extensions.EXT_meshopt_compression;
    if (!ext) return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const out = new Uint8Array(ext.count * ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, bin.subarray(ext.byteOffset, ext.byteOffset + ext.byteLength), ext.mode, ext.filter);
    return Buffer.from(out.buffer);
  });
  let compressed = 0;
  for (const v of J.bufferViews) if (v.extensions && v.extensions.EXT_meshopt_compression) compressed++;
  ok(compressed > 0, `${set}: ${compressed} meshopt buffer views decoded`);
  const read = (i) => {
    const a = J.accessors[i]; const v = J.bufferViews[a.bufferView]; const T = CT[a.componentType]; const n = NC[a.type];
    const stride = v.byteStride || T.BYTES_PER_ELEMENT * n; const src = views[a.bufferView];
    const out = new T(a.count * n);
    const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = dv[get]((a.byteOffset || 0) + k * stride + c * T.BYTES_PER_ELEMENT, true);
    return { a, out, n };
  };
  let tris = 0; let badBounds = 0; let badIdx = 0;
  const world = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const nodeOfMesh = new Map(J.nodes.map((n, i) => [n.mesh, n]).filter(([m]) => m !== undefined));
  J.meshes.forEach((m, mi) => {
    const node = nodeOfMesh.get(mi);
    for (const p of m.primitives) {
      const pos = read(p.attributes.POSITION);
      const idx = read(p.indices).out;
      tris += idx.length / 3;
      for (let c = 0; c < 3; c++) {
        let lo = Infinity; let hi = -Infinity;
        for (let k = c; k < pos.out.length; k += 3) { lo = Math.min(lo, pos.out[k]); hi = Math.max(hi, pos.out[k]); }
        if (lo !== pos.a.min[c] || hi !== pos.a.max[c]) badBounds++;
        const scale = pos.a.normalized ? 32767 : 1;
        const s = node.scale ? node.scale[c] : 1; const t = node.translation ? node.translation[c] : 0;
        if (['Sea', 'Outside_Land', 'Skyline'].includes(node.name)) continue;
        world.min[c] = Math.min(world.min[c], (lo / scale) * s + t);
        world.max[c] = Math.max(world.max[c], (hi / scale) * s + t);
      }
      const nv = pos.a.count;
      for (const k of idx) if (k >= nv) { badIdx++; break; }
    }
  });
  ok(badBounds === 0, `${set}: POSITION min/max match the decoded data`);
  ok(badIdx === 0, `${set}: indices in range`);
  ok(tris === manifest.geometry.triangles, `${set}: ${tris} triangles (manifest ${manifest.geometry.triangles})`);
  const w = world.min.map((v, i) => [v.toFixed(2), world.max[i].toFixed(2)].join('..'));
  ok(world.min[0] > -5.6 && world.max[0] < 5.6 && world.min[1] > -0.5 && world.max[1] < 5.5 && world.min[2] > -7.6 && world.max[2] < 1.0,
    `${set}: dequantised room spans x ${w[0]}, y ${w[1]}, z ${w[2]} m`);
  // textures
  const tex = manifest.sets[set].textures;
  J.images.forEach((img, i) => {
    const v = J.bufferViews[img.bufferView];
    const b = bin.subarray(v.byteOffset, v.byteOffset + v.byteLength);
    const size = webpSize(Buffer.from(b));
    const m = tex.find((t) => t.image === img.name);
    ok(img.mimeType === 'image/webp' && size && m && size[0] === m.width && size[1] === m.height && b.length === m.bytes,
      `${set}: ${img.name} WebP ${size ? size.join('x') : '?'}`);
  });
  ok(J.textures.every((t) => t.extensions && t.extensions.EXT_texture_webp && t.source === undefined), `${set}: textures use EXT_texture_webp only`);
  const names = new Set(J.nodes.map((n) => n.name));
  ok(NEED_NODES.every((n) => names.has(n)), `${set}: engine node names present`);
  ok(!names.has('Armillary_Sphere'), `${set}: no baked armillary (drawn live)`);
  const mats = new Set(J.materials.map((m) => m.name));
  ok(['LM_Room', 'LM_Props', 'LM_Soft', 'LM_Floor', 'LM_Books', 'LM_Detail', 'LM_Outside', 'Glass_Export', 'Contact_Shadow'].every((n) => mats.has(n)) &&
    !mats.has('LM_Armillary'), `${set}: material names`);
  ok(J.materials.find((m) => m.name === 'Contact_Shadow')?.alphaMode === 'BLEND', `${set}: contact shadow blends`);
  for (const [name, beat] of Object.entries(ANCHORS)) {
    const n = J.nodes.find((x) => x.name === name);
    const e = (n && n.extras) || {};
    ok(n && n.mesh === undefined && n.translation && (beat === null ? e.beat === undefined : e.beat === beat) &&
      Array.isArray(e.facing) && Array.isArray(e.size) && (name !== 'Anchor_Instrument' || e.height > 0.3),
    `${set}: ${name} at ${n && n.translation ? n.translation.map((v) => v.toFixed(3)).join(', ') : '?'}${beat !== null ? ` beat ${beat}` : ''}`);
  }
  return J;
}

await MeshoptDecoder.ready;
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
for (const f of manifest.files) {
  const b = readFileSync(join(DIR, f.file));
  ok(b.length === f.bytes && createHash('sha256').update(b).digest('hex') === f.sha256, `${f.file}: ${f.bytes} bytes, sha256 matches`);
}
const out = {};
for (const [set, s] of Object.entries(manifest.sets)) {
  out[set] = checkGlb(set, s.file, manifest);
  ok(s.bytes <= BUDGET[set].bytes, `${set}: download ${(s.bytes / 1e6).toFixed(2)} MB <= ${(BUDGET[set].bytes / 1e6).toFixed(1)} MB`);
  ok(s.gpuTextureBytes <= BUDGET[set].gpu, `${set}: GPU textures ${(s.gpuTextureBytes / 1e6).toFixed(1)} MB <= ${BUDGET[set].gpu / 1e6} MB (mipmapped RGBA8)`);
}
const d = manifest.sets.desktop.textures; const p = manifest.sets.phone.textures;
ok(d.length === p.length && d.every((t, i) => p[i].image === t.image && Math.abs(p[i].width - t.width / 2) <= 1 && Math.abs(p[i].height - t.height / 2) <= 1),
  'phone textures are half the desktop ones');
const strip = (J) => JSON.stringify({ n: J.nodes, m: J.materials, a: J.accessors, i: J.images.map((x) => x.name) });
ok(strip(out.desktop) === strip(out.phone), 'desktop and phone share nodes, materials and accessors');
console.log(failures ? `${failures} check(s) failed` : 'all room checks passed');
process.exit(failures ? 1 : 0);
