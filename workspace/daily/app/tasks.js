// List-setup defaults and the list editor's form reader. TaskDef follows engine/tasks.js
// normalizeTask: { id, name, type, physical, unit, chill (quantity), chillText (quality),
// tiers: { chill, easy, medium, hard, goddamn }, tierQty, noGoddamn, tag, receipt, purpose, goal }.
// The UI prefers engine/index.js DEFAULT_TASKS when it exists; this copy is the fallback.
export const DEFAULT_TASKS = [
  { id: 'sleep', name: 'Sleep', type: 'quality', physical: false, unit: 'hours', tag: 'sleep', receipt: 'sleep', purpose: "Protect tomorrow's focus.",
    tiers: { chill: '7 h of sleep', easy: '7.5 h of sleep', medium: '8 h, in bed by 23:30', hard: '8 h, in bed by 23:00', goddamn: '8.5 h, in bed by 22:30' }, tierQty: [7, 7.5, 8, 8, 8.5] },
  { id: 'grass', name: 'Touch grass', type: 'quantity', physical: false, unit: 'minutes', chill: 20, tag: 'outdoors', receipt: 'outside', purpose: 'Make room to think.' },
  { id: 'read', name: 'Read', type: 'quantity', physical: false, unit: 'pages', chill: 15, tag: 'study', receipt: 'pages', purpose: 'Build range.' },
  { id: 'veg', name: 'Eat vegetables', type: 'quality', physical: false, unit: 'servings', tag: 'food', receipt: 'veg', purpose: 'Take care of the engine.',
    tiers: { chill: '1 serving of vegetables', easy: '2 servings', medium: '3 servings', hard: '5 servings, 2 colours', goddamn: 'Vegetables at every meal, 3 colours' }, tierQty: [1, 2, 3, 5, 7] },
  { id: 'workout', name: 'Work out', type: 'quantity', physical: true, unit: 'minutes', chill: 15, tag: 'physical', receipt: 'workout', purpose: 'Build strength steadily.',
    tiers: { goddamn: 'Hard duration, intervals at race pace' } },
  { id: 'deep', name: 'Deep work', type: 'quantity', physical: false, unit: 'minutes', chill: 30, tag: 'study', receipt: 'deep', purpose: 'Move one important thing forward.' },
];

export const TIER_KEYS = ['chill', 'easy', 'medium', 'hard', 'goddamn'];
export const TIER_LABELS = ['Chill', 'Easy', 'Medium', 'Hard', 'Goddamn'];

// Reads the list editor's fields (named `task-<n>-<field>`) into TaskDefs. Hidden fields carry
// id/tag/receipt/purpose/tierQty through unchanged so defaults keep their patron tags, receipt kinds and
// per-tier amounts.
export const readTaskForm = form => readTaskFields(new FormData(form));

// The same from anything with get(name) (FormData, or a test's map).
export function readTaskFields(data) {
  const count = Number(data.get('count')) || 0;
  const tasks = [];
  const text = key => String(data.get(key) ?? '').trim();
  for (let i = 0; i < count; i += 1) {
    const p = `task-${i}`;
    const name = text(`${p}-name`);
    if (!name) continue;
    const type = text(`${p}-type`) === 'quality' ? 'quality' : 'quantity';
    const task = { name, type, physical: data.get(`${p}-physical`) === 'on' };
    if (data.get(`${p}-noGoddamn`) === 'on') task.noGoddamn = true;
    for (const k of ['id', 'tag', 'receipt', 'purpose', 'goal', 'unit']) if (text(`${p}-${k}`)) task[k] = text(`${p}-${k}`);
    if (type === 'quantity') task.chill = Number(text(`${p}-chill`)) || 0;
    const tiers = {};
    TIER_KEYS.forEach((k, n) => { const v = text(`${p}-tier-${n}`); if (v) tiers[k] = v; });
    if (Object.keys(tiers).length) task.tiers = tiers;
    const qty = text(`${p}-tierQty`).split(',').filter(Boolean).map(Number);
    if (qty.length === TIER_KEYS.length && qty.every(Number.isFinite)) task.tierQty = qty;
    tasks.push(task);
  }
  return tasks;
}
