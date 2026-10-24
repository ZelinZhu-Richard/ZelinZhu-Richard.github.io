#!/usr/bin/env node
// Daily odds check: ≥ 100k seeded rolls per odds table through the REAL engine code paths, observed vs the spec
// (PLAN.md §7–9, CONTENT.md H.2), with tolerance bands. Hand-run only (never in npm test, never copied to dist/).
//
//   node workspace/daily/sim/montecarlo.mjs [--rolls N] [--seed S] [--z Z] [--only name,name]
//
// Expected values are written out here from the spec, independently of engine/config.js, so this also catches a
// config table that drifted from the spec. If a number is changed on purpose, change SPEC below in the same commit.
// Each proportion passes when |observed − expected| ≤ Z·σ (σ = √(p(1−p)/n), default Z = 4.5, so ~200 cells give a
// false alarm well under 1 % of the time); probabilities of exactly 0 or 1 must be exact. Exit code 1 on any miss.
//
// The rolls call the engine's own mutating rule functions (openEgg, hatchPetEgg, charmPetEgg, mergePets,
// combinePets, combinePetEggs) on a scratch state with the engine's counter PRNG, so 100k rolls take seconds
// instead of the minutes 100k applyAction() calls (each clones the whole save) would.

import * as E from '../engine/index.js';
import { charmPetEgg, combinePetEggs, hatchPetEgg, openEgg } from '../engine/eggs.js';
import { combinePets, mergePets } from '../engine/collection.js';
import { createPet } from '../engine/pets.js';
import { addOpenEgg, addPetEgg } from '../engine/state.js';
import { computeEffects } from '../engine/effects.js';
import { hatchNeed } from '../engine/eggs-math.js';

// ---- the spec ------------------------------------------------------------------------------------------------

const SPEC = {
  petEggChance: { laid: [0.35, 0.25, 0.12, 0.05, 0.035, 0.03, 0.03], other: [0.10, 0.05, 0.02, 0.01, 0.01, 0.01, 0.01] },
  laidSplit: [[0.825, 0.125, 0.05], [0.825, 0.125, 0.05], [0.88, 0.10, 0.02], [0.92, 0.07, 0.01], [0.94, 0.05, 0.01], [0.75, 0.25, 0], [1, 0, 0]],
  otherSplit: [0.9, 0.1, 0],
  itemBase: 3, itemTrials: 9, itemP: 0.28,
  loot: { coins: 40, eggFood: 35, xpTreat: 12, diamonds: 8, charm: 3, trinket: 2 }, // charm/trinket → coins below Epic
  lootCoins: [10, 20, 35, 60, 100, 160, 250],
  lootDiamonds: [1, 1, 2, 3, 5, 8, 12],
  foodSplit: [0.70, 0.25, 0.05],
  ultraTrinket: 0.10,
  servings: [5, 6, 8, 10, 12, 15, 20],
  baseUp: 0.05, foodBonus: 0.01, ownFloor: 0.5,
  charm: 0.2, charmServings: 1.5,
  mutation: 0.05,
  combine: [0.2, 0.1, 0.05, 0.025, 0.0125, 0.00625],
};
const TIERS = ['Ordinary', 'Rare', 'Super Rare', 'Epic', 'Mythic', 'Legendary', 'Ultra'];
const ULTRA = 6;
const OTHER_SOURCES = ['streak', 'chest', 'season', 'welcome'];

