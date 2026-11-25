// Seven winding laws. Each returns one continuous thread on the unit sphere
// as a flat array [x, y, z, x, y, z, ...] sampled every ~STEP radians.
// The thread starts where the stem arrives and ends at the free end.

const STEP = 0.018;
const TAU = Math.PI * 2;

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Push points along the great circle from a to b (a excluded).
function arcTo(out, a, b) {
  const d = Math.min(1, Math.max(-1, dot(a, b)));
  const ang = Math.acos(d);
  const n = Math.max(1, Math.ceil(ang / STEP));
  const s = Math.sin(ang);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    let p;
    if (s < 1e-6) p = b;
    else {
      const wa = Math.sin((1 - t) * ang) / s;
      const wb = Math.sin(t * ang) / s;
      p = [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
    }
    out.push(p[0], p[1], p[2]);
  }
}

// Densify a parametric curve so neighbouring samples are about STEP apart.
function trace(f, t0, t1, out = []) {
  let t = t0;
  let p = norm(f(t));
  out.push(p[0], p[1], p[2]);
  let dt = (t1 - t0) / 20000;
  while (t < t1) {
    let q = norm(f(Math.min(t1, t + dt)));
    let d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    // adapt the parameter step toward the target arc step
    let guard = 0;
    while ((d > STEP * 1.25 || d < STEP * 0.8) && guard++ < 12 && t + dt < t1) {
      dt *= STEP / Math.max(d, 1e-6);
      q = norm(f(Math.min(t1, t + dt)));
      d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    }
    t = Math.min(t1, t + dt);
    p = q;
    out.push(p[0], p[1], p[2]);
  }
  return out;
}

// 01 About: one coil from pole to pole, rings of latitude.
function latitudeCoil() {
  const turns = 30;
  return trace((t) => {
    const z = -0.975 + 1.95 * (t / (TAU * turns));
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return [r * Math.cos(t), r * Math.sin(t), z + 0.006 * Math.sin(t * 3.0)];
  }, 0, TAU * turns);
}

// 02 Projects: ten rhumb lines, pole to pole and back, one handedness.
function loxodrome() {
  const out = [];
  const strands = 10;
  const k = 5.2;
  const lat = (80 * Math.PI) / 180;
  const psi = (phi) => Math.log(Math.tan(Math.PI / 4 + phi / 2));
  const at = (phi, l0) => {
    const l = l0 + k * psi(phi);
    return [Math.cos(phi) * Math.cos(l), Math.cos(phi) * Math.sin(l), Math.sin(phi)];
  };
  let last = null;
  for (let j = 0; j < strands; j++) {
    const l0 = (j * TAU) / strands + (j % 2) * (Math.PI / strands);
    const up = j % 2 === 0;
    const seg = trace((t) => at(up ? t : -t, l0), -lat, lat, []);
    if (last) {
      const first = [seg[0], seg[1], seg[2]];
      arcTo(out, last, first);
      for (let i = 3; i < seg.length; i++) out.push(seg[i]);
    } else for (let i = 0; i < seg.length; i++) out.push(seg[i]);
    last = [out[out.length - 3], out[out.length - 2], out[out.length - 1]];
  }
  return out;
}

// 03 Research: a (p, q) torus knot pressed onto the sphere.
function torusKnot() {
  const p = 5;
  const q = 19;
  const R = 1.0;
  const r = 0.78;
  return trace((t) => {
    const c = R + r * Math.cos(q * t);
    return [c * Math.cos(p * t), c * Math.sin(p * t), r * Math.sin(q * t)];
  }, 0, TAU);
}

// 04 Art: nested baseball seams. The seam opens from the equator to the
// poles, then closes again turned a quarter, so both families of lobes fill.
function baseballSeam() {
  const loops = 18;
  const T = TAU * loops;
  return trace((t) => {
    const u = t / T;
    const b = 0.04 + 0.44 * (1 - Math.abs(2 * u - 1));
    const a = 1 - b;
    const k = Math.min(1, Math.max(0, (u - 0.44) / 0.12));
    // the second family sits a quarter turn round; both drift so the
    // crossings fan out instead of meeting in one point
    const r = (Math.PI / 2) * k * k * (3 - 2 * k) + 0.45 * Math.sin(Math.PI * u);
    const x = a * Math.cos(t) + b * Math.cos(3 * t);
    const y = a * Math.sin(t) - b * Math.sin(3 * t);
    return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r), 2 * Math.sqrt(a * b) * Math.sin(2 * t)];
  }, 0, T);
}

