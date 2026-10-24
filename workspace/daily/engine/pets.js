// Pets: creation and names, levels and the XP curve, comeback XP, growth (XP + egg meter + laying),
// level loss, dividends, seats (base, bought, ability seats, Beacon, overflow), backpack cap, moods.

import { CONFIG, TIER_LABELS } from './config.js';
import { SPECIES } from './content.js';
import {
  computeEffects, petComebackBonus, petEggChancePct, petExtraItems, petNeed, petPct, petShield,
} from './effects.js';
import { addOpenEgg, newId } from './state.js';

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((sp) => [sp.id, sp]));

export const tierCap = (tier) => CONFIG.pets.levelCaps[tier];
export const xpNext = (level) => CONFIG.pets.xpA * level + CONFIG.pets.xpB;

/** Total XP represented by (level, xp). */
export function cumulativeXp(level, xp = 0) {
  const { xpA, xpB } = CONFIG.pets;
  const L = level - 1; // sum over l = 1..L of (xpA·l + xpB)
  return (xpA * L * (L + 1)) / 2 + xpB * L + xp;
}

// ---- names -----------------------------------------------------------------------------------------------

function roman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of map) while (n >= v) { out += r; n -= v; }
  return out;
}

export function usedNames(s) {
  const names = new Set(s.pets.map((p) => p.name));
  for (const p of s.ashes?.pets || []) names.add(p.name);
  return names;
}

/** An unused name from the species pool; when the pool runs out, "Ember II", "Ember III" … */
export function pickName(s, species, rng) {
  const pool = SPECIES_BY_ID[species].namePool;
  const used = usedNames(s);
  const free = pool.filter((n) => !used.has(n));
  if (free.length) return free[Math.floor(rng() * free.length)];
  for (let k = 2; k < 1000; k += 1) {
    const options = pool.map((n) => `${n} ${roman(k)}`).filter((n) => !used.has(n));
    if (options.length) return options[Math.floor(rng() * options.length)];
  }
  return `${pool[0]} ${s.seq}`;
}

export function randomSpecies(s, rng) {
  const list = s.unlockedSpecies;
  return list[Math.floor(rng() * list.length)];
}

/** A new pet at level 1 and 1★. Not placed yet (see placePet). */
export function createPet(s, { tier, species, rng, dayKey = null, source = 'hatch', name = null }) {
  return {
    id: newId(s, 'p'),
    species,
    name: name || pickName(s, species, rng),
    tier,
    stars: 1,
    level: 1,
    xp: 0,
    comebackOwed: 0,
    meter: 0,
    location: 'backpack',
    beacon: false,
    cosmetic: null,
    trinkets: [],
    fed: { day: null, amount: 0 },
    hungrySince: null,
    lastLoss: null,
    nineLives: 'none', // 'none' | 'charged' | 'spent' — one charge per lineage, ever
    born: dayKey,
    source,
  };
}

// ---- seats and backpack ---------------------------------------------------------------------------------

/** Extra seats a pet's seat ability adds (SR +1 … Ultra +12). The pet also brings its own seat while active. */
export const seatBonus = (pet) => CONFIG.seats.abilityBonus[pet.tier] || 0;
const seatAbilityOn = (pet) => pet.location === 'active' || pet.beacon;
/** Seats a pet's ability adds, given where it is: its own seat (active only) plus the extras (active or Beacon). */
function abilitySeats(pet, active) {
  const bonus = seatBonus(pet);
  if (bonus <= 0) return 0;
  return (active ? 1 : 0) + (active || pet.beacon ? bonus : 0);
}

/**
 * Seats (PLAN §6). A seat-ability pet (Super Rare+) brings its own seat plus its extra seats while active, so it
 * never needs a free seat; with a Beacon in the backpack it brings only the extras. fromAbilities counts both
 * (ownSeats of them are the pets' own). total = min(15, base + bought + fromAbilities).
 */
export function seatInfo(s) {
  const base = CONFIG.seats.base;
  const bought = s.shop.seatsBought;
  let fromAbilities = 0;
  let ownSeats = 0;
  for (const p of s.pets) {
    if (!seatAbilityOn(p)) continue;
    fromAbilities += abilitySeats(p, p.location === 'active');
    if (p.location === 'active' && seatBonus(p) > 0) ownSeats += 1;
  }
  const uncapped = base + bought + fromAbilities;
  const total = Math.min(CONFIG.seats.maxActive, uncapped);
  const used = s.pets.filter((p) => p.location === 'active').length;
  return { base, bought, fromAbilities, ownSeats, total, used, max: CONFIG.seats.maxActive, uncapped };
}

