// POV films, real-time edition.
// Loads ../films/<slug>/web/scene.glb and sky.json and plays the first glTF
// camera over 14 s at 24 fps timing. See viewer/README.md.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { loadSky, fallbackSkyJson } from './sky.js';
import { createFinishPass } from './finish.js';
import { Mirrors, markMirrorOnly } from './mirror.js';

const FPS = 24;
const FRAMES = 336;
const DURATION = FRAMES / FPS; // 14 s
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/';
// UnrealBloomPass blurs in texels, so its spread depends on resolution. Run it
// at a fixed reference height so the glow looks the same at any pixel ratio.
const BLOOM_REF_HEIGHT = 1280;

const FILMS = [
  { slug: '01-mushroom-hollow', title: 'Mushroom Hollow' },
  { slug: '02-bedroom-railway', title: 'Bedroom Railway' },
  { slug: '03-first-snow-village', title: 'First Snow Village' },
  { slug: '04-lantern-canal', title: 'Lantern Canal' },
  { slug: '05-moonlit-desert-oasis', title: 'Moonlit Desert Oasis' },
  { slug: '_viewer-test', title: 'Viewer test' },
];

// Per-film overrides may live in films/<slug>/web/viewer.json (all optional).
// Lighting, bloom and post defaults follow kit/povkit.py. The view transform stays
// AgX - Punchy at 0 with no comp saturation (what the films were first tuned with
// and what the test fixture renders); the kit's render.setup now renders Khronos PBR
// Neutral at -0.4 after comp saturation 1.15, which a film asks for with view,
// exposure and saturation.
const DEFAULTS = {
  view: 'agx',                 // 'agx' or 'neutral' (Khronos PBR Neutral)
  exposure: 0,                 // stops, Blender's view exposure
  look: 'punchy',              // AgX only: 'punchy' (AgX - Punchy) or 'none'
  saturation: 1,               // the kit's comp saturation (scene-linear, Rec.709 luma kept)
  // A film's own grade at the end of its compositor, before the view transform.
  grade: { black: 0, contrast: 1, contrast_mode: 'rgb', split_tint: [1, 1, 1], split_from: 0.015, split_to: 0.55 },
  // Calibrated against the kit's Bloom + Fog Glow compositor on films/_viewer-test.
  bloom: { strength: 0.12, radius: 0.8, threshold: 1.0, knee: 2.0, saturation: 1 },
  world_light: { gain: 0.15, tint: [0.75, 0.85, 1.0], ambient: [0.004, 0.006, 0.012] },
  env_intensity: 1,            // multiplies the world light above
  post: { vignette: 0.32, vignette_radius: 0.62, grain: 0.022, dispersion: 0.006 },
  fog_density: null,           // null = automatic from scene depth
  fog_strength: 1,             // scales the automatic density
  fog_color: null,             // null = the sky just above the horizon
  light_units: 'spec',         // glTF exporter lighting mode: spec | compat | raw
  // Desktop budget, the touch-device caps, and per-light overrides by name (regular
  // expressions): importance multipliers, specular factors and intensity gains; and
  // light linking, {light pattern: object pattern} for lights that skip those objects.
  lights: { point: 24, spot: 8, touch_point: 10, touch_spot: 4, priority: {}, specular: {}, gain: {}, exclude: {} },
  // Extra object-name patterns (regular expressions) mirrored as ground or water; the
  // share of the environment specular a glossy mirror keeps (1 = all of it, as the films
  // were tuned; the mirror image holds the sky too); streak shift along its length;
  // objects drawn in reflections only.
  mirror: { strength: 1, streak: 1, ground: '', water: '', env: 1, shift: 0, only: '' },
};

const params = new URLSearchParams(location.search);
// Debug switches for checking one effect at a time: ?bloom=0&fog=0&env=0&mirror=0
const off = (k) => params.get(k) === '0';
// ?set=<JSON> lays settings over viewer.json, to try them without editing the file.
let urlSettings = null;
try {
  if (params.has('set')) urlSettings = JSON.parse(params.get('set'));
} catch (err) {
  console.warn('Ignoring ?set=, not JSON', err);
}
// ?bare=1 shows only the picture, filling the window (for side-by-side checks against Blender stills).
if (params.get('bare') === '1') document.documentElement.classList.add('bare');
const coarse = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- DOM

const $ = (id) => document.getElementById(id);
const phone = $('phone');
const canvas = $('view');
const veil = $('veil');
const veilTitle = $('veil-title');
const veilNote = $('veil-note');
const progress = $('progress');
const select = $('film');
const playBtn = $('play');
const lookBtn = $('look');
const scrub = $('scrub');

for (const f of FILMS) {
  const o = document.createElement('option');
  o.value = f.slug;
  o.textContent = f.title;
  select.appendChild(o);
}

function showVeil(title, note) {
  veilTitle.textContent = title || '';
  veilNote.textContent = note || '';
  veil.hidden = false;
}

function hideVeil() {
  veil.hidden = true;
}

function setProgress(p) {
  if (p === null) {
    progress.classList.remove('on');
    return;
  }
  progress.classList.add('on');
  progress.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
}

// ---------------------------------------------------------------- renderer

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
} catch (err) {
  showVeil('This needs WebGL 2', 'Try a current version of Chrome, Safari or Firefox.');
  throw err;
}
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 1);

const maxDpr = Math.min(window.devicePixelRatio || 1, params.has('dpr') ? +params.get('dpr') : 2);
let dpr = maxDpr;

