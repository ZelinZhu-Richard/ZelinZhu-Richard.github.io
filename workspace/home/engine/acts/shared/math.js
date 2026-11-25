// Small pure helpers the acts share: clamping and easing, colours, light
// directions. No three.js, no DOM.

export const DEG = Math.PI / 180;

/** @param {number} x @param {number} lo @param {number} hi */
export function clamp(x, lo, hi) {
  if (!Number.isFinite(x)) return lo;
  return x < lo ? lo : x > hi ? hi : x;
}

/** 0..1; NaN and junk read as 0. @param {number} x */
export function clamp01(x) {
  return Number.isFinite(x) ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0;
}

/** @param {number} a @param {number} b @param {number} t */
export const lerp = (a, b, t) => a + (b - a) * t;

/** C1 smoothstep of x between e0 and e1. @param {number} e0 @param {number} e1 @param {number} x */
export function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** @param {number} c sRGB channel 0..1 */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * '#rrggbb' (sRGB) -> linear [r, g, b], optionally scaled.
 * @param {string} hex
 * @param {number} [k]
 * @returns {[number, number, number]}
 */
export function hexLinear(hex, k = 1) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255) * k, srgbToLinear(((n >> 8) & 255) / 255) * k, srgbToLinear((n & 255) / 255) * k];
}

/**
 * Unit vector toward a light at world azimuth / elevation (degrees), in the
 * instrument's convention: dir(a) = (cos a, 0, -sin a).
 * @param {number} azDeg
 * @param {number} elDeg
 * @returns {[number, number, number]}
 */
export function lightDir(azDeg, elDeg) {
  const a = azDeg * DEG;
  const e = elDeg * DEG;
  return [Math.cos(e) * Math.cos(a), Math.sin(e), -Math.cos(e) * Math.sin(a)];
}

/**
 * Component-wise lerp of two equal-length arrays into `out`.
 * @param {number[]} out
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @param {number} t
 */
export function mixInto(out, a, b, t) {
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

/** Normalised lerp of two directions into `out`. @param {number[]} out @param {ArrayLike<number>} a @param {ArrayLike<number>} b @param {number} t */
export function nlerpInto(out, a, b, t) {
  mixInto(out, a, b, t);
  const l = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= l;
  out[1] /= l;
  out[2] /= l;
  return out;
}

/** The ART.md tokens, sRGB. */
export const INK = Object.freeze({
  night: '#100f15',
  stage: '#08070b',
  ink: '#ece9e1',
  muted: '#a8a398',
  faint: '#7a766d',
  line: '#2d2b34',
  accent: '#e8743b',
  amber: '#ffb469',
  aurora: '#39f0a6',
});

/**
 * Does an NDC rect [x0, y0, x1, y1] look valid?
 * @param {unknown} r
 * @returns {r is number[]}
 */
export function isRect(r) {
  return Array.isArray(r) && r.length === 4 && r.every((v) => Number.isFinite(v));
}
