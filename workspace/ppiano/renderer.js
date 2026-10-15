import { videoRect, homography, inverse, project } from './geometry.js';
import { CONNECTIONS } from './hands.js';
import { WHITE_NOTES, CHORD_COLORS } from './music.js';
export class StageRenderer {
  constructor(canvas,video){this.canvas=canvas;this.video=video;this.context=canvas.getContext('2d');this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;}
  map(p){const r=this.rect;return {x:r.x+(this.mirror?1-p.x:p.x)*r.w,y:r.y+p.y*r.h};}
  unmap(clientX,clientY){const b=this.canvas.getBoundingClientRect(),r=this.rect,x=(clientX-b.left-r.x)/r.w;return{x:this.mirror?1-x:x,y:(clientY-b.top-r.y)/r.h};}
  draw({hands=[],layout=null,editing=false,target=0,mirror=true,notes=[],octave=0,time=0,audio,mode='gesture',gesture=null}){
    const c=this.context,b=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=b.width,h=b.height;
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);this.rect=videoRect(w,h,this.video.videoWidth||1280,this.video.videoHeight||720);this.mirror=mirror;this.handles=[];
    const line=(points,close=false)=>{c.beginPath();points.forEach((p,i)=>{const q=this.map(p);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);});if(close)c.closePath();};
    if(layout){
      const back=inverse(homography(layout.corners)),toCam=p=>project(back,p),selected=new Set(notes.map(n=>n-octave*12));
      for(let i=0;i<8;i++){
        const polygon=[{x:layout.dividers[i],y:0},{x:layout.dividers[i+1],y:0},{x:layout.dividers[i+1],y:1},{x:layout.dividers[i],y:1}].map(toCam);
        line(polygon,true);c.fillStyle=selected.has(WHITE_NOTES[i])?'#cc9bffa0':'#decaff13';c.fill();c.strokeStyle='#e6d3ff99';c.lineWidth=1;c.stroke();
        const label=this.map(toCam({x:(layout.dividers[i]+layout.dividers[i+1])/2,y:.89}));c.fillStyle='#fff';c.font='11px Arial';c.textAlign='center';c.fillText(['C','D','E','F','G','A','B','C'][i],label.x,label.y);
      }
      layout.blacks.forEach(b=>{line([{x:b.x0,y:b.y0},{x:b.x1,y:b.y0},{x:b.x1,y:b.y1},{x:b.x0,y:b.y1}].map(toCam),true);c.fillStyle=selected.has(b.midi)?'#cc9bffb0':'#11102233';c.fill();c.strokeStyle='#e0c1ff';c.stroke();});
      if(editing){
        this.handles=layout.corners.map((p,i)=>({p,type:'corner',index:i}));
        for(let i=1;i<8;i++)this.handles.push({p:toCam({x:layout.dividers[i],y:.98}),type:'divider',index:i});
        layout.blacks.forEach((b,i)=>{this.handles.push({p:toCam({x:b.x0,y:b.y1}),type:'black-left',index:i});this.handles.push({p:toCam({x:b.x1,y:b.y1}),type:'black-right',index:i});});
        this.handles.forEach((handle,i)=>{const p=this.map(handle.p);c.beginPath();c.arc(p.x,p.y,i===target?8:5,0,Math.PI*2);c.fillStyle=i===target?'#fff':'#dfccff';c.fill();c.strokeStyle='#342044';c.lineWidth=2;c.stroke();});
      }
    }
    for(const hand of hands){
      c.strokeStyle=hand.label==='Left'?'#e6c3ff80':'#b6dfcd80';c.lineWidth=1.3;
      if(mode==='paper')for(const[a,b]of CONNECTIONS){line([hand.points[a],hand.points[b]]);c.stroke();}
      for(let i=0;i<hand.points.length;i++){const p=this.map(hand.points[i]);c.beginPath();c.arc(p.x,p.y,[4,8,12,16,20].includes(i)?4:2.5,0,Math.PI*2);c.fillStyle=mode==='gesture'?'#ffffffd9':hand.label==='Left'?'#ebceff':'#b6dfcd';c.shadowColor='#ffe7ec';c.shadowBlur=mode==='gesture'&&!this.reduced?9:0;c.fill();c.shadowBlur=0;}
      const p=this.map(hand.points[0]);c.fillStyle='#fff';c.font='10px Arial';c.textAlign='center';c.fillText(hand.label,p.x,p.y+21);
    }
    if(mode==='gesture'&&notes.length&&audio.analyser){
      const data=new Uint8Array(audio.analyser.frequencyBinCount);audio.analyser.getByteTimeDomainData(data);
      const color=CHORD_COLORS[(gesture?.degree||1)-1],gap=Math.min(135,w*.23),center=w/2,baseline=h-86;
      for(let layer=0;layer<Math.min(gesture?.quality||1,3);layer++)for(const side of [-1,1]){
        c.beginPath();
        for(let i=0;i<100;i++){
          const t=i/99,x=center+side*(gap+t*(center-gap)),sample=(data[Math.floor(t*(data.length-1))]-128)/128;
          const amplitude=(8+(gesture?.volume||.3)*25)*(1-.2*t);
          const wave=this.reduced?0:(Math.sin(t*Math.PI*4-time*.004+layer*.2)*.7+sample*.3)*amplitude+layer*Math.sin(t*8)*4;
          i?c.lineTo(x,baseline+wave):c.moveTo(x,baseline+wave);
        }
        const gradient=c.createLinearGradient(center+side*gap,0,side===1?w:0,0);gradient.addColorStop(0,color+'00');gradient.addColorStop(.18,color);gradient.addColorStop(1,color);
        c.strokeStyle=gradient;c.lineWidth=2.5;c.shadowColor=color;c.shadowBlur=this.reduced?0:18;c.stroke();c.shadowBlur=0;
      }
    }
  }
}
