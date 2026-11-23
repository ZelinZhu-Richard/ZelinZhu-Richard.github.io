import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNLISTED_FOLDERS, isUnlisted, siteIndex, indexGroup, indexItem } from '../index.mjs';
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

test('unlisted pages never appear in the index', () => {
  for (const item of items()) assert.ok(!isUnlisted(item.href), `${item.href} must stay out of the index`);
  assert.deepEqual(UNLISTED_FOLDERS, ['choices', 'duke', 'hq', 'repolarisdm']);
});

test('the unlisted check reads destinations, not words: a post about Duke is not an unlisted page', () => {
  for (const href of ['/duke/', '/duke', '/hq/', '/choices/#tree', '/repolarisdm/cards/', '/duke/becoming-blue/?x=1']) assert.ok(isUnlisted(href), href);
  for (const href of ['/blog/duke-scai-hackathon/', '/blog/choices-i-made/', '/hqx/', '/about/', 'https://example.com/duke/', '/projects/#hq']) assert.ok(!isUnlisted(href), href);
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
