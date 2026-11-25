// Checks for the room viewer that need no browser:
//   node sketches/room/check.mjs            (from workspace/home)
// 1. room.glb: every material, texture, image and UV set the loader relies on
//    exists and is classified the way room.js expects; sizes and triangles.
// 2. Cameras: the Blender -> three conversion (Z-up -> Y-up, lens -> fov)
//    reproduces Blender's camera axes, and known objects project to where
//    the Blender stills show them (pixel positions read off the PNGs).
// 3. The text on each shot matches content.mjs.
// 4. Portrait framings: where the subjects land (for composing the text band).
// Exit code 1 on any failure.

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import { BLENDER_CAMERAS, BLENDER_FRAME, LANDMARKS, CHAPTER_TEXT, SHOTS, SHOT_IDS, b2t, cameraSpec, applyCamera, projectBlender, blenderHfov, DEG } from './shots.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = path.resolve(HERE, '..', '..');
const GLB = path.join(HOME, '_dev', 'room', 'room.glb');
let failures = 0;
const ok = (cond, msg) => {
  if (!cond) failures++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
};

// ---------------------------------------------------------------- 1. the GLB
const buf = readFileSync(GLB);
ok(buf.readUInt32LE(0) === 0x46546c67 && buf.readUInt32LE(4) === 2, 'room.glb is glTF 2.0 binary');
const jsonLen = buf.readUInt32LE(12);
const J = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const nodes = new Map(J.nodes.map((n) => [n.name, n]));
ok((J.extensionsUsed || []).includes('KHR_materials_unlit'), 'uses KHR_materials_unlit');
ok(!(J.extensionsRequired || []).length, `no required extensions (${JSON.stringify(J.extensionsRequired || [])})`);

const need = ['Floor', 'Sea', 'Armillary_Sphere', 'Window_Glass', 'Monitor_Left_Screen', 'Monitor_Center_Screen', 'Monitor_Right_Screen', 'Desk_Mat', 'Outside_Land', 'Skyline', 'Board', 'Book_Stack', 'Notebook_Pages'];
for (const n of need) ok(nodes.has(n), `node ${n} exists`);
ok(!nodes.has('Sky_Dome'), 'no baked sky dome (the live sky replaces it)');
ok(J.nodes.every((n) => !n.translation && !n.rotation && !n.scale && !n.matrix), 'every node is in world space (no transforms)');
const strips = J.nodes.filter((n) => n.name.startsWith('Strip_'));
ok(strips.length >= 15, `${strips.length} light strips are separate nodes`);

const EMIT_RE = /^Unlit_([0-9a-f]{6})_e([0-9.]+)$/;
const kinds = {};
J.materials.forEach((m, i) => {
  const name = m.name || '';
  const tex = m.pbrMetallicRoughness?.baseColorTexture;
  let kind = null;
  if (name.startsWith('LM_')) kind = 'baked';
  else if (name.endsWith('_Unlit')) kind = 'image';
  else if (EMIT_RE.test(name)) kind = 'emitter';
  else if (name === 'Glass_Export') kind = 'glass';
  ok(kind !== null, `material ${i} ${name} is classified (${kind})`);
  kinds[name] = kind;
  if (kind === 'baked' || kind === 'image') {
    ok(!!tex && J.textures[tex.index] && J.images[J.textures[tex.index].source], `  ${name}: baseColorTexture -> texture -> image`);
    ok(!tex || tex.texCoord === undefined || tex.texCoord === 0, `  ${name}: texture uses TEXCOORD_0 (three channel 0)`);
    ok(!!m.extensions?.KHR_materials_unlit, `  ${name}: unlit`);
  }
  if (kind === 'emitter') {
    const s = Number(EMIT_RE.exec(name)[2]);
    ok(m.extras && Number(m.extras.emit) === s, `  ${name}: extras.emit = ${m.extras?.emit} matches the name`);
  }
  if (kind === 'glass') ok(m.alphaMode === 'BLEND', `  ${name}: alpha-blended`);
});
// every primitive with a textured material has the UV set it needs
let tris = 0;
let missingUv = 0;
let normals = 0;
for (const node of J.nodes) {
  const mesh = J.meshes[node.mesh];
  for (const p of mesh.primitives) {
    const m = J.materials[p.material];
    const textured = !!m.pbrMetallicRoughness?.baseColorTexture;
    if (textured && p.attributes.TEXCOORD_0 === undefined) missingUv++;
    if (p.attributes.NORMAL !== undefined) normals++;
    tris += (p.indices !== undefined ? J.accessors[p.indices].count : J.accessors[p.attributes.POSITION].count) / 3;
  }
}
ok(missingUv === 0, `every textured primitive has TEXCOORD_0 (${missingUv} missing)`);
ok(normals === 0, `no normals stored (all unlit): ${normals}`);
ok(tris <= 150000, `triangles ${tris} <= 150000 (ROOM.md budget)`);
ok(kinds.LM_Floor === 'baked' && J.meshes[nodes.get('Floor').mesh].primitives.every((p) => J.materials[p.material].name === 'LM_Floor'), 'Floor uses its own atlas LM_Floor');
ok(J.meshes[nodes.get('Armillary_Sphere').mesh].primitives.every((p) => J.materials[p.material].name === 'LM_Armillary'), 'Armillary_Sphere uses its own atlas LM_Armillary');
ok(J.meshes[nodes.get('Sea').mesh].primitives.every((p) => /^Unlit_010305/.test(J.materials[p.material].name)), 'Sea keeps its constant material');

