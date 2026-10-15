export const NOTE_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export const WHITE_NOTES = [60, 62, 64, 65, 67, 69, 71, 72];
export const BLACK_NOTES = [61, 63, 66, 68, 70];
export const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
export const noteName = midi => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
export function chordNotes({ degree, major, quality, low = false, shift = 0 }, key = 6) {
  if (!degree || !quality) return [];
  // Match the reference's compact register, including VII below the tonic.
  const tonic = key >= 6 ? 48 + key : 60 + key;
  const root = tonic + [0, 2, 4, 5, 7, 9, -1][degree - 1] + shift - (low ? 12 : 0);
  const third = major ? 4 : 3;
  const intervals = quality === 2 ? [third, 7, 12, third + 12]
    : quality === 3 ? [0, third, 7, major ? 11 : 10]
      : quality === 4 ? (major ? [0, 4, 7, 10] : [0, 3, 6, 9]) : [0, 7, 12, third + 12];
  return intervals.map(n => root + n);
}
export function chordLabel(state, key) {
  const notes = chordNotes(state, key);
  if (!notes.length) return 'Ready when you are';
  const tonic = key >= 6 ? 48 + key : 60 + key;
  const root = tonic + [0, 2, 4, 5, 7, 9, -1][state.degree - 1] + state.shift;
  const suffix = state.quality === 4 ? (state.major ? '7' : '°7')
    : state.quality === 3 ? (state.major ? 'maj7' : 'm7') : state.major ? '' : 'm';
  return `${NOTE_NAMES[(root + 120) % 12]}${suffix}${state.quality === 2 ? ' / 1st' : ''}`;
}
export class StableGesture {
  constructor(delay = 100, lossGrace = 50) { this.delay = delay; this.lossGrace = lossGrace; this.reset(); }
  reset() { this.current = null; this.candidate = null; this.since = 0; this.lastSeen = -Infinity; }
  update(value, time) {
    if (value) this.lastSeen = time;
    else if (time - this.lastSeen < this.lossGrace) return this.current;
    const signature = v => v ? [v.degree, v.major, v.quality, v.low, v.shift].join(':') : '';
    if (signature(value) !== signature(this.candidate)) { this.candidate = value; this.since = time; }
    if (!value || time - this.since >= this.delay) this.current = this.candidate;
    return this.current;
  }
}
