import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {detectKeyboard,analyzeRectified,captureAnchors,anchorDrift} from '../detection.js';
import {homography,project} from '../geometry.js';
let cv,temp;
before(async()=>{temp=await mkdtemp(join(tmpdir(),'ppiano-cv-'));await copyFile(new URL('../vendor/opencv.js',import.meta.url),join(temp,'opencv.cjs'));cv=createRequire(import.meta.url)(join(temp,'opencv.cjs'));if(!cv.Mat)await new Promise(resolve=>cv.onRuntimeInitialized=resolve);delete cv.then;});
after(async()=>{await rm(temp,{recursive:true,force:true});});
function fixture({perspective=false,uneven=false,shadow=false,missing=false,blank=false}={}){
  const width=960,height=540,data=new Uint8ClampedArray(width*height*4),corners=perspective?[{x:.15,y:.23},{x:.86,y:.16},{x:.91,y:.82},{x:.1,y:.85}]:[{x:.1,y:.2},{x:.9,y:.2},{x:.9,y:.8},{x:.1,y:.8}],h=homography(corners);
  const dividers=uneven?[0,.13,.24,.37,.50,.64,.76,.88,1]:Array.from({length:9},(_,i)=>i/8);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=project(h,{x:x/width,y:y/height}),inside=p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
    let ink=!blank&&inside&&(p.y<.013||p.y>.987||dividers.some(d=>Math.abs(p.x-d)<.003));
    if(!blank&&inside&&p.y<.58)for(const d of (missing?[1,2,4,5]:[1,2,4,5,6]))if(Math.abs(p.x-dividers[d])<.037)ink=true;
    const value=ink?12:inside?(shadow?240-60*x/width:242):75,i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }return {image:{data,width,height},corners};
}
for(const config of [{},{uneven:true},{perspective:true},{perspective:true,uneven:true,shadow:true}])test(`OpenCV recognizes drawn boundaries: ${JSON.stringify(config)}`,()=>{
  const {image}=fixture(config),layout=detectKeyboard(cv,image);assert.equal(layout.dividers.length,9);assert.equal(layout.blacks.length,5);assert.deepEqual(layout.blacks.map(b=>b.midi),[61,63,66,68,70]);
});
test('blank scenes and incomplete drawings never become playable keyboards',()=>{assert.throws(()=>detectKeyboard(cv,fixture({blank:true}).image),/No complete keyboard/);assert.throws(()=>detectKeyboard(cv,fixture({missing:true}).image),/No complete keyboard/);});
test('paper anchors accept a steady camera and reject a displaced drawing',()=>{const f=fixture(),anchors=captureAnchors(f.image,f.corners);assert.equal(anchorDrift(f.image,f.corners,anchors).moved,false);assert.equal(anchorDrift(fixture({perspective:true}).image,f.corners,anchors).moved,true);});
