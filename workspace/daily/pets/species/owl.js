// Hootling (owl). CONTENT.md §A.2 "Hootling (owl)"; contract in species/_template.js.
//
// One egg silhouette (head and body are a single outlined shape: top y 32, widest rx 40 at y 70,
// rx 36 at y 118, base y 146; it lives in g-body, the face disc and tufts ride the head rig),
// a heart-shaped facial disc, the biggest eyes of any species (r 9, iris ring in accent), a small
// #ffb347 beak, ear tufts in front of the cosmetic, feather wings at the sides, three-toed feet.
// The glasses evolve with the tier (Epic → Mythic star rims → Legendary gold → Ultra moon monocle).

import { cel, face, specular, star4, glow, flame, trim, prismOverlay, ol, f, rot } from '../rig.js';
import { OUTLINE, WHITE, GOLD, FACE, mix } from '../palette.js';

const BEAK = '#ffb347';
const BEAK_SHADE = '#e98a2a';
const EYES = [[66, 64], [94, 64]];
const EYE_R = 9;
const MOUTH = [80, 81];
const AURA_CENTER = [80, 90];
const HAND = [112, 120];

// Mood geometry. tuft: degrees the ear tufts lean outward (CONTENT: 20° out; hungry droops 25° more).
// wing: degrees the wings swing out from the shoulder (happy: 20°). fluff: body width (hungry +6 %).
const POSE = {
  healthy: { tuft: 20, wing: 0, fluff: 1 },
  happy: { tuft: 12, wing: 20, fluff: 1 },
  hungry: { tuft: 45, wing: -3, fluff: 1.06 },
  starving: { tuft: 58, wing: -4, fluff: 1.03 },
};

const s = ([x, y]) => `${f(x)} ${f(y)}`;
const mirror = ([x, y]) => [160 - x, y];
/** Closed path from a start point and cubic segments [[c1, c2, p], …]; map transforms every point. */
const cubic = (start, segs, map = (q) => q, close = true) =>
  `M${s(map(start))}` + segs.map((seg) => `C${seg.map((q) => s(map(q))).join(' ')}`).join('') + (close ? 'Z' : '');
/** Egg/oval through top, side extremes at midY, and bottom (k = handle fullness; .55 ≈ ellipse). */
function egg(cx, top, bottom, rx, midY, k = 0.56, sx = 1) {
  const r = rx * sx;
  return cubic([cx, top], [
    [[cx + r * k, top], [cx + r, midY - (midY - top) * k], [cx + r, midY]],
    [[cx + r, midY + (bottom - midY) * k], [cx + r * k, bottom], [cx, bottom]],
    [[cx - r * k, bottom], [cx - r, midY + (bottom - midY) * k], [cx - r, midY]],
    [[cx - r, midY - (midY - top) * k], [cx - r * k, top], [cx, top]],
  ]);
}

/** The one-piece egg (head + body), right half mirrored; sx widens it (hungry fluff). */
const eggD = (sx = 1) => {
  const X = (x) => 80 + (x - 80) * sx;
  const R = [[[102, 32], [120, 47], [120, 70]], [[120, 91], [116, 99], [116, 118]], [[116, 135.5], [101, 146], [80, 146]]];
  const L = R.slice().reverse().map((seg, i, a) => {
    const prev = i + 1 < a.length ? a[i + 1][2] : [80, 32];
    return [seg[1], seg[0], prev].map(([x, y]) => [160 - x, y]);
  });
  return cubic([80, 32], [...R, ...L], ([x, y]) => [X(x), y]);
};
// The silhouette and cosmetic fit still treat the top of the egg as the head.
const HEAD_D = eggD();

// Heart-shaped facial disc (x 50–110, y 42–90): two round lobes round the eyes meeting in a V at the beak.
const DISC_D = cubic([80, 50.5], [
  [[75, 43], [63.5, 40], [56.5, 43.5]],
  [[49.5, 47.5], [48.5, 59], [50.2, 66]],
  [[52.5, 76], [64, 84.5], [76, 89.2]],
  [[78.3, 90.1], [81.7, 90.1], [84, 89.2]],
  [[96, 84.5], [107.5, 76], [109.8, 66]],
  [[111.5, 59], [110.5, 47.5], [103.5, 43.5]],
  [[96.5, 40], [85, 43], [80, 50.5]],
]);

