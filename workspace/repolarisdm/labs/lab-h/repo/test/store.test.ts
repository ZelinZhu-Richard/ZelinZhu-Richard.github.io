import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createLogger, FlagStore } from '../src/index.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/flags.json', import.meta.url), 'utf8'));

test('a new store is empty at version 0', () => {
  const store = new FlagStore();
  assert.equal(store.version, 0);
  assert.deepEqual(store.keys(), []);
});

test('load swaps the config and bumps the version', () => {
  const store = new FlagStore();
  const result = store.load(fixture);
  assert.deepEqual(result, {
    ok: true,
    version: 1,
    changed: ['checkout-flow', 'dark-mode', 'legacy-banner', 'search-ranker'],
  });
  assert.deepEqual(store.keys(), ['checkout-flow', 'dark-mode', 'legacy-banner', 'search-ranker']);
});

test('a rejected load keeps the old config and version', () => {
  const store = new FlagStore();
  store.load(fixture);
  const result = store.load({ flags: [{ key: 'x' }] });
  assert.equal(result.ok, false);
  assert.equal(store.version, 1);
  assert.equal(store.keys().length, 4);
});

test('unknown flags evaluate to FLAG_NOT_FOUND', () => {
  const store = new FlagStore();
  store.load(fixture);
  assert.deepEqual(store.evaluate('nope', { targetingKey: 'u-1' }), {
    flagKey: 'nope',
    value: null,
    variant: null,
    reason: 'ERROR',
    errorCode: 'FLAG_NOT_FOUND',
  });
});

test('evaluateAll returns one result per flag', () => {
  const store = new FlagStore();
  store.load(fixture);
  const all = store.evaluateAll({ targetingKey: 'u-1', attributes: { email: 'a@example.test' } });
  assert.deepEqual(Object.keys(all), store.keys());
  assert.equal(all['dark-mode'].value, true);
  assert.equal(all['checkout-flow'].variant, 'one-page');
});

test('listeners see only changed keys; a failing listener is logged, not fatal', () => {
  const lines: string[] = [];
  const store = new FlagStore({ logger: createLogger({ write: (line) => lines.push(line) }) });
  const seen: Array<[number, string[]]> = [];
  store.onChange(() => {
    throw new Error('boom');
  });
  const stop = store.onChange((version, changed) => seen.push([version, changed]));
  store.load(fixture);
  const edited = structuredClone(fixture);
  edited.flags[0].enabled = false;
  store.load(edited);
  stop();
  store.load(fixture);
  assert.deepEqual(seen, [
    [1, ['checkout-flow', 'dark-mode', 'legacy-banner', 'search-ranker']],
    [2, ['dark-mode']],
  ]);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /change listener failed/);
});
