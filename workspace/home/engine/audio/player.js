// The scene's sound player. WebAudio only, no audio files, no music. Browser globals are
// read only through createAudio()'s options (defaults: globalThis), so node can import it.
//
//   voice source -> voice gain -> master gain -> safety compressor -> trim -> destination
//
// Rules:
// - Nothing is created before unlock(). Call unlock() only from a user gesture
//   (pointerdown, keydown, click): it creates or resumes the AudioContext there.
// - setEnabled() never creates a context, so it is safe outside a gesture (window.__home).
// - Buffers are rendered once, at the context's sample rate, in small tasks right after
//   the first unlock(); a sound asked for before its buffer exists renders it on the spot.
// - The context suspends while the tab is hidden, after suspend(), and shortly after the
//   sound is turned off; it resumes when all three are clear again.
// - Every method is a safe no-op before unlock(), without WebAudio and after dispose().
//   The four sound methods return true only when they actually started a sound.
import { rngFor } from '../core/rng.js';
import { AUDIO_SEED, HOVER_DAMP_DB, HOVER_DAMP_S, HOVER_MIN_INTERVAL_MS, HOVER_NOTES, HOVER_RESET_MS, LIGHTS_MIN_INTERVAL_MS, MAX_VOICES, TICK_MIN_INTERVAL_MS, TICK_VARIANTS, dbToGain } from './tuning.js';
import { hoverVoice, lightsVoice, releaseVoice, tickVoice } from './voices.js';

/**
 * Safety compressor: transparent below -6 dBFS, ratio 20 above it (hard knee). The voices
 * peak at -15 dBFS or less, so it only acts when many sounds stack. WebAudio's compressor
 * adds automatic makeup gain, (1 / curve(1))^0.6; the trim node after it takes that back out.
 */
const COMPRESSOR = Object.freeze({ threshold: -6, knee: 0, ratio: 20, attack: 0.002, release: 0.15 });
const MAKEUP_DB = 0.6 * -COMPRESSOR.threshold * (1 - 1 / COMPRESSOR.ratio);
/** Master fades (seconds, setTargetAtTime time constant), and how long after "off" the context suspends (ms). */
const MASTER_FADE_S = 0.015;
const VOICE_STEAL_S = 0.03;
const SUSPEND_AFTER_OFF_MS = 200;
const UNLOCK_TIMEOUT_MS = 1000;

/**
 * @typedef {{
 *   setEnabled(on: boolean): void,
 *   readonly enabled: boolean,
 *   unlock(): Promise<boolean>,
 *   hover(): boolean,
 *   release(): boolean,
 *   tick(): boolean,
 *   lights(): boolean,
 *   suspend(): Promise<void>,
 *   resume(): Promise<void>,
 *   dispose(): void,
 * }} SceneAudio
 *
 * @typedef {{
 *   enabled?: boolean,
 *   volume?: number,
 *   seed?: number | string,
 *   AudioContext?: (new (options?: object) => AudioContext) | null,
 *   document?: { visibilityState?: string, addEventListener?: Function, removeEventListener?: Function } | null,
 *   now?: () => number,
 *   defer?: (fn: () => void, ms: number) => void,
 * }} AudioOptions
 *
 * @typedef {{ src: AudioBufferSourceNode, gain: GainNode, kind: 'hover' | 'release' | 'tick' | 'lights', fading: boolean, level: number }} Voice
 */

/**
 * @param {AudioOptions} [options]
 *   enabled: start with sound on (default false, like window.__home.sound).
 *   volume: master gain, 0..1 (default 1).
 *   seed: sound seed (default AUDIO_SEED).
 *   AudioContext, document, now (ms clock), defer (setTimeout-like): injectable for tests;
 *   default to the browser's.
 * @returns {SceneAudio}
 */
