// Runs the real assets/app.js in node:vm against a small DOM shim and fake storage.
// Covers the tracker defects from the 2026-10-21 review: F1 (corrupt saved state), F2 (import types), F3 (stale tabs),
// and the follow-up QA findings: stale log boxes, unknown entries, storage failures and unrecognised import ids.
// For a before/after probe, point TRACKER_APP_FILE at another copy of app.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { renderSite } from '../build.mjs';

const APP_FILE = process.env.TRACKER_APP_FILE || new URL('../assets/app.js', import.meta.url);
const APP = await readFile(APP_FILE, 'utf8');
const KEY = 'repolarisdm:v1';
const MB = 1024 * 1024;

// ---------- DOM shim: only what app.js uses ----------

const selectorCache = new Map();
function compile(selector) {
  if (selectorCache.has(selector)) return selectorCache.get(selector);
  const token = /([a-z][a-z0-9-]*)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]|:(checked)/y;
  const tests = [];
  let at = 0;
  while (at < selector.length) {
    token.lastIndex = at;
    const m = token.exec(selector);
    if (!m) throw new Error(`DOM shim cannot parse selector "${selector}"`);
    if (m[1]) tests.push(el => el.tagName === m[1].toUpperCase());
    else if (m[2]) tests.push(el => el.classes.has(m[2]));
    else if (m[3]) tests.push(m[4] === undefined ? el => el.attrs.has(m[3]) : el => el.attrs.get(m[3]) === m[4]);
    else tests.push(el => el.checked === true);
    at = token.lastIndex;
  }
  selectorCache.set(selector, tests);
  return tests;
}

