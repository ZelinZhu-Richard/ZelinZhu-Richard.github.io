// The quality governor: feed it frame times, it answers with tier changes.
// Pure: no timers, no clock reads, no globals. Its only clock is the sum of
// the frame times it was fed, so a recorded trace replays exactly.
//
// Rules:
//  - A frame is slow above budget x slowFactor (20.8 ms at 60 Hz) and fast at
//    or below budget x fastFactor (18 ms: vsync jitter). A frame time over
//    pauseMs (a hidden tab, a breakpoint, a long load) or not a positive
//    finite number is ignored outright.
//  - The window is the last `windowFrames` counted frames, or fewer once they
//    add up to `windowMs` (so a 20 fps device is judged as quickly as a 60 fps
//    one). It is slow when its median is slow or at least `dropShare` of its
//    frames are (judder: every other frame missing vsync). It is stable when
//    its median is fast and at most `raiseShare` of its frames are slow.
//  - Drop one tier once the window has stayed slow for `dropAfterMs`.
//  - Raise one tier once the window has stayed stable for `raiseAfterMs`
//    (long: a raise is a probe, a drop is a rescue).
//  - Never oscillate: a drop lowers the ceiling below the tier that failed,
//    so the governor never returns to it. Changes can only run up, then down.
//  - A drop that did not help (the median improved by less than
//    `minDropGain`) means the time is not ours to win back (a display or
//    power-saving cap at 30 Hz, another tab on the GPU): the governor freezes
//    there instead of draining every tier.
//  - After any change (and at the start) the window is emptied and the next
//    `settleMs` of frames are skipped (new programs compile, targets
//    reallocate, the first textures upload).
//
// Wiring: call push(dtMs) once per drawn frame with the time since the last
// frame (rAF delta) or a measured GPU/CPU frame time; apply a returned
// decision with setTier on post, sky and acts. With quality fixed by the user
// ('high', 'medium', 'low'), do not run a governor at all.

import { MAX_TIER, MIN_TIER, clampTier } from './tiers.js';

/**
 * @typedef {import('./tiers.js').TierId} TierId
 * @typedef {{
 *   budgetMs: number, slowFactor: number, fastFactor: number, pauseMs: number,
 *   windowFrames: number, windowMs: number, minWindowFrames: number,
 *   dropShare: number, dropAfterMs: number, raiseShare: number, raiseAfterMs: number,
 *   settleMs: number, minDropGain: number,
 * }} GovernorOptions
 * @typedef {{ from: TierId, to: TierId, direction: 'up' | 'down', reason: 'slow' | 'stable', atMs: number, medianMs: number, slowShare: number }} TierDecision
 * @typedef {{
 *   tier: TierId, minTier: TierId, ceiling: TierId, frozen: boolean, settlingMs: number,
 *   clockMs: number, frames: number, ignored: number, windowFill: number,
 *   medianMs: number | null, slowShare: number | null, slowRunMs: number, stableRunMs: number,
 *   slowMs: number, fastMs: number, changes: TierDecision[],
 * }} GovernorSnapshot
 * @typedef {{
 *   push(frameMs: number): TierDecision | null,
 *   readonly tier: TierId,
 *   readonly ceiling: TierId,
 *   readonly frozen: boolean,
 *   snapshot(): GovernorSnapshot,
 *   reset(o?: { tier?: number, minTier?: number, maxTier?: number }): void,
 * }} Governor
 */

/** @type {Readonly<GovernorOptions>} */
export const GOVERNOR_DEFAULTS = Object.freeze({
  budgetMs: 1000 / 60,
  slowFactor: 1.25,
  fastFactor: 1.08,
  pauseMs: 400,
  windowFrames: 60,
  windowMs: 1000,
  minWindowFrames: 12,
  dropShare: 0.4,
  dropAfterMs: 1200,
  raiseShare: 0.01,
  raiseAfterMs: 15000,
  settleMs: 750,
  minDropGain: 0.1,
});

