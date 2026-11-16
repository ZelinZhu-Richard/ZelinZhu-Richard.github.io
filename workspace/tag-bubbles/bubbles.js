// Experience tags as soap bubbles that rise up the empty column under each date.
// Click (or tap) one to pop it; it floats back up from the bottom a few seconds later.
// The tag list stays in the page for screen readers and no-JS visitors; the bubbles are decoration.
import { seed, step, respawn } from './physics.js';

const COLORS = ['#7aa2ff', '#b98cff', '#ff7ac8', '#ffd27a', '#7affd6'];
const RETURN_MS = 3500;
const SOUND_KEY = 'tag-bubbles-sound';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fields = [];

let audio = null;
let soundOn = false;
try { soundOn = localStorage.getItem(SOUND_KEY) === 'on'; } catch { /* optional */ }

// A short synthesized pop: a pitch drop plus a breath of noise. Only after the visitor turns sound on.
function popSound() {
  if (!soundOn) return;
  try {
    audio ||= new AudioContext();
    const now = audio.currentTime;
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520 + Math.random() * 160, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.07);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain).connect(audio.destination);
    osc.start(now); osc.stop(now + 0.1);
    const noise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.03), audio.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = audio.createBufferSource(), ng = audio.createGain();
    src.buffer = noise; ng.gain.value = 0.05;
    src.connect(ng).connect(audio.destination);
    src.start(now);
  } catch { /* no audio: stay silent */ }
}

function soundToggle(section) {
  const heading = section.querySelector('h2');
  if (!heading) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bubble-sound';
  const label = () => { button.textContent = `Pop sound: ${soundOn ? 'on' : 'off'}`; button.setAttribute('aria-pressed', String(soundOn)); };
  label();
  button.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch { /* optional */ }
    for (const b of document.querySelectorAll('.bubble-sound')) b.dispatchEvent(new Event('sync'));
    if (soundOn) popSound();
  });
  button.addEventListener('sync', label);
  const row = document.createElement('div');
  row.className = 'bubble-heading';
  heading.replaceWith(row);
  row.append(heading, button);
}

function place(b) {
  b.el.style.transform = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px)`;
}

function pop(field, b) {
  if (!b.alive) return;
  b.alive = false;
  popSound();
  const cx = b.x + b.d / 2, cy = b.y + b.d / 2;
  b.el.classList.add('is-popped');
  if (!reduce) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + Math.random() * 0.3, r = 10 + Math.random() * 16;
      const drop = document.createElement('i');
      drop.className = 'bubble-drop';
      drop.style.cssText = `left:${cx + Math.cos(a) * b.d / 2}px;top:${cy + Math.sin(a) * b.d / 2}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;--c:${COLORS[k % COLORS.length]}`;
      field.el.append(drop);
      setTimeout(() => drop.remove(), 600);
    }
    const word = document.createElement('i');
    word.className = 'bubble-word';
    word.textContent = 'pop!';
    word.style.cssText = `left:${cx}px;top:${cy}px`;
    field.el.append(word);
    setTimeout(() => word.remove(), 1000);
  }
  setTimeout(() => {
    if (!reduce) respawn(b, field.el.clientWidth, field.el.clientHeight);
    b.alive = true;
    place(b);
    b.el.classList.remove('is-popped');
  }, RETURN_MS);
}

for (const section of document.querySelectorAll('.experience')) {
  const rows = [...section.querySelectorAll(':scope > ol > li')].filter(li => li.querySelector('.tags'));
  if (!rows.length) continue;
  soundToggle(section);
  for (const li of rows) {
    const list = li.querySelector('.tags');
    const labels = [...list.children].map(item => item.textContent.trim()).filter(Boolean);
    const el = document.createElement('div');
    el.className = 'bubble-field';
    el.setAttribute('aria-hidden', 'true');
    li.classList.add('has-bubbles');
    list.classList.add('bubble-source');
    li.append(el);
    const field = { el, bubbles: [], mouse: null, visible: true };
    field.bubbles = seed(labels, el.clientWidth, el.clientHeight);
    for (const b of field.bubbles) {
      b.el = document.createElement('span');
      b.el.className = 'bubble';
      b.el.style.width = b.el.style.height = `${b.d}px`;
      b.el.innerHTML = '<span></span>';
      b.el.firstChild.textContent = b.label;
      b.el.addEventListener('click', () => pop(field, b));
      el.append(b.el);
      place(b);
    }
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); field.mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
    el.addEventListener('pointerleave', () => { field.mouse = null; });
    fields.push(field);
  }
}

if (fields.length && !reduce) {
  const watch = new IntersectionObserver(entries => {
    for (const entry of entries) { const f = fields.find(f => f.el === entry.target); if (f) f.visible = entry.isIntersecting; }
  });
  for (const f of fields) watch.observe(f.el);
  let last = performance.now();
  const frame = now => {
    const dt = Math.min(3, (now - last) / (1000 / 60));
    last = now;
    if (!document.hidden) {
      for (const f of fields) {
        if (!f.visible) continue;
        step(f.bubbles, f.el.clientWidth, f.el.clientHeight, dt, now / 1000, f.mouse);
        for (const b of f.bubbles) if (b.alive) place(b);
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
