// HQ: the private command center. Local-first: all data lives in this browser's localStorage
// ('hq:v1') and never leaves it (the page's CSP sets connect-src 'none').
import * as H from './helpers.js';
import * as S from './store.js';

const $ = id => document.getElementById(id);
const store = (() => {
  try { const s = window.localStorage; if (s) return s; } catch { /* blocked */ }
  const blocked = () => { throw new Error('Storage unavailable'); };
  return { getItem: blocked, setItem: blocked, removeItem: blocked };
})();
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

let state = null;
const ui = {
  filter: 'all', open: new Set(), form: null, formDraft: null, formErrors: [],
  addingTask: null, taskDraft: '', picker: null, pickerChoice: '', celebrate: null, focusKey: null,
  dismissed: {}, clock: null,
};
const els = {};

// ---------- tiny DOM helpers ----------

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'key') el.dataset.key = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = true;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
const ICONS = {
  lock: '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  check: '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  close: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  chevron: '<svg class="chev" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
};
function icon(name) { const t = document.createElement('template'); t.innerHTML = ICONS[name]; return t.content.firstChild; }
const tbox = done => h('span', { class: 'tbox' }, done ? icon('check') : null);

// ---------- status, saving, confirm ----------

// The live region only ever receives change messages. The idle "Saved on this device" sits in a
// separate, non-live element, so returning to it after a message is silent.
// The short delay empties the region first, so the same message twice is still announced.
let sayTimer, showTimer;
function say(message) {
  const el = els.status;
  if (!el) return;
  el.textContent = '';
  els.idle.hidden = true;
  clearTimeout(sayTimer);
  clearTimeout(showTimer);
  showTimer = setTimeout(() => { el.textContent = message; }, 50);
  sayTimer = setTimeout(() => { el.textContent = ''; els.idle.hidden = false; }, 4000);
}
function fail(message, where = els.error) { if (where) where.textContent = message; }

/** Applies a pure mutation, saves it, and rolls back with an inline error when the write fails. */
function commit(mutate, { message = 'Saved.', render: rerender = true } = {}) {
  const prev = state;
  const next = mutate(prev);
  if (next === prev) return false;
  const result = S.writeStorage(store, next);
  if (!result.ok) {
    state = prev;
    render();
    fail(`${result.error} Your last change was undone.`);
    return false;
  }
  state = next;
  if (els.error) els.error.textContent = '';
  if (rerender) render();
  say(message);
  return true;
}

function confirmDialog({ title, body, ok = 'Delete' }) {
  const dialog = $('confirm');
  $('confirm-title').textContent = title;
  $('confirm-body').textContent = body;
  $('confirm-ok').textContent = ok;
  return new Promise(resolve => {
    if (typeof dialog.showModal !== 'function') { resolve(window.confirm(`${title}\n\n${body}`)); return; }
    const done = () => { dialog.removeEventListener('close', done); resolve(dialog.returnValue === 'ok'); };
    dialog.returnValue = '';
    dialog.addEventListener('close', done);
    dialog.showModal();
    $('confirm-cancel').focus();
  });
}

// ---------- time ----------

function clock(now = Date.now()) {
  return { today: H.dateKey(now), day: H.periodDay(now), month: H.periodMonth(now) };
}

// ---------- gate (the signed-out equivalent) ----------

function showGate() {
  state = null;
  $('app').hidden = true;
  $('app').replaceChildren();
  $('gate').hidden = false;
  document.body.classList.add('is-gate');
}

async function readFile(file) {
  if (!file) return null;
  if (file.size > S.LIMITS.bytes) return { ok: false, errors: ['The file is larger than 2 MB.'] };
  try { return S.validateImport(await file.text()); } catch { return { ok: false, errors: ['The file could not be read.'] }; }
}
const importMessage = errors => `Import failed, nothing changed. ${errors.slice(0, 3).join(' ')}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}`;

/** Copies unreadable stored data aside before the gate replaces it; null (with a message) when it could not. */
function keepUnreadable() {
  const kept = S.backupUnreadable(store);
  if (kept.ok) return kept;
  fail('Earlier data on this device could not be read, and there is no room to keep a copy of it, so nothing was replaced.', $('gate-error'));
  return null;
}

function setupGate() {
  $('gate-open').addEventListener('click', () => {
    const kept = keepUnreadable();
    if (!kept) return;
    const fresh = S.emptyState();
    const result = S.writeStorage(store, fresh);
    if (!result.ok) { fail(`${result.error} Nothing can be kept on this device.`, $('gate-error')); return; }
    state = fresh;
    showApp();
    if (kept.key) say('Earlier data here could not be read. A copy is kept under Data tools.');
  });
  $('gate-file').addEventListener('change', async event => {
    const input = event.target;
    const result = await readFile(input.files[0]);
    input.value = '';
    if (!result) return;
    if (!result.ok) { fail(importMessage(result.errors), $('gate-error')); return; }
    const kept = keepUnreadable();
    if (!kept) return;
    const write = S.writeStorage(store, result.state);
    if (!write.ok) { fail(`${write.error} Nothing was imported.`, $('gate-error')); return; }
    state = result.state;
    showApp();
    say(kept.key ? 'Imported. Earlier unreadable data is kept under Data tools.' : 'Imported.');
  });
}

