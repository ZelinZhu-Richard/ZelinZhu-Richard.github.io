// WebGL side: weighted ink ribbons, dots and the final composite.
// Ribbons are expanded in screen space so a line is never thinner than
// RIBBON.minW CSS px; below that it fades instead of thinning (no shimmer).

import * as THREE from 'three';
import { orderDraws, alongPx, COL, RIBBON } from './compose.js';

const RIBBON_VERT = /* glsl */ `
uniform vec2 uRes;      // drawing buffer size, device px
uniform float uDpr;     // device px per CSS px
uniform float uMinW;    // CSS px
uniform float uHaloBase;
uniform float uHaloK;
uniform float uHaloMax;
uniform vec3 uNight;

in vec3 aPrev;
in vec3 aNext;
in vec4 aStyle;  // x width (world diameter; negative = CSS px), y alpha, z halo strength, w along (CSS px)
in vec3 aColor;
in vec4 aMeta;   // x side (-1 | +1), y kind (0 ink | 1 halo), z hatch, w dash period (CSS px)

out vec3 vColor;
out float vAlpha;
out float vEdge;
out float vHalfIn;
out float vHalfOut;
out float vAlong;
out float vDash;
out float vHatch;
out vec2 vNrm;

vec2 toScreen(vec4 c) {
  return (c.xy / c.w * 0.5 + 0.5) * uRes;
}

void main() {
  vColor = aColor;
  vAlpha = 0.0;
  vEdge = aMeta.x;
  vHalfIn = 1.0;
  vHalfOut = 2.0;
  vAlong = 0.0;
  vDash = 0.0;
  vHatch = 0.0;
  vNrm = vec2(0.0, 1.0);

  mat4 pmv = projectionMatrix * modelViewMatrix;
  vec4 cC = pmv * vec4(position, 1.0);
  vec4 cP = pmv * vec4(aPrev, 1.0);
  vec4 cN = pmv * vec4(aNext, 1.0);
  if (cC.w < 1e-3) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0); // behind the eye: clipped
    return;
  }
  if (cP.w < 1e-3) cP = cC;
  if (cN.w < 1e-3) cN = cC;

  vec2 sC = toScreen(cC);
  vec2 dA = sC - toScreen(cP);
  vec2 dB = toScreen(cN) - sC;
  float lA = length(dA);
  float lB = length(dB);
  vec2 tA = lA > 1e-4 ? dA / lA : vec2(0.0);
  vec2 tB = lB > 1e-4 ? dB / lB : vec2(0.0);
  if (lA <= 1e-4) tA = tB;
  if (lB <= 1e-4) tB = tA;
  if (dot(tA, tA) < 0.5) {
    tA = vec2(1.0, 0.0);
    tB = tA;
  }
  vec2 t = tA + tB;
  float lt = length(t);
  t = lt > 1e-3 ? t / lt : tA;
  vec2 n = vec2(-t.y, t.x);
  float miter = 1.0 / max(dot(n, vec2(-tA.y, tA.x)), 0.4);

  // width in device px; sub-minimum lines fade rather than thin
  float wpx = aStyle.x < 0.0 ? -aStyle.x * uDpr : aStyle.x * projectionMatrix[1][1] * 0.5 * uRes.y / cC.w;
  float alpha = aStyle.y;
  float minW = uMinW * uDpr;
  if (wpx < minW) {
    alpha *= wpx / minW;
    wpx = minW;
  }
  float halfIn = 0.5 * wpx;
  vec3 col = aColor;
  float hatch = aMeta.z;
  if (aMeta.y > 0.5) {
    // the night halo that lets near lines cut the lines behind them
    halfIn += min(uHaloBase + uHaloK * wpx / uDpr, uHaloMax) * uDpr;
    alpha = aStyle.z * min(1.0, alpha * 1.6);
    col = uNight;
    hatch = 0.0;
  }
  float halfOut = halfIn + 1.0;
  gl_Position = cC;
  gl_Position.xy += n * aMeta.x * halfOut * miter / uRes * 2.0 * cC.w;

  vColor = col;
  vAlpha = alpha;
  vHalfIn = halfIn;
  vHalfOut = halfOut;
  vAlong = aStyle.w * uDpr;
  vDash = aMeta.w * uDpr;
  vHatch = hatch;
  vNrm = n;
}
`;

