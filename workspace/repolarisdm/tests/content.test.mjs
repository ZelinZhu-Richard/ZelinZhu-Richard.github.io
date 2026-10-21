import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { renderSite } from '../build.mjs';
import { CHAPTERS } from '../lib/layout.mjs';
import { parseFrontMatter } from '../lib/markdown.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const allowPlaceholders = process.env.PLAYBOOK_ALLOW_PLACEHOLDERS === '1';
const FORBIDDEN = [
  [/noindex/i, 'noindex'],
  [/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/, 'localhost URL with port'],
  [/\/Users\//, 'local user path'],
  [/CHRONOS-CANARY/, 'private canary'],
  [/holdout\//i, 'holdout path'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:com|edu|org|net|io)\b/, 'email address'],
  [/\b(?:Duke|early decision|early-decision)\b/i, 'college application detail'],
];

const site = await renderSite({ built: '2026-10-20' });

test('the site renders without content errors', () => {
  assert.deepEqual(site.errors, []);
});

test('every chapter is written (no placeholders)', { skip: allowPlaceholders && 'PLAYBOOK_ALLOW_PLACEHOLDERS=1' }, () => {
  assert.deepEqual(site.meta.placeholders, []);
});

const files = (await readdir(join(root, 'content'))).filter(f => /^\d\d-.*\.md$/.test(f));
for (const file of files) {
  const raw = await readFile(join(root, 'content', file), 'utf8');
  const { data, body } = parseFrontMatter(raw, file);
  test(`${file} follows the chapter contract`, () => {
    for (const key of ['title', 'short', 'summary']) assert.ok(data[key], `front matter "${key}" missing`);
    const order = [
      ['self-check', body.indexOf(':::selfcheck')],
      ['why', body.search(/^## Why Polaris cares/m)],
      ['sources', body.search(/^## Sources/m)],
      ['closing check', body.indexOf(':::check')],
    ];
    for (const [name, at] of order) assert.ok(at >= 0, `missing ${name}`);
    for (let k = 1; k < order.length; k++) assert.ok(order[k][1] > order[k - 1][1], `${order[k][0]} must come after ${order[k - 1][0]}`);
    assert.ok((body.match(/^:::drill /gm) || []).length >= 2, 'needs at least two drills');
    assert.ok(body.includes(':::compare'), 'needs a vibe coder vs senior comparison');
    const sources = body.slice(body.search(/^## Sources/m)).split(/^:::check/m)[0];
    assert.ok(/\^\[(confirmed|reported)\]\(https:/.test(sources), 'Sources needs at least one badged link');
  });
  test(`${file} has no forbidden strings`, () => {
    for (const [re, name] of FORBIDDEN) assert.ok(!re.test(raw), `contains ${name}: ${raw.match(re)?.[0]}`);
  });
}

test('rendered pages have canonical metadata and no forbidden strings', () => {
  for (const [file, html] of site.pages) {
    assert.ok(html.includes('https://zelinzhu-richard.github.io/repolarisdm/'), `${file} lacks canonical URL`);
    for (const [re, name] of FORBIDDEN) assert.ok(!re.test(html), `${file} contains ${name}`);
  }
});

test('drill ids are unique and every chapter except the tracker has drills', () => {
  const ids = site.meta.drills.map(d => d.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of site.meta.chapters) if (c.slug !== 'tracker' && !site.meta.placeholders.includes(c.slug)) assert.ok(c.drills.length >= 2, `${c.slug} has ${c.drills.length} drills`);
});

test('lab links point at labs that exist', () => {
  const labs = new Set();
  for (const file of files) for (const m of (existsSync(join(root, 'content', file)) ? [] : [])) labs.add(m);
  for (const [, html] of site.pages) for (const m of html.matchAll(/workspace\/repolarisdm\/labs\/(lab-[a-z])/g)) labs.add(m[1]);
  for (const lab of labs) assert.ok(existsSync(join(root, 'labs', lab, 'README.md')), `${lab} is linked but labs/${lab}/README.md is missing`);
});

test('the chapter registry and content files agree', () => {
  for (const file of files) {
    const slug = file.replace(/^\d\d-/, '').replace(/\.md$/, '');
    assert.ok(CHAPTERS.some(c => c.slug === slug), `${file} not in registry`);
  }
});

test('answer keys are not shipped inside lab folders at publish time', { skip: process.env.PLAYBOOK_BUILDING === '1' && 'keys still being built' }, () => {
  if (!existsSync(join(root, 'labs'))) return;
  return readdir(join(root, 'labs'), { recursive: true }).then(list => {
    const keys = list.filter(p => /(^|\/)_key(\/|$)/.test(p));
    assert.deepEqual(keys, [], 'move every labs/*/_key folder to the local answer-key store before publishing');
  });
});
