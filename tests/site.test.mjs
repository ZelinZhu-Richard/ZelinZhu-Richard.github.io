import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PARTS } from '../workspace/stones/parts.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pages } from '../site/pages.mjs';
import { PROJECTS, LINKS } from '../site/content.mjs';
import { homeContent } from '../workspace/home/content.mjs';
import { RELEASE_DIR, readStamp } from '../workspace/home/stamp.mjs';
import { HOME_FEED_LINK, HOME_FILES, HOME_INDEX_STYLE, RETIRED_PUBLIC, SHARED_FONTS, homeIndex, shipsFromPublic, withHomeIndex } from '../workspace/home/build.mjs';
import { isUnlisted, siteIndex } from '../workspace/palette/index.mjs';
import { FEED_PATH } from '../workspace/blog/feed.mjs';

const release = file => readFile(join(RELEASE_DIR, file), 'utf8');

test('personal pages expose the supplied project, research, CV, and social destinations', () => {
  const output = pages();
  const work = output.get('work/index.html');
  for (const project of PROJECTS) {
    assert.ok(work.includes(project.name));
    assert.ok(work.includes(`href="${project.live}"`));
    assert.ok(work.includes(`href="${project.repo}"`));
  }
  assert.ok(output.get('research/index.html').includes('UNC PRIMES'));
  for (const [file, html] of output) {
    for (const href of [LINKS.github, LINKS.linkedin, LINKS.x, LINKS.resume]) assert.ok(html.includes(`href="${href}"`));
    assert.ok(!/noomoagency|localhost/.test(html));
    if (file === 'choices/index.html') assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    else assert.doesNotMatch(html, /noindex/);
  }
});

test('the homepage stones and menus are the seven sections from workspace/stones/parts.mjs, each a real page', async () => {
  const output = pages();
  // workspace/home/content.mjs reads PARTS; the release was built from it (its stamp hashes homeContent()).
  assert.deepEqual(homeContent().stones, PARTS.map(({ id, title, subtitle, href }) => ({ id, title, subtitle, href })));
  const home = await release('index.html');
  const contact = await release('contacts/index.html');
  const stones = [...home.matchAll(/<a class="stone-link" href="([^"]+)" data-stone="([^"]+)">/g)].map(m => [m[2], m[1]]);
  assert.deepEqual(stones, PARTS.map(p => [p.id, p.href]), 'the homepage stones');
  const sections = [...contact.matchAll(/<a href="([^"]+)" data-stone="([^"]+)">/g)].map(m => [m[2], m[1]]);
  assert.deepEqual(sections, PARTS.map(p => [p.id, p.href]), 'the Contact page section list');
  for (const html of [home, contact]) {
    assert.deepEqual([...html.matchAll(/<a class="menu-link" href="([^"]+)">/g)].map(m => m[1]), PARTS.map(p => p.href), 'the header menu');
    assert.match(html, /<a [^>]*href="\/contacts\/"[^>]*class="[^"]*menu-contact/, 'the menu ends with Contact');
  }
  for (const { href } of PARTS) {
    if (href === '/daily/') { assert.ok(existsSync('workspace/daily/pages/index.html')); continue; }
    assert.ok(output.get(href.slice(1) + 'index.html'), `Missing page for ${href}`);
  }
});

