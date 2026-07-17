import { useScrollReveal } from '../hooks';
import { FOOTER, LINKS, NAV } from '../data/content';

const Footer = () => {
  const [ref, vis] = useScrollReveal(0.08);

  const fade = (d) => ({
    style: { opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(28px)', transition: `all .7s ease ${d}s` },
  });

  return (
    <footer className="ftr" role="contentinfo">
      <div ref={ref}>
        <p {...fade(0)} className="ftr__big">
          The past is the past and the <span>future</span> is waiting to be built.
        </p>

        <div {...fade(0.15)} className="ftr__grid">
          <div>
            <div className="ftr__brand">R<span>Z</span> Zelin Zhu</div>
            <p className="ftr__tag">Startup, algorithms, machine learning, and computational finance — built in public.</p>
          </div>
          <div>
            <div className="ftr__col-hd">Navigate</div>
            <ul className="ftr__links">
              {NAV.map((n) => <li key={n.label}><a href={n.href}>{n.label}</a></li>)}
              <li><a href={LINKS.resume} target="_blank" rel="noopener noreferrer">Resume</a></li>
            </ul>
          </div>
          <div>
            <div className="ftr__col-hd">Elsewhere</div>
            <ul className="ftr__links">
              <li><a href={LINKS.github} target="_blank" rel="noopener noreferrer">GitHub</a></li>
              <li><a href={LINKS.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a></li>
              <li><a href={LINKS.x} target="_blank" rel="noopener noreferrer">X</a></li>
              <li><a href={`mailto:${LINKS.email}`}>Email</a></li>
            </ul>
          </div>
        </div>

        <div {...fade(0.3)} className="ftr__bot">
          <span className="ftr__sm">{FOOTER.copyright} <em>{FOOTER.easterEgg}</em></span>
          <div className="ftr__btns">
            <button className="btt" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">
              ↑ Back to top
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
