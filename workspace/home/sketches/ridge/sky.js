// The sky: one full-screen pass drawn first (night, aurora curtains, horizon
// hairline), plus star points or long-exposure trails drawn after the terrain
// so the mountain occludes them.

import * as THREE from 'three';
import { GLSL_NOISE } from './world.js';
import { starField, starTrails, poleDir } from './skymath.js';
import { GLSL_COMMON } from './glsl.js';
import { buildPoints } from './points.js';
import { LineBatch } from './lines.js';
import { rgb, vec3, HEX } from './glsl.js';

const VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uNight;
uniform vec3 uInk;
uniform vec3 uLine;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec4 uAur; // centre azimuth, half span, hem elevation, ray length (radians)
uniform float uAurK;
uniform float uHorizon;
varying vec2 vNdc;

float wrapPi(float a) {
  return a - 6.2831853 * floor((a + 3.14159265) / 6.2831853);
}

// Elevation of a curtain's lower hem along the azimuth: a sweeping, rippled line.
float hemEl(float az, float layer) {
  return uAur.z + layer * 0.055 + 0.1 * az
    + 0.04 * sin(az * 6.5 + 0.8 + layer * 2.1)
    + 0.022 * sin(az * 15.0 + 2.0 + layer * 1.3)
    + 0.012 * fbm(az * 24.0 + layer * 7.0, 1.7 + layer, 2, 131);
}

// How strongly the curtain shows at this azimuth: an envelope broken into patches.
float strength(float az, float layer) {
  float span = uAur.y;
  float env = smoothstep(-span, -0.3 * span, az) * (1.0 - smoothstep(0.3 * span, span, az));
  float pch = clamp(0.45 + 1.5 * fbm(az * 4.5 + 3.0 + layer * 5.0, layer + 9.0, 3, 141), 0.0, 1.0);
  return env * pch;
}

// One curtain drawn in the sketch's own language: the hem and a few echo
// isolines above it, plus sparse vertical rays of very uneven length whose
// spacing tightens where the curtain folds.
float curtain(vec3 d, float layer) {
  float az = wrapPi(atan(d.x, -d.z) - uAur.x);
  float el = atan(d.y, length(d.xz));
  float e = el - hemEl(az, layer);
  float ge = max(length(vec2(dFdx(e), dFdy(e))), 1e-7);
  float st = strength(az, layer);

  float lines = isoline0(e, ge, 1.25 * uDpr);
  lines = max(lines, 0.42 * isoline0(e - 0.012 - 0.005 * fbm(az * 11.0, layer + 3.0, 2, 161), ge, uDpr));
  lines = max(lines, 0.2 * isoline0(e - 0.032 - 0.01 * fbm(az * 9.0, layer + 5.0, 2, 163), ge, uDpr));

  float ph = az * 19.0 + layer * 2.3 + 3.0 * fbm(az * 3.0 + layer * 4.0, 0.3, 2, 121);
  float u = (az + 0.04 * sin(ph) + 0.018 * sin(2.0 * ph + 1.3)) * (120.0 + 40.0 * layer);
  float gu = max(length(vec2(dFdx(u), dFdy(u))), 1e-6);
  float spacing = 1.0 / gu;
  float rid = floor(u + 0.5);
  float w = uDpr;
  float cov = clamp(0.5 * w + 0.5 - abs(u - rid) * spacing, 0.0, 1.0);
  float lineT = mix(clamp(w / spacing, 0.0, 1.0), cov, smoothstep(2.5 * uDpr, 5.0 * uDpr, spacing));
  float rnd = clamp(0.5 + 0.9 * gnoise(rid * 1.618 + 0.37, layer * 3.1 + 0.5, 137), 0.0, 1.0);
  float len = uAur.w * (0.1 + 0.9 * rnd * rnd * rnd);
  float prof = smoothstep(-0.002, 0.002, e) * exp(-max(e, 0.0) / len);
  float rays = lineT * prof * (0.3 + 0.7 * rnd);

  // only the front curtain carries the hem lines; the one behind is rays only
  return st * max(lines * (1.0 - layer), rays);
}

void main() {
  vec4 pv = uProjInv * vec4(vNdc, 1.0, 1.0);
  vec3 dv = normalize(pv.xyz / pv.w);
  vec3 d = normalize(mat3(uCamWorld) * dv);

  float lum = 0.0;
  if (uAurK > 0.0) {
    lum = max(0.62 * curtain(d, 0.0), 0.3 * curtain(d, 1.0));
    lum *= uAurK * quietMask();
  }
  vec3 col = mix(uNight, uInk, clamp(lum, 0.0, 1.0));

  // horizon hairline at eye level (only where the ground does not cover it)
  float el = asin(clamp(d.y, -1.0, 1.0));
  float gel = max(length(vec2(dFdx(el), dFdy(el))), 1e-7);
  float hz = clamp(0.5 * uDpr + 0.5 - abs(el) / gel, 0.0, 1.0) * uHorizon;
  col = mix(col, uLine, hz);

  gl_FragColor = vec4(col + dither(), 1.0);
}
`;

export function buildSkyPass(shared, scene) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uProjInv: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uAur: { value: new THREE.Vector4(scene.auroraAz, scene.auroraSpan, scene.auroraBase, scene.auroraHeight) },
      uAurK: { value: scene.aurora },
      uHorizon: { value: scene.horizon },
    },
    vertexShader: VERT,
    fragmentShader: GLSL_COMMON + GLSL_NOISE + FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  mesh.userData.syncCamera = (camera) => {
    mat.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
    mat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
  };
  return mesh;
}

// Star points on a sphere around the camera (inside the far plane).
export function buildStars(shared, scene, cam) {
  const R = cam.far * 0.6;
  const pts = starField().map((s) => ({
    p: [cam.pos[0] + s.dir[0] * R, cam.pos[1] + s.dir[1] * R, cam.pos[2] + s.dir[2] * R],
    size: s.size,
    alpha: s.alpha * scene.stars,
  }));
  return buildPoints(shared, pts, { color: vec3(HEX.ink), quiet: true, renderOrder: 1, name: 'stars' });
}

// Long-exposure trails around the pole, as weighted ribbons.
export function buildTrails(shared, pole, cam) {
  const R = cam.far * 0.6;
  const ink = rgb(HEX.ink), muted = rgb(HEX.muted);
  const batch = new LineBatch();
  for (const arc of starTrails(poleDir(pole.az, pole.el))) {
    const pts = arc.pts.map((d) => [cam.pos[0] + d[0] * R, cam.pos[1] + d[1] * R, cam.pos[2] + d[2] * R]);
    const c = arc.b > 0.25 ? ink : muted;
    batch.add(pts, { color: c, alpha: arc.alpha, width: arc.width });
  }
  return batch.build(shared, { near: cam.near, lift: 0, quiet: true, renderOrder: 1, name: 'trails' });
}
