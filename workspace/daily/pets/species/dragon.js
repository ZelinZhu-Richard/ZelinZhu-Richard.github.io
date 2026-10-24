// Drakelet (dragon). CONTENT.md §A.2 "Drakelet (dragon)"; contract in species/_template.js.
//
// A proud little hoarder: bean body tilted 4° right, big round head with a light muzzle and a fang,
// backward-curving horns (in g-occlude-front so a hat tucks behind them), bat wings behind the body
// pivoting at the shoulders, and a thick tail curling up into a spade.
//
// Motion hooks (pets.css "species: dragon" block):
//   .dragon-wing (--dir 1 left / -1 right, origin at the shoulder pivot) flaps in the idle flourish,
//   .dragon-tail sways on the focused pet, .dragon-ring (3 smoke rings) / .dragon-wisp (hungry) puff
//   after the flaps, .dragon-hiccup is the little flame after eating.

import { cel, face, specular, star4, glow, flame, trim, prismOverlay, ol, f } from '../rig.js';
import { OUTLINE, WHITE, GOLD, COIN, COIN_EDGE, mix } from '../palette.js';

// ---------- geometry helpers ----------

const S = ([x, y]) => `${f(x)} ${f(y)}`;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const lerp = (a, b, t) => a + (b - a) * t;
const mirror = ([x, y]) => [160 - x, y];

/** Point on a cubic Bézier. */
function bez(c, t) {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * c[0][i] + 3 * u * u * t * c[1][i] + 3 * u * t * t * c[2][i] + t * t * t * c[3][i]);
}
/** Unit tangent of a cubic Bézier. */
function tangent(c, t) {
  const u = 1 - t;
  const d = [0, 1].map((i) => 3 * u * u * (c[1][i] - c[0][i]) + 6 * u * t * (c[2][i] - c[1][i]) + 3 * t * t * (c[3][i] - c[2][i]));
  const l = Math.hypot(d[0], d[1]) || 1;
  return [d[0] / l, d[1] / l];
}
/** Smooth curve through points (Catmull-Rom as cubic segments, no leading M). */
function through(pts) {
  let out = '';
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    out += `C${S(c1)} ${S(c2)} ${S(p2)}`;
  }
  return out;
}
/**
 * Tapered limb along a cubic centreline (tail, horns): width w0 at the base → w1 at the tip, round caps.
 * at(t, side) → { p: point on the edge, n: outward normal, d: tangent, w: half width }; side +1 is right of travel.
 */
function limb(c, w0, w1, { n = 14, ease = (t) => t } = {}) {
  const A = [], B = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n, p = bez(c, t), d = tangent(c, t), nr = [-d[1], d[0]], w = lerp(w0, w1, ease(t)) / 2;
    A.push(add(p, mul(nr, w)));
    B.push(add(p, mul(nr, -w)));
  }
  const r1 = Math.max(0.4, w1 / 2), r0 = w0 / 2;
  const d = `M${S(A[0])}${through(A)}A${f(r1)} ${f(r1)} 0 0 0 ${S(B[n])}${through(B.slice().reverse())}A${f(r0)} ${f(r0)} 0 0 0 ${S(A[0])}Z`;
  const at = (t, side = 1) => {
    const p = bez(c, t), dd = tangent(c, t), nr = [-dd[1] * side, dd[0] * side], w = lerp(w0, w1, ease(t)) / 2;
    return { c: p, p: add(p, mul(nr, w)), n: nr, d: dd, w };
  };
  return { d, at };
}
/** 4-point star path data (for evenodd cut-outs). */
function starD(cx, cy, size) {
  const s = size / 2, k = s * 0.22;
  return `M${f(cx)} ${f(cy - s)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + s)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + s)}Q${f(cx - k)} ${f(cy + k)} ${f(cx - s)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - s)}Z`;
}

// ---------- the model (healthy pose, viewBox units) ----------

const BODY_TILT = 'rotate(4 80 112)';
// Bean body: cx 80, cy ~113, ~61 × 56, a touch narrower at the shoulders.
const BODY_D = 'M80 85C97.5 85 109 97 110.5 113C112 130 99 141.5 80 141.5C61 141.5 48 130 49.5 113C51 97 62.5 85 80 85Z';
// Head: ~71 × 60 round head, a little fuller at the cheeks.
const HEAD_D = 'M80 35C101.5 35 115.5 47.5 115.5 64.5C115.5 82.5 101 95 80 95C59 95 44.5 82.5 44.5 64.5C44.5 47.5 58.5 35 80 35Z';
// Muzzle light: ellipse cx 80, cy 80, rx 18, ry 10.5.
const SNOUT = { cx: 80, cy: 80.5, rx: 18, ry: 10.5 };
const EYES = [[66, 63.5], [94, 63.5]];
const MOUTH = [80, 85.5];

