// The room act, sections 9 to 17 (STORYBOARD.md Act 3, ROOM.md): Richard's lab-bedroom
// at 3 a.m. False space (lights off: only the window's stars, the instrument's small
// spheres and dust read), the desk lamp warms and the room comes up, the tour of the
// desk and the four objects, the lamp clicks off, and the composer dissolves the room
// into space. Port of the live viewer sketches/room/ (main.js, room.js, reflect.js;
// checked in a browser at about 100 draw calls) onto the engine's shared modules.
//
// Implements the Act interface of engine/ARCHITECTURE.md:
//   const act = createRoomAct(ctx)   ctx = { THREE, renderer, assetsBase, rngFor, instrument, sky, tier, reducedMotion }
//   await act.load(onProgress)        manifest -> one GLB (desktop or phone textures by tier) -> materials -> uploads
//   act.render(frame, camera, target, time)
//   act.setTier(t) / act.resize(cssW, cssH, dpr) / act.pick() -> null / act.stonesScreen() -> [] / act.dispose()
// Extras: act.anchors (the room's Anchor_* nodes; anchors.instrument = { position, yaw,
// scale, ... } in the choreography's ROOM_INSTRUMENT form), act.finish (suggested
// post.finish() options for room frames), act.setQuietZone(ndcRect), act.tune(look),
// act.stats().
//
// One frame, every target written by exactly one render call:
//  1. sea mirror: sky + far coast mirrored in the water (y = -36 m)      (tier >= 1)
//  2. outside: sky + coast + city + sea through their own camera (near 1 m, far 400 km),
//     at CSS size, MSAA on tiers 2-3; skipped when the window is out of view
//  3. floor mirror: outside + room mirrored in the floor, then a blurred copy (tier >= 1;
//     skipped when the floor is out of view)
//  4. `target`: the outside as a full-screen backdrop, then the room, the instrument on
//     the desk and the dust (near 5 cm, far 150 m). No film finish here: engine/post does it.
//
// Params read (frame.params, ARCHITECTURE.md): lights (the desk lamp's filament warms
// alone first; then a light front runs out from it, so the strips bloom on in turn, desk,
// shelves, ceiling, bed, and the bake comes up behind them: room/classify.js lightLevels,
// FRONT, STRIP_STAGES), screens (monitors and the desk mat wake), aurora and galaxy (the
// window sky), build / crank / arms / brass / contact (the instrument; build is a
// choreography level, mapped by ./shared/build.js instrumentBuild as in the other acts,
// plus the globe at its §9 stage, room/instrument.js; the contact shadow under its plinth
// follows the base's build). Missing params read as the lit room with a complete,
// retracted brass instrument.
// False space (frame.u before FALSE_SPACE_UNTIL): with the lights off the room is at the
// night level (essentially black) and the outside (coast, city, sea, horizon haze) is
// hidden, so the window shows only stars and the faint galaxy; it comes in with the light
// front.
//
// The shared instrument is borrowed for each draw through ./shared/lease.js (it comes
// back to its previous parent, transform, light and look when render() returns) and is
// built once for all acts by ensureBuilt() during load().

import * as THREE from 'three';
import { rngFor as defaultRngFor } from '../core/rng.js';
import { createSky } from '../sky/index.js';
import { buildReveal } from '../instrument/pose.js';
import { clampTier } from '../quality/tiers.js';
import { BASE } from '../instrument/layout.js';
import { SKY_PRESETS } from '../sky/presets.js';
import { LAYERS, MASKS, roomTier, chooseSet, manifestProblems, lightLevels, filament, createLook, instrumentFrame, ANCHOR_DEFAULTS, FINISH } from './room/classify.js';
import { loadRoomGltf, prepareRoom, createContactShadow } from './room/assets.js';
import { createReflections } from './room/reflect.js';
import { createDust } from './room/dust.js';
import { createInstrumentRig, roomBuild } from './room/instrument.js';
import { ensureBuilt } from './shared/lease.js';