function jpegSize(b) {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}
let imgBytes = 0;
let gpuBytes = 0;
const imgRows = [];
for (const im of J.images) {
  const bv = J.bufferViews[im.bufferView];
  const bytes = buf.subarray(binStart + (bv.byteOffset || 0), binStart + (bv.byteOffset || 0) + bv.byteLength);
  const size = im.mimeType === 'image/jpeg' ? jpegSize(bytes) : null;
  ok(!!size, `image ${im.name} (${im.mimeType}) decodes its size: ${size ? size.join('x') : '?'}`);
  imgBytes += bv.byteLength;
  if (size) gpuBytes += size[0] * size[1] * 4 * (4 / 3);
  imgRows.push(`${im.name} ${size ? size.join('x') : '?'} ${(bv.byteLength / 1024).toFixed(0)} KB`);
}
const glbBytes = statSync(GLB).size;
console.log(`     GLB ${(glbBytes / 1048576).toFixed(2)} MB = images ${(imgBytes / 1048576).toFixed(2)} MB + geometry/JSON ${((glbBytes - imgBytes) / 1048576).toFixed(2)} MB; ${tris} triangles, ${J.nodes.length} nodes, ${J.materials.length} materials`);
console.log(`     textures decoded on the GPU (RGBA8 + mips): ${(gpuBytes / 1048576).toFixed(0)} MB`);
for (const r of imgRows) console.log(`       ${r}`);
ok(glbBytes <= 6.6 * 1048576, `GLB ${(glbBytes / 1048576).toFixed(2)} MB is near 6 MB or less`);

// ---------------------------------------------------------------- 2. cameras
// Blender's camera axes for the five stills (queried from room.blend:
// matrix_world @ (0,0,-1) and (0,1,0)), Z-up.
const BLENDER_AXES = {
  wide: { fwd: [0.117, 0.991, 0.07], up: [-0.008, -0.07, 0.998] },
  desk: { fwd: [0.039, 0.944, -0.327], up: [0.014, 0.326, 0.945] },
  instrument: { fwd: [-0.862, 0.498, -0.093], up: [-0.081, 0.047, 0.996] },
  bed: { fwd: [0.709, 0.658, -0.254], up: [0.186, 0.173, 0.967] },
  wall: { fwd: [0.0, 1.0, -0.017], up: [0.0, 0.017, 1.0] },
};
const AB = BLENDER_FRAME.w / BLENDER_FRAME.h;
const camAt = (id, w, h) => {
  const layout = w / h < 0.8 ? 'port' : 'land';
  const c = new THREE.PerspectiveCamera(50, w / h, 0.05, 150);
  return applyCamera(c, cameraSpec(id, layout, w / h));
};
for (const id of Object.keys(BLENDER_CAMERAS)) {
  const c = camAt(id, BLENDER_FRAME.w, BLENDER_FRAME.h);
  const fwd = new THREE.Vector3();
  c.getWorldDirection(fwd);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
  const bf = new THREE.Vector3().fromArray(b2t(BLENDER_AXES[id].fwd)).normalize();
  const bu = new THREE.Vector3().fromArray(b2t(BLENDER_AXES[id].up)).normalize();
  const af = fwd.angleTo(bf) / DEG;
  const au = up.angleTo(bu) / DEG;
  ok(af < 0.15 && au < 0.15, `${id}: three camera axes match Blender's (forward off by ${af.toFixed(3)} deg, up by ${au.toFixed(3)} deg)`);
  // horizontal fov at Blender's own aspect equals the lens's
  const hf = 2 * Math.atan(Math.tan((c.fov * DEG) / 2) * AB);
  ok(Math.abs(hf - blenderHfov(BLENDER_CAMERAS[id].lens)) < 1e-9, `${id}: ${BLENDER_CAMERAS[id].lens} mm -> horizontal fov ${(hf / DEG).toFixed(2)} deg, vertical ${c.fov.toFixed(2)} deg at 16:9`);
}
// where the Blender stills show these objects (pixels of the 1600x900 PNGs,
// read off the renders by eye: +-10 px), and where three puts them
const SEEN = [
  ['wide', 'monitorCenter', 272, 540],
  ['wide', 'armillaryCore', 500, 537],
  ['desk', 'monitorCenter', 777, 357],
  ['desk', 'armillaryCore', 1400, 397],
  ['instrument', 'armillaryCore', 805, 325],
];
for (const [id, lm, px, py] of SEEN) {
  const c = camAt(id, BLENDER_FRAME.w, BLENDER_FRAME.h);
  const p = projectBlender(c, LANDMARKS[lm]);
  const x = (p.x * 0.5 + 0.5) * BLENDER_FRAME.w;
  const y = (0.5 - p.y * 0.5) * BLENDER_FRAME.h;
  const err = Math.hypot(x - px, y - py);
  ok(err < 24 && p.z < 1, `${id}: ${lm} projects to (${x.toFixed(0)}, ${y.toFixed(0)}) px, render shows (${px}, ${py}): off ${err.toFixed(1)} px`);
}
// at 1440x900 the 'contain' fit shows Blender's full width: same NDC x
{
  const a = projectBlender(camAt('desk', 1600, 900), LANDMARKS.armillaryCore);
  const b = projectBlender(camAt('desk', 1440, 900), LANDMARKS.armillaryCore);
  ok(Math.abs(a.x - b.x) < 1e-6, `1440x900 keeps Blender's horizontal framing (armillary NDC x ${a.x.toFixed(4)} vs ${b.x.toFixed(4)}; y ${a.y.toFixed(3)} -> ${b.y.toFixed(3)})`);
}

