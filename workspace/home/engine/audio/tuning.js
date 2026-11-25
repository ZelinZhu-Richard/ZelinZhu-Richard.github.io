// Pitches, levels, lengths and timing rules for the scene's sounds. Pure: no imports,
// no globals. voices.js renders from these numbers, player.js schedules with them, and
// tests/audio.test.mjs checks the rendered sound against them.

/** Root of the hover scale, D5, in Hz. Every pitch in the scene is a just ratio of it. */
export const D5 = 587.33;

/** Just-intonation major pentatonic: 1, 9/8, 5/4, 3/2, 5/3 (D E F# A B over D). */
export const PENTATONIC_RATIOS = Object.freeze([1, 9 / 8, 5 / 4, 3 / 2, 5 / 3]);

/**
 * The five hover notes, low to high: D5 587.33, E5 660.75, F#5 734.16, A5 881.00, B5 978.88.
 * @type {ReadonlyArray<Readonly<{ name: string, hz: number }>>}
 */
export const HOVER_NOTES = Object.freeze(['D5', 'E5', 'F#5', 'A5', 'B5'].map((name, i) => Object.freeze({ name, hz: D5 * PENTATONIC_RATIOS[i] })));

/** Lower anchors for the release swell: D4 293.67, A4 440.50, D3 146.83, A3 220.25. */
export const D4 = D5 / 2;
export const A4 = D4 * 3 / 2;
export const D3 = D5 / 4;
export const A3 = D3 * 3 / 2;

/**
 * Sample-peak ceilings in dBFS. Every rendered voice stays at or under its ceiling.
 * @type {Readonly<{ hover: number, release: number, tick: number, lights: number }>}
 */
export const PEAK_CEILING_DB = Object.freeze({ hover: -20, release: -14, tick: -30, lights: -16 });

/**
 * Where each voice is normalized: 1 dB under its ceiling, headroom for inter-sample peaks.
 * Hover gets 2 dB, because hovers overlap when a pointer sweeps across the stones.
 */
export const PEAK_TARGET_DB = Object.freeze({
  hover: PEAK_CEILING_DB.hover - 2,
  release: PEAK_CEILING_DB.release - 1,
  tick: PEAK_CEILING_DB.tick - 1,
  lights: PEAK_CEILING_DB.lights - 1,
});

/** Buffer lengths in seconds (attack plus tail). */
export const DURATION_S = Object.freeze({ hover: 0.95, release: 1.6, tick: 0.045, lights: 1.15 });

/** Successive hovers step up the scale; after this much idle time the next hover is D5 again. */
export const HOVER_RESET_MS = 1200;
/** Hovers closer together than this are dropped (a pointer swept across several stones). */
export const HOVER_MIN_INTERVAL_MS = 45;
/**
 * Each new hover damps the hovers still ringing by this much (compounding), with this time
 * constant in seconds, like a hand on a bell: a quick run stays clean and stays near the hover
 * ceiling instead of stacking up.
 */
export const HOVER_DAMP_DB = -6;
export const HOVER_DAMP_S = 0.008;
/** Crank ticks closer together than this are dropped (fast scrolling). About 18 per second at most. */
export const TICK_MIN_INTERVAL_MS = 55;
/** How many slightly different tick buffers are rendered, so a run of ticks is not one sample looped. */
export const TICK_VARIANTS = 4;
/** A second lights() inside this window is ignored (the reveal edge crossed twice). */
export const LIGHTS_MIN_INTERVAL_MS = 900;
/** At most this many hover/release/lights voices sound at once; the oldest is faded out. */
export const MAX_VOICES = 8;

/** Seed for every random draw in the sound (felt noise, the release pull, tick variation). */
export const AUDIO_SEED = 'home-audio';

/** @param {number} db */
export const dbToGain = db => 10 ** (db / 20);
/** @param {number} gain */
export const gainToDb = gain => 20 * Math.log10(gain);
/** Signed distance in cents from `ref` to `hz`. @param {number} hz @param {number} ref */
export const cents = (hz, ref) => 1200 * Math.log2(hz / ref);
