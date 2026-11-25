// The sky: a procedural night-sky backdrop for the homepage scene.
//
// One full-screen triangle, one draw call, no textures, no render targets.
// The fragment shader is shaded by WORLD VIEW DIRECTION (rebuilt from the
// camera's projection and view matrices in the vertex shader), so the sky is a
// true backdrop at infinity: it never translates with the camera, and rotating
// the camera pans across it correctly.
//
// Layers, back to front: base gradient, galaxy band (glow, dust), nebula,
// stars (behind the dust), aurora (in front, world frame), hero stars.
//
// Everything is seeded: the same seed and the same uniforms draw the same frame.
// Time is passed in with setTime(t); nothing reads a clock.

import * as THREE from 'three';

const HERO_N = 6;

// sRGB hex values. They are converted to linear light here (independently of
// THREE.ColorManagement) and baked into the shader as constants.
export const SKY_PALETTE = Object.freeze({
  deep: '#03071c', // darkest sky: near-black blue
  blue: '#0a1846', // deep saturated blue, the lighter sky
  indigo: '#140f44', // indigo, the sky's slow hue drift
  horizon: '#16265e', // horizon glow (horizon option only)
  galOuter: '#3a3fb0', // galaxy halo: indigo blue
  galViolet: '#6f4fdc', // galaxy body: violet
  galMauve: '#a68ef2', // bright star clouds: lavender
  galBlue: '#8ea4ff', // blue star clouds
  galPink: '#ff96c4', // core: warm pink
  galPeach: '#ffd0b0', // core highlight
  galWhite: '#e6deff', // brightest star clouds: lavender white
  auroraEdge: '#c8ffe4', // aurora hem: almost white green
  auroraBody: '#12f0a8', // aurora body: vivid cyan-leaning green (no red: it is driven past 1)
  auroraTeal: '#0edcd2', // aurora upper body: cyan
  auroraViolet: '#a457ff', // aurora upper fringe: violet-magenta
  nebRose: '#f2456c', // nebula body: rose red
  nebDeep: '#8a1a40', // nebula outskirts: deep crimson
  nebBlue: '#b4d2ff', // nebula ionisation front: pale blue
  nebCore: '#ffe8f0', // nebula core: pink-white
  starBlue: '#a9c1ff',
  starWhite: '#f4f2ff',
  starWarm: '#ffd8ae',
});

// Cost per tier (per pixel, worst case where every feature overlaps).
// "n3" = 3D gradient-noise evaluations, "n2" = 2D gradient-noise evaluations,
// star cells = hashed cells visited. Regions outside a feature's mask skip it.
// galaxy.grain: the band's fine mottling (bright band pixels only).
export const SKY_TIERS = Object.freeze([
  { tier: 0, galaxy: { warp: 0, cloud: 2, dust: 1, grain: 0 }, nebula: { warp: 2, body: 2, ridge: 1, dark: 1 }, aurora: { curtains: 1, rays: 2 }, base: 0, starLayers: 'D1(N300,2x2) + B', starCells: 5, heroes: HERO_N },
  { tier: 1, galaxy: { warp: 2, cloud: 2, dust: 3, grain: 1 }, nebula: { warp: 2, body: 3, ridge: 2, dark: 1 }, aurora: { curtains: 2, rays: 2 }, base: 1, starLayers: 'D1(N400,2x2) + M + B', starCells: 6, heroes: HERO_N },
  { tier: 2, galaxy: { warp: 3, cloud: 5, dust: 5, grain: 2 }, nebula: { warp: 2, body: 4, ridge: 3, dark: 1 }, aurora: { curtains: 3, rays: 4 }, base: 1, starLayers: 'D1 + D2(N250,2x2) + D3(N640,2x2, band only) + M + B', starCells: 14, heroes: HERO_N },
  { tier: 3, galaxy: { warp: 3, cloud: 6, dust: 6, grain: 2 }, nebula: { warp: 2, body: 5, ridge: 3, dark: 1 }, aurora: { curtains: 3, rays: 4 }, base: 1, starLayers: 'D1 + D2 + D3(N640,2x2, band only) + M + B', starCells: 14, heroes: HERO_N },
]);

