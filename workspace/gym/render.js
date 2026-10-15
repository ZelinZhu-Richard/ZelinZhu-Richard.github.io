import {WORLD} from './game.js';
const links=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]];
function fit(canvas){const b=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(b.width*dpr)||canvas.height!==Math.round(b.height*dpr)){canvas.width=Math.round(b.width*dpr);canvas.height=Math.round(b.height*dpr);}const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,b.width,b.height);return {c,w:b.width,h:b.height};}
export function drawPose(canvas,video,points,mirror,valid){
  const {c,w,h}=fit(canvas),ratio=(video.videoWidth||1280)/(video.videoHeight||720),vw=Math.min(w,h*ratio),vh=vw/ratio,x=(w-vw)/2,y=(h-vh)/2;
  if(!points)return;
  const map=p=>[x+(mirror?1-p.x:p.x)*vw,y+p.y*vh];c.lineWidth=2;c.strokeStyle=valid?'#b6dfc6':'#dfccff';c.fillStyle=c.strokeStyle;
  for(const [a,b] of links)if(points[a]?.visibility>.6&&points[b]?.visibility>.6){c.beginPath();c.moveTo(...map(points[a]));c.lineTo(...map(points[b]));c.stroke();}
  for(const i of [11,12,13,14,15,16,23,24,25,26,27,28])if(points[i]?.visibility>.6){c.beginPath();c.arc(...map(points[i]),3.5,0,Math.PI*2);c.fill();}
}
export function drawGame(canvas,game,time=0,reduced=false){
  const {c,w,h}=fit(canvas);c.fillStyle='#101024';c.fillRect(0,0,w,h);
  const scale=Math.min(w/WORLD.width,h/WORLD.height);c.translate((w-WORLD.width*scale)/2,(h-WORLD.height*scale)/2);c.scale(scale,scale);
  c.fillStyle='#aaa0d236';for(let i=0;i<30;i++){c.beginPath();c.arc((i*173+40)%900,(i*67+35)%540,i%3===0?1.6:1,0,Math.PI*2);c.fill();}
  c.strokeStyle='#ffffff12';c.lineWidth=1;c.beginPath();c.moveTo(0,496);c.lineTo(900,496);c.stroke();
  for(const o of game.obstacles){
    const top=o.center-game.gap/2,bottom=o.center+game.gap/2;
    c.fillStyle='#39304f';c.strokeStyle='#9f86be';c.lineWidth=1.5;
    for(const [y,height] of [[-20,top+20],[bottom,560-bottom]]){c.beginPath();c.roundRect(o.x,y,68,height,9);c.fill();c.stroke();}
    c.fillStyle='#d9c5f7';c.fillRect(o.x+8,top-5,52,4);c.fillRect(o.x+8,bottom+1,52,4);
  }
  const y=game.status==='ready'?270:game.y;
  c.save();c.translate(WORLD.birdX,y);c.fillStyle='#e0caff';
  c.beginPath();c.ellipse(0,0,23,17,-.15,0,Math.PI*2);c.fill();
  c.beginPath();c.moveTo(-18,-2);c.lineTo(-34,-12);c.lineTo(-28,10);c.lineTo(-15,9);c.fill();
  c.fillStyle='#b28bd9';const wing=reduced?5:Math.sin(time*.008)*6;c.beginPath();c.moveTo(-12,-4);c.quadraticCurveTo(7,wing+20,15,2);c.closePath();c.fill();
  c.fillStyle='#f5cf9b';c.beginPath();c.moveTo(18,-2);c.lineTo(34,3);c.lineTo(18,8);c.fill();c.fillStyle='#221830';c.beginPath();c.arc(12,-6,3,0,Math.PI*2);c.fill();c.restore();
}
