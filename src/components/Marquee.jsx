import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks';
import { getVelocity } from '../scroll';

// Velocity-reactive marquee band: drifts on its own, whips along (and
// reverses) with scroll direction and speed.
const Marquee = ({ items, baseSpeed = 0.6, reverse = false }) => {
  const trackRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const track = trackRef.current;
    let x = 0, raf;
    const dir = reverse ? -1 : 1;
    const loop = () => {
      const half = track.scrollWidth / 2 || 1;
      x -= dir * (baseSpeed + getVelocity() * 0.16);
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      track.style.transform = `translate3d(${x}px,0,0)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced, baseSpeed, reverse]);

  return (
    <div className="marquee" aria-hidden="true">
      <div ref={trackRef} className="marquee__track">
        {[0, 1].map((k) => (
          <span key={k} className="marquee__row">
            {items.map((it, i) => (
              <span key={i} className={`marquee__word ${i % 3 === 2 ? 'marquee__word--solid' : ''}`}>
                {it}<i>·</i>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
};

export default Marquee;
