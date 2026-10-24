// /daily/ render modules. Pure: (view models, ctx) → HTML. ctx = { owner, art, now, ui }.
// The controller (daily.js) owns state and events; nothing here touches the DOM.
import { html, raw } from './html.js';
import {
  AMBER, DAY_LEVELS, DEEP_WORK_TAGS, LEVELS, ORBS_BY_LEVEL, levelColor, levelIndex, levelLabel, listText, num, percentWidth, plural, signed, stars, tierColor, tierName,
} from './format.js';
import { clock, dayLabel, duration, liveWindow, monthName, nyMinutes } from './time.js';

const ui = ctx => ctx.ui || {};

// ---------- header stats ----------
export function streakLine(header) {
  const t = header.tonight || {};
  if (!header.streak) return 'No bonus until a full day is finished.';
  if (t.lucky) return `Next full day is lucky: 5–10 ${tierName(t.tier)} eggs.`;
  const count = t.count || 0;
  const now = count ? `${count} ${tierName(t.tier)} egg${count === 1 ? '' : 's'} per full day.` : '';
  const step = header.nextStep;
  const next = !step ? '' : typeof step === 'string' ? step : step.lucky ? `Lucky day at ${step.day}.` : `${step.count} from day ${step.day}.`;
  return `${now} ${next}`.trim();
}

export function windowText(win, now) {
  if (!win) return { main: '—', sub: '' };
  if (win.phase === 'before') return { main: `Opens ${clock(win.opensAt)}`, sub: 'Tasks count from 5 AM to 10 PM.' };
  if (win.phase === 'closed') return { main: 'Closed', sub: 'Closed at 10 PM. Reopens at 5 AM.' };
  return { main: `Closes ${clock(win.closesAt)}`, sub: `${duration(win.closesAt - now)} left. Reminders stop at 9:30 PM.` };
}

export function renderHeaderStats(header, ctx) {
  const win = windowText(ctx.window || header.window, ctx.now);
  const k = header.keeper || { level: 0, xp: 0, xpNext: 1 };
  return html`
<div class="stat stat--streak"><p class="stat-label">Streak</p><p class="stat-value"><span class="big" style="color:${AMBER}">${num(header.streak)}</span><span>days</span></p><p class="stat-note">${streakLine(header)}${header.best ? ` Best ${num(header.best)}.` : ''}</p></div>
<div class="stat"><p class="stat-label">Freezes</p><p class="stat-value"><span class="big" style="color:#9fd4ff">${header.freezes}</span><span>/ ${header.freezeCap ?? 3} max</span></p><p class="stat-note">Used automatically on an unfinished day. Shop only.</p></div>
<div class="stat"><p class="stat-label">Day window</p><p class="stat-window">${win.main}</p><p class="stat-note">${win.sub}</p></div>
<div class="stat stat--keeper"><p class="stat-label">Keeper level</p><p class="stat-value"><span class="big" style="color:var(--accent)">${k.level}</span></p><div class="bar bar--thin" role="img" aria-label="${num(k.xp)} of ${num(k.xpNext)} Keeper XP"><span style="width:${percentWidth(k.xp, k.xpNext)}%;background:var(--accent)"></span></div><p class="stat-note">Permanent. Never lost, even if pets die.</p></div>`;
}

// ---------- compact status line + Phoenix ----------
const HUNGER = {
  fed: { label: 'Fed', color: '#7ee0c3', text: 'Every task finished yesterday and everyone ate.' },
  hungry: { label: 'Hungry', color: AMBER, text: "Yesterday wasn't finished. The streak reset and every pet lost 2 levels; they earn 2× XP until they're back." },
  starving: { label: 'Starving', color: '#ff9fb2', text: 'Two unfinished days in a row. Every pet lost 5 more levels. One more and the active pets die.' },
  dead: { label: 'Dead', color: '#ff6b81', text: 'Three unfinished days. The active pets are ashes and the backpack lost half. Keeper level and the Petdex are untouched.' },
};

export function renderStatusLine(header, pets) {
  const h = HUNGER[header.hunger] || HUNGER.fed;
  const active = pets?.active?.length || 0;
  const fed = (pets?.active || []).filter(p => p.fedToday >= (p.need || 100)).length;
  const today = active ? `${fed}/${active} active pets fed today.` : 'No active pets.';
  return html`<p class="status-line"><span class="dot" style="background:${h.color}" aria-hidden="true"></span><span style="color:${h.color}">${h.label}.</span> ${today}${header.ashes ? html` <a href="#hunger">Phoenix: ${header.ashes.done}/${header.ashes.need} days</a>` : ''}</p>`;
}

