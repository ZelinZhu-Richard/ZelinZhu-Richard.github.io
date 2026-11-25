// Seeded randomness. No Math.random anywhere in this sketch: the same URL
// must always draw the same frame.

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
  const r = mulberry32(seed);
  let spare = null;
  const rng = {
    next: r,
    range: (a, b) => a + (b - a) * r(),
    int: (a, b) => a + Math.floor((b - a + 1) * r()),
    sign: () => (r() < 0.5 ? -1 : 1),
    normal() {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let u = 0;
      let v = 0;
      while (u < 1e-12) u = r();
      v = r();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return m * Math.cos(2 * Math.PI * v);
    },
    // Uniform direction on the unit sphere.
    unit() {
      const z = 2 * r() - 1;
      const a = 2 * Math.PI * r();
      const s = Math.sqrt(Math.max(0, 1 - z * z));
      return [s * Math.cos(a), s * Math.sin(a), z];
    },
  };
  return rng;
}

// Smooth 3D value noise with a fixed seed, used for hand-made wobble.
export function makeNoise3(seed) {
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    p[i] = i;
    vals[i] = rnd() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const v = (x, y, z) => vals[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  return function noise(x, y, z) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const u = fade(xf);
    const w = fade(yf);
    const s = fade(zf);
    const x00 = lerp(v(xi, yi, zi), v(xi + 1, yi, zi), u);
    const x10 = lerp(v(xi, yi + 1, zi), v(xi + 1, yi + 1, zi), u);
    const x01 = lerp(v(xi, yi, zi + 1), v(xi + 1, yi, zi + 1), u);
    const x11 = lerp(v(xi, yi + 1, zi + 1), v(xi + 1, yi + 1, zi + 1), u);
    return lerp(lerp(x00, x10, w), lerp(x01, x11, w), s);
  };
}
