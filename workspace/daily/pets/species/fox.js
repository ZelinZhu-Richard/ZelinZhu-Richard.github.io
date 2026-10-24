// Kitsu (fox). CONTENT.md §A.2 "Kitsu (fox)". Contract: species/_template.js (slime.js is the reference).
//
// Pose by mood (static geometry; CSS adds motion in the "species: fox" block of pets.css):
//   healthy  sitting, tail plume up behind the right hip, ears tilted ±15°
//   happy    ears perked, tail lifted (CSS wags it on the focused pet)
//   hungry   airplane ears (35° outward), half lids, tail wrapped tight round the feet
//   starving ears flat (70°), tail curled high in front, head lowered onto it (CSS --head-y)
//
// Layering: the ears and cheek ruff sit behind the head dome inside g-head; the upper ear tips are
// repeated in g-occlude-front so a hat tucks behind them. The wrapped tail (hungry/starving) is
// drawn in g-arms so it lies in front of the paws. Spirit tails (Epic+) are drawn first inside
// g-tail (not g-aura-back) so they hop, float and slump with the fox (ARCHITECTURE.md note).

import { cel, face, specular, star4, glow, flame, trim, prismOverlay, ol, f, rot } from '../rig.js';
import { OUTLINE, WHITE, GOLD, COIN, COIN_EDGE, FACE, mix } from '../palette.js';

const INNER_EAR = '#ffc4dc';
const LEAF = '#7ccf6b';
const LEAF_PRINT = '#4f9a45';
const WISP_CORE = '#ffe4f2';
const WISP_EDGE = '#ff9ecf';
const AURA_CENTER = [80, 94];

// Ear tilt (deg, outward) and tail pose per mood.
const POSE = {
  healthy: { ear: 0, tail: 'up', tailRot: 0 },
  happy: { ear: -5, tail: 'up', tailRot: -7 },
  hungry: { ear: 35, tail: 'wrap', tailRot: 0 },
  starving: { ear: 70, tail: 'curl', tailRot: 0 },
};

// ---------- geometry ----------
// A shape is [[x, y], [c1x, c1y, c2x, c2y, x, y], …] (one move + cubic segments), closed.
const I = (p) => p;
function P(pts, T = I, close = true) {
  const q = (x, y) => T([x, y]).map(f).join(' ');
  const [s, ...segs] = pts;
  return `M${q(...s)}` + segs.map((c) => `C${q(c[0], c[1])} ${q(c[2], c[3])} ${q(c[4], c[5])}`).join('') + (close ? 'Z' : '');
}
const mirrorPts = (pts) => pts.map((a) => a.map((v, i) => (i % 2 === 0 ? 160 - v : v)));

// Head: a wide dome (cx 80, cy 64) whose cheeks flare into two fluffy ruff points per side,
// narrowing to a soft muzzle chin. The cheek ruff is part of the head silhouette.
const HEAD_R = [
  [100, 30, 115.5, 42, 116.5, 58.5],
  [117, 64.5, 119, 70, 125, 74.5],
  [121.5, 76.8, 119.5, 77.6, 117.2, 78.2],
  [120.6, 81.2, 122.2, 84.6, 122.4, 88.6],
  [117.6, 89.2, 113.6, 89.4, 110.4, 90.4],
  [102, 93.4, 91, 98.6, 80, 98.6],
];
/** Close a right-half chain (from (80, top) down to (80, chin)) with its mirror image. */
function mirrorClose(start, segs) {
  const m = ([x, y]) => [160 - x, y];
  const ends = [start, ...segs.map((c) => [c[4], c[5]])];
  const back = segs.map((c, k) => [...m([c[2], c[3]]), ...m([c[0], c[1]]), ...m(ends[k])]).reverse();
  return [start, ...segs, ...back];
}
const HEAD = mirrorClose([80, 30], HEAD_R);
// Mask boundary (belly below it): under the eyes, rising to a narrow blaze between them.
const MASK_LINE = [[28, 61], [43, 63, 55, 79.5, 67, 79.8], [74, 80, 77.6, 72, 80, 64.5], [82.4, 72, 86, 80, 93, 79.8], [105, 79.5, 117, 63, 132, 61]];
// Muzzle: a lighter rounded triangle round the nose and mouth.
const MUZZLE = [[69.5, 75], [69.5, 70.2, 90.5, 70.2, 90.5, 75], [90.5, 80.5, 84.5, 86, 80, 86], [75.5, 86, 69.5, 80.5, 69.5, 75]];

