import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { pages } from '../site/pages.mjs';
import { PORTRAIT_FILES } from '../workspace/portrait/build.mjs';
import { styles } from '../workspace/portrait/portrait.js';

const dir = 'workspace/portrait/';

test('living portrait cycles the six styles in the agreed order', () => {
  assert.deepEqual(styles.map(s => s.id), ['ascii', 'hatch', 'scribble', 'halftone', 'neon', 'pixel']);
});

test('portrait data sheets are 240 x 300 greyscale PNGs with six planes', async () => {
  for (const id of ['a', 'b']) {
    const png = await readFile(`${dir}data/${id}.png`);
    assert.ok(png.subarray(1, 4).equals(Buffer.from('PNG')), `${id}.png is a PNG`);
    assert.equal(png.readUInt32BE(16), 240, 'width');
    assert.equal(png.readUInt32BE(20), 300 * 6, 'height: six stacked planes');
    assert.equal(png[25], 0, 'colour type 0: greyscale without alpha, so values decode exactly');
  }
});

test('everything the portrait ships stays under the 300 KB budget', async () => {
  let total = 0;
  for (const file of PORTRAIT_FILES) total += (await stat(dir + file)).size;
  assert.ok(total < 300 * 1024, `portrait payload is ${(total / 1024).toFixed(1)} KB`);
});

test('the source photos never ship or get committed', async () => {
  assert.ok(PORTRAIT_FILES.every(f => !f.startsWith('photos/')));
  assert.match(await readFile('.gitignore', 'utf8'), /^\/workspace\/portrait\/photos\/$/m);
});

test('About page photo opens the living portrait', () => {
  const html = pages().get('about/index.html');
  assert.match(html, /<figure data-portrait-figure>\s*<button type="button" class="portrait-trigger" aria-label="[^"]+">/);
  assert.match(html, /<script type="module" src="\/portrait\/about\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\/portrait\/portrait\.css">/);
  assert.match(html, /<img src="\/richard\.jpg" alt="" width="800" height="1000">/, 'the photo stays the no-JS fallback');
});

// Codex review on PR #8: closing the portrait while it was still loading left a renderer mounted on the
// detached canvas (observers and listeners with no way to destroy them). Checked in a browser too.
test('closing the portrait while it loads never leaves a renderer running', async () => {
  const source = await readFile(`${dir}about.js`, 'utf8');
  const close = source.indexOf('closed = true');
  assert.ok(close > 0 && close < source.indexOf('portrait?.destroy()'), 'Show the photo marks this opening closed');
  assert.match(source, /await load\(\);\s*if \(closed\) return;/, 'no mount after closing during the module load');
  assert.match(source, /await mountPortrait\([^)]*\);\s*if \(closed\) \{ mounted\.destroy\(\); return; \}/, 'a mount that resolves after closing is destroyed');
});
