// Seeded PRNG (mulberry32). The sketch never calls Math.random, so the same URL
// always draws the same frame.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}
