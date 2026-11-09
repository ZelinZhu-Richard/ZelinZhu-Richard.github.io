// Living portrait: Richard drawn in code from two photos, cycling through six styles.
// Mount: <canvas data-portrait aria-label="…"></canvas> + <script type="module" src="/portrait/portrait.js"></script>,
// or import { mountPortrait } and call it on a canvas. How it works: workspace/portrait/README.md.

const DATA = ['a', 'b'].map(id => new URL(`./data/${id}.png`, import.meta.url).href);
const HOLD = 3600;   // ms a style stays formed
const TRANS = 1500;  // ms of the burst between styles
const SPREAD = 0.3;  // fraction of TRANS used to stagger elements
const FACE = { x: 0.5, y: 0.45, sx: 0.24, sy: 0.24 }; // where the face sits in the aligned data (see prep.json)

/* ---------- data ---------- */

async function loadPhoto(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const W = img.width, H = img.height / 6, n = W * H;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const plane = (k, scale = 1 / 255) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = px[(k * n + i) * 4] * scale;
    return out;
  };
  const photo = { W, H, tone: plane(0), edge: plane(1), ang: plane(2, Math.PI / 255), matte: plane(3), lines: plane(4), warm: plane(5) };
  // Face priority: detail matters most around the eyes and mouth, so samplers lean towards it.
  photo.focus = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x / W - FACE.x) / FACE.sx, dy = (y / H - FACE.y) / FACE.sy;
    photo.focus[y * W + x] = 0.3 + 0.7 * Math.exp(-0.5 * (dx * dx + dy * dy));
  }
  return photo;
}

/* ---------- helpers ---------- */

function rng(seed) { // mulberry32: the same seed gives the same drawing, which keeps screenshots comparable
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Weighted pixel sampler: cumulative weights + binary search. Returns a pixel index.
function sampler(weights) {
  const cdf = new Float64Array(weights.length);
  let sum = 0;
  for (let i = 0; i < weights.length; i++) { sum += Math.max(0, weights[i]); cdf[i] = sum; }
  return r => {
    const v = r * sum;
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < v) lo = mid + 1; else hi = mid; }
    return lo;
  };
}

const at = (plane, W, H, x, y) => plane[Math.min(H - 1, Math.max(0, y | 0)) * W + Math.min(W - 1, Math.max(0, x | 0))];

// Box average of a plane over a cell (grid styles).
function cellMean(plane, W, H, x0, y0, w, h) {
  let s = 0, c = 0;
  for (let y = Math.max(0, y0 | 0); y < Math.min(H, Math.ceil(y0 + h)); y++)
    for (let x = Math.max(0, x0 | 0); x < Math.min(W, Math.ceil(x0 + w)); x++) { s += plane[y * W + x]; c++; }
  return c ? s / c : 0;
}

// Morton (Z-order) key: sorting targets by it keeps neighbours together, so element i lands in
// roughly the same region in every style and the transitions read as a re-forming, not a shuffle.
function morton(x, y) {
  const part = v => { v &= 0x3ff; v = (v | v << 8) & 0x00ff00ff; v = (v | v << 4) & 0x0f0f0f0f; v = (v | v << 2) & 0x33333333; return (v | v << 1) & 0x55555555; };
  return part(x) | part(y) << 1;
}

/* ---------- styles ----------
   Each build() returns a list of items {x, y, a (angle), l (length), s (size), c (colour index), o (opacity bucket 0-3), g (glyph), b (bend)}
   in data pixels (the photo's W x H grid). The pool assigns them to elements. */

const ASCII_RAMP = ' .\'`:-=+*xo#%&@'; // light to dark; short, so midtones stay readable at 5px