// Left wing (healthy, absolute): shoulder at the top, tip at the bottom, two scallops on the trailing edge.
const WING_START = [55, 95];
const WING = [
  [[47, 95], [41.5, 104], [41.5, 114]],
  [[41.5, 123], [44, 130], [49.5, 133.5]],
  [[52, 133.2], [54, 131], [54.6, 127.6]],
  [[56.6, 126.6], [57.6, 124], [57.3, 120.6]],
  [[57.6, 110], [58.2, 100], [55, 95]],
];
const WING_PIVOT = [54, 98];
const WING_TUCK = 4; // wings sit 4 units into the body side…
const WING_TILT = 6; // …tilted 6° outward from the shoulder

// Ear tuft (local: base centre at 0,0 sunk into the head, pointing up; outer edge is -x).
const TUFT_PIVOT = [59.5, 41];
const TUFT_FILL = cubic([-7, 4.5], [
  [[-8.2, -4], [-7.2, -12.5], [-3, -20]],                 // outer edge up to the main tip
  [[-1.4, -15.5], [-0.2, -13], [1, -10.8]],                // inner edge down to the notch
  [[2.4, -12.4], [4, -13.6], [6.2, -14.6]],                // second, smaller feather tip
  [[5.6, -8], [6.6, -2.5], [8.2, 4.5]],
]);
const TUFT_LINE = cubic([-6.6, 1.2], [
  [[-7.6, -5], [-7, -12.5], [-3, -20]],
  [[-1.4, -15.5], [-0.2, -13], [1, -10.8]],
  [[2.4, -12.4], [4, -13.6], [6.2, -14.6]],
  [[5.7, -9], [6.4, -3.5], [7.4, 1]],
], undefined, false);
const TUFT_INNER = cubic([-3.2, 2.5], [
  [[-4.4, -4], [-4.4, -9.5], [-3, -15]],
  [[-1.2, -10], [0, -5.5], [1.6, 2.5]],
]);

/** Tuft group for one side: side -1 = left, +1 = right. lean = outward degrees. */
function tuft(ctx, side, lean) {
  const p = ctx.palette;
  const [px, py] = TUFT_PIVOT;
  const x = side < 0 ? px : 160 - px;
  const xf = side < 0 ? '' : ' scale(-1 1)';
  const inner = `<path d="${TUFT_INNER}" fill="${p.shade}"/>`;
  let art = `<path d="${TUFT_FILL}" fill="${p.body}"/>${inner}<path d="${TUFT_LINE}" fill="none" ${ol()}/>`;
  if (ctx.tier === 5) art += flame(ctx, -2.4, -13, 15, -8);
  return `<g class="owl-tuft owl-tuft--${side < 0 ? 'l' : 'r'}" transform="translate(${f(x)} ${f(py)})${xf} rotate(${f(-lean)})">${art}</g>`;
}

/** Wings (arms group). side -1 left / +1 right; swing = outward degrees. */
/** Map a left-wing point to the posed wing on `side` (swing: outward degrees; sx: body fluff). */
function wingMap(side, swing, sx) {
  return (q) => {
    const r = rot([q[0] + WING_TUCK, q[1]], swing + WING_TILT, [WING_PIVOT[0] + WING_TUCK, WING_PIVOT[1]]); // + = tip swings out (left wing)
    const fl = [80 + (r[0] - 80) * sx, r[1]];
    return side < 0 ? fl : mirror(fl);
  };
}

function wing(ctx, side, swing, sx, extra = '') {
  const p = ctx.palette;
  const map = wingMap(side, swing, sx);
  const d = cubic(WING_START, WING, map);
  const dark = mix(p.shade, p.accent, 0.4);
  const feathers = ctx.thumb ? '' :
    `<path d="M${s(map([46.5, 110]))}Q${s(map([47, 120]))} ${s(map([50.5, 127]))}" fill="none" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M${s(map([51.5, 106]))}Q${s(map([52.5, 114]))} ${s(map([54.5, 119.5]))}" fill="none" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>`;
  const light = `<path d="M${s(map([45, 104]))}Q${s(map([48, 97.5]))} ${s(map([53.5, 97]))}" fill="none" stroke="${mix(p.shade, WHITE, 0.45)}" stroke-width="2.4" stroke-linecap="round"/>`;
  const art = cel(ctx, `wing-${side < 0 ? 'l' : 'r'}`, d, {
    fill: p.shade, shade: dark, shadeOffset: [side < 0 ? -4 : 4, -5],
    inner: (ctx.tier === 6 ? prismOverlay(ctx) : '') + feathers + light,
  });
  return `<g class="owl-wing owl-wing--${side < 0 ? 'l' : 'r'}">${art}${typeof extra === 'function' ? extra(map) : extra}</g>`;
}

