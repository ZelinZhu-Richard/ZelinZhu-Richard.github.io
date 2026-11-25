// The scroll schedule: twenty sections (hero, the 17 text beats, stones, coda), how far
// the reader scrolls through each, and the map between page progress p and story time u.
// Pure: no imports, no globals, no clock, no DOM.
//
// u runs from 0 to 20 in section units: section i is u in [i, i + 1). Inside a section u
// moves linearly with scroll, so a section's `vh` is its scroll length in viewport heights.
//
// The page contract: p = scrollY / (scrollHeight - innerHeight), 0 at the top and 1 at the
// bottom, and that scroll range should be totalVh() viewport heights. One way to get it:
// give section i a height of SECTIONS[i].vh vh and end the page with one more viewport
// (the sections nav and the foot). Then the top of section i reaches the top of the
// viewport exactly when u = i.

/**
 * @typedef {'plate' | 'gears' | 'room' | 'space'} ActId
 * @typedef {Readonly<{ id: string, act: ActId, vh: number }>} Section
 * @typedef {Readonly<{ index: number, id: string, section: number, u0: number, u1: number, in1: number, out0: number }>} BeatWindow
 */

/** Story time runs from 0 to U_MAX. */
export const U_MAX = 20;

/** The sections in order. */
export const SECTION_COUNT = 20;

/** The text beats: chapters c01..c17 sit in sections 1..17. */
export const BEAT_COUNT = 17;

/**
 * Scroll lengths in viewport heights. Single words are short (§4-6); the ride round a
 * full revolution (§7) is longer so the camera turns at most about 2 degrees per
 * viewport height; the room's body-text chapters (§13-16), the dissolve (§17) and the
 * stones (§18) are the longest.
 * @type {ReadonlyArray<Section>}
 */
export const SECTIONS = Object.freeze([
  ['hero', 'plate', 100], //   0  the name, one orange point
  ['c01', 'plate', 130], //    1  the point draws a line, the line closes into a circle
  ['c02', 'plate', 160], //    2  the draughtsman's plate fills in
  ['c03', 'plate', 170], //    3  the camera tilts, the wheel lifts off the page
  ['c04', 'gears', 110], //    4  "building."  macro in the teeth
  ['c05', 'gears', 90], //     5  "Learn"  a second gear slides in
  ['c06', 'gears', 90], //     6  "Build"  the third; the train turns 1:2:4
  ['c07', 'gears', 180], //    7  "Repeat"  riding one tooth round a full turn
  ['c08', 'gears', 170], //    8  up the column through the rings
  ['c09', 'room', 150], //     9  false space
  ['c10', 'room', 170], //    10  the lamp warms: a desk at 3 a.m.
  ['c11', 'room', 160], //    11  the room, wide
  ['c12', 'room', 140], //    12  the instrument, unfinished
  ['c13', 'room', 180], //    13  Learning from images
  ['c14', 'room', 180], //    14  Building ZeroMind
  ['c15', 'room', 180], //    15  Building in the open
  ['c16', 'room', 180], //    16  Bringing people together
  ['c17', 'room', 200], //    17  lamp off, the room thins away into space
  ['stones', 'space', 280], // 18  the seven stones
  ['coda', 'space', 130], //  19  the rings seal (contact)
].map(([id, act, vh]) => Object.freeze({ id: /** @type {string} */ (id), act: /** @type {ActId} */ (act), vh: /** @type {number} */ (vh) })));

const TOTAL_VH = SECTIONS.reduce((sum, s) => sum + s.vh, 0);

/** Where each section starts on the scroll, in viewport heights (SECTION_COUNT + 1 entries; the last is the total). */
export const SECTION_STARTS_VH = Object.freeze(SECTIONS.reduce((starts, s, i) => (starts.push(starts[i] + s.vh), starts), [0]));

/** Text beats stay off the first and last BEAT_EDGE_VH of their section, then fade over BEAT_FADE_VH. */
export const BEAT_EDGE_VH = 6;
export const BEAT_FADE_VH = 18;

/** The sum of every section's scroll length, in viewport heights. */
export function totalVh() {
  return TOTAL_VH;
}

/** @param {number} x @param {number} lo @param {number} hi */
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
/** NaN and infinities become `fallback`. @param {number} x @param {number} fallback */
const finite = (x, fallback) => (Number.isFinite(x) ? x : fallback);