// Wing (left; the right one is its mirror about x = 80). Shoulder pivot (56, 96).
// Leading-edge bone arches up to the wrist and out to the tip; 3 scallops on the trailing edge.
const WING_PIVOT = [56, 96];
const WING_LEAD = 'M61.5 93C58 83 51.5 77 44 75.5C37.5 74.2 31 73.6 23.5 70.5';
const WING_D = `${WING_LEAD}Q33.5 79.5 26.5 90.5Q36.5 88.5 40.5 100Q50.5 96.5 58.5 104.5Z`;
const WING_BONES = 'M44.5 76.5Q35 81.5 27.8 89.4M44.5 76.5Q43.5 88 41.2 98.6';
const WING_TIP = [23.5, 70.5];
const WING_STAR_HOLES = [[33, 80, 6], [36.5, 91, 5], [47, 92.5, 4.5]];

// Tail centrelines per mood (base inside the body → tip), and which side carries the spine ridge.
const TAIL = {
  healthy: { c: [[100, 131], [127, 145], [145, 128], [137, 108]], dorsal: 1 },
  happy: { c: [[100, 131], [128, 144], [146, 124], [139, 104]], dorsal: 1 },
  hungry: { c: [[100, 131], [127, 145], [143, 133], [142, 114]], dorsal: 1 }, // tip drooped ~10°
  starving: { c: [[98, 136], [109, 147.5], [118.5, 146.5], [127, 145]], dorsal: -1 }, // flat on the ground (spade + Legendary flame stay inside x ≤ 156)
};
// Wing lift by mood (deg; + raises the tip). Happy +12, hungry folded −10, starving limp.
const WING_LIFT = { healthy: 0, happy: 12, hungry: -10, starving: -15 };

// Horns: backward-curving, ~16–19 long, 8 wide at the base, from (62, 44) and (98, 44).
const HORN_L = [[63.5, 49], [62.5, 38.5], [57.5, 30], [47.5, 26.5]];
const HORN_R = HORN_L.map(mirror);
const HORN_W = [12, 3.6];
const HORN_EASE = (x) => x ** 1.5;

const ARMS = [[54, 113, 20], [106, 113, -20]];
const FEET = [[65.5, 141.8], [94.5, 141.8]];
// Belly: 3 plates (widths ~30, 34, 30) at y 104, 114, 124 joined into one smooth belly shield; the two
// seams between them bow with the belly's roundness (up above the middle, down below it).
const BELLY = { cx: 80, cy: 114.25, rx: 17, ry: 15.75 };
const BELLY_D = 'M80 98.5C91 98.5 97 104 97 114.25C97 124.5 90.5 130 80 130C69.5 130 63 124.5 63 114.25C63 104 69 98.5 80 98.5Z';
const SEAMS = [109, 119.5];
function seamD(y, inset = 1.2, dy = 0, bowScale = 1) {
  const hw = BELLY.rx * Math.sqrt(Math.max(0, 1 - ((y - BELLY.cy) / BELLY.ry) ** 2)) - inset;
  const bow = (y - BELLY.cy) * 0.22 * bowScale;
  return `M${f(80 - hw)} ${f(y + dy)}Q80 ${f(y + dy + 2 * bow)} ${f(80 + hw)} ${f(y + dy)}`;
}

// Tail spade, local: base at (0, 0), pointing up (−y), ~14 × 14 after the 0.95 scale.
const SPADE_D = 'M0 -14C3 -10.5 7.5 -7.5 7.5 -1.8C5 -3.4 2.8 -2.6 1.8 0.8L-1.8 0.8C-2.8 -2.6 -5 -3.4 -7.5 -1.8C-7.5 -7.5 -3 -10.5 0 -14Z';
const SPADE_SCALE = 0.95;

// ---------- parts ----------

