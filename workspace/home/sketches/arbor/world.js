// The world: one tree from one seed, seven knots at seven crown tips, a finer
// mirrored root system, a few far trees and stars. Everything is seeded, so the
// world is identical on every load; shots only choose how much of it to show.

import { makeRng, makeNoise3 } from './rng.js';
import { Arbor, sampleCurve, addGuide, lobePoints, colonize, finalize } from './tree.js';
import { LAWS, norm, cross, dot } from './knots.js';

export const SEED = 20261123;

// Knots in label order. Positions are hand placed outside the crown envelope
// so each stone hangs against night at the end of its own stem.
export const KNOTS = [
  { label: 'About', c: [-7.35, 7.15, 1.85], R: 0.64, limbs: [1], end: [0.3, 0.6, 0.74] },
  { label: 'Projects', c: [-6.25, 10.55, -0.35], R: 0.56, limbs: [1, 2], end: [-0.85, 0.45, 0.25] },
  { label: 'Research', c: [-2.75, 12.75, 0.55], R: 0.58, limbs: [2], end: [0.1, 0.6, 0.79] },
  { label: 'Art', c: [0.35, 13.55, -0.9], R: 0.6, limbs: [2, 3], end: [0.3, 0.3, 0.9] },
  { label: 'Fun', c: [3.65, 12.7, 1.3], R: 0.55, limbs: [3], end: [-0.3, 0.5, 0.8] },
  { label: 'Blog', c: [6.55, 10.35, -0.15], R: 0.58, limbs: [3, 4], end: [0.2, 0.4, 0.89] },
  { label: 'Daily', c: [7.6, 7.05, 1.25], R: 0.6, limbs: [4], end: [-0.5, 0.3, 0.8] },
];

const TREE_TIME = 0.88;
const CROWN = { lobe: 900, fill: 520, dk: 0.15 }; // the crown is complete at this growth
const TIME_POWER = 2.6;

function bezier(p0, p1, p2, p3, spacing) {
  const dense = [];
  for (let i = 0; i <= 240; i++) {
    const t = i / 240;
    const a = (1 - t) ** 3;
    const b = 3 * (1 - t) ** 2 * t;
    const c = 3 * (1 - t) * t * t;
    const d = t ** 3;
    dense.push([0, 1, 2].map((k) => a * p0[k] + b * p1[k] + c * p2[k] + d * p3[k]));
  }
  return sampleCurve(dense.filter((_, i) => i % 8 === 0 || i === 240), spacing);
}

function rotateAxis(v, a, ang) {
  // Rodrigues rotation of v about unit axis a
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const k = cross(a, v);
  const d = dot(a, v) * (1 - c);
  return [v[0] * c + k[0] * s + a[0] * d, v[1] * c + k[1] * s + a[1] * d, v[2] * c + k[2] * s + a[2] * d];
}

