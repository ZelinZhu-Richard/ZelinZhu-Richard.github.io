"""Acquire pinned, public runtime assets. Run manually; production builds are offline."""
from pathlib import Path
from urllib.request import urlopen,Request
import json,hashlib,re
ROOT=Path(__file__).resolve().parent
manifest=[]
def get(url):
 return urlopen(Request(url,headers={'User-Agent':'PaperPiano-asset-build'}),timeout=90).read()
def save(rel,url):
 p=ROOT/rel;p.parent.mkdir(parents=True,exist_ok=True)
 if not p.exists(): p.write_bytes(get(url))
 b=p.read_bytes();manifest.append({'file':rel,'url':url,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
 print(rel,len(b),flush=True)
mp='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/'
for f in ['vision_bundle.mjs','wasm/vision_wasm_internal.js','wasm/vision_wasm_internal.wasm','wasm/vision_wasm_nosimd_internal.js','wasm/vision_wasm_nosimd_internal.wasm']:
 save('vendor/mediapipe/'+f,mp+f)
save('vendor/hand_landmarker.task','https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task')
save('vendor/opencv.js','https://docs.opencv.org/4.13.0/opencv.js')
save('vendor/MEDIAPIPE-LICENSE.txt','https://raw.githubusercontent.com/google-ai-edge/mediapipe/v0.10.14/LICENSE')
save('vendor/OPENCV-LICENSE.txt','https://raw.githubusercontent.com/opencv/opencv/4.13.0/LICENSE')
repo='nbrosowsky/tonejs-instruments'
sha=json.loads(get('https://api.github.com/repos/'+repo+'/commits/master'))['sha']
notes={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
def pitch(name):
 m=re.match(r'^([A-G])([#b]?)(\d)\.mp3$',name)
 return (int(m[3])+1)*12+notes[m[1]]+({'#':1,'b':-1}.get(m[2],0)) if m else None
banks={}
for name,source in [('piano','piano'),('strings','violin'),('horns','french-horn')]:
 listing=json.loads(get(f'https://api.github.com/repos/{repo}/contents/samples/{source}?ref={sha}'))
 choices={pitch(x['name']):x['name'] for x in listing if pitch(x['name']) is not None}
 selected=sorted({min(choices,key=lambda n:abs(n-target)) for target in [45,48,54,60,66,72,78]})
 banks[name]=[]
 for midi in selected:
  file=choices[midi];rel=f'assets/samples/{name}/{file}'
  save(rel,f'https://raw.githubusercontent.com/{repo}/{sha}/samples/{source}/'+file.replace('#','%23'))
  banks[name].append({'midi':midi,'url':'/ppiano/'+rel})
save('assets/SAMPLE-LICENSE.txt',f'https://raw.githubusercontent.com/{repo}/{sha}/LICENSE.md')
save('assets/SAMPLE-SOURCES.txt',f'https://raw.githubusercontent.com/{repo}/{sha}/sample-source-info.txt')
(ROOT/'assets/samples.json').write_text(json.dumps(banks,indent=2)+'\n')
(ROOT/'assets/manifest.json').write_text(json.dumps({'mediapipe':'0.10.14','opencv':'4.13.0','samplesCommit':sha,'files':manifest},indent=2)+'\n')
