// Engine: day close (idempotency, catch-up), streak and streak eggs, freezes, penalties, comeback XP, the level
// floor, death and the 50 % backpack loss, Phoenix, welcome-back, Nine Lives, Heartstone, upkeep, dividends.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine/index.js';
import { streamRng, seedFrom } from '../engine/rng.js';
import { cumulativeXp, xpNext } from '../engine/pets.js';

const T = E.time;
const at = (key, hh, mm = 0) => T.nyInstant(key, hh * 60 + mm);
const D = '2026-11-02';
const day = (n) => T.addDays(D, n);
const act = (s, a, now) => E.applyAction(s, a, now);

function start() {
  let s = E.newGame({ seed: 9, now: at(D, 8), tasks: E.DEFAULT_TASKS });
  s = act(s, { type: 'petEgg/hatch', petEggId: s.inv.petEggs[0].id }, at(D, 8, 1)).state;
  return s;
}

function pet(s, over = {}) {
  const base = structuredClone(s.pets[0]);
  const p = { ...base, id: `x${s.seq + 1}`, name: `T${s.seq + 1}`, level: 1, xp: 0, stars: 1, tier: 0, trinkets: [], fed: { day: null, amount: 0 }, comebackOwed: 0, meter: 0, hungrySince: null, lastLoss: null, nineLives: 'none', beacon: false, ...over };
  s.seq += 1;
  s.pets.push(p);
  return p;
}

/** Tick every task at 09:00 and feed each active pet its 100 (as far as the pool goes). */
function playDay(s, key, { feed = true } = {}) {
  for (const t of s.list.tasks) s = act(s, { type: 'task/tick', taskId: t.id }, at(key, 9)).state;
  if (feed) {
    for (const p of s.pets.filter((x) => x.location === 'active')) {
      const amount = Math.min(100, s.day.pool);
      if (amount > 0) s = act(s, { type: 'pet/feed', petId: p.id, amount }, at(key, 10)).state;
    }
  }
  return s;
}
const closeEvents = (r) => r.events.filter((e) => e.type === 'day.closed');

test('day close is idempotent: running advance twice changes nothing', () => {
  let s = playDay(start(), D);
  const r1 = E.advance(s, at(day(1), 7));
  const r2 = E.advance(r1.state, at(day(1), 7));
  assert.deepEqual(r2.state, r1.state);
  assert.deepEqual(r2.events, []);
  const r3 = E.advance(s, at(day(1), 7));
  assert.deepEqual(r3, r1, 'same input, same output');
  assert.equal(closeEvents(r1).length, 1);
  // Advancing again later the same evening still closes nothing new.
  assert.equal(closeEvents(E.advance(r1.state, at(day(1), 21, 59))).length, 0);
});

test('a 3-day absence catches up in order: hungry, starving, death', () => {
  let s = playDay(start(), D);
  s = E.advance(s, at(day(1), 7)).state;
  assert.equal(s.streak, 1);
  const r = E.advance(s, at(day(4), 7));
  const closes = closeEvents(r);
  assert.deepEqual(closes.map((c) => c.dayKey), [day(1), day(2), day(3)]);
  assert.deepEqual(closes.map((c) => c.outcome), ['missed', 'missed', 'missed']);
  assert.deepEqual(r.events.filter((e) => e.type === 'hunger').map((e) => e.state), ['hungry', 'starving']);
  assert.equal(r.events.filter((e) => e.type === 'death').length, 1);
  assert.equal(r.state.streak, 0);
  assert.equal(r.state.missRun, 0, 'the miss count resets after a death');
  assert.equal(r.state.day.key, day(4));
  assert.equal(r.state.lastClosed, day(3));
});

