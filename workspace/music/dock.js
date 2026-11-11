// Phoenix pages: the "Pause sharks" toggle has no place of its own. Whenever the runtime's
// "Reimagine Phoenix" pill is hidden (before the experience starts, and in its dark sections), the
// toggle takes that pill's place and size; when the pill shows again, the toggle gives the place back.

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
    const pill = document.querySelector('.release-spirit .wrapper');
    if (!pill || !document.querySelector('.sharks-toggle')) { root.classList.remove('sharks-in-slot'); return; }
    const r = pill.getBoundingClientRect();
    root.style.setProperty('--slot-left', `${r.left}px`);
    root.style.setProperty('--slot-top', `${r.top}px`);
    root.style.setProperty('--slot-width', `${r.width}px`);
    root.style.setProperty('--slot-height', `${r.height}px`);
    const tap = [...document.querySelectorAll('.home-hero span')].find(s => s.textContent.trim() === 'Tap to explore');
    root.classList.toggle('sharks-in-slot', sharksInSlot({ pillVisible: shown(pill), tapVisible: tap ? shown(tap) && tap.getBoundingClientRect().width > 0 : false }));
  };
  tick();
  setInterval(tick, 200);
  addEventListener('resize', tick);
}

if (typeof document !== 'undefined') start();
