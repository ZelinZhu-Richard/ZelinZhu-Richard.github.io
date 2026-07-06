import { useEffect, useState } from 'react';
import MagicCanvas from '../canvas/MagicCanvas';
import ScrambleText from '../components/ScrambleText';
import { isMobileDevice, useReducedMotion } from '../hooks';
import { HERO, LINKS } from '../data/content';

// "Wake up. Ship. Learn. Repeat." lights up word by word, each cycle faster,
// then scramble-resolves into "Compounding daily. Iterating hourly."
const Tagline = () => {
  const [lit, setLit] = useState(-1);
  const [finalMode, setFinalMode] = useState(false);
  const reduced = useReducedMotion();
  const words = HERO.taglineA;

  useEffect(() => {
    if (reduced) { setFinalMode(true); return; }
    const speeds = [420, 300, 190, 110, 60];
    const timers = [];
    let t = 400;
    speeds.forEach((sp) => {
      words.forEach((_, wi) => {
        timers.push(setTimeout(() => setLit(wi), t));
        t += sp;
      });
      t += sp * 0.6; // beat between cycles
    });
    timers.push(setTimeout(() => setFinalMode(true), t + 150));
    return () => timers.forEach(clearTimeout);
  }, [reduced, words]);

  if (finalMode) {
    return (
      <div className="hero__tagline hero__tagline--final">
        <ScrambleText text={HERO.taglineB} speed={34} />
      </div>
    );
  }
  return (
    <div className="hero__tagline" aria-label={words.join(' ')}>
      {words.map((w, i) => (
        <span key={w} className={`hero__tw ${lit === i ? 'lit' : ''}`}>{w}</span>
      ))}
    </div>
  );
};

const Hero = () => {
  const [staticName, setStaticName] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    setStaticName(reduced || isMobileDevice());
  }, [reduced]);

  return (
    <section id="hero" className="hero" aria-label="Intro">
      {!staticName && <MagicCanvas text={HERO.name} />}

      <div className="hero__content">
        <div className="hero__pill">
          <span className="hero__pill-dot" aria-hidden="true" />
          {HERO.pill}
        </div>

        {/* Real h1 for SEO/screen readers; visually replaced by particles on desktop */}
        <h1 className={staticName ? 'hero__name-static' : 'sr-only'}>{HERO.name}</h1>

        <Tagline />
        <p className="hero__sub">{HERO.sub}</p>

        <div className="hero__btns">
          <a href="#work" className="btn-p">
            View my work
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href="#contact" className="btn-o">Get in touch</a>
          <a href={LINKS.resume} className="btn-o" target="_blank" rel="noopener noreferrer">Resume ↗</a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
