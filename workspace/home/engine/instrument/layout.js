// Dimensions of the instrument and the arithmetic that places its parts.
// Pure data and math (no three.js), so node tests and every act can use the
// same numbers the meshes are built from.
//
// Authored at unit scale: one unit is about 8 cm on the real object, so the
// finished instrument stands about 6.2 units (50 cm) from its feet to the top
// of the meridian ring. The act that draws it places and scales it.
//
// Axes: Y up. World angles: dir(a) = (cos a, 0, -sin a), counter-clockwise
// seen from above. Drawing / plan coordinates (x, y) map to (x, h, -y).

import { DEG } from './math.js';

export { DEG };
export const dir = (a) => [Math.cos(a), 0, -Math.sin(a)];
export const plan = (p, h) => [p[0], h, -p[1]];

/** The site's seven stones, in order. One sphere on one arm each. */
export const STONES = Object.freeze(['about', 'projects', 'research', 'art', 'fun', 'blog', 'daily']);

export const GROUND_Y = -0.62; // underside of the feet

// A turned plinth on four knurled feet with an engraved dial plate on top;
// the dial has a recess (rete.js) that holds the gear train, whose floor is
// the plinth's top face at y = 0.
export const BASE = { top: 0, bottom: -0.52, radius: 2.62, dialTop: 0.06, dialR: 2.44 };
export const FEET = { n: 4, r: 2.44, phase: 45 * DEG, radius: 0.15 };
export const DIAL = {
  ring: { r0: 2.35, major: 2.362, mid: 2.385, minor: 2.405, edge: 2.43 },
  numerals: { r: 2.288, h: 0.07, every: 30 },
  screws: { n: 6, r: 2.135, phase: 5 * DEG, head: 0.042 },
  guilloche: { r0: 1.34, r1: 2.0, n: 7, lobes: 72, amp: 0.012 },
  label: { angle: -116 * DEG, r: 1.73, w: 0.62, h: 0.17 },
};

// Involute spur gears of one module, 48 : 24 : 12 teeth, so the train turns
// 1 : 2 : 4 (pinion, on the crank, fastest).
export const GEAR = {
  module: 0.045,
  y0: 0.02, // underside of the gear plane
  main: { z: 48, thick: 0.07 },
  idler: { z: 24, thick: 0.07 },
  pinion: { z: 12, thick: 0.09 },
};

export const TRAIN = {
  idlerAngle: -40 * DEG, // world angle main -> idler
  pinionAngle: 66 * DEG, // world angle idler -> pinion
};

/** The rule (alidade) across the astrolabe face: fixed, in plan angle. */
export const ALIDADE_ANGLE = -28 * DEG;

export const CRANK = { arm: 0.55, armY: 0.44 };

const pitchAngle = (z) => (2 * Math.PI) / z;
const fract = (x) => x - Math.floor(x);

/**
 * Rotation of gear B so that its gaps receive gear A's teeth. gammaAB is the
 * world angle from A's centre to B's. Gear outlines have tooth 0 on angle 0.
 */
export function meshNext(thetaA, zA, gammaAB, zB) {
  const fA = fract((gammaAB - thetaA) / pitchAngle(zA));
  return gammaAB + Math.PI + (fA - 0.5) * pitchAngle(zB);
}

export const pitchRadius = (z) => (z * GEAR.module) / 2;