// ---------------------------------------------------------------- helpers

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToLinear(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

const fl = (x) => {
  const s = Number(x).toFixed(6);
  return s === '-0.000000' ? '0.000000' : s;
};
const glslVec3 = (hex) => `vec3(${hexToLinear(hex).map(fl).join(', ')})`;
// chroma only: the colour scaled to unit luminance (brightness comes from the field)
const glslChroma = (hex) => {
  const c = hexToLinear(hex);
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return `vec3(${c.map((v) => fl(v / y)).join(', ')})`;
};

function randomRotation(rnd) {
  // uniform random rotation (Shoemake)
  const u1 = rnd();
  const u2 = rnd();
  const u3 = rnd();
  const s1 = Math.sqrt(1 - u1);
  const s2 = Math.sqrt(u1);
  const q = new THREE.Quaternion(s1 * Math.sin(2 * Math.PI * u2), s1 * Math.cos(2 * Math.PI * u2), s2 * Math.sin(2 * Math.PI * u3), s2 * Math.cos(2 * Math.PI * u3));
  return new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
}

const glslMat3 = (m) => `mat3(${m.elements.map(fl).join(', ')})`;

// World direction through an NDC point of a perspective camera (honours setViewOffset).
export function directionAtNdc(camera, x, y, target = new THREE.Vector3()) {
  camera.updateMatrixWorld();
  const e = camera.projectionMatrix.elements;
  target.set((x + e[8]) / e[0], (y + e[9]) / e[5], -1);
  return target.transformDirection(camera.matrixWorld);
}

// --------------------------------------------------------------- shaders

const VERT = /* glsl */ `
varying vec3 vDir;
varying vec2 vNdc;

void main() {
  vNdc = position.xy;
  // View-space ray through this NDC point. Exact for any perspective
  // projection (including off-axis / setViewOffset) and any depth convention:
  // it only reads the x/y scale and shear terms of the projection matrix.
  vec3 rayV = vec3(
    (position.x + projectionMatrix[2][0]) / projectionMatrix[0][0],
    (position.y + projectionMatrix[2][1]) / projectionMatrix[1][1],
    -1.0);
  // to world: mat3(viewMatrix) is the inverse camera rotation, so its transpose is the rotation
  vDir = transpose(mat3(viewMatrix)) * rayV;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function fragmentSource(rots) {
  const P = SKY_PALETTE;
  return /* glsl */ `
#define SKY_PI 3.14159265
#define SKY_TAU 6.28318531
#define HERO_N ${HERO_N}

#ifndef TIER
#define TIER 2
#endif

// Octave budgets per tier. Loop bounds are compile-time constants.
#if TIER <= 0
#define GAL_OCT 2
#define DUST_OCT 1
#define NEB_OCT 2
#define NEB_RID 1
#define AUR_N 1
#define D1_N 300.0
#elif TIER == 1
#define GAL_OCT 2
#define DUST_OCT 3
#define NEB_OCT 3
#define NEB_RID 2
#define AUR_N 2
#define D1_N 400.0
#elif TIER == 2
#define GAL_OCT 5
#define DUST_OCT 5
#define NEB_OCT 4
#define NEB_RID 3
#define AUR_N 3
#define D1_N 400.0
#define D3_N 640.0
#else
#define GAL_OCT 6
#define DUST_OCT 6
#define NEB_OCT 5
#define NEB_RID 3
#define AUR_N 3
#define D1_N 400.0
#define D3_N 640.0
#endif

varying vec3 vDir;
varying vec2 vNdc;

uniform float uGalaxy;
uniform float uAurora;
uniform float uNebula;
uniform float uStars;
uniform float uExposure;
uniform float uTime;
uniform float uHorizon;
uniform float uPeak;
uniform float uDpr;
uniform float uDither;
uniform float uEncode;
uniform float uAspect;
uniform float uSalt;
uniform mat3 uSkyRot;
uniform vec3 uSeedOff;
uniform vec3 uGalPole;
uniform vec3 uGalCore;
uniform vec4 uGalShape;
uniform vec4 uNebCenter;
uniform vec4 uNebT1;
uniform vec4 uNebT2;
uniform vec4 uAurFrame;
uniform vec4 uAurShape;
uniform vec4 uQuiet;
uniform float uQuietK;
uniform vec4 uHeroPos[HERO_N];
uniform vec4 uHeroCol[HERO_N];

// palette, linear light (GAL_* are unit-luminance chroma)
const vec3 SKY_DEEP = ${glslVec3(P.deep)};
const vec3 SKY_BLUE = ${glslVec3(P.blue)};
const vec3 SKY_INDIGO = ${glslVec3(P.indigo)};
const vec3 SKY_HORIZON = ${glslVec3(P.horizon)};
const vec3 GAL_OUTER = ${glslChroma(P.galOuter)};
const vec3 GAL_VIOLET = ${glslChroma(P.galViolet)};
const vec3 GAL_MAUVE = ${glslChroma(P.galMauve)};
const vec3 GAL_BLUE = ${glslChroma(P.galBlue)};
const vec3 GAL_PINK = ${glslChroma(P.galPink)};
const vec3 GAL_PEACH = ${glslChroma(P.galPeach)};
const vec3 GAL_WHITE = ${glslChroma(P.galWhite)};
const vec3 AUR_EDGE = ${glslVec3(P.auroraEdge)};
const vec3 AUR_BODY = ${glslVec3(P.auroraBody)};
const vec3 AUR_TEAL = ${glslVec3(P.auroraTeal)};
const vec3 AUR_VIOLET = ${glslVec3(P.auroraViolet)};
const vec3 NEB_ROSE = ${glslVec3(P.nebRose)};
const vec3 NEB_DEEP = ${glslVec3(P.nebDeep)};
const vec3 NEB_BLUE = ${glslVec3(P.nebBlue)};
const vec3 NEB_CORE = ${glslVec3(P.nebCore)};
const vec3 STAR_BLUE = ${glslVec3(P.starBlue)};
const vec3 STAR_WHITE = ${glslVec3(P.starWhite)};
const vec3 STAR_WARM = ${glslVec3(P.starWarm)};

// overall gains (linear light)
const float GAL_GAIN = 0.22;
const float NEB_GAIN = 0.8;
const float AUR_GAIN = 1.2;

// aurora curtains: distance exponent (D * spacing^e), azimuth offset, gain
const vec3 AUR_E = vec3(0.0, 1.0, -0.8);
const vec3 AUR_AZ = vec3(0.0, 0.17, -0.24);
const vec3 AUR_G = vec3(1.0, 0.62, 0.48);

// seeded random rotations that decorrelate the star layers' cell grids
const mat3 STAR_R1 = ${glslMat3(rots[0])};
const mat3 STAR_R2 = ${glslMat3(rots[1])};
const mat3 STAR_R3 = ${glslMat3(rots[2])};
const mat3 STAR_R4 = ${glslMat3(rots[3])};
const mat3 STAR_R5 = ${glslMat3(rots[4])};

// octave rotations (orthonormal) so lattice axes never line up between octaves
const mat3 OCT3 = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
const mat2 OCT2 = mat2(0.80, 0.60, -0.60, 0.80);

float skyLum(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// ------------------------------------------------------------ hashing

// Dave Hoskins' sine-free hashes: cheap float hashes for noise lattices.
vec3 skyHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0;
}

vec2 skyHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}

float skyHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// pcg3d (Jarzynski and Olano 2020) plus a final xorshift: high-quality integer
// hash for the star cells, where any pattern would show.
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  return v;
}

// -------------------------------------------------------------- noise