// ---------------------------------------------------------------- 3. text
const content = await import(path.join(HOME, 'content.mjs')).then((m) => m.homeContent());
for (const id of SHOT_IDS) {
  const sec = SHOTS[id].section;
  const want = content.chapters[sec - 1]?.text;
  ok(CHAPTER_TEXT[sec] === want, `${id}: section ${sec} text matches content.mjs chapter c${String(sec).padStart(2, '0')}`);
}
ok(SHOTS.desk.section === 14 && CHAPTER_TEXT[14].startsWith('Building ZeroMind'), "desk carries 'Building ZeroMind' and its three lines");
const sections = new Set(SHOT_IDS.map((id) => SHOTS[id].section));
ok([11, 12, 13, 14, 15, 16].every((s) => sections.has(s)), 'storyboard sections 11 to 16 each have a shot');

// ---------------------------------------------------------------- 4. portrait framings
console.log('     portrait 390x844 and landscape 1440x900: landmark NDC (x right, y up; |v| <= 1 is in frame)');
const LM_FOR = {
  wide: ['monitorCenter', 'armillaryCore', 'board', 'penguin'],
  desk: ['monitorCenter', 'monitorLeft', 'monitorRight', 'armillaryCore'],
  instrument: ['armillaryCore', 'monitorRight'],
  bed: ['penguin', 'globeHead', 'globeFoot'],
  wall: ['board', 'globeFoot'],
  screens: ['monitorLeft', 'notebook', 'monitorCenter'],
};
for (const id of SHOT_IDS) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const c = camAt(id, w, h);
    const parts = LM_FOR[id].map((lm) => {
      const p = projectBlender(c, LANDMARKS[lm]);
      const inside = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1;
      return `${lm} (${p.x.toFixed(2)}, ${p.y.toFixed(2)})${inside ? '' : ' out'}`;
    });
    console.log(`       ${id.padEnd(10)} ${String(w).padStart(4)}x${h} fov ${c.fov.toFixed(1)}: ${parts.join(', ')}`);
  }
}
// the portrait subject must be inside the frame
for (const [id, lm] of [['wide', 'monitorCenter'], ['desk', 'monitorCenter'], ['instrument', 'armillaryCore'], ['bed', 'penguin'], ['wall', 'board'], ['screens', 'monitorLeft']]) {
  const p = projectBlender(camAt(id, 390, 844), LANDMARKS[lm]);
  ok(Math.abs(p.x) < 0.85 && Math.abs(p.y) < 0.85 && p.z < 1, `portrait ${id}: ${lm} in frame at NDC (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
