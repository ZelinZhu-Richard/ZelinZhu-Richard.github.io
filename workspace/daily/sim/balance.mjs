#!/usr/bin/env node
// Daily balance script: the owner's Monte Carlo (sim/daily_balance_sim.py) ported onto the REAL engine.
// Hand-run only (never in npm test, never copied to dist/).
//
//   node workspace/daily/sim/balance.mjs [runs] [--runs N] [--days 365|730] [--charm tier|sprout]
//        [--seed S] [--archetypes a,b] [--workers W] [--start YYYY-MM-DD] [--charm-buy eager|python|never]
//        [--active N] [--json out.json]
//
// Every simulated player is a real save: newGame → advance at 06:00 New York each day → applyAction for every
// tick, feed, egg, hatch, merge, combine and purchase, at simulated clock times inside the 05:00–22:00 window.
// The policy is the Python "greedy climber" (an upper bound on progression speed):
//   - day level from the archetype's weekday/weekend mix; 'G' letters are per-task raises to Goddamn;
//   - a Markov miss model (p(miss | yesterday complete), p(miss | yesterday missed)); a missed day ticks a random
//     0..n−1 tasks;
//   - quests are played as the game asks (frog first, raise the named task one level, habit pairs adjacent, Sleep
//     with its real hours, Deep work tagged), all ticks 07:00–09:30, so timed quests are met;
//   - up to 3 active pets (the best by tier, stars, level), each fed to 100, backpack upkeep reserved, and the whole
//     surplus poured into the top pet;
//   - every openable egg opened; pet eggs ≥ Super Rare (or ≥ max(1, best tier − 1)) hatched as soon as the owned
//     egg food covers the servings, highest-tier food first; lower pet eggs combined in pairs, an odd one separated;
//   - same species/tier/stars pets merged; surplus pets below the best tier (beyond the best 3 per tier) combined
//     in different-species pairs; the lowest pet released when the backpack blocks a hatch;
//   - freezes bought to the cap with coins; the Epic / Mythic / Legendary pet egg bought with diamonds as soon as
//     it is affordable and above everything owned;
//   - charms: a tier charm goes on any egg ≥ Super Rare, a Sprout charm on Rare / Super Rare eggs; shop charms are
//     bought for the egg being hatched (--charm-buy eager: once Epic is reached or the Epic egg is not being saved
//     for; python: only once Mythic is reached, keeping 400 diamonds, like the Python sim; never);
//   - XP treats on the top pet, trinkets equipped on the best Epic+ active pet.
// --charm sets config.charms.shop and config.charms.season (setConfig, balance script only) to 'tier' or 'sprout'.

import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import * as E from '../engine/index.js';
// Read-only helpers from engine internals (the policy needs seat/upkeep/servings math without building views).
import { computeEffects, upkeepCost } from '../engine/effects.js';
import { hatchNeed } from '../engine/eggs-math.js';
import { backpackCap, canHouse, seatInfo } from '../engine/pets.js';

const T = E.time;
const TIER_NAMES = ['Ordinary', 'Rare', 'Super Rare', 'Epic', 'Mythic', 'Legendary', 'Ultra'];
const ULTRA = 6;

// name: weekday mix, weekend mix, p(miss | yesterday complete), p(miss | yesterday missed)   (as the Python sim)
export const ARCHETYPES = {
  'chill-days': { wk: 'CCCCCC', we: 'CCCCCC', pMC: 0.02, pMM: 0.30 },
  'easy-days': { wk: 'EEEEEE', we: 'EEEEEE', pMC: 0.03, pMM: 0.40 },
  'medium-days': { wk: 'MMMMMM', we: 'MMMMMM', pMC: 0.03, pMM: 0.40 },
  'medium+hard-wkend': { wk: 'MMMMMM', we: 'HHHHHH', pMC: 0.03, pMM: 0.40 },
  'hard-every-day': { wk: 'HHHHHH', we: 'GGHHHH', pMC: 0.04, pMM: 0.40 },
  inconsistent: { wk: 'MMMMMM', we: 'MMMMMM', pMC: 0.10, pMM: 0.50 },
};
const LETTER = { C: 0, E: 1, M: 2, H: 3, G: 4 };

