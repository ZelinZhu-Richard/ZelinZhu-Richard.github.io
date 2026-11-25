// The room's geometry and materials: loads one shipped GLB (room-desktop.glb or
// room-phone.glb, named by public/home-assets/room/manifest.json) and swaps its glTF
// materials for the ones the act drives. Port of sketches/room/room.js (checked in a
// browser) onto the shipped export: node transforms (quantized meshes), the contact
// shadow decal, no baked armillary (the live instrument stands in its place), and the
// desk lamp lit on its own before the room (the reveal).
//
//   const gltf = await loadRoomGltf(url, { onProgress, bytes });
//   const room = prepareRoom(gltf, { look, anisotropy });
//   room.setLights({ lamp, room }); room.setScreens(v); room.setShadow(k); ...
//
// parseRoomGltf(arrayBuffer) is the same load from bytes (node checks use it).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { classify, LAYERS, REQUIRED_NODES, LAMP_NODE, WINDOW_NODE, OUTSIDE_NODES, anchorsFrom, filament, createLook, FRONT, frontLevel, stripStart, stripLevel, emitLevel } from './classify.js';
import { BG_VERT, BG_FRAG, FLOOR_VERT, FLOOR_FRAG, SEA_VERT, SEA_FRAG, POOL_VERT_PARS, POOL_VERT, POOL_FRAG_PARS, POOL_FRAG, CONTACT_VERT, CONTACT_FRAG } from './shaders.js';

/** Where the desk lamp's bulb is if the GLB does not say (Desk_Lamp's emitter, measured). */
const LAMP_FALLBACK = [-1.2537, 1.3608, -6.3542];
/** The desk top round the instrument ends here (room metres, measured from the shipped Desk): front edge z, right end x. */
export const DESK_EDGE = Object.freeze({ front: -5.98, right: -1.05 });
const OUTSIDE = new Set([...OUTSIDE_NODES, 'Sea']);

