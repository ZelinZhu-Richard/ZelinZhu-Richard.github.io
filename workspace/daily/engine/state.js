// State shape, schema version, small shared helpers (ids, wallet, inventory grants) and GameError.
// The state is plain JSON (structuredClone-safe), so it can be saved to localStorage or a JSONB column as is.

import { CONFIG } from './config.js';
import { REAL_LIFE, SPECIES } from './content.js';
import { seedFrom } from './rng.js';

export const SCHEMA_VERSION = 1;
export const SAVE_FORMAT = 'daily-save';

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}

export const fail = (code, message) => {
  throw new GameError(code, message);
};

export function emptyAggregate() {
  return { ticks: 0, pages: 0, outsideMin: 0, workouts: 0, sleepSum: 0, sleepN: 0, deepMin: 0, veg: 0, hardOrAbove: 0, food: 0 };
}

/** A blank state with no list. newGame() in game.js fills it in. */
export function createState({ seed, now }) {
  return {
    format: SAVE_FORMAT,
    version: SCHEMA_VERSION,
    createdAt: now,
    rng: { seed: seedFrom(seed), n: 0 },
    seq: 0,

    // calendar
    startDay: null, // first day that counts
    lastClosed: null, // last day whose 22:00 close was processed
    list: null, // { month, tasks: TaskDef[], swaps: number, lockedAt, edits?: [{ dayKey, taskId, changed, reason }] }
    nextList: null, // { month, tasks }
    swapLog: [], // public: [{ month, dayKey, fromId, fromName, toName, reason }]
    day: null, // the open day (see day.js openDayRecord)
    lastDay: null, // summary of the last closed day (morning receipt)

    // streak and outcomes
    streak: 0,
    best: 0,
    missRun: 0, // consecutive unfrozen incomplete days
    completeDays: 0, // lifetime complete days
    welcomePending: false, // first complete day after a death pays a Rare egg
    lastDeath: null, // dayKey
    ashes: null, // { pets: Pet[], petId, deathDay, deadlineDay, done }
    graveyard: [], // fallen pets that can't come back: [{ ...pet, diedOn }]
    flags: { lastOutcome: null },

    // pets and items
    pets: [],
    inv: {
      coins: 0,
      diamonds: 0,
      shards: 0,
      freezes: 0,
      eggFood: [0, 0, 0, 0, 0, 0, 0],
      charms: { tier: 0, sprout: 0 },
      beacons: 0,
      treats: [], // [{ id, tier, xp }]
      trinkets: [], // unequipped: [{ id, defId, usedAt? }]
      openEggs: [], // [{ id, tier, source, petId, extraItems, petEggPct, laidOn }]
      petEggs: [], // [{ id, tier, fed: [tiers], charm: null|'tier'|'sprout', guaranteed, source }]
    },
    cosmetics: [], // owned cosmetic ids (account-wide, survive death)
    cosmetic: null, // account-wide default cosmetic
    auraAddons: [],
    unlockedSpecies: SPECIES.filter((s) => s.unlock.type === 'launch').map((s) => s.id),

    // progress that can't be lost
    keeper: { level: 1, xp: 0, lifetimeFood: 0 },
    season: { month: null, xp: 0, tier: 0 },
    petdex: {}, // 'species:tier' → { firstDay }
    badges: [], // [{ id, name, days, dayKey }]
    quests: { week: { key: null, stars: 0, chest: false }, recent: [] }, // recent: [{ dayKey, ids }]
    history: [], // last N closed days: [{ key, complete, frozen, ticks: { taskId: { min, level, raised } }, unticked }]
    receipts: { months: {}, lifetime: emptyAggregate(), goals: {}, deepTags: {} },

    // shop and real life
    shop: { seatsBought: 0, backpackBought: 0, flashSale: null },
    rewards: REAL_LIFE.rewards.map((r) => ({ ...r })),
    redemptions: [],

    stats: { highestTier: -1, eggsOpened: 0, petsHatched: 0, deaths: 0, merges: 0, mutations: 0, combines: 0, foodEarned: 0 },
    settings: { reminders: { evening: true, morning: false, notify: false }, sound: false, motion: 'system', companionId: null },
  };
}

/** Schema migration hook. Version 1 is current; older saves would be upgraded here. */
export function migrate(state) {
  if (!state || state.format !== SAVE_FORMAT) throw new GameError('bad_save', 'This is not a Daily save file.');
  if (state.version === SCHEMA_VERSION) return state;
  if (state.version > SCHEMA_VERSION) throw new GameError('newer_save', 'This save comes from a newer version of Daily.');
  throw new GameError('old_save', `Save version ${state.version} can't be upgraded.`);
}

export function newId(s, prefix) {
  s.seq += 1;
  return `${prefix}${s.seq}`;
}

// ---- wallet --------------------------------------------------------------------------------------------

export function addShards(s, n) {
  if (n <= 0) return 0;
  s.inv.shards += n;
  const per = CONFIG.pets.shardsPerDiamond;
  const whole = Math.floor(s.inv.shards / per);
  if (whole > 0) {
    s.inv.shards -= whole * per;
    s.inv.diamonds += whole;
  }
  return whole;
}

export function spend(s, currency, amount, what) {
  const have = s.inv[currency];
  if (have < amount) fail(`not_enough_${currency}`, `${what} costs ${amount} ${currency}; you have ${have}.`);
  s.inv[currency] = have - amount;
}

export function addOpenEgg(s, { tier, source, petId = null, extraItems = 0, petEggPct = 0, dayKey = null }) {
  const egg = { id: newId(s, 'oe'), tier, source, petId, extraItems, petEggPct, laidOn: dayKey };
  s.inv.openEggs.push(egg);
  return egg;
}

export function addPetEgg(s, { tier, source, guaranteed = false, fed = [] }) {
  const egg = { id: newId(s, 'pe'), tier, fed: fed.slice(), charm: null, guaranteed, source };
  s.inv.petEggs.push(egg);
  return egg;
}

export function addTrinket(s, defId) {
  const t = { id: newId(s, 'tk'), defId, usedAt: null };
  s.inv.trinkets.push(t);
  return t;
}

export const findPet = (s, id) => s.pets.find((p) => p.id === id);

export function requirePet(s, id) {
  const pet = findPet(s, id);
  if (!pet) fail('no_pet', 'That pet is not here.');
  return pet;
}
