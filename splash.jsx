// splash.jsx — Zero page with dragon mascot + dragonbreath canvas fire transition

/* ── DRAGON MASCOT SVG ──────────────────────────────────── */
const DragonMascot = ({ size = 160, breathing = false }) => (
  <svg
    viewBox="0 0 220 195"
    width={size}
    height={size * 195 / 220}
    aria-hidden="true"
    style={{
      filter: breathing ? 'drop-shadow(0 0 18px #00E5FF) drop-shadow(0 0 40px #A855F7)' : 'drop-shadow(0 0 8px rgba(168,85,247,.4))',
      transition: 'filter .4s ease',
    }}
  >
    {/* Tail curling right */}
    <path d="M152,108 C174,94 192,106 188,124 C184,142 164,138 156,122 C152,114 156,104 152,108 Z" fill="#6D28D9"/>
    <path d="M178,116 C182,110 180,102 174,104 C170,106 172,116 178,116 Z" fill="#7C3AED"/>

    {/* Back wing */}
    <path d="M110,62 L88,12 L60,58 Z" fill="#5B21B6" opacity=".82"/>
    <path d="M110,62 L88,12" stroke="#7C3AED" strokeWidth="2" fill="none" opacity=".5"/>
    <path d="M88,12 L60,58" stroke="#6D28D9" strokeWidth="1.5" fill="none" opacity=".4"/>

    {/* Body */}
    <ellipse cx="96" cy="120" rx="72" ry="56" fill="#7C3AED"/>

    {/* Belly */}
    <ellipse cx="90" cy="130" rx="52" ry="38" fill="#A78BFA"/>

    {/* Scale pattern */}
    <path d="M72,96 Q80,88 88,96 Q80,104 72,96 Z" fill="rgba(109,40,217,.6)"/>
    <path d="M92,90 Q100,82 108,90 Q100,98 92,90 Z" fill="rgba(109,40,217,.5)"/>
    <path d="M112,96 Q120,88 128,96 Q120,104 112,96 Z" fill="rgba(91,33,182,.5)"/>
    <path d="M82,112 Q90,104 98,112 Q90,120 82,112 Z" fill="rgba(109,40,217,.4)"/>
    <path d="M102,108 Q110,100 118,108 Q110,116 102,108 Z" fill="rgba(91,33,182,.4)"/>

    {/* Front wing */}
    <path d="M68,78 L38,22 L18,74 Z" fill="#7C3AED" opacity=".88"/>
    <path d="M68,78 L38,22" stroke="#A78BFA" strokeWidth="2" fill="none" opacity=".5"/>
    <path d="M38,22 L18,74" stroke="#8B5CF6" strokeWidth="1.5" fill="none" opacity=".4"/>

    {/* Neck */}
    <path d="M58,82 C46,64 42,46 54,32" stroke="#7C3AED" strokeWidth="26" fill="none" strokeLinecap="round"/>
    <path d="M58,82 C46,64 42,46 54,32" stroke="#8B5CF6" strokeWidth="18" fill="none" strokeLinecap="round" opacity=".5"/>

    {/* Head */}
    <ellipse cx="56" cy="28" rx="32" ry="27" fill="#7C3AED"/>

    {/* Snout / upper jaw */}
    <path d="M28,30 C14,27 8,38 18,45 C26,51 40,46 46,36 Z" fill="#8B5CF6"/>

    {/* Mouth open - lower jaw */}
    <path d="M20,44 C18,52 22,60 34,58 L55,50" fill="#12082A"/>

    {/* Teeth */}
    <path d="M22,44 L19,52 L26,46 Z" fill="#EEEEFF" opacity=".9"/>
    <path d="M30,46 L28,54 L35,48 Z" fill="#EEEEFF" opacity=".85"/>
    <path d="M24,42 L20,36 L28,40 Z" fill="#EEEEFF" opacity=".9"/>
    <path d="M34,40 L31,33 L38,38 Z" fill="#EEEEFF" opacity=".85"/>

    {/* Tongue */}
    <path d="M24,52 C20,56 22,63 30,60" fill="#00E5FF" opacity=".85"/>

    {/* Fire breath from mouth */}
    <path d="M14,48 C2,45 -8,36 -4,22 C0,8 14,6 20,16 C24,22 20,36 16,42 C13,46 12,50 14,48 Z"
          fill="#00E5FF" opacity=".75"/>
    <path d="M10,46 C0,42 -6,33 -2,21 C2,13 12,12 16,20"
          fill="none" stroke="#FFD600" strokeWidth="2.5" strokeLinecap="round" opacity=".8"/>
    <path d="M8,44 C2,40 0,32 4,24"
          fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity=".6"/>
    {/* Fire glow */}
    <circle cx="5" cy="32" r="18" fill="#00E5FF" opacity=".08"/>
    <circle cx="5" cy="32" r="10" fill="#00E5FF" opacity=".1"/>

    {/* Nostril */}
    <ellipse cx="16" cy="38" rx="2.8" ry="2.2" fill="#12082A"/>

    {/* Eye */}
    <circle cx="53" cy="22" r="13" fill="white"/>
    <circle cx="55" cy="24" r="7.5" fill="#12082A"/>
    <circle cx="57.5" cy="21.5" r="3" fill="white"/>
    <circle cx="52" cy="27" r="1.4" fill="white" opacity=".6"/>
    {/* Slit pupil */}
    <ellipse cx="55" cy="24" rx="2.5" ry="6" fill="#00E5FF" opacity=".7"/>

    {/* Eyebrow - furrowed, fierce */}
    <path d="M44,13 Q54,8 62,13" stroke="#12082A" strokeWidth="3" fill="none" strokeLinecap="round"/>

    {/* Horns */}
    <path d="M62,10 L72,-2 L74,14" fill="#FFD600"/>
    <path d="M74,14 L72,-2 L80,10" fill="#D97706" opacity=".6"/>
    <path d="M46,8 L53,-4 L56,10" fill="#FFD600" opacity=".8"/>
    <path d="M56,10 L53,-4 L62,8" fill="#D97706" opacity=".5"/>

    {/* Back spines */}
    <path d="M82,66 L88,50 L94,66" fill="#8B5CF6"/>
    <path d="M100,60 L106,45 L112,60" fill="#7C3AED"/>
    <path d="M118,64 L124,50 L130,64" fill="#6D28D9"/>
    <path d="M135,72 L140,59 L145,72" fill="#5B21B6"/>

    {/* Feet / legs */}
    <path d="M64,168 C58,158 48,156 44,164 L56,172 Z" fill="#6D28D9"/>
    <path d="M120,168 C114,158 104,156 100,164 L112,172 Z" fill="#6D28D9"/>
    {/* Claws */}
    <path d="M46,166 L40,176 M52,168 L48,178 M58,170 L56,180" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M102,166 L96,176 M108,168 L104,178 M114,170 L112,180" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round"/>

    {/* Ear frills */}
    <path d="M72,16 L80,8 L78,20" fill="#A855F7" opacity=".6"/>
    <path d="M40,18 L32,12 L36,24" fill="#8B5CF6" opacity=".5"/>
  </svg>
);

