// The shared pet rig (CONTENT.md §A.1): context, primitives, default face, tier aura,
// fx layer and the SVG assembler. Pure string output: no DOM, safe to run in Node.
//
// Layer order inside every pet SVG (back to front). Required groups are `<g class="g-NAME">`
// (classes, not ids, because many pets share one page; see ARCHITECTURE.md "Pet art API"):
//
//   g-shadow · g-aura-back ·
//   .pet-float > .pet-act > .pet-mood > .pet-idle >
//       g-tail · g-wing-back ·
//       .pet-breathe > g-body g-legs g-belly g-markings g-arms g-acc-body
//       .pet-headrig > g-head g-ears g-face g-acc-brow g-cosmetic g-occlude-front
//   g-aura-front · g-fx
//
// Wrapper jobs (one transform each, so animations never fight over `transform`):
//   .pet-float  Ultra float + bob          .pet-act    triggered hops/jumps (bounce, levelup, cheer)
//   .pet-mood   starving slump + shiver     .pet-idle   species idle flourish (focus only)
//   .pet-breathe body breathing (scaleY)    .pet-headrig head breathing / hungry head drop

import { OUTLINE, OUTLINE_W, WHITE, FACE, FX, SHADOW, FIVE_STAR_RIM, TIER_NAMES, tierPalette, mix } from './palette.js';

export const VIEWBOX = '0 0 160 160';
export const GROUND_Y = 148;
export const CENTER_X = 80;
export const SIZES = Object.freeze([200, 128, 72]);
export const MOODS = Object.freeze(['healthy', 'happy', 'hungry', 'starving', 'dead', 'ashes']);
export const LIVE_MOODS = Object.freeze(['healthy', 'happy', 'hungry', 'starving']);
export const GROUPS = Object.freeze(['shadow', 'aura-back', 'tail', 'wing-back', 'body', 'legs', 'belly', 'markings', 'arms', 'acc-body',
  'head', 'ears', 'face', 'acc-brow', 'cosmetic', 'occlude-front', 'aura-front', 'fx']);
/** Groups a species draw() may return (the rig owns shadow, cosmetic and fx). */
export const SPECIES_GROUPS = Object.freeze(GROUPS.filter((g) => !['shadow', 'cosmetic', 'fx'].includes(g)));
export const FACE_CLASSES = Object.freeze(['eyes-open', 'eyes-happy', 'eyes-half', 'eyes-hollow', 'mouth-smile', 'mouth-open', 'mouth-wavy', 'mouth-o', 'tear']);
export const ANCHOR_KEYS = Object.freeze(['headTop', 'brow', 'neck', 'chest', 'back', 'hand', 'tailTip', 'mouth']);

// ---------- small helpers ----------

/** Round to 2 decimals for compact markup. */
export const f = (v) => {
  const r = Math.round(Number(v) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};
/** Escape text/attribute content. */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/** Outline stroke attributes (default 4 px #1a1530, round joins and caps). */
export const ol = (w = OUTLINE_W, color = OUTLINE) => `stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
export const OL = ol();

/** Deterministic 0..1 hash of a string (FNV-1a). Used for per-pet randomised timings. */
export function hash01(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100003) / 100003;
}

let seq = 0;
const SALT = Math.floor(Math.random() * 46656).toString(36);
/** A fresh per-render id prefix. Every gradient/filter/clip id in one SVG starts with it. */
export function newUid(prefix = 'p') {
  seq = (seq + 1) % 2147483647;
  return `${prefix}${SALT}${seq.toString(36)}`;
}

/** Rotate point (x,y) by deg around (cx,cy). */
export function rot([x, y], deg, [cx, cy]) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

// ---------- render context ----------

/**
 * Build the context handed to species.draw(ctx). Species read tier/mood/palette/size and
 * register defs (gradients, clips, filters) through ctx.defOnce so ids stay unique per render.
 */
export function makeContext({ species, tier = 0, mood = 'healthy', size = 128, stars = 1, focus = false, uid, level, name, anchors = {} } = {}) {
  const palette = tierPalette(tier);
  const defs = [];
  const seen = new Map();
  const id = uid || newUid();
  const ctx = {
    species, tier: palette.tier, mood, size, stars: Number(stars) || 1, level, name,
    thumb: size <= 72,
    focus: Boolean(focus) && size > 72,
    palette, anchors, uid: id,
    /** Unique id for this render: `${uid}-${key}`. */
    id: (key) => `${id}-${key}`,
    url: (key) => `url(#${id}-${key})`,
    /** Push raw markup into <defs>. */
    def: (markup) => { defs.push(markup); },
    /** Register a def once by key. build(fullId) → markup. Returns the full id. */
    defOnce(key, build) {
      if (!seen.has(key)) { const full = `${id}-${key}`; seen.set(key, full); defs.push(build(full)); }
      return seen.get(key);
    },
    defs,
  };
  return ctx;
}

// ---------- primitives ----------

/**
 * Cel-shaded shape (the house style): flat base fill, a lower-right shade crescent (the shape
 * filled with `shade`, covered by the base shape shifted up-left by shadeOffset), any extra inner
 * art clipped to the shape, then the 4 px outline on top.
 * key must be unique within one species draw (it names the clipPath).
 */
