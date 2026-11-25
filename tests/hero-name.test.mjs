import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HERO_NAME_FILES, buildHeroName } from '../workspace/hero-name/build.mjs';
import { RELEASE_DIR } from '../workspace/home/stamp.mjs';

const dir = 'workspace/hero-name/';

test('hero font is a self-hosted woff2 under 40 KB and ships with its OFL license', async () => {
  const font = await readFile(`${dir}ibarra-real-nova-italic.woff2`);
  assert.equal(font.subarray(0, 4).toString('latin1'), 'wOF2');
  assert.ok(font.length < 40 * 1024, `font is ${(font.length / 1024).toFixed(1)} KB`);
  assert.match(await readFile(`${dir}OFL.txt`, 'utf8'), /SIL Open Font License, Version 1\.1/);
  assert.deepEqual(HERO_NAME_FILES, ['ibarra-real-nova-italic.woff2', 'OFL.txt']);
  for (const file of HERO_NAME_FILES) assert.ok((await stat(dir + file)).size > 0, file);
});

test('the build ships the font and its license at /hero-name/ and leaves the homepage alone', async t => {
  const out = await mkdtemp(join(tmpdir(), 'hero-name-test-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  const pages = {};
  for (const file of ['index.html', 'contacts/index.html']) {
    pages[file] = await readFile(join(RELEASE_DIR, file), 'utf8');
    await mkdir(join(out, file, '..'), { recursive: true });
    await writeFile(join(out, file), pages[file]);
  }
  assert.deepEqual(await buildHeroName(out), ['hero-name/ibarra-real-nova-italic.woff2', 'hero-name/OFL.txt']);
  assert.deepEqual((await readdir(join(out, 'hero-name'))).sort(), [...HERO_NAME_FILES].sort());
  for (const file of HERO_NAME_FILES) assert.deepEqual(await readFile(join(out, 'hero-name', file)), await readFile(dir + file), file);
  // The old phoenix page's stylesheet and hero-line script stay in the folder; nothing ships or loads them.
  for (const [file, html] of Object.entries(pages)) {
    assert.equal(await readFile(join(out, file), 'utf8'), html, `${file} is untouched`);
    assert.doesNotMatch(html, /\/hero-name\//, `${file} loads nothing from /hero-name/`);
  }
  assert.ok(!(await readdir(out)).includes('start.js'), 'there is no captured start.js to patch');
});
