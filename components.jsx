// components.jsx — Shared hooks, Cursor, ScrollProgress, Preloader, Header, MobileMenu

const { useState, useEffect, useRef, useCallback } = React;

/* ── HOOKS ─────────────────────────────────────────────── */
const useScrollReveal = (threshold = 0.14) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.unobserve(el); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
};

const useCounter = (target, active, dur = 1800) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let t0 = null;
    const tick = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setN(Math.round(ease * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active, target, dur]);
  return n;
};

/* ── CUSTOM CURSOR ──────────────────────────────────────── */
const CustomCursor = () => {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const cur = useRef({ x: 0, y: 0 });
  const lag = useRef({ x: 0, y: 0 });
  const raf = useRef(null);
  const [cls, setCls] = useState('');
  const [txt, setTxt] = useState('');

  useEffect(() => {
    if (window.matchMedia('(max-width:768px)').matches) return;
    const onMove = (e) => { cur.current = { x: e.clientX, y: e.clientY }; };

    const onEnter = (e) => {
      const el = e.target.closest('[data-cursor]');
      if (el) {
        const c = el.dataset.cursor;
        if (c === 'view') { setCls('is-view'); setTxt('VIEW'); }
        else if (c === 'red') { setCls('is-red'); setTxt(''); }
        else { setCls('is-link'); setTxt(''); }
        return;
      }
      if (e.target.closest('a,button,[role="button"]')) { setCls('is-link'); setTxt(''); }
    };
    const onLeave = () => { setCls(''); setTxt(''); };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onEnter);
    document.addEventListener('mouseout', onLeave);

    const loop = () => {
      const dot = dotRef.current; const ring = ringRef.current;
      if (dot && ring) {
        dot.style.left = cur.current.x + 'px';
        dot.style.top = cur.current.y + 'px';
        lag.current.x += (cur.current.x - lag.current.x) * 0.11;
        lag.current.y += (cur.current.y - lag.current.y) * 0.11;
        ring.style.left = lag.current.x + 'px';
        ring.style.top = lag.current.y + 'px';
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onEnter);
      document.removeEventListener('mouseout', onLeave);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <>
      <div ref={dotRef} className="c-dot" aria-hidden="true" />
      <div ref={ringRef} className={`c-ring ${cls}`} aria-hidden="true">{txt}</div>
    </>
  );
};

/* ── SCROLL PROGRESS ────────────────────────────────────── */
const ScrollProgress = () => {
  const [w, setW] = useState(0);
  useEffect(() => {
    const fn = () => {
      const d = document.documentElement;
      const s = d.scrollTop || document.body.scrollTop;
      const t = d.scrollHeight - d.clientHeight;
      setW(t > 0 ? (s / t) * 100 : 0);
    };
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);
  return <div className="scroll-prog" style={{ width: `${w}%` }} aria-hidden="true" />;
};

/* ── PRELOADER ──────────────────────────────────────────── */
const MSGS = [
  'warming up the pixels',
  'feeding the ideas',
  'loading the weird stuff',
  'sharpening the strategy',
  'making the internet less boring',
  'counting the fish',
];

const Preloader = ({ onDone }) => {
  const [prog, setProg] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [logoOn, setLogoOn] = useState(false);
  const [mascotX, setMascotX] = useState('-120px');
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLogoOn(true), 300);
    const t2 = setTimeout(() => setMascotX('160vw'), 600);

    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 16 + 6;
      if (p >= 100) {
        p = 100;
        clearInterval(iv);
        setTimeout(() => {
          setExiting(true);
          setTimeout(onDone, 750);
        }, 380);
      }
      setProg(Math.min(p, 100));
    }, 110);

    const tv = setInterval(() => setMsgIdx(i => (i + 1) % MSGS.length), 490);

    return () => { clearTimeout(t1); clearTimeout(t2); clearInterval(iv); clearInterval(tv); };
  }, [onDone]);

  return (
    <div
      className="pre"
      style={{
        transform: exiting ? 'translateY(-100%)' : 'translateY(0)',
        transition: exiting ? 'transform .75s cubic-bezier(.76,0,.24,1)' : 'none',
      }}
      aria-label="Loading ODDHAUS"
      role="status"
    >
      {/* Travelling mascot */}
      <div
        className="pre__mascot"
        aria-hidden="true"
        style={{ transform: `translateX(${mascotX})`, transition: mascotX === '160vw' ? 'transform 2s cubic-bezier(.34,1.08,.64,1)' : 'none' }}
      >
        <BlobMascot size={76} mood="happy" color="#C74141" />
      </div>

      <div className="pre__inner">
        <div className={`pre__logo ${logoOn ? 'show' : ''}`} aria-label="ODDHAUS">
          ODD<span>HAUS</span>
        </div>
        <div className="pre__msg" aria-live="polite">{MSGS[msgIdx]}</div>
        <div className="pre__bar" role="progressbar" aria-valuenow={Math.round(prog)} aria-valuemin={0} aria-valuemax={100}>
          <div className="pre__fill" style={{ width: `${prog}%` }} />
        </div>
      </div>
    </div>
  );
};

/* ── MOBILE MENU ────────────────────────────────────────── */
const MobileMenu = ({ open, onClose }) => {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) {
      document.addEventListener('keydown', esc);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [open, onClose]);

  const items = [
    { label: 'Projects',  sub: 'Stuff we are weirdly proud of.', href: '#projects' },
    { label: 'Agency',    sub: 'Who made this beautiful mess?',  href: '#about'    },
    { label: 'Expertise', sub: 'What we do dangerously well.',   href: '#expertise'},
    { label: 'Careers',   sub: 'Join the chaos.',                href: '#careers'  },
    { label: 'Contact',   sub: 'Tell us the thing.',             href: '#contact'  },
  ];

  return (
    <nav className={`mob-menu ${open ? 'open' : ''}`} aria-label="Mobile navigation" aria-hidden={!open}>
      <div className="mob-menu__bg" />
      <div className="mob-menu__inner">
        <div className="mob-menu__items">
          {items.map((it) => (
            <div key={it.label} className="mob-menu__item">
              <a href={it.href} className="mob-menu__link" onClick={onClose} tabIndex={open ? 0 : -1}>
                {it.label}
                <small>{it.sub}</small>
              </a>
            </div>
          ))}
        </div>
        <div className="mob-menu__foot">hello@oddhaus.studio</div>
      </div>
    </nav>
  );
};

/* ── HEADER ─────────────────────────────────────────────── */
const Header = ({ scrolled, menuOpen, setMenuOpen }) => (
  <>
    <header className={`hdr ${scrolled ? 'scrolled' : ''} ${menuOpen ? 'menu-bg' : ''}`} role="banner">
      <a href="#hero" className="hdr__logo" aria-label="ODDHAUS — Go to top">
        ODD<span>HAUS</span>
      </a>
      <nav className="hdr__nav" aria-label="Main navigation">
        <a href="#projects">Projects</a>
        <a href="#about">Agency</a>
        <a href="#expertise">Expertise</a>
        <a href="#careers">Careers</a>
      </nav>
      <a href="#contact" className="hdr__cta">Let's chat?</a>
      <button
        className={`hdr__burger ${menuOpen ? 'open' : ''}`}
        aria-expanded={menuOpen}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        onClick={() => setMenuOpen(v => !v)}
      >
        <span /><span /><span />
      </button>
    </header>
    <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
  </>
);

Object.assign(window, {
  useState, useEffect, useRef, useCallback,
  useScrollReveal, useCounter, CustomCursor, ScrollProgress, Preloader, Header,
});