/** Spec hatch odds, written from PLAN.md §8 without the engine: [7 probabilities]. */
function specHatch(eggTier, foods, charm = false) {
  let p = new Array(7).fill(0);
  if (eggTier >= ULTRA) p[ULTRA] = 1;
  else {
    p[eggTier] = 1 - SPEC.baseUp;
    p[eggTier + 1] = SPEC.baseUp;
    const bonus = new Array(7).fill(0);
    for (const f of foods) for (let j = 1; j <= f - eggTier; j += 1) bonus[Math.min(ULTRA, eggTier + j)] += SPEC.foodBonus / 2 ** (j - 1);
    const total = bonus.reduce((a, b) => a + b, 0);
    const room = p[eggTier] - SPEC.ownFloor;
    const scale = total > room ? room / total : 1;
    for (let t = 0; t < 7; t += 1) if (t !== eggTier) p[t] += bonus[t] * scale;
    p[eggTier] -= total * scale;
  }
  if (charm && eggTier < ULTRA) {
    const q = new Array(7).fill(0);
    for (let t = 0; t < 7; t += 1) {
      q[t] += p[t] * (1 - SPEC.charm);
      q[Math.min(ULTRA, t + 1)] += p[t] * SPEC.charm;
    }
    p = q;
  }
  return p;
}

function binomPmf(n, p) {
  const out = [];
  let c = 1;
  for (let k = 0; k <= n; k += 1) {
    if (k > 0) c = (c * (n - k + 1)) / k;
    out.push(c * p ** k * (1 - p) ** (n - k));
  }
  return out;
}

// ---- options -------------------------------------------------------------------------------------------------

const opts = { rolls: 100_000, seed: 20261025, z: 4.5, only: null };
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a === '--rolls') opts.rolls = Number(process.argv[++i]);
  else if (a === '--seed') opts.seed = Number(process.argv[++i]);
  else if (a === '--z') opts.z = Number(process.argv[++i]);
  else if (a === '--only') opts.only = process.argv[++i].split(',');
  else throw new Error(`Unknown option ${a} (use --rolls N, --seed S, --z Z, --only names)`);
}
const N = opts.rolls;

// ---- harness -------------------------------------------------------------------------------------------------

const results = [];
let failures = 0;
let section = '';

/** Check a proportion: k hits of n against expected p. */
function prop(name, k, n, p) {
  const obs = k / n;
  const sigma = Math.sqrt((p * (1 - p)) / n);
  const ok = p === 0 || p === 1 ? k === p * n : Math.abs(obs - p) <= opts.z * sigma;
  const z = sigma > 0 ? (obs - p) / sigma : obs === p ? 0 : Infinity;
  record(name, n, obs, p, ok, z, sigma);
}

/** Check a mean against expected mu with known sd. */
function meanCheck(name, total, n, mu, sd) {
  const obs = total / n;
  const sigma = sd / Math.sqrt(n);
  const ok = Math.abs(obs - mu) <= opts.z * sigma;
  record(name, n, obs, mu, ok, (obs - mu) / sigma, sigma, true);
}

/** An exact rule (no randomness). */
function exact(name, ok, detail = '') {
  record(name, 1, ok ? 1 : 0, 1, ok, 0, 0, false, detail);
}

function record(name, n, obs, exp, ok, z, sigma, isMean = false, detail = '') {
  if (!ok) failures += 1;
  results.push({ section, name, n, obs, exp, ok, z, sigma, isMean, detail });
}

const fmtP = (x) => `${(x * 100).toFixed(3)}%`;

function want(name) {
  return !opts.only || opts.only.includes(name);
}

let streamId = 0;
const rngFor = () => {
  streamId += 1;
  return E.streamRng({ seed: E.seedFrom([opts.seed >>> 0, streamId, 0x0dd5, 7]), n: 0 });
};

const NOW = E.time.nyInstant('2026-11-02', 12 * 60);
function scratchState() {
  const s = E.newGame({ seed: [1, 2, 3, 4], now: NOW });
  s.inv.petEggs = [];
  return s;
}
const ctxOf = (s) => ({ events: null, fx: computeEffects(s), dayKey: '2026-11-02', now: NOW, counters: null });

// ---- 1–3: openable eggs (pet-egg chance by source, tier splits, item count, loot weights) ------------------

