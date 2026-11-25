// Materials for the instrument: one uniform bag shared by every material of
// one object (the instrument, or the plate drawing), and factories for the
// four shaders (solid, sphere, outline hull, ink ribbon). THREE is passed in
// (no bare import), so the engine facade stays loadable in plain node.

import { SOLID_VERT, SOLID_FRAG, SPHERE_FRAG, HULL_VERT, HULL_FRAG, LINE_VERT, LINE_FRAG } from './shaders.js';

/** sRGB hex -> linear triple. */
export function hexLinear(hex) {
  const n = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
}

/**
 * Any colour -> linear [r, g, b]: a number or '#rrggbb' is sRGB; a
 * THREE.Color, {r, g, b} or [r, g, b] is taken as already linear.
 */
export function toLinear(c, fallback = [1, 1, 1]) {
  if (c === undefined || c === null) return fallback;
  if (typeof c === 'number' || typeof c === 'string') return hexLinear(c);
  if (Array.isArray(c)) return [c[0], c[1], c[2]];
  if (typeof c === 'object' && 'r' in c) return [c.r, c.g, c.b];
  return fallback;
}

/** The palette of the approved ending (ART.md, the space frames), linear. */
export const PALETTE = {
  night: hexLinear('#0b0a14'),
  stage: hexLinear('#09080f'),
  ink: hexLinear('#ece9e1'),
  muted: hexLinear('#a8a398'),
  faint: hexLinear('#7a766d'),
  line: hexLinear('#2d2b34'),
  shade: hexLinear('#9ea0ae'),
  amber: hexLinear('#ffb469'),
  aurora: hexLinear('#39f0a6'),
  accent: hexLinear('#e8743b'),
};

/** Brass shader bases (linear F0) by variant, and their polish. */
export const METALS = {
  F0: [[0.93, 0.71, 0.36], [0.46, 0.3, 0.16], [0.56, 0.57, 0.58], [0.06, 0.1, 0.21]],
  rough: [0.24, 0.36, 0.3, 0.2],
  patina: [0.1, 0.085, 0.045],
};

/** @param {any} THREE */
export function makeUniforms(THREE) {
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  return {
    // view (set before every draw from the camera and the target)
    uRes: { value: new THREE.Vector2(1, 1) },
    uDpr: { value: 1 },
    uFootK: { value: 0.001 },
    uFootOrtho: { value: 0 },
    uRefDist: { value: 10 },
    uScale: { value: 1 },
    uRootInv: { value: new THREE.Matrix4() },
    uAcross: { value: new THREE.Vector2(0, 1) },
    uNear: { value: 0.1 },
    // look
    uBrass: { value: 0 },
    // the brass seen from across a room (0 off, 1 on; the room act sets it while it draws
    // the instrument on the desk): highlights widen with the normal's change per pixel
    // instead of sparkling on rings a pixel or two wide, and sub-pixel chamfers and
    // grooves fade instead of drawing as 1 px lines. No effect on the engraved look.
    uFarMetal: { value: 0 },
    uSpacing: { value: 3.6 },
    uInkScale: { value: 1 },
    uDarkScale: { value: 0.7 },
    uOutline: { value: 1 },
    uWidthK: { value: 1 },
    uMacro: { value: new THREE.Vector2(-2, -1) },
    uBevelW: { value: 0.0015 },
    uBrush: { value: 1 },
    uFog: { value: new THREE.Vector2(1e6, 2e6) },
    uFogCol: { value: v3(PALETTE.night) },
    uTier: { value: 3 },
    uBias: { value: 0.002 },
    uNight: { value: v3(PALETTE.night) },
    uStage: { value: v3(PALETTE.stage) },
    uInk: { value: v3(PALETTE.ink) },
    uMuted: { value: v3(PALETTE.muted) },
    uFaint: { value: v3(PALETTE.faint) },
    uLine: { value: v3(PALETTE.line) },
    uShade: { value: v3(PALETTE.shade) },
    uMetal: { value: METALS.F0.map(v3) },
    uRough: { value: new THREE.Vector4(...METALS.rough) },
    uPatina: { value: v3(METALS.patina) },
    // lights
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uKeyCol: { value: new THREE.Vector3(1, 1, 1) },
    uKeyI: { value: 1 },
    uKeyPoint: { value: 0 },
    uKeyPos: { value: new THREE.Vector3(0, 10, 0) },
    uKeyRange: { value: 10 },
    uSpotDir: { value: new THREE.Vector3(0, -1, 0) },
    uSpotCos: { value: new THREE.Vector2(-2, -1) },
    uFillDir: { value: new THREE.Vector3(0, 1, 0) },
    uFillI: { value: 0.14 },
    uFillCol: { value: new THREE.Vector3(0.05, 0.05, 0.08) },
    uAmb: { value: 0.02 },
    uAmbCol: { value: new THREE.Vector3(0.1, 0.1, 0.14) },
    uRim: { value: 0.24 },
    uRimDir: { value: new THREE.Vector3(0, 0.4, -1).normalize() },
    uRimCol: { value: new THREE.Vector3(0.2, 0.4, 0.5) },
    uSky: { value: new THREE.Vector3(0.02, 0.03, 0.06) },
    uGround: { value: new THREE.Vector3(0.004, 0.004, 0.006) },
    uEnvRim: { value: new THREE.Vector3(0.1, 0.25, 0.3) },
  };
}

