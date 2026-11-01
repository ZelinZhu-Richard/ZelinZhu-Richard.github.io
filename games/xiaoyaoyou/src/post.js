import * as THREE from 'three';

// HDR scene -> half-resolution volumetric light and mist -> bloom -> filmic grade.
// Every pass is counted in renderer.info, so the draw-call gate sees all of it.

const VERTEX = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';

const lerp = (a, b, t) => a + (b - a) * t;
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

function tiledNoise(size, cells, random) {
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * cells, fy = y / size * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), u = fade(fx - ix), v = fade(fy - iy);
    const at = (a, b) => lattice[(b % cells) * cells + (a % cells)];
    out[y * size + x] = lerp(lerp(at(ix, iy), at(ix + 1, iy), u), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), u), v);
  }
  return out;
}

function fbmTile(size, cells, octaves, random) {
  const out = new Float32Array(size * size);
  let amplitude = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = tiledNoise(size, cells << o, random);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amplitude;
    total += amplitude;
    amplitude *= .55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// R: beam mask with fine strands. G: caustic web. B: broad soft cloud for the surface.
export function createGobo(random) {
  const size = 512;
  const beams = new Float32Array(size * size);
  const spots = [];
  for (let i = 0; i < 7; i++) spots.push([random() * size, random() * size, 26 + random() * 46, .55 + random() * .45]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sum = 0;
    for (const [sx, sy, radius, power] of spots) {
      const dx = Math.min(Math.abs(x - sx), size - Math.abs(x - sx)), dy = Math.min(Math.abs(y - sy), size - Math.abs(y - sy));
      sum += power * Math.exp(-(dx * dx + dy * dy) / (radius * radius));
    }
    beams[y * size + x] = Math.min(1, sum);
  }
  const strands = fbmTile(size, 40, 3, random);
  const warp = fbmTile(size, 5, 3, random);
  const web = new Float32Array(size * size);
  const a = fbmTile(size, 9, 3, random), b = fbmTile(size, 9, 3, random);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const wx = Math.floor(x + warp[i] * 60) % size, wy = Math.floor(y + warp[(i + 7777) % warp.length] * 60) % size;
    const j = wy * size + wx;
    // Two ridged fields multiplied give the thin bright lines of real caustics.
    const r1 = 1 - Math.min(1, Math.abs(a[j] * 2 - 1) * 6.5), r2 = 1 - Math.min(1, Math.abs(b[j] * 2 - 1) * 6.5);
    web[i] = Math.min(1, r1 * .85 + r2 * .85);
  }
  const cloud = fbmTile(size, 4, 5, random);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const s = Math.max(0, Math.min(1, (strands[i] - .4) * 4.2));
    data[i * 4] = Math.round(255 * beams[i] * (.14 + .86 * s));
    data[i * 4 + 3] = Math.round(255 * s);
    data[i * 4 + 1] = Math.round(255 * web[i]);
    data[i * 4 + 2] = Math.round(255 * Math.max(0, Math.min(1, (cloud[i] - .2) * 1.7)));
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createMistVolume(random) {
  const size = 40;
  const lattice = o => { const n = 5 << o, v = new Float32Array(n * n * n); for (let i = 0; i < v.length; i++) v[i] = random(); return { n, v }; };
  const layers = [lattice(0), lattice(1), lattice(2)];
  const data = new Uint8Array(size * size * size);
  let index = 0;
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sum = 0, amplitude = 1, total = 0;
    for (const { n, v } of layers) {
      const fx = x / size * n, fy = y / size * n, fz = z / size * n;
      const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
      const u = fade(fx - ix), w = fade(fy - iy), t = fade(fz - iz);
      const at = (a, b, c) => v[(c % n) * n * n + (b % n) * n + (a % n)];
      sum += amplitude * lerp(
        lerp(lerp(at(ix, iy, iz), at(ix + 1, iy, iz), u), lerp(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), u), w),
        lerp(lerp(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), u), lerp(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), u), w), t);
      total += amplitude;
      amplitude *= .5;
    }
    data[index++] = Math.round(255 * sum / total);
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

