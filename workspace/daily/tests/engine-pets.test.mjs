// Engine: levels and the XP curve, caps, comeback cap, egg meter and laying, seats and Beacons, seat overflow,
// backpack cap, moods, names, and every effect cap the design panel added.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine/index.js';
import {
  addGrowth, addXp, cumulativeXp, loseLevels, pickName, seatInfo, xpNext,
} from '../engine/pets.js';
import {
  computeEffects, petEggChancePct, petShield, petComebackBonus, teamHatchLuck, globalPct, streakEggBonusFor, upkeepCost, petNeed,
} from '../engine/effects.js';
import { streamRng, seedFrom } from '../engine/rng.js';

const T = E.time;
const at = (key, hh, mm = 0) => T.nyInstant(key, hh * 60 + mm);
const D = '2026-11-02';
const act = (s, a, now = at(D, 9)) => E.applyAction(s, a, now);

function start() {
  let s = E.newGame({ seed: 21, now: at(D, 8), tasks: E.DEFAULT_TASKS });
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
const ctxOf = (s, events = []) => ({ events, dayKey: D, counters: {}, fx: computeEffects(s) });

test('XP to next level is 50 × L + 50; levels cap by tier; XP at the cap is discarded', () => {
  assert.equal(xpNext(1), 100);
  assert.equal(xpNext(29), 1500);
  assert.equal(cumulativeXp(3), 100 + 150);
  assert.deepEqual(E.CONFIG.pets.levelCaps, [20, 30, 40, 55, 70, 85, 100]);
  const s = start();
  const p = s.pets[0];
  const events = [];
  addXp(s, p, 250, ctxOf(s, events));
  assert.equal(p.level, 3);
  assert.equal(p.xp, 0);
  assert.equal(events.filter((e) => e.type === 'pet.levelUp').length, 2);
  addXp(s, p, 1e7, ctxOf(s));
  assert.equal(p.level, 20, 'Ordinary cap');
  assert.equal(p.xp, 0);
  // Pacing check from PLAN §6: Lv 30 ≈ 6 weeks of a Medium day's surplus (864 − 300 meals ≈ 564 a day).
  assert.equal(cumulativeXp(30), 23_200);
  assert.ok(cumulativeXp(30) / 564 > 35 && cumulativeXp(30) / 564 < 49);
});

test('comeback XP: 2× until regained, bonuses add at most +1 (3× max)', () => {
  const s = start();
  const ax = pet(s, { species: 'axolotl', tier: 6, level: 40, location: 'active',
    trinkets: [{ id: 'k1', defId: 'heartstone', usedAt: null }] }); // Regrow +0.5, Heartstone +1
  pet(s, { species: 'owl', tier: 3, level: 40, location: 'active' }); // Second Wind +0.5 team
  const fx = computeEffects(s);
  assert.equal(petComebackBonus(fx, ax), 1, '0.5 + 1 + 0.5 capped at 1');
  loseLevels(s, ax, 2, 'hungry', ctxOf(s));
  const owed = ax.comebackOwed;
  assert.equal(owed, xpNext(38) + xpNext(39));
  const ctx = ctxOf(s);
  const gained = addXp(s, ax, 100, ctx);
  assert.equal(gained, 315, '100 × 1.05 (owl Study Group, team) × 3');
  assert.equal(ax.comebackOwed, owed - 315);
  assert.equal(ctx.counters.comebackXp, 315);
  // Crossing the end of the debt: the rest is 1×.
  ax.comebackOwed = 30;
  assert.equal(addXp(s, ax, 100, ctxOf(s)), 30 + 95);
  assert.equal(ax.comebackOwed, 0);
});

test('egg meter: 1:1 growth × (1 + 0.1 %/level) × eggMeterPct; full meters lay eggs of the pet\'s tier with overflow', () => {
  const s = start();
  const p = pet(s, { tier: 0, level: 10, location: 'active', species: 'fox' }); // Quick Paws +1 item
  const events = [];
  addGrowth(s, p, 500, { ...ctxOf(s, events), counters: {} });
  const gain = Math.floor(500 * 1.01);
  assert.equal(events.filter((e) => e.type === 'egg.laid').length, 2);
  assert.equal(p.meter, gain - 400);
  const laid = s.inv.openEggs.filter((e) => e.petId === p.id);
  assert.equal(laid.length, 2);
  assert.equal(laid[0].tier, 0);
  assert.equal(laid[0].source, 'laid');
  assert.equal(laid[0].extraItems, 1 + 1, '1 per 10 levels + Quick Paws');
  // Snapshot: equipping later never changes an egg already laid.
  p.level = 55;
  assert.equal(laid[0].extraItems, 2);
  assert.deepEqual(E.CONFIG.pets.meterCap, [200, 600, 1800, 5400, 16200, 48600, 145800]);
});

test('level item bonus caps at +5; effect items cap at +8', () => {
  const s = start();
  const p = pet(s, { tier: 6, level: 100, stars: 5, location: 'active', species: 'fox', // Quick Paws 1 + Bag of Tricks 1 + Nine-Tailed 2 = 4
    trinkets: [{ id: 'k1', defId: 'hornOfPlenty', usedAt: null }, { id: 'k2', defId: 'treasureMap', usedAt: null }] }); // +2 +1; stars 3★ +2, 4★ +1
  const events = [];
  addGrowth(s, p, 145800, { ...ctxOf(s, events), counters: {} });
  const egg = s.inv.openEggs.find((e) => e.petId === p.id);
  assert.equal(egg.extraItems, 5 + 8);
});

test('skills switch off below their unlock level; Beacons extend seat abilities only', () => {
  const s = start();
  const dragon = pet(s, { species: 'dragon', tier: 3, level: 9, location: 'active' });
  let fx = computeEffects(s);
  const base = E.petView(s, dragon, fx).dividend.coins;
  dragon.level = 10;
  fx = computeEffects(s);
  assert.equal(E.petView(s, dragon, fx).dividend.coins, Math.round(40 * 1.10 * 1.10));
  assert.equal(base, Math.round(40 * 1.09));
  dragon.level = 9;
  assert.equal(E.petView(s, dragon, computeEffects(s)).abilities.find((a) => a.id === 'goldSniffer').active, false);
  // A backpack fox with a Beacon: seat bonus counts, Errand Runner does not.
  const fox = pet(s, { species: 'fox', tier: 3, level: 25, location: 'backpack', beacon: true });
  fx = computeEffects(s);
  assert.equal(globalPct(fx, 'questCoinPct'), 0);
  assert.equal(seatInfo(s).fromAbilities, (1 + 2) + 2, 'the active Epic dragon (own seat + 2) and the Beaconed fox (+2)');
  assert.equal(seatInfo(s).ownSeats, 1);
  fox.location = 'active';
  assert.equal(globalPct(computeEffects(s), 'questCoinPct'), 10);
});

test('the same global/team effect from the same skill counts once', () => {
  const s = start();
  pet(s, { species: 'fox', tier: 2, level: 25, location: 'active' });
  pet(s, { species: 'fox', tier: 2, level: 25, location: 'active' });
  const fx = computeEffects(s);
  assert.equal(globalPct(fx, 'questCoinPct'), 10);
  const s2 = start();
  pet(s2, { species: 'turtle', tier: 2, level: 25, location: 'active' });
  pet(s2, { species: 'turtle', tier: 2, level: 25, location: 'active' });
  const fx2 = computeEffects(s2);
  assert.equal(streakEggBonusFor(fx2, 7), 1);
  assert.equal(streakEggBonusFor(fx2, 8), 0);
  assert.equal(upkeepCost(fx2), 9, 'Home Shell once: 10 − 1');
  // Different skills do stack: Long Road + Long Road II.
  s2.pets[1].level = 85;
  assert.equal(streakEggBonusFor(computeEffects(s2), 14), 2);
});

test('shield cap: at most 1 level per pet per Hungry/Starving event; never on underfed or upkeep', () => {
  const s = start();
  const t = pet(s, { species: 'turtle', tier: 4, level: 55, location: 'active', trinkets: [{ id: 'k1', defId: 'mossCloak', usedAt: null }] });
  pet(s, { species: 'axolotl', tier: 3, level: 40, location: 'active' });
  const fx = computeEffects(s);
  assert.equal(petShield(fx, t), 1, 'Shell Up + Shelter + Moss Cloak → 1');
  assert.equal(loseLevels(s, t, 2, 'hungry', { ...ctxOf(s), fx }, { shieldable: true }), 1);
  assert.equal(loseLevels(s, t, 5, 'starving', { ...ctxOf(s), fx }, { shieldable: true }), 4);
  assert.equal(loseLevels(s, t, 1, 'underfed', { ...ctxOf(s), fx }), 1);
  // Backpack pets get no shield (team effects reach active pets only).
  const b = pet(s, { species: 'turtle', tier: 4, level: 55, location: 'backpack' });
  assert.equal(petShield(computeEffects(s), b), 0);
});

test('luck caps: pet-egg chance ≤ +50 % per pet; team hatch luck ≤ +3 pts', () => {
  const s = start();
  const fox = pet(s, { species: 'fox', tier: 6, level: 100, location: 'active', trinkets: [{ id: 'k1', defId: 'starMap', usedAt: null }] });
  pet(s, { species: 'owl', tier: 5, level: 85, location: 'active', trinkets: [{ id: 'k2', defId: 'dragonglassPrism', usedAt: null }] });
  const fx = computeEffects(s);
  assert.equal(petEggChancePct(fx, fox), 50, '10 + 15 + 25');
  assert.equal(petEggChancePct({ self: { [fox.id]: { petEggChancePct: 90 } }, team: {}, global: {}, streakEggBonus: [] }, fox), 50);
  assert.equal(teamHatchLuck(fx), 3, 'Foxfire 1 + Nine-Tailed 1 + Clear Sight 1 + Prism 1 + Star Map 2 → 3');
});

test('foodNeedReduce lowers only the fed threshold (min 70)', () => {
  const s = start();
  const slime = pet(s, { species: 'slime', tier: 4, level: 70, location: 'active' });
  assert.equal(petNeed(computeEffects(s), slime), 70);
  slime.level = 10;
  assert.equal(petNeed(computeEffects(s), slime), 90);
});

test('trinkets: Epic+ only, 5 slots, no duplicates, one luck trinket per pet', () => {
  let s = start();
  const ord = s.pets[0];
  const epic = pet(s, { tier: 3, location: 'active' });
  s.inv.trinkets = ['copperBell', 'copperBell', 'luckyPebble', 'fourfoldClover', 'coinPurse', 'mossCloak', 'stitchedPatch', 'dogEaredBookmark']
    .map((defId, i) => ({ id: `k${i}`, defId, usedAt: null }));
  assert.throws(() => act(s, { type: 'pet/equip', petId: ord.id, trinketId: 'k0' }), { code: 'trinket_tier' });
  s = act(s, { type: 'pet/equip', petId: epic.id, trinketId: 'k0' }).state;
  assert.throws(() => act(s, { type: 'pet/equip', petId: epic.id, trinketId: 'k1' }), { code: 'trinket_duplicate' });
  s = act(s, { type: 'pet/equip', petId: epic.id, trinketId: 'k2' }).state;
  assert.throws(() => act(s, { type: 'pet/equip', petId: epic.id, trinketId: 'k3' }), { code: 'trinket_luck' });
  for (const k of ['k4', 'k5', 'k6']) s = act(s, { type: 'pet/equip', petId: epic.id, trinketId: k }).state;
  assert.throws(() => act(s, { type: 'pet/equip', petId: epic.id, trinketId: 'k7' }), { code: 'trinket_slots' });
  s = act(s, { type: 'pet/unequip', petId: epic.id, trinketId: 'k0' }).state;
  assert.ok(s.inv.trinkets.some((t) => t.id === 'k0'));
  assert.equal(s.pets.find((p) => p.id === epic.id).trinkets.length, 4);
});

test('seats: 3 base + bought + ability seats (own seat, plus SR +1 … Ultra +12), capped at 15; overflow benches the lowest tiers', () => {
  let s = start();
  assert.equal(seatInfo(s).total, 3);
  const sr = pet(s, { tier: 2, location: 'active' });
  pet(s, { tier: 0, location: 'active' });
  assert.deepEqual([seatInfo(s).total, seatInfo(s).used], [5, 3], 'the SR brings its own seat plus 1 extra');
  const leg = pet(s, { tier: 5, location: 'backpack' });
  s = act(s, { type: 'pet/activate', petId: leg.id }).state;
  assert.deepEqual([seatInfo(s).total, seatInfo(s).used], [12, 4]);
  pet(s, { tier: 6, location: 'active' });
  assert.equal(seatInfo(s).total, 15, 'capped');
  s = act(s, { type: 'pet/deactivate', petId: leg.id }).state;
  assert.deepEqual([seatInfo(s).total, seatInfo(s).used], [15, 4]);
  // A small team: SR active, 4 pets in 4 seats; deactivating the SR... instead release it and watch overflow.
  let t = start();
  const sr2 = pet(t, { tier: 2, location: 'active' });
  pet(t, { tier: 0, level: 5, location: 'active' });
  const low = pet(t, { tier: 0, level: 1, location: 'active' });
  assert.equal(seatInfo(t).used, 4);
  const r = act(t, { type: 'pet/release', petId: sr2.id });
  // 3 left in 3 seats: fine. Now take a Beacon away to force overflow.
  assert.equal(seatInfo(r.state).used, 3);
  t = start();
  const ep = pet(t, { tier: 3, location: 'backpack', beacon: true });
  for (let i = 0; i < 4; i += 1) pet(t, { tier: 0, level: 2 + i, location: 'active' });
  assert.deepEqual([seatInfo(t).total, seatInfo(t).used], [5, 5]);
  const r2 = act(t, { type: 'pet/beacon', petId: ep.id, on: false });
  assert.deepEqual([seatInfo(r2.state).total, seatInfo(r2.state).used], [3, 3]);
  const benched = r2.events.filter((e) => e.type === 'pet.benched').map((e) => e.petId);
  assert.equal(benched.length, 2);
  assert.ok(benched.includes(t.pets[0].id), 'the level-1 starter goes first');
  assert.equal(r2.state.inv.beacons, 1);
  assert.ok(low);
  assert.ok(sr);
});

test('Beacons: need one in the inventory and a seat ability', () => {
  let s = start();
  const sr = pet(s, { tier: 2, location: 'backpack' });
  assert.throws(() => act(s, { type: 'pet/beacon', petId: sr.id, on: true }), { code: 'no_beacon' });
  s.inv.beacons = 1;
  assert.throws(() => act(s, { type: 'pet/beacon', petId: s.pets[0].id, on: true }), { code: 'no_seat_ability' });
  s = act(s, { type: 'pet/beacon', petId: sr.id, on: true }).state;
  assert.equal(s.inv.beacons, 0);
  assert.equal(seatInfo(s).total, 4);
});

test('backpack: 12 to start, +1 per 5 Keeper levels, +2 per upgrade; hatching is refused when it is full', () => {
  let s = start();
  assert.equal(E.viewPets(s).backpackCap, 12);
  s.keeper.level = 10;
  assert.equal(E.viewPets(s).backpackCap, 14);
  s.keeper.level = 1;
  pet(s, { location: 'active' });
  pet(s, { location: 'active' });
  for (let i = 0; i < 12; i += 1) pet(s, { location: 'backpack' });
  s.inv.petEggs.push({ id: 'peZ', tier: 0, fed: [0, 0, 0, 0, 0], charm: null, guaranteed: true, source: 'test' });
  assert.throws(() => act(s, { type: 'petEgg/hatch', petEggId: 'peZ' }), { code: 'backpack_full' });
  s.inv.coins = 1000;
  s = act(s, { type: 'shop/buy', itemId: 'backpack' }).state;
  assert.equal(E.viewPets(s).backpackCap, 14);
  s = act(s, { type: 'petEgg/hatch', petEggId: 'peZ' }).state;
  assert.equal(s.pets.length, 16);
  assert.equal(s.pets.at(-1).location, 'backpack', 'seats full: the Ordinary goes to the backpack (13/14)');
});

test('seat-ability pets bring their own seat: activate, buy and hatch never need a free one; deactivate may overflow the backpack', () => {
  // The reviewer's stuck roster: 3/3 seats, 12/12 backpack with an Epic in it.
  let s = start();
  pet(s, { location: 'active' });
  pet(s, { location: 'active' });
  const epic = pet(s, { tier: 3, location: 'backpack' });
  for (let i = 0; i < 11; i += 1) pet(s, { location: 'backpack' });
  assert.deepEqual([seatInfo(s).total, seatInfo(s).used, E.viewPets(s).backpack.length], [3, 3, 12]);
  // Moving an active pet out is never refused for a full backpack (it overflows, nothing is lost).
  const out = act(s, { type: 'pet/deactivate', petId: s.pets[0].id }).state;
  assert.equal(E.viewPets(out).backpack.length, 13);
  // The Epic takes a seat: it brings its own plus 2.
  s = act(s, { type: 'pet/activate', petId: epic.id }).state;
  assert.deepEqual([seatInfo(s).total, seatInfo(s).used], [6, 4]);
  // An Ordinary still needs a free seat (there are 2 now); fill them, then it is refused.
  const bp = s.pets.filter((p) => p.location === 'backpack' && p.tier === 0);
  s = act(s, { type: 'pet/activate', petId: bp[0].id }).state;
  s = act(s, { type: 'pet/activate', petId: bp[1].id }).state;
  assert.throws(() => act(s, { type: 'pet/activate', petId: bp[2].id }), { code: 'no_seat' });
  // A Beaconed backpack SR already counts its +1; activating adds only its own seat.
  const sr = pet(s, { tier: 2, location: 'backpack', beacon: true });
  assert.deepEqual([seatInfo(s).total, seatInfo(s).used], [7, 6]);
  s = act(s, { type: 'pet/activate', petId: sr.id }).state;
  assert.deepEqual([seatInfo(s).total, seatInfo(s).used], [8, 7]);
  // Shop: seats and backpack full, but a guaranteed Epic brings its own seat → it can be bought and sits down.
  s = act(s, { type: 'pet/activate', petId: bp[2].id }).state; // 8/8
  while (E.viewPets(s).backpack.length < 12) pet(s, { location: 'backpack' });
  s.inv.diamonds = 1000;
  const item = E.viewShop(s, at(D, 9)).tabs.find((t) => t.id === 'pets').items.find((i) => i.id === 'pet:3');
  assert.equal(item.canBuy, true);
  let r = act(s, { type: 'shop/buy', itemId: 'pet:3' });
  assert.equal(r.state.pets.at(-1).location, 'active');
  // Hatching: an Ordinary egg is refused, a Super Rare egg (never hatches lower) sits down.
  s.inv.petEggs.push({ id: 'peO', tier: 0, fed: [0, 0, 0, 0, 0], charm: null, guaranteed: true, source: 'test' });
  s.inv.petEggs.push({ id: 'peS', tier: 2, fed: new Array(8).fill(2), charm: null, guaranteed: true, source: 'test' });
  assert.throws(() => act(s, { type: 'petEgg/hatch', petEggId: 'peO' }), { code: 'backpack_full' });
  r = act(s, { type: 'petEgg/hatch', petEggId: 'peS' });
  const hatched = r.events.find((e) => e.type === 'petEgg.hatched').pet;
  assert.equal(hatched.location, 'active');
  // The 15-pet cap still holds: a Mythic can't sit down when 15 are active.
  let c = start();
  pet(c, { tier: 6, location: 'active' });
  for (let i = 0; i < 13; i += 1) pet(c, { location: 'active' });
  const myth = pet(c, { tier: 4, location: 'backpack' });
  assert.deepEqual([seatInfo(c).total, seatInfo(c).used], [15, 15]);
  assert.throws(() => act(c, { type: 'pet/activate', petId: myth.id }), { code: 'no_seat' });
});

test('moods follow processed closes only (CONTENT.md A.1)', () => {
  let s = start();
  const p = s.pets[0];
  assert.equal(E.viewPets(s).active[0].mood, 'healthy', 'unspent food during the day never causes distress');
  for (const t of s.list.tasks) s = act(s, { type: 'task/tick', taskId: t.id }).state;
  s = act(s, { type: 'pet/feed', petId: p.id, amount: 100 }).state;
  assert.equal(E.viewPets(s).active[0].mood, 'happy');
  s = E.advance(s, at(D, 23)).state;
  assert.equal(E.viewPets(s).active[0].mood, 'happy', 'hearts all evening');
  // Day 2 missed → hungry (and lost levels).
  s = E.advance(s, at('2026-11-04', 6)).state;
  assert.equal(E.viewPets(s).active[0].mood, 'hungry');
  assert.equal(E.viewHeader(s, at('2026-11-04', 6)).hunger, 'hungry');
  // Fed ≥ 100 on a later day clears it.
  for (const t of s.list.tasks) s = act(s, { type: 'task/tick', taskId: t.id }, at('2026-11-04', 9)).state;
  s = act(s, { type: 'pet/feed', petId: p.id, amount: 100 }, at('2026-11-04', 9)).state;
  assert.equal(E.viewPets(s).active[0].mood, 'happy');
  assert.equal(s.pets[0].hungrySince, null);
  // Two misses → starving.
  s = E.advance(s, at('2026-11-07', 6)).state;
  assert.equal(E.viewPets(s).active[0].mood, 'starving');
  assert.equal(E.viewHeader(s, at('2026-11-07', 6)).hunger, 'starving');
});

test('names: an unused name from the species pool, then "Ember II"', () => {
  const s = start();
  const rng = streamRng({ seed: seedFrom(1), n: 0 });
  const pool = E.SPECIES.find((x) => x.id === 'dragon').namePool;
  const names = new Set();
  for (let i = 0; i < pool.length; i += 1) {
    const n = pickName(s, 'dragon', rng);
    assert.ok(pool.includes(n));
    assert.ok(!names.has(n));
    names.add(n);
    pet(s, { species: 'dragon', name: n });
  }
  assert.match(pickName(s, 'dragon', rng), / II$/);
  let r = act(s, { type: 'pet/rename', petId: s.pets[0].id, name: '  Sir   Wobble ' });
  assert.equal(r.state.pets[0].name, 'Sir Wobble');
  assert.throws(() => act(s, { type: 'pet/rename', petId: s.pets[0].id, name: 'A name that is too long' }), { code: 'bad_name' });
});
