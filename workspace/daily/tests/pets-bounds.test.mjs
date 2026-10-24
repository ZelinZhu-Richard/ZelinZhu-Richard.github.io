// Extents of the pet art in the 160 viewBox (CONTENT.md §A.1: the character fits a 120 box, everything
// stays inside the 160 frame). The <svg> root has overflow="visible", so anything drawn past the frame
// bleeds into neighbouring cards and text. A small static getBBox equivalent (no DOM): paths (incl.
// arcs and curves, sampled), circles, ellipses, rects; nested transforms (with CSS transform-origin);
// clip-paths; half the stroke width. Static pose only (what getBBox reports).
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPet, renderEgg, SPECIES, LIVE_MOODS } from '../pets/index.js';

// Static SVG bounds (getBBox-equivalent, stroke-inclusive, clip-aware) for the pet markup. No DOM.
// boundsOf(svg, rootClass) → { x0, y0, x1, y1, worst } for the subtree of the first <g class="rootClass …">.

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const I = [1, 0, 0, 1, 0, 0];
const ap = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function parseTransform(s) {
  let m = I;
  if (!s) return m;
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = (args.match(NUM) || []).map(Number);
    let t = I;
    if (fn === 'translate') t = [1, 0, 0, 1, a[0], a[1] || 0];
    else if (fn === 'scale') t = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
    else if (fn === 'rotate') {
      const r = (a[0] * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
      t = [c, sn, -sn, c, 0, 0];
      if (a.length >= 3) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
    } else if (fn === 'matrix') t = a;
    else if (fn === 'skewX') t = [1, 0, Math.tan((a[0] * Math.PI) / 180), 1, 0, 0];
    else if (fn === 'skewY') t = [1, Math.tan((a[0] * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, t);
  }
  return m;
}

function arcPoints(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (!rx || !ry) return [[x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const p = (phi * Math.PI) / 180, c = Math.cos(p), s = Math.sin(p);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let k = Math.sqrt(Math.max(0, num / den));
  if (fa === fs) k = -k;
  const cxp = (k * rx * y1p) / ry, cyp = (-k * ry * x1p) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const out = [];
  for (let i = 1; i <= 24; i++) {
    const t = t1 + (dt * i) / 24;
    out.push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]);
  }
  return out;
}

function pathPoints(d) {
  const pts = [];
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null;
  const n = () => Number(toks[i++]);
  const cubic = (p0, p1, p2, p3) => { for (let k = 1; k <= 16; k++) { const t = k / 16, u = 1 - t; pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } };
  const quad = (p0, p1, p2) => { for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]); } };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { x = sx; y = sy; pts.push([x, y]); lc = lq = null; continue; }
    if (C === 'M') { x = ox + n(); y = oy + n(); sx = x; sy = y; pts.push([x, y]); cmd = rel ? 'l' : 'L'; lc = lq = null; continue; }
    if (C === 'L') { x = ox + n(); y = oy + n(); pts.push([x, y]); lc = lq = null; continue; }
    if (C === 'H') { x = ox + n(); pts.push([x, y]); lc = lq = null; continue; }
    if (C === 'V') { y = oy + n(); pts.push([x, y]); lc = lq = null; continue; }
    if (C === 'C') { const p1 = [ox + n(), oy + n()], p2 = [ox + n(), oy + n()], p3 = [ox + n(), oy + n()]; cubic([x, y], p1, p2, p3); lc = p2; lq = null; [x, y] = p3; continue; }
    if (C === 'S') { const p1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; const p2 = [ox + n(), oy + n()], p3 = [ox + n(), oy + n()]; cubic([x, y], p1, p2, p3); lc = p2; lq = null; [x, y] = p3; continue; }
    if (C === 'Q') { const p1 = [ox + n(), oy + n()], p2 = [ox + n(), oy + n()]; quad([x, y], p1, p2); lq = p1; lc = null; [x, y] = p2; continue; }
    if (C === 'T') { const p1 = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y]; const p2 = [ox + n(), oy + n()]; quad([x, y], p1, p2); lq = p1; lc = null; [x, y] = p2; continue; }
    if (C === 'A') { const rx = n(), ry = n(), ph = n(), fa = n(), fs = n(), x2 = ox + n(), y2 = oy + n(); pts.push(...arcPoints(x, y, rx, ry, ph, fa, fs, x2, y2)); x = x2; y = y2; lc = lq = null; continue; }
    i++; // unknown token
  }
  return pts;
}

const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));

