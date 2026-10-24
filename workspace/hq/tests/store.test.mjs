import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as S from '../store.js';

const seedText = await readFile(new URL('../seed.example.json', import.meta.url), 'utf8');
const seed = () => JSON.parse(seedText);
const ids = () => { let n = 0; return () => `id${++n}`; };

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() { return data.size; },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: k => { data.delete(k); },
  };
}

test('the good fixture (seed.example.json) validates and round-trips through export', () => {
  const result = S.validateImport(seedText);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(S.toExport(result.state), seed());
  assert.deepEqual(Object.keys(S.toExport(result.state)), ['format', 'version', 'categories', 'priorities', 'deadlines', 'tasks', 'thoughts', 'ideas']);
});

test('export field order matches the documented shape', () => {
  const out = S.toExport(S.validateImport(seedText).state);
  assert.deepEqual(Object.keys(out.categories[0]), ['id', 'name', 'position']);
  assert.deepEqual(Object.keys(out.priorities[0]), ['id', 'scope', 'period', 'slot', 'text', 'done']);
  assert.deepEqual(Object.keys(out.deadlines[0]), ['id', 'title', 'kind', 'category', 'date', 'approx', 'dateLabel', 'sortOrder']);
  assert.deepEqual(Object.keys(out.tasks[0]), ['id', 'deadlineId', 'text', 'done', 'position']);
  assert.deepEqual(Object.keys(out.thoughts[0]), ['id', 'text', 'createdAt']);
  assert.deepEqual(Object.keys(out.ideas[0]), ['id', 'title', 'note', 'bucket', 'position']);
});

test('a category may be referenced by name and is normalized to its id', () => {
  const data = seed();
  data.deadlines[0].category = 'fellowships';
  const result = S.validateImport(data);
  assert.equal(result.ok, true);
  assert.equal(result.state.deadlines[0].category, 'cat-fellowships');
});

const BAD = [
  ['not JSON', () => '{"format":', /not valid JSON/],
  ['not an object', () => '[1,2]', /JSON object/],
  ['wrong format', d => { d.format = 'other'; }, /"format" must be "hq-export"/],
  ['wrong version', d => { d.version = 2; }, /"version" must be 1/],
  ['collection not a list', d => { d.ideas = { a: 1 }; }, /"ideas" must be an array/],
  ['no HQ collections at all', () => '{"name":"something else"}', /Not an HQ file/],
  ['id too long', d => { d.tasks[0].id = 'x'.repeat(101); }, /tasks\[0\]\.id must be text/],
  ['id not text', d => { d.ideas[0].id = { nested: true }; }, /ideas\[0\]\.id must be text/],
  ['item not an object', d => { d.tasks[0] = 7; }, /tasks\[0\] must be an object/],
  ['duplicate id', d => { d.tasks[1].id = d.tasks[0].id; }, /used twice/],
  ['impossible date', d => { d.deadlines[2].date = '2026-02-30'; }, /deadlines\[2\]\.date/],
  ['US-style date', d => { d.deadlines[2].date = '11/01/2026'; }, /deadlines\[2\]\.date/],
  ['task without deadline', d => { d.tasks[0].deadlineId = 'nope'; }, /tasks\[0\]\.deadlineId/],
  ['unknown category', d => { d.deadlines[0].category = 'Hobbies'; }, /not one of the categories/],
  ['bad scope', d => { d.priorities[0].scope = 'week'; }, /scope must be/],
  ['today slot out of range', d => { d.priorities[0].slot = 4; }, /slot must be a whole number from 1 to 3/],
  ['month period with a day', d => { d.priorities[3].period = '2026-10-01'; }, /month \(YYYY-MM\)/],
  ['repeated slot', d => { d.priorities[1].slot = 1; }, /repeats slot 1/],
  ['bad bucket', d => { d.ideas[0].bucket = 'someday'; }, /bucket must be/],
  ['bad createdAt', d => { d.thoughts[0].createdAt = 'yesterday'; }, /createdAt/],
  ['empty title', d => { d.deadlines[0].title = '   '; }, /title must not be empty/],
  ['done not boolean', d => { d.tasks[0].done = 'yes'; }, /done must be true or false/],
  ['too long', d => { d.thoughts[0].text = 'x'.repeat(5000); }, /longer than/],
  ['duplicate category name', d => { d.categories[1].name = 'college'; }, /used twice/],
];