class Element {
  constructor(document, tag, attrs = {}) {
    this.ownerDocument = document;
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.classes = new Set();
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.files = null;
    for (const [name, value] of Object.entries(attrs)) this.setAttribute(name, value);
  }
  setAttribute(name, value) {
    if (name === 'class') this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    else this.attrs.set(name, String(value));
  }
  getAttribute(name) {
    if (name === 'class') return [...this.classes].join(' ');
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  get classList() {
    const classes = this.classes;
    return {
      toggle(name, force) { const on = force === undefined ? !classes.has(name) : Boolean(force); if (on) classes.add(name); else classes.delete(name); return on; },
      contains: name => classes.has(name),
      add: name => classes.add(name),
      remove: name => classes.delete(name),
    };
  }
  get dataset() {
    const out = {};
    for (const [name, value] of this.attrs) if (name.startsWith('data-')) out[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    return out;
  }
  append(...kids) { for (const kid of kids) { kid.parentNode = this; this.children.push(kid); } return this; }
  appendChild(kid) { this.append(kid); return kid; }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(c => c !== this);
    this.parentNode = null;
  }
  *walk() { for (const kid of this.children) { yield kid; yield* kid.walk(); } }
  matches(selector) { return compile(selector).every(t => t(this)); }
  closest(selector) { for (let el = this; el; el = el.parentNode) if (el.matches(selector)) return el; return null; }
  querySelectorAll(selector) { const tests = compile(selector); return [...this.walk()].filter(el => tests.every(t => t(el))); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  click() { this.ownerDocument.clicked.push(this); }
}

class Document {
  constructor() {
    this.listeners = new Map();
    this.clicked = [];
    this.documentElement = new Element(this, 'html');
    this.body = new Element(this, 'body');
    this.documentElement.append(this.body);
    this.activeElement = this.body;
    this.visibilityState = 'visible';
  }
  createElement(tag, attrs) { return new Element(this, tag, attrs); }
  getElementById(id) { return [...this.documentElement.walk()].find(el => el.attrs.get('id') === id) || null; }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  dispatch(type, target) { for (const fn of this.listeners.get(type) || []) fn({ type, target }); }
}

// ---------- Fixture page: one chapter page plus the tracker controls ----------

const CHAPTERS = [
  { slug: 'toolbelt', num: 1, part: 'Catch', hours: '6–10 h', title: 'Toolbelt', drills: ['drill:toolbelt:grep-first', 'drill:toolbelt:read-diff'], selfchecks: ['sc:toolbelt:1', 'sc:toolbelt:2'] },
  { slug: 'map', num: 3, part: 'Catch', hours: '5 h', title: 'Map', drills: ['drill:map:trace'], selfchecks: ['sc:map:1'] },
];
const LOG = 'toolbelt:meta-format';
const A = 'drill:toolbelt:grep-first';
const B = 'drill:toolbelt:read-diff';
const C = 'drill:map:trace';

function buildPage(document, chapters, ids) {
  const h = (tag, attrs = {}, ...kids) => document.createElement(tag, attrs).append(...kids);
  const box = id => h('input', { type: 'checkbox', 'data-track': id });
  document.body.setAttribute('data-page', 'toolbelt');
  const data = h('script', { type: 'application/json', id: 'pb-data' });
  data.textContent = JSON.stringify(ids ? { chapters, ids } : { chapters });
  document.body.append(
    h('button', { class: 'pb-menu', 'aria-expanded': 'false' }),
    h('nav', { id: 'pb-nav' }, h('a', { 'data-nav': 'toolbelt' }), h('a', { 'data-nav': 'map' })),
    h('p', { 'data-status': 'toolbelt' }),
    ...[A, B, C].map(id => h('section', { class: 'drill' }, box(id))),
    box('sc:toolbelt:1'), box('sc:toolbelt:2'), box('sc:map:1'), box('cc:toolbelt:1'), box('task:toolbelt:1x2y3z'),
    h('button', { class: 'testout', 'data-testout': 'toolbelt' }),
    h('button', { class: 'testout', 'data-testout': 'map' }),
    h('section', { class: 'tally', 'data-tally': 'lab-c' }, box('tally:toolbelt:lab-c:1'), box('tally:toolbelt:lab-c:2'), h('output', { class: 'tally-count' })),
    h('div', { class: 'rubric', 'data-rubric': 'r' }, h('select', { 'data-score': 'rubric:toolbelt:r:1' }), h('select', { 'data-score': 'rubric:toolbelt:r:2' }), h('output', { class: 'rubric-avg' })),
    h('section', { class: 'mock', 'data-mock': LOG, 'data-minutes': '60' }, h('textarea', { 'data-log': LOG })),
    h('td', { 'data-progress': 'toolbelt' }), h('td', { 'data-progress': 'map' }),
    h('span', { 'data-skip': 'toolbelt' }), h('span', { 'data-skiplist': '' }), h('span', { 'data-hoursleft': '' }),
    h('input', { type: 'file', 'data-import': '' }),
    h('button', { 'data-export': '' }),
    h('button', { 'data-reset': '' }),
    data,
  );
}

// ---------- Storage fakes ----------

// One storage shared by several tabs. Like a browser, a write queues a 'storage' event for the other tabs only.
// Tests call deliverEvents() to let those events arrive, or skip it to model a tab acting on a stale screen.
// failReads and failWrites make the next N reads or writes throw (Infinity: all of them).
class SharedStorage {
  constructor(raw) {
    this.items = new Map();
    if (raw !== undefined) this.items.set(KEY, typeof raw === 'string' ? raw : JSON.stringify(raw));
    this.tabs = [];
    this.pending = [];
    this.failReads = 0;
    this.failWrites = 0;
  }
  attach(tab, context) {
    const { items } = this;
    const storage = this;
    const notify = (key, oldValue, newValue) => {
      for (const other of this.tabs) if (other !== tab) this.pending.push(() => other.fireWindow('storage', { key, oldValue, newValue }));
    };
    context.localStorage = {
      getItem(key) {
        if (storage.failReads > 0) { storage.failReads--; throw new DOMException('Read failed.', 'UnknownError'); }
        return items.has(key) ? items.get(key) : null;
      },
      setItem(key, value) {
        if (storage.failWrites > 0) { storage.failWrites--; throw new DOMException('Quota exceeded.', 'QuotaExceededError'); }
        const old = items.has(key) ? items.get(key) : null; items.set(key, String(value)); notify(key, old, String(value));
      },
      removeItem(key) { const old = items.has(key) ? items.get(key) : null; items.delete(key); notify(key, old, null); },
      clear() { items.clear(); notify(null, null, null); },
    };
    this.tabs.push(tab);
  }
  deliverEvents() { const due = this.pending; this.pending = []; for (const fire of due) fire(); }
  saved() { return this.items.has(KEY) ? JSON.parse(this.items.get(KEY)) : null; }
}

// Accessing window.localStorage throws, as with blocked site data.
class BlockedStorage {
  attach(tab, context) {
    Object.defineProperty(context, 'localStorage', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
  }
}

// Reads work, writes throw, as with a full quota.
class FullStorage {
  attach(tab, context) {
    context.localStorage = {
      getItem: () => null,
      setItem() { throw new DOMException('Quota exceeded.', 'QuotaExceededError'); },
      removeItem() {},
    };
  }
}

// ---------- A tab: one page running the real app.js ----------

const settle = () => new Promise(resolve => setImmediate(resolve));
const textOf = el => [el.textContent, ...el.children.map(textOf)].filter(Boolean).join(' ');

function openTab(storage, { chapters = CHAPTERS, ids, confirm = true } = {}) {
  const document = new Document();
  buildPage(document, chapters, ids);
  const alerts = [];
  const blobs = new Map();
  const windowListeners = new Map();
  const tab = {
    document, alerts, confirmAnswer: confirm,
    el(selector) { const found = document.querySelector(selector); assert.ok(found, `fixture has no ${selector}`); return found; },
    checked: id => tab.el(`[data-track="${id}"]`).checked,
    pressed: slug => tab.el(`[data-testout="${slug}"]`).getAttribute('aria-pressed'),
    text: selector => tab.el(selector).textContent,
    tick(id, on = true) { const box = tab.el(`[data-track="${id}"]`); box.checked = on; document.dispatch('change', box); },
    score(id, value) { const sel = tab.el(`[data-score="${id}"]`); sel.value = value; document.dispatch('change', sel); },
    type(key, value) {
      const area = tab.el(`[data-log="${key}"]`);
      document.activeElement = area;
      area.value = value;
      document.dispatch('input', area);
      document.activeElement = document.body;
    },
    click(selector) { document.dispatch('click', tab.el(selector)); },
    log: key => tab.el(`[data-log="${key}"]`).value,
    // The reader leaves the cursor in a log box (and may switch tabs).
    focus(key) { document.activeElement = tab.el(`[data-log="${key}"]`); },
    // One keystroke at the end of a focused log box. Focus stays in the box.
    press(key, chars) { const area = tab.el(`[data-log="${key}"]`); document.activeElement = area; area.value += chars; document.dispatch('input', area); },
    notice: () => document.querySelector('.pb-notice'),
    noticeText: () => { const n = document.querySelector('.pb-notice'); return n ? textOf(n) : ''; },
    conflict: () => document.querySelector('.log-conflict'),
    // The tab becomes visible again after the reader switches back to it.
    show() { document.visibilityState = 'visible'; document.dispatch('visibilitychange', document); },
    async importText(text, size = Buffer.byteLength(text)) {
      let reads = 0;
      const input = tab.el('[data-import]');
      input.files = [{ size, text: async () => { reads++; return text; } }];
      const before = alerts.length;
      document.dispatch('change', input);
      await settle(); await settle();
      assert.equal(alerts.length, before + 1, 'import shows exactly one message');
      return { message: alerts[before], reads };
    },
    async exportJson() {
      const before = document.clicked.length;
      tab.click('[data-export]');
      const link = document.clicked[before];
      assert.ok(link, 'export clicked a download link');
      return { name: link.download, json: JSON.parse(await blobs.get(link.href).text()) };
    },
    fireWindow(type, event) { for (const fn of windowListeners.get(type) || []) fn(event); },
  };
  const context = {
    document, console, Blob,
    alert: message => alerts.push(String(message)),
    confirm: () => tab.confirmAnswer,
    print() {},
    addEventListener(type, fn) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(fn); },
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {},
    URL: { createObjectURL(blob) { const url = `blob:shim/${blobs.size}`; blobs.set(url, blob); return url; }, revokeObjectURL() {} },
  };
  context.window = context;
  storage.attach(tab, context);
  vm.createContext(context);
  vm.runInContext(APP, context, { filename: 'app.js' });
  return tab;
}

const empty = { v: 2, checks: {}, testedOut: {}, logs: {}, scores: {} };
const stateOf = parts => ({ ...empty, ...parts });

// ---------- Control ----------

test('control: normal saving and reloading works', () => {
  const storage = new SharedStorage();
  const tab = openTab(storage);
  tab.tick(A);
  tab.tick('sc:toolbelt:1');
  tab.tick('tally:toolbelt:lab-c:1');
  tab.score('rubric:toolbelt:r:1', '3');
  tab.type(LOG, 'The AI said X. I checked Y.');
  tab.click('[data-testout="map"]');
  assert.deepEqual(storage.saved(), stateOf({
    checks: { [A]: true, 'sc:toolbelt:1': true, 'tally:toolbelt:lab-c:1': true },
    testedOut: { map: true },
    logs: { [LOG]: 'The AI said X. I checked Y.' },
    scores: { 'rubric:toolbelt:r:1': '3' },
  }));

  const again = openTab(storage);
  assert.equal(again.checked(A), true);
  assert.equal(again.checked(B), false);
  assert.equal(again.pressed('map'), 'true');
  assert.equal(again.pressed('toolbelt'), 'false');
  assert.equal(again.el(`[data-log="${LOG}"]`).value, 'The AI said X. I checked Y.');
  assert.equal(again.el('[data-score="rubric:toolbelt:r:1"]').value, '3');
  assert.equal(again.text('.tally-count'), '1');
  assert.equal(again.text('.rubric-avg'), '3.00');
  assert.equal(again.text('[data-progress="toolbelt"]'), '1 of 2 drills done');
  assert.equal(again.text('[data-progress="map"]'), 'Tested out');
  assert.equal(again.text('[data-status]'), 'Your progress: 1 of 2 drills done');

  again.tick(A, false);
  again.click('[data-testout="map"]');
  again.score('rubric:toolbelt:r:1', '');
  again.type(LOG, '');
  assert.deepEqual(storage.saved(), stateOf({ checks: { 'sc:toolbelt:1': true, 'tally:toolbelt:lab-c:1': true } }));
});

// ---------- F1: corrupt saved state ----------

for (const section of ['checks', 'testedOut', 'logs', 'scores']) {
  test(`saved state with ${section}: null loads without throwing and keeps the rest`, () => {
    const good = { checks: { [A]: true }, testedOut: { map: true }, logs: { [LOG]: 'note' }, scores: { 'rubric:toolbelt:r:1': '2' } };
    const storage = new SharedStorage({ ...good, [section]: null });
    const tab = openTab(storage);
    tab.tick(B);
    const expected = stateOf({ ...good, [section]: {} });
    expected.checks = section === 'checks' ? { [B]: true } : { [A]: true, [B]: true };
    assert.deepEqual(storage.saved(), expected);
    assert.equal(tab.checked(B), true);
  });
}

test('saved state with every section null loads and works', () => {
  const storage = new SharedStorage({ checks: null, testedOut: null, logs: null, scores: null });
  const tab = openTab(storage);
  assert.equal(tab.text('[data-progress="toolbelt"]'), '0 of 2 drills done');
  tab.tick(A);
  assert.deepEqual(storage.saved(), stateOf({ checks: { [A]: true } }));
});

test('wrong-typed sections and values are dropped on load; well-formed unknown keys are kept', () => {
  const long = `drill:toolbelt:${'x'.repeat(200)}`;
  const raw = `{"checks":{"${A}":"false","${B}":1,"sc:toolbelt:1":true,"bogus":true,"${long}":true,"__proto__":true},`
    + '"testedOut":["toolbelt"],"logs":42,'
    + '"scores":{"rubric:toolbelt:r:1":5,"rubric:toolbelt:r:2":"4","rubric:toolbelt:r:3":3}}';
  const storage = new SharedStorage(raw);
  const tab = openTab(storage);
  assert.equal(tab.checked(A), false, 'the string "false" must not count as done');
  assert.equal(tab.checked(B), false, 'the number 1 must not count as done');
  assert.equal(tab.checked('sc:toolbelt:1'), true);
  assert.equal(tab.pressed('toolbelt'), 'false');
  tab.tick('cc:toolbelt:1');
  // "bogus" is well formed and true, so it is kept: a newer build may have written it. The long key and __proto__ are dropped.
  assert.deepEqual(storage.saved(), stateOf({ checks: { 'sc:toolbelt:1': true, bogus: true, 'cc:toolbelt:1': true }, scores: { 'rubric:toolbelt:r:2': '4' } }));
});

test('wrong-typed nested values in logs and testedOut are dropped', () => {
  const storage = new SharedStorage({ testedOut: { toolbelt: 'false', map: 1, unknown: true }, logs: { [LOG]: { text: 'x' }, 'bad key': 'x' } });
  const tab = openTab(storage);
  assert.equal(tab.pressed('toolbelt'), 'false');
  assert.equal(tab.pressed('map'), 'false');
  assert.equal(tab.el(`[data-log="${LOG}"]`).value, '');
  tab.tick(A);
  // The unknown slug is well formed and true, so it is kept for the build that knows it.
  assert.deepEqual(storage.saved(), stateOf({ checks: { [A]: true }, testedOut: { unknown: true } }));
});

for (const raw of ['not json{', 'null', '[]', '"text"', '42', 'true', '{"checks":"x","v":"2"}']) {
  test(`corrupt saved value ${JSON.stringify(raw)} does not stop the page`, () => {
    const storage = new SharedStorage(raw);
    const tab = openTab(storage);
    tab.tick(A);
    assert.equal(tab.checked(A), true);
    assert.deepEqual(storage.saved(), stateOf({ checks: { [A]: true } }));
  });
}

test('saved logs are capped at 20,000 characters on load', () => {
  const storage = new SharedStorage({ logs: { [LOG]: 'y'.repeat(30000) } });
  const tab = openTab(storage);
  assert.equal(tab.el(`[data-log="${LOG}"]`).value.length, 20000);
  tab.type(LOG, 'z'.repeat(25000));
  assert.equal(storage.saved().logs[LOG].length, 20000);
});

// ---------- F2: import validation ----------

test('import rejects the string "false" (review probe)', async () => {
  const storage = new SharedStorage();
  const tab = openTab(storage);
  const probe = await tab.importText('{"testedOut":{"toolbelt":"false"}}');
  assert.equal(probe.message, 'Nothing was imported. Rejected 1 entry with an unknown id or a wrong value.');
  assert.equal(tab.pressed('toolbelt'), 'false');
  assert.equal(tab.text('[data-progress="toolbelt"]'), '0 of 2 drills done');
  const drill = await tab.importText(`{"checks":{"${A}":"false","${B}":true}}`);
  assert.equal(drill.message, 'Imported 1 entry. Rejected 1 entry with an unknown id or a wrong value.');
  assert.equal(tab.checked(A), false);
  assert.equal(tab.checked(B), true);
  assert.deepEqual(storage.saved(), stateOf({ checks: { [B]: true } }));
});

test('import rejects unrelated JSON and non-JSON and keeps existing progress', async () => {
  const storage = new SharedStorage();
  const tab = openTab(storage);
  tab.tick(A);
  const before = storage.saved();
  const cases = [
    ['{"name":"budget","items":[1,2,3]}', 'That file is not a Polaris Playbook export. Nothing was imported.'],
    ['[{"checks":{}}]', 'That file is not a Polaris Playbook export. Nothing was imported.'],
    ['null', 'That file is not a Polaris Playbook export. Nothing was imported.'],
    ['"progress"', 'That file is not a Polaris Playbook export. Nothing was imported.'],
    ['{"checks":[true],"logs":"x"}', 'That file is not a Polaris Playbook export. Nothing was imported.'],
    ['{"v":"two","checks":{}}', 'That file is not a Polaris Playbook export. Nothing was imported.'],
    ['{"v":3,"checks":{}}', 'That export comes from a newer version of the playbook. Nothing was imported.'],
    ['this is not json', 'That file is not valid JSON. Nothing was imported.'],
    ['', 'That file is not valid JSON. Nothing was imported.'],
    ['{"v":2,"checks":{}}', 'Nothing was imported. The file has no progress entries.'],
  ];
  for (const [text, expected] of cases) assert.equal((await tab.importText(text)).message, expected, text);
  assert.deepEqual(storage.saved(), before);
  assert.equal(tab.checked(A), true);
});

test('import rejects prototype and unknown keys without polluting objects', async () => {
  const storage = new SharedStorage();
  const tab = openTab(storage);
  const { message } = await tab.importText('{"checks":{"__proto__":true,"constructor":true,"toString":true},"testedOut":{"constructor":true,"__proto__":true}}');
  assert.equal(message, 'Nothing was imported. Rejected 5 entries with an unknown id or a wrong value.');
  assert.equal(storage.saved(), null);
  tab.tick(A);
  assert.deepEqual(storage.saved(), stateOf({ checks: { [A]: true } }));
});

test('import rejects files over 1 MB before reading them', async () => {
  const tab = openTab(new SharedStorage());
  const big = await tab.importText('{}', MB + 1);
  assert.equal(big.message, 'That file is over 1 MB, so it is not a Polaris Playbook export. Nothing was imported.');
  assert.equal(big.reads, 0);
  const unknownSize = await tab.importText(`{"logs":{"${LOG}":"${'q'.repeat(MB)}"}}`, null);
  assert.equal(unknownSize.message, 'That file is over 1 MB, so it is not a Polaris Playbook export. Nothing was imported.');
});

test('import caps long logs and checks score ranges', async () => {
  const storage = new SharedStorage();
  const tab = openTab(storage);
  const file = { v: 2, logs: { [LOG]: 'w'.repeat(25000) }, scores: { 'rubric:toolbelt:r:1': '4', 'rubric:toolbelt:r:2': '0' } };
  const { message } = await tab.importText(JSON.stringify(file));
  assert.equal(message, 'Imported 2 entries. Rejected 1 entry with an unknown id or a wrong value. 1 log was cut to 20,000 characters.');
  assert.equal(storage.saved().logs[LOG].length, 20000);
  assert.deepEqual(storage.saved().scores, { 'rubric:toolbelt:r:1': '4' });
});

test('export has a version and timestamp, and round-trips through import', async () => {
  const storage = new SharedStorage();
  const tab = openTab(storage);
  tab.tick(A); tab.tick('tally:toolbelt:lab-c:2');
  tab.click('[data-testout="toolbelt"]');
  tab.type(LOG, 'line one\nline two');
  tab.score('rubric:toolbelt:r:2', '1');
  const { name, json } = await tab.exportJson();
  assert.equal(name, 'polaris-playbook-progress.json');
  assert.equal(json.v, 2);
  assert.match(json.exported, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  const { exported, ...rest } = json;
  assert.deepEqual(rest, storage.saved());

  const fresh = new SharedStorage();
  const other = openTab(fresh);
  const { message } = await other.importText(JSON.stringify(json));
  assert.equal(message, 'Imported 5 entries. Nothing was rejected.');
  assert.deepEqual(fresh.saved(), storage.saved());
  assert.equal(other.checked(A), true);
  assert.equal(other.pressed('toolbelt'), 'true');
  assert.equal(other.el(`[data-log="${LOG}"]`).value, 'line one\nline two');
  assert.equal(other.text('.rubric-avg'), '1.00');
});

test('an old export without a version field still imports', async () => {
  const storage = new SharedStorage();
  const tab = openTab(storage);
  const legacy = { exported: '2026-10-20T10:00:00.000Z', checks: { [A]: true }, testedOut: {}, logs: { [LOG]: '' }, scores: {} };
  const { message } = await tab.importText(JSON.stringify(legacy));
  assert.equal(message, 'Imported 1 entry. Nothing was rejected.');
  assert.deepEqual(storage.saved(), stateOf({ checks: { [A]: true } }));
});

test('every tracker id in the built site passes the strict import rules', async () => {
  const site = await renderSite({ built: '2026-10-21' });
  const html = [...site.pages.values()].join('\n');
  const ids = attr => [...new Set([...html.matchAll(new RegExp(` ${attr}="([^"]+)"`, 'g'))].map(m => m[1]))];
  const checks = ids('data-track'), testedOut = ids('data-testout'), logs = ids('data-log'), scores = ids('data-score');
  for (const [name, list] of Object.entries({ checks, testedOut, logs, scores })) assert.ok(list.length > 0, `built site has no ${name} ids`);
  for (const prefix of ['drill:', 'sc:', 'cc:', 'task:', 'tally:']) assert.ok(checks.some(id => id.startsWith(prefix)), `no ${prefix} id found`);
  const file = {
    v: 2,
    checks: Object.fromEntries(checks.map(id => [id, true])),
    testedOut: Object.fromEntries(testedOut.map(id => [id, true])),
    logs: Object.fromEntries(logs.map(id => [id, 'note'])),
    scores: Object.fromEntries(scores.map(id => [id, '2'])),
  };
  const total = checks.length + testedOut.length + logs.length + scores.length;
  const tab = openTab(new SharedStorage(), { chapters: site.meta.chapters });
  const { message } = await tab.importText(JSON.stringify(file));
  assert.equal(message, `Imported ${total} entries. Nothing was rejected.`);
});

// ---------- F3: several tabs ----------

test('two tabs ticking different drills: both ticks survive', () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  one.tick(A);
  two.tick(B); // tab two has not seen tab one's change yet
  assert.deepEqual(storage.saved().checks, { [A]: true, [B]: true });
  storage.deliverEvents();
  assert.equal(one.checked(B), true);
  assert.equal(two.checked(A), true);
  assert.equal(one.text('[data-progress="toolbelt"]'), 'All drills done');
});

test('one tab unticks while another ticks: both effects survive', () => {
  const storage = new SharedStorage({ checks: { [A]: true } });
  const one = openTab(storage), two = openTab(storage);
  one.tick(A, false);
  assert.equal(two.checked(A), true, 'tab two still shows the old tick');
  two.tick(B);
  assert.deepEqual(storage.saved().checks, { [B]: true });
  storage.deliverEvents();
  assert.equal(two.checked(A), false);
  assert.equal(one.checked(B), true);
});

test('the last operation on one key wins', () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  one.tick(A);
  two.tick(A, false);
  assert.deepEqual(storage.saved().checks, {});
  storage.deliverEvents();
  assert.equal(one.checked(A), false);
  one.type(LOG, 'first');
  storage.deliverEvents();
  two.type(LOG, 'second'); // tab two showed "first", so this keystroke replaces it
  assert.equal(storage.saved().logs[LOG], 'second');
  storage.deliverEvents();
  assert.equal(one.log(LOG), 'second');
});

test('a log box never saves over text it did not show', () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  one.type(LOG, 'first');
  two.type(LOG, 'second'); // tab two has not seen "first" yet
  assert.equal(storage.saved().logs[LOG], 'first', 'the stale box does not erase the other tab\'s text');
  assert.equal(two.log(LOG), 'second', 'the reader\'s text stays in the box');
  assert.match(textOf(two.conflict()), /changed in another tab/);
  storage.deliverEvents();
  assert.equal(one.log(LOG), 'first');
  assert.equal(two.log(LOG), 'second');
  assert.ok(two.conflict(), 'the notice stays until the reader chooses');
  two.click('[data-log-keep]');
  assert.equal(storage.saved().logs[LOG], 'second');
  assert.equal(two.conflict(), null);
  storage.deliverEvents();
  assert.equal(one.log(LOG), 'second');
});

