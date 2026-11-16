// Final pass: the Blender kit's compositor finish, then the view transform.
// Order matches kit/povkit.py comp.setup + render.setup: (bloom happens before
// this pass) -> saturation -> lens dispersion -> vignette -> film grain, all in
// scene-linear, then a film's own end-of-compositor grade (black point,
// contrast, split tone), then exposure, the view transform (Khronos PBR Neutral,
// or AgX with an optional Punchy look), sRGB, and a half-step dither.
// Saturation keeps Rec.709 luma, so applying it here equals applying it before
// the bloom as the kit does (the bloom's threshold only looks at luma).
//
// Khronos PBR Neutral is the reference curve (three.js r170 NeutralToneMapping,
// start of compression 0.76, desaturation 0.15).
//
// AgX is three.js r170's AgXToneMapping verbatim. "Punchy" is fitted to
// Blender 5.2's "AgX - Punchy" look on a probe of 197 colours (grey ramp from
// 2^-12 to 2^7 times 0.18 plus eight hues): log-space contrast around a pivot,
// then a power after the sigmoid; mean error 0.006 in display values.

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const PUNCHY = new THREE.Vector4(0.74427, 0.99859, 2.90282, 1.02432);

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1 },
    uView: { value: 0 },          // 0 AgX, 1 Khronos PBR Neutral
    uPunchy: { value: 1 },
    uSaturation: { value: 1 },
    uBlack: { value: 0 },
    uContrast: { value: 1 },
    uContrastLuma: { value: 0 },
    uSplitTint: { value: new THREE.Vector3(1, 1, 1) },
    uSplitRange: { value: new THREE.Vector2(0.015, 0.55) },
    uLook: { value: PUNCHY.clone() },
    uVignette: { value: 0.32 },
    uVignetteRadius: { value: 0.62 },
    uGrain: { value: 0.022 },
    uDispersion: { value: 0.006 },
    uFrame: { value: 0 },
    uFilmRes: { value: new THREE.Vector2(1080, 1920) },
    uSeed: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uView;
    uniform float uPunchy;
    uniform float uSaturation;
    uniform float uBlack;
    uniform float uContrast;
    uniform float uContrastLuma;
    uniform vec3 uSplitTint;
    uniform vec2 uSplitRange;
    uniform vec4 uLook;
    uniform float uVignette;
    uniform float uVignetteRadius;
    uniform float uGrain;
    uniform float uDispersion;
    uniform float uFrame;
    uniform vec2 uFilmRes;
    uniform float uSeed;
    varying vec2 vUv;

    const mat3 POV_REC2020_TO_SRGB = mat3(
      vec3(1.6605, -0.1246, -0.0182),
      vec3(-0.5876, 1.1329, -0.1006),
      vec3(-0.0728, -0.0083, 1.1187));
    const mat3 POV_SRGB_TO_REC2020 = mat3(
      vec3(0.6274, 0.0691, 0.0164),
      vec3(0.3293, 0.9195, 0.0880),
      vec3(0.0433, 0.0113, 0.8956));

    vec3 agxContrast(vec3 x) {
      vec3 x2 = x * x;
      vec3 x4 = x2 * x2;
      return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
    }

    vec3 agx(vec3 color) {
      const mat3 inset = mat3(
        vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
        vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
        vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
      const mat3 outset = mat3(
        vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
        vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
        vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
      const float minEv = -12.47393;
      const float maxEv = 4.026069;
      color = POV_SRGB_TO_REC2020 * color;
      color = inset * color;
      color = max(color, 1e-10);
      color = log2(color);
      color = (color - minEv) / (maxEv - minEv);
      color = clamp(color, 0.0, 1.0);
      if (uPunchy > 0.5) color = clamp((color - uLook.y) * uLook.x + uLook.y, 0.0, 1.0);
      color = agxContrast(color);
      if (uPunchy > 0.5) {
        float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
        vec3 p = pow(max(color, 0.0), vec3(uLook.z));
        color = l + uLook.w * (p - l);
      }
      color = outset * color;
      color = pow(max(vec3(0.0), color), vec3(2.2));
      color = POV_REC2020_TO_SRGB * color;
      return clamp(color, 0.0, 1.0);
    }

    vec3 pbrNeutral(vec3 color) {
      const float startCompression = 0.8 - 0.04;
      const float desaturation = 0.15;
      float x = min(color.r, min(color.g, color.b));
      float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
      color -= offset;
      float peak = max(color.r, max(color.g, color.b));
      if (peak < startCompression) return color;
      const float d = 1.0 - startCompression;
      float newPeak = 1.0 - d * d / (peak + d - startCompression);
      color *= newPeak / peak;
      float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
      return mix(color, vec3(newPeak), g);
    }

    // A film's own grade at the end of its compositor (scene-linear): black point,
    // contrast around 0.18 (per channel, or on luma so hue and saturation stay),
    // then a split tone that tints the darks.
    vec3 grade(vec3 c) {
      const vec3 rec709 = vec3(0.2126, 0.7152, 0.0722);
      if (uBlack > 0.0) c = max(c - uBlack, 0.0) / (1.0 - uBlack);
      if (uContrast != 1.0) {
        if (uContrastLuma > 0.5) {
          float l = max(dot(c, rec709), 1e-5);
          c *= min(pow(l / 0.18, uContrast - 1.0), 4.0);
        } else {
          c = 0.18 * pow(c / 0.18, vec3(uContrast));
        }
      }
      if (uSplitTint != vec3(1.0)) {
        float k = smoothstep(uSplitRange.x, uSplitRange.y, dot(c, rec709));
        c *= mix(uSplitTint, vec3(1.0), k);
      }
      return c;
    }

    vec3 oetf(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }

    float hash13(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.zyx + 31.32);
      return fract((p.x + p.y) * p.z);
    }

    vec3 hash33(vec3 p) {
      p = fract(p * vec3(0.1031, 0.1030, 0.0973));
      p += dot(p, p.yxz + 33.33);
      return fract((p.xxy + p.yxx) * p.zyx);
    }

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec3 c;
      if (uDispersion > 0.0) {
        vec2 o = d * r2 * uDispersion;
        c.r = texture2D(tDiffuse, vUv + o).r;
        c.g = texture2D(tDiffuse, vUv).g;
        c.b = texture2D(tDiffuse, vUv - o).b;
      } else {
        c = texture2D(tDiffuse, vUv).rgb;
      }
      if (uSaturation != 1.0) {
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = max(l + (c - l) * uSaturation, 0.0);
      }
      // vignette exactly as the kit: radius in a frame stretched to 0.75 of the 9:16 height
      vec2 dv = d * vec2(1.0, (uFilmRes.y / uFilmRes.x) * 0.75);
      float rv = length(dv);
      c *= mix(1.0, 1.0 - uVignette, smoothstep(uVignetteRadius * 0.45, uVignetteRadius * 1.15, rv));
      // film grain on the film's own pixel grid, changing every film frame
      if (uGrain > 0.0) {
        vec2 px = floor(vUv * uFilmRes);
        vec3 gc = hash33(vec3(px, uFrame)) - 0.5;
        float gv = hash13(vec3(px + 17.0, uFrame + 3.0)) - 0.5;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float amp = sqrt(max(lum, 0.0)) * uGrain + uGrain * 0.04;
        c = max(c + (gc * 0.35 + gv) * amp, 0.0);
      }
      c = grade(c) * uExposure;
      c = oetf(uView > 0.5 ? clamp(pbrNeutral(c), 0.0, 1.0) : agx(c));
      vec2 fp = gl_FragCoord.xy;
      float n = hash13(vec3(fp, uSeed * 61.0)) + hash13(vec3(fp + 19.19, uSeed * 37.0)) - 1.0;
      gl_FragColor = vec4(c + n / 255.0, 1.0);
    }`,
};

export function createFinishPass() {
  return new ShaderPass(FinishShader);
}
