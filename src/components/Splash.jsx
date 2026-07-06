import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks';

/* ── DOOM FIRE ENGINE (cyan/purple "dragon breath") ─────── */
const FW = 320, FH = 180;

const buildFirePalette = () => {
  const pal = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    let r, g, b, a;
    if (i < 18) {
      r = 7; g = 0; b = 18;
      a = Math.round((i / 18) * 180);
    } else if (i < 75) {
      const t = (i - 18) / 57;
      r = Math.round(7 + t * 161);
      g = Math.round(0 + t * 85);
      b = Math.round(18 + t * 229);
      a = 255;
    } else if (i < 155) {
      const t = (i - 75) / 80;
      r = Math.round(168 - t * 168);
      g = Math.round(85 + t * 144);
      b = 255;
      a = 255;
    } else if (i < 220) {
      const t = (i - 155) / 65;
      r = Math.round(t * 255);
      g = Math.round(229 + t * 26);
      b = 255;
      a = 255;
    } else {
      const t = (i - 220) / 35;
      r = 255; g = 255;
      b = Math.round(255 - t * 30);
      a = 255;
    }
    pal[i * 4] = r; pal[i * 4 + 1] = g; pal[i * 4 + 2] = b; pal[i * 4 + 3] = a;
  }
  return pal;
};

const DragonFire = ({ onComplete }) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const buf = useRef(new Uint8Array(FW * FH));
  const pal = useRef(buildFirePalette());
  const phase = useRef(0);
  const startTs = useRef(null);
  const triggered = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const b = buf.current;
    const p = pal.current;

    const cx = Math.floor(FW / 2);
    for (let x = cx - 12; x <= cx + 12; x++) {
      for (let y = FH - 6; y < FH; y++) {
        b[y * FW + x] = 210 + Math.floor(Math.random() * 45);
      }
    }

    const updateFire = () => {
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < FH - 1; y++) {
          for (let x = 0; x < FW; x++) {
            const rand = (Math.random() * 2) | 0;
            const src = b[(y + 1) * FW + x];
            const nx = (x - (rand & 1) + FW) % FW;
            b[y * FW + nx] = src > rand ? src - rand : 0;
          }
        }
      }
    };

    const renderFire = () => {
      const img = ctx.createImageData(FW, FH);
      const data = img.data;
      for (let i = 0; i < FW * FH; i++) {
        const v = b[i];
        data[i * 4] = p[v * 4];
        data[i * 4 + 1] = p[v * 4 + 1];
        data[i * 4 + 2] = p[v * 4 + 2];
        data[i * 4 + 3] = p[v * 4 + 3];
      }
      ctx.putImageData(img, 0, 0);
    };

    const frame = (ts) => {
      if (!startTs.current) startTs.current = ts;
      const elapsed = ts - startTs.current;

      if (elapsed > 400 && phase.current < 1) {
        phase.current = 1;
        for (let x = 0; x < FW; x++) {
          for (let y = FH - 8; y < FH; y++) {
            if (Math.random() > 0.4) b[y * FW + x] = 190 + Math.floor(Math.random() * 65);
          }
        }
      }
      if (elapsed > 1000 && phase.current < 2) {
        phase.current = 2;
        for (let x = 0; x < FW; x++) {
          for (let y = FH - 14; y < FH; y++) {
            b[y * FW + x] = 230 + Math.floor(Math.random() * 25);
          }
        }
      }
      if (phase.current >= 1) {
        for (let x = 0; x < FW; x++) {
          b[(FH - 1) * FW + x] = 240 + Math.floor(Math.random() * 15);
        }
      }

      updateFire();
      renderFire();

      let hot = 0;
      for (let x = 0; x < FW; x++) if (b[x] > 40) hot++;
      if (hot > FW * 0.3 && !triggered.current && elapsed > 1400) {
        triggered.current = true;
        setTimeout(() => onCompleteRef.current(), 500);
      }
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return <canvas ref={canvasRef} width={FW} height={FH} aria-hidden="true" className="splash__fire" />;
};

/* ── SPLASH (zero page) ─────────────────────────────────── */
const Splash = ({ onDone }) => {
  const [fireOn, setFireOn] = useState(false);
  const [shake, setShake] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [clicked, setClicked] = useState(false);
  const reduced = useReducedMotion();

  // Reduced motion: skip the show entirely.
  useEffect(() => {
    if (reduced) onDone();
  }, [reduced, onDone]);

  useEffect(() => {
    const t = setTimeout(() => trigger(), 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trigger = () => {
    setClicked((c) => {
      if (c) return c;
      setShake(true);
      setTimeout(() => { setShake(false); setFireOn(true); }, 350);
      return true;
    });
  };

  const onFireComplete = useCallback(() => {
    setExiting(true);
    setTimeout(onDone, 300);
  }, [onDone]);

  if (reduced) return null;

  return (
    <div
      className={`splash ${exiting ? 'splash--exit' : ''}`}
      onClick={trigger}
      role="button"
      tabIndex={0}
      aria-label="Click to enter site"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') trigger(); }}
    >
      <div className="splash__grid" aria-hidden="true" />
      <div className="splash__glows" aria-hidden="true">
        <div className="splash__glow splash__glow--p" />
        <div className="splash__glow splash__glow--c" />
      </div>

      <div className="splash__corner splash__corner--tl" aria-hidden="true">R<span>Z</span></div>
      <div className="splash__corner splash__corner--tr" aria-hidden="true">personal portfolio</div>
      <div className="splash__corner splash__corner--bl" aria-hidden="true">est. 2026</div>
      <div className="splash__corner splash__corner--br" aria-hidden="true">
        <i style={{ background: '#00E5FF', boxShadow: '0 0 8px #00E5FF' }} />
        <i style={{ background: '#A855F7', boxShadow: '0 0 8px #A855F7' }} />
        <i style={{ background: '#FFD600', boxShadow: '0 0 8px #FFD600' }} />
      </div>

      <div className={`splash__main ${shake ? 'splash__main--shake' : ''}`}>
        <h1 className="splash__name">ZELIN <span>ZHU</span></h1>
        <div className="splash__tag">turning dreams into shipped things</div>

        <div className="splash__enter">
          <div className="splash__enter-txt">
            {fireOn ? 'igniting…' : 'click anywhere to enter'}
          </div>
          {!fireOn && (
            <div className="splash__pulse" aria-hidden="true">
              <div className="splash__pring splash__pring--1" />
              <div className="splash__pring splash__pring--2" />
              <div className="splash__pdot" />
            </div>
          )}
        </div>
      </div>

      {fireOn && <DragonFire onComplete={onFireComplete} />}
    </div>
  );
};

export default Splash;
