import { angle, distance, homography, project, keyAt } from './geometry.js';
import { JOINTS } from './hands.js';
import { clamp } from './music.js';
export function fingerFeatures(hand, finger) {
  const p=hand.points,[m,j,d,t]=JOINTS[finger],scale=Math.max(.025,distance(p[5],p[17]));
  return [(180-angle(p[m],p[j],p[t]))/90, (p[t].z-p[j].z)/scale, (p[t].y-p[j].y)/scale];
}
const mean = rows => rows[0].map((_,i)=>rows.reduce((s,r)=>s+r[i],0)/rows.length);
export function calibrateFinger(down, up) {
  if(down.length<12||up.length<12)throw new Error('Keep your finger visible and steady for the full capture.');
  const contact=mean(down),raised=mean(up);
  const variance=contact.map((_,i)=>Math.max(.0025,[...down,...up].reduce((s,r,j)=>s+(r[i]-(j<down.length?contact[i]:raised[i]))**2,0)/(down.length+up.length)));
  const separation=contact.reduce((s,n,i)=>s+(n-raised[i])**2/variance[i],0);
  if(separation<9)throw new Error('The lifted and resting poses look too similar. Angle the camera lower and lift this finger higher.');
  return {contact,raised,variance,separation};
}
export function contactScore(features, profile) {
  const delta=profile.contact.map((n,i)=>n-profile.raised[i]);
  const score=features.reduce((s,n,i)=>s+(n-profile.raised[i])*delta[i]/profile.variance[i],0)/profile.separation;
  const residual=features.reduce((s,n,i)=>s+(n-(profile.raised[i]+clamp(score)*delta[i]))**2/profile.variance[i],0);
  return {score:clamp(score),valid:residual<30};
}
export class TapDetector {
  constructor() { this.reset(); }
  reset() { this.states=new Map(); }
  update(observations,time) {
    const events=[],seen=new Set();
    for(const o of observations){
      seen.add(o.id);
      let s=this.states.get(o.id);
      if(!s){s={armed:false,note:null,downFrames:0,upFrames:0,last:time};this.states.set(o.id,s);}
      s.last=time;
      if(!o.valid||o.midi===null){
        if(s.note!==null)events.push({type:'off',id:o.id,midi:s.note});
        s.note=null;s.armed=false;s.downFrames=0;continue;
      }
      if(o.score<.32){
        s.upFrames++;s.downFrames=0;
        if(s.upFrames>=2){if(s.note!==null)events.push({type:'off',id:o.id,midi:s.note});s.note=null;s.armed=true;}
      }else{
        s.upFrames=0;
        if(s.note!==null&&s.note!==o.midi){events.push({type:'off',id:o.id,midi:s.note});s.note=null;s.armed=false;}
        if(o.score>.72&&s.armed){
          s.downFrames++;
          if(s.downFrames>=2){s.note=o.midi;s.armed=false;events.push({type:'on',id:o.id,midi:o.midi,velocity:.75});}
        }else s.downFrames=0;
      }
    }
    for(const [id,s] of this.states)if(!seen.has(id)&&time-s.last>100){if(s.note!==null)events.push({type:'off',id,midi:s.note});this.states.delete(id);}
    return events;
  }
}
export function paperObservations(hands,layout,profiles,octave=0){
  const transform=homography(layout.corners),out=[];
  for(const hand of hands)for(let f=0;f<5;f++){
    const id=`${hand.label}:${f}`,profile=profiles[id];
    if(!profile)continue;
    const p=project(transform,hand.points[JOINTS[f][3]]),midi=keyAt(layout,p),c=contactScore(fingerFeatures(hand,f),profile);
    out.push({id:`paper:${id}`,midi:midi===null?null:midi+octave*12,...c});
  }
  return out;
}
