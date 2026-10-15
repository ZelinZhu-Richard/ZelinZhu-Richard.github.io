export const NOTE_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'I ↑'];
export const WHITE_NOTES = [60, 62, 64, 65, 67, 69, 71, 72];
export const BLACK_NOTES = [61, 63, 66, 68, 70];
export const CHORD_COLORS = ['#f4b354','#e364a3','#c88ce6','#f5df67','#ff9a58','#f57878','#8dd9ef','#f4b354'];
const MAJOR_ROOT_NAMES = [
  'C D E F G A B', 'D♭ E♭ F G♭ A♭ B♭ C', 'D E F♯ G A B C♯',
  'E♭ F G A♭ B♭ C D', 'E F♯ G♯ A B C♯ D♯', 'F G A B♭ C D E',
  'F♯ G♯ A♯ B C♯ D♯ E♯', 'G A B C D E F♯', 'A♭ B♭ C D♭ E♭ F G',
  'A B C♯ D E F♯ G♯', 'B♭ C D E♭ F G A', 'B C♯ D♯ E F♯ G♯ A♯',
].map(names=>names.split(' '));
export function easyChord(degree) {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) return null;
  return {degree, major:[1,4,5].includes(degree), quality:degree===7?5:1, low:false, shift:0, volume:.7, filter:.3};
}
export function countingChord(count, capo = 0) {
  if (!Number.isInteger(count) || count < 1 || count > 8 || !Number.isInteger(capo) || capo < 0 || capo > 11) return null;
  return {...easyChord(count === 8 ? 1 : count), degree:count, counting:true, shift:capo};
}
export const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
export const noteName = midi => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
function chordRoot({degree, counting = false, shift = 0}, key) {
  // Counting rises C–C like the white keys. The reference modes keep their compact register.
  const tonic = counting ? 60 : key >= 6 ? 48 + key : 60 + key;
  return tonic + (counting ? [0, 2, 4, 5, 7, 9, 11, 12] : [0, 2, 4, 5, 7, 9, -1])[degree - 1] + shift;
}
export function chordNotes({ degree, major, quality, low = false, shift = 0, counting = false }, key = 6) {
  if (!Number.isInteger(degree) || degree < 1 || degree > (counting ? 8 : 7) || !quality) return [];
  // Match the reference's compact register, including VII below the tonic.
  const root = chordRoot({degree,counting,shift},key) - (low ? 12 : 0);
  const third = major ? 4 : 3;
  const intervals = quality === 5 ? [0, 3, 6, 12] : quality === 2 ? [third, 7, 12, third + 12]
    : quality === 3 ? [0, third, 7, major ? 11 : 10]
      : quality === 4 ? (major ? [0, 4, 7, 10] : [0, 3, 6, 9]) : [0, 7, 12, third + 12];
  return intervals.map(n => root + n);
}
export function chordLabel(state, key) {
  const notes = chordNotes(state, key);
  if (!notes.length) return 'Ready when you are';
  const root = chordRoot(state,key);
  const suffix = state.quality === 5 ? '°' : state.quality === 4 ? (state.major ? '7' : '°7')
    : state.quality === 3 ? (state.major ? 'maj7' : 'm7') : state.major ? '' : 'm';
  const name=state.counting?MAJOR_ROOT_NAMES[state.shift]?.[(state.degree-1)%7]:NOTE_NAMES[(root+120)%12];
  return `${name}${suffix}${state.quality === 2 ? ' / 1st' : ''}${state.counting && state.degree === 8 ? ' ↑' : ''}`;
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