test('streak-band egg counts by thirds and lucky days', () => {
  const cases = [[1, 0, 1], [3, 0, 1], [4, 0, 2], [6, 0, 2], [7, 0, 3], [9, 0, 3], [11, 1, 1], [39, 1, 1], [40, 1, 2], [69, 1, 2], [70, 1, 3], [99, 1, 3],
    [101, 2, 1], [399, 2, 1], [400, 2, 2], [699, 2, 2], [700, 2, 3], [999, 2, 3], [1001, 3, 1]];
  for (const [d, tier, count] of cases) {
    const e = E.streakEggs(d);
    assert.deepEqual([e.tier, e.count, e.lucky], [tier, count, false], `day ${d}`);
  }
  const rng = streamRng({ seed: seedFrom(3), n: 0 });
  for (const [d, tier] of [[10, 1], [100, 2], [1000, 3]]) {
    const seen = new Set();
    for (let i = 0; i < 300; i += 1) {
      const e = E.streakEggs(d, rng);
      assert.equal(e.lucky, true);
      assert.equal(e.tier, tier);
      assert.ok(e.count >= 5 && e.count <= 10);
      seen.add(e.count);
    }
    assert.equal(seen.size, 6, 'uniform over 5–10');
  }
});

test('a complete day pays streak eggs; day 10 is a lucky day of Rare eggs', () => {
  let s = playDay(start(), D);
  let r = E.advance(s, at(day(1), 7));
  const ev = r.events.find((e) => e.type === 'streak.eggs');
  assert.deepEqual([ev.tier, ev.count, ev.lucky], [0, 1, false]);
  assert.equal(r.state.inv.openEggs.filter((e) => e.source === 'streak').length, 1);
  s = r.state;
  s.streak = 9;
  s = playDay(s, day(1));
  r = E.advance(s, at(day(2), 7));
  const lucky = r.events.find((e) => e.type === 'streak.eggs');
  assert.equal(lucky.lucky, true);
  assert.equal(lucky.tier, 1);
  assert.ok(lucky.count >= 5 && lucky.count <= 10);
  assert.equal(r.state.inv.openEggs.filter((e) => e.source === 'streak' && e.tier === 1).length, lucky.count);
});

test('freezes: bought in the shop, held ≤ 3, used automatically; the streak holds and the miss is not counted', () => {
  let s = start();
  s.inv.coins = 5000;
  for (let i = 0; i < 3; i += 1) s = act(s, { type: 'shop/buy', itemId: 'freeze' }, at(D, 9)).state;
  assert.equal(s.inv.freezes, 3);
  assert.throws(() => act(s, { type: 'shop/buy', itemId: 'freeze' }, at(D, 9)), { code: 'freeze_cap' });
  assert.equal(s.inv.coins, 5000 - 1800);
  s = playDay(s, D);
  s = E.advance(s, at(day(1), 7)).state; // streak 1
  const r = E.advance(s, at(day(2), 7)); // day(1) missed
  assert.equal(closeEvents(r)[0].outcome, 'frozen');
  assert.ok(r.events.some((e) => e.type === 'freeze.used'));
  assert.equal(r.state.streak, 1);
  assert.equal(r.state.missRun, 0);
  assert.equal(r.state.inv.freezes, 2);
  assert.ok(!r.events.some((e) => e.type === 'hunger'));
  assert.ok(!r.events.some((e) => e.type === 'pet.levelDown' && (e.reason === 'hungry' || e.reason === 'starving')));
});

test('penalties stack (Hungry −2, Starving −5 more), the floor is 1, comeback XP owes back what was lost', () => {
  E.setConfig({ penalties: { underfedStacksWithHunger: false } });
  try {
    let s = start();
    const a = pet(s, { species: 'dragon', tier: 3, level: 20, location: 'backpack' }); // no XP skill
    const b = pet(s, { tier: 0, level: 3, location: 'backpack' });
    s.inv.freezes = 0;
    let r = E.advance(s, at(day(1), 7)); // D missed: Hungry
    let pa = r.state.pets.find((p) => p.id === a.id);
    assert.equal(pa.level, 18);
    assert.equal(pa.comebackOwed, xpNext(18) + xpNext(19));
    assert.equal(r.state.pets.find((p) => p.id === b.id).level, 1);
    r = E.advance(r.state, at(day(2), 7)); // day(1) missed: Starving
    pa = r.state.pets.find((p) => p.id === a.id);
    assert.equal(pa.level, 13);
    assert.equal(pa.comebackOwed, cumulativeXp(20) - cumulativeXp(13));
    assert.equal(r.state.pets.find((p) => p.id === b.id).level, 1, 'level floor');
    // Comeback: 2× XP until the lost XP is regained.
    s = r.state;
    const owed = pa.comebackOwed;
    s.pets.find((p) => p.id === a.id).location = 'active';
    s.pets[0].location = 'backpack';
    s = playDay(s, day(2), { feed: false });
    s = act(s, { type: 'pet/feed', petId: a.id, amount: 300 }, at(day(2), 10)).state;
    pa = s.pets.find((p) => p.id === a.id);
    assert.equal(owed - pa.comebackOwed, 400, '200 growth food → 400 XP at 2×');
  } finally {
    E.resetConfig();
  }
});