test('import in one tab merges with progress saved by another tab', async () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  one.tick(A);
  one.type(LOG, 'mine');
  one.score('rubric:toolbelt:r:1', '2');
  const file = { v: 2, exported: '2026-10-21T00:00:00.000Z', checks: { [C]: true }, testedOut: { map: true }, logs: { [LOG]: 'from file' }, scores: {} };
  const { message } = await two.importText(JSON.stringify(file));
  assert.equal(message, 'Imported 3 entries. Nothing was rejected.');
  assert.deepEqual(storage.saved(), stateOf({
    checks: { [A]: true, [C]: true }, testedOut: { map: true }, logs: { [LOG]: 'from file' }, scores: { 'rubric:toolbelt:r:1': '2' },
  }));
  one.tick('sc:toolbelt:1'); // tab one is stale: it has not seen the import
  assert.deepEqual(storage.saved().checks, { [A]: true, [C]: true, 'sc:toolbelt:1': true });
  assert.equal(storage.saved().logs[LOG], 'from file');
  storage.deliverEvents();
  assert.equal(one.el(`[data-log="${LOG}"]`).value, 'from file');
  assert.equal(one.pressed('map'), 'true');
  assert.equal(two.checked('sc:toolbelt:1'), true);
});

test('reset clears every tab, and a stale tab cannot bring old ticks back', () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  one.tick(A);
  two.tick(B);
  two.confirmAnswer = false;
  two.click('[data-reset]');
  assert.deepEqual(storage.saved().checks, { [A]: true, [B]: true }, 'a cancelled reset changes nothing');
  two.confirmAnswer = true;
  two.click('[data-reset]');
  assert.deepEqual(storage.saved(), empty);
  assert.equal(two.checked(B), false);
  one.tick(C); // tab one still shows A ticked
  assert.deepEqual(storage.saved().checks, { [C]: true });
  storage.deliverEvents();
  assert.equal(one.checked(A), false);
  assert.equal(two.checked(C), true);
});