export function renderHunger(header, art) {
  const current = header.hunger || 'fed';
  const steps = [
    ['fed', 'Every task done', 'Streak grows, pets eat, egg meters fill.'],
    ['hungry', '1 unfinished day', 'No freeze left: streak resets, every pet −2 levels.'],
    ['starving', '2 in a row', 'Every pet −5 more levels.'],
    ['dead', '3 in a row', 'Active pets turn to ashes. Backpack loses half.'],
  ];
  const h = HUNGER[current] || HUNGER.fed;
  return html`<div class="hunger-panel" style="border-color:${h.color}88">
<p class="hunger-now"><span style="color:${h.color}">${h.label}.</span> ${h.text}</p>
<ol class="hunger-ladder" aria-label="Hunger ladder">${steps.map(([key, when, rule]) => {
    const s = HUNGER[key];
    const on = key === current;
    return html`<li class="hunger-step${on ? ' is-current' : ''}"${on ? raw(' aria-current="step"') : ''} style="${on ? `border-color:${s.color}` : ''}"><span class="mono-label" style="color:${s.color}">${when}</span><span class="hunger-label">${s.label}</span><span class="hunger-rule">${rule}</span></li>`;
  })}</ol>
${header.ashes ? renderPhoenix(header.ashes, art) : ''}</div>`;
}

export function renderPhoenix(ashes, art) {
  const segs = Array.from({ length: ashes.need || 3 }, (_, i) => i < ashes.done);
  return html`<div class="phoenix"><div class="phoenix-art">${raw(art.renderPet({ species: ashes.species, tier: ashes.tier, mood: 'ashes', size: 72, name: ashes.name }))}</div>
<div class="phoenix-copy"><p class="mono-label" style="color:${AMBER}">Phoenix</p><p>A way back: finish 3 days in a row by ${dayLabel(ashes.deadlineDay)}. ${ashes.name} returns with the same tier and stars at half the level.</p></div>
<div class="phoenix-progress" role="img" aria-label="${ashes.done} of ${ashes.need} days done">${segs.map(on => html`<span class="${on ? 'on' : ''}"></span>`)}<span class="mono">${ashes.done} / ${ashes.need} days</span></div></div>`;
}

// ---------- morning receipt (dismissible, never blocks the list) ----------
export function renderMorning(m) {
  if (!m) return html``;
  const ok = m.outcome === 'complete' || m.outcome === 'frozen';
  const lines = [
    m.total ? `${m.tasksDone ?? 0}/${m.total} tasks done.` : '',
    m.outcome === 'frozen' ? 'A freeze covered the day; the streak held.' : ok ? `Streak ${m.streak}.` : 'The streak reset.',
    m.foodTotal ? `${num(m.foodTotal)} food earned${m.bonus ? ` (with a ${num(m.bonus)} commitment bonus)` : ''}.` : '',
    m.levels ? `${plural(m.levels, 'level')} gained.` : '',
  ].filter(Boolean);
  return html`<div class="morning-card" role="region" aria-label="Morning receipt"><div><p class="mono-label">${dayLabel(m.dayKey)}</p><p class="morning-title">${m.heading || (ok ? 'Yesterday counted.' : 'A new day is open.')}</p><p class="muted">${lines.join(' ')}</p></div>
<div class="morning-actions">${m.eggs ? html`<a class="button button--accent" href="/daily/eggs/#openable">Open ${plural(m.eggs, 'egg')}</a>` : ''}<button type="button" class="button" data-action="dismiss-morning">Dismiss</button></div></div>`;
}

// ---------- today ring + flame ----------
export function flameState(today, header, now) {
  const { done, total } = today.progress || { done: 0, total: 0 };
  const win = header.window || {};
  const left = total - done;
  if (total && left === 0) return { kind: 'lit', text: today.reward ? 'Done · +1 earned' : '+1 at 22:00' };
  if (win.phase === 'open' && nyMinutes(now) >= 19 * 60) return { kind: 'risk', text: `${left} left · ${duration((win.closesAt || now) - now)}` };
  if (win.phase === 'closed') return { kind: 'idle', text: 'Closed for today' };
  return { kind: 'idle', text: `${left} left today` };
}

