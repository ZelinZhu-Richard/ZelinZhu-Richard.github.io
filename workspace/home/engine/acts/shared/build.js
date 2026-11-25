// What the instrument shows at each point of the story.
//
// The choreography's `build` param counts levels by meaning (BUILD_STAGES in
// engine/choreo/choreography.mjs: 0.06 the main gear, 0.12 the idler, 0.18 the
// pinion, 0.24 the crank, 0.44 base + column + three rings, ...). The
// instrument's setBuild counts windows (engine/instrument/pose.js STAGES:
// wheel 0-0.08, gears 0.08-0.24, base 0.24-0.36, column 0.36-0.46, rings
// 0.46-0.66, arms 0.66-0.83, spheres 0.83-1). The two scales disagree: build
// 0.44 shows no ring at all. instrumentBuild() maps the first onto the second
// so each level shows what BUILD_STAGES says it does, as far as the
// instrument's fixed order allows.
//
// The gears also stagger inside their window (the pinion starts sliding in
// while the idler is at 70 %), so no build value shows "idler meshed, pinion
// absent" (train = 2 in the choreography). overrideTrain() poses the idler
// and the pinion straight from the `train` param instead, with pose.js's own
// slide-in arithmetic. Pure except overrideTrain (which writes the two group
// matrices of a built instrument).

import { buildReveal } from '../../instrument/pose.js';
import { trainLayout, TRAIN, dir } from '../../instrument/layout.js';
import { easeOut, mul, translate, rotY } from '../../instrument/math.js';
import { clamp01 } from './math.js';

/**
 * [choreography level, instrument build]. Between rows the map is linear.
 * 0.44: meridian, horizon and equator in, the ecliptic about to start;
 * 0.5: ecliptic in, colure nearly; 0.6: every ring and the globe; 0.7: the
 * seven arms; 0.8: two spheres (the third at 45 %); 1: all.
 */
export const BUILD_MAP = Object.freeze([
  [0, 0], [0.06, 0.08], [0.24, 0.24], [0.44, 0.548], [0.5, 0.6], [0.6, 0.66], [0.7, 0.83], [0.8, 0.891], [1, 1],
].map((r) => Object.freeze(r)));

/**
 * Instrument build for a choreography build level.
 * @param {number} level
 */
export function instrumentBuild(level) {
  const b = clamp01(level);
  for (let i = 1; i < BUILD_MAP.length; i++) {
    const [x1, y1] = BUILD_MAP[i];
    if (b <= x1) {
      const [x0, y0] = BUILD_MAP[i - 1];
      return y0 + ((b - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 1;
}

/**
 * Per-gear reveal from the `train` param (0 nothing, 1 main gear, 2 + idler,
 * 3 + pinion; the fraction is the next gear sliding in), never behind what the
 * instrument build itself shows.
 * @param {number} train
 * @param {number} build instrument build (setBuild's scale)
 * @returns {{ wheel: number, idler: number, pinion: number }}
 */
export function trainReveal(train, build) {
  const t = Number.isFinite(train) ? train : 0;
  const r = buildReveal(build);
  return {
    wheel: Math.max(clamp01(t), r.wheel ?? 0),
    idler: Math.max(clamp01(t - 1), r.idler ?? 0),
    pinion: Math.max(clamp01(t - 2), r.pinion ?? 0),
  };
}

/**
 * Where the idler and the pinion sit (instrument frame) for a crank angle and
 * their reveals: pose.js's slide-in along the train's own angles.
 * @param {number} crank
 * @param {{ idler: number, pinion: number }} reveal
 */
export function trainCentres(crank, reveal) {
  const T = trainLayout(crank);
  const di = dir(TRAIN.idlerAngle);
  const dp = dir(TRAIN.pinionAngle);
  const ei = easeOut(reveal.idler);
  const ep = easeOut(reveal.pinion);
  return {
    T,
    idler: [T.idler.c[0] + di[0] * 1.1 * (1 - ei), 0, T.idler.c[2] + di[2] * 1.1 * (1 - ei)],
    pinion: [T.pinion.c[0] + dp[0] * 1.1 * (1 - ep), 0, T.pinion.c[2] + dp[2] * 1.1 * (1 - ep)],
  };
}

/** @type {WeakMap<object, { idler: any, pinion: any }>} */
const GROUPS = new WeakMap();

/**
 * Poses the instrument's idler and pinion groups from per-gear reveals (call
 * after the instrument's setters, right before drawing; the lease re-poses it
 * afterwards). No-op before the instrument is built.
 * @param {any} inst
 * @param {number} crank
 * @param {{ idler: number, pinion: number }} reveal
 * @returns {boolean} whether anything was posed
 */
export function overrideTrain(inst, crank, reveal) {
  const root = inst.object3D;
  let g = GROUPS.get(inst);
  if (!g || !g.idler || g.idler.parent !== root || !g.pinion || g.pinion.parent !== root) {
    g = { idler: root.getObjectByName('instrument:idler'), pinion: root.getObjectByName('instrument:pinion') };
    GROUPS.set(inst, g);
  }
  if (!g.idler || !g.pinion) return false;
  const C = trainCentres(crank, reveal);
  pose(g.idler, C.idler, C.T.idler.rot, reveal.idler);
  pose(g.pinion, C.pinion, C.T.pinion.rot, reveal.pinion);
  return true;
}

/** @param {any} obj @param {number[]} c @param {number} rot @param {number} r */
function pose(obj, c, rot, r) {
  obj.matrix.fromArray(mul(translate(c), rotY(rot)));
  obj.matrixWorldNeedsUpdate = true;
  obj.visible = r > 0;
}
