// The instrument's pose as a pure function of its parameters: which parts
// are built and how far, where every moving group sits (gears, celestial
// rings, arms with their bones, spheres), the contact shell. The three.js
// side copies these matrices onto its objects; tests read them directly.
//
// state = { crank, arms, build, contact, hover: number[7], front }
//   crank    radians, the pinion's angle
//   arms     0 retracted (desk) .. 1 extended (ending layout)
//   build    0..1, parts appear in STAGE_ORDER
//   contact  0..1, the rings close into a sealed sphere, the arms fold
//   hover    per-arm hover weight 0..1 (the arm swings toward the viewer)
//   front    azimuth (radians, dir() convention) toward the viewer, in the
//            instrument's frame; -pi/2 is +z

import {
  DEG, identity, mul, chain, translate, scaleAbout, rotY, rotateAbout, compose, fromQuat, quatFromTo, quatEuler,
  quatMul, quatAxis, apply, rotateVec, clamp01, lerp, smoothstep, easeInOut, easeOut, easeOutBack, lerpAngle, wrapPi,
} from './math.js';
import {
  ARMS, FINAL_ANGLES, FINAL_VIEWS, RATIO, ROD_START, HOOP, RETRACT_SCALE, ARMILLARY, COLUMN, TRAIN, STONES,
  trainLayout, dir, polarAxis, eastAxis,
} from './layout.js';

// ------------------------------------------------------------ build order ---

export const STAGE_ORDER = Object.freeze(['wheel', 'gears', 'base', 'column', 'rings', 'arms', 'spheres']);

/** Windows of the build parameter, one per stage, in order. */
export const STAGES = Object.freeze([
  { id: 'wheel', from: 0.0, to: 0.08, parts: ['wheel'] },
  { id: 'gears', from: 0.08, to: 0.24, parts: ['idler', 'pinion'] },
  { id: 'base', from: 0.24, to: 0.36, parts: ['base'] },
  { id: 'column', from: 0.36, to: 0.46, parts: ['column'] },
  { id: 'rings', from: 0.46, to: 0.66, parts: ['meridian', 'horizon', 'equator', 'ecliptic', 'colure', 'globe'] },
  { id: 'arms', from: 0.66, to: 0.83, parts: STONES.map((s) => 'arm:' + s) },
  { id: 'spheres', from: 0.83, to: 1.0, parts: STONES.map((s) => 'sphere:' + s) },
]);

/** Local progress of item k of n inside a window, items overlapping by `overlap`. */
function stagger(t, k, n, overlap) {
  if (t >= 1) return 1;
  if (n <= 1) return clamp01(t);
  const span = 1 / (n - (n - 1) * overlap);
  const start = k * span * (1 - overlap);
  return clamp01((t - start) / span);
}

/**
 * Reveal of every part (0 absent .. 1 in place) at build b.
 * @param {number} b
 * @returns {Record<string, number>} keyed by part id ('wheel', 'arm:about', ...)
 */
export function buildReveal(b) {
  const x = clamp01(Number.isFinite(b) ? b : 0);
  const out = {};
  for (const S of STAGES) {
    const t = clamp01((x - S.from) / (S.to - S.from));
    const overlap = S.id === 'gears' ? 0.3 : 0.45;
    S.parts.forEach((p, k) => {
      out[p] = stagger(t, k, S.parts.length, overlap);
    });
  }
  return out;
}

// -------------------------------------------------------------------- arms ---

/** Fold fan (offsets from straight behind), site order. */
const FOLD = [-38, -24, 12, -12, 0, 24, 38].map((a) => a * DEG);

/** Precomputed per-arm tilts (the engraving's axis) and constants. */
export function sphereTilts(rngFor, seed = 7) {
  return STONES.map((id) => {
    const r = rngFor(seed, 'instrument:tilt:' + id);
    const ex = -0.5 + r();
    const ey = r() * Math.PI * 2;
    const ez = -0.45 + 0.9 * r();
    return quatEuler(ex, ey, ez);
  });
}

/**
 * One arm's pose in the instrument frame.
 * @returns {{ id: string, angle: number, L: number, centre: number[], r: number, hoopR: number,
 *   bones: Float64Array[], group: Float64Array, sphere: Float64Array, visible: boolean, sphereVisible: boolean, hoopYaw: number }}
 */