/** Jagged ruffled feather tips (starving): base at (x,y) on the outline, pointing outward (angle; 0 = up). */
function ruffle(x, y, angle, fill) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(angle)})"><path d="M-5.5 3.5L-3.6 -5L-0.6 -0.6L2.6 -6.4L5.5 3.5Z" fill="${fill}"/>` +
    `<path d="M-5.2 1.2L-3.6 -5L-0.6 -0.6L2.6 -6.4L5.2 1.2" fill="none" ${ol(3)}/></g>`;
}

// ---------- face parts (CONTENT: big round eyes, iris ring in accent, pupil r 6; the beak is the mouth) ----------

function eyeHL(ctx, x, y, r) {
  const k = r / EYE_R;
  const big = ctx.tier === 6
    ? star4(x - 3.3 * k, y - 3.4 * k, 7.5 * k, WHITE)
    : `<circle cx="${f(x - 3 * k)}" cy="${f(y - 3.2 * k)}" r="${f(3 * k)}" fill="${WHITE}"/>`;
  return `${big}<circle cx="${f(x + 3.4 * k)}" cy="${f(y + 3.2 * k)}" r="${f(1.3 * k)}" fill="${WHITE}"/>`;
}
function owlEye(ctx, x, y, r = EYE_R, pupil = 6) {
  const p = ctx.palette;
  const iris = mix(p.accent, WHITE, 0.12);
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${iris}" ${ol(2.4)}/>` +
    `<path d="M${f(x - r + 1.6)} ${f(y + 1)}A${f(r - 1.6)} ${f(r - 1.6)} 0 0 0 ${f(x + r - 1.6)} ${f(y + 1)}" fill="none" stroke="${mix(p.accent, WHITE, 0.5)}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>` +
    `<circle cx="${f(x)}" cy="${f(y)}" r="${f(pupil)}" fill="${OUTLINE}"/>` + eyeHL(ctx, x, y, r);
}
const PARTS = {
  'eyes-open': (ctx, o) => {
    const [[lx, ly], [rx, ry]] = o.eyes;
    return `<g class="eyes-open"><g class="owl-eye owl-eye--l">${owlEye(ctx, lx, ly)}</g><g class="owl-eye owl-eye--r">${owlEye(ctx, rx, ry)}</g>` +
      `<g class="owl-wink" opacity="0"><path d="M${f(rx - 7.5)} ${f(ry + 1)}Q${f(rx)} ${f(ry - 6)} ${f(rx + 7.5)} ${f(ry + 1)}" fill="none" ${ol(3.5)}/></g></g>`;
  },
  'eyes-half': (ctx, o) => {
    const lid = ctx.palette.shade;
    const R = EYE_R + 1.2, cut = 0.9; // lid covers the top 45 % (line at y − 0.1 r)
    const half = Math.sqrt(R * R - cut * cut);
    return `<g class="eyes-half">${o.eyes.map(([x, y], i) => {
      const inner = i === 0 ? 1 : -1;
      const bx = x + inner * 1.5, by = y - EYE_R - 5;
      return owlEye(ctx, x, y) +
        `<path d="M${f(x - half)} ${f(y - cut)}A${f(R)} ${f(R)} 0 0 1 ${f(x + half)} ${f(y - cut)}Z" fill="${lid}"/>` +
        `<path d="M${f(x - half + 0.6)} ${f(y - cut)}L${f(x + half - 0.6)} ${f(y - cut)}" ${ol(2.6)}/>` +
        `<path d="M${f(bx - 4 * inner)} ${f(by + 1.5)}L${f(bx + 4 * inner)} ${f(by - 1.5)}" fill="none" ${ol(3)}/>`;
    }).join('')}</g>`;
  },
  'eyes-hollow': (ctx, o) => `<g class="eyes-hollow">${o.eyes.map(([x, y]) =>
    `<ellipse cx="${f(x)}" cy="${f(y + 1)}" rx="4.5" ry="5.5" fill="${mix(ctx.palette.accent, WHITE, 0.12)}" ${ol(2)}/>` +
    `<ellipse cx="${f(x)}" cy="${f(y + 1.4)}" rx="2.6" ry="3.4" fill="${OUTLINE}"/>` +
    `<circle cx="${f(x - 1.5)}" cy="${f(y - 1)}" r="1.5" fill="${WHITE}"/>` +
    `<path d="M${f(x - 5)} ${f(y + 10)}Q${f(x)} ${f(y + 13)} ${f(x + 5)} ${f(y + 10)}" fill="none" stroke="${ctx.palette.shade}" stroke-width="2" stroke-linecap="round"/>`).join('')}</g>`,
  'eyes-happy': (ctx, o) => `<g class="eyes-happy">${o.eyes.map(([x, y]) =>
    `<path d="M${f(x - 8)} ${f(y + 3)}Q${f(x)} ${f(y - 8.5)} ${f(x + 8)} ${f(y + 3)}" fill="none" ${ol(4)}/>`).join('')}</g>`,
  // Beak mouths: closed (smile), open with tongue (happy), trembling (hungry), dropped jaw (starving).
  'mouth-smile': (ctx, o) => `<g class="mouth-smile">${beakClosed(o.mouth)}</g>`,
  // Happy: the beak opens; a 3-unit dark gap with the tongue between the upper beak and an orange
  // lower mandible (no separate dark mouth shape, which read as a second mouth).
  'mouth-open': (ctx, o) => {
    const [x, y] = o.mouth;
    return `<g class="mouth-open"><path d="M${f(x - 4.4)} ${f(y + 0.8)}Q${f(x)} ${f(y - 0.2)} ${f(x + 4.4)} ${f(y + 0.8)}Q${f(x + 4.2)} ${f(y + 5.4)} ${f(x)} ${f(y + 5.8)}Q${f(x - 4.2)} ${f(y + 5.4)} ${f(x - 4.4)} ${f(y + 0.8)}Z" fill="${OUTLINE}"/>` +
      `<ellipse cx="${f(x)}" cy="${f(y + 3.5)}" rx="2.4" ry="1.3" fill="${FACE.tongue}"/>` +
      `<path d="M${f(x - 4.3)} ${f(y + 4.4)}Q${f(x)} ${f(y + 3.4)} ${f(x + 4.3)} ${f(y + 4.4)}Q${f(x + 3.6)} ${f(y + 9.2)} ${f(x)} ${f(y + 9.8)}Q${f(x - 3.6)} ${f(y + 9.2)} ${f(x - 4.3)} ${f(y + 4.4)}Z" fill="${BEAK}" ${ol(2)}/>` +
      `<path d="M${f(x - 2.2)} ${f(y + 6.4)}Q${f(x)} ${f(y + 7.6)} ${f(x + 2.2)} ${f(y + 6.4)}" fill="none" stroke="#e08a2a" stroke-width="1.5" stroke-linecap="round"/>` +
      upperBeak(x, y - 2.6, 0.92) + '</g>';
  },
  'mouth-wavy': (ctx, o) => {
    const [x, y] = o.mouth;
    return `<g class="mouth-wavy">${upperBeak(x, y - 1, 0.9)}<path d="M${f(x - 6)} ${f(y + 7)}Q${f(x - 4)} ${f(y + 4.6)} ${f(x - 2)} ${f(y + 7)}Q${f(x)} ${f(y + 9.4)} ${f(x + 2)} ${f(y + 7)}Q${f(x + 4)} ${f(y + 4.6)} ${f(x + 6)} ${f(y + 7)}" fill="none" ${ol(2.6)}/></g>`;
  },
  'mouth-o': (ctx, o) => {
    const [x, y] = o.mouth;
    return `<g class="mouth-o"><ellipse cx="${f(x)}" cy="${f(y + 5.5)}" rx="2.5" ry="3" fill="${OUTLINE}"/>${upperBeak(x, y - 1.4, 0.88)}</g>`;
  },
};
function upperBeak(x, y, k = 1) {
  const P = (dx, dy) => `${f(x + dx * k)} ${f(y + dy * k)}`;
  return `<path d="M${P(-4.6, -3)}Q${P(0, -5.2)} ${P(4.6, -3)}Q${P(4.2, 2)} ${P(0, 5.4)}Q${P(-4.2, 2)} ${P(-4.6, -3)}Z" fill="${BEAK}" ${ol(2.4)}/>` +
    `<path d="M${P(0.6, -2.6)}Q${P(3.2, -2.4)} ${P(2.4, 1.4)}" fill="none" stroke="${BEAK_SHADE}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<circle cx="${f(x - 1.8 * k)}" cy="${f(y - 2.6 * k)}" r="${f(1.1 * k)}" fill="${WHITE}" opacity=".85"/>`;
}
const beakClosed = ([x, y]) => upperBeak(x, y, 1);

