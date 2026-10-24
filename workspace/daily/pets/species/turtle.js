// Pebbleback (turtle). CONTENT.md §A.2 "Pebbleback (turtle)"; contract in species/_template.js.
//
// Front three-quarter view, facing a touch to the viewer's left (tail on the right). A big round
// head pokes out of a neck opening at the top of a hexagon-plated shell dome; four stub feet and a
// plastron lip show under the rim.
//
// The head (neck, skull, face, brow items) is wrapped in a clip that is everything above the
// opening's front lip, so the idle "pull the head in and peek" (CSS .turtle-hd) really slides the
// head into the shell. Hungry lowers the head 6 px in geometry (the clip hides what sinks), and
// starving draws no head at all: only teary eyes in the dark opening.

import { cel, face, specular, star4, glow, flame, trim, prismOverlay, ol, f, rot } from '../rig.js';
import { OUTLINE, WHITE, GOLD, mix } from '../palette.js';

const DARK = '#2b2740'; // the inside of the shell (CONTENT.md: starving "dark opening")
const MOSS = '#7ccf6b';
const BARK = '#8a5a3b';

// Head pose per mood: dy = head drop in px (hungry: 6, CONTENT.md), tilt in degrees.
const POSE = {
  healthy: { dy: 0, tilt: 0 },
  happy: { dy: -1.5, tilt: -3 },
  hungry: { dy: 6, tilt: 4 },
  starving: { dy: 0, tilt: 0, hidden: true },
};

const HEAD_C = [79, 62];
// Round chibi head, a hair wider at the cheeks (x 49–109, y 33–91).
const HEAD = 'M49 63C49 44 62 33 79 33C96 33 109 44 109 63C109 80 97 91 79 91C61 91 49 80 49 63Z';
// Short neck behind the head; its bottom is hidden by the opening clip.
const NECK = 'M63 78C62 88 60 96 59 104L99 104C98 96 96 88 95 78Z';
// Shell dome (x 34–126, y 79–141).
const SHELL = 'M34 124C33 99 54 79 80 79C106 79 127 99 126 124C126 131 123 136 116 138.5C101 142.5 59 142.5 44 138.5C37 136 34 131 34 124Z';
// Neck opening: the head sits in it; its lower arc is the shell's front lip.
const HOLE = { cx: 79, cy: 90, rx: 25, ry: 7.5 };
const HOLE_STARVING = { cx: 80, cy: 94.5, rx: 21.5, ry: 10.5 };
const PLASTRON = 'M58 134C60 144 68 148 80 148C92 148 100 144 102 134Z';
const FOOT_L = 'M45 140C45 135 49 132.5 54 132.5C59 132.5 63 135 63 140C63 145 59.5 147.6 54 147.6C48.5 147.6 45 145 45 140Z';
const FOOT_R = 'M97 140C97 135 101 132.5 106 132.5C111 132.5 115 135 115 140C115 145 111.5 147.6 106 147.6C100.5 147.6 97 145 97 140Z';
const REAR_L = 'M29 140C29 135.5 32.5 133 37 133C41.5 133 44 136 44 140C44 144.5 41 146.8 36.5 146.8C32 146.8 29 144.5 29 140Z';
const REAR_R = 'M116 140C116 136 118.5 133 123 133C127.5 133 131 135.5 131 140C131 144.5 128 146.8 123.5 146.8C119 146.8 116 144.5 116 140Z';
const TAIL = 'M117 127C124 124.5 132 126.5 137 133C131.5 135.5 124 136.5 118 135.5Z';
const TAIL_TIP = [136, 133];

// Five hex plates: centre 25 wide at (80, 111) and four around it, turned and narrowed by the dome.
const PLATES = [
  { c: [80, 111], w: 25, h: 21.5, a: 0, k: 1 },
  { c: [58.5, 100.5], w: 21, h: 19.5, a: -12, k: 0.9 },
  { c: [101.5, 100.5], w: 21, h: 19.5, a: 12, k: 0.9 },
  { c: [59.5, 123], w: 21, h: 19, a: 9, k: 0.92 },
  { c: [100.5, 123], w: 21, h: 19, a: -9, k: 0.92 },
];

const s2 = ([x, y]) => `${f(x)} ${f(y)}`;

