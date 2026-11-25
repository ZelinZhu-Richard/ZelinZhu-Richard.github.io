// The world of "Ridge, 3 a.m.": one seeded mountain and everything placed on it.
// Pure JS (no three.js) so the same file drives the page and offline checks.
//
// The terrain height is written once, in a small shared dialect (HEIGHT_BODY)
// that is valid GLSL and, after one substitution, valid JS. The mesh (JS) and
// the contour shader (GLSL) therefore evaluate the very same function.

// ---------------------------------------------------------------- PRNG

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- noise (JS)
// Integer hash identical to the GLSL version below (uint arithmetic mod 2^32).

const OFF = 4096;

export function hashu(ix, iy, s) {
  let h = Math.imul(ix + OFF, 0x8da6b343) ^ Math.imul(iy + OFF, 0xd8163841) ^ Math.imul(s + 1, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

const INV = 1 / 32767.5;

function gradDot(h, dx, dy) {
  const gx = (h & 0xffff) * INV - 1.0;
  const gy = (h >>> 16) * INV - 1.0;
  return gx * dx + gy * dy;
}

export function gnoise(x, y, s) {
  const fx0 = Math.floor(x), fy0 = Math.floor(y);
  const fx = x - fx0, fy = y - fy0;
  const ux = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0);
  const uy = fy * fy * fy * (fy * (fy * 6.0 - 15.0) + 10.0);
  const a = gradDot(hashu(fx0, fy0, s), fx, fy);
  const b = gradDot(hashu(fx0 + 1, fy0, s), fx - 1.0, fy);
  const c = gradDot(hashu(fx0, fy0 + 1, s), fx, fy - 1.0);
  const d = gradDot(hashu(fx0 + 1, fy0 + 1, s), fx - 1.0, fy - 1.0);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x, y, oct, s) {
  let sum = 0.0, amp = 0.5;
  for (let i = 0; i < oct; i++) {
    sum += amp * gnoise(x, y, s + i);
    const nx = 0.8 * x - 0.6 * y, ny = 0.6 * x + 0.8 * y;
    x = nx * 2.03; y = ny * 2.03;
    amp *= 0.5;
  }
  return sum;
}

export function ridged(x, y, oct, s) {
  let sum = 0.0, amp = 0.5, w = 1.0;
  for (let i = 0; i < oct; i++) {
    let n = 1.0 - Math.abs(gnoise(x, y, s + i)) * 1.6;
    n = Math.max(n, 0.0);
    n = n * n * w;
    w = Math.min(Math.max(n * 1.7, 0.0), 1.0);
    sum += amp * n;
    const nx = 0.8 * x - 0.6 * y, ny = 0.6 * x + 0.8 * y;
    x = nx * 2.03; y = ny * 2.03;
    amp *= 0.5;
  }
  return sum;
}

// ---------------------------------------------------------------- noise (GLSL)

export const GLSL_NOISE = /* glsl */ `
uint hashu(int ix, int iy, int s) {
  uint h = (uint(ix + 4096) * 0x8da6b343u) ^ (uint(iy + 4096) * 0xd8163841u) ^ (uint(s + 1) * 0xcb1ab31fu);
  h = (h ^ (h >> 16u)) * 0x7feb352du;
  h = (h ^ (h >> 15u)) * 0x846ca68bu;
  h ^= h >> 16u;
  return h;
}
float gradDot(uint h, float dx, float dy) {
  float gx = float(h & 0xffffu) * (1.0 / 32767.5) - 1.0;
  float gy = float(h >> 16u) * (1.0 / 32767.5) - 1.0;
  return gx * dx + gy * dy;
}
float gnoise(float x, float y, int s) {
  float fx0 = floor(x);
  float fy0 = floor(y);
  int ix = int(fx0);
  int iy = int(fy0);
  float fx = x - fx0;
  float fy = y - fy0;
  float ux = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0);
  float uy = fy * fy * fy * (fy * (fy * 6.0 - 15.0) + 10.0);
  float a = gradDot(hashu(ix, iy, s), fx, fy);
  float b = gradDot(hashu(ix + 1, iy, s), fx - 1.0, fy);
  float c = gradDot(hashu(ix, iy + 1, s), fx, fy - 1.0);
  float d = gradDot(hashu(ix + 1, iy + 1, s), fx - 1.0, fy - 1.0);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
float fbm(float x, float y, int oct, int s) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    sum += amp * gnoise(x, y, s + i);
    float nx = 0.8 * x - 0.6 * y;
    float ny = 0.6 * x + 0.8 * y;
    x = nx * 2.03;
    y = ny * 2.03;
    amp *= 0.5;
  }
  return sum;
}
float ridged(float x, float y, int oct, int s) {
  float sum = 0.0;
  float amp = 0.5;
  float w = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float n = 1.0 - abs(gnoise(x, y, s + i)) * 1.6;
    n = max(n, 0.0);
    n = n * n * w;
    w = clamp(n * 1.7, 0.0, 1.0);
    sum += amp * n;
    float nx = 0.8 * x - 0.6 * y;
    float ny = 0.6 * x + 0.8 * y;
    x = nx * 2.03;
    y = ny * 2.03;
    amp *= 0.5;
  }
  return sum;
}
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float smax(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return max(a, b) + h * h * k * 0.25;
}
`;

// ---------------------------------------------------------------- the mountain
// Shared dialect rules: every literal used as a float has a decimal point;
// octave counts and seeds are integer literals; only the helpers listed in
// JS_HELPERS are called; pow() only ever sees a non-negative base;
// smoothstep() edges are always increasing.

export const CIRQUE = { x: 10.5, z: 8.0, floor: 14.0 };

export const HEIGHT_BODY = `
  float r0 = sqrt(x * x + z * z);
  float wamp = 6.0 * smoothstep(8.0, 34.0, r0);
  float qx = x + wamp * fbm(x * 0.016 + 11.3, z * 0.016 - 4.1, 3, 11);
  float qz = z + wamp * fbm(x * 0.016 - 7.7, z * 0.016 + 9.2, 3, 23);

  float abx = 46.0;
  float abz = -7.0;
  float ab = sqrt(abx * abx + abz * abz);
  float ux = abx / ab;
  float uz = abz / ab;
  float along = (qx + 23.5) * ux + (qz - 3.6) * uz;
  float sd = -(qx + 23.5) * uz + (qz - 3.6) * ux;
  float tu = along / ab;
  float t = clamp(tu, 0.0, 1.0);
  float px = qx - (-23.5 + abx * t);
  float pz = qz - (3.6 + abz * t);
  float d = sqrt(px * px + pz * pz);
  float dt = (t - 0.515) / 0.21;
  float dw = (t - 0.2) / 0.1;
  float crest = 16.0 + 18.0 * exp(-dt * dt) + 3.6 * exp(-dw * dw) - 2.5 * smoothstep(0.75, 1.0, t);
  float wid = mix(6.8, 10.5, smoothstep(-4.0, 4.0, sd));
  float m = crest * exp(-(sqrt(d * d + 16.0) - 4.0) / wid);

  float warpT = 0.55 * fbm(qx * 0.05 + 2.1, qz * 0.05 - 3.3, 2, 31);
  float spur = ridged(along * 0.12 + warpT, sd * 0.04 + 0.4 * warpT, 3, 41);
  float isoR = ridged(qx * 0.06 + 5.0, qz * 0.06 - 1.0, 3, 47);
  float endW = smoothstep(-0.08, 0.12, tu) * (1.0 - smoothstep(0.86, 1.06, tu));
  float rid = mix(isoR, spur, endW);
  float elev = smoothstep(1.0, 26.0, m);
  float sdx = qx + 8.5;
  float sdz = qz - 12.5;
  float snow = smoothstep(2.5, 10.5, sqrt(sdx * sdx * 0.7 + sdz * sdz));
  float plat = smoothstep(28.0, 32.0, m);
  float h = m + (rid - 0.3) * 11.0 * elev * mix(0.15, 1.0, snow) * (1.0 - plat);

  h += 0.17 * fbm(x * 0.26 + 3.7, z * 0.26 - 8.1, 2, 61) * (0.3 + 0.7 * elev) * mix(0.5, 1.0, snow);

  float apron = 1.7 * exp(-sqrt(qx * qx / 2.6 + (qz - 4.0) * (qz - 4.0)) / 36.0);
  h += apron + 0.3 * fbm(x * 0.024 + 1.3, z * 0.024 + 5.9, 3, 71) - 0.0062 * z - 0.0021 * x;

  // a steep rock horn at the east end of the summit plateau
  float hx = qx - 8.2;
  float hz = qz + 1.2;
  float hr = sqrt(hx * hx * 0.8 + hz * hz);
  float hs = hx / max(hr, 0.001);
  float hc = hz / max(hr, 0.001);
  float lobe = (3.0 * hs - 4.0 * hs * hs * hs) * 0.765 + (4.0 * hc * hc * hc - 3.0 * hc) * 0.644;
  float facet = ridged(hx * 0.3 + 2.0, hz * 0.3 - 1.0, 2, 151);
  float horn = 38.0 - 1.75 * hr * (1.0 + 0.22 * lobe) + (facet - 0.3) * 1.3;
  h = smax(h, horn, 1.2);

  // the summit plateau: flatten the crest top, but not the horn
  float hornK = smoothstep(2.0, 3.9, hr);
  h = mix(h, smin(h, 31.2 + 0.08 * (h - 31.2), 1.6), hornK);

  // a cirque carved into the horn's south flank, open to the south
  float cx = qx - CIRQUE_X;
  float cz = qz - CIRQUE_Z;
  float ca = -0.24 * cx - 0.97 * cz;
  float cb = 0.97 * cx - 0.24 * cz;
  float cap = max(ca + 1.0, 0.0);
  float dc = sqrt(cap * cap * 0.85 + cb * cb);
  float lip = max(-ca - 7.0, 0.0);
  float bowl = CIRQUE_F + 0.32 * ca + 13.5 * pow(dc / 7.2, 2.7) + 0.6 * lip * lip + 0.45 * fbm(qx * 0.19, qz * 0.19, 2, 83);
  h = smin(h, bowl, 2.4);
  return h;
`;

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const JS_HELPERS = {
  exp: Math.exp,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  fract: (v) => v - Math.floor(v),
  clamp,
  smoothstep: (e0, e1, v) => {
    const t = clamp((v - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  },
  mix: (a, b, t) => a + (b - a) * t,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  atan: (y, x) => (x === undefined ? Math.atan(y) : Math.atan2(y, x)),
  sin: Math.sin,
  cos: Math.cos,
  smin: (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  },
  smax: (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
  },
  fbm,
  ridged,
  gnoise,
};

// Turn a shared-dialect body (a constant string from this sketch, never user
// input) into a JS function with the GLSL built-ins it uses in scope.
export function compileShared(params, body) {
  const names = Object.keys(JS_HELPERS);
  const js = body.replace(/\bfloat\s+/g, 'let ');
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, `return function (${params.join(', ')}) {${js}};`);
  return factory(...names.map((n) => JS_HELPERS[n]));
}

const HEIGHT_SRC = HEIGHT_BODY.replace(/CIRQUE_X/g, CIRQUE.x.toFixed(2)).replace(/CIRQUE_Z/g, CIRQUE.z.toFixed(2)).replace(/CIRQUE_F/g, CIRQUE.floor.toFixed(2));

export const heightAt = compileShared(['x', 'z'], HEIGHT_SRC);

export const GLSL_HEIGHT = `${GLSL_NOISE}
float heightAt(float x, float z) {${HEIGHT_SRC}}
`;

export function gradAt(x, z, e = 0.03) {
  const hx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const hz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return [hx, hz];
}

export function normalAt(x, z, e = 0.03) {
  const [hx, hz] = gradAt(x, z, e);
  const l = Math.hypot(hx, 1, hz);
  return [-hx / l, 1 / l, -hz / l];
}

// ---------------------------------------------------------------- vectors

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

export function ground(x, z, lift = 0) {
  return [x, heightAt(x, z) + lift, z];
}

// ---------------------------------------------------------------- curves

function catmull(points, samplesPerSeg) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(i + 2, n - 1)];
    for (let k = 0; k < samplesPerSeg; k++) {
      const t = k / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      const c = (j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(points[n - 1].slice());
  return out;
}

// Resample a 2D polyline at a fixed spacing.
function resample(pts, step) {
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = step - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += step;
    }
    carry = seg - (d - step);
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.3) out.push(last.slice());
  return out;
}

