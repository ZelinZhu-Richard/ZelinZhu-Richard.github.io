// The engine harness: the real createHomeScene() on a tall scrolling page (scroll is the
// story, as on the homepage), with URL switches for jumps, stills, tiers and single acts,
// and the lazy debug readout. See index.html for the switches.
import { createHomeScene } from '/engine/index.js';
import { SECTIONS, U_MAX, progressToU, totalVh, uToProgress } from '/engine/timeline/schedule.js';

const q = new URLSearchParams(location.search);
const num = (/** @type {string} */ k) => {
  const v = q.get(k);
  return v === null || v.trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
};
const flag = (/** @type {string} */ k) => q.has(k) && q.get(k) !== '0';

const still = flag('still');
const u0 = Math.min(U_MAX, Math.max(0, num('u') ?? 0));
const tier = num('tier');
const act = q.get('act') || null;
const mode = q.get('mode') === 'contact' ? 'contact' : 'story';
const quality = ['auto', 'high', 'medium', 'low'].includes(q.get('quality') || '') ? /** @type {any} */ (q.get('quality')) : 'auto';
const reducedMotion = flag('nomotion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const panelOn = !flag('notext') && q.get('panel') !== '0';
// the page lands where ?u says, not where the last visit was scrolled to
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (flag('notext')) document.documentElement.classList.add('notext');
if (still) document.documentElement.classList.add('still');

// the seven stones (content.mjs order; the harness has no Nuxt content build)
const STONES = [
  ['about', 'About', 'Who I am, CV, contact, stars'],
  ['projects', 'Projects', ''],
  ['research', 'Research', ''],
  ['art', 'Art', ''],
  ['fun', 'Fun', ''],
  ['blog', 'Blog', ''],
  ['daily', 'Daily', ''],
].map(([id, title, subtitle]) => ({ id, title, subtitle, href: `/${id}/` }));

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('scene'));
const status = /** @type {HTMLElement} */ (document.getElementById('status'));
const sound = /** @type {HTMLButtonElement} */ (document.getElementById('sound'));
const track = /** @type {HTMLElement} */ (document.getElementById('track'));

// the page contract (engine/timeline/schedule.js): the scroll range is totalVh() viewports
track.style.height = `calc(${totalVh()}vh + 100vh)`;
const range = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
const progressOfScroll = () => Math.min(1, Math.max(0, scrollY / range()));

const scene = createHomeScene({
  canvas, mode, stones: STONES, assetsBase: '/public/home-assets/', quality, reducedMotion, still,
  debug: { tier: tier === null ? null : tier, act },
});
Object.defineProperty(window, '__scene', { value: scene, configurable: true });

scene.setProgress(uToProgress(u0));
if (!still) {
  // land on u0, then let the scroll drive
  requestAnimationFrame(() => {
    scrollTo(0, uToProgress(u0) * range());
    addEventListener('scroll', () => scene.setProgress(progressOfScroll()), { passive: true });
  });
}
addEventListener('pointermove', (e) => scene.setPointer(e.clientX, e.clientY), { passive: true });
document.addEventListener('visibilitychange', () => (document.hidden ? scene.pause() : scene.resume()));
sound.addEventListener('click', () => {
  const on = sound.getAttribute('aria-pressed') !== 'true';
  sound.setAttribute('aria-pressed', on ? 'true' : 'false');
  scene.setSound(on);
});
scene.on('stone:enter', ({ id }) => {
  canvas.style.cursor = 'pointer';
  scene.playHover();
  status.textContent = id;
});
scene.on('stone:leave', () => {
  canvas.style.cursor = '';
  status.textContent = '';
});
scene.on('stone:click', async ({ id, href }) => {
  status.textContent = `release ${id}`;
  await scene.release(id);
  status.textContent = `would open ${href}`;
});
scene.on('tier', ({ tier: t, reason }) => console.info(`[harness] tier ${t} (${reason})`));
scene.on('contextlost', () => (status.textContent = 'context lost'));

// ?labels=1: the stones' labels from 'stones:screen', placed by the app's own code. Listens
// before load(), since the engine reports only when the positions change.
if (flag('labels')) {
  const { createStoneLabels } = await import('./labels.js');
  Object.defineProperty(window, '__labels', { value: createStoneLabels({ scene, stones: STONES, canvas, top: num('labeltop') ?? 0 }), configurable: true });
}

/** @param {number} u */
function jump(u) {
  const p = uToProgress(u);
  if (still) scene.setProgress(p);
  else scrollTo(0, p * range());
}
addEventListener('keydown', (e) => {
  const u = progressToU(still ? scene.stats().progress : progressOfScroll());
  if (e.key === ']') jump(Math.floor(u + 1e-6) + 1);
  else if (e.key === '[') jump(Math.max(0, Math.ceil(u - 1e-6) - 1));
});

const t0 = performance.now();
try {
  await scene.load((f) => {
    status.textContent = `loading ${Math.round(f * 100)} %`;
  });
} catch (error) {
  status.textContent = `failed: ${error && error.message ? error.message : error}`;
  throw error;
}
status.textContent = '';
console.info(`[harness] ready in ${Math.round(performance.now() - t0)} ms`, scene.stats());

if (panelOn) {
  const { createDebugPanel } = await import('/engine/debug/panel.js');
  const panel = createDebugPanel({ scene, sections: SECTIONS, uMax: U_MAX, onScrub: jump });
  addEventListener('keydown', (e) => {
    if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      panel.element.toggleAttribute('data-collapsed');
    }
  });
}

if (still) {
  // ready once every act in the frame is loaded and the frame drawn with them
  let tries = 0;
  const check = () => {
    const e = scene.stats().engine;
    if (e && e.settled) {
      document.documentElement.dataset.u = String(u0);
      /** @type {any} */ (window).__SKETCH_READY__ = true;
      return;
    }
    if (++tries < 1800) requestAnimationFrame(check);
    else status.textContent = 'still frame did not settle';
  };
  requestAnimationFrame(check);
}