/** Positions and rotations of the train for crank angle c (the pinion turns with the crank). */
export function trainLayout(c) {
  const m = GEAR.module;
  const dMI = ((GEAR.main.z + GEAR.idler.z) * m) / 2;
  const dIP = ((GEAR.idler.z + GEAR.pinion.z) * m) / 2;
  const di = dir(TRAIN.idlerAngle);
  const idler = [di[0] * dMI, 0, di[2] * dMI];
  const dp = dir(TRAIN.pinionAngle);
  const pinion = [idler[0] + dp[0] * dIP, 0, idler[2] + dp[2] * dIP];
  const thP = c;
  const thI = meshNext(thP, GEAR.pinion.z, TRAIN.pinionAngle + Math.PI, GEAR.idler.z);
  const thM = meshNext(thI, GEAR.idler.z, TRAIN.idlerAngle + Math.PI, GEAR.main.z);
  const dc = dir(c);
  const handle = [pinion[0] + dc[0] * CRANK.arm, 0, pinion[2] + dc[2] * CRANK.arm];
  return {
    main: { c: [0, 0, 0], rot: thM },
    idler: { c: idler, rot: thI },
    pinion: { c: pinion, rot: thP },
    crank: c,
    handle,
  };
}

/**
 * Turning ratios against the crank. The gears are exact (above). Everything
 * above the dial turns slower: the celestial rings and globe about the polar
 * axis, the retracted arms round the column, each sphere about its own axis.
 */
export const RATIO = {
  main: GEAR.pinion.z / GEAR.main.z, // 1/4, same sense as the crank
  celestial: 1 / 16,
  arms: 1 / 24,
  spin: [1 / 6, -1 / 7, 1 / 8, -1 / 6.5, 1 / 7.5, -1 / 9, 1 / 5.5],
};

// The seven arms in site order. Each rides its own collar on the column
// (longer arms lower). `L`, `stem`, `r` are the ending layout (arms = 1);
// `Lr`, `stemR` the retracted desk layout (arms = 0), where the spheres are
// RETRACT_SCALE of their size and stand in a spiral stair round the column.
// `angle` is the ending angle, `rAngle` the retracted one (degrees).
export const ARMS = [
  { id: 'about', label: 'About', L: 4.85, h: 0.95, r: 0.36, stem: 0.85, pattern: 'rings', Lr: 1.45, stemR: 0.16, rAngle: 225 },
  { id: 'projects', label: 'Projects', L: 2.3, h: 2.3, r: 0.32, stem: 0.4, pattern: 'grid', Lr: 1.2, stemR: 0.08, rAngle: 140 },
  { id: 'research', label: 'Research', L: 2.9, h: 1.85, r: 0.4, stem: 0.55, pattern: 'contour', Lr: 1.3, stemR: 0.12, rAngle: 315 },
  { id: 'art', label: 'Art', L: 3.35, h: 1.625, r: 0.34, stem: 1.15, pattern: 'stipple', Lr: 1.35, stemR: 0.2, rAngle: 175 },
  { id: 'fun', label: 'Fun', L: 3.8, h: 1.4, r: 0.3, stem: 0.45, pattern: 'spiral', Lr: 1.4, stemR: 0.1, rAngle: 270 },
  { id: 'blog', label: 'Blog', L: 4.3, h: 1.175, r: 0.37, stem: 0.8, pattern: 'hatch', Lr: 1.45, stemR: 0.14, rAngle: 345 },
  { id: 'daily', label: 'Daily', L: 2.6, h: 2.075, r: 0.32, stem: 0.95, pattern: 'dot', Lr: 1.25, stemR: 0.1, rAngle: 40 },
];
export const RETRACT_SCALE = 0.4;

/**
 * Ending arm angles (radians), one layout per viewport ('land' for wide
 * windows, 'port' for tall ones), each kept near the approved sketch frames
 * and checked against its FINAL_VIEWS camera by tests/instrument.test.mjs:
 * every sphere in frame and clear of the others, the armillary and the
 * column, with the camera turned up to 8 deg and tipped up to 5 deg.
 */
export const FINAL_ANGLES = {
  land: [196, 168, 305, 190, 246, 15, 28].map((a) => a * DEG),
  port: [289, 165, 268, 295, 250, 62, 33].map((a) => a * DEG),
};

