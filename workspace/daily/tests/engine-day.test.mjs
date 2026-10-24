// Engine: the list (setup, next month, swap), normalized food, amounts, the day level, raises, the Goddamn cap,
// mid-day level changes, the commitment bonus, the soft cap, feeding and pool expiry.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine/index.js';

const T = E.time;
const at = (key, hh, mm = 0) => T.nyInstant(key, hh * 60 + mm);
const D = '2026-11-02'; // a Monday
const act = (s, a, now) => E.applyAction(s, a, now);

function start(tasks = E.DEFAULT_TASKS, key = D) {
  let s = E.newGame({ seed: 5, now: at(key, 8), tasks });
  s = act(s, { type: 'petEgg/hatch', petEggId: s.inv.petEggs[0].id }, at(key, 8, 1)).state;
  return s;
}
const tick = (s, taskId, now = at(D, 9)) => act(s, { type: 'task/tick', taskId }, now);
function tickAll(s, key = D, hh = 9) {
  for (const t of s.list.tasks) if (!s.day.ticks[t.id]) s = tick(s, t.id, at(key, hh)).state;
  return s;
}
const closeOf = (r) => r.events.find((e) => e.type === 'day.closed');

test('list setup validates tasks and gives unique ids', () => {
  assert.throws(() => E.newGame({ seed: 1, now: at(D, 8), tasks: [{ name: '', type: 'quantity', chill: 1, unit: 'x' }] }), { code: 'bad_task' });
  assert.throws(() => E.newGame({ seed: 1, now: at(D, 8), tasks: [{ name: 'Read', type: 'quantity', unit: 'pages' }] }), { code: 'bad_task' });
  assert.throws(() => E.newGame({ seed: 1, now: at(D, 8), tasks: [{ name: 'Mood', type: 'quality' }] }), { code: 'bad_task' });
  assert.throws(() => E.newGame({ seed: 1, now: at(D, 8), tasks: new Array(13).fill({ name: 'X', type: 'quality', chillText: 'x' }) }), { code: 'bad_list' });
  const s = E.newGame({ seed: 1, now: at(D, 8), tasks: [{ name: 'Read', type: 'quantity', chill: 10, unit: 'pages' }, { name: 'Read', type: 'quantity', chill: 5, unit: 'pages' }] });
  assert.deepEqual(s.list.tasks.map((t) => t.id), ['read', 'read-2']);
  assert.equal(s.list.month, '2026-11');
  const blank = E.newGame({ seed: 1, now: at(D, 8) });
  assert.equal(blank.list, null);
  const r = act(blank, { type: 'list/setup', tasks: E.DEFAULT_TASKS }, at(D, 9));
  assert.equal(r.state.day.key, D);
  assert.throws(() => act(r.state, { type: 'list/setup', tasks: E.DEFAULT_TASKS }, at(D, 9)), { code: 'list_locked' });
});

test('normalized base food: round(360 / (2 × tasks)), the tier table and an all-Easy day ≈ 360', () => {
  assert.equal(E.baseFood(6), 30);
  assert.equal(E.baseFood(4), 45);
  assert.equal(E.baseFood(5), 36);
  assert.equal(E.baseFood(7), 26);
  let s = start();
  const foods = E.viewLadder(s).foodRow;
  assert.deepEqual(foods, { chill: 30, easy: 60, medium: 120, hard: 360, goddamn: 1500 });
  s = tickAll(s);
  assert.equal(s.day.counted, 360);
  assert.equal(s.day.pool, 360);
});

test('quantities round up, minutes over 60 show as hours, physical durations stop at Hard', () => {
  const s = start();
  const ladder = E.viewLadder(s);
  const read = ladder.rows.find((r) => r.taskId === 'read').cells;
  assert.equal(read.easy, '23 pages'); // 15 × 1.5 = 22.5 → 23
  assert.equal(read.goddamn, '300 pages');
  const deep = ladder.rows.find((r) => r.taskId === 'deep').cells;
  assert.equal(deep.chill, '30 min');
  assert.equal(deep.medium, '1.5 h');
  const work = ladder.rows.find((r) => r.taskId === 'workout').cells;
  assert.equal(work.hard, '1.3 h'); // 75 min
  assert.match(work.goddamn, /^1\.3 h · /, 'Goddamn keeps the Hard duration and adds structure');
  const sleep = s.list.tasks.find((t) => t.id === 'sleep');
  assert.equal(E.taskAmount(sleep, 4), 8.5);
});

