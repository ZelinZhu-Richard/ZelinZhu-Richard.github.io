// /blog/ index and /blog/<slug>/ post bodies. site/pages.mjs wraps them in the site frame.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' -> 'Nov 12, 2026', by splitting the string (never through Date). */
export const formatDate = iso => {
  const [year, month, day] = iso.split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
};

/** Throws on a post the site can't publish. Returns the posts newest first. */
export function checkPosts(posts) {
  const seen = new Set();
  for (const post of posts) {
    for (const key of ['slug', 'title', 'date', 'summary', 'body']) if (!post[key]) throw new Error(`Blog post ${post.slug || '?'} is missing ${key}`);
    if (!SLUG.test(post.slug)) throw new Error(`Blog slug "${post.slug}" must be lowercase letters, digits and hyphens`);
    if (!DATE.test(post.date)) throw new Error(`Blog post ${post.slug} date must be YYYY-MM-DD`);
    if (seen.has(post.slug)) throw new Error(`Blog slug "${post.slug}" is used twice`);
    seen.add(post.slug);
  }
  return [...posts].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export const postPath = post => `/blog/${post.slug}/`;

export function blogIndex(posts) {
  const list = checkPosts(posts);
  const rows = list.length
    ? `<ol class="blog-list">${list.map(p => `<li>
<time datetime="${p.date}">${formatDate(p.date)}</time>
<div><h2><a href="${postPath(p)}">${escape(p.title)}</a></h2><p>${escape(p.summary)}</p></div>
</li>`).join('')}</ol>`
    : '<p class="blog-empty">No posts yet. The first ones are on the way.</p>';
  return `<section class="page-intro">
<p class="eyebrow">Blog</p>
<h1>Blog</h1>
<p class="lede">Notes on what I’m building and learning, written as I go.</p>
</section>
<section class="blog" aria-label="Posts">${rows}</section>`;
}

export function blogPost(post) {
  return `<article class="blog-post">
<header class="page-intro">
<p class="eyebrow"><a href="/blog/">Blog</a> · <time datetime="${post.date}">${formatDate(post.date)}</time></p>
<h1>${escape(post.title)}</h1>
<p class="lede">${escape(post.summary)}</p>
</header>
<div class="blog-body">${post.body}</div>
<p class="blog-back"><a href="/blog/">← All posts</a></p>
</article>`;
}
