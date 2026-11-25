// The heavy half of the engine, loaded by scene.load() (engine/index.js). It owns the
// renderer, the quality tier, the shared instrument and sky, the four acts, the timeline
// and the frame loop. ARCHITECTURE.md's flow, once per drawn frame:
//
//   scroll p (the facade's state) -> u on a critically damped spring (core/director.js SPRING)
//   timeline.evaluateInto(frame, u, viewport, aspect)          FrameState (pure)
//   acts[i].render(frame, camera_i, slot_i, time)              one or two HDR targets
//   post.compose({ a, b, mix: transition.t, kind })            at most one pass
//   post.finish({ ...the acts' finish wishes, quiet zones })   the only pass on the canvas
//   then: 'stones:screen' (at most once a frame), hover under the pointer, 'beat',
//         sound cues (a tick per pinion tooth in the gears, the lamp at the reveal)
//
// Frames are drawn on demand: every animation frame while something moves or the visitor
// has just scrolled or pointed, about 30 a second for the idle motion (dust, twinkle,
// drift) when nothing else happens, and only on change under reduced motion and in still
// mode. The loop stops while the tab is hidden, while paused and while the context is lost.
//
// Ownership: the stage sizes the canvas's drawing buffer (the tier caps its pixel ratio
// and pixel budget), calls resize() on post and every act, and sets every module's tier.
// The shared instrument is built once (acts/shared/lease.js ensureBuilt); acts borrow it
// per draw. Each act gets its own clone of the shared sky. three's import lands in the
// _home/three.[hash].js chunk (nuxt.config.js).

import * as THREE from 'three';
import { createPost, FINISH_DEFAULTS } from './post/index.js';
import { createSky } from './sky/index.js';
import { createInstrument } from './instrument/index.js';
import { ensureBuilt } from './acts/shared/lease.js';
import { pickFrom } from './acts/shared/stones.js';
import { createPlateAct } from './acts/plate.js';
import { createGearsAct } from './acts/gears.js';
import { createRoomAct } from './acts/room.js';
import { createSpaceAct, CODA_QUIET } from './acts/space.js';
import { createTimeline, createFrameState, layoutFor } from './timeline/evaluate.js';
import { BEATS, CHOREOGRAPHY } from './choreo/choreography.mjs';
import { rngFor } from './core/rng.js';
import { createTweener, springAtRest, springStep, smooth01 } from './core/motion.js';
import { QUIET_STRENGTH, SPRING, TRANSITION_PARAMS, actSpans, actsByDistance, mixFinish, ndcToCss, quietAt, stonesChanged, targetU, toothIndex } from './core/director.js';
import { clampTier, effectiveDpr, tierForQuality, tierSettings } from './quality/tiers.js';
import { detectQuality } from './quality/detect.js';
import { createGovernor } from './quality/governor.js';

/** The three.js revision this stage runs on (stats().three). */
export const REVISION = THREE.REVISION;

/** Seed for everything seeded in the scene (instrument, sky, dust). */
const SEED = 7;
const NIGHT = '#100f15';
/** Act ids, in story order, and their modules. */
const FACTORIES = Object.freeze({ plate: createPlateAct, gears: createGearsAct, room: createRoomAct, space: createSpaceAct });
const ACT_IDS = Object.freeze(Object.keys(FACTORIES));
const SPANS = actSpans();
/** Where a warm-up render of each act looks (programs compile and textures upload off screen). */
const WARM_U = Object.freeze({ plate: 3.3, gears: 6.5, room: 11.6, space: 18.4 });

