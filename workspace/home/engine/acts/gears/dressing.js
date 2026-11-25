// The watchmaker's furniture on the plate the train turns on (gears act only;
// it goes with the floor as the instrument's own base arrives): jewel
// bearings (a ruby cabochon with its oil sink, set in a polished gold chaton,
// held by two blued screws with slots) and, behind the train, two bridges:
// raised brass plates with polished bevels, Geneva stripes across the top,
// each carrying a jewel and screws. One static geometry, one draw.
//
// Vertex data: position, normal, aKind (0 gold chaton, 1 ruby, 2 blued steel
// screw, 3 bridge brass), aLocal (the part's own frame: xz across it in units,
// y up from its seat; a screw's slot runs along its local x).

import { GEAR, TRAIN, dir } from '../../instrument/layout.js';
import { premultipliedBlend } from '../shared/render.js';

const TAU = Math.PI * 2;

/** Train centres (crank-independent). */
const dMI = ((GEAR.main.z + GEAR.idler.z) * GEAR.module) / 2;
const dIP = ((GEAR.idler.z + GEAR.pinion.z) * GEAR.module) / 2;
const IDLER = [dir(TRAIN.idlerAngle)[0] * dMI, dir(TRAIN.idlerAngle)[2] * dMI];
const PINION = [IDLER[0] + dir(TRAIN.pinionAngle)[0] * dIP, IDLER[1] + dir(TRAIN.pinionAngle)[2] * dIP];

/**
 * Jewel settings on the plate: [x, z, scale, screw line angle (deg)]. Each is
 * clear of every tip circle (main 1.125 at the origin, idler 0.585, pinion
 * 0.315) by at least 0.09.
 */
export const JEWELS = Object.freeze([
  [1.98, 0.74, 1.0, 20],
  [0.74, 1.47, 1.15, -35],
  [2.08, 0.02, 0.85, -60],
  [0.12, 1.42, 0.75, 55],
  [2.45, 0.9, 0.9, 80],
  [1.5, -1.35, 0.9, -40],
].map((j) => Object.freeze(j)));

/**
 * Bridges: arcs about a centre, [cx, cz, inner radius, outer radius, from, to (deg), height, stripe angle (deg)].
 * They stand behind the train as the cameras see it (toward -x / -z and far +x), outside every tip circle.
 */
export const BRIDGES = Object.freeze([
  // round the far side of the idler and pinion
  [IDLER[0], IDLER[1], 0.76, 1.12, -118, -8, 0.15, 24],
  // a longer one round the main wheel's far side
  [0, 0, 1.3, 1.72, 95, 228, 0.19, -18],
  // and a short one beyond the main wheel as §4 sees it
  [0, 0, 1.32, 1.7, 32, 80, 0.17, 30],
  // the pinion's cock, on its far side from the idler (under the crank arm's sweep, which passes 0.27 above it)
  [PINION[0], PINION[1], 0.45, 0.74, 50, 115, 0.15, 40],
].map((b) => Object.freeze(b)));

/** Geometry writer. */
function writer() {
  /** @type {number[]} */ const P = [];
  /** @type {number[]} */ const N = [];
  /** @type {number[]} */ const K = [];
  /** @type {number[]} */ const L = [];
  /** @type {number[]} */ const I = [];
  return {
    P, N, K, L, I,
    /** @returns {number} index */
    v(p, n, kind, l) {
      P.push(p[0], p[1], p[2]);
      N.push(n[0], n[1], n[2]);
      K.push(kind);
      L.push(l[0], l[1], l[2]);
      return P.length / 3 - 1;
    },
    quad(a, b, c, d) {
      I.push(a, b, c, a, c, d);
    },
  };
}

/**
 * A lathe about +Y at (cx, y0, cz): profile [[r, y], ...] going up the outside; smooth normals from the profile.
 * @param {ReturnType<typeof writer>} W
 */
