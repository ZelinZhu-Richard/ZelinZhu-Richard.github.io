// Supabase mode, without a running Supabase: the browser/server protocol, SupabaseBackend against a fake
// game-action server, the public-key guard, the vendored supabase-js pin, the verify.mjs exemption, and a
// repo-wide secret scan. The real round trip is `npm run test:db` (workspace/daily/supabase/tests/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../engine/index.js';
import { drawLog, isRedacted, listRows, redactState, rulesHash } from '../app/cloud-protocol.js';
import { CLOUD, DEV_OVERRIDE_KEY, cloudConfig, cloudEnabled } from '../app/cloud-config.js';
import { CloudError, CloudPublicBackend, SupabaseBackend, createCloudBackend, localSave, retireLocalSave, returnUrl, UPLOADED_KEY } from '../app/cloud.js';
import { assertPublicCloud, verifyVendor } from '../build.mjs';

const dailyDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const T0 = Date.UTC(2026, 10, 2, 15, 0); // Mon 2 Nov 2026, 10:00 New York
const cloud = { url: 'https://example-ref.supabase.co', anonKey: 'sb_publishable_test' };

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m };
}

// A fake game-action: replies from a queue and records every request.
function fakeServer(replies) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const next = replies.shift();
    if (!next) throw new Error('no reply queued');
    if (next === 'offline') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return { calls, fetchImpl };
}

const game = (now = T0) => E.newGame({ seed: 7, now, tasks: E.DEFAULT_TASKS });
// verify.mjs always opens the CV, so a scratch output folder needs a stand-in.
const scratchDist = async prefix => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  await writeFile(join(dir, 'Zelin_Zhu_CV.pdf'), '%PDF-1.4\n');
  return dir;
};
const reply = (state, version, extra = {}) => ({ body: { state: redactState(state), version, events: [], rules: 'r', ...extra } });

test('redactState hides the seed, keeps the counter, and never mutates its input', () => {
  const s = game();
  const r = redactState(s);
  assert.deepEqual(r.rng.seed, [0, 0, 0, 0]);
  assert.equal(r.rng.n, s.rng.n);
  assert.ok(isRedacted(r) && !isRedacted(s));
  assert.notDeepEqual(s.rng.seed, [0, 0, 0, 0]);
  assert.equal(redactState(null), null);
  assert.doesNotThrow(() => E.advance(r, T0 + 3600e3), 'the engine still runs on a redacted copy');
});

test('rulesHash is a stable sha256 of the engine rules', async () => {
  const a = await rulesHash(E);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(await rulesHash(E), a);
  assert.notEqual(await rulesHash({ ...E, SCHEMA_VERSION: E.SCHEMA_VERSION + 1 }), a);
});

test('listRows: this month locked, next month unlocked', () => {
  const s = game();
  const rows = listRows({ ...s, nextList: { month: '2026-12', tasks: s.list.tasks } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].month, '2026-11');
  assert.match(rows[0].locked_at, /^2026-11-02T/);
  assert.deepEqual({ month: rows[1].month, locked_at: rows[1].locked_at }, { month: '2026-12', locked_at: null });
  assert.deepEqual(listRows({}), []);
});

test('drawLog records the counter range and the values drawn, capped', () => {
  const seed = E.seedFrom(5);
  const log = drawLog(E.drawAt, seed, 3, 6);
  assert.deepEqual([log.from, log.to, log.draws.length, log.truncated], [3, 6, 3, false]);
  assert.equal(log.draws[0], E.drawAt(seed, 3));
  assert.equal(drawLog(E.drawAt, seed, 0, 10, 4).truncated, true);
});

test('cloud config: empty in the repo until the owner pastes it; the dev override only works on local hosts', () => {
  assert.doesNotThrow(() => assertPublicCloud(CLOUD));
  const storage = memoryStorage({ [DEV_OVERRIDE_KEY]: JSON.stringify({ url: 'http://127.0.0.1:54321/', anonKey: 'k' }) });
  assert.deepEqual(cloudConfig({ location: { hostname: '127.0.0.1' }, storage, base: CLOUD }), { url: 'http://127.0.0.1:54321', anonKey: 'k' });
  assert.equal(cloudConfig({ location: { hostname: 'zelinzhu-richard.github.io' }, storage, base: CLOUD }), CLOUD);
  assert.equal(cloudEnabled({ url: 'x', anonKey: '' }), false);
  assert.equal(cloudEnabled(cloud), true);
});

