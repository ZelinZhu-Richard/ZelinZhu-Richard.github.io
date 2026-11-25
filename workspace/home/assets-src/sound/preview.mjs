#!/usr/bin/env node
// Writes WAV previews of the scene's sounds to workspace/home/_dev/sound/ (git-ignored), so a
// person can listen to exactly what the engine synthesizes.
//
//   node assets-src/sound/preview.mjs [--rate 48000] [--measure]
//
// Single voices (hover-1-D5.wav ... lights.wav) are the raw buffers from engine/audio/voices.js.
// The sequences (hover-run, crank, scene) drive the real player (engine/audio/player.js)
// through an offline stand-in for AudioContext, so its rules are what you hear: the hover
// scale stepping and resetting, the tick rate limit and variants, the master chain's net
// unity gain. --measure runs ffmpeg's ebur128 filter on every file (ffmpeg must be on PATH)
// and prints integrated loudness, the loudest 400 ms momentary loudness and true peak.
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAudio } from '../../engine/audio/player.js';
import { HOVER_NOTES, TICK_VARIANTS } from '../../engine/audio/tuning.js';
import { hoverVoice, lightsVoice, releaseVoice, tickVoice } from '../../engine/audio/voices.js';

const HOME = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(HOME, '_dev', 'sound');

const args = process.argv.slice(2);
const rateArg = args.indexOf('--rate');
const RATE = rateArg >= 0 ? Number(args[rateArg + 1]) : 48000;
const MEASURE = args.includes('--measure');
if (!Number.isFinite(RATE) || RATE < 8000) throw new Error(`preview: bad --rate ${args[rateArg + 1]}`);

/**
 * 24-bit PCM mono WAV.
 * @param {Float32Array | Float64Array} samples
 * @param {number} sampleRate
 */
function wav(samples, sampleRate) {
  const bytes = 3;
  const data = samples.length * bytes;
  const buf = Buffer.alloc(44 + data);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * bytes, 28); buf.writeUInt16LE(bytes, 32); buf.writeUInt16LE(24, 34);
  buf.write('data', 36); buf.writeUInt32LE(data, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-8388608, Math.min(8388607, Math.round(samples[i] * 8388607)));
    buf.writeIntLE(v, 44 + i * bytes, 3);
  }
  return buf;
}

/**
 * A minimal offline stand-in for AudioContext: it records every source the player starts
 * (buffer, start, stop, playback rate and the gain chain at start time) and mixes them.
 * The compressor applies WebAudio's automatic makeup gain, so the player's trim is tested too.
 * @param {number} sampleRate
 * @param {{ t: number }} clock seconds
 */