/** @param {THREE.LoadingManager} [manager] */
function createLoader(manager) {
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/**
 * Fetch and parse the room GLB.
 * @param {string} url
 * @param {{ onProgress?: (fraction: number) => void, bytes?: number, manager?: THREE.LoadingManager }} [o]
 *   bytes: the file size from the manifest, for progress when the server sends no length
 */
export function loadRoomGltf(url, { onProgress, bytes = 0, manager } = {}) {
  const loader = createLoader(manager);
  return loader.loadAsync(url, (e) => {
    if (!onProgress || !e) return;
    const total = e.lengthComputable && e.total > 0 ? e.total : bytes;
    if (total > 0) onProgress(Math.min(1, e.loaded / total));
  });
}

/**
 * Parse the room GLB from bytes.
 * @param {ArrayBuffer} buffer
 * @param {string} [path]
 */
export function parseRoomGltf(buffer, path = '') {
  return createLoader().parseAsync(buffer, path);
}

/** @param {THREE.Object3D} obj @param {THREE.Object3D} root */
function topNode(obj, root) {
  let o = obj;
  while (o.parent && o.parent !== root) o = o.parent;
  return o;
}

/**
 * @typedef {{ uLampPos: { value: THREE.Vector3 }, uLampPool: { value: THREE.Vector4 },
 *   uFront: { value: THREE.Vector4 }, uNight: { value: THREE.Vector3 } }} BakeUniforms
 */

/**
 * A baked atlas: unlit, night until the room's light front reaches it, then its own
 * bake, plus the desk lamp's pool while only the lamp is on (shaders.js POOL_*). One
 * program for all of them; the material colour stays white.
 * @param {string} name
 * @param {THREE.Texture | null} map
 * @param {BakeUniforms} pool
 */
function bakedMaterial(name, map, pool) {
  const m = new THREE.MeshBasicMaterial({ name, map, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLampPos = pool.uLampPos;
    shader.uniforms.uLampPool = pool.uLampPool;
    shader.uniforms.uFront = pool.uFront;
    shader.uniforms.uNight = pool.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${POOL_VERT_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${POOL_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${POOL_FRAG_PARS}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${POOL_FRAG}`);
  };
  m.customProgramCacheKey = () => 'room-bake-front-2';
  return m;
}

/**
 * The contact shadow under the live instrument's plinth (the GLB's decal was baked for
 * the Blender armillary's 14 cm marble foot and hides under the live 36 cm plinth): a
 * soft dark disc on the desk top, clipped at the desk's edges. Fades with `set(k)` as
 * the base is built.
 * @param {{ centre: ArrayLike<number>, radius: number, look: ReturnType<typeof createLook>, deskY?: number }} o
 */
export function createContactShadow({ centre, radius, look, deskY = 0.7712 }) {
  const reach = radius + look.contact[2];
  const g = new THREE.PlaneGeometry(2 * reach, 2 * reach);
  g.rotateX(-Math.PI / 2);
  const uniforms = {
    uCentre: { value: new THREE.Vector3(centre[0], deskY, centre[2]) },
    uShape: { value: new THREE.Vector4(radius, look.contact[1], reach, 0) },
    uClip: { value: new THREE.Vector2(DESK_EDGE.front, DESK_EDGE.right) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Instrument_Contact',
    vertexShader: CONTACT_VERT,
    fragmentShader: CONTACT_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'room:contact-shadow';
  mesh.position.set(centre[0], deskY, centre[2]);
  mesh.renderOrder = 1;
  mesh.layers.set(LAYERS.ROOM);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.updateMatrixWorld(true);
  mesh.visible = false;
  return {
    mesh,
    /** @param {number} k 0..1 (the base's build) */
    set(k) {
      const a = Math.min(1, Math.max(0, Number(k) || 0)) * look.contact[0];
      uniforms.uShape.value.w = a;
      mesh.visible = a > 0.002;
    },
    dispose() {
      g.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}

/** A full-screen backdrop drawn first, behind everything. @param {number} layer */
function makeBackdrop(layer) {
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
  mesh.name = `backdrop:${layer}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = -1e6;
  mesh.layers.set(layer);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * Swap the GLB's materials for the act's and gather what the act drives.
 * @param {{ scene: THREE.Group }} gltf
 * @param {{ look?: ReturnType<typeof createLook>, anisotropy?: number, warn?: (msg: string) => void }} [o]
 */
export function prepareRoom(gltf, { look = createLook(), anisotropy = 1, warn = (msg) => console.warn(msg) } = {}) {
  const root = gltf.scene;
  root.name = 'room';
  root.updateMatrixWorld(true);

  /** @type {BakeUniforms} */
  const pool = {
    uLampPos: { value: new THREE.Vector3().fromArray(LAMP_FALLBACK) },
    uLampPool: { value: new THREE.Vector4(0, 0, 0, look.poolReach) },
    uFront: { value: new THREE.Vector4(1, FRONT.start, FRONT.perMetre, FRONT.width) },
    uNight: { value: new THREE.Vector3().fromArray(look.night) },
  };
  /** @type {THREE.Material[]} materials whose colour is the room's light level (only unexpected ones: the bakes follow the front in their shader) */
  const baked = [];
  /** @type {THREE.MeshBasicMaterial[]} the outside's own atlas (fades with setOutside) */
  const outsideMats = [];
  /** @type {{ material: THREE.MeshBasicMaterial, base: THREE.Color, strength: number, group: string, node: string, box: THREE.Box3, t0: number }[]} */
  const emitters = [];
  /** @type {{ material: THREE.MeshBasicMaterial, mat: boolean }[]} */
  const screens = [];
  /** @type {{ material: THREE.MeshBasicMaterial, window: boolean }[]} */
  const glass = [];
  /** @type {Map<string, THREE.Material>} */
  const cache = new Map();
  /** @type {Set<THREE.Texture>} */
  const textures = new Set();
  /** @type {Set<THREE.Material>} */
  const materials = new Set();
  /** @type {Map<string, THREE.Object3D>} */
  const nodes = new Map();
  /** @type {Record<string, any>} */
  const anchorNodes = {};
  /** @type {Record<string, number>} */
  const kinds = {};
  const unclassified = [];
  const counts = { meshes: 0, primitives: 0, triangles: 0 };
  const lampBox = new THREE.Box3();
  const windowBox = new THREE.Box3();
  const box = new THREE.Box3();
  /** @type {THREE.Mesh | null} */ let floorMesh = null;
  /** @type {THREE.ShaderMaterial | null} */ let floor = null;
  /** @type {THREE.MeshBasicMaterial | null} */ let floorBaked = null;
  /** @type {THREE.ShaderMaterial | null} */ let sea = null;
  /** @type {THREE.MeshBasicMaterial | null} */ let shadow = null;

  for (const child of root.children) {
    nodes.set(child.name, child);
    if (child.name.startsWith('Anchor_')) anchorNodes[child.name] = { ...(child.userData || {}), position: child.getWorldPosition(new THREE.Vector3()).toArray() };
  }

  /** @template {THREE.Material} M @param {string} key @param {() => M} make @returns {M} */
  const remember = (key, make) => {
    if (!cache.has(key)) {
      const m = make();
      cache.set(key, m);
      materials.add(m);
    }
    return /** @type {any} */ (cache.get(key));
  };

  /** @type {THREE.Mesh[]} */
  const meshes = [];
  root.traverse((o) => {
    if (/** @type {any} */ (o).isMesh) meshes.push(/** @type {THREE.Mesh} */ (o));
  });
  for (const mesh of meshes) {
    const node = topNode(mesh, root).name;
    const src = /** @type {THREE.MeshBasicMaterial} */ (mesh.material);
    const name = src.name || '';
    const c = classify({ node, name, emit: src.userData && src.userData.emit, transparent: !!src.transparent });
    kinds[c.kind] = (kinds[c.kind] || 0) + 1;
    counts.primitives++;
    const g = mesh.geometry;
    counts.triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    mesh.matrixAutoUpdate = false;
    if (src.map) {
      src.map.anisotropy = anisotropy;
      textures.add(src.map);
    }
    if (!g.boundingBox) g.computeBoundingBox();
    /** @type {THREE.Material} */
    let m;
    switch (c.kind) {
      case 'sea':
        m = sea = new THREE.ShaderMaterial({
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
        materials.add(m);
        break;
      case 'floor':
        m = floor = new THREE.ShaderMaterial({
          name: 'Floor',
          vertexShader: FLOOR_VERT,
          fragmentShader: FLOOR_FRAG,
          uniforms: {
            map: { value: src.map },
            tRefl: { value: null },
            tReflBlur: { value: null },
            uLampPos: pool.uLampPos,
            uFront: pool.uFront,
            uNight: pool.uNight,
            uInvRes: { value: new THREE.Vector2(1, 1) },
            uRefl: { value: 0 },
          },
          side: THREE.DoubleSide,
        });
        // the baked-only fallback (tier 0): the same atlas and light front, no reflection lookups
        floorBaked = /** @type {THREE.MeshBasicMaterial} */ (bakedMaterial('Floor_Baked', src.map, pool));
        materials.add(floor);
        materials.add(floorBaked);
        floorMesh = mesh;
        break;
      case 'shadow':
        m = shadow = remember('shadow', () => new THREE.MeshBasicMaterial({
          name: 'Contact_Shadow',
          color: 0x000000,
          map: src.map,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -2,
        }));
        break;
      case 'bake':
      case 'image':
        m = remember(name, () => {
          if (c.lit) return bakedMaterial(name, src.map, pool);
          const b = new THREE.MeshBasicMaterial({ name, map: src.map, side: THREE.DoubleSide });
          outsideMats.push(b);
          return b;
        });
        break;
      case 'screen':
        m = remember(name, () => {
          const b = new THREE.MeshBasicMaterial({ name, map: src.map, side: THREE.DoubleSide });
          screens.push({ material: b, mat: node === 'Desk_Mat' });
          return b;
        });
        break;
      case 'emit': {
        // the room's strips each get their own material: they switch on one by one
        const key = c.group === 'room' ? `${name}|room|${node}` : `${name}|${c.group}`;
        m = remember(key, () => {
          const base = src.color.clone(); // glTF baseColorFactor: linear
          const b = new THREE.MeshBasicMaterial({ name, color: base.clone(), side: THREE.DoubleSide });
          emitters.push({ material: b, base, strength: /** @type {number} */ (c.strength), group: /** @type {string} */ (c.group), node, box: new THREE.Box3(), t0: 0 });
          return b;
        });
        const em = emitters.find((e) => e.material === m);
        if (em) em.box.union(box.copy(/** @type {THREE.Box3} */ (g.boundingBox)).applyMatrix4(mesh.matrixWorld));
        if (node === LAMP_NODE) lampBox.union(box.copy(/** @type {THREE.Box3} */ (g.boundingBox)).applyMatrix4(mesh.matrixWorld));
        break;
      }
      case 'glass':
        m = remember(`glass|${c.window}`, () => {
          // out = glass.rgb + behind * transmit: a faint cool sheen over a tinted pass-through
          const b = new THREE.MeshBasicMaterial({
            name: c.window ? 'Window_Glass' : 'Glass',
            color: c.window ? new THREE.Color(0.0016, 0.002, 0.004) : new THREE.Color(0.006, 0.007, 0.01),
            transparent: true,
            opacity: c.window ? look.glassTransmit : 0.82,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.SrcAlphaFactor,
            blendSrcAlpha: THREE.ZeroFactor,
            blendDstAlpha: THREE.OneFactor,
          });
          glass.push({ material: b, window: !!c.window });
          return b;
        });
        if (node === WINDOW_NODE) windowBox.union(box.copy(/** @type {THREE.Box3} */ (g.boundingBox)).applyMatrix4(mesh.matrixWorld));
        break;
      default:
        // anything unexpected: keep its texture or colour, unlit
        m = new THREE.MeshBasicMaterial({ name: `fallback_${name}`, map: src.map || null, color: src.color ? src.color.clone() : new THREE.Color(1, 1, 1), side: THREE.DoubleSide });
        materials.add(m);
        if (c.lit) baked.push(m);
        unclassified.push(`${name} on ${node}`);
        warn(`[room] unclassified material ${name} on ${node}`);
    }
    if (src !== m) src.dispose();
    mesh.material = m;
    mesh.layers.set(c.layer);
  }
  counts.meshes = new Set(meshes.map((m) => topNode(m, root))).size;

  const lampPos = lampBox.isEmpty() ? new THREE.Vector3().fromArray(LAMP_FALLBACK) : lampBox.getCenter(new THREE.Vector3());
  pool.uLampPos.value.copy(lampPos);
  // when each strip comes on: its stage, rippled by its distance from the bulb
  const centre = new THREE.Vector3();
  for (const em of emitters) em.t0 = em.group === 'room' ? stripStart(em.node, em.box.isEmpty() ? 3 : em.box.getCenter(centre).distanceTo(lampPos)) : 0;
  /** @type {THREE.Object3D[]} the outside's nodes (hidden while the false-space beat hides the outside) */
  const outsideNodes = [...nodes.entries()].filter(([n]) => OUTSIDE.has(n)).map(([, o]) => o);
  if (windowBox.isEmpty()) windowBox.set(new THREE.Vector3(-5.02, 0, -7.02), new THREE.Vector3(-1, 5, 0));

  const bgMain = makeBackdrop(LAYERS.BG_MAIN);
  const bgRefl = makeBackdrop(LAYERS.BG_REFL);
  root.add(bgMain, bgRefl);
  for (const b of [bgMain, bgRefl]) {
    materials.add(/** @type {THREE.Material} */ (b.material));
    b.updateMatrixWorld(true);
  }

  const missing = REQUIRED_NODES.filter((n) => !nodes.has(n));
  if (missing.length) warn(`[room] the GLB lacks ${missing.join(', ')}`);

  // ------------------------------------------------------------ the lights ---
  const state = { lamp: 1, room: 1, screens: 1, glass: 1, shadow: 0, outside: 1 };
  const bake = new THREE.Color();
  const fc = [0, 0, 0];
  const full = filament(1);
  const seaBase = sea ? /** @type {THREE.ShaderMaterial} */ (sea).uniforms.uBase.value.clone() : null;

  function applyLights() {
    const { lamp, room } = state;
    // the light front: the bakes (in their shader) and the strips (here) follow it
    pool.uFront.value.x = room;
    pool.uNight.value.fromArray(look.night);
    const lv = frontLevel(room, 3);
    const N = look.night;
    bake.setRGB(N[0] + (1 - N[0]) * lv, N[1] + (1 - N[1]) * lv, N[2] + (1 - N[2]) * lv);
    for (const b of baked) /** @type {any} */ (b).color.copy(bake);
    filament(lamp, fc);
    // the pool fills in only what the bake does not show yet (the shader fades it where the front has passed)
    const k = look.pool * lamp;
    pool.uLampPool.value.set(fc[0] * k, fc[1] * k, fc[2] * k, look.poolReach);
    // the filament warms with a quick rise and a soft tail; each strip blooms on at its turn
    const el = Math.pow(lamp, 1.6);
    for (const em of emitters) {
      const on = em.group === 'always' ? 1 : em.group === 'outside' ? state.outside : em.group === 'lamp' ? el : stripLevel(room, em.t0);
      const s = emitLevel(em.strength, look) * on;
      if (em.group === 'lamp') em.material.color.setRGB(em.base.r * s * (fc[0] / full[0]), em.base.g * s * (fc[1] / full[1]), em.base.b * s * (fc[2] / full[2]));
      else em.material.color.copy(em.base).multiplyScalar(s);
    }
  }

  function applyOutside() {
    const k = state.outside;
    for (const m of outsideMats) m.color.setScalar(k);
    if (sea && seaBase) /** @type {THREE.ShaderMaterial} */ (sea).uniforms.uBase.value.copy(seaBase).multiplyScalar(k);
    for (const o of outsideNodes) o.visible = k > 0.002;
  }

  function applyScreens() {
    const v = state.screens;
    // a screen waking: black (off: only a faint sheen), then a cool flash that settles
    const lift = v <= 0 ? 0.004 : 0.004 + (look.screenK - 0.004) * Math.pow(v, 1.4);
    const flash = 0.35 * Math.max(0, Math.sin(Math.PI * Math.min(1, v * 1.25))) * (1 - v);
    const forMat = 0.35 + 0.65 * state.room;
    for (const s of screens) {
      const k = s.mat ? lift * 0.62 * forMat : lift;
      s.material.color.setRGB(k + flash * 0.6, k + flash * 0.75, k + flash);
    }
  }

  function applyGlass() {
    for (const g of glass) if (g.window) g.material.opacity = look.glassTransmit * state.glass;
  }

  const clamp01 = (/** @type {number} */ v) => Math.min(1, Math.max(0, Number(v) || 0));
  applyLights();
  applyScreens();

  return {
    root,
    nodes,
    /** Anchors from the GLB's Anchor_* nodes (manifest values where one is missing). */
    anchors: anchorsFrom(anchorNodes),
    lampPos,
    windowBox,
    floorMesh,
    floor,
    floorBaked,
    sea,
    shadow,
    bgMain,
    bgRefl,
    textures,
    materials,
    counts,
    kinds,
    missing,
    unclassified,
    emitters,
    screens,
    glass,
    baked,
    pool,
    /** @param {{ lamp: number, room: number }} levels */
    setLights({ lamp, room }) {
      const a = clamp01(lamp);
      const b = clamp01(room);
      if (a === state.lamp && b === state.room) return;
      state.lamp = a;
      state.room = b;
      applyLights();
      applyScreens();
    },
    /** @param {number} v 0..1: the monitors (and the desk mat) wake */
    setScreens(v) {
      const s = clamp01(v);
      if (s === state.screens) return;
      state.screens = s;
      applyScreens();
    },
    /**
     * The outside (coast, city, sea): 1 shown, 0 hidden. The false-space beat hides it
     * so the window shows only the sky's stars; it comes in as the room's lights come up.
     * @param {number} k
     */
    setOutside(k) {
      const o = clamp01(k);
      if (o === state.outside) return;
      state.outside = o;
      applyOutside();
      applyLights();
    },
    get outside() {
      return state.outside;
    },
    /** @param {number} k window transmission factor (1 = clear, 0.5 = one stop darker) */
    setGlass(k) {
      const g = Math.max(0, Number.isFinite(k) ? k : 1);
      if (g === state.glass) return;
      state.glass = g;
      applyGlass();
    },
    /** @param {number} k contact shadow opacity 0..1 */
    setShadow(k) {
      state.shadow = clamp01(k);
      if (shadow) {
        shadow.opacity = state.shadow * look.shadow;
        shadow.visible = shadow.opacity > 0.002;
      }
    },
    /** @param {boolean} on planar floor reflection (off: the baked-only floor) */
    useReflection(on) {
      if (!floorMesh || !floor || !floorBaked) return;
      floorMesh.material = on ? floor : floorBaked;
      floor.uniforms.uRefl.value = on ? look.reflection : 0;
    },
    /** Re-apply everything after the look changed (tune). */
    refresh() {
      applyLights();
      applyScreens();
      applyGlass();
      applyOutside();
      if (shadow) shadow.opacity = state.shadow * look.shadow;
      if (floor && floorMesh && floorMesh.material === floor) floor.uniforms.uRefl.value = look.reflection;
    },
    /** GPU bytes of the textures (RGBA8 with mipmaps, as three uploads WebP). */
    textureBytes() {
      let b = 0;
      for (const t of textures) {
        const img = /** @type {any} */ (t.image);
        if (!img) continue;
        b += (img.width || 0) * (img.height || 0) * 4 * (t.generateMipmaps !== false ? 4 / 3 : 1);
      }
      return Math.round(b);
    },
    /** Bytes of the vertex and index buffers. */
    geometryBytes() {
      let b = 0;
      const seen = new Set();
      root.traverse((o) => {
        const g = /** @type {any} */ (o).geometry;
        if (!g || seen.has(g)) return;
        seen.add(g);
        for (const a of Object.values(g.attributes)) b += /** @type {any} */ (a).array.byteLength;
        if (g.index) b += g.index.array.byteLength;
      });
      return b;
    },
    dispose() {
      const geos = new Set();
      root.traverse((o) => {
        const g = /** @type {any} */ (o).geometry;
        if (g) geos.add(g);
      });
      for (const g of geos) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      root.removeFromParent();
    },
  };
}
