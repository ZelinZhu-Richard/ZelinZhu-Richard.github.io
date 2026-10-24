// Animation helpers. Every sequence checks reduced motion first and resolves at once when
// it is on, because the global reduced-motion rule stops animationend from firing.
export function reduced() {
  if (document.documentElement.dataset.motion === 'reduce') return true;
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Adds a class for one run; removes it after the animation (or a timeout fallback).
export function playOnce(el, className, ms = 900) {
  if (!el || reduced()) return Promise.resolve();
  el.classList.remove(className);
  void el.getBoundingClientRect();
  el.classList.add(className);
  return new Promise(resolve => {
    const done = () => { el.classList.remove(className); resolve(); };
    setTimeout(done, ms);
  });
}

function layer() {
  let el = document.querySelector('.orb-layer');
  if (!el) {
    el = document.createElement('div');
    el.className = 'orb-layer';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
  }
  return el;
}

// Food orbs fly in an arc from one element to another (CONTENT.md §I.2, 650 ms).
export function flyOrbs(from, to, count, color = '#dfccff', ms = 650) {
  if (!from || !to || reduced() || typeof Element.prototype.animate !== 'function') return Promise.resolve();
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const sx = a.left + a.width / 2, sy = a.top + a.height / 2;
  const ex = b.left + b.width / 2, ey = b.top + b.height / 2;
  const host = layer();
  const flights = [];
  for (let i = 0; i < count; i += 1) {
    const orb = document.createElement('span');
    orb.className = 'orb';
    orb.style.background = color;
    host.append(orb);
    const lift = 70 + (i % 4) * 22;
    const jitter = (i - count / 2) * 6;
    const mx = (sx + ex) / 2 + jitter, my = Math.min(sy, ey) - lift;
    const anim = orb.animate([
      { transform: `translate(${sx}px, ${sy}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${sx + jitter}px, ${sy - 10}px) scale(1)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${ex}px, ${ey}px) scale(.5)`, opacity: 0.2 },
    ], { duration: ms, delay: i * 28, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' });
    flights.push(anim.finished.catch(() => {}).then(() => orb.remove()));
  }
  return Promise.all(flights);
}

// Rolls a number up or down ("+120 food").
export function countTo(el, from, to, ms = 600) {
  if (!el) return Promise.resolve();
  const format = n => Math.round(n).toLocaleString('en-US');
  if (reduced() || from === to) { el.textContent = format(to); return Promise.resolve(); }
  return new Promise(resolve => {
    const start = performance.now();
    const step = t => {
      const k = Math.min(1, (t - start) / ms);
      el.textContent = format(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

// Adds an SVG trigger class (pets.css: pet--bounce, pet--eat, pet--levelup, pet--cheer, egg--shake, egg--crack).
export function petMotion(container, className, ms = 1200) {
  const svg = container?.querySelector('svg');
  return playOnce(svg, className, ms);
}
