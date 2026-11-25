// The film finish for the room (ART.md, last section), adapted from
// sketches/instrument/finish.js for an HDR, baked-light scene:
//  - the scene arrives in a half-float target in linear light: baked atlases
//    (display-referred, so <= 1) plus emitters well above 1;
//  - soft glow from bright pixels only: a bright pass on 4x4 block averages
//    at half resolution, blurred at half, quarter and eighth resolution (the
//    tight bloom and the wide fog-glow halo of the Blender compositor);
//  - optional depth of field for the shots Blender rendered with it
//    (circle of confusion from the depth buffer, CoC-weighted blur so a sharp
//    foreground never smears into the background);
//  - a scrim under the text (quiet zone) and Blender's veiling glare (the
//    deepest shadows sit near #0b0a14, never pure black);
//  - highlight roll-off with a path to white: channels above 1 drift toward
//    white before the shoulder, which is how AgX shows a saturated strip as a
//    hot white core inside a coloured glow;
//  - sRGB encode here (no double encode: nothing else writes the canvas),
//    then a gentle vignette and grain weighted to the shadows, both in display
//    space. The grain is a fixed hash of the pixel, so stills stay
//    deterministic.
// Tiers: 0 = one glow level, no DOF; 1 = two glow levels and DOF; 2 = three.

import * as THREE from 'three';
import { gaussTaps } from '../instrument/finish.js';

export const POST_DEFAULT = Object.freeze({
  on: 1,
  threshold: 0.9,
  glow: [0.32, 0.26, 0.2],
  knee: 0.72,
  // how fast channels above 1 drift to white: a violet strip at ~5x keeps a lavender core, not a white one
  white: 0.35,
  grain: 0.022,
  vignette: 0.24,
  veil: [0.0026, 0.0023, 0.0062],
  scrim: 0.5,
});

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// bright pass: 4x4 bilinear taps over the block each output texel covers
const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSrcTexel;
uniform float uBlock;
uniform float uThresh;
varying vec2 vUv;
void main() {
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 o = (vec2(float(i), float(j)) + 0.5) / 4.0 - 0.5;
      acc += min(texture2D(tSrc, vUv + o * uBlock * uSrcTexel).rgb, vec3(24.0));
    }
  }
  vec3 c = acc / 16.0;
  float m = max(c.r, max(c.g, c.b));
  float w = smoothstep(uThresh, uThresh * 1.6 + 0.25, m);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

const COPY_FRAG = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tSrc, vUv);
}
`;

// separable gaussian, linear-sampled: 9 fetches cover 17 texels (rgba, so the
// DOF chain can carry its weight in alpha)
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uStep;
uniform float uW[5];
uniform float uO[5];
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tSrc, vUv) * uW[0];
  for (int i = 1; i < 5; i++) {
    c += texture2D(tSrc, vUv + uStep * uO[i]) * uW[i];
    c += texture2D(tSrc, vUv - uStep * uO[i]) * uW[i];
  }
  gl_FragColor = c;
}
`;

const DEPTH_FN = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uNearFar;
uniform float uFocusInv;
uniform float uCocK;
// circle of confusion in CSS px for a depth-buffer sample (cleared = infinity)
float cocAt(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  float invZ = d >= 0.99999 ? 0.0 : (uNearFar.y - d * (uNearFar.y - uNearFar.x)) / (uNearFar.x * uNearFar.y);
  return uCocK * abs(uFocusInv - invZ);
}
`;

// DOF source: colour premultiplied by its blur weight, so in-focus pixels do
// not leak into the blurred background
const DOF_DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSrcTexel;
varying vec2 vUv;
${DEPTH_FN}
void main() {
  vec4 acc = vec4(0.0);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 uv = vUv + (vec2(float(i), float(j)) - 0.5) * uSrcTexel;
      float w = smoothstep(1.0, 6.0, cocAt(uv));
      acc += vec4(min(texture2D(tSrc, uv).rgb, vec3(24.0)) * w, w);
    }
  }
  gl_FragColor = acc * 0.25;
}
`;