const composerTarget = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: coarse ? 2 : 4 });
const composer = new EffectComposer(renderer, composerTarget);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloomPass = new UnrealBloomPass(new THREE.Vector2(2, 2), DEFAULTS.bloom.strength, DEFAULTS.bloom.radius, DEFAULTS.bloom.threshold);
roundBloom(bloomPass);
// Saturation, the kit's dispersion, vignette and grain, the film's grade, exposure,
// the view transform (AgX (+ Punchy) or Khronos PBR Neutral), sRGB and dither.
const finishPass = createFinishPass();
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(finishPass);

const pmrem = new THREE.PMREMGenerator(renderer);

const draco = new DRACOLoader().setDecoderPath(THREE_CDN + 'examples/jsm/libs/draco/gltf/');
const gltfLoader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);

// ---------------------------------------------------------------- state

let film = null;        // the loaded film, see loadFilm
let loadToken = 0;
let t = clampTime(+params.get('t') || 0);
let playing = !(params.get('paused') === '1' || reducedMotion);
let scrubbing = false;
let lookEnabled = params.get('look') !== 'off';
const look = { yaw: 0, pitch: 0, vy: 0, vp: 0, ty: 0, tp: 0, dragging: false };
if (params.has('look') && params.get('look').includes(',')) {
  const [y, p] = params.get('look').split(',').map(Number);
  look.yaw = look.ty = THREE.MathUtils.degToRad(y || 0);
  look.pitch = look.tp = THREE.MathUtils.degToRad(p || 0);
  look.dragging = true; // hold the pose (used for screenshots)
}

function clampTime(x) {
  return Math.min(Math.max(x, 0), DURATION - 1 / FPS);
}

// ---------------------------------------------------------------- helpers

async function fetchJson(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.json();
  } catch (err) {
    console.warn('Could not read', url, err);
    return null;
  }
}

async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    return r.ok;
  } catch {
    return false;
  }
}

function mergeSettings(...overs) {
  const s = structuredClone(DEFAULTS);
  for (const over of overs) {
    if (!over || typeof over !== 'object') continue;
    for (const k of Object.keys(s)) {
      if (!(k in over)) continue;
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) Object.assign(s[k], over[k]);
      else s[k] = over[k];
    }
  }
  return s;
}

// Case-insensitive patterns from viewer.json; a bad one is reported and skipped.
function pattern(src) {
  if (!src) return null;
  try {
    return new RegExp(src, 'i');
  } catch (err) {
    console.warn('Ignoring pattern', src, err);
    return null;
  }
}

function byName(map, name) {
  let v = null;
  for (const [src, x] of Object.entries(map || {})) {
    const re = pattern(src);
    if (re && re.test(name) && Number.isFinite(+x)) v = +x;
  }
  return v;
}

// r170's bloom blur is a Gaussian cut off at one sigma, close to a box, so bright
// points bloom as squares. Give each level a full Gaussian (to 3 sigma) with the
// same spread as the kernel it replaces, so the glow keeps its size but turns round.
function roundBloom(pass) {
  pass.separableBlurMaterials = pass.separableBlurMaterials.map((m) => {
    const old = m.uniforms.gaussianCoefficients.value;
    let sum = old[0];
    let m2 = 0;
    for (let i = 1; i < old.length; i++) {
      sum += 2 * old[i];
      m2 += 2 * i * i * old[i];
    }
    const sigma = Math.sqrt(m2 / sum);
    const n = Math.ceil(3 * sigma) + 1;
    const g = pass.getSeperableBlurMaterial(n);
    g.uniforms.gaussianCoefficients.value = Array.from({ length: n }, (_, j) => Math.exp(-0.5 * j * j / (sigma * sigma)));
    g.uniforms.invSize.value = m.uniforms.invSize.value;
    m.dispose();
    return g;
  });
  // bloom.saturation: the kit's bloom_saturation, on the glow alone
  const cm = pass.compositeMaterial;
  if (cm.fragmentShader.includes('gl_FragColor = bloomStrength')) {
    cm.uniforms.pkBloomSaturation = { value: 1 };
    cm.fragmentShader = 'uniform float pkBloomSaturation;\n' + cm.fragmentShader.replace(/}\s*$/, `
      float pkL = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor.rgb = max(pkL + (gl_FragColor.rgb - pkL) * pkBloomSaturation, 0.0);
    }`);
  } else {
    console.warn('UnrealBloomPass changed; bloom.saturation is ignored');
  }
}

// Blender's glTF exporter writes punctual lights in photometric units in its
// default "Standard" mode (W * 683 / 4pi for point and spot, W/m2 * 683 for
// sun). three.js shades in the same radiometric units as Blender, so the 683
// comes back out. "Unitless" (compat) needs no change; "Raw" stores watts.
function lightScale(light, units) {
  if (units === 'compat') return 1;
  if (units === 'raw') return light.isDirectionalLight ? 1 : 1 / (4 * Math.PI);
  return 1 / 683;
}

