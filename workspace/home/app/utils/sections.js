// The 20 scroll sections of the story (STORYBOARD.md) and how the page lays them out.
// Pure: imports only ./text.js, so plain node can test it. app/utils/schedule.js feeds it
// the engine's schedule when engine/timeline/schedule.js exists.
//
// How scroll becomes progress (the one rule the app and the engine share, and the page
// contract in engine/timeline/schedule.js):
// - The story element holds the sections in order. Section i is lengths[i] vh tall; the
//   last one gets one extra viewport, so the scroll range is the sum of the lengths.
// - p = ScrollTrigger progress of the story, start 'top top', end 'bottom bottom'. With
//   the extra viewport, p * total is exactly the viewport's top edge, in vh, measured
//   from the top of the story: the top of section i meets the top of the viewport at u = i.
// - The engine turns p into section units with schedule.progressToU(p). The page derives
//   each section's length from that same function, so the two always agree.
// - Each section's text has a window in u (the engine's BEAT_WINDOWS for the chapters):
//   it fades in over [u0, in1], holds, and fades out over [out0, u1]. With the scene the
//   page shows each section's frame in place, at the opacity its window gives.
import { blocks, isWord } from './text.js';

/** Text stays off the first and last EDGE_VH of its section and fades over FADE_VH (the engine's defaults). */
export const EDGE_VH = 6;
export const FADE_VH = 18;