// 05 Fun: Fibonacci lattice, threaded along its 13- and 21-parastichies.
function fibonacciSpiral() {
  const N = 377;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const P = [];
  for (let i = 0; i < N; i++) {
    const z = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(1 - z * z);
    P.push([r * Math.cos(i * ga), r * Math.sin(i * ga), z]);
  }
  const out = [];
  let last = null;
  const run = (fam) => {
    for (let j = 0; j < fam; j++) {
      const ids = [];
      for (let i = j; i < N; i += fam) ids.push(i);
      if (j % 2 === 1) ids.reverse();
      for (const i of ids) {
        if (!last) {
          out.push(P[i][0], P[i][1], P[i][2]);
        } else arcTo(out, last, P[i]);
        last = P[i];
      }
    }
  };
  run(13);
  run(21);
  return out;
}

// 06 Blog: great-circle tangle, a ball of yarn wound in long passes.
function greatCircleTangle(rng) {
  const out = [];
  let p = norm([0.3, -0.2, -0.93]);
  let h = norm(cross(p, [0, 1, 0]));
  out.push(p[0], p[1], p[2]);
  for (let k = 0; k < 40; k++) {
    const L = rng.range(3.0, 4.6);
    const n = Math.ceil(L / STEP);
    for (let i = 1; i <= n; i++) {
      const s = (L * i) / n;
      out.push(p[0] * Math.cos(s) + h[0] * Math.sin(s), p[1] * Math.cos(s) + h[1] * Math.sin(s), p[2] * Math.cos(s) + h[2] * Math.sin(s));
    }
    const np = [p[0] * Math.cos(L) + h[0] * Math.sin(L), p[1] * Math.cos(L) + h[1] * Math.sin(L), p[2] * Math.cos(L) + h[2] * Math.sin(L)];
    const nh = [-p[0] * Math.sin(L) + h[0] * Math.cos(L), -p[1] * Math.sin(L) + h[1] * Math.cos(L), -p[2] * Math.sin(L) + h[2] * Math.cos(L)];
    p = norm(np);
    const a = rng.sign() * rng.range(0.6, 1.5);
    const b = cross(p, nh);
    h = norm([nh[0] * Math.cos(a) + b[0] * Math.sin(a), nh[1] * Math.cos(a) + b[1] * Math.sin(a), nh[2] * Math.cos(a) + b[2] * Math.sin(a)]);
  }
  return out;
}

// 07 Daily: a persistent random walk, one day after another.
function randomWalk(rng) {
  const out = [];
  let p = norm([0.1, 0.9, 0.3]);
  let h = norm(cross(p, [1, 0, 0]));
  let kappa = 0;
  const steps = Math.round(105 / STEP);
  out.push(p[0], p[1], p[2]);
  for (let i = 0; i < steps; i++) {
    kappa = kappa * 0.982 + rng.normal() * 0.3;
    const turn = Math.max(-0.3, Math.min(0.3, kappa * STEP * 1.2));
    const b = cross(p, h);
    h = norm([h[0] * Math.cos(turn) + b[0] * Math.sin(turn), h[1] * Math.cos(turn) + b[1] * Math.sin(turn), h[2] * Math.cos(turn) + b[2] * Math.sin(turn)]);
    const np = norm([p[0] + h[0] * STEP, p[1] + h[1] * STEP, p[2] + h[2] * STEP]);
    // re-project the heading onto the new tangent plane
    const d = dot(h, np);
    h = norm([h[0] - np[0] * d, h[1] - np[1] * d, h[2] - np[2] * d]);
    p = np;
    out.push(p[0], p[1], p[2]);
  }
  return out;
}

export const LAWS = [
  { id: 'coil', make: latitudeCoil, lumpy: 0 },
  { id: 'loxodrome', make: loxodrome, lumpy: 0 },
  { id: 'torus', make: torusKnot, lumpy: 0 },
  { id: 'seam', make: baseballSeam, lumpy: 0 },
  { id: 'fibonacci', make: fibonacciSpiral, lumpy: 0 },
  { id: 'tangle', make: greatCircleTangle, lumpy: 0.025 },
  { id: 'walk', make: randomWalk, lumpy: 0.06 },
];

export { norm, cross, dot };
