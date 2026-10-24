// Engine: a seeded season of play through the public API only, checking invariants every day; plus the small
// per-pet actions (treats, cosmetics, settings, seats).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine/index.js';

const T = E.time;
const at = (key, hh, mm = 0) => T.nyInstant(key, hh * 60 + mm);
const D = '2026-11-02';
const act = (s, a, now) => E.applyAction(s, a, now);

function invariants(s, now) {
  const seats = E.viewPets(s).seats;
  assert.ok(seats.used <= seats.total && seats.total <= 15, 'seats');
  for (const p of s.pets) {
    assert.ok(p.level >= 1 && p.level <= E.CONFIG.pets.levelCaps[p.tier], `level ${p.level} tier ${p.tier}`);
    assert.ok(p.stars >= 1 && p.stars <= 5);
    assert.ok(p.xp >= 0 && p.comebackOwed >= 0 && p.meter >= 0 && p.meter < E.CONFIG.pets.meterCap[p.tier]);
    assert.ok(p.trinkets.length <= 5);
  }
  assert.ok(s.inv.coins >= 0 && s.inv.diamonds >= 0 && s.inv.shards >= 0 && s.inv.shards < 10);
  assert.ok(s.inv.eggFood.every((n) => Number.isInteger(n) && n >= 0));
  assert.ok(s.inv.freezes >= 0 && s.inv.freezes <= 3);
  assert.ok(s.streak <= s.best);
  assert.equal(new Set(s.pets.map((p) => p.id)).size, s.pets.length);
  const json = JSON.stringify(s);
  assert.deepEqual(JSON.parse(json), s, 'the state is plain JSON');
  E.publicSnapshot(s, now);
}

test('120 seeded days of Medium play: invariants hold and the systems all fire', () => {
  let s = E.newGame({ seed: 2026, now: at(D, 7), tasks: E.DEFAULT_TASKS });
  const seen = new Set();
  const note = (r) => {
    for (const e of r.events) seen.add(e.type);
    return r.state;
  };
  s = note(act(s, { type: 'petEgg/hatch', petEggId: s.inv.petEggs[0].id }, at(D, 7)));
  for (let k = 0; k < 120; k += 1) {
    const key = T.addDays(D, k);
    s = note(E.advance(s, at(key, 6)));
    const miss = k % 29 === 28 || k === 60 || k === 61;
    if (!miss) {
      s = note(act(s, { type: 'day/setLevel', level: 'medium' }, at(key, 7)));
      for (const t of s.list.tasks) s = note(act(s, { type: 'task/tick', taskId: t.id }, at(key, 8 + (k % 5))));
      const active = s.pets.filter((p) => p.location === 'active');
      for (const p of active) if (s.day.pool >= 100) s = note(act(s, { type: 'pet/feed', petId: p.id, amount: 100 }, at(key, 14)));
      const up = s.pets.filter((p) => p.location === 'backpack').length * 10;
      if (active.length && s.day.pool - up > 0) s = note(act(s, { type: 'pet/feed', petId: active[0].id, amount: s.day.pool - up }, at(key, 14)));
    }
    for (const e of s.inv.openEggs.slice()) s = note(act(s, { type: 'egg/open', eggId: e.id }, at(key, 15)));
    for (const t of s.inv.treats.slice()) {
      const target = s.pets.find((p) => p.level < E.CONFIG.pets.levelCaps[p.tier]);
      if (target) s = note(act(s, { type: 'pet/useTreat', petId: target.id, treatId: t.id }, at(key, 15)));
    }
    for (const egg of s.inv.petEggs.slice().sort((a, b) => b.tier - a.tier)) {
      let cur = s.inv.petEggs.find((e) => e.id === egg.id);
      while (cur && cur.fed.length < E.viewEggs(s).petEggs.find((e) => e.id === egg.id).need) {
        const tier = s.inv.eggFood.findLastIndex((n) => n > 0);
        if (tier < 0) break;
        s = note(act(s, { type: 'petEgg/feed', petEggId: egg.id, foodTier: tier }, at(key, 16)));
        cur = s.inv.petEggs.find((e) => e.id === egg.id);
      }
      if (cur && E.viewEggs(s).petEggs.find((e) => e.id === egg.id).ready) {
        try {
          s = note(act(s, { type: 'petEgg/hatch', petEggId: egg.id }, at(key, 16)));
        } catch (err) {
          assert.equal(err.code, 'backpack_full');
        }
      }
    }
    for (const pair of E.viewCollection(s).mergePairs.slice(0, 1)) s = note(act(s, { type: 'pet/merge', aId: pair.aId, bId: pair.bId }, at(key, 17)));
    if (E.viewShop(s, at(key, 17)).tabs[0].items[0].canBuy) s = note(act(s, { type: 'shop/buy', itemId: 'freeze' }, at(key, 17)));
    // Fill empty seats with the best backpack pets.
    for (const p of s.pets.filter((x) => x.location === 'backpack').sort((a, b) => b.tier - a.tier)) {
      const seats = E.viewPets(s).seats;
      if (seats.used < seats.total) s = note(act(s, { type: 'pet/activate', petId: p.id }, at(key, 17)));
    }
    invariants(s, at(key, 18));
  }
  for (const type of ['day.closed', 'streak.eggs', 'egg.laid', 'egg.opened', 'petEgg.hatched', 'pet.levelUp', 'keeper.levelUp', 'season.tierUp', 'quest.completed', 'petdex.discovered', 'streak.milestone', 'freeze.used', 'commit.bonus', 'pet.dividend']) {
    assert.ok(seen.has(type), `never saw ${type}`);
  }
  assert.ok(s.keeper.level >= 10);
  assert.ok(s.pets.length >= 3);
});