// ---------- app shell (built once per open) ----------

function showApp() {
  $('gate').hidden = true;
  $('gate-error').textContent = '';
  document.body.classList.remove('is-gate');
  const saved = S.readUi(store);
  ui.filter = typeof saved.filter === 'string' ? saved.filter : 'all';
  ui.dismissed = saved.dismissed && typeof saved.dismissed === 'object' ? saved.dismissed : {};
  ui.open.clear(); ui.form = null; ui.addingTask = null; ui.picker = null;
  buildShell();
  render();
  $('app').hidden = false;
}

function buildShell() {
  const app = $('app');
  els.line = h('p', { class: 'eyebrow mono', id: 'hq-line' });
  els.idle = h('span', { class: 'save-idle' }, 'Saved on this device');
  els.status = h('span', { class: 'save-live', role: 'status', 'aria-live': 'polite' });
  els.error = h('p', { class: 'save-error', role: 'alert' });
  els.today = h('div', { class: 'panel panel-today' });
  els.month = h('div', { class: 'panel panel-month' });
  els.tlControls = h('div', { class: 'tl-controls' });
  els.tlForm = h('div', { class: 'tl-form-slot' });
  els.tlList = h('ol', { class: 'tl-list', 'aria-labelledby': 'timeline-title' });
  els.dumpList = h('ul', { class: 'dump-list', 'aria-label': 'Thoughts' });
  els.wait = h('div', { class: 'wait-cols' });
  els.cats = h('div', { class: 'cats' });
  els.toolsError = h('p', { class: 'tools-error', role: 'alert' });
  els.backups = h('div', { class: 'backups' });

  const dumpInput = h('input', { id: 'dump', type: 'text', class: 'field', placeholder: 'Type, then Enter', maxlength: S.LIMITS.long, autocomplete: 'off', key: 'dump' });
  const addThought = () => {
    const text = dumpInput.value.trim();
    if (!text) { dumpInput.focus(); return; }
    if (commit(s => S.addThought(s, text, new Date().toISOString()), { message: 'Thought added.' })) dumpInput.value = '';
  };
  dumpInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addThought(); } });

  const ideaInput = h('input', { id: 'idea', type: 'text', class: 'field', placeholder: 'Name it in a few words, then Enter', maxlength: S.LIMITS.short, autocomplete: 'off', key: 'idea' });
  const addIdea = () => {
    const title = ideaInput.value.trim();
    if (!title) { ideaInput.focus(); return; }
    if (commit(s => S.addIdea(s, title), { message: 'Idea added to Later.' })) ideaInput.value = '';
  };
  ideaInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addIdea(); } });

  const importInput = h('input', { class: 'visually-hidden', id: 'tools-file', type: 'file', accept: 'application/json,.json' });
  importInput.addEventListener('change', onImport);

  app.replaceChildren(
    h('a', { class: 'skip-link', href: '#hq-main' }, 'Skip to content'),
    h('div', { class: 'shell' },
      h('header', { class: 'hq-header' },
        h('a', { class: 'wordmark', href: '/', 'aria-label': 'Richard Zhu — Home' }, 'Richard Zhu'),
        h('span', { class: 'lock-badge mono' }, icon('lock'), 'Private · not in nav')),
      h('main', { id: 'hq-main', tabindex: '-1' },
        h('section', { class: 'title-block' }, els.line, h('h1', {}, 'Command ', h('em', {}, 'center')), h('div', { class: 'save-row' }, h('p', { class: 'save-status mono' }, els.idle, els.status), els.error)),
        h('section', { class: 'priorities', 'aria-label': 'Priorities' }, els.today, els.month),
        h('div', { class: 'work' },
          h('section', { class: 'timeline', 'aria-labelledby': 'timeline-title' },
            h('div', { class: 'tl-heading' },
              h('div', { class: 'tl-heading-left' }, h('h2', { id: 'timeline-title', class: 'h-section' }, 'Timeline'), els.tlControls),
              els.chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' })),
            els.tlForm, els.tlList),
          h('aside', { class: 'side' },
            h('section', { class: 'panel dump', 'aria-labelledby': 'dump-title' },
              h('h2', { id: 'dump-title', class: 'h-panel' }, 'Brain ', h('em', {}, 'dump')),
              h('p', { class: 'sub' }, 'Unsorted thoughts. Turn them into timeline tasks later.'),
              h('label', { class: 'field-label mono', for: 'dump' }, 'New thought'),
              h('div', { class: 'input-row' }, dumpInput, h('button', { type: 'button', class: 'btn-primary', onclick: addThought }, 'Add')),
              els.dumpList))),
        h('section', { class: 'waitlist', 'aria-labelledby': 'wait-title' },
          h('div', { class: 'wait-heading' },
            h('h2', { id: 'wait-title', class: 'h-section' }, 'Wait', h('em', {}, 'list')),
            h('p', { class: 'eyebrow mono' }, 'Things to build next — or later')),
          h('div', { class: 'wait-add' },
            h('label', { class: 'field-label mono', for: 'idea' }, 'New idea'),
            h('div', { class: 'input-row' }, ideaInput, h('button', { type: 'button', class: 'btn-primary', onclick: addIdea }, 'Add to later'))),
          els.wait),
        h('footer', { class: 'tools', 'aria-label': 'Data tools' },
          h('div', { class: 'tools-row' },
            h('button', { type: 'button', class: 'tool', key: 'tools-export', onclick: onExport }, 'Export JSON'),
            h('label', { class: 'tool', for: 'tools-file' }, 'Import JSON'), importInput,
            h('button', { type: 'button', class: 'tool tool-danger', onclick: onClear }, 'Clear this device')),
          els.toolsError,
          els.backups,
          h('details', { class: 'cat-details' }, h('summary', { class: 'tool' }, 'Categories'), els.cats),
          h('p', { class: 'tools-note' }, 'Everything here is stored only in this browser. Export JSON to back it up or move it.')))));
}

