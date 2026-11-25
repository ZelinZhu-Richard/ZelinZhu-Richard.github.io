// Geometry builders for the instrument. Every solid carries:
//   aHatch   (u, v)  engraving coordinates; u = primary hatch, v = cross hatch
//   aTick    (a, t)  graduation coordinates (angle 0..1, depth into band); t < 0 = none
//   aOnormal         averaged normal for the inverted-hull outline
// Builders also return "edges": crease segments that become ink ribbons.

import * as THREE from 'three';

const NONE_TICK = [0, -1];

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.hat = [];
    this.tik = [];
    this.idx = [];
    this.edges = [];
  }

  vertex(p, n, h, t) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.hat.push(h[0], h[1]);
    const tt = t || NONE_TICK;
    this.tik.push(tt[0], tt[1]);
    return this.pos.length / 3 - 1;
  }

  // Triangle whose winding is fixed to agree with its vertex normals.
  tri(a, b, c) {
    const P = this.pos;
    const N = this.nrm;
    const e1x = P[3 * b] - P[3 * a], e1y = P[3 * b + 1] - P[3 * a + 1], e1z = P[3 * b + 2] - P[3 * a + 2];
    const e2x = P[3 * c] - P[3 * a], e2y = P[3 * c + 1] - P[3 * a + 1], e2z = P[3 * c + 2] - P[3 * a + 2];
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    if (cx * cx + cy * cy + cz * cz < 1e-18) return; // degenerate (lathe axis)
    const nx = N[3 * a] + N[3 * b] + N[3 * c];
    const ny = N[3 * a + 1] + N[3 * b + 1] + N[3 * c + 1];
    const nz = N[3 * a + 2] + N[3 * b + 2] + N[3 * c + 2];
    if (cx * nx + cy * ny + cz * nz < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  edge(a, b, nA, nB) {
    this.edges.push({ a, b, nA, nB });
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aHatch', new THREE.Float32BufferAttribute(this.hat, 2));
    g.setAttribute('aTick', new THREE.Float32BufferAttribute(this.tik, 2));
    g.setIndex(this.idx);
    addOutlineNormals(g);
    g.computeBoundingSphere();
    return g;
  }
}

// Average the normals of coincident vertices so the outline hull has no
// cracks at hard edges.
export function addOutlineNormals(g) {
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const n = pos.count;
  const map = new Map();
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4);
    keys[i] = k;
    let acc = map.get(k);
    if (!acc) {
      acc = [0, 0, 0];
      map.set(k, acc);
    }
    acc[0] += nrm.getX(i);
    acc[1] += nrm.getY(i);
    acc[2] += nrm.getZ(i);
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const acc = map.get(keys[i]);
    let l = Math.hypot(acc[0], acc[1], acc[2]);
    if (l < 1e-6) {
      out[3 * i] = nrm.getX(i);
      out[3 * i + 1] = nrm.getY(i);
      out[3 * i + 2] = nrm.getZ(i);
    } else {
      out[3 * i] = acc[0] / l;
      out[3 * i + 1] = acc[1] / l;
      out[3 * i + 2] = acc[2] / l;
    }
  }
  g.setAttribute('aOnormal', new THREE.BufferAttribute(out, 3));
}

const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
const norm2 = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

