// The room: loads _dev/room/room.glb (export_room.py) and swaps its glTF
// materials for the ones this viewer needs. How the GLB stores things:
//  - every mesh is in world space (no node transforms), Y-up, no normals;
//  - one UV set (TEXCOORD_0, three's channel 0). On baked meshes it is the
//    lightmap UV and the atlas IS the final colour (light x albedo +
//    emission), saved through Blender's AgX view transform: display-referred
//    sRGB, so it is drawn unlit (sRGB texture -> linear in the shader ->
//    sRGB on output: an identity), never tone mapped again;
//  - materials named LM_* = baked atlases (KHR_materials_unlit);
//    *_Unlit = an object's own image (screens, desk mat, board, pictures);
//    Unlit_<rrggbb>_e<strength> = constant emitter, colour normalised to
//    max 1 and its Blender emission strength in the name and in extras.emit;
//    Glass_Export = alpha-blended glass; the Sea is Unlit_010305_e0.
// Layers keep the far outside (km away) out of the room camera's depth range:
// it is drawn by its own camera into its own target (see main.js).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const LAYERS = Object.freeze({ ROOM: 0, OUT: 1, BG_MAIN: 2, BG_REFL: 3, FLOOR: 4, SEA: 5 });

// Blender emission strength -> linear HDR multiplier. Blender's stills add
// one stop of exposure before AgX; 1.6 (not 2) leaves room for the glow.
export const EMIT_K = 1.6;
// screens: Blender drew them at emission 2.4 (+1 stop); the image itself is
// already a display image, so a gentler lift keeps the UI readable while its
// bright lines still reach the glow threshold
export const SCREEN_K = 1.9;

const OUTSIDE = new Set(['Outside_Land', 'Skyline']);
const ALWAYS_ON = new Set(['Compute_Rack', 'Outside_Land', 'Skyline']); // status lights and the city ignore setLights
const SCREENS = new Set(['Monitor_Left_Screen', 'Monitor_Center_Screen', 'Monitor_Right_Screen', 'Desk_Mat']);
const EMIT_RE = /^Unlit_([0-9a-f]{6})_e([0-9.]+)$/;

// Room lights off: what is left is window light and night. The baked atlas
// cannot be relit, so "off" multiplies it toward a cool, dim level instead.
const NIGHT = new THREE.Color(0.035, 0.04, 0.07);

const BG_VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const BG_FRAG = /* glsl */ `
uniform sampler2D tBg;
uniform vec2 uInvRes;
void main() {
  gl_FragColor = vec4(texture2D(tBg, gl_FragCoord.xy * uInvRes).rgb, 1.0);
}
`;

const FLOOR_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// The polished stone floor: baked colour plus the planar reflection.
// Tiles, joints and per-tile roughness follow floor_stone() in
// room_materials.py (1.2 m tiles, half-bond rows, roughness 0.08 to 0.25,
// in the Floor object's space: origin at Blender (0, 3.5)).
const FLOOR_FRAG = /* glsl */ `
uniform sampler2D map;
uniform sampler2D tRefl;
uniform sampler2D tReflBlur;
uniform vec3 uBake;
uniform vec2 uInvRes;
uniform float uRefl;
varying vec2 vUv;
varying vec3 vWorld;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 base = texture2D(map, vUv).rgb * uBake;
  // Blender object space of the Floor box: x = three x, y = -three z - 3.5
  vec2 o = vec2(vWorld.x, -vWorld.z - 3.5);
  float tile = 1.2;
  float row = floor(o.y / tile);
  float xs = o.x + mod(row, 2.0) * 0.5 * tile;
  vec2 id = vec2(floor(xs / tile), row);
  vec2 f = vec2(fract(xs / tile), fract(o.y / tile));
  vec2 e = min(f, 1.0 - f) * tile;
  float edge = min(e.x, e.y);
  // a 3.5 mm joint, antialiased by its screen footprint
  float fw = max(fwidth(edge), 1e-4);
  float joint = 1.0 - smoothstep(0.0012, 0.0012 + 1.5 * fw, edge);
  float th = hash12(id + 4.0);
  // roughness wanders inside a tile and from tile to tile (0.08 .. 0.25)
  float rough = mix(0.08, 0.25, clamp(0.55 * th + 0.6 * vnoise(o * 1.6 + th * 7.0) - 0.1, 0.0, 1.0));
  vec3 col = base * (1.0 - 0.45 * joint);
  if (uRefl > 0.0) {
    // a very low broad bump: reflections waver a little, like real tiles
    vec2 wob = vec2(vnoise(o * 2.3 + th * 11.0), vnoise(o * 2.3 + 17.0 + th * 5.0)) - 0.5;
    vec2 suv = gl_FragCoord.xy * uInvRes + wob * 0.0035;
    vec3 sharp = texture2D(tRefl, suv).rgb;
    vec3 soft = texture2D(tReflBlur, suv).rgb;
    vec3 r = mix(sharp, soft, smoothstep(0.07, 0.2, rough));
    vec3 V = normalize(cameraPosition - vWorld);
    float c = clamp(V.y, 0.0, 1.0);
    // dielectric Fresnel (F0 0.04) plus a faint coat; rough tiles reflect a little less
    float F = 0.04 + 0.96 * pow(1.0 - c, 5.0);
    F *= mix(1.0, 0.7, smoothstep(0.1, 0.25, rough));
    col += r * F * uRefl * (1.0 - joint);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const SEA_VERT = FLOOR_VERT;
// The sea far below the window: near-black water, the mirrored sky and coast
// streaked along screen y (wind ripples stretch reflections toward the
// viewer), ripple wobble shrinking with distance.
const SEA_FRAG = /* glsl */ `
uniform sampler2D tRefl;
uniform vec2 uInvRes;
uniform vec3 uBase;
uniform float uTime;
uniform float uRefl;
varying vec2 vUv;
varying vec3 vWorld;