// ---- options -------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const o = {
    runs: 500, days: 365, charm: 'tier', seed: 1, archetypes: Object.keys(ARCHETYPES), workers: null,
    start: '2026-10-25', charmBuy: 'eager', active: 3, json: null, quiet: false, set: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (/^\d+$/.test(a)) o.runs = Number(a);
    else if (a === '--runs') o.runs = Number(next());
    else if (a === '--days') o.days = Number(next());
    else if (a === '--charm') o.charm = next();
    else if (a === '--seed') o.seed = Number(next());
    else if (a === '--archetypes') o.archetypes = next().split(',');
    else if (a === '--workers') o.workers = Number(next());
    else if (a === '--start') o.start = next();
    else if (a === '--charm-buy') o.charmBuy = next();
    else if (a === '--active') o.active = Number(next());
    else if (a === '--json') o.json = next();
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--set') {
      // --set path.to.key=<JSON> : a what-if config override for this run only (never changes the engine).
      const [path, ...rest] = next().split('=');
      o.set.push([path, JSON.parse(rest.join('='))]);
    }
    else if (a === '-h' || a === '--help') {
      console.log(fileURLToPath(import.meta.url).split('/').pop(), '— see the header comment for options.');
      process.exit(0);
    } else throw new Error(`Unknown option ${a}`);
  }
  if (!['tier', 'sprout'].includes(o.charm)) throw new Error('--charm must be tier or sprout');
  if (!['eager', 'python', 'never'].includes(o.charmBuy)) throw new Error('--charm-buy must be eager, python or never');
  for (const a of o.archetypes) if (!ARCHETYPES[a]) throw new Error(`Unknown archetype ${a}`);
  if (!(o.runs > 0 && o.days > 0)) throw new Error('--runs and --days must be positive');
  return o;
}

// ---- one simulated player --------------------------------------------------------------------------------------

const at = (key, h, m = 0) => T.nyInstant(key, h * 60 + m);
const byBest = (a, b) => b.tier - a.tier || b.stars - a.stars || b.level - a.level || (a.id < b.id ? -1 : 1);
const byWorst = (a, b) => -byBest(a, b);
const sum = (xs) => xs.reduce((x, y) => x + y, 0);

function behaviourRng(seed4) {
  const stream = { seed: E.seedFrom(seed4), n: 0 };
  return E.streamRng(stream);
}