// Surface of revolution about +Y. profile: [[r, y], ...] from the bottom axis
// round to the top axis (counter-clockwise in the r-y half plane).
// hatch: 'auto' picks meridian lines on steep segments and concentric rings
// on flat ones; 'meridian' / 'ring' force one.
export function lathe(profile, opts = {}) {
  const { seg = 64, hatch = 'auto', smoothAngle = 30, edgeAngle = 24, tickBand = null, edges = true } = opts;
  const B = new GeoBuilder();
  const n = profile.length;
  const segN = [];
  const arc = [0];
  for (let i = 0; i < n - 1; i++) {
    const dr = profile[i + 1][0] - profile[i][0];
    const dy = profile[i + 1][1] - profile[i][1];
    segN.push(norm2(dy, -dr));
    arc.push(arc[i] + Math.hypot(dr, dy));
  }
  const DEGR = Math.PI / 180;
  const MER = 512; // meridian lines counted round the axis (a power of two keeps the seam clean)
  for (let i = 0; i < n - 1; i++) {
    const p0 = profile[i];
    const p1 = profile[i + 1];
    const len = arc[i + 1] - arc[i];
    if (len < 1e-7) continue;
    const ends = [0, 1].map((k) => {
      const nb = k === 0 ? i - 1 : i + 1;
      let nn = segN[i];
      if (nb >= 0 && nb < n - 1 && angleBetween(segN[i], segN[nb]) < smoothAngle * DEGR) {
        nn = norm2(segN[i][0] + segN[nb][0], segN[i][1] + segN[nb][1]);
      }
      return nn;
    });
    const dr = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const mode = hatch === 'auto' ? (Math.abs(dy) >= Math.abs(dr) ? 'meridian' : 'ring') : hatch;
    const ticking = tickBand && Math.abs(dr) < 1e-6 && p0[1] >= tickBand[0] - 1e-6 && p1[1] <= tickBand[1] + 1e-6;
    const base = B.pos.length / 3;
    for (let a = 0; a <= seg; a++) {
      const t = a / seg;
      const ang = t * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      for (let k = 0; k < 2; k++) {
        const pr = k === 0 ? p0 : p1;
        const nn = ends[k];
        const ringU = k === 0 ? arc[i] : arc[i + 1];
        const merU = t * MER;
        const h = mode === 'meridian' ? [merU, ringU] : [ringU, merU];
        const tk = ticking ? [t, (tickBand[1] - pr[1]) / (tickBand[1] - tickBand[0])] : null;
        B.vertex([pr[0] * c, pr[1], -pr[0] * s], [nn[0] * c, nn[1], -nn[0] * s], h, tk);
      }
    }
    for (let a = 0; a < seg; a++) {
      const v0 = base + a * 2;
      B.quad(v0, v0 + 1, v0 + 3, v0 + 2);
    }
  }
  if (edges) {
    for (let j = 1; j < n - 1; j++) {
      const r = profile[j][0];
      if (r < 0.004) continue;
      const nA = segN[j - 1];
      const nB = segN[j];
      if (angleBetween(nA, nB) < edgeAngle * DEGR) continue;
      ring3(B, r, profile[j][1], seg, nA, nB);
    }
  }
  return { geometry: B.build(), edges: B.edges };
}

function ring3(B, r, y, seg, nA, nB) {
  for (let a = 0; a < seg; a++) {
    const t0 = (a / seg) * Math.PI * 2;
    const t1 = ((a + 1) / seg) * Math.PI * 2;
    const tm = 0.5 * (t0 + t1);
    const c = Math.cos(tm);
    const s = Math.sin(tm);
    B.edge(
      [r * Math.cos(t0), y, -r * Math.sin(t0)],
      [r * Math.cos(t1), y, -r * Math.sin(t1)],
      [nA[0] * c, nA[1], -nA[0] * s],
      [nB[0] * c, nB[1], -nB[0] * s],
    );
  }
}

function signedArea(loop) {
  let a = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a * 0.5;
}