const STYLES = [
  {
    id: 'ascii', name: 'ASCII', kind: 'glyph', bg: '#f4f3ee', colors: ['#161514'], alphas: [0.5, 0.7, 0.85, 1],
    build(p, N, r, view) {
      const cols = Math.round(Math.min(Math.sqrt(N / 0.42), Math.max(44, view.cssW / 5.2)));
      const cw = p.W / cols, ch = cw * 1.7, rows = Math.floor(p.H / ch);
      this.cell = [cw, ch];
      const items = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x0 = i * cw, y0 = j * ch + (p.H - rows * ch) / 2;
        const m = cellMean(p.matte, p.W, p.H, x0, y0, cw, ch);
        if (m < 0.4) continue;
        let d = 1 - cellMean(p.tone, p.W, p.H, x0, y0, cw, ch);
        d = Math.min(1, d + 0.55 * cellMean(p.lines, p.W, p.H, x0, y0, cw, ch)); // sharpen eyes, glasses, mouth
        const g = Math.round(Math.pow(d, 1.55) * (ASCII_RAMP.length - 1)); // lift midtones: skin stays light
        if (g === 0) continue;
        items.push({ x: x0 + cw / 2, y: y0 + ch / 2, a: 0, l: 0, s: 1, c: 0, o: d > 0.15 ? 3 : 2, g });
      }
      return items;
    },
  },
  {
    id: 'hatch', name: 'Pencil hatching', kind: 'line', bg: '#ebe6da', colors: ['#2a2a31'], alphas: [0.26, 0.44, 0.64, 0.88], width: 0.44,
    boil: { ms: 170, pos: 0.25, ang: 0.05 },
    build(p, N, r) {
      const n = p.W * p.H, wTone = new Float32Array(n), wLine = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const d = 1 - p.tone[i];
        wTone[i] = p.matte[i] * Math.pow(Math.max(0, d - 0.22), 1.4) * (0.35 + 0.65 * p.focus[i]); // light skin stays paper
        wLine[i] = p.matte[i] * Math.pow(p.lines[i], 1.3) * p.focus[i];
      }
      const pickTone = sampler(wTone), pickLine = sampler(wLine), items = [];
      const H1 = -Math.PI / 4, H2 = Math.PI / 4, H3 = 0.1;
      for (let k = 0; k < N; k++) {
        const contour = k < N * 0.36;
        const i = (contour ? pickLine : pickTone)(r()), x = i % p.W + r(), y = (i / p.W | 0) + r();
        const d = 1 - p.tone[i], e = p.edge[i], along = p.ang[i] + Math.PI / 2;
        if (contour) {
          items.push({ x, y, a: along, l: 2.5 + 3 * r(), s: 1, c: 0, o: p.lines[i] > 0.45 ? 3 : 2 });
          continue;
        }
        const layers = d < 0.38 ? 1 : d < 0.62 ? 2 : 3;
        let a = [H1, H2, H3][Math.floor(r() * layers)];
        if (r() < e * 0.8) a = along; // strong edges: follow the contour instead of the hatch grid
        items.push({ x, y, a, l: (3.5 + 6 * (1 - e)) * (0.7 + 0.6 * r()), s: 1, c: 0, o: d < 0.3 ? 0 : d < 0.5 ? 1 : d < 0.75 ? 2 : 3 });
      }
      return items;
    },
  },
  {
    id: 'scribble', name: 'Scribble ink', kind: 'curve', bg: '#f7f4ec', colors: ['#1d2bb8', '#5a2fd0', '#a03fd8', '#ff5fa8'], alphas: [0.3, 0.5, 0.72, 0.95], width: 0.55,
    boil: { ms: 95, pos: 0.6, ang: 0.16, bend: 0.5 },
    build(p, N, r) {
      const n = p.W * p.H, w = new Float32Array(n);
      for (let i = 0; i < n; i++) w[i] = p.matte[i] * (Math.pow(Math.max(0, 0.85 - p.tone[i]), 1.3) * (0.35 + 0.65 * p.focus[i]) + 1.3 * p.lines[i] ** 1.2 * p.focus[i]);
      const pick = sampler(w), items = [];
      for (let k = 0; k < N; k++) {
        const i = pick(r()), x = i % p.W + r(), y = (i / p.W | 0) + r();
        const d = Math.min(1, 1 - p.tone[i] + 0.8 * p.lines[i]), e = p.edge[i];
        const a = p.ang[i] + Math.PI / 2 + (r() - 0.5) * (0.3 + 1.6 * (1 - e) * (1 - p.lines[i]));
        const l = (4 + 12 * (1 - e) * r()) * (1.15 - 0.45 * p.focus[i]); // shorter, finer strokes on the face
        items.push({ x, y, a, l: p.lines[i] > 0.4 ? l * 0.6 : l, s: 1, b: (r() - 0.5) * l * (p.lines[i] > 0.4 ? 0.3 : 0.9), c: d > 0.72 ? 0 : d > 0.52 ? 1 : d > 0.32 ? 2 : 3, o: d > 0.6 ? 3 : d > 0.4 ? 2 : d > 0.22 ? 1 : 0 });
      }
      return items;
    },
  },
  {
    id: 'halftone', name: 'Halftone', kind: 'dot', bg: '#f4f3ee', colors: ['#161514'], alphas: [1, 1, 1, 1],
    boil: { ms: 110, wave: 0.07 },
    build(p, N) {
      const sp = Math.max(2.6, Math.sqrt(p.W * p.H * 0.6 / N)), items = [];
      const c = Math.SQRT1_2, ext = Math.hypot(p.W, p.H);
      for (let v = -ext; v < ext; v += sp) for (let u = -ext; u < ext; u += sp) { // grid rotated 45°
        const x = p.W / 2 + (u - v) * c, y = p.H / 2 + (u + v) * c;
        if (x < 0 || y < 0 || x >= p.W || y >= p.H) continue;
        const m = cellMean(p.matte, p.W, p.H, x - sp / 2, y - sp / 2, sp, sp);
        if (m < 0.35) continue;
        const d = Math.min(1, Math.pow(1 - cellMean(p.tone, p.W, p.H, x - sp / 2, y - sp / 2, sp, sp), 1.45) + 0.4 * cellMean(p.lines, p.W, p.H, x - sp / 2, y - sp / 2, sp, sp));
        const rad = sp * 0.5 * Math.sqrt(d) * 1.22 * Math.min(1, m * 1.4);
        if (rad < sp * 0.08) continue;
        items.push({ x, y, a: 0, l: 0, s: rad, c: 0, o: 3 });
      }
      return items;
    },
  },
  {
    id: 'neon', name: 'Neon contours', kind: 'glow', bg: '#08070b', colors: ['#ff4fa0', '#9b6bff', '#19b4e6'], alphas: [0.35, 0.55, 0.8, 1], width: 0.42,
    boil: { ms: 120, flicker: 0.06, pos: 0.12 },
    build(p, N, r) {
      const n = p.W * p.H, w = new Float32Array(n);
      for (let i = 0; i < n; i++) w[i] = p.matte[i] * (Math.pow(p.lines[i], 1.1) * (0.15 + 0.85 * p.focus[i]) + 0.25 * p.edge[i] ** 2 * p.focus[i]);
      const pick = sampler(w), items = [];
      for (let k = 0; k < N; k++) {
        const i = pick(r()), x = i % p.W + r(), y = (i / p.W | 0) + r();
        const s = Math.max(p.lines[i], p.edge[i] * 0.8);
        const c = p.warm[i] > 0.45 && p.tone[i] > 0.2 ? 0 : p.tone[i] < 0.3 ? 1 : 2; // skin pink, hair violet, sweater cyan
        items.push({ x, y, a: p.ang[i] + Math.PI / 2, l: 2 + 3 * r(), s: 1, c, o: s > 0.7 ? 3 : s > 0.45 ? 2 : s > 0.25 ? 1 : 0 });
      }
      return items;
    },
  },
  {
    id: 'pixel', name: 'Pixel art', kind: 'square', bg: '#0a090e', alphas: [1, 1, 1, 1],
    // Two short ramps, cool (hair, sweater) and warm (skin, lips): ten colours in all.
    colors: ['#251d3b', '#38305a', '#4d4673', '#837fae', '#c3c1df', '#3a1f2a', '#8a4b52', '#c9786b', '#eda98a', '#fbdcc2'],
    build(p, N, r, view) {
      let area = 0;
      for (let i = 0; i < p.matte.length; i++) area += p.matte[i];
      // Chunky: about 7.5 CSS px per pixel, and never more cells than the pool has elements.
      const cell = Math.max(4.4, Math.min(6, p.W / (view.cssW / 7.5)), Math.sqrt(area * 1.08 / N));
      this.cell = cell;
      const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const cols = Math.floor(p.W / cell), rows = Math.floor(p.H / cell), ox = (p.W - cols * cell) / 2, oy = (p.H - rows * cell) / 2, items = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x0 = ox + i * cell, y0 = oy + j * cell;
        if (cellMean(p.matte, p.W, p.H, x0, y0, cell, cell) < 0.5) continue;
        const t = Math.max(0, cellMean(p.tone, p.W, p.H, x0, y0, cell, cell) - 0.45 * cellMean(p.lines, p.W, p.H, x0, y0, cell, cell));
        const warm = cellMean(p.warm, p.W, p.H, x0, y0, cell, cell) > 0.45 && t > 0.22;
        const level = Math.min(4, Math.max(0, Math.floor(t * 4 + bayer[(j & 3) * 4 + (i & 3)] / 16 - 0.1)));
        items.push({ x: x0 + cell / 2, y: y0 + cell / 2, a: 0, l: 0, s: cell + 0.06, c: (warm ? 5 : 0) + level, o: 3 });
      }
      return items;
    },
  },
];