export function simulateRun(archName, archIdx, runIdx, opts) {
  const A = ARCHETYPES[archName];
  const rng = behaviourRng([opts.seed >>> 0, archIdx + 101, runIdx, 0xbe4a]);
  const engineSeed = [opts.seed >>> 0, archIdx + 1, runIdx, 0xda11];
  const m = {
    first: [null, null, null, null, null, null, null], deaths: 0, eggsOpened: 0, completeDays: 0, best: 0,
    coins: { dividend: 0, loot: 0, quest: 0, keeper: 0, season: 0, milestone: 0, petdex: 0 },
    dia: { dividendShards: 0, loot: 0, keeper: 0, season: 0, milestone: 0, petdex: 0, chest: 0 },
    spent: { coins: 0, diamonds: 0 }, lost: { coins: 0, diamonds: 0 },
    petEggsFound: 0, petEggsBySource: {}, hatched: [0, 0, 0, 0, 0, 0, 0], charmsUsed: { tier: 0, sprout: 0 },
    charmUpgrades: 0, mutations: 0, combinesOk: 0, combinesTried: 0, bought: {}, errors: {}, questStars: 0,
    questsDone: 0, chests: 0, route: {}, blockCoins: [], blockComplete: [],
  };
  const startKey = opts.start;
  let s;
  // How each tier ≥ Epic was first reached (pet-egg origin → hatch roll, mutation, combine): the dial finder.
  const origin = new Map();
  const hatchedEggTier = new Map();
  let reached = -1;
  const reach = (tier, how) => {
    for (let t = Math.max(reached + 1, 3); t <= tier; t += 1) m.route[t] = how;
    if (tier > reached) reached = tier;
  };
  let now = at(startKey, 6);

  const note = (events) => {
    for (const e of events) {
      switch (e.type) {
        case 'pet.dividend': m.coins.dividend += e.coins; m.dia.dividendShards += e.shards / 10; break;
        case 'egg.opened':
          for (const it of e.items) {
            if (it.kind === 'coins') m.coins.loot += it.amount;
            else if (it.kind === 'diamonds') m.dia.loot += it.amount;
            else if (it.kind === 'petEgg') {
              m.petEggsFound += 1;
              m.petEggsBySource[e.source] = (m.petEggsBySource[e.source] || 0) + 1;
              origin.set(it.petEgg.id, `${e.source} ${TIER_NAMES[e.tier]} egg`);
            }
          }
          break;
        case 'quest.completed': m.coins.quest += e.coins; m.questsDone += 1; break;
        case 'quest.star': m.questStars += 1; break;
        case 'chest.ready': m.dia.chest += e.diamonds; m.chests += 1; break;
        case 'keeper.levelUp': m.coins.keeper += e.rewards.coins || 0; m.dia.keeper += e.rewards.diamonds || 0; break;
        case 'season.tierUp': m.coins.season += e.rewards.coins || 0; m.dia.season += e.rewards.diamonds || 0; break;
        case 'streak.milestone': m.coins.milestone += e.coins; m.dia.milestone += e.diamonds; break;
        case 'petdex.discovered': m.coins.petdex += e.coins; m.dia.petdex += e.diamonds; break;
        case 'shop.bought':
          if (e.petEgg) origin.set(e.petEgg.id, 'shop');
          if (e.pet) reach(e.pet.tier, 'shop pet');
          m.spent[e.currency] += e.price;
          m.bought[e.itemId] = (m.bought[e.itemId] || 0) + 1;
          break;
        case 'death': m.lost.coins += e.lost.coins || 0; m.lost.diamonds += (e.lost.diamonds || 0) + (e.lost.shards || 0) / 10; break;
        case 'petEgg.hatched': {
          m.hatched[e.pet.tier] += 1;
          if (e.charmUpgraded) m.charmUpgrades += 1;
          if (e.pet.tier > reached) {
            const o = origin.get(e.petEggId) || 'starter';
            const egg = hatchedEggTier.get(e.petEggId);
            const roll = e.rolledTier > egg ? ` rolled +${e.rolledTier - egg}` : '';
            reach(e.pet.tier, `${TIER_NAMES[egg]} pet egg (${o})${roll}${e.charmUpgraded ? ' + charm' : ''}`);
          }
          break;
        }
        case 'petEgg.charmed': m.charmsUsed[e.charm] += 1; break;
        case 'pet.merged': if (e.mutated) { m.mutations += 1; reach(e.tier, 'merge mutation'); } break;
        case 'combine.result':
          m.combinesTried += 1;
          if (e.success) m.combinesOk += 1;
          if (e.success && e.result.petEgg) origin.set(e.result.petEgg.id, 'egg combine');
          if (e.success && e.result.pet) reach(e.result.pet.tier, 'pet combine');
          break;
        case 'phoenix.revived': break;
        default: break;
      }
    }
  };
  const act = (action, t = now) => {
    try {
      const r = E.applyAction(s, action, t);
      s = r.state;
      note(r.events);
      if (opts.trace) opts.trace(s, action, r.events, t);
      return r.events;
    } catch (err) {
      if (!(err instanceof E.GameError)) throw err;
      const k = `${action.type}:${err.code}`;
      m.errors[k] = (m.errors[k] || 0) + 1;
      return null;
    }
  };

  // Day 1: the list locks at 06:00 and the day opens; the starter egg hatches.
  {
    s = E.newGame({ seed: engineSeed, now, tasks: E.DEFAULT_TASKS });
  }
  const tasks = s.list.tasks;
  const n = tasks.length;
  // Map the archetype's 6 letters onto tasks; 'G' raises go to non-Sleep tasks first.
  const letterOrder = tasks.map((t, i) => i).sort((a, b) => (tasks[a].tag === 'sleep') - (tasks[b].tag === 'sleep') || a - b);

  const maxPetTier = () => s.pets.reduce((mx, p) => Math.max(mx, p.tier), -1);
  const markTiers = (d) => {
    const mt = maxPetTier();
    for (let t = 0; t <= mt; t += 1) if (m.first[t] == null) m.first[t] = d;
  };

  // ---- eggs and pets -------------------------------------------------------------------------------------------
  const openAll = () => {
    for (const e of s.inv.openEggs.slice()) act({ type: 'egg/open', eggId: e.id });
  };

  const useTreats = () => {
    if (!s.inv.treats.length) return;
    for (const t of s.inv.treats.slice()) {
      const target = s.pets.slice().sort(byBest).find((p) => p.level < E.CONFIG.pets.levelCaps[p.tier]);
      if (!target) return;
      act({ type: 'pet/useTreat', petId: target.id, treatId: t.id });
    }
  };

  const releaseLowest = (exceptIds = new Set()) => {
    const low = s.pets.filter((p) => !exceptIds.has(p.id)).sort(byWorst)[0];
    if (!low) return false;
    return !!act({ type: 'pet/release', petId: low.id });
  };

  const charmFor = (egg) => {
    if (egg.charm || egg.guaranteed || egg.tier >= ULTRA) return null;
    if (egg.tier >= 1 && egg.tier <= E.CONFIG.hatch.sproutMaxTier && s.inv.charms.sprout > 0) return 'sprout';
    if (egg.tier >= 2 && s.inv.charms.tier > 0) return 'tier';
    return null;
  };

  const shopCharmUseful = (egg) => {
    const kind = E.CONFIG.charms.shop;
    if (egg.charm || egg.guaranteed || egg.tier >= ULTRA) return false;
    if (kind === 'tier') return egg.tier >= 2;
    return egg.tier >= 1 && egg.tier <= E.CONFIG.hatch.sproutMaxTier;
  };

  const maybeBuyCharm = (egg, food) => {
    if (opts.charmBuy === 'never' || !shopCharmUseful(egg)) return;
    const mt = Math.max(maxPetTier(), ...s.inv.petEggs.map((e) => e.tier));
    const price = E.CONFIG.shop.charm;
    let ok;
    if (opts.charmBuy === 'python') ok = mt >= 4 && s.inv.diamonds >= price + 400;
    else ok = s.inv.diamonds >= price + (mt < 3 ? E.CONFIG.shop.petEggs[3] : 0);
    const needCharmed = Math.ceil(E.CONFIG.hatch.servings[egg.tier] * E.CONFIG.hatch.charmServingsMult) - egg.fed.length;
    if (ok && food >= needCharmed) act({ type: 'shop/buy', itemId: 'charm' });
  };

  const tryHatch = (eggId) => {
    let egg = s.inv.petEggs.find((e) => e.id === eggId);
    if (!egg) return false;
    let food = sum(s.inv.eggFood);
    if (!egg.charm && !charmFor(egg)) maybeBuyCharm(egg, food);
    const kind = charmFor(egg);
    if (kind) {
      const needCharmed = Math.ceil(E.CONFIG.hatch.servings[egg.tier] * E.CONFIG.hatch.charmServingsMult) - egg.fed.length;
      if (food < needCharmed) return false; // like the Python sim: wait for enough food for the charmed egg
      act({ type: 'petEgg/charm', petEggId: egg.id, charm: kind });
      egg = s.inv.petEggs.find((e) => e.id === eggId);
    }
    const remaining = hatchNeed(egg) - egg.fed.length;
    if (food < remaining) return false;
    for (let i = 0; i < remaining; i += 1) {
      const tier = s.inv.eggFood.findLastIndex((x) => x > 0);
      act({ type: 'petEgg/feed', petEggId: egg.id, foodTier: tier });
    }
    for (let guard = 0; guard < 5 && !canHouse(s); guard += 1) if (!releaseLowest()) break;
    hatchedEggTier.set(egg.id, egg.tier);
    return !!act({ type: 'petEgg/hatch', petEggId: egg.id });
  };

  const manageEggs = () => {
    const mt0 = maxPetTier();
    const mt = Math.max(0, mt0);
    const eggs = s.inv.petEggs.slice().sort((a, b) => b.tier - a.tier || b.fed.length - a.fed.length);
    const low = new Map();
    for (const egg of eggs) {
      if (!s.inv.petEggs.some((e) => e.id === egg.id)) continue;
      const hatchable = egg.guaranteed || mt0 < 0 || egg.tier >= 2 || egg.tier >= Math.max(1, mt - 1);
      if (hatchable) tryHatch(egg.id);
      else {
        if (!low.has(egg.tier)) low.set(egg.tier, []);
        low.get(egg.tier).push(egg.id);
      }
    }
    for (const ids of low.values()) {
      while (ids.length >= 2) act({ type: 'petEgg/combine', aId: ids.pop(), bId: ids.pop() });
      if (ids.length === 1) act({ type: 'petEgg/separate', petEggId: ids.pop() });
    }
  };

  const managePets = () => {
    // 1. Merge same species / tier / stars (< 5★), repeatedly.
    for (let guard = 0; guard < 50; guard += 1) {
      const groups = new Map();
      let pair = null;
      for (const p of s.pets.slice().sort(byBest)) {
        if (p.stars >= E.CONFIG.pets.maxStars) continue;
        const k = `${p.species}|${p.tier}|${p.stars}`;
        if (groups.has(k)) { pair = [groups.get(k), p]; break; }
        groups.set(k, p);
      }
      if (!pair) break;
      if (!act({ type: 'pet/merge', aId: pair[0].id, bId: pair[1].id })) break;
    }
    // 2. Combine surplus pets below the best tier (keep the best 3 per tier), different-species pairs.
    const mt = maxPetTier();
    const top = s.pets.slice().sort(byBest)[0];
    for (let t = 0; t < Math.min(mt, ULTRA); t += 1) {
      const list = s.pets.filter((p) => p.tier === t && p !== top).sort(byBest);
      const extras = list.slice(3);
      while (extras.length >= 2) {
        const a = extras.pop();
        const j = extras.findLastIndex((b) => b.species !== a.species);
        if (j < 0) break;
        const b = extras.splice(j, 1)[0];
        act({ type: 'pet/combine', aId: a.id, bId: b.id });
      }
    }
  };

  const equipTrinkets = () => {
    for (const t of s.inv.trinkets.slice()) {
      const targets = s.pets.filter((p) => p.location === 'active' && p.tier >= E.CONFIG.trinkets.minPetTier && p.trinkets.length < E.CONFIG.trinkets.slots)
        .sort(byBest);
      for (const p of targets) {
        if (p.trinkets.some((x) => x.defId === t.defId)) continue;
        try {
          s = E.applyAction(s, { type: 'pet/equip', petId: p.id, trinketId: t.id }, now).state;
          break;
        } catch (err) {
          if (!(err instanceof E.GameError)) throw err; // duplicate / second luck trinket: try the next pet
        }
      }
    }
  };

  const shop = () => {
    while (s.inv.freezes < E.CONFIG.freezes.cap && s.inv.coins >= E.CONFIG.freezes.price) {
      if (!act({ type: 'shop/buy', itemId: 'freeze' })) break;
    }
    let mt = Math.max(maxPetTier(), ...s.inv.petEggs.map((e) => e.tier));
    for (const [tierText, price] of Object.entries(E.CONFIG.shop.petEggs).sort((a, b) => a[0] - b[0])) {
      const tier = Number(tierText);
      if (mt < tier && s.inv.diamonds >= price) {
        if (act({ type: 'shop/buy', itemId: `petEgg:${tier}` })) mt = tier;
      }
    }
  };

  const morning = () => {
    openAll();
    useTreats();
    shop();
    manageEggs();
    managePets();
    equipTrinkets();
  };

  // ---- the day ---------------------------------------------------------------------------------------------
  const planDay = (key, complete) => {
    const mix = T.isWeekend(key) ? A.we : A.wk;
    const lv = new Array(n);
    for (let i = 0; i < n; i += 1) lv[letterOrder[i]] = LETTER[mix[i % mix.length]];
    const dayLevel = Math.min(E.CONFIG.tasks.dayLevelMax, Math.min(...lv));
    const raises = {};
    for (let i = 0; i < n; i += 1) if (lv[i] > dayLevel) raises[tasks[i].id] = lv[i];
    const q = s.day?.quests || [];
    const tg = s.day?.targets || {};
    const has = (id) => q.some((x) => x.id === id && !x.done);
    if (complete && dayLevel < E.HARD) {
      const up = (id) => { if (id && !(raises[id] > dayLevel)) raises[id] = dayLevel + 1; };
      if (has('raiseOne')) up(tg.target);
      if (has('raiseTwo')) { up(tg.target); up(tg.frog); }
      if (has('frogUp')) up(tg.frog);
    }
    // Tick order: Sleep first, then the frog / last-missed task, the habit pair adjacent, the rest.
    let ids = tasks.map((t) => t.id);
    if (!complete) {
      const k = Math.floor(rng() * n); // 0..n-1 tasks on a missed day
      const shuffled = ids.slice();
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const keep = new Set(shuffled.slice(0, k));
      ids = ids.filter((id) => keep.has(id));
    }
    const sleep = tasks.find((t) => t.tag === 'sleep')?.id;
    const order = [];
    const take = (id) => {
      const i = ids.indexOf(id);
      if (i >= 0) { ids.splice(i, 1); order.push(id); }
    };
    take(sleep);
    if (has('lastMissedFirst')) take(tg.lastMissed);
    else if (has('frog') || has('frogUp')) take(tg.frog);
    if (has('habitStack') && tg.pairA && tg.pairB) {
      if (order[order.length - 1] === tg.pairA || ids.includes(tg.pairA)) { take(tg.pairA); take(tg.pairB); }
    }
    for (const id of ids.slice()) take(id);
    return { dayLevel, raises, order };
  };

  const tickDay = (key, complete) => {
    const plan = planDay(key, complete);
    let t = at(key, 6, 20);
    if (plan.dayLevel !== s.day.level) act({ type: 'day/setLevel', level: plan.dayLevel }, t);
    for (const [taskId, level] of Object.entries(plan.raises)) {
      if (plan.order.includes(taskId)) act({ type: 'task/raise', taskId, level }, t);
    }
    plan.order.forEach((taskId, i) => {
      t = at(key, 7, 30 * i);
      const task = tasks.find((x) => x.id === taskId);
      const a = { type: 'task/tick', taskId };
      if (task.tag === 'sleep' && task.tierQty) a.qty = task.tierQty[s.day.raises[taskId] ?? s.day.level];
      if (task.receipt === 'deep') a.goalTag = 'Other';
      act(a, t);
    });
  };

  const feedDay = (key) => {
    now = at(key, 10, 30);
    const pets = s.pets.slice().sort(byBest);
    if (!pets.length || !s.day) return;
    const pool = s.day.pool;
    const each = upkeepCost(computeEffects(s));
    let k = Math.min(opts.active, pets.length);
    while (k > 1 && E.CONFIG.pets.need * k + each * (pets.length - k) > pool) k -= 1;
    const want = new Set(pets.slice(0, k).map((p) => p.id));
    for (const p of s.pets.filter((x) => x.location === 'active' && !want.has(x.id))) act({ type: 'pet/deactivate', petId: p.id });
    for (const id of want) {
      const p = s.pets.find((x) => x.id === id);
      if (p && p.location !== 'active') {
        const seats = seatInfo(s);
        if (seats.used < seats.total) act({ type: 'pet/activate', petId: id });
      }
    }
    const active = s.pets.filter((p) => p.location === 'active').sort(byBest);
    if (!active.length) return;
    const fx = computeEffects(s);
    const bp = s.pets.filter((p) => p.location === 'backpack').length;
    let avail = Math.max(0, s.day.pool - upkeepCost(fx) * bp);
    const need = E.CONFIG.pets.need;
    const give = new Map();
    for (const p of active) {
      const want2 = Math.max(0, need - (p.fed.day === key ? p.fed.amount : 0));
      if (avail >= want2) { give.set(p.id, want2); avail -= want2; }
    }
    if (avail > 0) give.set(active[0].id, (give.get(active[0].id) || 0) + avail);
    for (const p of active) {
      const amt = Math.floor(give.get(p.id) || 0);
      if (amt > 0) act({ type: 'pet/feed', petId: p.id, amount: amt });
    }
  };

  // ---- the year --------------------------------------------------------------------------------------------
  let prevComplete = true;
  // Coins and complete days per 30-day block (a day's close lands at the next morning's advance).
  let coinMark = 0;
  let completeMark = 0;
  const book = (day) => {
    const b = Math.floor((day - 1) / 30);
    const coins = sum(Object.values(m.coins));
    m.blockCoins[b] = (m.blockCoins[b] || 0) + coins - coinMark;
    m.blockComplete[b] = (m.blockComplete[b] || 0) + s.completeDays - completeMark;
    coinMark = coins;
    completeMark = s.completeDays;
  };
  for (let d = 1; d <= opts.days; d += 1) {
    const key = T.addDays(startKey, d - 1);
    now = at(key, 6);
    if (d > 1) {
      const r = E.advance(s, now);
      s = r.state;
      note(r.events);
      if (opts.trace) opts.trace(s, { type: 'advance' }, r.events, now);
      book(d - 1);
    }
    now = at(key, 6, 10);
    morning();
    markTiers(d);
    const pMiss = prevComplete ? A.pMC : A.pMM;
    const complete = rng() >= pMiss;
    prevComplete = complete;
    tickDay(key, complete);
    feedDay(key);
    now = at(key, 10, 40);
    openAll();
    markTiers(d);
  }
  // Close the last day.
  {
    const r = E.advance(s, at(T.addDays(startKey, opts.days), 6));
    s = r.state;
    note(r.events);
    book(opts.days);
  }
  m.deaths = s.stats.deaths;
  m.eggsOpened = s.stats.eggsOpened;
  m.completeDays = s.completeDays;
  m.best = s.best;
  m.keeperLevel = s.keeper.level;
  m.coinIncome = sum(Object.values(m.coins));
  m.diaIncome = sum(Object.values(m.dia));
  // Cross-check the event tally against the wallet: start + income − spent − lost = end (shards are fractional).
  const startCoins = E.newGame({ seed: 1, now: at(startKey, 6) }).inv.coins;
  m.walletCheck = {
    coins: startCoins + m.coinIncome - m.spent.coins - m.lost.coins - s.inv.coins,
    diamonds: Math.round((m.diaIncome - m.spent.diamonds - m.lost.diamonds - s.inv.diamonds - s.inv.shards / 10) * 10) / 10,
  };
  m.endTier = maxPetTier();
  return m;
}