for (const [name, change, message] of BAD) {
  test(`import rejects: ${name} (never partially)`, () => {
    let input;
    const d = seed();
    const r = change(d);
    input = typeof r === 'string' ? r : d;
    const result = S.validateImport(input);
    assert.equal(result.ok, false);
    assert.equal(result.state, undefined);
    assert.ok(result.errors.length > 0);
    assert.match(result.errors.join(' '), message);
  });
}

test('storage: empty, ok, invalid, unavailable; writes and clears', () => {
  const store = memoryStorage();
  assert.equal(S.readStorage(store).status, 'empty');
  const state = S.emptyState(ids());
  assert.deepEqual(state.categories.map(c => c.name), ['College', 'Fellowships', 'Jobs', 'Research']);
  assert.equal(S.writeStorage(store, state).ok, true);
  assert.ok(store.data.has('hq:v1'));
  const back = S.readStorage(store);
  assert.equal(back.status, 'ok');
  assert.deepEqual(S.toExport(back.state), S.toExport(state));
  store.setItem('hq:v1', '{broken');
  assert.equal(S.readStorage(store).status, 'invalid');
  const kept = S.backupUnreadable(store, '2026-10-24T18:00:00.000Z');
  assert.deepEqual(kept, { ok: true, key: 'hq:v1:unreadable:2026-10-24T18:00:00.000Z' });
  assert.equal(store.getItem(kept.key), '{broken');
  S.writeUi(store, { filter: 'all' });
  assert.equal(S.clearStorage(store), true);
  assert.equal(store.data.size, 0);
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(S.readStorage(blocked).status, 'unavailable');
  assert.deepEqual(S.readUi(blocked), {});
  assert.doesNotThrow(() => S.writeUi(blocked, {}));
  assert.equal(S.clearStorage(blocked), false);
});

test('a failed write (quota) reports an error instead of throwing', () => {
  const full = { setItem() { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } };
  const result = S.writeStorage(full, S.emptyState(ids()));
  assert.equal(result.ok, false);
  assert.match(result.error, /storage is full/);
});

test('priorities: set, tick, clear and carry over', () => {
  const newId = ids();
  let s = S.emptyState(newId);
  s = S.setPriority(s, { scope: 'today', period: '2026-10-24', slot: 2, text: '  Write  ' }, newId);
  assert.equal(s.priorities.length, 1);
  assert.equal(s.priorities[0].text, 'Write');
  s = S.setPriority(s, { scope: 'today', period: '2026-10-24', slot: 2, done: true }, newId);
  assert.equal(s.priorities[0].done, true);
  assert.equal(s.priorities[0].text, 'Write');
  s = S.setPriority(s, { scope: 'today', period: '2026-10-24', slot: 2, text: '', done: false }, newId);
  assert.equal(s.priorities.length, 0, 'an empty, unticked slot is removed');
  s = S.setPriority(s, { scope: 'today', period: '2026-10-24', slot: 1, text: 'Kept' }, newId);
  s = S.carryOver(s, 'today', '2026-10-24', ['A', 'B', 'C'], newId);
  const today = s.priorities.filter(p => p.period === '2026-10-24').sort((a, b) => a.slot - b.slot);
  assert.deepEqual(today.map(p => [p.slot, p.text]), [[1, 'Kept'], [2, 'A'], [3, 'B']]);
});

