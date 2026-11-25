// The scene's four sounds, rendered from numbers. Pure: no globals, no WebAudio, no
// Math.random. Each function returns a mono Float32Array at the sample rate it is given;
// the same seed and rate always give the same samples. Accumulation is in doubles, and the
// result is DC-blocked, faded to exact zero at the end and peak-normalized to its target
// in tuning.js. Every sound starts at exactly zero and rises with a smooth onset.
import { rngFor } from '../core/rng.js';
import { A3, AUDIO_SEED, D3, D4, D5, DURATION_S, HOVER_NOTES, PEAK_TARGET_DB, PENTATONIC_RATIOS, TICK_VARIANTS, dbToGain } from './tuning.js';

const TWO_PI = 2 * Math.PI;

/**
 * Partials of a small struck brass bell, tuned like a handbell: the fundamental, a weak
 * octave, the twelfth (exactly 3x) split into a slow-beating doublet, and four inharmonic
 * upper modes that give the strike its metal and die quickly.
 * Each row: [frequency ratio, amplitude, decay time relative to the fundamental's].
 */
const BELL = Object.freeze([
  [1, 1, 1],
  [2, 0.15, 0.6],
  [3, 0.2, 0.42],
  [3.0045, 0.1, 0.42],
  [4.17, 0.075, 0.2],
  [5.41, 0.05, 0.13],
  [6.78, 0.028, 0.09],
  [8.22, 0.014, 0.06],
]);
/** A soft felt mallet passes little above this (Hz): partial weight 1 / (1 + (f / fc)^2). */
const MALLET_HZ = 2400;
/** Variants of the crank tick: small pitch shifts of one wooden-brass click. */
const TICK_SHIFTS = Object.freeze([1, 1.047, 0.958, 1.091]);

/** @param {number} sampleRate */
function checkRate(sampleRate) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000) throw new RangeError(`audio: bad sample rate ${sampleRate}`);
  return sampleRate;
}

/** Smooth rise from 0 to 1 over x in [0, 1], zero slope at both ends: x^4 (5 - 4x). @param {number} x */
const onset = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * x * (5 - 4 * x));
/** @param {number} x */
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Adds one decaying sine mode to `out`: zero phase at `at` seconds, a smooth rise over
 * `rise` seconds, then exponential decay with time constant `tau`. Phasor recursion in
 * doubles, so the pitch is exact and a mode costs a few multiplies per sample.
 * @param {Float64Array} out @param {number} sr @param {number} at @param {number} hz
 * @param {number} amp @param {number} tau @param {number} rise
 */
function addMode(out, sr, at, hz, amp, tau, rise) {
  if (!(amp > 0) || !(hz > 0) || hz >= sr * 0.45) return;
  const w = TWO_PI * hz / sr;
  const c = Math.cos(w), s = Math.sin(w);
  const start = Math.round(at * sr);
  const nRise = Math.max(1, Math.round(rise * sr));
  const riseEnd = Math.min(out.length, start + nRise);
  let re = amp, im = 0, n = start;
  for (; n < riseEnd; n++) {
    out[n] += im * onset((n - start) / nRise);
    const r = re * c - im * s; im = re * s + im * c; re = r;
  }
  const d = Math.exp(-1 / (tau * sr));
  // Stop once the mode is 100 dB under the strike (voices are mixed at unit scale), or 120 dB under itself.
  const floor2 = Math.max(1e-10, (amp * 1e-6) ** 2);
  for (let k = 0; n < out.length; n++, k++) {
    out[n] += im;
    const r = (re * c - im * s) * d; im = (re * s + im * c) * d; re = r;
    if ((k & 511) === 511 && re * re + im * im < floor2) break;
  }
}

/** Uniform white noise in [-1, 1). @param {() => number} rng @param {number} n */
function white(rng, n) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = rng() * 2 - 1;
  return out;
}

/**
 * Two cascaded one-pole low-passes, in place. @param {Float64Array} x @param {number} sr @param {number} hz
 */
function lowpass2(x, sr, hz) {
  const a = 1 - Math.exp(-TWO_PI * hz / sr);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { y1 += a * (x[i] - y1); y2 += a * (y1 - y2); x[i] = y2; }
  return x;
}

/**
 * Band-pass with a moving centre (topology-preserving state-variable filter, unity gain
 * at the centre). @param {Float64Array} x @param {number} sr
 * @param {(t: number) => number} hzAt centre in Hz at time t seconds @param {number} q
 */
