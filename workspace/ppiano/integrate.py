"""Narrow integration edits, also used to prepare a release without unrelated work."""
from pathlib import Path
import json
# The homepage and Contact page (workspace/home) list every page from workspace/palette/index.mjs, which reads
# PROJECTS in site/content.mjs, so the retired captured homepage in public/ is no longer patched.
FILES=['package.json','site/content.mjs','site/pages.mjs','tools/build.mjs','tools/verify.mjs']
def transform(file,s):
 if '/ppiano/' in s or 'buildPaperPiano' in s or (file=='package.json' and 'ppiano/tests' in s):return s
 if file=='package.json':
  p=json.loads(s);p['scripts']['test']+=' workspace/ppiano/tests/*.test.mjs';return json.dumps(p,indent=2)+'\n'
 if file=='site/content.mjs':
  marker='export const PROJECTS = [';start=s.index(marker);end=s.index('\n];',start)
  project="""
  {
    id: 'paper-piano',
    name: 'Paper Piano',
    context: 'Personal · Interactive Experiment',
    year: '2026',
    oneLiner: 'An instrument, anywhere.',
    desc: 'Shape chords with hand gestures, or play a keyboard drawn on paper. Browser-local computer vision and sound, with guided calibration for experimental paper-tap detection.',
    tags: ['Computer Vision', 'Web Audio', 'Creative Coding'],
    live: '/ppiano/',
    repo: 'https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io/tree/main/workspace/ppiano',
  },"""
  return s[:end]+project+s[end:]
 if file=='site/pages.mjs':
  s=s.replace("['/flash/','Flash'],","['/flash/','Flash'],['/ppiano/','Paper Piano'],")
  s=s.replace('id="${slug[i]}"','id="${p.id || slug[i]}"')
  s=s.replace('Nexus Tensor Alpha, EqualVoice, and Apex Analysis.','Nexus Tensor Alpha, EqualVoice, Apex Analysis, and Paper Piano.')
  return s
 if file=='tools/build.mjs':
  s=s.replace("import { buildFlash } from '../workspace/flash/build.mjs';","import { buildFlash } from '../workspace/flash/build.mjs';\nimport { buildPaperPiano } from '../workspace/ppiano/build.mjs';")
  s=s.replace("await buildFlash('dist');","await buildFlash('dist');\nawait buildPaperPiano('dist');")
  return s.replace("'/flash/'];","'/flash/', '/ppiano/'];")
 if file=='tools/verify.mjs':return s.replace("'flash/index.html',", "'ppiano/index.html', 'ppiano/app.js', 'ppiano/camera.js', 'ppiano/vision-worker.js', 'ppiano/vendor/hand_landmarker.task', 'ppiano/vendor/opencv.js', 'ppiano/assets/samples.json', 'flash/index.html',")
 return s
if __name__=='__main__':
 for file in FILES:
  p=Path(file);s=p.read_text();out=transform(file,s)
  if s!=out:p.write_text(out);print(file)
