// Dev-only fixture backend (local hosts, ?fixtures=owner|visitor). It mutates the fixture
// view models directly and emits contract-shaped events so the UI's animations can be
// exercised before the engine is wired. It is NOT the game rules and is never deployed.
import { ownerViews, previewSnapshot, LADDER } from './views.js';
import { snapshotViews } from '../backend.js';
import { liveWindow } from '../time.js';

const LEVELS = ['chill', 'easy', 'medium', 'hard', 'goddamn'];
const fail = (code, message) => { throw Object.assign(new Error(message), { name: 'GameError', code }); };

export function createFixtureBackend(mode = 'owner') {
  return mode === 'visitor' ? new FixtureVisitor() : new FixtureOwner();
}

class FixtureVisitor {
  constructor() { this.mode = 'visitor'; this.snapshot = previewSnapshot(Date.now()); }
  now() { return Date.now(); }
  async load() { return { state: this.snapshot, events: [] }; }
  refresh() { return { state: this.snapshot, events: [] }; }
  act() { fail('read-only', 'Read-only public view.'); }
  views() { const v = snapshotViews(this.snapshot); v.header = { ...v.header, window: liveWindow(this.now()) }; return v; }
}

class FixtureOwner {
  constructor() {
    this.mode = 'owner';
    this.fixture = true;
    this.v = ownerViews(Date.now());
    this.v.header.window = liveWindow(Date.now());
    this.n = 0;
  }
  now() { return Date.now(); }
  async load() {
    return { state: this.v, events: [{ type: 'day.closed', dayKey: '2026-11-11', outcome: 'complete', streak: 23, foodTotal: 432, bonus: 72, missRun: 0 }, { type: 'pet.levelUp', petId: 'p-ember', level: 14 }, { type: 'streak.eggs', tier: 1, count: 1, lucky: false }] };
  }
  refresh() { this.v.header.window = liveWindow(this.now()); this.syncUndo(); return { state: this.v, events: [] }; }
  views() { this.syncUndo(); return structuredClone(this.v); }
  syncUndo() { for (const t of this.v.today.tasks) if (t.ticked) t.canUndo = this.now() - t.tickedAt < 300000; }
  hatchOdds() { return null; }
  exportJson() { return JSON.stringify({ fixture: true, views: this.v }, null, 2); }
  importJson() { fail('fixture', 'Import is not available in fixture mode.'); }
  exportSnapshot() { return JSON.stringify(previewSnapshot(this.now()), null, 2); }
  id(prefix) { this.n += 1; return `${prefix}-${this.n}`; }

  pet(id) { return [...this.v.pets.active, ...this.v.pets.backpack].find(p => p.id === id) || fail('no-pet', 'That pet is gone.'); }
  task(id) { return this.v.today.tasks.find(t => t.id === id) || fail('no-task', 'No such task.'); }
  recount() {
    const t = this.v.today;
    const ticked = t.tasks.filter(x => x.ticked);
    t.progress = { done: ticked.length, total: t.tasks.length };
    const earned = ticked.reduce((n, x) => n + x.food, 0);
    const spent = [...this.v.pets.active].reduce((n, p) => n + p.fedToday, 0);
    const planned = t.tasks.reduce((n, x) => n + x.food, 0);
    t.food.earned = earned; t.food.counted = Math.min(earned, 1200) + Math.max(0, earned - 1200) * 0.5;
    t.food.pool = Math.max(0, earned - spent);
    t.food.bonusPreview = t.bonusAlive ? Math.round(planned * 0.2) : 0;
    t.food.leftForGrowth = planned + t.food.bonusPreview - t.food.activeNeed - t.food.upkeep;
    t.goddamnCount = t.tasks.filter(x => x.level === 'goddamn').length;
  }
  setTaskLevel(t, level) {
    t.level = level; t.levelLabel = level[0].toUpperCase() + level.slice(1);
    t.amountText = LADDER.rows.find(r => r.taskId === t.id).cells[level];
    t.food = LADDER.foodRow[level];
    t.raiseTo = LEVELS.slice(LEVELS.indexOf(level) + 1);
  }

