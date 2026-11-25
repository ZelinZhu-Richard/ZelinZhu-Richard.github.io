// A. Forking Paths: one still per URL. ?shot=<id>&notext=1

import * as THREE from 'three';
import { composeShot } from './compose.js';
import { SHOTS } from './shots.js';
import { buildRibbons, buildDots, buildComposite } from './ink.js';

const params = new URLSearchParams(window.location.search);
const requested = params.get('shot');
const shotId = requested && Object.prototype.hasOwnProperty.call(SHOTS, requested) ? requested : 'hero';
const noText = params.get('notext') === '1';

const canvas = document.getElementById('scene');
const overlay = document.getElementById('overlay');
overlay.hidden = noText;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.autoClear = false;

const floatTargets = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');

let rt = null;
let post = null;
let live = [];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function typeScale(W, H, layout) {
  return layout === 'portrait' ? clamp(W / 390, 0.85, 1.35) : clamp(Math.min(W / 1440, H / 900), 0.6, 1.5);
}

function placeText(out) {
  overlay.textContent = '';
  if (noText) return;
  const s = typeScale(out.W, out.H, out.layout);
  for (const b of out.text) {
    const el = document.createElement('div');
    el.className = `t ${b.cls}`;
    el.innerHTML = b.html; // static strings from shots.js
    el.style.left = `${(b.x * out.W).toFixed(1)}px`;
    el.style.top = `${(b.y * out.H).toFixed(1)}px`;
    el.style.fontSize = `${(b.size * s).toFixed(2)}px`;
    if (b.width) el.style.width = `${(b.width * s).toFixed(0)}px`;
    el.style.transform = `translate(${-b.anchor[0] * 100}%, ${-b.anchor[1] * 100}%)`;
    overlay.appendChild(el);
  }
  for (const l of out.labels) {
    const el = document.createElement('div');
    el.className = `t label mono ${l.align}${l.stack ? ' stack' : ''}`;
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = l.num;
    const name = document.createElement('span');
    name.textContent = l.name;
    el.append(num, name);
    el.style.left = `${l.x.toFixed(1)}px`;
    el.style.top = `${l.y.toFixed(1)}px`;
    el.style.fontSize = `${l.fs.toFixed(2)}px`;
    const tx = l.align === 'right' ? -100 : l.align === 'center' ? -50 : 0;
    const ty = l.vert === 'bottom' ? -100 : l.vert === 'top' ? 0 : -50;
    el.style.transform = `translate(${tx}%, ${ty}%)`;
    overlay.appendChild(el);
  }
}

function render() {
  const W = Math.max(1, window.innerWidth);
  const H = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const res = [size.x, size.y];

  const out = composeShot(shotId, W, H);
  const ribbons = buildRibbons(out, dpr, res);
  const stars = buildDots(
    out.dots.filter((d) => d.layer === 0),
    dpr,
    res,
    0,
  );
  const front = buildDots(
    out.dots.filter((d) => d.layer !== 0),
    dpr,
    res,
    2,
  );
  const scene = new THREE.Scene();
  scene.add(stars, ribbons.mesh, front);

  if (!rt || rt.width !== res[0] || rt.height !== res[1]) {
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(res[0], res[1], {
      type: floatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    if (post) {
      post.mesh.geometry.dispose();
      post.mesh.material.dispose();
    }
    post = buildComposite(rt.texture, res);
  }

  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, false, false);
  renderer.render(scene, out.cam);
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, false, false);
  renderer.render(post.scene, post.camera);

  for (const m of live) {
    m.geometry.dispose();
    m.material.dispose();
  }
  live = [stars, ribbons.mesh, front];
  placeText(out);
  window.__SKETCH_STATS__ = { shot: shotId, layout: out.layout, triangles: Math.round(ribbons.triangles), dpr, floatTargets };
}

async function start() {
  const t0 = performance.now();
  try {
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
  } catch (e) {
    // fonts are local system fonts; nothing to wait for
  }
  render();
  window.__SKETCH_STATS__.ms = Math.round(performance.now() - t0);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document.documentElement.dataset.shot = shotId;
      window.__SKETCH_READY__ = true;
    }),
  );
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });
}

start();
