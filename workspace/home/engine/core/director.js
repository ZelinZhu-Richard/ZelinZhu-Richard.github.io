// The stage's frame planning, kept pure so node can test it: where story time should be,
// which acts are on or near screen, how two acts' film-finish wishes blend through a
// transition, where the text's quiet zones fall in CSS pixels, when the crank passes a
// tooth, and when the stones' screen report has changed. Imports only the pure timeline
// and choreography modules (no three, no DOM, no clock).

import { SECTIONS, U_MAX, beatOpacity, progressToU } from '../timeline/schedule.js';
import { BEATS, CONTACT_U, TRANSITIONS } from '../choreo/choreography.mjs';

/** The displayed story time follows the scroll on a critically damped spring. */
export const SPRING = Object.freeze({
  /** rad/s: settles to 1 % in about 0.37 s (the app already eases scroll by 220 ms). */
  omega: 18,
  /** Jumps longer than this (section units) snap instead of flying through every act. */
  snap: 2,
  /** At rest within this many section units. */
  rest: 2e-4,
});

/** The pinion's tooth count: one tick per tooth as the crank turns (layout.js GEAR.pinion.z). */
export const PINION_TEETH = 12;

/** The finish shared by every act that asks for nothing else (engine/post FINISH_DEFAULTS). */
const FALLBACK_FINISH = Object.freeze({
  glow: Object.freeze({ strength: 1, threshold: 0.85, weights: Object.freeze([0.3, 0.24, 0.18]) }),
  rolloff: Object.freeze({ knee: 1, white: 0.35 }),
  veil: Object.freeze([0, 0, 0]),
  vignette: 0.2,
  grain: 0.018,
});

/**
 * Per transition kind, the composer's parameters. The lift keeps the two images registered
 * (the plate and gears cameras fly the same keys over the window), so the plate image does
 * not travel: the gears world is uncovered from the bottom behind a soft edge. The dissolve
 * (room -> space, engine/post DissolveParams) is an iris on the instrument: the stage adds
 * its centre and radius every frame; its phases are fractions of the window's eased t (the
 * choreography's 17.2 -> 18): the corners go dark from about 17.3, the walls are black by
 * 17.65, stars rise out of the black from about 17.57 (rise), and the window's sky and the
 * brass hand straight over to space by about 17.83 (close).
 */
export const TRANSITION_PARAMS = Object.freeze({
  cut: Object.freeze({}),
  fade: Object.freeze({}),
  lift: Object.freeze({ dir: 1, travel: 0, feather: 0.55 }),
  reveal: Object.freeze({}),
  dissolve: Object.freeze({ feather: 0.2, lead: 0.4, lag: 0.25, close: 0.9, rise: Object.freeze([0.4, 0.84]), lum: Object.freeze([0.004, 0.12]), stretch: 0.8 }),
});

/** Quiet-zone dimming under text (post.finish quietZones.strength at full beat opacity). */
export const QUIET_STRENGTH = 0.62;

/**
 * Story time the stage should show: contact mode holds CONTACT_U; the story follows p.
 * @param {'story' | 'contact'} mode
 * @param {number} progress 0..1
 */
export function targetU(mode, progress) {
  return mode === 'contact' ? CONTACT_U : progressToU(progress);
}

/**
 * Where each act is on the story line [u0, u1): from its first section (or the start of the
 * transition that brings it in) to the end of its last section.
 * @returns {Record<string, [number, number]>}
 */
export function actSpans() {
  /** @type {Record<string, [number, number]>} */
  const spans = {};
  SECTIONS.forEach((s, i) => {
    const span = spans[s.act];
    if (!span) spans[s.act] = [i, i + 1];
    else span[1] = i + 1;
  });
  for (const tr of TRANSITIONS) {
    const span = spans[tr.to];
    if (span) span[0] = Math.min(span[0], tr.u[0]);
  }
  return spans;
}

const SPANS = actSpans();

/**
 * Acts in order of their distance (section units) from u; 0 for every act on screen at u.
 * @param {number} u
 * @returns {{ id: string, dist: number }[]}
 */
export function actsByDistance(u) {
  const v = Number.isFinite(u) ? Math.min(U_MAX, Math.max(0, u)) : 0;
  return Object.entries(SPANS)
    // spans are half-open except the last, which holds u = U_MAX (the coda's end)
    .map(([id, [a, b]]) => ({ id, dist: v < a ? a - v : v < b || (b >= U_MAX && v <= b) ? 0 : Math.max(v - b, 1e-9) }))
    .sort((x, y) => x.dist - y.dist || SPANS[x.id][0] - SPANS[y.id][0]);
}

/**
 * NDC rectangle [x0, y0, x1, y1] (y up) to CSS px [left, top, right, bottom] (y down).
 * @param {ArrayLike<number>} r
 * @param {number} w CSS width
 * @param {number} h CSS height
 * @returns {[number, number, number, number]}
 */
