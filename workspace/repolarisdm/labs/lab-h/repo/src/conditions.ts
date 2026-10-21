// Targeting conditions: does one condition hold for one evaluation context?
import type { AttributeValue, Condition, EvaluationContext } from './types.ts';

// `targetingKey` is readable as an attribute so rules can pin single users.
export function readAttribute(ctx: EvaluationContext, name: string): AttributeValue | undefined {
  if (name === 'targetingKey') return ctx.targetingKey;
  return ctx.attributes?.[name];
}

function sameScalar(actual: AttributeValue, expected: AttributeValue): boolean {
  if (Array.isArray(actual) || Array.isArray(expected)) return false;
  return actual === expected;
}

function compareNumbers(op: 'gt' | 'gte' | 'lt' | 'lte', actual: AttributeValue, expected: AttributeValue): boolean {
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  switch (op) {
    case 'gt':
      return actual > expected;
    case 'gte':
      return actual >= expected;
    case 'lt':
      return actual < expected;
    case 'lte':
      return actual <= expected;
  }
}

// A missing attribute never matches, whatever the operator (also for neq/not_in).
export function matches(condition: Condition, ctx: EvaluationContext): boolean {
  const actual = readAttribute(ctx, condition.attribute);
  if (actual === undefined) return false;
  const expected = condition.value;
  switch (condition.op) {
    case 'eq':
      return sameScalar(actual, expected);
    case 'neq':
      return !sameScalar(actual, expected);
    case 'in':
      return Array.isArray(expected) && typeof actual === 'string' && expected.includes(actual);
    case 'not_in':
      return Array.isArray(expected) && typeof actual === 'string' && !expected.includes(actual);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return compareNumbers(condition.op, actual, expected);
    case 'starts_with':
      return typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected);
    case 'ends_with':
      return typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected);
    case 'contains':
      if (typeof expected !== 'string') return false;
      if (Array.isArray(actual)) return actual.includes(expected);
      return typeof actual === 'string' && actual.includes(expected);
    default: {
      const unknown: never = condition.op;
      throw new Error(`unknown operator ${String(unknown)}`);
    }
  }
}
