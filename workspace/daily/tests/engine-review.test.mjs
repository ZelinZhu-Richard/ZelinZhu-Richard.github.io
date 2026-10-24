// Engine: regression tests for the 2026-10-24 review (freeze = no penalty, swap units, commitment after a
// finished day, the undo/quest boundary at +5:00, the hunger ladder after a death, closed-day quest records in
// the public snapshot, warmHands eligibility, the date-seeded quest draw, swap quest replacement, reward reasons,
// and limits moved into config).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine/index.js';
import { drawQuests } from '../engine/progress.js';
import { deriveSeed, questRng, seedFrom, streamRng } from '../engine/rng.js';
import { normalizeTask } from '../engine/tasks.js';

const T = E.time;
const at = (key, hh, mm = 0) => T.nyInstant(key, hh * 60 + mm);
const D = '2026-11-02'; // Monday
const day = (n) => T.addDays(D, n);
const act = (s, a, now = at(D, 9)) => E.applyAction(s, a, now);
const POOL = Object.fromEntries(E.content.QUESTS.pool.map((q) => [q.id, q]));

function start(seed = 9) {
  let s = E.newGame({ seed, now: at(D, 8), tasks: E.DEFAULT_TASKS });
  s = act(s, { type: 'petEgg/hatch', petEggId: s.inv.petEggs[0].id }, at(D, 8, 1)).state;
  return s;
}
function pet(s, over = {}) {
  const base = structuredClone(s.pets[0]);
  const p = { ...base, id: `x${s.seq + 1}`, name: `T${s.seq + 1}`, level: 1, xp: 0, stars: 1, tier: 0, trinkets: [], fed: { day: null, amount: 0 }, comebackOwed: 0, meter: 0, hungrySince: null, lastLoss: null, nineLives: 'none', beacon: false, location: 'backpack', ...over };
  s.seq += 1;
  s.pets.push(p);
  return p;
}
const quest = (id, i, over = {}) => ({
  id, slot: i + 1, cat: POOL[id].cat, timed: !!POOL[id].timed, coins: POOL[id].coins, text: id, refs: [], deadline: null,
  private: !!POOL[id].private, done: false, doneAt: null, paid: 0, ...over,
});
function playDay(s, key, hh = 9) {
  for (const t of s.list.tasks) if (!s.day.ticks[t.id]) s = act(s, { type: 'task/tick', taskId: t.id }, at(key, hh)).state;
  return s;
}

test('a frozen night has no penalty: no underfed or upkeep level loss (config can restore them)', () => {
  const run = () => {
    const s = start();
    s.streak = 1;
    s.inv.freezes = 1;
    s.pets[0].level = 5;
    const bp = pet(s, { level: 5 });
    const r = E.advance(s, at(day(1), 7));
    const closed = r.events.find((e) => e.type === 'day.closed');
    return { r, closed, bp };
  };
  const { r, closed, bp } = run();
  assert.equal(closed.outcome, 'frozen');
  assert.equal(closed.streak, 1);
  assert.deepEqual(r.events.filter((e) => e.type === 'pet.levelDown'), []);
  assert.equal(r.state.pets.find((p) => p.id === bp.id).level, 5);
  assert.equal(r.state.pets[0].level, 5);
  E.setConfig({ penalties: { freezeSkipsFeedingLosses: false } });
  try {
    const old = run();
    assert.deepEqual(old.r.events.filter((e) => e.type === 'pet.levelDown').map((e) => e.reason).sort(), ['underfed', 'upkeep']);
  } finally {
    E.resetConfig();
  }
});

test('emergency swap: unit aliases are one unit and minutes/hours compare in minutes', () => {
  const s = start();
  const swap = (task) => act(s, { type: 'list/swap', taskId: 'deep', task: { name: 'Deep work', type: 'quantity', ...task }, reason: 'x' });
  assert.throws(() => swap({ unit: 'min', chill: 1 }), { code: 'swap_easier' });
  assert.throws(() => swap({ unit: 'Minutes', chill: 29 }), { code: 'swap_easier' });
  assert.throws(() => swap({ unit: 'hours', chill: 0.25 }), { code: 'swap_easier' });
  const r = swap({ unit: 'h', chill: 0.5 });
  const t = r.state.list.tasks.find((x) => x.name === 'Deep work');
  assert.equal(t.unit, 'hours', 'aliases are stored canonical');
  assert.equal(normalizeTask({ name: 'Walk', type: 'quantity', unit: 'mins', chill: 10 }).unit, 'minutes');
  assert.equal(normalizeTask({ name: 'Read', type: 'quantity', unit: 'pages', chill: 10 }).unit, 'pages');
  // Different non-duration units stay honour-system.
  assert.ok(swap({ unit: 'pages', chill: 1 }).state);
});

