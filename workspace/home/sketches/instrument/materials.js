// Engraving materials. Everything is drawn in the palette's ink on night:
//  - hatch lines whose width follows the light (N.L, cast shadows, and for
//    the desk frames a lamp with distance and cone falloff),
//  - in the darkest tone a cross-hatch of hairlines in the `line` tone,
//  - inverted-hull outlines and crease ribbons in ink,
//  - fog that fades every mark to the fill colour, and a 4x4 ordered dither.
//
// Fill and fog colour (uNight, uStage), shadow-side ink (uShade) and the
// accent are per shot: in the space frames the solids are a deep indigo
// (#0b0a14) that fully hides the sky behind them, and shadow-side lines lean
// slightly cool toward the sky. Flat faces marked `bare` (the dial, the
// recess floor) carry no hatching at all: a flat tone lifted a little where
// lit, the shadow hairline cross-hatch where shaded (run diagonally across
// the view), and whatever is engraved on them as ribbons.
//
// Hatch spacing is screen-space stable: the world spacing is a power of two
// picked per pixel from the screen gradient of the hatch coordinate so the
// on-screen period stays between S and 2S CSS px (S ~ 3.6) and never below
// it; the next octave fades in as lines crowd. Wherever a period would still
// fall under ~3 px (sphere engravings, graduations) the marks melt into
// their mean tone, and near silhouettes of curved parts hatching gives way to
// a flat tone inside the outline. Flat horizontal faces of the base use
// straight lines across the view instead of concentric rings, so no octave
// seams fan out round the disc (the moire seen in the first stills).
//
// Groups: each part of the world (instrument, plate drawing, desk set) owns
// its ink, outline and dissolve uniforms, so one frame can show a solid
// instrument beside a desk that has thinned to broken outlines.
//
// Macro (near surfaces). Screen-stable hatching keeps its period between S
// and 2S px however close the camera gets, so a surface that fills half the
// frame (the gear flanks in the 'inside' still) carried hundreds of evenly
// spaced lines in two directions: the hatch along the flank's height and,
// in shadow, the cross-hatch along its length, both laid on the mesh's own
// (height, arc length) parametrisation. That reads as a quad wireframe, not
// engraved metal. Where a surface is near (its footprint, world units per
// CSS px, falls under uMacro) the engraving gives way to machined metal:
// a clean tone ramp from the light, fine brushing streaks along the part
// (along the flank, round a turned part), an anisotropic sheen across the
// brushing, and the crease ribbons widen into lit chamfers of a fixed world
// width (bright where the bevel faces the key, dim in shadow). Far surfaces
// are unchanged.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

const v3 = (c) => new THREE.Vector3(c[0], c[1], c[2]);

export const shared = {
  uRes: { value: new THREE.Vector2(1, 1) },
  uDpr: { value: 1 },
  uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
  uKeyI: { value: 1 },
  uKeyPoint: { value: 0 },
  uKeyPos: { value: new THREE.Vector3(0, 5, 0) },
  uKeyRange: { value: 8 },
  uSpotDir: { value: new THREE.Vector3(0, -1, 0) },
  uSpotCos: { value: new THREE.Vector2(-2, -1) },
  uFillDir: { value: new THREE.Vector3(0, 1, 0) },
  uFillI: { value: 0 },
  uAmb: { value: 0 },
  uRim: { value: 0 },
  uShadowMap: { value: null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uShadowTexel: { value: 1 / 2048 },
  uShadowBias: { value: 0.001 },
  uShadowNormal: { value: 0.01 },
  uFogNear: { value: 50 },
  uFogFar: { value: 100 },
  uSpacing: { value: 3.6 },
  uRefDist: { value: 10 },
  uAcross: { value: new THREE.Vector2(0, 1) },
  uNight: { value: v3(PALETTE.night) },
  uStage: { value: v3(PALETTE.stage) },
  uInk: { value: v3(PALETTE.ink) },
  uMuted: { value: v3(PALETTE.muted) },
  uFaint: { value: v3(PALETTE.faint) },
  uLine: { value: v3(PALETTE.line) },
  uAccent: { value: v3(PALETTE.accent) },
  uShade: { value: v3(PALETTE.muted) },
  uBareLift: { value: 0.42 },
  // world units per CSS px at unit distance (perspective) or per CSS px
  // (orthographic, uFootOrtho = 1); see main.js
  uFootK: { value: 0.001 },
  uFootOrtho: { value: 0 },
  // footprint (world / CSS px) below which a surface is drawn as near
  // metal (x: fully near, y: fully engraved); negative = never
  uMacro: { value: new THREE.Vector2(-2, -1) },
  // world width of the chamfer on every crease, seen up close
  uBevelW: { value: 0.0015 },
  // brushing contrast on near metal
  uBrush: { value: 1 },
};

// Per-group uniforms (one object per group, shared by its materials).
export function makeGroup() {
  return {
    uInkScale: { value: 1 },
    uDarkScale: { value: 1 },
    uOutline: { value: 1 },
    uDrop: { value: 0 },
    uDropK: { value: 1.2 },
    uWidthK: { value: 1 },
  };
}

const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
`;

const COMMON = /* glsl */ `
uniform vec2 uRes;
uniform float uDpr;
uniform vec3 uKeyDir;
uniform float uKeyI;
uniform float uKeyPoint;
uniform vec3 uKeyPos;
uniform float uKeyRange;
uniform vec3 uSpotDir;
uniform vec2 uSpotCos;
uniform vec3 uFillDir;
uniform float uFillI;
uniform float uAmb;
uniform float uRim;
uniform sampler2D uShadowMap;
uniform float uShadowOn;
uniform float uShadowTexel;
uniform float uShadowBias;
uniform float uFogNear;
uniform float uFogFar;
uniform float uInkScale;
uniform float uDarkScale;
uniform float uSpacing;
uniform float uRefDist;
uniform vec2 uAcross;
uniform vec3 uNight;
uniform vec3 uStage;
uniform vec3 uInk;
uniform vec3 uMuted;
uniform vec3 uFaint;
uniform vec3 uLine;
uniform vec3 uAccent;
uniform vec3 uShade;
uniform float uFootK;
uniform float uFootOrtho;
uniform vec2 uMacro;
uniform float uBrush;

float bayer2(vec2 a) {
  a = mod(floor(a), 2.0);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}
vec3 dither(vec3 c) {
  return c + (bayer4(gl_FragCoord.xy) - 0.5) / 255.0;
}

// Coverage of a mark whose centre is d device px away, half width hw px.
// Widths under 1 px keep 1 px and fade. When marks crowd closer than about
// 3 CSS px the pattern melts into its mean tone instead of aliasing.
float markCov(float d, float spx, float hw) {
  float h = max(hw, 0.5);
  float c = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(hw * 2.0, 0.0, 1.0);
  float mean = clamp(2.0 * hw / max(spx, 1e-4), 0.0, 1.0);
  return mix(c, mean, 1.0 - smoothstep(2.4 * uDpr, 3.4 * uDpr, spx));
}

// Lines at multiples of s along u; g = |grad u| per device px. The width is
// nudged with the period so the octave bands keep a similar mean tone.
float lineSet(float u, float s, float g, float hw, float S) {
  float spx = s / max(g, 1e-9);
  float d = abs(fract(u / s + 0.5) - 0.5) * spx;
  float k = clamp(sqrt(spx / (1.5 * S)), 0.82, 1.22);
  return markCov(d, spx, hw * k);
}

// Screen-spaced hatching: on-screen period between S and 2S device px.
float hatchOct(float u, float g, float S, float hw) {
  // a coordinate that does not change across the pixel draws no lines
  if (g < 1e-8) return 0.0;
  float L = log2(max(S * g, 1e-12));
  float Li = floor(L);
  float f = L - Li;
  float s = exp2(Li + 1.0);
  return mix(lineSet(u, s, g, hw, S), lineSet(u, 2.0 * s, g, hw, S), smoothstep(0.5, 1.0, f));
}

float shadowAt(vec4 sc) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 c = sc.xyz / sc.w;
  if (sc.w <= 0.0 || c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 || c.z < 0.0) return 1.0;
  float z = c.z - uShadowBias;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    for (int j = 0; j < 4; j++) {
      vec2 o = (vec2(float(i), float(j)) - 1.5) * uShadowTexel;
      s += step(z, textureLod(uShadowMap, c.xy + o, 0.0).r);
    }
  }
  return s / 16.0;
}

