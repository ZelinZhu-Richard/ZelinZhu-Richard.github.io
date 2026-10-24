// Ripplegill (axolotl). CONTENT.md §A.2 "Ripplegill (axolotl)"; contract in species/_template.js.
//
// A wide mochi head with three frilly gill fronds on each side (in g-occlude-front, so a hat tucks
// behind them), small wide-set eyes, a wide smile, a plump body on four nub legs and a finned
// crescent tail behind the right side. Mood poses are static geometry (frond angles, colours);
// motion lives in the axolotl block of pets.css.

import { cel, face, specular, star4, glow, flame, trim, prismOverlay, ol, f, rot } from '../rig.js';
import { OUTLINE, WHITE, GOLD, FACE, mix } from '../palette.js';

const PINK = '#ff7fb6';
const LIMP = '#978daa';
const AURA_CENTER = [80, 92];

// ---------- geometry (healthy pose, 160 box, ground y 148) ----------

// Head: the brief's ellipse (cx 80, cy 70, rx 44, ry 30), drawn a touch squarer so it reads as a soft mochi.
const HEAD = 'M36 70C36 49.5 55 40 80 40C105 40 124 49.5 124 70C124 90.5 104 100.5 80 100.5C56 100.5 36 90.5 36 70Z';
// Body: plump ellipse (cx 80, cy 118, rx 26, ry 22), slightly pear-shaped toward the ground.
const BODY = 'M54 119C54 103 65 96 80 96C95 96 106 103 106 119C106 133 95 140.5 80 140.5C65 140.5 54 133 54 119Z';
// Tail: a finned crescent behind the right side (x 106–138, y 100–142), tip at the tailTip anchor.
const TAIL = 'M94 117C108 121 124 116 133.5 103.5C135.5 100.8 139.8 101.2 139.4 105.4C137.6 124 123 140.5 100 142.5Z';
// Outer fin edge of the tail (band clipped inside TAIL, in belly).
const TAIL_FIN = 'M139.4 105.4C137.6 124 123 140.5 100 142.5';
const TAIL_RAYS = [
  'M122 126.5L127.5 131', 'M129.5 117L135.5 119.5', 'M113 132.5L116.5 138.5',
];
// Nub legs. Front pair in g-legs (in front of the body); back pair peeks out behind the body.
const LEG_FRONT_L = 'M60.6 133C57.2 136.4 53.4 141.4 54.8 145.4C56.2 149 66.6 149.4 69.8 146.6C71.8 144.6 71.2 138.6 69.8 133.4Z';
const LEG_BACK_L = 'M57.6 130.6C51.4 130.4 45.8 135 46.2 140.4C46.6 145.4 53 147 57.8 143.8Z';
const mirrorX = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${f(160 - Number(x))} ${y}`);
const LEG_FRONT_R = mirrorX(LEG_FRONT_L);
const LEG_BACK_R = mirrorX(LEG_BACK_L);

// Starving: the head sinks (CSS --head-y) and the front feet come up under the cheeks, so the chin
// rests between them.
const PAW_REST_L = 'M50.5 104.5C46 108.5 46.2 116.4 51.6 118.6C56.8 120.6 66.4 119.6 68.2 115.6C69.8 111.6 66.2 106 61 104Z';
const PAW_REST_R = mirrorX(PAW_REST_L);

// Gill frond in local coordinates: base at (0, 0), pointing +x, 20 long, ~9 wide, three frills a side.
const FROND_BASE = 'M0 -2.8C1.6 -4.8 4 -6.4 6.4 -5.2C7.4 -7.4 10.8 -7.6 11.9 -4.9C13.2 -6.8 16.4 -6.4 16.9 -3.7C19.2 -3.8 21.2 -1.8 20.6 0' +
  'C21.2 1.8 19.2 3.8 16.9 3.7C16.4 6.4 13.2 6.8 11.9 4.9C10.8 7.6 7.4 7.4 6.4 5.2C4 6.4 1.6 4.8 0 2.8C-2.2 2 -2.2 -2 0 -2.8Z';
// Scaled up from the brief's 18 × 8 so the fronds read at 72 px.
const FROND_SCALE = [1.2, 1.12];
const scalePath = (d, [sx, sy]) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${f(Number(x) * sx)} ${f(Number(y) * sy)}`);
const FROND = scalePath(FROND_BASE, FROND_SCALE);
const FROND_TIP = [f(17.6 * FROND_SCALE[0]), 0];
const TIP_CLIP_X = f(11.2 * FROND_SCALE[0]);
// Frond bases along each side of the head and their fan angles (deg; 0 = straight out, + = down).
const FRONDS = [
  { base: [44.5, 55.5], a: -30 },
  { base: [41, 69], a: 30 },
  { base: [39.5, 62], a: 0 },
];
// Mood poses: droop rotates every frond down; fan spreads the outer two (CONTENT.md "Faces").
const POSE = {
  healthy: { droop: 0, fan: 0 },
  happy: { droop: -4, fan: 15 },
  hungry: { droop: 25, fan: 0 },
  starving: { droop: 50, fan: -8 },
};

