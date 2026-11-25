# Blog

`/blog/` lists posts newest first; each post has its own page at `/blog/<slug>/`.

## Add a post

Add an object to `POSTS` in `posts.mjs`:

```js
{
  slug: 'first-post',          // lowercase letters, digits, hyphens
  title: 'My first post',
  date: '2026-11-12',          // YYYY-MM-DD
  summary: 'One sentence shown in the list and in link previews.',
  body: '<p>The post, as HTML.</p>',
}
```

Then run `npm test` and `npm run build`. The build fails on a missing field, a bad slug or date,
or a slug used twice. New posts are added to the sitemap, the feed and the homepage Blog panel automatically.

## Feed

`/blog/feed.xml` is an RSS 2.0 feed of every post, newest first, with the full post body. The build
writes it from `posts.mjs`, so there is nothing to edit by hand. The index and each post page link to it.

- With no posts it is a channel with no items. A reader can subscribe now and get the first post when it lands.
- Each post is dated noon UTC on its `date`. `lastBuildDate` is the newest post's date, not the build
  time, so a rebuild without a new post writes the same file.
- A feed reader shows a post away from the site, so quoted `href`, `src`, `poster` and `srcset` values
  that start with `/` are rewritten to full URLs inside tags. Page-relative links such as `href="next/"`
  are left as written: write those in full.
- `summary` is plain text. The feed writes it as escaped HTML, so `<` and `&` reach the reader as typed.
- A date that is not a real day, such as `2026-02-31`, fails the build.

| File | What it is |
| --- | --- |
| `posts.mjs` | The posts. Ships empty, so `/blog/` says the first posts are on the way. |
| `page.mjs` | Renders the index and post bodies; `site/pages.mjs` wraps them in the site frame. |
| `feed.mjs` | Builds the RSS feed as a string. No clock: the same posts give the same bytes. |
| `style.css` | Blog styles. |
| `build.mjs` | Copies `style.css` and writes `feed.xml` to `dist/blog/`. |
