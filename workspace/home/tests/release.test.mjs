import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HOME_ROOT, RELEASE_DIR, STALE_MESSAGE, STAMP_FILE, checkRelease, isReleaseFile, listFiles, readStamp } from '../stamp.mjs';
import { buildHome } from '../build.mjs';
import { PARTS } from '../../stones/parts.mjs';

const SITE = 'https://zelinzhu-richard.github.io';
const IMAGE = `${SITE}/richard.jpg`;
const read = file => readFile(join(RELEASE_DIR, file), 'utf8');

/** A scratch copy of release/ inside _dev/, removed afterwards. */
async function withCopy(fn) {
  await mkdir(join(HOME_ROOT, '_dev'), { recursive: true });
  const dir = await mkdtemp(join(HOME_ROOT, '_dev', 'test-'));
  try {
    await cp(RELEASE_DIR, dir, { recursive: true });
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('release is fresh: checkRelease passes', async () => {
  const stamp = await checkRelease();
  assert.match(stamp.sourceHash, /^[0-9a-f]{64}$/);
});

test('checkRelease names each kind of problem', async () => {
  await withCopy(async dir => {
    await writeFile(join(dir, 'index.html'), `${await read('index.html')} `);
    await assert.rejects(checkRelease(dir), /differs from its stamp: index\.html/);
  });
  await withCopy(async dir => {
    await writeFile(join(dir, '200.html'), '');
    await assert.rejects(checkRelease(dir), /outside the allowlist: 200\.html/);
  });
  await withCopy(async dir => {
    await rm(join(dir, STAMP_FILE));
    await assert.rejects(checkRelease(dir), /no stamp/);
  });
  await withCopy(async dir => {
    const stamp = await readStamp(dir);
    await writeFile(join(dir, STAMP_FILE), JSON.stringify({ ...stamp, sourceHash: '0'.repeat(64) }));
    await assert.rejects(checkRelease(dir), { message: STALE_MESSAGE });
  });
});

test('release holds only the allowlist: two pages and /_home/ assets', async () => {
  const files = (await listFiles(RELEASE_DIR)).filter(file => file !== STAMP_FILE);
  assert.ok(files.includes('index.html'));
  assert.ok(files.includes('contacts/index.html'));
  for (const file of files) assert.ok(isReleaseFile(file), file);
  assert.ok(!files.includes('200.html') && !files.includes('404.html'));
  assert.ok(files.some(file => /^_home\/.+\.js$/.test(file)));
  assert.ok(!isReleaseFile('200.html') && !isReleaseFile('404.html') && !isReleaseFile('_nuxt/x.js') && !isReleaseFile('_home/'));
  assert.ok(isReleaseFile('home-assets/stones/about.bin'));
});

test('release text has no analytics, agency or development leftovers', async () => {
  for (const file of (await listFiles(RELEASE_DIR))) {
    const text = await read(file);
    for (const bad of ['gtag', 'googletagmanager', '/Users/', 'localhost', '_nuxt/']) assert.ok(!text.includes(bad), `${file} contains ${bad}`);
    assert.ok(!/noomo/i.test(text), `${file} mentions noomo`);
    if (file.endsWith('.html')) {
      assert.ok(!text.includes('id="navigation"'), `${file} has the old site menu`);
      assert.ok(!text.includes('class="menu-button"'), `${file} has the old menu button`);
    }
  }
});

for (const [file, route, path] of [['index.html', 'story', '/'], ['contacts/index.html', 'contact', '/contacts/']]) {
  test(`${file}: html attributes and head`, async () => {
    const html = await read(file);
    assert.match(html, /^<!DOCTYPE html>/);
    const open = html.match(/<html\s[^>]*>/)?.[0] || '';
    assert.match(open, /\slang="en"/);
    assert.match(open, new RegExp(`\\sdata-home="${route}"`));
    assert.match(html, /<title>[^<]*Richard Zhu[^<]*<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]{20,}">/);
    assert.ok(html.includes(`<link rel="canonical" href="${SITE}${path}">`));
    assert.ok(html.includes(`<meta property="og:url" content="${SITE}${path}">`));
    assert.match(html, /<meta property="og:title" content="[^"]+">/);
    assert.match(html, /<meta property="og:description" content="[^"]+">/);
    assert.ok(html.includes('<meta property="og:type" content="website">'));
    assert.ok(html.includes(`<meta property="og:image" content="${IMAGE}">`));
    assert.ok(html.includes(`<meta name="twitter:image" content="${IMAGE}">`));
    assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
    assert.ok(html.includes('<meta name="theme-color" content="#100f15">'));
    assert.ok(html.includes('<meta name="color-scheme" content="dark">'));
    assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg">'));
    assert.ok(!/name="robots"/.test(html), 'no robots meta');
    assert.ok(html.includes('<div id="__home">'));
    assert.ok(html.includes('<a class="skip-link" href="#main">') && html.includes('id="main"'));
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
    assert.match(html, /<h1[^>]*>Richard Zhu<\/h1>/);
    const nav = html.match(/<nav[^>]*aria-label="Seven sections"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav, 'seven-sections nav');
    assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m => m[1]), PARTS.map(part => part.href));
  });

  test(`${file}: every local asset it references is in the release`, async () => {
    const html = await read(file);
    const files = new Set(await listFiles(RELEASE_DIR));
    const refs = [...html.matchAll(/(?:src|href)="(\/_home\/[^"]+)"/g), ...html.matchAll(/"(\/_home\/[^"]+\.js)"/g)].map(m => m[1].slice(1));
    assert.ok(refs.length > 0);
    for (const ref of refs) assert.ok(files.has(ref), `${file} references missing ${ref}`);
  });
}

test('index.html: one section per chapter, in order', async () => {
  const html = await read('index.html');
  const ids = [...html.matchAll(/<section\b[^>]*\bid="(c\d\d)"/g)].map(m => m[1]);
  assert.deepEqual(ids, Array.from({ length: 17 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`));
  assert.ok(html.includes('<em>experiments.</em>'));
  assert.ok(html.includes('href="/contacts/"'));
});

test('contacts/index.html: contact copy and links', async () => {
  const html = await read('contacts/index.html');
  assert.ok(html.includes('Have something in mind?'));
  for (const label of ['Email', 'X', 'GitHub', 'LinkedIn']) assert.match(html, new RegExp(`<a href="[^"]+"[^>]*>${label}</a>`));
  assert.match(html, /<a href="mailto:[^"]+@[^"]+">Email<\/a>/);
});

test('buildHome copies exactly the stamped files', async () => {
  await mkdir(join(HOME_ROOT, '_dev'), { recursive: true });
  const out = await mkdtemp(join(HOME_ROOT, '_dev', 'build-'));
  try {
    const written = await buildHome(out);
    const stamp = await readStamp();
    assert.deepEqual(written, stamp.files.map(entry => entry.file));
    assert.deepEqual(await listFiles(out), [...written].sort());
    assert.equal(await readFile(join(out, 'index.html'), 'utf8'), await read('index.html'));
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
