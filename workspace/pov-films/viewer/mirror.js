// Planar reflections for glossy ground and water.
//
// Any mesh whose object name (or its parent's name, for multi-material meshes)
// contains "ground" or "water", case-insensitive, gets a mirror; so does a mesh
// whose name matches viewer.json mirror.ground / mirror.water, or whose glTF
// extras carry mirror_strength (water when mirror_ripple > 0). Meshes whose
// materials are all rough (0.8 and up, where the reflection is under 8 percent
// of fresnel) are left alone. Meshes that share a plane share one mirror render.
// The mesh keeps its own glTF material;
// the mirror image is added on top with Schlick fresnel, blurred by the
// material roughness and stretched into vertical streaks the way wet asphalt
// streaks every light. "water" meshes also get a gentle animated ripple.
// The mirror image already holds the sky, so a glossy mirror keeps only part
// of the environment map's own specular (mirror.env), or it would count the
// sky twice.
//
// Optional per-object glTF extras (Blender custom properties, exported with
// "Include > Custom Properties"):
//   mirror_strength  0..2, default 1
//   mirror_streak    0..3, default 1 for ground, 0.5 for water
//   mirror_ripple    0..3, default 0 for ground, 1 for water
//   mirror_env       0..1, share of the environment specular kept where glossy
//   mirror_shift     -1..1, moves the streak along its length (+ = toward the viewer)
// and on any mesh: pk_mirror_only (truthy) draws it in reflections only.

import * as THREE from 'three';

export const MIRROR_NAME = /ground|water/i;

const MAX_GROUPS = 3;
const ROUGH = 0.8;
// Environment specular kept on a fully glossy mirror. The mirror image holds the sky
// too, so below 1 it stops counting the sky twice; 1 is what the films were tuned with.
export const MIRROR_ENV = 1;
// Meshes lying on a mirror plane (top no higher than this above it, in metres) are
// drawn upper side only in its reflection pass, so they cannot hide the reflection.
const FLAT = 0.1;
// Layer for meshes seen only in reflections (glTF extras pk_mirror_only, or the
// viewer.json mirror.only pattern): emissive cards that stand in for the glossy
// highlight of an area light, which glTF cannot carry.
export const MIRROR_ONLY_LAYER = 5;

// Moves the mirror-only meshes to their layer; the reflection cameras see it, the
// view camera does not. Returns them.
export function markMirrorOnly(root, src) {
  const only = patternOf(src);
  const nameOf = (o) => (o.userData && o.userData.name) || o.name || '';
  const flagged = (o) => !!(o && o.userData && o.userData.pk_mirror_only) || !!(only && o && only.test(nameOf(o)));
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.parent;
    const wrap = p && p !== root && p.isGroup && p.children.every((c) => c.isMesh);
    if (flagged(o) || (wrap && flagged(p))) {
      o.layers.set(MIRROR_ONLY_LAYER);
      out.push(o);
    }
  });
  return out;
}

function patternOf(src) {
  if (!src) return null;
  try {
    return new RegExp(src, 'i');
  } catch (err) {
    console.warn('Ignoring mirror pattern', src, err);
    return null;
  }
}

function kindOf(o, extra) {
  const name = (o.userData && o.userData.name) || o.name || '';
  const m = name.match(MIRROR_NAME) || (o.name || '').match(MIRROR_NAME);
  if (m) return m[0].toLowerCase();
  if (extra.water && extra.water.test(name)) return 'water';
  if (extra.ground && extra.ground.test(name)) return 'ground';
  const ud = o.userData || {};
  if (ud.mirror_strength !== undefined) return num(ud.mirror_ripple, 0) > 0 ? 'water' : 'ground';
  return null;
}

