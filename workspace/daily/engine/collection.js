// Merge, combine and release pets (PLAN.md §9, §6). Pet-egg combine and separate are in eggs.js.

import { CONFIG, ULTRA } from './config.js';
import { createPet, normalizeSeats, placePet, tierCap } from './pets.js';
import { discover } from './progress.js';
import { rPick } from './rng.js';
import { fail, requirePet } from './state.js';

/** Return a pet's trinkets and Beacon to the inventory. */
function stripPet(s, pet) {
  for (const t of pet.trinkets) s.inv.trinkets.push(t);
  pet.trinkets = [];
  if (pet.beacon) {
    s.inv.beacons += 1;
    pet.beacon = false;
  }
}

const removePet = (s, id) => {
  s.pets = s.pets.filter((p) => p.id !== id);
};

/** Nine Lives is one charge per lineage: a descendant of a spent pet stays spent. */
const lineageSpent = (...pets) => pets.some((p) => p.nineLives === 'spent');

export function mergeOdds() {
  return { stars: 1, mutation: CONFIG.merge.mutation };
}

/**
 * Merge two pets of the same species, tier and stars: +1★ (max 5), 5 % mutation +1 tier keeping stars.
 * The result keeps the higher level (the higher-level pet is the survivor); the consumed pet's trinkets go back.
 */
export function mergePets(s, aId, bId, rng, ctx) {
  if (aId === bId) fail('same_pet', 'Pick two different pets.');
  const a = requirePet(s, aId);
  const b = requirePet(s, bId);
  if (a.species !== b.species || a.tier !== b.tier || a.stars !== b.stars) fail('merge_mismatch', 'Merging needs two pets of the same species, tier and stars.');
  if (a.stars >= CONFIG.pets.maxStars) fail('max_stars', 'These pets already have 5 stars.');
  const [keep, gone] = b.level > a.level ? [b, a] : [a, b];
  const spent = lineageSpent(a, b);
  stripPet(s, gone);
  removePet(s, gone.id);
  keep.stars += 1;
  let mutated = false;
  if (keep.tier < ULTRA && rng() < CONFIG.merge.mutation) {
    keep.tier += 1;
    mutated = true;
    s.stats.mutations += 1;
  }
  keep.level = Math.min(keep.level, tierCap(keep.tier));
  if (spent) keep.nineLives = 'spent';
  else if (keep.stars >= CONFIG.pets.maxStars && keep.nineLives === 'none') keep.nineLives = 'charged';
  s.stats.merges += 1;
  ctx.events.push({ type: 'pet.merged', petId: keep.id, consumedId: gone.id, stars: keep.stars, tier: keep.tier, mutated });
  if (mutated) discover(s, keep.species, keep.tier, ctx.dayKey, ctx.events);
  normalizeSeats(s, ctx.events);
  return keep;
}

/**
 * Combine two pets of the same tier but different species. Success → one next-tier pet (random species from
 * the two, level 1, 1★); failure → both destroyed. Trinkets and Beacons go back to the inventory either way.
 */
export function combinePets(s, aId, bId, rng, ctx) {
  if (aId === bId) fail('same_pet', 'Pick two different pets.');
  const a = requirePet(s, aId);
  const b = requirePet(s, bId);
  if (a.tier !== b.tier) fail('tier_mismatch', 'Combining needs two pets of the same tier.');
  if (a.species === b.species) fail('same_species', 'Combining needs two different species (merge same-species pets).');
  if (a.tier >= ULTRA) fail('ultra_combine', "Ultra pets can't combine.");
  const chance = CONFIG.merge.combine[a.tier];
  const spent = lineageSpent(a, b);
  stripPet(s, a);
  stripPet(s, b);
  removePet(s, a.id);
  removePet(s, b.id);
  const success = rng() < chance;
  let result = null;
  if (success) {
    const species = rPick(rng, [a.species, b.species]);
    const pet = createPet(s, { tier: a.tier + 1, species, rng, dayKey: ctx.dayKey, source: 'combine' });
    if (spent) pet.nineLives = 'spent';
    placePet(s, pet);
    result = { pet: { id: pet.id, species: pet.species, name: pet.name, tier: pet.tier, location: pet.location } };
  }
  s.stats.combines += 1;
  ctx.events.push({ type: 'combine.result', kind: 'pet', success, chance, consumed: [a.id, b.id], result });
  if (result) discover(s, result.pet.species, result.pet.tier, ctx.dayKey, ctx.events);
  normalizeSeats(s, ctx.events);
  return { success, result };
}

/** Release a pet: 2 × its separate-yield in egg food of its tier. */
export function releasePet(s, petId, ctx) {
  const pet = requirePet(s, petId);
  stripPet(s, pet);
  removePet(s, petId);
  const amount = CONFIG.hatch.separate[pet.tier] * CONFIG.hatch.releaseMult;
  s.inv.eggFood[pet.tier] += amount;
  ctx.events.push({ type: 'pet.released', petId, tier: pet.tier, eggFood: amount });
  normalizeSeats(s, ctx.events);
}