export function backpackCap(s) {
  const b = CONFIG.backpack;
  return b.base + Math.floor(s.keeper.level / b.keeperLevelsPerSpace) + s.shop.backpackBought * b.upgradeSize;
}

export const backpackCount = (s) => s.pets.filter((p) => p.location === 'backpack').length;
export const hasFreeSeat = (s) => {
  const seats = seatInfo(s);
  return seats.used < seats.total;
};

/**
 * Could this pet take a seat? Checked as if it were already active: its own seat and extras count (extras only
 * once if a Beacon already counts them), and the 15-pet cap still holds. `pet` may be a new pet not in s.pets yet,
 * or a stand-in like { tier } (a shop pet, or the lowest tier an egg can hatch).
 */
export function canSeat(s, pet) {
  if (pet.location === 'active' && s.pets.includes(pet)) return true;
  const seats = seatInfo(s);
  const counted = s.pets.includes(pet) && pet.beacon ? seatBonus(pet) : 0; // already in fromAbilities
  const total = Math.min(CONFIG.seats.maxActive, seats.uncapped - counted + abilitySeats(pet, true));
  return seats.used + 1 <= total;
}

/** Room for one more pet: a seat it can take (see canSeat; any free seat without `pet`), or backpack space. */
export const canHouse = (s, pet = null) => (pet ? canSeat(s, pet) : hasFreeSeat(s)) || backpackCount(s) < backpackCap(s);

/** Put a new pet in a seat if it can take one (its own seat counts), else the backpack. The caller checks canHouse(). */
export function placePet(s, pet) {
  pet.location = canSeat(s, pet) ? 'active' : 'backpack';
  s.pets.push(pet);
  return pet.location;
}

const benchOrder = (a, b) => a.tier - b.tier || a.level - b.level || a.stars - b.stars || (b.id > a.id ? 1 : b.id < a.id ? -1 : 0);

/** If seats dropped (death, move, Beacon removed), the lowest-tier active pets move to the backpack. */
export function normalizeSeats(s, events) {
  for (let guard = 0; guard < 100; guard += 1) {
    const seats = seatInfo(s);
    if (seats.used <= seats.total) return;
    const active = s.pets.filter((p) => p.location === 'active').sort(benchOrder);
    const pet = active[0];
    pet.location = 'backpack';
    events?.push({ type: 'pet.benched', petId: pet.id, reason: 'seats' });
  }
}

// ---- XP, growth, laying ----------------------------------------------------------------------------------

function bump(ctx, key, n = 1) {
  if (ctx.counters) ctx.counters[key] = (ctx.counters[key] || 0) + n;
}

/**
 * Give XP to a pet: xpPct (active only), then comeback (2× + bonus, ≤ 3×) while it owes lost XP.
 * Returns XP gained. Levels up to the tier cap; XP at the cap is discarded.
 */
export function addXp(s, pet, base, ctx) {
  if (!(base > 0)) return 0;
  const fx = ctx.fx || computeEffects(s);
  const raw = base * (1 + petPct(fx, pet, 'xpPct') / 100);
  let gained;
  if (pet.comebackOwed > 0) {
    const mult = CONFIG.pets.comebackBase + petComebackBonus(fx, pet);
    const boosted = Math.floor(raw * mult);
    if (boosted <= pet.comebackOwed) {
      gained = boosted;
      pet.comebackOwed -= boosted;
    } else {
      gained = pet.comebackOwed + Math.floor(raw - pet.comebackOwed / mult);
      pet.comebackOwed = 0;
    }
    bump(ctx, 'comebackXp', gained);
  } else {
    gained = Math.floor(raw);
  }
  if (gained <= 0) return 0;
  const cap = tierCap(pet.tier);
  if (pet.level >= cap) {
    pet.xp = 0;
    ctx.events?.push({ type: 'pet.xp', petId: pet.id, xp: 0, capped: true });
    return 0;
  }
  pet.xp += gained;
  ctx.events?.push({ type: 'pet.xp', petId: pet.id, xp: gained });
  while (pet.level < cap && pet.xp >= xpNext(pet.level)) {
    pet.xp -= xpNext(pet.level);
    pet.level += 1;
    bump(ctx, 'levelUps');
    ctx.events?.push({ type: 'pet.levelUp', petId: pet.id, level: pet.level });
  }
  if (pet.level >= cap) pet.xp = 0;
  return gained;
}

