import * as THREE from 'three';

// HDR scene -> half-resolution volumetric light and mist -> bloom -> filmic grade.
// Every pass is counted in renderer.info, so the draw-call gate sees all of it.

const RAY_COUNT = 17;
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
uniform vec4 uRays[RAYS];
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
  // Held close above the frame, so the rays always fan out as they do in the key art.
  vec2 fromSun=(vUv-vec2(uVanish.x,min(uVanish.y,1.3)))*vec2(uAspect,1.);
  float angle=atan(fromSun.x,-fromSun.y);
  // Each ray is its own soft wedge with its own reach, so none ends at the same place and
  // the fan never reads as even stripes.
  float below=max(1.-vUv.y-.02,0.);
  float rays=0.;
  for(int i=0;i<RAYS;i++){
    vec4 r=uRays[i];
    float across=(angle-r.x)/r.y, along=below/r.z;
    rays+=r.w*exp(-across*across)*exp(-along*along);
  }
  float strands=texture2D(tGobo,vec2(angle*5.1+uTime*.004,.13)).a;
  float broken=.4+1.2*texture2D(tGobo,vec2(angle*2.3,below*.9+uTime*.002)).b;
  // Light gathers around one opening in the surface.
  vec2 source=(vUv-clamp(uVanish,vec2(.08,0.),vec2(.92,1.06)))*vec2(uAspect,1.);
  // Soft-limited: strong columns stay light in water and never become a solid wall.
  float light=shafts*(reach/uReach)*phase*uShaftGain*22.*(.03+7.*rays*broken*(.72+.28*strands))*smoothstep(-.1,.3,vUv.y);
  vec3 scatter=uShaft*.6*(1.-exp(-light*1.7));
  // One shared bright region near the surface, which the rays visibly leave.
  scatter+=uShaft*exp(-dot(source,source)*3.)*.13;
  // A soft band of far water covers the line where the seabed meets the dome.
  scatter+=uMist*.05*exp(-pow(ray.y/.085,2.))*smoothstep(0.,1.,dist/(900.*sqrt(uScale)));
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

// Painted mist on camera-facing cards, faded where they meet stone. Half resolution, unblurred,
// so the torn edges and spray of the sprite sheet survive.
const cardVertex = `
attribute vec4 aCenter;
attribute vec4 aCard;
uniform float uTime,uScale,uDensity,uSurface;
uniform vec3 uLight,uCamera;
uniform sampler2D tGobo;
varying vec2 vUv;
varying float vFade,vLight,vDepth,vSoft;
void main(){
  float width=aCenter.w*pow(uScale,.34);
  float height=width*.6/pow(uScale,.12);
  vec3 center=aCenter.xyz+vec3(sin(uTime*.03+aCard.y*40.),0.,cos(uTime*.024+aCard.y*31.))*width*.06;
  // Always in front of the foot it belongs to, seen from wherever the camera is.
  center.xz+=normalize(uCamera.xz-center.xz+1e-3)*aCard.w;
  vec4 view=viewMatrix*vec4(center,1.);
  vec3 up=(viewMatrix*vec4(0.,1.,0.,0.)).xyz;
  vec2 corner=position.xy;
  view.xyz+=vec3(corner.x*width,0.,0.)+up*(corner.y+.5)*height;
  float depth=-view.z, dist=length(view.xyz);
  vDepth=depth;
  vSoft=30.+22.*sqrt(uScale);
  // Close to the camera a card opens out and disappears, so the view never enters a sheet.
  float near=smoothstep(90.*sqrt(uScale),300.*sqrt(uScale),dist);
  vFade=near*exp(-pow(dist*uDensity*.6,2.))*(.82+.18*sin(uTime*.11+aCard.y*17.));
  vec2 q=center.xz+uLight.xz*(uSurface-center.y)/uLight.y;
  vLight=.34+1.3*texture2D(tGobo,q/(900.*sqrt(uScale))).r;
  float cell=aCard.x;
  vec2 uv=vec2(corner.x*aCard.z+.5,corner.y+.5);
  vUv=(vec2(mod(cell,3.),2.-floor(cell/3.))+uv*.96+.02)/3.;
  gl_Position=projectionMatrix*view;
}`;

