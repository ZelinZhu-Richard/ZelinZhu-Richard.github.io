// View models (ARCHITECTURE.md). Pure functions of (state, now); the UI renders only from these.

import {
  CONFIG, LEVELS, LEVEL_LABELS, TIERS, TIER_LABELS, ULTRA,
} from './config.js';
import {
  ENGAGEMENT, KEEPER, LAUNCH_PROLOGUE, MILESTONES, QUESTS, REAL_LIFE, SEASON_COSMETICS, SKILLS, SPECIES, STAR_ABILITIES,
} from './content.js';
import { streakEggs } from './close.js';
import { goddamnCount, raiseOptions, taskLevel } from './day.js';
import {
  TRINKET_DEFS, commitBonusPts, computeEffects, petNeed, teamHatchLuck, trinketTier, upkeepCost,
} from './effects.js';
import { hatchNeed, hatchOdds, itemCountDistribution } from './eggs-math.js';
import {
  SPECIES_BY_ID, backpackCap, dividendOf, fedToday, meterCap, moodOf, seatBonus, seatInfo, tierCap, xpNext,
} from './pets.js';
import {
  addTickToAggregate, keeperXpNext, nextSeasonReward, seasonActive, weekStars,
} from './progress.js';
import {
  catalogue, flashSaleActive, flashSalePrice, rewardBlock,
} from './shop.js';
import { emptyAggregate } from './state.js';
import { amountText, capFood, foodAt, taskAmount } from './tasks.js';
import {
  addDays, closeInstant, dayKey, mondayOf, monthOf, openInstant, phaseAt,
} from './time.js';

const QUEST_BY_ID = Object.fromEntries(QUESTS.pool.map((q) => [q.id, q]));
const KEEPER_TITLES = Object.entries(KEEPER.titles).map(([lv, t]) => [Number(lv), t]).sort((a, b) => a[0] - b[0]);
const keeperTitle = (level) => KEEPER_TITLES.filter(([lv]) => lv <= level).pop()?.[1] || null;

// ---- header ----------------------------------------------------------------------------------------------

/** The hunger ladder. Misses after a death still count (and a third kills again), so they win over 'dead'. */
function hungerState(s) {
  if (s.missRun >= 2) return 'starving';
  if (s.missRun === 1) return 'hungry';
  if (s.welcomePending && s.lastDeath) return 'dead';
  return 'fed';
}

function tonightEggs(streakTonight) {
  const e = streakEggs(streakTonight);
  return e.lucky ? { tier: e.tier, tierName: TIER_LABELS[e.tier], count: null, min: e.min, max: e.max, lucky: true } : { tier: e.tier, tierName: TIER_LABELS[e.tier], count: e.count, lucky: false };
}

function nextStep(streakTonight) {
  const cur = streakEggs(streakTonight);
  for (let d = streakTonight + 1; d < streakTonight + 2000; d += 1) {
    const e = streakEggs(d);
    if (e.tier !== cur.tier || e.count !== cur.count || e.lucky !== cur.lucky) {
      return { streak: d, tier: e.tier, tierName: TIER_LABELS[e.tier], count: e.count, lucky: e.lucky, min: e.min ?? null, max: e.max ?? null };
    }
  }
  return null;
}