// ---------- render ----------

function render() {
  if (!state) return;
  const active = document.activeElement;
  const focusKey = ui.focusKey || active?.dataset?.key || null;
  const selection = active && active.dataset?.key && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  ui.focusKey = null;
  ui.clock = clock();

  els.line.textContent = H.headerLine(ui.clock.today, H.openTaskCount(state.tasks));
  renderPriorities('today', els.today);
  renderPriorities('month', els.month);
  renderTimeline();
  renderDump();
  renderWaitlist();
  renderCategories();
  renderBackups();

  if (focusKey) {
    const target = document.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
    if (target && target !== document.activeElement) {
      target.focus({ preventScroll: true });
      if (selection && typeof target.setSelectionRange === 'function' && target.type === 'text') { try { target.setSelectionRange(...selection); } catch { /* not a text field */ } }
    }
  }
}

function saveUi() { S.writeUi(store, { filter: ui.filter, dismissed: ui.dismissed }); }

// Priorities

function renderPriorities(scope, panel) {
  const period = scope === 'today' ? ui.clock.day : ui.clock.month;
  const slots = H.periodSlots(state.priorities, scope, period);
  const done = slots.filter(p => p?.done).length;
  const total = H.CONFIG.slots[scope];
  const heading = scope === 'today'
    ? h('h2', { class: 'h-panel', id: 'today-title' }, 'Today ', h('em', {}, `top ${total}`))
    : h('h2', { class: 'h-panel', id: 'month-title' }, H.monthName(period), ' ', h('em', {}, `top ${total}`));
  const meta = scope === 'today' ? `${H.formatShort(period)} · ${done}/${total} done` : `${done}/${total} done`;

  const rows = slots.map((p, i) => {
    const slot = i + 1;
    const id = `pri-${scope}-${slot}`;
    const isDone = !!p?.done;
    const input = h('input', { id, type: 'text', class: 'pri-input', value: p?.text || '', placeholder: 'Add a priority', maxlength: S.LIMITS.long, autocomplete: 'off', key: id });
    const save = () => {
      const text = input.value.trim();
      const current = H.periodSlots(state.priorities, scope, period)[i];
      if (text === (current?.text || '')) return;
      commit(s => S.setPriority(s, { scope, period, slot, text }), { message: 'Priority saved.', render: false });
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      const next = $(`pri-${scope}-${slot + 1}`);
      if (next) next.focus(); else input.blur();
    });
    const toggle = () => {
      const current = H.periodSlots(state.priorities, scope, period)[i];
      const text = input.value.trim();
      if (!text && !current?.done) { say('Type a priority first.'); input.focus(); return; }
      commit(s => S.setPriority(s, { scope, period, slot, text, done: !current?.done }), { message: current?.done ? 'Priority reopened.' : 'Priority done.' });
    };
    return h('li', { class: `pri-row${isDone ? ' is-done' : ''}` },
      h('label', { class: 'pri-num', for: id }, String(slot).padStart(2, '0')),
      h('button', { type: 'button', class: 'check', 'aria-pressed': String(isDone), 'aria-label': `Mark done: ${scope} priority ${slot}`, key: `${id}-check`, onclick: toggle }, tbox(isDone)),
      input);
  });

  const children = [h('div', { class: 'panel-head' }, heading, h('span', { class: 'panel-meta mono' }, meta)), h('ol', { class: 'pri-list', 'aria-labelledby': `${scope}-title` }, rows)];
  const carry = H.carryOverCandidates(state.priorities, scope, period);
  const free = slots.filter(p => !p || (!p.text && !p.done)).length;
  if (carry && free > 0 && ui.dismissed[scope] !== period) {
    const n = Math.min(carry.texts.length, free);
    children.push(h('div', { class: 'carry' },
      h('p', { class: 'carry-text' }, `${carry.texts.length} unfinished from ${H.carryOverLabel(scope, carry.from, period)}: `, h('span', { class: 'carry-items' }, carry.texts.join(' · '))),
      h('div', { class: 'carry-actions' },
        h('button', { type: 'button', class: 'btn-chip', key: `carry-${scope}`, onclick: () => { ui.focusKey = `pri-${scope}-1`; commit(s => S.carryOver(s, scope, period, carry.texts), { message: `Carried over ${n}.` }); } }, n < carry.texts.length ? `Carry over ${n}` : 'Carry over'),
        h('button', { type: 'button', class: 'btn-text', onclick: () => { ui.dismissed[scope] = period; saveUi(); ui.focusKey = `pri-${scope}-1`; render(); } }, 'Dismiss'))));
  }
  panel.replaceChildren(...children);
}