/** After the last input (scroll, pointer, focus), every animation frame is drawn for this long. */
const ACTIVE_MS = 2500;
/** Idle motion frame interval (about 30 a second). */
const IDLE_FRAME_MS = 1000 / 30;
/** Acts this close (section units) to u are loaded ahead of time. */
const PRELOAD_NEAR = 1.6;
/** In the story, everything else starts loading this long after the first frame. */
const PRELOAD_REST_MS = 1200;
/** A failed act load is retried no sooner than this. */
const RETRY_MS = 8000;
/** The second act target is freed after this long without a transition. */
const SLOT_IDLE_MS = 6000;
/** Frame times are not fed to the quality governor while acts load, nor this long after. */
const LOAD_SETTLE_MS = 1500;
/** The stones answer hover and clicks only while their labels are up (params.stones). */
const STONES_MIN = 0.05;
/** Pointer parallax follows the pointer with this time constant (s). */
const POINTER_TAU = 0.35;
/** release(id): the push toward the stone (s), when the app may navigate, the hold and the return. */
const RELEASE = Object.freeze({ push: 0.7, resolve: 0.72, hold: 1.6, back: 0.6, posK: 0.3, tgtK: 0.7 });
/** The lamp's sound plays as `lights` rises through this. */
const LIGHTS_CUE = 0.04;

/**
 * @typedef {{
 *   progress: number, mode: 'story' | 'contact', quality: string, reducedMotion: boolean, still: boolean,
 *   pointer: { x: number, y: number }, pointerSeen: boolean, focused: string | null, paused: boolean, sound: boolean,
 * }} SceneState the facade's live state (engine/index.js); the stage reads it every frame
 * @typedef {{ tier?: number | null, act?: string | null }} StageDebug harness switches
 * @typedef {{ act: any, id: string, ready: boolean, loading: Promise<void> | null, progress: number, failedAt: number, warmed: boolean, error: boolean }} ActEntry
 */

/**
 * Builds the stage and draws the first frame (with every act that frame needs loaded).
 * @param {{
 *   canvas: HTMLCanvasElement, assetsBase: string, state: SceneState,
 *   emit: (event: string, detail?: any) => void, audio: import('./audio/player.js').SceneAudio,
 *   stones?: { id: string, href?: string }[], debug?: StageDebug | null, onProgress?: (f: number) => void,
 *   renderer?: any,
 * }} options  `renderer` is a test seam (a stand-in for WebGLRenderer in node); the page never passes it
 */
