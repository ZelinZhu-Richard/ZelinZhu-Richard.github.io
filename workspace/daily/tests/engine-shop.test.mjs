// Engine: the shop (freeze cap, seats, backpack upgrades, guaranteed pets and eggs, boosters, charm kind by
// config, trinkets), the Ultra flash sale (triggers, window, price floor) and real-life rewards.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine/index.js';

const T = E.time;
const at = (key, hh, mm = 0) => T.nyInstant(key, hh * 60 + mm);
const D = '2026-11-02';
const act = (s, a, now = at(D, 9)) => E.applyAction(s, a, now);
const buy = (s, itemId, now) => act(s, { type: 'shop/buy', itemId }, now);

function start() {
  let s = E.newGame({ seed: 44, now: at(D, 8), tasks: E.DEFAULT_TASKS });
  s = act(s, { type: 'petEgg/hatch', petEggId: s.inv.petEggs[0].id }, at(D, 8, 1)).state;
  return s;
}
function playDay(s, key) {
  for (const t of s.list.tasks) s = act(s, { type: 'task/tick', taskId: t.id }, at(key, 9)).state;
  return s;
}

test('extra seats: 150 / 400 / 1,000 diamonds, at most 3', () => {
  let s = start();
  s.inv.diamonds = 1550;
  for (const price of [150, 400, 1000]) {
    const item = E.viewShop(s, at(D, 9)).tabs[0].items.find((i) => i.id === 'seat');
    assert.equal(item.price, price);
    s = buy(s, 'seat').state;
  }
  assert.equal(s.inv.diamonds, 0);
  assert.equal(E.viewPets(s).seats.total, 6);
  s.inv.diamonds = 5000;
  assert.throws(() => buy(s, 'seat'), { code: 'seat_max' });
  assert.equal(E.viewShop(s, at(D, 9)).tabs[0].items.find((i) => i.id === 'seat').canBuy, false);
});

test('backpack upgrades: +2 for 1,000 / 2,000 / 4,000 coins', () => {
  let s = start();
  s.inv.coins = 7000;
  for (let i = 0; i < 3; i += 1) s = buy(s, 'backpack').state;
  assert.equal(s.inv.coins, 0);
  assert.equal(E.viewPets(s).backpackCap, 18);
  s.inv.coins = 9999;
  assert.throws(() => buy(s, 'backpack'), { code: 'backpack_max' });
});

test('freeze: 600 coins, hold at most 3', () => {
  let s = start();
  assert.throws(() => buy(s, 'freeze'), { code: 'not_enough_coins' });
  s.inv.coins = 3000;
  for (let i = 0; i < 3; i += 1) s = buy(s, 'freeze').state;
  assert.throws(() => buy(s, 'freeze'), { code: 'freeze_cap' });
  assert.equal(s.inv.coins, 1200);
});

test('guaranteed pets and pet eggs; boosters; regular trinkets', () => {
  let s = start();
  s.inv.diamonds = 100000;
  s.inv.coins = 400;
  let r = buy(s, 'pet:4');
  const ev = r.events.find((e) => e.type === 'shop.bought');
  assert.equal(ev.pet.tier, 4);
  assert.equal(r.state.inv.diamonds, 100000 - 3000 + 10); // + the Petdex discovery
  assert.ok(r.events.some((e) => e.type === 'petdex.discovered' && e.tier === 4 && e.diamonds === 10));
  s = r.state;
  s = buy(s, 'petEgg:3').state;
  assert.equal(s.inv.petEggs.at(-1).tier, 3);
  s = buy(s, 'food:rare').state;
  assert.equal(s.inv.eggFood[1], 10);
  assert.equal(s.inv.coins, 500, '400 − 400 + 500 from the Mythic Petdex discovery');
  s = buy(s, 'food:superRare').state;
  assert.equal(s.inv.eggFood[2], 5);
  s = buy(s, 'beacon').state;
  assert.equal(s.inv.beacons, 1);
  const prices = Object.fromEntries(E.viewShop(s, at(D, 9)).tabs.find((t) => t.id === 'trinkets').items.map((i) => [i.defId, i.price]));
  assert.equal(prices.copperBell, 150);
  assert.equal(prices.fourfoldClover, 500);
  assert.equal(prices.aegisShell, 1500);
  assert.equal(prices.heartstone, undefined, 'Ultra trinkets are never in the shop normally');
  s = buy(s, 'trinket:aegisShell').state;
  assert.equal(s.inv.trinkets.at(-1).defId, 'aegisShell');
  assert.deepEqual(Object.keys(E.CONFIG.shop.pets), ['3', '4', '5']);
  assert.deepEqual([E.CONFIG.shop.petEggs[3], E.CONFIG.shop.petEggs[4], E.CONFIG.shop.petEggs[5]], [250, 2000, 10000]);
});

test('the shop charm and the season tier-20 charm kind come from config (default: the Sprout charm, CONTENT.md H.2)', () => {
  assert.deepEqual(E.CONFIG.charms, { shop: 'sprout', season: 'sprout' });
  E.setConfig({ charms: { shop: 'tier' } });
  let s = start();
  s.inv.diamonds = 120;
  s = buy(s, 'charm').state;
  assert.deepEqual(s.inv.charms, { tier: 1, sprout: 0 });
  E.resetConfig();
  try {
    s = buy(s, 'charm').state;
    assert.deepEqual(s.inv.charms, { tier: 1, sprout: 1 });
    assert.equal(E.viewShop(s, at(D, 9)).tabs.find((t) => t.id === 'boosters').items[0].name, 'Sprout charm');
  } finally {
    E.resetConfig();
  }
});

