// 404 page helper: shows the address that was asked for and, when one page on the site is a near
// match, offers it. The page works without this; it just cannot name the address or guess.
import { closest } from './search.js';

const LONGEST = 80;

/** The missing path as the visitor typed it, cut short so a very long address cannot break the line. */
export function shownPath(pathname) {
  let path = pathname;
  try { path = decodeURI(pathname); } catch { /* not valid encoding: show it as it came */ }
  // Counted in whole characters, so the cut never lands inside an emoji.
  const characters = [...path];
  return characters.length > LONGEST ? `${characters.slice(0, LONGEST).join('')}…` : path;
}

/** Path -> title for every page on this site in the index. Mail and other sites are left out. */
export function sitePages(index) {
  const pages = new Map();
  for (const item of index) {
    if (!item.href.startsWith('/')) continue;
    const path = item.href.split('#')[0];
    // Only an entry for the page itself may name it; an entry for one of its anchors has the anchor's title.
    if (item.href === path) pages.set(path, item.title);
    else if (!pages.has(path)) pages.set(path, '');
  }
  return pages;
}

/** { href, title } for the page a missing path most likely meant, or null. */
export function guess(pathname, index) {
  const pages = sitePages(index);
  const href = closest(pathname, [...pages.keys()]);
  return href ? { href, title: pages.get(href) || href } : null;
}

function start() {
  const lost = document.querySelector('[data-lost]');
  const where = lost?.querySelector('[data-lost-path]');
  // Opened directly, the 404 page is not a missing address.
  if (!where || /^\/404(?:\.html)?\/?$/.test(location.pathname)) return;
  where.textContent = shownPath(location.pathname);
  lost.hidden = false;
  const offer = lost.querySelector('[data-lost-guess]');
  const link = lost.querySelector('[data-lost-link]');
  if (!offer || !link) return;
  import('./index.js').then(({ INDEX }) => {
    const found = guess(location.pathname, INDEX);
    if (!found) return;
    link.href = found.href;
    link.textContent = found.title;
    offer.hidden = false;
  }).catch(() => { /* no index, no guess: the line above still names the address */ });
}

if (typeof document !== 'undefined') start();
