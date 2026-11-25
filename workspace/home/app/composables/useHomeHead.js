import { useHead } from '#imports';
import content from '#build/site-content.mjs';
import { HOME_ATTRS } from '../../contract.mjs';

const SITE = 'https://zelinzhu-richard.github.io';

/**
 * Per-page head: title, description, canonical, Open Graph and <html data-home>.
 * The shared tags (lang, theme-color, og:image, twitter:*) live in nuxt.config.js.
 * @param {'story' | 'contact'} route
 */
export function useHomeHead(route) {
  const meta = route === 'contact' ? content.meta.contact : content.meta.home;
  const url = route === 'contact' ? `${SITE}/contacts/` : `${SITE}/`;
  useHead({
    htmlAttrs: { [HOME_ATTRS.route]: route },
    title: meta.title,
    meta: [
      { name: 'description', content: meta.description },
      { property: 'og:title', content: meta.title },
      { property: 'og:description', content: meta.description },
      { property: 'og:url', content: url },
    ],
    link: [{ rel: 'canonical', href: url }],
  });
}
