// Richard's room, live: the look test for Act 3 (ROOM.md, STORYBOARD.md).
//   ?shot=wide|desk|instrument|bed|wall|screens   one deterministic still
//   (no ?shot)                                    live: starts at 'wide', pointer parallax, aurora drift
//   &notext=1   hide the type (its scrim stays, so the frame is otherwise identical)
//   &tier=0|1|2 quality (default 2 on wide windows, 1 on phones)
//   &refl=0     baked-only floor (no planar reflections)
//   &finish=0   film finish off (glow, roll-off, grain, vignette)
//   &scrim=0    no darkening under the type
//   &t=<sec>    sky and water time for stills (default SKY.stillTime)
// Console: window.__ROOM__ = { setLights(0..1), setScreens(0..1), goto(shotId) }.
// window.__ROOM_STATS__ after the first frame: draw calls, triangles, memory, load time.
//
// Frame (one render call per target, so multisampled targets stay valid):
//  1. sea mirror: sky + far coast mirrored in the water (y = -36 m)
//  2. outside: sky + coast + city + sea, own camera (near 1 m, far 400 km), CSS resolution
//  3. floor mirror: outside + room mirrored in the floor (half CSS resolution)
//  4. room: the outside as a backdrop, then the room (near 5 cm, far 150 m), MSAA, depth texture
//  5. film finish (post.js) to the canvas.

import * as THREE from 'three';
import { createSky } from '../sky/sky.js';
import { loadRoom, LAYERS } from './room.js';
import { createReflections } from './reflect.js';
import { createPost } from './post.js';
import { SHOTS, SHOT_IDS, DEFAULT_SHOT, SKY, CHAPTER_TEXT, LANDMARKS, layoutFor, cameraSpec, b2t, DEG } from './shots.js';

const T0 = performance.now();
const params = new URLSearchParams(window.location.search);
const requested = params.get('shot');
const still = requested !== null;
const startShot = SHOT_IDS.includes(requested) ? requested : DEFAULT_SHOT;
const noText = params.get('notext') === '1';
const finishOn = params.get('finish') !== '0';
const scrimOn = params.get('scrim') !== '0';
const reflParam = params.get('refl');
const tNum = Number(params.get('t'));
const stillTime = params.has('t') && Number.isFinite(tNum) ? tNum : SKY.stillTime;
if (noText) document.documentElement.classList.add('notext');

const TIERS = {
  0: { dprMax: 1, samples: 0, outScale: 0.75, outSamples: 0, refl: false, sea: false, floorScale: 0.5, seaScale: 0.3, sky: 0, post: 0 },
  1: { dprMax: 1.75, samples: 2, outScale: 1, outSamples: 0, refl: true, sea: true, floorScale: 0.5, seaScale: 0.3, sky: 1, post: 1 },
  2: { dprMax: 2, samples: 4, outScale: 1, outSamples: 4, refl: true, sea: true, floorScale: 0.5, seaScale: 0.35, sky: 2, post: 2 },
};
const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const tierParam = Number(params.get('tier'));
const tierId = params.has('tier') && TIERS[tierParam] ? tierParam : layoutFor(window.innerWidth, window.innerHeight) === 'port' || coarse ? 1 : 2;
const Q = { ...TIERS[tierId] };
// a 4x multisampled half-float target at retina size is ~170 MB: above ~4 MP, 2x samples (looks the same at DPR 2)
if (window.innerWidth * window.innerHeight * Math.min(window.devicePixelRatio || 1, Q.dprMax) ** 2 > 4.2e6) Q.samples = Math.min(Q.samples, 2);
if (reflParam === '0') {
  Q.refl = false;
  Q.sea = false;
}

const canvas = document.getElementById('scene');
const copyRoot = document.getElementById('copy');
const status = document.getElementById('status');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: still });
renderer.outputColorSpace = THREE.SRGBColorSpace; // only post.js writes the canvas, and it encodes sRGB itself
renderer.toneMapping = THREE.NoToneMapping; // baked atlases are already display-referred: never tone map twice
renderer.setClearColor(0x000000, 1);
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.matrixWorldAutoUpdate = false;
const roomCam = new THREE.PerspectiveCamera(50, 1, 0.05, 150);
const outCam = new THREE.PerspectiveCamera(50, 1, 1, 400000);
const mask = (...ls) => ls.reduce((m, l) => m | (1 << l), 0);
roomCam.layers.mask = mask(LAYERS.ROOM, LAYERS.BG_MAIN, LAYERS.FLOOR);
outCam.layers.mask = mask(LAYERS.OUT, LAYERS.SEA);

const outRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Q.outSamples, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const post = createPost(renderer, { samples: Q.samples });
const refl = createReflections(renderer);

// ---------------------------------------------------------------- sky
const sky = createSky({ seed: SKY.seed, tier: Q.sky, galaxy: SKY.galaxy, aurora: SKY.aurora, nebula: SKY.nebula, stars: SKY.stars, exposure: SKY.exposure, horizon: SKY.horizon });
{
  const A = new THREE.Vector3().fromArray(SKY.galaxyA).normalize();
  const B = new THREE.Vector3().fromArray(SKY.galaxyB).normalize();
  sky.setGalaxyFrame(new THREE.Vector3().crossVectors(A, B).normalize(), new THREE.Vector3().fromArray(SKY.galaxyCore).normalize(), SKY.galaxyShape);
  sky.setAuroraFrame(SKY.auroraFrame);
  sky.setHeroStars(SKY.heroes.map((h) => ({ dir: new THREE.Vector3().fromArray(h.dir), flux: h.flux, color: h.color })));
  sky.object3D.layers.set(LAYERS.OUT);
  scene.add(sky.object3D);
  // sky.js sizes stars, spikes and faint-star density in target px = CSS px x renderer.getPixelRatio(), which
  // holds on the canvas. Here it only draws into CSS-sized targets (outside x outScale, floor and sea mirrors),
  // so it gets each target's own px per CSS px; otherwise at DPR 2 every star is drawn at twice its size.
  const skyBefore = sky.object3D.onBeforeRender;
  sky.object3D.onBeforeRender = function (r, ...rest) {
    skyBefore.call(this, r, ...rest);
    const rt = r.getRenderTarget();
    if (rt && cssW > 0) sky.uniforms.uDpr.value = rt.width / cssW;
  };
}

// ---------------------------------------------------------------- state
let room = null;
let layout = layoutFor(window.innerWidth, window.innerHeight);
let dpr = Math.min(window.devicePixelRatio || 1, Q.dprMax);
let cssW = 1;
let cssH = 1;
let shotId = startShot;
const ARMILLARY = new THREE.Vector3().fromArray(b2t(LANDMARKS.armillaryCore));

// the camera the frame is built from: base spec (tweened by goto) + parallax
const cur = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), vfov: 50, aperture: 0, focus: 5, glass: 1 };
const tween = { active: false, t0: 0, dur: 2.4, from: null, to: null, id: null };
const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
const hover = { target: 0, value: 0 };
let scrims = [];
let skyQuiet = null;
const postTune = {}; // console overrides of post.js POST_DEFAULT (see __ROOM__.tune)

function specFor(id) {
  const s = cameraSpec(id, layout, cssW / cssH);
  return {
    pos: new THREE.Vector3().fromArray(s.pos),
    tgt: new THREE.Vector3().fromArray(s.tgt),
    vfov: s.vfov,
    aperture: s.aperture,
    focus: s.focus,
    glass: SHOTS[id].glass,
  };
}

function focusDistance(spec, pos) {
  if (spec.focus === 'armillary') return pos.distanceTo(ARMILLARY);
  return typeof spec.focus === 'number' ? spec.focus : 5;
}

function setCurrent(spec) {
  cur.pos.copy(spec.pos);
  cur.tgt.copy(spec.tgt);
  cur.vfov = spec.vfov;
  cur.aperture = spec.aperture;
  cur.focus = focusDistance(spec, spec.pos);
  cur.glass = spec.glass;
}

