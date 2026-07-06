// sections.jsx — Hero, NavCards, Expertise, About, Projects

/* ── HERO ─────────────────────────────────────────────────── */
const HeroSection = () => {
  const [wordsOn, setWordsOn] = useState(false);
  const [mascotOn, setMascotOn] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setWordsOn(true), 80);
    const t2 = setTimeout(() => setMascotOn(true), 1700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // headline split into lines, each line split into words
  const lines = [
    { words: ['We', 'build'] },
    { words: ['brands', 'that'] },
    { words: ['refuse', 'to'] },
    { words: ['blend', 'in.'] },
  ];

  let globalIdx = 0;

  return (
    <section id="hero" className="hero" data-screen-label="01 Hero">
      <p className="hero__lbl">Creative Digital Agency</p>

      <h1 className="hero__hl" aria-label="We build brands that refuse to blend in.">
        {lines.map((line, li) => (
          <span key={li} style={{ display: 'block' }}>
            {line.words.map((word) => {
              const delay = globalIdx++ * 0.1;
              const isAccent = word === 'brands' || word === 'refuse';
              return (
                <span key={word} className="hero__word">
                  <span
                    className={`hero__wi ${wordsOn ? 'show' : ''}`}
                    style={{ animationDelay: wordsOn ? `${delay}s` : '0s', animationFillMode: 'forwards' }}
                  >
                    {isAccent ? <span className="accent">{word}</span> : word}
                    {' '}
                  </span>
                </span>
              );
            })}
          </span>
        ))}
      </h1>

      <p className="hero__copy">
        We are a compact creative team building identities, websites, and digital campaigns that feel alive, work hard, and make brands impossible to ignore.
      </p>

      <div className="hero__btns">
        <a href="#projects" className="btn-p">
          See our work
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <a href="#contact" className="btn-o">Start something weird</a>
      </div>

      {/* Rotating badge */}
      <div className="hero__badge" aria-hidden="true"><RotatingBadge size={88} /></div>

      {/* Floating stickers */}
      <div className="hero__stk1" aria-hidden="true"><StickerStar size={48} /></div>
      <div className="hero__stk2" aria-hidden="true"><StickerBlob size={44} /></div>

      {/* Hero mascot */}
      <div
        className="hero__mascot"
        aria-hidden="true"
        style={{
          opacity: mascotOn ? 1 : 0,
          transform: mascotOn ? 'translateX(0)' : 'translateX(60px)',
          transition: 'opacity .8s ease, transform .9s cubic-bezier(.16,1,.3,1)',
        }}
      >
        <BlobMascot size={300} mood="happy" color="#C74141" />
      </div>

      {/* Scroll hint */}
      <div className="hero__scroll" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 2v11M3 9l6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        scroll, obviously
      </div>
      <div className="hero__deco-line" aria-hidden="true" />
    </section>
  );
};

/* ── NAV CARDS ─────────────────────────────────────────────── */
const NavCard = ({ title, subtitle, desc, href, cls, mascot, num, idx }) => {
  const cardRef = useRef(null);
  const [revRef, isVis] = useScrollReveal(0.1);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const onMove = (e) => {
    const r = cardRef.current.getBoundingClientRect();
    setTilt({
      x: ((e.clientX - r.left) / r.width - 0.5) * 14,
      y: ((e.clientY - r.top) / r.height - 0.5) * -14,
    });
  };
  const onLeave = () => setTilt({ x: 0, y: 0 });

  return (
    <div ref={revRef}>
      <a
        ref={cardRef}
        href={href}
        className={`ncard ${cls}`}
        data-cursor="view"
        aria-label={`${title} — ${subtitle}`}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{
          opacity: isVis ? 1 : 0,
          transform: isVis
            ? `perspective(900px) rotateY(${tilt.x}deg) rotateX(${tilt.y}deg)`
            : `perspective(900px) translateY(50px)`,
          transition: `opacity .55s ease ${idx * 0.08}s, transform .4s cubic-bezier(.16,1,.3,1)`,
        }}
      >
        <div className="ncard__num">{num}</div>
        <h2 className="ncard__title">{title}</h2>
        <p className="ncard__sub">{subtitle}</p>
        <p className="ncard__desc">{desc}</p>
        <div className="ncard__arrow" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 9h12M11 4l5 5-5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="ncard__msc" aria-hidden="true">{mascot}</div>
      </a>
    </div>
  );
};