const OUT_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tGlow1;
uniform sampler2D tGlow2;
uniform sampler2D tGlow3;
uniform sampler2D tDof1;
uniform sampler2D tDof2;
uniform float uDof;
uniform vec3 uGlow;
uniform float uOn;
uniform float uKnee;
uniform float uWhite;
uniform float uGrain;
uniform float uVignette;
uniform vec3 uVeil;
uniform vec2 uRes;
uniform vec4 uScrim[4];
uniform float uScrimK;
uniform float uScrimSoft;
varying vec2 vUv;
${DEPTH_FN}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 encodeSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

// 1 inside a text rectangle (device px, y up), easing to 0 outside it
float scrimAt(vec2 p) {
  float q = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 r = uScrim[i];
    if (r.z <= r.x) continue;
    vec2 d = max(max(r.xy - p, p - r.zw), 0.0);
    q = max(q, 1.0 - smoothstep(0.0, uScrimSoft, length(d)));
  }
  return q;
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec3 col = texelFetch(tScene, ip, 0).rgb;
  if (uOn < 0.5) {
    gl_FragColor = vec4(encodeSrgb(min(col, vec3(1.0))), 1.0);
    return;
  }
  if (uDof > 0.5) {
    float coc = cocAt(vUv);
    vec4 a = texture2D(tDof1, vUv);
    vec4 b = texture2D(tDof2, vUv);
    vec3 ca = a.a > 1e-4 ? a.rgb / a.a : col;
    vec3 cb = b.a > 1e-4 ? b.rgb / b.a : ca;
    // a disc of diameter d blurs like a gaussian of sigma d / 4: the half-res
    // level (sigma ~5 CSS px) matches a CoC of ~20 px, the quarter-res one ~48
    vec3 blurred = mix(ca, cb, smoothstep(20.0, 48.0, coc));
    col = mix(col, blurred, smoothstep(1.5, 14.0, coc));
  }
  col += texture2D(tGlow1, vUv).rgb * uGlow.x + texture2D(tGlow2, vUv).rgb * uGlow.y + texture2D(tGlow3, vUv).rgb * uGlow.z;
  // quiet zone under the type
  float s = scrimAt(gl_FragCoord.xy);
  col *= 1.0 - uScrimK * s;
  // veiling glare: nothing is pure black
  col += uVeil;
  // path to white, then a soft shoulder on the brightest channel
  float m = max(col.r, max(col.g, col.b));
  if (m > 1.0) {
    float t = 1.0 - exp(-(m - 1.0) * uWhite);
    col = mix(col, vec3(m), t);
  }
  m = max(col.r, max(col.g, col.b));
  if (m > uKnee) {
    float r = uKnee + (1.0 - uKnee) * (1.0 - exp(-(m - uKnee) / (1.0 - uKnee)));
    col *= r / m;
  }
  vec3 o = encodeSrgb(col);
  // vignette: 0 at the centre, 1 in the corners
  float asp = uRes.x / uRes.y;
  vec2 q = (vUv - 0.5) * vec2(asp, 1.0);
  float rv = length(q) / length(vec2(0.5 * asp, 0.5));
  o *= 1.0 - uVignette * smoothstep(0.38, 1.05, rv);
  // grain: triangular, zero mean, strongest in the shadows
  float lum = dot(o, vec3(0.2126, 0.7152, 0.0722));
  float g = hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 19.7) - 1.0;
  o += g * uGrain * (1.0 - smoothstep(0.06, 0.6, lum)) + g * (0.5 / 255.0);
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), 1.0);
}
`;

// exported for glsl_check.py (compiles every custom shader without a browser)
export const SHADERS = Object.freeze({ VERT, BRIGHT_FRAG, COPY_FRAG, BLUR_FRAG, DOF_DOWN_FRAG, OUT_FRAG });

const half = (o = {}) =>
  new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...o });

/**
 * createPost(renderer, { samples }) -> post handle.
 * Render the scene into post.sceneRT (MSAA, depth texture), then call
 * post.compose(options).
 */
export function createPost(renderer, { samples = 4 } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const cam = new THREE.Camera();
  const mesh = new THREE.Mesh(geo);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);

  const sceneRT = half({ depthBuffer: true, samples, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
  sceneRT.texture.minFilter = THREE.LinearFilter;
  const A = half();
  const At = half();
  const B = half();
  const Bt = half();
  const C = half();
  const Ct = half();
  const D1 = half();
  const D1t = half();
  const D2 = half();
  const D2t = half();

  const mat = (frag, uniforms) =>
    new THREE.ShaderMaterial({ name: 'post', vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const depthUniforms = () => ({
    tDepth: { value: sceneRT.depthTexture },
    uNearFar: { value: new THREE.Vector2(0.05, 150) },
    uFocusInv: { value: 0 },
    uCocK: { value: 0 },
  });
  const bright = mat(BRIGHT_FRAG, { tSrc: { value: sceneRT.texture }, uSrcTexel: { value: new THREE.Vector2(1, 1) }, uBlock: { value: 2 }, uThresh: { value: POST_DEFAULT.threshold } });
  const copy = mat(COPY_FRAG, { tSrc: { value: null } });
  const blur = mat(BLUR_FRAG, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() }, uW: { value: [1, 0, 0, 0, 0] }, uO: { value: [0, 1, 2, 3, 4] } });
  const dofDown = mat(DOF_DOWN_FRAG, { tSrc: { value: sceneRT.texture }, uSrcTexel: { value: new THREE.Vector2(1, 1) }, ...depthUniforms() });
  const out = mat(OUT_FRAG, {
    tScene: { value: sceneRT.texture },
    tGlow1: { value: A.texture },
    tGlow2: { value: B.texture },
    tGlow3: { value: C.texture },
    tDof1: { value: D1.texture },
    tDof2: { value: D2.texture },
    uDof: { value: 0 },
    uGlow: { value: new THREE.Vector3() },
    uOn: { value: 1 },
    uKnee: { value: POST_DEFAULT.knee },
    uWhite: { value: POST_DEFAULT.white },
    uGrain: { value: POST_DEFAULT.grain },
    uVignette: { value: POST_DEFAULT.vignette },
    uVeil: { value: new THREE.Vector3().fromArray(POST_DEFAULT.veil) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uScrim: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uScrimK: { value: POST_DEFAULT.scrim },
    uScrimSoft: { value: 40 },
    ...depthUniforms(),
  });

  const pass = (material, target) => {
    mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
  };
  const blurPass = (src, tmp, sigma) => {
    const g = gaussTaps(sigma);
    blur.uniforms.uW.value = g.W;
    blur.uniforms.uO.value = g.O;
    blur.uniforms.tSrc.value = src.texture;
    blur.uniforms.uStep.value.set(1 / src.width, 0);
    pass(blur, tmp);
    blur.uniforms.tSrc.value = tmp.texture;
    blur.uniforms.uStep.value.set(0, 1 / tmp.height);
    pass(blur, src);
  };
  const downTo = (src, dst) => {
    copy.uniforms.tSrc.value = src.texture;
    pass(copy, dst);
  };

  let dev = [1, 1];
  let css = [1, 1];
  const ceil = (v) => Math.max(1, Math.ceil(v));
  return {
    sceneRT,
    setSize(dw, dh, cw, ch) {
      dev = [dw, dh];
      css = [cw, ch];
      sceneRT.setSize(dw, dh);
      // glow and DOF chains work in CSS pixels: the same look at any DPR
      const hw = ceil(cw / 2);
      const hh = ceil(ch / 2);
      for (const t of [A, At, D1, D1t]) t.setSize(hw, hh);
      for (const t of [B, Bt, D2, D2t]) t.setSize(ceil(hw / 2), ceil(hh / 2));
      for (const t of [C, Ct]) t.setSize(ceil(hw / 4), ceil(hh / 4));
    },
    /**
     * o: { tier, dof: { near, far, focus (m), cocK (CSS px per 1/m) } | null,
     *      scrims: CSS-px rects [l, t, r, b], dpr, ...POST_DEFAULT overrides }
     */
    compose(o = {}) {
      const F = { ...POST_DEFAULT, ...o };
      const tier = F.tier ?? 2;
      const on = F.on ? 1 : 0;
      const levels = on ? (tier >= 2 ? 3 : tier >= 1 ? 2 : 1) : 0;
      const useDof = on && tier >= 1 && o.dof && o.dof.cocK > 0;
      for (const m of [dofDown, out]) {
        m.uniforms.uNearFar.value.set(o.dof?.near ?? 0.05, o.dof?.far ?? 150);
        m.uniforms.uFocusInv.value = o.dof ? 1 / Math.max(o.dof.focus, 0.01) : 0;
        m.uniforms.uCocK.value = useDof ? o.dof.cocK : 0;
      }
      if (levels >= 1) {
        bright.uniforms.uSrcTexel.value.set(1 / dev[0], 1 / dev[1]);
        bright.uniforms.uBlock.value = dev[0] / A.width;
        bright.uniforms.uThresh.value = F.threshold;
        pass(bright, A);
        if (levels >= 2) downTo(A, B);
        if (levels >= 3) downTo(B, C);
        blurPass(A, At, 2.0); // ~4 CSS px
        if (levels >= 2) blurPass(B, Bt, 3.0); // ~12 CSS px
        if (levels >= 3) blurPass(C, Ct, 3.5); // ~28 CSS px
      }
      if (useDof) {
        dofDown.uniforms.uSrcTexel.value.set(1 / dev[0], 1 / dev[1]);
        pass(dofDown, D1);
        downTo(D1, D2);
        blurPass(D1, D1t, 2.5); // background blur up to ~10 CSS px
        blurPass(D2, D2t, 3.0); // and the wide one, ~24 CSS px
      }
      const u = out.uniforms;
      u.tGlow1.value = levels >= 1 ? A.texture : sceneRT.texture;
      u.tGlow2.value = levels >= 2 ? B.texture : sceneRT.texture;
      u.tGlow3.value = levels >= 3 ? C.texture : sceneRT.texture;
      u.uGlow.value.set(levels >= 1 ? F.glow[0] : 0, levels >= 2 ? F.glow[1] : 0, levels >= 3 ? F.glow[2] : 0);
      u.tDof1.value = useDof ? D1.texture : sceneRT.texture;
      u.tDof2.value = useDof ? D2.texture : sceneRT.texture;
      u.uDof.value = useDof ? 1 : 0;
      u.uOn.value = on;
      u.uKnee.value = F.knee;
      u.uWhite.value = F.white;
      u.uGrain.value = F.grain;
      u.uVignette.value = F.vignette;
      u.uVeil.value.fromArray(F.veil);
      u.uRes.value.set(dev[0], dev[1]);
      const dpr = o.dpr || 1;
      const H = css[1];
      u.uScrim.value.forEach((v, i) => {
        const r = o.scrims?.[i];
        if (!r) v.set(0, 0, 0, 0);
        else v.set(r[0] * dpr, (H - r[3]) * dpr, r[2] * dpr, (H - r[1]) * dpr);
      });
      u.uScrimK.value = F.scrim;
      u.uScrimSoft.value = 46 * dpr;
      pass(out, null);
    },
    /** GPU bytes of the post targets (estimate). */
    bytes() {
      let b = sceneRT.width * sceneRT.height * (8 + 4) * Math.max(1, samples) + sceneRT.width * sceneRT.height * (8 + 4);
      for (const t of [A, At, B, Bt, C, Ct, D1, D1t, D2, D2t]) b += t.width * t.height * 8;
      return b;
    },
  };
}
