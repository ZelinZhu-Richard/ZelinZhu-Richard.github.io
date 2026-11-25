// Keyframe tracks keyed in story time u. Pure: no imports, no globals, no clock.
//
// Four kinds:
//   scalar  numbers with a named easing per segment
//   vec3    points on a centripetal Catmull-Rom path (or straight segments), timed by u
//   step    any value, held until the next key
//   affine  v0 + rate * u, exactly (the crank)
//
// Keys. A key is [u, value] or [u, value, ease] or [u, value, ease, flags], or the object
// { u, v, ease, corner, rest, path }. `ease` shapes the segment that STARTS at the key:
//   'smooth' (default)  cubic Hermite with shared, monotone (Steffen) tangents: C1 at keys,
//                       no overshoot between keys; it starts and ends at rest at the ends
//                       of a track, at cuts and next to holds
//   'linear'            constant rate
//   'in' / 'out'        quadratic ease in (slow start) / ease out (slow end)
//   'inOut'             smoothstep, at rest at both ends
//   'hold'              keep this key's value until the next key, then jump to it
//   'cubic-bezier(x1, y1, x2, y2)'  the CSS curve (x1, x2 in [0, 1]); [x1, y1, x2, y2] also works
// Two keys at the same u make a cut: the value jumps there (right-continuous).
//
// Continuity. Every key is C1 unless a hold or cut is declared there, or the key has
// { corner: true }. Smooth segments take the slope of a fixed-shape neighbour, so only two
// fixed shapes meeting with different slopes can break it, and building such a track
// without `corner` throws. { rest: true } forces the slope to 0 at a key.
//
// vec3 tracks place keys on a centripetal Catmull-Rom path (knot spacing sqrt of the chord
// length: no cusps, no self-intersections) and move along it with a timing curve through
// the knots that uses the same easings; a path corner (two straight segments meeting at an
// angle) makes the timing rest there, so motion stays C1. `path: 'linear'` in a key's flags
// makes the segment starting at that key straight.
//
// Evaluation is a pure function of u: clamped to the first and last key outside them,
// binary search for the segment, no allocation beyond the returned value (vec3 tracks have
// evaluateInto(out, u), which allocates nothing).

const SMOOTH = 0;
const LINEAR = 1;
const IN = 2;
const OUT = 3;
const IN_OUT = 4;
const HOLD = 5;
const BEZIER = 6;
const EASE_CODES = { smooth: SMOOTH, linear: LINEAR, in: IN, out: OUT, inOut: IN_OUT, hold: HOLD };

/** Easing names a key may use (plus any 'cubic-bezier(...)'). */
export const EASES = Object.freeze(['smooth', 'linear', 'in', 'out', 'inOut', 'hold', 'cubic-bezier']);

const PATH_CR = 0;
const PATH_LINE = 1;

/** Shortest knot spacing (a repeated point still gets a positive knot interval). */
const KNOT_EPS = 1e-6;
/** Relative tolerance for "these two slopes are equal". */
const SLOPE_TOL = 1e-9;
/** Two straight segments meeting at more than this angle (radians) form a corner. */
const CORNER_ANGLE = 1e-4;

/**
 * @typedef {string | number[] | { bezier: number[] } | undefined | null} EaseSpec
 * @typedef {{ corner?: boolean, rest?: boolean, path?: 'cr' | 'linear' }} KeyFlags
 * @typedef {[number, any] | [number, any, EaseSpec] | [number, any, EaseSpec, KeyFlags] | ({ u: number, v: any, ease?: EaseSpec } & KeyFlags)} KeySpec
 * @typedef {{ type: 'scalar', name: string, range: [number, number] | null, us: ReadonlyArray<number>, cuts: ReadonlyArray<number>, evaluate(u: number): number }} ScalarTrack
 * @typedef {{ type: 'vec3', name: string, us: ReadonlyArray<number>, cuts: ReadonlyArray<number>, evaluate(u: number): number[], evaluateInto(out: number[] | Float32Array | Float64Array, u: number): any }} Vec3Track
 * @typedef {{ type: 'step', name: string, us: ReadonlyArray<number>, cuts: ReadonlyArray<number>, evaluate(u: number): any }} StepTrack
 * @typedef {{ type: 'affine', name: string, range: [number, number] | null, at0: number, perU: number, us: ReadonlyArray<number>, cuts: ReadonlyArray<number>, evaluate(u: number): number }} AffineTrack
 * @typedef {ScalarTrack | Vec3Track | StepTrack | AffineTrack} Track
 */

