// Pure egg math shared by the rules and the views: hatch odds (food bonuses, 50 % floor, fold above Ultra,
// hatch luck, charm), servings needed, item-count distribution, pet-egg chance and tier splits.

import { CONFIG, ULTRA } from './config.js';

/** Servings a pet egg needs: base by tier, +50 % (rounded up) with a charm. */
export function hatchNeed(egg) {
  const base = CONFIG.hatch.servings[egg.tier];
  return egg.charm ? Math.ceil(base * CONFIG.hatch.charmServingsMult) : base;
}

/**
 * Live hatch odds: [7 probabilities].
 * Base 95 % own tier / 5 % one higher. Each serving k tiers above the egg adds 1 % / 2^(j−1) to tier egg+j for
 * j = 1..k (anything above Ultra folds into Ultra). Team hatch luck adds pts to egg+1. Bonuses come out of the
 * own-tier share, which never drops below 50 %. A charm then gives a 20 % chance of +1 tier.
 * opts: { luckPts = 0, charm = null, guaranteed = false }
 */
export function hatchOdds(eggTier, foodTiers = [], opts = {}) {
  const h = CONFIG.hatch;
  let probs = new Array(7).fill(0);
  if (opts.guaranteed || eggTier >= ULTRA) {
    probs[eggTier] = 1;
  } else {
    probs[eggTier] = 1 - h.baseUp;
    probs[eggTier + 1] = h.baseUp;
    const bonus = new Array(7).fill(0);
    for (const f of foodTiers) {
      const k = f - eggTier;
      for (let j = 1; j <= k; j += 1) bonus[Math.min(ULTRA, eggTier + j)] += h.foodBonus / 2 ** (j - 1);
    }
    bonus[eggTier + 1] += (opts.luckPts || 0) / 100;
    const total = bonus.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const room = probs[eggTier] - h.ownFloor;
      const scale = total > room ? room / total : 1;
      for (let t = 0; t < 7; t += 1) if (t !== eggTier) probs[t] += bonus[t] * scale;
      probs[eggTier] -= total * scale;
    }
  }
  if (opts.charm && eggTier < ULTRA) {
    const out = new Array(7).fill(0);
    for (let t = 0; t < 7; t += 1) {
      out[t] += probs[t] * (1 - h.charmChance);
      out[Math.min(ULTRA, t + 1)] += probs[t] * h.charmChance;
    }
    probs = out;
  }
  return probs.map((p) => Math.max(0, p));
}

/** Pet-egg chance for an openable egg (relative luck bonus applies to laid eggs; capped upstream). */
export function petEggChance(tier, source, petEggPct = 0) {
  const table = source === 'laid' ? CONFIG.eggs.petEggChance.laid : CONFIG.eggs.petEggChance.other;
  return Math.min(1, table[tier] * (1 + petEggPct / 100));
}

/** [same, +1, +2] split for the pet egg inside an openable egg. */
export function petEggSplit(tier, source) {
  return source === 'laid' ? CONFIG.eggs.laidSplit[tier] : CONFIG.eggs.otherSplit;
}

/** P(item count = 3 + k) for k = 0..9 (before level/effect bonuses). */
export function itemCountDistribution() {
  const { itemTrials: n, itemP: p, itemBase } = CONFIG.eggs;
  const out = [];
  let c = 1;
  for (let k = 0; k <= n; k += 1) {
    if (k > 0) c = (c * (n - k + 1)) / k;
    out.push({ items: itemBase + k, p: c * p ** k * (1 - p) ** (n - k) });
  }
  return out;
}
