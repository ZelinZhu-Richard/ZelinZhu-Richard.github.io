// Involute spur gear outlines (20 degree pressure angle) and spoke windows.
// Outlines are counter-clockwise, tooth 0 centred on angle 0.

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
