// Dead (gravestone) and Phoenix (ashes nest) states. CONTENT.md §A.1 "Dead and ashes".
// Both take the species silhouette markup (paths in the 160 viewBox, no fill) from the species module.

import { makeContext, svgRoot, cel, ol, f, esc, star4 } from './rig.js';
import { GRAVE, ASHES, OUTLINE, tierPalette, TIER_NAMES } from './palette.js';

/** Fit a 160-box silhouette into a box of `height` px centred at (cx, cy). The character box is y 28–148. */
const fit = (cx, cy, height) => `translate(${f(cx)} ${f(cy)}) scale(${f(height / 120)}) translate(-80 -88)`;

const flower = (x, y) => {
  const petals = [0, 72, 144, 216, 288].map((a) => {
    const r = (a * Math.PI) / 180;
    return `<circle cx="${f(x + Math.sin(r) * 2.6)}" cy="${f(y - Math.cos(r) * 2.6)}" r="2.1" fill="${GRAVE.flowerPetal}"/>`;
  }).join('');
  return `<path d="M${x} ${y + 2}Q${x - 1} ${y + 6} ${x} ${y + 9}" fill="none" stroke="${GRAVE.grass}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M${x} ${y + 6}q3 -3 5 -2" fill="none" stroke="${GRAVE.grass}" stroke-width="1.4" stroke-linecap="round"/>${petals}<circle cx="${x}" cy="${y}" r="1.6" fill="${GRAVE.flowerCentre}"/>`;
};

/**
 * Gravestone: rounded stone 64 × 76 centred at (80, 110), carved species silhouette (32 px),
 * name and "Lv N" engraved in 10 px #c2bad0, two grey flowers, a 2 px #5c5675 highlight on the top
 * arc (the cel language of the pets). No motion.
 * Thumbnails (≤ 72 px): no text (it would be ~4 px noise), a bigger 72 × 84 stone and a 44 px carving.
 */
export function renderGrave({ species = 'slime', speciesName = '', silhouette = '', name = '', level, tier = 0, size = 128, uid, className = '' } = {}) {
  const ctx = makeContext({ species, tier, mood: 'dead', size, uid });
  const thumb = size <= 72;
  const stone = thumb ? 'M44 148L44 96C44 77 60 64 80 64C100 64 116 77 116 96L116 148Z' : 'M48 148L48 100C48 83 62 72 80 72C98 72 112 83 112 100L112 148Z';
  const topArc = thumb ? 'M52 92C53 79.5 65 70 80 70C95 70 107 79.5 108 92' : 'M54 96C54.5 84.5 65 77.5 80 77.5C95 77.5 105.5 84.5 106 96';
  const carve = thumb ? [80, 108, 44] : [80, 96, 32];
  const nm = thumb ? '' : String(name || '').slice(0, 14);
  const fitText = nm.length > 9 ? ` textLength="56" lengthAdjust="spacingAndGlyphs"` : '';
  const font = `font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="10" text-anchor="middle"`;
  const body =
    `<ellipse class="pet-shadow" cx="80" cy="149" rx="40" ry="5" fill="#000" opacity=".3"/>` +
    `<path d="M34 149C40 141 58 139 80 139C102 139 120 141 126 149Z" fill="${GRAVE.grass}" ${ol(3)}/>` +
    cel(ctx, 'stone', stone, { fill: GRAVE.stone, shade: GRAVE.shade, shadeOffset: [-9, 0],
      inner: `<path class="grave-highlight" d="${topArc}" fill="none" stroke="#5c5675" stroke-width="2" stroke-linecap="round"/>` }) +
    (thumb ? '' : `<path d="M104 82l-4 6l3 3l-3 6" fill="none" stroke="${GRAVE.shade}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`) +
    (silhouette
      ? `<g class="grave-carving"><g transform="${fit(carve[0] + 0.8, carve[1] + 0.8, carve[2])}" fill="#5b5672">${silhouette}</g><g transform="${fit(...carve)}" fill="${GRAVE.carve}">${silhouette}</g></g>`
      : '') +
    (nm ? `<text x="80" y="124" ${font} fill="${GRAVE.text}"${fitText}>${esc(nm)}</text>` : '') +
    (level != null && !thumb ? `<text x="80" y="136" ${font} fill="${GRAVE.text}">Lv ${esc(level)}</text>` : '') +
    flower(55, 140) + flower(107, 141) +
    `<path d="M40 148q2 -6 4 0M46 148q1 -5 3 0M114 148q2 -6 4 0M119 148q1 -4 3 0" fill="none" stroke="${GRAVE.grass}" stroke-width="1.6" stroke-linecap="round"/>`;
  const label = `${name ? `${name}, ` : ''}${speciesName || species}, gravestone${level != null ? `, level ${level}` : ''}`;
  return svgRoot({ size, classes: ['pet', 'pet--grave', `pet--${species}`, `pet--tier-${ctx.tier}`, 'pet--mood-dead', `pet--s${size}`, size <= 72 && 'pet--thumb', className], label, defs: ctx.defs, body });
}

/** Arc path on a circle (degrees, 0 = up, clockwise). */
function arc(cx, cy, r, a0, a1) {
  const pt = (a) => { const t = ((a - 90) * Math.PI) / 180; return `${f(cx + r * Math.cos(t))} ${f(cy + r * Math.sin(t))}`; };
  return `M${pt(a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(a1)}`;
}