float fogAt(float dist) {
  return smoothstep(uFogNear, uFogFar, dist);
}
`;

const SOLID_VERT = /* glsl */ `
attribute vec2 aHatch;
attribute vec2 aTick;
uniform mat4 uShadowMatrix;
uniform float uShadowNormal;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vObj;
varying vec2 vHatch;
varying vec2 vTick;
varying vec4 vSC;
varying float vDist;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * normal);
  vWPos = wp.xyz;
  vWNrm = wn;
  vObj = position;
  vHatch = aHatch;
  vTick = aTick;
  vSC = uShadowMatrix * vec4(wp.xyz + wn * uShadowNormal, 1.0);
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

// Shared lighting: returns the engraving tone in 0..1. With uKeyPoint the
// key is a lamp at uKeyPos with inverse-square-ish falloff and a cone.
const TONE = /* glsl */ `
uniform float uAlbedo;
uniform float uToneFloor;
uniform float uSpotFree;
float toneAt(vec3 N, vec3 V, vec4 sc, vec3 P) {
  vec3 L = uKeyDir;
  float att = 1.0;
  if (uKeyPoint > 0.5) {
    vec3 d = uKeyPos - P;
    float l = max(length(d), 1e-4);
    L = d / l;
    att = uKeyRange * uKeyRange / (uKeyRange * uKeyRange + l * l);
    float cone = smoothstep(uSpotCos.x, uSpotCos.y, dot(-L, uSpotDir));
    att *= mix(cone, 1.0, uSpotFree);
  }
  float ndl = dot(N, L);
  float sh = mix(shadowAt(sc), 1.0, uSpotFree);
  float key = max(ndl, 0.0) * sh * att;
  float fill = max(dot(N, uFillDir), 0.0);
  float nv = clamp(dot(N, V), 0.0, 1.0);
  float rim = pow(1.0 - nv, 3.0);
  float t = uKeyI * key + uFillI * fill + uAmb + uRim * rim * (1.0 - key);
  t = clamp(t * uAlbedo, 0.0, 1.0);
  return max(t, uToneFloor);
}
// Direction toward the key, and the key's own share of the light (lambert,
// shadow, lamp falloff), for the near-metal sheen.
vec3 keyDirAt(vec3 P) {
  return uKeyPoint > 0.5 ? normalize(uKeyPos - P) : uKeyDir;
}
float keyAt(vec3 N, vec4 sc, vec3 P) {
  vec3 L = uKeyDir;
  float att = 1.0;
  if (uKeyPoint > 0.5) {
    vec3 d = uKeyPos - P;
    float l = max(length(d), 1e-4);
    L = d / l;
    att = uKeyRange * uKeyRange / (uKeyRange * uKeyRange + l * l);
    att *= mix(smoothstep(uSpotCos.x, uSpotCos.y, dot(-L, uSpotDir)), 1.0, uSpotFree);
  }
  return uKeyI * max(dot(N, L), 0.0) * mix(shadowAt(sc), 1.0, uSpotFree) * att;
}
`;

