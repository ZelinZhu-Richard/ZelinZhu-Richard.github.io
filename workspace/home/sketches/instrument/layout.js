// Dimensions of the instrument, the desk it is built on, and the arithmetic
// that places their parts. Pure data and math (no three.js), so check.mjs can
// project the same anchors the page draws.
//
// World angles: dir(a) = (cos a, 0, -sin a), counter-clockwise seen from above.
// One world unit is about 8 cm, so the finished instrument stands ~43 cm tall.

export const DEG = Math.PI / 180;
export const dir = (a) => [Math.cos(a), 0, -Math.sin(a)];

export const GROUND_Y = -0.62; // underside of the feet = the desk top

// The base: a turned plinth standing on four knurled feet, with an engraved
// dial plate on top. The dial has a recess (traced in rete.js) that holds
// the gear train; the recess floor is the plinth's top face at y = 0.
export const BASE = { top: 0, bottom: -0.52, radius: 2.62, dialTop: 0.06, dialR: 2.44 };
// under the rim, their outer edge just inside the plinth's widest moulding,
// so they show below it from the usual low three-quarter view
export const FEET = { n: 4, r: 2.44, phase: 45 * DEG, radius: 0.15 };
export const DIAL = {
  ring: { r0: 2.35, major: 2.362, mid: 2.385, minor: 2.405, edge: 2.43 },
  numerals: { r: 2.288, h: 0.07, every: 30 },
  screws: { n: 6, r: 2.135, phase: 5 * DEG, head: 0.042 },
  guilloche: { r0: 1.34, r1: 2.0, n: 7, lobes: 72, amp: 0.012 },
  label: { angle: -116 * DEG, r: 1.73, w: 0.62, h: 0.17 },
};

// Involute spur gears, one module so all three mesh. 48 : 24 : 12 teeth, so
// the train turns 1 : 2 : 4.
export const GEAR = {
  module: 0.045,
  y0: 0.02, // underside of the gear plane
  main: { z: 48, thick: 0.07 },
  idler: { z: 24, thick: 0.07 },
  pinion: { z: 12, thick: 0.09 },
};

// Main gear sits on the column axis; the idler and pinion bend round it.
// The pinion bends back toward the main wheel so the whole train fits in a
// recess inside the dial's degree ring.
export const TRAIN = {
  idlerAngle: -40 * DEG, // world angle main -> idler
  pinionAngle: 66 * DEG, // world angle idler -> pinion
};

// The alidade (the rule across the astrolabe face): its fixed angle in the
// drawing's frame (counter-clockwise from +x, seen from above).
export const ALIDADE_ANGLE = -28 * DEG;

export const CRANK = { arm: 0.55, armY: 0.44 };

const pitch = (z) => (2 * Math.PI) / z;
const fract = (x) => x - Math.floor(x);

// Rotation of gear B so that its gaps receive gear A's teeth.
export function meshNext(thetaA, zA, gammaAB, zB) {
  const fA = fract((gammaAB - thetaA) / pitch(zA));
  return gammaAB + Math.PI + (fA - 0.5) * pitch(zB);
}

export function pitchRadius(z) {
  return (z * GEAR.module) / 2;
}

// Positions and rotations of the train for a crank angle c.
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

// The seven arms in site order. Each arm sits on its own collar (longer arms
// lower). About rides the outermost arm so it can swing clear when hovered.
// Inner arms are long enough (>= 2.0) that their spheres clear the 1.15
// armillary rings from any side view.
export const ARMS = [
  { id: 'about', label: 'About', L: 4.85, h: 0.95, r: 0.36, stem: 0.85, pattern: 'rings' },
  { id: 'projects', label: 'Projects', L: 2.3, h: 2.3, r: 0.32, stem: 0.4, pattern: 'grid' },
  { id: 'research', label: 'Research', L: 2.9, h: 1.85, r: 0.4, stem: 0.55, pattern: 'contour' },
  { id: 'art', label: 'Art', L: 3.35, h: 1.625, r: 0.34, stem: 1.15, pattern: 'stipple' },
  { id: 'fun', label: 'Fun', L: 3.8, h: 1.4, r: 0.3, stem: 0.45, pattern: 'spiral' },
  { id: 'blog', label: 'Blog', L: 4.3, h: 1.175, r: 0.37, stem: 0.8, pattern: 'hatch' },
  { id: 'daily', label: 'Daily', L: 2.6, h: 2.075, r: 0.32, stem: 0.95, pattern: 'dot' },
];

// Arm hardware (radii): rods taper from the collar out; the stem rises from
// the knuckle to the pivot under the hoop.
export const ROD = { root: 0.042, tip: 0.032, stem: [0.03, 0.024], knuckle: 0.062, collar: [0.15, 0.172] };

export const PATTERN_ID = { rings: 0, spiral: 1, stipple: 2, contour: 3, hatch: 4, grid: 5, dot: 6 };

export const HOOP = { scale: 1.24, width: 0.034, thick: 0.018 };

export function armAnchor(i, angle) {
  const a = ARMS[i];
  const d = dir(angle);
  const hoopR = a.r * HOOP.scale;
  // stem + pivot: the hoop's lowest point sits in the pivot cup
  const end = [d[0] * a.L, a.h, d[2] * a.L];
  const center = [end[0], a.h + a.stem + hoopR, end[2]];
  return { ...a, angle, d, end, center, hoopR };
}

export const COLUMN = { r: 0.11, top: 2.45 };

// Armillary: nested rings above the column, the meridian ring standing in a
// saddle on the column top. Polar axis elevated 35.9 deg. A small globe sits
// at the centre, as in a real armillary sphere, with a bead at each end of
// the polar axis where it passes through the meridian ring.
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

