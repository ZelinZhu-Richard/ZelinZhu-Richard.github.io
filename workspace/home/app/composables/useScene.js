// The app's one line to the engine. SceneCanvas.client.vue creates the scene (the only
// place engine/index.js is imported, lazily) and reports into this module; pages and
// components read state from here and call the scene only through these wrappers, so
// everything keeps working while there is no scene (no WebGL, data saver, the stub, a
// failed load). Nothing here touches the DOM, and the server never changes this state.
import { reactive, shallowRef } from 'vue';

/**
 * @typedef {import('../../engine/index.js').HomeScene} HomeScene
 * @typedef {'pending' | 'on' | 'off' | 'lost'} WebglState
 */

/** Reactive scene status. `webgl` mirrors html[data-home-webgl] once SceneCanvas decides. */
export const sceneState = reactive({
  /** @type {WebglState} */
  webgl: 'pending',
  /** The engine chunk is loading (drives the preloader). */
  loading: false,
  /** scene.load() progress, 0..1. */
  loadProgress: 0,
  loaded: false,
  failed: false,
  /** The scene has drawn at least one frame (stats().frames > 0): the still sky can go. */
  drawn: false,
  /** prefers-reduced-motion or ?nomotion=1. */
  reducedMotion: false,
});

/** The live scene, or null. */
export const sceneRef = /** @type {import('vue').ShallowRef<HomeScene | null>} */ (shallowRef(null));
/** The last 'stones:screen' payload, or null while the engine has not sent one. */
export const stonesScreen = /** @type {import('vue').ShallowRef<unknown>} */ (shallowRef(null));
/** The stone under the pointer on the canvas ('stone:enter' / 'stone:leave'), or null. */
export const sceneHot = /** @type {import('vue').ShallowRef<string | null>} */ (shallowRef(null));

let storyProgress = 0;
/** @type {Set<(detail: { id: string, href?: string }) => void>} */
const stoneClicks = new Set();
/** @type {(value: WebglState) => void} */
let resolveDecided = () => {};
/** @type {Promise<WebglState>} */
const decided = new Promise(resolve => { resolveDecided = resolve; });

/** @param {() => void} fn */
function safe(fn) {
  try {
    fn();
  } catch (error) {
    console.error('Home scene call failed', error);
  }
}

/** @param {WebglState} value */
export function setWebglState(value) {
  sceneState.webgl = value;
  if (value !== 'pending') resolveDecided(value);
}

/**
 * Resolves once SceneCanvas has decided whether WebGL runs (or after `timeout` ms).
 * @param {number} [timeout]
 * @returns {Promise<WebglState>}
 */
export function whenWebglDecided(timeout = 1500) {
  return Promise.race([decided, new Promise(resolve => setTimeout(() => resolve(sceneState.webgl), timeout))]);
}

/**
 * Called by SceneCanvas when the scene is created (after its listeners are on) or gone.
 * @param {HomeScene | null} scene
 */
export function attachScene(scene) {
  sceneRef.value = scene;
  if (scene) safe(() => scene.setProgress(storyProgress));
  else {
    stonesScreen.value = null;
    sceneHot.value = null;
  }
}

/**
 * Story scroll progress, 0..1 (from the story page's ScrollTrigger). Remembered, so a
 * scene that arrives later starts at the right place.
 * @param {number} p
 */
export function setStoryProgress(p) {
  storyProgress = p;
  const scene = sceneRef.value;
  if (scene) safe(() => scene.setProgress(p));
}

/** @param {string | null} id */
export function focusStone(id) {
  const scene = sceneRef.value;
  if (scene) safe(() => scene.focusStone(id || null));
}

/**
 * The stone's "open" beat; resolves when the app may navigate. Never rejects.
 * @param {string} id
 * @returns {Promise<void>}
 */
export function releaseStone(id) {
  const scene = sceneRef.value;
  if (!scene) return Promise.resolve();
  try {
    return Promise.resolve(scene.release(id)).then(() => {}, error => console.error('Home scene release failed', error));
  } catch (error) {
    console.error('Home scene release failed', error);
    return Promise.resolve();
  }
}

/**
 * @param {number} x CSS px from the viewport's left
 * @param {number} y CSS px from the viewport's top
 * @returns {string | null}
 */
export function pickStone(x, y) {
  const scene = sceneRef.value;
  if (!scene) return null;
  try {
    const id = scene.pick(x, y);
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/**
 * Subscribes to 'stone:click' from the canvas. Returns an unsubscribe function.
 * @param {(detail: { id: string, href?: string }) => void} fn
 */
export function onSceneStoneClick(fn) {
  stoneClicks.add(fn);
  return () => { stoneClicks.delete(fn); };
}

/** @param {{ id: string, href?: string }} detail */
export function emitSceneStoneClick(detail) {
  for (const fn of [...stoneClicks]) fn(detail);
}