/** Section ids in scroll order: hero, the 17 chapters, the stones, the coda. */
export const SECTION_IDS = Object.freeze([
  'hero',
  ...Array.from({ length: 17 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`),
  'stones',
  'coda',
]);

/**
 * Fallback section lengths in vh (100 = one viewport of scroll), used until the engine's
 * schedule exists. A section longer than 100 holds its text on screen for the rest.
 * @type {Readonly<Record<string, number>>}
 */
export const FALLBACK_LENGTHS = Object.freeze({
  hero: 130,
  c01: 140, c02: 150, c03: 150,
  c04: 120, c05: 110, c06: 110, c07: 130,
  c08: 160, c09: 150, c10: 170, c11: 150, c12: 140,
  c13: 160, c14: 160, c15: 160, c16: 160,
  c17: 160,
  stones: 240,
  coda: 140,
});

/**
 * Where each chapter's text sits. `place` is the vertical band for plain text beats on
 * wide screens; `align` is the side a card beat takes (the subject is on the other side).
 * Narrow screens put every text block at the top and leave the lower frame to the scene.
 * @type {Readonly<Record<string, { place?: 'mid' | 'low', align?: 'left' | 'right' }>>}
 */
export const CHAPTER_LAYOUT = Object.freeze({
  c01: { place: 'mid' },
  c02: { place: 'mid' },
  c03: { place: 'mid' },
  c08: { place: 'mid' },
  c09: { place: 'mid' },
  c10: { place: 'low' },
  c11: { place: 'low' },
  c12: { place: 'mid' },
  c13: { align: 'left' },
  c14: { align: 'right' },
  c15: { align: 'right' },
  c16: { align: 'left' },
  c17: { place: 'low' },
});

/**
 * @typedef {{ u0: number, in1: number, out0: number, u1: number }} SectionWindow
 * @typedef {{
 *   source: 'engine' | 'fallback',
 *   ids: string[],
 *   lengths: number[],
 *   total: number,
 *   count: number,
 *   windows: SectionWindow[],
 *   progressToU(p: number): number,
 *   uToProgress(u: number): number,
 * }} Schedule
 */

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const round3 = value => Math.round(value * 1000) / 1000;
/** C1 smoothstep on [0, 1]. */
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * When each section's text is up, in section units. A chapter uses the engine's beat
 * window when one is given for its section; otherwise its window keeps `edgeVh` off each
 * end of the section and fades over `fadeVh`. The hero is up from the very top, and the
 * last section stays up to the end.
 * @param {number[]} lengths vh
 * @param {ReadonlyArray<{ section: number, u0: number, in1: number, out0: number, u1: number }>} [beatWindows]
 * @param {number} [edgeVh]
 * @param {number} [fadeVh]
 * @returns {SectionWindow[]}
 */
export function sectionWindows(lengths, beatWindows = [], edgeVh = EDGE_VH, fadeVh = FADE_VH) {
  const count = lengths.length;
  return lengths.map((length, i) => {
    const beat = Array.isArray(beatWindows) ? beatWindows.find(w => w && w.section === i) : null;
    if (beat && [beat.u0, beat.in1, beat.out0, beat.u1].every(Number.isFinite) && beat.u0 <= beat.in1 && beat.in1 <= beat.out0 && beat.out0 <= beat.u1) {
      return { u0: beat.u0, in1: beat.in1, out0: beat.out0, u1: beat.u1 };
    }
    const edge = Math.min(edgeVh / length, 0.2);
    const fade = Math.min(fadeVh / length, 0.25);
    const win = { u0: i + edge, in1: i + edge + fade, out0: i + 1 - edge - fade, u1: i + 1 - edge };
    if (i === 0) {
      win.u0 = -1;
      win.in1 = -1;
    }
    if (i === count - 1) {
      win.out0 = Number.POSITIVE_INFINITY;
      win.u1 = Number.POSITIVE_INFINITY;
    }
    return win;
  });
}

/**
 * How visible a section's text is at story time u: eases in, holds at 1, eases out.
 * @param {SectionWindow} win
 * @param {number} u
 * @returns {number} 0..1
 */
export function windowOpacity(win, u) {
  if (!(u >= win.u0) || u >= win.u1) return 0;
  if (u < win.in1) return smooth((u - win.u0) / (win.in1 - win.u0));
  if (u > win.out0) return smooth((win.u1 - u) / (win.u1 - win.out0));
  return 1;
}

/**
 * Progress through a window's fades, for staggering lines: `enter` goes 0 to 1 over
 * [u0, in1], `leave` goes 1 to 0 over [out0, u1].
 * @param {SectionWindow} win
 * @param {number} u
 */
export function windowPhase(win, u) {
  const enter = win.in1 > win.u0 ? clamp((u - win.u0) / (win.in1 - win.u0), 0, 1) : u >= win.u0 ? 1 : 0;
  const leave = Number.isFinite(win.u1) && win.u1 > win.out0 ? clamp((win.u1 - u) / (win.u1 - win.out0), 0, 1) : u < win.u1 ? 1 : 0;
  return { enter, leave };
}

/**
 * A story time where section i's text is fully up (for jumping to it).
 * @param {SectionWindow} win
 * @param {number} i
 */
export function windowCentre(win, i) {
  const lo = Math.max(win.in1, i);
  const hi = Math.min(win.out0, i + 1);
  return lo <= hi ? (lo + hi) / 2 : i + 0.5;
}

/**
 * A schedule whose progress runs linearly over the cumulative section lengths.
 * @param {string[]} ids
 * @param {number[]} lengths vh, all > 0
 * @param {'engine' | 'fallback'} source
 * @param {SectionWindow[]} [windows] defaults to sectionWindows(lengths)
 * @returns {Schedule}
 */
export function linearSchedule(ids, lengths, source = 'fallback', windows = sectionWindows(lengths)) {
  const count = ids.length;
  const starts = [];
  let total = 0;
  for (const length of lengths) {
    starts.push(total);
    total += length;
  }
  return {
    source,
    ids: [...ids],
    lengths: lengths.map(round3),
    total: round3(total),
    count,
    windows,
    progressToU(p) {
      const x = clamp(Number.isFinite(p) ? p : 0, 0, 1) * total;
      if (x >= total) return count;
      let i = 0;
      while (i < count - 1 && x >= starts[i + 1]) i++;
      return i + (x - starts[i]) / lengths[i];
    },
    uToProgress(u) {
      const v = clamp(Number.isFinite(u) ? u : 0, 0, count);
      const i = Math.min(count - 1, Math.floor(v));
      return (starts[i] + (v - i) * lengths[i]) / total;
    },
  };
}

/** The schedule the page uses when the engine has none. */
export function fallbackSchedule() {
  return linearSchedule([...SECTION_IDS], SECTION_IDS.map(id => FALLBACK_LENGTHS[id]), 'fallback');
}

/**
 * @param {any} entry
 * @returns {number | null}
 */
function lengthOf(entry) {
  if (typeof entry === 'number') return entry;
  if (!entry || typeof entry !== 'object') return null;
  for (const key of ['vh', 'length', 'len', 'span', 'units', 'size']) {
    if (Number.isFinite(entry[key])) return entry[key];
  }
  return null;
}

/**
 * Reads a section list out of an engine schedule module, whatever it is called.
 * @param {Record<string, any>} mod
 * @returns {{ ids: string[], lengths: number[] | null } | null}
 */
function sectionList(mod) {
  for (const key of ['SECTIONS', 'SCHEDULE', 'sections', 'schedule', 'default']) {
    const value = mod[key];
    const list = Array.isArray(value) ? value : Array.isArray(value?.sections) ? value.sections : null;
    if (!list || !list.length || typeof list[0] === 'number') continue;
    const ids = list.map((entry, i) => (typeof entry === 'string' ? entry : typeof entry?.id === 'string' ? entry.id : SECTION_IDS[i] || `s${i}`));
    const lengths = list.map(lengthOf);
    return { ids, lengths: lengths.every(n => Number.isFinite(n) && n > 0) ? /** @type {number[]} */ (lengths) : null };
  }
  for (const key of ['SECTION_VH', 'SECTION_LENGTHS', 'LENGTHS']) {
    const value = mod[key];
    if (Array.isArray(value) && value.length && value.every(n => Number.isFinite(n) && n > 0)) {
      return { ids: value.map((_, i) => SECTION_IDS[i] || `s${i}`), lengths: [...value] };
    }
  }
  return null;
}

/**
 * Inverts a monotonic progressToU by bisection.
 * @param {(p: number) => number} progressToU
 * @param {number} u
 */
function invert(progressToU, u) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (progressToU(mid) < u) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The schedule the page lays out against: the engine's when it has a usable one
 * (engine/timeline/schedule.js), otherwise the fallback table above. Never throws.
 * @param {Record<string, any> | null | undefined} mod the engine schedule module, if any
 * @returns {Schedule}
 */
export function buildSchedule(mod) {
  const fallback = fallbackSchedule();
  if (!mod || typeof mod !== 'object') return fallback;
  try {
    const list = sectionList(mod);
    /** @param {number[]} lengths */
    const windowsFor = lengths => sectionWindows(lengths, mod.BEAT_WINDOWS, Number.isFinite(mod.BEAT_EDGE_VH) ? mod.BEAT_EDGE_VH : EDGE_VH, Number.isFinite(mod.BEAT_FADE_VH) ? mod.BEAT_FADE_VH : FADE_VH);
    const engineToU = typeof mod.progressToU === 'function' ? mod.progressToU : null;
    if (!engineToU) return list?.lengths ? linearSchedule(list.ids, list.lengths, 'engine', windowsFor(list.lengths)) : fallback;
    const ids = list?.ids || [...SECTION_IDS];
    const count = ids.length;
    /** @param {number} p */
    const progressToU = p => clamp(Number(engineToU(clamp(Number.isFinite(p) ? p : 0, 0, 1))) || 0, 0, count);
    const engineToP = typeof mod.uToProgress === 'function' ? mod.uToProgress : null;
    /** @param {number} u */
    const uToProgress = u => {
      const v = clamp(Number.isFinite(u) ? u : 0, 0, count);
      return clamp(engineToP ? Number(engineToP(v)) || 0 : invert(progressToU, v), 0, 1);
    };
    const total = list?.lengths ? list.lengths.reduce((a, b) => a + b, 0) : fallback.total;
    const edges = Array.from({ length: count + 1 }, (_, i) => (i === 0 ? 0 : i === count ? 1 : uToProgress(i)));
    const lengths = edges.slice(1).map((p, i) => (p - edges[i]) * total);
    if (!lengths.every(n => Number.isFinite(n) && n > 1)) return fallback;
    return { source: 'engine', ids, lengths: lengths.map(round3), total: round3(total), count, windows: windowsFor(lengths), progressToU, uToProgress };
  } catch {
    return fallback;
  }
}

/**
 * @typedef {'hero' | 'text' | 'word' | 'card' | 'stones' | 'coda' | 'missing'} SectionKind
 * @typedef {{
 *   index: number,
 *   id: string,
 *   kind: SectionKind,
 *   len: number,
 *   last: boolean,
 *   chapter?: string,
 *   blocks?: import('./text.js').Blocks,
 *   place?: 'mid' | 'low',
 *   align?: 'left' | 'right',
 * }} StorySection
 */

/**
 * Pairs every schedule section with the story block that renders it. Sections are matched
 * by id when the id is one of SECTION_IDS, otherwise by position. A section with nothing
 * to show is 'missing' (the page still reserves its scroll length).
 * @param {{ chapters: { id: string, text: string }[] }} content
 * @param {Schedule} schedule
 * @returns {StorySection[]}
 */
export function storySections(content, schedule) {
  const chapters = new Map(content.chapters.map(chapter => [chapter.id, chapter]));
  return schedule.ids.map((engineId, index) => {
    const id = SECTION_IDS.includes(engineId) ? engineId : SECTION_IDS[index] || engineId;
    const base = { index, id, len: schedule.lengths[index], last: index === schedule.count - 1 };
    if (id === 'hero' || id === 'stones' || id === 'coda') return { ...base, kind: id };
    const chapter = chapters.get(id);
    if (!chapter) return { ...base, kind: 'missing' };
    const parsed = blocks(chapter.text);
    const kind = parsed.heading ? 'card' : isWord(chapter.text) ? 'word' : 'text';
    return { ...base, kind, chapter: chapter.id, blocks: parsed, ...(CHAPTER_LAYOUT[id] || {}) };
  });
}
