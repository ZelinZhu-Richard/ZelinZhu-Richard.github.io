<script setup>
// The one canvas behind both pages, and the only place the engine is created. It decides
// whether WebGL runs at all (?webgl=0, data saver, a WebGL2 probe on a throwaway canvas),
// loads the engine facade lazily only when it does, and wires the scene to the bridge
// (composables/useScene.js) and the window contract ($homeContract). The story page's
// ScrollTrigger supplies progress through the bridge; this component forwards route,
// pointer and visibility.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useNuxtApp, useRoute } from '#imports';
import content from '#build/site-content.mjs';
import { HOME_ASSETS_BASE, HOME_WEBGL, homeRouteOf } from '~~/contract.mjs';
import { parseFlags } from '~/utils/flags.js';
import { attachScene, emitSceneStoneClick, sceneHot, sceneState, setWebglState, stonesScreen } from '~/composables/useScene.js';

const canvas = ref(/** @type {HTMLCanvasElement | null} */ (null));
const route = useRoute();
const contract = useNuxtApp().$homeContract;
/** @type {import('../../engine/index.js').HomeScene | null} */
let scene = null;
/** @type {ResizeObserver | null} */
let observer = null;
let unmounted = false;
/** @type {(() => void)[]} */
let offs = [];

function fit() {
  const el = canvas.value;
  // Once the scene exists it sizes the drawing buffer itself (its quality tier caps the
  // pixel ratio); writing el.width here as well would clear the canvas on every resize.
  if (!el || scene) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(el.clientWidth * ratio));
  const height = Math.max(1, Math.round(el.clientHeight * ratio));
  if (el.width !== width) el.width = width;
  if (el.height !== height) el.height = height;
}

/** WebGL2 on a throwaway canvas, so the real one keeps no context until the engine asks. */
function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** Data saver (Save-Data / prefers-reduced-data): no 3D, no engine download. */
function saveData() {
  try {
    const connection = /** @type {any} */ (navigator).connection;
    return connection?.saveData === true || window.matchMedia('(prefers-reduced-data: reduce)').matches;
  } catch {
    return false;
  }
}

/** @param {'on' | 'off' | 'lost'} value */
function setWebgl(value) {
  contract.setWebgl(value);
  setWebglState(value);
}

function markLost() {
  if (sceneState.webgl === HOME_WEBGL.off) return;
  setWebgl(HOME_WEBGL.lost);
  stonesScreen.value = null;
  sceneHot.value = null;
  sceneState.drawn = false;
}

/** @param {unknown} error */
function fail(error) {
  console.error('Home scene failed to load', error);
  sceneState.failed = true;
  sceneState.loading = false;
  teardown();
  contract.setReady();
}

/** After 'ready', watch for the first real frame (the stub never draws one). */
function watchFirstFrame() {
  let tries = 0;
  const check = () => {
    if (unmounted || !scene) return;
    let frames = 0;
    try {
      frames = scene.stats().frames;
    } catch {
      return;
    }
    if (frames > 0 && sceneState.webgl === HOME_WEBGL.on) sceneState.drawn = true;
    else if (++tries < 180) requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

/** @param {PointerEvent} event */
const onPointer = event => scene?.setPointer(event.clientX, event.clientY);
const onVisibility = () => (document.hidden ? scene?.pause() : scene?.resume());
const onContextLost = () => markLost();
const onContextRestored = () => {
  if (scene) setWebgl(HOME_WEBGL.on);
};

function teardown() {
  for (const off of offs) off();
  offs = [];
  window.removeEventListener('pointermove', onPointer);
  document.removeEventListener('visibilitychange', onVisibility);
  canvas.value?.removeEventListener('webglcontextlost', onContextLost);
  canvas.value?.removeEventListener('webglcontextrestored', onContextRestored);
  contract.attachScene(null);
  attachScene(null);
  scene?.dispose();
  scene = null;
}

onMounted(async () => {
  // On a hydrated first load the client-only canvas can mount a tick after this hook runs.
  for (let tries = 0; !canvas.value && tries < 20; tries += 1) await new Promise(resolve => setTimeout(resolve, 16));
  const el = /** @type {HTMLCanvasElement | null} */ (canvas.value);
  if (!el || unmounted) return;
  fit();
  observer = new ResizeObserver(fit);
  observer.observe(el);
  const flags = parseFlags(window.location.search);
  const reducedMotion = flags.nomotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  sceneState.reducedMotion = reducedMotion;
  if (flags.nowebgl || saveData() || !hasWebGL2()) {
    setWebgl(HOME_WEBGL.off);
    contract.setReady();
    return;
  }
  setWebgl(HOME_WEBGL.on);
  sceneState.loading = true;
  let createHomeScene;
  try {
    ({ createHomeScene } = await import('~~/engine/index.js'));
  } catch (error) {
    if (!unmounted) fail(error);
    return;
  }
  if (unmounted) return;
  try {
    scene = createHomeScene({
      canvas: el,
      mode: homeRouteOf(route.path),
      stones: content.stones,
      assetsBase: HOME_ASSETS_BASE,
      quality: flags.quality,
      reducedMotion,
      still: flags.still,
    });
  } catch (error) {
    fail(error);
    return;
  }
  const live = scene;
  offs = [
    live.on('ready', () => {
      contract.setReady();
      watchFirstFrame();
    }),
    live.on('contextlost', markLost),
    live.on('beat', beat => beat?.tone && contract.setTone(beat.tone)),
    live.on('stones:screen', list => {
      // A copy, so an engine that reuses one array still triggers the update.
      if (sceneState.webgl === HOME_WEBGL.on) stonesScreen.value = Array.isArray(list) ? list.slice() : null;
    }),
    live.on('stone:enter', detail => {
      if (typeof detail?.id === 'string') sceneHot.value = detail.id;
    }),
    live.on('stone:leave', detail => {
      if (!detail?.id || sceneHot.value === detail.id) sceneHot.value = null;
    }),
    live.on('stone:click', detail => {
      if (typeof detail?.id === 'string') emitSceneStoneClick(detail);
    }),
  ];
  el.addEventListener('webglcontextlost', onContextLost);
  el.addEventListener('webglcontextrestored', onContextRestored);
  contract.attachScene(live);
  attachScene(live);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  try {
    await live.load(fraction => {
      sceneState.loadProgress = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
    });
  } catch (error) {
    if (!unmounted && scene === live) fail(error);
    return;
  }
  if (unmounted || scene !== live) return;
  sceneState.loading = false;
  sceneState.loaded = true;
  contract.setReady();
});

watch(() => route.path, path => scene?.setMode(homeRouteOf(path)));

onBeforeUnmount(() => {
  unmounted = true;
  observer?.disconnect();
  teardown();
});
</script>

<template>
  <canvas ref="canvas" class="scene-canvas" aria-hidden="true" />
</template>
