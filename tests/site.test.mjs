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
  for (const { href } of story.cards) {
    const [path, anchor] = href.split('#');
    if (path.endsWith('.pdf')) { assert.equal(path, LINKS.resume); continue; }
    const html = output.get(path.slice(1) + 'index.html');
    assert.ok(html, `Missing page for ${href}`);
    if (anchor) assert.ok(html.includes(`id="${anchor}"`));
  }
});