test('by default the underfed −1 and upkeep −1 also apply on a missed day', () => {
  let s = start();
  const a = s.pets[0];
  s.pets[0].level = 10;
  const r = E.advance(s, at(day(1), 7));
  const downs = r.events.filter((e) => e.type === 'pet.levelDown' && e.petId === a.id).map((e) => [e.reason, e.levels]);
  assert.deepEqual(downs, [['underfed', 1], ['hungry', 2]]);
  assert.equal(r.state.pets[0].level, 7);
});

test('death: active pets die, the backpack loses 50 % of everything, Ashes for 7 days', () => {
  let s = start();
  const epic = pet(s, { tier: 3, level: 20, stars: 2, location: 'active', trinkets: [{ id: 'tk90', defId: 'coinPurse', usedAt: null }] });
  for (let i = 0; i < 4; i += 1) pet(s, { tier: 0, level: 5, location: 'backpack' });
  Object.assign(s.inv, { coins: 1000, diamonds: 7, shards: 5, eggFood: [5, 4, 0, 0, 0, 0, 1], beacons: 3, charms: { tier: 3, sprout: 1 } });
  s.inv.openEggs = [0, 1, 2].map((i) => ({ id: `oe9${i}`, tier: 0, source: 'streak', petId: null, extraItems: 0, petEggPct: 0, laidOn: null }));
  s.inv.petEggs = [0, 1].map((i) => ({ id: `pe9${i}`, tier: 1, fed: [], charm: null, guaranteed: false, source: 'shop' }));
  s.inv.trinkets = [{ id: 'tk80', defId: 'copperBell', usedAt: null }, { id: 'tk81', defId: 'mossCloak', usedAt: null }];
  const r = E.advance(s, at(day(3), 7)); // D, D+1, D+2 missed
  const death = r.events.find((e) => e.type === 'death');
  assert.deepEqual(death.petIds.sort(), [s.pets[0].id, epic.id].sort());
  const st = r.state;
  assert.equal(st.pets.filter((p) => p.location === 'active').length, 0);
  assert.equal(st.pets.length, 2, '4 backpack pets → 2');
  assert.equal(st.inv.coins, 500);
  assert.equal(st.inv.diamonds, 4);
  assert.equal(st.inv.shards, 3);
  assert.deepEqual(st.inv.eggFood, [3, 2, 0, 0, 0, 0, 1]);
  assert.equal(st.inv.openEggs.length, 2);
  assert.equal(st.inv.petEggs.length, 1);
  assert.equal(st.inv.trinkets.length, 1);
  assert.equal(st.inv.beacons, 2);
  assert.deepEqual(st.inv.charms, { tier: 2, sprout: 1 });
  assert.equal(st.ashes.petId, epic.id, 'the highest-tier fallen pet');
  assert.equal(st.ashes.deathDay, day(2));
  assert.equal(st.ashes.deadlineDay, day(9));
  assert.equal(st.welcomePending, true);
  assert.equal(E.viewHeader(st, at(day(3), 7)).hunger, 'dead');
  const fallen = E.viewPets(st).fallen;
  assert.equal(fallen.find((p) => p.id === epic.id).mood, 'ashes');
  assert.equal(fallen.find((p) => p.id !== epic.id).mood, 'dead');
  assert.equal(st.inv.petEggs.some((e) => e.guaranteed), false, 'pets remain, so no fresh egg');
});

