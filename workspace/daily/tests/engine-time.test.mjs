// Engine: America/New_York time, the 05:00–22:00 window, the 22:00 close across DST, the counter PRNG,
// determinism (no reroll), immutability and GameError atomicity.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine/index.js';
import { drawAt, seedFrom, streamRng } from '../engine/rng.js';

const T = E.time;
const at = (key, hh, mm = 0) => T.nyInstant(key, hh * 60 + mm);

function start(key = '2026-11-02', hh = 8) {
  let s = E.newGame({ seed: 11, now: at(key, hh), tasks: E.DEFAULT_TASKS });
  s = E.applyAction(s, { type: 'petEgg/hatch', petEggId: s.inv.petEggs[0].id }, at(key, hh, 1)).state;
  return s;
}

function tickAll(s, key, hh = 9) {
  for (const t of s.list.tasks) s = E.applyAction(s, { type: 'task/tick', taskId: t.id }, at(key, hh)).state;
  return s;
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

test('day keys and clock come from New York, whatever the process TZ', () => {
  // 2026-11-02 03:30Z is 22:30 EST on Nov 1.
  assert.equal(T.dayKey(Date.UTC(2026, 10, 2, 3, 30)), '2026-11-01');
  assert.equal(T.dayKey(Date.UTC(2026, 10, 2, 5, 0)), '2026-11-02');
  assert.equal(T.minuteOfDay(Date.UTC(2026, 9, 24, 13, 15)), 9 * 60 + 15); // EDT
  assert.equal(T.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(T.addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(T.daysBetween('2026-10-25', '2026-11-01'), 7);
  assert.equal(T.mondayOf('2026-11-01'), '2026-10-26');
  assert.equal(T.mondayOf('2026-11-02'), '2026-11-02');
  assert.equal(T.nextMonth('2026-12'), '2027-01');
  assert.equal(T.weekdayOf('2026-10-24'), 6);
});

test('the window is 05:00–22:00 and the close is 22:00 on both DST change days', () => {
  // Fall back: Sunday 2026-11-01 (EDT → EST at 02:00).
  assert.equal(T.openInstant('2026-11-01'), Date.UTC(2026, 10, 1, 10, 0));
  assert.equal(T.closeInstant('2026-11-01'), Date.UTC(2026, 10, 2, 3, 0));
  // Spring forward: Sunday 2027-03-14 (EST → EDT at 02:00).
  assert.equal(T.openInstant('2027-03-14'), Date.UTC(2027, 2, 14, 9, 0));
  assert.equal(T.closeInstant('2027-03-14'), Date.UTC(2027, 2, 15, 2, 0));
  for (const k of ['2026-11-01', '2027-03-14', '2026-07-01', '2027-01-15']) {
    assert.equal(T.closeInstant(k) - T.openInstant(k), 17 * 3_600_000, k);
  }
  assert.equal(T.phaseAt(T.closeInstant('2026-11-01') - 1), 'open');
  assert.equal(T.phaseAt(T.closeInstant('2026-11-01')), 'closed');
  assert.equal(T.phaseAt(T.openInstant('2027-03-14') - 1), 'before');
  assert.equal(T.lastFinishedDay(T.closeInstant('2027-03-14')), '2027-03-14');
  assert.equal(T.lastFinishedDay(T.closeInstant('2027-03-14') - 1), '2027-03-13');
});

for (const dstDay of ['2026-11-01', '2027-03-14']) {
  test(`day ${dstDay}: ticks count until 21:59, the close lands exactly at 22:00`, () => {
    const prev = T.addDays(dstDay, -1);
    let s = start(prev, 8);
    s = tickAll(s, prev, 9);
    s = E.advance(s, at(dstDay, 5)).state;
    assert.equal(s.streak, 1);
    assert.equal(s.day.key, dstDay);
    assert.throws(() => E.applyAction(s, { type: 'task/tick', taskId: 'read' }, at(dstDay, 4, 59)), { code: 'window_closed' });
    s = tickAll(s, dstDay, 21);
    const lastMinute = T.closeInstant(dstDay) - 60_000;
    s = E.applyAction(s, { type: 'day/setLevel', level: 'hard' }, lastMinute).state; // still open at 21:59
    let r = E.advance(s, T.closeInstant(dstDay) - 1);
    assert.equal(r.events.filter((e) => e.type === 'day.closed').length, 0);
    r = E.advance(s, T.closeInstant(dstDay));
    const closed = r.events.find((e) => e.type === 'day.closed');
    assert.equal(closed.dayKey, dstDay);
    assert.equal(closed.outcome, 'complete');
    assert.equal(r.state.streak, 2);
    assert.throws(() => E.applyAction(r.state, { type: 'day/setLevel', level: 'easy' }, T.closeInstant(dstDay)), { code: 'window_closed' });
  });
}

test('a game started after 22:00 counts from the next day; one started mid-morning counts today', () => {
  const late = E.newGame({ seed: 1, now: at('2026-11-02', 22, 30), tasks: E.DEFAULT_TASKS });
  assert.equal(late.startDay, '2026-11-03');
  assert.equal(late.day, null);
  const r = E.advance(late, at('2026-11-03', 23));
  assert.equal(r.events.filter((e) => e.type === 'day.closed').length, 1);
  const mid = E.newGame({ seed: 1, now: at('2026-11-02', 15), tasks: E.DEFAULT_TASKS });
  assert.equal(mid.startDay, '2026-11-02');
  assert.equal(mid.day.key, '2026-11-02');
  const early = E.newGame({ seed: 1, now: at('2026-11-02', 3), tasks: E.DEFAULT_TASKS });
  assert.equal(early.startDay, '2026-11-02');
  assert.equal(early.day, null, 'the day opens at 05:00');
  assert.equal(E.advance(early, at('2026-11-02', 5)).state.day.key, '2026-11-02');
});

test('undo works for 5 minutes and is refused after', () => {
  let s = start();
  s = E.applyAction(s, { type: 'task/tick', taskId: 'read' }, at('2026-11-02', 9)).state;
  // Exclusive at exactly +5:00 (from then the tick is final for quests).
  assert.throws(() => E.applyAction(s, { type: 'task/undo', taskId: 'read' }, at('2026-11-02', 9, 5)), { code: 'undo_expired' });
  assert.equal(E.viewToday(s, at('2026-11-02', 9, 5)).tasks.find((t) => t.id === 'read').canUndo, false);
  assert.equal(E.viewToday(s, at('2026-11-02', 9, 5) - 1).tasks.find((t) => t.id === 'read').canUndo, true);
  const r = E.applyAction(s, { type: 'task/undo', taskId: 'read' }, at('2026-11-02', 9, 5) - 1);
  assert.equal(r.state.day.pool, 0);
  assert.equal(r.state.day.ticks.read, undefined);
  assert.equal(r.state.day.commitLevel, null, 'no ticks left, no commitment');
});

test('counter PRNG: deterministic, seed-sensitive, uniform enough', () => {
  const seed = seedFrom(42);
  assert.deepEqual(seedFrom(42), seed);
  assert.notDeepEqual(seedFrom(43), seed);
  assert.equal(drawAt(seed, 5), drawAt(seed, 5));
  const stream = { seed, n: 0 };
  const r = streamRng(stream);
  const xs = Array.from({ length: 20000 }, () => r());
  assert.equal(stream.n, 20000);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.01, `mean ${mean}`);
  const buckets = new Array(10).fill(0);
  for (const x of xs) buckets[Math.floor(x * 10)] += 1;
  for (const b of buckets) assert.ok(Math.abs(b - 2000) < 200, `bucket ${b}`);
  // A fresh stream at the same counter repeats the same draw (no reroll after a reload).
  assert.equal(streamRng({ seed, n: 123 })(), xs[123]);
});

test('no reroll: the same state + action + now always gives the same outcome', () => {
  let s = start();
  s.inv.openEggs.push({ id: 'oeX', tier: 3, source: 'laid', petId: null, extraItems: 2, petEggPct: 0, laidOn: null });
  const a = E.applyAction(s, { type: 'egg/open', eggId: 'oeX' }, at('2026-11-02', 10));
  const b = E.applyAction(s, { type: 'egg/open', eggId: 'oeX' }, at('2026-11-02', 10));
  assert.deepEqual(a, b);
  assert.ok(a.state.rng.n > s.rng.n, 'the stream position is saved in the new state');
  // Reloading the saved JSON and repeating the next action gives the same result again.
  const saved = JSON.parse(JSON.stringify(a.state));
  saved.inv.openEggs.push({ id: 'oeY', tier: 0, source: 'streak', petId: null, extraItems: 0, petEggPct: 0, laidOn: null });
  const c1 = E.applyAction(saved, { type: 'egg/open', eggId: 'oeY' }, at('2026-11-02', 11));
  const c2 = E.applyAction(JSON.parse(JSON.stringify(saved)), { type: 'egg/open', eggId: 'oeY' }, at('2026-11-02', 11));
  assert.deepEqual(c1.events, c2.events);
});

test('inputs are never mutated and illegal actions change nothing', () => {
  const s = deepFreeze(start());
  const before = JSON.stringify(s);
  const r = E.applyAction(s, { type: 'task/tick', taskId: 'read' }, at('2026-11-02', 9));
  assert.equal(JSON.stringify(s), before);
  assert.equal(r.state.day.ticks.read.level, 1);
  E.advance(s, at('2026-11-05', 9));
  assert.equal(JSON.stringify(s), before);
  for (const bad of [
    { type: 'task/tick', taskId: 'nope' },
    { type: 'task/raise', taskId: 'read', level: 'chill' },
    { type: 'day/setLevel', level: 'goddamn' },
    { type: 'pet/feed', petId: s.pets[0].id, amount: 1 },
    { type: 'shop/buy', itemId: 'freeze' },
    { type: 'list/setup', tasks: E.DEFAULT_TASKS },
    { type: 'whatever' },
  ]) {
    let err;
    try { E.applyAction(s, bad, at('2026-11-02', 9)); } catch (e) { err = e; }
    assert.ok(err instanceof E.GameError, `${bad.type} throws GameError`);
    assert.equal(typeof err.code, 'string');
    assert.ok(err.message.length > 5);
    assert.equal(JSON.stringify(s), before);
  }
});
