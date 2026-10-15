import { cp,mkdir,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const source=fileURLToPath(new URL('.',import.meta.url));
const runtime=['index.html','style.css','app.js','audio.js','camera.js','detection.js','geometry.js','hands.js','music.js','paper.js','renderer.js','vision.js','vision-worker.js'];
export async function buildPaperPiano(output){
  const manifest=JSON.parse(await readFile(join(source,'assets/manifest.json'),'utf8'));
  for(const entry of manifest.files){const bytes=await readFile(join(source,entry.file));if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error(`Paper Piano asset integrity failed: ${entry.file}`);}
  const target=join(output,'ppiano');await mkdir(target,{recursive:true});
  for(const file of [...runtime,'assets','vendor'])await cp(join(source,file),join(target,file),{recursive:true});
}
