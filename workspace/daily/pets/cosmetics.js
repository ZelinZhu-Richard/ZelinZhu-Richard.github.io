// Account-wide cosmetics (CONTENT.md §A.3 season hats + §F Keeper road): head-top layers that fit
// every species. Pure string output, no DOM; tests run in Node.
//
// Contract (ARCHITECTURE.md "Pet art API"): pets/index.js imports COSMETICS and calls
// COSMETICS[id].draw(ctx) with the pet's render context. The markup is drawn with (0, 0) at the
// head-top socket for a ~68-unit-wide head; the rig wraps it in
//   <g transform="translate(headTop) scale(accScale)" data-cosmetic="id">…</g>
// inside g-cosmetic, which sits after the face and behind g-occlude-front (horns, ear tips, gill
// fronds and spine tips tuck in front of the hat).
//
// Fit: HEAD_FIT describes each species' head in that local frame (an ellipse, a hat scale and the
// angles where side pieces can show between horns, ears and fronds). Hats are drawn at the CONTENT.md
// sizes for a 68-wide head, then scaled by HEAD_FIT[species].hat so they sit like a worn hat on wide
// and narrow heads alike; their strokes are divided by the same factor, so every outline stays 4 px.
// Wrap-around pieces (headphones, headbands, laurel) are built on the head ellipse itself.
//
// House style: 4 px #1a1530 outline on the silhouette (3 px on small parts, ≤ 2 px for details),
// flat cel shading through the rig's cel() (base + one lower-right shade), one white gloss.
// At 72 px (ctx.thumb) every detail stroke under 2 px and every fx part is left out.
//
// Motion lives in the "cosmetics" block of pets.css. Classes (all prefixed cos-):
//   .cos          root of every cosmetic; follows through on hops (bounce, cheer, level-up)
//   .cos-sway     acorn stem / seedling sway with the breathing (focused pet only)
//   .cos-pom      beanie pom bounces on every hop          .cos-tassel  tassel swings ±10° on hops
//   .cos-firework crown firework every 10 s (focus)        .cos-petal   blossom petal drifts every 8 s (focus)
//   .cos-drip     brim drip every 9 s (focus)              .cos-glow    lantern glow flicker (focus)
//   .cos-orbit    Orbit Club satellite (focus)             .cos-fx      hidden at rest (fx parts)
// Reduced motion / .pet--still: the static pose (fx parts hidden).

import { cel, ol, f, heartPath, makeContext, svgRoot } from './rig.js';
import { OUTLINE, WHITE, mix } from './palette.js';

// Stroke unit: 1 / the current hat scale while a hat is being drawn (see asHat), so outlines keep
// their on-screen weight. Draws are synchronous, so a module-level value is safe.
let U = 1;
const sw = (n) => f(n * U);
const OL = (n) => ol(sw(n));
const W = 4; // silhouette outline
const WS = 3; // small parts

const GLOSS = (d, w = 2.4, op = 0.55) => `<path d="${d}" fill="none" stroke="${WHITE}" stroke-width="${sw(w)}" stroke-linecap="round" opacity="${op}"/>`;
const shadeOf = (hex, t = 0.26) => mix(hex, OUTLINE, t);
const pt = ([x, y]) => `${f(x)} ${f(y)}`;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** A stroke drawn twice: a dark outline underneath and the colour on top (stems, bands, cords). */
function lined(d, color, w, olw = 2) {
  return `<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="${sw(w + 2 * olw)}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Union outline: every shape stroked thick first, then every fill on top (petals, bows). */
function union(shapes, fill, olw = 2) {
  return shapes.map((s) => s.replace('/>', ` fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="${sw(olw * 2)}" stroke-linejoin="round"/>`)).join('') +
    shapes.map((s) => s.replace('/>', ` fill="${fill}"/>`)).join('');
}

/** Rounded-rect path. */
const rrect = (x, y, w, h, r) => `M${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(y + h - r)}Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}H${f(x + r)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Z`;

/** Scalloped (fluffy) circle path: n bumps of radius ~r around (cx, cy). */
function fluffy(cx, cy, r, n = 9, puff = 1.22) {
  const p = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  let d = `M${pt(p(-Math.PI / 2, r))}`;
  for (let i = 0; i < n; i += 1) {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n, a1 = a0 + (2 * Math.PI) / n;
    d += `Q${pt(p((a0 + a1) / 2, r * puff))} ${pt(p(a1, r))}`;
  }
  return `${d}Z`;
}

/** Five-petal blossom (union outline), centre dot, petal gloss. */
function blossom(cx, cy, r, petal, centre, rot0 = 0, thumb = false) {
  const shapes = Array.from({ length: 5 }, (_, i) => {
    const a = rot0 + i * 72;
    const [x, y] = [cx + r * 0.55 * Math.sin(rad(a)), cy - r * 0.55 * Math.cos(rad(a))];
    return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 0.5)}" ry="${f(r * 0.58)}" transform="rotate(${f(a)} ${f(x)} ${f(y)})"/>`;
  });
  return `<g class="cos-blossom">${union(shapes, petal, 1.3)}` +
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.32)}" fill="${centre}" stroke="${OUTLINE}" stroke-width="${sw(1)}"/>` +
    (thumb ? '' : `<circle cx="${f(cx - r * 0.5)}" cy="${f(cy - r * 0.64)}" r="${f(r * 0.15)}" fill="${WHITE}" opacity=".9"/>`) + '</g>';
}

// ---------- per-species head fit ----------

/**
 * Each species' head in the cosmetic's local frame (units before the rig's accScale; (0, 0) = headTop):
 *   rx, ry, cy  the head as an ellipse centred at (0, cy) — measured from each species module
 *   hat         scale for hats (CONTENT.md sizes are for a 68-wide head; this fits the real head)
 *   cupA        headphone cup angle (degrees from straight up) where cups show (clear of gill fronds)
 *   sideA       angle for the lantern charm (right temple), clear of horns, ears and tufts
 *   pencilA     angle on the band where the pencil tucks in (front-left of the crown)
 */
export const HEAD_FIT = Object.freeze({
  default: Object.freeze({ rx: 34, ry: 31, cy: 31, hat: 1.2, cupA: 90, sideA: 58, pencilA: 14 }),
  dragon: Object.freeze({ rx: 34, ry: 29, cy: 29.5, hat: 1.2, cupA: 90, sideA: 64, pencilA: 12 }),
  fox: Object.freeze({ rx: 39, ry: 32, cy: 30.5, hat: 1.24, cupA: 92, sideA: 64, pencilA: 12 }),
  slime: Object.freeze({ rx: 43, ry: 34, cy: 44, hat: 1.14, cupA: 84, sideA: 50, pencilA: 16 }),
  owl: Object.freeze({ rx: 34.5, ry: 29.5, cy: 29.5, hat: 1.18, cupA: 90, sideA: 60, pencilA: 12 }),
  turtle: Object.freeze({ rx: 31.5, ry: 30.5, cy: 30.5, hat: 1.16, cupA: 90, sideA: 56, pencilA: 16 }),
  axolotl: Object.freeze({ rx: 43, ry: 30, cy: 30, hat: 1.36, cupA: 46, sideA: 44, pencilA: 18 }),
  hedgehog: Object.freeze({ rx: 40, ry: 38, cy: 40, hat: 1.28, cupA: 88, sideA: 56, pencilA: 12 }), // socket on the spine crown (80, 35)
});
export const headFit = (species) => HEAD_FIT[species] || HEAD_FIT.default;