// Ear in local coordinates: root (pivot) at (0, 12), tip at (0, -24.6). Base 26, height ~37.
const EAR = [
  [-13, 12],
  [-14.2, -0.5, -7.6, -16.2, -1.9, -23.5],
  [-0.8, -24.9, 0.8, -24.9, 1.9, -23.5],
  [7.6, -16.2, 14.2, -0.5, 13, 12],
  [6.5, 14.5, -6.5, 14.5, -13, 12],
];
const EAR_INNER = [
  [-7.8, 10],
  [-8.4, 0, -4.4, -11.5, 0, -17.5],
  [4.4, -11.5, 8.4, 0, 7.8, 10],
  [3.5, 12, -3.5, 12, -7.8, 10],
];
// White fluff tuft at the base of the inner ear.
const EAR_FLUFF = [
  [-8.6, 12],
  [-8.2, 2, -6.4, -3.5, -4.4, -7.6],
  [-3.6, -4, -2.2, -2.6, -0.6, -4.8],
  [0.8, -2.2, 2.4, -2.8, 3.6, -6.2],
  [5.6, -2.5, 8, 2, 8.6, 12],
];
const EAR_L = { at: [57, 36], tilt: -16 };
const EAR_R = { at: [103, 36], tilt: 16 };

// Body: a sitting pear (cx 80, cy 116) with a chest bib.
const BODY = [
  [80, 86],
  [95, 86, 104, 101, 106, 117],
  [108, 131, 107.5, 145.5, 96, 147],
  [88, 147.8, 72, 147.8, 64, 147],
  [52.5, 145.5, 52, 131, 54, 117],
  [56, 101, 65, 86, 80, 86],
];
const BIB = [
  [80, 90],
  [89, 90, 92, 104, 91.5, 117],
  [91, 127, 86, 136, 80, 140],
  [74, 136, 69, 127, 68.5, 117],
  [68, 104, 71, 90, 80, 90],
];
// Haunch (left; right mirrored): a rounded thigh bulging past the hip.
const HAUNCH_L = [
  [56, 147.5],
  [48, 147.5, 45.5, 138, 48.5, 130.5],
  [51.5, 123, 61, 120.5, 67, 126.5],
  [71.5, 131.5, 72, 142, 69, 147.5],
  [65, 148, 60, 148, 56, 147.5],
];
const HAUNCH_R = mirrorPts(HAUNCH_L);
// Front leg (left; right mirrored): a stubby column ending in an 8 × 6-ish paw at (70, 145).
const LEG_L = [
  [63.6, 121],
  [63.6, 129, 62.2, 136, 61.8, 141],
  [61.4, 146.6, 64.5, 148.2, 70, 148.2],
  [75.5, 148.2, 78.6, 146.6, 78.2, 141],
  [77.8, 136, 76.6, 129, 76.6, 121],
  [74.5, 115.5, 65.7, 115.5, 63.6, 121],
];
const LEG_R = mirrorPts(LEG_L);
// Open outline of a leg: outer side, paw, inner side up to the chest.
const LEG_LINE_L = [
  [63.6, 125],
  [63.6, 130, 62.2, 136, 61.8, 141],
  [61.4, 146.6, 64.5, 148.2, 70, 148.2],
  [75.5, 148.2, 78.6, 146.6, 78.2, 141],
  [78, 138, 77.6, 135.5, 77.3, 133],
];
const LEG_LINE_R = mirrorPts(LEG_LINE_L);