export function cel(ctx, key, d, { fill, shade, shadeOffset = [-6, -7], inner = '', outline = true, opacity, strokeWidth = OUTLINE_W, extra = '' } = {}) {
  // Thumbnails skip the shade crescent on minor parts (ears, paws, feet…): invisible at 72 px, and each
  // one costs a clipPath and two paths.
  if (ctx.thumb && shade && spanArea(d) < 520) shade = null;
  const shadeArt = shade ? `<path d="${d}" fill="${shade}"/><path d="${d}" fill="${fill}" transform="translate(${shadeOffset[0]} ${shadeOffset[1]})"/>` : '';
  const clip = shadeArt || inner ? ctx.defOnce(`clip-${key}`, (cid) => `<clipPath id="${cid}"><path d="${d}"/></clipPath>`) : '';
  const innerArt = shadeArt || inner ? `<g clip-path="url(#${clip})">${shadeArt}${inner}</g>` : '';
  const body = `<path d="${d}" fill="${fill}"${extra ? ' ' + extra : ''}/>${innerArt}`;
  const line = outline ? `<path d="${d}" fill="none" ${ol(strokeWidth)}/>` : '';
  return opacity != null && opacity < 1 ? `<g opacity="${opacity}">${body}${line}</g>` : `${body}${line}`;
}