const RIBBON_FRAG = /* glsl */ `
uniform float uDpr;
uniform float uHatchSp;

in vec3 vColor;
in float vAlpha;
in float vEdge;
in float vHalfIn;
in float vHalfOut;
in float vAlong;
in float vDash;
in float vHatch;
in vec2 vNrm;

layout(location = 0) out highp vec4 outColor;

const vec3 LIGHT = vec3(-0.5499, 0.6198, 0.5599); // normalize(-0.55, 0.62, 0.56)

void main() {
  float x = vEdge * vHalfOut; // signed device px from the centre line
  float d = abs(x);
  float cov = clamp(vHalfIn + 0.5 - d, 0.0, 1.0);
  if (vHatch > 0.5) {
    // wide ribbons are engraved: lengthwise lines whose weight follows a
    // cylinder lit from the upper left, plus a contour at each edge
    float core = 2.0 * vHalfIn / uDpr;
    float eng = smoothstep(5.0, 9.0, core);
    if (eng > 0.0) {
      float u = clamp(x / vHalfIn, -1.0, 1.0);
      float sp = uHatchSp * uDpr;
      float dl = abs(fract(x / sp + 0.5) - 0.5) * sp;
      vec3 nrm = vec3(u * vNrm, sqrt(max(0.0, 1.0 - u * u)));
      float lit = clamp(dot(nrm, LIGHT), 0.0, 1.0);
      float th = (0.35 + 1.0 * lit) * uDpr;
      float hatch = clamp(th + 0.5 - dl, 0.0, 1.0);
      float rim = clamp(uDpr + 0.5 - (vHalfIn - d), 0.0, 1.0);
      float body = max(max(hatch, rim), 0.1 + 0.1 * lit);
      cov *= mix(1.0, body, eng);
    }
  }
  if (vDash > 0.0) {
    float f = fract(vAlong / vDash) - 0.5;
    cov *= clamp(vDash * 0.25 - abs(f) * vDash + 0.5, 0.0, 1.0);
  }
  float a = cov * vAlpha;
  if (a < 0.003) discard;
  outColor = vec4(vColor, a);
}
`;

const DOT_VERT = /* glsl */ `
uniform vec2 uRes;
uniform float uDpr;
in vec3 iPos;
in vec4 iStyle; // x radius (CSS px), y alpha, z halo (CSS px)
in vec3 iColor;
out vec2 vP;
out float vR;
out float vH;
out float vA;
out vec3 vC;
void main() {
  vec4 c = projectionMatrix * modelViewMatrix * vec4(iPos, 1.0);
  float r = iStyle.x * uDpr;
  float h = iStyle.z * uDpr;
  float ext = r + h + 1.0;
  vP = position.xy * ext;
  vR = r;
  vH = h;
  vA = iStyle.y;
  vC = iColor;
  gl_Position = c;
  gl_Position.xy += position.xy * ext / uRes * 2.0 * c.w;
  if (c.w < 1e-3) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}
`;

const DOT_FRAG = /* glsl */ `
uniform vec3 uNight;
in vec2 vP;
in float vR;
in float vH;
in float vA;
in vec3 vC;
layout(location = 0) out highp vec4 outColor;
void main() {
  float d = length(vP);
  float ink = clamp(vR + 0.5 - d, 0.0, 1.0) * vA;
  if (vH < 0.01) {
    if (ink < 0.003) discard;
    outColor = vec4(vC, ink);
    return;
  }
  float halo = clamp(vR + vH + 0.5 - d, 0.0, 1.0);
  if (halo < 0.003) discard;
  outColor = vec4(mix(uNight, vC, ink / halo), halo);
}
`;