function shapePoints(tag, a) {
  const N = (k, d = 0) => (a[k] != null ? Number(a[k]) : d);
  if (tag === 'path') return pathPoints(a.d || '');
  if (tag === 'circle' || tag === 'ellipse') {
    const rx = tag === 'circle' ? N('r') : N('rx'), ry = tag === 'circle' ? N('r') : N('ry');
    return Array.from({ length: 32 }, (_, k) => [N('cx') + rx * Math.cos((k * Math.PI) / 16), N('cy') + ry * Math.sin((k * Math.PI) / 16)]);
  }
  if (tag === 'rect') { const x = N('x'), y = N('y'), w = N('width'), h = N('height'); return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]; }
  if (tag === 'line') return [[N('x1'), N('y1')], [N('x2'), N('y2')]];
  if (tag === 'polygon' || tag === 'polyline') { const v = (a.points.match(NUM) || []).map(Number); const o = []; for (let k = 0; k < v.length; k += 2) o.push([v[k], v[k + 1]]); return o; }
  return [];
}

const EMPTY = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
const grow = (b, [x, y], pad = 0) => { b.x0 = Math.min(b.x0, x - pad); b.y0 = Math.min(b.y0, y - pad); b.x1 = Math.max(b.x1, x + pad); b.y1 = Math.max(b.y1, y + pad); };
const inter = (a, c) => (c ? { x0: Math.max(a.x0, c.x0), y0: Math.max(a.y0, c.y0), x1: Math.min(a.x1, c.x1), y1: Math.min(a.y1, c.y1) } : a);