const volumeFragment = `
precision highp float;
uniform sampler2D tDepth, tGobo, tMistMap;
uniform sampler3D tMist;
uniform mat4 uInverse;
uniform vec3 uCamera, uLight, uShaft, uMist, uLayers, uHero;
uniform vec2 uVanish;
uniform float uTime, uSurface, uScale, uReach, uShaftGain, uMistGain, uMistTop, uMistBottom, uAspect;
varying vec2 vUv;
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
vec3 worldAt(vec2 uv,float depth){vec4 w=uInverse*vec4(uv*2.-1.,depth*2.-1.,1.);return w.xyz/w.w;}
float beams(vec3 p){
  // Slide each sample along the light to the surface, so the mask extrudes into shafts.
  float climb=(uSurface-p.y)/uLight.y;
  vec2 q=p.xz+uLight.xz*climb+vec2(uTime*2.2,-uTime*1.4);
  float b=0.;
  if(uLayers.x>.001)b+=uLayers.x*texture2D(tGobo,q/130.).r;
  if(uLayers.y>.001)b+=uLayers.y*texture2D(tGobo,q/520.+.37).r;
  if(uLayers.z>.001)b+=uLayers.z*texture2D(tGobo,q/2080.+.71).r;
  // The light finds Kun: one broad shaft stands over the body wherever it swims.
  vec2 d=(p.xz+uLight.xz*climb-uHero.xy)/uHero.z;
  float strands=texture2D(tGobo,q/(uHero.z*2.4)).a;
  b+=exp(-dot(d,d))*(.12+1.1*strands*strands)*.9;
  return b;
}
void main(){
  float depth=texture2D(tDepth,vUv).r;
  vec3 end=worldAt(vUv,depth);
  vec3 ray=end-uCamera;
  float dist=length(ray);
  ray/=dist;
  // The march ends at the surface, so no screen row suddenly gains all its samples.
  float surface=ray.y>1e-3?(uSurface-uCamera.y)/ray.y:1e9;
  float reach=min(min(dist,uReach),surface);
  float jitter=ign(gl_FragCoord.xy);
  const int STEPS=16;
  float shafts=0.;
  for(int i=0;i<STEPS;i++){
    // Samples crowd toward the camera, where a beam spans the most screen.
    float u=(float(i)+jitter)/float(STEPS);
    float t=reach*u*u;
    vec3 p=uCamera+ray*t;
    if(p.y<uSurface){
      float depthBelow=(uSurface-p.y)/uSurface;
      float b=beams(p);
      // Columns fade in below the surface. Seen from afar, a column cut off at the
      // surface plane would end in a hard straight line.
      shafts+=b*b*exp(-depthBelow*1.2)*smoothstep(0.,.36,depthBelow)*u*2.;
    }
  }
  shafts/=float(STEPS);
  // Light scatters forward: shafts brighten as the view turns toward the surface.
  float phase=.42+1.3*pow(max(dot(ray,uLight),0.),2.);
  // Parallel light converges on one vanishing point, so the fine streaks radiate from it.
  vec2 fromSun=(vUv-uVanish)*vec2(uAspect,1.);
  float angle=atan(fromSun.x,-fromSun.y);
  // Broad groups, mid-width bands and a little fine strand, each drifting on its own.
  float groups=texture2D(tGobo,vec2(angle*.62+uTime*.0021,.31)).b;
  float bands=texture2D(tGobo,vec2(angle*2.1-uTime*.0034,.67)).b;
  float strands=texture2D(tGobo,vec2(angle*6.3+uTime*.005,.13)).a;
  float rays=smoothstep(.34,.82,groups*.62+bands*.5)*(.62+.38*strands);
  // Each ray ends at its own depth below the top of the frame, wherever the camera points.
  float length_=.42+1.05*texture2D(tGobo,vec2(angle*1.7,.83)).b;
  float below=max(1.-vUv.y-.08,0.);
  float fall=exp(-pow(below/length_,2.))*smoothstep(-.1,.45,vUv.y);
  vec3 scatter=uShaft*shafts*(reach/uReach)*phase*uShaftGain*22.*(.1+3.4*rays)*fall;
  // One shared bright region near the surface, which the rays visibly leave.
  vec2 source=(vUv-clamp(uVanish,vec2(.08,0.),vec2(.92,1.06)))*vec2(uAspect,1.);
  scatter+=uShaft*exp(-dot(source,source)*2.6)*.15*(.7+.5*groups);
  // Mist hugs the seabed: march only the slab of water it lives in.
  float transmit=1.;
  float t0=0.,t1=min(dist,uReach*2.4);
  if(abs(ray.y)>1e-4){
    float a=(uMistTop*1.5-uCamera.y)/ray.y,b=(uMistBottom-uCamera.y)/ray.y;
    t0=max(t0,min(a,b));t1=min(t1,max(a,b));
  }else if(uCamera.y>uMistTop*1.5)t1=-1.;
  if(t1>t0){
    const int MIST=10;
    float dm=(t1-t0)/float(MIST);
    float m=t0+dm*jitter;
    vec3 lit=vec3(0.);
    float gather=0.;
    for(int i=0;i<MIST;i++){
      vec3 p=uCamera+ray*m;
      // The ceiling of the mist rolls, so it never reads as a level sheet.
      float swell=texture(tMist,vec3(p.xz/(560.*sqrt(uScale)),uTime*.004)).r;
      float h=clamp((p.y-uMistBottom)/(uMistTop*(.35+1.3*swell)-uMistBottom),0.,1.);
      vec3 q=p/(240.*sqrt(uScale));
      q.xz+=vec2(uTime*.012,-uTime*.008);
      float n=texture(tMist,q).r;
      float fine=texture(tMist,q*3.1+n*.3).r;
      // Mist pools at the pillar feet. Separate banks drift over open water,
      // and the dark sea stays visible in the gaps between them.
      float pool=texture2D(tMistMap,p.xz/8000.+.5).r;
      float bank=smoothstep(.4,.7,texture(tMist,vec3(p.xz/(1500.*sqrt(uScale)),.37)).r);
      float d=smoothstep(.5,.72,n*.72+fine*.36+(1.-h)*.2)*pow(max(1.-h,0.),1.3)*min(1.,pool+bank*.55);
      float density=d*uMistGain*dm;
      float step_=exp(-density);
      lit+=transmit*(1.-step_)*(.42+1.3*beams(p));
      transmit*=step_;
      m+=dm;
    }
    scatter+=uMist*lit;
  }
  gl_FragColor=vec4(scatter,transmit);
}`;

