import { useEffect } from 'react';
import { NAV, LINKS } from '../data/content';

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

  const subs = {
    About: 'Who is behind this?',
    Work: 'Things I shipped.',
    Contact: 'Say hi. I answer.',
  };

  return (
    <nav className={`mob-menu ${open ? 'open' : ''}`} aria-label="Mobile navigation" aria-hidden={!open}>
      <div className="mob-menu__bg" />
      <div className="mob-menu__inner">
        <div className="mob-menu__items">
          {NAV.map((it) => (
            <div key={it.label} className="mob-menu__item">
              <a href={it.href} className="mob-menu__link" onClick={onClose} tabIndex={open ? 0 : -1}>
                {it.label}
                <small>{subs[it.label]}</small>
              </a>
            </div>
          ))}
        </div>
        <div className="mob-menu__foot">
          <a href={`mailto:${LINKS.email}`} tabIndex={open ? 0 : -1}>Email</a>
          <a href={LINKS.github} target="_blank" rel="noopener noreferrer" tabIndex={open ? 0 : -1}>GitHub</a>
          <a href={LINKS.linkedin} target="_blank" rel="noopener noreferrer" tabIndex={open ? 0 : -1}>LinkedIn</a>
          <a href={LINKS.x} target="_blank" rel="noopener noreferrer" tabIndex={open ? 0 : -1}>X</a>
        </div>
      </div>
    </nav>
  );
};

const Header = ({ scrolled, menuOpen, setMenuOpen }) => (
  <>
    <header className={`hdr ${scrolled ? 'scrolled' : ''} ${menuOpen ? 'menu-bg' : ''}`} role="banner">
      <a href="#hero" className="hdr__logo" aria-label="Zelin Zhu — Go to top">
        R<span>Z</span> <em>Zelin Zhu</em>
      </a>
      <nav className="hdr__nav" aria-label="Main navigation">
        {NAV.map((it) => <a key={it.label} href={it.href}>{it.label}</a>)}
      </nav>
      <a href="#contact" className="hdr__cta">Say hi 👋</a>
      <button
        className={`hdr__burger ${menuOpen ? 'open' : ''}`}
        aria-expanded={menuOpen}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span /><span /><span />
      </button>
    </header>
    <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
  </>
);

export default Header;
