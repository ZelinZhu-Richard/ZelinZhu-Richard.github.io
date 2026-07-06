import { useScrollReveal } from '../hooks';
import { CONTACT, LINKS } from '../data/content';

const SOCIALS = [
  {
    label: 'GitHub', href: LINKS.github,
    icon: <path d="M9 1a8 8 0 00-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.66 7.66 0 014 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.94.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8 8 0 009 1z" fill="currentColor" />,
  },
  {
    label: 'LinkedIn', href: LINKS.linkedin,
    icon: <path d="M4.1 6.6H1.4V16h2.7V6.6zM2.7 5.4a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM8.8 11.1c0-1.2.55-1.9 1.6-1.9 1 0 1.4.7 1.4 1.9V16h2.7v-5.8c0-2.4-1.35-3.8-3.24-3.8-1.5 0-2.16.83-2.46 1.4V6.6H6.1V16h2.7v-4.9z" fill="currentColor" />,
  },
  {
    label: 'X', href: LINKS.x,
    icon: <path d="M10.5 7.6L16.3 1h-1.4L9.9 6.7 5.9 1H1.3l6.1 8.7L1.3 17h1.4l5.3-6.1 4.3 6.1h4.6l-6.4-9.4zm-1.9 2.2l-.6-.9-4.9-7h2.1l4 5.6.6.9 5.1 7.3h-2.1l-4.2-5.9z" fill="currentColor" />,
  },
];

const Contact = () => {
  const [ref, vis] = useScrollReveal(0.12);

  const fade = (delay) => ({
    style: { opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(22px)', transition: `all .6s ease ${delay}s` },
  });

  return (
    <section id="contact" className="ctc">
      <div ref={ref} className="ctc__in">
        <div {...fade(0)} className="sec__lbl">Say hello</div>
        <h2 {...fade(0.1)} className="ctc__ttl">
          The <span className="ctc__night">night</span> has passed,{' '}
          <span className="ctc__sun">I</span> am here.
        </h2>
        <p {...fade(0.25)} className="ctc__sub">{CONTACT.sub} We don't bite.</p>

        <div {...fade(0.35)} className="ctc__row">
          <a href={`mailto:${LINKS.email}`} className="btn-p">{LINKS.email}</a>
          <a href={LINKS.resume} className="btn-o" target="_blank" rel="noopener noreferrer">Resume ↗</a>
        </div>

        <div {...fade(0.45)} className="ctc__socials">
          {SOCIALS.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="ctc__soc">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">{s.icon}</svg>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Contact;