const NavCardsSection = () => {
  const cards = [
    { title: 'Projects',  subtitle: 'Stuff we are weirdly proud of.',    desc: 'A collection of brands, websites, and campaigns built to stand out.',                       href: '#projects',  cls: 'ncard--red',  mascot: <FishMascot size={110}/>,   num: '01' },
    { title: 'Agency',    subtitle: 'Who made this beautiful mess?',      desc: 'A small team with sharp ideas, strange taste, and serious standards.',                      href: '#about',     cls: 'ncard--dark', mascot: <SkullMascot size={100}/>,  num: '02' },
    { title: 'Expertise', subtitle: 'What we do dangerously well.',       desc: 'Branding, web, strategy, content, and creative direction.',                                 href: '#expertise', cls: 'ncard--tan',  mascot: <PencilMascot size={100}/>, num: '03' },
    { title: 'Careers',   subtitle: 'Join the chaos.',                    desc: 'Bring taste, courage, and maybe coffee.',                                                   href: '#careers',   cls: '',            mascot: <CoffeeMascot size={100}/>, num: '04' },
  ];
  return (
    <section id="work" className="ncards" aria-label="Site navigation" data-screen-label="02 Nav Cards">
      <div className="ncards__grid">
        {cards.map((c, i) => <NavCard key={c.title} {...c} idx={i} />)}
      </div>
    </section>
  );
};

/* ── EXPERTISE ─────────────────────────────────────────────── */
const SERVICES = [
  {
    id: 'branding', name: 'Branding', slogan: 'Ideas with bite.',
    desc: 'We turn unclear ideas into sharp identities with voice, visuals, systems, and story.',
    items: ['Brand identity', 'Logo systems', 'Visual language', 'Brand voice', 'Campaign concepts', 'Print and digital assets'],
    mascot: <PencilMascot size={200} />,
  },
  {
    id: 'web', name: 'Web', slogan: 'Websites full of surprises.',
    desc: 'We build custom digital experiences that are clear, fast, expressive, and made for real users.',
    items: ['UX/UI design', 'Creative development', 'Responsive websites', 'CMS integration', 'Motion design', 'Performance optimization'],
    mascot: <BrowserMascot size={200} />,
  },
  {
    id: 'strategy', name: 'Strategy', slogan: 'Smart moves, not random noise.',
    desc: 'We connect goals, audience, positioning, and execution so the creative work has a reason to exist.',
    items: ['Positioning', 'Digital strategy', 'Launch planning', 'SEO direction', 'Analytics', 'Conversion strategy'],
    mascot: <FishMascot size={200} />,
  },
];

