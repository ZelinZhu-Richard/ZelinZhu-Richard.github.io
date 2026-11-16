import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,access,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {buildDukeStories,dukeRoutes} from '../build.mjs';
import {parseScript,formatBeat,stories} from '../page.mjs';
import {withSharkBackground} from '../../ascii-sharks/build.mjs';
const feature=fileURLToPath(new URL('../',import.meta.url));
const repo=resolve(feature,'../..');
const hashes=['adc6d0c9e932add4840230bf1aaa4b9d6fddb44a17ea5a90bd7b4b84ab965413','aed28705acb17b3225295647cd393fc43e0d0b0fe39c19e2735ab66a912ae757'];
test('locked scripts, all routes, exact beats, metadata, eager dimensions, project and cross-story links',async()=>{
 const out=await mkdtemp(join(feature,'.review-build-'));
 // Only the generated test fixture is removed; source and artwork are never removed.
 try{
  await buildDukeStories(out);
  for(const [n,[kind,story]]of Object.entries(stories).entries()){
   const script=await readFile(join(feature,n===0?'script-becoming-blue.md':'script-night.md'),'utf8');
   assert.equal(createHash('sha256').update(script).digest('hex'),hashes[n]);
   const page=await readFile(join(out,'duke',story.slug,'index.html'),'utf8');
   const beats=[...page.matchAll(/class="beat[^"]*"[^>]*><span>(.*?)<\/span><\/p>/g)].map(x=>x[1]);
   assert.deepEqual(beats,parseScript(script).flatMap(s=>s.beats.map(formatBeat)));
   assert.match(page,/data-ambient-background="off"/);
   assert.match(page,/<meta name="robots" content="noindex, follow">/);
   assert.match(page,new RegExp('rel="canonical" href="https://zelinzhu-richard.github.io/duke/'+story.slug+'/'));
   assert.ok(page.includes('Inspired by Nicky Case&#39;s')||page.includes("Inspired by Nicky Case's AI Safety Dance."));
   assert.match(page,/href="#start" class="replay/);
   assert.match(page,/class="motion-toggle"[^>]*hidden/);
   assert.ok(page.includes('/duke/'+stories[kind==='future'?'night':'future'].slug+'/'));
   for(const img of page.matchAll(/<img\b[^>]+>/g)){
    assert.match(img[0],/width="\d+" height="\d+"/);assert.match(img[0],/alt="/);
   }
   const injected=withSharkBackground(page);
   assert.match(injected,/\/ascii-sharks\/background.js/);assert.match(injected,/id="ascii-sharks-background"/);
   for(const match of page.matchAll(/(?:src|srcset|href)="(\/duke\/[^"#]+)"/g)){
    const path=join(out,match[1]);await access(path);
   }
  }
  const selector=await readFile(join(out,'duke/index.html'),'utf8');
  for(const path of dukeRoutes.slice(1))assert.ok(selector.includes(path));
  assert.match(selector,/<meta name="robots" content="noindex, follow">/);
  assert.match(await readFile(join(out,'duke/becoming-blue/index.html'),'utf8'),/href="\/work\/#equalvoice"/);
  const {pages}=await import(join(repo,'site/pages.mjs'));
  assert.match(pages().get('work/index.html'),/id="equalvoice"/);
  for(const html of pages().values())assert.doesNotMatch(html,/href="\/duke(?:\/|")/);
 }finally{const {rm}=await import('node:fs/promises');await rm(out,{recursive:true,force:true});}
});
test('every shipped raster has provenance; no external reference photos ship',async()=>{
 const manifest=JSON.parse(await readFile(join(feature,'assets/manifest.json'),'utf8'));
 for(const key of Object.keys(manifest)){
  await access(join(feature,'assets',key+'.webp'));
  const meta=JSON.parse(await readFile(join(feature,'assets',key+'.webp.json'),'utf8'));assert.ok(meta.prompt.length>60);
 }
 const files=await readdir(join(feature,'assets'));assert.ok(!files.some(f=>/photo|reference/.test(f)));
 for(let n=0;n<5;n++){assert.equal(manifest['richard-'+n].width,434);assert.equal(manifest['richard-'+n].height,724);}
});
test('shark opt-out prevents engine creation on Duke, normal pages retain startup and restoration',async()=>{
 const source=(await readFile(join(repo,'workspace/ascii-sharks/background.js'),'utf8')).replace(/^import.*\n/,'');
 for(const off of [true,false]){
  let constructed=0,appended=0;const handlers={};
  const node=()=>({hidden:false,setAttribute(){},append(){},remove(){},addEventListener(){}});
  const context={
   OceanEngine:class{constructor(){constructed++}pause(){}resume(){}destroy(){}},
   document:{hidden:false,querySelector:()=>({}),querySelectorAll:()=>[],createElement:node,createElementNS:node,
    addEventListener(){},body:{dataset:off?{ambientBackground:'off'}:{},append(){appended++}}},
   window:{innerWidth:1440,matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener:(n,f)=>handlers[n]=f},
   localStorage:{getItem:()=>null},MutationObserver:class{observe(){}disconnect(){}},console
  };
  vm.runInNewContext(source,context);
  assert.equal(constructed,off?0:1);assert.equal(appended,off?0:1);
  handlers.pagehide();handlers.pageshow();assert.equal(constructed,off?0:2);
 }
});