const SOLID_FRAG = /* glsl */ `
${COMMON}
${TONE}
uniform float uAccentOn;
uniform float uTicks;
uniform float uHW;
uniform float uGround;
uniform float uPlanar;
uniform float uPaper;
uniform float uBare;
uniform float uBareLift;
uniform vec2 uGroundDir;
uniform vec2 uFadeC;
uniform vec2 uFadeR;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vObj;
varying vec2 vHatch;
varying vec2 vTick;
varying vec4 vSC;
varying float vDist;

float tickMark(float u, float g, float t, float gt, float len, float hw) {
  float spx = 1.0 / max(g, 1e-9);
  float d = abs(fract(u + 0.5) - 0.5) * spx;
  float h = max(hw, 0.5);
  float c = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(hw * 2.0, 0.0, 1.0);
  float m = clamp((len - t) / gt + 0.5, 0.0, 1.0);
  return c * m * smoothstep(3.0 * uDpr, 5.0 * uDpr, spx);
}

${NOISE}

// Near metal (see the header). Called in non-uniform control flow, so every
// derivative it needs comes in from main(): dpx/dpy (world position) and
// dhx/dhy (the raw engraving coordinates) per device px.
vec3 nearMetal(vec3 N, vec3 V, float tone, float foot, vec3 dpx, vec3 dpy, vec2 dhx, vec2 dhy) {
  // surface gradients of the two engraving coordinates, world^-1
  vec3 nf = cross(dpx, dpy);
  float det = max(dot(nf, nf), 1e-36);
  vec3 r1 = cross(dpy, nf);
  vec3 r2 = cross(nf, dpx);
  vec3 Gu = (dhx.x * r1 + dhx.y * r2) / det;
  vec3 Gv = (dhy.x * r1 + dhy.y * r2) / det;
  // brushing streaks follow the level sets of a coordinate in world units
  // (height on a flank, radius on a face, profile length on a turned
  // part); an angle count (a lathe meridian, ~512 per turn) is the other
  bool swap = length(Gu) > 6.0;
  float ca = swap ? vHatch.y : vHatch.x;
  float cb = swap ? vHatch.x : vHatch.y;
  vec3 Ga = swap ? Gv : Gu;
  vec3 Gb = swap ? Gu : Gv;
  float la = max(length(Ga), 1e-6);
  float lb = max(length(Gb), 1e-6);
  float a = ca / la;
  float b = cb / lb;
  // across-the-streak world units per device px, for anti-aliasing
  float ga = max(length(swap ? dhy : dhx) / la, 1e-9);
  vec3 T = Gb - N * dot(Gb, N);
  T = dot(T, T) > 1e-12 ? normalize(T) : normalize(cross(N, vec3(0.31, 0.9, 0.29)));

  // two octaves of streaks, each fading out before it would alias
  float pa = 0.0009;
  float pl = 0.05;
  float n1 = vnoise(vec3(a / pa, b / pl, 3.1));
  float n2 = vnoise(vec3(a / (pa * 0.37) + 17.0, b / (pl * 0.55), 7.7));
  float f1 = smoothstep(1.3, 3.2, pa / ga);
  float f2 = smoothstep(1.3, 3.2, pa * 0.37 / ga);
  float br = ((n1 - 0.5) * f1 * 1.3 + (n2 - 0.5) * f2 * 0.7) * uBrush;

  // clean tone: stage in shadow, a dark gunmetal where lit
  vec3 lo = mix(uStage, mix(uNight, uLine, 0.7), smoothstep(0.0, 0.3, tone));
  vec3 metal = mix(lo, mix(uLine, uMuted, 0.3), smoothstep(0.25, 1.0, tone));
  metal *= 1.0 + 0.16 * br;

  // anisotropic sheen across the brushing: a narrow one from the key, a
  // broad one from the fill, both carrying the streaks; a soft lobe too
  float k = keyAt(N, vSC, vWPos);
  vec3 Lk = keyDirAt(vWPos);
  vec3 Hk = normalize(Lk + V);
  float tk = dot(T, Hk);
  float sk = pow(sqrt(max(1.0 - tk * tk, 0.0)), 72.0) * k;
  vec3 Hf = normalize(uFillDir + V);
  float tf = dot(T, Hf);
  float sf = pow(sqrt(max(1.0 - tf * tf, 0.0)), 20.0) * uFillI * max(dot(N, uFillDir), 0.0);
  float lobe = pow(max(dot(N, Hk), 0.0), 20.0) * k;
  float streak = clamp(1.0 + 0.9 * br, 0.2, 1.9);
  metal += uInk * ((0.3 * sk + 0.55 * sf) * streak + 0.1 * lobe);
  if (uAccentOn > 0.5) metal = mix(metal, uAccent * (0.3 + 0.7 * smoothstep(0.1, 0.9, tone)), 0.85);
  return metal;
}

void main() {
  vec3 N = normalize(vWNrm);
  vec3 V = normalize(cameraPosition - vWPos);
  float tone = toneAt(N, V, vSC, vWPos);

  // near metal: its derivatives, taken here in uniform control flow
  vec3 dpx = dFdx(vWPos);
  vec3 dpy = dFdy(vWPos);
  vec2 dhx = vec2(dFdx(vHatch.x), dFdy(vHatch.x));
  vec2 dhy = vec2(dFdx(vHatch.y), dFdy(vHatch.y));
  float foot = uFootK * mix(vDist, 1.0, uFootOrtho);
  float macro = (1.0 - smoothstep(uMacro.x, uMacro.y, foot)) * (1.0 - uPaper) * (1.0 - uGround);

  vec2 h = vHatch;
  // world-plane hatch only on faces that lie in the plane; walls of the
  // same solid keep their own coordinates
  bool flatFace = uPlanar > 0.5 && abs(N.y) > 0.985;
  bool bareFace = uBare > 0.5 && abs(N.y) > 0.985;
  bool planar = (uGround > 0.5 && abs(N.y) > 0.5) || flatFace || bareFace;
  if (planar) {
    vec2 gd = uGround > 0.5 ? uGroundDir : uAcross;
    // bare faces only show hairlines in shadow; turn them 35 deg off the
    // view so they never read as horizontal scan lines
    if (bareFace) gd = vec2(gd.x * 0.819 - gd.y * 0.574, gd.x * 0.574 + gd.y * 0.819);
    h = vec2(dot(vWPos.xz, gd), dot(vWPos.xz, vec2(-gd.y, gd.x)));
  }
  float gu = length(vec2(dFdx(h.x), dFdy(h.x)));
  float gv = length(vec2(dFdx(h.y), dFdy(h.y)));
  float ga = length(vec2(dFdx(vTick.x), dFdy(vTick.x)));
  float gt = max(length(vec2(dFdx(vTick.y), dFdy(vTick.y))), 1e-6);

  float S = uSpacing * uDpr;
  float wmod = clamp(uRefDist / max(vDist, 1e-3), 0.7, 1.35);
  float hw = uHW * uDpr * wmod * smoothstep(0.1, 0.95, tone);
  float cu = bareFace ? 0.0 : hatchOct(h.x, gu, S, hw);
  float dark = (1.0 - smoothstep(0.03, 0.24, tone)) * uDarkScale;
  float hd = 0.5 * uDpr;
  float cd = max(hatchOct(h.x, gu, S, hd), hatchOct(h.y, gv, S, hd)) * dark;

  // near the silhouette of a curved part the hatch octaves stack up; let the
  // engraving give way to its flat mean tone there (the outline carries it)
  if (!planar) {
    float nv = clamp(dot(N, V), 0.0, 1.0);
    float graze = smoothstep(0.06, 0.3, nv);
    float meanU = clamp(2.0 * hw / (1.5 * S), 0.0, 1.0) * 0.75;
    cu = mix(meanU, cu, graze);
    cd *= graze;
  }

  vec3 fillCol = mix(uStage, uNight, smoothstep(0.0, 0.3, tone));
  // a bare face reads as a surface by a flat lift where lit (no gradient:
  // the tone is constant across a flat face under the key)
  if (bareFace) fillCol = mix(fillCol, uLine, uBareLift * smoothstep(0.3, 1.0, tone));
  vec3 inkCol = mix(uShade, uInk, smoothstep(0.35, 0.9, tone));
  if (uAccentOn > 0.5) inkCol = uAccent;
  float fade = 1.0;
  if (uGround > 0.5) {
    float r = length(vWPos.xz - uFadeC);
    fade = 1.0 - smoothstep(uFadeR.x, uFadeR.y, r);
    fillCol = mix(uNight, fillCol, fade);
    inkCol = mix(uFaint, uMuted, smoothstep(0.3, 0.9, tone));
  }
  // paper is drawn only by its outline and what is printed on it; its
  // shadows keep the hairline cross-hatch
  float inkK = uInkScale * (1.0 - uPaper);
  vec3 col = fillCol;
  col = mix(col, uLine, cd * 0.9 * fade);
  col = mix(col, inkCol, cu * inkK * fade);
  // near surfaces: clean machined metal instead of a wall of hatch lines
  if (macro > 0.001) col = mix(col, nearMetal(N, V, tone, foot, dpx, dpy, dhx, dhy), macro);

  if (uTicks > 0.5 && vTick.y >= 0.0) {
    float t = vTick.y;
    float a = vTick.x;
    float hwT = 0.5 * uDpr * wmod;
    float c = tickMark(a * 12.0, ga * 12.0, t, gt, 0.62, hwT * 1.3);
    c = max(c, tickMark(a * 36.0, ga * 36.0, t, gt, 0.42, hwT));
    c = max(c, tickMark(a * 180.0, ga * 180.0, t, gt, 0.24, hwT * 0.85));
    float dl = abs(t - 0.7) / gt;
    c = max(c, clamp(hwT * 0.8 + 0.5 - dl, 0.0, 1.0) * 0.8);
    float vis = 0.3 + 0.7 * smoothstep(0.04, 0.45, tone);
    vec3 tc = mix(uFaint, uInk, smoothstep(0.05, 0.6, tone));
    if (uAccentOn > 0.5) tc = uAccent;
    col = mix(col, tc, c * uInkScale * vis);
  }

  col = mix(col, uNight, fogAt(vDist));
  gl_FragColor = vec4(dither(col), 1.0);
}
`;

