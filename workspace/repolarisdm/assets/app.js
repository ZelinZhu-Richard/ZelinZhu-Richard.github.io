// Polaris Playbook progress tracker. Progress is kept in this browser only (localStorage).
// If storage fails, the page keeps working from memory and shows a notice with an export button.
//
// Saved value, under the key below (the key name is kept from v1 so old progress carries over):
//   { v: 2, checks, testedOut, logs, scores }
//   checks     "drill:", "sc:", "cc:", "task:" or "tally:" id -> true
//   testedOut  chapter slug -> true
//   logs       "page:mock-id" -> text, at most 20,000 characters
//   scores     "rubric:" id -> "1", "2", "3" or "4"
//
// Loading and saving. Entries with a wrong type are dropped. Well-formed entries this build does not know
// are kept, because a newer build or another tab may have written them. Unknown fields are kept too.
// If the saved v is above 2, a newer build wrote it. This tab then stops saving and asks the reader to
// reload. Only Reset still saves, after a confirm.
//
// Import is stricter. Every id must have the exact shape the build writes. Drill, self-check and chapter
// ids must exist in this build's pb-data list. If pb-data also has an "ids" list, every id must be in it.
// A section may hold at most 5,000 entries, about ten times what the playbook has. Files over 1 MB fail.
//
// Several open tabs. Each change is one operation: set one key, delete one key, reset, or import-merge.
// The operation is applied to a fresh read of storage and then saved. The rules:
//   - The last operation on a key wins.
//   - Import merges: each valid entry in the file overwrites that key. Keys not in the file are kept.
//   - Reset clears everything, for every tab, after a confirm.
//   - A log box saves only over the text it last showed. If another tab saved newer text, a box the
//     reader has not typed in shows the newer text. A box the reader has typed in keeps the reader's
//     text, stops saving and shows a notice with two choices.
// Tabs re-read storage on the 'storage' event, when they become visible and when restored from the cache.
// One gap remains. A browser may cache storage per process for a moment, so two changes made in different
// tabs within a few milliseconds can still lose one. A person switching tabs is far slower than that.
//
// Storage failures. A change that cannot be saved stays in this tab's memory, and a notice says so.
// Every later change tries again to save all unsaved changes. After a failed read, the page keeps the
// last state it read, and it never saves over storage it could not read.
(() => {
  'use strict';

  const KEY = 'repolarisdm:v1';
  const VERSION = 2;
  const SECTIONS = ['checks', 'testedOut', 'logs', 'scores'];
  const MAX_KEY = 200;
  const MAX_LOG = 20000;
  const MAX_ENTRIES = 5000;
  const MAX_IMPORT_BYTES = 1024 * 1024;
  const ID = '[a-z0-9-]+';
  // Import: the exact id shapes the build writes.
  const KEYS = {
    checks: new RegExp(`^(?:drill:${ID}:${ID}|(?:sc|cc):${ID}:\\d+|task:${ID}:[a-z0-9]+|tally:${ID}:${ID}:\\d+)$`),
    testedOut: new RegExp(`^${ID}$`),
    logs: new RegExp(`^${ID}:${ID}$`),
    scores: new RegExp(`^rubric:${ID}:${ID}:\\d+$`),
  };
  // Load and save: any id this build or a later one could write.
  const SAVED_KEY = /^[a-z0-9][a-z0-9:-]*$/;

  const dict = () => Object.create(null);
  const blank = () => ({ checks: dict(), testedOut: dict(), logs: dict(), scores: dict() });
  const isRecord = value => Object.prototype.toString.call(value) === '[object Object]';

  function readData() {
    const tag = document.getElementById('pb-data');
    if (!tag) return null;
    try {
      const parsed = JSON.parse(tag.textContent);
      if (!isRecord(parsed) || !Array.isArray(parsed.chapters)) return null;
      const chapters = parsed.chapters.filter(c => isRecord(c) && typeof c.slug === 'string' && Array.isArray(c.drills) && Array.isArray(c.selfchecks));
      const ids = Array.isArray(parsed.ids) ? new Set(parsed.ids.filter(id => typeof id === 'string')) : null;
      return { chapters, ids };
    } catch { return null; }
  }
  const data = readData();
  const chapterSlugs = data ? new Set(data.chapters.map(c => c.slug)) : null;
  const listedIds = data ? new Set(data.chapters.flatMap(c => [...c.drills, ...c.selfchecks])) : null;

  // Import only: is this an id the build knows?
  function known(section, key) {
    if (!data) return true;
    if (section === 'testedOut') return chapterSlugs.has(key);
    if (data.ids) return data.ids.has(key);
    return !/^(?:drill|sc):/.test(key) || listedIds.has(key);
  }

  function capLog(text) {
    if (text.length <= MAX_LOG) return text;
    const end = /[\uD800-\uDBFF]/.test(text[MAX_LOG - 1]) ? MAX_LOG - 1 : MAX_LOG;
    return text.slice(0, end);
  }

  // Load and save: the value to keep for one entry, or undefined to drop it.
  function storable(section, key, value) {
    if (key.length > MAX_KEY || !SAVED_KEY.test(key)) return undefined;
    if (section === 'checks' || section === 'testedOut') return value === true ? true : undefined;
    if (section === 'scores') return typeof value === 'string' && /^[1-4]$/.test(value) ? value : undefined;
    return typeof value === 'string' && value !== '' ? capLog(value) : undefined;
  }
  // Import: the value to import for one entry, or undefined to reject it.
  function clean(section, key, value) {
    if (key.length > MAX_KEY || !KEYS[section].test(key) || !known(section, key)) return undefined;
    return storable(section, key, value);
  }

  // Import only. Counts what was accepted, rejected and shortened.
  function normalize(input) {
    const state = blank();
    let accepted = 0, rejected = 0, shortened = 0;
    for (const section of SECTIONS) {
      const part = input[section];
      if (part === undefined || part === null) continue;
      if (!isRecord(part)) { rejected++; continue; }
      for (const key of Object.keys(part)) {
        const raw = part[key];
        const value = clean(section, key, raw);
        if (value === undefined) {
          if (!(section === 'logs' && raw === '')) rejected++; // an empty log is nothing, not an error
          continue;
        }
        if (section === 'logs' && value.length < raw.length) shortened++;
        state[section][key] = value;
        accepted++;
      }
    }
    return { state, accepted, rejected, shortened };
  }

  // ---------- Storage ----------

  let lastGood = null;       // the saved text this tab last read or wrote
  let pendingReset = false;  // a reset this tab has not saved yet
  const pending = new Map(); // this tab's unsaved operations: "section key" -> [section, key, value]; undefined deletes
  let problem = null;        // null, 'read', 'write' or 'newer'
  let state = blank();       // what the page shows: saved progress plus unsaved operations

  function readText() {
    try {
      const text = window.localStorage.getItem(KEY);
      lastGood = text;
      return { ok: true, text };
    } catch { return { ok: false, text: lastGood }; }
  }
  function writeText(text) {
    try { window.localStorage.setItem(KEY, text); lastGood = text; return true; } catch { return false; }
  }
  function parse(text) {
    if (typeof text !== 'string' || text === '') return null;
    try { const value = JSON.parse(text.replace(/^\uFEFF/, '')); return isRecord(value) ? value : null; } catch { return null; }
  }
  const isNewer = raw => raw !== null && Number.isInteger(raw.v) && raw.v > VERSION;
  const apply = (next, [section, key, value]) => { if (value === undefined) delete next[section][key]; else next[section][key] = value; };

  // What to save: the stored object with wrong types dropped, then this tab's unsaved operations.
  function build(raw) {
    const base = pendingReset || raw === null ? {} : raw;
    const next = { v: VERSION };
    for (const name of Object.keys(base)) {
      if (name !== 'v' && name !== '__proto__' && !SECTIONS.includes(name)) next[name] = base[name];
    }
    for (const section of SECTIONS) {
      const part = base[section], kept = dict();
      if (isRecord(part)) {
        for (const key of Object.keys(part)) {
          const value = storable(section, key, part[key]);
          if (value !== undefined) kept[key] = value;
        }
      }
      next[section] = kept;
    }
    for (const op of pending.values()) apply(next, op);
    return next;
  }
  function serialize(next) {
    try { return JSON.stringify(next); } catch {
      // An unknown field cannot be written back (for example, it is nested too deeply). Drop unknown fields.
      const plain = { v: VERSION };
      for (const section of SECTIONS) plain[section] = next[section];
      return JSON.stringify(plain);
    }
  }

  // Reads storage, applies this tab's unsaved operations and then `ops`, and saves. Updates the page state.
  // `check` sees the state before `ops`. If it returns false, `ops` are dropped. Returns whether `ops` were applied.
  function commit(ops = [], { reset = false, check } = {}) {
    const read = readText();
    const raw = parse(read.text);
    if (reset) { pendingReset = true; pending.clear(); }
    const next = build(raw);
    const applied = !check || check(next);
    if (applied) for (const op of ops) { pending.set(`${op[0]} ${op[1]}`, op); apply(next, op); }
    const unsaved = pendingReset || pending.size > 0;
    const allowed = pendingReset || (read.ok && !isNewer(raw)); // never save over storage this tab could not read
    let wrote = false, failed = false;
    if (unsaved && allowed) { wrote = writeText(serialize(next)); failed = !wrote; }
    if (wrote) { pending.clear(); pendingReset = false; }
    problem = failed ? 'write' : !read.ok && !wrote ? 'read' : isNewer(raw) && !wrote ? 'newer' : null;
    state = next;
    showNotice();
    return applied;
  }
  const saved = () => !pendingReset && pending.size === 0;
  // A fresh read plus unsaved operations, without saving anything.
  const current = () => build(parse(readText().text));

  // Sets one key, or deletes it when value is undefined.
  function change(section, key, value) {
    const kept = value === undefined ? undefined : storable(section, key, value);
    if (value !== undefined && kept === undefined) return;
    commit([[section, key, kept]]);
  }

  // ---------- Notices ----------

  function make(tag, attrs, content) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    if (typeof content === 'string') node.textContent = content;
    else if (content) node.append(...content);
    return node;
  }

  const NOTICES = {
    read: ['Saved progress not readable', 'This browser blocked the page from reading your saved progress, so nothing new is saved. The page shows the last progress it could read, plus your changes since. It tries again on each change.'],
    write: ['Progress not saved', 'This browser would not save your progress. Its storage may be full or blocked. Your changes stay on this page until you close it. Saving is tried again on each change.'],
    newer: ['Newer version open', 'A newer version of the playbook saved your progress. Reload this page to keep saving. Until then, changes on this page are not saved.'],
  };
  let notice = null, noticeKind = null, hiddenKind = null;
  function showNotice() {
    if (!problem) hiddenKind = null;
    const kind = problem && problem !== hiddenKind ? problem : null;
    if (kind === noticeKind) return;
    if (notice) notice.remove();
    notice = null;
    noticeKind = kind;
    if (!kind || !document.body) return;
    const [title, text] = NOTICES[kind];
    notice = make('div', { class: 'callout callout-warn pb-notice', role: 'alert' }, [
      make('p', { class: 'callout-label' }, title),
      make('p', {}, `${text} Export your progress to keep a copy.`),
      make('p', { class: 'pb-actions' }, [
        make('button', { type: 'button', class: 'pb-button', 'data-export': '' }, 'Export progress (JSON)'),
        make('button', { type: 'button', class: 'pb-button', 'data-notice-hide': '' }, 'Hide'),
      ]),
    ]);
    if (notice.style) {
      Object.assign(notice.style, {
        position: 'fixed', left: '16px', right: '16px', bottom: '16px', maxWidth: '640px', maxHeight: '50vh', overflowY: 'auto',
        margin: '0 auto', zIndex: '30', padding: '10px 16px', background: 'var(--page)', border: '1px solid var(--warn)',
        borderRadius: '8px', fontSize: '14px', lineHeight: '1.5',
      });
    }
    document.body.append(notice);
  }

  // ---------- Log boxes ----------

  const logBase = new Map();   // log box -> the text it last showed or saved
  const conflicts = new Map(); // log box -> its "changed in another tab" notice
  const baseOf = area => (logBase.has(area) ? logBase.get(area) : '');

  function setConflict(area, on) {
    const shown = conflicts.get(area);
    if (!on) {
      if (shown) { shown.remove(); conflicts.delete(area); }
      return;
    }
    if (shown) return;
    const box = make('div', { class: 'callout callout-warn log-conflict', role: 'alert' }, [
      make('p', { class: 'callout-label' }, 'Changed in another tab'),
      make('p', {}, 'This log changed in another tab after this box showed it. Your text in this box is not saved. Copy anything you want to keep, then choose.'),
      make('p', { class: 'pb-actions' }, [
        make('button', { type: 'button', class: 'pb-button', 'data-log-keep': '' }, "Save this box's text"),
        make('button', { type: 'button', class: 'pb-button', 'data-log-load': '' }, 'Load the saved text'),
      ]),
    ]);
    (area.closest('.mock') || area.parentNode).append(box);
    conflicts.set(area, box);
  }
  function conflictArea(button) {
    const box = button.closest('.log-conflict');
    for (const [area, shown] of conflicts) if (shown === box) return area;
    return null;
  }

  function showLog(area, text) {
    if (area.value !== text) {
      const focused = document.activeElement === area;
      const atEnd = area.selectionStart === area.value.length;
      const start = area.selectionStart, end = area.selectionEnd;
      area.value = text;
      if (focused && typeof start === 'number' && typeof area.setSelectionRange === 'function') {
        // A caret at the end stays at the end, so the next keystroke adds to the newer text.
        if (atEnd) area.setSelectionRange(text.length, text.length);
        else area.setSelectionRange(Math.min(start, text.length), Math.min(end, text.length));
      }
    }
    logBase.set(area, text);
    setConflict(area, false);
  }

  // Shows the saved text in every log box the reader has not typed in since it last showed or saved.
  function restoreLogs(force = false) {
    document.querySelectorAll('[data-log]').forEach(area => {
      const text = state.logs[area.dataset.log] || '';
      if (force || area.value === baseOf(area) || area.value === text) showLog(area, text);
      else if (text !== baseOf(area)) setConflict(area, true);
    });
  }

  // ---------- Rendering ----------

  function hoursOf(text) {
    // "6–10 h" -> 8, "13 h + 1–7 days" -> 13, "4 h + 15 min/day" -> 4, "—" -> 0
    const m = String(text).match(/(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*h\b/);
    if (!m) return 0;
    return m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]);
  }

  function chapterProgress(chapter) {
    const done = chapter.drills.filter(id => state.checks[id] === true).length;
    const tested = state.testedOut[chapter.slug] === true;
    const skip = chapter.selfchecks.length > 0 && chapter.selfchecks.every(id => state.checks[id] === true);
    return { done, total: chapter.drills.length, tested, skip };
  }

  function describe(chapter) {
    const p = chapterProgress(chapter);
    if (p.tested) return 'Tested out';
    if (p.total && p.done === p.total) return 'All drills done';
    if (p.total) return `${p.done} of ${p.total} drills done`;
    return '—';
  }

  function refresh() {
    document.querySelectorAll('[data-track]').forEach(box => { box.checked = state.checks[box.dataset.track] === true; });
    document.querySelectorAll('.drill').forEach(drill => {
      const box = drill.querySelector('[data-track]');
      drill.classList.toggle('is-done', Boolean(box && box.checked));
    });
    document.querySelectorAll('[data-testout]').forEach(button => {
      const on = state.testedOut[button.dataset.testout] === true;
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? 'Tested out ✓ — click to undo' : 'I can do every item: mark this chapter as tested out';
    });
    document.querySelectorAll('[data-tally]').forEach(section => {
      const count = section.querySelectorAll('[data-track]:checked').length;
      const out = section.querySelector('.tally-count');
      if (out) out.textContent = String(count);
    });
    document.querySelectorAll('[data-rubric]').forEach(table => {
      const values = [...table.querySelectorAll('[data-score]')].map(sel => {
        sel.value = state.scores[sel.dataset.score] || '';
        return Number(sel.value);
      }).filter(Boolean);
      const out = table.querySelector('.rubric-avg');
      if (out) out.textContent = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : '—';
    });
    if (!data) return;
    const page = document.body.dataset.page;
    for (const chapter of data.chapters) {
      const text = describe(chapter);
      document.querySelectorAll(`[data-progress="${chapter.slug}"]`).forEach(cell => { cell.textContent = text; });
      const p = chapterProgress(chapter);
      document.querySelectorAll(`[data-nav="${chapter.slug}"]`).forEach(link => link.classList.toggle('is-done', p.tested || (p.total > 0 && p.done === p.total)));
      if (chapter.slug === page) {
        const status = document.querySelector('[data-status]');
        if (status) status.textContent = text === '—' ? '' : `Your progress: ${text}`;
      }
      document.querySelectorAll(`[data-skip="${chapter.slug}"]`).forEach(el => {
        el.textContent = p.skip || p.tested ? 'skip' : 'study';
        el.classList.toggle('is-skip', p.skip || p.tested);
      });
    }
    const skipList = document.querySelector('[data-skiplist]');
    if (skipList) {
      const skipped = data.chapters.filter(c => { const p = chapterProgress(c); return p.skip || p.tested; });
      skipList.textContent = skipped.length ? skipped.map(c => `${String(c.num).padStart(2, '0')} ${c.title}`).join(' · ') : 'none yet';
      const left = data.chapters.filter(c => !skipped.includes(c)).reduce((sum, c) => sum + hoursOf(c.hours), 0);
      const hoursLeft = document.querySelector('[data-hoursleft]');
      if (hoursLeft) hoursLeft.textContent = `about ${Math.round(left)} h`;
    }
  }

  function sync() { commit(); restoreLogs(); refresh(); }

  // ---------- Import and export ----------

  const entries = n => `${n} ${n === 1 ? 'entry' : 'entries'}`;
  const NOTHING = 'Nothing was imported.';
  function importText(text) {
    if (typeof text !== 'string') return `That file is not a Polaris Playbook export. ${NOTHING}`;
    if (text.length > MAX_IMPORT_BYTES) return `That file is over 1 MB, so it is not a Polaris Playbook export. ${NOTHING}`;
    let parsed;
    try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { return `That file is not valid JSON. ${NOTHING}`; }
    if (!isRecord(parsed) || !SECTIONS.some(section => isRecord(parsed[section]))) return `That file is not a Polaris Playbook export. ${NOTHING}`;
    if (parsed.v !== undefined && parsed.v !== 1 && parsed.v !== VERSION) {
      return typeof parsed.v === 'number' && parsed.v > VERSION
        ? `That export comes from a newer version of the playbook. ${NOTHING}`
        : `That file is not a Polaris Playbook export. ${NOTHING}`;
    }
    const incoming = normalize(parsed);
    const rejectedText = incoming.rejected ? `Rejected ${entries(incoming.rejected)} with an unknown id or a wrong value.` : 'Nothing was rejected.';
    if (!incoming.accepted) return incoming.rejected ? `${NOTHING} ${rejectedText}` : `${NOTHING} The file has no progress entries.`;
    const now = current();
    for (const section of SECTIONS) {
      const have = Object.keys(now[section]).length;
      const added = Object.keys(incoming.state[section]).filter(key => !(key in now[section])).length;
      if (added && have + added > MAX_ENTRIES) {
        return `That file would bring one section past 5,000 entries. The playbook has far fewer ids, so the file is probably not a real export. ${NOTHING}`;
      }
    }
    const ops = [];
    for (const section of SECTIONS) for (const key of Object.keys(incoming.state[section])) ops.push([section, key, incoming.state[section][key]]);
    commit(ops);
    restoreLogs(); refresh();
    const shortenedText = incoming.shortened ? ` ${incoming.shortened} log${incoming.shortened === 1 ? ' was' : 's were'} cut to 20,000 characters.` : '';
    let savedText = '';
    if (!saved()) {
      hiddenKind = null; showNotice();
      savedText = ' They are on this page but not saved. See the notice at the bottom of the page.';
    }
    return `Imported ${entries(incoming.accepted)}. ${rejectedText}${shortenedText}${savedText}`;
  }

  function importFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    input.value = ''; // lets the same file be chosen again; the File object stays readable
    if (typeof file.size === 'number' && file.size > MAX_IMPORT_BYTES) {
      window.alert(`That file is over 1 MB, so it is not a Polaris Playbook export. ${NOTHING}`);
      return;
    }
    Promise.resolve()
      .then(() => file.text())
      .then(text => importText(text), () => `Could not read that file. ${NOTHING}`)
      .then(message => window.alert(message));
  }

  function exportFile() {
    const snapshot = current(); // includes changes this tab could not save
    const payload = { v: VERSION, exported: new Date().toISOString(), checks: snapshot.checks, testedOut: snapshot.testedOut, logs: snapshot.logs, scores: snapshot.scores };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'polaris-playbook-progress.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Events ----------

  const is = (el, selector) => Boolean(el) && typeof el.matches === 'function' && el.matches(selector);

  document.addEventListener('change', event => {
    const el = event.target;
    if (is(el, '[data-track]')) {
      change('checks', el.dataset.track, el.checked ? true : undefined);
      refresh();
    } else if (is(el, '[data-score]')) {
      change('scores', el.dataset.score, el.value || undefined);
      refresh();
    } else if (is(el, '[data-import]')) {
      importFile(el);
    }
  });

  document.addEventListener('input', event => {
    const area = event.target;
    if (!is(area, '[data-log]')) return;
    const key = area.dataset.log;
    const text = capLog(area.value);
    const applied = commit([['logs', key, text === '' ? undefined : text]], {
      // Save only over the text this box last showed: another tab may have saved newer text since.
      check: now => { const latest = now.logs[key] || ''; return latest === baseOf(area) || latest === text; },
    });
    if (applied) { logBase.set(area, text); setConflict(area, false); } else setConflict(area, true);
  });

  document.addEventListener('click', event => {
    const el = event.target && typeof event.target.closest === 'function' ? event.target.closest('button') : null;
    if (!el) return;
    if (el.matches('[data-testout]')) {
      // Act on what the reader saw on this button, not on a value another tab may have changed since.
      const slug = el.dataset.testout;
      change('testedOut', slug, el.getAttribute('aria-pressed') === 'true' ? undefined : true);
      refresh();
    } else if (el.matches('[data-export]')) {
      exportFile();
    } else if (el.matches('[data-reset]')) {
      if (window.confirm('Erase all ticks, logs and scores saved in this browser? This also clears them in your other open playbook tabs.')) {
        commit([], { reset: true }); restoreLogs(true); refresh();
      }
    } else if (el.matches('[data-notice-hide]')) {
      hiddenKind = problem; showNotice();
    } else if (el.matches('[data-log-keep]')) {
      const area = conflictArea(el);
      if (area) {
        const text = capLog(area.value);
        commit([['logs', area.dataset.log, text === '' ? undefined : text]]);
        logBase.set(area, text); setConflict(area, false); refresh();
      }
    } else if (el.matches('[data-log-load]')) {
      const area = conflictArea(el);
      if (area) { commit(); showLog(area, state.logs[area.dataset.log] || ''); refresh(); }
    } else if (el.matches('[data-print]')) {
      window.print();
    } else if (el.matches('.pb-menu')) {
      const nav = document.getElementById('pb-nav');
      const open = el.getAttribute('aria-expanded') !== 'true';
      el.setAttribute('aria-expanded', String(open));
      if (nav) nav.classList.toggle('is-open', open);
    } else if (el.closest('.mock-timer')) {
      timerAction(el.closest('.mock'), el.dataset.act);
    }
  });

  // Another tab saved a change (or cleared storage): show the latest saved state.
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === KEY) sync();
  });
  // A page restored from the back/forward cache missed storage events while it was frozen.
  window.addEventListener('pageshow', event => { if (event.persisted) sync(); });
  // A tab coming back into view re-reads storage, in case it missed an event.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });

  const timers = new WeakMap();
  function render(mock) {
    const t = timers.get(mock);
    const left = Math.round(t.remaining / 1000);
    const abs = Math.abs(left);
    const clock = mock.querySelector('.mock-clock');
    clock.textContent = `${left < 0 ? '+' : ''}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
    clock.classList.toggle('is-over', left < 0);
  }
  function timerAction(mock, act) {
    if (!timers.has(mock)) timers.set(mock, { remaining: Number(mock.dataset.minutes) * 60000, handle: null, last: 0 });
    const t = timers.get(mock);
    if (act === 'start' && !t.handle) {
      t.last = Date.now();
      t.handle = setInterval(() => { const now = Date.now(); t.remaining -= now - t.last; t.last = now; render(mock); }, 250);
    } else if (act === 'pause' && t.handle) {
      clearInterval(t.handle); t.handle = null;
    } else if (act === 'reset') {
      if (t.handle) clearInterval(t.handle);
      t.handle = null; t.remaining = Number(mock.dataset.minutes) * 60000;
    }
    render(mock);
  }

  // A log box takes no more than the 20,000 characters a log can save.
  document.querySelectorAll('[data-log]').forEach(area => {
    if (area.getAttribute('maxlength') === null) area.setAttribute('maxlength', String(MAX_LOG));
  });
  commit();
  restoreLogs(true);
  refresh();
})();
