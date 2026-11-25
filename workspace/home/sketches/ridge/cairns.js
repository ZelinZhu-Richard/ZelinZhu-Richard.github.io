// Cairns: stacks of rounded pebbles (superellipsoids with a little noise),
// each drawn only by its own horizontal isolines over a night fill.

import * as THREE from 'three';
import { gnoise } from './world.js';
import { GLSL_COMMON } from './glsl.js';

const sgnPow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);

function stoneArrays(st, segU, segV, lift, extraTilt) {
  const [rx, ry, rz] = st.radii;
  const rows = segV + 1;
  const pos = new Float32Array(rows * segU * 3);
  const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
  const tx = st.tiltX + extraTilt, tz = st.tiltZ - extraTilt * 0.6;
  const cx = Math.cos(tx), sx = Math.sin(tx), cz = Math.cos(tz), sz = Math.sin(tz);
  const s = st.seed % 997;
  let k = 0;
  for (let j = 0; j < rows; j++) {
    const v = -Math.PI / 2 + (j / segV) * Math.PI;
    const cv = sgnPow(Math.cos(v), st.e1), sv = sgnPow(Math.sin(v), st.e1);
    for (let i = 0; i < segU; i++) {
      const u = -Math.PI + (i / segU) * Math.PI * 2;
      let x = rx * cv * sgnPow(Math.cos(u), st.e2);
      let y = ry * sv;
      let z = rz * cv * sgnPow(Math.sin(u), st.e2);
      // weathering: low-frequency bumps, a little finer grain
      const n = 1 + 0.055 * gnoise(x * 5.0 + s, z * 5.0 + y * 3.0, 401) + 0.02 * gnoise(x * 13.0 - y * 7.0, z * 13.0 + s, 409);
      x *= n; y *= n; z *= n;
      // yaw, then small tilts about x and z
      let X = x * cy - z * sy, Z = x * sy + z * cy, Y = y;
      let Y2 = Y * cx - Z * sx; Z = Y * sx + Z * cx; Y = Y2;
      const X2 = X * cz - Y * sz; Y = X * sz + Y * cz; X = X2;
      pos[k++] = st.center[0] + X;
      pos[k++] = st.center[1] + Y + lift;
      pos[k++] = st.center[2] + Z;
    }
  }
  const idx = [];
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const i1 = (i + 1) % segU;
      const a = j * segU + i, b = j * segU + i1, c = (j + 1) * segU + i, d = (j + 1) * segU + i1;
      // counter-clockwise seen from outside, so normals point out
      idx.push(a, c, b, b, c, d);
    }
  }
  return { pos, idx, count: rows * segU };
}

const VERT = /* glsl */ `
attribute float aPhase;
varying vec3 vW;
varying vec3 vN;
varying float vPhase;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normal;
  vPhase = aPhase;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uNight;
uniform vec3 uInk;
uniform vec2 uFog;
uniform float uInkK;
uniform float uStep;
uniform vec3 uLight;
varying vec3 vW;
varying vec3 vN;
varying float vPhase;
void main() {
  float v = vW.y / uStep + vPhase;
  float gv = length(vec2(dFdx(v), dFdy(v)));
  vec3 n = normalize(vN);
  float side = 1.0 - abs(n.y);
  float lit = clamp(0.5 + 0.6 * dot(n, uLight), 0.0, 1.0);
  float wk = uDpr * (0.8 + 0.4 * side) * mix(0.85, 1.2, lit);
  float minor = isolines(v, gv, 0.9 * wk) * 0.55;
  float major = isolines(v * 0.2, gv * 0.2, 1.5 * wk) * 0.95;
  float ink = max(minor, major);
  float dist = length(vW - cameraPosition);
  float fogK = 1.0 - smoothstep(uFog.x, uFog.y, dist);
  ink *= fogK * sqrt(fogK) * uInkK * (0.55 + 0.6 * lit);
  vec3 col = mix(uNight, uInk, clamp(ink, 0.0, 1.0));
  gl_FragColor = vec4(col + dither(), 1.0);
}
`;

export function buildCairns(shared, scene, world) {
  const parts = [];
  let vcount = 0;
  for (const c of world.cairns) {
    const hovered = scene.lift === c.index;
    const fine = scene.ring === c.index;
    const segU = fine ? 72 : 44, segV = fine ? 40 : 24;
    c.stones.forEach((st, k) => {
      const top = k === c.stones.length - 1;
      const lift = hovered && top ? 0.15 : 0;
      const tilt = hovered && top ? 0.1 : 0;
      const a = stoneArrays(st, segU, segV, lift, tilt);
      parts.push({ ...a, phase: st.phase, base: vcount });
      vcount += a.count;
    });
  }
  const pos = new Float32Array(vcount * 3);
  const phase = new Float32Array(vcount);
  const idx = [];
  for (const p of parts) {
    pos.set(p.pos, p.base * 3);
    phase.fill(p.phase, p.base, p.base + p.count);
    for (const i of p.idx) idx.push(i + p.base);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uFog: { value: new THREE.Vector2(scene.fog[0], scene.fog[1]) },
      uInkK: { value: scene.ink },
      uStep: { value: scene.stoneStep },
      uLight: { value: new THREE.Vector3(-0.62, 0.55, -0.28).normalize() },
    },
    vertexShader: VERT,
    fragmentShader: GLSL_COMMON + FRAG,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'cairns';
  return mesh;
}
