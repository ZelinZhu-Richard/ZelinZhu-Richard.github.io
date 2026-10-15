import {clamp} from './pose.js';
export const WORLD={width:900,height:540,birdX:190,radius:15};
export class BirdGame {
  constructor(){this.reset();}
  reset(level='relaxed'){this.status='ready';this.score=0;this.y=270;this.obstacles=[{x:710,center:170,scored:false}];this.distance=0;this.next=60;this.number=1;this.speed=level==='steady'?100:70;this.gap=level==='steady'?205:255;}
  start(level){this.reset(level);this.status='playing';}
  pause(){if(this.status==='playing')this.status='paused';}
  resume(){if(this.status==='paused')this.status='playing';}
  step(dt,height){
    if(this.status!=='playing')return;
    // Drop elapsed background time; no teleporting obstacles after interruptions.
    dt=clamp(dt,0,.06);this.y+=(440-clamp(height)*340-this.y)*(1-Math.exp(-dt*10));this.distance+=this.speed*dt;
    while(this.distance>=this.next){this.obstacles.push({x:960,center:this.number%2?370:170,scored:false});this.number++;this.next+=310;}
    for(const o of this.obstacles){
      o.x-=this.speed*dt;
      if(o.x<WORLD.birdX+WORLD.radius&&o.x+68>WORLD.birdX-WORLD.radius&&(this.y-WORLD.radius<o.center-this.gap/2||this.y+WORLD.radius>o.center+this.gap/2)){this.status='over';return;}
      if(!o.scored&&o.x+68<WORLD.birdX-WORLD.radius){o.scored=true;this.score++;}
    }
    this.obstacles=this.obstacles.filter(o=>o.x>-80);
  }
}
