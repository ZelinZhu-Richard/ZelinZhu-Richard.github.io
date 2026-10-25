// Shared page controller: backend + view models + event delegation + re-render.
// Pages supply sections (pure renderers) and action handlers; animations run from events.
import { createBackend, snapshotViews, startOwnerGame, defaultTasks, SAVE_KEY } from './backend.js';
import { loadArt, petsStylesheet, placeholderArt } from './art.js';
import { DEFAULT_TASKS, TIER_KEYS, readTaskForm } from './tasks.js';
import { renderModeBar } from './render-common.js';
import { renderListEditor, renderEditorRow } from './render-settings.js';
import { reduced } from './motion.js';
import { dayKey } from './time.js';
import { normalizeEvents, normalizeViews } from './normalize.js';

const VISITOR_FLAG = 'daily:asVisitor';

export function createController({ sections, actions = {}, forms = {}, onEvents = () => {}, onLoad = () => {} }) {
  const c = {
    backend: null, vm: null, art: placeholderArt, ui: {}, defaults: DEFAULT_TASKS, last: new Map(), busy: false,
    get owner() { return this.backend?.mode === 'owner' && !this.asVisitor; },
    asVisitor: false,
  };

  const $ = sel => document.querySelector(sel);
  const live = () => $('#live');

  c.announce = text => {
    const el = live();
    if (!el || !text) return;
    el.textContent = '';
    setTimeout(() => { el.textContent = text; }, 30);
  };

  c.error = message => {
    const el = $('#error');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
    if (message) setTimeout(() => { if (el.textContent === message) { el.textContent = ''; el.hidden = true; } }, 8000);
  };

  c.ctx = () => {
    const vm = c.vm || {};
    const active = vm.pets?.active || [];
    const companionId = vm.settings?.companionId ?? vm.settings?.companion;
    const focusPet = active.find(p => p.id === companionId && p.mood !== 'dead') || active.find(p => p.mood !== 'dead') || null;
    return { owner: c.owner, cloud: Boolean(c.backend?.config), fixture: Boolean(c.backend?.fixture), canReturn: c.backend?.mode === 'owner' && c.asVisitor, art: c.art, now: c.backend?.now() ?? Date.now(), ui: c.ui, ladder: vm.ladder, focusPet, reduced: reduced(), defaults: c.defaults, window: vm.header?.window };
  };

  c.views = () => {
    if (!c.backend) return null;
    if (c.asVisitor && c.backend.mode === 'owner') {
      try { return normalizeViews(snapshotViews(JSON.parse(c.backend.exportSnapshot()))); } catch { return normalizeViews(c.backend.views()); }
    }
    return normalizeViews(c.backend.views());
  };

  function focusSelector(el) {
    const target = el?.closest?.('[data-action],[name],[id]');
    if (!target) return null;
    if (target.id) return `#${CSS.escape(target.id)}`;
    if (target.name && !target.dataset.action) return `[name="${CSS.escape(target.name)}"]`;
    return Object.entries(target.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}="${CSS.escape(v)}"]`).join('');
  }

  c.render = () => {
    c.vm = c.views();
    if (!c.vm) return;
    const ctx = c.ctx();
    document.body.dataset.mode = ctx.owner ? 'owner' : 'visitor';
    const sel = focusSelector(document.activeElement);
    const out = { 'mode-bar': renderModeBar(c.vm, ctx), ...sections(c.vm, ctx, c) };
    for (const [id, markup] of Object.entries(out)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const text = String(markup ?? '');
      if (c.last.get(id) === text) continue;
      c.last.set(id, text);
      el.innerHTML = text;
      el.hidden = text.trim() === '';
    }
    pauseOffscreen();
    if (sel && (document.activeElement === document.body || !document.activeElement)) {
      try { document.querySelector(sel)?.focus({ preventScroll: true }); } catch { /* selector from attribute values */ }
    }
  };

  // Off-screen pets and eggs pause their idle animation (pets.css: pet--paused / egg--paused).
  let observer = null;
  function pauseOffscreen() {
    if (!('IntersectionObserver' in globalThis)) return;
    observer ??= new IntersectionObserver(entries => {
      for (const e of entries) e.target.classList.toggle(e.target.classList.contains('egg') ? 'egg--paused' : 'pet--paused', !e.isIntersecting);
    }, { rootMargin: '120px' });
    for (const svg of document.querySelectorAll('main svg.pet:not([data-observed]), main svg.egg:not([data-observed])')) {
      svg.dataset.observed = '';
      observer.observe(svg);
    }
  }

  // Runs one engine action (in the browser, or in the game-action Edge Function in Supabase mode);
  // animations come from the returned events.
  c.act = async (action, { quiet = false } = {}) => {
    if (!c.owner) return null;
    const before = c.vm;
    try {
      const events = normalizeEvents((await c.backend.act(action)).events);
      c.error('');
      c.render();
      Promise.resolve(onEvents(events || [], before, c)).catch(() => {}); // animations never block input
      return events || [];
    } catch (err) {
      if (!quiet || err?.code === 'stale') c.error(err?.code === 'save-failed' ? "That didn't save. Try again." : err?.message || 'That action failed.');
      c.render();
      return null;
    }
  };

  c.actMany = async list => {
    const all = [];
    for (const a of list) {
      const ev = await c.act(a);
      if (!ev) break;
      all.push(...ev);
    }
    return all;
  };

  // ---------- dialogs (native <dialog> + showModal) ----------
  c.confirm = ({ title, body, confirm = 'Confirm', danger = false }) => new Promise(resolve => {
    const d = $('#confirm-dialog');
    if (!d?.showModal) { resolve(globalThis.confirm?.(`${title}\n\n${body}`) ?? false); return; }
    d.querySelector('[data-slot="title"]').textContent = title;
    d.querySelector('[data-slot="body"]').textContent = body;
    const ok = d.querySelector('[data-slot="ok"]');
    ok.textContent = confirm;
    ok.classList.toggle('button--danger', danger);
    ok.classList.toggle('button--accent', !danger);
    d.querySelector('[data-slot="field"]').hidden = true;
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
    d.showModal();
  });

  c.prompt = ({ title, body = '', label, value = '', maxlength = 40, confirm = 'Save' }) => new Promise(resolve => {
    const d = $('#confirm-dialog');
    if (!d?.showModal) { resolve(globalThis.prompt?.(title, value) ?? null); return; }
    d.querySelector('[data-slot="title"]').textContent = title;
    d.querySelector('[data-slot="body"]').textContent = body;
    const field = d.querySelector('[data-slot="field"]');
    field.hidden = false;
    field.querySelector('span').textContent = label;
    const input = field.querySelector('input');
    input.value = value;
    input.maxLength = maxlength;
    const ok = d.querySelector('[data-slot="ok"]');
    ok.textContent = confirm;
    ok.classList.remove('button--danger');
    ok.classList.add('button--accent');
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'ok' ? input.value.trim() : null), { once: true });
    d.showModal();
    input.focus();
    input.select();
  });

  // ---------- shared actions ----------
  const shared = {
    'view-as-visitor': () => { c.asVisitor = true; try { sessionStorage.setItem(VISITOR_FLAG, '1'); } catch { /* blocked */ } c.render(); c.announce('Showing the public view.'); },
    'view-as-owner': () => { c.asVisitor = false; try { sessionStorage.removeItem(VISITOR_FLAG); } catch { /* blocked */ } c.render(); c.announce('Back to the owner view.'); },
    'owner-view': () => (c.backend?.config ? ownerSignIn() : openSetup()),
    'suggest-tiers': el => suggestTiers(el),
    'list-add-row': el => {
      const form = el.closest('form');
      const count = form.querySelector('[name="count"]');
      const i = Number(count.value) || 0;
      form.querySelector('.editor-rows').insertAdjacentHTML('beforeend', String(renderEditorRow({}, i)));
      count.value = String(i + 1);
      form.querySelector(`[name="task-${i}-name"]`)?.focus();
    },
    'list-remove-row': el => {
      const row = el.closest('.editor-row');
      const form = el.closest('form');
      row.querySelector('input[name$="-name"]').value = '';
      row.hidden = true;
      form.querySelector('button[type="submit"]')?.focus();
    },
    'export-save': () => download(`daily-save-${dayKey(Date.now())}.json`, c.backend.exportJson()),
    'export-snapshot': () => { download('snapshot.json', c.backend.exportSnapshot()); c.announce('Snapshot exported. Commit it as workspace/daily/public/snapshot.json.'); },
    'forget-device': async () => {
      if (c.backend?.cloud) { await c.backend.forget(); location.reload(); return; } // Supabase mode: sign out
      if (!(await c.confirm({ title: 'Remove the save from this device?', body: 'Export your save first. This cannot be undone on this device.', confirm: 'Remove the save', danger: true }))) return;
      c.backend.forget?.();
      location.reload();
    },
  };

  async function openSetup() {
    const d = $('#setup-dialog');
    if (!d?.showModal) return;
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const cloud = Boolean(c.backend?.pendingOwner);
    d.querySelector('#setup-title').textContent = cloud ? 'Start the game' : 'Start the game on this device';
    d.querySelector('[data-slot="editor"]').innerHTML = String(renderListEditor(c.defaults, cloud
      ? { form: 'setup', suggest: true, submit: 'Start the game', intro: 'Set this month’s list. It locks for the calendar month. Your game is saved in the cloud and every change runs on the server.' }
      : { form: 'setup', submit: 'Start on this device', intro: 'Set this month’s list. It locks for the calendar month. Your game is saved only in this browser.' }));
    d.querySelector('[data-slot="setup-error"]').textContent = '';
    const dev = d.querySelector('[data-slot="dev"]');
    if (dev) dev.hidden = !local;
    d.showModal();
  }

  // ---------- Supabase mode: sign-in, first run, tier suggestions ----------
  async function ownerSignIn() {
    if (c.backend?.pendingOwner) return onboardOwner();
    if (!c.backend?.client) { c.error(c.backend?.notice || 'Owner sign-in is unavailable right now.'); return; }
    try { await (await import('./cloud.js')).signIn(c.backend.client); } catch (err) { c.error(err.message); }
  }

  // Signed in as the owner with no cloud game yet: upload this device's local save, or set the first list.
  async function onboardOwner() {
    const owner = c.backend.pendingOwner;
    const cloud = await import('./cloud.js');
    const text = cloud.localSave();
    if (text && await c.confirm({ title: 'Move this device’s save to the cloud?', body: 'This browser holds your Daily save. Upload it as the cloud game; a copy stays on this device. Cancel to start a new list instead.', confirm: 'Upload the save' })) {
      try {
        await owner.importJson(text);
        cloud.retireLocalSave();
        c.backend = owner;
        c.last.clear();
        c.render();
        c.announce('Your save is in the cloud now.');
      } catch (err) { c.error(err.message || 'The upload failed. Nothing changed.'); }
      return;
    }
    openSetup();
  }

  async function suggestTiers(el) {
    const backend = c.backend?.pendingOwner || c.backend;
    if (typeof backend?.suggestTiers !== 'function') return;
    const row = el.closest('.editor-row');
    const field = name => row.querySelector(`[name$="-${name}"]`);
    const task = {
      name: field('name').value.trim(), type: field('type').value, unit: field('unit').value.trim() || undefined,
      chill: Number(field('chill').value) || undefined, chillText: field('tier-0').value.trim() || undefined,
      purpose: field('purpose')?.value || undefined, physical: field('physical').checked,
    };
    if (!task.name) { c.error('Name the task first.'); return; }
    const label = el.textContent;
    el.disabled = true;
    el.textContent = 'Suggesting…';
    try {
      const tiers = await backend.suggestTiers(task);
      TIER_KEYS.forEach((k, n) => { const input = field(`tier-${n}`); if (tiers?.[k] && !(n === 0 && input.value.trim())) input.value = tiers[k]; });
      c.announce('Tier text suggested. Edit it before you save the list.');
    } catch (err) {
      c.error(err.message || 'No suggestion right now. Write the tiers by hand.');
    } finally {
      el.disabled = false;
      el.textContent = label;
    }
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  c.download = download;

  const sharedForms = {
    setup: async form => {
      const slot = form.closest('dialog').querySelector('[data-slot="setup-error"]');
      const tasks = readTaskForm(form);
      slot.textContent = '';
      if (tasks.length < 1) { slot.textContent = 'Add at least one task.'; return; }
      try {
        const owner = c.backend?.pendingOwner;
        if (owner) { await owner.create(tasks); c.backend = owner; } else c.backend = await startOwnerGame(tasks);
        form.closest('dialog')?.close();
        c.last.clear();
        c.render();
        c.announce('Your game has started on this device.');
      } catch (err) {
        slot.textContent = err.message;
      }
    },
    'next-list': async form => {
      const tasks = readTaskForm(form);
      if (!tasks.length) { c.error('Add at least one task.'); return; }
      if (await c.act({ type: 'list/setNext', tasks })) c.announce("Next month's list is set. It locks on the 1st.");
    },
    'list-edit': async form => {
      const [task] = readTaskForm(form);
      if (!task) { c.error('The task needs a name.'); return; }
      const reason = String(new FormData(form).get('reason') || '').trim();
      if (await c.act({ type: 'list/edit', taskId: form.dataset.taskId, task, reason })) c.announce(`${task.name} corrected. The change is logged.`);
    },
    swap: async form => {
      const data = new FormData(form);
      const type = data.get('type') === 'quality' ? 'quality' : 'quantity';
      const task = { name: String(data.get('name')).trim(), type, unit: String(data.get('unit') || '').trim() || undefined };
      if (type === 'quantity') task.chill = Number(data.get('chill')) || 0;
      else task.chillText = String(data.get('chillText') || '').trim();
      const reason = String(data.get('reason')).trim();
      const ok = await c.confirm({ title: 'Use this month’s emergency swap?', body: `Replace the task with “${task.name}”. The swap is logged publicly: “${reason}”. You get one per month.`, confirm: 'Swap it' });
      if (ok && await c.act({ type: 'list/swap', taskId: data.get('taskId'), task, reason })) c.announce('Task swapped.');
    },
    settings: async form => {
      const data = new FormData(form);
      const settings = {
        companionId: data.get('companionId') || null,
        reminders: { evening: data.get('evening') === 'on', morning: data.get('morning') === 'on', notify: data.get('notify') === 'on' },
        sound: data.get('sound') === 'on', motion: data.get('motion') === 'reduced' ? 'reduced' : 'system',
      };
      if (settings.reminders.notify && globalThis.Notification?.permission === 'default') {
        try { await Notification.requestPermission(); } catch { /* unsupported */ }
      }
      if (await c.act({ type: 'settings/save', settings })) { applyMotion(settings); c.announce('Settings saved.'); }
    },
  };

  function applyMotion(settings) {
    if (settings?.motion === 'reduced' || settings?.motion === 'reduce') document.documentElement.dataset.motion = 'reduce';
    else delete document.documentElement.dataset.motion;
  }

  // ---------- delegation ----------
  document.addEventListener('click', async ev => {
    const el = ev.target.closest('[data-action]');
    if (!el || el.matches('input[type="file"]') || el.disabled) return;
    const name = el.dataset.action;
    const fn = actions[name] || shared[name];
    if (!fn) return;
    ev.preventDefault();
    if (c.busy) return;
    c.busy = true;
    try { await fn(el, ev, c); } finally { c.busy = false; }
  });

  document.addEventListener('submit', async ev => {
    const form = ev.target.closest('form[data-form]');
    if (!form) return;
    ev.preventDefault();
    const fn = forms[form.dataset.form] || sharedForms[form.dataset.form];
    if (fn) await fn(form, c);
  });

  document.addEventListener('change', async ev => {
    const input = ev.target;
    if (input.matches('[data-action="import-save"]') && input.files?.[0]) {
      const text = await input.files[0].text();
      input.value = '';
      const cloud = Boolean(c.backend?.cloud);
      if (!(await c.confirm(cloud
        ? { title: 'Replace the cloud game?', body: 'The imported file replaces your game on every device. Export the current save first if you want to keep it.', confirm: 'Import and replace', danger: true }
        : { title: 'Replace this device’s save?', body: 'The imported file replaces the current game on this device. Export the current save first if you want to keep it.', confirm: 'Import and replace', danger: true }))) return;
      try { await c.backend.importJson(text); c.last.clear(); c.render(); c.announce('Save imported.'); } catch (err) { c.error(err.message || 'That file could not be imported.'); }
    }
  });

  // ---------- boot ----------
  c.start = async () => {
    try { c.asVisitor = sessionStorage.getItem(VISITOR_FLAG) === '1'; } catch { c.asVisitor = false; }
    const [backend, art, defaults] = await Promise.all([createBackend(), loadArt(), defaultTasks(DEFAULT_TASKS)]);
    c.backend = backend;
    c.art = art;
    c.defaults = defaults;
    if (!art.placeholder) petsStylesheet(document);
    let events = [];
    try {
      events = normalizeEvents((await backend.load()).events);
    } catch (err) {
      const status = document.getElementById('load-status');
      if (status) { status.hidden = false; status.textContent = `The game could not load: ${err.message}`; }
      return c;
    }
    applyMotion(c.backend.views().settings);
    document.getElementById('load-status')?.setAttribute('hidden', '');
    c.render();
    onLoad(events, c);
    if (c.backend.notice) c.error(c.backend.notice);
    if (c.backend.rulesMismatch) c.error('The game rules on the server differ from this page. Reload once the latest site update is live.');
    if (c.backend.pendingOwner) onboardOwner();
    setInterval(() => tick(), 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    return c;
  };

  async function tick() {
    if (!c.backend) return;
    try {
      const events = normalizeEvents((await c.backend.refresh()).events);
      const before = c.vm;
      c.render();
      if (events?.length) Promise.resolve(onEvents(events, before, c)).catch(() => {});
      onLoad(events || [], c, { periodic: true });
    } catch { /* keep the last render */ }
  }

  return c;
}

export { SAVE_KEY };