/**
 * Ashes nest for the Phoenix-eligible pet: nest, rim of 5 ash lumps, species medallion in the tier
 * colour, 5 pulsing coals, a rising smoke wisp shaped like the species, and a 3-segment progress ring
 * (one segment per consecutive complete day; `done` 0–3).
 */
export function renderAshes({ species = 'slime', speciesName = '', silhouette = '', name = '', tier = 0, done = 0, size = 128, uid, animate = true, className = '' } = {}) {
  const ctx = makeContext({ species, tier, mood: 'ashes', size, uid });
  const p = tierPalette(tier);
  const n = Math.max(0, Math.min(ASHES.segments, Math.floor(Number(done) || 0)));
  // Progress: an arch over the nest (top arc only, r 42 round (80, 112)), 3 segments that fill left →
  // right, so every segment is always visible (a full ring hid the bottom one behind the nest).
  const ring = [0, 1, 2].map((i) => {
    const a0 = -110 + i * 76, a1 = a0 + 68;
    const on = i < n;
    return `<path d="${arc(80, 112, 42, a0, a1)}" fill="none" stroke="${OUTLINE}" stroke-width="7" stroke-linecap="round" opacity=".6"/>` +
      `<path class="ash-seg${on ? ' ash-seg--on' : ''}" d="${arc(80, 112, 42, a0, a1)}" fill="none" stroke="${on ? p.body : ASHES.empty}" stroke-width="4" stroke-linecap="round"/>`;
  }).join('');
  const glowId = ctx.defOnce('coal-glow', (full) => `<radialGradient id="${full}"><stop offset="0" stop-color="${p.body}" stop-opacity=".5"/><stop offset="1" stop-color="${p.body}" stop-opacity="0"/></radialGradient>`);
  // Embers scattered irregularly through the ash (not a row), sizes 2.5–3.5.
  const coals = [[62, 136, 3], [72, 142, 2.5], [84, 139, 3.5], [95, 143, 2.6], [101, 135, 3.1]].map(([x, y, r], i) =>
    `<g class="ash-coal" style="--i:${i}"><circle cx="${x}" cy="${y}" r="${r}" fill="${p.body}" ${ol(1.2)}/><circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.3)}" r="${f(r * 0.3)}" fill="#fff" opacity=".8"/></g>`).join('');
  // One shared ember glow behind the nest, pulsing with the coals.
  const emberGlow = `<ellipse class="ash-glow" cx="80" cy="136" rx="34" ry="12" fill="url(#${glowId})"/>`;
  const medGlow = ctx.defOnce('med-glow', (full) => `<radialGradient id="${full}"><stop offset=".5" stop-color="${p.body}" stop-opacity=".28"/><stop offset="1" stop-color="${p.body}" stop-opacity="0"/></radialGradient>`);
  const lumps = (pts) => pts.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${ASHES.rim}" ${ol(2.5)}/>`).join('');
  const body =
    `<ellipse class="pet-shadow" cx="80" cy="149" rx="38" ry="5" fill="#000" opacity=".3"/>` +
    `<g class="ash-ring">${ring}</g>` +
    (silhouette ? `<g class="ash-wisp" opacity="0"><g transform="${fit(80, 100, 30)}" fill="${p.body}" opacity=".25">${silhouette}</g></g>` : '') +
    emberGlow +
    lumps([[54, 133, 9, 5.5], [80, 129.5, 11, 5.5], [106, 133, 9, 5.5]]) +
    `<ellipse cx="80" cy="139" rx="35" ry="9" fill="${ASHES.nest}" ${ol(3)}/>` +
    `<path d="M52 137Q66 133 80 134Q94 133 108 137" fill="none" stroke="#2b2740" stroke-width="2" stroke-linecap="round" opacity=".7"/>` +
    `<g class="ash-medallion"><circle cx="80" cy="104" r="28" fill="url(#${medGlow})"/><circle cx="80" cy="104" r="18" fill="${ASHES.medallion}" ${ol(3)}/><circle cx="80" cy="104" r="14.5" fill="none" stroke="${p.body}" stroke-width="1.2" opacity=".45"/>` +
    (silhouette ? `<g clip-path="url(#${ctx.defOnce('med-clip', (full) => `<clipPath id="${full}"><circle cx="80" cy="104" r="15.5"/></clipPath>`)})"><g transform="${fit(80, 105, 28)}" fill="${p.body}">${silhouette}</g></g>` : '') + `</g>` +
    coals +
    lumps([[47, 141, 6, 4], [113, 141, 6, 4]]) +
    `<g class="ash-sparks">${[[64, 124], [97, 122], [86, 90]].map(([x, y], i) => `<g style="--i:${i}">${star4(x, y, 4, p.belly, 'opacity="0"')}</g>`).join('')}</g>`;
  const label = `${name ? `${name}, ` : ''}${TIER_NAMES[p.tier]} ${speciesName || species}, ashes, ${n} of ${ASHES.segments} days`;
  return svgRoot({ size, classes: ['pet', 'pet--ashes', `pet--${species}`, `pet--tier-${p.tier}`, 'pet--mood-ashes', `pet--s${size}`, size <= 72 && 'pet--thumb', !animate && 'pet--still', className], label, defs: ctx.defs, body });
}

export { OUTLINE };
