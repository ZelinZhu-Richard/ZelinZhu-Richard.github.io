// The drawn parts of the "instrument" look (site/DESIGN.md), all inline SVG or plain markup:
// - orrery(): the engraved orrery at the top of a page. A graduated dial ring, the sphere's meridian, an
//   equator, the ecliptic tilted by 23.4 degrees (the Earth's axial tilt) with its axis, a planet on it and
//   an amber sun. Back halves of the rings are dashed, as hidden lines are in a technical drawing.
// - skySides(): the sky in the wide margins: stars, a Milky Way band on the left, an aurora curtain on the right.
// - pageScale(): the left margin's graduated scale, which is also the page's section links.
// - marginNote() and the note figures: small engraved drawings in the right margin, beside what they illustrate.
// Colours come from CSS (portfolio.css), so the same markup works on night and chart paper. Everything is
// deterministic: the same arguments draw the same SVG, so the build output does not change between runs.
const TILT = 23.4;
const r1 = n => Math.round(n * 10) / 10;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Ticks every 5 degrees, inward from the dial ring: long every 30, medium every 15.
function dialTicks(radius) {
  let d = '';
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 - 90) * Math.PI / 180;
    const length = i % 6 === 0 ? 13 : i % 3 === 0 ? 8 : 4;
    const [cx, cy] = [Math.cos(a), Math.sin(a)];
    d += `M${r1(cx * radius)} ${r1(cy * radius)}L${r1(cx * (radius - length))} ${r1(cy * (radius - length))}`;
  }
  return d;
}

// An ellipse seen edge-on: the back (upper) half dashed, the front (lower) half solid.
const ring = (rx, ry, cls) => `<path class="${cls} o-back" d="M${-rx} 0A${rx} ${ry} 0 0 1 ${rx} 0"/><path class="${cls}" d="M${-rx} 0A${rx} ${ry} 0 0 0 ${rx} 0"/>`;

/** variant: a section's index (0 to 6); it turns the figure and moves the planet, so each section has its own. */
export function orrery(variant = 0) {
  const turn = -8 + variant * 7;
  const phase = (40 + variant * 47) % 360;
  const p = phase * Math.PI / 180;
  // The planet rides the front half of the ecliptic when it can be seen there.
  const planet = [r1(Math.cos(p) * 150), r1(Math.abs(Math.sin(p)) * 44)];
  return `<svg class="orrery" viewBox="-200 -200 400 400" width="400" height="400" aria-hidden="true" focusable="false">
<g transform="rotate(${turn})">
<circle class="o-dial" r="190"/><path class="o-tick" d="${dialTicks(190)}"/>
<circle class="o-ring" r="150"/>
${ring(150, 34, 'o-ring')}
<g transform="rotate(${-TILT})">${ring(150, 44, 'o-tilt')}<path class="o-tilt o-axis" d="M0 -172V172"/><circle class="o-planet" cx="${planet[0]}" cy="${planet[1]}" r="4"/></g>
<circle class="o-halo" r="12"/><circle class="o-sun" r="5"/>
</g>
</svg>`;
}

// ---- The sky in the margins ----
// Two fixed panels, one per side, shown only where the page has wide margins (portfolio.css). Each panel's
// x runs from its outer edge (0) inwards, so stars crowd the window's edge and thin out towards the text;
// a CSS mask then fades the inner part of the panel to nothing before the text column begins. The hazes are
// SVG gradients whose colours are CSS tokens (--milkyway, --aurora...), which tests/look.test.mjs checks
// against the text tokens. No filters, no blur, no images, nothing moves.
const SKY_W = 520;
const SKY_H = 900;
// mulberry32: a tiny seeded generator, so the same seed always places the same stars.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const STAR_COLOURS = { white: '#ece9e1', blue: '#d0e8ff', rose: '#ffdee8' };
// Three sizes; each has a dimmer and a brighter group. A star is a zero-length line with a round cap
// (a dot as wide as the stroke), so one path draws a whole group.
const STAR_SIZES = [
  { width: 1.2, opacity: [0.38, 0.56] },
  { width: 1.7, opacity: [0.5, 0.68] },
  { width: 2.4, opacity: [0.72, 0.88] },
];
// The Milky Way's axis on the left panel, from above the top to below the bottom, leaning inwards as it falls.
// Its haze is capped by the contrast budget (the page scale's labels sit on it), so the band reads mostly
// through its own crowd of small stars, as the real one does.
const BAND = { from: [8, -80], to: [150, 980], stars: 220, spread: 28 };