test('deadlines and tasks: add, update, remove (tasks cascade)', () => {
  const newId = ids();
  let s = S.emptyState(newId);
  const cat = s.categories[0].id;
  assert.deepEqual(S.deadlineErrors({ title: '', category: 'x', date: '2026-02-30' }, s.categories).length, 3);
  assert.deepEqual(S.deadlineErrors({ title: 'College A', category: cat, date: null }, s.categories), []);
  s = S.addDeadline(s, { title: 'College A', kind: 'Early decision', category: cat, date: '2026-11-01', approx: false, dateLabel: '' }, newId);
  s = S.addDeadline(s, { title: 'Program B', kind: '', category: cat, date: null, approx: true, dateLabel: 'rolling' }, newId);
  const [a, b] = s.deadlines;
  assert.equal(a.dateLabel, null);
  assert.equal(b.dateLabel, 'ROLLING');
  assert.equal(b.sortOrder, a.sortOrder + 1);
  s = S.addTask(s, a.id, 'One', newId);
  s = S.addTask(s, a.id, 'Two', newId);
  s = S.addTask(s, b.id, 'Three', newId);
  assert.equal(S.addTask(s, 'missing', 'x', newId), s);
  assert.equal(S.addTask(s, a.id, '   ', newId), s);
  assert.deepEqual(s.tasks.filter(t => t.deadlineId === a.id).map(t => t.position), [0, 1]);
  s = S.toggleTask(s, s.tasks[0].id);
  assert.equal(s.tasks[0].done, true);
  s = S.updateDeadline(s, a.id, { title: 'College A2', date: null });
  assert.equal(s.deadlines[0].title, 'College A2');
  assert.equal(s.deadlines[0].date, null);
  s = S.removeDeadline(s, a.id);
  assert.equal(s.deadlines.length, 1);
  assert.deepEqual(s.tasks.map(t => t.text), ['Three']);
  assert.equal(S.validateImport(S.toExport(s)).ok, true);
});

test('brain dump: add newest first, move to a task or to the waitlist', () => {
  const newId = ids();
  let s = S.emptyState(newId);
  s = S.addDeadline(s, { title: 'College A', kind: '', category: s.categories[0].id, date: null }, newId);
  s = S.addThought(s, 'First', '2026-10-24T10:00:00.000Z', newId);
  s = S.addThought(s, 'Second', '2026-10-24T11:00:00.000Z', newId);
  assert.equal(S.addThought(s, '  ', '2026-10-24T12:00:00.000Z', newId), s);
  assert.deepEqual(S.thoughtsNewestFirst(s.thoughts).map(t => t.text), ['Second', 'First']);
  const [first, second] = s.thoughts;
  s = S.thoughtToTask(s, first.id, s.deadlines[0].id, newId);
  assert.deepEqual(s.tasks.map(t => t.text), ['First']);
  s = S.thoughtToIdea(s, second.id, newId);
  assert.equal(s.thoughts.length, 0);
  assert.deepEqual(s.ideas.map(x => [x.title, x.bucket]), [['Second', 'later']]);
});

test('waitlist: add to later, move between columns, remove', () => {
  const newId = ids();
  let s = S.emptyState(newId);
  s = S.addIdea(s, 'Project A', newId);
  s = S.addIdea(s, 'Project B', newId);
  assert.deepEqual(S.ideasIn(s.ideas, 'later').map(x => x.title), ['Project A', 'Project B']);
  s = S.moveIdea(s, s.ideas[0].id);
  assert.deepEqual(S.ideasIn(s.ideas, 'next').map(x => x.title), ['Project A']);
  s = S.moveIdea(s, s.ideas[0].id);
  assert.deepEqual(S.ideasIn(s.ideas, 'later').map(x => x.title), ['Project B', 'Project A'], 'a moved idea goes to the end');
  s = S.removeIdea(s, s.ideas[1].id);
  assert.equal(s.ideas.length, 1);
});

test('categories: add, rename, remove only when unused', () => {
  const newId = ids();
  let s = S.emptyState(newId);
  assert.equal(S.addCategory(s, 'college', newId), s, 'duplicate names are refused');
  s = S.addCategory(s, 'Hobbies', newId);
  const hobbies = s.categories.at(-1);
  assert.equal(hobbies.position, 4);
  s = S.renameCategory(s, hobbies.id, 'Side projects');
  assert.equal(s.categories.at(-1).name, 'Side projects');
  assert.equal(S.renameCategory(s, hobbies.id, 'Jobs'), s);
  s = S.addDeadline(s, { title: 'Project A', kind: '', category: hobbies.id, date: null }, newId);
  assert.equal(S.removeCategory(s, hobbies.id), s, 'in use');
  s = S.removeDeadline(s, s.deadlines[0].id);
  s = S.removeCategory(s, hobbies.id);
  assert.equal(s.categories.length, 4);
});