function drape(pts2, lift) {
  return pts2.map(([x, z]) => [x, heightAt(x, z) + lift, z]);
}

function arcLengths(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + v3.len(v3.sub(pts[i], pts[i - 1])));
  return s;
}

// ---------------------------------------------------------------- landmarks

// The summit plateau: the flat top west of the horn.
function findPlateau() {
  let best = -1e9;
  const samples = [];
  for (let x = -12; x <= 3; x += 0.25) {
    for (let z = -10; z <= 10; z += 0.25) {
      const h = heightAt(x, z);
      samples.push([x, z, h]);
      if (h > best) best = h;
    }
  }
  let sx = 0, sz = 0, n = 0;
  for (const [x, z, h] of samples) if (h > best - 0.3) { sx += x; sz += z; n++; }
  const cx = sx / n, cz = sz / n;
  return { center: [cx, heightAt(cx, cz), cz], top: best };
}

// Switchback trail: zigzag control points between two ground points.
function switchbacks(a, b, legs, amp, rand) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L;
  const px = -uz, pz = ux;
  const apex = [];
  for (let i = 0; i <= legs; i++) {
    const t = (i + 0.5) / (legs + 1);
    const side = i % 2 === 0 ? 1 : -1;
    const w = amp * (0.8 + 0.4 * rand()) * (1 - 0.3 * t);
    apex.push([a[0] + dx * t + px * side * w, a[1] + dz * t + pz * side * w]);
  }
  // keep legs straight: extra points near each apex make the spline turn tightly
  const pts = [a.slice()];
  const lerp2 = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  let prev = a;
  for (let i = 0; i < apex.length; i++) {
    pts.push(lerp2(prev, apex[i], 0.88));
    pts.push(apex[i]);
    const next = i + 1 < apex.length ? apex[i + 1] : b;
    pts.push(lerp2(apex[i], next, 0.12));
    prev = apex[i];
  }
  pts.push(b.slice());
  return pts;
}

