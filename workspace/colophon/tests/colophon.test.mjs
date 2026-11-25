// Tests for /colophon/: the page's structure and links, the figures the build fills in,
// and the facts in the copy that another file in the repo can prove or disprove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COLOPHON_DESCRIPTION, SWATCHES, colophonPage, fillStats } from '../page.mjs';
import { COLOPHON_FILES, buildColophon, countDependencies, finishColophon, siteStats } from '../build.mjs';
import { siteIndex } from '../../palette/index.mjs';
import { HERO_NAME_FILES } from '../../hero-name/build.mjs';
import { CLOUD, cloudEnabled } from '../../daily/app/cloud-config.js';

const repo = path => new URL(`../../../${path}`, import.meta.url);
const read = path => readFile(repo(path), 'utf8');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const anchors = html => [...html.matchAll(/<a\s[^>]*>/g)].map(m => m[0]);
const count = (html, pattern) => (html.match(pattern) || []).length;

const page = colophonPage();
const everything = page.slice(page.indexOf('<section id="everything"'));

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'colophon-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('the page has one h1, its sections in order, and unique ids', () => {
  assert.equal(count(page, /<h1[\s>]/g), 1);
  assert.match(page, /<h1>How this site is made<\/h1>/);
  const titles = ['Numbers', 'Build', 'Type', 'Colour', 'Borrowed', 'What it does not do', 'Everything here'];
  const places = titles.map(title => page.indexOf(`>${title}</h2>`));
  assert.ok(places.every(at => at > 0), 'every section heading is present');
  assert.deepEqual(places, [...places].sort((a, b) => a - b));
  assert.equal(count(page, /<h2[\s>]/g), titles.length);
  const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'no id is used twice');
  assert.ok(ids.includes('everything'), 'the palette fallback links to #everything');
  for (const [, id] of page.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(id), `#${id} exists`);
  assert.ok(COLOPHON_DESCRIPTION.length > 60 && !/[<>"]/.test(COLOPHON_DESCRIPTION));
  for (const [, id] of page.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(id), `the label #${id} exists`);
});

// Runs once site/pages.mjs renders the page; until then there is no frame to check against.
test('inside the site frame the body is unchanged, its ids stay unique and its stylesheet is linked', async t => {
  const { pages } = await import('../../../site/pages.mjs');
  const framed = pages().get('colophon/index.html');
  if (!framed) return t.skip('site/pages.mjs does not render /colophon/ yet');
  assert.ok(framed.includes(page));
  assert.ok(framed.includes('<link rel="stylesheet" href="/colophon/style.css">'));
  assert.ok(framed.includes(`<meta name="description" content="${escape(COLOPHON_DESCRIPTION)}">`));
  assert.ok(framed.includes('<link rel="canonical" href="https://zelinzhu-richard.github.io/colophon/">'));
  assert.ok(!framed.includes('noindex'));
  assert.equal(count(framed, /<h1[\s>]/g), 1);
  const ids = [...framed.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'no id of the body repeats one of the frame');
});

