import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stdout};
export function pngInfo(path, scan=false){
 const b=readFileSync(path), width=b.readUInt32BE(16),height=b.readUInt32BE(20),type=b[25];
 if(!scan)return {width,height,alpha:type===6};
 if(b[24]!==8||type!==6)throw Error('Expected 8-bit RGBA PNG');
 const chunks=[];for(let o=8;o<b.length;){const n=b.readUInt32BE(o);if(b.toString('ascii',o+4,o+8)==='IDAT')chunks.push(b.subarray(o+8,o+8+n));o+=n+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(height*stride);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const t=raw[y*(stride+1)],off=y*stride;
  for(let x=0;x<stride;x++){const a=x>=4?pixels[off+x-4]:0,bb=y?pixels[off+x-stride]:0,c=y&&x>=4?pixels[off+x-stride-4]:0;
   pixels[off+x]=(raw[y*(stride+1)+1+x]+(t===1?a:t===2?bb:t===3?Math.floor((a+bb)/2):t===4?paeth(a,bb,c):0))&255;}}
 const bounds=[];for(let n=0;n<5;n++){let minX=width,minY=height,maxX=0,maxY=0;const l=Math.round(n*width/5),r=Math.round((n+1)*width/5);
 for(let y=0;y<height;y++)for(let x=l;x<r;x++)if(pixels[(y*width+x)*4+3]>120){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 bounds.push([minX,minY,maxX,maxY]);}
 return {width,height,alpha:true,corners:[pixels[3],pixels.at(-1)],bounds};
}
const manifest={};
for(const file of readdirSync(root+'art/production').filter(x=>x.endsWith('.png'))){
 const key=file.slice(0,-4),info=pngInfo(root+'art/production/'+file);
 manifest[key]={...info,source:'art/production/'+file};
}
console.log('Registration inspection:',pngInfo(root+'art/production/transform-strip.png',true));
const crops=[
 ['quad',256,0,1024,1024],['brodhead',256,0,1024,1024],
 ['table',0,128,1536,896],['open-seat',0,128,1280,896],
 ['future-dawn',128,0,1280,1024],['noodles',128,128,1280,896],
 ['breakfast',128,128,1280,896],['chapel',128,0,768,1536]
];
for(const [key,x,y,w,h] of crops){
 const name=key+'-mobile';
 run('cwebp',['-quiet','-q','84','-crop',String(x),String(y),String(w),String(h),root+'art/production/'+key+'.png','-o',root+'assets/'+name+'.webp']);
 manifest[name]={width:w,height:h,source:'art/production/'+key+'.png',crop:[x,y,w,h]};
 manifest[key].mobile={key:name,width:w,height:h};
}
for(let n=0;n<5;n++){
 const x=[0,428,856,1286,1714][n];
 run('cwebp',['-quiet','-q','90','-alpha_q','100','-crop',String(x),'0','434','724',root+'art/production/transform-strip.png','-o',root+'assets/richard-'+n+'.webp']);
 manifest['richard-'+n]={width:434,height:724,alpha:true,source:'art/production/transform-strip.png',crop:[x,0,434,724]};
}
for(const [key,source,prompt] of [['welcome','04-blue-welcome','04-blue-welcome'],['rescue-poster','03-lantern-rescue','03-lantern-rescue']]){
 run('cwebp',['-quiet','-q','84',root+'art/gate-v1/'+source+'.png','-o',root+'assets/'+key+'.webp']);
 manifest[key]={...pngInfo(root+'art/gate-v1/'+source+'.png'),source:'art/gate-v1/'+source+'.png',prompt};
}
writeFileSync(root+'assets/manifest.json',JSON.stringify(manifest,null,2)+'\n');
for(const [key,asset] of Object.entries(manifest)){
 const prompt=asset.prompt||asset.source.split('/').at(-1).slice(0,-4);
 run('node',['/Users/richardzhu/.agents/skills/impeccable/scripts/embed-prompt.mjs',root+'assets/'+key+'.webp','--prompt-file',root+'art/prompts/'+prompt+'.txt']);
}
console.log(Object.keys(manifest).length+' optimized assets exported.');
