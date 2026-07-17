import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks';

/* ── DOOM FIRE ENGINE (cyan/purple "dragon breath") ─────── */
// High-res buffer + a blurred bloom layer underneath the sharp one; ignition
// spreads continuously from the center with wind sway and rising ember sparks.
const FW = 480, FH = 264;

const buildFirePalette = () => {
  const pal = new Uint8ClampedArray(256 * 4);
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  // color stops: deep violet-black → electric purple → violet-blue → cyan → ice → white
  const stops = [
    [0, 5, 0, 16, 0],
    [16, 5, 0, 16, 200],
    [70, 150, 60, 255, 255],
    [130, 90, 150, 255, 255],
    [190, 0, 229, 255, 255],
    [230, 190, 250, 255, 255],
    [255, 255, 255, 245, 255],
  ];
  for (let i = 0; i < 256; i++) {
    let s = 0;
    while (s < stops.length - 2 && i > stops[s + 1][0]) s++;
    const [i0, r0, g0, b0, a0] = stops[s];
    const [i1, r1, g1, b1, a1] = stops[s + 1];
    const t = (i - i0) / (i1 - i0);
    pal[i * 4] = lerp(r0, r1, t);
    pal[i * 4 + 1] = lerp(g0, g1, t);
    pal[i * 4 + 2] = lerp(b0, b1, t);
    pal[i * 4 + 3] = lerp(a0, a1, t);
  }
  return pal;
};

const DragonFire = ({ onComplete }) => {
  const canvasRef = useRef(null);
  const bloomRef = useRef(null);
  const rafRef = useRef(null);
  const buf = useRef(new Uint8Array(FW * FH));
  const pal = useRef(buildFirePalette());
  const startTs = useRef(null);
  const triggered = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const bloom = bloomRef.current;
    if (!canvas || !bloom) return;
    const ctx = canvas.getContext('2d');
    const bctx = bloom.getContext('2d');
    const b = buf.current;
    const p = pal.current;
    const img = ctx.createImageData(FW, FH);
    const cx = Math.floor(FW / 2);
    const sway = new Int8Array(FH);

    // ignition blob at dead center
    for (let x = cx - 16; x <= cx + 16; x++) {
      const fall = 1 - Math.abs(x - cx) / 18;
      for (let y = FH - 8; y < FH; y++) {
        b[y * FW + x] = Math.round((200 + Math.random() * 55) * (0.5 + fall * 0.5));
      }
    }

    const updateFire = (ts) => {
      // coherent per-row wind so flames lick sideways instead of drifting straight
      for (let y = 0; y < FH; y++) {
        const s = Math.sin(ts * 0.0022 + y * 0.045);
        sway[y] = s > 0.55 ? 1 : s < -0.55 ? -1 : 0;
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < FH - 1; y++) {
          const drift = sway[y];
          for (let x = 0; x < FW; x++) {
            const rand = (Math.random() * 2) | 0;
            const src = b[(y + 1) * FW + x];
            const nx = (x - (rand & 1) + drift + FW) % FW;
            b[y * FW + nx] = src > rand ? src - rand : 0;
          }
        }
      }
    };

    const renderFire = () => {
      const data = img.data;
      for (let i = 0; i < FW * FH; i++) {
        const v = b[i];
        data[i * 4] = p[v * 4];
        data[i * 4 + 1] = p[v * 4 + 1];
        data[i * 4 + 2] = p[v * 4 + 2];
        data[i * 4 + 3] = p[v * 4 + 3];
      }
      ctx.putImageData(img, 0, 0);
      bctx.globalCompositeOperation = 'copy';
      bctx.drawImage(canvas, 0, 0);
    };

    const frame = (ts) => {
      if (!startTs.current) startTs.current = ts;
      const elapsed = ts - startTs.current;

      // the burn line spreads from the center outward, accelerating
      const spread = Math.min(1, Math.pow(elapsed / 950, 1.6));
      const half = 16 + spread * (FW / 2 - 16);
      const lo = Math.max(0, Math.floor(cx - half));
      const hi = Math.min(FW - 1, Math.ceil(cx + half));
      for (let x = lo; x <= hi; x++) {
        const edge = 1 - Math.min(1, (Math.abs(x - cx) / half) * 0.35);
        for (let y = FH - 4; y < FH; y++) {
          if (Math.random() > 0.25) {
            b[y * FW + x] = Math.round((215 + Math.random() * 40) * edge);
          }
        }
      }
      if (spread >= 1) {
        for (let x = 0; x < FW; x++) {
          b[(FH - 1) * FW + x] = 240 + Math.floor(Math.random() * 15);
        }
      }

      // ember sparks: lone hot pixels above the flame front streak upward
      if (elapsed > 350) {
        for (let e = 0; e < 5; e++) {
          const ex = (Math.random() * FW) | 0;
          const ey = (FH * (0.5 + Math.random() * 0.35)) | 0;
          b[ey * FW + ex] = 80 + ((Math.random() * 90) | 0);
        }
      }

      updateFire(ts);
      renderFire();

      // hand off once the flames reach the top of the frame
      let hot = 0;
      for (let x = 0; x < FW; x++) if (b[x] > 40) hot++;
      if (hot > FW * 0.3 && !triggered.current && elapsed > 1500) {
        triggered.current = true;
        setTimeout(() => onCompleteRef.current(), 450);
      }
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <>
      <canvas ref={bloomRef} width={FW} height={FH} aria-hidden="true" className="splash__fire splash__fire--bloom" />
      <canvas ref={canvasRef} width={FW} height={FH} aria-hidden="true" className="splash__fire" />
    </>
  );
};

/* ── SPLASH (zero page) ─────────────────────────────────── */
const Splash = ({ onDone }) => {
  const [fireOn, setFireOn] = useState(false);
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState(false);
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
    setFlash(true);
    setTimeout(() => setExiting(true), 140);
    setTimeout(onDone, 450);
  }, [onDone]);

  if (reduced) return null;

  return (
    <div
      className={`splash ${fireOn ? 'splash--rumble' : ''} ${exiting ? 'splash--exit' : ''}`}
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

      <div className={`splash__main ${shake ? 'splash__main--shake' : ''} ${fireOn ? 'splash__main--ignited' : ''}`}>
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
      {flash && <div className="splash__flash" aria-hidden="true" />}
    </div>
  );
};

export default Splash;
