// Polaris Playbook: progress kept in this browser only (localStorage). Works without storage too.
const KEY = 'repolarisdm:v1';
const blank = () => ({ checks: {}, testedOut: {}, logs: {}, scores: {} });

function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const state = raw ? JSON.parse(raw) : blank();
    return { ...blank(), ...state };
  } catch { return blank(); }
}
let state = load();
function save() {
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable: keep working in memory */ }
}

function readData() {
  const tag = document.getElementById('pb-data');
  if (!tag) return null;
  try { return JSON.parse(tag.textContent); } catch { return null; }
}
const data = readData();

function hoursOf(text) {
  // "6–10 h" -> 8, "13 h + 1–7 days" -> 13, "4 h + 15 min/day" -> 4, "—" -> 0
  const m = String(text).match(/(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*h\b/);
  if (!m) return 0;
  return m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1]);
}

function chapterProgress(chapter) {
  const done = chapter.drills.filter(id => state.checks[id]).length;
  const tested = Boolean(state.testedOut[chapter.slug]);
  const skip = chapter.selfchecks.length > 0 && chapter.selfchecks.every(id => state.checks[id]);
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
  document.querySelectorAll('[data-track]').forEach(box => { box.checked = Boolean(state.checks[box.dataset.track]); });
  document.querySelectorAll('.drill').forEach(drill => {
    const box = drill.querySelector('[data-track]');
    drill.classList.toggle('is-done', Boolean(box && box.checked));
  });
  document.querySelectorAll('[data-testout]').forEach(button => {
    const on = Boolean(state.testedOut[button.dataset.testout]);
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

document.addEventListener('change', event => {
  const el = event.target;
  if (el.matches('[data-track]')) {
    if (el.checked) state.checks[el.dataset.track] = true; else delete state.checks[el.dataset.track];
    save(); refresh();
  } else if (el.matches('[data-score]')) {
    if (el.value) state.scores[el.dataset.score] = el.value; else delete state.scores[el.dataset.score];
    save(); refresh();
  } else if (el.matches('[data-import]') && el.files && el.files[0]) {
    el.files[0].text().then(text => {
      const incoming = JSON.parse(text);
      for (const part of ['checks', 'testedOut', 'logs', 'scores']) state[part] = { ...state[part], ...(incoming[part] || {}) };
      save(); restoreLogs(); refresh();
      window.alert('Progress imported.');
    }).catch(() => window.alert('That file is not a playbook export.'));
  }
});

document.addEventListener('input', event => {
  const el = event.target;
  if (el.matches('[data-log]')) { state.logs[el.dataset.log] = el.value; save(); }
});

document.addEventListener('click', event => {
  const el = event.target.closest('button');
  if (!el) return;
  if (el.matches('[data-testout]')) {
    const slug = el.dataset.testout;
    if (state.testedOut[slug]) delete state.testedOut[slug]; else state.testedOut[slug] = true;
    save(); refresh();
  } else if (el.matches('[data-export]')) {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'polaris-playbook-progress.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } else if (el.matches('[data-reset]')) {
    if (window.confirm('Erase all ticks, logs and scores saved in this browser?')) { state = blank(); save(); restoreLogs(); refresh(); }
  } else if (el.matches('[data-print]')) {
    window.print();
  } else if (el.matches('.pb-menu')) {
    const nav = document.getElementById('pb-nav');
    const open = el.getAttribute('aria-expanded') !== 'true';
    el.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  } else if (el.closest('.mock-timer')) {
    timerAction(el.closest('.mock'), el.dataset.act);
  }
});

function restoreLogs() {
  document.querySelectorAll('[data-log]').forEach(area => { area.value = state.logs[area.dataset.log] || ''; });
}

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

restoreLogs();
refresh();