// Prism from a 2D outline with holes, extruded along +Z from z0 to z1.
// loops[0] is the outline, the rest are holes. Points must not repeat the
// first point at the end.
export function extrude(loops, z0, z1, opts = {}) {
  const { hatchAngle = 0, smoothAngle = 35, capEdges = true } = opts;
  const B = new GeoBuilder();
  const ca = Math.cos(hatchAngle);
  const sa = Math.sin(hatchAngle);
  const contour = loops[0].map((p) => new THREE.Vector2(p[0], p[1]));
  const holes = loops.slice(1).map((l) => l.map((p) => new THREE.Vector2(p[0], p[1])));
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  const all = [];
  for (const l of loops) for (const p of l) all.push(p);
  for (const cap of [
    { z: z1, n: [0, 0, 1] },
    { z: z0, n: [0, 0, -1] },
  ]) {
    const base = B.pos.length / 3;
    for (const p of all) {
      B.vertex([p[0], p[1], cap.z], cap.n, [p[0] * ca + p[1] * sa, -p[0] * sa + p[1] * ca], null);
    }
    for (const f of faces) B.tri(base + f[0], base + f[1], base + f[2]);
  }
  const DEGR = Math.PI / 180;
  loops.forEach((L, li) => {
    const n = L.length;
    const sgn = (li === 0 ? 1 : -1) * Math.sign(signedArea(L));
    const en = [];
    for (let k = 0; k < n; k++) {
      const p = L[k];
      const q = L[(k + 1) % n];
      en.push(norm2(sgn * (q[1] - p[1]), -sgn * (q[0] - p[0])));
    }
    let s = 0;
    for (let k = 0; k < n; k++) {
      const p = L[k];
      const q = L[(k + 1) % n];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const nPrev = en[(k - 1 + n) % n];
      const nNext = en[(k + 1) % n];
      const n0 = angleBetween(en[k], nPrev) < smoothAngle * DEGR ? norm2(en[k][0] + nPrev[0], en[k][1] + nPrev[1]) : en[k];
      const n1 = angleBetween(en[k], nNext) < smoothAngle * DEGR ? norm2(en[k][0] + nNext[0], en[k][1] + nNext[1]) : en[k];
      const a = B.vertex([p[0], p[1], z0], [n0[0], n0[1], 0], [z0, s], null);
      const b = B.vertex([p[0], p[1], z1], [n0[0], n0[1], 0], [z1, s], null);
      const c = B.vertex([q[0], q[1], z1], [n1[0], n1[1], 0], [z1, s + len], null);
      const d = B.vertex([q[0], q[1], z0], [n1[0], n1[1], 0], [z0, s + len], null);
      B.quad(a, b, c, d);
      if (capEdges) {
        const nw = [en[k][0], en[k][1], 0];
        B.edge([p[0], p[1], z1], [q[0], q[1], z1], [0, 0, 1], nw);
        B.edge([p[0], p[1], z0], [q[0], q[1], z0], [0, 0, -1], nw);
      }
      s += len;
    }
  });
  return { geometry: B.build(), edges: B.edges };
}

// Flat ring (washer) in the XY plane, thickness along Z. Faces carry
// graduations: a = angle / 2pi, t = 0 at the outer edge to 1 at the inner.
export function annulus(Ro, Ri, thick, opts = {}) {
  const { seg = 256, edges = true } = opts;
  const B = new GeoBuilder();
  const z0 = -thick / 2;
  const z1 = thick / 2;
  const CNT = 1024;
  for (const face of [
    { z: z1, n: [0, 0, 1] },
    { z: z0, n: [0, 0, -1] },
  ]) {
    const base = B.pos.length / 3;
    for (let a = 0; a <= seg; a++) {
      const t = a / seg;
      const ang = t * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      B.vertex([Ro * c, Ro * s, face.z], face.n, [Ro, t * CNT], [t, 0]);
      B.vertex([Ri * c, Ri * s, face.z], face.n, [Ri, t * CNT], [t, 1]);
    }
    for (let a = 0; a < seg; a++) {
      const v = base + a * 2;
      B.quad(v, v + 1, v + 3, v + 2);
    }
  }
  for (const wall of [
    { R: Ro, sg: 1 },
    { R: Ri, sg: -1 },
  ]) {
    const base = B.pos.length / 3;
    for (let a = 0; a <= seg; a++) {
      const t = a / seg;
      const ang = t * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      B.vertex([wall.R * c, wall.R * s, z0], [wall.sg * c, wall.sg * s, 0], [z0, t * CNT], null);
      B.vertex([wall.R * c, wall.R * s, z1], [wall.sg * c, wall.sg * s, 0], [z1, t * CNT], null);
    }
    for (let a = 0; a < seg; a++) {
      const v = base + a * 2;
      B.quad(v, v + 1, v + 3, v + 2);
    }
  }
  if (edges) {
    for (let a = 0; a < seg; a++) {
      const t0 = (a / seg) * Math.PI * 2;
      const t1 = ((a + 1) / seg) * Math.PI * 2;
      const tm = 0.5 * (t0 + t1);
      const c = Math.cos(tm);
      const s = Math.sin(tm);
      for (const R of [Ro, Ri]) {
        const sg = R === Ro ? 1 : -1;
        for (const z of [z0, z1]) {
          B.edge(
            [R * Math.cos(t0), R * Math.sin(t0), z],
            [R * Math.cos(t1), R * Math.sin(t1), z],
            [0, 0, z > 0 ? 1 : -1],
            [sg * c, sg * s, 0],
          );
        }
      }
    }
  }
  return { geometry: B.build(), edges: B.edges };
}

