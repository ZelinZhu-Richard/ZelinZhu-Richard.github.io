// The scene's sound: pure checks on the rendered voices (levels, edges, DC, length, pitch,
// determinism) and the player's rules against a stand-in AudioContext. No browser, no files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AUDIO_SEED, DURATION_S, HOVER_DAMP_DB, HOVER_NOTES, HOVER_RESET_MS, PEAK_CEILING_DB, PENTATONIC_RATIOS, TICK_MIN_INTERVAL_MS, TICK_VARIANTS, cents, dbToGain,
} from '../engine/audio/tuning.js';
import { hoverVoice, lightsVoice, releaseVoice, renderVoices, tickVoice } from '../engine/audio/voices.js';
import { createAudio } from '../engine/audio/player.js';

const RATES = [44100, 48000];
/** The hover scale as specified (Hz). */
const SPEC_HZ = [587.33, 660.74, 734.16, 881.0, 978.88];
/**
 * Level limits per voice, dBFS: ceiling is the sample and true peak ceiling; rms is over the whole
 * buffer; win is the loudest window of `winS` seconds. Lower bounds catch a voice gone silent.
 */
const LIMITS = {
  hover: { rms: -30, win: -22, winS: 0.05 },
  release: { rms: -24, win: -18, winS: 0.05 },
  tick: { rms: -42, win: -37, winS: 0.01 },
  lights: { rms: -27, win: -20, winS: 0.05 },
};

const toDb = (/** @type {number} */ x) => 20 * Math.log10(x);

/** @param {ArrayLike<number>} x @param {number} [a] @param {number} [b] */
function peak(x, a = 0, b = x.length) {
  let p = 0;
  for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}
/** @param {ArrayLike<number>} x @param {number} [a] @param {number} [b] */
function rms(x, a = 0, b = x.length) {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / (b - a));
}
/** Loudest RMS over windows of n samples, hopping n/4. @param {ArrayLike<number>} x @param {number} n */
function loudestWindow(x, n) {
  let best = 0;
  for (let a = 0; a + n <= x.length; a += Math.max(1, n >> 2)) best = Math.max(best, rms(x, a, a + n));
  return best;
}
/** @param {ArrayLike<number>} x */
function mean(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return s / x.length;
}

/**
 * True peak estimate: the sample peak and 4x windowed-sinc interpolation between samples.
 * @param {ArrayLike<number>} x
 */
function truePeak(x, over = 4, half = 12) {
  let best = peak(x);
  const kernels = [];
  for (let p = 1; p < over; p++) {
    const f = p / over;
    const k = new Float64Array(2 * half);
    for (let j = -half + 1; j <= half; j++) {
      const t = f - j;
      k[j + half - 1] = (Math.sin(Math.PI * t) / (Math.PI * t)) * (0.5 + 0.5 * Math.cos(Math.PI * t / half));
    }
    kernels.push(k);
  }
  for (let n = half; n < x.length - half; n++) {
    if (Math.abs(x[n]) < best * 0.5) continue;
    for (const k of kernels) {
      let s = 0;
      for (let j = 0; j < k.length; j++) s += k[j] * x[n - half + 1 + j];
      best = Math.max(best, Math.abs(s));
    }
  }
  return best;
}

/**
 * Fundamental by normalized autocorrelation over `len` seconds from `from`: the first lag
 * peak within 90% of the strongest one, between 150 Hz and 2 kHz, refined by a parabola.
 * @param {ArrayLike<number>} x @param {number} sr
 */
function fundamental(x, sr, from = 0.05, len = 0.2) {
  const a = Math.round(from * sr), N = Math.round(len * sr);
  const tMin = Math.floor(sr / 2000), tMax = Math.ceil(sr / 150);
  let e0 = 0;
  for (let n = a; n < a + N; n++) e0 += x[n] * x[n];
  const r = new Float64Array(tMax + 2);
  for (let t = tMin - 1; t <= tMax + 1; t++) {
    let s = 0, e1 = 0;
    for (let n = a; n < a + N; n++) { s += x[n] * x[n + t]; e1 += x[n + t] * x[n + t]; }
    r[t] = s / Math.sqrt(e0 * e1);
  }
  let max = -1;
  for (let t = tMin; t <= tMax; t++) max = Math.max(max, r[t]);
  for (let t = tMin; t <= tMax; t++) {
    if (r[t] > 0.9 * max && r[t] >= r[t - 1] && r[t] >= r[t + 1]) {
      const d = (r[t - 1] - r[t + 1]) / (2 * (r[t - 1] - 2 * r[t] + r[t + 1]));
      return sr / (t + d);
    }
  }
  return NaN;
}

