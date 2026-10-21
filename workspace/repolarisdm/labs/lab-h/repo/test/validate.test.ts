import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateConfig, validateContext } from '../src/index.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/flags.json', import.meta.url), 'utf8'));

function flag(overrides: Record<string, unknown> = {}) {
  return { key: 'f', enabled: true, variants: { a: 1, b: 2 }, defaultVariant: 'a', ...overrides };
}

function errorsFor(raw: unknown): string[] {
  const result = validateConfig(raw);
  assert.equal(result.ok, false, 'expected the config to be rejected');
  return result.ok ? [] : result.errors;
}

test('the fixture config is valid and normalized', () => {
  const result = validateConfig(fixture);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.flags.length, 4);
  const darkMode = result.flags.find((f) => f.key === 'dark-mode')!;
  assert.equal(darkMode.offVariant, 'off', 'offVariant defaults to defaultVariant');
  const banner = result.flags.find((f) => f.key === 'legacy-banner')!;
  assert.deepEqual(banner.rules, [], 'rules default to an empty list');
});

test('rejects a config without a flags array', () => {
  assert.deepEqual(errorsFor({}), ['config must be an object with a "flags" array']);
  assert.deepEqual(errorsFor([]), ['config must be an object with a "flags" array']);
});

test('rejects bad keys, duplicates and unknown fields', () => {
  assert.match(errorsFor({ flags: [flag({ key: 'Bad Key' })] })[0], /key must match/);
  assert.match(errorsFor({ flags: [flag(), flag()] })[0], /duplicate key/);
  assert.match(errorsFor({ flags: [flag({ colour: 'red' })] })[0], /unknown field "colour"/);
});

test('default and off variants must exist', () => {
  assert.match(errorsFor({ flags: [flag({ defaultVariant: 'z' })] }).join('\n'), /defaultVariant must name a variant/);
  assert.match(errorsFor({ flags: [flag({ offVariant: 'z' })] }).join('\n'), /offVariant must name a variant/);
});

test('rollout weights must add up to 100 with at most two decimals', () => {
  const rollout = (weights: number[]) =>
    flag({ rollout: weights.map((weight, i) => ({ variant: i === 0 ? 'a' : 'b', weight })) });
  assert.equal(validateConfig({ flags: [rollout([33.33, 66.67])] }).ok, true);
  assert.match(errorsFor({ flags: [rollout([50, 49])] })[0], /add up to 100, got 99/);
  assert.match(errorsFor({ flags: [rollout([33.333, 66.667])] })[0], /at most two decimals/);
  assert.match(errorsFor({ flags: [rollout([-10, 110])] })[0], /from 0 to 100/);
});

test('rules need exactly one of variant and rollout', () => {
  const both = flag({ rules: [{ conditions: [], variant: 'a', rollout: [{ variant: 'a', weight: 100 }] }] });
  const neither = flag({ rules: [{ conditions: [] }] });
  assert.match(errorsFor({ flags: [both] })[0], /exactly one of "variant" and "rollout"/);
  assert.match(errorsFor({ flags: [neither] })[0], /exactly one of "variant" and "rollout"/);
});

test('condition values must fit the operator', () => {
  const rule = (op: string, value: unknown) => flag({ rules: [{ conditions: [{ attribute: 'x', op, value }], variant: 'b' }] });
  assert.match(errorsFor({ flags: [rule('in', 'DE')] })[0], /array of strings/);
  assert.match(errorsFor({ flags: [rule('gte', '3')] })[0], /finite number/);
  assert.match(errorsFor({ flags: [rule('like', 'x')] })[0], /unknown operator "like"/);
  assert.equal(validateConfig({ flags: [rule('eq', true)] }).ok, true);
});

test('validateContext accepts the documented shape only', () => {
  assert.deepEqual(validateContext(undefined), { ok: true, context: {} });
  const good = validateContext({ targetingKey: 'u-1', attributes: { plan: 'pro', seats: 3, beta: true, tags: ['a'] } });
  assert.equal(good.ok, true);
  const bad = validateContext({ targetingKey: 7, attributes: { nested: { a: 1 } }, extra: 1 });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.length, 3);
});
