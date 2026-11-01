import * as THREE from 'three';
import { prepareAssets } from './assets.js';
import { prepareKun } from './kun.js';
import { createWorld } from './world.js';
import { createJourney, GROWTH } from './journey.js';

const STEP_SECONDS = 1 / 60;
const CHECKPOINTS = new Map([['title', 'title'], ['north-start', 'north'], ['north-play', 'north'],
  ['north-full', 'north'], ['end-card', 'end'], ['kun-test', 'test']]);
const FOG_START = .0032;
const SHEET_VIEWS = ['side', 'top', 'front'];

export async function createRuntime(text, onProgress) {
  const title = document.querySelector('#title-screen');
  const begin = document.querySelector('#begin');
  const canvas = document.querySelector('#world');
  const endCard = document.querySelector('#end-card');
  const replayButton = document.querySelector('#replay');
  const state = window.__GAME_STATE__;
  const stats = window.__GAME_STATS__;
  const params = new URLSearchParams(location.search);
  const config = {
    seed: Number(params.get('seed') ?? 1) >>> 0,
    view: ['side', 'top', 'front', 'gameplay', 'rear', 'three-quarter'].includes(params.get('view')) ? params.get('view') : null,
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
  scene.fog = new THREE.FogExp2('#172A35', FOG_START);
  let kun, world, journey;
  let camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  camera.position.set(0, 3, 12);
  camera.lookAt(0, 0, 0);
  let framesSinceJump = 0;
  let steps = 0;
  let accumulator = 0;
  let previousTime;
  let timescale = 1;
  let autoplayOn = false;
  const runs = [];
  let run = null;
  const projected = new THREE.Vector3();

  const aspect = () => innerWidth / innerHeight;
  function setTimescale(value) {
    if (!Number.isFinite(value) || value < 1 || value > 240 || !Number.isInteger(value)) {
      throw new RangeError('Timescale must be an integer from 1 to 240');
    }
    timescale = value;
  }
  function beginRun() {
    run = { beats: [{ id: 'north', gameMs: 0 }], totalGameMs: 0, reachedEnd: false,
      growth: [], startState: { motes: state.motes, kunScale: state.kunScale } };
    runs.push(run);
  }
  function syncState() {
    const j = journey.j;
    state.motes = j.motes;
    state.kunScale = j.scale;
    if (run) run.growth = j.growth.slice();
  }
  function finish() {
    state.beat = 'end';
    endCard.hidden = false;
    if (run && !run.reachedEnd) {
      run.reachedEnd = true;
      run.totalGameMs = state.gameMs;
      run.beats.push({ id: 'end', gameMs: state.gameMs });
    }
  }
  // Checkpoints replay the real journey with the pilot, never a staged pose.
  function replayJourney(until) {
    const j = journey.j, wasAutoplay = j.autoplay;
    j.autoplay = true;
    for (let guard = 0; guard < 60 * 300 && !until(j); guard++) {
      journey.step(aspect());
      state.gameMs = ++steps * 1000 / 60;
    }
    j.autoplay = wasAutoplay;
    Object.assign(j, { hold: false, steerX: 0, steerY: 0 });
    syncState();
  }
  function jump(id) {
    if (!CHECKPOINTS.has(id)) throw new Error(`Checkpoint not available: ${id}`);
    steps = 0;
    accumulator = 0;
    previousTime = undefined;
    framesSinceJump = 0;
    rngState = config.seed;
    Object.assign(state, { beat: CHECKPOINTS.get(id), motes: 0, kunScale: 1, gameMs: 0, settled: false });
    journey.reset(aspect());
    journey.j.autoplay = autoplayOn;
    title.hidden = state.beat !== 'title';
    begin.disabled = false;
    endCard.hidden = true;
    const sheet = SHEET_VIEWS.includes(config.view);
    kun.root.visible = state.beat === 'test' || state.beat === 'north';
    world.group.visible = (state.beat === 'test' && !sheet) || state.beat === 'north';
    world.props.visible = state.beat === 'north';
    scene.background = state.beat === 'test' && sheet ? new THREE.Color('rgb(155,156,158)') : new THREE.Color('#172A35');
    scene.fog.density = state.beat === 'test' ? (sheet ? 0 : .018) : FOG_START;
    kun.root.position.set(0, 0, 0);
    kun.root.rotation.set(0, 0, 0);
    kun.root.scale.setScalar(1);
    run = null;
    if (id === 'north-start') beginRun();
    if (id === 'north-play') replayJourney(j => j.t >= 9);
    if (id === 'north-full') replayJourney(j => j.phase === 'finale' && j.phaseT > 6.2);
    if (id === 'end-card') { replayJourney(j => j.ended); finish(); }
    resize();
  }
  const start = () => jump('north-start');
  function replay() {
    const auto = journey.j.autoplay;
    jump('north-start');
    journey.j.autoplay = auto;
  }
  const autoplay = on => {
    autoplayOn = Boolean(on);
    if (journey) journey.j.autoplay = autoplayOn;
    if (autoplayOn && state.beat === 'title') start();
  };
  function simulate() {
    if (state.beat === 'title' || state.beat === 'end') return;
    state.gameMs = ++steps * 1000 / 60;
    if (state.beat !== 'north') return;
    journey.step(aspect());
    syncState();
    if (journey.j.ended) finish();
  }
  function poseKun() {
    const j = journey.j;
    kun.root.position.set(j.x, j.y, j.z);
    kun.root.rotation.set(-j.pitch, j.yaw, j.roll, 'YXZ');
    kun.root.scale.setScalar(j.scale);
    const c = j.cam;
    camera.position.set(c.x, c.y, c.z);
    camera.near = Math.max(.6, j.scale * .8);
    camera.far = 16000 * Math.sqrt(j.scale);
    camera.updateProjectionMatrix();
    camera.lookAt(c.aimX, c.aimY, c.aimZ);
    camera.updateMatrixWorld();
  }
  function render(time) {
    if (disposed) return;
    if (previousTime !== undefined) accumulator += Math.min((time - previousTime) / 1000, 0.25);
    previousTime = time;
    while (accumulator >= STEP_SECONDS) {
      for (let i = 0; i < timescale && (state.beat === 'title' || state.beat === 'test' || state.beat === 'north'); i++) simulate();
      accumulator -= STEP_SECONDS;
    }
    kun.update(state.gameMs, config.phase, state.beat === 'title' || (SHEET_VIEWS.includes(config.view) && config.phase === null));
    if (state.beat === 'north' || state.beat === 'end') {
      poseKun();
      scene.fog.density = FOG_START / Math.pow(journey.j.scale, .92);
      world.update(camera, state.gameMs, journey.j.scale);
      world.showMote(journey.j.mote, journey.j.scale, state.gameMs);
    } else if (state.beat === 'test') world.update(camera, state.gameMs, 1);
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
  function frameKun() {
    const ratio = aspect();
    const sheet = SHEET_VIEWS.includes(config.view);
    const box = sheet && config.phase === null ? kun.restBox : kun.bounds;
    const center = box.getCenter(new THREE.Vector3());
    const directions = { side: [-1, 0, 0], top: [0, 1, 0], front: [0, 0, 1],
      'three-quarter': [-.6409, .4226, .6409], gameplay: [-.6124, .5, -.6124], rear: [0, .5, -.8660] };
    const direction = new THREE.Vector3(...(directions[config.view] ?? [-.819, -.12, .561])).normalize();
    camera = sheet ? new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 2000) : new THREE.PerspectiveCamera(42, ratio, .1, 2000);
    camera.up.set(0, config.view === 'top' ? 0 : 1, config.view === 'top' ? 1 : 0);
    camera.position.copy(center).addScaledVector(direction, 30); camera.lookAt(center); camera.updateMatrixWorld();
    const inverse = camera.matrixWorldInverse;
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const projectedBox = new THREE.Box3().setFromPoints(corners.map(p => p.clone().applyMatrix4(inverse)));
    const size = projectedBox.getSize(new THREE.Vector3());
    if (sheet) {
      // Square Blender fit retained vertically, expanded for wide browser panes.
      const extent = Math.max(size.x, size.y) * 1.08;
      const height = Math.max(extent, size.x * 1.08 / ratio);
      camera.left = -height * ratio / 2; camera.right = height * ratio / 2; camera.top = height / 2; camera.bottom = -height / 2;
    } else {
      const fill = ratio < .8 ? .84 : .70;
      const tan = Math.tan(THREE.MathUtils.degToRad(42 / 2));
      let distance = 0;
      for (const point of corners) {
        const v = point.clone().sub(center).applyQuaternion(camera.quaternion.clone().invert());
        distance = Math.max(distance, Math.abs(v.x) / (tan * ratio * fill) + v.z, Math.abs(v.y) / (tan * .72) + v.z);
      }
      camera.position.copy(center).addScaledVector(direction, distance); camera.lookAt(center);
    }
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    world.compose(camera, center);
  }
  function resize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight);
    if (kun && state.beat === 'test') frameKun();
    else {
      camera = new THREE.PerspectiveCamera(42, aspect(), .1, 2000);
      camera.position.set(0, 3, 12); camera.lookAt(0, 0, 0);
    }
  }
  function boxInView(box, matrix) {
    const b = new THREE.Box3();
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      projected.set(x, y, z);
      if (matrix) projected.applyMatrix4(matrix);
      b.expandByPoint(projected.project(camera));
    }
    return { widthPx: (b.max.x - b.min.x) * innerWidth / 2, heightPx: (b.max.y - b.min.y) * innerHeight / 2,
      inFrame: b.min.x >= -1 && b.max.x <= 1 && b.min.y >= -1 && b.max.y <= 1 && b.min.z >= -1 && b.max.z <= 1,
      centerX: (b.min.x + b.max.x + 2) * innerWidth / 4, centerY: (2 - b.min.y - b.max.y) * innerHeight / 4 };
  }
  function measure() {
    const result = { cameraAltitude: camera.position.y };
    if (state.beat === 'test' || state.beat === 'north') {
      kun.root.updateMatrixWorld(true);
      const box = SHEET_VIEWS.includes(config.view) && config.phase === null ? kun.restBox : kun.bounds;
      result.kun = boxInView(box, kun.root.matrixWorld);
    }
    if (state.beat === 'north') for (const [name, box] of world.named) result[name] = boxInView(box);
    return result;
  }
  function onKey(event) {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === 't') state.translationOn = !state.translationOn;
    if (event.key.toLowerCase() === 'm') state.muted = !state.muted;
  }
  function release() { if (journey) journey.j.hold = false; }
  function pointerSteer(event) {
    const j = journey.j, dead = v => (Math.abs(v) < .05 ? 0 : v);
    j.steerX = dead(event.clientX / innerWidth * 2 - 1);
    j.steerY = dead(1 - event.clientY / innerHeight * 2);
  }
  function onPointerDown(event) {
    pointerSteer(event);
    journey.j.hold = true;
    canvas.setPointerCapture?.(event.pointerId);
  }
  function onPointerUp() { release(); if (journey) { journey.j.steerX = journey.j.steerY = 0; } }
  function onPointerLeave() { onPointerUp(); }
  function dispose() {
    disposed = true;
    cancelAnimationFrame(animation);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', onPointerUp);
    begin.removeEventListener('click', start);
    replayButton.removeEventListener('click', replay);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', pointerSteer);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    kun?.dispose();
    world?.dispose();
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
    const assets = await prepareAssets(value => onProgress(0.5 + value / 2));
    kun = prepareKun(assets.get('kun'));
    world = createWorld(assets.get('sea'));
    journey = createJourney(world.colliders);
    scene.add(kun.root, world.group);
    // Lighting remains available in the grey reference views as well.
    scene.add(new THREE.HemisphereLight('#D4D6CA', '#283B48', 1.7));
    const referenceLight = new THREE.DirectionalLight('#FFF1D5', 1.8);
    referenceLight.position.set(-5, 12, 6); scene.add(referenceLight);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.info.autoReset = false;
    resize();
    jump('title');
    window.__GAME_DEBUG__ = {
      start, jump, autoplay, setTimescale, replay,
      measure,
      // Read-only inspection, beyond the required hooks, for reproducible captures.
      inspect: () => ({ threeVersion: THREE.REVISION, config, timescale, autoplay: autoplayOn,
        fog: { color: scene.fog.color.getHexString(), density: scene.fog.density },
        objectCount: scene.children.length, randomSample: random(),
        swim: kun.inspect(), atmosphere: { shafts: world.shafts, motes: world.motes },
        camera: { type: camera.type, position: camera.position.toArray(), up: camera.up.toArray() } }),
      journey: () => { const j = journey.j; return { t: j.t, phase: j.phase, yaw: j.yaw, heading: j.heading, speed: j.speed, heldSpeed: journey.held(),
        hold: j.hold, steerX: j.steerX, motes: j.motes, scale: j.scale, targetScale: j.targetScale, ended: j.ended, position: [j.x, j.y, j.z] }; },
      runs: () => runs,
      kunScreenBox: () => { const box = measure().kun; return { x: box.centerX, y: box.centerY }; },
      growthTarget: GROWTH,
    };
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onPointerUp);
    begin.addEventListener('click', start);
    replayButton.addEventListener('click', replay);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', pointerSteer);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
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