const ExpertiseSection = () => {
  const [active, setActive] = useState('branding');
  const [hdRef, hdVis] = useScrollReveal(0.1);
  const svc = SERVICES.find(s => s.id === active);

  return (
    <section id="expertise" className="exp" data-screen-label="03 Expertise">
      <div
        ref={hdRef}
        className="exp__hd"
        style={{ opacity: hdVis ? 1 : 0, transform: hdVis ? 'none' : 'translateY(28px)', transition: 'all .6s ease' }}
      >
        <div className="exp__lbl">What we do</div>
        <h2 className="exp__ttl">What we do best.</h2>
      </div>

      <div className="exp__layout">
        <div className="exp__tabs" role="tablist" aria-label="Service categories">
          {SERVICES.map(s => (
            <button
              key={s.id}
              role="tab"
              id={`tab-${s.id}`}
              aria-selected={active === s.id}
              aria-controls={`panel-${s.id}`}
              className={`exp__tab ${active === s.id ? 'on' : ''}`}
              onClick={() => setActive(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div>
          {SERVICES.map(s => (
            <div
              key={s.id}
              id={`panel-${s.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${s.id}`}
              className={`exp__panel ${active === s.id ? 'on' : ''}`}
            >
              <div>
                <div className="exp__pslg">{s.slogan}</div>
                <h3 className="exp__pttl">{s.name}</h3>
                <p className="exp__pdesc">{s.desc}</p>
                <ul className="exp__svc">
                  {s.items.map(it => <li key={it}>{it}</li>)}
                </ul>
              </div>
              <div className="exp__msc" aria-hidden="true">{s.mascot}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── ABOUT ─────────────────────────────────────────────────── */
const StatCard = ({ n, sfx, label, active }) => {
  const count = useCounter(n, active);
  return (
    <div className="astat">
      <div className="astat__n">{count}<span className="astat__sfx">{sfx}</span></div>
      <div className="astat__l">{label}</div>
    </div>
  );
};

const AboutSection = () => {
  const [tRef, tVis] = useScrollReveal(0.15);
  const [sRef, sVis] = useScrollReveal(0.2);

  const stats = [
    { n: 38, sfx: '+', label: 'Projects launched' },
    { n: 15, sfx: '+', label: 'Years combined exp.' },
    { n: 3,  sfx: '',  label: 'Core disciplines' },
    { n: 1,  sfx: '',  label: 'Unhealthy coffee habit' },
  ];

  const fadeProps = (delay, vis) => ({
    style: { opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(24px)', transition: `all .65s ease ${delay}s` }
  });

  return (
    <section id="about" className="about" data-screen-label="04 About">
      <div className="about__in">
        <div ref={tRef}>
          <div {...fadeProps(0.05, tVis)} className="about__lbl">About us</div>
          <h2 {...fadeProps(0.15, tVis)} className="about__ttl">Small team.<br />Big teeth.</h2>
          <p {...fadeProps(0.25, tVis)} className="about__copy">
            We are a small creative studio helping brands turn vague ideas into identities, websites, and campaigns with character. We care about strategy, craft, performance, and making the internet less painfully boring.
          </p>
          <p {...fadeProps(0.35, tVis)} className="about__copy">
            From the first messy idea to launch and performance tracking, we help shape the whole digital experience instead of just decorating the surface.
          </p>
        </div>

        <div ref={sRef} className="about__stats">
          {stats.map((s, i) => (
            <div
              key={s.label}
              style={{ opacity: sVis ? 1 : 0, transform: sVis ? 'none' : 'translateY(30px)', transition: `all .5s ease ${i * 0.1 + 0.1}s` }}
            >
              <StatCard {...s} active={sVis} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── PROJECTS ──────────────────────────────────────────────── */
const PROJECT_COLORS = ['#1A0E35', '#0E1E30', '#1A1A35', '#0E2020'];

const ProjCard = ({ client, title, desc, tags, wide, idx, emoji }) => {
  const [ref, vis] = useScrollReveal(0.12);
  const bg = PROJECT_COLORS[idx % PROJECT_COLORS.length];

  return (
    <article
      ref={ref}
      className={`pcard ${wide ? 'pcard--wide' : ''}`}
      style={{ opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(44px)', transition: `all .65s cubic-bezier(.16,1,.3,1) ${idx * 0.1}s` }}
      data-cursor="view"
      aria-label={`${client}: ${title}`}
    >
      <div className="pcard__img">
        <div className="pcard__imgbg" style={{ background: bg }}>
          <span aria-hidden="true">{emoji}</span>
          <small>{client} — project visual</small>
        </div>
        <div className="pcard__overlay" aria-hidden="true">
          <span className="pcard__ov-txt">View project →</span>
        </div>
      </div>
      <div className="pcard__body">
        <div className="pcard__tags" aria-label="Tags">
          {tags.map(t => <span key={t} className="pcard__tag">{t}</span>)}
        </div>
        <div className="pcard__client">{client}</div>
        <h3 className="pcard__title">{title}</h3>
        <p className="pcard__desc">{desc}</p>
      </div>
    </article>
  );
};

const ProjectsSection = () => {
  const [hdRef, hdVis] = useScrollReveal(0.1);
  const projects = [
    { client: 'Northline Coffee', title: 'A neighborhood coffee brand with main-character energy.', desc: 'A warm, punchy identity and website system for a local coffee brand that wanted to feel less polished and more alive.', tags: ['Brand Identity', 'Website', 'Social Campaign'], wide: false, emoji: '☕' },
    { client: 'Brightside Legal', title: 'A serious law firm without the boring law firm website.', desc: 'A clearer, faster, sharper web experience for a professional team that needed trust without looking generic.', tags: ['Website', 'SEO', 'CMS'], wide: false, emoji: '⚖️' },
    { client: 'Orbit Festival', title: 'A festival identity built to move.', desc: 'A loud visual system with posters, social assets, animated graphics, and a digital home for messy human energy.', tags: ['Campaign', 'Illustration', 'Social Media'], wide: true, emoji: '🎵' },
    { client: 'Urban Nest', title: 'Real estate with warmth, structure, and zero template smell.', desc: 'A digital identity and platform designed to make property discovery feel simple, visual, and human.', tags: ['Strategy', 'Web', 'Branding'], wide: false, emoji: '🏡' },
  ];

  return (
    <section id="projects" className="proj" data-screen-label="05 Projects">
      <div
        ref={hdRef}
        className="proj__hd"
        style={{ opacity: hdVis ? 1 : 0, transform: hdVis ? 'none' : 'translateY(28px)', transition: 'all .6s ease' }}
      >
        <div className="proj__lbl">Featured work</div>
        <h2 className="proj__ttl">Our projects are unique,<br />like our clients.</h2>
        <p className="proj__sub">Different problems. Different personalities. Same unreasonable attention to detail.</p>
      </div>
      <div className="proj__grid" style={{ maxWidth: 1200, margin: '0 auto' }}>
        {projects.map((p, i) => <ProjCard key={p.client} {...p} idx={i} />)}
      </div>
    </section>
  );
};

Object.assign(window, { HeroSection, NavCardsSection, ExpertiseSection, AboutSection, ProjectsSection });
