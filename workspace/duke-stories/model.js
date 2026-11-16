// Pure scene mathematics, adapted from the reviewed Wings motion pattern.
export const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,Number.isFinite(v)?v:min));
export const mix=(a,b,p)=>a+(b-a)*clamp(p);
export const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
export const interval=(p,a,b)=>clamp((p-a)/(b-a));
export function sceneProgress(top,height,viewport){
 if(![top,height,viewport].every(Number.isFinite))return 0;
 return height>viewport?clamp(-top/(height-viewport)):top<=0?1:0;
}
export const beatAt=(p,starts)=>Math.max(0,starts.findLastIndex(s=>clamp(p)>=s));
export const windStrength=(dy,dt)=>Number.isFinite(dy)&&dt>0?clamp(Math.abs(dy)/dt/2.5):0;
export function transformationState(progress){
 const position=clamp(progress)*4,from=Math.floor(position),to=Math.min(4,from+1),blend=smooth(position-from);
 const weights=Array(5).fill(0);weights[from]=1-blend;weights[to]+=blend;
 return {from,to,blend,weights};
}
export const ASSEMBLY_THRESHOLDS=Object.freeze([.12,.30,.50,.70]);
export function workshopState(progress){
 const p=clamp(progress);
 return {stage:ASSEMBLY_THRESHOLDS.filter(v=>p>=v).length,
  parts:ASSEMBLY_THRESHOLDS.map(v=>smooth(interval(p,v,v+.12))),
  voices:[1,mix(.3,1,smooth(interval(p,.36,.70))),mix(.12,1,smooth(interval(p,.58,.90)))],
  revision:smooth(interval(p,.74,.92))};
}
export function sparkState(progress,number=1){
 const p=clamp(progress),travel=smooth(interval(p,.50,.86)),collected=p>=.86;
 return {number,travel,collected,count:number-1+Number(collected),glow:mix(.2,1,travel)};
}
export function rescueState(progress){
 const p=clamp(progress),ascent=smooth(interval(p,0,.45)),slip=smooth(interval(p,.40,.68));
 const catchCord=smooth(interval(p,.68,.76)),catchLight=smooth(interval(p,.88,1));
 return {ascent,slip,catchCord,catchLight,hold:p>=.76&&p<.88,
  dragonX:mix(64,62,ascent)-catchLight*8,dragonY:mix(42,10,ascent)+catchLight*12,
  lanternX:mix(53,45,slip),lanternY:mix(25,50,slip)-catchLight*5,
  camera:mix(0,24,ascent),wind:1-catchLight,
  beat:beatAt(p,[0,.68,.88])};
}
export const TRANSFORM_TIMES=Object.freeze([0,.25,.50,.75,1]);