/**
 * @param {{ tier?: number, minTier?: number, maxTier?: number } & Partial<GovernorOptions>} [options]
 * @returns {Governor}
 */
export function createGovernor(options = {}) {
  const O = { ...GOVERNOR_DEFAULTS };
  for (const k of /** @type {(keyof GovernorOptions)[]} */ (Object.keys(GOVERNOR_DEFAULTS))) {
    const v = /** @type {any} */ (options)[k];
    if (v !== undefined) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new TypeError(`createGovernor: ${k} must be a non-negative number`);
      O[k] = v;
    }
  }
  const N = Math.round(O.windowFrames);
  if (N < 1) throw new TypeError('createGovernor: windowFrames must be at least 1');
  const minFill = Math.min(N, Math.max(1, Math.round(O.minWindowFrames)));
  const slowMs = O.budgetMs * O.slowFactor;
  const fastMs = O.budgetMs * O.fastFactor;

  // ring buffer of the window, oldest at `tail`
  const ring = new Float64Array(N);
  const scratch = new Float64Array(N);
  /** @type {TierDecision[]} */
  const changes = [];
  const S = {
    tier: /** @type {TierId} */ (2),
    minTier: /** @type {TierId} */ (MIN_TIER),
    ceiling: /** @type {TierId} */ (MAX_TIER),
    frozen: false,
    settlingMs: 0,
    clockMs: 0,
    frames: 0,
    ignored: 0,
    tail: 0,
    fill: 0,
    sum: 0,
    slowCount: 0,
    slowRunMs: 0,
    stableRunMs: 0,
    medianMs: /** @type {number | null} */ (null),
    share: /** @type {number | null} */ (null),
    /** @type {{ to: TierId, medianMs: number } | null} */
    lastDrop: null,
  };

  /** @param {{ tier?: number, minTier?: number, maxTier?: number }} o */
  function init(o) {
    const lo = clampTier(o.minTier ?? MIN_TIER, MIN_TIER);
    const hi = /** @type {TierId} */ (Math.max(lo, clampTier(o.maxTier ?? MAX_TIER, MAX_TIER)));
    S.minTier = lo;
    S.ceiling = hi;
    S.tier = /** @type {TierId} */ (Math.min(hi, Math.max(lo, clampTier(o.tier ?? 2))));
    S.frozen = false;
    S.clockMs = 0;
    S.frames = 0;
    S.ignored = 0;
    S.lastDrop = null;
    changes.length = 0;
    clearWindow();
  }

  function clearWindow() {
    S.tail = 0;
    S.fill = 0;
    S.sum = 0;
    S.slowCount = 0;
    S.slowRunMs = 0;
    S.stableRunMs = 0;
    S.medianMs = null;
    S.share = null;
    S.settlingMs = O.settleMs;
  }

  /** @param {number} dt */
  function append(dt) {
    if (S.fill === N) evict();
    ring[(S.tail + S.fill) % N] = dt;
    S.fill++;
    S.sum += dt;
    if (dt > slowMs) S.slowCount++;
    // a time-limited window: drop the oldest while the rest still spans windowMs
    while (S.fill > minFill && S.sum - ring[S.tail] >= O.windowMs) evict();
  }

  function evict() {
    const old = ring[S.tail];
    S.tail = (S.tail + 1) % N;
    S.fill--;
    S.sum -= old;
    if (old > slowMs) S.slowCount--;
  }

  function median() {
    for (let i = 0; i < S.fill; i++) scratch[i] = ring[(S.tail + i) % N];
    const view = scratch.subarray(0, S.fill).sort();
    const m = S.fill >> 1;
    return S.fill % 2 ? view[m] : 0.5 * (view[m - 1] + view[m]);
  }

  /** @param {TierId} to @param {'slow' | 'stable'} reason @returns {TierDecision} */
  function change(to, reason) {
    /** @type {TierDecision} */
    const d = { from: S.tier, to, direction: to > S.tier ? 'up' : 'down', reason, atMs: S.clockMs, medianMs: /** @type {number} */ (S.medianMs), slowShare: /** @type {number} */ (S.share) };
    if (d.direction === 'down') {
      // the tier that failed is never entered again
      S.ceiling = to;
      S.lastDrop = { to, medianMs: d.medianMs };
    }
    S.tier = to;
    changes.push(d);
    clearWindow();
    return d;
  }

  init(options);

  return {
    push(frameMs) {
      const dt = typeof frameMs === 'number' ? frameMs : Number.NaN;
      if (!Number.isFinite(dt) || dt <= 0 || dt > O.pauseMs) {
        S.ignored++;
        return null;
      }
      S.clockMs += dt;
      S.frames++;
      if (S.settlingMs > 0) {
        S.settlingMs -= dt;
        return null;
      }
      append(dt);
      // judge only a full window: all its frames, or enough of them to span windowMs
      if (S.fill < N && !(S.fill >= minFill && S.sum >= O.windowMs)) return null;

      const med = median();
      const share = S.slowCount / S.fill;
      S.medianMs = med;
      S.share = share;
      const slow = med > slowMs || share >= O.dropShare;
      const stable = med <= fastMs && share <= O.raiseShare;
      S.slowRunMs = slow ? S.slowRunMs + dt : 0;
      S.stableRunMs = stable ? S.stableRunMs + dt : 0;

      if (slow && S.slowRunMs >= O.dropAfterMs && !S.frozen && S.tier > S.minTier) {
        if (S.lastDrop && S.lastDrop.to === S.tier && med > S.lastDrop.medianMs * (1 - O.minDropGain)) {
          // the last drop bought nothing: stay here
          S.frozen = true;
          return null;
        }
        return change(/** @type {TierId} */ (S.tier - 1), 'slow');
      }
      if (stable && S.stableRunMs >= O.raiseAfterMs && S.tier < S.ceiling) {
        return change(/** @type {TierId} */ (S.tier + 1), 'stable');
      }
      return null;
    },
    get tier() {
      return S.tier;
    },
    get ceiling() {
      return S.ceiling;
    },
    get frozen() {
      return S.frozen;
    },
    snapshot() {
      return {
        tier: S.tier, minTier: S.minTier, ceiling: S.ceiling, frozen: S.frozen, settlingMs: Math.max(0, S.settlingMs),
        clockMs: S.clockMs, frames: S.frames, ignored: S.ignored, windowFill: S.fill,
        medianMs: S.medianMs, slowShare: S.share, slowRunMs: S.slowRunMs, stableRunMs: S.stableRunMs, slowMs, fastMs,
        changes: changes.map((c) => ({ ...c })),
      };
    },
    reset(o = {}) {
      init(o);
    },
  };
}

/**
 * Run a whole trace through a fresh governor (tests, offline tuning).
 * `trace` is an array of frame times, or a function (frameIndex, tier) ->
 * frame time for closed-loop runs where the time depends on the tier.
 * @param {number[] | ((i: number, tier: TierId) => number)} trace
 * @param {{ tier?: number, minTier?: number, maxTier?: number, frames?: number } & Partial<GovernorOptions>} [options]
 * @returns {{ decisions: TierDecision[], tiers: TierId[], governor: Governor }}
 */
export function runGovernor(trace, options = {}) {
  const { frames, ...rest } = options;
  const g = createGovernor(rest);
  const n = typeof trace === 'function' ? Math.max(0, Math.floor(frames ?? 0)) : trace.length;
  /** @type {TierDecision[]} */
  const decisions = [];
  /** @type {TierId[]} */
  const tiers = new Array(n);
  for (let i = 0; i < n; i++) {
    const dt = typeof trace === 'function' ? trace(i, g.tier) : trace[i];
    const d = g.push(dt);
    if (d) decisions.push(d);
    tiers[i] = g.tier;
  }
  return { decisions, tiers, governor: g };
}