export function renderRing(today, header, now) {
  const tasks = today.tasks || [];
  const n = Math.max(1, tasks.length);
  const r = 52, C = 2 * Math.PI * r, gap = n > 1 ? 5 : 0;
  const seg = C / n - gap;
  const flame = flameState(today, header, now);
  const { done, total } = today.progress || { done: 0, total: tasks.length };
  return html`<div class="today-ring ring--${flame.kind}" role="img" aria-label="${done} of ${total} tasks done. Streak ${header.streak} days. ${flame.text}.">
<svg viewBox="0 0 132 132" width="132" height="132" aria-hidden="true"><g transform="rotate(-90 66 66)">${tasks.map((t, i) => html`<circle class="ring-seg${t.ticked ? ' is-done' : ''}" data-seg="${t.id}" cx="66" cy="66" r="${r}" fill="none" stroke="${t.ticked ? levelColor(t.level) : '#ffffff1f'}" stroke-width="10" stroke-dasharray="${seg.toFixed(2)} ${(C - seg).toFixed(2)}" stroke-dashoffset="${(-i * C / n).toFixed(2)}"/>`)}</g>
<g class="flame" transform="translate(66 50)"><path class="flame-outer" d="M0-26C9-14 18-6 18 7A18 18 0 0 1-18 7C-18-3-10-8-8-18-3-12 0-10 0-26Z"/><path class="flame-inner" d="M0-8C4-2 8 2 8 8A8 8 0 0 1-8 8C-8 3-4 0 0-8Z"/></g>
<text x="66" y="92" text-anchor="middle" class="ring-streak">${header.streak}</text></svg>
<p class="ring-caption ring-caption--${flame.kind}">${flame.text}</p></div>`;
}

// ---------- day-level picker ----------
export function renderDayPicker(today, ctx) {
  const firstTick = !(today.progress?.done) && !today.commitLevel;
  const bonus = today.commitLevel
    ? (today.bonusAlive ? html`<span class="bonus bonus--alive">+20% commitment bonus alive · committed at ${levelLabel(today.commitLevel)}</span>` : html`<span class="bonus bonus--lost">Commitment bonus lost today</span>`)
    : html`<span class="bonus">Commit to ${levelLabel(today.level)}: finish without lowering for +20% food when you finish.</span>`;
  return html`<div class="day-picker"><div class="picker-row" role="group" aria-label="Day level">${DAY_LEVELS.map(l => {
    const on = today.level === l;
    return html`<button type="button" class="chip-button"${ctx.owner ? raw(' data-action="day-level"') : ''} data-level="${l}" aria-pressed="${on}" style="--chip:${levelColor(l)}" ${ctx.owner ? '' : raw('disabled')}>${on && firstTick && ctx.owner ? `Commit to ${levelLabel(l)}` : levelLabel(l)}</button>`;
  })}</div><p class="picker-note">${bonus}</p></div>`;
}

// ---------- raise preview (display-only, client-side) ----------
const counted = (x, cap = 1200, rate = 0.5) => Math.min(x, cap) + Math.max(0, x - cap) * rate;

export function projectedDay(today, overrides = {}) {
  const planned = (today.tasks || []).reduce((n, t) => n + (overrides[t.id] ?? t.food), 0);
  const withBonus = today.bonusAlive || !today.commitLevel ? planned * 1.2 : planned;
  const f = today.food || {};
  return { planned, total: Math.round(counted(withBonus, f.cap ?? 1200, f.capRate ?? 0.5)), capped: withBonus > (f.cap ?? 1200) };
}

export function petOutcome(pet, growth) {
  if (!pet || growth <= 0) return null;
  let level = pet.level, xp = pet.xp + growth, next = pet.xpNext || 50 * level + 50;
  while (xp >= next && level < (pet.cap || 100)) { xp -= next; level += 1; next = 50 * level + 50; }
  return level > pet.level ? `${pet.name} reaches Lv ${level} if fed tonight` : `${pet.name} gets +${num(growth)} XP if fed tonight`;
}

export function raiseOptions(task, today, ladder, focusPet) {
  const row = ladder?.rows?.find(r => r.taskId === task.id);
  const foodAt = l => (Array.isArray(ladder?.foodRow) ? ladder.foodRow[levelIndex(l)] : ladder?.foodRow?.[l]) ?? task.food;
  const f = today.food || {};
  return (task.raiseTo || []).map(level => {
    const food = foodAt(level);
    const proj = projectedDay(today, { [task.id]: food });
    const growth = proj.total - (f.activeNeed || 0) - (f.upkeep || 0);
    const blocked = level === 'goddamn' && today.goddamnCount >= (today.goddamnMax ?? 2);
    return {
      level, food, delta: food - task.food, blocked,
      requirement: `${task.name}: ${task.amountText} → ${row?.cells?.[level] ?? levelLabel(level)}`,
      projected: proj.total, capped: proj.capped,
      pet: petOutcome(focusPet, growth),
    };
  });
}

// ---------- the list ----------
function tickLabel(t, owner) {
  if (!owner) return `${t.name}: ${t.ticked ? 'done' : 'not done yet'}`;
  if (t.ticked && t.canUndo) return `Undo ${t.name} (within 5 minutes)`;
  if (t.ticked) return `${t.name}: done at ${levelLabel(t.level)}`;
  return `Tick ${t.name}: ${levelLabel(t.level)}, ${t.amountText}, +${t.food} food`;
}

