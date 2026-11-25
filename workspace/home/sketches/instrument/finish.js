// The film finish (ART.md, "Decisions after the concept round"): one cheap
// last pass over every still. The frame is drawn offscreen, the scene into
// a 4x multisampled target cleared to transparent (one render call, since
// three invalidates a multisampled buffer after each resolve), the sky,
// when the frame has one, into a target of its own; this pass composes them
// onto the canvas (scene over sky or over the night colour) and adds
//  - a soft glow round the brightest areas only: a bright pass on 2x2 CSS
//    px averages, so a hairline never crosses the threshold while a thick
//    bright stroke, a lit chamfer, the galaxy's core or a spike star does;
//    blurred at half and at quarter CSS resolution;
//  - a smooth highlight roll-off on the brightest channel (hue kept);
//  - grain weighted to the shadows, zero mean, so the darks do not lift
//    toward grey;
//  - a gentle vignette;
//  - in the sky frames, a quiet zone under each label: the band and the
//    stars dim under the words, the dark sky around them is left alone.
// The scene's own pixels are read 1:1 (texelFetch), so lines and edges are
// exactly as rendered; the type is DOM and never passes through here.
// Tiers: 0 no glow, 1 the half-resolution glow only, 2 both levels.

import * as THREE from 'three';

export const FINISH_DEFAULT = { on: 1, glow: 0.26, knee: 0.86, grain: 0.016, vignette: 0.18, threshold: 0.7 };

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// scene over background, bilinear, for the glow's bright pass
const DOWN_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tSky;
uniform float uHasSky;
uniform vec3 uBg;
uniform vec2 uSrcTexel;
uniform float uBlock;
uniform float uThresh;
varying vec2 vUv;
vec3 comp(vec2 uv) {
  vec4 s = texture(tScene, uv);
  vec3 bg = uHasSky > 0.5 ? texture(tSky, uv).rgb : uBg;
  return s.rgb + bg * (1.0 - s.a);
}
void main() {
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 o = (vec2(float(i), float(j)) + 0.5) / 4.0 - 0.5;
      acc += comp(vUv + o * uBlock * uSrcTexel);
    }
  }
  vec3 c = acc / 16.0;
  float m = max(c.r, max(c.g, c.b));
  float w = clamp((m - uThresh) / max(1.0 - uThresh, 1e-3), 0.0, 1.0);
  gl_FragColor = vec4(c * w * w, 1.0);
}
`;

const HALF_FRAG = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture(tSrc, vUv).rgb, 1.0);
}
`;

