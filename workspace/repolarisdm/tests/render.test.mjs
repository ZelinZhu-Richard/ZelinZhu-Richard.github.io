import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, newContext, parseFrontMatter, renderInline, slugify } from '../lib/markdown.mjs';

const pages = new Map([['home', { title: 'Overview' }], ['agent-patch-audit', { title: 'The Agent Patch Audit' }], ['map', { title: 'Map an unfamiliar repo' }]]);
const render = (md, page = 'map') => { const ctx = newContext(page, pages); const html = renderMarkdown(md, ctx); return { html, ctx }; };

test('front matter is parsed and stripped', () => {
  const { data, body } = parseFrontMatter('---\ntitle: Hello\nsummary: "A: b"\n---\n## Hi\n');
  assert.equal(data.title, 'Hello');
  assert.equal(data.summary, 'A: b');
  assert.equal(body, '## Hi\n');
});

test('headings get ids, explicit ids win, duplicates are numbered', () => {
  const { html, ctx } = render('## Why Polaris cares\n\n## Mistake card {#mistake-card}\n\n## Why Polaris cares');
  assert.match(html, /<h2 id="why-polaris-cares">/);
  assert.match(html, /<h2 id="mistake-card">/);
  assert.match(html, /<h2 id="why-polaris-cares-2">/);
  assert.equal(ctx.errors.length, 0);
});

test('html is escaped everywhere', () => {
  const { html } = render('A <script>alert(1)</script> & `<b>` here.');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<code>&lt;b&gt;<\/code>/);
});

test('inline formatting, links and badges', () => {
  const ctx = newContext('map', pages);
  const html = renderInline('**bold** and *it* [docs](https://example.com/a?b=1&c=2) ^[confirmed](https://example.com "2026-10-20") ^[inference](- "2026-10-20")', ctx);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>it<\/em>/);
  assert.match(html, /href="https:\/\/example.com\/a\?b=1&amp;c=2" target="_blank"/);
  assert.match(html, /class="badge badge-confirmed" href="https:\/\/example.com"/);
  assert.match(html, /<span class="badge badge-inference"/);
  assert.equal(ctx.errors.length, 0);
});

test('snake_case and multiplication are not mangled into italics', () => {
  const ctx = newContext('map', pages);
  const html = renderInline('use reward_file and 2 * 3 * 4 and `a*b*c`', ctx);
  assert.ok(!html.includes('<em>'));
});

test('bad links and badges are errors', () => {
  const ctx = newContext('map', pages);
  renderInline('[x](http://example.com) [y](../map/) ^[confirmed](- "2026-10-20") [[nope]] [[S99]]', ctx);
  assert.equal(ctx.errors.length, 5);
});

test('cross references resolve to chapters, steps, mistake rows and labs', () => {
  const ctx = newContext('map', pages);
  const html = renderInline('[[agent-patch-audit]] [[S4]] [[M3]] [[lab:lab-a]] [[map#x|here]] [[home]]', ctx);
  assert.match(html, /href="\/repolarisdm\/agent-patch-audit\/">The Agent Patch Audit/);
  assert.match(html, /href="\/repolarisdm\/agent-patch-audit\/#s4">S4/);
  assert.match(html, /href="\/repolarisdm\/agent-patch-audit\/#mistake-card">M3/);
  assert.match(html, /github.com\/ZelinZhu-Richard\/ZelinZhu-Richard.github.io\/tree\/main\/workspace\/repolarisdm\/labs\/lab-a/);
  assert.match(html, /href="\/repolarisdm\/map\/#x">here/);
  assert.match(html, /href="\/repolarisdm\/">Overview/);
  assert.deepEqual(ctx.links, ['/repolarisdm/agent-patch-audit/', '/repolarisdm/agent-patch-audit/#s4', '/repolarisdm/agent-patch-audit/#mistake-card', '/repolarisdm/map/#x', '/repolarisdm/']);
});

test('lists: nested, ordered, task items and continuation lines', () => {
  const { html, ctx } = render('- one\n  - nested\n- two\n  continued\n\n1. first\n2. second\n\n- [ ] do it');
  assert.match(html, /<ul><li>one<ul><li>nested<\/li><\/ul><\/li><li>two continued<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(html, /data-track="task:map:/);
  assert.equal(ctx.errors.length, 0);
});

test('code fences keep content verbatim and escaped', () => {
  const { html } = render('```bash\nset -o pipefail; pytest -rA 2>&1 | tee baseline.txt\n```');
  assert.match(html, /<pre class="code" data-lang="bash" tabindex="0"><code>set -o pipefail; pytest -rA 2&gt;&amp;1 \| tee baseline.txt<\/code><\/pre>/);
});

test('tables, including pipes inside code', () => {
  const { html, ctx } = render('| A | B |\n|---|---|\n| `x \\| y` | **z** |\n| `a|b` | c |');
  assert.match(html, /<th scope="col">A<\/th>/);
  assert.match(html, /<td><code>x \| y<\/code><\/td>/);
  assert.match(html, /<td><code>a\|b<\/code><\/td><td>c<\/td>/);
  assert.equal(ctx.errors.length, 0);
});

test('selfcheck, drill, compare, callouts, reveal, mock, tally, rubric', () => {
  const md = [
    ':::selfcheck', '- Q1 || A1', '- Q2', ':::',
    ':::drill id="d-one" title="Do a thing" time="20 min"', 'Steps.', '', '**Done when:** it works.', ':::',
    ':::compare', '- trusts the agent || checks the agent', ':::',
    ':::warn', 'Careful.', ':::',
    ':::reveal title="Answer"', 'Hidden.', ':::',
    ':::mock id="m1" title="Mock" minutes="60"', 'Phases.', ':::',
    ':::tally id="t1" title="Score"', '- item a', '- item b', ':::',
    ':::rubric id="r1"', '- trait a', ':::',
    ':::check', '- C1', '- C2', ':::',
  ].join('\n');
  const { html, ctx } = render(md);
  assert.deepEqual(ctx.errors, []);
  assert.match(html, /data-track="sc:map:1"/);
  assert.match(html, /data-testout="map"/);
  assert.match(html, /id="drill-d-one"/);
  assert.match(html, /data-track="drill:map:d-one"/);
  assert.match(html, /<th scope="col">Vibe coder<\/th>/);
  assert.match(html, /callout-warn/);
  assert.match(html, /<details class="reveal">/);
  assert.match(html, /data-mock="map:m1" data-minutes="60"/);
  assert.match(html, /data-track="tally:map:t1:2"/);
  assert.match(html, /data-score="rubric:map:r1:1"/);
  assert.match(html, /data-track="cc:map:2"/);
  assert.equal(ctx.drills.length, 1);
  assert.equal(ctx.selfchecks.length, 2);
});

test('drill without Done when, unknown directive and unclosed fence are errors', () => {
  const { ctx } = render(':::drill id="x" title="t" time="1 min"\nno done line\n:::\n:::bogus\n:::\n```\nopen');
  assert.equal(ctx.errors.length, 3);
});

test('slugify strips markup', () => {
  assert.equal(slugify('S2 Tool map `rg` ^[confirmed](https://x.y "d")'), 's2-tool-map-rg');
});