export function renderTask(t, today, ctx) {
  const owner = ctx.owner;
  const open = ui(ctx).openRaise === t.id;
  const receipt = ui(ctx).receipts?.[t.id];
  const undoLeft = t.ticked && t.canUndo && t.tickedAt ? Math.max(0, 300000 - (ctx.now - t.tickedAt)) : 0;
  const color = levelColor(t.level);
  const final = t.ticked && !t.canUndo;
  return html`<li class="task${t.ticked ? ' is-done' : ''}" data-task-row="${t.id}" style="--level:${color}">
<button type="button" class="tick"${owner ? html` data-action="${t.ticked ? 'undo' : 'tick'}"` : ''} data-task="${t.id}" aria-pressed="${t.ticked}" aria-label="${tickLabel(t, owner)}"${!owner || final ? raw(' disabled') : ''}>
<svg viewBox="0 0 56 56" aria-hidden="true"><circle class="tick-box" cx="28" cy="28" r="19"/>${undoLeft ? html`<circle class="undo-ring" cx="28" cy="28" r="25" pathLength="100" style="animation-duration:300s;animation-delay:-${((300000 - undoLeft) / 1000).toFixed(1)}s"/>` : ''}<path class="tick-check" d="M19 28.5l6 6L37.5 22"/></svg></button>
<div class="task-main"><p class="task-name">${t.name}<span class="chip" style="--chip:${color}">${t.levelLabel || levelLabel(t.level)}</span>${t.note ? html`<span class="task-note">${t.note}</span>` : ''}${t.physical ? html`<span class="task-note">physical · capped</span>` : ''}</p>
<p class="task-amount">${t.amountText}</p>${t.purpose ? html`<p class="task-goal">${t.purpose}${owner && t.goal ? html` <span class="task-link">· ${t.goal}</span>` : ''}</p>` : owner && t.goal ? html`<p class="task-goal">${t.goal}</p>` : ''}${receipt ? html`<p class="task-receipt">${receipt}</p>` : ''}${owner && !t.ticked && (t.receipt === 'deep' || t.id === 'deep') ? html`<label class="tag-pick"><span>Tag this deep work (private)</span><select data-goal-tag="${t.id}"><option value="">No tag</option>${DEEP_WORK_TAGS.map(g => html`<option value="${g}">${g}</option>`)}</select></label>` : ''}</div>
<div class="task-side"><span class="task-food${t.ticked ? ' is-earned' : ''}">+${num(t.food)}</span>${owner && !t.ticked && t.raiseTo?.length ? html`<button type="button" class="raise-toggle" data-action="raise-toggle" data-task="${t.id}" aria-expanded="${open}" aria-controls="raise-${t.id}">Raise</button>` : ''}</div>
${owner && !t.ticked && t.raiseTo?.length ? renderRaisePanel(t, today, ctx, open) : ''}</li>`;
}

export function renderRaisePanel(t, today, ctx, open) {
  const opts = raiseOptions(t, today, ctx.ladder, ctx.focusPet);
  return html`<div class="raise-panel" id="raise-${t.id}"${open ? '' : raw(' hidden')}><p class="raise-intro">Raise only goes up from the day level. It locks when ticked.</p><ul>${opts.map(o => html`<li class="raise-option" style="--chip:${levelColor(o.level)}">
<div><p class="raise-req">${o.requirement}</p><p class="raise-math">+${num(o.food)} food (${signed(o.delta)}) · day ≈ ${num(o.projected)}${o.capped ? ' after the 1,200 soft cap' : ' before the 1,200 soft cap'}${o.pet ? html` · → ${o.pet}` : ''}</p></div>
<button type="button" class="chip-button" data-action="raise" data-task="${t.id}" data-level="${o.level}" style="--chip:${levelColor(o.level)}"${o.blocked ? raw(' disabled') : ''}>${o.blocked ? 'Goddamn 2/2 used' : `Raise to ${levelLabel(o.level)}`}</button></li>`)}</ul></div>`;
}