// ---------------------------------------------------------------- per-light specular
// Blender lights have a specular factor (a moon at 0.05 lights the walls but leaves
// no glitter on the wet road); glTF punctual lights do not. Every lit material gets
// one "specular cut" (1 - factor) per direct light, filled before each render in
// three.js's own light order, and each light's glints are scaled by it.
// The same patch carries light linking (viewer.json lights.exclude): a material on
// an excluded object gets its own "light off" array, 1 for each light that must not
// light it, which drops that light's diffuse, specular, coat and sheen.
const SPEC_TYPES = [
  { key: 'point', num: 'NUM_POINT_LIGHTS', name: 'pkSpecCutPoint', off: 'pkLightOffPoint', is: 'isPointLight' },
  { key: 'spot', num: 'NUM_SPOT_LIGHTS', name: 'pkSpecCutSpot', off: 'pkLightOffSpot', is: 'isSpotLight' },
  { key: 'dir', num: 'NUM_DIR_LIGHTS', name: 'pkSpecCutDir', off: 'pkLightOffDir', is: 'isDirectionalLight' },
];
const specCuts = { point: new Float32Array(1), spot: new Float32Array(1), dir: new Float32Array(1) };
const noOff = { point: new Float32Array(1), spot: new Float32Array(1), dir: new Float32Array(1) };
const specPatched = (() => {
  const call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  // the point, spot and directional loops call RE_Direct in that order
  if (chunk.split(call).length !== 4 || !chunk.includes('IncidentLight directLight;')) {
    console.warn('three.js light chunk changed; per-light specular and lights.exclude are off');
    return false;
  }
  let k = 0;
  THREE.ShaderChunk.lights_fragment_begin = chunk
    .replace('IncidentLight directLight;', `IncidentLight directLight;
vec3 pkSpecKeep;
vec3 pkDiffKeep;
float pkOff;
#ifdef USE_CLEARCOAT
	vec3 pkCoatKeep;
#endif
#ifdef USE_SHEEN
	vec3 pkSheenKeep;
#endif`)
    .split(call)
    .reduce((acc, part) => {
      const t = SPEC_TYPES[k++];
      return acc + `pkSpecKeep = reflectedLight.directSpecular;
		pkDiffKeep = reflectedLight.directDiffuse;
		#ifdef USE_CLEARCOAT
			pkCoatKeep = clearcoatSpecularDirect;
		#endif
		#ifdef USE_SHEEN
			pkSheenKeep = sheenSpecularDirect;
		#endif
		${call}
		pkOff = ${t.off}[ i ];
		reflectedLight.directSpecular = mix( reflectedLight.directSpecular, pkSpecKeep, max( ${t.name}[ i ], pkOff ) );
		reflectedLight.directDiffuse = mix( reflectedLight.directDiffuse, pkDiffKeep, pkOff );
		#ifdef USE_CLEARCOAT
			clearcoatSpecularDirect = mix( clearcoatSpecularDirect, pkCoatKeep, pkOff );
		#endif
		#ifdef USE_SHEEN
			sheenSpecularDirect = mix( sheenSpecularDirect, pkSheenKeep, pkOff );
		#endif` + part;
    });
  THREE.ShaderChunk.lights_pars_begin += SPEC_TYPES.map((t) =>
    `\n#if ${t.num} > 0\nuniform float ${t.name}[ ${t.num} ];\nuniform float ${t.off}[ ${t.num} ];\n#endif`).join('') + '\n';
  return true;
})();

// Size the cut arrays for a film before its materials compile (three.js copies the
// array reference into each material, so the arrays are shared and filled in place).
function allocSpecCuts(counts) {
  for (const t of SPEC_TYPES) {
    specCuts[t.key] = new Float32Array(Math.max(1, counts[t.key] || 0));
    noOff[t.key] = new Float32Array(Math.max(1, counts[t.key] || 0));
    for (const lib of [THREE.ShaderLib.standard, THREE.ShaderLib.physical]) {
      lib.uniforms[t.name] = { value: specCuts[t.key] };
      lib.uniforms[t.off] = { value: noOff[t.key] };
    }
  }
}

