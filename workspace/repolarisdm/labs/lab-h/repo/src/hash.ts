// Deterministic user bucketing. docs/bucketing.md is the contract: the Python
// and Go SDKs implement the same function, so a user must land in the same
// bucket everywhere.
import type { FlagConfig } from './types.ts';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const encoder = new TextEncoder();

export const BUCKET_COUNT = 10_000;

// FNV-1a, 32 bit, over the UTF-8 bytes of `input`.
export function fnv1a32(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of encoder.encode(input)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash;
}

// Bucket in [0, BUCKET_COUNT) for one user of one flag.
export function bucketFor(flag: Pick<FlagConfig, 'key' | 'salt'>, targetingKey: string): number {
  return fnv1a32(`${flag.salt ?? flag.key}/${targetingKey}`) % BUCKET_COUNT;
}
