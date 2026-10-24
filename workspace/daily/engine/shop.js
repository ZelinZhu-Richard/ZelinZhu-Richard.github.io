// Shop (PLAN.md §12): every purchase is an engine transaction. Prices live in config.js.
// Also the Ultra flash sale (PLAN.md §10, CONTENT.md D) and the real-life rewards catalogue + redemption log.

import { CONFIG, TIER_LABELS, ULTRA } from './config.js';
import { REAL_LIFE, TRINKETS } from './content.js';
import { TRINKET_DEFS, TRINKET_TIER } from './effects.js';
import { canHouse, createPet, placePet, randomSpecies } from './pets.js';
import { discover } from './progress.js';
import { addPetEgg, addTrinket, fail, newId, spend } from './state.js';
import { dayKey as dayKeyOf } from './time.js';

const HOUR = 3_600_000;

// ---- Ultra flash sale ------------------------------------------------------------------------------------

export function flashSalePrice() {
  const t = CONFIG.trinkets;
  return Math.max(t.flashFloor, Math.round(t.ultraBase * (1 - t.flashDiscount)));
}

export const flashSaleActive = (s, now) => !!s.shop.flashSale && now < s.shop.flashSale.until;

/** Start a 24-hour sale of every Ultra trinket at 30 % off (never below the floor). No-op while one is running. */
export function startFlashSale(s, at, reason, events) {
  if (s.shop.flashSale && at < s.shop.flashSale.until) return null;
  const sale = {
    startedAt: at,
    until: at + CONFIG.trinkets.flashHours * HOUR,
    price: flashSalePrice(),
    offers: TRINKETS.filter((t) => TRINKET_TIER[t.tier] === ULTRA).map((t) => t.id),
    reason,
  };
  s.shop.flashSale = sale;
  events?.push({ type: 'flashSale.started', until: sale.until, price: sale.price, reason });
  return sale;
}

export function expireFlashSale(s, now) {
  if (s.shop.flashSale && now >= s.shop.flashSale.until) s.shop.flashSale = null;
}

// ---- catalogue -------------------------------------------------------------------------------------------

const PET_EGG_NAMES = { 3: 'Epic pet egg', 4: 'Mythic pet egg', 5: 'Legendary pet egg' };

