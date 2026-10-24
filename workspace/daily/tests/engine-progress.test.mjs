// Engine: daily quests (draw rules, targets, awards after the undo window, stars, weekly chest), Keeper road,
// season track, Petdex, receipts, the morning card and the public snapshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine/index.js';
import { addKeeperXp, addSeasonXp, discover, keeperRewardsFor, questTargets } from '../engine/progress.js';
import { streamRng, seedFrom } from '../engine/rng.js';

const T = E.time;
const at = (key, hh, mm = 0) => T.nyInstant(key, hh * 60 + mm);
const D = '2026-11-02'; // Monday
const day = (n) => T.addDays(D, n);
const act = (s, a, now = at(D, 9)) => E.applyAction(s, a, now);
const POOL = Object.fromEntries(E.content.QUESTS.pool.map((q) => [q.id, q]));

function start(seed = 55) {
  let s = E.newGame({ seed, now: at(D, 8), tasks: E.DEFAULT_TASKS });
  s = act(s, { type: 'petEgg/hatch', petEggId: s.inv.petEggs[0].id }, at(D, 8, 1)).state;
  return s;
}
function playDay(s, key, hh = 9) {
  for (const t of s.list.tasks) if (!s.day.ticks[t.id]) s = act(s, { type: 'task/tick', taskId: t.id }, at(key, hh)).state;
  return s;
}
function force(s, ids) {
  s.day.quests = ids.map((id, i) => ({ id, slot: i + 1, cat: POOL[id].cat, timed: false, coins: POOL[id].coins, text: id, refs: [], deadline: null, private: false, done: false, doneAt: null, paid: 0 }));
  return s;
}

test('quest draw: 3 a day — progress, task, care (or task); ≤ 1 timed; no repeats within 3 days; exclusives apart', () => {
  for (const seed of [1, 2, 3]) {
    let s = start(seed);
    const drawn = [];
    for (let k = 0; k < 30; k += 1) {
      const q = s.day.quests;
      assert.equal(q.length, 3);
      assert.equal(POOL[q[0].id].cat, 'progress');
      assert.equal(POOL[q[1].id].cat, 'task');
      assert.ok(['care', 'task'].includes(POOL[q[2].id].cat));
      assert.ok(q.filter((x) => x.timed).length <= 1, 'at most one timed quest');
      const ids = q.map((x) => x.id);
      assert.equal(new Set(ids).size, 3);
      for (const [a, b] of E.content.QUESTS.exclusive) assert.ok(!(ids.includes(a) && ids.includes(b)), `${a}/${b}`);
      for (const prev of drawn.slice(-3)) for (const id of ids) assert.ok(!prev.includes(id), `${id} repeated within 3 days`);
      for (const x of q) assert.ok(!/\{\w+\}/.test(x.text), `filled: ${x.text}`);
      drawn.push(ids);
      s = playDay(s, day(k));
      s = act(s, { type: 'pet/feed', petId: s.pets[0].id, amount: 100 }, at(day(k), 10)).state;
      s = E.advance(s, at(day(k + 1), 6)).state;
    }
  }
});

test('care quests need Chill food to cover every meal and upkeep; never with 3 hungry seats on a 6-task list', () => {
  let s = start(4);
  let care = 0;
  for (let k = 0; k < 20; k += 1) {
    care += s.day.quests.filter((q) => q.cat === 'care').length;
    s = playDay(s, day(k));
    s = act(s, { type: 'pet/feed', petId: s.pets[0].id, amount: 100 }, at(day(k), 10)).state;
    s = E.advance(s, at(day(k + 1), 6)).state;
  }
  assert.ok(care > 0, 'with one pet (100 + 0 ≤ 180 Chill food) care quests appear');
  let t = start(4);
  const base = structuredClone(t.pets[0]);
  t.pets.push({ ...base, id: 'q2', name: 'Q2' }, { ...base, id: 'q3', name: 'Q3' });
  for (let k = 0; k < 20; k += 1) {
    t = E.advance(t, at(day(k), 6)).state;
    if (k > 0) assert.ok(!t.day.quests.some((q) => q.cat === 'care'), 'meals 300 > Chill food 180');
    t = playDay(t, day(k));
    for (const p of t.pets) t = act(t, { type: 'pet/feed', petId: p.id, amount: 100 }, at(day(k), 10)).state;
  }
});

