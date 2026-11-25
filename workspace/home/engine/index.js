// The engine facade: the only engine module the app imports. CONTRACTS.md documents it.
// Importing this file stays cheap and needs no packages: it holds the scene's state, its
// events and its sound (WebAudio, engine/audio, nothing starts before a gesture), and
// load() fetches the heavy half (three.js, the acts, the frame loop) from ./stage.js.
// Calls made before load() are kept and take effect on the first frame.
import { HOME_ASSETS_BASE, SCENE_EVENTS, SCENE_MODES, SCENE_QUALITY } from '../contract.mjs';
import { createAudio } from './audio/player.js';

/**
 * @typedef {{ id: string, title: string, subtitle: string, href: string }} SceneStone
 * @typedef {'story' | 'contact'} SceneMode
 * @typedef {'auto' | 'high' | 'medium' | 'low'} SceneQuality
 * @typedef {'high' | 'medium' | 'low'} SceneTier
 * @typedef {{ tier?: number | null, act?: string | null }} SceneDebug
 *   Harness switches (sketches/engine/), not for the app: `tier` fixes the quality tier 0..3
 *   (3 is reachable only here), `act` draws one act alone at every u.
 * @typedef {{
 *   canvas: HTMLCanvasElement,
 *   mode?: SceneMode,
 *   stones?: SceneStone[],
 *   assetsBase?: string,
 *   quality?: SceneQuality,
 *   reducedMotion?: boolean,
 *   still?: boolean,
 *   debug?: SceneDebug | null,
 * }} SceneOptions
 * @typedef {{
 *   version: 1, mode: SceneMode, progress: number, tier: SceneTier, quality: SceneQuality,
 *   loaded: boolean, paused: boolean, disposed: boolean, sound: boolean, focused: string | null,
 *   stones: number, frames: number, drawCalls: number, triangles: number,
 *   reducedMotion: boolean, still: boolean, three: string | null,
 *   engine: Record<string, any> | null,
 * }} SceneStats  `engine` is a debugging readout (u, acts, fps, ...), null before load
 * @typedef {{
 *   load(onProgress?: (fraction: number) => void): Promise<void>,
 *   setProgress(p: number): void,
 *   setMode(mode: SceneMode): void,
 *   setPointer(x: number, y: number): void,
 *   pick(x: number, y: number): string | null,
 *   focusStone(id: string | null): void,
 *   release(id: string): Promise<void>,
 *   setSound(on: boolean): void,
 *   playHover(index?: number): void,
 *   pause(): void,
 *   resume(): void,
 *   stats(): SceneStats,
 *   dispose(): void,
 *   on(event: string, fn: (detail?: any) => void): () => void,
 * }} HomeScene
 */

const EVENTS = new Set(SCENE_EVENTS);
const GESTURES = ['pointerdown', 'keydown', 'touchend'];

/**
 * @param {SceneOptions} options
 * @returns {HomeScene}
 */