function lathe(W, cx, y0, cz, profile, seg, kind, rot = 0, smooth = true) {
  const n = profile.length;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const nrm = (/** @type {number} */ i) => {
    const a = profile[Math.max(i - 1, 0)];
    const b = profile[Math.min(i + 1, n - 1)];
    const dr = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dr, dy) || 1;
    return [dy / l, -dr / l];
  };
  const ring = (/** @type {number} */ i, /** @type {number[]} */ nn) => {
    const at = W.P.length / 3;
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * TAU;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const r = profile[i][0];
      const lx = c * r;
      const lz = sn * r;
      W.v([cx + lx, y0 + profile[i][1], cz + lz], [c * nn[0], nn[1], sn * nn[0]], kind, [lx * cr + lz * sr, profile[i][1], -lx * sr + lz * cr]);
    }
    return at;
  };
  if (smooth) {
    let prev = ring(0, nrm(0));
    for (let i = 1; i < n; i++) {
      const cur = ring(i, nrm(i));
      for (let s = 0; s < seg; s++) W.quad(prev + s, cur + s, cur + s + 1, prev + s + 1);
      prev = cur;
    }
  } else {
    for (let i = 1; i < n; i++) {
      const dr = profile[i][0] - profile[i - 1][0];
      const dy = profile[i][1] - profile[i - 1][1];
      const l = Math.hypot(dr, dy) || 1;
      const nn = [dy / l, -dr / l];
      const a = ring(i - 1, nn);
      const b = ring(i, nn);
      for (let s = 0; s < seg; s++) W.quad(a + s, b + s, b + s + 1, a + s + 1);
    }
  }
}

/** A jewel setting at (x, y, z): chaton, ruby, two screws. @param {ReturnType<typeof writer>} W */
function jewel(W, x, y, z, k, screwDeg, seg, screws = true) {
  // the chaton: a polished gold ring with a rounded shoulder and a sunk seat for the stone
  const R = 0.052 * k;
  const h = 0.014 * k;
  lathe(W, x, y, z, [
    [R * 1.0, 0], [R * 1.0, h * 0.45], [R * 0.97, h * 0.8], [R * 0.9, h], [R * 0.72, h * 1.04], [R * 0.6, h * 0.9], [R * 0.56, h * 0.55],
  ], seg, 0);
  // the stone: a low dome with its oil sink at the centre
  const r = R * 0.57;
  const dome = [];
  const D = 7;
  for (let i = 0; i <= D; i++) {
    const t = (i / D) * 1.15; // past the pole a little, then the sink dips
    const a = Math.min(t, 1) * (Math.PI / 2);
    dome.push([r * Math.cos(a) + 1e-5, h * 0.55 + h * 0.75 * Math.sin(a)]);
  }
  // the oil sink: a small cup at the pole
  const sink = [[r * 0.3, h * 0.55 + h * 0.75 * Math.sin(Math.acos(0.3))], [r * 0.2, h * 1.12], [r * 0.08, h * 1.02], [1e-5, h * 1.0]];
  const prof = dome.filter((p) => p[0] > r * 0.3).concat(sink);
  lathe(W, x, y, z, prof, seg, 1);
  if (!screws) return;
  const a = (screwDeg * Math.PI) / 180;
  for (const s of [-1, 1]) {
    const d = R * 1.72;
    screw(W, x + Math.cos(a) * d * s, y, z - Math.sin(a) * d * s, 0.023 * k, 0.0105 * k, a * 0.7 + s * 0.9, Math.max(10, seg >> 1));
  }
}

/** A blued screw head: a polished flat top with a chamfer; the slot is cut in the shader along local x. @param {ReturnType<typeof writer>} W */
function screw(W, x, y, z, r, h, rot, seg) {
  lathe(W, x, y, z, [[r, 0], [r, h * 0.7], [r * 0.86, h], [1e-5, h]], seg, 2, rot, false);
}