export async function createStage({ canvas, assetsBase, state, emit, audio, stones = [], debug = null, onProgress, renderer: given = null }) {
  const win = /** @type {any} */ ((canvas.ownerDocument && canvas.ownerDocument.defaultView) || globalThis);
  const doc = /** @type {any} */ (canvas.ownerDocument || globalThis.document || null);
  const reduced = !!state.reducedMotion;
  const still = !!state.still;
  const live = !reduced && !still;
  const dbg = debug || {};
  if (dbg.act != null && !ACT_IDS.includes(dbg.act)) throw new TypeError(`createStage: unknown act "${dbg.act}"`);
  const hrefOf = new Map(stones.map((s) => [s.id, s.href]));
  const now = () => (win.performance && typeof win.performance.now === 'function' ? win.performance.now() : Date.now());
  /** @param {number} f */
  const report = (f) => {
    try {
      onProgress?.(Math.min(1, Math.max(0, f)));
    } catch (err) {
      void err; // a listener's error is not the load's
    }
  };

  // ------------------------------------------------------------- renderer ---
  // The canvas only ever receives post's full-screen finish pass: no MSAA, depth or stencil
  // of its own (the act targets carry those), no tone mapping, sRGB output (post encodes).
  const renderer = given || new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: true,
    powerPreference: 'high-performance', preserveDrawingBuffer: still,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.info.autoReset = false; // post makes up to 11 render calls; reset once per frame
  renderer.setClearColor(new THREE.Color(NIGHT), 1);

  // -------------------------------------------------------------- quality ---
  const forced = Number.isFinite(dbg.tier) ? clampTier(dbg.tier) : tierForQuality(state.quality);
  const guess = detectQuality({ window: win, renderer });
  let tier = /** @type {import('./quality/tiers.js').TierId} */ (forced ?? guess.tier);
  const governor = forced === null && !still ? createGovernor({ tier, minTier: guess.minTier, maxTier: Math.max(tier, guess.maxTier) }) : null;

  const css = { w: 1, h: 1, dpr: 1 };
  let sizeDirty = true;
  /** window.devicePixelRatio at the last applySize (a move to another screen changes it without a resize event) */
  let deviceDpr = 0;
  function measure() {
    const w = Math.max(1, Math.round(canvas.clientWidth || win.innerWidth || 1));
    const h = Math.max(1, Math.round(canvas.clientHeight || win.innerHeight || 1));
    return [w, h];
  }

  // ------------------------------------------------- shared parts and acts ---
  const post = createPost(renderer, { tier, background: NIGHT });
  const tweener = createTweener();
  const sky = createSky({ seed: SEED, tier: tierSettings(tier).sky });
  const instrument = createInstrument({ THREE, rngFor, tier, gsap: live ? tweener : null, seed: SEED, reducedMotion: !live });
  const instrumentReady = ensureBuilt(instrument);
  const timeline = createTimeline(CHOREOGRAPHY);
  const F = /** @type {any} */ (createFrameState());
  const W = /** @type {any} */ (createFrameState()); // the warm-up frame
  const isolated = { id: dbg.act || '', weight: 1 };
  const pointerNdc = { x: 0, y: 0, active: false };

  /** @type {Map<string, ActEntry>} */
  const acts = new Map();
  /** @param {string} id @returns {ActEntry} */
  function entry(id) {
    let e = acts.get(id);
    if (e) return e;
    const make = /** @type {any} */ (FACTORIES)[id];
    if (!make) throw new TypeError(`stage: no act "${id}"`);
    const act = make({ THREE, renderer, assetsBase, rngFor, instrument, sky, tier, reducedMotion: !live, instrumentReady, seed: SEED });
    act.setTier(tier);
    act.resize(css.w, css.h, css.dpr);
    e = { act, id, ready: false, loading: null, progress: 0, failedAt: -Infinity, warmed: false, error: false };
    acts.set(id, e);
    return e;
  }

  let loadSettleUntil = 0;
  /** @param {string} id @returns {Promise<void>} */
  function loadAct(id) {
    const e = entry(id);
    if (e.ready || disposed) return Promise.resolve();
    if (e.loading) return e.loading;
    if (now() - e.failedAt < RETRY_MS) return Promise.resolve();
    e.loading = Promise.resolve()
      .then(() => e.act.load((/** @type {number} */ f) => { e.progress = Number.isFinite(f) ? f : e.progress; }))
      .then(
        () => {
          e.loading = null;
          if (disposed) return;
          e.ready = !!e.act.ready;
          e.progress = 1;
          loadSettleUntil = now() + LOAD_SETTLE_MS;
          invalidate();
          queueWarm();
        },
        (err) => {
          e.loading = null;
          e.failedAt = now();
          if (!disposed) console.error(`[home] the ${id} act did not load`, err);
          invalidate();
        },
      );
    return e.loading;
  }
  const loadsBusy = () => [...acts.values()].some((e) => e.loading) || now() < loadSettleUntil;

  // two act targets: the one on screen, and the second act of a transition
  /** @type {(THREE.WebGLRenderTarget | null)[]} */
  const slots = [null, null];
  let lastPairAt = -Infinity;
  /** @param {number} i */
  function slot(i) {
    if (!slots[i]) slots[i] = post.acquireTarget(`act:${i}`, { msaa: true });
    return /** @type {THREE.WebGLRenderTarget} */ (slots[i]);
  }

  function applySize() {
    const [w, h] = measure();
    deviceDpr = win.devicePixelRatio || 1;
    const dpr = effectiveDpr(tier, w, h, deviceDpr);
    css.w = w;
    css.h = h;
    css.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    post.resize(w, h, dpr);
    for (const e of acts.values()) e.act.resize(w, h, dpr);
    sizeDirty = false;
  }

  /** @param {number} next @param {string} reason */
  function setTier(next, reason) {
    const t = clampTier(next);
    if (t === tier) return;
    tier = t;
    post.setTier(t);
    instrument.setTier(t);
    sky.setTier(tierSettings(t).sky);
    for (const e of acts.values()) e.act.setTier(t);
    sizeDirty = true;
    invalidate();
    emit('tier', { tier: tierSettings(t).name, reason });
  }

  // ---------------------------------------------------------------- state ---
  let disposed = false;
  let lost = false;
  let raf = 0;
  let dirty = true;
  let lastInputAt = -Infinity;
  let lastDraw = 0;
  let lastFull = false;
  let clock = 0;
  let frames = 0;
  let fps = 0;
  let drawCalls = 0;
  let triangles = 0;
  let lastFrameReady = false;
  const spring = { x: 0, v: 0 };
  let primed = false;
  /** @type {string | null} */
  let hot = null;
  /** @type {any[] | null} the stones as last drawn (for pick and hover) */
  let shownStones = null;
  /** @type {any[] | null} what the page was last told */
  let emittedStones = null;
  let lastBeat = -2;
  /** @type {number | null} */
  let lastTooth = null;
  let lastLights = 0;
  let lastU = 0;
  let spaceWasOn = false;
  /** @type {{ id: string, t: number, k: number, done: boolean, resolve: () => void, timer: any, stone: number[] | null } | null} */
  let rel = null;
  const stoneAt = new THREE.Vector3();
  /** @type {Set<any>} */
  const timers = new Set();
  const renderErrors = new Set();

  const paused = () => !!state.paused || !!(doc && doc.hidden);
  const hovered = () => state.focused || (rel ? rel.id : null) || hot;

  /** @param {() => void} fn @param {number} ms */
  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function schedule() {
    if (raf || disposed || lost || paused() || typeof win.requestAnimationFrame !== 'function') return;
    raf = win.requestAnimationFrame(tick);
  }
  function cancel() {
    if (raf && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(raf);
    raf = 0;
  }
  /** Something changed: draw a frame soon. @param {boolean} [input] it came from the visitor */
  function invalidate(input = false) {
    dirty = true;
    if (input) lastInputAt = now();
    schedule();
  }

  /** Is anything still in motion (needs the next animation frame)? */
  function moving() {
    if (!primed) return true;
    const target = targetU(state.mode, state.progress);
    if (!springAtRest(spring, target, SPRING.rest)) return true;
    if (tweener.active || rel) return true;
    if (pointerNdc.active && state.pointerSeen) {
      const [tx, ty] = pointerTarget();
      if (Math.abs(tx - pointerNdc.x) > 1e-3 || Math.abs(ty - pointerNdc.y) > 1e-3) return true;
    }
    return false;
  }

  /** @param {number} t rAF time */
  function tick(t) {
    raf = 0;
    if (disposed || lost || paused()) return;
    const active = live && (moving() || t - lastInputAt < ACTIVE_MS);
    let draw = dirty || moving();
    if (live && !draw) draw = t - lastDraw >= IDLE_FRAME_MS - 1;
    if (draw) drawFrame(t, active);
    if (live || dirty || moving()) schedule();
  }

  // ------------------------------------------------------------ per frame ---
  function pointerTarget() {
    return [(state.pointer.x / css.w) * 2 - 1, 1 - (state.pointer.y / css.h) * 2];
  }

  /** @param {number} dt */
  function stepU(dt) {
    const target = targetU(state.mode, state.progress);
    if (!primed || !live || Math.abs(target - spring.x) > SPRING.snap) {
      spring.x = target;
      spring.v = 0;
      primed = true;
      return;
    }
    springStep(spring, target, dt, SPRING.omega);
    if (springAtRest(spring, target, SPRING.rest)) {
      spring.x = target;
      spring.v = 0;
    }
  }

  /** @param {number} dt */
  function stepPointer(dt) {
    if (!live || !state.pointerSeen) {
      pointerNdc.active = false;
      return;
    }
    const [tx, ty] = pointerTarget();
    const k = pointerNdc.active ? 1 - Math.exp(-dt / POINTER_TAU) : 1;
    pointerNdc.x += (tx - pointerNdc.x) * k;
    pointerNdc.y += (ty - pointerNdc.y) * k;
    pointerNdc.active = true;
  }

  /** @param {number} dt */
  function stepRelease(dt) {
    if (!rel) return;
    rel.t += dt;
    const { push, resolve, hold, back } = RELEASE;
    rel.k = rel.t < push ? smooth01(rel.t / push) : rel.t < push + hold ? 1 : 1 - smooth01((rel.t - push - hold) / back);
    if (!rel.done && rel.t >= resolve) settleRelease();
    if (rel.t >= push + hold + back) rel = null;
  }
  function settleRelease() {
    if (!rel || rel.done) return;
    rel.done = true;
    clearTimeout(rel.timer);
    timers.delete(rel.timer);
    rel.resolve();
  }

  /** The release push: the space camera leans toward the chosen stone. @param {any} cam */
  function pushCamera(cam) {
    if (!rel || !rel.stone || !(rel.k > 0)) return;
    const p = rel.stone;
    const a = RELEASE.posK * rel.k;
    const b = RELEASE.tgtK * rel.k;
    for (let i = 0; i < 3; i++) {
      cam.position[i] += (p[i] - cam.position[i]) * a;
      cam.target[i] += (p[i] - cam.target[i]) * b;
    }
  }

  /** Index of an act in the current frame, or -1. @param {string} id */
  const actIndex = (id) => {
    for (let i = 0; i < F.acts.length; i++) if (F.acts[i].id === id) return i;
    return -1;
  };
  /** The camera of the act at index i. @param {number} i */
  const cameraOf = (i) => (i === 0 ? F.camera : F.cameraB);

  /** @param {any} act */
  function finishOf(act) {
    if (!act) return null;
    if (typeof act.finishHints === 'function') return act.finishHints();
    return act.finish || null;
  }

  const quiet = { rects: [[0, 0, 0, 0]], strength: QUIET_STRENGTH };

  function evaluate() {
    const vp = layoutFor(css.w, css.h);
    const aspect = css.w / css.h;
    timeline.evaluateInto(F, spring.x, vp, aspect);
    if (dbg.act) {
      F.acts[0] = isolated;
      F.acts.length = 1;
      F.transition = null;
      F.cameraB = null;
      timeline.cameraInto(F.camera, dbg.act, F.u, vp, aspect);
    }
    F.pointer = pointerNdc;
    F.hover = hovered();
    const si = actIndex('space');
    if (si >= 0) pushCamera(cameraOf(si));
  }

  /** @param {number} time seconds */
  function renderActs(time) {
    const n = F.acts.length;
    let ready = true;
    // only the space act sets the instrument's hover (from frame.hover); once it is off
    // screen (a jump out of the stones, the sections nav) nothing else would clear it, and
    // the other acts would draw a swung arm with a green hoop
    const spaceOn = actIndex('space') >= 0;
    if (!spaceOn && spaceWasOn && instrument.ready && instrument.state().hover !== null) instrument.setHover(null, { immediate: true });
    spaceWasOn = spaceOn;
    for (let i = 0; i < n; i++) {
      const id = F.acts[i].id;
      const e = entry(id);
      if (!e.ready) {
        ready = false;
        loadAct(id);
      }
      if (id === 'room' && typeof e.act.setQuietZone === 'function') {
        const q = quietAt(F.u, F.beat, F.viewport, null);
        e.act.setQuietZone(q ? q.ndc : null, q ? q.k : 0);
      }
      try {
        e.act.render(F, cameraOf(i), slot(i), time);
      } catch (err) {
        if (!renderErrors.has(id)) {
          renderErrors.add(id);
          console.error(`[home] the ${id} act failed to draw`, err);
        }
      }
    }
    return ready;
  }

  /** The dissolve's params this frame: its iris centres on the instrument where the space act draws it. */
  const dissolve = { ...TRANSITION_PARAMS.dissolve, focus: [0, 0], focusR: 0 };
  /** @param {string} kind */
  function transitionParams(kind) {
    if (kind !== 'dissolve') return /** @type {any} */ (TRANSITION_PARAMS)[kind];
    const si = actIndex('space');
    const space = si >= 0 ? acts.get('space') : null;
    const at = space && space.ready && typeof space.act.focus === 'function' ? space.act.focus(F, cameraOf(si)) : null;
    if (at) {
      dissolve.focus[0] = at.x;
      dissolve.focus[1] = at.y;
      dissolve.focusR = at.r;
    }
    return dissolve;
  }

  function composeAndFinish(t) {
    const pair = F.acts.length > 1 && F.transition;
    if (pair) {
      const kind = F.transition.kind;
      post.compose({ a: slot(0), b: slot(1), mix: F.transition.t, kind, transitionParams: transitionParams(kind) });
      lastPairAt = t;
    } else post.compose({ a: slot(0) });
    const a = finishOf(entry(F.acts[0].id).act);
    const b = pair ? finishOf(entry(F.acts[1].id).act) : null;
    const fin = mixFinish(a, b, pair ? F.transition.t : 0, FINISH_DEFAULTS);
    const q = quietAt(F.u, F.beat, F.viewport, CODA_QUIET);
    if (q) {
      quiet.rects[0] = ndcToCss(q.ndc, css.w, css.h);
      quiet.strength = QUIET_STRENGTH * q.k;
    }
    post.finish({
      glow: fin.glow, rolloff: fin.rolloff, veil: /** @type {any} */ (fin.veil), vignette: fin.vignette, grain: fin.grain,
      quietZones: q ? quiet : null, time: still ? 0 : clock,
    });
    // the second target goes back after a while without a transition
    if (!pair && slots[1] && t - lastPairAt > SLOT_IDLE_MS) {
      post.releaseTarget('act:1');
      slots[1] = null;
    }
  }

  /** Stones on screen, hover under the pointer, beats, sound cues. */
  function afterFrame() {
    const si = actIndex('space');
    const space = si >= 0 ? acts.get('space') : null;
    if (space && space.ready) {
      const list = space.act.stonesScreen(F, cameraOf(si));
      const show = (F.params.stones ?? 1) > STONES_MIN;
      shownStones = list.map((/** @type {any} */ s) => ({ id: s.id, x: s.x, y: s.y, r: s.r, radius: s.radius ?? s.r, hit: s.hit, depth: s.depth, visible: !!s.visible && show }));
      if (stonesChanged(emittedStones, shownStones)) {
        emittedStones = shownStones;
        emit('stones:screen', shownStones.map((s) => ({ ...s })));
      }
      if (rel) {
        try {
          instrument.stoneWorldPosition(rel.id, stoneAt);
          rel.stone = [stoneAt.x, stoneAt.y, stoneAt.z];
        } catch (err) {
          void err;
        }
      }
    } else {
      shownStones = null;
      if (emittedStones && emittedStones.length) {
        emittedStones = [];
        emit('stones:screen', []);
      }
    }
    updateHot();
    if (F.beat !== lastBeat) {
      lastBeat = F.beat;
      if (F.beat >= 0 && BEATS[F.beat]) emit('beat', { index: F.beat, id: BEATS[F.beat].id, tone: 'dark' });
    }
    // sound cues (no-ops while sound is off)
    const tooth = toothIndex(F.params.crank);
    const gi = actIndex('gears');
    if (gi >= 0 && F.acts[gi].weight >= 0.5 && lastTooth !== null && tooth !== lastTooth) audio.tick();
    lastTooth = tooth;
    const lights = F.params.lights ?? 0;
    if (lights >= LIGHTS_CUE && lastLights < LIGHTS_CUE && F.u > lastU) audio.lights();
    lastLights = lights;
    lastU = F.u;
  }

  function updateHot() {
    if (!state.pointerSeen) return;
    const id = shownStones ? pickFrom(shownStones, state.pointer.x, state.pointer.y) : null;
    if (id === hot) return;
    const was = hot;
    hot = id;
    if (was) emit('stone:leave', { id: was });
    if (id) emit('stone:enter', { id });
    invalidate();
  }

  /** @param {number} t rAF time @param {boolean} full drawn at the display's full rate */
  function drawFrame(t, full) {
    const dt = lastDraw ? Math.min(0.1, Math.max(0, (t - lastDraw) / 1000)) : 1 / 60;
    if (governor && full && lastFull && lastDraw && !loadsBusy()) {
      const d = governor.push(t - lastDraw);
      if (d) setTier(d.to, d.reason);
    }
    if (lastDraw && t > lastDraw) fps = fps ? fps * 0.9 + (100 / (t - lastDraw)) : 1000 / (t - lastDraw);
    lastFull = full;
    lastDraw = t;
    if (!still) clock += dt;
    dirty = false;
    renderer.info.reset();
    if (sizeDirty || (win.devicePixelRatio || 1) !== deviceDpr) applySize();
    stepU(dt);
    tweener.update(dt);
    stepRelease(dt);
    stepPointer(dt);
    evaluate();
    lastFrameReady = renderActs(still ? 0 : clock);
    composeAndFinish(t);
    drawCalls = renderer.info.render.calls;
    triangles = renderer.info.render.triangles;
    frames++;
    afterFrame();
    preloadNear();
  }

  // -------------------------------------------------------------- loading ---
  function preloadNear() {
    for (const { id, dist } of actsByDistance(spring.x)) {
      if (dist > PRELOAD_NEAR) break;
      const e = entry(id);
      if (!e.ready && !e.loading) loadAct(id);
    }
  }
  let restQueued = false;
  function preloadRest() {
    if (restQueued || state.mode !== 'story') return;
    restQueued = true;
    later(async () => {
      for (const { id } of actsByDistance(spring.x)) {
        if (disposed) return;
        await loadAct(id);
      }
    }, PRELOAD_REST_MS);
  }

  /** Warm-up: draw each loaded act once off screen, so its programs compile before it is seen. */
  let warmTarget = /** @type {THREE.WebGLRenderTarget | null} */ (null);
  let warmQueued = false;
  function queueWarm() {
    if (still || warmQueued || disposed) return;
    warmQueued = true;
    const run = () => {
      warmQueued = false;
      if (disposed || lost) return;
      const e = [...acts.values()].find((x) => x.ready && !x.warmed && actIndex(x.id) < 0);
      if (!e) return;
      warm(e);
      queueWarm();
    };
    if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(run, { timeout: 2500 });
    else later(run, 250);
  }
  /** @param {ActEntry} e */
  function warm(e) {
    e.warmed = true;
    const vp = layoutFor(css.w, css.h);
    const aspect = css.w / css.h;
    const u = /** @type {any} */ (WARM_U)[e.id] ?? (SPANS[e.id][0] + SPANS[e.id][1]) / 2;
    timeline.evaluateInto(W, u, vp, aspect);
    W.acts[0] = { id: e.id, weight: 1 };
    W.acts.length = 1;
    W.transition = null;
    W.cameraB = null;
    timeline.cameraInto(W.camera, e.id, u, vp, aspect);
    W.pointer = { x: 0, y: 0, active: false };
    W.hover = hovered();
    warmTarget ||= new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, generateMipmaps: false });
    try {
      e.act.render(W, W.camera, warmTarget, 0);
    } catch (err) {
      void err; // it draws (and reports) when it is on screen
    }
  }

  // --------------------------------------------------------------- events ---
  const onLost = (/** @type {Event} */ event) => {
    event.preventDefault(); // allows the browser to restore the context
    lost = true;
    cancel();
    emit('contextlost', {});
  };
  const onRestored = () => {
    lost = false;
    renderErrors.clear();
    sizeDirty = true;
    invalidate();
  };
  const onClick = (/** @type {MouseEvent} */ event) => {
    const r = canvas.getBoundingClientRect();
    const id = pick(event.clientX - r.left, event.clientY - r.top);
    if (id) emit('stone:click', { id, href: hrefOf.get(id) });
  };
  const onResize = () => {
    sizeDirty = true;
    invalidate();
  };
  const onVisibility = () => {
    if (paused()) cancel();
    else invalidate();
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);
  canvas.addEventListener('click', onClick);
  win.addEventListener?.('resize', onResize);
  doc?.addEventListener?.('visibilitychange', onVisibility);
  /** @type {ResizeObserver | null} */
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(onResize) : null;
  observer?.observe(canvas);

  /** @param {number} x CSS px @param {number} y CSS px */
  function pick(x, y) {
    if (!shownStones || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return pickFrom(shownStones, x, y);
  }

  // ---------------------------------------------------------- first frame ---
  try {
    report(0.02);
    applySize();
    const building = instrumentReady.then(() => report(0.3));
    await building;
    if (disposed) return /** @type {any} */ (null);
    // the acts the first frame needs, at the story time it opens on
    const u0 = targetU(state.mode, state.progress);
    const vp0 = layoutFor(css.w, css.h);
    const first = dbg.act ? [dbg.act] : timeline.evaluate(u0, vp0, css.w / css.h).acts.map((/** @type {any} */ a) => a.id);
    const loads = first.map((id) => loadAct(id));
    const poll = setInterval(() => {
      const p = first.reduce((s, id) => s + (acts.get(id)?.progress ?? 0), 0) / first.length;
      report(0.3 + 0.65 * p);
    }, 100);
    try {
      await Promise.all(loads);
    } finally {
      clearInterval(poll);
    }
    if (disposed) return /** @type {any} */ (null);
    drawFrame(now(), false);
    report(1);
    schedule();
    preloadRest();
    queueWarm();
  } catch (err) {
    dispose();
    throw err;
  }

  // ------------------------------------------------------------------ api ---
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancel();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    if (rel && !rel.done) rel.resolve();
    rel = null;
    observer?.disconnect();
    canvas.removeEventListener('webglcontextlost', onLost, false);
    canvas.removeEventListener('webglcontextrestored', onRestored, false);
    canvas.removeEventListener('click', onClick);
    win.removeEventListener?.('resize', onResize);
    doc?.removeEventListener?.('visibilitychange', onVisibility);
    for (const e of acts.values()) {
      try {
        e.act.dispose();
      } catch (err) {
        void err;
      }
    }
    acts.clear();
    instrument.dispose();
    sky.dispose();
    warmTarget?.dispose();
    post.dispose();
    renderer.dispose();
  }

  return {
    revision: REVISION,
    get tierName() {
      return tierSettings(tier).name;
    },
    get frames() {
      return frames;
    },
    /** Something the frame depends on changed. @param {boolean} [input] */
    invalidate,
    modeChanged() {
      if (state.mode === 'story') preloadRest();
      invalidate(true);
    },
    pointerMoved() {
      updateHot();
      if (live) invalidate(true);
    },
    pauseChanged() {
      if (paused()) cancel();
      else invalidate();
    },
    pick,
    /**
     * The stone's open beat: the camera leans toward it and its arm swings forward; resolves
     * when the page may navigate (at once without motion or when the stones are not shown).
     * @param {string} id
     * @returns {Promise<void>}
     */
    release(id) {
      if (rel && !rel.done) settleRelease();
      if (!live || disposed || !shownStones || !shownStones.some((s) => s.id === id && s.visible)) return Promise.resolve();
      return new Promise((resolve) => {
        /** @type {any} */
        const r = { id, t: 0, k: 0, done: false, resolve, timer: null, stone: null };
        try {
          instrument.stoneWorldPosition(id, stoneAt);
          r.stone = [stoneAt.x, stoneAt.y, stoneAt.z];
        } catch (err) {
          void err;
        }
        // if frames stop (a hidden tab), the page may still go
        r.timer = later(() => {
          if (rel === r) settleRelease();
          else if (!r.done) {
            r.done = true;
            resolve();
          }
        }, RELEASE.resolve * 1000 + 500);
        rel = r;
        invalidate(true);
      });
    },
    stats() {
      return {
        frames, drawCalls, triangles, tier: tierSettings(tier).name,
        engine: {
          u: F.u, target: targetU(state.mode, state.progress), section: F.section, beat: F.beat, viewport: F.viewport,
          acts: F.acts.map((/** @type {any} */ a) => ({ id: a.id, weight: a.weight })),
          transition: F.transition ? { ...F.transition } : null,
          tierId: tier, dpr: css.dpr, css: [css.w, css.h], fps: Math.round(fps * 10) / 10,
          settled: frames > 0 && lastFrameReady && !dirty && !moving() && F.acts.every((/** @type {any} */ a) => acts.get(a.id)?.ready),
          ready: [...acts.values()].filter((e) => e.ready).map((e) => e.id),
          loading: [...acts.values()].filter((e) => e.loading).map((e) => e.id),
          hover: hovered(),
          governor: governor ? { ceiling: governor.ceiling, frozen: governor.frozen } : null,
          post: post.stats().lastFrame,
        },
      };
    },
    /** Live handles for the console and the harness (not part of the facade contract). */
    get debug() {
      return { THREE, renderer, post, timeline, frame: F, instrument, sky, acts: Object.fromEntries([...acts].map(([id, e]) => [id, e.act])), setTier: (/** @type {number} */ t) => setTier(t, 'debug') };
    },
    dispose,
  };
}
