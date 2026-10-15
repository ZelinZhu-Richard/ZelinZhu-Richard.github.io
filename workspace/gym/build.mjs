import {cp,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const source=fileURLToPath(new URL('.',import.meta.url));
const runtime=['index.html','style.css','app.js','pose.js','history.js','game.js','camera.js','render.js','vision.js','vision-worker.js'];
export async function buildGym(output){
  const manifest=JSON.parse(await readFile(join(source,'vendor/manifest.json'),'utf8'));
  for(const entry of manifest.files){const bytes=await readFile(join(source,entry.file));if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error(`Gym asset integrity failed: ${entry.file}`);}
  const target=join(output,'gym');await mkdir(target,{recursive:true});
  for(const file of [...runtime,'vendor'])await cp(join(source,file),join(target,file),{recursive:true});
}
