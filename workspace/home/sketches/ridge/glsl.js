// Palette and GLSL chunks shared by every material of the sketch.
// Colours are passed as raw sRGB triples (no colour management): every
// ShaderMaterial here writes its output unconverted, so the canvas shows the
// exact palette values of ART.md.

import * as THREE from 'three';

export const HEX = {
  night: '#100f15',
  stage: '#08070b',
  ink: '#ece9e1',
  muted: '#a8a398',
  faint: '#7a766d',
  line: '#2d2b34',
  accent: '#e8743b',
};

export function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}

export function vec3(hex) {
  return new THREE.Vector3(...rgb(hex));
}

// Uniforms every material shares (same objects, so one update reaches all).
export function makeShared() {
  return {
    uRes: { value: new THREE.Vector2(1, 1) },
    uDpr: { value: 1 },
    uQuiet: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uQuietK: { value: 0 },
    uQuietFeather: { value: 80 },
    uNight: { value: vec3(HEX.night) },
    uInk: { value: vec3(HEX.ink) },
    uMuted: { value: vec3(HEX.muted) },
    uLine: { value: vec3(HEX.line) },
    uAccent: { value: vec3(HEX.accent) },
  };
}

// Uniform declarations valid in both stages.
export const GLSL_UNIFORMS = /* glsl */ `
uniform vec2 uRes;
uniform float uDpr;
uniform vec4 uQuiet[3];
uniform float uQuietK;
uniform float uQuietFeather;
`;

// Fragment-stage helpers (they read gl_FragCoord).
export const GLSL_COMMON = GLSL_UNIFORMS + /* glsl */ `
// Interleaved gradient noise: a cheap, blue-ish ordered dither.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
float dither() {
  return (ign(gl_FragCoord.xy) - 0.5) / 255.0;
}

// 1 away from text, (1 - uQuietK) under it: lines dim where the copy sits.
float quietMask() {
  vec2 fc = gl_FragCoord.xy;
  float m = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 r = uQuiet[i];
    vec2 c = 0.5 * (r.xy + r.zw);
    vec2 hs = max(0.5 * (r.zw - r.xy), vec2(0.0));
    vec2 q = abs(fc - c) - hs;
    float d = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0);
    float on = step(1.0, r.z - r.x);
    m = max(m, on * (1.0 - smoothstep(0.0, uQuietFeather, d)));
  }
  return 1.0 - uQuietK * m;
}

// Isolines of v at every integer. gpx = |grad v| per device pixel, wpx = line
// width in device pixels. A line thinner than one device pixel keeps a 1 px
// footprint and fades instead of thinning; lines that crowd closer than a few
// CSS pixels fade out instead of turning into moire.
float isolines(float v, float gpx, float wpx) {
  float g = max(gpx, 1e-6);
  float spacing = 1.0 / g;
  float d = abs(fract(v + 0.5) - 0.5) * spacing;
  float w = max(wpx, 1.0);
  float cov = clamp(0.5 * w + 0.5 - d, 0.0, 1.0) * min(wpx, 1.0);
  return cov * smoothstep(3.0 * uDpr, 7.5 * uDpr, spacing);
}

// The single isoline v == 0, no crowding fade (used for the accent lines).
float isoline0(float v, float gpx, float wpx) {
  float d = abs(v) / max(gpx, 1e-6);
  float w = max(wpx, 1.0);
  return clamp(0.5 * w + 0.5 - d, 0.0, 1.0) * min(wpx, 1.0);
}
`;