test('Ultra flash sale: 30 % off 22,000 = 15,400, never below the 15,000 floor', () => {
  assert.equal(E.flashSalePrice(), 15400);
  E.setConfig({ trinkets: { ultraBase: 20000 } });
  try {
    assert.equal(E.flashSalePrice(), 15000, '14,000 would be under the floor');
  } finally {
    E.resetConfig();
  }
  E.setConfig({ trinkets: { flashDiscount: 0.9 } });
  try {
    assert.equal(E.flashSalePrice(), 15000);
  } finally {
    E.resetConfig();
  }
});

test('flash sale triggers on streak 100, lasts 24 hours, sells every Ultra trinket in the shop only', () => {
  let s = start();
  s.streak = 99;
  s = playDay(s, D);
  const r = E.advance(s, at('2026-11-03', 7));
  const ev = r.events.find((e) => e.type === 'flashSale.started');
  assert.ok(ev);
  assert.equal(ev.price, 15400);
  assert.equal(ev.until, T.closeInstant(D) + 24 * 3_600_000);
  s = r.state;
  const shop = E.viewShop(s, at('2026-11-03', 9));
  assert.equal(shop.flashSale.offers.length, 5);
  const ultra = shop.tabs.find((t) => t.id === 'trinkets').items.filter((i) => i.flash);
  assert.equal(ultra.length, 5);
  assert.ok(ultra.every((i) => i.price === 15400 && !i.canBuy));
  s.inv.diamonds = 20000;
  const b = buy(s, 'ultra:theLongSun', at('2026-11-03', 9));
  assert.equal(b.state.inv.diamonds, 4600);
  assert.equal(b.state.shop.flashSale.offers.length, 4);
  // 24 h later it's gone.
  const later = E.advance(b.state, T.closeInstant(D) + 24 * 3_600_000);
  assert.equal(later.state.shop.flashSale, null);
  assert.throws(() => buy(later.state, 'ultra:keepersCrown', T.closeInstant(D) + 24 * 3_600_000 + 1), { code: 'no_item' });
});

test('flash sale triggers on a Goddamn day (2 Goddamn tasks, every other at Hard or above)', () => {
  let s = start();
  s = act(s, { type: 'day/setLevel', level: 'hard' }).state;
  s = act(s, { type: 'task/raise', taskId: 'read', level: 'goddamn' }).state;
  s = act(s, { type: 'task/raise', taskId: 'grass', level: 'goddamn' }).state;
  s = playDay(s, D);
  assert.ok(E.advance(s, at('2026-11-03', 7)).events.some((e) => e.type === 'flashSale.started' && e.reason === 'goddamnDay'));
  // One Goddamn task is not enough.
  let t = start();
  t = act(t, { type: 'day/setLevel', level: 'hard' }).state;
  t = act(t, { type: 'task/raise', taskId: 'read', level: 'goddamn' }).state;
  t = playDay(t, D);
  assert.ok(!E.advance(t, at('2026-11-03', 7)).events.some((e) => e.type === 'flashSale.started'));
});

test('flash sale triggers on hatching the first pet of a new highest tier (not the starter)', () => {
  const s0 = E.newGame({ seed: 44, now: at(D, 8), tasks: E.DEFAULT_TASKS });
  const r0 = act(s0, { type: 'petEgg/hatch', petEggId: s0.inv.petEggs[0].id });
  assert.ok(!r0.events.some((e) => e.type === 'flashSale.started'));
  const s = r0.state;
  s.inv.petEggs.push({ id: 'peR', tier: 1, fed: [0, 0, 0, 0, 0, 0], charm: null, guaranteed: true, source: 'test' });
  const r = act(s, { type: 'petEgg/hatch', petEggId: 'peR' });
  assert.ok(r.events.some((e) => e.type === 'flashSale.started' && e.reason === 'newTier:1'));
  r.state.inv.petEggs.push({ id: 'peR2', tier: 1, fed: [0, 0, 0, 0, 0, 0], charm: null, guaranteed: true, source: 'test' });
  r.state.shop.flashSale = null;
  assert.ok(!act(r.state, { type: 'petEgg/hatch', petEggId: 'peR2' }).events.some((e) => e.type === 'flashSale.started'));
});

test('real-life rewards: redeem for coins, logged; the gaming hour once a day; mark taken; owner edits', () => {
  let s = start();
  s.inv.coins = 2000;
  let r = act(s, { type: 'reward/redeem', rewardId: 'gamingHour' });
  assert.equal(r.state.inv.coins, 1400);
  assert.equal(r.state.redemptions.length, 1);
  assert.match(r.events[0].copy, /Enjoy it/);
  assert.throws(() => act(r.state, { type: 'reward/redeem', rewardId: 'gamingHour' }), { code: 'reward_daily_max' });
  assert.equal(act(r.state, { type: 'reward/redeem', rewardId: 'gamingHour' }, at('2026-11-03', 9)).state.inv.coins, 800);
  assert.throws(() => act(r.state, { type: 'reward/redeem', rewardId: 'ticket' }), { code: 'not_enough_coins' });
  r = act(r.state, { type: 'reward/markTaken', redemptionId: r.state.redemptions[0].id });
  assert.equal(r.state.redemptions[0].taken, true);
  r = act(r.state, { type: 'reward/save', rewards: [{ name: 'Climbing gym', coins: 1500, size: 'M' }] });
  assert.deepEqual(r.state.rewards, [{ id: 'reward1', name: 'Climbing gym', coins: 1500, size: 'M' }]);
  assert.throws(() => act(r.state, { type: 'reward/save', rewards: [{ name: 'Free', coins: 0 }] }), { code: 'bad_rewards' });
  assert.equal(E.viewShop(r.state, at(D, 9)).tabs.find((t) => t.id === 'reallife').items.length, 1);
});
