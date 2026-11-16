import {clamp,mix,smooth,interval,sceneProgress,beatAt,windStrength,transformationState,workshopState,sparkState,rescueState} from './model.js';
const root=document.documentElement,button=document.querySelector('.motion-toggle');
const media=matchMedia('(prefers-reduced-motion: reduce)');
const scenes=[...document.querySelectorAll('[data-scene]')].map(el=>({
 el,id:el.dataset.scene,beats:[...el.querySelectorAll('.beat')],morph:el.querySelector('[data-transform]'),
 parts:[...el.querySelectorAll('[data-part]')],voices:[...el.querySelectorAll('.voice')],
 find:s=>el.querySelector(s)
}));
let choice=null;try{choice=localStorage.getItem('duke-motion');}catch{}
let enabled=choice===null?!media.matches:choice==='on',frame=0,lastY=scrollY,lastTime=performance.now(),wind=0,windTimer;
const set=(el,values)=>{if(el)for(const [key,value]of Object.entries(values))el.style[key]=value;};
function morph(scene,t){
 const state=transformationState(t);scene.el.dataset.transformStage=String(state.from);
 // Keep the lower adjacent image opaque, so the dragon never becomes translucent.
 scene.morph?.querySelectorAll('.variant').forEach((img,i)=>img.style.opacity=i===state.from?1:i===state.to?state.blend:0);
}
function render(scene,p,moving){
 const {el,id,find}=scene;
 el.dataset.progress=p.toFixed(4);
 const active=id==='rescue'?rescueState(p).beat:beatAt(p,scene.beats.map(b=>Number(b.dataset.start)));
 scene.beats.forEach((b,i)=>b.classList.toggle('is-active',active===i));
 // Each write comes only from current scene progress; reverse scroll has no history.
 if(id==='edge'){
  set(find('.environment'),{transform:moving?'scale('+mix(1.1,1,p)+') translateX('+mix(-2,0,p)+'%)':'none'});
  set(find('.standing-mascot'),{transform:moving?'translateX('+mix(35,0,smooth(p))+'%)':'none'});
 }
 if(id==='reason'){
  scene.voices.forEach((v,i)=>set(v,{transform:'scaleY('+[1,.3,.12][i]+')'}));
 }
 if(id==='table'||id==='open-seat'||id==='dawn'||id==='breakfast'){
  set(find('.illustration'),{transform:moving?'scale('+mix(1.025,1,p)+')':'none'});
 }
 if(id==='workshop'){
  const s=workshopState(p);el.dataset.assemblyStage=String(s.stage);
  scene.parts.forEach((part,i)=>set(part,{opacity:moving?s.parts[i]:1,transform:moving?'translateY('+(1-s.parts[i])*40+'px)':'none'}));
  scene.voices.forEach((voice,i)=>set(voice.querySelector('svg'),{transform:'scaleY('+(moving?s.voices[i]:1)+')'}));
  set(find('.revision-mark'),{opacity:moving?s.revision:1});
 }
 if(id==='little-blue')morph(scene,moving?mix(0,.6,smooth(p)):.5);
 if(id==='becoming')morph(scene,moving?mix(.6,1,smooth(p)):1);
 if(id==='midnight'){
  const loss=smooth(p);
  set(find('.environment'),{filter:'grayscale('+loss+') brightness(.4)'});
  set(find('.midnight-mascot'),{filter:'grayscale('+loss+')'});
  [...el.querySelectorAll('.escape-spark')].forEach((s,i)=>set(s,{transform:moving?'translate('+mix(0,20-i*15,loss)+'px,'+mix(20,-130,loss)+'px)':'none',opacity:mix(.3,1,loss)}));
 }
 if(id==='assignment')set(find('.offered-lantern'),{transform:moving?'translateX('+mix(30,0,smooth(p))+'px)':'none'});
 if(id==='noodles'){
  const s=sparkState(p,1),q=moving?s.travel:0;
  el.dataset.sparks=String(s.count);
  set(find('.noodle-spark'),{left:mix(46.5,66.8,q)+'%',top:(mix(72,80,q)-Math.sin(q*Math.PI)*27)+'%',opacity:1-q*.4});
 }
 if(id==='chase'){
  const s=sparkState(p,2),q=smooth(p);el.dataset.sparks=String(s.count);
  set(find('.environment'),{transform:moving?'scale(1.12) translateX('+mix(3,-3,q)+'%)':'none'});
  set(find('.running-mascot'),{transform:moving?'translateX('+mix(-30,90,q)+'%)':'none'});
  set(find('.flying-dragon'),{transform:moving?'translate('+mix(-45,20,q)+'%,'+mix(10,-20,q)+'%) rotate('+mix(-4,3,q)+'deg)':'none'});
  const small=innerWidth<=700,actorWidth=small?36:30,flightWidth=small?44:37,flightHeight=flightWidth*(small?1.25:1.5)/1.5;
  const flightX=48+flightWidth*mix(-.45,.2,q),flightY=12+flightHeight*mix(.1,-.2,q);
  set(find('.chase-spark'),{left:mix(82,flightX+flightWidth*.22-2,s.travel)+'%',top:mix(29,flightY+flightHeight*.42-2,s.travel)+'%',opacity:1-s.travel*.2});
  set(find('.chase-lantern'),{left:(15+actorWidth*(mix(-.3,.9,q)+.89)-3.5)+'%',top:'69%'});
  set(find('.chase-lantern .lantern-light'),{opacity:s.glow});
 }
 if(id==='chapel'){
  set(find('.chapel-tower'),{transform:moving?'translateY('+mix(0,44,smooth(p))+'%)':'none'});
  set(find('.chapel-mascot'),{opacity:moving?1-smooth(interval(p,.15,.5)):1});
  set(find('.chapel-dragon'),{transform:moving?'translateY('+mix(45,-20,smooth(p))+'%)':'none'});
 }
 if(id==='rescue'){
  const s=rescueState(p);el.dataset.catch=s.catchLight===1?'complete':s.hold?'hold':s.catchCord===1?'cord':'ascent';
  el.dataset.sparks=s.catchLight===1?'3':'2';
  set(find('.rescue-tower'),{transform:moving?'translateY('+s.camera+'%)':'none'});
  set(find('.rescue-dragon'),{left:s.dragonX+'%',top:s.dragonY+'%',transform:moving?'rotate('+mix(-8,3,s.catchLight)+'deg)':'none'});
  set(find('.rescue-lantern'),{left:s.lanternX+'%',top:s.lanternY+'%',transform:moving?'rotate('+mix(8,-9,s.slip)*(1-s.catchLight)+'deg)':'none'});
  set(find('.catching-mascot'),{transform:'none'});
  const lx=s.lanternX+5,ly=(s.lanternY+1.5)*2/3;
  find('.cord path').setAttribute('d','M35.5 30.6 Q'+(lx-4)+' '+(ly+mix(10,1,s.catchCord))+' '+lx+' '+ly);
  set(find('.cord'),{opacity:mix(.3,1,s.catchCord)});
  set(find('.rescue-spark'),{left:mix(83,60,s.catchLight)+'%',top:mix(12,34,s.catchLight)+'%'});
  set(find('.lantern-light'),{opacity:mix(.3,1,s.catchLight)});
  set(find('.catch-flash'),{opacity:s.catchLight*.35});
  set(find('.wind'),{opacity:moving?(.1+wind*.6)*s.wind:0,transform:moving?'translateY('+((p*180)%30)+'%)':'none'});
 }
 if(id==='blue-returns'){
  morph(scene,moving?smooth(p):1);
  set(find('.standing-mascot'),{filter:'grayscale('+(1-smooth(p))+')'});
  set(find('.environment'),{filter:'saturate('+mix(0,1,smooth(p))+') brightness('+mix(.45,1,smooth(p))+')'});
  set(find('.blue-wave'),{clipPath:'inset(0 0 '+(1-smooth(p))*100+'% 0)',opacity:mix(.65,.1,smooth(p))});
 }
}
function draw(){
 frame=0;
 const h=innerHeight,measured=scenes.map(scene=>({scene,rect:scene.el.getBoundingClientRect()}));
 for(const {scene,rect} of measured){
  // Static reading renders every scene; animated offscreen scenes can wait until near view.
  if(!enabled||rect.bottom>-h&&rect.top<h*2)render(scene,enabled?sceneProgress(rect.top,rect.height,h):1,enabled);
 }
}
function schedule(){if(!frame)frame=requestAnimationFrame(draw);}
function applyMode(preserve=false){
 let anchor=null;
 if(preserve){
  const visible=scenes.find(s=>{const r=s.el.getBoundingClientRect();return r.top<=innerHeight*.5&&r.bottom>innerHeight*.5;});
  if(visible)anchor={scene:visible,beat:visible.beats.findIndex(b=>b.classList.contains('is-active'))};
 }
 root.classList.toggle('enhanced',enabled);root.classList.toggle('reading-mode',!enabled);
 button.hidden=false;button.setAttribute('aria-pressed',String(!enabled));
 button.querySelector('span').textContent=enabled?'Motion off':'Motion on';
 if(anchor){
  const target=enabled?anchor.scene.el:anchor.scene.beats[Math.max(0,anchor.beat)];
  const top=target.getBoundingClientRect().top+scrollY;
  scrollTo({top:enabled?top+(anchor.scene.el.offsetHeight-innerHeight)*(anchor.beat/anchor.scene.beats.length):top-100,behavior:'instant'});
 }
 schedule();
}
button.addEventListener('click',()=>{
 enabled=!enabled;choice=enabled?'on':'off';
 try{localStorage.setItem('duke-motion',choice);}catch{}
 applyMode(true);
});
media.addEventListener('change',()=>{if(choice===null){enabled=!media.matches;applyMode(true);}});
addEventListener('scroll',()=>{
 const now=performance.now();wind=windStrength(scrollY-lastY,now-lastTime);lastY=scrollY;lastTime=now;
 schedule();clearTimeout(windTimer);windTimer=setTimeout(()=>{wind=0;schedule();},140);
},{passive:true});
addEventListener('resize',schedule,{passive:true});
addEventListener('pageshow',schedule);
document.fonts.ready.then(schedule);
const prepare=new IntersectionObserver(entries=>{
 for(const entry of entries)if(entry.isIntersecting){
  entry.target.querySelectorAll('img').forEach(img=>{img.loading='eager';img.decode?.().catch(()=>{});});
  prepare.unobserve(entry.target);
 }
},{rootMargin:'100% 0px'});
scenes.forEach(scene=>prepare.observe(scene.el));
document.querySelector('.replay')?.addEventListener('click',()=>{
 const title=document.querySelector('#story-title');title.tabIndex=-1;title.focus({preventScroll:true});
});
applyMode();
