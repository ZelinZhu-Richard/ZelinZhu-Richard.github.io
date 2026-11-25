// The scene is a function of (shot, viewport). composeShot returns plain
// arrays: weighted polylines ("chains"), dots, label anchors and the camera.
// ink.js turns them into WebGL ribbons; the same output can be checked in Node.

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { SHOTS } from './shots.js';
import { makeNoise3, makeRng } from './rng.js';
import { norm, cross, dot } from './knots.js';

export const HEX = {
  night: '#100f15',
  stage: '#08070b',
  ink: '#ece9e1',
  muted: '#a8a398',
  faint: '#7a766d',
  line: '#2d2b34',
  accent: '#e8743b',
};

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export function lin(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [toLin(((n >> 16) & 255) / 255), toLin(((n >> 8) & 255) / 255), toLin((n & 255) / 255)];
}
// Colours stay in display (sRGB) space: lines are blended the way ink and
// paint mix on screen, so an alpha of 0.1 reads as a tenth of the way to ink.
export function srgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export const COL = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, srgb(v)]));

// Ribbon rules shared by the shader and the Node check.
export const RIBBON = { minW: 1.0, haloBase: 0.9, haloK: 0.25, haloMax: 4.5, hatchSpacing: 3.6 };

const R0 = 0.006; // twig radius (world units)
const NPIPE = 2.3; // pipe model exponent: r^n = sum of child r^n
const AGE = 0.45; // secondary thickening: older wood is relatively thicker
const KNOT_WEIGHT = 16;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function layoutFor(w, h) {
  return w / h < 0.82 ? 'portrait' : 'desktop';
}

export function makeCamera(spec, w, h) {
  const cam = new THREE.PerspectiveCamera(spec.fov, w / h, 0.05, 9000);
  cam.position.set(spec.eye[0], spec.eye[1], spec.eye[2]);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3(spec.target[0], spec.target[1], spec.target[2]));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  if (spec.anchor) {
    // Lens shift: move the image so the anchor lands on `at`, keeping verticals.
    const v = new THREE.Vector3(spec.anchor[0], spec.anchor[1], spec.anchor[2]).project(cam);
    const e = cam.projectionMatrix.elements;
    e[8] += v.x - (spec.at[0] * 2 - 1);
    e[9] += v.y - (1 - spec.at[1] * 2);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  return cam;
}

// Fast world -> CSS px projection. out = [x, y, depth]
export function projector(cam, w, h) {
  const v = cam.matrixWorldInverse.elements;
  const p = cam.projectionMatrix.elements;
  const f = (x, y, z, o = [0, 0, 0]) => {
    const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
    const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
    const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
    const d = -vz;
    const cx = p[0] * vx + p[8] * vz;
    const cy = p[5] * vy + p[9] * vz;
    o[0] = ((cx / d) * 0.5 + 0.5) * w;
    o[1] = (0.5 - (cy / d) * 0.5) * h;
    o[2] = d;
    return o;
  };
  f.ppu = p[5] * h * 0.5; // CSS px per world unit at view depth 1
  f.w = w;
  f.h = h;
  return f;
}

class Chain {
  constructor(opts = {}) {
    this.p = [];
    this.w = [];
    this.c = [];
    this.a = [];
    this.h = [];
    this.layer = 3;
    this.hatch = 1;
    this.dash = 0;
    this.chunk = 12;
    Object.assign(this, opts);
  }
  push(x, y, z, w, c, a, h) {
    this.p.push(x, y, z);
    this.w.push(w);
    this.c.push(c[0], c[1], c[2]);
    this.a.push(a);
    this.h.push(h);
  }
  get n() {
    return this.w.length;
  }
}

// Catmull-Rom subdivision for close shots so ribbons stay round.
function subdivide(ch, k) {
  if (k <= 1 || ch.n < 3) return ch;
  const out = new Chain({ layer: ch.layer, hatch: ch.hatch, dash: ch.dash, chunk: ch.chunk * k });
  const n = ch.n;
  const P = (i) => {
    const j = clamp(i, 0, n - 1);
    return [ch.p[3 * j], ch.p[3 * j + 1], ch.p[3 * j + 2]];
  };
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    for (let s = 0; s < k; s++) {
      const t = s / k;
      const t2 = t * t;
      const t3 = t2 * t;
      const q = [0, 1, 2].map(
        (m) => 0.5 * (2 * p1[m] + (-p0[m] + p2[m]) * t + (2 * p0[m] - 5 * p1[m] + 4 * p2[m] - p3[m]) * t2 + (-p0[m] + 3 * p1[m] - 3 * p2[m] + p3[m]) * t3),
      );
      const L = (arr, j) => arr[i] + (arr[i + 1] - arr[i]) * t;
      const c = [0, 1, 2].map((m) => ch.c[3 * i + m] + (ch.c[3 * (i + 1) + m] - ch.c[3 * i + m]) * t);
      out.push(q[0], q[1], q[2], L(ch.w), c, L(ch.a), L(ch.h));
    }
  }
  out.push(ch.p[3 * n - 3], ch.p[3 * n - 2], ch.p[3 * n - 1], ch.w[n - 1], [ch.c[3 * n - 3], ch.c[3 * n - 2], ch.c[3 * n - 1]], ch.a[n - 1], ch.h[n - 1]);
  return out;
}

// Rough boxes for the text blocks (CSS px), used to keep stars and detail out of them.
export function textBoxes(blocks, W, H) {
  return blocks.map((b) => {
    const lines = b.html.split('<br>');
    const plain = lines.map((l) => l.replace(/<[^>]+>/g, ''));
    const mono = b.cls.includes('mono');
    const per = mono ? 0.72 : b.cls.includes('word') ? 0.42 : 0.46;
    let w = Math.max(...plain.map((l) => l.length)) * b.size * per;
    if (b.cls.includes('links')) w += ((b.html.match(/<a /g) || []).length - 1) * 2.6 * b.size;
    let nl = lines.length;
    if (b.width && w > b.width) {
      nl = Math.ceil(w / b.width);
      w = b.width;
    }
    const lh = mono ? 1.6 : b.cls.includes('body') ? 1.5 : 1.06;
    const h = nl * b.size * lh;
    const x = b.x * W - b.anchor[0] * w;
    const y = b.y * H - b.anchor[1] * h;
    return { x, y, w, h };
  });
}