// viewer.json lights.exclude {light pattern: object pattern}: Blender's light linking,
// which glTF drops. Each object that matches gets material copies whose "light off"
// arrays mark the excluded lights. Runs before the mirrors patch the materials (the
// mirror copies keep this onBeforeCompile). Returns the masks for specSync.
function setupExclude(root, rules, counts, lights) {
  const list = Object.entries(rules || {})
    .map(([l, o]) => ({ light: pattern(l), obj: typeof o === 'string' ? pattern(o) : null }))
    .filter((r) => r.light && r.obj);
  if (!list.length || !specPatched) return [];
  const masks = new Map();
  const copies = new Map();
  const nameOf = (o) => o.userData.name || o.name || '';
  root.traverse((o) => {
    if (!o.isMesh) return;
    const names = [nameOf(o)];
    const p = o.parent;
    if (p && p !== root && p.isGroup && p.children.every((c) => c.isMesh)) names.push(nameOf(p));
    const hit = list.filter((r) => names.some((n) => r.obj.test(n)));
    if (!hit.length) return;
    const key = hit.map((r) => list.indexOf(r)).join(',');
    let mask = masks.get(key);
    if (!mask) {
      const off = {};
      for (const t of SPEC_TYPES) off[t.key] = new Float32Array(Math.max(1, counts[t.key] || 0));
      mask = { off, lights: new Set(lights.filter((l) => hit.some((r) => r.light.test(nameOf(l))))) };
      masks.set(key, mask);
    }
    const swap = (m) => {
      if (!m || !m.isMeshStandardMaterial) return m;
      const ck = m.uuid + '|' + key;
      if (!copies.has(ck)) {
        const c = m.clone();
        const prev = m.onBeforeCompile;
        c.onBeforeCompile = function (shader, r) {
          prev.call(this, shader, r);
          for (const t of SPEC_TYPES) shader.uniforms[t.off] = { value: mask.off[t.key] };
        };
        c.customProgramCacheKey = () => 'pov-light-off';
        copies.set(ck, c);
      }
      return copies.get(ck);
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  return [...masks.values()];
}

function shown(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

// three.js numbers the lights of each type in scene order, visible ones only,
// shadow casters first. Returns a scene.onBeforeRender that fills the cuts and the
// light-off masks that way (a pooled proxy stands for its current light).
function specSync(scene, masks = []) {
  const all = [];
  scene.traverse((o) => { if (o.isLight) all.push(o); });
  const order = [...all.filter((o) => o.castShadow), ...all.filter((o) => !o.castShadow)];
  return () => {
    const n = { point: 0, spot: 0, dir: 0 };
    for (const o of order) {
      const t = SPEC_TYPES.find((x) => o[x.is]);
      if (!t || !shown(o)) continue;
      const i = n[t.key]++;
      const a = specCuts[t.key];
      if (i < a.length) a[i] = o.userData.pkSpecCut || 0;
      const src = o.userData.pkSource || o;
      for (const m of masks) {
        if (i < m.off[t.key].length) m.off[t.key][i] = m.lights.has(src) ? 1 : 0;
      }
    }
    for (const t of SPEC_TYPES) {
      specCuts[t.key].fill(0, n[t.key]);
      for (const m of masks) m.off[t.key].fill(0, n[t.key]);
    }
  };
}

// ---------------------------------------------------------------- light pool
// A spot whose cone stays outside the view (widened by this margin, so mirrors and
// free look are covered) lights nothing on screen; its importance drops to 0.1.
const VIEW_MARGIN = THREE.MathUtils.degToRad(20);
// Lights fade in over importance cut .. (1 + FADE_BAND) * cut, the cut being the
// first light left out, so a light crossing the cut never pops.
const FADE_BAND = 1;
const _frustum = new THREE.Frustum();
const _proj = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _axis = new THREE.Vector3();

function viewFrustum(cam) {
  const vfov = THREE.MathUtils.degToRad(cam.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
  const lim = THREE.MathUtils.degToRad(85);
  const tv = Math.tan(Math.min(vfov / 2 + VIEW_MARGIN, lim)) * cam.near;
  const th = Math.tan(Math.min(hfov / 2 + VIEW_MARGIN, lim)) * cam.near;
  _proj.makePerspective(-th, th, tv, -tv, cam.near, cam.far).multiply(cam.matrixWorldInverse);
  return _frustum.setFromProjectionMatrix(_proj);
}

// 1 when a sphere meets the frustum, fading to 0 over `soft` metres outside it.
function sphereInView(frustum, sphere, soft) {
  let gap = -Infinity;
  for (const pl of frustum.planes) gap = Math.max(gap, -pl.distanceToPoint(sphere.center) - sphere.radius);
  return 1 - THREE.MathUtils.smoothstep(gap, 0, soft);
}

// Spheres along the cone axis (0, 1, 2, 4 ... m out to the light's reach), each
// at least half as wide as its distance so the chain has no gaps.
function spotInView(it, frustum, camPos) {
  const l = it.light;
  _axis.setFromMatrixPosition(l.target.matrixWorld).sub(it.pos).normalize();
  const spread = Math.max(Math.tan(Math.min(l.angle, 1.4)), 0.5);
  const reach = l.distance > 0 ? l.distance : it.reach;
  let v = 0;
  for (let d = 0; v < 1; d = d ? d * 2 : 1) {
    const r = Math.min(d, reach);
    _sphere.center.copy(it.pos).addScaledVector(_axis, r);
    _sphere.radius = r * spread + 0.5;
    v = Math.max(v, sphereInView(frustum, _sphere, 2 + 0.25 * _sphere.center.distanceTo(camPos)));
    if (r >= reach) break;
  }
  return 0.1 + 0.9 * v;
}

// A light with a range (glTF KHR_lights_punctual range, the kit's pk_range) lights
// nothing outside its sphere; when that sphere stays outside the widened view, its
// importance drops to 0.1, like a spot whose cone stays off screen.
function rangeInView(it, frustum, camPos) {
  _sphere.center.copy(it.pos);
  _sphere.radius = it.light.distance;
  return 0.1 + 0.9 * sphereInView(frustum, _sphere, 2 + 0.25 * it.pos.distanceTo(camPos));
}

// Keeps the shader light count fixed: when a film has more point or spot lights
// than the budget, a fixed set of proxies takes the most important lights each
// frame, fading the ones near the cut so nothing pops. Importance is power over
// squared distance from the camera, times the light's priority (glTF extras
// pk_priority, or viewer.json lights.priority), and for spots times how much of
// the cone can be on screen.
function setupLights(root, scene, settings) {
  const cfg = settings.lights || {};
  const points = [];
  const spots = [];
  root.traverse((o) => {
    if (!o.isLight) return;
    o.intensity *= lightScale(o, settings.light_units);
    const name = o.userData.name || o.name;
    const gain = byName(cfg.gain, name);
    if (gain !== null) o.intensity *= Math.max(0, gain);
    const spec = byName(cfg.specular, name) ?? num(o.userData.pk_specular, 1);
    o.userData.pkSpecCut = 1 - THREE.MathUtils.clamp(spec, 0, 2);
    o.userData.pkPriority = Math.max(0, byName(cfg.priority, name) ?? num(o.userData.pk_priority, 1));
    if (o.isPointLight) points.push(o);
    else if (o.isSpotLight) spots.push(o);
  });
  const budget = {
    point: Math.max(1, Math.round(num(cfg.point, 24))),
    spot: Math.max(1, Math.round(num(cfg.spot, 8))),
  };
  if (coarse) {
    budget.point = Math.min(budget.point, Math.max(1, Math.round(num(cfg.touch_point, 10))));
    budget.spot = Math.min(budget.spot, Math.max(1, Math.round(num(cfg.touch_spot, 4))));
  }
  if (params.has('lights')) budget.point = budget.spot = Math.max(1, +params.get('lights') || 1);
  const pools = [];
  if (points.length > budget.point) pools.push(makePool(points, budget.point, false));
  if (spots.length > budget.spot) pools.push(makePool(spots, budget.spot, true));

  function makePool(lights, size, spot) {
    const proxies = [];
    for (let i = 0; i < size; i++) {
      const l = spot ? new THREE.SpotLight() : new THREE.PointLight();
      l.intensity = 0;
      l.decay = 2;
      scene.add(l);
      if (spot) scene.add(l.target);
      proxies.push(l);
    }
    const items = lights.map((light) => {
      light.visible = false;
      const power = light.intensity * Math.max(light.color.r, light.color.g, light.color.b);
      // distance at which the light falls to 1e-3 W/m2 (about where it stops showing)
      return { light, pos: new THREE.Vector3(), imp: 0, power, reach: Math.min(400, Math.sqrt(power / 1e-3)) };
    });
    return {
      update(cam, camPos, frustum) {
        for (const it of items) {
          it.pos.setFromMatrixPosition(it.light.matrixWorld);
          it.imp = it.power * it.light.userData.pkPriority / (it.pos.distanceToSquared(camPos) + 1);
          if (spot && it.imp > 0) it.imp *= spotInView(it, frustum, camPos);
          else if (it.imp > 0 && it.light.distance > 0) it.imp *= rangeInView(it, frustum, camPos);
        }
        items.sort((a, b) => b.imp - a.imp);
        const cut = items.length > size ? items[size].imp : 0;
        proxies.forEach((p, i) => {
          const it = items[i];
          const fade = cut > 0 ? Math.min(1, Math.max(0, (it.imp - cut) / (FADE_BAND * cut))) : 1;
          p.position.copy(it.pos);
          p.color.copy(it.light.color);
          p.intensity = it.light.intensity * fade;
          p.distance = it.light.distance;
          p.decay = it.light.decay;
          p.userData.pkSpecCut = it.light.userData.pkSpecCut;
          p.userData.pkSource = it.light;
          if (spot) {
            p.angle = it.light.angle;
            p.penumbra = it.light.penumbra;
            p.target.position.setFromMatrixPosition(it.light.target.matrixWorld);
            p.target.updateMatrixWorld();
          }
          p.updateMatrixWorld();
        });
      },
      dispose() {
        proxies.forEach((p) => { scene.remove(p); if (spot) scene.remove(p.target); p.dispose(); });
      },
    };
  }

  const all = [];
  scene.traverse((o) => { if (o.isLight) all.push(o); });
  const count = (is) => all.filter((o) => o[is] && o.visible).length;
  const counts = { point: count('isPointLight'), spot: count('isSpotLight'), dir: count('isDirectionalLight') };
  allocSpecCuts(counts);
  const anySpec = specPatched && all.some((o) => o.userData.pkSpecCut);
  const sources = [];
  root.traverse((o) => { if (o.isLight) sources.push(o); });
  const masks = setupExclude(root, cfg.exclude, counts, sources);
  const camPos = new THREE.Vector3();

  return {
    count: points.length + spots.length,
    sync: anySpec || masks.length ? specSync(scene, masks) : null,
    update(cam) {
      if (!pools.length) return;
      camPos.setFromMatrixPosition(cam.matrixWorld);
      const frustum = viewFrustum(cam);
      pools.forEach((p) => p.update(cam, camPos, frustum));
    },
    dispose() { pools.forEach((p) => p.dispose()); },
  };
}

function num(v, d) {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) ? n : d;
}

// GLTFLoader leaves texture anisotropy at 1, so a road or a tall window seen at an
// angle drops to the blurry mip of its most compressed axis. Blender's renders are
// sharp there; filter every glTF texture anisotropically.
function sharpenTextures(root) {
  const max = renderer.capabilities.getMaxAnisotropy();
  const aniso = Math.min(max, coarse ? 8 : 16);
  if (aniso <= 1) return;
  root.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const key of Object.keys(m)) {
        const v = m[key];
        if (v && v.isTexture && v.anisotropy < aniso) v.anisotropy = aniso;
      }
    }
  });
}

