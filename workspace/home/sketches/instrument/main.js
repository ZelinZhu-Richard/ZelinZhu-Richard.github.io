// The Instrument, storyboard stills: one still per URL.
// ?shot=<id> picks the frame (point, plate, lift, inside, falsespace, desk,
// object-scale, dissolve, final, final-hover, contact; hero = point),
// &notext=1 hides the type, &finish=0 turns the film pass off (for a
// before/after), &tier=0|1|2 sets its glow levels. Deterministic: seeded
// geometry, no clock; the grain is a fixed hash of the pixel.

import * as THREE from 'three';
import { SHOTS, layoutFor, resolveShot, DEFAULT_SHOT } from './shots.js';
import { LAYERS } from './machine.js';
import { buildWorld } from './world.js';
import { setQuiet } from './stars.js';
import { shared, depthMaterial, makeGroup } from './materials.js';
import { makeCamera } from './camera.js';
import { renderOverlay, textRects, blockRect, convexHull } from './overlay.js';
import { PALETTE, hex } from './palette.js';
import { applySky, skyCamera } from './backdrop.js';
import { ARMILLARY, trainLayout, CRANK, GROUND_Y, ARMS, armAnchor } from './layout.js';
import { createFinish } from './finish.js';

THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(window.location.search);
let requested = params.get('shot');
if (requested === 'hero') requested = 'point';
const shotId = requested && Object.prototype.hasOwnProperty.call(SHOTS, requested) ? requested : DEFAULT_SHOT;
if (params.get('notext') === '1') document.documentElement.classList.add('notext');
document.documentElement.dataset.frame = shotId;

const canvas = document.getElementById('c');
const overlayRoot = document.getElementById('overlay');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
// Colour management is off and the output is linear, so the palette's sRGB
// values reach the canvas unchanged; the sky encodes sRGB itself when it
// sees this linear output (see backdrop.js).
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.autoClear = false;
const finish = createFinish(renderer);
const finishParam = params.get('finish');
const tierParam = params.get('tier');

const SHADOW_SIZE = 2048;
const shadowRT = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, {
  depthBuffer: true,
  depthTexture: new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE),
});
const depthMat = depthMaterial();
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const DEG = Math.PI / 180;
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

const groups = { inst: makeGroup(), desk: makeGroup(), plate: makeGroup() };

function lightDir([az, el]) {
  return new THREE.Vector3(Math.cos(el * DEG) * Math.cos(az * DEG), Math.sin(el * DEG), -Math.cos(el * DEG) * Math.sin(az * DEG)).normalize();
}

let built = null;

function dispose(scene) {
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}

function sceneFor(S) {
  const key = S.id + ':' + S.layout;
  if (built && built.key === key) return built;
  if (built) dispose(built.scene);
  built = { key, ...buildWorld(S, groups) };
  return built;
}

function setLights(S) {
  const L = S.light;
  if (!L) {
    shared.uKeyI.value = 0;
    shared.uFillI.value = 0;
    shared.uAmb.value = 0;
    shared.uRim.value = 0;
    shared.uKeyPoint.value = 0;
    return;
  }
  if (L.lamp) {
    shared.uKeyPoint.value = 1;
    shared.uKeyPos.value.fromArray(S.lamp.filament);
    shared.uSpotDir.value.fromArray(S.lamp.axis).normalize();
    shared.uSpotCos.value.set(Math.cos(L.cone[0] * DEG), Math.cos(L.cone[1] * DEG));
    shared.uKeyRange.value = L.range;
    shared.uKeyDir.value.fromArray(S.lamp.axis).negate().normalize();
  } else {
    shared.uKeyPoint.value = 0;
    shared.uKeyDir.value.copy(lightDir(L.key));
  }
  shared.uKeyI.value = L.keyI;
  shared.uFillDir.value.copy(lightDir(L.fill));
  shared.uFillI.value = L.fillI;
  shared.uAmb.value = L.amb;
  shared.uRim.value = L.rim;
}

// Fill, fog and shadow-side ink colours, and the accent, per shot.
function setPalette(S) {
  const P = S.palette || {};
  const set = (u, h, dflt) => u.value.fromArray(h ? hex(h) : dflt);
  set(shared.uNight, P.night, PALETTE.night);
  set(shared.uStage, P.stage, PALETTE.stage);
  set(shared.uShade, P.shade, PALETTE.muted);
  set(shared.uAccent, S.accentColor, PALETTE.accent);
  const c = shared.uNight.value;
  renderer.setClearColor(new THREE.Color(c.x, c.y, c.z), 1);
}