/** Every item with its price and whether it can be bought right now. The view and buy() share this. */
export function catalogue(s, now) {
  const c = CONFIG;
  const items = [];
  const add = (tab, it) => items.push({ tab, max: null, owned: null, ...it });

  add('items', { id: 'freeze', name: 'Streak freeze', price: c.freezes.price, currency: 'coins', owned: s.inv.freezes, max: c.freezes.cap,
    block: s.inv.freezes >= c.freezes.cap ? ['freeze_cap', `You can hold at most ${c.freezes.cap} freezes.`] : null });
  const seatN = s.shop.seatsBought;
  add('items', { id: 'seat', name: 'Extra seat', price: c.seats.prices[Math.min(seatN, c.seats.prices.length - 1)], currency: 'diamonds', owned: seatN, max: c.seats.prices.length,
    block: seatN >= c.seats.prices.length ? ['seat_max', `You can buy at most ${c.seats.prices.length} seats.`] : null });
  const bpN = s.shop.backpackBought;
  add('items', { id: 'backpack', name: `Backpack +${c.backpack.upgradeSize}`, price: c.backpack.upgradePrices[Math.min(bpN, c.backpack.upgradePrices.length - 1)], currency: 'coins', owned: bpN, max: c.backpack.upgradePrices.length,
    block: bpN >= c.backpack.upgradePrices.length ? ['backpack_max', 'The backpack is fully upgraded.'] : null });

  for (const [tier, price] of Object.entries(c.shop.pets)) {
    add('pets', { id: `pet:${tier}`, name: `${TIER_LABELS[tier]} pet`, price, currency: 'diamonds', tier: Number(tier),
      block: canHouse(s, { tier: Number(tier), beacon: false }) ? null : ['backpack_full', 'Your backpack is full. Release, merge or combine a pet first.'] });
  }
  for (const [tier, price] of Object.entries(c.shop.petEggs)) {
    add('eggs', { id: `petEgg:${tier}`, name: PET_EGG_NAMES[tier] || `${TIER_LABELS[tier]} pet egg`, price, currency: 'diamonds', tier: Number(tier) });
  }

  const shopCharm = c.charms.shop;
  add('boosters', { id: 'charm', name: shopCharm === 'sprout' ? 'Sprout charm' : 'Tier charm', charm: shopCharm, price: c.shop.charm, currency: 'diamonds', owned: s.inv.charms[shopCharm] });
  add('boosters', { id: 'beacon', name: 'Beacon', price: c.shop.beacon, currency: 'diamonds', owned: s.inv.beacons });
  add('boosters', { id: 'food:rare', name: `Rare egg food ×${c.shop.rareFood.count}`, price: c.shop.rareFood.coins, currency: 'coins' });
  add('boosters', { id: 'food:superRare', name: `Super Rare egg food ×${c.shop.superRareFood.count}`, price: c.shop.superRareFood.diamonds, currency: 'diamonds' });

  for (const t of TRINKETS) {
    const tier = TRINKET_TIER[t.tier];
    if (tier >= ULTRA) continue;
    add('trinkets', { id: `trinket:${t.id}`, name: t.name, price: c.trinkets.prices[tier], currency: 'diamonds', tier, defId: t.id });
  }
  if (flashSaleActive(s, now)) {
    for (const defId of s.shop.flashSale.offers) {
      add('trinkets', { id: `ultra:${defId}`, name: TRINKET_DEFS[defId].name, price: s.shop.flashSale.price, currency: 'diamonds', tier: ULTRA, defId, flash: true, until: s.shop.flashSale.until });
    }
  }

  for (const it of items) {
    let reason = it.block;
    if (!reason && s.inv[it.currency] < it.price) reason = [`not_enough_${it.currency}`, `${it.name} costs ${it.price} ${it.currency}; you have ${s.inv[it.currency]}.`];
    it.canBuy = !reason;
    it.reasonCode = reason ? reason[0] : null;
    it.reason = reason ? reason[1] : null;
    delete it.block;
  }
  return items;
}

export function buy(s, itemId, rng, ctx, now) {
  const it = catalogue(s, now).find((i) => i.id === itemId);
  if (!it) fail('no_item', 'That item is not for sale.');
  if (!it.canBuy) fail(it.reasonCode, it.reason);
  spend(s, it.currency, it.price, it.name);
  const ev = { type: 'shop.bought', itemId, price: it.price, currency: it.currency };
  const c = CONFIG;
  if (itemId === 'freeze') s.inv.freezes += 1;
  else if (itemId === 'seat') s.shop.seatsBought += 1;
  else if (itemId === 'backpack') s.shop.backpackBought += 1;
  else if (itemId === 'charm') s.inv.charms[c.charms.shop] += 1;
  else if (itemId === 'beacon') s.inv.beacons += 1;
  else if (itemId === 'food:rare') s.inv.eggFood[1] += c.shop.rareFood.count;
  else if (itemId === 'food:superRare') s.inv.eggFood[2] += c.shop.superRareFood.count;
  else if (itemId.startsWith('pet:')) {
    const pet = createPet(s, { tier: it.tier, species: randomSpecies(s, rng), rng, dayKey: ctx.dayKey, source: 'shop' });
    placePet(s, pet);
    ev.pet = { id: pet.id, species: pet.species, name: pet.name, tier: pet.tier, location: pet.location };
    ctx.events.push(ev);
    discover(s, pet.species, pet.tier, ctx.dayKey, ctx.events);
    return ev;
  } else if (itemId.startsWith('petEgg:')) {
    const egg = addPetEgg(s, { tier: it.tier, source: 'shop' });
    ev.petEgg = { id: egg.id, tier: egg.tier };
  } else if (itemId.startsWith('trinket:')) {
    const inst = addTrinket(s, it.defId);
    ev.trinket = { id: inst.id, defId: it.defId };
  } else if (itemId.startsWith('ultra:')) {
    const inst = addTrinket(s, it.defId);
    s.shop.flashSale.offers = s.shop.flashSale.offers.filter((d) => d !== it.defId);
    ev.trinket = { id: inst.id, defId: it.defId };
  }
  ctx.events.push(ev);
  return ev;
}