const EYES = [[58, 70], [102, 70]];
const MOUTH = [80, 84];

// ---------- parts ----------

function frondDefs(ctx) {
  const clip = ctx.defOnce('frond', (id) => `<clipPath id="${id}"><path d="${FROND}"/></clipPath>`);
  const tip = ctx.defOnce('frond-tip', (id) => `<clipPath id="${id}"><rect x="${TIP_CLIP_X}" y="-10" width="18" height="20"/></clipPath>`);
  return { clip, tip };
}

/** One gill frond at a base point. side 1 = right, -1 = left; i = wave order (front → back). */
function frond(ctx, { base: [bx, by], a }, side, i, look) {
  const pose = POSE[ctx.mood] || POSE.healthy;
  const fanned = a + Math.sign(a) * pose.fan + pose.droop;
  const angle = side === 1 ? fanned : 180 - fanned;
  const x = side === 1 ? 160 - bx : bx;
  const { clip, tip } = frondDefs(ctx);
  const inner =
    // Soft light along the upper half, a rib, and the coloured tip edge (pink by default).
    `<path d="M1 -1.6C5 -4 12 -4.4 18 -1.4" fill="none" stroke="${look.light}" stroke-width="3" stroke-linecap="round" opacity=".55"/>` +
    (ctx.thumb ? '' : `<path d="M1.5 .4C6 -.2 11 -.2 15.5 .4" fill="none" stroke="${look.rib}" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>`) +
    // Thumbnails swap the thin pink edge for a solid pink cap so the tips still read at 72 px.
    (look.cap || (ctx.thumb && look.edge) ? `<g clip-path="url(#${tip})"><path d="${FROND}" fill="${look.cap || look.edge}"/></g>` : '') +
    (look.edge && !ctx.thumb ? `<g clip-path="url(#${tip})"><path d="${FROND}" fill="none" stroke="${look.edge}" stroke-width="6"/></g>` : '');
  const tipDot = look.glowTip
    ? `<g ${glow(ctx, '#c9a2ff', 2)}><circle cx="${FROND_TIP[0]}" cy="${FROND_TIP[1]}" r="3" fill="${ctx.palette.belly}"/></g><circle cx="${FROND_TIP[0] - 0.8}" cy="-.9" r="1" fill="${WHITE}"/>`
    : '';
  return `<g transform="translate(${f(x)} ${f(by)}) rotate(${f(angle)})"><g class="axolotl-frond" style="--i:${i};--dir:${side}">` +
    `<path d="${FROND}" fill="${look.fill}"/><g clip-path="url(#${clip})">${inner}</g><path d="${FROND}" fill="none" ${ol(3)}/>${tipDot}</g></g>`;
}