function tailParts(ctx, mood) {
  const p = ctx.palette, t = ctx.tier;
  const pose = TAIL[mood] || TAIL.healthy;
  const tl = limb(pose.c, 17, 7, { n: ctx.thumb ? 8 : 14, ease: (x) => x ** 0.85 });
  const end = bez(pose.c, 1), dir = tangent(pose.c, 1);
  const ang = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI + 90;
  const base = add(end, mul(dir, -1.5));
  const spadeAt = `translate(${S(base)}) rotate(${f(ang)}) scale(${SPADE_SCALE})`;

  // Marking A (Rare–Epic): spine ridge running down the back into the tail (behind the tail edge).
  let spines = '';
  if (t >= 1 && t <= 3) {
    spines = [[0.5, 8.5], [0.64, 8.5], [0.77, 7.5], [0.89, 6]].map(([u, h]) => {
      const e = tl.at(u, pose.dorsal);
      const b = add(e.p, mul(e.n, -2.5));
      const a = add(b, mul(e.d, -4.6)), c2 = add(b, mul(e.d, 4.6));
      const tip = add(add(b, mul(e.n, h + 2.5)), mul(e.d, 3.2));
      const q1 = add(add(a, mul(e.n, h * 0.75)), mul(e.d, 1.2));
      const q2 = add(add(c2, mul(e.n, h * 0.3)), mul(e.d, 0.4));
      return `<path d="M${S(a)}Q${S(q1)} ${S(tip)}Q${S(q2)} ${S(c2)}Z" fill="${p.accent}" ${ol(2.8)}/>` + (ctx.thumb ? '' :
        `<path d="M${S(add(a, mul(e.d, 2)))}Q${S(add(q1, mul(e.d, 1.2)))} ${S(add(tip, mul(e.n, -2.4)))}" fill="none" stroke="${mix(p.accent, WHITE, 0.4)}" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>`);
    }).join('');
    if (t === 3) spines = `<g class="dragon-ridge" ${glow(ctx, '#c9a2ff', 2)}>${spines}</g>`;
  }

  // Under-tail light stripe (belly colour) on the inner side.
  const stripePts = [0.12, 0.3, 0.5, 0.7, 0.88].map((u) => { const e = tl.at(u, -pose.dorsal); return add(e.p, mul(e.n, -e.w * 0.42)); });
  const stripe = `<path d="M${S(stripePts[0])}${through(stripePts)}" fill="none" stroke="${p.belly}" stroke-width="3.4" stroke-linecap="round" opacity=".75"/>`;
  const prism = t === 6 ? prismOverlay(ctx) : '';
  const tailArt = cel(ctx, `tail-${mood}`, tl.d, { fill: p.body, shade: p.shade, shadeOffset: [-3, -4], inner: stripe + prism });

  // Spade (accent), with a light centre crease; Legendary gets a flame on its point.
  const spadeFill = t === 6 ? `url(#${prismGrad(ctx)})` : p.accent;
  let spade = `<g transform="${spadeAt}"><path d="${SPADE_D}" fill="${spadeFill}" ${ol(3.4)}/>` +
    `<path d="M0 -10.5Q-0.6 -5 0 -1" fill="none" stroke="${mix(p.accent, WHITE, 0.45)}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/></g>`;
  if (t === 5) {
    const tipPt = add(base, mul(dir, 14 * SPADE_SCALE - 1.5));
    spade += flame(ctx, tipPt[0], tipPt[1], 13, ang);
  }
  return `<g class="dragon-tail" style="transform-origin:100px 132px">${spines}${tailArt}${spade}</g>`;
}

function prismGrad(ctx) {
  return ctx.defOnce('prism-fill', (full) => `<linearGradient id="${full}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".3" stop-color="#ffd3ec"/><stop offset=".55" stop-color="#cfe8ff"/><stop offset=".8" stop-color="#d8ffef"/><stop offset="1" stop-color="#fff3b0"/></linearGradient>`);
}