export function viewHeader(s, now) {
  const today = dayKey(now);
  const phase = phaseAt(now);
  const ashesPet = s.ashes ? s.ashes.pets.find((p) => p.id === s.ashes.petId) : null;
  const nextMilestone = MILESTONES.rows.find((m) => !s.badges.some((b) => b.id === m.badgeId) && m.days > s.streak) || null;
  return {
    streak: s.streak,
    best: s.best,
    tonight: tonightEggs(s.streak + 1),
    nextStep: nextStep(s.streak + 1),
    freezes: s.inv.freezes,
    freezeCap: CONFIG.freezes.cap,
    window: {
      phase,
      opensAt: openInstant(today),
      closesAt: closeInstant(today),
      nextOpensAt: phase === 'before' ? openInstant(today) : openInstant(addDays(today, 1)),
      msLeft: phase === 'open' ? closeInstant(today) - now : 0,
    },
    keeper: { level: s.keeper.level, xp: s.keeper.xp, xpNext: keeperXpNext(s.keeper.level), title: keeperTitle(s.keeper.level), lifetimeFood: s.keeper.lifetimeFood },
    hunger: hungerState(s),
    missRun: s.missRun,
    ashes: ashesPet ? {
      petId: ashesPet.id, name: ashesPet.name, species: ashesPet.species, tier: ashesPet.tier, level: ashesPet.level,
      done: s.ashes.done, need: CONFIG.phoenix.daysNeeded, deadlineDay: s.ashes.deadlineDay,
    } : null,
    badges: s.badges.map((b) => ({ ...b })),
    nextMilestone: nextMilestone ? { days: nextMilestone.days, badge: nextMilestone.badge, coins: nextMilestone.coins, diamonds: nextMilestone.diamonds } : null,
    started: !!s.list,
    startDay: s.startDay,
  };
}

// ---- today -----------------------------------------------------------------------------------------------

function questProgress(q, day, n) {
  const ticks = Object.keys(day?.ticks || {}).length;
  const c = day?.counters || {};
  const map = {
    wholeList: [ticks, n], mediumDay: [ticks, n], keepWord: [ticks, n], cleanSweep: [ticks, n], eveningToYourself: [ticks, n], noWaste: [ticks, n],
    halfBy: [ticks, Math.ceil(n * CONFIG.quests.halfByShare)], fourBy: [ticks, CONFIG.quests.fourByTicks], momentum: [ticks, CONFIG.quests.momentumTicks],
    crackThree: [c.eggsOpened || 0, CONFIG.quests.crackThreeEggs], warmHands: [c.servingsFed || 0, CONFIG.quests.warmHandsServings],
  };
  const [p, t] = map[q.id] || [0, 1];
  return q.done ? { progress: t, target: t } : { progress: Math.min(p, t), target: t };
}

function dayForView(s, now) {
  const today = dayKey(now);
  if (s.day && s.day.key === today) return { day: s.day, open: phaseAt(now) === 'open', closed: false };
  if (s.lastDay && s.lastDay.key === today) {
    // Saves closed before the quest records kept these fields: look them up in the pool by id.
    const quests = (s.lastDay.quests || []).map((q) => {
      const def = QUEST_BY_ID[q.id] || {};
      return { ...q, private: q.private ?? !!def.private, timed: q.timed ?? !!def.timed, cat: q.cat ?? def.cat };
    });
    return { day: { ...s.lastDay, raises: {}, quests, counters: s.lastDay.counters || {} }, open: false, closed: true };
  }
  return { day: null, open: false, closed: false };
}

