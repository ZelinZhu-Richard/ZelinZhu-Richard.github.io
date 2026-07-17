import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks';

// Minimal custom cursor: a small dot glued to the pointer plus a ring that
// follows tightly. The ring swells over clickables and pulses on click.
const Cursor = () => {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const cur = useRef({ x: -100, y: -100 });
  const lag = useRef({ x: -100, y: -100 });
  const raf = useRef(null);
  const [hover, setHover] = useState(false);
  const [pulse, setPulse] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || window.matchMedia('(max-width:768px)').matches) return;

    const onMove = (e) => { cur.current = { x: e.clientX, y: e.clientY }; };
    const onOver = (e) => {
      setHover(!!e.target.closest('a,button,[role="button"],[data-cursor]'));
    };
    const onClick = () => {
      setPulse(true);
      setTimeout(() => setPulse(false), 200);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onOver);
    document.addEventListener('click', onClick);

    const loop = () => {
      const dot = dotRef.current, ring = ringRef.current;
      if (dot && ring) {
        dot.style.transform = `translate3d(${cur.current.x}px,${cur.current.y}px,0) translate(-50%,-50%)`;
        lag.current.x += (cur.current.x - lag.current.x) * 0.35;
        lag.current.y += (cur.current.y - lag.current.y) * 0.35;
        ring.style.transform = `translate3d(${lag.current.x}px,${lag.current.y}px,0) translate(-50%,-50%)`;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('click', onClick);
      cancelAnimationFrame(raf.current);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <>
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
      <div
        ref={ringRef}
        className={`cursor-ring ${hover ? 'is-hover' : ''} ${pulse ? 'is-pulse' : ''}`}
        aria-hidden="true"
      />
    </>
  );
};

export default Cursor;