const BURST = ['#3b4bff', '#8a4dff', '#ff4fa0'];

/* ---------- the portrait ---------- */

// Options: label (element whose text shows the style), start (first step), count (fixed pool size instead
// of the adaptive one), onStyle (called with each new style).
export async function mountPortrait(canvas, { label, start = 0, count, onStyle } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const ctx = canvas.getContext('2d', { alpha: false });
  const photos = await Promise.all(DATA.map(loadPhoto));
  const { W, H } = photos[0];

  // Canvas size: CSS size x devicePixelRatio, capped at 2.
  const view = { cssW: 0, cssH: 0, dpr: 1, s: 1, ox: 0, oy: 0 };
  function measure() {
    const rect = canvas.getBoundingClientRect();
    view.cssW = Math.max(1, rect.width); view.cssH = Math.max(1, rect.height);
    view.dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(view.cssW * view.dpr); canvas.height = Math.round(view.cssH * view.dpr);
    view.s = Math.max(canvas.width / W, canvas.height / H); // cover
    view.ox = (canvas.width - W * view.s) / 2; view.oy = (canvas.height - H * view.s) / 2;
  }
  measure();

  // Pool size from the canvas area and the device; lowered later if frames run slow.
  const small = view.cssW < 420 || matchMedia('(pointer: coarse)').matches;
  let N = count || Math.round(Math.min(3200, Math.max(1200, view.cssW * view.cssH / 58)) * (small ? 0.8 : 1) * ((navigator.hardwareConcurrency || 8) <= 4 ? 0.75 : 1));

  // Element state, structure of arrays.
  let px, py, ox, oy, vx, vy, cx, cy, jx, jy, ja, jb, delay, seed;
  function alloc() {
    const f = () => new Float32Array(N);
    px = f(); py = f(); ox = f(); oy = f(); vx = f(); vy = f(); cx = f(); cy = f();
    jx = f(); jy = f(); ja = f(); jb = f(); delay = f(); seed = f();
    for (let i = 0; i < N; i++) seed[i] = Math.random();
  }
  alloc();

  // A built style: per-element targets.
  function target(step) {
    const style = STYLES[step % STYLES.length];
    const photo = photos[(step + Math.floor(step / STYLES.length)) % 2]; // alternate photos, and swap them on the next loop
    const r = rng(1000 + step % 12);
    const items = style.build(photo, N, r, view);
    const keys = items.map(it => morton(it.x * 4, it.y * 4));
    const order = items.map((_, i) => i).sort((a, b) => keys[a] - keys[b]);
    const M = Math.max(1, order.length);
    const T = { style, step, x: new Float32Array(N), y: new Float32Array(N), a: new Float32Array(N), l: new Float32Array(N), s: new Float32Array(N), b: new Float32Array(N), c: new Uint8Array(N), o: new Int8Array(N), g: new Uint8Array(N) };
    let last = -1;
    for (let i = 0; i < N; i++) {
      const k = Math.min(M - 1, Math.floor(i * M / N)), it = items[order[k]];
      if (!it) { T.x[i] = W / 2; T.y[i] = H / 2; T.o[i] = -1; continue; }
      T.x[i] = it.x; T.y[i] = it.y; T.a[i] = it.a; T.l[i] = it.l; T.s[i] = it.s; T.b[i] = it.b || 0; T.c[i] = it.c; T.g[i] = it.g || 0;
      T.o[i] = k === last ? -1 : it.o; // more elements than items: the extras fly along, then hide
      last = k;
    }
    return T;
  }

  // Glyph atlas for ASCII: every character drawn once at device resolution.
  let atlas = null;
  function buildAtlas(T) {
    const [cw, ch] = T.style.cell, gw = Math.ceil(cw * view.s), gh = Math.ceil(ch * view.s);
    const c = document.createElement('canvas');
    c.width = gw * ASCII_RAMP.length; c.height = gh;
    const g = c.getContext('2d');
    g.fillStyle = T.style.colors[0];
    g.font = `${Math.max(4, gh * 0.92)}px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 1; k < ASCII_RAMP.length; k++) g.fillText(ASCII_RAMP[k], k * gw + gw / 2, gh * 0.55);
    atlas = { canvas: c, gw, gh, cw, ch, step: T.step };
  }

  /* ---------- state ---------- */
  let step = start, cur = target(step), from = null, burstFrom = false, ready = null, preparing = false;
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1));
  function prepare() { // build the next style while the current one holds still
    if (preparing || ready?.step === step + 1) return;
    preparing = true;
    idle(() => { preparing = false; if (!destroyed && !transitioning) ready = target(step + 1); });
  }
  let clock = 0, phaseAt = 0, transitioning = false, t = 1;
  let boilAt = 0, dirty = true, raf = 0, last = 0, running = false, visible = true, onScreen = true, destroyed = false;
  const pointer = { x: 0, y: 0, active: false };
  let settling = false;
  const perf = { frames: 0, slow: 0, draws: [], builds: [], lastDraw: 0 };
  if (cur.style.kind === 'glyph') buildAtlas(cur);

  function announce() {
    const s = cur.style, n = STYLES.indexOf(s) + 1;
    canvas.setAttribute('aria-label', `Animated portrait of Richard Zhu drawn in code. Style ${n} of ${STYLES.length}: ${s.name}.`);
    if (label) label.textContent = `${String(n).padStart(2, '0')} / ${String(STYLES.length).padStart(2, '0')} · ${s.name}`;
    onStyle?.(s);
  }

  // Start a transition from wherever every element is now.
  function go(nextStep, { instant = false } = {}) {
    if (destroyed) return;
    if (transitioning) { snapshot(); burstFrom = true; } // interrupted mid-flight: start from the in-flight positions
    else { for (let i = 0; i < N; i++) { px[i] = cur.x[i]; py[i] = cur.y[i]; } burstFrom = false; }
    from = cur;
    if (perf.slow > 20 && N > 1000) { // frames ran slow: shrink the pool for the next style
      const keepX = px, keepY = py;
      N = Math.max(1000, Math.round(N * 0.78));
      alloc();
      for (let i = 0; i < N; i++) { px[i] = keepX[i]; py[i] = keepY[i]; }
      from = null; burstFrom = true;
    }
    perf.slow = 0;
    step = nextStep;
    const b0 = performance.now();
    cur = ready && ready.step === step && ready.x.length === N ? ready : target(step); // usually built ahead, in idle time
    ready = null;
    perf.builds.push(performance.now() - b0);
    if (cur.style.kind === 'glyph') buildAtlas(cur);
    announce();
    phaseAt = clock; dirty = true;
    if (instant || reduce.matches) { transitioning = false; t = 1; from = null; return; }
    transitioning = true; t = 0;
    // Burst control point: push each element outward from the centre, scrambled a little.
    for (let i = 0; i < N; i++) {
      const dx = px[i] - W / 2, dy = py[i] - H * 0.45, d = Math.hypot(dx, dy) + 1e-3;
      const ang = Math.atan2(dy, dx) + (seed[i] - 0.5) * 1.6;
      const R = 25 + 80 * Math.random() + d * 0.35;
      cx[i] = px[i] + Math.cos(ang) * R; cy[i] = py[i] + Math.sin(ang) * R;
      delay[i] = SPREAD * (0.55 * Math.random() + 0.45 * Math.min(1, d / (W * 0.6)));
    }
  }

  function snapshot() {
    for (let i = 0; i < N; i++) { const p = flight(i); px[i] = p[0]; py[i] = p[1]; }
  }

  const ease = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const tmp = [0, 0, 0], tmpB = [0, 0];
  // Element i flies along a quadratic Bézier: start -> burst point -> target. u is its own progress 0..1.
  function bez(i, u, out) {
    const e = ease(u), q = 1 - e;
    out[0] = q * q * px[i] + 2 * e * q * cx[i] + e * e * cur.x[i];
    out[1] = q * q * py[i] + 2 * e * q * cy[i] + e * e * cur.y[i];
    return out;
  }
  function flight(i) {
    const u = Math.min(1, Math.max(0, (t - delay[i]) / (1 - SPREAD)));
    bez(i, u, tmp); tmp[2] = u;
    return tmp;
  }

  function reboil(style) {
    const b = style.boil;
    for (let i = 0; i < N; i++) {
      jx[i] = (Math.random() - 0.5) * 2 * (b?.pos || 0);
      jy[i] = (Math.random() - 0.5) * 2 * (b?.pos || 0);
      ja[i] = (Math.random() - 0.5) * 2 * (b?.ang || 0);
      jb[i] = (Math.random() - 0.5) * 2 * (b?.bend || 0) + (b?.flicker && Math.random() < b.flicker ? -2 : 0);
    }
  }
  reboil(cur.style);

  /* ---------- drawing ----------
     Elements are grouped into buckets by (which style draws them, colour, opacity) so each bucket
     is one path and one stroke or fill call, instead of one per element. */
  const BUCKETS = 3 * 16 * 4;
  const bucketIdx = Array.from({ length: BUCKETS }, () => new Int32Array(0));
  const bucketLen = new Int32Array(BUCKETS);
  const rx = new Float32Array(4096), ry = new Float32Array(4096), ra = new Float32Array(4096), rl = new Float32Array(4096); // drawn pose, N <= 3200
  const qx = new Float32Array(4096), qy = new Float32Array(4096), sx = new Float32Array(4096), sy = new Float32Array(4096); // in-flight trail
  function push(key, i) {
    if (bucketIdx[key].length <= bucketLen[key]) { const grown = new Int32Array(Math.max(64, bucketIdx[key].length * 2)); grown.set(bucketIdx[key]); bucketIdx[key] = grown; }
    bucketIdx[key][bucketLen[key]++] = i;
  }

  const mix = (a, b, k) => {
    const p = x => [1, 3, 5].map(j => parseInt(x.slice(j, j + 2), 16));
    const A = p(a), B = p(b);
    return `rgb(${A.map((v, j) => Math.round(v + (B[j] - v) * k)).join(',')})`;
  };

  function draw() {
    const t0 = performance.now();
    const T = cur, F = from, wave = T.style.boil?.wave ? clock / 1000 : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = transitioning && F ? mix(F.style.bg, T.style.bg, ease(Math.min(1, t * 1.4))) : T.style.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);
    bucketLen.fill(0);
    for (let i = 0; i < N; i++) {
      let x, y, src, u = 1;
      if (transitioning) {
        const p = flight(i); x = p[0]; y = p[1]; u = p[2];
        src = u < 0.1 ? (F && !burstFrom ? 0 : 2) : u < 0.9 ? 2 : 1;
      } else { x = T.x[i]; y = T.y[i]; src = 1; }
      const S = src === 0 ? F : T;
      if (src !== 2 && S.o[i] < 0) continue;
      x += ox[i] + jx[i]; y += oy[i] + jy[i];
      rx[i] = x; ry[i] = y;
      if (src === 2) {
        // In flight: a curved ink trail through the last stretch of its path. Fast elements leave long trails.
        bez(i, Math.max(0, u - 0.05), tmpB); qx[i] = tmpB[0] + ox[i]; qy[i] = tmpB[1] + oy[i];
        bez(i, Math.max(0, u - 0.11), tmpB); sx[i] = tmpB[0] + ox[i]; sy[i] = tmpB[1] + oy[i];
        push(2 * 64 + (i % 3) * 4 + 3, i);
      } else {
        ra[i] = S.a[i] + ja[i]; rl[i] = S.l[i];
        let o = S.o[i];
        if (S.style.boil?.flicker && jb[i] < -1) o = Math.max(0, o - 2);
        push(src * 64 + S.c[i] * 4 + o, i);
      }
    }
    for (let key = 0; key < BUCKETS; key++) {
      const n = bucketLen[key];
      if (!n) continue;
      const src = key >> 6, c = (key >> 2) & 15, o = key & 3, idx = bucketIdx[key];
      if (src === 2) { trails(idx, n, BURST[c]); continue; }
      const S = src === 0 ? F : T, st = S.style;
      const color = st.colors[c], alpha = st.alphas[o];
      switch (st.kind) {
        case 'glyph': glyphs(S, idx, n, alpha); break;
        case 'line': strokes(idx, n, color, alpha, st.width, null); break;
        case 'curve': strokes(idx, n, color, alpha, st.width, S); break;
        case 'glow':
          ctx.globalCompositeOperation = 'lighter';
          strokes(idx, n, color, alpha * 0.16, st.width * 4.2, null);
          strokes(idx, n, color, alpha * 0.9, st.width, null);
          ctx.globalCompositeOperation = 'source-over';
          break;
        case 'dot': dots(S, idx, n, color, alpha, wave); break;
        case 'square': squares(S, idx, n, color, alpha); break;
      }
    }
    ctx.globalAlpha = 1;
    const dt = performance.now() - t0;
    perf.lastDraw = dt;
    if (perf.draws.length < 2000) perf.draws.push(dt);

  }

  function strokes(idx, n, color, alpha, width, curve) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const i = idx[k], c = Math.cos(ra[i]) * rl[i] / 2, s = Math.sin(ra[i]) * rl[i] / 2;
      ctx.moveTo(rx[i] - c, ry[i] - s);
      if (curve) { const b = curve.b[i] * (1 + jb[i]); ctx.quadraticCurveTo(rx[i] - s * b / rl[i] * 2, ry[i] + c * b / rl[i] * 2, rx[i] + c, ry[i] + s); }
      else ctx.lineTo(rx[i] + c, ry[i] + s);
    }
    ctx.stroke();
  }

  function trails(idx, n, color) {
    ctx.globalAlpha = 0.85; ctx.strokeStyle = color; ctx.lineWidth = 0.65; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < n; k++) { const i = idx[k]; ctx.moveTo(sx[i], sy[i]); ctx.quadraticCurveTo(qx[i], qy[i], rx[i] + 0.01, ry[i]); }
    ctx.stroke();
  }

  function glyphs(S, idx, n, alpha) {
    if (!atlas || atlas.step !== S.step) buildAtlas(S);
    const { canvas: img, gw, gh, cw, ch } = atlas;
    ctx.globalAlpha = alpha;
    for (let k = 0; k < n; k++) { const i = idx[k]; ctx.drawImage(img, S.g[i] * gw, 0, gw, gh, rx[i] - cw / 2, ry[i] - ch / 2, cw, ch); }
  }

  function dots(S, idx, n, color, alpha, wave) {
    ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      const r = S.s[i] * (wave ? 1 + S.style.boil.wave * Math.sin(wave * 2.2 - (S.x[i] + S.y[i]) * 0.045) : 1);
      ctx.moveTo(rx[i] + r, ry[i]); ctx.arc(rx[i], ry[i], r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  function squares(S, idx, n, color, alpha) {
    ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < n; k++) { const i = idx[k], s = S.s[i]; ctx.rect(rx[i] - s / 2, ry[i] - s / 2, s, s); }
    ctx.fill();
  }

  /* ---------- pointer: push strokes away, spring back ---------- */
  function physics(dt) {
    const k = 0.012 * dt, damp = Math.pow(0.86, dt / 16.7), R = 24, R2 = R * R;
    let moving = false, displaced = false;
    for (let i = 0; i < N; i++) {
      const x = rx[i], y = ry[i];
      let ax = -ox[i] * k, ay = -oy[i] * k;
      if (pointer.active) {
        const dx = x - pointer.x, dy = y - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > 1e-4) { const d = Math.sqrt(d2), f = (1 - d / R) ** 2 * 0.9 * dt / 16.7; ax += dx / d * f; ay += dy / d * f; }
      }
      vx[i] = (vx[i] + ax) * damp; vy[i] = (vy[i] + ay) * damp;
      ox[i] += vx[i]; oy[i] += vy[i];
      if (!moving && (Math.abs(vx[i]) > 0.004 || Math.abs(vy[i]) > 0.004)) moving = true;
      if (!displaced && (Math.abs(ox[i]) > 0.05 || Math.abs(oy[i]) > 0.05)) displaced = true;
    }
    // At rest under a still pointer nothing moves, so nothing is redrawn. Once the pointer leaves, snap home.
    if (!moving && !pointer.active && !displaced && (ox.some(v => v) || oy.some(v => v))) { ox.fill(0); oy.fill(0); vx.fill(0); vy.fill(0); return true; }
    return moving || (!pointer.active && displaced);
  }

  function toData(event) {
    const rect = canvas.getBoundingClientRect();
    return [((event.clientX - rect.left) * view.dpr - view.ox) / view.s, ((event.clientY - rect.top) * view.dpr - view.oy) / view.s];
  }
  const onMove = event => {
    if (reduce.matches) return;
    [pointer.x, pointer.y] = toData(event); pointer.active = true; settling = true; wake();
  };
  const onLeave = () => { pointer.active = false; settling = true; wake(); };
  const onClick = () => next();
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointercancel', onLeave);
  canvas.addEventListener('click', onClick);

  /* ---------- loop ---------- */
  function frame(now) {
    raf = 0;
    if (!running) return;
    const dt = last ? Math.min(50, now - last) : 16.7;
    last = now;
    const still = reduce.matches;
    if (!still) clock += dt;
    if (transitioning && dt > 24) perf.slow++; // a dropped frame mid-burst (counts raster time, unlike draw())
    if (!still && !transitioning && clock - phaseAt > 900) prepare();
    if (!still && !transitioning && clock - phaseAt > HOLD) go(step + 1);
    if (transitioning) {
      t = Math.min(1, (clock - phaseAt) / TRANS);
      dirty = true;
      if (t >= 1) { transitioning = false; from = null; reboil(cur.style); }
    }
    const boil = cur.style.boil;
    if (!still && !transitioning && boil && clock - boilAt > boil.ms) { boilAt = clock; reboil(cur.style); dirty = true; }
    if (!still && (settling || pointer.active)) { settling = physics(dt); if (settling) dirty = true; }
    if (dirty) { dirty = false; draw(); perf.frames++; }
    raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (!running || raf) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function update() {
    const should = !destroyed && visible && onScreen;
    if (should === running) return;
    running = should;
    if (running) wake();
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  // Pause when off-screen or when the tab is hidden.
  const io = new IntersectionObserver(entries => { onScreen = entries[entries.length - 1].isIntersecting; update(); });
  io.observe(canvas);
  const onVisibility = () => { visible = document.visibilityState === 'visible'; update(); };
  document.addEventListener('visibilitychange', onVisibility);
  const ro = new ResizeObserver(() => { measure(); if (cur.style.kind === 'glyph') buildAtlas(cur); dirty = true; if (reduce.matches) draw(); wake(); });
  ro.observe(canvas);
  const onReduce = () => {
    if (reduce.matches) { transitioning = false; from = null; t = 1; jx.fill(0); jy.fill(0); ja.fill(0); jb.fill(0); ox.fill(0); oy.fill(0); if (cur.style.id !== 'hatch') go(1, { instant: true }); }
    dirty = true; wake();
  };
  reduce.addEventListener('change', onReduce);

  function next() {
    if (reduce.matches) { go(step + 1, { instant: true }); draw(); return; }
    go(step + 1); wake();
  }

  // Entrance: the first style assembles out of a scattered burst (or appears at once with reduced motion).
  if (reduce.matches) {
    if (cur.style.id !== 'hatch') { step = 1; cur = target(1); }
    jx.fill(0); jy.fill(0); ja.fill(0); jb.fill(0);
    announce();
  } else {
    for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, R = 60 + Math.random() * 120; px[i] = W / 2 + Math.cos(a) * R; py[i] = H * 0.45 + Math.sin(a) * R; }
    from = null; burstFrom = true; transitioning = true; t = 0;
    for (let i = 0; i < N; i++) {
      cx[i] = (px[i] + cur.x[i]) / 2 + (Math.random() - 0.5) * 60; cy[i] = (py[i] + cur.y[i]) / 2 + (Math.random() - 0.5) * 60;
      delay[i] = SPREAD * Math.random();
    }
    announce();
  }
  draw();
  visible = document.visibilityState === 'visible';
  update();

  return {
    next,
    get style() { return cur.style.id; },
    get running() { return running; },
    get count() { return N; },
    get perf() { return { frames: perf.frames, lastDraw: perf.lastDraw, draws: perf.draws.splice(0), builds: perf.builds.splice(0) }; }, // draw ms since last read
    // Jump (without the burst) to the next step that uses this style; used by the screenshot checks.
    show(id) { const k = STYLES.findIndex(s => s.id === id), d = (k - step % STYLES.length + STYLES.length) % STYLES.length; if (k >= 0 && (d || transitioning)) { go(step + d, { instant: true }); draw(); } },
    destroy() {
      destroyed = true; running = false;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reduce.removeEventListener('change', onReduce);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointercancel', onLeave);
      canvas.removeEventListener('click', onClick);
    },
  };
}

export const styles = STYLES.map(s => ({ id: s.id, name: s.name }));

// Auto-mount: any <canvas data-portrait> on the page. (Skipped outside a browser, e.g. in the Node tests.)
if (typeof document !== 'undefined') for (const canvas of document.querySelectorAll('canvas[data-portrait]')) {
  if (!canvas.livingPortrait) canvas.livingPortrait = mountPortrait(canvas);
}
