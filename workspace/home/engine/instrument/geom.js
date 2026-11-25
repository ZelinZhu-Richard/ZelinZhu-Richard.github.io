// Geometry builders for the instrument, pure (plain arrays, no three.js):
// the three.js side turns the merged arrays into BufferGeometry. Builders
// follow the approved sketch (sketches/instrument/geom.js). Every solid
// carries:
//   hat  (u, v)  engraving coordinates; u = primary hatch, v = cross hatch;
//                one of them is a length in units, the other an angle count,
//                which also orients the brass shader's machining streaks
//   tik  (a, t)  graduation coordinates (angle 0..1, depth into band); t < 0 = none
// and returns `edges`: crease segments that become ink ribbons.
// Triangulating a face with holes needs earcut, which the caller injects
// (THREE.ShapeUtils.triangulateShape on the three.js side).

import { apply, normalMatrix, applyN } from './math.js';

const NONE_TICK = [0, -1];

/**
 * @typedef {{ a: number[], b: number[], nA: number[], nB: number[] }} Edge
 * @typedef {{ pos: number[], nrm: number[], hat: number[], tik: number[], idx: number[], edges: Edge[] }} Geo
 */

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

  /** @returns {Geo} */
  done() {
    return { pos: this.pos, nrm: this.nrm, hat: this.hat, tik: this.tik, idx: this.idx, edges: this.edges };
  }
}

const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
const norm2 = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
const DEGR = Math.PI / 180;

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
  const MER = 512; // meridian lines counted round the axis (a power of two keeps the seam clean)
  for (let i = 0; i < n - 1; i++) {
    const p0 = profile[i];
    const p1 = profile[i + 1];
    const L = arc[i + 1] - arc[i];
    if (L < 1e-7) continue;
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
      for (let a = 0; a < seg; a++) {
        const t0 = (a / seg) * Math.PI * 2;
        const t1 = ((a + 1) / seg) * Math.PI * 2;
        const tm = 0.5 * (t0 + t1);
        const c = Math.cos(tm);
        const s = Math.sin(tm);
        B.edge(
          [r * Math.cos(t0), profile[j][1], -r * Math.sin(t0)],
          [r * Math.cos(t1), profile[j][1], -r * Math.sin(t1)],
          [nA[0] * c, nA[1], -nA[0] * s],
          [nB[0] * c, nB[1], -nB[0] * s],
        );
      }
    }
  }
  return B.done();
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
// loops[0] is the outline, the rest are holes; no repeated end points.
// `polar` hatches the caps as turned faces (radius, angle count) instead of
// straight lines at hatchAngle.
export function extrude(loops, z0, z1, opts, triangulate) {
  const { hatchAngle = 0, smoothAngle = 35, capEdges = true, polar = false } = opts || {};
  const B = new GeoBuilder();
  const ca = Math.cos(hatchAngle);
  const sa = Math.sin(hatchAngle);
  const faces = triangulate(loops[0], loops.slice(1));
  const all = [];
  for (const l of loops) for (const p of l) all.push(p);
  for (const cap of [
    { z: z1, n: [0, 0, 1] },
    { z: z0, n: [0, 0, -1] },
  ]) {
    const base = B.pos.length / 3;
    for (const p of all) {
      const h = polar
        ? [Math.hypot(p[0], p[1]), ((Math.atan2(p[1], p[0]) / (2 * Math.PI)) + 0.5) * 512]
        : [p[0] * ca + p[1] * sa, -p[0] * sa + p[1] * ca];
      B.vertex([p[0], p[1], cap.z], cap.n, h, null);
    }
    for (const f of faces) B.tri(base + f[0], base + f[1], base + f[2]);
  }
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
  return B.done();
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
          B.edge([R * Math.cos(t0), R * Math.sin(t0), z], [R * Math.cos(t1), R * Math.sin(t1), z], [0, 0, z > 0 ? 1 : -1], [sg * c, sg * s, 0]);
        }
      }
    }
  }
  return B.done();
}

// Unit sphere (Y pole axis) with engraving attributes (u = polar angle,
// v = longitude count), like THREE.SphereGeometry's layout.
export function uvSphere(wSeg = 72, hSeg = 48) {
  const B = new GeoBuilder();
  const grid = [];
  for (let iy = 0; iy <= hSeg; iy++) {
    const v = iy / hSeg;
    const row = [];
    for (let ix = 0; ix <= wSeg; ix++) {
      const u = ix / wSeg;
      const x = -Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI);
      const y = Math.cos(v * Math.PI);
      const z = Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI);
      row.push(B.vertex([x, y, z], [x, y, z], [v * Math.PI, u * 512], null));
    }
    grid.push(row);
  }
  for (let iy = 0; iy < hSeg; iy++) {
    for (let ix = 0; ix < wSeg; ix++) {
      const a = grid[iy][ix + 1];
      const b = grid[iy][ix];
      const c = grid[iy + 1][ix];
      const d = grid[iy + 1][ix + 1];
      if (iy !== 0) B.tri(a, b, d);
      if (iy !== hSeg - 1) B.tri(b, c, d);
    }
  }
  return B.done();
}

// Axis-aligned box with all six faces and all twelve crease edges.
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
  return B.done();
}

