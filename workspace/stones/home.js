// Phoenix homepage, seven stones:
// - click a stone: a small popup with the short version of that part (the stone sets #to-<part>)
// - hold the pointer on a stone for 1.5 s: a ring fills around the pointer, then the scene fades
//   to night and that part's page opens.
const PANELS = __PANELS__;
const HOLD_MS = 1500;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const num = i => String(i + 1).padStart(2, '0');
let popup, lastFocus, closeTimer, leaving = false;
let hovered = null;      // the stone under the pointer, kept even while the popup is open
let suppressUntil = 0;   // a click that only closes the popup must not open another one

/* ---------- hand-off to the dark page ---------- */
function travel(part) {
  if (leaving) return;
  leaving = true;
  cancelHold();
  closePopup(true);
  try { sessionStorage.setItem('stone-arrive', part.id); } catch { /* optional */ }
  const veil = document.createElement('div');
  veil.className = 'stone-veil';
  veil.setAttribute('aria-hidden', 'true');
  const line = document.createElement('p');
  const count = document.createElement('span');
  count.textContent = `${num(PANELS.indexOf(part))} / 07`;
  line.append(count, part.title);
  veil.append(line);
  document.body.append(veil);
  veil.getBoundingClientRect(); // commit the transparent start so the fade runs
  veil.classList.add('is-on');
  setTimeout(() => location.assign(part.href), reduce.matches ? 0 : 700);
}
window.addEventListener('pageshow', () => { leaving = false; document.querySelector('.stone-veil')?.remove(); });

/* ---------- click: small popup ---------- */
function buildPopup() {
  const root = document.createElement('section');
  root.className = 'stone-pop';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'sp-title');
  root.tabIndex = -1;
  document.body.append(root);
  root.addEventListener('click', event => {
    if (event.target.closest('[data-close]')) { event.preventDefault(); closePopup(); return; }
    const go = event.target.closest('[data-travel]');
    if (go) { event.preventDefault(); travel(PANELS.find(p => p.id === go.dataset.travel)); return; }
    const tab = event.target.closest('[data-part]');
    if (tab) { event.preventDefault(); openPopup(tab.dataset.part, { replace: true }); }
  });
  for (const type of ['wheel', 'touchmove']) root.addEventListener(type, event => event.stopPropagation(), { passive: true });
  root.addEventListener('keydown', event => {
    event.stopPropagation(); // the scene listens for keys too
    if (event.key === 'Escape') { event.preventDefault(); closePopup(); }
  });
  // A click on the scene outside the popup only closes it, even when it lands on another stone.
  document.addEventListener('pointerdown', event => {
    if (isOpen() && !root.contains(event.target)) {
      suppressUntil = performance.now() + 700;
      closePopup();
    }
  }, true);
  return root;
}

function renderPopup(index) {
  const p = PANELS[index];
  const next = PANELS[(index + 1) % PANELS.length];
  popup.innerHTML = `<header class="sp-top"><span>Stone ${num(index)} / 07</span><button type="button" class="sp-close" data-close aria-label="Close">✕</button></header>
<div class="sp-body"><h2 id="sp-title">${p.title}</h2><p class="sp-lede">${p.lede}</p>${p.html}</div>
<footer class="sp-foot"><a class="sp-full" href="${p.href}" data-travel="${p.id}">Open the ${p.title} page →</a><a class="sp-next" href="#to-${next.id}" data-part="${next.id}">Next: ${next.title}</a></footer>
<p class="sp-tip">Tip: hold the pointer on a stone for 1.5 seconds to go straight to its page.</p>`;
  popup.scrollTop = 0;
}

const isOpen = () => !!popup && popup.classList.contains('is-open');

function openPopup(id, { replace = false } = {}) {
  const index = PANELS.findIndex(p => p.id === id);
  if (index < 0 || leaving) return;
  cancelHold();
  popup ||= buildPopup();
  clearTimeout(closeTimer); // a reopen during the closing fade must win over the pending hide
  if (!isOpen()) {
    if (popup.hidden) lastFocus = document.activeElement;
    popup.hidden = false;
    popup.getBoundingClientRect();
    popup.classList.add('is-open');
  }
  if (replace) history.replaceState(history.state, '', `#to-${id}`);
  renderPopup(index);
  popup.focus({ preventScroll: true });
}

function clearHash() {
  if (location.hash.startsWith('#to-')) history.replaceState(history.state, '', location.pathname + location.search);
}

function closePopup(silent = false) {
  clearHash();
  if (!isOpen()) return;
  popup.classList.remove('is-open');
  clearTimeout(closeTimer);
  const done = () => {
    if (isOpen()) return; // reopened meanwhile
    popup.hidden = true;
    if (!silent) lastFocus?.focus?.({ preventScroll: true });
  };
  if (silent || reduce.matches) done(); else closeTimer = setTimeout(done, 220);
}

function syncHash() {
  const id = location.hash.startsWith('#to-') ? location.hash.slice(4) : '';
  if (id && performance.now() < suppressUntil) { clearHash(); return; }
  if (id) openPopup(id); else closePopup();
}
window.addEventListener('hashchange', syncHash);
syncHash();