export function viewToday(s, now, { includeGoals = true } = {}) {
  const today = dayKey(now);
  const tasks = s.list?.tasks || [];
  const n = tasks.length;
  const { day, open, closed } = dayForView(s, now);
  const fx = computeEffects(s);
  const level = day ? day.level : (Number.isInteger(s.settings.defaultDayLevel) ? s.settings.defaultDayLevel : CONFIG.tasks.defaultDayLevel);
  const undoMs = CONFIG.time.undoMinutes * 60_000;

  const taskViews = tasks.map((t) => {
    const tick = day?.ticks?.[t.id] || null;
    const lv = tick ? tick.level : day ? taskLevel(day, t.id) : level;
    const v = {
      id: t.id,
      name: t.name,
      type: t.type,
      physical: t.physical,
      unit: t.unit,
      level: lv,
      levelName: LEVELS[lv],
      levelLabel: LEVEL_LABELS[lv],
      amount: taskAmount(t, lv),
      amountText: amountText(t, lv),
      food: foodAt(n, lv),
      ticked: !!tick,
      tickedAt: tick ? tick.at : null,
      qty: tick ? tick.qty : null,
      counted: tick ? tick.counted : null,
      canUndo: !!tick && open && !day.reward && now - tick.at < undoMs,
      undoUntil: tick ? tick.at + undoMs : null,
      raiseTo: open && day ? raiseOptions(day, tasks, t.id) : [],
      raised: tick ? tick.raised : !!day && lv > day.level,
      patron: t.tag,
      purpose: t.purpose,
      receipt: t.receipt,
    };
    if (includeGoals) v.goal = t.goal;
    return v;
  });

  const raw = day?.raw || 0;
  const projectedRaw = taskViews.reduce((sum, t) => sum + (t.ticked ? 0 : t.food), raw);
  const bonusAlive = !day || !day.commitBroken;
  const rate = CONFIG.tasks.commitBonus + commitBonusPts(fx) / 100;
  const active = s.pets.filter((p) => p.location === 'active');
  const activeNeed = active.reduce((sum, p) => sum + Math.max(0, petNeed(fx, p) - fedToday(p, day?.key)), 0);
  const backpackPets = s.pets.filter((p) => p.location === 'backpack').length;
  const upkeep = backpackPets * upkeepCost(fx);
  const pool = closed ? 0 : day?.pool || 0;

  const month = monthOf(today);
  const seasonOn = seasonActive(month);
  const season = s.season.month === month ? s.season : { month, xp: 0, tier: 0 };
  // The prologue previews the first season's cosmetic; months past the content list have none.
  const cosmetic = SEASON_COSMETICS.find((c) => c.season === month) || (seasonOn ? null : SEASON_COSMETICS.find((c) => c.season === CONFIG.season.firstMonth));
  const quests = (day?.quests || []).filter((q) => includeGoals || !q.private).map((q) => ({
    id: q.id, text: q.text, coins: q.coins, paid: q.paid || 0, done: !!q.done, timed: !!q.timed, slot: q.slot, cat: q.cat, ...questProgress(q, day, n),
  }));

  return {
    dayKey: today,
    open,
    closed,
    listMonth: s.list?.month || null,
    level,
    levelLabel: LEVEL_LABELS[level],
    commitLevel: day?.commitLevel ?? null,
    bonusAlive,
    reward: day?.reward ? { ...day.reward, eggs: { ...day.reward.eggs, tierName: TIER_LABELS[day.reward.eggs.tier] } } : null,
    progress: { done: taskViews.filter((t) => t.ticked).length, total: n },
    goddamnCount: day ? goddamnCount(day, tasks) : 0,
    goddamnMax: CONFIG.tasks.maxGoddamn,
    tasks: taskViews,
    food: {
      base: foodAt(n, 0),
      earned: raw,
      counted: day?.counted || 0,
      cap: CONFIG.tasks.softCap,
      capRate: CONFIG.tasks.softCapRate,
      projected: capFood(projectedRaw),
      bonusRate: rate,
      bonusPreview: bonusAlive ? capFood(projectedRaw * (1 + rate)) - capFood(projectedRaw) : 0,
      pool,
      activeNeed,
      upkeep,
      leftForGrowth: Math.max(0, pool - activeNeed - upkeep),
    },
    quests,
    weekStars: weekStars(s, today),
    weekStarsNeeded: CONFIG.quests.weekStars,
    season: {
      active: seasonOn,
      month,
      tier: seasonOn ? season.tier : 0,
      xp: seasonOn ? season.xp : 0,
      xpInTier: seasonOn ? (season.tier >= CONFIG.season.tiers ? CONFIG.season.xpPerTier : season.xp - season.tier * CONFIG.season.xpPerTier) : 0,
      xpPerTier: CONFIG.season.xpPerTier,
      maxTier: CONFIG.season.tiers,
      nextReward: seasonOn ? nextSeasonReward(season.tier) : null,
      cosmetic: cosmetic ? { id: cosmetic.id, name: cosmetic.name, seasonName: cosmetic.seasonName, month: cosmetic.season } : null,
      copy: seasonOn ? null : LAUNCH_PROLOGUE.seasonCardCopy,
    },
    prologue: !seasonOn,
  };
}