/** A bridge: an arc of plate with a flat striped top, a polished bevel and upright walls. @param {ReturnType<typeof writer>} W */
function bridge(W, cx, cz, r0, r1, a0Deg, a1Deg, h, stripeDeg, seg) {
  const a0 = (a0Deg * Math.PI) / 180;
  const a1 = (a1Deg * Math.PI) / 180;
  const bev = 0.016;
  const sa = (stripeDeg * Math.PI) / 180;
  const cs = Math.cos(sa);
  const ss = Math.sin(sa);
  // cross-section going round: inner wall, inner bevel, top, outer bevel, outer wall
  const sect = [
    [r0, 0, [-1, 0]], [r0, h - bev, [-1, 0]],
    [r0, h - bev, [-0.707, 0.707]], [r0 + bev, h, [-0.707, 0.707]],
    [r0 + bev, h, [0, 1]], [r1 - bev, h, [0, 1]],
    [r1 - bev, h, [0.707, 0.707]], [r1, h - bev, [0.707, 0.707]],
    [r1, h - bev, [1, 0]], [r1, 0, [1, 0]],
  ];
  const local = (/** @type {number} */ px, /** @type {number} */ y, /** @type {number} */ pz) => [(px - cx) * cs + (pz - cz) * ss, y, -(px - cx) * ss + (pz - cz) * cs];
  /** @type {number[][]} */
  const rows = [];
  for (let s = 0; s <= seg; s++) {
    const a = a0 + ((a1 - a0) * s) / seg;
    const d = dir(a);
    const row = [];
    for (const [r, y, n] of sect) {
      const px = cx + d[0] * r;
      const pz = cz + d[2] * r;
      row.push(W.v([px, y, pz], [d[0] * n[0], n[1], d[2] * n[0]], 3, local(px, y, pz)));
    }
    rows.push(row);
  }
  for (let s = 0; s < seg; s++) {
    for (let k = 0; k < sect.length; k += 2) W.quad(rows[s][k], rows[s][k + 1], rows[s + 1][k + 1], rows[s + 1][k]);
  }
  // end caps (flat, with a small bevel left square: they sit in the blur)
  for (const [a, sgn] of [[a0, -1], [a1, 1]]) {
    const d = dir(a);
    const n = [sgn * d[2] * (a1 > a0 ? -1 : 1), 0, sgn * -d[0] * (a1 > a0 ? -1 : 1)];
    const p = (/** @type {number} */ r, /** @type {number} */ y) => {
      const px = cx + d[0] * r;
      const pz = cz + d[2] * r;
      return W.v([px, y, pz], n, 3, local(px, y, pz));
    };
    const A = p(r0, 0);
    const B = p(r0, h - bev);
    const C = p(r0 + bev, h);
    const D = p(r1 - bev, h);
    const E = p(r1, h - bev);
    const F = p(r1, 0);
    W.I.push(A, B, C, A, C, D, A, D, E, A, E, F, A, C, B, A, D, C, A, E, D, A, F, E);
  }
}

/**
 * @param {number} tier 0..3 (fewer segments and no bridges' jewels below 2; tier 0 keeps the jewels only)
 * @returns {{ position: Float32Array, normal: Float32Array, kind: Float32Array, local: Float32Array, index: Uint32Array, triangles: number }}
 */