// ---- aggregation ---------------------------------------------------------------------------------------------

const median = (xs) => {
  if (!xs.length) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const k = a.length;
  return k % 2 ? a[(k - 1) / 2] : (a[k / 2 - 1] + a[k / 2]) / 2;
};
const mean = (xs) => (xs.length ? sum(xs) / xs.length : 0);

/** Wilson 95 % interval for k of n. */
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export function summarize(arch, runs, days) {
  const n = runs.length;
  const out = { arch, runs: n, days };
  for (const t of [3, 4, 5, 6]) {
    const hit = runs.map((r) => r.first[t]).filter((x) => x != null);
    out[TIER_NAMES[t]] = { pct: hit.length / n, ci: wilson(hit.length, n), median: median(hit) };
  }
  const yr = 365 / days;
  out.deathsPerYear = mean(runs.map((r) => r.deaths)) * yr;
  out.pDeath = runs.filter((r) => r.deaths > 0).length / n;
  out.eggsPerDay = mean(runs.map((r) => r.eggsOpened)) / days;
  out.petEggsPerMonth = (mean(runs.map((r) => r.petEggsFound)) / days) * 30;
  out.coinsPerDay = mean(runs.map((r) => r.coinIncome)) / days;
  out.diaPerDay = mean(runs.map((r) => r.diaIncome)) / days;
  out.coinsPerCompleteDay = mean(runs.map((r) => r.coinIncome / Math.max(1, r.completeDays)));
  out.completeDays = mean(runs.map((r) => r.completeDays));
  out.maxStreak = median(runs.map((r) => r.best));
  out.coinSources = {};
  for (const k of Object.keys(runs[0].coins)) out.coinSources[k] = mean(runs.map((r) => r.coins[k])) / days;
  out.coinSourcesPerCompleteDay = {};
  for (const k of Object.keys(runs[0].coins)) out.coinSourcesPerCompleteDay[k] = mean(runs.map((r) => r.coins[k] / Math.max(1, r.completeDays)));
  out.diaSources = {};
  for (const k of Object.keys(runs[0].dia)) out.diaSources[k] = mean(runs.map((r) => r.dia[k])) / days;
  out.charmsUsed = { tier: mean(runs.map((r) => r.charmsUsed.tier)), sprout: mean(runs.map((r) => r.charmsUsed.sprout)) };
  out.charmUpgrades = mean(runs.map((r) => r.charmUpgrades));
  out.mutations = mean(runs.map((r) => r.mutations));
  out.bought = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.bought)) out.bought[k] = (out.bought[k] || 0) + v / n;
  out.errors = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.errors)) out.errors[k] = (out.errors[k] || 0) + v;
  out.walletMismatchRuns = runs.filter((r) => r.walletCheck.coins !== 0 || Math.abs(r.walletCheck.diamonds) > 0.05).length;
  out.questsPerDay = mean(runs.map((r) => r.questsDone)) / days;
  out.chestsPerYear = (mean(runs.map((r) => r.chests)) * 365) / days;
  out.keeperLevel = mean(runs.map((r) => r.keeperLevel));
  // Coins per complete day by 30-day block (pooled: block coins ÷ block complete days, over all runs).
  out.coinsPerCompleteDayByBlock = [];
  const blocks = Math.max(...runs.map((r) => r.blockCoins.length));
  for (let b = 0; b < blocks; b += 1) {
    const c = sum(runs.map((r) => r.blockCoins[b] || 0));
    const k = sum(runs.map((r) => r.blockComplete[b] || 0));
    out.coinsPerCompleteDayByBlock.push(k ? c / k : null);
  }
  out.routes = {};
  for (const t of [4, 5, 6]) {
    const c = {};
    for (const r of runs) if (r.route[t]) c[r.route[t]] = (c[r.route[t]] || 0) + 1;
    out.routes[TIER_NAMES[t]] = Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v / n]));
  }
  return out;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

