// Round trip against a running local Supabase (`npm run test:db`; outside `npm test`). Start the stack first:
//   DAILY_CRON_SECRET=<any 16+ characters> supabase start --workdir workspace/daily
// and run the tests with the same DAILY_CRON_SECRET in the environment. Needs Docker and the Supabase CLI.
// WARNING: wipes the local Daily/HQ tables and the *@daily.test users first. Never point it at a hosted project.
//
// Covers: RLS (anon reads only the public snapshot and the config; a signed-in stranger reads and writes no
// hq_* or game table), the owner's HQ round trip through hq_replace/hq_apply/hq_export, the game through the
// browser's own SupabaseBackend (create, act, refusals, stale versions, the RNG log, the sanitized public view),
// importing a local-first save, correcting the locked list (list/edit), day-close, remind, generate-variants, and the pg_cron → Vault → pg_net path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as E from '../../engine/index.js';
import * as S from '../../../hq/store.js';
import { HqCloud, diffState } from '../../../hq/sync.js';
import { CloudPublicBackend, SupabaseBackend } from '../../app/cloud.js';
import { verifyVendor } from '../../build.mjs';

const dailyDir = fileURLToPath(new URL('../..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const CRON = process.env.DAILY_CRON_SECRET || '';
const DB_CONTAINER = 'supabase_db_daily'; // supabase_db_<project_id from config.toml>

function status() {
  const r = spawnSync('supabase', ['status', '-o', 'json', '--workdir', 'workspace/daily'], { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`Local Supabase is not running. Start it with: DAILY_CRON_SECRET=… supabase start --workdir workspace/daily\n${r.stderr}`);
  const s = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(s.API_URL)) throw new Error(`Refusing to run against ${s.API_URL}: local stacks only.`);
  return s;
}

function sql(text) {
  const r = spawnSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A'], { input: text, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

const st = status();
const API = st.API_URL;
const ANON = st.ANON_KEY;
const SERVICE = st.SERVICE_ROLE_KEY;
const cloud = { url: API, anonKey: ANON };
// The browser's own vendored supabase-js (a classic script defining `supabase`), evaluated only after its
// bytes match the pinned sha256 in vendor/manifest.json.
await verifyVendor();
const lib = new Function(`${await readFile(new URL('../../vendor/supabase.js', import.meta.url), 'utf8')}\nreturn supabase;`)();
const client = (key = ANON) => lib.createClient(API, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const admin = client(SERVICE);
const anon = client();

const fn = async (name, { token, body = {}, headers = {} } = {}) => {
  const res = await fetch(`${API}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

async function user(email) {
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = client();
  const signed = await c.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client: c, token: signed.data.session.access_token };
}

let owner;
let stranger;
const seed = S.validateImport(await readFile(new URL('../../../hq/seed.example.json', import.meta.url), 'utf8')).state;

test.before(async () => {
  // Replica mode only to get past the append-only trigger on the log; everything else keeps its FK cascades.
  sql(`set session_replication_role = replica; delete from public.game_events; set session_replication_role = origin;
    delete from public.game_state; delete from public.game_public; delete from public.task_lists; delete from public.reminder_log;
    delete from public.hq_tasks; delete from public.hq_priorities; delete from public.hq_thoughts;
    delete from public.hq_ideas; delete from public.hq_deadlines; delete from public.hq_categories;
    delete from private.app_owner; delete from auth.users where email like '%@daily.test';`);
  owner = await user('owner@daily.test');
  stranger = await user('stranger@daily.test');
  sql(`insert into private.app_owner (user_id, note) values ('${owner.id}', 'test:db');`);
});

const HQ_TABLES = ['hq_categories', 'hq_priorities', 'hq_deadlines', 'hq_tasks', 'hq_thoughts', 'hq_ideas'];
const PRIVATE_GAME = ['game_state', 'game_events', 'task_lists', 'reminder_log'];

test('owner: HQ round trip through hq_replace, hq_apply and hq_export', async () => {
  const hq = new HqCloud(owner.client);
  assert.equal(await hq.isOwner(), true);
  await hq.replace(seed);
  assert.equal(diffState(seed, await hq.load()), null, 'export → cloud → export is a straight copy (row order aside)');
  const next = S.removeDeadline(S.addThought(seed, 'Call the registrar', '2026-10-24T12:00:00.000Z'), seed.deadlines[1].id);
  assert.equal(await hq.save(seed, next), true);
  const back = await hq.load();
  assert.equal(diffState(next, back), null, 'one change set lands exactly');
  const d = next.deadlines[0];
  const moved = S.setPriority(S.setPriority(next, { scope: 'today', period: '2026-10-24', slot: 1, text: 'A' }), { scope: 'today', period: '2026-10-24', slot: 2, text: 'B' });
  await hq.save(next, moved);
  assert.equal(diffState(moved, await hq.load()), null, 'priority slots (a deferred unique key) save in one change set');
  assert.ok(back.deadlines.some(x => x.id === d.id));
});

test('anon reads nothing private; only the public snapshot and the config', async () => {
  for (const t of [...HQ_TABLES, ...PRIVATE_GAME]) {
    const { data, error } = await anon.from(t).select('*');
    assert.ok(error || data.length === 0, `anon read ${t}`);
    const ins = await anon.from(t).insert({ id: 'x' });
    assert.ok(ins.error, `anon wrote ${t}`);
  }
  for (const rpc of ['hq_export', 'is_owner']) assert.ok((await anon.rpc(rpc)).error, `anon called ${rpc}`);
  assert.ok((await anon.rpc('hq_replace', { data: {} })).error);
  assert.ok((await anon.rpc('daily_commit', { p_expected: 1, p_state: {}, p_config_hash: 'x', p_event: {}, p_snapshot: {}, p_lists: [] })).error, 'only the service role commits');
  for (const t of ['game_public', 'game_config']) assert.ok((await anon.from(t).update({ updated_at: new Date().toISOString() }).eq('id', 1)).error, `anon updated ${t}`);
  const cfg = await anon.from('game_config').select('hash');
  assert.equal(cfg.error, null);
  assert.equal(await (await fetch(`${API}/functions/v1/game-action`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: '{"op":"load"}' })).status, 401);
});

test('a signed-in stranger reads and writes no HQ or game data', async () => {
  const c = stranger.client;
  assert.equal((await c.rpc('is_owner')).data, false);
  for (const t of [...HQ_TABLES, ...PRIVATE_GAME]) {
    const { data, error } = await c.from(t).select('*');
    assert.ok(error || data.length === 0, `stranger read ${t}`);
  }
  const exp = await c.rpc('hq_export');
  assert.ok(exp.error || ['deadlines', 'tasks', 'thoughts', 'ideas', 'priorities', 'categories'].every(k => exp.data[k].length === 0), 'hq_export shows a stranger nothing');
  assert.match((await c.rpc('hq_apply', { changes: { upsert: { thoughts: [{ id: 'x1', text: 'hi', createdAt: '2026-10-24T00:00:00Z' }] } } })).error?.message || '', /Not authorised/);
  assert.match((await c.rpc('hq_replace', { data: {} })).error?.message || '', /Not authorised/);
  assert.ok((await c.from('hq_thoughts').insert({ id: 'x2', text: 'hi', created_at: new Date().toISOString() })).error, 'RLS blocks a direct insert');
  assert.equal((await c.from('hq_deadlines').delete().neq('id', '')).data?.length ?? 0, 0);
  assert.equal((await new HqCloud(owner.client).load()).deadlines.length > 0, true, "the owner's rows are untouched");
  for (const name of ['game-action', 'generate-variants']) assert.equal((await fn(name, { token: stranger.token, body: { op: 'load', task: { name: 'x', type: 'quality' } } })).status, 403, `${name} refuses a stranger`);
});

test('owner: the game through the browser backend (create, act, refusals, stale versions, RNG log, public view)', async () => {
  const b = new SupabaseBackend(E, { cloud, getToken: async () => owner.token });
  await b.init();
  assert.equal(b.hasGame, false);
  await b.create(E.DEFAULT_TASKS);
  assert.equal(b.version, 1);
  assert.deepEqual(b.state.rng.seed, [0, 0, 0, 0], 'the seed never reaches the browser');
  assert.equal(b.rulesMismatch, false, 'browser and server run the same rules');

  const egg = E.viewEggs(b.state).petEggs[0];
  const hatched = await b.act({ type: 'petEgg/hatch', petEggId: egg.id });
  assert.ok(hatched.events.some(e => e.type === 'petEgg.hatched'));
  assert.equal(b.version, 2);
  assert.equal(b.state.pets.length, 1);

  await assert.rejects(b.act({ type: 'pet/rename', petId: 'nope', name: 'X' }), err => err.code === 'no_pet' && err.status === 400);
  assert.equal(b.version, 2, 'a refusal changes nothing');

  const stale = await fn('game-action', { token: owner.token, body: { op: 'act', version: 1, action: { type: 'settings/save', settings: { sound: true } } } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'stale');
  assert.equal(stale.body.version, 2);

  const log = await owner.client.from('game_events').select('source, ok, error, action, rng, events, version').order('id');
  assert.equal(log.error, null);
  assert.deepEqual(log.data.map(r => [r.source, r.ok]), [['create', true], ['action', true], ['action', false]]);
  const hatch = log.data[1];
  assert.ok(hatch.rng.to > hatch.rng.from && hatch.rng.draws.length === hatch.rng.to - hatch.rng.from, 'every draw of the hatch is logged');
  assert.equal(log.data[2].error.code, 'no_pet', 'the refusal is logged with its reason');
  assert.ok((await owner.client.from('game_events').update({ ok: false }).eq('version', 1)).error, 'the owner cannot rewrite the log');
  assert.match(sql(`do $$ begin delete from public.game_events; exception when others then raise notice '%', sqlerrm; end $$; select count(*) from public.game_events;`), /^3$/, 'the log is append-only, even for postgres');

  const raw = await owner.client.from('game_state').select('*');
  assert.ok(raw.error || raw.data.length === 0, 'even the owner reads the raw state (and its seed) only through game-action');
  const lists = await owner.client.from('task_lists').select('month, locked_at');
  assert.equal(lists.data.length, 1);
  assert.ok(lists.data[0].locked_at);

  const pub = new CloudPublicBackend({ cloud });
  await pub.load();
  assert.equal(pub.source, 'cloud');
  const text = JSON.stringify(pub.snapshot);
  assert.equal(pub.snapshot.format, 'daily-public');
  assert.equal(pub.snapshot.pets.active.length, 1);
  assert.doesNotMatch(text, /"seed"|"settings"|"redemptions"|"goal"/, 'the public snapshot is sanitized');
  assert.equal((await stranger.client.from('daily_public').select('snapshot')).data.length, 1);
});

test('owner: importing a local-first save replaces the cloud game with a fresh server seed', async () => {
  const b = new SupabaseBackend(E, { cloud, getToken: async () => owner.token });
  await b.init();
  const local = E.newGame({ seed: [1, 2, 3, 4], now: Date.now() - 3 * 86400e3, tasks: E.DEFAULT_TASKS });
  await b.importJson(JSON.stringify(local));
  assert.equal(b.state.createdAt, local.createdAt);
  assert.deepEqual(b.state.rng.seed, [0, 0, 0, 0]);
  const seedRow = sql("select state->'rng'->'seed' from public.game_state");
  assert.notEqual(seedRow.replace(/\s/g, ''), '[1,2,3,4]', 'the browser-made seed is replaced');
  const last = await owner.client.from('game_events').select('source, action').order('id', { ascending: false }).limit(1);
  assert.deepEqual([last.data[0].source, last.data[0].action.reseeded, last.data[0].action.replaced], ['import', true, true]);
  const refused = await fn('game-action', { token: owner.token, body: { op: 'import', save: { format: 'nope' }, replace: true, version: b.version } });
  assert.equal(refused.status, 400);
});

test('owner: list/edit corrects the locked list on the server and logs it in game_events', async () => {
  const b = new SupabaseBackend(E, { cloud, getToken: async () => owner.token });
  await b.init();
  const workout = b.state.list.tasks.find(t => t.id === 'workout');
  const version = b.version;
  const r = await b.act({ type: 'list/edit', taskId: 'workout', task: { ...workout, noGoddamn: true }, reason: 'Workouts have no Goddamn tier' });
  assert.ok(r.events.some(e => e.type === 'list.edited' && e.taskId === 'workout'));
  assert.equal(b.version, version + 1);
  assert.equal(b.state.list.tasks.find(t => t.id === 'workout').noGoddamn, true);
  const read = b.state.list.tasks.find(t => t.id === 'read');
  await assert.rejects(b.act({ type: 'list/edit', taskId: 'read', task: { ...read, chill: 1 }, reason: 'Easier' }), err => err.code === 'edit_easier' && err.status === 400);
  const log = await owner.client.from('game_events').select('source, ok, action, events, error').order('id', { ascending: false }).limit(2);
  const [refused, edited] = log.data;
  assert.deepEqual([edited.source, edited.ok, edited.action.type, edited.action.reason], ['action', true, 'list/edit', 'Workouts have no Goddamn tier']);
  assert.deepEqual(edited.events.find(e => e.type === 'list.edited').changed, ['noGoddamn']);
  assert.deepEqual([refused.ok, refused.error.code], [false, 'edit_easier'], 'a refused correction is logged too');
  const row = await owner.client.from('task_lists').select('tasks').eq('month', b.state.list.month).single();
  assert.equal(row.data.tasks.find(t => t.id === 'workout').noGoddamn, true, 'task_lists follows the correction');
});

test('day-close: needs the cron secret, closes finished days once, and is idempotent', { skip: CRON.length < 16 && 'set DAILY_CRON_SECRET (same value the stack was started with)' }, async () => {
  assert.equal((await fn('day-close', { headers: { 'x-daily-cron': 'wrong-secret-wrong-secret' } })).status, 401);
  assert.equal((await fn('day-close', { token: owner.token })).status, 401, 'an owner session is not the cron secret');
  // Put back a save whose last close is days old, as if the cron had been down.
  const old = E.newGame({ seed: 9, now: Date.now() - 4 * 86400e3, tasks: E.DEFAULT_TASKS });
  const { error } = await admin.from('game_state').update({ state: old, version: 50 }).eq('id', 1);
  assert.equal(error, null);
  const before = (await anon.from('daily_public').select('updated_at')).data[0].updated_at;
  const first = await fn('day-close', { headers: { 'x-daily-cron': CRON } });
  assert.equal(first.status, 200);
  assert.equal(first.body.changed, true);
  assert.ok(first.body.events.filter(t => t === 'day.closed').length >= 3, `closes the missed days: ${first.body.events}`);
  assert.equal(first.body.version, 51);
  const again = await fn('day-close', { headers: { 'x-daily-cron': CRON } });
  assert.deepEqual([again.status, again.body.changed], [200, false]);
  const pub = (await anon.from('daily_public').select('snapshot, updated_at')).data[0];
  assert.notEqual(pub.updated_at, before, 'the public view follows the close');
  assert.equal(pub.snapshot.header.streak, 0, 'missed days broke the streak in public too');
});

test('remind: cron secret only; never sends without email secrets', { skip: CRON.length < 16 && 'set DAILY_CRON_SECRET' }, async () => {
  assert.equal((await fn('remind')).status, 401);
  const r = await fn('remind', { headers: { 'x-daily-cron': CRON } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.notEqual(r.body.sent, true, 'no email secrets locally');
});

test('generate-variants: owner only; says so when the Anthropic key is not set', async () => {
  assert.equal((await fn('generate-variants', { body: { task: { name: 'Stretch', type: 'quality' } } })).status, 401);
  const r = await fn('generate-variants', { token: owner.token, body: { task: { name: 'Stretch', type: 'quality', chillText: '5 minutes of stretching' } } });
  assert.ok([200, 503].includes(r.status), JSON.stringify(r.body));
  if (r.status === 503) assert.equal(r.body.error.code, 'not_configured');
  else assert.deepEqual(Object.keys(r.body.tiers), ['chill', 'easy', 'medium', 'hard', 'goddamn']);
  assert.equal((await fn('generate-variants', { token: owner.token, body: { task: { type: 'quality' } } })).status, 400);
});

test('pg_cron → Vault → pg_net reaches day-close', { skip: CRON.length < 16 && 'set DAILY_CRON_SECRET' }, async () => {
  const jobs = sql("select string_agg(jobname, ',' order by jobname) from cron.job");
  assert.equal(jobs, 'daily-day-close,daily-remind-evening,daily-remind-last-call,daily-remind-morning');
  sql(`do $$ begin
    perform vault.create_secret('http://supabase_kong_daily:8000/functions/v1', 'daily_functions_url') where not exists (select 1 from vault.secrets where name = 'daily_functions_url');
    perform vault.create_secret('${CRON}', 'daily_cron_secret') where not exists (select 1 from vault.secrets where name = 'daily_cron_secret');
    perform vault.update_secret((select id from vault.secrets where name = 'daily_cron_secret'), '${CRON}');
  end $$;`);
  const id = Number(sql("select private.invoke_function('day-close')"));
  assert.ok(id > 0);
  let row = '';
  for (let i = 0; i < 40 && !row; i += 1) {
    await new Promise(r => setTimeout(r, 250));
    row = sql(`select status_code || ' ' || content from net._http_response where id = ${id}`);
  }
  assert.match(row, /^200 \{"ok":true/);
  assert.throws(() => sql("select private.invoke_function('game-action')"), /Unknown scheduled function/);
});

test.after(() => sql(`delete from private.app_owner where note = 'test:db';`));