/** Hann-windowed single-bin magnitude at hz over [a, b). @param {ArrayLike<number>} x */
function bin(x, sr, hz, a, b) {
  const w = 2 * Math.PI * hz / sr, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = a; i < b; i++) {
    const s = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * (i - a) / (b - a))) + c * s1 - s2;
    s2 = s1; s1 = s;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / (b - a);
}

/** @type {Map<number, ReturnType<typeof renderVoices>>} */
const rendered = new Map();
const voicesAt = (/** @type {number} */ sr) => {
  if (!rendered.has(sr)) rendered.set(sr, renderVoices(sr));
  return /** @type {ReturnType<typeof renderVoices>} */ (rendered.get(sr));
};
/** Every buffer at one rate, with its level class. @param {number} sr */
function eachVoice(sr) {
  const v = voicesAt(sr);
  return /** @type {[string, keyof typeof LIMITS, Float32Array][]} */ ([
    ...v.hover.map((x, i) => [`hover ${HOVER_NOTES[i].name}`, 'hover', x]),
    ['release', 'release', v.release],
    ...v.tick.map((x, i) => [`tick ${i}`, 'tick', x]),
    ['lights', 'lights', v.lights],
  ]);
}

test('hover scale: just D major pentatonic on D5, matching the specified pitches', () => {
  assert.deepEqual([...PENTATONIC_RATIOS], [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3]);
  assert.deepEqual(HOVER_NOTES.map(n => n.name), ['D5', 'E5', 'F#5', 'A5', 'B5']);
  HOVER_NOTES.forEach((note, i) => assert.ok(Math.abs(note.hz - SPEC_HZ[i]) < 0.01, `${note.name} ${note.hz}`));
});

test('renderVoices returns every buffer, all finite', () => {
  const v = voicesAt(48000);
  assert.equal(v.sampleRate, 48000);
  assert.equal(v.hover.length, HOVER_NOTES.length);
  assert.equal(v.tick.length, TICK_VARIANTS);
  for (const [name, , x] of eachVoice(48000)) {
    assert.ok(x instanceof Float32Array, name);
    assert.ok(x.every(Number.isFinite), `${name} has a non-finite sample`);
  }
});

test('peaks stay at or under the ceilings (hover -20, release -14, tick -30, lights -16 dBFS), true peak included', () => {
  assert.deepEqual({ ...PEAK_CEILING_DB }, { hover: -20, release: -14, tick: -30, lights: -16 });
  for (const sr of RATES) {
    for (const [name, kind, x] of eachVoice(sr)) {
      const ceiling = PEAK_CEILING_DB[kind];
      const p = toDb(peak(x)), tp = toDb(truePeak(x));
      assert.ok(p <= ceiling, `${name} @${sr}: sample peak ${p.toFixed(2)} dBFS > ${ceiling}`);
      assert.ok(tp <= ceiling, `${name} @${sr}: true peak ${tp.toFixed(2)} dBFS > ${ceiling}`);
      assert.ok(p >= ceiling - 3, `${name} @${sr}: peak ${p.toFixed(2)} dBFS is more than 3 dB under its ceiling`);
    }
  }
});

test('RMS stays inside its limits, overall and in the loudest window', () => {
  for (const sr of RATES) {
    for (const [name, kind, x] of eachVoice(sr)) {
      const lim = LIMITS[kind];
      const whole = toDb(rms(x)), win = toDb(loudestWindow(x, Math.round(lim.winS * sr)));
      assert.ok(whole <= lim.rms, `${name} @${sr}: RMS ${whole.toFixed(1)} dBFS > ${lim.rms}`);
      assert.ok(whole >= lim.rms - 12, `${name} @${sr}: RMS ${whole.toFixed(1)} dBFS, nearly silent`);
      assert.ok(win <= lim.win, `${name} @${sr}: loudest ${lim.winS * 1000} ms RMS ${win.toFixed(1)} dBFS > ${lim.win}`);
    }
  }
});

