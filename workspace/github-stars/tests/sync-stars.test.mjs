import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncStars, normalize } from '../scripts/sync-stars.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = (id) => ({starred_at:'2026-10-25T00:00:00Z',repo:{id,name:`repo-${id}`,full_name:`owner/repo-${id}`,html_url:`https://github.com/owner/repo-${id}`,description:'A test library',topics:[],stargazers_count:4,forks_count:2,archived:false,pushed_at:'2026-10-24T00:00:00Z'}});
const response = (items, link=null) => ({ok:true,status:200,json:async()=>items,headers:new Headers(link?{link}:{})});

async function fixture(t) {
  const dir = await mkdtemp(resolve(base,'.sync-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const outputPath=resolve(dir,'stars.json');
  const classificationsPath=resolve(dir,'classifications.json');
  await writeFile(classificationsPath,JSON.stringify({'owner/repo-1':{category:'quant',type:'library'}}));
  await writeFile(outputPath,'preserved catalog');
  return {outputPath,classificationsPath};
}

test('sync follows pagination, keeps reviewed classifications, and publishes only a complete catalog',async t=>{
  const paths=await fixture(t);
  let calls=0;
  const fetchImpl=async()=>++calls===1?response([entry(1)],'<https://api.github.com/user/123/starred?per_page=100&page=2>; rel="next"'):response([entry(2)]);
  const result=await syncStars({...paths,fetchImpl});
  assert.equal(calls,2);
  assert.equal(result.total,2);
  assert.equal(result.complete,true);
  assert.equal(result.repos.find(r=>r.id===1).category,'quant');
  assert.deepEqual(JSON.parse(await readFile(paths.outputPath,'utf8')),result);
});

test('a failed later page leaves the prior catalog intact',async t=>{
  const paths=await fixture(t);
  let calls=0;
  const fetchImpl=async()=>++calls===1?response([entry(1)],'<https://api.github.com/user/123/starred?per_page=100&page=2>; rel="next"'):{ok:false,status:403};
  await assert.rejects(syncStars({...paths,fetchImpl}),/403/);
  assert.equal(await readFile(paths.outputPath,'utf8'),'preserved catalog');
});

test('duplicates or untrusted pagination cannot overwrite a good catalog',async t=>{
  const paths=await fixture(t);
  const duplicateFetch=async()=>response([entry(1),entry(1)]);
  await assert.rejects(syncStars({...paths,fetchImpl:duplicateFetch}),/duplicate/);
  const untrustedFetch=async()=>response([entry(1)],'<https://example.com/starred>; rel="next"');
  await assert.rejects(syncStars({...paths,fetchImpl:untrustedFetch}),/invalid pagination/);
  assert.equal(await readFile(paths.outputPath,'utf8'),'preserved catalog');
});

test('normalization rejects broken API records and invalid reviewed labels',()=>{
  assert.throws(()=>normalize({}),/unexpected/);
  assert.throws(()=>normalize(entry(1),{'owner/repo-1':{category:'missing',type:'library'}}),/Invalid classification/);
});
