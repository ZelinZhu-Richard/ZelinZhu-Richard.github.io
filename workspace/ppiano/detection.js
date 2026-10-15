import { BLACK_NOTES } from './music.js';
import { validateLayout } from './geometry.js';
function orderCorners(points) {
  const sorted=[...points].sort((a,b)=>a.y-b.y),top=sorted.slice(0,2).sort((a,b)=>a.x-b.x),bottom=sorted.slice(2).sort((a,b)=>a.x-b.x);
  return [top[0],top[1],bottom[1],bottom[0]];
}
function clusters(values,threshold){
  const groups=[];for(let i=0;i<values.length;i++)if(values[i]>threshold){let g=groups.at(-1);if(!g||i-g.at(-1)>2)groups.push(g=[]);g.push(i);}
  return groups.map(g=>g.reduce((s,n)=>s+n,0)/g.length);
}
export function analyzeRectified(data,width,height){
  // Count long vertical strokes only in the lower section, away from black keys.
  const projection=new Array(width).fill(0),y0=Math.round(height*.65),y1=Math.round(height*.92);
  for(let x=0;x<width;x++)for(let y=y0;y<y1;y++)if(data[y*width+x]>0)projection[x]++;
  const lines=clusters(projection,(y1-y0)*.68).filter(x=>x>width*.04&&x<width*.96);
  if(lines.length!==7)return null;
  const dividers=[0,...lines.map(x=>x/width),1];
  const widths=dividers.slice(1).map((v,i)=>v-dividers[i]);
  if(widths.some(w=>w<.065||w>.19))return null;
  // Filled black rectangles have a wide horizontal footprint in the upper half.
  const blackProjection=new Array(width).fill(0),by0=Math.round(height*.12),by1=Math.round(height*.48);
  for(let x=0;x<width;x++)for(let y=by0;y<by1;y++)if(data[y*width+x]>0)blackProjection[x]++;
  const bands=[];let start=-1;
  for(let x=0;x<=width;x++){
    if(x<width&&blackProjection[x]>(by1-by0)*.65){if(start<0)start=x;}
    else if(start>=0){if(x-start>width*.025&&x-start<width*.115)bands.push([start,x]);start=-1;}
  }
  if(bands.length!==5)return null;
  const expected=[1,2,4,5,6];
  const blacks=bands.map(([a,b],i)=>{
    const center=(a+b)/2/width;
    if(Math.abs(center-dividers[expected[i]])>.06)return null;
    const xx=Math.round((a+b)/2);let last=Math.round(height*.3);
    for(let y=Math.round(height*.3);y<height*.82;y++)if(data[y*width+xx])last=y;
    return {x0:a/width,x1:b/width,y0:0,y1:Math.min(.8,(last+1)/height),midi:BLACK_NOTES[i]};
  });
  return blacks.some(b=>!b)?null:{dividers,blacks};
}
export function detectKeyboard(cv,image){
  const allocated=[];const keep=x=>(allocated.push(x),x);
  try{
    const src=keep(cv.matFromImageData(image)),gray=keep(new cv.Mat()),binary=keep(new cv.Mat());
    cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
    cv.adaptiveThreshold(gray,binary,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,31,9);
    const kernel=keep(cv.Mat.ones(3,3,cv.CV_8U));cv.morphologyEx(binary,binary,cv.MORPH_CLOSE,kernel);
    const contours=keep(new cv.MatVector()),hierarchy=keep(new cv.Mat());cv.findContours(binary,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    const candidates=[];
    for(let i=0;i<contours.size();i++){
      const contour=contours.get(i),approx=new cv.Mat();
      try{
        const area=cv.contourArea(contour);if(area<image.width*image.height*.07)continue;
        cv.approxPolyDP(contour,approx,.025*cv.arcLength(contour,true),true);
        if(approx.rows!==4||!cv.isContourConvex(approx))continue;
        const pts=orderCorners(Array.from({length:4},(_,j)=>({x:approx.data32S[j*2],y:approx.data32S[j*2+1]})));
        const w=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),h=Math.hypot(pts[3].x-pts[0].x,pts[3].y-pts[0].y);
        if(w/h>1.3&&w/h<8)candidates.push({pts,area});
      }finally{contour.delete();approx.delete();}
    }
    candidates.sort((a,b)=>b.area-a.area);
    for(const {pts} of candidates.slice(0,12)){
      const from=cv.matFromArray(4,1,cv.CV_32FC2,pts.flatMap(p=>[p.x,p.y])),to=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,799,0,799,299,0,299]);
      const transform=cv.getPerspectiveTransform(from,to),warped=new cv.Mat(),ink=new cv.Mat();
      try{
        cv.warpPerspective(gray,warped,transform,new cv.Size(800,300));
        // Otsu retains solid black interiors, unlike adaptive threshold on broad fills.
        cv.threshold(warped,ink,0,255,cv.THRESH_BINARY_INV|cv.THRESH_OTSU);
        const found=analyzeRectified(ink.data,800,300);
        if(found){const layout={corners:pts.map(p=>({x:p.x/image.width,y:p.y/image.height})),...found};if(validateLayout(layout))return layout;}
      }finally{from.delete();to.delete();transform.delete();warped.delete();ink.delete();}
    }
    throw new Error('No complete keyboard found. Show the outer border, eight white keys and five filled black keys (groups of two and three). Keep hands off the paper while scanning.');
  }finally{for(const value of allocated.reverse())value.delete();}
}
function patch(image,p,offsetX=0,offsetY=0){
  const out=[];for(let y=-6;y<=6;y++)for(let x=-6;x<=6;x++){
    const xx=Math.max(0,Math.min(image.width-1,Math.round(p.x*image.width)+x+offsetX)),yy=Math.max(0,Math.min(image.height-1,Math.round(p.y*image.height)+y+offsetY)),i=(yy*image.width+xx)*4;
    out.push(image.data[i]*.299+image.data[i+1]*.587+image.data[i+2]*.114);
  }return out;
}
export const captureAnchors=(image,corners)=>corners.map(p=>patch(image,p));
function correlation(a,b){const am=a.reduce((s,n)=>s+n,0)/a.length,bm=b.reduce((s,n)=>s+n,0)/b.length;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){const x=a[i]-am,y=b[i]-bm;dot+=x*y;aa+=x*x;bb+=y*y;}return aa*bb<1?0:dot/Math.sqrt(aa*bb);}
export function anchorDrift(image,corners,anchors,hands=[]){
  let visible=0,moved=0;
  corners.forEach((p,i)=>{
    if(hands.some(h=>{const xs=h.points.map(p=>p.x),ys=h.points.map(p=>p.y);return p.x>Math.min(...xs)-.04&&p.x<Math.max(...xs)+.04&&p.y>Math.min(...ys)-.04&&p.y<Math.max(...ys)+.04;}))return;
    visible++;let best=-1;for(const dx of [-2,0,2])for(const dy of [-2,0,2])best=Math.max(best,correlation(anchors[i],patch(image,p,dx,dy)));
    if(best<.62)moved++;
  });
  return {moved:visible>=2&&moved>=2,visible};
}