/** Rough area of a path's coordinate span (absolute numbers only; used to spot minor parts). */
function spanArea(d) {
  const n = (d.match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
  if (n.length < 4 || /[a-z]/.test(d.replace(/e-?\d/g, ''))) return Infinity; // relative commands: unknown → keep
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  return (x1 - x0) * (y1 - y0);
}

/** Soft 4-point star (sparkles, Ultra eye highlights, prism motes). size = full width. */
export function star4(cx, cy, size, fill = WHITE, extra = '') {
  const s = size / 2, k = s * 0.2;
  return `<path d="M${f(cx)} ${f(cy - s)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + s)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + s)}Q${f(cx - k)} ${f(cy + k)} ${f(cx - s)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - s)}Z" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
}

/** Heart path centred at (cx,cy), size = full width. */
export function heartPath(cx, cy, size) {
  const s = size / 2;
  return `M${f(cx)} ${f(cy + s * 0.85)}C${f(cx - s * 1.25)} ${f(cy + s * 0.05)} ${f(cx - s * 0.85)} ${f(cy - s * 1.05)} ${f(cx)} ${f(cy - s * 0.4)}C${f(cx + s * 0.85)} ${f(cy - s * 1.05)} ${f(cx + s * 1.25)} ${f(cy + s * 0.05)} ${f(cx)} ${f(cy + s * 0.85)}Z`;
}

/** White specular dot (r 4, 90 %) at the top-left of the head. */
export const specular = (x, y, r = 4) => `<circle class="specular" cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${WHITE}" opacity=".9"/>`;

/** Glow filter (Epic markings etc.). Returns the attribute string `filter="url(#…)"`. */
export function glow(ctx, color = '#c9a2ff', std = 2) {
  const key = `glow-${color.replace('#', '')}-${String(std).replace('.', '_')}`;
  const gid = ctx.defOnce(key, (full) => `<filter id="${full}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="${std}" flood-color="${color}" flood-opacity="1"/></filter>`);
  return `filter="url(#${gid})"`;
}

/** Legendary flame tip (3 lobes, #ffb347 → #ff7a3d). (x,y) = flame base; size = height; angle in deg (0 = up). */
export function flame(ctx, x, y, size, angle = 0) {
  const pal = tierPalette(5);
  const gid = ctx.defOnce('flame-grad', (full) => `<linearGradient id="${full}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${pal.flame[1]}"/><stop offset="1" stop-color="${pal.flame[0]}"/></linearGradient>`);
  const s = size;
  const p = (a, b) => `${f(a * s)} ${f(b * s)}`;
  const d = `M0 0C${p(-0.5, 0)} ${p(-0.62, -0.38)} ${p(-0.42, -0.64)}C${p(-0.32, -0.52)} ${p(-0.24, -0.5)} ${p(-0.18, -0.55)}C${p(-0.2, -0.8)} ${p(-0.06, -0.95)} ${p(0, -1.08)}C${p(0.06, -0.95)} ${p(0.2, -0.8)} ${p(0.18, -0.55)}C${p(0.24, -0.5)} ${p(0.32, -0.52)} ${p(0.42, -0.64)}C${p(0.62, -0.38)} ${p(0.5, 0)} 0 0Z`;
  return `<g class="flame" transform="translate(${f(x)} ${f(y)}) rotate(${f(angle)})"><path d="${d}" fill="url(#${gid})" ${ol(2.5)}/><path d="M0 ${f(-0.12 * s)}C${p(-0.2, -0.12)} ${p(-0.2, -0.4)} 0 ${f(-0.62 * s)}C${p(0.2, -0.4)} ${p(0.2, -0.12)} 0 ${f(-0.12 * s)}Z" fill="#ffe08a"/></g>`;
}

/** Legendary trim: 1.5 px #ffe08a inner stroke along an open path (top arcs of head and back). */
export const trim = (d, color = '#ffe08a') => `<path class="trim" d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;

/**
 * Ultra prism overlay strength. CONTENT.md §A.1 Ultra row asks soft-light 40 %, which is invisible on
 * #fff3b0. Owner-review value: hard-light 40 % (pearly pink/blue tints that keep the cel shading; a
 * colour blend at 60 % mixed the blue stops into the yellow body and read lime green).
 */
export const PRISM = Object.freeze({ opacity: 0.4, blend: 'hard-light' });

/**
 * Ultra iridescent overlay. Put the returned markup INSIDE a clip (e.g. cel's `inner`).
 * A repeating gradient (drifting sideways on the focused pet, .prism-drift 6 s) blended with
 * `mix-blend-mode: hard-light` (PRISM), so the cel shading survives under pearly tints, plus one
 * white sheen stripe that sweeps across the focused pet every 4.5 s (.prism-sheen; every part's stripe
 * is in view-box units, so all of them line up as one band). Each call is one blend group, so species
 * use it on their main body + head shapes only (see the performance rule in CONTENT.md §A.1).
 */
export function prismOverlay(ctx, opacity = PRISM.opacity) {
  const stops = tierPalette(6).iridescent;
  const gid = ctx.defOnce('prism-grad', (full) => `<linearGradient id="${full}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="120" y2="0" spreadMethod="repeat">${stops.map((c, i) => `<stop offset="${f(i / (stops.length - 1))}" stop-color="${c}"/>`).join('')}</linearGradient>`);
  const sheen = ctx.thumb ? '' : `<g class="prism-sheen"><path d="M-54 168L-26 -8L-12 -8L-40 168Z" fill="${WHITE}" opacity=".55"/></g>`;
  return `<g class="prism" opacity="${opacity}" style="mix-blend-mode:${PRISM.blend}"><g transform="rotate(-30 80 80)"><g class="prism-drift"><rect x="-200" y="-60" width="400" height="280" fill="url(#${gid})"/></g></g></g>${sheen}`;
}

// ---------- face ----------

const DEFAULT_FACE = { eyeSize: [13, 17], mouthWidth: 10, blushDx: 3, blushDy: 11, blush: true };

function eyeHighlights(ctx, x, y, rx, ry, big = 3, small = 1.2) {
  const k = rx / 6.5;
  const hl = ctx.tier === 6
    ? star4(x - rx * 0.32, y - ry * 0.36, 7 * k, WHITE)
    : `<circle cx="${f(x - rx * 0.36)}" cy="${f(y - ry * 0.38)}" r="${f(big * k)}" fill="${WHITE}"/>`;
  return `${hl}<circle cx="${f(x + rx * 0.4)}" cy="${f(y + ry * 0.4)}" r="${f(small * k)}" fill="${WHITE}"/>`;
}

/** .eyes-open: 13 × 17 ovals with two highlights (Ultra: star highlight) and a tier-tinted glint. */
export function eyesOpen(ctx, eyes, [w, h] = DEFAULT_FACE.eyeSize) {
  const rx = w / 2, ry = h / 2;
  const glint = mix(ctx.palette.accent, '#ffffff', 0.15);
  return `<g class="eyes-open">${eyes.map(([x, y]) =>
    `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${FACE.eye}"/>` +
    `<ellipse cx="${f(x)}" cy="${f(y + ry * 0.5)}" rx="${f(rx * 0.6)}" ry="${f(ry * 0.28)}" fill="${glint}" opacity=".55"/>` +
    eyeHighlights(ctx, x, y, rx, ry)).join('')}</g>`;
}

/** .eyes-happy: "^^" arcs, 3 px stroke, 12 px wide (scaled with the eye width). */
export function eyesHappy(ctx, eyes, [w] = DEFAULT_FACE.eyeSize) {
  const hw = (w / 13) * 6;
  return `<g class="eyes-happy">${eyes.map(([x, y]) =>
    `<path d="M${f(x - hw)} ${f(y + 2.5)}Q${f(x)} ${f(y - hw * 1.15)} ${f(x + hw)} ${f(y + 2.5)}" fill="none" ${ol(3.5)}/>`).join('')}</g>`;
}

/** .eyes-half: eye with a flat upper lid in the tier shade covering the top 45 %, plus worried brows. */
export function eyesHalf(ctx, eyes, [w, h] = DEFAULT_FACE.eyeSize) {
  const rx = w / 2, ry = h / 2;
  // Thumbnails (72 px) exaggerate the worried look so hungry still reads at ~1 px per unit.
  const T = ctx.thumb ? { cover: 0.5, lid: 3.5, browLen: 11, browW: 4, tilt: 24 } : { cover: 0.45, lid: 2.5, browLen: 8, browW: 3, tilt: 20 };
  const cut = -ry + T.cover * 2 * ry; // y offset of the lid line from the eye centre
  const half = rx * Math.sqrt(1 - (cut / ry) ** 2);
  const lid = ctx.palette.shade;
  const bh = (T.browLen / 2) * Math.cos((T.tilt * Math.PI) / 180), bv = (T.browLen / 2) * Math.sin((T.tilt * Math.PI) / 180);
  const out = eyes.map(([x, y], i) => {
    const inner = i === 0 ? 1 : -1; // direction toward the face centre
    const by = y - ry - 4.5, bx = x + inner * 1;
    const brow = `<path d="M${f(bx - bh * inner)} ${f(by + bv)}L${f(bx + bh * inner)} ${f(by - bv)}" fill="none" ${ol(T.browW)}/>`;
    return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${FACE.eye}"/>` +
      `<path d="M${f(x - rx - 0.6)} ${f(y + cut)}L${f(x - half)} ${f(y + cut)}A${f(rx + 0.6)} ${f(ry + 0.6)} 0 0 1 ${f(x + half)} ${f(y + cut)}L${f(x + rx + 0.6)} ${f(y + cut)}A${f(rx + 0.6)} ${f(ry + 0.6)} 0 0 0 ${f(x - rx - 0.6)} ${f(y + cut)}Z" fill="${lid}"/>` +
      `<path d="M${f(x - rx - 0.5)} ${f(y + cut)}L${f(x + rx + 0.5)} ${f(y + cut)}" ${ol(T.lid)}/>` +
      (ctx.thumb ? '' : `<circle cx="${f(x + rx * 0.35)}" cy="${f(y + ry * 0.45)}" r="1.4" fill="${WHITE}"/>`) + brow;
  }).join('');
  return `<g class="eyes-half">${out}</g>`;
}