export function composeShot(id, W, H) {
  const shot = SHOTS[id] || SHOTS.hero;
  const world = buildWorld();
  const layout = layoutFor(W, H);
  const camSpec = shot.cam[layout];
  const cam = makeCamera(camSpec, W, H);
  if (shot.horizon !== false) snapHorizon(cam, camSpec.eye, W, H);
  const P = projector(cam, W, H);
  const eye = camSpec.eye;
  const out = { id, layout, cam, P, chains: [], dots: [], labels: [], text: shot.text[layout] || [], W, H };
  const boxes = textBoxes(out.text, W, H);
  out.boxes = boxes;
  const fog = shot.fog || [10, 60, 0.3];
  const fogA = (d) => 1 - (1 - fog[2]) * smooth(fog[0], fog[1], d);
  const tmp = [0, 0, 0];

  // Screen-space clearing behind a big word (repeat).
  const clearA = (sx, sy) => {
    const c = shot.clear;
    if (!c) return 1;
    const dx = (sx / W - c.cx) / c.rx;
    const dy = (sy / H - c.cy) / c.ry;
    const r = Math.sqrt(dx * dx + dy * dy);
    return c.keep + (1 - c.keep) * smooth(0.7, 1.25, r);
  };

  addStars(out, world, shot, P, eye, boxes);
  if (shot.far) addFarTrees(out, world, shot, P, boxes);
  if (shot.horizon !== false) addHorizon(out, shot, P, eye, W, H);
  const treeInfo = addTree(out, world, shot, P, eye, fogA, clearA);
  if (shot.knots !== false && (shot.knots || shot.tree.growth > 0.89)) addKnots(out, world, shot, P, eye, fogA, clearA, treeInfo);
  if (shot.roots) addRoots(out, world, shot, P, eye, fogA);
  if (shot.neuron) addNeuronExtras(out, world, shot, P, eye, fogA, treeInfo);
  addSeed(out, shot, P);
  if (shot.labels) addLabels(out, world, P);
  return out;
}

function addStars(out, world, shot, P, eye, boxes) {
  if (!shot.stars) return;
  const o = [0, 0, 0];
  for (const s of world.stars) {
    const x = eye[0] + s.d[0] * 4000;
    const y = eye[1] + s.d[1] * 4000;
    const z = eye[2] + s.d[2] * 4000;
    P(x, y, z, o);
    if (o[2] <= 0 || o[0] < 4 || o[0] > P.w - 4 || o[1] < 4 || o[1] > P.h - 4) continue;
    let inBox = false;
    for (const b of boxes) if (o[0] > b.x - 30 && o[0] < b.x + b.w + 30 && o[1] > b.y - 30 && o[1] < b.y + b.h + 30) inBox = true;
    if (inBox) continue;
    out.dots.push({ p: [x, y, z], r: s.r, c: COL.muted, a: s.a * shot.stars, halo: 0, layer: 0 });
  }
}

// Nudge the lens shift (under half a pixel) so the horizon hairline sits on
// a pixel centre and stays crisp at 1x and 2x.
function snapHorizon(cam, eye, W, H) {
  const f = new THREE.Vector3();
  cam.getWorldDirection(f);
  f.y = 0;
  if (f.lengthSq() < 1e-6) return;
  f.normalize();
  const P = projector(cam, W, H);
  const o = P(eye[0] + f.x * 3000, 0, eye[2] + f.z * 3000);
  const delta = Math.floor(o[1]) + 0.5 - o[1];
  const e = cam.projectionMatrix.elements;
  e[9] += (2 * delta) / H;
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}

function addHorizon(out, shot, P, eye, W, H) {
  // A straight chord on the ground plane far ahead: it projects to one level hairline.
  const cam = out.cam;
  const f = new THREE.Vector3();
  cam.getWorldDirection(f);
  f.y = 0;
  if (f.lengthSq() < 1e-6) return;
  f.normalize();
  const r = new THREE.Vector3(-f.z, 0, f.x);
  const R = 3000;
  const ch = new Chain({ layer: 2, hatch: 0, chunk: 400 });
  const o = [0, 0, 0];
  const seed = [0, 0, 0];
  P(0, 0, 0, seed);
  const glow = shot.horizonGlow || 0;
  const N = 160;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 - 1;
    const x = eye[0] + f.x * R + r.x * R * 6 * t;
    const z = eye[2] + f.z * R + r.z * R * 6 * t;
    P(x, 0, z, o);
    const g = glow * Math.exp(-(((o[0] - seed[0]) / (0.2 * W)) ** 2));
    ch.push(x, 0, z, -1.0, mix3(COL.line, COL.faint, g), 1, 0);
  }
  out.chains.push(ch);
  P(eye[0] + f.x * R, 0, eye[2] + f.z * R, o);
  out.horizonY = o[1];
}

function addFarTrees(out, world, shot, P, boxes) {
  const o = [0, 0, 0];
  const o2 = [0, 0, 0];
  for (const pl of world.farPlaces) {
    P(pl.x, 0, pl.z, o);
    P(pl.x, pl.s * 1.3, pl.z, o2);
    if (o[2] <= 1) continue;
    const half = Math.abs(o[1] - o2[1]);
    if (o[0] < -half || o[0] > P.w + half || o2[1] > P.h + 4 || o[1] < -4) continue;
    let hit = false;
    for (const b of boxes) if (o[0] + half > b.x - 24 && o[0] - half < b.x + b.w + 24 && o[1] > b.y - 12 && o2[1] < b.y + b.h + 12) hit = true;
    if (hit) continue;
    const T = world.far[pl.v];
    const cr = Math.cos(pl.rot);
    const sr = Math.sin(pl.rot);
    const distA = 0.3 - 0.16 * smooth(40, 260, pl.dist);
    const a = distA * (shot.far || 1);
    for (const chain of T.chains) {
      const ch = new Chain({ layer: 1, hatch: 0, chunk: 1000 });
      for (const i of chain) {
        const lx = T.x[i] * pl.s;
        const lz = T.z[i] * pl.s;
        const x = pl.x + lx * cr - lz * sr;
        const z = pl.z + lx * sr + lz * cr;
        const y = T.y[i] * pl.s;
        const rr = 0.0016 * Math.pow(T.weight[i], 1 / NPIPE) * pl.s;
        ch.push(x, y, z, 2 * rr, COL.faint, a, 0);
      }
      if (ch.n > 1) out.chains.push(ch);
    }
  }
}