/** The dismissible morning card (CONTENT.md I.7). Grants nothing. */
export function viewMorning(s, now) {
  const today = dayKey(now);
  const ld = s.lastDay;
  if (!ld || ld.key !== addDays(today, -1)) return null;
  const copy = ENGAGEMENT.behaviours.find((b) => b.id === 'morningReceipt');
  return {
    dayKey: ld.key,
    heading: ld.outcome === 'complete' ? copy.headings.complete : copy.headings.incomplete,
    outcome: ld.outcome,
    tasksDone: ld.done,
    total: ld.total,
    food: ld.foodTotal,
    bonus: ld.bonus,
    levelUps: ld.levelUps,
    streakBefore: ld.streakBefore,
    streakAfter: ld.streakAfter,
    eggsWaiting: s.inv.openEggs.filter((e) => e.laidOn === ld.key).map((e) => ({ id: e.id, tier: e.tier, source: e.source })),
  };
}

// ---- pets ------------------------------------------------------------------------------------------------

export function petView(s, pet, fx, { mood } = {}) {
  const sp = SPECIES_BY_ID[pet.species];
  const cap = tierCap(pet.tier);
  const isActive = pet.location === 'active';
  const abilities = [];
  for (const sk of SKILLS[pet.species] || []) {
    if (sk.lv > cap) continue;
    abilities.push({ kind: 'skill', id: sk.id, name: sk.name, text: sk.desc, unlockLevel: sk.lv, unlocked: pet.level >= sk.lv, active: isActive && pet.level >= sk.lv });
  }
  for (const st of STAR_ABILITIES) {
    abilities.push({ kind: 'star', id: st.id, name: st.name, text: st.desc, stars: st.stars, unlocked: pet.stars >= st.stars, active: isActive && pet.stars >= st.stars });
  }
  const key = s.day?.key || s.lastDay?.key || null;
  const recentLoss = pet.lastLoss && pet.lastLoss.dayKey === s.lastClosed ? { levels: pet.lastLoss.levels, reason: pet.lastLoss.reason } : null;
  return {
    id: pet.id,
    species: pet.species,
    speciesName: sp?.name || pet.species,
    name: pet.name,
    tier: pet.tier,
    tierName: TIER_LABELS[pet.tier],
    stars: pet.stars,
    level: pet.level,
    cap,
    xp: pet.xp,
    xpNext: xpNext(pet.level),
    comebackOwed: pet.comebackOwed,
    penalty: recentLoss,
    fedToday: pet.location === 'dead' ? 0 : fedToday(pet, key),
    need: petNeed(fx, pet),
    meter: pet.meter,
    meterCap: meterCap(pet),
    dividend: dividendOf(fx, pet),
    seatBonus: seatBonus(pet),
    abilities,
    trinkets: pet.trinkets.map((t) => ({ id: t.id, defId: t.defId, name: TRINKET_DEFS[t.defId]?.name || t.defId, tier: trinketTier(t.defId) })),
    mood: mood || moodOf(s, pet, fx),
    beacon: pet.beacon,
    cosmetic: pet.cosmetic ?? s.cosmetic ?? null,
    location: pet.location,
    nineLives: pet.nineLives,
  };
}

export function viewPets(s) {
  const fx = computeEffects(s);
  const fallen = [];
  if (s.ashes) for (const p of s.ashes.pets) fallen.push(petView(s, p, fx, { mood: p.id === s.ashes.petId ? 'ashes' : 'dead' }));
  for (const p of s.graveyard.slice(-CONFIG.history.fallenShown)) fallen.push(petView(s, p, fx, { mood: 'dead' }));
  return {
    seats: seatInfo(s),
    active: s.pets.filter((p) => p.location === 'active').map((p) => petView(s, p, fx)),
    backpack: s.pets.filter((p) => p.location === 'backpack').map((p) => petView(s, p, fx)),
    backpackCap: backpackCap(s),
    upkeepEach: upkeepCost(fx),
    fallen,
    companionId: s.settings.companionId && s.pets.some((p) => p.id === s.settings.companionId) ? s.settings.companionId : (s.pets.find((p) => p.location === 'active')?.id || null),
  };
}

