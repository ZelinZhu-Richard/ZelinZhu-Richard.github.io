// The instrument look (site/DESIGN.md): its tokens meet the contrast the design promises on every
// background text can sit on, it sets one plain sans with a clear type scale and loads no font file,
// its margin decoration stays decoration (and off small screens), and Research wears it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pages, LOOKS } from '../site/pages.mjs';
import { orrery, skySides, pageScale, marginNote, noteFilter, notePlot, noteYears, noteOrbits } from '../site/ornament.mjs';

const css = await readFile(new URL('../public/portfolio.css', import.meta.url), 'utf8');
const scoped = css.slice(css.indexOf('html[data-look="instrument"]{'));

// The declarations of one rule, by its exact selector, as { name: value }.
function block(selector) {
  const start = css.indexOf(`${selector}{`);
  assert.ok(start >= 0, `portfolio.css has ${selector}`);
  const body = css.slice(start + selector.length + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+?)\s*(?:;|$)/g)].map(m => [m[1], m[2]]));
}
const night = block('html[data-look="instrument"]');
const paper = { ...night, ...block('html[data-look="instrument"][data-theme="paper"]') };

// Colours as [r, g, b, a] from #rrggbb or rgb(r g b / a).
function colour(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const rgb = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(value);
  assert.ok(rgb, `cannot read the colour ${value}`);
  return [+rgb[1], +rgb[2], +rgb[3], +rgb[4]];
}
const over = (top, under) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3])).concat(1);
const linear = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Every background text sits on. The sky is a gradient, so its three stops; the aurora haze at its strongest
// (both hazes over the top of the sky); the publication plate with a grid dot under the text; chart paper
// where its two grid lines cross. In the wide margins (night only) the page scale's labels and the notes'
// captions sit on the margin sky (skySides() in site/ornament.mjs), so three more, each at its strongest
// and over the lightest sky colour that can be under it:
// - the Milky Way where its haze and core overlap, over the bottom of the sky. The top hazes never reach it:
//   they fade out by 31% of the window's width from its left edge and by 25% of its height from the top.
// - the aurora curtain where a ray's brightest part lies over the glow (rays never overlap one another, see
//   below), over the bottom of the sky. That part sits below the middle of the window, under no top haze.
// - the top right, where the rays' violet tops reach up under both top hazes, over the middle of the sky.
// 'sky top' is the darkest background; the aurora curtain is the lightest.
export function backgrounds(t, theme) {
  const c = name => colour(t[name]);
  const list = { 'sky top': c('--sky-top'), 'sky middle': c('--sky-mid'), 'sky bottom': c('--sky-bottom'), paper: c('--paper'), card: c('--card'), inset: c('--inset'), 'card + dot': over(c('--dot'), c('--card')) };
  if (theme === 'night') {
    const hazes = under => over(c('--haze-violet'), over(c('--haze-green'), under));
    list['sky + aurora haze'] = hazes(c('--sky-top'));
    list['margin: Milky Way at its strongest'] = over(c('--milkyway-core'), over(c('--milkyway'), c('--sky-bottom')));
    list['margin: aurora curtain at its strongest'] = over(c('--aurora'), over(c('--aurora-glow'), c('--sky-bottom')));
    list['margin: top right, hazes over the rays\' tops'] = hazes(over(c('--aurora-high'), c('--sky-mid')));
  }
  if (theme === 'paper') list['paper + grid lines'] = over(c('--grid-fine'), over(c('--grid'), c('--paper')));
  return list;
}
// Body text at least 7:1 (WCAG AAA); labels and links at least 4.5:1 (AA for small text).
export const MINIMUM = { '--ink': 7, '--muted': 7, '--faint': 4.5, '--accent': 4.5 };

test('every text token meets its contrast on every background, night and chart paper', () => {
  for (const [theme, tokens] of [['night', night], ['paper', paper]]) {
    for (const [name, minimum] of Object.entries(MINIMUM)) {
      for (const [where, bg] of Object.entries(backgrounds(tokens, theme))) {
        const ratio = contrast(colour(tokens[name]), bg);
        assert.ok(ratio >= minimum, `${theme}: ${name} on ${where} is ${ratio.toFixed(2)}:1, under ${minimum}:1`);
      }
    }
  }
});