// ---- real-life rewards -----------------------------------------------------------------------------------

/** Why a reward can't be redeemed right now: [code, message] or null. Shared by redeemReward and viewShop. */
export function rewardBlock(s, r, now) {
  const key = dayKeyOf(now);
  if (r.maxPerDay && s.redemptions.filter((x) => x.rewardId === r.id && x.dayKey === key).length >= r.maxPerDay) {
    return ['reward_daily_max', `${r.name} can be redeemed ${r.maxPerDay === 1 ? 'once' : `${r.maxPerDay} times`} a day.`];
  }
  if (s.inv.coins < r.coins) return ['not_enough_coins', `${r.name} costs ${r.coins} coins; you have ${s.inv.coins}.`];
  return null;
}

export function redeemReward(s, rewardId, now, ctx) {
  const r = s.rewards.find((x) => x.id === rewardId);
  if (!r) fail('no_reward', 'That reward is not in the catalogue.');
  const key = dayKeyOf(now);
  const block = rewardBlock(s, r, now);
  if (block && block[0] === 'reward_daily_max') fail(...block);
  spend(s, 'coins', r.coins, r.name);
  const red = { id: newId(s, 'rd'), rewardId, name: r.name, coins: r.coins, at: now, dayKey: key, taken: false };
  s.redemptions.push(red);
  if (s.redemptions.length > CONFIG.history.redemptions) s.redemptions = s.redemptions.slice(-CONFIG.history.redemptions);
  ctx.events.push({ type: 'reward.redeemed', redemptionId: red.id, rewardId, coins: r.coins, copy: REAL_LIFE.redemptionCopy });
}

export function markRewardTaken(s, redemptionId, taken, ctx) {
  const red = s.redemptions.find((x) => x.id === redemptionId);
  if (!red) fail('no_redemption', 'That redemption is not in the log.');
  red.taken = taken !== false;
  ctx.events.push({ type: 'reward.taken', redemptionId, taken: red.taken });
}

export function saveRewards(s, rewards, ctx) {
  const lim = CONFIG.rewards;
  if (!Array.isArray(rewards) || rewards.length > lim.max) fail('bad_rewards', `Rewards must be a list of at most ${lim.max} items.`);
  const ids = new Set();
  const out = rewards.map((r, i) => {
    const name = typeof r?.name === 'string' ? r.name.trim().slice(0, lim.nameMax) : '';
    const coins = Number(r?.coins);
    if (!name) fail('bad_rewards', `Reward ${i + 1} needs a name.`);
    if (!Number.isInteger(coins) || coins < 1 || coins > lim.coinsMax) fail('bad_rewards', `${name}: price must be a whole number of coins from 1 to ${lim.coinsMax.toLocaleString('en-US')}.`);
    let id = typeof r.id === 'string' && r.id.trim() ? r.id.trim().slice(0, lim.idMax) : `reward${i + 1}`;
    while (ids.has(id)) id = `${id}x`;
    ids.add(id);
    const row = { id, name, coins, size: ['S', 'M', 'L'].includes(r.size) ? r.size : null };
    if (Number.isInteger(r.maxPerDay) && r.maxPerDay > 0) row.maxPerDay = r.maxPerDay;
    if (typeof r.endsBy === 'string' && /^\d{2}:\d{2}$/.test(r.endsBy)) row.endsBy = r.endsBy;
    if (r.weekendOnly === true) row.weekendOnly = true;
    return row;
  });
  s.rewards = out;
  ctx.events.push({ type: 'reward.saved', count: out.length });
}