const blurFragment = `
precision highp float;
uniform sampler2D tSource, tDepth; uniform vec2 uStep; uniform vec4 uProject;
varying vec2 vUv;
float linear(float d){return uProject.x/(uProject.y-d);}
void main(){
  float center=linear(texture2D(tDepth,vUv).r);
  vec4 sum=texture2D(tSource,vUv)*.28;float total=.28;
  for(int i=1;i<=3;i++){
    float w=.24-.06*float(i);
    for(int s=-1;s<=1;s+=2){
      vec2 uv=vUv+uStep*float(i*s);
      float d=linear(texture2D(tDepth,uv).r);
      float k=w*exp(-abs(d-center)/(center*.06));
      sum+=texture2D(tSource,uv)*k;total+=k;
    }
  }
  gl_FragColor=sum/total;
}`;

const downFragment = `
precision highp float;
uniform sampler2D tSource; uniform vec2 uTexel; uniform float uThreshold;
varying vec2 vUv;
void main(){
  vec3 c=(texture2D(tSource,vUv+uTexel*vec2(-1,-1)).rgb+texture2D(tSource,vUv+uTexel*vec2(1,-1)).rgb+
          texture2D(tSource,vUv+uTexel*vec2(-1,1)).rgb+texture2D(tSource,vUv+uTexel*vec2(1,1)).rgb)*.25;
  if(uThreshold>0.){
    float l=max(c.r,max(c.g,c.b));
    c*=smoothstep(uThreshold,uThreshold*1.9,l);
    c=min(c,vec3(9.));
  }
  gl_FragColor=vec4(c,1.);
}`;

const upFragment = `
precision highp float;
uniform sampler2D tSource; uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec3 c=texture2D(tSource,vUv).rgb*4.;
  c+=(texture2D(tSource,vUv+uTexel*vec2(-1,0)).rgb+texture2D(tSource,vUv+uTexel*vec2(1,0)).rgb+
      texture2D(tSource,vUv+uTexel*vec2(0,-1)).rgb+texture2D(tSource,vUv+uTexel*vec2(0,1)).rgb)*2.;
  c+=texture2D(tSource,vUv+uTexel*vec2(-1,-1)).rgb+texture2D(tSource,vUv+uTexel*vec2(1,-1)).rgb+
     texture2D(tSource,vUv+uTexel*vec2(-1,1)).rgb+texture2D(tSource,vUv+uTexel*vec2(1,1)).rgb;
  gl_FragColor=vec4(c/16.,1.);
}`;

