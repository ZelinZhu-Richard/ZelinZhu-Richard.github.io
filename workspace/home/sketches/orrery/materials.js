// Engraving materials. Everything is drawn in the palette's ink on night:
//  - hatch lines whose width follows the key light (N.L, with cast shadows),
//  - in the darkest tone a cross-hatch of hairlines in the `line` tone,
//  - inverted-hull outlines and crease ribbons in ink,
//  - fog that fades every mark to night, and a 4x4 ordered dither.
// Hatch spacing is chosen per pixel from the screen-space gradient of the
// hatch coordinate (power-of-two octaves blended), so lines stay ~5 CSS px
// apart at any distance and never alias; marks thinner than 1 px fade
// instead of thinning.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

const v3 = (c) => new THREE.Vector3(c[0], c[1], c[2]);

export const shared = {
  uRes: { value: new THREE.Vector2(1, 1) },
  uDpr: { value: 1 },
  uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
  uKeyI: { value: 1 },
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
  uInkScale: { value: 1 },
  uOutline: { value: 1 },
  uDarkScale: { value: 1 },
  uSpacing: { value: 5 },
  uRefDist: { value: 10 },
  uNight: { value: v3(PALETTE.night) },
  uStage: { value: v3(PALETTE.stage) },
  uInk: { value: v3(PALETTE.ink) },
  uMuted: { value: v3(PALETTE.muted) },
  uFaint: { value: v3(PALETTE.faint) },
  uLine: { value: v3(PALETTE.line) },
  uAccent: { value: v3(PALETTE.accent) },
};

const COMMON = /* glsl */ `
uniform vec2 uRes;
uniform float uDpr;
uniform vec3 uKeyDir;
uniform float uKeyI;
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
uniform vec3 uNight;
uniform vec3 uStage;
uniform vec3 uInk;
uniform vec3 uMuted;
uniform vec3 uFaint;
uniform vec3 uLine;
uniform vec3 uAccent;

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
// Widths under 1 px keep 1 px and fade; when marks crowd closer than
// ~3 px (spacing spx) the pattern melts into its mean tone.
float markCov(float d, float spx, float hw) {
  float h = max(hw, 0.5);
  float c = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(hw * 2.0, 0.0, 1.0);
  float mean = clamp(2.0 * hw / max(spx, 1e-4), 0.0, 1.0);
  return mix(c, mean, (1.0 - smoothstep(1.6, 3.2, spx)));
}

// Lines at multiples of s along u; g = |grad u| per device px.
float lineSet(float u, float s, float g, float hw) {
  float spx = s / max(g, 1e-9);
  float d = abs(fract(u / s + 0.5) - 0.5) * spx;
  return markCov(d, spx, hw);
}

// Screen-spaced hatching: spacing stays near 'spacing' px at any scale.
float hatchOct(float u, float g, float spacing, float hw) {
  float L = log2(max(spacing * g, 1e-9));
  float Li = floor(L);
  float f = L - Li;
  float s = exp2(Li);
  return mix(lineSet(u, s, g, hw), lineSet(u, 2.0 * s, g, hw), f);
}

float shadowAt(vec4 sc) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 c = sc.xyz / sc.w;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
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

// Shared lighting: returns the engraving tone in 0..1.
const TONE = /* glsl */ `
uniform float uAlbedo;
uniform float uToneFloor;
float toneAt(vec3 N, vec3 V, vec4 sc) {
  float ndl = dot(N, uKeyDir);
  float sh = shadowAt(sc);
  float key = max(ndl, 0.0) * sh;
  float fill = max(dot(N, uFillDir), 0.0);
  float nv = clamp(dot(N, V), 0.0, 1.0);
  float rim = pow(1.0 - nv, 3.0);
  float t = uKeyI * key + uFillI * fill + uAmb + uRim * rim * (1.0 - key);
  t = clamp(t * uAlbedo, 0.0, 1.0);
  return max(t, uToneFloor);
}
`;

const SOLID_FRAG = /* glsl */ `
${COMMON}
${TONE}
uniform float uAccentOn;
uniform float uTicks;
uniform float uHW;
uniform float uGround;
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
  return c * m * smoothstep(2.6, 5.0, spx);
}