/** Walk markup; returns bounds. defs: map id → clipPath inner markup. */
function walk(markup, defs, m0 = I, clip0 = null, inherit = { sw: 0, stroke: false }, only = null, solidOnly = false) {
  const total = EMPTY();
  const stack = [{ m: m0, clip: clip0, inh: inherit, skip: false, active: !only }];
  const re = /<(\/?)([a-zA-Z]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let mt;
  while ((mt = re.exec(markup))) {
    const [, close, tag, rawA, self] = mt;
    const top = stack[stack.length - 1];
    if (close) { stack.pop(); continue; }
    const a = attrs(rawA);
    const skipTags = ['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'filter', 'pattern', 'symbol', 'text', 'title'];
    let local = a.transform ? parseTransform(a.transform) : null;
    const to = a.transform && a.style && a.style.match(/transform-origin:\s*(-?[\d.]+)px\s+(-?[\d.]+)px/);
    if (to) local = mul(mul([1, 0, 0, 1, +to[1], +to[2]], local), [1, 0, 0, 1, -to[1], -to[2]]);
    let m = local ? mul(top.m, local) : top.m;
    let clip = top.clip;
    const cp = a['clip-path'] && a['clip-path'].match(/url\(#([^)]+)\)/);
    if (cp && defs[cp[1]] != null) clip = inter(walk(defs[cp[1]], defs, m, null, { sw: 0, stroke: false }), clip || { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 });
    const stroke = a.stroke != null ? a.stroke !== 'none' : top.inh.stroke;
    const sw = a['stroke-width'] != null ? Number(a['stroke-width']) : (a.stroke != null && a.stroke !== 'none' && top.inh.sw === 0 ? 1 : top.inh.sw);
    const active = top.active || (only && (` ${a.class || ''} `).includes(` ${only} `));
    const node = { m, clip, inh: { stroke, sw }, skip: top.skip || skipTags.includes(tag), active };
    const faded = solidOnly && /^url\(/.test(a.fill || '') && !(a.stroke && a.stroke !== 'none');
    if (!node.skip && node.active && !faded && !['g', 'svg'].includes(tag)) {
      const pts = shapePoints(tag, a);
      if (pts.length) {
        const sc = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
        const pad = stroke ? (sw * sc) / 2 : 0;
        let b = EMPTY();
        for (const p of pts) grow(b, ap(m, p), pad);
        b = inter(b, clip);
        if (b.x0 < b.x1 && b.y0 < b.y1) { grow(total, [b.x0, b.y0]); grow(total, [b.x1, b.y1]); }
      }
    }
    if (!self) stack.push(node);
  }
  return total;
}

function collectDefs(svg) {
  const defs = {};
  for (const [, id, inner] of svg.matchAll(/<clipPath id="([^"]+)"[^>]*>(.*?)<\/clipPath>/g)) defs[id] = inner;
  return defs;
}

/** Bounds of the subtree(s) of elements whose class list contains `cls` (in root viewBox units). */
function boundsOf(svg, cls, { solidOnly = false } = {}) {
  const body = svg.replace(/<defs>.*?<\/defs>/, '');
  return walk(body, collectDefs(svg), I, null, { sw: 0, stroke: false }, cls, solidOnly);
}

const R = (b) => [b.x0, b.y0, b.x1, b.y1].map((v) => Math.round(v * 10) / 10).join(', ');
const inside = (b, lo, hi) => !(b.x0 < lo || b.y0 < lo || b.x1 > hi || b.y1 > hi);

test('bounds helper: transforms, origins, clips and strokes', () => {
  const b = boundsOf('<svg><g class="k"><circle cx="10" cy="10" r="5" stroke="#000" stroke-width="2"/></g></svg>', 'k');
  assert.deepEqual([b.x0, b.y0, b.x1, b.y1].map(Math.round), [4, 4, 16, 16]);
  const r = boundsOf('<svg><g class="k" style="transform-origin:80px 80px" transform="rotate(90)"><rect x="80" y="70" width="40" height="20"/></g></svg>', 'k');
  assert.deepEqual([r.x0, r.y0, r.x1, r.y1].map(Math.round), [70, 80, 90, 120]);
  const c = boundsOf('<svg><defs><clipPath id="c"><circle cx="0" cy="0" r="10"/></clipPath></defs><g class="k" clip-path="url(#c)"><rect x="-500" y="-500" width="1000" height="1000"/></g></svg>', 'k');
  assert.deepEqual([c.x0, c.y0, c.x1, c.y1].map(Math.round), [-10, -10, 10, 10]);
});

test('every species part stays inside 4…156 at every tier, live mood and size', () => {
  const bad = [];
  for (const { id } of SPECIES) for (let tier = 0; tier <= 6; tier += 1) for (const mood of LIVE_MOODS) for (const size of [200, 72]) {
    const svg = renderPet({ species: id, tier, mood, size, stars: 5, uid: 'b', focus: true });
    const b = boundsOf(svg, 'pet-float');
    if (!inside(b, 4, 156)) bad.push(`${id}/${tier}/${mood}/${size}: ${R(b)}`);
  }
  assert.deepEqual(bad, []);
});

test('tier auras and species aura extras stay inside the 160 frame (soft gradient glows may fade past it)', () => {
  const bad = [];
  for (const { id } of SPECIES) for (let tier = 1; tier <= 6; tier += 1) for (const size of [200, 72]) {
    const svg = renderPet({ species: id, tier, size, uid: 'a', focus: true });
    for (const g of ['g-aura-back', 'g-aura-front']) {
      const b = boundsOf(svg, g, { solidOnly: true });
      if (b.x0 !== Infinity && !inside(b, 0, 160)) bad.push(`${id}/${tier}/${size} ${g}: ${R(b)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('happy hearts start inside the frame, beside the head (not on it)', () => {
  for (const { id } of SPECIES) {
    const svg = renderPet({ species: id, mood: 'happy', size: 200, uid: 'h' });
    const b = boundsOf(svg, 'fx-hearts');
    assert.ok(inside(b, 4, 156), `${id}: ${R(b)}`);
    // After the 24 px rise the hearts are still in the frame.
    assert.ok(b.y0 - 24 > -2, `${id}: risen hearts ${R(b)}`);
  }
});

test('eggs (every kind, tier and state, incl. the popped-off cap) stay inside 2…158', () => {
  const bad = [];
  for (const kind of ['open', 'pet']) for (let tier = 0; tier <= 6; tier += 1) for (const state of ['idle', 'shake', 'crack', 'open']) {
    const svg = renderEgg({ kind, tier, state, uid: 'e' });
    const b = boundsOf(svg, 'egg-wobble');
    if (!inside(b, 2, 158)) bad.push(`${kind}/${tier}/${state}: ${R(b)}`);
    if (state === 'crack') {
      // The crack and its light leak are clipped to the shell.
      const c = boundsOf(svg, 'egg-cracks');
      if (c.x0 < 33 || c.x1 > 127) bad.push(`${kind}/${tier} crack: ${R(c)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('gravestones and ashes stay inside the frame at every size', () => {
  for (const { id } of SPECIES) for (const size of [200, 72]) {
    for (const mood of ['dead', 'ashes']) {
      const svg = renderPet({ species: id, mood, size, tier: 4, name: 'Clementine', level: 40, ashesDone: 2, uid: 's' });
      const b = boundsOf(svg, 'pet', { solidOnly: true });
      assert.ok(inside(b, 0, 160), `${id}/${mood}/${size}: ${R(b)}`);
    }
  }
});