const ID = S.ID_PATTERN;
const allIds = state => ['categories', 'priorities', 'deadlines', 'tasks', 'thoughts', 'ideas'].flatMap(k => state[k].map(x => x.id));

test('import is forgiving about shape: no wrapper, shorthand and missing optional fields', () => {
  const newId = ids();
  const input = {
    categories: ['College', 'Jobs'],
    deadlines: [
      { id: 'd1', title: 'College A', category: 'College', dateLabel: '' },
      { id: 'd2', title: 'Job B', kind: null, category: 'jobs', date: '2026-11-01', dateLabel: null, approx: null },
    ],
    tasks: [{ id: 't1', deadlineId: 'd1', text: 'Essay' }, { deadlineId: 'd2', text: 'Résumé', done: true }],
    thoughts: ['A loose thought', { text: 'Dated', createdAt: '2026-10-20T12:00:00.000Z' }],
    ideas: [{ id: 'i1', title: 'Project A', note: null }, 'Project B'],
  };
  const result = S.validateImport(JSON.stringify(input), { newId, now: () => '2026-10-24T18:00:00.000Z' });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const s = result.state;
  assert.equal(s.format, 'hq-export');
  assert.equal(s.version, 1);
  assert.deepEqual(s.categories.map(c => [c.name, c.position]), [['College', 0], ['Jobs', 1]]);
  assert.deepEqual(s.priorities, []);
  const [a, b] = s.deadlines;
  assert.deepEqual([a.date, a.dateLabel, a.kind, a.approx, a.sortOrder, a.category], [null, null, '', false, 0, s.categories[0].id]);
  assert.deepEqual([b.date, b.dateLabel, b.kind, b.approx, b.sortOrder, b.category], ['2026-11-01', null, '', false, 1, s.categories[1].id]);
  assert.deepEqual(s.tasks.map(t => [t.deadlineId, t.done, t.position]), [['d1', false, 0], ['d2', true, 1]]);
  assert.deepEqual(s.thoughts.map(t => [t.text, t.createdAt]), [['A loose thought', '2026-10-24T18:00:00.000Z'], ['Dated', '2026-10-20T12:00:00.000Z']]);
  assert.deepEqual(s.ideas.map(x => [x.title, x.note, x.bucket, x.position]), [['Project A', '', 'later', 0], ['Project B', '', 'later', 1]]);
  for (const id of allIds(s)) assert.match(id, ID);
  assert.equal(new Set(allIds(s)).size, allIds(s).length);
  // The normalized state is a strict export: it validates again unchanged.
  assert.deepEqual(S.validateImport(S.toExport(s)).state, s);
});

test('import still refuses a wrong wrapper when one is given', () => {
  const data = seed();
  data.version = 2;
  assert.equal(S.validateImport(data).ok, false);
  delete data.version;
  assert.equal(S.validateImport(data).ok, true, 'a missing version reads as 1');
  delete data.format;
  assert.equal(S.validateImport(data).ok, true, 'a missing format reads as an HQ file');
});

test('ids that are unsafe in the DOM are replaced and every reference follows', () => {
  const newId = ids();
  const data = seed();
  data.categories[0].id = 'cat college';
  data.deadlines[0].id = 'dl one';
  data.deadlines[1].id = 42;
  const firstCat = seed().categories[0].id;
  for (const d of data.deadlines) if (d.category === firstCat) d.category = 'cat college';
  const tasksOf = id => seed().tasks.filter(t => t.deadlineId === id).length;
  const [d0, d1] = seed().deadlines.map(d => d.id);
  for (const t of data.tasks) { if (t.deadlineId === d0) t.deadlineId = 'dl one'; else if (t.deadlineId === d1) t.deadlineId = 42; }
  const result = S.validateImport(data, { newId });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const s = result.state;
  for (const id of allIds(s)) assert.match(id, ID);
  assert.equal(s.deadlines[1].id, '42', 'a numeric id is kept as text');
  assert.notEqual(s.deadlines[0].id, 'dl one');
  assert.equal(s.tasks.filter(t => t.deadlineId === s.deadlines[0].id).length, tasksOf(d0));
  assert.equal(s.tasks.filter(t => t.deadlineId === '42').length, tasksOf(d1));
  assert.ok(s.deadlines.filter(d => d.category === s.categories[0].id).length > 0);
  assert.ok(!s.deadlines.some(d => d.category === 'cat college'));
});

