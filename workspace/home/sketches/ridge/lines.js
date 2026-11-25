// Weighted lines as screen-space ribbons: each segment is one instanced quad,
// expanded in the vertex shader to a width in CSS pixels (or a world width,
// whichever is wider), anti-aliased across its width in the fragment shader.
// Lines thinner than one device pixel keep a 1 px footprint and fade instead.

import * as THREE from 'three';
import { GLSL_COMMON, GLSL_UNIFORMS } from './glsl.js';

const VERT = /* glsl */ `
attribute vec3 aA;
attribute vec3 aB;
attribute vec4 aColA;
attribute vec4 aColB;
attribute vec4 aWid;
attribute vec2 aArc;
uniform float uNear;
uniform float uLift;
varying vec4 vCol;
varying float vSide;
varying float vHalfW;
varying float vAlphaK;
varying float vDist;
varying float vArc;

void main() {
  vec4 va = viewMatrix * vec4(aA, 1.0);
  vec4 vb = viewMatrix * vec4(aB, 1.0);
  // pull toward the eye a little so lines lying on the ground win the depth test
  va.xyz *= 1.0 - uLift;
  vb.xyz *= 1.0 - uLift;
  float nz = -uNear * 1.02;
  vCol = vec4(0.0);
  vSide = 0.0;
  vHalfW = 0.0;
  vAlphaK = 0.0;
  vDist = 0.0;
  vArc = 0.0;
  if (va.z > nz && vb.z > nz) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (va.z > nz) va = mix(va, vb, (nz - va.z) / (vb.z - va.z));
  if (vb.z > nz) vb = mix(vb, va, (nz - vb.z) / (va.z - vb.z));
  vec4 ca = projectionMatrix * va;
  vec4 cb = projectionMatrix * vb;
  vec2 sa = ca.xy / ca.w * 0.5 * uRes;
  vec2 sb = cb.xy / cb.w * 0.5 * uRes;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 1e-5 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  bool atA = position.x < 0.5;
  vec4 c = atA ? ca : cb;
  vec4 v = atA ? va : vb;
  float wPx = (atA ? aWid.x : aWid.y) * uDpr;
  float wWorld = atA ? aWid.z : aWid.w;
  float pxPerUnit = projectionMatrix[1][1] * 0.5 * uRes.y / max(c.w, 1e-4);
  float w = max(wPx, wWorld * pxPerUnit);
  vAlphaK = clamp(w, 0.0, 1.0);
  w = max(w, 1.0);
  float hw = 0.5 * w + 1.0;
  vec2 off = nrm * position.y * hw + dir * (atA ? -0.5 : 0.5) * w;
  c.xy += off / (0.5 * uRes) * c.w;
  gl_Position = c;
  vSide = position.y * hw;
  vHalfW = 0.5 * w;
  vCol = atA ? aColA : aColB;
  vDist = length(v.xyz);
  vArc = atA ? aArc.x : aArc.y;
}
`;

const FRAG = /* glsl */ `
uniform vec2 uFog;
uniform float uFogOn;
uniform float uQuietOn;
uniform vec2 uDash;
varying vec4 vCol;
varying float vSide;
varying float vHalfW;
varying float vAlphaK;
varying float vDist;
varying float vArc;

void main() {
  float cov = clamp(vHalfW + 0.5 - abs(vSide), 0.0, 1.0);
  float fogK = 1.0 - uFogOn * smoothstep(uFog.x, uFog.y, vDist);
  // dashes along the arc length (uDash.x = period in world units, y = duty)
  float ph = vArc / max(uDash.x, 1e-4);
  float gp = max(fwidth(ph), 1e-5);
  float dd = (abs(fract(ph) - 0.5 * uDash.y) - 0.5 * uDash.y) / gp;
  float dash = mix(1.0, clamp(0.5 - dd, 0.0, 1.0), step(0.001, uDash.x));
  float q = mix(1.0, quietMask(), uQuietOn);
  float a = cov * vAlphaK * vCol.a * fogK * fogK * dash * q;
#ifdef MAX_BLEND
  gl_FragColor = vec4(vCol.rgb * a, a);
#else
  gl_FragColor = vec4(vCol.rgb, a);
#endif
}
`;

// A batch of polylines. Each polyline: { pts: [[x,y,z],...], color: [r,g,b] or
// per-point colors, alpha (number or array), width (css px), worldWidth }.
export class LineBatch {
  constructor() {
    this.segs = [];
  }

  add(pts, { color, colors = null, alpha = 1, alphas = null, width = 1, widths = null, worldWidth = 0 }) {
    let arc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (l < 1e-7) continue;
      const ca = colors ? colors[i - 1] : color;
      const cb = colors ? colors[i] : color;
      const aa = alphas ? alphas[i - 1] : alpha;
      const ab = alphas ? alphas[i] : alpha;
      const wa = widths ? widths[i - 1] : width;
      const wb = widths ? widths[i] : width;
      this.segs.push([a, b, ca, aa, cb, ab, wa, wb, worldWidth, arc, arc + l]);
      arc += l;
    }
  }

  build(shared, { maxBlend = true, near = 0.1, lift = 0.002, fog = null, quiet = false, dash = null, renderOrder = 2, name = 'lines' } = {}) {
    const n = this.segs.length;
    const base = new THREE.InstancedBufferGeometry();
    base.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0]), 3));
    base.setIndex([0, 2, 1, 1, 2, 3]);
    const A = new Float32Array(n * 3), B = new Float32Array(n * 3);
    const CA = new Float32Array(n * 4), CB = new Float32Array(n * 4);
    const WID = new Float32Array(n * 4), ARC = new Float32Array(n * 2);
    this.segs.forEach((s, i) => {
      const [a, b, ca, aa, cb, ab, wa, wb, ww, s0, s1] = s;
      A.set(a, i * 3); B.set(b, i * 3);
      CA.set([ca[0], ca[1], ca[2], aa], i * 4);
      CB.set([cb[0], cb[1], cb[2], ab], i * 4);
      WID.set([wa, wb, ww, ww], i * 4);
      ARC.set([s0, s1], i * 2);
    });
    base.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 3));
    base.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 3));
    base.setAttribute('aColA', new THREE.InstancedBufferAttribute(CA, 4));
    base.setAttribute('aColB', new THREE.InstancedBufferAttribute(CB, 4));
    base.setAttribute('aWid', new THREE.InstancedBufferAttribute(WID, 4));
    base.setAttribute('aArc', new THREE.InstancedBufferAttribute(ARC, 2));
    base.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uNear: { value: near },
        uLift: { value: lift },
        uFog: { value: new THREE.Vector2(fog ? fog[0] : 0, fog ? fog[1] : 1) },
        uFogOn: { value: fog ? 1 : 0 },
        uQuietOn: { value: quiet ? 1 : 0 },
        uDash: { value: new THREE.Vector2(dash ? dash[0] : 0, dash ? dash[1] : 1) },
      },
      vertexShader: GLSL_UNIFORMS + VERT,
      fragmentShader: GLSL_COMMON + FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      defines: maxBlend ? { MAX_BLEND: 1 } : {},
    });
    if (maxBlend) {
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.MaxEquation;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneFactor;
    } else {
      mat.blending = THREE.NormalBlending;
    }
    const mesh = new THREE.Mesh(base, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.name = name;
    mesh.userData.segments = n;
    return mesh;
  }
}