test('the reader\'s focused log is not overwritten by another tab', () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  const area = one.el(`[data-log="${LOG}"]`);
  area.value = 'typing in progress';
  one.document.activeElement = area;
  two.type(LOG, 'other tab');
  storage.deliverEvents();
  assert.equal(area.value, 'typing in progress');
});

test('a storage clear in another tab empties this tab', () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  one.tick(A);
  storage.deliverEvents();
  assert.equal(two.checked(A), true);
  storage.items.clear();
  two.fireWindow('storage', { key: null, oldValue: null, newValue: null });
  assert.equal(two.checked(A), false);
});

// ---------- Storage unavailable ----------

test('blocked storage: the page works in memory', async () => {
  const tab = openTab(new BlockedStorage());
  tab.tick(A);
  tab.tick(B);
  tab.click('[data-testout="map"]');
  assert.equal(tab.checked(A), true);
  assert.equal(tab.checked(B), true);
  assert.equal(tab.text('[data-progress="toolbelt"]'), 'All drills done');
  assert.equal(tab.text('[data-progress="map"]'), 'Tested out');
  const { json } = await tab.exportJson();
  assert.deepEqual(json.checks, { [A]: true, [B]: true });
  const { message } = await tab.importText(JSON.stringify({ v: 2, checks: { [C]: true } }));
  assert.equal(message, 'Imported 1 entry. Nothing was rejected. They are on this page but not saved. See the notice at the bottom of the page.');
  assert.equal(tab.checked(C), true);
  assert.equal(tab.checked(A), true);
  assert.match(tab.noticeText(), /blocked the page from reading your saved progress/);
  assert.ok(tab.notice().querySelector('[data-export]'), 'the notice offers an export');
  const reloaded = openTab(new BlockedStorage());
  assert.equal(reloaded.checked(A), false, 'memory-only progress ends with the page');
});