// ------------------------------------------------------------------ easings ---

/**
 * @param {EaseSpec} spec
 * @param {string} where
 * @returns {{ code: number, bz: number[] | null }}
 */
function parseEase(spec, where) {
  if (spec === undefined || spec === null) return { code: SMOOTH, bz: null };
  if (typeof spec === 'string') {
    if (Object.hasOwn(EASE_CODES, spec)) return { code: EASE_CODES[spec], bz: null };
    const m = /^cubic-bezier\(([^)]*)\)$/.exec(spec.replace(/\s+/g, ''));
    if (m) return bezierEase(m[1].split(',').map(Number), where);
    throw new TypeError(`${where}: unknown ease "${spec}"`);
  }
  if (Array.isArray(spec)) return bezierEase(spec, where);
  if (typeof spec === 'object' && Array.isArray(spec.bezier)) return bezierEase(spec.bezier, where);
  throw new TypeError(`${where}: unknown ease ${JSON.stringify(spec)}`);
}

/** @param {number[]} p @param {string} where */
function bezierEase(p, where) {
  if (p.length !== 4 || !p.every(Number.isFinite)) throw new TypeError(`${where}: cubic-bezier needs four finite numbers`);
  if (p[0] < 0 || p[0] > 1 || p[2] < 0 || p[2] > 1) throw new RangeError(`${where}: cubic-bezier x1 and x2 must be in [0, 1]`);
  return { code: BEZIER, bz: p.slice() };
}

/** CSS cubic-bezier: y at x = s. Newton from s, bisection if it stalls. */
function bezierAt(x1, y1, x2, y2, s) {
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  let t = s;
  for (let k = 0; k < 8; k++) {
    const x = ((ax * t + bx) * t + cx) * t - s;
    if (Math.abs(x) < 1e-12) return ((ay * t + by) * t + cy) * t;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(d) < 1e-9) break;
    t -= x / d;
  }
  let lo = 0;
  let hi = 1;
  t = s;
  for (let k = 0; k < 60; k++) {
    const x = ((ax * t + bx) * t + cx) * t;
    if (Math.abs(x - s) < 1e-12) break;
    if (x < s) lo = t;
    else hi = t;
    t = 0.5 * (lo + hi);
  }
  return ((ay * t + by) * t + cy) * t;
}

/** dy/dx of a CSS cubic-bezier at its start (end = false) or end (end = true). */
function bezierSlope(bz, end) {
  const [x1, y1, x2, y2] = bz;
  if (!end) {
    if (x1 > 1e-12) return y1 / x1;
    if (y1 !== 0) return y1 > 0 ? Infinity : -Infinity;
    if (x2 > 1e-12) return y2 / x2;
    return y2 === 0 ? 1 : y2 > 0 ? Infinity : -Infinity;
  }
  if (x2 < 1 - 1e-12) return (1 - y2) / (1 - x2);
  if (y2 !== 1) return y2 < 1 ? Infinity : -Infinity;
  if (x1 < 1 - 1e-12) return (1 - y1) / (1 - x1);
  return y1 === 1 ? 1 : y1 < 1 ? Infinity : -Infinity;
}

/** Fixed-shape easing value at s in [0, 1]. */
function easeAt(code, bz, offset, s) {
  switch (code) {
    case LINEAR: return s;
    case IN: return s * s;
    case OUT: return s * (2 - s);
    case IN_OUT: return s * s * (3 - 2 * s);
    case HOLD: return 0;
    case BEZIER: return bezierAt(bz[offset], bz[offset + 1], bz[offset + 2], bz[offset + 3], s);
    default: return s;
  }
}

/** Derivative of a fixed-shape easing at its start (end = false) or end. */
function easeSlope(code, bz, offset, end) {
  switch (code) {
    case LINEAR: return 1;
    case IN: return end ? 2 : 0;
    case OUT: return end ? 0 : 2;
    case IN_OUT: return 0;
    case HOLD: return 0;
    case BEZIER: return bezierSlope([bz[offset], bz[offset + 1], bz[offset + 2], bz[offset + 3]], end);
    default: return 1;
  }
}

// --------------------------------------------------------------------- keys ---

/**
 * @param {KeySpec} key
 * @param {string} where
 * @returns {{ u: number, v: any, ease: EaseSpec, flags: KeyFlags }}
 */