/** Point on a head ellipse at angle a (degrees clockwise from straight up), dr = radial offset. */
const onHead = (fit, a, dr = 0) => [(fit.rx + dr) * Math.sin(rad(a)), fit.cy - (fit.ry + dr) * Math.cos(rad(a))];
/** Clockwise elliptical arc on the head ellipse from angle a0 to a1 (a0 < a1). */
function arcBetween(fit, a0, a1, dr = 0) {
  return `M${pt(onHead(fit, a0, dr))}A${f(fit.rx + dr)} ${f(fit.ry + dr)} 0 0 1 ${pt(onHead(fit, a1, dr))}`;
}
/** Outward normal direction (degrees, 0 = up, clockwise) of the head ellipse at angle a. */
function normalAt(fit, a) {
  const nx = Math.sin(rad(a)) / fit.rx, ny = -Math.cos(rad(a)) / fit.ry;
  return deg(Math.atan2(nx, -ny));
}

/**
 * Mood pose for species that reshape their head by mood in geometry (not through the rig's CSS head
 * drop and slump, which the cosmetic already follows). Skipped when the species moves headTop itself
 * by setting ctx.anchors.headTop in draw(). Values in local units:
 *   hat: [dx, dy, deg] where the socket moves (the slime's curl droops and its dome squashes);
 *   wrap: [sx, sy, dy] the squash that wrap-around pieces follow.
 */
export const MOOD_POSE = Object.freeze({
  slime: Object.freeze({
    hungry: Object.freeze({ hat: [3.4, 9.9, 14], wrap: [1.05, 0.9, 9.7] }),
    starving: Object.freeze({ hat: [5.1, 31, 22], wrap: [1.15, 0.7, 29.1] }),
  }),
});

function poseOf(ctx, kind) {
  if (ctx.anchors && ctx.anchors.headTop) return '';
  const p = MOOD_POSE[ctx.species]?.[ctx.mood];
  if (!p) return '';
  if (kind === 'hat') { const [dx, dy, r] = p.hat; return `translate(${f(dx)} ${f(dy)}) rotate(${f(r)})`; }
  const [sx, sy, dy] = p.wrap;
  return `matrix(${f(sx)} 0 0 ${f(sy)} 0 ${f(dy)})`;
}

/**
 * Wrap a draw into the cosmetic root <g class="cos cos--id">. Hats are scaled by the species' hat
 * factor with strokes kept constant; wraps are drawn on the head ellipse at scale 1. The mood pose
 * goes on an inner group, so the root stays free for the hop follow-through animation.
 */
function wrap(id, kind, draw) {
  return (ctx) => {
    const s = kind === 'hat' ? headFit(ctx.species).hat : 1;
    const prev = U;
    U = 1 / s;
    try {
      const pose = poseOf(ctx, kind);
      const tf = [pose, s !== 1 ? `scale(${f(s)})` : ''].filter(Boolean).join(' ');
      const inner = draw(ctx);
      return `<g class="cos cos--${id}">${tf ? `<g transform="${tf}">${inner}</g>` : inner}</g>`;
    } finally { U = prev; }
  };
}
const asHat = (id, draw) => wrap(id, 'hat', draw);
const asWrap = (id, draw) => wrap(id, 'wrap', draw);

// ---------- season cosmetics (CONTENT.md §A.3) ----------

function acornCap(ctx) {
  const C = { cap: '#8a5a3b', hatch: '#6b4329', band: '#f3e6c8', stem: '#5c3b22' };
  const domeD = 'M-16.8 3.6C-18.2 -5.8 -10 -12 0 -12C10 -12 18.2 -5.8 16.8 3.6C11 7.2 -11 7.2 -16.8 3.6Z';
  let hatch = '';
  if (!ctx.thumb) {
    let d = '';
    for (let k = -36; k <= 36; k += 4.4) d += `M${f(k - 10)} -13L${f(k + 10)} 7M${f(k + 10)} -13L${f(k - 10)} 7`;
    hatch = `<path class="cos-thin" d="${d}" fill="none" stroke="${C.hatch}" stroke-width="${sw(1)}" opacity=".85"/>`;
  }
  const dome = cel(ctx, 'cos-acorn-dome', domeD, { fill: C.cap, shade: shadeOf(C.cap, 0.22), shadeOffset: [-3.5, -4], inner: hatch, strokeWidth: W * U });
  const bandD = 'M-18.4 1.8C-12 6.4 12 6.4 18.4 1.8Q20.8 4.1 18.4 6.4C12 10.8 -12 10.8 -18.4 6.4Q-20.8 4.1 -18.4 1.8Z';
  const band = cel(ctx, 'cos-acorn-band', bandD, { fill: C.band, shade: mix(C.band, C.cap, 0.32), shadeOffset: [-2.5, -2.2], strokeWidth: WS * U });
  // Stem 3 × 7, leaning right; sways ±6° with the breathing (pivot at its base).
  const stem = `<g class="cos-sway" style="transform-origin:0.2px -10.8px">${lined('M0.2 -10.8C0 -13.8 0.6 -16.2 2.4 -18', C.stem, 3, 1.75)}</g>`;
  const gloss = GLOSS('M-11.8 -4.8C-10.6 -7.8 -7.6 -9.9 -3.8 -10.5', 2.2, 0.5) + `<circle cx="-13.4" cy="-1.4" r="1.2" fill="${WHITE}" opacity=".5"/>`;
  return `${stem}${dome}${gloss}${band}`;
}

