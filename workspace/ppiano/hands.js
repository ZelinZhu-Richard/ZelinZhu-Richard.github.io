import { angle, distance } from './geometry.js';
import { clamp, easyChord, countingChord } from './music.js';
export const FINGERS = ['thumb','index','middle','ring','pinky'];
export const JOINTS = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
export const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export class HandTracker {
  constructor() { this.reset(); }
  reset() { this.tracks = []; this.next = 1; }
  update(result, time) {
    const previous = this.tracks.filter(t => time-t.time < 400), used = new Set();
    const detections = (result.landmarks || []).map((points,i) => ({points, label: result.handedness?.[i]?.[0]?.categoryName || 'Unknown', confidence:result.handedness?.[i]?.[0]?.score ?? 0})).filter(d => d.confidence >= .6 && ['Left','Right'].includes(d.label) && d.points.length===21 && d.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
    // Match globally by wrist proximity so crossings do not depend on result array order.
    const matches = detections.flatMap((d,i) => previous.map(t => ({i,t,cost:distance(d.points[0],t.points[0])+(d.label!==t.label?.12:0)}))).sort((a,b)=>a.cost-b.cost);
    const assigned = new Map();
    for (const {i,t,cost} of matches) if(cost<.45&&!assigned.has(i)&&!used.has(t.id)){assigned.set(i,t);used.add(t.id);}
    this.tracks = detections.map((d,i) => {
      const old = assigned.get(i), points = d.points.map((p,j) => old ? {x:old.points[j].x*.25+p.x*.75,y:old.points[j].y*.25+p.y*.75,z:(old.points[j].z||0)*.25+(p.z||0)*.75} : {...p});
      const palm = Math.max(.025,distance(points[5],points[17]));
      const extended = JOINTS.map(([m,p,d,t],f) => {
        const bent = angle(points[m], points[p], points[t]);
        if (f===0) return angle(points[p],points[d],points[t]) > (old?.extended[f]?135:150) && distance(points[t],points[5])/palm > (old?.extended[f]?.5:.65);
        const ratio = distance(points[t],points[m])/(distance(points[p],points[m])+distance(points[d],points[p])+distance(points[t],points[d]));
        return bent > (old?.extended[f]?135:153) && ratio > (old?.extended[f]?.73:.82);
      });
      const rawTilt = (points[0].x-points[9].x)/palm;
      let major = old?.major ?? true;
      if(rawTilt>.12)major=true; else if(rawTilt<-.12)major=false;
      return { id:old?.id||this.next++,label:old?.label||d.label,points,extended,major,tilt:clamp(rawTilt,-1,1),volume:clamp(1-(points[0].y-.05)/.9),time };
    });
    // Ambiguous duplicate hand identities must not share a paper-finger source.
    const labels=new Set();this.tracks=this.tracks.filter(t=>{if(labels.has(t.label))return false;labels.add(t.label);return true;});
    return this.tracks;
  }
}
export function gestureFromHands(hands, {easy=false,counting=false,capo=0,oneHand=false,raise=false,lower=false,swap=false}={}) {
  if (counting) {
    // Both hands must stay visible: losing one must not select a lower-count chord.
    if (hands.length !== 2 || !hands.some(h=>h.label==='Left') || !hands.some(h=>h.label==='Right')) return null;
    return countingChord(hands.reduce((sum,h)=>sum+h.extended.filter(Boolean).length,0),capo);
  }
  const left=hands.find(h=>h.label===(swap?'Right':'Left')) || (easy?hands[0]:null), right=hands.find(h=>h.label===(swap?'Left':'Right'));
  if(!left||(!easy&&!oneHand&&!right))return null;
  const [thumb,index,middle,ring,pinky]=left.extended;
  const count=left.extended.filter(Boolean).length;
  const degree=index&&pinky&&!middle&&!ring?(thumb?7:6):count;
  if(easy)return easyChord(degree);
  const quality=oneHand?1:right.extended.slice(1).filter(Boolean).length;
  if(!degree||!quality)return null;
  const bottom=Math.max(...left.points.map(p=>p.y));
  return {degree,major:swap?!left.major:left.major,quality,low:oneHand?false:right.extended[0],shift:raise&&bottom<.5?1:lower&&bottom>.8?-1:0,volume:oneHand?.35:right.volume,filter:oneHand?0:-right.tilt};
}