const Y = new THREE.Vector3(0, 1, 0);
function placeCamera() {
  const off = cur.pos.clone().sub(cur.tgt);
  // the pointer orbits the camera a little around its target (pointer right
  // or up: the camera moves right or up, as if leaning to look)
  const yaw = parallax.x * 3.5 * DEG;
  const pitch = parallax.y * 2.0 * DEG;
  off.applyAxisAngle(Y, yaw);
  const right = new THREE.Vector3().crossVectors(off, Y);
  if (right.lengthSq() > 1e-8) off.applyAxisAngle(right.normalize(), pitch);
  roomCam.position.copy(cur.tgt).add(off);
  roomCam.up.set(0, 1, 0);
  roomCam.lookAt(cur.tgt);
  roomCam.fov = cur.vfov;
  roomCam.aspect = cssW / cssH;
  roomCam.updateProjectionMatrix();
  roomCam.updateMatrixWorld(true);
  outCam.position.copy(roomCam.position);
  outCam.quaternion.copy(roomCam.quaternion);
  outCam.fov = roomCam.fov;
  outCam.aspect = roomCam.aspect;
  outCam.updateProjectionMatrix();
  outCam.updateMatrixWorld(true);
}

// ---------------------------------------------------------------- text
function inline(el, line) {
  // *words* -> <em>
  const parts = line.split('*');
  parts.forEach((p, i) => {
    if (!p) return;
    if (i % 2 === 1) {
      const em = document.createElement('em');
      em.textContent = p;
      el.append(em);
    } else el.append(document.createTextNode(p));
  });
}

function lines(el, text) {
  text.split('\n').forEach((line, i) => {
    if (i) el.append(document.createElement('br'));
    inline(el, line);
  });
}

function renderText() {
  copyRoot.replaceChildren();
  const S = SHOTS[shotId];
  const text = CHAPTER_TEXT[S.section];
  if (!text) return;
  const place = S.text[layout];
  const block = document.createElement('div');
  block.className = 'block';
  block.dataset.place = place;
  const kicker = document.createElement('p');
  kicker.className = 'kicker';
  kicker.textContent = `${S.section} / 20`;
  block.append(kicker);
  const blocks = text.split('\n\n');
  if (blocks.length > 1) {
    const h = document.createElement('h2');
    h.className = 'head';
    lines(h, blocks[0]);
    const b = document.createElement('p');
    b.className = 'body';
    lines(b, blocks.slice(1).join('\n'));
    block.append(h, b);
  } else {
    const d = document.createElement('h2');
    d.className = 'display';
    lines(d, blocks[0]);
    block.append(d);
  }
  copyRoot.append(block);
}

// the text's box (CSS px), measured on the real glyphs: the scrim goes under it
function measureText() {
  scrims = [];
  skyQuiet = null;
  const block = copyRoot.querySelector('.block');
  if (!block) return;
  const r = block.getBoundingClientRect();
  let right = r.left;
  for (const child of block.children) {
    const range = document.createRange();
    range.selectNodeContents(child);
    right = Math.max(right, range.getBoundingClientRect().right);
  }
  const box = [r.left, r.top, right, r.bottom];
  if (scrimOn) scrims = [box];
  if (SHOTS[shotId].skyQuiet[layout]) {
    const pad = 24;
    skyQuiet = [((box[0] - pad) / cssW) * 2 - 1, 1 - ((box[3] + pad) / cssH) * 2, ((box[2] + pad) / cssW) * 2 - 1, 1 - ((box[1] - pad) / cssH) * 2];
  }
}

// ---------------------------------------------------------------- sizes
function resize() {
  cssW = Math.max(1, window.innerWidth);
  cssH = Math.max(1, window.innerHeight);
  layout = layoutFor(cssW, cssH);
  document.documentElement.dataset.layout = layout;
  renderer.setPixelRatio(dpr);
  renderer.setSize(cssW, cssH, false);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  post.setSize(buf.x, buf.y, cssW, cssH);
  outRT.setSize(Math.max(1, Math.round(cssW * Q.outScale)), Math.max(1, Math.round(cssH * Q.outScale)));
  refl.setSize(cssW, cssH, Q.floorScale, Q.seaScale);
}