void main() {
  vec3 col = uBase;
  if (uRefl > 0.0) {
    vec2 uv = gl_FragCoord.xy * uInvRes;
    vec3 V = normalize(cameraPosition - vWorld);
    float c = clamp(V.y, 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
    float dist = length(vWorld.xz - cameraPosition.xz);
    float k = 1.0 / (1.0 + dist * 0.0006);
    vec2 w = vWorld.xz;
    float n1 = sin(w.x * 0.031 + 2.0 * sin(w.y * 0.07 + uTime * 0.35) + uTime * 0.27);
    float n2 = sin(w.y * 0.19 + w.x * 0.013 - uTime * 0.42);
    vec2 off = vec2(0.0035 * n1 + 0.0015 * n2, 0.0) * k;
    vec3 r = vec3(0.0);
    float tw = 0.0;
    for (int i = 0; i < 9; i++) {
      float s = (float(i) - 4.0) / 4.0;
      float wgt = exp(-2.2 * s * s);
      r += texture2D(tRefl, uv + off + vec2(0.0, s * 0.045 * k)).rgb * wgt;
      tw += wgt;
    }
    col += (r / tw) * F * uRefl;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// The armillary's brass: the baked (diffuse) colour plus live specular from
// the three lights build_room.py aims at the instrument (Blender positions
// from build_lights(): a 2700 K key spot above front-right, a broad warm card
// seen only in reflections, a cyan rim from behind-left), converted to Y-up.
// Metal Fresnel with the brass colour as F0. Injected into MeshBasicMaterial
// so the map, colour (lights, hover) and clipping (floor mirror) still work.
const BRASS_VERT_PARS = /* glsl */ `
varying vec3 vBrassN;
varying vec3 vBrassP;
`;
const BRASS_VERT = /* glsl */ `
vBrassN = normalize(mat3(modelMatrix) * normal);
vBrassP = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;
const BRASS_FRAG_PARS = /* glsl */ `
varying vec3 vBrassN;
varying vec3 vBrassP;
uniform vec3 uKeyPos;
uniform vec3 uCardPos;
uniform vec3 uRimPos;
uniform float uSpec;
`;
const BRASS_FRAG = /* glsl */ `
{
  vec3 N = normalize(vBrassN);
  vec3 V = normalize(cameraPosition - vBrassP);
  if (dot(N, V) < 0.0) N = -N;
  float nv = max(dot(N, V), 0.0);
  vec3 F0 = vec3(0.62, 0.42, 0.16);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - nv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 Lk = normalize(uKeyPos - vBrassP);
  float key = pow(max(dot(N, normalize(Lk + V)), 0.0), 90.0) * 6.0;
  float card = smoothstep(0.82, 0.97, dot(R, normalize(uCardPos - vBrassP)));
  float rim = smoothstep(0.86, 0.98, dot(R, normalize(uRimPos - vBrassP)));
  // the bake already carries the key's diffuse light on the brass: only the glints are added here
  vec3 spec = F * (key * vec3(1.0, 0.72, 0.42) + card * vec3(0.3, 0.23, 0.16) + rim * vec3(0.015, 0.3, 0.26));
  // diffuse = the material colour (room lights, hover lift): the glints dim and lift with it
  diffuseColor.rgb += spec * uSpec * diffuse;
}
`;

export function brassMaterial(map) {
  const b2t = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
  const uniforms = {
    uKeyPos: { value: b2t([-0.9255, 6.5068, 1.52]) },
    uCardPos: { value: b2t([-0.8559, 5.8081, 1.41]) },
    uRimPos: { value: b2t([-1.8965, 6.3059, 1.22]) },
    uSpec: { value: 1 },
  };
  const m = new THREE.MeshBasicMaterial({ name: 'Armillary', map, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${BRASS_VERT_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${BRASS_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${BRASS_FRAG_PARS}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${BRASS_FRAG}`);
  };
  m.customProgramCacheKey = () => 'room-brass-1';
  m.userData.uniforms = uniforms;
  return m;
}

