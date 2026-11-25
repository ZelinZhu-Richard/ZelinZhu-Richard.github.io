// Sky test page: one still per URL.
//   ?shot=space|window|both|nebula|text|plain   (default: space)
//   &notext=1   hide the type (the quiet zone stays, so the sky is identical)
//   &tier=0..3  noise tier (default: 1 on the phone layout, 2 otherwise)
//   &t=<sec>    time for aurora drift and twinkle (default 0)
// No animation loop: the same URL always draws the same frame. A resize redraws.

import * as THREE from 'three';
import { createSky } from './sky.js';
import { SHOT_IDS, DEFAULT_SHOT, layoutFor, makeCamera, applyShot, instrumentPlacement, textBox, boxToNdc, hasInstrument, hasText } from './shots.js';

const params = new URLSearchParams(window.location.search);
const requested = params.get('shot');
const shotId = SHOT_IDS.includes(requested) ? requested : DEFAULT_SHOT;
const noText = params.get('notext') === '1';
const tierNum = Number(params.get('tier'));
const tierParam = params.has('tier') && Number.isFinite(tierNum) ? tierNum : null;
const time = Number(params.get('t')) || 0;

const canvas = document.getElementById('scene');
const copy = document.getElementById('copy');
if (noText) copy.classList.add('hidden');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.autoClear = false;
renderer.setClearColor(new THREE.Color('#100f15'), 1);

const scene = new THREE.Scene();
const sky = createSky({ seed: 7, tier: 2 });
scene.add(sky.object3D);
window.__sky = sky; // for poking at uniforms from the console

// ---- placeholder instrument: ink rings drawn in an overlay pass, in NDC-y units
const overlay = new THREE.Scene();
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
const inkMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#ece9e1'), toneMapped: false });
const mutedMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#a8a398'), toneMapped: false });

function ring(rx, ry, rot, mat, n = 360) {
  const pts = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    pts.push(x * c - y * s, x * s + y * c, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineLoop(g, mat);
}

function segment(x0, y0, x1, y1, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, 0, x1, y1, 0], 3));
  return new THREE.LineSegments(g, mat);
}

const instrument = new THREE.Group();
instrument.add(ring(1, 1, 0, inkMat));
instrument.add(ring(0.64, 0.64, 0, mutedMat));
instrument.add(ring(0.985, 0.3, 0.32, inkMat));
instrument.add(ring(0.9, 0.52, -0.55, mutedMat));
instrument.add(ring(0.07, 0.07, 0, inkMat));
const ax = Math.cos(1.25);
const ay = Math.sin(1.25);
instrument.add(segment(-1.14 * ax, -1.14 * ay, 1.14 * ax, 1.14 * ay, mutedMat));
overlay.add(instrument);

// ---- sample text ('text' shot); returns the quiet-zone rect in NDC
function renderText(layout, w, h) {
  copy.replaceChildren();
  copy.dataset.layout = layout;
  if (!hasText(shotId)) return null;
  const box = textBox(layout);
  const el = document.createElement('div');
  el.className = 'blk text-block';
  el.style.left = `${box.left * 100}%`;
  el.style.top = `${box.top * 100}%`;
  el.style.width = `${box.width * 100}%`;
  const label = document.createElement('p');
  label.className = 't-label';
  label.textContent = '17 / 20 · Real space';
  const head = document.createElement('h1');
  head.className = 't-heading';
  head.textContent = 'Explore the work.';
  const ital = document.createElement('p');
  ital.className = 't-italic';
  ital.textContent = 'Follow the curiosity.';
  el.append(label, head, ital);
  copy.append(el);
  // measure the real block (visibility:hidden still lays out under notext)
  const r = el.getBoundingClientRect();
  let right = r.left;
  for (const child of el.children) {
    const range = document.createRange();
    range.selectNodeContents(child);
    right = Math.max(right, range.getBoundingClientRect().right);
  }
  return boxToNdc({ left: r.left / w, top: r.top / h, width: (right - r.left) / w, height: r.height / h }, w, h, 30);
}

function draw() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  const layout = layoutFor(w, h);
  sky.setTier(tierParam ?? (layout === 'portrait' ? 1 : 2));

  const camera = makeCamera(shotId, layout, w, h);
  applyShot(sky, shotId, layout, camera);
  sky.setTime(time);
  const quiet = renderText(layout, w, h);
  if (quiet) sky.setQuietZone(quiet, 1);

  renderer.clear();
  renderer.render(scene, camera);

  if (hasInstrument(shotId)) {
    const aspect = w / h;
    orthoCam.left = -aspect;
    orthoCam.right = aspect;
    orthoCam.top = 1;
    orthoCam.bottom = -1;
    orthoCam.updateProjectionMatrix();
    const p = instrumentPlacement(layout, w, h);
    instrument.position.set(p.x * aspect, p.y, 0);
    instrument.scale.setScalar(p.r);
    renderer.render(overlay, orthoCam);
  }
  document.documentElement.dataset.layout = layout;
  document.documentElement.dataset.tier = String(sky.tier);
}

function ready() {
  document.documentElement.dataset.shot = shotId;
  window.__SKETCH_READY__ = true;
}

async function start() {
  // the type is local system fonts; wait so the text box measures correctly
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* fonts API unavailable: measure anyway */
  }
  draw();
  requestAnimationFrame(() => requestAnimationFrame(ready));

  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(draw, 120);
  });
}

start();
