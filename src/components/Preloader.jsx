import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks';

const MSG = 'Trapped in a Temporal Vortex, teleporting ...';
const DURATION = 3600; // slow enough to actually read the message

const Preloader = ({ onDone }) => {
  const [prog, setProg] = useState(0);
  const [logoOn, setLogoOn] = useState(false);
  const [exiting, setExiting] = useState(false);
  const reduced = useReducedMotion();
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (reduced) { onDoneRef.current(); return; }
    const t1 = setTimeout(() => setLogoOn(true), 250);

    let raf, t0;
    const tick = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / DURATION, 1);
      // ease with a couple of "vortex stalls" so it feels like teleporting
      const wobble = Math.sin(p * Math.PI * 3) * 0.05 * (1 - p);
      setProg(Math.max(0, Math.min(1, p + wobble)) * 100);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          setExiting(true);
          setTimeout(() => onDoneRef.current(), 750);
        }, 350);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { clearTimeout(t1); cancelAnimationFrame(raf); };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div
      className={`pre ${exiting ? 'pre--exit' : ''}`}
      aria-label="Loading"
      role="status"
    >
      <div className="pre__vortex" aria-hidden="true">
        <div className="pre__vring pre__vring--1" />
        <div className="pre__vring pre__vring--2" />
        <div className="pre__vring pre__vring--3" />
      </div>
      <div className="pre__inner">
        <div className={`pre__logo ${logoOn ? 'show' : ''}`} aria-label="Zelin Zhu">
          R<span>Z</span>
        </div>
        <div className="pre__msg" aria-live="polite">{MSG}</div>
        <div className="pre__bar" role="progressbar" aria-valuenow={Math.round(prog)} aria-valuemin={0} aria-valuemax={100}>
          <div className="pre__fill" style={{ width: `${prog}%` }} />
        </div>
      </div>
    </div>
  );
};

export default Preloader;