function readKey(key, where) {
  if (Array.isArray(key)) {
    if (key.length < 2 || key.length > 4) throw new TypeError(`${where}: a key is [u, value, ease?, flags?]`);
    return { u: key[0], v: key[1], ease: key[2], flags: key[3] || {} };
  }
  if (key && typeof key === 'object') return { u: key.u, v: key.v, ease: key.ease, flags: key };
  throw new TypeError(`${where}: a key is [u, value, ease?, flags?] or { u, v, ease }`);
}

/** @param {number[]} us @param {string} name */
function checkTimes(us, name) {
  if (us.length === 0) throw new RangeError(`track "${name}": needs at least one key`);
  for (let i = 0; i < us.length; i++) {
    if (!Number.isFinite(us[i])) throw new TypeError(`track "${name}": key ${i} has a non-finite u`);
    if (i > 0 && us[i] < us[i - 1]) throw new RangeError(`track "${name}": keys must be in u order (key ${i} at ${us[i]} after ${us[i - 1]})`);
    if (i > 1 && us[i] === us[i - 1] && us[i] === us[i - 2]) throw new RangeError(`track "${name}": at most two keys may share u = ${us[i]} (a cut)`);
  }
}

/** Last i with us[i] <= u < us[i + 1], given us[0] <= u < us[n - 1]. */
function findSegment(us, n, u) {
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (us[mid] <= u) lo = mid;
    else hi = mid;
  }
  return lo;
}

// -------------------------------------------------------- the scalar engine ---
// Shared by scalar tracks and by the timing curve of vec3 tracks.

/**
 * @param {number[]} us
 * @param {number[]} vs
 * @param {EaseSpec[]} eases
 * @param {KeyFlags[]} flags
 * @param {Uint8Array | null} forcedRest extra rest keys (vec3 path corners)
 * @param {string} name
 */
function buildCore(us, vs, eases, flags, forcedRest, name) {
  const n = us.length;
  const U = Float64Array.from(us);
  const V = Float64Array.from(vs);
  const code = new Uint8Array(n);
  const bz = new Float64Array(4 * n);
  const corner = new Uint8Array(n);
  const rest = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const e = parseEase(eases[i], `track "${name}" key ${i}`);
    code[i] = e.code;
    if (e.bz) bz.set(e.bz, 4 * i);
    corner[i] = flags[i] && flags[i].corner ? 1 : 0;
    rest[i] = (flags[i] && flags[i].rest) || (forcedRest && forcedRest[i]) ? 1 : 0;
  }
  const len = i => U[i + 1] - U[i];
  // segment to the left / right of key k that has length, or -1
  const left = k => (k >= 1 && len(k - 1) > 0 ? k - 1 : -1);
  const right = k => (k <= n - 2 && len(k) > 0 ? k : -1);
  const startSlope = j => ((V[j + 1] - V[j]) / len(j)) * easeSlope(code[j], bz, 4 * j, false);
  const endSlope = j => ((V[j + 1] - V[j]) / len(j)) * easeSlope(code[j], bz, 4 * j, true);

  /** The one tangent a smooth side uses at key k. */
  function tangent(k) {
    if (rest[k]) return 0;
    const L = left(k);
    const R = right(k);
    if (L < 0 || R < 0) return 0; // track end or cut
    if (code[L] === HOLD || code[R] === HOLD) return 0;
    const ls = code[L] === SMOOTH;
    const rs = code[R] === SMOOTH;
    if (ls && rs) {
      // Steffen (1990): the parabola's slope, limited to twice either secant; 0 at extrema
      const h0 = len(L);
      const h1 = len(R);
      const d0 = (V[k] - V[k - 1]) / h0;
      const d1 = (V[k + 1] - V[k]) / h1;
      if (d0 * d1 <= 0) return 0;
      const p = (d0 * h1 + d1 * h0) / (h0 + h1);
      return Math.sign(d0) * Math.min(2 * Math.abs(d0), 2 * Math.abs(d1), Math.abs(p));
    }
    return ls ? startSlope(R) : endSlope(L);
  }

  const m0 = new Float64Array(n);
  const m1 = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) {
    if (len(i) > 0 && code[i] === SMOOTH) {
      m0[i] = tangent(i);
      m1[i] = tangent(i + 1);
    }
  }

  // C1 at every interior key, unless a hold, a cut or a corner is declared there
  /** @type {number[]} */
  const cuts = [];
  for (let k = 0; k < n; k++) {
    if (k <= n - 2 && len(k) === 0) cuts.push(U[k]);
    const L = left(k);
    const R = right(k);
    if (L < 0 || R < 0) continue;
    if (code[L] === HOLD && V[L] !== V[k]) {
      cuts.push(U[k]);
      continue;
    }
    const sL = code[L] === SMOOTH ? m1[L] : code[L] === HOLD ? 0 : endSlope(L);
    const sR = code[R] === SMOOTH ? m0[R] : code[R] === HOLD ? 0 : startSlope(R);
    const same = sL === sR || Math.abs(sL - sR) <= SLOPE_TOL * (1 + Math.abs(sL) + Math.abs(sR));
    if (!same && !corner[k]) {
      throw new RangeError(`track "${name}": slope breaks at u = ${U[k]} (${sL} vs ${sR}); make one side smooth or declare { corner: true } on that key`);
    }
  }
  return { n, U, V, code, bz, m0, m1, cuts: Object.freeze([...new Set(cuts)]) };
}