export function formatTable(summaries, opts) {
  const lines = [];
  lines.push(`Daily balance on the real engine — ${opts.days} days from ${opts.start}, charms ${opts.charm}, charm buying ${opts.charmBuy}, seed ${opts.seed}${opts.set?.length ? `, what-if ${opts.set.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}` : ''}`);
  lines.push('');
  lines.push('| Player | Runs | Epic % (median day) | Mythic % (95% CI) (day) | Legendary % (day) | Ultra % (95% CI) | Deaths/yr | P(death) | Eggs/day | Pet eggs/mo | Coins/day | Diamonds/day |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const o of summaries) {
    const cell = (t, ci = false) => {
      const x = o[t];
      const c = ci ? ` (${(x.ci[0] * 100).toFixed(1)}–${(x.ci[1] * 100).toFixed(1)})` : '';
      return `${pct(x.pct)}${c}${x.median != null ? ` (d${Math.round(x.median)})` : ''}`;
    };
    lines.push(`| ${o.arch} | ${o.runs} | ${cell('Epic')} | ${cell('Mythic', true)} | ${cell('Legendary')} | ${pct(o.Ultra.pct)} (${(o.Ultra.ci[0] * 100).toFixed(1)}–${(o.Ultra.ci[1] * 100).toFixed(1)}) | ${o.deathsPerYear.toFixed(2)} | ${pct(o.pDeath)} | ${o.eggsPerDay.toFixed(1)} | ${o.petEggsPerMonth.toFixed(1)} | ${o.coinsPerDay.toFixed(0)} | ${o.diaPerDay.toFixed(2)} |`);
  }
  lines.push('');
  lines.push('| Player | Coins per complete day | dividends / loot / quests / keeper / season / milestones / petdex (per day) | Quests/day | Charms used (tier / sprout) | Charm +1s | Mutations | Bought per run | Engine refusals |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const o of summaries) {
    const cs = o.coinSources;
    const bought = Object.entries(o.bought).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
    const errs = Object.entries(o.errors).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
    lines.push(`| ${o.arch} | ${o.coinsPerCompleteDay.toFixed(0)} | ${[cs.dividend, cs.loot, cs.quest, cs.keeper, cs.season, cs.milestone, cs.petdex].map((x) => x.toFixed(0)).join(' / ')} | ${o.questsPerDay.toFixed(2)} | ${o.charmsUsed.tier.toFixed(2)} / ${o.charmsUsed.sprout.toFixed(2)} | ${o.charmUpgrades.toFixed(2)} | ${o.mutations.toFixed(2)} | ${bought} | ${errs}${o.walletMismatchRuns ? ` · WALLET MISMATCH ${o.walletMismatchRuns}` : ''} |`);
  }
  lines.push('');
  lines.push('Coins per complete day by 30-day block (block 1 = days 1–30; pooled over runs):');
  for (const o of summaries) lines.push(`- ${o.arch}: ${o.coinsPerCompleteDayByBlock.map((x) => (x == null ? '—' : x.toFixed(0))).join(' · ')}`);
  lines.push('');
  lines.push('How Mythic was first reached (share of all runs; top routes):');
  for (const o of summaries) {
    const r = Object.entries(o.routes.Mythic).slice(0, 6).map(([k, v]) => `${k} ${pct(v)}`).join(' · ');
    lines.push(`- ${o.arch}: ${r || '—'}`);
  }
  return lines.join('\n');
}