function starPaths(stars, x) {
  const groups = new Map();
  for (const s of stars) {
    const key = `${s.size}|${s.colour}|${s.bright}`;
    groups.set(key, (groups.get(key) || '') + `M${x(s.x)} ${r1(s.y)}h0`);
  }
  return [...groups].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, d]) => {
    const [size, colour, bright] = key.split('|');
    const { width, opacity } = STAR_SIZES[size];
    return `<path d="${d}" stroke="${STAR_COLOURS[colour]}" stroke-width="${width}" stroke-opacity="${opacity[bright]}"/>`;
  }).join('');
}
// A four-point glint: thin rays out to `reach`, pinched to a point between them.
const glint = (cx, cy, reach) => {
  const p = 0.45;
  return `M${cx} ${r1(cy - reach)}L${r1(cx + p)} ${r1(cy - p)}L${r1(cx + reach)} ${cy}L${r1(cx + p)} ${r1(cy + p)}L${cx} ${r1(cy + reach)}L${r1(cx - p)} ${r1(cy + p)}L${r1(cx - reach)} ${cy}L${r1(cx - p)} ${r1(cy - p)}Z`;
};

function skySide(side, seed) {
  const rand = seeded(seed);
  const left = side === 'left';
  const x = v => r1(left ? v : SKY_W - v);
  const stars = [];
  for (let i = 0; i < 220; i++) {
    const roll = rand();
    const size = roll < 0.66 ? 0 : roll < 0.92 ? 1 : 2;
    const hue = rand();
    // Denser at the outer edge: x = 380·u² puts half the stars in the outer 95 units, three quarters in 215.
    stars.push({ x: 2 + 380 * rand() ** 2, y: rand() * SKY_H, size, bright: rand() < 0.5 ? 0 : 1, colour: size === 0 || hue > 0.24 ? 'white' : hue < 0.14 ? 'blue' : 'rose' });
  }
  let haze = '';
  let defs = '';
  if (left) {
    // The band's own stars: small, scattered about its axis (a normal spread, BAND.spread units either side).
    const [[x0, y0], [x1, y1]] = [BAND.from, BAND.to];
    const [dx, dy] = [x1 - x0, y1 - y0];
    const length = Math.hypot(dx, dy);
    for (let i = 0; i < BAND.stars; i++) {
      const t = rand();
      const spread = Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(2 * Math.PI * rand()) * BAND.spread;
      const sy = y0 + dy * t - (dx / length) * spread;
      if (sy < 0 || sy > SKY_H) continue;
      stars.push({ x: x0 + dx * t + (dy / length) * spread, y: sy, size: 0, bright: i % 3 === 0 ? 1 : 0, colour: i % 7 === 0 ? 'rose' : 'white' });
    }
    const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
    const angle = r1(-Math.atan2(dx, dy) * 180 / Math.PI);
    defs = '<radialGradient id="sky-mw"><stop offset="0" class="mw-a"/><stop offset=".55" class="mw-b"/><stop offset="1" class="mw-fade"/></radialGradient><radialGradient id="sky-mw-core"><stop offset="0" class="mw-core"/><stop offset="1" class="mw-fade"/></radialGradient>';
    haze = `<g transform="rotate(${angle} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="78" ry="640" fill="url(#sky-mw)"/><ellipse cx="${cx - 6}" cy="${cy - 70}" rx="32" ry="430" fill="url(#sky-mw-core)"/></g>`;
  } else {
    // The aurora: soft vertical rays, brightest low down and fading upwards, over a faint glow. Each ray
    // keeps to its own slot, so no two overlap and the haze is never stronger than one ray over the glow.
    defs = '<radialGradient id="sky-ray" fx=".5" fy=".8"><stop offset="0" class="au-a"/><stop offset=".5" class="au-b"/><stop offset="1" class="au-fade"/></radialGradient><radialGradient id="sky-glow"><stop offset="0" class="au-glow"/><stop offset="1" class="au-fade"/></radialGradient>';
    const rays = [];
    const [start, end, count] = [318, 516, 9];
    const slot = (end - start) / count;
    for (let i = 0; i < count; i++) {
      const rx = (slot / 2) * (0.62 + 0.36 * rand());
      const cx = start + slot * i + slot / 2 + (rand() - 0.5) * 2 * (slot / 2 - rx);
      const ry = 170 + 120 * rand();
      const bottom = 616 + 30 * Math.sin(i * 1.3) + 16 * (rand() - 0.5);
      rays.push(`<ellipse cx="${r1(cx)}" cy="${r1(bottom - ry)}" rx="${r1(rx)}" ry="${r1(ry)}" opacity="${r1(0.6 + 0.4 * rand())}"/>`);
    }
    haze = `<ellipse cx="430" cy="560" rx="150" ry="170" fill="url(#sky-glow)"/><g fill="url(#sky-ray)">${rays.join('')}</g>`;
  }
  // A few of the large stars carry a glint.
  const glints = stars.filter(s => s.size === 2).slice(0, 6).map(s => glint(x(s.x), r1(s.y), 3.6)).join('');
  return `<svg class="sky-side sky-side--${side}" viewBox="0 0 ${SKY_W} ${SKY_H}" preserveAspectRatio="${left ? 'xMinYMid' : 'xMaxYMid'} slice" focusable="false">
<defs>${defs}</defs>
${haze}
<g fill="none" stroke-linecap="round">${starPaths(stars, x)}</g>
<path d="${glints}" fill="${STAR_COLOURS.white}" fill-opacity=".55"/>
</svg>`;
}
/** The two sky panels for an instrument page. Hidden from assistive technology; frame() writes them. */
export const skySides = () => `<div class="sky-sides" aria-hidden="true">
${skySide('left', 7)}
${skySide('right', 23)}
</div>`;