// A ski line: descend along the fall line with a sinusoidal weave.
function skiLine(start, len, amp, wave, phase, step = 0.12) {
  let [x, z] = start;
  let s = 0;
  // base path follows the steepest descent, smoothed
  let dirx = 0, dirz = 0;
  const base = [[x, z]];
  while (s < len) {
    const [gx, gz] = gradAt(x, z, 0.4);
    const gl = Math.hypot(gx, gz) || 1;
    // mostly a fixed heading (skiers hold a line), nudged by the fall line
    const tx = -0.22 * 0.75 + (-gx / gl) * 0.25, tz = 0.975 * 0.75 + (-gz / gl) * 0.25;
    dirx = dirx * 0.92 + tx * 0.08 * (s === 0 ? 12.5 : 1);
    dirz = dirz * 0.92 + tz * 0.08 * (s === 0 ? 12.5 : 1);
    const dl = Math.hypot(dirx, dirz) || 1;
    x += (dirx / dl) * step;
    z += (dirz / dl) * step;
    s += step;
    base.push([x, z]);
  }
  // weave perpendicular to the base path
  const res = [];
  let acc = 0;
  for (let i = 0; i < base.length; i++) {
    const p = base[i];
    const q = base[Math.min(i + 1, base.length - 1)];
    const r = base[Math.max(i - 1, 0)];
    let tx = q[0] - r[0], tz = q[1] - r[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    if (i > 0) acc += Math.hypot(p[0] - base[i - 1][0], p[1] - base[i - 1][1]);
    const fade = Math.min(1, acc / 2.5);
    const off = amp * fade * Math.sin((acc / wave) * Math.PI * 2 + phase);
    res.push([p[0] - tz * off, p[1] + tx * off]);
  }
  return res;
}

// Offset a 2D polyline sideways (for the second ski of a pair).
function offset2(pts, d) {
  return pts.map((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)];
    let tx = q[0] - r[0], tz = q[1] - r[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    return [p[0] - tz * d, p[1] + tx * d];
  });
}

