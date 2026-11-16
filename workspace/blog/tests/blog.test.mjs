import { test } from 'node:test';
import assert from 'node:assert/strict';
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
