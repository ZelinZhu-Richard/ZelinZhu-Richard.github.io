# Bucketing contract

togglebox has three implementations of bucketing: this service, the Python SDK
(batch jobs) and the Go SDK (edge proxy). All three must put a given user of a
given flag into the **same bucket**. If they disagree, a user can see variant A
on the web and variant B in an email. This file is the contract. Code follows it.

## Steps

1. **Bucketing key.** `<seed>/<targetingKey>`. The seed is the flag's `salt`
   if it has one, otherwise the flag's `key`. Example: flag `search-v2`, no
   salt, user `u-7` → `search-v2/u-7`.
2. **Hash.** FNV-1a, 32 bit (RFC 9923), over the UTF-8 bytes of the bucketing
   key. Offset basis 2166136261 (`0x811c9dc5`), prime 16777619 (`0x01000193`).
   For each byte: `hash = hash XOR byte`, then `hash = hash * prime mod 2^32`.
   The result is an unsigned integer in `[0, 2^32)`.
3. **Bucket.** `bucket = hash mod 10000`. An integer in `[0, 9999]`.
4. **Split.** Walk the rollout's splits in config order. Split *i* owns the
   buckets `[start_i, start_i + weight_i * 100)`, where `start_0 = 0` and each
   split starts where the previous one ends. Weights add up to 100, so every
   bucket belongs to exactly one split.

A split with weight 0 owns no buckets. Changing `salt` reshuffles all users.
Reordering splits moves users between variants, so append new splits at the end.

## Reference values

Use these to test a new implementation of step 2.

| Input | FNV-1a 32 (hex) | FNV-1a 32 (decimal) |
|---|---|---|
| `""` (empty) | `0x811c9dc5` | 2166136261 |
| `"a"` | `0xe40c292c` | 3826002220 |
| `"foobar"` | `0xbf9cf968` | 3214735720 |