// Returns { kind, ud } (ud = the glTF extras that carry the mirror settings) or null.
function mirrorKind(obj, root, extra) {
  const own = kindOf(obj, extra);
  if (own) return { kind: own, ud: obj.userData || {} };
  // GLTFLoader wraps a multi-material mesh in a group that carries the object name.
  const p = obj.parent;
  if (p && p !== root && p.isGroup && p.children.every((c) => c.isMesh)) {
    const k = kindOf(p, extra);
    if (k) return { kind: k, ud: { ...(p.userData || {}), ...(obj.userData || {}) } };
  }
  return null;
}

function allRough(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.every((m) => !m || !m.isMeshStandardMaterial || (!m.roughnessMap && m.roughness >= ROUGH));
}

function fitPlane(mesh) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const idx = g.index;
  const m = mesh.matrixWorld.clone();
  if (mesh.isInstancedMesh && mesh.count > 0) {
    // glTF GPU instancing: fit the first instance
    const im = new THREE.Matrix4();
    mesh.getMatrixAt(0, im);
    m.multiply(im);
  }
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const step = Math.max(1, Math.floor(triCount / 20000));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cr = new THREE.Vector3();
  const n = new THREE.Vector3(), centroid = new THREE.Vector3();
  let area = 0;
  for (let t = 0; t < triCount; t += step) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(m);
    b.fromBufferAttribute(pos, i1).applyMatrix4(m);
    c.fromBufferAttribute(pos, i2).applyMatrix4(m);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    cr.crossVectors(ab, ac);
    const A = cr.length() * 0.5;
    if (!(A > 0)) continue;
    if (cr.y < 0) cr.negate();
    n.add(cr);
    centroid.addScaledVector(a.add(b).add(c), A / 3);
    area += A;
  }
  if (area <= 0) return null;
  n.normalize();
  centroid.multiplyScalar(1 / area);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(n, centroid);
}

// World-space bounds of a mesh (all instances of an instanced one).
function worldBox(mesh, box) {
  if (mesh.isInstancedMesh) {
    if (!mesh.boundingBox) mesh.computeBoundingBox();
    box.copy(mesh.boundingBox);
  } else {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.copy(mesh.geometry.boundingBox);
  }
  return box.applyMatrix4(mesh.matrixWorld);
}

const VERT_PARS = /* glsl */ `
uniform mat4 uMirrorMatrix;
varying vec4 vMirrorCoord;
varying vec3 vMirrorWorld;
`;

const VERT_MAIN = /* glsl */ `
{
  #ifdef USE_INSTANCING
    vec4 mirrorWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #else
    vec4 mirrorWorld = modelMatrix * vec4(transformed, 1.0);
  #endif
  vMirrorWorld = mirrorWorld.xyz;
  vMirrorCoord = uMirrorMatrix * mirrorWorld;
}
`;

const FRAG_PARS = /* glsl */ `
uniform sampler2D uMirrorTex;
uniform float uMirrorStrength;
uniform float uMirrorStreak;
uniform float uMirrorRipple;
uniform float uMirrorTime;
uniform float uMirrorEnv;
uniform float uMirrorShift;
uniform float uMirrorAniso;
varying vec4 vMirrorCoord;
varying vec3 vMirrorWorld;

float mirrorGloss(float rough) {
  return 1.0 - smoothstep(0.3, 0.9, clamp(rough, 0.0, 1.0));
}

// Interleaved gradient noise (Jimenez 2014): a different tap offset for each pixel.
float mirrorNoise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Streaked lookup: taps run mostly upward in the mirror image, which smears
// each reflected light down the screen toward the viewer. Each tap reads a
// footprint as wide as the roughness blur and as tall as the gap to the next
// tap, so anisotropic filtering joins the taps into one smear; a per-pixel
// offset (changing each frame, like grain) hides what is left of the gaps on
// streaks longer than the anisotropy limit.
vec3 mirrorStreaked(vec2 uv, float lod, float streak) {
  const int N = 12;
  vec2 texel = 1.0 / vec2(textureSize(uMirrorTex, 0));
  float blur = exp2(lod);
  float cell = 1.3 / float(N);
  float tall = clamp(cell * streak / texel.y, blur, blur * uMirrorAniso);
  vec2 dx = vec2(blur * texel.x, 0.0);
  vec2 dy = vec2(0.0, tall * texel.y);
  float j = mirrorNoise(gl_FragCoord.xy + 5.588238 * floor(uMirrorTime * 24.0));
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < N; i++) {
    float o = -0.3 + (float(i) + j) * cell;
    float w = exp(-3.0 * o * o);
    acc += textureGrad(uMirrorTex, uv + vec2(0.0, (o + uMirrorShift) * streak), dx, dy).rgb * w;
    wsum += w;
  }
  return acc / wsum;
}
`;

