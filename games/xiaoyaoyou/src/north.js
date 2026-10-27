import * as THREE from 'three';

export function createNorth() {
  const group=new THREE.Group();
  group.name='north-test-atmosphere';
  const canvas=document.createElement('canvas'); canvas.width=1;canvas.height=512;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,0,512);
  gradient.addColorStop(0,'#3F626B');gradient.addColorStop(.46,'#172A35');gradient.addColorStop(1,'#0E1B26');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,1,512);
  const background=new THREE.CanvasTexture(canvas);background.colorSpace=THREE.SRGBColorSpace;
  const shafts=[];
  const shaftMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{ink:{value:new THREE.Color('#708B91')}},
    vertexShader:'varying vec2 st; void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 ink; varying vec2 st; void main(){float edge=pow(max(0.,1.-abs(st.x*2.-1.)),2.);float fade=smoothstep(0.,.4,st.y);gl_FragColor=vec4(ink,edge*fade*.055);}' });
  for(let i=0;i<4;i++) {
    const shaft=new THREE.Mesh(new THREE.PlaneGeometry(2.8+i*.4,40),shaftMaterial);
    shaft.userData.index=i;shaft.renderOrder=-1;group.add(shaft);shafts.push(shaft);
  }
  const moteMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    uniforms:{ink:{value:new THREE.Color('#B94135')}},
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 ink;varying vec2 st;void main(){float d=length((st-.5)*2.);float a=(1.-smoothstep(.1,1.,d))*.8;gl_FragColor=vec4(ink,a);}' });
  const motes=[];
  for(let i=0;i<6;i++) {
    const mote=new THREE.Mesh(new THREE.PlaneGeometry(.16,.16),moteMaterial);
    mote.renderOrder=3;group.add(mote);motes.push(mote);
  }
  return {group,background,shafts:4,motes:6,
    compose(camera,center) {
      const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
      const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
      const up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
      shafts.forEach((shaft,i)=>{
        shaft.position.copy(center).addScaledVector(right,(i-1.5)*6.2).addScaledVector(forward,9).addScaledVector(up,9);
        shaft.quaternion.copy(camera.quaternion);shaft.rotateZ(-.10);
      });
      motes.forEach((mote,i)=>{
        mote.position.copy(center).addScaledVector(right,[-7,-4,3,6,8,-1][i]).addScaledVector(up,[-2.8,3.8,-3.7,1.4,-1.4,4.5][i]);
        mote.quaternion.copy(camera.quaternion);
      });
    },
    dispose(){group.traverse(o=>o.geometry?.dispose());shaftMaterial.dispose();moteMaterial.dispose();background.dispose();}
  };
}