function snowfallBeanie(ctx) {
  const C = { knit: '#3f5fa8', rib: '#2f4c8c', white: '#ffffff' };
  const domeD = 'M-21 7C-23.4 -5 -13.4 -16.6 0.6 -16.6C14 -16.6 23.6 -5.6 21.2 7Z';
  const ribs = `<path d="M-10.4 6C-12 -1.6 -9.2 -8.8 -3.6 -13.8M0.6 6V-15.4M11.4 6C12.6 -1.6 9.6 -8.8 4.6 -13.8" fill="none" stroke="${C.rib}" stroke-width="${sw(2.2)}" stroke-linecap="round"/>`;
  const dome = cel(ctx, 'cos-beanie-dome', domeD, { fill: C.knit, shade: C.rib, shadeOffset: [-4, -4], inner: ribs, strokeWidth: W * U });
  const cuffD = 'M-22.6 2.6C-12 8 12 8 22.6 2.6Q25.6 7.6 23.6 12.6C12 18.4 -12 18.4 -23.6 12.6Q-25.6 7.6 -22.6 2.6Z';
  let cuffArt = '';
  if (!ctx.thumb) {
    // Knit ribbing on the cuff: short ticks following the cuff's curve (the snowflake sits in the middle).
    let d = '';
    for (let x = -20; x <= 20; x += 4) {
      if (Math.abs(x) < 7) continue;
      const bow = 4.6 * (1 - (x / 23) ** 2);
      d += `M${x} ${f(4.8 + bow)}V${f(11.2 + bow)}`;
    }
    cuffArt = `<path class="cos-thin" d="${d}" fill="none" stroke="${C.rib}" stroke-width="${sw(1.4)}" stroke-linecap="round" opacity=".9"/>`;
  }
  const cuff = cel(ctx, 'cos-beanie-cuff', cuffD, { fill: C.knit, shade: C.rib, shadeOffset: [-3, -3], inner: cuffArt, strokeWidth: W * U });
  // Snowflake 10 px on the cuff front: 6 arms with a V each.
  const [sx, sy] = [0, 11.4];
  let flake = '';
  for (let i = 0; i < 6; i += 1) {
    const a = i * 60;
    flake += `M${pt([sx, sy])}L${pt([sx + 4.8 * Math.sin(rad(a)), sy - 4.8 * Math.cos(rad(a))])}`;
    if (!ctx.thumb) {
      const m = [sx + 3 * Math.sin(rad(a)), sy - 3 * Math.cos(rad(a))];
      const l = [m[0] + 1.7 * Math.sin(rad(a - 50)), m[1] - 1.7 * Math.cos(rad(a - 50))];
      const r = [m[0] + 1.7 * Math.sin(rad(a + 50)), m[1] - 1.7 * Math.cos(rad(a + 50))];
      flake += `M${pt(l)}L${pt(m)}L${pt(r)}`;
    }
  }
  const snow = `<path d="${flake}" fill="none" stroke="${C.rib}" stroke-width="${sw(ctx.thumb ? 3.6 : 3.2)}" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>` +
    `<path d="${flake}" fill="none" stroke="${C.white}" stroke-width="${sw(ctx.thumb ? 2 : 1.5)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  // Fluffy pom r 6 on top; bounces on every hop (pivot where it meets the beanie).
  const pom = `<g class="cos-pom" style="transform-origin:0.8px -16px">` +
    cel(ctx, 'cos-beanie-pom', fluffy(1, -21.6, 5.6, 9, 1.2), { fill: C.white, shade: '#d6def2', shadeOffset: [-2.4, -2.6], strokeWidth: WS * U }) +
    `<circle cx="-1.4" cy="-23.6" r="1.4" fill="${WHITE}"/></g>`;
  const gloss = GLOSS('M-15.6 -1.6C-14.4 -6.8 -10.6 -11 -6 -13', 2.4, 0.35);
  return `${pom}${dome}${gloss}${cuff}${snow}`;
}

function paperPartyCrown(ctx) {
  const C = { paper: '#ffd34d', fold: '#e3b23c', dot: '#ff7fb6', blue: '#9fd4ff', light: '#ffe58c' };
  // 5 zigzag points, 34 × 14 (plus the tips), tilted a party-hat 6° to the left.
  const P = [[-17, 6], [-18, -6.4], [-12.2, -0.6], [-8.6, -10], [-4, -1.2], [0, -12.6], [4, -1.2], [8.6, -10], [12.2, -0.6], [18, -6.4], [17, 6]];
  const crownD = `M${P.map(pt).join('L')}C9 9.6 -9 9.6 -17 6Z`;
  // Folded-paper facets: the left face of every point a shade lighter.
  const facets = [1, 3, 5, 7, 9].map((t) => {
    const T = P[t], A = P[t - 1];
    return `M${pt(T)}L${pt(A)}L${pt([T[0] + 0.6, A[1] + 4])}Z`;
  }).join('');
  const inner = `<path d="${facets}" fill="${C.light}"/>` +
    `<path d="M-17.4 3C-9 6.6 9 6.6 17.4 3L18 12L-18 12Z" fill="${mix(C.paper, C.fold, 0.5)}"/>` +
    (ctx.thumb ? '' : `<path class="cos-thin" d="M-17.1 3C-9 6.6 9 6.6 17.1 3" fill="none" stroke="${C.fold}" stroke-width="${sw(1.6)}" stroke-linecap="round"/>`);
  const crown = cel(ctx, 'cos-crown', crownD, { fill: C.paper, shade: C.fold, shadeOffset: [-2.4, -2.6], inner, strokeWidth: W * U });
  const dots = [[-8.6, -4.6, 1.8], [0, -6, 2], [8.6, -4.6, 1.8]].map(([x, y, r]) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.dot}" stroke="${OUTLINE}" stroke-width="${sw(1.1)}"/>`).join('');
  // Firework: 6 rays (pink / blue), 12 px, pops above the crown every 10 s after a rising spark.
  let fw = '';
  if (!ctx.thumb) {
    const [fx, fy] = [12.5, -19];
    const rays = Array.from({ length: 6 }, (_, i) => {
      const a = i * 60 + 30;
      const p0 = [fx + 2.4 * Math.sin(rad(a)), fy - 2.4 * Math.cos(rad(a))], p1 = [fx + 6 * Math.sin(rad(a)), fy - 6 * Math.cos(rad(a))];
      return `<path d="M${pt(p0)}L${pt(p1)}" stroke="${i % 2 ? C.blue : C.dot}" stroke-width="${sw(2.2)}" stroke-linecap="round"/>`;
    }).join('');
    fw = `<g class="cos-fx cos-firework-trail"><circle cx="9.4" cy="-11.4" r="${sw(1.3)}" fill="${C.light}"/></g>` +
      `<g class="cos-fx cos-firework" style="transform-origin:${fx}px ${fy}px">${rays}<circle cx="${fx}" cy="${fy}" r="1.3" fill="${WHITE}"/></g>`;
  }
  return `<g transform="rotate(-6 0 4)">${crown}${dots}</g>${fw}`;
}

/** Shared beret: a puffy lens 38 wide with a little stalk on top, tilted. */
function beret(ctx, key, { fill, shade, tilt = 10, dx = 1.5, w = 38, h = 16, decor = '' }) {
  const k = w / 38, v = h / 16;
  const s = (x, y) => `${f(x * k)} ${f(y * v)}`;
  const d = `M${s(-19, 4)}C${s(-21.6, -3.4)} ${s(-12.4, -10.8)} ${s(1, -10.8)}C${s(13.4, -10.8)} ${s(21.8, -4.8)} ${s(19.6, 2.6)}C${s(18, 7.6)} ${s(-16.2, 9.6)} ${s(-19, 4)}Z`;
  const band = `<path d="M${s(-15, 6.6)}C${s(-6, 10)} ${s(8, 9.6)} ${s(15.6, 5.8)}L${s(16, 12)}L${s(-15, 12)}Z" fill="${shade}" opacity=".55"/>`;
  const body = cel(ctx, key, d, { fill, shade, shadeOffset: [-4, -4], inner: band, strokeWidth: W * U });
  const stalk = lined(`M${s(0.6, -10.2)}C${s(0.4, -12.6)} ${s(1.6, -14.2)} ${s(3.6, -14.8)}`, fill, 2.4, 1.7);
  const gloss = GLOSS(`M${s(-13.6, -2.6)}C${s(-11.6, -6.2)} ${s(-7.4, -8.4)} ${s(-2.4, -8.8)}`, 2.4, 0.5);
  return `<g transform="translate(${dx} 1) rotate(${tilt} 0 4)">${stalk}${body}${gloss}${decor}</g>`;
}

