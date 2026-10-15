import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chordNotes,StableGesture} from '../music.js';
import {gestureFromHands,HandTracker} from '../hands.js';
import {homography,inverse,project,keyAt,validateLayout,videoRect} from '../geometry.js';
import {TapDetector,calibrateFinger,contactScore} from '../paper.js';
import {CameraSession} from '../camera.js';
import {InstrumentAudio} from '../audio.js';
import {pages} from '../../../site/pages.mjs';
const layout={corners:[{x:.1,y:.2},{x:.9,y:.15},{x:.82,y:.9},{x:.16,y:.8}],dividers:Array.from({length:9},(_,i)=>i/8),blacks:[1,2,4,5,6].map((i,j)=>({x0:i/8-.035,x1:i/8+.035,y0:0,y1:.6,midi:[61,63,66,68,70][j]}))};
test('all chord degrees, quality voicings, octave and semitone controls stay musical',()=>{
  for(let key=0;key<12;key++)for(let degree=1;degree<=7;degree++)for(const major of [true,false])for(let quality=1;quality<=4;quality++){
    const s={degree,major,quality,low:false,shift:0},notes=chordNotes(s,key);
    assert.equal(notes.length,4);assert.ok(notes.every(Number.isInteger));
    assert.deepEqual(chordNotes({...s,low:true,shift:1},key),notes.map(n=>n-11));
  }
  assert.deepEqual(chordNotes({degree:1,major:true,quality:3},0),[60,64,67,71]);
  assert.deepEqual(chordNotes({degree:1,major:false,quality:4},0),[60,63,66,69]);
});
const hand=(label,extended)=>({label,extended,major:true,points:Array.from({length:21},()=>({x:.5,y:.6,z:0})),volume:.7,tilt:.2});
test('special gestures override finger count and missing control hands cannot make chords',()=>{
  const left=hand('Left',[false,true,false,false,true]),right=hand('Right',[true,true,true,true,false]);
  assert.equal(gestureFromHands([left,right]).degree,6);assert.equal(gestureFromHands([left,right]).quality,3);assert.equal(gestureFromHands([left,right]).low,true);
  left.extended[0]=true;assert.equal(gestureFromHands([left,right]).degree,7);
  assert.equal(gestureFromHands([left]),null);assert.equal(gestureFromHands([left],{oneHand:true}).quality,1);
  left.extended.fill(false);assert.equal(gestureFromHands([left],{oneHand:true}),null);
});
test('gesture stabilization rejects transient changes and releases tracking loss',()=>{
  const stable=new StableGesture(),a={degree:1,major:true,quality:1,low:false,shift:0},b={...a,degree:2};
  assert.equal(stable.update(a,0),null);assert.deepEqual(stable.update(a,101),a);
  stable.update(b,140);assert.deepEqual(stable.update(a,170),a);
  assert.deepEqual(stable.update(null,190),a);assert.equal(stable.update(null,230),null);
});
test('perspective round trips, black-key priority and outside boundaries',()=>{
  const h=homography(layout.corners),back=inverse(h);assert.ok(validateLayout(layout));
  for(const p of [{x:0,y:0},{x:.37,y:.61},{x:1,y:1}]){const q=project(h,project(back,p));assert.ok(Math.hypot(q.x-p.x,q.y-p.y)<1e-8);}
  assert.equal(keyAt(layout,{x:.13,y:.3}),61);assert.equal(keyAt(layout,{x:.13,y:.9}),62);assert.equal(keyAt(layout,{x:-.01,y:.9}),null);
  assert.equal(validateLayout({...layout,corners:[layout.corners[0],layout.corners[2],layout.corners[1],layout.corners[3]]}),false);
  assert.deepEqual(videoRect(800,600,1280,720),{x:0,y:75,w:800,h:450});
});
test('calibration rejects indistinguishable poses and classifies both endpoints',()=>{
  const down=Array.from({length:24},()=>[1,.5,.4]),up=Array.from({length:24},()=>[.1,-.2,-.3]);
  const p=calibrateFinger(down,up);assert.ok(contactScore(down[0],p).score>.99);assert.ok(contactScore(up[0],p).score<.01);
  assert.throws(()=>calibrateFinger(down,down),/too similar/);assert.equal(contactScore([15,8,3],p).valid,false);
});
test('tap events require lifting, tolerate holds, release and rearm without hover notes',()=>{
  const taps=new TapDetector(),o=(score,midi=60)=>[{id:'Left:1',midi,valid:true,score}];
  assert.deepEqual(taps.update(o(1),0),[]);assert.deepEqual(taps.update(o(1),33),[]);
  taps.update(o(0),66);taps.update(o(0),99);taps.update(o(1),132);
  assert.equal(taps.update(o(1),165)[0].type,'on');assert.deepEqual(taps.update(o(1),198),[]);
  assert.equal(taps.update(o(1,62),231)[0].type,'off');assert.deepEqual(taps.update(o(1,62),264),[]);
  taps.update(o(0),300);taps.update(o(0),333);taps.update(o(1),366);assert.equal(taps.update(o(1),399)[0].type,'on');
  assert.equal(taps.update([],501)[0].type,'off');
});
test('two fingers pressing the same note have independent lifetimes',()=>{
  const t=new TapDetector(),observations=score=>['L','R'].map(id=>({id,midi:60,score,valid:true}));
  t.update(observations(0),0);t.update(observations(0),33);t.update(observations(1),66);assert.equal(t.update(observations(1),99).length,2);
  const events=t.update([{id:'R',midi:60,score:1,valid:true}],210);assert.deepEqual(events,[{type:'off',id:'L',midi:60}]);
});
test('camera cancellation stops streams that arrive after Stop',async()=>{
  let deliver,stopped=0;const video={srcObject:null,play:async()=>{}},session=new CameraSession(video,{getUserMedia:()=>new Promise(r=>deliver=r)});
  const start=session.start();session.stop();deliver({getTracks:()=>[{stop:()=>stopped++}]});await assert.rejects(start,/cancelled/);assert.equal(stopped,1);assert.equal(video.srcObject,null);
});
test('camera shutdown releases every track and clears the element',async()=>{
  let stopped=0;const stream={getTracks:()=>[{stop:()=>stopped++},{stop:()=>stopped++}]},video={srcObject:null,play:async()=>{}};
  const session=new CameraSession(video,{getUserMedia:async()=>stream});await session.start();assert.equal(video.srcObject,stream);session.stop();assert.equal(stopped,2);assert.equal(video.srcObject,null);
});
test('audio sustain keeps source ownership and all-off overrides sustain',()=>{
  const audio=new InstrumentAudio();audio.context={currentTime:0};let stops=0;
  const voice=()=>({held:true,midi:60,gain:{gain:{cancelScheduledValues(){},setTargetAtTime(){}}},node:{stop(){stops++;}}});
  audio.voices.set('one',voice());audio.voices.set('two',voice());audio.setSustain(true);audio.release('one');assert.equal(audio.voices.size,2);audio.setSustain(false);assert.equal(stops,1);assert.ok(audio.voices.has('two'));audio.setSustain(true);audio.allOff();assert.equal(stops,2);assert.equal(audio.voices.size,0);
});
test('selecting an already loaded sound preserves notes for keyboard chords',async()=>{
  const audio=new InstrumentAudio();audio.voices.set('existing',{held:true,midi:60});
  await audio.setBank('retro');assert.ok(audio.voices.has('existing'));
});
test('project list uses a stable Paper Piano anchor and navigation destination',()=>{
  const work=pages().get('work/index.html');assert.match(work,/id="paper-piano"/);assert.match(work,/href="\/ppiano\/"/);assert.doesNotMatch(work,/id="undefined"/);
});

test('hand identities survive result reordering and uncertain observations stay silent',()=>{
  const tracker=new HandTracker();
  const points=x=>Array.from({length:21},(_,i)=>({x:x+(i%4)*.015,y:.3+Math.floor(i/4)*.02,z:0}));
  const result=(labels,xs,scores=labels.map(()=>.99))=>({landmarks:xs.map(points),handedness:labels.map((categoryName,i)=>[{categoryName,score:scores[i]}])});
  const initial=tracker.update(result(['Left','Right'],[.2,.7]),0);const ids=Object.fromEntries(initial.map(h=>[h.label,h.id]));
  const reordered=tracker.update(result(['Right','Left'],[.68,.22]),33);
  assert.equal(reordered.find(h=>h.label==='Left').id,ids.Left);assert.equal(reordered.find(h=>h.label==='Right').id,ids.Right);
  assert.equal(tracker.update(result(['Left'],[.22],[.3]),66).length,0);
  assert.equal(tracker.update(result(['Unknown'],[.22]),99).length,0);
});