void main() {
  vec3 N = normalize(vWNrm);
  vec3 V = normalize(cameraPosition - vWPos);
  float tone = toneAt(N, V, vSC);

  vec2 h = vHatch;
  if (uGround > 0.5) {
    h = vec2(dot(vWPos.xz, uGroundDir), dot(vWPos.xz, vec2(-uGroundDir.y, uGroundDir.x)));
  }
  float gu = length(vec2(dFdx(h.x), dFdy(h.x)));
  float gv = length(vec2(dFdx(h.y), dFdy(h.y)));
  float ga = length(vec2(dFdx(vTick.x), dFdy(vTick.x)));
  float gt = max(length(vec2(dFdx(vTick.y), dFdy(vTick.y))), 1e-6);

  float S = uSpacing * uDpr;
  float wmod = clamp(uRefDist / max(vDist, 1e-3), 0.7, 1.35);
  float hw = uHW * uDpr * wmod * smoothstep(0.1, 0.95, tone);
  float cu = hatchOct(h.x, gu, S, hw);
  float dark = (1.0 - smoothstep(0.03, 0.24, tone)) * uDarkScale;
  float hd = 0.5 * uDpr;
  float cd = max(hatchOct(h.x, gu, S, hd), hatchOct(h.y, gv, S, hd)) * dark;

  vec3 fillCol = mix(uStage, uNight, smoothstep(0.0, 0.3, tone));
  vec3 inkCol = mix(uMuted, uInk, smoothstep(0.35, 0.9, tone));
  if (uAccentOn > 0.5) inkCol = uAccent;
  float fade = 1.0;
  if (uGround > 0.5) {
    float r = length(vWPos.xz - uFadeC);
    fade = 1.0 - smoothstep(uFadeR.x, uFadeR.y, r);
    fillCol = mix(uNight, fillCol, fade);
    inkCol = mix(uFaint, uMuted, smoothstep(0.3, 0.9, tone));
  }
  vec3 col = fillCol;
  col = mix(col, uLine, cd * 0.9 * fade);
  col = mix(col, inkCol, cu * uInkScale * fade);

  if (uTicks > 0.5 && vTick.y >= 0.0) {
    float t = vTick.y;
    float a = vTick.x;
    float hwT = 0.5 * uDpr * wmod;
    float c = tickMark(a * 12.0, ga * 12.0, t, gt, 0.62, hwT * 1.3);
    c = max(c, tickMark(a * 36.0, ga * 36.0, t, gt, 0.42, hwT));
    c = max(c, tickMark(a * 180.0, ga * 180.0, t, gt, 0.24, hwT * 0.85));
    float dl = abs(t - 0.7) / gt;
    c = max(c, clamp(hwT * 0.8 + 0.5 - dl, 0.0, 1.0) * 0.8);
    // engraved graduations catch the light: faint in shadow, ink when lit
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

// distance (px) and spacing (px) of a family of lines at integer u
vec2 lineFam(float u, float gu) {
  float spx = 1.0 / max(gu, 1e-9);
  return vec2(abs(fract(u + 0.5) - 0.5) * spx, spx);
}

void main() {
  vec3 N = normalize(vWNrm);
  vec3 V = normalize(cameraPosition - vWPos);
  float tone = toneAt(N, V, vSC);

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

  // contour field: computed for all, cheap enough, keeps derivatives uniform
  float levels = max(floor(n * 0.18), 4.0);
  float fu = (field(p) + 1.2) * levels;
  vec2 dfu = vec2(dFdx(fu), dFdy(fu));

  if (uPattern == 0) {
    // rings: latitude circles about the sphere's own axis
    float u = theta / PI * n;
    vec2 L = lineFam(u, length(dtheta) * n / PI);
    cInk = markCov(L.x, L.y, hw);
    cHair = markCov(L.x, L.y, hd);
  } else if (uPattern == 1) {
    // spiral: a family of loxodromes winding into both poles
    float K = max(floor(n * 0.7 + 0.5), 6.0);
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
    // stipple: one jittered point per cell, kept only where it lands on the
    // surface inside its own cell; dot size follows the light
    float M = n * 0.5;
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
    cInk = mix(cInk, clamp(1.4 * rad * rad / (spx * spx), 0.0, 1.0), (1.0 - smoothstep(1.8, 3.5, spx)));
    cHair = clamp(0.55 + 0.5 - d, 0.0, 1.0) * smoothstep(1.8, 3.5, spx);
  } else if (uPattern == 3) {
    // contour: isolines of a smooth field, every fifth line heavier
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
    // hatch: straight parallel cuts, crossed in the darkest tone
    vec3 A = normalize(vec3(0.82, 0.35, 0.45));
    vec3 Bv = normalize(cross(A, vec3(0.0, 1.0, 0.0)));
    float u = dot(p, A) * n * 0.4;
    float v = dot(p, Bv) * n * 0.4;
    vec2 Lu = lineFam(u, length(vec2(dFdx(u), dFdy(u))));
    vec2 Lv = lineFam(v, length(vec2(dFdx(v), dFdy(v))));
    cInk = markCov(Lu.x, Lu.y, hw);
    cHair = max(markCov(Lu.x, Lu.y, hd), markCov(Lv.x, Lv.y, hd));
  } else if (uPattern == 5) {
    // grid: a graticule of meridians and parallels, the equator heavier
    float Mm = max(floor(n * 0.4 + 0.5) * 2.0, 12.0);
    float Mp = max(floor(n * 0.4 + 0.5), 6.0);
    float um = (phi / (2.0 * PI) + 0.5) * Mm;
    float up = theta / PI * Mp;
    vec2 Lm = lineFam(um, length(dphi) * Mm / (2.0 * PI));
    vec2 Lp = lineFam(up, length(dtheta) * Mp / PI);
    float eq = 1.0 - step(0.5, abs(floor(up + 0.5) - Mp * 0.5));
    cInk = max(markCov(Lm.x, Lm.y, hw), markCov(Lp.x, Lp.y, hw * mix(1.0, 1.8, eq)));
    cHair = max(markCov(Lm.x, Lm.y, hd), markCov(Lp.x, Lp.y, hd));
  } else {
    // dot: a regular halftone screen laid on latitude rows
    float Nd = max(floor(n * 0.55), 8.0);
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
    cInk = mix(cInk, clamp(0.5 * rad * rad / (spx * spx), 0.0, 1.0), (1.0 - smoothstep(1.8, 3.5, spx)));
    cHair = clamp(0.6 + 0.5 - d, 0.0, 1.0) * smoothstep(1.8, 3.5, spx);
  }

  float dark = (1.0 - smoothstep(0.04, 0.3, tone)) * uDarkScale;
  vec3 fillCol = mix(uStage, uNight, smoothstep(0.0, 0.3, tone));
  vec3 inkCol = mix(uMuted, uInk, smoothstep(0.35, 0.9, tone));
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
uniform float uRefDist;
varying float vDist;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * aOnormal);
  vDist = length(mv.xyz);
  vec4 c0 = projectionMatrix * mv;
  vec4 c1 = projectionMatrix * vec4(mv.xyz + n * (0.01 * max(-mv.z, 0.01)), 1.0);
  vec2 s0 = c0.xy / c0.w;
  vec2 s1 = c1.xy / c1.w;
  vec2 dpx = (s1 - s0) * uRes;
  float l = length(dpx);
  vec2 dir = l > 1e-6 ? dpx / l : vec2(0.0);
  float w = uWidth * uDpr * clamp(uRefDist / max(vDist, 1e-3), 0.6, 1.4);
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
varying float vDist;
float bayer2(vec2 a) { a = mod(floor(a), 2.0); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec3 c = mix(uMuted, uInk, uTone);
  float k = uOutline;
  if (uAccentOn > 0.5) { c = uAccent; k = 1.0; }
  c = mix(uNight, c, k);
  c = mix(c, uNight, smoothstep(uFogNear, uFogFar, vDist));
  c += (bayer4(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

// Crease and graduation ribbons: one instanced quad per segment, expanded
// in screen space, culled when both adjacent faces look away.
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
varying float vDist;
varying float vTone;
varying float vAcc;
varying float vFadeW;
void main() {
  vTone = iP.y;
  vAcc = iP.z;
  vec3 mid = 0.5 * (iA + iB);
  vec3 toCam = normalize(cameraPosition - mid);
  if (max(dot(iNA, toCam), dot(iNB, toCam)) < -0.03) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vDist = 0.0; vFadeW = 0.0;
    return;
  }
  vec4 va = viewMatrix * vec4(iA, 1.0);
  vec4 vb = viewMatrix * vec4(iB, 1.0);
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
  float wWant = iP.x * uDpr * clamp(uRefDist / max(vDist, 1e-3), 0.55, 1.45);
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
float bayer2(vec2 a) { a = mod(floor(a), 2.0); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  // tone >= 0: faint..ink; tone < 0: the dim hairline tones line..faint
  vec3 c = vTone < 0.0 ? mix(uLine, uFaint, -vTone) : mix(uFaint, uInk, vTone);
  float k = uOutline;
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

export function solidMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    name: 'engrave',
    uniforms: {
      ...pick(SOLID_SHARED),
      uAlbedo: { value: o.albedo ?? 1 },
      uToneFloor: { value: o.toneFloor ?? 0 },
      uAccentOn: { value: o.accent ? 1 : 0 },
      uTicks: { value: o.ticks ? 1 : 0 },
      uHW: { value: o.hw ?? 1.05 },
      uGround: { value: o.ground ? 1 : 0 },
      uGroundDir: { value: new THREE.Vector2(1, 0) },
      uFadeC: { value: new THREE.Vector2(0, 0) },
      uFadeR: { value: new THREE.Vector2(4, 9) },
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
      uAlbedo: { value: o.albedo ?? 1 },
      uToneFloor: { value: 0 },
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
      ...pick(['uRes', 'uDpr', 'uRefDist', 'uNight', 'uInk', 'uMuted', 'uAccent', 'uFogNear', 'uFogFar', 'uOutline']),
      uWidth: { value: o.width ?? 1.5 },
      uTone: { value: o.tone ?? 1 },
      uAccentOn: { value: o.accent ? 1 : 0 },
    },
    vertexShader: HULL_VERT,
    fragmentShader: HULL_FRAG,
    side: THREE.BackSide,
  });
}

export function lineMaterial() {
  return new THREE.ShaderMaterial({
    name: 'ribbon',
    uniforms: {
      ...pick(['uRes', 'uDpr', 'uRefDist', 'uNight', 'uInk', 'uFaint', 'uLine', 'uAccent', 'uFogNear', 'uFogFar', 'uOutline']),
      uNear: { value: 0.05 },
      uBias: { value: 0.0025 },
    },
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    side: THREE.DoubleSide,
  });
}

export function depthMaterial() {
  return new THREE.ShaderMaterial({
    name: 'shadow-depth',
    vertexShader: DEPTH_VERT,
    fragmentShader: DEPTH_FRAG,
    side: THREE.BackSide,
  });
}
