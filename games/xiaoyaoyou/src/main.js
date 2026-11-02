import * as THREE from 'three';
import { prepareAssets } from './assets.js';
import { prepareKun } from './kun.js';
import { createWorld, mulberry, FOG_DENSITY, fogDensity } from './world.js';
import { createJourney, ART_PITCH, GROWTH, WORLD } from './journey.js';
import { createPost, createGobo } from './post.js';

const STEP_SECONDS = 1 / 60;
const CHECKPOINTS = new Map([['title', 'title'], ['north-start', 'north'], ['north-text', 'north'], ['north-play', 'north'],
  ['north-full', 'north'], ['end-card', 'end'], ['kun-test', 'test']]);
// When each source line shows, in journey seconds. Fixed to the simulation, never to the wall clock.
const LINE_TIMES = { first: [1.8, 10.5], second: 9 };
const SHEET_VIEWS = ['side', 'top', 'front'];
const CARD_GAIN = .86, BLOOM_GAIN = .34;

export async function createRuntime(text, onProgress) {
  const title = document.querySelector('#title-screen');
  const begin = document.querySelector('#begin');
  const canvas = document.querySelector('#world');
  const endCard = document.querySelector('#end-card');
  const replayButton = document.querySelector('#replay');
  const hud = document.querySelector('#hud');
  const lineBox = document.querySelector('#line');
  const lineZh = document.querySelector('#line-zh');
  const lineEn = document.querySelector('#line-en');
  const hint = document.querySelector('#hint');
  const toggle = document.querySelector('#toggle-translation');
  const lines = new Map(text.lines.map(line => [line.id, line]));
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
  scene.fog = new THREE.FogExp2('#172A35', FOG_DENSITY);
  let kun, world, journey, post;
  let camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  camera.position.set(0, 3, 12);
  camera.lookAt(0, 0, 0);
  let framesSinceJump = 0;
  let steps = 0;
  let accumulator = 0;
  let previousTime;
  let timescale = 1;
  let autoplayOn = false;
  let shownLine = null;
  let holdMs = null;
  // Evidence only: lets the making-of page show a frame built up one layer at a time.
  const layers = { look: 1, shafts: 1, mist: 1, cards: 1, bloom: 1 };
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
    hud.hidden = true;
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
  function jump(id, crossfade = false) {
    if (!CHECKPOINTS.has(id)) throw new Error(`Checkpoint not available: ${id}`);
    steps = 0;
    accumulator = 0;
    previousTime = undefined;
    framesSinceJump = 0;
    rngState = config.seed;
    Object.assign(state, { beat: CHECKPOINTS.get(id), motes: 0, kunScale: 1, gameMs: 0, settled: false });
    journey.reset(aspect());
    world.placeOpening(journey.j.cam, aspect());
    world.refresh();
    journey.j.autoplay = autoplayOn;
    if (state.beat === 'title') { title.hidden = false; title.classList.remove('leaving'); }
    else if (crossfade && !title.hidden) title.classList.add('leaving');
    else title.hidden = true;
    begin.disabled = false;
    endCard.hidden = true;
    hud.hidden = state.beat === 'title' || state.beat === 'test' || state.beat === 'end';
    shownLine = null;
    lineBox.classList.remove('showing');
    hint.classList.remove('showing');
    const sheet = SHEET_VIEWS.includes(config.view);
    kun.root.visible = state.beat === 'test' || state.beat === 'north';
    world.group.visible = (state.beat === 'test' && !sheet) || state.beat === 'north';
    world.props.visible = state.beat === 'north';
    scene.background = state.beat === 'test' && sheet ? new THREE.Color('rgb(155,156,158)') : new THREE.Color('#172A35');
    scene.fog.density = state.beat === 'test' ? (sheet ? 0 : .018) : FOG_DENSITY;
    kun.root.position.set(0, 0, 0);
    kun.root.rotation.set(0, 0, 0);
    kun.root.scale.setScalar(1);
    run = null;
    if (id === 'north-start') beginRun();
    if (id === 'north-text') replayJourney(j => j.t >= 3.4);
    if (id === 'north-play') replayJourney(j => j.t >= 13);
    if (id === 'north-full') replayJourney(j => j.phase === 'finale' && j.phaseT > 6.2);
    if (id === 'end-card') { replayJourney(j => j.ended); finish(); }
    resize();
  }
  // A real Begin dissolves the title frame into the live sea behind it.
  const start = () => jump('north-start', true);
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
    if (holdMs !== null && state.gameMs >= holdMs) return;
    state.gameMs = ++steps * 1000 / 60;
    if (state.beat !== 'north') return;
    journey.step(aspect());
    syncState();
    if (journey.j.ended) finish();
  }
  function updateText() {
    if (state.beat !== 'north') return;
    const j = journey.j;
    const fourth = j.moteTimes[3];
    const id = j.t >= LINE_TIMES.first[0] && j.t < LINE_TIMES.first[1] ? 'north-1'
      : fourth !== undefined && j.t >= fourth + 1 && j.t < fourth + 1 + LINE_TIMES.second ? 'north-2' : null;
    if (id !== shownLine) {
      shownLine = id;
      if (id) { lineZh.textContent = lines.get(id).zh; lineEn.textContent = lines.get(id).en; }
      lineBox.classList.toggle('showing', Boolean(id));
    }
    hint.classList.toggle('showing', j.t > 11.5 && j.t < 18 && !j.autoplay);
  }
  function applyTranslation() {
    lineBox.classList.toggle('no-translation', !state.translationOn);
    toggle.setAttribute('aria-pressed', String(state.translationOn));
  }
  function toggleTranslation() {
    state.translationOn = !state.translationOn;
    applyTranslation();
  }
  function poseKun() {
    const j = journey.j;
    kun.root.position.set(j.x, j.y, j.z);
    // In the two posed shots Kun lifts its head, as in the key art.
    kun.root.rotation.set(-j.pitch - j.cam.mix * .1, j.yaw, j.roll, 'YXZ');
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
    const sheet = SHEET_VIEWS.includes(config.view);
    const sized = state.beat === 'north' || state.beat === 'end' ? journey.j.scale : 1;
    kun.update(state.gameMs, config.phase, state.beat === 'title' || (sheet && config.phase === null), !(sheet && state.beat === 'test') && layers.look > 0, sized);
    if (state.beat === 'north' || state.beat === 'end') {
      poseKun();
      scene.fog.density = fogDensity(journey.j.scale);
      world.placeFinale(journey.j.rig, ART_PITCH, journey.j.scale, aspect(), journey.j.cam.mix);
      world.update(camera, state.gameMs, journey.j.scale, journey.j.cam.mix);
      world.showMote(journey.j.mote, journey.j.scale, state.gameMs, camera, journey.j.cam.mix);
    } else if (state.beat === 'test') world.update(camera, state.gameMs, 1);
    updateText();
    renderer.info.reset();
    if (state.beat === 'title' || (sheet && state.beat === 'test')) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    } else {
      configureVolume(sized);
      post.render(scene, camera, state.gameMs / 1000, state.beat !== 'test');
    }
    Object.assign(stats, {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      pixelRatio: renderer.getPixelRatio(), frame: stats.frame + 1,
    });
    if (++framesSinceJump >= 30) state.settled = true;
    resolveFirst();
    animation = requestAnimationFrame(render);
  }
  function configureVolume(scale) {
    const u = post.uniforms;
    const octave = Math.log(scale) / Math.log(4);
    u.uLayers.value.set(Math.max(0, 1 - octave), Math.max(0, 1 - Math.abs(octave - 1)), Math.max(0, octave - 1));
    u.uScale.value = scale;
    // The broader gobo layers carry more light, so the gain eases off as Kun grows.
    u.uShaftGain.value = layers.shafts * .37 / Math.pow(scale, .42);
    u.uLight.value.copy(world.light);
    const j = journey.j, climb = (WORLD.surface - j.y) / world.light.y, climb0 = WORLD.surface / world.light.y;
    if (state.beat === 'test') u.uHero.value.set(world.light.x * climb0, world.light.z * climb0, 13);
    else u.uHero.value.set(j.x + world.light.x * climb, j.z + world.light.z * climb, 13 * scale);
    u.uSurface.value = WORLD.surface;
    u.uReach.value = 420 * Math.pow(scale, .78);
    const inSea = state.beat !== 'test';
    u.uMistGain.value = inSea ? layers.mist * .019 / Math.pow(scale, .7) : 0;
    u.tMistMap.value = world.mistMap;
    u.uMistTop.value = 34 + 30 * Math.sqrt(scale);
    u.uMistBottom.value = -30;
    u.uBankTop.value = (inSea ? 1 : 0) * (22 + 13 * Math.sqrt(scale));
    u.uBankDensity.value = layers.mist * .0065 / Math.sqrt(scale);
    post.cards.uGain.value = layers.cards * CARD_GAIN;
    post.grade.uBloom.value = layers.bloom * BLOOM_GAIN;
    post.cards.uScale.value = scale;
    post.cards.uDensity.value = fogDensity(scale);
    post.cards.uLight.value.copy(world.light);
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
    post?.setSize(renderer.domElement.width, renderer.domElement.height);
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
  // The true span of the model on screen, read from its vertices. measure().kun stays the
  // projected bounding box, because the M3 scale gate is defined on it.
  function kunSpan() {
    let min = Infinity, max = -Infinity, low = Infinity, high = -Infinity;
    kun.root.updateMatrixWorld(true);
    kun.root.traverse(object => {
      if (!object.isMesh) return;
      const position = object.geometry.attributes.position;
      for (let i = 0; i < position.count; i += 7) {
        projected.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld).project(camera);
        min = Math.min(min, projected.x); max = Math.max(max, projected.x);
        low = Math.min(low, projected.y); high = Math.max(high, projected.y);
      }
    });
    return { widthFraction: (max - min) / 2, heightFraction: (high - low) / 2, left: (min + 1) / 2, right: (max + 1) / 2, top: (1 - high) / 2, bottom: (1 - low) / 2 };
  }
  function measure() {
    const result = { cameraAltitude: camera.position.y };
    if (state.beat === 'test' || state.beat === 'north') {
      kun.root.updateMatrixWorld(true);
      const box = SHEET_VIEWS.includes(config.view) && config.phase === null ? kun.restBox : kun.bounds;
      result.kun = boxInView(box, kun.root.matrixWorld);
    }
    if (state.beat === 'north') for (const [name, box] of world.named) result[name] = boxInView(box);
    if (kun && (state.beat === 'test' || state.beat === 'north')) result.kunSpan = kunSpan();
    return result;
  }
  function onKey(event) {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === 't') toggleTranslation();
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
  function hideTitle(event) { if (event.target === title && title.classList.contains('leaving')) title.hidden = true; }
  function dispose() {
    disposed = true;
    cancelAnimationFrame(animation);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', onPointerUp);
    begin.removeEventListener('click', start);
    replayButton.removeEventListener('click', replay);
    toggle.removeEventListener('click', toggleTranslation);
    title.removeEventListener('transitionend', hideTitle);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', pointerSteer);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    kun?.dispose();
    world?.dispose();
    post?.dispose();
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
    const gobo = createGobo(mulberry(4242));
    const loader = new THREE.TextureLoader();
    const mistSheet = await loader.loadAsync('assets/mist.webp');
    const rockTexture = await loader.loadAsync('assets/rock.webp');
    rockTexture.colorSpace = THREE.SRGBColorSpace;
    rockTexture.wrapS = rockTexture.wrapT = THREE.RepeatWrapping;
    rockTexture.anisotropy = 8;
    world = createWorld(assets.get('sea'), gobo, rockTexture);
    kun = prepareKun(assets.get('kun'), gobo, world.heroLight);
    journey = createJourney(world.colliders);
    scene.add(kun.root, world.group);
    // Lighting remains available in the grey reference views as well.
    scene.add(new THREE.HemisphereLight('#D4D6CA', '#283B48', 1.7));
    const referenceLight = new THREE.DirectionalLight('#FFF1D5', 1.8);
    referenceLight.position.set(-5, 12, 6); scene.add(referenceLight);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.info.autoReset = false;
    post = createPost(renderer, gobo, mulberry(9001));
    post.setCards(world.cards, mistSheet);
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
      // Replays the real journey to a time, for evidence and contact sheets.
      // Stops the simulation at an exact game time, so two routes into a scene can be compared.
      holdAt(ms) { holdMs = ms; },
      layers(next) { Object.assign(layers, next); },
      seek(seconds) { jump('north-start'); replayJourney(j => j.t >= seconds || j.ended); return journey.j.t; },
      kunScreenBox() {
        kun.root.updateMatrixWorld(true);
        projected.copy(kun.bodyFocus).applyMatrix4(kun.root.matrixWorld).project(camera);
        return { x: (projected.x + 1) * innerWidth / 2, y: (1 - projected.y) * innerHeight / 2 };
      },
      growthTarget: GROWTH,
    };
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onPointerUp);
    begin.addEventListener('click', start);
    replayButton.addEventListener('click', replay);
    toggle.addEventListener('click', toggleTranslation);
    title.addEventListener('transitionend', hideTitle);
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
        if (params.get('showcase') === '1') {
          document.body.classList.add('showcase');
          journey.setShowcase(true);
          autoplayOn = true;
          jump('north-start');
        }
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
