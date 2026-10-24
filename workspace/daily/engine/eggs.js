// Openable eggs (loot) and pet eggs (servings, charms, hatching, separate, combine).

import { CONFIG, TIER_LABELS, ULTRA } from './config.js';
import { TRINKETS } from './content.js';
import { computeEffects, globalPct, grantCoins, teamHatchLuck, TRINKET_TIER } from './effects.js';
import { hatchNeed, hatchOdds, petEggChance, petEggSplit } from './eggs-math.js';
import { canHouse, createPet, placePet, randomSpecies } from './pets.js';
import { discover } from './progress.js';
import { rBinomial, rIndex, rInt, rPick, rWeighted } from './rng.js';
import { startFlashSale } from './shop.js';
import { addPetEgg, addTrinket, fail, newId } from './state.js';

const bump = (ctx, key, n = 1) => {
  if (ctx.counters) ctx.counters[key] = (ctx.counters[key] || 0) + n;
};

function requireOpenEgg(s, id) {
  const egg = s.inv.openEggs.find((e) => e.id === id);
  if (!egg) fail('no_egg', 'That egg is not in your bag.');
  return egg;
}

export function requirePetEgg(s, id) {
  const egg = s.inv.petEggs.find((e) => e.id === id);
  if (!egg) fail('no_pet_egg', 'That pet egg is not in your bag.');
  return egg;
}

const trinketsOfTier = (tier) => TRINKETS.filter((t) => TRINKET_TIER[t.tier] === tier);

/** One non-pet loot item from the weighted table. Charms and trinkets need Epic+ eggs; otherwise coins. */
function rollLoot(s, tier, rng, fx) {
  const e = CONFIG.eggs;
  let kind = rWeighted(rng, e.loot).kind;
  const row = e.loot.find((l) => l.kind === kind);
  if (row.minTier != null && tier < row.minTier) kind = 'coins';
  switch (kind) {
    case 'coins': {
      const [lo, hi] = e.lootCoinRange;
      const raw = e.lootCoins[tier] * (lo + rng() * (hi - lo)) * (1 + globalPct(fx, 'lootCoinPct') / 100);
      const amount = grantCoins(s, Math.round(raw), 'loot', fx);
      return { kind: 'coins', amount };
    }
    case 'eggFood': {
      const amount = rInt(rng, e.eggFoodMin, e.eggFoodMax);
      const k = rIndex(rng, e.eggFoodTierSplit);
      const t = k === 0 ? tier : k === 1 ? Math.max(0, tier - 1) : Math.min(ULTRA, tier + 1);
      s.inv.eggFood[t] += amount;
      return { kind: 'eggFood', tier: t, amount };
    }
    case 'xpTreat': {
      const xp = e.treatXpPerTier * (tier + 1);
      const treat = { id: newId(s, 'xt'), tier, xp };
      s.inv.treats.push(treat);
      return { kind: 'xpTreat', tier, amount: xp, treatId: treat.id };
    }
    case 'diamonds': {
      const amount = e.lootDiamonds[tier];
      s.inv.diamonds += amount;
      return { kind: 'diamonds', amount };
    }
    case 'charm': {
      s.inv.charms.tier += 1; // full tier charms come from Epic+ egg loot
      return { kind: 'charm', charm: 'tier' };
    }
    case 'trinket': {
      // Uniform over eligible regular tiers ≤ egg tier (Epic..Legendary), then uniform within the tier.
      const tiers = [...new Set(Object.values(TRINKET_TIER))].filter((t) => t < ULTRA && t <= tier);
      const tt = rPick(rng, tiers);
      const def = rPick(rng, trinketsOfTier(tt));
      const inst = addTrinket(s, def.id);
      return { kind: 'trinket', tier: tt, trinket: { id: inst.id, defId: def.id, name: def.name, tier: tt } };
    }
    default:
      return { kind: 'coins', amount: 0 };
  }
}

/**
 * Open an openable egg. Items: 3 + Bin(9, .28) + the egg's snapshot bonus. The pet-egg roll happens once,
 * by source; an Ultra egg also rolls once for an Ultra trinket. Both take an item slot. The pet egg is last.
 */