// Seven engraving laws for the seven spheres. p is the unit-sphere point in
// the sphere's own frame. Each law yields the distance to its nearest mark
// (device px) and the local mark spacing.
const SPHERE_FRAG = /* glsl */ `
${COMMON}
${TONE}
uniform int uPattern;
uniform float uPatN;
uniform float uSeed;
uniform float uHW;
uniform float uAccentOn;
uniform vec3 uAccentP;
uniform float uAccentLevel;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vObj;
varying vec2 vHatch;
varying vec2 vTick;
varying vec4 vSC;
varying float vDist;

const float PI = 3.14159265359;

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float gnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(hash33(i + vec3(0.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3(0.0, 0.0, 0.0));
  float n100 = dot(hash33(i + vec3(1.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(hash33(i + vec3(0.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(hash33(i + vec3(1.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(hash33(i + vec3(0.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(hash33(i + vec3(1.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(hash33(i + vec3(0.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(hash33(i + vec3(1.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float field(vec3 p) {
  vec3 q = p * 1.35 + vec3(uSeed * 1.7, uSeed * 0.3, -uSeed);
  return gnoise(q) + 0.5 * gnoise(q * 2.03 + 11.0) + 0.22 * gnoise(q * 4.1 - 7.0);
}

vec2 lineFam(float u, float gu) {
  float spx = 1.0 / max(gu, 1e-9);
  return vec2(abs(fract(u + 0.5) - 0.5) * spx, spx);
}

void main() {
  vec3 N = normalize(vWNrm);
  vec3 V = normalize(cameraPosition - vWPos);
  float tone = toneAt(N, V, vSC, vWPos);

  vec3 p = normalize(vObj);
  vec3 dpx = dFdx(p);
  vec3 dpy = dFdy(p);
  float gp = max(max(length(dpx), length(dpy)), 1e-7);
  float rxz0 = length(p.xz);
  float rxz = max(rxz0, 1e-5);
  float theta = atan(rxz, p.y);
  vec2 pxz = rxz0 > 1e-6 ? p.xz : vec2(1.0, 0.0);
  float phi = atan(pxz.y, pxz.x);
  float rr = p.x * p.x + p.z * p.z + 1e-9;
  vec2 dphi = vec2(p.x * dpx.z - p.z * dpx.x, p.x * dpy.z - p.z * dpy.x) / rr;
  vec2 dtheta = vec2(dFdx(theta), dFdy(theta));

  float wmod = clamp(uRefDist / max(vDist, 1e-3), 0.7, 1.35);
  float lit = smoothstep(0.1, 0.95, tone);
  float hw = uHW * uDpr * wmod * lit;
  float hd = 0.5 * uDpr;
  float n = uPatN;

  float cInk = 0.0;
  float cHair = 0.0;
  float cAcc = 0.0;

  float levels = max(floor(n * 0.18), 4.0);
  float fu = (field(p) + 1.2) * levels;
  vec2 dfu = vec2(dFdx(fu), dFdy(fu));

  if (uPattern == 0) {
    float u = theta / PI * n;
    vec2 L = lineFam(u, length(dtheta) * n / PI);
    cInk = markCov(L.x, L.y, hw);
    cHair = markCov(L.x, L.y, hd);
  } else if (uPattern == 1) {
    float K = max(floor(n * 0.7 + 0.5), 5.0);
    float y = clamp(p.y, -0.9995, 0.9995);
    float merc = 0.5 * log((1.0 + y) / (1.0 - y));
    vec2 dm = vec2(dpx.y, dpy.y) / (1.0 - y * y);
    float c = 0.55;
    float u = K * (phi / (2.0 * PI) + c * merc);
    vec2 du = K * (dphi / (2.0 * PI) + c * dm);
    vec2 L = lineFam(u, length(du));
    cInk = markCov(L.x, L.y, hw);
    cHair = markCov(L.x, L.y, hd);
  } else if (uPattern == 2) {
    float M = max(n * 0.5, 4.0);
    vec3 q = p * M;
    vec3 ci = floor(q);
    float best = 1e9;
    for (int x = -1; x <= 1; x++) {
      for (int yy = -1; yy <= 1; yy++) {
        for (int z = -1; z <= 1; z++) {
          vec3 cell = ci + vec3(float(x), float(yy), float(z));
          vec3 pt = cell + 0.12 + 0.76 * hash33(cell + uSeed * 17.0);
          vec3 ps = normalize(pt) * M;
          if (all(greaterThanEqual(ps, cell)) && all(lessThan(ps, cell + 1.0))) {
            best = min(best, length(q - ps));
          }
        }
      }
    }
    float spx = 1.0 / (M * gp);
    float d = best * spx;
    float rad = spx * 0.36 * sqrt(lit);
    float h = max(rad, 0.55);
    cInk = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(rad * 1.8, 0.0, 1.0);
    cInk = mix(cInk, clamp(1.4 * rad * rad / (spx * spx), 0.0, 1.0), (1.0 - smoothstep(2.4 * uDpr, 3.6 * uDpr, spx)));
    cHair = clamp(0.55 + 0.5 - d, 0.0, 1.0) * smoothstep(2.4 * uDpr, 3.6 * uDpr, spx);
  } else if (uPattern == 3) {
    vec2 L = lineFam(fu, length(dfu));
    float idx = floor(fu + 0.5);
    float major = 1.0 - step(0.5, abs(mod(idx, 5.0)));
    cInk = markCov(L.x, L.y, hw * mix(1.0, 1.7, major));
    cHair = markCov(L.x, L.y, hd);
    if (uAccentLevel > 0.5) {
      float al = floor((field(normalize(uAccentP)) + 1.2) * levels + 0.5);
      float isAcc = 1.0 - step(0.5, abs(idx - al));
      cAcc = markCov(L.x, L.y, max(hw, 0.6 * uDpr) * 1.7 + 0.35 * uDpr) * isAcc;
    }
  } else if (uPattern == 4) {
    vec3 A = normalize(vec3(0.82, 0.35, 0.45));
    vec3 Bv = normalize(cross(A, vec3(0.0, 1.0, 0.0)));
    float u = dot(p, A) * n * 0.4;
    float v = dot(p, Bv) * n * 0.4;
    vec2 Lu = lineFam(u, length(vec2(dFdx(u), dFdy(u))));
    vec2 Lv = lineFam(v, length(vec2(dFdx(v), dFdy(v))));
    cInk = markCov(Lu.x, Lu.y, hw);
    cHair = max(markCov(Lu.x, Lu.y, hd), markCov(Lv.x, Lv.y, hd));
  } else if (uPattern == 5) {
    float Mm = max(floor(n * 0.4 + 0.5) * 2.0, 8.0);
    float Mp = max(floor(n * 0.4 + 0.5), 4.0);
    float um = (phi / (2.0 * PI) + 0.5) * Mm;
    float up = theta / PI * Mp;
    vec2 Lm = lineFam(um, length(dphi) * Mm / (2.0 * PI));
    vec2 Lp = lineFam(up, length(dtheta) * Mp / PI);
    float eq = 1.0 - step(0.5, abs(floor(up + 0.5) - Mp * 0.5));
    cInk = max(markCov(Lm.x, Lm.y, hw), markCov(Lp.x, Lp.y, hw * mix(1.0, 1.8, eq)));
    cHair = max(markCov(Lm.x, Lm.y, hd), markCov(Lp.x, Lp.y, hd));
  } else {
    float Nd = max(floor(n * 0.55), 5.0);
    float k = floor(theta / PI * Nd);
    float thk = (k + 0.5) * PI / Nd;
    float m = max(floor(2.0 * Nd * sin(thk) + 0.5), 1.0);
    float p01 = phi / (2.0 * PI) + 0.5 + mod(k, 2.0) * 0.5 / m;
    float j = floor(p01 * m);
    float dphiC = (p01 - (j + 0.5) / m) * 2.0 * PI;
    float dist = sqrt((theta - thk) * (theta - thk) + sin(theta) * sin(theta) * dphiC * dphiC);
    float spx = (PI / Nd) / gp;
    float d = dist / gp;
    float rad = spx * 0.4 * sqrt(lit);
    float h = max(rad, 0.55);
    cInk = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(rad * 1.8, 0.0, 1.0);
    cInk = mix(cInk, clamp(0.5 * rad * rad / (spx * spx), 0.0, 1.0), (1.0 - smoothstep(2.4 * uDpr, 3.6 * uDpr, spx)));
    cHair = clamp(0.6 + 0.5 - d, 0.0, 1.0) * smoothstep(2.4 * uDpr, 3.6 * uDpr, spx);
  }

  float dark = (1.0 - smoothstep(0.04, 0.3, tone)) * uDarkScale;
  vec3 fillCol = mix(uStage, uNight, smoothstep(0.0, 0.3, tone));
  vec3 inkCol = mix(uShade, uInk, smoothstep(0.35, 0.9, tone));
  vec3 col = fillCol;
  col = mix(col, uLine, cHair * dark);
  col = mix(col, inkCol, cInk * uInkScale);
  col = mix(col, uAccent, cAcc);
  col = mix(col, uNight, fogAt(vDist));
  gl_FragColor = vec4(dither(col), 1.0);
}
`;

