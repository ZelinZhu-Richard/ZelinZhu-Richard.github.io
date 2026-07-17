import { useEffect, useState } from 'react';
import Splash from './components/Splash';
import Preloader from './components/Preloader';
import DomainExpansion from './canvas/DomainExpansion';
import Cursor from './components/Cursor';
import Starfield from './components/Starfield';
import Header from './components/Header';
import LoongDragon from './components/LoongDragon';
import Marquee from './components/Marquee';
import StringDivider from './components/StringDivider';
import Hero from './sections/Hero';
import About from './sections/About';
import Experience from './sections/Experience';
import Work from './sections/Work';
import Skills from './sections/Skills';
import Contact from './sections/Contact';
import Footer from './sections/Footer';
import { initScroll } from './scroll';
import { initEffects } from './effects';
import { MARQUEES } from './data/content';

// splash → preloader → domain expansion → main
const App = () => {
  const [stage, setStage] = useState('splash');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 72);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // smooth scroll engine + scroll choreography once the main page is live
  useEffect(() => {
    if (stage !== 'main') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cleanupScroll = initScroll();
    const cleanupEffects = initEffects();
    return () => { cleanupEffects(); cleanupScroll(); };
  }, [stage]);

  return (
    <>
      {stage === 'splash' && <Splash onDone={() => setStage('preloader')} />}
      {stage === 'preloader' && <Preloader onDone={() => setStage('domain')} />}
      {stage === 'domain' && <DomainExpansion onDone={() => setStage('main')} />}

      <Starfield />
      <Cursor />
      {stage === 'main' && <LoongDragon />}
      <Header scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      <main id="main" tabIndex={-1}>
        <Hero />
        <Marquee items={MARQUEES.ship} baseSpeed={0.7} />
        <About />
        <StringDivider />
        <Experience />
        <Work />
        <StringDivider />
        <Skills />
        <StringDivider />
        <Marquee items={MARQUEES.build} baseSpeed={0.55} reverse />
        <Contact />
      </main>

      <Footer />
    </>
  );
};

export default App;