const compositeFragment = `
precision highp float;
uniform sampler2D tScene, tVolume, tBloom, tDepth;
uniform float uBloom, uExposure, uTime, uGrain;
uniform vec2 uResolution, uVolumeTexel;
uniform vec4 uProject;
varying vec2 vUv;
vec3 curve(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float grainAt(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
void main(){
  vec3 c=texture2D(tScene,vUv).rgb;
  // Joint bilateral upsample, so half-resolution mist keeps silhouettes crisp.
  float here=uProject.x/(uProject.y-texture2D(tDepth,vUv).r);
  vec4 v=vec4(0.);float total=0.;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    vec2 uv=vUv+uVolumeTexel*(vec2(float(x),float(y))-.5);
    float d=uProject.x/(uProject.y-texture2D(tDepth,uv).r);
    float k=exp(-abs(d-here)/(here*.02))+.002;
    v+=texture2D(tVolume,uv)*k;total+=k;
  }
  v/=total;
  // Kun's alpha lives in the scene target: sheets write no depth, so this keeps
  // him in front of the volume, and the water's alpha of zero leaves it untouched.
  float foreground=texture2D(tScene,vUv).a;
  c=c*mix(v.a,1.,foreground)+v.rgb*(1.-foreground*.82);
  c+=texture2D(tBloom,vUv).rgb*uBloom;
  c=curve(c*uExposure);
  c=mix(c,c*c*(3.-2.*c),.42);
  // Cool the shadows only, leaving Kun's paper whites alone.
  float l=dot(c,vec3(.2126,.7152,.0722));
  c=mix(c,c*vec3(.9,.985,1.03),(1.-smoothstep(.0,.42,l))*.7);
  vec2 q=vUv-.5;
  q.x*=mix(1.,uResolution.x/uResolution.y,.5);
  c*=1.-smoothstep(.34,.98,length(q))*.5;
  gl_FragColor=vec4(c,1.);
  #include <colorspace_fragment>
  // Grain and dither sit in display space. In linear light the sRGB curve multiplies
  // them about 13 times in the darks, most of all in the red channel.
  float g=grainAt(gl_FragCoord.xy+floor(uTime*12.)*vec2(37.,17.))-.5;
  gl_FragColor.rgb+=g*uGrain*(1.-l*.6)+(grainAt(gl_FragCoord.yx*1.7)-.5)/255.;
}`;

