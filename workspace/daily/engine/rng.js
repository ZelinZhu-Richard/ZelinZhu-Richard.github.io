// Counter-based PRNG. The stream is { seed: [4 × uint32], n } and lives in the saved state, so a refresh
// can never reroll an outcome: the same state + action always draws the same numbers.
// Draw n is a pure hash of (seed, n); nothing else is kept between draws.

import { daysBetween } from './time.js';

function mix(x) {
  // lowbias32 (Chris Wellons): a strong 32-bit integer finalizer.
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function hash(seed, c) {
  const lo = c >>> 0;
  const hi = Math.floor(c / 4294967296) >>> 0;
  let h = mix(seed[0] ^ 0x9e3779b9);
  h = mix(h ^ lo);
  h = mix(h ^ seed[1]);
  h = mix((h + hi) >>> 0);
  h = mix(h ^ seed[2]);
  h = mix((h + seed[3]) >>> 0);
  h = mix(h ^ Math.imul(lo, 0x2c1b3c6d));
  return h;
}

/** Normalize a seed: 4 uint32s, or a number expanded with splitmix32. */
export function seedFrom(input) {
  if (Array.isArray(input) && input.length === 4 && input.every((v) => Number.isInteger(v))) return input.map((v) => v >>> 0);
  let x = (Number.isFinite(input) ? Math.floor(input) : 0x2545f491) >>> 0;
  const out = [];
  for (let i = 0; i < 4; i += 1) {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    out.push((z ^ (z >>> 15)) >>> 0);
  }
  return out;
}

/** The float at position n of the stream, in [0, 1) with 53 bits. */
export function drawAt(seed, n) {
  const a = hash(seed, n * 2);
  const b = hash(seed, n * 2 + 1);
  return (a * 2097152 + (b >>> 11)) / 9007199254740992;
}

/**
 * A draw function bound to a stream object. Each call advances stream.n, so pass the stream that lives
 * in the (cloned) state to persist the counter.
 */
export function streamRng(stream) {
  return () => {
    const v = drawAt(stream.seed, stream.n);
    stream.n += 1;
    return v;
  };
}

// Side streams live far above any main-stream counter (draw n uses hash inputs 2n and 2n + 1; n < 2^50).
const SIDE_BASE = 2 ** 52;

/** A seed derived from the save's seed and an integer key: independent of the main stream and of other keys. */
export function deriveSeed(seed, k) {
  const base = SIDE_BASE + Math.floor(k) * 4;
  return [0, 1, 2, 3].map((i) => hash(seed, base + i));
}

/** The day's quest-draw stream: seeded by the save (account) and the date only; it never touches state.rng.n. */
export function questRng(seed, dayKey) {
  return streamRng({ seed: deriveSeed(seed, daysBetween('1970-01-01', dayKey)), n: 0 });
}

/** Helpers over any rng() → [0, 1). */
export const rInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive
export const rPick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const rChance = (rng, p) => rng() < p;

export function rShuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick by weights: entries [{ weight }]. */
export function rWeighted(rng, entries) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let x = rng() * total;
  for (const e of entries) {
    x -= e.weight;
    if (x < 0) return e;
  }
  return entries[entries.length - 1];
}

/** Index from a probability vector (sums to ~1). */
export function rIndex(rng, probs) {
  const x = rng();
  let acc = 0;
  for (let i = 0; i < probs.length; i += 1) {
    acc += probs[i];
    if (x < acc) return i;
  }
  for (let i = probs.length - 1; i >= 0; i -= 1) if (probs[i] > 0) return i;
  return 0;
}

export function rBinomial(rng, n, p) {
  let k = 0;
  for (let i = 0; i < n; i += 1) if (rng() < p) k += 1;
  return k;
}

/** Fresh random seed for a new game (browser / Deno / Node all have crypto.getRandomValues). */
export function randomSeed() {
  const a = new Uint32Array(4);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a);
}