export function meterMult(fx, pet) {
  return (1 + petPct(fx, pet, 'eggMeterPct') / 100) * (1 + CONFIG.pets.meterSpeedPerLevel * pet.level);
}

export const meterCap = (pet) => CONFIG.pets.meterCap[pet.tier];

/** Items a laid egg gets on top of 3 + Bin(9, .28): 1 per 10 levels (≤ 5) plus extraLootItems (≤ 8). */
export function laidExtraItems(fx, pet) {
  const lv = Math.min(CONFIG.pets.maxLevelItems, Math.floor(pet.level / CONFIG.pets.levelsPerItem));
  return lv + petExtraItems(fx, pet);
}

/** Growth food (food beyond 100, or the commitment bonus): XP and egg meter, 1:1. Lays eggs as meters fill. */
export function addGrowth(s, pet, amount, ctx) {
  if (!(amount > 0)) return;
  const fx = ctx.fx || computeEffects(s);
  addXp(s, pet, amount, ctx);
  const gain = Math.floor(amount * meterMult(fx, pet));
  pet.meter += gain;
  while (pet.meter >= meterCap(pet)) {
    pet.meter -= meterCap(pet);
    // Item count and luck are fixed when the egg is laid (CONTENT.md D "Snapshots").
    const egg = addOpenEgg(s, {
      tier: pet.tier,
      source: 'laid',
      petId: pet.id,
      extraItems: laidExtraItems(fx, pet),
      petEggPct: petEggChancePct(fx, pet),
      dayKey: ctx.dayKey,
    });
    bump(ctx, 'eggsLaid');
    ctx.events?.push({ type: 'egg.laid', eggId: egg.id, tier: egg.tier, petId: pet.id });
  }
}

export const fedToday = (pet, key) => (key && pet.fed.day === key ? pet.fed.amount : 0);

/**
 * Lose levels. Hungry/Starving can be shielded (≤ 1 level per pet per event, active pets only).
 * The lost XP is owed back as comeback XP. Level floor 1.
 */
export function loseLevels(s, pet, levels, reason, ctx, { shieldable = false } = {}) {
  const fx = ctx.fx || computeEffects(s);
  const shield = shieldable ? petShield(fx, pet) : 0;
  const n = Math.max(0, levels - shield);
  pet.hungrySince = ctx.dayKey;
  if (n === 0) {
    ctx.events?.push({ type: 'pet.levelDown', petId: pet.id, levels: 0, reason, shielded: shield });
    return 0;
  }
  const before = cumulativeXp(pet.level, pet.xp);
  const to = Math.max(CONFIG.penalties.levelFloor, pet.level - n);
  const dropped = pet.level - to;
  pet.level = to;
  pet.xp = 0;
  const lost = before - cumulativeXp(pet.level, 0);
  pet.comebackOwed += lost;
  pet.lastLoss = { dayKey: ctx.dayKey, levels: dropped, reason };
  ctx.events?.push({ type: 'pet.levelDown', petId: pet.id, levels: dropped, reason, shielded: shield, xpLost: lost });
  return dropped;
}

/** Daily dividend for a fed active pet: coins × (1 + 1 %/level) × dividendPct; Epic+ also shards × shardPct. */
export function dividendOf(fx, pet) {
  const p = CONFIG.pets;
  const coins = Math.round(p.dividendCoins[pet.tier] * (1 + p.dividendPerLevel * pet.level) * (1 + petPct(fx, pet, 'dividendPct') / 100));
  const shards = Math.floor(p.dividendShards[pet.tier] * (1 + petPct(fx, pet, 'shardPct') / 100));
  return { coins, shards };
}

// ---- moods (CONTENT.md A.1) ----------------------------------------------------------------------------

/**
 * healthy | happy | hungry | starving. dead/ashes are for fallen pets (see view.js).
 * Distress only follows processed closes; unspent food during an open day never causes it.
 */
export function moodOf(s, pet, fx) {
  if (s.missRun >= 2) return 'starving';
  const key = s.day?.key || s.lastDay?.key || null;
  if (key && fedToday(pet, key) >= petNeed(fx, pet) && pet.hungrySince !== key) return 'happy';
  if (pet.hungrySince) return 'hungry';
  return 'healthy';
}

export const tierLabel = (t) => TIER_LABELS[t];