// exported for glsl_check.py (compiles every custom shader without a browser)
export const SHADERS = Object.freeze({ BG_VERT, BG_FRAG, FLOOR_VERT, FLOOR_FRAG, SEA_VERT, SEA_FRAG, BRASS_VERT_PARS, BRASS_VERT, BRASS_FRAG_PARS, BRASS_FRAG });

function nodeOf(obj, root) {
  let o = obj;
  while (o.parent && o.parent !== root) o = o.parent;
  return o;
}

function setLayer(obj, layer) {
  obj.layers.set(layer);
}

/**
 * Load the room. Resolves to the room handle:
 * { root, materials, armillary, bgMain, bgRefl, floor, sea, stats, set*() }.
 */
export async function loadRoom(url, { renderer, onProgress } = {}) {
  const t0 = performance.now();
  const loader = new GLTFLoader();
  let glbBytes = 0;
  const gltf = await loader.loadAsync(url, (e) => {
    if (e && e.total) glbBytes = e.total;
    else if (e && e.loaded) glbBytes = Math.max(glbBytes, e.loaded);
    if (onProgress) onProgress(e);
  });
  const parsedMs = performance.now() - t0;
  const root = gltf.scene;
  const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;

  const baked = []; // { material, kind: 'bake' }
  const emitters = []; // { material, base: Color, strength, always }
  const screens = []; // { material }
  const glass = []; // { material, window }
  const cache = new Map();
  const textures = new Set();
  let floor = null;
  let sea = null;
  let armillary = null;
  const counts = { meshes: 0, triangles: 0 };

  const remember = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };

  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  for (const mesh of meshes) {
    const node = nodeOf(mesh, root).name;
    const src = mesh.material;
    const name = src.name || '';
    counts.meshes++;
    counts.triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : mesh.geometry.attributes.position.count / 3;
    mesh.matrixAutoUpdate = false;
    if (src.map) {
      src.map.anisotropy = aniso;
      textures.add(src.map);
    }
    let layer = OUTSIDE.has(node) ? LAYERS.OUT : LAYERS.ROOM;
    const em = EMIT_RE.exec(name);
    if (node === 'Sea') {
      sea = new THREE.ShaderMaterial({
        name: 'Sea',
        vertexShader: SEA_VERT,
        fragmentShader: SEA_FRAG,
        uniforms: {
          tRefl: { value: null },
          uInvRes: { value: new THREE.Vector2(1, 1) },
          uBase: { value: new THREE.Vector3(0.006, 0.014, 0.02) },
          uTime: { value: 0 },
          uRefl: { value: 0 },
        },
        side: THREE.DoubleSide,
      });
      mesh.material = sea;
      layer = LAYERS.SEA;
    } else if (name === 'LM_Floor' || node === 'Floor') {
      floor = new THREE.ShaderMaterial({
        name: 'Floor',
        vertexShader: FLOOR_VERT,
        fragmentShader: FLOOR_FRAG,
        uniforms: {
          map: { value: src.map },
          tRefl: { value: null },
          tReflBlur: { value: null },
          uBake: { value: new THREE.Color(1, 1, 1) },
          uInvRes: { value: new THREE.Vector2(1, 1) },
          uRefl: { value: 0 },
        },
        side: THREE.DoubleSide,
      });
      // the baked-only fallback: same atlas, no reflection lookups at all
      floor.userData.fallback = new THREE.MeshBasicMaterial({ name: 'Floor_Baked', map: src.map, side: THREE.DoubleSide });
      baked.push({ material: floor.userData.fallback });
      mesh.material = floor;
      layer = LAYERS.FLOOR;
    } else if (name.startsWith('LM_')) {
      if (node === 'Armillary_Sphere') {
        // its own material, so the hover lift touches nothing else; the bake is diffuse only, so the brass gets
        // its glints back here from the lights build_room.py aims at it (normals rebuilt from the mesh)
        mesh.geometry.computeVertexNormals();
        const m = brassMaterial(src.map);
        baked.push({ material: m, hover: true });
        armillary = { mesh, material: m, box: new THREE.Box3().setFromObject(mesh), hover: 0, target: 0 };
        mesh.material = m;
      } else {
        mesh.material = remember(name, () => {
          const m = new THREE.MeshBasicMaterial({ name, map: src.map, side: THREE.DoubleSide });
          // the outside's atlas (LM_Outside: only Outside_Land and Skyline) is not lit by the room: setLights leaves it
          if (!OUTSIDE.has(node)) baked.push({ material: m });
          return m;
        });
      }
    } else if (name.endsWith('_Unlit')) {
      const screen = SCREENS.has(node);
      mesh.material = remember(name, () => {
        const m = new THREE.MeshBasicMaterial({ name, map: src.map, side: THREE.DoubleSide });
        if (screen) screens.push({ material: m, node });
        else baked.push({ material: m });
        return m;
      });
    } else if (em || src.userData?.emit !== undefined) {
      const strength = em ? Number(em[2]) : Number(src.userData.emit);
      const always = ALWAYS_ON.has(node);
      mesh.material = remember(`${name}|${always}`, () => {
        const base = src.color.clone(); // glTF baseColorFactor: linear
        const m = new THREE.MeshBasicMaterial({ name, color: base.clone().multiplyScalar(strength * EMIT_K), side: THREE.DoubleSide });
        emitters.push({ material: m, base, strength, always });
        return m;
      });
    } else if (name === 'Glass_Export' || src.transparent) {
      const isWindow = node === 'Window_Glass';
      mesh.material = remember(`glass|${isWindow}`, () => {
        // out = glass.rgb + behind * transmit (a faint cool sheen over a tinted pass-through)
        const m = new THREE.MeshBasicMaterial({
          name: isWindow ? 'Window_Glass' : 'Glass',
          color: isWindow ? new THREE.Color(0.0016, 0.002, 0.004) : new THREE.Color(0.006, 0.007, 0.01),
          transparent: true,
          opacity: isWindow ? 0.93 : 0.82,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.CustomBlending,
          blendEquation: THREE.AddEquation,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.SrcAlphaFactor,
          blendSrcAlpha: THREE.ZeroFactor,
          blendDstAlpha: THREE.OneFactor,
        });
        glass.push({ material: m, window: isWindow, transmit: m.opacity });
        return m;
      });
    } else {
      // anything unexpected: keep its texture or colour, unlit
      mesh.material = new THREE.MeshBasicMaterial({ name: `fallback_${name}`, map: src.map || null, color: src.color || new THREE.Color(1, 1, 1), side: THREE.DoubleSide });
      baked.push({ material: mesh.material });
      console.warn('[room] unclassified material', name, 'on', node);
    }
    if (src !== mesh.material && src.dispose) src.dispose();
    setLayer(mesh, layer);
  }

  // full-screen backgrounds: the outside (sky + far coast), drawn first in
  // the room passes, behind everything (no depth test or write)
  const makeBg = (layer) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const m = new THREE.ShaderMaterial({
      name: 'Backdrop',
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      uniforms: { tBg: { value: null }, uInvRes: { value: new THREE.Vector2(1, 1) } },
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1e6;
    mesh.layers.set(layer);
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    return mesh;
  };
  const bgMain = makeBg(LAYERS.BG_MAIN);
  const bgRefl = makeBg(LAYERS.BG_REFL);

  const state = { lights: 1, screens: 1, glass: 1, emitK: EMIT_K, screenK: SCREEN_K };

  const WHITE = new THREE.Color(1, 1, 1);
  const WARM = new THREE.Color(1.5, 1.22, 0.86);
  const bake = new THREE.Color();
  const warm = new THREE.Color();
  function applyLights() {
    // ease the switch like a real driver: a quick rise, a soft tail
    const v = state.lights;
    bake.copy(NIGHT).lerp(WHITE, Math.pow(v, 1.15));
    for (const b of baked) {
      const k = b.hover && armillary ? 1 + 0.55 * armillary.hover : 1;
      b.material.color.copy(bake).multiplyScalar(k);
      if (b.hover && armillary) b.material.color.lerp(warm.copy(WARM).multiply(bake), 0.35 * armillary.hover);
    }
    if (floor) floor.uniforms.uBake.value.copy(bake);
    const e = Math.pow(v, 1.6);
    for (const em of emitters) em.material.color.copy(em.base).multiplyScalar(em.strength * state.emitK * (em.always ? 1 : e));
  }

  function applyScreens() {
    const v = state.screens;
    // a screen waking: black, then a cool flash that settles
    const lift = v <= 0 ? 0.012 : 0.012 + (state.screenK - 0.012) * Math.pow(v, 1.4);
    const flash = 0.35 * Math.max(0, Math.sin(Math.PI * Math.min(1, v * 1.25))) * (1 - v);
    for (const s of screens) {
      const k = s.node === 'Desk_Mat' ? lift * 0.62 * state.lightsForMat : lift;
      s.material.color.setRGB(k + flash * 0.6, k + flash * 0.75, k + flash);
    }
  }
  state.lightsForMat = 1;

  applyLights();
  applyScreens();

  const imageBytes = () => {
    let b = 0;
    for (const t of textures) {
      const img = t.image;
      if (!img) continue;
      const w = img.width || 0;
      const h = img.height || 0;
      b += w * h * 4 * (t.generateMipmaps !== false ? 4 / 3 : 1);
    }
    return b;
  };

  return {
    root,
    gltf,
    floor,
    sea,
    armillary,
    bgMain,
    bgRefl,
    glass,
    emitters,
    screens,
    baked,
    textures,
    counts,
    glbBytes,
    parsedMs,
    imageBytes,
    /** 0..1: strips and lamps fade, the baked light dims toward night. */
    setLights(v) {
      state.lights = Math.min(1, Math.max(0, Number(v) || 0));
      state.lightsForMat = 0.35 + 0.65 * state.lights;
      applyLights();
      applyScreens();
    },
    /** 0..1: the monitors (and the desk mat) wake. */
    setScreens(v) {
      state.screens = Math.min(1, Math.max(0, Number(v) || 0));
      applyScreens();
    },
    get lights() {
      return state.lights;
    },
    get screensOn() {
      return state.screens;
    },
    /** Window transmission factor for this shot (1 = clear, 0.5 = one stop darker). */
    setGlass(k) {
      state.glass = k;
      for (const g of glass) if (g.window) g.material.opacity = g.transmit * k;
    },
    /** Look tuning from the console: { emitK, screenK } (HDR gain per unit of Blender emission strength). */
    tune(o = {}) {
      if (Number.isFinite(o.emitK)) state.emitK = o.emitK;
      if (Number.isFinite(o.screenK)) state.screenK = o.screenK;
      if (Number.isFinite(o.brass) && armillary) armillary.material.userData.uniforms.uSpec.value = o.brass;
      applyLights();
      applyScreens();
      return { emitK: state.emitK, screenK: state.screenK, brass: armillary ? armillary.material.userData.uniforms.uSpec.value : null };
    },
    /** Hover amount on the armillary (0..1), eased by the caller. */
    setHover(h) {
      if (!armillary) return;
      armillary.hover = h;
      applyLights();
    },
    useReflection(on) {
      for (const o of meshes) {
        if (o.material === floor || o.material === floor?.userData.fallback) o.material = on ? floor : floor.userData.fallback;
      }
      if (floor) floor.uniforms.uRefl.value = on ? 1 : 0;
    },
  };
}