export function openEgg(s, eggId, rng, ctx) {
  const egg = requireOpenEgg(s, eggId);
  s.inv.openEggs = s.inv.openEggs.filter((e) => e.id !== eggId);
  const fx = ctx.fx || computeEffects(s);
  const e = CONFIG.eggs;
  let n = e.itemBase + rBinomial(rng, e.itemTrials, e.itemP) + (egg.extraItems || 0);
  let petEggTier = null;
  if (rng() < petEggChance(egg.tier, egg.source, egg.petEggPct || 0)) {
    const k = rIndex(rng, petEggSplit(egg.tier, egg.source));
    petEggTier = Math.min(ULTRA, egg.tier + k);
    n -= 1;
  }
  let ultra = null;
  if (egg.tier === ULTRA && rng() < e.ultraTrinketChance) {
    ultra = rPick(rng, trinketsOfTier(ULTRA));
    n -= 1;
  }
  const items = [];
  for (let i = 0; i < n; i += 1) items.push(rollLoot(s, egg.tier, rng, fx));
  if (ultra) {
    const inst = addTrinket(s, ultra.id);
    items.push({ kind: 'trinket', tier: ULTRA, ultra: true, trinket: { id: inst.id, defId: ultra.id, name: ultra.name, tier: ULTRA } });
  }
  if (petEggTier != null) {
    const pe = addPetEgg(s, { tier: petEggTier, source: 'egg' });
    items.push({ kind: 'petEgg', tier: petEggTier, petEgg: { id: pe.id, tier: petEggTier } });
  }
  s.stats.eggsOpened += 1;
  bump(ctx, 'eggsOpened');
  const ev = { type: 'egg.opened', eggId, tier: egg.tier, source: egg.source, items };
  ctx.events?.push(ev);
  return ev;
}

export function petEggOdds(s, egg, fx) {
  fx = fx || computeEffects(s);
  return hatchOdds(egg.tier, egg.fed, { luckPts: teamHatchLuck(fx), charm: egg.charm, guaranteed: egg.guaranteed });
}

/** Feed one serving of egg food (any tier). Servings can't be taken back. */
export function feedPetEgg(s, petEggId, foodTier, ctx) {
  const egg = requirePetEgg(s, petEggId);
  if (!Number.isInteger(foodTier) || foodTier < 0 || foodTier > ULTRA) fail('bad_food', 'Pick an egg-food tier.');
  if (s.inv.eggFood[foodTier] < 1) fail('no_food', `You have no ${TIER_LABELS[foodTier]} egg food.`);
  const need = hatchNeed(egg);
  if (egg.fed.length >= need) fail('egg_full', 'This egg has all its servings. Hatch it.');
  s.inv.eggFood[foodTier] -= 1;
  egg.fed.push(foodTier);
  bump(ctx, 'servingsFed');
  const ev = { type: 'petEgg.fed', petEggId, servings: egg.fed.length, need, odds: petEggOdds(s, egg, ctx.fx) };
  ctx.events?.push(ev);
  return ev;
}

/**
 * Charm a pet egg. Rule implemented: any time before it hatches, at most one charm per egg. The egg then needs
 * 50 % more servings (rounded up). Sprout charms only fit Ordinary–Super Rare eggs. Ultra eggs can't go higher.
 */
export function charmPetEgg(s, petEggId, kind, ctx) {
  const egg = requirePetEgg(s, petEggId);
  if (kind !== 'tier' && kind !== 'sprout') fail('bad_charm', 'Unknown charm.');
  if (egg.charm) fail('charm_used', 'This egg already has a charm.');
  if (egg.tier >= ULTRA) fail('charm_useless', 'An Ultra egg is already the top tier.');
  if (kind === 'sprout' && egg.tier > CONFIG.hatch.sproutMaxTier) fail('sprout_tier', 'Sprout charms only fit Ordinary, Rare and Super Rare eggs.');
  if (s.inv.charms[kind] < 1) fail('no_charm', `You have no ${kind === 'tier' ? 'tier' : 'Sprout'} charm.`);
  s.inv.charms[kind] -= 1;
  egg.charm = kind;
  const ev = { type: 'petEgg.charmed', petEggId, charm: kind, need: hatchNeed(egg), odds: petEggOdds(s, egg, ctx.fx) };
  ctx.events?.push(ev);
  return ev;
}