// ---------- tier items ----------

function chevrons(ctx) {
  return [[72, 119], [88, 119], [80, 130]].map(([x, y]) =>
    `<path d="M${x - 5} ${y - 2.2}L${x} ${y + 2.2}L${x + 5} ${y - 2.2}" fill="none" stroke="${ctx.palette.accent}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
}

/** Bookmark-ribbon scarf at the neck (SR): a band round the neck, a knot under the chin, two notched tails. */
function scarf(ctx) {
  const c = ctx.palette.accent, hi = mix(c, WHITE, 0.35);
  const tail = (x0, x1, y1) => {
    const w = 2.4;
    return `<path d="M${f(x0 - w)} 98C${f(x0 - w)} 104 ${f(x1 - w)} ${f(y1 - 6)} ${f(x1 - w)} ${f(y1)}L${f(x1)} ${f(y1 - 3)}L${f(x1 + w)} ${f(y1)}C${f(x1 + w)} ${f(y1 - 6)} ${f(x0 + w)} 104 ${f(x0 + w)} 98Z" fill="${c}" ${ol(2.5)}/>`;
  };
  return `<g class="owl-scarf"><path d="M50 90.5C62 99.5 98 99.5 110 90.5L111 97C98 106 62 106 49 97Z" fill="${c}" ${ol(3)}/>` +
    `<path d="M55 95.6C66 101.5 94 101.5 105 95.6" fill="none" stroke="${hi}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>` +
    tail(78, 74.5, 113) + tail(82, 86, 111) +
    `<path d="M75.5 97.5C75.5 95 84.5 95 84.5 97.5C84.5 103 75.5 103 75.5 97.5Z" fill="${c}" ${ol(2.5)}/><circle cx="78" cy="97.6" r="1" fill="${hi}"/></g>`;
}

/** Round reading glasses (Epic+): lenses r 11 round the eyes, bridge 6 px, short temples. */
function glasses(ctx, color, { stars = false, glowIt = false, gold = false } = {}) {
  const [[lx, ly], [rx, ry]] = EYES;
  const R = 11.5;
  const ring = (x, y) => `<circle cx="${x}" cy="${y}" r="${R}" fill="${WHITE}" fill-opacity=".1" stroke="${OUTLINE}" stroke-width="4.6"/>` +
    `<circle cx="${x}" cy="${y}" r="${R}" fill="none" stroke="${color}" stroke-width="2.2"/>`;
  const glint = (x, y) => ctx.thumb ? '' : `<path d="M${f(x + 3.5)} ${f(y - 8.6)}A9.3 9.3 0 0 1 ${f(x + 8.6)} ${f(y - 3.4)}" fill="none" stroke="${WHITE}" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>`;
  const bridge = `M${f(lx + R - 0.5)} ${ly - 1}Q80 ${ly - 5} ${f(rx - R + 0.5)} ${ry - 1}`;
  const temple = (x0, x1) => `M${f(x0)} ${ly - 2}L${f(x1)} ${ly - 5.5}`;
  const lines = [bridge, temple(lx - R, 45), temple(rx + R, 115)];
  let out = lines.map((d) => `<path d="${d}" fill="none" ${ol(4.6)}/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`).join('') +
    ring(lx, ly) + ring(rx, ry) + glint(lx, ly) + glint(rx, ry);
  if (stars) out += [[lx - 8.5, ly - 8.5], [rx + 8.5, ry - 8.5], [lx + 1, ly + R], [rx - 1, ry + R]].map(([x, y], i) => star4(x, y, i < 2 ? 8 : 6, color, ol(1.2))).join('');
  if (gold) out += `<circle cx="80" cy="${ly - 4}" r="1.6" fill="${WHITE}"/>`;
  return `<g class="owl-glasses"${glowIt ? ` ${glow(ctx, '#c9a2ff', 1.8)}` : ''}>${out}</g>`;
}

/** Ultra moon monocle on the right eye: prismatic rim r 12, chain and crescent charm. */
function monocle(ctx) {
  const [x, y] = EYES[1];
  const irid = ctx.palette.iridescent;
  const gid = ctx.defOnce('monocle-rim', (full) => `<linearGradient id="${full}" x1="0" y1="0" x2="1" y2="1">${irid.map((c, i) => `<stop offset="${f(i / (irid.length - 1))}" stop-color="${c}"/>`).join('')}</linearGradient>`);
  const cx = x + 15, cy = y + 27;
  return `<g class="owl-monocle"><path d="M${x + 8} ${y + 9}C${x + 13} ${y + 14} ${x + 15.5} ${y + 18} ${cx} ${cy - 5}" fill="none" stroke="${OUTLINE}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<path d="M${x + 8} ${y + 9}C${x + 13} ${y + 14} ${x + 15.5} ${y + 18} ${cx} ${cy - 5}" fill="none" stroke="${GOLD}" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="1.6 1.8"/>` +
    `<circle cx="${x}" cy="${y}" r="12" fill="${WHITE}" fill-opacity=".12" stroke="${OUTLINE}" stroke-width="5"/><circle cx="${x}" cy="${y}" r="12" fill="none" stroke="url(#${gid})" stroke-width="2.8"/>` +
    (ctx.thumb ? '' : `<path d="M${x + 4} ${y - 9.4}A10.2 10.2 0 0 1 ${x + 9.6} ${y - 3.6}" fill="none" stroke="${WHITE}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`) +
    `<path d="M${cx} ${cy - 5}A5 5 0 1 0 ${cx} ${cy + 5}A3.8 3.8 0 1 1 ${cx} ${cy - 5}Z" fill="${GOLD}" ${ol(1.8)} transform="rotate(-20 ${cx} ${cy})"/>` +
    star4(cx + 3.5, cy - 0.5, 4, WHITE) + `</g>`;
}

/** Legendary gold quill gripped by the right wing tip (hand anchor): feather 6 × 22 with a gold shaft. */
function quill(ctx, swing, sx) {
  const map = wingMap(1, swing, sx);
  const [hx, hy] = map(mirror(HAND));
  const grip = mix(ctx.palette.shade, ctx.palette.accent, 0.15);
  return `<g class="owl-quill"><g transform="translate(${f(hx)} ${f(hy)}) rotate(${f(34 - swing)})">` +
    `<path d="M0 14L0 -4" fill="none" stroke="${OUTLINE}" stroke-width="3.6" stroke-linecap="round"/><path d="M0 13.4L0 -4" fill="none" stroke="${GOLD}" stroke-width="1.8" stroke-linecap="round"/>` +
    `<path d="M0 -1C-5.4 -6 -5.6 -19 0 -28C5.6 -19 5.4 -6 0 -1Z" fill="#fff1df" ${ol(2.6)}/>` +
    `<path d="M-3 -12L-0.6 -14.5M-3.2 -7L-0.6 -9.5M3 -17L0.6 -19.5M3.2 -10L0.6 -12.5" fill="none" stroke="#e9c79a" stroke-width="1.3" stroke-linecap="round"/>` +
    `<path d="M0 -2L0 -24" fill="none" stroke="${GOLD}" stroke-width="1.8" stroke-linecap="round"/></g>` +
    `<g transform="translate(${f(hx + 1)} ${f(hy + 4.5)}) rotate(${f(-20 - swing)})"><path d="M-5 -1C-5 -5 5 -5 5 -1C5 3.5 -5 3.5 -5 -1Z" fill="${grip}" ${ol(2.4)}/>` +
    `<path d="M-2.5 -2.6Q0 -3.6 2.5 -2.6" fill="none" stroke="${mix(grip, WHITE, 0.4)}" stroke-width="1.2" stroke-linecap="round"/></g></g>`;
}

/** Mythic constellation on a wing: 5 white dots joined by 1 px white 60 % lines (wing-local map). */
const CONSTELLATION = [[47, 104], [44.5, 112], [49, 117.5], [46.5, 125], [51.5, 129]];
function constellation(ctx) {
  return (map) => {
    const pts = CONSTELLATION.map(map);
    const lines = ctx.thumb ? '' : `<path d="M${pts.map(s).join('L')}" fill="none" stroke="${WHITE}" stroke-width="1" stroke-linejoin="round" opacity=".6"/>`;
    return `<g class="owl-constellation">${lines}${pts.map(([x, y], i) => i === 2 ? star4(x, y, 5, WHITE) : `<circle cx="${f(x)}" cy="${f(y)}" r="1.4" fill="${WHITE}"/>`).join('')}</g>`;
  };
}
/** Ultra star dust on a wing. */
const DUST = [[46, 106, 5], [44, 118, 3.5], [50, 124, 4.5], [52, 112, 3], [48, 130, 3]];
function starDust() {
  return (map) => `<g class="owl-stardust">${DUST.map(([x, y, z], i) => { const [X, Y] = map([x, y]); return star4(X, Y, z, i % 2 ? '#ffd3ec' : WHITE); }).join('')}</g>`;
}

/** Intersections of two circles (for the crescent horns). */
function circleX([x0, y0, r0], [x1, y1, r1]) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const mx = x0 + (a * dx) / d, my = y0 + (a * dy) / d;
  return [[mx + (h * dy) / d, my - (h * dx) / d], [mx - (h * dy) / d, my + (h * dx) / d]];
}
/** Ultra moon halo behind the head: a crescent r 28 (#fffbe8 60 %) whose thick side rises at the upper left. */
function moonHalo(ctx) {
  const O = [78, 40, 28], I = [88, 46, 25];
  const [a, b] = circleX(O, I);
  const gid = ctx.defOnce('moon-glow', (full) => `<radialGradient id="${full}" cx="78" cy="40" r="34" gradientUnits="userSpaceOnUse"><stop offset=".6" stop-color="#fffbe8" stop-opacity=".28"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></radialGradient>`);
  const d = `M${s(a)}A${O[2]} ${O[2]} 0 1 0 ${s(b)}A${I[2]} ${I[2]} 0 1 1 ${s(a)}Z`;
  const rim = `M${s(a)}A${O[2] - 2} ${O[2] - 2} 0 1 0 ${s(b)}`;
  return `<g class="owl-moon"><circle cx="78" cy="40" r="34" fill="url(#${gid})"/><path d="${d}" fill="#fffbe8" opacity=".6"/>` +
    `<path d="${rim}" fill="none" stroke="${WHITE}" stroke-width="1.5" stroke-linecap="round" opacity=".7" transform="translate(${f(O[0])} ${f(O[1])}) scale(.995) translate(${f(-O[0])} ${f(-O[1])})"/>` +
    star4(122, 22, 6, WHITE, 'opacity=".85"') + star4(40, 30, 4.5, '#ffd3ec', 'opacity=".85"') + `</g>`;
}