function bandpassSweep(x, sr, hzAt, q) {
  const k = 1 / q;
  let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
  const out = new Float64Array(x.length);
  for (let n = 0; n < x.length; n++) {
    if ((n & 31) === 0) {
      const g = Math.tan(Math.PI * Math.min(hzAt(n / sr), sr * 0.45) / sr);
      a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    }
    const v3 = x[n] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    out[n] = k * v1;
  }
  return out;
}

/** Multiplies `x` by env(t) sample by sample. @param {Float64Array} x @param {number} sr @param {(t: number) => number} env */
function shape(x, sr, env) {
  for (let n = 0; n < x.length; n++) x[n] *= env(n / sr);
  return x;
}

/** Largest absolute sample. @param {ArrayLike<number>} x */
function peakOf(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; }
  return p;
}

/** Adds `src * (level / peak(src))` into `dst`. @param {Float64Array} dst @param {Float64Array} src @param {number} level */
function mixAt(dst, src, level) {
  const p = peakOf(src);
  if (!(p > 0)) return;
  const g = level / p;
  const n = Math.min(dst.length, src.length);
  for (let i = 0; i < n; i++) dst[i] += src[i] * g;
}

/**
 * The common finish: 20 Hz DC blocker, raised-cosine fade to exact zero over the last
 * `fade` seconds, peak normalization to `db` dBFS, then Float32.
 * @param {Float64Array} x @param {number} sr @param {number} fade @param {number} db
 */
function finish(x, sr, fade, db) {
  const R = Math.exp(-TWO_PI * 20 / sr);
  let px = 0, py = 0;
  for (let i = 0; i < x.length; i++) { const y = x[i] - px + R * py; px = x[i]; py = y; x[i] = y; }
  const nf = Math.min(x.length, Math.max(1, Math.round(fade * sr)));
  for (let i = 0; i < nf; i++) x[x.length - nf + i] *= 0.5 * (1 + Math.cos(Math.PI * (i + 1) / nf));
  const p = peakOf(x);
  const g = p > 0 ? dbToGain(db) / p : 0;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * g;
  return out;
}

/**
 * One soft-mallet strike of the brass bell, added into `out`.
 * @param {Float64Array} out @param {number} sr @param {number} at seconds
 * @param {number} hz fundamental @param {number} gain @param {number} tau fundamental decay (s)
 * @param {number} rise onset (s) @param {(() => number) | null} rng felt-contact noise, or none
 */
function strike(out, sr, at, hz, gain, tau, rise, rng) {
  for (const [ratio, amp, decay] of BELL) {
    const f = hz * ratio;
    addMode(out, sr, at, f, gain * amp / (1 + (f / MALLET_HZ) ** 2), tau * decay, rise);
  }
  if (!rng) return;
  // The felt touching the metal: 40 ms of dark noise under the attack, about -30 dB.
  const len = Math.round(0.04 * sr);
  const start = Math.round(at * sr);
  const burst = lowpass2(white(rng, len), sr, 1400);
  const nRise = Math.max(1, Math.round(rise * sr));
  const d = Math.exp(-1 / (0.006 * sr));
  let decay = 1;
  for (let i = 0; i < len && start + i < out.length; i++) {
    let env;
    if (i < nRise) env = onset(i / nRise);
    else { env = decay; decay *= d; }
    out[start + i] += burst[i] * env * gain * 0.09;
  }
}

/**
 * A harmonic tone that swells in and out and brightens at its crest, like a soft horn.
 * Rises (raised cosine) from t0 to tPeak, falls (raised cosine) to zero at tEnd.
 * @param {Float64Array} out @param {number} sr @param {number} hz
 * @param {number} t0 @param {number} tPeak @param {number} tEnd @param {number} amp
 */
