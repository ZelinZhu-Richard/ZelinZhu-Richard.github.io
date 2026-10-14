import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { DEFAULTS, PRESETS, validateCard, serializeSettings, parseSettings, MAX_IMAGE_BYTES } from '../state.js';
import { buildInteractiveHTML, safeJSON, exportFilename } from '../export.js';
import { buildFlash } from '../build.mjs';

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5rkAAAAASUVORK5CYII=';
const css = await readFile(new URL('../card.css', import.meta.url), 'utf8');
const font = (await readFile(new URL('../assets/InstrumentSerif-Regular.ttf', import.meta.url))).toString('base64');

test('settings round trip preserves every control and an embedded custom texture', () => {
  const card = { ...DEFAULTS, title: '旅行 <&> “club”', ratio: 'landscape', width: 420, primary: PRESETS.Rose[0], texture: 'custom', image: pixel, logo: 'rings', aurora: false, ticket: false };
  assert.deepEqual(parseSettings(serializeSettings(card)), card);
  assert.deepEqual(validateCard({}), DEFAULTS);
  assert.equal(DEFAULTS.title, 'Luminary Club');
});

test('untrusted imports cannot override types, bounds, resource URLs, or object prototypes', () => {
  for (const input of [null, [], { width: 9000 }, { tilt: NaN }, { opacity: -1 }, { width: '292' }, { ticket: 'false' }, { logo: 'script' }, { blend: 'url(https://bad)' }, { primary: 'red;display:none' }, { image: 'https://bad/image.png' }, { image: 'data:image/svg+xml;base64,PHN2Zz4=' }, { image: 'data:image/png;base64,abc' }, { texture: 'custom' }, { title: 'x'.repeat(61) }, JSON.parse('{"__proto__":{"polluted":true}}')]) {
    assert.throws(() => validateCard(input), undefined, JSON.stringify(input));
  }
  assert.throws(() => validateCard({ image: `data:image/png;base64,${'AAAA'.repeat(Math.floor(MAX_IMAGE_BYTES / 3) + 1)}` }));
  for (const text of ['{broken', '{}', '{"format":"flash-card","version":2,"card":{}}', '{"format":"other","version":1,"card":{}}']) assert.throws(() => parseSettings(text));
  assert.equal({}.polluted, undefined);
});

test('offline HTML embeds the shared renderer, local font, and custom texture without script injection', () => {
  const hostile = '</script><img src=x onerror=alert(1)>';
  const card = { ...DEFAULTS, title: hostile, subtitle: '\u2028\u2029<&>', texture: 'custom', image: pixel };
  const html = buildInteractiveHTML(card, { css, font });
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.equal((html.match(/<\/script>/g) || []).length, 2);
  assert.ok(!html.includes(hostile));
  assert.ok(html.includes('data:font/ttf;base64,' + font));
  assert.ok(!html.includes("url('./assets/"));
  assert.ok(!/<(?:script|link)[^>]+(?:src|href)=/.test(html));
  assert.ok(html.includes("connect-src 'none'"));
  const data = html.match(/id="flash-design">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(data), card);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Script(script));
  assert.ok(script.includes("pointermove"));
  assert.ok(script.includes("ArrowLeft"));
  assert.ok(script.includes("prefers-reduced-motion"));
});

test('filenames and embedded JSON remain safe for punctuation and international titles', () => {
  assert.equal(exportFilename('../../ Hello / Club', 'html'), 'flash-hello-club.html');
  assert.equal(exportFilename('旅行', 'json'), 'flash-card.json');
  assert.equal(JSON.parse(safeJSON({ value: '</script>&\u2028' })).value, '</script>&\u2028');
});

test('static build includes the full standalone page and excludes authoring and test files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flash-build-'));
  try {
    await buildFlash(directory);
    const files = await readdir(join(directory, 'flash'));
    for (const file of ['index.html','editor.js','renderer.js','card.css','export.js','export-assets.js','storage.js','assets']) assert.ok(files.includes(file));
    for (const file of ['tests','build.mjs','README.md']) assert.ok(!files.includes(file));
    const html = await readFile(join(directory, 'flash/index.html'), 'utf8');
    assert.ok(html.includes('https://zelinzhu-richard.github.io/flash/'));
    assert.ok(html.includes('Download interactive card'));
    assert.ok(!html.includes('/_nuxt/'));
    const bundle = await readFile(join(directory, 'flash/export-assets.js'), 'utf8');
    assert.ok(bundle.includes(font));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('all website navigation surfaces and deployment checks include Flash', async () => {
  const root = new URL('../../../', import.meta.url);
  const [pages, runtime, build, verify] = await Promise.all(['site/pages.mjs','public/_nuxt/CbdjwYMp.js','tools/build.mjs','tools/verify.mjs'].map(file => readFile(new URL(file, root), 'utf8')));
  assert.ok(pages.includes("['/flash/','Flash']"));
  assert.ok(runtime.includes('to:"/flash/"'));
  assert.ok(runtime.includes('link:"/flash/",text:"Flash"'));
  assert.ok(build.includes("await buildFlash('dist')"));
  assert.ok(build.includes("'/flash/'"));
  assert.ok(verify.includes("'flash/index.html'"));
});
