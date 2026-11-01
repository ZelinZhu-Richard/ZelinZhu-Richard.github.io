import * as THREE from 'three';
import { BODY_LENGTH, PILLAR_CENTER, WORLD } from './journey.js';

const palette = {
  abyss: new THREE.Color('#0B161C'), deep: new THREE.Color('#172A35'), sea: new THREE.Color('#30444E'),
  haze: new THREE.Color('#607277'), shaft: new THREE.Color('#939994'), ink: new THREE.Color('#17171C'),
  vermilion: new THREE.Color('#D4432C'),
};

// Deterministic placement, independent of gameplay randomness.
function mulberry(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noiseGLSL = `
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),u.x),u.y);}
float fbm2(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+vec2(7.1,3.3);a*=.5;}return s;}
`;

function bakedGeometry(mesh) {
  const geometry = mesh.geometry.clone();
  for (const name of ['position', 'normal', 'color']) {
    const source = geometry.attributes[name];
    if (!source) continue;
    const size = source.itemSize, values = new Float32Array(source.count * size);
    for (let i = 0; i < source.count; i++) {
      values[i * size] = source.getX(i); values[i * size + 1] = source.getY(i); values[i * size + 2] = source.getZ(i);
      if (size === 4) values[i * size + 3] = source.getW(i);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, size));
  }
  mesh.updateWorldMatrix(true, false);
  geometry.applyMatrix4(mesh.matrixWorld);
  return geometry;
}