export function renderFinish(today, header, ctx) {
  const { done, total } = today.progress || {};
  if (!total || done < total) return html``;
  const ticked = (today.tasks || []).filter(t => t.ticked && t.type !== 'quality' && t.unit);
  const added = ticked.map(t => `${t.amountText} (${t.name.toLowerCase()})`);
  const t = header.tonight || {};
  const rw = today.reward;
  // Paid at the last tick (engine close.js payCompletion); a save from before that rule is paid at 22:00.
  const preview = rw ? [
    `Streak ${rw.streakAfter}.`,
    rw.eggs?.count ? `Earned ${plural(rw.eggs.count, `${tierName(rw.eggs.tier)} egg`)}${rw.eggs.lucky ? ' (lucky day)' : ''}.` : '',
    rw.bonus ? `+${num(rw.bonus)} commitment bonus went into your pets' growth.` : '',
    `${today.weekStars ?? 0}/5 quest stars this week.`,
  ] : [
    t.lucky ? `Lucky night: 5–10 ${tierName(t.tier)} eggs.` : t.count ? `Tonight at 22:00: ${plural(t.count, `${tierName(t.tier)} egg`)}.` : '',
    today.bonusAlive ? 'The +20% commitment bonus is alive.' : '',
    `${today.weekStars ?? 0}/5 quest stars this week.`,
  ];
  return html`<section class="finish" aria-labelledby="finish-title" tabindex="-1" id="finish"><h3 id="finish-title">Today's list: complete.</h3>
${added.length ? html`<p>Today added ${listText(added)}.</p>` : ''}<p class="muted">${preview.filter(Boolean).join(' ')}</p>
${ctx.owner ? html`<button type="button" class="button button--accent" data-action="feed-dinner">Feed dinner</button>${rw?.eggs?.count ? html` <a class="button" href="/daily/eggs/#openable">Open ${plural(rw.eggs.count, 'egg')}</a>` : ''}` : ''}
<p class="finish-done">You're done for today. Enjoy your evening.</p></section>`;
}

export function renderToday(today, header, ctx) {
  const { done, total } = today.progress || { done: 0, total: 0 };
  return html`<div class="today-head">${renderRing(today, header, ctx.now)}<div class="today-title"><p class="eyebrow-mono">Today · ${dayLabel(today.dayKey)} · list locked for ${monthName(today.listMonth)}</p><h2 id="today-title" class="section-title">A little progress, <em>every day.</em></h2>
<p class="mono muted">${done}/${total} done · ${today.goddamnCount ?? 0}/${today.goddamnMax ?? 2} Goddamn</p></div></div>
${renderDayPicker(today, ctx)}
<ul class="task-list">${(today.tasks || []).map(t => renderTask(t, today, ctx))}</ul>
${renderFinish(today, header, ctx)}`;
}

// ---------- food panel (pool counter, dinner then growth) ----------
export function dinnerPlan(today, pets) {
  const f = today.food || {};
  const spendable = Math.max(0, (f.pool || 0) - (f.upkeep || 0));
  let left = spendable;
  const feeds = [];
  for (const p of pets?.active || []) {
    if (p.mood === 'dead') continue;
    const want = Math.max(0, (p.need || 100) - (p.fedToday || 0));
    const give = Math.min(want, left);
    if (give > 0) { feeds.push({ petId: p.id, amount: give }); left -= give; }
  }
  const meal = spendable - left;
  return { spendable, meal, growth: left, feeds };
}

export function renderFoodPanel(today, pets, ctx) {
  const f = today.food || {};
  const plan = dinnerPlan(today, pets);
  const proj = projectedDay(today);
  const focus = ctx.focusPet;
  const surplusTo = focus ? focus.name : 'the companion';
  const activeN = pets?.active?.length || 0;
  const backN = pets?.backpack?.length || 0;
  return html`<div class="pool"><p class="mono-label">Pet food to hand out</p><p class="pool-count" id="pool-count" data-value="${f.pool || 0}" aria-live="off">${num(f.pool || 0)}</p>
${f.upkeep ? html`<p class="pool-note">${num(f.upkeep)} reserved for backpack upkeep until you spend it.</p>` : ''}</div>
<dl class="food-math">
<dt>Earned so far</dt><dd>${num(f.earned)}${f.counted !== undefined && f.counted !== f.earned ? html` <span class="muted">(${num(f.counted)} counted)</span>` : ''}</dd>
<dt>If you finish as set</dt><dd>${num(proj.total)}</dd>
<dt>Commitment bonus when you finish</dt><dd>${today.reward ? `+${num(today.reward.bonus)} paid` : today.bonusAlive || !today.commitLevel ? `+${num(f.bonusPreview)}` : 'lost'}</dd>
<dt>Soft cap</dt><dd>${num(f.cap ?? 1200)}, then ${Math.round((f.capRate ?? 0.5) * 100)}%</dd>
<dt>Active pets need (${activeN} × 100)</dt><dd>${num(f.activeNeed)}</dd>
<dt>Backpack upkeep (${backN} × 10)</dt><dd>${num(f.upkeep)}</dd>
<dt class="total">Left for growth</dt><dd class="total" style="color:${(f.leftForGrowth ?? 0) >= 0 ? 'var(--accent)' : AMBER}">${signed(f.leftForGrowth ?? 0)}</dd></dl>
${ctx.owner ? html`<div class="feed-actions"><button type="button" class="button button--accent" data-action="feed-dinner"${plan.meal ? '' : raw(' disabled')}>Feed to dinner</button><button type="button" class="button" data-action="feed-surplus"${plan.growth && focus ? '' : raw(' disabled')}>Feed surplus</button></div>
<p class="feed-preview">${num(plan.meal)} to dinner · ${num(plan.growth)} growth food → +${num(plan.growth)} XP · +${num(plan.growth)} egg meter${plan.growth ? ` (surplus goes to ${surplusTo})` : ''}</p>` : ''}`;
}