export function buildDressing(tier) {
  const W = writer();
  const seg = [12, 16, 28, 40][Math.max(0, Math.min(3, tier | 0))];
  const jewels = tier <= 0 ? JEWELS.slice(0, 5) : tier === 1 ? JEWELS.slice(0, 8) : JEWELS;
  for (const [x, z, k, a] of jewels) jewel(W, x, 0, z, k, a, seg);
  if (tier >= 1) {
    for (const [cx, cz, r0, r1, a0, a1, h, sd] of BRIDGES) {
      bridge(W, cx, cz, r0, r1, a0, a1, h, sd, tier >= 2 ? 96 : 40);
      // furniture on the bridge: jewels and screws along its middle line
      const rm = (r0 + r1) / 2;
      const n = Math.max(2, Math.round((Math.abs(a1 - a0) * Math.PI / 180) * rm / 0.42));
      for (let i = 0; i < n; i++) {
        const a = ((a0 + ((a1 - a0) * (i + 0.5)) / n) * Math.PI) / 180;
        const d = dir(a);
        const px = cx + d[0] * rm;
        const pz = cz + d[2] * rm;
        if (i % 2 === 0) jewel(W, px, h, pz, 1.25, (a * 180) / Math.PI + 90, seg);
        else screw(W, px, h, pz, 0.04, 0.016, a * 3.1, Math.max(12, seg >> 1));
      }
    }
  }
  return {
    position: new Float32Array(W.P), normal: new Float32Array(W.N), kind: new Float32Array(W.K), local: new Float32Array(W.L),
    index: new Uint32Array(W.I), triangles: W.I.length / 3,
  };
}

/** One jewel in its chaton, no screws, at the origin: the cap jewel the act stands on the idler's hub. @param {number} tier */
export function buildHubJewel(tier) {
  const W = writer();
  jewel(W, 0, 0, 0, 0.74, 0, [12, 16, 28, 40][Math.max(0, Math.min(3, tier | 0))], false);
  return {
    position: new Float32Array(W.P), normal: new Float32Array(W.N), kind: new Float32Array(W.K), local: new Float32Array(W.L),
    index: new Uint32Array(W.I), triangles: W.I.length / 3,
  };
}

