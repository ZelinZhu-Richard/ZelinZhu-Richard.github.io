// Tests for the blog index and post bodies (../page.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { blogIndex, blogPost, checkPosts, formatDate, postPath } from '../page.mjs';
import { POSTS } from '../posts.mjs';

const post = (over = {}) => ({ slug: 'first-post', title: 'Tom & <Jerry>', date: '2026-11-12', summary: 'A "short" note.', body: '<p>Hello.</p>', ...over });

test('the shipped posts are publishable', () => {
  assert.doesNotThrow(() => checkPosts(POSTS));
});

test('an empty blog says so instead of showing placeholder posts', () => {
  const html = blogIndex([]);
  assert.match(html, /No posts yet/);
  assert.doesNotMatch(html, /<ol class="blog-list">/);
});

test('the index links to the RSS feed under the lede, with or without posts', () => {
  const link = '<p class="blog-feed"><a href="/blog/feed.xml">RSS feed</a></p>';
  for (const html of [blogIndex([]), blogIndex([post()])]) {
    assert.ok(html.includes(`written as I go.</p>\n${link}\n</section>`));
    assert.equal(html.split('/blog/feed.xml').length, 2, 'linked once');
  }
  assert.match(blogIndex([]), /No posts yet\. The first ones are on the way\./);
});

test('a post page offers the feed next to the link back', () => {
  assert.match(blogPost(post()), /<p class="blog-back"><a href="\/blog\/">← All posts<\/a> <span class="blog-feed"><a href="\/blog\/feed\.xml">RSS feed<\/a><\/span><\/p>/);
});

test('the feed link is styled with the site tokens, and its hover sits behind the hover media query', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.blog-feed\{[^}]*font-family:var\(--font-mono\);font-size:13px;color:var\(--muted\)/);
  assert.match(css, /\.blog-feed a\{[^}]*border-bottom:1px solid var\(--faint\)/, 'a link underline is never the divider colour');
  assert.match(css, /@media \(hover:hover\) and \(pointer:fine\)\{\.blog-feed a:hover\{color:var\(--accent\)/);
  assert.equal(css.split('.blog-feed a:hover').length, 2, 'no hover rule outside the media query');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i, 'no colour that a token covers');
});

test('posts are listed newest first with escaped titles and links to their pages', () => {
  const html = blogIndex([post({ slug: 'older', date: '2026-01-02' }), post()]);
  assert.ok(html.indexOf('/blog/first-post/') < html.indexOf('/blog/older/'));
  assert.match(html, /Tom &amp; &lt;Jerry&gt;/);
  assert.match(html, /<time datetime="2026-11-12">Nov 12, 2026<\/time>/);
  assert.doesNotMatch(html, /No posts yet/);
});

test('a post page shows its body as written and links back', () => {
  const html = blogPost(post());
  assert.match(html, /<h1>Tom &amp; &lt;Jerry&gt;<\/h1>/);
  assert.match(html, /<div class="blog-body"><p>Hello.<\/p><\/div>/);
  assert.match(html, /href="\/blog\/"/);
  assert.equal(postPath(post()), '/blog/first-post/');
});

test('bad posts fail the build', () => {
  assert.throws(() => checkPosts([post({ slug: 'Has Spaces' })]), /slug/);
  assert.throws(() => checkPosts([post({ date: 'Nov 12' })]), /date/);
  assert.throws(() => checkPosts([post({ summary: '' })]), /summary/);
  assert.throws(() => checkPosts([post(), post()]), /twice/);
});

test('dates format without time zone drift', () => {
  assert.equal(formatDate('2026-01-01'), 'Jan 1, 2026');
});