export function renderCompanion(pet, art, ctx) {
  if (!pet) return html`<p class="muted companion-empty">No active pet yet.</p>`;
  return html`<figure class="companion" data-pet="${pet.id}">${raw(art.renderPet({ species: pet.species, tier: pet.tier, mood: pet.mood, stars: pet.stars, cosmetic: pet.cosmetic, size: 200, name: pet.name, level: pet.level, focus: true, animate: !ctx.reduced }))}<figcaption><span>${pet.name}</span> <span class="muted mono">${tierName(pet.tier)} · Lv ${pet.level}</span></figcaption></figure>`;
}

// ---------- quests + season ----------
export function renderQuests(today) {
  return html`<div class="panel-head"><h2 class="panel-title">Daily quests</h2><span class="mono muted small">${today.weekStars ?? 0}/5 stars this week</span></div>
<ul class="quests">${(today.quests || []).map(q => html`<li class="quest${q.done ? ' is-done' : ''}" data-quest="${q.id}"><span class="quest-dot" aria-hidden="true"></span><span class="quest-text">${q.text}${q.target > 1 && !q.done ? html` <span class="muted mono small">${q.progress}/${q.target}</span>` : ''}<span class="sr-only">${q.done ? ' (done)' : ''}</span></span><span class="mono muted small">+${q.coins} coins</span></li>`)}</ul>
<p class="small muted">All 3 done = 1 star. 5 stars in a week opens the weekly chest: a Rare egg and 3 diamonds.</p>`;
}

export function renderSeason(today) {
  const s = today.season;
  if (today.prologue || !s) {
    return html`<div class="panel-head"><h2 class="panel-title">Season</h2><span class="mono muted small">prologue</span></div><p class="small muted">First season begins November 1. Your Keeper progress is already growing. Tier 30 in November: the Acorn Cap.</p>`;
  }
  return html`<div class="panel-head"><h2 class="panel-title">${monthName(s.month)} season${s.name ? html` <span class="muted small">· ${s.name}</span>` : ''}</h2><span class="mono muted small">tier ${s.tier} / ${s.maxTier ?? 30}</span></div>
<div class="bar" role="img" aria-label="${s.xpInTier} of ${s.xpPerTier} XP into tier ${s.tier + 1}"><span style="width:${percentWidth(s.xpInTier, s.xpPerTier)}%;background:${AMBER}"></span></div>
<p class="small muted">Season XP = food you earn this month.${s.nextReward ? ` Next: tier ${Math.min(s.tier + 1, s.maxTier ?? 30)} · ${s.nextReward}.` : ''}${s.cosmetic ? ` Tier 30: ${s.cosmetic}.` : ''} Free, resets with the monthly list.</p>`;
}

// ---------- pets ----------
export function seatsLine(pets) {
  const s = pets.seats || {};
  const parts = [`${s.base ?? 3} base`];
  if (s.bought) parts.push(`${s.bought} bought`);
  parts.push(`${s.fromAbilities || 0} from abilities`);
  return `Seats: ${parts.join(' + ')} = ${s.total ?? 3} · ${s.used ?? pets.active?.length ?? 0} filled · each needs 100 food`;
}

