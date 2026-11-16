import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {selectorPage,storyPage,stories} from './page.mjs';
const source=fileURLToPath(new URL('.',import.meta.url));
const origin='https://zelinzhu-richard.github.io';
export const dukeRoutes=['/duke/','/duke/becoming-blue/','/duke/the-night-duke-lost-its-blue/'];
export async function buildDukeStories(output){
 const target=join(output,'duke');await mkdir(target,{recursive:true});
 const assets=JSON.parse(await readFile(join(source,'assets/manifest.json'),'utf8'));
 const metadata=(title,description,path,cover)=>`<title>${title} — Richard Zhu</title>
<meta name="description" content="${description}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${origin}${path}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${description}">
<meta property="og:type" content="website"><meta property="og:url" content="${origin}${path}">
<meta property="og:image" content="${origin}/duke/assets/${cover}.webp">
<meta name="twitter:card" content="summary_large_image">`;
 await writeFile(join(target,'index.html'),selectorPage(assets).replace('<!-- DUKE_METADATA -->',metadata('A Dragon at Duke','Two original illustrated scroll stories by Richard Zhu: an imagined Duke future and a fictional nighttime campus adventure.','/duke/','welcome')));
 for(const [kind,story]of Object.entries(stories)){
  const script=await readFile(join(source,kind==='future'?'script-becoming-blue.md':'script-night.md'),'utf8');
  const path='/duke/'+story.slug+'/';await mkdir(join(output,path),{recursive:true});
  const description=kind==='future'?'An imagined Duke future about building for people, belonging, and becoming. An illustrated story by Richard Zhu.':'A fictional campus adventure: Richard the dragon and the Blue Devil collect Duke’s missing blue. An illustrated story by Richard Zhu.';
  await writeFile(join(output,path,'index.html'),storyPage(kind,script,assets).replace('<!-- DUKE_METADATA -->',metadata(story.title,description,path,story.cover)));
 }
 for(const file of ['style.css','app.js','model.js','assets'])await cp(join(source,file),join(target,file),{recursive:true});
}
