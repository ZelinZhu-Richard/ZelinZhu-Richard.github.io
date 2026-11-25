// Small pure vector, quaternion and matrix helpers for the instrument's pure
// half (layout, part builders, the ambient-occlusion bake). Matrices are 4x4,
// column-major Float64Array(16), the same element order as THREE.Matrix4, so
// the three.js side copies them with matrix.fromArray(). Quaternions are
// [x, y, z, w].

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

/** @typedef {number[] | Float64Array} M4 */

/** @returns {Float64Array} */
export function identity() {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/**
 * a * b (apply b first).
 * @param {M4} a @param {M4} b
 * @returns {Float64Array}
 */
export function mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

/** Product of several matrices, left to right (the last is applied first). */
export function chain(...ms) {
  let o = ms[0];
  for (let i = 1; i < ms.length; i++) o = mul(o, ms[i]);
  return o;
}

/** @param {number[]} t */
export function translate(t) {
  const m = identity();
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  return m;
}

/** @param {number | number[]} s */
export function scale(s) {
  const m = identity();
  const v = typeof s === 'number' ? [s, s, s] : s;
  m[0] = v[0];
  m[5] = v[1];
  m[10] = v[2];
  return m;
}

/** Rotation about +Y by a (counter-clockwise seen from above; maps +x to dir(a)). */
export function rotY(a) {
  const m = identity();
  const c = Math.cos(a);
  const s = Math.sin(a);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

/** @param {number[]} q */
export function fromQuat(q) {
  const [x, y, z, w] = q;
  const m = identity();
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = 1 - (yy + zz);
  m[1] = xy + wz;
  m[2] = xz - wy;
  m[4] = xy - wz;
  m[5] = 1 - (xx + zz);
  m[6] = yz + wx;
  m[8] = xz + wy;
  m[9] = yz - wx;
  m[10] = 1 - (xx + yy);
  return m;
}

/** translate(pos) * rotate(quat) * scale(s) */
export function compose(pos, quat = null, s = 1) {
  let m = quat ? fromQuat(quat) : identity();
  if (s !== 1) m = mul(m, scale(s));
  m[12] = pos[0];
  m[13] = pos[1];
  m[14] = pos[2];
  return m;
}

/** Scale (number or [x, y, z]) about a pivot point. */
export function scaleAbout(p, s) {
  return chain(translate(p), scale(s), translate([-p[0], -p[1], -p[2]]));
}

/** Rotation about an axis through a point. */
export function rotateAbout(p, axis, angle) {
  return chain(translate(p), fromQuat(quatAxis(axis, angle)), translate([-p[0], -p[1], -p[2]]));
}

/** @param {M4} m @param {number[]} p @returns {number[]} */
export function apply(m, p) {
  const x = p[0], y = p[1], z = p[2];
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** The upper 3x3 applied to a direction (no translation). */
export function applyDir(m, d) {
  const x = d[0], y = d[1], z = d[2];
  return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
}

/**
 * Inverse-transpose of the upper 3x3 as a 9-array (column-major), for normals.
 * @param {M4} m
 */
export function normalMatrix(m) {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];
  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;
  let det = a00 * b01 + a01 * b11 + a02 * b21;
  det = det ? 1 / det : 0;
  // inverse (column-major)
  const inv = [
    b01 * det, (-a22 * a01 + a02 * a21) * det, (a12 * a01 - a02 * a11) * det,
    b11 * det, (a22 * a00 - a02 * a20) * det, (-a12 * a00 + a02 * a10) * det,
    b21 * det, (-a21 * a00 + a01 * a20) * det, (a11 * a00 - a01 * a10) * det,
  ];
  // transpose
  return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]];
}

/** @param {number[]} n3 9-array @param {number[]} v */
export function applyN(n3, v) {
  const x = n3[0] * v[0] + n3[3] * v[1] + n3[6] * v[2];
  const y = n3[1] * v[0] + n3[4] * v[1] + n3[7] * v[2];
  const z = n3[2] * v[0] + n3[5] * v[1] + n3[8] * v[2];
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** General 4x4 inverse. @param {M4} m */
export function invert(m) {
  const o = new Float64Array(16);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return identity();
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

// ------------------------------------------------------------ quaternions ---

export function quatAxis(axis, angle) {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const s = Math.sin(angle / 2) / l;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** Shortest rotation taking unit-ish vector `from` onto `to`. */
export function quatFromTo(from, to) {
  const a = norm(from);
  const b = norm(to);
  let r = dot(a, b) + 1;
  let q;
  if (r < 1e-8) {
    r = 0;
    q = Math.abs(a[0]) > Math.abs(a[2]) ? [-a[1], a[0], 0, r] : [0, -a[2], a[1], r];
  } else {
    const c = cross(a, b);
    q = [c[0], c[1], c[2], r];
  }
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** a * b (apply b first). */
export function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Euler angles in three.js 'XYZ' order. */
export function quatEuler(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

/** Rotate v by quaternion q. */
export function quatApply(q, v) {
  return applyDir(fromQuat(q), v);
}

// ---------------------------------------------------------------- vectors ---

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mulS = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
/** Rotate v about a unit axis by angle (Rodrigues). */
export function rotateVec(v, axis, angle) {
  const k = norm(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

// ------------------------------------------------------------------ easing ---

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
export const easeInOut = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
/** Ease out with a small overshoot (sphere pop-in); 0 -> 0, 1 -> 1. */
export function easeOutBack(t) {
  const x = clamp01(t);
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
/** Angle wrapped to (-pi, pi]. */
export function wrapPi(a) {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
}
/** Shortest-path angular interpolation. */
export const lerpAngle = (a, b, t) => a + wrapPi(b - a) * t;
