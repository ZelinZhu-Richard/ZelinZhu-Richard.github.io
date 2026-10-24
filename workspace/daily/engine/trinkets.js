// Trinkets (equip/unequip with the panel's stacking rules), Beacons, cosmetics, seats (activate/deactivate),
// renaming and XP treats: the per-pet inventory actions.

import { CONFIG } from './config.js';
import { isLuckTrinket, trinketTier } from './effects.js';
import {
  addXp, canSeat, normalizeSeats, seatBonus, tierCap,
} from './pets.js';
import { fail, requirePet } from './state.js';

export function equipTrinket(s, petId, trinketId, ctx) {
  const pet = requirePet(s, petId);
  const inst = s.inv.trinkets.find((t) => t.id === trinketId);
  if (!inst) fail('no_trinket', 'That trinket is not in your inventory.');
  if (pet.tier < CONFIG.trinkets.minPetTier) fail('trinket_tier', 'Only Epic or better pets can wear trinkets.');
  if (pet.trinkets.length >= CONFIG.trinkets.slots) fail('trinket_slots', `A pet has ${CONFIG.trinkets.slots} trinket slots.`);
  if (pet.trinkets.some((t) => t.defId === inst.defId)) fail('trinket_duplicate', 'This pet already wears that trinket.');
  if (isLuckTrinket(inst.defId) && pet.trinkets.some((t) => isLuckTrinket(t.defId))) fail('trinket_luck', 'A pet can wear only one luck trinket.');
  s.inv.trinkets = s.inv.trinkets.filter((t) => t.id !== trinketId);
  pet.trinkets.push(inst);
  ctx.events.push({ type: 'pet.equipped', petId, trinketId, defId: inst.defId, tier: trinketTier(inst.defId) });
}

export function unequipTrinket(s, petId, trinketId, ctx) {
  const pet = requirePet(s, petId);
  const inst = pet.trinkets.find((t) => t.id === trinketId);
  if (!inst) fail('no_trinket', 'This pet does not wear that trinket.');
  pet.trinkets = pet.trinkets.filter((t) => t.id !== trinketId);
  s.inv.trinkets.push(inst);
  ctx.events.push({ type: 'pet.unequipped', petId, trinketId, defId: inst.defId });
}

/** A Beacon makes a pet's seat ability work from the backpack. Attaching uses one; removing returns it. */
export function setBeacon(s, petId, on, ctx) {
  const pet = requirePet(s, petId);
  if (on) {
    if (pet.beacon) fail('beacon_on', 'This pet already has a Beacon.');
    if (seatBonus(pet) <= 0) fail('no_seat_ability', 'Only Super Rare or better pets have a seat ability for a Beacon to carry.');
    if (s.inv.beacons < 1) fail('no_beacon', 'You have no Beacon.');
    s.inv.beacons -= 1;
    pet.beacon = true;
  } else {
    if (!pet.beacon) fail('beacon_off', 'This pet has no Beacon.');
    pet.beacon = false;
    s.inv.beacons += 1;
  }
  ctx.events.push({ type: 'pet.beacon', petId, on: !!on });
  normalizeSeats(s, ctx.events);
}

export function activatePet(s, petId, ctx) {
  const pet = requirePet(s, petId);
  if (pet.location === 'active') fail('already_active', 'This pet is already in a seat.');
  // Checked as if it were already active: a seat-ability pet brings its own seat (PLAN §6).
  if (!canSeat(s, pet)) fail('no_seat', 'Every seat is taken. Move a pet to the backpack first.');
  pet.location = 'active';
  ctx.events.push({ type: 'pet.activated', petId });
  normalizeSeats(s, ctx.events);
}

/**
 * Move an active pet to the backpack. Never refused for a full backpack: like seat overflow, the backpack may go
 * over its cap (nothing is destroyed); only hatching and buying pets respect the cap (PLAN §6).
 */
export function deactivatePet(s, petId, ctx) {
  const pet = requirePet(s, petId);
  if (pet.location !== 'active') fail('not_active', 'This pet is already in the backpack.');
  pet.location = 'backpack';
  ctx.events.push({ type: 'pet.deactivated', petId });
  normalizeSeats(s, ctx.events);
}

export function renamePet(s, petId, name, ctx) {
  const pet = requirePet(s, petId);
  const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!clean) fail('bad_name', 'A name needs at least one character.');
  if ([...clean].length > CONFIG.pets.nameMax) fail('bad_name', `Names are at most ${CONFIG.pets.nameMax} characters.`);
  pet.name = clean;
  ctx.events.push({ type: 'pet.renamed', petId, name: clean });
}

/** Cosmetics are account-wide and permanent. With petId: that pet wears it; without: the default for every pet. */
export function setCosmetic(s, petId, cosmeticId, ctx) {
  if (cosmeticId != null && !s.cosmetics.includes(cosmeticId)) fail('no_cosmetic', "You don't own that cosmetic yet.");
  if (petId) {
    const pet = requirePet(s, petId);
    pet.cosmetic = cosmeticId ?? null;
  } else {
    s.cosmetic = cosmeticId ?? null;
  }
  ctx.events.push({ type: 'pet.cosmetic', petId: petId || null, cosmeticId: cosmeticId ?? null });
}

/** XP treat from egg loot: +100 × (tier + 1) XP to a pet of the owner's choice (normal XP rules apply). */
export function useTreat(s, petId, treatId, ctx) {
  const pet = requirePet(s, petId);
  const treat = s.inv.treats.find((t) => t.id === treatId);
  if (!treat) fail('no_treat', 'That XP treat is not in your bag.');
  if (pet.level >= tierCap(pet.tier)) fail('max_level', `${pet.name} is at its level cap; save the treat for another pet.`);
  s.inv.treats = s.inv.treats.filter((t) => t.id !== treatId);
  const gained = addXp(s, pet, treat.xp, ctx);
  ctx.events.push({ type: 'pet.treat', petId, treatId, xp: gained });
}