// Tail, plume up (healthy/happy): from behind the right hip, out and up to a curled tip by (128, 80).
const TAIL_PIVOT = [104, 136];
const TAIL_UP = [
  [96, 141],
  [114, 150, 141, 147, 147, 124],
  [149, 115, 149.5, 107.5, 147.2, 101],
  [146.8, 99.8, 145.8, 99, 145, 98.6],
  [147.6, 96.4, 149, 93, 148.6, 89.5],
  [147.4, 82, 141, 76.5, 132.5, 74],
  [127, 72.2, 121.5, 71.2, 115.5, 70.2],
  [119.4, 74.6, 121.2, 80, 120.6, 86.5],
  [120.2, 96, 120, 106, 116, 115],
  [112, 124, 104, 129, 96, 129],
];
// Fluffy boundary of the belly-coloured tip (last ~30 %).
const TIP_LINE_UP = [[106, 101], [110.5, 96, 114, 98.8, 118.5, 95], [122.5, 98, 127, 95.4, 131.5, 92.2], [136, 95.4, 141.5, 93.4, 158, 87]];
// Wrapped tail (hungry): round the front of the feet, the tip curling up on the left.
const TAIL_WRAP = [
  [106, 118],
  [119, 122, 124, 138, 116, 145.5],
  [107, 152, 80, 152.5, 62, 150.5],
  [47, 149, 37, 142, 37.5, 131],
  [38, 121, 45, 115.5, 52, 116.5],
  [50, 121, 52, 126.5, 57, 129.5],
  [68, 134.5, 86, 134.5, 97, 131.5],
  [102, 130, 104.5, 125, 103, 120.5],
  [103.4, 119, 104.6, 118.2, 106, 118],
];
const TIP_LINE_WRAP = [[61, 122], [57, 127, 58, 131, 53, 133.5], [52, 137.5, 48, 138.5, 46, 142.5], [44, 145, 41, 145.5, 35, 149]];
// Curled tail (starving): thicker and higher; the lowered muzzle rests on it.
const TAIL_CURL = [
  [107, 104],
  [123, 109, 129, 136, 118, 145.5],
  [108, 152.5, 80, 153, 60, 151],
  [43, 149.5, 33, 140, 33.5, 124],
  [34, 111, 43, 104, 51, 105.5],
  [49, 110.5, 51, 115.5, 56, 117],
  [66, 115.5, 84, 112.5, 96, 109.5],
  [101.5, 108, 104, 106, 103, 104.6],
  [103.6, 103.4, 105, 103.4, 107, 104],
];
const TIP_LINE_CURL = [[60, 111], [56, 117.5, 57, 123, 52, 126.5], [51, 131, 46.5, 132, 44.5, 136.5], [42, 140, 39, 141, 32, 145]];

// Trace a fluffy boundary line [[x,y],[c…]…] as an open path.
const lineD = (pts, T = I) => P(pts, T, false);
// The region on one side of a line, closed through two far corners.
function sideD(pts, corners, T = I) {
  return lineD(pts, T) + corners.map(([x, y]) => `L${f(x)} ${f(y)}`).join('') + 'Z';
}

// ---------- parts ----------

function earArt(ctx, side, pose, opts = {}) {
  const p = ctx.palette, t = ctx.tier;
  const spec = side === 'l' ? EAR_L : EAR_R;
  const dir = side === 'l' ? -1 : 1;
  const angle = spec.tilt + dir * pose.ear;
  const [ax, ay] = spec.at;
  const earD = P(EAR);
  const clip = ctx.defOnce('ear', (id) => `<clipPath id="${id}"><path d="${earD}"/></clipPath>`);
  const shadeD = P(EAR, ([x, y]) => [x - 4.5 * dir * -1, y - 3]);
  // Rare/SR/Epic: ear tips in accent (marking A). The Epic markings glow.
  const tip = t >= 1 && t <= 3
    ? `<path d="M-16 -9C-6 -5.6 6 -5.6 16 -9L16 -28L-16 -28Z" fill="${p.accent}"${t === 3 ? ` ${glow(ctx, '#c9a2ff', 1.6)}` : ''}/>` : '';
  const prism = ''; // Ultra prism only on the main body, head and tail (one blend group each; rig performance note)
  const inner = `<path d="${P(EAR_INNER)}" fill="${INNER_EAR}"/><path class="thin" d="M-2.6 3C-2.7 -2.5 -1.3 -7 0 -10" fill="none" stroke="${mix(INNER_EAR, '#e46aa9', 0.35)}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="${P(EAR_FLUFF)}" fill="${p.belly}"/>`;
  const art = `<path d="${earD}" fill="${p.body}"/>` +
    `<g clip-path="url(#${clip})"><path d="${earD}" fill="${p.shade}"/><path d="${shadeD}" fill="${p.body}"/>${inner}${tip}${prism}</g>` +
    `<path d="${earD}" fill="none" ${ol()}/>`;
  let flameArt = '';
  if (t === 5 && opts.front) {
    // Legendary: a flame tip on each ear, in front of any hat.
    flameArt = flame(ctx, 0, -20.5, 9.5, f(-angle * 0.75));
  }
  const body = opts.front
    ? `<g clip-path="url(#${ctx.defOnce('ear-top', (id) => `<clipPath id="${id}"><path d="M-22 -7L22 -7L22 -34L-22 -34Z"/></clipPath>`)})">${art}</g>${flameArt}`
    : art;
  // Static tilt on the outer group; the CSS twitch animates the inner one around the root.
  return `<g transform="translate(${ax} ${ay}) rotate(${f(angle)} 0 12)"><g class="fox-ear fox-ear--${side}" style="transform-origin:0px 12px">${body}</g></g>`;
}