const cardFragment = `
precision highp float;
uniform sampler2D tSheet,tDepth;
uniform vec4 uProject;
uniform vec2 uViewport;
uniform vec3 uMist;
uniform float uGain;
varying vec2 vUv;
varying float vFade,vLight,vDepth,vSoft;
void main(){
  float m=texture2D(tSheet,vUv).r;
  float scene=uProject.x/(uProject.y-texture2D(tDepth,gl_FragCoord.xy/uViewport).r);
  float a=m*vFade*clamp((scene-vDepth)/vSoft,0.,1.)*uGain;
  gl_FragColor=vec4(uMist*vLight*a,a);
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
  vec4 mean=(texture2D(tSource,vUv+uTexel*vec2(-1,-1))+texture2D(tSource,vUv+uTexel*vec2(1,-1))+
             texture2D(tSource,vUv+uTexel*vec2(-1,1))+texture2D(tSource,vUv+uTexel*vec2(1,1)))*.25;
  vec3 c=mean.rgb;
  if(uThreshold>0.){
    float l=max(c.r,max(c.g,c.b));
    c*=smoothstep(uThreshold,uThreshold*1.9,l);
    c=min(c,vec3(9.));
  }
  gl_FragColor=vec4(c,uThreshold>0.?1.:mean.a);
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

const mergeFragment = `
precision highp float;
uniform sampler2D tScene, tVolume, tDepth, tCards;
uniform vec2 uResolution, uVolumeTexel;
uniform vec4 uProject;
uniform float uRim;
varying vec2 vUv;
float coverAt(vec2 uv){return smoothstep(.02,.14,texture2D(tScene,uv).a);}
void main(){
  vec4 scene=texture2D(tScene,vUv);
  vec3 c=scene.rgb;
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
  float foreground=max(scene.a,0.);
  c=c*mix(v.a,1.,foreground)+v.rgb*(1.-foreground*.82);
  vec4 card=texture2D(tCards,vUv)*(1.-foreground);
  c=c*(1.-card.a)+card.rgb;
  // The cream rim is measured from coverage, not from normals. Fin sheets are flat, so a
  // fresnel term never reaches their edges, and ink inside a fin must not trigger it.
  float mask=coverAt(vUv);
  if(mask>.01){
    float around=0.;
    vec2 unit=uResolution.y/900./uResolution*2.6;
    for(int i=0;i<8;i++){
      float a=float(i)*.7854;
      vec2 d=vec2(cos(a),sin(a))*unit;
      around+=coverAt(vUv+d)*.62+coverAt(vUv+d*2.3)*.38;
    }
    // A wide soft falloff, stronger on edges that face the light. Never an even line.
    float rim=pow(mask*(1.-around/8.),1.5)*(.5+.5*(1.-coverAt(vUv+vec2(0.,unit.y*2.))));
    c+=vec3(.97,.92,.8)*rim*uRim;
  }
  gl_FragColor=vec4(c,scene.a);
}`;

const gradeFragment = `
precision highp float;
uniform sampler2D tMerged, tBloom, tSoft;
uniform float uBloom, uExposure, uTime, uGrain, uBlack;
uniform vec2 uResolution, uSoftTexel;
varying vec2 vUv;
vec3 curve(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float grainAt(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
void main(){
  vec4 merged=texture2D(tMerged,vUv);
  // Stone's feet melt into a wide blur of the finished image. The mask is blurred too, so
  // the melt crosses the outline and leaves no edge against the mist behind. It runs after
  // the mist, because the mist itself changes sharply at a pillar's outline.
  vec4 soft=(texture2D(tSoft,vUv+uSoftTexel*vec2(-.5,-.5))+texture2D(tSoft,vUv+uSoftTexel*vec2(.5,-.5))+
             texture2D(tSoft,vUv+uSoftTexel*vec2(-.5,.5))+texture2D(tSoft,vUv+uSoftTexel*vec2(.5,.5)))*.25;
  float melt=smoothstep(.06,.62,-soft.a-max(merged.a,0.)*4.)*.92;
  vec3 c=mix(merged.rgb,soft.rgb,melt);
  c+=texture2D(tBloom,vUv).rgb*uBloom;
  c=curve(max(c*uExposure-uBlack,0.));
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
  const cardTarget = new THREE.WebGLRenderTarget(4, 4, hdr);
  const mergedTarget = new THREE.WebGLRenderTarget(4, 4, hdr);
  const soft = Array.from({ length: 4 }, () => new THREE.WebGLRenderTarget(4, 4, hdr));
  const LEVELS = 5;
  const down = Array.from({ length: LEVELS }, () => new THREE.WebGLRenderTarget(4, 4, hdr));
  const up = Array.from({ length: LEVELS - 1 }, () => new THREE.WebGLRenderTarget(4, 4, hdr));
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  quadScene.add(quad);
  const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  // The table of rays: angle from straight down, half-width, reach in frame heights, strength.
  const rayRandom = seedRandom;
  const RAY_SET = Array.from({ length: RAY_COUNT }, (_, i) => {
    const place = (i + .5) / RAY_COUNT, thick = rayRandom() < .3, long = rayRandom();
    // Most rays die early; only a couple reach far, and those are the fainter ones.
    return { angle: (place - .5) * .78 + (rayRandom() - .5) * .07, width: thick ? .05 + rayRandom() * .05 : .016 + rayRandom() * .02,
      reach: .16 + long * long * .62, gain: (thick ? .42 : .55 + rayRandom() * .6) * (1 - .55 * long) * (1 - Math.pow(Math.abs(place - .56) * 1.9, 2)) };
  });
  const volume = pass(volumeFragment.replaceAll('RAYS', String(RAY_COUNT)), {
    tDepth: { value: depthTexture }, tGobo: { value: gobo }, tMist: { value: mist }, tMistMap: { value: null },
    uInverse: { value: new THREE.Matrix4() }, uCamera: { value: new THREE.Vector3() }, uLight: { value: new THREE.Vector3(0, 1, 0) },
    uShaft: { value: new THREE.Color('#A9B4AC') }, uMist: { value: new THREE.Color('#71868E') }, uLayers: { value: new THREE.Vector3(1, 0, 0) }, uHero: { value: new THREE.Vector3(0, 0, 30) }, uVanish: { value: new THREE.Vector2(.7, 1.6) }, uAspect: { value: 1.6 },
    uRays: { value: RAY_SET.map(() => new THREE.Vector4()) },
    uTime: { value: 0 }, uSurface: { value: 640 }, uScale: { value: 1 }, uReach: { value: 300 },
    uShaftGain: { value: .46 }, uMistGain: { value: .012 }, uMistTop: { value: 120 }, uMistBottom: { value: -40 },
  });
  const blur = pass(blurFragment, { tSource: { value: null }, tDepth: { value: depthTexture }, uStep: { value: new THREE.Vector2() }, uProject: { value: new THREE.Vector4() } });
  const downPass = pass(downFragment, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 } });
  const upPass = pass(upFragment, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const merge = pass(mergeFragment, {
    tScene: { value: sceneTarget.texture }, tVolume: { value: volumeB.texture }, tDepth: { value: depthTexture }, tCards: { value: cardTarget.texture },
    uResolution: { value: new THREE.Vector2(1, 1) }, uVolumeTexel: { value: new THREE.Vector2() }, uProject: { value: new THREE.Vector4() }, uRim: { value: .95 },
  });
  const grade = pass(gradeFragment, {
    tMerged: { value: mergedTarget.texture }, tBloom: { value: up[0].texture }, tSoft: { value: soft[3].texture }, uSoftTexel: { value: new THREE.Vector2() },
    uBloom: { value: .34 }, uExposure: { value: .92 }, uBlack: { value: .004 }, uTime: { value: 0 }, uGrain: { value: .006 }, uResolution: { value: new THREE.Vector2(1, 1) },
  });
  function draw(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCamera);
  }
  let width = 4, height = 4;
  const inverse = new THREE.Matrix4(), vanish = new THREE.Vector3();
  const cardScene = new THREE.Scene();
  const cardUniforms = {
    tSheet: { value: null }, tDepth: { value: depthTexture }, tGobo: { value: gobo }, uProject: { value: new THREE.Vector4() }, uViewport: { value: new THREE.Vector2(1, 1) },
    uMist: { value: new THREE.Color('#71868E') }, uGain: { value: .62 }, uTime: { value: 0 }, uScale: { value: 1 }, uDensity: { value: .001 }, uSurface: { value: 640 }, uLight: { value: new THREE.Vector3(0, 1, 0) }, uCamera: { value: new THREE.Vector3() },
  };
  return {
    uniforms: volume.uniforms, grade: grade.uniforms, sceneTarget, cards: cardUniforms,
    setCards(items, sheet) {
      sheet.colorSpace = THREE.NoColorSpace;
      sheet.minFilter = THREE.LinearMipmapLinearFilter;
      cardUniforms.tSheet.value = sheet;
      const quad = new THREE.PlaneGeometry(1, 1);
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.index = quad.index;
      geometry.setAttribute('position', quad.attributes.position);
      const center = new Float32Array(items.length * 4), card = new Float32Array(items.length * 4);
      items.forEach((item, i) => {
        center.set([item.x, item.y, item.z, item.width], i * 4);
        card.set([item.cell, item.seed, item.flip, item.front], i * 4);
      });
      geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(center, 4));
      geometry.setAttribute('aCard', new THREE.InstancedBufferAttribute(card, 4));
      geometry.instanceCount = items.length;
      const material = new THREE.ShaderMaterial({ vertexShader: cardVertex, fragmentShader: cardFragment, uniforms: cardUniforms,
        transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      cardScene.add(mesh);
    },
    setSize(w, h) {
      width = w; height = h;
      sceneTarget.setSize(w, h);
      const halfW = Math.max(2, w >> 1), halfH = Math.max(2, h >> 1);
      volumeA.setSize(halfW, halfH); volumeB.setSize(halfW, halfH); cardTarget.setSize(halfW, halfH);
      cardUniforms.uViewport.value.set(halfW, halfH);
      down.forEach((target, i) => target.setSize(Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1))));
      up.forEach((target, i) => target.setSize(Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1))));
      soft.forEach((target, i) => target.setSize(Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1))));
      grade.uniforms.uSoftTexel.value.set(1 / soft[3].width, 1 / soft[3].height);
      mergedTarget.setSize(w, h);
      merge.uniforms.uResolution.value.set(w, h);
      grade.uniforms.uResolution.value.set(w, h);
      merge.uniforms.uVolumeTexel.value.set(1 / halfW, 1 / halfH);
    },
    render(scene, camera, time, withCards = true) {
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
      // Rays drift, and slide round as the camera turns, wrapping at the ends of the fan.
      const pan = Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10]) * .3;
      RAY_SET.forEach((ray, i) => {
        const place = ((ray.angle + pan + Math.sin(time * .04 + i * 2.1) * .012) / .84 + .5 + 100) % 1;
        volume.uniforms.uRays.value[i].set((place - .5) * .84, ray.width, ray.reach, ray.gain * Math.sin(place * Math.PI));
      });
      draw(volume, volumeA);
      const near = camera.near, far = camera.far;
      blur.uniforms.uProject.value.set(near * far / (far - near), far / (far - near), 0, 0);
      merge.uniforms.uProject.value.copy(blur.uniforms.uProject.value);
      blur.uniforms.tSource.value = volumeA.texture;
      blur.uniforms.uStep.value.set(1 / volumeA.width, 0);
      draw(blur, volumeB);
      blur.uniforms.tSource.value = volumeB.texture;
      blur.uniforms.uStep.value.set(0, 1 / volumeA.height);
      draw(blur, volumeA);
      merge.uniforms.tVolume.value = volumeA.texture;
      cardUniforms.uProject.value.copy(blur.uniforms.uProject.value);
      cardUniforms.uTime.value = time;
      cardUniforms.uCamera.value.copy(camera.position);
      renderer.setRenderTarget(cardTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      if (withCards) renderer.render(cardScene, camera);
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
      draw(merge, mergedTarget);
      let wide = mergedTarget.texture;
      downPass.uniforms.uThreshold.value = 0;
      for (const target of soft) {
        downPass.uniforms.tSource.value = wide;
        downPass.uniforms.uTexel.value.set(.5 / target.width, .5 / target.height);
        draw(downPass, target);
        wide = target.texture;
      }
      grade.uniforms.uTime.value = time;
      draw(grade, null);
    },
    dispose() {
      for (const target of [sceneTarget, mergedTarget, volumeA, volumeB, cardTarget, ...down, ...up, ...soft]) target.dispose();
      for (const material of [volume, blur, downPass, upPass, merge, grade]) material.dispose();
      depthTexture.dispose(); mist.dispose(); quad.geometry.dispose();
    },
  };
}