export function createAudio(options = {}) {
  const g = /** @type {any} */ (globalThis);
  const Ctor = options.AudioContext !== undefined ? options.AudioContext : g.AudioContext || g.webkitAudioContext || null;
  const doc = options.document !== undefined ? options.document : g.document || null;
  const now = options.now || (() => (g.performance && typeof g.performance.now === 'function' ? g.performance.now() : Date.now()));
  const defer = options.defer || ((fn, ms) => { g.setTimeout(fn, ms); });
  const seed = options.seed ?? AUDIO_SEED;
  const volume = Number.isFinite(options.volume) ? Math.min(1, Math.max(0, /** @type {number} */ (options.volume))) : 1;

  let enabled = !!options.enabled;
  let held = false;
  let disposed = false;
  let unlocked = false;
  let hidden = isHidden();
  /** Bumped on every state change so stale deferred suspends do nothing. */
  let generation = 0;

  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let master = null;
  /** @type {{ hover?: AudioBuffer[], tick?: AudioBuffer[], release?: AudioBuffer, lights?: AudioBuffer }} */
  const buffers = {};
  /** @type {Voice[]} */
  const voices = [];

  let hoverIndex = -1;
  let lastHover = -Infinity, lastTick = -Infinity, lastLights = -Infinity;
  const tickRng = rngFor(seed, 'audio:tick-order');
  let lastVariant = -1;

  function isHidden() { return !!doc && doc.visibilityState === 'hidden'; }
  function wanted() { return enabled && !held && !hidden && !disposed; }

  function onVisibility() {
    const next = isHidden();
    if (next === hidden) return;
    hidden = next;
    sync();
  }
  if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVisibility);

  /** Brings the master level and the context state in line with wanted(). */
  function sync() {
    generation++;
    if (!ctx || disposed) return Promise.resolve();
    const on = wanted();
    setMaster(on ? volume : 0);
    if (on) {
      if (unlocked && ctx.state !== 'running') return safe(() => ctx?.resume());
      return Promise.resolve();
    }
    stopAll(enabled ? 0 : MASTER_FADE_S * 4);
    if (hidden || held) return safe(() => ctx?.suspend());
    // Sound turned off: let the fade finish, then stop the audio thread.
    const mine = generation;
    defer(() => { if (mine === generation && ctx && !wanted() && ctx.state === 'running') safe(() => ctx?.suspend()); }, SUSPEND_AFTER_OFF_MS);
    return Promise.resolve();
  }

  /** @param {number} level */
  function setMaster(level) {
    if (!ctx || !master) return;
    try {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(level, t, MASTER_FADE_S);
    } catch { /* a closed context */ }
  }

  function buildGraph() {
    const c = /** @type {AudioContext} */ (ctx);
    master = c.createGain();
    master.gain.value = wanted() ? volume : 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = COMPRESSOR.threshold;
    comp.knee.value = COMPRESSOR.knee;
    comp.ratio.value = COMPRESSOR.ratio;
    comp.attack.value = COMPRESSOR.attack;
    comp.release.value = COMPRESSOR.release;
    const trim = c.createGain();
    trim.gain.value = dbToGain(-MAKEUP_DB);
    master.connect(comp);
    comp.connect(trim);
    trim.connect(c.destination);
  }

  /** @param {Float32Array} data */
  function toBuffer(data) {
    const c = /** @type {AudioContext} */ (ctx);
    const b = c.createBuffer(1, data.length, c.sampleRate);
    if (typeof b.copyToChannel === 'function') b.copyToChannel(data, 0);
    else b.getChannelData(0).set(data);
    return b;
  }

  /** Builds one buffer group if it is missing; never throws. @param {'hover' | 'tick' | 'release' | 'lights'} name */
  function need(name) {
    try { build(name); } catch { /* the sound stays silent */ }
  }

  /** @param {'hover' | 'tick' | 'release' | 'lights'} name */
  function build(name) {
    if (buffers[name] || !ctx) return;
    const sr = ctx.sampleRate;
    if (name === 'hover') buffers.hover = HOVER_NOTES.map((_, i) => toBuffer(hoverVoice(i, sr, seed)));
    else if (name === 'tick') buffers.tick = Array.from({ length: TICK_VARIANTS }, (_, i) => toBuffer(tickVoice(sr, seed, i)));
    else if (name === 'release') buffers.release = toBuffer(releaseVoice(sr, seed));
    else buffers.lights = toBuffer(lightsVoice(sr, seed));
  }

  /** Renders the buffers one per task, cheapest and most-needed first, so no gesture handler pays for it. */
  function buildInBackground() {
    const order = /** @type {const} */ (['hover', 'tick', 'lights', 'release']);
    const step = () => {
      if (disposed || !ctx) return;
      const next = order.find(name => !buffers[name]);
      if (!next) return;
      try { build(next); } catch { return; }
      defer(step, 0);
    };
    defer(step, 0);
  }

  /** A one-sample silent buffer started inside the gesture; older iOS Safari needs it to unlock. */
  function prime() {
    try {
      const c = /** @type {AudioContext} */ (ctx);
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, c.sampleRate);
      src.connect(c.destination);
      src.start(0);
    } catch { /* not needed everywhere */ }
  }

  /** True when a sound may start now. Nudges a context that should be running but is not. */
  function canPlay() {
    if (!ctx || disposed || !wanted()) return false;
    if (ctx.state === 'running') { unlocked = true; return true; }
    if (unlocked) safe(() => ctx?.resume());
    return false;
  }

  /**
   * @param {AudioBuffer} buffer @param {Voice['kind']} kind @param {number} [rate]
   */
  function play(buffer, kind, rate = 1) {
    const c = /** @type {AudioContext} */ (ctx);
    try {
      const src = c.createBufferSource();
      src.buffer = buffer;
      if (rate !== 1) src.playbackRate.value = rate;
      const gain = c.createGain();
      src.connect(gain);
      gain.connect(/** @type {GainNode} */ (master));
      /** @type {Voice} */
      const voice = { src, gain, kind, fading: false, level: 1 };
      src.onended = () => {
        const i = voices.indexOf(voice);
        if (i >= 0) voices.splice(i, 1);
        try { src.disconnect(); gain.disconnect(); } catch { /* already gone */ }
      };
      src.start(c.currentTime);
      voices.push(voice);
      if (kind !== 'tick') {
        const ringing = voices.filter(v => v.kind !== 'tick' && !v.fading);
        for (let i = 0; i < ringing.length - MAX_VOICES; i++) fade(ringing[i], VOICE_STEAL_S);
      }
      return true;
    } catch {
      return false;
    }
  }

  /** @param {Voice} voice @param {number} seconds */
  function fade(voice, seconds) {
    if (!ctx) return;
    voice.fading = true;
    try {
      const t = ctx.currentTime;
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
      voice.gain.gain.linearRampToValueAtTime(0, t + seconds);
      voice.src.stop(t + seconds + 0.01);
    } catch { /* already stopped */ }
  }

  /** Lowers a ringing voice by HOVER_DAMP_DB (compounding) without stopping it. @param {Voice} voice */
  function damp(voice) {
    if (!ctx) return;
    voice.level *= dbToGain(HOVER_DAMP_DB);
    try {
      const t = ctx.currentTime;
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setTargetAtTime(voice.level, t, HOVER_DAMP_S);
    } catch { /* already stopped */ }
  }

  /** @param {number} seconds */
  function stopAll(seconds) {
    for (const voice of [...voices]) {
      if (seconds > 0) fade(voice, seconds);
      else { try { voice.src.stop(); } catch { /* already stopped */ } }
    }
  }

  return {
    setEnabled(on) {
      if (disposed) return;
      const next = !!on;
      if (next === enabled) return;
      enabled = next;
      sync();
    },
    get enabled() { return enabled; },

    unlock() {
      if (disposed || !Ctor) return Promise.resolve(false);
      if (!ctx) {
        /** @type {AudioContext | null} */
        let created = null;
        try {
          try { created = new Ctor({ latencyHint: 'interactive' }); } catch { created = new Ctor(); }
          ctx = created;
          buildGraph();
        } catch {
          const broken = created;
          if (broken) safe(() => broken.close());
          ctx = null; master = null;
          return Promise.resolve(false);
        }
        buildInBackground();
      }
      const c = ctx;
      if (unlocked && (c.state === 'running' || !wanted())) return Promise.resolve(true);
      prime();
      // resume() outside a gesture can stay pending for good; answer after a second regardless.
      const resumed = safe(() => (c.state === 'running' ? undefined : c.resume()));
      const timeout = new Promise(resolve => defer(() => resolve(undefined), UNLOCK_TIMEOUT_MS));
      return Promise.race([resumed, timeout]).then(() => {
        if (disposed || ctx !== c) return false;
        if (c.state === 'running') unlocked = true;
        if (!wanted()) sync();
        return unlocked;
      });
    },

    hover() {
      if (!canPlay()) return false;
      const t = now();
      if (t - lastHover < HOVER_MIN_INTERVAL_MS) return false;
      const index = t - lastHover > HOVER_RESET_MS ? 0 : (hoverIndex + 1) % HOVER_NOTES.length;
      need('hover');
      if (!buffers.hover) return false;
      for (const voice of voices) if (voice.kind === 'hover' && !voice.fading) damp(voice);
      if (!play(buffers.hover[index], 'hover')) return false;
      hoverIndex = index;
      lastHover = t;
      return true;
    },

    release() {
      if (!canPlay()) return false;
      need('release');
      if (!buffers.release || !play(buffers.release, 'release')) return false;
      hoverIndex = -1;
      lastHover = -Infinity;
      return true;
    },

    tick() {
      if (!canPlay()) return false;
      const t = now();
      if (t - lastTick < TICK_MIN_INTERVAL_MS) return false;
      need('tick');
      if (!buffers.tick) return false;
      let variant = Math.floor(tickRng() * TICK_VARIANTS);
      if (variant === lastVariant) variant = (variant + 1) % TICK_VARIANTS;
      const rate = 0.97 + 0.06 * tickRng();
      if (!play(buffers.tick[variant], 'tick', rate)) return false;
      lastVariant = variant;
      lastTick = t;
      return true;
    },

    lights() {
      if (!canPlay()) return false;
      const t = now();
      if (t - lastLights < LIGHTS_MIN_INTERVAL_MS) return false;
      need('lights');
      if (!buffers.lights || !play(buffers.lights, 'lights')) return false;
      lastLights = t;
      return true;
    },

    suspend() {
      if (disposed) return Promise.resolve();
      held = true;
      return sync();
    },

    resume() {
      if (disposed) return Promise.resolve();
      held = false;
      return sync();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVisibility);
      const c = ctx;
      stopAll(0);
      voices.length = 0;
      ctx = null;
      master = null;
      delete buffers.hover; delete buffers.tick; delete buffers.release; delete buffers.lights;
      if (c) safe(() => c.close());
    },
  };
}

/**
 * Runs a context call that may throw or return a rejecting promise; never rejects.
 * @param {() => any} fn
 * @returns {Promise<void>}
 */
function safe(fn) {
  try {
    return Promise.resolve(fn()).then(() => {}, () => {});
  } catch {
    return Promise.resolve();
  }
}
