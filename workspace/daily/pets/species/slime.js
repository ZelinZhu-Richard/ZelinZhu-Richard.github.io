// Gumdrop (slime): the reference species. CONTENT.md §A.2 "Gumdrop (slime)".
// Copy this file's shape when building a new species (see species/_template.js for the contract).

import { cel, face, specular, star4, glow, flame, trim, prismOverlay, ol, f, rot } from '../rig.js';
import { OUTLINE, WHITE, GOLD } from '../palette.js';

// Mood geometry: body squash (sx, sy around the ground point 80,148); the curl tip droops (deg)
// around its own neck and shrinks toward it (curlScale).
const POSE = {
  healthy: { sx: 1, sy: 1, droop: 0, curlScale: 1 },
  happy: { sx: 1, sy: 1, droop: -8, curlScale: 1.04 },
  hungry: { sx: 1.05, sy: 0.9, droop: 22, curlScale: 0.96 },
  starving: { sx: 1.15, sy: 0.7, droop: 36, curlScale: 0.74 },
};
const CURL_PIVOT = [82, 55];
const AURA_CENTER = [80, 92]; // keeps the Epic ring, motes and halo inside the 160 box

// Gumdrop dome: base 96 wide (x 32–128) with three soft lobes; top at y 58.
const DOME_START = [32, 141];
const DOME = [
  [[27, 101], [43, 62], [80, 58]],
  [[117, 62], [133, 101], [128, 141]],
  [[129, 147], [121, 148.6], [112, 148.2]],                               // right lobe
  [[104, 148], [99.5, 146.8], [96, 145]],
  [[92, 148.4], [86, 149.2], [80, 149.2]],                                // middle lobe
  [[74, 149.2], [68, 148.4], [64, 145]],
  [[60.5, 146.8], [56, 148], [48, 148.2]],                                // left lobe
  [[39, 148.6], [31, 147], [32, 141]],
];
// Soft-serve curl on top, leaning right. `{ p, c: true }` points belong to the tip and droop with the mood.
const CURL_START = [63, 68];
const CURL = [
  [[62, 57], [70, 49.5], { p: [79, 48], c: true }],
  [{ p: [84.5, 47.5], c: true }, { p: [88, 44], c: true }, { p: [89, 38.5], c: true }],
  [{ p: [95.5, 39.5], c: true }, { p: [100, 45.5], c: true }, { p: [97.5, 50.5], c: true }],
  [[101.5, 53.5], [101.5, 61], [97, 68]],
];
// Visible outline of the curl (open: its base melts into the dome).
const CURL_LINE_START = [65.4, 64];
const CURL_LINE = [
  [[65, 55.5], [71.5, 49], { p: [79, 48], c: true }],
  CURL[1], CURL[2],
  [[100.6, 53.5], [100.8, 58.5], [98.4, 63.5]],
];

function poser(mood) {
  const pose = POSE[mood] || POSE.healthy;
  const T = ([x, y]) => [80 + (x - 80) * pose.sx, 148 + (y - 148) * pose.sy];
  const curl = ([x, y]) => {
    const scaled = [CURL_PIVOT[0] + (x - CURL_PIVOT[0]) * pose.curlScale, CURL_PIVOT[1] + (y - CURL_PIVOT[1]) * pose.curlScale];
    return T(rot(scaled, pose.droop, CURL_PIVOT));
  };
  const pt = (q) => (Array.isArray(q) ? T(q) : q.c ? curl(q.p) : T(q.p));
  const s = ([x, y]) => `${f(x)} ${f(y)}`;
  const path = (start, segs, close = true) => `M${s(pt(start))}` + segs.map((seg) => `C${seg.map((q) => s(pt(q))).join(' ')}`).join('') + (close ? 'Z' : '');
  return { pose, T, curl, s, pt, path };
}

