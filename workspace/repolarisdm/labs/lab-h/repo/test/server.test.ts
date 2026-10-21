import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createServer, FlagStore } from '../src/index.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/flags.json', import.meta.url), 'utf8'));
const TOKEN = 'test-admin-token';
const store = new FlagStore();
store.load(fixture);
const server = createServer({ store, adminToken: TOKEN, maxBodyBytes: 64 * 1024 });
let base = '';

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('GET /healthz', async () => {
  assert.deepEqual(await call('GET', '/healthz'), { status: 200, body: { status: 'ok', version: 1 } });
});

test('GET /v1/flags lists summaries sorted by key', async () => {
  const { status, body } = await call('GET', '/v1/flags');
  assert.equal(status, 200);
  assert.deepEqual(
    body.flags.map((f: { key: string }) => f.key),
    ['checkout-flow', 'dark-mode', 'legacy-banner', 'search-ranker'],
  );
  assert.deepEqual(body.flags[2], {
    key: 'legacy-banner',
    description: '',
    enabled: false,
    variants: ['show', 'hide'],
    defaultVariant: 'show',
    offVariant: 'hide',
    rules: 0,
    rollout: false,
  });
});

test('POST /v1/evaluate/:key evaluates one flag', async () => {
  const { status, body } = await call('POST', '/v1/evaluate/dark-mode', {
    context: { targetingKey: 'u-1', attributes: { email: 'bo@example.test' } },
  });
  assert.equal(status, 200);
  assert.deepEqual(body, { flagKey: 'dark-mode', value: true, variant: 'on', reason: 'TARGETING_MATCH', ruleIndex: 0 });
});

test('unknown flag is 404, bad context is 400, bad JSON is 400', async () => {
  assert.equal((await call('POST', '/v1/evaluate/missing', { context: {} })).status, 404);
  const badContext = await call('POST', '/v1/evaluate/dark-mode', { context: { targetingKey: 5 } });
  assert.equal(badContext.status, 400);
  assert.deepEqual(badContext.body.details, ['context.targetingKey must be a string']);
  assert.equal((await call('POST', '/v1/evaluate/dark-mode', '{not json')).status, 400);
});

test('POST /v1/evaluate evaluates every flag', async () => {
  const { status, body } = await call('POST', '/v1/evaluate', { context: { targetingKey: 'u-2' } });
  assert.equal(status, 200);
  assert.equal(body.version, 1);
  assert.equal(body.results['checkout-flow'].variant, 'one-page');
  assert.equal(body.results['legacy-banner'].reason, 'DISABLED');
});

test('wrong method is 405, unknown path is 404, big body is 413', async () => {
  assert.equal((await call('GET', '/v1/evaluate')).status, 405);
  assert.equal((await call('GET', '/v2/flags')).status, 404);
  assert.equal((await call('POST', '/v1/evaluate', 'x'.repeat(70 * 1024))).status, 413);
});

test('PUT /v1/config needs the admin token and a valid config', async () => {
  assert.equal((await call('PUT', '/v1/config', fixture)).status, 401);
  const auth = { authorization: `Bearer ${TOKEN}` };
  const rejected = await call('PUT', '/v1/config', { flags: [{ key: 'x' }] }, auth);
  assert.equal(rejected.status, 400);
  assert.ok(rejected.body.details.length > 0);
  const edited = structuredClone(fixture);
  edited.flags[3].enabled = true;
  const accepted = await call('PUT', '/v1/config', edited, auth);
  assert.deepEqual(accepted, { status: 200, body: { version: 2, changed: ['legacy-banner'] } });
});