/** .eyes-hollow: small 9 × 11 eyes, a 1.5 px highlight and an under-eye arc in shade. */
export function eyesHollow(ctx, eyes) {
  return `<g class="eyes-hollow">${eyes.map(([x, y]) =>
    `<ellipse cx="${f(x)}" cy="${f(y + 1)}" rx="4.5" ry="5.5" fill="${FACE.eye}"/>` +
    `<circle cx="${f(x - 1.4)}" cy="${f(y - 1)}" r="1.5" fill="${WHITE}"/>` +
    `<path d="M${f(x - 5)} ${f(y + 9)}Q${f(x)} ${f(y + 12)} ${f(x + 5)} ${f(y + 9)}" fill="none" stroke="${ctx.palette.shade}" stroke-width="2" stroke-linecap="round"/>`).join('')}</g>`;
}

export function mouthSmile(ctx, [x, y], w = 10) {
  const h = w / 2;
  return `<g class="mouth-smile"><path d="M${f(x - h)} ${f(y - 2)}Q${f(x)} ${f(y + 6.5)} ${f(x + h)} ${f(y - 2)}" fill="none" ${ol(3)}/></g>`;
}
export function mouthOpen(ctx, [x, y], w = 12) {
  const h = w / 2;
  return `<g class="mouth-open"><path d="M${f(x - h)} ${f(y - 2.5)}L${f(x + h)} ${f(y - 2.5)}Q${f(x + h)} ${f(y + 5.5)} ${f(x)} ${f(y + 5.5)}Q${f(x - h)} ${f(y + 5.5)} ${f(x - h)} ${f(y - 2.5)}Z" fill="${OUTLINE}" ${ol(2)}/>` +
    `<ellipse cx="${f(x)}" cy="${f(y + 3.1)}" rx="3" ry="1.6" fill="${FACE.tongue}"/></g>`;
}
export function mouthWavy(ctx, [x, y], w = 12) {
  const s = w / 6;
  const [amp, sw] = ctx.thumb ? [3.4, 3.2] : [2.6, 2.6];
  return `<g class="mouth-wavy"><path d="M${f(x - 3 * s)} ${f(y)}Q${f(x - 2 * s)} ${f(y - amp)} ${f(x - s)} ${f(y)}Q${f(x)} ${f(y + amp)} ${f(x + s)} ${f(y)}Q${f(x + 2 * s)} ${f(y - amp)} ${f(x + 3 * s)} ${f(y)}" fill="none" ${ol(sw)}/></g>`;
}
export const mouthO = (ctx, [x, y]) => `<g class="mouth-o"><ellipse cx="${f(x)}" cy="${f(y + 1)}" rx="2.5" ry="3" fill="${OUTLINE}"/></g>`;

/** .tear: a 4 × 6 drop under the left eye (slides down 2 s on repeat). */
export function tear(ctx, [x, y]) {
  return `<g class="tear"><path d="M${f(x)} ${f(y - 3.4)}C${f(x + 2.4)} ${f(y - 0.4)} ${f(x + 2.4)} ${f(y + 3)} ${f(x)} ${f(y + 3)}C${f(x - 2.4)} ${f(y + 3)} ${f(x - 2.4)} ${f(y - 0.4)} ${f(x)} ${f(y - 3.4)}Z" fill="${FACE.tear}" ${ol(1.2)}/><circle cx="${f(x - 0.7)}" cy="${f(y + 0.6)}" r=".8" fill="${WHITE}"/></g>`;
}

export function blush(ctx, eyes, { dx = DEFAULT_FACE.blushDx, dy = DEFAULT_FACE.blushDy, opacity } = {}) {
  const mythic = ctx.tier === 4;
  const color = mythic ? FACE.blushMythic : FACE.blush;
  const op = opacity ?? (mythic ? FACE.blushMythicOpacity : FACE.blushOpacity);
  const [[x1, y1], [x2, y2]] = eyes;
  return `<g class="blush" opacity="${f(op)}"><ellipse cx="${f(x1 - dx)}" cy="${f(y1 + dy)}" rx="5" ry="3" fill="${color}"/><ellipse cx="${f(x2 + dx)}" cy="${f(y2 + dy)}" rx="5" ry="3" fill="${color}"/></g>`;
}

/** The default part builders. A species may override any of them via face(ctx, { parts: { 'mouth-open': fn } }). */
export const FACE_PARTS = Object.freeze({
  'eyes-open': (ctx, o) => eyesOpen(ctx, o.eyes, o.eyeSize),
  'eyes-happy': (ctx, o) => eyesHappy(ctx, o.eyes, o.eyeSize),
  'eyes-half': (ctx, o) => eyesHalf(ctx, o.eyes, o.eyeSize),
  'eyes-hollow': (ctx, o) => eyesHollow(ctx, o.eyes),
  'mouth-smile': (ctx, o) => mouthSmile(ctx, o.mouth, o.mouthWidth),
  'mouth-open': (ctx, o) => mouthOpen(ctx, o.mouth, (o.mouthWidth || 10) * 1.2),
  'mouth-wavy': (ctx, o) => mouthWavy(ctx, o.mouth, (o.mouthWidth || 10) * 1.2),
  'mouth-o': (ctx, o) => mouthO(ctx, o.mouth),
  tear: (ctx, o) => tear(ctx, [o.eyes[0][0] - 4, o.eyes[0][1] + 9]),
  blush: (ctx, o, opacity) => (o.blush === false ? '' : blush(ctx, o.eyes, { dx: o.blushDx, dy: o.blushDy, opacity })),
});