/* ── DOOM FIRE ENGINE ───────────────────────────────────── */
const FW = 320, FH = 180;

const buildFirePalette = () => {
  const pal = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    let r, g, b, a;
    if (i < 18) {
      // Transparent → very dark purple
      r = 7; g = 0; b = 18;
      a = Math.round((i / 18) * 180);
    } else if (i < 75) {
      // Dark purple → vivid purple
      const t = (i - 18) / 57;
      r = Math.round(7 + t * 161);   // 7→168
      g = Math.round(0 + t * 85);    // 0→85
      b = Math.round(18 + t * 229);  // 18→247
      a = 255;
    } else if (i < 155) {
      // Purple → cyan
      const t = (i - 75) / 80;
      r = Math.round(168 - t * 168); // 168→0
      g = Math.round(85 + t * 144);  // 85→229
      b = 255;
      a = 255;
    } else if (i < 220) {
      // Cyan → white-cyan
      const t = (i - 155) / 65;
      r = Math.round(t * 255);       // 0→255
      g = Math.round(229 + t * 26);  // 229→255
      b = 255;
      a = 255;
    } else {
      // White hot core
      const t = (i - 220) / 35;
      r = 255;
      g = 255;
      b = Math.round(255 - t * 30);  // slight warm tint
      a = 255;
    }
    pal[i * 4]     = r;
    pal[i * 4 + 1] = g;
    pal[i * 4 + 2] = b;
    pal[i * 4 + 3] = a;
  }
  return pal;
};