test('full storage: writes fail but no tick is lost in memory', () => {
  const tab = openTab(new FullStorage());
  tab.tick(A);
  tab.tick(B);
  tab.score('rubric:toolbelt:r:1', '4');
  assert.equal(tab.checked(A), true);
  assert.equal(tab.checked(B), true);
  assert.equal(tab.text('.rubric-avg'), '4.00');
  assert.match(tab.noticeText(), /would not save your progress/);
});

// ---------- QA 1: a focused log box and another tab's newer text ----------

test('a focused log box the reader is not typing in takes on another tab\'s newer text (QA probe)', () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  one.type(LOG, 'old text');
  storage.deliverEvents();
  one.focus(LOG); // the cursor stays in the box while the reader works in tab two
  two.type(LOG, 'one hour of new notes in tab two');
  storage.deliverEvents();
  assert.equal(one.log(LOG), 'one hour of new notes in tab two');
  one.press(LOG, '.');
  assert.equal(storage.saved().logs[LOG], 'one hour of new notes in tab two.');
  assert.equal(one.conflict(), null);
});

test('a keystroke in a stale log box keeps the other tab\'s text and asks the reader', () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  one.type(LOG, 'old text');
  storage.deliverEvents();
  one.focus(LOG);
  two.type(LOG, 'new notes from tab two');
  one.press(LOG, '.'); // the storage event has not reached tab one yet
  assert.equal(storage.saved().logs[LOG], 'new notes from tab two');
  assert.equal(one.log(LOG), 'old text.');
  assert.match(textOf(one.conflict()), /Your text in this box is not saved/);
  one.press(LOG, '!');
  assert.equal(storage.saved().logs[LOG], 'new notes from tab two', 'later keystrokes do not save either');
  storage.deliverEvents();
  assert.equal(one.log(LOG), 'old text.!', 'the event does not wipe the reader\'s unsaved text');
  one.click('[data-log-load]');
  assert.equal(one.log(LOG), 'new notes from tab two');
  assert.equal(one.conflict(), null);
  one.press(LOG, '?');
  assert.equal(storage.saved().logs[LOG], 'new notes from tab two?');
});

