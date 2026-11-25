// Tests for the blog's RSS feed (../feed.mjs) and the file build.mjs writes from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FEED_DESCRIPTION, FEED_PATH, absoluteLinks, blogFeed, pubDate } from '../feed.mjs';
import { BLOG_FILES, buildBlog } from '../build.mjs';
import { blogIndex, blogPost } from '../page.mjs';
import { POSTS } from '../posts.mjs';

const SITE = 'https://zelinzhu-richard.github.io';
const post = (over = {}) => ({ slug: 'first-post', title: 'Tom & <Jerry>', date: '2026-11-12', summary: 'A "short" note.', body: '<p>Hello.</p>', ...over });
const CDATA = /<!\[CDATA\[([\s\S]*?)\]\]>/g;

// Node has no XML parser built in. This checks what a parser would trip on first:
// every tag closes in order, and no bare & or < is left in the text between tags.
function assertWellFormed(xml) {
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss '), 'starts with the XML declaration and the rss root');
  const markup = xml.replace(/^<\?xml[^>]*\?>/, '').replace(CDATA, '');
  const open = [];
  for (const [, closing, name, selfClosing] of markup.matchAll(/<(\/?)([\w:]+)(?:\s[^<>]*?)?(\/?)>/g)) {
    if (selfClosing) continue;
    if (closing) assert.equal(open.pop(), name, `</${name}> closes the wrong tag`);
    else open.push(name);
  }
  assert.deepEqual(open, [], 'every tag is closed');
  const text = markup.replace(/<[^<>]*>/g, '');
  assert.doesNotMatch(text, /[<>]/, 'no stray angle brackets');
  assert.doesNotMatch(text, /&(?!(?:amp|lt|gt|quot|#39);)/, 'no bare ampersand');
  assert.doesNotMatch(xml, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/, 'no character XML 1.0 forbids');
}

const tag = (xml, name) => [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g'))].map(m => m[1]);
// What an XML parser hands the feed reader for one element's text.
const decoded = text => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');

test('an empty blog still has a valid feed: a channel with no items', () => {
  const xml = blogFeed([]);
  assertWellFormed(xml);
  assert.match(xml, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom" xmlns:content="http:\/\/purl\.org\/rss\/1\.0\/modules\/content\/">/);
  assert.deepEqual(tag(xml, 'title'), ['Richard Zhu — Blog']);
  assert.deepEqual(tag(xml, 'link'), [`${SITE}/blog/`]);
  assert.deepEqual(tag(xml, 'description'), ['Notes on what I’m building and learning, written as I go.']);
  assert.deepEqual(tag(xml, 'language'), ['en']);
  assert.match(xml, new RegExp(`<atom:link href="${SITE}/blog/feed\\.xml" rel="self" type="application/rss\\+xml"/>`));
  assert.doesNotMatch(xml, /<item>/);
  assert.doesNotMatch(xml, /lastBuildDate/);
  assert.ok(xml.endsWith('</channel>\n</rss>\n'));
});

test('the shipped posts make a well-formed feed', () => {
  assertWellFormed(blogFeed(POSTS));
});

test('items are newest first, with absolute links and escaped text', () => {
  const xml = blogFeed([post({ slug: 'older', title: 'Older', date: '2026-01-02' }), post()]);
  assertWellFormed(xml);
  const items = tag(xml, 'item');
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(i => tag(i, 'link')[0]), [`${SITE}/blog/first-post/`, `${SITE}/blog/older/`]);
  assert.match(items[0], new RegExp(`<guid isPermaLink="true">${SITE}/blog/first-post/</guid>`));
  assert.deepEqual(tag(items[0], 'title'), ['Tom &amp; &lt;Jerry&gt;']);
  assert.deepEqual(tag(items[0], 'description'), ['A &quot;short&quot; note.']);
  assert.deepEqual(tag(items[0], 'content:encoded'), ['<![CDATA[<p>Hello.</p>]]>']);
});

test('dates are RFC 822 at noon UTC with the right weekday', () => {
  assert.equal(pubDate('2026-11-12'), 'Thu, 12 Nov 2026 12:00:00 GMT');
  assert.equal(pubDate('2026-01-02'), 'Fri, 02 Jan 2026 12:00:00 GMT');
  assert.equal(pubDate('2024-02-29'), 'Thu, 29 Feb 2024 12:00:00 GMT');
  const xml = blogFeed([post({ slug: 'older', date: '2026-01-02' }), post()]);
  assert.deepEqual(tag(xml, 'pubDate'), ['Thu, 12 Nov 2026 12:00:00 GMT', 'Fri, 02 Jan 2026 12:00:00 GMT']);
  assert.deepEqual(tag(xml, 'lastBuildDate'), ['Thu, 12 Nov 2026 12:00:00 GMT'], 'the newest post, not the build time');
});

test('a date that is not a real day fails the build', () => {
  assert.throws(() => blogFeed([post({ date: '2026-02-31' })]), /not a real day/);
  assert.throws(() => pubDate('2026-13-01'), /not a real day/);
  assert.throws(() => pubDate('2026-00-10'), /not a real day/);
});

test('root-relative links and images in the body are made absolute; other URLs are left alone', () => {
  const body = '<p><a href="/blog/older/">Older</a> <img src=\'/video/poster.jpg\' alt=""> <a href="https://example.com/a">out</a> <a href="//cdn.example.com/x">cdn</a> <a href="#notes">notes</a> <a href="next/">next</a></p>';
  assert.equal(absoluteLinks(body), `<p><a href="${SITE}/blog/older/">Older</a> <img src='${SITE}/video/poster.jpg' alt=""> <a href="https://example.com/a">out</a> <a href="//cdn.example.com/x">cdn</a> <a href="#notes">notes</a> <a href="next/">next</a></p>`);
  const xml = blogFeed([post({ body })]);
  assert.ok(xml.includes(`<a href="${SITE}/blog/older/">Older</a>`));
  assert.ok(xml.includes(`<img src='${SITE}/video/poster.jpg' alt="">`));
  assert.doesNotMatch(xml, /(?:href|src)=["']\/[^/]/);
});

test('only quoted attributes inside a tag are rewritten, never the text of the post', () => {
  const sample = '<pre><code>&lt;a href="/blog/"&gt; or write src="/x.png" by hand</code></pre>';
  assert.equal(absoluteLinks(sample), sample, 'a code sample keeps its text');
  assert.equal(absoluteLinks('<img alt=\'say href="/x"\' src="/a.jpg">'), `<img alt='say href="/x"' src="${SITE}/a.jpg">`);
  assert.equal(absoluteLinks('<a title="a > b" href="/y">y</a>'), `<a title="a > b" href="${SITE}/y">y</a>`);
  assert.equal(absoluteLinks('<A HREF = "/z" data-src="/q"\nclass="k">z</A>'), `<A HREF = "${SITE}/z" data-src="/q"\nclass="k">z</A>`);
  assert.equal(absoluteLinks('<a href="/">home</a>'), `<a href="${SITE}/">home</a>`);
  assert.equal(absoluteLinks('<p>1 < 2, "/a" > "/b"</p>'), '<p>1 < 2, "/a" > "/b"</p>');
});

test('poster and srcset are made absolute too, so pictures do not break in a reader', () => {
  assert.equal(
    absoluteLinks('<img src="/a.jpg" srcset="/a.jpg 1x, /b.jpg 2x,https://example.com/c.jpg 3x, //cdn.example.com/d.jpg 4x">'),
    `<img src="${SITE}/a.jpg" srcset="${SITE}/a.jpg 1x, ${SITE}/b.jpg 2x,https://example.com/c.jpg 3x, //cdn.example.com/d.jpg 4x">`,
  );
  assert.equal(
    absoluteLinks('<video poster="/p.jpg" controls><source src="/v.mp4" type="video/mp4"></video>'),
    `<video poster="${SITE}/p.jpg" controls><source src="${SITE}/v.mp4" type="video/mp4"></video>`,
  );
});

test('a summary is plain text: a reader shows it as written, even when it names a tag', () => {
  const xml = blogFeed([post({ summary: 'Why the <details> tag beats my script & other notes' })]);
  assertWellFormed(xml);
  const [description] = tag(tag(xml, 'item')[0], 'description');
  assert.equal(decoded(description), 'Why the &lt;details&gt; tag beats my script &amp; other notes', 'the reader gets HTML that spells the text out');
});

test('control characters XML cannot carry are dropped instead of breaking the feed', () => {
  const xml = blogFeed([post({ title: 'Form\u000Bfeed', summary: 'A\u0001B', body: '<p>tab\there\u0000 and\nnewline\uFFFF</p>' })]);
  assertWellFormed(xml);
  assert.deepEqual(tag(tag(xml, 'item')[0], 'title'), ['Formfeed']);
  assert.deepEqual(tag(tag(xml, 'item')[0], 'description'), ['AB']);
  assert.ok(xml.includes('<![CDATA[<p>tab\there and\nnewline</p>]]>'));
});

test('a "]]>" inside a body does not end the CDATA section early', () => {
  const body = '<p>if (a[b[0]]>1) { stop(); }</p><p>Still the post & <b>more</b>.</p>';
  const xml = blogFeed([post({ body })]);
  assertWellFormed(xml);
  const [encoded] = tag(xml, 'content:encoded');
  assert.equal(encoded.replace(CDATA, ''), '', 'nothing spills out between the sections');
  assert.equal([...encoded.matchAll(CDATA)].map(m => m[1]).join(''), body, 'a reader joins the sections back into the body');
});

test('the same posts always give the same bytes', () => {
  const posts = [post({ slug: 'older', date: '2026-01-02' }), post()];
  assert.equal(blogFeed(posts), blogFeed([...posts].reverse()));
  assert.equal(blogFeed(posts), blogFeed(posts));
  assert.equal(blogFeed([]), blogFeed([]));
});

test('unpublishable posts fail the feed the same way they fail the pages', () => {
  assert.throws(() => blogFeed([post({ slug: 'Has Spaces' })]), /slug/);
  assert.throws(() => blogFeed([post(), post()]), /twice/);
});

test('the pages link to the address the feed is written at, and share its description', () => {
  assert.equal(FEED_PATH, '/blog/feed.xml');
  assert.ok(blogIndex([]).includes(`<p class="blog-feed"><a href="${FEED_PATH}">RSS feed</a></p>`));
  assert.ok(blogPost(post()).includes(`<a href="${FEED_PATH}">RSS feed</a>`));
  assert.ok(blogIndex([]).includes(FEED_DESCRIPTION));
});

test('the build writes feed.xml next to the stylesheet', async t => {
  const output = await mkdtemp(join(tmpdir(), 'blog-feed-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  await buildBlog(output);
  assert.deepEqual((await readdir(join(output, 'blog'))).sort(), [...BLOG_FILES, 'feed.xml'].sort());
  const xml = await readFile(join(output, 'blog', 'feed.xml'), 'utf8');
  assert.equal(xml, blogFeed(POSTS));
  assertWellFormed(xml);
  await buildBlog(output);
  assert.equal(await readFile(join(output, 'blog', 'feed.xml'), 'utf8'), xml, 'a second build writes the same bytes');
});