const DragonFire = ({ onComplete }) => {
  const canvasRef     = useRef(null);
  const rafRef        = useRef(null);
  const buf           = useRef(new Uint8Array(FW * FH));
  const pal           = useRef(buildFirePalette());
  const phase         = useRef(0);
  const startTs       = useRef(null);
  const triggered     = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    const b   = buf.current;
    const p   = pal.current;

    // Phase 0: seed a narrow column at center-bottom (the "breath" origin)
    const cx = Math.floor(FW / 2);
    for (let x = cx - 12; x <= cx + 12; x++) {
      for (let y = FH - 6; y < FH; y++) {
        b[y * FW + x] = 210 + Math.floor(Math.random() * 45);
      }
    }

    const updateFire = () => {
      // Run 2 passes per frame so it rises faster
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < FH - 1; y++) {
          for (let x = 0; x < FW; x++) {
            const rand = (Math.random() * 2) | 0;  // lower cooling: avg 0.5/step
            const src  = b[(y + 1) * FW + x];
            const nx   = (x - (rand & 1) + FW) % FW;
            b[y * FW + nx] = src > rand ? src - rand : 0;
          }
        }
      }
    };

    const renderFire = () => {
      const img  = ctx.createImageData(FW, FH);
      const data = img.data;
      for (let i = 0; i < FW * FH; i++) {
        const v = b[i];
        data[i * 4]     = p[v * 4];
        data[i * 4 + 1] = p[v * 4 + 1];
        data[i * 4 + 2] = p[v * 4 + 2];
        data[i * 4 + 3] = p[v * 4 + 3];
      }
      ctx.putImageData(img, 0, 0);
    };

    const frame = (ts) => {
      if (!startTs.current) startTs.current = ts;
      const elapsed = ts - startTs.current;

      // Phase 1 (0.4s): widen the breath column
      if (elapsed > 400 && phase.current < 1) {
        phase.current = 1;
        for (let x = 0; x < FW; x++) {
          for (let y = FH - 8; y < FH; y++) {
            if (Math.random() > 0.4) b[y * FW + x] = 190 + Math.floor(Math.random() * 65);
          }
        }
      }

      // Phase 2 (1.0s): flood the bottom — full inferno
      if (elapsed > 1000 && phase.current < 2) {
        phase.current = 2;
        for (let x = 0; x < FW; x++) {
          for (let y = FH - 14; y < FH; y++) {
            b[y * FW + x] = 230 + Math.floor(Math.random() * 25);
          }
        }
      }

      // Keep bottom fully seeded once flooding
      if (phase.current >= 1) {
        for (let x = 0; x < FW; x++) {
          b[(FH - 1) * FW + x] = 240 + Math.floor(Math.random() * 15);
        }
      }

      updateFire();
      renderFire();

      // Check how much of the TOP ROW is hot
      let hot = 0;
      for (let x = 0; x < FW; x++) {
        if (b[x] > 40) hot++;
      }

      if (hot > FW * 0.3 && !triggered.current && elapsed > 1400) {
        triggered.current = true;
        setTimeout(() => onCompleteRef.current(), 500);
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // stable — never restarts

  return (
    <canvas
      ref={canvasRef}
      width={FW}
      height={FH}
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0,
        width: '100vw', height: '100vh',
        imageRendering: 'pixelated',
        zIndex: 8600, pointerEvents: 'none',
      }}
    />
  );
};

