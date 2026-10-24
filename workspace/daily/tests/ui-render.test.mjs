import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { placeholderArt } from '../app/art.js';
import { html, esc } from '../app/html.js';
import { ownerViews, ashesViews, previewSnapshot } from '../app/fixtures/views.js';
import {
  dinnerPlan, flameState, projectedDay, raiseOptions, renderBackpack, renderFinish, renderFoodPanel, renderHeaderStats, renderHunger,
  renderLadder, renderPets, renderReceipts, renderRing, renderToday, streakLine, petOutcome, seatsLine,
} from '../app/render-daily.js';
import {
  analysePair, itemText, petdexCount, renderCollection, renderHatchery, renderOdds, renderOpenEggs, renderPetdex, renderShop, revealOrder,
} from '../app/render-eggs.js';
import { renderSettings } from '../app/render-settings.js';
import { DEFAULT_TASKS } from '../app/tasks.js';
import { snapshotViews } from '../app/backend.js';
import { normalizeViews, normalizeEvents, morningFrom } from '../app/normalize.js';
import { clock, dayLabel, liveWindow, dayKey } from '../app/time.js';

const NOW = Date.UTC(2026, 10, 12, 20, 30); // 15:30 New York
const vm = ownerViews(NOW);
const ctx = (over = {}) => {
  const focusPet = vm.pets.active[0];
  return { owner: true, art: placeholderArt, now: NOW, ui: { receipts: {}, openRaise: null }, ladder: vm.ladder, focusPet, ...over };
};
const s = x => String(x);
const count = (text, re) => (text.match(re) || []).length;