// Unit sphere with engraving attributes (u = polar angle, v = longitude count).
export function sphereGeometry(wSeg = 72, hSeg = 48) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  const uv = g.attributes.uv;
  const n = uv.count;
  const hat = new Float32Array(n * 2);
  const tik = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    hat[2 * i] = (1 - uv.getY(i)) * Math.PI;
    hat[2 * i + 1] = uv.getX(i) * 512;
    tik[2 * i] = 0;
    tik[2 * i + 1] = -1;
  }
  g.setAttribute('aHatch', new THREE.BufferAttribute(hat, 2));
  g.setAttribute('aTick', new THREE.BufferAttribute(tik, 2));
  g.setAttribute('aOnormal', g.attributes.normal.clone());
  return g;
}

// Flat disc for the ground (hatch coordinates are computed in the shader).
export function disc(radius, seg = 96) {
  const B = new GeoBuilder();
  const c0 = B.vertex([0, 0, 0], [0, 1, 0], [0, 0], null);
  for (let a = 0; a <= seg; a++) {
    const t = (a / seg) * Math.PI * 2;
    B.vertex([radius * Math.cos(t), 0, -radius * Math.sin(t)], [0, 1, 0], [0, 0], null);
  }
  for (let a = 0; a < seg; a++) B.tri(c0, c0 + 1 + a, c0 + 2 + a);
  return B.build();
}

// Close a polyline loop with Chaikin corner cutting (keeps it closed).
export function chaikin(loop, iterations = 2) {
  let pts = loop;
  for (let it = 0; it < iterations; it++) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
      out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    pts = out;
  }
  return pts;
}

export function circleLoop(r, n, phase = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = phase + (i / n) * Math.PI * 2;
    out.push([r * Math.cos(t), r * Math.sin(t)]);
  }
  return out;
}

// Transform a builder result (geometry + crease edges) in place. Unlike
// BufferGeometry.applyMatrix4 alone, this also turns the outline normals,
// so rotated parts keep an even outline.
export function applyRes(res, m) {
  const g = res.geometry;
  g.applyMatrix4(m);
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const on = g.attributes.aOnormal;
  if (on) {
    on.applyNormalMatrix(nm);
    on.needsUpdate = true;
  }
  g.computeBoundingSphere();
  const A = new THREE.Vector3();
  res.edges = (res.edges || []).map((e) => ({
    a: A.fromArray(e.a).applyMatrix4(m).toArray(),
    b: A.fromArray(e.b).applyMatrix4(m).toArray(),
    nA: A.fromArray(e.nA).applyMatrix3(nm).normalize().toArray(),
    nB: A.fromArray(e.nB).applyMatrix3(nm).normalize().toArray(),
  }));
  return res;
}

// Prism standing on the XZ plane: loops given as world [x, z] points,
// extruded up from y0 to y1.
export function extrudeY(loopsXZ, y0, y1, opts = {}) {
  const loops = loopsXZ.map((l) => l.map((p) => [p[0], -p[1]]));
  const res = extrude(loops, y0, y1, opts);
  return applyRes(res, new THREE.Matrix4().makeRotationX(-Math.PI / 2));
}

export function rectLoop(x0, y0, x1, y1) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

