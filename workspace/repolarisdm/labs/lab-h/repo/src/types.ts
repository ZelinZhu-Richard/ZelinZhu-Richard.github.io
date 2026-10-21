// Shared types for flag configs, evaluation contexts and evaluation results.
// docs/flag-format.md describes the JSON format these types model.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Operator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'starts_with'
  | 'ends_with'
  | 'contains';

// Runtime list of operators. Keep in sync with the Operator union above.
export const OPERATORS: readonly Operator[] = [
  'eq',
  'neq',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'starts_with',
  'ends_with',
  'contains',
];

export type AttributeValue = string | number | boolean | string[];

export interface Condition {
  attribute: string;
  op: Operator;
  value: AttributeValue;
}

export interface Split {
  variant: string;
  // Percent of users, 0 to 100, at most two decimals (12.5 and 33.33 are fine).
  weight: number;
}

export interface Rule {
  name?: string;
  // All conditions must match. A rule with no conditions matches everyone.
  conditions: Condition[];
  // Exactly one of `variant` and `rollout` is set (validate.ts enforces this).
  variant?: string;
  rollout?: Split[];
}

export interface FlagConfig {
  key: string;
  description?: string;
  enabled: boolean;
  variants: Record<string, JsonValue>;
  defaultVariant: string;
  offVariant: string;
  // Bucketing seed. Defaults to the flag key. Change it to reshuffle users.
  salt?: string;
  rules: Rule[];
  // Fallthrough rollout, used when no rule matches.
  rollout?: Split[];
}

export interface EvaluationContext {
  targetingKey?: string;
  attributes?: Record<string, AttributeValue>;
}

export type Reason = 'DISABLED' | 'TARGETING_MATCH' | 'SPLIT' | 'DEFAULT' | 'ERROR';

export type ErrorCode = 'FLAG_NOT_FOUND' | 'TARGETING_KEY_MISSING';

export interface EvaluationResult {
  flagKey: string;
  value: JsonValue;
  variant: string | null;
  reason: Reason;
  ruleIndex?: number;
  errorCode?: ErrorCode;
}
