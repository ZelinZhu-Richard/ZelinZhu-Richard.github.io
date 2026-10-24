import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, link, mkdir, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHq, HQ_FILES } from '../build.mjs';
import { pages } from '../../../site/pages.mjs';

const hqDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

test('buildHq copies the runtime allowlist only, with a private head', async () => {
  const out = join(hqDir, '.qa', `build-test-${process.pid}`);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  try {
    // Local-first head; the configured CSP is covered in sync.test.mjs.
    await buildHq(out, { cloud: { url: '', anonKey: '' } });
    assert.deepEqual(await readdir(out), ['hq']);
    const files = (await readdir(join(out, 'hq'))).sort();
    assert.deepEqual(files, [...HQ_FILES].sort());
    for (const f of files) assert.doesNotMatch(f, /seed|private|test|\.md$/i);

    const html = await readFile(join(out, 'hq', 'index.html'), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(html, /<title>Private<\/title>/);
    assert.match(html, /<link rel="canonical" href="https:\/\/zelinzhu-richard\.github\.io\/hq\/">/);
    assert.doesNotMatch(html, /og:|twitter:|name="description"/);
    assert.match(html, /connect-src 'none'/);
    // The static page holds only the gate: no section of the command center is in the HTML.
    assert.doesNotMatch(html, /Command center|Timeline|Brain dump|Waitlist/);
    assert.match(html, /Open on this device/);

    // Every local reference resolves inside the allowlist.
    const local = [...html.matchAll(/(?:src|href)="(\/hq\/[^"]+)"/g)].map(m => m[1].replace('/hq/', ''));
    assert.deepEqual(local.sort(), ['app.js', 'style.css']);
    for (const file of ['app.js', 'store.js', 'helpers.js']) {
      const src = await readFile(join(out, 'hq', file), 'utf8');
      for (const m of src.matchAll(/from\s*['"](\.[^'"]+)['"]/g)) assert.ok(HQ_FILES.includes(m[1].replace('./', '')), `${file} imports ${m[1]}`);
      assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, `${file} must not send data anywhere`);
    }
    const css = await readFile(join(out, 'hq', 'style.css'), 'utf8');
    assert.match(css, /\/_nuxt\/TTNeorisTrialRegular\.CykOY4gR\.ttf/);
    assert.match(css, /\/_nuxt\/fonnts\.com-theseasons-it\.CUCq9ttA\.otf/);
    assert.doesNotMatch(css, /fonts\.googleapis|@import/);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('/hq/ is not in the nav or any other rendered page', async () => {
  const output = pages();
  assert.ok(!output.has('hq/index.html'), 'hq is not rendered through pages()');
  for (const [file, html] of output) assert.doesNotMatch(html, /\/hq\//, `${file} links to /hq/`);
  for (const file of ['public/index.html', 'public/contacts/index.html', 'public/_nuxt/CbdjwYMp.js']) {
    assert.doesNotMatch(await readFile(join(repoRoot, file), 'utf8'), /\/hq\//, `${file} links to /hq/`);
  }
});

// Mirrors public/ into `target` with hard links: no bytes are copied, and the real build only reads it.
async function linkTree(from, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isDirectory()) await linkTree(join(from, entry.name), join(target, entry.name));
    else await link(join(from, entry.name), join(target, entry.name));
  }
}
async function htmlFiles(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await htmlFiles(dir, rel));
    else if (rel.endsWith('.html')) out.push(rel);
  }
  return out;
}

// Runs the real tools/build.mjs (it writes ./dist relative to its working directory) in a scratch
// folder under .qa/, so the checks below read the site exactly as it deploys.
test('full build: hq/index.html is the only noindex page; sitemap and robots.txt never name /hq/', async () => {
  const work = join(hqDir, '.qa', `site-test-${process.pid}`);
  await rm(work, { recursive: true, force: true });
  try {
    await linkTree(join(repoRoot, 'public'), join(work, 'public'));
    await copyFile(join(repoRoot, 'asset-manifest.json'), join(work, 'asset-manifest.json'));
    await symlink(join(repoRoot, 'tools'), join(work, 'tools'));
    const run = spawnSync(process.execPath, [join(repoRoot, 'tools/build.mjs')], { cwd: work, encoding: 'utf8' });
    assert.equal(run.status, 0, `the build failed:\n${run.stdout}\n${run.stderr}`);
    const dist = join(work, 'dist');

    const pagesWithNoindex = [];
    for (const file of await htmlFiles(dist)) if (/noindex/i.test(await readFile(join(dist, file), 'utf8'))) pagesWithNoindex.push(file);
    assert.deepEqual(pagesWithNoindex, ['hq/index.html']);
    for (const file of ['index.html', 'daily/index.html', 'now/index.html', 'gym/index.html', 'domainexp/index.html']) {
      assert.doesNotMatch(await readFile(join(dist, file), 'utf8'), /\/hq\//, `${file} links to /hq/`);
    }
    const sitemap = await readFile(join(dist, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /<loc>https:\/\/zelinzhu-richard\.github\.io\/daily\/<\/loc>/);
    assert.doesNotMatch(sitemap, /hq/);
    assert.doesNotMatch(await readFile(join(dist, 'robots.txt'), 'utf8'), /hq/);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