const POST_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Scene colours are already display-space values; the composite lays the
// premultiplied ink over a faint vignette and adds a TPDF dither so the
// near-black never bands.
const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform vec3 uNight;
uniform vec3 uStage;
uniform float uVig;
in vec2 vUv;
layout(location = 0) out highp vec4 outColor;
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
void main() {
  vec4 s = texture(tScene, vUv);
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  float r = length(q);
  vec3 bg = mix(uNight, uStage, uVig * smoothstep(0.35, 1.1, r));
  vec3 c = s.rgb + bg * (1.0 - s.a);
  float n = ign(gl_FragCoord.xy) + ign(gl_FragCoord.xy + vec2(47.0, 17.0)) - 1.0;
  c += n / 255.0;
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export function buildRibbons(out, dpr, res) {
  const draws = orderDraws(out);
  let nv = 0;
  let ni = 0;
  for (const d of draws) {
    const n = d.e - d.s + 1;
    nv += 2 * n;
    ni += 6 * (n - 1);
  }
  const pos = new Float32Array(nv * 3);
  const prev = new Float32Array(nv * 3);
  const next = new Float32Array(nv * 3);
  const style = new Float32Array(nv * 4);
  const color = new Float32Array(nv * 3);
  const meta = new Float32Array(nv * 4);
  const index = new Uint32Array(ni);
  const alongs = new Map();
  let v = 0;
  let k = 0;
  for (const d of draws) {
    const ch = d.ch;
    let al = alongs.get(ch);
    if (!al) alongs.set(ch, (al = ch.dash > 0 ? alongPx(ch, out.P) : new Float32Array(ch.n)));
    const base = v;
    for (let i = d.s; i <= d.e; i++) {
      const ip = i > 0 ? i - 1 : i;
      const inx = i < ch.n - 1 ? i + 1 : i;
      for (let side = -1; side <= 1; side += 2) {
        pos[3 * v] = ch.p[3 * i];
        pos[3 * v + 1] = ch.p[3 * i + 1];
        pos[3 * v + 2] = ch.p[3 * i + 2];
        prev[3 * v] = ch.p[3 * ip];
        prev[3 * v + 1] = ch.p[3 * ip + 1];
        prev[3 * v + 2] = ch.p[3 * ip + 2];
        next[3 * v] = ch.p[3 * inx];
        next[3 * v + 1] = ch.p[3 * inx + 1];
        next[3 * v + 2] = ch.p[3 * inx + 2];
        style[4 * v] = ch.w[i];
        style[4 * v + 1] = ch.a[i];
        style[4 * v + 2] = ch.h[i];
        style[4 * v + 3] = al[i];
        color[3 * v] = ch.c[3 * i];
        color[3 * v + 1] = ch.c[3 * i + 1];
        color[3 * v + 2] = ch.c[3 * i + 2];
        meta[4 * v] = side;
        meta[4 * v + 1] = d.kind;
        meta[4 * v + 2] = ch.hatch;
        meta[4 * v + 3] = ch.dash;
        v++;
      }
    }
    for (let i = 0; i < d.e - d.s; i++) {
      const a = base + 2 * i;
      index[k++] = a;
      index[k++] = a + 1;
      index[k++] = a + 2;
      index[k++] = a + 1;
      index[k++] = a + 3;
      index[k++] = a + 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPrev', new THREE.BufferAttribute(prev, 3));
  geo.setAttribute('aNext', new THREE.BufferAttribute(next, 3));
  geo.setAttribute('aStyle', new THREE.BufferAttribute(style, 4));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aMeta', new THREE.BufferAttribute(meta, 4));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    uniforms: {
      uRes: { value: new THREE.Vector2(res[0], res[1]) },
      uDpr: { value: dpr },
      uMinW: { value: RIBBON.minW },
      uHaloBase: { value: RIBBON.haloBase },
      uHaloK: { value: RIBBON.haloK },
      uHaloMax: { value: RIBBON.haloMax },
      uHatchSp: { value: RIBBON.hatchSpacing },
      uNight: { value: new THREE.Vector3(...COL.night) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return { mesh, triangles: ni / 3 };
}

export function buildDots(dots, dpr, res, renderOrder) {
  const n = dots.length;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const p = new Float32Array(Math.max(1, n) * 3);
  const s = new Float32Array(Math.max(1, n) * 4);
  const c = new Float32Array(Math.max(1, n) * 3);
  dots.forEach((d, i) => {
    p.set(d.p, 3 * i);
    s.set([d.r, d.a, d.halo, 0], 4 * i);
    c.set(d.c, 3 * i);
  });
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(p, 3));
  geo.setAttribute('iStyle', new THREE.InstancedBufferAttribute(s, 4));
  geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(c, 3));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: DOT_VERT,
    fragmentShader: DOT_FRAG,
    uniforms: {
      uRes: { value: new THREE.Vector2(res[0], res[1]) },
      uDpr: { value: dpr },
      uNight: { value: new THREE.Vector3(...COL.night) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.visible = n > 0;
  return mesh;
}

export function buildComposite(texture, res) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    uniforms: {
      tScene: { value: texture },
      uRes: { value: new THREE.Vector2(res[0], res[1]) },
      uNight: { value: new THREE.Vector3(...COL.night) },
      uStage: { value: new THREE.Vector3(...COL.stage) },
      uVig: { value: 0.7 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, mesh, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}

export const SHADERS = { RIBBON_VERT, RIBBON_FRAG, DOT_VERT, DOT_FRAG, POST_VERT, POST_FRAG };