/** The up tail (also the spirit-tail shape). T maps healthy coordinates. */
function tailUp(ctx, { key = 'tail', fill, shade, tipFill, band = false, inner = '', outline = true, T = I } = {}) {
  const p = ctx.palette;
  const d = P(TAIL_UP, T);
  const tipD = sideD(TIP_LINE_UP, [[155, 60], [100, 60]], T);
  const down = (pts, dy) => pts.map((q) => q.map((v, i) => (i % 2 ? v + dy : v)));
  const bandD = band ? sideD(down(TIP_LINE_UP, 7), [[155, 60], [100, 60]], T) : '';
  const bandArt = band ? `<path d="${bandD}" fill="${p.accent}"${ctx.tier === 3 ? ` ${glow(ctx, '#c9a2ff', 1.6)}` : ''}/>` : '';
  const fluff = `<path class="thin" d="${lineD([[124, 124], [129, 121, 132, 116, 133, 111]], T)}" fill="none" stroke="${shade}" stroke-width="1.8" stroke-linecap="round"/>`;
  return cel(ctx, key, d, {
    fill, shade, shadeOffset: [-7, -6],
    inner: fluff + bandArt + `<path d="${tipD}" fill="${tipFill}"/>` + inner,
    outline,
  });
}

function wrapTail(ctx, pts, tipPts, key) {
  const p = ctx.palette, t = ctx.tier;
  const d = P(pts);
  const tipD = sideD(tipPts, [[20, 150], [20, 90]]);
  const band = t >= 2 && t <= 3
    ? `<path d="${sideD(tipPts.map((a) => a.map((v, i) => (i % 2 === 0 ? v + 6 : v + 5))), [[20, 155], [20, 90]])}" fill="${p.accent}"${t === 3 ? ` ${glow(ctx, '#c9a2ff', 1.6)}` : ''}/>` : '';
  const prism = t === 6 ? prismOverlay(ctx) : '';
  return cel(ctx, key, d, { fill: p.body, shade: p.shade, shadeOffset: [-5, -6], inner: band + `<path d="${tipD}" fill="${p.belly}"/>` + prism });
}

/**
 * Spirit tails (Epic+): translucent, glowing tail plumes (the main tail's silhouette language:
 * fluffy body, curled belly-coloured tip) fanned round a pivot behind the hips, so they frame
 * the fox like a kitsune's crown of tails. Angles are from vertical (deg, + = right); tails on
 * the left are mirrored so the fan curls symmetrically. The real tail stays in front.
 * They are aura-like: thumbnails (72 px) skip them (the static ring stands in), and the bigger fans
 * use smaller plumes so every tip stays inside the 160 box (x ≥ 14, y ≥ 30).
 */
const SPIRIT_PIVOT = [80, 114];
const SPIRIT_FANS = { 3: [-58], 4: [-58, 50], 5: [-84, -60, -36, 60], 6: [-96, -72, -48, -26, 26, 48, 72, 96] };
const plumeScale = (t) => (t >= 5 ? [1.02, 0.98] : [1.1, 1.0]);
const PLUME = [[-4.5, 0], [-15.5, -12, -17.5, -36, -10.5, -50.5], [-6.5, -58.5, 0.5, -63.5, 7, -66.5], [4.6, -61.5, 6, -55.5, 9, -49.5], [15.5, -36, 13.5, -13, 4.5, 0]];
const PLUME_TIP = [[-22, -38], [-15, -43.6, -11, -39.6, -6.5, -44], [-2.5, -40, 2, -44, 6, -41], [10, -45, 14, -41, 22, -45.5]];
function spiritTails(ctx) {
  const t = ctx.tier, p = ctx.palette;
  const fans = SPIRIT_FANS[t];
  if (!fans || ctx.thumb) return '';
  // A spirit fades in from the base and brightens to white at the tip, so it reads as light, not smoke.
  const stops = t === 6
    ? [['#fff3b0', 0.3, 0], ['#ffd3ec', 0.85, 0.6], [WHITE, 1, 0.95]]
    : [[p.body, 0.3, 0], [mix(p.body, WHITE, 0.45), 0.85, 0.6], [WHITE, 1, 0.95]];
  const [sx, sy] = plumeScale(t);
  const gid = ctx.defOnce('spirit-grad', (id) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="-12" x2="0" y2="${f(-66 * sy)}">${stops.map(([c, o, at]) => `<stop offset="${at}" stop-color="${c}" stop-opacity="${o}"/>`).join('')}</linearGradient>`);
  const mirror = ([x, y]) => [-x, y];
  const grow = ([x, y]) => [x * sx, y * sy];
  const shapes = {
    r: { d: P(PLUME, grow), tip: sideD(PLUME_TIP, [[22, -80], [-22, -80]], grow) },
    l: { d: P(PLUME, (q) => mirror(grow(q))), tip: sideD(PLUME_TIP, [[22, -80], [-22, -80]], (q) => mirror(grow(q))) },
  };
  const [px, py] = SPIRIT_PIVOT;
  const tails = fans.map((a, i) => {
    const side = a >= 0 ? 'r' : 'l';
    const { d, tip } = shapes[side];
    const clip = ctx.defOnce(`spirit-clip-${side}`, (id) => `<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return `<g transform="translate(${px} ${py}) rotate(${a})"><g class="fox-spirit" style="--i:${i};transform-origin:0px 0px">` +
      `<path d="${d}" fill="url(#${gid})"/><g clip-path="url(#${clip})"><path d="${tip}" fill="${WHITE}" opacity=".9"/></g>` +
      `<path d="${d}" fill="none" stroke="${WHITE}" stroke-opacity=".45" stroke-width="1.5" stroke-linejoin="round"/></g></g>`;
  }).join('');
  return `<g class="fox-spirits" opacity=".75"${ctx.size >= 128 ? ` ${glow(ctx, p.body, 2.4)}` : ''}>${tails}</g>`;
}