/** Value of segment i of a core at u (us[i] <= u < us[i + 1]). */
function segmentValue(core, i, u) {
  const { U, V } = core;
  const h = U[i + 1] - U[i];
  const s = (u - U[i]) / h;
  const v0 = V[i];
  const v1 = V[i + 1];
  const c = core.code[i];
  if (c === SMOOTH) {
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * core.m0[i] + (3 * s2 - 2 * s3) * v1 + (s3 - s2) * h * core.m1[i];
  }
  if (c === HOLD) return v0;
  return v0 + (v1 - v0) * easeAt(c, core.bz, 4 * i, s);
}

/** Value of a core at u, clamped outside its keys. */
function coreValue(core, u) {
  const { n, U, V } = core;
  if (n === 1 || !(u > U[0])) return u === U[0] && n > 1 && U[1] === U[0] ? V[1] : V[0];
  if (u >= U[n - 1]) return V[n - 1];
  return segmentValue(core, findSegment(U, n, u), u);
}

// ------------------------------------------------------------------ scalar ---

/**
 * A scalar keyframe track.
 * @param {KeySpec[]} keys values are numbers
 * @param {{ name?: string, range?: [number, number] | null }} [options]
 * @returns {ScalarTrack}
 */
export function scalarTrack(keys, { name = 'scalar', range = null } = {}) {
  if (!Array.isArray(keys)) throw new TypeError(`track "${name}": keys must be an array`);
  const read = keys.map((k, i) => readKey(k, `track "${name}" key ${i}`));
  const us = read.map(k => k.u);
  checkTimes(us, name);
  read.forEach((k, i) => {
    if (typeof k.v !== 'number' || !Number.isFinite(k.v)) throw new TypeError(`track "${name}": key ${i} needs a finite number`);
  });
  const core = buildCore(us, read.map(k => k.v), read.map(k => k.ease), read.map(k => k.flags), null, name);
  return Object.freeze({
    type: 'scalar',
    name,
    range: range ? Object.freeze([range[0], range[1]]) : null,
    us: Object.freeze(us.slice()),
    cuts: core.cuts,
    /** @param {number} u */
    evaluate(u) {
      return coreValue(core, u);
    },
  });
}

// -------------------------------------------------------------------- vec3 ---

/**
 * A point track on a centripetal Catmull-Rom path.
 * @param {KeySpec[]} keys values are [x, y, z]
 * @param {{ name?: string }} [options]
 * @returns {Vec3Track}
 */