test('day level: Chill–Hard only, default Easy, applies to every unticked task', () => {
  let s = start();
  assert.equal(s.day.level, 1);
  assert.throws(() => act(s, { type: 'day/setLevel', level: 'goddamn' }, at(D, 9)), { code: 'bad_level' });
  s = act(s, { type: 'day/setLevel', level: 'medium' }, at(D, 9)).state;
  const v = E.viewToday(s, at(D, 9));
  assert.ok(v.tasks.every((t) => t.level === 2 && t.food === 120));
});

test('raise: only unticked tasks, only above the day level, at most 2 Goddamn', () => {
  let s = start();
  assert.throws(() => act(s, { type: 'task/raise', taskId: 'read', level: 'chill' }, at(D, 9)), { code: 'no_lowering' });
  assert.throws(() => act(s, { type: 'task/raise', taskId: 'read', level: 'easy' }, at(D, 9)), { code: 'no_lowering' });
  s = act(s, { type: 'task/raise', taskId: 'read', level: 'hard' }, at(D, 9)).state;
  assert.throws(() => act(s, { type: 'task/raise', taskId: 'read', level: 'medium' }, at(D, 9)), { code: 'no_lowering' });
  s = act(s, { type: 'task/raise', taskId: 'read', level: 'goddamn' }, at(D, 9)).state;
  s = act(s, { type: 'task/raise', taskId: 'deep', level: 'goddamn' }, at(D, 9)).state;
  assert.throws(() => act(s, { type: 'task/raise', taskId: 'grass', level: 'goddamn' }, at(D, 9)), { code: 'goddamn_cap' });
  const v = E.viewToday(s, at(D, 9));
  assert.equal(v.goddamnCount, 2);
  assert.deepEqual(v.tasks.find((t) => t.id === 'grass').raiseTo, [2, 3]);
  s = tick(s, 'read').state;
  assert.equal(s.day.ticks.read.level, 4);
  assert.throws(() => act(s, { type: 'task/raise', taskId: 'read', level: 'goddamn' }, at(D, 9)), { code: 'task_ticked' });
  // A ticked Goddamn still counts toward the cap.
  assert.throws(() => act(s, { type: 'task/raise', taskId: 'veg', level: 'goddamn' }, at(D, 9)), { code: 'goddamn_cap' });
});

test('changing the day level mid-day only affects unticked tasks; lowering clears raises', () => {
  let s = start();
  s = tick(s, 'sleep').state; // Easy
  s = act(s, { type: 'task/raise', taskId: 'read', level: 'hard' }, at(D, 9)).state;
  s = act(s, { type: 'day/setLevel', level: 'medium' }, at(D, 10)).state;
  let v = E.viewToday(s, at(D, 10));
  assert.equal(v.tasks.find((t) => t.id === 'sleep').level, 1, 'ticked keeps its level');
  assert.equal(v.tasks.find((t) => t.id === 'read').level, 3, 'a raise above the new level stays');
  assert.equal(v.tasks.find((t) => t.id === 'grass').level, 2);
  s = act(s, { type: 'day/setLevel', level: 'chill' }, at(D, 11)).state;
  v = E.viewToday(s, at(D, 11));
  assert.equal(v.tasks.find((t) => t.id === 'sleep').level, 1);
  assert.equal(v.tasks.find((t) => t.id === 'read').level, 0, 'lowering the day brings raised tasks down too');
  assert.equal(s.day.ticks.sleep.raw, 60, 'the ticked task keeps the food it was ticked at');
});

test('commitment bonus: kept when raising, lost when lowering below the morning level', () => {
  // Kept on raise.
  let s = start();
  s = tick(s, 'sleep').state;
  assert.equal(s.day.commitLevel, 1);
  s = act(s, { type: 'day/setLevel', level: 'medium' }, at(D, 9)).state;
  s = tickAll(s);
  let r = E.advance(s, at(D, 22));
  // raw = 60 + 5×120 = 660 → bonus 20 % = 132
  assert.equal(closeOf(r).bonus, 132);
  assert.equal(closeOf(r).foodTotal, 792);
  assert.equal(r.state.keeper.lifetimeFood, 792, 'the bonus counts toward Keeper XP');
  // Lost on lowering (even if raised back).
  s = start();
  s = tick(s, 'sleep').state;
  r = act(s, { type: 'day/setLevel', level: 'chill' }, at(D, 9));
  assert.equal(r.events.find((e) => e.type === 'day.levelChanged').commitBroken, true);
  s = act(r.state, { type: 'day/setLevel', level: 'easy' }, at(D, 9)).state;
  assert.equal(E.viewToday(s, at(D, 9)).bonusAlive, false);
  s = tickAll(s);
  assert.equal(closeOf(E.advance(s, at(D, 22))).bonus, 0);
  // Lowering before the first tick is not a broken promise.
  s = start();
  s = act(s, { type: 'day/setLevel', level: 'chill' }, at(D, 9)).state;
  s = tickAll(s);
  assert.equal(s.day.commitLevel, 0);
  assert.equal(closeOf(E.advance(s, at(D, 22))).bonus, 36);
  // An incomplete day earns no bonus.
  s = start();
  s = tick(s, 'read').state;
  assert.equal(closeOf(E.advance(s, at(D, 22))).bonus, 0);
});

