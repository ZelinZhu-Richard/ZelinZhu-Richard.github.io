import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneProgress,transformationState,workshopState,sparkState,rescueState,windStrength,ASSEMBLY_THRESHOLDS} from '../model.js';

test('scene boundaries, overshoot, invalid geometry and zero travel',()=>{
 assert.equal(sceneProgress(100,5000,1000),0);
 assert.equal(sceneProgress(0,5000,1000),0);
 assert.equal(sceneProgress(-4000,5000,1000),1);
 assert.equal(sceneProgress(-5000,5000,1000),1);
 assert.equal(sceneProgress(NaN,5000,1000),0);
 assert.equal(sceneProgress(0,900,1000),1);
});
test('reverse scrolling and resize use current bounds, with no playback history',()=>{
 const progress=[0,-1000,-2000,-1000,0].map(top=>sceneProgress(top,5000,1000));
 assert.deepEqual(progress,[0,.25,.5,.25,0]);
 assert.equal(sceneProgress(-1200,3000,600),.5);
 assert.equal(sceneProgress(-1200,3600,900),1200/2700);
});
test('all five registered transformation states and adjacent interpolation',()=>{
 for(let n=0;n<5;n++){
  const s=transformationState(n/4);assert.equal(s.weights[n],1);
  assert.equal(s.weights.filter(Boolean).length,1);
 }
 for(const p of [-2,0,.125,.37,.99,1,2]){
  const s=transformationState(p);assert.ok(Math.abs(s.weights.reduce((a,b)=>a+b,0)-1)<1e-12);
  assert.ok(s.weights.filter(Boolean).length<=2);assert.ok(s.weights.every(v=>v>=0&&v<=1));
 }
 assert.deepEqual(transformationState(.125).weights,[.5,.5,0,0,0]);
 assert.deepEqual(transformationState(1),transformationState(2));
 assert.deepEqual(transformationState(-1),transformationState(0));
});
test('workshop parts attach independently, equal visual presence arrives gradually, reverse removes parts',()=>{
 assert.equal(workshopState(0).stage,0);
 ASSEMBLY_THRESHOLDS.forEach((p,n)=>{
  assert.equal(workshopState(p-1e-6).stage,n);assert.equal(workshopState(p).stage,n+1);
 });
 assert.deepEqual(workshopState(1).parts,[1,1,1,1]);
 assert.deepEqual(workshopState(1).voices,[1,1,1]);
 const forward=[0,.4,.8,1].map(workshopState),backward=[1,.8,.4,0].map(workshopState).reverse();
 assert.deepEqual(forward,backward);
});
test('spark collection is reversible and independent for both encounters',()=>{
 for(const n of [1,2]){
  assert.equal(sparkState(0,n).count,n-1);
  assert.equal(sparkState(.859,n).collected,false);
  assert.equal(sparkState(.86,n).count,n);
  assert.equal(sparkState(1,n).travel,1);
  assert.equal(sparkState(.2,n).travel,0);
 }
});
test('rescue holds composition from 76–88%, then catches light; exact boundaries and reverse',()=>{
 const a=rescueState(.76),b=rescueState(.879);
 for(const key of ['dragonX','dragonY','lanternX','lanternY','camera','catchCord'])assert.equal(a[key],b[key]);
 assert.equal(a.hold,true);assert.equal(rescueState(.88).hold,false);
 assert.equal(rescueState(.879).catchLight,0);assert.equal(rescueState(.88).catchLight,0);
 assert.equal(rescueState(1).catchLight,1);assert.equal(rescueState(.76).catchCord,1);
 assert.equal(rescueState(.679).beat,0);assert.equal(rescueState(.68).beat,1);assert.equal(rescueState(.88).beat,2);
 assert.deepEqual([.4,.8,1].map(rescueState),[1,.8,.4].map(rescueState).reverse());
 assert.deepEqual(rescueState(2),rescueState(1));
});
test('scroll velocity changes bounded wind only',()=>{
 assert.equal(windStrength(100000,1),1);assert.equal(windStrength(-100000,1),1);
 assert.equal(windStrength(100,0),0);assert.equal(windStrength(NaN,12),0);
});