test('Everything here lists every item of the site index once, with its destination', () => {
  const groups = siteIndex();
  const items = groups.flatMap(g => g.items);
  assert.equal(count(everything, /<li>/g), items.length);
  groups.forEach((g, i) => {
    assert.ok(everything.includes(`<h3 id="everything-${i + 1}">${escape(g.group)}</h3>\n<ul role="list" aria-labelledby="everything-${i + 1}">`), `${g.group} labels its list`);
  });
  for (const item of items) {
    assert.equal(everything.split(`<a href="${escape(item.href)}"`).length, 2, `${item.href} is linked once`);
    assert.ok(everything.includes(`</span> <span class="colophon-hint">${escape(item.hint)}</span></a>`), `${item.title} shows its hint, a space after its title`);
    assert.ok(everything.includes(`${item.label ? `<span class="colophon-label">${item.label}</span> ` : '<span class="colophon-title">'}${escape(item.title)}`), `${item.title} shows its title`);
  }
  assert.equal(count(everything, /aria-current="page"/g), 1, 'the page marks its own row');
  assert.match(everything, /<a href="\/colophon\/" aria-current="page">/);
  // Checked on the page's own copy: an item's title or hint may well contain the word "null".
  assert.doesNotMatch(colophonPage({ index: [] }), /undefined|\bnull\b|NaN|\[object /, 'no value was left unset');
});

test('the list is generated: a new index item becomes a row, escaped', () => {
  const html = colophonPage({ index: [{ group: 'Test & more', items: [
    { title: 'A <b> page', hint: 'Its "hint"', href: '/x/?a=1&b=2', label: '09' },
    { title: 'Out', hint: 'Somewhere else', href: 'https://example.org/', external: true },
    { title: 'Bare', href: '/bare/' },
  ] }, { group: 'Second', items: [] }] });
  const list = html.slice(html.indexOf('<section id="everything"'));
  assert.equal(count(list, /<li>/g), 3);
  assert.ok(list.includes('<h3 id="everything-1">Test &amp; more</h3>'));
  assert.ok(list.includes('<h3 id="everything-2">Second</h3>\n<ul role="list" aria-labelledby="everything-2"></ul>'));
  assert.ok(list.includes('<a href="/x/?a=1&amp;b=2"><span class="colophon-title"><span class="colophon-label">09</span> A &lt;b&gt; page</span> <span class="colophon-hint">Its &quot;hint&quot;</span></a>'));
  assert.ok(list.includes('<a href="https://example.org/" target="_blank" rel="noopener noreferrer">'));
  assert.ok(list.includes('<a href="/bare/"><span class="colophon-title">Bare</span></a>'), 'an item with no hint gets no empty hint');
  assert.ok(!list.includes('<b>') && !list.includes('undefined'));
});

test('links that leave the site open a new tab safely and say so; the others stay', () => {
  const outside = anchors(page).filter(tag => /href="https:/.test(tag));
  assert.ok(outside.length >= 3, 'source, provenance and sharks links at least');
  for (const tag of anchors(page)) {
    if (/href="https:/.test(tag)) assert.match(tag, / target="_blank" rel="noopener noreferrer"/, tag);
    else assert.doesNotMatch(tag, /target=/, tag);
    assert.doesNotMatch(tag, /href="http:/, tag);
  }
  assert.equal(count(page, /<span aria-hidden="true">↗<\/span><span class="visually-hidden"> \(opens in a new tab\)<\/span>/g), outside.length);
  for (const href of ['https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io', 'https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io/blob/main/THIRD_PARTY.md', 'https://github.com/stackedlol/ascii-sharks']) {
    assert.ok(page.includes(`href="${href}"`), href);
  }
});

test('the figures are the four placeholders, one each', () => {
  const keys = [...page.matchAll(/data-stat="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(keys, ['pages', 'files', 'size', 'deps']);
  for (const key of keys) assert.ok(page.includes(`<dd><span data-stat="${key}">–</span></dd>`), key);
});

test('nothing the build forbids, and no unlisted page, is on the page or in its stylesheet', async () => {
  const css = await read('workspace/colophon/style.css');
  const forbidden = ['/Users/', '/src/main.jsx', 'noomoagency.com', 'hello@noomo', 'Noomo Agency Logo', '/cases/', 'videos/cases', 'noindex'];
  // Unlisted pages are judged by destination, so a post called "Duke" does not fail this.
  assert.doesNotMatch(page, /href="\/(?:choices|duke|hq|repolarisdm)(?:[\/?#"])/, 'no link to an unlisted page');
  for (const word of ['/choices', '/duke', '/hq', 'repolarisdm']) assert.ok(!colophonPage({ index: [] }).includes(word) && !css.includes(word), `"${word}" must not appear in the page's own copy`);
  for (const text of [page, css, COLOPHON_DESCRIPTION]) {
    for (const word of forbidden) assert.ok(!text.includes(word), `"${word}" must not appear`);
    assert.doesNotMatch(text, /https?:\/\/(?:localhost|127\.0\.0\.1)/);
    assert.doesNotMatch(text, /\b(?:gh[pousr]_|github_pat_|sb_secret_|sk-ant-|AKIA|eyJ)[A-Za-z0-9_-]{10,}/);
  }
});

test('fillStats writes every figure, escapes it and leaves the rest alone', () => {
  const stats = { pages: 65, files: 422, size: '134.8', deps: 0 };
  const html = fillStats(page, stats);
  for (const [key, value] of Object.entries(stats)) assert.ok(html.includes(`<span data-stat="${key}">${value}</span>`), key);
  assert.ok(!html.includes('">–</span>'));
  assert.equal(html.replace(/(data-stat="[a-z]+">)[^<]*/g, '$1–'), page);
  assert.equal(fillStats(html, stats), html, 'filling twice changes nothing');
  assert.equal(fillStats('<span data-stat="size">–</span>', { size: '<1 & "2">' }), '<span data-stat="size">&lt;1 &amp; &quot;2&quot;&gt;</span>');
});

test('fillStats fails when a figure and a placeholder do not pair up', () => {
  assert.throws(() => fillStats(page, { pages: 1, files: 2, size: '0.1' }), /no value for the "deps" figure/);
  assert.throws(() => fillStats(page, { pages: 1, files: 2, size: '0.1', deps: undefined }), /no value for the "deps" figure/);
  assert.throws(() => fillStats(page, { pages: 1, files: 2, size: '0.1', deps: 0, extra: 3 }), /no placeholder for the "extra" figure/);
  assert.throws(() => fillStats('<p>no figures here</p>', { pages: 1 }), /no placeholder for the "pages" figure/);
  assert.throws(() => fillStats('<span data-stat="constructor">–</span>', {}), /no value/);
});

test('siteStats counts pages, files, size and dependencies of a built tree', async t => {
  const dir = await tempDir(t);
  const site = join(dir, 'site');
  await mkdir(join(site, 'about'), { recursive: true });
  await mkdir(join(site, 'models'), { recursive: true });
  await writeFile(join(site, 'index.html'), 'x'.repeat(10));
  await writeFile(join(site, 'about', 'index.html'), 'about');
  await writeFile(join(site, 'about', 'style.css'), 'a{}');
  await writeFile(join(site, '.nojekyll'), '');
  await writeFile(join(site, 'models', 'scene.bin'), Buffer.alloc(1.5 * 1024 * 1024));
  // The figures are what a visitor can open: an unlisted folder at the top level is left out, a folder of the same name deeper down is not.
  await mkdir(join(site, 'hq'), { recursive: true });
  await writeFile(join(site, 'hq', 'index.html'), 'x'.repeat(4 * 1024 * 1024));
  await mkdir(join(site, 'about', 'duke'), { recursive: true });
  await writeFile(join(site, 'about', 'duke', 'note.txt'), 'kept');
  await writeFile(join(dir, 'package.json'), JSON.stringify({ dependencies: { a: '1', b: '1' }, devDependencies: { c: '1' } }));
  assert.deepEqual(await siteStats(site, { packageFile: join(dir, 'package.json') }), { pages: 2, files: 6, size: '1.5', deps: 3 });
  assert.equal(countDependencies({}), 0);
  assert.equal(countDependencies({ dependencies: { a: '1' } }), 1);
});

test('the build copies the stylesheet, then fills the figures from the finished tree', async t => {
  const site = await tempDir(t);
  await mkdir(join(site, 'colophon'), { recursive: true });
  await writeFile(join(site, 'colophon', 'index.html'), `<main>${page}</main>`);
  await buildColophon(site);
  for (const file of COLOPHON_FILES) assert.equal(await readFile(join(site, 'colophon', file), 'utf8'), await read(`workspace/colophon/${file}`));
  const stats = await finishColophon(site);
  assert.deepEqual(stats, { pages: 1, files: 2, size: '0.0', deps: 0 });
  const html = await readFile(join(site, 'colophon', 'index.html'), 'utf8');
  assert.equal(html, `<main>${fillStats(page, stats)}</main>`);
  assert.ok(!html.includes('">–</span>'));
  // The same test tools/verify.mjs applies to the built page.
  assert.doesNotMatch(html, /data-stat="[^"]*">[^<0-9]/);
  assert.deepEqual(await finishColophon(site), stats, 'a second run counts the same tree');
});

test('the stylesheet uses its own prefix and tokens only, and nothing moves', async () => {
  const css = (await read('workspace/colophon/style.css')).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = css.replace(/url\([^)]*\)/g, '');
  const classes = new Set([...rules.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
  for (const name of classes) assert.ok(name.startsWith('colophon-'), `.${name} needs the colophon- prefix`);
  const used = new Set([...page.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(' ')));
  for (const name of used) if (name.startsWith('colophon-')) assert.ok(classes.has(name), `.${name} is used on the page but not styled`);
  for (const name of classes) assert.ok(used.has(name), `.${name} is styled but not on the page`);
  assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i, 'colours come from tokens');
  assert.doesNotMatch(rules, /gradient|blur\(|backdrop-filter|border-radius|box-shadow|transition|animation|@keyframes/);
  const shared = await read('public/portfolio.css');
  for (const [query] of css.matchAll(/@media\((?:max|min)-width:\d+px\)/g)) assert.ok(shared.includes(query), `${query} is a breakpoint the shared stylesheet uses`);
  assert.match(css, /\[data-stat="deps"\]\{color:var\(--accent\)\}/);
  assert.equal(count(rules, /var\(--accent\)/g), 2, 'the zero, and the hovered title');
});

test('the swatches show the real night tokens', async () => {
  const css = await read('public/portfolio.css');
  const start = css.indexOf(':root{');
  const night = css.slice(start, css.indexOf('}', start));
  assert.deepEqual(SWATCHES.map(([token]) => token), ['--paper', '--card', '--line', '--muted', '--ink', '--accent']);
  for (const [token, hex] of SWATCHES) {
    assert.equal(night.match(new RegExp(`${token}:\\s*(#[0-9a-f]+)`, 'i'))?.[1].toLowerCase(), hex, `${token} in portfolio.css`);
    assert.ok(page.includes(`style="background:var(${token})"`) && page.includes(`<code>${token}</code> ${hex}`), token);
  }
});

test('the type notes match the font stacks and the font files that ship', async () => {
  const css = await read('public/portfolio.css');
  const stack = name => css.match(new RegExp(`${name}:([^;}\\n]+)`))[1];
  assert.match(stack('--font-display'), /^Neoris,/);
  assert.match(css, /font-family:Neoris;\s*src:url\('\/_nuxt\/TTNeoris[^']+'\)/, 'TT Neoris comes from the captured homepage files');
  const body = stack('--font-body');
  const order = ['Iowan Old Style', 'Charter', 'Sitka Text', 'Cambria', 'Georgia'].map(face => body.indexOf(face));
  assert.ok(order.every(at => at >= 0) && order.join() === [...order].sort((a, b) => a - b).join(), 'the reading faces, in the order the page names them');
  assert.doesNotMatch(css, /fonts\.googleapis|fonts\.gstatic/, 'nothing is downloaded from a font service');
  for (const face of ['SF Mono', 'Menlo', 'Consolas']) assert.ok(stack('--font-mono').includes(face), face);
  // The homepage name: the specimen must load the same file the homepage does, and its license must ship.
  const font = 'ibarra-real-nova-italic.woff2';
  assert.ok(HERO_NAME_FILES.includes(font) && HERO_NAME_FILES.includes('OFL.txt'));
  assert.ok(existsSync(repo(`workspace/hero-name/${font}`)));
  assert.ok((await read('workspace/hero-name/hero-name.css')).includes(`url("/hero-name/${font}")`));
  assert.ok((await read('workspace/colophon/style.css')).includes(`url('/hero-name/${font}')`));
  assert.ok(page.includes('<a href="/hero-name/OFL.txt">'));
  assert.match(await read('workspace/hero-name/OFL.txt'), /SIL Open Font License/);
});

test('the facts in the copy still hold in the repo', async () => {
  // "no npm dependencies", and the accent figure is a zero.
  assert.equal(countDependencies(JSON.parse(await read('package.json'))), 0, 'the page says the project has no npm dependencies');
  // "A push to main runs the tests, builds the site and deploys it."
  const deploy = await read('.github/workflows/deploy.yml');
  assert.match(deploy, /branches: \[main\]/);
  assert.ok(deploy.indexOf('npm test') > 0 && deploy.indexOf('npm test') < deploy.indexOf('npm run build') && deploy.indexOf('npm run build') < deploy.indexOf('deploy-pages'));
  // "A checker ... fails the build on a broken link, a missing anchor, a JavaScript syntax error or anything that looks like a leaked key."
  const verify = await read('tools/verify.mjs');
  for (const message of ['Missing local target', 'Missing anchor', 'JavaScript syntax error', 'Possible secret material']) assert.ok(verify.includes(message), message);
  assert.match(await read('tools/build.mjs'), /tools\/verify\.mjs[\s\S]*process\.exit\(/, 'the build stops when the checker fails');
  // "Only Daily calls an outside server: it asks Supabase for my game." If sync is ever switched off,
  // the Build and Sync copy must change.
  assert.ok(cloudEnabled(CLOUD), 'Daily has a Supabase project configured');
  const cloud = await read('workspace/daily/app/cloud.js');
  assert.ok(cloud.includes('/rest/v1/daily_public?select=snapshot'), 'visitors read the public copy of the game');
  assert.match(cloud, /client\.auth\.signInWithOAuth/, 'supabase-js handles the sign-in');
  // "GitHub Pages, which serves the site, logs IP addresses for security." Gym's privacy note says the same.
  assert.match(await read('workspace/gym/index.html'), /GitHub Pages logs IP addresses<\/a> for security/);
  // The vendored libraries the Borrowed section names.
  for (const file of ['workspace/ppiano/vendor/mediapipe', 'workspace/ppiano/vendor/opencv.js', 'workspace/gym/vendor/mediapipe', 'workspace/daily/vendor/supabase.js', 'workspace/ascii-sharks/vendor', 'THIRD_PARTY.md']) {
    assert.ok(existsSync(repo(file)), file);
  }
  assert.match(await read('workspace/ascii-sharks/NOTICE.txt'), /https:\/\/github\.com\/stackedlol\/ascii-sharks/);
  // "The borrowed homepage came with Google Analytics; it is switched off and its ID is removed."
  assert.match(await read('public/index.html'), /gtag:\{enabled:false,initMode:"manual",id:""/);
});
