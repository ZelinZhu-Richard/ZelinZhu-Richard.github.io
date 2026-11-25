// Quality tiers 0..3: one table every engine module reads. Pure (no three, no
// DOM), so node --test can check it.
//
//   0  weak phones, old integrated GPUs, software rendering
//   1  phones and tablets (the sketches' "phone" settings)
//   2  laptops and desktops (the sketches' default)
//   3  strong desktop GPUs; reached by detect.js or by the governor raising
//
// Values come from the sketches: sky tiers from sketches/sky/README.md (cost
// per tier), MSAA and reflection scales from sketches/room/main.js TIERS, glow
// levels from sketches/room/post.js. The facade's three-word quality maps onto
// tiers 0, 1, 2; tier 3 reports as 'high'.

/**
 * @typedef {0 | 1 | 2 | 3} TierId
 * @typedef {'low' | 'medium' | 'high'} SceneTierName
 * @typedef {{
 *   tier: TierId,
 *   name: SceneTierName,      // what stats() and the 'tier' event report
 *   dprCap: number,           // device pixel ratio ceiling
 *   maxPixels: number,        // device-pixel budget for the canvas (big screens get a lower DPR)
 *   msaa: 0 | 2 | 4,          // samples for act targets that ask for MSAA
 *   msaaLargeFrame: 0 | 2 | 4,// samples instead, above LARGE_FRAME_PIXELS (a 4x half-float target at 4K is ~170 MB)
 *   sky: 0 | 1 | 2 | 3,       // createSky tier (octave and star-layer budgets)
 *   reflection: { enabled: boolean, scale: number, seaScale: number }, // planar mirrors, fraction of CSS size
 *   glow: { levels: 0 | 1 | 2 | 3 }, // film-finish glow levels (half, quarter, eighth CSS resolution)
 *   maxTextureSize: number,   // largest texture an act should load or generate (also capped by the GPU)
 * }} QualityTier
 */

/** Device pixels above which act targets use msaaLargeFrame samples. */
export const LARGE_FRAME_PIXELS = 4.2e6;

/** Lowest device pixel ratio effectiveDpr() returns for very large canvases. */
export const MIN_DPR = 0.75;

/** @type {readonly Readonly<QualityTier>[]} */
export const TIERS = Object.freeze([
  Object.freeze({ tier: 0, name: 'low', dprCap: 1, maxPixels: 1.3e6, msaa: 0, msaaLargeFrame: 0, sky: 0, reflection: Object.freeze({ enabled: false, scale: 0, seaScale: 0 }), glow: Object.freeze({ levels: 1 }), maxTextureSize: 2048 }),
  Object.freeze({ tier: 1, name: 'medium', dprCap: 1.5, maxPixels: 2.4e6, msaa: 2, msaaLargeFrame: 2, sky: 1, reflection: Object.freeze({ enabled: true, scale: 0.5, seaScale: 0.3 }), glow: Object.freeze({ levels: 2 }), maxTextureSize: 2048 }),
  Object.freeze({ tier: 2, name: 'high', dprCap: 2, maxPixels: 5.2e6, msaa: 4, msaaLargeFrame: 2, sky: 2, reflection: Object.freeze({ enabled: true, scale: 0.5, seaScale: 0.35 }), glow: Object.freeze({ levels: 3 }), maxTextureSize: 4096 }),
  Object.freeze({ tier: 3, name: 'high', dprCap: 2, maxPixels: 9e6, msaa: 4, msaaLargeFrame: 4, sky: 3, reflection: Object.freeze({ enabled: true, scale: 0.75, seaScale: 0.5 }), glow: Object.freeze({ levels: 3 }), maxTextureSize: 4096 }),
]);

export const MIN_TIER = /** @type {TierId} */ (0);
export const MAX_TIER = /** @type {TierId} */ (TIERS.length - 1);

/** Facade quality word -> tier ('auto' is not a tier: detect.js picks one). */
export const QUALITY_TIERS = Object.freeze({ low: /** @type {TierId} */ (0), medium: /** @type {TierId} */ (1), high: /** @type {TierId} */ (2) });

/**
 * Nearest valid tier id (rounds, clamps; junk becomes `fallback`).
 * @param {unknown} t
 * @param {TierId} [fallback]
 * @returns {TierId}
 */
export function clampTier(t, fallback = 2) {
  const n = Math.round(Number(t));
  if (!Number.isFinite(n)) return fallback;
  return /** @type {TierId} */ (Math.min(MAX_TIER, Math.max(MIN_TIER, n)));
}

/**
 * The settings for a tier (clamped).
 * @param {unknown} t
 * @returns {Readonly<QualityTier>}
 */
export function tierSettings(t) {
  return TIERS[clampTier(t)];
}

/**
 * Facade quality ('auto' | 'high' | 'medium' | 'low') -> fixed tier, or null for 'auto'.
 * @param {string} quality
 * @returns {TierId | null}
 */
export function tierForQuality(quality) {
  if (quality === 'auto') return null;
  if (!Object.prototype.hasOwnProperty.call(QUALITY_TIERS, quality)) throw new TypeError(`tierForQuality: unknown quality "${quality}"`);
  return QUALITY_TIERS[/** @type {'low' | 'medium' | 'high'} */ (quality)];
}

/**
 * Device pixel ratio to render at: the device's own, capped by the tier and
 * by its pixel budget for this canvas size (never below MIN_DPR).
 * @param {unknown} tier
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {number} deviceDpr window.devicePixelRatio
 * @returns {number}
 */
export function effectiveDpr(tier, cssWidth, cssHeight, deviceDpr) {
  const T = tierSettings(tier);
  const dpr = Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1;
  const area = Math.max(1, cssWidth) * Math.max(1, cssHeight);
  const budget = Math.sqrt(T.maxPixels / area);
  return Math.max(Math.min(MIN_DPR, dpr), Math.min(dpr, T.dprCap, budget));
}

/**
 * MSAA samples for an act target of `pixels` device pixels at this tier,
 * capped by the GPU's MAX_SAMPLES when given.
 * @param {unknown} tier
 * @param {number} pixels
 * @param {number} [maxSamples]
 * @returns {number}
 */
export function msaaSamples(tier, pixels, maxSamples = Infinity) {
  const T = tierSettings(tier);
  const s = pixels > LARGE_FRAME_PIXELS ? T.msaaLargeFrame : T.msaa;
  const cap = Number.isFinite(maxSamples) && maxSamples >= 0 ? maxSamples : Infinity;
  return s > cap ? (cap >= 4 ? 4 : cap >= 2 ? 2 : 0) : s;
}