function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const key of Object.keys(m)) {
        const v = m[key];
        if (v && v.isTexture) v.dispose();
      }
      m.dispose();
    }
  });
}

function disposeFilm(f) {
  if (!f) return;
  f.mirrors?.dispose();
  f.lights?.dispose();
  if (f.root) disposeObject(f.root);
  f.sky?.dispose();
  f.envTarget?.dispose();
  renderer.renderLists.dispose();
}

// Time 0 of the film is Blender frame 1. Blender's exporter writes frame f at
// f / 24 s unless actions were slid to zero, so the clip offset is 1/24 or 0.
function clipOffset(clips, camera) {
  const names = new Set();
  for (let o = camera; o; o = o.parent) if (o.name) names.add(o.name);
  let camStart = Infinity;
  let anyStart = Infinity;
  for (const clip of clips) {
    for (const track of clip.tracks) {
      if (!track.times.length) continue;
      const start = track.times[0];
      anyStart = Math.min(anyStart, start);
      const node = track.name.slice(0, track.name.lastIndexOf('.'));
      if (names.has(node)) camStart = Math.min(camStart, start);
    }
  }
  const start = Number.isFinite(camStart) ? camStart : anyStart;
  if (!Number.isFinite(start)) return 0;
  return start < 0.5 / FPS ? 0 : 1 / FPS;
}

function autoFogDensity(root, camera, skipSet) {
  const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const d = [];
  const sphere = new THREE.Sphere();
  root.traverse((o) => {
    if (!o.isMesh || skipSet.has(o)) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    d.push(sphere.center.distanceTo(camPos));
  });
  if (!d.length) return 0.004;
  d.sort((a, b) => a - b);
  const r = d[Math.floor(d.length * 0.75)];
  // about 11% fog at the 75th percentile distance, 39% at twice that
  return 0.35 / Math.max(r, 8);
}

