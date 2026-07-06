import { useEffect, useRef } from 'react';
import { isMobileDevice, useReducedMotion } from '../hooks';
import { createMagic } from './magic';

// Interactive particle-text canvas. Skipped on mobile and reduced motion —
// the hero renders a plain-text name instead in those cases.
const MagicCanvas = ({ text }) => {
  const coverRef = useRef(null);
  const magicRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || isMobileDevice()) return;
    const magicEl = magicRef.current;
    const handle = createMagic(magicEl, text);

    // Pause/resume the scene as the hero scrolls out of / into view.
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            magicEl.removeAttribute('disabled');
          } else if (!entry.isIntersecting && entry.intersectionRatio <= 0.3) {
            magicEl.setAttribute('disabled', 'true');
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(coverRef.current);

    return () => { observer.disconnect(); handle.dispose(); };
  }, [text, reduced]);

  return (
    <div id="magicCover" ref={coverRef} aria-hidden="true">
      <div id="magic" ref={magicRef} />
    </div>
  );
};

export default MagicCanvas;