test('reset in another tab clears a focused log box, and a stale keystroke cannot undo it', () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  one.type(LOG, 'old text.');
  storage.deliverEvents();
  one.focus(LOG);
  two.click('[data-reset]');
  storage.deliverEvents();
  assert.equal(one.log(LOG), '', 'reset clears the box in other tabs, as its dialog says');
  one.press(LOG, '!');
  assert.equal(storage.saved().logs[LOG], '!');

  const again = new SharedStorage();
  const three = openTab(again), four = openTab(again);
  three.type(LOG, 'old text.');
  again.deliverEvents();
  three.focus(LOG);
  four.click('[data-reset]');
  three.press(LOG, '!'); // before the reset event arrives
  assert.deepEqual(again.saved().logs, {});
  assert.ok(three.conflict());
});

test('a tab re-reads storage when it becomes visible again', () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  two.tick(A);
  two.type(LOG, 'from tab two');
  storage.pending = []; // tab one missed the events
  assert.equal(one.checked(A), false);
  one.show();
  assert.equal(one.checked(A), true);
  assert.equal(one.log(LOG), 'from tab two');
});

test('log boxes take at most 20,000 characters', () => {
  const tab = openTab(new SharedStorage());
  assert.equal(tab.el(`[data-log="${LOG}"]`).getAttribute('maxlength'), '20000');
});

