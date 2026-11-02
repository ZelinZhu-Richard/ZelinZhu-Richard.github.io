import * as THREE from 'three';
import { BODY_LENGTH, PILLAR_CENTER, WORLD, openingView } from './journey.js';

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

export const FOG_DENSITY = .0011;
// Slower than Kun's growth, so distant pillars still fade once the sea looks small.
export const fogDensity = scale => FOG_DENSITY / Math.pow(scale, .6);

const FOV_TAN = Math.tan(21 * Math.PI / 180);
// Stone composed behind Kun in the opening shot: depth along the view, offset to the side, size, kind.
const OPENING_STAND = [[330, -215, .62, 1], [470, -110, .72, 3], [420, 235, .66, 2], [620, 90, .9, 5],
  [760, -380, .95, 4], [820, 420, .9, 6], [300, 330, .5, 7]];
// Cliffs at the frame edges: where the inner edge sits in half-frames, depth, the height their
// top reaches in half-heights, and how far each wall turns from the view.
const FRAME_CLIFFS = [{ kind: 0, edge: -.56, depth: 1, top: .08, turn: -.35 }, { kind: 1, edge: .66, depth: .86, top: .2, turn: .3 + Math.PI },
  { kind: 2, edge: -.14, depth: .42, top: -.62, turn: .4 }, { kind: 2, edge: .3, depth: .34, top: -.76, turn: -.3 + Math.PI }];