// After the environment lookups: keep uMirrorEnv of the environment's specular where
// the mirror shows (it already reflects the sky), all of it where the surface is rough.
const FRAG_ENV = /* glsl */ `
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  radiance *= mix(1.0, uMirrorEnv, mirrorGloss(roughnessFactor) * clamp(uMirrorStrength, 0.0, 1.0));
#endif
`;

const FRAG_MAIN = /* glsl */ `
{
  vec2 muv = vMirrorCoord.xy / vMirrorCoord.w;
  vec2 wobble = (normal.xy - nonPerturbedNormal.xy) * 0.18;
  if (uMirrorRipple > 0.0) {
    vec2 p = vMirrorWorld.xz;
    float t = uMirrorTime;
    vec2 r = vec2(
      sin(p.x * 1.7 + t * 1.3) + 0.6 * sin(p.y * 2.6 - t * 1.7 + p.x * 0.8) + 0.3 * sin((p.x + p.y) * 4.7 + t * 2.3),
      sin(p.y * 2.1 - t * 1.1) + 0.6 * sin(p.x * 3.1 + t * 1.9 - p.y * 0.7) + 0.3 * sin((p.x - p.y) * 5.3 - t * 2.9));
    wobble += r * uMirrorRipple * 0.0035 * clamp(6.0 / max(vMirrorCoord.w, 0.1), 0.15, 2.0);
  }
  muv += wobble;
  float mRough = clamp(roughnessFactor, 0.0, 1.0);
  float mLod = mRough * 6.0;
  float mStreak = uMirrorStreak * (0.004 + mRough * 0.16);
  vec3 refl = mirrorStreaked(muv, mLod, mStreak);
  vec3 mV = normalize(vViewPosition);
  float mNoV = clamp(dot(normal, mV), 0.0, 1.0);
  float mF = 0.02 + 0.98 * pow(1.0 - mNoV, 5.0);
  float mAmt = mF * mirrorGloss(mRough) * uMirrorStrength;
  outgoingLight = outgoingLight * (1.0 - 0.5 * mAmt) + refl * mAmt;
}
`;

export class Mirrors {
  constructor(renderer, scene, root, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.groups = [];
    this.meshes = [];
    this.hidden = [];
    this.pass = null;
    this.uTime = { value: 0 };
    const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
    this.aniso = Math.max(1, Math.min(maxAniso, opts.maxAniso ?? 16));
    this.uAniso = { value: this.aniso };
    this.strength = opts.strength ?? 1;
    this.streak = opts.streak ?? 1;
    this.env = opts.env ?? MIRROR_ENV;
    this.shift = opts.shift ?? 0;
    this.size = new THREE.Vector2(2, 2);
    const extra = { ground: patternOf(opts.ground), water: patternOf(opts.water) };

    root.updateMatrixWorld(true);
    const found = [];
    root.traverse((o) => {
      if (!o.isMesh || o.layers.isEnabled(MIRROR_ONLY_LAYER)) return;
      const k = mirrorKind(o, root, extra);
      if (k && num(k.ud.mirror_strength, 1) > 0 && !allRough(o)) found.push({ mesh: o, ...k });
    });

    for (const { mesh, kind, ud } of found) {
      const plane = fitPlane(mesh);
      if (!plane) continue;
      let group = this.groups.find((g) =>
        g.plane.normal.dot(plane.normal) > 0.995 && Math.abs(g.plane.constant - plane.constant) < 0.05);
      if (!group) {
        if (this.groups.length >= MAX_GROUPS) {
          group = this.groups.reduce((best, g) =>
            Math.abs(g.plane.constant - plane.constant) < Math.abs(best.plane.constant - plane.constant) ? g : best);
        } else {
          group = this.makeGroup(plane);
          this.groups.push(group);
        }
      }
      this.meshes.push(mesh);
      const water = kind === 'water';
      const settings = {
        strength: num(ud.mirror_strength, 1),
        streak: num(ud.mirror_streak, water ? 0.5 : 1),
        ripple: num(ud.mirror_ripple, water ? 1 : 0),
        env: THREE.MathUtils.clamp(num(ud.mirror_env, this.env), 0, 1),
        shift: num(ud.mirror_shift, this.shift),
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => this.patch(m, group, settings))
        : this.patch(mesh.material, group, settings);
    }
    if (this.groups.length) this.findFlat(root);
  }