// Timeline

function categoryName(id) { return state.categories.find(c => c.id === id)?.name || '—'; }

function visibleDeadlines() {
  const all = H.sortDeadlines(state.deadlines);
  return ui.filter === 'all' ? all : all.filter(d => d.category === ui.filter);
}

function renderTimeline() {
  const cats = S.sortedCategories(state.categories);
  if (ui.filter !== 'all' && !cats.some(c => c.id === ui.filter)) ui.filter = 'all';
  const visible = visibleDeadlines();
  const allOpen = visible.length > 0 && visible.every(d => ui.open.has(d.id));
  els.tlControls.replaceChildren(
    h('button', { type: 'button', class: 'btn-text mono', key: 'toggle-all', disabled: visible.length ? null : true, onclick: () => {
      for (const d of visible) { if (allOpen) ui.open.delete(d.id); else ui.open.add(d.id); }
      render();
    } }, allOpen ? 'Collapse all' : 'Expand all'),
    h('button', { type: 'button', class: 'btn-text mono', key: 'add-deadline', 'aria-expanded': String(ui.form?.mode === 'add'), onclick: () => openForm({ mode: 'add' }) }, '+ Add deadline'));

  els.chips.replaceChildren(...[{ id: 'all', name: 'All' }, ...cats].map(c => h('button', {
    type: 'button', class: 'chip-btn mono', 'aria-pressed': String(ui.filter === c.id), key: `chip-${c.id}`,
    onclick: () => { ui.filter = c.id; saveUi(); render(); },
  }, c.name)));

  els.tlForm.replaceChildren(ui.form?.mode === 'add' ? deadlineForm() : '');

  if (!visible.length) {
    els.tlList.replaceChildren(h('li', { class: 'empty' }, state.deadlines.length ? `Nothing in ${categoryName(ui.filter)} yet.` : 'No deadlines yet. Add the first one with “+ Add deadline”.'));
    return;
  }
  els.tlList.replaceChildren(...visible.map(timelineRow));
}

function timelineRow(d) {
  const tasks = H.tasksFor(state.tasks, d.id);
  const sum = H.deadlineSummary(d, tasks, ui.clock.today);
  const open = ui.open.has(d.id);
  const panelId = `panel-${d.id}`;
  const celebrate = ui.celebrate === d.id && !reduceMotion();
  const head = h('button', {
    type: 'button', class: 'tl-head', 'aria-expanded': String(open), 'aria-controls': panelId, key: `dl-${d.id}`,
    onclick: () => { if (open) ui.open.delete(d.id); else ui.open.add(d.id); render(); },
  },
  // The spaces keep the button's accessible name readable ("College A, Early decision, College, status: 1/4, due November 1, 8 days, urgent"); flex layout ignores them.
  h('span', { class: 'tl-main' }, h('span', { class: 'tl-title' }, d.title), d.kind ? [h('span', { class: 'visually-hidden' }, ', '), h('span', { class: 'tl-kind' }, d.kind)] : null),
  ' ',
  h('span', { class: 'tl-meta' },
    h('span', { class: 'cat-chip mono' }, h('span', { class: 'visually-hidden' }, ', '), categoryName(d.category)),
    ' ',
    h('span', { class: `tl-status mono tone-${sum.statusTone}` }, h('span', { class: 'visually-hidden' }, ', status: '), sum.status),
    icon('chevron')),
  // The date column sits outside the button, so its words are repeated here for the accessible name.
  h('span', { class: 'visually-hidden' }, `, ${H.spokenDue(d, ui.clock.today, sum.allDone)}`));

  const panel = h('div', { id: panelId, class: 'tl-panel', hidden: open ? null : true }, open ? deadlinePanel(d, tasks, sum) : null);

  return h('li', { class: `tl-row${sum.faded ? ' is-faded' : ''}${celebrate ? ' celebrate' : ''}`, 'data-id': d.id },
    h('div', { class: 'tl-date' },
      h('span', { class: 'tl-label mono' }, H.dateColumnLabel(d)),
      h('span', { class: `tl-count mono tone-${sum.countTone}` }, sum.countdown)),
    h('div', { class: 'tl-rail', 'aria-hidden': 'true' },
      h('span', { class: `tl-dot dot-${sum.dot}` }, sum.dot === 'urgent' ? h('span', { class: 'pulse' }) : null, celebrate ? h('span', { class: 'burst' }, icon('check')) : null)),
    h('div', { class: 'tl-card-wrap' },
      h('div', { class: `tl-card${open ? ' is-open' : ''}${sum.past ? ' is-past' : ''}` }, h('h3', { class: 'tl-h3' }, head), panel)));
}

