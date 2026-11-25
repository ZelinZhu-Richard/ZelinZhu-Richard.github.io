// Sky data for "Ridge, 3 a.m.": a seeded star field and long-exposure trails.
// Pure JS (the aurora itself lives in the sky shader, sky.js).

import { mulberry32 } from './world.js';

// ---------------------------------------------------------------- stars

function randomDir(rand) {
  const u = rand() * 2 - 1;
  const phi = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return [r * Math.cos(phi), u, r * Math.sin(phi)];
}

// Magnitude-like brightness: many faint stars, very few bright ones.
function brightness(rand) {
  return Math.pow(rand(), 4.2);
}

// Static star field on the upper sky. Returns directions with size (css px) and alpha.
export function starField(count = 6500, seed = 0x57a12) {
  const rand = mulberry32(seed);
  const stars = [];
  while (stars.length < count) {
    const d = randomDir(rand);
    const b = brightness(rand);
    if (d[1] < 0.015) continue;
    stars.push({ dir: d, size: 1.0 + 1.5 * b, alpha: 0.16 + 0.8 * b, b });
  }
  return stars;
}

function rotateAbout(v, k, ang) {
  // Rodrigues: rotate v about unit axis k
  const c = Math.cos(ang), s = Math.sin(ang);
  const kv = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  const kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  return [
    v[0] * c + kv[0] * s + k[0] * kd * (1 - c),
    v[1] * c + kv[1] * s + k[1] * kd * (1 - c),
    v[2] * c + kv[2] * s + k[2] * kd * (1 - c),
  ];
}

export function poleDir(az, el) {
  // az: 0 = north (-z), positive toward east (+x)
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

// Long-exposure trails: every star sweeps the same angle about the pole.
// Returns arcs as lists of unit directions plus width (css px) and alpha.
export function starTrails(pole, { count = 1700, sweep = (50 * Math.PI) / 180, maxPolar = (80 * Math.PI) / 180, seed = 0x7a115 } = {}) {
  const rand = mulberry32(seed);
  const arcs = [];
  let guard = 0;
  while (arcs.length < count && guard++ < count * 20) {
    const d = randomDir(rand);
    const cosP = d[0] * pole[0] + d[1] * pole[1] + d[2] * pole[2];
    const polar = Math.acos(Math.min(1, Math.max(-1, cosP)));
    if (polar > maxPolar) continue;
    const b = brightness(rand);
    // keep the sky sparse near the pole: thin out faint stars there
    if (b < 0.08 && rand() < 0.35) continue;
    const start = rand() * Math.PI * 2;
    const d0 = rotateAbout(d, pole, start);
    const arcLen = Math.sin(polar) * sweep; // radians on the sphere
    const segs = Math.max(5, Math.ceil(arcLen / 0.024));
    const pts = [];
    for (let i = 0; i <= segs; i++) pts.push(rotateAbout(d0, pole, (sweep * i) / segs));
    arcs.push({ pts, width: 0.85 + 0.9 * b, alpha: 0.13 + 0.75 * b, b });
  }
  return arcs;
}