/** One wing (side 'l' | 'r'): drawn in left-wing coordinates, mirrored for the right. */
function wing(ctx, side, mood) {
  const p = ctx.palette, t = ctx.tier;
  const lift = WING_LIFT[mood] ?? 0;
  const pivot = side === 'l' ? WING_PIVOT : mirror(WING_PIVOT);
  const dir = side === 'l' ? 1 : -1;
  let membrane;
  if (t === 6) {
    // Ultra: a solid pale membrane under the prism overlay (a see-through one showed the dark page and
    // read grey), with 3 star "cut-outs" glowing pale gold instead of opening onto the page.
    const holes = WING_STAR_HOLES.map(([x, y, s]) => starD(x, y, s)).join('');
    const clip = ctx.defOnce('clip-wing', (cid) => `<clipPath id="${cid}"><path d="${WING_D}"/></clipPath>`);
    membrane = `<path d="${WING_D}" fill="${p.belly}"/><g clip-path="url(#${clip})">${prismOverlay(ctx)}</g>` +
      `<path d="${holes}" fill="#fff3b0" fill-opacity=".35"/><path d="${holes}" fill="none" ${ol(1.3)} opacity=".8"/>`;
  } else {
    const clip = ctx.defOnce('clip-wing', (cid) => `<clipPath id="${cid}"><path d="${WING_D}"/></clipPath>`);
    membrane = `<path d="${WING_D}" fill="${p.shade}"/><g clip-path="url(#${clip})">` +
      `<path d="M58 104.5Q44 101 27 91Q38 96 58 112Z" fill="${mix(p.shade, p.accent, 0.35)}" opacity=".55"/>` +
      `<path d="${WING_LEAD}" fill="none" stroke="${p.accent}" stroke-width="6.5" stroke-linecap="round"/></g>`;
  }
  const bones = `<path d="${WING_BONES}" fill="none" stroke="${p.accent}" stroke-width="2.6" stroke-linecap="round"/>`;
  const outline = `<path d="${WING_D}" fill="none" ${ol()}/>`;
  // Little wrist claw.
  const claw = `<path d="M42.6 76.4Q42.8 71.6 45.8 70.4Q45.6 73.6 46.6 76.6" fill="${p.belly}" ${ol(2.4)}/>`;
  let extra = '';
  if (t === 4) {
    // Mythic: 5 white star specks across the wings (3 left, 2 right).
    const specks = side === 'l' ? [[34, 81], [44, 89], [30, 85.5]] : [[37, 84], [47, 93]];
    extra += specks.map(([x, y], i) => star4(x, y, i === 0 ? 5 : 4, WHITE, 'opacity=".75"')).join('');
  }
  if (t === 5) extra += flame(ctx, WING_TIP[0] + 0.5, WING_TIP[1] + 0.8, 12, -62);
  const art = `${membrane}${bones}${extra}${outline}${claw}`;
  const flip = side === 'r' ? `<g transform="matrix(-1 0 0 1 160 0)">${art}</g>` : art;
  return `<g class="dragon-wing dragon-wing--${side}" style="--dir:${dir};transform-origin:${pivot[0]}px ${pivot[1]}px">` +
    `<g transform="rotate(${f(dir * lift)} ${pivot[0]} ${pivot[1]})">${flip}</g></g>`;
}

function horn(ctx, cl, side, mood) {
  const p = ctx.palette, t = ctx.tier;
  const h = limb(cl, HORN_W[0], HORN_W[1], { n: ctx.thumb ? 6 : 9, ease: HORN_EASE });
  const tipC = bez(cl, 1);
  const capFrom = bez(cl, 0.5);
  const r = Math.hypot(tipC[0] - capFrom[0], tipC[1] - capFrom[1]);
  const starving = mood === 'starving';
  const baseFill = starving ? p.shade : p.belly;
  let capFill = starving ? mix(p.shade, p.accent, 0.45) : p.shade;
  if (t === 5) capFill = GOLD;
  if (t === 6) capFill = `url(#${prismGrad(ctx)})`;
  const cap = `<circle cx="${f(tipC[0])}" cy="${f(tipC[1])}" r="${f(r)}" fill="${capFill}"/>` +
    (t >= 5 ? `<circle cx="${f(tipC[0])}" cy="${f(tipC[1])}" r="${f(r)}" fill="none" ${ol(2)}/>` : '');
  // A growth ring across the horn + a small glint on the base.
  const g = h.at(0.3, 1), g2 = h.at(0.3, -1);
  const ring = `<path d="M${S(add(g.p, mul(g.d, 0)))}Q${S(add(g.c, mul(g.d, -1.6)))} ${S(g2.p)}" fill="none" stroke="${mix(baseFill, p.shade, 0.6)}" stroke-width="1.6" stroke-linecap="round"/>`;
  let art = cel(ctx, `horn-${side}`, h.d, { fill: baseFill, inner: cap + ring, strokeWidth: 3.2 });
  const gl = h.at(0.16, side === 'l' ? -1 : 1);
  art += `<circle cx="${f(gl.c[0] + gl.n[0] * 1.6)}" cy="${f(gl.c[1] + gl.n[1] * 1.6 - 1)}" r="1.3" fill="${WHITE}" opacity=".85"/>`;
  if (t === 4) {
    // Mythic: crescent-moon ring around the horn.
    const e = h.at(0.42, 1);
    const R = e.w + 1.8;
    const L = (u, v) => S(add(add(e.c, mul(e.n, u)), mul(e.d, -v)));
    art += `<path d="M${L(-R, 0)}Q${L(0, 6)} ${L(R, 0)}Q${L(0, 1.6)} ${L(-R, 0)}Z" fill="#ffe4f2" stroke="#a83a74" stroke-width="1.6" stroke-linejoin="round"/>`;
    const m = add(add(e.c, mul(e.n, side === 'l' ? -(R + 2.6) : R + 2.6)), mul(e.d, -3.5));
    art += `<path d="M${f(m[0] - 1.2)} ${f(m[1] - 3.4)}A3.5 3.5 0 1 0 ${f(m[0] + 2.8)} ${f(m[1] + 1.6)}A2.7 2.7 0 1 1 ${f(m[0] - 1.2)} ${f(m[1] - 3.4)}Z" fill="#ffe4f2" stroke="#a83a74" stroke-width="1.3" stroke-linejoin="round"/>`;
  }
  return art;
}

