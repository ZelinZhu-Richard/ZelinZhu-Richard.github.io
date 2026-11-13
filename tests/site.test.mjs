import { existsSync } from 'node:fs';
import { PARTS, stoneHash } from '../workspace/stones/parts.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pages } from '../site/pages.mjs';
import { story } from '../site/story.mjs';
import { PROJECTS, LINKS } from '../site/content.mjs';

test('personal pages expose the supplied project, research, CV, and social destinations', () => {
  const output = pages();
  const work = output.get('work/index.html');
  for (const project of PROJECTS) {
    assert.ok(work.includes(project.name));
    assert.ok(work.includes(`href="${project.live}"`));
    assert.ok(work.includes(`href="${project.repo}"`));
  }
  assert.ok(output.get('research/index.html').includes('UNC PRIMES'));
  for (const html of output.values()) {
    for (const href of [LINKS.github, LINKS.linkedin, LINKS.x, LINKS.resume]) assert.ok(html.includes(`href="${href}"`));
    assert.ok(!/noomoagency|localhost|noindex/.test(html));
  }
});

test('every phoenix crystal has a real personal destination and every scene fits its slot', () => {
  const output = pages();
  assert.equal(story.cards.length, 7);
  assert.equal(story.scenes.length, 17);
  // Each crystal hands off to one part of the site through a homepage hash (workspace/stones).
  assert.deepEqual(story.cards.map(c => c.href), PARTS.map(stoneHash));
  for (const { href } of PARTS) {
    if (href === '/daily/') { assert.ok(existsSync('workspace/daily/pages/index.html')); continue; }
    assert.ok(output.get(href.slice(1) + 'index.html'), `Missing page for ${href}`);
  }
});

test('the menu is the seven sections, and Now and Experiments are gone', async () => {
  const { stoneNav, ownerOf } = await import('../workspace/stones/parts.mjs');
  const { panels } = await import('../workspace/stones/panels.mjs');
  assert.deepEqual(PARTS.map(p => p.title), ['About', 'Projects', 'Research', 'Art', 'Fun', 'Blog', 'Daily']);
  assert.deepEqual(panels().map(p => p.id), PARTS.map(p => p.id));
  for (const [path, owner] of [['/video/', 'art'], ['/gym/', 'fun'], ['/flash/', 'fun'], ['/skills/', 'about'], ['/blog/first/', 'blog']]) assert.equal(ownerOf(path), owner, path);
  assert.match(stoneNav('/video/'), /<a href="\/art\/" aria-current="page">/);
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
  for (const p of PUBLICATIONS) {
    assert.ok(html.includes(p.title.replace(/&/g, '&amp;')));
    assert.ok(html.includes(`href="${p.href}"`));
  }
});

test('experience row layout stays on the rows, never on the tags inside them', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile('public/portfolio.css', 'utf8');
  assert.doesNotMatch(css, /\.experience li\s*[{,]/);
  assert.match(css, /\.experience ol>li\{display:grid/);
});