// ---------------------------------------------------------------- cairns

function buildCairns(plateau, rand) {
  const [pcx, , pcz] = plateau.center;
  const arcC = [pcx + 0.2, pcz + 1.3];
  const R = 3.7;
  const names = ['About', 'Projects', 'Research', 'Art', 'Fun', 'Blog', 'Daily'];
  const counts = [5, 4, 6, 3, 5, 4, 5];
  const cairns = [];
  for (let i = 0; i < 7; i++) {
    const a = ((-60 + i * 20) * Math.PI) / 180;
    const x = arcC[0] + R * Math.sin(a);
    const z = arcC[1] - R * Math.cos(a);
    const gy = heightAt(x, z);
    const stones = [];
    const n = counts[i];
    let y = gy - 0.035;
    let base = 0.34 + 0.06 * rand();
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : k / (n - 1);
      const rx = base * (1 - 0.52 * t) * (0.9 + 0.2 * rand());
      const rz = rx * (0.72 + 0.22 * rand());
      const ry = rx * (0.42 + 0.16 * rand()) * (k === n - 1 ? 1.15 : 1);
      const cy = y + ry * 0.86;
      stones.push({
        center: [x + (rand() - 0.5) * 0.05 * (k + 1), cy, z + (rand() - 0.5) * 0.05 * (k + 1)],
        radii: [rx, ry, rz],
        e1: 0.62 + 0.22 * rand(), // latitude exponent: flat-ish top and bottom
        e2: 0.82 + 0.2 * rand(), // longitude exponent: near-round plan
        yaw: rand() * Math.PI * 2,
        tiltX: (rand() - 0.5) * 0.16,
        tiltZ: (rand() - 0.5) * 0.16,
        seed: Math.floor(rand() * 1e6),
        phase: rand(),
      });
      y = cy + ry * 0.84;
    }
    cairns.push({ index: i, label: names[i], position: [x, gy, z], top: y, stones, angle: a });
  }
  return { cairns, arcCenter: arcC, radius: R };
}

