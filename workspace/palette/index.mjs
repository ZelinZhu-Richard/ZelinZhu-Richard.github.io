// One list of everything a visitor can open. The command palette, the footer index and the
// Colophon page's "Everything here" list all read it, so the three never disagree.
// Only pages that the public site already links belong here: never /choices/, /duke/, /hq/
// or any other unlisted page (workspace/palette/tests/index.test.mjs checks).
import { PARTS } from '../stones/parts.mjs';
import { LINKS, PROJECTS, PUBLICATIONS } from '../../site/content.mjs';
import { POSTS } from '../blog/posts.mjs';
import { checkPosts, formatDate, postPath } from '../blog/page.mjs';

const num = i => String(i + 1).padStart(2, '0');

/** Groups in display order. Each item: { title, hint, href, label?, keywords?, external? }. */
export function siteIndex() {
  const research = PROJECTS.filter(p => p.group === 'research');
  // Daily is a section already; the other on-site experiments open their own page.
  const experiments = PROJECTS.filter(p => p.group === 'site' && p.id !== 'daily');
  const posts = checkPosts(POSTS);
  return [
    {
      group: 'Sections',
      items: PARTS.map((part, i) => ({ title: part.title, hint: part.subtitle, href: part.href, label: num(i) })),
    },
    {
      group: 'Projects',
      items: research.map(p => ({ title: p.name, hint: p.oneLiner, href: `/projects/#${p.id}`, keywords: [p.stack, ...p.tags].join(' ') })),
    },
    {
      group: 'In the browser',
      items: [
        ...experiments.map(p => ({ title: p.name, hint: p.oneLiner, href: p.live, keywords: [p.stack, ...p.tags].join(' ') })),
        { title: 'Flash', hint: 'Design a holographic foil card and download it.', href: '/flash/', keywords: 'card maker holographic foil' },
        { title: 'Living portrait', hint: 'A photo of me that redraws itself in six code styles.', href: '/art/#portrait', keywords: 'ascii pixel halftone selfie' },
      ],
    },
    {
      group: 'Research',
      items: [
        ...PUBLICATIONS.map(p => ({ title: p.title, hint: `${p.venue} · ${p.kind}`, href: p.href, external: true, keywords: `paper poster publication ${p.authors}` })),
        { title: 'Research Stack', hint: 'Research tools I keep, in folders by workflow and field.', href: '/github/stars/research/', keywords: 'papers tools machine learning finance econometrics' },
      ],
    },
    {
      group: 'Writing',
      items: [
        ...posts.map(p => ({ title: p.title, hint: `${formatDate(p.date)} · ${p.summary}`, href: postPath(p) })),
        { title: 'RSS feed', hint: 'New blog posts, delivered to a feed reader.', href: '/blog/feed.xml', keywords: 'subscribe atom rss' },
      ],
    },
    {
      group: 'More',
      items: [
        { title: 'All work', hint: 'Every project on one page.', href: '/work/', keywords: 'projects portfolio' },
        { title: 'Skills', hint: 'Agent skills I use and the ones I write.', href: '/skills/', keywords: 'claude codex agents' },
        { title: 'GitHub stars', hint: 'Repositories I have starred, sorted by type and purpose.', href: '/github/stars/', keywords: 'repos bookmarks library' },
        { title: 'Colophon', hint: 'How this site is made, and a list of everything on it.', href: '/colophon/', keywords: 'about this site credits fonts build' },
        { title: 'Contact', hint: 'Email, GitHub, LinkedIn and X.', href: '/contacts/', keywords: 'email reach' },
        { title: 'CV', hint: 'My CV as a PDF.', href: LINKS.resume, keywords: 'resume pdf' },
        { title: 'Homepage', hint: 'The phoenix scene. Heavy: it loads a 3D model and audio.', href: '/', keywords: 'home phoenix landing' },
      ],
    },
    {
      group: 'Elsewhere',
      items: [
        { title: 'GitHub', hint: 'ZelinZhu-Richard', href: LINKS.github, external: true, keywords: 'code source' },
        { title: 'LinkedIn', hint: 'zelin-zhu', href: LINKS.linkedin, external: true },
        { title: 'X', hint: '@zzl_richard', href: LINKS.x, external: true, keywords: 'twitter' },
        { title: 'Email', hint: LINKS.email, href: `mailto:${LINKS.email}`, keywords: 'mail contact write' },
      ],
    },
  ];
}

/** One group's items by name; throws on a name that does not exist, so a typo fails the build. */
export function indexGroup(name) {
  const found = siteIndex().find(g => g.group === name);
  if (!found) throw new Error(`Site index has no group "${name}"`);
  return found.items;
}

/** One item by its href; throws when it is missing. */
export function indexItem(href) {
  for (const g of siteIndex()) for (const item of g.items) if (item.href === href) return item;
  throw new Error(`Site index has no item for ${href}`);
}