export function beadCenters() {
  const P = polarAxis();
  const C = ARMILLARY.c;
  const h = ARMILLARY.axisHalf;
  return [
    [C[0] + P[0] * h, C[1] + P[1] * h, C[2] + P[2] * h],
    [C[0] - P[0] * h, C[1] - P[1] * h, C[2] - P[2] * h],
  ];
}

// ------------------------------------------------------------ the page ---
// Page and note placement per layout (drawing coordinates). Each note names
// its target: a star flame (the one nearest `toward`), a tooth (at an angle)
// or the rule's tip; `at` is where the leader starts, beside the words.
// Land: the page is drawn at 220 px per unit (the wheel ~55 percent of the
// frame height), so it is narrower in world units than before: it starts
// clear of the text block and ends inside the right edge; the long note
// breaks onto two lines.
export const PLATE = {
  land: {
    sheet: [-1.6, -1.82, 2.3, 1.82],
    margin: 0.3,
    notes: [
      { id: 'rete', text: 'rete &middot; twelve stars', at: [1.25, 1.42], align: 'right', target: { star: [0.7, 0.7] }, bow: -0.22 },
      { id: 'limb', text: '48 teeth = 360&deg;', at: [1.36, 0.06], align: 'right', target: { tooth: 8 }, bow: 0.18 },
      { id: 'rule', text: 'the rule turns,<br>the sky stays', at: [1.22, -1.4], align: 'right', target: { rule: 1 }, bow: 0.2 },
    ],
  },
  // the page is narrow on a phone: two notes, below the wheel, whose
  // leaders cannot cross each other's words
  port: {
    sheet: [-1.6, -2.78, 1.6, 1.8],
    margin: 0.24,
    notes: [
      { id: 'rete', text: 'rete &middot; twelve stars', at: [-1.3, -1.62], align: 'right', target: { star: [-0.55, -0.55] }, bow: 0.22 },
      { id: 'rule', text: 'the rule turns', at: [-0.05, -2.25], align: 'right', target: { rule: 1 }, bow: 0.2 },
    ],
  },
};

// ------------------------------------------------------------ build state ---
// The instrument is a function of what has been earned so far. Every field
// is optional; missing means "absent".
//   gears 0..3 (main, then idler, then pinion), crank, base, floor (the
//   recess floor alone, when the base is not there yet), column,
//   rings 0..4 (meridian, equator, ecliptic, colure), globe,
//   arms: indices present, spheres: indices carrying their sphere,
//   sealed: the rings closed into one sphere.
const ALL = [0, 1, 2, 3, 4, 5, 6];
export const BUILDS = {
  empty: {},
  one: { gears: 1 },
  // the train on its engraved floor (the base's recess, before the base)
  train: { gears: 3, crank: true, floor: true },
  desk: { base: true, gears: 3, crank: true, column: true, rings: 3, globe: true },
  partial: { base: true, gears: 3, crank: true, column: true, rings: 4, globe: true, arms: [1, 2, 6], spheres: [1, 2] },
  full: { base: true, gears: 3, crank: true, column: true, rings: 4, globe: true, arms: ALL, spheres: ALL },
  sealed: { base: true, gears: 3, crank: true, column: true, rings: 4, globe: true, arms: ALL, spheres: ALL, sealed: true },
};

// ------------------------------------------------------------------ room ---
// The desk at 3 a.m. Desk top at GROUND_Y; the back wall's face at z = WALL.z.
export const ROOM = {
  desk: { x0: -13.5, x1: 9.6, z0: -6.0, z1: 5.0, thick: 0.42 },
  wall: { z: -6.0, thick: 0.5, x0: -60, x1: 60, y0: -12, y1: 40 },
  window: { x0: -12.4, x1: 12.6, y0: 0.75, y1: 21.5, frame: 0.36, depth: 0.32, mullion: 6.4 },
  floorY: -10.0,
  // stands behind-left of the instrument and leans over it, so its shade
  // opens toward the viewer and its filament sits in front of the window
  lamp: {
    base: [-5.4, -3.4],
    elbow: [-6.1, 5.5, -4.6],
    joint: [-3.0, 6.55, -2.6],
    aim: [0.7, GROUND_Y, 5.4],
  },
  loupe: { c: [-4.9, 2.55], yaw: -13 * DEG },
  plotter: { c: [4.7, 2.0] },
  balance: { c: [7.7, -2.35] },
  skis: { x: [10.55, 11.55], foot: [-10.0, -2.4], tipY: 7.0 },
};

// The lamp shade: a shallow cone whose axis points from the joint to `aim`.
export const SHADE = { len: 1.05, mouthR: 0.92, neck: 0.42, bulbDepth: 0.5 };

export function lampFrame() {
  const L = ROOM.lamp;
  const J = L.joint;
  const a = [L.aim[0] - J[0], L.aim[1] - J[1], L.aim[2] - J[2]];
  const l = Math.hypot(a[0], a[1], a[2]);
  const axis = [a[0] / l, a[1] / l, a[2] / l];
  // the shade hangs a short neck below the joint
  const neckEnd = [J[0] + axis[0] * SHADE.neck * 0.4, J[1] - SHADE.neck, J[2] + axis[2] * SHADE.neck * 0.4];
  const apex = neckEnd;
  const mouth = [apex[0] + axis[0] * SHADE.len, apex[1] + axis[1] * SHADE.len, apex[2] + axis[2] * SHADE.len];
  const fil = [apex[0] + axis[0] * SHADE.bulbDepth, apex[1] + axis[1] * SHADE.bulbDepth, apex[2] + axis[2] * SHADE.bulbDepth];
  return { joint: J, neckEnd, apex, mouth, axis, filament: fil };
}
