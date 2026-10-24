import { OceanEngine } from './vendor/index.js';

const canvas = document.querySelector('#ascii-sharks-background');
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const storageKey = 'portfolio.sharks.paused';
let engine;
let paused = false;
let observer;

try { paused = localStorage.getItem(storageKey) === 'true'; } catch { /* Storage is optional. */ }

const button = document.createElement('button');
button.type = 'button';
button.className = 'sharks-toggle';
button.hidden = true;
button.setAttribute('aria-controls', 'ascii-sharks-background');
const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
icon.setAttribute('viewBox', '0 0 12 12');
icon.setAttribute('aria-hidden', 'true');
const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
icon.append(path);
const label = document.createElement('span');
button.append(icon, label);

function mediaActive() {
  return [...document.querySelectorAll('video')].some(video =>
    !video.paused && !video.ended ||
    video.srcObject?.getTracks?.().some(track => track.readyState === 'live')
  );
}

function sync() {
  if (!engine) return;
  const busy = mediaActive();
  if (paused || document.hidden || busy) engine.pause();
  else engine.resume();
  label.textContent = paused ? 'Play sharks' : 'Pause sharks';
  path.setAttribute('d', paused ? 'M3 1.5 10 6 3 10.5Z' : 'M2 1h3v10H2zm5 0h3v10H7z');
  button.hidden = preference.matches || busy;
}

function start() {
  if (!canvas || engine) return;
  try {
    const mobile = window.innerWidth < 700;
    engine = new OceanEngine(canvas, mobile ? [
      { kind: 'hammerhead', size: .85 }, { kind: 'classic', size: .65 },
    ] : [
      { kind: 'hammerhead', size: 1 }, { kind: 'classic', size: .78 },
      { kind: 'mako', size: .65 },
    ], mobile ? 85 : 150);
    document.body.append(button);
    sync();
    observer = new MutationObserver(sync);
    // Camera tools change their visible state when streams start/stop.
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-state', 'class'] });
  } catch (error) {
    engine?.destroy();
    engine = undefined;
    button.remove();
    // Canvas availability never gates navigation or page content.
    console.warn('ASCII shark background unavailable:', error);
  }
}

function stop() {
  observer?.disconnect();
  engine?.destroy();
  engine = undefined;
  button.remove();
}

button.addEventListener('click', () => {
  paused = !paused;
  try { localStorage.setItem(storageKey, String(paused)); } catch { /* Storage is optional. */ }
  sync();
});
document.addEventListener('visibilitychange', sync);
for (const event of ['play', 'pause', 'ended', 'loadedmetadata', 'emptied']) {
  document.addEventListener(event, sync, true);
}
preference.addEventListener('change', sync);
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', start);
start();
