// Turn untrusted JSON into FlagConfig objects, or into a list of readable errors.
// Every error starts with where it happened, e.g. `flag "checkout": rules[0]: ...`.
// A config with any error is rejected as a whole.
import { toBasisPoints } from './rollout.ts';
import { OPERATORS } from './types.ts';
import type {
  AttributeValue,
  Condition,
  EvaluationContext,
  FlagConfig,
  JsonValue,
  Operator,
  Rule,
  Split,
} from './types.ts';

export type ValidationResult = { ok: true; flags: FlagConfig[] } | { ok: false; errors: string[] };
export type ContextResult = { ok: true; context: EvaluationContext } | { ok: false; errors: string[] };

const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const FLAG_FIELDS = new Set([
  'key',
  'description',
  'enabled',
  'variants',
  'defaultVariant',
  'offVariant',
  'salt',
  'rules',
  'rollout',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAttributeValue(value: unknown): value is AttributeValue {
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function conditionValueProblem(op: Operator, value: unknown): string | null {
  switch (op) {
    case 'in':
    case 'not_in':
      return Array.isArray(value) && value.every((v) => typeof v === 'string') ? null : 'value must be an array of strings';
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'value must be a finite number';
    case 'starts_with':
    case 'ends_with':
    case 'contains':
      return typeof value === 'string' ? null : 'value must be a string';
    case 'eq':
    case 'neq':
      return isAttributeValue(value) && !Array.isArray(value) ? null : 'value must be a string, number or boolean';
  }
}

function parseCondition(raw: unknown, at: string, errors: string[]): Condition | null {
  if (!isRecord(raw)) {
    errors.push(`${at}: must be an object`);
    return null;
  }
  const { attribute, op, value } = raw;
  if (typeof attribute !== 'string' || attribute === '') {
    errors.push(`${at}: attribute must be a non-empty string`);
    return null;
  }
  if (typeof op !== 'string' || !(OPERATORS as readonly string[]).includes(op)) {
    errors.push(`${at}: unknown operator ${JSON.stringify(op)}`);
    return null;
  }
  const problem = conditionValueProblem(op as Operator, value);
  if (problem) {
    errors.push(`${at}: ${problem}`);
    return null;
  }
  return { attribute, op: op as Operator, value: value as AttributeValue };
}

function parseSplits(raw: unknown, at: string, variants: Set<string>, errors: string[]): Split[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push(`${at}: must be a non-empty array`);
    return null;
  }
  const splits: Split[] = [];
  let total = 0;
  raw.forEach((item, i) => {
    const where = `${at}[${i}]`;
    if (!isRecord(item)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    if (typeof item.variant !== 'string' || !variants.has(item.variant)) {
      errors.push(`${where}: unknown variant ${JSON.stringify(item.variant)}`);
      return;
    }
    const points = typeof item.weight === 'number' ? toBasisPoints(item.weight) : null;
    if (points === null) {
      errors.push(`${where}: weight must be a number from 0 to 100 with at most two decimals`);
      return;
    }
    total += points;
    splits.push({ variant: item.variant, weight: item.weight as number });
  });
  if (splits.length !== raw.length) return null;
  if (total !== 10_000) {
    errors.push(`${at}: weights must add up to 100, got ${total / 100}`);
    return null;
  }
  return splits;
}

function parseRule(raw: unknown, at: string, variants: Set<string>, errors: string[]): Rule | null {
  if (!isRecord(raw)) {
    errors.push(`${at}: must be an object`);
    return null;
  }
  const before = errors.length;
  if (raw.name !== undefined && typeof raw.name !== 'string') errors.push(`${at}: name must be a string`);
  const rawConditions = raw.conditions ?? [];
  const conditions: Condition[] = [];
  if (!Array.isArray(rawConditions)) {
    errors.push(`${at}.conditions: must be an array`);
  } else {
    rawConditions.forEach((item, i) => {
      const condition = parseCondition(item, `${at}.conditions[${i}]`, errors);
      if (condition) conditions.push(condition);
    });
  }
  const rule: Rule = { conditions };
  if (typeof raw.name === 'string') rule.name = raw.name;
  if ((raw.variant === undefined) === (raw.rollout === undefined)) {
    errors.push(`${at}: set exactly one of "variant" and "rollout"`);
  } else if (raw.variant !== undefined) {
    if (typeof raw.variant === 'string' && variants.has(raw.variant)) rule.variant = raw.variant;
    else errors.push(`${at}: unknown variant ${JSON.stringify(raw.variant)}`);
  } else {
    const splits = parseSplits(raw.rollout, `${at}.rollout`, variants, errors);
    if (splits) rule.rollout = splits;
  }
  return errors.length > before ? null : rule;
}

function parseFlag(raw: unknown, index: number, errors: string[]): FlagConfig | null {
  if (!isRecord(raw)) {
    errors.push(`flags[${index}]: must be an object`);
    return null;
  }
  if (typeof raw.key !== 'string' || !KEY_PATTERN.test(raw.key)) {
    errors.push(`flags[${index}]: key must match ${KEY_PATTERN}`);
    return null;
  }
  const at = `flag "${raw.key}"`;
  const before = errors.length;
  for (const field of Object.keys(raw)) {
    if (!FLAG_FIELDS.has(field)) errors.push(`${at}: unknown field "${field}"`);
  }
  if (typeof raw.enabled !== 'boolean') errors.push(`${at}: enabled must be true or false`);
  if (raw.description !== undefined && typeof raw.description !== 'string') {
    errors.push(`${at}: description must be a string`);
  }
  if (raw.salt !== undefined && (typeof raw.salt !== 'string' || raw.salt === '')) {
    errors.push(`${at}: salt must be a non-empty string`);
  }
  if (!isRecord(raw.variants) || Object.keys(raw.variants).length === 0) {
    errors.push(`${at}: variants must be a non-empty object`);
    return null;
  }
  const variants = new Set(Object.keys(raw.variants));
  const defaultVariant = raw.defaultVariant;
  if (typeof defaultVariant !== 'string' || !variants.has(defaultVariant)) {
    errors.push(`${at}: defaultVariant must name a variant`);
  }
  const offVariant = raw.offVariant ?? defaultVariant;
  if (typeof offVariant !== 'string' || !variants.has(offVariant)) {
    errors.push(`${at}: offVariant must name a variant`);
  }
  const rawRules = raw.rules ?? [];
  const rules: Rule[] = [];
  if (!Array.isArray(rawRules)) {
    errors.push(`${at}: rules must be an array`);
  } else {
    rawRules.forEach((item, i) => {
      const rule = parseRule(item, `${at}: rules[${i}]`, variants, errors);
      if (rule) rules.push(rule);
    });
  }
  const rollout = raw.rollout === undefined ? null : parseSplits(raw.rollout, `${at}: rollout`, variants, errors);
  if (errors.length > before) return null;

  const flag: FlagConfig = {
    key: raw.key,
    enabled: raw.enabled as boolean,
    variants: raw.variants as Record<string, JsonValue>,
    defaultVariant: defaultVariant as string,
    offVariant: offVariant as string,
    rules,
  };
  if (typeof raw.description === 'string') flag.description = raw.description;
  if (typeof raw.salt === 'string') flag.salt = raw.salt;
  if (rollout) flag.rollout = rollout;
  return flag;
}

export function validateConfig(raw: unknown): ValidationResult {
  if (!isRecord(raw) || !Array.isArray(raw.flags)) {
    return { ok: false, errors: ['config must be an object with a "flags" array'] };
  }
  const errors: string[] = [];
  const flags: FlagConfig[] = [];
  const seen = new Set<string>();
  raw.flags.forEach((item, index) => {
    const flag = parseFlag(item, index, errors);
    if (!flag) return;
    if (seen.has(flag.key)) {
      errors.push(`flag "${flag.key}": duplicate key`);
      return;
    }
    seen.add(flag.key);
    flags.push(flag);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, flags };
}

// Request contexts come from HTTP clients, so they get the same strictness.
export function validateContext(raw: unknown): ContextResult {
  if (raw === undefined || raw === null) return { ok: true, context: {} };
  if (!isRecord(raw)) return { ok: false, errors: ['context must be an object'] };
  const errors: string[] = [];
  const context: EvaluationContext = {};
  for (const field of Object.keys(raw)) {
    if (field !== 'targetingKey' && field !== 'attributes') errors.push(`context: unknown field "${field}"`);
  }
  if (raw.targetingKey !== undefined) {
    if (typeof raw.targetingKey === 'string') context.targetingKey = raw.targetingKey;
    else errors.push('context.targetingKey must be a string');
  }
  if (raw.attributes !== undefined) {
    if (!isRecord(raw.attributes)) {
      errors.push('context.attributes must be an object');
    } else {
      const attributes: Record<string, AttributeValue> = {};
      for (const [name, value] of Object.entries(raw.attributes)) {
        if (isAttributeValue(value)) attributes[name] = value;
        else errors.push(`context.attributes.${name}: must be a string, number, boolean or array of strings`);
      }
      context.attributes = attributes;
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, context };
}