  get count() {
    return this.meshes.length;
  }

  // A mesh lying on a mirror plane (a crowned road between wet ruts, a rug on a
  // varnished floor) is seen from below by the reflection camera and would hide the
  // whole reflection behind it. Its reflection pass draws front faces only.
  findFlat(root) {
    const mirrored = new Set(this.meshes);
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    const self = this;
    this.flat = [];
    root.traverse((o) => {
      if (!o.isMesh || mirrored.has(o) || !o.geometry?.attributes?.position) return;
      if (o.layers.isEnabled(MIRROR_ONLY_LAYER)) return;
      worldBox(o, box);
      if (box.isEmpty()) return;
      const flat = new Set();
      for (const g of this.groups) {
        let hi = -Infinity;
        for (let i = 0; i < 8; i++) {
          p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
          hi = Math.max(hi, g.plane.distanceToPoint(p));
        }
        if (hi > -0.01 && hi < FLAT) flat.add(g);
      }
      if (!flat.size) return;
      this.flat.push(o);
      const before = o.onBeforeRender;
      const after = o.onAfterRender;
      o.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
        before.call(this, renderer, scene, camera, geometry, material, group);
        if (self.pass && flat.has(self.pass) && material.side === THREE.DoubleSide) {
          material.side = THREE.FrontSide;
          this.userData.pkSideOf = material;
        }
      };
      o.onAfterRender = function (renderer, scene, camera, geometry, material, group) {
        if (this.userData.pkSideOf === material) {
          material.side = THREE.DoubleSide;
          this.userData.pkSideOf = null;
        }
        after.call(this, renderer, scene, camera, geometry, material, group);
      };
    });
  }

  makeGroup(plane) {
    const rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      anisotropy: this.aniso,
      depthBuffer: true,
    });
    rt.texture.name = 'mirror';
    const camera = new THREE.PerspectiveCamera();
    camera.layers.enable(MIRROR_ONLY_LAYER);
    return {
      plane,
      rt,
      camera,
      uTex: { value: rt.texture },
      uMatrix: { value: new THREE.Matrix4() },
      active: true,
    };
  }

  patch(material, group, settings) {
    if (!material || !material.isMeshStandardMaterial) return material;
    const m = material.clone();
    m.name = (material.name || 'material') + '_mirror';
    const strength = { value: settings.strength * this.strength };
    const streak = { value: settings.streak * this.streak };
    const ripple = { value: settings.ripple };
    const env = { value: settings.env };
    const shift = { value: settings.shift };
    const uTime = this.uTime;
    const uAniso = this.uAniso;
    m.userData.mirror = { strength, streak, ripple, env, shift, base: settings };
    // keep an earlier patch (viewer.js lights.exclude gives a material its own uniforms)
    const prev = material.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      prev.call(m, shader, renderer);
      shader.uniforms.uMirrorTex = group.uTex;
      shader.uniforms.uMirrorMatrix = group.uMatrix;
      shader.uniforms.uMirrorStrength = strength;
      shader.uniforms.uMirrorStreak = streak;
      shader.uniforms.uMirrorRipple = ripple;
      shader.uniforms.uMirrorTime = uTime;
      shader.uniforms.uMirrorEnv = env;
      shader.uniforms.uMirrorShift = shift;
      shader.uniforms.uMirrorAniso = uAniso;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + FRAG_ENV)
        .replace('#include <opaque_fragment>', FRAG_MAIN + '\n#include <opaque_fragment>');
    };
    m.customProgramCacheKey = () => 'pov-mirror-2';
    return m;
  }

  setStrength(strength, streak) {
    this.strength = strength;
    this.streak = streak;
    for (const mesh of this.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const u = m.userData.mirror;
        if (!u) continue;
        u.strength.value = u.base.strength * strength;
        u.streak.value = u.base.streak * streak;
      }
    }
  }

  setSize(width, height) {
    const w = Math.max(2, Math.round(width / 2));
    const h = Math.max(2, Math.round(height / 2));
    this.size.set(w, h);
    for (const g of this.groups) {
      g.rt.setSize(w, h);
    }
  }

  /**
   * Render each mirror from the reflected camera. `hide` lists extra objects
   * to leave out of the reflection (the vehicle attached to the camera).
   */
  update(camera, hide = [], time = 0) {
    this.uTime.value = time;
    if (!this.groups.length) return;
    const renderer = this.renderer;
    const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const lookAt = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(camPos);
    const planePoint = new THREE.Vector3();
    const view = new THREE.Vector3();
    const target = new THREE.Vector3();
    const clipPlane = new THREE.Vector4();
    const q = new THREE.Vector4();
    const plane = new THREE.Plane();

    const hidden = [];
    for (const o of [...this.meshes, ...hide]) {
      if (o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    }
    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false;

    for (const g of this.groups) {
      const n = g.plane.normal;
      g.plane.projectPoint(camPos, planePoint);
      view.subVectors(planePoint, camPos);
      g.active = view.dot(n) < 0;
      if (!g.active) continue;
      view.reflect(n).negate().add(planePoint);
      target.subVectors(planePoint, lookAt).reflect(n).negate().add(planePoint);

      const vc = g.camera;
      vc.position.copy(view);
      vc.up.set(0, 1, 0).applyMatrix4(rot).reflect(n);
      vc.lookAt(target);
      vc.near = camera.near;
      vc.far = camera.far;
      vc.updateMatrixWorld();
      vc.projectionMatrix.copy(camera.projectionMatrix);

      g.uMatrix.value.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0);
      g.uMatrix.value.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

      // Oblique near plane = the mirror plane, so nothing below it leaks in.
      plane.setFromNormalAndCoplanarPoint(n, planePoint).applyMatrix4(vc.matrixWorldInverse);
      clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const p = vc.projectionMatrix.elements;
      q.x = (Math.sign(clipPlane.x) + p[8]) / p[0];
      q.y = (Math.sign(clipPlane.y) + p[9]) / p[5];
      q.z = -1.0;
      q.w = (1.0 + p[10]) / p[14];
      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
      p[2] = clipPlane.x;
      p[6] = clipPlane.y;
      p[10] = clipPlane.z + 1.0 - 0.003;
      p[14] = clipPlane.w;
      vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();

      renderer.setRenderTarget(g.rt);
      renderer.clear();
      this.pass = g;
      try {
        renderer.render(this.scene, vc);
      } finally {
        this.pass = null;
      }
    }

    for (const o of hidden) o.visible = true;
    renderer.xr.enabled = prevXr;
    renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    for (const g of this.groups) g.rt.dispose();
    for (const mesh of this.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    }
  }
}

function num(v, d) {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) ? n : d;
}