// ---- eggs ------------------------------------------------------------------------------------------------

export { hatchOdds };

export function viewEggs(s) {
  const fx = computeEffects(s);
  const luck = teamHatchLuck(fx);
  return {
    openEggs: s.inv.openEggs.map((e) => ({ id: e.id, tier: e.tier, tierName: TIER_LABELS[e.tier], source: e.source, extraItems: e.extraItems, laidOn: e.laidOn })),
    petEggs: s.inv.petEggs.map((e) => ({
      id: e.id, tier: e.tier, tierName: TIER_LABELS[e.tier], servings: e.fed.length, need: hatchNeed(e), fed: e.fed.slice(), charm: e.charm, guaranteed: !!e.guaranteed, source: e.source,
      ready: e.fed.length >= hatchNeed(e),
      odds: hatchOdds(e.tier, e.fed, { luckPts: luck, charm: e.charm, guaranteed: e.guaranteed }),
      canCharm: !e.charm && e.tier < ULTRA,
      canSprout: !e.charm && e.tier <= CONFIG.hatch.sproutMaxTier,
      separateYield: CONFIG.hatch.separate[e.tier],
    })),
    eggFood: s.inv.eggFood.slice(),
    charms: { ...s.inv.charms },
    beacons: s.inv.beacons,
    treats: s.inv.treats.map((t) => ({ ...t, tierName: TIER_LABELS[t.tier] })),
    trinkets: s.inv.trinkets.map((t) => ({ id: t.id, defId: t.defId, name: TRINKET_DEFS[t.defId]?.name || t.defId, tier: trinketTier(t.defId), flavour: TRINKET_DEFS[t.defId]?.flavour || '' })),
    hatchLuckPts: luck,
  };
}

// ---- collection ------------------------------------------------------------------------------------------

export function viewCollection(s) {
  const pets = s.pets;
  const mergePairs = [];
  const combinePairs = [];
  for (let i = 0; i < pets.length; i += 1) {
    for (let j = i + 1; j < pets.length; j += 1) {
      const a = pets[i];
      const b = pets[j];
      if (a.species === b.species && a.tier === b.tier && a.stars === b.stars && a.stars < CONFIG.pets.maxStars) {
        mergePairs.push({ aId: a.id, bId: b.id, odds: { stars: a.stars + 1, mutation: a.tier < ULTRA ? CONFIG.merge.mutation : 0, keepsLevel: Math.max(a.level, b.level) } });
      }
      if (a.tier === b.tier && a.species !== b.species && a.tier < ULTRA) {
        combinePairs.push({ aId: a.id, bId: b.id, odds: { success: CONFIG.merge.combine[a.tier], resultTier: a.tier + 1, species: [a.species, b.species] } });
      }
    }
  }
  const eggCombinePairs = [];
  const eggs = s.inv.petEggs;
  for (let i = 0; i < eggs.length; i += 1) {
    for (let j = i + 1; j < eggs.length; j += 1) {
      if (eggs[i].tier === eggs[j].tier && eggs[i].tier < ULTRA) {
        eggCombinePairs.push({ aId: eggs[i].id, bId: eggs[j].id, odds: { success: CONFIG.merge.combine[eggs[i].tier], resultTier: eggs[i].tier + 1 } });
      }
    }
  }
  return {
    mergePairs,
    combinePairs,
    eggCombinePairs,
    petdex: viewPetdex(s),
  };
}

