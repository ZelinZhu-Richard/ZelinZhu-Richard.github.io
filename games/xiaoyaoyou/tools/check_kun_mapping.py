"""Measure real source-pixel stretch over exported upper-back triangles.

No screen-space proxy: compare the two singular values of the affine mapping
from each surface triangle to landscape-source pixels. Shared mist blends
colors only, without changing sampling density. The ROI is behind the head,
from body fraction .24 to .48 and above the cross-section's upper 60 degrees.
"""
import json
from pathlib import Path
import numpy as np
from trace_kun import read_glb
ROOT=Path(__file__).resolve().parents[1]
doc,accessor=read_glb(ROOT/'_dev/raw/kun.glb')
node=next(n for n in doc['nodes'] if n.get('name')=='kun_body')
ratios=[]
for primitive in doc['meshes'][node['mesh']]['primitives']:
    pos=accessor(primitive['attributes']['POSITION'])
    uv=accessor(primitive['attributes']['TEXCOORD_0']).astype(float)
    ids=accessor(primitive['indices']).reshape(-1,3)
    for triangle in ids:
        p=pos[triangle].astype(float)
        c=p.mean(axis=0)
        # Blender y=-glTF z, dorsal height ~1.18, midline ~0 in this ROI.
        if not (.7<=c[2]<=3.1 and c[1]>=.58): continue
        q=uv[triangle]*np.array([.68*2171,2*.78*723])
        a,b=p[1]-p[0],p[2]-p[0]
        length=np.linalg.norm(a)
        x=np.dot(a,b)/length
        y=np.sqrt(max(0,np.dot(b,b)-x*x))
        if y<1e-8: continue
        basis=np.array([[length,x],[0,y]])
        jacobian=np.column_stack([q[1]-q[0],q[2]-q[0]])@np.linalg.inv(basis)
        sv=np.linalg.svd(jacobian,compute_uv=False)
        ratios.append(float(sv[0]/sv[1]))
paint=json.loads((ROOT/'_dev/build/kun-paint.json').read_text())['body']
result={'generator':'tools/check_kun_mapping.py','metric':'surface-to-source-pixel Jacobian singular-value ratio',
        'roi':'upper back behind head: glTF z .7..3.1, y >= .58; both flanks; includes ridge triangles',
        'trianglesMeasured':len(ratios),'maxStretch':max(ratios),'p95Stretch':float(np.percentile(ratios,95)),
        'threshold':1.5,'pass':max(ratios)<=1.5,'bodyPaint':paint}
(ROOT/'_dev/build/kun-mapping.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='bodyPaint'},indent=2))
if not result['pass']: raise SystemExit(1)