/**
 * The cameras the ending layouts are checked from (orbit target, azimuth and
 * elevation in degrees, distance in instrument units, vertical fov, shift of
 * the target on screen as fractions, +x right, +y down), the viewport they
 * are judged at, and where a hovered arm swings (`hover`: offset from the
 * viewer's azimuth; `hoop`: the hoop's facing, both degrees). The space act
 * frames the ending from these.
 */
export const FINAL_VIEWS = {
  land: { target: [0, 2.4, 0], az: -90, el: 15, dist: 16.3, fov: 30, shift: [0.09, -0.035], size: [1440, 900], hover: 24, hoop: -8 },
  port: { target: [0, 1.9, 0], az: -90, el: 60, dist: 17, fov: 46, shift: [0, 0.12], size: [390, 844], hover: 12, hoop: -15 },
};
export const VIEWPORTS = Object.freeze(['land', 'port']);

// Arm hardware (radii): rods taper out from the collar; the stem rises from
// the knuckle to the pivot cup under the hoop.
export const ROD = { root: 0.042, tip: 0.032, stem: [0.03, 0.024], knuckle: 0.062, collar: [0.15, 0.172] };
export const ROD_START = ROD.collar[1] + 0.07;

export const PATTERN_ID = { rings: 0, spiral: 1, stipple: 2, contour: 3, hatch: 4, grid: 5, dot: 6 };

export const HOOP = { scale: 1.24, width: 0.034, thick: 0.018, yaw: 128 * DEG };

export const COLUMN = { r: 0.11, top: 2.45, bottom: 0.125 };

// The armillary on the column: the meridian ring stands in a fork on the
// column top, the graduated horizon ring rests on four bowed posts that
// spring from a spider under the fork, the polar axis is elevated by the
// latitude. The equator is fixed to the meridian by two studs; the colure,
// the ecliptic, the axis and the small globe turn together about the axis.
export const ARMILLARY = {
  c: [0, 2.45 + 1.5, 0],
  latitude: 35.9 * DEG,
  north: 128 * DEG, // world azimuth of the polar axis
  rings: [
    { kind: 'meridian', R: 1.5, w: 0.1 },
    { kind: 'equator', R: 1.345, w: 0.088 },
    { kind: 'ecliptic', R: 1.19, w: 0.082 },
    { kind: 'colure', R: 1.04, w: 0.076 },
  ],
  thick: 0.03,
  horizon: { r0: 1.525, r1: 1.74, thick: 0.034 },
  spider: { y: 2.39, r: 0.3 },
  posts: { n: 4, r: 0.028 },
  obliquity: 23.44 * DEG,
  colurePhase: 50 * DEG,
  sealedR: 1.37,
  globeR: 0.3,
  beadR: 0.09,
  axisHalf: 1.74,
};

export function polarAxis() {
  const A = ARMILLARY;
  const n = dir(A.north);
  const cl = Math.cos(A.latitude);
  const sl = Math.sin(A.latitude);
  const P = [n[0] * cl, sl, n[2] * cl];
  const l = Math.hypot(P[0], P[1], P[2]);
  return [P[0] / l, P[1] / l, P[2] / l];
}

/** The horizontal direction in the meridian ring's plane at right angles to north, i.e. its normal. */
export const eastAxis = () => dir(ARMILLARY.north + Math.PI / 2);

/** Point on a bowed horizon post, t from the spider (0) to the ring (1); k = post index. */
export function postPoint(k, t) {
  const A = ARMILLARY;
  const a = A.north + 45 * DEG + k * 90 * DEG;
  const d = dir(a);
  const rTop = (A.horizon.r0 + A.horizon.r1) / 2;
  const r = A.spider.r + (rTop - A.spider.r) * Math.pow(Math.sin((t * Math.PI) / 2), 0.8);
  const yTop = A.c[1] - A.horizon.thick / 2;
  const y = A.spider.y + (yTop - A.spider.y) * t;
  return [d[0] * r, y, d[2] * r];
}