const HULL_VERT = /* glsl */ `
attribute vec3 aOnormal;
uniform vec2 uRes;
uniform float uDpr;
uniform float uWidth;
uniform float uWidthK;
uniform float uRefDist;
varying float vDist;
varying vec3 vWP;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vWP = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 n = normalize(normalMatrix * aOnormal);
  vDist = length(mv.xyz);
  vec4 c0 = projectionMatrix * mv;
  vec4 c1 = projectionMatrix * vec4(mv.xyz + n * (0.01 * max(-mv.z, 0.01)), 1.0);
  vec2 s0 = c0.xy / c0.w;
  vec2 s1 = c1.xy / c1.w;
  vec2 dpx = (s1 - s0) * uRes;
  float l = length(dpx);
  vec2 dir = l > 1e-6 ? dpx / l : vec2(0.0);
  float w = uWidth * uWidthK * uDpr * clamp(uRefDist / max(vDist, 1e-3), 0.6, 1.4);
  c0.xy += dir * w * 2.0 / uRes * c0.w;
  gl_Position = c0;
}
`;

const HULL_FRAG = /* glsl */ `
uniform vec3 uNight;
uniform vec3 uInk;
uniform vec3 uMuted;
uniform vec3 uAccent;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOutline;
uniform float uTone;
uniform float uAccentOn;
uniform float uDrop;
uniform float uDropK;
varying float vDist;
varying vec3 vWP;
${NOISE}
float bayer2(vec2 a) { a = mod(floor(a), 2.0); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  if (uDrop > 0.0 && vnoise(vWP * uDropK) < uDrop) discard;
  vec3 c = mix(uMuted, uInk, uTone);
  float k = uOutline;
  if (uAccentOn > 0.5) { c = uAccent; k = 1.0; }
  c = mix(uNight, c, k);
  c = mix(c, uNight, smoothstep(uFogNear, uFogFar, vDist));
  c += (bayer4(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

// Crease and drawn ribbons: one instanced quad per segment, expanded in
// screen space, culled when both adjacent faces look away. A dissolving
// group drops whole runs of segments where a smooth world noise is low.
const LINE_VERT = /* glsl */ `
attribute vec3 iA;
attribute vec3 iB;
attribute vec3 iNA;
attribute vec3 iNB;
attribute vec4 iP;
uniform vec2 uRes;
uniform float uDpr;
uniform float uRefDist;
uniform float uNear;
uniform float uBias;
uniform float uDrop;
uniform float uDropK;
uniform float uWidthK;
uniform float uFootK;
uniform float uFootOrtho;
uniform vec2 uMacro;
uniform float uBevelW;
uniform vec3 uKeyDir;
uniform float uKeyPoint;
uniform vec3 uKeyPos;
uniform float uKeyI;
uniform vec3 uFillDir;
uniform float uFillI;
uniform float uAmb;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform float uShadowTexel;
uniform float uShadowBias;
uniform float uShadowNormal;
varying float vDist;
varying float vTone;
varying float vAcc;
varying float vFadeW;
varying float vBevel;
varying float vLit;
varying float vAcross;
${NOISE}
float shadowV(vec4 sc) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 c = sc.xyz / sc.w;
  if (sc.w <= 0.0 || any(lessThan(c, vec3(0.0))) || any(greaterThan(c, vec3(1.0)))) return 1.0;
  float z = c.z - uShadowBias;
  float s = 0.0;
  for (int i = 0; i < 2; i++) {
    for (int j = 0; j < 2; j++) {
      vec2 o = (vec2(float(i), float(j)) - 0.5) * 1.5 * uShadowTexel;
      s += step(z, textureLod(uShadowMap, c.xy + o, 0.0).r);
    }
  }
  return s * 0.25;
}
void main() {
  vTone = iP.y;
  vAcc = iP.z;
  vBevel = 0.0;
  vLit = 0.0;
  vAcross = position.y;
  // segments are stored in the mesh's frame (world, unless the mesh moves)
  vec3 wa = (modelMatrix * vec4(iA, 1.0)).xyz;
  vec3 wb = (modelMatrix * vec4(iB, 1.0)).xyz;
  vec3 na = mat3(modelMatrix) * iNA;
  vec3 nb = mat3(modelMatrix) * iNB;
  vec3 mid = 0.5 * (wa + wb);
  vec3 toCam = normalize(cameraPosition - mid);
  bool cull = max(dot(na, toCam), dot(nb, toCam)) < -0.03;
  if (uDrop > 0.0 && iP.z < 0.5 && vnoise(mid * uDropK) < uDrop) cull = true;
  if (cull) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vDist = 0.0; vFadeW = 0.0;
    return;
  }
  vec4 va = viewMatrix * vec4(wa, 1.0);
  vec4 vb = viewMatrix * vec4(wb, 1.0);
  float zn = -uNear * 1.05;
  if (va.z > zn && vb.z > zn) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vDist = 0.0; vFadeW = 0.0;
    return;
  }
  if (va.z > zn) va = mix(va, vb, (zn - va.z) / (vb.z - va.z));
  if (vb.z > zn) vb = mix(vb, va, (zn - vb.z) / (va.z - vb.z));
  float t = position.x;
  vec4 vp = mix(va, vb, t);
  vDist = length(vp.xyz);
  vec4 ca = projectionMatrix * va;
  vec4 cb = projectionMatrix * vb;
  vec2 sa = ca.xy / ca.w * uRes * 0.5;
  vec2 sb = cb.xy / cb.w * uRes * 0.5;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float wWant = iP.x * uWidthK * uDpr * clamp(uRefDist / max(vDist, 1e-3), 0.55, 1.45);
  // Up close a crease is a chamfer of fixed world width, lit as a surface
  // of its own (the bisector of its two faces): bright where it faces the
  // key or glints toward the eye, dim in shadow. Printed lines (one normal
  // for both sides) and always-facing lines stay as drawn.
  bool crease = length(na) > 0.5 && length(nb) > 0.5 && dot(na, nb) < 0.985;
  float foot = uFootK * mix(vDist, 1.0, uFootOrtho);
  float nearK = 1.0 - smoothstep(uMacro.x, uMacro.y, foot);
  if (crease && nearK > 0.001) {
    vBevel = nearK;
    vec3 bn = normalize(na + nb);
    vec3 P = mix(wa, wb, t);
    vec3 L = uKeyPoint > 0.5 ? normalize(uKeyPos - P) : uKeyDir;
    float sh = shadowV(uShadowMatrix * vec4(P + bn * uShadowNormal, 1.0));
    vec3 Vv = normalize(cameraPosition - P);
    // a small polished face: a broad glint wherever the half vector comes
    // near its normal (a backlit edge catches the key toward the eye), a
    // little of the fill, and a floor so no edge drops out entirely
    float glint = pow(max(dot(bn, normalize(L + Vv)), 0.0), 4.0);
    vLit = clamp(uKeyI * sh * (0.5 * max(dot(bn, L), 0.0) + 0.9 * glint) + 1.2 * uFillI * max(dot(bn, uFillDir), 0.0) + uAmb + 0.08, 0.0, 1.0);
    float wB = min(uBevelW / max(foot, 1e-7), 14.0) * uDpr;
    wWant = mix(wWant, max(wWant, wB), nearK);
  }
  float w = max(wWant, 1.0);
  vFadeW = clamp(wWant, 0.0, 1.0);
  float hw = 0.5 * w;
  vec4 c = projectionMatrix * vec4(vp.xyz * (1.0 - uBias), 1.0);
  vec2 off = nrm * position.y * hw + dir * (t * 2.0 - 1.0) * hw;
  c.xy += off * 2.0 / uRes * c.w;
  gl_Position = c;
}
`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uNight;
uniform vec3 uInk;
uniform vec3 uFaint;
uniform vec3 uLine;
uniform vec3 uAccent;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOutline;
varying float vDist;
varying float vTone;
varying float vAcc;
varying float vFadeW;
varying float vBevel;
varying float vLit;
varying float vAcross;
float bayer2(vec2 a) { a = mod(floor(a), 2.0); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  // tone >= 0: faint..ink; tone < 0: the dim hairline tones line..faint
  vec3 c = vTone < 0.0 ? mix(uLine, uFaint, -vTone) : mix(uFaint, uInk, vTone);
  float k = uOutline;
  if (vBevel > 0.0) {
    // a lit chamfer, a touch brighter along its crown
    vec3 bev = mix(mix(uLine, uFaint, 0.2) * 0.7, uInk, smoothstep(0.04, 0.8, vLit));
    bev *= 0.8 + 0.2 * (1.0 - abs(vAcross));
    c = mix(c, bev, vBevel);
  }
  if (vAcc > 0.5) { c = uAccent; k = 1.0; }
  c = mix(uNight, c, k * vFadeW);
  c = mix(c, uNight, smoothstep(uFogNear, uFogFar, vDist));
  c += (bayer4(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

const DEPTH_VERT = /* glsl */ `
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const DEPTH_FRAG = /* glsl */ `
void main() { gl_FragColor = vec4(1.0); }
`;

