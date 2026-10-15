import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraSession,VisionClient} from '../camera.js';
import {buildGym} from '../build.mjs';
import {mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
const fakeStream=()=>{const track={stopped:0,stop(){this.stopped++;}};return {track,getTracks:()=>[track]};};
test('camera requests video only, stops existing tracks, and clears preview',async()=>{
  const first=fakeStream(),second=fakeStream(),requests=[],video={play:async()=>{},srcObject:null};
  const c=new CameraSession(video,{getUserMedia:async opts=>{requests.push(opts);return requests.length===1?first:second;}});
  await c.start();await c.start({deviceId:'rear'});assert.equal(first.track.stopped,1);assert.equal(requests[0].audio,false);assert.equal(requests[1].video.deviceId.exact,'rear');c.stop();assert.equal(second.track.stopped,1);assert.equal(video.srcObject,null);
});
test('a late camera permission result after Stop is immediately released',async()=>{
  let resolve;const stream=fakeStream(),video={play:async()=>{}};const c=new CameraSession(video,{getUserMedia:()=>new Promise(r=>resolve=r)});
  const starting=c.start();c.stop();resolve(stream);await assert.rejects(starting,/cancelled/);assert.equal(stream.track.stopped,1);assert.equal(video.srcObject,null);
});
test('video play failure releases tracks instead of retaining camera access',async()=>{
  const stream=fakeStream();const c=new CameraSession({play:async()=>{throw Error('Interrupted');}},{getUserMedia:async()=>stream});await assert.rejects(c.start(),/Interrupted/);assert.equal(stream.track.stopped,1);assert.equal(c.stream,null);
});
test('worker stop rejects pending frames and terminates the worker',async()=>{
  const oldWorker=globalThis.Worker,oldBitmap=globalThis.createImageBitmap;let worker;
  globalThis.createImageBitmap=async()=>({close(){}});
  globalThis.Worker=class{constructor(){worker=this;}postMessage(data){if(data.type==='init')queueMicrotask(()=>this.onmessage({data:{id:data.id,result:true}}));}terminate(){this.terminated=true;}};
  try{const v=new VisionClient();assert.equal(await v.start(),'worker');const pending=v.request('track');v.stop();await assert.rejects(pending,/stopped/);assert.equal(worker.terminated,true);assert.equal(v.pending.size,0);}finally{globalThis.Worker=oldWorker;globalThis.createImageBitmap=oldBitmap;}
});
test('production Gym build verifies pinned assets and excludes development files',async()=>{
  const base=new URL('../.qa/',import.meta.url);await mkdir(base,{recursive:true});const out=await mkdtemp(new URL('build-',base).pathname);
  try{await buildGym(out);const files=await readdir(`${out}/gym`);assert.ok(files.includes('index.html')&&files.includes('vendor'));for(const privateFile of ['tests','.qa','PRODUCT.md','build.mjs','integrate.py'])assert.ok(!files.includes(privateFile));
    const html=await readFile(`${out}/gym/index.html`,'utf8');assert.ok(html.includes('https://zelinzhu-richard.github.io/gym/'));assert.ok(html.includes("connect-src 'self'"));assert.ok(!html.includes('/_nuxt/'));assert.ok(html.includes('experimental'));
  }finally{await rm(out,{recursive:true,force:true});}
});
test('Gym is reachable from both navigation systems and has a stable Work anchor',async()=>{
  const root=new URL('../../../',import.meta.url);
  for(const path of ['site/pages.mjs','public/index.html','public/contacts/index.html','tools/build.mjs'])assert.ok((await readFile(new URL(path,root),'utf8')).includes('/gym/'),path);
  const runtime=await readFile(new URL('public/_nuxt/CbdjwYMp.js',root),'utf8');assert.ok(runtime.includes('to:"/gym/"'));assert.ok(runtime.includes('link:"/gym/",text:"Gym"'));
  const {PROJECTS}=await import('../../../site/content.mjs');assert.equal(PROJECTS.find(p=>p.id==='gym').live,'/gym/');
  const {pages}=await import('../../../site/pages.mjs');assert.ok(pages().get('work/index.html').includes('id="gym"'));
});
