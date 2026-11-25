// Round, anti-aliased points: stars, snow and the headlamp.

import * as THREE from 'three';
import { GLSL_COMMON, GLSL_UNIFORMS } from './glsl.js';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
uniform float uLift;
varying float vAlpha;
varying float vSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.xyz *= 1.0 - uLift;
  gl_Position = projectionMatrix * mv;
  float s = aSize * uDpr;
  vAlpha = aAlpha * clamp(s, 0.0, 1.0);
  s = max(s, 1.0);
  vSize = s;
  gl_PointSize = s + 2.0;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uQuietOn;
varying float vAlpha;
varying float vSize;
void main() {
  float r = length(gl_PointCoord - vec2(0.5)) * (vSize + 2.0);
  float cov = clamp(0.5 * vSize + 0.5 - r, 0.0, 1.0);
  float q = mix(1.0, quietMask(), uQuietOn);
  float a = cov * vAlpha * q;
#ifdef MAX_BLEND
  gl_FragColor = vec4(uColor * a, a);
#else
  gl_FragColor = vec4(uColor, a);
#endif
}
`;

// pts: [{ p: [x,y,z], size (css px), alpha }]
export function buildPoints(shared, pts, { color, maxBlend = true, lift = 0, quiet = false, renderOrder = 1, name = 'points' }) {
  const n = pts.length;
  const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  pts.forEach((q, i) => {
    pos.set(q.p, i * 3);
    size[i] = q.size;
    alpha[i] = q.alpha;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uColor: { value: color },
      uLift: { value: lift },
      uQuietOn: { value: quiet ? 1 : 0 },
    },
    vertexShader: GLSL_UNIFORMS + VERT,
    fragmentShader: GLSL_COMMON + FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
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
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = renderOrder;
  points.name = name;
  return points;
}