test('quest targets: {frog} = latest median tick time (not Sleep); {lastMissed}; pairs are distinct', () => {
  const s = start();
  s.history = [1, 2, 3].map((k) => ({
    key: T.addDays(D, -k), complete: true, frozen: false, unticked: [],
    ticks: { sleep: { min: 23 * 60, level: 1, raised: false }, read: { min: 20 * 60, level: 1, raised: true }, deep: { min: 10 * 60, level: 1, raised: false } },
  }));
  s.history.push({ key: T.addDays(D, -5), complete: false, frozen: false, unticked: ['sleep', 'veg'], ticks: {} });
  const rng = streamRng({ seed: seedFrom(1), n: 0 });
  const tg = questTargets(s, D, rng);
  assert.equal(tg.frog, 'read');
  assert.equal(tg.lastMissed, 'veg', 'the first non-Sleep unticked task of the last incomplete day');
  assert.notEqual(tg.target, 'read', 'read was raised; another task was raised least');
  assert.notEqual(tg.pairA, tg.pairB);
  assert.equal(tg.physical, 'workout');
  assert.equal(tg.longest, 'deep');
  assert.equal(tg.sleep, 'sleep');
});

test('quests award automatically, once, only after ticks survive the 5-minute undo window', () => {
  let s = start();
  s = force(s, ['wholeList', 'keepWord', 'halfBy']);
  s = playDay(s, D, 9);
  let r = E.advance(s, at(D, 9, 4));
  assert.ok(!r.events.some((e) => e.type === 'quest.completed'));
  const coins = r.state.inv.coins;
  r = E.advance(r.state, at(D, 9, 5));
  const done = r.events.filter((e) => e.type === 'quest.completed').map((e) => e.questId);
  assert.deepEqual(done.sort(), ['halfBy', 'keepWord', 'wholeList']);
  assert.equal(r.state.inv.coins, coins + 30 + 40 + 35);
  assert.ok(r.events.some((e) => e.type === 'quest.star' && e.weekStars === 1));
  assert.deepEqual(E.advance(r.state, at(D, 9, 6)).events, []);
  const view = E.viewToday(r.state, at(D, 10));
  assert.ok(view.quests.every((q) => q.done && q.progress === q.target));
  assert.equal(view.weekStars, 1);
});

test('quest predicates: deadlines, raises and the frog', () => {
  let s = start();
  s.day.targets.frog = 'read';
  s.day.targets.target = 'deep';
  s.day.quests = [
    { id: 'cleanSweep', slot: 1, cat: 'progress', timed: true, coins: 50, text: '', refs: [], deadline: 18 * 60, done: false, paid: 0 },
    { id: 'frog', slot: 2, cat: 'task', timed: false, coins: 45, text: '', refs: ['read'], deadline: null, done: false, paid: 0 },
    { id: 'raiseOne', slot: 3, cat: 'task', timed: false, coins: 45, text: '', refs: ['deep'], deadline: null, done: false, paid: 0 },
  ];
  s = act(s, { type: 'task/tick', taskId: 'sleep' }, at(D, 7)).state; // Sleep doesn't count against the frog
  s = act(s, { type: 'task/tick', taskId: 'read' }, at(D, 8)).state;
  s = act(s, { type: 'task/raise', taskId: 'deep', level: 'medium' }, at(D, 9)).state;
  s = playDay(s, D, 19); // finishing at 19:00 misses the 18:00 sweep
  const r = E.advance(s, at(D, 23));
  const done = new Set(r.state.lastDay.quests.filter((q) => q.done).map((q) => q.id));
  assert.ok(done.has('frog'));
  assert.ok(done.has('raiseOne'));
  assert.ok(!done.has('cleanSweep'));
});

test('5 quest stars in a Monday–Sunday week open the weekly chest: one Rare egg (streak odds) + 3 diamonds', () => {
  let s = start();
  let chest = null;
  for (let k = 0; k < 5; k += 1) {
    s = force(s, ['wholeList', 'keepWord', 'halfBy']);
    s = playDay(s, day(k));
    const r = E.advance(s, at(day(k + 1), 6));
    chest = chest || r.events.find((e) => e.type === 'chest.ready');
    s = r.state;
  }
  assert.ok(chest);
  assert.equal(chest.tier, 1);
  assert.equal(chest.diamonds, 3);
  assert.ok(s.inv.openEggs.some((e) => e.source === 'chest' && e.tier === 1));
  assert.equal(s.quests.week.stars, 5);
  // The next Monday starts a new week.
  for (let k = 5; k < 7; k += 1) s = E.advance(playDay(force(s, ['wholeList', 'keepWord', 'halfBy']), day(k)), at(day(k + 1), 6)).state;
  assert.equal(E.viewToday(s, at(day(7), 9)).weekStars, 0);
});