function addSwell(out, sr, hz, t0, tPeak, tEnd, amp) {
  const w = TWO_PI * hz / sr;
  const c = Math.cos(w), s = Math.sin(w);
  const n0 = Math.round(t0 * sr), nP = Math.round(tPeak * sr), nE = Math.min(out.length, Math.round(tEnd * sr));
  let re = 1, im = 0;
  for (let n = n0; n < nE; n++) {
    const env = n < nP ? 0.5 - 0.5 * Math.cos(Math.PI * (n - n0) / (nP - n0)) : 0.5 + 0.5 * Math.cos(Math.PI * (n - nP) / (nE - nP));
    const b = 0.28 + 0.2 * env;
    // sin(k phi) for k = 1..5 by the Chebyshev recurrence, weighted b^(k-1).
    const c2 = 2 * re;
    let sPrev = 0, sCur = im, sum = 0, wk = 1;
    for (let k = 1; k <= 5 && k * hz < sr * 0.45; k++) {
      sum += wk * sCur;
      const sNext = c2 * sCur - sPrev; sPrev = sCur; sCur = sNext;
      wk *= b;
    }
    out[n] += amp * env * sum;
    const r = re * c - im * s; im = re * s + im * c; re = r;
  }
}

/**
 * Hover: one bell note of the D major pentatonic, about 0.95 s with its tail.
 * @param {number} note 0..4 (D5, E5, F#5, A5, B5)
 * @param {number} sampleRate
 * @param {number | string} [seed]
 * @returns {Float32Array}
 */
export function hoverVoice(note, sampleRate, seed = AUDIO_SEED) {
  const sr = checkRate(sampleRate);
  const entry = HOVER_NOTES[note];
  if (!entry) throw new RangeError(`hoverVoice: note must be 0..${HOVER_NOTES.length - 1}`);
  const out = new Float64Array(Math.round(DURATION_S.hover * sr));
  strike(out, sr, 0, entry.hz, 1, 0.27 * Math.sqrt(D5 / entry.hz), 0.007, rngFor(seed, `audio:hover:${note}`));
  return finish(out, sr, 0.3, PEAK_TARGET_DB.hover);
}

/**
 * Release: a descending pentatonic run (B5 down to E4) that lands on a bell D4, with a D3
 * and A3 horn swell under it and a soft band of noise sweeping down into the landing. 1.6 s.
 * @param {number} sampleRate
 * @param {number | string} [seed]
 * @returns {Float32Array}
 */
export function releaseVoice(sampleRate, seed = AUDIO_SEED) {
  const sr = checkRate(sampleRate);
  const n = Math.round(DURATION_S.release * sr);
  const rng = rngFor(seed, 'audio:release');

  const bells = new Float64Array(n);
  const down = [...PENTATONIC_RATIOS].reverse();
  const run = [...down.map(r => D5 * r), ...down.slice(0, 4).map(r => D4 * r)];
  let t = 0;
  run.forEach((hz, k) => {
    strike(bells, sr, t, hz, 0.5 - 0.018 * k, 0.17 * Math.sqrt(D5 / hz), 0.006, rng);
    t += 0.04 * 1.07 ** k;
  });
  const land = t;
  strike(bells, sr, land, D4, 1, 0.55, 0.009, rng);

  const swell = new Float64Array(n);
  addSwell(swell, sr, D3, land - 0.08, land + 0.47, DURATION_S.release - 0.02, 1);
  addSwell(swell, sr, A3, land + 0.04, land + 0.54, DURATION_S.release - 0.02, 0.8);

  const peakAt = land - 0.02;
  const pull = shape(
    bandpassSweep(white(rng, n), sr, time => 3400 * (380 / 3400) ** clamp01(time / 0.8), 0.8),
    sr,
    time => (time < peakAt ? onset(time / peakAt) : Math.exp(-(time - peakAt) / 0.16)),
  );

  const mix = new Float64Array(n);
  mixAt(mix, bells, 1);
  mixAt(mix, swell, 0.42);
  mixAt(mix, pull, 0.11);
  return finish(mix, sr, 0.3, PEAK_TARGET_DB.release);
}

/**
 * Tick: one very soft click of a gear tooth passing the crank, 45 ms.
 * @param {number} sampleRate
 * @param {number | string} [seed]
 * @param {number} [variant] 0..TICK_VARIANTS-1, a small pitch shift
 * @returns {Float32Array}
 */
