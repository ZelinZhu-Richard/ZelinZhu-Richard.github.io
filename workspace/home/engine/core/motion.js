// Motion helpers for the stage: a critically damped spring for the displayed story time,
// and a tiny tweener with the slice of gsap's API the instrument uses for its hover swing
// (to, killTweensOf), ticked by the stage's own frame clock. Driving the hover from the
// frame clock keeps it in step with what is drawn, lets the stage know when a tween still
// needs frames, and keeps gsap out of the engine's chunk. Pure: no imports, no clock.

/**
 * @typedef {{ x: number, v: number }} Spring  position and velocity
 */

/**
 * Advances a critically damped spring toward `target` by `dt` seconds, exactly (the
 * closed form, so it is stable for any dt and never overshoots from rest).
 * @param {Spring} s state, updated in place
 * @param {number} target
 * @param {number} dt seconds
 * @param {number} omega natural frequency, rad/s (settles to 1 % in about 6.6 / omega)
 * @returns {Spring}
 */
export function springStep(s, target, dt, omega) {
  if (!(dt > 0) || !(omega > 0)) return s;
  const x0 = s.x - target;
  const k = s.v + omega * x0;
  const e = Math.exp(-omega * dt);
  s.x = target + (x0 + k * dt) * e;
  s.v = (s.v - omega * k * dt) * e;
  return s;
}

/**
 * Is the spring at rest on `target` (both its offset and its speed below `eps`)?
 * @param {Spring} s
 * @param {number} target
 * @param {number} [eps]
 */
export function springAtRest(s, target, eps = 1e-4) {
  return Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 10;
}

/** @param {number} t */
const clamp01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/** Easing curves by gsap name (the ones the engine uses), on [0, 1]. */
export const EASES = Object.freeze({
  none: (/** @type {number} */ t) => t,
  linear: (/** @type {number} */ t) => t,
  'power1.inOut': (/** @type {number} */ t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  'power2.inOut': (/** @type {number} */ t) => (t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) ** 3),
  'power2.out': (/** @type {number} */ t) => 1 - (1 - t) ** 3,
  'power2.in': (/** @type {number} */ t) => t * t * t,
  'sine.inOut': (/** @type {number} */ t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
});

/** Smoothstep, C1 on [0, 1]. @param {number} t */
export const smooth01 = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

const RESERVED = new Set(['duration', 'ease', 'delay', 'onUpdate', 'onComplete', 'overwrite']);

/**
 * A tweener: `to(target, { key: value, duration, ease, onUpdate, onComplete })` tweens the
 * numeric keys of `target` from their current values; `killTweensOf(target)` stops every
 * tween on it; `update(dt)` advances them all (seconds). A duration of 0 sets the values at
 * once. gsap-compatible for these calls, so it can be handed to the instrument as `gsap`.
 */
export function createTweener() {
  /** @type {{ target: any, keys: string[], from: number[], to: number[], duration: number, delay: number, t: number, ease: (t: number) => number, onUpdate?: () => void, onComplete?: () => void }[]} */
  let list = [];

  /** @param {any} tw @param {number} k */
  function apply(tw, k) {
    const e = tw.ease(clamp01(k));
    for (let i = 0; i < tw.keys.length; i++) tw.target[tw.keys[i]] = tw.from[i] + (tw.to[i] - tw.from[i]) * e;
    tw.onUpdate?.();
  }

  const api = {
    /**
     * @param {any} target
     * @param {Record<string, any>} vars
     */
    to(target, vars = {}) {
      const keys = Object.keys(vars).filter((k) => !RESERVED.has(k) && typeof vars[k] === 'number');
      const duration = Math.max(0, Number(vars.duration ?? 0.5) || 0);
      const ease = typeof vars.ease === 'function' ? vars.ease : EASES[/** @type {keyof typeof EASES} */ (vars.ease)] || EASES['power1.inOut'];
      const tw = {
        target, keys, from: keys.map((k) => Number(target[k]) || 0), to: keys.map((k) => vars[k]),
        duration, delay: Math.max(0, Number(vars.delay) || 0), t: 0, ease, onUpdate: vars.onUpdate, onComplete: vars.onComplete,
      };
      if (duration === 0 && tw.delay === 0) {
        apply(tw, 1);
        tw.onComplete?.();
        return tw;
      }
      list.push(tw);
      return tw;
    },
    /** @param {any} target */
    killTweensOf(target) {
      if (list.length) list = list.filter((tw) => tw.target !== target);
    },
    /**
     * Advances every tween by dt seconds.
     * @param {number} dt
     */
    update(dt) {
      if (!list.length || !(dt > 0)) return;
      const done = [];
      for (const tw of list.slice()) {
        tw.t += dt;
        const local = tw.t - tw.delay;
        if (local < 0) continue;
        // a zero-duration tween with a delay lands when the delay ends (0 / 0 would be NaN)
        const k = tw.duration > 0 ? local / tw.duration : 1;
        apply(tw, k);
        if (k >= 1) done.push(tw);
      }
      if (done.length) {
        list = list.filter((tw) => !done.includes(tw));
        for (const tw of done) tw.onComplete?.();
      }
    },
    /** Snaps every tween to its end (still frames, reduced motion). */
    finish() {
      const all = list;
      list = [];
      for (const tw of all) {
        apply(tw, 1);
        tw.onComplete?.();
      }
    },
    /** Is any tween still running? */
    get active() {
      return list.length > 0;
    },
  };
  return api;
}
