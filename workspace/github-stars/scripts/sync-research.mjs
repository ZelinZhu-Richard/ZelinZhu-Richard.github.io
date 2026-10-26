#!/usr/bin/env node
import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { categories, types } from './catalog.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(base, 'data/research-essentials.json');
const source = resolve(base, 'data/research-stack.json');
const categoryIds = new Set(categories.map(item => item.id));
const typeIds = new Set(types.map(item => item.id));
const repositoryName = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;

export function normalizeResearch(raw, definition) {
  const r = raw;
  let url;
  try { url = new URL(r?.html_url); } catch { /* Validation below reports one safe error. */ }
  if (!r || Array.isArray(r) || !positiveId(r.id) ||
      !repositoryName.test(r.full_name ?? '') || r.name !== r.full_name.split('/')[1] ||
      !url || url.origin !== 'https://github.com' || url.username || url.password ||
      url.pathname !== `/${r.full_name}` || url.search || url.hash ||
      r.private === true || (r.visibility && r.visibility !== 'public') ||
      (r.description != null && typeof r.description !== 'string') ||
      (r.language != null && typeof r.language !== 'string') ||
      !Array.isArray(r.topics) || !r.topics.every(topic => typeof topic === 'string') ||
      !count(r.stargazers_count) || !count(r.forks_count) || typeof r.archived !== 'boolean' ||
      (r.pushed_at !== null && !Number.isFinite(Date.parse(r.pushed_at))) ||
      !typeIds.has(definition?.type) || !categoryIds.has(definition?.category) ||
      (definition?.repo_id != null && r.id !== definition.repo_id)) {
    throw new Error('GitHub returned invalid or mismatched research repository metadata. Previous cache preserved.');
  }
  return {
    id:r.id, full_name:r.full_name, name:r.name,
    description:r.description ?? '', url:url.href,
    language:r.language ?? null, topics:r.topics,
    stars:r.stargazers_count, forks:r.forks_count, archived:r.archived,
    pushed_at:r.pushed_at, starred_at:null,
    type:definition.type, category:definition.category,
  };
}

function checkedEssentials(manifest) {
  if (!manifest || !Array.isArray(manifest.folders) || !Array.isArray(manifest.essentials)) {
    throw new Error('Research manifest must contain folders and essentials. Previous cache preserved.');
  }
  const folderIds = new Set(manifest.folders.map(folder => folder.id));
  const names = new Set();
  const ids = new Set();
  for (const item of manifest.essentials) {
    const key = item.full_name?.toLowerCase();
    if (!repositoryName.test(item.full_name ?? '') || !positiveId(item.repo_id) ||
        !typeIds.has(item.type) || !categoryIds.has(item.category) ||
        !Array.isArray(item.folders) || !item.folders.length ||
        item.folders.some(folder => !folderIds.has(folder)) ||
        new Set(item.folders).size !== item.folders.length ||
        names.has(key) || ids.has(item.repo_id)) {
      throw new Error('Research manifest contains invalid or duplicate essentials. Previous cache preserved.');
    }
    names.add(key);
    ids.add(item.repo_id);
  }
  return manifest.essentials;
}

export async function syncResearch({fetchImpl=fetch,outputPath=target,manifestPath=source}={}) {
  const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
  const definitions = checkedEssentials(manifest);
  const headers = {
    Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'richard-zhu-research-stack',
  };
  // This optional token is used only for GitHub requests, never cached or logged.
  if (process.env.GITHUB_TOKEN) headers.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
  const repos = [];
  const seen = new Set();
  for (const definition of definitions) {
    // Numeric IDs preserve identity if GitHub changes the canonical owner/name.
    const url = new URL(`https://api.github.com/repositories/${definition.repo_id}`);
    const response = await fetchImpl(url,{headers,signal:AbortSignal.timeout(30000)});
    if (!response.ok) {
      throw new Error(`GitHub research metadata request failed (${response.status}). Previous cache preserved; retry later or set GITHUB_TOKEN locally.`);
    }
    if (response.url && new URL(response.url).origin !== 'https://api.github.com') {
      throw new Error('GitHub returned an untrusted metadata URL. Previous cache preserved.');
    }
    const repo = normalizeResearch(await response.json(),definition);
    if (seen.has(repo.id)) throw new Error('Duplicate research repository metadata. Previous cache preserved.');
    seen.add(repo.id);
    repos.push(repo);
  }
  const catalog = {fetched_at:new Date().toISOString(),repos};
  await mkdir(dirname(outputPath),{recursive:true});
  const temporary = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary,`${JSON.stringify(catalog,null,2)}\n`,{flag:'wx'});
    await rename(temporary,outputPath);
  } finally { await unlink(temporary).catch(()=>{}); }
  console.log(`Saved metadata for ${repos.length} suggested research essentials. Folder memberships preserved.`);
  return catalog;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncResearch().catch(error=>{console.error(error.message);process.exitCode=1;});
}
