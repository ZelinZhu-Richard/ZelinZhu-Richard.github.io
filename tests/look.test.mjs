// The instrument look (site/DESIGN.md): its tokens meet the contrast the design promises on every
// background text can sit on, it does not lean on the trial font, and Research wears it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pages, LOOKS } from '../site/pages.mjs';
import { orrery } from '../site/ornament.mjs';

const css = await readFile(new URL('../public/portfolio.css', import.meta.url), 'utf8');

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
// where its two grid lines cross.
export function backgrounds(t, theme) {
  const c = name => colour(t[name]);
  const list = { 'sky top': c('--sky-top'), 'sky middle': c('--sky-mid'), 'sky bottom': c('--sky-bottom'), paper: c('--paper'), card: c('--card'), inset: c('--inset'), 'card + dot': over(c('--dot'), c('--card')) };
  if (theme === 'night') list['sky + aurora haze'] = over(c('--haze-violet'), over(c('--haze-green'), c('--sky-top')));
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
  const scoped = css.slice(css.indexOf('html[data-look="instrument"]{'));
  // Text colour (color:) may use the text tokens, the accent and the paper colour (inverted controls) only.
  for (const [, value] of scoped.matchAll(/(?<![\w-])color:([^;}]+)/g)) {
    assert.doesNotMatch(value, /--amber|--violet|--line/, `color:${value}`);
  }
  assert.doesNotMatch(scoped, /backdrop-filter|text-shadow|box-shadow:(?!none)|background-clip:text/, 'no glass, glow or gradient text');
});

test('the instrument look does not use the trial font, and keeps it for the pages still on the old look', () => {
  assert.doesNotMatch(night['--font-display'], /Neoris/);
  assert.match(night['--font-display'], /^"Ibarra Real Nova",/);
  assert.match(css, /font-family:"Ibarra Real Nova";\s*font-style:italic;\s*font-weight:400;\s*font-display:swap;\s*src:url\('\/hero-name\/ibarra-real-nova-italic\.woff2'\)/);
  const research = pages().get('research/index.html');
  assert.ok(research.includes(`<link rel="preload" href="${LOOKS.instrument.font}" as="font" type="font/woff2" crossorigin>`));
  assert.doesNotMatch(research, /Neoris/);
  assert.match(pages().get('about/index.html'), /<link rel="preload" href="\/_nuxt\/TTNeorisTrialRegular\.CykOY4gR\.ttf"/, 'About is still on the old look');
});

test('the orrery is decoration: hidden from assistive technology, deterministic, one amber sun', () => {
  const svg = orrery(2);
  assert.equal(orrery(2), svg);
  assert.notEqual(orrery(3), svg, 'each section has its own variant');
  assert.match(svg, /^<svg class="orrery" viewBox="-200 -200 400 400" width="400" height="400" aria-hidden="true" focusable="false">/);
  assert.equal(svg.match(/class="o-sun"/g).length, 1);
  assert.doesNotMatch(svg, /<text|<image|href=/, 'no text, images or links inside');
});