/** Fang: a small white triangle hanging from the right corner of the mouth. */
const fang = (a, b, c) => `<path class="dragon-fang" d="M${S(a)}L${S(b)}L${S(c)}Z" fill="${WHITE}" ${ol(1.3)}/>`;

function mouthParts() {
  const [x, y] = MOUTH;
  return {
    'mouth-smile': () => `<g class="mouth-smile">${fang([x + 1.9, y + 1.1], [x + 5, y - 1.4], [x + 4.4, y + 4.6])}` +
      `<path d="M${f(x - 5.5)} ${f(y - 2.2)}Q${f(x)} ${f(y + 5)} ${f(x + 5.5)} ${f(y - 2.2)}" fill="none" ${ol(3)}/></g>`,
    'mouth-open': () => `<g class="mouth-open"><path d="M${f(x - 7)} ${f(y - 3)}Q${f(x)} ${f(y - 1.4)} ${f(x + 7)} ${f(y - 3)}Q${f(x + 6.6)} ${f(y + 6)} ${f(x)} ${f(y + 6)}Q${f(x - 6.6)} ${f(y + 6)} ${f(x - 7)} ${f(y - 3)}Z" fill="${OUTLINE}" ${ol(2)}/>` +
      `<path d="M${f(x - 3.6)} ${f(y + 4.6)}Q${f(x)} ${f(y + 0.6)} ${f(x + 3.6)} ${f(y + 4.6)}Q${f(x)} ${f(y + 6)} ${f(x - 3.6)} ${f(y + 4.6)}Z" fill="#ff7fb6"/>` +
      fang([x + 2.4, y - 2.1], [x + 6, y - 2.8], [x + 4.8, y + 2.4]) + `</g>`,
    'mouth-wavy': () => {
      const s = 2;
      return `<g class="mouth-wavy">${fang([x + 3, y + 1.2], [x + 6.2, y - 0.4], [x + 5.6, y + 4.4])}<path d="M${f(x - 3 * s)} ${f(y)}Q${f(x - 2 * s)} ${f(y - 2.6)} ${f(x - s)} ${f(y)}Q${f(x)} ${f(y + 2.6)} ${f(x + s)} ${f(y)}Q${f(x + 2 * s)} ${f(y - 2.6)} ${f(x + 3 * s)} ${f(y)}" fill="none" ${ol(2.6)}/></g>`;
    },
  };
}

// ---------- tier accessories ----------

function coin(x, y) {
  return `<g class="dragon-coin"><circle cx="${x}" cy="${y}" r="7" fill="${COIN}" ${ol(3)}/>` +
    `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${COIN_EDGE}" stroke-width="1.5"/>` +
    star4(x + 0.5, y + 0.5, 6.5, COIN_EDGE, 'opacity=".55"') + star4(x, y, 6.5, '#fff1a8') +
    `<path d="M${f(x - 4.6)} ${f(y - 2.4)}A5.2 5.2 0 0 1 ${f(x - 1.6)} ${f(y - 5)}" fill="none" stroke="${WHITE}" stroke-width="1.4" stroke-linecap="round" opacity=".9"/></g>`;
}

function amulet() {
  const cord = `<path d="M65 90.5Q71 100.5 80 101.2Q89 100.5 95 90.5" fill="none" stroke="${OUTLINE}" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M65 90.5Q71 100.5 80 101.2Q89 100.5 95 90.5" fill="none" stroke="#6a3fc4" stroke-width="2" stroke-linecap="round"/>`;
  const gem = 'M80 101C84.4 103.4 85.8 107 85.2 109.6C84.6 112.2 82.6 113.4 80 113.4C77.4 113.4 75.4 112.2 74.8 109.6C74.2 107 75.6 103.4 80 101Z';
  return `<g class="dragon-amulet">${cord}<circle cx="80" cy="101.2" r="2.2" fill="#6a3fc4" ${ol(1.6)}/>` +
    `<path d="${gem}" fill="#c9a2ff" ${ol(2.6)}/><path d="M80 104.2C82.6 106 83 108.6 82.4 110.4" fill="none" stroke="#9c72e8" stroke-width="1.8" stroke-linecap="round"/>` +
    `<ellipse cx="77.9" cy="106.6" rx="1.4" ry="2.2" fill="${WHITE}" transform="rotate(20 77.9 106.6)"/></g>`;
}