test('commitment bonus: lowering after every task is ticked does not break it (the day is finished)', () => {
  let s = start();
  s = playDay(s, D, 9);
  const r = act(s, { type: 'day/setLevel', level: 'chill' }, at(D, 20));
  const ev = r.events.find((e) => e.type === 'day.levelChanged');
  assert.equal(ev.commitBroken, false);
  assert.equal(ev.justBroken, false);
  assert.equal(E.viewToday(r.state, at(D, 20)).bonusAlive, true);
  const closed = E.advance(r.state, at(day(1), 7)).events.find((e) => e.type === 'day.closed');
  assert.ok(closed.bonus > 0, `bonus ${closed.bonus}`);
  // Lowering before the last tick still breaks it.
  let u = start();
  u = act(u, { type: 'task/tick', taskId: 'read' }, at(D, 9)).state;
  u = act(u, { type: 'day/setLevel', level: 'chill' }, at(D, 10)).state;
  assert.equal(u.day.commitBroken, true);
});

test('undo at exactly +5:00 is refused, so a quest paid at that instant never outlives its tick', () => {
  let s = start();
  s.day.quests = [quest('restRecorded', 0), quest('wholeList', 1), quest('halfBy', 2)];
  s.day.targets.sleep = 'sleep';
  const t0 = at(D, 9);
  s = act(s, { type: 'task/tick', taskId: 'sleep', qty: 8 }, t0).state;
  const coins = s.inv.coins;
  assert.throws(() => act(s, { type: 'task/undo', taskId: 'sleep' }, t0 + 300_000), { code: 'undo_expired' });
  const early = act(s, { type: 'task/undo', taskId: 'sleep' }, t0 + 299_999);
  assert.ok(!early.events.some((e) => e.type === 'quest.completed'));
  assert.equal(early.state.inv.coins, coins);
  const paid = E.advance(s, t0 + 300_000);
  assert.deepEqual(paid.events.filter((e) => e.type === 'quest.completed').map((e) => e.questId), ['restRecorded']);
  assert.ok(paid.state.day.ticks.sleep);
});

test('header hunger after a death: further misses show hungry, then starving', () => {
  let s = E.newGame({ seed: 5, now: at(D, 8), tasks: E.DEFAULT_TASKS });
  s = act(s, { type: 'petEgg/hatch', petEggId: s.inv.petEggs[0].id }, at(D, 8, 1)).state;
  const expect = [[1, 'hungry'], [2, 'starving'], [3, 'dead'], [4, 'hungry'], [5, 'starving']];
  for (const [n, hunger] of expect) {
    s = E.advance(s, at(day(n), 7)).state;
    assert.equal(E.viewHeader(s, at(day(n), 7)).hunger, hunger, `${day(n)}: missRun ${s.missRun}`);
  }
});

test('after 22:00 the closed day keeps quest privacy and shape; the public snapshot hides goalTag', () => {
  let s = start(77);
  s.day.quests = [quest('cleanSweep', 0), quest('goalTag', 1), quest('noWaste', 2)];
  s.day.targets.deep = 'deep';
  assert.equal(POOL.goalTag.private, true);
  const ids = (snap) => snap.today.quests.map((q) => q.id);
  assert.deepEqual(ids(E.publicSnapshot(s, at(D, 12))), ['cleanSweep', 'noWaste']);
  s = E.advance(s, at(D, 22, 30)).state;
  const snap = E.publicSnapshot(s, at(D, 22, 30));
  assert.equal(snap.today.closed, true);
  assert.deepEqual(ids(snap), ['cleanSweep', 'noWaste']);
  const owner = E.viewToday(s, at(D, 22, 30)).quests;
  assert.deepEqual(owner.map((q) => q.id), ['cleanSweep', 'goalTag', 'noWaste']);
  for (const q of owner) {
    assert.equal(q.cat, POOL[q.id].cat);
    assert.equal(q.timed, !!POOL[q.id].timed);
    assert.equal(typeof q.slot, 'number');
  }
  // A save closed before the records kept `private` still hides it (looked up by id).
  for (const q of s.lastDay.quests) delete q.private;
  assert.deepEqual(ids(E.publicSnapshot(s, at(D, 22, 30))), ['cleanSweep', 'noWaste']);
});

test('warmHands is drawn only when the eggs have room for every serving it asks for', () => {
  const drawn = (fed) => {
    const s = start();
    s.inv.petEggs = [{ id: 'pw', tier: 1, fed, charm: null, guaranteed: false, source: 'test' }];
    s.inv.eggFood = [10, 0, 0, 0, 0, 0, 0];
    let n = 0;
    for (let i = 0; i < 300; i += 1) {
      const c = structuredClone(s);
      c.quests.recent = [];
      const { quests } = drawQuests(c, D, streamRng({ seed: seedFrom(i), n: 0 }), { dayLevel: 1 });
      if (quests.some((q) => q.id === 'warmHands')) n += 1;
    }
    return n;
  };
  assert.equal(drawn([0, 0, 0, 0, 0]), 0, 'a Rare egg at 5 of 6 servings has room for 1, not 3');
  assert.ok(drawn([0, 0, 0]) > 0, 'room for 3 → eligible');
});

