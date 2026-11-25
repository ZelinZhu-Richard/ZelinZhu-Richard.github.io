// First guess at a quality tier, before any frame has been timed. The
// governor (governor.js) corrects it from real frame times afterwards.
//
// Two halves:
//  - readSignals(): reads the browser and the renderer (devicePixelRatio,
//    hardwareConcurrency, deviceMemory, pointer type, viewport, Save-Data, the
//    GPU's renderer string and limits). The only impure function here; it
//    imports nothing and touches nothing it was not given.
//  - detectTier(signals): pure rules -> { tier, maxTier, minTier, reasons }.
//    `maxTier` is the ceiling the governor may climb to; it is lower on phones
//    and weak GPUs, so a raise is only ever tried where it can plausibly hold.
//
// The renderer string is a hint, not a benchmark: browsers mask or bucket it
// (Safari reports "Apple GPU" everywhere), so unknown names change nothing.

import { MAX_TIER, MIN_TIER, clampTier } from './tiers.js';

/**
 * @typedef {import('./tiers.js').TierId} TierId
 * @typedef {'software' | 'weak' | 'mid' | 'strong' | 'unknown'} GpuClass
 * @typedef {{
 *   dpr: number,                 // window.devicePixelRatio
 *   cores: number | null,        // navigator.hardwareConcurrency
 *   memory: number | null,       // navigator.deviceMemory (GB, Chromium only; bucketed, max 8)
 *   coarse: boolean,             // primary pointer is coarse (touch)
 *   fine: boolean,               // any fine pointer (mouse, trackpad, stylus) is present
 *   width: number,               // CSS viewport size
 *   height: number,
 *   saveData: boolean,           // navigator.connection.saveData
 *   gpu: string | null,          // unmasked renderer string when the browser gives one
 *   maxTextureSize: number | null,
 *   maxSamples: number | null,
 * }} QualitySignals
 * @typedef {{ tier: TierId, maxTier: TierId, minTier: TierId, gpuClass: GpuClass, mobile: boolean, reasons: string[] }} TierGuess
 */

// Order matters: the first matching class wins.
const GPU_RULES = /** @type {[GpuClass, RegExp][]} */ ([
  ['software', /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|mesa offscreen|warp/i],
  ['strong', /geforce\s*(gtx\s*1[06-9]\d0|gtx\s*16\d0|rtx)|\brtx\s*\d|quadro\s*rtx|radeon\s*(rx\s*[5-9]\d{3}|pro\s*w)|apple\s*m[1-9]|intel.*\barc\b/i],
  ['weak', /mali-?(4\d\d|t\d{3}|g(31|51|52|57|68|71|72))\b|adreno\D*([2-5]\d\d|6[0-1]\d)\b|powervr|sgx|videocore|vivante|tegra|intel.*\b(hd graphics( [2-5]\d{2,3})?|gma)\b/i],
  ['mid', /adreno|mali|apple|intel|radeon|geforce|nvidia|amd|immortalis|xclipse/i],
]);

/**
 * Class of a GPU from its renderer string.
 * @param {string | null | undefined} name
 * @returns {GpuClass}
 */
export function classifyGpu(name) {
  if (!name || typeof name !== 'string') return 'unknown';
  for (const [cls, re] of GPU_RULES) if (re.test(name)) return cls;
  return 'unknown';
}

/** @param {unknown} v @returns {number | null} */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/**
 * Read the signals from a browser window and a WebGL renderer (three's
 * WebGLRenderer or anything with getContext() and capabilities). Every read
 * is guarded: a missing API gives null or false, never a throw.
 * @param {{ window?: any, renderer?: any }} [sources]
 * @returns {QualitySignals}
 */
