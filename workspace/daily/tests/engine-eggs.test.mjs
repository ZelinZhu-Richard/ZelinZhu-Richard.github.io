// Engine: openable eggs and pet eggs. Seeded Monte Carlo checks of every odds table, sized to stay fast
// (the ≥ 100k-roll version lives in sim/balance.mjs), plus the exact hatch-odds math and the charm rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine/index.js';
import { openEgg, hatchPetEgg, combinePetEggs } from '../engine/eggs.js';
import { mergePets, combinePets } from '../engine/collection.js';
import { hatchOdds, itemCountDistribution } from '../engine/eggs-math.js';
import { streamRng, seedFrom } from '../engine/rng.js';

const T = E.time;
const at = (key, hh, mm = 0) => T.nyInstant(key, hh * 60 + mm);
const D = '2026-11-02';
const act = (s, a, now = at(D, 9)) => E.applyAction(s, a, now);
const rngOf = (n) => streamRng({ seed: seedFrom(n), n: 0 });
const near = (actual, expected, tol, label) => assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual.toFixed(4)} vs ${expected} ± ${tol}`);

function start() {
  let s = E.newGame({ seed: 33, now: at(D, 8), tasks: E.DEFAULT_TASKS });
  s = act(s, { type: 'petEgg/hatch', petEggId: s.inv.petEggs[0].id }, at(D, 8, 1)).state;
  return s;
}

/** Open n eggs of a tier/source on a scratch state and return the item lists. */
function openMany(n, tier, source, { seed = 1, petEggPct = 0, extraItems = 0 } = {}) {
  const s = start();
  const rng = rngOf(seed);
  const out = [];
  const ctx = { events: [], counters: {}, dayKey: D, fx: null };
  for (let i = 0; i < n; i += 1) {
    s.inv.openEggs = [{ id: 'oe', tier, source, petId: null, extraItems, petEggPct, laidOn: null }];
    out.push(openEgg(s, 'oe', rng, ctx).items);
    s.inv.treats = [];
    s.inv.trinkets = [];
    s.inv.petEggs = [];
  }
  return out;
}

test('item count: 3 + Bin(9, .28): mean ≈ 5.5, range 3–12; the exact distribution sums to 1', () => {
  const dist = itemCountDistribution();
  near(dist.reduce((a, d) => a + d.p, 0), 1, 1e-9, 'sum');
  near(dist.reduce((a, d) => a + d.items * d.p, 0), 5.52, 1e-9, 'exact mean');
  const eggs = openMany(12000, 1, 'streak');
  const counts = eggs.map((items) => items.length);
  near(counts.reduce((a, b) => a + b, 0) / counts.length, 5.52 - 0.05, 0.05, 'MC mean (a pet egg takes a slot)');
  assert.ok(Math.min(...counts) >= 2 && Math.max(...counts) <= 12);
  // Without a pet egg in the egg, every count is 3–12.
  const noPet = eggs.filter((items) => !items.some((i) => i.kind === 'petEgg')).map((i) => i.length);
  assert.ok(Math.min(...noPet) >= 3 && Math.max(...noPet) <= 12);
  // Each count's frequency matches the binomial.
  for (const d of dist.slice(0, 7)) near(noPet.filter((c) => c === d.items).length / noPet.length, d.p, 0.012, `P(${d.items})`);
  // The laying pet's bonus items are added on top.
  assert.ok(openMany(200, 0, 'laid', { extraItems: 5 }).every((items) => items.length >= 7));
});

test('pet-egg chance by source (rolled once per egg)', () => {
  const laid = E.CONFIG.eggs.petEggChance.laid;
  const other = E.CONFIG.eggs.petEggChance.other;
  assert.deepEqual(laid, [0.35, 0.25, 0.12, 0.05, 0.035, 0.03, 0.03]);
  assert.deepEqual(other, [0.10, 0.05, 0.02, 0.01, 0.01, 0.01, 0.01]);
  for (const [tier, source, p, n] of [[0, 'laid', 0.35, 8000], [0, 'streak', 0.10, 8000], [1, 'laid', 0.25, 6000], [1, 'chest', 0.05, 6000], [3, 'laid', 0.05, 6000]]) {
    const eggs = openMany(n, tier, source, { seed: tier * 10 + n });
    const withPet = eggs.filter((items) => items.filter((i) => i.kind === 'petEgg').length === 1).length;
    assert.ok(eggs.every((items) => items.filter((i) => i.kind === 'petEgg').length <= 1), 'never more than one');
    near(withPet / n, p, 4 * Math.sqrt((p * (1 - p)) / n), `tier ${tier} ${source}`);
  }
  // Luck is relative and comes from the egg's snapshot.
  const lucky = openMany(6000, 0, 'laid', { petEggPct: 50, seed: 77 });
  near(lucky.filter((items) => items.some((i) => i.kind === 'petEgg')).length / 6000, 0.525, 0.03, 'tier 0 laid +50 %');
});

test('pet-egg tier splits: laid by a pet vs streak/chest/season (never +2)', () => {
  const split = (tier, source, n, seed) => {
    const eggs = openMany(n, tier, source, { petEggPct: 10000, seed });
    const tiers = eggs.map((items) => items.find((i) => i.kind === 'petEgg').tier - tier);
    return [0, 1, 2].map((k) => tiers.filter((t) => t === k).length / n);
  };
  const lo = split(0, 'laid', 8000, 5);
  near(lo[0], 0.825, 0.02, 'Ordinary same'); near(lo[1], 0.125, 0.016, 'Ordinary +1'); near(lo[2], 0.05, 0.01, 'Ordinary +2');
  const sr = split(2, 'laid', 6000, 6);
  near(sr[0], 0.88, 0.02, 'SR same'); near(sr[2], 0.02, 0.008, 'SR +2');
  const leg = split(5, 'laid', 4000, 7);
  near(leg[1], 0.25, 0.03, 'Legendary +1 (Ultra)'); assert.equal(leg[2], 0);
  const my = split(4, 'laid', 6000, 8);
  near(my[2], 0.01, 0.006, 'Mythic +2 → Ultra');
  const st = split(1, 'streak', 6000, 9);
  near(st[0], 0.9, 0.02, 'streak same'); near(st[1], 0.1, 0.02, 'streak +1'); assert.equal(st[2], 0);
  const ultra = split(6, 'laid', 500, 10);
  assert.equal(ultra[0], 1, 'Ultra stays Ultra');
});

test('loot weights: coins 40 · egg food 35 · XP treat 12 · diamonds 8 · charm 3 · trinket 2 (Epic+ only, else coins)', () => {
  const freq = (eggs) => {
    const items = eggs.flat().filter((i) => i.kind !== 'petEgg' && !i.ultra);
    const f = {};
    for (const i of items) f[i.kind] = (f[i.kind] || 0) + 1;
    for (const k of Object.keys(f)) f[k] /= items.length;
    return f;
  };
  const epic = freq(openMany(5000, 3, 'streak', { seed: 12 }));
  near(epic.coins, 0.40, 0.012, 'coins'); near(epic.eggFood, 0.35, 0.012, 'egg food'); near(epic.xpTreat, 0.12, 0.008, 'treat');
  near(epic.diamonds, 0.08, 0.007, 'diamonds'); near(epic.charm, 0.03, 0.005, 'charm'); near(epic.trinket, 0.02, 0.004, 'trinket');
  const ord = freq(openMany(4000, 0, 'streak', { seed: 13 }));
  assert.equal(ord.charm, undefined);
  assert.equal(ord.trinket, undefined);
  near(ord.coins, 0.45, 0.015, 'coins absorb charm + trinket below Epic');
  // Amounts.
  const items = openMany(3000, 2, 'streak', { seed: 14 }).flat();
  const coins = items.filter((i) => i.kind === 'coins').map((i) => i.amount);
  assert.ok(Math.min(...coins) >= 17 && Math.max(...coins) <= 53, 'SR coins 35 × 0.5–1.5');
  assert.ok(items.filter((i) => i.kind === 'diamonds').every((i) => i.amount === 2));
  const food = items.filter((i) => i.kind === 'eggFood');
  assert.ok(food.every((i) => i.amount >= 1 && i.amount <= 3));
  near(food.filter((i) => i.tier === 2).length / food.length, 0.70, 0.04, 'food same tier');
  near(food.filter((i) => i.tier === 1).length / food.length, 0.25, 0.04, 'food one lower');
  near(food.filter((i) => i.tier === 3).length / food.length, 0.05, 0.02, 'food one higher');
  assert.ok(items.filter((i) => i.kind === 'xpTreat').every((i) => i.amount === 300));
  const trinkets = openMany(4000, 4, 'streak', { seed: 15 }).flat().filter((i) => i.kind === 'trinket');
  assert.ok(trinkets.length > 0 && trinkets.every((i) => i.tier >= 3 && i.tier <= 4), 'regular trinkets ≤ egg tier');
});

test('Ultra eggs: 10 % chance of an Ultra trinket (one roll; not from extra items)', () => {
  const eggs = openMany(3000, 6, 'streak', { seed: 16, extraItems: 6 });
  const ultra = eggs.filter((items) => items.some((i) => i.ultra)).length / eggs.length;
  near(ultra, 0.10, 0.02, 'Ultra trinket');
  assert.ok(eggs.every((items) => items.filter((i) => i.ultra).length <= 1));
  assert.ok(openMany(2000, 5, 'streak', { seed: 17 }).every((items) => !items.some((i) => i.ultra)));
});

test('hatch odds: base 95/5; food bonuses per serving; 50 % floor; fold above Ultra; hatch luck', () => {
  const round = (a) => a.map((p) => Math.round(p * 1e6) / 1e6);
  assert.deepEqual(round(hatchOdds(0, [0, 0, 0, 0, 0])), [0.95, 0.05, 0, 0, 0, 0, 0]);
  assert.deepEqual(round(hatchOdds(0, [1])), [0.94, 0.06, 0, 0, 0, 0, 0]);
  assert.deepEqual(round(hatchOdds(0, [2])), [0.935, 0.06, 0.005, 0, 0, 0, 0]);
  assert.deepEqual(round(hatchOdds(0, [3])), [0.9325, 0.06, 0.005, 0.0025, 0, 0, 0]);
  // Top of the ladder: Ultra food on a Legendary egg adds 1 % to Ultra; a charmed Ultra result stays Ultra.
  assert.deepEqual(round(hatchOdds(5, [6])), [0, 0, 0, 0, 0, 0.94, 0.06]);
  assert.deepEqual(round(hatchOdds(5, [], { charm: 'tier' })), [0, 0, 0, 0, 0, 0.76, 0.24]);
  // Ultra food on a Mythic egg: +1 % Legendary, +0.5 % Ultra.
  assert.deepEqual(round(hatchOdds(4, [6])), [0, 0, 0, 0, 0.935, 0.06, 0.005]);
  // Floor: own tier never below 50 %.
  const max = hatchOdds(0, new Array(60).fill(6));
  near(max[0], 0.5, 1e-12, 'floor');
  near(max.reduce((a, b) => a + b, 0), 1, 1e-12, 'sums to 1');
  assert.ok(max[1] > max[2] && max[2] > max[3]);
  // Same-tier or lower food just fills.
  assert.deepEqual(round(hatchOdds(2, [0, 1, 2])), round(hatchOdds(2, [])));
  // Team hatch luck adds points to the next tier.
  assert.deepEqual(round(hatchOdds(3, [], { luckPts: 3 })), [0, 0, 0, 0.92, 0.08, 0, 0]);
  assert.deepEqual(round(hatchOdds(6, [6, 6])), [0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(round(hatchOdds(0, [3, 3], { guaranteed: true })), [1, 0, 0, 0, 0, 0, 0]);
});

test('hatching: Monte Carlo matches the live odds, with and without a charm', () => {
  const s = start();
  const rng = rngOf(40);
  const ctx = { events: [], counters: {}, dayKey: D, fx: null, now: at(D, 9) };
  const run = (charm, food, n) => {
    const tiers = [];
    for (let i = 0; i < n; i += 1) {
      s.pets = [];
      s.inv.petEggs = [{ id: 'pe', tier: 0, fed: food.slice(), charm, guaranteed: false, source: 'test' }];
      tiers.push(hatchPetEgg(s, 'pe', rng, ctx).tier);
    }
    return tiers;
  };
  const food = [3, 3, 3, 3, 3]; // 5 Epic servings: +5 % Rare, +2.5 % SR, +1.25 % Epic
  const exp = hatchOdds(0, food);
  const plain = run(null, food, 6000);
  for (const t of [0, 1, 2]) near(plain.filter((x) => x === t).length / 6000, exp[t], 0.015, `tier ${t}`);
  const charmed = run('tier', new Array(8).fill(0), 6000);
  const expC = hatchOdds(0, [], { charm: 'tier' });
  near(expC[1], 0.95 * 0.2 + 0.05 * 0.8, 1e-12, 'charm odds');
  near(charmed.filter((x) => x === 1).length / 6000, expC[1], 0.016, 'charmed Rare');
  near(charmed.filter((x) => x === 2).length / 6000, expC[2], 0.008, 'charmed SR');
});

test('pet eggs: servings by tier, one serving at a time, no taking back; separate yields', () => {
  let s = start();
  assert.deepEqual(E.CONFIG.hatch.servings, [5, 6, 8, 10, 12, 15, 20]);
  s.inv.petEggs = [{ id: 'pe1', tier: 1, fed: [], charm: null, guaranteed: false, source: 'test' }];
  s.inv.eggFood = [10, 0, 2, 0, 0, 0, 0];
  assert.throws(() => act(s, { type: 'petEgg/hatch', petEggId: 'pe1' }), { code: 'needs_food' });
  assert.throws(() => act(s, { type: 'petEgg/feed', petEggId: 'pe1', foodTier: 1 }), { code: 'no_food' });
  let r = act(s, { type: 'petEgg/feed', petEggId: 'pe1', foodTier: 2 });
  const fed = r.events.find((e) => e.type === 'petEgg.fed');
  assert.deepEqual([fed.servings, fed.need], [1, 6]);
  near(fed.odds[2], 0.06, 1e-12, 'live odds after an SR serving: 5 % base + 1 %');
  s = r.state;
  for (let i = 0; i < 5; i += 1) s = act(s, { type: 'petEgg/feed', petEggId: 'pe1', foodTier: 'ordinary' }).state;
  assert.throws(() => act(s, { type: 'petEgg/feed', petEggId: 'pe1', foodTier: 0 }), { code: 'egg_full' });
  r = act(s, { type: 'petEgg/hatch', petEggId: 'pe1' });
  assert.ok(r.events.some((e) => e.type === 'petEgg.hatched'));
  const hatched = r.state.pets[r.state.pets.length - 1];
  assert.deepEqual([hatched.level, hatched.stars], [1, 1]);
  assert.ok(r.state.unlockedSpecies.includes(hatched.species));
  // Separate.
  s = start();
  s.inv.petEggs = [{ id: 'pe2', tier: 4, fed: [4, 4], charm: null, guaranteed: false, source: 'test' }];
  r = act(s, { type: 'petEgg/separate', petEggId: 'pe2' });
  assert.equal(r.state.inv.eggFood[4], 8);
  assert.deepEqual(E.CONFIG.hatch.separate, [3, 4, 5, 6, 8, 10, 12]);
});

test('charms: one per egg, +50 % servings; tier charms fit any egg below Ultra, Sprout charms Ordinary–Super Rare', () => {
  let s = start();
  s.inv.petEggs = [
    { id: 'a', tier: 0, fed: [], charm: null, guaranteed: false, source: 'test' },
    { id: 'b', tier: 3, fed: [], charm: null, guaranteed: false, source: 'test' },
    { id: 'c', tier: 6, fed: [], charm: null, guaranteed: false, source: 'test' },
  ];
  assert.throws(() => act(s, { type: 'petEgg/charm', petEggId: 'a', charm: 'tier' }), { code: 'no_charm' });
  s.inv.charms = { tier: 3, sprout: 2 };
  assert.throws(() => act(s, { type: 'petEgg/charm', petEggId: 'b', charm: 'sprout' }), { code: 'sprout_tier' });
  assert.throws(() => act(s, { type: 'petEgg/charm', petEggId: 'c', charm: 'tier' }), { code: 'charm_useless' });
  let r = act(s, { type: 'petEgg/charm', petEggId: 'a', charm: 'sprout' });
  assert.equal(r.events[0].need, 8, '5 × 1.5 rounded up');
  assert.throws(() => act(r.state, { type: 'petEgg/charm', petEggId: 'a', charm: 'tier' }), { code: 'charm_used' });
  r = act(r.state, { type: 'petEgg/charm', petEggId: 'b', charm: 'tier' });
  assert.equal(r.events[0].need, 15);
  assert.equal(E.viewEggs(r.state).petEggs.find((e) => e.id === 'b').odds[4] > 0.05, true);
});

test('merge: +1★ guaranteed, 5 % mutation (+1 tier, keeps stars), keeps the higher level; trinkets return', () => {
  const s = start();
  const rng = rngOf(50);
  const ctx = { events: [], counters: {}, dayKey: D };
  const base = structuredClone(s.pets[0]);
  let mutated = 0;
  const N = 20000;
  for (let i = 0; i < N; i += 1) {
    s.pets = [{ ...base, id: 'a', tier: 3, stars: 2, level: 12 }, { ...base, id: 'b', tier: 3, stars: 2, level: 30, trinkets: [{ id: 'k', defId: 'coinPurse', usedAt: null }] }];
    s.inv.trinkets = [];
    s.petdex = {};
    const keep = mergePets(s, 'a', 'b', rng, ctx);
    if (i === 0) {
      assert.equal(keep.id, 'b', 'the higher-level pet survives');
      assert.equal(keep.stars, 3);
      assert.equal(keep.level, 30);
    }
    if (keep.tier === 4) mutated += 1;
    assert.equal(keep.stars, 3);
  }
  near(mutated / N, 0.05, 0.006, 'mutation');
  // Rules.
  let t = start();
  t.pets.push({ ...base, id: 'c', species: base.species === 'fox' ? 'owl' : 'fox' });
  assert.throws(() => act(t, { type: 'pet/merge', aId: t.pets[0].id, bId: 'c' }), { code: 'merge_mismatch' });
  t = start();
  t.pets.push({ ...structuredClone(t.pets[0]), id: 'd', stars: 4, trinkets: [], location: 'backpack' });
  t.pets[0].stars = 4;
  const r = act(t, { type: 'pet/merge', aId: t.pets[0].id, bId: 'd' });
  const five = r.state.pets.find((p) => p.stars === 5);
  assert.equal(five.nineLives, 'charged', 'reaching 5★ grants the one Nine Lives charge');
  t.pets[0].stars = 5;
  t.pets[1].stars = 5;
  assert.throws(() => act(t, { type: 'pet/merge', aId: t.pets[0].id, bId: 'd' }), { code: 'max_stars' });
});

test('combine: success rates by tier; a success is a next-tier pet (level 1, 1★); failure destroys both', () => {
  assert.deepEqual(E.CONFIG.merge.combine, [0.2, 0.1, 0.05, 0.025, 0.0125, 0.00625]);
  const s = start();
  const rng = rngOf(60);
  const ctx = { events: [], counters: {}, dayKey: D };
  const base = structuredClone(s.pets[0]);
  for (const [tier, p, n] of [[0, 0.2, 8000], [1, 0.1, 8000], [2, 0.05, 8000]]) {
    let ok = 0;
    for (let i = 0; i < n; i += 1) {
      s.pets = [{ ...base, id: 'a', species: 'fox', tier, level: 9 }, { ...base, id: 'b', species: 'owl', tier, level: 3 }];
      s.petdex = {};
      const r = combinePets(s, 'a', 'b', rng, ctx);
      if (r.success) {
        ok += 1;
        const np = s.pets[0];
        assert.equal(np.tier, tier + 1);
        assert.deepEqual([np.level, np.stars], [1, 1]);
        assert.ok(['fox', 'owl'].includes(np.species));
      } else {
        assert.equal(s.pets.length, 0);
      }
    }
    near(ok / n, p, 4 * Math.sqrt((p * (1 - p)) / n), `combine tier ${tier}`);
  }
  // Pet eggs combine at the same rates.
  let ok = 0;
  for (let i = 0; i < 6000; i += 1) {
    s.inv.petEggs = [{ id: 'x', tier: 0, fed: [], charm: null, source: 't' }, { id: 'y', tier: 0, fed: [], charm: null, source: 't' }];
    if (combinePetEggs(s, 'x', 'y', rng, ctx).success) ok += 1;
  }
  near(ok / 6000, 0.2, 0.025, 'egg combine');
  // Rules.
  const t = start();
  t.pets.push({ ...base, id: 'u1', species: 'fox', tier: 6 }, { ...base, id: 'u2', species: 'owl', tier: 6 });
  assert.throws(() => act(t, { type: 'pet/combine', aId: 'u1', bId: 'u2' }), { code: 'ultra_combine' });
  t.pets.push({ ...base, id: 'o1', species: base.species, tier: 0 });
  assert.throws(() => act(t, { type: 'pet/combine', aId: t.pets[0].id, bId: 'o1' }), { code: 'same_species' });
});

test('release gives 2 × the separate yield in egg food of its tier, and returns trinkets', () => {
  let s = start();
  s.pets.push({ ...structuredClone(s.pets[0]), id: 'r1', tier: 3, location: 'backpack', trinkets: [{ id: 'k', defId: 'coinPurse', usedAt: null }] });
  const r = act(s, { type: 'pet/release', petId: 'r1' });
  assert.equal(r.state.inv.eggFood[3], 12);
  assert.ok(r.state.inv.trinkets.some((t) => t.id === 'k'));
});

test('opening counts eggs, and an opened egg is gone', () => {
  let s = start();
  s.inv.openEggs = [{ id: 'o1', tier: 0, source: 'streak', petId: null, extraItems: 0, petEggPct: 0, laidOn: null }];
  const r = act(s, { type: 'egg/open', eggId: 'o1' });
  const ev = r.events.find((e) => e.type === 'egg.opened');
  assert.ok(ev.items.length >= 2);
  if (ev.items.some((i) => i.kind === 'petEgg')) assert.equal(ev.items[ev.items.length - 1].kind, 'petEgg', 'the pet egg comes out last');
  assert.equal(r.state.inv.openEggs.length, 0);
  assert.equal(r.state.day.counters.eggsOpened, 1);
  assert.throws(() => act(r.state, { type: 'egg/open', eggId: 'o1' }), { code: 'no_egg' });
});