export function renderPetCard(p, ctx, { pool = 0, treats = [] } = {}) {
  const c = tierColor(p.tier);
  const dead = p.mood === 'dead';
  const fedPct = percentWidth(p.fedToday, p.need || 100);
  const fedColor = p.fedToday >= (p.need || 100) ? 'var(--accent)' : AMBER;
  const div = p.dividend || {};
  const canFeed = ctx.owner && !dead && pool > 0;
  const trinketNote = p.tier >= 3 ? `${p.trinkets?.length || 0} / 5 trinkets${p.trinkets?.length ? `: ${p.trinkets.map(t => t.name).join(', ')}` : ''}` : 'Trinkets unlock at Epic';
  const isCompanion = ctx.focusPet?.id === p.id;
  return html`<article class="pet-card" data-pet="${p.id}" style="--tier:${c}">
<div class="pet-card-top"><span class="tier-chip" style="background:${c}">${p.tierName || tierName(p.tier)}</span><span class="pet-stars" role="img" aria-label="${p.stars} of 5 stars" style="color:${c}">${stars(p.stars)}</span></div>
<div class="pet-stage">${raw(ctx.art.renderPet({ species: p.species, tier: p.tier, mood: p.mood, stars: p.stars, cosmetic: p.cosmetic, size: 128, name: p.name, level: p.level, focus: false, animate: !ctx.reduced }))}</div>
<div class="pet-name-row"><h3>${p.name}</h3><span class="mono muted small">${p.speciesName || p.species} · ${dead ? 'gravestone' : `Lv ${p.level} / ${p.cap}`}</span>${p.penalty ? html`<span class="mono small amber">−${p.penalty} Lv</span>` : ''}${p.comebackOwed ? html`<span class="badge">2× comeback XP · ${num(p.comebackOwed)} to go</span>` : ''}${isCompanion ? html`<span class="badge badge--accent">Companion</span>` : ''}</div>
<div class="meter"><div class="meter-head"><span>Food today</span><span style="color:${fedColor}">${num(p.fedToday)} / ${num(p.need || 100)}</span></div><div class="bar"><span style="width:${fedPct}%;background:${fedColor}"></span></div></div>
<div class="meter"><div class="meter-head"><span>Egg meter</span><span>${num(p.meter)} / ${num(p.meterCap)}</span></div><div class="bar"><span style="width:${percentWidth(p.meter, p.meterCap)}%;background:${c}"></span></div></div>
<ul class="pet-facts"><li>Pays ${num(div.coins)} coins${div.shards ? ` + ${div.shards} diamond shards` : ''} a day when fed 100</li>
<li>${p.seatBonus ? `Seat ability: its own seat + ${p.seatBonus} extra while active` : p.tier >= 2 ? 'Seat ability: its own seat' : 'No seat ability (Super Rare and up)'}${p.beacon ? ' · Beacon on' : ''}</li>
<li>${trinketNote}</li>
${(p.abilities || []).map(a => html`<li class="${a.active ? '' : 'is-off'}"><span class="mono small">${a.kind === 'star' ? '★' : 'skill'}</span> ${a.name}: ${a.text}${a.active ? '' : ' (not active)'}</li>`)}</ul>
${ctx.owner ? html`<div class="pet-feed"><button type="button" class="button" data-action="feed" data-pet="${p.id}" data-amount="20"${canFeed ? '' : raw(' disabled')}>Feed 20</button><button type="button" class="button button--tier" data-action="feed" data-pet="${p.id}" data-amount="100"${canFeed ? '' : raw(' disabled')}>Feed 100</button></div>
<details class="pet-manage"><summary>Manage ${p.name}</summary><div class="manage-row">
${isCompanion ? '' : html`<button type="button" class="text-button" data-action="pet-companion" data-pet="${p.id}">Make companion</button>`}
<button type="button" class="text-button" data-action="pet-rename" data-pet="${p.id}">Rename</button>
<button type="button" class="text-button" data-action="pet-deactivate" data-pet="${p.id}">Move to backpack</button>
${treats.length ? html`<button type="button" class="text-button" data-action="pet-treat" data-pet="${p.id}" data-treat="${treats[0].id}">Use XP treat (+${num(treats[0].xp)} XP)</button>` : ''}
<button type="button" class="text-button danger" data-action="pet-release" data-pet="${p.id}">Release…</button></div></details>` : ''}
</article>`;
}

export function renderPets(pets, today, ctx, eggs) {
  const pool = today?.food?.pool || 0;
  const active = pets.active || [];
  return html`<div class="section-head">${raw('<h2 class="section-title">Active <em>pets</em></h2>')}<p class="mono-label">${seatsLine(pets)}</p></div>
${active.length ? html`<div class="pet-grid">${active.map(p => renderPetCard(p, ctx, { pool, treats: eggs?.treats || [] }))}</div>` : html`<p class="empty">No active pets right now.${ctx.owner ? ' Hatch a pet egg or move one in from the backpack.' : ''}</p>`}`;
}