/** Which parts make up each mood's face (CONTENT.md §A.1 "Default faces per mood"). */
export const MOOD_FACE = Object.freeze({
  healthy: { eyes: 'eyes-open', mouth: 'mouth-smile', blush: null },
  happy: { eyes: 'eyes-happy', mouth: 'mouth-open', blush: FACE.blushHappyOpacity },
  hungry: { eyes: 'eyes-half', mouth: 'mouth-wavy', blush: 0.22 },
  starving: { eyes: 'eyes-hollow', mouth: 'mouth-o', blush: 0, tear: true },
});

/**
 * Default face. o = { eyes: [[x,y],[x,y]], mouth: [x,y], eyeSize?: [w,h], mouthWidth?, blush?: false,
 * blushDx?, blushDy?, parts?: { [faceClass|'blush']: (ctx, o, opacity?) => markup }, extra?: { [mood]: markup } }.
 * Output: the current mood face in `.face-mood` (or `.face-happy` when happy), plus a hidden
 * `.face-happy.face-react` copy that CSS shows during bounce/eat/levelup/cheer.
 */
export function face(ctx, o) {
  const parts = { ...FACE_PARTS, ...(o.parts || {}) };
  const build = (m) => {
    const spec = MOOD_FACE[m] || MOOD_FACE.healthy;
    const b = m === 'healthy' ? parts.blush(ctx, o) : spec.blush ? parts.blush(ctx, o, spec.blush) : '';
    return b + parts[spec.eyes](ctx, o) + parts[spec.mouth](ctx, o) + (spec.tear ? parts.tear(ctx, o) : '') + (o.extra?.[m] || '');
  };
  const mood = MOOD_FACE[ctx.mood] ? ctx.mood : 'healthy';
  if (mood === 'happy') return `<g class="face-happy">${build('happy')}</g>`;
  // Thumbnails keep their mood face through triggered animations (no hidden happy copy: smaller markup).
  if (ctx.thumb) return `<g class="face-mood face-${mood}">${build(mood)}</g>`;
  return `<g class="face-mood face-${mood}">${build(mood)}</g><g class="face-happy face-react" display="none">${build('happy')}</g>`;
}

// ---------- ground shadow ----------

export function shadow(ctx) {
  const ultra = ctx.tier === 6;
  return `<ellipse class="pet-shadow" cx="${SHADOW.cx}" cy="${SHADOW.cy}" rx="${ultra ? SHADOW.ultraRx : SHADOW.rx}" ry="${SHADOW.ry}" fill="${SHADOW.color}" opacity="${ultra ? SHADOW.ultraOpacity : SHADOW.opacity}"/>`;
}

// ---------- tier aura (shared ladder; pets and eggs) ----------

const orbit = (cls, [cx, cy], r, deg, dur, inner) =>
  `<g class="${cls}" style="--dur:${dur}s;--a0:${deg}deg;transform-origin:${cx}px ${cy}px" transform="rotate(${deg})">${inner(cx + r, cy)}</g>`;

/**
 * Tier aura for a centre point. Returns { back, front } markup.
 * Static by default; CSS animates `.aura-*` only inside `.pet--focus` / `.egg--live`.
 * Thumbnails (ctx.thumb) get the static ring: r 66, 3 px, tier body colour.
 */
export const DEFAULT_SPARKLES = Object.freeze([[-46, -40], [47, -22]]); // Rare sparkles, offsets from the aura centre