/** Open n eggs of a tier/source and tally everything an odds table needs. */
function openMany(tier, source, n, rng, extraItems = 0) {
  const s = scratchState();
  const ctx = ctxOf(s);
  const t = {
    n, pet: 0, split: [0, 0, 0], items: new Array(30).fill(0), itemTotal: 0, itemMin: 99, itemMax: 0,
    kinds: { coins: 0, eggFood: 0, xpTreat: 0, diamonds: 0, charm: 0, trinket: 0 }, loot: 0,
    foodTier: [0, 0, 0], foodAmt: [0, 0, 0, 0], coinMin: Infinity, coinMax: 0, coinSum: 0, coinN: 0, ultraTrinket: 0,
    diamondsBad: 0,
  };
  for (let i = 0; i < n; i += 1) {
    const egg = addOpenEgg(s, { tier, source, extraItems });
    const ev = openEgg(s, egg.id, rng, ctx);
    const items = ev.items;
    const count = items.length;
    t.items[count] += 1;
    t.itemTotal += count;
    t.itemMin = Math.min(t.itemMin, count);
    t.itemMax = Math.max(t.itemMax, count);
    for (const it of items) {
      if (it.kind === 'petEgg') {
        t.pet += 1;
        t.split[it.tier - tier === 0 ? 0 : Math.min(2, it.tier - tier)] += 1;
        continue;
      }
      if (it.kind === 'trinket' && it.ultra) { t.ultraTrinket += 1; continue; }
      t.loot += 1;
      t.kinds[it.kind] += 1;
      if (it.kind === 'eggFood') {
        t.foodAmt[it.amount] += 1;
        const d = it.tier - tier;
        t.foodTier[d === 0 ? 0 : d < 0 ? 1 : 2] += 1;
      } else if (it.kind === 'coins') {
        t.coinMin = Math.min(t.coinMin, it.amount);
        t.coinMax = Math.max(t.coinMax, it.amount);
        t.coinSum += it.amount;
        t.coinN += 1;
      } else if (it.kind === 'diamonds' && it.amount !== SPEC.lootDiamonds[tier]) t.diamondsBad += 1;
    }
    // Keep the scratch inventory small; eggFood/coins/diamonds counters can grow.
    s.inv.petEggs.length = 0;
    s.inv.treats.length = 0;
    s.inv.trinkets.length = 0;
  }
  return t;
}

const sameSplit = (tier, sp) => {
  // Fold +1/+2 above Ultra into Ultra the way the spec does: the [same, +1, +2] buckets by tier distance.
  if (tier === ULTRA) return [1, 0, 0];
  if (tier === ULTRA - 1) return [sp[0], sp[1] + sp[2], 0];
  return sp;
};