export function vec3Track(keys, { name = 'vec3' } = {}) {
  if (!Array.isArray(keys)) throw new TypeError(`track "${name}": keys must be an array`);
  const read = keys.map((k, i) => readKey(k, `track "${name}" key ${i}`));
  const us = read.map(k => k.u);
  checkTimes(us, name);
  const n = us.length;
  const P = new Float64Array(3 * n);
  read.forEach((k, i) => {
    const v = k.v;
    if (!v || v.length !== 3 || ![v[0], v[1], v[2]].every(Number.isFinite)) throw new TypeError(`track "${name}": key ${i} needs [x, y, z] finite`);
    P[3 * i] = v[0];
    P[3 * i + 1] = v[1];
    P[3 * i + 2] = v[2];
  });
  const path = new Uint8Array(n);
  read.forEach((k, i) => {
    const p = k.flags.path;
    if (p !== undefined && p !== 'cr' && p !== 'linear') throw new TypeError(`track "${name}": key ${i} path must be 'cr' or 'linear'`);
    path[i] = p === 'linear' ? PATH_LINE : PATH_CR;
  });
  const holdAt = read.map(k => k.ease === 'hold');
  const len = i => us[i + 1] - us[i];

  // knots: centripetal spacing, sqrt of the chord length
  const t = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) {
    const d = Math.hypot(P[3 * i + 3] - P[3 * i], P[3 * i + 4] - P[3 * i + 1], P[3 * i + 5] - P[3 * i + 2]);
    t[i + 1] = t[i] + (len(i) > 0 ? Math.max(Math.sqrt(d), KNOT_EPS) : 1);
  }
  // a segment that moves (has length in u and does not hold)
  const moving = i => i >= 0 && i <= n - 2 && len(i) > 0 && !holdAt[i];
  const chord = (j, c) => (P[3 * j + 3 + c] - P[3 * j + c]) / (t[j + 1] - t[j]);
  /** dP/dt at key k, for whichever side is a curve. */
  function geomTangent(k, c) {
    const L = moving(k - 1) ? k - 1 : -1;
    const R = moving(k) ? k : -1;
    if (L >= 0 && R >= 0) {
      if (path[L] === PATH_CR && path[R] === PATH_CR) {
        // Barry-Goldman: the derivative of the non-uniform Catmull-Rom curve at its knot
        return (P[3 * k + c] - P[3 * k - 3 + c]) / (t[k] - t[k - 1])
          - (P[3 * k + 3 + c] - P[3 * k - 3 + c]) / (t[k + 1] - t[k - 1])
          + (P[3 * k + 3 + c] - P[3 * k + c]) / (t[k + 1] - t[k]);
      }
      return path[L] === PATH_LINE ? chord(L, c) : chord(R, c);
    }
    if (R >= 0) return chord(R, c);
    if (L >= 0) return chord(L, c);
    return 0;
  }
  const T0 = new Float64Array(3 * n);
  const T1 = new Float64Array(3 * n);
  for (let i = 0; i < n - 1; i++) {
    if (!moving(i) || path[i] !== PATH_CR) continue;
    for (let c = 0; c < 3; c++) {
      T0[3 * i + c] = geomTangent(i, c);
      T1[3 * i + c] = geomTangent(i + 1, c);
    }
  }
  // two straight segments meeting at an angle: the timing rests at the corner (C1 motion)
  const forcedRest = new Uint8Array(n);
  for (let k = 1; k < n - 1; k++) {
    if (!moving(k - 1) || !moving(k) || path[k - 1] !== PATH_LINE || path[k] !== PATH_LINE || read[k].flags.corner) continue;
    const a = [chord(k - 1, 0), chord(k - 1, 1), chord(k - 1, 2)];
    const b = [chord(k, 0), chord(k, 1), chord(k, 2)];
    const la = Math.hypot(a[0], a[1], a[2]);
    const lb = Math.hypot(b[0], b[1], b[2]);
    if (la < 1e-9 || lb < 1e-9) continue;
    const cos = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
    if (Math.acos(Math.min(1, Math.max(-1, cos))) > CORNER_ANGLE) forcedRest[k] = 1;
  }
  const timing = buildCore(us, Array.from(t), read.map(k => k.ease), read.map(k => k.flags), forcedRest, name);
  const U = timing.U;

  /** @param {any} out @param {number} u */
  function evaluateInto(out, u) {
    let i;
    if (n === 1 || !(u > U[0])) i = u === U[0] && n > 1 && U[1] === U[0] ? 1 : 0;
    else if (u >= U[n - 1]) i = n - 1;
    else i = -1;
    if (i >= 0) {
      out[0] = P[3 * i];
      out[1] = P[3 * i + 1];
      out[2] = P[3 * i + 2];
      return out;
    }
    i = findSegment(U, n, u);
    const dt = t[i + 1] - t[i];
    const s = (segmentValue(timing, i, u) - t[i]) / dt;
    const j = 3 * i;
    if (path[i] === PATH_LINE) {
      out[0] = P[j] + (P[j + 3] - P[j]) * s;
      out[1] = P[j + 1] + (P[j + 4] - P[j + 1]) * s;
      out[2] = P[j + 2] + (P[j + 5] - P[j + 2]) * s;
      return out;
    }
    const s2 = s * s;
    const s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1;
    const h10 = (s3 - 2 * s2 + s) * dt;
    const h01 = 3 * s2 - 2 * s3;
    const h11 = (s3 - s2) * dt;
    out[0] = h00 * P[j] + h10 * T0[j] + h01 * P[j + 3] + h11 * T1[j];
    out[1] = h00 * P[j + 1] + h10 * T0[j + 1] + h01 * P[j + 4] + h11 * T1[j + 1];
    out[2] = h00 * P[j + 2] + h10 * T0[j + 2] + h01 * P[j + 5] + h11 * T1[j + 2];
    return out;
  }

  return Object.freeze({
    type: 'vec3',
    name,
    us: Object.freeze(us.slice()),
    cuts: timing.cuts,
    /** @param {number} u */
    evaluate(u) {
      return evaluateInto([0, 0, 0], u);
    },
    evaluateInto,
  });
}

