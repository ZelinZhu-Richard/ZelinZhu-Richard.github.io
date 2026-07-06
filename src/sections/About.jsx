import { useCounter, useScrollReveal } from '../hooks';
import { ABOUT, SKILLS } from '../data/content';

const StatTile = ({ n, sfx, big, label, active }) => {
  const count = useCounter(n ?? 0, active && n != null);
  return (
    <div className="astat">
      <div className="astat__n">
        {n != null ? <>{count}<span className="astat__sfx">{sfx}</span></> : <span className="astat__big">{big}</span>}
      </div>
      <div className="astat__l">{label}</div>
    </div>
  );
};

const About = () => {
  const [tRef, tVis] = useScrollReveal(0.12);
  const [sRef, sVis] = useScrollReveal(0.18);

  const fade = (delay, vis) => ({
    style: { opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(24px)', transition: `all .65s ease ${delay}s` },
  });

  return (
    <section id="about" className="about">
      <div className="about__in">
        <div ref={tRef}>
          <div {...fade(0.05, tVis)} className="sec__lbl">About me</div>
          <h2 {...fade(0.15, tVis)} className="about__ttl">About me</h2>
          {ABOUT.paragraphs.map((p, i) => (
            <p key={i} {...fade(0.22 + i * 0.08, tVis)} className="about__copy">{p}</p>
          ))}
          <p {...fade(0.6, tVis)} className="about__fun">{ABOUT.funFact}</p>
          <div {...fade(0.68, tVis)} className="about__langs">
            {SKILLS.languages.map((l) => <span key={l} className="pill pill--ghost">{l}</span>)}
          </div>
        </div>

        <div ref={sRef} className="about__side">
          <div
            className="about__photo-wrap"
            style={{ opacity: sVis ? 1 : 0, transform: sVis ? 'none' : 'translateY(30px) rotate(-2deg)', transition: 'all .7s cubic-bezier(.16,1,.3,1)' }}
          >
            <img src="/richard.jpg" alt="Richard Zhu smiling at the camera" className="about__photo" loading="lazy" />
            <div className="about__photo-orbit" aria-hidden="true" />
          </div>
          <div className="about__stats">
            {ABOUT.stats.map((s, i) => (
              <div
                key={s.label}
                style={{ opacity: sVis ? 1 : 0, transform: sVis ? 'none' : 'translateY(30px)', transition: `all .5s ease ${i * 0.12 + 0.2}s` }}
              >
                <StatTile {...s} active={sVis} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