test('no DC offset', () => {
  for (const sr of RATES) {
    for (const [name, , x] of eachVoice(sr)) {
      const m = Math.abs(mean(x));
      assert.ok(m < 1e-5, `${name} @${sr}: mean ${m.toExponential(2)}`);
    }
  }
});

test('first and last 2 ms are near zero: no click at either end', () => {
  for (const sr of RATES) {
    const n = Math.round(0.002 * sr);
    for (const [name, , x] of eachVoice(sr)) {
      const p = peak(x);
      assert.equal(Math.abs(x[0]), 0, `${name} @${sr}: first sample`);
      assert.equal(Math.abs(x[x.length - 1]), 0, `${name} @${sr}: last sample`);
      const head = peak(x, 0, n), tail = peak(x, x.length - n);
      assert.ok(head <= 0.1 * p && toDb(head) <= -50, `${name} @${sr}: first 2 ms reach ${toDb(head).toFixed(1)} dBFS`);
      assert.ok(tail <= 1e-3 * p && toDb(tail) <= -80, `${name} @${sr}: last 2 ms reach ${toDb(tail).toFixed(1)} dBFS`);
    }
  }
});

test('durations: hover about 0.9 s, release about 1.6 s, tick short, lights under 1.2 s', () => {
  for (const sr of RATES) {
    const v = voicesAt(sr);
    const seconds = (/** @type {Float32Array} */ x) => x.length / sr;
    for (const x of v.hover) {
      assert.ok(seconds(x) >= 0.85 && seconds(x) <= 1.05, `hover ${seconds(x)} s`);
      // The tail is real: still ringing at 0.8 s, 30 to 50 dB under the loudest 50 ms.
      const n = Math.round(0.05 * sr), at = Math.round(0.8 * sr);
      const drop = toDb(rms(x, at, at + n) / loudestWindow(x, n));
      assert.ok(drop < -25 && drop > -50, `hover tail at 0.8 s is ${drop.toFixed(1)} dB`);
    }
    assert.ok(Math.abs(seconds(v.release) - 1.6) <= 0.05, `release ${seconds(v.release)} s`);
    for (const x of v.tick) assert.ok(seconds(x) <= 0.06, `tick ${seconds(x)} s`);
    assert.ok(seconds(v.lights) < 1.2, `lights ${seconds(v.lights)} s`);
    assert.equal(v.release.length, Math.round(DURATION_S.release * sr));
  }
});

test('each hover note sounds its fundamental within 3 cents (autocorrelation)', () => {
  for (const sr of RATES) {
    voicesAt(sr).hover.forEach((x, i) => {
      const f = fundamental(x, sr);
      const off = cents(f, SPEC_HZ[i]);
      assert.ok(Math.abs(off) <= 3, `${HOVER_NOTES[i].name} @${sr}: ${f.toFixed(3)} Hz is ${off.toFixed(2)} cents off`);
    });
  }
});

test('release settles on D and A: the scale tones tower over the notes outside it', () => {
  for (const sr of RATES) {
    const x = voicesAt(sr).release;
    const a = Math.round(0.9 * sr), b = Math.round(1.4 * sr);
    const inside = Math.min(...[146.83, 220.25, 293.67].map(hz => bin(x, sr, hz, a, b)));
    const outside = Math.max(...[207.65, 261.63, 311.13, 392].map(hz => bin(x, sr, hz, a, b)));
    assert.ok(toDb(inside / outside) > 40, `D3/A3/D4 only ${toDb(inside / outside).toFixed(1)} dB over G#3/C4/D#4/G4`);
  }
});

test('lights: the shimmer rises (more high-band energy at 0.55 s than at 0.25 s)', () => {
  for (const sr of RATES) {
    const x = voicesAt(sr).lights;
    const hf = new Float64Array(x.length);
    for (let i = 2; i < x.length; i++) hf[i] = x[i] - 2 * x[i - 1] + x[i - 2];
    const n = Math.round(0.1 * sr);
    const early = rms(hf, Math.round(0.2 * sr), Math.round(0.2 * sr) + n);
    const late = rms(hf, Math.round(0.5 * sr), Math.round(0.5 * sr) + n);
    assert.ok(toDb(late / early) > 2, `shimmer rises only ${toDb(late / early).toFixed(1)} dB`);
  }
});

