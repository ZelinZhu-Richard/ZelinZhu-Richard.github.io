import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { monthStats, nyMonthKey, formatMonthKey, show } from '../strip.js';

const month = { key: '2026-10', pagesRead: 1240, hoursOutside: 18.25, workouts: 14, avgSleepHours: 7.36 };
const snapshot = (overrides = {}, monthOverrides = {}) => ({ kind: 'published', receipts: { month: { ...month, ...monthOverrides } }, ...overrides });
const OCT = '2026-10';

test('monthStats formats the four receipts and names the month', () => {
  assert.deepEqual(monthStats(snapshot(), OCT), {
    month: 'October 2026',
    stats: [
      { label: 'pages read', value: '1,240' },
      { label: 'hours outside', value: '18.3' },
      { label: 'workouts', value: '14' },
      { label: 'avg sleep', value: '7.4 h' },
    ],
  });
  assert.equal(monthStats(snapshot({}, { hoursOutside: 0 }), OCT).stats[1].value, '0');
});

test('monthStats returns null (strip stays hidden) on missing or bad data', () => {
  for (const bad of [null, undefined, {}, { kind: 'published' }, { kind: 'published', receipts: {} }, { kind: 'published', receipts: { month: null } }, { kind: 'published', receipts: { month: 'x' } }]) {
    assert.equal(monthStats(bad, OCT), null);
  }
  for (const key of ['pagesRead', 'hoursOutside', 'workouts', 'avgSleepHours']) {
    for (const value of [undefined, '12', NaN, Infinity, -1, null]) {
      assert.equal(monthStats(snapshot({}, { [key]: value }), OCT), null, `${key}=${value}`);
    }
  }
});

test('monthStats hides the build-time preview and anything not marked published', () => {
  assert.equal(monthStats(snapshot({ kind: 'preview' }), OCT), null);
  assert.equal(monthStats(snapshot({ kind: undefined }), OCT), null);
  assert.equal(monthStats(snapshot({ kind: 'Published' }), OCT), null);
  const { kind, ...unmarked } = snapshot();
  assert.equal(monthStats(unmarked, OCT), null);
});

test('monthStats hides a stale or malformed month key', () => {
  assert.equal(monthStats(snapshot({}, { key: '2026-09' }), OCT), null, 'last month');
  assert.equal(monthStats(snapshot({}, { key: '2025-10' }), OCT), null, 'same month last year');
  for (const key of [undefined, '', '2026-13', '2026-1', '2026-10-01', 202610]) {
    assert.equal(monthStats(snapshot({}, { key }), key === undefined ? OCT : String(key)), null, String(key));
  }
});

test('nyMonthKey uses America/New_York, not the process time zone', () => {
  // 2026-11-01T03:30Z is still Oct 31 (23:30 EDT) in New York.
  assert.equal(nyMonthKey(Date.UTC(2026, 10, 1, 3, 30)), '2026-10');
  assert.equal(nyMonthKey(Date.UTC(2026, 10, 1, 4, 30)), '2026-11');
  // 2027-01-01T04:59Z is still Dec 31 (23:59 EST).
  assert.equal(nyMonthKey(Date.UTC(2027, 0, 1, 4, 59)), '2026-12');
  assert.equal(nyMonthKey(Date.UTC(2027, 0, 1, 5, 0)), '2027-01');
  assert.equal(formatMonthKey('2027-01'), 'January 2027');
});

// A tiny stand-in for the strip's DOM: just what show() touches.
function fakeStrip({ withList = true, withKey = true } = {}) {
  const el = (tag) => ({ tag, children: [], textContent: '', append(...kids) { this.children.push(...kids); } });
  const doc = { createElement: el };
  const list = { ownerDocument: doc, children: [], replaceChildren(...kids) { this.children = kids; }, set innerHTML(_) { throw new Error('innerHTML used'); } };
  const key = { textContent: '' };
  const strip = {
    hidden: true,
    list,
    key,
    querySelector(selector) {
      if (selector === '[data-now-stats]') return withList ? list : null;
      if (selector === '[data-now-month-key]') return withKey ? key : null;
      return null;
    },
  };
  return strip;
}

const NOW_OCT = Date.UTC(2026, 9, 24, 16);
const respond = (body, { ok = true, status = 200 } = {}) => async () => ({ ok, status, json: async () => (typeof body === 'function' ? body() : body) });

test('show() reveals the strip only on a good, current, published snapshot', async () => {
  const calls = [];
  const strip = fakeStrip();
  const fetchImpl = async (url, options) => { calls.push([url, options]); return respond(snapshot())(); };
  assert.equal(await show(strip, fetchImpl, NOW_OCT), true);
  assert.equal(strip.hidden, false);
  assert.deepEqual(calls, [['/daily/snapshot.json', { cache: 'no-cache' }]]);
  assert.equal(strip.key.textContent, 'October 2026');
  assert.equal(strip.list.children.length, 4);
  const [first] = strip.list.children;
  assert.equal(first.tag, 'div');
  assert.deepEqual(first.children.map(c => [c.tag, c.textContent]), [['dt', 'pages read'], ['dd', '1,240']]);
});

test('show() keeps the strip hidden on every failure path', async () => {
  const cases = {
    '404': respond({}, { ok: false, status: 404 }),
    'fetch rejects': async () => { throw new TypeError('network down'); },
    'invalid JSON': respond(() => { throw new SyntaxError('Unexpected token'); }),
    'bad numbers': respond(snapshot({}, { workouts: 'many' })),
    'preview snapshot': respond(snapshot({ kind: 'preview' })),
    'last month': respond(snapshot({}, { key: '2026-09' })),
  };
  for (const [name, fetchImpl] of Object.entries(cases)) {
    const strip = fakeStrip();
    assert.equal(await show(strip, fetchImpl, NOW_OCT), false, name);
    assert.equal(strip.hidden, true, name);
    assert.equal(strip.list.children.length, 0, name);
  }
  const noList = fakeStrip({ withList: false });
  let fetched = false;
  assert.equal(await show(noList, async () => { fetched = true; return respond(snapshot())(); }, NOW_OCT), false);
  assert.equal(noList.hidden, true);
  assert.equal(fetched, false, 'no request without a [data-now-stats] list');
});

test('show() still works when the month label slot is missing', async () => {
  const strip = fakeStrip({ withKey: false });
  assert.equal(await show(strip, respond(snapshot()), NOW_OCT), true);
  assert.equal(strip.hidden, false);
});

test('the strip script fetches only the public snapshot and writes text, not HTML', async () => {
  const source = await readFile(new URL('../strip.js', import.meta.url), 'utf8');
  assert.ok(source.includes("fetchImpl('/daily/snapshot.json'"));
  assert.ok(!/innerHTML|insertAdjacentHTML|localhost|https?:\/\//.test(source));
  assert.ok(!/new Date|Date\.parse|\.get(Month|Date|FullYear|Hours)\(/.test(source));
});