function pick(names) {
  const out = {};
  for (const k of names) out[k] = shared[k];
  return out;
}

const SOLID_SHARED = Object.keys(shared);
const DEFAULT_GROUP = makeGroup();

function groupU(g, names) {
  const G = g || DEFAULT_GROUP;
  const out = {};
  for (const k of names) out[k] = G[k];
  return out;
}

export function solidMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    name: 'engrave',
    uniforms: {
      ...pick(SOLID_SHARED),
      ...groupU(o.group, ['uInkScale', 'uDarkScale']),
      uAlbedo: { value: o.albedo ?? 1 },
      uToneFloor: { value: o.toneFloor ?? 0 },
      uSpotFree: { value: o.spotFree ? 1 : 0 },
      uAccentOn: { value: o.accent ? 1 : 0 },
      uTicks: { value: o.ticks ? 1 : 0 },
      uHW: { value: o.hw ?? 1.05 },
      uGround: { value: o.ground ? 1 : 0 },
      uPlanar: { value: o.planar ? 1 : 0 },
      uPaper: { value: o.paper ? 1 : 0 },
      uBare: { value: o.bare ? 1 : 0 },
      uGroundDir: { value: new THREE.Vector2(o.groundDir?.[0] ?? 1, o.groundDir?.[1] ?? 0) },
      uFadeC: { value: new THREE.Vector2(o.fadeC?.[0] ?? 0, o.fadeC?.[1] ?? 0) },
      uFadeR: { value: new THREE.Vector2(o.fadeR?.[0] ?? 400, o.fadeR?.[1] ?? 500) },
    },
    vertexShader: SOLID_VERT,
    fragmentShader: SOLID_FRAG,
  });
}

