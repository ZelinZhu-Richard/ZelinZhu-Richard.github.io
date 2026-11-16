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
or a slug used twice. New posts are added to the sitemap and the homepage Blog panel automatically.

| File | What it is |
| --- | --- |
| `posts.mjs` | The posts. Ships empty, so `/blog/` says the first posts are on the way. |
| `page.mjs` | Renders the index and post bodies; `site/pages.mjs` wraps them in the site frame. |
| `style.css` | Blog styles, copied to `dist/blog/` by `build.mjs`. |
