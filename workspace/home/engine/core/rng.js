// Seeded randomness for the scene. Pure: no imports, no globals, no Math.random.
// Every random draw in the engine comes from rngFor(seed, key), so the same seed and
// key always give the same sequence, and adding a new key never shifts an old one.

/**
 * sfc32 (Small Fast Counting, Chris Doty-Humphrey). Four 32-bit words of state.
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @returns {() => number} uniform floats in [0, 1)
 */
export function sfc32(a, b, c, d) {
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  return function next() {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    return t / 4294967296;
  };
}

/**
 * cyrb128: hashes a string to four 32-bit words, used as sfc32 state.
 * @param {string} text
 * @returns {[number, number, number, number]}
 */
export function hash128(text) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * A generator for one named use of one seed, e.g. rngFor(7, 'stone:about').
 * The first 12 outputs are discarded so similar keys start far apart.
 * @param {number | string} seed
 * @param {string} key
 * @returns {() => number} uniform floats in [0, 1)
 */
export function rngFor(seed, key) {
  const next = sfc32(...hash128(`${seed}\u0000${key}`));
  for (let i = 0; i < 12; i++) next();
  return next;
}