test('Keeper road: XP 1000 + 250K, coins 20 + 5K (+250 every 10), every 5: 10 💎 + 1 backpack space, unlocks', () => {
  const s = start();
  const coins = s.inv.coins;
  const events = [];
  addKeeperXp(s, 2750, events);
  assert.equal(s.keeper.level, 3);
  assert.equal(s.keeper.xp, 0);
  assert.equal(s.inv.coins, coins + 30 + 35);
  assert.ok(s.cosmetics.includes('seedling'));
  addKeeperXp(s, 6500 - 2750, events);
  assert.equal(s.keeper.level, 5);
  assert.ok(s.cosmetics.includes('keepersCap'));
  assert.equal(E.viewPets(s).backpackCap, 13);
  assert.equal(keeperRewardsFor(10).coins, 70 + 250);
  assert.equal(keeperRewardsFor(10).title, 'Keeper');
  assert.equal(keeperRewardsFor(25).species, 'hedgehog');
  let total = { coins: 0, diamonds: 0 };
  for (let k = 1; k <= 60; k += 1) {
    const r = keeperRewardsFor(k);
    total = { coins: total.coins + r.coins, diamonds: total.diamonds + r.diamonds };
  }
  assert.deepEqual(total, { coins: 11850, diamonds: 120 });
  assert.ok(!s.unlockedSpecies.includes('hedgehog'));
  addKeeperXp(s, 99000 - 6500, events);
  assert.equal(s.keeper.level, 25);
  assert.ok(s.unlockedSpecies.includes('hedgehog'));
  assert.equal(new Set(events.filter((e) => e.type === 'keeper.levelUp').map((e) => e.level)).size, 24);
  // Keeper XP comes from the day's final food at close.
  let t = start();
  t = playDay(t, D);
  t = E.advance(t, at(day(1), 6)).state;
  assert.equal(t.keeper.lifetimeFood, 432);
});

test('season track: 30 tiers × 750 from November; rewards per CONTENT.md H.2; none in the prologue', () => {
  const s = start();
  const before = structuredClone(s.inv);
  const events = [];
  addSeasonXp(s, '2026-10-28', 5000, events);
  assert.equal(events.length, 0, 'no season during the launch prologue');
  addSeasonXp(s, '2026-11-20', 22500, events);
  assert.equal(s.season.tier, 30);
  assert.equal(events.length, 30);
  assert.equal(s.inv.coins - before.coins, 1440);
  assert.equal(s.inv.diamonds - before.diamonds, 15);
  assert.equal(s.inv.openEggs.filter((e) => e.source === 'season' && e.tier === 1).length, 4);
  assert.deepEqual(s.inv.eggFood.map((n, i) => n - before.eggFood[i]), [6, 7, 8, 1, 0, 0, 0]);
  assert.equal(s.inv.charms[E.CONFIG.charms.season] - before.charms[E.CONFIG.charms.season], 1, 'tier 20 pays the charm kind in config.charms.season');
  assert.ok(s.cosmetics.includes('acornCap'));
  // A new month resets the track.
  addSeasonXp(s, '2026-12-01', 800, events);
  assert.deepEqual([s.season.month, s.season.tier], ['2026-12', 1]);
  E.setConfig({ charms: { season: 'tier' } });
  try {
    const tierBefore = s.inv.charms.tier;
    addSeasonXp(s, '2026-12-02', 15000, events);
    assert.equal(s.inv.charms.tier - tierBefore, 1);
  } finally {
    E.resetConfig();
  }
  const view = E.viewToday(start(), at('2026-10-28', 9));
  assert.equal(view.prologue, true);
  assert.match(view.season.copy, /First season begins November 1/);
});