export function tickVoice(sampleRate, seed = AUDIO_SEED, variant = 0) {
  const sr = checkRate(sampleRate);
  if (!(variant >= 0 && variant < TICK_VARIANTS && Number.isInteger(variant))) throw new RangeError(`tickVoice: variant must be 0..${TICK_VARIANTS - 1}`);
  const shift = TICK_SHIFTS[variant];
  const n = Math.round(DURATION_S.tick * sr);
  const rise = 0.005;

  const body = new Float64Array(n);
  addMode(body, sr, 0, 1870 * shift, 1, 0.006, rise);
  addMode(body, sr, 0, 3180 * shift, 0.5, 0.0038, rise);
  addMode(body, sr, 0, 960 * shift, 0.32, 0.009, rise);

  const click = shape(
    bandpassSweep(white(rngFor(seed, `audio:tick:${variant}`), n), sr, () => 4300 * shift, 1.4),
    sr,
    time => (time < rise ? onset(time / rise) : Math.exp(-(time - rise) / 0.003)),
  );

  const mix = new Float64Array(n);
  mixAt(mix, body, 1);
  mixAt(mix, click, 0.45);
  return finish(mix, sr, 0.01, PEAK_TARGET_DB.tick);
}

/**
 * Lights: the room reveal. A soft low thump (a pitch-dropping sine with a little body
 * noise) and a rising shimmer of high pentatonic glints over a brightening breath. 1.15 s.
 * @param {number} sampleRate
 * @param {number | string} [seed]
 * @returns {Float32Array}
 */
export function lightsVoice(sampleRate, seed = AUDIO_SEED) {
  const sr = checkRate(sampleRate);
  const n = Math.round(DURATION_S.lights * sr);
  const rng = rngFor(seed, 'audio:lights');

  // Thump: 94 Hz falling to 50 Hz, with 2nd and 3rd harmonics so small speakers carry it.
  const thump = new Float64Array(n);
  let phase = 0;
  const rise = 0.012;
  for (let i = 0; i < n; i++) {
    const time = i / sr;
    const env = time < rise ? onset(time / rise) : Math.exp(-(time - rise) / 0.16);
    if (env < 1e-6 && time > rise) break;
    thump[i] = env * (Math.sin(phase) + 0.32 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase));
    phase += TWO_PI * (50 + 44 * Math.exp(-time / 0.05)) / sr;
  }
  const thud = shape(lowpass2(white(rng, n), sr, 260), sr, time => (time < 0.008 ? onset(time / 0.008) : Math.exp(-(time - 0.008) / 0.035)));
  mixAt(thump, thud, 0.35 * peakOf(thump));

  // Shimmer: nine glints climbing the pentatonic from D6 to A7, each with a twin 5 cents up,
  // growing as they climb so the shimmer rises in level as well as pitch.
  const shimmer = new Float64Array(n);
  const glints = [2, 2.25, 2.5, 3, 10 / 3, 4, 4.5, 5, 6];
  glints.forEach((ratio, i) => {
    const at = 0.1 + 0.52 * (i / (glints.length - 1)) ** 0.8;
    const amp = 0.35 + 0.05 * i;
    addMode(shimmer, sr, at, D5 * ratio, amp, 0.3, 0.03);
    addMode(shimmer, sr, at, D5 * ratio * 2 ** (5 / 1200), amp * 0.5, 0.3, 0.03);
  });

  // Breath: band-passed noise sweeping 2.2 kHz -> 7.5 kHz, swelling to 0.72 s.
  const air = shape(
    bandpassSweep(white(rng, n), sr, time => 2200 * (7500 / 2200) ** clamp01((time - 0.05) / 0.8), 1.1),
    sr,
    time => (time < 0.05 ? 0 : time < 0.72 ? 0.5 - 0.5 * Math.cos(Math.PI * (time - 0.05) / 0.67) : time < 1.1 ? 0.5 + 0.5 * Math.cos(Math.PI * (time - 0.72) / 0.38) : 0),
  );

  const mix = new Float64Array(n);
  mixAt(mix, thump, 1);
  mixAt(mix, shimmer, 0.55);
  mixAt(mix, air, 0.12);
  return finish(mix, sr, 0.18, PEAK_TARGET_DB.lights);
}

/**
 * Every buffer the player needs, rendered once.
 * @param {number} sampleRate
 * @param {number | string} [seed]
 * @returns {{ sampleRate: number, hover: Float32Array[], release: Float32Array, tick: Float32Array[], lights: Float32Array }}
 */
export function renderVoices(sampleRate, seed = AUDIO_SEED) {
  return {
    sampleRate,
    hover: HOVER_NOTES.map((_, i) => hoverVoice(i, sampleRate, seed)),
    release: releaseVoice(sampleRate, seed),
    tick: Array.from({ length: TICK_VARIANTS }, (_, i) => tickVoice(sampleRate, seed, i)),
    lights: lightsVoice(sampleRate, seed),
  };
}
