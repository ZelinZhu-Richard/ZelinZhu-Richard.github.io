// Scroll on the story page.
// - One ScrollTrigger over the story element (native scroll, no ScrollSmoother) turns
//   scroll into progress p, eased by a short time constant unless motion is reduced, and
//   hands it to the scene through the bridge.
// - Staging: with the scene (WebGL on), the story is "staged": every section's frame is
//   fixed over the viewport and shown in place at the opacity of its window
//   (utils/sections.js), at the same eased story time the scene draws. Lines rise into
//   place with SplitText as a frame fades in and lift away as it fades out.
// - Without JavaScript, and without WebGL, nothing is staged: the story is a plain,
//   compact page. Only JS ever hides text, and only once it has taken over.
// - Reduced motion (prefers-reduced-motion or ?nomotion=1): no easing, no SplitText, and
//   frames switch on and off at their windows instead of fading.
import { nextTick, onBeforeUnmount, onMounted, reactive, watch } from 'vue';
import { HOME_WEBGL } from '../../contract.mjs';
import { parseFlags } from '../utils/flags.js';
import { schedule } from '../utils/schedule.js';
import { windowCentre, windowOpacity, windowPhase } from '../utils/sections.js';
import { sceneState, setStoryProgress, whenWebglDecided } from './useScene.js';

/** Time constant of the progress easing (the "scrub"), in ms. */
const SMOOTH_MS = 220;
/** How far a masked line travels as it enters (% of its height) and as it leaves. */
const RISE_IN = 105;
const RISE_OUT = 38;

/** Story state other components read: whether the page is staged, and the frame that is up. */
export const storyState = reactive({ staged: false, active: -1 });

const clamp01 = value => Math.min(1, Math.max(0, value));
const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * @typedef {{ el: HTMLElement, masked: boolean }} Rise
 * @typedef {{ section: HTMLElement, frame: HTMLElement, index: number, rises: Rise[], key: string }} Frame
 */

/**
 * @param {import('vue').Ref<HTMLElement | null>} storyRef the element that holds the sections
 */