test('Petdex: first discovery of a species × tier cell pays 100 × (tier + 1) coins, + 5/10/20/50 💎 at Epic+', () => {
  const s = start();
  const c = s.inv.coins;
  const d = s.inv.diamonds;
  const events = [];
  discover(s, 'owl', 3, D, events);
  discover(s, 'owl', 3, D, events);
  discover(s, 'fox', 6, D, events);
  assert.equal(events.length, 2);
  assert.equal(s.inv.coins - c, 400 + 700);
  assert.equal(s.inv.diamonds - d, 5 + 50);
  const dex = E.viewPetdex(s);
  assert.equal(dex.cells['owl:3'].found, true);
  assert.equal(dex.cells['owl:4'].found, false);
  assert.equal(dex.species.find((x) => x.id === 'hedgehog').unlocked, false);
});

test('receipts: real quantities by task kind, monthly and lifetime; goals stay out of the public snapshot', () => {
  let s = E.newGame({ seed: 5, now: at(D, 8), tasks: E.DEFAULT_TASKS.map((t) => (t.id === 'read' ? { ...t, goal: 'ILO' } : t)) });
  s = act(s, { type: 'task/tick', taskId: 'read', qty: 40 }).state;
  s = act(s, { type: 'task/tick', taskId: 'grass', qty: 90 }).state;
  s = act(s, { type: 'task/tick', taskId: 'sleep', qty: 7 }).state;
  s = act(s, { type: 'task/tick', taskId: 'deep', goalTag: 'ILO' }).state;
  s = act(s, { type: 'day/setLevel', level: 'hard' }).state;
  s = act(s, { type: 'task/tick', taskId: 'workout' }).state;
  let v = E.viewReceipts(s, at(D, 10));
  assert.deepEqual([v.month.pagesRead, v.month.hoursOutside, v.month.avgSleepHours, v.month.workouts, v.month.hardOrAbove], [40, 1.5, 7, 1, 1]);
  assert.deepEqual(v.goals, [{ goal: 'ILO', tasksDone: 1 }]);
  assert.equal(v.deepTags.length, 0, 'the ledger fills at close');
  s = E.advance(s, at(day(1), 9)).state;
  s = act(s, { type: 'task/tick', taskId: 'sleep', qty: 8 }, at(day(1), 9)).state;
  v = E.viewReceipts(s, at(day(1), 10));
  assert.equal(v.month.avgSleepHours, 7.5);
  assert.equal(v.lifetime.pagesRead, 40);
  assert.equal(v.deepTags[0].tag, 'ILO');
  assert.equal(v.deepTags[0].weekHours, 0.8);
  const snap = E.publicSnapshot(s, at(day(1), 10));
  assert.equal(snap.format, 'daily-public');
  assert.equal(snap.kind, 'published');
  assert.equal(snap.receipts.month.key, '2026-11');
  assert.equal(snap.receipts.goals, undefined);
  assert.equal(snap.receipts.deepTags, undefined);
  assert.ok(snap.today.tasks.every((t) => !('goal' in t)));
  const text = JSON.stringify(snap);
  for (const secret of ['settings', 'redemptions', 'Dessert run', 'ILO', 'companionId']) assert.ok(!text.includes(secret), `snapshot leaks ${secret}`);
  assert.equal(E.publicSnapshot(s, at(day(1), 10), { preview: true }).kind, 'preview');
});

test('morning card and header: yesterday\'s receipt, tonight\'s eggs and the next step', () => {
  let s = start();
  s = playDay(s, D);
  s = E.advance(s, at(day(1), 7)).state;
  const m = E.viewMorning(s, at(day(1), 7));
  assert.equal(m.heading, 'Yesterday counted.');
  assert.equal(m.tasksDone, 6);
  assert.equal(m.streakAfter, 1);
  assert.ok(m.eggsWaiting.some((e) => e.source === 'streak'));
  const h = E.viewHeader(s, at(day(1), 7));
  assert.deepEqual([h.tonight.tier, h.tonight.count], [0, 1]);
  assert.deepEqual([h.nextStep.streak, h.nextStep.count], [4, 2]);
  assert.equal(h.window.phase, 'open');
  assert.equal(h.keeper.title, 'Apprentice Keeper');
  const odds = E.viewOdds();
  assert.equal(odds.itemCount.mean, 3 + 9 * 0.28);
  assert.equal(odds.flashSale.price, 15400);
});