test('the build refuses a secret key in the cloud config and accepts public ones', () => {
  const jwt = role => ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url'), 'c2lnbmF0dXJlLXNpZ25hdHVyZQ'].join('.');
  assert.throws(() => assertPublicCloud({ url: cloud.url, anonKey: ['sb', 'secret', 'abcdefghijklmnopqrstuvwxyz'].join('_') }), /secret key/);
  assert.throws(() => assertPublicCloud({ url: cloud.url, anonKey: jwt('service_role') }), /service_role/);
  assert.throws(() => assertPublicCloud({ url: 'http://example.test', anonKey: 'k' }), /https origin/);
  assert.doesNotThrow(() => assertPublicCloud({ url: cloud.url, anonKey: jwt('anon') }));
  assert.doesNotThrow(() => assertPublicCloud(cloud));
});

test('vendored supabase-js matches its pinned manifest; any change fails', async () => {
  const manifest = await verifyVendor();
  assert.equal(manifest.version, '2.118.0');
  const dir = await mkdtemp(join(tmpdir(), 'daily-vendor-'));
  try {
    await cp(join(dailyDir, 'vendor'), join(dir, 'vendor'), { recursive: true });
    await writeFile(join(dir, 'vendor', 'supabase.js'), `${await readFile(join(dir, 'vendor', 'supabase.js'), 'utf8')}\n// edited`);
    await assert.rejects(verifyVendor(join(dir, 'vendor')), /integrity failed: vendor\/supabase\.js/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('verify.mjs: the localhost:9999 exemption covers only the pinned bundle', async () => {
  const dir = await scratchDist('daily-verify-');
  const run = () => spawnSync(process.execPath, [join(repoRoot, 'tools', 'verify.mjs'), dir], { encoding: 'utf8' }).stderr;
  try {
    await mkdir(join(dir, 'daily', 'app'), { recursive: true });
    await cp(join(dailyDir, 'vendor'), join(dir, 'daily', 'vendor'), { recursive: true });
    await writeFile(join(dir, 'daily', 'app', 'other.js'), "export const u = 'http://localhost:9999';\n");
    let err = run();
    assert.doesNotMatch(err, /Development path in daily\/vendor\/supabase\.js/);
    assert.doesNotMatch(err, /does not match/);
    assert.match(err, /Development path in daily\/app\/other\.js/, 'the literal anywhere else still fails');
    await writeFile(join(dir, 'daily', 'vendor', 'supabase.js'), `${await readFile(join(dir, 'daily', 'vendor', 'supabase.js'), 'utf8')}\n// edited`);
    err = run();
    assert.match(err, /Vendored supabase-js does not match daily\/vendor\/manifest\.json/);
    assert.match(err, /Development path in daily\/vendor\/supabase\.js/, 'an edited bundle loses the exemption');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('verify.mjs flags Supabase secret keys, Anthropic keys and service_role JWTs', async () => {
  const dir = await scratchDist('daily-secrets-');
  const body = Buffer.from(JSON.stringify({ iss: 'supabase', role: 'service_role' })).toString('base64url');
  const samples = {
    'a.js': `const k = '${['sb', 'secret', 'abcdefghijklmnopqrstuv'].join('_')}';`,
    'b.js': `const k = '${['sk', 'ant', 'api03', 'abcdefghijklmnop'].join('-')}';`,
    'c.js': `const k = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${body}.c2lnbmF0dXJlLXNpZ25hdHVyZQ';`,
  };
  try {
    for (const [f, text] of Object.entries(samples)) await writeFile(join(dir, f), `${text}\n`);
    const err = spawnSync(process.execPath, [join(repoRoot, 'tools', 'verify.mjs'), dir], { encoding: 'utf8' }).stderr;
    for (const f of Object.keys(samples)) assert.match(err, new RegExp(`Possible secret material in ${f.replace('.', '\\.')}`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('SupabaseBackend: load, act with the version, and adopt the server state', async () => {
  const s0 = game();
  const after = E.applyAction(s0, { type: 'settings/save', settings: { sound: true } }, T0 + 1000);
  const { calls, fetchImpl } = fakeServer([reply(s0, 1), reply(after.state, 2, { events: [{ type: 'settings.saved' }] })]);
  const b = new SupabaseBackend(E, { cloud, fetchImpl, getToken: async () => 'tok', clock: () => T0 + 2000 });
  await b.init();
  assert.ok(b.hasGame && isRedacted(b.state) && b.version === 1);
  const out = await b.act({ type: 'settings/save', settings: { sound: true } });
  assert.deepEqual(out.events, [{ type: 'settings.saved' }]);
  assert.equal(b.state.settings.sound, true);
  assert.equal(b.version, 2);
  assert.deepEqual(calls.map(c => c.body.op), ['load', 'act']);
  assert.equal(calls[1].body.version, 1);
  assert.equal(calls[1].url, `${cloud.url}/functions/v1/game-action`);
  assert.equal(calls[1].headers.Authorization, 'Bearer tok');
  assert.equal(calls[1].headers.apikey, cloud.anonKey);
  assert.ok(b.views().today, 'views are computed by the engine in the browser');
  assert.equal(JSON.parse(b.exportJson()).rng.redacted, true, 'exports never carry the server seed');
});

test('SupabaseBackend: a stale version adopts the fresh state and reports it', async () => {
  const s0 = game();
  const { fetchImpl } = fakeServer([reply(s0, 1), { status: 409, body: { error: { code: 'stale', message: 'refreshed' }, state: redactState(s0), version: 5, rules: 'r' } }]);
  const b = new SupabaseBackend(E, { cloud, fetchImpl, getToken: async () => 'tok', clock: () => T0 });
  await b.init();
  await assert.rejects(b.act({ type: 'settings/save', settings: { sound: true } }), err => err instanceof CloudError && err.code === 'stale' && err.status === 409);
  assert.equal(b.version, 5);
});

test('SupabaseBackend: refresh asks the server only when a day is due, or to resync', async () => {
  const s0 = game();
  let now = T0;
  const { calls, fetchImpl } = fakeServer([reply(s0, 1), reply(s0, 2, { events: [{ type: 'day.closed' }] }), reply(s0, 2)]);
  const b = new SupabaseBackend(E, { cloud, fetchImpl, getToken: async () => 'tok', clock: () => now });
  await b.init();
  assert.deepEqual((await b.refresh()).events, [], 'nothing due at 10:00: no request');
  assert.equal(calls.length, 1);
  now = T0 + 13 * 3600e3; // 23:00 New York: today's close is due
  assert.deepEqual((await b.refresh()).events, [{ type: 'day.closed' }]);
  assert.deepEqual(calls.at(-1).body, { op: 'advance', version: 1 });
  b.state = E.advance(b.state, now).state; // as if the server had closed it
  now += 6 * 60e3;
  await b.refresh();
  assert.equal(calls.at(-1).body.op, 'load', 'resyncs every few minutes for other devices');
});

test('SupabaseBackend: errors are typed (signed out, offline, not owner, game rules)', async () => {
  const signedOut = new SupabaseBackend(E, { cloud, fetchImpl: async () => { throw new Error('unused'); }, getToken: async () => null });
  await assert.rejects(signedOut.init(), err => err.code === 'signed_out');
  const offline = new SupabaseBackend(E, { cloud, ...fakeServer(['offline']), getToken: async () => 'tok' });
  await assert.rejects(offline.init(), err => err.code === 'offline');
  const stranger = new SupabaseBackend(E, { cloud, ...fakeServer([{ status: 403, body: { error: { code: 'not_owner', message: 'Not authorised.' } } }]), getToken: async () => 'tok' });
  await assert.rejects(stranger.init(), err => err.code === 'not_owner' && err.message === 'Not authorised.');
  const s0 = game();
  const mismatch = new SupabaseBackend(E, { cloud, ...fakeServer([reply(s0, 1, { rules: 'other' })]), getToken: async () => 'tok' });
  await mismatch.init();
  assert.equal(mismatch.rulesMismatch, true);
});

test('SupabaseBackend: create and import (upload of a local save)', async () => {
  const s0 = game();
  const { calls, fetchImpl } = fakeServer([{ body: { state: null, version: 0, rules: 'r' } }, reply(s0, 1), reply(s0, 2)]);
  const b = new SupabaseBackend(E, { cloud, fetchImpl, getToken: async () => 'tok', clock: () => T0 });
  await b.init();
  assert.equal(b.hasGame, false);
  await assert.rejects(b.load(), err => err.code === 'no_game');
  await b.create(E.DEFAULT_TASKS);
  await b.importJson(JSON.stringify(s0));
  assert.deepEqual(calls.map(c => c.body.op), ['load', 'create', 'import']);
  assert.deepEqual({ replace: calls[2].body.replace, version: calls[2].body.version }, { replace: true, version: 1 });
  await assert.rejects(b.importJson('not json'), /not a Daily save/);
});

test('CloudPublicBackend reads daily_public and falls back to the published snapshot', async () => {
  const snap = E.publicSnapshot(game(), T0);
  const seen = [];
  const ok = new CloudPublicBackend({ cloud, fetchImpl: async (url, init) => { seen.push({ url, init }); return new Response(JSON.stringify([{ snapshot: snap }])); } });
  await ok.load();
  assert.equal(ok.source, 'cloud');
  assert.equal(seen[0].url, `${cloud.url}/rest/v1/daily_public?select=snapshot`);
  assert.equal(seen[0].init.headers.apikey, cloud.anonKey);
  assert.equal(seen[0].init.headers.Authorization, undefined, 'visitors send only the public key');
  const fallback = new CloudPublicBackend({ cloud, fetchImpl: async url => (url.startsWith(cloud.url) ? new Response('[]') : new Response(JSON.stringify(snap))) });
  await fallback.load();
  assert.equal(fallback.source, 'file');
  assert.equal(fallback.views().today.dayKey, snap.today.dayKey);
});

test('createCloudBackend: visitor, owner, stranger and first run', async () => {
  const s0 = game();
  const lib = token => async () => ({ createClient: () => ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }), signOut: async () => {} } }) });
  const snapFetch = async () => new Response('[]');
  const visitor = await createCloudBackend({ cloud, fetchImpl: snapFetch, loadLib: lib(null) });
  assert.ok(visitor instanceof CloudPublicBackend && visitor.client && !visitor.pendingOwner);
  const owner = await createCloudBackend({ cloud, ...fakeServer([reply(s0, 3)]), loadLib: lib('tok') });
  assert.ok(owner instanceof SupabaseBackend && owner.version === 3);
  const stranger = await createCloudBackend({ cloud, ...fakeServer([{ status: 403, body: { error: { code: 'not_owner', message: 'Not authorised.' } } }]), loadLib: lib('tok') });
  assert.ok(stranger instanceof CloudPublicBackend);
  assert.match(stranger.notice, /Not authorised/);
  const first = await createCloudBackend({ cloud, ...fakeServer([{ body: { state: null, version: 0, rules: 'r' } }]), loadLib: lib('tok') });
  assert.ok(first instanceof CloudPublicBackend && first.pendingOwner instanceof SupabaseBackend);
  const broken = await createCloudBackend({ cloud, fetchImpl: snapFetch, loadLib: async () => { throw new Error('blocked'); } });
  assert.match(broken.notice, /unavailable/);
});

test('an uploaded local save is kept as a backup and not offered again', () => {
  const storage = memoryStorage({ 'daily:v1': '{"format":"daily-save"}' });
  assert.equal(localSave(storage), '{"format":"daily-save"}');
  retireLocalSave(storage);
  assert.equal(localSave(storage), null);
  assert.equal(storage.getItem(UPLOADED_KEY), '{"format":"daily-save"}');
  assert.equal(returnUrl({ origin: 'https://zelinzhu-richard.github.io', pathname: '/daily/eggs/' }), 'https://zelinzhu-richard.github.io/daily/eggs/');
});

test('publication: no secret keys in the repo; Supabase local state and env files are ignored', () => {
  const listed = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(listed.status, 0);
  const files = listed.stdout.split('\n').filter(Boolean);
  assert.ok(files.includes('workspace/daily/supabase/config.toml'));
  for (const f of files) {
    assert.doesNotMatch(f, /^workspace\/daily\/supabase\/(\.temp|\.branches)\//, `local Supabase state is tracked: ${f}`);
    assert.doesNotMatch(f, /(^|\/)\.env(\.|$)|seed\.local\.sql$/, `env or private seed file is tracked: ${f}`);
  }
  for (const f of files.filter(x => /^workspace\/(daily|hq)\/.*\.(js|mjs|ts|json|sql|toml|md|html)$/.test(x))) {
    const text = spawnSync('cat', [f], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).stdout;
    assert.doesNotMatch(text, /\bsb_secret_[A-Za-z0-9_-]{10,}|\bsk-ant-[A-Za-z0-9_-]{10,}/, `secret-looking key in ${f}`);
    for (const m of text.matchAll(/\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
      let role = null;
      try { role = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')).role; } catch { /* not a JWT */ }
      assert.notEqual(role, 'service_role', `service_role JWT in ${f}`);
    }
  }
});

const typescript = Boolean(process.features?.typescript);

test('CORS helper: only the site origin (plus ALLOWED_ORIGINS) is allowed', { skip: !typescript && 'needs Node type stripping' }, async () => {
  const env = new Map();
  globalThis.Deno = { env: { get: k => env.get(k) } };
  try {
    const { SITE_ORIGIN, corsHeaders, preflight } = await import('../supabase/functions/_shared/cors.ts');
    const req = (origin, method = 'POST') => new Request('https://example-ref.supabase.co/functions/v1/game-action', { method, headers: origin ? { Origin: origin } : {} });
    assert.equal(SITE_ORIGIN, 'https://zelinzhu-richard.github.io');
    assert.equal(corsHeaders(req(SITE_ORIGIN))['Access-Control-Allow-Origin'], SITE_ORIGIN);
    assert.equal(corsHeaders(req('https://evil.example'))['Access-Control-Allow-Origin'], undefined);
    assert.equal(preflight(req(SITE_ORIGIN, 'OPTIONS')).status, 204);
    assert.equal(preflight(req('https://evil.example', 'OPTIONS')).status, 403);
    assert.equal(preflight(req(SITE_ORIGIN)), null, 'only OPTIONS is a preflight');
    assert.match(corsHeaders(req(SITE_ORIGIN))['Access-Control-Allow-Headers'], /authorization.*apikey.*content-type/);
    env.set('ALLOWED_ORIGINS', 'http://127.0.0.1:5173');
    assert.equal(corsHeaders(req('http://127.0.0.1:5173'))['Access-Control-Allow-Origin'], 'http://127.0.0.1:5173');
  } finally {
    delete globalThis.Deno;
  }
});

test('cron: each reminder slot fires at its UTC hour in both EDT and EST', { skip: !typescript && 'needs Node type stripping' }, async () => {
  globalThis.Deno = { env: { get: () => undefined } };
  try {
    const { REMINDER_SLOTS, REMINDERS_STOP } = await import('../supabase/functions/_shared/config.ts');
    const sql = await readFile(join(dailyDir, 'supabase', 'migrations', '20261024120200_cron.sql'), 'utf8');
    const jobs = [...sql.matchAll(/cron\.schedule\('([^']+)', '(\d+) ([\d,]+) \* \* \*', \$\$select private\.invoke_function\('remind'\)\$\$\)/g)]
      .map(m => ({ minute: Number(m[2]), hours: m[3].split(',').map(Number) }));
    assert.equal(jobs.length, REMINDER_SLOTS.length);
    for (const slot of REMINDER_SLOTS) {
      assert.ok(slot.at < REMINDERS_STOP, `${slot.id} is before the 21:30 stop`);
      for (const day of ['2026-07-15', '2027-01-15']) { // EDT, EST
        const at = new Date(E.time.nyInstant(day, slot.at));
        assert.ok(jobs.some(j => j.minute === at.getUTCMinutes() && j.hours.includes(at.getUTCHours())), `remind ${slot.id} on ${day} (${at.toISOString()}) has a cron run`);
      }
    }
    assert.match(sql, /cron\.schedule\('daily-day-close', '5 \* \* \* \*'/);
  } finally {
    delete globalThis.Deno;
  }
});