// ---- The page scale (left margin) ----
/**
 * sections: [{ id, n, name }] in page order, e.g. { id: 'experience', n: '03.1', name: 'Experience' }.
 * A graduated scale for the whole page, held in view as you scroll. Each section's mark is a link to it.
 * Without JavaScript the marks are spread evenly; public/portfolio.js moves each to the point of the
 * scroll where its section starts, marks the current one and drives the cursor.
 */
export function pageScale(sections, label = 'Page scale') {
  const even = i => Math.round(((i + 1) / (sections.length + 1)) * 1e4) / 1e4;
  return `<nav class="page-scale" aria-label="${escape(label)}">
<div class="scale-track">
<p class="scale-numerals" aria-hidden="true">${[0, 25, 50, 75, 100].map(v => `<span style="--at:${v / 100}">${v}</span>`).join('')}</p>
<span class="scale-cursor" aria-hidden="true"></span>
<ol>${sections.map((s, i) => `<li style="--at:${even(i)}"><a href="#${escape(s.id)}"><span class="scale-n">${escape(s.n)}</span> <span class="scale-name">${escape(s.name)}</span></a></li>`).join('')}</ol>
</div>
</nav>`;
}

// ---- Notes in the right margin ----
// A note is a small engraved figure with a mono caption, like a note in a lab notebook's margin. It sits
// beside the section it illustrates, is hidden from assistive technology and holds no links. Figures use
// the classes styled under .note-fig in portfolio.css: lines in --line-strong, n-dim (--line), n-mid
// (--faint, dimmed), n-violet (the one highlight), n-ink and n-fill (dots and a shaded cell). No amber.
/** label: "Fig. 1"; caption: one plain sentence; figure: markup from a note figure below. */
export const marginNote = (label, caption, figure) => `<div class="margin-note" aria-hidden="true">
${figure}
<p class="note-cap"><span>${escape(label)}</span> ${escape(caption)}</p>
</div>`;
const figure = (height, body) => `<svg class="note-fig" viewBox="0 0 200 ${height}" width="200" height="${height}" focusable="false">\n${body}\n</svg>`;

/** A 3×3 filter over a 6×6 image grid, writing one cell of a 4×4 feature map. */
export function noteFilter() {
  const cell = 14;
  const grid = (x0, y0, n) => {
    let d = '';
    for (let i = 0; i <= n; i++) d += `M${x0 + i * cell} ${y0}v${n * cell}M${x0} ${y0 + i * cell}h${n * cell}`;
    return d;
  };
  const [ix, iy, ox, oy] = [1, 13, 131, 27];
  const [wx, wy] = [ix + cell, iy + 2 * cell];
  const [cx, cy] = [ox + cell, oy + 2 * cell];
  return figure(110, `<path d="${grid(ix, iy, 6)}"/>
<path class="n-dim" d="${grid(ox, oy, 4)}"/>
<rect class="n-fill" x="${cx}" y="${cy}" width="${cell}" height="${cell}"/>
<path class="n-mid n-dash" d="M${wx + 3 * cell} ${wy}L${cx} ${cy}M${wx + 3 * cell} ${wy + 3 * cell}L${cx} ${cy + cell}"/>
<rect class="n-violet" x="${wx}" y="${wy}" width="${3 * cell}" height="${3 * cell}"/>
<rect class="n-violet" x="${cx}" y="${cy}" width="${cell}" height="${cell}"/>`);
}

