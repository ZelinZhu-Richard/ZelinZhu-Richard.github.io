// Hand-written view-model fixtures matching ARCHITECTURE.md's view-model contract.
// Fictional sample data only. Used by the UI tests, the local ?fixtures= dev mode and the
// build's preview snapshot until the engine is wired. Never deployed (build allowlist).
const H = 3600000;
const LEVEL_FOOD = { chill: 30, easy: 60, medium: 120, hard: 360, goddamn: 1500 };

export const LADDER = {
  levels: ['chill', 'easy', 'medium', 'hard', 'goddamn'],
  rows: [
    { taskId: 'sleep', name: 'Sleep', note: 'last night · only ever more sleep', cells: { chill: '7 h', easy: '7 h, in bed by 12:30', medium: '7.5 h, no phone after 11:30', hard: '8 h, in bed by 11', goddamn: '8 h, in bed by 10:30, no screens after 9:30' } },
    { taskId: 'grass', name: 'Touch grass', cells: { chill: '15 min', easy: '23 min', medium: '45 min', hard: '1.3 h', goddamn: '5 h' } },
    { taskId: 'read', name: 'Read', cells: { chill: '15 pages', easy: '23 pages', medium: '45 pages', hard: '75 pages', goddamn: '300 pages' } },
    { taskId: 'veg', name: 'Eat vegetables', note: 'quality', cells: { chill: 'One serving', easy: 'At two meals', medium: 'Every meal, no fried food', hard: 'Every meal, no added sugar', goddamn: 'Every meal, no sugar, home-cooked' } },
    { taskId: 'workout', name: 'Work out', note: 'physical · capped', cells: { chill: '15 min', easy: '23 min', medium: '45 min', hard: '1.3 h', goddamn: '1.3 h with intervals (harder, not longer)' } },
    { taskId: 'deep', name: 'Deep work', cells: { chill: '30 min', easy: '45 min', medium: '1.5 h', hard: '2.5 h', goddamn: '10 h' } },
  ],
  foodRow: { ...LEVEL_FOOD },
};

const cell = (id, level) => LADDER.rows.find(r => r.taskId === id).cells[level];
const above = level => LADDER.levels.slice(LADDER.levels.indexOf(level) + 1);

function task(id, name, { type = 'quantity', physical = false, unit = null, level = 'easy', ticked = false, tickedAt = null, canUndo = false, purpose, goal = null, patron = [], note } = {}) {
  return {
    id, name, type, physical, unit, level, levelLabel: level[0].toUpperCase() + level.slice(1), amountText: cell(id, level),
    food: LEVEL_FOOD[level], ticked, tickedAt, canUndo, raiseTo: ticked ? [] : above(level), purpose, goal, patron, note,
  };
}

