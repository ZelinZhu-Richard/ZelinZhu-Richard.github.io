import { useScrollReveal } from '../hooks';
import { SKILLS } from '../data/content';

const Bucket = ({ label, items, idx, vis }) => (
  <div
    className="skills__bucket"
    style={{ opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(24px)', transition: `all .55s ease ${idx * 0.08 + 0.1}s` }}
  >
    <div className="skills__bucket-hd">{label}</div>
    <div className="skills__pills">
      {items.map((it, i) => (
        <span key={it} className="pill pill--skill" style={{ animationDelay: `${(idx * items.length + i) * 0.35}s` }}>
          {it}
        </span>
      ))}
    </div>
  </div>
);

const Skills = () => {
  const [hdRef, hdVis] = useScrollReveal(0.1);
  const [gRef, gVis] = useScrollReveal(0.08);

  return (
    <section id="skills" className="skills">
      <div
        ref={hdRef}
        className="skills__hd"
        style={{ opacity: hdVis ? 1 : 0, transform: hdVis ? 'none' : 'translateY(28px)', transition: 'all .6s ease' }}
      >
        <div className="sec__lbl">Toolbox</div>
        <h2 className="sec__ttl">Skills & tools.</h2>
      </div>

      <div ref={gRef} className="skills__grid" data-skew>
        {SKILLS.buckets.map((b, i) => <Bucket key={b.label} {...b} idx={i} vis={gVis} />)}

        <div
          className="skills__bucket skills__bucket--soft"
          style={{ opacity: gVis ? 1 : 0, transform: gVis ? 'none' : 'translateY(24px)', transition: `all .55s ease ${SKILLS.buckets.length * 0.08 + 0.1}s` }}
        >
          <div className="skills__bucket-hd">Strengths</div>
          <div className="skills__pills">
            {SKILLS.soft.map((s) => <span key={s} className="pill pill--ghost">{s}</span>)}
          </div>
        </div>
      </div>

      <div
        className="skills__learning"
        style={{ opacity: gVis ? 1 : 0, transition: 'opacity .7s ease .5s' }}
      >
        <span className="skills__learning-lbl">Currently learning →</span>
        {SKILLS.learning.map((l) => <span key={l} className="pill pill--learn">{l}</span>)}
      </div>
    </section>
  );
};

export default Skills;