// Axis-aligned box with all six faces and all twelve crease edges.
// hatch: which in-plane axis carries the primary hatch on each face
// ('x' lines run along x's level sets, i.e. u = the other axis).
export function box(x0, x1, y0, y1, z0, z1) {
  const B = new GeoBuilder();
  const X = [x0, x1];
  const Yv = [y0, y1];
  const Zv = [z0, z1];
  const faces = [
    { n: [-1, 0, 0], q: (a, b) => [x0, a, b], A: Yv, Bv: Zv },
    { n: [1, 0, 0], q: (a, b) => [x1, a, b], A: Yv, Bv: Zv },
    { n: [0, -1, 0], q: (a, b) => [a, y0, b], A: X, Bv: Zv },
    { n: [0, 1, 0], q: (a, b) => [a, y1, b], A: X, Bv: Zv },
    { n: [0, 0, -1], q: (a, b) => [a, b, z0], A: X, Bv: Yv },
    { n: [0, 0, 1], q: (a, b) => [a, b, z1], A: X, Bv: Yv },
  ];
  for (const f of faces) {
    const v = [];
    for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const P = f.q(f.A[a], f.Bv[b]);
      v.push(B.vertex(P, f.n, [f.Bv[b], f.A[a]], null));
    }
    B.quad(v[0], v[1], v[2], v[3]);
  }
  const nx = (s) => [s, 0, 0];
  const ny = (s) => [0, s, 0];
  const nz = (s) => [0, 0, s];
  const sg = (i) => (i === 0 ? -1 : 1);
  for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    B.edge([x0, Yv[j], Zv[k]], [x1, Yv[j], Zv[k]], ny(sg(j)), nz(sg(k)));
    B.edge([X[j], y0, Zv[k]], [X[j], y1, Zv[k]], nx(sg(j)), nz(sg(k)));
    B.edge([X[j], Yv[k], z0], [X[j], Yv[k], z1], nx(sg(j)), ny(sg(k)));
  }
  return { geometry: B.build(), edges: B.edges };
}

// A board swept along a centreline: skis. C: world points, N: per-point
// "top" normals (perpendicular to the tangent), side: constant unit side
// vector, w(i) / t(i): width and thickness at point i.
export function sweepBoard(C, N, side, w, t) {
  const B = new GeoBuilder();
  const n = C.length;
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1], C[i][2] - C[i - 1][2]));
  const P = (i, ks, kn) => {
    const hw = w(i) / 2;
    const ht = t(i) / 2;
    return [
      C[i][0] + side[0] * hw * ks + N[i][0] * ht * kn,
      C[i][1] + side[1] * hw * ks + N[i][1] * ht * kn,
      C[i][2] + side[2] * hw * ks + N[i][2] * ht * kn,
    ];
  };
  const neg = (v) => [-v[0], -v[1], -v[2]];
  const faces = [
    { a: [-1, 1], b: [1, 1], n: (i) => N[i], lat: true },
    { a: [1, -1], b: [-1, -1], n: (i) => neg(N[i]), lat: true },
    { a: [1, 1], b: [1, -1], n: () => side, lat: false },
    { a: [-1, -1], b: [-1, 1], n: () => neg(side), lat: false },
  ];
  for (const f of faces) {
    const base = B.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const nn = f.n(i);
      const ha = f.lat ? f.a[0] * w(i) * 0.5 : f.a[1] * t(i) * 0.5;
      const hb = f.lat ? f.b[0] * w(i) * 0.5 : f.b[1] * t(i) * 0.5;
      B.vertex(P(i, f.a[0], f.a[1]), nn, [ha, s[i]], null);
      B.vertex(P(i, f.b[0], f.b[1]), nn, [hb, s[i]], null);
    }
    for (let i = 0; i < n - 1; i++) {
      const v = base + i * 2;
      B.quad(v, v + 1, v + 3, v + 2);
    }
  }
  // end caps
  for (const [i, sg] of [[0, -1], [n - 1, 1]]) {
    const j = sg < 0 ? 1 : n - 2;
    const tg = [C[i][0] - C[j][0], C[i][1] - C[j][1], C[i][2] - C[j][2]];
    const tl = Math.hypot(tg[0], tg[1], tg[2]) || 1;
    const nn = [tg[0] / tl, tg[1] / tl, tg[2] / tl];
    const a = B.vertex(P(i, -1, -1), nn, [0, 0], null);
    const b = B.vertex(P(i, 1, -1), nn, [1, 0], null);
    const c = B.vertex(P(i, 1, 1), nn, [1, 1], null);
    const d = B.vertex(P(i, -1, 1), nn, [0, 1], null);
    B.quad(a, b, c, d);
  }
  // long creases
  for (let i = 0; i < n - 1; i++) {
    for (const [ks, kn] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      const nTop = kn > 0 ? N[i] : neg(N[i]);
      const nSide = ks > 0 ? side : neg(side);
      B.edge(P(i, ks, kn), P(i + 1, ks, kn), nTop, nSide);
    }
  }
  return { geometry: B.build(), edges: B.edges };
}