export function armPose(i, state, tilt = [0, 0, 0, 1]) {
  const A = ARMS[i];
  const crank = state.crank || 0;
  const contact = clamp01(state.contact || 0);
  const kFold = smoothstep(0.1, 0.8, contact);
  const e = clamp01(state.arms || 0) * (1 - 0.35 * kFold);
  const E = easeInOut(e);
  const reveal = state.reveal || buildReveal(state.build ?? 1);
  const a = reveal['arm:' + A.id] ?? 1;
  const sr = reveal['sphere:' + A.id] ?? 1;
  const front = state.front ?? -Math.PI / 2;
  const hw = clamp01((state.hover && state.hover[i]) || 0) * (1 - contact);
  const vp = state.viewport === 'port' ? 'port' : 'land';
  const V = FINAL_VIEWS[vp];

  // angle: retracted carousel (all arms turn together) -> ending layout,
  // the short way round from the carousel's rest angle
  const rA0 = A.rAngle * DEG;
  const fin = rA0 + wrapPi(FINAL_ANGLES[vp][i] - rA0);
  let angle = lerp(rA0 + RATIO.arms * crank, fin, E);
  angle = lerpAngle(angle, front + V.hover * DEG, hw);
  angle = lerpAngle(angle, front + Math.PI + FOLD[i], kFold);

  // extension
  const Le = lerp(A.Lr, A.L, E);
  const stemE = lerp(A.stemR, A.stem, E);
  const rE = lerp(A.r * RETRACT_SCALE, A.r, E);
  const rodK = easeOut(clamp01(a * 1.6));
  const stemK = easeOut(clamp01(a * 1.6 - 0.6));
  const r0 = ROD_START;
  const Leff = r0 + (Le - r0) * rodK;
  const rodLenF = A.L - r0 - 0.04;
  const kx = Math.max((Leff - 0.04 - r0) / rodLenF, 1e-3);
  const stemLenF = A.stem - 0.05;
  const stemLen = Math.max((stemE - 0.05) * stemK, 0.001);
  const pivotY = A.h + 0.048 + stemLen + 0.002;
  const dx = Leff - A.L;
  const dy = pivotY - (A.h + A.stem);
  const s = Math.max((rE / A.r) * easeOutBack(sr), 1e-4);
  const hoopRF = A.r * HOOP.scale;

  // the hoop faces 128 deg off the arm, or the viewer when hovered
  const hoopYaw = lerpAngle(angle + HOOP.yaw, front + V.hoop * DEG, hw);
  const psi = hoopYaw - angle;

  const Pb = [A.L, A.h + A.stem, 0];
  const bones = [
    identity(),
    scaleAbout([r0, A.h, 0], [kx, 1, 1]),
    translate([dx, 0, 0]),
    mul(translate([dx, 0, 0]), scaleAbout([A.L, A.h + 0.048, 0], [1, stemLen / stemLenF, 1])),
    translate([dx, dy, 0]),
    chain(translate([dx, dy, 0]), translate(Pb), rotY(psi), scaleAbout([0, 0, 0], s), translate([-Pb[0], -Pb[1], -Pb[2]])),
  ];
  const group = rotY(angle);
  const cLocal = [Leff, pivotY + s * hoopRF, 0];
  const spin = (RATIO.spin[i] || 0) * crank;
  const q = quatMul(tilt, quatAxis([0, 1, 0], spin));
  const sphere = mul(group, compose(cLocal, q, s * A.r));
  return {
    id: A.id, angle, L: Leff, centre: apply(group, cLocal), r: s * A.r, hoopR: s * hoopRF,
    bones, group, sphere, visible: a > 0, sphereVisible: sr > 0, hoopYaw, hover: hw,
  };
}

// --------------------------------------------------------------- armillary ---

/** Ring normals at celestial angle tau (instrument frame). */
export function ringNormals(tau) {
  const P = polarAxis();
  const east = eastAxis();
  const A = ARMILLARY;
  const eclN = rotateVec(rotateVec(P, east, A.obliquity), P, tau);
  const colN = rotateVec(east, P, tau + A.colurePhase);
  return { meridian: east, equator: P, ecliptic: eclN, colure: colN, P };
}

/** Celestial angle for a crank angle. */
export const celestialAngle = (crank) => RATIO.celestial * (crank || 0);