/** Foxfire wisp orbiting r 40 round the aura centre (Mythic: one; Ultra: twin). */
function wisps(ctx) {
  const t = ctx.tier;
  if (ctx.thumb || t < 4 || t === 5) return '';
  const [cx, cy] = AURA_CENTER;
  const r = 40;
  const ultra = t === 6;
  const gid = ctx.defOnce('wisp-grad', (id) => `<radialGradient id="${id}" cx=".5" cy=".62" r=".6"><stop offset="0" stop-color="${WHITE}"/><stop offset=".35" stop-color="${ultra ? '#fffbe8' : WISP_CORE}"/><stop offset="1" stop-color="${ultra ? '#ffd3ec' : WISP_EDGE}"/></radialGradient>`);
  const g = glow(ctx, ultra ? '#fff3b0' : WISP_EDGE, 2.4);
  const starts = ultra ? [205, 25] : [205];
  return starts.map((a0) => {
    const x = cx + r, y = cy;
    const flameD = `M${x} ${y - 9}C${x + 2.6} ${y - 5} ${x + 5} ${y - 2} ${x + 5} ${y + 1.6}C${x + 5} ${y + 4.8} ${x + 2.6} ${y + 6.4} ${x} ${y + 6.4}C${x - 2.6} ${y + 6.4} ${x - 5} ${y + 4.8} ${x - 5} ${y + 1.6}C${x - 5} ${y - 2} ${x - 2.6} ${y - 5} ${x} ${y - 9}Z`;
    return `<g class="aura-orbit fox-wisp" style="--dur:6s;--a0:${a0}deg;transform-origin:${cx}px ${cy}px" transform="rotate(${a0})">` +
      `<g class="fox-wisp-up" style="transform-origin:${x}px ${y}px" transform="rotate(${-a0})"><g class="fox-wisp-flame" style="transform-origin:${x}px ${y + 6}px">` +
      `<path d="${flameD}" fill="url(#${gid})" stroke="${ultra ? '#e3cf72' : WISP_EDGE}" stroke-width="1.5" stroke-linejoin="round" ${g}/>` +
      `<ellipse cx="${x}" cy="${f(y + 2)}" rx="1.8" ry="2.4" fill="${WHITE}"/></g></g></g>`;
  }).join('');
}