export function renderBackpack(pets, ctx) {
  const list = pets.backpack || [];
  const freeSeat = (pets.seats?.used ?? pets.active?.length ?? 0) < (pets.seats?.total ?? 3);
  return html`<div class="section-head">${raw('<h2 class="section-title">Back<em>pack</em></h2>')}<p class="mono-label">${list.length} / ${pets.backpackCap ?? 12} · 10 food each a day · no eggs, no dividends, no seat abilities</p></div>
${list.length ? html`<ul class="backpack">${list.map(p => html`<li class="backpack-item" data-pet="${p.id}" style="--tier:${tierColor(p.tier)}">${raw(ctx.art.renderPet({ species: p.species, tier: p.tier, mood: p.mood, stars: p.stars, cosmetic: p.cosmetic, size: 72, name: p.name, level: p.level, focus: false, animate: false }))}
<div class="backpack-copy"><p class="backpack-name">${p.name}</p><p class="mono small muted">${tierName(p.tier)} ${p.speciesName || p.species} · ${stars(p.stars).replace(/☆/g, '')} · Lv ${p.level} / ${p.cap}${p.beacon ? ' · Beacon' : ''}</p>
${ctx.owner ? html`<div class="manage-row"><button type="button" class="text-button" data-action="pet-activate" data-pet="${p.id}">${freeSeat || p.tier >= 2 ? 'Make active' : 'Make active (no free seat)'}</button><button type="button" class="text-button danger" data-action="pet-release" data-pet="${p.id}">Release…</button></div>` : ''}</div></li>`)}</ul>` : html`<p class="empty">The backpack is empty.</p>`}`;
}

// ---------- receipts + ladder ----------
const RECEIPTS = [['pagesRead', 'Pages read', v => num(v)], ['hoursOutside', 'Hours outside', v => String(Math.round(v * 10) / 10)], ['workouts', 'Workouts', v => num(v)], ['avgSleepHours', 'Average sleep', v => `${Math.round(v * 10) / 10} h`], ['hardOrAbove', 'Tasks at Hard or above', v => num(v)]];

export function renderReceipts(receipts, ctx) {
  const scope = ui(ctx).receiptsScope === 'lifetime' ? 'lifetime' : 'month';
  const data = receipts?.[scope] || {};
  return html`<div class="section-head">${raw('<h2 class="section-title">Re<em>ceipts</em></h2>')}<div class="picker-row" role="group" aria-label="Receipts period">${['month', 'lifetime'].map(s => html`<button type="button" class="chip-button" data-action="receipts-scope" data-scope="${s}" aria-pressed="${scope === s}" style="--chip:var(--accent)">${s === 'month' ? 'This month' : 'Lifetime'}</button>`)}</div></div>
<p class="mono-label">What the pets actually stand for</p>
<dl class="receipts">${RECEIPTS.map(([key, label, f]) => html`<div><dt>${label}</dt><dd>${data[key] === undefined || data[key] === null ? '—' : f(data[key])}</dd></div>`)}</dl>
${ctx.owner && receipts?.goals?.length ? html`<p class="mono-label goals-label">Goals (private)</p><ul class="goals">${receipts.goals.map(g => html`<li>${g.goal} <span class="mono muted">${plural(g.tasksDone, 'task')}</span></li>`)}</ul>` : ''}`;
}

export function renderLadder(ladder) {
  const levels = ladder?.levels || LEVELS;
  const food = l => (Array.isArray(ladder?.foodRow) ? ladder.foodRow[levelIndex(l)] : ladder?.foodRow?.[l]);
  return html`<div class="section-head">${raw('<h2 class="section-title">Difficulty <em>ladder</em></h2>')}<p class="mono-label">quantity × Chill: 1 / 1.5 / 3 / 5 / 20 · food × 1 / 2 / 4 / 12 / 50</p></div>
<div class="table-wrap" tabindex="0" role="region" aria-label="Difficulty ladder table"><table class="ladder"><thead><tr><th scope="col">Task</th>${levels.map(l => html`<th scope="col"><span class="chip chip--solid" style="--chip:${levelColor(l)}">${levelLabel(l)}${l === 'easy' ? ' · default' : l === 'goddamn' ? ' · max 2/day' : ''}</span></th>`)}</tr></thead>
<tbody>${(ladder?.rows || []).map(r => html`<tr><th scope="row">${r.name}${r.note ? html`<span class="row-note">${r.note}</span>` : ''}</th>${levels.map(l => html`<td>${r.cells?.[l] ?? '—'}</td>`)}</tr>`)}
<tr class="food-row"><th scope="row">Pet food<span class="row-note">this list</span></th>${levels.map(l => html`<td style="${l === 'hard' ? `color:${AMBER}` : l === 'goddamn' ? 'color:#ff9fb2' : ''}">${food(l) === undefined ? '—' : num(food(l))}</td>`)}</tr></tbody></table></div>`;
}

// Orb count for the receipt-then-reward animation (CONTENT.md §I.2).
export const orbsFor = level => ORBS_BY_LEVEL[level] || 4;