export default {
  id: 'owl',
  name: 'Hootling',
  anchors: { headTop: [80, 32], brow: [80, 46], neck: [80, 92], chest: [80, 112], hand: HAND, mouth: [80, 84], accScale: 1.1 },
  auraCenter: AURA_CENTER,
  idleClass: 'pet-idle--owl',

  draw(ctx) {
    const p = ctx.palette, t = ctx.tier;
    const pose = POSE[ctx.mood] || POSE.healthy;
    const prism = t === 6 ? prismOverlay(ctx) : '';
    const sx = pose.fluff;

    // Body: egg with the lower-right shade; a pale chest patch; feet in front.
    const ruffBody = ctx.mood === 'starving' ? ruffle(52.5, 138.5, -140, p.body) + ruffle(107.5, 138.5, 140, p.body) : '';
    const body = ruffBody + cel(ctx, 'body', eggD(sx), { fill: p.body, shade: p.shade, shadeOffset: [-7, -7], inner: prism });
    const chest = egg(80, 101, 140.5, 21 * sx, 123, 0.58);
    const belly = `<path d="${chest}" fill="${p.belly}"/>` +
      `<path d="M${f(80 - 13 * sx)} 108Q80 101 ${f(80 + 13 * sx)} 108" fill="none" stroke="${WHITE}" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>`;
    const foot = (x) => {
      const d = `M${x - 7} 143.5C${x - 8} 149.5 ${x - 3.4} 151 ${x - 2.2} 148C${x - 1.4} 151.4 ${x + 1.4} 151.4 ${x + 2.2} 148C${x + 3.4} 151 ${x + 8} 149.5 ${x + 7} 143.5C${x + 5} 141 ${x - 5} 141 ${x - 7} 143.5Z`;
      return `<path d="${d}" fill="${BEAK}" ${ol(3)}/><path d="M${x - 4.5} 144.4Q${x} 142.6 ${x + 4.5} 144.4" fill="none" stroke="#ffd59a" stroke-width="1.6" stroke-linecap="round"/>`;
    };
    const legs = foot(68) + foot(92);

    // Head: cel-shaded round head, facial disc, specular dot.
    const ruffHead = ctx.mood === 'starving' ? ruffle(42.6, 72, -96, p.body) + ruffle(117.6, 60, 92, p.body) : '';
    const discEdge = mix(p.shade, p.belly, 0.25);
    let disc = `<path d="${DISC_D}" fill="${p.belly}"/>` +
      `<path d="M80 52.5Q80 59 80 63" fill="none" stroke="${p.body}" stroke-width="3" stroke-linecap="round" opacity=".55"/>` +
      `<path d="${DISC_D}" fill="none" stroke="${discEdge}" stroke-width="2.4" stroke-linejoin="round"/>`;
    if (t === 2) {
      // SR: pale crescent edges on the facial disc.
      disc += `<path d="M53.6 66C52.6 55 55.8 48 63 46" fill="none" stroke="${WHITE}" stroke-width="2" stroke-linecap="round" opacity=".6"/>` +
        `<path d="M106.4 66C107.4 55 104.2 48 97 46" fill="none" stroke="${WHITE}" stroke-width="2" stroke-linecap="round" opacity=".6"/>`;
    }
    let head = ruffHead + disc + specular(60, 41, 4);
    if (t === 5) head += trim('M47 56C50 43 62 35.6 80 35.6C98 35.6 110 43 113 56');

    // Wings (arms) with tier dressing.
    const wingExtra = t === 4 ? constellation(ctx) : t === 6 ? starDust() : '';
    let arms = wing(ctx, -1, pose.wing, sx, wingExtra) + wing(ctx, 1, pose.wing, sx, wingExtra);
    if (t === 5) arms += trim(`M${s([45.5, 103])}Q${s([48.5, 98.5])} ${s([53, 98])}`) + trim(`M${s(mirror([45.5, 103]))}Q${s(mirror([48.5, 98.5]))} ${s(mirror([53, 98]))}`);

    // Markings (belly chevrons) and the single body accessory.
    const markings = t === 1 || t === 2 ? chevrons(ctx) : '';
    const accBody = t === 2 ? scarf(ctx) : t === 5 ? quill(ctx, pose.wing, sx) : '';

    // Brow item: the glasses evolve (Epic → Mythic star rims → Legendary gold → Ultra moon monocle).
    const accBrow = t === 3 ? glasses(ctx, p.accent, { glowIt: true })
      : t === 4 ? glasses(ctx, '#ffe4f2', { stars: true })
        : t === 5 ? glasses(ctx, GOLD, { gold: true })
          : t === 6 ? monocle(ctx) : '';

    // Face (+ the gulp bulge used by the eating action).
    const gulp = ctx.thumb ? '' : `<g class="owl-gulp" opacity="0"><circle cx="${MOUTH[0]}" cy="86" r="6" fill="${p.shade}"/><circle cx="${MOUTH[0] - 2}" cy="84" r="1.6" fill="${WHITE}" opacity=".7"/></g>`;
    const faceMarkup = face(ctx, { eyes: EYES, mouth: MOUTH, eyeSize: [18, 18], mouthWidth: 10, blushDx: 4, blushDy: 12, parts: PARTS }) + gulp;

    const occlude = tuft(ctx, -1, pose.tuft) + tuft(ctx, 1, pose.tuft);

    // Starving: a stray feather drifting down beside the owl (fx; hidden on thumbnails by the rig).
    const fx = ctx.mood === 'starving' && !ctx.thumb
      ? `<g class="owl-feather"><g transform="translate(124 104) rotate(28)"><path d="M-4.5 0Q0 -2.6 4.5 0Q0 2.6 -4.5 0Z" fill="${p.shade}" ${ol(1.5)}/><path d="M-6 0.4L3 0" fill="none" ${ol(1.2)}/></g></g>` : '';

    return {
      'aura-back': t === 6 && !ctx.thumb ? moonHalo(ctx) : '',
      body,
      legs,
      belly,
      markings,
      arms,
      'acc-body': accBody,
      head,
      face: faceMarkup,
      'acc-brow': accBrow,
      'occlude-front': occlude,
      fx,
    };
  },

  silhouette() {
    const tuftD = (side) => {
      const [px, py] = TUFT_PIVOT;
      const x = side < 0 ? px : 160 - px;
      return `<path d="${TUFT_FILL}" transform="translate(${f(x)} ${py})${side < 0 ? '' : ' scale(-1 1)'} rotate(-20)"/>`;
    };
    const wingD = (side) => `<path d="${cubic(WING_START, WING, wingMap(side, 0, 1))}"/>`;
    const feet = [68, 92].map((x) => `<path d="M${x - 7} 143.5C${x - 8} 149.5 ${x - 3.4} 151 ${x - 2.2} 148C${x - 1.4} 151.4 ${x + 1.4} 151.4 ${x + 2.2} 148C${x + 3.4} 151 ${x + 8} 149.5 ${x + 7} 143.5Z"/>`).join('');
    return `<path d="${eggD()}"/>${wingD(-1)}${wingD(1)}${feet}${tuftD(-1)}${tuftD(1)}`;
  },
};