test('the site index goes on both homepage files once, after the Nuxt root, with every public destination', async () => {
  const groups = siteIndex();
  assert.deepEqual(HOME_FILES, ['index.html', 'contacts/index.html']);
  for (const [file, path] of [['index.html', '/'], ['contacts/index.html', '/contacts/']]) {
    const html = await release(file);
    const built = withHomeIndex(html, groups, path);
    assert.equal(withHomeIndex(built, groups, path), built, `${file}: a second run changes nothing`);
    assert.equal(built.split('id="home-index"').length, 2);
    // The app's own markup is byte-identical: the style goes before </head>, the nav just before </body>.
    const head = html.indexOf('</head>');
    const body = html.lastIndexOf('</body>');
    assert.equal(built, html.slice(0, head) + HOME_FEED_LINK + HOME_INDEX_STYLE + html.slice(head, body) + homeIndex(groups, path) + html.slice(body));
    // Feed autodiscovery, as on every other page: once, pointing at the blog's feed.
    assert.equal(built.split('<link rel="alternate" type="application/rss+xml"').length, 2, `${file}: one feed link`);
    assert.ok(built.includes(`href="${FEED_PATH}">`), `${file}: the feed link points at ${FEED_PATH}`);
    assert.ok(built.indexOf('<nav id="home-index"') > built.indexOf('<div id="teleports">'), `${file}: outside #__home`);
    const nav = built.slice(built.indexOf('<nav id="home-index"'), built.indexOf('</nav>', built.indexOf('<nav id="home-index"')));
    const hrefs = [...nav.matchAll(/<a href="([^"]+)"/g)].map(m => m[1].replaceAll('&amp;', '&'));
    assert.deepEqual(hrefs, groups.flatMap(g => g.items.map(item => item.href)), `${file}: every destination, in order`);
    for (const href of ['/gym/', '/flash/', '/github/stars/', '/github/stars/research/', '/colophon/', '/work/']) assert.ok(hrefs.includes(href), `${file} links ${href}`);
    for (const href of hrefs) assert.ok(!isUnlisted(href), `${file} lists the unlisted ${href}`);
    assert.doesNotMatch(built, /href="\/(?:hq|duke|choices|repolarisdm)(?:[\/"#?])/);
    assert.equal(nav.match(/aria-current="page"/g)?.length, 1, `${file}: the current page is marked`);
    assert.ok(nav.includes(`<a href="${path}" aria-current="page">`));
    for (const m of nav.matchAll(/<a href="(https:[^"]+)"([^>]*)>/g)) assert.match(m[2], /target="_blank" rel="noopener noreferrer"/, `${m[1]} says it opens a new tab`);
  }
  assert.throws(() => homeIndex([{ group: 'Oops', items: [{ title: 'HQ', href: '/hq/' }] }], '/'), /unlisted page \/hq\//);
  assert.throws(() => withHomeIndex('<html><head></head><body><div id="__home"></div>', groups, '/'), /no <\/body>/);
  assert.match(HOME_INDEX_STYLE, /^<style id="home-index-style">\n#home-index\{position:relative;z-index:2;/, 'above the fixed scene (z-index 0) and the story (z-index 1)');
  assert.doesNotMatch(HOME_INDEX_STYLE, /url\(|@import|display:none/);
});

test('the captured phoenix runtime stays in public/ without shipping; what other pages load still ships', async () => {
  for (const path of RETIRED_PUBLIC) assert.ok(existsSync(`public/${path}`), `public/${path} stays on disk`);
  for (const file of ['index.html', 'contacts', 'contacts/index.html', 'start.js', 'local.css', '_nuxt/CbdjwYMp.js', '_nuxt/entry.BEbxiOYI.css', '_nuxt/builds', '_nuxt/builds/latest.json', 'audio/BG_music_ST.mp3', 'models/v20.glb', 'libs/draco/draco_decoder.wasm', 'textures', 'timelines/cam.glb', 'images/loader.gif']) {
    assert.equal(shipsFromPublic(file), false, file);
  }
  for (const file of ['', '_nuxt', ...SHARED_FONTS, 'portfolio.css', 'portfolio.js', 'favicon.svg', 'richard.jpg', 'Zelin_Zhu_CV.pdf']) assert.equal(shipsFromPublic(file), true, file || 'public/');
  assert.deepEqual((await readdir('public/_nuxt')).filter(name => shipsFromPublic(`_nuxt/${name}`)).sort(), SHARED_FONTS.map(f => f.slice('_nuxt/'.length)).sort());
  // Nothing outside the retired runtime points into it: every site-relative file a page or the shared CSS names ships.
  const named = [];
  for (const html of [...pages().values(), await release('index.html'), await release('contacts/index.html')]) {
    for (const m of html.matchAll(/(?:src|href)="(\/[^"#?]*)/g)) named.push(m[1]);
  }
  for (const m of (await readFile('public/portfolio.css', 'utf8')).matchAll(/url\(["']?(\/[^"')?#]+)/g)) named.push(m[1]);
  const fromRelease = new Set((await readStamp()).files.map(entry => entry.file));
  for (const path of named) {
    const file = path.slice(1);
    // "/" and "/contacts/" (and /_home/) come from workspace/home/release/, not from public/.
    if (fromRelease.has(!file || file.endsWith('/') ? `${file}index.html` : file)) continue;
    if (existsSync(`public/${file}`)) assert.ok(shipsFromPublic(file), `${path} is named by a page but would not ship`);
  }
  assert.ok(named.includes(SHARED_FONTS[0].replace(/^/, '/')), 'the pages preload TT Neoris from /_nuxt/');
});

test('the menu is the seven sections, and Now and Experiments are gone', async () => {
  const { stoneNav, ownerOf } = await import('../workspace/stones/parts.mjs');
  const { panels } = await import('../workspace/stones/panels.mjs');
  assert.deepEqual(PARTS.map(p => p.title), ['About', 'Projects', 'Research', 'Art', 'Fun', 'Blog', 'Daily']);
  assert.deepEqual(panels().map(p => p.id), PARTS.map(p => p.id));
  for (const [path, owner] of [['/video/', 'art'], ['/gym/', 'fun'], ['/flash/', 'fun'], ['/skills/', 'about'], ['/blog/first/', 'blog']]) assert.equal(ownerOf(path), owner, path);
  // The section's own page is the current page; a page inside the section marks it as the current section.
  assert.match(stoneNav('/art/'), /<a href="\/art\/" aria-current="page">/);
  assert.match(stoneNav('/video/'), /<a href="\/art\/" aria-current="true">/);
  assert.equal(stoneNav('/video/').match(/aria-current/g).length, 1);
  const output = pages();
  for (const file of ['art/index.html', 'fun/index.html', 'blog/index.html']) assert.ok(output.get(file), `Missing ${file}`);
  for (const file of ['now/index.html', 'experiments/index.html']) assert.ok(!output.has(file), `${file} should not be built`);
  for (const [file, html] of output) assert.ok(!/href="\/(now|experiments)\//.test(html), `${file} links a retired page`);
});

test('Art has Neon Rain and its own copy of the living portrait; About keeps its portrait', () => {
  const output = pages();
  const art = output.get('art/index.html');
  assert.ok(art.includes('href="/video/"'));
  assert.equal(art.match(/data-portrait-figure/g)?.length, 1);
  assert.match(art, /<section id="portrait"/);
  assert.match(art, /<script type="module" src="\/portrait\/about\.js"><\/script>/);
  for (const css of ['/work/style.css', '/portrait/portrait.css']) assert.ok(art.includes(`<link rel="stylesheet" href="${css}">`));
  assert.equal(output.get('about/index.html').match(/data-portrait-figure/g)?.length, 1);
});

test('Fun lists the three camera toys and links Flash', () => {
  const fun = pages().get('fun/index.html');
  for (const id of ['paper-piano', 'gym', 'domain-expansion']) assert.ok(fun.includes(`id="${id}"`), id);
  assert.ok(fun.includes('href="/flash/"'));
});

test('Research has an Experience section with only research roles, and a Publications section', async () => {
  const { PUBLICATIONS, EXPERIENCE } = await import('../site/content.mjs');
  const html = pages().get('research/index.html');
  const experience = html.slice(html.indexOf('id="experience"'), html.indexOf('id="publications"'));
  assert.ok(experience.includes('UNC PRIMES'));
  for (const x of EXPERIENCE.filter(x => x.org !== 'UNC PRIMES')) assert.ok(!experience.includes(x.title), `${x.title} is not a research role`);
  assert.ok(PUBLICATIONS.length >= 1);
  const text = fragment => fragment.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const plates = html.split('<li class="plate">').slice(1).map(rest => rest.slice(0, rest.indexOf('\n</li>')));
  assert.equal(plates.length, PUBLICATIONS.length, 'one plate per publication');
  PUBLICATIONS.forEach((p, i) => {
    const plate = plates[i];
    // The title is on the page as a heading (split at its colon only by markup), with its venue, authors, link and BibTeX.
    assert.equal(text(plate.match(/<h3 class="plate-title">([\s\S]*?)<\/h3>/)[1]), p.title);
    for (const fact of [p.kind, p.venue, p.authors, p.when]) assert.ok(text(plate).includes(fact), `${p.title}: ${fact}`);
    assert.ok(plate.includes(`href="${p.href}" target="_blank" rel="noopener noreferrer"`));
    assert.match(plate, /<details class="cite"><summary>Cite<\/summary>/);
  });
});

test('Research wears the instrument look: four numbered chapters under a readout that links each one', async () => {
  const { RESEARCH } = await import('../site/content.mjs');
  const html = pages().get('research/index.html');
  assert.match(html, /^<!doctype html>\n<html lang="en" data-look="instrument">/);
  // No sharks: the shark runtime's own opt-out. The canvas itself is still added by the build (tools/verify.mjs).
  assert.match(html, /<body data-ambient-background="off">/);
  assert.doesNotMatch(html, /tag-bubbles/, 'the soap bubbles stay on About');
  const chapters = [...html.matchAll(/<section id="([\w-]+)" class="chapter" aria-labelledby="\1-title">\n<header class="chapter-rail"><h2 id="\1-title"><span class="dial">(03\.\d)<\/span> ([^<]+)<\/h2>/g)].map(m => [m[1], m[2], m[3]]);
  assert.deepEqual(chapters, [['experience', '03.1', 'Experience'], ['publications', '03.2', 'Publication'], ['methods', '03.3', 'Where the methods show up'], ['tools', '03.4', 'Tools']]);
  const readout = html.slice(html.indexOf('<nav class="readout" aria-label="On this page">'), html.indexOf('</nav>', html.indexOf('class="readout"')));
  assert.deepEqual([...readout.matchAll(/<a href="#([\w-]+)"><span class="dial">(03\.\d) · /g)].map(m => [m[1], m[2]]), chapters.map(([id, n]) => [id, n]));
  assert.ok(html.includes(`<p class="interests"><span>Interests</span> ${RESEARCH.interests.join(' · ')}</p>`));
  assert.match(html, /<svg class="orrery"[^>]*aria-hidden="true"/);
  for (const id of ['nexus-tensor-alpha', 'equalvoice', 'apex-analysis']) assert.ok(html.includes(`<a href="/projects/#${id}">`), id);
  assert.ok(html.includes('href="/github/stars/research/"'), 'the Research Stack');
  // Research is machine learning on images; the page does not call it neuroscience.
  assert.doesNotMatch(html, /neuroscience/i);
  // The other pages keep the old look until they move over.
  for (const [file, page] of pages()) if (file !== 'research/index.html') assert.match(page, /^<!doctype html>\n<html lang="en">\n/, file);
});

test('experience row layout stays on the rows, never on the tags inside them', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile('public/portfolio.css', 'utf8');
  assert.doesNotMatch(css, /\.experience li\s*[{,]/);
  assert.match(css, /\.experience ol>li\{display:grid/);
});

// Copy: Al9ha is a past project, ZeroMind is what Richard works on now, and no page calls the homepage the phoenix.
test('Al9ha reads as a past project and ZeroMind as the current one', async () => {
  const { EXPERIENCE, ABOUT } = await import('../site/content.mjs');
  const al9ha = EXPERIENCE.find(x => x.org.startsWith('Al9ha'));
  assert.equal(al9ha.when, 'Nov 2025–Jun 2026');
  const nta = PROJECTS.find(p => p.id === 'nexus-tensor-alpha');
  assert.equal(nta.year, '2025–2026');
  assert.equal(nta.live, 'https://al9ha.vercel.app/', 'the Al9ha link stays');
  for (const text of [al9ha.desc, nta.oneLiner, nta.desc, nta.status]) {
    assert.doesNotMatch(text, /\bnow\b|\bso far\b|\bnext\b|\b(?:keeps|picks|is written|turn|pass|come)\b/, text);
  }
  assert.ok(ABOUT.paragraphs.every(text => !/quant research system I’m building/.test(text)), 'About no longer says Al9ha is being built');
  const zeromind = EXPERIENCE.find(x => x.org === 'ZeroMind');
  assert.deepEqual({ when: zeromind.when, title: zeromind.title }, { when: 'Nov 2026–now', title: 'Founder' });
  assert.equal(zeromind.desc, 'ZeroMind is one agent that runs on every frontier model, keeps a single memory of your whole life, and gets better at it every week.');
  assert.equal(EXPERIENCE[0].org, 'UNC PRIMES', 'the research role stays first (the stones panel reads it)');
  const output = pages();
  assert.ok(output.get('about/index.html').includes('<p class="org">ZeroMind</p>'));
  for (const [file, html] of output) {
    assert.doesNotMatch(html, /phoenix/i, `${file} still mentions the phoenix`);
    if (html.includes('class="site-footer"')) assert.ok(html.includes('<a href="/">Back to the homepage</a>'), file);
    if (html.includes('class="site-footer"')) assert.ok(html.includes('<li><a href="/contacts/">Contact</a></li>'), `${file}: the footer index links the Contact page`);
  }
});