const NEAR = 0.05;
const FAR = 150;
const OUT_NEAR = 1;
const OUT_FAR = 400000;
/** Most pixels the outside target gets (about 1920 x 1040 CSS); bigger windows draw it a little softer. */
const OUT_PIXELS = 2.0e6;
const DEG = Math.PI / 180;
const EMPTY = Object.freeze({});
const NIGHT = new THREE.Color(0x0b0a14); // sRGB hex -> linear: the cleared frame before the room is in
/** Before this u the room is still in its false-space opening: the outside comes in with the room's lights. */
const FALSE_SPACE_UNTIL = 12;
/** The window sky's horizon haze (the 'window' preset's), off while the outside is hidden. */
const SKY_HORIZON = SKY_PRESETS.window.amounts.horizon;

const num = (/** @type {unknown} */ v, /** @type {number} */ d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const smooth01 = (/** @type {number} */ x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const nextTask = () => new Promise((r) => setTimeout(r, 0));

/**
 * @typedef {{ position: number[], target: number[], fov: number, roll?: number }} FrameCamera
 * @typedef {{
 *   u?: number, section?: number, viewport?: 'land' | 'port', acts?: { id: string, weight: number }[],
 *   transition?: null | { from: string, to: string, t: number, kind: string },
 *   camera?: FrameCamera, cameraB?: FrameCamera | null, params?: Record<string, number>,
 * }} FrameState
 * @typedef {{
 *   THREE?: any, renderer: THREE.WebGLRenderer, assetsBase?: string,
 *   rngFor?: (seed: any, key: string) => () => number, instrument?: any, sky?: any,
 *   tier?: number, reducedMotion?: boolean, seed?: number,
 * }} RoomContext
 */

/**
 * @param {RoomContext} ctx
 */
export function createRoomAct(ctx) {
  const { renderer, assetsBase = '/home-assets/', rngFor = defaultRngFor, instrument = null, sky: sharedSky = null, reducedMotion = false, seed = 7 } = ctx || /** @type {any} */ ({});
  if (!renderer || typeof renderer.render !== 'function') throw new TypeError('createRoomAct: ctx.renderer is required');
  if (typeof assetsBase !== 'string' || !assetsBase.endsWith('/')) throw new TypeError('createRoomAct: assetsBase must end with "/"');

  let tier = clampTier(ctx.tier ?? 2);
  let T = roomTier(tier);
  const look = createLook();
  const rig = createInstrumentRig(look, instrument);

  // ------------------------------------------------------------- the scene ---
  const scene = new THREE.Scene();
  scene.name = 'room';
  scene.matrixWorldAutoUpdate = false; // static room: matrices are set once, the instrument's per frame
  const roomCam = new THREE.PerspectiveCamera(50, 1, NEAR, FAR);
  roomCam.layers.mask = MASKS.room;
  const outCam = new THREE.PerspectiveCamera(50, 1, OUT_NEAR, OUT_FAR);
  outCam.layers.mask = MASKS.out;
  const emptyScene = new THREE.Scene();

  // the window's sky: an own copy of the engine sky (a mesh has one parent), 'window' preset
  const sky = sharedSky && typeof sharedSky.clone === 'function' ? sharedSky.clone() : createSky({ seed, tier: T.sky });
  const skyPreset = sky.applyPreset('window');
  sky.setTier(T.sky);
  sky.object3D.layers.set(LAYERS.OUT);
  scene.add(sky.object3D);

  const dust = createDust({ rng: rngFor(seed, 'room:dust'), count: T.dust });
  scene.add(dust.object3D);

  const outRT = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: false, depthBuffer: true, stencilBuffer: false, samples: T.outSamples,
  });
  outRT.texture.name = 'room:outside';
  const refl = createReflections(renderer);

  // ----------------------------------------------------------------- state ---
  const css = { w: 0, h: 0, dpr: 1 };
  /** @type {ReturnType<typeof prepareRoom> | null} */
  let room = null;
  let ready = false;
  let disposed = false;
  /** @type {Promise<void> | null} */
  let loading = null;
  /** @type {string | null} */
  let setName = null;
  let anchors = ANCHOR_DEFAULTS;
  let at = instrumentFrame(anchors.instrument);
  /** @type {ReturnType<typeof createContactShadow> | null} */
  let contact = null;
  /** @type {number[] | null} */
  let quiet = null;
  let quietK = 1;
  const windowBox = new THREE.Box3(new THREE.Vector3(-5.27, -0.25, -7.27), new THREE.Vector3(-0.75, 5.25, 0.25));
  const windowMirror = new THREE.Box3();
  const floorBox = new THREE.Box3(new THREE.Vector3(-5.2, -0.01, -7.2), new THREE.Vector3(5.2, 0.01, 0.2));
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const tmpScale = new THREE.Vector3();
  const lampCol = [0, 0, 0];
  const last = { outside: false, floorOutside: false, floor: false, sea: false, instrument: false, outsideK: 1, frames: 0 };

  function mirrorWindowBox() {
    windowMirror.min.set(windowBox.min.x, -windowBox.max.y, windowBox.min.z);
    windowMirror.max.set(windowBox.max.x, -windowBox.min.y, windowBox.max.z);
  }
  mirrorWindowBox();

  // ----------------------------------------------------------------- sizes ---
  /** @param {number} w CSS px @param {number} h CSS px @param {number} dpr */
  function applySize(w, h, dpr) {
    css.w = Math.max(1, w);
    css.h = Math.max(1, h);
    css.dpr = dpr > 0 ? dpr : 1;
    // the outside is seen through 93 % glass: CSS size, and no more than OUT_PIXELS on big windows
    const k = Math.min(T.outScale, Math.sqrt(OUT_PIXELS / (css.w * css.h)));
    const ow = Math.max(1, Math.round(css.w * k));
    const oh = Math.max(1, Math.round(css.h * k));
    if (outRT.width !== ow || outRT.height !== oh) outRT.setSize(ow, oh);
    refl.setSize(css.w, css.h, T.floor, T.sea);
    if (room) room.useReflection(refl.floorOn);
  }

  /** The stage never called resize(): size from the target at the renderer's pixel ratio. @param {THREE.WebGLRenderTarget | null} target */
  function ensureSize(target) {
    if (css.w > 0) return;
    const pr = renderer.getPixelRatio() || 1;
    if (target) applySize(target.width / pr, target.height / pr, pr);
    else {
      const v = renderer.getSize(new THREE.Vector2());
      applySize(v.x, v.y, pr);
    }
  }

  // ---------------------------------------------------------------- loading ---
  /** @param {(fraction: number) => void} [onProgress] */
  function load(onProgress) {
    if (disposed) return Promise.reject(new Error('room act: disposed'));
    if (loading) return loading;
    /** @param {number} f */
    const report = (f) => {
      try {
        onProgress?.(Math.min(1, Math.max(0, f)));
      } catch (err) {
        void err; // a listener's error is not the load's
      }
    };
    loading = (async () => {
      report(0);
      // the shared instrument, built once for every act (in parallel with the room's download);
      // if it fails the room still draws, without it
      const instrumentBuilt = instrument
        ? ensureBuilt(instrument).catch((err) => console.warn('[room] the instrument did not build:', err))
        : Promise.resolve();
      const base = `${assetsBase}room/`;
      const res = await fetch(`${base}manifest.json`);
      if (!res.ok) throw new Error(`room act: ${base}manifest.json answered ${res.status}`);
      const manifest = await res.json();
      const problems = manifestProblems(manifest);
      if (problems.length) throw new Error(`room act: ${problems.join('; ')}`);
      if (disposed) return;
      report(0.03);
      setName = chooseSet(manifest, tier);
      const set = manifest.sets[setName];
      const gltf = await loadRoomGltf(base + set.file, { bytes: set.bytes, onProgress: (f) => report(0.03 + 0.85 * f) });
      if (disposed) {
        disposeGltf(gltf);
        return;
      }
      const maxAniso = renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function' ? renderer.capabilities.getMaxAnisotropy() : 1;
      room = prepareRoom(gltf, { look, anisotropy: Math.max(1, Math.min(T.anisotropy, maxAniso)) });
      anchors = room.anchors;
      at = instrumentFrame(anchors.instrument);
      windowBox.copy(room.windowBox).expandByScalar(0.25);
      mirrorWindowBox();
      scene.add(room.root);
      // the live instrument's own contact shadow (the GLB's decal fits the Blender armillary's foot)
      contact = createContactShadow({ centre: at.base, radius: BASE.radius * at.scale, look });
      scene.add(contact.mesh);
      room.setShadow(0);
      if (css.w > 0) applySize(css.w, css.h, css.dpr);
      room.useReflection(refl.floorOn);
      report(0.9);
      await warm();
      await instrumentBuilt;
      if (disposed) return;
      ready = true;
      report(1);
    })().catch((err) => {
      loading = null; // a later load() may try again
      throw err;
    });
    return loading;
  }

  /** Upload the textures and compile the programs now, not on the first frame. */
  async function warm() {
    if (!room) return;
    const list = [...room.textures];
    for (let i = 0; i < list.length; i++) {
      if (disposed) return;
      try {
        renderer.initTexture(list[i]);
      } catch (err) {
        void err; // uploads on first use instead
      }
      if (i % 3 === 2) await nextTask();
    }
    if (disposed || typeof renderer.compileAsync !== 'function') return;
    // compile() is synchronous; only the readiness wait is async, so renderer state is
    // restored before anything else can render
    const pending = [];
    for (const clip of [[], refl.floorClip]) {
      const prevTarget = renderer.getRenderTarget();
      const prevClip = renderer.clippingPlanes;
      try {
        renderer.clippingPlanes = clip;
        renderer.setRenderTarget(outRT); // a linear HalfFloat target: the program variants acts draw with
        pending.push(renderer.compileAsync(scene, roomCam));
      } catch (err) {
        void err; // a lost context: programs compile on first use
      } finally {
        renderer.clippingPlanes = prevClip;
        renderer.setRenderTarget(prevTarget);
      }
    }
    await Promise.all(pending);
  }

  /** @param {{ scene: THREE.Object3D }} gltf */
  function disposeGltf(gltf) {
    gltf.scene.traverse((o) => {
      const m = /** @type {any} */ (o);
      if (m.geometry) m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) {
        for (const v of Object.values(mat)) if (v && /** @type {any} */ (v).isTexture) /** @type {any} */ (v).dispose();
        mat.dispose();
      }
    });
  }

  // ----------------------------------------------------------------- camera ---
  /**
   * The room's camera: a THREE camera or FrameCamera the stage passes, else the room's
   * own from the FrameState (cameraB when the room is the second act of a transition).
   * @param {FrameState | null | undefined} frame @param {any} camera
   */
  function cameraFor(frame, camera) {
    if (camera && (camera.isCamera || (Array.isArray(camera.position) && Array.isArray(camera.target)))) return camera;
    if (frame) {
      const acts = frame.acts || [];
      if (acts[1] && acts[1].id === 'room' && frame.cameraB) return frame.cameraB;
      if (frame.camera) return frame.camera;
    }
    return null;
  }

  /** @param {any} c @param {number} aspect */
  function placeCamera(c, aspect) {
    if (c && c.isCamera) {
      c.updateMatrixWorld();
      c.matrixWorld.decompose(roomCam.position, roomCam.quaternion, tmpScale);
      if (c.isPerspectiveCamera && c.fov > 0) roomCam.fov = c.fov;
    } else {
      // no camera: three-quarters on the instrument from the room side
      const pos = c ? c.position : [at.centre[0] + 0.42, at.centre[1] + 0.12, at.centre[2] + 0.62];
      const tgt = c ? c.target : at.centre;
      roomCam.position.set(pos[0], pos[1], pos[2]);
      roomCam.up.set(0, 1, 0);
      if (Math.hypot(tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]) > 1e-6) roomCam.lookAt(tgt[0], tgt[1], tgt[2]);
      const roll = c ? num(c.roll, 0) : 0;
      if (roll) roomCam.rotateZ(roll * DEG);
      roomCam.fov = c && num(c.fov, 0) > 0 ? c.fov : 40;
    }
    roomCam.aspect = aspect;
    roomCam.near = NEAR;
    roomCam.far = FAR;
    roomCam.updateProjectionMatrix();
    roomCam.updateMatrixWorld(true);
    outCam.position.copy(roomCam.position);
    outCam.quaternion.copy(roomCam.quaternion);
    outCam.fov = roomCam.fov;
    outCam.aspect = aspect;
    outCam.updateProjectionMatrix();
    outCam.updateMatrixWorld(true);
  }

  /** @param {THREE.Box3} box */
  function sees(box) {
    projView.multiplyMatrices(roomCam.projectionMatrix, roomCam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    return frustum.intersectsBox(box);
  }

  // ----------------------------------------------------------------- render ---
  /** @param {THREE.WebGLRenderTarget | null} target */
  function clearTarget(target) {
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(NIGHT, 1);
    renderer.setRenderTarget(target);
    renderer.render(emptyScene, roomCam); // a render, not a bare clear, so an MSAA target resolves
    renderer.setClearColor(prevColor, prevAlpha);
  }

  /**
   * @param {FrameState | null | undefined} frame
   * @param {any} camera THREE camera, FrameCamera, or null (the frame's room camera)
   * @param {THREE.WebGLRenderTarget | null} target
   * @param {number} [time] seconds
   */
  function render(frame, camera, target, time) {
    if (disposed) return;
    const prevTarget = renderer.getRenderTarget();
    const prevClip = renderer.clippingPlanes;
    const prevAuto = renderer.autoClear;
    renderer.autoClear = true;
    try {
      if (!ready || !room) clearTarget(target ?? null);
      else draw(frame, camera, target ?? null, time);
    } finally {
      rig.end(); // the shared instrument goes back where it was, with its light and look
      renderer.clippingPlanes = prevClip;
      renderer.autoClear = prevAuto;
      renderer.setRenderTarget(prevTarget);
    }
  }

  /**
   * @param {FrameState | null | undefined} frame
   * @param {any} camera
   * @param {THREE.WebGLRenderTarget | null} target
   * @param {number | undefined} time
   */
  function draw(frame, camera, target, time) {
    const R = /** @type {NonNullable<typeof room>} */ (room);
    ensureSize(target);
    const P = (frame && frame.params) || EMPTY;
    const viewport = frame && frame.viewport === 'port' ? 'port' : 'land';
    const tw = target ? target.width : Math.round(css.w * css.dpr);
    const th = target ? target.height : Math.round(css.h * css.dpr);
    placeCamera(cameraFor(frame, camera), tw / Math.max(1, th));
    const t = reducedMotion ? 0 : num(time, 0);
    const skyTime = skyPreset.stillTime + t;

    // params -> the room, the sky, the instrument, the dust
    const levels = lightLevels(num(P.lights, 1));
    R.setLights(levels);
    R.setScreens(num(P.screens, 1));
    // false space: until the room's lights first come up, the window shows only the sky
    // (no coast, city or sea, no horizon haze); they come in with the light front
    const outsideK = num(frame && frame.u, FALSE_SPACE_UNTIL) < FALSE_SPACE_UNTIL ? smooth01(levels.room / 0.25) : 1;
    R.setOutside(outsideK);
    sky.setHorizon(SKY_HORIZON * outsideK);
    sky.setAurora(num(P.aurora, 0.8));
    sky.setGalaxy(num(P.galaxy, 0.75));
    sky.setTime(skyTime);
    // the shared instrument, borrowed until render() ends (rig.end)
    const root = rig.begin(scene, at, P, viewport, levels, R.lampPos);
    // the shadow under the base: there as the base is built, never under nothing
    if (contact) contact.set(root ? buildReveal(roomBuild(P)).base : 0);
    filament(levels.lamp, lampCol);
    const lampK = Math.pow(levels.lamp, 1.5);
    lampCol[0] *= lampK;
    lampCol[1] *= lampK;
    lampCol[2] *= lampK;
    dust.update({
      time: t, dpr: tw / css.w, amp: reducedMotion ? 0 : look.dustDrift, room: levels.room, lampPos: R.lampPos,
      lamp: lampCol, lampGain: look.dustLamp, reach: look.dustReach, star: look.dustStar,
    });

    // what this view needs
    const outside = sees(windowBox);
    const floor = refl.floorOn && sees(floorBox);
    const floorOutside = floor && sees(windowMirror);
    const sea = R.sea;

    // 1. the sea's mirror (sky and coast only)
    if (sea) {
      sea.uniforms.uTime.value = skyTime;
      if (outside && refl.seaOn && outsideK > 0.002) {
        sky.setQuietZone(null);
        refl.renderSea(scene, outCam, MASKS.sea);
        sea.uniforms.tRefl.value = refl.seaRT.texture;
        sea.uniforms.uRefl.value = outsideK;
      } else sea.uniforms.uRefl.value = 0;
    }
    // 2. the outside, through its own camera
    if (outside) {
      sky.setQuietZone(quiet, quietK);
      if (sea) sea.uniforms.uInvRes.value.set(1 / outRT.width, 1 / outRT.height);
      renderer.setRenderTarget(outRT);
      renderer.render(scene, outCam);
    }
    // 3. the floor's mirror (the instrument hidden: the desk top hides it from below)
    if (floor && R.floor) {
      sky.setQuietZone(null);
      if (sea) sea.uniforms.uRefl.value = 0; // the mirrored sea: dark water only
      R.bgRefl.material.uniforms.tBg.value = refl.floorOut.texture;
      R.bgRefl.material.uniforms.uInvRes.value.set(1 / refl.floorRT.width, 1 / refl.floorRT.height);
      if (root) root.visible = false;
      refl.renderFloor(scene, outCam, roomCam, { out: MASKS.mirrorOut, room: MASKS.mirrorRoom }, floorOutside);
      if (root) root.visible = true;
      const u = R.floor.uniforms;
      u.tRefl.value = refl.floorRT.texture;
      u.tReflBlur.value = refl.floorBlur.texture;
      u.uRefl.value = look.reflection;
    } else if (R.floor) R.floor.uniforms.uRefl.value = 0;
    // 4. the room over the outside, into the act's target
    R.bgMain.material.uniforms.tBg.value = outRT.texture;
    R.bgMain.material.uniforms.uInvRes.value.set(1 / tw, 1 / th);
    if (R.floor) R.floor.uniforms.uInvRes.value.set(1 / tw, 1 / th);
    renderer.setRenderTarget(target);
    renderer.render(scene, roomCam);

    last.outside = outside;
    last.floor = floor;
    last.floorOutside = floorOutside;
    last.sea = !!(sea && outside && refl.seaOn && outsideK > 0.002);
    last.outsideK = outsideK;
    last.instrument = !!root;
    last.frames++;
  }

  // ------------------------------------------------------------------- api ---
  return {
    id: 'room',
    load,
    get ready() {
      return ready;
    },
    /** @param {number} t 0..3 */
    setTier(t) {
      if (disposed) return;
      tier = clampTier(t);
      T = roomTier(tier);
      sky.setTier(T.sky);
      if (outRT.samples !== T.outSamples) {
        outRT.samples = T.outSamples;
        outRT.dispose(); // three reallocates at the new sample count on next use
      }
      if (css.w > 0) applySize(css.w, css.h, css.dpr);
      dust.setCount(T.dust);
    },
    /** @param {number} width CSS px @param {number} height CSS px @param {number} dpr */
    resize(width, height, dpr) {
      if (disposed) return;
      applySize(num(width, 1), num(height, 1), num(dpr, renderer.getPixelRatio() || 1));
    },
    render,
    /** The room has no stones to pick. */
    pick() {
      return null;
    },
    stonesScreen() {
      return [];
    },
    /**
     * The room's anchors (room metres, Y up). instrument = where the instrument stands:
     * { position (its origin), yaw (degrees about +Y), yawRad, scale (m per unit),
     * height, base (feet centre on the desk), centre (armillary centre), facing, size }.
     */
    get anchors() {
      const { instrument: a, ...rest } = anchors;
      return {
        ...rest,
        instrument: { ...a, position: at.position.slice(), base: at.base.slice(), centre: at.centre.slice(), yaw: at.yaw, yawRad: at.yawRad, scale: at.scale, height: at.height },
      };
    },
    /** Suggested engine/post finish() options for room frames (merge with quiet zones and time). */
    finish: FINISH,
    /**
     * Dim the window's sky under text: an NDC rectangle [x0, y0, x1, y1] (y up) or null.
     * @param {number[] | null} rect @param {number} [strength]
     */
    setQuietZone(rect, strength = 1) {
      quiet = Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite) ? rect.slice() : null;
      quietK = Math.min(1, Math.max(0, num(strength, 1)));
    },
    /**
     * Look tuning from the console: any key of createLook() (numbers or [r, g, b]).
     * Returns the current look.
     * @param {Record<string, any>} [o]
     */
    tune(o = {}) {
      for (const [k, v] of Object.entries(o || {})) {
        const cur = /** @type {any} */ (look)[k];
        if (cur === undefined) continue;
        if (Array.isArray(cur) && Array.isArray(v) && v.length === cur.length && v.every(Number.isFinite)) /** @type {any} */ (look)[k] = v.slice();
        else if (typeof cur === 'number' && Number.isFinite(v)) /** @type {any} */ (look)[k] = v;
      }
      if (room) {
        room.pool.uLampPool.value.w = look.poolReach;
        room.refresh();
      }
      return JSON.parse(JSON.stringify(look));
    },
    stats() {
      const outPx = outRT.width * outRT.height;
      const s = outRT.samples;
      const outBytes = s > 0 ? outPx * 12 * s + outPx * 8 : outPx * 12;
      return {
        ready,
        set: setName,
        tier,
        css: [css.w, css.h],
        dpr: css.dpr,
        textureBytes: room ? room.textureBytes() : 0,
        geometryBytes: room ? room.geometryBytes() : 0,
        targetBytes: outBytes + refl.bytes(),
        targets: { outside: [outRT.width, outRT.height, s], floor: refl.floorOn ? [refl.floorRT.width, refl.floorRT.height] : null, sea: refl.seaOn ? [refl.seaRT.width, refl.seaRT.height] : null },
        triangles: room ? room.counts.triangles : 0,
        primitives: room ? room.counts.primitives : 0,
        meshes: room ? room.counts.meshes : 0,
        missing: room ? room.missing.slice() : [],
        unclassified: room ? room.unclassified.slice() : [],
        last: { ...last },
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ready = false;
      rig.end();
      if (instrument && instrument.object3D && instrument.object3D.parent === scene) scene.remove(instrument.object3D);
      if (contact) contact.dispose();
      contact = null;
      if (room) room.dispose();
      room = null;
      outRT.dispose();
      refl.dispose();
      dust.dispose();
      sky.dispose();
    },
  };
}
