import { useRef, useState } from 'react';
import { useScrollReveal } from '../hooks';
import ScrambleText from '../components/ScrambleText';
import { PROJECTS } from '../data/content';

const CARD_BGS = ['#0E0628', '#0D1C2E', '#141031'];

const ProjectCard = ({ p, idx }) => {
  const [ref, vis] = useScrollReveal(0.12);
  const cardRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  // softened 3D tilt (about half the old template's strength)
  const onMove = (e) => {
    const r = cardRef.current.getBoundingClientRect();
    setTilt({
      x: ((e.clientX - r.left) / r.width - 0.5) * 6,
      y: ((e.clientY - r.top) / r.height - 0.5) * -6,
    });
  };
  const onLeave = () => { setTilt({ x: 0, y: 0 }); setHovered(false); };

  return (
    <div ref={ref} className="pcard-wrap">
      <article
        ref={cardRef}
        className={`pcard ${p.wide ? 'pcard--wide' : ''}`}
        onMouseMove={onMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={onLeave}
        style={{
          opacity: vis ? 1 : 0,
          transform: vis
            ? `perspective(900px) rotateY(${tilt.x}deg) rotateX(${tilt.y}deg)`
            : 'perspective(900px) translateY(44px)',
          transition: `opacity .65s cubic-bezier(.16,1,.3,1) ${idx * 0.1}s, transform .45s cubic-bezier(.16,1,.3,1)`,
        }}
        aria-label={`${p.name}: ${p.oneLiner}`}
      >
        <div className="pcard__img">
          <div className="pcard__imgbg" style={{ background: CARD_BGS[idx % CARD_BGS.length] }}>
            <span aria-hidden="true">{p.emoji}</span>
            <small>{p.context}</small>
          </div>
        </div>
        <div className="pcard__body">
          <div className="pcard__tags" aria-label="Tags">
            {p.tags.map((t) => <span key={t} className="pill">{t}</span>)}
            <span className="pill pill--year">{p.year}</span>
          </div>
          <h3 className="pcard__title">
            <ScrambleText text={p.name} run={hovered} speed={22} />
          </h3>
          <p className="pcard__one">{p.oneLiner}</p>
          <p className="pcard__desc">{p.desc}</p>
          <div className="pcard__links">
            <a href={p.live} target="_blank" rel="noopener noreferrer">Live ↗</a>
            <a href={p.repo} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
          </div>
        </div>
      </article>
    </div>
  );
};

const Work = () => {
  const [hdRef, hdVis] = useScrollReveal(0.1);
  return (
    <section id="work" className="proj">
      <div
        ref={hdRef}
        className="proj__hd"
        style={{ opacity: hdVis ? 1 : 0, transform: hdVis ? 'none' : 'translateY(28px)', transition: 'all .6s ease' }}
      >
        <div className="sec__lbl">Featured work</div>
        <h2 className="sec__ttl">Shipped, not just started.</h2>
        <p className="proj__sub">Three things I built that I'd defend in a room full of skeptics.</p>
      </div>
      <div className="proj__grid" data-skew>
        {PROJECTS.map((p, i) => <ProjectCard key={p.name} p={p} idx={i} />)}
      </div>
    </section>
  );
};

export default Work;
