import { useEffect, useRef, useState } from 'react';
import { isMobileDevice, useReducedMotion } from '../hooks';
import { getVelocity } from '../scroll';

// Azure Loong: a slim line-art Chinese dragon that swims across the viewport
// as the page scrolls. Its route is driven by smoothed scroll progress, its
// undulation by scroll velocity; fast scrolls make it exhale star-wisps.
const SEGS = 34;
const SPACING = 15;

const LoongDragon = () => {
  const canvasRef = useRef(null);
  const reduced = useReducedMotion();
  const [mobile] = useState(() => isMobileDevice());

  useEffect(() => {
    if (reduced || mobile) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w, h;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // body chain, head first
    const pts = Array.from({ length: SEGS }, (_, i) => ({
      x: window.innerWidth * 0.85 + i * SPACING,
      y: window.innerHeight * 0.22,
    }));
    const wisps = [];
    let prog = 0;

    let raf;
    const draw = (ts) => {
      const time = ts / 1000;
      const v = getVelocity();
      const speed = Math.min(1.5, Math.abs(v) * 0.02);

      // route: viewport crossings over the page's scroll span + idle drift
      const denom = Math.max(1, document.documentElement.scrollHeight - h);
      prog += (window.scrollY / denom - prog) * 0.05;
      const tx = w * (0.5 + 0.4 * Math.cos(prog * Math.PI * 3.2 + time * 0.14));
      const ty = h * (0.5 + 0.33 * Math.sin(prog * Math.PI * 5.3 + time * 0.09)) + Math.sin(time * 0.7) * 22;
      pts[0].x += (tx - pts[0].x) * (0.03 + speed * 0.045);
      pts[0].y += (ty - pts[0].y) * (0.03 + speed * 0.045);

      // follow-the-leader: each segment stays SPACING behind its leader
      for (let i = 1; i < SEGS; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        const d = Math.hypot(dx, dy) || 1;
        pts[i].x = pts[i - 1].x + (dx / d) * SPACING;
        pts[i].y = pts[i - 1].y + (dy / d) * SPACING;
      }

      // rendered points: perpendicular sine undulation, stronger toward tail
      const amp = 5 + Math.min(16, Math.abs(v) * 0.35);
      const rp = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(SEGS - 1, i + 1)];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const px = -dy / d, py = dx / d;
        const off = amp * Math.sin(time * (2.6 + speed) - i * 0.55) * (0.3 + i / SEGS);
        return { x: p.x + px * off, y: p.y + py * off, px, py };
      });

      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 0.72;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const width = (i) => 2 + Math.pow(1 - i / SEGS, 1.3) * 9;

      // dorsal fins
      ctx.fillStyle = 'rgba(238,238,255,0.32)';
      for (let i = 2; i < SEGS - 4; i += 2) {
        const s = rp[i], n = rp[i + 1];
        const fh = width(i) * 1.7;
        ctx.beginPath();
        ctx.moveTo(s.x - s.px * width(i) * 0.4, s.y - s.py * width(i) * 0.4);
        ctx.lineTo(s.x - s.px * fh - (n.x - s.x) * 0.35, s.y - s.py * fh - (n.y - s.y) * 0.35);
        ctx.lineTo(n.x - n.px * width(i) * 0.4, n.y - n.py * width(i) * 0.4);
        ctx.closePath();
        ctx.fill();
      }

      // tapered body + cyan belly line
      for (let i = 0; i < SEGS - 1; i++) {
        ctx.strokeStyle = 'rgba(238,238,255,0.8)';
        ctx.lineWidth = width(i);
        ctx.beginPath();
        ctx.moveTo(rp[i].x, rp[i].y);
        ctx.lineTo(rp[i + 1].x, rp[i + 1].y);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0,229,255,0.4)';
        ctx.lineWidth = Math.max(0.5, width(i) * 0.3);
        const o = width(i) * 0.4;
        ctx.beginPath();
        ctx.moveTo(rp[i].x + rp[i].px * o, rp[i].y + rp[i].py * o);
        ctx.lineTo(rp[i + 1].x + rp[i + 1].px * o, rp[i + 1].y + rp[i + 1].py * o);
        ctx.stroke();
      }

      // head: snout wedge, swept horns, waving whiskers, glowing eye
      const hd = rp[0];
      const dirx = rp[0].x - rp[2].x, diry = rp[0].y - rp[2].y;
      const dl = Math.hypot(dirx, diry) || 1;
      const dx = dirx / dl, dy = diry / dl;
      const nose = { x: hd.x + dx * 14, y: hd.y + dy * 14 };

      ctx.strokeStyle = 'rgba(238,238,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hd.x + hd.px * 4.5, hd.y + hd.py * 4.5);
      ctx.lineTo(nose.x, nose.y);
      ctx.lineTo(hd.x - hd.px * 4.5, hd.y - hd.py * 4.5);
      ctx.stroke();

      for (const side of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(hd.x - dx * 2 + hd.px * 3 * side, hd.y - dy * 2 + hd.py * 3 * side);
        ctx.quadraticCurveTo(
          hd.x - dx * 16 + hd.px * 11 * side, hd.y - dy * 16 + hd.py * 11 * side,
          hd.x - dx * 26 + hd.px * 17 * side, hd.y - dy * 26 + hd.py * 17 * side
        );
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(0,229,255,0.5)';
      ctx.lineWidth = 1;
      for (const side of [1, -1]) {
        const wave = Math.sin(time * 3 + side) * 7;
        ctx.beginPath();
        ctx.moveTo(nose.x + hd.px * 2 * side, nose.y + hd.py * 2 * side);
        ctx.quadraticCurveTo(
          nose.x + dx * 6 + hd.px * 18 * side, nose.y + dy * 6 + hd.py * 18 * side,
          nose.x - dx * 38 + hd.px * (24 + wave) * side, nose.y - dy * 38 + hd.py * (24 + wave) * side
        );
        ctx.stroke();
      }

      const eye = { x: hd.x + dx * 4 - hd.px * 3, y: hd.y + dy * 4 - hd.py * 3 };
      ctx.fillStyle = 'rgba(0,229,255,0.35)';
      ctx.beginPath(); ctx.arc(eye.x, eye.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(eye.x, eye.y, 1.8, 0, Math.PI * 2); ctx.fill();

      // star-wisps exhaled on fast scrolls
      if (Math.abs(v) > 28 && wisps.length < 60) {
        for (let k = 0; k < 3; k++) {
          wisps.push({
            x: nose.x, y: nose.y,
            vx: dx * 2.4 + (Math.random() - 0.5) * 1.6,
            vy: dy * 2.4 + (Math.random() - 0.5) * 1.6,
            life: 1,
          });
        }
      }
      for (let k = wisps.length - 1; k >= 0; k--) {
        const p = wisps[k];
        p.x += p.vx; p.y += p.vy; p.vy -= 0.02; p.life -= 0.018;
        if (p.life <= 0) { wisps.splice(k, 1); continue; }
        ctx.fillStyle = `rgba(0,229,255,${0.6 * p.life})`;
        ctx.fillRect(p.x, p.y, 2, 2);
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [reduced, mobile]);

  if (reduced || mobile) return null;

  return <canvas ref={canvasRef} className="loong" aria-hidden="true" />;
};

export default LoongDragon;
