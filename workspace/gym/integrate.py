"""Idempotent, narrow portfolio integration; also prepares an isolated release."""
from pathlib import Path
import json
FILES=['package.json','site/content.mjs','site/pages.mjs','tools/build.mjs','tools/verify.mjs','public/_nuxt/CbdjwYMp.js','public/index.html','public/contacts/index.html']
def transform(file,s):
 if '/gym/' in s or 'buildGym' in s or (file=='package.json' and 'gym/tests' in s):return s
 if file=='package.json':
  p=json.loads(s);p['scripts']['test']+=' workspace/gym/tests/*.test.mjs';return json.dumps(p,indent=2)+'\n'
 if file=='site/content.mjs':
  start=s.index('export const PROJECTS = [');end=s.index('\n];',start)
  project="""
  {
    id: 'gym',
    name: 'Gym',
    context: 'Personal · Interactive Experiment',
    year: '2026',
    oneLiner: 'Your body is the controller.',
    desc: 'Count push-ups, keep a daily streak, and guide a bird through obstacles with your body. Camera processing stays on your device, with calibrated, experimental movement tracking.',
    tags: ['Computer Vision', 'Browser Game', 'Creative Coding'],
    live: '/gym/',
    repo: 'https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io/tree/main/workspace/gym',
  },"""
  return s[:end]+project+s[end:]
 if file=='site/pages.mjs':
  s=s.replace("['/ppiano/','Paper Piano'],","['/ppiano/','Paper Piano'],['/gym/','Gym'],")
  return s.replace('Apex Analysis, and Paper Piano.','Apex Analysis, Paper Piano, and Gym.')
 if file=='tools/build.mjs':
  s=s.replace("import { buildPaperPiano } from '../workspace/ppiano/build.mjs';","import { buildPaperPiano } from '../workspace/ppiano/build.mjs';\nimport { buildGym } from '../workspace/gym/build.mjs';")
  s=s.replace("await buildPaperPiano('dist');","await buildPaperPiano('dist');\nawait buildGym('dist');")
  return s.replace("'/ppiano/'];","'/ppiano/', '/gym/'];")
 if file=='tools/verify.mjs':return s.replace("'ppiano/index.html',", "'gym/index.html', 'gym/app.js', 'gym/camera.js', 'gym/vision-worker.js', 'gym/vendor/pose_landmarker_lite.task', 'gym/vendor/mediapipe/vision_bundle.mjs', 'gym/vendor/mediapipe/wasm/vision_wasm_internal.wasm', 'ppiano/index.html',")
 if file=='public/_nuxt/CbdjwYMp.js':
  for anchor,prefix,ending in [('to:"/ppiano/"','Tt(s,','_:1},8,["class"])'),('link:"/ppiano/",text:"Paper Piano"','Tt(h_,','null,8,["class"])')]:
   idx=s.index(anchor);start=s.rfind(prefix,0,idx);end=s.index(ending,idx)+len(ending);chunk=s[start:end]
   assert start>=0 and len(chunk)<500
   s=s[:end]+','+chunk.replace('/ppiano/','/gym/').replace('"Paper Piano"','"Gym"')+s[end:]
  return s
 if file.endswith('index.html'):return s.replace('<a href="/ppiano/">Paper Piano</a>','<a href="/ppiano/">Paper Piano</a>, or <a href="/gym/">Gym</a>')
 raise ValueError(file)
if __name__=='__main__':
 backup=Path('workspace/gym/.qa/before');backup.mkdir(parents=True,exist_ok=True)
 for file in FILES+['asset-manifest.json']:
  p=Path(file);dest=backup/file;dest.parent.mkdir(parents=True,exist_ok=True)
  if not dest.exists():dest.write_bytes(p.read_bytes())
 for file in FILES:
  p=Path(file);s=p.read_text();out=transform(file,s)
  if s!=out:p.write_text(out);print(file)
