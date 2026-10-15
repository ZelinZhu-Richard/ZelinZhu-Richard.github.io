import test from 'node:test';
import assert from 'node:assert/strict';
import {observePose,captureTop,calibrate,measurePose,RepCounter,angle} from '../pose.js';
import {dayKey,dayNumber,cleanHistory,summary,WorkoutHistory,STORAGE_KEY} from '../history.js';
import {BirdGame,WORLD} from '../game.js';
function body(lowered=false){
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:.1,presence:1,z:0}));
  const coords=lowered?[[.25,.5],[.30,.6],[.25,.7],[.55,.6],[.85,.7]]:[[.25,.3],[.25,.5],[.25,.7],[.55,.5],[.85,.7]];
  [11,13,15,23,27].forEach((index,i)=>{p[index]={x:coords[i][0],y:coords[i][1],visibility:.99,presence:.99,z:0};});return {landmarks:[p]};
}
const top=observePose(body()),bottom=observePose(body(true)),samples=p=>Array.from({length:16},()=>structuredClone(p));
const profile=calibrate(captureTop(samples(top)),samples(bottom));
const up={valid:true,up:true,down:false},down={valid:true,up:false,down:true},middle={valid:true,up:false,down:false};
function driver(){const c=new RepCounter();let time=0,reps=0;return {c,hold(p,n=10){for(let i=0;i<n;i++){time+=40;reps+=Number(c.update(p,time));}return reps;},gap(ms){time+=ms;},get reps(){return reps;}};}
test('pose geometry is aspect-correct, uses body-relative height, and ignores raw z',()=>{
  assert.ok(top.valid&&bottom.valid);assert.equal(top.side,'left');assert.equal(top.angle,180);assert.ok(bottom.angle<110);assert.ok(top.height>bottom.height);
  assert.equal(angle({x:0,y:0},{x:0,y:1},{x:1,y:1}),90);
  const changed=body();changed.landmarks[0].forEach(p=>p.z=5000);assert.equal(observePose(changed).height,top.height);
  const p=body();p.landmarks[0].forEach(v=>v.x*=16/9);assert.equal(observePose(p,1).valid,false); // Out of frame is rejected, never silently clamped.
  const m=measurePose(top,profile);assert.equal(m.height,1);assert.equal(m.up,true);assert.equal(measurePose(bottom,profile).down,true);
});
test('missing, multiple, clipped, uncertain, and non-horizontal bodies stay silent',()=>{
  assert.equal(observePose({landmarks:[]}).valid,false);assert.equal(observePose({landmarks:[body().landmarks[0],body().landmarks[0]]}).valid,false);
  for(const field of ['visibility','presence']){const x=body();x.landmarks[0][15][field]=.4;assert.equal(observePose(x).valid,false);}
  const clipped=body();clipped.landmarks[0][27].x=1;assert.equal(observePose(clipped).valid,false);
  const standing=body();[11,13,15,23,27].forEach(i=>standing.landmarks[0][i].x=.25);assert.equal(observePose(standing).valid,false);
  assert.equal(observePose(body(),16/9,'right').valid,false); // A locked side cannot silently switch.
});
test('calibration rejects incomplete, moving, shallow, and shifted captures',()=>{
  assert.throws(()=>captureTop(samples(top).slice(0,5)));assert.throws(()=>captureTop(samples(bottom)));
  assert.throws(()=>calibrate(profile.top,samples(top)));const jitter=samples(top).map((p,i)=>({...p,angle:p.angle+(i%2?12:-12)}));assert.throws(()=>captureTop(jitter));
  const shifted={...bottom,wrist:{x:.5,y:.7}};assert.throws(()=>calibrate(profile.top,samples(shifted)));
  assert.equal(measurePose({...top,ankle:{x:.99,y:.7}},profile).moved,true);
  assert.equal(measurePose({...top,height:bottom.height},profile).valid,false); // Arm/body disagreement.
});
test('counter counts each full raised-lowered-raised cycle exactly once',()=>{
  const d=driver();d.hold(up);d.hold(middle);d.hold(down);assert.equal(d.reps,0);d.hold(middle);assert.equal(d.hold(up),1);assert.equal(d.hold(up,100),1);
  d.hold(middle);d.hold(down);d.hold(middle);assert.equal(d.hold(up),2);
});
test('partial reps, short threshold jitter, and starting lowered do not count',()=>{
  const d=driver();d.hold(down);d.hold(up);assert.equal(d.reps,0);d.hold(middle);d.hold(up);assert.equal(d.reps,0);
  for(let i=0;i<10;i++){d.hold(down,2);d.hold(up,2);}assert.equal(d.reps,0);
});
test('lost or stale tracking, explicit reset, and very long pauses cancel unfinished reps',()=>{
  for(const action of [d=>d.hold({valid:false},1),d=>d.gap(600),d=>d.c.reset(),d=>d.gap(21000)]){const d=driver();d.hold(up);d.hold(middle);d.hold(down);action(d);d.hold(up);assert.equal(d.reps,0);d.hold(middle);d.hold(down);d.hold(middle);d.hold(up);assert.equal(d.reps,1);}
});
const date=(day,h=12)=>new Date(2026,9,day,h);
function memory(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};}
test('daily streak lasts through today, breaks after a missed day, and ignores future dates',()=>{
  const data=cleanHistory({days:{'2026-10-12':3,'2026-10-13':7,'2026-10-14':1,'2026-10-16':2}});
  assert.deepEqual(summary(data,date(15)),{today:0,current:3,best:3,total:11});assert.equal(summary(data,date(14)).current,3);assert.equal(summary(data,date(18)).current,0);
  assert.equal(summary(data,date(13)).best,2);assert.equal(dayKey(new Date(2026,9,15,0,1)),'2026-10-15');
  assert.equal(dayNumber('2026-03-09')-dayNumber('2026-03-08'),1);assert.equal(dayNumber('2026-11-02')-dayNumber('2026-11-01'),1);assert.ok(Number.isNaN(dayNumber('2026-02-30')));
});
test('saved reps survive reload; midnight creates a new day; demo scores never earn reps',()=>{
  const store=memory(),h=new WorkoutHistory(store);h.recordRep(date(14,23));h.recordRep(date(15,0));h.recordRep(date(15,0));h.recordScore(5,true);
  const reloaded=new WorkoutHistory(store);assert.deepEqual(summary(reloaded.data,date(15)),{today:2,current:2,best:2,total:3});assert.equal(reloaded.data.bestDemo,5);assert.equal(reloaded.data.bestBird,0);
  h.recordScore(3);h.recordScore(1);assert.equal(h.data.bestBird,3);store.setItem('unrelated','keep');assert.equal(h.clear(),true);assert.equal(store.getItem('unrelated'),'keep');assert.equal(store.getItem(STORAGE_KEY),null);
});
test('malformed data is sanitized and denied storage keeps an in-memory session',()=>{
  const clean=cleanHistory({days:{'2026-02-30':5,'bad':2,'2026-10-15':-1,'2026-10-14':4},bestBird:'10'});assert.deepEqual(clean.days,{'2026-10-14':4});assert.equal(clean.bestBird,0);
  const h=new WorkoutHistory({getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}});h.recordRep(date(15));h.recordRep(date(15));assert.equal(h.available,false);assert.equal(summary(h.data,date(15)).today,2);assert.equal(h.clear(),false);
});
test('bird continuously follows calibrated height and pauses without advancing',()=>{
  const g=new BirdGame();g.start();for(let i=0;i<60;i++)g.step(1/60,1);assert.ok(g.y<110);for(let i=0;i<60;i++)g.step(1/60,0);assert.ok(g.y>430);
  g.pause();const before=JSON.stringify(g);g.step(20,1);assert.equal(JSON.stringify(g),before);g.resume();g.step(20,.5);assert.ok(g.distance-JSON.parse(before).distance<=g.speed*.06+.00001);
});
test('bird scores passed gaps once, collides at gap edges, and resets cleanly',()=>{
  const g=new BirdGame();g.start();g.obstacles=[{x:110,center:270,scored:false}];g.step(.05,.5);assert.equal(g.score,1);g.step(.05,.5);assert.equal(g.score,1);
  g.obstacles=[{x:WORLD.birdX,center:100,scored:false}];g.step(.01,.5);assert.equal(g.status,'over');g.start('steady');assert.equal(g.score,0);assert.equal(g.gap,205);assert.equal(g.status,'playing');assert.ok(g.obstacles.length>0);
});