// ---------------------------------------------------------------- film loading

async function loadFilm(slug) {
  const token = ++loadToken;
  const meta = FILMS.find((f) => f.slug === slug) || { slug, title: slug };
  select.value = meta.slug;
  disposeFilm(film);
  film = null;
  renderer.setRenderTarget(null);
  renderer.clear();
  hideVeil();
  setControlsEnabled(false);
  setProgress(0.04);

  const base = new URL(`../films/${meta.slug}/web/`, location.href);
  const glbUrl = new URL('scene.glb', base).href;
  let skyUrl = new URL('sky.json', base).href;
  // ?sky=<same-origin path> tries another sky.json against this scene (for kit testing).
  if (params.has('sky')) {
    const alt = new URL(params.get('sky'), location.href);
    if (alt.origin === location.origin) skyUrl = alt.href;
  }
  const [skyJson, viewerJson, hasGlb] = await Promise.all([
    fetchJson(skyUrl),
    fetchJson(new URL('viewer.json', base).href),
    exists(glbUrl),
  ]);
  if (token !== loadToken) return;

  const settings = mergeSettings(viewerJson, urlSettings);
  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false;
  const f = { slug: meta.slug, title: meta.title, scene, settings, ready: false };

  const wl = settings.world_light;
  const worldLight = {
    gain: (Array.isArray(wl.tint) ? wl.tint : [1, 1, 1]).map((x) => (+x) * (+wl.gain)),
    ambient: Array.isArray(wl.ambient) ? wl.ambient.map(Number) : [0, 0, 0],
  };
  try {
    f.sky = await loadSky(skyUrl, renderer, skyJson || fallbackSkyJson(), worldLight);
  } catch (err) {
    console.warn('Sky failed, using a plain night gradient', err);
    f.sky = await loadSky(skyUrl, renderer, fallbackSkyJson(), worldLight);
  }
  if (token !== loadToken) { f.sky.dispose(); return; }
  setProgress(0.35);
  scene.add(f.sky.makeMesh());
  if (off('sharpen')) f.sky.material.uniforms.uSharpen.value = 0;
  const envScene = new THREE.Scene();
  envScene.add(f.sky.makeMesh(true));
  f.envTarget = pmrem.fromScene(envScene, 0, 0.1, 100);
  scene.environment = f.envTarget.texture;
  scene.environmentIntensity = off('env') ? 0 : settings.env_intensity;
  const hc = Array.isArray(settings.fog_color) ? settings.fog_color.map(Number) : f.sky.horizonColor();
  f.fogColor = new THREE.Color().setRGB(hc[0], hc[1], hc[2], THREE.LinearSRGBColorSpace);

  if (!hasGlb) {
    // Quiet placeholder: the sky (if any) from a resting camera, and a note.
    f.camera = new THREE.PerspectiveCamera(62, 9 / 16, 0.1, 1000);
    f.camera.position.set(0, 1.4, 0);
    f.camera.rotation.set(THREE.MathUtils.degToRad(18), 0, 0, 'YXZ');
    f.camera.updateMatrixWorld();
    f.viewCam = f.camera.clone();
    f.placeholder = true;
    f.ready = true;
    film = f;
    setProgress(null);
    showVeil(meta.title, 'Not rendered yet');
    applySettings();
    resize();
    return;
  }

  let gltf;
  try {
    gltf = await gltfLoader.loadAsync(glbUrl, (e) => {
      if (token === loadToken && e.total) setProgress(0.35 + 0.6 * (e.loaded / e.total));
    });
  } catch (err) {
    console.error(err);
    if (token !== loadToken) return;
    disposeFilm(f);
    setProgress(null);
    showVeil(meta.title, 'This scene could not be opened');
    return;
  }
  if (token !== loadToken) {
    disposeObject(gltf.scene);
    disposeFilm(f);
    return;
  }

  f.root = gltf.scene;
  scene.add(gltf.scene);
  sharpenTextures(gltf.scene);

  // The first camera in the file. Its children (the vehicle) stay attached.
  let cam = gltf.cameras && gltf.cameras[0];
  if (cam && !cam.parent) {
    let found = null;
    gltf.scene.traverse((o) => { if (!found && o.isCamera && o.name === cam.name) found = o; });
    cam = found || cam;
  }
  if (!cam || !cam.parent) {
    gltf.scene.traverse((o) => { if (!cam?.parent && o.isCamera) cam = o; });
  }
  if (!cam || !cam.isPerspectiveCamera) {
    cam = new THREE.PerspectiveCamera(60, 9 / 16, 0.1, 2000);
    cam.position.set(0, 1.4, 0);
    scene.add(cam);
  }
  f.camera = cam;
  f.viewCam = new THREE.PerspectiveCamera(cam.fov, 9 / 16, cam.near, cam.far);
  f.vehicle = [...cam.children];

  f.mixer = new THREE.AnimationMixer(gltf.scene);
  f.actions = gltf.animations.map((clip) => {
    const a = f.mixer.clipAction(clip);
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.play();
    return a;
  });
  f.offset = clipOffset(gltf.animations, cam);

  f.lights = setupLights(gltf.scene, scene, settings);
  if (f.lights.sync) scene.onBeforeRender = f.lights.sync;
  const mirrorOnly = markMirrorOnly(gltf.scene, settings.mirror.only);
  f.mirrors = new Mirrors(renderer, scene, off('mirror') ? new THREE.Group() : gltf.scene,
    { ...settings.mirror, maxAniso: coarse ? 4 : 16 });

  applyTime(f, t);
  scene.updateMatrixWorld();
  const skip = new Set([...f.mirrors.meshes, ...mirrorOnly]);
  cam.traverse((o) => skip.add(o));
  f.fogDensity = settings.fog_density ?? autoFogDensity(gltf.scene, cam, skip) * settings.fog_strength;
  scene.fog = new THREE.FogExp2(f.fogColor, off('fog') ? 0 : f.fogDensity);

  film = f;
  applySettings();
  resize();
  // compile shaders up front so the first frames do not hitch
  try {
    updateView(f, 0);
    renderer.compile(scene, f.viewCam);
  } catch (err) {
    console.warn(err);
  }
  f.ready = true;
  setProgress(null);
  setControlsEnabled(true);
  document.documentElement.dataset.film = f.slug;
  window.__pov = { film: f, renderer, composer, bloomPass, THREE };
}