test('treats, cosmetics, settings and seats', () => {
  let s = E.newGame({ seed: 3, now: at(D, 8), tasks: E.DEFAULT_TASKS });
  s = act(s, { type: 'petEgg/hatch', petEggId: s.inv.petEggs[0].id }, at(D, 8)).state;
  const p = s.pets[0];
  s.inv.treats = [{ id: 'xt1', tier: 1, xp: 200 }];
  let r = act(s, { type: 'pet/useTreat', petId: p.id, treatId: 'xt1' }, at(D, 9));
  assert.equal(r.state.pets[0].level, 2);
  assert.equal(r.state.inv.treats.length, 0);
  s.pets[0].level = 20;
  assert.throws(() => act(s, { type: 'pet/useTreat', petId: p.id, treatId: 'xt1' }, at(D, 9)), { code: 'max_level' });
  s.pets[0].level = 1;
  assert.throws(() => act(s, { type: 'pet/cosmetic', cosmeticId: 'seedling' }, at(D, 9)), { code: 'no_cosmetic' });
  s.cosmetics = ['seedling', 'acornCap'];
  r = act(s, { type: 'pet/cosmetic', cosmeticId: 'seedling' }, at(D, 9));
  assert.equal(E.viewPets(r.state).active[0].cosmetic, 'seedling');
  r = act(r.state, { type: 'pet/cosmetic', petId: p.id, cosmeticId: 'acornCap' }, at(D, 9));
  assert.equal(E.viewPets(r.state).active[0].cosmetic, 'acornCap');
  r = act(r.state, { type: 'settings/save', settings: { sound: true, motion: 'reduced', companionId: p.id, defaultDayLevel: 2, junk: 1 } }, at(D, 9));
  assert.equal(r.state.settings.sound, true);
  assert.equal(r.state.settings.motion, 'reduced');
  assert.equal(r.state.settings.junk, undefined);
  const next = E.advance(r.state, at('2026-11-03', 6)).state;
  assert.equal(next.day.level, 2, 'the default day level setting');
  assert.throws(() => act(next, { type: 'pet/activate', petId: p.id }, at('2026-11-03', 9)), { code: 'already_active' });
  const d = act(next, { type: 'pet/deactivate', petId: p.id }, at('2026-11-03', 9)).state;
  assert.equal(d.pets[0].location, 'backpack');
  assert.throws(() => act(d, { type: 'pet/feed', petId: p.id, amount: 1 }, at('2026-11-03', 9)), { code: 'not_active' });
});