// A tube swept along a planar polyline (the plane's normal is `side`), with
// a radius per point and rounded end caps. Hatch: angle count round, length along.
export function tube(points, radii, side, opts = {}) {
  const { sides = 12 } = opts;
  const B = new GeoBuilder();
  const n = points.length;
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]));
  const sd = side;
  const tang = (i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [d[0] / l, d[1] / l, d[2] / l];
  };
  const rows = [];
  for (let i = 0; i < n; i++) {
    const T = tang(i);
    // N = side x T (in the plane), side is the binormal
    const N = [sd[1] * T[2] - sd[2] * T[1], sd[2] * T[0] - sd[0] * T[2], sd[0] * T[1] - sd[1] * T[0]];
    const row = [];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const d = [N[0] * c + sd[0] * sn, N[1] * c + sd[1] * sn, N[2] * c + sd[2] * sn];
      const r = radii[i];
      row.push(B.vertex([points[i][0] + d[0] * r, points[i][1] + d[1] * r, points[i][2] + d[2] * r], d, [(k / sides) * 512, s[i]], null));
    }
    rows.push(row);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) B.quad(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
  }
  return B.done();
}

// ------------------------------------------------------------ transforms ---

/**
 * Per-vertex outline normals: normals averaged over coincident vertices, so
 * the inverted-hull outline has no cracks at hard edges.
 * @param {Geo} g
 * @returns {number[]}
 */
export function outlineNormals(g) {
  const n = g.pos.length / 3;
  const P = g.pos;
  const Nn = g.nrm;
  // numeric keys (positions rounded to 1e-4; |coordinate| < 10 units)
  const map = new Map();
  const keys = new Float64Array(n);
  const acc = [];
  for (let i = 0; i < n; i++) {
    const kx = Math.round(P[3 * i] * 1e4) + 100000;
    const ky = Math.round(P[3 * i + 1] * 1e4) + 100000;
    const kz = Math.round(P[3 * i + 2] * 1e4) + 100000;
    const k = kx + 200001 * (ky + 200001 * kz);
    keys[i] = k;
    let j = map.get(k);
    if (j === undefined) {
      j = acc.length;
      map.set(k, j);
      acc.push(0, 0, 0);
      acc.length = j + 3;
    }
    acc[j] += Nn[3 * i];
    acc[j + 1] += Nn[3 * i + 1];
    acc[j + 2] += Nn[3 * i + 2];
  }
  const out = new Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = map.get(keys[i]);
    const x = acc[j], y = acc[j + 1], z = acc[j + 2];
    const l = Math.sqrt(x * x + y * y + z * z);
    if (l < 1e-6) {
      out[3 * i] = Nn[3 * i];
      out[3 * i + 1] = Nn[3 * i + 1];
      out[3 * i + 2] = Nn[3 * i + 2];
    } else {
      out[3 * i] = x / l;
      out[3 * i + 1] = y / l;
      out[3 * i + 2] = z / l;
    }
  }
  return out;
}

/**
 * A copy of g transformed by m (positions, normals, outline normals, edges).
 * @param {Geo & { onrm?: number[] }} g
 */
export function transformGeo(g, m) {
  const nm = normalMatrix(m);
  const n = g.pos.length / 3;
  const P = g.pos;
  const Nn = g.nrm;
  const O = g.onrm;
  const pos = new Array(n * 3);
  const nrm = new Array(n * 3);
  const onrm = O ? new Array(n * 3) : null;
  const [m0, m1, m2, , m4, m5, m6, , m8, m9, m10, , m12, m13, m14] = m;
  const [n0, n1, n2, n3, n4, n5, n6, n7, n8] = nm;
  for (let i = 0; i < n; i++) {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    pos[3 * i] = m0 * x + m4 * y + m8 * z + m12;
    pos[3 * i + 1] = m1 * x + m5 * y + m9 * z + m13;
    pos[3 * i + 2] = m2 * x + m6 * y + m10 * z + m14;
    let a = Nn[3 * i], b = Nn[3 * i + 1], c = Nn[3 * i + 2];
    let qx = n0 * a + n3 * b + n6 * c;
    let qy = n1 * a + n4 * b + n7 * c;
    let qz = n2 * a + n5 * b + n8 * c;
    let l = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
    nrm[3 * i] = qx / l;
    nrm[3 * i + 1] = qy / l;
    nrm[3 * i + 2] = qz / l;
    if (onrm) {
      a = O[3 * i];
      b = O[3 * i + 1];
      c = O[3 * i + 2];
      qx = n0 * a + n3 * b + n6 * c;
      qy = n1 * a + n4 * b + n7 * c;
      qz = n2 * a + n5 * b + n8 * c;
      l = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
      onrm[3 * i] = qx / l;
      onrm[3 * i + 1] = qy / l;
      onrm[3 * i + 2] = qz / l;
    }
  }
  const edges = g.edges.map((e) => ({ a: apply(m, e.a), b: apply(m, e.b), nA: applyN(nm, e.nA), nB: applyN(nm, e.nB) }));
  return { pos, nrm, onrm, hat: g.hat, tik: g.tik, idx: g.idx, edges };
}

/** Close a polyline loop with Chaikin corner cutting (keeps it closed). */
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

/** Number of triangles in a geometry. */
export const triCount = (g) => g.idx.length / 3;
