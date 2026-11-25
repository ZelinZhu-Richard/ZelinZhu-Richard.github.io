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
