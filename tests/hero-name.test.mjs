import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { HERO_NAME_FILES, withHeroName, withHeroFontLoad } from '../workspace/hero-name/build.mjs';
import { LABEL, DURATION, markup, pair, place, heroProgress } from '../workspace/hero-name/agency.js';

const dir = 'workspace/hero-name/';

test('hero font is a self-hosted woff2 under 40 KB and ships with its OFL license', async () => {
  const font = await readFile(`${dir}ibarra-real-nova-italic.woff2`);
  assert.equal(font.subarray(0, 4).toString('latin1'), 'wOF2');
  assert.ok(font.length < 40 * 1024, `font is ${(font.length / 1024).toFixed(1)} KB`);
  assert.match(await readFile(`${dir}OFL.txt`, 'utf8'), /SIL Open Font License, Version 1\.1/);
  assert.ok(HERO_NAME_FILES.includes('OFL.txt'));
  for (const file of HERO_NAME_FILES) assert.ok((await stat(dir + file)).size > 0, file);
});

test('hero stylesheet loads only the local font and keeps letters inside their gradient boxes', async () => {
  const css = await readFile(`${dir}hero-name.css`, 'utf8');
  assert.doesNotMatch(css, /https?:\/\//, 'no external font requests');
  assert.match(css, /src: url\("\/hero-name\/ibarra-real-nova-italic\.woff2"\) format\("woff2"\)/);
  assert.match(css, /body \.home-hero h1 div\.char \{\s*padding: \.4em \.45em !important;\s*margin: -\.28em -\.435em -\.22em !important;/);
});

test('built homepage gets the stylesheet and preload once, before </head>', () => {
  const html = '<html><head><title>x</title></head><body></body></html>';
  const once = withHeroName(html, 'abc');
  assert.match(once, /<link rel="preload" href="\/hero-name\/ibarra-real-nova-italic\.woff2\?v=abc" as="font" type="font\/woff2" crossorigin>/);
  assert.match(once, /<link rel="stylesheet" href="\/hero-name\/hero-name\.css\?v=abc">\n<script type="module" src="\/hero-name\/agency\.js\?v=abc"><\/script>\n<\/head>/);
  assert.equal(withHeroName(once, 'abc'), once);
});

test('start.js waits for the hero font before SplitText measures the letters', async () => {
  const start = withHeroFontLoad(await readFile('public/start.js', 'utf8'));
  const wait = start.indexOf(`document.fonts.load('italic 400 16px "Ibarra Real Nova"')`);
  assert.ok(wait > 0 && wait < start.indexOf("import('./_nuxt/CbdjwYMp.js')"));
  assert.equal(withHeroFontLoad(start), start);
  assert.throws(() => withHeroFontLoad('await import("x")'), /font wait not found/);
});

test('hero line becomes "Agency, and I’ll bring the snacks."', () => {
  assert.equal(LABEL, 'Agency, and I’ll bring the snacks.');
  assert.equal(markup, '<span class="hero-agency-lead">Agency,</span><br><span class="hero-agency-rest">and I’ll bring the snacks.</span>');
});

test('sand grains start on the motto, gather on the line, and end on the new line', () => {
  const source = [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }];
  const target = [{ x: 4, y: 2 }, { x: 8, y: 2 }, { x: 12, y: 2 }, { x: 16, y: 2 }, { x: 30, y: 4 }];
  const grains = pair(source, target, 50, () => 0.5);
  assert.equal(grains.length, 5, 'one grain per target pixel when the target has more');
  assert.deepEqual(grains.map(g => g.lx), [0, 7.5, 15, 22.5, 30], 'line slots span both texts left to right');
  for (const g of grains) {
    assert.deepEqual(place(g, 0), { x: g.sx, y: g.sy });
    const end = place(g, DURATION);
    assert.ok(Math.abs(end.x - g.ex) < 1e-9 && Math.abs(end.y - g.ey) < 1e-9);
  }
  const onLine = place(grains[0], 1350);
  assert.ok(Math.abs(onLine.y - 50) < 1e-9, 'every grain rests on the line between falling and rising');
  assert.deepEqual(pair([], target, 50), []);
});

test('hero scroll progress comes from the name letters the runtime fades', () => {
  const chars = o => o.map(opacity => ({ style: { opacity } }));
  assert.equal(heroProgress(chars(['', '1'])), 0);
  assert.equal(heroProgress(chars(['0.5', '0'])), 0.75);
  assert.equal(heroProgress([]), 0);
});
