import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dustGesture, palmFacesCamera, DustState, dustPose, DUST_FLIGHT_MS} from '../dust.js';
import {FrameTracker, applyTrackingResult, containRect, projectPoint} from '../geometry.js';
import {drawDust} from '../render.js';

export function sealResult(gap = .04) {
  const left = [[.25,.75],[.33,.68],[.38,.64],[.43,.60],[.48,.58],[.32,.54],[.39,.43],[.44,.36],[.48,.32],[.26,.5],[.27,.37],[.28,.29],[.29,.22],[.2,.53],[.18,.4],[.17,.32],[.16,.26],[.15,.6],[.1,.51],[.07,.46],[.05,.42]].map(([x,y]) => ({x,y,z:0}));
  const right = left.map(p => ({...p, x:1-p.x}));
  for (const i of [4,8]) { left[i].x=.5-gap/2; right[i].x=.5+gap/2; }
  return {landmarks:[left,right], handedness:[[{categoryName:'Right',score:.98}],[{categoryName:'Left',score:.98}]], aspectRatio:1};
}
const frame = result => new FrameTracker().update(result,0);
function separatedResult() { const r=sealResult(); r.landmarks=r.landmarks.map((h,i)=>h.map(p=>({...p,x:p.x+(i ? .1:-.1)}))); return r; }
const tick = (state, result, time, latency=0) => state.update(frame(result),time,latency);

