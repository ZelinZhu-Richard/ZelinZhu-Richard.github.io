// Hero line on the phoenix homepage. The page opens on "Build. Learn. and repeat."; after a beat the
// letters break into sand that settles into a thin line, and the line rises, grain by grain, into
// "Agency, and I’ll bring the snacks." Written for this site in the spirit of Canvas UI's Particle Scroll
// (no code from it is used). Plain 2D canvas, no dependencies.

export const LEAD = 'Agency,';
export const REST = 'and I’ll bring the snacks.';
export const LABEL = `${LEAD} ${REST}`;

// Milliseconds. Each grain falls for `fall` and rises for `riseLen`; grains further right start later.
export const TIMING = { hold: 1500, fall: 750, fallStagger: 550, rise: 1400, riseLen: 850, riseStagger: 550, fade: 220 };
export const DURATION = TIMING.rise + TIMING.riseStagger + TIMING.riseLen;

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeIn = t => t * t * t;
export const easeOut = t => 1 - (1 - t) ** 3;

// Match source grains to target grains by horizontal rank, so each grain mostly travels straight down
// into the line and straight up out of it. The line spans both texts, one slot per grain, left to right.
export function pair(source, target, lineY, random = Math.random) {
  const n = Math.max(source.length, target.length);
  if (!n || !source.length || !target.length) return [];
  const a = [...source].sort((p, q) => p.x - q.x || p.y - q.y);
  const b = [...target].sort((p, q) => p.x - q.x || p.y - q.y);
  const at = (list, i) => list[Math.min(list.length - 1, Math.floor((i * list.length) / n))];
  const xs = [...a, ...b].map(p => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), span = Math.max(1, x1 - x0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = at(a, i), e = at(b, i), j = random();
    out.push({
      sx: s.x, sy: s.y,
      lx: x0 + (span * i) / Math.max(1, n - 1), ly: lineY + (j - 0.5) * 1.6,
      ex: e.x, ey: e.y,
      ua: (s.x - x0) / span, ub: (e.x - x0) / span, j,
    });
  }
  return out;
}

// Where a grain is `t` ms into the morph.
export function place(g, t) {
  const f = easeIn(clamp01((t - TIMING.fallStagger * g.ua) / TIMING.fall));
  const r = easeOut(clamp01((t - TIMING.rise - TIMING.riseStagger * g.ub) / TIMING.riseLen));
  const fx = g.sx + (g.lx - g.sx) * f + Math.sin(Math.PI * f) * (g.j - 0.5) * 14;
  const fy = g.sy + (g.ly - g.sy) * f;
  return {
    x: fx + (g.ex - fx) * r + Math.sin(Math.PI * r) * (g.j - 0.5) * 22,
    y: fy + (g.ey - fy) * r - Math.sin(Math.PI * r) * g.j * 10,
  };
}

// How far the visitor has scrolled out of the hero (0..1), read from the runtime's own fade of the name.
export function heroProgress(chars) {
  if (!chars.length) return 0;
  let sum = 0;
  for (const c of chars) { const o = parseFloat(c.style.opacity); sum += Number.isFinite(o) ? o : 1; }
  return 1 - sum / chars.length;
}

export const markup = `<span class="hero-agency-lead">${LEAD}</span><br><span class="hero-agency-rest">${REST}</span>`;

// ---- Browser only below ----------------------------------------------------------------------------

// Draw an element's text into a canvas with the same fonts, then keep one grain per `cell` px of ink.
function grains(root, cell) {
  const box = root.getBoundingClientRect();
  const pad = 80, ox = box.left - pad, oy = box.top - pad;
  const w = Math.ceil(box.width + pad * 2), h = Math.ceil(box.height + pad * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node; (node = walker.nextNode());) {
    const cs = getComputedStyle(node.parentElement);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const text = node.textContent;
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      ctx.fillText(text[i], r.left - ox, r.top - oy + ctx.measureText(text[i]).fontBoundingBoxAscent);
    }
  }
  const data = ctx.getImageData(0, 0, w, h).data, out = [];
  for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
    if (data[(Math.floor(y) * w + Math.floor(x)) * 4 + 3] > 110) out.push({ x: ox + x, y: oy + y });
  }
  return out;
}

function morph(h2, done) {
  const cell = innerWidth < 768 ? 1.25 : 1.5;
  const color = getComputedStyle(h2).color;
  const source = grains(h2, cell);
  h2.innerHTML = markup;
  h2.style.opacity = '0';
  const target = grains(h2, cell);
  const all = [...source, ...target];
  if (!all.length) { h2.dataset.agency = 'done'; return done(); }
  const top = Math.min(...all.map(p => p.y)), bottom = Math.max(...all.map(p => p.y));
  const lineY = bottom + Math.min(24, (bottom - top) * 0.12);
  const list = pair(source, target, lineY);
  const left = Math.min(...all.map(p => p.x)) - 60, right = Math.max(...all.map(p => p.x)) + 60;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  const cw = right - left, ch = lineY - top + 120;
  Object.assign(canvas.style, { position: 'fixed', left: `${left}px`, top: `${top - 60}px`, width: `${cw}px`, height: `${ch}px`, pointerEvents: 'none' });
  canvas.width = Math.ceil(cw * dpr); canvas.height = Math.ceil(ch * dpr);
  canvas.setAttribute('aria-hidden', 'true');
  h2.parentElement.append(canvas);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, -left * dpr, -(top - 60) * dpr);
  ctx.fillStyle = color;
  h2.dataset.agency = 'morphing';
  const start = performance.now();
  const frame = now => {
    const t = now - start;
    ctx.clearRect(left, top - 60, cw, ch);
    const tail = clamp01((t - DURATION) / TIMING.fade);
    ctx.globalAlpha = (1 - tail) * (1 - heroProgress(document.querySelectorAll('.home-hero h1 .char')));
    for (const g of list) { const p = place(g, t); ctx.fillRect(p.x, p.y, cell, cell); }
    h2.dataset.reveal = String(tail);
    if (tail < 1) return requestAnimationFrame(frame);
    canvas.remove();
    h2.dataset.agency = 'done';
    done();
  };
  requestAnimationFrame(frame);
}

function start() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let played = false, busy = false, readyAt = 0;
  const tick = () => {
    requestAnimationFrame(tick);
    const h2 = document.querySelector('.home-hero h2');
    const chars = document.querySelectorAll('.home-hero h1 .char');
    if (!h2 || !chars.length) return;
    const progress = heroProgress(chars);
    // The new line follows the runtime's scroll-out of the name, which no longer animates this h2.
    if (h2.dataset.agency) {
      const reveal = h2.dataset.agency === 'done' ? 1 : Number(h2.dataset.reveal || 0);
      h2.style.opacity = String(reveal * (1 - progress));
      return;
    }
    if (busy || !h2.querySelector('div')) return; // wait until SplitText has split the original line
    const swapNow = () => { h2.innerHTML = markup; h2.setAttribute('aria-label', LABEL); h2.dataset.agency = 'done'; };
    if (played || reduced || progress > 0.02) return swapNow();
    if (document.querySelector('.preloader') || document.hidden) { readyAt = 0; return; }
    if (!readyAt) readyAt = performance.now() + TIMING.hold;
    if (performance.now() < readyAt) return;
    busy = true; played = true;
    h2.setAttribute('aria-label', LABEL);
    morph(h2, () => { busy = false; });
  };
  requestAnimationFrame(tick);
}

if (typeof document !== 'undefined') start();
