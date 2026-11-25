// Involute spur gear outlines (20 degree pressure angle), spoke windows and
// the meshing contact. Pure math (no three.js); from the approved sketch.
// Outlines are counter-clockwise, tooth 0 centred on angle 0.

import { GEAR } from './layout.js';

const rot2 = (p, th) => [p[0] * Math.cos(th) - p[1] * Math.sin(th), p[0] * Math.sin(th) + p[1] * Math.cos(th)];

const ALPHA = (20 * Math.PI) / 180;
const inv = (x) => Math.tan(x) - x;

export function gearOutline(z, m, opts = {}) {
  const { flankPts = 7, tipPts = 3, rootPts = 4 } = opts;
  const r = (z * m) / 2;
  const rb = r * Math.cos(ALPHA);
  const ra = r + m;
  const rf = r - 1.25 * m;
  const beta = Math.PI / (2 * z);
  const psi = (R) => (R <= rb ? beta + inv(ALPHA) : beta + inv(ALPHA) - inv(Math.acos(rb / R)));
  const pitch = (2 * Math.PI) / z;
  const rStart = Math.max(rf, rb);
  // Sample the involute evenly in roll angle (denser near the base circle).
  const tOf = (R) => Math.sqrt(Math.max((R / rb) ** 2 - 1, 0));
  const t0 = tOf(rStart);
  const t1 = tOf(ra);
  const radii = [];
  if (rf < rb) radii.push(rf);
  for (let j = 0; j < flankPts; j++) {
    const t = t0 + ((t1 - t0) * j) / (flankPts - 1);
    radii.push(rb * Math.sqrt(1 + t * t));
  }
  const pts = [];
  const P = (R, a) => pts.push([R * Math.cos(a), R * Math.sin(a)]);
  for (let k = 0; k < z; k++) {
    const c = k * pitch;
    const prevEnd = c - pitch + psi(rf);
    const thisStart = c - psi(rf);
    for (let j = 1; j < rootPts; j++) P(rf, prevEnd + ((thisStart - prevEnd) * j) / rootPts);
    for (const R of radii) P(R, c - psi(R));
    for (let j = 1; j < tipPts; j++) P(ra, c - psi(ra) + (2 * psi(ra) * j) / tipPts);
    for (let i = radii.length - 1; i >= 0; i--) P(radii[i], c + psi(radii[i]));
  }
  return { pts, r, ra, rf, rb };
}

// n windows between n straight spokes of half-width hw, from radius ri to ro.
export function spokeWindows(n, ri, ro, hw, opts = {}) {
  const { phase = 0, arcPts = 22, edgeStep = 0.03 } = opts;
  const loops = [];
  for (let k = 0; k < n; k++) {
    const s0 = phase + (k * 2 * Math.PI) / n;
    const s1 = s0 + (2 * Math.PI) / n;
    const loop = [];
    // left edge of spoke s0 (offset +hw), outward
    const u0 = [Math.cos(s0), Math.sin(s0)];
    const v0 = [-Math.sin(s0), Math.cos(s0)];
    const a0 = Math.sqrt(ri * ri - hw * hw);
    const b0 = Math.sqrt(ro * ro - hw * hw);
    const ne = Math.max(2, Math.ceil((b0 - a0) / edgeStep));
    for (let j = 0; j < ne; j++) {
      const d = a0 + ((b0 - a0) * j) / ne;
      loop.push([d * u0[0] + hw * v0[0], d * u0[1] + hw * v0[1]]);
    }
    // outer arc, counter-clockwise
    const ao0 = s0 + Math.asin(hw / ro);
    const ao1 = s1 - Math.asin(hw / ro);
    for (let j = 0; j < arcPts; j++) {
      const a = ao0 + ((ao1 - ao0) * j) / arcPts;
      loop.push([ro * Math.cos(a), ro * Math.sin(a)]);
    }
    // right edge of spoke s1 (offset -hw), inward
    const u1 = [Math.cos(s1), Math.sin(s1)];
    const v1 = [-Math.sin(s1), Math.cos(s1)];
    for (let j = 0; j < ne; j++) {
      const d = b0 + ((a0 - b0) * j) / ne;
      loop.push([d * u1[0] - hw * v1[0], d * u1[1] - hw * v1[1]]);
    }
    // inner arc, clockwise back to the start
    const ai1 = s1 - Math.asin(hw / ri);
    const ai0 = s0 + Math.asin(hw / ri);
    const ni = Math.max(4, Math.round(arcPts * (ri / ro)));
    for (let j = 0; j < ni; j++) {
      const a = ai1 + ((ai0 - ai1) * j) / ni;
      loop.push([ri * Math.cos(a), ri * Math.sin(a)]);
    }
    loops.push(loop);
  }
  return loops;
}

// Where the idler and the pinion mesh: the closest pair of points on their
// outlines (at their current rotations) near the pitch point, and the top
// edges of the two flanks there (world segments with their flank normals).
// T: trainLayout(crank). Pure math, shared by machine.js and check.mjs.
export function meshContact(T) {
  const wheel = (z, c, rot, thick) => {
    const { pts } = gearOutline(z, GEAR.module);
    const n = pts.length;
    const W = pts.map((p) => {
      const q = rot2(p, rot);
      return [c[0] + q[0], c[2] - q[1]];
    });
    return { W, n, thick, rot };
  };
  const I = wheel(GEAR.idler.z, T.idler.c, T.idler.rot, GEAR.idler.thick);
  const P = wheel(GEAR.pinion.z, T.pinion.c, T.pinion.rot, GEAR.pinion.thick);
  const ri = (GEAR.idler.z * GEAR.module) / 2;
  const u = [T.pinion.c[0] - T.idler.c[0], T.pinion.c[2] - T.idler.c[2]];
  const ul = Math.hypot(u[0], u[1]);
  const pitchPt = [T.idler.c[0] + (u[0] / ul) * ri, T.idler.c[2] + (u[1] / ul) * ri];
  const near = (G) => G.W.map((p, k) => k).filter((k) => Math.hypot(G.W[k][0] - pitchPt[0], G.W[k][1] - pitchPt[1]) < 0.09);
  let best = null;
  for (const a of near(I)) {
    for (const b of near(P)) {
      const d = Math.hypot(I.W[a][0] - P.W[b][0], I.W[a][1] - P.W[b][1]);
      if (!best || d < best.d) best = { d, a, b };
    }
  }
  const edgeAt = (G, k, y) => {
    // the outline segment from point k toward its neighbour nearer the
    // other wheel, on the top edge; outward normal of a ccw outline
    const out = [];
    for (const j of [k - 1, k]) {
      const p = G.W[(j + G.n) % G.n];
      const q = G.W[(j + 1 + G.n) % G.n];
      const dx = q[0] - p[0];
      const dz = q[1] - p[1];
      // world (x, z) of a ccw drawing loop turns clockwise seen from +y, so
      // its outward normal is (-dz, dx)
      const l = Math.hypot(dx, dz) || 1;
      out.push({ a: [p[0], y, p[1]], b: [q[0], y, q[1]], n: [-dz / l, 0, dx / l] });
    }
    return out;
  };
  const pa = I.W[best.a];
  const pb = P.W[best.b];
  const p = [(pa[0] + pb[0]) / 2, GEAR.y0, (pa[1] + pb[1]) / 2];
  const edges = [...edgeAt(I, best.a, GEAR.y0 + GEAR.idler.thick), ...edgeAt(P, best.b, GEAR.y0 + GEAR.pinion.thick)];
  return { p, gap: best.d, pitch: [pitchPt[0], GEAR.y0, pitchPt[1]], edges };
}