function rotationBetween(a, b) {
  // returns a function rotating unit vector a onto unit vector b
  const ax = cross(a, b);
  const s = Math.hypot(ax[0], ax[1], ax[2]);
  const c = dot(a, b);
  if (s < 1e-8) {
    if (c > 0) return (v) => v.slice();
    const perp = norm(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    return (v) => rotateAxis(v, perp, Math.PI);
  }
  const axis = [ax[0] / s, ax[1] / s, ax[2] / s];
  const ang = Math.atan2(s, c);
  return (v) => rotateAxis(v, axis, ang);
}

function buildTree(rng) {
  const T = new Arbor();
  const D = 0.09;
  const trunkPts = sampleCurve(
    [
      [0, 0, 0],
      [0.015, 1.0, 0.01],
      [0.03, 2.0, 0.0],
      [0.03, 2.7, -0.01],
      [0.015, 3.4, 0.0],
      [0.0, 4.05, 0.0],
    ],
    D,
  );
  const root = T.add(0, 0, 0, -1, 0, 0, 1);
  const trunk = [root, ...addGuide(T, root, trunkPts, { tag: 0 })];
  const nearestY = (y) => trunk.reduce((b, i) => (Math.abs(T.y[i] - y) < Math.abs(T.y[b] - y) ? i : b), trunk[0]);
  const f1 = nearestY(2.7);
  const f4 = nearestY(3.4);
  const top = trunk[trunk.length - 1];
  const limb = (from, ctrl, tag) => {
    const wob = ctrl.map((c, i) => (i === ctrl.length - 1 ? c : [c[0] + rng.range(-0.12, 0.12), c[1] + rng.range(-0.1, 0.1), c[2] + rng.range(-0.1, 0.1)]));
    return addGuide(T, from, sampleCurve([T.pos(from), ...wob], D), { tag, sproutFrom: 0.22 });
  };
  const limbs = {
    1: limb(f1, [[-0.55, 3.2, 0.18], [-1.7, 4.2, 0.55], [-2.9, 5.3, 0.85]], 1),
    4: limb(f4, [[0.65, 3.95, -0.2], [1.85, 4.85, -0.5], [3.1, 5.75, -0.7]], 4),
    2: limb(top, [[-0.35, 4.95, -0.3], [-0.85, 6.05, -0.7], [-1.35, 7.05, -1.0]], 2),
    3: limb(top, [[0.32, 4.95, 0.3], [0.8, 6.15, 0.6], [1.3, 7.25, 0.9]], 3),
  };
  const attr = [
    ...lobePoints(rng, [-4.2, 6.8, 0.9], [2.5, 2.1, 2.0], CROWN.lobe, { floorY: 4.4 }),
    ...lobePoints(rng, [-1.8, 9.3, -0.9], [2.3, 2.1, 1.9], CROWN.lobe, { floorY: 4.4 }),
    ...lobePoints(rng, [1.8, 9.5, 0.8], [2.4, 2.1, 1.9], CROWN.lobe, { floorY: 4.4 }),
    ...lobePoints(rng, [4.4, 7.1, -0.7], [2.5, 2.0, 2.0], CROWN.lobe, { floorY: 4.4 }),
    ...lobePoints(rng, [0, 8.4, 0], [3.6, 2.5, 2.1], CROWN.fill, { floorY: 5.2, shell: 0.5 }),
  ];
  colonize(T, new Float32Array(attr), { D, di: 1.1, dk: CROWN.dk, rng, tropismW: 0.2, jitter: 0.13, maxIter: 360 });
  return { T, trunk, limbs };
}

function tipsOf(T) {
  const has = new Uint8Array(T.count);
  for (let i = 0; i < T.count; i++) if (T.parent[i] >= 0) has[T.parent[i]] = 1;
  const tips = [];
  for (let i = 0; i < T.count; i++) if (!has[i]) tips.push(i);
  return tips;
}

function buildKnots(rng, T) {
  const tips = tipsOf(T);
  const used = new Set();
  const knots = [];
  const D = 0.1;
  KNOTS.forEach((spec, k) => {
    const law = LAWS[k];
    const raw = law.make(makeRng(SEED + 101 * (k + 1)));
    const n = raw.length / 3;
    const K = spec.c;
    // Pick the crown tip that best leads toward this knot.
    let bestTip = -1;
    let bestScore = Infinity;
    for (const t of tips) {
      if (used.has(t) || !spec.limbs.includes(T.tag[t])) continue;
      const p = T.parent[t];
      if (p < 0) continue;
      const to = [K[0] - T.x[t], K[1] - T.y[t], K[2] - T.z[t]];
      const dist = Math.hypot(to[0], to[1], to[2]);
      const dir = norm([T.x[t] - T.x[p], T.y[t] - T.y[p], T.z[t] - T.z[p]]);
      const score = dist - 0.9 * dot(dir, [to[0] / dist, to[1] / dist, to[2] / dist]);
      if (score < bestScore) {
        bestScore = score;
        bestTip = t;
      }
    }
    used.add(bestTip);
    const tip = T.pos(bestTip);
    const toTree = norm([tip[0] - K[0], tip[1] - K[1], tip[2] - K[2]]);
    // Orient the law: free end toward `end`, thread start as close to the tree as possible.
    const s0 = [raw[0], raw[1], raw[2]];
    const e0 = [raw[3 * n - 3], raw[3 * n - 2], raw[3 * n - 1]];
    const endDir = norm(spec.end);
    const r1 = rotationBetween(e0, endDir);
    const s1 = r1(s0);
    const proj = (v) => {
      const d = dot(v, endDir);
      return norm([v[0] - endDir[0] * d, v[1] - endDir[1] * d, v[2] - endDir[2] * d]);
    };
    const ps = proj(s1);
    const pt = proj(toTree);
    const ang = Math.atan2(dot(cross(ps, pt), endDir), dot(ps, pt));
    const rot = (v) => rotateAxis(r1(v), endDir, ang);
    const noise = makeNoise3(SEED + 7 * k);
    const pts = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    let len = 0;
    const along = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = rot([raw[3 * i], raw[3 * i + 1], raw[3 * i + 2]]);
      const lump = law.lumpy ? law.lumpy * noise(u[0] * 2.3 + 5, u[1] * 2.3, u[2] * 2.3) : 0;
      const rr = spec.R * (1 + lump + 0.035 * (i / (n - 1)));
      pts[3 * i] = K[0] + u[0] * rr;
      pts[3 * i + 1] = K[1] + u[1] * rr;
      pts[3 * i + 2] = K[2] + u[2] * rr;
      nrm[3 * i] = u[0];
      nrm[3 * i + 1] = u[1];
      nrm[3 * i + 2] = u[2];
      if (i > 0) len += Math.hypot(pts[3 * i] - pts[3 * i - 3], pts[3 * i + 1] - pts[3 * i - 2], pts[3 * i + 2] - pts[3 * i - 1]);
      along[i] = len;
    }
    // Stem from the tip to the thread start, arriving along the thread.
    const E = [pts[0], pts[1], pts[2]];
    const nE = [nrm[0], nrm[1], nrm[2]];
    const tE = norm([pts[3] - pts[0], pts[4] - pts[1], pts[5] - pts[2]]);
    const pp = T.parent[bestTip];
    const dT = norm([tip[0] - T.x[pp], tip[1] - T.y[pp], tip[2] - T.z[pp]]);
    const L = Math.hypot(E[0] - tip[0], E[1] - tip[1], E[2] - tip[2]);
    const P1 = [tip[0] + dT[0] * L * 0.38, tip[1] + dT[1] * L * 0.38 + L * 0.05, tip[2] + dT[2] * L * 0.38];
    const P2 = [E[0] - tE[0] * L * 0.3 + nE[0] * L * 0.22, E[1] - tE[1] * L * 0.3 + nE[1] * L * 0.22, E[2] - tE[2] * L * 0.3 + nE[2] * L * 0.22];
    const stemPts = bezier(tip, P1, P2, E, D * 0.8);
    const stem = addGuide(T, bestTip, stemPts, { tag: 10 + k, sproutFrom: 2, pin: 1 });
    knots.push({ k, label: spec.label, law: law.id, c: K, R: spec.R, pts, nrm, along, length: len, tip: bestTip, stem });
  });
  return knots;
}