export function ownerViews(now = Date.UTC(2026, 10, 12, 20, 30)) {
  const tasks = [
    task('sleep', 'Sleep', { type: 'quality', ticked: true, tickedAt: now - 7 * H, purpose: "Protect tomorrow's focus.", note: 'last night' }),
    task('grass', 'Touch grass', { unit: 'min', ticked: true, tickedAt: now - 2 * H, purpose: 'Make room to think.', patron: ['p-pip'] }),
    task('read', 'Read', { unit: 'pages', level: 'medium', purpose: 'Build range.', goal: 'Goal A: finish the reading list' }),
    task('veg', 'Eat vegetables', { type: 'quality', ticked: true, tickedAt: now - 3 * 60000, canUndo: true, purpose: 'Take care of the engine.', patron: ['p-mochi'] }),
    task('workout', 'Work out', { unit: 'min', physical: true, purpose: 'Build strength steadily.', patron: ['p-ember'] }),
    task('deep', 'Deep work', { unit: 'min', purpose: 'Move one important thing forward.', goal: 'Goal B: ship the side project' }),
  ];
  const earned = tasks.filter(t => t.ticked).reduce((n, t) => n + t.food, 0);
  const planned = tasks.reduce((n, t) => n + t.food, 0);
  const fed = { 'p-ember': 60, 'p-mochi': 0, 'p-pip': 0 };
  const spent = Object.values(fed).reduce((a, b) => a + b, 0);
  const window = { phase: 'open', opensAt: Date.UTC(2026, 10, 12, 10, 0), closesAt: Date.UTC(2026, 10, 13, 3, 0) };

  const header = {
    streak: 23, best: 41, tonight: { tier: 1, count: 1, lucky: false }, nextStep: { count: 2, day: 40 },
    freezes: 1, freezeCap: 3, window, keeper: { level: 14, xp: 2800, xpNext: 4500 }, hunger: 'fed', ashes: null,
  };

  const today = {
    dayKey: '2026-11-12', listMonth: '2026-11', level: 'easy', commitLevel: 'easy', bonusAlive: true,
    progress: { done: tasks.filter(t => t.ticked).length, total: tasks.length }, goddamnCount: 0, goddamnMax: 2, tasks,
    food: { earned, counted: earned, cap: 1200, capRate: 0.5, bonusPreview: Math.round(planned * 0.2), pool: earned - spent, activeNeed: 300, upkeep: 20, leftForGrowth: planned + Math.round(planned * 0.2) - 300 - 20 },
    quests: [
      { id: 'raiseTarget', text: 'Raise Deep work to Medium and finish it', coins: 60, progress: 0, target: 1, done: false },
      { id: 'halfBy', text: 'Tick half the list before 2 PM', coins: 40, progress: 3, target: 3, done: true },
      { id: 'feedAll', text: 'Feed every active pet to 100 (after 2 ticks)', coins: 30, progress: 1, target: 3, done: false },
    ],
    weekStars: 2,
    season: { month: '2026-11', name: 'Small Beginnings', tier: 11, xp: 8580, xpInTier: 330, xpPerTier: 750, maxTier: 30, nextReward: '2 Rare egg food', cosmetic: 'Acorn Cap' },
    prologue: false,
  };

  const pet = (o) => ({
    stars: 1, comebackOwed: 0, penalty: 0, need: 100, seatBonus: 0, abilities: [], trinkets: [], mood: 'healthy', beacon: false, cosmetic: null, location: 'active', ...o,
  });
  const pets = {
    seats: { base: 3, bought: 0, fromAbilities: 2, total: 5, used: 3 },
    active: [
      pet({ id: 'p-ember', species: 'dragon', speciesName: 'Drakelet', name: 'Ember', tier: 3, tierName: 'Epic', stars: 2, level: 14, cap: 55, xp: 320, xpNext: 750,
        fedToday: fed['p-ember'], meter: 2100, meterCap: 5400, meterPct: 0.39, dividend: { coins: 46, shards: 2 }, seatBonus: 2, mood: 'happy',
        abilities: [
          { kind: 'skill', name: 'Gold Sniffer', text: 'Lv 10: +10% coins from eggs it lays.', active: true },
          { kind: 'skill', name: 'Treasure Sense', text: 'Lv 25: +1 item in eggs it lays.', active: false },
          { kind: 'star', name: 'Twin Spark', text: '2★: egg meter +10%, XP +10%.', active: true },
        ],
        trinkets: [{ id: 't-locket', name: 'Ember Locket', tier: 3 }] }),
      pet({ id: 'p-mochi', species: 'slime', speciesName: 'Gumdrop', name: 'Mochi', tier: 1, tierName: 'Rare', level: 6, cap: 30, xp: 90, xpNext: 350, comebackOwed: 300, penalty: 2,
        fedToday: fed['p-mochi'], meter: 380, meterCap: 600, dividend: { coins: 11, shards: 0 }, mood: 'hungry' }),
      pet({ id: 'p-pip', species: 'fox', speciesName: 'Kitsu', name: 'Pip', tier: 0, tierName: 'Ordinary', level: 3, cap: 20, xp: 40, xpNext: 200,
        fedToday: fed['p-pip'], meter: 40, meterCap: 200, dividend: { coins: 5, shards: 0 } }),
    ],
    backpack: [
      pet({ id: 'p-bean', species: 'slime', speciesName: 'Gumdrop', name: 'Bean', tier: 0, tierName: 'Ordinary', level: 2, cap: 20, xp: 10, xpNext: 150, fedToday: 0, meter: 0, meterCap: 200, dividend: { coins: 5, shards: 0 }, location: 'backpack' }),
      pet({ id: 'p-kit', species: 'fox', speciesName: 'Kitsu', name: 'Kit', tier: 0, tierName: 'Ordinary', level: 1, cap: 20, xp: 0, xpNext: 100, fedToday: 0, meter: 0, meterCap: 200, dividend: { coins: 5, shards: 0 }, location: 'backpack' }),
    ],
    backpackCap: 12,
  };

  const eggs = {
    openEggs: [
      { id: 'e1', tier: 3, source: 'laid', from: 'Laid by Ember', extraItems: 1 },
      { id: 'e2', tier: 1, source: 'streak', from: 'Streak bonus', extraItems: 0 },
      { id: 'e3', tier: 1, source: 'laid', from: 'Laid by Mochi', extraItems: 0 },
      { id: 'e4', tier: 0, source: 'laid', from: 'Laid by Pip', extraItems: 0 },
      { id: 'e5', tier: 1, source: 'chest', from: 'Weekly chest', extraItems: 0 },
    ],
    petEggs: [
      { id: 'pe1', tier: 1, servings: 2, need: 6, charm: null, odds: [0, 0.94, 0.055, 0.005, 0, 0, 0] },
      { id: 'pe2', tier: 0, servings: 0, need: 5, charm: null, odds: [0.95, 0.05, 0, 0, 0, 0, 0] },
      { id: 'pe3', tier: 0, servings: 5, need: 5, charm: null, odds: [0.95, 0.05, 0, 0, 0, 0, 0] },
    ],
    eggFood: [18, 9, 4, 2, 0, 0, 0],
    charms: { tier: 1, sprout: 1 },
    treats: [{ id: 'treat-1', tier: 1, xp: 200 }, { id: 'treat-2', tier: 0, xp: 100 }],
  };

  const collection = {
    mergePairs: [{ aId: 'p-pip', bId: 'p-kit', odds: { stars: 2, mutation: 0.05 } }],
    combinePairs: [
      { aId: 'p-pip', bId: 'p-bean', odds: { success: 0.2 } },
      { aId: 'p-kit', bId: 'p-bean', odds: { success: 0.2 } },
    ],
    eggCombinePairs: [{ aId: 'pe2', bId: 'pe3', odds: { success: 0.2 } }],
    petdex: {
      species: ['dragon', 'fox', 'slime', 'owl', 'turtle', 'axolotl'], tiers: 7,
      cells: {
        'dragon:0': { found: true, firstDay: '2026-10-25' }, 'dragon:3': { found: true, firstDay: '2026-11-04' },
        'fox:0': { found: true, firstDay: '2026-10-26' }, 'slime:0': { found: true, firstDay: '2026-10-28' },
        'slime:1': { found: true, firstDay: '2026-11-02' }, 'owl:0': { found: true, firstDay: '2026-11-08' },
      },
    },
  };

  const item = (id, name, price, currency, extra = {}) => ({ id, name, price, currency, canBuy: true, reason: null, owned: null, max: null, ...extra });
  const shop = {
    coins: 2140, diamonds: 46, shards: 7,
    tabs: [
      { id: 'items', label: 'Items', items: [
        item('freeze', 'Streak freeze', 600, 'coins', { desc: 'Hold up to 3. Used automatically on an unfinished day.', owned: 1, max: 3 }),
        item('seat', 'Extra seat', 150, 'diamonds', { desc: 'A 4th base seat. Then 400, then 1,000.', canBuy: false, reason: 'Needs 150 diamonds' }),
        item('backpack', 'Backpack +2', 1000, 'coins', { desc: 'Two more backpack spaces. Then 2,000 and 4,000.' }),
      ] },
      { id: 'pets', label: 'Pets', items: [
        item('pet-epic', 'Epic pet', 400, 'diamonds', { tier: 3, desc: 'Guaranteed. Random species.', canBuy: false, reason: 'Needs 400 diamonds' }),
        item('pet-mythic', 'Mythic pet', 3000, 'diamonds', { tier: 4, desc: 'Guaranteed. Random species.', canBuy: false, reason: 'Needs 3,000 diamonds' }),
        item('pet-legendary', 'Legendary pet', 15000, 'diamonds', { tier: 5, desc: 'Guaranteed. Random species.', canBuy: false, reason: 'Needs 15,000 diamonds' }),
      ] },
      { id: 'eggs', label: 'Eggs', items: [
        item('egg-epic', 'Epic pet egg', 250, 'diamonds', { tier: 3, desc: 'The bad-luck safety net: about half a year of saving.', canBuy: false, reason: 'Needs 250 diamonds' }),
        item('egg-mythic', 'Mythic pet egg', 2000, 'diamonds', { tier: 4, canBuy: false, reason: 'Needs 2,000 diamonds' }),
        item('egg-legendary', 'Legendary pet egg', 10000, 'diamonds', { tier: 5, canBuy: false, reason: 'Needs 10,000 diamonds' }),
      ] },
      { id: 'boosters', label: 'Boosters', items: [
        item('sprout', 'Sprout charm', 60, 'diamonds', { desc: 'Ordinary to Super Rare pet eggs: 20% for +1 tier. The egg needs 50% more servings.', canBuy: false, reason: 'Needs 60 diamonds' }),
        item('beacon', 'Beacon', 300, 'diamonds', { desc: "Lets one backpack pet's seat ability work from the backpack.", canBuy: false, reason: 'Needs 300 diamonds' }),
        item('food-rare', 'Rare egg food ×10', 400, 'coins', { tier: 1, desc: 'Ten servings of Rare food.' }),
        item('food-sr', 'Super Rare egg food ×5', 30, 'diamonds', { tier: 2, desc: 'Five servings of Super Rare food.' }),
      ] },
      { id: 'trinkets', label: 'Trinkets', items: [
        item('trinket-epic', 'Epic trinket', 150, 'diamonds', { tier: 3, desc: 'For Epic pets and up.', canBuy: false, reason: 'Needs 150 diamonds' }),
        item('trinket-mythic', 'Mythic trinket', 500, 'diamonds', { tier: 4, canBuy: false, reason: 'Needs 500 diamonds' }),
        item('trinket-legendary', 'Legendary trinket', 1500, 'diamonds', { tier: 5, canBuy: false, reason: 'Needs 1,500 diamonds' }),
      ] },
    ],
    flashSale: null,
    rewards: [
      { id: 'dessertRun', name: 'Dessert run', size: 'S', price: 450 },
      { id: 'cafeDrink', name: 'Boba or a good café drink', size: 'S', price: 600 },
      { id: 'gamingHour', name: 'An hour of games, on purpose', size: 'S', price: 600, note: 'Ends by 21:30 · once a day' },
      { id: 'takeoutLunch', name: 'Favourite takeout lunch', size: 'M', price: 1200 },
      { id: 'bookshopPick', name: 'One bookshop pick, fiction welcome', size: 'M', price: 1800 },
      { id: 'museumMorning', name: 'A museum morning', size: 'L', price: 4500 },
    ],
    redemptions: [{ id: 'r1', rewardId: 'cafeDrink', name: 'Boba or a good café drink', price: 600, at: Date.UTC(2026, 10, 8, 19, 0), taken: true }],
  };

  const odds = {
    tiers: ['Ordinary', 'Rare', 'Super Rare', 'Epic', 'Mythic', 'Legendary', 'Ultra'],
    petEggChance: { laid: [0.35, 0.25, 0.12, 0.05, 0.035, 0.03, 0.03], other: [0.10, 0.05, 0.02, 0.01, 0.01, 0.01, 0.01] },
    tierSplit: { laid: [[0.825, 0.125, 0.05], [0.825, 0.125, 0.05], [0.88, 0.10, 0.02], [0.92, 0.07, 0.01], [0.94, 0.05, 0.01], [0.75, 0.25, 0], [1, 0, 0]], other: [0.9, 0.1, 0] },
    loot: [
      { kind: 'coins', label: 'Coins', weight: 0.40 }, { kind: 'eggFood', label: 'Egg food', weight: 0.35 },
      { kind: 'treat', label: 'XP treat', weight: 0.12 }, { kind: 'diamonds', label: 'Diamonds', weight: 0.08 },
      { kind: 'charm', label: 'Tier charm (Epic eggs and up)', weight: 0.03 }, { kind: 'trinket', label: 'Trinket (Epic eggs and up)', weight: 0.02 },
    ],
    itemCount: { base: 3, n: 9, p: 0.28, min: 3, max: 12, mean: 5.52, perTenLevels: 1, maxBonus: 5 },
    ultraTrinket: 0.10,
    hatch: { own: 0.95, up: 0.05, floor: 0.5, bonus: [0.01, 0.005, 0.0025] },
    servings: [5, 6, 8, 10, 12, 15, 20],
    separate: [3, 4, 5, 6, 8, 10, 12],
    charm: { chance: 0.2, servingsMult: 1.5, sproutMaxTier: 2 },
    merge: { mutation: 0.05 },
    combine: [0.2, 0.1, 0.05, 0.025, 0.0125, 0.00625],
  };

  const receipts = {
    month: { pagesRead: 412, hoursOutside: 11.5, workouts: 14, avgSleepHours: 7.4, hardOrAbove: 19 },
    lifetime: { pagesRead: 951, hoursOutside: 27, workouts: 31, avgSleepHours: 7.3, hardOrAbove: 36 },
    goals: [{ goal: 'Goal A: finish the reading list', tasksDone: 17 }, { goal: 'Goal B: ship the side project', tasksDone: 9 }],
  };

  return {
    header, today, pets, eggs, collection, shop, odds, receipts, ladder: LADDER,
    settings: { companionId: 'p-ember', reminders: { evening: false, morning: false, notify: false }, sound: false, motion: 'system' },
    morning: { dayKey: '2026-11-11', heading: 'Yesterday counted.', outcome: 'complete', tasksDone: 6, total: 6, food: 432, bonus: 72, levelUps: 1, streakBefore: 22, streakAfter: 23, eggsWaiting: [{ id: 'e1', tier: 3, source: 'laid' }, { id: 'e2', tier: 1, source: 'streak' }] },
    list: { month: '2026-11', tasks: null, next: null, swapUsed: false },
    generatedAt: now,
  };
}