export function readSignals({ window: w = globalThis, renderer = null } = {}) {
  const nav = (w && w.navigator) || {};
  const mm = (/** @type {string} */ q) => {
    try {
      return !!(w && typeof w.matchMedia === 'function' && w.matchMedia(q).matches);
    } catch {
      return false;
    }
  };
  let gpu = null;
  let maxTextureSize = null;
  let maxSamples = null;
  try {
    const caps = renderer && renderer.capabilities;
    maxTextureSize = num(caps && caps.maxTextureSize);
    maxSamples = typeof (caps && caps.maxSamples) === 'number' ? caps.maxSamples : null;
    const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
    if (gl) {
      // Firefox exposes the (sanitised) name as RENDERER and deprecates the
      // debug extension; Chromium and Safari need the extension.
      const plain = String(gl.getParameter(gl.RENDERER) || '');
      if (plain && !/^webkit webgl$/i.test(plain)) gpu = plain;
      else {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') || null;
      }
    }
  } catch {
    /* a lost context or a locked-down browser: no GPU hints */
  }
  return {
    dpr: num(w && w.devicePixelRatio) ?? 1,
    cores: num(nav.hardwareConcurrency),
    memory: num(nav.deviceMemory),
    coarse: mm('(pointer: coarse)'),
    fine: mm('(any-pointer: fine)'),
    width: num(w && w.innerWidth) ?? 1280,
    height: num(w && w.innerHeight) ?? 800,
    saveData: !!(nav.connection && nav.connection.saveData),
    gpu,
    maxTextureSize,
    maxSamples,
  };
}

/**
 * Rules, applied in order (each line of `reasons` names the one that fired):
 *  1. software rendering: tier 0, no raises;
 *  2. start at 1 on a phone or tablet (coarse pointer and no fine one), 2 otherwise;
 *  3. GPU class: weak caps the start at 0 on phones, 1 elsewhere; strong desktop
 *     GPUs (with at least 8 cores and, when known, 8 GB) start at 3;
 *  4. caps: deviceMemory <= 2 GB -> 0, <= 4 GB -> 1; hardwareConcurrency <= 2 -> 1;
 *     Save-Data -> 1; MAX_TEXTURE_SIZE < 4096 -> 1;
 *  5. ceiling for the governor: 0 for software, start + 1 for weak GPUs and
 *     capped devices, 2 on phones, 3 on desktops.
 * @param {Partial<QualitySignals>} s
 * @returns {TierGuess}
 */
export function detectTier(s = {}) {
  const reasons = [];
  const gpuClass = classifyGpu(s.gpu);
  const mobile = !!s.coarse && !s.fine;
  if (gpuClass === 'software') {
    reasons.push(`software renderer (${s.gpu})`);
    return { tier: MIN_TIER, maxTier: MIN_TIER, minTier: MIN_TIER, gpuClass, mobile, reasons };
  }
  let tier = mobile ? 1 : 2;
  reasons.push(mobile ? 'touch device: start at 1' : 'desktop: start at 2');
  let cap = MAX_TIER;
  let ceiling = mobile ? 2 : MAX_TIER;
  if (gpuClass === 'weak') {
    cap = Math.min(cap, mobile ? 0 : 1);
    reasons.push(`weak GPU (${s.gpu})`);
  } else if (gpuClass === 'strong' && !mobile && (s.cores == null || s.cores >= 8) && (s.memory == null || s.memory >= 8)) {
    tier = 3;
    reasons.push(`strong GPU (${s.gpu})`);
  }
  if (s.memory != null && s.memory <= 2) {
    cap = Math.min(cap, 0);
    reasons.push(`${s.memory} GB memory`);
  } else if (s.memory != null && s.memory <= 4) {
    cap = Math.min(cap, 1);
    reasons.push(`${s.memory} GB memory`);
  }
  if (s.cores != null && s.cores <= 2) {
    cap = Math.min(cap, 1);
    reasons.push(`${s.cores} cores`);
  }
  if (s.saveData) {
    cap = Math.min(cap, 1);
    reasons.push('Save-Data');
  }
  if (s.maxTextureSize != null && s.maxTextureSize < 4096) {
    cap = Math.min(cap, 1);
    reasons.push(`MAX_TEXTURE_SIZE ${s.maxTextureSize}`);
  }
  const start = clampTier(Math.min(tier, cap));
  if (cap < MAX_TIER) ceiling = Math.min(ceiling, start + 1);
  const maxTier = clampTier(Math.max(start, ceiling));
  return { tier: start, maxTier, minTier: MIN_TIER, gpuClass, mobile, reasons };
}

/**
 * Convenience: readSignals() then detectTier().
 * @param {{ window?: any, renderer?: any }} [sources]
 * @returns {TierGuess & { signals: QualitySignals }}
 */
export function detectQuality(sources) {
  const signals = readSignals(sources);
  return { ...detectTier(signals), signals };
}
