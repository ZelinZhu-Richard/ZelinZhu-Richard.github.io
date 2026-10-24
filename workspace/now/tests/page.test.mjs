import test from 'node:test';
import assert from 'node:assert/strict';
import { pages } from '../../../site/pages.mjs';
import { NOW } from '../now.mjs';
import { nowPage, formatUpdated } from '../page.mjs';

const html = pages().get('now/index.html');
const count = (text, needle) => text.split(needle).length - 1;

test('/now/ is rendered through the site frame with production metadata', () => {
  assert.ok(html, 'pages() has no now/index.html');
  assert.ok(html.includes('<link rel="canonical" href="https://zelinzhu-richard.github.io/now/">'));
  assert.ok(html.includes('<meta property="og:url" content="https://zelinzhu-richard.github.io/now/">'));
  assert.ok(html.includes('<link rel="stylesheet" href="/now/style.css">'));
  assert.ok(html.includes('<a href="/now/" aria-current="page">Now</a>'));
  assert.ok(!/localhost|127\.0\.0\.1|noindex/.test(html));
});

test('hero shows the updated date, the title and the currently pill with a caret', () => {
  assert.ok(html.includes('<p class="eyebrow now-mono">Now · updated <time datetime="2026-10-24">Oct 24, 2026</time></p>'));
  assert.ok(html.includes('<h1>Learning, <em>in public.</em></h1>'));
  // The caret is glued to the last item so it cannot wrap onto a line of its own.
  assert.ok(html.includes('<span class="now-currently-items">MATH 347 · ILO prep · <span class="now-currently-last">qbench preprint<span class="now-caret" aria-hidden="true">▍</span></span></span>'));
  assert.equal(count(html, 'class="now-caret" aria-hidden="true"'), 1);
});

test('section 01 has the term heading, one row per course and a chip class per status', () => {
  assert.ok(html.includes('<h2 id="now-term">Fall <em>2026</em></h2>'));
  assert.ok(html.includes('01 — Coursework &amp; study'));
  assert.equal(count(html, '<li class="now-course">'), NOW.courses.length);
  for (const status of ['enrolled', 'sitting-in', 'auditing', 'self-study']) {
    assert.equal(count(html, `now-chip--${status}"`), NOW.courses.filter(c => c.status === status).length, status);
  }
  assert.ok(html.includes('<span class="now-chip now-chip--self-study" aria-hidden="true">Self-study · 8 h/wk</span>'));
  assert.ok(html.includes('Sitting in</span>'));
  // Heading navigation lands on the h3, so the status is repeated (visually hidden) inside it.
  assert.ok(html.includes('<h3><span class="now-visually-hidden">Enrolled: </span>MATH 347 — Linear Algebra for Applications</h3>'));
  assert.ok(html.includes('<h3><span class="now-visually-hidden">Self-study · 8 h/wk: </span>International Logic Olympiad 2027</h3>'));
  assert.equal([...html.matchAll(/<span class="now-chip now-chip--[a-z-]+" aria-hidden="true">/g)].length, NOW.courses.length);
  assert.ok(html.includes('mock score<span aria-hidden="true"> →</span></span> [latest]'));
  assert.equal(count(html, 'now<span aria-hidden="true"> →</span>'), NOW.courses.length);
  assert.ok(html.includes('[One line on what you&#39;re getting out of it]'));
});

test('section 02 has one timeline item per milestone and exactly one next item', () => {
  assert.ok(html.includes('Shipped, <em>and next</em>'));
  assert.equal(count(html, '<li class="now-milestone '), NOW.milestones.length);
  assert.equal(count(html, 'now-milestone--next"'), 1);
  assert.equal(count(html, 'class="now-pulse"'), 1);
  assert.equal(count(html, 'now-milestone--done"'), NOW.milestones.filter(m => m.state === 'done').length);
  assert.ok(html.includes('<time datetime="2026-12-09">Dec 9–13</time>'));
  // "Next" is said once, by the h3, not again by the date column.
  assert.ok(html.includes('<span class="now-when" aria-hidden="true">Next</span>'));
  assert.equal(count(html, 'class="now-when" aria-hidden="true"'), 1);
  assert.ok(html.includes('<h3><span class="now-visually-hidden">Next up: </span>qbench preprint on arXiv</h3>'));
  // The under-review item gets its own class and state word.
  assert.equal(count(html, 'now-milestone--review'), 1);
  assert.ok(html.includes('<li class="now-milestone now-milestone--upcoming now-milestone--review">'));
  assert.ok(html.includes('<span class="now-visually-hidden">Under review: </span>Lightning-talk abstract'));
  assert.ok(html.includes('[Date] 2027'));
});

test('the month strip starts hidden and the closing line is small text with the date', () => {
  assert.match(html, /<section class="now-section now-month"[^>]*\bdata-now-month hidden>/);
  assert.ok(html.includes('<script type="module" src="/now/strip.js"></script>'));
  assert.ok(html.includes('href="/daily/"'));
  assert.ok(html.includes('03 — Daily receipts · <span data-now-month-key></span>'));
  assert.ok(html.includes('<p class="now-closing">Build. Learn. Repeat. · Last updated <time datetime="2026-10-24">Oct 24, 2026</time></p>'));
  assert.ok(html.indexOf('now-closing') < html.indexOf('</main>'));
});

test('the next milestone shows NEXT from its state, whatever its label says', () => {
  const data = structuredClone(NOW);
  const next = data.milestones.find(m => m.state === 'next');
  next.label = 'Nov 2026';
  next.date = '2026-11';
  const body = nowPage(data);
  assert.ok(body.includes('<time datetime="2026-11">Next</time>'));
  assert.ok(!body.includes('>Nov 2026<'));
});

test('all data is escaped', () => {
  const data = structuredClone(NOW);
  data.courses[0].title = '<script>alert(1)</script>';
  data.milestones[0].detail = 'a "quoted" & <b>bold</b> line';
  data.currently = ['<img src=x onerror=alert(1)>'];
  data.term.emphasis = '<i>2026</i>';
  const body = nowPage(data);
  assert.ok(!body.includes('<script>alert'));
  assert.ok(!body.includes('<img src=x'));
  assert.ok(!body.includes('<i>2026'));
  assert.ok(body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(body.includes('a &quot;quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt; line'));
});

test('formatUpdated splits the string instead of going through Date', () => {
  assert.equal(formatUpdated('2026-10-24'), 'Oct 24, 2026');
  assert.equal(formatUpdated('2027-01-01'), 'Jan 1, 2027');
  assert.equal(formatUpdated('2026-12-31'), 'Dec 31, 2026');
});

test('every in-page anchor target exists and ids are unique', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, ref] of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(ref), ref);
});