// separable gaussian, linear-sampled: 9 fetches cover 17 texels
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uStep;
uniform float uW[5];
uniform float uO[5];
varying vec2 vUv;
void main() {
  vec3 c = texture(tSrc, vUv).rgb * uW[0];
  for (int i = 1; i < 5; i++) {
    c += texture(tSrc, vUv + uStep * uO[i]).rgb * uW[i];
    c += texture(tSrc, vUv - uStep * uO[i]).rgb * uW[i];
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

const OUT_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tSky;
uniform sampler2D tGlow1;
uniform sampler2D tGlow2;
uniform float uHasSky;
uniform vec3 uBg;
uniform float uOn;
uniform float uGlow1;
uniform float uGlow2;
uniform float uKnee;
uniform float uGrain;
uniform float uVignette;
uniform vec2 uRes;
uniform vec4 uQuiet[10];
uniform float uQuietSoft;
varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// 1 inside a label's rectangle (device px, y up), easing to 0 outside it
float quietAt(vec2 p) {
  float q = 0.0;
  for (int i = 0; i < 10; i++) {
    vec4 r = uQuiet[i];
    if (r.z <= r.x) continue;
    vec2 d = max(max(r.xy - p, p - r.zw), 0.0);
    q = max(q, 1.0 - smoothstep(0.0, uQuietSoft, length(d)));
  }
  return q;
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(tScene, ip, 0);
  vec3 bg = uBg;
  if (uHasSky > 0.5) {
    bg = texelFetch(tSky, ip, 0).rgb;
    float q = quietAt(gl_FragCoord.xy);
    if (q > 0.0) {
      // only what is bright in the sky gives way: band, dust lanes, stars
      float l = dot(bg, vec3(0.2126, 0.7152, 0.0722));
      float k = q * smoothstep(0.045, 0.2, l);
      bg = mix(bg, vec3(l), 0.3 * k) * (1.0 - 0.62 * k);
    }
  }
  vec3 col = s.rgb + bg * (1.0 - s.a);
  if (uOn < 0.5) {
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  col += texture(tGlow1, vUv).rgb * uGlow1 + texture(tGlow2, vUv).rgb * uGlow2;
  // highlight roll-off: a soft shoulder above the knee, on the brightest
  // channel so the hue holds
  float m = max(col.r, max(col.g, col.b));
  if (m > uKnee) {
    float r = uKnee + (1.0 - uKnee) * (1.0 - exp(-(m - uKnee) / (1.0 - uKnee)));
    col *= r / m;
  }
  // vignette: 0 at the centre, 1 in the corners
  float asp = uRes.x / uRes.y;
  vec2 q = (vUv - 0.5) * vec2(asp, 1.0);
  float rv = length(q) / length(vec2(0.5 * asp, 0.5));
  col *= 1.0 - uVignette * smoothstep(0.42, 1.05, rv);
  // grain: triangular, zero mean, strongest in the shadows
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float g = hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 19.7) - 1.0;
  col += g * uGrain * (1.0 - smoothstep(0.04, 0.5, lum));
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

export const SHADERS = { VERT, DOWN_FRAG, HALF_FRAG, BLUR_FRAG, OUT_FRAG };

// Gaussian taps for BLUR_FRAG: centre + 4 linear-sampled pairs (texels
// 1..8 each side), normalised.
export function gaussTaps(sigma) {
  const w = [];
  for (let i = 0; i <= 8; i++) w.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const W = [w[0]];
  const O = [0];
  for (let k = 0; k < 4; k++) {
    const a = w[2 * k + 1];
    const b = w[2 * k + 2];
    W.push(a + b);
    O.push((a * (2 * k + 1) + b * (2 * k + 2)) / (a + b));
  }
  const sum = W[0] + 2 * (W[1] + W[2] + W[3] + W[4]);
  return { W: W.map((v) => v / sum), O };
}

const rt = (opts = {}) =>
  new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...opts });

export function createFinish(renderer) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const cam = new THREE.Camera();
  const mesh = new THREE.Mesh(geo);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);

  const sceneRT = rt({ depthBuffer: true, samples: 4 });
  const skyRT = rt();
  const A = rt();
  const B = rt();
  const C = rt();
  const Dt = rt();

  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ name: 'finish', vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const down = mat(DOWN_FRAG, {
    tScene: { value: sceneRT.texture },
    tSky: { value: skyRT.texture },
    uHasSky: { value: 0 },
    uBg: { value: new THREE.Vector3() },
    uSrcTexel: { value: new THREE.Vector2(1, 1) },
    uBlock: { value: 2 },
    uThresh: { value: FINISH_DEFAULT.threshold },
  });
  const half = mat(HALF_FRAG, { tSrc: { value: null } });
  const blur = mat(BLUR_FRAG, {
    tSrc: { value: null },
    uStep: { value: new THREE.Vector2() },
    uW: { value: [1, 0, 0, 0, 0] },
    uO: { value: [0, 1, 2, 3, 4] },
  });
  const out = mat(OUT_FRAG, {
    tScene: { value: sceneRT.texture },
    tSky: { value: skyRT.texture },
    tGlow1: { value: A.texture },
    tGlow2: { value: C.texture },
    uHasSky: { value: 0 },
    uBg: { value: new THREE.Vector3() },
    uOn: { value: 1 },
    uGlow1: { value: 0 },
    uGlow2: { value: 0 },
    uKnee: { value: FINISH_DEFAULT.knee },
    uGrain: { value: FINISH_DEFAULT.grain },
    uVignette: { value: FINISH_DEFAULT.vignette },
    uRes: { value: new THREE.Vector2(1, 1) },
    uQuiet: { value: Array.from({ length: 10 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uQuietSoft: { value: 24 },
  });
  const materials = { down, half, blur, out };

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

  let dev = [0, 0];
  let css = [0, 0];
  return {
    sceneRT,
    skyRT,
    materials,
    // device size (drawing buffer) and CSS size of the canvas
    setSize(dw, dh, cw, ch) {
      dev = [dw, dh];
      css = [cw, ch];
      sceneRT.setSize(dw, dh);
      skyRT.setSize(dw, dh);
      const hw = Math.max(1, Math.ceil(cw / 2));
      const hh = Math.max(1, Math.ceil(ch / 2));
      A.setSize(hw, hh);
      B.setSize(hw, hh);
      C.setSize(Math.max(1, Math.ceil(hw / 2)), Math.max(1, Math.ceil(hh / 2)));
      Dt.setSize(Math.max(1, Math.ceil(hw / 2)), Math.max(1, Math.ceil(hh / 2)));
    },
    // o: { hasSky, bg: [r, g, b], quiet: CSS-px rects [l, t, r, b], dpr,
    //      tier, ...FINISH_DEFAULT overrides }
    compose(o) {
      const F = { ...FINISH_DEFAULT, ...o };
      const on = F.on ? 1 : 0;
      const tier = on && F.glow > 0 ? F.tier ?? 2 : 0;
      // a target that was never drawn is never bound: unused samplers point
      // at the scene's own texture
      for (const m of [down, out]) {
        m.uniforms.uHasSky.value = o.hasSky ? 1 : 0;
        m.uniforms.uBg.value.fromArray(o.bg);
        m.uniforms.tSky.value = o.hasSky ? skyRT.texture : sceneRT.texture;
      }
      out.uniforms.tGlow1.value = tier >= 1 ? A.texture : sceneRT.texture;
      out.uniforms.tGlow2.value = tier >= 2 ? C.texture : sceneRT.texture;
      if (tier >= 1) {
        down.uniforms.uSrcTexel.value.set(1 / dev[0], 1 / dev[1]);
        down.uniforms.uBlock.value = dev[0] / A.width;
        down.uniforms.uThresh.value = F.threshold;
        pass(down, A);
        // level 1: sigma ~4 CSS px
        blurPass(A, B, 2.0);
        if (tier >= 2) {
          half.uniforms.tSrc.value = A.texture;
          pass(half, C);
          // level 2: sigma ~12 CSS px
          blurPass(C, Dt, 3.0);
        }
      }
      const u = out.uniforms;
      u.uOn.value = on;
      u.uGlow1.value = tier >= 1 ? F.glow * 0.9 : 0;
      u.uGlow2.value = tier >= 2 ? F.glow * 0.7 : 0;
      u.uKnee.value = F.knee;
      u.uGrain.value = F.grain;
      u.uVignette.value = F.vignette;
      u.uRes.value.set(dev[0], dev[1]);
      const dpr = o.dpr || 1;
      const pad = 6;
      const H = css[1];
      u.uQuiet.value.forEach((v, i) => {
        const r = o.quiet?.[i];
        if (!r || !o.hasSky) v.set(0, 0, 0, 0);
        else v.set((r[0] - pad) * dpr, (H - r[3] - pad) * dpr, (r[2] + pad) * dpr, (H - r[1] + pad) * dpr);
      });
      u.uQuietSoft.value = 22 * dpr;
      pass(out, null);
    },
  };
}