// Far embers in the two posed shots, as offsets from the view in half-frames.
const EMBERS = [[-.78, -.1], [-.34, -.2], [.28, -.6], [.88, -.02], [.76, -.34]];

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
      uniform vec3 uAbyss, uDeep, uHaze, uHorizon, uLight, uCamera, uKey, uAmbient;
      uniform float uDensity, uTime, uViewScale, uFoot, uNear;
      uniform sampler2D tGobo, tRock;
      varying vec3 vWorld, vNormal, vPaint;
      ${noiseGLSL}
      float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
      void main(){
        float dist=length(vWorld-uCamera);
        #ifdef USE_ROCK_INSTANCING
          // Needle clumps tear apart toward their edges, so no polygon outline survives.
          if(vPaint.g>.5){
            float torn=vnoise(vec2(dot(vWorld,vec3(.31,.82,.22)),dot(vWorld,vec3(-.66,.24,.71)))*vec2(.5,1.6));
            if(torn>vPaint.b*2.6+.12)discard;
          }
          // Stone clears from around the lens. In the posed shots nothing stands in front of Kun.
          if(ign(gl_FragCoord.xy)>smoothstep(uNear*.92,uNear,dist))discard;
        #endif
        vec3 n=normalize(vNormal);
        // The painted cliff, projected on the two vertical planes and blended by the face.
        vec2 facing=pow(abs(n.xz),vec2(4.));
        facing/=facing.x+facing.y+1e-4;
        vec3 cliff=texture2D(tRock,vec2(vWorld.z,vWorld.y)/170.).rgb*facing.x+texture2D(tRock,vec2(vWorld.x,vWorld.y)/170.).rgb*facing.y;
        // A finer pass of the same cliff keeps close stone from going soft.
        float closeBy=1.-smoothstep(60.,420.,dist/sqrt(uViewScale));
        if(closeBy>.001){
          vec3 fine=texture2D(tRock,vec2(vWorld.z,vWorld.y)/37.).rgb*facing.x+texture2D(tRock,vec2(vWorld.x,vWorld.y)/37.).rgb*facing.y;
          cliff*=mix(vec3(1.),fine*3.4,closeBy*.8);
        }
        vec3 albedo=cliff*(1.-.55*vPaint.r);
        #ifdef SEA_FLOOR
          albedo*=.85;
        #endif
        albedo=mix(albedo,vec3(.0075,.0105,.012),vPaint.g*.94);
        vec2 q=vWorld.xz+uLight.xz*(640.-vWorld.y)/uLight.y;
        float web=texture2D(tGobo,q/(90.*uViewScale)+vec2(uTime*.01,uTime*.006)).g;
        float beam=texture2D(tGobo,q/(420.*uViewScale)+vec2(uTime*.003,-uTime*.002)).r;
        float top=max(dot(n,uLight),0.);
        vec3 toEye=normalize(uCamera-vWorld);
        vec3 lit=uKey*top*top*(.35+1.5*web+2.2*beam)+uAmbient*(.5+.5*n.y)+uAmbient*1.1*max(dot(n,toEye),0.);
        // Close stone keeps its surface even on the side away from the light.
        vec3 c=albedo*(lit+uAmbient*closeBy*2.4);
        // The water behind a pillar scatters a cool edge around it.
        c+=uHaze*.05*pow(1.-max(dot(n,toEye),0.),3.)*(1.-vPaint.g);
        float f=1.-exp(-pow(dist*uDensity,2.));
        #ifdef SEA_FLOOR
          f=max(f,smoothstep(2800.,4300.,length(vWorld.xz)));
        #endif
        #ifdef SEA_FLOOR
          // The seabed falls to near black, meeting the far haze only at the horizon.
          c=mix(c,mix(uAbyss*1.2,uHorizon,smoothstep(.45,.98,f)),f);
        #else
          // Pillars dissolve into the far haze with distance, staying dark while they are near.
          vec3 far=uHorizon;
          // At the seabed a pillar takes the seabed's own fog, so its foot leaves no shape.
          vec3 low=mix(uAbyss*1.2,far,smoothstep(.45,.98,f));
          c=mix(c,mix(low,far,smoothstep(0.,uFoot*2.,vWorld.y)),f);
          // Near feet dissolve at their own heights; far ones are already gone.
          float rise=uFoot*(.25+1.5*fbm2(vWorld.xz*.009/uViewScale+vec2(uTime*.008,0.)));
          float foot=1.-smoothstep(0.,rise,vWorld.y);
          c=mix(c,mix(uAbyss*1.1,low,f),foot*foot*.92);
        #endif
        // Stone ends at its own uneven height. A negative alpha asks the composite to melt it
        // into a blur of the scene, so a pillar has no lower contour to trace.
        float melt=0.;
        #ifdef USE_ROCK_INSTANCING
          float footing=uFoot*(.16+.9*fbm2(vWorld.xz*.011/uViewScale+vec2(uTime*.008,0.)));
          melt=1.-smoothstep(footing*.1,footing,vWorld.y);
        #endif
        gl_FragColor=vec4(c,-melt);
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
      uniform vec3 uAbyss,uDeep,uSea,uHaze,uHorizon,uShaft,uLight,uCamera; uniform float uTime,uSurface,uDensity,uViewScale,uBand;
      uniform sampler2D tGobo;
      varying vec3 vDir;
      void main(){
        vec3 ray=normalize(vDir);
        float up=ray.y, sun=max(dot(ray,uLight),0.);
        // The water column stays dark almost to the surface, lifting only around the light.
        vec3 c=mix(uAbyss*.3,uDeep*.62,smoothstep(-.4,.04,up));
        c=mix(c,uDeep*1.12,smoothstep(.05,.62,up));
        c+=uSea*pow(sun,4.)*.5+uHaze*pow(sun,14.)*.42+uShaft*pow(sun,60.)*.34;
        float murk=texture2D(tGobo,ray.xz*.42/(abs(up)+.55)+uTime*.0016).b;
        c*=.8+.4*murk;
        // Far water pales into a band of haze behind the stone. Its height is uneven, so it
        // never reads as a line.
        float rise=texture2D(tGobo,vec2(atan(ray.x,ray.z)*.31,.21)).b;
        c=mix(c,uHorizon,uBand*exp(-pow(max(up-.015,0.)/(.05+.1*rise),1.5))*smoothstep(-.1,0.,up));
        if(up>.02){
          // The surface from below. Every ripple face either catches the light or falls dark,
          // which gives the fine banding; big warm glints gather only near the sun.
          float t=(uSurface-uCamera.y)/up;
          vec2 p=uCamera.xz+ray.xz*t;
          float size=170.*pow(uViewScale,.3);
          vec2 flow=vec2(uTime*.006,uTime*.0035);
          vec2 e=vec2(.0022,0.);
          vec2 q=p/size+flow;
          float h0=texture2D(tGobo,q).b;
          vec2 slope=vec2(texture2D(tGobo,q+e.xy).b-h0,texture2D(tGobo,q+e.yx).b-h0);
          vec2 q2=p/(size*.37)-flow*1.7+slope*2.;
          float h1=texture2D(tGobo,q2).b;
          slope+=.7*vec2(texture2D(tGobo,q2+e.xy).b-h1,texture2D(tGobo,q2+e.yx).b-h1);
          vec2 q3=p/(size*.13)+flow*2.3-slope;
          float h2=texture2D(tGobo,q3).b;
          slope+=.55*vec2(texture2D(tGobo,q3+e.xy).b-h2,texture2D(tGobo,q3+e.yx).b-h2);
          vec2 toSun=normalize(uLight.xz+1e-4);
          float facet=smoothstep(-.5,.8,dot(slope,toSun)*44.);
          float swell=texture2D(tGobo,p/(size*3.1)+flow*.4).b;
          vec3 water=mix(uAbyss*.42,uSea*vec3(.5,.7,.88),facet*facet*facet*(.34+.66*pow(sun,5.)))*(.5+.95*swell);
          float glow=pow(sun,14.);
          water+=uHaze*glow*facet*facet*.55;
          float glint=smoothstep(.1,.9,1.-length(slope-toSun*.014)*42.);
          float pool=pow(sun,36.)*.42+pow(sun,110.)*7.;
          float top=smoothstep(.44,.58,up);
          vec3 cream=mix(uShaft*1.4,vec3(2.1,1.86,1.42),pow(sun,40.));
          vec3 surface=water+cream*glint*min(pool,1.)*(.08+.92*top);
          surface+=cream*glint*max(pool-1.,0.)*.5*top;
          float near=exp(-pow(t*uDensity*.32,2.));
          c=mix(c,surface,near*smoothstep(.34,.56,up));
        }
        gl_FragColor=vec4(c,0.);
        #include <colorspace_fragment>
      }`,
  });
}

function placements() {
  const random = mulberry(20261101);
  const hero = [], field = [];
  const open = openingView();
  // Pillar 1 anchors the sea, and a composed stand fills the opening shot.
  hero.push({ kind: 0, x: PILLAR_CENTER.x, z: PILLAR_CENTER.z, rotation: .6, scale: 1 });
  for (const [depth, side, scale, kind] of OPENING_STAND) {
    hero.push({ kind, x: open.x + open.fx * depth + open.rx * side, z: open.z + open.fz * depth + open.rz * side, rotation: random() * 6.28, scale });
  }
  const separated = (x, z, list, gap) => list.every(p => Math.hypot(p.x - x, p.z - z) > gap);
  for (let tries = 0; hero.length < 22 && tries < 6000; tries++) {
    const radius = 240 + random() * 2800, angle = random() * Math.PI * 2;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    if (!separated(x, z, hero, 190) || Math.hypot(x - open.x, z - open.z) < 170) continue;
    // Towers grow toward the outer sea, so a grown Kun still passes stone close by.
    hero.push({ kind: hero.length % 8, x, z, rotation: random() * 6.28, scale: (.72 + random() * .5) * (1 + radius / 3000 * .7) });
  }
  for (let tries = 0; field.length < 520 && tries < 30000; tries++) {
    const radius = 300 + Math.pow(random(), .62) * 4300, angle = random() * Math.PI * 2;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    const cluster = Math.sin(x * .0041 + 1.3) * Math.cos(z * .0037 - .4) + .25 * Math.sin(x * .013 + z * .011);
    if (cluster < -.32 || !separated(x, z, hero, 120) || !separated(x, z, field.slice(-150), 62) || Math.hypot(x - open.x, z - open.z) < 150) continue;
    field.push({ kind: field.length % 5, x, z, rotation: random() * 6.28, scale: .6 + random() * .75, stretch: .7 + random() * .5, sink: 40 + random() * 46 });
  }
  return { hero, field };
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
    uHorizon: { value: palette.deep.clone().multiplyScalar(.62).add(palette.haze.clone().multiplyScalar(.36)) },
    uLight: { value: light }, uCamera: { value: new THREE.Vector3() }, uTime: { value: 0 },
    uDensity: { value: .003 }, uSurface: { value: WORLD.surface }, uViewScale: { value: 1 }, uFoot: { value: 90 }, uNear: { value: 30 }, uBand: { value: 1 }, tGobo: { value: gobo }, tRock: { value: rockTexture },
    uKey: { value: new THREE.Color(1.15, 1.2, 1.2) }, uAmbient: { value: new THREE.Color(.075, .1, .118) },
  };
  const meshes = new Map();
  seaRoot.updateMatrixWorld(true);
  seaRoot.traverse(object => { if (object.isMesh) meshes.set(object.name, object); });
  const geometries = (name, count) => Array.from({ length: count }, (_, i) => bakedGeometry(meshes.get(`${name}-${i + 1}`)));
  const heroGeometry = geometries('ref-pillar', 8), farGeometry = geometries('far-pillar', 5);
  const deepGeometry = geometries('deep-pillar', 5), cliffGeometry = geometries('cliff', 3);
  for (const geometry of [...heroGeometry, ...farGeometry, ...cliffGeometry]) geometry.computeBoundingBox();
  const rock = rockMaterial(shared, true), floorMaterial = rockMaterial(shared, false);
  const layout = placements();
  // Where mist gathers: soft pools around every pillar, used by the volume pass.
  const mistSize = 256, mistData = new Uint8Array(mistSize * mistSize);
  const mistField = new Float32Array(mistSize * mistSize);
  for (const item of [...layout.hero, ...layout.field]) {
    const cx = (item.x / 8000 + .5) * mistSize, cy = (item.z / 8000 + .5) * mistSize, radius = 1.5 + 1.5 * item.scale;
    for (let y = Math.max(0, Math.floor(cy - radius * 2.5)); y < Math.min(mistSize, cy + radius * 2.5); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius * 2.5)); x < Math.min(mistSize, cx + radius * 2.5); x++) {
        // The strongest pool wins, so a dense stand of pillars never merges into one sheet.
        mistField[y * mistSize + x] = Math.max(mistField[y * mistSize + x], Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (radius * radius)));
      }
    }
  }
  for (let i = 0; i < mistData.length; i++) mistData[i] = Math.round(255 * mistField[i]);
  const mistMap = new THREE.DataTexture(mistData, mistSize, mistSize, THREE.RedFormat, THREE.UnsignedByteType);
  mistMap.minFilter = mistMap.magFilter = THREE.LinearFilter;
  mistMap.needsUpdate = true;

  const matrix = new THREE.Matrix4(), rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), size = new THREE.Vector3();
  const composed = item => {
    quaternion.setFromEuler(rotation.set(0, item.rotation, 0));
    // Far pillars sink by varied depths, so their feet never line up into a repeated shape.
    return new THREE.Matrix4().compose(position.set(item.x, -(item.sink ?? 6), item.z), quaternion, size.set(item.scale, item.scale * (item.stretch ?? 1), item.scale));
  };
  const batch = (geometry, capacity) => {
    const mesh = new THREE.InstancedMesh(geometry, rock, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    props.add(mesh);
    return mesh;
  };
  const heroBatches = heroGeometry.map(geometry => batch(geometry, layout.hero.length));
  const farBatches = farGeometry.map(geometry => batch(geometry, 160));
  const deepBatches = deepGeometry.map(geometry => batch(geometry, 220));
  const cliffBatches = cliffGeometry.map(geometry => batch(geometry, 4));
  const batches = [...heroBatches, ...farBatches, ...deepBatches, ...cliffBatches];
  for (const item of [...layout.hero, ...layout.field]) item.matrix = composed(item);
  const floor = new THREE.Mesh(bakedGeometry(meshes.get('sea_floor')), floorMaterial);
  floor.position.y = -24;
  props.add(floor);
  group.add(props);
  // Named reference pillars for the scale gate, with their real world extents.
  const named = new Map();
  layout.hero.forEach((item, index) => {
    if (index >= 8) return;
    const geometry = heroGeometry[item.kind];
    const m = new THREE.Matrix4().compose(new THREE.Vector3(item.x, -6, item.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, item.rotation, 0)), new THREE.Vector3().setScalar(item.scale));
    named.set(`ref-pillar-${index + 1}`, geometry.boundingBox.clone().applyMatrix4(m));
  });
  const colliders = layout.hero.map(item => {
    const box = heroGeometry[item.kind].boundingBox;
    return { x: item.x, z: item.z, radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * .42 * item.scale, height: box.max.y * item.scale };
  });
  for (const item of layout.field) {
    const box = farGeometry[item.kind].boundingBox;
    colliders.push({ x: item.x, z: item.z, radius: (box.max.x - box.min.x) * .28 * item.scale, height: box.max.y * item.scale * item.stretch - item.sink });
  }
  // The opening's framing cliffs are real stone; the final shot's are placed as it arrives.
  const openingCliffs = FRAME_CLIFFS.map(() => ({ x: 1e6, z: 1e6, radius: 0, height: 0 }));
  colliders.push(...openingCliffs);
  const stages = [FRAME_CLIFFS.map(cliff => ({ kind: cliff.kind, x: 1e6, z: 1e6, matrix: new THREE.Matrix4() })),
    FRAME_CLIFFS.map(cliff => ({ kind: cliff.kind, x: 1e6, z: 1e6, matrix: new THREE.Matrix4() }))];
  function placeCliffs(stage, pose, pitch, scale, aspect, slide) {
    const spread = 1 + slide * .9;
    FRAME_CLIFFS.forEach((cliff, index) => {
      const depth = (118 + 62 * (scale - 1)) * cliff.depth;
      const top = pose.y + depth * Math.tan(pitch + Math.atan(cliff.top * FOV_TAN));
      const box = cliffGeometry[cliff.kind].boundingBox, unit = (top + 14) / box.max.y;
      const across = (cliff.edge * depth * FOV_TAN * aspect + Math.sign(cliff.edge) * box.max.x * unit * .9) * spread;
      const x = pose.x + pose.fx * depth - pose.fz * across, z = pose.z + pose.fz * depth + pose.fx * across;
      const item = stages[stage][index];
      item.x = x; item.z = z;
      item.matrix.compose(position.set(x, -14, z), quaternion.setFromEuler(rotation.set(0, Math.atan2(pose.fx, pose.fz) + cliff.turn, 0)), size.set(unit * 1.1, unit, unit * 1.1));
      if (stage === 0) Object.assign(openingCliffs[index], { x, z, radius: box.max.x * unit * .7, height: top });
    });
  }
  let finaleOn = false, frame = 0;
  const heading = new THREE.Vector3();
  // Only stone in the view cone and short of the fog is drawn, and distant stone uses the
  // light silhouettes. This is what lets the sea hold hundreds of pillars inside the budget.
  function cull(camera, scale, density) {
    camera.getWorldDirection(heading);
    const flat = Math.hypot(heading.x, heading.z) || 1, fx = heading.x / flat, fz = heading.z / flat;
    const cx = camera.position.x, cz = camera.position.z;
    const reach = 2.15 / density, detail = 860 * Math.pow(scale, .08), close = 150 * Math.sqrt(scale);
    // Wide enough that a quick turn never reveals a gap before the next pass.
    const cone = Math.cos(Math.min(1.5, Math.atan(FOV_TAN * Math.max(camera.aspect, 1)) + .62));
    const counts = new Map();
    const put = (mesh, item) => {
      const n = counts.get(mesh) ?? 0;
      if (n >= mesh.instanceMatrix.count) return;
      mesh.setMatrixAt(n, item.matrix);
      counts.set(mesh, n + 1);
    };
    const seen = item => {
      const dx = item.x - cx, dz = item.z - cz, d = Math.hypot(dx, dz);
      if (d > reach || (d > close && dx * fx + dz * fz < d * cone)) return -1;
      return d;
    };
    for (const item of layout.hero) {
      const d = seen(item);
      if (d >= 0) put(d < detail * 1.5 ? heroBatches[item.kind] : farBatches[item.kind % 5], item);
    }
    for (const item of layout.field) {
      const d = seen(item);
      if (d >= 0) put(d < detail ? farBatches[item.kind] : deepBatches[item.kind], item);
    }
    for (const item of stages[0]) if (seen(item) >= 0) put(cliffBatches[item.kind], item);
    if (finaleOn) for (const item of stages[1]) put(cliffBatches[item.kind], item);
    for (const mesh of batches) {
      mesh.count = counts.get(mesh) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Mist cards stand on the camera's side of every foot, because only mist in front of stone
  // can hide where it ends. Mist behind a foot just outlines it.
  const cardRandom = mulberry(7171), cards = [];
  const addCard = (x, z, front, width) => {
    cards.push({ x, y: -46 + cardRandom() * 22, z, width: width * (.8 + cardRandom() * .5), front: front * (.9 + cardRandom() * .5),
      cell: Math.floor(cardRandom() * 9), flip: cardRandom() < .5 ? -1 : 1, seed: cardRandom() });
  };
  for (const item of layout.hero) for (let i = 0; i < 4; i++) addCard(item.x, item.z, 46 * item.scale, 300 * Math.max(item.scale, .85));
  for (const item of layout.field) for (let i = 0; i < 2; i++) addCard(item.x, item.z, 30 * item.scale, 230 * item.scale);

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
        // A distant mote keeps a readable size, so it can always be found.
        view.xy+=position.xy*max(aSize,-view.z*(aSize<.002?.007:.028))*step(.0005,aSize);
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
    group, props, colliders, named, light, heroLight, mistMap, cards, shafts: 5, motes: 8,
    placeOpening(cam, aspect) {
      finaleOn = false;
      const fx = cam.aimX - cam.x, fz = cam.aimZ - cam.z, length = Math.hypot(fx, fz) || 1;
      const pitch = Math.atan2(cam.aimY - cam.y, length);
      placeCliffs(0, { x: cam.x, y: cam.y, z: cam.z, fx: fx / length, fz: fz / length }, pitch, 1, aspect, 0);
    },
    placeFinale(rig, pitch, scale, aspect, mix) {
      finaleOn = rig.ready;
      if (finaleOn) placeCliffs(1, rig, pitch, scale, aspect, 1 - mix);
    },
    update(camera, gameMs, scale, mix = 0) {
      // The light stands ahead of the camera and to its right, so the bright water
      // and the slant of the shafts stay composed as Kun turns.
      camera.getWorldDirection(look);
      const azimuth = Math.atan2(look.x, look.z) - .34 * Math.min(1, camera.aspect);
      light.set(Math.sin(azimuth) * .92, 1, Math.cos(azimuth) * .92).normalize();
      // Kun keeps a near-overhead key, leaning a little toward the camera.
      heroLight.set(-look.x * .34 + look.z * .16, 1, -look.z * .34 - look.x * .16).normalize();
      shared.uCamera.value.copy(camera.position);
      shared.uTime.value = gameMs / 1000;
      shared.uDensity.value = fogDensity(scale);
      shared.uViewScale.value = Math.pow(scale, .8);
      shared.uFoot.value = 46 + 14 * Math.sqrt(scale);
      shared.uNear.value = THREE.MathUtils.lerp(14 + 6 * scale, 14.8 * scale, mix);
      speckMaterial.uniforms.uBox.value = 170 * Math.pow(scale, .9);
      speckMaterial.uniforms.uPixel.value = Math.min(window.devicePixelRatio || 1, 2);
      // The test scene has no stone to break the horizon, so it keeps a plain gradient.
      shared.uBand.value = props.visible ? 1 : 0;
      if (props.visible && frame++ % 6 === 0) cull(camera, scale, fogDensity(scale));
    },
    refresh() { frame = 0; },
    showMote(mote, scale, gameMs, camera, mix) {
      for (let i = 0; i < 8; i++) setMote(i, 0, 0, 0, 0, 0);
      if (mote.active) setMote(0, mote.x, mote.y, mote.z, BODY_LENGTH * scale * .34, mote.fade * (.86 + .14 * Math.sin(gameMs * .004)));
      if (mix > .01) {
        const depth = BODY_LENGTH * scale * 14;
        const right = position.set(1, 0, 0).applyQuaternion(camera.quaternion).clone(), up = size.set(0, 1, 0).applyQuaternion(camera.quaternion).clone();
        camera.getWorldDirection(look);
        EMBERS.forEach(([x, y], i) => {
          const p = camera.position.clone().addScaledVector(look, depth).addScaledVector(right, x * depth * FOV_TAN * camera.aspect).addScaledVector(up, y * depth * FOV_TAN);
          setMote(i + 1, p.x, p.y, p.z, .001, mix * (.6 + .3 * Math.sin(gameMs * .0013 + i * 2.4)));
        });
      }
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