function deadlinePanel(d, tasks, sum) {
  const editing = ui.form?.mode === 'edit' && ui.form.id === d.id;
  const bar = h('div', { class: 'bar-fill' });
  bar.style.width = `${sum.pct}%`;
  const list = h('ul', { class: 'task-list', 'aria-label': `Tasks for ${d.title}` }, tasks.map(t => h('li', { class: `task-row${t.done ? ' is-done' : ''}` },
    h('button', { type: 'button', class: 'task', 'aria-pressed': String(t.done), key: `task-${t.id}`, onclick: () => toggleTask(d, t) }, tbox(t.done), h('span', { class: 'task-text' }, t.text)),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove task: ${t.text}`, key: `task-rm-${t.id}`, onclick: () => {
      ui.focusKey = `dl-${d.id}`;
      commit(s => S.removeTask(s, t.id), { message: 'Task removed.' });
    } }, icon('close')))));

  let addRow;
  if (ui.addingTask === d.id) {
    const input = h('input', { type: 'text', class: 'field', id: `add-task-${d.id}`, value: ui.taskDraft, placeholder: 'New task', maxlength: S.LIMITS.long, autocomplete: 'off', key: `add-task-${d.id}` });
    input.addEventListener('input', () => { ui.taskDraft = input.value; });
    const add = () => {
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      ui.taskDraft = ''; ui.focusKey = `add-task-${d.id}`;
      commit(s => S.addTask(s, d.id, text), { message: 'Task added.' });
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); }
      if (e.key === 'Escape') { ui.addingTask = null; ui.focusKey = `add-task-btn-${d.id}`; render(); }
    });
    addRow = h('div', { class: 'add-task' },
      h('label', { class: 'visually-hidden', for: `add-task-${d.id}` }, `New task for ${d.title}`),
      h('div', { class: 'input-row' }, input,
        h('button', { type: 'button', class: 'btn-primary', onclick: add }, 'Add'),
        h('button', { type: 'button', class: 'btn-ghost', onclick: () => { ui.addingTask = null; ui.taskDraft = ''; ui.focusKey = `add-task-btn-${d.id}`; render(); } }, 'Done')));
  }

  const actions = h('div', { class: 'card-actions' },
    ui.addingTask === d.id ? null : h('button', { type: 'button', class: 'btn-text mono', key: `add-task-btn-${d.id}`, onclick: () => { ui.addingTask = d.id; ui.taskDraft = ''; ui.focusKey = `add-task-${d.id}`; render(); } }, '+ Add task'),
    h('button', { type: 'button', class: 'btn-text mono', key: `edit-${d.id}`, 'aria-expanded': String(editing), onclick: () => openForm({ mode: 'edit', id: d.id }) }, 'Rename / edit'),
    h('button', { type: 'button', class: 'btn-text mono tone-amber', key: `del-${d.id}`, onclick: () => deleteDeadline(d) }, 'Delete'));

  return [
    h('div', { class: 'progress' },
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(sum.pct), 'aria-label': `${d.title} progress` }, bar),
      h('span', { class: 'mono pct' }, `${sum.pct}%`)),
    tasks.length ? list : h('p', { class: 'empty' }, 'No tasks yet.'),
    addRow || null,
    editing ? deadlineForm() : actions,
  ];
}

function toggleTask(d, t) {
  const before = H.deadlineSummary(d, H.tasksFor(state.tasks, d.id), ui.clock.today);
  const ok = commit(s => S.toggleTask(s, t.id), { message: t.done ? 'Task reopened.' : 'Task done.', render: false });
  if (!ok) return;
  const after = H.deadlineSummary(d, H.tasksFor(state.tasks, d.id), ui.clock.today);
  if (!before.allDone && after.allDone) {
    ui.celebrate = d.id;
    say(`All tasks done: ${d.title}.`);
    setTimeout(() => {
      if (ui.celebrate !== d.id) return;
      ui.celebrate = null;
      document.querySelector(`.tl-row[data-id="${CSS.escape(d.id)}"]`)?.classList.remove('celebrate');
    }, 1200);
  }
  render();
}

async function deleteDeadline(d) {
  const n = H.tasksFor(state.tasks, d.id).length;
  const yes = await confirmDialog({ title: 'Delete this deadline?', body: `“${d.title}” and its ${n} ${n === 1 ? 'task' : 'tasks'} will be removed from this device.`, ok: 'Delete' });
  if (!yes) return;
  ui.open.delete(d.id);
  if (ui.form?.id === d.id) ui.form = null;
  ui.focusKey = 'add-deadline';
  commit(s => S.removeDeadline(s, d.id), { message: 'Deadline deleted.' });
}

// The add / edit deadline form

function openForm(form) {
  if (ui.form && ui.form.mode === form.mode && ui.form.id === form.id) { closeForm(); return; }
  const src = form.mode === 'edit' ? state.deadlines.find(d => d.id === form.id) : null;
  const firstCat = S.sortedCategories(state.categories)[0]?.id || '';
  ui.form = form;
  ui.formErrors = [];
  ui.formDraft = src
    ? { title: src.title, kind: src.kind, category: src.category, date: src.date || '', noDate: !src.date, approx: src.approx, dateLabel: src.dateLabel || '' }
    : { title: '', kind: '', category: ui.filter !== 'all' ? ui.filter : firstCat, date: '', noDate: false, approx: false, dateLabel: '' };
  ui.focusKey = 'f-title';
  render();
}
function closeForm() {
  const back = ui.form?.mode === 'edit' ? `edit-${ui.form.id}` : 'add-deadline';
  ui.form = null; ui.formDraft = null; ui.formErrors = [];
  ui.focusKey = back;
  render();
}

function deadlineForm() {
  const f = ui.formDraft;
  const editing = ui.form.mode === 'edit';
  const field = (id, label, input, hint) => h('div', { class: 'form-field' }, h('label', { class: 'field-label mono', for: id }, label), input, hint ? h('p', { class: 'hint', id: `${id}-hint` }, hint) : null);
  const bind = (el, name, prop = 'value') => { el.addEventListener(prop === 'checked' ? 'change' : 'input', () => { f[name] = el[prop]; }); return el; };

  const title = bind(h('input', { id: 'f-title', type: 'text', class: 'field', value: f.title, required: true, maxlength: S.LIMITS.short, autocomplete: 'off', key: 'f-title' }), 'title');
  const kind = bind(h('input', { id: 'f-kind', type: 'text', class: 'field', value: f.kind, maxlength: S.LIMITS.short, placeholder: 'e.g. Early decision · essay', autocomplete: 'off', key: 'f-kind' }), 'kind');
  const category = bind(h('select', { id: 'f-category', class: 'field', key: 'f-category' }, S.sortedCategories(state.categories).map(c => h('option', { value: c.id, selected: c.id === f.category ? true : null }, c.name))), 'category');
  const date = bind(h('input', { id: 'f-date', type: 'date', class: 'field', value: f.date, disabled: f.noDate ? true : null, key: 'f-date' }), 'date');
  const noDate = h('input', { id: 'f-nodate', type: 'checkbox', checked: f.noDate, key: 'f-nodate' });
  noDate.addEventListener('change', () => { f.noDate = noDate.checked; date.disabled = noDate.checked; });
  const approx = bind(h('input', { id: 'f-approx', type: 'checkbox', checked: f.approx, key: 'f-approx' }), 'approx', 'checked');
  const label = bind(h('input', { id: 'f-label', type: 'text', class: 'field', value: f.dateLabel, maxlength: S.LIMITS.label, placeholder: 'EARLY NOV', autocomplete: 'off', 'aria-describedby': 'f-label-hint', key: 'f-label' }), 'dateLabel');

  const form = h('form', { class: 'dl-form', novalidate: true, 'aria-label': editing ? 'Edit deadline' : 'Add deadline' },
    h('div', { class: 'form-grid' },
      field('f-title', 'Title', title),
      field('f-kind', 'Kind', kind),
      field('f-category', 'Category', category),
      field('f-date', 'Date', date),
      h('div', { class: 'form-checks' },
        h('label', { class: 'check-label', for: 'f-nodate' }, noDate, 'No date'),
        h('label', { class: 'check-label', for: 'f-approx' }, approx, 'Approximate')),
      field('f-label', 'Date label', label, 'Optional. Shown instead of the date, e.g. EARLY NOV or ROLLING.')),
    h('p', { class: 'form-errors', role: 'alert' }, ui.formErrors.join(' ')),
    h('div', { class: 'form-actions' },
      h('button', { type: 'submit', class: 'btn-primary' }, editing ? 'Save changes' : 'Add deadline'),
      h('button', { type: 'button', class: 'btn-ghost', onclick: closeForm }, 'Cancel')));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fields = { title: f.title.trim(), kind: f.kind.trim(), category: f.category, date: f.noDate ? null : (f.date || ''), approx: f.approx, dateLabel: f.dateLabel.trim() };
    const errors = S.deadlineErrors(fields, state.categories);
    if (errors.length) { ui.formErrors = errors; ui.focusKey = errors[0].startsWith('Give') ? 'f-title' : errors[0].startsWith('Pick a date') ? 'f-date' : 'f-category'; render(); return; }
    if (editing) {
      const id = ui.form.id;
      ui.form = null; ui.formDraft = null; ui.focusKey = `dl-${id}`;
      commit(s => S.updateDeadline(s, id, fields), { message: 'Deadline saved.' });
    } else {
      let newId;
      ui.form = null; ui.formDraft = null;
      const ok = commit(s => { const next = S.addDeadline(s, fields); newId = next.deadlines.at(-1).id; return next; }, { message: 'Deadline added.', render: false });
      if (ok) { ui.open.add(newId); ui.filter = ui.filter === 'all' || ui.filter === fields.category ? ui.filter : 'all'; ui.focusKey = `dl-${newId}`; }
      render();
    }
  });
  form.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeForm(); } });
  return form;
}

// Brain dump

function renderDump() {
  const thoughts = S.thoughtsNewestFirst(state.thoughts);
  if (!thoughts.length) { els.dumpList.replaceChildren(h('li', { class: 'empty' }, 'No thoughts yet.')); return; }
  const deadlines = H.sortDeadlines(state.deadlines);
  els.dumpList.replaceChildren(...thoughts.map(t => {
    const picking = ui.picker === t.id;
    let picker = null;
    if (picking) {
      const selectId = `pick-${t.id}`;
      const select = h('select', { id: selectId, class: 'field', key: selectId }, deadlines.map(d => h('option', { value: d.id, selected: d.id === ui.pickerChoice ? true : null }, `${H.dateColumnLabel(d)} · ${d.title}`)));
      select.addEventListener('change', () => { ui.pickerChoice = select.value; });
      picker = h('div', { class: 'picker' },
        h('label', { class: 'field-label mono', for: selectId }, 'Add to deadline'),
        h('div', { class: 'input-row' }, select,
          h('button', { type: 'button', class: 'btn-primary', onclick: () => {
            const target = select.value; const name = state.deadlines.find(d => d.id === target)?.title || '';
            ui.picker = null; ui.focusKey = 'dump';
            commit(s => S.thoughtToTask(s, t.id, target), { message: `Added to ${name}.` });
          } }, 'Add'),
          h('button', { type: 'button', class: 'btn-ghost', onclick: () => { ui.picker = null; ui.focusKey = `to-task-${t.id}`; render(); } }, 'Cancel')));
    }
    return h('li', { class: 'thought' },
      h('div', { class: 'thought-main' },
        h('p', { class: 'thought-text' }, t.text),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove thought', key: `rm-${t.id}`, onclick: () => { ui.focusKey = 'dump'; commit(s => S.removeThought(s, t.id), { message: 'Thought removed.' }); } }, icon('close'))),
      h('div', { class: 'thought-actions' },
        h('button', { type: 'button', class: 'btn-chip mono', key: `to-task-${t.id}`, 'aria-expanded': String(picking), 'aria-label': `Turn into a timeline task: ${t.text}`, onclick: () => {
          if (!deadlines.length) { say('Add a deadline first.'); return; }
          ui.picker = picking ? null : t.id; ui.pickerChoice = deadlines.find(d => !H.deadlineSummary(d, H.tasksFor(state.tasks, d.id), ui.clock.today).past)?.id || deadlines[0].id;
          ui.focusKey = picking ? `to-task-${t.id}` : `pick-${t.id}`; render();
        } }, '→ task'),
        h('button', { type: 'button', class: 'btn-chip mono', key: `to-wait-${t.id}`, 'aria-label': `Move to the waitlist: ${t.text}`, onclick: () => { ui.focusKey = 'dump'; commit(s => S.thoughtToIdea(s, t.id), { message: 'Moved to the waitlist (Later).' }); } }, '→ waitlist')),
      picker);
  }));
}

// Waitlist

function renderWaitlist() {
  const column = (bucket, title) => {
    const ideas = S.ideasIn(state.ideas, bucket);
    return h('div', { class: `wait-col wait-${bucket}` },
      h('div', { class: 'wait-col-head' }, h('h3', {}, title), h('span', { class: 'mono count' }, String(ideas.length), h('span', { class: 'visually-hidden' }, ideas.length === 1 ? ' idea' : ' ideas'))),
      h('ul', { class: 'idea-list', 'aria-label': title }, ideas.length ? ideas.map(x => h('li', { class: 'idea' },
        h('div', { class: 'idea-main' }, h('p', { class: 'idea-title' }, x.title), x.note ? h('p', { class: 'idea-note' }, x.note) : null),
        h('button', { type: 'button', class: 'btn-pill mono', key: `mv-${x.id}`, 'aria-label': `${bucket === 'next' ? 'Move to later' : 'Move to next up'}: ${x.title}`, onclick: () => { ui.focusKey = `mv-${x.id}`; commit(s => S.moveIdea(s, x.id), { message: bucket === 'next' ? 'Moved to Later.' : 'Moved to Next up.' }); } }, bucket === 'next' ? '← Later' : 'Next →'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove idea: ${x.title}`, key: `rmi-${x.id}`, onclick: () => { ui.focusKey = 'idea'; commit(s => S.removeIdea(s, x.id), { message: 'Idea removed.' }); } }, icon('close'))))
        : h('li', { class: 'empty' }, bucket === 'next' ? 'Move an idea here when it is next.' : 'New ideas land here.')));
  };
  els.wait.replaceChildren(column('next', 'Next up'), column('later', 'Later'));
}

