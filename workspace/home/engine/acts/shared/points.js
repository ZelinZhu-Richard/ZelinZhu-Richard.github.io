// Round point sprites sized in CSS px: page dots (an anti-aliased disc,
// alpha-blended) and small lights (a core and a halo, added). One draw per
// set. Sizes follow whatever is being drawn into (shared/render.js
// drawPixelRatio), so a half-size target does not double them.

import { drawPixelRatio, premultipliedBlend } from './render.js';

export const POINT_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uDpr;
uniform float uScale;
uniform float uLift;
uniform vec2 uFog;
varying vec3 vColor;
varying float vAlpha;
varying float vSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float l = length(mv.xyz);
  // pulled toward the eye so a light on a surface is not cut by it
  if (uLift > 0.0 && l > 1e-5) mv.xyz *= max(1.0 - uLift / l, 0.0);
  gl_Position = projectionMatrix * mv;
  float s = aSize * uScale * uDpr;
  // below 2 device px a point keeps its light by dimming instead of shrinking
  float cover = clamp(s * 0.5, 0.0, 1.0);
  vSize = clamp(max(s, 2.0), 2.0, 128.0);
  gl_PointSize = vSize;
  vColor = aColor;
  vAlpha = aAlpha * cover * cover * (1.0 - smoothstep(uFog.x, uFog.y, l));
}
`;

export const POINT_FRAG = /* glsl */ `
uniform float uDisc;
uniform float uHalo;
uniform float uHaloK;
uniform float uCore;
uniform float uCoreK;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
varying float vSize;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  // an anti-aliased disc: distance to its rim in device px
  float disc = clamp((1.0 - r) * vSize * 0.5 + 0.5, 0.0, 1.0);
  float k = uDisc * disc + uHalo * exp(-r2 * uHaloK) + uCore * exp(-r2 * uCoreK);
  float a = k * vAlpha * uOpacity;
  if (a < 0.0005) discard;
  gl_FragColor = vec4(vColor * a, a);
}
`;

/**
 * @typedef {{ p: ArrayLike<number>, color?: ArrayLike<number>, size?: number, alpha?: number }} PointSpec
 * @typedef {{ additive?: boolean, disc?: number, halo?: number, haloK?: number, core?: number, coreK?: number,
 *   lift?: number, depthTest?: boolean, renderOrder?: number, name?: string }} PointLook
 */

/**
 * A set of points. Positions, colours (linear, may be HDR), sizes (CSS px) and
 * alphas can be rewritten per frame through `set(i, ...)` + `commit()`.
 * @param {any} THREE
 * @param {PointSpec[]} specs
 * @param {PointLook} [look]
 */
export function createPoints(THREE, specs, look = {}) {
  const n = Math.max(1, specs.length);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  specs.forEach((s, i) => {
    pos.set([s.p[0], s.p[1], s.p[2]], i * 3);
    const c = s.color || [1, 1, 1];
    col.set([c[0], c[1], c[2]], i * 3);
    size[i] = s.size ?? 2;
    alpha[i] = s.alpha ?? 1;
  });
  const g = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3);
  const aCol = new THREE.BufferAttribute(col, 3);
  const aSize = new THREE.BufferAttribute(size, 1);
  const aAlpha = new THREE.BufferAttribute(alpha, 1);
  for (const a of [aPos, aCol, aSize, aAlpha]) a.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aPos);
  g.setAttribute('aColor', aCol);
  g.setAttribute('aSize', aSize);
  g.setAttribute('aAlpha', aAlpha);
  g.setDrawRange(0, specs.length);
  const additive = !!look.additive;
  const uniforms = {
    uDpr: { value: 1 },
    uScale: { value: 1 },
    uLift: { value: look.lift ?? 0 },
    uFog: { value: new THREE.Vector2(1e6, 2e6) },
    uDisc: { value: look.disc ?? (additive ? 0 : 1) },
    uHalo: { value: look.halo ?? (additive ? 1 : 0) },
    uHaloK: { value: look.haloK ?? 6 },
    uCore: { value: look.core ?? 0 },
    uCoreK: { value: look.coreK ?? 40 },
    uOpacity: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    name: look.name || 'act-points',
    uniforms,
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: look.depthTest ?? true,
  });
  premultipliedBlend(THREE, material, additive ? 'add' : 'over');
  const points = new THREE.Points(g, material);
  points.name = look.name || 'act-points';
  points.frustumCulled = false;
  points.renderOrder = look.renderOrder ?? 3;
  const v4 = new THREE.Vector4();
  const v2 = new THREE.Vector2();
  points.onBeforeRender = (/** @type {any} */ renderer) => {
    uniforms.uDpr.value = drawPixelRatio(renderer, v4, v2);
  };
  return {
    object3D: points,
    material,
    uniforms,
    count: specs.length,
    /**
     * @param {number} i
     * @param {{ p?: ArrayLike<number>, color?: ArrayLike<number>, size?: number, alpha?: number }} s
     */
    set(i, s) {
      if (s.p) {
        pos[i * 3] = s.p[0];
        pos[i * 3 + 1] = s.p[1];
        pos[i * 3 + 2] = s.p[2];
      }
      if (s.color) {
        col[i * 3] = s.color[0];
        col[i * 3 + 1] = s.color[1];
        col[i * 3 + 2] = s.color[2];
      }
      if (s.size !== undefined) size[i] = s.size;
      if (s.alpha !== undefined) alpha[i] = s.alpha;
    },
    commit() {
      aPos.needsUpdate = true;
      aCol.needsUpdate = true;
      aSize.needsUpdate = true;
      aAlpha.needsUpdate = true;
    },
    /** @param {number} near @param {number} far */
    setFog(near, far) {
      uniforms.uFog.value.set(near, far);
    },
    dispose() {
      g.dispose();
      material.dispose();
      points.removeFromParent();
    },
  };
}