// -------------------------------------------------------------- full pose ---

/**
 * Matrices (instrument frame, column-major) for every group, reveals, and
 * the seven arms. Groups whose geometry is authored at rest in the
 * instrument frame use these directly as their object matrix.
 */
export function instrumentPose(state, tilts = null) {
  const crank = state.crank || 0;
  const reveal = buildReveal(state.build ?? 1);
  const T = trainLayout(crank);
  const contact = clamp01(state.contact || 0);
  const tau = celestialAngle(crank);
  const C = ARMILLARY.c;
  const P = polarAxis();
  const g = {};

  // gears: each slides or drops into place as it is earned
  const ew = easeOut(reveal.wheel);
  g.wheel = mul(translate([0, 0.3 * (1 - ew), 0]), rotY(T.main.rot));
  g.rule = translate([0, 0.3 * (1 - ew), 0]);
  const ei = easeOut(reveal.idler);
  const di = dir(TRAIN.idlerAngle);
  g.idler = chain(translate([T.idler.c[0] + di[0] * 1.1 * (1 - ei), 0, T.idler.c[2] + di[2] * 1.1 * (1 - ei)]), rotY(T.idler.rot));
  const ep = easeOut(reveal.pinion);
  const dp = dir(TRAIN.pinionAngle);
  g.pinion = chain(translate([T.pinion.c[0] + dp[0] * 1.1 * (1 - ep), 0, T.pinion.c[2] + dp[2] * 1.1 * (1 - ep)]), rotY(T.pinion.rot));
  // the base rises from below to meet the train
  const eb = easeInOut(reveal.base);
  g.base = translate([0, -1.6 * (1 - eb), 0]);
  // the column grows up from the dial
  const ec = Math.max(easeInOut(reveal.column), 1e-3);
  g.column = scaleAbout([0, COLUMN.bottom, 0], [1, ec, 1]);

  // the armillary: each ring opens out of its mount
  const sm = Math.max(easeOut(reveal.meridian), 1e-3);
  g.meridian = scaleAbout([0, COLUMN.top, 0], sm);
  const sh = Math.max(easeOut(reveal.horizon), 1e-3);
  g.horizon = scaleAbout([0, ARMILLARY.spider.y, 0], sh);
  // contact: the inner rings swell to the shell's radius and protrude as seams
  const kRing = smoothstep(0, 0.45, contact);
  const seamR = ARMILLARY.sealedR + 0.035;
  const ringGrow = (k) => 1 + kRing * (seamR / ARMILLARY.rings[k].R - 1);
  const se = Math.max(easeOut(reveal.equator), 1e-3) * ringGrow(1);
  g.equator = scaleAbout(C, se);
  const cel = rotateAbout(C, P, tau);
  g.celestial = cel;
  const sl = Math.max(easeOut(reveal.ecliptic), 1e-3) * ringGrow(2);
  g.ecliptic = mul(cel, scaleAbout(C, sl));
  const sc = Math.max(easeOut(reveal.colure), 1e-3) * ringGrow(3);
  g.colure = mul(cel, scaleAbout(C, sc));
  const sg = Math.max(easeOutBack(reveal.globe), 1e-3);
  g.globe = mul(cel, scaleAbout(C, sg));

  // the sealed shell
  const kShell = smoothstep(0.35, 1.0, contact);
  const beta = lerp(0.025, Math.PI / 2 + 0.02, kShell);
  const N = ringNormals(tau);
  g.shell = compose(C, null, ARMILLARY.sealedR);

  const arms = ARMS.map((_, i) => armPose(i, { ...state, reveal }, tilts ? tilts[i] : undefined));

  return {
    reveal, train: T, tau, groups: g, arms,
    shell: { visible: kShell > 0, sinBeta: Math.sin(Math.min(beta, Math.PI / 2)), full: beta >= Math.PI / 2, normals: [N.equator, N.ecliptic, N.colure], k: kShell },
    contact,
  };
}

/** Sphere centre (instrument frame) of a stone. */
export function stoneCentre(id, state, tilts = null) {
  const i = STONES.indexOf(id);
  if (i < 0) throw new TypeError(`unknown stone "${id}"`);
  return armPose(i, state, tilts ? tilts[i] : undefined).centre;
}

export { fromQuat, quatFromTo };