function heartPatchBeret(ctx) {
  const C = { beret: '#d98ba0', patch: '#fff1df', stitch: '#b3667c' };
  const [hx, hy] = [-6.6, -2];
  const patch = `<g transform="rotate(-8 ${hx} ${hy})"><path d="${heartPath(hx, hy + 0.6, 10)}" fill="${C.patch}" ${OL(1.5)}/>` +
    (ctx.thumb ? '' : `<path class="cos-thin" d="${heartPath(hx, hy + 0.7, 6.6)}" fill="none" stroke="${C.stitch}" stroke-width="${sw(1)}" stroke-dasharray="1.5 1.2" stroke-linecap="round"/>`) +
    `<circle cx="${f(hx - 2.4)}" cy="${f(hy - 1.4)}" r=".9" fill="${WHITE}"/></g>`;
  return beret(ctx, 'cos-heart-beret', { fill: C.beret, shade: C.stitch, tilt: 10, dx: 1.8, decor: patch });
}

function blossomSprig(ctx) {
  const C = { twig: '#8a5a3b', petal: '#ffd3ec', centre: '#ff9ecf', leaf: '#7ccf6b' };
  // A twig 20 long tucked in at the right, with a short side shoot and a leaf; three blossoms.
  const twig = lined('M8.6 9.8C11.4 3.8 15.2 -2.4 20.6 -8.8', C.twig, 2.6, 1.6) + lined('M14.2 1.6C17.6 1 21 1.8 24 4.2', C.twig, 2.2, 1.5) +
    `<path d="M12.6 4.4C10.4 1.6 9.8 -1.2 10.6 -3.6C13 -2.2 14 0.6 13.6 3.6Z" fill="${C.leaf}" ${OL(1.6)}/>`;
  const flowers = blossom(15.4, -2.2, 4.6, C.petal, C.centre, 30, ctx.thumb) + blossom(25.6, 4.8, 5.4, C.petal, C.centre, -20, ctx.thumb) +
    blossom(21.4, -10.4, 6.6, C.petal, C.centre, 8, ctx.thumb);
  // A petal that drifts down 40 px every 8 s.
  const petal = ctx.thumb ? '' : `<g class="cos-fx cos-petal" style="transform-origin:22px -2px"><ellipse cx="22" cy="-2" rx="2.4" ry="1.7" fill="${C.petal}" stroke="${OUTLINE}" stroke-width="${sw(1)}" transform="rotate(-25 22 -2)"/></g>`;
  return `${twig}${flowers}${petal}`;
}

function rainBucketHat(ctx) {
  const C = { hat: '#ffd34d', edge: '#e3b23c', drop: '#9fd4ff' };
  // Soft crown (flat-ish top), then a brim that flares down and out like a little bell: 40 × 16 overall.
  const crownD = 'M-11.6 1C-12.2 -4 -11.8 -9 -9.6 -11.2C-6.6 -13.4 6.6 -13.4 9.6 -11.2C11.8 -9 12.2 -4 11.6 1Z';
  const seam = ctx.thumb ? '' : `<path class="cos-thin" d="M-10.8 -4.6C-4 -3 4 -3 10.8 -4.6" fill="none" stroke="${C.edge}" stroke-width="${sw(1.1)}" stroke-dasharray="1.8 1.4" stroke-linecap="round"/>`;
  const crown = cel(ctx, 'cos-bucket-crown', crownD, { fill: C.hat, shade: C.edge, shadeOffset: [-3.2, -3.2], inner: seam, strokeWidth: W * U });
  const brimD = 'M-12.4 -1C-16 0.4 -19.4 3.6 -20.4 7.4C-21 9.8 -18.8 11.2 -15.4 11.8C-6 13.4 6 13.4 15.4 11.8C18.8 11.2 21 9.8 20.4 7.4C19.4 3.6 16 0.4 12.4 -1C6 1.2 -6 1.2 -12.4 -1Z';
  const stitch = ctx.thumb ? '' : `<path class="cos-thin" d="M-16.6 7.4C-8.6 9.8 8.6 9.8 16.6 7.4" fill="none" stroke="${C.edge}" stroke-width="${sw(1.1)}" stroke-dasharray="1.8 1.4" stroke-linecap="round"/>`;
  const brim = cel(ctx, 'cos-bucket-brim', brimD, { fill: C.hat, shade: C.edge, shadeOffset: [0, -2.6], inner: stitch, strokeWidth: W * U });
  // Raindrop pin on the crown, front right.
  const pin = `<path d="M5.8 -10.6C8.2 -7.8 9.2 -6 9.2 -4.6C9.2 -2.6 7.7 -1.4 5.8 -1.4C3.9 -1.4 2.4 -2.6 2.4 -4.6C2.4 -6 3.4 -7.8 5.8 -10.6Z" fill="${C.drop}" ${OL(1.8)}/>` +
    `<circle cx="4.5" cy="-4.6" r="1" fill="${WHITE}"/>`;
  const gloss = GLOSS('M-8.4 -6.2C-8 -8.6 -6.4 -10.2 -3.6 -10.8', 2.2, 0.6) + GLOSS('M-15.8 6C-13.6 3.8 -10.6 2.6 -7 2', 1.8, 0.5);
  const drip = ctx.thumb ? '' : `<g class="cos-fx cos-drip" style="transform-origin:16.4px 11.6px"><path d="M16.4 11.4C17.9 13.4 18.6 14.6 18.6 15.6C18.6 16.9 17.6 17.8 16.4 17.8C15.2 17.8 14.2 16.9 14.2 15.6C14.2 14.6 14.9 13.4 16.4 11.4Z" fill="${C.drop}" stroke="${OUTLINE}" stroke-width="${sw(1.2)}"/><circle cx="15.7" cy="15.4" r=".6" fill="${WHITE}"/></g>`;
  return `${crown}${pin}${brim}${gloss}${drip}`;
}

// ---------- Keeper road cosmetics (CONTENT.md §F) ----------

