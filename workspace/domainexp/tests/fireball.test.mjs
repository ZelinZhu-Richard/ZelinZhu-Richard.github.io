import {test} from 'node:test';
import assert from 'node:assert/strict';
import {palmPose, FireballState, fireballPose, FLIGHT_MS} from '../fireball.js';
import {FrameTracker, applyTrackingResult, containRect, projectPoint} from '../geometry.js';
import {drawFireballs} from '../render.js';

function palm() {
  return [[.3,.8],[.23,.71],[.18,.66],[.15,.61],[.12,.56],[.24,.61],[.23,.48],[.225,.4],[.22,.33],[.3,.59],[.3,.44],[.3,.35],[.3,.27],[.36,.61],[.37,.47],[.375,.39],[.38,.32],[.42,.65],[.45,.55],[.47,.49],[.49,.43]].map(([x,y])=>({x,y}));
}
function closed() {
  const points = palm();
  for (const [base, joint, tip] of [[5,6,8],[9,10,12],[13,14,16],[17,18,20]]) {
    points[joint] = {x:points[base].x, y:points[base].y-.02};
    points[tip] = {x:points[base].x, y:points[base].y+.06};
  }
  points[4] = {...points[9]}; return points;
}
const frame = (...hands) => ({hands});

test('open palm recognition accepts either hand and rotation, but rejects fists and malformed hands', () => {
  assert.equal(palmPose(palm()).open, true);
  assert.equal(palmPose(palm().map(p=>({x:1-p.x,y:p.y}))).open, true);
  assert.equal(palmPose(palm().map(p=>({x:1-p.y,y:p.x}))).open, true);
  assert.equal(palmPose(closed()).open, false);
  assert.equal(palmPose([]), null);
  const invalid=palm();invalid[8].x=NaN;assert.equal(palmPose(invalid),null);
});
test('a steady palm casts once after 160 ms and does not auto-fire while held open', () => {
  const state=new FireballState(), seen=new Set();
  assert.equal(state.update(frame(palm()),0).shots.length,0);
  assert.equal(state.update(frame(palm()),100).shots.length,0);
  assert.equal(state.update(frame(palm()),160).shots.length,1);
  for(let time=200;time<4000;time+=100) for(const shot of state.update(frame(palm()),time).shots) seen.add(shot.born);
  assert.deepEqual([...seen],[160]);
  assert.match(state.snapshot(3900).reason,/Close your hand/);
});
test('closing and reopening rearms with a cooldown; a momentary pose error does not', () => {
  const state=new FireballState();
  state.update(frame(palm()),0);state.update(frame(palm()),160);
  state.update(frame(closed()),200);state.update(frame(closed()),300);
  assert.equal(state.update(frame(palm()),350).shots.length,1);
  state.update(frame(closed()),400);state.update(frame(closed()),500);state.update(frame(closed()),600);
  for(let time=700;time<=1100;time+=100) state.update(frame(palm()),time);
  const second=state.update(frame(palm()),1260);
  assert.equal(second.shots.length,1);assert.equal(second.shots[0].born,1260);
});
test('both hands cast independently and reordered results do not cast again', () => {
  const state=new FireballState(), a=palm(), b=palm().map(p=>({x:1-p.x,y:p.y}));
  state.update(frame(a,b),0);
  const fired=state.update(frame(b,a),160);
  assert.equal(fired.shots.length,2);assert.equal(new Set(fired.shots.map(s=>s.id)).size,2);
  for(let time=200;time<1800;time+=100) state.update(time%200 ? frame(a,b) : frame(b,a),time);
  assert.equal(state.snapshot(1700).shots.length,0);
});
test('brief hand loss cancels charge but cannot rearm an already fired palm', () => {
  const state=new FireballState();
  state.update(frame(palm()),0);state.update(frame(),100);
  assert.equal(state.update(frame(palm()),160).shots.length,0);
  state.update(frame(palm()),260);assert.equal(state.update(frame(palm()),320).shots.length,1);
  state.update(frame(),400);state.update(frame(palm()),500);
  for(let time=600;time<1800;time+=100) state.update(frame(palm()),time);
  assert.equal(state.snapshot(1700).shots.length,0);
});
test('stale charge never casts, slow valid inference does, and Stop/reset removes everything', () => {
  const state=new FireballState(),tracker=new FrameTracker(), result={landmarks:[palm()]};
  applyTrackingResult(tracker,state,result,0,30);
  assert.equal(state.snapshot(230).charging.length,0);
  assert.equal(applyTrackingResult(tracker,state,result,300,900).shots.length,0);
  assert.equal(applyTrackingResult(tracker,state,result,920,1520).shots.length,1);
  assert.equal(applyTrackingResult(tracker,state,result,1540,3040).shots.length,0);
  assert.equal(state.snapshot(3040).hands.length,0);
  state.update(frame(palm()),3100);state.update(frame(palm()),3260);state.reset();
  assert.equal(state.snapshot(3270).shots.length,0);assert.equal(state.snapshot(3270).charging.length,0);
});
test('projectiles start at the palm, travel forward, expire, and stay stationary under reduced motion', () => {
  const shot={origin:{x:.3,y:.6},size:.05,born:100};
  const start=fireballPose(shot,100), end=fireballPose(shot,800);
  assert.equal(start.x,.3);assert.equal(start.y,.6);assert.ok(end.radius>start.radius*2);assert.ok(end.y<start.y);
  const quiet=fireballPose(shot,800,true);
  assert.equal(quiet.x,.3);assert.equal(quiet.y,.6);assert.equal(quiet.radius,.0625);
  assert.equal(fireballPose(shot,100+FLIGHT_MS).alpha,0);
  const rect=containRect(640,480,800,800);
  assert.equal(projectPoint(start,rect).x,560);
});
test('fireball renderer keeps gradients finite and reduced motion omits the trail and sparks', () => {
  const render = quiet => {
    const calls={arcs:0,lines:0}, gradient={addColorStop(){}};
    const ctx={save(){},restore(){},beginPath(){},closePath(){},rect(){},clip(){},stroke(){},fill(){},moveTo(){},lineTo(){},quadraticCurveTo(){},
      arc(...args){assert.ok(args.every(Number.isFinite));calls.arcs++;},
      createRadialGradient(...args){assert.ok(args.every(Number.isFinite));return gradient;},createLinearGradient(){calls.lines++;return gradient;}};
    drawFireballs(ctx,{charging:[],shots:[{id:1,origin:{x:.3,y:.6},size:.05,born:0}]},{x:0,y:0,width:640,height:480},400,1,quiet);
    return calls;
  };
  assert.deepEqual(render(true),{arcs:1,lines:0});
  assert.deepEqual(render(false),{arcs:25,lines:1});
});