if (want('eggs')) {
  section = 'Pet-egg chance by source (once per openable egg)';
  const byTier = {};
  for (let tier = 0; tier <= ULTRA; tier += 1) {
    for (const source of ['laid', ...OTHER_SOURCES]) {
      const t = openMany(tier, source, N, rngFor());
      byTier[`${tier}:${source}`] = t;
      const p = source === 'laid' ? SPEC.petEggChance.laid[tier] : SPEC.petEggChance.other[tier];
      prop(`${TIERS[tier]} egg, ${source}`, t.pet, t.n, p);
    }
  }

  section = 'Item count: 3 + Binomial(9, 0.28), range 3–12, mean ≈ 5.52';
  {
    const pmf = binomPmf(SPEC.itemTrials, SPEC.itemP);
    const all = { n: 0, total: 0, min: 99, max: 0, hist: new Array(30).fill(0) };
    for (const t of Object.values(byTier)) {
      all.n += t.n;
      all.total += t.itemTotal;
      all.min = Math.min(all.min, t.itemMin);
      all.max = Math.max(all.max, t.itemMax);
      t.items.forEach((c, i) => { all.hist[i] += c; });
    }
    const mu = SPEC.itemBase + SPEC.itemTrials * SPEC.itemP;
    const sd = Math.sqrt(SPEC.itemTrials * SPEC.itemP * (1 - SPEC.itemP));
    meanCheck(`mean items (all ${all.n} eggs, expected ${mu.toFixed(2)})`, all.total, all.n, mu, sd);
    exact(`range ${all.min}–${all.max} within 3–12`, all.min >= 3 && all.max <= 12, `${all.min}–${all.max}`);
    for (let k = 0; k <= SPEC.itemTrials; k += 1) prop(`P(${SPEC.itemBase + k} items)`, all.hist[SPEC.itemBase + k], all.n, pmf[k]);
    const bonus = openMany(0, 'laid', N, rngFor(), 3);
    meanCheck('mean items with +3 level/effect items (laid snapshot)', bonus.itemTotal, bonus.n, mu + 3, sd);
  }

  section = 'Loot weights (non-pet items), egg-food tier and amount, coin and diamond amounts, Ultra trinket';
  for (const tier of [0, 3, ULTRA]) {
    const t = byTier[`${tier}:laid`];
    const w = { ...SPEC.loot };
    if (tier < 3) { w.coins += w.charm + w.trinket; w.charm = 0; w.trinket = 0; }
    const W = Object.values(w).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(w)) prop(`${TIERS[tier]} egg: ${k}`, t.kinds[k], t.loot, w[k] / W);
    let fs = SPEC.foodSplit.slice();
    if (tier === 0) fs = [fs[0] + fs[1], 0, fs[2]]; // one lower folds into Ordinary
    if (tier === ULTRA) fs = [fs[0] + fs[2], fs[1], 0]; // one higher folds into Ultra
    const foodN = t.foodTier.reduce((a, b) => a + b, 0);
    ['same tier', 'one lower', 'one higher'].forEach((label, i) => prop(`${TIERS[tier]} egg food: ${label}`, t.foodTier[i], foodN, fs[i]));
    [1, 2, 3].forEach((a) => prop(`${TIERS[tier]} egg food: ${a} serving${a > 1 ? 's' : ''}`, t.foodAmt[a], foodN, 1 / 3));
    const base = SPEC.lootCoins[tier];
    exact(`${TIERS[tier]} coin piles within ${base} × 0.5–1.5`, t.coinMin >= Math.round(base * 0.5) && t.coinMax <= Math.round(base * 1.5), `${t.coinMin}–${t.coinMax}`);
    meanCheck(`${TIERS[tier]} mean coin pile (${base})`, t.coinSum, t.coinN, base, (base * 1) / Math.sqrt(12) + 0.5);
    exact(`${TIERS[tier]} diamonds are always ${SPEC.lootDiamonds[tier]}`, t.diamondsBad === 0);
  }
  {
    const ult = OTHER_SOURCES.concat('laid').map((src) => byTier[`${ULTRA}:${src}`]);
    const k = ult.reduce((a, t) => a + t.ultraTrinket, 0);
    const n = ult.reduce((a, t) => a + t.n, 0);
    prop('Ultra egg: Ultra trinket (all sources)', k, n, SPEC.ultraTrinket);
  }
}

// ---- 2: tier splits (pet-egg chance forced to 1 so every egg rolls a split) ---------------------------------

if (want('splits')) {
  section = 'Pet-egg tier when the roll hits: laid same/+1/+2, streak-type 90/10';
  E.setConfig({ eggs: { petEggChance: { laid: [1, 1, 1, 1, 1, 1, 1], other: [1, 1, 1, 1, 1, 1, 1] } } });
  try {
    for (let tier = 0; tier <= ULTRA; tier += 1) {
      const laid = openMany(tier, 'laid', N, rngFor());
      const sp = sameSplit(tier, SPEC.laidSplit[tier]);
      ['same', '+1', '+2'].forEach((label, i) => prop(`laid ${TIERS[tier]}: ${label}`, laid.split[i], laid.pet, sp[i]));
      const other = openMany(tier, 'streak', N, rngFor());
      const so = sameSplit(tier, SPEC.otherSplit);
      ['same', '+1', '+2'].forEach((label, i) => prop(`streak ${TIERS[tier]}: ${label}`, other.split[i], other.pet, so[i]));
    }
    // The other non-laid sources share the streak table: one tier each is enough to show the routing.
    for (const source of ['chest', 'season', 'welcome']) {
      const t = openMany(1, source, N, rngFor());
      ['same', '+1', '+2'].forEach((label, i) => prop(`${source} Rare: ${label}`, t.split[i], t.pet, SPEC.otherSplit[i]));
    }
  } finally {
    E.resetConfig();
  }
}