export const DRESS_VERT = /* glsl */ `
attribute float aKind;
attribute vec3 aLocal;
varying vec3 vW;
varying vec3 vN;
varying vec3 vL;
varying float vKind;
varying float vDist;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vL = aLocal;
  vKind = aKind;
  vec4 mv = viewMatrix * w;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

// Polished metal and stone by hand: a tight key highlight, the soft box
// overhead mirrored in every curved part (uBoxDir, the same one the wheels'
// faces show), the cool rim, and a dim warm room below. The bridge's top is
// straight-grained in bands whose grain direction alternates (Geneva stripes),
// so the bands light in turn as the view moves.
export const DRESS_FRAG = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec3 uBoxDir;
uniform vec3 uBoxCol;
uniform float uBoxSize;
uniform vec3 uPool;
uniform vec2 uPoolR;
uniform vec2 uSlab;
uniform vec3 uFogCol;
uniform vec2 uFog;
uniform float uOpacity;
uniform vec4 uGear[3];
varying vec3 vW;
varying vec3 vN;
varying vec3 vL;
varying float vKind;
varying float vDist;
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}
float box(vec3 R, float size) {
  return exp(-(1.0 - dot(R, uBoxDir)) / size);
}
vec3 room(vec3 R) {
  // a dim warm room: darker below, a faint band at eye level
  return vec3(0.05, 0.036, 0.022) * (0.35 + 0.65 * smoothstep(-0.3, 0.5, R.y)) + vec3(0.03, 0.022, 0.014) * exp(-R.y * R.y * 14.0);
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (dot(N, V) < 0.0) N = -N;
  vec3 R = reflect(-V, N);
  float nv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - nv, 5.0);
  vec3 Hk = normalize(uKeyDir + V);
  vec3 Hr = normalize(uRimDir + V);
  float nl = max(dot(N, uKeyDir), 0.0);
  // the pool of light round the subject
  vec3 pd = vW - uPool;
  pd -= uKeyDir * dot(pd, uKeyDir);
  float pool = 1.0 - smoothstep(uPoolR.x, uPoolR.y, length(pd));
  float sz = (vDist - uSlab.x) / uSlab.y;
  float slab = mix(0.12, 1.0, exp(-sz * sz));
  pool *= slab;
  // derivatives in uniform control flow
  float fl = fwidth(vL.z);
  float fx = fwidth(vL.x);
  float r = length(vL.xz);
  float fr = fwidth(r);

  // the gears' shadows fall across anything on the plate
  float shade = 1.0;
  for (int i = 0; i < 3; i++) {
    vec4 g = uGear[i];
    if (g.w <= 0.0) continue;
    vec2 q = vW.xz - g.xy;
    float sh = 1.0 - smoothstep(g.z - 0.02, g.z + 0.12, length(q + uKeyDir.xz * (0.06 / max(uKeyDir.y, 0.08))));
    shade *= 1.0 - 0.7 * sh * g.w * step(vW.y, 0.06);
  }

  vec3 col;
  if (vKind < 0.5) {
    // gold chaton
    vec3 F0 = vec3(1.0, 0.74, 0.32);
    vec3 F = F0 + (1.0 - F0) * fres;
    col = F * (room(R) + uBoxCol * box(R, uBoxSize) + uKeyCol * pool * shade * (2.4 * pow(max(dot(N, Hk), 0.0), 260.0) + 0.1 * nl)
      + uRimCol * (2.0 * pow(max(dot(N, Hr), 0.0), 60.0)));
  } else if (vKind < 1.5) {
    // ruby: light gathered inside the stone and thrown back from the far side, a hard window highlight on top
    vec3 ruby = vec3(0.62, 0.012, 0.035);
    float inner = 0.16 + 0.95 * pow(max(dot(-N.xz, normalize(uKeyDir.xz + 1e-4)), 0.0) * 0.5 + 0.5 * nl, 1.4);
    float depth = 0.45 + 0.55 * nv;
    col = ruby * (inner * depth * (0.25 + 0.75 * pool * shade) * 1.25 + 0.03);
    col += vec3(0.95, 0.25, 0.2) * 0.3 * pow(nv, 6.0) * pool * shade * 0.5;
    float Fj = 0.07 + 0.93 * fres;
    col += Fj * (room(R) + uBoxCol * box(R, uBoxSize * 0.6) * 1.4 + uRimCol * pow(max(dot(N, Hr), 0.0), 90.0) * 3.0)
      + uKeyCol * pool * shade * pow(max(dot(N, Hk), 0.0), 520.0) * 3.5;
    // the oil sink
    col *= 1.0 - 0.55 * (1.0 - smoothstep(0.004, 0.009, r));
  } else if (vKind < 2.5) {
    // blued steel screw: mirror-polished, the blue of tempered steel
    vec3 F0 = vec3(0.04, 0.085, 0.42);
    vec3 F = F0 + (1.0 - F0) * fres;
    col = F * (room(R) * 1.2 + vec3(0.5, 0.75, 1.5) * uBoxCol * box(R, uBoxSize * 1.3) + uKeyCol * pool * shade * 2.2 * pow(max(dot(N, Hk), 0.0), 320.0)
      + uRimCol * 3.0 * pow(max(dot(N, Hr), 0.0), 50.0));
    col += vec3(0.004, 0.008, 0.03);
    // the slot: a dark groove across the head, its far wall catching the light
    float top = step(0.9, N.y);
    float w = max(0.0038, 1.2 * fl);
    float slot = (1.0 - smoothstep(w * 0.7, w, abs(vL.z))) * top;
    col = mix(col, vec3(0.002, 0.003, 0.008), 0.92 * slot);
    float lip = (1.0 - smoothstep(0.0, 1.6 * fl, abs(abs(vL.z) - w))) * top;
    col += uKeyCol * vec3(0.35, 0.5, 0.9) * 0.35 * lip * pool * shade;
  } else {
    // bridge brass
    vec3 F0 = vec3(0.98, 0.7, 0.33);
    float top = step(0.9, N.y);
    float bevel = step(0.3, N.y) * (1.0 - top);
    // Geneva stripes: bands across local x; the grain direction leans the other way in every other band
    float sw = 0.085;
    float bx = vL.x / sw;
    float band = floor(bx);
    float odd = mod(band, 2.0);
    float fb = fract(bx);
    float edge = min(fb, 1.0 - fb) * sw;
    float lean = mix(-0.55, 0.55, odd);
    vec3 T = normalize(vec3(cos(lean), 0.0, sin(lean)));
    vec3 B = vec3(-T.z, 0.0, T.x);
    vec3 Hb = normalize(uBoxDir + V);
    float thb = dot(T, Hb);
    float thk = dot(T, Hk);
    float grain = 0.6 + 0.8 * mix(noise1(dot(vL.xz, B.xz) * 900.0 + band * 17.0), 0.5, smoothstep(0.2, 0.8, 900.0 * fx));
    // each band arcs a little: the cutter's sweep
    float sweep = 0.75 + 0.25 * cos((fb - 0.5) * 3.1416);
    vec3 topCol = F0 * (room(R) * 0.6
      + uBoxCol * grain * sweep * (0.08 + 1.1 * exp(-thb * thb / 0.045)) * (0.25 + 0.75 * slab)
      + uKeyCol * pool * shade * grain * (0.03 + 0.55 * exp(-thk * thk / 0.012)) * (0.3 + nl));
    topCol *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, max(0.003, 1.5 * fx), edge));
    vec3 F = F0 + (1.0 - F0) * fres;
    vec3 polished = F * (room(R) + uBoxCol * box(R, uBoxSize * 1.4) * 1.2 + uKeyCol * pool * shade * (1.6 * pow(max(dot(N, Hk), 0.0), 140.0) + 0.12 * nl)
      + uRimCol * (2.2 * pow(max(dot(N, Hr), 0.0), 40.0)));
    // the walls are straight-grained and matt
    vec3 wall = F0 * (room(R) * 0.8 + uKeyCol * pool * shade * 0.07 * nl + uRimCol * 0.5 * max(dot(N, uRimDir), 0.0)) * (0.35 + 0.65 * smoothstep(0.0, 0.1, vW.y));
    col = mix(wall, polished, bevel);
    col = mix(col, topCol, top);
  }
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
  gl_FragColor = vec4(col * uOpacity, uOpacity);
}
`;