/** Plot axes, a dashed rising curve (the hidden truth) and estimates around it, each tied to it by a hairline. */
export function notePlot() {
  const truth = x => 100 - 76 * (1 - Math.exp(-(x - 16) / 64));
  const curve = Array.from({ length: 23 }, (_, i) => `${i ? 'L' : 'M'}${16 + i * 8} ${r1(truth(16 + i * 8))}`).join('');
  const dots = [-8, 7, -5, 9, -9, 4, 8, -6, 5].map((off, i) => [28 + i * 19, r1(truth(28 + i * 19) + off)]);
  const ticks = [1, 2, 3, 4, 5, 6].map(i => `M${16 + i * 30} 104v3`).join('') + [1, 2, 3, 4].map(i => `M16 ${104 - i * 24}h-3`).join('');
  return figure(112, `<path d="M16 4V104H196"/>
<path class="n-dim" d="${ticks}"/>
<path class="n-mid n-dash" d="${curve}"/>
<path class="n-violet" d="${dots.map(([x, y]) => `M${x} ${y}V${r1(truth(x))}`).join('')}"/>
${dots.map(([x, y]) => `<circle class="n-ink" cx="${x}" cy="${y}" r="1.8"/>`).join('')}`);
}

/** spans: [[firstYear, lastYear], ...], one row each, on a year axis with month ticks; years label it below. */
export function noteYears(spans) {
  for (const span of spans) if (span.length !== 2 || !span.every(Number.isInteger) || span[0] > span[1]) throw new Error(`Not a year span: ${span}`);
  const first = Math.min(...spans.flat());
  const count = Math.max(...spans.flat()) - first + 1;
  const [x0, x1] = [4, 196];
  const per = (x1 - x0) / count;
  const at = year => r1(x0 + (year - first) * per);
  const axis = 12 + spans.length * 14;
  let ticks = '';
  for (let m = 0; m <= count * 12; m++) ticks += `M${r1(x0 + (m * per) / 12)} ${axis}v${m % 12 === 0 ? 7 : m % 6 === 0 ? 4 : 2}`;
  const rows = spans.map(([from, to], i) => {
    const [a, b, y] = [r1(at(from) + 3), r1(at(to + 1) - 3), 10 + i * 14];
    return `M${a} ${y}H${b}M${a} ${y - 3}v6M${b} ${y - 3}v6`;
  }).join('');
  return figure(axis + 8, `<path d="M${x0} ${axis}H${x1}"/>
<path class="n-dim" d="${ticks}"/>
<path class="n-mid" d="${rows}"/>`) + `\n<p class="note-axis" style="--years:${count}">${Array.from({ length: count }, (_, i) => `<span>${first + i}</span>`).join('')}</p>`;
}

/** counts: items per orbit, outer to inner. Tilted orbits like the orrery's, back halves dashed, one dot per item. */
export function noteOrbits(counts) {
  const orbits = counts.map((n, i) => {
    const rx = 92 - i * 28;
    const ry = r1(rx * 0.34);
    const phase = 15 + i * 41;
    const dots = Array.from({ length: n }, (_, k) => {
      const a = ((phase + (k * 360) / n) * Math.PI) / 180;
      const front = Math.sin(a) > 0;
      return `<circle class="${front ? 'n-ink' : 'n-ink-dim'}" cx="${r1(Math.cos(a) * rx)}" cy="${r1(Math.sin(a) * ry)}" r="${front ? 2 : 1.6}"/>`;
    }).join('');
    return `<path class="n-dash" d="M${-rx} 0A${rx} ${ry} 0 0 1 ${rx} 0"/><path d="M${-rx} 0A${rx} ${ry} 0 0 0 ${rx} 0"/>${dots}`;
  }).join('\n');
  return figure(112, `<g transform="translate(100 56) rotate(-14)">
${orbits}
<circle r="3"/><circle class="n-ink" r="1.2"/>
</g>`);
}
