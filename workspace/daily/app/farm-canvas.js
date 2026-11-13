// Space farm painter (browser only). Draws the sky, the floating island, decor, crops and
// particles on the .farm canvas from the JSON model in data-farm (app/farm.js renderFarm).
// Runs only while the farm is on screen and the tab is visible; under reduced motion it draws
// one still frame and skips tilt, bobbing and particles.
import { DECOR, FARM, elevation, iso, isTerrace, onIsland, tileAt, tileCenter } from './farm.js';

const W = FARM.width, H = FARM.height;
const growth = new Map(); // taskId → drawn growth 0..1, kept across re-renders so a tick animates
let current = null;

export function mountFarm(root, { reduced = false } = {}) {
  if (current && current.root === root && root?.isConnected) { current.setReduced(reduced); return current; }
  current?.destroy();
  current = root ? createPainter(root, reduced) : null;
  return current;
}

// Effects from engine events: 'grow' (a task was ticked), 'perfect' (the whole list is done).
export function farmFx(type, id) { current?.fx(type, id); }

// ---------- small helpers ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = c => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (c, a) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
const mix = (a, b, t) => {
  const x = hex(a), y = hex(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
const poly = (g, pts) => { g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) g.lineTo(p.x, p.y); g.closePath(); };
const down = (p, d) => ({ x: p.x, y: p.y + d });

const PALETTE = {
  fed: { meadow: ['#2f6f6a', '#347a72'], terrace: ['#5d4f96', '#655aa2'], crop: 1 },
  hungry: { meadow: ['#4e6a5b', '#56705f'], terrace: ['#5a5280', '#5f5786'], crop: 0.75 },
  starving: { meadow: ['#5c5a50', '#625f55'], terrace: ['#544c6c', '#585070'], crop: 0.45 },
  dead: { meadow: ['#4a4650', '#4e4a55'], terrace: ['#4a4560', '#4d4864'], crop: 0.2 },
};
const SOIL = '#3b2741', FURROW = '#2a1a30', SIDE_L = '#3a2c4f', SIDE_R = '#4a3a63', LIP_L = '#245652', LIP_R = '#2b625c';
const SKIRT = 34;
// Small meadow props (flat, so a pet standing near one never needs to hide it).
const PROPS = new Set(['7,4', '1,6', '5,7', '7,1']);
const STONES = new Set(['3,7', '7,5', '1,4']);

// ---------- static layers ----------
function paintSky(g) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#07061a');
  bg.addColorStop(1, '#130c2b');
  g.fillStyle = bg;
  g.fillRect(-40, -40, W + 80, H + 80);
  for (const [x, y, r, c, a] of [[210, 140, 340, '#5b2a86', 0.42], [820, 540, 320, '#0f5a66', 0.38], [700, 70, 240, '#8a2a6a', 0.24], [90, 560, 200, '#2a3a8a', 0.3]]) {
    const n = g.createRadialGradient(x, y, 0, x, y, r);
    n.addColorStop(0, rgba(c, a));
    n.addColorStop(1, rgba(c, 0));
    g.fillStyle = n;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Ringed planet (top right) and a small moon (lower left).
  const px = 872, py = 104, pr = 44;
  g.save();
  g.translate(px, py);
  g.rotate(-0.35);
  g.strokeStyle = 'rgba(255,214,170,.55)';
  g.lineWidth = 5;
  g.beginPath(); g.ellipse(0, 0, pr * 1.9, pr * 0.46, 0, Math.PI, Math.PI * 2); g.stroke();
  g.restore();
  const pg = g.createRadialGradient(px - 16, py - 18, 4, px, py, pr);
  pg.addColorStop(0, '#ffc49a'); pg.addColorStop(0.55, '#d8738a'); pg.addColorStop(1, '#4d2456');
  g.fillStyle = pg;
  g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(80,30,80,.25)';
  g.beginPath(); g.ellipse(px + 4, py + 10, pr * 0.9, 6, -0.35, 0, Math.PI * 2); g.fill();
  g.save();
  g.translate(px, py);
  g.rotate(-0.35);
  g.strokeStyle = 'rgba(255,224,190,.8)';
  g.lineWidth = 5;
  g.beginPath(); g.ellipse(0, 0, pr * 1.9, pr * 0.46, 0, 0, Math.PI); g.stroke();
  g.restore();
  const mg = g.createRadialGradient(118, 498, 2, 124, 504, 24);
  mg.addColorStop(0, '#e9e4f5'); mg.addColorStop(1, '#6e6890');
  g.fillStyle = mg;
  g.beginPath(); g.arc(124, 504, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(60,50,90,.35)';
  for (const [x, y, r] of [[118, 498, 5], [132, 512, 4], [128, 494, 2.5]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
}

function paintIsland(g, data) {
  const pal = PALETTE[data.hunger] || PALETTE.fed;
  const field = new Map(data.plots.map(p => [`${p.gx},${p.gy}`, p]));
  // Rock underside: a jagged cone under the island, with strata and glowing veins.
  const r = rng(42);
  const tip = { x: 515, y: 640 };
  const a = { x: 160, y: 318 }, f = { x: 505, y: 515 }, b = { x: 845, y: 318 };
  const edge = from => Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, wob = i === 8 ? 0 : 1;
    return { x: from.x + (tip.x - from.x) * t + (r() - 0.5) * 34 * (1 - t * 0.6) * wob, y: from.y + (tip.y - from.y) * Math.pow(t, 0.8) + (r() - 0.5) * 10 * wob };
  });
  const left = edge(a), right = edge(b); // each runs from the island's corner down to the tip
  const outline = [a, f, b, ...right.slice(1), ...left.slice(1, -1).reverse()];
  const rock = g.createLinearGradient(0, 300, 0, 650);
  rock.addColorStop(0, '#54447e'); rock.addColorStop(0.45, '#3a2d5c'); rock.addColorStop(1, '#1d1636');
  g.fillStyle = rock;
  poly(g, outline);
  g.fill();
  g.strokeStyle = 'rgba(201,162,255,.35)';
  g.lineWidth = 2;
  for (const side of [left, right]) { g.beginPath(); g.moveTo(side[0].x, side[0].y); for (const p of side) g.lineTo(p.x, p.y); g.stroke(); }
  g.save();
  poly(g, outline);
  g.clip();
  // Facets: darker wedges so the rock reads as a lumpy mass, not a flat cone.
  for (let i = 0; i < 9; i++) {
    const x = 220 + i * 70 + (r() - 0.5) * 30;
    g.fillStyle = `rgba(10,6,24,${0.18 + r() * 0.14})`;
    g.beginPath(); g.moveTo(x, 330); g.lineTo(x + 40 + r() * 30, 340); g.lineTo(tip.x + (x - tip.x) * 0.25, 600 + r() * 30); g.closePath(); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,.06)';
  g.lineWidth = 3;
  for (let y = 360; y < 650; y += 26) { g.beginPath(); g.moveTo(100, y); for (let x = 100; x <= 900; x += 40) g.lineTo(x, y + Math.sin(x * 0.03 + y) * 6); g.stroke(); }
  for (let i = 0; i < 26; i++) {
    const x = 220 + r() * 580, y = 380 + r() * 220;
    const c = r() > 0.5 ? '#7ee8ff' : '#c9a2ff';
    const v = g.createRadialGradient(x, y, 0, x, y, 9);
    v.addColorStop(0, rgba(c, 0.85)); v.addColorStop(1, rgba(c, 0));
    g.fillStyle = v;
    g.fillRect(x - 9, y - 9, 18, 18);
  }
  g.restore();

  // Tiles, back to front, each with its side faces where the ground drops away.
  const order = [];
  for (let gx = 0; gx < FARM.size; gx++) for (let gy = 0; gy < FARM.size; gy++) if (onIsland(gx, gy)) order.push([gx, gy]);
  order.sort((p, q) => p[0] + p[1] - (q[0] + q[1]) || p[0] - q[0]);
  const speck = rng(7);
  for (const [gx, gy] of order) {
    const h = elevation(gx, gy);
    const T = iso(gx, gy, h), R = iso(gx + 1, gy, h), B = iso(gx + 1, gy + 1, h), L = iso(gx, gy + 1, h);
    const dropL = onIsland(gx, gy + 1) ? (h - elevation(gx, gy + 1)) * FARM.lift : SKIRT + h * FARM.lift;
    const dropR = onIsland(gx + 1, gy) ? (h - elevation(gx + 1, gy)) * FARM.lift : SKIRT + h * FARM.lift;
    if (dropL > 0) {
      g.fillStyle = SIDE_L; poly(g, [L, B, down(B, dropL), down(L, dropL)]); g.fill();
      g.fillStyle = isTerrace(gx, gy) ? '#463a78' : LIP_L; poly(g, [L, B, down(B, 7), down(L, 7)]); g.fill();
    }
    if (dropR > 0) {
      g.fillStyle = SIDE_R; poly(g, [B, R, down(R, dropR), down(B, dropR)]); g.fill();
      g.fillStyle = isTerrace(gx, gy) ? '#51448a' : LIP_R; poly(g, [B, R, down(R, 7), down(B, 7)]); g.fill();
    }
    const plot = field.get(`${gx},${gy}`);
    const base = isTerrace(gx, gy) ? pal.terrace[(gx + gy) % 2] : pal.meadow[(gx + gy) % 2];
    g.fillStyle = plot ? SOIL : base;
    poly(g, [T, R, B, L]);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.18)';
    g.lineWidth = 1;
    g.stroke();
    if (plot) {
      // Furrows run along the tile's gx axis.
      g.strokeStyle = FURROW;
      g.lineWidth = 3;
      for (const t of [0.3, 0.5, 0.7]) {
        const p = iso(gx + 0.15, gy + t, h), q = iso(gx + 0.85, gy + t, h);
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
      }
      g.strokeStyle = '#5a3d63';
      g.lineWidth = 2;
      poly(g, [iso(gx + 0.06, gy + 0.06, h), iso(gx + 0.94, gy + 0.06, h), iso(gx + 0.94, gy + 0.94, h), iso(gx + 0.06, gy + 0.94, h)]);
      g.stroke();
    } else if (PROPS.has(`${gx},${gy}`)) {
      const c = iso(gx + 0.5, gy + 0.5, h);
      for (const [dx, dy, rr, col] of [[-12, 2, 5, '#ffe07a'], [-4, -3, 7, '#d69bff'], [9, 4, 4, '#7ee8ff']]) {
        g.fillStyle = '#e9e4f5'; g.fillRect(c.x + dx - 1.2, c.y + dy - rr - 6, 2.4, rr + 6);
        const gl = g.createRadialGradient(c.x + dx, c.y + dy - rr - 6, 0, c.x + dx, c.y + dy - rr - 6, rr * 3);
        gl.addColorStop(0, rgba(col, 0.45)); gl.addColorStop(1, rgba(col, 0));
        g.fillStyle = gl; g.fillRect(c.x + dx - rr * 3, c.y + dy - rr * 4 - 6, rr * 6, rr * 6);
        g.fillStyle = col; g.beginPath(); g.ellipse(c.x + dx, c.y + dy - rr - 6, rr, rr * 0.6, 0, Math.PI, Math.PI * 2); g.fill();
      }
    } else if (STONES.has(`${gx},${gy}`)) {
      const c = iso(gx + 0.5, gy + 0.5, h);
      g.fillStyle = '#8f8ab0';
      for (const [dx, dy, rx] of [[-14, -2, 9], [6, 5, 7], [16, -6, 5]]) { g.beginPath(); g.ellipse(c.x + dx, c.y + dy, rx, rx * 0.5, 0, 0, Math.PI * 2); g.fill(); }
    } else {
      // Moss specks.
      g.fillStyle = 'rgba(255,255,255,.07)';
      for (let i = 0; i < 4; i++) {
        const p = iso(gx + 0.15 + speck() * 0.7, gy + 0.15 + speck() * 0.7, h);
        g.beginPath(); g.ellipse(p.x, p.y, 3 + speck() * 3, 1.5 + speck(), 0, 0, Math.PI * 2); g.fill();
      }
    }
  }
}

// ---------- animated pieces ----------
function drawDecor(g, d, t, data) {
  const c = tileCenter(d.gx, d.gy);
  g.save();
  g.translate(c.x, c.y);
  if (d.id === 'dome') {
    g.fillStyle = '#7d7aa0'; g.beginPath(); g.ellipse(0, 0, 48, 22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2d5a52'; g.beginPath(); g.ellipse(0, -2, 42, 18, 0, 0, Math.PI * 2); g.fill();
    for (const [x, y, rr, col] of [[-18, -8, 9, '#7ee0c3'], [8, -12, 12, '#9ff5d0'], [20, -4, 7, '#ffe07a'], [-4, -4, 6, '#d69bff']]) { g.fillStyle = col; g.beginPath(); g.arc(x, y - 4, rr, 0, Math.PI * 2); g.fill(); }
    const glass = g.createLinearGradient(-40, -60, 40, 0);
    glass.addColorStop(0, 'rgba(190,235,255,.38)'); glass.addColorStop(1, 'rgba(120,170,255,.12)');
    g.fillStyle = glass;
    g.beginPath(); g.ellipse(0, -2, 42, 52, 0, Math.PI, Math.PI * 2); g.ellipse(0, -2, 42, 18, 0, 0, Math.PI); g.fill();
    g.strokeStyle = 'rgba(220,245,255,.7)'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, -2, 42, 52, 0, Math.PI, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.ellipse(0, -2, 30, 40, 0, Math.PI * 1.2, Math.PI * 1.42); g.stroke();
  } else if (d.id === 'rocket') {
    g.fillStyle = '#2a2440'; g.beginPath(); g.ellipse(0, 0, 30, 13, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8f8ab0'; g.lineWidth = 3; g.beginPath(); g.moveTo(-20, 0); g.lineTo(-12, -30); g.moveTo(20, 0); g.lineTo(12, -30); g.stroke();
    const launch = data.perfect;
    if (launch || data.fuel > 0) {
      const flick = 0.75 + 0.25 * Math.sin(t * 22) + 0.1 * Math.sin(t * 37);
      const len = (launch ? 30 : 12) * flick;
      const fl = g.createLinearGradient(0, -8, 0, -8 + len);
      fl.addColorStop(0, 'rgba(255,240,170,.95)'); fl.addColorStop(0.5, 'rgba(255,150,80,.8)'); fl.addColorStop(1, 'rgba(255,80,80,0)');
      g.fillStyle = fl;
      g.beginPath(); g.moveTo(-8, -10); g.quadraticCurveTo(0, -10 + len * 1.4, 8, -10); g.closePath(); g.fill();
    }
    g.fillStyle = '#ef7b6f';
    g.beginPath(); g.moveTo(-10, -14); g.lineTo(-22, -4); g.lineTo(-20, -26); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(10, -14); g.lineTo(22, -4); g.lineTo(20, -26); g.closePath(); g.fill();
    const body = g.createLinearGradient(-12, 0, 12, 0);
    body.addColorStop(0, '#c9c3dc'); body.addColorStop(0.45, '#f6f2ff'); body.addColorStop(1, '#a9a2c4');
    g.fillStyle = body;
    g.beginPath(); g.moveTo(-12, -10); g.lineTo(-12, -62); g.quadraticCurveTo(0, -96, 12, -62); g.lineTo(12, -10); g.closePath(); g.fill();
    g.fillStyle = '#ef7b6f';
    g.beginPath(); g.moveTo(-11, -66); g.quadraticCurveTo(0, -96, 11, -66); g.closePath(); g.fill();
    g.fillStyle = '#2b3c7a'; g.beginPath(); g.arc(0, -46, 6.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = rgba('#9fd4ff', 0.5 + 0.4 * data.fuel); g.beginPath(); g.arc(0, -46, 4.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(-1.8, -48, 1.6, 0, Math.PI * 2); g.fill();
  } else if (d.id === 'tank') {
    const fill = Math.max(0, Math.min(1, data.fuel));
    g.fillStyle = '#58547a'; g.beginPath(); g.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(160,200,255,.12)'; g.fillRect(-18, -58, 36, 58);
    const lv = 56 * fill;
    if (lv > 0) {
      const lg = g.createLinearGradient(0, -lv, 0, 0);
      lg.addColorStop(0, 'rgba(160,250,255,.95)'); lg.addColorStop(1, 'rgba(70,170,230,.85)');
      g.fillStyle = lg; g.fillRect(-16, -lv, 32, lv);
      g.fillStyle = 'rgba(220,255,255,.9)'; g.beginPath(); g.ellipse(0, -lv, 16, 6, 0, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 3; i++) {
        const y = -((t * 14 + i * 19) % Math.max(8, lv));
        g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(-8 + i * 8, y, 1.6, 0, Math.PI * 2); g.fill();
      }
    }
    g.strokeStyle = 'rgba(220,235,255,.7)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-18, 0); g.lineTo(-18, -58); g.moveTo(18, 0); g.lineTo(18, -58); g.stroke();
    g.fillStyle = '#8f8ab0'; g.beginPath(); g.ellipse(0, -58, 20, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6b678f'; g.beginPath(); g.ellipse(0, -60, 12, 4, 0, 0, Math.PI * 2); g.fill();
  } else if (d.id === 'antenna') {
    g.strokeStyle = '#a7a2c4'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-8, 0); g.lineTo(0, -64); g.lineTo(8, 0); g.moveTo(-5, -20); g.lineTo(5, -20); g.moveTo(-3, -40); g.lineTo(3, -40); g.stroke();
    g.save(); g.translate(0, -60); g.rotate(-0.5 + Math.sin(t * 0.4) * 0.25);
    g.fillStyle = '#d9d4ec'; g.beginPath(); g.ellipse(0, 0, 14, 6, 0, 0, Math.PI); g.fill();
    g.strokeStyle = '#d9d4ec'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, -10); g.stroke();
    g.restore();
    const col = { fed: '#7ee0c3', hungry: '#ffc98f', starving: '#ef7b6f', dead: '#8a8598' }[data.hunger] || '#7ee0c3';
    const on = (Math.sin(t * 3.4) + 1) / 2;
    const glow = g.createRadialGradient(0, -68, 0, 0, -68, 16);
    glow.addColorStop(0, rgba(col, 0.9 * on)); glow.addColorStop(1, rgba(col, 0));
    g.fillStyle = glow; g.fillRect(-16, -84, 32, 32);
    g.fillStyle = col; g.beginPath(); g.arc(0, -68, 3, 0, Math.PI * 2); g.fill();
  } else if (d.id === 'crystals') {
    for (const [x, hgt, w, lean, col] of [[-10, 30, 8, -0.25, '#b9a7ff'], [4, 42, 10, 0.08, '#d6c9ff'], [14, 24, 7, 0.35, '#9fd4ff']]) {
      g.save(); g.translate(x, 0); g.rotate(lean);
      g.fillStyle = col; g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -hgt * 0.75); g.lineTo(0, -hgt); g.lineTo(w / 2, -hgt * 0.75); g.lineTo(w / 2, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -hgt * 0.75); g.lineTo(0, -hgt); g.lineTo(0, 0); g.closePath(); g.fill();
      g.restore();
    }
  }
  g.restore();
}

function star5(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function drawCrop(g, p, gro, t, data) {
  const c = tileCenter(p.gx, p.gy);
  const pal = PALETTE[data.hunger] || PALETTE.fed;
  const wilt = 1 - pal.crop;
  const sway = Math.sin(t * 1.6 + p.gx * 1.3 + p.gy) * 0.06 + wilt * 0.35;
  const col = mix(p.color, '#8a8598', wilt * 0.8);
  g.save();
  g.translate(c.x, c.y + 2);
  g.scale(1.35, 1.35);
  // Glow under a grown crop.
  if (gro > 0.6) {
    const pulse = 0.75 + 0.25 * Math.sin(t * 2 + p.gx);
    const r = 36;
    const gl = g.createRadialGradient(0, -18, 0, 0, -18, r);
    gl.addColorStop(0, rgba(col, 0.42 * (gro - 0.6) / 0.4 * pulse * pal.crop)); gl.addColorStop(1, rgba(col, 0));
    g.fillStyle = gl; g.fillRect(-r, -18 - r, r * 2, r * 2);
  }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 0, 14 + 8 * gro, 5 + 2 * gro, 0, 0, Math.PI * 2); g.fill();
  g.rotate(sway);
  // Sprout leaves (fade as the crop takes over).
  const sp = Math.max(0, 1 - gro * 1.4);
  if (sp > 0) {
    g.globalAlpha = sp;
    g.strokeStyle = '#6fae86'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -12); g.stroke();
    g.fillStyle = '#86c99c';
    g.beginPath(); g.ellipse(-6, -13, 6, 3, -0.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(6, -14, 6, 3, 0.5, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  const a = Math.max(0, (gro - 0.15) / 0.85);
  if (a > 0) {
    const k = 0.45 + 0.55 * a;
    g.globalAlpha = Math.min(1, a * 1.6);
    g.scale(k, k);
    g.lineCap = 'round';
    const stem = mix('#5fa57c', '#8a8598', wilt);
    if (p.crop === 'comet') {
      g.strokeStyle = stem; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -46); g.stroke();
      g.fillStyle = stem; g.beginPath(); g.ellipse(-8, -18, 10, 3.5, -0.6, 0, Math.PI * 2); g.ellipse(8, -26, 10, 3.5, 0.6, 0, Math.PI * 2); g.fill();
      const tail = g.createLinearGradient(0, -50, 22, -24);
      tail.addColorStop(0, rgba(col, 0.9)); tail.addColorStop(1, rgba(col, 0));
      g.fillStyle = tail; g.beginPath(); g.moveTo(-5, -52); g.quadraticCurveTo(20, -40, 24, -22); g.quadraticCurveTo(10, -40, 5, -44); g.closePath(); g.fill();
      g.fillStyle = col; g.beginPath(); g.ellipse(0, -54, 7, 12, 0.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-2, -58, 2.5, 5, 0.2, 0, Math.PI * 2); g.fill();
    } else if (p.crop === 'moonbulb') {
      g.strokeStyle = stem; g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-10, -22, 4, -36); g.stroke();
      g.fillStyle = stem; g.beginPath(); g.ellipse(-9, -10, 9, 3.5, -0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = col; g.beginPath(); g.arc(6, -44, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(20,16,40,.55)'; g.beginPath(); g.arc(10, -47, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = col; g.beginPath(); g.arc(3, -46, 1.6, 0, Math.PI * 2); g.fill();
    } else if (p.crop === 'starfruit') {
      g.fillStyle = stem;
      for (const [x, y, r] of [[-9, -12, 11], [9, -13, 11], [0, -22, 12]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = col;
      for (const [x, y, r] of [[-9, -20, 6], [10, -18, 5.5], [1, -33, 6.5]]) { star5(g, x, y, r); g.fill(); }
    } else if (p.crop === 'nebula') {
      g.lineWidth = 4;
      for (const [dir, h] of [[-1, 40], [1, 44], [0, 52]]) {
        const fr = g.createLinearGradient(0, 0, dir * 16, -h);
        fr.addColorStop(0, stem); fr.addColorStop(1, col);
        g.strokeStyle = fr;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(dir * 20, -h * 0.6, dir * 8, -h); g.arc(dir * 8 - dir * 5, -h, 5, 0, Math.PI * 1.4 * (dir || 1)); g.stroke();
      }
    } else if (p.crop === 'skybloom') {
      g.strokeStyle = stem; g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -36); g.stroke();
      g.fillStyle = stem; g.beginPath(); g.ellipse(7, -14, 9, 3.5, 0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = col;
      for (let i = 0; i < 5; i++) { const an = i * Math.PI * 2 / 5 + t * 0.3; g.beginPath(); g.ellipse(Math.cos(an) * 8, -40 + Math.sin(an) * 8, 7, 4.5, an, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(0, -40, 4.5, 0, Math.PI * 2); g.fill();
    } else {
      for (const [x, hgt, w, lean] of [[-8, 30, 9, -0.3], [3, 44, 11, 0.05], [12, 24, 8, 0.4]]) {
        g.save(); g.translate(x, 0); g.rotate(lean);
        g.fillStyle = col; g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -hgt * 0.75); g.lineTo(0, -hgt); g.lineTo(w / 2, -hgt * 0.75); g.lineTo(w / 2, 0); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -hgt * 0.75); g.lineTo(0, -hgt); g.lineTo(0, 0); g.closePath(); g.fill();
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }
  g.restore();
  // An unfinished task: a dashed ring that bobs above the sprout.
  if (!p.grown && gro < 0.5) {
    const y = c.y - 30 + Math.sin(t * 2.2 + p.gx) * 3;
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.setLineDash([3, 4]);
    g.beginPath(); g.ellipse(c.x, y, 7, 7, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
}

// ---------- painter ----------
function createPainter(root, reducedAtStart) {
  const canvas = root.querySelector('canvas');
  const stage = root.querySelector('.farm-stage');
  const crewEl = root.querySelector('.farm-crew');
  const tip = root.querySelector('.farm-tip');
  const g = canvas?.getContext?.('2d');
  if (!g) return { root, destroy() {}, setReduced() {}, fx() {} };
  let data;
  try { data = JSON.parse(root.dataset.farm || '{}'); } catch { data = {}; }
  data.plots ||= []; data.crew ||= [];
  for (const p of data.plots) if (!growth.has(p.id)) growth.set(p.id, p.grown ? 1 : 0);

  let isReduced = reducedAtStart;
  let scale = 1, sky = null, island = null, raf = 0, last = 0, visible = true, alive = true;
  let tilt = { x: 0, y: 0, tx: 0, ty: 0 }, hover = null;
  let aurora = data.perfect ? 1 : 0, shooting = [], nextShot = 2, burst = [];
  const r = rng(1234);
  const stars = Array.from({ length: 220 }, () => ({ x: r() * W, y: r() * H, s: 0.4 + r() * 1.5, l: Math.floor(r() * 3), p: r() * 6.28, v: 0.6 + r() * 2.2 }));
  const debris = [[120, 300, 16, 0.2], [880, 380, 20, 1.4], [260, 590, 12, 2.2], [770, 600, 14, 3.1], [930, 250, 10, 4.2], [60, 420, 11, 5.0]];

  function layer(paint) {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const x = c.getContext('2d');
    x.setTransform(scale, 0, 0, scale, 0, 0);
    paint(x);
    return c;
  }

  function resize() {
    const w = canvas.clientWidth;
    if (!w) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const px = Math.round(w * dpr);
    if (px === canvas.width && sky) return;
    canvas.width = px;
    canvas.height = Math.round(px * H / W);
    scale = px / W;
    sky = layer(paintSky);
    island = layer(x => paintIsland(x, data));
    frame(performance.now()); // never blank, even before the first animation frame
  }

  function frame(now) {
    const t = now / 1000;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 5);
    tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 5);
    const bob = isReduced ? 0 : Math.sin(t * 0.7) * 4;
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Sky drifts against the tilt, the island floats.
    g.drawImage(sky, -tilt.x * 10 * scale, -tilt.y * 8 * scale);
    g.setTransform(scale, 0, 0, scale, 0, 0);
    for (const s of stars) {
      const a = isReduced ? 0.7 : 0.45 + 0.55 * Math.abs(Math.sin(t * s.v + s.p));
      const k = (s.l + 1) * 6;
      g.fillStyle = `rgba(255,250,240,${a * (0.45 + s.l * 0.25)})`;
      g.fillRect(s.x - tilt.x * k, s.y - tilt.y * k, s.s, s.s);
    }
    if (!isReduced) {
      aurora += ((data.perfect ? 1 : 0) - aurora) * Math.min(1, dt * 1.5);
      nextShot -= dt;
      if (nextShot <= 0) { shooting.push({ x: 300 + Math.random() * 700, y: -10 + Math.random() * 120, life: 1 }); nextShot = 5 + Math.random() * 6; }
    }
    if (aurora > 0.02) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const [col, off, amp, y0] of [['#7ee0c3', 0, 22, 70], ['#c9a2ff', 2, 18, 100], ['#9fd4ff', 4, 14, 130]]) {
        const grd = g.createLinearGradient(0, y0 - 40, 0, y0 + 40);
        grd.addColorStop(0, rgba(col, 0)); grd.addColorStop(0.5, rgba(col, 0.22 * aurora)); grd.addColorStop(1, rgba(col, 0));
        g.fillStyle = grd;
        g.beginPath(); g.moveTo(0, y0 + 40);
        for (let x = 0; x <= W; x += 25) g.lineTo(x, y0 + Math.sin(x * 0.012 + t * 0.6 + off) * amp - 30);
        for (let x = W; x >= 0; x -= 25) g.lineTo(x, y0 + Math.sin(x * 0.012 + t * 0.6 + off) * amp + 30);
        g.closePath(); g.fill();
      }
      g.restore();
    }
    shooting = shooting.filter(s => (s.life -= dt * 0.9) > 0);
    for (const s of shooting) {
      const x = s.x - (1 - s.life) * 420, y = s.y + (1 - s.life) * 200;
      const tr = g.createLinearGradient(x, y, x + 90, y - 43);
      tr.addColorStop(0, `rgba(255,255,255,${s.life})`); tr.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = tr; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 90, y - 43); g.stroke();
    }
    for (const [x, y, sz, ph] of debris) {
      const yy = y + (isReduced ? 0 : Math.sin(t * 0.8 + ph) * 6);
      g.fillStyle = '#5a4c80'; g.beginPath(); g.moveTo(x, yy - sz * 0.5); g.lineTo(x + sz, yy); g.lineTo(x, yy + sz * 0.5); g.lineTo(x - sz, yy); g.closePath(); g.fill();
      g.fillStyle = '#32284d'; g.beginPath(); g.moveTo(x - sz, yy); g.lineTo(x, yy + sz * 0.5); g.lineTo(x, yy + sz * 1.3); g.closePath(); g.fill();
      g.fillStyle = '#241c3a'; g.beginPath(); g.moveTo(x + sz, yy); g.lineTo(x, yy + sz * 0.5); g.lineTo(x, yy + sz * 1.3); g.closePath(); g.fill();
    }
    // Island and everything standing on it, back to front.
    g.setTransform(1, 0, 0, 1, 0, bob * scale);
    g.drawImage(island, 0, 0);
    g.setTransform(scale, 0, 0, scale, 0, bob * scale);
    const items = [
      ...DECOR.map(d => ({ depth: d.gx + d.gy, draw: () => drawDecor(g, d, t, data) })),
      ...data.plots.map(p => ({ depth: p.gx + p.gy + 0.1, draw: () => {
        const target = p.grown ? 1 : 0;
        let v = growth.get(p.id) ?? target;
        v = isReduced ? target : v + (target - v) * Math.min(1, dt * 2.2);
        if (Math.abs(target - v) < 0.002) v = target;
        growth.set(p.id, v);
        drawCrop(g, p, v, t, data);
      } })),
    ].sort((a, b) => a.depth - b.depth);
    for (const c of data.crew) {
      const ce = tileCenter(c.gx, c.gy);
      const k = isReduced ? 1 : 0.92 + Math.sin(t * 1.57 + c.gx) * 0.08;
      if (c.sel) {
        g.strokeStyle = 'rgba(255,243,176,.75)'; g.lineWidth = 2.5; g.setLineDash([6, 5]); g.lineDashOffset = isReduced ? 0 : -t * 12;
        g.beginPath(); g.ellipse(ce.x, ce.y, 38, 17, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
      g.fillStyle = 'rgba(0,0,0,.32)'; g.beginPath(); g.ellipse(ce.x, ce.y, 28 * k, 11 * k, 0, 0, Math.PI * 2); g.fill();
    }
    for (const it of items) it.draw();
    if (hover) {
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2;
      poly(g, [iso(hover.gx, hover.gy), iso(hover.gx + 1, hover.gy), iso(hover.gx + 1, hover.gy + 1), iso(hover.gx, hover.gy + 1)]);
      g.stroke();
    }
    burst = burst.filter(b => (b.life -= dt) > 0);
    for (const b of burst) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 30 * dt;
      g.fillStyle = rgba(b.color, Math.min(1, b.life * 1.5));
      star5(g, b.x, b.y, b.size * (0.6 + b.life * 0.4)); g.fill();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (crewEl) crewEl.style.transform = bob ? `translateY(${(bob * canvas.clientWidth / W).toFixed(2)}px)` : '';
    if (stage && !isReduced) stage.style.transform = `perspective(1600px) rotateX(${(-tilt.y * 2.5).toFixed(3)}deg) rotateY(${(tilt.x * 3.5).toFixed(3)}deg)`;
  }

  function loop(now) {
    raf = 0;
    if (!alive || !visible || isReduced) return;
    frame(now);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf && alive && visible && !isReduced && sky) { last = 0; raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  const point = e => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H, rect };
  };
  const plotAt = (x, y) => {
    for (const dy of [0, 18, 36]) {
      const tile = tileAt(x, y + dy);
      const p = tile && data.plots.find(q => q.gx === tile.gx && q.gy === tile.gy);
      if (p) return p;
    }
    return null;
  };
  function onMove(e) {
    const { x, y, rect } = point(e);
    if (!isReduced) { tilt.tx = Math.max(-1, Math.min(1, x / W * 2 - 1)); tilt.ty = Math.max(-1, Math.min(1, y / H * 2 - 1)); }
    if (e.target !== canvas) return;
    const p = plotAt(x, y);
    hover = p;
    canvas.style.cursor = p ? 'pointer' : '';
    if (tip) {
      tip.hidden = !p;
      if (p) {
        tip.textContent = p.grown ? `${p.cropName} · ${p.name} · grown at ${p.level}` : `${p.cropName} sprout · ${p.name} · finish it to grow`;
        tip.style.left = `${(x / W) * 100}%`;
        tip.style.top = `${((y - 40) / H) * 100}%`;
      }
    }
    if (isReduced) frame(performance.now());
    void rect;
  }
  function onLeave() { tilt.tx = 0; tilt.ty = 0; hover = null; if (tip) tip.hidden = true; canvas.style.cursor = ''; if (isReduced) frame(performance.now()); }
  function onClick(e) {
    const { x, y } = point(e);
    const p = plotAt(x, y);
    if (!p) return;
    const row = document.querySelector(`[data-task-row="${CSS.escape(p.id)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: isReduced ? 'auto' : 'smooth' });
    row.querySelector('.tick')?.focus({ preventScroll: true });
    row.classList.remove('is-flashing'); void row.offsetWidth; row.classList.add('is-flashing');
    setTimeout(() => row.classList.remove('is-flashing'), 900);
  }

  const ro = 'ResizeObserver' in globalThis ? new ResizeObserver(() => { resize(); start(); }) : null;
  ro?.observe(canvas);
  const io = 'IntersectionObserver' in globalThis ? new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; if (visible) { resize(); start(); } else stop(); }, { rootMargin: '80px' }) : null;
  io?.observe(root);
  const onVis = () => { visible = !document.hidden; visible ? start() : stop(); };
  document.addEventListener('visibilitychange', onVis);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);
  resize();
  start();

  return {
    root,
    setReduced(v) {
      if (v === isReduced) return;
      isReduced = v;
      if (v) { stop(); if (stage) stage.style.transform = ''; tilt = { x: 0, y: 0, tx: 0, ty: 0 }; frame(performance.now()); } else start();
    },
    fx(type, id) {
      if (isReduced) return;
      if (type === 'grow') {
        const p = data.plots.find(q => q.id === id);
        if (!p) return;
        const c = tileCenter(p.gx, p.gy);
        for (let i = 0; i < 18; i++) {
          const an = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
          burst.push({ x: c.x, y: c.y - 24, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 60, life: 0.8 + Math.random() * 0.6, color: p.color, size: 3 + Math.random() * 3 });
        }
      }
      if (type === 'perfect') {
        for (let i = 0; i < 6; i++) shooting.push({ x: 400 + Math.random() * 600, y: -20 + Math.random() * 160, life: 1 + i * 0.15 });
        for (const p of data.plots) farmFx('grow', p.id);
      }
    },
    destroy() {
      alive = false;
      stop();
      ro?.disconnect(); io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
    },
  };
}
