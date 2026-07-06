import { useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Splash from './components/Splash';
import Preloader from './components/Preloader';
import DomainExpansion from './canvas/DomainExpansion';
import Cursor from './components/Cursor';
import Starfield from './components/Starfield';
import Header from './components/Header';
import Hero from './sections/Hero';
import About from './sections/About';
import Experience from './sections/Experience';
import Work from './sections/Work';
import Skills from './sections/Skills';
import Contact from './sections/Contact';
import Footer from './sections/Footer';

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

  // GSAP scroll-triggered reveals on the big section titles
  useEffect(() => {
    if (stage !== 'main') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const tweens = gsap.utils.toArray('.sec__ttl, .ftr__big').map((el) =>
      gsap.fromTo(
        el,
        { clipPath: 'inset(0 0 100% 0)', y: 40 },
        {
          clipPath: 'inset(0 0 -10% 0)',
          y: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 86%' },
        }
      )
    );
    return () => tweens.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
  }, [stage]);

  return (
    <>
      {stage === 'splash' && <Splash onDone={() => setStage('preloader')} />}
      {stage === 'preloader' && <Preloader onDone={() => setStage('domain')} />}
      {stage === 'domain' && <DomainExpansion onDone={() => setStage('main')} />}

      <Starfield />
      <Cursor />
      <Header scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      <main id="main" tabIndex={-1}>
        <Hero />
        <About />
        <Experience />
        <Work />
        <Skills />
        <Contact />
      </main>

      <Footer />
    </>
  );
};

export default App;
