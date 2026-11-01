import * as THREE from 'three';
import { BODY_LENGTH, PILLAR_CENTER, WORLD } from './journey.js';

const palette = {
  abyss: new THREE.Color('#0B161C'), deep: new THREE.Color('#172A35'), sea: new THREE.Color('#30444E'),
  haze: new THREE.Color('#607277'), shaft: new THREE.Color('#939994'), ink: new THREE.Color('#17171C'),
  vermilion: new THREE.Color('#D4432C'),
};

// Deterministic placement, independent of gameplay randomness.
export function mulberry(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FOG_DENSITY = .00165;

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
    defines: instanced ? { USE_ROCK_INSTANCING: 1 } : { SEA_FLOOR: 1 },
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
      uniform vec3 uDeep, uHaze, uLight, uCamera, uKey, uAmbient;
      uniform float uDensity, uTime, uViewScale;
      uniform sampler2D tGobo, tRock;
      varying vec3 vWorld, vNormal, vPaint;
      ${noiseGLSL}
      void main(){
        vec3 n=normalize(vNormal);
        // The painted cliff, projected on the two vertical planes and blended by the face.
        vec2 facing=pow(abs(n.xz),vec2(4.));
        facing/=facing.x+facing.y+1e-4;
        vec3 cliff=texture2D(tRock,vec2(vWorld.z,vWorld.y)/170.).rgb*facing.x+texture2D(tRock,vec2(vWorld.x,vWorld.y)/170.).rgb*facing.y;
        vec3 albedo=cliff*(1.-.55*vPaint.r);
        #ifdef SEA_FLOOR
          albedo*=.34;
        #endif
        albedo=mix(albedo,vec3(.0075,.0105,.012),vPaint.g*.94);
        vec2 q=vWorld.xz+uLight.xz*(640.-vWorld.y)/uLight.y;
        float web=texture2D(tGobo,q/(90.*uViewScale)+vec2(uTime*.01,uTime*.006)).g;
        float beam=texture2D(tGobo,q/(420.*uViewScale)+vec2(uTime*.003,-uTime*.002)).r;
        float top=max(dot(n,uLight),0.);
        vec3 toEye=normalize(uCamera-vWorld);
        vec3 lit=uKey*top*top*(.35+1.5*web+2.2*beam)+uAmbient*(.5+.5*n.y)+uAmbient*1.1*max(dot(n,toEye),0.);
        vec3 c=albedo*lit;
        // The water behind a pillar scatters a cool edge around it.
        c+=uHaze*.05*pow(1.-max(dot(n,toEye),0.),3.)*(1.-vPaint.g);
        float dist=length(vWorld-uCamera);
        float f=1.-exp(-pow(dist*uDensity,2.));
        // Fog fades to the same water colour the dome holds at the horizon.
        c=mix(c,uDeep*.86+uHaze*.13,f);
        gl_FragColor=vec4(c,0.);
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
      uniform vec3 uAbyss,uDeep,uSea,uHaze,uShaft,uLight,uCamera; uniform float uTime,uSurface,uDensity,uViewScale;
      uniform sampler2D tGobo;
      varying vec3 vDir;
      void main(){
        vec3 ray=normalize(vDir);
        float up=ray.y, sun=max(dot(ray,uLight),0.);
        // The water column: near black below, lifting and clearing toward the light.
        vec3 c=mix(uAbyss*.34,uDeep*.86,smoothstep(-.42,.05,up));
        c=mix(c,uSea*1.2,smoothstep(.02,.56,up));
        c+=uHaze*pow(sun,5.)*.2+uShaft*pow(sun,28.)*.32;
        c=mix(c,uDeep*.86+uHaze*.13,exp(-pow(up/.13,2.)));
        float murk=texture2D(tGobo,ray.xz*.42/(abs(up)+.55)+uTime*.0016).b;
        c*=.74+.52*murk;
        if(up>.008){
          float t=(uSurface-uCamera.y)/up;
          vec2 p=uCamera.xz+ray.xz*t;
          float size=120.*pow(uViewScale,.6);
          vec2 flow=vec2(uTime*.012,uTime*.007);
          float a=texture2D(tGobo,p/size+flow).g;
          float b=texture2D(tGobo,p/(size*.62)-flow*1.3+a*.04).g;
          float swell=texture2D(tGobo,p/(size*2.6)+flow*.4).b;
          float plate=smoothstep(.44,.82,a*.7+b*.5+swell*.24-.14);
          float pool=pow(sun,9.)*2.4+pow(sun,30.)*9.;
          float near=exp(-pow(t*uDensity*.6,2.));
          vec3 surface=c*(.42+.8*swell)+uShaft*plate*pool*1.4;
          c=mix(c,surface,near*smoothstep(.1,.4,up));
        }
        gl_FragColor=vec4(c,0.);
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
  for (let tries = 0; hero.length < 12 && tries < 4000; tries++) {
    const radius = 230 + random() * 1000, angle = random() * Math.PI * 2;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    const openLane = Math.hypot(x + 254, z - 180) < 200 || Math.abs(x * .57 + z * .82) < 80 && x < 0;
    if (openLane || !separated(x, z, hero, 170)) continue;
    hero.push({ kind: hero.length % 8, x, z, rotation: random() * 6.28, scale: .72 + random() * .5 });
  }
  for (let tries = 0; far.length < 150 && tries < 12000; tries++) {
    const radius = 420 + Math.pow(random(), .7) * 3000, angle = random() * Math.PI * 2;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    const cluster = Math.sin(x * .0041 + 1.3) * Math.cos(z * .0037 - .4) + .25 * Math.sin(x * .013 + z * .011);
    if (cluster < -.1 || !separated(x, z, hero, 130) || !separated(x, z, far, 76)) continue;
    far.push({ kind: far.length % 5, x, z, rotation: random() * 6.28, scale: .7 + random() * .6, stretch: .7 + random() * .45 });
  }
  return { hero, far };
}

export function createWorld(seaRoot, gobo, rockTexture) {
  const group = new THREE.Group();
  group.name = 'north-sea';
  const props = new THREE.Group();
  const light = new THREE.Vector3(.24, 1, .14).normalize();
  const heroLight = new THREE.Vector3(0, 1, 0);
  const look = new THREE.Vector3();
  const shared = {
    uAbyss: { value: palette.abyss }, uDeep: { value: palette.deep }, uSea: { value: palette.sea },
    uHaze: { value: palette.haze }, uShaft: { value: palette.shaft }, uFog: { value: palette.deep },
    uLight: { value: light }, uCamera: { value: new THREE.Vector3() }, uTime: { value: 0 },
    uDensity: { value: .003 }, uSurface: { value: WORLD.surface }, uViewScale: { value: 1 }, tGobo: { value: gobo }, tRock: { value: rockTexture },
    uKey: { value: new THREE.Color(1.15, 1.2, 1.2) }, uAmbient: { value: new THREE.Color(.15, .19, .215) },
  };
  const meshes = new Map();
  seaRoot.updateMatrixWorld(true);
  seaRoot.traverse(object => { if (object.isMesh) meshes.set(object.name, object); });
  const heroGeometry = [], farGeometry = [];
  for (let i = 1; i <= 8; i++) heroGeometry.push(bakedGeometry(meshes.get(`ref-pillar-${i}`)));
  for (let i = 1; i <= 5; i++) farGeometry.push(bakedGeometry(meshes.get(`far-pillar-${i}`)));
  const rock = rockMaterial(shared, true), floorMaterial = rockMaterial(shared, false);
  const layout = placements();
  // Where mist gathers: soft pools around every pillar, used by the volume pass.
  const mistSize = 256, mistData = new Uint8Array(mistSize * mistSize);
  const mistField = new Float32Array(mistSize * mistSize);
  for (const item of [...layout.hero, ...layout.far]) {
    const cx = (item.x / 8000 + .5) * mistSize, cy = (item.z / 8000 + .5) * mistSize, radius = 3.2 + 3.6 * item.scale;
    for (let y = Math.max(0, Math.floor(cy - radius * 2.5)); y < Math.min(mistSize, cy + radius * 2.5); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius * 2.5)); x < Math.min(mistSize, cx + radius * 2.5); x++) {
        mistField[y * mistSize + x] += Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (radius * radius));
      }
    }
  }
  for (let i = 0; i < mistData.length; i++) mistData[i] = Math.round(255 * Math.min(1, mistField[i] * .95));
  const mistMap = new THREE.DataTexture(mistData, mistSize, mistSize, THREE.RedFormat, THREE.UnsignedByteType);
  mistMap.minFilter = mistMap.magFilter = THREE.LinearFilter;
  mistMap.needsUpdate = true;
  const matrix = new THREE.Matrix4(), rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), size = new THREE.Vector3();
  const place = (item, mesh, index) => {
    quaternion.setFromEuler(rotation.set(0, item.rotation, 0));
    matrix.compose(position.set(item.x, -6, item.z), quaternion, size.set(item.scale, item.scale * (item.stretch ?? 1), item.scale));
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

  // Suspended specks wrap around the camera. They sparkle only where a shaft crosses them.
  const speckCount = 900, speckData = new Float32Array(speckCount * 4), speckRandom = mulberry(555);
  for (let i = 0; i < speckCount; i++) {
    for (let k = 0; k < 3; k++) speckData[i * 4 + k] = speckRandom();
    speckData[i * 4 + 3] = speckRandom();
  }
  const speckGeometry = new THREE.BufferGeometry();
  speckGeometry.setAttribute('position', new THREE.BufferAttribute(speckData.slice().filter((_, i) => i % 4 !== 3), 3));
  speckGeometry.setAttribute('aSeed', new THREE.BufferAttribute(speckData.filter((_, i) => i % 4 === 3), 1));
  const speckMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { uCamera: shared.uCamera, uLight: shared.uLight, uTime: shared.uTime, uViewScale: shared.uViewScale, uSize: { value: 1 },
      uBox: { value: 100 }, tGobo: { value: gobo }, uShaft: shared.uShaft, uPixel: { value: 1 } },
    vertexShader: `
      uniform vec3 uCamera,uLight; uniform float uTime,uBox,uPixel,uViewScale;
      uniform sampler2D tGobo;
      attribute float aSeed;
      varying float vGlow;
      void main(){
        vec3 p=position*uBox;
        p.y+=uTime*(.4+aSeed)*uBox*.004;
        p.xz+=vec2(sin(uTime*.1+aSeed*40.),cos(uTime*.13+aSeed*31.))*uBox*.01;
        p=mod(p-uCamera+uBox*.5,uBox)-uBox*.5+uCamera;
        vec4 view=viewMatrix*vec4(p,1.);
        vec2 q=p.xz+uLight.xz*(640.-p.y)/uLight.y;
        float beam=texture2D(tGobo,q/(130.*uViewScale)).r;
        float near=smoothstep(uBox*.5,uBox*.2,length(p-uCamera));
        vGlow=near*(.05+1.5*beam*beam)*(.4+aSeed);
        gl_PointSize=uPixel*(1.2+aSeed*1.6)*smoothstep(0.,uBox*.15,-view.z+uBox*.02)*(1.+uBox*.12/max(-view.z,1.));
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader: `
      uniform vec3 uShaft; varying float vGlow;
      void main(){float d=length(gl_PointCoord-.5)*2.;float a=smoothstep(1.,.1,d);
        gl_FragColor=vec4(uShaft*a*vGlow*.6,0.);
        #include <colorspace_fragment>
      }`,
  });
  const specks = new THREE.Points(speckGeometry, speckMaterial);
  specks.frustumCulled = false; specks.renderOrder = 3;
  group.add(specks);

  const moteMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
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
        gl_FragColor=vec4(c*vFade,0.);
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
    group, props, colliders, named, light, heroLight, mistMap, shafts: 5, motes: 8,
    update(camera, gameMs, scale) {
      // The light stands ahead of the camera and to its right, so the bright water
      // and the slant of the shafts stay composed as Kun turns.
      camera.getWorldDirection(look);
      const azimuth = Math.atan2(look.x, look.z) - .5;
      light.set(Math.sin(azimuth) * .62, 1, Math.cos(azimuth) * .62).normalize();
      // Kun keeps a near-overhead key, leaning a little toward the camera.
      heroLight.set(-look.x * .34 + look.z * .16, 1, -look.z * .34 - look.x * .16).normalize();
      shared.uCamera.value.copy(camera.position);
      shared.uTime.value = gameMs / 1000;
      shared.uDensity.value = FOG_DENSITY / Math.pow(scale, .92);
      shared.uViewScale.value = Math.pow(scale, .8);
      speckMaterial.uniforms.uBox.value = 170 * Math.pow(scale, .9);
      speckMaterial.uniforms.uPixel.value = Math.min(window.devicePixelRatio || 1, 2);
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