export function sphereMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    name: 'sphere',
    uniforms: {
      ...pick(SOLID_SHARED),
      ...groupU(o.group, ['uInkScale', 'uDarkScale']),
      uAlbedo: { value: o.albedo ?? 1 },
      uToneFloor: { value: 0 },
      uSpotFree: { value: 0 },
      uPattern: { value: o.pattern ?? 0 },
      uPatN: { value: o.n ?? 28 },
      uSeed: { value: o.seed ?? 0 },
      uHW: { value: o.hw ?? 1.05 },
      uAccentOn: { value: 0 },
      uAccentP: { value: new THREE.Vector3(0, 0, 1) },
      uAccentLevel: { value: 0 },
    },
    vertexShader: SOLID_VERT,
    fragmentShader: SPHERE_FRAG,
  });
}

export function hullMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    name: 'hull',
    uniforms: {
      ...pick(['uRes', 'uDpr', 'uRefDist', 'uNight', 'uInk', 'uMuted', 'uAccent', 'uFogNear', 'uFogFar']),
      ...groupU(o.group, ['uOutline', 'uDrop', 'uDropK', 'uWidthK']),
      uWidth: { value: o.width ?? 1.5 },
      uTone: { value: o.tone ?? 1 },
      uAccentOn: { value: o.accent ? 1 : 0 },
    },
    vertexShader: HULL_VERT,
    fragmentShader: HULL_FRAG,
    side: THREE.BackSide,
  });
}