test('Phoenix: 3 complete days in a row inside the window revive the best pet at half level; welcome-back egg', () => {
  let s = start();
  const epic = pet(s, { tier: 3, level: 21, stars: 3, location: 'active', trinkets: [{ id: 'tk90', defId: 'coinPurse', usedAt: null }] });
  s = E.advance(s, at(day(3), 7)).state; // death on day(2)
  const lvl = s.ashes.pets.find((p) => p.id === epic.id).level; // after −1−2 and −1−5
  assert.equal(lvl, 21 - 3 - 6 - 1); // underfed+Hungry, underfed+Starving, underfed on the death night
  // day(3) complete → welcome egg + progress 1; day(4) complete; day(5) miss → reset; day(6..8) complete → revive.
  s = playDay(s, day(3));
  let r = E.advance(s, at(day(4), 7));
  assert.ok(r.events.some((e) => e.type === 'welcome.back'));
  assert.equal(r.state.inv.openEggs.filter((e) => e.source === 'welcome' && e.tier === 1).length, 1);
  assert.equal(r.state.ashes.done, 1);
  s = playDay(r.state, day(4));
  s = E.advance(s, at(day(5), 7)).state;
  assert.equal(s.ashes.done, 2);
  r = E.advance(s, at(day(6), 7)); // day(5) missed
  assert.equal(r.state.ashes.done, 0, 'a miss resets the count');
  assert.equal(r.state.ashes.deadlineDay, day(9), 'but not the window');
  s = r.state;
  for (const k of [6, 7, 8]) {
    s = playDay(s, day(k));
    r = E.advance(s, at(day(k + 1), 7));
    s = r.state;
  }
  const rev = r.events.find((e) => e.type === 'phoenix.revived');
  assert.ok(rev);
  const back = s.pets.find((p) => p.id === epic.id);
  assert.equal(back.level, Math.floor(lvl / 2));
  assert.equal(back.tier, 3);
  assert.equal(back.stars, 3);
  assert.deepEqual(back.trinkets.map((t) => t.defId), ['coinPurse']);
  assert.ok(back.comebackOwed > 0);
  assert.equal(s.ashes, null);
  assert.equal(s.graveyard.length, 1, 'the other fallen pet is gone for good');
});

test('Phoenix window expires after 7 days', () => {
  let s = start();
  s = E.advance(s, at(day(3), 7)).state; // death on day(2), deadline day(9)
  let events = [];
  for (let k = 3; k <= 9; k += 1) {
    if (k % 3 !== 2) s = playDay(s, day(k)); // never 3 in a row: days 3,4 done, 5 missed, 6,7 done, 8 missed, 9 done
    const r = E.advance(s, at(day(k + 1), 7));
    events = events.concat(r.events);
    s = r.state;
  }
  assert.ok(events.some((e) => e.type === 'phoenix.expired'));
  assert.ok(!events.some((e) => e.type === 'phoenix.revived'));
  assert.equal(s.ashes, null);
  assert.ok(s.graveyard.length >= 1);
});

test('a fresh Ordinary starter egg when no pets are left (only one, however long the absence)', () => {
  const s = start();
  const r = E.advance(s, at(day(12), 7)); // four deaths' worth of misses
  assert.ok(r.events.filter((e) => e.type === 'death').length >= 3);
  assert.equal(r.state.pets.length, 0);
  const fresh = r.state.inv.petEggs.filter((e) => e.guaranteed);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].tier, 0);
  assert.equal(fresh[0].fed.length, 5, 'ready to hatch');
});