test('amber and violet are never text colours, and the accent is the one bright colour for text', () => {
  // Text colour (color:) may use the text tokens, the accent and the paper colour (inverted controls) only.
  for (const [, value] of scoped.matchAll(/(?<![\w-])color:([^;}]+)/g)) {
    assert.doesNotMatch(value, /--amber|--violet|--line/, `color:${value}`);
  }
  // Soft light comes from gradient hazes only (the sky, its aurora haze, and the margins' Milky Way and aurora,
  // whose tokens the contrast test above covers). No glass, glow, blur or gradient text.
  assert.doesNotMatch(scoped, /backdrop-filter|text-shadow|box-shadow:(?!none)|background-clip:text|(?<![\w-])filter:[^;}]*blur/, 'no glass, glow, blur or gradient text');
  for (const name of ['--milkyway', '--milkyway-edge', '--milkyway-core', '--aurora', '--aurora-high', '--aurora-glow']) {
    assert.ok(colour(night[name])[3] <= 0.1, `${name} stays a haze (alpha at most .1)`);
  }
});

test('amber is the orrery sun only: once per screen', () => {
  const amber = [...scoped.matchAll(/([^{}]+)\{[^}]*var\(--amber\)/g)].map(m => m[1].trim());
  assert.deepEqual(amber, ['.orrery .o-halo', '.orrery .o-sun']);
});

