import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('/Users/richardzhu/game-assets/node_modules/');
const sharp=require('sharp');
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('assets.json',root),'utf8'));
const report={};
for(const [name,entry] of Object.entries(manifest)) {
  const data=await readFile(new URL(entry.path,root));
  const size=data.readUInt32LE(12),doc=JSON.parse(data.subarray(20,20+size));
  const binaryStart=28+size;
  const textures=[];
  for(const image of doc.images??[]) {
    const view=doc.bufferViews[image.bufferView];
    const start=binaryStart+(view.byteOffset??0);
    const metadata=await sharp(data.subarray(start,start+view.byteLength)).metadata();
    textures.push({name:image.name,width:metadata.width,height:metadata.height,format:metadata.format});
  }
  const triangles=doc.meshes.flatMap(m=>m.primitives).reduce((sum,p)=>sum+doc.accessors[p.indices].count/3,0);
  const required=['kun_body','kun_fluke','kun_fin_upper_L','kun_fin_upper_R','kun_fin_lower_L','kun_fin_lower_R'];
  report[name]={path:entry.path,bytes:data.length,extensionsUsed:doc.extensionsUsed,triangles,textures,
    maxTextureSize:Math.max(...textures.flatMap(t=>[t.width,t.height])),nodeNames:doc.nodes.map(n=>n.name),
    requiredNodesSurvived:required.every(name=>doc.nodes.some(n=>n.name===name)),
    finLocalMetadata:doc.nodes.filter(n=>n.name?.startsWith('kun_fin_')).every(n=>n.extras?.finRootUV&&n.extras?.finTipUV)};
  if(triangles>60000||!report[name].requiredNodesSurvived||!report[name].finLocalMetadata||report[name].maxTextureSize>2048||
    !['EXT_meshopt_compression','EXT_texture_webp'].every(ext=>doc.extensionsUsed.includes(ext))) throw Error('Asset contract failed');
}
await writeFile(new URL('_dev/build/runtime-assets.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
