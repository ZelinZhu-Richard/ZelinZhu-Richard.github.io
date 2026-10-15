import {CameraSession,VisionClient} from './camera.js';
import {observePose,captureTop,calibrate,measurePose,RepCounter,clamp} from './pose.js';
import {WorkoutHistory,dayKey,summary,STORAGE_KEY} from './history.js';
import {BirdGame} from './game.js';
import {drawPose,drawGame} from './render.js';
const $=id=>document.getElementById(id);
let storage;try{storage=localStorage;}catch{storage={getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}};}
const history=new WorkoutHistory(storage),camera=new CameraSession($('camera')),vision=new VisionClient(),counter=new RepCounter(),game=new BirdGame();
const state={mode:'counter',running:false,starting:false,generation:0,top:null,profile:null,capture:null,pose:null,measurement:null,session:0,paused:false,demo:false,facing:'user',compat:false,height:.5,countdown:null,keys:new Set(),moved:0};
let trackTimer,paintId,watchdog,lastResult=0,lastTrack=0,lastVideo=-1,lastPaint=0,fpsTime=0,frames=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function notice(text,error=false){$('notice').textContent=text;$('notice').hidden=!text;$('notice').classList.toggle('error',error);}
function cameraStatus(text,live=false){$('camera-status').textContent=text;$('camera-status').classList.toggle('live',live);}
function historyUI(){
  const s=summary(history.data);$('today').textContent=s.today;$('streak').textContent=s.current;$('best-streak').textContent=s.best;
  $('saved-label').textContent=history.available?'Saved on this device':'Saving unavailable · this session only';
  $('streak-copy').textContent=s.today?'Today counts. Come back tomorrow to keep it going.':s.current?'Your streak is waiting. Complete one push-up today to continue.':'One complete push-up starts your streak.';
  $('week').replaceChildren();for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const n=history.data.days[dayKey(d)]||0,li=document.createElement('li');li.className=`${n?'complete ':''}${i===0?'today':''}`;li.setAttribute('aria-label',`${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}: ${n} reps`);const label=document.createElement('span'),total=document.createElement('strong');label.textContent=i===0?'Today':d.toLocaleDateString(undefined,{weekday:'short'});total.textContent=n||'—';li.append(label,total);$('week').append(li);}
  $('best-score').textContent=`${state.demo?'Demo best':'Best flight'}: ${history.data[state.demo?'bestDemo':'bestBird']}`;
}
function setupUI(){
  const stage=state.profile?3:state.top?2:state.running?1:0;
  ['step-position','step-top','step-bottom'].forEach((id,i)=>{$(id).classList.toggle('current',i===stage);$(id).classList.toggle('done',i<stage);});
  $('capture').hidden=Boolean(state.profile);$('capture').disabled=!state.running||Boolean(state.capture);$('capture').textContent=state.capture?'Capturing…':state.top?'Capture lowered pose':'Capture raised pose';$('recalibrate').hidden=!state.running||(!state.top&&!state.profile);
  $('setup-status').textContent=state.profile?'Positions saved for this session. Return to the raised position to begin.':state.top?'Raised pose saved. Capture your lowered pose next.':'You’ll have five seconds to get into position, then hold still briefly.';
  $('pause').hidden=state.mode!=='counter'||!state.profile;$('pause').textContent=state.paused?'Resume set':'Pause set';
  $('game-start').hidden=state.mode!=='bird'||(!state.demo&&!state.profile);$('game-start').disabled=Boolean(state.countdown)||(!state.demo&&!state.measurement?.valid);
  $('game-pause').hidden=state.mode!=='bird'||!['playing','paused'].includes(game.status);$('game-pause').textContent=game.status==='paused'?'Resume flight':'Pause flight';
}
function gameUI(){
  $('game-cover').hidden=game.status==='playing'||Boolean(state.countdown);$('score').textContent=game.score;
  $('game-title').textContent=game.status==='over'?'A good place to begin again.':game.status==='paused'?'Take a breath.':'A different kind of flight.';
  $('game-copy').textContent=game.status==='over'?`${game.score} obstacles passed. Rest, then try another flight.`:game.status==='paused'?'Flight is paused. Resume when you’re ready.':state.demo?'Demo: move the slider or hold the arrow keys. No workout reps are saved.':'Push up to rise. Lower yourself to descend. Find your way through the gaps.';
  $('demo').hidden=state.demo||game.status!=='ready';$('game-start').textContent=game.status==='over'?'Fly again':game.status==='playing'?'Restart flight':'Start flight';
  $('demo-controls').hidden=!state.demo;$('best-score').hidden=state.mode!=='bird';setupUI();historyUI();
}
function resetCalibration(){state.profile=null;state.top=null;state.capture=null;state.countdown=null;state.measurement=null;state.moved=0;counter.reset();$('capture-overlay').hidden=true;$('height-meter').value=0;$('height-label').textContent='Waiting';setupUI();}
function stopCamera(text=''){
  state.generation++;state.running=false;state.starting=false;state.pose=null;state.paused=false;clearTimeout(trackTimer);clearInterval(watchdog);camera.stop();vision.stop();game.pause();resetCalibration();
  $('stage').classList.remove('running');$('camera-placeholder').hidden=false;$('start').hidden=false;$('start').disabled=false;$('start').textContent='Start camera';$('stop').hidden=true;$('fps').textContent='';cameraStatus(state.demo?'Demo · no camera':'Camera off');$('tracking').textContent='Camera access starts only when you choose.';$('rep-phase').textContent='Return to your raised pose after setup.';
  drawPose($('pose-canvas'),$('camera'),null,false,false);gameUI();if(text)notice(text);
}
async function startCamera(){
  if(state.starting||state.running)return;state.demo=false;game.reset($('pace').value);state.starting=true;const generation=++state.generation;
  $('start').disabled=true;$('start').textContent='Opening camera…';$('stop').hidden=false;cameraStatus('Loading');notice('Allow camera access. The pose model downloads from this site, then runs on your device.');gameUI();
  try{
    await camera.start({deviceId:$('device').value,facingMode:state.facing});if(generation!==state.generation)return;
    const kind=await vision.start();if(generation!==state.generation)return;
    state.compat=kind==='compatibility';state.running=true;state.starting=false;state.paused=false;resetCalibration();$('stage').classList.add('running');$('camera-placeholder').hidden=true;$('start').hidden=true;cameraStatus('Camera on',true);notice('Position your whole body sideways, then capture your raised pose.');
    const devices=await navigator.mediaDevices.enumerateDevices();if(generation!==state.generation)return;const selected=$('device').value;$('device').replaceChildren(new Option('Default camera',''),...devices.filter(d=>d.kind==='videoinput').map((d,i)=>new Option(d.label||`Camera ${i+1}`,d.deviceId)));$('device').value=selected;
    camera.stream.getVideoTracks()[0].onended=()=>{if(state.running)stopCamera('Camera disconnected. Reconnect and start again.');};
    lastResult=performance.now();lastTrack=0;lastVideo=-1;frames=0;fpsTime=lastResult;
    watchdog=setInterval(()=>{if(state.running&&performance.now()-lastResult>550){state.measurement=null;counter.reset();pauseFlight('Tracking paused. Return to view and resume when ready.');$('tracking').textContent='Waiting for fresh camera frames…';}},150);
    tick(generation);
  }catch(e){if(generation!==state.generation)return;stopCamera();const hints={NotAllowedError:'Camera permission was denied. Allow access in site settings and retry, or try the bird demo.',NotFoundError:'No camera found. Connect one or try the bird demo.',NotReadableError:'Camera is busy. Close other apps using it and retry.',OverconstrainedError:'That camera is unavailable. Select Default camera and retry.'};notice(hints[e.name]||`${e.message} Try restarting the camera.`,true);}
}
function pauseFlight(reason){
  if(game.status==='playing'||state.countdown){game.pause();state.countdown=null;$('capture-overlay').hidden=true;gameUI();if(reason)notice(reason);}
}
async function tick(generation){
  if(!state.running||generation!==state.generation)return;
  const now=performance.now(),interval=state.compat?100:45;
  if(now-lastTrack<interval||$('camera').currentTime===lastVideo){trackTimer=setTimeout(()=>tick(generation),15);return;}
  lastTrack=now;lastVideo=$('camera').currentTime;
  try{
    const result=await vision.track($('camera'),now);if(generation!==state.generation)return;lastResult=performance.now();
    const pose=observePose(result,$('camera').videoWidth/$('camera').videoHeight,state.profile?.side||state.top?.side);state.pose=pose;
    const m=measurePose(pose,state.profile);state.measurement=m;
    if(pose.valid&&state.capture)collectPose(pose,now);
    if(state.profile){
      state.moved=m.moved?state.moved+1:0;
      if(state.moved>=3){pauseFlight();resetCalibration();notice('Your position or camera moved. Capture your positions again.',true);}
      else if(m.valid){state.height=state.height*.35+m.height*.65;$('height-meter').value=m.height;$('height-label').textContent=m.up?'Raised':m.down?'Lowered':'Moving';
        const counting=state.mode==='counter'?!state.paused:game.status==='playing';
        if(counting&&counter.update(m,now)){state.session++;$('reps').textContent=state.session;history.recordRep();historyUI();}
        if(!counting)counter.reset();
        $('rep-phase').textContent=state.paused?'Set paused.':counter.phase==='down'?'Push back up to complete the rep.':counter.phase==='up'?'Lower, then return to the top.':'Return to your raised pose.';
      }else{counter.reset();$('height-label').textContent='Not tracking';pauseFlight('Tracking paused. Return to view, then choose Resume flight.');}
    }
    $('tracking').textContent=!pose.valid?pose.reason:state.profile?(m.valid?'Body in view · positions calibrated':m.reason):'Body in view · ready to capture your position';
    if(state.capture&&now>state.capture.deadline){state.capture=null;$('capture-overlay').hidden=true;notice('Capture timed out. Keep your whole body visible and retry.',true);setupUI();}
    frames++;if(now-fpsTime>1400){$('fps').textContent=`${Math.round(frames*1000/(now-fpsTime))} fps${state.compat?' · compatibility':''}`;frames=0;fpsTime=now;}setupUI();
  }catch(e){if(generation===state.generation){stopCamera();notice(`Pose tracking stopped: ${e.message} Restart the camera to retry.`,true);}return;}
  trackTimer=setTimeout(()=>tick(generation),0);
}
function collectPose(pose,now){
  const c=state.capture;if(now<c.starts)return;
  c.samples.push(pose);if(c.samples.length<16||now-c.starts<700)return;
  state.capture=null;$('capture-overlay').hidden=true;
  try{if(!state.top){state.top=captureTop(c.samples);notice('Raised pose captured. Now capture your lowered pose.');}
    else{state.profile=calibrate(state.top,c.samples);state.height=.5;counter.reset();notice(state.mode==='bird'?'Ready. Return to the raised position, then Start flight.':'Ready. Return to the raised position, then lower and push back up.');}
  }catch(e){notice(e.message,true);}setupUI();
}
function beginCapture(){if(!state.running||state.capture)return;counter.reset();game.pause();const now=performance.now();state.capture={starts:now+5000,deadline:now+18000,samples:[]};$('capture-overlay').hidden=false;$('stage').scrollIntoView({block:'center',behavior:reduced?'instant':'smooth'});notice('Five seconds to get into position. Hold still when the countdown finishes.');setupUI();}
function setMode(mode){
  if(state.mode===mode)return;stopCamera();state.mode=mode;state.demo=false;cameraStatus('Camera off');game.reset($('pace').value);state.keys.clear();
  document.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});$('counter-panel').hidden=mode!=='counter';$('bird-panel').hidden=mode!=='bird';$('game-canvas').hidden=mode!=='bird';$('stage').classList.toggle('bird-mode',mode==='bird');$('pace-field').hidden=mode!=='bird';$('new-set').hidden=mode==='bird';gameUI();notice('');
}
function startFlight(resume=false){
  if(!state.demo&&!state.measurement?.valid){notice('Return to your calibrated position before starting a flight.',true);return;}
  counter.reset();if(!resume)game.reset($('pace').value);game.status='paused';state.countdown={until:performance.now()+3000};$('capture-overlay').hidden=false;gameUI();notice('');
}
function demo(){stopCamera();state.demo=true;state.height=.5;$('demo-height').value='50';cameraStatus('Demo · no camera');$('tracking').textContent='Demo controls do not count push-ups or earn streaks.';startFlight();gameUI();}
function paint(time){
  const dt=lastPaint?Math.min((time-lastPaint)/1000,.06):0;lastPaint=time;
  if(state.running)drawPose($('pose-canvas'),$('camera'),state.pose?.points,$('mirror').checked,state.measurement?.valid);
  if(state.capture){const left=Math.ceil((state.capture.starts-time)/1000);$('capture-count').textContent=left>0?left:'Hold';$('capture-prompt').textContent=`${state.top?'Lowered':'Raised'} position · ${left>0?'get ready':'keep still'}`;}
  if(state.countdown){const left=Math.ceil((state.countdown.until-time)/1000);$('capture-count').textContent=Math.max(1,left);$('capture-prompt').textContent='Find your starting height';if(left<=0){state.countdown=null;$('capture-overlay').hidden=true;game.resume();gameUI();}}
  if(state.mode==='bird'){
    if(state.demo){const direction=(state.keys.has('ArrowUp')?1:0)-(state.keys.has('ArrowDown')?1:0);state.height=clamp(state.height+direction*dt*.65);$('demo-height').value=String(Math.round(state.height*100));}
    const before=game.status,score=game.score;game.step(dt,state.height);drawGame($('game-canvas'),game,time,reduced);
    if(score!==game.score){$('score').textContent=game.score;history.recordScore(game.score,state.demo);historyUI();}
    if(before!==game.status){counter.reset();gameUI();}
  }
  paintId=requestAnimationFrame(paint);
}
$('start').addEventListener('click',startCamera);$('stop').addEventListener('click',()=>stopCamera(history.available?'Camera stopped. Your completed reps are saved on this device.':'Camera stopped. Saving is unavailable; your completed reps remain in this session.'));
$('capture').addEventListener('click',beginCapture);$('recalibrate').addEventListener('click',()=>{pauseFlight();resetCalibration();notice('Capture both positions again.');});
$('pause').addEventListener('click',()=>{state.paused=!state.paused;counter.reset();setupUI();});$('new-set').addEventListener('click',()=>{state.session=0;$('reps').textContent='0';counter.reset();notice('New set. Today’s completed reps and streak are kept.');});
$('game-start').addEventListener('click',()=>startFlight());$('game-pause').addEventListener('click',()=>{if(game.status==='paused')startFlight(true);else pauseFlight('Flight paused. Take your time.');});$('demo').addEventListener('click',demo);
$('demo-height').addEventListener('input',()=>{state.height=Number($('demo-height').value)/100;});$('exit-demo').addEventListener('click',()=>{state.demo=false;state.keys.clear();game.reset();stopCamera('Start the camera and calibrate your positions to fly with your body.');});
$('pace').addEventListener('change',()=>{pauseFlight();game.reset($('pace').value);gameUI();});
for(const b of document.querySelectorAll('[data-mode]')){b.addEventListener('click',()=>setMode(b.dataset.mode));b.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const m=e.key==='Home'?'counter':e.key==='End'?'bird':state.mode==='counter'?'bird':'counter';setMode(m);$(m==='bird'?'bird-tab':'counter-tab').focus();}});}
$('device').addEventListener('change',()=>stopCamera('Camera selection changed. Start again and recalibrate.'));
$('flip').addEventListener('click',()=>{state.facing=state.facing==='user'?'environment':'user';stopCamera('Camera direction changed. Start again and recalibrate.');$('device').value='';$('mirror').checked=state.facing==='user';mirror();$('flip').textContent=state.facing==='user'?'Use rear camera':'Use front camera';});
function mirror(){$('camera').style.transform=$('mirror').checked?'scaleX(-1)':'';}$('mirror').addEventListener('change',mirror);mirror();
$('help').addEventListener('click',()=>{const open=$('guide').hidden;$('guide').hidden=!open;$('help').setAttribute('aria-expanded',String(open));});
$('erase').addEventListener('click',()=>{$('erase-confirm').hidden=false;$('erase-yes').focus();});$('erase-no').addEventListener('click',()=>{$('erase-confirm').hidden=true;$('erase').focus();});$('erase-yes').addEventListener('click',()=>{const erased=history.clear();state.session=0;$('reps').textContent='0';counter.reset();$('erase-confirm').hidden=true;historyUI();notice(erased?'Saved Gym progress erased.':'Browser storage could not be cleared. Check your browser’s site settings.',!erased);$('erase').focus();});
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){history.load();historyUI();}});setInterval(historyUI,30000);
window.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea,summary,[role=tab]')||e.ctrlKey||e.metaKey||e.altKey)return;if(state.demo&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();state.keys.add(e.key);}if(e.code==='Space'&&state.mode==='bird'&&!e.target.closest('button')){e.preventDefault();if(!e.repeat){if(game.status==='playing')pauseFlight();else if(game.status==='paused')startFlight(true);}}});
window.addEventListener('keyup',e=>state.keys.delete(e.key));window.addEventListener('blur',()=>{state.keys.clear();counter.reset();state.paused=true;pauseFlight('Paused while the window is inactive.');setupUI();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.keys.clear();stopCamera('Camera stopped while the page was hidden. Start again to continue.');}else historyUI();});window.addEventListener('pagehide',()=>{stopCamera();cancelAnimationFrame(paintId);});window.addEventListener('pageshow',e=>{if(e.persisted){lastPaint=0;cancelAnimationFrame(paintId);paintId=requestAnimationFrame(paint);historyUI();}});window.addEventListener('orientationchange',()=>{if(state.running){pauseFlight();resetCalibration();notice('Orientation changed. Recalibrate your positions.');}});
historyUI();setupUI();gameUI();paintId=requestAnimationFrame(paint);