// Footer tools

function renderCategories() {
  const cats = S.sortedCategories(state.categories);
  const used = new Set(state.deadlines.map(d => d.category));
  const addInput = h('input', { id: 'cat-new', type: 'text', class: 'field', placeholder: 'New category', maxlength: 40, autocomplete: 'off', key: 'cat-new' });
  const add = () => {
    const name = addInput.value.trim();
    if (!name) return;
    ui.focusKey = 'cat-new';
    if (!commit(s => S.addCategory(s, name), { message: `Category “${name}” added.` })) say('That category already exists.');
  };
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } });
  els.cats.replaceChildren(
    h('ul', { class: 'cat-list' }, cats.map(c => {
      const input = h('input', { id: `cat-${c.id}`, type: 'text', class: 'field', value: c.name, maxlength: 40, autocomplete: 'off', key: `cat-${c.id}` });
      input.addEventListener('change', () => {
        const name = input.value.trim();
        if (!commit(s => S.renameCategory(s, c.id, name), { message: 'Category renamed.' })) { input.value = c.name; say('That name is empty or already used.'); }
      });
      return h('li', { class: 'cat-row' },
        h('label', { class: 'visually-hidden', for: `cat-${c.id}` }, `Rename category ${c.name}`), input,
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove category: ${c.name}`, disabled: used.has(c.id) ? true : null, title: used.has(c.id) ? 'In use by a deadline' : null, key: `cat-rm-${c.id}`, onclick: () => { ui.focusKey = 'cat-new'; commit(s => S.removeCategory(s, c.id), { message: 'Category removed.' }); } }, icon('close')));
    })),
    h('div', { class: 'input-row' }, h('label', { class: 'visually-hidden', for: 'cat-new' }, 'New category'), addInput, h('button', { type: 'button', class: 'btn-ghost', onclick: add }, 'Add')));
}

function renderBackups() {
  const backups = S.listBackups(store);
  els.backups.replaceChildren(...backups.map(b => {
    const when = b.savedAt && !Number.isNaN(Date.parse(b.savedAt)) ? H.formatShort(H.dateKey(Date.parse(b.savedAt))) : 'an earlier visit';
    return h('div', { class: 'backup-row' },
      h('p', { class: 'backup-text' }, `Unreadable data kept from ${when}. It is not loaded; download it to look at it or fix it by hand.`),
      h('div', { class: 'tools-row' },
        h('button', { type: 'button', class: 'tool', key: `bk-dl-${b.key}`, onclick: () => downloadBackup(b) }, 'Download unreadable backup'),
        h('button', { type: 'button', class: 'tool tool-danger', key: `bk-rm-${b.key}`, onclick: () => discardBackup(b) }, 'Discard')));
  }));
}

function download(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBackup(b) {
  const raw = S.readBackup(store, b.key);
  if (raw === null) { fail('That backup could not be read.', els.toolsError); return; }
  try {
    const day = b.savedAt && !Number.isNaN(Date.parse(b.savedAt)) ? H.dateKey(Date.parse(b.savedAt)) : 'earlier';
    download(raw.endsWith('\n') ? raw : `${raw}\n`, `hq-unreadable-${day}.json`);
    say('Backup downloaded.');
  } catch { fail('The download could not be created.', els.toolsError); }
}

async function discardBackup(b) {
  const yes = await confirmDialog({ title: 'Discard this backup?', body: 'The unreadable copy will be removed from this browser. Download it first if you might need it.', ok: 'Discard' });
  if (!yes) return;
  if (!S.removeBackup(store, b.key)) { fail('This browser would not remove the backup.', els.toolsError); return; }
  ui.focusKey = 'tools-export';
  render();
  say('Backup discarded.');
}

function onExport() {
  try {
    download(`${JSON.stringify(S.toExport(state), null, 2)}\n`, `hq-export-${ui.clock.today}.json`);
    say('Export downloaded.');
  } catch { fail('The export could not be created.', els.toolsError); }
}

async function onImport(event) {
  const input = event.target;
  const result = await readFile(input.files[0]);
  input.value = '';
  if (!result) return;
  els.toolsError.textContent = '';
  if (!result.ok) { fail(importMessage(result.errors), els.toolsError); return; }
  const yes = await confirmDialog({ title: 'Replace everything?', body: 'Everything on this device will be replaced by the imported file. Export first if you want a copy.', ok: 'Replace' });
  if (!yes) return;
  ui.open.clear(); ui.form = null; ui.picker = null; ui.addingTask = null; ui.filter = 'all';
  if (commit(() => result.state, { message: 'Imported.' })) saveUi();
}

async function onClear() {
  const yes = await confirmDialog({ title: 'Clear this device?', body: 'Everything HQ keeps in this browser will be removed. This cannot be undone here; export first if you want a copy.', ok: 'Clear' });
  if (!yes) return;
  if (!S.clearStorage(store)) { fail('This browser would not clear the data.', els.toolsError); return; }
  showGate();
  $('gate-open').focus();
}

// ---------- boot ----------

function setupDialog() {
  const dialog = $('confirm');
  $('confirm-ok').addEventListener('click', () => dialog.close('ok'));
  $('confirm-cancel').addEventListener('click', () => dialog.close('cancel'));
}

function tick() {
  if (!state) return;
  const next = clock();
  if (next.today === ui.clock?.today && next.day === ui.clock?.day) return;
  if (document.activeElement?.classList?.contains('pri-input')) return; // re-render after the edit is saved
  render();
}

function boot() {
  setupGate();
  setupDialog();
  const result = S.readStorage(store);
  if (result.status === 'ok') { state = result.state; showApp(); }
  else {
    showGate();
    if (result.status === 'unavailable') fail('This browser is blocking storage here, so nothing can be kept.', $('gate-error'));
  }
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('storage', event => {
    if (event.key !== S.STORAGE_KEY) return;
    const fresh = S.readStorage(store);
    if (fresh.status === 'ok') { state = fresh.state; if ($('app').hidden) showApp(); else render(); }
    else if (fresh.status === 'empty') showGate();
  });
}

boot();
