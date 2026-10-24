// HQ in Supabase mode: the cloud copy of the six collections (owner-only RLS, migration
// workspace/daily/supabase/migrations/20261024120100_hq.sql). diffState() is pure: it turns two states into
// one change set. HqCloud speaks the hq_export / hq_apply / hq_replace RPCs, which all use the export shape,
// so the local store's mutators and validation are reused unchanged.

import { toExport, validateImport } from './store.js';

export const COLLECTIONS = Object.freeze(['categories', 'priorities', 'deadlines', 'tasks', 'thoughts', 'ideas']);

/** { delete: { collection: [ids] }, upsert: { collection: [export rows] } } from prev to next; null when equal. */
export function diffState(prev, next) {
  const a = toExport(prev);
  const b = toExport(next);
  const changes = { delete: {}, upsert: {} };
  let changed = false;
  for (const key of COLLECTIONS) {
    const before = new Map(a[key].map(row => [row.id, JSON.stringify(row)]));
    const kept = new Set(b[key].map(row => row.id));
    const gone = [...before.keys()].filter(id => !kept.has(id));
    const put = b[key].filter(row => before.get(row.id) !== JSON.stringify(row));
    if (gone.length) { changes.delete[key] = gone; changed = true; }
    if (put.length) { changes.upsert[key] = put; changed = true; }
  }
  return changed ? changes : null;
}

/** Nothing the owner wrote yet: every collection empty except categories (every new HQ starts with four). */
export const isBlank = state => COLLECTIONS.every(key => key === 'categories' || !state[key].length);

export class HqCloud {
  constructor(client) {
    this.client = client;
    this.queue = Promise.resolve(); // writes go out one at a time, in order
  }

  async rpc(name, args) {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw Object.assign(new Error(error.message || 'The cloud refused the change.'), { code: error.code });
    return data;
  }

  async isOwner() { return (await this.rpc('is_owner')) === true; }

  /** Everything, validated like an import file. */
  async load() {
    const result = validateImport(await this.rpc('hq_export'));
    if (!result.ok) throw new Error(`The cloud copy could not be read: ${result.errors[0]}`);
    return result.state;
  }

  enqueue(fn) {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {});
    return run;
  }

  /** Stores the difference between two states. Resolves false when there was nothing to store. */
  save(prev, next) {
    const changes = diffState(prev, next);
    if (!changes) return Promise.resolve(false);
    return this.enqueue(() => this.rpc('hq_apply', { changes })).then(() => true);
  }

  /** Replaces everything (first upload of this device's data). */
  replace(state) {
    return this.enqueue(() => this.rpc('hq_replace', { data: toExport(state) }));
  }

  /** Resolves once every queued write has finished (successfully or not). */
  settled() { return this.queue; }
}