// ---------- QA 2: entries and versions this tab does not know ----------

test('a tab keeps saved entries and fields it does not know (QA probe: old tab across a deploy)', () => {
  const stored = {
    v: 2,
    checks: { [A]: true, 'drill:new-chapter:x': true, 'quiz:toolbelt:1': true },
    testedOut: { 'new-chapter': true },
    logs: { 'new-chapter:mock': 'kept' },
    scores: { 'rubric:new-chapter:r:1': '3' },
    flags: { beta: true },
  };
  const storage = new SharedStorage(stored);
  const tab = openTab(storage); // its chapter list has no "new-chapter"
  tab.tick(B);
  tab.click('[data-testout="map"]');
  assert.deepEqual(storage.saved(), { ...stored, checks: { ...stored.checks, [B]: true }, testedOut: { 'new-chapter': true, map: true } });
});

test('a value saved by a newer version is never overwritten, and the tab asks for a reload', async () => {
  const text = JSON.stringify({ v: 3, checks: { [A]: true, 'quiz:toolbelt:1': true }, testedOut: {}, logs: {}, scores: {}, flags: { seen: true } });
  const storage = new SharedStorage(text);
  const tab = openTab(storage);
  assert.equal(tab.checked(A), true, 'what this build understands is still shown');
  assert.match(tab.noticeText(), /newer version of the playbook saved your progress\. Reload this page/);
  tab.tick(B);
  tab.type(LOG, 'note');
  tab.click('[data-testout="map"]');
  const { message } = await tab.importText(JSON.stringify({ v: 2, checks: { [C]: true } }));
  assert.match(message, /^Imported 1 entry\. Nothing was rejected\. They are on this page but not saved\./);
  assert.equal(storage.items.get(KEY), text, 'storage is untouched');
  assert.equal(tab.checked(B), true, 'the change shows in this tab only');
  // Reset is the one exception: the reader confirmed erasing everything.
  tab.click('[data-reset]');
  assert.deepEqual(storage.saved(), empty);
  assert.equal(tab.notice(), null);
});

test('a non-integer or non-number version is treated as corrupt, not as newer', () => {
  for (const v of [2.5, '3', null, -1]) {
    const storage = new SharedStorage({ v, checks: { [A]: true } });
    const tab = openTab(storage);
    tab.tick(B);
    assert.deepEqual(storage.saved(), stateOf({ checks: { [A]: true, [B]: true } }), `v ${JSON.stringify(v)}`);
  }
  const huge = new SharedStorage(`{"v":1e400,"checks":{"${A}":true}}`);
  openTab(huge).tick(B);
  assert.deepEqual(huge.saved().checks, { [A]: true, [B]: true });
});

test('a stored value with a BOM keeps its progress', () => {
  const storage = new SharedStorage(`\uFEFF${JSON.stringify({ v: 2, checks: { [A]: true } })}`);
  const tab = openTab(storage);
  assert.equal(tab.checked(A), true);
  tab.tick(B);
  assert.deepEqual(storage.saved().checks, { [A]: true, [B]: true });
});

test('an unknown field too deep to write back is dropped, and the tick is saved', () => {
  const depth = 100000;
  const storage = new SharedStorage(`{"v":2,"checks":{"${A}":true},"junk":${'['.repeat(depth)}${']'.repeat(depth)}}`);
  const tab = openTab(storage);
  tab.tick(B);
  assert.deepEqual(storage.saved(), stateOf({ checks: { [A]: true, [B]: true } }));
});

// ---------- QA 3: storage failures ----------

test('a failed read at load shows a notice and never saves over the stored progress (QA probe)', () => {
  const storage = new SharedStorage({ checks: { [A]: true, [B]: true } });
  storage.failReads = 1;
  const tab = openTab(storage);
  assert.match(tab.noticeText(), /blocked the page from reading your saved progress/);
  tab.tick(C); // the next read works: the tick is saved on top of A and B
  assert.deepEqual(storage.saved().checks, { [A]: true, [B]: true, [C]: true });
  assert.equal(tab.checked(A), true);
  assert.equal(tab.notice(), null, 'the notice goes once storage works again');
});

test('a failed read mid-session keeps the last good state and saves nothing until a read works', () => {
  const storage = new SharedStorage({ checks: { [A]: true, [B]: true } });
  const tab = openTab(storage);
  storage.failReads = 1;
  tab.tick(C);
  assert.deepEqual(storage.saved().checks, { [A]: true, [B]: true }, 'nothing is written after a failed read');
  assert.equal(tab.checked(A), true, 'the last good state stays on screen');
  assert.equal(tab.checked(C), true);
  assert.ok(tab.notice());
  tab.tick('sc:toolbelt:1');
  assert.deepEqual(storage.saved().checks, { [A]: true, [B]: true, [C]: true, 'sc:toolbelt:1': true });
  assert.equal(tab.notice(), null);
});

