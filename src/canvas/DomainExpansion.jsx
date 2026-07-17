import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks';
import { HERO } from '../data/content';

// Cinematic "domain expansion" intro in three beats:
//  1. charge — stars are dragged into a flaring singularity (orbit rings, lens flare)
//  2. detonation — screen flash, camera shake, chromatic shockwaves, the void expands
//  3. greet — headshot + domain line land inside the void, triple blink hands off.
const CHARGE_MS = 1250;
const EXPAND_MS = 1500;
const GREET_MS = 2300;

const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

const DomainExpansion = ({ onDone }) => {
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState(0); // 0 intro, 1 greet, 2 blink, 3 gone
  const [blinkOn, setBlinkOn] = useState(true);
  const reduced = useReducedMotion();
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (reduced) { onDoneRef.current(); return; }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const cx = w / 2, cy = h / 2;
    const maxR = Math.hypot(cx, cy);

    // star streaks dragged toward the singularity
    const streaks = Array.from({ length: 150 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 40 + Math.random() * maxR,
      sp: 2 + Math.random() * 7,
      len: 22 + Math.random() * 70,
      hue: Math.random() < 0.5 ? '0,229,255' : '168,85,247',
    }));

    // dust motes that drift inside the void once it opens
    const motes = Array.from({ length: 46 }, () => ({
      f: 0.12 + Math.random() * 0.8,
      a: Math.random() * Math.PI * 2,
      drift: (Math.random() - 0.5) * 0.0012,
      tw: Math.random() * Math.PI * 2,
      sz: 0.6 + Math.random() * 1.3,
      hue: Math.random() < 0.7 ? '190,240,255' : '210,170,255',
    }));

    const waveDelays = [0, 140, 300];

    let raf, t0;
    const draw = (ts) => {
      if (!t0) t0 = ts;
      const el = ts - t0;
      const chargeT = Math.min(el / CHARGE_MS, 1);
      const exEl = el - CHARGE_MS;
      const exT = Math.min(Math.max(exEl / EXPAND_MS, 0), 1);
      const ease = easeOutExpo(exT);

      ctx.fillStyle = 'rgba(2,2,8,0.5)';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      // decaying camera shake right after detonation
      if (exEl > 0 && exEl < 450) {
        const m = 8 * Math.pow(1 - exEl / 450, 2);
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }

      // streaks accelerate inward as the charge builds, then get flung by the blast
      const pull = 0.5 + chargeT * chargeT * 2.2 + ease * 2.2;
      const glow = Math.min(0.5, 0.2 + 0.35 * Math.max(chargeT, ease));
      for (const s of streaks) {
        s.r -= s.sp * pull;
        s.a += (0.003 + 0.006 * chargeT + 0.005 * ease) * (s.sp / 4);
        if (s.r < 26) { s.r = maxR * (0.8 + Math.random() * 0.4); s.a = Math.random() * Math.PI * 2; }
        const stretch = s.len * (0.7 + pull * 0.28);
        const x1 = cx + Math.cos(s.a) * s.r;
        const y1 = cy + Math.sin(s.a) * s.r;
        const x2 = cx + Math.cos(s.a + 0.05) * (s.r + stretch);
        const y2 = cy + Math.sin(s.a + 0.05) * (s.r + stretch);
        // near-white head fading through the hue so streaks read as light
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, `rgba(235,250,255,${glow})`);
        grad.addColorStop(0.22, `rgba(${s.hue},${glow * 0.8})`);
        grad.addColorStop(1, `rgba(${s.hue},0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // the singularity: flaring core, lens-flare cross, collapsing orbit rings
      const coreAlpha = exEl > 0 ? Math.max(0, 1 - exEl / 200) : Math.pow(chargeT, 1.5);
      if (coreAlpha > 0.01) {
        const pulse = 1 + 0.12 * Math.sin(ts / 70);
        const cr = (4 + 24 * chargeT * chargeT) * pulse;
        ctx.globalCompositeOperation = 'lighter';

        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 3);
        g.addColorStop(0, `rgba(255,255,255,${0.95 * coreAlpha})`);
        g.addColorStop(0.22, `rgba(200,245,255,${0.55 * coreAlpha})`);
        g.addColorStop(0.55, `rgba(0,229,255,${0.22 * coreAlpha})`);
        g.addColorStop(0.85, `rgba(168,85,247,${0.1 * coreAlpha})`);
        g.addColorStop(1, 'rgba(168,85,247,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, cr * 3, 0, Math.PI * 2);
        ctx.fill();

        const fl = cr * 12 * chargeT;
        const lg = ctx.createLinearGradient(cx - fl, cy, cx + fl, cy);
        lg.addColorStop(0, 'rgba(0,229,255,0)');
        lg.addColorStop(0.5, `rgba(230,250,255,${0.3 * coreAlpha})`);
        lg.addColorStop(1, 'rgba(0,229,255,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(cx - fl, cy - 0.75, fl * 2, 1.5);
        const vg = ctx.createLinearGradient(cx, cy - fl * 0.45, cx, cy + fl * 0.45);
        vg.addColorStop(0, 'rgba(168,85,247,0)');
        vg.addColorStop(0.5, `rgba(230,250,255,${0.25 * coreAlpha})`);
        vg.addColorStop(1, 'rgba(168,85,247,0)');
        ctx.fillStyle = vg;
        ctx.fillRect(cx - 0.75, cy - fl * 0.45, 1.5, fl * 0.9);

        const orb = 74 - 44 * chargeT;
        const rot = ts * 0.004;
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = `rgba(0,229,255,${0.25 * coreAlpha * chargeT})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, orb * 2.2, orb * 0.7, rot, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(168,85,247,${0.2 * coreAlpha * chargeT})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, orb * 1.6, orb * 0.5, -rot * 1.4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalCompositeOperation = 'source-over';
      }

      if (exEl > 0) {
        // chromatic shockwave rings racing outward
        for (const d of waveDelays) {
          const wt = (exEl - d) / 950;
          if (wt <= 0 || wt >= 1) continue;
          const wr = 20 + easeOutCubic(wt) * maxR * 1.2;
          const wa = Math.pow(1 - wt, 1.6);
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = `rgba(235,250,255,${0.5 * wa})`;
          ctx.beginPath(); ctx.arc(cx, cy, wr, 0, Math.PI * 2); ctx.stroke();
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = `rgba(0,229,255,${0.35 * wa})`;
          ctx.beginPath(); ctx.arc(cx, cy, Math.max(wr - 3, 1), 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = `rgba(168,85,247,${0.28 * wa})`;
          ctx.beginPath(); ctx.arc(cx, cy, wr + 3, 0, Math.PI * 2); ctx.stroke();
        }

        // the void: black core first, then restrained additive rim light
        const r = 10 + ease * maxR * 0.62;
        ctx.fillStyle = '#020208';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'lighter';
        // tight cyan bloom hugging the edge
        const bloom = ctx.createRadialGradient(cx, cy, r * 0.94, cx, cy, r * 1.06);
        bloom.addColorStop(0, 'rgba(0,229,255,0)');
        bloom.addColorStop(0.5, `rgba(0,229,255,${0.28 * (0.5 + ease * 0.5)})`);
        bloom.addColorStop(1, 'rgba(0,229,255,0)');
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.06, 0, Math.PI * 2);
        ctx.fill();
        // wide, very faint purple haze — annulus only, so the void stays black
        const haze = ctx.createRadialGradient(cx, cy, r, cx, cy, r * 1.4);
        haze.addColorStop(0, `rgba(168,85,247,${0.1 * (0.5 + ease * 0.5)})`);
        haze.addColorStop(1, 'rgba(168,85,247,0)');
        ctx.fillStyle = haze;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
        ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
        ctx.fill();

        // crisp rim line with a slow breathing shimmer
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = `rgba(225,248,255,${0.45 + 0.15 * Math.sin(ts / 400)})`;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

        // slow-drifting light segments along the rim
        ctx.lineCap = 'round';
        const arcs = [
          { sp: 0.00045, off: 0, span: 0.7, c: '235,250,255', a: 0.16 },
          { sp: -0.00032, off: 1.3, span: 1.1, c: '0,229,255', a: 0.2 },
          { sp: 0.00058, off: 2.8, span: 0.5, c: '235,250,255', a: 0.14 },
          { sp: -0.0005, off: 4.0, span: 0.85, c: '168,85,247', a: 0.16 },
          { sp: 0.00038, off: 5.1, span: 0.6, c: '0,229,255', a: 0.18 },
          { sp: -0.00026, off: 5.9, span: 1.3, c: '235,250,255', a: 0.12 },
        ];
        ctx.lineWidth = 1.4;
        for (const a of arcs) {
          const st = ts * a.sp + a.off;
          ctx.strokeStyle = `rgba(${a.c},${a.a * ease})`;
          ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, st, st + a.span); ctx.stroke();
        }
        ctx.lineCap = 'butt';
        ctx.globalCompositeOperation = 'source-over';

        // faint motes drifting inside the void
        if (exT > 0.35) {
          const ma = Math.min((exT - 0.35) / 0.5, 1);
          for (const m of motes) {
            m.a += m.drift;
            const mr = m.f * r * 0.92;
            const mx = cx + Math.cos(m.a) * mr;
            const my = cy + Math.sin(m.a) * mr;
            const tw = 0.2 + 0.3 * (1 + Math.sin(ts / 400 + m.tw)) / 2;
            ctx.fillStyle = `rgba(${m.hue},${tw * ma})`;
            ctx.fillRect(mx, my, m.sz, m.sz);
          }
        }

        // detonation flash
        if (exEl < 200) {
          const f = 1 - exEl / 200;
          ctx.fillStyle = `rgba(210,245,255,${0.7 * f * f})`;
          ctx.fillRect(-20, -20, w + 40, h + 40);
        }
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // sequence: charge + expand → greet → triple blink → done
    const INTRO_MS = CHARGE_MS + EXPAND_MS;
    const greetAt = INTRO_MS - 300;
    const blinkStart = greetAt + GREET_MS;
    const timers = [];
    timers.push(setTimeout(() => setPhase(1), greetAt));
    timers.push(setTimeout(() => setPhase(2), blinkStart));
    [0, 110, 220, 330, 440, 550].forEach((d, i) => {
      timers.push(setTimeout(() => setBlinkOn(i % 2 === 1), blinkStart + d));
    });
    timers.push(setTimeout(() => {
      setPhase(3);
      setTimeout(() => onDoneRef.current(), 600);
    }, blinkStart + 650));

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
        <div className="domain__frame">
          <img src="/richard.jpg" alt="Richard Zhu" className="domain__photo" />
        </div>
        <p className="domain__line">{HERO.domainLine}</p>
      </div>
    </div>
  );
};

export default DomainExpansion;