function addSeed(out, shot, P) {
  if (!shot.seed) return;
  const o = P(0, 0, 0);
  if (o[2] <= 0 || o[0] < 0 || o[0] > P.w || o[1] < 0 || o[1] > P.h) return;
  if (shot.seed === 'accent') out.dots.push({ p: [0, 0, 0], r: 4.4, c: COL.accent, a: 1, halo: 3.5, layer: 4 });
  else out.dots.push({ p: [0, 0, 0], r: 2.2, c: COL.ink, a: 0.85, halo: 2, layer: 4 });
}

// ---------------------------------------------------------------------------
// The tree

function addTree(out, world, shot, P, eye, fogA, clearA) {
  const T = world.tree;
  const st = shot.tree;
  const g = st.growth;
  const n = T.count;
  const arr = T.arr;
  const knotOfStemEnd = new Map();
  world.knots.forEach((kn) => knotOfStemEnd.set(kn.stem[kn.stem.length - 1], kn.k));
  const stemIndex = new Map();
  world.knots.forEach((kn) => kn.stem.forEach((id, j) => stemIndex.set(id, [kn, j])));

  // Pipe model over what has arrived so far.
  const wgt = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    if (arr[i] > g) continue;
    if (wgt[i] === 0) wgt[i] = knotOfStemEnd.has(i) ? KNOT_WEIGHT : 1;
    const p = T.parent[i];
    if (p >= 0) wgt[p] += wgt[i];
  }
  const radius = (i) => (arr[i] > g ? R0 : R0 * Math.pow(wgt[i], 1 / NPIPE) * (0.78 + AGE * Math.max(0, g - arr[i])));

  // Distance behind the growth front (world units), for the orange tip.
  const tau = T.treeTime;
  const frontS = g < tau ? T.S * Math.pow(g / tau, 1 / T.timePower) : Infinity;
  const accent = new Map(); // node -> distance behind an accent tip
  if (st.accentTip) pickAccentTip(T, P, out, accent);
  const frontDist = (i) => {
    if (accent.has(i)) return accent.get(i);
    if (!st.front) return Infinity;
    const si = stemIndex.get(i);
    if (si) {
      const [kn, j] = si;
      const a0 = arr[kn.tip];
      const len = kn.stem.length;
      const fj = ((g - a0) / (kn.t0 - a0)) * len - 1;
      return fj >= len - 1 ? Infinity : (fj - j) * 0.08;
    }
    return frontS - T.s[i];
  };
  const frontLen = st.frontLen || 0.3;

  const o = [0, 0, 0];
  const style = (x, y, z, r, dist, dim) => {
    P(x, y, z, o);
    const d = Math.max(o[2], 0.01);
    const px = (2 * r * P.ppu) / d;
    let col = mix3(COL.muted, COL.ink, smooth(0.7, 3.2, px));
    const fa = fogA(d);
    let a = fa * dim * clearA(o[0], o[1]);
    col = mix3(COL.faint, col, fa);
    if (dist < frontLen) {
      const t = smooth(0, 1, Math.max(0, dist) / frontLen);
      col = mix3(COL.accent, col, t);
      a = a + (1 - a) * (1 - t);
    }
    return { col, a };
  };

  const neuronTag = shot.neuron || 0;
  const noise = makeNoise3(4242);
  // the focused limb fades in from the trunk to the soma
  const baseRamp = new Map();
  if (neuronTag) {
    const gl = world.limbs[neuronTag];
    const si = Math.floor(gl.length * 0.24);
    gl.forEach((id, j) => {
      if (j < si) baseRamp.set(id, j / si);
    });
  }
  const ghost = st.ghost;
  const sub = shot.subdiv || 1;
  const info = { neuronChains: [], somaNode: -1 };
  if (neuronTag) {
    const g4 = world.limbs[neuronTag];
    info.somaNode = g4[Math.floor(g4.length * 0.24)];
    info.soma = T.pos(info.somaNode);
  }

  for (const chain of T.chains) {
    const first = chain.length > 1 ? chain[1] : chain[0];
    const tag = T.tag[first];
    const tipNode = chain[chain.length - 1];
    // space colonization leaves short thorn-like stubs; a mature crown drops them
    if (g > 0.6 && chain.length <= 4 && T.kids[tipNode].length === 0 && arr[tipNode] <= g && tag < 10) continue;
    let dim = 1;
    if (st.dim && st.focus == null) dim = st.dim;
    if (st.focus != null) {
      const own = tag === st.focus || (tag >= 10 && T.tag[world.knots[tag - 10].tip] === st.focus);
      dim = own ? 1 : st.dim;
    }
    const isNeuron = neuronTag && tag === neuronTag;
    const ink = new Chain({ chunk: 12 });
    const gh = ghost ? new Chain({ hatch: 0, dash: ghost.dash, chunk: 16 }) : null;
    // halo ramps in from the fork so a child never cuts its parent
    const p0 = chain[0];
    const ramp = Math.max(0.12, 5 * radius(p0));
    let along = 0;
    let stopped = -1;
    for (let j = 0; j < chain.length; j++) {
      const i = chain[j];
      if (j > 0) along += Math.hypot(T.x[i] - T.x[chain[j - 1]], T.y[i] - T.y[chain[j - 1]], T.z[i] - T.z[chain[j - 1]]);
      if (arr[i] <= g) {
        let x = T.x[i];
        let y = T.y[i];
        let z = T.z[i];
        let r = radius(i);
        if (isNeuron && T.tag[i] === neuronTag) {
          const q = neuronWiggle(noise, x, y, z, info.soma);
          x = q[0];
          y = q[1];
          z = q[2];
          r *= 0.8;
        }
        let vd = dim;
        if (st.focus != null) vd = T.tag[i] === st.focus ? 1 : st.dim;
        if (baseRamp.has(i)) vd = st.dim + (1 - st.dim) * smooth(0, 1, baseRamp.get(i));
        const fd = frontDist(i);
        if (fd < frontLen) r = Math.max(r, R0 * (1 + 0.9 * (1 - Math.max(0, fd) / frontLen)));
        if (st.minR) r = Math.max(r, st.minR);
        const s = style(x, y, z, r, fd, vd);
        const h = j === 0 ? 0 : smooth(0, ramp, along);
        ink.push(x, y, z, 2 * r, s.col, s.a, h);
      } else {
        if (j > 0 && arr[chain[j - 1]] <= g) {
          const pi = chain[j - 1];
          const f = (g - arr[pi]) / (arr[i] - arr[pi]);
          const x = T.x[pi] + (T.x[i] - T.x[pi]) * f;
          const y = T.y[pi] + (T.y[i] - T.y[pi]) * f;
          const z = T.z[pi] + (T.z[i] - T.z[pi]) * f;
          const s = style(x, y, z, R0, st.front ? 0 : Infinity, dim);
          ink.push(x, y, z, 2 * R0 * 1.4, s.col, s.a, 1);
          if (gh) gh.push(x, y, z, 2 * R0, COL.muted, ghost.alpha, 0);
        }
        stopped = j;
        break;
      }
    }
    // taper alpha at true tips
    const last = chain[chain.length - 1];
    if (stopped < 0 && T.kids[last].length === 0 && !knotOfStemEnd.has(last) && !accent.has(last) && ink.n > 2) {
      ink.a[ink.n - 1] *= 0.45;
      ink.a[ink.n - 2] *= 0.75;
      ink.w[ink.n - 1] *= 0.7;
    }
    if (ink.n > 1) {
      const c = subdivide(ink, sub);
      out.chains.push(c);
      if (isNeuron) info.neuronChains.push(c);
    }
    if (gh && stopped >= 0) {
      for (let j = Math.max(stopped, 0); j < chain.length; j++) {
        const i = chain[j];
        if (arr[i] <= g) continue;
        const x = (arr[i] - g) / ghost.span;
        if (x > 1) break;
        P(T.x[i], T.y[i], T.z[i], o);
        gh.push(T.x[i], T.y[i], T.z[i], 2 * R0, COL.muted, ghost.alpha * Math.pow(1 - x, 1.6) * fogA(o[2]), 0);
      }
      if (gh.n > 1) out.chains.push(gh);
    }
  }
  info.wgt = wgt;
  return info;
}

