import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks';

// Site-wide fixed background: twinkling stars + occasional meteor streaks.
const Starfield = () => {
  const canvasRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let w, h, raf;
    let stars = [];
    let meteors = [];

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      const count = Math.min(220, Math.floor((w * h) / 9000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.3,
        tw: Math.random() * Math.PI * 2,
        sp: 0.008 + Math.random() * 0.02,
        hue: Math.random() < 0.12 ? '0,229,255' : Math.random() < 0.2 ? '168,85,247' : '238,238,255',
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnMeteor = () => {
      meteors.push({
        x: Math.random() * w * 0.9 + w * 0.1,
        y: -20,
        vx: -(3 + Math.random() * 4),
        vy: 4 + Math.random() * 3,
        life: 1,
      });
    };

    let lastMeteor = 0;
    const draw = (ts) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.tw += s.sp;
        const a = 0.25 + Math.abs(Math.sin(s.tw)) * 0.6;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.hue},${a})`;
        ctx.fill();
      }
      if (!reduced && ts - lastMeteor > 7000 + Math.random() * 6000) {
        lastMeteor = ts;
        spawnMeteor();
      }
      meteors = meteors.filter((m) => m.life > 0);
      for (const m of meteors) {
        m.x += m.vx; m.y += m.vy; m.life -= 0.012;
        const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 12, m.y - m.vy * 12);
        grad.addColorStop(0, `rgba(0,229,255,${0.9 * m.life})`);
        grad.addColorStop(1, 'rgba(0,229,255,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 12, m.y - m.vy * 12);
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };

    if (reduced) {
      // static single frame, no twinkle/meteors
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.hue},0.5)`;
        ctx.fill();
      }
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [reduced]);

  return <canvas ref={canvasRef} className="starfield" aria-hidden="true" />;
};

export default Starfield;
