// The effect vocabulary (CONTENT.md B–D) and every cap the design panel added.
//
// Sources: species skills (active pet, current level ≥ unlock level), star abilities (active pet, stars ≥ n),
// trinkets (active Epic+ wearer). A Beacon never extends any of these (it extends seat abilities only).
// Scopes: self (that pet), team (every active pet), global (account-wide).
// Caps (config.effectCaps):
//   - percentage effects per pet per type ≤ +100 % (xpPct, eggMeterPct, dividendPct, shardPct);
//   - petEggChancePct per pet ≤ +50 % relative;
//   - team hatchLuckPts ≤ +3 pts;
//   - commitBonusPts ≤ +10 pts;
//   - extraLootItems from effects ≤ +8 per egg (the level bonus is separate, ≤ +5);
//   - comebackMult bonus ≤ +1 (2× base → 3× max);
//   - levelLossShield prevents ≤ 1 level per pet per Hungry/Starving event (never underfed/upkeep);
//   - the same global or team effect from the same skill/trinket counts once however many pets run it;
//   - foodNeedReduce never takes the fed threshold below 70.
// deathSave (5★ Nine Lives, Heartstone) is handled by close.js, not aggregated here.

import { CONFIG } from './config.js';
import { SKILLS, STAR_ABILITIES, TRINKETS } from './content.js';

export const TRINKET_DEFS = Object.fromEntries(TRINKETS.map((t) => [t.id, t]));
export const TRINKET_TIER = { epic: 3, mythic: 4, legendary: 5, ultra: 6 };
export const trinketTier = (defId) => TRINKET_TIER[TRINKET_DEFS[defId]?.tier] ?? -1;
export const isLuckTrinket = (defId) => (TRINKET_DEFS[defId]?.tags || []).includes('luck');

/** Every ability source a pet has right now, whether or not it is active. */
export function petSources(pet) {
  const out = [];
  for (const sk of SKILLS[pet.species] || []) {
    if (pet.level >= sk.lv) out.push({ kind: 'skill', id: sk.id, name: sk.name, text: sk.desc, effects: sk.effects });
  }
  for (const st of STAR_ABILITIES) {
    if (pet.stars >= st.stars) out.push({ kind: 'star', id: st.id, name: st.name, text: st.desc, effects: st.effects });
  }
  if (pet.tier >= CONFIG.trinkets.minPetTier) {
    for (const inst of pet.trinkets) {
      const def = TRINKET_DEFS[inst.defId];
      if (def) out.push({ kind: 'trinket', id: def.id, name: def.name, text: def.flavour, effects: def.effects, instanceId: inst.id });
    }
  }
  return out;
}

/** Aggregate the effects of every active pet. Pure; call again after any change to pets. */
export function computeEffects(s) {
  const self = {};
  const team = {};
  const global = {};
  const streakEggBonus = [];
  const seen = new Set();
  for (const pet of s.pets) {
    if (pet.location !== 'active') continue;
    for (const src of petSources(pet)) {
      for (const e of src.effects) {
        if (e.type === 'deathSave') continue;
        if (e.scope === 'self') {
          const bag = (self[pet.id] ||= {});
          bag[e.type] = (bag[e.type] || 0) + e.value;
          continue;
        }
        const key = `${e.scope}|${src.kind}|${src.id}|${e.type}`;
        if (seen.has(key)) continue; // same skill/trinket doesn't stack
        seen.add(key);
        if (e.type === 'streakEggBonus') {
          streakEggBonus.push({ value: e.value, everyN: e.everyN, source: src.id });
          continue;
        }
        const bag = e.scope === 'team' ? team : global;
        bag[e.type] = (bag[e.type] || 0) + e.value;
      }
    }
  }
  return { self, team, global, streakEggBonus };
}

const caps = () => CONFIG.effectCaps;

function petRaw(fx, pet, type) {
  if (!pet || pet.location !== 'active') return 0;
  return ((fx.self[pet.id] || {})[type] || 0) + (fx.team[type] || 0);
}

/** xpPct, eggMeterPct, dividendPct, shardPct for one pet (self + team), capped. */
export const petPct = (fx, pet, type) => Math.min(caps().pctPerPetPerType, petRaw(fx, pet, type));
export const petEggChancePct = (fx, pet) => Math.min(caps().petEggChancePctPerPet, petRaw(fx, pet, 'petEggChancePct'));
export const petShield = (fx, pet) => Math.min(caps().shieldPerPetPerEvent, petRaw(fx, pet, 'levelLossShield'));
export const petComebackBonus = (fx, pet) => Math.min(caps().comebackBonus, petRaw(fx, pet, 'comebackMult'));
export const petExtraItems = (fx, pet) => Math.min(caps().extraLootItems, petRaw(fx, pet, 'extraLootItems'));
export const teamHatchLuck = (fx) => Math.min(caps().teamHatchLuckPts, fx.team.hatchLuckPts || 0);
export const globalPct = (fx, type) => Math.min(caps().globalPct, fx.global[type] || 0);
export const commitBonusPts = (fx) => Math.min(caps().commitBonusPts, fx.global.commitBonusPts || 0);

/** Fed / dividend threshold. XP and the egg meter still only take food beyond config.pets.need. */
export function petNeed(fx, pet) {
  const reduce = petRaw(fx, pet, 'foodNeedReduce');
  return Math.max(CONFIG.pets.needMin, CONFIG.pets.need - reduce);
}

/** Food each backpack pet costs per day. */
export function upkeepCost(fx) {
  return Math.max(0, CONFIG.pets.upkeep - (fx.global.upkeepReduce || 0));
}

/** Extra streak eggs on a complete night with streak `days`. */
export function streakEggBonusFor(fx, days) {
  return fx.streakEggBonus.reduce((sum, b) => sum + (days % b.everyN === 0 ? b.value : 0), 0);
}

/** Coins earned from dividends, egg loot and quests get the global coinPct shine. Returns the amount granted. */
export function grantCoins(s, amount, kind, fx) {
  let n = amount;
  if (kind === 'dividend' || kind === 'loot' || kind === 'quest') n = amount * (1 + globalPct(fx || computeEffects(s), 'coinPct') / 100);
  n = Math.round(n);
  s.inv.coins += n;
  return n;
}
