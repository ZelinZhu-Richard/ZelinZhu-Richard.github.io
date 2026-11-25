import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { PARTS } from '../workspace/stones/parts.mjs';
import { buildStones, isHomeShell, withStones } from '../workspace/stones/build.mjs';
import { RELEASE_DIR } from '../workspace/home/stamp.mjs';

const SITE = 'https://zelinzhu-richard.github.io';

// Runs the shipped arrive.js against a stand-in document and reports whether the fade was switched on.
async function arrives({ referrer, type = 'navigate', origin = SITE, timing = true }) {
  const classes = new Set();
  const context = {
    URL,
    location: { origin },
    document: { referrer, documentElement: { classList: { add: name => classes.add(name) } } },
    performance: timing ? { getEntriesByType: kind => (kind === 'navigation' ? [{ type }] : []) } : {},
  };
  vm.runInNewContext(await readFile('workspace/stones/arrive.js', 'utf8'), context);
  return classes.has('stone-arrive');
}

test('a section page fades in when the visitor comes from the homepage or Contact page', async () => {
  // The homepage's stones travel with location.assign(href), so the referrer is the homepage.
  assert.equal(await arrives({ referrer: `${SITE}/` }), true);
  assert.equal(await arrives({ referrer: `${SITE}/#stones` }), true);
  assert.equal(await arrives({ referrer: `${SITE}/contacts/` }), true);
  assert.equal(await arrives({ referrer: `${SITE}/`, timing: false }), true, 'older browsers without navigation timing');
  // Nothing else plays it.
  assert.equal(await arrives({ referrer: `${SITE}/`, type: 'reload' }), false, 'a reload');
  assert.equal(await arrives({ referrer: `${SITE}/`, type: 'back_forward' }), false, 'back or forward');
  assert.equal(await arrives({ referrer: `${SITE}/about/` }), false, 'another section');
  assert.equal(await arrives({ referrer: 'https://example.com/' }), false, 'another site');
  assert.equal(await arrives({ referrer: '' }), false, 'no referrer');
  assert.equal(await arrives({ referrer: 'not a url' }), false, 'an unreadable referrer');
  const css = await readFile('workspace/stones/stones.css', 'utf8');
  assert.match(css, /html\.stone-arrive main\{animation:stone-arrive/);
  const reduced = css.slice(css.indexOf('@media(prefers-reduced-motion:reduce){'));
  assert.match(reduced, /^@media[^@]*html\.stone-arrive main\{animation:none\}/, 'no fade under reduced motion');
  assert.doesNotMatch(css, /stone-veil|stone-ring|stone-pop|home-stones|mobile-menu-button|portfolio-desktop-links/, 'the captured homepage rules left with it');
});

test('the homepage and Contact page are left as the release built them; the section pages get the fade', async t => {
  const out = await mkdtemp(join(tmpdir(), 'stones-test-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  const page = (body = '') => `<!doctype html><html lang="en"><head><title>x</title></head><body><header><nav id="navigation"><a href="/now/">Now</a></nav></header><main>${body}</main></body></html>`;
  const home = {};
  for (const file of ['index.html', 'contacts/index.html']) home[file] = await readFile(join(RELEASE_DIR, file), 'utf8');
  const files = { ...home, 'work/index.html': page(), 'daily/eggs/index.html': page(), 'colophon/index.html': page() };
  for (const part of PARTS) files[`${part.href.slice(1)}index.html`] = page(part.title);
  for (const [file, html] of Object.entries(files)) {
    await mkdir(dirname(join(out, file)), { recursive: true });
    await writeFile(join(out, file), html);
  }
  await buildStones(out);
  assert.deepEqual((await readdir(join(out, 'stones'))).sort(), ['arrive.js', 'stones.css'], 'no homepage stone script ships');
  for (const [file, html] of Object.entries(home)) {
    assert.ok(isHomeShell(html), `${file} is the release shell`);
    assert.equal(await readFile(join(out, file), 'utf8'), html, `${file} is untouched`);
  }
  const about = await readFile(join(out, 'about/index.html'), 'utf8');
  const version = about.match(/\/stones\/arrive\.js\?v=([0-9a-f]{10})"/)?.[1];
  assert.ok(version, 'the arrival script is versioned');
  assert.ok(about.includes(`<link rel="stylesheet" href="/stones/stones.css?v=${version}">\n<script src="/stones/arrive.js?v=${version}"></script>\n</head>`));
  assert.match(about, /<nav class="stone-next" aria-label="Next part"><a class="next" href="\/projects\/">/);
  assert.match(about, /<nav id="navigation" class="stone-nav" aria-label="Main navigation">/, 'the old page list becomes the stone menu');
  assert.match(await readFile(join(out, 'colophon/index.html'), 'utf8'), /class="stone-nav"/);
  assert.equal(withStones(about, { index: 0 }), about, 'running it again changes nothing');
});

test('the homepage links each stone to its section page, in order', async () => {
  const html = await readFile(join(RELEASE_DIR, 'index.html'), 'utf8');
  const stones = [...html.matchAll(/<a class="stone-link" href="([^"]+)" data-stone="([^"]+)">/g)].map(m => [m[2], m[1]]);
  assert.deepEqual(stones, PARTS.map(p => [p.id, p.href]));
  assert.doesNotMatch(html, /#to-/, 'no hash hand-off: the stones are real links');
});
