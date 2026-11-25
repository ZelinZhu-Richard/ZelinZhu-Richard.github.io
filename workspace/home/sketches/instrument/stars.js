// Round, anti-aliased point sprites: the star field, dust in the room and
// the single orange point. Sizes are CSS px (three sizes for stars), the
// colour is ink at a per-point alpha; no colour, no glow, no nebula.
// Stars dim inside the text's quiet rectangles (measured from the DOM) so
// they never fight the type.

import * as THREE from 'three';
import { shared } from './materials.js';
import { makeRng } from './rng.js';
import { PALETTE } from './palette.js';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
uniform float uDpr;
varying float vAlpha;
varying float vSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = aSize * uDpr;
  vAlpha = aAlpha * clamp(s, 0.0, 1.0);
  s = max(s, 1.0);
  vSize = s;
  gl_PointSize = s + 2.0;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec4 uQuiet[8];
uniform float uQuietSoft;
uniform float uQuietFloor;
varying float vAlpha;
varying float vSize;
float rectFade(vec2 p, vec4 r) {
  if (r.z <= r.x) return 1.0;
  vec2 d = max(max(r.xy - p, p - r.zw), 0.0);
  return mix(uQuietFloor, 1.0, smoothstep(0.0, uQuietSoft, length(d)));
}
void main() {
  float r = length(gl_PointCoord - vec2(0.5)) * (vSize + 2.0);
  float cov = clamp(0.5 * vSize + 0.5 - r, 0.0, 1.0);
  float q = 1.0;
  for (int i = 0; i < 8; i++) q = min(q, rectFade(gl_FragCoord.xy, uQuiet[i]));
  float a = cov * vAlpha * q;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

const rects = () => Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0));

// Device-px rectangles (gl_FragCoord space, y up) where stars give way.
export const quiet = {
  uQuiet: { value: rects() },
  uQuietSoft: { value: 40 },
  uQuietFloor: { value: 0.08 },
};

const NONE = {
  uQuiet: { value: rects() },
  uQuietSoft: { value: 1 },
  uQuietFloor: { value: 1 },
};

// rs: CSS-px [left, top, right, bottom]; pad grows each rect a little.
export function setQuiet(rs, W, H, dpr, pad = 10) {
  const list = rs.slice(0, 8);
  if (rs.length > 8) {
    const rest = rs.slice(7);
    list[7] = [Math.min(...rest.map((r) => r[0])), Math.min(...rest.map((r) => r[1])), Math.max(...rest.map((r) => r[2])), Math.max(...rest.map((r) => r[3]))];
  }
  quiet.uQuiet.value.forEach((v, i) => {
    const r = list[i];
    if (!r) v.set(0, 0, 0, 0);
    else v.set((r[0] - pad) * dpr, (H - r[3] - pad) * dpr, (r[2] + pad) * dpr, (H - r[1] + pad) * dpr);
  });
  quiet.uQuietSoft.value = 36 * dpr;
}

// pts: [{ p: [x,y,z], size (css px), alpha }]
export function buildPoints(pts, { color, useQuiet = true, depthTest = true, renderOrder = 3, name = 'points' } = {}) {
  const n = pts.length;
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  pts.forEach((q, i) => {
    pos.set(q.p, i * 3);
    size[i] = q.size;
    alpha[i] = q.alpha;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const c = color || PALETTE.ink;
  const mat = new THREE.ShaderMaterial({
    name,
    uniforms: {
      uDpr: shared.uDpr,
      uColor: { value: new THREE.Vector3(c[0], c[1], c[2]) },
      ...(useQuiet ? quiet : NONE),
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = renderOrder;
  points.name = name;
  return points;
}

function unit(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// Sky dome: sparse field over the whole sphere plus a faint denser band
// round the great circle whose normal is bandN. Three sizes only.
export function starField({ seed = 0x5eed, R = 160, count = 2300, band = 2400, bandN = [0.35, 0.62, 0.7], bandW = 0.11, centre = [0, 2, 0] } = {}) {
  const rng = makeRng(seed);
  const pts = [];
  const randDir = () => {
    const z = rng.range(-1, 1);
    const t = rng.range(0, Math.PI * 2);
    const s = Math.sqrt(1 - z * z);
    return [s * Math.cos(t), z, s * Math.sin(t)];
  };
  const sizeOf = () => {
    const u = rng.next();
    if (u < 0.72) return { size: 1.0, alpha: rng.range(0.32, 0.62) };
    if (u < 0.95) return { size: 1.55, alpha: rng.range(0.5, 0.78) };
    return { size: 2.3, alpha: rng.range(0.72, 0.92) };
  };
  for (let i = 0; i < count; i++) {
    const d = randDir();
    pts.push({ p: [centre[0] + d[0] * R, centre[1] + d[1] * R, centre[2] + d[2] * R], ...sizeOf() });
  }
  const n = unit(bandN);
  const a = unit(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const b = cross(n, a);
  for (let i = 0; i < band; i++) {
    const t = rng.range(0, Math.PI * 2);
    // gaussian-ish offset from the band's plane, denser near the middle
    const g = (rng.next() + rng.next() + rng.next() - 1.5) * bandW * 1.15;
    const dens = 0.55 + 0.45 * Math.cos(t * 2.0 + 0.7);
    if (rng.next() > dens) continue;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const d = unit([a[0] * c + b[0] * s + n[0] * g, a[1] * c + b[1] * s + n[1] * g, a[2] * c + b[2] * s + n[2] * g]);
    const big = rng.next() < 0.06;
    pts.push({
      p: [centre[0] + d[0] * R, centre[1] + d[1] * R, centre[2] + d[2] * R],
      size: big ? 1.55 : 1.0,
      alpha: big ? rng.range(0.4, 0.6) : rng.range(0.16, 0.36),
    });
  }
  return buildPoints(pts, { name: 'stars' });
}

// Dust motes in a box (world units), tiny and faint.
export function dust({ seed = 0xd057, box, count = 60, alpha = [0.18, 0.45], filter = null }) {
  const rng = makeRng(seed);
  const pts = [];
  let guard = 0;
  while (pts.length < count && guard++ < count * 40) {
    const p = [rng.range(box[0], box[3]), rng.range(box[1], box[4]), rng.range(box[2], box[5])];
    if (filter && !filter(p)) continue;
    pts.push({ p, size: rng.next() < 0.85 ? 1.0 : 1.4, alpha: rng.range(alpha[0], alpha[1]) });
  }
  return buildPoints(pts, { name: 'dust' });
}

// The one orange point.
export function accentDot(p, size = 7, { depthTest = true } = {}) {
  return buildPoints([{ p, size, alpha: 1 }], { color: PALETTE.accent, useQuiet: false, depthTest, renderOrder: 4, name: 'accent-dot' });
}