function applySettings() {
  if (!film) return;
  const s = film.settings;
  renderer.toneMappingExposure = Math.pow(2, +s.exposure || 0);
  const fu = finishPass.uniforms;
  fu.uExposure.value = renderer.toneMappingExposure;
  fu.uView.value = s.view === 'neutral' ? 1 : 0;
  fu.uPunchy.value = s.look === 'none' ? 0 : 1;
  fu.uSaturation.value = num(s.saturation, 1);
  const g = s.grade;
  fu.uBlack.value = THREE.MathUtils.clamp(num(g.black, 0), 0, 0.5);
  fu.uContrast.value = num(g.contrast, 1);
  fu.uContrastLuma.value = g.contrast_mode === 'luma' ? 1 : 0;
  const tint = Array.isArray(g.split_tint) ? g.split_tint.map((x) => num(x, 1)) : [1, 1, 1];
  fu.uSplitTint.value.set(tint[0], tint[1], tint[2]);
  const sFrom = num(g.split_from, 0.015);
  fu.uSplitRange.value.set(sFrom, Math.max(num(g.split_to, 0.55), sFrom + 1e-4));
  fu.uVignette.value = off('post') ? 0 : +s.post.vignette || 0;
  fu.uVignetteRadius.value = +s.post.vignette_radius || 0.62;
  fu.uGrain.value = off('post') ? 0 : +s.post.grain || 0;
  fu.uDispersion.value = off('post') ? 0 : +s.post.dispersion || 0;
  // ?bloom=strength,radius tries other bloom settings (debug)
  if ((params.get('bloom') || '').includes(',')) {
    const [bs, br] = params.get('bloom').split(',').map(Number);
    s.bloom.strength = bs;
    s.bloom.radius = br;
  }
  bloomPass.strength = off('bloom') ? 0 : +s.bloom.strength;
  // Mip weights change geometrically by 0.5 + radius per level: radius 0 keeps the glow
  // tight, 1 weights the wide levels most (a thin wide halo, like Blender's glare).
  const fall = THREE.MathUtils.clamp(0.5 + (+s.bloom.radius || 0), 0.1, 2.5);
  bloomPass.radius = 0;
  bloomPass.compositeMaterial.uniforms.bloomFactors.value = [0, 1, 2, 3, 4].map((i) => Math.pow(fall, i));
  bloomPass.threshold = +s.bloom.threshold;
  bloomPass.highPassUniforms.smoothWidth.value = Math.max(0.01, +s.bloom.knee || 0.01);
  if (bloomPass.compositeMaterial.uniforms.pkBloomSaturation) {
    bloomPass.compositeMaterial.uniforms.pkBloomSaturation.value = num(s.bloom.saturation, 1);
  }
  renderPass.scene = film.scene;
  renderPass.camera = film.viewCam;
}

// ---------------------------------------------------------------- per frame

function applyTime(f, time) {
  if (!f.mixer) return;
  for (const a of f.actions) {
    const clip = a.getClip();
    a.time = Math.min(Math.max(time + f.offset, 0), Math.max(0, clip.duration - 1e-4));
  }
  f.mixer.update(0);
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _look = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

function updateView(f, time) {
  applyTime(f, time);
  f.scene.updateMatrixWorld();
  const vc = f.viewCam;
  f.camera.matrixWorld.decompose(_p, _q, _s);
  _euler.set(look.pitch, look.yaw, 0, 'YXZ');
  _look.setFromEuler(_euler);
  vc.position.copy(_p);
  vc.quaternion.copy(_q).multiply(_look);
  const aspect = canvas.width / Math.max(1, canvas.height);
  if (vc.fov !== f.camera.fov || vc.aspect !== aspect || vc.near !== f.camera.near || vc.far !== f.camera.far) {
    vc.fov = f.camera.fov;
    vc.aspect = aspect;
    vc.near = f.camera.near;
    vc.far = f.camera.far;
    vc.updateProjectionMatrix();
  }
  vc.updateMatrixWorld();
  f.lights?.update(vc);
}

function spring(x, v, target, omega, dt) {
  // critically damped spring, implicit Euler step
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const det = 1 / (f + hhoo);
  return [(f * x + dt * v + hhoo * target) * det, (v + hoo * (target - x)) * det];
}

function updateLook(dt) {
  const target = look.dragging ? [look.ty, look.tp] : [0, 0];
  const omega = look.dragging ? 22 : 4.2;
  [look.yaw, look.vy] = spring(look.yaw, look.vy, target[0], omega, dt);
  [look.pitch, look.vp] = spring(look.pitch, look.vp, target[1], omega, dt);
}

let last = performance.now();
let slowFrames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (playing && !scrubbing && film && !film.placeholder) t = (t + dt) % DURATION;
  updateLook(dt);
  if (film && film.ready) {
    const start = performance.now();
    if (film.placeholder) {
      film.viewCam.aspect = canvas.width / Math.max(1, canvas.height);
      film.viewCam.updateProjectionMatrix();
      film.scene.updateMatrixWorld();
    } else {
      updateView(film, t);
      film.sky.setLightView(true);
      film.mirrors.update(film.viewCam, film.vehicle, t);
      film.sky.setLightView(false);
    }
    const fu = finishPass.uniforms;
    fu.uSeed.value = (fu.uSeed.value + 0.6180339) % 1;
    fu.uFrame.value = film.placeholder ? 0 : Math.floor(t * FPS);
    composer.render(dt);
    adapt(performance.now() - start, dt);
  }
  syncControls();
}

