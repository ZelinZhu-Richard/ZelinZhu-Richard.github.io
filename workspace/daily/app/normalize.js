// Boundary adapter: maps the engine's view models (supersets of ARCHITECTURE.md, with numeric
// levels and a few richer fields) onto the shapes the render modules use. Idempotent, pure.
import { LEVELS, num, tierName } from './format.js';

export const levelName = x => (typeof x === 'number' ? LEVELS[x] : x && typeof x === 'object' ? x.id : x);

export function rewardText(r) {
  if (!r) return '';
  if (typeof r === 'string') return r;
  const parts = [];
  if (r.cosmetic) parts.push(typeof r.cosmetic === 'string' ? r.cosmetic : r.cosmetic.name);
  if (r.egg !== undefined && r.egg !== null) parts.push(`${tierName(typeof r.egg === 'object' ? r.egg.tier : r.egg)} egg`);
  if (r.eggFood) {
    const f = r.eggFood;
    if (Array.isArray(f)) f.forEach((n, t) => { if (n) parts.push(`${n} ${tierName(t)} egg food`); });
    else parts.push(`${f.count ?? f.amount ?? 1} ${tierName(f.tier ?? 0)} egg food`);
  }
  if (r.charm) parts.push(`${r.charm === 'sprout' ? 'Sprout' : 'Tier'} charm`);
  if (r.diamonds) parts.push(`${num(r.diamonds)} diamonds`);
  if (r.coins) parts.push(`${num(r.coins)} coins`);
  return parts.join(' + ') || r.text || r.label || '';
}

function normalizeOdds(o) {
  if (!o) return o;
  const out = { ...o };
  if (!out.tierSplit && o.petEggSplit) out.tierSplit = { laid: o.petEggSplit.laid, other: o.petEggSplit.other };
  if (Array.isArray(o.loot)) {
    const LABEL = { coins: 'Coins', eggFood: 'Egg food', xpTreat: 'XP treat', treat: 'XP treat', diamonds: 'Diamonds', charm: 'Tier charm', trinket: 'Trinket' };
    const total = o.loot.reduce((sum, l) => sum + (Number(l.weight) || 0), 0) || 1;
    out.loot = o.loot.filter(l => Number(l.weight) > 0).map(l => ({
      ...l,
      weight: l.weight / total,
      label: l.label || `${LABEL[l.kind] || l.kind}${l.minTier ? ` (${tierName(l.minTier)} eggs and up)` : ''}`,
    }));
  }
  if (o.itemCount) out.itemCount = { perTenLevels: 1, maxBonus: o.itemCount.levelBonus?.max ?? 5, ...o.itemCount, mean: Math.round((o.itemCount.mean ?? 5.5) * 10) / 10 };
  if (o.hatch?.base) {
    const b = o.hatch.foodBonus ?? 0.01;
    out.hatch = { own: o.hatch.base.same, up: o.hatch.base.up, floor: o.hatch.ownFloor ?? 0.5, bonus: [b, b / 2, b / 4] };
    out.servings = o.servings || o.hatch.servings;
  }
  return out;
}

export function normalizeViews(vm) {
  if (!vm) return vm;
  const out = { ...vm };
  if (vm.today) {
    const t = vm.today;
    const season = t.season ? { ...t.season, nextReward: rewardText(t.season.nextReward), cosmetic: typeof t.season.cosmetic === 'object' && t.season.cosmetic ? t.season.cosmetic.name : t.season.cosmetic, name: t.season.name || t.season.cosmetic?.seasonName } : t.season;
    out.today = {
      ...t, season, level: levelName(t.level), commitLevel: t.commitLevel === null || t.commitLevel === undefined ? null : levelName(t.commitLevel),
      prologue: Boolean(t.prologue) || (t.season ? t.season.active === false : false),
      tasks: (t.tasks || []).map(x => ({ ...x, level: x.levelName || levelName(x.level), raiseTo: (x.raiseTo || []).map(levelName) })),
    };
  }
  if (vm.ladder) {
    const levels = (vm.ladder.levels || LEVELS).map(levelName);
    let foodRow = vm.ladder.foodRow;
    if (Array.isArray(foodRow) && foodRow.length && typeof foodRow[0] === 'object') foodRow = Object.fromEntries(foodRow.map(f => [levelName(f.level ?? f.id), f.food ?? f.value]));
    out.ladder = { ...vm.ladder, levels, foodRow };
  }
  if (vm.header?.nextStep && typeof vm.header.nextStep === 'object' && vm.header.nextStep.day === undefined) {
    out.header = { ...vm.header, nextStep: { ...vm.header.nextStep, day: vm.header.nextStep.streak } };
  }
  const petdex = vm.collection?.petdex;
  if (petdex?.species?.length && typeof petdex.species[0] === 'object') {
    out.collection = { ...vm.collection, petdex: { ...petdex, names: Object.fromEntries(petdex.species.map(s => [s.id, s.name])), species: petdex.species.map(s => s.id) } };
  }
  if (vm.pets?.companionId && !(vm.settings?.companionId)) out.settings = { ...(vm.settings || {}), companionId: vm.pets.companionId };
  if (vm.odds) out.odds = normalizeOdds(vm.odds);
  if (vm.eggs?.petEggs) out.eggs = { ...vm.eggs, petEggs: vm.eggs.petEggs.map(e => ({ ...e, tier: typeof e.tier === 'number' ? e.tier : 0 })) };
  return out;
}

export function normalizeEvents(events) {
  return (events || []).map(e => (e.type === 'task.ticked' || e.type === 'task.raised' ? { ...e, level: levelName(e.level) } : e.type === 'day.levelChanged' ? { ...e, from: levelName(e.from), to: levelName(e.to) } : e));
}

// The engine's viewMorning → the morning card's fields.
export function morningFrom(m) {
  if (!m) return null;
  return {
    dayKey: m.dayKey, outcome: m.outcome, heading: m.heading, streak: m.streakAfter ?? m.streak, foodTotal: m.food ?? m.foodTotal, bonus: m.bonus,
    levels: m.levelUps ?? m.levels ?? 0, eggs: Array.isArray(m.eggsWaiting) ? m.eggsWaiting.length : (m.eggsWaiting ?? m.eggs ?? 0),
    tasksDone: m.tasksDone, total: m.total,
  };
}