// Tier markings, in healthy coordinates (positions follow the squash; shapes do not distort).
function markings(ctx, T) {
  const p = ctx.palette, t = ctx.tier;
  const at = (x, y) => T([x, y]).map(f);
  let out = '';
  if (t === 1 || t === 2) {
    // Marking A: 6 sprinkles inside the jelly.
    const spr = [[46, 118, 35, p.accent], [58, 134, -50, '#ff7fb6'], [101, 134, 25, '#ffe08a'], [114, 116, -35, p.accent], [74, 70, 70, '#ff7fb6'], [97, 73, -25, '#ffe08a']];
    out += spr.map(([x, y, a, c]) => { const [X, Y] = at(x, y); return `<rect x="-1.4" y="-3.8" width="2.8" height="7.6" rx="1.4" fill="${c}" transform="translate(${X} ${Y}) rotate(${a})"/>`; }).join('');
  }
  if (t === 2) {
    // Marking B: sugar-crystal facets on the surface.
    out += [[47, 98], [114, 90], [58, 141], [106, 140]].map(([x, y]) => { const [X, Y] = at(x, y); return `<path class="thin" d="M${X} ${f(Y - 3.5)}L${f(X + 2.4)} ${Y}L${X} ${f(Y + 3.5)}L${f(X - 2.4)} ${Y}Z" fill="${WHITE}" opacity=".45"/>`; }).join('');
  }
  const [cx, cy] = at(80, 126);
  if (t === 3) {
    // Faceted crystal core with an Epic glow.
    const v = Array.from({ length: 6 }, (_, i) => rot([cx, cy - 12], i * 60, [cx, cy]));
    const tones = ['#f0e6ff', '#dcc8ff', '#c9a2ff', '#9c72e8', '#b48cf5', '#e2d2ff'];
    const facets = v.map((a, i) => { const b = v[(i + 1) % 6]; return `<path d="M${cx} ${cy}L${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}Z" fill="${tones[i]}"/>`; }).join('');
    out += `<g ${glow(ctx, '#c9a2ff', 2)}><path d="M${v.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z" fill="#c9a2ff"/>${facets}` +
      `<path d="M${v.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z" fill="none" ${ol(2.5)}/>${star4(cx - 4, cy - 5, 6, WHITE)}</g>`;
  }
  if (t === 4) {
    // Galaxy swirl inside: a deep-violet night disc, two pale spiral arms (strokes, never a crimson fill,
    // which read as a wound) round a bright heart, star specks, plus celestial specks on the body.
    const disc = ctx.defOnce('galaxy', (full) => `<radialGradient id="${full}"><stop offset="0" stop-color="#3b1f5c" stop-opacity=".75"/><stop offset=".6" stop-color="#a83a74" stop-opacity=".4"/><stop offset="1" stop-color="#a83a74" stop-opacity="0"/></radialGradient>`);
    const arm = (a) => { const P = (x, y) => rot([cx + x, cy + y], a, [cx, cy]).map(f).join(' '); return `<path d="M${P(0, 0)}C${P(3, -8)} ${P(11, -9)} ${P(14, -2)}" fill="none" stroke="#ffe4f2" stroke-width="2" stroke-linecap="round" opacity=".85"/>`; };
    out += `<circle cx="${cx}" cy="${cy}" r="15" fill="url(#${disc})"/>${arm(0)}${arm(180)}<circle cx="${cx}" cy="${cy}" r="2.6" fill="${WHITE}"/>`;
    out += [[-11, -7], [9, -8], [13, 4], [-4, 9], [-14, 3], [3, -2]].map(([x, y]) => star4(cx + x, cy + y, 4, WHITE)).join('');
    out += [[44, 112], [116, 110], [52, 138], [110, 136], [98, 70]].map(([x, y]) => { const [X, Y] = at(x, y); return star4(+X, +Y, 4.5, WHITE, 'opacity=".7"'); }).join('');
  }
  if (t === 5) {
    // Gold flecks and a golden ring round the core, with a little sun-gold heart inside.
    const ringGlow = ctx.defOnce('ring-glow', (full) => `<radialGradient id="${full}"><stop offset="0" stop-color="${GOLD}" stop-opacity=".55"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient>`);
    out += `<circle cx="${cx}" cy="${cy}" r="16" fill="url(#${ringGlow})"/><circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="${OUTLINE}" stroke-width="4.2"/><circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="${GOLD}" stroke-width="2.2"/>` +
      `<path d="M${f(cx - 10)} ${f(cy - 9.6)}A14 14 0 0 1 ${f(cx + 3)} ${f(cy - 13.6)}" fill="none" stroke="${WHITE}" stroke-width="1" stroke-linecap="round" opacity=".85"/>` +
      star4(+cx, +cy, 10, GOLD, ol(1.5));
    out += [[46, 114], [112, 112], [56, 136], [104, 138], [70, 72], [94, 70], [120, 128], [40, 130]].map(([x, y]) => { const [X, Y] = at(x, y); return `<circle cx="${X}" cy="${Y}" r="1.6" fill="${GOLD}"/>`; }).join('');
  }
  return out;
}

