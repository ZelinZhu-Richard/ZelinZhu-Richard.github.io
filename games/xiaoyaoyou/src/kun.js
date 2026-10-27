import * as THREE from 'three';

export const SWIM = Object.freeze({ periodMs: 4200, bodyLength: 10.4,
  flukeAmpFrac: .10, headAmpFrac: .012, wavelength: 1.1, finLagRadians: .65 });

// All displacement is vertical. The same continuous field bends body, mouth,
// ridge and stock; fin-local UV weights add a small delay towards the tips.
const waveGLSL = `
uniform float kunCycle, kunEnabled, kunNose, kunTail;
attribute float kunSpan;
attribute vec3 kunSpanGradient;
float kunHeight(vec3 p, float span) {
  float t = clamp((kunNose-p.z)/(kunNose-kunTail),0.0,1.0);
  float a = ${SWIM.bodyLength.toFixed(4)} * (${SWIM.headAmpFrac.toFixed(4)} +
    ${(SWIM.flukeAmpFrac-SWIM.headAmpFrac).toFixed(4)}*t*t);
  return kunEnabled * a * sin(6.28318530718*(${SWIM.wavelength.toFixed(4)}*t-kunCycle)+${SWIM.finLagRadians.toFixed(4)}*span);
}
vec3 kunBentNormal(vec3 p, vec3 n, float span, vec3 spanGradient) {
  float e=.005;
  float h=kunHeight(p,span);
  vec3 d=vec3(
    kunHeight(p+vec3(e,0,0),span+e*spanGradient.x)-h,
    kunHeight(p+vec3(0,e,0),span+e*spanGradient.y)-h,
    kunHeight(p+vec3(0,0,e),span+e*spanGradient.z)-h)/e;
  float ny=n.y/(1.0+d.y);
  return normalize(vec3(n.x-d.x*ny,ny,n.z-d.z*ny));
}
`;

function finCoordinates(mesh) {
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position;
  const span = new Float32Array(positions.count);
  const gradients = new Float32Array(positions.count * 3);
  const root = mesh.userData.finRootUV, tip = mesh.userData.finTipUV;
  if (root && tip) {
    const uv = geometry.attributes.uv;
    const dx = tip[0]-root[0], dy = tip[1]-root[1], length2=dx*dx+dy*dy;
    for (let i=0;i<span.length;i++) span[i]=THREE.MathUtils.clamp(
      ((uv.getX(i)-root[0])*dx+(uv.getY(i)-root[1])*dy)/length2,0,1);
    const counts = new Uint32Array(span.length);
    const index = geometry.index;
    const p=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
    for (let i=0;i<index.count;i+=3) {
      const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
      ids.forEach((id,j)=>p[j].fromBufferAttribute(positions,id));
      const a=p[1].clone().sub(p[0]), b=p[2].clone().sub(p[0]);
      const aa=a.dot(a), bb=b.dot(b), ab=a.dot(b), det=aa*bb-ab*ab;
      if(det<1e-14) continue;
      const da=span[ids[1]]-span[ids[0]], db=span[ids[2]]-span[ids[0]];
      const grad=a.multiplyScalar((da*bb-db*ab)/det).addScaledVector(b,(db*aa-da*ab)/det);
      for(const id of ids) { gradients[id*3]+=grad.x; gradients[id*3+1]+=grad.y; gradients[id*3+2]+=grad.z; counts[id]++; }
    }
    for(let i=0;i<span.length;i++) for(let j=0;j<3;j++) gradients[i*3+j]/=Math.max(1,counts[i]);
  }
  geometry.setAttribute('kunSpan',new THREE.BufferAttribute(span,1));
  geometry.setAttribute('kunSpanGradient',new THREE.BufferAttribute(gradients,3));
}

export function prepareKun(root) {
  root.updateMatrixWorld(true);
  const meshes=[];
  root.traverse(object=>{if(object.isMesh) meshes.push(object);});
  // Meshopt's quantization may add node transforms. Bake those and the manifest
  // anchor into one entity space, so the shader field is continuous at joins.
  for(const mesh of meshes) {
    mesh.geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    mesh.matrixAutoUpdate=true;
    mesh.position.set(0,0,0); mesh.rotation.set(0,0,0); mesh.scale.set(1,1,1);
  }
  root.clear();
  root.add(...meshes);
  root.updateMatrixWorld(true);
  const body=meshes.find(mesh=>mesh.name==='kun_body');
  const fluke=meshes.find(mesh=>mesh.name==='kun_fluke');
  body.geometry.computeBoundingBox(); fluke.geometry.computeBoundingBox();
  const uniforms={ kunCycle:{value:0},kunEnabled:{value:1},
    kunNose:{value:body.geometry.boundingBox.max.z},kunTail:{value:fluke.geometry.boundingBox.min.z} };
  const materials=[];
  for(const mesh of meshes) {
    const old=mesh.material;
    const sheet=mesh.name.startsWith('kun_fin_')||mesh.name==='kun_fluke';
    const material=new THREE.MeshLambertMaterial({ name:old.name,
      color:old.color, map:old.map, transparent:sheet, opacity:old.opacity,
      side:sheet?THREE.DoubleSide:THREE.FrontSide, depthWrite:!sheet });
    // Lambert has no specular lobe, metalness, environment reflection or rim.
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=waveGLSL+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal=kunBentNormal(position,objectNormal,kunSpan,kunSpanGradient);');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.y+=kunHeight(position,kunSpan);');
    };
    material.customProgramCacheKey=()=> 'kun-vertical-swim-v1';
    mesh.material=material; mesh.renderOrder=sheet?2:0;
    // Rest bounds do not include the shader's displacement.
    mesh.frustumCulled=false;
    finCoordinates(mesh);
    materials.push(material);
  }
  const restBox=new THREE.Box3().setFromObject(root);
  const bounds=restBox.clone();
  bounds.min.y-=SWIM.bodyLength*SWIM.flukeAmpFrac;
  bounds.max.y+=SWIM.bodyLength*SWIM.flukeAmpFrac;
  return {root,bounds,restBox,materials,
    update(gameMs,phase,rest) { uniforms.kunCycle.value=phase??gameMs/SWIM.periodMs; uniforms.kunEnabled.value=rest?0:1; },
    inspect:()=>({ ...SWIM, verticalAxis:'Y', sidewaysDisplacement:0,
      materials:materials.map(m=>({name:m.name,type:m.type,transparent:m.transparent,depthWrite:m.depthWrite,side:m.side,map:!!m.map})),
      finWeights:'normalized reference UV root-to-tip projection; independent of fin scale',
      normalDeformation:'inverse-transpose height-field Jacobian, including fin span gradient',
      nose:uniforms.kunNose.value,tail:uniforms.kunTail.value }),
    dispose() {for(const mesh of meshes) mesh.geometry.dispose(); for(const m of materials) {m.map?.dispose();m.dispose();} }
  };
}
