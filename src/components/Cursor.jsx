import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks';

const BASE_SIZE = 22;
const MAX_SIZE = 240;

// Black-hole cursor: dark core + cyan accretion ring. Shows "DETAIL" over
// clickables. Grows a little on every click and never shrinks — until the
// Big Bang button (footer) collapses it back with a burst.
const Cursor = () => {
  const holeRef = useRef(null);
  const ringRef = useRef(null);
  const cur = useRef({ x: -100, y: -100 });
  const lag = useRef({ x: -100, y: -100 });
  const raf = useRef(null);
  const [hover, setHover] = useState(false);
  const [size, setSize] = useState(BASE_SIZE);
  const [burst, setBurst] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || window.matchMedia('(max-width:768px)').matches) return;

    const onMove = (e) => { cur.current = { x: e.clientX, y: e.clientY }; };
    const onOver = (e) => {
      setHover(!!e.target.closest('a,button,[role="button"],[data-cursor]'));
    };
    const onClick = (e) => {
      if (e.target.closest('[data-bigbang]')) {
        setBurst(true);
        setSize(BASE_SIZE);
        setTimeout(() => setBurst(false), 700);
      } else {
        setSize((s) => Math.min(s + 6, MAX_SIZE));
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onOver);
    document.addEventListener('click', onClick);

    const loop = () => {
      const hole = holeRef.current, ring = ringRef.current;
      if (hole && ring) {
        hole.style.left = cur.current.x + 'px';
        hole.style.top = cur.current.y + 'px';
        lag.current.x += (cur.current.x - lag.current.x) * 0.13;
        lag.current.y += (cur.current.y - lag.current.y) * 0.13;
        ring.style.left = lag.current.x + 'px';
        ring.style.top = lag.current.y + 'px';
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
      <div
        ref={holeRef}
        className={`bh-core ${burst ? 'bh-burst' : ''}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
      <div
        ref={ringRef}
        className={`bh-ring ${hover ? 'is-hover' : ''}`}
        style={{ width: size + 26, height: size + 26 }}
        aria-hidden="true"
      >
        {hover ? 'DETAIL' : ''}
      </div>
    </>
  );
};

export default Cursor;