function seedling(ctx) {
  const C = { stem: '#4f9a45', leaf: '#7ccf6b' };
  const leafL = 'M0.4 -9C-1.6 -14 -6.6 -15.8 -10.2 -13.2C-8 -9.2 -3.4 -7.4 0.4 -9Z';
  const leafR = 'M0.4 -9C2.4 -14.6 8 -16.4 11.6 -13.4C9.2 -9 4 -7.4 0.4 -9Z';
  const vein = ctx.thumb ? '' : `<path class="cos-thin" d="M-0.8 -9.8C-3.4 -11.8 -5.8 -12.8 -8.2 -13M1.6 -10C4.4 -12.2 7.2 -13.2 9.8 -13.4" fill="none" stroke="${C.stem}" stroke-width="${sw(1.1)}" stroke-linecap="round"/>`;
  const leafCel = (key, d) => cel(ctx, key, d, { fill: C.leaf, shade: mix(C.leaf, C.stem, 0.55), shadeOffset: [-1.6, -2], strokeWidth: WS * U });
  const leaves = leafCel('cos-seed-leafL', leafL) + leafCel('cos-seed-leafR', leafR) + vein +
    `<circle cx="-5.8" cy="-13" r="1.1" fill="${WHITE}" opacity=".85"/><circle cx="6.2" cy="-13.8" r="1.1" fill="${WHITE}" opacity=".85"/>`;
  return `<g class="cos-sway" style="transform-origin:0px 4.6px">${lined('M0 4.6C-0.8 0.4 1 -4.4 0.4 -9', C.stem, 2.4, 1.6)}` +
    `<g class="cos-sway cos-sway--leaves" style="transform-origin:0.4px -9px">${leaves}</g></g>`;
}

function keepersCap(ctx) {
  const C = { oat: '#e8dcc4', plum: '#6b3f7a', patch: '#c9a2ff' };
  const crownD = 'M-16.6 4.6C-17.8 -4 -9.4 -9.8 0 -9.8C9.4 -9.8 17.8 -4 16.6 4.6C10 7.8 -10 7.8 -16.6 4.6Z';
  const seams = ctx.thumb ? '' : `<path class="cos-thin" d="M0 -9.6C-1.2 -4 -1 0.8 -0.4 6.6M-9.4 -6.8C-11.6 -2.6 -12.4 1.4 -12.2 5.6M9.6 -6.8C11.6 -2.6 12.2 1.4 12 5.6" fill="none" stroke="${shadeOf(C.oat, 0.16)}" stroke-width="${sw(1.1)}" stroke-linecap="round"/>`;
  const crown = cel(ctx, 'cos-kcap-crown', crownD, { fill: C.oat, shade: shadeOf(C.oat, 0.16), shadeOffset: [-3.6, -3.6], inner: seams, strokeWidth: W * U });
  // Short plum brim 18 × 4, to the front-right.
  const brimD = 'M1.6 4.4C8.6 3 16.4 2.2 21.8 4C24.2 4.8 23.4 8 20.6 8.6C14.4 9.8 7.6 9.4 1.6 8.2C0.4 7.2 0.4 5.4 1.6 4.4Z';
  const brim = cel(ctx, 'cos-kcap-brim', brimD, { fill: C.plum, shade: shadeOf(C.plum, 0.3), shadeOffset: [-1.6, -1.8], strokeWidth: (WS + 0.5) * U }) +
    GLOSS('M5 5.2C10 4.2 15 3.8 19 4.4', 1.4, 0.45);
  const button = `<circle cx="0" cy="-9.8" r="2.2" fill="${C.plum}" ${OL(1.6)}/>`;
  const patch = `<g transform="rotate(-8 -7.6 -1.4)"><path d="${rrect(-10.6, -4.4, 6, 6, 1.2)}" fill="${C.patch}" ${OL(1.6)}/>` +
    (ctx.thumb ? '' : `<path class="cos-thin" d="${rrect(-9.6, -3.4, 4, 4, 0.6)}" fill="none" stroke="${C.plum}" stroke-width="${sw(0.9)}" stroke-dasharray="1.1 .9"/>`) + '</g>';
  const gloss = GLOSS('M-12.6 -2.6C-11.4 -5.6 -8.4 -7.8 -4.8 -8.4', 2.2, 0.6);
  return `${button}${crown}${patch}${gloss}${brim}`;
}

function studyHeadphones(ctx) {
  const C = { band: '#2b2740', cup: '#6f6585', cushion: '#9fd4ff', shine: '#6f6585' };
  const fit = headFit(ctx.species);
  // Band 3 px riding on the head (inside its outline so it reads against the fur), down to the cups.
  const bfit = { rx: fit.rx - 2.6, ry: fit.ry - 6, cy: fit.cy };
  const endA = fit.cupA - 13;
  const band = lined(arcBetween(bfit, -endA, endA), C.band, 3.4, 1.9) +
    (ctx.thumb ? '' : `<path class="cos-thin" d="${arcBetween(bfit, -endA + 10, -14, -0.8)}" fill="none" stroke="${C.shine}" stroke-width="${sw(1.2)}" stroke-linecap="round"/>`);
  const cup = (side) => {
    const a = side * fit.cupA;
    const [x, y] = onHead(fit, a, 2.2);
    const tilt = normalAt(fit, a) - side * 90; // stand the cup along the head's side
    const hold = onHead(bfit, side * endA);
    const slider = lined(`M${pt(hold)}L${pt([x + side * 0.5, y - 6.6])}`, C.cup, 3.2, 1.5);
    const art = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(tilt)})">` +
      `<path d="${rrect(-side * 4.8 - 2.6, -6.6, 5.2, 13.2, 2.6)}" fill="${C.cushion}" ${OL(2)}/>` +
      cel(ctx, `cos-phones-cup${side > 0 ? 'R' : 'L'}`, rrect(-6 + side * 1.4, -7, 12, 14, 5), { fill: C.cup, shade: shadeOf(C.cup, 0.3), shadeOffset: [-2.4, -2.4], strokeWidth: (WS + 0.5) * U }) +
      `<circle cx="${f(side * 1.8)}" cy="0" r="2.4" fill="${C.cushion}" ${OL(1.2)}/>` +
      (ctx.thumb ? '' : GLOSS(`M${f(side * 1.4 - 3.4)} -3.6Q${f(side * 1.4 - 3)} -5.4 ${f(side * 1.4 - 1.2)} -5.6`, 1.4, 0.6)) + '</g>';
    return slider + art;
  };
  return `${band}${cup(-1)}${cup(1)}`;
}

/** Alice band on the head: follows the outline a little inside and wraps behind at the sides. */
function headband(fit, color, w) {
  const bfit = { rx: fit.rx - 2.4, ry: fit.ry - 5.6, cy: fit.cy };
  return { fit: bfit, art: lined(arcBetween(bfit, -76, 76), color, w, 1.9) };
}

