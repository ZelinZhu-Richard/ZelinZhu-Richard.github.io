import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks';
import { getVelocity } from '../scroll';

// Elastic divider: a horizontal line that bends with scroll velocity and
// cursor plucks, then springs back with an underdamped wobble.
const StringDivider = () => {
  const svgRef = useRef(null);
  const pathRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const svg = svgRef.current;
    const path = pathRef.current;
    let bend = 0, vel = 0, pluck = 0, raf;

    const onMove = (e) => {
      const r = svg.getBoundingClientRect();
      if (r.width && e.clientY > r.top - 30 && e.clientY < r.bottom + 30) {
        pluck = Math.max(-60, Math.min(60, (e.clientY - (r.top + r.height / 2)) * 1.2));
      } else {
        pluck = 0;
      }
    };
    window.addEventListener('mousemove', onMove);

    const loop = () => {
      const w = svg.clientWidth || 1200;
      const target = Math.max(-55, Math.min(55, getVelocity() * 1.4)) + pluck;
      vel += (target - bend) * 0.085;
      vel *= 0.86;
      bend += vel;
      path.setAttribute('d', `M 0 70 Q ${w / 2} ${70 + bend * 2} ${w} 70`);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); };
  }, [reduced]);

  return (
    <div className="string-div" aria-hidden="true">
      <svg ref={svgRef} width="100%" height="140">
        <defs>
          <linearGradient id="string-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="rgba(238,238,255,0.06)" />
            <stop offset="0.5" stopColor="rgba(0,229,255,0.35)" />
            <stop offset="1" stopColor="rgba(238,238,255,0.06)" />
          </linearGradient>
        </defs>
        <path ref={pathRef} d="M 0 70 Q 600 70 1200 70" fill="none" stroke="url(#string-grad)" strokeWidth="1.5" />
      </svg>
    </div>
  );
};

export default StringDivider;
