// The mountain: a mesh only for occlusion (night fill), with every line
// computed per pixel from the analytic height in the fragment shader.

import * as THREE from 'three';
import { heightAt, GLSL_HEIGHT } from './world.js';
import { GLSL_COMMON } from './glsl.js';

// Samples along one axis: uniform inside the focus [a, b], then geometric
// growth out to `outer` beyond each side. Puts the triangles where the shot
// looks, so silhouettes stay smooth at a fixed triangle budget.
function axisSamples(a, b, n, frac, outer) {
  const nf = Math.max(2, Math.round(n * frac));
  const no = Math.max(0, Math.floor((n - nf) / 2));
  const s0 = (b - a) / (nf - 1);
  const focus = [];
  for (let i = 0; i < nf; i++) focus.push(a + i * s0);
  if (no === 0) return focus;
  const reach = (q) => {
    let sum = 0, st = s0;
    for (let i = 0; i < no; i++) { st *= q; sum += st; }
    return sum;
  };
  let lo = 0.2, hi = 1.5;
  while (reach(hi) < outer) hi *= 1.25;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    if (reach(m) < outer) lo = m; else hi = m;
  }
  const q = 0.5 * (lo + hi);
  const left = [], right = [];
  let st = s0, x = a, y = b;
  for (let i = 0; i < no; i++) {
    st *= q;
    x -= st; y += st;
    left.push(x); right.push(y);
  }
  return left.reverse().concat(focus, right);
}

export function buildTerrainGeometry(grid) {
  const xs = axisSamples(grid.x0, grid.x1, grid.n, grid.frac ?? 0.78, grid.outer ?? 320);
  const zs = axisSamples(grid.z0, grid.z1, grid.n, grid.frac ?? 0.78, grid.outer ?? 320);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const nrm = new Float32Array(nx * nz * 3);
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const h = heightAt(xs[i], zs[j]);
      H[k] = h;
      pos[k * 3] = xs[i];
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = zs[j];
    }
  }
  // normals from central differences on the (non-uniform) grid
  for (let j = 0; j < nz; j++) {
    const j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, nz - 1);
    for (let i = 0; i < nx; i++) {
      const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, nx - 1);
      const dhdx = (H[j * nx + i1] - H[j * nx + i0]) / (xs[i1] - xs[i0]);
      const dhdz = (H[j1 * nx + i] - H[j0 * nx + i]) / (zs[j1] - zs[j0]);
      const l = Math.hypot(dhdx, 1, dhdz);
      const k = (j * nx + i) * 3;
      nrm[k] = -dhdx / l;
      nrm[k + 1] = 1 / l;
      nrm[k + 2] = -dhdz / l;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let p = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      // split each quad along the shorter diagonal in height for a smoother hull
      if (Math.abs(H[a] - H[d]) < Math.abs(H[b] - H[c])) {
        idx[p++] = a; idx[p++] = c; idx[p++] = d;
        idx[p++] = a; idx[p++] = d; idx[p++] = b;
      } else {
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

const VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normal;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uNight;
uniform vec3 uInk;
uniform vec3 uAccent;
uniform vec2 uFog;
uniform float uInkK;
uniform vec3 uLevels;
uniform float uWidthK;
uniform vec3 uLight;
uniform vec4 uRing;
uniform vec4 uSlice;
varying vec3 vW;
varying vec3 vN;

void main() {
  float h = heightAt(vW.x, vW.z);
  float gh = length(vec2(dFdx(h), dFdy(h)));

  // slope and moonlit aspect from the smooth vertex normal
  vec3 n = normalize(vN);
  float ny = max(n.y, 0.05);
  float slope = sqrt(max(1.0 / (ny * ny) - 1.0, 0.0));
  float sw = 0.75 + 0.55 * smoothstep(0.15, 1.35, slope);
  vec2 nh = n.xz / max(length(n.xz), 1e-3);
  float lit = clamp(0.5 + 0.9 * dot(nh, normalize(uLight.xz)) * clamp(slope * 2.0, 0.0, 1.0), 0.0, 1.0);
  float wk = uDpr * uWidthK * sw * mix(0.85, 1.2, lit);

  // three families: fine 0.08, minor 0.4, major (every fifth minor) 2.0
  float fine = isolines(h * 12.5, gh * 12.5, 0.8 * wk) * 0.3 * uLevels.x;
  float minor = isolines(h * 2.5, gh * 2.5, 1.0 * wk) * 0.55 * uLevels.y;
  float major = isolines(h * 0.5, gh * 0.5, 1.6 * wk) * 0.92 * uLevels.z;
  float ink = max(max(fine, minor), major);

  float dist = length(vW - cameraPosition);
  float fogK = 1.0 - smoothstep(uFog.x, uFog.y, dist);
  ink *= fogK * sqrt(fogK) * uInkK * (0.5 + 0.75 * lit) * quietMask();

  // accent isolines: a ring round one cairn, or one slice through the cirque
  float rd = length(vW.xz - uRing.xy) - uRing.z;
  float grd = length(vec2(dFdx(rd), dFdy(rd)));
  float acc = isoline0(rd, grd, 2.0 * uDpr) * uRing.w;
  float sm = 1.0 - smoothstep(uSlice.w, uSlice.w + 1.5, length(vW.xz - uSlice.yz));
  acc = max(acc, isoline0(h - uSlice.x, gh, 2.0 * uDpr) * sm * step(0.001, uSlice.w));

  vec3 col = mix(uNight, uInk, clamp(ink, 0.0, 1.0));
  col = mix(col, uAccent, clamp(acc, 0.0, 1.0));
  gl_FragColor = vec4(col + dither(), 1.0);
}
`;

export function buildTerrain(shared, scene, world) {
  const geo = buildTerrainGeometry(scene.grid);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uFog: { value: new THREE.Vector2(scene.fog[0], scene.fog[1]) },
      uInkK: { value: scene.ink },
      uLevels: { value: new THREE.Vector3(scene.fine, scene.minor, scene.major) },
      uWidthK: { value: scene.width },
      uLight: { value: new THREE.Vector3(-0.62, 0.55, -0.28).normalize() },
      uRing: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSlice: { value: new THREE.Vector4(0, 0, 0, 0) },
    },
    vertexShader: VERT,
    fragmentShader: GLSL_COMMON + GLSL_HEIGHT + FRAG,
  });
  if (scene.ring >= 0) {
    const c = world.cairns[scene.ring];
    mat.uniforms.uRing.value.set(c.position[0], c.position[2], c.stones[0].radii[0] * 1.38, 1);
  }
  if (scene.slice) {
    mat.uniforms.uSlice.value.set(scene.slice.h, world.cirque.qx, world.cirque.qz, scene.slice.radius);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  mesh.name = 'terrain';
  return mesh;
}