/** Flat-top hexagon corners for a plate (turned by a, narrowed by k). */
function hexPts({ c: [cx, cy], w, h, a, k }, inset = 0) {
  const hw = (w * k) / 2 - inset, hh = h / 2 - inset * 0.87;
  return [[cx - hw, cy], [cx - hw / 2, cy - hh], [cx + hw / 2, cy - hh], [cx + hw, cy], [cx + hw / 2, cy + hh], [cx - hw / 2, cy + hh]]
    .map((pt) => rot(pt, a, [cx, cy]));
}
/** Closed polygon with rounded corners (quadratic corners of radius r). */
function roundPoly(pts, r = 3) {
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i += 1) {
    const v = pts[i], p = pts[(i + n - 1) % n], q = pts[(i + 1) % n];
    const toward = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, t = Math.min(0.45, r / len); return [a[0] + dx * t, a[1] + dy * t]; };
    const A = toward(v, p), B = toward(v, q);
    d += `${i === 0 ? 'M' : 'L'}${s2(A)}Q${s2(v)} ${s2(B)}`;
  }
  return `${d}Z`;
}

const ellipseD = ({ cx, cy, rx, ry }) => `M${f(cx - rx)} ${f(cy)}A${rx} ${ry} 0 1 1 ${f(cx + rx)} ${f(cy)}A${rx} ${ry} 0 1 1 ${f(cx - rx)} ${f(cy)}Z`;
const lowerArc = ({ cx, cy, rx, ry }, inset = 0) => `M${f(cx - rx + inset)} ${f(cy)}A${f(rx - inset)} ${f(ry - inset)} 0 0 0 ${f(cx + rx - inset)} ${f(cy)}`;

