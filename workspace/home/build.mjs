// Site build step for the homepage and Contact page. Zero-dependency: it never runs
// Nuxt. It checks that the committed release/ is fresh, then copies it into the output.
// The site build also passes the site index, which goes at the end of both pages as a
// plain list of links (outside the Nuxt root, so hydration never sees it). The index is
// read at site build time, so a new page never needs a Nuxt rebuild.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { RELEASE_DIR, checkRelease } from './stamp.mjs';
import { HOME_INDEX_ID, HOME_PAGES } from './contract.mjs';
import { isUnlisted } from '../palette/index.mjs';
import { FEED_PATH, FEED_TITLE } from '../blog/feed.mjs';

/** The two pages, as files relative to the output: index.html and contacts/index.html. */
export const HOME_FILES = Object.freeze(Object.keys(HOME_PAGES).map(path => `${path.slice(1)}index.html`));

/**
 * The captured phoenix homepage that used to be / and /contacts/. It stays in public/
 * (asset-manifest.json still covers it) but no longer ships: this app replaced it.
 * Folders count with everything inside them.
 */
export const RETIRED_PUBLIC = Object.freeze(['index.html', 'contacts', 'start.js', 'local.css', '_nuxt/builds', 'audio', 'images', 'libs', 'models', 'textures', 'timelines']);

/** The two fonts in public/_nuxt/ that every other page loads. They keep their URLs. */
export const SHARED_FONTS = Object.freeze(['_nuxt/TTNeorisTrialRegular.CykOY4gR.ttf', '_nuxt/fonnts.com-theseasons-it.CUCq9ttA.otf']);

/**
 * Whether a path under public/ is copied into the site: everything except the retired
 * runtime above and the captured runtime's scripts and styles in _nuxt/ (its fonts stay).
 * @param {string} file posix path relative to public/ ('' is public/ itself)
 */
export function shipsFromPublic(file) {
  if (RETIRED_PUBLIC.some(path => file === path || file.startsWith(`${path}/`))) return false;
  return !/^_nuxt\/[^/]+\.(?:js|css)$/.test(file);
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Marks a page that already has the index, so a second run changes nothing. */
const MARK = `id="${HOME_INDEX_ID}"`;

/**
 * Feed autodiscovery, as every other page has it (site/pages.mjs): a reader given the
 * homepage's address finds the blog's RSS feed.
 */
export const HOME_FEED_LINK = `<link rel="alternate" type="application/rss+xml" title="${escape(FEED_TITLE)}" href="${escape(FEED_PATH)}">\n`;

/**
 * The index's look, in the release's own tokens (app/assets/css/home.css), with fallbacks
 * in case that stylesheet does not load. It sits above the fixed scene and the story frames.
 */
export const HOME_INDEX_STYLE = `<style id="home-index-style">
#home-index{position:relative;z-index:2;box-sizing:border-box;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr));gap:2.5rem 2rem;margin:0;padding:4.5rem var(--gx,1.25rem) 4rem;border-top:1px solid var(--line,#2d2b34);background:var(--night,#100f15);color:var(--ink,#ece9e1);font:400 1rem/1.45 var(--serif,Georgia,serif)}
#home-index .home-index-label{margin:0 0 .9rem;color:var(--muted,#a8a398);font:400 .6875rem/1.4 var(--mono,ui-monospace,monospace);letter-spacing:.22em;text-transform:uppercase}
#home-index ul{display:grid;gap:.5rem;margin:0;padding:0;list-style:none}
#home-index a{color:inherit;text-decoration:none;overflow-wrap:anywhere}
#home-index a:hover,#home-index a[aria-current]{color:var(--accent,#e8743b)}
#home-index a:focus-visible{outline:2px solid var(--accent,#e8743b);outline-offset:3px}
#home-index .home-index-n{margin-right:.65em;color:var(--muted,#a8a398);font:400 .6875rem/1 var(--mono,ui-monospace,monospace);letter-spacing:.16em}
#home-index .home-index-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media print{#home-index{background:none;color:#000}}
</style>
`;

/**
 * Every destination of the site index as one nav, a column per group. The current page is marked;
 * links that leave the site open a new tab and say so. An unlisted page stops the build.
 * @param {{ group: string, items: { title: string, href: string, label?: string, external?: boolean }[] }[]} groups siteIndex()
 * @param {string} path the page it goes on, '/' or '/contacts/'
 */
export function homeIndex(groups, path) {
  const columns = groups.map(({ group, items }) => {
    const id = `home-index-${slug(group)}`;
    const rows = items.map(item => {
      if (isUnlisted(item.href)) throw new Error(`Home index must not list the unlisted page ${item.href}`);
      const current = item.href === path ? ' aria-current="page"' : '';
      const away = item.external ? ' target="_blank" rel="noopener noreferrer"' : '';
      const number = item.label ? `<span class="home-index-n" aria-hidden="true">${escape(item.label)}</span>` : '';
      const note = item.external ? '<span aria-hidden="true"> ↗</span><span class="home-index-sr"> (opens in a new tab)</span>' : '';
      return `<li><a href="${escape(item.href)}"${current}${away}>${number}${escape(item.title)}${note}</a></li>`;
    }).join('');
    return `<div class="home-index-group"><p class="home-index-label" id="${id}">${escape(group)}</p><ul aria-labelledby="${id}">${rows}</ul></div>`;
  }).join('\n');
  return `<nav id="${HOME_INDEX_ID}" aria-label="Site index">\n${columns}\n</nav>\n`;
}

/**
 * Adds the index once: the feed link and the index's style before </head>, the nav just before </body>, after the
 * Nuxt root (#__home) and its teleports, so the app's markup and hydration are untouched.
 * @param {string} html one of the two release pages
 * @param {Parameters<typeof homeIndex>[0]} groups
 * @param {string} path
 */
export function withHomeIndex(html, groups, path) {
  if (html.includes(MARK)) return html;
  const head = html.search(/<\/head\s*>/i);
  const body = html.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i);
  const root = html.indexOf('id="__home"');
  if (head < 0 || body < 0 || body < root) throw new Error('home: page has no </head> or no </body> after #__home');
  return html.slice(0, head) + HOME_FEED_LINK + HOME_INDEX_STYLE + html.slice(head, body) + homeIndex(groups, path) + html.slice(body);
}

/**
 * @param {string} output the site output folder, e.g. 'dist'
 * @param {{ index?: Parameters<typeof homeIndex>[0] }} [options] index: the site index (siteIndex()) to add to both pages; without it the copy is byte-identical to release/
 * @returns {Promise<string[]>} the files written, relative to output
 */
export async function buildHome(output, { index } = {}) {
  const stamp = await checkRelease();
  const root = resolve(output);
  for (const { file } of stamp.files) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await copyFile(join(RELEASE_DIR, file), join(root, file));
  }
  if (index) {
    for (const [path] of Object.entries(HOME_PAGES)) {
      const file = join(root, `${path.slice(1)}index.html`);
      await writeFile(file, withHomeIndex(await readFile(file, 'utf8'), index, path));
    }
  }
  return stamp.files.map(entry => entry.file);
}