/* ── SPLASH PAGE ────────────────────────────────────────── */
const SplashPage = ({ onDone }) => {
  const [fireOn,   setFireOn]   = useState(false);
  const [shake,    setShake]    = useState(false);
  const [exiting,  setExiting]  = useState(false);
  const [breathe,  setBreathe]  = useState(false);
  const [clicked,  setClicked]  = useState(false);

  // Pulsing glow on dragon
  useEffect(() => {
    const iv = setInterval(() => setBreathe(v => !v), 1800);
    return () => clearInterval(iv);
  }, []);

  // Rotating dots — use CSS animation, not React state interval
  const orbitDots = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * 45) * (Math.PI / 180);
    const r = 52;
    return { x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle), size: i % 2 === 0 ? 4 : 2.5 };
  });

  // Auto-trigger after 5s
  useEffect(() => {
    const t = setTimeout(trigger, 5000);
    return () => clearTimeout(t);
  }, []);

  const trigger = () => {
    if (fireOn || clicked) return;
    setClicked(true);
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setFireOn(true);
    }, 350);
  };

  const onFireComplete = useCallback(() => {
    setExiting(true);
    setTimeout(onDone, 300);
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 8000,
        background: '#07070F',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        opacity: exiting ? 0 : 1,
        transition: 'opacity .35s ease',
        userSelect: 'none',
        overflow: 'hidden',
      }}
      onClick={trigger}
      role="button"
      tabIndex={0}
      aria-label="Click to enter site"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') trigger(); }}
    >
      {/* Background grid */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(168,85,247,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,.04) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        pointerEvents: 'none',
      }} />

      {/* Background glow blobs */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '20%', left: '15%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,.12) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '15%', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,229,255,.1) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,214,0,.04) 0%, transparent 60%)', filter: 'blur(60px)' }} />
      </div>

      {/* Corner decorations */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 28, left: 36, fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: 'rgba(0,229,255,.35)', letterSpacing: '-.02em' }}>ODD<span style={{ color: 'rgba(168,85,247,.5)' }}>HAUS</span></div>
      <div aria-hidden="true" style={{ position: 'absolute', top: 30, right: 36, fontFamily: 'DM Sans,sans-serif', fontSize: 10, letterSpacing: '.16em', color: 'rgba(200,195,255,.2)', textTransform: 'uppercase' }}>personal portfolio</div>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 28, left: 36, fontFamily: 'DM Sans,sans-serif', fontSize: 10, letterSpacing: '.14em', color: 'rgba(200,195,255,.18)', textTransform: 'uppercase' }}>est. 2025</div>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 30, right: 36, display: 'flex', gap: 7, alignItems: 'center' }}>
        {['#00E5FF','#A855F7','#FFD600'].map((c, i) => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: c, opacity: .55, boxShadow: `0 0 8px ${c}` }} />
        ))}
      </div>

      {/* Main content */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 0, position: 'relative', zIndex: 2,
        transform: shake ? 'scale(1.04) rotate(-1deg)' : 'scale(1)',
        transition: 'transform .4s cubic-bezier(.34,1.56,.64,1)',
      }}>

        {/* Orbiting dots ring — rotated via CSS, no React state */}
        <div style={{ position: 'relative', width: 100, height: 100, marginBottom: -20 }} aria-hidden="true">
          <svg viewBox="0 0 100 100" width="100" height="100"
            style={{ position: 'absolute', inset: 0, animation: 'spin-slow 8s linear infinite' }}>
            <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(168,85,247,.1)" strokeWidth="1" strokeDasharray="3,5"/>
            {orbitDots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={d.size}
                fill={i % 3 === 0 ? '#00E5FF' : i % 3 === 1 ? '#A855F7' : '#FFD600'}
                opacity={.65 + (i % 2) * .2}
              />
            ))}
          </svg>
        </div>

        {/* Dragon */}
        <DragonMascot size={180} breathing={breathe} />

        {/* Headline */}
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: 'clamp(58px,10vw,130px)',
            fontWeight: 800,
            color: '#EEEEFF',
            letterSpacing: '-.045em',
            lineHeight: .92,
            textShadow: '0 0 60px rgba(168,85,247,.25)',
          }}>
            ODD<span style={{ color: '#00E5FF', textShadow: '0 0 40px rgba(0,229,255,.6)' }}>HAUS</span>
          </h1>
          <div style={{
            marginTop: 14,
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 11,
            letterSpacing: '.22em',
            color: 'rgba(200,195,255,.42)',
            textTransform: 'uppercase',
          }}>
            creative digital agency
          </div>
        </div>

        {/* Click to enter */}
        <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{
            fontFamily: 'Syne, sans-serif',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: fireOn ? 'rgba(0,229,255,.8)' : 'rgba(200,195,255,.5)',
            transition: 'color .3s',
          }}>
            {fireOn ? 'igniting…' : 'click anywhere to enter'}
          </div>

          {/* Animated pulse ring */}
          {!fireOn && (
            <div style={{ position: 'relative', width: 44, height: 44 }} aria-hidden="true">
              <div style={{
                position: 'absolute', inset: 0, border: '1.5px solid rgba(0,229,255,.5)',
                borderRadius: '50%',
                animation: 'pulse-ring 1.8s ease-out infinite',
              }} />
              <div style={{
                position: 'absolute', inset: 6, border: '1.5px solid rgba(168,85,247,.4)',
                borderRadius: '50%',
                animation: 'pulse-ring 1.8s ease-out .5s infinite',
              }} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                width: 8, height: 8, borderRadius: '50%',
                background: '#00E5FF',
                boxShadow: '0 0 10px #00E5FF, 0 0 20px rgba(0,229,255,.4)',
              }} />
            </div>
          )}
        </div>
      </div>

      {/* Fire canvas */}
      {fireOn && <DragonFire onComplete={onFireComplete} />}

      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(.7); opacity: .8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

Object.assign(window, { SplashPage });