test('deterministic: the same seed gives the same samples; another seed changes only the noise', () => {
  const sr = 44100;
  assert.deepEqual(releaseVoice(sr, 7), releaseVoice(sr, 7));
  assert.deepEqual(lightsVoice(sr, 7), lightsVoice(sr, 7));
  assert.deepEqual(tickVoice(sr, 7, 2), tickVoice(sr, 7, 2));
  assert.deepEqual(hoverVoice(3, sr, 7), hoverVoice(3, sr, 7));
  assert.deepEqual(hoverVoice(0, sr), hoverVoice(0, sr, AUDIO_SEED));
  assert.notDeepEqual(releaseVoice(sr, 7), releaseVoice(sr, 8));
  assert.notDeepEqual(tickVoice(sr, 7, 0), tickVoice(sr, 8, 0));
  const a = hoverVoice(2, sr, 7), b = hoverVoice(2, sr, 8);
  assert.notDeepEqual(a, b);
  assert.ok(Math.abs(cents(fundamental(a, sr), fundamental(b, sr))) < 0.01, 'the seed must not move the pitch');
});

test('voices reject bad input', () => {
  assert.throws(() => hoverVoice(5, 48000), RangeError);
  assert.throws(() => hoverVoice(-1, 48000), RangeError);
  assert.throws(() => hoverVoice(0, NaN), RangeError);
  assert.throws(() => tickVoice(48000, AUDIO_SEED, TICK_VARIANTS), RangeError);
  assert.throws(() => releaseVoice(1000), RangeError);
});

