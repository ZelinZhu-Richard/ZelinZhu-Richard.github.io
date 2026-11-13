// Phoenix pages: the "Pause sharks" toggle has no place of its own. Whenever the runtime's
// "Reimagine Phoenix" pill is hidden (before the experience starts, and in its dark sections), the
// toggle takes that pill's place and size; when the pill shows again, the toggle gives the place back.

// Where the pill sits (fixed, bottom 25px; right 37px from 1024px up, left 20px below) for pages that
// have no pill, such as Contact, so the toggle still has a place there.
export const fallbackSlot = (width, height) => ({ left: width >= 1024 ? width - 37 - 220 : 20, top: height - 25 - 46, width: 220, height: 46 });

// Lift a slot above any of `rects` it would cover (Contact's footer links share the bottom edge).
export function clearOf(slot, rects, gap = 14) {
  const hits = rects.filter(r => r.left < slot.left + slot.width && r.left + r.width > slot.left && r.top < slot.top + slot.height && r.top + r.height > slot.top);
  return hits.length ? { ...slot, top: Math.min(...hits.map(r => r.top)) - slot.height - gap } : slot;
}

// The toggle shows only when the pill is hidden and the phone "Tap to explore" bar is not in the way.
export const sharksInSlot = ({ pillVisible, tapVisible }) => !pillVisible && !tapVisible;

const shown = el => {
  if (!el) return false;
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return false;
  }
  return true;
};

function start() {
  const root = document.documentElement;
  const tick = () => {
    if (!document.querySelector('.sharks-toggle')) return;
    const pill = document.querySelector('.release-spirit .wrapper');
    const links = () => [...document.querySelectorAll('a')].filter(shown).map(a => a.getBoundingClientRect()).filter(r => r.width);
    const r = pill ? pill.getBoundingClientRect() : clearOf(fallbackSlot(innerWidth, innerHeight), links());
    root.style.setProperty('--slot-left', `${r.left}px`);
    root.style.setProperty('--slot-top', `${r.top}px`);
    root.style.setProperty('--slot-width', `${r.width}px`);
    root.style.setProperty('--slot-height', `${r.height}px`);
    const tap = [...document.querySelectorAll('.home-hero span')].find(s => s.textContent.trim() === 'Tap to explore');
    root.classList.toggle('sharks-in-slot', sharksInSlot({ pillVisible: pill ? shown(pill) : false, tapVisible: tap ? shown(tap) && tap.getBoundingClientRect().width > 0 : false }));
  };
  tick();
  setInterval(tick, 200);
  addEventListener('resize', tick);
}

if (typeof document !== 'undefined') start();