export function aura(ctx, [cx, cy] = [80, 92], { groundY = 149, sparkles } = {}) {
  const t = ctx.tier, p = ctx.palette;
  if (t === 0) return { back: '', front: '' };
  // Thumbnail ring sits at a fixed centre so it stays inside the 160 box for every species.
  if (ctx.thumb) return { back: `<circle class="aura-ring-static" cx="80" cy="90" r="66" fill="none" stroke="${p.body}" stroke-width="3"/>`, front: '' };
  // Motes: a soft light (belly → body → clear) round a white core, so they read as light on the dark page.
  const moteGlow = ctx.defOnce('mote-glow', (full) => `<radialGradient id="${full}"><stop offset="0" stop-color="${p.belly}" stop-opacity=".85"/><stop offset=".45" stop-color="${p.body}" stop-opacity=".45"/><stop offset="1" stop-color="${p.body}" stop-opacity="0"/></radialGradient>`);
  const mote = (color, r = 3) => (x, y) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 2.6)}" fill="url(#${moteGlow})"/><circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${color}"/>`;
  const motes = (n, r, dur, color, size = 3) => Array.from({ length: n }, (_, i) =>
    orbit('aura-orbit', [cx, cy], r, Math.round((360 / n) * i + 20), dur, mote(color, size))).join('');
  const halo = (key, color, op) => {
    const gid = ctx.defOnce(key, (full) => `<radialGradient id="${full}"><stop offset="0" stop-color="${color}" stop-opacity="${op}"/><stop offset=".6" stop-color="${color}" stop-opacity="${f(op * 0.45)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`);
    return `<g class="aura-pulse" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="70" fill="url(#${gid})"/></g>`;
  };
  // Sun rays: 12 light triangles, base on r 38 (just outside the body) and the tip on r 70 / r 56
  // alternately (a game-like burst), fading outward. 12 rays at 30° spin once per 40 s.
  const rays = (colors, opacity, spin) => {
    const fades = colors.map((c, i) => ctx.defOnce(`ray-${i}`, (full) => `<radialGradient id="${full}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="70"><stop offset="0" stop-color="${c}" stop-opacity="1"/><stop offset=".55" stop-color="${c}" stop-opacity=".75"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`));
    const tri = Array.from({ length: 12 }, (_, i) => {
      const a = i * 30, long = i % 2 === 0;
      const hw = long ? 8 : 5.5;
      const pts = [[cx - hw, cy - 38], [cx + hw, cy - 38], [cx, cy - (long ? 70 : 56)]].map((pt) => rot(pt, a, [cx, cy]));
      return `<path d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z" fill="url(#${fades[i % fades.length]})"/>`;
    }).join('');
    return `<g class="aura-spin" style="--spin:${spin}s;transform-origin:${cx}px ${cy}px" opacity="${opacity}">${tri}</g>`;
  };
  if (t === 1) {
    // Species with wide heads (gills, spines) pass their own sparkle points (module field `sparkles`).
    const pts = sparkles || DEFAULT_SPARKLES.map(([dx, dy]) => [cx + dx, cy + dy]);
    const sp = ([x, y], d) => `<g class="aura-twinkle" style="--d:${d}s">${star4(x, y, 9, WHITE, `stroke="${OUTLINE}" stroke-width="1" stroke-opacity=".5" stroke-linejoin="round"`)}</g>`;
    return { back: '', front: sp(pts[0], 0) + sp(pts[1], 0.6) };
  }
  if (t === 2) {
    const gid = ctx.defOnce('ground-glow', (full) => `<radialGradient id="${full}"><stop offset="0" stop-color="${p.body}" stop-opacity=".35"/><stop offset=".7" stop-color="${p.body}" stop-opacity=".28"/><stop offset="1" stop-color="${p.body}" stop-opacity="0"/></radialGradient>`);
    return { back: `<ellipse class="aura-glow" cx="80" cy="${groundY}" rx="45" ry="7" fill="url(#${gid})"/>`, front: '' };
  }
  if (t === 3) {
    return {
      back: `<g class="aura-spin" style="--spin:20s;transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="64" fill="none" stroke="${p.accent}" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round" opacity=".5"/></g>`,
      front: motes(2, 60, 6, WHITE),
    };
  }
  if (t === 4) return { back: halo('halo', p.body, 0.45), front: motes(4, 60, 6, WHITE) };
  if (t === 5) {
    // Legendary: a warm glow behind light rays (#fff1c2), 6 motes.
    const warm = ctx.defOnce('warm-glow', (full) => `<radialGradient id="${full}"><stop offset="0" stop-color="#ffe08a" stop-opacity=".32"/><stop offset=".6" stop-color="#ffe08a" stop-opacity=".14"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient>`);
    return { back: `<circle class="aura-warm" cx="${cx}" cy="${cy}" r="58" fill="url(#${warm})"/>` + rays(['#fff1c2'], 0.7, 40), front: motes(6, 62, 7, WHITE, 2.6) };
  }
  // Ultra: halo + alternating rays, 8 prism motes rising.
  const irid = p.iridescent;
  const rise = Array.from({ length: 8 }, (_, i) => {
    const x = 26 + ((i * 37) % 108), y = 120 - ((i * 23) % 70);
    return `<g class="aura-rise" style="--d:${f(i * 0.55)}s">${star4(x, y, 5 + (i % 3), irid[(i % 4) + 1], 'opacity=".9"')}</g>`;
  }).join('');
  return { back: halo('halo', '#fff3b0', 0.5) + rays(['#fff3b0', '#ffd3ec'], 0.7, 40), front: rise };
}

// ---------- fx layer (hearts, growl, level-up, eating, hop trail) ----------