// -------------------------------------------------------------------- step ---

/**
 * A step track: each key's value holds until the next key.
 * @param {Array<[number, any] | { u: number, v: any }>} keys
 * @param {{ name?: string }} [options]
 * @returns {StepTrack}
 */
export function stepTrack(keys, { name = 'step' } = {}) {
  if (!Array.isArray(keys)) throw new TypeError(`track "${name}": keys must be an array`);
  const read = keys.map((k, i) => readKey(/** @type {any} */ (k), `track "${name}" key ${i}`));
  const us = read.map(k => k.u);
  checkTimes(us, name);
  const values = read.map(k => k.v);
  const U = Float64Array.from(us);
  const n = U.length;
  return Object.freeze({
    type: 'step',
    name,
    us: Object.freeze(us.slice()),
    cuts: Object.freeze([...new Set(us.slice(1))]),
    /** @param {number} u */
    evaluate(u) {
      if (!(u >= U[0])) return values[0];
      if (u >= U[n - 1]) return values[n - 1];
      return values[findSegment(U, n, u)];
    },
  });
}

// ------------------------------------------------------------------ affine ---

/**
 * v(u) = at0 + perU * u, exactly, for every u (no clamping, no keys).
 * @param {number} at0
 * @param {number} perU
 * @param {{ name?: string, range?: [number, number] | null }} [options]
 * @returns {AffineTrack}
 */
export function affineTrack(at0, perU, { name = 'affine', range = null } = {}) {
  if (!Number.isFinite(at0) || !Number.isFinite(perU)) throw new TypeError(`track "${name}": at0 and perU must be finite`);
  return Object.freeze({
    type: 'affine',
    name,
    range: range ? Object.freeze([range[0], range[1]]) : null,
    at0,
    perU,
    us: Object.freeze([]),
    cuts: Object.freeze([]),
    /** @param {number} u */
    evaluate(u) {
      return at0 + perU * u;
    },
  });
}

// ------------------------------------------------------------------- specs ---

/**
 * Builds a track from plain data, as the choreography writes it:
 *   a number                          constant scalar
 *   an array of keys                  scalar track
 *   { type: 'scalar', keys, range }   scalar track
 *   { type: 'vec3', keys }            vec3 track (a bare [x, y, z] is a constant point)
 *   { type: 'step', keys }            step track
 *   { type: 'affine', at0, perU, range }
 * @param {any} spec
 * @param {string} [name]
 * @returns {Track}
 */
export function compileTrack(spec, name = 'track') {
  if (typeof spec === 'number') return scalarTrack([[0, spec]], { name });
  if (Array.isArray(spec)) {
    if (spec.length === 3 && spec.every(x => typeof x === 'number')) return vec3Track([[0, spec]], { name });
    return scalarTrack(spec, { name });
  }
  if (!spec || typeof spec !== 'object') throw new TypeError(`track "${name}": cannot build a track from ${JSON.stringify(spec)}`);
  const type = spec.type || 'scalar';
  if (type === 'scalar') return scalarTrack(spec.keys, { name, range: spec.range || null });
  if (type === 'vec3') return vec3Track(spec.keys, { name });
  if (type === 'step') return stepTrack(spec.keys, { name });
  if (type === 'affine') return affineTrack(spec.at0, spec.perU, { name, range: spec.range || null });
  throw new TypeError(`track "${name}": unknown type "${type}"`);
}