// ---------------------------------------------------------------- frame
function renderFrame(time) {
  renderer.info.reset();
  placeCamera();
  sky.setTime(time);
  sky.setQuietZone(skyQuiet, 1);
  room.setGlass(cur.glass);
  room.setHover(hover.value);

  // 1. the sea's mirror (sky and coast only)
  if (room.sea) {
    room.sea.uniforms.uTime.value = time;
    room.sea.uniforms.uInvRes.value.set(1 / outRT.width, 1 / outRT.height);
    if (Q.sea) {
      refl.renderSea(scene, outCam, mask(LAYERS.OUT));
      room.sea.uniforms.tRefl.value = refl.seaRT.texture;
      room.sea.uniforms.uRefl.value = 1;
    } else room.sea.uniforms.uRefl.value = 0;
  }
  // 2. the outside, through its own camera
  renderer.setRenderTarget(outRT);
  renderer.render(scene, outCam);

  // 3. the floor's mirror
  const sceneRT = post.sceneRT;
  if (Q.refl && room.floor) {
    room.bgRefl.material.uniforms.tBg.value = refl.floorOut.texture;
    room.bgRefl.material.uniforms.uInvRes.value.set(1 / refl.floorRT.width, 1 / refl.floorRT.height);
    refl.renderFloor(scene, outCam, roomCam, { out: mask(LAYERS.OUT), room: mask(LAYERS.ROOM, LAYERS.BG_REFL) });
    const u = room.floor.uniforms;
    u.tRefl.value = refl.floorRT.texture;
    u.tReflBlur.value = refl.floorBlur.texture;
    u.uInvRes.value.set(1 / sceneRT.width, 1 / sceneRT.height);
  }
  // 4. the room over the outside
  room.bgMain.material.uniforms.tBg.value = outRT.texture;
  room.bgMain.material.uniforms.uInvRes.value.set(1 / sceneRT.width, 1 / sceneRT.height);
  renderer.setRenderTarget(sceneRT);
  renderer.render(scene, roomCam);

  // 5. the finish
  const dofOn = cur.aperture > 0;
  const tanHalf = Math.tan((cur.vfov * DEG) / 2);
  post.compose({
    ...postTune,
    on: finishOn ? 1 : 0,
    tier: Q.post,
    dpr: sceneRT.width / cssW,
    scrims,
    dof: dofOn ? { near: roomCam.near, far: roomCam.far, focus: cur.focus, cocK: (cur.aperture * cssH) / (2 * tanHalf) } : null,
  });
  renderer.setRenderTarget(null);
}

// ---------------------------------------------------------------- stats
// always an object (replaced by the full stats after the first frame), so reading it never throws
window.__ROOM_STATS__ = { loading: true, shot: startShot, mode: still ? 'still' : 'live', tier: tierId };
let stats = null;
let geomBytes = 0;
let imageBytes = 0;
function collectStats(firstFrame) {
  const info = renderer.info;
  if (firstFrame) {
    imageBytes = room.imageBytes();
    geomBytes = 0;
    room.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const a of Object.values(o.geometry.attributes)) geomBytes += a.array.byteLength;
      if (o.geometry.index) geomBytes += o.geometry.index.array.byteLength;
    });
  }
  const targetBytes = post.bytes() + refl.bytes() + outRT.width * outRT.height * (8 + 4) * Math.max(1, Q.outSamples) + outRT.width * outRT.height * 8;
  stats = {
    ...(stats || {}),
    shot: shotId,
    mode: still ? 'still' : 'live',
    tier: tierId,
    layout,
    dpr,
    drawingBuffer: [post.sceneRT.width, post.sceneRT.height],
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    sceneTriangles: room.counts.triangles,
    meshes: room.counts.meshes,
    programs: info.programs ? info.programs.length : null,
    textures: info.memory.textures,
    textureMB: +(imageBytes / 1048576).toFixed(1),
    renderTargetMB: +(targetBytes / 1048576).toFixed(1),
    geometryMB: +(geomBytes / 1048576).toFixed(1),
    gpuMBEstimate: +((imageBytes + targetBytes + geomBytes) / 1048576).toFixed(1),
    glbBytes: room.glbBytes,
    glbParseMs: Math.round(room.parsedMs),
  };
  if (firstFrame) {
    stats.loadMs = Math.round(loadDone - T0);
    stats.firstFrameMs = Math.round(performance.now() - T0);
  }
  window.__ROOM_STATS__ = stats;
}

// ---------------------------------------------------------------- loop
let loadDone = 0;
let running = false;
let lastNow = 0;
let simTime = stillTime;
const frameMs = [];
let lastDprChange = 0;

