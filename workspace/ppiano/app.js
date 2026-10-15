import { InstrumentAudio } from './audio.js';
import { CameraSession,VisionClient } from './camera.js';
import { HandTracker,gestureFromHands,FINGERS,JOINTS } from './hands.js';
import { StableGesture,chordNotes,chordLabel,DEGREES,WHITE_NOTES,BLACK_NOTES,noteName,clamp } from './music.js';
import { homography,project,validateLayout } from './geometry.js';
import { calibrateFinger,fingerFeatures,contactScore,TapDetector,paperObservations } from './paper.js';
import { captureAnchors,anchorDrift } from './detection.js';
import { StageRenderer } from './renderer.js';
const $=id=>document.getElementById(id);
const audio=new InstrumentAudio(),camera=new CameraSession($('camera')),vision=new VisionClient(),tracker=new HandTracker(),stable=new StableGesture(),taps=new TapDetector(),renderer=new StageRenderer($('overlay'),$('camera'));
const state={mode:'gesture',running:false,starting:false,generation:0,oneHand:false,hands:[],layout:null,editing:false,profiles:{},ready:false,anchors:null,drift:0,missingAnchors:0,facing:'user',compat:false,scan:false,gesture:null,calibration:null,capture:null};
let timer=null,animation=null,watchdog=null,lastTrack=0,lastResult=0,lastFrame=0,lastDrift=0,frameCount=0,fpsStart=0,bankPromise=null;
const held=new Map(),keyButtons=new Map(),keys=['a','w','s','e','d','f','t','g','y','h','u','j','k'];
function message(text,error=false){$('message').textContent=text;$('message').hidden=!text;$('message').classList.toggle('error',error);}
function status(text,live=false){$('camera-status').replaceChildren(Object.assign(document.createElement('span'),{}),document.createTextNode(text));$('camera-status').classList.toggle('live',live);}
function step(index){[...$('steps').children].forEach((li,i)=>{li.classList.toggle('current',i===index);li.classList.toggle('done',i<index);});}
function releaseAll(){held.clear();audio.allOff();taps.reset();stable.reset();state.gesture=null;highlight();}
function highlight(){const notes=new Set([...audio.voices.values()].map(v=>v.midi));for(const[midi,b]of keyButtons){const on=notes.has(midi+Number($('octave').value)*12);b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}}
function clearPaper(){state.layout=null;state.profiles={};state.ready=false;state.editing=false;state.anchors=null;state.calibration=null;state.capture=null;state.drift=0;state.missingAnchors=0;for(const id of ['alignment','calibration','paper-ready','capture-panel'])$(id).hidden=true;$('begin-calibration').hidden=false;$('finger-choices').closest('fieldset').hidden=false;step(0);}
function stopCamera(notice=''){
  state.generation++;state.running=false;state.starting=false;state.scan=false;state.hands=[];state.capture=null;
  clearTimeout(timer);clearInterval(watchdog);cancelAnimationFrame(animation);camera.stop();vision.stop();tracker.reset();releaseAll();clearPaper();
  $('start').disabled=false;$('start').innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h10v10H3zM13 8l4-2v8l-4-2"/></svg> Start camera';$('idle').hidden=false;$('stop').hidden=true;$('live-note').hidden=true;$('scan').disabled=true;$('fps').textContent='';status('CAMERA OFF');
  renderer.context.clearRect(0,0,$('overlay').width,$('overlay').height);
  $('tracking-label').textContent=state.mode==='paper'?'Draw a keyboard, then bring it into view.':'Your next instrument is already in your hands.';
  if(notice)message(notice);
}
async function prepareSound(){await audio.unlock();if(!bankPromise){bankPromise=audio.setBank($('sound').value).finally(()=>{bankPromise=null;});}await bankPromise;}
async function startCamera(){
  if(state.starting||state.running)return;
  state.starting=true;const generation=++state.generation;$('start').disabled=true;$('start').textContent='Opening your instrument…';$('stop').hidden=false;status('STARTING');message('Allow the camera to get started. The hand model loads once on this device.');
  try{
    // Unlock audio synchronously from the click, before awaiting camera permission.
    await audio.unlock();await camera.start({deviceId:$('device').value,facingMode:state.facing});
    if(generation!==state.generation)return;
    const [engine]=await Promise.all([vision.start(),prepareSound()]);if(generation!==state.generation)return;
    state.compat=engine==='compatibility';state.running=true;state.starting=false;state.hands=[];
    $('idle').hidden=true;$('live-note').hidden=false;$('scan').disabled=state.mode!=='paper';status('CAMERA ON',true);
    message(state.mode==='paper'?'Position the whole drawing in view, take your hands away, then recognize the keyboard.':'Raise both palms into view. Use the guide if you need a starting point.');
    const devices=await navigator.mediaDevices.enumerateDevices();if(generation!==state.generation)return;
    const selected=$('device').value;$('device').replaceChildren(new Option('Default camera',''),...devices.filter(d=>d.kind==='videoinput').map((d,i)=>new Option(d.label||`Camera ${i+1}`,d.deviceId)));$('device').value=selected;
    camera.stream.getVideoTracks()[0].onended=()=>{if(state.running)stopCamera('The camera disconnected. Reconnect it, then start again.');};
    lastTrack=0;lastFrame=-1;fpsStart=performance.now();lastResult=fpsStart;frameCount=0;lastDrift=0;
    watchdog=setInterval(()=>{if(state.running&&performance.now()-lastResult>500){audio.allOff();taps.reset();stable.reset();state.hands=[];}},100);
    tick(generation);paint();
  }catch(error){if(generation!==state.generation)return;stopCamera();const names={NotAllowedError:'Camera permission was not granted. Allow it in your browser’s site settings, or play the keys below.',NotFoundError:'No camera found. Connect a webcam or use the keyboard below.',NotReadableError:'The camera is busy. Close other apps using it and retry.',OverconstrainedError:'That camera is unavailable. Choose Default camera and retry.'};message(names[error.name]||error.message,true);}
}
function captureImage(){const video=$('camera'),canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.round(640*video.videoHeight/video.videoWidth);const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(video,0,0,canvas.width,canvas.height);return c.getImageData(0,0,canvas.width,canvas.height);}
async function tick(generation){
  if(!state.running||generation!==state.generation)return;
  const now=performance.now();
  if(state.scan||now-lastTrack<(state.compat?95:33)||$('camera').currentTime===lastFrame){timer=setTimeout(()=>tick(generation),10);return;}
  lastTrack=now;lastFrame=$('camera').currentTime;
  try{
    const result=await vision.track($('camera'),now);if(generation!==state.generation)return;
    lastResult=performance.now();
    state.hands=tracker.update(result,now);frameCount++;
    if(now-fpsStart>1200){$('fps').textContent=`${Math.round(frameCount*1000/(now-fpsStart))} fps${state.compat?' · compatibility':''}`;fpsStart=now;frameCount=0;}
    $('tracking-label').textContent=state.hands.length?`${state.hands.length===2?'Both hands':'One hand'} in view · ${state.mode==='paper'?'Paper Piano':'Gesture Synth'}`:'Looking for your hands · keep palms and fingertips visible';
    if(!document.querySelector('dialog[open]')){if(state.mode==='gesture')playGesture(now);else playPaper(now);}
    if(state.capture)captureCalibration(now);
    if(state.mode==='paper'&&state.anchors&&!state.editing&&now-lastDrift>500){
      lastDrift=now;const drift=anchorDrift(captureImage(),state.layout.corners,state.anchors,state.hands);
      state.drift=drift.moved?state.drift+1:0;state.missingAnchors=drift.visible<2?state.missingAnchors+1:0;
      if(state.drift>=3||state.missingAnchors>=12)invalidatePaper('The paper moved or its border is obscured. Clear the corners and recognize the keyboard again.');
    }
    if(now-lastTrack>600){releaseAll();message('Tracking is running slowly. Improve the light or close other demanding tabs.');}
  }catch(error){if(generation===state.generation){stopCamera();message(error.message,true);}return;}
  timer=setTimeout(()=>tick(generation),0);
}
function playGesture(now){
  const raw=gestureFromHands(state.hands,{oneHand:state.oneHand,raise:$('raise').checked,lower:$('lower').checked,swap:$('swap').checked});
  const current=stable.update(raw,now);state.gesture=current;
  audio.setChord(current?chordNotes(current,Number($('key').value)):[]);
  const keyboardPlaying=[...audio.voices.keys()].some(id=>!id.startsWith('gesture:'));
  audio.expression(keyboardPlaying?1:raw?.volume||0,keyboardPlaying?1:raw?.filter||0);
  $('note-label').textContent=current?chordLabel(current,Number($('key').value)):'Ready when you are';
  $('note-detail').textContent=current?`${DEGREES[current.degree-1]} · ${current.major?'major':'minor'}${current.low?' · lower octave':''}`:state.oneHand?'Show your left palm and raise a finger':'Show both palms and raise your fingers';
}
function playPaper(now){
  verifyCalibration(now);
  audio.expression(1,1);
  if(state.ready){
    const observations=paperObservations(state.hands,state.layout,state.profiles,Number($('octave').value));
    for(const e of taps.update(observations,now))e.type==='on'?audio.noteOn(e.id,e.midi,e.velocity):audio.release(e.id);
    const notes=[...audio.voices.values()].filter(v=>v.held).map(v=>noteName(v.midi));
    $('note-label').textContent=notes.length?[...new Set(notes)].join(' · '):'Your paper. Your piano.';$('note-detail').textContent='Lift, then tap · calibrated contact estimate';
  }else{$('note-label').textContent=state.editing?'Check the outline':state.calibration?'Teach it your touch':'A piano waiting to happen';$('note-detail').textContent=state.editing?'Drag the dots to align the drawing':state.calibration?'Follow the calibration steps':'Frame the drawing, then recognize the keyboard';}
}
function paint(time=0){if(!state.running)return;renderer.draw({hands:state.hands,layout:state.layout,editing:state.editing,target:Number($('edit-target').value)||0,mirror:$('mirror').checked,notes:[...audio.voices.values()].map(v=>v.midi),octave:Number($('octave').value),time,audio,mode:state.mode});highlight();animation=requestAnimationFrame(paint);}
function invalidatePaper(reason){releaseAll();clearPaper();$('scan').disabled=false;message(reason,true);}
async function scan(){
  if(!state.running||state.scan)return;releaseAll();clearPaper();state.scan=true;$('scan').disabled=true;$('scan').textContent='Recognizing…';message('Keep the drawing still and your hands out of the camera view.');const generation=state.generation;
  try{const image=captureImage(),layout=await vision.scan(image);if(generation!==state.generation)return;state.layout=layout;state.editing=true;$('alignment').hidden=false;step(1);setupEditTargets();message('Found eight white keys and five black keys. Check the overlay before confirming.');}
  catch(error){if(generation===state.generation)message(error.message,true);}
  finally{if(generation===state.generation){state.scan=false;$('scan').disabled=false;$('scan').textContent='Recognize again';}}
}
function editHandles(){if(!state.layout)return[];const l=state.layout;return [...l.corners.map((_,index)=>({type:'corner',index,label:['Top left','Top right','Bottom right','Bottom left'][index]})),...l.dividers.slice(1,-1).map((_,i)=>({type:'divider',index:i+1,label:`White boundary ${i+1}`})),...l.blacks.flatMap((b,index)=>[{type:'black-left',index,label:`${noteName(b.midi)} left edge`},{type:'black-right',index,label:`${noteName(b.midi)} right edge`}])];}
function setupEditTargets(){$('edit-target').replaceChildren(...editHandles().map((h,i)=>new Option(h.label,String(i))));readEdit();}
function readEdit(){const h=editHandles()[Number($('edit-target').value)];if(!h)return;const l=state.layout;let p;
  if(h.type==='corner')p=l.corners[h.index];else if(h.type==='divider')p={x:l.dividers[h.index],y:1};else{const b=l.blacks[h.index];p={x:b[h.type==='black-left'?'x0':'x1'],y:b.y1};}
  $('edit-x').value=(p.x*100).toFixed(1);$('edit-y').value=(p.y*100).toFixed(1);$('edit-y').disabled=h.type==='divider';
}
function updateEdit(x,y){const h=editHandles()[Number($('edit-target').value)];if(!h||!Number.isFinite(x)||!Number.isFinite(y))return;const l=state.layout,copy=structuredClone(l);x=clamp(x);y=clamp(y);
  if(h.type==='corner')l.corners[h.index]={x,y};else if(h.type==='divider')l.dividers[h.index]=clamp(x,l.dividers[h.index-1]+.04,l.dividers[h.index+1]-.04);else{const b=l.blacks[h.index];b[h.type==='black-left'?'x0':'x1']=x;b.y1=clamp(y,.2,.8);}
  if(!validateLayout(l))state.layout=copy;readEdit();
}
function confirmLayout(){if(!validateLayout(state.layout)){message('Check the corners and key boundaries first.',true);return;}state.editing=false;state.anchors=captureAnchors(captureImage(),state.layout.corners);state.drift=0;state.missingAnchors=0;$('alignment').hidden=true;$('calibration').hidden=false;step(2);message('Choose the fingers you want to play with. Each finger learns its own lifted and resting positions.');}
function beginCalibration(){
  const selected=[...$('finger-choices').querySelectorAll('input:checked')].map(i=>i.value);if(!selected.length){message('Select at least one finger.',true);return;}
  state.profiles={};state.ready=false;state.calibration={selected,index:0,phase:'rest',down:null,up:null,trial:null,presses:0};
  $('begin-calibration').hidden=true;$('finger-choices').closest('fieldset').hidden=true;$('capture-panel').hidden=false;calibrationPrompt();
}
function calibrationPrompt(){const cal=state.calibration;if(!cal)return;const [hand,finger]=cal.selected[cal.index].split(':'),name=`${hand.toLowerCase()} ${FINGERS[Number(finger)]}`;
  $('capture-instruction').textContent=`${cal.index+1} / ${cal.selected.length} — ${cal.phase==='rest'?`Rest your ${name} gently on a drawn white key.`:cal.phase==='lift'?`Lift that ${name}, keeping your palm in place.`:`Lift and tap that ${name} twice. Keep your palm in place.`}`;
  $('capture').textContent=cal.phase==='rest'?'Capture resting pose':'Capture lifted pose';$('capture').hidden=cal.phase==='verify';$('capture').disabled=false;$('capture-progress').value=0;
}
function captureCalibration(now){
  const capture=state.capture,cal=state.calibration;if(!capture||!cal)return;
  const [label,f]=cal.selected[cal.index].split(':'),hand=state.hands.find(h=>h.label===label);
  if(now-capture.started>8000){state.capture=null;$('capture').disabled=false;message('Capture timed out. Show the selected hand clearly, then retry.',true);return;}
  if(!hand)return;
  const tip=project(homography(state.layout.corners),hand.points[JOINTS[Number(f)][3]]);
  if(tip.x<0||tip.x>1||tip.y<-.25||tip.y>1.2)return;
  capture.samples.push(fingerFeatures(hand,Number(f)));$('capture-progress').value=capture.samples.length;
  if(capture.samples.length<24)return;
  state.capture=null;
  if(cal.phase==='rest'){cal.down=capture.samples;cal.phase='lift';calibrationPrompt();}
  else{
    try{cal.trial=calibrateFinger(cal.down,capture.samples);cal.phase='verify';cal.presses=0;cal.verifier=new TapDetector();calibrationPrompt();message('Now lift and tap twice to check this finger before continuing.');}
    catch(error){cal.phase='rest';calibrationPrompt();message(error.message,true);}
  }
}
function verifyCalibration(now){
  const cal=state.calibration;if(!cal||cal.phase!=='verify')return;
  const id=cal.selected[cal.index],[label,f]=id.split(':'),hand=state.hands.find(h=>h.label===label),obs=[];
  if(hand){const p=project(homography(state.layout.corners),hand.points[JOINTS[Number(f)][3]]);obs.push({id,midi:60,...contactScore(fingerFeatures(hand,Number(f)),cal.trial),valid:p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&contactScore(fingerFeatures(hand,Number(f)),cal.trial).valid});}
  for(const event of cal.verifier.update(obs,now))if(event.type==='on'){cal.presses++;$('capture-progress').value=cal.presses*12;message(`Tap ${cal.presses} of 2 detected.`);}
  if(cal.presses>=2){state.profiles[id]=cal.trial;cal.index++;if(cal.index>=cal.selected.length){state.calibration=null;state.ready=true;taps.reset();$('calibration').hidden=true;$('paper-ready').hidden=false;step(3);message('Ready. Lift your fingers, then tap the drawing. Contact detection is experimental; use Recalibrate if notes feel unreliable.');}else{cal.phase='rest';calibrationPrompt();}}
}
async function playKey(id,midi){
  held.set(id,midi);const loading=!['warm','bright','retro'].includes($('sound').value)&&!audio.buffers.has($('sound').value);
  if(loading)message('Loading this instrument. Play again when the sound is ready.');
  try{await prepareSound();if(loading)message('Sound ready. Play a few notes.');if(!held.has(id)||held.get(id)!==midi)return;audio.expression(1,1);audio.noteOn(id,midi);highlight();}catch(error){held.delete(id);message(error.message,true);}
}
function liftKey(id){held.delete(id);audio.release(id);highlight();}
function buildKeyboard(){
  for(let n=60;n<=72;n++){
    const black=BLACK_NOTES.includes(n),button=document.createElement('button');button.type='button';button.className=`piano-key${black?' black':''}`;button.dataset.midi=n;button.setAttribute('aria-label',`Play ${noteName(n)} (${keys[n-60].toUpperCase()})`);button.setAttribute('aria-pressed','false');
    const label=document.createElement('span');label.textContent=noteName(n);const small=document.createElement('small');small.textContent=keys[n-60].toUpperCase();button.append(label,small);
    if(black){const left=WHITE_NOTES.filter(x=>x<n).length;button.style.left=`calc(${left*12.5}% - 3.7%)`;}
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);playKey(`pointer:${e.pointerId}`,n+Number($('octave').value)*12);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>liftKey(`pointer:${e.pointerId}`));
    button.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();playKey(`accessible:${n}`,n+Number($('octave').value)*12);}});
    button.addEventListener('keyup',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();liftKey(`accessible:${n}`);}});button.addEventListener('blur',()=>liftKey(`accessible:${n}`));
    $('keyboard').append(button);keyButtons.set(n,button);
  }
}
function setMode(mode){
  if(mode===state.mode)return;stopCamera();state.mode=mode;state.facing=mode==='paper'?'environment':'user';$('mirror').checked=mode==='gesture';$('device').value='';$('camera').style.transform=$('mirror').checked?'scaleX(-1)':'';
  document.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});$('gesture-controls').hidden=mode!=='gesture';$('paper-controls').hidden=mode!=='paper';$('stage').classList.toggle('paper-idle',mode==='paper');
  $('sound').value=mode==='paper'?'piano':'retro';audio.bank=$('sound').value;bankPromise=null;$('sustain').checked=false;audio.setSustain(false);
  $('idle-label').textContent=mode==='paper'?'A PIECE OF PAPER. A WORLD OF POSSIBILITIES.':'NO KEYS. NO STRINGS. JUST YOU.';
  $('idle-title').innerHTML=mode==='paper'?'Bring paper to <em>life.</em>':'A show of <em>hands.</em>';
  $('idle-copy').innerHTML=mode==='paper'?'Draw a keyboard. Find your angle.<br>Make something worth listening to.':'Your left hand finds the chord.<br>Your right hand brings it to life.';
  $('note-eyebrow').textContent=mode==='paper'?'PAPER PIANO · EXPERIMENTAL':'GESTURE SYNTH';$('flip').textContent=state.facing==='user'?'Use rear camera ↻':'Use front camera ↻';$('tracking-label').textContent=mode==='paper'?'Draw a keyboard, then bring it into view.':'Your next instrument is already in your hands.';message('');
}
$('start').addEventListener('click',startCamera);$('stop').addEventListener('click',()=>stopCamera('Camera stopped. You can still play the keys below.'));
document.querySelectorAll('[data-mode]').forEach(b=>{b.addEventListener('click',()=>setMode(b.dataset.mode));b.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const mode=e.key==='Home'?'gesture':e.key==='End'?'paper':state.mode==='gesture'?'paper':'gesture';setMode(mode);$(mode==='gesture'?'gesture-tab':'paper-tab').focus();}});});
for(const[id,one]of [['one-hand',true],['two-hands',false]])$(id).addEventListener('click',()=>{state.oneHand=one;$('one-hand').setAttribute('aria-pressed',String(one));$('two-hands').setAttribute('aria-pressed',String(!one));releaseAll();});
for(const id of ['key','raise','lower','swap','octave'])$(id).addEventListener('change',releaseAll);
$('sound').addEventListener('change',async()=>{releaseAll();bankPromise=null;message('Loading your sound…');try{await prepareSound();message('Sound ready.');}catch(e){message(e.message,true);}});
$('volume').addEventListener('input',()=>{audio.volume=Number($('volume').value)/100;$('volume-value').value=`${$('volume').value}%`;audio.expression(state.mode==='gesture'&&state.running?(state.gesture?.volume||0):1,1);});
$('sustain').addEventListener('change',()=>{audio.setSustain($('sustain').checked);highlight();});
$('resume-audio').addEventListener('click',async()=>{try{await prepareSound();audio.expression(1,1);audio.noteOn('test',60,.5);setTimeout(()=>{audio.release('test',true);highlight();},350);message('Audio resumed. You should hear a short C.');}catch(e){message(e.message,true);}});
$('device').addEventListener('change',()=>{if(state.running||state.starting){stopCamera('Camera changed. Press Start camera and recalibrate your paper.');}});
$('flip').addEventListener('click',()=>{const facing=state.facing==='user'?'environment':'user';stopCamera('Camera direction changed. Press Start camera to continue.');state.facing=facing;$('device').value='';$('mirror').checked=facing==='user';$('camera').style.transform=$('mirror').checked?'scaleX(-1)':'';$('flip').textContent=facing==='user'?'Use rear camera ↻':'Use front camera ↻';});
$('mirror').addEventListener('change',()=>{$('camera').style.transform=$('mirror').checked?'scaleX(-1)':'';});$('camera').style.transform='scaleX(-1)';
$('scan').addEventListener('click',scan);$('confirm-layout').addEventListener('click',confirmLayout);$('edit-target').addEventListener('change',readEdit);
for(const id of ['edit-x','edit-y'])$(id).addEventListener('input',()=>updateEdit(Number($('edit-x').value)/100,Number($('edit-y').value)/100));
let dragging=false;
$('overlay').addEventListener('pointerdown',e=>{if(!state.editing)return;const rect=$('overlay').getBoundingClientRect(),point={x:e.clientX-rect.left,y:e.clientY-rect.top};let best=-1,min=28;renderer.handles.forEach((h,i)=>{const p=renderer.map(h.p),d=Math.hypot(p.x-point.x,p.y-point.y);if(d<min){min=d;best=i;}});if(best<0)return;dragging=true;$('edit-target').value=String(best);readEdit();$('overlay').setPointerCapture(e.pointerId);});
$('overlay').addEventListener('pointermove',e=>{if(!dragging||!state.editing)return;let p=renderer.unmap(e.clientX,e.clientY);const handle=editHandles()[Number($('edit-target').value)];if(handle.type!=='corner')p=project(homography(state.layout.corners),p);updateEdit(p.x,p.y);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('overlay').addEventListener(event,()=>{dragging=false;});
for(let f=0;f<5;f++)for(const hand of ['Left','Right']){const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.value=`${hand}:${f}`;i.checked=f===1;l.append(i,document.createTextNode(`${hand} ${FINGERS[f]}`));$('finger-choices').append(l);}
$('begin-calibration').addEventListener('click',beginCalibration);$('capture').addEventListener('click',()=>{state.capture={samples:[],started:performance.now()};$('capture').disabled=true;$('capture-progress').value=0;message('Hold this pose still while the bar fills.');});
$('cancel-calibration').addEventListener('click',()=>{state.capture=null;state.calibration=null;state.profiles={};$('capture-panel').hidden=true;$('begin-calibration').hidden=false;$('finger-choices').closest('fieldset').hidden=false;});
$('recalibrate').addEventListener('click',()=>{releaseAll();state.ready=false;state.profiles={};$('paper-ready').hidden=true;$('calibration').hidden=false;$('begin-calibration').hidden=false;$('finger-choices').closest('fieldset').hidden=false;$('capture-panel').hidden=true;step(2);});
for(const[button,dialog]of [['help','guide'],['credits','credit-dialog']]){const d=$(dialog);$(button).addEventListener('click',()=>{releaseAll();d.showModal();});d.querySelector('.dialog-close').addEventListener('click',()=>d.close());d.querySelector('.dialog-done')?.addEventListener('click',()=>d.close());d.addEventListener('click',e=>{if(e.target===d&&e.clientX<d.getBoundingClientRect().left)d.close();});}
document.addEventListener('keydown',e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]')||e.target.closest('input,select,textarea'))return;const i=keys.indexOf(e.key.toLowerCase());if(i>=0){e.preventDefault();playKey(`key:${e.key.toLowerCase()}`,60+i+Number($('octave').value)*12);}if(e.key==='Escape')releaseAll();});
document.addEventListener('keyup',e=>liftKey(`key:${e.key.toLowerCase()}`));
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();audio.context?.suspend();}});window.addEventListener('pagehide',()=>stopCamera());window.addEventListener('blur',()=>releaseAll());
window.addEventListener('orientationchange',()=>{if(state.mode==='paper'&&state.layout)invalidatePaper('Orientation changed. Recognize and calibrate the keyboard again.');});
buildKeyboard();