/* ---------- hover: 2-second ring ---------- */
const ring = document.createElement('div');
ring.className = 'stone-ring';
ring.setAttribute('aria-hidden', 'true');
ring.innerHTML = '<i class="track"></i><i class="arc"></i><span></span>';
const label = ring.querySelector('span');
let pointer = { x: -200, y: -200 }, hold = null;
// While the page scrolls, stones slide past a resting pointer and the scene reports brief hovers.
// Only a deliberate rest counts: no ring until scrolling has been still for SETTLE_MS.
const SETTLE_MS = 350;
let lastScroll = -Infinity, settleTimer;
const scrolling = () => performance.now() - lastScroll < SETTLE_MS;
function onScroll() {
  lastScroll = performance.now();
  cancelHold();
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { if (hovered && !hold && !isOpen() && !leaving) startHold(hovered); }, SETTLE_MS);
}
for (const type of ['scroll', 'wheel', 'touchmove']) window.addEventListener(type, onScroll, { passive: true, capture: true });
window.addEventListener('keydown', event => {
  if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) onScroll();
}, true);

window.addEventListener('pointermove', event => {
  pointer = { x: event.clientX, y: event.clientY };
  ring.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;
  // Still on a stone after the popup closed: moving the pointer starts the hold again.
  if (hovered && !hold && !isOpen() && !leaving) startHold(hovered);
}, { passive: true });

function startHold(part) {
  if (leaving || isOpen() || scrolling() || hold?.part === part) return;
  cancelHold();
  if (!ring.isConnected) document.body.append(ring);
  label.textContent = `Hold · ${part.title}`;
  // Each stone has its own colour family; the arc runs from deep at the start to near-white at its head.
  const [c0, c1, c2, c3, c4] = part.ring;
  ring.style.setProperty('--ring', `conic-gradient(from 0deg, ${c0} 0turn, ${c1} .25turn, ${c2} .5turn, ${c3} .75turn, ${c4} 1turn)`);
  ring.style.setProperty('--ring-mid', c2);
  ring.style.setProperty('--p', '0');
  ring.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;
  ring.classList.add('is-on');
  const start = performance.now();
  hold = { part, timer: setTimeout(() => { const p = hold?.part; cancelHold(); if (p) travel(p); }, HOLD_MS) };
  const tick = now => {
    if (!hold || hold.part !== part) return;
    ring.style.setProperty('--p', Math.min(1, (now - start) / HOLD_MS).toFixed(4));
    hold.frame = requestAnimationFrame(tick);
  };
  hold.frame = requestAnimationFrame(tick);
}

function cancelHold() {
  if (!hold) return;
  clearTimeout(hold.timer);
  cancelAnimationFrame(hold.frame);
  hold = null;
  ring.classList.remove('is-on');
  ring.style.setProperty('--p', '0');
}

// The scene keeps hover state in its Pinia store ("sceneId"): setCursorHoverCase(true, 'crystalN')
// when the pointer is on stone N, (false, '') when it leaves. Listen to it without touching the bundle.
function hookStore(tries = 0) {
  const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config?.globalProperties?.$pinia;
  const store = pinia?._s?.get('sceneId');
  if (!store) { if (tries < 120) setTimeout(() => hookStore(tries + 1), 500); return; }
  store.$onAction(({ name, args }) => {
    if (name === 'toCase') {
      // A click on a stone. Open its popup from here too, so a stale #to- hash can never swallow it.
      cancelHold();
      if (hovered && performance.now() >= suppressUntil) openPopup(hovered.id);
      return;
    }
    if (name !== 'setCursorHoverCase') return;
    const [on, id] = args;
    const index = on && /^crystal\d$/.test(id) ? Number(id.slice(7)) : -1;
    hovered = index >= 0 ? PANELS[index] || null : null;
    if (hovered) startHold(hovered); else cancelHold();
  });
}
hookStore();
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelHold(); });

/* ---------- the seven-stone menu, replacing the captured page list ---------- */
const menu = document.createElement('nav');
menu.className = 'home-stones';
menu.setAttribute('aria-label', 'Main navigation');
const toggle = document.createElement('button');
toggle.type = 'button';
toggle.textContent = 'Menu';
toggle.setAttribute('aria-expanded', 'false');
menu.append(toggle);
PANELS.forEach((part, i) => {
  const a = document.createElement('a');
  a.href = part.href;
  const n = document.createElement('span');
  n.textContent = num(i);
  a.append(n, part.title);
  a.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return; // new tab etc. stays native
    event.preventDefault();
    travel(part);
  });
  menu.append(a);
});
toggle.addEventListener('click', () => {
  const open = !menu.classList.contains('is-open');
  menu.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Close' : 'Menu';
});
for (const type of ['pointerdown', 'wheel', 'keydown']) menu.addEventListener(type, event => event.stopPropagation());
document.body.append(menu);

// Blend with the scene: hidden while it loads, then the same ink as its header, white on dark sections.
function syncMenu(state) {
  menu.classList.toggle('is-ready', !!state.sceneLoaded);
  menu.classList.toggle('is-dark', state.sectionColor === 'dark');
}
function watchScene(tries = 0) {
  const store = document.querySelector('#__nuxt')?.__vue_app__?.config?.globalProperties?.$pinia?._s?.get('sceneId');
  if (!store) {
    if (tries < 60) setTimeout(() => watchScene(tries + 1), 250);
    else menu.classList.add('is-ready'); // no scene runtime: show the menu anyway
    return;
  }
  syncMenu(store.$state);
  store.$subscribe((_, state) => syncMenu(state));
}
watchScene();
// If the 3D scene never finishes loading (no WebGL, say), the menu must still appear.
setTimeout(() => menu.classList.add('is-ready'), 20000);
