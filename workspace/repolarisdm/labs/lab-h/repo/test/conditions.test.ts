import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matches } from '../src/conditions.ts';
import type { Condition, EvaluationContext } from '../src/types.ts';

const ctx: EvaluationContext = {
  targetingKey: 'u-42',
  attributes: { country: 'DE', plan: 'pro', seats: 12, beta: true, tags: ['early', 'eu'] },
};

function check(op: Condition['op'], attribute: string, value: Condition['value']): boolean {
  return matches({ attribute, op, value }, ctx);
}

test('eq and neq compare scalars strictly', () => {
  assert.equal(check('eq', 'country', 'DE'), true);
  assert.equal(check('eq', 'seats', '12'), false, 'no string/number coercion');
  assert.equal(check('eq', 'beta', true), true);
  assert.equal(check('neq', 'plan', 'free'), true);
});

test('in and not_in work on string attributes', () => {
  assert.equal(check('in', 'country', ['DE', 'FR']), true);
  assert.equal(check('not_in', 'country', ['DE', 'FR']), false);
  assert.equal(check('in', 'seats', ['12']), false);
});

test('numeric comparisons need numbers on both sides', () => {
  assert.equal(check('gt', 'seats', 10), true);
  assert.equal(check('gte', 'seats', 12), true);
  assert.equal(check('lt', 'seats', 12), false);
  assert.equal(check('lte', 'country', 5), false);
});

test('string operators and contains on lists', () => {
  assert.equal(check('starts_with', 'targetingKey', 'u-'), true);
  assert.equal(check('ends_with', 'plan', 'ro'), true);
  assert.equal(check('contains', 'tags', 'eu'), true);
  assert.equal(check('contains', 'plan', 'r'), true);
  assert.equal(check('contains', 'tags', 'e'), false, 'list contains is exact');
});

test('a missing attribute never matches, even for negative operators', () => {
  assert.equal(check('eq', 'region', 'eu-west'), false);
  assert.equal(check('neq', 'region', 'eu-west'), false);
  assert.equal(check('not_in', 'region', ['eu-west']), false);
});