test('html helper escapes values and keeps aria-pressed="false"', () => {
  assert.equal(esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.equal(s(html`<b aria-pressed="${false}">${'<i>'}</b>`), '<b aria-pressed="false">&lt;i&gt;</b>');
});

test('today list: one row per task, 56 px ticks, receipt state, undo window', () => {
  const out = s(renderToday(vm.today, vm.header, ctx()));
  assert.equal(count(out, /data-task-row=/g), 6);
  assert.equal(count(out, /class="tick"/g), 6);
  assert.equal(count(out, /aria-pressed="true" aria-label=/g), 3, 'three ticked');
  assert.match(out, /aria-label="Undo Eat vegetables \(within 5 minutes\)"/);
  assert.match(out, /class="undo-ring"/);
  assert.match(out, /aria-label="Tick Read: Medium, 45 pages, \+120 food"/);
  assert.match(out, /A little progress, <em>every day\.<\/em>/);
  assert.match(out, /\+20% commitment bonus alive · committed at Easy/);
  assert.equal(count(out, /data-action="raise-toggle"/g), 3, 'raise only on unticked tasks');
});

test('day picker offers Chill–Hard only, never Goddamn; Commit to {level} before the first tick', () => {
  const out = s(renderToday(vm.today, vm.header, ctx()));
  const picker = out.match(/aria-label="Day level">([\s\S]*?)<\/div>/)[1];
  assert.equal(count(picker, /data-action="day-level"/g), 4);
  assert.doesNotMatch(picker, /goddamn/i);
  const fresh = { ...vm.today, commitLevel: null, progress: { done: 0, total: 6 }, tasks: vm.today.tasks.map(t => ({ ...t, ticked: false })) };
  assert.match(s(renderToday(fresh, vm.header, ctx())), />Commit to Easy</);
});

test('raise preview: only higher levels, requirement change, food change, soft-cap line, pet outcome', () => {
  const read = vm.today.tasks.find(t => t.id === 'read');
  const opts = raiseOptions(read, vm.today, vm.ladder, vm.pets.active[0]);
  assert.deepEqual(opts.map(o => o.level), ['hard', 'goddamn']);
  assert.equal(opts[0].requirement, 'Read: 45 pages → 75 pages');
  assert.equal(opts[0].delta, 240);
  assert.ok(opts[1].capped, 'a Goddamn raise crosses the 1,200 soft cap');
  assert.match(opts[0].pet, /^Ember (reaches Lv \d+|gets \+[\d,]+ XP) if fed tonight$/);
  const capped = { ...vm.today, goddamnCount: 2 };
  assert.ok(raiseOptions(read, capped, vm.ladder, null).find(o => o.level === 'goddamn').blocked);
  const open = s(renderToday(vm.today, vm.header, ctx({ ui: { receipts: {}, openRaise: 'read' } })));
  assert.match(open, /aria-expanded="true" aria-controls="raise-read"/);
  assert.match(open, /Raise to Hard/);
});

test('soft cap and projection math', () => {
  const p = projectedDay(vm.today);
  assert.equal(p.planned, 60 + 60 + 120 + 60 + 60 + 60);
  assert.equal(p.total, Math.round(420 * 1.2));
  const hard = projectedDay({ ...vm.today, tasks: vm.today.tasks.map(t => ({ ...t, food: 360 })) });
  assert.equal(hard.total, Math.round(1200 + (2160 * 1.2 - 1200) * 0.5));
  assert.equal(petOutcome({ name: 'X', level: 1, xp: 0, xpNext: 100, cap: 20 }, 100), 'X reaches Lv 2 if fed tonight');
});

test('ring: one segment per task, ticked ones in their level colour; flame states', () => {
  const out = s(renderRing(vm.today, vm.header, NOW));
  assert.equal(count(out, /class="ring-seg/g), 6);
  assert.equal(count(out, /ring-seg is-done/g), 3);
  assert.match(out, /3 of 6 tasks done/);
  const done = { ...vm.today, progress: { done: 6, total: 6 } };
  assert.deepEqual(flameState(done, vm.header, NOW), { kind: 'lit', text: '+1 at 22:00' }, 'a save from before the last-tick reward');
  const paid = { ...done, reward: { streakAfter: 4, bonus: 72, eggs: { tier: 1, count: 1, lucky: false } } };
  assert.deepEqual(flameState(paid, vm.header, NOW), { kind: 'lit', text: 'Done · +1 earned' });
  const evening = Date.UTC(2026, 10, 13, 0, 46); // 19:46 New York
  const risk = flameState(vm.today, vm.header, evening);
  assert.equal(risk.kind, 'risk');
  assert.equal(risk.text, '3 left · 2h 14m');
});

test('the finish celebration is the same at every level and only on a complete day', () => {
  assert.equal(s(renderFinish(vm.today, vm.header, ctx())), '');
  const at = level => ({ ...vm.today, progress: { done: 6, total: 6 }, tasks: vm.today.tasks.map(t => ({ ...t, level, ticked: true })) });
  const chill = s(renderFinish(at('chill'), vm.header, ctx()));
  const hard = s(renderFinish(at('hard'), vm.header, ctx()));
  for (const out of [chill, hard]) {
    assert.match(out, /Today's list: complete\./);
    assert.match(out, /You're done for today\. Enjoy your evening\./);
    assert.match(out, /data-action="feed-dinner"/);
    assert.doesNotMatch(out, /Chill|Hard|Goddamn|Ultra/);
  }
  assert.equal(chill, hard);
  // The reward is paid at the last tick: the card shows what was earned, with a way to the eggs.
  const paid = s(renderFinish({ ...at('easy'), reward: { streakAfter: 4, bonus: 72, eggs: { tier: 1, count: 2, lucky: false } } }, vm.header, ctx()));
  assert.match(paid, /Streak 4\. Earned 2 Rare eggs\. \+72 commitment bonus went into your pets&#39; growth\./);
  assert.match(paid, /href="\/daily\/eggs\/#openable">Open 2 eggs</);
  assert.doesNotMatch(paid, /Tonight at 22:00/);
});

test('dinner then growth: exact preview, upkeep reserved', () => {
  const plan = dinnerPlan(vm.today, vm.pets);
  assert.equal(plan.spendable, vm.today.food.pool - vm.today.food.upkeep);
  assert.equal(plan.meal + plan.growth, plan.spendable);
  const out = s(renderFoodPanel(vm.today, vm.pets, ctx()));
  assert.match(out, /Feed to dinner/);
  assert.match(out, /Feed surplus/);
  assert.match(out, /reserved for backpack upkeep/);
  assert.match(out, /to dinner · \d+ growth food → \+\d+ XP · \+\d+ egg meter/);
  assert.match(out, /id="pool-count"/);
});

test('visitor mode is read-only', () => {
  const v = ctx({ owner: false });
  const today = s(renderToday(vm.today, vm.header, v));
  assert.equal(count(today, /class="tick"[^>]*disabled/g), 6);
  assert.doesNotMatch(today, /raise-toggle/);
  assert.doesNotMatch(s(renderFoodPanel(vm.today, vm.pets, v)), /data-action=/);
  const pets = s(renderPets(vm.pets, vm.today, v, vm.eggs));
  assert.doesNotMatch(pets, /data-action=/);
  assert.doesNotMatch(s(renderReceipts(vm.receipts, v)), /Goal A/, 'goals stay private');
  assert.doesNotMatch(s(renderToday(vm.today, vm.header, v)), /Goal A/);
});

test('header stats, hunger ladder and Phoenix', () => {
  assert.equal(streakLine(vm.header), '1 Rare egg per full day. 2 from day 40.');
  const stats = s(renderHeaderStats(vm.header, ctx()));
  assert.match(stats, /Keeper level/);
  assert.match(stats, /\/ 3 max/);
  const ashes = ashesViews(NOW);
  const hunger = s(renderHunger(ashes.header, placeholderArt));
  assert.match(hunger, /aria-current="step"[^>]*><span class="mono-label"[^>]*>3 in a row/);
  assert.match(hunger, /A way back: finish 3 days in a row by Nov 18\./);
  assert.match(hunger, /1 \/ 3 days/);
});

test('pet cards: seats line, comeback badge, feed buttons', () => {
  assert.equal(seatsLine(vm.pets), 'Seats: 3 base + 2 from abilities = 5 · 3 filled · each needs 100 food');
  const out = s(renderPets(vm.pets, vm.today, ctx(), vm.eggs));
  assert.equal(count(out, /class="pet-card"/g), 3);
  assert.match(out, /2× comeback XP · 300 to go/);
  assert.match(out, /−2 Lv/);
  assert.equal(count(out, /data-action="feed"/g), 6);
  assert.match(out, /Pays 46 coins \+ 2 diamond shards a day when fed 100/);
  assert.match(s(renderBackpack(vm.pets, ctx())), /2 \/ 12 · 10 food each a day/);
});

test('receipts and difficulty ladder', () => {
  const r = s(renderReceipts(vm.receipts, ctx()));
  assert.match(r, /412/);
  assert.match(r, /7\.4 h/);
  assert.match(s(renderReceipts(vm.receipts, ctx({ ui: { receiptsScope: 'lifetime' } }))), /951/);
  const l = s(renderLadder(vm.ladder));
  assert.equal(count(l, /<tr>/g), 1 + 6);
  assert.match(l, /1,500/);
  assert.match(l, /Goddamn · max 2\/day/);
});

test('owner settings: list editor, swap, reminders, save tools', () => {
  const out = s(renderSettings(vm, ctx({ nextMonthKey: '2026-12' }), DEFAULT_TASKS));
  assert.match(out, /data-form="next-list"/);
  assert.match(out, /Lock for December/);
  assert.match(out, /data-form="swap"/);
  assert.match(out, /data-action="export-save"/);
  assert.match(out, /data-action="export-snapshot"/);
  assert.match(out, /data-action="import-save"/);
  assert.equal(count(out, /class="editor-row"/g), DEFAULT_TASKS.length);
});

test('eggs: openable cards with public pet-egg chance; visitors see counts', () => {
  const out = s(renderOpenEggs(vm.eggs, vm.odds, ctx()));
  assert.equal(count(out, /data-action="open-egg"/g), 5);
  assert.match(out, /pet egg 5%/);
  assert.match(out, /pet egg 35%/);
  const pub = snapshotViews(previewSnapshot(NOW));
  const visitor = s(renderOpenEggs(pub.eggs, pub.odds, ctx({ owner: false })));
  assert.doesNotMatch(visitor, /data-action/);
  assert.match(visitor, /Openable eggs waiting/);
});

test('reveal order puts the pet egg last; item text', () => {
  const items = [{ kind: 'petEgg', tier: 2, petEgg: { tier: 2 } }, { kind: 'coins', amount: 30 }, { kind: 'eggFood', tier: 1, amount: 2 }];
  assert.deepEqual(revealOrder(items).map(i => i.kind), ['coins', 'eggFood', 'petEgg']);
  assert.equal(itemText(items[0]), 'Super Rare pet egg');
  assert.equal(itemText(items[2]), '+2 Rare egg food');
});

test('hatchery: live odds, food picker, charm rule, hatch only when full', () => {
  const out = s(renderHatchery(vm.eggs, vm.odds, ctx({ ui: { incubating: 'pe1' } })));
  assert.match(out, /Rare pet egg/);
  assert.match(out, /2 \/ 6/);
  assert.match(out, /94%/);
  assert.match(out, /data-action="hatch"[^>]*disabled/);
  assert.doesNotMatch(out, /data-charm="tier" disabled/, 'a charm can go on any time before hatch');
  const charmed = { ...vm.eggs, petEggs: vm.eggs.petEggs.map(e => (e.id === 'pe1' ? { ...e, charm: 'tier' } : e)) };
  assert.match(s(renderHatchery(charmed, vm.odds, ctx({ ui: { incubating: 'pe1' } }))), /data-charm="tier" disabled/, 'one charm per egg');
  const ready = s(renderHatchery(vm.eggs, vm.odds, ctx({ ui: { incubating: 'pe3' } })));
  assert.doesNotMatch(ready, /data-action="hatch"[^>]*disabled/);
  assert.ok(count(ready, /data-action="feed-egg"[^>]*disabled/g) >= 1);
});

test('collection: merge / combine analysis shows odds before confirming', () => {
  assert.equal(analysePair(['p-pip'], vm.pets, vm.collection, vm.odds).text, 'Pick one more pet.');
  const merge = analysePair(['p-pip', 'p-kit'], vm.pets, vm.collection, vm.odds);
  assert.equal(merge.kind, 'merge');
  assert.match(merge.text, /5% mutation to Rare/);
  const combine = analysePair(['p-bean', 'p-pip'], vm.pets, vm.collection, vm.odds);
  assert.equal(combine.kind, 'combine');
  assert.match(combine.text, /20% for one Rare pet, 80% both are destroyed/);
  assert.equal(analysePair(['p-ember', 'p-pip'], vm.pets, vm.collection, vm.odds).kind, 'none');
  const out = s(renderCollection(vm.pets, vm.collection, vm.odds, ctx({ ui: { selected: ['p-pip', 'p-bean'] } })));
  assert.match(out, /data-action="combine"/);
  assert.equal(count(out, /aria-pressed="true"/g), 2);
});

test('Petdex: species × 7 grid, found cells labelled', () => {
  assert.equal(petdexCount(vm.collection.petdex), 6);
  const out = s(renderPetdex(vm.collection.petdex, ctx()));
  assert.match(out, /6 \/ 42 discovered/);
  assert.equal(count(out, /class="dex-cell/g), 42);
  assert.match(out, /Epic Drakelet, discovered Nov 4/);
  assert.match(out, /Ultra Ripplegill, not found yet/);
});

test('public odds tables and shop', () => {
  const odds = s(renderOdds(vm.odds));
  for (const t of ['35%', '10%', '82.5 / 12.5 / 5', '94 / 5 / 1 (Ultra)', '75 / 25 (Ultra) / —', '100 · plus 10% Ultra trinket', '0.625%']) assert.ok(odds.includes(t), t);
  const shop = s(renderShop(vm.shop, ctx()));
  assert.match(shop, /data-tab="real-life"/);
  assert.equal(count(shop, /data-action="buy"/g), 3);
  const life = s(renderShop(vm.shop, ctx({ ui: { shopTab: 'real-life' } })));
  assert.match(life, /About 300 coins ≈ one good day/);
  assert.match(life, /Redemption log/);
  assert.equal(count(life, /data-action="redeem"/g), vm.shop.rewards.length);
  assert.doesNotMatch(s(renderShop(null, ctx({ owner: false }))), /data-action/);
});

test('names and text are escaped in every render', () => {
  const evil = ownerViews(NOW);
  evil.pets.active[0].name = '<img src=x onerror=alert(1)>';
  evil.today.tasks[0].name = '"><script>';
  const out = s(renderPets(evil.pets, evil.today, ctx(), evil.eggs)) + s(renderToday(evil.today, evil.header, ctx()));
  assert.doesNotMatch(out, /<img src=x|<script>/);
});

test('time helpers are New York based and independent of TZ', () => {
  assert.equal(dayLabel('2026-11-12'), 'Nov 12');
  assert.equal(dayKey(Date.UTC(2026, 10, 13, 3, 30)), '2026-11-12');
  assert.equal(clock(Date.UTC(2026, 10, 13, 3, 0)), '10:00 PM');
  assert.equal(liveWindow(Date.UTC(2026, 10, 12, 9, 0)).phase, 'before');
  assert.equal(liveWindow(NOW).phase, 'open');
  assert.equal(liveWindow(NOW).closesAt, Date.UTC(2026, 10, 13, 3, 0));
  assert.equal(liveWindow(Date.UTC(2026, 10, 13, 3, 30)).phase, 'closed');
  assert.equal(liveWindow(Date.UTC(2026, 6, 1, 14, 0)).closesAt, Date.UTC(2026, 6, 2, 2, 0), 'EDT close');
});

test('UI source never uses local-time Date getters or date-only Date parsing', async () => {
  const dir = new URL('../app/', import.meta.url);
  const names = (await readdir(dir)).filter(n => n.endsWith('.js'));
  for (const n of names) {
    const text = await readFile(new URL(n, dir), 'utf8');
    assert.doesNotMatch(text, /\.get(Hours|Minutes|Date|Day|Month|FullYear)\(|\.set(Hours|Minutes|Date)\(|new Date\(['"`]\d/, n);
  }
});

test('engine-shaped view models (numeric levels, richer fields) normalize to the render shapes', () => {
  const raw = ownerViews(NOW);
  raw.today = { ...raw.today, level: 1, commitLevel: 1, tasks: raw.today.tasks.map(t => ({ ...t, level: ['chill', 'easy', 'medium', 'hard', 'goddamn'].indexOf(t.level), levelName: t.level, raiseTo: t.raiseTo.map(l => ['chill', 'easy', 'medium', 'hard', 'goddamn'].indexOf(l)) })), season: { ...raw.today.season, nextReward: { tier: 12, coins: 90 }, cosmetic: { id: 'acornCap', name: 'Acorn Cap', seasonName: 'Small Beginnings' } } };
  raw.ladder = { ...raw.ladder, levels: raw.ladder.levels.map(id => ({ id, label: id })) };
  raw.header = { ...raw.header, nextStep: { streak: 40, tier: 1, count: 2, lucky: false } };
  raw.collection = { ...raw.collection, petdex: { ...raw.collection.petdex, species: raw.collection.petdex.species.map(id => ({ id, name: id.toUpperCase() })) } };
  raw.odds = { ...raw.odds, tierSplit: undefined, petEggSplit: raw.odds.tierSplit, loot: [{ kind: 'coins', weight: 40, minTier: null }, { kind: 'eggFood', weight: 35, minTier: null }, { kind: 'xpTreat', weight: 12, minTier: null }, { kind: 'diamonds', weight: 8, minTier: null }, { kind: 'charm', weight: 0, minTier: 3 }, { kind: 'trinket', weight: 2, minTier: 3 }], hatch: { base: { same: 0.95, up: 0.05 }, foodBonus: 0.01, ownFloor: 0.5, servings: [5, 6, 8, 10, 12, 15, 20] } };
  const v = normalizeViews(raw);
  assert.equal(v.today.level, 'easy');
  assert.equal(v.today.tasks.find(t => t.id === 'read').level, 'medium');
  assert.deepEqual(v.today.tasks.find(t => t.id === 'read').raiseTo, ['hard', 'goddamn']);
  assert.equal(v.today.season.nextReward, '90 coins');
  assert.equal(v.today.season.cosmetic, 'Acorn Cap');
  assert.deepEqual(v.ladder.levels, ['chill', 'easy', 'medium', 'hard', 'goddamn']);
  assert.equal(streakLine(v.header), '1 Rare egg per full day. 2 from day 40.');
  assert.equal(v.collection.petdex.names.dragon, 'DRAGON');
  const odds = s(renderOdds(v.odds));
  assert.match(odds, /Coins 41\.2%/, 'shares are of the real total (97), not of 100');
  assert.match(odds, /Trinket \(Epic eggs and up\) 2\.062%/);
  assert.doesNotMatch(odds, /Tier charm/, 'zero-weight rows are hidden');
  assert.match(odds, /82\.5 \/ 12\.5 \/ 5/);
  assert.match(s(renderToday(v.today, v.header, ctx({ ladder: v.ladder }))), /Tick Read: Medium, 45 pages/);
  assert.deepEqual(normalizeEvents([{ type: 'task.ticked', level: 3 }]), [{ type: 'task.ticked', level: 'hard' }]);
  assert.equal(morningFrom({ dayKey: '2026-11-11', outcome: 'complete', food: 432, levelUps: 2, streakAfter: 5, eggsWaiting: [{}, {}] }).eggs, 2);
});

test('every section renders from the real engine when it exists', async t => {
  let E;
  try { E = await import('../engine/index.js'); } catch { t.skip('engine not built yet'); return; }
  const now = Date.UTC(2026, 10, 12, 20, 30);
  let st = E.newGame({ seed: 11, now, tasks: E.DEFAULT_TASKS });
  st = E.advance(st, now).state;
  st = E.applyAction(st, { type: 'petEgg/hatch', petEggId: E.viewEggs(st).petEggs[0].id }, now).state;
  st = E.applyAction(st, { type: 'task/tick', taskId: 'read' }, now).state;
  const raw = { header: E.viewHeader(st, now), today: E.viewToday(st, now), pets: E.viewPets(st, now), eggs: E.viewEggs(st), collection: E.viewCollection(st), shop: E.viewShop(st, now), odds: E.viewOdds(), receipts: E.viewReceipts(st, now), ladder: E.viewLadder(st), settings: st.settings, morning: E.viewMorning(st, now) };
  const v = normalizeViews(raw);
  const c2 = ctx({ ladder: v.ladder, focusPet: v.pets.active[0] });
  const all = [renderHeaderStats(v.header, c2), renderToday(v.today, v.header, c2), renderFoodPanel(v.today, v.pets, c2), renderPets(v.pets, v.today, c2, v.eggs), renderBackpack(v.pets, c2), renderReceipts(v.receipts, c2), renderLadder(v.ladder), renderHunger(v.header, placeholderArt), renderOpenEggs(v.eggs, v.odds, c2), renderHatchery(v.eggs, v.odds, c2), renderCollection(v.pets, v.collection, v.odds, c2), renderPetdex(v.collection.petdex, c2), renderOdds(v.odds), renderShop(v.shop, c2), renderSettings(v, c2, DEFAULT_TASKS)].map(s).join('');
  assert.doesNotMatch(all, /undefined|NaN|\[object Object\]/);
  assert.match(all, /Undo Read \(within 5 minutes\)/);
  const pub = normalizeViews(snapshotViews(E.publicSnapshot(st, now, { preview: true })));
  assert.equal(pub.preview, true);
  const pubOut = [renderToday(pub.today, pub.header, ctx({ owner: false, ladder: pub.ladder })), renderOpenEggs(pub.eggs, pub.odds, ctx({ owner: false })), renderPetdex(pub.collection.petdex, ctx({ owner: false }))].map(s).join('');
  assert.doesNotMatch(pubOut, /undefined|NaN|\[object Object\]|data-action="(tick|undo|open-egg)"/);
});