function littleLantern(ctx) {
  const C = { plum: '#6b3f7a', amber: '#ffb347', glow: '#ffe08a', rib: '#e9a25a' };
  const fit = headFit(ctx.species);
  const hb = headband(fit, C.plum, 3);
  // Charm above the right temple: clipped to the band, standing out along the head's normal.
  const a = fit.sideA;
  const [bx, by] = onHead(hb.fit, a);
  const n = normalAt(fit, a);
  const k = Math.min(fit.hat, 1.3);
  const glowId = ctx.defOnce('cos-lantern-glow', (full) => `<radialGradient id="${full}"><stop offset="0" stop-color="${C.glow}" stop-opacity="1"/><stop offset=".5" stop-color="${C.glow}" stop-opacity=".5"/><stop offset="1" stop-color="${C.glow}" stop-opacity="0"/></radialGradient>`);
  // Local frame: origin on the band, "up" = outward; the lantern body sits 9.5 above, scaled like a hat.
  const ly = -9.5;
  const prev = U;
  U = 1 / k;
  let body;
  try {
    body = `<g class="cos-glow" style="transform-origin:0px ${ly}px"><circle cx="0" cy="${ly}" r="12" fill="url(#${glowId})" opacity=".4"/></g>` +
      lined(`M0 0.6C0.4 -1.6 -0.4 -2.8 0 ${ly + 5.6}`, C.plum, 1.6, 1.4) +
      `<ellipse cx="0" cy="${ly}" rx="3.9" ry="4.7" fill="${C.amber}" ${OL(2.2)}/>` +
      `<ellipse cx="-0.4" cy="${f(ly + 0.6)}" rx="1.9" ry="2.6" fill="${C.glow}"/>` +
      (ctx.thumb ? '' : `<path class="cos-thin" d="M-1.6 ${f(ly - 4.2)}Q-3.7 ${ly} -1.6 ${f(ly + 4.2)}M1.6 ${f(ly - 4.2)}Q3.7 ${ly} 1.6 ${f(ly + 4.2)}" fill="none" stroke="${C.rib}" stroke-width="${sw(0.9)}"/>`) +
      `<path d="${rrect(-2.7, ly - 6.4, 5.4, 2.5, 0.8)}" fill="${C.plum}" ${OL(1.4)}/><path d="${rrect(-2.3, ly + 4.1, 4.6, 2.3, 0.8)}" fill="${C.plum}" ${OL(1.4)}/>` +
      `<path d="M0 ${f(ly - 6.4)}V${f(ly - 8.4)}" stroke="${OUTLINE}" stroke-width="${sw(1.6)}" stroke-linecap="round"/>` +
      `<circle cx="-1.6" cy="${f(ly - 1.8)}" r="1" fill="${WHITE}"/>`;
  } finally { U = prev; }
  const charm = `<g transform="translate(${f(bx)} ${f(by)}) rotate(${f(n * 0.85)}) scale(${f(k)})">${body}</g>`;
  return `${hb.art}${charm}`;
}

function fieldPencil(ctx) {
  const C = { band: '#f3e6c8', pencil: '#ffd34d', eraser: '#ff9ecf', wood: '#e3cf72', ferrule: '#cfd3e0' };
  const fit = headFit(ctx.species);
  const hb = headband(fit, C.band, 4);
  // Pencil 18 × 4 tucked diagonally under the band at the front-left of the crown (clear of horns and
  // ears): the band holds it just above the sharpened end, and the body and eraser stick up and out.
  const a = -fit.pencilA;
  const [cx, cy] = onHead(hb.fit, a);
  const k = Math.min(fit.hat, 1.3) * 1.25;
  const ang = normalAt(hb.fit, a) + 66; // SVG rotation of the pencil's axis (eraser → point)
  const P = (u, v) => {
    const c = Math.cos(rad(ang)), s = Math.sin(rad(ang));
    const uu = u - 2.6, w = v * 1.45; // the band crosses at u = 2.6; drawn 5.8 wide so the yellow reads
    return [cx + k * (uu * c - w * s), cy + k * (uu * s + w * c)];
  };
  const poly = (pts) => `M${pts.map((q) => pt(P(...q))).join('L')}Z`;
  const pencilD = `M${pt(P(-9, -2))}L${pt(P(5.2, -2))}L${pt(P(8.4, -0.5))}Q${pt(P(9.2, 0))} ${pt(P(8.4, 0.5))}L${pt(P(5.2, 2))}L${pt(P(-9, 2))}Q${pt(P(-10.6, 2))} ${pt(P(-10.6, 0))}Q${pt(P(-10.6, -2))} ${pt(P(-9, -2))}Z`;
  const pencil = `<path d="${pencilD}" fill="${C.pencil}"/>` +
    `<path d="${poly([[5.2, -2], [8.4, -0.5], [8.4, 0.5], [5.2, 2]])}" fill="${C.wood}"/>` +
    `<path d="${poly([[7.3, -1], [9, -0.25], [9, 0.25], [7.3, 1]])}" fill="${OUTLINE}"/>` +
    `<path d="M${pt(P(-6.8, -2))}L${pt(P(-9, -2))}Q${pt(P(-10.6, -2))} ${pt(P(-10.6, 0))}Q${pt(P(-10.6, 2))} ${pt(P(-9, 2))}L${pt(P(-6.8, 2))}Z" fill="${C.eraser}"/>` +
    `<path d="${poly([[-6.8, -2], [-4.8, -2], [-4.8, 2], [-6.8, 2]])}" fill="${C.ferrule}"/>` +
    `<path d="${poly([[-4.8, 0.7], [5.2, 0.7], [5.2, 2], [-4.8, 2]])}" fill="${mix(C.pencil, '#e3b23c', 0.7)}"/>` +
    `<path d="${pencilD}" fill="none" ${OL(2.6)}/>` +
    (ctx.thumb ? '' : `<path d="M${pt(P(-6.8, -2))}L${pt(P(-6.8, 2))}M${pt(P(-4.8, -2))}L${pt(P(-4.8, 2))}M${pt(P(5.2, -2))}L${pt(P(5.2, 2))}" stroke="${OUTLINE}" stroke-width="${sw(1.1)}"/>` +
      GLOSS(`M${pt(P(-3.6, -0.9))}L${pt(P(3.6, -0.9))}`, 1.1, 0.75));
  // The band passes over the pencil's middle, so it reads as tucked in.
  return `${pencil}${hb.art}`;
}