function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function step(now) {
  const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
  lastNow = now;
  if (!still) simTime += dt;
  // goto tween
  if (tween.active) {
    const k = Math.min(1, (now - tween.t0) / (tween.dur * 1000));
    const e = ease(k);
    const a = tween.from;
    const b = tween.to;
    cur.pos.lerpVectors(a.pos, b.pos, e);
    cur.tgt.lerpVectors(a.tgt, b.tgt, e);
    cur.vfov = a.vfov + (b.vfov - a.vfov) * e;
    cur.aperture = a.aperture + (b.aperture - a.aperture) * e;
    cur.focus = a.focusD + (b.focusD - a.focusD) * e;
    cur.glass = a.glass + (b.glass - a.glass) * e;
    if (k >= 1) {
      tween.active = false;
      shotId = tween.id;
      document.documentElement.dataset.shot = shotId;
      renderText();
      measureText();
      copyRoot.classList.remove('fade');
    }
  }
  // pointer parallax and hover, eased
  const kp = 1 - Math.exp(-dt * 3.0);
  parallax.x += (parallax.tx - parallax.x) * kp;
  parallax.y += (parallax.ty - parallax.y) * kp;
  const kh = 1 - Math.exp(-dt * 9.0);
  hover.value += (hover.target - hover.value) * kh;
  // frame timing and a gentle dynamic resolution (live only). It runs before this frame draws: resizing the
  // canvas after drawing clears it, and that frame would show black.
  if (!still && dt > 0) {
    frameMs.push(dt * 1000);
    if (frameMs.length > 90) frameMs.shift();
    const avg = frameMs.reduce((s, v) => s + v, 0) / frameMs.length;
    stats.frameMs = +avg.toFixed(2);
    stats.fps = +(1000 / avg).toFixed(1);
    if (frameMs.length >= 90 && now - lastDprChange > 3000) {
      const sorted = [...frameMs].sort((x, y) => x - y);
      const med = sorted[sorted.length >> 1];
      const maxDpr = Math.min(window.devicePixelRatio || 1, Q.dprMax);
      if (med > 19.5 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.25);
        lastDprChange = now;
        frameMs.length = 0;
        resize();
      } else if (med < 12.5 && dpr < maxDpr) {
        dpr = Math.min(maxDpr, dpr + 0.25);
        lastDprChange = now;
        frameMs.length = 0;
        resize();
      }
    }
  }
  renderFrame(simTime);
  collectStats(false);
  const animating = tween.active || Math.abs(parallax.tx - parallax.x) > 1e-4 || Math.abs(parallax.ty - parallax.y) > 1e-4 || Math.abs(hover.target - hover.value) > 1e-3;
  if ((!still || animating) && !document.hidden) requestAnimationFrame(step);
  else running = false;
}

function kick() {
  if (running || !room) return;
  running = true;
  lastNow = 0;
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- API
// where a tween to `id` ends, for the current window (goto, and again on resize mid-tween)
function tweenEnd(id) {
  const s = specFor(id);
  return { pos: s.pos, tgt: s.tgt, vfov: s.vfov, aperture: s.aperture, focusD: focusDistance(s, s.pos), glass: s.glass };
}

function goto(id, opts) {
  // own shot ids only: SHOTS[id] is also truthy for 'toString', 'constructor', ...
  if (!SHOT_IDS.includes(id)) return false;
  const d = opts && typeof opts === 'object' ? opts.duration : undefined;
  const duration = typeof d === 'number' && Number.isFinite(d) ? d : 2.4;
  if (!room) {
    // still loading: start() places the camera on this shot
    shotId = id;
    renderText();
    measureText();
    return true;
  }
  const from = { pos: cur.pos.clone(), tgt: cur.tgt.clone(), vfov: cur.vfov, aperture: cur.aperture, focusD: cur.focus, glass: cur.glass };
  tween.active = true;
  tween.t0 = performance.now();
  tween.dur = Math.max(0.01, duration);
  tween.from = from;
  tween.to = tweenEnd(id);
  tween.id = id;
  copyRoot.classList.add('fade');
  kick();
  return true;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v) => Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every(isNum);
// console API: a bad argument is ignored, never thrown (or left to break the render loop later)
const safe =
  (fn, fallback) =>
  (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      console.warn('[room] __ROOM__:', err);
      return fallback;
    }
  };