function browGem(ctx) {
  const [x, y] = [80, 50];
  const fill = ctx.tier === 6 ? `url(#${prismGrad(ctx)})` : GOLD;
  return `<g class="dragon-brow-gem"><path d="M${x} ${y - 5}L${x + 4} ${y}L${x} ${y + 5}L${x - 4} ${y}Z" fill="${fill}" ${ol(2.4)}/>` +
    `<path d="M${x - 2.8} ${y + 0.4}L${x + 2.8} ${y + 0.4}L${x} ${y + 3.6}Z" fill="${ctx.tier === 6 ? '#cfe8ff' : '#e9a25a'}" opacity=".55"/>` +
    `<path d="M${f(x - 1.6)} ${f(y - 1.4)}L${x} ${f(y - 3.4)}" stroke="${WHITE}" stroke-width="1.4" stroke-linecap="round"/></g>`;
}

// ---------- species module ----------

export default {
  id: 'dragon',
  name: 'Drakelet',
  anchors: { headTop: [80, 34], brow: [80, 50], neck: [80, 92], chest: [80, 104], back: [109, 100], hand: [108, 116], tailTip: [137, 108], mouth: [80, 86], accScale: 1.04 },
  auraCenter: [80, 92],
  idleClass: 'pet-idle--dragon',

  draw(ctx) {
    const p = ctx.palette, t = ctx.tier;
    const mood = TAIL[ctx.mood] ? ctx.mood : 'healthy';
    const prism = t === 6 ? prismOverlay(ctx) : '';

    // Body + belly plates (tilted 4° right).
    const body = `<g transform="${BODY_TILT}">${cel(ctx, 'body', BODY_D, { fill: p.body, shade: p.shade, shadeOffset: [-6, -6], inner: prism })}</g>`;
    const seams = SEAMS.map((y) => `<path d="${seamD(y)}" fill="none" stroke="${p.shade}" stroke-width="2.2" stroke-linecap="round"/>`).join('');
    const plates = cel(ctx, 'belly', BELLY_D, { fill: p.belly, shade: mix(p.belly, p.shade, 0.35), shadeOffset: [-3, -3.5], inner: seams, strokeWidth: 2.8 }) +
      `<path d="M68.5 104.5Q71.5 101.2 76.5 100.8" fill="none" stroke="${WHITE}" stroke-width="1.8" stroke-linecap="round" opacity=".9"/>`;
    const belly = `<g transform="${BODY_TILT}">${plates}</g>`;

    // Feet with toe splits.
    const legs = FEET.map(([x, y], i) => cel(ctx, `foot-${i}`, `M${x - 10.5} ${y}C${x - 10.5} ${y - 4.6} ${x - 5.5} ${y - 6.6} ${x} ${y - 6.6}C${x + 5.5} ${y - 6.6} ${x + 10.5} ${y - 4.6} ${x + 10.5} ${y}C${x + 10.5} ${y + 4.4} ${x + 6} ${f(y + 6.2)} ${x} ${f(y + 6.2)}C${x - 6} ${f(y + 6.2)} ${x - 10.5} ${y + 4.4} ${x - 10.5} ${y}Z`, { fill: p.body, shade: p.shade, shadeOffset: [-3, -3] }) +
      `<path d="M${f(x - 3.4)} ${f(y + 5.4)}v-2.6M${f(x + 3.4)} ${f(y + 5.4)}v-2.6" fill="none" ${ol(2)}/>`).join('');

    // Arms: stubby ovals 7 × 10 hanging at the sides.
    const arms = ARMS.map(([x, y, a], i) => `<g transform="rotate(${a} ${x} ${y})">${cel(ctx, `arm-${i}`, `M${x} ${y - 10}C${x + 4.4} ${y - 10} ${x + 7} ${y - 5} ${x + 7} ${y + 0.5}C${x + 7} ${y + 6} ${x + 4} ${y + 10} ${x} ${y + 10}C${x - 4} ${y + 10} ${x - 7} ${y + 6} ${x - 7} ${y + 0.5}C${x - 7} ${y - 5} ${x - 4.4} ${y - 10} ${x} ${y - 10}Z`, { fill: p.body, shade: p.shade, shadeOffset: [-3, -3] })}</g>`).join('');

    // Head: base + shade, muzzle light, nostrils, specular.
    const snoutD = `M${SNOUT.cx - SNOUT.rx} ${SNOUT.cy}C${SNOUT.cx - SNOUT.rx} ${f(SNOUT.cy - SNOUT.ry * 0.85)} ${f(SNOUT.cx - SNOUT.rx * 0.6)} ${f(SNOUT.cy - SNOUT.ry)} ${SNOUT.cx} ${f(SNOUT.cy - SNOUT.ry)}C${f(SNOUT.cx + SNOUT.rx * 0.6)} ${f(SNOUT.cy - SNOUT.ry)} ${SNOUT.cx + SNOUT.rx} ${f(SNOUT.cy - SNOUT.ry * 0.85)} ${SNOUT.cx + SNOUT.rx} ${SNOUT.cy}C${SNOUT.cx + SNOUT.rx} ${f(SNOUT.cy + SNOUT.ry * 0.9)} ${f(SNOUT.cx + SNOUT.rx * 0.55)} ${f(SNOUT.cy + SNOUT.ry)} ${SNOUT.cx} ${f(SNOUT.cy + SNOUT.ry)}C${f(SNOUT.cx - SNOUT.rx * 0.55)} ${f(SNOUT.cy + SNOUT.ry)} ${SNOUT.cx - SNOUT.rx} ${f(SNOUT.cy + SNOUT.ry * 0.9)} ${SNOUT.cx - SNOUT.rx} ${SNOUT.cy}Z`;
    const snout = cel(ctx, 'snout', snoutD, { fill: p.belly, shade: mix(p.belly, p.shade, 0.45), shadeOffset: [-2.5, -2.5], outline: false }) +
      `<path d="M${SNOUT.cx - SNOUT.rx + 0.6} ${f(SNOUT.cy + 2.4)}C${f(SNOUT.cx - SNOUT.rx + 2.6)} ${f(SNOUT.cy + SNOUT.ry - 0.6)} ${f(SNOUT.cx - 7)} ${f(SNOUT.cy + SNOUT.ry)} ${SNOUT.cx} ${f(SNOUT.cy + SNOUT.ry)}C${f(SNOUT.cx + 7)} ${f(SNOUT.cy + SNOUT.ry)} ${f(SNOUT.cx + SNOUT.rx - 2.6)} ${f(SNOUT.cy + SNOUT.ry - 0.6)} ${f(SNOUT.cx + SNOUT.rx - 0.6)} ${f(SNOUT.cy + 2.4)}" fill="none" ${ol(2.6)}/>`;
    const nostrils = `<ellipse cx="74.5" cy="77" rx="1.7" ry="1.3" fill="${OUTLINE}" transform="rotate(-20 74.5 77)"/><ellipse cx="85.5" cy="77" rx="1.7" ry="1.3" fill="${OUTLINE}" transform="rotate(20 85.5 77)"/>`;
    const head = cel(ctx, 'head', HEAD_D, { fill: p.body, shade: p.shade, shadeOffset: [-6, -6.5], inner: prism }) + snout + nostrils + specular(56.5, 49.5);

    // Horns (in front of a cosmetic).
    const occlude = horn(ctx, HORN_L, 'l', mood) + horn(ctx, HORN_R, 'r', mood);

    // Markings layer: SR/Epic plate edging; Legendary trim.
    let markings = '';
    if (t === 2 || t === 3) {
      const edging = [...SEAMS, 127].map((y) => `<path class="thin" d="${seamD(y, y > 125 ? 3.5 : 2.6, y > 125 ? 0 : -2.2, y > 125 ? 0.3 : 1)}" fill="none" stroke="${p.accent}" stroke-width="1.5" stroke-linecap="round"/>`).join('');
      markings = `<g transform="${BODY_TILT}"${t === 3 ? ` ${glow(ctx, '#c9a2ff', 2)}` : ''}>${edging}</g>`;
    }
    let headTop = '';
    if (t === 5 && !ctx.thumb) {
      headTop = trim('M50.5 56C53 45.5 63 39 80 39C97 39 107 45.5 109.5 56');
      markings += `<g transform="${BODY_TILT}">${trim('M53.5 103C55 96 59.5 91 64 89')}${trim('M96 89C100.5 91 105 96 106.5 103')}</g>`;
    }

    // Accessories: SR coin at the hand; Epic amulet at the neck; Legendary/Ultra brow gem.
    let accBody = '';
    if (t === 2) accBody = coin(108, 117);
    if (t === 3) accBody = amulet();
    const accBrow = t >= 5 ? browGem(ctx) : '';

    const faceMarkup = face(ctx, { eyes: EYES, mouth: MOUTH, eyeSize: [14, 18], blushDx: 5, blushDy: 10.5, parts: mouthParts() });

    // fx: smoke rings (idle), a grey wisp when hungry, the hiccup flame after eating.
    let fx = '';
    if (!ctx.thumb) {
      if (mood === 'healthy' || mood === 'happy') {
        // 3 smoke rings (drawn at r 10, start scaled to r 4) rising between the eyes from the nostrils.
        fx += [0, 1, 2].map((i) => `<g class="dragon-ring" style="--i:${i};transform-origin:80px 75px" opacity="0"><circle cx="80" cy="75" r="10" fill="none" stroke="${OUTLINE}" stroke-width="4" opacity=".55"/><circle cx="80" cy="75" r="10" fill="none" stroke="#c2bad0" stroke-width="2"/></g>`).join('');
      } else if (mood === 'hungry') {
        fx += `<g class="dragon-wisp" style="transform-origin:80px 74px" opacity="0"><path d="M80 74C84 70 77 66 81 61.5C84 58.5 80.5 55.5 82.5 52" fill="none" stroke="${OUTLINE}" stroke-width="4.4" stroke-linecap="round" opacity=".45"/><path d="M80 74C84 70 77 66 81 61.5C84 58.5 80.5 55.5 82.5 52" fill="none" stroke="#978daa" stroke-width="2.6" stroke-linecap="round"/></g>`;
      }
      const hc = t === 0 ? '#dfccff' : p.accent;
      // Hiccup flame: a 14 × 20 teardrop with a flicked tip and a bright core, puffing out of the fang corner.
      fx += `<g class="dragon-hiccup" style="transform-origin:88px 88px" opacity="0"><g transform="translate(88 88) rotate(58) scale(1.4 1.15)">` +
        `<path d="M0 -16.5C1 -14 3.6 -12.4 4.2 -9.6C5 -7.8 5.2 -6 5 -4C5 -1 2.8 1 0 1C-2.8 1 -5 -1 -5 -4C-5 -7 -3.4 -9.6 -1.4 -11.6C-0.6 -12.6 0.2 -14.2 0 -16.5Z" fill="${hc}" ${ol(1.8)}/>` +
        `<path d="M0 -10.5C2 -7.4 2.8 -5.4 2.8 -3.6C2.8 -1.8 1.5 -0.8 0 -0.8C-1.5 -0.8 -2.8 -1.8 -2.8 -3.6C-2.8 -5.4 -1.8 -7.4 0 -10.5Z" fill="${t === 0 ? WHITE : p.belly}" opacity=".9"/>` +
        `<circle cx="-0.6" cy="-3.2" r="1.1" fill="${WHITE}"/></g></g>`;
    }

    return {
      tail: tailParts(ctx, mood),
      'wing-back': wing(ctx, 'l', mood) + wing(ctx, 'r', mood),
      body,
      legs,
      belly,
      markings,
      arms,
      'acc-body': accBody,
      head: head + headTop,
      face: faceMarkup,
      'acc-brow': accBrow,
      'occlude-front': occlude,
      fx,
    };
  },

  silhouette() {
    const tail = TAIL.healthy;
    const tl = limb(tail.c, 17, 7, { ease: (x) => x ** 0.85 });
    const end = bez(tail.c, 1), dir = tangent(tail.c, 1);
    const ang = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI + 90;
    const base = add(end, mul(dir, -1.5));
    const horn = (cl) => limb(cl, HORN_W[0], HORN_W[1], { n: 9, ease: HORN_EASE }).d;
    return `<path d="${WING_D}"/><path d="${WING_D}" transform="matrix(-1 0 0 1 160 0)"/>` +
      `<path d="${tl.d}"/><path d="${SPADE_D}" transform="translate(${S(base)}) rotate(${f(ang)}) scale(${SPADE_SCALE})"/>` +
      `<path d="${BODY_D}" transform="${BODY_TILT}"/>` +
      FEET.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="10.5" ry="6.4"/>`).join('') +
      ARMS.map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="10" transform="rotate(${a} ${x} ${y})"/>`).join('') +
      `<path d="${HEAD_D}"/><path d="${horn(HORN_L)}"/><path d="${horn(HORN_R)}"/>`;
  },
};

// Exposed for tests (pure data).
export const _dragon = { TAIL, WING_LIFT, WING_PIVOT };