// ---------------------------------------------------------------- build

let cached = null;

export function buildWorld() {
  if (cached) return cached;
  const rand = mulberry32(0x5eed2611);
  const plateau = findPlateau();
  const [pcx, , pcz] = plateau.center;

  // The climbing route: valley floor, the south spur in switchbacks, the plateau.
  const valley = [[14.0, 66.0], [11.0, 54.0], [6.5, 42.0], [3.2, 31.5]];
  const zig = switchbacks([3.2, 31.5], [pcx + 0.4, pcz + 6.6], 13, 3.3, rand);
  const ctrl = valley.concat(zig.slice(1)).concat([[pcx + 1.2, pcz + 4.6], [pcx + 1.9, pcz + 3.0], [pcx + 1.3, pcz + 1.7], [pcx + 0.6, pcz + 1.1]]);
  const route2 = resample(catmull(ctrl, 10), 0.12);
  const route = drape(route2, 0.03);
  const routeS = arcLengths(route);

  // Ski tracks on the broad south-west face of the summit.
  const tracks = [];
  const trackStarts = [
    [-7.4, 6.8, 1.35, 7.2, 0.0, 23],
    [-11.6, 7.4, 1.1, 6.0, 2.1, 22],
    [-3.6, 7.0, 1.5, 8.4, 4.0, 19],
  ];
  for (const [x, z, amp, wave, ph, len] of trackStarts) {
    const left = skiLine([x, z], len, amp, wave, ph);
    const l2 = resample(left, 0.1);
    const r2 = offset2(l2, 0.13);
    tracks.push({ a: drape(l2, 0.025), b: drape(r2, 0.025) });
  }

  const cairnSet = buildCairns(plateau, rand);

  cached = {
    plateau,
    route,
    routeS,
    routeLength: routeS[routeS.length - 1],
    tracks,
    ...cairnSet,
    cirque: { qx: CIRQUE.x, qz: CIRQUE.z },
  };
  return cached;
}

// Point on the route at arc length s (clamped).
export function routeAt(world, s) {
  const { route, routeS } = world;
  s = Math.min(Math.max(s, 0), routeS[routeS.length - 1]);
  let lo = 0, hi = routeS.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (routeS[mid] < s) lo = mid; else hi = mid;
  }
  const t = (s - routeS[lo]) / Math.max(routeS[hi] - routeS[lo], 1e-6);
  return v3.lerp(route[lo], route[hi], t);
}

// The sub-polyline of the route between arc lengths s0 and s1.
export function routeSlice(world, s0, s1) {
  const { route, routeS } = world;
  const out = [routeAt(world, s0)];
  for (let i = 0; i < route.length; i++) if (routeS[i] > s0 && routeS[i] < s1) out.push(route[i]);
  out.push(routeAt(world, s1));
  return out;
}

export { resample, catmull, drape, arcLengths, offset2 };