window.__ROOM__ = {
  setLights: safe((v) => {
    room?.setLights(v);
    kick();
  }),
  setScreens: safe((v) => {
    room?.setScreens(v);
    kick();
  }),
  goto: safe(goto, false),
  get shot() {
    return shotId;
  },
  shots: SHOT_IDS,
  /**
   * Look tuning from the console, e.g. tune({ glow: [0.4, 0.3, 0.2], threshold: 0.8, knee: 0.7, white: 0.35,
   * grain: 0.02, vignette: 0.2, scrim: 0.5, emitK: 1.6, screenK: 1.9, brass: 1, refl: 1.2 }). Returns the current values.
   */
  tune: safe((o) => {
    const src = o && typeof o === 'object' ? o : {};
    for (const k of ['threshold', 'knee', 'white', 'grain', 'vignette', 'scrim']) if (isNum(src[k])) postTune[k] = src[k];
    for (const k of ['glow', 'veil']) if (isVec3(src[k])) postTune[k] = src[k].slice(0, 3);
    if (isNum(src.refl) && room?.floor) room.floor.uniforms.uRefl.value = Q.refl ? src.refl : 0;
    const g = room ? room.tune({ emitK: src.emitK, screenK: src.screenK, brass: src.brass }) : {};
    kick();
    return { ...postTune, ...g, refl: room?.floor?.uniforms.uRefl.value };
  }, {}),
};

// ---------------------------------------------------------------- input
if (!still) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const onPointer = (e) => {
    ndc.set((e.clientX / cssW) * 2 - 1, 1 - (e.clientY / cssH) * 2);
    parallax.tx = THREE.MathUtils.clamp(ndc.x, -1, 1);
    parallax.ty = THREE.MathUtils.clamp(ndc.y, -1, 1);
    if (room && room.armillary) {
      ray.setFromCamera(ndc, roomCam);
      const hit = ray.ray.intersectsBox(room.armillary.box);
      hover.target = hit ? 1 : 0;
      canvas.style.cursor = hit ? 'pointer' : '';
    }
    kick();
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });
  // the pointer left the window: drop the highlight
  document.addEventListener('pointerout', (e) => {
    if (e.relatedTarget) return;
    hover.target = 0;
    canvas.style.cursor = '';
    kick();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
  });
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resize();
    // the fov follows the aspect ('contain' fit) and the layout picks the camera (a running tween retargets)
    if (tween.active) tween.to = tweenEnd(tween.id);
    else setCurrent(specFor(shotId));
    renderText();
    measureText();
    if (room) {
      renderFrame(simTime);
      collectStats(false);
    }
  }, 120);
});

// ---------------------------------------------------------------- start
async function start() {
  resize();
  document.documentElement.dataset.tier = String(tierId);
  document.documentElement.dataset.mode = still ? 'still' : 'live';
  renderText();
  try {
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* system fonts: measure anyway */
  }
  measureText();
  try {
    room = await loadRoom('/_dev/room/room.glb', {
      renderer,
      onProgress: (e) => {
        if (status && e && e.total) status.textContent = `Loading the room ${Math.round((100 * e.loaded) / e.total)}%`;
      },
    });
  } catch (err) {
    document.documentElement.dataset.error = 'load';
    window.__ROOM_STATS__ = { ...window.__ROOM_STATS__, loading: false, error: String(err && err.message ? err.message : err) };
    if (status) status.textContent = `Could not load /_dev/room/room.glb: ${err && err.message ? err.message : err}`;
    console.error(err);
    return;
  }
  loadDone = performance.now();
  scene.add(room.root);
  scene.updateMatrixWorld(true);
  room.useReflection(Q.refl);
  setCurrent(specFor(shotId));
  // compile every program up front (the mirrored passes add clipping variants)
  renderFrame(simTime);
  renderFrame(simTime);
  collectStats(true);
  if (status) status.remove();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document.documentElement.dataset.shot = shotId;
      window.__SKETCH_READY__ = true;
      if (!still) kick();
    }),
  );
}

start();
