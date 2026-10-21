import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { evaluateFlag, validateConfig } from '../src/index.ts';
import type { FlagConfig } from '../src/index.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/flags.json', import.meta.url), 'utf8'));
const parsed = validateConfig(fixture);
if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
const flags = new Map<string, FlagConfig>(parsed.flags.map((f) => [f.key, f]));
const get = (key: string) => flags.get(key)!;

test('a disabled flag serves its off variant', () => {
  assert.deepEqual(evaluateFlag(get('legacy-banner'), { targetingKey: 'u-1' }), {
    flagKey: 'legacy-banner',
    value: false,
    variant: 'hide',
    reason: 'DISABLED',
  });
});

test('the first matching rule wins and reports its index', () => {
  const pinned = evaluateFlag(get('checkout-flow'), { targetingKey: 'u-2', attributes: { country: 'DE', plan: 'pro' } });
  assert.equal(pinned.variant, 'one-page');
  assert.equal(pinned.ruleIndex, 0);
  const beta = evaluateFlag(get('checkout-flow'), { targetingKey: 'u-9', attributes: { country: 'FR', plan: 'team' } });
  assert.equal(beta.reason, 'TARGETING_MATCH');
  assert.equal(beta.ruleIndex, 1);
});

test('all conditions of a rule must match', () => {
  const free = evaluateFlag(get('checkout-flow'), { targetingKey: 'u-9', attributes: { country: 'FR', plan: 'free' } });
  assert.equal(free.variant, 'classic');
  assert.equal(free.reason, 'DEFAULT');
  assert.equal(free.ruleIndex, undefined);
});

test('rule match on email suffix', () => {
  const staff = evaluateFlag(get('dark-mode'), { attributes: { email: 'ana@example.test' } });
  assert.deepEqual([staff.value, staff.reason], [true, 'TARGETING_MATCH']);
  const user = evaluateFlag(get('dark-mode'), { attributes: { email: 'ana@other.test' } });
  assert.deepEqual([user.value, user.reason], [false, 'DEFAULT']);
});

test('a split is deterministic per user', () => {
  for (const key of ['u-1', 'u-2', 'user-with-a-long-id-0001', 'zoë']) {
    const first = evaluateFlag(get('search-ranker'), { targetingKey: key });
    const again = evaluateFlag(get('search-ranker'), { targetingKey: key });
    assert.equal(first.reason, 'SPLIT');
    assert.deepEqual(again, first);
  }
});

test('a 50/50 split serves both variants', () => {
  const seen = new Set<string | null>();
  for (let i = 0; i < 200; i++) seen.add(evaluateFlag(get('search-ranker'), { targetingKey: `u-${i}` }).variant);
  assert.deepEqual([...seen].sort(), ['bm25', 'hybrid']);
});

test('a split without a targeting key is an error that serves the default', () => {
  const result = evaluateFlag(get('search-ranker'), {});
  assert.deepEqual(result, {
    flagKey: 'search-ranker',
    value: 'bm25',
    variant: 'bm25',
    reason: 'ERROR',
    errorCode: 'TARGETING_KEY_MISSING',
  });
});