export function lineMaterial(group, o = {}) {
  return new THREE.ShaderMaterial({
    name: 'ribbon',
    uniforms: {
      ...pick(['uRes', 'uDpr', 'uRefDist', 'uNight', 'uInk', 'uFaint', 'uLine', 'uAccent', 'uFogNear', 'uFogFar']),
      // the chamfers of near creases are lit (see LINE_VERT)
      ...pick(['uFootK', 'uFootOrtho', 'uMacro', 'uBevelW', 'uKeyDir', 'uKeyPoint', 'uKeyPos', 'uKeyI', 'uFillDir', 'uFillI', 'uAmb']),
      ...pick(['uShadowMap', 'uShadowMatrix', 'uShadowOn', 'uShadowTexel', 'uShadowBias', 'uShadowNormal']),
      ...groupU(group, ['uOutline', 'uDrop', 'uDropK', 'uWidthK']),
      // the sky (aurora, far ridge) is not fogged: it is the light source
      ...(o.noFog ? { uFogNear: { value: 1e5 }, uFogFar: { value: 2e5 }, uRefDist: { value: 90 } } : {}),
      uNear: { value: 0.05 },
      uBias: { value: o.bias ?? 0.0025 },
    },
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    side: THREE.DoubleSide,
  });
}

// Depth-only stand-in: keeps an object's interior hidden from its own hull
// outline while drawing nothing itself (the dissolve frame).
export function occluderMaterial() {
  const m = new THREE.ShaderMaterial({ name: 'occluder', vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG });
  m.colorWrite = false;
  return m;
}

export function depthMaterial() {
  return new THREE.ShaderMaterial({
    name: 'shadow-depth',
    vertexShader: DEPTH_VERT,
    fragmentShader: DEPTH_FRAG,
    side: THREE.BackSide,
  });
}