test('5★ Nine Lives: one charge per lineage, survives at level 1 owing comeback XP', () => {
  let s = start();
  const five = pet(s, { tier: 2, level: 30, stars: 5, nineLives: 'charged', location: 'active' });
  const r = E.advance(s, at(day(3), 7));
  const p = r.state.pets.find((x) => x.id === five.id);
  assert.ok(p, 'it survived');
  assert.equal(p.level, 1);
  assert.equal(p.nineLives, 'spent');
  assert.ok(p.comebackOwed > 0);
  assert.equal(p.stars, 5);
  assert.deepEqual(r.events.find((e) => e.type === 'death').survived, [{ petId: five.id, by: 'nineLives' }]);
  // The next death takes it.
  const r2 = E.advance(r.state, at(day(6), 7));
  assert.ok(!r2.state.pets.some((x) => x.id === five.id));
});

test('Heartstone: a charge on the item that recharges 30 complete days after use', () => {
  let s = start();
  const u = pet(s, { tier: 6, level: 30, location: 'active', trinkets: [{ id: 'tk70', defId: 'heartstone', usedAt: null }] });
  let r = E.advance(s, at(day(3), 7));
  let p = r.state.pets.find((x) => x.id === u.id);
  assert.ok(p);
  assert.equal(p.level, 1);
  assert.equal(p.trinkets[0].usedAt, 0);
  r = E.advance(r.state, at(day(6), 7));
  assert.ok(!r.state.pets.some((x) => x.id === u.id), 'not recharged: it falls');
});

test('upkeep: 10 per backpack pet from the unspent pool, highest tier first; −1 level if not covered', () => {
  let s = start();
  const hi = pet(s, { tier: 2, level: 5, location: 'backpack' });
  const lo = pet(s, { tier: 0, level: 5, location: 'backpack' });
  s = playDay(s, D, { feed: false });
  s = act(s, { type: 'pet/feed', petId: s.pets[0].id, amount: 350 }, at(D, 10)).state; // 10 left
  const r = E.advance(s, at(day(1), 7));
  const downs = r.events.filter((e) => e.type === 'pet.levelDown' && e.reason === 'upkeep').map((e) => e.petId);
  assert.deepEqual(downs, [lo.id]);
  assert.equal(r.state.pets.find((p) => p.id === hi.id).level, 5);
  assert.equal(r.state.pets.find((p) => p.id === lo.id).level, 4);
  assert.equal(E.viewPets(r.state).backpack.find((p) => p.id === lo.id).mood, 'hungry');
});

test('underfed active pets lose 1 level; fed ones pay dividends (coins × (1 + 1 %/level), Epic+ shards)', () => {
  let s = start();
  const epic = pet(s, { tier: 3, level: 10, location: 'active' });
  const unfed = pet(s, { tier: 0, level: 5, location: 'active' });
  s = playDay(s, D, { feed: false });
  s = act(s, { type: 'pet/feed', petId: s.pets[0].id, amount: 100 }, at(D, 10)).state;
  s = act(s, { type: 'pet/feed', petId: epic.id, amount: 100 }, at(D, 10)).state;
  s.inv.shards = 9;
  const coins = s.inv.coins;
  const r = E.advance(s, at(day(1), 7));
  const div = r.events.filter((e) => e.type === 'pet.dividend');
  assert.deepEqual(div.map((d) => [d.coins, d.shards]), [[5, 0], [44, 2]]);
  assert.equal(r.state.inv.diamonds, 1, 'shards convert at 10');
  assert.equal(r.state.inv.shards, 1);
  assert.ok(r.state.inv.coins >= coins + 49);
  assert.equal(r.state.pets.find((p) => p.id === unfed.id).level, 4);
  assert.ok(r.events.some((e) => e.type === 'pet.levelDown' && e.petId === unfed.id && e.reason === 'underfed'));
});

test('milestones pay once per account; badges stay after the streak breaks', () => {
  let s = start();
  s.streak = 6;
  s = playDay(s, D);
  let r = E.advance(s, at(day(1), 7));
  const m = r.events.find((e) => e.type === 'streak.milestone');
  assert.deepEqual([m.days, m.badge, m.coins, m.diamonds], [7, 'First Footprints', 300, 0]);
  s = r.state;
  s.streak = 6;
  s = playDay(s, day(1));
  r = E.advance(s, at(day(2), 7));
  assert.ok(!r.events.some((e) => e.type === 'streak.milestone'));
  assert.equal(r.state.badges.length, 1);
});