function graduationCap(ctx) {
  const C = { board: '#1f1b2e', tassel: '#ffe08a', rim: '#6d6494', sheen: '#2d2843', edge: '#2a2540' };
  const capD = 'M-11.4 6.2C-11.8 2.6 -11.4 -0.6 -10.8 -2.6H10.8C11.4 -0.6 11.8 2.6 11.4 6.2C6 9 -6 9 -11.4 6.2Z';
  const cap = cel(ctx, 'cos-grad-cap', capD, { fill: C.board, shade: '#141120', shadeOffset: [-3, -3], strokeWidth: W * U }) +
    GLOSS('M-8.6 4.6C-9 2.4 -8.8 0.6 -8.4 -0.8', 1.6, 0.35);
  // Mortarboard 36 × 8 in perspective, with a thin edge under the front.
  const [L, B, R, Fr] = [[-18, -4.4], [0, -9.6], [18, -4.4], [0, 0.8]];
  const boardD = `M${pt(L)}L${pt(B)}L${pt(R)}L${pt(Fr)}Z`;
  const edgeD = `M${pt(L)}L${pt(Fr)}L${pt(R)}L${pt([R[0], R[1] + 2.2])}L${pt([0, Fr[1] + 2.4])}L${pt([L[0], L[1] + 2.2])}Z`;
  const board = `<path d="${edgeD}" fill="${C.edge}" ${OL(WS)}/>` +
    `<path d="${boardD}" fill="${C.board}" ${OL(W)}/>` +
    `<path d="M${pt([L[0] + 2.6, L[1]])}L${pt([0, B[1] + 1.3])}L${pt([0, Fr[1] - 1.3])}Z" fill="${C.sheen}"/>` +
    `<path d="M${pt([L[0] + 2.6, L[1] + 0.1])}L${pt([0, B[1] + 1.3])}L${pt([R[0] - 2.6, R[1] + 0.1])}" fill="none" stroke="${C.rim}" stroke-width="${sw(1.5)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  // Tassel: cord to the right corner, hangs and swings ±10° on hops (pivot at the corner).
  const cord = `<path d="M0 -4.4L15.4 -4.2" fill="none" stroke="${C.tassel}" stroke-width="${sw(1.7)}" stroke-linecap="round"/>`;
  const button = `<circle cx="0" cy="-4.4" r="2.1" fill="${C.tassel}" ${OL(1.3)}/>`;
  const hang = `<g class="cos-tassel" style="transform-origin:15.8px -4.2px">` +
    lined('M15.8 -4.2C16.2 -0.8 16.4 2.2 16.4 5', C.tassel, 1.7, 1.2) +
    `<path d="M14.6 5.2H18.2C18.8 7.6 19 10 18.8 12.6C17.4 13.4 15.4 13.4 14 12.6C13.8 10 14 7.6 14.6 5.2Z" fill="${C.tassel}" ${OL(1.6)}/>` +
    (ctx.thumb ? '' : `<path class="cos-thin" d="M15.6 8V12.2M17.2 8V12.2" stroke="#e3b23c" stroke-width="${sw(1)}" stroke-linecap="round"/>`) +
    `<path d="M14.2 5.2H18.6" stroke="${OUTLINE}" stroke-width="${sw(1.7)}" stroke-linecap="round"/></g>`;
  return `${cap}${board}${cord}${button}${hang}`;
}

function mossBeret(ctx) {
  const C = { beret: '#9bb58a', fern: '#4f9a45' };
  const [fx, fy] = [6.6, -1.4];
  let fern;
  if (ctx.thumb) fern = `<path d="M${fx - 3} ${fy + 4}C${fx - 1} ${fy} ${fx + 1} ${fy - 2.4} ${fx + 3.4} ${fy - 4}" fill="none" stroke="${C.fern}" stroke-width="${sw(2)}" stroke-linecap="round"/>`;
  else {
    // Embroidered fern, 8 px: a curved rib with four pairs of leaflets.
    const rib = `M${fx - 3.2} ${fy + 4.2}C${fx - 1.2} ${fy + 0.4} ${fx + 0.8} ${fy - 2.2} ${fx + 3.6} ${fy - 4}`;
    const pairs = [[-1.9, 2.1, 2.6], [-0.6, 0.5, 2.4], [0.8, -1, 2.1], [2.2, -2.6, 1.6]].map(([dx, dy, l]) => {
      const x = fx + dx, y = fy + dy;
      return `M${f(x)} ${f(y)}L${f(x - l * 0.75)} ${f(y - l * 0.7)}M${f(x)} ${f(y)}L${f(x + l * 0.85)} ${f(y + l * 0.35)}`;
    }).join('');
    fern = `<path class="cos-thin" d="${rib}${pairs}" fill="none" stroke="${C.fern}" stroke-width="${sw(1.3)}" stroke-linecap="round"/>`;
  }
  return beret(ctx, 'cos-moss-beret', { fill: C.beret, shade: shadeOf(C.beret, 0.22), tilt: -12, dx: -1.8, h: 15, decor: fern });
}

function orbitClub(ctx) {
  const C = { beret: '#dfccff', ring: '#cfd3e0', dot: '#9fd4ff' };
  const [px, py] = [6.4, -2];
  const pin = `<circle cx="${px}" cy="${py}" r="4" fill="none" stroke="${OUTLINE}" stroke-width="${sw(3.6)}"/>` +
    `<circle cx="${px}" cy="${py}" r="4" fill="none" stroke="${C.ring}" stroke-width="${sw(1.6)}"/>` +
    `<circle cx="${px}" cy="${py}" r="2" fill="${C.dot}" ${OL(1.1)}/>` +
    (ctx.thumb ? '' : `<circle cx="${f(px - 0.6)}" cy="${f(py - 0.7)}" r=".6" fill="${WHITE}"/>` +
      `<g class="cos-orbit" style="transform-origin:${px}px ${py}px"><circle cx="${px + 4}" cy="${py}" r="1.15" fill="${WHITE}" stroke="${OUTLINE}" stroke-width="${sw(0.8)}"/></g>`);
  return beret(ctx, 'cos-orbit-beret', { fill: C.beret, shade: mix(C.beret, '#9c72e8', 0.45), tilt: 8, dx: 1, w: 37, h: 15.5, decor: pin });
}

function keepersLaurel(ctx) {
  const C = { leaf: '#f3e6c8', vein: '#e3cf72', ribbon: '#6b3f7a' };
  const fit = headFit(ctx.species);
  const wfit = { rx: fit.rx - 0.4, ry: fit.ry - 1.6, cy: fit.cy };
  // Plum ribbon at the back (drawn first): a small bow at the crown; its tails tuck behind the head.
  const [bx, by] = onHead(wfit, 0, -0.5);
  const loop = (s) => `<path d="M${f(bx)} ${f(by)}C${f(bx + s * 3)} ${f(by - 5.6)} ${f(bx + s * 8.8)} ${f(by - 4.8)} ${f(bx + s * 8)} ${f(by - 0.6)}C${f(bx + s * 7.4)} ${f(by + 2.6)} ${f(bx + s * 3)} ${f(by + 1.6)} ${f(bx)} ${f(by)}Z"/>`;
  const bow = union([loop(-1), loop(1)], C.ribbon, 1.6) + `<circle cx="${f(bx)}" cy="${f(by)}" r="2.1" fill="${C.ribbon}" ${OL(1.4)}/>` +
    (ctx.thumb ? '' : GLOSS(`M${f(bx - 6)} ${f(by - 2.6)}Q${f(bx - 4.2)} ${f(by - 3.9)} ${f(bx - 2.6)} ${f(by - 2.8)}`, 1, 0.5));
  // Two branches of 4 broad leaves, open at the crown.
  const L = 15, Wd = 5;
  const leafD = `M0 0C${f(Wd)} -2.4 ${f(Wd * 1.1)} ${f(-L * 0.6)} 0 ${f(-L)}C${f(-Wd * 1.1)} ${f(-L * 0.6)} ${f(-Wd)} -2.4 0 0Z`;
  const branch = (side) => {
    const stemArc = side < 0 ? arcBetween(wfit, -78, -14) : `M${pt(onHead(wfit, 78))}A${f(wfit.rx)} ${f(wfit.ry)} 0 0 0 ${pt(onHead(wfit, 14))}`;
    const stem = lined(stemArc, C.vein, 1.8, 1.3);
    const leaves = [72, 56, 40, 24].map((a, i) => {
      const [x, y] = onHead(wfit, side * a);
      const n = normalAt(wfit, side * a); // outward
      const toward = n - side * 90; // along the head toward the crown
      const ang = toward + (i % 2 ? -side * 32 : side * 26); // alternate in / out of the stem
      const vein = ctx.thumb ? '' : `<path class="cos-thin" d="M0 -1.8L0 ${f(-L * 0.78)}" stroke="${C.vein}" stroke-width="${sw(1.2)}" stroke-linecap="round"/>`;
      return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"><path d="${leafD}" fill="${C.leaf}" ${OL(2.4)}/>` +
        `<path d="M${f(Wd * 0.55)} -3C${f(Wd * 0.95)} ${f(-L * 0.42)} ${f(Wd * 0.6)} ${f(-L * 0.7)} 0 ${f(-L * 0.9)}L0 -2Z" fill="${C.vein}" opacity=".55"/>${vein}</g>`;
    }).join('');
    return stem + leaves;
  };
  return `${bow}${branch(-1)}${branch(1)}`;
}

