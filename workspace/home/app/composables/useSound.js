// Sound: the stored preference, unlocking audio inside a user gesture, and the stones'
// hover sound. Sound starts off (window.__home.sound starts false) and the choice is
// remembered in localStorage under SOUND_KEY. Browsers start audio only inside a user
// gesture, so unlockAudio() runs inside the sound toggle's click, and once on the first
// gesture after a reload that restored "on".
//
// The hover sound: the engine facade has no sound call yet. If the scene grows a
// playHover(index) method it is used; otherwise a short synthesised note plays here
// (WebAudio, no files). If the engine starts playing its own hover sound inside
// focusStone(), set APP_HOVER_SOUND to false so the two do not double.
import { HOME_GLOBAL } from '../../contract.mjs';
import { sceneRef } from './useScene.js';

/** localStorage key for the sound preference: 'on' or 'off'. */
export const SOUND_KEY = 'rz:sound';
/** Play the app's own hover note when the scene has no hover sound of its own. */
export const APP_HOVER_SOUND = true;

/** Semitones above E5 for stones 1..7 (a pentatonic run, so a sweep reads as a phrase). */
const NOTES = [0, 2, 4, 7, 9, 12, 14];
const HOVER_GAP_MS = 70;

/** @type {AudioContext | null} */
let context = null;
let lastHover = 0;
/** @type {(() => void) | null} */
let disarm = null;

/** @returns {boolean} */
export function readStoredSound() {
  try {
    return globalThis.localStorage?.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

/** @param {boolean} on */
export function storeSound(on) {
  try {
    globalThis.localStorage?.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode or storage disabled: the choice lasts for this page only.
  }
}

/**
 * Creates or resumes the app's AudioContext. Call it only inside a user gesture.
 * @returns {AudioContext | null}
 */
export function unlockAudio() {
  const g = /** @type {any} */ (globalThis);
  const Context = g.AudioContext || g.webkitAudioContext;
  if (!Context) return null;
  try {
    context ||= new Context();
    if (context.state !== 'running') context.resume().catch(() => {});
    // A one-sample silent buffer started inside the gesture; older iOS Safari needs it.
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    source.connect(context.destination);
    source.start(0);
  } catch {
    return null;
  }
  return context;
}

/**
 * Runs `onGesture` (after unlocking audio) on the next user gesture, once.
 * @param {() => void} [onGesture]
 */
export function armUnlock(onGesture) {
  if (disarm || typeof window === 'undefined') return;
  const events = ['pointerup', 'keydown', 'click'];
  /** @param {Event} event */
  const handler = event => {
    if (event.type === 'keydown' && /** @type {KeyboardEvent} */ (event).key === 'Escape') return;
    disarm?.();
    unlockAudio();
    onGesture?.();
  };
  for (const name of events) window.addEventListener(name, handler, { capture: true, passive: true });
  disarm = () => {
    for (const name of events) window.removeEventListener(name, handler, { capture: true });
    disarm = null;
  };
}

/** @returns {boolean} */
function soundOn() {
  const api = /** @type {any} */ (globalThis)[HOME_GLOBAL];
  return !!api?.sound;
}

/**
 * The stones' hover sound, when sound is on.
 * @param {number} index stone index, 0..6
 */
export function playHover(index) {
  if (!soundOn()) return;
  const now = Date.now();
  if (now - lastHover < HOVER_GAP_MS) return;
  lastHover = now;
  const scene = /** @type {any} */ (sceneRef.value);
  if (scene && typeof scene.playHover === 'function') {
    try {
      scene.playHover(index);
    } catch {
      // The engine's sound is optional.
    }
    return;
  }
  if (!APP_HOVER_SOUND || !context || context.state !== 'running') return;
  try {
    const t = context.currentTime;
    const semitones = NOTES[Math.max(0, Math.min(NOTES.length - 1, index | 0))];
    const frequency = 659.25 * 2 ** (semitones / 12);
    const tone = context.createOscillator();
    const overtone = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(frequency, t);
    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(frequency * 2, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.045, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    const overtoneGain = context.createGain();
    overtoneGain.gain.setValueAtTime(0.18, t);
    tone.connect(gain);
    overtone.connect(overtoneGain).connect(gain);
    gain.connect(filter).connect(context.destination);
    tone.start(t);
    overtone.start(t);
    tone.stop(t + 0.36);
    overtone.stop(t + 0.36);
  } catch {
    // Audio is a nicety; never let it break the page.
  }
}