function rockMaterial(shared, instanced) {
  return new THREE.ShaderMaterial({
    uniforms: shared,
    defines: instanced ? { USE_ROCK_INSTANCING: 1 } : {},
    vertexShader: `
      attribute vec4 color;
      varying vec3 vWorld, vNormal, vPaint;
      void main(){
        vPaint=color.rgb;
        vec4 local=vec4(position,1.);
        vec3 n=normal;
        #ifdef USE_ROCK_INSTANCING
          local=instanceMatrix*local; n=mat3(instanceMatrix)*n;
        #endif
        vec4 world=modelMatrix*local;
        vWorld=world.xyz; vNormal=normalize(mat3(modelMatrix)*n);
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader: `
      uniform vec3 uFog, uHaze, uLight, uCamera; uniform float uDensity, uTime, uMist;
      varying vec3 vWorld, vNormal, vPaint;
      ${noiseGLSL}
      void main(){
        vec3 n=normalize(vNormal);
        float grain=fbm2(vec2(vWorld.x+vWorld.z,vWorld.y*.22)*.09);
        float streak=fbm2(vec2(atan(vWorld.x,vWorld.z)*3.+vWorld.x*.03,vWorld.y*.012));
        float top=clamp(dot(n,uLight)*.5+.5,0.,1.);
        vec3 rock=mix(vec3(.004,.006,.008),vec3(.03,.04,.047),pow(top,2.6)*(.45+.9*grain));
        rock*=1.-.72*vPaint.r;
        rock*=.72+.5*streak;
        rock=mix(rock,vec3(.0065,.008,.010),vPaint.g*.92);
        float dist=length(vWorld-uCamera);
        float f=1.-exp(-pow(dist*uDensity,2.));
        vec3 fogColor=mix(uFog,uHaze,smoothstep(.3,1.,f)*.2);
        vec3 c=mix(rock,fogColor,f);
        float wisp=fbm2(vWorld.xz*.0065+vec2(uTime*.018,-uTime*.012));
        float mist=exp(-max(vWorld.y-(wisp*30.-14.),0.)/(30.*uMist))*smoothstep(.32,.7,wisp);
        c=mix(c,uHaze*.72,clamp(mist,0.,1.)*.8);
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`,
  });
}

function domeMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: shared, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `
      varying vec3 vDir;
      void main(){vDir=position;vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.);gl_Position=p.xyww;}`,
    fragmentShader: `
      uniform vec3 uAbyss,uDeep,uSea,uHaze,uShaft,uLight,uCamera; uniform float uTime,uSurface,uDensity;
      varying vec3 vDir;
      ${noiseGLSL}
      void main(){
        vec3 ray=normalize(vDir);
        vec3 c=mix(uAbyss,uDeep,smoothstep(-.42,.02,ray.y));
        c=mix(c,uSea,smoothstep(.02,.42,ray.y));
        c=mix(c,uHaze,smoothstep(.34,.95,ray.y)*.7);
        c*=.82+.36*fbm2(ray.xz*2.6/(abs(ray.y)+.5)+uTime*.008);
        c+=uShaft*pow(max(dot(ray,uLight),0.),9.)*.22;
        if(ray.y>.015){
          float t=(uSurface-uCamera.y)/ray.y;
          vec2 p=uCamera.xz+ray.xz*t;
          float scale=.012;
          float a=fbm2(p*scale+vec2(uTime*.05,uTime*.03));
          float b=fbm2(p*scale*2.3-vec2(uTime*.04,-uTime*.06)+a*2.);
          float glint=smoothstep(.56,.68,b)*smoothstep(.4,.62,a);
          float fade=exp(-pow(t*uDensity*.55,2.));
          c=mix(c,c*(.62+.76*b)+uShaft*glint*(.5+pow(max(dot(ray,uLight),0.),4.)*2.5),fade);
        }
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`,
  });
}

function placements() {
  const random = mulberry(20261101);
  const hero = [], far = [];
  // Pillar 1 anchors the sea; the others keep clear of the opening sight line.
  hero.push({ kind: 0, x: PILLAR_CENTER.x, z: PILLAR_CENTER.z, rotation: .6, scale: 1 });
  const separated = (x, z, list, gap) => list.every(p => Math.hypot(p.x - x, p.z - z) > gap);
  for (let tries = 0; hero.length < 15 && tries < 4000; tries++) {
    const radius = 230 + random() * 1000, angle = random() * Math.PI * 2;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    const openLane = Math.hypot(x + 254, z - 180) < 200 || Math.abs(x * .57 + z * .82) < 80 && x < 0;
    if (openLane || !separated(x, z, hero, 170)) continue;
    hero.push({ kind: hero.length % 8, x, z, rotation: random() * 6.28, scale: .72 + random() * .5 });
  }
  for (let tries = 0; far.length < 190 && tries < 12000; tries++) {
    const radius = 420 + Math.pow(random(), .7) * 3000, angle = random() * Math.PI * 2;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    const cluster = Math.sin(x * .0041 + 1.3) * Math.cos(z * .0037 - .4) + .25 * Math.sin(x * .013 + z * .011);
    if (cluster < -.1 || !separated(x, z, hero, 130) || !separated(x, z, far, 76)) continue;
    far.push({ kind: far.length % 5, x, z, rotation: random() * 6.28, scale: .7 + random() * .9 });
  }
  return { hero, far };
}

export function createWorld(seaRoot) {
  const group = new THREE.Group();
  group.name = 'north-sea';
  const props = new THREE.Group();
  const light = new THREE.Vector3(.2, 1, .12).normalize();
  const shared = {
    uAbyss: { value: palette.abyss }, uDeep: { value: palette.deep }, uSea: { value: palette.sea },
    uHaze: { value: palette.haze }, uShaft: { value: palette.shaft }, uFog: { value: palette.deep },
    uLight: { value: light }, uCamera: { value: new THREE.Vector3() }, uTime: { value: 0 },
    uDensity: { value: .003 }, uSurface: { value: WORLD.surface }, uMist: { value: 1 },
  };
  const meshes = new Map();
  seaRoot.updateMatrixWorld(true);
  seaRoot.traverse(object => { if (object.isMesh) meshes.set(object.name, object); });
  const heroGeometry = [], farGeometry = [];
  for (let i = 1; i <= 8; i++) heroGeometry.push(bakedGeometry(meshes.get(`ref-pillar-${i}`)));
  for (let i = 1; i <= 5; i++) farGeometry.push(bakedGeometry(meshes.get(`far-pillar-${i}`)));
  const rock = rockMaterial(shared, true), floorMaterial = rockMaterial(shared, false);
  const layout = placements();
  const matrix = new THREE.Matrix4(), rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), size = new THREE.Vector3();
  const place = (item, mesh, index) => {
    quaternion.setFromEuler(rotation.set(0, item.rotation, 0));
    matrix.compose(position.set(item.x, -6, item.z), quaternion, size.setScalar(item.scale));
    mesh.setMatrixAt(index, matrix);
  };
  const instanced = (geometry, items, kind) => {
    const chosen = items.filter(item => item.kind === kind);
    const mesh = new THREE.InstancedMesh(geometry, rock, chosen.length);
    chosen.forEach((item, index) => place(item, mesh, index));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    props.add(mesh);
    return mesh;
  };
  heroGeometry.forEach((geometry, kind) => instanced(geometry, layout.hero, kind));
  farGeometry.forEach((geometry, kind) => instanced(geometry, layout.far, kind));
  const floor = new THREE.Mesh(bakedGeometry(meshes.get('sea_floor')), floorMaterial);
  floor.position.y = -24;
  props.add(floor);
  group.add(props);
  // Named reference pillars for the scale gate, with their real world extents.
  const named = new Map();
  layout.hero.forEach((item, index) => {
    if (index >= 8) return;
    const geometry = heroGeometry[item.kind];
    geometry.computeBoundingBox();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(item.x, -6, item.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, item.rotation, 0)), new THREE.Vector3().setScalar(item.scale));
    named.set(`ref-pillar-${index + 1}`, geometry.boundingBox.clone().applyMatrix4(m));
  });
  const colliders = layout.hero.map(item => {
    const box = heroGeometry[item.kind].boundingBox ?? (heroGeometry[item.kind].computeBoundingBox(), heroGeometry[item.kind].boundingBox);
    return { x: item.x, z: item.z, radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * .42 * item.scale, height: box.max.y * item.scale };
  });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), domeMaterial(shared));
  dome.frustumCulled = false; dome.renderOrder = -10;
  group.add(dome);

  const moteMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: palette.vermilion } },
    vertexShader: `
      attribute float aSize, aFade;
      varying vec2 vUv; varying float vFade;
      void main(){vUv=uv;vFade=aFade;
        vec4 view=viewMatrix*vec4(instanceMatrix[3].xyz,1.);
        view.xy+=position.xy*aSize;
        gl_Position=projectionMatrix*view;}`,
    fragmentShader: `
      uniform vec3 uColor; varying vec2 vUv; varying float vFade;
      void main(){float d=length(vUv-.5)*2.;
        float core=smoothstep(.14,.0,d);
        float halo=pow(max(0.,1.-d),2.6);
        vec3 c=uColor*(halo*.9)+vec3(1.,.72,.55)*core;
        gl_FragColor=vec4(c*vFade,1.);
        #include <colorspace_fragment>
      }`,
  });
  const moteGeometry = new THREE.PlaneGeometry(1, 1);
  moteGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(8), 1));
  moteGeometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(8), 1));
  const motes = new THREE.InstancedMesh(moteGeometry, moteMaterial, 8);
  motes.frustumCulled = false; motes.renderOrder = 4;
  group.add(motes);
  const setMote = (index, x, y, z, size, fade) => {
    motes.setMatrixAt(index, matrix.makeTranslation(x, y, z));
    moteGeometry.attributes.aSize.array[index] = size;
    moteGeometry.attributes.aFade.array[index] = fade;
  };

  return {
    group, props, colliders, named, light, shafts: 4, motes: 8,
    update(camera, gameMs, scale) {
      shared.uCamera.value.copy(camera.position);
      shared.uTime.value = gameMs / 1000;
      shared.uDensity.value = .0032 / Math.pow(scale, .92);
      shared.uMist.value = Math.pow(scale, .5);
    },
    showMote(mote, scale, gameMs) {
      for (let i = 0; i < 8; i++) setMote(i, 0, 0, 0, 0, 0);
      if (mote.active) setMote(0, mote.x, mote.y, mote.z, BODY_LENGTH * scale * .34, mote.fade * (.86 + .14 * Math.sin(gameMs * .004)));
      motes.instanceMatrix.needsUpdate = true;
      moteGeometry.attributes.aSize.needsUpdate = true;
      moteGeometry.attributes.aFade.needsUpdate = true;
    },
    compose(camera, center) {
      // Static test-scene motes framed around Kun.
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      [[-7, -2.8], [-4, 3.8], [3, -3.7], [6, 1.4], [8, -1.4], [-1, 4.5]].forEach(([x, y], i) => {
        const p = center.clone().addScaledVector(right, x).addScaledVector(up, y);
        setMote(i, p.x, p.y, p.z, .42, 1);
      });
      for (let i = 6; i < 8; i++) setMote(i, 0, 0, 0, 0, 0);
      motes.instanceMatrix.needsUpdate = true;
      moteGeometry.attributes.aSize.needsUpdate = true;
      moteGeometry.attributes.aFade.needsUpdate = true;
    },
    dispose() {
      group.traverse(object => { object.geometry?.dispose(); object.material?.dispose?.(); });
      rock.dispose(); floorMaterial.dispose();
    },
  };
}