test('audio modules stay pure: relative imports only, no Math.random, no browser globals in voices or tuning', async () => {
  const strip = (/** @type {string} */ s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  for (const file of ['tuning.js', 'voices.js', 'player.js']) {
    const source = strip(await readFile(new URL(`../engine/audio/${file}`, import.meta.url), 'utf8'));
    for (const m of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) assert.ok(/^\.\.?\//.test(m[1]), `${file} imports ${m[1]}`);
    assert.ok(!/\bimport\s*\(/.test(source), `${file} has a dynamic import`);
    assert.ok(!/Math\.random/.test(source), `${file} uses Math.random`);
    if (file !== 'player.js') assert.ok(!/\b(?:window|document|globalThis|AudioContext|performance|setTimeout)\b/.test(source), `${file} touches a browser global`);
  }
});

// ---------------------------------------------------------------------------------------------
// The player, against a stand-in AudioContext.

/** @param {{ startState?: string, sampleRate?: number }} [opts] */
function fakeWebAudio({ startState = 'suspended', sampleRate = 48000 } = {}) {
  /** @type {any[]} */
  const contexts = [];
  class Param {
    /** @param {number} v */
    constructor(v) { this.value = v; /** @type {any[]} */ this.calls = []; }
    /** @param {number} v @param {number} t @param {number} tc */ setTargetAtTime(v, t, tc) { this.calls.push(['target', v, t, tc]); this.value = v; }
    /** @param {number} t */ cancelScheduledValues(t) { this.calls.push(['cancel', t]); }
    /** @param {number} v @param {number} t */ setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; }
    /** @param {number} v @param {number} t */ linearRampToValueAtTime(v, t) { this.calls.push(['ramp', v, t]); this.value = v; }
  }
  class Node {
    /** @param {string} kind */
    constructor(kind) { this.kind = kind; /** @type {any[]} */ this.outputs = []; }
    /** @param {any} node */ connect(node) { this.outputs.push(node); return node; }
    disconnect() { this.outputs = []; }
  }
  class FakeContext {
    /** @param {any} [options] */
    constructor(options) {
      this.options = options;
      this.sampleRate = sampleRate;
      this.state = startState;
      this.currentTime = 0;
      this.destination = new Node('destination');
      /** @type {any[]} */ this.buffers = [];
      /** @type {any[]} */ this.sources = [];
      /** @type {any[]} */ this.gains = [];
      /** @type {string[]} */ this.calls = [];
      /** @type {any} */ this.compressor = null;
      contexts.push(this);
    }
    createGain() { const n = /** @type {any} */ (new Node('gain')); n.gain = new Param(1); this.gains.push(n); return n; }
    createDynamicsCompressor() {
      const n = /** @type {any} */ (new Node('compressor'));
      for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[key] = new Param(0);
      this.compressor = n;
      return n;
    }
    /** @param {number} channels @param {number} length @param {number} rate */
    createBuffer(channels, length, rate) {
      const data = new Float32Array(length);
      const b = { numberOfChannels: channels, length, sampleRate: rate, data, /** @param {Float32Array} src */ copyToChannel(src) { data.set(src); }, getChannelData() { return data; } };
      this.buffers.push(b);
      return b;
    }
    createBufferSource() {
      const s = /** @type {any} */ (new Node('source'));
      s.buffer = null;
      s.playbackRate = new Param(1);
      s.startedAt = null;
      s.stoppedAt = null;
      s.start = (/** @type {number} */ t = 0) => { s.startedAt = t; };
      s.stop = (/** @type {number} */ t = 0) => { s.stoppedAt = t; };
      this.sources.push(s);
      return s;
    }
    resume() { this.calls.push('resume'); if (this.state !== 'closed') this.state = 'running'; return Promise.resolve(); }
    suspend() { this.calls.push('suspend'); if (this.state !== 'closed') this.state = 'suspended'; return Promise.resolve(); }
    close() { this.calls.push('close'); this.state = 'closed'; return Promise.resolve(); }
  }
  return { Ctor: FakeContext, contexts };
}

function fakeDocument() {
  /** @type {Set<Function>} */
  const listeners = new Set();
  return {
    visibilityState: 'visible',
    /** @param {string} type @param {Function} fn */ addEventListener(type, fn) { if (type === 'visibilitychange') listeners.add(fn); },
    /** @param {string} type @param {Function} fn */ removeEventListener(type, fn) { if (type === 'visibilitychange') listeners.delete(fn); },
    /** @param {'visible' | 'hidden'} state */ set(state) { this.visibilityState = state; for (const fn of [...listeners]) fn(); },
    listeners,
  };
}

/** A player wired to fakes, with a manual clock and task queue. */
function rig({ enabled = true, startState = 'suspended' } = {}) {
  const web = fakeWebAudio({ startState });
  const doc = fakeDocument();
  const clock = { ms: 10_000 };
  /** @type {(() => void)[]} */
  const queue = [];
  const audio = createAudio({ enabled, AudioContext: /** @type {any} */ (web.Ctor), document: /** @type {any} */ (doc), now: () => clock.ms, defer: fn => { queue.push(fn); } });
  const flush = () => { while (queue.length) /** @type {() => void} */ (queue.shift())(); };
  const ctx = () => web.contexts[0];
  /** The voice buffers the player has started, oldest first (the 1-sample unlock primer excluded). */
  const played = () => ctx().sources.filter((/** @type {any} */ s) => s.startedAt !== null && s.buffer.length > 1).map((/** @type {any} */ s) => s.buffer);
  return { web, doc, clock, audio, flush, ctx, played, queue };
}

/** Which hover note a started buffer holds. @param {any} buffer */
function hoverNoteOf(buffer) {
  const refs = HOVER_NOTES.map((_, i) => hoverVoice(i, buffer.sampleRate));
  return refs.findIndex(ref => ref.length === buffer.data.length && ref[2000] === buffer.data[2000] && ref[4000] === buffer.data[4000]);
}

test('player: the documented shape', () => {
  const audio = createAudio({ AudioContext: null, document: null });
  assert.deepEqual(Object.keys(audio).sort(), ['dispose', 'enabled', 'hover', 'lights', 'release', 'resume', 'setEnabled', 'suspend', 'tick', 'unlock']);
  for (const key of Object.keys(audio)) if (key !== 'enabled') assert.equal(typeof /** @type {any} */ (audio)[key], 'function', key);
  assert.equal(audio.enabled, false);
});

test('player: without WebAudio every call is a safe no-op', async () => {
  const audio = createAudio({ AudioContext: null, document: null, enabled: true });
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.hover(), false);
  assert.equal(audio.release(), false);
  assert.equal(audio.tick(), false);
  assert.equal(audio.lights(), false);
  await audio.suspend();
  await audio.resume();
  audio.setEnabled(false);
  assert.equal(audio.enabled, false);
  audio.dispose();
  audio.dispose();
});

test('player: nothing is created before unlock(), and setEnabled() never creates a context', async () => {
  const { web, audio } = rig({ enabled: false });
  audio.setEnabled(true);
  assert.equal(audio.enabled, true);
  assert.equal(audio.hover(), false);
  assert.equal(audio.tick(), false);
  await audio.resume();
  assert.equal(web.contexts.length, 0);
});

test('player: unlock creates one context, resumes it, and renders each buffer once', async () => {
  const { web, audio, flush, ctx } = rig();
  assert.equal(await audio.unlock(), true);
  assert.equal(await audio.unlock(), true);
  flush();
  await audio.unlock();
  flush();
  assert.equal(web.contexts.length, 1);
  assert.equal(ctx().state, 'running');
  assert.deepEqual(ctx().options, { latencyHint: 'interactive' });
  const full = ctx().buffers.filter((/** @type {any} */ b) => b.length > 1);
  assert.equal(full.length, HOVER_NOTES.length + TICK_VARIANTS + 2);
  for (const b of full) assert.equal(b.sampleRate, 48000);
});

test('player: the safety compressor is transparent, its makeup gain trimmed back out', async () => {
  const { audio, ctx } = rig();
  await audio.unlock();
  const comp = ctx().compressor;
  assert.equal(comp.threshold.value, -6);
  assert.equal(comp.knee.value, 0);
  assert.equal(comp.ratio.value, 20);
  const trim = comp.outputs[0];
  const makeup = 10 ** (0.6 * 6 * (1 - 1 / 20) / 20);
  assert.ok(Math.abs(trim.gain.value * makeup - 1) < 1e-9, `trim ${trim.gain.value}`);
  assert.equal(trim.outputs[0], ctx().destination);
});

test('player: successive hovers step up the scale, wrap, and reset after 1.2 s idle', async () => {
  const { audio, flush, clock, played } = rig();
  await audio.unlock();
  flush();
  const notes = [];
  for (let i = 0; i < 7; i++) {
    assert.equal(audio.hover(), true);
    notes.push(hoverNoteOf(played().at(-1)));
    clock.ms += 300;
  }
  assert.deepEqual(notes, [0, 1, 2, 3, 4, 0, 1]);
  clock.ms += HOVER_RESET_MS;
  assert.equal(audio.hover(), true);
  assert.equal(hoverNoteOf(played().at(-1)), 0);
  clock.ms += HOVER_RESET_MS - 100;
  assert.equal(audio.hover(), true);
  assert.equal(hoverNoteOf(played().at(-1)), 1);
  clock.ms += 10;
  assert.equal(audio.hover(), false, 'a hover 10 ms after the last is dropped');
});

test('player: a new hover damps the ones still ringing', async () => {
  const { audio, flush, clock, ctx } = rig();
  await audio.unlock();
  flush();
  audio.hover();
  const first = ctx().sources.filter((/** @type {any} */ s) => s.buffer.length > 1)[0].outputs[0];
  clock.ms += 200;
  audio.hover();
  clock.ms += 200;
  audio.hover();
  const targets = first.gain.calls.filter((/** @type {any[]} */ c) => c[0] === 'target').map((/** @type {any[]} */ c) => c[1]);
  assert.equal(targets.length, 2);
  assert.ok(Math.abs(targets[1] - dbToGain(2 * HOVER_DAMP_DB)) < 1e-12);
});

test('player: ticks are rate limited and vary', async () => {
  const { audio, flush, clock, played } = rig();
  await audio.unlock();
  flush();
  const results = [];
  for (let i = 0; i < 40; i++) {
    results.push(audio.tick());
    clock.ms += 20;
  }
  const count = results.filter(Boolean).length;
  assert.ok(count <= Math.ceil(40 * 20 / TICK_MIN_INTERVAL_MS), `${count} ticks in 800 ms`);
  assert.ok(count >= 10, `${count} ticks`);
  const buffers = played();
  for (let i = 1; i < buffers.length; i++) assert.notEqual(buffers[i], buffers[i - 1], 'two identical ticks in a row');
});

test('player: release and lights play; lights ignores a second call straight after', async () => {
  const { audio, flush, clock, played } = rig();
  await audio.unlock();
  flush();
  assert.equal(audio.release(), true);
  assert.equal(played().at(-1).length, Math.round(DURATION_S.release * 48000));
  assert.equal(audio.lights(), true);
  assert.equal(audio.lights(), false);
  clock.ms += 1000;
  assert.equal(audio.lights(), true);
});

test('player: a sound asked for before its buffer is built renders it on the spot', async () => {
  const { audio, played, queue } = rig();
  await audio.unlock();
  assert.ok(queue.length > 0, 'buffers are built in later tasks');
  assert.equal(audio.release(), true);
  assert.equal(played().length, 1);
});

test('player: off means silent, then the context suspends; on resumes it', async () => {
  const { audio, flush, ctx } = rig();
  await audio.unlock();
  flush();
  audio.setEnabled(false);
  assert.equal(audio.hover(), false);
  flush();
  assert.equal(ctx().state, 'suspended');
  audio.setEnabled(true);
  await Promise.resolve();
  assert.equal(ctx().state, 'running');
  assert.equal(audio.hover(), true);
});

test('player: unlock while sound is off unlocks, then lets the context sleep', async () => {
  const { audio, flush, ctx } = rig({ enabled: false });
  assert.equal(await audio.unlock(), true);
  flush();
  assert.equal(ctx().state, 'suspended');
  assert.equal(audio.hover(), false);
  audio.setEnabled(true);
  await Promise.resolve();
  assert.equal(ctx().state, 'running');
  assert.equal(audio.hover(), true);
});

test('player: suspends while the tab is hidden and after suspend()', async () => {
  const { audio, flush, doc, ctx } = rig();
  await audio.unlock();
  flush();
  doc.set('hidden');
  assert.equal(ctx().state, 'suspended');
  assert.equal(audio.hover(), false);
  doc.set('visible');
  await Promise.resolve();
  assert.equal(ctx().state, 'running');
  await audio.suspend();
  assert.equal(ctx().state, 'suspended');
  doc.set('hidden');
  doc.set('visible');
  await Promise.resolve();
  assert.equal(ctx().state, 'suspended', 'visibility must not undo suspend()');
  await audio.resume();
  assert.equal(ctx().state, 'running');
  assert.equal(audio.tick(), true);
});

test('player: dispose closes the context, drops the listener, and later calls are no-ops', async () => {
  const { audio, flush, doc, ctx, web } = rig();
  await audio.unlock();
  flush();
  audio.hover();
  audio.dispose();
  audio.dispose();
  assert.equal(ctx().state, 'closed');
  assert.equal(doc.listeners.size, 0);
  assert.equal(audio.hover(), false);
  assert.equal(audio.release(), false);
  assert.equal(await audio.unlock(), false);
  assert.equal(web.contexts.length, 1);
});

test('player: a broken WebAudio never throws out of the player', async () => {
  const throwing = createAudio({ enabled: true, document: null, AudioContext: /** @type {any} */ (class { constructor() { throw new Error('no audio device'); } }) });
  assert.equal(await throwing.unlock(), false);
  assert.equal(throwing.hover(), false);

  const web = fakeWebAudio();
  const closed = [];
  class NoCompressor extends web.Ctor {
    createDynamicsCompressor() { throw new Error('unsupported'); }
    close() { closed.push(this); return super.close(); }
  }
  const half = createAudio({ enabled: true, document: null, AudioContext: /** @type {any} */ (NoCompressor), defer: () => {} });
  assert.equal(await half.unlock(), false);
  assert.equal(closed.length, 1, 'the half-built context is closed');

  class NoBuffers extends web.Ctor {
    /** @param {number} c @param {number} length @param {number} rate */
    createBuffer(c, length, rate) { if (length > 1) throw new Error('out of memory'); return super.createBuffer(c, length, rate); }
  }
  const starved = createAudio({ enabled: true, document: null, AudioContext: /** @type {any} */ (NoBuffers), defer: () => {} });
  assert.equal(await starved.unlock(), true);
  assert.equal(starved.hover(), false);
  assert.equal(starved.release(), false);
  assert.equal(starved.tick(), false);
  assert.equal(starved.lights(), false);
  starved.dispose();
});

test('player: a context that starts running (created inside a gesture) needs no resume', async () => {
  const { audio, ctx, flush } = rig({ startState: 'running' });
  assert.equal(await audio.unlock(), true);
  flush();
  assert.deepEqual(ctx().calls, []);
  assert.equal(audio.hover(), true);
});