// ---- Type ----
// A selector list split at its top-level commas (":is(h1,h2,h3)" stays whole).
const selectorList = head => {
  const out = [''];
  let depth = 0;
  for (const ch of head) {
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    if (ch === ',' && !depth) out.push('');
    else out[out.length - 1] += ch;
  }
  return out.map(s => s.trim());
};
// The CSS rules as { media, selectors, declarations } in source order (@supports blocks are read as true).
function cssRules(source) {
  const out = [];
  const walk = (text, media) => {
    for (let i = 0; i < text.length;) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      let depth = 1;
      let j = open + 1;
      for (; depth && j < text.length; j++) depth += text[j] === '{' ? 1 : text[j] === '}' ? -1 : 0;
      const head = text.slice(i, open).trim();
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith('@media')) walk(body, [media, head.slice(6).trim()].filter(Boolean).join(' and '));
      else if (head.startsWith('@supports')) walk(body, media);
      else if (!head.startsWith('@')) out.push({ media, selectors: selectorList(head), declarations: Object.fromEntries(body.split(';').map(d => d.split(/:(.*)/s).map(s => s.trim())).filter(d => d[0] && d[1] !== undefined)) });
      i = j;
    }
  };
  walk(source.replace(/\/\*[\s\S]*?\*\//g, ''), '');
  return out;
}
const RULES = cssRules(css);
// A screen of this width: no print, no forced colours, motion welcome, a mouse.
function screenMatches(media, width) {
  if (!media) return true;
  if (/\bprint\b|forced-colors:active|prefers-reduced-motion:reduce/.test(media)) return false;
  return [...media.matchAll(/\((min|max)-width:(\d+)px\)/g)].every(([, side, px]) => (side === 'min' ? width >= +px : width <= +px));
}
// The value a property takes for these selectors at a window width: the last matching rule in the file.
// (The instrument rules come after the legacy ones and are more specific, so source order is the cascade here.)
export function resolve(selectors, property, width) {
  let value;
  for (const rule of RULES) if (rule.selectors.some(s => selectors.includes(s)) && screenMatches(rule.media, width) && property in rule.declarations) value = rule.declarations[property];
  return value;
}
// px for a length like "18px" or "clamp(56px,34px + 3.8vw,104px)" at a window width.
export function px(value, width) {
  const js = value.replace(/(\d*\.?\d+)vw/g, (_, n) => `(${n}*${width / 100})`).replace(/(\d*\.?\d+)px/g, '$1')
    .replace(/clamp\(/g, 'clamp(').replace(/\bcalc\(/g, '(').replace(/\bmin\(/g, 'Math.min(').replace(/\bmax\(/g, 'Math.max(');
  assert.match(js, /^[\d.\s+\-*/(),a-zA-Z]*$/, `cannot read the length ${value}`);
  return Function('clamp', `return ${js}`)((lo, v, hi) => Math.min(Math.max(lo, v), hi));
}
export const TYPE = {
  title: ['html[data-look="instrument"] h1'],
  'section heading': ['html[data-look="instrument"] h2'],
  'entry heading': ['html[data-look="instrument"] h3'],
  body: ['html[data-look="instrument"] body'],
  label: ['.chapter-rail .dial'],
};
export const WIDTHS = [360, 768, 1100, 1280, 1440, 1728, 1920];

test('one plain sans: no serif, no italic display, no font file to load', () => {
  for (const name of ['--font-display', '--font-body']) {
    assert.match(night[name], /^-apple-system,BlinkMacSystemFont,"SF Pro (?:Display|Text)","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif$/, name);
  }
  assert.equal(night['--font-ui'], 'var(--font-body)');
  assert.doesNotMatch(scoped, /font-style:italic|Ibarra|Neoris|Iowan|Georgia|serif"/, 'italic only where <em> asks for it');
  assert.doesNotMatch(css, /@font-face\{\s*font-family:"Ibarra/, 'portfolio.css no longer declares the homepage name face');
  assert.equal(resolve(['html[data-look="instrument"] :is(h1,h2,h3)'], 'font-weight', 1440), '600');
  const research = pages().get('research/index.html');
  assert.doesNotMatch(research, /<link rel="preload"[^>]*as="font"/, 'Research preloads no font');
  assert.doesNotMatch(research, /Neoris|ibarra/i);
  assert.equal(LOOKS.instrument.font, undefined);
  assert.match(pages().get('about/index.html'), /<link rel="preload" href="\/_nuxt\/TTNeorisTrialRegular\.CykOY4gR\.ttf"/, 'About is still on the old look');
});

test('the type scale keeps title, section heading, entry heading, body and label clearly apart at every width', () => {
  const steps = [['title', 'section heading', 1.6], ['section heading', 'entry heading', 1.25], ['entry heading', 'body', 1.15], ['body', 'label', 1.35]];
  for (const width of WIDTHS) {
    const size = Object.fromEntries(Object.entries(TYPE).map(([role, selectors]) => [role, px(resolve(selectors, 'font-size', width), width)]));
    for (const [big, small, ratio] of steps) {
      assert.ok(size[big] / size[small] >= ratio, `${width}px: ${big} ${size[big].toFixed(1)}px is not ${ratio}× ${small} ${size[small].toFixed(1)}px`);
    }
  }
  // Large type tracks tighter; reading text stays at 1.6 and about 65 characters.
  for (const [selector, tracking] of [['html[data-look="instrument"] h1', -0.03], ['html[data-look="instrument"] h2', -0.015]]) {
    assert.ok(parseFloat(resolve([selector], 'letter-spacing', 1440)) <= tracking, selector);
  }
  assert.equal(resolve(['html[data-look="instrument"] body'], 'line-height', 1440), '1.6');
  assert.equal(resolve(['.role-desc'], 'max-width', 1440), '34em');
});

// ---- The margins ----
test('the margin decoration is wide-screen only: gone under 1100px, notes from 1280px', () => {
  const display = (selector, width) => resolve([selector, `html[data-look="instrument"] ${selector}`, `html[data-look="instrument"]:not([data-theme="paper"]) ${selector}`], 'display', width);
  for (const width of [360, 768, 1099]) for (const part of ['.sky-sides', '.page-scale', '.margin-note']) assert.equal(display(part, width), 'none', `${part} at ${width}px`);
  for (const width of [1100, 1279]) {
    assert.equal(display('.sky-sides', width), 'block');
    assert.equal(display('.page-scale', width), 'block');
    assert.equal(display('.margin-note', width), 'none', `notes at ${width}px`);
  }
  for (const width of WIDTHS.filter(w => w >= 1280)) for (const part of ['.sky-sides', '.page-scale', '.margin-note']) assert.equal(display(part, width), 'block', `${part} at ${width}px`);
  // Decoration ignores the pointer; the page scale is the one part that can be used.
  for (const selector of ['.sky-side', 'html[data-look="instrument"] .margin-note']) assert.equal(resolve([selector], 'pointer-events', 1440), 'none', selector);
});

test('the margins sky is static decoration: hidden, deterministic, gradients and dots only, rays that never overlap', () => {
  const sky = skySides();
  assert.equal(skySides(), sky);
  assert.match(sky, /^<div class="sky-sides" aria-hidden="true">/);
  assert.doesNotMatch(sky, /<filter|blur|<image|<text|<a |href=|<animate|<script|amber/i);
  const [left, right] = sky.split('<svg').slice(1);
  assert.match(left, /class="sky-side sky-side--left"[^>]*preserveAspectRatio="xMinYMid slice"/);
  assert.match(left, /id="sky-mw"/, 'the Milky Way is on the left');
  assert.match(right, /id="sky-ray"/, 'the aurora is on the right');
  for (const side of [left, right]) {
    assert.ok((side.match(/h0/g) || []).length >= 150, 'a real star field');
    assert.equal(new Set([...side.matchAll(/stroke-width="([\d.]+)"/g)].map(m => m[1])).size, 3, 'three sizes');
    assert.match(side, /fill-opacity=".55"/, 'a few four-point glints');
  }
  const rays = [...right.matchAll(/<ellipse cx="([\d.]+)" cy="[\d.]+" rx="([\d.]+)"[^>]*opacity=/g)].map(m => [+m[1] - +m[2], +m[1] + +m[2]]).sort((a, b) => a[0] - b[0]);
  assert.ok(rays.length >= 8, 'a curtain of rays');
  rays.slice(1).forEach(([from], i) => assert.ok(from >= rays[i][1], 'aurora rays do not overlap, so the haze is never stronger than the contrast test assumes'));
});

test('the page scale is a real nav of the page sections, in order, evenly spread until the script measures', () => {
  const research = pages().get('research/index.html');
  const nav = research.slice(research.indexOf('<nav class="page-scale"'), research.indexOf('</nav>', research.indexOf('<nav class="page-scale"')));
  assert.match(nav, /^<nav class="page-scale" aria-label="Page scale">/);
  const marks = [...nav.matchAll(/<li style="--at:([\d.]+)"><a href="#([\w-]+)"><span class="scale-n">(03\.\d)<\/span> <span class="scale-name">([^<]+)<\/span><\/a><\/li>/g)].map(m => [+m[1], m[2], m[3], m[4]]);
  assert.deepEqual(marks, [[0.2, 'experience', '03.1', 'Experience'], [0.4, 'publications', '03.2', 'Publication'], [0.6, 'methods', '03.3', 'In projects'], [0.8, 'tools', '03.4', 'Tools']]);
  for (const [, id] of marks) assert.ok(research.includes(`<section id="${id}" class="chapter"`), id);
  assert.match(nav, /<p class="scale-numerals" aria-hidden="true">/);
  assert.match(nav, /<span class="scale-cursor" aria-hidden="true"><\/span>/);
  assert.equal(pageScale([{ id: 'a"b', n: '1', name: '<x>' }]).includes('href="#a&quot;b"'), true, 'escaped');
  // The script that brings it to life: in portfolio.js, guarded, so pages without a scale are untouched.
  return readFile(new URL('../public/portfolio.js', import.meta.url), 'utf8').then(js => {
    assert.match(js, /document\.querySelector\('\.page-scale'\)/);
    assert.match(js, /aria-current', 'location'/);
  });
});

test('margin notes are hidden drawings with a plain caption, one per Research chapter, numbers from the data', () => {
  const research = pages().get('research/index.html');
  const notes = [...research.matchAll(/<div class="margin-note" aria-hidden="true">([\s\S]*?)<\/div>\n<\/section>/g)].map(m => m[1].trim());
  assert.equal(notes.length, 4, 'one note per chapter, inside it');
  for (const note of notes) {
    assert.doesNotMatch(note, /<a |href=|<text|<image|<filter|amber|accent/);
    assert.match(note, /<p class="note-cap"><span>Fig\. \d<\/span> [^<]+\.<\/p>$/);
  }
  assert.match(notes[2], /<p class="note-axis" style="--years:2"><span>2025<\/span><span>2026<\/span><\/p>/);
  assert.match(notes[3], /AI &amp; ML \(8\), Languages \(4\), Tooling \(2\)\./);
  for (const draw of [noteFilter, notePlot, () => noteYears([[2025, 2026]]), () => noteOrbits([3, 2])]) assert.equal(draw(), draw(), 'deterministic');
  assert.throws(() => noteYears([[2026, 2025]]), /Not a year span/);
  assert.match(marginNote('Fig. 9', 'A & B.', ''), /<span>Fig\. 9<\/span> A &amp; B\./);
});

test('the orrery is decoration: hidden from assistive technology, deterministic, one amber sun', () => {
  const svg = orrery(2);
  assert.equal(orrery(2), svg);
  assert.notEqual(orrery(3), svg, 'each section has its own variant');
  assert.match(svg, /^<svg class="orrery" viewBox="-200 -200 400 400" width="400" height="400" aria-hidden="true" focusable="false">/);
  assert.equal(svg.match(/class="o-sun"/g).length, 1);
  assert.doesNotMatch(svg, /<text|<image|href=/, 'no text, images or links inside');
});
