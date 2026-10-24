// HQ data model, import/export validation and localStorage persistence.
// The stored value and the export file share one shape, so an export can be imported as is
// and the later Supabase tables are a straight copy of these arrays.
// Mutators are pure: they take a state and return a new one. Nothing here touches the DOM.

import { CONFIG, isDateKey, isMonthKey } from './helpers.js';

export const STORAGE_KEY = 'hq:v1';
export const UI_KEY = 'hq:v1:ui';
/** Unreadable stored data is kept under `${BACKUP_KEY}:<ISO time>` (older builds used BACKUP_KEY alone). */
export const BACKUP_KEY = 'hq:v1:unreadable';
export const FORMAT = 'hq-export';
export const VERSION = 1;
export const DEFAULT_CATEGORIES = Object.freeze(['College', 'Fellowships', 'Jobs', 'Research']);
export const LIMITS = Object.freeze({ bytes: 2_000_000, items: 5000, short: 200, long: 4000, label: 24, ideaTitle: 80 });

const COLLECTIONS = ['categories', 'priorities', 'deadlines', 'tasks', 'thoughts', 'ideas'];

let counter = 0;
export function makeId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* fall through */ }
  counter += 1;
  return `id-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyState(newId = makeId) {
  return {
    format: FORMAT, version: VERSION,
    categories: DEFAULT_CATEGORIES.map((name, position) => ({ id: newId(), name, position })),
    priorities: [], deadlines: [], tasks: [], thoughts: [], ideas: [],
  };
}

// ---------- validation ----------

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = v => Number.isInteger(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const missing = v => v === undefined || v === null;
/** Ids end up in DOM ids, aria-controls and label `for`, so only these characters are kept. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
// Shorthand an import may use: a plain string stands for one of these objects.
const SHORTHAND = { categories: name => ({ name }), thoughts: text => ({ text }), ideas: title => ({ title }) };

/**
 * Validates an export (string or parsed object). Never partial: returns either
 * { ok: true, state } with a normalized copy, or { ok: false, errors } with readable messages.
 *
 * Forgiving about shape, strict about meaning:
 * - the "format"/"version" wrapper may be missing (read as version 1); a wrong one is refused;
 * - a missing or null collection is empty; categories, thoughts and ideas may be plain strings;
 * - a missing id is generated, and an id with characters outside ID_PATTERN is replaced
 *   (references to it are rewritten); a missing position/sortOrder is the item's index;
 * - missing or null optional fields take their defaults: date, dateLabel → null (also for ""),
 *   kind, note, priority text → "", approx, done → false, bucket → "later", createdAt → now;
 * - deadlines[].category may name a category by id or by name; it is normalized to the id;
 * - an idea title longer than LIMITS.short with no note is split like a long thought.
 */
export function validateImport(input, { newId = makeId, now = () => new Date().toISOString() } = {}) {
  const errors = [];
  let data = input;
  if (typeof input === 'string') {
    if (input.length > LIMITS.bytes) return { ok: false, errors: ['The file is larger than 2 MB.'] };
    try { data = JSON.parse(input); } catch { return { ok: false, errors: ['The file is not valid JSON.'] }; }
  }
  if (!isObj(data)) return { ok: false, errors: ['Expected a JSON object.'] };
  if (!missing(data.format) && data.format !== FORMAT) errors.push(`"format" must be "${FORMAT}".`);
  if (!missing(data.version) && data.version !== VERSION) errors.push(`"version" must be ${VERSION}.`);
  if (missing(data.format) && !COLLECTIONS.some(key => key in data)) errors.push(`Not an HQ file: none of ${COLLECTIONS.join(', ')} is present.`);
  const lists = {};
  for (const key of COLLECTIONS) {
    const list = data[key] ?? [];
    if (!Array.isArray(list)) errors.push(`"${key}" must be an array.`);
    else if (list.length > LIMITS.items) errors.push(`"${key}" has more than ${LIMITS.items} items.`);
    else lists[key] = list.map(x => (typeof x === 'string' && SHORTHAND[key] ? SHORTHAND[key](x) : x));
  }
  if (errors.length) return { ok: false, errors };

  const at = (key, i) => `${key}[${i}]`;
  const str = (v, where, field, { max = LIMITS.short, empty = false } = {}) => {
    if (typeof v !== 'string') { errors.push(`${where}.${field} must be text.`); return ''; }
    if (!empty && !v.trim()) { errors.push(`${where}.${field} must not be empty.`); return ''; }
    if (v.length > max) { errors.push(`${where}.${field} is longer than ${max} characters.`); return ''; }
    return v;
  };
  const optStr = (v, where, field, max) => (missing(v) ? '' : str(v, where, field, { empty: true, max }).trim());
  const bool = (v, where, field) => {
    if (missing(v)) return false;
    if (typeof v !== 'boolean') errors.push(`${where}.${field} must be true or false.`);
    return v === true;
  };
  const num = (v, where, field, fallback) => {
    if (missing(v)) return fallback;
    if (!isNum(v)) errors.push(`${where}.${field} must be a number.`);
    return isNum(v) ? v : 0;
  };

  // Ids: check every original id first, then generate or replace where needed.
  const remap = {};
  for (const key of COLLECTIONS) {
    const seen = new Set();
    const originals = lists[key].map((x, i) => {
      if (!isObj(x)) { errors.push(`${at(key, i)} must be an object.`); return null; }
      if (missing(x.id) || x.id === '') return null;
      const id = typeof x.id === 'number' && Number.isFinite(x.id) ? String(x.id) : x.id;
      if (typeof id !== 'string' || !id.trim() || id.length > 100) { errors.push(`${at(key, i)}.id must be text of at most 100 characters.`); return null; }
      if (seen.has(id)) errors.push(`${at(key, i)}.id "${id}" is used twice.`);
      seen.add(id);
      return id;
    });
    const taken = new Set(originals.filter(id => id && ID_PATTERN.test(id)));
    const fresh = () => { let id; do id = newId(); while (taken.has(id) || !ID_PATTERN.test(id)); taken.add(id); return id; };
    remap[key] = new Map();
    lists[key] = lists[key].map((x, i) => {
      if (!isObj(x)) return x;
      const original = originals[i];
      const id = original && ID_PATTERN.test(original) ? original : fresh();
      if (original) remap[key].set(original, id);
      return { ...x, id };
    });
  }
  if (errors.length) return { ok: false, errors };
  const ref = (key, v) => remap[key].get(typeof v === 'number' ? String(v) : v);

  const categories = lists.categories.map((c, i) => ({ id: c.id, name: str(c.name, at('categories', i), 'name', { max: 40 }).trim(), position: num(c.position, at('categories', i), 'position', i) }));
  const names = new Set();
  categories.forEach((c, i) => { const k = c.name.toLowerCase(); if (k && names.has(k)) errors.push(`categories[${i}].name "${c.name}" is used twice.`); names.add(k); });
  const byName = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

  const slotKeys = new Set();
  const priorities = lists.priorities.map((p, i) => {
    const w = at('priorities', i);
    const scope = p.scope;
    if (scope !== 'today' && scope !== 'month') errors.push(`${w}.scope must be "today" or "month".`);
    if (scope === 'today' && !isDateKey(p.period)) errors.push(`${w}.period must be a date (YYYY-MM-DD) for a today priority.`);
    if (scope === 'month' && !isMonthKey(p.period)) errors.push(`${w}.period must be a month (YYYY-MM) for a month priority.`);
    const max = CONFIG.slots[scope] || 5;
    if (!isInt(p.slot) || p.slot < 1 || p.slot > max) errors.push(`${w}.slot must be a whole number from 1 to ${max}.`);
    const k = `${scope}|${p.period}|${p.slot}`;
    if (slotKeys.has(k)) errors.push(`${w} repeats slot ${p.slot} of ${p.period}.`);
    slotKeys.add(k);
    return { id: p.id, scope, period: p.period, slot: p.slot, text: optStr(p.text, w, 'text', LIMITS.long), done: bool(p.done, w, 'done') };
  });

  const deadlines = lists.deadlines.map((d, i) => {
    const w = at('deadlines', i);
    const catKey = typeof d.category === 'number' ? String(d.category) : typeof d.category === 'string' ? d.category : '';
    const category = ref('categories', catKey) || byName.get(catKey.trim().toLowerCase());
    if (!category) errors.push(`${w}.category "${catKey}" is not one of the categories.`);
    const date = missing(d.date) || d.date === '' ? null : d.date;
    if (date !== null && !isDateKey(date)) errors.push(`${w}.date must be a real date (YYYY-MM-DD) or null.`);
    return {
      id: d.id, title: str(d.title, w, 'title').trim(), kind: optStr(d.kind, w, 'kind', LIMITS.short),
      category, date, approx: bool(d.approx, w, 'approx'), dateLabel: optStr(d.dateLabel, w, 'dateLabel', LIMITS.label) || null,
      sortOrder: num(d.sortOrder, w, 'sortOrder', i),
    };
  });

  const tasks = lists.tasks.map((t, i) => {
    const w = at('tasks', i);
    const deadlineId = ref('deadlines', t.deadlineId);
    if (!deadlineId) errors.push(`${w}.deadlineId "${t.deadlineId}" does not match a deadline.`);
    return { id: t.id, deadlineId, text: str(t.text, w, 'text', { max: LIMITS.long }).trim(), done: bool(t.done, w, 'done'), position: num(t.position, w, 'position', i) };
  });

  const thoughts = lists.thoughts.map((t, i) => {
    const w = at('thoughts', i);
    const createdAt = missing(t.createdAt) ? now() : t.createdAt;
    const ok = typeof createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(createdAt) && !Number.isNaN(Date.parse(createdAt));
    if (!ok) errors.push(`${w}.createdAt must be an ISO timestamp.`);
    return { id: t.id, text: str(t.text, w, 'text', { max: LIMITS.long }).trim(), createdAt };
  });

  const ideas = lists.ideas.map((x, i) => {
    const w = at('ideas', i);
    const bucket = missing(x.bucket) ? 'later' : x.bucket;
    if (bucket !== 'next' && bucket !== 'later') errors.push(`${w}.bucket must be "next" or "later".`);
    let title;
    let note = optStr(x.note, w, 'note', LIMITS.long);
    const longTitle = typeof x.title === 'string' && x.title.trim().length > LIMITS.short && x.title.length <= LIMITS.long;
    if (longTitle && !note) ({ title, note } = splitIdeaText(x.title));
    else title = str(x.title, w, 'title').trim();
    return { id: x.id, title, note, bucket, position: num(x.position, w, 'position', i) };
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, state: { format: FORMAT, version: VERSION, categories, priorities, deadlines, tasks, thoughts, ideas } };
}

/** The export object, field order fixed. */
export function toExport(state) {
  return {
    format: FORMAT, version: VERSION,
    categories: state.categories.map(({ id, name, position }) => ({ id, name, position })),
    priorities: state.priorities.map(({ id, scope, period, slot, text, done }) => ({ id, scope, period, slot, text, done })),
    deadlines: state.deadlines.map(({ id, title, kind, category, date, approx, dateLabel, sortOrder }) => ({ id, title, kind, category, date, approx, dateLabel, sortOrder })),
    tasks: state.tasks.map(({ id, deadlineId, text, done, position }) => ({ id, deadlineId, text, done, position })),
    thoughts: state.thoughts.map(({ id, text, createdAt }) => ({ id, text, createdAt })),
    ideas: state.ideas.map(({ id, title, note, bucket, position }) => ({ id, title, note, bucket, position })),
  };
}

// ---------- storage (every access wrapped) ----------

/** { status: 'empty' } | { status: 'ok', state } | { status: 'invalid', errors } | { status: 'unavailable' } */
export function readStorage(storage) {
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return { status: 'unavailable' }; }
  if (raw === null || raw === undefined) return { status: 'empty' };
  const result = validateImport(raw);
  return result.ok ? { status: 'ok', state: result.state } : { status: 'invalid', errors: result.errors };
}

export function writeStorage(storage, state) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(toExport(state))); return { ok: true }; }
  catch (error) { return { ok: false, error: error?.name === 'QuotaExceededError' ? 'This browser’s storage is full.' : 'This browser would not save.' }; }
}

/**
 * Keeps an unreadable stored value aside, under its own timestamped key, before it is replaced.
 * { ok: true, key } (key is null when there was nothing to keep) | { ok: false } when the copy
 * could not be written: the caller must then not overwrite the stored value.
 */
export function backupUnreadable(storage, stamp = new Date().toISOString()) {
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return { ok: true, key: null }; }
  if (raw === null || raw === undefined) return { ok: true, key: null };
  const key = `${BACKUP_KEY}:${stamp}`;
  try { storage.setItem(key, raw); return { ok: true, key }; } catch { return { ok: false }; }
}

const isBackupKey = key => typeof key === 'string' && (key === BACKUP_KEY || key.startsWith(`${BACKUP_KEY}:`));

/** Every kept copy, oldest first: [{ key, savedAt }] (savedAt is null for the old single slot). */
export function listBackups(storage) {
  const keys = [];
  try { for (let i = 0; i < storage.length; i += 1) { const key = storage.key(i); if (isBackupKey(key)) keys.push(key); } } catch { return []; }
  return keys.sort().map(key => ({ key, savedAt: key === BACKUP_KEY ? null : key.slice(BACKUP_KEY.length + 1) }));
}
export function readBackup(storage, key) {
  if (!isBackupKey(key)) return null;
  try { return storage.getItem(key); } catch { return null; }
}
export function removeBackup(storage, key) {
  if (!isBackupKey(key)) return false;
  try { storage.removeItem(key); return true; } catch { return false; }
}

export function clearStorage(storage) {
  let ok = true;
  for (const key of [STORAGE_KEY, UI_KEY, BACKUP_KEY, ...listBackups(storage).map(b => b.key)]) { try { storage.removeItem(key); } catch { ok = false; } }
  return ok;
}

export function readUi(storage) {
  try { const v = JSON.parse(storage.getItem(UI_KEY) || '{}'); return isObj(v) ? v : {}; } catch { return {}; }
}
export function writeUi(storage, ui) {
  try { storage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* a convenience only */ }
}

// ---------- mutators (pure) ----------

const nextNumber = (list, field) => list.reduce((m, x) => Math.max(m, x[field]), -1) + 1;
const clip = (text, max = LIMITS.long) => String(text ?? '').trim().slice(0, max);

/** Sets text and/or done on a priority slot. An empty, unticked slot is removed. */
export function setPriority(state, { scope, period, slot, text, done }, newId = makeId) {
  const existing = state.priorities.find(p => p.scope === scope && p.period === period && p.slot === slot);
  const next = { id: existing?.id || newId(), scope, period, slot, text: text === undefined ? existing?.text ?? '' : clip(text), done: done === undefined ? existing?.done ?? false : !!done };
  const rest = state.priorities.filter(p => p !== existing);
  return { ...state, priorities: !next.text && !next.done ? rest : [...rest, next] };
}

/** Fills empty slots of the current period with carried-over texts, in order. */
export function carryOver(state, scope, period, texts, newId = makeId) {
  let s = state;
  const taken = new Set(state.priorities.filter(p => p.scope === scope && p.period === period && (p.text || p.done)).map(p => p.slot));
  const queue = [...texts];
  for (let slot = 1; slot <= CONFIG.slots[scope] && queue.length; slot += 1) if (!taken.has(slot)) s = setPriority(s, { scope, period, slot, text: queue.shift(), done: false }, newId);
  return s;
}

export function deadlineErrors(fields, categories) {
  const errors = [];
  if (!clip(fields.title, LIMITS.short)) errors.push('Give it a title.');
  if (!categories.some(c => c.id === fields.category)) errors.push('Pick a category.');
  if (fields.date !== null && !isDateKey(fields.date)) errors.push('Pick a date, or choose “No date”.');
  if (fields.dateLabel && fields.dateLabel.trim().length > LIMITS.label) errors.push(`Keep the date label under ${LIMITS.label} characters.`);
  return errors;
}

const deadlineFields = f => ({ title: clip(f.title, LIMITS.short), kind: clip(f.kind, LIMITS.short), category: f.category, date: f.date || null, approx: !!f.approx, dateLabel: clip(f.dateLabel, LIMITS.label).toUpperCase() || null });

export function addDeadline(state, fields, newId = makeId) {
  const d = { id: newId(), ...deadlineFields(fields), sortOrder: nextNumber(state.deadlines, 'sortOrder') };
  return { ...state, deadlines: [...state.deadlines, d] };
}
export function updateDeadline(state, id, fields) {
  return { ...state, deadlines: state.deadlines.map(d => (d.id === id ? { ...d, ...deadlineFields({ ...d, ...fields }) } : d)) };
}
export function removeDeadline(state, id) {
  return { ...state, deadlines: state.deadlines.filter(d => d.id !== id), tasks: state.tasks.filter(t => t.deadlineId !== id) };
}

export function addTask(state, deadlineId, text, newId = makeId) {
  const t = clip(text);
  if (!t || !state.deadlines.some(d => d.id === deadlineId)) return state;
  const position = nextNumber(state.tasks.filter(x => x.deadlineId === deadlineId), 'position');
  return { ...state, tasks: [...state.tasks, { id: newId(), deadlineId, text: t, done: false, position }] };
}
export const toggleTask = (state, id) => ({ ...state, tasks: state.tasks.map(t => (t.id === id ? { ...t, done: !t.done } : t)) });
export const removeTask = (state, id) => ({ ...state, tasks: state.tasks.filter(t => t.id !== id) });

export function addThought(state, text, createdAt, newId = makeId) {
  const t = clip(text);
  return t ? { ...state, thoughts: [...state.thoughts, { id: newId(), text: t, createdAt }] } : state;
}
export const removeThought = (state, id) => ({ ...state, thoughts: state.thoughts.filter(t => t.id !== id) });
/** Newest first. */
export const thoughtsNewestFirst = thoughts => [...thoughts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

export function thoughtToTask(state, thoughtId, deadlineId, newId = makeId) {
  const thought = state.thoughts.find(t => t.id === thoughtId);
  if (!thought || !state.deadlines.some(d => d.id === deadlineId)) return state;
  return removeThought(addTask(state, deadlineId, thought.text, newId), thoughtId);
}
/** Moves a thought to Later. A thought too long for a title keeps all its text in the note. */
export function thoughtToIdea(state, thoughtId, newId = makeId) {
  const thought = state.thoughts.find(t => t.id === thoughtId);
  if (!thought) return state;
  const { title, note } = splitIdeaText(thought.text);
  const next = addIdea(state, title, newId, note);
  return next === state ? state : removeThought(next, thoughtId);
}

/**
 * { title, note } for an idea made from free text. Text that fits LIMITS.short is the title;
 * longer text keeps all of it in the note, and the title is its first line, cut at a word
 * boundary near LIMITS.ideaTitle characters.
 */
export function splitIdeaText(text) {
  const t = clip(text);
  if (t.length <= LIMITS.short) return { title: t, note: '' };
  const first = t.split(/\r?\n/)[0].trim();
  if (first.length <= LIMITS.ideaTitle) return { title: first, note: t };
  const cut = first.slice(0, LIMITS.ideaTitle);
  const space = cut.lastIndexOf(' ');
  return { title: `${(space >= LIMITS.ideaTitle / 2 ? cut.slice(0, space) : cut).trimEnd()}…`, note: t };
}

export function addIdea(state, title, newId = makeId, note = '') {
  const t = clip(title, LIMITS.short);
  if (!t) return state;
  return { ...state, ideas: [...state.ideas, { id: newId(), title: t, note: clip(note), bucket: 'later', position: nextNumber(state.ideas, 'position') }] };
}
export function moveIdea(state, id) {
  const position = nextNumber(state.ideas, 'position');
  return { ...state, ideas: state.ideas.map(x => (x.id === id ? { ...x, bucket: x.bucket === 'next' ? 'later' : 'next', position } : x)) };
}
export const removeIdea = (state, id) => ({ ...state, ideas: state.ideas.filter(x => x.id !== id) });
export const ideasIn = (ideas, bucket) => ideas.filter(x => x.bucket === bucket).sort((a, b) => a.position - b.position);

export function addCategory(state, name, newId = makeId) {
  const n = clip(name, 40);
  if (!n || state.categories.some(c => c.name.toLowerCase() === n.toLowerCase())) return state;
  return { ...state, categories: [...state.categories, { id: newId(), name: n, position: nextNumber(state.categories, 'position') }] };
}
export function renameCategory(state, id, name) {
  const n = clip(name, 40);
  if (!n || state.categories.some(c => c.id !== id && c.name.toLowerCase() === n.toLowerCase())) return state;
  return { ...state, categories: state.categories.map(c => (c.id === id ? { ...c, name: n } : c)) };
}
/** Removes a category only when no deadline uses it. */
export function removeCategory(state, id) {
  if (state.deadlines.some(d => d.category === id)) return state;
  return { ...state, categories: state.categories.filter(c => c.id !== id) };
}
export const sortedCategories = categories => [...categories].sort((a, b) => a.position - b.position);