export function viewPetdex(s) {
  const cells = {};
  for (const sp of SPECIES) {
    for (let t = 0; t < TIERS.length; t += 1) {
      const hit = s.petdex[`${sp.id}:${t}`];
      cells[`${sp.id}:${t}`] = { found: !!hit, firstDay: hit?.firstDay || null };
    }
  }
  return {
    species: SPECIES.map((sp) => ({ id: sp.id, name: sp.name, unlocked: s.unlockedSpecies.includes(sp.id) })),
    tiers: TIERS.length,
    tierNames: TIER_LABELS.slice(),
    cells,
    found: Object.keys(s.petdex).length,
    rewards: TIER_LABELS.map((_, t) => ({ coins: CONFIG.petdex.coinsPerTier * (t + 1), diamonds: CONFIG.petdex.diamonds[t] })),
  };
}

// ---- shop ------------------------------------------------------------------------------------------------

const TAB_LABELS = [['items', 'Items'], ['pets', 'Pets'], ['eggs', 'Eggs'], ['boosters', 'Boosters'], ['trinkets', 'Trinkets'], ['reallife', 'Real life']];

export function viewShop(s, now) {
  const items = catalogue(s, now);
  const rewards = s.rewards.map((r) => {
    const block = rewardBlock(s, r, now);
    return {
      ...r,
      price: r.coins,
      currency: 'coins',
      canBuy: !block,
      reasonCode: block ? block[0] : null,
      reason: block ? block[1] : null,
      owned: null,
      max: r.maxPerDay || null, // per day
    };
  });
  const tabs = TAB_LABELS.map(([id, label]) => ({
    id,
    label,
    items: id === 'reallife' ? rewards : items.filter((i) => i.tab === id).map(({ tab, ...rest }) => rest),
  }));
  return {
    coins: s.inv.coins,
    diamonds: s.inv.diamonds,
    shards: s.inv.shards,
    tabs,
    flashSale: flashSaleActive(s, now) ? { until: s.shop.flashSale.until, price: s.shop.flashSale.price, offers: s.shop.flashSale.offers.map((d) => ({ defId: d, name: TRINKET_DEFS[d].name, flavour: TRINKET_DEFS[d].flavour })) } : null,
    rewards,
    redemptions: s.redemptions.slice().reverse(),
    guidance: REAL_LIFE.guidanceCopy,
  };
}

// ---- odds ------------------------------------------------------------------------------------------------

export function viewOdds() {
  const e = CONFIG.eggs;
  const dist = itemCountDistribution();
  return {
    tiers: TIER_LABELS.slice(),
    petEggChance: { laid: e.petEggChance.laid.slice(), other: e.petEggChance.other.slice(), note: 'Rolled once per egg. "Other" = streak, weekly chest, season and welcome-back eggs.' },
    petEggSplit: { laid: e.laidSplit.map((r) => r.slice()), other: e.otherSplit.slice(), columns: ['same', '+1', '+2'] },
    itemCount: { base: e.itemBase, trials: e.itemTrials, p: e.itemP, mean: e.itemBase + e.itemTrials * e.itemP, min: e.itemBase, max: e.itemBase + e.itemTrials, distribution: dist, levelBonus: { per: CONFIG.pets.levelsPerItem, max: CONFIG.pets.maxLevelItems } },
    loot: e.loot.map((l) => ({ kind: l.kind, weight: l.weight, minTier: l.minTier ?? null })),
    lootAmounts: { coins: e.lootCoins.slice(), coinRange: e.lootCoinRange.slice(), diamonds: e.lootDiamonds.slice(), eggFood: { min: e.eggFoodMin, max: e.eggFoodMax, tierSplit: e.eggFoodTierSplit.slice() }, treatXpPerTier: e.treatXpPerTier },
    ultraTrinket: e.ultraTrinketChance,
    hatch: { base: { same: 1 - CONFIG.hatch.baseUp, up: CONFIG.hatch.baseUp }, foodBonus: CONFIG.hatch.foodBonus, ownFloor: CONFIG.hatch.ownFloor, servings: CONFIG.hatch.servings.slice() },
    charm: { chance: CONFIG.hatch.charmChance, servingsMult: CONFIG.hatch.charmServingsMult, sproutMaxTier: CONFIG.hatch.sproutMaxTier, shopKind: CONFIG.charms.shop, seasonKind: CONFIG.charms.season },
    merge: { mutation: CONFIG.merge.mutation },
    combine: CONFIG.merge.combine.slice(),
    separate: CONFIG.hatch.separate.slice(),
    streak: { bands: CONFIG.streak.bands.map((b) => ({ ...b })), luckyDays: CONFIG.streak.luckyDays.slice(), lucky: { min: CONFIG.streak.luckyMin, max: CONFIG.streak.luckyMax } },
    flashSale: { price: flashSalePrice(), floor: CONFIG.trinkets.flashFloor, hours: CONFIG.trinkets.flashHours },
  };
}

