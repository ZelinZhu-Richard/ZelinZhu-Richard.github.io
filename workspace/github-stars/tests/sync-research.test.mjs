import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncResearch, normalizeResearch } from '../scripts/sync-research.mjs';

const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const raw=id=>({id,name:`repo-${id}`,full_name:`owner/repo-${id}`,html_url:`https://github.com/owner/repo-${id}`,private:false,description:'Research tool',language:'Python',topics:['research'],stargazers_count:10,forks_count:2,archived:false,pushed_at:'2026-10-25T00:00:00Z'});
const definition=id=>({repo_id:id,full_name:`owner/repo-${id}`,type:'library',category:'research',folders:['general/read-papers'],note:'A test research tool.'});
const response=repo=>({ok:true,status:200,json:async()=>repo});
async function fixture(t,essentials=[definition(1),definition(2)]) {
  const directory=await mkdtemp(resolve(base,'.sync-test-research-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const outputPath=resolve(directory,'research-essentials.json');
  const manifestPath=resolve(directory,'research-stack.json');
  const manifest={version:1,folders:[{id:'',parent:null},{id:'general',parent:''},{id:'general/read-papers',parent:'general'}],members:[],essentials};
  const manifestText=JSON.stringify(manifest,null,2)+'\n';
  await writeFile(manifestPath,manifestText);
  await writeFile(outputPath,'previous cache');
  return{directory,outputPath,manifestPath,manifestText};
}

test('research refresh uses stable IDs, writes complete cache, and leaves folder manifest untouched',async t=>{
  const paths=await fixture(t);
  const urls=[];
  const fetchImpl=async url=>{urls.push(url.href);return response(raw(Number(url.pathname.split('/').at(-1))));};
  const result=await syncResearch({...paths,fetchImpl});
  assert.deepEqual(urls,['https://api.github.com/repositories/1','https://api.github.com/repositories/2']);
  assert.deepEqual(result.repos.map(repo=>repo.id),[1,2]);
  assert.ok(result.repos.every(repo=>repo.starred_at===null));
  assert.deepEqual(JSON.parse(await readFile(paths.outputPath,'utf8')),result);
  assert.equal(await readFile(paths.manifestPath,'utf8'),paths.manifestText);
  assert.ok(!(await readdir(paths.directory)).some(name=>name.endsWith('.tmp')));
});

test('a failed later research request never replaces the previous cache',async t=>{
  const paths=await fixture(t);
  let requests=0;
  const fetchImpl=async()=>++requests===1?response(raw(1)):{ok:false,status:403};
  await assert.rejects(syncResearch({...paths,fetchImpl}),/403/);
  assert.equal(await readFile(paths.outputPath,'utf8'),'previous cache');
  assert.equal(await readFile(paths.manifestPath,'utf8'),paths.manifestText);
});

test('malformed, private, or mismatched metadata cannot replace the previous cache',async t=>{
  const paths=await fixture(t,[definition(1)]);
  for(const invalid of [{...raw(1),html_url:'https://example.com/owner/repo-1'},{...raw(1),private:true},{...raw(1),id:2},{...raw(1),stargazers_count:-1},{...raw(1),topics:'research'}]) {
    await assert.rejects(syncResearch({...paths,fetchImpl:async()=>response(invalid)}),/invalid or mismatched/);
    assert.equal(await readFile(paths.outputPath,'utf8'),'previous cache');
  }
  await assert.rejects(syncResearch({...paths,fetchImpl:async()=>({ok:true,url:'https://example.com/repositories/1',json:async()=>raw(1)})}),/untrusted/);
});

test('duplicate essentials and unknown folder memberships fail before networking',async t=>{
  for(const essentials of [[definition(1),definition(1)],[{...definition(1),folders:['missing']}],[{...definition(1),type:'missing'}]]) {
    const paths=await fixture(t,essentials);
    let called=false;
    await assert.rejects(syncResearch({...paths,fetchImpl:async()=>{called=true;return response(raw(1));}}),/invalid or duplicate/);
    assert.equal(called,false);
    assert.equal(await readFile(paths.outputPath,'utf8'),'previous cache');
  }
});

test('a repository rename keeps its stable identity and cached canonical URL',()=>{
  const renamed={...raw(1),full_name:'new-owner/new-name',name:'new-name',html_url:'https://github.com/new-owner/new-name'};
  const result=normalizeResearch(renamed,definition(1));
  assert.equal(result.id,1);
  assert.equal(result.full_name,'new-owner/new-name');
  assert.equal(result.url,'https://github.com/new-owner/new-name');
});