test('the 05:00 quest draw is seeded by save and date only: the main stream position never changes it', () => {
  let s = start(4);
  s = playDay(s, D, 9);
  s = E.advance(s, at(day(1), 4, 30)).state; // D closed, nothing open
  assert.equal(s.day, null);
  const shifted = structuredClone(s);
  shifted.rng.n += 1234; // as if an egg had been opened at 04:30
  const a = E.advance(s, at(day(1), 5, 1)).state;
  const b = E.advance(shifted, at(day(1), 5, 1)).state;
  assert.deepEqual(a.day.quests.map((q) => q.id), b.day.quests.map((q) => q.id));
  assert.equal(a.rng.n, s.rng.n, 'opening the day draws nothing from the main stream');
  // Independent streams per date.
  assert.notDeepEqual(deriveSeed(s.rng.seed, 1), deriveSeed(s.rng.seed, 2));
  assert.notEqual(questRng(s.rng.seed, day(1))(), questRng(s.rng.seed, day(2))());
});

test('emergency swap: an affected quest with no equal-coin match keeps its payout; a voided quest still allows the star', () => {
  let s = start(77);
  s.day.quests = [quest('wholeList', 0), quest('raiseTwo', 1, { refs: ['deep', 'read'] }), quest('noWaste', 2)];
  assert.ok(!E.content.QUESTS.pool.some((q) => q.coins === POOL.raiseTwo.coins && q.id !== 'raiseTwo'), 'no other 60-coin quest');
  s = act(s, { type: 'list/swap', taskId: 'deep', task: { name: 'Study', type: 'quantity', unit: 'minutes', chill: 30 }, reason: 'x' }).state;
  const q = s.day.quests[1];
  assert.notEqual(q.id, 'raiseTwo');
  assert.equal(q.coins, POOL.raiseTwo.coins, 'original payout kept');
  assert.ok(!q.voided);
  assert.equal(q.replaced, 'raiseTwo');
  // Voided (nothing could replace it): the other two quests alone earn the star.
  let v = start(78);
  v.day.quests = [quest('wholeList', 0), quest('raiseTwo', 1, { voided: true }), quest('halfBy', 2)];
  v = playDay(v, D, 9);
  const r = E.advance(v, at(D, 9, 6));
  assert.ok(r.events.some((e) => e.type === 'quest.star'));
});

test('real-life rewards in viewShop carry reasonCode/reason/owned/max like catalogue items', () => {
  let s = start();
  const find = (st) => E.viewShop(st, at(D, 9)).tabs.find((t) => t.id === 'reallife').items.find((i) => i.maxPerDay);
  let it = find(s);
  assert.ok(it, 'a reward with a daily max exists');
  s.inv.coins = 0;
  it = find(s);
  assert.deepEqual([it.canBuy, it.reasonCode, it.owned, it.max], [false, 'not_enough_coins', null, it.maxPerDay]);
  assert.match(it.reason, /costs/);
  s.inv.coins = it.coins * 10;
  assert.equal(find(s).canBuy, true);
  assert.equal(find(s).reason, null);
  for (let k = 0; k < it.maxPerDay; k += 1) s = act(s, { type: 'reward/redeem', rewardId: it.id }).state;
  it = find(s);
  assert.deepEqual([it.canBuy, it.reasonCode], [false, 'reward_daily_max']);
  assert.throws(() => act(s, { type: 'reward/redeem', rewardId: it.id }), { code: 'reward_daily_max' });
});

test('limits that used to be inline now come from config', () => {
  const c = E.CONFIG;
  assert.deepEqual(c.rewards, { max: 100, nameMax: 60, idMax: 40, coinsMax: 1_000_000 });
  assert.equal(c.tasks.qtyMax, 100000);
  assert.equal(c.history.fallenShown, 6);
  const s = start();
  E.setConfig({ rewards: { max: 1, coinsMax: 50 }, tasks: { qtyMax: 10 } });
  try {
    assert.throws(() => act(s, { type: 'reward/save', rewards: [{ name: 'A', coins: 5 }, { name: 'B', coins: 5 }] }), { code: 'bad_rewards' });
    assert.throws(() => act(s, { type: 'reward/save', rewards: [{ name: 'A', coins: 51 }] }), { code: 'bad_rewards' });
    assert.ok(act(s, { type: 'reward/save', rewards: [{ name: 'A', coins: 50 }] }).state);
    assert.throws(() => act(s, { type: 'task/tick', taskId: 'read', qty: 11 }), { code: 'bad_qty' });
  } finally {
    E.resetConfig();
  }
});