function neuronWiggle(noise, x, y, z, soma) {
  const d = Math.hypot(x - soma[0], y - soma[1], z - soma[2]);
  const amp = 0.05 * smooth(0.2, 1.6, d);
  const f = 2.6;
  return [x + amp * noise(x * f, y * f, z * f), y + amp * noise(x * f + 17, y * f, z * f), z + amp * noise(x * f, y * f + 31, z * f)];
}

// For the repeat frame: one twig keeps growing. Pick a near, on-screen tip
// close to the right shoulder of the word.
function pickAccentTip(T, P, out, accent) {
  const o = [0, 0, 0];
  const target = out.layout === 'portrait' ? [0.7, 0.36] : [0.73, 0.33];
  let best = -1;
  let bestS = Infinity;
  for (let i = 0; i < T.count; i++) {
    if (T.kids[i].length || T.tag[i] >= 10) continue;
    P(T.x[i], T.y[i], T.z[i], o);
    if (o[2] < 1.5 || o[0] < 0 || o[0] > P.w || o[1] < 0 || o[1] > P.h) continue;
    const s = Math.hypot(o[0] / P.w - target[0], (o[1] / P.h - target[1]) * (P.h / P.w)) + 0.02 * o[2];
    if (s < bestS) {
      bestS = s;
      best = i;
    }
  }
  if (best < 0) return;
  let i = best;
  const sTip = T.s[best];
  while (i >= 0 && sTip - T.s[i] < 0.6) {
    accent.set(i, sTip - T.s[i]);
    i = T.parent[i];
  }
}

// ---------------------------------------------------------------------------
// Knots

const LIGHT = (() => {
  const l = [-0.45, 0.7, 0.55];
  const m = Math.hypot(...l);
  return l.map((v) => v / m);
})();

