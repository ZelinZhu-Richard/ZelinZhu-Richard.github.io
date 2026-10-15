export const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function angle(a,b,c){const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y};return Math.acos(clamp((u.x*v.x+u.y*v.y)/(Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)||1),-1,1))*180/Math.PI;}
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const sides={left:[11,13,15,23,27],right:[12,14,16,24,28]};
export function observePose(result,aspect=16/9,lockedSide=null){
  if(result.landmarks?.length!==1)return {valid:false,reason:result.landmarks?.length>1?'Only one person should be in view.':'Step into view with your whole body visible.'};
  const points=result.landmarks[0];
  const score=side=>Math.min(...sides[side].map(i=>Math.min(points[i]?.visibility??0,points[i]?.presence??1)));
  const side=lockedSide||(score('left')>=score('right')?'left':'right');
  if(score(side)<.65)return {valid:false,reason:'Keep your shoulder, elbow, wrist, hip, and ankle visible.'};
  const selected=sides[side].map(i=>points[i]);
  if(selected.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<.015||p.x>.985||p.y<.015||p.y>.985))return {valid:false,reason:'Move the camera back to fit your whole body.'};
  const [s,e,w,h,a]=selected.map(p=>({x:p.x*aspect,y:p.y}));
  const support=distance(w,a),body=distance(s,a);
  if(support<.28||body<.3||Math.abs(s.x-a.x)<Math.abs(s.y-a.y)*1.2)return {valid:false,reason:'Use a side view, with your body across the camera.'};
  if(angle(s,h,a)<145)return {valid:false,reason:'Keep your shoulders, hips, and ankles in a line.'};
  const height=Math.abs((a.x-w.x)*(s.y-w.y)-(a.y-w.y)*(s.x-w.x))/support/support;
  return {valid:true,side,points,angle:angle(s,e,w),height,support,wrist:{x:w.x/aspect,y:w.y},ankle:{x:a.x/aspect,y:a.y}};
}
function summarize(samples){
  if(samples.length<12||samples.some(s=>!s.valid)||new Set(samples.map(s=>s.side)).size!==1)throw new Error('Keep the same side of your body visible and try capturing again.');
  const angle=median(samples.map(s=>s.angle)),height=median(samples.map(s=>s.height));
  if(median(samples.map(s=>Math.abs(s.angle-angle)))>7||median(samples.map(s=>Math.abs(s.height-height)))>.025)throw new Error('That pose moved too much. Hold still briefly and try again.');
  return {angle,height,side:samples[0].side,support:median(samples.map(s=>s.support)),wrist:{x:median(samples.map(s=>s.wrist.x)),y:median(samples.map(s=>s.wrist.y))},ankle:{x:median(samples.map(s=>s.ankle.x)),y:median(samples.map(s=>s.ankle.y))}};
}
export function captureTop(samples){const top=summarize(samples);if(top.angle<145)throw new Error('Capture the raised position with your arms comfortably extended.');return top;}
export function calibrate(top,samples){
  const bottom=summarize(samples);
  if(top.side!==bottom.side||top.angle-bottom.angle<30||bottom.angle>125||top.height-bottom.height<.07)throw new Error('The positions are too similar. Lower your body, bend your elbows, and capture again.');
  if(distance(top.wrist,bottom.wrist)>.09||distance(top.ankle,bottom.ankle)>.09||Math.abs(top.support/bottom.support-1)>.2)throw new Error('Your position or camera shifted. Start calibration again.');
  return {top,bottom,side:top.side};
}
export function measurePose(p,profile){
  if(!p?.valid||!profile)return {valid:false,reason:p?.reason||'Calibrate your raised and lowered positions first.'};
  const {top,bottom}=profile;
  if(p.side!==profile.side||distance(p.wrist,top.wrist)>.10||distance(p.ankle,top.ankle)>.10||Math.abs(p.support/top.support-1)>.23)return {valid:false,moved:true,reason:'Your position changed. Keep the camera fixed and recalibrate.'};
  const extension=(p.angle-bottom.angle)/(top.angle-bottom.angle),height=(p.height-bottom.height)/(top.height-bottom.height);
  if(Math.abs(extension-height)>.65||height<-.5||height>1.6)return {valid:false,reason:'Keep the same side view and move your body and arms together.'};
  return {valid:true,height:clamp(height),extension:clamp(extension),up:height>.76&&extension>.78,down:height<.28&&extension<.28};
}
export class RepCounter {
  constructor(){this.reset();}
  reset(){this.phase='ready';this.zone=null;this.since=0;this.started=0;this.last=null;}
  update(p,time){
    if(!p?.valid){this.reset();return false;}
    if(this.last!==null&&(time-this.last>450||time<this.last))this.reset();
    this.last=time;
    if(this.phase!=='ready'&&time-this.started>20000)this.reset();
    const zone=p.up?'up':p.down?'down':'middle';
    if(zone!==this.zone){this.zone=zone;this.since=time;}
    if(time-this.since<130)return false;
    if(this.phase==='ready'&&zone==='up'){this.phase='up';this.started=time;}
    else if(this.phase==='up'&&zone==='down'&&time-this.started>=180)this.phase='down';
    else if(this.phase==='down'&&zone==='up'){
      const completed=time-this.started>=650;this.phase='up';this.started=time;return completed;
    }
    return false;
  }
}