test('the seal accepts touching and small gaps, but requires both matching finger pairs', () => {
  for (const gap of [0,.02,.04,.07]) assert.equal(dustGesture(frame(sealResult(gap))).valid,true,`gap ${gap}`);
  const thumb=sealResult(); thumb.landmarks[0][4].x-=.12;
  assert.match(dustGesture(frame(thumb)).reason,/thumbs close/);
  const index=sealResult(); index.landmarks[0][8].x-=.12;
  assert.match(dustGesture(frame(index)).reason,/index fingers close/);
});
test('both open palms must face the camera; backs, edge-on hands, fists and missing hands fail', () => {
  const r=sealResult(), f=frame(r); assert.equal(dustGesture(f).valid,true);
  const back=sealResult(); back.handedness.reverse(); assert.match(dustGesture(frame(back)).reason,/Turn both palms/);
  const edge=sealResult(); for(const h of edge.landmarks) {h[5].z=.7;h[17].z=-.7;} assert.match(dustGesture(frame(edge)).reason,/Turn both palms/);
  const fist=sealResult(); for(const h of fist.landmarks) for(const [b,t]of[[5,8],[9,12],[13,16],[17,20]])h[t]={...h[b]};
  assert.match(dustGesture(frame(fist)).reason,/Open both palms/);
  assert.match(dustGesture({hands:[r.landmarks[0]]}).reason,/other palm/);
  assert.equal(dustGesture({hands:[]}).valid,false);
  assert.equal(dustGesture({hands:[[{}],[]]}).valid,false);
  assert.equal(palmFacesCamera(r.landmarks[0],{},1),false);
});
test('gesture tolerates rotation, scaling, camera aspect ratio, and detection order changes', () => {
  const original=sealResult();
  for(const aspect of [9/16,1,16/9]) for(const size of [.45,1]) {
    const r=structuredClone(original); r.aspectRatio=aspect;
    r.landmarks=r.landmarks.map(h=>h.map(p=>{const x=(p.x-.5)*size,y=(p.y-.5)*size;return {x:.5+(x*.94-y*.34)/aspect,y:.5+x*.34+y*.94,z:0};}));
    assert.equal(dustGesture(frame(r)).valid,true,`aspect ${aspect} size ${size}`);
    r.landmarks.reverse();r.handedness.reverse();assert.equal(dustGesture(frame(r)).valid,true);
  }
});
test('raw fingertip rejection is immediate while center follows smoothed points; metadata stays aligned', () => {
  const tracker=new FrameTracker(), good=sealResult();tracker.update(good,0);
  const moved=sealResult();moved.landmarks=moved.landmarks.map(h=>h.map(p=>({...p,x:p.x+.02,z:.01})));
  const smoothed=tracker.update(moved,10); assert.ok(smoothed.hands[0][0].x<moved.landmarks[0][0].x);
  assert.equal(smoothed.hands[0][0].z,.01);assert.equal(smoothed.handInfo[0].handedness.categoryName,'Right');
  assert.equal(dustGesture(tracker.update(separatedResult(),11)).valid,false);
  const filtered={...good,landmarks:[[],...good.landmarks],handedness:[[],...good.handedness]};
  assert.equal(dustGesture(frame(filtered)).valid,true);
});
test('holding the seal releases once after 450 ms; held or briefly lost hands never auto-cast', () => {
  const state=new DustState(), r=sealResult();
  for(const t of [0,100,200,300,449])assert.equal(tick(state,r,t).shots.length,0);
  assert.equal(tick(state,r,450).shots.length,1);
  const born=new Set();for(let t=500;t<4000;t+=100){const s=tick(state,t===900?{landmarks:[]}:r,t);for(const shot of s.shots)born.add(shot.born);}
  assert.deepEqual([...born],[450]); assert.equal(state.snapshot(4000).shots.length,0);
});
test('deliberate separation rearms and cooldown prevents rapid repeated releases', () => {
  const state=new DustState(), r=sealResult(), away=separatedResult();
  for(let t=0;t<=500;t+=100)tick(state,r,t);
  for(let t=600;t<=900;t+=100)tick(state,away,t);
  for(let t=1000;t<2500;t+=100)assert.equal(tick(state,r,t).shots.some(s=>s.born>500),false);
  assert.equal(tick(state,r,2500).shots[0].born,2500);
});
test('missing/stale data cancels charging, slow inference works, and reset clears releases', () => {
  const state=new DustState(),tracker=new FrameTracker(),r=sealResult();
  applyTrackingResult(tracker,state,r,0,30);assert.equal(state.snapshot(230).charging,null);
  applyTrackingResult(tracker,state,r,300,900);assert.equal(applyTrackingResult(tracker,state,r,920,1520).shots.length,1);
  assert.equal(applyTrackingResult(tracker,state,r,1540,3040).shots.length,0);
  for(let t=3100;t<=3600;t+=100)tick(state,r,t);state.reset();
  assert.equal(state.snapshot(3601).shots.length,0);assert.equal(state.snapshot(3601).charging,null);
});
test('cube travels and expires; reduced motion keeps a fixed pose without dust particles', () => {
  const shot={origin:{x:.4,y:.6},size:.05,born:0};const start=dustPose(shot,0),moving=dustPose(shot,700),quiet=dustPose(shot,700,true);
  assert.ok(moving.radius>start.radius*2.5);assert.ok(moving.y<start.y);
  assert.equal(quiet.y,shot.origin.y);assert.equal(quiet.radius,shot.size);assert.equal(quiet.rotation,start.rotation);
  assert.equal(dustPose(shot,DUST_FLIGHT_MS).alpha,0);
  assert.equal(projectPoint(start,containRect(640,480,800,800)).x,480);
  const render=reduced=>{let particles=0;const gradient={addColorStop(){}};const finite=(...args)=>assert.ok(args.every(Number.isFinite));
    const ctx={save(){},restore(){},beginPath(){},closePath(){},clip(){},stroke(){},fill(){},rect:finite,moveTo:finite,lineTo:finite,arc:finite,
      createRadialGradient(...args){finite(...args);return gradient;},fillRect(...args){finite(...args);particles++;}};
    drawDust(ctx,{shots:[shot],charging:null},{x:0,y:0,width:640,height:480},700,1,reduced);return particles;};
  assert.equal(render(false),80);assert.equal(render(true),0);
});
