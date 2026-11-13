// Small music player on the phoenix pages. It takes the place of the runtime's sound button: click to
// play, click again to pause. The runtime's own background loop is switched off at build time, so this
// player is the only music; it still drives the runtime's sound switch (the hidden .sound-button), which
// keeps the crystal and wing sound effects on while music plays and off while it is paused.
import { PLAYLIST } from './playlist.js';

export const VOLUME = 0.4; // the runtime's background loop played at gain 0.4

export const nextIndex = (index, length) => (length ? (index + 1) % length : 0);
export const prevIndex = (index, length) => (length ? (index - 1 + length) % length : 0);
// "Last" restarts the song when it is more than 3 s in, like most players; otherwise it goes back one.
export const lastAction = currentTime => (currentTime > 3 ? 'restart' : 'previous');
export const trackLabel = track => (track.artist ? `${track.title} · ${track.artist}` : track.title);

// What the runtime's sound switch should make the player do. `active` is the switch, `playing` the
// player, `userPaused` whether the visitor paused the music with the player's own button.
export function follow({ active, playing, userPaused }) {
  if (active && !playing && !userPaused) return 'play';
  if (!active && playing) return 'pause';
  return 'stay';
}

const NOTE = '<svg class="vibe-note" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.2 13 1v9.3a2.2 2.2 0 1 1-1.4-2V4.1L7.4 4.8v7.5a2.2 2.2 0 1 1-1.4-2Z"/></svg>';
const BARS = '<span class="vibe-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
const NEXT = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5 7.5 6l-6 4.5Zm7 0h2v9h-2Z"/></svg>';
const LAST = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M10.5 1.5 4.5 6l6 4.5Zm-7 0h-2v9h2Z"/></svg>';

function start() {
  if (!PLAYLIST.length) return;
  let index = 0, want = false, userPaused = false, unlocked = false;
  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = VOLUME;
  const load = () => { audio.src = PLAYLIST[index].src; audio.loop = PLAYLIST.length === 1; };
  load();

  const root = document.createElement('div');
  root.className = 'vibe-player';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Music');
  root.innerHTML = `<button type="button" class="vibe-toggle">${NOTE}${BARS}</button><button type="button" class="vibe-last" aria-label="Last song">${LAST}</button><button type="button" class="vibe-next" aria-label="Next song">${NEXT}</button><span class="vibe-now" aria-live="polite"></span>`;
  const toggle = root.querySelector('.vibe-toggle');
  const now = root.querySelector('.vibe-now');
  const switchEl = () => document.querySelector('.sound-button');

  const render = () => {
    const playing = want && !audio.paused;
    const label = trackLabel(PLAYLIST[index]);
    root.classList.toggle('playing', playing);
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} music: ${label}`);
    now.textContent = label;
  };
  const play = () => {
    want = true;
    audio.muted = false;
    audio.play().catch(() => { want = false; render(); });
    render();
  };
  const pause = () => { want = false; audio.pause(); render(); };
  // Keep the runtime's sound switch (and with it the sound effects) in step with the music.
  const setSwitch = on => { const s = switchEl(); if (s && s.classList.contains('active') !== on) s.click(); };

  toggle.addEventListener('click', () => {
    if (want && !audio.paused) { userPaused = true; pause(); setSwitch(false); }
    else { userPaused = false; play(); setSwitch(true); }
  });
  // Last and next always play, so they also turn the runtime's sound back on.
  const skipTo = i => { index = i; load(); userPaused = false; play(); setSwitch(true); };
  root.querySelector('.vibe-next').addEventListener('click', () => skipTo(nextIndex(index, PLAYLIST.length)));
  root.querySelector('.vibe-last').addEventListener('click', () => {
    if (lastAction(audio.currentTime) === 'restart') { audio.currentTime = 0; userPaused = false; play(); setSwitch(true); }
    else skipTo(prevIndex(index, PLAYLIST.length));
  });
  audio.addEventListener('ended', () => { index = nextIndex(index, PLAYLIST.length); load(); play(); });
  for (const event of ['play', 'pause']) audio.addEventListener(event, render);
  // The runtime's custom cursor grows over its buttons; pass hover through to the hidden switch.
  for (const [from, to] of [['mouseenter', 'mouseenter'], ['mouseleave', 'mouseleave']]) {
    root.addEventListener(from, () => switchEl()?.dispatchEvent(new MouseEvent(to)));
  }

  // Safari only lets audio start inside a gesture; the runtime starts sound from its own click handler,
  // so start the element muted on the first gesture and let `play()` unmute it.
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    audio.muted = true;
    audio.play().then(() => { if (!want) audio.pause(); audio.muted = false; }).catch(() => { audio.muted = false; });
  };
  for (const event of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(event, unlock, { capture: true, once: true });

  let watched = null;
  const observer = new MutationObserver(() => sync());
  const sync = () => {
    const s = switchEl();
    if (!s) return;
    if (watched !== s) {
      observer.disconnect();
      observer.observe(s, { attributes: true, attributeFilter: ['class'] });
      watched = s;
    }
    if (root.nextElementSibling !== s) s.parentElement.insertBefore(root, s);
    document.documentElement.classList.add('has-vibe-player');
    document.documentElement.classList.toggle('phoenix-dark', s.classList.contains('dark'));
    const action = follow({ active: s.classList.contains('active'), playing: want && !audio.paused, userPaused });
    if (action === 'play') play();
    if (action === 'pause') pause();
  };
  render();
  sync();
  setInterval(sync, 500); // the runtime may re-render its header (and the switch) on navigation
}

if (typeof document !== 'undefined') start();