test('one failed write shows a notice, and the next change saves every unsaved change (QA probe)', () => {
  const storage = new SharedStorage();
  const tab = openTab(storage);
  tab.tick(A);
  storage.failWrites = 1;
  tab.tick(B);
  assert.match(tab.noticeText(), /would not save your progress/);
  assert.deepEqual(storage.saved().checks, { [A]: true });
  tab.tick(C);
  tab.type(LOG, 'note');
  assert.equal(tab.notice(), null);
  const reloaded = openTab(storage);
  assert.equal(reloaded.checked(B), true);
  assert.equal(reloaded.checked(C), true);
  assert.equal(reloaded.log(LOG), 'note');
});

test('while writes keep failing, the notice stays, export has every change, and Hide hides it', async () => {
  const storage = new SharedStorage({ checks: { [A]: true } });
  const one = openTab(storage), two = openTab(storage);
  storage.failWrites = Infinity;
  one.tick(B);
  one.type(LOG, 'unsaved note');
  one.score('rubric:toolbelt:r:1', '2');
  assert.ok(one.notice().querySelector('[data-export]'));
  const { json } = await one.exportJson();
  assert.deepEqual(json.checks, { [A]: true, [B]: true });
  assert.equal(json.logs[LOG], 'unsaved note');
  assert.deepEqual(json.scores, { 'rubric:toolbelt:r:1': '2' });
  one.click('[data-notice-hide]');
  assert.equal(one.notice(), null);
  one.tick(C);
  assert.equal(one.notice(), null, 'a hidden notice stays hidden for the same problem');
  assert.equal(two.notice(), null, 'other tabs are not affected until they fail too');
  storage.failWrites = 0;
  one.tick('sc:toolbelt:1');
  assert.deepEqual(storage.saved().checks, { [A]: true, [B]: true, [C]: true, 'sc:toolbelt:1': true });
  assert.equal(storage.saved().logs[LOG], 'unsaved note');
});

test('unsaved changes stay on screen when another tab saves', () => {
  const storage = new SharedStorage();
  const one = openTab(storage), two = openTab(storage);
  storage.failWrites = 1;
  one.tick(A); // fails
  two.tick(B);
  storage.deliverEvents();
  assert.equal(one.checked(A), true, 'the unsaved tick is still shown');
  assert.equal(one.checked(B), true);
  assert.deepEqual(storage.saved().checks, { [A]: true, [B]: true }, 'the storage event retried the unsaved tick');
});

// ---------- QA 4: import checks that ids exist, and caps entries ----------

test('import rejects drill and self-check ids this build does not list (QA probe)', async () => {
  const storage = new SharedStorage();
  const tab = openTab(storage);
  const file = { v: 2, checks: { 'drill:toolbelt:does-not-exist': true, 'sc:nochapter:99': true, 'sc:toolbelt:99': true, [A]: true }, testedOut: { 'no-chapter': true } };
  const { message } = await tab.importText(JSON.stringify(file));
  assert.equal(message, 'Imported 1 entry. Rejected 4 entries with an unknown id or a wrong value.');
  assert.deepEqual(storage.saved(), stateOf({ checks: { [A]: true } }));
});

test('with an ids list in pb-data, import rejects every id not on it (QA probe)', async () => {
  const ids = [A, B, C, 'sc:toolbelt:1', 'sc:toolbelt:2', 'sc:map:1', 'cc:toolbelt:1', 'task:toolbelt:1x2y3z',
    'tally:toolbelt:lab-c:1', 'tally:toolbelt:lab-c:2', 'rubric:toolbelt:r:1', 'rubric:toolbelt:r:2', LOG];
  const storage = new SharedStorage();
  const tab = openTab(storage, { ids });
  const file = {
    v: 2,
    checks: { 'task:toolbelt:1x2y3z': true, 'task:toolbelt:zzzzzz': true },
    logs: { 'nopage:nomock': 'x', [LOG]: 'y' },
    scores: { 'rubric:x:y:999': '2', 'rubric:toolbelt:r:1': '3' },
  };
  const { message } = await tab.importText(JSON.stringify(file));
  assert.equal(message, 'Imported 3 entries. Rejected 3 entries with an unknown id or a wrong value.');
  assert.deepEqual(storage.saved(), stateOf({ checks: { 'task:toolbelt:1x2y3z': true }, logs: { [LOG]: 'y' }, scores: { 'rubric:toolbelt:r:1': '3' } }));
});

test('import refuses to grow a section past 5,000 entries', async () => {
  const storage = new SharedStorage();
  const tab = openTab(storage);
  const fake = (from, n) => Object.fromEntries(Array.from({ length: n }, (_, k) => [`cc:toolbelt:${from + k}`, true]));
  const refused = 'That file would bring one section past 5,000 entries. The playbook has far fewer ids, so the file is probably not a real export. Nothing was imported.';
  assert.equal((await tab.importText(JSON.stringify({ v: 2, checks: fake(0, 5001) }))).message, refused);
  assert.equal(storage.saved(), null);
  assert.equal((await tab.importText(JSON.stringify({ v: 2, checks: fake(0, 4000) }))).message, 'Imported 4000 entries. Nothing was rejected.');
  assert.equal((await tab.importText(JSON.stringify({ v: 2, checks: fake(4000, 4000) }))).message, refused, 'repeated files cannot pile up');
  assert.equal(Object.keys(storage.saved().checks).length, 4000);
  assert.equal((await tab.importText(JSON.stringify({ v: 2, checks: fake(0, 4000) }))).message, 'Imported 4000 entries. Nothing was rejected.', 're-importing the same ids is fine');
});