function collar(ctx) {
  const t = ctx.tier, p = ctx.palette;
  if (t < 3) return '';
  const band = t >= 5 ? GOLD : p.accent;
  const d = 'M65.5 97.5Q80 105.5 94.5 97.5';
  const bell = t === 6
    ? `<circle cx="80" cy="107.5" r="5" fill="url(#${ctx.defOnce('bell-prism', (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ffd3ec"/><stop offset="1" stop-color="#cfe8ff"/></linearGradient>`)})" ${ol(2)}/>`
    : `<circle cx="80" cy="107.5" r="5" fill="${COIN}" stroke="${COIN_EDGE}" stroke-width="1.6"/>`;
  return `<g class="fox-collar"><path d="${d}" fill="none" ${ol(7)}/><path d="${d}" fill="none" stroke="${band}" stroke-width="4" stroke-linecap="round"/>` +
    (t >= 5 ? `<path class="thin" d="M70 100.2Q80 104.6 90 100.2" fill="none" stroke="${WHITE}" stroke-width="1" stroke-linecap="round" opacity=".7"/>` : '') +
    `<g class="fox-bell" style="transform-origin:80px 102px">${bell}` +
    `<path d="M76.4 109.2L83.6 109.2" fill="none" stroke="${t === 6 ? OUTLINE : COIN_EDGE}" stroke-width="1.4" stroke-linecap="round"/><circle cx="80" cy="110.3" r="1" fill="${t === 6 ? OUTLINE : COIN_EDGE}"/>` +
    `<circle cx="78.2" cy="105.6" r="1.3" fill="${WHITE}" opacity=".9"/></g></g>`;
}

function bandana(ctx) {
  const d = 'M67.5 98Q80 103.5 92.5 98L82 112.6Q80 115 78 112.6Z';
  const leaf = (x, y, a) => `<path d="M${x} ${y - 2.6}C${x + 2} ${y - 1} ${x + 2} ${y + 1.4} ${x} ${y + 2.6}C${x - 2} ${y + 1.4} ${x - 2} ${y - 1} ${x} ${y - 2.6}Z" fill="${LEAF_PRINT}" transform="rotate(${a} ${x} ${y})"/>`;
  return `<g class="fox-bandana"><path d="${d}" fill="${LEAF}" ${ol(3)}/>${leaf(74.5, 102.2, -40)}${leaf(85.5, 102.2, 40)}${leaf(80, 107.5, 0)}` +
    `<path class="thin" d="M69 98.6Q80 103.2 91 98.6" fill="none" stroke="${mix(LEAF, '#ffffff', 0.4)}" stroke-width="1.2" stroke-linecap="round"/></g>`;
}

/** Fox mouths: a small "u" under the nose (healthy) and a "w" with a tongue blep (happy). */
const MOUTHS = {
  'mouth-smile': (ctx, { mouth: [x, y] }) => `<g class="mouth-smile"><path d="M${x} ${f(y - 4)}L${x} ${f(y - 1.4)}M${f(x - 4.6)} ${f(y - 1.8)}Q${f(x - 2.3)} ${f(y + 1.6)} ${x} ${f(y - 1.4)}Q${f(x + 2.3)} ${f(y + 1.6)} ${f(x + 4.6)} ${f(y - 1.8)}" fill="none" ${ol(2.6)}/></g>`,
  'mouth-open': (ctx, { mouth: [x, y] }) => `<g class="mouth-open"><path d="M${f(x - 4)} ${f(y + 0.2)}Q${x} ${f(y + 8.5)} ${f(x + 4)} ${f(y + 0.2)}Z" fill="${OUTLINE}" ${ol(1.6)}/>` +
    `<ellipse cx="${x}" cy="${f(y + 4.2)}" rx="2.6" ry="1.9" fill="${FACE.tongue}"/>` +
    `<path d="M${x} ${f(y - 4)}L${x} ${f(y - 1.2)}M${f(x - 6)} ${f(y - 2)}Q${f(x - 3)} ${f(y + 2.2)} ${x} ${f(y - 1.2)}Q${f(x + 3)} ${f(y + 2.2)} ${f(x + 6)} ${f(y - 2)}" fill="none" ${ol(2.6)}/></g>`,
};

// ---------- the species ----------