  act(action) {
    const before = JSON.stringify(this.v);
    try {
      const events = this.apply(action) || [];
      this.recount();
      return { state: this.v, events };
    } catch (err) {
      this.v = JSON.parse(before);
      throw err;
    }
  }

  apply(a) {
    const v = this.v, t = v.today, now = this.now();
    switch (a.type) {
      case 'task/tick': {
        const task = this.task(a.taskId);
        if (task.ticked) fail('ticked', 'Already ticked.');
        if (v.header.window.phase !== 'open') fail('window', 'Ticks count from 5 AM to 10 PM.');
        if (!t.commitLevel) t.commitLevel = t.level;
        Object.assign(task, { ticked: true, tickedAt: now, canUndo: true, raiseTo: [] });
        const events = [{ type: 'task.ticked', taskId: task.id, level: task.level, food: task.food, counted: task.food, qty: a.qty ?? null }];
        if (t.tasks.every(x => x.ticked || x.id === task.id)) events.push({ type: 'perfect.day', dayKey: t.dayKey });
        const q = t.quests.find(x => !x.done && x.id === 'raiseTarget' && task.id === 'deep' && LEVELS.indexOf(task.level) >= 2);
        if (q) { q.done = true; q.progress = 1; events.push({ type: 'quest.completed', questId: q.id, coins: q.coins }); }
        return events;
      }
      case 'task/undo': {
        const task = this.task(a.taskId);
        if (!task.ticked || now - task.tickedAt > 300000) fail('undo', 'The 5-minute undo has passed.');
        Object.assign(task, { ticked: false, tickedAt: null, canUndo: false });
        this.setTaskLevel(task, LEVELS[Math.max(LEVELS.indexOf(task.level), LEVELS.indexOf(t.level))]);
        return [{ type: 'task.undone', taskId: task.id }];
      }
      case 'day/setLevel': {
        const from = t.level;
        const commitBroken = Boolean(t.commitLevel) && LEVELS.indexOf(a.level) < LEVELS.indexOf(t.commitLevel) && t.bonusAlive;
        t.level = a.level;
        if (commitBroken) t.bonusAlive = false;
        for (const task of t.tasks) if (!task.ticked && (LEVELS.indexOf(task.level) < LEVELS.indexOf(a.level) || task.level === from)) this.setTaskLevel(task, a.level);
        return [{ type: 'day.levelChanged', from, to: a.level, commitBroken }];
      }
      case 'task/raise': {
        const task = this.task(a.taskId);
        if (task.ticked || !task.raiseTo.includes(a.level)) fail('raise', 'Tasks can only go up from the day level.');
        if (a.level === 'goddamn' && t.goddamnCount >= t.goddamnMax) fail('goddamn', 'At most 2 Goddamn tasks a day.');
        this.setTaskLevel(task, a.level);
        return [{ type: 'task.raised', taskId: task.id, level: a.level }];
      }
      case 'pet/feed': {
        const p = this.pet(a.petId);
        const amount = Math.min(a.amount, t.food.pool);
        if (amount <= 0) fail('pool', 'No pet food left to hand out.');
        const before = p.fedToday;
        p.fedToday += amount;
        const excess = Math.max(0, p.fedToday - p.need) - Math.max(0, before - p.need);
        const events = [{ type: 'pet.fed', petId: p.id, amount, excess }];
        if (excess) {
          p.meter = Math.min(p.meterCap, p.meter + excess);
          p.xp += excess;
          events.push({ type: 'pet.xp', petId: p.id, xp: excess });
          while (p.xp >= p.xpNext && p.level < p.cap) { p.xp -= p.xpNext; p.level += 1; p.xpNext = 50 * p.level + 50; events.push({ type: 'pet.levelUp', petId: p.id, level: p.level }); }
        }
        if (p.fedToday >= p.need && p.mood === 'hungry') p.mood = 'healthy';
        return events;
      }
      case 'pet/rename': this.pet(a.petId).name = String(a.name).slice(0, 12); return [];
      case 'pet/deactivate': case 'pet/activate': {
        const p = this.pet(a.petId), pets = v.pets;
        const toActive = a.type === 'pet/activate';
        if (toActive && pets.active.length >= pets.seats.total) fail('seats', 'No free seat.');
        pets.active = pets.active.filter(x => x !== p); pets.backpack = pets.backpack.filter(x => x !== p);
        p.location = toActive ? 'active' : 'backpack';
        (toActive ? pets.active : pets.backpack).push(p);
        pets.seats.used = pets.active.length;
        return [];
      }
      case 'pet/release': {
        const p = this.pet(a.petId);
        v.pets.active = v.pets.active.filter(x => x !== p); v.pets.backpack = v.pets.backpack.filter(x => x !== p);
        v.eggs.eggFood[p.tier] += 2 * v.odds.separate[p.tier];
        return [{ type: 'pet.released', petId: p.id }];
      }
      case 'pet/useTreat': {
        const p = this.pet(a.petId);
        const treat = v.eggs.treats.find(x => x.id === a.treatId) || fail('treat', 'No such treat.');
        v.eggs.treats = v.eggs.treats.filter(x => x !== treat);
        p.xp += treat.xp;
        return [{ type: 'pet.xp', petId: p.id, xp: treat.xp }];
      }
      case 'pet/beacon': this.pet(a.petId).beacon = Boolean(a.on); return [];
      case 'egg/open': {
        const egg = v.eggs.openEggs.find(e => e.id === a.eggId) || fail('egg', 'No such egg.');
        v.eggs.openEggs = v.eggs.openEggs.filter(e => e !== egg);
        const items = [];
        const n = 3 + Array.from({ length: 9 }, () => Math.random() < 0.28).filter(Boolean).length + (egg.extraItems || 0);
        for (let i = 0; i < n; i += 1) {
          const r = Math.random();
          if (r < 0.4) { const amount = Math.round([10, 20, 35, 60, 100, 160, 250][egg.tier] * (0.5 + Math.random())); v.shop.coins += amount; items.push({ kind: 'coins', amount }); }
          else if (r < 0.75) { const tier = Math.min(6, Math.max(0, egg.tier + (Math.random() < 0.25 ? -1 : 0))); const amount = 1 + Math.floor(Math.random() * 3); v.eggs.eggFood[tier] += amount; items.push({ kind: 'eggFood', tier, amount }); }
          else if (r < 0.87) { const treat = { id: this.id('treat'), tier: egg.tier, xp: 100 * (egg.tier + 1) }; v.eggs.treats.push(treat); items.push({ kind: 'treat', tier: egg.tier, amount: treat.xp }); }
          else { const amount = [1, 1, 2, 3, 5, 8, 12][egg.tier]; v.shop.diamonds += amount; items.push({ kind: 'diamonds', amount }); }
        }
        if (Math.random() < (egg.source === 'laid' ? v.odds.petEggChance.laid : v.odds.petEggChance.other)[egg.tier] * 2) {
          const tier = Math.min(6, egg.tier + (Math.random() < 0.15 ? 1 : 0));
          const petEgg = { id: this.id('pe'), tier, servings: 0, need: v.odds.servings[tier], charm: null, odds: [0, 0, 0, 0, 0, 0, 0].map((_, k) => (k === tier ? 0.95 : k === tier + 1 ? 0.05 : 0)) };
          v.eggs.petEggs.push(petEgg);
          items.push({ kind: 'petEgg', tier, petEgg });
        }
        return [{ type: 'egg.opened', eggId: egg.id, tier: egg.tier, items }];
      }
      case 'petEgg/feed': {
        const pe = v.eggs.petEggs.find(e => e.id === a.petEggId) || fail('egg', 'No such pet egg.');
        if (pe.servings >= pe.need) fail('full', 'This egg is ready to hatch.');
        if (!v.eggs.eggFood[a.foodTier]) fail('food', 'No egg food of that tier.');
        v.eggs.eggFood[a.foodTier] -= 1; pe.servings += 1;
        for (let j = 1; j <= a.foodTier - pe.tier && pe.tier + j <= 6; j += 1) {
          const bump = 0.01 / 2 ** (j - 1);
          if (pe.odds[pe.tier] - bump >= 0.5) { pe.odds[pe.tier] -= bump; pe.odds[pe.tier + j] += bump; }
        }
        return [{ type: 'petEgg.fed', petEggId: pe.id, servings: pe.servings, need: pe.need, odds: pe.odds }];
      }
      case 'petEgg/charm': {
        const pe = v.eggs.petEggs.find(e => e.id === a.petEggId) || fail('egg', 'No such pet egg.');
        if (pe.charm) fail('charm', 'One charm per egg.');
        if (!v.eggs.charms[a.charm]) fail('charm', 'No charm of that kind.');
        if (a.charm === 'sprout' && pe.tier > 2) fail('charm', 'Sprout charms work on Ordinary to Super Rare eggs.');
        v.eggs.charms[a.charm] -= 1; pe.charm = a.charm; pe.need = Math.ceil(pe.need * 1.5); pe.canCharm = false; pe.canSprout = false;
        return [];
      }
      case 'petEgg/hatch': {
        const pe = v.eggs.petEggs.find(e => e.id === a.petEggId) || fail('egg', 'No such pet egg.');
        if (pe.servings < pe.need) fail('hatch', 'Needs more servings.');
        let r = Math.random(), rolled = pe.tier;
        for (let k = 0; k < 7; k += 1) { r -= pe.odds[k]; if (r < 0) { rolled = k; break; } }
        const up = pe.charm && Math.random() < 0.2;
        const tier = Math.min(6, rolled + (up ? 1 : 0));
        const species = ['dragon', 'fox', 'slime', 'owl', 'turtle', 'axolotl'][Math.floor(Math.random() * 6)];
        const pet = { id: this.id('p'), species, speciesName: species, name: ['Nova', 'Juniper', 'Wobble', 'Quill', 'Pebble', 'Coral'][Math.floor(Math.random() * 6)], tier, tierName: v.odds.tiers[tier], stars: 1, level: 1, cap: [20, 30, 40, 55, 70, 85, 100][tier], xp: 0, xpNext: 100, comebackOwed: 0, penalty: 0, fedToday: 0, need: 100, meter: 0, meterCap: [200, 600, 1800, 5400, 16200, 48600, 145800][tier], dividend: { coins: [5, 10, 20, 40, 80, 160, 320][tier], shards: 0 }, seatBonus: 0, abilities: [], trinkets: [], mood: 'happy', beacon: false, cosmetic: null, location: 'backpack' };
        v.eggs.petEggs = v.eggs.petEggs.filter(e => e !== pe);
        v.pets.backpack.push(pet);
        const events = [{ type: 'petEgg.hatched', pet, rolledTier: rolled, charmUpgraded: Boolean(up) }];
        const key = `${species}:${tier}`;
        if (!v.collection.petdex.cells[key]?.found) { v.collection.petdex.cells[key] = { found: true, firstDay: v.today.dayKey }; events.push({ type: 'petdex.discovered', species, tier, coins: 100 * (tier + 1), diamonds: 0 }); }
        return events;
      }
      case 'petEgg/separate': {
        const pe = v.eggs.petEggs.find(e => e.id === a.petEggId) || fail('egg', 'No such pet egg.');
        v.eggs.petEggs = v.eggs.petEggs.filter(e => e !== pe);
        v.eggs.eggFood[pe.tier] += v.odds.separate[pe.tier];
        return [];
      }
      case 'petEgg/combine': case 'pet/combine': {
        const isEgg = a.type === 'petEgg/combine';
        const list = isEgg ? v.eggs.petEggs : [...v.pets.active, ...v.pets.backpack];
        const A = list.find(x => x.id === a.aId), B = list.find(x => x.id === a.bId);
        if (!A || !B || A.tier !== B.tier) fail('combine', 'Combine needs two of the same tier.');
        const success = Math.random() < v.odds.combine[A.tier];
        if (isEgg) {
          v.eggs.petEggs = v.eggs.petEggs.filter(x => x !== A && x !== B);
          const result = success ? { id: this.id('pe'), tier: A.tier + 1, servings: 0, need: v.odds.servings[A.tier + 1], charm: null, odds: [0, 0, 0, 0, 0, 0, 0].map((_, k) => (k === A.tier + 1 ? 0.95 : k === A.tier + 2 ? 0.05 : 0)) } : null;
          if (result) v.eggs.petEggs.push(result);
          v.collection.eggCombinePairs = [];
          return [{ type: 'combine.result', success, result }];
        }
        v.pets.active = v.pets.active.filter(x => x !== A && x !== B); v.pets.backpack = v.pets.backpack.filter(x => x !== A && x !== B);
        const result = success ? { ...A, id: this.id('p'), tier: A.tier + 1, level: 1, stars: 1, name: A.name } : null;
        if (result) v.pets.backpack.push(result);
        v.collection.combinePairs = v.collection.combinePairs.filter(p => ![p.aId, p.bId].some(id => id === A.id || id === B.id));
        v.collection.mergePairs = v.collection.mergePairs.filter(p => ![p.aId, p.bId].some(id => id === A.id || id === B.id));
        return [{ type: 'combine.result', success, result }];
      }
      case 'pet/merge': {
        const A = this.pet(a.aId), B = this.pet(a.bId);
        const mutated = Math.random() < 0.05;
        A.stars += 1; A.level = Math.max(A.level, B.level); if (mutated) A.tier += 1;
        v.pets.active = v.pets.active.filter(x => x !== B); v.pets.backpack = v.pets.backpack.filter(x => x !== B);
        v.collection.mergePairs = []; v.collection.combinePairs = v.collection.combinePairs.filter(p => ![p.aId, p.bId].includes(B.id) && ![p.aId, p.bId].includes(A.id));
        return [{ type: 'pet.merged', petId: A.id, stars: A.stars, mutated }];
      }
      case 'shop/buy': {
        const item = v.shop.tabs.flatMap(tab => tab.items).find(x => x.id === a.itemId) || fail('item', 'No such item.');
        const wallet = item.currency === 'diamonds' ? 'diamonds' : 'coins';
        if (v.shop[wallet] < item.price) fail('funds', `Not enough ${wallet}.`);
        if (item.id === 'freeze' && v.header.freezes >= 3) fail('cap', 'You already hold 3 freezes, the maximum.');
        v.shop[wallet] -= item.price;
        if (item.id === 'freeze') { v.header.freezes += 1; item.owned = v.header.freezes; }
        if (item.id === 'food-rare') v.eggs.eggFood[1] += 10;
        if (item.id === 'food-sr') v.eggs.eggFood[2] += 5;
        return [{ type: 'shop.bought', itemId: item.id }];
      }
      case 'reward/redeem': {
        const reward = v.shop.rewards.find(r => r.id === a.rewardId) || fail('reward', 'No such reward.');
        if (v.shop.coins < reward.price) fail('funds', 'Not enough coins.');
        v.shop.coins -= reward.price;
        v.shop.redemptions.unshift({ id: this.id('r'), rewardId: reward.id, name: reward.name, price: reward.price, at: now, taken: false });
        return [{ type: 'reward.redeemed', rewardId: reward.id }];
      }
      case 'reward/save': v.shop.rewards = a.rewards; return [];
      case 'reward/markTaken': { const r = v.shop.redemptions.find(x => x.id === a.redemptionId) || fail('reward', 'No such redemption.'); r.taken = a.taken ?? true; return [{ type: 'reward.taken', redemptionId: r.id }]; }
      case 'settings/save': v.settings = { ...v.settings, ...a.settings }; return [];
      case 'list/setNext': v.list = { ...v.list, next: a.tasks }; return [];
      case 'list/swap': v.list = { ...v.list, swapUsed: true }; return [];
      default: return fail('unknown', `The fixture backend does not simulate ${a.type}.`);
    }
  }
}
