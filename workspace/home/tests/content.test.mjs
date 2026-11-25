import test from 'node:test';
import assert from 'node:assert/strict';
import { homeContent } from '../content.mjs';
import { PARTS } from '../../stones/parts.mjs';
import { LINKS } from '../../../site/content.mjs';
import { blocks, inline, isWord } from '../app/utils/text.js';

const content = homeContent();

test('17 chapters, c01 to c17 in order, plain text only', () => {
  assert.equal(content.chapters.length, 17);
  content.chapters.forEach((chapter, index) => {
    assert.deepEqual(Object.keys(chapter), ['id', 'text']);
    assert.equal(chapter.id, `c${String(index + 1).padStart(2, '0')}`);
    assert.ok(chapter.text.trim(), `${chapter.id} is empty`);
    assert.doesNotMatch(chapter.text, /<\/?[a-z!][^>]*>|&[a-z#0-9]+;/i, `${chapter.id} contains HTML`);
    assert.doesNotMatch(chapter.text, /class=|\bclass\b|text-(?:sans|serif)-\d|gradient-text|\b(?:xs|lg|md|sm):[a-z-]/, `${chapter.id} contains class names`);
    assert.equal((chapter.text.match(/\*/g) || []).length % 2, 0, `${chapter.id} has an unclosed *italic*`);
    assert.doesNotMatch(chapter.text, /\*\*|\r|\n{3}|[ \t]\n|\n[ \t]|^\s|\s$/, `${chapter.id} has stray markup or whitespace`);
  });
});

test('chapters keep the story beats', () => {
  const text = content.chapters.map(chapter => chapter.text);
  assert.equal(text[0], 'A student of\n*what comes next.*');
  assert.deepEqual(text.slice(3, 7), ['building.', 'Learn', 'Build', 'Repeat']);
  assert.ok(text.slice(3, 7).every(isWord));
  assert.equal(text[16], 'Explore the work.\n*Follow the curiosity.*');
  const research = blocks(text[12]);
  assert.deepEqual(research.heading, [[{ text: 'Learning from images', em: false }]]);
  assert.equal(research.paragraphs.length, 1);
  assert.deepEqual(inline('become *experiments.*'), [{ text: 'become ', em: false }, { text: 'experiments.', em: true }]);
});

test('seven stones in PARTS order with id, title, subtitle, href', () => {
  assert.equal(content.stones.length, 7);
  assert.deepEqual(content.stones, PARTS.map(({ id, title, subtitle, href }) => ({ id, title, subtitle, href })));
  assert.deepEqual(content.stones.map(stone => stone.id), ['about', 'projects', 'research', 'art', 'fun', 'blog', 'daily']);
});

test('hero, meta and contact', () => {
  assert.deepEqual(content.hero, { name: 'Richard Zhu', line: 'A student of what comes next.' });
  for (const page of ['home', 'contact']) {
    assert.ok(content.meta[page].title.includes('Richard Zhu'));
    assert.ok(content.meta[page].description.length > 20);
  }
  assert.ok(content.contact.lines.length > 0);
  assert.deepEqual(content.contact.links, [
    { id: 'email', label: 'Email', href: `mailto:${LINKS.email}` },
    { id: 'x', label: 'X', href: LINKS.x },
    { id: 'github', label: 'GitHub', href: LINKS.github },
    { id: 'linkedin', label: 'LinkedIn', href: LINKS.linkedin },
  ]);
});

test('homeContent is JSON-safe and fresh on every call', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(content)), content);
  const other = homeContent();
  assert.notEqual(other, content);
  other.chapters.length = 0;
  assert.equal(homeContent().chapters.length, 17);
});
