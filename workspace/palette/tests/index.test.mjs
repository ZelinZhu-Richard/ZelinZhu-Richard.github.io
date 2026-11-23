import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteIndex, indexGroup, indexItem } from '../index.mjs';
import { PARTS } from '../../stones/parts.mjs';
import { PROJECTS, PUBLICATIONS } from '../../../site/content.mjs';

const items = () => siteIndex().flatMap(g => g.items.map(item => ({ ...item, group: g.group })));

test('every item has a title, a hint and a destination, and no destination appears twice', () => {
  const seen = new Set();
  for (const item of items()) {
    for (const key of ['title', 'hint', 'href']) assert.ok(item[key], `${item.title || item.href} is missing ${key}`);
    assert.ok(!seen.has(item.href), `${item.href} is listed twice`);
    seen.add(item.href);
    // Internal pages are root-relative; anything else must be a full https or mailto address.
    if (!item.href.startsWith('/')) assert.match(item.href, /^(https:\/\/|mailto:)/, item.href);
    assert.equal(Boolean(item.external), item.href.startsWith('https://'), `${item.href} external flag`);
  }
});

test('unlisted and private pages never appear in the index', () => {
  const text = JSON.stringify(siteIndex());
  for (const hidden of ['/choices', '/duke', '/hq', '/repolarisdm', '_private', 'holdout']) assert.ok(!text.includes(hidden), `${hidden} must stay out of the index`);
});

test('the index covers the seven sections, every project and every publication', () => {
  assert.deepEqual(indexGroup('Sections').map(i => i.href), PARTS.map(p => p.href));
  assert.deepEqual(indexGroup('Sections').map(i => i.label), ['01', '02', '03', '04', '05', '06', '07']);
  const hrefs = new Set(items().map(i => i.href));
  for (const p of PROJECTS) assert.ok(hrefs.has(p.group === 'research' ? `/projects/#${p.id}` : p.live), `${p.name} is missing`);
  for (const p of PUBLICATIONS) assert.ok(hrefs.has(p.href), `${p.title} is missing`);
});

test('lookups fail loudly on a name that does not exist', () => {
  assert.equal(indexItem('/colophon/').title, 'Colophon');
  assert.throws(() => indexGroup('Nope'), /no group/);
  assert.throws(() => indexItem('/nope/'), /no item/);
});