export function createPost(renderer, gobo, seedRandom) {
  const mist = createMistVolume(seedRandom);
  const depthTexture = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
  depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
  const hdr = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const sceneTarget = new THREE.WebGLRenderTarget(4, 4, { ...hdr, depthBuffer: true, samples: 4, depthTexture });
  const volumeA = new THREE.WebGLRenderTarget(4, 4, hdr), volumeB = new THREE.WebGLRenderTarget(4, 4, hdr);
  const LEVELS = 5;
  const down = Array.from({ length: LEVELS }, () => new THREE.WebGLRenderTarget(4, 4, hdr));
  const up = Array.from({ length: LEVELS - 1 }, () => new THREE.WebGLRenderTarget(4, 4, hdr));
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  quadScene.add(quad);
  const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const volume = pass(volumeFragment, {
    tDepth: { value: depthTexture }, tGobo: { value: gobo }, tMist: { value: mist }, tMistMap: { value: null },
    uInverse: { value: new THREE.Matrix4() }, uCamera: { value: new THREE.Vector3() }, uLight: { value: new THREE.Vector3(0, 1, 0) },
    uShaft: { value: new THREE.Color('#A9B4AC') }, uMist: { value: new THREE.Color('#71868E') }, uLayers: { value: new THREE.Vector3(1, 0, 0) }, uHero: { value: new THREE.Vector3(0, 0, 30) }, uVanish: { value: new THREE.Vector2(.7, 1.6) }, uAspect: { value: 1.6 },
    uTime: { value: 0 }, uSurface: { value: 640 }, uScale: { value: 1 }, uReach: { value: 300 },
    uShaftGain: { value: .46 }, uMistGain: { value: .012 }, uMistTop: { value: 120 }, uMistBottom: { value: -40 },
  });
  const blur = pass(blurFragment, { tSource: { value: null }, tDepth: { value: depthTexture }, uStep: { value: new THREE.Vector2() }, uProject: { value: new THREE.Vector4() } });
  const downPass = pass(downFragment, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 } });
  const upPass = pass(upFragment, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const composite = pass(compositeFragment, {
    tScene: { value: sceneTarget.texture }, tVolume: { value: volumeB.texture }, tBloom: { value: up[0].texture }, tDepth: { value: depthTexture },
    uBloom: { value: .34 }, uExposure: { value: .92 }, uTime: { value: 0 }, uGrain: { value: .006 }, uResolution: { value: new THREE.Vector2(1, 1) },
    uVolumeTexel: { value: new THREE.Vector2() }, uProject: { value: new THREE.Vector4() },
  });
  function draw(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCamera);
  }
  let width = 4, height = 4;
  const inverse = new THREE.Matrix4(), vanish = new THREE.Vector3();
  return {
    uniforms: volume.uniforms, grade: composite.uniforms, sceneTarget,
    setSize(w, h) {
      width = w; height = h;
      sceneTarget.setSize(w, h);
      const halfW = Math.max(2, w >> 1), halfH = Math.max(2, h >> 1);
      volumeA.setSize(halfW, halfH); volumeB.setSize(halfW, halfH);
      down.forEach((target, i) => target.setSize(Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1))));
      up.forEach((target, i) => target.setSize(Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1))));
      composite.uniforms.uResolution.value.set(w, h);
      composite.uniforms.uVolumeTexel.value.set(1 / halfW, 1 / halfH);
    },
    render(scene, camera, time) {
      renderer.setRenderTarget(sceneTarget);
      renderer.clear();
      renderer.render(scene, camera);
      inverse.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
      volume.uniforms.uInverse.value.copy(inverse);
      volume.uniforms.uCamera.value.copy(camera.position);
      vanish.copy(camera.position).addScaledVector(volume.uniforms.uLight.value, 1e4).project(camera);
      volume.uniforms.uVanish.value.set(vanish.x * .5 + .5, vanish.y * .5 + .5);
      volume.uniforms.uAspect.value = width / height;
      volume.uniforms.uTime.value = time;
      draw(volume, volumeA);
      const near = camera.near, far = camera.far;
      blur.uniforms.uProject.value.set(near * far / (far - near), far / (far - near), 0, 0);
      composite.uniforms.uProject.value.copy(blur.uniforms.uProject.value);
      blur.uniforms.tSource.value = volumeA.texture;
      blur.uniforms.uStep.value.set(1 / volumeA.width, 0);
      draw(blur, volumeB);
      blur.uniforms.tSource.value = volumeB.texture;
      blur.uniforms.uStep.value.set(0, 1 / volumeA.height);
      draw(blur, volumeA);
      composite.uniforms.tVolume.value = volumeA.texture;
      let source = sceneTarget.texture;
      for (let i = 0; i < LEVELS; i++) {
        downPass.uniforms.tSource.value = source;
        downPass.uniforms.uTexel.value.set(.5 / down[i].width, .5 / down[i].height);
        downPass.uniforms.uThreshold.value = i === 0 ? 1.05 : 0;
        draw(downPass, down[i]);
        source = down[i].texture;
      }
      for (let i = LEVELS - 2; i >= 0; i--) {
        const from = i === LEVELS - 2 ? down[LEVELS - 1] : up[i + 1];
        upPass.uniforms.tSource.value = from.texture;
        upPass.uniforms.uTexel.value.set(1 / from.width, 1 / from.height);
        draw(upPass, up[i]);
      }
      composite.uniforms.uTime.value = time;
      draw(composite, null);
    },
    dispose() {
      for (const target of [sceneTarget, volumeA, volumeB, ...down, ...up]) target.dispose();
      for (const material of [volume, blur, downPass, upPass, composite]) material.dispose();
      depthTexture.dispose(); mist.dispose(); quad.geometry.dispose();
    },
  };
}
