// Dimensions of the instrument and the arithmetic that places its parts.
// Pure data and math (no three.js), so a Node check can project the same
// anchors the page draws.
//
// World angles: dir(a) = (cos a, 0, -sin a), counter-clockwise seen from above.

export const DEG = Math.PI / 180;
export const dir = (a) => [Math.cos(a), 0, -Math.sin(a)];

export const GROUND_Y = -0.62;

export const BASE = { top: 0, bottom: GROUND_Y, radius: 2.55 };

// Involute spur gears, one module so all three mesh.
export const GEAR = {
  module: 0.045,
  y0: 0.02, // underside of the gear plane
  main: { z: 48, thick: 0.07 },
  idler: { z: 24, thick: 0.07 },
  pinion: { z: 12, thick: 0.09 },
};

// Main gear sits on the column axis; the idler and pinion bend round it.
export const TRAIN = {
  idlerAngle: -40 * DEG, // world angle main -> idler
  pinionAngle: 20 * DEG, // world angle idler -> pinion
};

export const CRANK = { arm: 0.55, armY: 0.44, handleY0: 0.49, handleY1: 0.86, handleR: 0.044, shaftTop: 0.47 };

const pitch = (z) => (2 * Math.PI) / z;
const fract = (x) => x - Math.floor(x);

// Rotation of gear B so that its gaps receive gear A's teeth.
// thetaA: rotation of A (tooth 0 at that angle); gammaAB: world angle A -> B.
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
  // The crank is keyed to the pinion: crank angle == pinion rotation.
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

// The seven arms in site order. Lengths step by 0.55 from the column; each
// arm sits on its own collar (longer arms lower). About rides the outermost
// arm so it can swing clear of the machine when hovered.
export const ARMS = [
  { id: 'about', label: 'About', L: 4.85, h: 0.95, r: 0.34, stem: 0.85, pattern: 'rings' },
  { id: 'projects', label: 'Projects', L: 1.55, h: 2.3, r: 0.3, stem: 0.4, pattern: 'grid' },
  { id: 'research', label: 'Research', L: 2.65, h: 1.85, r: 0.4, stem: 0.55, pattern: 'contour' },
  { id: 'art', label: 'Art', L: 3.2, h: 1.625, r: 0.33, stem: 1.15, pattern: 'stipple' },
  { id: 'fun', label: 'Fun', L: 3.75, h: 1.4, r: 0.28, stem: 0.45, pattern: 'spiral' },
  { id: 'blog', label: 'Blog', L: 4.3, h: 1.175, r: 0.36, stem: 0.8, pattern: 'hatch' },
  { id: 'daily', label: 'Daily', L: 2.1, h: 2.075, r: 0.31, stem: 0.95, pattern: 'dot' },
];

export const PATTERN_ID = { rings: 0, spiral: 1, stipple: 2, contour: 3, hatch: 4, grid: 5, dot: 6 };

export const HOOP = { scale: 1.24, width: 0.034, thick: 0.018 };

export function armAnchor(i, angle) {
  const a = ARMS[i];
  const d = dir(angle);
  const hoopR = a.r * HOOP.scale;
  const end = [d[0] * a.L, a.h, d[2] * a.L];
  const center = [end[0], a.h + a.stem + hoopR, end[2]];
  return { ...a, angle, d, end, center, hoopR };
}

export const COLUMN = { r: 0.11, top: 2.45 };

// Armillary: nested rings above the column. Polar axis elevated by the
// latitude of Chapel Hill (35.9 N), the home of UNC.
export const ARMILLARY = {
  c: [0, 3.6, 0],
  latitude: 35.9 * DEG,
  north: 128 * DEG, // world azimuth of the polar axis
  rings: [
    { kind: 'meridian', R: 1.15, w: 0.08 },
    { kind: 'equator', R: 1.03, w: 0.068 },
    { kind: 'ecliptic', R: 0.91, w: 0.064 },
    { kind: 'colure', R: 0.79, w: 0.06 },
  ],
  thick: 0.022,
  sealedR: 1.055,
};
