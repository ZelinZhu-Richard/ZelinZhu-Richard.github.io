// Percentage rollouts. Weights are percents; we work in basis points
// (1/100 of a percent) so that 33.33 + 33.33 + 33.34 adds up exactly.
import type { Split } from './types.ts';

// 12.5 -> 1250. Returns null for weights outside 0..100 or with more than two decimals.
export function toBasisPoints(weight: number): number | null {
  if (!Number.isFinite(weight) || weight < 0 || weight > 100) return null;
  const points = Math.round(weight * 100);
  if (Math.abs(weight * 100 - points) > 1e-6) return null;
  return points;
}

// Split i owns buckets [start_i, start_i + weight_i * 100). Splits are laid out in
// config order, so reordering splits moves users between variants.
export function pickVariant(splits: Split[], bucket: number): string {
  let upper = 0;
  for (const split of splits) {
    upper += toBasisPoints(split.weight) ?? 0;
    if (bucket < upper) return split.variant;
  }
  // Validated weights add up to 100, so we only get here if bucket >= 10000.
  return splits[splits.length - 1].variant;
}
