// Evaluate one flag for one context. Pure: no I/O, no clock, no randomness.
import { matches } from './conditions.ts';
import { bucketFor } from './hash.ts';
import { pickVariant } from './rollout.ts';
import type { EvaluationContext, EvaluationResult, FlagConfig, Reason, Split } from './types.ts';

function serve(
  flag: FlagConfig,
  variant: string,
  reason: Reason,
  extra: Partial<EvaluationResult> = {},
): EvaluationResult {
  return { flagKey: flag.key, value: flag.variants[variant] ?? null, variant, reason, ...extra };
}

function serveSplit(flag: FlagConfig, splits: Split[], ctx: EvaluationContext, ruleIndex?: number): EvaluationResult {
  if (typeof ctx.targetingKey !== 'string' || ctx.targetingKey === '') {
    // Without a targeting key we cannot bucket. Serve the default, flag the error.
    return serve(flag, flag.defaultVariant, 'ERROR', { errorCode: 'TARGETING_KEY_MISSING' });
  }
  const variant = pickVariant(splits, bucketFor(flag, ctx.targetingKey));
  return serve(flag, variant, 'SPLIT', ruleIndex === undefined ? {} : { ruleIndex });
}

// Order: disabled -> first matching rule -> fallthrough rollout -> default variant.
export function evaluateFlag(flag: FlagConfig, ctx: EvaluationContext = {}): EvaluationResult {
  if (!flag.enabled) return serve(flag, flag.offVariant, 'DISABLED');

  for (let i = 0; i < flag.rules.length; i++) {
    const rule = flag.rules[i];
    if (!rule.conditions.every((condition) => matches(condition, ctx))) continue;
    if (rule.rollout) return serveSplit(flag, rule.rollout, ctx, i);
    return serve(flag, rule.variant!, 'TARGETING_MATCH', { ruleIndex: i });
  }

  if (flag.rollout) return serveSplit(flag, flag.rollout, ctx);
  return serve(flag, flag.defaultVariant, 'DEFAULT');
}