/** Hatch: main roll from the live odds, then the charm's 20 % +1. Random unlocked species, level 1, 1★. */
export function hatchPetEgg(s, petEggId, rng, ctx) {
  const egg = requirePetEgg(s, petEggId);
  const need = hatchNeed(egg);
  if (egg.fed.length < need) fail('needs_food', `This egg needs ${need - egg.fed.length} more servings.`);
  // A hatch is never below the egg's tier, so an egg whose tier has a seat ability can always take its own seat.
  if (!canHouse(s, { tier: egg.tier, beacon: false })) fail('backpack_full', 'Your backpack is full. Release, merge or combine a pet first.');
  const fx = ctx.fx || computeEffects(s);
  const odds = hatchOdds(egg.tier, egg.fed, { luckPts: teamHatchLuck(fx), guaranteed: egg.guaranteed });
  const rolledTier = rIndex(rng, odds);
  let tier = rolledTier;
  let charmUpgraded = false;
  if (egg.charm && tier < ULTRA && rng() < CONFIG.hatch.charmChance) {
    tier += 1;
    charmUpgraded = true;
  }
  s.inv.petEggs = s.inv.petEggs.filter((e) => e.id !== petEggId);
  const prevHighest = s.stats.highestTier;
  const pet = createPet(s, { tier, species: randomSpecies(s, rng), rng, dayKey: ctx.dayKey, source: 'hatch' });
  placePet(s, pet);
  s.stats.petsHatched += 1;
  bump(ctx, 'hatched');
  ctx.events?.push({ type: 'petEgg.hatched', petEggId, pet: { id: pet.id, species: pet.species, name: pet.name, tier: pet.tier, location: pet.location }, rolledTier, charmUpgraded });
  discover(s, pet.species, pet.tier, ctx.dayKey, ctx.events);
  if (tier > prevHighest) s.stats.highestTier = tier;
  // Ultra flash sale trigger: the first-ever pet of a new highest tier (not the starter).
  if (prevHighest >= 0 && tier > prevHighest) startFlashSale(s, ctx.now, `newTier:${tier}`, ctx.events);
  return pet;
}

/** Separate: break a pet egg into egg food of its tier (servings already fed are lost). */
export function separatePetEgg(s, petEggId, ctx) {
  const egg = requirePetEgg(s, petEggId);
  const amount = CONFIG.hatch.separate[egg.tier];
  s.inv.petEggs = s.inv.petEggs.filter((e) => e.id !== petEggId);
  s.inv.eggFood[egg.tier] += amount;
  ctx.events?.push({ type: 'petEgg.separated', petEggId, tier: egg.tier, amount });
}

/** Combine two pet eggs of the same tier: success → one egg of the next tier; failure → both destroyed. */
export function combinePetEggs(s, aId, bId, rng, ctx) {
  if (aId === bId) fail('same_egg', 'Pick two different eggs.');
  const a = requirePetEgg(s, aId);
  const b = requirePetEgg(s, bId);
  if (a.tier !== b.tier) fail('tier_mismatch', 'Only eggs of the same tier can combine.');
  if (a.tier >= ULTRA) fail('ultra_combine', "Ultra eggs can't combine.");
  const chance = CONFIG.merge.combine[a.tier];
  s.inv.petEggs = s.inv.petEggs.filter((e) => e.id !== aId && e.id !== bId);
  const success = rng() < chance;
  let result = null;
  if (success) {
    const egg = addPetEgg(s, { tier: a.tier + 1, source: 'combine' });
    result = { petEgg: { id: egg.id, tier: egg.tier } };
  }
  s.stats.combines += 1;
  ctx.events?.push({ type: 'combine.result', kind: 'petEgg', success, chance, result });
  return { success, result };
}