// ---- 4–5: hatch odds (food bonus, 50 % floor, fold into Ultra), the charm ------------------------------------

function hatchMany(eggTier, foods, n, rng, { charm = null, guaranteed = false } = {}) {
  const s = scratchState();
  const ctx = ctxOf(s);
  const out = { n, final: new Array(7).fill(0), rolled: new Array(7).fill(0), upgraded: 0, eligible: 0 };
  for (let i = 0; i < n; i += 1) {
    const egg = addPetEgg(s, { tier: eggTier, source: 'egg', guaranteed, fed: foods });
    if (charm) {
      s.inv.charms[charm] += 1;
      charmPetEgg(s, egg.id, charm, ctx);
    }
    const pet = hatchPetEgg(s, egg.id, rng, { ...ctx, events: [] });
    out.final[pet.tier] += 1;
    s.pets.length = 0;
  }
  return out;
}

/** Same, but read the rolled tier and the charm flag from the hatch event. */
function hatchManyEvents(eggTier, foods, n, rng, charm) {
  const s = scratchState();
  const ctx = ctxOf(s);
  const out = { n, final: new Array(7).fill(0), rolled: new Array(7).fill(0), upgraded: 0, eligible: 0 };
  for (let i = 0; i < n; i += 1) {
    const egg = addPetEgg(s, { tier: eggTier, source: 'egg', fed: foods });
    s.inv.charms[charm] += 1;
    charmPetEgg(s, egg.id, charm, ctx);
    const events = [];
    hatchPetEgg(s, egg.id, rng, { ...ctx, events });
    const ev = events.find((e) => e.type === 'petEgg.hatched');
    out.final[ev.pet.tier] += 1;
    out.rolled[ev.rolledTier] += 1;
    if (ev.rolledTier < ULTRA) {
      out.eligible += 1;
      if (ev.charmUpgraded) out.upgraded += 1;
    }
    s.pets.length = 0;
  }
  return out;
}