// ---- main / workers ------------------------------------------------------------------------------------------

function runJobs(opts) {
  const jobs = [];
  opts.archetypes.forEach((arch) => {
    const archIdx = Object.keys(ARCHETYPES).indexOf(arch);
    for (let i = 0; i < opts.runs; i += 1) jobs.push([arch, archIdx, i]);
  });
  const W = Math.max(1, Math.min(opts.workers || Math.max(1, Math.floor(os.availableParallelism() / 2)), jobs.length));
  const results = new Map(opts.archetypes.map((a) => [a, []]));
  const started = Date.now();
  let done = 0;
  return new Promise((resolve, reject) => {
    let next = 0;
    let live = 0;
    const CHUNK = 5;
    const spawn = () => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { opts } });
      live += 1;
      const feed = () => {
        if (next >= jobs.length) { w.postMessage(null); return; }
        const chunk = jobs.slice(next, next + CHUNK);
        next += CHUNK;
        w.postMessage(chunk);
      };
      w.on('message', (msg) => {
        for (const [arch, , i, r] of msg) results.get(arch)[i] = r; // by run index: output independent of worker timing
        done += msg.length;
        if (!opts.quiet) {
          const el = (Date.now() - started) / 1000;
          process.stderr.write(`\r${done}/${jobs.length} runs · ${el.toFixed(0)} s · ~${((el / done) * (jobs.length - done)).toFixed(0)} s left   `);
        }
        feed();
      });
      w.on('error', reject);
      w.on('exit', () => {
        live -= 1;
        if (live === 0) {
          if (!opts.quiet) process.stderr.write('\n');
          resolve(results);
        }
      });
      feed();
    };
    for (let i = 0; i < W; i += 1) spawn();
  });
}

function applyCharmPolicy(opts) {
  E.setConfig({ charms: { shop: opts.charm, season: opts.charm } });
  for (const [path, value] of opts.set || []) {
    const patch = {};
    const keys = path.split('.');
    let cur = patch;
    keys.slice(0, -1).forEach((k) => { cur = cur[k] = {}; });
    cur[keys[keys.length - 1]] = value;
    E.setConfig(patch);
  }
}

if (!isMainThread && workerData?.opts) {
  const { opts } = workerData;
  applyCharmPolicy(opts);
  parentPort.on('message', (chunk) => {
    if (chunk == null) { process.exit(0); }
    const out = chunk.map(([arch, archIdx, i]) => [arch, archIdx, i, simulateRun(arch, archIdx, i, opts)]);
    parentPort.postMessage(out);
  });
} else if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  applyCharmPolicy(opts);
  const t0 = Date.now();
  const results = await runJobs(opts);
  const summaries = opts.archetypes.map((a) => {
    const runs = results.get(a);
    return summarize(a, runs, opts.days);
  });
  console.log(formatTable(summaries, opts));
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s wall)`);
  if (opts.json) writeFileSync(opts.json, JSON.stringify({ opts, summaries }, null, 1));
}
