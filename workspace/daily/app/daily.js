// /daily/ — pets & tasks. Renders from view models; animations follow engine events.
import { createController } from './controller.js';
import {
  dinnerPlan, orbsFor, renderBackpack, renderCompanion, renderFoodPanel, renderHeaderStats, renderHunger, renderLadder, renderMorning,
  renderPets, renderQuests, renderReceipts, renderSeason, renderStatusLine, renderToday,
} from './render-daily.js';
import { renderSettings } from './render-settings.js';
import { renderResources } from './render-common.js';
import { html } from './html.js';
import { levelColor, levelIndex, levelLabel, num, tierName } from './format.js';
import { countTo, flyOrbs, petMotion, playOnce, reduced, wait } from './motion.js';
import { liveWindow, nyMinutes } from './time.js';
import { morningFrom } from './normalize.js';

const currentMorning = vm => (vm.morning ? morningFrom(vm.morning) : store.get(MORNING_KEY));

const MORNING_KEY = 'daily:v1:morning';
const DISMISS_KEY = 'daily:v1:morningDismissed';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } },
};

function nextMonthKey(listMonth) {
  const [y, m] = String(listMonth || '').split('-').map(Number);
  if (!y) return null;
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function reminderText(vm, ctx) {
  const s = vm.settings?.reminders || {};
  const t = vm.today;
  if (!ctx.owner || !t) return '';
  const mins = nyMinutes(ctx.now);
  const left = (t.tasks || []).filter(x => !x.ticked);
  const pet = ctx.focusPet?.name || 'Your pets';
  if (s.evening && left.length && mins >= 19 * 60 && mins < 21 * 60 + 30 && vm.header?.window?.phase === 'open') {
    return `${pet} is waiting on ${left.length === 1 ? 'one task' : `${left.length} tasks`}: ${left.map(x => x.name).join(', ')}.`;
  }
  if (s.morning && mins >= 7 * 60 + 30 && mins < 10 * 60 && (t.progress?.done || 0) === 0) {
    return `Good morning. ${t.progress?.total || 0} tasks today at ${levelLabel(t.level)}.`;
  }
  return '';
}

const sections = (vm, ctx, c) => {
  const header = { ...vm.header, window: ctx.owner && !c.backend.fixture ? vm.header.window : liveWindow(ctx.now) };
  const wctx = { ...ctx, window: header.window, nextMonthKey: nextMonthKey(vm.today?.listMonth) };
  const morning = ctx.owner ? currentMorning(vm) : null;
  const reminder = reminderText({ ...vm, header }, wctx);
  return {
    'hero-stats': renderHeaderStats(header, wctx),
    'status-line': renderStatusLine(header, vm.pets),
    resources: ctx.owner ? renderResources(vm.shop, vm.eggs, null) : html``,
    morning: morning && store.get(DISMISS_KEY) !== morning.dayKey ? renderMorning(morning) : html``,
    reminder: reminder ? html`<p class="reminder" role="status"><span class="dot" aria-hidden="true"></span>${reminder}</p>` : html``,
    today: renderToday(vm.today, header, wctx),
    pool: renderFoodPanel(vm.today, vm.pets, wctx),
    companion: renderCompanion(ctx.focusPet, ctx.art, wctx),
    quests: renderQuests(vm.today),
    season: renderSeason(vm.today),
    hunger: renderHunger(header, ctx.art),
    pets: renderPets(vm.pets, vm.today, wctx, vm.eggs),
    receipts: renderReceipts(vm.receipts, wctx),
    ladder: renderLadder(vm.ladder),
    backpack: renderBackpack(vm.pets, wctx),
    settings: ctx.owner ? renderSettings(vm, wctx, ctx.defaults) : html``,
  };
};

const qs = sel => document.querySelector(sel);
const petEl = id => document.querySelector(`.pet-card[data-pet="${CSS.escape(id)}"] .pet-stage`) || document.querySelector(`.companion[data-pet="${CSS.escape(id)}"]`);

// Receipt first, then reward: the real action, then orbs into the pool, the pool rolls up,
// the check pops, the row flashes its level colour, the companion and patrons cheer.
async function onEvents(events, before, c) {
  const poolBefore = before?.today?.food?.pool ?? 0;
  const poolAfter = c.vm?.today?.food?.pool ?? 0;
  for (const ev of events) {
    if (ev.type === 'task.ticked') {
      const row = qs(`[data-task-row="${CSS.escape(ev.taskId)}"]`);
      const tick = row?.querySelector('.tick');
      const counter = qs('#pool-count');
      const task = c.vm.today.tasks.find(t => t.id === ev.taskId);
      if (counter) counter.textContent = num(poolBefore);
      if (navigator.vibrate && c.vm.settings?.haptics) navigator.vibrate(10);
      playOnce(tick, 'is-popping', 450);
      playOnce(row, 'is-flashing', 900);
      c.announce(`${c.ui.receipts[ev.taskId]}. +${num(ev.food)} food.`);
      const companion = qs('#companion .companion');
      petMotion(companion, 'pet--cheer', 1400);
      const cheer = ev.cheer || (Array.isArray(task?.patron) ? task.patron : []);
      for (const id of cheer) if (id !== c.ctx().focusPet?.id) petMotion(petEl(id), 'pet--cheer', 1400);
      if (!reduced()) await wait(250);
      await flyOrbs(tick, counter, orbsFor(ev.level), levelColor(ev.level));
      await countTo(qs('#pool-count'), poolBefore, poolAfter, 450);
      playOnce(qs('.pool'), 'is-bumped', 500);
    }
    if (ev.type === 'task.undone') { await countTo(qs('#pool-count'), poolBefore, poolAfter, 300); c.announce('Tick undone.'); }
    if (ev.type === 'perfect.day') {
      const finish = qs('#finish');
      playOnce(qs('.today-ring'), 'is-lighting', 1200);
      playOnce(finish, 'is-arriving', 900);
      c.announce("Today's list: complete. You're done for today.");
    }
    if (ev.type === 'streak.eggs' && ev.count) c.announce(`Reward: ${ev.count} ${tierName(ev.tier)} egg${ev.count === 1 ? '' : 's'}${ev.lucky ? ', a lucky day' : ''}. Open them on the Eggs page.`);
    if (ev.type === 'commit.bonus') c.announce(`Commitment bonus: +${num(ev.amount)} growth for your pets.`);
    if (ev.type === 'pet.fed') {
      const target = petEl(ev.petId);
      await flyOrbs(qs('#pool-count'), target, Math.min(8, Math.max(2, Math.round(ev.amount / 20))), '#dfccff', 500);
      petMotion(target, 'pet--eat', 900);
      if (qs(`.companion[data-pet="${CSS.escape(ev.petId)}"]`)) petMotion(qs('#companion .companion'), 'pet--eat', 900);
    }
    if (ev.type === 'pet.levelUp') {
      petMotion(petEl(ev.petId), 'pet--levelup', 1300);
      const p = c.vm.pets.active.find(x => x.id === ev.petId) || c.vm.pets.backpack.find(x => x.id === ev.petId);
      c.announce(`${p?.name || 'A pet'} reached level ${ev.level}.`);
    }
    if (ev.type === 'egg.laid') c.announce(`A ${tierName(ev.tier)} egg was laid. Open it on the Eggs page.`);
    if (ev.type === 'quest.completed') { playOnce(qs(`[data-quest="${CSS.escape(ev.questId)}"]`), 'is-flashing', 900); c.announce(`Quest done: +${ev.coins} coins.`); }
    if (ev.type === 'quest.star') c.announce(`Quest star earned: ${ev.weekStars}/5 this week.`);
    if (ev.type === 'chest.ready') c.announce('The weekly chest is open: a Rare egg and 3 diamonds.');
    if (ev.type === 'day.levelChanged') c.announce(`Day level ${levelLabel(ev.to)}.${ev.commitBroken ? ' The commitment bonus is lost for today.' : ''}`);
    if (ev.type === 'streak.milestone') c.announce(`${ev.days} days. Look what you kept showing up for. ${ev.badge}: +${num(ev.coins)} coins.`);
  }
}

// The morning receipt: built from the close-of-day events that advance() returns on load.
function onLoad(events, c) {
  maybeNotify(c);
  const closed = events.filter(e => e.type === 'day.closed');
  if (!closed.length || !c.owner || c.vm?.morning) return; // the engine's viewMorning wins when present
  const last = closed[closed.length - 1];
  const levels = events.filter(e => e.type === 'pet.levelUp').length;
  const eggs = events.filter(e => e.type === 'streak.eggs').reduce((n, e) => n + (e.count || 0), 0) + events.filter(e => e.type === 'egg.laid').length;
  const prev = store.get(MORNING_KEY);
  if (prev?.dayKey === last.dayKey) return;
  store.set(MORNING_KEY, { dayKey: last.dayKey, outcome: last.outcome, streak: last.streak, foodTotal: last.foodTotal, bonus: last.bonus, levels, eggs });
  c.render();
}

// Optional browser notification while the page is open, once per slot (19:00, 21:15, 07:30).
function maybeNotify(c) {
  const vm = c.vm, ctx = c.ctx();
  if (!ctx.owner || !vm.settings?.reminders?.notify || globalThis.Notification?.permission !== 'granted') return;
  const text = reminderText(vm, ctx);
  if (!text) return;
  const m = nyMinutes(ctx.now);
  const slot = m >= 21 * 60 + 15 ? '2115' : m >= 19 * 60 ? '1900' : '0730';
  const key = `daily:notified:${vm.today?.dayKey}:${slot}`;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { return; }
  try { new Notification('Daily', { body: text, tag: 'daily-reminder' }); } catch { /* unsupported */ }
}

const actions = {
  tick: async (el, ev, c) => {
    const task = c.vm.today.tasks.find(t => t.id === el.dataset.task);
    if (!task) return;
    c.ui.receipts[task.id] = `${task.name} · ${task.amountText}`;
    c.ui.openRaise = null;
    const goalTag = document.querySelector(`[data-goal-tag="${CSS.escape(task.id)}"]`)?.value || undefined;
    if (!(await c.act({ type: 'task/tick', taskId: task.id, ...(goalTag ? { goalTag } : {}) }))) delete c.ui.receipts[task.id];
  },
  undo: async (el, ev, c) => { delete c.ui.receipts[el.dataset.task]; await c.act({ type: 'task/undo', taskId: el.dataset.task }); },
  'raise-toggle': (el, ev, c) => {
    c.ui.openRaise = c.ui.openRaise === el.dataset.task ? null : el.dataset.task;
    c.render();
    if (c.ui.openRaise) qs(`#raise-${CSS.escape(c.ui.openRaise)} .chip-button:not([disabled])`)?.focus();
  },
  raise: async (el, ev, c) => {
    const ok = await c.act({ type: 'task/raise', taskId: el.dataset.task, level: el.dataset.level });
    if (ok) { c.ui.openRaise = null; c.render(); qs(`[data-task-row="${CSS.escape(el.dataset.task)}"] .tick`)?.focus(); c.announce(`Raised to ${levelLabel(el.dataset.level)}.`); }
  },
  'day-level': async (el, ev, c) => {
    const t = c.vm.today;
    const to = el.dataset.level;
    if (to === t.level) return;
    if (t.commitLevel && t.bonusAlive && levelIndex(to) < levelIndex(t.commitLevel)) {
      const ok = await c.confirm({ title: `Lower the day to ${levelLabel(to)}?`, body: `You committed at ${levelLabel(t.commitLevel)}. Lowering below it loses today's +20% commitment bonus. Ticked tasks keep their level and food. Lowering still saves the streak.`, confirm: `Lower to ${levelLabel(to)}`, danger: true });
      if (!ok) return;
    }
    await c.act({ type: 'day/setLevel', level: to });
  },
  feed: async (el, ev, c) => c.act({ type: 'pet/feed', petId: el.dataset.pet, amount: Number(el.dataset.amount) }),
  'feed-dinner': async (el, ev, c) => {
    const plan = dinnerPlan(c.vm.today, c.vm.pets);
    if (!plan.feeds.length) { c.announce('Everyone has had dinner.'); return; }
    await c.actMany(plan.feeds.map(f => ({ type: 'pet/feed', petId: f.petId, amount: f.amount })));
    c.announce(`${num(plan.meal)} food to dinner.`);
  },
  'feed-surplus': async (el, ev, c) => {
    const plan = dinnerPlan(c.vm.today, c.vm.pets);
    const pet = c.ctx().focusPet;
    if (!pet || plan.growth <= 0) return;
    await c.act({ type: 'pet/feed', petId: pet.id, amount: plan.growth });
  },
  'dismiss-morning': (el, ev, c) => {
    const m = currentMorning(c.vm);
    if (m) store.set(DISMISS_KEY, m.dayKey);
    c.render();
    qs('#today .tick:not([disabled])')?.focus();
  },
  'receipts-scope': (el, ev, c) => { c.ui.receiptsScope = el.dataset.scope; c.render(); },
  'pet-companion': async (el, ev, c) => {
    if (await c.act({ type: 'settings/save', settings: { companionId: el.dataset.pet } })) c.announce('Companion changed.');
  },
  'pet-rename': async (el, ev, c) => {
    const p = [...c.vm.pets.active, ...c.vm.pets.backpack].find(x => x.id === el.dataset.pet);
    const name = await c.prompt({ title: `Rename ${p.name}`, label: 'Name (up to 12 characters)', value: p.name, maxlength: 12 });
    if (name) await c.act({ type: 'pet/rename', petId: p.id, name });
  },
  'pet-deactivate': async (el, ev, c) => c.act({ type: 'pet/deactivate', petId: el.dataset.pet }),
  'pet-activate': async (el, ev, c) => c.act({ type: 'pet/activate', petId: el.dataset.pet }),
  'pet-treat': async (el, ev, c) => c.act({ type: 'pet/useTreat', petId: el.dataset.pet, treatId: el.dataset.treat }),
  'pet-release': async (el, ev, c) => {
    const p = [...c.vm.pets.active, ...c.vm.pets.backpack].find(x => x.id === el.dataset.pet);
    const ok = await c.confirm({ title: `Release ${p.name}?`, body: `${p.name} (${tierName(p.tier)} ${p.speciesName || p.species}, Lv ${p.level}) leaves for good. You get ${tierName(p.tier)} egg food in return. This can't be undone.`, confirm: `Release ${p.name}`, danger: true });
    if (ok && await c.act({ type: 'pet/release', petId: p.id })) c.announce(`${p.name} was released.`);
  },
};

const controller = createController({ sections, actions, onEvents, onLoad });
controller.ui = { receipts: {}, openRaise: null, receiptsScope: 'month' };
controller.start();
