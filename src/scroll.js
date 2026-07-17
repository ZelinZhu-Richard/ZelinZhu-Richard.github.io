import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

// Singleton smooth-scroll engine: Lenis drives the page, GSAP's ticker drives
// Lenis, and everything kinetic (dragon, strings, marquees, skew) reads one
// shared smoothed velocity from here.
let lenis = null;
let velocity = 0;

export const getVelocity = () => velocity;

export function initScroll() {
  if (lenis) return () => {};
  gsap.registerPlugin(ScrollTrigger);

  lenis = new Lenis({ autoRaf: false, anchors: true });
  lenis.on('scroll', ScrollTrigger.update);

  const tick = (time) => {
    lenis.raf(time * 1000);
    velocity += (lenis.velocity - velocity) * 0.12;
  };
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  // velocity skew: tagged wrappers shear with scroll speed and spring back
  let skewTick = null;
  if (window.innerWidth > 768) {
    const setters = gsap.utils.toArray('[data-skew]').map((el) =>
      gsap.quickTo(el, 'skewY', { duration: 0.4, ease: 'power3.out' })
    );
    skewTick = () => {
      const s = gsap.utils.clamp(-2.2, 2.2, velocity * 0.05);
      setters.forEach((set) => set(s));
    };
    gsap.ticker.add(skewTick);
  }

  return () => {
    gsap.ticker.remove(tick);
    if (skewTick) gsap.ticker.remove(skewTick);
    lenis.destroy();
    lenis = null;
    velocity = 0;
  };
}
