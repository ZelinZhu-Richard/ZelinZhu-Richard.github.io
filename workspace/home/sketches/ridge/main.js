// Entry: read ?shot= and &notext=1, build the still for this window, draw it
// once, then raise the ready flag. No animation loop: the same URL always
// draws the same frame. A resize redraws (and may switch layout).

import * as THREE from 'three';
import { SHOT_IDS, layoutFor } from './shots.js';
import { buildShot, disposeShot } from './scene.js';
import { renderText } from './text.js';

const params = new URLSearchParams(window.location.search);
const requested = params.get('shot');
const shotId = SHOT_IDS.includes(requested) ? requested : 'hero';
const noText = params.get('notext') === '1';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('copy');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.autoClear = true;

let current = null;

function draw() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());

  disposeShot(current);
  current = buildShot(shotId, layoutFor(w, h), w, h, buffer.x / w);
  current.shared.uRes.value.copy(buffer);

  const rects = renderText(overlay, current, { w, h, bufferW: buffer.x, bufferH: buffer.y, noText });
  current.setQuiet(rects);
  renderer.render(current.scene, current.camera);
}

function ready() {
  document.documentElement.dataset.shot = shotId;
  window.__SKETCH_READY__ = true;
}

async function start() {
  // the type is local system fonts; wait so text boxes measure correctly
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
