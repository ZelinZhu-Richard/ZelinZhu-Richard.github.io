import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Scroll choreography for the main page. Caller guards reduced motion.
// Returns a cleanup that reverts everything it created.
export function initEffects() {
  gsap.registerPlugin(ScrollTrigger);

  const ctx = gsap.context(() => {
    // section titles: clip reveal + alternating horizontal drift on scrub
    gsap.utils.toArray('.sec__ttl, .ftr__big').forEach((el, i) => {
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
      );
      // footer headline keeps its own reveal styles — drift the section titles only
      if (el.classList.contains('sec__ttl')) {
        gsap.fromTo(el, { x: i % 2 ? 42 : -42 }, {
          x: 0,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 52%', scrub: 0.6 },
        });
      }
    });

    // experience timeline: the line draws downward as it scrolls through
    const tl = document.querySelector('.tl');
    if (tl) {
      tl.style.setProperty('--tl-draw', 0);
      ScrollTrigger.create({
        trigger: tl,
        start: 'top 82%',
        end: 'bottom 60%',
        scrub: 0.4,
        onUpdate: (st) => tl.style.setProperty('--tl-draw', st.progress.toFixed(4)),
      });
      gsap.utils.toArray('.tl__dot').forEach((dot) => {
        gsap.fromTo(dot, { scale: 0 }, {
          scale: 1,
          duration: 0.45,
          ease: 'back.out(2.6)',
          scrollTrigger: { trigger: dot, start: 'top 84%' },
        });
      });
    }

    // project cards: alternating parallax on the outer wrapper (the card itself
    // owns its inline tilt transform); the emoji counter-drifts and settles
    gsap.utils.toArray('.pcard-wrap').forEach((wrap, i) => {
      gsap.fromTo(wrap, { y: i % 2 ? 44 : 20 }, {
        y: i % 2 ? -28 : -10,
        ease: 'none',
        scrollTrigger: { trigger: wrap, start: 'top bottom', end: 'bottom top', scrub: 0.5 },
      });
      const emoji = wrap.querySelector('.pcard__imgbg span');
      if (emoji) {
        gsap.fromTo(emoji, { yPercent: 40, scale: 1.25, rotate: -8 }, {
          yPercent: -30,
          scale: 1,
          rotate: 6,
          ease: 'none',
          scrollTrigger: { trigger: wrap, start: 'top bottom', end: 'bottom top', scrub: 0.5 },
        });
      }
    });

    // about photo: gentle parallax inside its (React-animated) wrapper
    const photo = document.querySelector('.about__photo');
    if (photo) {
      gsap.fromTo(photo, { y: 26 }, {
        y: -26,
        ease: 'none',
        scrollTrigger: { trigger: '.about__photo-wrap', start: 'top bottom', end: 'bottom top', scrub: 0.5 },
      });
    }

    // pills: quick staggered rise as they enter
    ScrollTrigger.batch('.pill', {
      start: 'top 94%',
      once: true,
      onEnter: (batch) => {
        batch.forEach((el) => { el.style.transition = 'none'; });
        gsap.fromTo(batch, { y: 14, opacity: 0 }, {
          y: 0,
          opacity: 1,
          duration: 0.5,
          ease: 'power2.out',
          stagger: 0.035,
          clearProps: 'transform,opacity,transition',
        });
      },
    });
  });

  return () => ctx.revert();
}
