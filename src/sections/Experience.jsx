import { useScrollReveal } from '../hooks';
import { EXPERIENCE } from '../data/content';

const TimelineItem = ({ item, idx }) => {
  const [ref, vis] = useScrollReveal(0.15);
  return (
    <li
      ref={ref}
      className={`tl__item ${item.now ? 'tl__item--now' : ''}`}
      style={{ opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateX(-26px)', transition: `all .6s cubic-bezier(.16,1,.3,1) ${idx * 0.06}s` }}
    >
      <div className="tl__dot" aria-hidden="true" />
      <div className="tl__when">{item.when}{item.now && <span className="tl__now-pill">NOW</span>}</div>
      <h3 className="tl__title">{item.title} <span className="tl__org">· {item.org}</span></h3>
      <p className="tl__desc">{item.desc}</p>
      <div className="tl__tags">
        {item.tags.map((t) => <span key={t} className="pill pill--ghost">{t}</span>)}
      </div>
    </li>
  );
};

const Experience = () => {
  const [hdRef, hdVis] = useScrollReveal(0.1);
  return (
    <section id="experience" className="exp">
      <div
        ref={hdRef}
        className="exp__hd"
        style={{ opacity: hdVis ? 1 : 0, transform: hdVis ? 'none' : 'translateY(28px)', transition: 'all .6s ease' }}
      >
        <div className="sec__lbl">Trajectory</div>
        <h2 className="sec__ttl">Where I've been,<br />where I am.</h2>
      </div>
      <ol className="tl">
        {EXPERIENCE.map((item, i) => <TimelineItem key={item.org} item={item} idx={i} />)}
      </ol>
    </section>
  );
};

export default Experience;