export default {
  id: 'fox',
  name: 'Kitsu',
  anchors: { headTop: [80, 34], brow: [80, 52], neck: [80, 100], chest: [80, 112], tailTip: [128, 80], mouth: [80, 74], accScale: 0.95 },
  auraCenter: AURA_CENTER,
  idleClass: 'pet-idle--fox',

  draw(ctx) {
    const p = ctx.palette, t = ctx.tier;
    const pose = POSE[ctx.mood] || POSE.healthy;
    const prism = t === 6 ? prismOverlay(ctx) : '';

    // ----- tail (spirit tails first, behind) -----
    let tail = spiritTails(ctx);
    let wrapped = '';
    if (pose.tail === 'up') {
      const [px, py] = TAIL_PIVOT;
      let tipFlame = '';
      if (t === 5) {
        tipFlame = flame(ctx, 135.5, 75, 15, 12); // inside the rotated tail group
      }
      const specks = t === 4 ? [[136, 120, 4.5], [127, 133, 3.5]].map(([x, y, s]) => star4(x, y, s, WHITE, 'opacity=".7"')).join('') : '';
      tail += `<g transform="rotate(${pose.tailRot} ${px} ${py})"><g class="fox-tail" style="transform-origin:${px}px ${py}px">` +
        tailUp(ctx, { fill: p.body, shade: p.shade, tipFill: p.belly, band: t === 2 || t === 3, inner: specks + prism }) +
        (t === 5 ? trim(lineD([[139, 92], [143.5, 99, 144.5, 108, 142.2, 117]])) : '') + tipFlame + `</g></g>`;
    } else {
      wrapped = pose.tail === 'wrap' ? wrapTail(ctx, TAIL_WRAP, TIP_LINE_WRAP, 'tail-wrap') : wrapTail(ctx, TAIL_CURL, TIP_LINE_CURL, 'tail-curl');
      if (t === 4) wrapped += [[100, 145, 4.5], [84, 146, 3.5]].map(([x, y, s]) => star4(x, y, s, WHITE, 'opacity=".7"')).join('');
      if (t === 5) {
        const [fx, fy] = pose.tail === 'wrap' ? [44, 117] : [41, 106];
        wrapped += flame(ctx, fx, fy, 14, -20);
      }
    }

    // ----- body -----
    const bibClip = ctx.defOnce('bib', (id) => `<clipPath id="${id}"><path d="${P(BIB)}"/></clipPath>`);
    const bib = `<path d="${P(BIB)}" fill="${p.belly}"/><g clip-path="url(#${bibClip})"><path d="M60 150C80 146 98 132 100 104L100 150Z" fill="${mix(p.belly, p.shade, 0.22)}"/></g>` +
      `<path class="thin" d="M75 96.5l2.5 2.6l2.5 -2.6l2.5 2.6l2.5 -2.6" fill="none" stroke="${mix(p.belly, p.shade, 0.45)}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    const body = cel(ctx, 'body', P(BODY), { fill: p.body, shade: p.shade, shadeOffset: [-7, -5], inner: bib + prism });

    // ----- legs: haunches, front legs, paws (socks at Rare/SR/Epic) -----
    const sockGlow = t === 3 ? ` ${glow(ctx, '#c9a2ff', 1.6)}` : '';
    const haunch = (pts, key) => cel(ctx, key, P(pts), { fill: p.body, shade: p.shade, shadeOffset: [-5, -4] });
    const leg = (pts, line, key, toesX) => {
      const d = P(pts);
      const sock = t >= 1 && t <= 3 ? `<path d="M50 133.5C60 131.8 70 131.8 80 133.5C90 131.8 100 131.8 110 133.5L110 152L50 152Z" fill="${p.accent}"${sockGlow}/>` : '';
      const toes = `<path class="thin" d="M${toesX - 3} 148V144.6M${toesX + 3} 148V144.6" fill="none" stroke="${OUTLINE}" stroke-width="1.6" stroke-linecap="round"/>`;
      return cel(ctx, key, d, { fill: p.body, shade: p.shade, shadeOffset: [-4, -3], inner: sock, outline: false }) +
        `<path d="${P(line, I, false)}" fill="none" ${ol()}/>` + toes;
    };
    const legs = haunch(HAUNCH_L, 'haunch-l') + haunch(HAUNCH_R, 'haunch-r') +
      leg(LEG_L, LEG_LINE_L, 'leg-l', 70) + leg(LEG_R, LEG_LINE_R, 'leg-r', 90);

    // ----- markings (body level) -----
    let markings = '';
    if (t === 4) markings += [[58, 136, 4], [102, 136, 4]].map(([x, y, s]) => star4(x, y, s, WHITE, 'opacity=".7"')).join('');
    if (t === 5) markings += trim('M88.5 90.5C95.5 94 101 102 103 111');

    // ----- body accessory (one at most) -----
    const accBody = t === 2 ? bandana(ctx) : collar(ctx);

    // ----- head: ears behind the dome, then the dome with its cheek ruff, mask and muzzle -----
    const headD = P(HEAD);
    const maskD = sideD(MASK_LINE, [[132, 110], [28, 110]]);
    const maskClip = ctx.defOnce('mask', (id) => `<clipPath id="${id}"><path d="${maskD}"/></clipPath>`);
    const ruffLines = `<path class="thin" d="M113 80.5C115.5 82 117 83.5 118 85.4M47 80.5C44.5 82 43 83.5 42 85.4" fill="none" stroke="${mix(p.belly, p.shade, 0.55)}" stroke-width="1.6" stroke-linecap="round"/>`;
    const maskArt = `<g clip-path="url(#${maskClip})"><path d="${headD}" fill="${mix(p.belly, p.shade, 0.32)}"/><path d="${headD}" fill="${p.belly}" transform="translate(-6 -5)"/>${ruffLines}</g>` +
      `<path d="${P(MUZZLE)}" fill="${WHITE}" opacity=".55"/>`;
    const tuft = `<path d="M72.5 35.5C74.5 30.5 77 27.6 79.6 26C79.2 28.6 80 30.6 81.6 31.4C83 28.6 85.8 27.2 88.6 27.6C87 30.2 86.6 33 87.4 35.6" fill="${p.body}" ${ol(3)}/>`;
    const headTrim = t === 5 ? trim('M49.5 50C54.5 39.5 66 34 80 34C94 34 105.5 39.5 110.5 50') : '';
    const head = earArt(ctx, 'l', pose) + earArt(ctx, 'r', pose) + tuft +
      `<g class="fox-cheeks" style="transform-origin:80px 84px">` +
      cel(ctx, 'head', headD, { fill: p.body, shade: p.shade, shadeOffset: [-6, -6], inner: maskArt + prism }) + `</g>` +
      specular(57, 46, 4) + `<circle cx="64.5" cy="40.5" r="1.8" fill="${WHITE}" opacity=".75"/>` + headTrim;

    // Head-level specks (Mythic) sit above the dome in g-ears.
    const ears = t === 4 ? [[101, 46, 4.5]].map(([x, y, s]) => star4(x, y, s, WHITE, 'opacity=".7"')).join('') : '';

    // ----- face -----
    const nose = `<path d="M76.2 73.4C76.2 71 83.8 71 83.8 73.4C83.8 75.4 81.6 76.7 80 76.7C78.4 76.7 76.2 75.4 76.2 73.4Z" fill="${OUTLINE}"/><ellipse cx="78.5" cy="72.6" rx="1.3" ry=".8" fill="${WHITE}" opacity=".85"/>`;
    const faceArt = nose + face(ctx, {
      eyes: [[67, 66.5], [93, 66.5]],
      mouth: [80, 80.6],
      eyeSize: ctx.mood === 'happy' ? [14, 17] : [13, 17],
      mouthWidth: 9,
      blushDx: 4, blushDy: 12,
      parts: MOUTHS,
    });

    // ----- brow item (Legendary gold diamond, Ultra prismatic diamond) -----
    let accBrow = '';
    if (t >= 5) {
      const fill = t === 6 ? `url(#${ctx.defOnce('brow-prism', (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".35" stop-color="#ffd3ec"/><stop offset=".7" stop-color="#cfe8ff"/><stop offset="1" stop-color="#d8ffef"/></linearGradient>`)})` : GOLD;
      accBrow = `<path d="M80 47C81.6 49 83 50.6 84 52C83 53.4 81.6 55 80 57C78.4 55 77 53.4 76 52C77 50.6 78.4 49 80 47Z" fill="${fill}" ${ol(2)}/><path d="M79.2 49.6L77.8 52" stroke="${WHITE}" stroke-width="1.2" stroke-linecap="round"/>`;
    }

    // ----- in front of a hat: the upper ear tips (+ Legendary flames) -----
    const occlude = earArt(ctx, 'l', pose, { front: true }) + earArt(ctx, 'r', pose, { front: true });

    const out = {
      tail,
      body,
      legs,
      markings,
      arms: wrapped,
      'acc-body': accBody,
      head,
      ears,
      face: faceArt,
      'acc-brow': accBrow,
      'occlude-front': occlude,
      'aura-front': wisps(ctx),
    };
    // 72 px thumbnails: drop every hairline detail (strokes under 2 px are tagged class "thin").
    if (ctx.thumb) for (const k of Object.keys(out)) out[k] = out[k].replace(/<path class="thin"[^>]*\/>/g, '');
    return out;
  },

  silhouette() {
    const ear = (spec) => {
      const T = ([x, y]) => rot([x + spec.at[0], y + spec.at[1]], spec.tilt, [spec.at[0], spec.at[1] + 12]);
      return `<path d="${P(EAR, T)}"/>`;
    };
    // Back to front, so each later fill hides the earlier outlines (callers stroke every path).
    return `<path d="${P(TAIL_UP)}"/><path d="${P(BODY)}"/>${ear(EAR_L)}${ear(EAR_R)}<path d="${P(HEAD)}"/>`;
  },
};
