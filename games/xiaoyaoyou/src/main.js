import * as THREE from 'three';
import { prepareAssets } from './assets.js';

const STEP_SECONDS = 1 / 60;
const CHECKPOINTS = new Map([['title', 'title'], ['north-start', 'north']]);

export async function createRuntime(text, onProgress) {
  const title = document.querySelector('#title-screen');
  const begin = document.querySelector('#begin');
  const state = window.__GAME_STATE__;
  const stats = window.__GAME_STATS__;
  const params = new URLSearchParams(location.search);
  const config = {
    seed: Number(params.get('seed') ?? 1) >>> 0,
    view: ['side', 'top', 'front'].includes(params.get('view')) ? params.get('view') : null,
    phase: params.has('phase') ? ((Number(params.get('phase')) || 0) % 1 + 1) % 1 : null,
  };
  // The seed and frozen pose are carried forward for the later hero test scenes.
  let rngState = config.seed;
  const random = () => { rngState = (Math.imul(1664525, rngState) + 1013904223) >>> 0; return rngState / 4294967296; };
  let renderer;
  let animation = 0;
  let disposed = false;
  let resolveFirst;
  const first = new Promise(resolve => { resolveFirst = resolve; });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#172A35');
  scene.fog = new THREE.FogExp2('#172A35', 0.018);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  camera.position.set(0, 3, 12);
  camera.lookAt(0, 0, 0);
  let framesSinceJump = 0;
  let steps = 0;
  let accumulator = 0;
  let previousTime;
  let timescale = 1;
  let autoplayOn = false;

  function setTimescale(value) {
    if (!Number.isFinite(value) || value < 1 || value > 240 || !Number.isInteger(value)) {
      throw new RangeError('Timescale must be an integer from 1 to 240');
    }
    timescale = value;
  }
  function jump(id) {
    if (!CHECKPOINTS.has(id)) throw new Error(`Checkpoint not available in M0: ${id}`);
    steps = 0;
    accumulator = 0;
    previousTime = undefined;
    framesSinceJump = 0;
    rngState = config.seed;
    Object.assign(state, { beat: CHECKPOINTS.get(id), motes: 0, kunScale: 1, gameMs: 0, settled: false });
    title.hidden = state.beat !== 'title';
    begin.disabled = false;
  }
  const start = () => jump('north-start');
  const autoplay = on => { autoplayOn = Boolean(on); if (autoplayOn && state.beat === 'title') start(); };
  function simulate() {
    // M0 deliberately has no hero, goals, or ending. Later beats use this fixed step.
    if (state.beat !== 'title') state.gameMs = ++steps * 1000 / 60;
  }
  function render(time) {
    if (disposed) return;
    if (previousTime !== undefined) accumulator += Math.min((time - previousTime) / 1000, 0.25);
    previousTime = time;
    while (accumulator >= STEP_SECONDS) {
      for (let i = 0; i < timescale; i++) simulate();
      accumulator -= STEP_SECONDS;
    }
    renderer.info.reset();
    renderer.render(scene, camera);
    Object.assign(stats, {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      pixelRatio: renderer.getPixelRatio(), frame: stats.frame + 1,
    });
    if (++framesSinceJump >= 30) state.settled = true;
    resolveFirst();
    animation = requestAnimationFrame(render);
  }
  function resize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  function onKey(event) {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === 't') state.translationOn = !state.translationOn;
    if (event.key.toLowerCase() === 'm') state.muted = !state.muted;
  }
  function dispose() {
    disposed = true;
    cancelAnimationFrame(animation);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    begin.removeEventListener('click', start);
    renderer?.dispose();
  }

  try {
    const zh = text.lines.map(line => line.zh).join('');
    const en = text.lines.map(line => line.en).join('');
    await Promise.all([
      document.fonts.load('32px "LXGW WenKai"', zh),
      document.fonts.load('24px "EB Garamond"', en),
    ]);
    onProgress(0.5);
    await prepareAssets(value => onProgress(0.5 + value / 2));
    renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#world'), antialias: true });
    renderer.info.autoReset = false;
    resize();
    jump('title');
    window.__GAME_DEBUG__ = {
      start, jump, autoplay, setTimescale,
      measure: () => ({ cameraAltitude: camera.position.y }),
      // Read-only inspection, beyond the required hooks, for reproducible captures.
      inspect: () => ({ threeVersion: THREE.REVISION, config, timescale, autoplay: autoplayOn,
        fog: { color: scene.fog.color.getHexString(), density: scene.fog.density },
        objectCount: scene.children.length, randomSample: random() }),
    };
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    begin.addEventListener('click', start);
    animation = requestAnimationFrame(render);
    return {
      firstFrame: () => first,
      dispose,
      applyURL() {
        const checkpoint = params.get('checkpoint');
        if (checkpoint) jump(checkpoint);
        if (params.has('timescale')) setTimescale(Number(params.get('timescale')));
        if (params.get('autoplay') === '1') autoplay(true);
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