if (want('hatch')) {
  section = 'Hatch odds: 95/5 base, food bonus 1 %/2^(j−1) per serving, own tier ≥ 50 %, fold into Ultra';
  const rep = (t, k) => new Array(k).fill(t);
  const cases = [
    ['Ordinary egg, 5 Ordinary food', 0, rep(0, 5)],
    ['Ordinary egg, 5 Rare food', 0, rep(1, 5)],
    ['Ordinary egg, 5 Epic food', 0, rep(3, 5)],
    ['Super Rare egg, 8 Ultra food', 2, rep(6, 8)],
    ['Mythic egg, 12 Ultra food', 4, rep(6, 12)],
    ['Legendary egg, 15 Ultra food', 5, rep(6, 15)],
    ['Ordinary egg, 30 Ultra food (50 % floor binds)', 0, rep(6, 30)],
    ['Rare egg, 40 Legendary food (floor + fold)', 1, rep(5, 40)],
    ['Ultra egg, 20 Ultra food', 6, rep(6, 20)],
  ];
  for (const [label, tier, foods] of cases) {
    const h = hatchMany(tier, foods, N, rngFor());
    const p = specHatch(tier, foods);
    const own = p[tier];
    if (label.includes('floor')) exact(`${label}: spec own tier is exactly 50 %`, Math.abs(own - 0.5) < 1e-12, own.toFixed(4));
    for (let t = 0; t < 7; t += 1) if (p[t] > 0 || h.final[t] > 0) prop(`${label} → ${TIERS[t]}`, h.final[t], h.n, p[t]);
    const engineOdds = E.hatchOdds(tier, foods);
    exact(`${label}: hatchOdds() matches the spec formula`, engineOdds.every((x, i) => Math.abs(x - p[i]) < 1e-12));
  }
  {
    const h = hatchMany(0, rep(0, 5), N, rngFor(), { guaranteed: true });
    prop('Guaranteed starter egg → Ordinary', h.final[0], h.n, 1);
  }

  section = 'Tier and Sprout charms: +1 tier 20 % after the main roll; 50 % more servings (rounded up)';
  for (const [label, tier, foods, kind] of [
    ['Epic egg + tier charm, 15 Epic food', 3, rep(3, 15), 'tier'],
    ['Mythic egg + tier charm, 18 Ultra food', 4, rep(6, 18), 'tier'],
    ['Legendary egg + tier charm, 23 Ultra food', 5, rep(6, 23), 'tier'],
    ['Super Rare egg + Sprout charm, 12 Epic food', 2, rep(3, 12), 'sprout'],
    ['Ordinary egg + Sprout charm, 8 Ordinary food', 0, rep(0, 8), 'sprout'],
  ]) {
    const h = hatchManyEvents(tier, foods, N, rngFor(), kind);
    prop(`${label}: P(+1 | rolled below Ultra)`, h.upgraded, h.eligible, SPEC.charm);
    const p = specHatch(tier, foods, true);
    const r = specHatch(tier, foods, false);
    for (let t = 0; t < 7; t += 1) if (r[t] > 0) prop(`${label}: rolled ${TIERS[t]}`, h.rolled[t], h.n, r[t]);
    for (let t = 0; t < 7; t += 1) if (p[t] > 0) prop(`${label} → ${TIERS[t]}`, h.final[t], h.n, p[t]);
  }
  {
    const want2 = SPEC.servings.map((x) => Math.ceil(x * SPEC.charmServings));
    const got = SPEC.servings.map((_, t) => hatchNeed({ tier: t, charm: 'tier' }));
    exact(`charmed servings ${got.join('/')} = ceil(1.5 × base)`, got.every((x, i) => x === want2[i]), want2.join('/'));
    const base = SPEC.servings.map((_, t) => hatchNeed({ tier: t, charm: null }));
    exact(`servings ${base.join('/')} = 5/6/8/10/12/15/20`, base.every((x, i) => x === SPEC.servings[i]));
    const s = scratchState();
    const ctx = { ...ctxOf(s), events: [] };
    const refused = (fn, code) => {
      try { fn(); return false; } catch (err) { return err.code === code; }
    };
    const epic = addPetEgg(s, { tier: 3, source: 'egg' });
    s.inv.charms.sprout = 1;
    exact('Sprout charm refused on an Epic egg', refused(() => charmPetEgg(s, epic.id, 'sprout', ctx), 'sprout_tier'));
    const ult = addPetEgg(s, { tier: 6, source: 'egg' });
    s.inv.charms.tier = 2;
    exact('charm refused on an Ultra egg', refused(() => charmPetEgg(s, ult.id, 'tier', ctx), 'charm_useless'));
    charmPetEgg(s, epic.id, 'tier', ctx);
    exact('a second charm on one egg is refused', refused(() => charmPetEgg(s, epic.id, 'tier', ctx), 'charm_used'));
  }
}

// ---- 6–7: merge mutation and combine rates ------------------------------------------------------------------

function newPet(s, rng, tier, species, stars = 1) {
  const p = createPet(s, { tier, species, rng, dayKey: '2026-11-02' });
  p.stars = stars;
  p.location = 'backpack';
  s.pets.push(p);
  return p;
}