export function fx(ctx, anchors, auraCenter = [80, 92]) {
  if (ctx.thumb) return '';
  const [hx, hy] = anchors.headTop || [80, 34];
  const [mx, my] = anchors.mouth || [80, (anchors.brow?.[1] ?? 60) + 30];
  const chest = anchors.chest || [80, 110];
  const p = ctx.palette;
  // Hearts float beside the head (clear of ears, horns, gills and any hat); they rise 24 px when animated.
  const clampX = (x) => Math.max(12, Math.min(148, x));
  const hearts = [[hx - 44, hy + 20, 0], [hx + 44, hy + 12, 0.35], [hx + 34, Math.max(30, hy - 8), 0.7]].map(([x0, y, d], i) => {
    const x = clampX(x0);
    return `<g class="fx-heart" style="--d:${d}s;--i:${i}"><path d="${heartPath(x, y, 10.5)}" fill="${FACE.heart}" ${ol(1.5)}/><circle cx="${f(x - 2.1)}" cy="${f(y - 1.6)}" r="1.2" fill="${WHITE}"/></g>`;
  }).join('');
  // Tummy rumble: a short wave centred on the belly, with a pale underlay so it reads on light bellies.
  const growlD = `M${f(chest[0] - 9)} ${f(chest[1] + 12)}q3 -4 6 0t6 0t6 0`;
  const growl = ctx.mood === 'hungry'
    ? `<g class="fx-growl"><path d="${growlD}" fill="none" stroke="${WHITE}" stroke-width="5.5" stroke-linecap="round" opacity=".35"/><path d="${growlD}" fill="none" stroke="${FACE.growl}" stroke-width="2.5" stroke-linecap="round" opacity=".75"/></g>` : '';
  const [cx, cy] = auraCenter;
  const sparkles = Array.from({ length: 6 }, (_, i) => {
    const x = cx - 40 + i * 16 + (i % 2 ? 4 : -4), y = cy + 30 - (i % 3) * 14;
    return `<g class="fx-sparkle" style="--i:${i}">${star4(x, y, 9, WHITE)}</g>`;
  }).join('');
  const lvText = ctx.level != null ? `Lv ${ctx.level}` : 'Lv up';
  const pw = 14 + lvText.length * 7.6;
  const pillY = Math.max(4, hy - 22);
  const levelup = `<g class="fx-levelup"><circle class="fx-ring" cx="${cx}" cy="${cy}" r="70" fill="none" stroke="${p.body}" stroke-width="4" style="transform-origin:${cx}px ${cy}px"/>${sparkles}` +
    `<g class="fx-pill" style="transform-origin:${hx}px ${pillY + 9}px"><rect x="${f(hx - pw / 2)}" y="${pillY}" width="${f(pw)}" height="18" rx="9" fill="${FX.pill}" ${ol(2)}/>` +
    `<text x="${hx}" y="${pillY + 13.5}" text-anchor="middle" font-size="14" font-weight="700" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" fill="${FX.pillText}">${esc(lvText)}</text></g></g>`;
  const crumbs = [[-5, 3], [2, 5], [6, 2]].map(([dx, dy], i) =>
    `<circle class="fx-crumb" style="--i:${i}" cx="${f(mx + dx)}" cy="${f(my + dy)}" r="2" fill="${p.belly}" ${ol(1)}/>`).join('');
  // Food orb: an 18-unit soft star with a glow, trailed by 3 fading dots that follow the same arc.
  const orbGlow = ctx.defOnce('orb-glow', (full) => `<radialGradient id="${full}"><stop offset="0" stop-color="${FX.orb}" stop-opacity=".7"/><stop offset="1" stop-color="${FX.orb}" stop-opacity="0"/></radialGradient>`);
  const orbTrail = [[2, 0.4], [2, 0.25], [1.5, 0.12]].map(([r, o], i) =>
    `<g class="fx-orb fx-orb-trail" style="--i:${i + 1}"><circle r="${r}" fill="${FX.orb}" fill-opacity="${o}"/></g>`).join('');
  const eat = `<g class="fx-eat"><g transform="translate(${f(mx)} ${f(my)})">${orbTrail}<g class="fx-orb"><circle r="9" fill="url(#${orbGlow})"/>${star4(0, 0, 18, FX.orb, ol(1.5))}<circle r="3.2" fill="${WHITE}" opacity=".3"/><circle r="1.7" fill="${WHITE}"/></g></g>${crumbs}</g>`;
  const trail = ctx.tier >= 4
    ? `<g class="fx-trail">${[[52, 140], [66, 146], [96, 145], [110, 139]].map(([x, y], i) => `<g style="--i:${i}">${star4(x, y, 7, i % 2 ? p.belly : WHITE)}</g>`).join('')}</g>` : '';
  return `<g class="fx-hearts">${hearts}</g>${growl}${levelup}${eat}${trail}`;
}

// ---------- filters owned by the rig ----------

export function starveFilter(ctx) {
  return ctx.defOnce('starve', (full) => `<filter id="${full}" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values=".35"/><feComponentTransfer><feFuncR type="linear" slope=".85"/><feFuncG type="linear" slope=".85"/><feFuncB type="linear" slope=".85"/></feComponentTransfer></filter>`);
}

/**
 * Rim light just inside the 4 px outline, following every animation. The alpha edge is the outer edge of
 * the outline, which runs 0–4 units inward, so the band sits 4 → 4 + width units in.
 * The inset uses a round kernel (blur SourceAlpha, then threshold) instead of feMorphology, whose
 * square kernel flattens curves and scallops into straight steps at these radii. On a straight edge the
 * blurred alpha at depth x is Φ(x/σ), so thresholds Φ(4/σ) and Φ((4 + w)/σ) give the band.
 * 5★: a 1.5 px #ffe08a band. Ultra: a 2 px iridescent band (soft strips of the prism colours).
 * Region -5 %/110 % of the .pet-idle box (the Ultra float is a transform above it, so it is covered).
 */