export function useStoryMotion(storyRef) {
  let disposed = false;
  let reduced = false;
  /** @type {any} */ let gsap = null;
  /** @type {any} */ let ScrollTrigger = null;
  /** @type {any} */ let context = null;
  /** @type {any} */ let trigger = null;
  /** @type {any[]} */ let splits = [];
  /** @type {Frame[]} */ let frames = [];
  /** @type {(() => void)[]} */ let cleanups = [];
  let target = 0;
  let current = 0;
  let primed = false;
  let lastU = 0;

  // ---- progress -------------------------------------------------------------------------

  /** @param {number} p */
  function commit(p) {
    setStoryProgress(p);
    lastU = schedule.progressToU(p);
    render(lastU);
  }

  /** @param {number} p */
  function push(p) {
    target = clamp01(p);
    if (reduced || !primed) {
      primed = true;
      current = target;
      commit(current);
    }
  }

  /** gsap.ticker callback: eases `current` toward `target`. */
  function tick(_time, deltaTime) {
    if (current === target) return;
    const k = 1 - Math.exp(-(deltaTime || 16.7) / SMOOTH_MS);
    current += (target - current) * k;
    if (Math.abs(target - current) < 2e-5) current = target;
    commit(current);
  }

  /** Jumps straight to the target, skipping the easing. */
  function snap() {
    current = target;
    primed = true;
    commit(current);
  }

  /** @param {HTMLElement} root */
  function progressFromDom(root) {
    const rect = root.getBoundingClientRect();
    const span = rect.height - window.innerHeight;
    return span > 0 ? clamp01(-rect.top / span) : 0;
  }

  // ---- frames -----------------------------------------------------------------------------

  /** @param {HTMLElement} root */
  function collect(root) {
    frames = [];
    for (const section of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(':scope > .story-section'))) {
      const frame = /** @type {HTMLElement | null} */ (section.querySelector(':scope > .story-frame'));
      if (!frame) continue;
      const rises = /** @type {HTMLElement[]} */ ([...frame.querySelectorAll('.js-rise')]).map(el => ({ el, masked: false }));
      frames.push({ section, frame, index: Number(section.dataset.index), rises, key: '' });
    }
  }

  /**
   * Shows each frame at its window's opacity for story time u, rises its lines, and marks
   * the frame that is up (it alone takes pointer input).
   * @param {number} u
   */
  function render(u) {
    if (!storyState.staged) return;
    let active = -1;
    let best = 0;
    for (const f of frames) {
      const win = schedule.windows[f.index];
      if (!win) continue;
      const opacity = reduced ? (u >= win.u0 && u < win.u1 ? 1 : 0) : windowOpacity(win, u);
      const { enter, leave } = reduced ? { enter: 1, leave: 1 } : windowPhase(win, u);
      const key = opacity === 0 ? '0' : `${opacity.toFixed(3)}|${enter.toFixed(3)}|${leave.toFixed(3)}`;
      if (opacity > best) {
        best = opacity;
        active = f.index;
      }
      if (key === f.key) continue;
      f.key = key;
      f.frame.style.opacity = opacity === 1 ? '1' : opacity.toFixed(3);
      const n = f.rises.length;
      if (!n || opacity === 0) continue;
      const step = n > 1 ? Math.min(0.14, 0.5 / (n - 1)) : 0;
      const span = 1 - step * (n - 1);
      f.rises.forEach((rise, k) => {
        const tin = smooth(clamp01((enter - k * step) / span));
        const tout = smooth(clamp01((leave - k * step) / span));
        const y = (1 - tin) * RISE_IN - (1 - tout) * RISE_OUT;
        rise.el.style.transform = y === 0 ? '' : `translate3d(0, ${(rise.masked ? y : y * 0.3).toFixed(2)}%, 0)`;
      });
    }
    if (storyState.active === active) return;
    for (const f of frames) {
      if (f.index === active) f.frame.dataset.active = '';
      else if (f.index === storyState.active) delete f.frame.dataset.active;
    }
    storyState.active = active;
  }

  /** @param {any} SplitText */
  function split(SplitText) {
    for (const f of frames) {
      const parts = [...f.frame.querySelectorAll('.js-split')];
      if (!parts.length) continue;
      const plain = f.rises.filter(rise => !rise.masked);
      splits.push(SplitText.create(parts, {
        type: 'lines',
        mask: 'lines',
        linesClass: 'split-line',
        aria: 'none',
        autoSplit: true,
        onSplit(/** @type {any} */ self) {
          f.rises = [...self.lines.map((/** @type {HTMLElement} */ el) => ({ el, masked: true })), ...plain];
          f.key = '';
          render(lastU);
        },
      }));
    }
  }

  // ---- jumps --------------------------------------------------------------------------------

  /**
   * Scrolls so the story is at section-unit position u. Staged, this uses the schedule
   * (the engine's u is then the one asked for); unstaged, the sections' own boxes.
   * @param {number} u
   * @param {HTMLElement} root
   */
  function jumpTo(u, root) {
    const v = Math.min(schedule.count, Math.max(0, u));
    let y;
    if (storyState.staged) {
      const start = trigger ? trigger.start : root.getBoundingClientRect().top + window.scrollY;
      const end = trigger ? trigger.end : start + root.offsetHeight - window.innerHeight;
      y = start + schedule.uToProgress(v) * (end - start);
    } else {
      const sections = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(':scope > .story-section')]);
      if (!sections.length) return;
      const i = Math.min(sections.length - 1, Math.floor(v));
      const top = sections[i].getBoundingClientRect().top + window.scrollY;
      y = top + (v - i) * sections[i].offsetHeight;
    }
    window.scrollTo({ top: Math.max(0, Math.round(y)), left: 0, behavior: /** @type {ScrollBehavior} */ ('instant') });
    if (ScrollTrigger) ScrollTrigger.update();
    if (!trigger) target = progressFromDom(root);
    else target = clamp01(trigger.progress);
    snap();
  }

  /** Keyboard focus landing in a frame that is not up brings that section into view. */
  function onFocusIn(/** @type {FocusEvent} */ event) {
    if (!storyState.staged) return;
    const section = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest?.('.story-section'));
    const root = storyRef.value;
    if (!section || !root) return;
    const index = Number(section.dataset.index);
    const win = schedule.windows[index];
    if (!win || index === storyState.active) return;
    jumpTo(windowCentre(win, index), root);
  }

  // ---- lifecycle ----------------------------------------------------------------------------

  /** @param {HTMLElement} root */
  async function stage(root) {
    storyState.staged = true;
    await nextTick();
    if (disposed) return;
    collect(root);
    root.addEventListener('focusin', onFocusIn);
    cleanups.push(() => root.removeEventListener('focusin', onFocusIn));
  }

  /** @param {HTMLElement} root */
  function listenWithoutGsap(root) {
    const update = () => push(progressFromDom(root));
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    cleanups.push(() => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    });
    update();
  }

  onMounted(async () => {
    const root = storyRef.value;
    if (!root) return;
    const flags = parseFlags(window.location.search);
    reduced = flags.nomotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** @type {any[] | null} */
    let modules = null;
    const [webgl] = await Promise.all([
      whenWebglDecided(),
      Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('gsap/SplitText')]).then(
        loaded => { modules = loaded; },
        error => console.error('Story motion failed to load', error),
      ),
    ]);
    if (disposed) return;
    if (webgl !== HOME_WEBGL.off) await stage(root);
    if (disposed) return;
    if (!modules) {
      reduced = true;
      listenWithoutGsap(root);
    } else {
      gsap = modules[0].gsap;
      ScrollTrigger = modules[1].ScrollTrigger;
      const SplitText = modules[2].SplitText;
      gsap.registerPlugin(ScrollTrigger, SplitText);
      context = gsap.context(() => {
        trigger = ScrollTrigger.create({
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (/** @type {any} */ self) => push(self.progress),
          onRefresh: (/** @type {any} */ self) => push(self.progress),
        });
        if (storyState.staged && !reduced) split(SplitText);
      }, root);
      gsap.ticker.add(tick);
      cleanups.push(() => gsap.ticker.remove(tick));
      // The page re-measures if the scene goes away or comes back.
      cleanups.push(watch(() => sceneState.webgl, () => ScrollTrigger.refresh()));
      ScrollTrigger.refresh();
      target = clamp01(trigger.progress);
    }
    if (flags.at !== null) jumpTo(flags.at, root);
    else snap();
  });

  onBeforeUnmount(() => {
    disposed = true;
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    // Put the original text back before Vue removes the nodes it rendered.
    for (const split of splits) split.revert();
    splits = [];
    context?.revert();
    context = null;
    trigger = null;
    for (const f of frames) {
      f.frame.style.opacity = '';
      delete f.frame.dataset.active;
      for (const rise of f.rises) rise.el.style.transform = '';
    }
    frames = [];
    storyState.staged = false;
    storyState.active = -1;
  });
}