// A day after three misses: Phoenix state for render tests.
export function ashesViews(now) {
  const v = ownerViews(now);
  v.header = { ...v.header, streak: 0, hunger: 'dead', ashes: { petId: 'p-ember', name: 'Ember', species: 'dragon', tier: 3, done: 1, need: 3, deadlineDay: '2026-11-18' } };
  v.pets = { ...v.pets, active: [], seats: { ...v.pets.seats, fromAbilities: 0, total: 3, used: 0 } };
  return v;
}

// The public snapshot shape (ARCHITECTURE.md "Public snapshot"), built from the fixtures.
export function previewSnapshot(generatedAt) {
  const v = ownerViews(generatedAt);
  const count = list => list.reduce((a, e) => { a[e.tier] += 1; return a; }, [0, 0, 0, 0, 0, 0, 0]);
  return {
    format: 'daily-public', version: 1, kind: 'preview', generatedAt, preview: true,
    header: v.header,
    today: { ...v.today, tasks: v.today.tasks.map(({ goal, ...t }) => t) }, // no goal links in public
    pets: v.pets,
    eggs: { openEggs: count(v.eggs.openEggs), petEggs: count(v.eggs.petEggs) },
    petdex: v.collection.petdex,
    receipts: { month: { key: '2026-11', ...v.receipts.month }, lifetime: v.receipts.lifetime },
    ladder: v.ladder,
    odds: v.odds,
  };
}