function setLook(S) {
  const look = S.look;
  shared.uSpacing.value = look.spacing ?? 3.6;
  // near metal (materials.js): off unless the shot asks for it
  const m = look.macro || [-2, -1];
  shared.uMacro.value.set(m[0], m[1]);
  const apply = (g, l, dflt) => {
    const v = l || dflt;
    g.uInkScale.value = v.ink ?? 1;
    g.uDarkScale.value = v.dark ?? 0.7;
    g.uOutline.value = v.outline ?? 1;
    g.uDrop.value = v.drop ?? 0;
    g.uWidthK.value = v.widthK ?? 1;
  };
  apply(groups.inst, look.inst, { ink: 1, dark: 0.7, outline: 1 });
  apply(groups.desk, look.desk, { ink: 1, dark: 0.75, outline: 1 });
  apply(groups.plate, look.plate, { ink: 1, dark: 1, outline: 1 });
}

function shadowPass(scene, S) {
  const sh = S.shadow;
  if (!sh || !S.light) {
    shared.uShadowOn.value = 0;
    return;
  }
  let cam;
  const C = V(sh.center);
  if (sh.from === 'lamp') {
    cam = new THREE.PerspectiveCamera(sh.fov, 1, sh.near ?? 0.6, sh.far ?? 30);
    cam.position.fromArray(S.lamp.filament);
    const d = C.clone().sub(cam.position).normalize();
    if (Math.abs(d.y) > 0.98) cam.up.set(0, 0, -1);
    cam.lookAt(C);
    shared.uShadowBias.value = sh.bias ?? 0.0004;
    shared.uShadowNormal.value = sh.normal ?? 0.05;
  } else {
    const R = sh.radius;
    const L = shared.uKeyDir.value;
    cam = new THREE.OrthographicCamera(-R, R, R, -R, 0.05, R * 4);
    cam.position.copy(C).addScaledVector(L, R * 2);
    if (Math.abs(L.y) > 0.98) cam.up.set(0, 0, -1);
    cam.lookAt(C);
    shared.uShadowBias.value = 0.0007;
    shared.uShadowNormal.value = ((2 * R) / SHADOW_SIZE) * 1.6;
  }
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  cam.layers.set(LAYERS.SOLID);
  scene.overrideMaterial = depthMat;
  renderer.setRenderTarget(shadowRT);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  scene.overrideMaterial = null;
  shared.uShadowMatrix.value.copy(BIAS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  shared.uShadowMap.value = shadowRT.depthTexture;
  shared.uShadowTexel.value = 1 / SHADOW_SIZE;
  shared.uShadowOn.value = 1;
}

function project(p, camera, w, h) {
  const q = V(p).project(camera);
  return { x: (q.x * 0.5 + 0.5) * w, y: (1 - (q.y * 0.5 + 0.5)) * h };
}

function draw() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  const layout = layoutFor(w, h);
  document.documentElement.dataset.layout = layout;
  const S = resolveShot(shotId, layout);
  const { scene, parts } = sceneFor(S);

  const camera = makeCamera(S.cam, w, h);
  for (const k of Object.values(LAYERS)) camera.layers.enable(k);
  const target = V(S.cam.target);
  const camDist = camera.position.distanceTo(target);

  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  shared.uRes.value.copy(buf);
  shared.uDpr.value = buf.x / w;
  finish.setSize(buf.x, buf.y, w, h);
  // a surface's footprint (world units per CSS px) = vDist * uFootK, or
  // uFootK itself for the plate's orthographic view
  if (camera.isPerspectiveCamera) {
    shared.uFootK.value = (2 * Math.tan((camera.fov * DEG) / 2)) / h;
    shared.uFootOrtho.value = 0;
  } else {
    shared.uFootK.value = 1 / S.cam.k;
    shared.uFootOrtho.value = 1;
  }
  shared.uFogNear.value = S.fog[0];
  shared.uFogFar.value = S.fog[1];
  shared.uRefDist.value = camDist;
  setLights(S);
  setLook(S);
  setPalette(S);

  // flat faces of the base hatch with straight lines across the view
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const ac = new THREE.Vector2(fwd.x, fwd.z);
  if (ac.lengthSq() < 1e-6) ac.set(0, 1);
  shared.uAcross.value.copy(ac.normalize());
  for (const m of parts.lineMeshes) m.material.uniforms.uNear.value = camera.near;

  // each sphere's engraving density follows its size on screen
  const tanH = camera.isPerspectiveCamera ? Math.tan((camera.fov * DEG) / 2) : 1;
  if (parts.inst) {
    for (const s of parts.inst.spheres) {
      const c = V(s.center);
      if (parts.inst.group.position.y) c.y += parts.inst.group.position.y;
      const d = c.distanceTo(camera.position);
      const rpx = camera.isPerspectiveCamera ? (s.r / d / tanH) * (h / 2) : s.r * S.cam.k;
      s.material.uniforms.uPatN.value = Math.min(72, Math.max(6, (Math.PI * rpx) / 5.0));
    }
  }

  // type first, so the stars can give way to it
  let labels = null;
  let obstacles = [];
  let polys = [];
  let segs = [];
  const circleAt = (p, r) => {
    const q = project(p, camera, w, h);
    return { x: q.x, y: q.y, r: (r / V(p).distanceTo(camera.position) / tanH) * (h / 2) };
  };
  if (S.world.labels && parts.inst?.anchors.spheres) {
    labels = parts.inst.anchors.spheres.map((a) => {
      const c = circleAt(a.center, a.hoopR);
      const rs = circleAt(a.center, a.r).r;
      return { n: String(a.i + 1).padStart(2, '0'), text: a.label, x: c.x, y: c.y, r: c.r + 2, rs };
    });
    // labels also keep off the armillary and the crank handle, and off the
    // base and the column (screen hulls of their outlines)
    obstacles = [circleAt(ARMILLARY.c, ARMILLARY.rings[0].R)];
    if (parts.inst.anchors.handle) {
      const T = trainLayout(S.state.crank || 0);
      obstacles.push(circleAt([T.handle[0], CRANK.armY + 0.2, T.handle[2]], 0.3));
    }
    polys = instrumentHulls((p) => project(p, camera, w, h));
    segs = armSegments(S.state.arms, (p) => project(p, camera, w, h));
  }
  let callouts = null;
  if (parts.plate && S.world.plate === 'plate') {
    callouts = parts.plate.anchors.callouts.map((c) => {
      const q = project(c.at, camera, w, h);
      return { text: c.text, x: q.x, y: q.y, align: c.align, hand: c.hand };
    });
  }
  renderOverlay(overlayRoot, shotId, layout, { labels, callouts, obstacles, polys, segs });
  setQuiet(textRects(overlayRoot), w, h, buf.x / w);

  if (S.light) shadowPass(scene, S);
  else shared.uShadowOn.value = 0;
  if (S.sky) {
    // the sky, through its own wider camera, into its own target
    const skyCam = skyCamera(S, w, h);
    const skyScene = applySky(S, skyCam, w, h, blockRect(overlayRoot));
    renderer.setRenderTarget(finish.skyRT);
    renderer.render(skyScene, skyCam);
  }
  // the scene in one render call, over a transparent clear; finish.js lays
  // it over the sky (or the night colour) and adds the film finish
  const night = shared.uNight.value;
  const clear = new THREE.Color(night.x, night.y, night.z);
  renderer.setRenderTarget(finish.sceneRT);
  renderer.setClearColor(clear, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  renderer.setClearColor(clear, 1);
  const labelRects = labels ? [...overlayRoot.querySelectorAll('.label')].map((el) => {
    const b = el.getBoundingClientRect();
    return [b.left, b.top, b.right, b.bottom];
  }) : [];
  finish.compose({
    ...S.finish,
    ...(finishParam === '0' ? { on: 0 } : {}),
    tier: tierParam !== null ? Number(tierParam) : S.finish.tier ?? (layout === 'port' ? 1 : 2),
    hasSky: !!S.sky,
    bg: [night.x, night.y, night.z],
    quiet: labelRects,
    dpr: buf.x / w,
  });
  renderer.setRenderTarget(null);
}

// Each arm on screen (CSS px), as segments the labels keep off: the rod
// from the column to the knuckle, the stem up to the sphere.
function armSegments(arms, prj) {
  const out = [];
  ARMS.forEach((arm, i) => {
    const A = armAnchor(i, arms[i]);
    const P = [[0, arm.h, 0], A.end, [A.end[0], arm.h + arm.stem, A.end[2]]].map((p) => {
      const q = prj(p);
      return [q.x, q.y];
    });
    out.push([P[0], P[1]], [P[1], P[2]]);
  });
  return out;
}

// Screen hulls (CSS px) of the base and of the column, for the labels.
function instrumentHulls(prj) {
  const base = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    for (const [r, y] of [[2.62, -0.47], [2.5, 0.06], [2.44, GROUND_Y]]) {
      const q = prj([r * Math.cos(a), y, -r * Math.sin(a)]);
      base.push([q.x, q.y]);
    }
  }
  const col = [];
  for (const y of [0.1, 2.45]) for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) {
    const q = prj([x, y, z]);
    col.push([q.x, q.y]);
  }
  return [convexHull(base), convexHull(col)];
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(draw, 120);
});

async function start() {
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch (e) {
    /* system fonts; carry on */
  }
  draw();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.dataset.shot = params.get('shot') === 'hero' ? 'hero' : shotId;
      window.__SKETCH_READY__ = true;
    });
  });
}

start();