// 3D gradient noise, quintic fade. Output roughly in [-0.75, 0.75].
float gnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(skyHash33(i), f);
  float n100 = dot(skyHash33(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(skyHash33(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(skyHash33(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(skyHash33(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(skyHash33(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(skyHash33(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(skyHash33(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

// 2D gradient noise, quintic fade.
float gnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n00 = dot(skyHash22(i), f);
  float n10 = dot(skyHash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float n01 = dot(skyHash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float n11 = dot(skyHash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

// Star clouds. Persistence 0.68 (not 0.5) keeps real contrast in the fine
// octaves: the band's light is granular, not a smooth fog.
float fbmGal(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < GAL_OCT; i++) {
    s += a * gnoise3(p);
    p = OCT3 * p * 2.03 + vec3(1.7, 9.2, 4.1);
    a *= 0.68;
  }
  return s;
}

// Dust: fbm in which every octave displaces the next octave's domain by its
// own value (a turbulent self-warp). Level sets of plain gradient noise trace
// its lattice (it is zero at every lattice vertex), so thresholding it drew
// angular, stair-stepped blobs; the self-warp curls them into smoke-like
// wisps. x = signed sum (cloud body), y = ridges along the zero crossings of
// the octaves after the first (thin filaments; the first would draw a net).
vec2 dustGal(vec3 p) {
  float s = 0.0;
  float r = 0.0;
  float a = 0.5;
  for (int i = 0; i < DUST_OCT; i++) {
    float n = gnoise3(p);
    s += a * n;
    float k = clamp(1.0 - 4.0 * abs(n), 0.0, 1.0);
    r += (i > 0 ? a : 0.0) * k * k;
    p = OCT3 * p * 2.13 + vec3(4.3, 1.1, 7.9) + vec3(1.2, -0.9, 0.7) * n;
    a *= 0.64;
  }
  return vec2(s, r);
}

float fbmNeb(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < NEB_OCT; i++) {
    s += a * gnoise2(p);
    p = OCT2 * p * 2.07 + vec2(3.1, 7.3);
    a *= 0.58;
  }
  return s;
}

vec2 ridgeNeb(vec2 p) {
  float r = 0.0;
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < NEB_RID; i++) {
    float n = gnoise2(p);
    s += a * n;
    float k = clamp(1.0 - 7.0 * abs(n), 0.0, 1.0);
    r += a * k * k;
    p = OCT2 * p * 2.13 + vec2(2.9, 6.1);
    a *= 0.55;
  }
  return vec2(r, s);
}

float wrapPi(float a) {
  return a - SKY_TAU * floor((a + SKY_PI) / SKY_TAU);
}

// ------------------------------------------------------------ base sky

// Deep saturated blue with a very subtle large-scale drift: the noise moves
// it between darker and lighter blue and, along a second (analytic) axis,
// toward indigo. Nothing here is finer than about a quarter of the sky.
vec3 baseSky(vec3 d, vec3 c) {
#if TIER >= 1
  float n = gnoise3(c * 1.1 + uSeedOff * 0.11);
#else
  float n = 0.3 * dot(c, vec3(0.48, 0.60, -0.64));
#endif
  float hue = smoothstep(-0.6, 0.6, dot(c, vec3(0.62, -0.46, 0.64)) - 0.9 * n);
  vec3 sp = mix(SKY_DEEP, mix(SKY_BLUE, SKY_INDIGO, hue), clamp(0.6 + 1.2 * n, 0.0, 1.0));
  if (uHorizon <= 0.0) return sp;
  // world frame: lighter and bluer toward the horizon, darker below it
  vec3 hz = mix(SKY_HORIZON, sp, smoothstep(0.0, 0.45, d.y));
  hz = mix(hz, SKY_DEEP * 0.8, 1.0 - smoothstep(-0.25, 0.0, d.y));
  return mix(sp, hz, uHorizon);
}

// -------------------------------------------------------------- galaxy

// The Milky Way: a band around a great circle (pole uGalPole), brightest and
// thickest toward uGalCore, with a warm hot core. Structure is anisotropic
// (stretched along the band) and domain-warped; the light is log-normal star
// clouds with a fine grain of unresolved stars; dust is a rift lane plus
// self-warped smoky clouds and thin filaments. Outputs glow (linear),
// transmittance of the dust for what lies behind it (stars), and a
// star-density field. pxA (radians per device pixel) fades the grain.
void galaxyField(vec3 c, float pxA, out vec3 glow, out float trans, out float dens) {
  trans = 1.0;
  float W = uGalShape.x;
  float sb = dot(c, uGalPole);
  vec3 e2 = cross(uGalPole, uGalCore);
  float lx = dot(c, uGalCore);
  float ly = dot(c, e2);
  float l = (abs(lx) + abs(ly) > 1e-6) ? atan(ly, lx) : 0.0;
  float coreL = exp(-l * l / (uGalShape.y * uGalShape.y));
  float We = W * (1.0 + 0.8 * coreL);
  float bh = sb / (3.0 * We);
  float halo = exp(-bh * bh) * (0.45 + 0.55 * coreL);
  glow = GAL_OUTER * (0.07 * halo);
  dens = 0.18 * halo;
  if (abs(sb) > 4.4 * We) {
    glow *= GAL_GAIN;
    return;
  }

  // anisotropic domain: latitude compressed 1.9x, so features run along the band
  vec3 p = (c + uGalPole * (sb * 0.9)) * 4.2 + uSeedOff;

#if TIER >= 2
  vec3 pw = p * 0.45;
  vec3 w = vec3(gnoise3(pw + vec3(13.1, 0.0, 0.0)),
                gnoise3(pw + vec3(0.0, 27.3, 0.0)),
                gnoise3(pw + vec3(0.0, 0.0, 41.7)));
#elif TIER == 1
  vec3 pw = p * 0.45;
  float w0 = gnoise3(pw + vec3(13.1, 0.0, 0.0));
  float w1 = gnoise3(pw + vec3(0.0, 27.3, 0.0));
  vec3 w = vec3(w0, w1, 0.7 * (w0 - w1));
#else
  vec3 w = 0.45 * sin(p.yzx * 1.3 + vec3(0.0, 2.1, 4.2));
#endif
  vec3 q = p + w * 2.4;

  float cl = fbmGal(q);
  float bb = (sb + We * (0.8 * w.x + 0.3 * cl)) / We;
  float prof = 0.72 * exp(-bb * bb) + 0.28 * exp(-0.25 * bb * bb);
  float longi = 0.34 + 0.66 * coreL + 0.18 * w.y;

  // dust: its own self-warped domain, stretched 1.5x along the band (3.2x
  // turned the noise lattice into slanted parallelograms) and gathered toward
  // a wandering mid-plane lane (the rift). The body is a soft ramp that is
  // wide against the noise spread, so clouds fade in over a gradient and the
  // fine octaves fray their edges; tau, not light, is ramped, so cores still
  // go dark. Zero beyond 3 We, so the noise is skipped there.
  float dm = 1.0 - smoothstep(1.2, 3.0, abs(sb) / We);
  float tau = 0.0;
  if (dm > 0.0) {
    vec3 pdu = (c + uGalPole * (sb * 0.5)) * 9.0 + uSeedOff.zxy + w * 1.6;
    vec2 rd = dustGal(pdu);
    float rb = (sb - We * (0.05 + 0.4 * w.z)) / (0.6 * We);
    float lane = exp(-rb * rb);
    // dust shies away from the brightest star clouds
    float df = rd.x + 0.2 * lane - 0.07 - 0.16 * cl;
    float body = smoothstep(-0.14, 0.3, df);
    // thin dark threads reaching out of the clouds into the light (not inside them)
    float fil = smoothstep(0.22, 0.8, rd.y) * smoothstep(-0.32, -0.04, df) * (1.0 - body);
    tau = uGalShape.w * dm * ((2.6 * body * body + 0.2 * body) * (0.35 + 0.65 * max(lane, 0.6 * prof)) + 0.9 * fil * (0.3 + 0.7 * prof));
  }
  trans = exp(-tau);

  // light: log-normal star clouds (bright knots, soft gradients, no clamped
  // plateaus), a bulge toward the core and a hot inner core
  float clump = exp(2.3 * cl);
  float bulge = coreL * exp(-sb * sb / (0.5 * We * We)) * (0.5 + 0.5 * clump);
  float hl = l / (0.32 * uGalShape.y);
  float hot = exp(-hl * hl - sb * sb / (0.22 * We * We)) * (0.6 + 0.4 * clump);
  // the band's own light and star crowding fade to zero at the early-out
  // above (4.4 We). The wide profile wing is still a few percent at 3.2 We,
  // so a bare cut there drew a hard straight line parallel to the band.
  float edge = 1.0 - smoothstep(3.2, 4.4, abs(sb) / We);
  float I = (prof * longi * clump + 1.5 * bulge + 2.4 * hot) * edge;
#if TIER >= 1
  // unresolved stars: a fine mottling of the band's own light, strongest in
  // its bright clouds (blobs of about 3 to 8 px on a desktop frame). Two
  // rotated octaves at unrelated scales (tier 2+), because one octave alone
  // has a single wavelength and reads as a regular orange-peel pattern.
  // Faded out where the fine lattice falls under about 2 px: no shimmer.
  float gA = smoothstep(1.6, 3.2, 1.0 / (170.0 * pxA)) * smoothstep(0.05, 0.5, I);
  if (gA > 0.0) {
    float gn = gnoise3(c * 170.0 + uSeedOff * 2.3);
#if TIER >= 2
    gn = 0.75 * gn + 0.6 * gnoise3(OCT3 * c * 71.0 + uSeedOff.yzx * 1.7);
    I *= mix(1.0, 0.62 * exp(1.6 * gn) + 0.28, gA);
#else
    I *= mix(1.0, 0.7 * exp(1.0 * gn) + 0.25, gA);
#endif
  }
#endif

  vec3 tint = mix(GAL_OUTER, GAL_VIOLET, smoothstep(0.05, 0.45, I));
  tint = mix(tint, GAL_MAUVE, 0.7 * smoothstep(0.35, 1.0, I));
  tint = mix(tint, GAL_BLUE, 0.4 * smoothstep(0.05, 0.45, w.z) * (1.0 - coreL));
  tint = mix(tint, GAL_WHITE, 0.6 * smoothstep(0.7, 1.6, I) * (1.0 - coreL * coreL));
  tint = mix(tint, GAL_PINK, coreL * coreL * smoothstep(0.4, 1.2, I));
  tint = mix(tint, GAL_PEACH, coreL * coreL * smoothstep(1.3, 2.6, I));

  // dust reddens what it does not block
  vec3 ext = exp(-tau * vec3(0.94, 1.0, 1.04));
  glow = (glow + tint * I) * ext * GAL_GAIN;
  dens = (dens + (prof * (0.2 + 0.5 * min(clump, 1.8)) + 0.6 * bulge + 0.4 * hot) * edge) * trans;
}

// -------------------------------------------------------------- nebula

// One localized emission cloud around uNebCenter (radius uNebCenter.w):
// mottled rose gas under a soft envelope, thin bright wisps (ridged noise),
// thin dark dust lanes, a brighter pale-blue ionisation front on one flank
// and a bright pink-white core. tau: its dust, for what lies behind it.
vec3 nebulaField(vec3 c, out float tau) {
  tau = 0.0;
  float cd = dot(c, uNebCenter.xyz);
  if (cd < uNebT1.w) return vec3(0.0);
  vec2 p = vec2(dot(c, uNebT1.xyz), dot(c, uNebT2.xyz)) / (cd * uNebCenter.w);
  vec2 o = uSeedOff.xy * 0.37;
  vec2 w = vec2(gnoise2(p * 1.2 + o), gnoise2(p * 1.2 + o + vec2(5.2, 1.3)));
  vec2 q = p + w * 0.55;
  float r = length(q * vec2(0.8, 1.25));
  float env = exp(-1.8 * r * r) * (1.0 - smoothstep(0.9, 1.6, r));
  if (env < 0.002) return vec3(0.0);

  float body = fbmNeb(q * 2.2 + o.yx);
  float den = clamp(0.4 + 3.2 * body, 0.0, 1.6);
  // fine structure fades out on small nebulae, where it would turn into scribbles
  float detail = smoothstep(0.08, 0.2, uNebCenter.w);
  vec2 rd = ridgeNeb(p * 3.0 + w * 0.25 + o * 1.7);
  float wisp = clamp(rd.x * 1.5, 0.0, 1.0) * detail;
  float dk = clamp(1.0 - 3.2 * abs(gnoise2(q * 3.2 + o + 9.1) + 0.12 * rd.y), 0.0, 1.0);
  dk = dk * dk * dk * detail;
  // dark lanes, dark pockets where the gas thins, and a little general dust so
  // the band behind does not shine through as violet mud
  tau = env * (2.2 * dk * smoothstep(0.2, 0.6, den) + 1.4 * smoothstep(0.06, 0.2, -body - 0.03) + 0.5);

  float front = smoothstep(-0.1, 0.5, 0.75 * q.x - 0.65 * q.y + 0.4 * w.x) * (1.0 - smoothstep(0.5, 1.1, r));
  // the core brightens the textured gas (it multiplies, so its structure stays)
  float core = exp(-7.0 * r * r);
  float I = env * den * (0.7 + 0.5 * wisp) * (1.0 + 0.6 * front) * (1.0 + 1.5 * core);
  // rose and pale blue are kept apart: the blue is a pale glow on the
  // ionisation front and switches in over a short ramp, because pixels that
  // are half rose, half blue read as mud
  float bl = smoothstep(0.35, 0.75, front * (0.7 + 0.5 * wisp)) * smoothstep(0.1, 0.5, I);
  vec3 rose = mix(NEB_DEEP, NEB_ROSE, smoothstep(0.05, 0.45, I));
  rose = mix(rose, NEB_CORE, 0.75 * core * smoothstep(0.5, 1.5, I));
  vec3 col = mix(rose, NEB_BLUE * 1.3, bl) * I;
  return col * (exp(-0.9 * tau) * NEB_GAIN);
}

// -------------------------------------------------------------- aurora

// Curtains as thin vertical sheets hanging from altitude uAurShape.x along
// wandering arcs on a flat earth (units: 100 km). For a sightline at azimuth
// a and elevation e, the sheet at ground distance rho(a) is met at altitude
// rho * tan(e): that altitude gives the vertical profile, and the sheet point
// X (a point on a 1D curve) drives the ray texture, so every structure is
// exactly vertical along the sheet. Rays converge toward the zenith overhead,
// as real ones do. Folds come from rho(a) wandering; where the sheet turns
// edge-on the light path through it lengthens and it brightens.
vec3 auroraField(vec3 d) {
  float ch = max(length(d.xz), 1e-5);
  float tanE = d.y / ch;
  float az = (length(d.xz) > 1e-5) ? atan(d.x, -d.z) : 0.0;
  float span = uAurFrame.w;
  float t = uTime;
  vec3 acc = vec3(0.0);
  for (int k = 0; k < AUR_N; k++) {
    float fk = float(k);
    float a = wrapPi(az - uAurFrame.x - AUR_AZ[k]);
    float env = 1.0 - smoothstep(0.5 * span, span, abs(a));
    if (env <= 0.0) continue;
    float ca = cos(a);
    float sa = sin(a);
    // smooth floor on cos(a): the arc recedes toward the horizon at its ends
    float sq = sqrt(ca * ca + 0.08);
    float cc = 0.5 * (ca + sq);
    float dcc = -0.5 * sa * (1.0 + ca / sq);
    float ph = uAurShape.w + fk * 2.17;
    float a1 = a * 2.7 + ph + t * 0.031;
    float a2 = a * 6.1 + ph * 1.9 - t * 0.047;
    float a3 = a * 13.3 + ph * 3.3 + t * 0.071;
    float A = uAurShape.z;
    float g = 1.0 + A * (sin(a1) + 0.5 * sin(a2) + 0.25 * sin(a3));
#if TIER >= 2
    // small irregular kinks in the hem (not in the fold term: too small to matter there)
    g += 0.25 * A * gnoise2(vec2(a * 12.0 + fk * 7.1, ph + t * 0.02));
#endif
    float gp = A * (2.7 * cos(a1) + 3.05 * cos(a2) + 3.325 * cos(a3));
    float rho = uAurFrame.y * pow(uAurFrame.z, AUR_E[k]) * g / cc;
    float h = rho * tanE - uAurShape.x;
    if (h < -0.07) continue;
    // path length through the sheet: 1 / |cos| of the angle between sightline and sheet normal
    float lg = gp / g - dcc / cc;
    float fold = min(sqrt(1.0 + lg * lg), 4.0);

    vec2 X = rho * vec2(sa, ca) + uSeedOff.xy * (0.13 + 0.07 * fk) + vec2(t * 0.012, 0.0);
    float nl = gnoise2(X * 1.7);
    float nm = gnoise2(X * 13.0 + 3.7);
    float rm = clamp(1.0 - 2.6 * abs(nm), 0.0, 1.0);
    float rays = 0.35 + 0.65 * rm * rm;
#if TIER >= 2
    float nf = gnoise2(X * 40.0 + 9.1);
    float rf = clamp(1.0 - 2.4 * abs(nf), 0.0, 1.0);
    rays *= 0.65 + 0.5 * rf;
#endif
    float patchy = smoothstep(-0.25, 0.3, nl + 0.1);
    float decay = uAurShape.y * (0.5 + 0.9 * smoothstep(-0.35, 0.35, nl + 0.6 * nm));
    float hp = max(h, 0.0);
    float lower = smoothstep(-0.06, 0.015, h);
    float body = lower * exp(-hp / decay);
    // the hem: a thin, almost white-green line inside a soft glow
    float hem = lower * exp(-hp / 0.03);
    float hemGlow = smoothstep(-0.07, 0.0, h) * exp(-hp / 0.1);
    // violet only where the green has faded: a hue path up the curtain (an
    // even green-violet mix is what read as grey)
    float top = lower * smoothstep(0.4, 1.2, h) * exp(-hp / (2.6 * decay));
    // rays strongest higher up; the body near the hem stays smoother
    float rr = mix(1.0, rays, 0.45 + 0.55 * smoothstep(0.0, 0.3, h));
    vec3 cb = mix(AUR_BODY, AUR_TEAL, smoothstep(0.25, 0.9, h));
    float I = env * (0.1 + 0.9 * patchy) * fold * AUR_G[k];
    acc += I * (cb * (body * rr + 0.45 * hemGlow) + AUR_EDGE * (0.8 * hem * rr) + AUR_VIOLET * (0.45 * top * (0.5 + 0.5 * rays)));
  }
  return acc * AUR_GAIN;
}

// --------------------------------------------------------------- stars

// Cube-sphere face coordinates: uv in [-1, 1] on the dominant axis' face.
vec2 cubeUV(vec3 v, out float face) {
  vec3 a = abs(v);
  if (a.x >= a.y && a.x >= a.z) {
    face = v.x >= 0.0 ? 0.0 : 1.0;
    return v.yz / a.x;
  }
  if (a.y >= a.z) {
    face = v.y >= 0.0 ? 2.0 : 3.0;
    return v.zx / a.y;
  }
  face = v.z >= 0.0 ? 4.0 : 5.0;
  return v.xy / a.z;
}

// Grid position (cells) of a direction on a star layer of N x N cells per
// face, equal-angle warped (cell areas within about 30 percent of each other).
// m = metric: angle^2 = m.x dx^2 + 2 m.y dx dy + m.z dy^2 for a grid offset.
vec2 starGrid(vec3 c, mat3 R, float N, out vec3 m, out float face) {
  vec3 v = R * c;
  vec2 uv = cubeUV(v, face);
  vec2 st = atan(uv) * (4.0 / SKY_PI);
  vec2 J = (SKY_PI / 4.0) * (1.0 + uv * uv) * (2.0 / N);
  float r2 = 1.0 + dot(uv, uv);
  float ir4 = 1.0 / (r2 * r2);
  m = vec3((1.0 + uv.y * uv.y) * J.x * J.x, -uv.x * uv.y * J.x * J.y, (1.0 + uv.x * uv.x) * J.y * J.y) * ir4;
  return (st * 0.5 + 0.5) * N;
}

// One star from its cell hash. L: x = flux scale, y = flux exponent (higher:
// more faint stars), z = size (CSS px, gaussian sigma), w = twinkle amount.
vec3 starPoint(uvec3 h, vec2 cell, vec2 g, vec3 m, float invPx2, float jit, float occ, vec4 L) {
  float pres = float(h.x >> 16u) * (1.0 / 65536.0);
  float on = clamp((occ - pres) * 16.0, 0.0, 1.0);
  if (on <= 0.0) return vec3(0.0);
  vec2 rp = vec2(float(h.x & 65535u), float(h.y >> 16u)) * (1.0 / 65536.0);
  vec2 dg = cell + 0.5 + jit * (2.0 * rp - 1.0) - g;
  float d2 = (m.x * dg.x * dg.x + 2.0 * m.y * dg.x * dg.y + m.z * dg.y * dg.y) * invPx2;
  float br = float(h.y & 65535u) * (1.0 / 65536.0);
  float tmp = float(h.z >> 16u) * (1.0 / 65536.0);
  float tw = float(h.z & 65535u) * (1.0 / 65536.0);
  float rel = 0.06 + 0.94 * pow(br, L.y);
  float s = L.z * uDpr * (0.85 + 0.5 * rel);
  float s2 = s * s + 0.083; // + pixel footprint variance: no shimmer at sub-pixel sizes
  float v = exp(-0.5 * d2 / s2);
  vec3 tc = mix(STAR_BLUE, STAR_WHITE, smoothstep(0.0, 0.55, tmp));
  tc = mix(tc, STAR_WARM, smoothstep(0.7, 1.0, tmp));
  float twinkle = 1.0 + L.w * sin(uTime * (1.3 + 2.6 * tw) + tw * SKY_TAU);
  return tc * (L.x * rel * v * on * twinkle);
}

// Dense layer: searches the 2x2 cells nearest the pixel, so a star may sit
// anywhere in its cell (needs 3 sigma < half a cell in pixels).
vec3 layerDense(vec3 c, mat3 R, float N, uint salt, float occ, vec4 L, float invPx2) {
  vec3 m;
  float face;
  vec2 g = starGrid(c, R, N, m, face);
  vec2 ci = floor(g);
  vec2 o = step(vec2(0.5), g - ci) - 1.0;
  uint fs = (uint(face) << 24u) ^ salt;
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 cell = ci + o + vec2(float(i), float(j));
      if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= N || cell.y >= N) continue;
      uvec3 h = pcg3d(uvec3(uint(cell.x), uint(cell.y), fs));
      acc += starPoint(h, cell, g, m, invPx2, 0.5, occ, L);
    }
  }
  return acc;
}

// Sparse layer: one cell, star kept 20 percent away from the cell edges.
vec3 layerSparse(vec3 c, mat3 R, float N, uint salt, float occ, vec4 L, float invPx2) {
  vec3 m;
  float face;
  vec2 g = starGrid(c, R, N, m, face);
  // clamp: rounding at a face edge must never give -1 (float to uint of a negative is undefined)
  vec2 cell = clamp(floor(g), vec2(0.0), vec2(N - 1.0));
  uint fs = (uint(face) << 24u) ^ salt;
  uvec3 h = pcg3d(uvec3(uint(cell.x), uint(cell.y), fs));
  return starPoint(h, cell, g, m, invPx2, 0.3, occ, L);
}

vec3 starField(vec3 c, float pxA, float dens, float trans) {
  float invPx2 = 1.0 / (pxA * pxA);
  uint salt = uint(uSalt);
  vec3 acc = vec3(0.0);
  // keep faint-star density per CSS pixel near the desktop value on wide views
  float kd = clamp(0.00105 / (pxA * uDpr), 0.6, 1.0);
  // dense faint layers sit behind the dust and crowd into the band
  acc += layerDense(c, STAR_R1, D1_N, salt + 11u, kd * (0.1 + 0.9 * dens), vec4(0.24 + 0.3 * dens, 2.6, 0.4, 0.0), invPx2) * trans;
#if TIER >= 2
  acc += layerDense(c, STAR_R2, 250.0, salt + 23u, kd * (0.07 + 0.5 * dens), vec4(0.32 + 0.3 * dens, 3.0, 0.45, 0.0), invPx2) * trans;
  // the band's grain: a crowd of barely resolved stars (band only)
  if (dens > 0.03) acc += layerDense(c, STAR_R3, D3_N, salt + 37u, kd * min(1.05 * dens, 0.95), vec4(0.3, 2.2, 0.36, 0.0), invPx2) * trans;
#endif
#if TIER >= 1
  acc += layerSparse(c, STAR_R4, 120.0, salt + 41u, 0.14 + 0.14 * dens, vec4(0.42, 3.5, 0.5, 0.1), invPx2) * mix(1.0, trans, 0.7);
#endif
  // bright layer: mostly foreground, barely dimmed by dust
  acc += layerSparse(c, STAR_R5, 40.0, salt + 53u, 0.18, vec4(1.0, 7.0, 0.62, 0.12), invPx2) * mix(1.0, trans, 0.4);
  return acc;
}

// The brightest handful, positioned in screen space by the CPU every frame
// (uHeroPos: fragment coords, visibility, core size in CSS px) so their
// four-point diffraction spikes stay screen-aligned and pixel-crisp.
vec3 heroStars(vec2 fc) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < HERO_N; i++) {
    vec4 P = uHeroPos[i];
    if (P.z < 0.5) continue;
    vec4 C = uHeroCol[i];
    vec2 dv = fc - P.xy;
    float len = 12.0 * uDpr * sqrt(C.a);
    float reach = 6.0 * len;
    if (abs(dv.x) > reach || abs(dv.y) > reach) continue;
    float sc = P.w * uDpr;
    float r2 = dot(dv, dv);
    float core = exp(-0.5 * r2 / (sc * sc + 0.083));
    float halo = 0.07 * exp(-sqrt(r2) / (5.0 * sc));
    float w2 = 0.2 * uDpr * uDpr + 0.083;
    vec2 a = abs(dv);
    float spikes = exp(-a.x / len) * exp(-0.5 * a.y * a.y / w2) + exp(-a.y / len) * exp(-0.5 * a.x * a.x / w2);
    acc += C.rgb * (C.a * (core + halo + 0.5 * spikes));
  }
  return acc;
}

// ---------------------------------------------------------- quiet zone

float quietMask(vec2 ndc) {
  if (uQuietK <= 0.0) return 0.0;
  vec2 ctr = 0.5 * (uQuiet.xy + uQuiet.zw);
  vec2 hs = 0.5 * abs(uQuiet.zw - uQuiet.xy);
  vec2 qd = (abs(ndc - ctr) - hs) * vec2(uAspect, 1.0);
  float dist = length(max(qd, 0.0)) + min(max(qd.x, qd.y), 0.0);
  return uQuietK * (1.0 - smoothstep(-0.04, 0.32, dist));
}

vec3 skyEncodeSrgb(vec3 c) {
  c = max(c, vec3(1e-7));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

// ---------------------------------------------------------------- main

void main() {
  vec3 d = normalize(vDir);
  // radians per device pixel (taken before any branching)
  float pxA = max(0.5 * (length(dFdx(d)) + length(dFdy(d))), 1e-6);
  vec3 c = uSkyRot * d;

  vec3 base = baseSky(d, c);

  vec3 feat = vec3(0.0);
  float trans = 1.0;
  float dens = 0.0;
  if (uGalaxy > 0.0) {
    vec3 gg;
    float tr;
    float de;
    galaxyField(c, pxA, gg, tr, de);
    feat = gg * uGalaxy;
    trans = mix(1.0, tr, min(uGalaxy, 1.0));
    dens = de * uGalaxy;
  }
  if (uNebula > 0.0) {
    float nt;
    vec3 nb = nebulaField(c, nt);
    float nTr = exp(-nt * uNebula);
    feat = feat * nTr + nb * uNebula;
    trans *= nTr;
  }
  vec3 aur = vec3(0.0);
  if (uAurora > 0.0 && d.y > 0.0) {
    aur = auroraField(d) * uAurora;
  }
  vec3 st = vec3(0.0);
  if (uStars > 0.0) {
    st = (starField(c, pxA, dens, trans) + heroStars(gl_FragCoord.xy)) * uStars;
  }
  if (uHorizon > 0.0) {
    // atmosphere: stars and galaxy fade into the horizon haze
    st *= mix(1.0, smoothstep(-0.02, 0.3, d.y), uHorizon);
    feat *= mix(1.0, 0.6 + 0.4 * smoothstep(-0.02, 0.2, d.y), uHorizon);
  }

  float q = quietMask(vNdc);
  if (q > 0.0) {
    feat = mix(feat, vec3(skyLum(feat)), 0.3 * q) * (1.0 - 0.78 * q);
    aur = mix(aur, vec3(skyLum(aur)), 0.3 * q) * (1.0 - 0.8 * q);
    st *= 1.0 - 0.85 * q;
    base *= 1.0 - 0.2 * q;
  }

  vec3 col = (base + feat + aur + st) * uExposure;
  // soft shoulder: nearly linear in the darks, never brighter than uPeak
  col = uPeak * (1.0 - exp(-col / uPeak));

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  // canvas output without an sRGB encode (host set a linear output): encode here
  if (uEncode > 0.5) gl_FragColor.rgb = skyEncodeSrgb(gl_FragColor.rgb);
  // triangular dither, one 8-bit step, in output space
  float dn = skyHash12(gl_FragCoord.xy) + skyHash12(gl_FragCoord.xy + 71.37) - 1.0;
  gl_FragColor.rgb += dn * (uDither / 255.0);
}
`;
}

// ------------------------------------------------------------ createSky

const DEFAULT_HERO_COLORS = ['#9fc0ff', '#fff1dc', '#c9d6ff', '#ffd6a8', '#eef0ff', '#b8c8ff'];
const DEFAULT_HERO_FLUX = [1.0, 0.72, 0.6, 0.5, 0.45, 0.4];

/**
 * createSky(options) -> sky handle. See README.md for the full API.
 * options: seed, tier (0..3), galaxy, aurora, nebula, stars (0..1),
 * exposure, horizon (0..1), peak (linear cap), renderOrder.
 */
export function createSky(options = {}) {
  const seed = (options.seed ?? 7) >>> 0;
  const rnd = mulberry32(seed * 2654435761 + 1);
  const rots = [0, 1, 2, 3, 4].map(() => randomRotation(rnd));

  const uniforms = {
    uGalaxy: { value: options.galaxy ?? 1 },
    uAurora: { value: options.aurora ?? 0 },
    uNebula: { value: options.nebula ?? 0 },
    uStars: { value: options.stars ?? 1 },
    uExposure: { value: options.exposure ?? 1 },
    uTime: { value: 0 },
    uHorizon: { value: options.horizon ?? 0 },
    uPeak: { value: options.peak ?? 0.82 },
    uDpr: { value: 1 },
    uDither: { value: 1 },
    uEncode: { value: 0 },
    uAspect: { value: 1 },
    uSalt: { value: Math.floor(rnd() * 16777215) },
    uSkyRot: { value: new THREE.Matrix3() },
    uSeedOff: { value: new THREE.Vector3(rnd() * 97, rnd() * 97, rnd() * 97) },
    uGalPole: { value: new THREE.Vector3(0, 0, 1) },
    uGalCore: { value: new THREE.Vector3(1, 0, 0) },
    uGalShape: { value: new THREE.Vector4(0.085, 0.75, 1, 1) },
    uNebCenter: { value: new THREE.Vector4(0, 0, -1, 0.2) },
    uNebT1: { value: new THREE.Vector4(1, 0, 0, Math.cos(0.44)) },
    uNebT2: { value: new THREE.Vector4(0, 1, 0, 0) },
    uAurFrame: { value: new THREE.Vector4(0, 1.4, 1.8, 1.35) },
    uAurShape: { value: new THREE.Vector4(1.0, 0.36, 0.28, rnd() * 6.283) },
    uQuiet: { value: new THREE.Vector4(-1, -1, 1, 1) },
    uQuietK: { value: 0 },
    uHeroPos: { value: Array.from({ length: HERO_N }, () => new THREE.Vector4(0, 0, 0, 1)) },
    uHeroCol: { value: Array.from({ length: HERO_N }, () => new THREE.Vector4(1, 1, 1, 0)) },
  };

  let tier = clampTier(options.tier ?? 2);
  const material = new THREE.ShaderMaterial({
    name: 'SkyMaterial',
    vertexShader: VERT,
    fragmentShader: fragmentSource(rots),
    uniforms,
    defines: { TIER: tier },
    depthTest: false,
    depthWrite: false,
    transparent: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = options.renderOrder ?? -1e6;

  // hero stars (celestial frame), default: seeded directions over the sphere
  const skyQuat = new THREE.Quaternion();
  const heroes = [];
  for (let i = 0; i < HERO_N; i++) {
    const z = rnd() * 2 - 1;
    const phi = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    heroes.push({ dir: new THREE.Vector3(r * Math.cos(phi), z, r * Math.sin(phi)), flux: DEFAULT_HERO_FLUX[i], color: DEFAULT_HERO_COLORS[i], size: 0.75 + 0.45 * DEFAULT_HERO_FLUX[i] });
  }
  const heroWorld = heroes.map(() => new THREE.Vector3());

  function syncHeroes() {
    for (let i = 0; i < HERO_N; i++) {
      const h = heroes[i];
      heroWorld[i].copy(h ? h.dir : new THREE.Vector3(0, 1, 0)).applyQuaternion(skyQuat);
      const col = uniforms.uHeroCol.value[i];
      if (!h || !(h.flux > 0)) {
        col.set(0, 0, 0, 0);
        continue;
      }
      const lin = hexToLinear(h.color || '#ffffff');
      col.set(lin[0], lin[1], lin[2], h.flux);
      uniforms.uHeroPos.value[i].w = h.size ?? 0.75 + 0.45 * h.flux;
    }
  }
  syncHeroes();

  const vp = new THREE.Vector4();
  const tmp = new THREE.Vector3();
  function projectHeroes(camera) {
    const e = camera.projectionMatrix.elements;
    const mi = camera.matrixWorldInverse.elements;
    const margin = 200 * uniforms.uDpr.value;
    for (let i = 0; i < HERO_N; i++) {
      const pos = uniforms.uHeroPos.value[i];
      if (!(uniforms.uHeroCol.value[i].w > 0)) {
        pos.z = 0;
        continue;
      }
      const w = heroWorld[i];
      tmp.set(mi[0] * w.x + mi[4] * w.y + mi[8] * w.z, mi[1] * w.x + mi[5] * w.y + mi[9] * w.z, mi[2] * w.x + mi[6] * w.y + mi[10] * w.z);
      if (tmp.z > -1e-4) {
        pos.z = 0;
        continue;
      }
      const nx = (e[0] * tmp.x + e[8] * tmp.z) / -tmp.z;
      const ny = (e[5] * tmp.y + e[9] * tmp.z) / -tmp.z;
      const px = vp.x + (nx * 0.5 + 0.5) * vp.z;
      const py = vp.y + (ny * 0.5 + 0.5) * vp.w;
      pos.x = px;
      pos.y = py;
      pos.z = px > vp.x - margin && px < vp.x + vp.z + margin && py > vp.y - margin && py < vp.y + vp.w + margin ? 1 : 0;
    }
  }

  // per-draw state: viewport, pixel ratio, output encoding, hero positions
  mesh.onBeforeRender = (renderer, scene, camera) => {
    renderer.getCurrentViewport(vp);
    const toCanvas = renderer.getRenderTarget() === null;
    uniforms.uDpr.value = renderer.getPixelRatio();
    uniforms.uAspect.value = vp.z / Math.max(1, vp.w);
    // encode only when three's output chunk did not (linear transfer); an
    // sRGB-transfer space other than SRGBColorSpace (Display P3) is already encoded
    uniforms.uEncode.value = toCanvas && THREE.ColorManagement.getTransfer(renderer.outputColorSpace) === THREE.LinearTransfer ? 1 : 0;
    uniforms.uDither.value = toCanvas ? 1 : 0;
    projectHeroes(camera);
  };

  const api = {
    object3D: mesh,
    material,
    uniforms,
    get tier() {
      return tier;
    },
    setGalaxy(v) {
      uniforms.uGalaxy.value = clamp01(v);
    },
    setAurora(v) {
      uniforms.uAurora.value = clamp01(v);
    },
    setNebula(v) {
      uniforms.uNebula.value = clamp01(v);
    },
    setStars(v) {
      uniforms.uStars.value = clamp01(v);
    },
    setExposure(x) {
      uniforms.uExposure.value = Math.max(0, Number(x) || 0);
    },
    setHorizon(v) {
      uniforms.uHorizon.value = clamp01(v);
    },
    setPeak(v) {
      uniforms.uPeak.value = Math.max(0.05, Number(v) || 0.82);
    },
    setTime(t) {
      uniforms.uTime.value = Number(t) || 0;
    },
    // rect: {x0, y0, x1, y1} or [x0, y0, x1, y1] in NDC (-1..1, y up); null clears.
    setQuietZone(rect, strength = 1) {
      if (!rect) {
        uniforms.uQuietK.value = 0;
        return;
      }
      const r = Array.isArray(rect) ? rect : [rect.x0, rect.y0, rect.x1, rect.y1];
      uniforms.uQuiet.value.set(Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3]));
      uniforms.uQuietK.value = clamp01(strength);
    },
    setTier(n) {
      if (!Number.isFinite(Number(n))) return; // ignore junk, keep the current tier
      const t = clampTier(n);
      if (t === tier) return;
      tier = t;
      material.defines.TIER = t;
      material.needsUpdate = true;
    },
    // Orientation of the celestial sphere (stars, galaxy, nebula, hero stars)
    // in the world: world = q * celestial. The aurora stays in the world frame.
    setSkyRotation(q) {
      skyQuat.copy(q || new THREE.Quaternion());
      const inv = skyQuat.clone().invert();
      uniforms.uSkyRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(inv));
      syncHeroes();
    },
    // pole: normal of the galactic plane; core: direction of the bright core
    // (projected into the plane). Celestial frame (= world without rotation).
    setGalaxyFrame(pole, core, shape = {}) {
      const p = pole.clone().normalize();
      const c = core.clone().addScaledVector(p, -core.dot(p));
      if (c.lengthSq() < 1e-8) c.set(1, 0, 0).addScaledVector(p, -p.x);
      c.normalize();
      uniforms.uGalPole.value.copy(p);
      uniforms.uGalCore.value.copy(c);
      const s = uniforms.uGalShape.value;
      if (shape.width != null) s.x = shape.width;
      if (shape.coreLength != null) s.y = shape.coreLength;
      if (shape.dust != null) s.w = shape.dust;
    },
    // dir: centre of the nebula; radius in radians; roll turns its shape.
    setNebulaFrame(dir, { radius = 0.2, roll = 0 } = {}) {
      const n = dir.clone().normalize();
      const ref = Math.abs(n.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const t1 = new THREE.Vector3().crossVectors(ref, n).normalize();
      const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
      const cr = Math.cos(roll);
      const sr = Math.sin(roll);
      const a = t1.clone().multiplyScalar(cr).addScaledVector(t2, sr);
      const b = t2.clone().multiplyScalar(cr).addScaledVector(t1, -sr);
      uniforms.uNebCenter.value.set(n.x, n.y, n.z, radius);
      uniforms.uNebT1.value.set(a.x, a.y, a.z, Math.cos(Math.min(2.2 * radius, 1.35)));
      uniforms.uNebT2.value.set(b.x, b.y, b.z, 0);
    },
    // Aurora, world frame (+Y up). azimuth: direction of the arc's nearest
    // point, radians from -Z toward +X. distance: ground distance to the front
    // curtain (100 km units). spacing: ratio between curtain distances. span:
    // half-angle of the arc. base: lower-edge altitude. decay: vertical
    // falloff. folds: fold amplitude. phase: shape seed.
    setAuroraFrame(o = {}) {
      const f = uniforms.uAurFrame.value;
      const s = uniforms.uAurShape.value;
      if (o.azimuth != null) f.x = o.azimuth;
      if (o.distance != null) f.y = o.distance;
      if (o.spacing != null) f.z = o.spacing;
      if (o.span != null) f.w = o.span;
      if (o.base != null) s.x = o.base;
      if (o.decay != null) s.y = o.decay;
      if (o.folds != null) s.z = o.folds;
      if (o.phase != null) s.w = o.phase;
    },
    // list of up to 6 {dir: Vector3 (celestial), flux 0..1, color: '#hex', size?: CSS px}
    setHeroStars(list) {
      for (let i = 0; i < HERO_N; i++) heroes[i] = list && list[i] ? { ...list[i], dir: list[i].dir.clone().normalize() } : null;
      syncHeroes();
    },
    dispose() {
      if (mesh.parent) mesh.parent.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
  return api;
}

function clamp01(v) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

function clampTier(n) {
  const t = Math.round(Number(n));
  return Number.isFinite(t) ? Math.min(3, Math.max(0, t)) : 2;
}

// exported for the Node preview / tests
export const __internal = { fragmentSource, VERT, HERO_N };
