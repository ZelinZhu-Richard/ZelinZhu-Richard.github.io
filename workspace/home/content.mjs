// The words on the homepage and the Contact page, as plain data.
// Zero-dependency: plain node can import this (stamp.mjs hashes its output), and
// modules/site-content.js serialises it into #build/site-content.mjs at build time,
// so the app bundle never imports PARTS or LINKS from outside workspace/home.
import { PARTS } from '../stones/parts.mjs';
import { LINKS } from '../../site/content.mjs';

/**
 * Chapter text format (no HTML, no class names):
 * - `\n` is a line break.
 * - `*words*` is italic.
 * - `\n\n` splits blocks; when a chapter has several blocks, the first one is its heading.
 * Carried over, in order, from the 17 scenes of site/story.mjs.
 * @type {ReadonlyArray<string>}
 */
const CHAPTERS = [
  'A student of\n*what comes next.*',
  'High school senior.\nComputer science.\nEconomics.\n*Curiosity.*',
  'Good questions\nbecome *experiments.*',
  'building.',
  'Learn',
  'Build',
  'Repeat',
  'Making my family,\nmy community,\nand the *world*\na little better.',
  'Machine learning. AI evaluation.\nThings built in public.',
  'From an idea\nto something *real.*',
  'Wake up.\nShip. Learn. *Repeat.*',
  'What am I\n*working on?*',
  'Learning from images\n\nAt UNC PRIMES, I work on\ndeep learning for neuroscience\nimage processing.',
  'Building ZeroMind\n\nOne agent on every frontier model,\none memory of your whole life,\nbetter at it every week.',
  'Building in the open\n\nFrom Apex Analysis to EqualVoice,\nI turn questions into code,\nthen learn from the results.',
  'Bringing people together\n\nI lead teams and host events.\nOff the keyboard: skiing,\nsnow, and the northern lights.',
  'Explore the work.\n*Follow the curiosity.*',
];

/** Contact links in display order; only those present in LINKS are shown. */
const CONTACT_LINKS = [
  ['email', 'Email', value => `mailto:${value}`],
  ['x', 'X', value => value],
  ['github', 'GitHub', value => value],
  ['linkedin', 'LinkedIn', value => value],
];

/**
 * @typedef {{ title: string, description: string }} PageMeta
 * @typedef {{ id: string, text: string }} Chapter
 * @typedef {{ id: string, title: string, subtitle: string, href: string }} Stone
 * @typedef {{ id: string, label: string, href: string }} ContactLink
 * @typedef {{
 *   skip: string, scroll: string, menu: string, sound: string, open: string, close: string,
 *   contact: string, sections: string, siteMenu: string, loading: string, opening: string,
 * }} UiWords
 * @typedef {{
 *   meta: { home: PageMeta, contact: PageMeta },
 *   hero: { name: string, line: string },
 *   chapters: Chapter[],
 *   stones: Stone[],
 *   contact: { lines: string[], links: ContactLink[] },
 *   ui: UiWords,
 * }} HomeContent
 */

/** The small words of the interface: buttons, cues and accessible names. */
const UI = {
  skip: 'Skip to content',
  scroll: 'Scroll',
  menu: 'Menu',
  sound: 'Sound',
  open: 'Open',
  close: 'Close',
  contact: 'Contact',
  sections: 'Seven sections',
  siteMenu: 'Site menu',
  loading: 'Loading',
  opening: 'Opening',
};

/**
 * Everything the two pages say. Returns a fresh, JSON-safe object on every call.
 * @returns {HomeContent}
 */
export function homeContent() {
  return {
    meta: {
      home: {
        title: 'Richard Zhu | Build. Learn. Repeat.',
        description: 'Richard Zhu: high school senior, computer science and economics. Machine learning research, ZeroMind, and projects built in public.',
      },
      contact: {
        title: 'Contact — Richard Zhu',
        description: 'Get in touch with Richard Zhu: email, X, GitHub and LinkedIn.',
      },
    },
    hero: { name: 'Richard Zhu', line: 'A student of what comes next.' },
    chapters: CHAPTERS.map((text, index) => ({ id: `c${String(index + 1).padStart(2, '0')}`, text })),
    stones: PARTS.map(({ id, title, subtitle, href }) => ({ id, title, subtitle, href })),
    contact: {
      lines: ['Have something in mind?', 'Let’s build it *together.*'],
      links: CONTACT_LINKS
        .filter(([id]) => typeof LINKS[id] === 'string' && LINKS[id])
        .map(([id, label, href]) => ({ id, label, href: href(LINKS[id]) })),
    },
    ui: { ...UI },
  };
}