function buildRoots(rng) {
  const T = new Arbor();
  const D = 0.08;
  const root = T.add(0, 0, 0, -1, 0, 0, 1);
  const tap = addGuide(T, root, sampleCurve([[0, 0, 0], [0.02, -0.5, 0.0], [-0.03, -1.15, 0.05], [0.02, -1.6, 0.02]], D), { tag: 0, sproutFrom: 0.35 });
  const at = (y) => tap.reduce((b, i) => (Math.abs(T.y[i] - y) < Math.abs(T.y[b] - y) ? i : b), tap[0]);
  const lat = (from, ctrl, tag) => addGuide(T, from, sampleCurve([T.pos(from), ...ctrl], D), { tag, sproutFrom: 0.3 });
  lat(at(-0.12), [[-0.8, -0.38, 0.25], [-1.9, -0.62, 0.5], [-2.8, -0.75, 0.7]], 1);
  lat(at(-0.2), [[0.9, -0.45, -0.3], [2.1, -0.8, -0.5], [3.0, -0.95, -0.6]], 4);
  lat(at(-0.42), [[-0.5, -0.95, -0.6], [-1.0, -1.6, -1.0]], 2);
  lat(at(-0.46), [[0.5, -1.0, 0.6], [1.1, -1.7, 0.9]], 3);
  const attr = [
    ...lobePoints(rng, [-4.0, -1.3, 1.0], [2.4, 0.9, 1.8], 430, { ceilY: -0.1 }),
    ...lobePoints(rng, [-1.6, -2.4, -1.0], [2.0, 1.1, 1.6], 400, { ceilY: -0.1 }),
    ...lobePoints(rng, [1.7, -2.5, 0.9], [2.1, 1.1, 1.6], 400, { ceilY: -0.1 }),
    ...lobePoints(rng, [4.2, -1.4, -0.8], [2.4, 0.9, 1.8], 430, { ceilY: -0.1 }),
  ];
  colonize(T, new Float32Array(attr), { D, di: 0.95, dk: 0.15, rng, tropism: [0, -1, 0], tropismW: 0.06, jitter: 0.3, maxIter: 300 });
  finalize(T, { smooth: 3 });
  return T;
}