if (want('merge')) {
  section = 'Merge: guaranteed +1★, 5 % mutation +1 tier (never above Ultra)';
  for (const [tier, stars] of [[0, 1], [3, 2], [5, 4], [6, 1]]) {
    const s = scratchState();
    const rng = rngFor();
    const ctx = { ...ctxOf(s), events: [] };
    let mutated = 0;
    let starsOk = 0;
    for (let i = 0; i < N; i += 1) {
      const a = newPet(s, rng, tier, 'fox', stars);
      const b = newPet(s, rng, tier, 'fox', stars);
      const keep = mergePets(s, a.id, b.id, rng, ctx);
      if (keep.tier === tier + 1) mutated += 1;
      if (keep.stars === stars + 1) starsOk += 1;
      s.pets.length = 0;
      ctx.events.length = 0;
    }
    prop(`${TIERS[tier]} ${stars}★ merge: mutation`, mutated, N, tier >= ULTRA ? 0 : SPEC.mutation);
    prop(`${TIERS[tier]} ${stars}★ merge: +1★`, starsOk, N, 1);
  }
}

if (want('combine')) {
  section = 'Combine (two different-species pets, or two pet eggs, same tier): 20 / 10 / 5 / 2.5 / 1.25 / 0.625 %';
  for (let tier = 0; tier < ULTRA; tier += 1) {
    const s = scratchState();
    const rng = rngFor();
    const ctx = { ...ctxOf(s), events: [] };
    let ok = 0;
    let right = 0;
    for (let i = 0; i < N; i += 1) {
      const a = newPet(s, rng, tier, 'fox');
      const b = newPet(s, rng, tier, 'owl');
      const r = combinePets(s, a.id, b.id, rng, ctx);
      if (r.success) {
        ok += 1;
        const p = s.pets.find((x) => x.id === r.result.pet.id);
        if (p.tier === tier + 1 && p.level === 1 && p.stars === 1 && ['fox', 'owl'].includes(p.species)) right += 1;
      }
      s.pets.length = 0;
      ctx.events.length = 0;
    }
    prop(`${TIERS[tier]} pets`, ok, N, SPEC.combine[tier]);
    exact(`${TIERS[tier]} pet combine result: next tier, level 1, 1★, one of the two species`, right === ok, `${right}/${ok}`);

    const s2 = scratchState();
    const rng2 = rngFor();
    let okE = 0;
    let rightE = 0;
    for (let i = 0; i < N; i += 1) {
      const a = addPetEgg(s2, { tier, source: 'egg' });
      const b = addPetEgg(s2, { tier, source: 'egg' });
      const r = combinePetEggs(s2, a.id, b.id, rng2, { ...ctx, events: [] });
      if (r.success) {
        okE += 1;
        if (r.result.petEgg.tier === tier + 1) rightE += 1;
      }
      s2.inv.petEggs.length = 0;
    }
    prop(`${TIERS[tier]} pet eggs`, okE, N, SPEC.combine[tier]);
    exact(`${TIERS[tier]} egg combine result is a ${TIERS[tier + 1]} egg`, rightE === okE, `${rightE}/${okE}`);
  }
}

// ---- report ----------------------------------------------------------------------------------------------------

let last = '';
for (const r of results) {
  if (r.section !== last) {
    console.log(`\n## ${r.section}`);
    last = r.section;
  }
  const tag = r.ok ? 'ok  ' : 'MISS';
  if (r.sigma === 0 && r.n === 1) console.log(`${tag} ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
  else if (r.isMean) console.log(`${tag} ${r.name}: ${r.obs.toFixed(4)} vs ${r.exp.toFixed(4)} ± ${(opts.z * r.sigma).toFixed(4)} (n=${r.n}, z=${r.z.toFixed(2)})`);
  else console.log(`${tag} ${r.name}: ${fmtP(r.obs)} vs ${fmtP(r.exp)} ± ${fmtP(opts.z * r.sigma)} (n=${r.n}, z=${Number.isFinite(r.z) ? r.z.toFixed(2) : '∞'})`);
}
const rolls = results.filter((r) => !(r.sigma === 0 && r.n === 1)).length;
console.log(`\n${results.length} checks (${rolls} statistical at ±${opts.z}σ), ${failures} missed. Seed ${opts.seed}, ${N} rolls per table.`);
process.exit(failures ? 1 : 0);
