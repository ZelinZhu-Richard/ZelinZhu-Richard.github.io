// sections2.jsx — Marquee, Careers, Contact, Footer

/* ── MARQUEE ────────────────────────────────────────────── */
const MarqueeSection = () => {
  const words = ['Branding','Web','Strategy','Content','SEO','Motion','Campaigns','Identity','Digital Products','Creative Direction','Performance','Storytelling'];
  const Row = ({ rev }) => (
    <div className={`marq__row ${rev ? 'marq__rev' : 'marq__fwd'}`} aria-hidden="true">
      {[...words, ...words].map((w, i) => (
        <span key={i} className="marq__item">{w}<span className="marq__dot">✦</span></span>
      ))}
    </div>
  );
  return (
    <div className="marq" aria-label="Our services" role="region">
      <Row rev={false} />
      <Row rev={true} />
    </div>
  );
};

/* ── CAREERS ────────────────────────────────────────────── */
const CareersSection = () => {
  const [ref, vis] = useScrollReveal(0.2);
  return (
    <section id="careers" className="car" data-screen-label="06 Careers">
      <div
        ref={ref}
        style={{ opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(32px)', transition: 'all .7s ease', maxWidth: 680, margin: '0 auto' }}
      >
        <div className="car__msc" aria-hidden="true"><CoffeeMascot size={88} /></div>
        <div className="car__lbl">We're hiring</div>
        <h2 className="car__ttl">Feel like getting<br />a new job?</h2>
        <p className="car__copy">
          We like challenges, strong opinions, clean files, strange ideas, and people who care about the work even when no one is watching.
        </p>
        <a href="#contact" className="btn-p" data-cursor="red">
          Join the team
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>
    </section>
  );
};

/* ── CONTACT ────────────────────────────────────────────── */
const ContactSection = () => {
  const [form, setForm] = useState({ name: '', message: '', email: '', phone: '' });
  const [sent, setSent] = useState(false);
  const [focus, setFocus] = useState('');
  const [hdRef, hdVis] = useScrollReveal(0.12);

  const onChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const onSubmit = (e) => { e.preventDefault(); setSent(true); };

  const mascotMood = focus === 'message' ? 'thinking' : focus === 'email' ? 'surprised' : 'happy';

  const fp = (delay) => ({
    style: { opacity: hdVis ? 1 : 0, transform: hdVis ? 'none' : 'translateY(20px)', transition: `all .6s ease ${delay}s` }
  });

  return (
    <section id="contact" className="ctc" data-screen-label="07 Contact">
      <div className="ctc__in">

        {/* Left */}
        <div className="ctc__msc-wrap">
          <div ref={hdRef}>
            <div {...fp(0)} className="ctc__lbl">Say hello</div>
            <h2 {...fp(0.1)} className="ctc__ttl">Let's work<br /><span>together?</span></h2>
            <p {...fp(0.2)} className="ctc__sub">Contact us. We don't bite.</p>
          </div>
          <div {...fp(0.3)} className="ctc__dets">
            <div className="ctc__det">
              <div className="ctc__ico" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M1 3.5l6.5 5 6.5-5M1 3.5h13v9H1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              hello@oddhaus.studio
            </div>
            <div className="ctc__det">
              <div className="ctc__ico" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M2 2.5a1 1 0 011-1h2.5a.5.5 0 01.5.5v3a.5.5 0 01-.5.5H5C5 8.5 7 10.5 9.5 11v-.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V13a1 1 0 01-1 1C6.5 14 1 8.5 1 3.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </div>
              +1 (123) 456 7890
            </div>
            <div className="ctc__det">
              <div className="ctc__ico" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M7.5 1C5 1 3 3.2 3 5.7c0 3.8 4.5 8.3 4.5 8.3S12 9.5 12 5.7C12 3.2 10 1 7.5 1zm0 6.5a1.8 1.8 0 110-3.6 1.8 1.8 0 010 3.6z" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </div>
              123 Creative Street, Studio City
            </div>
          </div>
          {/* Reactive mascot */}
          <div
            className="ctc__msc"
            aria-hidden="true"
            style={{ transition: 'transform .35s cubic-bezier(.34,1.56,.64,1)', transform: focus ? 'scale(1.1) rotate(-5deg)' : 'scale(1)' }}
          >
            <BlobMascot size={88} mood={mascotMood} color="#C74141" />
          </div>
        </div>

        {/* Right */}
        <div>
          {sent ? (
            <div className="ctc__ok" role="alert">
              <div style={{ fontSize: 52, marginBottom: 14 }} aria-hidden="true">🚀</div>
              <h3>Message launched.</h3>
              <p>We'll catch it soon and get back to you.</p>
            </div>
          ) : (
            <form className="ctc__form" onSubmit={onSubmit} noValidate>
              <div className="ff">
                <label htmlFor="ctc-name">Hi, my name is…</label>
                <input id="ctc-name" name="name" type="text" value={form.name} onChange={onChange}
                  onFocus={() => setFocus('name')} onBlur={() => setFocus('')}
                  placeholder="Your name" required autoComplete="name" />
              </div>
              <div className="ff">
                <label htmlFor="ctc-msg">I wanted to tell you that…</label>
                <textarea id="ctc-msg" name="message" value={form.message} onChange={onChange}
                  onFocus={() => setFocus('message')} onBlur={() => setFocus('')}
                  placeholder="Your message" required />
              </div>
              <div className="ff">
                <label htmlFor="ctc-email">Or by email at…</label>
                <input id="ctc-email" name="email" type="email" value={form.email} onChange={onChange}
                  onFocus={() => setFocus('email')} onBlur={() => setFocus('')}
                  placeholder="your@email.com" required autoComplete="email" />
              </div>
              <div className="ff">
                <label htmlFor="ctc-phone">You can reach me at…</label>
                <input id="ctc-phone" name="phone" type="tel" value={form.phone} onChange={onChange}
                  onFocus={() => setFocus('phone')} onBlur={() => setFocus('')}
                  placeholder="+1 000 000 0000" autoComplete="tel" />
              </div>
              <button type="submit" className="ctc__btn" data-cursor="red">
                Send the thing ✦
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};

/* ── FOOTER ─────────────────────────────────────────────── */
const FooterSection = () => {
  const [ref, vis] = useScrollReveal(0.08);

  const fade = (d) => ({
    style: { opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(28px)', transition: `all .7s ease ${d}s` }
  });

  return (
    <footer className="ftr" role="contentinfo" data-screen-label="08 Footer">
      <div ref={ref}>
        <p {...fade(0)} className="ftr__big">
          Got an idea<br />with <span>teeth?</span>
        </p>

        <div {...fade(0.15)} className="ftr__grid">
          <div>
            <div className="ftr__brand">ODD<span>HAUS</span></div>
            <p className="ftr__tag">A small creative studio building brands, websites, and campaigns with actual personality.</p>
          </div>
          <div>
            <div className="ftr__col-hd">Navigate</div>
            <ul className="ftr__links">
              <li><a href="#projects">Projects</a></li>
              <li><a href="#about">Agency</a></li>
              <li><a href="#expertise">Expertise</a></li>
              <li><a href="#careers">Careers</a></li>
              <li><a href="#contact">Contact</a></li>
            </ul>
          </div>
          <div>
            <div className="ftr__col-hd">Follow</div>
            <ul className="ftr__links">
              <li><a href="#" rel="noopener noreferrer">Instagram</a></li>
              <li><a href="#" rel="noopener noreferrer">LinkedIn</a></li>
              <li><a href="#" rel="noopener noreferrer">Dribbble</a></li>
              <li><a href="mailto:hello@oddhaus.studio">Email</a></li>
            </ul>
          </div>
        </div>

        <div {...fade(0.3)} className="ftr__bot">
          <span className="ftr__sm">Made with caffeine, pixels, and questionable jokes. © 2025 ODDHAUS.</span>
          <button className="btt" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">
            ↑ Back to top
          </button>
        </div>
      </div>
    </footer>
  );
};

Object.assign(window, { MarqueeSection, CareersSection, ContactSection, FooterSection });