function buildFarTree(rng, variant) {
  const T = new Arbor();
  const D = 0.03;
  const root = T.add(0, 0, 0, -1, 0, 0, 1);
  const h = 0.32 + 0.08 * variant;
  addGuide(T, root, sampleCurve([[0, 0, 0], [0.01, h * 0.5, 0], [-0.01, h, 0.01]], D), { tag: 0, sproutFrom: 0.85 });
  const attr = lobePoints(rng, [0.0, h + 0.38, 0.0], [0.42 + 0.06 * variant, 0.36, 0.38], 170 + 40 * variant, { floorY: h * 0.8 });
  colonize(T, new Float32Array(attr), { D, di: 0.3, dk: 0.055, rng, tropismW: 0.25, jitter: 0.15, maxIter: 200 });
  finalize(T, { smooth: 2 });
  return T;
}

let cached = null;

export function buildWorld() {
  if (cached) return cached;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const rng = makeRng(SEED);
  const { T, trunk, limbs } = buildTree(rng);
  const knots = buildKnots(rng, T);
  const stemEnd = new Map();
  knots.forEach((kn) => stemEnd.set(kn.stem[kn.stem.length - 1], kn.k));
  finalize(T, { smooth: 3, leafWeight: (i) => (stemEnd.has(i) ? 16 : 1) });

  // Arrival times. Tree nodes by path length, stems and knot threads in their own windows.
  const n = T.count;
  const arr = new Float32Array(n);
  let S = 0;
  for (let i = 0; i < n; i++) if (T.tag[i] < 10) S = Math.max(S, T.s[i]);
  for (let i = 0; i < n; i++) if (T.tag[i] < 10) arr[i] = TREE_TIME * Math.pow(T.s[i] / S, TIME_POWER);
  knots.forEach((kn) => {
    const k = kn.k;
    const daily = k === 6;
    kn.t0 = daily ? 0.95 : 0.895 + 0.006 * k;
    kn.t1 = daily ? 1.0 : kn.t0 + 0.035;
    const a0 = arr[kn.tip];
    kn.stem.forEach((id, j) => {
      arr[id] = a0 + (kn.t0 - a0) * ((j + 1) / kn.stem.length);
    });
  });
  T.arr = arr;
  T.S = S;
  T.timePower = TIME_POWER;
  T.treeTime = TREE_TIME;

  const roots = buildRoots(rng);
  {
    let Sr = 0;
    for (let i = 0; i < roots.count; i++) Sr = Math.max(Sr, roots.s[i]);
    roots.arr = new Float32Array(roots.count);
    for (let i = 0; i < roots.count; i++) roots.arr[i] = Math.pow(roots.s[i] / Sr, 1.2);
    roots.S = Sr;
  }

  const farRng = makeRng(SEED + 9);
  const far = [0, 1, 2].map((v) => buildFarTree(farRng, v));
  const farPlaces = [];
  const placeRng = makeRng(SEED + 31);
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const dist = placeRng.range(40, 260);
    const az = side * placeRng.range(0.3, 1.35);
    farPlaces.push({
      v: i % 3,
      x: Math.sin(az) * dist,
      z: -Math.cos(az) * dist,
      s: placeRng.range(2.6, 5.2) * (dist / 120) ** 0.3,
      rot: placeRng.range(0, Math.PI * 2),
      dist,
    });
  }

  const starRng = makeRng(SEED + 77);
  const stars = [];
  for (let i = 0; i < 240; i++) {
    const az = starRng.range(-Math.PI, Math.PI);
    const el = Math.asin(starRng.range(Math.sin(0.07), Math.sin(1.2)));
    const m = starRng.next();
    stars.push({
      d: [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)],
      r: 0.55 + 0.75 * m * m,
      a: 0.22 + 0.5 * starRng.next() ** 2,
    });
  }

  cached = { tree: T, trunk, limbs, knots, roots, far, farPlaces, stars, buildMs: (typeof performance !== 'undefined' ? performance.now() : 0) - t0 };
  return cached;
}
