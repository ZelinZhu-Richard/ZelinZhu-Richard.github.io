import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as S from '../store.js';
import { COLLECTIONS, HqCloud, diffState, isBlank } from '../sync.js';
import { withConnectSrc } from '../build.mjs';

const seed = S.validateImport(await readFile(new URL('../seed.example.json', import.meta.url), 'utf8')).state;
let n = 0;
const newId = () => `t${(n += 1)}`;

test('diffState: nothing changed → null', () => {
  assert.equal(diffState(seed, seed), null);
  assert.equal(diffState(seed, structuredClone(seed)), null);
});

test('diffState: adds, edits and removals become one change set in the export shape', () => {
  const d = seed.deadlines[0];
  let next = S.addThought(seed, 'Call the registrar', '2026-10-24T12:00:00.000Z', newId);
  next = S.updateDeadline(next, d.id, { title: 'Renamed deadline' });
  next = S.removeDeadline(next, seed.deadlines[1].id);
  const c = diffState(seed, next);
  assert.deepEqual(c.upsert.thoughts.map(t => t.text), ['Call the registrar']);
  assert.equal(c.upsert.deadlines.length, 1);
  assert.equal(c.upsert.deadlines[0].title, 'Renamed deadline');
  assert.ok('dateLabel' in c.upsert.deadlines[0] && 'sortOrder' in c.upsert.deadlines[0], 'rows use the export field names');
  assert.deepEqual(c.delete.deadlines, [seed.deadlines[1].id]);
  const orphaned = seed.tasks.filter(t => t.deadlineId === seed.deadlines[1].id).map(t => t.id);
  assert.deepEqual(c.delete.tasks ?? [], orphaned, "the removed deadline's tasks go too");
  for (const key of Object.keys(c.upsert)) assert.ok(COLLECTIONS.includes(key));
});

test('isBlank: only categories means nothing written yet', () => {
  assert.equal(isBlank(S.emptyState(newId)), true);
  assert.equal(isBlank(seed), false);
});

function fakeClient(script = {}) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      const step = script[name];
      if (typeof step === 'function') return step(args, calls.length);
      return step ?? { data: null, error: null };
    },
  };
}

test('HqCloud: saves go out in order as hq_apply; nothing to save sends nothing', async () => {
  const order = [];
  let release;
  const gate = new Promise(r => { release = r; });
  const client = fakeClient({
    hq_apply: async args => {
      if (!order.length) await gate; // the first write is slow
      order.push(args.changes.upsert.thoughts[0].text);
      return { data: null, error: null };
    },
  });
  const cloud = new HqCloud(client);
  const a = S.addThought(seed, 'first', '2026-10-24T12:00:00.000Z', newId);
  const b = S.addThought(a, 'second', '2026-10-24T12:01:00.000Z', newId);
  const p1 = cloud.save(seed, a);
  const p2 = cloud.save(a, b);
  release();
  assert.deepEqual(await Promise.all([p1, p2]), [true, true]);
  assert.deepEqual(order, ['first', 'second']);
  assert.equal(await cloud.save(b, b), false);
  assert.equal(client.calls.length, 2);
});

test('HqCloud: a refused write rejects without blocking the next one', async () => {
  let k = 0;
  const cloud = new HqCloud(fakeClient({ hq_apply: () => (k++ === 0 ? { data: null, error: { message: 'Not authorised', code: '42501' } } : { data: null, error: null }) }));
  const a = S.addThought(seed, 'x', '2026-10-24T12:00:00.000Z', newId);
  await assert.rejects(cloud.save(seed, a), err => err.code === '42501' && /Not authorised/.test(err.message));
  assert.equal(await cloud.save(a, S.addThought(a, 'y', '2026-10-24T12:02:00.000Z', newId)), true);
});

test('HqCloud: load validates the export; replace sends the export shape', async () => {
  const client = fakeClient({ hq_export: { data: S.toExport(seed), error: null }, is_owner: { data: true, error: null } });
  const cloud = new HqCloud(client);
  assert.equal(await cloud.isOwner(), true);
  assert.deepEqual(S.toExport(await cloud.load()), S.toExport(seed));
  await cloud.replace(seed);
  assert.deepEqual(client.calls.at(-1), { name: 'hq_replace', args: { data: S.toExport(seed) } });
  const broken = new HqCloud(fakeClient({ hq_export: { data: { deadlines: 'nope' }, error: null } }));
  await assert.rejects(broken.load(), /could not be read/);
});

test('build: with a Supabase project the CSP allows exactly its origin; without one, connect-src stays none', () => {
  const html = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; connect-src \'none\'; object-src \'none\'">';
  assert.equal(withConnectSrc(html, { url: '', anonKey: '' }), html);
  const out = withConnectSrc(html, { url: 'https://example-ref.supabase.co', anonKey: 'sb_publishable_x' });
  assert.match(out, /connect-src https:\/\/example-ref\.supabase\.co;/);
  assert.doesNotMatch(out, /connect-src 'none'/);
  assert.throws(() => withConnectSrc('<meta>', { url: 'https://example-ref.supabase.co', anonKey: 'k' }), /connect-src 'none'/);
});
