import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks';
import { HERO } from '../data/content';

// Original cosmic "domain expansion" intro: a void sphere swallows the screen
// with warped star-streaks, the headshot appears with the domain line, then a
// triple scramble-blink hands off to the particle hero.
const DomainExpansion = ({ onDone }) => {
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState(0); // 0 expand, 1 greet, 2 blink, 3 gone
  const [blinkOn, setBlinkOn] = useState(true);
  const reduced = useReducedMotion();
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (reduced) { onDoneRef.current(); return; }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);
    const cx = w / 2, cy = h / 2;
    const maxR = Math.hypot(cx, cy);

    // star streaks racing toward/away from the void
    const streaks = Array.from({ length: 160 }, () => {
      const a = Math.random() * Math.PI * 2;
      return {
        a,
        r: 40 + Math.random() * maxR,
        sp: 2 + Math.random() * 7,
        len: 14 + Math.random() * 50,
        hue: Math.random() < 0.5 ? '0,229,255' : '168,85,247',
      };
    });

    let raf, t0;
    const EXPAND_MS = 1800;
    const draw = (ts) => {
      if (!t0) t0 = ts;
      const t = Math.min((ts - t0) / EXPAND_MS, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      ctx.fillStyle = 'rgba(2,2,8,0.35)';
      ctx.fillRect(0, 0, w, h);

      // warped streaks spiral inward as the sphere grows
      for (const s of streaks) {
        s.r -= s.sp * (0.5 + ease * 1.8);
        s.a += 0.004 * ease * (s.sp / 4);
        if (s.r < 30) { s.r = maxR; s.a = Math.random() * Math.PI * 2; }
        const x1 = cx + Math.cos(s.a) * s.r;
        const y1 = cy + Math.sin(s.a) * s.r;
        const x2 = cx + Math.cos(s.a + 0.05 * ease) * (s.r + s.len);
        const y2 = cy + Math.sin(s.a + 0.05 * ease) * (s.r + s.len);
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, `rgba(${s.hue},${0.75 * (0.3 + ease * 0.7)})`);
        grad.addColorStop(1, `rgba(${s.hue},0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // the void sphere: black core + glowing rim
      const r = 20 + ease * maxR * 0.62;
      const rim = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r * 1.18);
      rim.addColorStop(0, 'rgba(0,229,255,0)');
      rim.addColorStop(0.5, `rgba(0,229,255,${0.5 + ease * 0.3})`);
      rim.addColorStop(0.72, `rgba(168,85,247,${0.35 + ease * 0.25})`);
      rim.addColorStop(1, 'rgba(168,85,247,0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#020208';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // sequence: expand → greet (2s) → triple blink → done
    const timers = [];
    timers.push(setTimeout(() => setPhase(1), EXPAND_MS));
    timers.push(setTimeout(() => setPhase(2), EXPAND_MS + 2000));
    const blinkStart = EXPAND_MS + 2000;
    [0, 120, 240, 360, 480, 600].forEach((d, i) => {
      timers.push(setTimeout(() => setBlinkOn(i % 2 === 1), blinkStart + d));
    });
    timers.push(setTimeout(() => {
      setPhase(3);
      setTimeout(() => onDoneRef.current(), 450);
    }, blinkStart + 700));

    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div className={`domain ${phase === 3 ? 'domain--exit' : ''}`} role="presentation">
      <canvas ref={canvasRef} className="domain__canvas" aria-hidden="true" />
      <div
        className={`domain__greet ${phase >= 1 ? 'show' : ''}`}
        style={{ opacity: phase >= 2 ? (blinkOn ? 1 : 0.06) : undefined }}
      >
        <img src="/richard.jpg" alt="Richard Zhu" className="domain__photo" />
        <p className="domain__line">{HERO.domainLine}</p>
      </div>
    </div>
  );
};

export default DomainExpansion;