// ---------- catalogue ----------

const def = (id, name, source, extra, draw) => Object.freeze({ id, name, source, ...extra, draw });

/**
 * Every account-wide cosmetic, keyed by the engine's id (engine/content.js SEASON_COSMETICS and the
 * Keeper road's special levels). draw(ctx) → markup with (0, 0) at the head-top socket.
 * source: 'season' (season tier 30; `season` = 'YYYY-MM') or 'keeper' (`level` on the Keeper road).
 * motion: the CONTENT.md motion key ('none' when static). glowFlicker (lantern) and satelliteOrbit
 * (Orbit Club) are small additions beyond the brief, focused pet only.
 */
export const COSMETICS = Object.freeze({
  acornCap: def('acornCap', 'Acorn Cap', 'season', { season: '2026-11', motion: 'stemSway' }, asHat('acornCap', acornCap)),
  snowfallBeanie: def('snowfallBeanie', 'Snowfall Beanie', 'season', { season: '2026-12', motion: 'pomBounce' }, asHat('snowfallBeanie', snowfallBeanie)),
  paperPartyCrown: def('paperPartyCrown', 'Paper Party Crown', 'season', { season: '2027-01', motion: 'fireworkPop10s' }, asHat('paperPartyCrown', paperPartyCrown)),
  heartPatchBeret: def('heartPatchBeret', 'Heart Patch Beret', 'season', { season: '2027-02', motion: 'none' }, asHat('heartPatchBeret', heartPatchBeret)),
  blossomSprig: def('blossomSprig', 'Blossom Sprig', 'season', { season: '2027-03', motion: 'petalDrift8s' }, asHat('blossomSprig', blossomSprig)),
  rainBucketHat: def('rainBucketHat', 'Rain Bucket Hat', 'season', { season: '2027-04', motion: 'brimDrip9s' }, asHat('rainBucketHat', rainBucketHat)),
  seedling: def('seedling', 'Seedling', 'keeper', { level: 3, motion: 'leafSway' }, asHat('seedling', seedling)),
  keepersCap: def('keepersCap', "Keeper's Cap", 'keeper', { level: 5, motion: 'none' }, asHat('keepersCap', keepersCap)),
  studyHeadphones: def('studyHeadphones', 'Study Headphones', 'keeper', { level: 15, motion: 'none' }, asWrap('studyHeadphones', studyHeadphones)),
  littleLantern: def('littleLantern', 'Little Lantern', 'keeper', { level: 20, motion: 'glowFlicker' }, asWrap('littleLantern', littleLantern)),
  fieldPencil: def('fieldPencil', 'Field Pencil', 'keeper', { level: 30, motion: 'none' }, asWrap('fieldPencil', fieldPencil)),
  graduationCap: def('graduationCap', 'Graduation Cap', 'keeper', { level: 40, motion: 'tasselSwing' }, asHat('graduationCap', graduationCap)),
  mossBeret: def('mossBeret', 'Moss Beret', 'keeper', { level: 45, motion: 'none' }, asHat('mossBeret', mossBeret)),
  orbitClub: def('orbitClub', 'Orbit Club', 'keeper', { level: 50, motion: 'satelliteOrbit' }, asHat('orbitClub', orbitClub)),
  keepersLaurel: def('keepersLaurel', "Keeper's Laurel", 'keeper', { level: 60, motion: 'none' }, asWrap('keepersLaurel', keepersLaurel)),
});

/** Ids in reward order: the six season hats by month, then the Keeper road by level. */
export const COSMETIC_IDS = Object.freeze(Object.keys(COSMETICS));

/**
 * Standalone cosmetic icon (season card preview, Keeper road, shop): the cosmetic on a dim
 * mannequin head in the shared 160 viewBox. Static unless animate (then it idles like a focused pet).
 * An unknown id renders the empty mannequin with a "?".
 */
export function renderCosmetic({ id, size = 72, uid, animate = false, stand = true, className = '' } = {}) {
  const s = Number(size) > 0 ? Math.round(Number(size)) : 72;
  const k = 1.5;
  const ctx = makeContext({ species: 'preview', tier: 0, size: Math.round(s * k), uid });
  const item = Object.prototype.hasOwnProperty.call(COSMETICS, id) ? COSMETICS[id] : null;
  const markup = item ? item.draw(ctx) : '';
  const fit = HEAD_FIT.default;
  const head = stand
    ? `<g class="cos-stand"><ellipse cx="0" cy="${fit.cy}" rx="${fit.rx}" ry="${fit.ry}" fill="#2b2740" stroke="#4a4560" stroke-width="3"/>` +
      `<path d="M-23 ${fit.cy - 12}Q-18.6 ${fit.cy - 23} -8 ${fit.cy - 27}" fill="none" stroke="#4a4560" stroke-width="3" stroke-linecap="round" opacity=".8"/></g>`
    : '';
  const unknown = item ? '' : `<text x="0" y="${fit.cy + 9}" text-anchor="middle" font-size="26" font-weight="700" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" fill="#5f5975">?</text>`;
  const body = `<g transform="translate(80 ${stand ? 50 : 96}) scale(${k})">${head}${unknown}${markup}</g>`;
  const cls = ['pet-cosmetic', item ? `cosmetic--${item.id}` : 'cosmetic--unknown', `pet--s${s}`, animate ? 'pet--focus cosmetic--live' : 'pet--still', className];
  return svgRoot({ size: s, classes: cls, label: item ? item.name : 'Unknown cosmetic', defs: ctx.defs, body });
}