const own = (THREE, o = {}) => ({
  uAccentOn: { value: o.accentOn ?? 0 },
  uAccentCol: { value: new THREE.Vector3(...(o.accentCol || PALETTE.amber)) },
});

const bonesU = (THREE) => ({ uBones: { value: Array.from({ length: 6 }, () => new THREE.Matrix4()) } });
const shellU = (THREE) => ({
  uBandN: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)] },
  uBandS: { value: 0 },
});

/** @param {any} THREE @param {object} U @param {{ bones?: boolean, shell?: boolean, accentCol?: number[] }} [o] */
export function solidMaterial(THREE, U, o = {}) {
  const defines = {};
  if (o.bones) defines.BONES = '';
  if (o.shell) defines.SHELL = '';
  const extra = { ...own(THREE, o), ...(o.bones ? bonesU(THREE) : {}), ...(o.shell ? shellU(THREE) : {}) };
  const m = new THREE.ShaderMaterial({
    name: 'instrument-solid',
    uniforms: { ...U, ...extra },
    defines,
    vertexShader: SOLID_VERT,
    fragmentShader: SOLID_FRAG,
  });
  return m;
}

/** @param {any} THREE @param {object} U @param {{ pattern: number, seed: number, hw?: number }} o */
export function sphereMaterial(THREE, U, o) {
  return new THREE.ShaderMaterial({
    name: 'instrument-sphere',
    uniforms: {
      ...U,
      ...own(THREE),
      uPattern: { value: o.pattern | 0 },
      uPatN: { value: 24 },
      uPatMix: { value: 0 },
      uSeed: { value: o.seed ?? 0 },
      uHW: { value: o.hw ?? 1.05 },
    },
    vertexShader: SOLID_VERT,
    fragmentShader: SPHERE_FRAG,
  });
}

/** @param {any} THREE @param {object} U @param {{ bones?: boolean, shell?: boolean, accentCol?: number[] }} [o] */
export function hullMaterial(THREE, U, o = {}) {
  const defines = {};
  if (o.bones) defines.BONES = '';
  if (o.shell) defines.SHELL = '';
  return new THREE.ShaderMaterial({
    name: 'instrument-hull',
    uniforms: { ...U, ...own(THREE, o), ...(o.bones ? bonesU(THREE) : {}), ...(o.shell ? shellU(THREE) : {}) },
    defines,
    vertexShader: HULL_VERT,
    fragmentShader: HULL_FRAG,
    side: THREE.BackSide,
  });
}

/** @param {any} THREE @param {object} U @param {{ bones?: boolean, draw?: boolean, bias?: number, accentCol?: number[] }} [o] */
export function lineMaterial(THREE, U, o = {}) {
  const defines = {};
  if (o.bones) defines.BONES = '';
  if (o.draw) defines.DRAW = '';
  const m = new THREE.ShaderMaterial({
    name: 'instrument-ribbon',
    uniforms: {
      ...U,
      ...own(THREE, o),
      ...(o.bones ? bonesU(THREE) : {}),
      ...(o.draw ? { uDraw: { value: 1 }, uGhost: { value: 0 } } : {}),
      uRule: { value: new THREE.Vector4(1, 0, 0, 0) },
      ...(o.bias !== undefined ? { uBias: { value: o.bias } } : {}),
    },
    defines,
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  m.forceSinglePass = true;
  return m;
}

/** An instanced ribbon mesh from LineData. */
export function lineMesh(THREE, data, material, { draw = false } = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array(data.a), 3));
  g.setAttribute('iB', new THREE.InstancedBufferAttribute(new Float32Array(data.b), 3));
  g.setAttribute('iNA', new THREE.InstancedBufferAttribute(new Float32Array(data.na), 3));
  g.setAttribute('iNB', new THREE.InstancedBufferAttribute(new Float32Array(data.nb), 3));
  g.setAttribute('iP', new THREE.InstancedBufferAttribute(new Float32Array(data.p), 4));
  if (draw) g.setAttribute('iO', new THREE.InstancedBufferAttribute(new Float32Array(data.o), 2));
  g.instanceCount = data.count;
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}