/** The shell: dome in `shade`, raised plates, a 6.5 px rim band, one cel shade over everything, the neck opening. */
function shell(ctx) {
  const p = ctx.palette, t = ctx.tier, starving = ctx.mood === 'starving';
  const clip = ctx.defOnce('clip-shell', (id) => `<clipPath id="${id}"><path d="${SHELL}"/></clipPath>`);
  const shadeMask = ctx.defOnce('shell-shade', (id) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="160"><path d="${SHELL}" fill="${WHITE}"/><path d="${SHELL}" fill="#000000" transform="translate(-8 -9)"/></mask>`);
  const plateFill = mix(p.shade, p.body, 0.5);
  const seam = t === 1 || t === 2 ? p.accent : OUTLINE;
  const plates = PLATES.map((pl, i) => {
    if (t === 3 && i === 0) return ''; // Epic: the centre plate is a gem (markings)
    const d = roundPoly(hexPts(pl), 3.2);
    const hi = roundPoly(hexPts(pl, 3.4), 2);
    return `<path d="${d}" fill="${plateFill}"/><path d="${hi}" fill="${mix(plateFill, WHITE, 0.16)}" transform="translate(-1.2 -1.4)" opacity=".9"/>` +
      `<path d="${d}" fill="none" stroke="${seam}" stroke-width="2" stroke-linejoin="round"/>`;
  }).join('');
  const rimColor = t === 5 ? GOLD : p.belly;
  // Rim: the outline path stroked wide inside the clip gives an even band; a darker stroke under it draws the inner edge.
  const rim = `<path d="${SHELL}" fill="none" stroke="${mix(p.shade, OUTLINE, 0.55)}" stroke-width="15.6"/><path d="${SHELL}" fill="none" stroke="${rimColor}" stroke-width="12"/>`;
  // Marginal scute notches across the band (lower half only).
  const notches = [[44, 132, 40], [56, 138.5, 18], [70, 141, 6], [90, 141, -6], [104, 138.5, -18], [116, 132, -40], [37.5, 116, 72], [122.5, 116, -72]]
    .map(([x, y, a]) => { const A = rot([x, y - 3.4], a, [x, y]), B = rot([x, y + 3], a, [x, y]); return `M${s2(A)}L${s2(B)}`; }).join('');
  const notchArt = `<path d="${notches}" fill="none" stroke="${t === 5 ? '#e3b23c' : mix(p.belly, p.shade, 0.55)}" stroke-width="1.8" stroke-linecap="round"/>`;
  const gloss = `<path d="M47 104C49 96 54 90 60 87" fill="none" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" opacity=".55"/>`;
  const prism = t === 6 ? prismOverlay(ctx) : '';
  const shadeOverlay = `<rect x="0" y="0" width="160" height="160" fill="${OUTLINE}" opacity=".2" mask="url(#${shadeMask})"/>`;
  const hole = starving ? HOLE_STARVING : HOLE;
  const opening = `<path class="turtle-hole" d="${ellipseD(hole)}" fill="${DARK}" ${ol(3)}/>` +
    `<path d="${lowerArc(hole, 2.2)}" fill="none" stroke="${rimColor}" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>`;
  return `<path d="${SHELL}" fill="${p.shade}"/>` +
    `<g clip-path="url(#${clip})">${plates}${rim}${notchArt}${gloss}${prism}${shadeOverlay}</g>` +
    `<path d="${SHELL}" fill="none" ${ol()}/>${opening}`;
}

/** Tier markings on the shell (each tier replaces the previous one's). */
function markings(ctx) {
  const p = ctx.palette, t = ctx.tier;
  let out = '';
  if (t === 2) {
    // Super Rare: an oval in `belly` on the centre plate.
    out += `<ellipse cx="80" cy="111" rx="7.5" ry="5.8" fill="${p.belly}" stroke="${p.accent}" stroke-width="2"/><ellipse cx="77.6" cy="109.2" rx="2.2" ry="1.4" fill="${WHITE}" opacity=".8"/>`;
  }
  if (t === 3) {
    // Epic: the centre plate becomes a faceted #c9a2ff gem with a white glint and the Epic glow.
    const pl = PLATES[0];
    const outer = hexPts(pl, -0.5), inner = hexPts({ ...pl, w: 12, h: 9.5 });
    const tones = ['#b48cf5', '#e2d2ff', '#d6bfff', '#9c72e8', '#7f55d6', '#a37ef0'];
    const facets = outer.map((a, i) => {
      const b = outer[(i + 1) % 6], c = inner[(i + 1) % 6], d = inner[i];
      return `<path d="M${s2(a)}L${s2(b)}L${s2(c)}L${s2(d)}Z" fill="${tones[i]}"/>`;
    }).join('');
    out += `<g class="turtle-gem" ${glow(ctx, '#c9a2ff', 2)}><path d="${roundPoly(outer, 2.5)}" fill="#c9a2ff"/>${facets}` +
      `<path d="M${inner.map(s2).join('L')}Z" fill="#f0e6ff"/><path d="${roundPoly(outer, 2.5)}" fill="none" ${ol(2.5)}/>` +
      `<path d="M${inner.map(s2).join('L')}Z" fill="none" stroke="${OUTLINE}" stroke-width="1" stroke-linejoin="round" opacity=".35"/>${star4(75, 107, 8, WHITE)}</g>`;
    // Facet glints on the other plates.
    out += PLATES.slice(1).map((pl) => {
      const [a, b] = [hexPts(pl, 4)[1], hexPts(pl, 4)[2]];
      return `<path class="thin" d="M${s2(a)}L${s2(b)}" fill="none" stroke="${WHITE}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`;
    }).join('');
  }
  if (t === 4) {
    // Mythic celestial: 5 white 4-point specks (4 px, 70 %) on the shell.
    out += [[49, 113], [69, 129], [92, 103], [113, 116], [87, 131]].map(([x, y]) => star4(x, y, 4.5, WHITE, 'opacity=".7"')).join('');
  }
  return out;
}

/**
 * The single body accessory on the back: moss + flower, bonsai, gold bonsai + lantern, star-tree.
 * The trees are drawn round a trunk base at (111, 89) and placed by TREE_AT: base moved to (118, 90)
 * and leaned +12°, so the crown (centred ≈ (128, 62)) clears the head (x ≥ 112, ≤ 140).
 */
const TREE_AT = 'rotate(12 118 90) translate(7 1)';
function backItem(ctx) {
  const t = ctx.tier;
  const tree = (inner) => `<g class="turtle-tree"><g transform="${TREE_AT}">${inner}</g></g>`;
  const blob = (x, y, r, fill, hiOp = 0.55) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}" ${ol(2.5)}/><circle cx="${f(x - r * 0.38)}" cy="${f(y - r * 0.4)}" r="${f(r * 0.3)}" fill="${WHITE}" opacity="${hiOp}"/>`;
  const trunk = (color) => `<path d="M111 89C107 82 117 78 115 70C113.5 64 116 59 119 56" fill="none" stroke="${OUTLINE}" stroke-width="7.5" stroke-linecap="round"/>` +
    `<path d="M111 89C107 82 117 78 115 70C113.5 64 116 59 119 56" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M114.8 73C118 71 121 70.5 124 71" fill="none" stroke="${OUTLINE}" stroke-width="6" stroke-linecap="round"/><path d="M114.8 73C118 71 121 70.5 124 71" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`;
  if (t === 2) {
    // Super Rare: moss tuft (3 bumps 18 × 8) with a tiny flower.
    const moss = 'M103 89C102 84 105 82 108 83.5C109 80 114 79.5 115.5 82.5C118 81 121.5 83 121 87C121 89 104 90.5 103 89Z';
    const petals = [0, 72, 144, 216, 288].map((a) => { const [x, y] = rot([116, 76.4], a, [116, 79]); return `<circle cx="${f(x)}" cy="${f(y)}" r="1.9" fill="${WHITE}" ${ol(1)}/>`; }).join('');
    return `<g class="turtle-moss"><path d="${moss}" fill="${MOSS}" ${ol(2.5)}/><path d="M106.5 86C108 85 110 85 111 86M113 85C114.5 84 116.5 84.2 117.5 85.2" fill="none" stroke="#4f9d43" stroke-width="1.4" stroke-linecap="round"/>` +
      `<path d="M116 81.5L115.6 84" stroke="#4f9d43" stroke-width="1.4" stroke-linecap="round"/><g class="turtle-flower">${petals}<circle cx="116" cy="79" r="1.7" fill="#ffd34d" ${ol(0.8)}/></g></g>`;
  }
  if (t === 4) {
    // Mythic: bonsai (trunk #8a5a3b, S-curve 24 tall) with 3 blossom puffs.
    return tree(`${trunk(BARK)}${blob(124, 68, 7, '#ff9ecf')}${blob(112, 61, 7, '#ffd3ec')}${blob(120.5, 53, 8, '#ffd3ec')}` +
      `<circle cx="124" cy="56" r="1.4" fill="#ff9ecf"/><circle cx="117" cy="50.5" r="1.2" fill="#ff9ecf"/><circle cx="110" cy="62.5" r="1.2" fill="#ff9ecf"/>`);
  }
  if (t === 5) {
    // Legendary: the bonsai with gold leaves and a hanging lantern (6 × 9 #ffb347, soft glow).
    const lg = ctx.defOnce('lantern-glow', (id) => `<radialGradient id="${id}"><stop offset="0" stop-color="#ffb347" stop-opacity=".75"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>`);
    // The lantern hangs straight down from the crown at (134, 74) (outside the leaned tree group).
    const lantern = `<g class="turtle-lantern"><path d="M134 72L134 76.5" stroke="${OUTLINE}" stroke-width="1.4" stroke-linecap="round"/><circle cx="134" cy="81.5" r="9" fill="url(#${lg})"/>` +
      `<rect x="131" y="77" width="6" height="9" rx="2.4" fill="#ffb347" ${ol(1.8)}/><path d="M132.2 77h3.6M132.2 86h3.6" stroke="${OUTLINE}" stroke-width="1.6" stroke-linecap="round"/><rect x="132.6" y="78.9" width="1.3" height="4.6" rx=".65" fill="#fff1df" opacity=".9"/></g>`;
    return tree(`${trunk(BARK)}${blob(112, 61, 7, GOLD, 0.7)}${blob(120.5, 53, 8, GOLD, 0.7)}${blob(124.5, 67.5, 6.5, '#ffd34d', 0.7)}`).replace(/<\/g>$/, `${lantern}</g>`);
  }
  if (t === 6) {
    // Ultra: star-tree (trunk #b08f2a) with a crown of 4 prismatic puffs and a star.
    const prism = ctx.defOnce('puff-prism', (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".35" stop-color="#ffd3ec"/><stop offset=".7" stop-color="#cfe8ff"/><stop offset="1" stop-color="#d8ffef"/></linearGradient>`);
    return tree(`${trunk('#b08f2a')}${blob(124, 67.5, 6.5, `url(#${prism})`, 0.8)}${blob(111.5, 61, 7, '#ffd3ec', 0.8)}${blob(126, 57, 7, '#cfe8ff', 0.8)}${blob(118, 52, 8, '#d8ffef', 0.8)}` +
      `<g class="turtle-treestar">${star4(118.5, 41, 11, '#fff3b0', ol(1.6))}</g>`);
  }
  return '';
}

/** Ultra planet ring (rx 58, ry 12, #cfe8ff, tilted −8°): back half behind the shell, front half in front. */
function planetRing(half) {
  const L = [22, 116], R = [138, 116];
  const d = `M${s2(L)}A58 12 0 0 ${half === 'back' ? 1 : 0} ${s2(R)}`;
  return `<g class="turtle-ring" transform="rotate(-8 80 116)"><path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="7.5" stroke-linecap="round" opacity=".7"/>` +
    `<path d="${d}" fill="none" stroke="#cfe8ff" stroke-width="4" stroke-linecap="round" opacity=".85"/>` +
    (half === 'front' ? `<path d="M44 125.6A58 12 0 0 0 70 128" fill="none" stroke="${WHITE}" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>` : '') + '</g>';
}

/** Feet with three little toenails. */
function foot(ctx, d, cx, cls) {
  const p = ctx.palette;
  const nails = [-4.6, 0, 4.6].map((dx) => `<ellipse cx="${f(cx + dx)}" cy="${dx ? 145.2 : 145.9}" rx="1.7" ry="1.3" fill="${p.belly}"/>`).join('');
  return `<g class="${cls}">${cel(ctx, `${cls}-${cx}`, d, { fill: p.body, shade: p.shade, shadeOffset: [-3, -3.5] })}${nails}</g>`;
}

/** Starving: eyes peering out of the dark opening (light whites so they read on #2b2740). */
function hollowEyes(ctx, o) {
  const p = ctx.palette;
  return `<g class="eyes-hollow">${o.eyes.map(([x, y], i) => {
    const inner = i === 0 ? 1 : -1;
    return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="6" ry="6.8" fill="${p.belly}" ${ol(1.6)}/>` +
      `<ellipse cx="${f(x + inner * 0.7)}" cy="${f(y + 1.3)}" rx="3.7" ry="4.7" fill="${OUTLINE}"/>` +
      `<circle cx="${f(x - 0.4)}" cy="${f(y - 0.2)}" r="1.5" fill="${WHITE}"/>` +
      `<path d="M${f(x - 5 * inner)} ${f(y - 8)}L${f(x + 3 * inner)} ${f(y - 10)}" fill="none" stroke="${p.belly}" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>`;
  }).join('')}</g>`;
}

export default {
  id: 'turtle',
  name: 'Pebbleback',
  anchors: { headTop: [79, 34], brow: [79, 47], neck: [79, 92], chest: [80, 112], back: [112, 86], tailTip: TAIL_TIP, mouth: [78, 82], accScale: 0.95 },
  auraCenter: [80, 94],
  idleClass: 'pet-idle--turtle',

  draw(ctx) {
    const p = ctx.palette, t = ctx.tier, mood = ctx.mood;
    const pose = POSE[mood] || POSE.healthy;
    const starving = Boolean(pose.hidden);

    // ---- back layers: rear feet, tail (tucked in when starving), Ultra ring back half ----
    let tail = '';
    if (!starving) {
      tail += cel(ctx, 'rear-l', REAR_L, { fill: p.body, shade: p.shade, shadeOffset: [-3, -3] }) +
        cel(ctx, 'rear-r', REAR_R, { fill: p.body, shade: p.shade, shadeOffset: [-3, -3] }) +
        `<g class="turtle-tail">${cel(ctx, 'tail', TAIL, { fill: p.body, shade: p.shade, shadeOffset: [-2, -2.5] })}` +
        (t === 5 ? flame(ctx, TAIL_TIP[0] - 1, TAIL_TIP[1] - 1, 13, 62) : '') + '</g>';
    } else {
      // Pulled in: the front feet sit squashed behind the rim, only their toes peeking out.
      tail += `<g transform="translate(0 148) scale(1 .8) translate(0 -148)">${foot(ctx, FOOT_L, 54, 'turtle-toes')}${foot(ctx, FOOT_R, 106, 'turtle-toes')}</g>`;
    }

    const body = cel(ctx, 'plastron', PLASTRON, { fill: p.belly, shade: mix(p.belly, p.shade, 0.35), shadeOffset: [-4, -3] }) +
      `<path d="M80 141.5V147" stroke="${mix(p.belly, p.shade, 0.6)}" stroke-width="1.8" stroke-linecap="round"/>` +
      shell(ctx);

    const legs = starving ? '' : foot(ctx, FOOT_L, 54, 'turtle-foot turtle-foot--l') + foot(ctx, FOOT_R, 106, 'turtle-foot turtle-foot--r');

    // ---- head (inside the lip clip; .turtle-hd is what the idle/eat animations move) ----
    const lip = ctx.defOnce('lip', (id) => `<clipPath id="${id}"><path d="M-40 -40H200V${HOLE.cy}H${HOLE.cx + HOLE.rx}A${HOLE.rx} ${HOLE.ry} 0 0 1 ${HOLE.cx - HOLE.rx} ${HOLE.cy}H-40Z"/></clipPath>`);
    const place = (inner) => `<g transform="translate(0 ${f(pose.dy)}) rotate(${f(pose.tilt)} ${HEAD_C[0]} ${HEAD_C[1] + 20})">${inner}</g>`;
    const wrap = (inner) => (inner ? `<g clip-path="url(#${lip})"><g class="turtle-hd">${place(inner)}</g></g>` : '');

    let head = '', faceArt, sigh = '';
    if (!starving) {
      const prism = t === 6 ? prismOverlay(ctx) : '';
      const neck = cel(ctx, 'neck', NECK, { fill: p.body, shade: p.shade, shadeOffset: [-5, 0] }) +
        `<path d="M66 95.5C74 98.5 84 98.5 92 95.5" fill="none" stroke="${p.shade}" stroke-width="2" stroke-linecap="round"/>`;
      const muzzle = `<path d="M61 80.5C62 73.5 69.5 71 78 71C86.5 71 94 73.5 95 80.5C95 86.5 87.5 90 78 90C68.5 90 61 86.5 61 80.5Z" fill="${p.belly}"/>`;
      const spots = `<g opacity=".75"><ellipse cx="93" cy="41.5" rx="3.6" ry="2.6" fill="${p.shade}" transform="rotate(25 93 41.5)"/><ellipse cx="100.5" cy="49" rx="2.4" ry="1.8" fill="${p.shade}" transform="rotate(40 100.5 49)"/><circle cx="86" cy="38.6" r="1.6" fill="${p.shade}"/></g>`;
      const skull = cel(ctx, 'head', HEAD, { fill: p.body, shade: p.shade, shadeOffset: [-6, -6.5], inner: muzzle + spots + prism });
      const nostrils = `<ellipse cx="74.5" cy="76" rx="1.1" ry=".8" fill="${p.accent}" opacity=".7"/><ellipse cx="81.5" cy="76" rx="1.1" ry=".8" fill="${p.accent}" opacity=".7"/>`;
      const legendTrim = t === 5 ? trim('M55.5 52C59 42 68 36.4 79 36.4C90 36.4 99 42 102.5 52') : '';
      head = wrap(neck + skull + nostrils + specular(62.5, 46) + `<circle cx="68.5" cy="41.5" r="1.6" fill="${WHITE}" opacity=".8"/>` + legendTrim);

      // Yawn overlay (healthy, focused pet only; CSS shows it for 0.8 s every 12 s).
      const yawn = `<g class="turtle-yawn" opacity="0"><path d="M59.5 66.5Q65 69.5 70.5 66.5M85.5 66.5Q91 69.5 96.5 66.5" fill="none" ${ol(3)}/>` +
        `<ellipse cx="78" cy="82.5" rx="4.6" ry="5.6" fill="${OUTLINE}"/><ellipse cx="78" cy="85.6" rx="2.8" ry="1.7" fill="#ff7fb6"/></g>`;
      // Eating: cheeks puff out at the jaw corners; a closed munching mouth replaces the open smile.
      const munch = `<g class="turtle-cheeks" opacity="0"><g class="turtle-cheek turtle-cheek--l"><ellipse cx="57" cy="79" rx="7" ry="6.2" fill="${p.body}" ${ol(3)}/><ellipse cx="57.5" cy="80.5" rx="3.6" ry="2.2" fill="#ff7fb6" opacity=".55"/></g>` +
        `<g class="turtle-cheek turtle-cheek--r"><ellipse cx="99" cy="79" rx="7" ry="6.2" fill="${p.body}" ${ol(3)}/><ellipse cx="98.5" cy="80.5" rx="3.6" ry="2.2" fill="#ff7fb6" opacity=".55"/></g>` +
        `<path class="turtle-munch-mouth" d="M73 81Q75.5 84 78 81Q80.5 84 83 81" fill="none" ${ol(2.6)}/></g>`;
      sigh = mood === 'hungry'
        ? `<g class="turtle-sigh"><path d="M41 86C38 86 37 82.6 39.6 81.4C39.2 78 43.4 76.4 45.4 78.8C47.6 76.6 51.6 78.2 51 81.4C53.6 82.2 53 86 50 86Z" fill="${WHITE}" fill-opacity=".4" stroke="${WHITE}" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round"/></g>`
        : '';
      faceArt = face(ctx, {
        eyes: [[65, 66], [91, 66]],
        mouth: [78, 81],
        eyeSize: mood === 'happy' ? [14, 18] : [13, 17],
        blushDx: 2, blushDy: 12,
        parts: {
          'mouth-open': (c, o) => {
            const [x, y] = o.mouth;
            return `<g class="mouth-open"><path d="M${x - 7} ${y - 1.5}Q${x} ${y - 0.6} ${x + 7} ${y - 1.5}Q${x + 6} ${y + 7} ${x} ${y + 7}Q${x - 6} ${y + 7} ${x - 7} ${y - 1.5}Z" fill="${OUTLINE}" ${ol(2)}/>` +
              `<ellipse cx="${x}" cy="${f(y + 4.4)}" rx="3.3" ry="1.8" fill="#ff7fb6"/></g>`;
          },
        },
        extra: { healthy: yawn, happy: munch, hungry: sigh },
      });
      faceArt = wrap(faceArt);
    } else {
      // Starving: no head; teary eyes in the dark opening. The happy copy (triggered) peeks with light ^^ eyes.
      const { cx, cy } = HOLE_STARVING;
      faceArt = face(ctx, {
        eyes: [[cx - 8.5, cy], [cx + 8.5, cy]],
        mouth: [cx, cy + 6],
        parts: {
          'eyes-hollow': hollowEyes,
          'eyes-happy': (c, o) => `<g class="eyes-happy">${o.eyes.map(([x, y]) => `<path d="M${x - 5} ${y + 2}Q${x} ${y - 5.5} ${x + 5} ${y + 2}" fill="none" stroke="${p.belly}" stroke-width="3" stroke-linecap="round"/>`).join('')}</g>`,
          'mouth-o': () => '<g class="mouth-o"></g>',
          'mouth-open': () => '<g class="mouth-open"></g>',
          blush: () => '',
          tear: (c, o) => `<g class="tear"><path d="M${o.eyes[0][0] - 5} ${o.eyes[0][1] + 4.6}c2.4 3 2.4 6.4 0 6.4c-2.4 0 -2.4 -3.4 0 -6.4Z" fill="#9fd4ff" ${ol(1.2)}/><circle cx="${o.eyes[0][0] - 5.7}" cy="${o.eyes[0][1] + 9}" r=".8" fill="${WHITE}"/></g>`,
        },
      });
    }

    // ---- accessories ----
    let accBody = backItem(ctx);
    let wingBack = '';
    if (t === 6) { wingBack = planetRing('back'); accBody = planetRing('front') + accBody; }

    // Eating crumbs: two little triangles in the tier belly colour fall from the mouth.
    const [mx, my] = [78, 84 + pose.dy];
    const crumbs = ctx.thumb || starving ? '' : `<g class="turtle-crumbs">${[[-6, 0], [5, 1.5]].map(([dx, dy], i) =>
      `<path class="turtle-crumb" style="--i:${i}" d="M${f(mx + dx)} ${f(my + dy - 2.2)}L${f(mx + dx + 2.4)} ${f(my + dy + 1.8)}L${f(mx + dx - 2.4)} ${f(my + dy + 1.8)}Z" fill="${p.belly}" ${ol(1)}/>`).join('')}</g>`;

    return {
      tail,
      'wing-back': wingBack,
      body,
      legs,
      markings: markings(ctx),
      'acc-body': accBody,
      head,
      face: faceArt,
      'occlude-front': '', // no horns/ears/tufts: nothing on a turtle sits in front of a hat
      fx: crumbs,
    };
  },

  silhouette() {
    // The shell carries its five plates as holes (evenodd), so the carving and Petdex cell read as a turtle.
    const holes = PLATES.map((pl) => roundPoly(hexPts(pl, 2.4), 2.5)).join('');
    return `<path fill-rule="evenodd" d="${SHELL}${holes}"/><path d="${HEAD}"/><path d="${FOOT_L}"/><path d="${FOOT_R}"/><path d="${REAR_L}"/><path d="${REAR_R}"/><path d="${TAIL}"/>`;
  },
};
