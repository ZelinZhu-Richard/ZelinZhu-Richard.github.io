// window.__home and the data-home-* attributes on <html>. CONTRACTS.md documents them.
// The page owns this state; SceneCanvas reports into it through $homeContract.
import { defineNuxtPlugin } from '#imports';
import { HOME_ATTRS, HOME_CONTRACT_VERSION, HOME_EVENTS, HOME_GLOBAL, HOME_TONES, HOME_WEBGL, homeRouteOf } from '~~/contract.mjs';

export default defineNuxtPlugin(nuxtApp => {
  const root = document.documentElement;
  const state = { ready: false, sound: false, tone: 'dark', route: homeRouteOf(location.pathname) };
  /** @type {{ setSound(on: boolean): void } | null} */
  let scene = null;

  /** @param {string} name @param {object} detail */
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

  /** @param {boolean} on */
  function setSound(on) {
    const sound = !!on;
    scene?.setSound(sound);
    if (sound === state.sound) return;
    state.sound = sound;
    root.setAttribute(HOME_ATTRS.sound, sound ? 'on' : 'off');
    emit(HOME_EVENTS.sound, { sound });
  }

  const api = Object.freeze(Object.defineProperties({}, {
    version: { value: HOME_CONTRACT_VERSION, enumerable: true },
    ready: { get: () => state.ready, enumerable: true },
    sound: { get: () => state.sound, enumerable: true },
    tone: { get: () => state.tone, enumerable: true },
    route: { get: () => state.route, enumerable: true },
    setSound: { value: setSound, enumerable: true },
  }));
  Object.defineProperty(window, HOME_GLOBAL, { value: api, configurable: true });

  root.setAttribute(HOME_ATTRS.js, 'on');
  root.setAttribute(HOME_ATTRS.tone, state.tone);
  root.setAttribute(HOME_ATTRS.sound, 'off');

  nuxtApp.hook('page:finish', () => {
    const route = homeRouteOf(nuxtApp.$router.currentRoute.value.path);
    if (route === state.route) return;
    state.route = route;
    emit(HOME_EVENTS.route, { route });
  });

  return {
    provide: {
      homeContract: {
        /** The current sound setting (window.__home.sound). */
        get sound() { return state.sound; },
        /** The same as window.__home.setSound; the sound toggle calls it inside its click. */
        setSound,
        /** Called once the scene has drawn its first frame, or settled without one. */
        setReady() {
          if (state.ready) return;
          state.ready = true;
          emit(HOME_EVENTS.ready, { route: state.route });
        },
        /** @param {string} tone */
        setTone(tone) {
          if (!HOME_TONES.includes(tone) || tone === state.tone) return;
          state.tone = tone;
          root.setAttribute(HOME_ATTRS.tone, tone);
          emit(HOME_EVENTS.tone, { tone });
        },
        /** @param {'on' | 'off' | 'lost'} value */
        setWebgl(value) {
          if (Object.values(HOME_WEBGL).includes(value)) root.setAttribute(HOME_ATTRS.webgl, value);
        },
        /** @param {{ setSound(on: boolean): void } | null} next */
        attachScene(next) {
          scene = next;
          scene?.setSound(state.sound);
        },
      },
    },
  };
});
