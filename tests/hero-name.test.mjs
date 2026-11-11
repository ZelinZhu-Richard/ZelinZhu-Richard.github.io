import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { HERO_NAME_FILES, withHeroName, withHeroFontLoad } from '../workspace/hero-name/build.mjs';

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
  assert.match(once, /<link rel="stylesheet" href="\/hero-name\/hero-name\.css\?v=abc">\n<\/head>/);
  assert.equal(withHeroName(once, 'abc'), once);
});

test('start.js waits for the hero font before SplitText measures the letters', async () => {
  const start = withHeroFontLoad(await readFile('public/start.js', 'utf8'));
  const wait = start.indexOf(`document.fonts.load('italic 400 16px "Ibarra Real Nova"')`);
  assert.ok(wait > 0 && wait < start.indexOf("import('./_nuxt/CbdjwYMp.js')"));
  assert.equal(withHeroFontLoad(start), start);
  assert.throws(() => withHeroFontLoad('await import("x")'), /font wait not found/);
});