export default {
  id: 'slime',
  name: 'Gumdrop',
  anchors: { headTop: [80, 46], brow: [80, 78], chest: [80, 108], back: [112, 96], mouth: [80, 106], accScale: 1.05 },
  auraCenter: AURA_CENTER,
  idleClass: 'pet-idle--slime',

  draw(ctx) {
    const { pose, T, curl, s, path } = poser(ctx.mood);
    const p = ctx.palette, t = ctx.tier;
    const at = (x, y) => T([x, y]);
    const C = (x, y) => s(curl([x, y]));

    // Jelly core: a soft belly-coloured glow inside the dome.
    const coreId = ctx.defOnce('core', (full) => `<radialGradient id="${full}"><stop offset="0" stop-color="${p.belly}" stop-opacity=".95"/><stop offset=".55" stop-color="${p.belly}" stop-opacity=".7"/><stop offset="1" stop-color="${p.belly}" stop-opacity="0"/></radialGradient>`);
    const [ccx, ccy] = at(80, 112);
    const core = `<ellipse cx="${f(ccx)}" cy="${f(ccy)}" rx="${f(36 * pose.sx)}" ry="${f(30 * pose.sy)}" fill="url(#${coreId})"/>`;
    const prism = t === 6 ? prismOverlay(ctx) : '';
    const dome = cel(ctx, 'dome', path(DOME_START, DOME), { fill: p.body, shade: p.shade, shadeOffset: [-7, -8], inner: core + prism });

    // Soft-serve curl in whipped-cream belly colour (body colour only for the swirl creases and the
    // shade), topped with a cherry, so it reads as dessert at every tier.
    const swirl = `<path d="M${C(69, 60)}C${C(77, 55)} ${C(88, 55.5)} ${C(97, 53)}" fill="none" stroke="${p.body}" stroke-width="1.5" stroke-linecap="round"/>` +
      `<path d="M${C(85.5, 46.5)}C${C(88.5, 43)} ${C(94, 43.5)} ${C(94.5, 47.5)}" fill="none" stroke="${p.body}" stroke-width="1.5" stroke-linecap="round"/>`;
    const curlArt = cel(ctx, 'curl', path(CURL_START, CURL), { fill: p.belly, shade: p.body, shadeOffset: [-4, -4], inner: swirl, outline: false }) +
      `<path d="${path(CURL_LINE_START, CURL_LINE, false)}" fill="none" ${ol()}/>`;
    let cherry = '';
    if (t !== 5) {
      const [kx, ky] = curl([88.6, 36.4]);
      cherry = `<g class="slime-cherry"><path d="M${f(kx + 0.6)} ${f(ky - 3)}Q${f(kx + 1.8)} ${f(ky - 6.6)} ${f(kx + 4.6)} ${f(ky - 7.6)}" fill="none" ${ol(2)}/>` +
        `<circle cx="${f(kx)}" cy="${f(ky)}" r="3.5" fill="#ff7fb6" ${ol(2)}/><circle cx="${f(kx - 1.2)}" cy="${f(ky - 1.2)}" r="1.1" fill="${WHITE}"/></g>`;
    }
    const body = `<g class="slime-jelly" opacity=".9">${dome}${curlArt}</g>${cherry}`;

    // Gloss: a short streak hugging the upper-left edge, the specular dot, a glint on the curl.
    let top = `<path d="M${s(at(42.5, 104))}Q${s(at(42.5, 86))} ${s(at(52, 74))}" fill="none" stroke="${WHITE}" stroke-width="5.5" stroke-linecap="round" opacity=".6"/>` +
      specular(...at(63.5, 72).map(f), 4) + `<circle cx="${f(curl([81, 49])[0])}" cy="${f(curl([81, 49])[1])}" r="1.8" fill="${WHITE}" opacity=".85"/>`;
    if (t === 5) {
      // Legendary trim on the top arcs + a flame on the curl tip.
      top += trim(`M${s(at(36, 112))}C${s(at(37, 92))} ${s(at(46, 74))} ${s(at(62, 65))}`) + trim(`M${s(at(100, 65))}C${s(at(113, 71))} ${s(at(121, 86))} ${s(at(123.5, 104))}`);
      const [tx, ty] = curl([91, 43]);
      top += flame(ctx, tx, ty, 15, 22 + pose.droop);
    }

    const bubbles = [[104, 126, 4.2], [113, 107, 3], [53, 127, 3.4]].map(([x, y, r], i) => {
      const [X, Y] = at(x, y);
      return `<g class="slime-bubble" style="--i:${i}"><circle cx="${f(X)}" cy="${f(Y)}" r="${r}" fill="${WHITE}" opacity=".45"/><circle cx="${f(X - r * 0.35)}" cy="${f(Y - r * 0.35)}" r="${f(r * 0.32)}" fill="${WHITE}"/></g>`;
    }).join('');
    const [ox, oy] = at(80, 106);
    const eatOrb = `<g class="slime-eat-orb" opacity="0">${star4(ox, oy, 11, '#dfccff', ol(1.5))}<circle cx="${f(ox)}" cy="${f(oy)}" r="1.6" fill="${WHITE}"/></g>`;

    const faceMarkup = face(ctx, {
      eyes: [at(66, 92), at(94, 92)].map(([x, y]) => [f(x), f(y)]),
      mouth: at(80, 106).map(f),
      eyeSize: ctx.mood === 'happy' ? [14, 18] : [13, 17],
    });

    // Ultra: a baby-slime moon orbiting in front.
    let auraFront = '';
    if (t === 6 && !ctx.thumb) {
      const gid = ctx.defOnce('moon-grad', (full) => `<linearGradient id="${full}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ffd3ec"/><stop offset="1" stop-color="#cfe8ff"/></linearGradient>`);
      const [ax, ay] = AURA_CENTER;
      auraFront = `<g class="aura-orbit slime-moon" style="--dur:8s;--a0:200deg;transform-origin:${ax}px ${ay}px" transform="rotate(200)">` +
        `<g transform="translate(${ax + 56} ${ay}) rotate(-200)"><path d="M-9 6C-10 -2 -5 -8 0 -8.5C1.5 -11 5 -12.5 6.5 -10.5C4.5 -9.5 4.5 -7.5 5.5 -6C8.5 -3 10 1 9 6C8.5 8.5 -8.5 8.5 -9 6Z" fill="url(#${gid})" ${ol(2.5)}/>` +
        `<circle cx="-3" cy="0" r="1.4" fill="${OUTLINE}"/><circle cx="3.4" cy="0" r="1.4" fill="${OUTLINE}"/><path d="M-1.2 2.8Q.2 4.2 1.6 2.8" fill="none" ${ol(1.2)}/><circle cx="-5" cy="-3.5" r="1.4" fill="${WHITE}" opacity=".9"/></g></g>`;
    }

    return {
      body,
      belly: bubbles + eatOrb,
      markings: markings(ctx, T) + top,
      face: faceMarkup,
      'aura-front': auraFront,
    };
  },

  silhouette() {
    const { path } = poser('healthy');
    return `<path d="${path(DOME_START, DOME)}"/><path d="${path(CURL_START, CURL)}"/>`;
  },
};