function offlineContext(sampleRate, clock) {
  /** @type {any[]} */
  const started = [];
  /** An AudioParam with the automation the player uses: set, linear ramp, set-target. */
  class Param {
    /** @param {number} v */
    constructor(v) { this.initial = v; this.value = v; /** @type {{ type: string, v: number, t: number, tc?: number }[]} */ this.events = []; }
    /** @param {number} v @param {number} t @param {number} tc */ setTargetAtTime(v, t, tc) { this.events.push({ type: 'target', v, t, tc }); this.value = v; }
    /** @param {number} t */ cancelScheduledValues(t) { this.events = this.events.filter(e => e.t < t); }
    /** @param {number} v @param {number} t */ setValueAtTime(v, t) { this.events.push({ type: 'set', v, t }); this.value = v; }
    /** @param {number} v @param {number} t */ linearRampToValueAtTime(v, t) { this.events.push({ type: 'ramp', v, t }); this.value = v; }
    /** The automated value at time t. @param {number} t */
    at(t) {
      /** @type {{ to: number, from: number, t0: number, tc: number } | null} */
      let target = null;
      let level = this.initial, tPrev = 0;
      const valueAt = (/** @type {number} */ time) => (target ? target.to + (target.from - target.to) * Math.exp(-(time - target.t0) / target.tc) : level);
      for (const e of this.events) {
        if (e.type === 'ramp') {
          const from = valueAt(tPrev);
          if (t < e.t) return t <= tPrev ? from : from + (e.v - from) * (t - tPrev) / (e.t - tPrev);
          target = null; level = e.v; tPrev = e.t;
          continue;
        }
        if (t < e.t) return valueAt(t);
        if (e.type === 'set') { target = null; level = e.v; }
        else target = { to: e.v, from: valueAt(e.t), t0: e.t, tc: /** @type {number} */ (e.tc) };
        tPrev = e.t;
      }
      return valueAt(t);
    }
  }
  class Node {
    /** @param {(input: number) => number} [through] */
    constructor(through = x => x) { this.through = through; /** @type {Node | null} */ this.out = null; }
    /** @param {Node} node */ connect(node) { this.out = node; return node; }
    disconnect() {}
    /** Gain from this node to the destination. */
    chain() { let g = 1; /** @type {Node | null} */ let n = this; while (n) { g = n.through(g); n = n.out; } return g; }
  }
  class OfflineContext {
    constructor() {
      this.sampleRate = sampleRate;
      this.state = 'suspended';
      this.destination = new Node();
    }
    get currentTime() { return clock.t; }
    createGain() { const n = /** @type {any} */ (new Node(x => x * n.gain.value)); n.gain = new Param(1); return n; }
    createDynamicsCompressor() {
      const n = /** @type {any} */ (new Node(x => x * 10 ** (0.6 * -n.threshold.value * (1 - 1 / n.ratio.value) / 20)));
      for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[key] = new Param(0);
      return n;
    }
    /** @param {number} _channels @param {number} length @param {number} rate */
    createBuffer(_channels, length, rate) {
      const data = new Float32Array(length);
      return { length, sampleRate: rate, data, /** @param {Float32Array} src */ copyToChannel(src) { data.set(src); }, getChannelData() { return data; } };
    }
    createBufferSource() {
      const src = /** @type {any} */ (new Node());
      src.playbackRate = new Param(1);
      src.stopAt = Infinity;
      // The voice's own gain node is automated; everything after it (master, compressor, trim) is static here.
      src.start = (/** @type {number} */ t = clock.t) => { if (src.buffer.length > 1) started.push({ src, at: t, voiceGain: src.out.gain, post: src.out.out.chain(), rate: src.playbackRate.value }); };
      src.stop = (/** @type {number} */ t = clock.t) => { src.stopAt = Math.min(src.stopAt, t); };
      return src;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  return { Ctx: OfflineContext, started };
}

/** Mixes what an offline context recorded. @param {any[]} started @param {number} sampleRate */
function mixDown(started, sampleRate) {
  let end = 0;
  for (const s of started) end = Math.max(end, Math.min(s.src.stopAt, s.at + s.src.buffer.length / sampleRate / s.rate));
  const out = new Float64Array(Math.ceil(end * sampleRate) + 1);
  for (const s of started) {
    const data = s.src.buffer.data;
    const first = Math.round(s.at * sampleRate);
    const last = Math.min(out.length, Math.round(Math.min(s.src.stopAt, s.at + data.length / sampleRate / s.rate) * sampleRate));
    for (let i = first; i < last; i++) {
      const pos = (i - first) * s.rate;
      const k = Math.floor(pos);
      if (k + 1 >= data.length) break;
      out[i] += s.post * s.voiceGain.at(i / sampleRate) * (data[k] + (data[k + 1] - data[k]) * (pos - k));
    }
  }
  return out;
}

/**
 * Runs a script of player calls on a virtual clock and returns the mix.
 * @param {(audio: import('../../engine/audio/player.js').SceneAudio, at: (t: number) => void) => void} script
 */
async function perform(script) {
  const clock = { t: 0 };
  /** @type {(() => void)[]} */
  const queue = [];
  const { Ctx, started } = offlineContext(RATE, clock);
  const audio = createAudio({ enabled: true, AudioContext: /** @type {any} */ (Ctx), document: null, now: () => clock.t * 1000, defer: fn => { queue.push(fn); } });
  await audio.unlock();
  while (queue.length) /** @type {() => void} */ (queue.shift())();
  script(audio, t => { clock.t = t; });
  const mix = mixDown(started, RATE);
  audio.dispose();
  return mix;
}

/** @param {ArrayLike<number>} x */
function peakDb(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return 20 * Math.log10(p);
}

/** @param {string} file */
function ebur128(file) {
  const run = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', file, '-filter_complex', 'ebur128=peak=true:framelog=info', '-f', 'null', '-'], { encoding: 'utf8' });
  if (run.error) return null;
  const log = run.stderr;
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const integrated = Number(/I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(summary)?.[1] ?? NaN);
  const truePeak = Number(/True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS/.exec(summary)?.[1] ?? NaN);
  let momentary = -Infinity;
  for (const m of log.matchAll(/\bM:\s*(-?[\d.]+)/g)) momentary = Math.max(momentary, Number(m[1]));
  return { integrated, momentary, truePeak };
}

const files = /** @type {[string, Float32Array | Float64Array][]} */ ([]);
HOVER_NOTES.forEach((note, i) => files.push([`hover-${i + 1}-${note.name.replace('#', 's')}.wav`, hoverVoice(i, RATE)]));
files.push(['release.wav', releaseVoice(RATE)]);
// One tick, then silence to 0.5 s: ebur128 needs a full 400 ms block to report loudness.
{
  const out = new Float64Array(Math.round(0.5 * RATE));
  out.set(tickVoice(RATE, undefined, 0));
  files.push(['tick.wav', out]);
}
files.push(['lights.wav', lightsVoice(RATE)]);

// The four tick variants, a quarter second apart.
{
  const step = Math.round(0.25 * RATE);
  const out = new Float64Array(step * TICK_VARIANTS);
  for (let v = 0; v < TICK_VARIANTS; v++) out.set(tickVoice(RATE, undefined, v), v * step);
  files.push(['tick-variants.wav', out]);
}

// Seven hovers 0.28 s apart (D E F# A B, then D E again), a 1.5 s pause, one more (back to D5).
files.push(['hover-run.wav', await perform((audio, at) => {
  for (let i = 0; i < 7; i++) { at(0.05 + 0.28 * i); audio.hover(); }
  at(0.05 + 0.28 * 6 + 1.5); audio.hover();
})]);

// The crank under a scroll that speeds up from 4 to 50 teeth a second over 3 s; the player keeps at most ~18/s.
files.push(['crank.wav', await perform((audio, at) => {
  for (let t = 0.02; t < 3; t += 0.25 * (0.02 / 0.25) ** (t / 3)) { at(t); audio.tick(); }
})]);

// The story in miniature: lights on, a scroll of the crank, four hovers, a release.
files.push(['scene.wav', await perform((audio, at) => {
  at(0.1); audio.lights();
  for (let t = 1.5; t < 3.4; t += 0.1) { at(t); audio.tick(); }
  [3.8, 4.15, 4.5, 4.85].forEach(t => { at(t); audio.hover(); });
  at(5.5); audio.release();
})]);

await mkdir(OUT, { recursive: true });
console.log(`writing ${files.length} previews at ${RATE} Hz to ${OUT}`);
for (const [name, samples] of files) {
  const path = join(OUT, name);
  await writeFile(path, wav(samples, RATE));
  let line = `${name.padEnd(20)} ${(samples.length / RATE).toFixed(3).padStart(6)} s  sample peak ${peakDb(samples).toFixed(2).padStart(7)} dBFS`;
  if (MEASURE) {
    const m = ebur128(path);
    line += m ? `  I ${m.integrated.toFixed(1).padStart(6)} LUFS  M max ${m.momentary.toFixed(1).padStart(6)} LUFS  true peak ${m.truePeak.toFixed(1).padStart(6)} dBFS` : '  (ffmpeg not found)';
  }
  console.log(line);
}