const PHI = (z) => { // standard normal CDF (Abramowitz–Stegun 7.1.26 via erf)
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
};
export function rimFilter(ctx, kind = 'gold') {
  const prism = kind === 'prism';
  const w = prism ? 2 : 1.5, sigma = 3, k = 60;
  const step = (depth, result) => {
    const t = PHI(depth / sigma);
    return `<feComponentTransfer in="bl" result="${result}"><feFuncA type="linear" slope="${k}" intercept="${f(-k * t)}"/></feComponentTransfer>`;
  };
  let fill = `<feFlood flood-color="${FIVE_STAR_RIM}" result="fill"/>`;
  if (prism) {
    const [c0, c1, c2, c3] = tierPalette(6).iridescent;
    fill = `<feFlood flood-color="${c1}" x="-20" y="-20" width="200" height="200" result="f0"/>` +
      `<feFlood flood-color="${c2}" x="50" y="-20" width="30" height="200" result="f1"/><feFlood flood-color="${c3}" x="92" y="-20" width="26" height="200" result="f2"/>` +
      `<feFlood flood-color="${c0}" x="128" y="-20" width="60" height="200" result="f3"/><feFlood flood-color="${c0}" x="-20" y="-20" width="44" height="200" result="f4"/>` +
      `<feMerge result="strips"><feMergeNode in="f0"/><feMergeNode in="f1"/><feMergeNode in="f2"/><feMergeNode in="f3"/><feMergeNode in="f4"/></feMerge>` +
      `<feGaussianBlur in="strips" stdDeviation="9 0" result="fill"/>`;
  }
  return ctx.defOnce(prism ? 'rim-prism' : 'rim', (full) => `<filter id="${full}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="${sigma}" result="bl"/>${step(4, 'a')}${step(4 + w, 'b')}` +
    `<feComposite in="a" in2="b" operator="out" result="band"/>${fill}` +
    `<feComposite in="fill" in2="band" operator="in" result="rim"/>` +
    `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="rim"/></feMerge></filter>`);
}

// ---------- assembly ----------

const g = (name, inner = '') => `<g class="g-${name}">${inner}</g>`;

/** Root <svg> wrapper shared by pets, eggs, graves, ashes and silhouettes. */
export function svgRoot({ size = 128, classes = [], style = '', label = '', defs = [], body = '' }) {
  const s = Number(size) || 128;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" width="${s}" height="${s}" class="${classes.filter(Boolean).join(' ')}"` +
    `${style ? ` style="${style}"` : ''} role="img" aria-label="${esc(label)}" focusable="false" overflow="visible">` +
    `${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}</svg>`;
}

/**
 * Assemble a live pet from the species' groups.
 * sp: species module; parts: the object sp.draw(ctx) returned; opts: { cosmetic markup, classes, label, animate }.
 */
export function assemblePet(ctx, sp, parts, { cosmetic = '', cosmeticId = '', classes = [], label = '', animate = true, overlay = '' } = {}) {
  const P = (k) => (typeof parts[k] === 'string' ? parts[k] : '');
  const anchors = { ...sp.anchors, ...(ctx.anchors || {}) };
  const center = sp.auraCenter || [80, 92];
  const au = aura(ctx, center, { sparkles: sp.sparkles });
  const h = (k) => hash01(`${ctx.uid}:${ctx.name || ''}:${k}`);
  const style = [
    `--blink-every:${f(4 + 3 * h('b'))}s`, `--blink-delay:${f(-7 * h('bd'))}s`,
    `--idle-every:${f(8 + 4 * h('i'))}s`, `--idle-delay:${f(1.5 + 4 * h('id'))}s`,
    `--breathe-delay:${f(-3.6 * h('br'))}s`,
  ].join(';');
  const ultra = ctx.tier === 6;
  // Rim light (5★ gold, Ultra prism; 5★ wins on an Ultra) only above thumbnail size: at 72 px it is
  // sub-pixel and the filter is the most expensive thing on the page.
  const rimKind = ctx.thumb ? '' : ctx.stars >= 5 ? 'gold' : ultra ? 'prism' : '';
  const rim = rimKind ? ` filter="url(#${rimFilter(ctx, rimKind)})"` : '';
  const starve = ctx.mood === 'starving' ? ` filter="url(#${starveFilter(ctx)})"` : '';
  const [hx, hy] = anchors.headTop || [80, 34];
  const accScale = anchors.accScale || 1;
  const cos = cosmetic ? `<g transform="translate(${hx} ${hy}) scale(${accScale})" data-cosmetic="${esc(cosmeticId)}">${cosmetic}</g>` : '';
  const body =
    g('shadow', shadow(ctx)) +
    g('aura-back', au.back + P('aura-back')) +
    `<g class="pet-float"${ultra ? ' transform="translate(0 -4)"' : ''}><g class="pet-act"><g class="pet-mood"${starve}>` +
    `<g class="pet-idle ${sp.idleClass || ''}"${rim}>` +
    g('tail', P('tail')) + g('wing-back', P('wing-back')) +
    `<g class="pet-breathe">${g('body', P('body'))}${g('legs', P('legs'))}${g('belly', P('belly'))}${g('markings', P('markings'))}${g('arms', P('arms'))}${g('acc-body', P('acc-body'))}</g>` +
    `<g class="pet-headrig">${g('head', P('head'))}${g('ears', P('ears'))}${g('face', P('face'))}${g('acc-brow', P('acc-brow'))}${g('cosmetic', cos)}${g('occlude-front', P('occlude-front'))}</g>` +
    `</g></g></g></g>` +
    g('aura-front', au.front + P('aura-front')) +
    g('fx', fx(ctx, anchors, center) + P('fx')) + overlay;
  const cls = ['pet', `pet--${sp.id}`, `pet--tier-${ctx.tier}`, `pet--${ctx.palette.key}`, `pet--mood-${ctx.mood}`, `pet--s${ctx.size}`,
    ctx.thumb && 'pet--thumb', ctx.focus && 'pet--focus', ctx.stars >= 5 && 'pet--5star', rimKind && 'pet--rim', !animate && 'pet--still', ...classes];
  return svgRoot({ size: ctx.size, classes: cls, style, label, defs: ctx.defs, body });
}

export { TIER_NAMES };
