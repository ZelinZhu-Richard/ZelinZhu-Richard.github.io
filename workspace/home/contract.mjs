// Names shared by the app, the engine and anything outside the page that talks to it.
// Zero-dependency. CONTRACTS.md explains what each one means.

/** Bumped only for a breaking change to window.__home. */
export const HOME_CONTRACT_VERSION = 1;

/** The global the page exposes: window[HOME_GLOBAL]. */
export const HOME_GLOBAL = '__home';

/** CustomEvents dispatched on window. */
export const HOME_EVENTS = Object.freeze({
  ready: 'home:ready',
  route: 'home:route',
  tone: 'home:tone',
  sound: 'home:sound',
});

/** Attributes on <html>. */
export const HOME_ATTRS = Object.freeze({
  route: 'data-home',
  js: 'data-home-js',
  tone: 'data-home-tone',
  sound: 'data-home-sound',
  webgl: 'data-home-webgl',
});

/** Values of data-home and window.__home.route. */
export const HOME_ROUTES = Object.freeze({ story: 'story', contact: 'contact' });

/** The two prerendered pages and the route each one is. */
export const HOME_PAGES = Object.freeze({ '/': HOME_ROUTES.story, '/contacts/': HOME_ROUTES.contact });

/** Values of data-home-tone and window.__home.tone. */
export const HOME_TONES = Object.freeze(['dark', 'light']);

/** Values of data-home-webgl. */
export const HOME_WEBGL = Object.freeze({ on: 'on', off: 'off', lost: 'lost' });

/** Engine modes (the same words as the routes). */
export const SCENE_MODES = Object.freeze([HOME_ROUTES.story, HOME_ROUTES.contact]);

/** Engine quality settings; 'auto' lets the engine pick and change tiers itself. */
export const SCENE_QUALITY = Object.freeze(['auto', 'high', 'medium', 'low']);

/** Events the engine facade emits through scene.on(event, fn). */
export const SCENE_EVENTS = Object.freeze([
  'ready',
  'stone:enter',
  'stone:leave',
  'stone:click',
  'stones:screen',
  'beat',
  'tier',
  'contextlost',
]);

/** Where the engine fetches its generated assets from (release copies home-assets/** when present). */
export const HOME_ASSETS_BASE = '/home-assets/';

/**
 * The route a path belongs to.
 * @param {string} path
 * @returns {'story' | 'contact'}
 */
export function homeRouteOf(path) {
  return /^\/contacts(?:\/|$)/.test(path) ? HOME_ROUTES.contact : HOME_ROUTES.story;
}