function frondLook(ctx) {
  const p = ctx.palette, t = ctx.tier;
  if (ctx.mood === 'starving') return { fill: LIMP, light: mix(LIMP, WHITE, 0.4), rib: mix(LIMP, OUTLINE, 0.25), edge: mix(PINK, LIMP, 0.65) };
  const look = { fill: p.shade, light: p.body, rib: mix(p.shade, OUTLINE, 0.22), edge: PINK };
  if (t === 3) look.glowTip = true;
  if (t === 5) { look.cap = GOLD; look.edge = '#f2b84b'; }
  if (t === 6) {
    const aur = ctx.defOnce('aurora', (id) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="20" y2="0"><stop offset="0" stop-color="#d8ffef"/><stop offset=".5" stop-color="#cfe8ff"/><stop offset="1" stop-color="#ffd3ec"/></linearGradient>`);
    look.fill = `url(#${aur})`; look.light = WHITE; look.rib = '#b7a9d6'; look.edge = PINK;
  }
  return look;
}

function gills(ctx) {
  const look = frondLook(ctx);
  // Draw order: the outer fronds first, the middle one on top. Wave order runs top → bottom.
  const side = (s) => FRONDS.map((fr) => frond(ctx, fr, s, fr.a < 0 ? 0 : fr.a > 0 ? 2 : 1, look)).join('');
  return `<g class="axolotl-gills axolotl-gills--l">${side(-1)}</g><g class="axolotl-gills axolotl-gills--r">${side(1)}</g>`;
}

// Mouth parts (the brief: a wide smile arc from (66, 84) to (94, 84); happy 20 % wider; hungry → mouth-o).
const mouthSmile = () => `<g class="mouth-smile"><path d="M66.5 82.6Q80 93.4 93.5 82.6" fill="none" ${ol(3)}/>` +
  `<path d="M64.6 81.2Q66 83.6 68 83.6M95.4 81.2Q94 83.6 92 83.6" fill="none" ${ol(2.2)}/></g>`;
const mouthOpen = () => `<g class="mouth-open"><path d="M63.2 81.5Q80 85.5 96.8 81.5Q94.8 95.5 80 95.5Q65.2 95.5 63.2 81.5Z" fill="${OUTLINE}" ${ol(2.4)}/>` +
  `<path d="M71.5 92.2Q80 86.6 88.5 92.2Q86 95 80 95Q74 95 71.5 92.2Z" fill="${FACE.tongue}"/></g>`;
const mouthO = (ctx) => `<g class="mouth-o"><ellipse cx="80" cy="${ctx.mood === 'hungry' ? 86 : 86.5}" rx="3.4" ry="4" fill="${OUTLINE}"/><ellipse cx="80" cy="87.6" rx="1.8" ry="1.3" fill="${FACE.tongue}" opacity=".8"/></g>`;

function blush(ctx, o, opacity) {
  const mythic = ctx.tier === 4;
  const color = mythic ? FACE.blushMythic : FACE.blush;
  const op = opacity ?? (mythic ? FACE.blushMythicOpacity : FACE.blushOpacity);
  return `<g class="blush" opacity="${f(op)}"><ellipse cx="50" cy="81.5" rx="6.5" ry="3.8" fill="${color}"/><ellipse cx="110" cy="81.5" rx="6.5" ry="3.8" fill="${color}"/></g>`;
}

// ---------- tier items ----------

/** Head-borne tier art (drawn in g-head, over the head fill): freckles, celestial specks, trim, prism. */
function headItems(ctx) {
  const p = ctx.palette, t = ctx.tier;
  let out = '';
  if (t === 1 || t === 2) out += [[63.5, 51], [70, 47.5], [96.5, 51], [90, 47.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${p.accent}"/>`).join('');
  if (t === 4) out += [[66, 49], [97, 52]].map(([x, y]) => star4(x, y, 4.5, WHITE, 'opacity=".7"')).join('');
  if (t === 5) out += trim('M49.5 53C57 46.5 67.5 43.8 80 43.8C92.5 43.8 103 46.5 110.5 53');
  return out;
}

/** Body tier art in g-markings: freckles on the back, the SR belly oval, Mythic specks. */
function bodyMarkings(ctx) {
  const p = ctx.palette, t = ctx.tier;
  let out = '';
  if (t === 1 || t === 2) out += [[60.5, 112], [99.5, 112]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${p.accent}"/>`).join('');
  if (t === 2) out = `<ellipse cx="80" cy="122" rx="14.5" ry="12.5" fill="${p.belly}"/><path class="thin" d="M71 117Q80 114.6 89 117M70.5 123Q80 120.6 89.5 123M72 129Q80 126.8 88 129" fill="none" stroke="${p.shade}" stroke-width="1.4" stroke-linecap="round" opacity=".5"/>` + out;
  if (t === 4) out += [[62, 112], [96, 118], [70, 132]].map(([x, y]) => star4(x, y, 4.5, WHITE, 'opacity=".7"')).join('');
  return out;
}

/** SR flower clip / Epic crystal clip on the right gill (g-occlude-front, over the fronds). */
function gillClip(ctx) {
  const t = ctx.tier;
  const [x, y] = [119, 56];
  if (t === 2) {
    const petals = [0, 72, 144, 216, 288].map((a) => {
      const [px, py] = rot([x, y - 3.1], a, [x, y]);
      return `<circle cx="${f(px)}" cy="${f(py)}" r="2.6" fill="${WHITE}" ${ol(1.6)}/>`;
    }).join('');
    return `<g class="axolotl-clip">${petals}<circle cx="${x}" cy="${y}" r="2.3" fill="#ffd34d" ${ol(1.4)}/></g>`;
  }
  if (t === 3) {
    return `<g class="axolotl-clip" ${glow(ctx, '#c9a2ff', 1.6)}><path d="M${x} ${y - 5}L${x + 4} ${y}L${x} ${y + 5}L${x - 4} ${y}Z" fill="#c9a2ff" ${ol(2)}/>` +
      `<path d="M${x} ${y - 5}L${x + 4} ${y}L${x} ${y}Z" fill="#f0e6ff"/><path d="M${x} ${y}L${x - 4} ${y}L${x} ${y + 5}Z" fill="#9c72e8"/>` +
      `<path d="M${x} ${y - 5}L${x + 4} ${y}L${x} ${y + 5}L${x - 4} ${y}Z" fill="none" ${ol(1.6)}/></g>`;
  }
  return '';
}

/** Legendary pearl on a 2 px accent cord at the neck (g-acc-body). */
function pearl(ctx) {
  if (ctx.tier !== 5) return '';
  const p = ctx.palette;
  return `<g class="axolotl-pearl"><path d="M64 99.5Q80 107.5 96 99.5" fill="none" stroke="${OUTLINE}" stroke-width="3.6" stroke-linecap="round"/>` +
    `<path d="M64 99.5Q80 107.5 96 99.5" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>` +
    `<circle cx="80" cy="108" r="6" fill="#fffbe8" ${ol(2.5)}/><circle cx="82" cy="110" r="3" fill="#ffd3ec" opacity=".8"/><circle cx="78" cy="106" r="1.6" fill="${WHITE}"/></g>`;
}

/** Bubble rings: Mythic bubble halo (6 on r 52, back) and Ultra orbiting bubbles (3 on r 50, front). */
function bubble(x, y, r) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${WHITE}" fill-opacity=".18" stroke="${WHITE}" stroke-opacity=".75" stroke-width="1.4"/>` +
    `<path d="M${f(x - r * 0.55)} ${f(y - r * 0.1)}A${f(r * 0.6)} ${f(r * 0.6)} 0 0 1 ${f(x - r * 0.05)} ${f(y - r * 0.58)}" fill="none" stroke="${WHITE}" stroke-width="1.2" stroke-linecap="round"/>`;
}
function bubbleHalo(ctx) {
  if (ctx.tier !== 4 || ctx.thumb) return '';
  const [cx, cy] = AURA_CENTER;
  const ring = Array.from({ length: 6 }, (_, i) => { const [x, y] = rot([cx, cy - 52], i * 60 + 30, [cx, cy]); return bubble(x, y, 4); }).join('');
  return `<g class="aura-spin axolotl-halo" style="--spin:30s;transform-origin:${cx}px ${cy}px">${ring}</g>`;
}
function bubbleOrbit(ctx) {
  if (ctx.tier !== 6 || ctx.thumb) return '';
  const [cx, cy] = AURA_CENTER;
  return [40, 160, 280].map((a) =>
    `<g class="aura-orbit axolotl-orbit" style="--dur:9s;--a0:${a}deg;transform-origin:${cx}px ${cy}px" transform="rotate(${a})">${bubble(cx + 50, cy, 3.6)}</g>`).join('');
}

// ---------- module ----------

export default {
  id: 'axolotl',
  name: 'Ripplegill',
  anchors: { headTop: [80, 40], brow: [80, 56], neck: [80, 98], chest: [80, 112], tailTip: [136, 104], mouth: [80, 86], accScale: 1 },
  auraCenter: AURA_CENTER,
  // Rare sparkles clear of the gill fronds (at the default offsets they sat on the gills and vanished).
  sparkles: [[24, 38], [138, 90]],
  idleClass: 'pet-idle--axolotl',

  draw(ctx) {
    const p = ctx.palette, t = ctx.tier, mood = ctx.mood;
    const starving = mood === 'starving';
    const skin = starving ? mix(p.body, WHITE, 0.3) : p.body;
    const prism = t === 6 ? prismOverlay(ctx) : '';

    // Tail: crescent with a belly fin edge and faint fin rays. Mythic: translucent, star-speckled fin.
    const mythic = t === 4;
    const finBand = `<path d="${TAIL_FIN}" fill="none" stroke="${p.belly}" stroke-width="13" stroke-linecap="round"${mythic ? ' opacity=".6"' : ''}/>` +
      (ctx.thumb ? '' : TAIL_RAYS.map((d) => `<path class="thin" d="${d}" fill="none" stroke="${p.shade}" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>`).join('')) +
      (mythic ? [[131, 116], [123, 130], [112, 137.5], [134, 107]].map(([x, y]) => star4(x, y, 4.5, WHITE)).join('') : '') + prism;
    let tail = cel(ctx, 'tail', TAIL, { fill: skin, shade: p.shade, shadeOffset: [-3, -5], inner: finBand });
    if (t === 5) tail += trim('M104 119.5C114 120.5 125 116 132 107') + flame(ctx, 137.4, 103.2, 15, 38);

    // Body + back legs (behind it), front legs in front.
    const legCel = (key, d) => cel(ctx, key, d, { fill: skin, shade: p.shade, shadeOffset: [-3, -3] });
    const body = legCel('leg-bl', LEG_BACK_L) + legCel('leg-br', LEG_BACK_R) +
      cel(ctx, 'body', BODY, { fill: skin, shade: p.shade, shadeOffset: [-6, -6], inner: prism });
    const toes = (x) => `<path class="thin" d="M${f(x - 2.4)} 147v-2.2M${f(x + 2.4)} 147v-2.2" fill="none" stroke="${OUTLINE}" stroke-width="1.6" stroke-linecap="round"/>`;
    const legs = starving ? '' : legCel('leg-fl', LEG_FRONT_L) + legCel('leg-fr', LEG_FRONT_R) + (ctx.thumb ? '' : toes(61.6) + toes(98.4));
    // Starving: the front feet are tucked up under the chin (behind the head, so only the toes show).
    const arms = starving
      ? legCel('paw-l', PAW_REST_L) + legCel('paw-r', PAW_REST_R) +
        `<path d="M54.5 119.6v-3M59.5 120.2v-3M100.5 120.2v-3M105.5 119.6v-3" fill="none" stroke="${OUTLINE}" stroke-width="1.8" stroke-linecap="round"/>`
      : '';

    // Head: cel-shaded mochi with a soft lighter muzzle (the face light), specular dot, tier items.
    const muzzle = `<ellipse cx="80" cy="88" rx="27" ry="12.5" fill="${p.belly}" opacity="${starving ? 0.4 : 0.55}"/>`;
    const head = cel(ctx, 'head', HEAD, { fill: skin, shade: p.shade, shadeOffset: [-6, -6], inner: muzzle + prism }) +
      specular(52, 52) + `<circle cx="59" cy="47.5" r="1.8" fill="${WHITE}" opacity=".8"/>` + headItems(ctx);

    // Face: small wide-set eyes, a wide smile, rosy cheeks; plus the eating whirl, cheek puff and idle bubble.
    const faceMarkup = face(ctx, {
      eyes: EYES,
      mouth: MOUTH,
      eyeSize: [11, 12],
      parts: { 'mouth-smile': mouthSmile, 'mouth-open': mouthOpen, 'mouth-wavy': mouthO, 'mouth-o': mouthO, blush },
    });
    const extras = ctx.thumb ? '' :
      `<g class="axolotl-puff" opacity="0"><ellipse cx="55" cy="85" rx="8" ry="6" fill="${PINK}" opacity=".55"/><ellipse cx="105" cy="85" rx="8" ry="6" fill="${PINK}" opacity=".55"/></g>` +
      `<g class="axolotl-whirl" opacity="0"><path d="M80 87.5c1.6 0 2.4-1.4 1.8-2.6c-.9-1.6-3.6-1.4-4.4.4c-1.1 2.4 1 5 3.8 4.8c3.6-.3 5.4-3.8 4.2-6.8c-1.5-3.8-6.6-4.8-9.6-2.2" fill="none" stroke="${WHITE}" stroke-width="1.5" stroke-linecap="round"/></g>` +
      `<g class="axolotl-bubble" opacity="0">${bubble(80, 88, 3)}</g>`;

    return {
      'aura-back': bubbleHalo(ctx),
      tail,
      body,
      legs,
      markings: bodyMarkings(ctx),
      arms,
      'acc-body': pearl(ctx),
      head,
      face: faceMarkup + extras,
      'occlude-front': gills(ctx) + gillClip(ctx),
      'aura-front': bubbleOrbit(ctx),
    };
  },

  silhouette() {
    const fronds = [-1, 1].map((side) => FRONDS.map(({ base: [bx, by], a }) => {
      const angle = side === 1 ? a : 180 - a;
      const x = side === 1 ? 160 - bx : bx;
      return `<path transform="translate(${x} ${by}) rotate(${angle})" d="${FROND}"/>`;
    }).join('')).join('');
    return `<path d="${TAIL}"/><path d="${LEG_BACK_L}"/><path d="${LEG_BACK_R}"/><path d="${BODY}"/><path d="${LEG_FRONT_L}"/><path d="${LEG_FRONT_R}"/><path d="${HEAD}"/>${fronds}`;
  },
};