function addKnots(out, world, shot, P, eye, fogA, clearA) {
  const st = shot.tree;
  const g = st.growth;
  const o = [0, 0, 0];
  const knotW = st.knotW || 0.01;
  const T = world.tree;
  for (const kn of world.knots) {
    const dim = st.dim || 1;
    const n = kn.pts.length / 3;
    let prog = g >= kn.t1 ? 1 : g <= kn.t0 ? 0 : (g - kn.t0) / (kn.t1 - kn.t0);
    const daily = st.dailyFront && kn.k === 6;
    if (daily) prog = bestVisibleProgress(kn, eye, 0.6, 0.88);
    if (prog <= 0) continue;
    P(kn.c[0], kn.c[1], kn.c[2], o);
    if (o[2] <= 0.2) continue;
    const Rpx = (kn.R * P.ppu) / o[2];
    if (o[0] < -Rpx * 2 || o[0] > P.w + Rpx * 2 || o[1] < -Rpx * 2 || o[1] > P.h + Rpx * 2) continue;
    const segPx = (kn.length / n) * (P.ppu / o[2]);
    const step = Math.max(1, Math.floor(3.2 / Math.max(segPx, 1e-3)));
    const last = Math.max(1, Math.floor(prog * (n - 1)));
    const hover = st.hover === kn.k;
    const endAlong = kn.along[last];
    const liftLen = 1.15 * kn.R;
    // An opaque core, sorted with the thread chunks: the far half of the ball
    // (and anything behind it) hides, so each knot reads as a wound stone.
    {
      const core = new Chain({ hatch: 0, chunk: 200 });
      const f = [eye[0] - kn.c[0], eye[1] - kn.c[1], eye[2] - kn.c[2]];
      const fl = Math.hypot(f[0], f[1], f[2]);
      const Az = [f[0] / fl, f[1] / fl, f[2] / fl];
      const Ux = norm(cross([0, 1, 0], Az));
      const Vy = cross(Az, Ux);
      const rc = kn.R * 0.965;
      for (let i = 0; i <= 50; i++) {
        const th = (i / 48) * Math.PI * 2;
        // a ring whose inner edge crosses the centre: a filled disc (overlapping its own start)
        const cx = Math.cos(th) * rc * 0.45;
        const cy = Math.sin(th) * rc * 0.45;
        core.push(kn.c[0] + Ux[0] * cx + Vy[0] * cy, kn.c[1] + Ux[1] * cx + Vy[1] * cy, kn.c[2] + Ux[2] * cx + Vy[2] * cy, rc * 1.1, COL.night, 1, 0);
      }
      out.chains.push(core);
    }
    const ch = new Chain({ hatch: 0, chunk: 10 });
    const push = (x, y, z, nx, ny, nz, orange) => {
      P(x, y, z, o);
      const tx = eye[0] - x;
      const ty = eye[1] - y;
      const tz = eye[2] - z;
      const tl = Math.hypot(tx, ty, tz);
      const facing = (nx * tx + ny * ty + nz * tz) / tl;
      const lam = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
      let a = (0.22 + 0.78 * smooth(-0.3, 0.35, facing)) * (0.62 + 0.38 * clamp(0.5 + 0.5 * lam, 0, 1));
      a *= fogA(o[2]) * clearA(o[0], o[1]) * dim;
      let col = mix3(COL.muted, COL.ink, clamp(0.5 + 0.6 * lam, 0, 1));
      let w = knotW;
      if (orange < 1) {
        const t = smooth(0, 1, orange);
        col = mix3(COL.accent, col, t);
        a = a + (1 - a) * (1 - t) * smooth(-0.6, 0.2, facing);
        w = knotW * (1 + 0.7 * (1 - t));
      }
      ch.push(x, y, z, w, col, a, 1);
    };
    const idx = [];
    for (let i = 0; i < last; i += step) idx.push(i);
    idx.push(last);
    for (const i of idx) {
      let x = kn.pts[3 * i];
      let y = kn.pts[3 * i + 1];
      let z = kn.pts[3 * i + 2];
      const nx = kn.nrm[3 * i];
      const ny = kn.nrm[3 * i + 1];
      const nz = kn.nrm[3 * i + 2];
      let orange = 1;
      const behind = endAlong - kn.along[i];
      if (hover && behind < liftLen) {
        const e = 1 - behind / liftLen;
        const lift = kn.R * 0.42 * e * e * e;
        x += nx * lift;
        y += ny * lift;
        z += nz * lift;
        orange = behind / (0.85 * kn.R);
      }
      if (daily) orange = behind / 0.55;
      push(x, y, z, nx, ny, nz, Math.min(1, orange));
    }
    if (hover) {
      // free end curling up off the ball
      const i = last;
      const nx = kn.nrm[3 * i];
      const ny = kn.nrm[3 * i + 1];
      const nz = kn.nrm[3 * i + 2];
      const tx = kn.pts[3 * i] - kn.pts[3 * i - 3];
      const ty = kn.pts[3 * i + 1] - kn.pts[3 * i - 2];
      const tz = kn.pts[3 * i + 2] - kn.pts[3 * i - 1];
      const tl = Math.hypot(tx, ty, tz);
      const base = [kn.pts[3 * i] + nx * kn.R * 0.42, kn.pts[3 * i + 1] + ny * kn.R * 0.42, kn.pts[3 * i + 2] + nz * kn.R * 0.42];
      for (let s = 1; s <= 12; s++) {
        const u = s / 12;
        const L = kn.R * 0.4 * u;
        const bend = u * u;
        const dx = (tx / tl) * (1 - bend * 0.6) + nx * bend * 0.9;
        const dy = (ty / tl) * (1 - bend * 0.6) + ny * bend * 0.9;
        const dz = (tz / tl) * (1 - bend * 0.6) + nz * bend * 0.9;
        push(base[0] + dx * L, base[1] + dy * L, base[2] + dz * L, nx, ny, nz, 0);
      }
    }
    if (ch.n > 1) out.chains.push(ch);
  }
}