// Drop the pixel ratio a little when the device cannot keep up.
function adapt(cpuMs, dt) {
  if (dt > 1 / 30 && dpr > 1) slowFrames++;
  else slowFrames = Math.max(0, slowFrames - 1);
  if (slowFrames > 90) {
    slowFrames = 0;
    dpr = Math.max(1, dpr - 0.25);
    resize();
  }
}

// ---------------------------------------------------------------- layout

function resize() {
  const rect = phone.getBoundingClientRect();
  const w = Math.max(2, Math.round(rect.width));
  const h = Math.max(2, Math.round(rect.height));
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  bloomPass.setSize(Math.round(BLOOM_REF_HEIGHT * w / h), BLOOM_REF_HEIGHT);
  if (film?.mirrors) film.mirrors.setSize(canvas.width, canvas.height);
}

new ResizeObserver(resize).observe(phone);

// ---------------------------------------------------------------- controls

function syncControls() {
  if (!scrubbing) scrub.value = String(t);
  scrub.style.setProperty('--p', String(t / (DURATION - 1 / FPS)));
  scrub.setAttribute('aria-valuetext', `${t.toFixed(1)} seconds`);
}

function setPlaying(p) {
  playing = p;
  playBtn.classList.toggle('paused', !playing);
  playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

function setControlsEnabled(on) {
  for (const el of [playBtn, lookBtn, scrub]) el.disabled = !on;
  document.querySelector('.controls').classList.toggle('off', !on);
}

function setLook(on) {
  lookEnabled = on;
  lookBtn.setAttribute('aria-pressed', String(on));
  phone.classList.toggle('can-look', on);
  if (!on) look.dragging = false;
}

playBtn.addEventListener('click', () => setPlaying(!playing));
lookBtn.addEventListener('click', () => setLook(!lookEnabled));

scrub.addEventListener('pointerdown', () => { scrubbing = true; });
scrub.addEventListener('input', () => { scrubbing = true; t = clampTime(+scrub.value); });
const endScrub = () => { scrubbing = false; };
scrub.addEventListener('pointerup', endScrub);
scrub.addEventListener('pointercancel', endScrub);
scrub.addEventListener('change', endScrub);
scrub.addEventListener('blur', endScrub);

select.addEventListener('change', () => {
  const slug = select.value;
  const u = new URL(location.href);
  u.searchParams.set('film', slug);
  u.searchParams.delete('t');
  history.replaceState(null, '', u);
  loadFilm(slug);
});

let drag = null;
phone.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, yaw: look.yaw, pitch: look.pitch };
  phone.setPointerCapture(e.pointerId);
});
phone.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
  if (!drag.moved || !lookEnabled || !film || film.placeholder) return;
  const rect = phone.getBoundingClientRect();
  const vfov = THREE.MathUtils.degToRad(film.viewCam.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * film.viewCam.aspect);
  look.dragging = true;
  look.ty = THREE.MathUtils.clamp(drag.yaw + (dx / rect.width) * hfov * 1.15, -1.9, 1.9);
  look.tp = THREE.MathUtils.clamp(drag.pitch + (dy / rect.height) * vfov * 1.15, -0.9, 1.05);
  phone.classList.add('looking');
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && e.type === 'pointerup' && film?.ready && !film.placeholder) setPlaying(!playing);
  drag = null;
  look.dragging = false;
  phone.classList.remove('looking');
};
phone.addEventListener('pointerup', endDrag);
phone.addEventListener('pointercancel', endDrag);

document.addEventListener('keydown', (e) => {
  if (e.target === select || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!film?.ready || film.placeholder) return;
  if (e.code === 'Space' && e.target !== playBtn && e.target !== lookBtn) {
    e.preventDefault();
    setPlaying(!playing);
  } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    if (e.target === scrub) return;
    e.preventDefault();
    const step = e.shiftKey ? 1 : 1 / FPS;
    t = clampTime(t + (e.code === 'ArrowLeft' ? -step : step));
  } else if (e.key === 'l' || e.key === 'L') {
    setLook(!lookEnabled);
  }
});

// ---------------------------------------------------------------- start

async function pickInitialFilm() {
  const asked = params.get('film');
  if (asked && FILMS.some((f) => f.slug === asked)) return asked;
  const checks = await Promise.all(FILMS.map((f) => exists(new URL(`../films/${f.slug}/web/scene.glb`, location.href).href)));
  const firstFilm = FILMS.findIndex((f, i) => checks[i] && !f.slug.startsWith('_'));
  if (firstFilm >= 0) return FILMS[firstFilm].slug;
  const anyFilm = checks.findIndex(Boolean);
  return FILMS[anyFilm >= 0 ? anyFilm : 0].slug;
}

setPlaying(playing);
setLook(lookEnabled);
resize();
requestAnimationFrame(frame);
pickInitialFilm().then(loadFilm);