export function ndcToCss(r, w, h) {
  const x0 = Math.min(r[0], r[2]);
  const x1 = Math.max(r[0], r[2]);
  const y0 = Math.min(r[1], r[3]);
  const y1 = Math.max(r[1], r[3]);
  return [((x0 + 1) / 2) * w, ((1 - y1) / 2) * h, ((x1 + 1) / 2) * w, ((1 - y0) / 2) * h];
}

/** C1 smoothstep. @param {number} a @param {number} b @param {number} x */
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Where the text sits at u, as NDC rects with how strongly to keep them quiet: the beat in
 * view (faded with it), and the coda's own zone (`coda`, NDC per viewport) from u 19 on.
 * @param {number} u
 * @param {number} beat frame.beat
 * @param {'land' | 'port'} viewport
 * @param {Record<'land' | 'port', ArrayLike<number>> | null} [coda]
 * @returns {{ ndc: ArrayLike<number>, k: number } | null}
 */
export function quietAt(u, beat, viewport, coda = null) {
  if (beat >= 0 && BEATS[beat]) {
    const k = beatOpacity(u);
    return k > 0 ? { ndc: BEATS[beat].quiet[viewport], k } : null;
  }
  if (coda && u >= 19) {
    const k = smoothstep(19, 19.3, u);
    return k > 0 ? { ndc: coda[viewport], k } : null;
  }
  return null;
}

/** @param {number} a @param {number} b @param {number} t */
const mixN = (a, b, t) => a + (b - a) * t;
/** @param {unknown} v @param {number} d */
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * One act's finish wishes, completed with the defaults.
 * @param {any} h hints (finishHints() or act.finish), may be partial or missing
 * @param {any} [defaults]
 */
export function completeFinish(h, defaults = FALLBACK_FINISH) {
  const D = defaults || FALLBACK_FINISH;
  const o = h || {};
  const g = typeof o.glow === 'number' ? { strength: o.glow } : o.glow || {};
  const Dg = D.glow || FALLBACK_FINISH.glow;
  const weights = Array.isArray(g.weights) ? g.weights : Dg.weights;
  const ro = o.rolloff || {};
  const Dr = D.rolloff || FALLBACK_FINISH.rolloff;
  const veil = Array.isArray(o.veil) ? o.veil : D.veil || FALLBACK_FINISH.veil;
  return {
    glow: { strength: num(g.strength, Dg.strength), threshold: num(g.threshold, Dg.threshold), weights: [num(weights[0], 0), num(weights[1], 0), num(weights[2], 0)] },
    rolloff: { knee: num(ro.knee, Dr.knee), white: num(ro.white, Dr.white) },
    veil: [num(veil[0], 0), num(veil[1], 0), num(veil[2], 0)],
    vignette: num(o.vignette, num(D.vignette, FALLBACK_FINISH.vignette)),
    grain: num(o.grain, num(D.grain, FALLBACK_FINISH.grain)),
  };
}

/**
 * The film finish for a frame: act a's wishes, blended toward act b's by t through a
 * transition, so no setting pops at the hand-over.
 * @param {any} a
 * @param {any} b null outside a transition
 * @param {number} t 0..1
 * @param {any} [defaults] engine/post FINISH_DEFAULTS
 */
export function mixFinish(a, b, t, defaults) {
  const A = completeFinish(a, defaults);
  if (!b || !(t > 0)) return A;
  const B = completeFinish(b, defaults);
  const k = Math.min(1, t);
  return {
    glow: {
      strength: mixN(A.glow.strength, B.glow.strength, k),
      threshold: mixN(A.glow.threshold, B.glow.threshold, k),
      weights: A.glow.weights.map((w, i) => mixN(w, B.glow.weights[i], k)),
    },
    rolloff: { knee: mixN(A.rolloff.knee, B.rolloff.knee, k), white: mixN(A.rolloff.white, B.rolloff.white, k) },
    veil: A.veil.map((v, i) => mixN(v, B.veil[i], k)),
    vignette: mixN(A.vignette, B.vignette, k),
    grain: mixN(A.grain, B.grain, k),
  };
}

/**
 * Which tooth of the pinion faces the start at this crank angle (one tick per change).
 * @param {number} crank radians
 * @param {number} [teeth]
 */
export function toothIndex(crank, teeth = PINION_TEETH) {
  return Number.isFinite(crank) ? Math.floor((crank * teeth) / (2 * Math.PI)) : 0;
}

/**
 * Has the stones' screen report changed enough to tell the page (positions by more than
 * `tol` CSS px, any radius by more than tol, or any visibility)?
 * @param {{ id: string, x: number, y: number, radius: number, visible: boolean }[] | null} prev
 * @param {{ id: string, x: number, y: number, radius: number, visible: boolean }[]} next
 * @param {number} [tol]
 */
export function stonesChanged(prev, next, tol = 0.25) {
  if (!prev || prev.length !== next.length) return true;
  for (let i = 0; i < next.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (a.id !== b.id || a.visible !== b.visible) return true;
    if (Math.abs(a.x - b.x) > tol || Math.abs(a.y - b.y) > tol || Math.abs(a.radius - b.radius) > tol) return true;
  }
  return false;
}
