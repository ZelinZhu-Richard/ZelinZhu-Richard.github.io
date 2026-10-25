// Daily: every tunable number (PLAN.md §2–13, CONTENT.md caps). Rules read numbers only from here.
// Every number is a default. Tier arrays are indexed Ordinary 0 … Ultra 6; level arrays Chill 0 … Goddamn 4.
// The balance script may patch values with setConfig() before running; the browser never does.

export const TIERS = ['ordinary', 'rare', 'superRare', 'epic', 'mythic', 'legendary', 'ultra'];
export const TIER_LABELS = ['Ordinary', 'Rare', 'Super Rare', 'Epic', 'Mythic', 'Legendary', 'Ultra'];
export const ULTRA = 6;
export const LEVELS = ['chill', 'easy', 'medium', 'hard', 'goddamn'];
export const LEVEL_LABELS = ['Chill', 'Easy', 'Medium', 'Hard', 'Goddamn'];
export const MEDIUM = 2;
export const HARD = 3;
export const GODDAMN = 4;

const DEFAULTS = {
  time: {
    zone: 'America/New_York',
    openMinute: 5 * 60, // 05:00
    closeMinute: 22 * 60, // 22:00
    undoMinutes: 5,
  },

  tasks: {
    minTasks: 1,
    maxTasks: 12,
    nameMax: 40,
    textMax: 120,
    foodPerAllEasyDay: 360, // base = round(360 / (2 × taskCount))
    qtyMult: [1, 1.5, 3, 5, 20],
    foodMult: [1, 2, 4, 12, 50],
    dayLevelMax: 3, // Goddamn is never a day level
    defaultDayLevel: 1, // Easy
    maxGoddamn: 2,
    physicalDurationCapLevel: 3, // physical durations stop growing above Hard
    commitBonus: 0.2,
    softCap: 1200,
    softCapRate: 0.5,
    swapsPerMonth: 1,
    swapReasonMax: 140,
    editsPerMonth: 5, // owner corrections to the locked list (list/edit), each logged with a reason
    qtyMax: 100000, // largest real amount a tick accepts
    unitMax: 20,
  },

  streak: {
    bands: [
      { from: 1, to: 9, tier: 0 },
      { from: 10, to: 99, tier: 1 },
      { from: 100, to: 999, tier: 2 },
      { from: 1000, to: 9999, tier: 3 },
    ],
    parts: 3, // count by thirds of the band: 1 / 2 / 3 eggs
    luckyDays: [10, 100, 1000],
    luckyMin: 5,
    luckyMax: 10,
  },

  penalties: {
    hungryLevels: 2,
    starvingLevels: 5,
    deathAtMiss: 3,
    underfedLevels: 1,
    upkeepLevels: 1,
    levelFloor: 1,
    backpackLossRate: 0.5,
    // PLAN.md §6 applies the underfed −1 and upkeep −1 at every close, and §4 the Hungry/Starving loss on an
    // incomplete day; read literally they stack (a fully missed day costs an unfed active pet 1 + 2 levels).
    // Set false to skip the underfed/upkeep loss on days that already take a Hungry/Starving/death penalty.
    underfedStacksWithHunger: true,
    // PLAN.md §4: a used freeze means "there's no penalty", so a frozen night skips the underfed −1 and the
    // upkeep −1 as well as Hungry/Starving. Set false to keep feeding losses on frozen nights (owner to confirm).
    freezeSkipsFeedingLosses: true,
  },

  freezes: { cap: 3, price: 600 },

  phoenix: { windowDays: 7, daysNeeded: 3, levelFactor: 0.5 },
  welcomeBackTier: 1, // Rare openable egg, streak-type odds

  pets: {
    levelCaps: [20, 30, 40, 55, 70, 85, 100],
    xpA: 50, // XP to next = xpA × L + xpB
    xpB: 50,
    meterSpeedPerLevel: 0.001,
    dividendPerLevel: 0.01,
    levelsPerItem: 10,
    maxLevelItems: 5,
    meterCap: [200, 600, 1800, 5400, 16200, 48600, 145800],
    need: 100,
    needMin: 70,
    upkeep: 10,
    dividendCoins: [5, 10, 20, 40, 80, 160, 320],
    dividendShards: [0, 0, 0, 2, 5, 10, 30],
    shardsPerDiamond: 10,
    skillLevels: [10, 25, 40, 55, 70, 85, 100],
    nameMax: 12,
    maxStars: 5,
    comebackBase: 2,
  },

  seats: {
    base: 3,
    prices: [150, 400, 1000], // diamonds
    abilityBonus: [0, 0, 1, 2, 3, 6, 12],
    maxActive: 15,
  },

  backpack: {
    base: 12,
    keeperLevelsPerSpace: 5,
    upgradePrices: [1000, 2000, 4000], // coins
    upgradeSize: 2,
  },

  eggs: {
    itemBase: 3,
    itemTrials: 9,
    itemP: 0.28,
    petEggChance: {
      laid: [0.35, 0.25, 0.12, 0.05, 0.035, 0.03, 0.03],
      other: [0.10, 0.05, 0.02, 0.01, 0.01, 0.01, 0.01], // streak / chest / season / welcome
    },
    laidSplit: [
      [0.825, 0.125, 0.05],
      [0.825, 0.125, 0.05],
      [0.88, 0.10, 0.02],
      [0.92, 0.07, 0.01],
      [0.94, 0.05, 0.01],
      [0.75, 0.25, 0],
      [1, 0, 0],
    ],
    otherSplit: [0.9, 0.1, 0],
    ultraTrinketChance: 0.1,
    loot: [
      { kind: 'coins', weight: 40 },
      { kind: 'eggFood', weight: 35 },
      { kind: 'xpTreat', weight: 12 },
      { kind: 'diamonds', weight: 8 },
      { kind: 'charm', weight: 0, minTier: 3 }, // Spec §7: 3 (Epic+ eggs only; otherwise coins). Owner set 0 on 2026-10-24 (balance dial; VALIDATION.md)
      { kind: 'trinket', weight: 2, minTier: 3 }, // Epic+ eggs only; otherwise coins
    ],
    lootCoins: [10, 20, 35, 60, 100, 160, 250],
    lootCoinRange: [0.5, 1.5],
    lootDiamonds: [1, 1, 2, 3, 5, 8, 12],
    eggFoodMin: 1,
    eggFoodMax: 3,
    eggFoodTierSplit: [0.70, 0.25, 0.05], // same / one lower / one higher
    treatXpPerTier: 100, // +100 × (tier + 1)
  },

  hatch: {
    servings: [5, 6, 8, 10, 12, 15, 20],
    baseUp: 0.05,
    foodBonus: 0.01, // 1% / 2^(j−1) to tier egg+j
    ownFloor: 0.5,
    charmChance: 0.2,
    charmServingsMult: 1.5,
    sproutMaxTier: 2, // Sprout charm: Ordinary–Super Rare eggs only
    separate: [3, 4, 5, 6, 8, 10, 12],
    releaseMult: 2,
  },

  // Which charm kind each source gives: 'tier' (spec §8/§12/§13) or 'sprout' (CONTENT.md H.2).
  // Epic+ egg loot always gives a full tier charm.
  charms: { shop: 'sprout', season: 'sprout' },

  merge: {
    mutation: 0.05,
    combine: [0.2, 0.1, 0.05, 0.025, 0.0125, 0.00625], // Ultra can't combine
  },

  trinkets: {
    slots: 5,
    minPetTier: 3,
    prices: [0, 0, 0, 150, 500, 1500, 0], // regular trinkets, diamonds
    ultraBase: 22000,
    flashDiscount: 0.3,
    flashFloor: 15000, // 10 × the Legendary trinket price
    flashHours: 24,
    flashStreaks: [100, 365, 1000],
    heartstoneRechargeDays: 30,
  },

  shop: {
    pets: { 3: 400, 4: 3000, 5: 15000 }, // diamonds
    petEggs: { 3: 250, 4: 2000, 5: 10000 }, // diamonds
    charm: 60, // diamonds
    beacon: 300, // diamonds
    rareFood: { count: 10, coins: 400 },
    superRareFood: { count: 5, diamonds: 30 },
  },

  quests: {
    perDay: 3,
    maxTimed: 1,
    noRepeatDays: 3,
    minCareTicks: 2,
    noWasteMax: 30,
    momentumWindowMin: 120,
    habitWindowMin: 60,
    frogDays: 7,
    targetDays: 14,
    lastMissDays: 14,
    historyDays: 14,
    weekStars: 5,
    chestTier: 1,
    chestDiamonds: 3,
    fourByMinTasks: 5,
    fourByTicks: 4,
    momentumMinTasks: 3,
    momentumTicks: 3,
    crackThreeEggs: 3,
    warmHandsServings: 3,
    halfByShare: 0.5,
  },

  keeper: {
    xpBase: 1000, // XP to next = 1000 + 250 × K
    xpPer: 250,
    coinsBase: 20, // coins on reaching K = 20 + 5 × K
    coinsPer: 5,
    bonusEvery: 10,
    bonusCoins: 250,
    every: 5,
    everyDiamonds: 10,
  },

  season: { firstMonth: '2026-11', tiers: 30, xpPerTier: 750 },

  petdex: { coinsPerTier: 100, diamonds: [0, 0, 0, 5, 10, 20, 50] },

  milestones: { days: [7, 30, 50, 100, 200, 365, 500, 1000] },

  // CONTENT.md B/D caps on the effect vocabulary.
  effectCaps: {
    pctPerPetPerType: 100,
    petEggChancePctPerPet: 50,
    teamHatchLuckPts: 3,
    commitBonusPts: 10,
    extraLootItems: 8,
    comebackBonus: 1, // 2× base + at most 1 → 3×
    shieldPerPetPerEvent: 1,
    globalPct: 100,
  },

  // Owner-edited real-life rewards catalogue (reward/save).
  rewards: { max: 100, nameMax: 60, idMax: 40, coinsMax: 1_000_000 },

  history: { graveyard: 24, redemptions: 500, swapLog: 60, fallenShown: 6 },
};

export const CONFIG = structuredClone(DEFAULTS);

function mergeInto(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      mergeInto(target[k], v);
    } else {
      target[k] = structuredClone(v);
    }
  }
}

/** Deep-merge a patch into the live config (balance script only). */
export function setConfig(patch) {
  mergeInto(CONFIG, patch);
  return CONFIG;
}

/** Restore every default. */
export function resetConfig() {
  for (const k of Object.keys(CONFIG)) delete CONFIG[k];
  Object.assign(CONFIG, structuredClone(DEFAULTS));
  return CONFIG;
}

export function defaultConfig() {
  return structuredClone(DEFAULTS);
}

export const levelIndex = (name) => LEVELS.indexOf(name);
export const tierIndex = (name) => TIERS.indexOf(name);
