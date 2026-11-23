// RSS 2.0 feed for the blog. build.mjs writes it to /blog/feed.xml.
// The same posts always give the same bytes: nothing here reads the clock.
import { checkPosts, postPath } from './page.mjs';

export const FEED_PATH = '/blog/feed.xml';
export const FEED_TITLE = 'Richard Zhu — Blog';
export const FEED_DESCRIPTION = 'Notes on what I’m building and learning, written as I go.';

const ORIGIN = 'https://zelinzhu-richard.github.io';
// XML 1.0 cannot carry these control characters, escaped or not. One of them makes a reader reject the whole feed.
const clean = value => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
const escape = value => clean(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Readers show <description> as HTML, so a plain summary is written as HTML first: "the <details> tag" must not turn into a tag.
const textAsHtml = text => String(text).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** 'YYYY-MM-DD' -> 'Thu, 12 Nov 2026 12:00:00 GMT'. Noon UTC is the same calendar day in nearly every time zone. */
export function pubDate(iso) {
  const [year, month, day] = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  // Date.UTC rolls Feb 31 over to March; the page would still print Feb 31, so stop instead of disagreeing.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) throw new Error(`Blog date ${iso} is not a real day`);
  return date.toUTCString();
}

const TAG = /<[a-zA-Z](?:[^<>"']|"[^"]*"|'[^']*')*>/g;
const ATTRIBUTE = /([^\s"'<>/=]+)(\s*=\s*)("[^"]*"|'[^']*')/g;
// The leading "/" of a root-relative URL ("//cdn.example.com" is another host). srcset holds a comma-separated list of them.
const ROOT = /(?<=^\s*)\/(?!\/)/;
const ROOT_IN_LIST = /(?<=^\s*|,\s*)\/(?!\/)/g;
const URL_ATTRIBUTES = new Map([['href', ROOT], ['src', ROOT], ['poster', ROOT], ['srcset', ROOT_IN_LIST]]);

function absoluteAttribute(all, name, equals, quoted) {
  const root = URL_ATTRIBUTES.get(name.toLowerCase());
  return root ? `${name}${equals}${quoted[0]}${quoted.slice(1, -1).replace(root, `${ORIGIN}/`)}${quoted[0]}` : all;
}

// A feed reader shows the body away from the site, where "/blog/x/" points nowhere.
// Only quoted attributes inside a tag change, so a code sample that prints href="/x" keeps its text.
export const absoluteLinks = html => String(html).replace(TAG, tag => tag.replace(ATTRIBUTE, absoluteAttribute));

// A "]]>" in the body would end the section early, so it is split across two sections.
const cdata = text => `<![CDATA[${clean(text).replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;

function item(post) {
  const url = escape(ORIGIN + postPath(post));
  return `<item>
<title>${escape(post.title)}</title>
<link>${url}</link>
<guid isPermaLink="true">${url}</guid>
<pubDate>${pubDate(post.date)}</pubDate>
<description>${escape(textAsHtml(post.summary))}</description>
<content:encoded>${cdata(absoluteLinks(post.body))}</content:encoded>
</item>
`;
}

export function blogFeed(posts) {
  const list = checkPosts(posts);
  const built = list.length ? `<lastBuildDate>${pubDate(list[0].date)}</lastBuildDate>\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>${escape(FEED_TITLE)}</title>
<link>${ORIGIN}/blog/</link>
<description>${escape(FEED_DESCRIPTION)}</description>
<language>en</language>
${built}<atom:link href="${ORIGIN}${FEED_PATH}" rel="self" type="application/rss+xml"/>
${list.map(item).join('')}</channel>
</rss>
`;
}