test('a long thought moved to the waitlist keeps all its text', () => {
  const newId = ids();
  const long = `Build a reading tracker that ${'remembers every page and every margin note '.repeat(20)}end.`;
  assert.ok(long.length > S.LIMITS.short);
  let s = S.emptyState(newId);
  s = S.addThought(s, long, '2026-10-24T10:00:00.000Z', newId);
  s = S.addThought(s, 'Short one', '2026-10-24T11:00:00.000Z', newId);
  s = S.thoughtToIdea(s, s.thoughts[0].id, newId);
  s = S.thoughtToIdea(s, s.thoughts[0].id, newId);
  assert.equal(s.thoughts.length, 0);
  const [a, b] = s.ideas;
  assert.equal(a.note, long, 'the full text is in the note');
  assert.ok(a.title.length <= S.LIMITS.ideaTitle + 1);
  assert.ok(a.title.endsWith('…'));
  assert.ok(long.startsWith(a.title.slice(0, -1)));
  assert.deepEqual([b.title, b.note], ['Short one', '']);
  assert.equal(S.validateImport(S.toExport(s)).ok, true);
});

test('splitIdeaText: first line as the title, cut at a word', () => {
  assert.deepEqual(S.splitIdeaText('  Short  '), { title: 'Short', note: '' });
  const lines = `Headline\n${'x '.repeat(150)}`;
  assert.deepEqual(S.splitIdeaText(lines), { title: 'Headline', note: lines.trim() });
  const noSpaces = 'y'.repeat(300);
  assert.equal(S.splitIdeaText(noSpaces).title, `${'y'.repeat(S.LIMITS.ideaTitle)}…`);
});

test('an imported idea title longer than the limit moves its text into the note', () => {
  const data = seed();
  const long = `Idea ${'word '.repeat(60)}`.trim();
  data.ideas[0].title = long;
  data.ideas[0].note = '';
  const result = S.validateImport(data);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.state.ideas[0].note, long);
  assert.ok(result.state.ideas[0].title.length <= S.LIMITS.ideaTitle + 1);
});

test('unreadable backups: one key per backup, listed, readable, removable, cleared', () => {
  const store = memoryStorage({ 'hq:v1': '{"version":2}', 'hq:v1:unreadable': 'legacy', other: 'kept' });
  assert.equal(S.backupUnreadable(store, '2026-10-24T18:00:00.000Z').ok, true);
  store.setItem('hq:v1', '{"version":3}');
  assert.equal(S.backupUnreadable(store, '2026-10-25T18:00:00.000Z').ok, true);
  const list = S.listBackups(store);
  assert.deepEqual(list.map(b => b.savedAt), [null, '2026-10-24T18:00:00.000Z', '2026-10-25T18:00:00.000Z']);
  assert.equal(S.readBackup(store, list[1].key), '{"version":2}');
  assert.equal(S.readBackup(store, list[2].key), '{"version":3}', 'a second backup does not overwrite the first');
  assert.equal(S.readBackup(store, 'other'), null, 'only backup keys are read');
  assert.equal(S.removeBackup(store, 'other'), false);
  assert.equal(S.removeBackup(store, list[0].key), true);
  assert.equal(S.listBackups(store).length, 2);
  assert.equal(S.clearStorage(store), true);
  assert.deepEqual([...store.data.keys()], ['other']);
  assert.deepEqual(S.backupUnreadable(memoryStorage(), 'x'), { ok: true, key: null }, 'nothing to keep');
  const full = memoryStorage({ 'hq:v1': 'old' });
  full.setItem = () => { throw new Error('full'); };
  assert.deepEqual(S.backupUnreadable(full, 'x'), { ok: false }, 'a failed copy is reported so the caller keeps the original');
  assert.deepEqual(S.listBackups({ getItem() { throw new Error('denied'); } }), []);
});