export function createHomeScene({ canvas, mode = 'story', stones = [], assetsBase = HOME_ASSETS_BASE, quality = 'auto', reducedMotion = false, still = false, debug = null } = /** @type {SceneOptions} */ ({})) {
  if (!canvas || typeof canvas !== 'object') throw new TypeError('createHomeScene: canvas is required');
  checkMode(mode);
  if (!SCENE_QUALITY.includes(quality)) throw new TypeError(`createHomeScene: unknown quality "${quality}"`);
  if (!Array.isArray(stones)) throw new TypeError('createHomeScene: stones must be an array');
  if (typeof assetsBase !== 'string' || !assetsBase.endsWith('/')) throw new TypeError('createHomeScene: assetsBase must end with "/"');
  if (debug !== null && typeof debug !== 'object') throw new TypeError('createHomeScene: debug must be an object');
  const stoneIds = new Set(stones.map(stone => stone.id));
  const stoneList = stones.map(stone => ({ id: stone.id, href: stone.href }));

  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  /** The live state; the stage reads it every frame. */
  const state = {
    mode, quality, reducedMotion: !!reducedMotion, still: !!still,
    tier: /** @type {SceneTier} */ (quality === 'auto' ? 'high' : quality),
    progress: 0, pointer: { x: 0, y: 0 }, pointerSeen: false, focused: /** @type {string | null} */ (null),
    sound: false, paused: false, loaded: false, disposed: false,
    three: /** @type {string | null} */ (null),
    /** @type {Promise<void> | null} */ loading: null,
  };
  /** @type {any} the heavy half, once loaded */
  let stage = null;
  const audio = createAudio({ enabled: false });
  let gesturesOn = false;

  /** @param {string} event @param {any} [detail] */
  function emit(event, detail) {
    for (const fn of [...(listeners.get(event) || [])]) {
      try {
        fn(detail);
      } catch (error) {
        console.error(`Home scene "${event}" listener failed`, error);
      }
    }
  }
  function alive() { return !state.disposed; }

  /** Audio may start only inside a user gesture; outside one, wait for the next. */
  function unlockAudio() {
    const activation = /** @type {any} */ (globalThis).navigator?.userActivation;
    if (!activation || activation.isActive) audio.unlock().catch(() => {});
  }
  const onGesture = () => {
    if (state.sound && alive()) audio.unlock().catch(() => {});
  };
  function listenForGestures() {
    const w = /** @type {any} */ (globalThis).window;
    if (gesturesOn || !w || typeof w.addEventListener !== 'function') return;
    gesturesOn = true;
    for (const name of GESTURES) w.addEventListener(name, onGesture, { capture: true, passive: true });
  }
  function stopGestures() {
    const w = /** @type {any} */ (globalThis).window;
    if (!gesturesOn || !w) return;
    gesturesOn = false;
    for (const name of GESTURES) w.removeEventListener(name, onGesture, { capture: true });
  }

  const scene = {
    load(onProgress) {
      if (!alive()) return Promise.reject(new Error('createHomeScene: scene is disposed'));
      state.loading ||= (async () => {
        let shown = 0;
        /** @param {number} f */
        const report = f => {
          if (!(f >= shown)) return;
          shown = f;
          try {
            onProgress?.(f);
          } catch (error) {
            void error; // a progress listener's error is not the load's
          }
        };
        report(0);
        const { createStage } = await import('./stage.js');
        if (!alive()) throw new Error('createHomeScene: scene is disposed');
        report(0.08);
        const made = await createStage({
          canvas, assetsBase, state, emit, audio, stones: stoneList, debug,
          onProgress: f => report(0.08 + 0.92 * f),
        });
        if (!alive()) {
          made?.dispose();
          throw new Error('createHomeScene: scene is disposed');
        }
        stage = made;
        state.three = stage.revision;
        state.tier = stage.tierName;
        state.loaded = true;
        report(1);
        emit('ready', { mode: state.mode, tier: state.tier });
      })();
      return state.loading;
    },
    setProgress(p) {
      if (!alive()) return;
      const next = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
      if (next === state.progress) return;
      state.progress = next;
      stage?.invalidate(true);
    },
    setMode(next) {
      if (!alive()) return;
      checkMode(next);
      if (next === state.mode) return;
      state.mode = next;
      stage?.modeChanged();
    },
    setPointer(x, y) {
      if (!alive()) return;
      state.pointer = { x: +x || 0, y: +y || 0 };
      state.pointerSeen = true;
      stage?.pointerMoved();
    },
    pick(x, y) {
      if (!alive() || !stage) return null;
      return stage.pick(+x, +y);
    },
    focusStone(id) {
      if (!alive()) return;
      if (id !== null && !stoneIds.has(id)) throw new TypeError(`focusStone: unknown stone "${id}"`);
      if (id === state.focused) return;
      state.focused = id;
      stage?.invalidate(true);
    },
    async release(id) {
      if (!stoneIds.has(id)) throw new TypeError(`release: unknown stone "${id}"`);
      if (!alive()) return;
      if (state.sound) audio.release();
      if (!stage || state.reducedMotion) return;
      await stage.release(id);
    },
    setSound(on) {
      if (!alive()) return;
      state.sound = !!on;
      audio.setEnabled(state.sound);
      if (state.sound) {
        listenForGestures();
        unlockAudio();
      }
    },
    playHover() {
      if (alive() && state.sound) audio.hover();
    },
    pause() {
      if (!alive() || state.paused) return;
      state.paused = true;
      stage?.pauseChanged();
      audio.suspend().catch(() => {});
    },
    resume() {
      if (!alive() || !state.paused) return;
      state.paused = false;
      stage?.pauseChanged();
      audio.resume().catch(() => {});
    },
    stats() {
      const s = stage ? stage.stats() : null;
      return {
        version: 1, mode: state.mode, progress: state.progress, tier: s ? s.tier : state.tier, quality: state.quality,
        loaded: state.loaded, paused: state.paused, disposed: state.disposed, sound: state.sound, focused: state.focused,
        stones: stoneIds.size, frames: s ? s.frames : 0, drawCalls: s ? s.drawCalls : 0, triangles: s ? s.triangles : 0,
        reducedMotion: state.reducedMotion, still: state.still, three: state.three,
        engine: s ? s.engine : null,
      };
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      stopGestures();
      try {
        stage?.dispose();
      } finally {
        stage = null;
        audio.dispose();
        listeners.clear();
      }
    },
    on(event, fn) {
      if (!EVENTS.has(event)) throw new TypeError(`on: unknown event "${event}"`);
      if (typeof fn !== 'function') throw new TypeError('on: listener must be a function');
      if (!alive()) return () => {};
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
  };
  // Live handles for the console and the harness (renderer, post, timeline, acts, tune);
  // not enumerable and not part of the contract.
  Object.defineProperty(scene, 'debug', { get: () => (stage ? stage.debug : null), enumerable: false });
  return scene;
}

/** @param {string} mode */
function checkMode(mode) {
  if (!SCENE_MODES.includes(mode)) throw new TypeError(`createHomeScene: unknown mode "${mode}"`);
}