/**
 * Story time for a page progress. p is clamped to [0, 1]; NaN reads as 0.
 * @param {number} p
 * @returns {number} u in [0, 20]
 */
export function progressToU(p) {
  const x = clamp(finite(p, 0), 0, 1) * TOTAL_VH;
  if (x >= TOTAL_VH) return U_MAX;
  let lo = 0;
  let hi = SECTION_COUNT; // SECTION_STARTS_VH[lo] <= x < SECTION_STARTS_VH[hi]
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (SECTION_STARTS_VH[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo + (x - SECTION_STARTS_VH[lo]) / SECTIONS[lo].vh;
}

/**
 * Page progress for a story time. u is clamped to [0, 20]; NaN reads as 0.
 * @param {number} u
 * @returns {number} p in [0, 1]
 */
export function uToProgress(u) {
  const v = clamp(finite(u, 0), 0, U_MAX);
  if (v >= U_MAX) return 1;
  const i = Math.floor(v);
  return (SECTION_STARTS_VH[i] + (v - i) * SECTIONS[i].vh) / TOTAL_VH;
}

/**
 * The section a story time falls in: floor(u), clamped to 0..19 (u = 20 is the coda's end).
 * @param {number} u
 * @returns {number}
 */
export function sectionAt(u) {
  const v = clamp(finite(u, 0), 0, U_MAX);
  return v >= U_MAX ? SECTION_COUNT - 1 : Math.floor(v);
}

/**
 * Scroll metrics of one section.
 * @param {number} i section index 0..19
 * @returns {{ u0: number, u1: number, p0: number, p1: number, startVh: number, vh: number }}
 */
export function sectionRange(i) {
  if (!Number.isInteger(i) || i < 0 || i >= SECTION_COUNT) throw new RangeError(`sectionRange: no section ${i}`);
  return {
    u0: i,
    u1: i + 1,
    p0: SECTION_STARTS_VH[i] / TOTAL_VH,
    p1: SECTION_STARTS_VH[i + 1] / TOTAL_VH,
    startVh: SECTION_STARTS_VH[i],
    vh: SECTIONS[i].vh,
  };
}

/**
 * Beat windows. Beat b (0-based, chapter id c01..c17) lives in section b + 1. It is in
 * view over [u0, u1): fading in over [u0, in1], fully shown over [in1, out0], fading out
 * over [out0, u1]. Windows sit strictly inside their sections, so they never overlap.
 * @type {ReadonlyArray<BeatWindow>}
 */
export const BEAT_WINDOWS = Object.freeze(Array.from({ length: BEAT_COUNT }, (_, b) => {
  const section = b + 1;
  const vh = SECTIONS[section].vh;
  const edge = BEAT_EDGE_VH / vh;
  const fade = BEAT_FADE_VH / vh;
  return Object.freeze({
    index: b,
    id: SECTIONS[section].id,
    section,
    u0: section + edge,
    u1: section + 1 - edge,
    in1: section + edge + fade,
    out0: section + 1 - edge - fade,
  });
}));

/**
 * The text beat in view at u, or -1 (the hero, the stones, the coda, and the short gaps
 * at section edges).
 * @param {number} u
 * @returns {number} beat index 0..16, or -1
 */
export function beatAt(u) {
  const v = clamp(finite(u, 0), 0, U_MAX);
  const s = sectionAt(v);
  if (s < 1 || s > BEAT_COUNT) return -1;
  const w = BEAT_WINDOWS[s - 1];
  return v >= w.u0 && v < w.u1 ? w.index : -1;
}

/** C1 smoothstep on [0, 1]. @param {number} t */
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * Opacity of the beat in view at u (0 when beatAt(u) is -1): eases in, holds at 1, eases out.
 * @param {number} u
 * @returns {number} 0..1
 */
export function beatOpacity(u) {
  const b = beatAt(u);
  if (b < 0) return 0;
  const v = clamp(finite(u, 0), 0, U_MAX);
  const w = BEAT_WINDOWS[b];
  if (v < w.in1) return smooth((v - w.u0) / (w.in1 - w.u0));
  if (v > w.out0) return smooth((w.u1 - v) / (w.u1 - w.out0));
  return 1;
}