// ---- receipts --------------------------------------------------------------------------------------------

function receiptOut(agg) {
  return {
    pagesRead: agg.pages,
    hoursOutside: Math.round((agg.outsideMin / 60) * 10) / 10,
    workouts: agg.workouts,
    avgSleepHours: agg.sleepN ? Math.round((agg.sleepSum / agg.sleepN) * 10) / 10 : null,
    hardOrAbove: agg.hardOrAbove,
    tasksDone: agg.ticks,
    deepWorkHours: Math.round((agg.deepMin / 60) * 10) / 10,
    vegServings: agg.veg,
    food: agg.food,
  };
}

export function viewReceipts(s, now, { includeGoals = true } = {}) {
  const today = dayKey(now);
  const month = monthOf(today);
  const m = { ...emptyAggregate(), ...(s.receipts.months[month] || {}) };
  const life = { ...emptyAggregate(), ...s.receipts.lifetime };
  const tasks = s.list?.tasks || [];
  const goals = { ...s.receipts.goals };
  if (s.day && s.day.key === today) {
    for (const [taskId, tick] of Object.entries(s.day.ticks)) {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) continue;
      addTickToAggregate(m, task, tick);
      addTickToAggregate(life, task, tick);
      if (task.goal) goals[task.goal] = (goals[task.goal] || 0) + 1;
    }
  }
  const out = { month: { key: month, ...receiptOut(m) }, lifetime: receiptOut(life) };
  if (includeGoals) {
    const linked = [...new Set(tasks.map((t) => t.goal).filter(Boolean))];
    out.goals = [...new Set([...linked, ...Object.keys(goals)])].map((g) => ({ goal: g, tasksDone: goals[g] || 0 }));
    const wk = mondayOf(today);
    out.deepTags = Object.entries(s.receipts.deepTags).map(([tag, led]) => ({ tag, totalHours: Math.round((led.total / 60) * 10) / 10, weekHours: Math.round(((led.weeks[wk] || 0) / 60) * 10) / 10 }));
  }
  return out;
}

// ---- ladder ----------------------------------------------------------------------------------------------

export function viewLadder(s) {
  const tasks = s.list?.tasks || [];
  const n = tasks.length;
  const levels = LEVELS.map((id, i) => ({ id, label: LEVEL_LABELS[i], qtyMult: CONFIG.tasks.qtyMult[i], foodMult: CONFIG.tasks.foodMult[i], dayLevel: i <= CONFIG.tasks.dayLevelMax }));
  const rows = tasks.map((t) => ({ taskId: t.id, name: t.name, type: t.type, physical: t.physical, cells: Object.fromEntries(LEVELS.map((id, i) => [id, amountText(t, i)])) }));
  const foodRow = Object.fromEntries(LEVELS.map((id, i) => [id, foodAt(n, i)]));
  const dayTotals = Object.fromEntries(LEVELS.slice(0, CONFIG.tasks.dayLevelMax + 1).map((id, i) => {
    const raw = foodAt(n, i) * n;
    return [id, { raw, withBonus: capFood(raw * (1 + CONFIG.tasks.commitBonus)) }];
  }));
  return { levels, rows, foodRow, dayTotals, softCap: CONFIG.tasks.softCap, softCapRate: CONFIG.tasks.softCapRate, maxGoddamn: CONFIG.tasks.maxGoddamn };
}

export const QUEST_POOL = QUESTS.pool;