test('the bonus goes into active pets\' XP and egg meters, split evenly', () => {
  let s = start();
  s = tickAll(s);
  const pet = s.pets[0];
  s = act(s, { type: 'pet/feed', petId: pet.id, amount: 100 }, at(D, 10)).state;
  const r = E.advance(s, at(D, 22));
  assert.equal(closeOf(r).bonus, 72);
  const xpEv = r.events.filter((e) => e.type === 'pet.xp' && e.petId === pet.id);
  assert.equal(xpEv.reduce((a, e) => a + e.xp, 0), 72);
  assert.equal(r.state.pets[0].xp, 72);
  assert.equal(r.state.pets[0].meter, 72); // floor(72 × 1.001)
});

test('soft cap: food above 1,200 counts at 50 %, applied as it is earned (bonus included)', () => {
  let s = start();
  s = act(s, { type: 'day/setLevel', level: 'hard' }, at(D, 9)).state;
  const counted = [];
  for (const t of s.list.tasks) {
    const r = tick(s, t.id);
    counted.push(r.events.find((e) => e.type === 'task.ticked').counted);
    s = r.state;
  }
  assert.deepEqual(counted, [360, 360, 360, 240, 180, 180]);
  assert.equal(s.day.raw, 2160);
  assert.equal(s.day.counted, 1680);
  const c = closeOf(E.advance(s, at(D, 22)));
  assert.equal(c.foodTotal, 1896, 'Hard 2,160 → 2,592 with the bonus → 1,896 after the cap');
  assert.equal(E.capFood(864), 864);
});

test('feeding: from the pool, active pets only, beyond 100 goes to XP and the meter; pool does not carry over', () => {
  let s = start();
  const pet = s.pets[0];
  assert.throws(() => act(s, { type: 'pet/feed', petId: pet.id, amount: 10 }, at(D, 9)), { code: 'not_enough_food' });
  s = tickAll(s);
  let r = act(s, { type: 'pet/feed', petId: pet.id, amount: 80 }, at(D, 10));
  assert.equal(r.events.find((e) => e.type === 'pet.fed').excess, 0);
  r = act(r.state, { type: 'pet/feed', petId: pet.id, amount: 70 }, at(D, 10));
  assert.equal(r.events.find((e) => e.type === 'pet.fed').excess, 50);
  assert.equal(r.events.find((e) => e.type === 'pet.xp').xp, 50);
  assert.equal(r.state.pets[0].meter, 50);
  assert.equal(r.state.day.pool, 360 - 150);
  assert.throws(() => act(r.state, { type: 'pet/feed', petId: pet.id, amount: 0 }, at(D, 10)), { code: 'bad_amount' });
  assert.throws(() => act(r.state, { type: 'pet/feed', petId: pet.id, amount: 1.5 }, at(D, 10)), { code: 'bad_amount' });
  // Unspent food expires at close.
  const next = E.advance(r.state, at('2026-11-03', 9)).state;
  assert.equal(next.day.pool, 0);
  assert.equal(next.lastDay.leftover, 210);
  assert.equal(E.viewPets(next).active[0].fedToday, 0);
});

test('undo is refused once that food was fed', () => {
  let s = start();
  s = tick(s, 'read').state;
  s = act(s, { type: 'pet/feed', petId: s.pets[0].id, amount: 10 }, at(D, 9, 1)).state;
  assert.throws(() => act(s, { type: 'task/undo', taskId: 'read' }, at(D, 9, 2)), { code: 'food_spent' });
  s = tick(s, 'grass', at(D, 9, 2)).state;
  // Undoing grass needs its 60 back; the pool holds 110.
  const r = act(s, { type: 'task/undo', taskId: 'grass' }, at(D, 9, 3));
  assert.equal(r.state.day.pool, 50);
});