function bestVisibleProgress(kn, eye, lo, hi) {
  const n = kn.pts.length / 3;
  let best = hi;
  let bestF = -2;
  for (let p = lo; p <= hi; p += 0.004) {
    const i = Math.floor(p * (n - 1));
    const tx = eye[0] - kn.pts[3 * i];
    const ty = eye[1] - kn.pts[3 * i + 1];
    const tz = eye[2] - kn.pts[3 * i + 2];
    const tl = Math.hypot(tx, ty, tz);
    const f = (kn.nrm[3 * i] * tx + kn.nrm[3 * i + 1] * ty + kn.nrm[3 * i + 2] * tz) / tl;
    // prefer a front-facing end that sits a little off centre
    const score = f - Math.abs(f - 0.8);
    if (score > bestF) {
      bestF = score;
      best = p;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Roots, with one orange pulse climbing toward the seed

function addRoots(out, world, shot, P, eye, fogA) {
  const T = world.roots;
  const o = [0, 0, 0];
  const r0 = 0.0042;
  const roots = shot.roots;
  // Choose the pulse: a long root ending on screen right of the seed; the pulse
  // sits where that root runs most nearly vertical, head toward the seed.
  const pulse = new Map();
  const PL = 0.75;
  if (roots.pulse) {
    let best = null;
    for (let i = 0; i < T.count; i++) {
      if (T.kids[i].length) continue;
      P(T.x[i], T.y[i], T.z[i], o);
      if (o[0] < P.w * 0.5 || o[0] > P.w * 0.94 || o[1] > P.h * 0.9 || T.s[i] < 2.2) continue;
      let j = i;
      while (j >= 0) {
        const p = T.parent[j];
        if (p < 0) break;
        const f = T.s[j] / T.s[i];
        if (f > 0.3 && f < 0.75) {
          // verticality over the next few nodes down the path
          let k = j;
          let n = 0;
          let vy = 0;
          let len = 0;
          while (k >= 0 && n < 6) {
            const q = T.parent[k];
            if (q < 0) break;
            vy += T.y[q] - T.y[k];
            len += Math.hypot(T.x[q] - T.x[k], T.y[q] - T.y[k], T.z[q] - T.z[k]);
            k = q;
            n++;
          }
          P(T.x[j], T.y[j], T.z[j], o);
          const onScreen = o[0] > P.w * 0.5 && o[0] < P.w * 0.95 && o[1] > P.h * 0.45 && o[1] < P.h * 0.85;
          const score = (len > 0 ? vy / len : 0) + (onScreen ? 0.4 : -2) - Math.abs(T.z[j]) * 0.15;
          if (!best || score > best.score) best = { score, head: j, tip: i };
        }
        j = p;
      }
    }
    if (best) {
      const sh = T.s[best.head];
      let i = best.tip;
      while (i >= 0) {
        const d = T.s[i] - sh;
        if (d >= -0.02 && d < PL) pulse.set(i, Math.max(0, d));
        i = T.parent[i];
      }
      out.pulseNode = best.head;
    }
  }
  for (const chain of T.chains) {
    const ch = new Chain({ chunk: 12 });
    const p0 = chain[0];
    const ramp = Math.max(0.1, 5 * r0 * Math.pow(T.weight[p0], 1 / NPIPE));
    let along = 0;
    for (let j = 0; j < chain.length; j++) {
      const i = chain[j];
      if (j > 0) along += Math.hypot(T.x[i] - T.x[chain[j - 1]], T.y[i] - T.y[chain[j - 1]], T.z[i] - T.z[chain[j - 1]]);
      const x = T.x[i];
      const y = T.y[i];
      const z = T.z[i];
      const r = r0 * Math.pow(T.weight[i], 1 / NPIPE) * (0.8 + 0.35 * (1 - T.arr[i]));
      P(x, y, z, o);
      const fa = fogA(o[2]);
      let a = fa * (1 - 0.55 * smooth(0.2, 3.2, -y));
      let col = mix3(COL.faint, COL.muted, fa);
      const px = (2 * r * P.ppu) / o[2];
      col = mix3(col, COL.ink, 0.6 * smooth(1.0, 4.0, px));
      let wr = 2 * r;
      if (pulse.has(i)) {
        const t = pulse.get(i) / PL;
        col = mix3(COL.accent, col, smooth(0, 1, t));
        a = a + (1 - a) * (1 - t);
        wr = Math.max(wr, 0.022 * (1 - t));
      }
      ch.push(x, y, z, wr, col, a, j === 0 ? 0 : smooth(0, ramp, along));
    }
    if (ch.n > 1) {
      const last = chain[chain.length - 1];
      if (T.kids[last].length === 0 && ch.n > 2) {
        ch.a[ch.n - 1] *= 0.45;
        ch.a[ch.n - 2] *= 0.75;
      }
      out.chains.push(subdivide(ch, shot.subdiv || 1));
    }
  }
}

// ---------------------------------------------------------------------------
// Research: the focused limb as a neuron. Soma as stacked contour slices,
// dendritic spines, and a small imaging volume of depth slices.

function addNeuronExtras(out, world, shot, P, eye, fogA, info) {
  const rng = makeRng(777);
  const o = [0, 0, 0];
  const soma = info.soma;
  if (!soma) return;
  const T = world.tree;
  const roi = shot.roi || { c: [3.4, 6.5, -0.5], hu: 1.6, hv: 1.25, offsets: [-1.0, -0.5, 0, 0.5, 1.0], active: 2 };
  // Stack axis: mostly the optical axis of this view, tipped toward world z,
  // so the slices read as a stack and the soma contours nest.
  const toCam = norm([eye[0] - roi.c[0], eye[1] - roi.c[1], eye[2] - roi.c[2]]);
  const A = norm([toCam[0] * 0.72, toCam[1] * 0.72, toCam[2] * 0.72 + 0.32]);
  const U = norm(cross([0, 1, 0], A));
  const V = cross(A, U);
  const at = (c, u, v, h) => [c[0] + U[0] * u + V[0] * v + A[0] * h, c[1] + U[1] * u + V[1] * v + A[1] * h, c[2] + U[2] * u + V[2] * v + A[2] * h];

  // Soma: a teardrop body drawn as stacked contour slices.
  const sn = info.somaNode;
  const kid = T.kids[sn][0];
  const ld = [T.x[kid] - T.x[sn], T.y[kid] - T.y[sn], T.z[kid] - T.z[sn]];
  let lu = dot(ld, U);
  let lv = dot(ld, V);
  const lm = Math.hypot(lu, lv) || 1;
  lu /= lm;
  lv /= lm;
  const Rs = 0.4;
  const rings = 9;
  for (let k = 0; k < rings; k++) {
    const hgt = -Rs + (2 * Rs * (k + 0.5)) / rings;
    const prof = Math.sqrt(Math.max(0, 1 - (hgt / Rs) ** 2));
    const ch = new Chain({ hatch: 0, chunk: 12 });
    const N = 80;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      const cx = Math.cos(th);
      const cy = Math.sin(th);
      const al = cx * lu + cy * lv;
      const rr = Rs * prof * (1 + 0.55 * Math.max(0, al) ** 3 - 0.1 * Math.max(0, -al)) * (1 + 0.035 * Math.sin(3 * th + k * 0.7));
      const p = at(soma, cx * rr, cy * rr, hgt);
      P(p[0], p[1], p[2], o);
      const a = fogA(o[2]) * (0.45 + 0.5 * prof);
      ch.push(p[0], p[1], p[2], 0.0065, mix3(COL.muted, COL.ink, prof), a, 1);
    }
    out.chains.push(ch);
  }
  {
    const ch = new Chain({ hatch: 0, chunk: 12 });
    for (let i = 0; i <= 40; i++) {
      const th = (i / 40) * Math.PI * 2;
      const p = at(soma, -lu * 0.04 + Math.cos(th) * 0.085, -lv * 0.04 + Math.sin(th) * 0.085, Rs * 0.2);
      ch.push(p[0], p[1], p[2], 0.0065, COL.ink, 0.9, 1);
    }
    out.chains.push(ch);
  }

  // Basal dendrites around the soma, so the body reads as a cell.
  {
    const base = Math.atan2(lv, lu) + Math.PI;
    const grow = (p0, ang, tilt, len, w0, depth) => {
      const ch = new Chain({ hatch: 0, chunk: 12 });
      let p = p0.slice();
      let a = ang;
      let h = tilt;
      const steps = Math.max(3, Math.round(len / 0.035));
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        P(p[0], p[1], p[2], o);
        ch.push(p[0], p[1], p[2], w0 * (1 - 0.72 * f), COL.ink, fogA(o[2]) * (1 - 0.35 * f), k === 0 ? 0 : 1);
        a += rng.range(-0.16, 0.16);
        h += rng.range(-0.05, 0.05);
        const d = [Math.cos(a), Math.sin(a), h];
        const step = len / steps;
        p = [p[0] + (U[0] * d[0] + V[0] * d[1] + A[0] * d[2]) * step, p[1] + (U[1] * d[0] + V[1] * d[1] + A[1] * d[2]) * step, p[2] + (U[2] * d[0] + V[2] * d[1] + A[2] * d[2]) * step];
        if (depth < 1 && k === Math.round(steps * 0.5)) grow(p, a + rng.sign() * rng.range(0.4, 0.75), h, len * 0.5, w0 * 0.55, depth + 1);
      }
      out.chains.push(ch);
      info.neuronChains.push(ch);
    };
    [-1.35, -0.62, 0.08, 0.7, 1.3].forEach((da, k) => {
      const ang = base + da + rng.range(-0.15, 0.15);
      const start = at(soma, Math.cos(ang) * Rs * 0.7, Math.sin(ang) * Rs * 0.7, rng.range(-0.1, 0.1));
      grow(start, ang, rng.range(-0.25, 0.25), rng.range(0.55, 0.95) * (k === 2 ? 1.25 : 1), 0.032, 0);
    });
  }

  // Dendritic spines: short, sparse ticks.
  for (const c of info.neuronChains) {
    let acc = 0;
    for (let i = 1; i < c.n; i++) {
      const a3 = [c.p[3 * i - 3], c.p[3 * i - 2], c.p[3 * i - 1]];
      const b3 = [c.p[3 * i], c.p[3 * i + 1], c.p[3 * i + 2]];
      const L = Math.hypot(b3[0] - a3[0], b3[1] - a3[1], b3[2] - a3[2]);
      acc += L;
      const ds = Math.hypot(b3[0] - soma[0], b3[1] - soma[1], b3[2] - soma[2]);
      if (acc < 0.11 || ds < 0.6) continue;
      acc = rng.range(-0.04, 0.02);
      if (c.w[i] > 0.04) continue;
      const t = [(b3[0] - a3[0]) / L, (b3[1] - a3[1]) / L, (b3[2] - a3[2]) / L];
      const r = rng.unit();
      const d = norm([r[0] - t[0] * dot(r, t), r[1] - t[1] * dot(r, t), r[2] - t[2] * dot(r, t)]);
      const len = rng.range(0.025, 0.045);
      const base = c.w[i] * 0.4;
      const col = [c.c[3 * i], c.c[3 * i + 1], c.c[3 * i + 2]];
      const ch = new Chain({ hatch: 0, chunk: 4 });
      ch.push(b3[0] + d[0] * base, b3[1] + d[1] * base, b3[2] + d[2] * base, 0.007, col, c.a[i] * 0.6, 0);
      ch.push(b3[0] + d[0] * (base + len), b3[1] + d[1] * (base + len), b3[2] + d[2] * (base + len), 0.009, col, c.a[i] * 0.6, 0);
      out.chains.push(ch);
    }
  }

  // The imaging volume: a few depth slices through the arbor.
  roi.offsets.forEach((h0, m) => {
    const isAct = m === roi.active;
    const c0 = at(roi.c, 0, 0, h0);
    const corners = [
      [-roi.hu, -roi.hv],
      [roi.hu, -roi.hv],
      [roi.hu, roi.hv],
      [-roi.hu, roi.hv],
      [-roi.hu, -roi.hv],
    ];
    const frame = new Chain({ hatch: 0, chunk: 60, layer: 2.5 });
    for (let k = 0; k < 4; k++) {
      for (let q = 0; q < 12; q++) {
        const t = q / 12;
        const p = at(c0, corners[k][0] + (corners[k + 1][0] - corners[k][0]) * t, corners[k][1] + (corners[k + 1][1] - corners[k][1]) * t, 0);
        frame.push(p[0], p[1], p[2], -1, COL.faint, isAct ? 0.5 : 0.2, 0);
      }
    }
    const p0 = at(c0, corners[0][0], corners[0][1], 0);
    frame.push(p0[0], p0[1], p0[2], -1, COL.faint, isAct ? 0.5 : 0.2, 0);
    out.chains.push(frame);
    for (let k = 0; k < 4; k++) {
      const [cu, cv] = corners[k];
      const su = -Math.sign(cu);
      const sv = -Math.sign(cv);
      const tick = new Chain({ hatch: 0, chunk: 4, layer: 2.5 });
      for (const [u, v] of [
        [cu + su * 0.26, cv],
        [cu, cv],
        [cu, cv + sv * 0.26],
      ]) {
        const p = at(c0, u, v, 0);
        tick.push(p[0], p[1], p[2], -1.1, COL.muted, isAct ? 0.75 : 0.42, 0);
      }
      out.chains.push(tick);
    }
    // cross sections where dendrites pierce this slice
    for (const c of info.neuronChains) {
      for (let i = 1; i < c.n; i++) {
        const a3 = [c.p[3 * i - 3] - c0[0], c.p[3 * i - 2] - c0[1], c.p[3 * i - 1] - c0[2]];
        const b3 = [c.p[3 * i] - c0[0], c.p[3 * i + 1] - c0[1], c.p[3 * i + 2] - c0[2]];
        const da = dot(a3, A);
        const db = dot(b3, A);
        if (da * db > 0 || da === db) continue;
        const t = da / (da - db);
        const q = [a3[0] + (b3[0] - a3[0]) * t, a3[1] + (b3[1] - a3[1]) * t, a3[2] + (b3[2] - a3[2]) * t];
        const u = dot(q, U);
        const v = dot(q, V);
        if (Math.abs(u) > roi.hu || Math.abs(v) > roi.hv) continue;
        const rr = Math.max(0.04, c.w[i] * 1.5);
        const ring = new Chain({ hatch: 0, chunk: 30 });
        for (let k = 0; k <= 24; k++) {
          const th = (k / 24) * Math.PI * 2;
          const p = at(c0, u + Math.cos(th) * rr, v + Math.sin(th) * rr, 0);
          ring.push(p[0], p[1], p[2], isAct ? -1.6 : -1.0, isAct ? COL.accent : COL.muted, isAct ? 1 : 0.45, isAct ? 1 : 0);
        }
        out.chains.push(ring);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Stones: labels sit outside each knot, away from the crown.

function addLabels(out, world, P) {
  const o = [0, 0, 0];
  const c = P(0, 9.6, 0);
  const portrait = out.layout === 'portrait';
  const fs = portrait ? 10.5 * clamp(out.W / 390, 0.85, 1.35) : 11 * clamp(Math.min(out.W / 1440, out.H / 900), 0.6, 1.5);
  const discs = world.knots.map((kn) => {
    P(kn.c[0], kn.c[1], kn.c[2], o);
    return { x: o[0], y: o[1], r: (kn.R * P.ppu) / o[2] };
  });
  const placed = [];
  const hits = (b) => {
    if (b.x0 < 8 || b.y0 < 8 || b.x0 + b.w > out.W - 8 || b.y0 + b.h > out.H - 8) return true;
    for (const q of placed) if (b.x0 < q.x0 + q.w + 6 && q.x0 < b.x0 + b.w + 6 && b.y0 < q.y0 + q.h + 4 && q.y0 < b.y0 + b.h + 4) return true;
    for (const d of discs) {
      const nx = clamp(d.x, b.x0, b.x0 + b.w);
      const ny = clamp(d.y, b.y0, b.y0 + b.h);
      if (Math.hypot(nx - d.x, ny - d.y) < d.r + 3) return true;
    }
    return false;
  };
  world.knots.forEach((kn, k) => {
    const d = discs[k];
    let dx = d.x - c[0];
    let dy = d.y - c[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const name = kn.label;
    // approximate mono metrics: 0.6em advance plus 0.2em tracking
    const adv = fs * 0.8;
    const w = portrait ? Math.max(2, name.length) * adv : (name.length + 2) * adv + fs * 0.85;
    const h = portrait ? fs * 2.5 : fs * 1.2;
    const g = d.r + 10;
    const at = (cx, cy) => ({ x0: cx - w / 2, y0: cy - h / 2, w, h });
    const cands = [];
    if (!portrait) cands.push(at(d.x + dx * (g + w / 2), d.y + dy * (g + h / 2)));
    const above = at(d.x, d.y - g - h / 2);
    const below = at(d.x, d.y + g + h / 2);
    const left = at(d.x - g - w / 2, d.y);
    const right = at(d.x + g + w / 2, d.y);
    if (dy < -0.2) cands.push(above, dx < 0 ? left : right, dx < 0 ? right : left, below);
    else cands.push(dx < 0 ? left : right, below, above, dx < 0 ? right : left);
    let box = cands.find((b) => !hits(b)) || cands[0];
    placed.push(box);
    const cx = box.x0 + box.w / 2;
    const cy = box.y0 + box.h / 2;
    let align = 'center';
    let x = cx;
    if (cx < d.x - d.r) {
      align = 'right';
      x = box.x0 + box.w;
    } else if (cx > d.x + d.r) {
      align = 'left';
      x = box.x0;
    }
    out.labels.push({ num: String(k + 1).padStart(2, '0'), name, x, y: cy, align, vert: 'middle', stack: portrait, fs, box, cx: d.x, cy: d.y, r: d.r });
  });
}

// ---------------------------------------------------------------------------
// Draw order: chains are cut into short chunks; in sorted layers chunks are
// drawn far to near, each as a night halo followed by its ink.

export function orderDraws(out) {
  const P = out.P;
  const o = [0, 0, 0];
  const layers = new Map();
  for (const ch of out.chains) {
    if (ch.n < 2) continue;
    const size = Math.max(2, ch.chunk);
    const hasHalo = ch.h.some((v) => v > 0.001);
    for (let s = 0; s < ch.n - 1; s += size - 1) {
      const e = Math.min(ch.n - 1, s + size - 1);
      let depth = 0;
      let cnt = 0;
      for (let i = s; i <= e; i += Math.max(1, Math.floor((e - s) / 4))) {
        P(ch.p[3 * i], ch.p[3 * i + 1], ch.p[3 * i + 2], o);
        depth += o[2];
        cnt++;
      }
      const item = { ch, s, e, depth: depth / cnt, halo: hasHalo };
      if (!layers.has(ch.layer)) layers.set(ch.layer, []);
      layers.get(ch.layer).push(item);
    }
  }
  const draws = [];
  for (const L of [...layers.keys()].sort((a, b) => a - b)) {
    const items = layers.get(L);
    if (L === 3) items.sort((a, b) => b.depth - a.depth);
    for (const it of items) {
      if (it.halo) draws.push({ ch: it.ch, s: it.s, e: it.e, kind: 1 });
      draws.push({ ch: it.ch, s: it.s, e: it.e, kind: 0 });
    }
  }
  return draws;
}

// CSS px length along each chain, for dashes.
export function alongPx(ch, P) {
  const o = [0, 0, 0];
  const q = [0, 0, 0];
  const al = new Float32Array(ch.n);
  P(ch.p[0], ch.p[1], ch.p[2], q);
  for (let i = 1; i < ch.n; i++) {
    P(ch.p[3 * i], ch.p[3 * i + 1], ch.p[3 * i + 2], o);
    al[i] = al[i - 1] + Math.hypot(o[0] - q[0], o[1] - q[1]);
    q[0] = o[0];
    q[1] = o[1];
  }
  return al;
}