/**
 * @param {any} THREE
 * @param {number} tier
 * @param {Record<string, { value: any }>} shared the act's light uniforms (uKeyDir, uKeyCol, uRimDir, uRimCol, uBoxDir, uBoxCol, uBoxSize, uPool, uPoolR, uFog, uFogCol, uGear)
 */
export function createDressing(THREE, tier, shared) {
  const geo = (/** @type {ReturnType<typeof buildDressing>} */ d) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3));
    g.setAttribute('aKind', new THREE.BufferAttribute(d.kind, 1));
    g.setAttribute('aLocal', new THREE.BufferAttribute(d.local, 3));
    g.setIndex(new THREE.BufferAttribute(d.index, 1));
    return g;
  };
  const data = buildDressing(tier);
  const geometry = geo(data);
  const hubData = buildHubJewel(tier);
  const hubGeometry = geo(hubData);
  const uniforms = { ...shared, uOpacity: { value: 1 } };
  const material = new THREE.ShaderMaterial({ name: 'gears:dressing', uniforms, vertexShader: DRESS_VERT, fragmentShader: DRESS_FRAG, transparent: true });
  material.side = THREE.DoubleSide;
  premultipliedBlend(THREE, material, 'over');
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'gears:dressing';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1.2;
  // the idler's cap jewel: the act moves it with the idler (hub.position)
  const hub = new THREE.Mesh(hubGeometry, material);
  hub.name = 'gears:hub-jewel';
  hub.frustumCulled = false;
  hub.renderOrder = 1.6;
  mesh.add(hub);
  return {
    object3D: mesh,
    hub,
    uniforms,
    material,
    tier,
    triangles: data.triangles + hubData.triangles,
    dispose() {
      hubGeometry.dispose();
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}

export const TRAIN_CENTRES = Object.freeze({ idler: Object.freeze(IDLER), pinion: Object.freeze(PINION) });