test('undo recomputes the soft cap', () => {
  let s = start();
  s = act(s, { type: 'day/setLevel', level: 'hard' }, at(D, 9)).state;
  s = tickAll(s);
  const r = act(s, { type: 'task/undo', taskId: 'deep' }, at(D, 9, 2));
  assert.equal(r.state.day.raw, 1800);
  assert.equal(r.state.day.counted, 1500);
  assert.equal(r.events.find((e) => e.type === 'task.undone').food, 180);
});

test('tick records the real quantity (default: the tier amount) and Deep-work goal tags', () => {
  let s = start();
  let r = act(s, { type: 'task/tick', taskId: 'read', qty: 31 }, at(D, 9));
  assert.equal(r.state.day.ticks.read.qty, 31);
  r = act(r.state, { type: 'task/tick', taskId: 'grass' }, at(D, 9));
  assert.equal(r.state.day.ticks.grass.qty, 30);
  assert.throws(() => act(r.state, { type: 'task/tick', taskId: 'veg', goalTag: 'ILO' }, at(D, 9)), { code: 'bad_goal_tag' });
  assert.throws(() => act(r.state, { type: 'task/tick', taskId: 'veg', qty: -1 }, at(D, 9)), { code: 'bad_qty' });
  r = act(r.state, { type: 'task/tick', taskId: 'deep', goalTag: 'ILO' }, at(D, 9));
  assert.equal(r.state.day.ticks.deep.goalTag, 'ILO');
});

test('emergency swap: once a month, a reason, Chill baseline equal or harder, logged publicly', () => {
  let s = start();
  const swap = (task, reason = 'Knee injury') => act(s, { type: 'list/swap', taskId: 'workout', task, reason }, at(D, 9));
  assert.throws(() => swap({ name: 'Walk', type: 'quantity', unit: 'minutes', chill: 10 }), { code: 'swap_easier' });
  assert.throws(() => swap({ name: 'Walk', type: 'quantity', unit: 'minutes', chill: 20 }, ''), { code: 'swap_reason' });
  s = swap({ name: 'Swim', type: 'quantity', unit: 'minutes', chill: 15, physical: true, tag: 'physical' }).state;
  assert.equal(s.list.tasks[4].name, 'Swim');
  assert.equal(s.swapLog.length, 1);
  assert.equal(E.publicSnapshot(s, at(D, 9)).swaps[0].reason, 'Knee injury');
  assert.throws(() => act(s, { type: 'list/swap', taskId: 'read', task: { name: 'Write', type: 'quality', chillText: '1 page' }, reason: 'x' }, at(D, 9)), { code: 'swap_used' });
  // A new month brings a new swap.
  s = E.advance(s, at('2026-12-01', 9)).state;
  assert.equal(s.list.swaps, 0);
  assert.equal(s.list.month, '2026-12');
  // A task ticked today can't be swapped.
  s = tick(s, 'read', at('2026-12-01', 9)).state;
  assert.throws(() => act(s, { type: 'list/swap', taskId: 'read', task: { name: 'Write', type: 'quality', chillText: '1 page' }, reason: 'x' }, at('2026-12-01', 9)), { code: 'task_ticked' });
});

test('monthly lock: next month\'s list locks on the 1st; otherwise the list carries over', () => {
  let s = start();
  const next = [{ name: 'Read', type: 'quantity', chill: 20, unit: 'pages' }, { name: 'Run', type: 'quantity', chill: 10, unit: 'minutes', physical: true }];
  s = act(s, { type: 'list/setNext', tasks: next }, at(D, 9)).state;
  assert.equal(s.nextList.month, '2026-12');
  s = E.advance(s, at('2026-11-30', 9)).state;
  assert.equal(s.list.tasks.length, 6, 'still November');
  s = E.advance(s, at('2026-12-01', 9)).state;
  assert.equal(s.list.month, '2026-12');
  assert.equal(s.list.tasks.length, 2);
  assert.equal(s.nextList, null);
  assert.equal(E.viewToday(s, at('2026-12-01', 9)).food.base, 90, 'base re-normalizes for 2 tasks');
  s = E.advance(s, at('2027-01-01', 9)).state;
  assert.equal(s.list.month, '2027-01');
  assert.equal(s.list.tasks.length, 2, 'carried over');
});
