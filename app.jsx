// app.jsx — Main App, wires everything together

const App = () => {
  const [splashDone,    setSplashDone]    = useState(false);
  const [preloaderDone, setPreloaderDone] = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [scrolled,      setScrolled]      = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 72);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      {/* Zero page — shown first */}
      {!splashDone && <SplashPage onDone={() => setSplashDone(true)} />}

      {/* Preloader — shown after splash */}
      {splashDone && !preloaderDone && (
        <Preloader onDone={() => setPreloaderDone(true)} />
      )}

      <CustomCursor />
      <ScrollProgress />
      <Header scrolled={scrolled} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      <main id="main" tabIndex={-1}>
        <HeroSection />
        <NavCardsSection />
        <ExpertiseSection />
        <AboutSection />
        <ProjectsSection />
        <MarqueeSection />
        <CareersSection />
        <ContactSection />
      </main>

      <FooterSection />
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
