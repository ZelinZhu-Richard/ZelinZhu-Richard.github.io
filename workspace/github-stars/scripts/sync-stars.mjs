#!/usr/bin/env node
import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { USERNAME, categories, types, classify } from './catalog.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(base, 'data/stars.json');
const overridesPath = resolve(base, 'data/classifications.json');
const categoryIds = new Set(categories.map(x => x.id));
const typeIds = new Set(types.map(x => x.id));

export function normalize(entry, overrides = {}) {
  const r = entry?.repo;
  if (!r || !Number.isSafeInteger(r.id) || typeof r.full_name !== 'string' ||
      !/^https:\/\/github\.com\//.test(r.html_url) || typeof entry.starred_at !== 'string') {
    throw new Error('GitHub returned an unexpected starred repository record.');
  }
  const repo = {
    id: r.id, full_name: r.full_name, name: r.name,
    description: r.description ?? '', url: r.html_url,
    language: r.language ?? null, topics: Array.isArray(r.topics) ? r.topics : [],
    stars: r.stargazers_count ?? 0, forks: r.forks_count ?? 0,
    archived: Boolean(r.archived), pushed_at: r.pushed_at,
    starred_at: entry.starred_at,
  };
  const choice = overrides[r.full_name] ?? classify(repo);
  if (!categoryIds.has(choice.category) || !typeIds.has(choice.type)) {
    throw new Error(`Invalid classification for ${r.full_name}.`);
  }
  return { ...repo, category: choice.category, type: choice.type };
}

export async function syncStars({ fetchImpl = fetch, outputPath = target, classificationsPath = overridesPath } = {}) {
  const overrides = JSON.parse(await readFile(classificationsPath, 'utf8'));
  const headers = {
    Accept: 'application/vnd.github.star+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': `${USERNAME}-stars-catalog`,
  };
  // An optional local/CI token increases GitHub's request limit. It is never
  // persisted in the catalog, URL, logs, or browser assets.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let next = `https://api.github.com/users/${USERNAME}/starred?per_page=100`;
  const repos = new Map();
  const visited = new Set();
  let pages = 0;
  while (next) {
    const url = new URL(next);
    if (url.origin !== 'https://api.github.com' ||
        !/^\/(?:users\/[^/]+|user\/\d+)\/starred$/.test(url.pathname) || visited.has(next)) {
      throw new Error('GitHub returned an invalid pagination link. Existing catalog preserved.');
    }
    visited.add(next);
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(`GitHub request failed (${response.status}). Existing catalog preserved; retry later or set GITHUB_TOKEN locally.`);
    }
    const entries = await response.json();
    if (!Array.isArray(entries)) throw new Error('Expected a GitHub stars array. Existing catalog preserved.');
    for (const entry of entries) {
      const repo = normalize(entry, overrides);
      if (repos.has(repo.id)) throw new Error('Stars changed while paging; duplicate repository detected. Existing catalog preserved; retry.');
      repos.set(repo.id, repo);
    }
    pages += 1;
    next = response.headers.get('link')?.match(/<([^>]+)>; rel="next"/)?.[1] ?? null;
    if (next && !entries.length) throw new Error('Unexpected empty page. Existing catalog preserved.');
    if (pages > 1000) throw new Error('Unexpected pagination length. Existing catalog preserved.');
  }
  const catalog = {
    username: USERNAME,
    fetched_at: new Date().toISOString(),
    source: `https://github.com/${USERNAME}?tab=stars`,
    complete: true,
    total: repos.size,
    categories, types,
    repos: [...repos.values()].sort((a,b) => b.starred_at.localeCompare(a.starred_at) || a.full_name.localeCompare(b.full_name, 'en')),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  const temp = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(catalog, null, 2)}\n`, { flag: 'wx' });
    await rename(temp, outputPath);
  } finally { await unlink(temp).catch(() => {}); }
  console.log(`Saved ${catalog.total} public starred repositories from ${pages} pages.`);
  const fallback = catalog.repos.filter(r => !overrides[r.full_name]);
  if (fallback.length) console.log(`${fallback.length} new repositories used metadata-based classification; review data/classifications.json to refine their piles.`);
  return catalog;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncStars().catch(error => { console.error(error.message); process.exitCode = 1; });
}
