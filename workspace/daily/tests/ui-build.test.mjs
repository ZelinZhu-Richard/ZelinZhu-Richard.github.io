import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { buildDaily } from '../build.mjs';

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

let out;
let files;
test.before(async () => {
  out = await mkdtemp(join(tmpdir(), 'daily-ui-build-'));
  await buildDaily(out);
  files = (await walk(join(out, 'daily'))).map(f => relative(join(out, 'daily'), f).split('\\').join('/'));
});
test.after(async () => { await rm(out, { recursive: true, force: true }); });

test('build writes exactly the two Daily pages', () => {
  const pages = files.filter(f => f.endsWith('.html'));
  assert.deepEqual(pages.sort(), ['eggs/index.html', 'index.html']);
});

test('build copies only the runtime allowlist', () => {
  for (const f of files) {
    const ok = ['index.html', 'eggs/index.html', 'style.css', 'snapshot.json'].includes(f) || /^(app|engine|pets)\//.test(f);
    assert.ok(ok, `unexpected file in dist/daily: ${f}`);
    assert.doesNotMatch(f, /(^|\/)(fixtures|tests?|sim|_private|\.qa)(\/|$)/, `excluded folder shipped: ${f}`);
    assert.doesNotMatch(f, /\.(md|mjs|py)$/, `doc or dev file shipped: ${f}`);
  }
  assert.ok(files.includes('app/daily.js') && files.includes('app/eggs.js') && files.includes('app/backend.js'));
});

for (const [file, path] of [['index.html', '/daily/'], ['eggs/index.html', '/daily/eggs/']]) {
  test(`${path} has the site header, canonical, og:url and description`, async () => {
    const html = await readFile(join(out, 'daily', file), 'utf8');
    assert.ok(!html.includes('<!-- PORTFOLIO_HEADER -->') && !html.includes('<!-- PORTFOLIO_FOOTER -->'));
    const header = html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0];
    assert.ok(header, 'site header injected');
    assert.match(header, /class="wordmark"/);
    assert.match(header, /href="\/daily\/" aria-current="page">Daily</);
    assert.equal((header.match(/aria-current="page"/g) || []).length, 1, 'only Daily is current in the site nav');
    assert.match(html, /<footer class="site-footer">/);
    assert.ok(html.includes(`<link rel="canonical" href="https://zelinzhu-richard.github.io${path}">`));
    assert.ok(html.includes(`<meta property="og:url" content="https://zelinzhu-richard.github.io${path}">`));
    assert.match(html, /<meta name="description" content="[^"]{40,}">/);
    assert.match(html, /<link rel="stylesheet" href="\/portfolio.css">/, 'site fonts come from portfolio.css');
    assert.doesNotMatch(html, /fonts\.googleapis|cdn\.|unpkg|jsdelivr/i, 'no CDN or web fonts');
    assert.doesNotMatch(html, /localhost|127\.0\.0\.1/);
    assert.doesNotMatch(html, /noindex/);
    for (const id of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${id[1]}"`), `anchor #${id[1]} exists`);
  });
}

test('no local development URLs in any shipped file', async () => {
  for (const f of files) {
    if (!/\.(html|js|css|json)$/.test(f)) continue;
    const text = await readFile(join(out, 'daily', f), 'utf8');
    assert.doesNotMatch(text, /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/, `local URL in ${f}`);
    assert.doesNotMatch(text, /\/Users\//, `local path in ${f}`);
  }
});

test('static relative imports in app/ resolve inside dist', async () => {
  for (const f of files.filter(x => x.startsWith('app/') && x.endsWith('.js'))) {
    const text = await readFile(join(out, 'daily', f), 'utf8');
    for (const m of text.matchAll(/from\s*['"](\.[^'"]+)['"]/g)) {
      assert.ok(existsSync(join(out, 'daily', dirname(f), m[1])), `${f} imports missing ${m[1]}`);
    }
  }
});

test('snapshot.json is a public snapshot (preview until the owner publishes one)', async () => {
  const snap = JSON.parse(await readFile(join(out, 'daily', 'snapshot.json'), 'utf8'));
  assert.equal(snap.format, 'daily-public');
  assert.equal(snap.version, 1);
  for (const key of ['header', 'today', 'pets', 'eggs', 'petdex', 'receipts', 'ladder', 'odds']) assert.ok(key in snap, `snapshot has ${key}`);
  assert.ok(!('settings' in snap) && !('rewards' in snap) && !('redemptions' in snap));
  assert.ok(snap.today.tasks.every(t => !('goal' in t)), 'no goal links in public');
  assert.ok(!('goals' in snap.receipts));
  if (!existsSync(new URL('../public/snapshot.json', import.meta.url))) assert.equal(snap.kind, 'preview');
  assert.ok(snap.receipts.month && 'pagesRead' in snap.receipts.month);
});
