import"./BXVCrNr1.js";import{A as e,C as t,D as n,E as r,F as i,I as a,L as o,M as s,N as c,O as l,P as u,R as d,S as f,T as p,_ as m,a as h,b as g,c as _,d as v,f as y,g as b,h as x,i as S,j as C,k as w,l as T,m as E,n as D,o as O,p as k,r as A,s as j,t as M,u as N,v as P,w as F,x as I}from"./three.CPnJMia8.js";import{n as ee}from"./C6h_i1sO.js";import{i as L,n as te,o as ne,r as R,t as z}from"./DikQJ68l.js";var re=globalThis.setInterval,B=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,ie=`
float postLum(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
float postHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`,ae=`
#ifndef KIND
#define KIND 1
#endif
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uMix;
uniform float uAspect;
uniform float uPxScale;
uniform vec2 uRes;
uniform vec4 uP;
uniform vec4 uQ;
uniform vec4 uK;
uniform vec4 uFocus;
varying vec2 vUv;
${ie}
void main() {
  vec2 uv = vUv;
  float t = clamp(uMix, 0.0, 1.0);
  vec3 col;
#if KIND == 1
  col = mix(texture2D(tA, uv).rgb, texture2D(tB, uv).rgb, t);
#elif KIND == 2
  float dir = uP.x < 0.0 ? -1.0 : 1.0;
  float s = clamp(uP.y, 0.0, 0.25) * t;
  // zoom 1 / (1 - 2s) about the centre exactly covers the shift: A is never sampled off its edges
  float z = 1.0 - 2.0 * s;
  vec2 ua = vec2(0.5 + (uv.x - 0.5) * z, 0.5 + (uv.y - 0.5) * z - dir * s);
  float feather = max(uP.z, 0.001);
  float y = dir > 0.0 ? uv.y : 1.0 - uv.y;
  float e = -0.5 * feather + t * (1.0 + feather);
  float wb = 1.0 - smoothstep(e - 0.5 * feather, e + 0.5 * feather, y);
  col = mix(texture2D(tA, ua).rgb, texture2D(tB, uv).rgb, wb);
#elif KIND == 3
  vec3 b = texture2D(tB, uv).rgb;
  vec2 r = vec2(uP.y / max(uAspect, 0.001), uP.y);
  float ln = 0.25 * (postLum(texture2D(tB, uv + r).rgb) + postLum(texture2D(tB, uv - r).rgb)
           + postLum(texture2D(tB, uv + vec2(r.x, -r.y)).rgb) + postLum(texture2D(tB, uv + vec2(-r.x, r.y)).rgb));
  float key = max(max(postLum(b), 0.7 * ln), 0.0);
  float lk = clamp((log2(key + 0.00001) - uP.z) / max(uP.w - uP.z, 0.001), 0.0, 1.0);
  float soft = max(uP.x, 0.001);
  float u = t * (1.0 + 2.0 * soft) - soft;
  float th = 1.0 - lk;
  // lamps snap on (a third of the softness), darks ease in; never outside the sweep, so t 0 is A and t 1 is B
  float sp = soft * mix(1.0, 0.35, lk);
  float wb = smoothstep(th - sp, th + sp, u);
  col = mix(texture2D(tA, uv).rgb, b, wb);
#elif KIND == 4
  vec3 a = texture2D(tA, uv).rgb;
  vec3 b = texture2D(tB, uv).rgb;
  // how far out from the instrument: 0 on it, 1 at the farthest corner (stretched across)
  vec2 dv = (uv - uFocus.xy) * vec2(uAspect * uK.x, 1.0);
  float rho = max(length(dv) - uFocus.z, 0.0) / max(uFocus.w - uFocus.z, 0.001);
  // the room's brightness round this pixel (a small neighbourhood, so a lone city light or
  // a hairline does not linger as a speck), as 0 (dark) .. 1 (bright) on a log scale
  vec2 r = vec2(uK.y / max(uAspect, 0.001), uK.y);
  float la = 0.4 * postLum(a) + 0.15 * (postLum(texture2D(tA, uv + r).rgb) + postLum(texture2D(tA, uv - r).rgb)
           + postLum(texture2D(tA, uv + vec2(r.x, -r.y)).rgb) + postLum(texture2D(tA, uv + vec2(-r.x, r.y)).rgb));
  float key = clamp((log2(max(la, 0.0) + 0.00001) - uQ.z) / max(uQ.w - uQ.z, 0.001), 0.0, 1.0);
  // the iris: its radius closes from beyond the farthest corner to past the instrument's
  // brightest pixel by uP.w; bright pixels sit nearer the centre by the lead, so they go last
  float f = max(uP.x, 0.001);
  float R = mix(1.0 + f, -f - uP.y, clamp(t / max(uP.w, 0.001), 0.0, 1.0));
  float rr = rho - uP.y * key;
  float wa = 1.0 - smoothstep(R - f, R + f, rr);
  // space: behind the room's dark by the lag (black first, then stars); none where the room
  // is bright or on the instrument, which hand straight over; and only from uQ.x on
  float lag = uP.z * (1.0 - key) * smoothstep(0.0, 0.25, rho);
  float wb = smoothstep(R + lag - f, R + lag + f, rr) * smoothstep(uQ.x, uQ.y, t);
  col = a * wa + b * wb;
#else
  col = texture2D(tA, uv).rgb;
#endif
  gl_FragColor = vec4(col, 1.0);
}
`,V=`
uniform sampler2D tSrc;
uniform vec2 uSrcTexel;
uniform float uBlock;
uniform float uThresh;
varying vec2 vUv;
vec3 brightTap(vec2 uv) {
  return clamp(texture2D(tSrc, uv).rgb, 0.0, 24.0);
}
void main() {
  vec2 o = 0.25 * uBlock * uSrcTexel;
  vec3 c = 0.25 * (brightTap(vUv - o) + brightTap(vUv + o) + brightTap(vUv + vec2(o.x, -o.y)) + brightTap(vUv + vec2(-o.x, o.y)));
  float m = max(c.r, max(c.g, c.b));
  float w = smoothstep(uThresh, uThresh * 1.6 + 0.25, m);
  gl_FragColor = vec4(c * w, 1.0);
}
`,H=`
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0);
}
`,oe=`
uniform sampler2D tSrc;
uniform vec2 uStep;
uniform float uW[5];
uniform float uO[5];
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * uW[0];
  for (int i = 1; i < 5; i++) {
    c += texture2D(tSrc, vUv + uStep * uO[i]).rgb * uW[i];
    c += texture2D(tSrc, vUv - uStep * uO[i]).rgb * uW[i];
  }
  gl_FragColor = vec4(c, 1.0);
}
`,se=`
#ifndef GLOW_LEVELS
#define GLOW_LEVELS 3
#endif
#define QUIET_N 12
uniform sampler2D tSrc;
uniform sampler2D tGlow1;
uniform sampler2D tGlow2;
uniform sampler2D tGlow3;
uniform vec3 uGlow;
uniform float uHasSrc;
uniform float uFetch;
uniform vec3 uBg;
uniform float uKnee;
uniform float uWhite;
uniform vec3 uVeil;
uniform float uGrain;
uniform float uVignette;
uniform float uDither;
uniform vec2 uRes;
uniform vec2 uGrainSeed;
uniform vec4 uQuiet[QUIET_N];
uniform int uQuietN;
uniform float uQuietSoft;
uniform float uQuietK;
uniform float uQuietDesat;
uniform vec2 uQuietLum;
varying vec2 vUv;
${ie}
vec3 postEncodeSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
// 1 inside a text rectangle (device px, y up), easing to 0 over uQuietSoft outside it
float quietAt(vec2 p) {
  float q = 0.0;
  for (int i = 0; i < QUIET_N; i++) {
    if (i >= uQuietN) break;
    vec4 r = uQuiet[i];
    if (r.z <= r.x || r.w <= r.y) continue;
    vec2 d = max(max(r.xy - p, p - r.zw), vec2(0.0));
    q = max(q, 1.0 - smoothstep(0.0, uQuietSoft, length(d)));
  }
  return q;
}
void main() {
  vec3 col = uBg;
  if (uHasSrc > 0.5) col = uFetch > 0.5 ? texelFetch(tSrc, ivec2(gl_FragCoord.xy), 0).rgb : texture2D(tSrc, vUv).rgb;
  col = clamp(col, 0.0, 65000.0);
#if GLOW_LEVELS >= 1
  col += texture2D(tGlow1, vUv).rgb * uGlow.x;
#endif
#if GLOW_LEVELS >= 2
  col += texture2D(tGlow2, vUv).rgb * uGlow.y;
#endif
#if GLOW_LEVELS >= 3
  col += texture2D(tGlow3, vUv).rgb * uGlow.z;
#endif
  float q = quietAt(gl_FragCoord.xy);
  if (q > 0.0) {
    float l = postLum(col);
    float k = q * smoothstep(uQuietLum.x, uQuietLum.y, l);
    col = mix(col, vec3(l), uQuietDesat * k) * (1.0 - uQuietK * k);
  }
  col += uVeil;
  // path to white: channels above 1 drift toward white (a hot core inside a coloured glow)
  float m = max(col.r, max(col.g, col.b));
  if (m > 1.0) col = mix(col, vec3(m), 1.0 - exp(-(m - 1.0) * uWhite));
  // shoulder on the brightest channel (hue kept): identity below uKnee, asymptote 1
  m = max(col.r, max(col.g, col.b));
  if (m > uKnee) {
    float kw = max(1.0 - uKnee, 0.0001);
    float r = uKnee + kw * (1.0 - exp(-(m - uKnee) / kw));
    col *= r / m;
  }
  vec3 o = postEncodeSrgb(col);
  // vignette: 0 at the centre, 1 in the corners
  float asp = uRes.x / max(uRes.y, 1.0);
  vec2 qv = (vUv - 0.5) * vec2(asp, 1.0);
  float rv = length(qv) / length(vec2(0.5 * asp, 0.5));
  o *= 1.0 - uVignette * smoothstep(0.4, 1.05, rv);
  // grain: triangular, zero mean, strongest in the shadows, faded out at black so clipping cannot lift it
  float lo = postLum(o);
  float mn = min(o.r, min(o.g, o.b));
  vec2 fc = gl_FragCoord.xy;
  float g = postHash12(fc + uGrainSeed) + postHash12(fc + uGrainSeed + 19.7) - 1.0;
  o += g * uGrain * (1.0 - smoothstep(0.06, 0.6, lo)) * smoothstep(0.0, 2.0 * uGrain + 0.0001, mn);
  // dither against 8-bit banding (uDither in 8-bit steps, triangular)
  float dn = postHash12(fc * 1.37 + 71.3) + postHash12(fc * 1.37 + 5.1) - 1.0;
  o += dn * (uDither / 255.0);
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), 1.0);
}
`,ce=Object.freeze({VERT:B,COMPOSE_FRAG:ae,BRIGHT_FRAG:V,COPY_FRAG:H,BLUR_FRAG:oe,FINISH_FRAG:se}),le=Object.freeze({copy:0,fade:1,lift:2,reveal:3,dissolve:4});function ue(e){let t=[];for(let n=0;n<=8;n++)t.push(Math.exp(-(n*n)/(2*e*e)));let n=[t[0]],r=[0];for(let e=0;e<4;e++){let i=t[2*e+1],a=t[2*e+2];n.push(i+a),r.push((i*(2*e+1)+a*(2*e+2))/(i+a))}let i=n[0]+2*(n[1]+n[2]+n[3]+n[4]);return{W:n.map(e=>e/i),O:r}}var de=.75,fe=Object.freeze([Object.freeze({tier:0,name:`low`,dprCap:1,maxPixels:13e5,msaa:0,msaaLargeFrame:0,sky:0,reflection:Object.freeze({enabled:!1,scale:0,seaScale:0}),glow:Object.freeze({levels:1}),maxTextureSize:2048}),Object.freeze({tier:1,name:`medium`,dprCap:1.5,maxPixels:24e5,msaa:2,msaaLargeFrame:2,sky:1,reflection:Object.freeze({enabled:!0,scale:.5,seaScale:.3}),glow:Object.freeze({levels:2}),maxTextureSize:2048}),Object.freeze({tier:2,name:`high`,dprCap:2,maxPixels:52e5,msaa:4,msaaLargeFrame:2,sky:2,reflection:Object.freeze({enabled:!0,scale:.5,seaScale:.35}),glow:Object.freeze({levels:3}),maxTextureSize:4096}),Object.freeze({tier:3,name:`high`,dprCap:2,maxPixels:9e6,msaa:4,msaaLargeFrame:4,sky:3,reflection:Object.freeze({enabled:!0,scale:.75,seaScale:.5}),glow:Object.freeze({levels:3}),maxTextureSize:4096})]),pe=fe.length-1,me=Object.freeze({low:0,medium:1,high:2});function he(e,t=2){let n=Math.round(Number(e));return Number.isFinite(n)?Math.min(pe,Math.max(0,n)):t}function ge(e){return fe[he(e)]}function _e(e){if(e===`auto`)return null;if(!Object.prototype.hasOwnProperty.call(me,e))throw TypeError(`tierForQuality: unknown quality "${e}"`);return me[e]}function ve(e,t,n,r){let i=ge(e),a=Number.isFinite(r)&&r>0?r:1,o=Math.max(1,t)*Math.max(1,n),s=Math.sqrt(i.maxPixels/o);return Math.max(Math.min(de,a),Math.min(a,i.dprCap,s))}function ye(e,t,n=1/0){let r=ge(e),i=t>42e5?r.msaaLargeFrame:r.msaa,a=Number.isFinite(n)&&n>=0?n:1/0;return i>a?a>=4?4:a>=2?2:0:i}var be=Object.freeze([`cut`,`fade`,`lift`,`reveal`,`dissolve`]),xe=Object.freeze({lift:Object.freeze({dir:1,travel:.08,feather:.4}),reveal:Object.freeze({soft:.15,spread:.03,lo:.002,hi:1.5}),dissolve:Object.freeze({focus:Object.freeze([0,0]),focusR:0,feather:.2,lead:.4,lag:.25,close:.9,rise:Object.freeze([.4,.84]),lum:Object.freeze([.004,.12]),stretch:.8,taps:.005})}),Se=Object.freeze({glow:Object.freeze({strength:1,threshold:.85,weights:Object.freeze([.3,.24,.18])}),rolloff:Object.freeze({knee:1,white:.35}),quiet:Object.freeze({strength:.62,desaturate:.3,feather:36,pad:6,lum:Object.freeze([.045,.2])}),vignette:.2,grain:.018,dither:.5,veil:Object.freeze([0,0,0]),background:`#100f15`}),Ce=[2,3,3.5].map(e=>ue(e));function we(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function Te(e){if(Array.isArray(e)&&e.length>=3)return[U(e[0],0),U(e[1],0),U(e[2],0)];if(typeof e==`string`&&/^#?[0-9a-f]{6}$/i.test(e)){let t=parseInt(e.replace(`#`,``),16);return[we((t>>16&255)/255),we((t>>8&255)/255),we((t&255)/255)]}throw TypeError(`post: colour must be "#rrggbb" or [r, g, b], got ${JSON.stringify(e)}`)}function U(e,t){return typeof e==`number`&&Number.isFinite(e)?e:t}var Ee=(e,t,n)=>Math.min(n,Math.max(t,e));function De(e,t={}){if(!e||typeof e.render!=`function`)throw TypeError(`createPost: a THREE.WebGLRenderer is required`);let n=he(t.tier??2),r=Te(t.background??Se.background),l=U(e.capabilities&&e.capabilities.maxSamples,4),p=new j;p.setAttribute(`position`,new x([-1,-1,0,3,-1,0,-1,3,0],3));let h=new _,g=new f(p);g.frustumCulled=!1;let b=new C;b.add(g);let S=new v(new Uint8Array([0,0,0,255]),1,1);S.needsUpdate=!0;let T=(e,t,n,r={})=>new s({name:e,vertexShader:ce.VERT,fragmentShader:t,uniforms:n,defines:r,depthTest:!1,depthWrite:!1,blending:0,toneMapped:!1}),D={tA:{value:S},tB:{value:S},uMix:{value:0},uAspect:{value:1},uPxScale:{value:1},uRes:{value:new i(1,1)},uP:{value:new o},uQ:{value:new o},uK:{value:new o},uFocus:{value:new o}},O={};for(let[e,t]of Object.entries(le))O[e]=T(`post-compose-${e}`,ce.COMPOSE_FRAG,D,{KIND:t});let A={tSrc:{value:S},uSrcTexel:{value:new i(1,1)},uBlock:{value:2},uThresh:{value:Se.glow.threshold}},M=T(`post-bright`,ce.BRIGHT_FRAG,A),N={tSrc:{value:S}},F=T(`post-copy`,ce.COPY_FRAG,N),I={tSrc:{value:S},uStep:{value:new i},uW:{value:[1,0,0,0,0]},uO:{value:[0,1,2,3,4]}},ee=T(`post-blur`,ce.BLUR_FRAG,I),L={tSrc:{value:S},tGlow1:{value:S},tGlow2:{value:S},tGlow3:{value:S},uGlow:{value:new a},uHasSrc:{value:0},uFetch:{value:0},uBg:{value:new a().fromArray(r)},uKnee:{value:1},uWhite:{value:Se.rolloff.white},uVeil:{value:new a},uGrain:{value:Se.grain},uVignette:{value:Se.vignette},uDither:{value:Se.dither},uRes:{value:new i(1,1)},uGrainSeed:{value:new i},uQuiet:{value:Array.from({length:12},()=>new o)},uQuietN:{value:0},uQuietSoft:{value:24},uQuietK:{value:Se.quiet.strength},uQuietDesat:{value:Se.quiet.desaturate},uQuietLum:{value:new i().fromArray(Se.quiet.lum)}},te=T(`post-finish`,ce.FINISH_FRAG,L,{GLOW_LEVELS:ge(n).glow.levels}),ne=e=>{let t=new d(1,1,{type:m,format:w,minFilter:P,magFilter:P,generateMipmaps:!1,depthBuffer:!1,stencilBuffer:!1});return t.texture.name=e,t},R=ne(`post:composed`),z=[0,1,2].map(e=>[ne(`post:glow${e+1}`),ne(`post:glow${e+1}-tmp`)]),re=new Map,B=[1,1],ie=[1,1],ae=1,V=!1,H=null,oe=0,se={compose:`none`,passes:0,glowLevels:0},ue=new i,de=new i,fe=new o;function pe(t,n){g.material=t,e.setRenderTarget(n),e.render(b,h),oe++}function me(e,t){N.tSrc.value=e.texture,pe(F,t)}function _e(e,t,n){I.uW.value=n.W,I.uO.value=n.O,I.tSrc.value=e.texture,I.uStep.value.set(1/e.width,0),pe(ee,t),I.tSrc.value=t.texture,I.uStep.value.set(0,1/t.height),pe(ee,e)}function ve(e={}){if(e.space!==void 0&&e.space!==`device`&&e.space!==`css`)throw TypeError(`acquireTarget: space must be 'device' or 'css', got "${e.space}"`);let t=null;if(e.size!=null){if(!Array.isArray(e.size)||e.size.length!==2||!e.size.every(e=>Number.isFinite(e)&&e>=1))throw TypeError(`acquireTarget: size must be [width, height] in pixels`);t=[Math.round(e.size[0]),Math.round(e.size[1])]}let n=U(e.scale,1);if(!(n>0))throw TypeError(`acquireTarget: scale must be > 0`);return{msaa:!!e.msaa,depth:e.depth!==!1||!!e.depthTexture,depthTexture:!!e.depthTexture,stencil:!!e.stencil,scale:n,space:e.space||`device`,size:t}}function we(e){if(e.size)return[e.size[0],e.size[1]];let t=e.space===`css`?B:ie;return[Math.max(1,Math.round(t[0]*e.scale)),Math.max(1,Math.round(t[1]*e.scale))]}let De=(e,t,r)=>e.msaa?ye(n,t*r,l):0;function Oe(e,t){let[n,r]=we(t),i=t.depthTexture?new E(n,r,t.stencil?c:u,void 0,void 0,void 0,void 0,void 0,void 0,t.stencil?k:y):null,a=new d(n,r,{type:m,format:w,minFilter:P,magFilter:P,generateMipmaps:!1,depthBuffer:t.depth,stencilBuffer:t.stencil,samples:De(t,n,r),depthTexture:i});return a.texture.name=e,a}function ke(e){let[t,n]=we(e.spec),r=De(e.spec,t,n);e.rt.samples!==r&&(e.rt.samples=r,e.rt.dispose()),e.rt.setSize(t,n)}function Ae(e){if(e==null)return null;if(e.isRenderTarget||e.isWebGLRenderTarget)return e.texture;if(e.isTexture)return e;throw TypeError(`post.compose: a and b must be render targets, textures or null`)}let je=e=>[U(e.image&&e.image.width,0),U(e.image&&e.image.height,0)];function Me(e){let[t,n]=je(e);return t===ue.x&&n===ue.y}function Ne(){let t=e.getRenderTarget();try{let t=new C;for(let e of[...Object.values(O),M,F,ee]){let n=new f(p,e);n.frustumCulled=!1,t.add(n)}e.setRenderTarget(R),e.compile(t,h);let n=new C,r=new f(p,te);r.frustumCulled=!1,n.add(r),e.setRenderTarget(null),e.compile(n,h)}catch{}finally{e.setRenderTarget(t)}}t.precompile!==!1&&Ne();function Pe(e){let t=D.uAspect.value,n=Ee(U(e.stretch,.8),.25,4),r=Array.isArray(e.focus)?e.focus:[0,0],i=Ee(U(r[0],0),-1.5,1.5)*.5+.5,a=Ee(U(r[1],0),-1.5,1.5)*.5+.5,o=0;for(let[e,r]of[[0,0],[1,0],[0,1],[1,1]])o=Math.max(o,Math.hypot((e-i)*t*n,r-a));D.uFocus.value.set(i,a,Ee(U(e.focusR,0),0,.9*o),o);let s=Math.max(0,U(e.lead,.4));D.uP.value.set(Math.max(.01,U(e.feather,.2)),s,Ee(U(e.lag,.25),0,s),Ee(U(e.close,.9),.05,1));let c=Array.isArray(e.rise)?e.rise:[],l=Ee(U(c[0],.4),0,.99),u=Ee(U(c[1],.84),l+.01,1),d=Array.isArray(e.lum)?e.lum:[],f=Math.max(1e-6,U(d[0],.004)),p=Math.max(f*2,U(d[1],.12));D.uQ.value.set(l,u,Math.log2(f),Math.log2(p)),D.uK.value.set(n,Ee(U(e.taps,.005),0,.05),0,0)}return{resize(e,t,n){if(V)return;B=[Math.max(1,U(e,1)),Math.max(1,U(t,1))],ae=U(n,1)>0?U(n,1):1,ie=[Math.max(1,Math.floor(B[0]*ae)),Math.max(1,Math.floor(B[1]*ae))],R.setSize(ie[0],ie[1]);let r=Math.max(1,Math.ceil(B[0]/2)),i=Math.max(1,Math.ceil(B[1]/2));z.forEach((e,t)=>{let n=1<<t;for(let t of e)t.setSize(Math.max(1,Math.ceil(r/n)),Math.max(1,Math.ceil(i/n)))});for(let e of re.values())ke(e)},acquireTarget(e,t={}){if(V)throw Error(`post.acquireTarget: post is disposed`);if(typeof e!=`string`||!e)throw TypeError(`acquireTarget: key must be a non-empty string`);let n=ve(t),r=JSON.stringify(n),i=re.get(e);if(i&&i.sig===r)return i.rt;i&&i.rt.dispose();let a=Oe(e,n);return re.set(e,{rt:a,spec:n,sig:r}),a},releaseTarget(e){let t=re.get(e);t&&(t.rt.dispose(),re.delete(e))},compose({a:t=null,b:n=null,mix:r=0,kind:i=`fade`,transitionParams:a={}}={}){if(V)return;if(!be.includes(i))throw TypeError(`post.compose: unknown kind "${i}"`);oe=0,e.getDrawingBufferSize(ue);let o=Ae(t),s=Ae(n),c=Ee(U(r,0),0,1),l;if(s?o?i===`cut`?l=c<.5?o:s:c<=0?l=o:c>=1&&(l=s):l=s:l=o,l===null){H=null,se.compose=`none`;return}if(D.uAspect.value=R.width/R.height,D.uPxScale.value=R.width/B[0],D.uRes.value.set(R.width,R.height),l){if(Me(l)){H=l,se.compose=`direct`;return}D.tA.value=l,D.tB.value=l,D.uMix.value=0,pe(O.copy,R),H=R.texture,se.compose=`copy`;return}let u=a||{};if(D.tA.value=o,D.tB.value=s,D.uMix.value=c,i===`lift`){let e={...xe.lift,...u};D.uP.value.set(U(e.dir,1)<0?-1:1,Ee(U(e.travel,.08),0,.25),Math.max(.001,U(e.feather,.4)),0)}else if(i===`reveal`){let e={...xe.reveal,...u},t=Math.max(1e-6,U(e.lo,.002)),n=Math.max(t*2,U(e.hi,1.5));D.uP.value.set(Ee(U(e.soft,.15),.001,1),Math.max(0,U(e.spread,.03)),Math.log2(t),Math.log2(n))}else i===`dissolve`&&Pe({...xe.dissolve,...u});pe(O[i],R),H=R.texture,se.compose=i},finish(t={}){if(V)return;e.getDrawingBufferSize(ue);let i=t.on!==!1,a=ge(n).glow.levels,o=Se.glow,s=typeof t.glow==`number`?{strength:t.glow}:t.glow||{},c=i?Math.max(0,U(s.strength,o.strength)):0,l=Array.isArray(s.weights)?s.weights:o.weights,u=Math.max(0,U(s.threshold,o.threshold)),d=!!H&&c>0&&a>0;if(d){let[e]=z[0],[t,n]=je(H);A.tSrc.value=H,A.uSrcTexel.value.set(1/Math.max(1,t),1/Math.max(1,n)),A.uBlock.value=Math.max(1,t)/e.width,A.uThresh.value=u,pe(M,e);for(let e=1;e<a;e++)me(z[e-1][0],z[e][0]);for(let e=0;e<a;e++)_e(z[e][0],z[e][1],Ce[e])}let f=[L.tGlow1,L.tGlow2,L.tGlow3];for(let e=0;e<3;e++)f[e].value=d&&e<a?z[e][0].texture:S;L.uGlow.value.set(d&&a>=1?c*U(l[0],0):0,d&&a>=2?c*U(l[1],0):0,d&&a>=3?c*U(l[2],0):0),L.tSrc.value=H||S,L.uHasSrc.value=+!!H,L.uFetch.value=H&&Me(H)?1:0,L.uBg.value.fromArray(t.background==null?r:Te(t.background)),L.uRes.value.set(ue.x,ue.y);let p=Se.rolloff,m=t.rolloff||{};L.uKnee.value=i?Ee(U(m.knee,p.knee),.5,1):1,L.uWhite.value=i?Math.max(0,U(m.white,p.white)):0;let h=i&&Array.isArray(t.veil)?t.veil:Se.veil;L.uVeil.value.set(Math.max(0,U(h[0],0)),Math.max(0,U(h[1],0)),Math.max(0,U(h[2],0))),L.uVignette.value=i?Ee(U(t.vignette,Se.vignette),0,1):0,L.uGrain.value=i?Math.max(0,U(t.grain,Se.grain)):0,L.uDither.value=Math.max(0,U(t.dither,Se.dither));let g=Math.floor(U(t.time,0)*24);L.uGrainSeed.value.set((g*.6180339887%1+1)%1*1024,(g*.4142135624%1+1)%1*1024);let _=Se.quiet,v=i?t.quietZones:null,y=Array.isArray(v)?{rects:v}:v||{rects:[]},b=Array.isArray(y.rects)?y.rects:[],x=ue.x/B[0],C=ue.y/B[1],w=Math.max(0,U(y.pad,_.pad)),T=0;for(let e of b){if(T>=12)break;let t=Array.isArray(e)?e:e&&typeof e==`object`?[e.left,e.top,e.right,e.bottom]:null;if(!t||!t.every(e=>Number.isFinite(e)))continue;let n=Math.min(t[0],t[2])-w,r=Math.max(t[0],t[2])+w,i=Math.min(t[1],t[3])-w,a=Math.max(t[1],t[3])+w;L.uQuiet.value[T++].set(n*x,ue.y-a*C,r*x,ue.y-i*C)}for(let e=T;e<12;e++)L.uQuiet.value[e].set(0,0,0,0);L.uQuietN.value=T,L.uQuietSoft.value=Math.max(1,U(y.feather,_.feather)*x),L.uQuietK.value=Ee(U(y.strength,_.strength),0,1),L.uQuietDesat.value=Ee(U(y.desaturate,_.desaturate),0,1);let E=Array.isArray(y.lum)?y.lum:_.lum,D=Math.max(0,U(E[0],_.lum[0]));L.uQuietLum.value.set(D,Math.max(D+1e-4,U(E[1],_.lum[1]))),e.getViewport(fe);let O=e.getScissorTest();e.setRenderTarget(null),e.setScissorTest(!1),e.getSize(de),e.setViewport(0,0,de.x,de.y),pe(te,null),e.setViewport(fe),e.setScissorTest(O),se.passes=oe,se.glowLevels=d?a:0,oe=0},setTier(e){if(V)return;let t=he(e,n);if(t===n)return;n=t;let r=ge(n).glow.levels;te.defines.GLOW_LEVELS!==r&&(te.defines.GLOW_LEVELS=r,te.needsUpdate=!0);for(let e of re.values())e.spec.msaa&&ke(e)},get tier(){return n},stats(){let t=R.width*R.height*8;for(let e of z)for(let n of e)t+=n.width*n.height*8;let r=[];for(let[e,n]of re){let i=n.rt.width*n.rt.height,a=n.spec.depth?4:0;t+=i*(8+(n.spec.depthTexture?4:0))+(n.rt.samples>0?i*n.rt.samples*(8+a):i*a),r.push({key:e,width:n.rt.width,height:n.rt.height,samples:n.rt.samples,depthTexture:n.spec.depthTexture})}return{tier:n,glowLevels:ge(n).glow.levels,msaa:ye(n,ie[0]*ie[1],l),css:[...B],device:[...ie],dpr:ae,targets:r,bytes:t,lastFrame:{...se},outputColorSpace:String(e.outputColorSpace),disposed:V}},dispose(){if(!V){V=!0,H=null,R.dispose();for(let e of z)for(let t of e)t.dispose();for(let e of re.values())e.rt.dispose();re.clear();for(let e of[...Object.values(O),M,F,ee,te])e.dispose();p.dispose(),S.dispose()}}}}function Oe(e,t,n,r=new a){e.updateMatrixWorld();let i=e.projectionMatrix.elements;return r.set((t+i[8])/i[0],(n+i[9])/i[5],-1),r.transformDirection(e.matrixWorld)}var ke=Object.freeze({land:Object.freeze({fov:50,aspect:1440/900}),port:Object.freeze({fov:64,aspect:390/844})});function Ae(e){if(e&&typeof e==`object`&&!Object.isFrozen(e)){for(let t of Object.values(e))Ae(t);Object.freeze(e)}return e}var je=Ae({window:{frame:`world`,amounts:{galaxy:.75,aurora:.85,nebula:0,stars:.9,horizon:1,exposure:1,peak:.82},galaxy:{a:[-.574,0,-.819],b:[-.112,.766,-.633],core:[-.639,-.105,-.762],shape:{width:.08,coreLength:.75,dust:.9}},nebula:null,aurora:{azimuth:-.44,distance:2.2,spacing:1.6,span:1.3,base:.45,decay:.45,folds:.28,phase:2.6},heroes:[{dir:[-.42,.52,-.74],flux:.6,color:`#c9d6ff`},{dir:[-.88,.3,.36],flux:.42,color:`#fff1dc`}],stillTime:24},space:{frame:`view`,amounts:{galaxy:.9,aurora:0,nebula:.6,stars:1,horizon:0,exposure:1,peak:.82},reference:ke,layouts:{land:{galaxy:{a:[-1.05,-.62],b:[.18,1.08],core:[-1.25,-.92],shape:{width:.085,coreLength:.7,dust:1}},nebula:{at:[-.04,.8],radius:.085,roll:.6},heroes:[{at:[-.44,.58],flux:1,color:`#9fc0ff`},{at:[.86,-.64],flux:.55,color:`#ffd6a8`},{at:[-.8,-.2],flux:.42,color:`#eef0ff`}]},port:{galaxy:{a:[-1.1,.02],b:[.62,1.08],core:[-1.35,-.25],shape:{width:.085,coreLength:.7,dust:1}},nebula:{at:[.12,.8],radius:.085,roll:.6},heroes:[{at:[-.55,.42],flux:1,color:`#9fc0ff`},{at:[.78,-.48],flux:.55,color:`#ffd6a8`},{at:[-.2,-.78],flux:.42,color:`#eef0ff`}]}},stillTime:0},plain:{frame:`view`,amounts:{galaxy:0,aurora:0,nebula:0,stars:1,horizon:0,exposure:1,peak:.82},reference:ke,layouts:{land:{galaxy:null,nebula:null,heroes:[{at:[.62,.5],flux:.6,color:`#c9d6ff`},{at:[-.55,-.42],flux:.42,color:`#fff1dc`}]},port:{galaxy:null,nebula:null,heroes:[{at:[.48,.55],flux:.6,color:`#c9d6ff`},{at:[-.6,-.35],flux:.42,color:`#fff1dc`}]}},stillTime:0}});Object.freeze(Object.keys(je));function Me(e,t){if(e===`port`||e===`portrait`)return`port`;if(e===`land`||e===`landscape`)return`land`;if(e!=null)throw TypeError(`sky preset: unknown layout "${e}"`);return Number.isFinite(t)&&t<.8?`port`:`land`}var Ne=e=>new a(e[0],e[1],e[2]).normalize();function Pe(e,t,n={}){if(!Object.prototype.hasOwnProperty.call(je,t))throw TypeError(`sky preset: unknown preset "${t}"`);let r=je[t],i=n.view??null,o=!!(i&&i.isPerspectiveCamera),s=Me(n.layout,o?i.aspect:n.aspect),c=r.amounts;if(e.setSkyRotation(null),e.setGalaxy(c.galaxy),e.setAurora(c.aurora),e.setNebula(c.nebula),e.setStars(c.stars),e.setHorizon(c.horizon),e.setExposure(c.exposure),e.setPeak(c.peak),r.frame===`world`){let n=r.galaxy;n&&c.galaxy>0&&e.setGalaxyFrame(new a().crossVectors(Ne(n.a),Ne(n.b)).normalize(),Ne(n.core),n.shape);let i=r.nebula;return i&&c.nebula>0&&e.setNebulaFrame(Ne(i.dir),{radius:i.radius,roll:i.roll}),r.aurora&&c.aurora>0&&e.setAuroraFrame(r.aurora),e.setHeroStars(r.heroes.map(e=>({dir:Ne(e.dir),flux:e.flux,color:e.color,...e.size==null?{}:{size:e.size}}))),{name:t,layout:s,stillTime:r.stillTime}}let l;if(o)l=i;else{let e=r.reference[s],t=Number.isFinite(n.aspect)&&n.aspect>0?n.aspect:e.aspect;l=new F(e.fov,t,.1,100),i&&i.isQuaternion&&l.quaternion.copy(i),l.updateProjectionMatrix(),l.updateMatrixWorld(!0)}let u=r.layouts[s],d=e=>Oe(l,e[0],e[1],new a);if(u.galaxy&&c.galaxy>0){let t=new a().crossVectors(d(u.galaxy.a),d(u.galaxy.b)).normalize();e.setGalaxyFrame(t,d(u.galaxy.core),u.galaxy.shape)}return u.nebula&&c.nebula>0&&e.setNebulaFrame(d(u.nebula.at),{radius:u.nebula.radius,roll:u.nebula.roll}),e.setHeroStars(u.heroes.map(e=>({dir:d(e.at),flux:e.flux,color:e.color,...e.size==null?{}:{size:e.size}}))),{name:t,layout:s,stillTime:r.stillTime}}var Fe=6,Ie=Object.freeze({deep:`#03071c`,blue:`#0a1846`,indigo:`#140f44`,horizon:`#16265e`,galOuter:`#3a3fb0`,galViolet:`#6f4fdc`,galMauve:`#a68ef2`,galBlue:`#8ea4ff`,galPink:`#ff96c4`,galPeach:`#ffd0b0`,galWhite:`#e6deff`,auroraEdge:`#c8ffe4`,auroraBody:`#12f0a8`,auroraTeal:`#0edcd2`,auroraViolet:`#a457ff`,nebRose:`#f2456c`,nebDeep:`#8a1a40`,nebBlue:`#b4d2ff`,nebCore:`#ffe8f0`,starBlue:`#a9c1ff`,starWhite:`#f4f2ff`,starWarm:`#ffd8ae`});Object.freeze([{tier:0,galaxy:{warp:0,cloud:2,dust:1,grain:0},nebula:{warp:2,body:2,ridge:1,dark:1},aurora:{curtains:1,rays:2},base:0,starLayers:`D1(N300,2x2) + B`,starCells:5,heroes:Fe},{tier:1,galaxy:{warp:2,cloud:2,dust:3,grain:1},nebula:{warp:2,body:3,ridge:2,dark:1},aurora:{curtains:2,rays:2},base:1,starLayers:`D1(N400,2x2) + M + B`,starCells:6,heroes:Fe},{tier:2,galaxy:{warp:3,cloud:5,dust:5,grain:2},nebula:{warp:2,body:4,ridge:3,dark:1},aurora:{curtains:3,rays:4},base:1,starLayers:`D1 + D2(N250,2x2) + D3(N640,2x2, band only) + M + B`,starCells:14,heroes:Fe},{tier:3,galaxy:{warp:3,cloud:6,dust:6,grain:2},nebula:{warp:2,body:5,ridge:3,dark:1},aurora:{curtains:3,rays:4},base:1,starLayers:`D1 + D2 + D3(N640,2x2, band only) + M + B`,starCells:14,heroes:Fe}]);function Le(e){let t=e>>>0;return function(){t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}function Re(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function ze(e){let t=parseInt(e.replace(`#`,``),16);return[Re((t>>16&255)/255),Re((t>>8&255)/255),Re((t&255)/255)]}var Be=e=>{let t=Number(e).toFixed(6);return t===`-0.000000`?`0.000000`:t},Ve=e=>`vec3(${ze(e).map(Be).join(`, `)})`,W=e=>{let t=ze(e),n=.2126*t[0]+.7152*t[1]+.0722*t[2];return`vec3(${t.map(e=>Be(e/n)).join(`, `)})`};function He(e){let t=e(),n=e(),r=e(),i=Math.sqrt(1-t),a=Math.sqrt(t),o=new l(i*Math.sin(2*Math.PI*n),i*Math.cos(2*Math.PI*n),a*Math.sin(2*Math.PI*r),a*Math.cos(2*Math.PI*r));return new g().setFromMatrix4(new I().makeRotationFromQuaternion(o))}var Ue=e=>`mat3(${e.elements.map(Be).join(`, `)})`,We=`
varying vec3 vDir;
varying vec2 vNdc;

void main() {
  vNdc = position.xy;
  // View-space ray through this NDC point. Exact for any perspective
  // projection (including off-axis / setViewOffset) and any depth convention:
  // it only reads the x/y scale and shear terms of the projection matrix.
  vec3 rayV = vec3(
    (position.x + projectionMatrix[2][0]) / projectionMatrix[0][0],
    (position.y + projectionMatrix[2][1]) / projectionMatrix[1][1],
    -1.0);
  // to world: mat3(viewMatrix) is the inverse camera rotation, so its transpose is the rotation
  vDir = transpose(mat3(viewMatrix)) * rayV;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;function Ge(e){let t=Ie;return`
#define SKY_PI 3.14159265
#define SKY_TAU 6.28318531
#define HERO_N ${Fe}

#ifndef TIER
#define TIER 2
#endif

// Octave budgets per tier. Loop bounds are compile-time constants.
#if TIER <= 0
#define GAL_OCT 2
#define DUST_OCT 1
#define NEB_OCT 2
#define NEB_RID 1
#define AUR_N 1
#define D1_N 300.0
#elif TIER == 1
#define GAL_OCT 2
#define DUST_OCT 3
#define NEB_OCT 3
#define NEB_RID 2
#define AUR_N 2
#define D1_N 400.0
#elif TIER == 2
#define GAL_OCT 5
#define DUST_OCT 5
#define NEB_OCT 4
#define NEB_RID 3
#define AUR_N 3
#define D1_N 400.0
#define D3_N 640.0
#else
#define GAL_OCT 6
#define DUST_OCT 6
#define NEB_OCT 5
#define NEB_RID 3
#define AUR_N 3
#define D1_N 400.0
#define D3_N 640.0
#endif

varying vec3 vDir;
varying vec2 vNdc;

uniform float uGalaxy;
uniform float uAurora;
uniform float uNebula;
uniform float uStars;
uniform float uExposure;
uniform float uTime;
uniform float uHorizon;
uniform float uPeak;
uniform float uDpr;
uniform float uDither;
uniform float uEncode;
uniform float uAspect;
uniform float uSalt;
uniform mat3 uSkyRot;
uniform vec3 uSeedOff;
uniform vec3 uGalPole;
uniform vec3 uGalCore;
uniform vec4 uGalShape;
uniform vec4 uNebCenter;
uniform vec4 uNebT1;
uniform vec4 uNebT2;
uniform vec4 uAurFrame;
uniform vec4 uAurShape;
uniform vec4 uQuiet;
uniform float uQuietK;
uniform vec4 uHeroPos[HERO_N];
uniform vec4 uHeroCol[HERO_N];

// palette, linear light (GAL_* are unit-luminance chroma)
const vec3 SKY_DEEP = ${Ve(t.deep)};
const vec3 SKY_BLUE = ${Ve(t.blue)};
const vec3 SKY_INDIGO = ${Ve(t.indigo)};
const vec3 SKY_HORIZON = ${Ve(t.horizon)};
const vec3 GAL_OUTER = ${W(t.galOuter)};
const vec3 GAL_VIOLET = ${W(t.galViolet)};
const vec3 GAL_MAUVE = ${W(t.galMauve)};
const vec3 GAL_BLUE = ${W(t.galBlue)};
const vec3 GAL_PINK = ${W(t.galPink)};
const vec3 GAL_PEACH = ${W(t.galPeach)};
const vec3 GAL_WHITE = ${W(t.galWhite)};
const vec3 AUR_EDGE = ${Ve(t.auroraEdge)};
const vec3 AUR_BODY = ${Ve(t.auroraBody)};
const vec3 AUR_TEAL = ${Ve(t.auroraTeal)};
const vec3 AUR_VIOLET = ${Ve(t.auroraViolet)};
const vec3 NEB_ROSE = ${Ve(t.nebRose)};
const vec3 NEB_DEEP = ${Ve(t.nebDeep)};
const vec3 NEB_BLUE = ${Ve(t.nebBlue)};
const vec3 NEB_CORE = ${Ve(t.nebCore)};
const vec3 STAR_BLUE = ${Ve(t.starBlue)};
const vec3 STAR_WHITE = ${Ve(t.starWhite)};
const vec3 STAR_WARM = ${Ve(t.starWarm)};

// overall gains (linear light)
const float GAL_GAIN = 0.22;
const float NEB_GAIN = 0.8;
const float AUR_GAIN = 1.2;

// aurora curtains: distance exponent (D * spacing^e), azimuth offset, gain
const vec3 AUR_E = vec3(0.0, 1.0, -0.8);
const vec3 AUR_AZ = vec3(0.0, 0.17, -0.24);
const vec3 AUR_G = vec3(1.0, 0.62, 0.48);

// seeded random rotations that decorrelate the star layers' cell grids
const mat3 STAR_R1 = ${Ue(e[0])};
const mat3 STAR_R2 = ${Ue(e[1])};
const mat3 STAR_R3 = ${Ue(e[2])};
const mat3 STAR_R4 = ${Ue(e[3])};
const mat3 STAR_R5 = ${Ue(e[4])};

// octave rotations (orthonormal) so lattice axes never line up between octaves
const mat3 OCT3 = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
const mat2 OCT2 = mat2(0.80, 0.60, -0.60, 0.80);

float skyLum(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// ------------------------------------------------------------ hashing

// Dave Hoskins' sine-free hashes: cheap float hashes for noise lattices.
vec3 skyHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0;
}

vec2 skyHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}

float skyHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// pcg3d (Jarzynski and Olano 2020) plus a final xorshift: high-quality integer
// hash for the star cells, where any pattern would show.
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  return v;
}

// -------------------------------------------------------------- noise

// 3D gradient noise, quintic fade. Output roughly in [-0.75, 0.75].
float gnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(skyHash33(i), f);
  float n100 = dot(skyHash33(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(skyHash33(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(skyHash33(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(skyHash33(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(skyHash33(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(skyHash33(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(skyHash33(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

// 2D gradient noise, quintic fade.
float gnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n00 = dot(skyHash22(i), f);
  float n10 = dot(skyHash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float n01 = dot(skyHash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float n11 = dot(skyHash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

// Star clouds. Persistence 0.68 (not 0.5) keeps real contrast in the fine
// octaves: the band's light is granular, not a smooth fog.
float fbmGal(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < GAL_OCT; i++) {
    s += a * gnoise3(p);
    p = OCT3 * p * 2.03 + vec3(1.7, 9.2, 4.1);
    a *= 0.68;
  }
  return s;
}

// Dust: fbm in which every octave displaces the next octave's domain by its
// own value (a turbulent self-warp). Level sets of plain gradient noise trace
// its lattice (it is zero at every lattice vertex), so thresholding it drew
// angular, stair-stepped blobs; the self-warp curls them into smoke-like
// wisps. x = signed sum (cloud body), y = ridges along the zero crossings of
// the octaves after the first (thin filaments; the first would draw a net).
vec2 dustGal(vec3 p) {
  float s = 0.0;
  float r = 0.0;
  float a = 0.5;
  for (int i = 0; i < DUST_OCT; i++) {
    float n = gnoise3(p);
    s += a * n;
    float k = clamp(1.0 - 4.0 * abs(n), 0.0, 1.0);
    r += (i > 0 ? a : 0.0) * k * k;
    p = OCT3 * p * 2.13 + vec3(4.3, 1.1, 7.9) + vec3(1.2, -0.9, 0.7) * n;
    a *= 0.64;
  }
  return vec2(s, r);
}

float fbmNeb(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < NEB_OCT; i++) {
    s += a * gnoise2(p);
    p = OCT2 * p * 2.07 + vec2(3.1, 7.3);
    a *= 0.58;
  }
  return s;
}

vec2 ridgeNeb(vec2 p) {
  float r = 0.0;
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < NEB_RID; i++) {
    float n = gnoise2(p);
    s += a * n;
    float k = clamp(1.0 - 7.0 * abs(n), 0.0, 1.0);
    r += a * k * k;
    p = OCT2 * p * 2.13 + vec2(2.9, 6.1);
    a *= 0.55;
  }
  return vec2(r, s);
}

float wrapPi(float a) {
  return a - SKY_TAU * floor((a + SKY_PI) / SKY_TAU);
}

// ------------------------------------------------------------ base sky

// Deep saturated blue with a very subtle large-scale drift: the noise moves
// it between darker and lighter blue and, along a second (analytic) axis,
// toward indigo. Nothing here is finer than about a quarter of the sky.
vec3 baseSky(vec3 d, vec3 c) {
#if TIER >= 1
  float n = gnoise3(c * 1.1 + uSeedOff * 0.11);
#else
  float n = 0.3 * dot(c, vec3(0.48, 0.60, -0.64));
#endif
  float hue = smoothstep(-0.6, 0.6, dot(c, vec3(0.62, -0.46, 0.64)) - 0.9 * n);
  vec3 sp = mix(SKY_DEEP, mix(SKY_BLUE, SKY_INDIGO, hue), clamp(0.6 + 1.2 * n, 0.0, 1.0));
  if (uHorizon <= 0.0) return sp;
  // world frame: lighter and bluer toward the horizon, darker below it
  vec3 hz = mix(SKY_HORIZON, sp, smoothstep(0.0, 0.45, d.y));
  hz = mix(hz, SKY_DEEP * 0.8, 1.0 - smoothstep(-0.25, 0.0, d.y));
  return mix(sp, hz, uHorizon);
}

// -------------------------------------------------------------- galaxy

// The Milky Way: a band around a great circle (pole uGalPole), brightest and
// thickest toward uGalCore, with a warm hot core. Structure is anisotropic
// (stretched along the band) and domain-warped; the light is log-normal star
// clouds with a fine grain of unresolved stars; dust is a rift lane plus
// self-warped smoky clouds and thin filaments. Outputs glow (linear),
// transmittance of the dust for what lies behind it (stars), and a
// star-density field. pxA (radians per device pixel) fades the grain.
void galaxyField(vec3 c, float pxA, out vec3 glow, out float trans, out float dens) {
  trans = 1.0;
  float W = uGalShape.x;
  float sb = dot(c, uGalPole);
  vec3 e2 = cross(uGalPole, uGalCore);
  float lx = dot(c, uGalCore);
  float ly = dot(c, e2);
  float l = (abs(lx) + abs(ly) > 1e-6) ? atan(ly, lx) : 0.0;
  float coreL = exp(-l * l / (uGalShape.y * uGalShape.y));
  float We = W * (1.0 + 0.8 * coreL);
  float bh = sb / (3.0 * We);
  float halo = exp(-bh * bh) * (0.45 + 0.55 * coreL);
  glow = GAL_OUTER * (0.07 * halo);
  dens = 0.18 * halo;
  if (abs(sb) > 4.4 * We) {
    glow *= GAL_GAIN;
    return;
  }

  // anisotropic domain: latitude compressed 1.9x, so features run along the band
  vec3 p = (c + uGalPole * (sb * 0.9)) * 4.2 + uSeedOff;

#if TIER >= 2
  vec3 pw = p * 0.45;
  vec3 w = vec3(gnoise3(pw + vec3(13.1, 0.0, 0.0)),
                gnoise3(pw + vec3(0.0, 27.3, 0.0)),
                gnoise3(pw + vec3(0.0, 0.0, 41.7)));
#elif TIER == 1
  vec3 pw = p * 0.45;
  float w0 = gnoise3(pw + vec3(13.1, 0.0, 0.0));
  float w1 = gnoise3(pw + vec3(0.0, 27.3, 0.0));
  vec3 w = vec3(w0, w1, 0.7 * (w0 - w1));
#else
  vec3 w = 0.45 * sin(p.yzx * 1.3 + vec3(0.0, 2.1, 4.2));
#endif
  vec3 q = p + w * 2.4;

  float cl = fbmGal(q);
  float bb = (sb + We * (0.8 * w.x + 0.3 * cl)) / We;
  float prof = 0.72 * exp(-bb * bb) + 0.28 * exp(-0.25 * bb * bb);
  float longi = 0.34 + 0.66 * coreL + 0.18 * w.y;

  // dust: its own self-warped domain, stretched 1.5x along the band (3.2x
  // turned the noise lattice into slanted parallelograms) and gathered toward
  // a wandering mid-plane lane (the rift). The body is a soft ramp that is
  // wide against the noise spread, so clouds fade in over a gradient and the
  // fine octaves fray their edges; tau, not light, is ramped, so cores still
  // go dark. Zero beyond 3 We, so the noise is skipped there.
  float dm = 1.0 - smoothstep(1.2, 3.0, abs(sb) / We);
  float tau = 0.0;
  if (dm > 0.0) {
    vec3 pdu = (c + uGalPole * (sb * 0.5)) * 9.0 + uSeedOff.zxy + w * 1.6;
    vec2 rd = dustGal(pdu);
    float rb = (sb - We * (0.05 + 0.4 * w.z)) / (0.6 * We);
    float lane = exp(-rb * rb);
    // dust shies away from the brightest star clouds
    float df = rd.x + 0.2 * lane - 0.07 - 0.16 * cl;
    float body = smoothstep(-0.14, 0.3, df);
    // thin dark threads reaching out of the clouds into the light (not inside them)
    float fil = smoothstep(0.22, 0.8, rd.y) * smoothstep(-0.32, -0.04, df) * (1.0 - body);
    tau = uGalShape.w * dm * ((2.6 * body * body + 0.2 * body) * (0.35 + 0.65 * max(lane, 0.6 * prof)) + 0.9 * fil * (0.3 + 0.7 * prof));
  }
  trans = exp(-tau);

  // light: log-normal star clouds (bright knots, soft gradients, no clamped
  // plateaus), a bulge toward the core and a hot inner core
  float clump = exp(2.3 * cl);
  float bulge = coreL * exp(-sb * sb / (0.5 * We * We)) * (0.5 + 0.5 * clump);
  float hl = l / (0.32 * uGalShape.y);
  float hot = exp(-hl * hl - sb * sb / (0.22 * We * We)) * (0.6 + 0.4 * clump);
  // the band's own light and star crowding fade to zero at the early-out
  // above (4.4 We). The wide profile wing is still a few percent at 3.2 We,
  // so a bare cut there drew a hard straight line parallel to the band.
  float edge = 1.0 - smoothstep(3.2, 4.4, abs(sb) / We);
  float I = (prof * longi * clump + 1.5 * bulge + 2.4 * hot) * edge;
#if TIER >= 1
  // unresolved stars: a fine mottling of the band's own light, strongest in
  // its bright clouds (blobs of about 3 to 8 px on a desktop frame). Two
  // rotated octaves at unrelated scales (tier 2+), because one octave alone
  // has a single wavelength and reads as a regular orange-peel pattern.
  // Faded out where the fine lattice falls under about 2 px: no shimmer.
  float gA = smoothstep(1.6, 3.2, 1.0 / (170.0 * pxA)) * smoothstep(0.05, 0.5, I);
  if (gA > 0.0) {
    float gn = gnoise3(c * 170.0 + uSeedOff * 2.3);
#if TIER >= 2
    gn = 0.75 * gn + 0.6 * gnoise3(OCT3 * c * 71.0 + uSeedOff.yzx * 1.7);
    I *= mix(1.0, 0.62 * exp(1.6 * gn) + 0.28, gA);
#else
    I *= mix(1.0, 0.7 * exp(1.0 * gn) + 0.25, gA);
#endif
  }
#endif

  vec3 tint = mix(GAL_OUTER, GAL_VIOLET, smoothstep(0.05, 0.45, I));
  tint = mix(tint, GAL_MAUVE, 0.7 * smoothstep(0.35, 1.0, I));
  tint = mix(tint, GAL_BLUE, 0.4 * smoothstep(0.05, 0.45, w.z) * (1.0 - coreL));
  tint = mix(tint, GAL_WHITE, 0.6 * smoothstep(0.7, 1.6, I) * (1.0 - coreL * coreL));
  tint = mix(tint, GAL_PINK, coreL * coreL * smoothstep(0.4, 1.2, I));
  tint = mix(tint, GAL_PEACH, coreL * coreL * smoothstep(1.3, 2.6, I));

  // dust reddens what it does not block
  vec3 ext = exp(-tau * vec3(0.94, 1.0, 1.04));
  glow = (glow + tint * I) * ext * GAL_GAIN;
  dens = (dens + (prof * (0.2 + 0.5 * min(clump, 1.8)) + 0.6 * bulge + 0.4 * hot) * edge) * trans;
}

// -------------------------------------------------------------- nebula

// One localized emission cloud around uNebCenter (radius uNebCenter.w):
// mottled rose gas under a soft envelope, thin bright wisps (ridged noise),
// thin dark dust lanes, a brighter pale-blue ionisation front on one flank
// and a bright pink-white core. tau: its dust, for what lies behind it.
vec3 nebulaField(vec3 c, out float tau) {
  tau = 0.0;
  float cd = dot(c, uNebCenter.xyz);
  if (cd < uNebT1.w) return vec3(0.0);
  vec2 p = vec2(dot(c, uNebT1.xyz), dot(c, uNebT2.xyz)) / (cd * uNebCenter.w);
  vec2 o = uSeedOff.xy * 0.37;
  vec2 w = vec2(gnoise2(p * 1.2 + o), gnoise2(p * 1.2 + o + vec2(5.2, 1.3)));
  vec2 q = p + w * 0.55;
  float r = length(q * vec2(0.8, 1.25));
  float env = exp(-1.8 * r * r) * (1.0 - smoothstep(0.9, 1.6, r));
  if (env < 0.002) return vec3(0.0);

  float body = fbmNeb(q * 2.2 + o.yx);
  float den = clamp(0.4 + 3.2 * body, 0.0, 1.6);
  // fine structure fades out on small nebulae, where it would turn into scribbles
  float detail = smoothstep(0.08, 0.2, uNebCenter.w);
  vec2 rd = ridgeNeb(p * 3.0 + w * 0.25 + o * 1.7);
  float wisp = clamp(rd.x * 1.5, 0.0, 1.0) * detail;
  float dk = clamp(1.0 - 3.2 * abs(gnoise2(q * 3.2 + o + 9.1) + 0.12 * rd.y), 0.0, 1.0);
  dk = dk * dk * dk * detail;
  // dark lanes, dark pockets where the gas thins, and a little general dust so
  // the band behind does not shine through as violet mud
  tau = env * (2.2 * dk * smoothstep(0.2, 0.6, den) + 1.4 * smoothstep(0.06, 0.2, -body - 0.03) + 0.5);

  float front = smoothstep(-0.1, 0.5, 0.75 * q.x - 0.65 * q.y + 0.4 * w.x) * (1.0 - smoothstep(0.5, 1.1, r));
  // the core brightens the textured gas (it multiplies, so its structure stays)
  float core = exp(-7.0 * r * r);
  float I = env * den * (0.7 + 0.5 * wisp) * (1.0 + 0.6 * front) * (1.0 + 1.5 * core);
  // rose and pale blue are kept apart: the blue is a pale glow on the
  // ionisation front and switches in over a short ramp, because pixels that
  // are half rose, half blue read as mud
  float bl = smoothstep(0.35, 0.75, front * (0.7 + 0.5 * wisp)) * smoothstep(0.1, 0.5, I);
  vec3 rose = mix(NEB_DEEP, NEB_ROSE, smoothstep(0.05, 0.45, I));
  rose = mix(rose, NEB_CORE, 0.75 * core * smoothstep(0.5, 1.5, I));
  vec3 col = mix(rose, NEB_BLUE * 1.3, bl) * I;
  return col * (exp(-0.9 * tau) * NEB_GAIN);
}

// -------------------------------------------------------------- aurora

// Curtains as thin vertical sheets hanging from altitude uAurShape.x along
// wandering arcs on a flat earth (units: 100 km). For a sightline at azimuth
// a and elevation e, the sheet at ground distance rho(a) is met at altitude
// rho * tan(e): that altitude gives the vertical profile, and the sheet point
// X (a point on a 1D curve) drives the ray texture, so every structure is
// exactly vertical along the sheet. Rays converge toward the zenith overhead,
// as real ones do. Folds come from rho(a) wandering; where the sheet turns
// edge-on the light path through it lengthens and it brightens.
vec3 auroraField(vec3 d) {
  float ch = max(length(d.xz), 1e-5);
  float tanE = d.y / ch;
  float az = (length(d.xz) > 1e-5) ? atan(d.x, -d.z) : 0.0;
  float span = uAurFrame.w;
  float t = uTime;
  vec3 acc = vec3(0.0);
  for (int k = 0; k < AUR_N; k++) {
    float fk = float(k);
    float a = wrapPi(az - uAurFrame.x - AUR_AZ[k]);
    float env = 1.0 - smoothstep(0.5 * span, span, abs(a));
    if (env <= 0.0) continue;
    float ca = cos(a);
    float sa = sin(a);
    // smooth floor on cos(a): the arc recedes toward the horizon at its ends
    float sq = sqrt(ca * ca + 0.08);
    float cc = 0.5 * (ca + sq);
    float dcc = -0.5 * sa * (1.0 + ca / sq);
    float ph = uAurShape.w + fk * 2.17;
    float a1 = a * 2.7 + ph + t * 0.031;
    float a2 = a * 6.1 + ph * 1.9 - t * 0.047;
    float a3 = a * 13.3 + ph * 3.3 + t * 0.071;
    float A = uAurShape.z;
    float g = 1.0 + A * (sin(a1) + 0.5 * sin(a2) + 0.25 * sin(a3));
#if TIER >= 2
    // small irregular kinks in the hem (not in the fold term: too small to matter there)
    g += 0.25 * A * gnoise2(vec2(a * 12.0 + fk * 7.1, ph + t * 0.02));
#endif
    float gp = A * (2.7 * cos(a1) + 3.05 * cos(a2) + 3.325 * cos(a3));
    float rho = uAurFrame.y * pow(uAurFrame.z, AUR_E[k]) * g / cc;
    float h = rho * tanE - uAurShape.x;
    if (h < -0.07) continue;
    // path length through the sheet: 1 / |cos| of the angle between sightline and sheet normal
    float lg = gp / g - dcc / cc;
    float fold = min(sqrt(1.0 + lg * lg), 4.0);

    vec2 X = rho * vec2(sa, ca) + uSeedOff.xy * (0.13 + 0.07 * fk) + vec2(t * 0.012, 0.0);
    float nl = gnoise2(X * 1.7);
    float nm = gnoise2(X * 13.0 + 3.7);
    float rm = clamp(1.0 - 2.6 * abs(nm), 0.0, 1.0);
    float rays = 0.35 + 0.65 * rm * rm;
#if TIER >= 2
    float nf = gnoise2(X * 40.0 + 9.1);
    float rf = clamp(1.0 - 2.4 * abs(nf), 0.0, 1.0);
    rays *= 0.65 + 0.5 * rf;
#endif
    float patchy = smoothstep(-0.25, 0.3, nl + 0.1);
    float decay = uAurShape.y * (0.5 + 0.9 * smoothstep(-0.35, 0.35, nl + 0.6 * nm));
    float hp = max(h, 0.0);
    float lower = smoothstep(-0.06, 0.015, h);
    float body = lower * exp(-hp / decay);
    // the hem: a thin, almost white-green line inside a soft glow
    float hem = lower * exp(-hp / 0.03);
    float hemGlow = smoothstep(-0.07, 0.0, h) * exp(-hp / 0.1);
    // violet only where the green has faded: a hue path up the curtain (an
    // even green-violet mix is what read as grey)
    float top = lower * smoothstep(0.4, 1.2, h) * exp(-hp / (2.6 * decay));
    // rays strongest higher up; the body near the hem stays smoother
    float rr = mix(1.0, rays, 0.45 + 0.55 * smoothstep(0.0, 0.3, h));
    vec3 cb = mix(AUR_BODY, AUR_TEAL, smoothstep(0.25, 0.9, h));
    float I = env * (0.1 + 0.9 * patchy) * fold * AUR_G[k];
    acc += I * (cb * (body * rr + 0.45 * hemGlow) + AUR_EDGE * (0.8 * hem * rr) + AUR_VIOLET * (0.45 * top * (0.5 + 0.5 * rays)));
  }
  return acc * AUR_GAIN;
}

// --------------------------------------------------------------- stars

// Cube-sphere face coordinates: uv in [-1, 1] on the dominant axis' face.
vec2 cubeUV(vec3 v, out float face) {
  vec3 a = abs(v);
  if (a.x >= a.y && a.x >= a.z) {
    face = v.x >= 0.0 ? 0.0 : 1.0;
    return v.yz / a.x;
  }
  if (a.y >= a.z) {
    face = v.y >= 0.0 ? 2.0 : 3.0;
    return v.zx / a.y;
  }
  face = v.z >= 0.0 ? 4.0 : 5.0;
  return v.xy / a.z;
}

// Grid position (cells) of a direction on a star layer of N x N cells per
// face, equal-angle warped (cell areas within about 30 percent of each other).
// m = metric: angle^2 = m.x dx^2 + 2 m.y dx dy + m.z dy^2 for a grid offset.
vec2 starGrid(vec3 c, mat3 R, float N, out vec3 m, out float face) {
  vec3 v = R * c;
  vec2 uv = cubeUV(v, face);
  vec2 st = atan(uv) * (4.0 / SKY_PI);
  vec2 J = (SKY_PI / 4.0) * (1.0 + uv * uv) * (2.0 / N);
  float r2 = 1.0 + dot(uv, uv);
  float ir4 = 1.0 / (r2 * r2);
  m = vec3((1.0 + uv.y * uv.y) * J.x * J.x, -uv.x * uv.y * J.x * J.y, (1.0 + uv.x * uv.x) * J.y * J.y) * ir4;
  return (st * 0.5 + 0.5) * N;
}

// One star from its cell hash. L: x = flux scale, y = flux exponent (higher:
// more faint stars), z = size (CSS px, gaussian sigma), w = twinkle amount.
vec3 starPoint(uvec3 h, vec2 cell, vec2 g, vec3 m, float invPx2, float jit, float occ, vec4 L) {
  float pres = float(h.x >> 16u) * (1.0 / 65536.0);
  float on = clamp((occ - pres) * 16.0, 0.0, 1.0);
  if (on <= 0.0) return vec3(0.0);
  vec2 rp = vec2(float(h.x & 65535u), float(h.y >> 16u)) * (1.0 / 65536.0);
  vec2 dg = cell + 0.5 + jit * (2.0 * rp - 1.0) - g;
  float d2 = (m.x * dg.x * dg.x + 2.0 * m.y * dg.x * dg.y + m.z * dg.y * dg.y) * invPx2;
  float br = float(h.y & 65535u) * (1.0 / 65536.0);
  float tmp = float(h.z >> 16u) * (1.0 / 65536.0);
  float tw = float(h.z & 65535u) * (1.0 / 65536.0);
  float rel = 0.06 + 0.94 * pow(br, L.y);
  float s = L.z * uDpr * (0.85 + 0.5 * rel);
  float s2 = s * s + 0.083; // + pixel footprint variance: no shimmer at sub-pixel sizes
  float v = exp(-0.5 * d2 / s2);
  vec3 tc = mix(STAR_BLUE, STAR_WHITE, smoothstep(0.0, 0.55, tmp));
  tc = mix(tc, STAR_WARM, smoothstep(0.7, 1.0, tmp));
  float twinkle = 1.0 + L.w * sin(uTime * (1.3 + 2.6 * tw) + tw * SKY_TAU);
  return tc * (L.x * rel * v * on * twinkle);
}

// Dense layer: searches the 2x2 cells nearest the pixel, so a star may sit
// anywhere in its cell (needs 3 sigma < half a cell in pixels).
vec3 layerDense(vec3 c, mat3 R, float N, uint salt, float occ, vec4 L, float invPx2) {
  vec3 m;
  float face;
  vec2 g = starGrid(c, R, N, m, face);
  vec2 ci = floor(g);
  vec2 o = step(vec2(0.5), g - ci) - 1.0;
  uint fs = (uint(face) << 24u) ^ salt;
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 cell = ci + o + vec2(float(i), float(j));
      if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= N || cell.y >= N) continue;
      uvec3 h = pcg3d(uvec3(uint(cell.x), uint(cell.y), fs));
      acc += starPoint(h, cell, g, m, invPx2, 0.5, occ, L);
    }
  }
  return acc;
}

// Sparse layer: one cell, star kept 20 percent away from the cell edges.
vec3 layerSparse(vec3 c, mat3 R, float N, uint salt, float occ, vec4 L, float invPx2) {
  vec3 m;
  float face;
  vec2 g = starGrid(c, R, N, m, face);
  // clamp: rounding at a face edge must never give -1 (float to uint of a negative is undefined)
  vec2 cell = clamp(floor(g), vec2(0.0), vec2(N - 1.0));
  uint fs = (uint(face) << 24u) ^ salt;
  uvec3 h = pcg3d(uvec3(uint(cell.x), uint(cell.y), fs));
  return starPoint(h, cell, g, m, invPx2, 0.3, occ, L);
}

vec3 starField(vec3 c, float pxA, float dens, float trans) {
  float invPx2 = 1.0 / (pxA * pxA);
  uint salt = uint(uSalt);
  vec3 acc = vec3(0.0);
  // keep faint-star density per CSS pixel near the desktop value on wide views
  float kd = clamp(0.00105 / (pxA * uDpr), 0.6, 1.0);
  // dense faint layers sit behind the dust and crowd into the band
  acc += layerDense(c, STAR_R1, D1_N, salt + 11u, kd * (0.1 + 0.9 * dens), vec4(0.24 + 0.3 * dens, 2.6, 0.4, 0.0), invPx2) * trans;
#if TIER >= 2
  acc += layerDense(c, STAR_R2, 250.0, salt + 23u, kd * (0.07 + 0.5 * dens), vec4(0.32 + 0.3 * dens, 3.0, 0.45, 0.0), invPx2) * trans;
  // the band's grain: a crowd of barely resolved stars (band only)
  if (dens > 0.03) acc += layerDense(c, STAR_R3, D3_N, salt + 37u, kd * min(1.05 * dens, 0.95), vec4(0.3, 2.2, 0.36, 0.0), invPx2) * trans;
#endif
#if TIER >= 1
  acc += layerSparse(c, STAR_R4, 120.0, salt + 41u, 0.14 + 0.14 * dens, vec4(0.42, 3.5, 0.5, 0.1), invPx2) * mix(1.0, trans, 0.7);
#endif
  // bright layer: mostly foreground, barely dimmed by dust
  acc += layerSparse(c, STAR_R5, 40.0, salt + 53u, 0.18, vec4(1.0, 7.0, 0.62, 0.12), invPx2) * mix(1.0, trans, 0.4);
  return acc;
}

// The brightest handful, positioned in screen space by the CPU every frame
// (uHeroPos: fragment coords, visibility, core size in CSS px) so their
// four-point diffraction spikes stay screen-aligned and pixel-crisp.
vec3 heroStars(vec2 fc) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < HERO_N; i++) {
    vec4 P = uHeroPos[i];
    if (P.z < 0.5) continue;
    vec4 C = uHeroCol[i];
    vec2 dv = fc - P.xy;
    float len = 12.0 * uDpr * sqrt(C.a);
    float reach = 6.0 * len;
    if (abs(dv.x) > reach || abs(dv.y) > reach) continue;
    float sc = P.w * uDpr;
    float r2 = dot(dv, dv);
    float core = exp(-0.5 * r2 / (sc * sc + 0.083));
    float halo = 0.07 * exp(-sqrt(r2) / (5.0 * sc));
    float w2 = 0.2 * uDpr * uDpr + 0.083;
    vec2 a = abs(dv);
    float spikes = exp(-a.x / len) * exp(-0.5 * a.y * a.y / w2) + exp(-a.y / len) * exp(-0.5 * a.x * a.x / w2);
    acc += C.rgb * (C.a * (core + halo + 0.5 * spikes));
  }
  return acc;
}

// ---------------------------------------------------------- quiet zone

float quietMask(vec2 ndc) {
  if (uQuietK <= 0.0) return 0.0;
  vec2 ctr = 0.5 * (uQuiet.xy + uQuiet.zw);
  vec2 hs = 0.5 * abs(uQuiet.zw - uQuiet.xy);
  vec2 qd = (abs(ndc - ctr) - hs) * vec2(uAspect, 1.0);
  float dist = length(max(qd, 0.0)) + min(max(qd.x, qd.y), 0.0);
  return uQuietK * (1.0 - smoothstep(-0.04, 0.32, dist));
}

vec3 skyEncodeSrgb(vec3 c) {
  c = max(c, vec3(1e-7));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

// ---------------------------------------------------------------- main

void main() {
  vec3 d = normalize(vDir);
  // radians per device pixel (taken before any branching)
  float pxA = max(0.5 * (length(dFdx(d)) + length(dFdy(d))), 1e-6);
  vec3 c = uSkyRot * d;

  vec3 base = baseSky(d, c);

  vec3 feat = vec3(0.0);
  float trans = 1.0;
  float dens = 0.0;
  if (uGalaxy > 0.0) {
    vec3 gg;
    float tr;
    float de;
    galaxyField(c, pxA, gg, tr, de);
    feat = gg * uGalaxy;
    trans = mix(1.0, tr, min(uGalaxy, 1.0));
    dens = de * uGalaxy;
  }
  if (uNebula > 0.0) {
    float nt;
    vec3 nb = nebulaField(c, nt);
    float nTr = exp(-nt * uNebula);
    feat = feat * nTr + nb * uNebula;
    trans *= nTr;
  }
  vec3 aur = vec3(0.0);
  if (uAurora > 0.0 && d.y > 0.0) {
    aur = auroraField(d) * uAurora;
  }
  vec3 st = vec3(0.0);
  if (uStars > 0.0) {
    st = (starField(c, pxA, dens, trans) + heroStars(gl_FragCoord.xy)) * uStars;
  }
  if (uHorizon > 0.0) {
    // atmosphere: stars and galaxy fade into the horizon haze
    st *= mix(1.0, smoothstep(-0.02, 0.3, d.y), uHorizon);
    feat *= mix(1.0, 0.6 + 0.4 * smoothstep(-0.02, 0.2, d.y), uHorizon);
  }

  float q = quietMask(vNdc);
  if (q > 0.0) {
    feat = mix(feat, vec3(skyLum(feat)), 0.3 * q) * (1.0 - 0.78 * q);
    aur = mix(aur, vec3(skyLum(aur)), 0.3 * q) * (1.0 - 0.8 * q);
    st *= 1.0 - 0.85 * q;
    base *= 1.0 - 0.2 * q;
  }

  vec3 col = (base + feat + aur + st) * uExposure;
  // soft shoulder: nearly linear in the darks, never brighter than uPeak
  col = uPeak * (1.0 - exp(-col / uPeak));

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  // canvas output without an sRGB encode (host set a linear output): encode here
  if (uEncode > 0.5) gl_FragColor.rgb = skyEncodeSrgb(gl_FragColor.rgb);
  // triangular dither, one 8-bit step, in output space
  float dn = skyHash12(gl_FragCoord.xy) + skyHash12(gl_FragCoord.xy + 71.37) - 1.0;
  gl_FragColor.rgb += dn * (uDither / 255.0);
}
`}var Ke=[`#9fc0ff`,`#fff1dc`,`#c9d6ff`,`#ffd6a8`,`#eef0ff`,`#b8c8ff`],qe=[1,.72,.6,.5,.45,.4];function Je(e={}){let t=(e.seed??7)>>>0,n=Le(t*2654435761+1),r=[0,1,2,3,4].map(()=>He(n)),c={uGalaxy:{value:e.galaxy??1},uAurora:{value:e.aurora??0},uNebula:{value:e.nebula??0},uStars:{value:e.stars??1},uExposure:{value:e.exposure??1},uTime:{value:0},uHorizon:{value:e.horizon??0},uPeak:{value:e.peak??.82},uDpr:{value:1},uDither:{value:1},uEncode:{value:0},uAspect:{value:1},uSalt:{value:Math.floor(n()*16777215)},uSkyRot:{value:new g},uSeedOff:{value:new a(n()*97,n()*97,n()*97)},uGalPole:{value:new a(0,0,1)},uGalCore:{value:new a(1,0,0)},uGalShape:{value:new o(.085,.75,1,1)},uNebCenter:{value:new o(0,0,-1,.2)},uNebT1:{value:new o(1,0,0,Math.cos(.44))},uNebT2:{value:new o(0,1,0,0)},uAurFrame:{value:new o(0,1.4,1.8,1.35)},uAurShape:{value:new o(1,.36,.28,n()*6.283)},uQuiet:{value:new o(-1,-1,1,1)},uQuietK:{value:0},uHeroPos:{value:Array.from({length:Fe},()=>new o(0,0,0,1))},uHeroCol:{value:Array.from({length:Fe},()=>new o(1,1,1,0))}},u=Ze(e.tier??2),d=new s({name:`SkyMaterial`,vertexShader:We,fragmentShader:Ge(r),uniforms:c,defines:{TIER:u},depthTest:!1,depthWrite:!1,transparent:!1,toneMapped:!1,side:2}),p=new j;p.setAttribute(`position`,new x([-1,-1,0,3,-1,0,-1,3,0],3));let m=new f(p,d);m.name=`sky`,m.frustumCulled=!1,m.matrixAutoUpdate=!1,m.renderOrder=e.renderOrder??-1e6;let h=new l,_=[];for(let e=0;e<Fe;e++){let t=n()*2-1,r=n()*Math.PI*2,i=Math.sqrt(1-t*t);_.push({dir:new a(i*Math.cos(r),t,i*Math.sin(r)),flux:qe[e],color:Ke[e],size:.75+.45*qe[e]})}let v=_.map(()=>new a);function y(){for(let e=0;e<Fe;e++){let t=_[e];v[e].copy(t?t.dir:new a(0,1,0)).applyQuaternion(h);let n=c.uHeroCol.value[e];if(!t||!(t.flux>0)){n.set(0,0,0,0);continue}let r=ze(t.color||`#ffffff`);n.set(r[0],r[1],r[2],t.flux),c.uHeroPos.value[e].w=t.size??.75+.45*t.flux}}y();let b=new o,S=new a;function C(e){let t=e.projectionMatrix.elements,n=e.matrixWorldInverse.elements,r=200*c.uDpr.value;for(let e=0;e<Fe;e++){let i=c.uHeroPos.value[e];if(!(c.uHeroCol.value[e].w>0)){i.z=0;continue}let a=v[e];if(S.set(n[0]*a.x+n[4]*a.y+n[8]*a.z,n[1]*a.x+n[5]*a.y+n[9]*a.z,n[2]*a.x+n[6]*a.y+n[10]*a.z),S.z>-1e-4){i.z=0;continue}let o=(t[0]*S.x+t[8]*S.z)/-S.z,s=(t[5]*S.y+t[9]*S.z)/-S.z,l=b.x+(o*.5+.5)*b.z,u=b.y+(s*.5+.5)*b.w;i.x=l,i.y=u,i.z=+(l>b.x-r&&l<b.x+b.z+r&&u>b.y-r&&u<b.y+b.w+r)}}let w=Ye(e.pixelScale),T=new i;function E(e,t){return w===null?t?e.getPixelRatio():(e.getSize(T),T.x>=1?b.z/T.x:e.getPixelRatio()):w}m.onBeforeRender=(e,t,n)=>{e.getCurrentViewport(b);let r=e.getRenderTarget()===null;c.uDpr.value=E(e,r),c.uAspect.value=b.z/Math.max(1,b.w),c.uEncode.value=r&&N.getTransfer(e.outputColorSpace)===`linear`?1:0,c.uDither.value=+!!r,C(n)};let D={object3D:m,material:d,uniforms:c,get tier(){return u},get seed(){return t},setGalaxy(e){c.uGalaxy.value=Xe(e)},setAurora(e){c.uAurora.value=Xe(e)},setNebula(e){c.uNebula.value=Xe(e)},setStars(e){c.uStars.value=Xe(e)},setExposure(e){c.uExposure.value=Math.max(0,Number(e)||0)},setHorizon(e){c.uHorizon.value=Xe(e)},setPeak(e){c.uPeak.value=Math.max(.05,Number(e)||.82)},setTime(e){c.uTime.value=Number(e)||0},setQuietZone(e,t=1){if(!e){c.uQuietK.value=0;return}let n=Array.isArray(e)?e:[e.x0,e.y0,e.x1,e.y1];c.uQuiet.value.set(Math.min(n[0],n[2]),Math.min(n[1],n[3]),Math.max(n[0],n[2]),Math.max(n[1],n[3])),c.uQuietK.value=Xe(t)},setTier(e){if(!Number.isFinite(Number(e)))return;let t=Ze(e);t!==u&&(u=t,d.defines.TIER=t,d.needsUpdate=!0)},setSkyRotation(e){h.copy(e||new l);let t=h.clone().invert();c.uSkyRot.value.setFromMatrix4(new I().makeRotationFromQuaternion(t)),y()},setGalaxyFrame(e,t,n={}){let r=e.clone().normalize(),i=t.clone().addScaledVector(r,-t.dot(r));i.lengthSq()<1e-8&&i.set(1,0,0).addScaledVector(r,-r.x),i.normalize(),c.uGalPole.value.copy(r),c.uGalCore.value.copy(i);let a=c.uGalShape.value;n.width!=null&&(a.x=n.width),n.coreLength!=null&&(a.y=n.coreLength),n.dust!=null&&(a.w=n.dust)},setNebulaFrame(e,{radius:t=.2,roll:n=0}={}){let r=e.clone().normalize(),i=Math.abs(r.y)<.95?new a(0,1,0):new a(1,0,0),o=new a().crossVectors(i,r).normalize(),s=new a().crossVectors(r,o).normalize(),l=Math.cos(n),u=Math.sin(n),d=o.clone().multiplyScalar(l).addScaledVector(s,u),f=s.clone().multiplyScalar(l).addScaledVector(o,-u);c.uNebCenter.value.set(r.x,r.y,r.z,t),c.uNebT1.value.set(d.x,d.y,d.z,Math.cos(Math.min(2.2*t,1.35))),c.uNebT2.value.set(f.x,f.y,f.z,0)},setAuroraFrame(e={}){let t=c.uAurFrame.value,n=c.uAurShape.value;e.azimuth!=null&&(t.x=e.azimuth),e.distance!=null&&(t.y=e.distance),e.spacing!=null&&(t.z=e.spacing),e.span!=null&&(t.w=e.span),e.base!=null&&(n.x=e.base),e.decay!=null&&(n.y=e.decay),e.folds!=null&&(n.z=e.folds),e.phase!=null&&(n.w=e.phase)},setHeroStars(e){for(let t=0;t<Fe;t++)_[t]=e&&e[t]?{...e[t],dir:e[t].dir.clone().normalize()}:null;y()},setPixelScale(e){w=Ye(e)},applyPreset(e,t={}){return Pe(D,e,t)},clone(){let e=Je({seed:t,tier:u,renderOrder:m.renderOrder});for(let t of Object.keys(c)){let n=c[t].value,r=e.uniforms[t];Array.isArray(n)?n.forEach((e,t)=>r.value[t].copy(e)):n&&typeof n.copy==`function`?r.value.copy(n):r.value=n}return e.setSkyRotation(h),e.setHeroStars(_.map(e=>e?{...e}:null)),e.setPixelScale(w),e.object3D.layers.mask=m.layers.mask,e},dispose(){m.parent&&m.parent.remove(m),p.dispose(),d.dispose()}};return e.preset!=null&&D.applyPreset(e.preset,{view:e.view,layout:e.layout}),D}function Ye(e){let t=Number(e);return e!=null&&Number.isFinite(t)&&t>0?t:null}function Xe(e){let t=Number(e);return Number.isFinite(t)?Math.min(1,Math.max(0,t)):0}function Ze(e){let t=Math.round(Number(e));return Number.isFinite(t)?Math.min(3,Math.max(0,t)):2}var G=Math.PI/180,Qe=Math.PI*2;function $e(){let e=new Float64Array(16);return e[0]=e[5]=e[10]=e[15]=1,e}function et(e,t){let n=new Float64Array(16);for(let r=0;r<4;r++)for(let i=0;i<4;i++)n[r*4+i]=e[i]*t[r*4]+e[4+i]*t[r*4+1]+e[8+i]*t[r*4+2]+e[12+i]*t[r*4+3];return n}function tt(...e){let t=e[0];for(let n=1;n<e.length;n++)t=et(t,e[n]);return t}function K(e){let t=$e();return t[12]=e[0],t[13]=e[1],t[14]=e[2],t}function nt(e){let t=$e(),n=typeof e==`number`?[e,e,e]:e;return t[0]=n[0],t[5]=n[1],t[10]=n[2],t}function rt(e){let t=$e(),n=Math.cos(e),r=Math.sin(e);return t[0]=n,t[2]=-r,t[8]=r,t[10]=n,t}function it(e){let[t,n,r,i]=e,a=$e(),o=t+t,s=n+n,c=r+r,l=t*o,u=t*s,d=t*c,f=n*s,p=n*c,m=r*c,h=i*o,g=i*s,_=i*c;return a[0]=1-(f+m),a[1]=u+_,a[2]=d-g,a[4]=u-_,a[5]=1-(l+m),a[6]=p+h,a[8]=d+g,a[9]=p-h,a[10]=1-(l+f),a}function at(e,t=null,n=1){let r=t?it(t):$e();return n!==1&&(r=et(r,nt(n))),r[12]=e[0],r[13]=e[1],r[14]=e[2],r}function ot(e,t){return tt(K(e),nt(t),K([-e[0],-e[1],-e[2]]))}function st(e,t,n){return tt(K(e),it(ft(t,n)),K([-e[0],-e[1],-e[2]]))}function ct(e,t){let n=t[0],r=t[1],i=t[2];return[e[0]*n+e[4]*r+e[8]*i+e[12],e[1]*n+e[5]*r+e[9]*i+e[13],e[2]*n+e[6]*r+e[10]*i+e[14]]}function lt(e,t){let n=t[0],r=t[1],i=t[2];return[e[0]*n+e[4]*r+e[8]*i,e[1]*n+e[5]*r+e[9]*i,e[2]*n+e[6]*r+e[10]*i]}function ut(e){let t=e[0],n=e[1],r=e[2],i=e[4],a=e[5],o=e[6],s=e[8],c=e[9],l=e[10],u=l*a-o*c,d=-l*i+o*s,f=c*i-a*s,p=t*u+n*d+r*f;p=p?1/p:0;let m=[u*p,(-l*n+r*c)*p,(o*n-r*a)*p,d*p,(l*t-r*s)*p,(-o*t+r*i)*p,f*p,(-c*t+n*s)*p,(a*t-n*i)*p];return[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]]}function dt(e,t){let n=e[0]*t[0]+e[3]*t[1]+e[6]*t[2],r=e[1]*t[0]+e[4]*t[1]+e[7]*t[2],i=e[2]*t[0]+e[5]*t[1]+e[8]*t[2],a=Math.hypot(n,r,i)||1;return[n/a,r/a,i/a]}function ft(e,t){let n=Math.hypot(e[0],e[1],e[2])||1,r=Math.sin(t/2)/n;return[e[0]*r,e[1]*r,e[2]*r,Math.cos(t/2)]}function pt(e,t){let n=bt(e),r=bt(t),i=gt(n,r)+1,a;if(i<1e-8)i=0,a=Math.abs(n[0])>Math.abs(n[2])?[-n[1],n[0],0,i]:[0,-n[2],n[1],i];else{let e=_t(n,r);a=[e[0],e[1],e[2],i]}let o=Math.hypot(a[0],a[1],a[2],a[3]);return[a[0]/o,a[1]/o,a[2]/o,a[3]/o]}function mt(e,t){let[n,r,i,a]=e,[o,s,c,l]=t;return[n*l+a*o+r*c-i*s,r*l+a*s+i*o-n*c,i*l+a*c+n*s-r*o,a*l-n*o-r*s-i*c]}function ht(e,t,n){let r=Math.cos(e/2),i=Math.cos(t/2),a=Math.cos(n/2),o=Math.sin(e/2),s=Math.sin(t/2),c=Math.sin(n/2);return[o*i*a+r*s*c,r*s*a-o*i*c,r*i*c+o*s*a,r*i*a-o*s*c]}var gt=(e,t)=>e[0]*t[0]+e[1]*t[1]+e[2]*t[2],_t=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],vt=(e,t)=>[e[0]+t[0],e[1]+t[1],e[2]+t[2]],yt=(e,t)=>[e[0]*t,e[1]*t,e[2]*t];function bt(e){let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]}function xt(e,t,n){let r=bt(t),i=Math.cos(n),a=Math.sin(n),o=_t(r,e),s=gt(r,e)*(1-i);return[e[0]*i+o[0]*a+r[0]*s,e[1]*i+o[1]*a+r[1]*s,e[2]*i+o[2]*a+r[2]*s]}var St=e=>e<0?0:e>1?1:e,Ct=(e,t,n)=>e+(t-e)*n;function wt(e,t,n){let r=St((n-e)/(t-e));return r*r*(3-2*r)}var Tt=e=>{let t=St(e);return t<.5?4*t*t*t:1-(-2*t+2)**3/2},Et=e=>1-(1-St(e))**3;function Dt(e){let t=St(e);return 1+2.4*(t-1)**3+1.4*(t-1)**2}function Ot(e){let t=(e+Math.PI)%Qe;return t<0&&(t+=Qe),t-Math.PI}var kt=(e,t,n)=>e+Ot(t-e)*n,At=e=>[Math.cos(e),0,-Math.sin(e)],jt=(e,t)=>[e[0],t,-e[1]],Mt=Object.freeze([`about`,`projects`,`research`,`art`,`fun`,`blog`,`daily`]),Nt=-.62,Pt={top:0,bottom:-.52,radius:2.62,dialTop:.06,dialR:2.44},Ft={n:4,r:2.44,phase:45*G,radius:.15},It={ring:{r0:2.35,major:2.362,mid:2.385,minor:2.405,edge:2.43},numerals:{r:2.288,h:.07,every:30},screws:{n:6,r:2.135,phase:5*G,head:.042},guilloche:{r0:1.34,r1:2,n:7,lobes:72,amp:.012},label:{angle:-116*G,r:1.73,w:.62,h:.17}},q={module:.045,y0:.02,main:{z:48,thick:.07},idler:{z:24,thick:.07},pinion:{z:12,thick:.09}},Lt={idlerAngle:-40*G,pinionAngle:66*G},Rt=-28*G,zt={arm:.55,armY:.44},Bt=e=>2*Math.PI/e,Vt=e=>e-Math.floor(e);function Ht(e,t,n,r){let i=Vt((n-e)/Bt(t));return n+Math.PI+(i-.5)*Bt(r)}function Ut(e){let t=q.module,n=(q.main.z+q.idler.z)*t/2,r=(q.idler.z+q.pinion.z)*t/2,i=At(Lt.idlerAngle),a=[i[0]*n,0,i[2]*n],o=At(Lt.pinionAngle),s=[a[0]+o[0]*r,0,a[2]+o[2]*r],c=e,l=Ht(c,q.pinion.z,Lt.pinionAngle+Math.PI,q.idler.z),u=Ht(l,q.idler.z,Lt.idlerAngle+Math.PI,q.main.z),d=At(e),f=[s[0]+d[0]*zt.arm,0,s[2]+d[2]*zt.arm];return{main:{c:[0,0,0],rot:u},idler:{c:a,rot:l},pinion:{c:s,rot:c},crank:e,handle:f}}var Wt={main:q.pinion.z/q.main.z,celestial:1/16,arms:1/24,spin:[1/6,-1/7,1/8,-1/6.5,1/7.5,-1/9,1/5.5]},Gt=[{id:`about`,label:`About`,L:4.85,h:.95,r:.36,stem:.85,pattern:`rings`,Lr:1.45,stemR:.16,rAngle:225},{id:`projects`,label:`Projects`,L:2.3,h:2.3,r:.32,stem:.4,pattern:`grid`,Lr:1.2,stemR:.08,rAngle:140},{id:`research`,label:`Research`,L:2.9,h:1.85,r:.4,stem:.55,pattern:`contour`,Lr:1.3,stemR:.12,rAngle:315},{id:`art`,label:`Art`,L:3.35,h:1.625,r:.34,stem:1.15,pattern:`stipple`,Lr:1.35,stemR:.2,rAngle:175},{id:`fun`,label:`Fun`,L:3.8,h:1.4,r:.3,stem:.45,pattern:`spiral`,Lr:1.4,stemR:.1,rAngle:270},{id:`blog`,label:`Blog`,L:4.3,h:1.175,r:.37,stem:.8,pattern:`hatch`,Lr:1.45,stemR:.14,rAngle:345},{id:`daily`,label:`Daily`,L:2.6,h:2.075,r:.32,stem:.95,pattern:`dot`,Lr:1.25,stemR:.1,rAngle:40}],Kt=.4,qt={land:[196,168,305,190,246,15,28].map(e=>e*G),port:[289,165,268,295,250,62,33].map(e=>e*G)},Jt={land:{target:[0,2.4,0],az:-90,el:15,dist:16.3,fov:30,shift:[.09,-.035],size:[1440,900],hover:24,hoop:-8},port:{target:[0,1.9,0],az:-90,el:60,dist:17,fov:46,shift:[0,.12],size:[390,844],hover:12,hoop:-15}},Yt=Object.freeze([`land`,`port`]),Xt={root:.042,tip:.032,stem:[.03,.024],knuckle:.062,collar:[.15,.172]},Zt=Xt.collar[1]+.07,Qt={rings:0,spiral:1,stipple:2,contour:3,hatch:4,grid:5,dot:6},$t={scale:1.24,width:.034,thick:.018,yaw:128*G},en={r:.11,top:2.45,bottom:.125},J={c:[0,3.95,0],latitude:35.9*G,north:128*G,rings:[{kind:`meridian`,R:1.5,w:.1},{kind:`equator`,R:1.345,w:.088},{kind:`ecliptic`,R:1.19,w:.082},{kind:`colure`,R:1.04,w:.076}],thick:.03,horizon:{r0:1.525,r1:1.74,thick:.034},spider:{y:2.39,r:.3},posts:{n:4,r:.028},obliquity:23.44*G,colurePhase:50*G,sealedR:1.37,globeR:.3,beadR:.09,axisHalf:1.74};function tn(){let e=J,t=At(e.north),n=Math.cos(e.latitude),r=Math.sin(e.latitude),i=[t[0]*n,r,t[2]*n],a=Math.hypot(i[0],i[1],i[2]);return[i[0]/a,i[1]/a,i[2]/a]}var nn=()=>At(J.north+Math.PI/2);function rn(e,t){let n=J,r=At(n.north+45*G+e*90*G),i=(n.horizon.r0+n.horizon.r1)/2,a=n.spider.r+(i-n.spider.r)*Math.sin(t*Math.PI/2)**.8,o=n.c[1]-n.horizon.thick/2,s=n.spider.y+(o-n.spider.y)*t;return[r[0]*a,s,r[2]*a]}Object.freeze([`wheel`,`gears`,`base`,`column`,`rings`,`arms`,`spheres`]);var an=Object.freeze([{id:`wheel`,from:0,to:.08,parts:[`wheel`]},{id:`gears`,from:.08,to:.24,parts:[`idler`,`pinion`]},{id:`base`,from:.24,to:.36,parts:[`base`]},{id:`column`,from:.36,to:.46,parts:[`column`]},{id:`rings`,from:.46,to:.66,parts:[`meridian`,`horizon`,`equator`,`ecliptic`,`colure`,`globe`]},{id:`arms`,from:.66,to:.83,parts:Mt.map(e=>`arm:`+e)},{id:`spheres`,from:.83,to:1,parts:Mt.map(e=>`sphere:`+e)}]);function on(e,t,n,r){if(e>=1)return 1;if(n<=1)return St(e);let i=1/(n-(n-1)*r);return St((e-t*i*(1-r))/i)}function sn(e){let t=St(Number.isFinite(e)?e:0),n={};for(let e of an){let r=St((t-e.from)/(e.to-e.from)),i=e.id===`gears`?.3:.45;e.parts.forEach((t,a)=>{n[t]=on(r,a,e.parts.length,i)})}return n}var cn=[-38,-24,12,-12,0,24,38].map(e=>e*G);function ln(e,t=7){return Mt.map(n=>{let r=e(t,`instrument:tilt:`+n);return ht(-.5+r(),r()*Math.PI*2,-.45+.9*r())})}function un(e,t,n=[0,0,0,1]){let r=Gt[e],i=t.crank||0,a=St(t.contact||0),o=wt(.1,.8,a),s=Tt(St(t.arms||0)*(1-.35*o)),c=t.reveal||sn(t.build??1),l=c[`arm:`+r.id]??1,u=c[`sphere:`+r.id]??1,d=t.front??-Math.PI/2,f=St(t.hover&&t.hover[e]||0)*(1-a),p=t.viewport===`port`?`port`:`land`,m=Jt[p],h=r.rAngle*G,g=h+Ot(qt[p][e]-h),_=Ct(h+Wt.arms*i,g,s);_=kt(_,d+m.hover*G,f),_=kt(_,d+Math.PI+cn[e],o);let v=Ct(r.Lr,r.L,s),y=Ct(r.stemR,r.stem,s),b=Ct(r.r*Kt,r.r,s),x=Et(St(l*1.6)),S=Et(St(l*1.6-.6)),C=Zt,w=C+(v-C)*x,T=r.L-C-.04,E=Math.max((w-.04-C)/T,.001),D=r.stem-.05,O=Math.max((y-.05)*S,.001),k=r.h+.048+O+.002,A=w-r.L,j=k-(r.h+r.stem),M=Math.max(b/r.r*Dt(u),1e-4),N=r.r*$t.scale,P=kt(_+$t.yaw,d+m.hoop*G,f),F=P-_,I=[r.L,r.h+r.stem,0],ee=[$e(),ot([C,r.h,0],[E,1,1]),K([A,0,0]),et(K([A,0,0]),ot([r.L,r.h+.048,0],[1,O/D,1])),K([A,j,0]),tt(K([A,j,0]),K(I),rt(F),ot([0,0,0],M),K([-I[0],-I[1],-I[2]]))],L=rt(_),te=[w,k+M*N,0],ne=et(L,at(te,mt(n,ft([0,1,0],(Wt.spin[e]||0)*i)),M*r.r));return{id:r.id,angle:_,L:w,centre:ct(L,te),r:M*r.r,hoopR:M*N,bones:ee,group:L,sphere:ne,visible:l>0,sphereVisible:u>0,hoopYaw:P,hover:f}}function dn(e){let t=tn(),n=nn(),r=J;return{meridian:n,equator:t,ecliptic:xt(xt(t,n,r.obliquity),t,e),colure:xt(n,t,e+r.colurePhase),P:t}}var fn=e=>Wt.celestial*(e||0);function pn(e,t=null){let n=e.crank||0,r=sn(e.build??1),i=Ut(n),a=St(e.contact||0),o=fn(n),s=J.c,c=tn(),l={},u=Et(r.wheel);l.wheel=et(K([0,.3*(1-u),0]),rt(i.main.rot)),l.rule=K([0,.3*(1-u),0]);let d=Et(r.idler),f=At(Lt.idlerAngle);l.idler=tt(K([i.idler.c[0]+f[0]*1.1*(1-d),0,i.idler.c[2]+f[2]*1.1*(1-d)]),rt(i.idler.rot));let p=Et(r.pinion),m=At(Lt.pinionAngle);l.pinion=tt(K([i.pinion.c[0]+m[0]*1.1*(1-p),0,i.pinion.c[2]+m[2]*1.1*(1-p)]),rt(i.pinion.rot)),l.base=K([0,-1.6*(1-Tt(r.base)),0]);let h=Math.max(Tt(r.column),.001);l.column=ot([0,en.bottom,0],[1,h,1]);let g=Math.max(Et(r.meridian),.001);l.meridian=ot([0,en.top,0],g);let _=Math.max(Et(r.horizon),.001);l.horizon=ot([0,J.spider.y,0],_);let v=wt(0,.45,a),y=J.sealedR+.035,b=e=>1+v*(y/J.rings[e].R-1);l.equator=ot(s,Math.max(Et(r.equator),.001)*b(1));let x=st(s,c,o);l.celestial=x,l.ecliptic=et(x,ot(s,Math.max(Et(r.ecliptic),.001)*b(2))),l.colure=et(x,ot(s,Math.max(Et(r.colure),.001)*b(3))),l.globe=et(x,ot(s,Math.max(Dt(r.globe),.001)));let S=wt(.35,1,a),C=Ct(.025,Math.PI/2+.02,S),w=dn(o);return l.shell=at(s,null,J.sealedR),{reveal:r,train:i,tau:o,groups:l,arms:Gt.map((n,i)=>un(i,{...e,reveal:r},t?t[i]:void 0)),shell:{visible:S>0,sinBeta:Math.sin(Math.min(C,Math.PI/2)),full:C>=Math.PI/2,normals:[w.equator,w.ecliptic,w.colure],k:S},contact:a}}var mn=[0,-1],hn=class{constructor(){this.pos=[],this.nrm=[],this.hat=[],this.tik=[],this.idx=[],this.edges=[]}vertex(e,t,n,r){this.pos.push(e[0],e[1],e[2]),this.nrm.push(t[0],t[1],t[2]),this.hat.push(n[0],n[1]);let i=r||mn;return this.tik.push(i[0],i[1]),this.pos.length/3-1}tri(e,t,n){let r=this.pos,i=this.nrm,a=r[3*t]-r[3*e],o=r[3*t+1]-r[3*e+1],s=r[3*t+2]-r[3*e+2],c=r[3*n]-r[3*e],l=r[3*n+1]-r[3*e+1],u=r[3*n+2]-r[3*e+2],d=o*u-s*l,f=s*c-a*u,p=a*l-o*c;if(d*d+f*f+p*p<1e-18)return;let m=i[3*e]+i[3*t]+i[3*n],h=i[3*e+1]+i[3*t+1]+i[3*n+1],g=i[3*e+2]+i[3*t+2]+i[3*n+2];d*m+f*h+p*g<0?this.idx.push(e,n,t):this.idx.push(e,t,n)}quad(e,t,n,r){this.tri(e,t,n),this.tri(e,n,r)}edge(e,t,n,r){this.edges.push({a:e,b:t,nA:n,nB:r})}done(){return{pos:this.pos,nrm:this.nrm,hat:this.hat,tik:this.tik,idx:this.idx,edges:this.edges}}},gn=(e,t)=>Math.acos(Math.max(-1,Math.min(1,e[0]*t[0]+e[1]*t[1]))),_n=(e,t)=>{let n=Math.hypot(e,t)||1;return[e/n,t/n]},vn=Math.PI/180;function Y(e,t={}){let{seg:n=64,hatch:r=`auto`,smoothAngle:i=30,edgeAngle:a=24,tickBand:o=null,edges:s=!0}=t,c=new hn,l=e.length,u=[],d=[0];for(let t=0;t<l-1;t++){let n=e[t+1][0]-e[t][0],r=e[t+1][1]-e[t][1];u.push(_n(r,-n)),d.push(d[t]+Math.hypot(n,r))}for(let t=0;t<l-1;t++){let a=e[t],s=e[t+1];if(d[t+1]-d[t]<1e-7)continue;let f=[0,1].map(e=>{let n=e===0?t-1:t+1,r=u[t];return n>=0&&n<l-1&&gn(u[t],u[n])<i*vn&&(r=_n(u[t][0]+u[n][0],u[t][1]+u[n][1])),r}),p=s[0]-a[0],m=s[1]-a[1],h=r===`auto`?Math.abs(m)>=Math.abs(p)?`meridian`:`ring`:r,g=o&&Math.abs(p)<1e-6&&a[1]>=o[0]-1e-6&&s[1]<=o[1]+1e-6,_=c.pos.length/3;for(let e=0;e<=n;e++){let r=e/n,i=r*Math.PI*2,l=Math.cos(i),u=Math.sin(i);for(let e=0;e<2;e++){let n=e===0?a:s,i=f[e],p=e===0?d[t]:d[t+1],m=r*512,_=h===`meridian`?[m,p]:[p,m],v=g?[r,(o[1]-n[1])/(o[1]-o[0])]:null;c.vertex([n[0]*l,n[1],-n[0]*u],[i[0]*l,i[1],-i[0]*u],_,v)}}for(let e=0;e<n;e++){let t=_+e*2;c.quad(t,t+1,t+3,t+2)}}if(s)for(let t=1;t<l-1;t++){let r=e[t][0];if(r<.004)continue;let i=u[t-1],o=u[t];if(!(gn(i,o)<a*vn))for(let a=0;a<n;a++){let s=a/n*Math.PI*2,l=(a+1)/n*Math.PI*2,u=.5*(s+l),d=Math.cos(u),f=Math.sin(u);c.edge([r*Math.cos(s),e[t][1],-r*Math.sin(s)],[r*Math.cos(l),e[t][1],-r*Math.sin(l)],[i[0]*d,i[1],-i[0]*f],[o[0]*d,o[1],-o[0]*f])}}return c.done()}function yn(e){let t=0;for(let n=0,r=e.length;n<r;n++){let i=e[n],a=e[(n+1)%r];t+=i[0]*a[1]-a[0]*i[1]}return t*.5}function bn(e,t,n,r,i){let{hatchAngle:a=0,smoothAngle:o=35,capEdges:s=!0,polar:c=!1}=r||{},l=new hn,u=Math.cos(a),d=Math.sin(a),f=i(e[0],e.slice(1)),p=[];for(let t of e)for(let e of t)p.push(e);for(let e of[{z:n,n:[0,0,1]},{z:t,n:[0,0,-1]}]){let t=l.pos.length/3;for(let t of p){let n=c?[Math.hypot(t[0],t[1]),(Math.atan2(t[1],t[0])/(2*Math.PI)+.5)*512]:[t[0]*u+t[1]*d,-t[0]*d+t[1]*u];l.vertex([t[0],t[1],e.z],e.n,n,null)}for(let e of f)l.tri(t+e[0],t+e[1],t+e[2])}return e.forEach((e,r)=>{let i=e.length,a=(r===0?1:-1)*Math.sign(yn(e)),c=[];for(let t=0;t<i;t++){let n=e[t],r=e[(t+1)%i];c.push(_n(a*(r[1]-n[1]),-a*(r[0]-n[0])))}let u=0;for(let r=0;r<i;r++){let a=e[r],d=e[(r+1)%i],f=Math.hypot(d[0]-a[0],d[1]-a[1]),p=c[(r-1+i)%i],m=c[(r+1)%i],h=gn(c[r],p)<o*vn?_n(c[r][0]+p[0],c[r][1]+p[1]):c[r],g=gn(c[r],m)<o*vn?_n(c[r][0]+m[0],c[r][1]+m[1]):c[r],_=l.vertex([a[0],a[1],t],[h[0],h[1],0],[t,u],null),v=l.vertex([a[0],a[1],n],[h[0],h[1],0],[n,u],null),y=l.vertex([d[0],d[1],n],[g[0],g[1],0],[n,u+f],null),b=l.vertex([d[0],d[1],t],[g[0],g[1],0],[t,u+f],null);if(l.quad(_,v,y,b),s){let e=[c[r][0],c[r][1],0];l.edge([a[0],a[1],n],[d[0],d[1],n],[0,0,1],e),l.edge([a[0],a[1],t],[d[0],d[1],t],[0,0,-1],e)}u+=f}}),l.done()}function xn(e,t,n,r={}){let{seg:i=256,edges:a=!0}=r,o=new hn,s=-n/2,c=n/2,l=1024;for(let n of[{z:c,n:[0,0,1]},{z:s,n:[0,0,-1]}]){let r=o.pos.length/3;for(let r=0;r<=i;r++){let a=r/i,s=a*Math.PI*2,c=Math.cos(s),u=Math.sin(s);o.vertex([e*c,e*u,n.z],n.n,[e,a*l],[a,0]),o.vertex([t*c,t*u,n.z],n.n,[t,a*l],[a,1])}for(let e=0;e<i;e++){let t=r+e*2;o.quad(t,t+1,t+3,t+2)}}for(let n of[{R:e,sg:1},{R:t,sg:-1}]){let e=o.pos.length/3;for(let e=0;e<=i;e++){let t=e/i,r=t*Math.PI*2,a=Math.cos(r),u=Math.sin(r);o.vertex([n.R*a,n.R*u,s],[n.sg*a,n.sg*u,0],[s,t*l],null),o.vertex([n.R*a,n.R*u,c],[n.sg*a,n.sg*u,0],[c,t*l],null)}for(let t=0;t<i;t++){let n=e+t*2;o.quad(n,n+1,n+3,n+2)}}if(a)for(let n=0;n<i;n++){let r=n/i*Math.PI*2,a=(n+1)/i*Math.PI*2,l=.5*(r+a),u=Math.cos(l),d=Math.sin(l);for(let n of[e,t]){let t=n===e?1:-1;for(let e of[s,c])o.edge([n*Math.cos(r),n*Math.sin(r),e],[n*Math.cos(a),n*Math.sin(a),e],[0,0,e>0?1:-1],[t*u,t*d,0])}}return o.done()}function Sn(e=72,t=48){let n=new hn,r=[];for(let i=0;i<=t;i++){let a=i/t,o=[];for(let t=0;t<=e;t++){let r=t/e,i=-Math.cos(r*Math.PI*2)*Math.sin(a*Math.PI),s=Math.cos(a*Math.PI),c=Math.sin(r*Math.PI*2)*Math.sin(a*Math.PI);o.push(n.vertex([i,s,c],[i,s,c],[a*Math.PI,r*512],null))}r.push(o)}for(let i=0;i<t;i++)for(let a=0;a<e;a++){let e=r[i][a+1],o=r[i][a],s=r[i+1][a],c=r[i+1][a+1];i!==0&&n.tri(e,o,c),i!==t-1&&n.tri(o,s,c)}return n.done()}function Cn(e,t,n,r,i,a){let o=new hn,s=[e,t],c=[n,r],l=[i,a],u=[{n:[-1,0,0],q:(t,n)=>[e,t,n],A:c,Bv:l},{n:[1,0,0],q:(e,n)=>[t,e,n],A:c,Bv:l},{n:[0,-1,0],q:(e,t)=>[e,n,t],A:s,Bv:l},{n:[0,1,0],q:(e,t)=>[e,r,t],A:s,Bv:l},{n:[0,0,-1],q:(e,t)=>[e,t,i],A:s,Bv:c},{n:[0,0,1],q:(e,t)=>[e,t,a],A:s,Bv:c}];for(let e of u){let t=[];for(let[n,r]of[[0,0],[1,0],[1,1],[0,1]]){let i=e.q(e.A[n],e.Bv[r]);t.push(o.vertex(i,e.n,[e.Bv[r],e.A[n]],null))}o.quad(t[0],t[1],t[2],t[3])}let d=e=>[e,0,0],f=e=>[0,e,0],p=e=>[0,0,e],m=e=>e===0?-1:1;for(let u=0;u<2;u++)for(let h=0;h<2;h++)o.edge([e,c[u],l[h]],[t,c[u],l[h]],f(m(u)),p(m(h))),o.edge([s[u],n,l[h]],[s[u],r,l[h]],d(m(u)),p(m(h))),o.edge([s[u],c[h],i],[s[u],c[h],a],d(m(u)),f(m(h)));return o.done()}function wn(e,t,n,r={}){let{sides:i=12}=r,a=new hn,o=e.length,s=[0];for(let t=1;t<o;t++)s.push(s[t-1]+Math.hypot(e[t][0]-e[t-1][0],e[t][1]-e[t-1][1],e[t][2]-e[t-1][2]));let c=n,l=t=>{let n=e[Math.max(0,t-1)],r=e[Math.min(o-1,t+1)],i=[r[0]-n[0],r[1]-n[1],r[2]-n[2]],a=Math.hypot(i[0],i[1],i[2])||1;return[i[0]/a,i[1]/a,i[2]/a]},u=[];for(let n=0;n<o;n++){let r=l(n),o=[c[1]*r[2]-c[2]*r[1],c[2]*r[0]-c[0]*r[2],c[0]*r[1]-c[1]*r[0]],d=[];for(let r=0;r<=i;r++){let l=r/i*Math.PI*2,u=Math.cos(l),f=Math.sin(l),p=[o[0]*u+c[0]*f,o[1]*u+c[1]*f,o[2]*u+c[2]*f],m=t[n];d.push(a.vertex([e[n][0]+p[0]*m,e[n][1]+p[1]*m,e[n][2]+p[2]*m],p,[r/i*512,s[n]],null))}u.push(d)}for(let e=0;e<o-1;e++)for(let t=0;t<i;t++)a.quad(u[e][t],u[e][t+1],u[e+1][t+1],u[e+1][t]);return a.done()}function Tn(e){let t=e.pos.length/3,n=e.pos,r=e.nrm,i=new Map,a=new Float64Array(t),o=[];for(let e=0;e<t;e++){let t=Math.round(n[3*e]*1e4)+1e5+200001*(Math.round(n[3*e+1]*1e4)+1e5+200001*(Math.round(n[3*e+2]*1e4)+1e5));a[e]=t;let s=i.get(t);s===void 0&&(s=o.length,i.set(t,s),o.push(0,0,0),o.length=s+3),o[s]+=r[3*e],o[s+1]+=r[3*e+1],o[s+2]+=r[3*e+2]}let s=Array(t*3);for(let e=0;e<t;e++){let t=i.get(a[e]),n=o[t],c=o[t+1],l=o[t+2],u=Math.sqrt(n*n+c*c+l*l);u<1e-6?(s[3*e]=r[3*e],s[3*e+1]=r[3*e+1],s[3*e+2]=r[3*e+2]):(s[3*e]=n/u,s[3*e+1]=c/u,s[3*e+2]=l/u)}return s}function En(e,t){let n=ut(t),r=e.pos.length/3,i=e.pos,a=e.nrm,o=e.onrm,s=Array(r*3),c=Array(r*3),l=o?Array(r*3):null,[u,d,f,,p,m,h,,g,_,v,,y,b,x]=t,[S,C,w,T,E,D,O,k,A]=n;for(let e=0;e<r;e++){let t=i[3*e],n=i[3*e+1],r=i[3*e+2];s[3*e]=u*t+p*n+g*r+y,s[3*e+1]=d*t+m*n+_*r+b,s[3*e+2]=f*t+h*n+v*r+x;let j=a[3*e],M=a[3*e+1],N=a[3*e+2],P=S*j+T*M+O*N,F=C*j+E*M+k*N,I=w*j+D*M+A*N,ee=Math.sqrt(P*P+F*F+I*I)||1;c[3*e]=P/ee,c[3*e+1]=F/ee,c[3*e+2]=I/ee,l&&(j=o[3*e],M=o[3*e+1],N=o[3*e+2],P=S*j+T*M+O*N,F=C*j+E*M+k*N,I=w*j+D*M+A*N,ee=Math.sqrt(P*P+F*F+I*I)||1,l[3*e]=P/ee,l[3*e+1]=F/ee,l[3*e+2]=I/ee)}let j=e.edges.map(e=>({a:ct(t,e.a),b:ct(t,e.b),nA:dt(n,e.nA),nB:dt(n,e.nB)}));return{pos:s,nrm:c,onrm:l,hat:e.hat,tik:e.tik,idx:e.idx,edges:j}}function Dn(e,t=2){let n=e;for(let e=0;e<t;e++){let e=[],t=n.length;for(let r=0;r<t;r++){let i=n[r],a=n[(r+1)%t];e.push([.75*i[0]+.25*a[0],.75*i[1]+.25*a[1]]),e.push([.25*i[0]+.75*a[0],.25*i[1]+.75*a[1]])}n=e}return n}function On(e,t,n=0){let r=[];for(let i=0;i<t;i++){let a=n+i/t*Math.PI*2;r.push([e*Math.cos(a),e*Math.sin(a)])}return r}var kn=20*Math.PI/180,An=e=>Math.tan(e)-e;function jn(e,t,n={}){let{flankPts:r=7,tipPts:i=3,rootPts:a=4}=n,o=e*t/2,s=o*Math.cos(kn),c=o+t,l=o-1.25*t,u=Math.PI/(2*e),d=e=>e<=s?u+An(kn):u+An(kn)-An(Math.acos(s/e)),f=2*Math.PI/e,p=Math.max(l,s),m=e=>Math.sqrt(Math.max((e/s)**2-1,0)),h=m(p),g=m(c),_=[];l<s&&_.push(l);for(let e=0;e<r;e++){let t=h+(g-h)*e/(r-1);_.push(s*Math.sqrt(1+t*t))}let v=[],y=(e,t)=>v.push([e*Math.cos(t),e*Math.sin(t)]);for(let t=0;t<e;t++){let e=t*f,n=e-f+d(l),r=e-d(l);for(let e=1;e<a;e++)y(l,n+(r-n)*e/a);for(let t of _)y(t,e-d(t));for(let t=1;t<i;t++)y(c,e-d(c)+2*d(c)*t/i);for(let t=_.length-1;t>=0;t--)y(_[t],e+d(_[t]))}return{pts:v,r:o,ra:c,rf:l,rb:s}}function Mn(e,t,n,r,i={}){let{phase:a=0,arcPts:o=22,edgeStep:s=.03}=i,c=[];for(let i=0;i<e;i++){let l=a+i*2*Math.PI/e,u=l+2*Math.PI/e,d=[],f=[Math.cos(l),Math.sin(l)],p=[-Math.sin(l),Math.cos(l)],m=Math.sqrt(t*t-r*r),h=Math.sqrt(n*n-r*r),g=Math.max(2,Math.ceil((h-m)/s));for(let e=0;e<g;e++){let t=m+(h-m)*e/g;d.push([t*f[0]+r*p[0],t*f[1]+r*p[1]])}let _=l+Math.asin(r/n),v=u-Math.asin(r/n);for(let e=0;e<o;e++){let t=_+(v-_)*e/o;d.push([n*Math.cos(t),n*Math.sin(t)])}let y=[Math.cos(u),Math.sin(u)],b=[-Math.sin(u),Math.cos(u)];for(let e=0;e<g;e++){let t=h+(m-h)*e/g;d.push([t*y[0]-r*b[0],t*y[1]-r*b[1]])}let x=u-Math.asin(r/t),S=l+Math.asin(r/t),C=Math.max(4,Math.round(t/n*o));for(let e=0;e<C;e++){let n=x+(S-x)*e/C;d.push([t*Math.cos(n),t*Math.sin(n)])}c.push(d)}return c}var Nn={RULE:1,PLATE:2,GHOST:4},Pn=class{constructor(){this.a=[],this.b=[],this.na=[],this.nb=[],this.p=[],this.o=[]}get count(){return this.a.length/3}seg(e,t,n,r,i,a,o=!1,s=0){this.a.push(e[0],e[1],e[2]),this.b.push(t[0],t[1],t[2]),this.na.push(n[0],n[1],n[2]),this.nb.push(r[0],r[1],r[2]),this.p.push(i,a,+!!o,s),this.o.push(0,0)}addEdges(e,t,n,r,i=!1,a=0){let o=ut(t);for(let s of e)this.seg(ct(t,s.a),ct(t,s.b),dt(o,s.nA),dt(o,s.nB),n,r,i,a)}polyline(e,t,n,r={}){let{closed:i=!1,dash:a=0,normals:o=null,normal:s=null,accent:c=!1,code:l=0,maxLen:u=0}=r,d=e.length,f=i?d:d-1;for(let r=0;r<f;r++){if(a>0&&Math.floor(r/a)%2==1)continue;let i=e[r],f=e[(r+1)%d],p=o?o[r]:s||[0,0,0],m=u>0?Math.hypot(f[0]-i[0],f[1]-i[1],f[2]-i[2]):0,h=u>0?Math.max(1,Math.ceil(m/u)):1;for(let e=0;e<h;e++){let r=e/h,a=(e+1)/h,o=[i[0]+(f[0]-i[0])*r,i[1]+(f[1]-i[1])*r,i[2]+(f[2]-i[2])*r],s=[i[0]+(f[0]-i[0])*a,i[1]+(f[1]-i[1])*a,i[2]+(f[2]-i[2])*a];this.seg(o,s,p,p,t,n,c,l)}}}pattern(e,t,n,r,i={}){let{closed:a=!1,normal:o=null,phase:s=0,code:c=0}=i,l=a?[...e,e[0]]:e,u=t.reduce((e,t)=>e+t,0),d=s%u,f=e=>{let n=(e%u+u)%u;for(let e=0;e<t.length;e++){if(n<t[e])return e%2==0;n-=t[e]}return!1},p=o||[0,0,0];for(let e=0;e<l.length-1;e++){let t=l[e],i=l[e+1],a=Math.hypot(i[0]-t[0],i[1]-t[1],i[2]-t[2]);if(a<1e-9)continue;let o=Math.max(1,Math.ceil(a/(u/24)));for(let e=0;e<o;e++){let s=e/o,l=(e+1)/o;if(!f(d+a*(s+l)*.5))continue;let u=[t[0]+(i[0]-t[0])*s,t[1]+(i[1]-t[1])*s,t[2]+(i[2]-t[2])*s],m=[t[0]+(i[0]-t[0])*l,t[1]+(i[1]-t[1])*l,t[2]+(i[2]-t[2])*l];this.seg(u,m,p,p,n,r,!1,c)}d+=a}}order(e,t,n,r){let i=0,a=[];for(let n=e;n<t;n++){let e=Math.hypot(this.b[3*n]-this.a[3*n],this.b[3*n+1]-this.a[3*n+1],this.b[3*n+2]-this.a[3*n+2]);a.push(e),i+=e}let o=0;for(let s=e;s<t;s++){let t=a[s-e];this.o[2*s]=n+(r-n)*o/(i||1),o+=t,this.o[2*s+1]=n+(r-n)*o/(i||1)}}},Fn=Math.PI/180,In=(()=>{let e=23.44*Fn,t=.88,n=t/Math.tan(Math.PI/4+e/2),r=n*Math.tan(Math.PI/4-e/2),i=e=>e*q.module/2;return{eps:e,latitude:35.9*Fn,limbIn:t,rootR:i(q.main.z)-1.25*q.module,tipR:i(q.main.z)+q.module,Req:n,Rcnc:r,bore:.13,hubR:.215,ecl:{c:[0,(t-r)/2],rho:(t+r)/2,hw:.034},barHW:.022,scale:{r0:.895,minor:.935,mid:.958,major:.99},alidade:{len:.985,hw:.04,tipHW:.012,disc:.2,hole:.13,vaneAt:.6,vane:[.011,.052],thick:.014,vaneH:.07}}})();function Ln(e){return In.Req*Math.tan((90-e)*Fn/2)}function Rn(e,t){let n=Ln(t),r=Math.PI+e*Fn;return[n*Math.cos(r),n*Math.sin(r)]}function zn(e){let t=e*Fn,n=Math.asin(Math.sin(In.eps)*Math.sin(t))/Fn;return Rn(Math.atan2(Math.cos(In.eps)*Math.sin(t),Math.cos(t))/Fn,n)}var Bn=[{name:`Altair`,ra:297.7,dec:8.9,bend:1},{name:`Sadalmelik`,ra:331.4,dec:-.3,bend:-1},{name:`Markab`,ra:346.2,dec:15.2,bend:1},{name:`Arcturus`,ra:213.9,dec:19.2,bend:-1},{name:`Unukalhai`,ra:236.1,dec:6.4,bend:1},{name:`Algorab`,ra:187.5,dec:-16.5,bend:-1},{name:`Rigel`,ra:78.6,dec:-8.2,bend:-1},{name:`Sirius`,ra:101.3,dec:-16.7,bend:1},{name:`Procyon`,ra:114.8,dec:5.2,bend:-1},{name:`Alphard`,ra:142,dec:-8.7,bend:1},{name:`Menkar`,ra:45.6,dec:4.1,bend:1},{name:`Diphda`,ra:10.9,dec:-18,bend:-1}],Vn=(e,t)=>[e[0]-t[0],e[1]-t[1]],Hn=e=>Math.hypot(e[0],e[1]);function Un(e,t,n,r){let i=1-r;return[i*i*e[0]+2*i*r*t[0]+r*r*n[0],i*i*e[1]+2*i*r*t[1]+r*r*n[1]]}function Wn(e,t,n){let r=Vn(n,t),i=r[0]*r[0]+r[1]*r[1],a=i>0?((e[0]-t[0])*r[0]+(e[1]-t[1])*r[1])/i:0;return a=Math.max(0,Math.min(1,a)),[Math.hypot(e[0]-t[0]-r[0]*a,e[1]-t[1]-r[1]*a),a]}function Gn(e,t){let n=0,r=0;for(let t of e)n+=t[0],r+=t[1];n/=e.length,r/=e.length;let i=0;return e.forEach((e,a)=>i=Math.max(i,Math.hypot(e[0]-n,e[1]-r)+t[a])),{kind:`chain`,pts:e,hws:t,bc:[n,r],bR:i,sd(n){let r=n[0],i=n[1],a=1e9;for(let n=0;n+1<e.length;n++){let o=e[n][0],s=e[n][1],c=e[n+1][0]-o,l=e[n+1][1]-s,u=c*c+l*l,d=u>0?((r-o)*c+(i-s)*l)/u:0;d=d<0?0:d>1?1:d;let f=Math.sqrt((r-o-c*d)**2+(i-s-l*d)**2)-(t[n]+(t[n+1]-t[n])*d);f<a&&(a=f)}return a}}}function Kn(e,t,n,r=null,i=null){return{kind:`ring`,bc:e,bR:t+n,sd(a){let o=[a[0]-e[0],a[1]-e[1]];if(r!==null){let s=Math.atan2(o[1],o[0]);for(;s<r;)s+=2*Math.PI;for(;s>r+2*Math.PI;)s-=2*Math.PI;if(s>i){let o=[e[0]+t*Math.cos(r),e[1]+t*Math.sin(r)],s=[e[0]+t*Math.cos(i),e[1]+t*Math.sin(i)];return Math.min(Hn(Vn(a,o)),Hn(Vn(a,s)))-n}}return Math.abs(Math.hypot(o[0],o[1])-t)-n}}}function qn(e,t,n,r,i,a=16,o=null){let s=[],c=[];for(let l=0;l<=a;l++){let u=l/a;s.push(Un(e,t,n,u)),c.push(o?o(u):r+(i-r)*u)}return Gn(s,c)}function Jn(){let e=In,t=[];t.push(Kn([0,0],(e.bore+e.hubR)/2,(e.hubR-e.bore)/2)),t.push(Kn(e.ecl.c,e.ecl.rho,e.ecl.hw));let n=e.limbIn+.03,r=(e.bore+e.hubR)/2;t.push(Gn([[r,0],[n,0]],[e.barHW,e.barHW])),t.push(Gn([[-r,0],[-n,0]],[e.barHW,e.barHW])),t.push(Gn([[0,-r],[0,-n]],[.02,.02])),t.push(Kn([0,0],e.Req,.016,Math.PI,2*Math.PI));let i=t=>[e.ecl.c[0]+e.ecl.rho*Math.cos(t*Fn),e.ecl.c[1]+e.ecl.rho*Math.sin(t*Fn)],a=e=>[r*Math.cos(e*Fn),r*Math.sin(e*Fn)];t.push(qn(a(68),[.06,.6],i(52),.024,.02)),t.push(qn(a(112),[-.06,.6],i(128),.024,.02));let o=e=>[n*Math.cos(e*Fn),n*Math.sin(e*Fn)];return t.push(qn(o(214),[-.34,-.86],[0,-.66],.018,.018)),t.push(qn(o(326),[.34,-.86],[0,-.66],.018,.018)),t}function Yn(e,t){let n=1e9;for(let r of e){let e=t[0]-r.bc[0],i=t[1]-r.bc[1];Math.sqrt(e*e+i*i)-r.bR>n||(n=Math.min(n,r.sd(t)))}return n}var Xn=.17,Zn=e=>(.021+.013*Math.sin(Math.PI*Math.min(1,e*1.6)))*(1-e)**.85;function Qn(e){let t=[],n=In.limbIn,r=t=>Math.min(Yn(e,t),n-Math.hypot(t[0],t[1])),i=e=>{let t=1e-4,n=(r([e[0]+t,e[1]])-r([e[0]-t,e[1]]))/(2*t),i=(r([e[0],e[1]+t])-r([e[0],e[1]-t]))/(2*t),a=Math.hypot(n,i)||1;return[n/a,i/a]},a=(e,n)=>t.every(t=>t.prim.sd(e)>n);for(let e of Bn){let n=Rn(e.ra,e.dec),o=null;for(let e=0;e<120;e++){let t=e/120*Math.PI*2,s=[Math.cos(t),Math.sin(t)],c=0,l=null,u=!0;for(;c<.34;){let e=[n[0]+s[0]*c,n[1]+s[1]*c],t=r(e);if(t<.003){l=e;break}if(!a(e,.045)){u=!1;break}c+=Math.max(t*.8,.002)}if(!l||!u||c<.07)continue;let d=i(l),f=Math.abs(d[0]*s[0]+d[1]*s[1]),p=Math.abs(c-Xn)+.12*(1-f);(!o||p<o.score)&&(o={score:p,hit:l,d:s,tr:c})}if(!o)continue;let s=o.tr+.012,c=[o.hit[0]+o.d[0]*.012,o.hit[1]+o.d[1]*.012],l=[-o.d[0],-o.d[1]],u=null;for(let t of[e.bend,-e.bend,e.bend*.4,0]){let e=[-l[1]*t,l[0]*t],i=[(c[0]+n[0])/2+e[0]*s*.24,(c[1]+n[1])/2+e[1]*s*.24],o=qn(c,i,n,0,0,18,Zn),d=!0;for(let e=7;e<=18;e++){let t=o.pts[e];if(r(t)<o.hws[e]+.008||!a(t,o.hws[e]+.03)){d=!1;break}}if(d){u={C:i,prim:o};break}}u&&t.push({...e,tip:n,base:c,ctrl:u.C,prim:u.prim})}return t}var $n=[null,[3,0],[0,1],[3,1],[1,2],null,[0,2],[3,2],[2,3],[0,2],null,[1,2],[3,1],[0,1],[3,0],null],er=[[0,1,2,3],[3,0,1,2]],tr=[[3,0,1,2],[0,1,2,3]];function nr(e,t,n,r,i,a,o=0){let s=i+1,c=new Float64Array(s*(a+1));if(o>0){let l=Math.floor(i/4)+1,u=Math.floor(a/4)+1,d=new Float64Array(l*u);for(let i=0;i<u;i++)for(let a=0;a<l;a++)d[i*l+a]=e(t+a*4*r,n+i*4*r);let f=o*1.5;for(let o=0;o<=a;o++){let a=Math.min(u-1,Math.round(o/4)),p=(o-a*4)*r;for(let u=0;u<=i;u++){let i=Math.min(l-1,Math.round(u/4)),m=(u-i*4)*r,h=d[a*l+i],g=Math.hypot(m,p),_;_=Math.abs(h)-f*(g+r)>0?h>0?Math.abs(h)-f*g:-(Math.abs(h)-f*g):e(t+u*r,n+o*r),_===0&&(_=1e-12),c[o*s+u]=_}}}else for(let o=0;o<=a;o++)for(let a=0;a<=i;a++){let i=e(t+a*r,n+o*r);i===0&&(i=1e-12),c[o*s+a]=i}let l=(e,t)=>2*(t*s+e),u=(e,t)=>2*(t*s+e)+1,d=new Map,f=new Map,p=e=>{if(d.has(e))return;let i=e>>1,a=i%s,o=(i-a)/s,l=c[i],u=l/(l-(e&1?c[i+s]:c[i+1]));d.set(e,e&1?[t+a*r,n+(o+u)*r]:[t+(a+u)*r,n+o*r])},m=(e,t)=>{p(e),p(t),f.has(e)||f.set(e,[]),f.has(t)||f.set(t,[]),f.get(e).push(t),f.get(t).push(e)},h=[0,0,0,0];for(let e=0;e<a;e++)for(let t=0;t<i;t++){let n=c[e*s+t],r=c[e*s+t+1],i=c[(e+1)*s+t+1],a=c[(e+1)*s+t],o=n<0|(r<0)<<1|(i<0)<<2|(a<0)<<3;if(o===0||o===15)continue;h[0]=l(t,e),h[1]=u(t+1,e),h[2]=l(t,e+1),h[3]=u(t,e);let d=(n+r+i+a)/4,f=o===5?d<0?er[0]:er[1]:o===10?d<0?tr[0]:tr[1]:$n[o];for(let e=0;e<f.length;e+=2)m(h[f[e]],h[f[e+1]])}let g=new Set,_=[];for(let e of f.keys()){if(g.has(e))continue;let t=[],n=-1,r=e;for(;!g.has(r);){g.add(r),t.push(d.get(r));let e=f.get(r),i=e[0]===n?e[1]:e[0];if(n=r,r=i,r===void 0)break}t.length>2&&_.push(t)}return _}function rr(e){let t=0;for(let n=0,r=e.length;n<r;n++){let i=e[n],a=e[(n+1)%r];t+=i[0]*a[1]-a[0]*i[1]}return t/2}function ir(e,t){let n=e.length;if(n<8)return e;let r=0,i=-1;for(let t=0;t<n;t++){let n=Math.hypot(e[t][0]-e[0][0],e[t][1]-e[0][1]);n>i&&(i=n,r=t)}let a=e=>{if(e.length<3)return e;let n=e[0],r=e[e.length-1],i=0,o=0;for(let t=1;t<e.length-1;t++){let a=Wn(e[t],n,r)[0];a>i&&(i=a,o=t)}if(i<=t)return[n,r];let s=a(e.slice(0,o+1)),c=a(e.slice(o));return s.slice(0,-1).concat(c)},o=a(e.slice(0,r+1)),s=a(e.slice(r).concat([e[0]]));return o.slice(0,-1).concat(s.slice(0,-1))}function ar(e,t){let n=!1;for(let r of t)if(!(r.bbox&&(e[0]<r.bbox[0]||e[0]>r.bbox[2]||e[1]<r.bbox[1]||e[1]>r.bbox[3])))for(let t=0,i=r.length-1;t<r.length;i=t++){let a=r[t],o=r[i];a[1]>e[1]!=o[1]>e[1]&&e[0]<(o[0]-a[0])*(e[1]-a[1])/(o[1]-a[1])+a[0]&&(n=!n)}return n}function or(e){let t=1e9,n=1e9,r=-1e9,i=-1e9;for(let a of e)t=Math.min(t,a[0]),n=Math.min(n,a[1]),r=Math.max(r,a[0]),i=Math.max(i,a[1]);return e.bbox=[t,n,r,i],e}var sr=null;function cr(){if(sr)return sr;let e=In,t=Jn(),n=Qn(t),r=t.concat(n.map(e=>e.prim)),i=e=>Yn(r,e),a=(t,n)=>Math.max(Math.sqrt(t*t+n*n)-e.limbIn,-i([t,n])),o=.004,s=e.limbIn+.02,c=Math.ceil(2*s/o);return sr={holes:nr(a,-s,-s,o,c,c,1.3).filter(e=>Math.abs(rr(e))>.0012).map(e=>or(ir(e,7e-4))),pointers:n,prims:r,webSD:i},sr}function lr(e,t=0){let n=cr();if(!ar(e,n.holes))return!1;if(t<=0)return!0;let r=Math.hypot(e[0],e[1]);return r<In.bore?r<In.bore-t:n.webSD(e)>t&&r<In.limbIn-t}var ur=e=>{let t=In.alidade,n=t.tipHW+(t.hw-t.tipHW)*(1-Math.min(1,Math.abs(e)/t.len))**1.4;return Math.max(n,Math.sqrt(Math.max(0,t.disc*t.disc-e*e)))};function dr(){let e=In.alidade,t=[];for(let n=0;n<=40;n++){let r=-1+2*n/40;t.push(e.len*r)}for(let n=1;n<24;n++)t.push(-e.disc+2*e.disc*n/24);t.sort((e,t)=>t-e);let n=[[e.len+.03,0]];for(let e of t)n.push([e,ur(e)]);n.push([-e.len-.03,0]);for(let e=t.length-1;e>=0;e--)n.push([t[e],-ur(t[e])]);return n}function fr(e){let t=In.alidade,n=Math.abs(e[0]);if(n>t.len+.03)return!1;let r=n>t.len?t.tipHW*(1-(n-t.len)/.03):ur(n),i=Math.abs(n-t.vaneAt)<t.vane[0]&&Math.abs(e[1])<t.vane[1];return Math.abs(e[1])<r||i}function pr(e=10){let t=In,n=Math.sin(t.latitude),r=Math.cos(t.latitude),i=[];for(let a=-18;a<90;a+=e){if(a<0&&a!==-18)continue;let e=Math.sin(a*Fn),o=Math.cos(a*Fn);i.push({alt:a,c:[0,t.Req*r/(n+e)],r:t.Req*o/(n+e)})}return i}function mr(e,t,n,r=360){let i=[],a=[];for(let o=0;o<=r;o++){let s=o/r*Math.PI*2,c=[e[0]+t*Math.cos(s),e[1]+t*Math.sin(s)];n(c)?a.push(c):a.length&&(a.length>1&&i.push(a),a=[])}if(a.length>1&&i.push(a),i.length>1){let e=i[0],t=i[i.length-1];Math.hypot(e[0][0]-t[t.length-1][0],e[0][1]-t[t.length-1][1])<1e-9&&(i[0]=t.concat(e.slice(1)),i.pop())}return i}function hr(e,t={main:.065,idler:.055,pinion:.055}){let n=e=>e*q.module/2+q.module,r=[{c:e.main.c,r:n(q.main.z)+t.main},{c:e.idler.c,r:n(q.idler.z)+t.idler},{c:e.pinion.c,r:n(q.pinion.z)+t.pinion}],i=.12,a=(e,t)=>{let n=Math.max(i-Math.abs(e-t),0)/i;return Math.min(e,t)-n*n*i*.25},o=(e,t)=>{let n=1e9;for(let i of r)n=a(n,Math.hypot(e-i.c[0],t-i.c[2])-i.r);return n},s=.01,c=Math.min(...r.map(e=>e.c[0]-e.r))-.08,l=Math.min(...r.map(e=>e.c[2]-e.r))-.08,u=Math.max(...r.map(e=>e.c[0]+e.r))+.08,d=Math.max(...r.map(e=>e.c[2]+e.r))+.08,f=nr(o,c,l,s,Math.ceil((u-c)/s),Math.ceil((d-l)/s),1.1);return f.sort((e,t)=>Math.abs(rr(t))-Math.abs(rr(e))),{loop:or(ir(f[0],.0015)),field:o}}var gr={0:[[[.3,1],[.48,.9],[.55,.62],[.55,.38],[.48,.1],[.3,0],[.12,.1],[.05,.38],[.05,.62],[.12,.9],[.3,1]]],1:[[[.14,.78],[.32,1],[.32,0]],[[.14,0],[.5,0]]],2:[[[.08,.8],[.18,.95],[.32,1],[.48,.93],[.54,.76],[.48,.58],[.06,0],[.56,0]]],3:[[[.08,.9],[.26,1],[.46,.94],[.52,.78],[.44,.6],[.26,.53]],[[.26,.53],[.46,.46],[.54,.28],[.46,.08],[.28,0],[.06,.08]]],4:[[[.44,0],[.44,1],[.04,.32],[.58,.32]]],5:[[[.52,1],[.14,1],[.1,.56],[.3,.62],[.48,.54],[.55,.32],[.48,.1],[.3,0],[.08,.07]]],6:[[[.5,.92],[.32,1],[.14,.88],[.06,.55],[.08,.2],[.3,0],[.5,.12],[.54,.35],[.44,.55],[.26,.6],[.08,.45]]],7:[[[.06,1],[.56,1],[.24,0]]],8:[[[.3,.55],[.12,.66],[.12,.88],[.3,1],[.48,.88],[.48,.66],[.3,.55],[.08,.42],[.06,.16],[.3,0],[.54,.16],[.52,.42],[.3,.55]]],9:[[[.52,.55],[.34,.42],[.12,.48],[.06,.72],[.18,.95],[.36,1],[.52,.86],[.54,.5],[.46,.16],[.28,0],[.1,.06]]],R:[[[.08,0],[.08,1],[.38,1],[.52,.9],[.54,.72],[.42,.56],[.08,.54]],[[.32,.55],[.56,0]]],Z:[[[.08,1],[.54,1],[.06,0],[.56,0]]],M:[[[.04,0],[.04,1],[.3,.42],[.56,1],[.56,0]]],X:[[[.06,0],[.54,1]],[[.06,1],[.54,0]]],V:[[[.04,1],[.3,0],[.56,1]]],I:[[[.3,0],[.3,1]],[[.16,0],[.44,0]],[[.16,1],[.44,1]]],N:[[[.06,0],[.06,1],[.54,0],[.54,1]]],H:[[[.06,0],[.06,1]],[[.54,0],[.54,1]],[[.06,.52],[.54,.52]]],U:[[[.06,1],[.06,.26],[.16,.05],[.3,0],[.44,.05],[.54,.26],[.54,1]]],O:[[[.3,1],[.5,.88],[.56,.5],[.5,.12],[.3,0],[.1,.12],[.04,.5],[.1,.88],[.3,1]]],".":[[[.26,0],[.34,0],[.34,.08],[.26,.08],[.26,0]]],"·":[[[.26,.46],[.34,.46],[.34,.54],[.26,.54],[.26,.46]]],"-":[[[.12,.5],[.48,.5]]]},_r=.78;function vr(e,{tracking:t=0}={}){let n=[...e],r=_r+t,i=n.length*r-(r-.6),a=[];return n.forEach((e,t)=>{let n=gr[e];if(!n)return;let o=t*r-i/2;for(let e of n)a.push(e.map(([e,t])=>[o+e,t-.5]))}),{lines:a,width:i}}var yr=[0,1,0],br=[0,0,1],xr=[0,1,0],Sr=e=>ft(yr,e),Cr=()=>{let e=$e();return e[5]=0,e[6]=-1,e[9]=1,e[10]=0,e},wr={BARE:1,TICKS:2,ACCENT:4},X={metal:{v:0,albedo:1,hw:1.05},bronze:{v:1,albedo:1,hw:1.05},gear:{v:0,albedo:1,hw:1},astro:{v:0,albedo:1,hw:1,bare:!0},plinth:{v:1,albedo:.78,hw:.95,bare:!0,ticks:!0},dial:{v:0,albedo:.85,hw:.95,bare:!0},ring:{v:0,albedo:1,hw:.95,ticks:!0},hoop:{v:0,albedo:1,hw:1,ticks:!0,accent:!0},screw:{v:3,albedo:1,hw:1.05},handle:{v:0,albedo:1,hw:1.05,accent:!0},shell:{v:0,albedo:.95,hw:1}},Tr=e=>e.v+8*((e.bare?wr.BARE:0)+(e.ticks?wr.TICKS:0)+(e.accent?wr.ACCENT:0)),Z={big:1.5,mid:1.25,small:1,none:0},Er=class{constructor(e,t){this.id=e,this.stage=t,this.pieces=[],this.lines=new Pn,this.detail=new Pn,this.spheres=[]}add(e,t,n,r,i=.9,a=.7,o={}){let s=o.bone||0;this.pieces.push({geo:e,m:t,mat:n,hull:r,bone:s}),e.edges&&e.edges.length&&i>0&&this.lines.addEdges(e.edges,t,i,a,!!o.accent,(o.code||0)+8*s)}};function Dr(e){let t=0,n=0,r=!1;for(let i of e.pieces)t+=i.geo.pos.length/3,n+=i.geo.idx.length,i.bone&&(r=!0);let i=new Float32Array(t*3),a=new Float32Array(t*3),o=new Float32Array(t*2),s=new Float32Array(t*2),c=new Float32Array(t*4),l=new Float32Array(t*4),u=r?new Float32Array(t):null,d=new Uint32Array(n),f=0,p=0;for(let t of e.pieces){let e=t.geo,n=Tn(e),r=e.pos.length/3,m=Tr(t.mat),h=t.m,g=ut(h),_=e.pos,v=e.nrm;for(let d=0;d<r;d++){let r=f+d,p=_[3*d],y=_[3*d+1],b=_[3*d+2];i[3*r]=h[0]*p+h[4]*y+h[8]*b+h[12],i[3*r+1]=h[1]*p+h[5]*y+h[9]*b+h[13],i[3*r+2]=h[2]*p+h[6]*y+h[10]*b+h[14];let x=v[3*d],S=v[3*d+1],C=v[3*d+2],w=g[0]*x+g[3]*S+g[6]*C,T=g[1]*x+g[4]*S+g[7]*C,E=g[2]*x+g[5]*S+g[8]*C,D=Math.sqrt(w*w+T*T+E*E)||1;a[3*r]=w/D,a[3*r+1]=T/D,a[3*r+2]=E/D,x=n[3*d],S=n[3*d+1],C=n[3*d+2],w=g[0]*x+g[3]*S+g[6]*C,T=g[1]*x+g[4]*S+g[7]*C,E=g[2]*x+g[5]*S+g[8]*C,D=Math.sqrt(w*w+T*T+E*E)||1,l[4*r]=w/D,l[4*r+1]=T/D,l[4*r+2]=E/D,l[4*r+3]=t.hull,o[2*r]=e.hat[2*d],o[2*r+1]=e.hat[2*d+1],s[2*r]=e.tik[2*d],s[2*r+1]=e.tik[2*d+1],c[4*r]=m,c[4*r+1]=t.mat.albedo,c[4*r+2]=t.mat.hw,c[4*r+3]=1,u&&(u[r]=t.bone)}for(let t=0;t<e.idx.length;t++)d[p+t]=e.idx[t]+f;f+=r,p+=e.idx.length}return{position:i,normal:a,hatch:o,tick:s,mat:c,onormal:l,bone:u,index:d,triangles:n/3}}var Or=[[0,Pt.bottom],[2.54,Pt.bottom],[2.6,-.5],[2.62,-.47],[2.62,-.44],[2.55,-.415],[2.47,-.415],[2.47,-.395],[2.42,-.375],[2.42,-.365],[2.4,-.36],[2.4,-.22],[2.42,-.215],[2.42,-.13],[2.47,-.1],[2.5,-.05],[2.5,0],[0,0]],kr=[[0,en.bottom],[.21,en.bottom],[.21,.15],[.18,.175],[.15,.2],[.125,.25],[.11,.32],[.11,2.33],[.13,2.35],[.15,2.37],[.165,2.4],[.165,2.425],[.14,2.44],[.09,2.45],[0,2.45]],Ar=[[0,0],[.024,0],[.024,.03],[.038,.05],[.046,.08],[.046,.27],[.042,.31],[.032,.355],[.016,.375],[0,.38]],jr=[[0,Nt],[.14,Nt],[Ft.radius,Nt+.016],[Ft.radius,Pt.bottom-.028],[.148,Pt.bottom-.012],[.1,Pt.bottom-.008],[.1,Pt.bottom],[0,Pt.bottom]],Mr=(e,t)=>[[0,0],[e,0],[e,t*.4],[e*.8,t*.8],[e*.42,t],[0,t*1.02]],Nr=e=>Array.from({length:6},(t,n)=>[e*Math.cos(n*Math.PI/3+Math.PI/6),e*Math.sin(n*Math.PI/3+Math.PI/6)]);function Pr(e){let t=Math.max(0,Math.min(3,e.tier??3)),n=e.triangulate,r=[.45,.6,.8,1][t],i=e=>Math.max(8,Math.round(e*r)),a=12648430,o=e.rng||(()=>{a=a+1831565813>>>0;let e=a;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}),s=(e,t)=>e+(t-e)*o(),c={},l=(e,t)=>c[e]=new Er(e,t),u=Ut(0),d=q.y0,f=(e,t)=>Y(Mr(e,t),{seg:i(18),edges:!1}),p=(e,t,n,r,i,a=!1,o=0,s=0)=>e.polyline(t.map(e=>jt(e,n)),r,i,{closed:a,normal:xr,code:o,maxLen:s}),m=(e,t,n,r,i,a=-.08,o=0)=>{let s=bt(n),c=bt(_t(s,Math.abs(s[1])<.9?yr:[1,0,0])),l=_t(s,c),u=vt(yt(c,Math.cos(r)),yt(l,Math.sin(r)));e.seg(vt(t,yt(u,-i/2)),vt(t,yt(u,i/2)),s,s,1.15,a,!1,o)},h=(e,t,n,r,i,a,o,s=!1,c=.55,l=0)=>{let u=(i-r)*Math.tan(32*G)/n,d=ut(t);for(let f of[1,-1])for(let p=0;p<a;p++){let m=p/a*Math.PI*2,h=[],g=[];for(let e=0;e<=4;e++){let a=e/4,o=m+f*u*a;h.push(ct(t,[n*Math.cos(o),r+(i-r)*a,-n*Math.sin(o)])),g.push(dt(d,[Math.cos(o),0,-Math.sin(o)]))}e.polyline(h,c,o,{normals:g,accent:s,code:l})}},g=(e,t,r,i)=>{let{pts:a}=jn(e,q.module);return En(bn([a,...r],0,t,{hatchAngle:i,smoothAngle:32},n),Cr())},_=hr(u),v=cr();{let e=l(`base`,`base`);e.add(Y(Or,{seg:i(160),tickBand:[-.36,-.22]}),$e(),X.plinth,Z.big,.85,.6);let r=[On(Pt.dialR,i(220)).map(([e,t])=>[e,-t]),_.loop].map(e=>e.map(e=>[e[0],-e[1]]));e.add(En(bn(r,Pt.top,Pt.dialTop,{smoothAngle:40,polar:!0},n),Cr()),$e(),X.dial,Z.mid,.85,.75);let a=Pt.dialTop,o=It,c=e.lines,g=e.detail,v=(e,t=360)=>Array.from({length:t},(n,r)=>[e*Math.cos(r/t*Math.PI*2),e*Math.sin(r/t*Math.PI*2)]);p(c,v(o.ring.r0),a,.6,.5,!0),p(c,v(o.ring.edge),a,.55,.35,!0);for(let e=0;e<360;e+=2){let t=e*G,n=e%30==0?o.ring.major:e%10==0?o.ring.mid:o.ring.minor;p(c,[[n*Math.cos(t),n*Math.sin(t)],[o.ring.edge*Math.cos(t),o.ring.edge*Math.sin(t)]],a,e%10==0?.8:.55,e%30==0?.7:.42)}for(let e=0;e<360;e+=o.numerals.every){let t=e*G,n=[-Math.cos(t),-Math.sin(t)],r=[-Math.sin(t),Math.cos(t)],i=[o.numerals.r*Math.cos(t),o.numerals.r*Math.sin(t)],{lines:s}=vr(String(e)),l=o.numerals.h;for(let e of s)p(c,e.map(([e,t])=>[i[0]+(r[0]*e+n[0]*t)*l,i[1]+(r[1]*e+n[1]*t)*l]),a,.62,.55)}let y=o.label,b=[y.r*Math.cos(y.angle),y.r*Math.sin(y.angle)],x=[-Math.cos(y.angle),-Math.sin(y.angle)],S=[-Math.sin(y.angle),Math.cos(y.angle)],C=(e,t)=>[b[0]+S[0]*e+x[0]*t,b[1]+S[1]*e+x[1]*t],w=(e,t,n,r)=>Array.from({length:5},(i,a)=>{let o=n+a/4*(Math.PI/2);return C(e+r*Math.cos(o),t+r*Math.sin(o))}),T=y.w/2,E=y.h/2,D=.025,O=[...w(T-D,-E+D,-Math.PI/2,D),...w(T-D,E-D,0,D),...w(-T+D,E-D,Math.PI/2,D),...w(-T+D,-E+D,Math.PI,D)];e.add(En(bn([O],a,a+.012,{smoothAngle:50},n),Cr()),$e(),X.metal,Z.small,.75,.75);let k=a+.012,A=.016;p(c,[C(-T+A+.03,-E+A),C(T-A-.03,-E+A),C(T-A-.03,E-A),C(-T+A+.03,E-A)],k,.5,.5,!0);for(let[e,t,n]of[[`R. ZHU`,.026,.048],[`MMXXVI`,-.034,.036]]){let{lines:r}=vr(e,{tracking:.18});for(let e of r)p(c,e.map(([e,r])=>C(e*n,t+r*n)),k,.55,.72)}for(let t of[-1,1]){let n=C(t*(T-.03),0);e.add(f(.017,.01),K(jt(n,k)),X.screw,Z.small,0,0),m(c,jt(n,k+.0105),xr,s(0,Math.PI),.026)}for(let t=0;t<o.screws.n;t++){let n=o.screws.phase+t/o.screws.n*Math.PI*2,r=[o.screws.r*Math.cos(n),o.screws.r*Math.sin(n)];e.add(f(o.screws.head,.026),K(jt(r,a)),X.screw,Z.small,0,0),m(c,jt(r,a+.027),xr,s(0,Math.PI),o.screws.head*1.6)}if(t>=1){let e=o.guilloche,n=[.34,.24,.15,.06,-.95,-.8,-.62],r=e=>{if(_.field(e[0],-e[1])<.05)return!1;for(let t=0;t<o.screws.n;t++){let n=o.screws.phase+t/o.screws.n*Math.PI*2;if(Math.hypot(e[0]-o.screws.r*Math.cos(n),e[1]-o.screws.r*Math.sin(n))<.08)return!1}let t=[e[0]-b[0],e[1]-b[1]],n=t[0]*S[0]+t[1]*S[1],r=t[0]*x[0]+t[1]*x[1];return!(Math.abs(n)<T+.04&&Math.abs(r)<E+.04)},i=t>=2?e.n:4,s=t>=3?900:t>=2?720:480;for(let o=0;o<i;o++){let i=t>=2?o:o*2,c=e.r0+(e.r1-e.r0)*i/(e.n-1),l=[];for(let t=0;t<s;t++){let n=t/s*Math.PI*2,r=c+e.amp*Math.sin(e.lobes*n+i*.9);l.push([r*Math.cos(n),r*Math.sin(n)])}let u=[],d=()=>{u.length>1&&p(g,u,a,.55,n[i]),u=[]};for(let e=0;e<=s;e++){let t=l[e%s];r(t)?u.push(t):d()}d()}}for(let n=0;n<Ft.n;n++){let r=Ft.phase+n/Ft.n*Math.PI*2,a=at([Ft.r*Math.cos(r),0,-Ft.r*Math.sin(r)],Sr(r));e.add(Y(jr,{seg:i(32)}),a,X.bronze,Z.mid,.75,.7),t>=1&&h(g,a,Ft.radius+.0012,Nt+.024,Pt.bottom-.034,22,.45)}let j=Pt.top,M=e=>{let t=Math.hypot(e[0],e[1]);return t<In.limbIn-.01&&t>.29};for(let e of pr(10))for(let t of mr(e.c,e.r,M,300))p(c,t,j,e.alt===0?.65:.45,e.alt===0?.3:e.alt<0?-.7:.12);for(let e of[In.Req,In.Rcnc])for(let t of mr([0,0],e,M,240))p(c,t,j,.45,-.75);if(p(c,Array.from({length:200},(e,t)=>[In.limbIn*Math.cos(t/200*Math.PI*2),In.limbIn*Math.sin(t/200*Math.PI*2)]),j,.5,-.8,!0),t>=3){let e=.034,t=.046;for(let n=-60;n<=60;n++)for(let r=-60;r<=60;r++){let i=r*t+(n%2?t/2:0),a=n*t*.866;Math.hypot(i,a)<In.tipR+.05||_.field(i,a)>-.04||Math.hypot(i-u.idler.c[0],a-u.idler.c[2])<q.idler.z*q.module/2-.08||Math.hypot(i-u.pinion.c[0],a-u.pinion.c[2])<q.pinion.z*q.module/2-.06||p(g,Array.from({length:14},(t,n)=>[i+e*Math.cos(n/14*Math.PI*2),-a+e*Math.sin(n/14*Math.PI*2)]),j,.42,-.62,!0)}}let N=(e,t)=>Y([[e,0],[t,0],[t,d*.6],[t-.012,d],[e,d],[e,0]],{seg:i(48)});e.add(N(In.bore,.27),$e(),X.metal,Z.small,.7,.65),e.add(N(.03,.1),K([u.idler.c[0],0,u.idler.c[2]]),X.metal,Z.small,.7,.65),e.add(N(.03,.078),K([u.pinion.c[0],0,u.pinion.c[2]]),X.metal,Z.small,.7,.65)}{let e=l(`wheel`,`wheel`);e.add(g(q.main.z,q.main.thick,v.holes,28*G),K([0,d,0]),X.astro,Z.big,1,.85);let t=d+q.main.thick,n=e.lines,r=Nn.RULE,i=In.scale;p(n,Array.from({length:360},(e,t)=>[i.r0*Math.cos(t/360*Math.PI*2),i.r0*Math.sin(t/360*Math.PI*2)]),t,.5,.45,!0,r,.012);for(let e=0;e<360;e+=2){let a=e*G,o=e%30==0?i.major:e%10==0?i.mid:i.minor;p(n,[[i.r0*Math.cos(a),i.r0*Math.sin(a)],[o*Math.cos(a),o*Math.sin(a)]],t,e%10==0?.75:.5,e%30==0?.62:.38,!1,r,.012)}let a=In.ecl;for(let e=0;e<360;e+=10){let i=zn(e),o=[i[0]-a.c[0],i[1]-a.c[1]],s=Math.hypot(o[0],o[1]),c=e%30==0?.9:.5;p(n,[[a.c[0]+o[0]/s*(a.rho-a.hw*c),a.c[1]+o[1]/s*(a.rho-a.hw*c)],[a.c[0]+o[0]/s*(a.rho+a.hw*c),a.c[1]+o[1]/s*(a.rho+a.hw*c)]],t,.5,e%30==0?.5:.3,!1,r,.012)}for(let e=0;e<n.count;e++){let i=n.a[3*e+1],a=n.b[3*e+1];Math.abs(i-t)<1e-4&&Math.abs(a-t)<1e-4&&!(n.p[4*e+3]&r)&&(n.p[4*e+3]+=r)}}{let e=l(`rule`,`wheel`),t=d+q.main.thick,r=In.alidade,a=Sr(Rt),o=En(bn([dr(),On(r.hole,48).reverse()],0,r.thick,{hatchAngle:0,smoothAngle:30},n),Cr());e.add(o,at([0,t,0],a),X.metal,Z.mid,.9,.85);let s=it(a);for(let n of[1,-1]){let i=Cn(n*r.vaneAt-r.vane[0],n*r.vaneAt+r.vane[0],t+r.thick,t+r.thick+r.vaneH,-r.vane[1],r.vane[1]);e.add(i,s,X.metal,Z.small,.7,.75);for(let i of[1,-1]){let a=[],o=lt(s,[i,0,0]);for(let e=0;e<=12;e++){let o=e/12*Math.PI*2;a.push(ct(s,[n*r.vaneAt+i*(r.vane[0]+8e-4),t+r.thick+r.vaneH*.62+.012*Math.sin(o),.012*Math.cos(o)]))}e.lines.polyline(a,.6,.15,{normal:o})}}e.add(Y([[0,d],[r.hole-.002,d],[r.hole-.002,t+r.thick+.012],[.08,t+r.thick+.012],[.07,t+r.thick+.03],[.04,t+r.thick+.042],[0,t+r.thick+.045]],{seg:i(48)}),$e(),X.metal,Z.mid,.8,.75)}{let e=l(`idler`,`gears`),t=Mn(4,.16,.4,.04,{phase:.4}).map(e=>Dn(e,2));t.push(On(.05,24).reverse()),e.add(g(q.idler.z,q.idler.thick,t,-34*G),K([0,d,0]),X.gear,Z.big,1.05,.85),e.add(Y([[0,.09],[.11,.09],[.11,.105],[.08,.125],[.03,.135],[0,.137]],{seg:i(48)}),$e(),X.metal,Z.mid,.85,.7);for(let t=0;t<3;t++){let n=.3+t*2*Math.PI/3,r=[.135*Math.cos(n),.135*Math.sin(n)];e.add(f(.018,.01),K(jt(r,.09)),X.screw,Z.small,0,0),m(e.lines,jt(r,.1005),xr,n+.6,.028)}}{let e=l(`pinion`,`gears`);e.add(g(q.pinion.z,q.pinion.thick,[On(.036,24).reverse()],62*G),K([0,d,0]),X.gear,Z.big,1.05,.85),e.add(Y([[0,.02],[.036,.02],[.036,.395],[.062,.395],[.062,.4225],[.036,.4225],[.036,.4575],[.046,.4575],[.046,.483],[.035,.493],[0,.493]],{seg:i(40)}),$e(),X.metal,Z.mid,.8,.7);let t=d+q.pinion.thick;e.add(Y([[.04,t],[.078,t],[.078,t+.012],[.07,t+.02],[.058,t+.02],[.058,t+.012],[.04,t+.012],[.04,t]],{seg:i(40)}),$e(),X.metal,Z.small,.75,.75),e.add(Y([[.037,t+.012],[.057,t+.012],[.057,t+.017],[.05,t+.024],[.037,t+.025],[.037,t+.012]],{seg:i(40),edges:!1}),$e(),X.screw,Z.small,0,0);for(let n of[0,Math.PI]){let r=.7+n,i=[.125*Math.cos(r),.125*Math.sin(r)];e.add(f(.017,.01),K(jt(i,t)),X.screw,Z.small,0,0),m(e.lines,jt(i,t+.0105),xr,r+.9,.026)}{let t=zt.arm,r=.068,i=.048,a=[];for(let e=0;e<=14;e++){let t=Math.PI/2+Math.PI*e/14;a.push([r*Math.cos(t),r*Math.sin(t)])}for(let e=0;e<=14;e++){let n=-Math.PI/2+Math.PI*e/14;a.push([t+i*Math.cos(n),i*Math.sin(n)])}let o=En(bn([a],-.0175,.0175,{hatchAngle:Math.PI/2,smoothAngle:30},n),Cr());e.add(o,K([0,zt.armY,0]),X.metal,Z.big,.95,.8)}let r=En(bn([Nr(.06),On(.036,20).reverse()],0,.026,{smoothAngle:10},n),Cr());e.add(r,K([0,zt.armY+.0175,0]),X.metal,Z.small,.75,.75);let a=[zt.arm,zt.armY+.0175,0];e.add(Y([[.016,0],[.056,0],[.056,.008],[.016,.008],[.016,0]],{seg:i(40)}),K(a),X.metal,Z.small,.7,.7);let o=K([a[0],a[1]+.008,a[2]]);e.add(Y(Ar,{seg:i(40),hatch:`meridian`,smoothAngle:34}),o,X.handle,Z.mid,.9,.7,{accent:!0}),h(e.lines,o,.0465,.1,.25,16,.5,!0,.6)}let y=nn();{let e=l(`column`,`column`);e.add(Y(kr,{seg:i(56)}),$e(),X.bronze,Z.big,.85,.7),e.add(Y([[.13,.09],[.27,.09],[.27,.11],[.25,.125],[.13,.125],[.13,.09]],{seg:i(64)}),$e(),X.bronze,Z.mid,.85,.7);for(let t=0;t<3;t++){let n=.4+t*2*Math.PI/3,r=[.232*Math.cos(n),.232*Math.sin(n)];e.add(f(.013,.008),K(jt(r,.125)),X.screw,Z.small,0,0),m(e.lines,jt(r,.1335),xr,n+1.1,.02)}}let b=J.c,x=tn(),S=dn(0),C=(e,t,n,r=X.ring)=>{let a=J.rings[t];e.add(xn(a.R,a.R-a.w,J.thick,{seg:i(224)}),at(b,pt(br,n)),r,Z.mid,.95,.8)},w=e=>Y([[0,0],[e,0],[e*.92,e*.3],[e*.62,e*.62],[0,e*.75]],{seg:i(16),edges:!1}),T=(e,t,n,r,a,o,s)=>{for(let c of[1,-1]){let l=yt(bt(t),c),u=Y([[0,n],[a,n],[a,r],[0,r]],{seg:i(16),edges:!1});e.add(u,at(b,pt(yr,l)),X.metal,Z.small,0,0),e.add(w(a*1.45),at(vt(b,yt(l,o)),pt(yr,l)),X.metal,Z.small,0,0),e.add(w(a*1.3),at(vt(b,yt(l,s)),pt(yr,yt(l,-1))),X.metal,Z.small,0,0)}};{let e=l(`meridian`,`rings`);C(e,0,y);let t=it(Sr(J.north));e.add(Cn(-.15,.15,en.top-.035,en.top+.07,-.06,.06),t,X.bronze,Z.mid,.8,.75);let n=J.thick;for(let r of[1,-1]){let i=r>0?n/2+.002:-n/2-.028;e.add(Cn(-.1,.1,en.top+.07,en.top+.19,i,i+.026),t,X.bronze,Z.small,.7,.75)}let r=en.top+.13;e.add(Y([[0,-.05],[.016,-.05],[.016,.05],[0,.05]],{seg:i(16)}),at([0,r,0],pt(yr,y)),X.metal,Z.small,.6,.7);for(let t of[1,-1]){let n=vt([0,r,0],yt(y,t*.05));e.add(f(.022,.01),at(n,pt(yr,yt(y,t))),X.screw,Z.small,0,0),m(e.lines,vt(n,yt(y,t*.0105)),yt(y,t),.6,.032)}let a=J.rings[0],o=Y([[0,-.03],[.04,-.03],[.05,-.015],[.05,.015],[.04,.03],[0,.03]],{seg:i(24)});for(let t of[1,-1])e.add(o,at(vt(b,yt(x,t*(a.R-a.w/2))),pt(yr,x)),X.bronze,Z.small,.65,.7)}{let e=l(`horizon`,`rings`),n=J.horizon;e.add(xn(n.r1,n.r0,n.thick,{seg:i(240)}),at(b,pt(br,yr)),X.ring,Z.mid,.95,.8);let r=J.spider;e.add(Y([[.168,r.y-.03],[r.r+.05,r.y-.025],[r.r+.05,r.y+.005],[r.r,r.y+.02],[.168,r.y+.02],[.168,r.y-.03]],{seg:i(56)}),$e(),X.bronze,Z.mid,.8,.7);for(let n=0;n<J.posts.n;n++){let r=[],a=[];for(let e=0;e<=18;e++){let t=e/18;r.push(rn(n,t)),a.push(J.posts.r*(1+.55*Math.exp(-(((t-.16)/.07)**2))+.35*Math.exp(-(((t-.62)/.04)**2))-.15*t))}let o=At(J.north+45*G+n*90*G+Math.PI/2);e.add(wn(r,a,o,{sides:t>=2?12:8}),$e(),X.bronze,Z.small,0,0);let s=r[18];e.add(Y([[0,-.012],[.042,-.012],[.042,0],[.036,.008],[0,.008]],{seg:i(20)}),K([s[0],s[1]-.005,s[2]]),X.metal,Z.small,.6,.7)}let a=J.rings[0].R,o=it(Sr(J.north));for(let t of[1,-1]){let r=t>0?a-.03:-n.r0-.05,i=t>0?n.r0+.05:-a+.03,s=J.thick/2+.014;e.add(Cn(r,i,b[1]-n.thick/2-.01,b[1]+n.thick/2+.01,-s,s),o,X.bronze,Z.small,.7,.75)}}{let e=l(`equator`,`rings`);C(e,1,S.equator);let t=J.rings;T(e,_t(y,x),t[1].R-.01,t[0].R-.004,.02,t[0].R-.002,t[1].R-t[1].w+.002)}{let e=l(`ecliptic`,`rings`);C(e,2,S.ecliptic);let t=J.rings;T(e,_t(S.ecliptic,S.colure),t[3].R-.01,t[2].R-.004,.018,t[2].R-.002,t[3].R-t[3].w+.002)}C(l(`colure`,`rings`),3,S.colure);{let e=l(`globe`,`rings`),t=J.axisHalf,n=pt(yr,x);e.add(Y([[0,-t],[.02,-t],[.02,t],[0,t]],{seg:i(24),hatch:`meridian`,edges:!1}),at(b,n),X.metal,Z.small,0,0);let r=Y([[0,-.03],[.045,-.03],[.045,.03],[0,.03]],{seg:i(20)});for(let t of[1,-1])e.add(r,at(vt(b,yt(x,t*J.rings[3].R)),n),X.metal,Z.small,.6,.7);e.spheres.push({id:`globe`,pattern:Qt.grid,seed:7,n:24,matrix:at(b,n,J.globeR),r:J.globeR,hull:Z.big}),[1,-1].forEach((r,i)=>{let a=vt(b,yt(x,r*t));e.spheres.push({id:`bead`+i,pattern:Qt.rings,seed:3+i,n:12,matrix:at(a,n,J.beadR),r:J.beadR,hull:Z.mid})})}let E=Xt.collar,D=Y([[0,-.042],[E[0],-.042],[E[1],-.026],[E[1],.026],[E[0],.042],[0,.042]],{seg:i(48)}),O=Y([[0,0],[.056,0],[.056,.03],[.047,.07],[.047,.085],[0,.085]],{seg:i(24)}),k=Y([[0,-.05],[.042,-.05],[Xt.knuckle,-.028],[Xt.knuckle,.028],[.042,.05],[0,.05]],{seg:i(28)}),A=Y([[0,0],[.022,0],[.022,.03],[.018,.036],[0,.037]],{seg:i(14),edges:!1}),j=Y([[0,-.03],[.034,-.03],[.048,-.012],[.048,.008],[.04,.016],[0,.016]],{seg:i(24)}),M=Y([[0,0],[.02,0],[.028,.022],[.024,.044],[.011,.06],[0,.066]],{seg:i(24)}),N=[1,0,0],P=[0,0,1];return Gt.forEach(e=>{let t=l(`arm:`+e.id,`arms`);t.arm=e.id,t.add(D,K([0,e.h,0]),X.bronze,Z.mid,.75,.6,{bone:0}),t.add(A,at(vt(yt(P,E[1]-.004),[0,e.h,0]),pt(yr,P)),X.screw,Z.small,0,0,{bone:0}),m(t.lines,vt(yt(P,E[1]+.033),[0,e.h,0]),P,0,.03,-.08,0),t.add(O,at([E[1]-.01,e.h,0],pt(yr,N)),X.metal,Z.small,.7,.6,{bone:0});let n=e.L-Zt-.04;t.add(Y([[0,0],[Xt.root,0],[Xt.tip,n],[0,n]],{seg:i(20),hatch:`meridian`,edges:!1}),at([Zt,e.h,0],pt(yr,N)),X.metal,Z.small,0,0,{bone:1}),t.add(k,K([e.L,e.h,0]),X.metal,Z.small,.7,.6,{bone:2});let r=e.stem-.05;t.add(Y([[0,0],[Xt.stem[0],0],[Xt.stem[1],r],[0,r]],{seg:i(20),hatch:`meridian`,edges:!1}),K([e.L,e.h+.048,0]),X.metal,Z.small,0,0,{bone:3}),t.add(j,K([e.L,e.h+e.stem,0]),X.metal,Z.small,.65,.65,{bone:4});let a=e.r*$t.scale,o=[e.L,e.h+e.stem+a,0];t.add(xn(a,a-$t.width,$t.thick,{seg:i(128)}),at(o,pt(br,N)),X.hoop,Z.mid,.75,.75,{bone:5,accent:!0});let c=a-$t.width-e.r+.012,u=Y([[0,0],[.012,0],[.012,c],[0,c]],{seg:i(14),edges:!1});t.add(u,K([o[0],o[1]+e.r-.006,o[2]]),X.metal,Z.small,0,0,{bone:5}),t.add(u,at([o[0],o[1]-e.r+.006,o[2]],ft(br,Math.PI)),X.metal,Z.small,0,0,{bone:5}),t.add(M,K([o[0],o[1]+a-.004,o[2]]),X.metal,Z.small,.6,.6,{bone:5}),t.spheres.push({id:e.id,pattern:Qt[e.pattern],seed:Math.floor(s(1,90)),n:28,r:e.r,hull:Z.big})}),l(`shell`,`contact`).add(Sn(i(112),i(72)),$e(),X.shell,Z.big,0,0),{groups:c,tier:t,rete:v,pocket:_}}function Fr(e){let t=Ut(0);return e===`wheel`?rt(t.main.rot):e===`idler`?et(K(t.idler.c),rt(t.idler.rot)):e===`pinion`?et(K(t.pinion.c),rt(t.pinion.rot)):$e()}var Ir=55*Math.PI/180,Lr=[[0,0,1]];for(let e=0;e<6;e++){let t=e/6*Math.PI*2;Lr.push([Math.sin(Ir)*Math.cos(t),Math.sin(Ir)*Math.sin(t),Math.cos(Ir)])}var Rr=Lr.map(e=>e[2]),zr=Rr.reduce((e,t)=>e+t,0),Br=class e{constructor(e,t,n=112){let r=Math.max(t[0]-e[0],t[1]-e[1],t[2]-e[2],1e-6);this.cell=r/n;let i=2*this.cell;this.o=[e[0]-i,e[1]-i,e[2]-i],this.n=[0,1,2].map(n=>Math.ceil((t[n]-e[n]+2*i)/this.cell)+1),this.inv=1/this.cell,this.grid=new Uint8Array(this.n[0]*this.n[1]*this.n[2])}clone(){let t=Object.create(e.prototype);return Object.assign(t,this),t.grid=this.grid.slice(),t}index(e,t,n){let r=Math.floor((e-this.o[0])*this.inv),i=Math.floor((t-this.o[1])*this.inv),a=Math.floor((n-this.o[2])*this.inv),[o,s,c]=this.n;return r<0||i<0||a<0||r>=o||i>=s||a>=c?-1:(a*s+i)*o+r}splat(e){let t=e.pos,n=e.idx,r=.7*this.cell,i=this.grid;for(let e=0;e<n.length;e+=3){let a=3*n[e],o=3*n[e+1],s=3*n[e+2],c=t[a],l=t[a+1],u=t[a+2],d=t[o]-c,f=t[o+1]-l,p=t[o+2]-u,m=t[s]-c,h=t[s+1]-l,g=t[s+2]-u,_=Math.max(1,Math.ceil(Math.sqrt(d*d+f*f+p*p)/r)),v=Math.max(1,Math.ceil(Math.sqrt(m*m+h*h+g*g)/r));for(let e=0;e<=_;e++){let t=e/_,n=Math.floor((1-t)*v+1e-9);for(let e=0;e<=n;e++){let n=e/v,r=this.index(c+d*t+m*n,l+f*t+h*n,u+p*t+g*n);r>=0&&(i[r]=1)}}}}occlude(e,t,n=.8){let r=e.pos,i=e.nrm,a=this.grid,o=this.cell,s=[1*o,1.6*o,2.4*o,3.4*o],c=.75*o,l=r.length/3;for(let e=0;e<l;e++){let o=i[3*e],l=i[3*e+1],u=i[3*e+2],d=Math.hypot(o,l,u)||1;o/=d,l/=d,u/=d;let f,p,m;Math.abs(l)<.9?(f=-u,p=0,m=o):(f=0,p=u,m=-l);let h=Math.hypot(f,p,m)||1;f/=h,p/=h,m/=h;let g=l*m-u*p,_=u*f-o*m,v=o*p-l*f,y=r[3*e]+o*c,b=r[3*e+1]+l*c,x=r[3*e+2]+u*c,S=0;for(let e=0;e<Lr.length;e++){let t=Lr[e],n=f*t[0]+g*t[1]+o*t[2],r=p*t[0]+_*t[1]+l*t[2],i=m*t[0]+v*t[1]+u*t[2];for(let t=0;t<s.length;t++){let o=s[t],c=this.index(y+n*o,b+r*o,x+i*o);if(c>=0&&a[c]){S+=Rr[e]*(1-.6*(t/(s.length-1)));break}}}let C=1-S/zr*n;t[e]=Math.max(.2,Math.min(1,C))}}};function Vr(e){let t=[1/0,1/0,1/0],n=[-1/0,-1/0,-1/0];for(let r of e){let e=r.pos;for(let r=0;r<e.length;r+=3)for(let i=0;i<3;i++)e[r+i]<t[i]&&(t[i]=e[r+i]),e[r+i]>n[i]&&(n[i]=e[r+i])}return{min:t,max:n}}var Hr=`
uniform vec2 uRes;
uniform float uDpr;
uniform float uFootK;
uniform float uFootOrtho;
uniform float uRefDist;
uniform float uScale;
uniform mat4 uRootInv;
uniform vec2 uAcross;
`,Ur=`
uniform float uBrass;
uniform float uFarMetal;
uniform float uSpacing;
uniform float uInkScale;
uniform float uDarkScale;
uniform float uOutline;
uniform float uWidthK;
uniform vec2 uMacro;
uniform float uBevelW;
uniform float uBrush;
uniform vec2 uFog;
uniform vec3 uFogCol;
uniform float uTier;
uniform vec3 uNight;
uniform vec3 uStage;
uniform vec3 uInk;
uniform vec3 uMuted;
uniform vec3 uFaint;
uniform vec3 uLine;
uniform vec3 uShade;
uniform vec3 uMetal[4];
uniform vec4 uRough;
uniform vec3 uPatina;
`,Wr=`
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform float uKeyI;
uniform float uKeyPoint;
uniform vec3 uKeyPos;
uniform float uKeyRange;
uniform vec3 uSpotDir;
uniform vec2 uSpotCos;
uniform vec3 uFillDir;
uniform float uFillI;
uniform vec3 uFillCol;
uniform float uAmb;
uniform vec3 uAmbCol;
uniform float uRim;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uEnvRim;
`,Gr=`
// how far each layer is in, from uBrass
float metalK() { return smoothstep(0.35, 0.95, uBrass); }
float glintK() { return smoothstep(0.2, 0.9, uBrass); }
float inkK() { return 1.0 - smoothstep(0.25, 0.8, uBrass); }
`,Kr=`
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
`,qr=`
vec3 viewDirW(vec3 P) {
  return isOrthographic ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])) : normalize(cameraPosition - P);
}
vec3 keyDirAt(vec3 P) {
  return uKeyPoint > 0.5 ? normalize(uKeyPos - P) : uKeyDir;
}
// the key's falloff: a lamp loses light with distance and outside its cone
float keyAtt(vec3 P) {
  if (uKeyPoint < 0.5) return 1.0;
  vec3 d = uKeyPos - P;
  float l2 = max(dot(d, d), 1e-8);
  float att = uKeyRange * uKeyRange / (uKeyRange * uKeyRange + l2);
  float cone = smoothstep(uSpotCos.x, uSpotCos.y, dot(-d * inversesqrt(l2), uSpotDir));
  return att * cone;
}
// the engraving's tone in 0..1 (the approved toneAt, without the shadow map;
// baked occlusion takes its place in the crevices)
float toneAt(vec3 N, vec3 V, vec3 P, float albedo, float ao) {
  vec3 L = keyDirAt(P);
  float key = max(dot(N, L), 0.0) * keyAtt(P);
  float fill = max(dot(N, uFillDir), 0.0);
  float nv = clamp(dot(N, V), 0.0, 1.0);
  float rim = pow(1.0 - nv, 3.0);
  float t = uKeyI * key + uFillI * fill + uAmb + uRim * rim * (1.0 - key);
  t *= mix(0.6, 1.0, ao);
  return clamp(t * albedo, 0.0, 1.0);
}

// ---- metal ----
float D_aniso(float at, float ab, float NoH, float ToH, float BoH) {
  float a2 = at * ab;
  vec3 d = vec3(ab * ToH, at * BoH, a2 * NoH);
  float d2 = dot(d, d);
  float w2 = a2 / max(d2, 1e-9);
  return a2 * w2 * w2 * 0.3183099;
}
float V_smith(float a, float NoV, float NoL) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
vec3 F_schlick(vec3 F0, float VoH) {
  float f = pow(1.0 - VoH, 5.0);
  return F0 + (vec3(1.0) - F0) * f;
}
vec3 specLight(vec3 N, vec3 V, vec3 T, vec3 B, vec3 L, vec3 F0, float at, float ab, vec3 radiance) {
  float NoL = dot(N, L);
  if (NoL <= 0.0) return vec3(0.0);
  vec3 H = normalize(L + V);
  float NoV = max(dot(N, V), 1e-4);
  float NoH = max(dot(N, H), 0.0);
  float D = D_aniso(at, ab, NoH, dot(T, H), dot(B, H));
  float Vis = V_smith(sqrt(at * ab), NoV, NoL);
  vec3 F = F_schlick(F0, max(dot(V, H), 0.0));
  return min(D * Vis, 60.0) * F * NoL * radiance;
}
// a small procedural environment: ground below, sky above, a brighter band
// at the horizon (a window line), a soft strip toward the rim light; wider
// and softer for rougher metal
vec3 envColor(vec3 R, float rough) {
  float w = 0.06 + rough * 0.9;
  vec3 c = mix(uGround, uSky, smoothstep(-w, w, R.y));
  c += uSky * 0.55 * exp(-R.y * R.y / (0.008 + 0.3 * rough * rough));
  float rr = max(dot(R, uRimDir), 0.0);
  c += uEnvRim * pow(rr, mix(60.0, 3.0, rough)) * mix(2.2, 0.5, rough);
  vec3 Lk = uKeyDir;
  c += uKeyCol * 0.06 * pow(max(dot(R, Lk), 0.0), mix(40.0, 2.0, rough));
  return c;
}
vec3 envBRDF(vec3 F0, float rough, float NoV) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
  return F0 * AB.x + AB.y;
}
// Live metal: returns the body (environment, ambient) and the glints
// (analytic lights) separately so the blend can dim them at different rates.
// T runs along the machining grooves.
void metalShade(vec3 N, vec3 V, vec3 T, vec3 P, vec3 F0, vec3 F0g, float rough, float ao, out vec3 body, out vec3 glints) {
  vec3 B = normalize(cross(N, T));
  float a = max(rough * rough, 0.002);
  float at = max(a * 0.45, 0.002);
  float ab = max(a * 1.6, 0.004);
  vec3 Lk = keyDirAt(P);
  glints = specLight(N, V, T, B, Lk, F0g, at, ab, uKeyCol * keyAtt(P));
  glints += specLight(N, V, T, B, uRimDir, F0g, at * 1.6, ab * 1.6, uRimCol);
  glints += specLight(N, V, T, B, uFillDir, F0g, at * 3.0, ab * 3.0, uFillCol);
  glints *= mix(0.5, 1.0, ao);
  float NoV = clamp(dot(N, V), 1e-4, 1.0);
  // bend the reflection across the grooves (Filament's anisotropic lookup)
  vec3 aT = cross(T, V);
  vec3 aN = cross(aT, T);
  vec3 bent = normalize(mix(N, aN, 0.55 * clamp(5.0 * rough, 0.0, 1.0)));
  vec3 R = reflect(-V, bent);
  body = envColor(R, clamp(rough * 1.15, 0.03, 1.0)) * envBRDF(F0, rough, NoV) * mix(0.3, 1.0, ao);
  body += F0 * uAmbCol * uAmb * ao;
}
`,Jr=`
float markCov(float d, float spx, float hw) {
  float h = max(hw, 0.5);
  float c = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(hw * 2.0, 0.0, 1.0);
  float mean = clamp(2.0 * hw / max(spx, 1e-4), 0.0, 1.0);
  return mix(c, mean, 1.0 - smoothstep(2.4 * uDpr, 3.4 * uDpr, spx));
}
float lineSet(float u, float s, float g, float hw, float S) {
  float spx = s / max(g, 1e-9);
  float d = abs(fract(u / s + 0.5) - 0.5) * spx;
  float k = clamp(sqrt(spx / (1.5 * S)), 0.82, 1.22);
  return markCov(d, spx, hw * k);
}
float hatchOct(float u, float g, float S, float hw) {
  if (g < 1e-8) return 0.0;
  float L = log2(max(S * g, 1e-12));
  float Li = floor(L);
  float f = L - Li;
  float s = exp2(Li + 1.0);
  return mix(lineSet(u, s, g, hw, S), lineSet(u, 2.0 * s, g, hw, S), smoothstep(0.5, 1.0, f));
}
float tickMark(float u, float g, float t, float gt, float len, float hw) {
  float spx = 1.0 / max(g, 1e-9);
  float d = abs(fract(u + 0.5) - 0.5) * spx;
  float h = max(hw, 0.5);
  float c = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(hw * 2.0, 0.0, 1.0);
  float m = clamp((len - t) / gt + 0.5, 0.0, 1.0);
  return c * m * smoothstep(3.0 * uDpr, 5.0 * uDpr, spx);
}
`,Yr=`
attribute vec2 aHatch;
attribute vec2 aTick;
attribute vec4 aMat;
#ifdef BONES
attribute float aBone;
uniform mat4 uBones[6];
#endif
uniform mat4 uRootInv;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vLPos;
varying vec3 vLNrm;
varying vec3 vObj;
varying vec2 vHatch;
varying vec2 vTick;
varying vec4 vMat;
varying float vDist;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
#ifdef BONES
  mat4 Bm = uBones[int(aBone + 0.5)];
  p = Bm * p;
  n = mat3(Bm) * n;
#endif
  vec4 wp = modelMatrix * p;
  vWPos = wp.xyz;
  vWNrm = normalize(mat3(modelMatrix) * n);
  vLPos = (uRootInv * wp).xyz;
  vLNrm = normalize(mat3(uRootInv) * vWNrm);
  vObj = position;
  vHatch = aHatch;
  vTick = aTick;
  vMat = aMat;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`,Xr=`
${Hr}
${Ur}
${Wr}
${Gr}
${Kr}
${qr}
${Jr}
uniform float uAccentOn;
uniform vec3 uAccentCol;
#ifdef SHELL
uniform vec3 uBandN[3];
uniform float uBandS;
#endif
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vLPos;
varying vec3 vLNrm;
varying vec3 vObj;
varying vec2 vHatch;
varying vec2 vTick;
varying vec4 vMat;
varying float vDist;

// Near metal for the engraved look up close (approved materials.js): a clean
// tone ramp, brushing streaks along the part, an anisotropic sheen across them.
vec3 nearMetal(vec3 N, vec3 V, vec3 T, float tone, float sa, float sb, float sga, float acc) {
  float pa = 0.0009;
  float pl = 0.05;
  float n1 = vnoise(vec3(sa / pa, sb / pl, 3.1));
  float n2 = vnoise(vec3(sa / (pa * 0.37) + 17.0, sb / (pl * 0.55), 7.7));
  float f1 = smoothstep(1.3, 3.2, pa / sga);
  float f2 = smoothstep(1.3, 3.2, pa * 0.37 / sga);
  float br = ((n1 - 0.5) * f1 * 1.3 + (n2 - 0.5) * f2 * 0.7) * uBrush;
  vec3 lo = mix(uStage, mix(uNight, uLine, 0.7), smoothstep(0.0, 0.3, tone));
  vec3 metal = mix(lo, mix(uLine, uMuted, 0.3), smoothstep(0.25, 1.0, tone));
  metal *= 1.0 + 0.16 * br;
  float k = uKeyI * max(dot(N, keyDirAt(vWPos)), 0.0) * keyAtt(vWPos);
  vec3 Hk = normalize(keyDirAt(vWPos) + V);
  float tk = dot(T, Hk);
  float sk = pow(sqrt(max(1.0 - tk * tk, 0.0)), 72.0) * k;
  vec3 Hf = normalize(uFillDir + V);
  float tf = dot(T, Hf);
  float sf = pow(sqrt(max(1.0 - tf * tf, 0.0)), 20.0) * uFillI * max(dot(N, uFillDir), 0.0);
  float lobe = pow(max(dot(N, Hk), 0.0), 20.0) * k;
  float streak = clamp(1.0 + 0.9 * br, 0.2, 1.9);
  metal += uInk * ((0.3 * sk + 0.55 * sf) * streak + 0.1 * lobe);
  metal = mix(metal, uAccentCol * (0.3 + 0.7 * smoothstep(0.1, 0.9, tone)), 0.85 * acc);
  return metal;
}

void main() {
  float code = floor(vMat.x + 0.5);
  float variant = mod(code, 8.0);
  float flags = floor(code / 8.0 + 0.01);
  float fBare = mod(flags, 2.0);
  float fTicks = mod(floor(flags * 0.5 + 0.01), 2.0);
  float fAcc = mod(floor(flags * 0.25 + 0.01), 2.0);
  float albedo = vMat.y;
  float hwK = vMat.z;
  float ao = clamp(vMat.w, 0.0, 1.0);
  float acc = fAcc * uAccentOn;

  vec3 N = normalize(vWNrm);
  vec3 V = viewDirW(vWPos);
  vec3 NL = normalize(vLNrm);
  float tone = max(toneAt(N, V, vWPos, albedo, ao), 0.5 * acc);

  // every derivative, in uniform control flow
  vec3 dpx = dFdx(vWPos);
  vec3 dpy = dFdy(vWPos);
  vec3 dNx = dFdx(N);
  vec3 dNy = dFdy(N);
  vec2 dhx = vec2(dFdx(vHatch.x), dFdy(vHatch.x));
  vec2 dhy = vec2(dFdx(vHatch.y), dFdy(vHatch.y));
  bool bareFace = fBare > 0.5 && abs(NL.y) > 0.985;
  // bare faces show only hairlines in shadow, run 35 deg off the view
  vec2 gd = vec2(uAcross.x * 0.819 - uAcross.y * 0.574, uAcross.x * 0.574 + uAcross.y * 0.819);
  vec2 hp = vec2(dot(vLPos.xz, gd), dot(vLPos.xz, vec2(-gd.y, gd.x)));
  vec2 h = bareFace ? hp : vHatch;
  float gu = length(vec2(dFdx(h.x), dFdy(h.x)));
  float gv = length(vec2(dFdx(h.y), dFdy(h.y)));
  float ga = length(vec2(dFdx(vTick.x), dFdy(vTick.x)));
  float gt = max(length(vec2(dFdx(vTick.y), dFdy(vTick.y))), 1e-6);
#ifdef SHELL
  vec3 q = normalize(vObj);
  float bandM = min(min(abs(dot(q, uBandN[0])), abs(dot(q, uBandN[1]))), abs(dot(q, uBandN[2])));
  float bandW = max(fwidth(bandM), 1e-6);
#endif

  // the machining streaks' frame: T along the grooves; sa across them and
  // sb along them in instrument units, sga = units across per device px
  vec3 nf = cross(dpx, dpy);
  float det = max(dot(nf, nf), 1e-36);
  vec3 r1 = cross(dpy, nf);
  vec3 r2 = cross(nf, dpx);
  vec3 Gu = (dhx.x * r1 + dhx.y * r2) / det;
  vec3 Gv = (dhy.x * r1 + dhy.y * r2) / det;
  float sc = max(uScale, 1e-6);
  bool swap = length(Gu) * sc > 6.0;
  float ca = swap ? vHatch.y : vHatch.x;
  float cb = swap ? vHatch.x : vHatch.y;
  vec3 Ga = swap ? Gv : Gu;
  vec3 Gb = swap ? Gu : Gv;
  float la = max(length(Ga) * sc, 1e-6);
  float lb = max(length(Gb) * sc, 1e-6);
  float sa = ca / la;
  float sb = cb / lb;
  float sga = max(length(swap ? dhy : dhx) / la, 1e-9);
  vec3 T = Gb - N * dot(Gb, N);
  T = dot(T, T) > 1e-16 * dot(Gb, Gb) + 1e-30 ? normalize(T) : normalize(cross(N, vec3(0.31, 0.9, 0.29)));

  float iK = inkK();
  float mK = metalK();
  float gK = glintK();

  // graduations (ink in the engraving, grooves in the metal)
  float wmod = clamp(uRefDist / max(vDist, 1e-3), 0.7, 1.35);
  float cT = 0.0;
  if (fTicks > 0.5 && vTick.y >= 0.0) {
    float t = vTick.y;
    float a = vTick.x;
    float hwT = 0.5 * uDpr * wmod;
    float c = tickMark(a * 12.0, ga * 12.0, t, gt, 0.62, hwT * 1.3);
    c = max(c, tickMark(a * 36.0, ga * 36.0, t, gt, 0.42, hwT));
    c = max(c, tickMark(a * 180.0, ga * 180.0, t, gt, 0.24, hwT * 0.85));
    float dl = abs(t - 0.7) / gt;
    c = max(c, clamp(hwT * 0.8 + 0.5 - dl, 0.0, 1.0) * 0.8);
    cT = c;
  }

  // ---------------------------------------------------- engraved layer ---
  // (skipped once the metal covers it completely)
  vec3 colE = uNight;
  if (mK < 0.9995) {
    float S = uSpacing * uDpr;
    float hw = hwK * uDpr * wmod * smoothstep(0.1, 0.95, tone) * mix(0.3, 1.0, iK);
    float cu = bareFace ? 0.0 : hatchOct(h.x, gu, S, hw);
    float dark = (1.0 - smoothstep(0.03, 0.24, tone)) * uDarkScale;
    float hd = 0.5 * uDpr;
    float cd = max(hatchOct(h.x, gu, S, hd), hatchOct(h.y, gv, S, hd)) * dark;
    if (!bareFace) {
      float nv = clamp(dot(N, V), 0.0, 1.0);
      float graze = smoothstep(0.06, 0.3, nv);
      float meanU = clamp(2.0 * hw / (1.5 * S), 0.0, 1.0) * 0.75;
      cu = mix(meanU, cu, graze);
      cd *= graze;
    }
    vec3 fillCol = mix(uStage, uNight, smoothstep(0.0, 0.3, tone));
    if (bareFace) fillCol = mix(fillCol, uLine, 0.42 * smoothstep(0.3, 1.0, tone));
    vec3 inkCol = mix(uShade, uInk, smoothstep(0.35, 0.9, tone));
    inkCol = mix(inkCol, uAccentCol, acc);
    colE = fillCol;
    colE = mix(colE, uLine, cd * 0.9 * iK);
    colE = mix(colE, inkCol, cu * uInkScale * iK);
    // up close: machined metal instead of a wall of hatch lines
    float foot = uFootK * mix(vDist, 1.0, uFootOrtho) / sc;
    float macro = (1.0 - smoothstep(uMacro.x, uMacro.y, foot)) * iK;
    if (macro > 0.001) colE = mix(colE, nearMetal(N, V, T, tone, sa, sb, sga, acc), macro);
    float vis = 0.3 + 0.7 * smoothstep(0.04, 0.45, tone);
    vec3 tc = mix(uFaint, uInk, smoothstep(0.05, 0.6, tone));
    tc = mix(tc, uAccentCol, acc);
    colE = mix(colE, tc, cT * uInkScale * vis * iK);
  }

  // ------------------------------------------------------- metal layer ---
  vec3 col = colE;
  if (mK + gK > 0.0005) {
    int vi = int(variant + 0.5);
    vec3 F0 = uMetal[vi];
    float rough = uRough[vi];
    // tarnish: slow variation in colour and polish
    float tn = vnoise(vLPos * 2.3) * 0.6 + vnoise(vLPos * 7.1 + 3.7) * 0.4;
    F0 *= 0.9 + 0.2 * tn;
    rough = clamp(rough + (tn - 0.5) * 0.1, 0.05, 1.0);
    // patina in the crevices
    float pat = 1.0 - smoothstep(0.22, 0.75, ao);
    F0 = mix(F0, uPatina, pat * 0.75);
    rough = mix(rough, 0.62, pat);
    // turning and brushing streaks, each octave fading before it aliases
    float n1 = vnoise(vec3(sa / 0.0035, sb / 0.06, 3.1));
    float n2 = vnoise(vec3(sa / 0.0012 + 17.0, sb / 0.03, 7.7));
    float n3 = vnoise(vec3(sa / 0.02, sb / 0.4, 1.3));
    float f1 = smoothstep(1.3, 3.2, 0.0035 / sga);
    float f2 = smoothstep(1.3, 3.2, 0.0012 / sga);
    float f3 = smoothstep(1.3, 3.2, 0.02 / sga);
    float br = ((n1 - 0.5) * f1 * 1.2 + (n2 - 0.5) * f2 * 0.7 + (n3 - 0.5) * f3 * 0.8) * uBrush;
    F0 *= 1.0 + 0.12 * br;
    rough = clamp(rough + 0.06 * br, 0.04, 1.0);
    // from across a room (uFarMetal): widen each highlight by how much the normal turns
    // within a pixel (specular anti-aliasing), so rings a pixel or two wide read as solid
    // polished metal instead of a trail of sparkles
    float nVar = 0.15 * (dot(dNx, dNx) + dot(dNy, dNy));
    float aR = rough * rough;
    rough = mix(rough, sqrt(sqrt(aR * aR + min(2.0 * nVar, 0.2))), uFarMetal);
    F0 = mix(F0, uAccentCol, 0.8 * acc);
    // as the metal fades its highlights pale toward the ink
    float g = smoothstep(0.45, 1.0, uBrass);
    vec3 F0g = mix(vec3(dot(F0, vec3(0.3, 0.5, 0.2))) * 1.3, F0, g);
    vec3 body;
    vec3 glints;
    metalShade(N, V, T, vWPos, F0, F0g, rough, ao, body, glints);
    // graduations cut into the metal: dark grooves
    float groove = 1.0 - 0.8 * cT;
    body *= groove;
    glints *= groove;
    col = mix(col, body, mK) + glints * gK;
  }

#ifdef SHELL
  // a drawn edge along the closing border
  float edge = (1.0 - smoothstep(0.6 * uDpr, 1.8 * uDpr, (uBandS - bandM) / bandW)) * step(uBandS, 0.999);
  col = mix(col, mix(col * 2.0 + uMetal[0] * 0.1, uInk, iK), edge);
#endif
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
#ifdef SHELL
  if (bandM > uBandS) discard;
#endif
  gl_FragColor = vec4(col, 1.0);
}
`,Zr=`
${Hr}
${Ur}
${Wr}
${Gr}
${qr}
uniform int uPattern;
uniform float uPatN;
uniform float uPatMix;
uniform float uSeed;
uniform float uHW;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vLPos;
varying vec3 vLNrm;
varying vec3 vObj;
varying vec2 vHatch;
varying vec2 vTick;
varying vec4 vMat;
varying float vDist;

const float PI = 3.14159265359;

float markCov(float d, float spx, float hw) {
  float h = max(hw, 0.5);
  float c = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(hw * 2.0, 0.0, 1.0);
  float mean = clamp(2.0 * hw / max(spx, 1e-4), 0.0, 1.0);
  return mix(c, mean, 1.0 - smoothstep(2.4 * uDpr, 3.4 * uDpr, spx));
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float gnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(hash33(i + vec3(0.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3(0.0, 0.0, 0.0));
  float n100 = dot(hash33(i + vec3(1.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(hash33(i + vec3(0.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(hash33(i + vec3(1.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(hash33(i + vec3(0.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(hash33(i + vec3(1.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(hash33(i + vec3(0.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(hash33(i + vec3(1.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float field(vec3 p) {
  vec3 q = p * 1.35 + vec3(uSeed * 1.7, uSeed * 0.3, -uSeed);
  return gnoise(q) + 0.5 * gnoise(q * 2.03 + 11.0) + 0.22 * gnoise(q * 4.1 - 7.0);
}
vec2 lineFam(float u, float gu) {
  float spx = 1.0 / max(gu, 1e-9);
  return vec2(abs(fract(u + 0.5) - 0.5) * spx, spx);
}

// coverage of the ink marks (x) and of the shadow hairlines (y) at density n
vec2 pattern(float n, vec3 p, vec3 dpx, vec3 dpy, float gp, float theta, float phi, vec2 dtheta, vec2 dphi,
             float fv, vec2 dfv, float hw, float hd, float lit) {
  float cInk = 0.0;
  float cHair = 0.0;
  if (uPattern == 0) {
    float u = theta / PI * n;
    vec2 L = lineFam(u, length(dtheta) * n / PI);
    cInk = markCov(L.x, L.y, hw);
    cHair = markCov(L.x, L.y, hd);
  } else if (uPattern == 1) {
    float K = max(floor(n * 0.7 + 0.5), 5.0);
    float y = clamp(p.y, -0.9995, 0.9995);
    float merc = 0.5 * log((1.0 + y) / (1.0 - y));
    vec2 dm = vec2(dpx.y, dpy.y) / (1.0 - y * y);
    float u = K * (phi / (2.0 * PI) + 0.55 * merc);
    vec2 du = K * (dphi / (2.0 * PI) + 0.55 * dm);
    vec2 L = lineFam(u, length(du));
    cInk = markCov(L.x, L.y, hw);
    cHair = markCov(L.x, L.y, hd);
  } else if (uPattern == 2) {
    float M = max(n * 0.5, 4.0);
    vec3 q = p * M;
    vec3 ci = floor(q);
    float best = 1e9;
    for (int x = -1; x <= 1; x++) {
      for (int yy = -1; yy <= 1; yy++) {
        for (int z = -1; z <= 1; z++) {
          vec3 cell = ci + vec3(float(x), float(yy), float(z));
          vec3 pt = cell + 0.12 + 0.76 * hash33(cell + uSeed * 17.0);
          vec3 ps = normalize(pt) * M;
          if (all(greaterThanEqual(ps, cell)) && all(lessThan(ps, cell + 1.0))) {
            best = min(best, length(q - ps));
          }
        }
      }
    }
    float spx = 1.0 / (M * gp);
    float d = best * spx;
    float rad = spx * 0.36 * sqrt(lit);
    float h = max(rad, 0.55);
    cInk = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(rad * 1.8, 0.0, 1.0);
    cInk = mix(cInk, clamp(1.4 * rad * rad / (spx * spx), 0.0, 1.0), (1.0 - smoothstep(2.4 * uDpr, 3.6 * uDpr, spx)));
    cHair = clamp(0.55 + 0.5 - d, 0.0, 1.0) * smoothstep(2.4 * uDpr, 3.6 * uDpr, spx);
  } else if (uPattern == 3) {
    float levels = max(floor(n * 0.18), 4.0);
    float fu = (fv + 1.2) * levels;
    vec2 L = lineFam(fu, length(dfv) * levels);
    float idx = floor(fu + 0.5);
    float major = 1.0 - step(0.5, abs(mod(idx, 5.0)));
    cInk = markCov(L.x, L.y, hw * mix(1.0, 1.7, major));
    cHair = markCov(L.x, L.y, hd);
  } else if (uPattern == 4) {
    vec3 A = normalize(vec3(0.82, 0.35, 0.45));
    vec3 Bv = normalize(cross(A, vec3(0.0, 1.0, 0.0)));
    float k = n * 0.4;
    float u = dot(p, A) * k;
    float v = dot(p, Bv) * k;
    vec2 Lu = lineFam(u, length(vec2(dot(dpx, A), dot(dpy, A))) * k);
    vec2 Lv = lineFam(v, length(vec2(dot(dpx, Bv), dot(dpy, Bv))) * k);
    cInk = markCov(Lu.x, Lu.y, hw);
    cHair = max(markCov(Lu.x, Lu.y, hd), markCov(Lv.x, Lv.y, hd));
  } else if (uPattern == 5) {
    float Mm = max(floor(n * 0.4 + 0.5) * 2.0, 8.0);
    float Mp = max(floor(n * 0.4 + 0.5), 4.0);
    float um = (phi / (2.0 * PI) + 0.5) * Mm;
    float up = theta / PI * Mp;
    vec2 Lm = lineFam(um, length(dphi) * Mm / (2.0 * PI));
    vec2 Lp = lineFam(up, length(dtheta) * Mp / PI);
    float eq = 1.0 - step(0.5, abs(floor(up + 0.5) - Mp * 0.5));
    cInk = max(markCov(Lm.x, Lm.y, hw), markCov(Lp.x, Lp.y, hw * mix(1.0, 1.8, eq)));
    cHair = max(markCov(Lm.x, Lm.y, hd), markCov(Lp.x, Lp.y, hd));
  } else {
    float Nd = max(floor(n * 0.55), 5.0);
    float k = floor(theta / PI * Nd);
    float thk = (k + 0.5) * PI / Nd;
    float m = max(floor(2.0 * Nd * sin(thk) + 0.5), 1.0);
    float p01 = phi / (2.0 * PI) + 0.5 + mod(k, 2.0) * 0.5 / m;
    float j = floor(p01 * m);
    float dphiC = (p01 - (j + 0.5) / m) * 2.0 * PI;
    float dist = sqrt((theta - thk) * (theta - thk) + sin(theta) * sin(theta) * dphiC * dphiC);
    float spx = (PI / Nd) / gp;
    float d = dist / gp;
    float rad = spx * 0.4 * sqrt(lit);
    float h = max(rad, 0.55);
    cInk = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(rad * 1.8, 0.0, 1.0);
    cInk = mix(cInk, clamp(0.5 * rad * rad / (spx * spx), 0.0, 1.0), (1.0 - smoothstep(2.4 * uDpr, 3.6 * uDpr, spx)));
    cHair = clamp(0.6 + 0.5 - d, 0.0, 1.0) * smoothstep(2.4 * uDpr, 3.6 * uDpr, spx);
  }
  return vec2(cInk, cHair);
}

void main() {
  vec3 N = normalize(vWNrm);
  vec3 V = viewDirW(vWPos);
  float tone = toneAt(N, V, vWPos, 1.0, 1.0);

  vec3 p = normalize(vObj);
  vec3 dpx = dFdx(p);
  vec3 dpy = dFdy(p);
  vec3 dNx = dFdx(N);
  vec3 dNy = dFdy(N);
  float gp = max(max(length(dpx), length(dpy)), 1e-7);
  float rxz0 = length(p.xz);
  float rxz = max(rxz0, 1e-5);
  float theta = atan(rxz, p.y);
  vec2 pxz = rxz0 > 1e-6 ? p.xz : vec2(1.0, 0.0);
  float phi = atan(pxz.y, pxz.x);
  float rr = p.x * p.x + p.z * p.z + 1e-9;
  vec2 dphi = vec2(p.x * dpx.z - p.z * dpx.x, p.x * dpy.z - p.z * dpy.x) / rr;
  vec2 dtheta = vec2(dFdx(theta), dFdy(theta));
  float fv = 0.0;
  vec2 dfv = vec2(0.0);
  if (uPattern == 3) {
    fv = field(p);
    dfv = vec2(dFdx(fv), dFdy(fv));
  }

  float iK = inkK();
  float mK = metalK();
  float gK = glintK();
  float wmod = clamp(uRefDist / max(vDist, 1e-3), 0.7, 1.35);
  float lit = smoothstep(0.1, 0.95, tone);
  float hw = uHW * uDpr * wmod * lit * mix(0.3, 1.0, iK);
  float hd = 0.5 * uDpr;
  // the brass inlay keeps a constant width; it does not follow the light
  float hwB = 0.55 * uDpr * wmod;
  float litB = 0.7;

  vec2 c = pattern(uPatN, p, dpx, dpy, gp, theta, phi, dtheta, dphi, fv, dfv, hw, hd, lit);
  vec2 cB = pattern(uPatN, p, dpx, dpy, gp, theta, phi, dtheta, dphi, fv, dfv, hwB, hd, litB);
  if (uPatMix > 0.001) {
    vec2 c2 = pattern(uPatN * 2.0, p, dpx, dpy, gp, theta, phi, dtheta, dphi, fv, dfv, hw, hd, lit);
    vec2 cB2 = pattern(uPatN * 2.0, p, dpx, dpy, gp, theta, phi, dtheta, dphi, fv, dfv, hwB, hd, litB);
    c = mix(c, c2, uPatMix);
    cB = mix(cB, cB2, uPatMix);
  }

  float dark = (1.0 - smoothstep(0.04, 0.3, tone)) * uDarkScale;
  vec3 fillCol = mix(uStage, uNight, smoothstep(0.0, 0.3, tone));
  vec3 inkCol = mix(uShade, uInk, smoothstep(0.35, 0.9, tone));
  vec3 col = fillCol;
  col = mix(col, uLine, c.y * dark * iK);
  col = mix(col, inkCol, c.x * uInkScale * iK);

  if (mK + gK > 0.0005) {
    // blued steel inlaid with brass along the engraving
    float inlay = clamp(cB.x * 1.2, 0.0, 1.0);
    vec3 F0 = mix(uMetal[3], uMetal[0], inlay);
    float rough = mix(uRough.w, uRough.x, inlay);
    // from across a room: specular anti-aliasing, as the solid parts (small beads stay round, not a sparkle)
    float nVar = 0.15 * (dot(dNx, dNx) + dot(dNy, dNy));
    float aR = rough * rough;
    rough = mix(rough, sqrt(sqrt(aR * aR + min(2.0 * nVar, 0.2))), uFarMetal);
    float g = smoothstep(0.45, 1.0, uBrass);
    vec3 F0g = mix(vec3(dot(F0, vec3(0.3, 0.5, 0.2))) * 1.3, F0, g);
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-4, 0.0, 0.0));
    vec3 body;
    vec3 glints;
    metalShade(N, V, T, vWPos, F0, F0g, rough, 1.0, body, glints);
    col = mix(col, body, mK) + glints * gK;
  }
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
  gl_FragColor = vec4(col, 1.0);
}
`,Qr=`
attribute vec4 aOnormal;
attribute vec4 aMat;
#ifdef BONES
attribute float aBone;
uniform mat4 uBones[6];
#endif
uniform vec2 uRes;
uniform float uDpr;
uniform float uWidthK;
uniform float uRefDist;
uniform float uBrass;
varying float vDist;
varying float vTone;
varying float vAcc;
varying vec3 vObj;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 on = aOnormal.xyz;
#ifdef BONES
  mat4 Bm = uBones[int(aBone + 0.5)];
  p = Bm * p;
  on = mat3(Bm) * on;
#endif
  vObj = position;
  vec4 mv = modelViewMatrix * p;
  vec3 n = normalize(normalMatrix * on);
  vDist = length(mv.xyz);
  vec4 c0 = projectionMatrix * mv;
  vec4 c1 = projectionMatrix * vec4(mv.xyz + n * (0.01 * max(-mv.z, 0.01)), 1.0);
  vec2 s0 = c0.xy / c0.w;
  vec2 s1 = c1.xy / c1.w;
  vec2 dpx = (s1 - s0) * uRes;
  float l = length(dpx);
  vec2 dir = l > 1e-6 ? dpx / l : vec2(0.0);
  // outlines grow in with the ink as the brass fades
  float ik = 1.0 - smoothstep(0.25, 0.8, uBrass);
  float w = aOnormal.w * uWidthK * uDpr * clamp(uRefDist / max(vDist, 1e-3), 0.6, 1.4) * ik;
  c0.xy += dir * w * 2.0 / uRes * c0.w;
  gl_Position = c0;
  float code = floor(aMat.x + 0.5);
  vAcc = mod(floor(floor(code / 8.0 + 0.01) * 0.25 + 0.01), 2.0);
  vTone = clamp((aOnormal.w - 1.0) / 0.5, 0.0, 1.0);
}
`,$r=`
uniform vec3 uNight;
uniform vec3 uInk;
uniform vec3 uMuted;
uniform vec3 uFogCol;
uniform vec2 uFog;
uniform float uOutline;
uniform float uAccentOn;
uniform vec3 uAccentCol;
#ifdef SHELL
uniform vec3 uBandN[3];
uniform float uBandS;
#endif
varying float vDist;
varying float vTone;
varying float vAcc;
varying vec3 vObj;
void main() {
  vec3 c = mix(uMuted, uInk, mix(0.8, 1.0, vTone));
  float k = uOutline;
  float a = vAcc * uAccentOn;
  c = mix(c, uAccentCol, a);
  k = mix(k, 1.0, a);
  c = mix(uNight, c, k);
  c = mix(c, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
#ifdef SHELL
  vec3 q = normalize(vObj);
  float bandM = min(min(abs(dot(q, uBandN[0])), abs(dot(q, uBandN[1]))), abs(dot(q, uBandN[2])));
  if (bandM > uBandS) discard;
#endif
  gl_FragColor = vec4(c, 1.0);
}
`,ei=`
attribute vec3 iA;
attribute vec3 iB;
attribute vec3 iNA;
attribute vec3 iNB;
attribute vec4 iP;
#ifdef DRAW
attribute vec2 iO;
uniform float uDraw;
uniform float uGhost;
#endif
#ifdef BONES
uniform mat4 uBones[6];
#endif
${Hr}
${Ur}
${Wr}
uniform float uNear;
uniform float uBias;
uniform vec4 uRule;
uniform float uAccentOn;
uniform vec3 uAccentCol;
varying float vDist;
varying float vFadeW;
varying float vAcross;
varying float vBevel;
varying vec3 vCol;
varying float vAlpha;

// the alidade's half width at x along it (rete.js ruleHW, ASTRO.alidade)
float ruleHW(float x) {
  float w = 0.012 + (0.04 - 0.012) * pow(1.0 - min(1.0, x / 0.985), 1.4);
  return max(w, sqrt(max(0.0, 0.04 - x * x)));
}
bool underRule(vec3 m) {
  vec2 q = vec2(m.x, -m.z);
  vec2 r = vec2(uRule.x * q.x + uRule.y * q.y, -uRule.y * q.x + uRule.x * q.y);
  float x = abs(r.x);
  if (x > 1.015) return false;
  float w = x > 0.985 ? 0.012 * (1.0 - (x - 0.985) / 0.03) : ruleHW(x);
  bool vane = abs(x - 0.6) < 0.013 && abs(r.y) < 0.054;
  return abs(r.y) < w + 0.004 || vane;
}
void hide() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vDist = 0.0;
  vFadeW = 0.0;
  vAcross = 0.0;
  vBevel = 0.0;
  vCol = vec3(0.0);
  vAlpha = 0.0;
}

void main() {
  vAcross = position.y;
  vBevel = 0.0;
  float code = floor(iP.w + 0.5);
  float flags = mod(code, 8.0);
  vec3 A = iA;
  vec3 Bp = iB;
  vec3 nA = iNA;
  vec3 nB = iNB;
#ifdef BONES
  mat4 Bm = uBones[int(floor(code / 8.0 + 0.01))];
  A = (Bm * vec4(A, 1.0)).xyz;
  Bp = (Bm * vec4(Bp, 1.0)).xyz;
  nA = mat3(Bm) * nA;
  nB = mat3(Bm) * nB;
#endif
  bool hasA = dot(iNA, iNA) > 0.25;
  bool hasB = dot(iNB, iNB) > 0.25;
  if (uRule.z > 0.5 && mod(flags, 2.0) > 0.5 && underRule(0.5 * (A + Bp))) { hide(); return; }
  float alphaK = 1.0;
#ifdef DRAW
  if (uDraw <= iO.x) { hide(); return; }
  float tEnd = clamp((uDraw - iO.x) / max(iO.y - iO.x, 1e-6), 0.0, 1.0);
  Bp = mix(A, Bp, tEnd);
  float plateOnly = mod(floor(flags * 0.5 + 0.01), 2.0);
  float ghostOnly = mod(floor(flags * 0.25 + 0.01), 2.0);
  alphaK = plateOnly > 0.5 ? 1.0 - uGhost : (ghostOnly > 0.5 ? uGhost : 1.0);
  if (alphaK < 0.004) { hide(); return; }
#endif
  vec3 wa = (modelMatrix * vec4(A, 1.0)).xyz;
  vec3 wb = (modelMatrix * vec4(Bp, 1.0)).xyz;
  vec3 na = hasA ? normalize(mat3(modelMatrix) * nA) : vec3(0.0);
  vec3 nb = hasB ? normalize(mat3(modelMatrix) * nB) : vec3(0.0);
  vec3 mid = 0.5 * (wa + wb);
  vec3 toCam = isOrthographic ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])) : normalize(cameraPosition - mid);
  if ((hasA || hasB) && max(dot(na, toCam), dot(nb, toCam)) < -0.03) { hide(); return; }

  vec4 va = viewMatrix * vec4(wa, 1.0);
  vec4 vb = viewMatrix * vec4(wb, 1.0);
  float zn = -uNear * 1.05;
  if (va.z > zn && vb.z > zn) { hide(); return; }
  if (va.z > zn) va = mix(va, vb, (zn - va.z) / (vb.z - va.z));
  if (vb.z > zn) vb = mix(vb, va, (zn - vb.z) / (va.z - vb.z));
  float t = position.x;
  vec4 vp = mix(va, vb, t);
  vDist = length(vp.xyz);
  vec4 ca = projectionMatrix * va;
  vec4 cb = projectionMatrix * vb;
  vec2 sa = ca.xy / ca.w * uRes * 0.5;
  vec2 sb = cb.xy / cb.w * uRes * 0.5;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  float iK = 1.0 - smoothstep(0.25, 0.8, uBrass);
  float tone = iP.y;
  bool crease = hasA && hasB && dot(na, nb) < 0.985;
  vec3 P = mix(wa, wb, t);
  vec3 Vv = isOrthographic ? toCam : normalize(cameraPosition - P);
  vec3 L = uKeyPoint > 0.5 ? normalize(uKeyPos - P) : uKeyDir;
  float foot = uFootK * mix(vDist, 1.0, uFootOrtho) / max(uScale, 1e-6);

  // engraved: the approved ink ribbon, up close a lit chamfer
  float wE = iP.x * uWidthK * uDpr * clamp(uRefDist / max(vDist, 1e-3), 0.55, 1.45);
  vec3 cE = tone < 0.0 ? mix(uLine, uFaint, -tone) : mix(uFaint, uInk, tone);
  float nearK = 1.0 - smoothstep(uMacro.x, uMacro.y, foot);
  if (crease && nearK > 0.001) {
    vec3 bn = normalize(na + nb);
    float glint = pow(max(dot(bn, normalize(L + Vv)), 0.0), 4.0);
    float lit = clamp(uKeyI * (0.5 * max(dot(bn, L), 0.0) + 0.9 * glint) + 1.2 * uFillI * max(dot(bn, uFillDir), 0.0) + uAmb + 0.08, 0.0, 1.0);
    vec3 bev = mix(mix(uLine, uFaint, 0.2) * 0.7, uInk, smoothstep(0.04, 0.8, lit));
    cE = mix(cE, bev, nearK);
    float wBev = min(uBevelW / max(foot, 1e-7), 14.0) * uDpr;
    wE = mix(wE, max(wE, wBev), nearK);
    vBevel = nearK * iK;
  }
  float aE = uOutline;

  // brass: a polished chamfer on a crease, a dark groove for a printed line
  vec3 cB;
  float aB;
  float wB;
  if (crease) {
    vec3 bn = normalize(na + nb);
    float gk = pow(max(dot(bn, normalize(L + Vv)), 0.0), 28.0);
    float gr = pow(max(dot(bn, normalize(uRimDir + Vv)), 0.0), 18.0);
    vec3 R = reflect(-Vv, bn);
    vec3 env = mix(uGround, uSky, smoothstep(-0.25, 0.25, R.y));
    float att = 1.0;
    if (uKeyPoint > 0.5) {
      vec3 dl = uKeyPos - P;
      att = uKeyRange * uKeyRange / (uKeyRange * uKeyRange + dot(dl, dl));
    }
    cB = uMetal[0] * (uKeyCol * att * gk * 2.0 + uRimCol * gr * 1.4 + env * 0.9 + uAmbCol * uAmb);
    wB = min(0.012 / max(foot, 1e-7), 6.0) * uDpr;
    // an edge that catches no light melts into the metal (no ink outlines on brass)
    aB = clamp(dot(cB, vec3(0.3, 0.5, 0.2)) * 3.0, 0.0, 0.9);
    // from across a room (uFarMetal) a chamfer under a pixel or so is already in the
    // solid's own shading: drawn at the 1 px minimum it read as a pale wireframe
    aB *= mix(1.0, smoothstep(0.8 * uDpr, 2.0 * uDpr, wB), uFarMetal);
  } else {
    cB = uMetal[0] * 0.035;
    wB = wE * 0.8;
    aB = 0.8;
    // from across a room a printed line is a groove of fixed width in the metal
    // (0.006 units, about 0.4 mm on the desk): under a pixel it is gone, not a dark stroke
    float wG = min(0.006 / max(foot, 1e-7), 6.0) * uDpr;
    wB = mix(wB, min(wB, wG), uFarMetal);
    aB *= mix(1.0, smoothstep(0.5 * uDpr, 1.5 * uDpr, wG), uFarMetal);
  }
  // composite brass and ink by the ink weight
  float wE2 = iK * aE;
  float wB2 = (1.0 - iK) * aB;
  float alpha = wE2 + wB2;
  vec3 col = (cE * wE2 + cB * wB2) / max(alpha, 1e-4);
  float wWant = mix(wB, wE, iK);
  float acc = iP.z * uAccentOn;
  col = mix(col, uAccentCol, acc);
  alpha = mix(alpha, 1.0, acc);
  vCol = col;
  vAlpha = alpha * alphaK;

  float w = max(wWant, 1.0);
  vFadeW = clamp(wWant, 0.0, 1.0);
  float hw = 0.5 * w;
  vec4 vq = vp;
  if (uFootOrtho > 0.5) vq.z += uBias * abs(vq.z);
  else vq.xyz *= (1.0 - uBias);
  vec4 c = projectionMatrix * vec4(vq.xyz, 1.0);
  vec2 off = nrm * position.y * hw + dir * (t * 2.0 - 1.0) * hw;
  c.xy += off * 2.0 / uRes * c.w;
  gl_Position = c;
}
`,ti=`
uniform vec3 uFogCol;
uniform vec2 uFog;
varying float vDist;
varying float vFadeW;
varying float vAcross;
varying float vBevel;
varying vec3 vCol;
varying float vAlpha;
void main() {
  vec3 c = vCol;
  // a lit chamfer is a touch brighter along its crown
  c *= mix(1.0, 0.8 + 0.2 * (1.0 - abs(vAcross)), vBevel);
  c = mix(c, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
  float a = vAlpha * vFadeW;
  if (a < 0.002) discard;
  gl_FragColor = vec4(c, a);
}
`;function ni(e){let t=typeof e==`string`?parseInt(e.replace(`#`,``),16):e;return[t>>16&255,t>>8&255,t&255].map(e=>e/255).map(e=>e<=.04045?e/12.92:((e+.055)/1.055)**2.4)}function ri(e,t=[1,1,1]){return e==null?t:typeof e==`number`||typeof e==`string`?ni(e):Array.isArray(e)?[e[0],e[1],e[2]]:typeof e==`object`&&`r`in e?[e.r,e.g,e.b]:t}var ii={night:ni(`#0b0a14`),stage:ni(`#09080f`),ink:ni(`#ece9e1`),muted:ni(`#a8a398`),faint:ni(`#7a766d`),line:ni(`#2d2b34`),shade:ni(`#9ea0ae`),amber:ni(`#ffb469`),aurora:ni(`#39f0a6`),accent:ni(`#e8743b`)},ai={F0:[[.93,.71,.36],[.46,.3,.16],[.56,.57,.58],[.06,.1,.21]],rough:[.24,.36,.3,.2],patina:[.1,.085,.045]};function oi(e){let t=t=>new e.Vector3(t[0],t[1],t[2]);return{uRes:{value:new e.Vector2(1,1)},uDpr:{value:1},uFootK:{value:.001},uFootOrtho:{value:0},uRefDist:{value:10},uScale:{value:1},uRootInv:{value:new e.Matrix4},uAcross:{value:new e.Vector2(0,1)},uNear:{value:.1},uBrass:{value:0},uFarMetal:{value:0},uSpacing:{value:3.6},uInkScale:{value:1},uDarkScale:{value:.7},uOutline:{value:1},uWidthK:{value:1},uMacro:{value:new e.Vector2(-2,-1)},uBevelW:{value:.0015},uBrush:{value:1},uFog:{value:new e.Vector2(1e6,2e6)},uFogCol:{value:t(ii.night)},uTier:{value:3},uBias:{value:.002},uNight:{value:t(ii.night)},uStage:{value:t(ii.stage)},uInk:{value:t(ii.ink)},uMuted:{value:t(ii.muted)},uFaint:{value:t(ii.faint)},uLine:{value:t(ii.line)},uShade:{value:t(ii.shade)},uMetal:{value:ai.F0.map(t)},uRough:{value:new e.Vector4(...ai.rough)},uPatina:{value:t(ai.patina)},uKeyDir:{value:new e.Vector3(0,1,0)},uKeyCol:{value:new e.Vector3(1,1,1)},uKeyI:{value:1},uKeyPoint:{value:0},uKeyPos:{value:new e.Vector3(0,10,0)},uKeyRange:{value:10},uSpotDir:{value:new e.Vector3(0,-1,0)},uSpotCos:{value:new e.Vector2(-2,-1)},uFillDir:{value:new e.Vector3(0,1,0)},uFillI:{value:.14},uFillCol:{value:new e.Vector3(.05,.05,.08)},uAmb:{value:.02},uAmbCol:{value:new e.Vector3(.1,.1,.14)},uRim:{value:.24},uRimDir:{value:new e.Vector3(0,.4,-1).normalize()},uRimCol:{value:new e.Vector3(.2,.4,.5)},uSky:{value:new e.Vector3(.02,.03,.06)},uGround:{value:new e.Vector3(.004,.004,.006)},uEnvRim:{value:new e.Vector3(.1,.25,.3)}}}var si=(e,t={})=>({uAccentOn:{value:t.accentOn??0},uAccentCol:{value:new e.Vector3(...t.accentCol||ii.amber)}}),ci=e=>({uBones:{value:Array.from({length:6},()=>new e.Matrix4)}}),li=e=>({uBandN:{value:[new e.Vector3(0,1,0),new e.Vector3(1,0,0),new e.Vector3(0,0,1)]},uBandS:{value:0}});function ui(e,t,n={}){let r={};n.bones&&(r.BONES=``),n.shell&&(r.SHELL=``);let i={...si(e,n),...n.bones?ci(e):{},...n.shell?li(e):{}};return new e.ShaderMaterial({name:`instrument-solid`,uniforms:{...t,...i},defines:r,vertexShader:Yr,fragmentShader:Xr})}function di(e,t,n){return new e.ShaderMaterial({name:`instrument-sphere`,uniforms:{...t,...si(e),uPattern:{value:n.pattern|0},uPatN:{value:24},uPatMix:{value:0},uSeed:{value:n.seed??0},uHW:{value:n.hw??1.05}},vertexShader:Yr,fragmentShader:Zr})}function fi(e,t,n={}){let r={};return n.bones&&(r.BONES=``),n.shell&&(r.SHELL=``),new e.ShaderMaterial({name:`instrument-hull`,uniforms:{...t,...si(e,n),...n.bones?ci(e):{},...n.shell?li(e):{}},defines:r,vertexShader:Qr,fragmentShader:$r,side:e.BackSide})}function pi(e,t,n={}){let r={};n.bones&&(r.BONES=``),n.draw&&(r.DRAW=``);let i=new e.ShaderMaterial({name:`instrument-ribbon`,uniforms:{...t,...si(e,n),...n.bones?ci(e):{},...n.draw?{uDraw:{value:1},uGhost:{value:0}}:{},uRule:{value:new e.Vector4(1,0,0,0)},...n.bias===void 0?{}:{uBias:{value:n.bias}}},defines:r,vertexShader:ei,fragmentShader:ti,transparent:!0,depthWrite:!1,side:e.DoubleSide});return i.forceSinglePass=!0,i}function mi(e,t,n,{draw:r=!1}={}){let i=new e.InstancedBufferGeometry;i.setAttribute(`position`,new e.Float32BufferAttribute([0,-1,0,1,-1,0,1,1,0,0,1,0],3)),i.setIndex([0,1,2,0,2,3]),i.setAttribute(`iA`,new e.InstancedBufferAttribute(new Float32Array(t.a),3)),i.setAttribute(`iB`,new e.InstancedBufferAttribute(new Float32Array(t.b),3)),i.setAttribute(`iNA`,new e.InstancedBufferAttribute(new Float32Array(t.na),3)),i.setAttribute(`iNB`,new e.InstancedBufferAttribute(new Float32Array(t.nb),3)),i.setAttribute(`iP`,new e.InstancedBufferAttribute(new Float32Array(t.p),4)),r&&i.setAttribute(`iO`,new e.InstancedBufferAttribute(new Float32Array(t.o),2)),i.instanceCount=t.count;let a=new e.Mesh(i,n);return a.frustumCulled=!1,a.renderOrder=2,a}function hi(e,t,n,r={}){let i=r.centre||[0,0,0],a=new e.Vector4,o=new e.Vector3,s=new e.Vector3,c=new e.Vector3,l=-1,u=null,d=null,f=null;return function(e,p){let m=e.info.render.frame,h=e.getRenderTarget();if(m===l&&p===u&&e===d&&h===f)return;l=m,u=p,d=e,f=h,e.getCurrentViewport(a);let g=Math.max(1,a.z),_=Math.max(1,a.w),v=e.getPixelRatio()||1;t.uRes.value.set(g,_),t.uDpr.value=v;let y=_/v,b=p.projectionMatrix.elements[5]||1;t.uFootK.value=2/(b*y),t.uFootOrtho.value=+!!p.isOrthographicCamera;let x=n.matrixWorld.elements;t.uScale.value=Math.hypot(x[0],x[1],x[2])||1,t.uRootInv.value.copy(n.matrixWorld).invert(),s.setFromMatrixPosition(p.matrixWorld),o.set(i[0],i[1],i[2]).applyMatrix4(n.matrixWorld),t.uRefDist.value=Math.max(s.distanceTo(o),.001),c.set(0,0,-1).transformDirection(p.matrixWorld).transformDirection(t.uRootInv.value);let S=Math.hypot(c.x,c.z);S>1e-4&&t.uAcross.value.set(c.x/S,c.z/S),t.uNear.value=p.near??.1,r.onFront&&(o.copy(s).applyMatrix4(t.uRootInv.value),Math.hypot(o.x,o.z)>1e-4&&r.onFront(Math.atan2(-o.z,o.x)))}}var gi=.003,_i=[0,1,0],vi=Math.PI/180,yi=Object.freeze([{id:`centre`,from:0,to:.06},{id:`pitch`,from:.06,to:.16},{id:`limb`,from:.16,to:.32},{id:`scale`,from:.32,to:.45},{id:`rete`,from:.45,to:.68},{id:`ecliptic`,from:.68,to:.74},{id:`beneath`,from:.74,to:.88},{id:`rule`,from:.88,to:1}]),bi=Object.fromEntries(yi.map(e=>[e.id,e])),xi=(e,t)=>[e[0]*Math.cos(t)-e[1]*Math.sin(t),e[0]*Math.sin(t)+e[1]*Math.cos(t)],Si=(e,t=256,n=0,r=0,i=0)=>{let a=[];for(let o=0;o<t;o++){let s=i+o/t*Math.PI*2;a.push([n+e*Math.cos(s),r+e*Math.sin(s)])}return a};function Ci(e,t,n=!1,r=.008){let i=n?[...e,e[0]]:e,a=[],o=[],s=e=>{t(e)?o.push(e):o.length&&(o.length>1&&a.push(o),o=[])};for(let e=0;e<i.length-1;e++){let t=i[e],n=i[e+1],a=Math.max(1,Math.ceil(Math.hypot(n[0]-t[0],n[1]-t[1])/r));for(let e=0;e<a;e++)s([t[0]+(n[0]-t[0])*e/a,t[1]+(n[1]-t[1])*e/a])}return s(i[i.length-1]),o.length>1&&a.push(o),a}var wi=e=>Ut(e||0).main.rot;function Ti({widthScale:e=1}={}){let t=e=>[e[0],gi,-e[1]],n=Nn.PLATE,r=Nn.GHOST,i=Nn.RULE,a=new Pn,o=new Pn,s=e=>-(.42+.46*Math.max(0,Math.min(1,e))),c=(n,r,i,a,o,s,c=.012)=>n.polyline(r.map(t),i*e,a,{closed:o,normal:_i,code:s,maxLen:c}),l=(n,r,i,a,o,s,c=!1)=>n.pattern(r.map(t),i,a*e,o,{closed:c,normal:_i,code:s}),u=(e,t,n)=>{let r=e.count;n(),e.order(r,e.count,bi[t].from,bi[t].to)},d=cr(),f=In,{pts:p}=jn(q.main.z,q.module);u(o,`centre`,()=>{let e=f.tipR+.14;l(o,[[-e,0],[e,0]],[.12,.03,.02,.03],.7,-.6,n),l(o,[[0,-e],[0,e]],[.12,.03,.02,.03],.7,-.6,n)}),u(a,`pitch`,()=>{let e=q.main.z*q.module/2;l(a,[...Si(e,360),[e,0]],[.09,.025,.015,.025],.8,.35,n)}),u(a,`limb`,()=>c(a,p,2.1,1,!0,n,0)),u(a,`scale`,()=>{let e=f.scale;c(a,Si(e.r0,360),.8,.5,!0,n+i);for(let t=0;t<360;t+=2){let r=t*vi,o=t%30==0,s=t%10==0,l=o?e.major:s?e.mid:e.minor;c(a,[[e.r0*Math.cos(r),e.r0*Math.sin(r)],[l*Math.cos(r),l*Math.sin(r)]],o?1.25:s?.95:.75,o?.75:s?.56:.42,!1,n+i)}}),u(a,`rete`,()=>{for(let e of d.holes)c(a,e,1.6,1,!0,n+i)}),u(a,`ecliptic`,()=>{let e=f.ecl;for(let t=0;t<360;t+=10){let r=zn(t),o=[r[0]-e.c[0],r[1]-e.c[1]],s=Math.hypot(o[0],o[1]),l=t%30==0?.92:.5,u=[e.c[0]+o[0]/s*(e.rho-e.hw*l),e.c[1]+o[1]/s*(e.rho-e.hw*l)],d=[e.c[0]+o[0]/s*(e.rho+e.hw*l),e.c[1]+o[1]/s*(e.rho+e.hw*l)];c(a,[u,d],t%30==0?1:.75,t%30==0?.66:.4,!1,n+i)}});let m=f.alidade,h=e=>xi(e,Rt),g=(e,t)=>{let n=e=>t?s(e):e,r=t?.85:1;c(o,dr().map(h),1.7*r,n(1),!0,e),l(o,[h([-m.len,0]),h([m.len,0])],[.1,.03,.015,.03],.7*r,n(.5),e);for(let t of[1,-1]){let i=t*m.vaneAt;c(o,[[i-m.vane[0],-m.vane[1]],[i+m.vane[0],-m.vane[1]],[i+m.vane[0],m.vane[1]],[i-m.vane[0],m.vane[1]]].map(h),1.2*r,n(.9),!0,e),c(o,Si(.009,12,i,0).map(h),.85*r,n(.75),!0,e)}c(o,Si(.058,40),1.3*r,n(.95),!0,e),c(o,Si(.03,24),.85*r,n(.65),!0,e),t||c(o,[[.07,.012],[.2,.008],[.2,-.008],[.07,-.012]].map(h),.85,.65,!0,e)};u(o,`rule`,()=>g(n,!1)),c(a,p,1.785,s(1),!0,r,0);for(let e of d.holes)c(a,e,1.36,s(1),!0,r);g(r,!0);let _=e=>Math.hypot(e[0],e[1])<f.limbIn-.004&&Math.hypot(e[0],e[1])>f.bore;for(let e of pr(10)){let t=e.alt===0?.36:e.alt<0?-.7:.14,n=e.alt===0?.95:.7;for(let i of mr(e.c,e.r,_,540))e.alt<0?l(o,i,[.03,.025],n*.85,s(Math.max(0,t)),r):c(o,i,n*.85,s(t),!1,r)}for(let[e,t]of[[f.Req,.15],[f.Rcnc,.3]])for(let n of mr([0,0],e,_,360))l(o,n,[.05,.02,.01,.02],.5525,s(t),r);return{wheel:a,fixed:o}}function Ei(e,{widthScale:t=1}={}){let n=e=>[e[0],gi,-e[1]],r=Nn.PLATE,i=new Pn,a=In,o=t=>xi(t,-e),s=e=>xi(e,-Rt),c=e=>!fr(s(e))&&lr(o(e),.007)&&Math.hypot(e[0],e[1])>a.bore,l=(e,a,o)=>i.polyline(e.map(n),a*t,o,{normal:_i,code:r}),u=(e,a,o,s)=>i.pattern(e.map(n),a,o*t,s,{normal:_i,code:r});for(let e of pr(10)){let t=e.alt===0?.36:e.alt<0?-.7:.14,n=e.alt===0?.95:.7;for(let r of mr(e.c,e.r,c,540))e.alt<0?u(r,[.03,.025],n,t):l(r,n,t)}for(let[e,t]of[[a.Req,-.85],[a.Rcnc,-.7]])for(let n of mr([0,0],e,c,360))u(n,[.05,.02,.01,.02],.65,t);for(let e of Ci([[0,-a.limbIn],[0,a.limbIn]],c))u(e,[.12,.03,.02,.03],.65,-.75);return i.order(0,i.count,bi.beneath.from,bi.beneath.to),i}function Di(e){let t=cr(),n=2*Math.PI/q.main.z;return{centre:[0,0],stars:t.pointers.map(t=>({name:t.name,tip:xi(t.tip,e)})),tooth(t){let r=Math.round((t*vi-e)/n)*n+e;return[(In.tipR+.015)*Math.cos(r),(In.tipR+.015)*Math.sin(r)]},ruleTip:(e=1)=>xi([e*(In.alidade.len+.045),0],Rt),toWorld:e=>[e[0],gi,-e[1]]}}function Oi({THREE:e,crank:t=0,widthScale:n=1,draw:r=1,ghost:i=0}={}){if(!e)throw TypeError(`createPlateDrawing: THREE is required`);let a=new e.Group;a.name=`instrument-plate`;let o=oi(e);o.uBrass.value=0,o.uDarkScale.value=1;let s=hi(e,o,a,{centre:[0,0,0]}),c=(e,t,n)=>s(e,n),{wheel:l,fixed:u}=Ti({widthScale:n}),d=pi(e,o,{draw:!0,bias:0}),f=pi(e,o,{draw:!0,bias:0}),p=new e.Group;p.name=`instrument-plate:wheel`,a.add(p);let m=mi(e,l,d,{draw:!0}),h=mi(e,u,f,{draw:!0});m.onBeforeRender=c,h.onBeforeRender=c,p.add(m),a.add(h);let g=null,_=NaN,v=0,y=1;function b(t){g&&(g.geometry.dispose(),a.remove(g)),g=mi(e,Ei(t,{widthScale:n}),f,{draw:!0}),g.onBeforeRender=c,a.add(g)}let x={object3D:a,order:yi,setDraw(e){y=Math.max(0,Math.min(1,Number.isFinite(e)?e:0));let t=y>=1?1.001:y;d.uniforms.uDraw.value=t,f.uniforms.uDraw.value=t},setCrank(e){let t=wi(e);p.rotation.y=t,p.updateMatrix();let n=Rt-t;d.uniforms.uRule.value.set(Math.cos(n),Math.sin(n),+(v<.5),0),Math.abs(t-_)<1e-5||(_=t,b(t))},setGhost(e){v=Math.max(0,Math.min(1,Number.isFinite(e)?e:0)),d.uniforms.uGhost.value=v,f.uniforms.uGhost.value=v;let t=d.uniforms.uRule.value;t.z=+(v<.5)},setLook(e={}){e.ink!==void 0&&(o.uInkScale.value=e.ink),e.outline!==void 0&&(o.uOutline.value=e.outline),e.widthK!==void 0&&(o.uWidthK.value=e.widthK),e.fog!==void 0&&(e.fog?o.uFog.value.set(e.fog[0],e.fog[1]):o.uFog.value.set(1e6,2e6)),e.fogColor!==void 0&&o.uFogCol.value.set(...ri(e.fogColor));let t=e.palette||{};for(let[e,n]of[[`night`,`uNight`],[`ink`,`uInk`],[`muted`,`uMuted`],[`faint`,`uFaint`],[`line`,`uLine`]])t[e]!==void 0&&o[n].value.set(...ri(t[e]))},anchors(){return Di(Number.isFinite(_)?_:0)},dispose(){m.geometry.dispose(),h.geometry.dispose(),g&&g.geometry.dispose(),d.dispose(),f.dispose(),a.removeFromParent()}};return x.setCrank(t),x.setGhost(i),x.setDraw(r),x}var ki=[[28,18],[36,24],[48,32],[56,40]],Ai=()=>new Promise(e=>typeof setTimeout==`function`?setTimeout(e,0):e());function ji({THREE:e,rngFor:t=ee,tier:n=3,gsap:r=null,seed:i=7,reducedMotion:a=!1}={}){if(!e)throw TypeError(`createInstrument: THREE is required`);let o=new e.Group;o.name=`instrument`;let s=oi(e),c=ln(t,i),l={crank:0,arms:0,build:1,brass:0,contact:0,crankAccent:0,hover:Mt.map(()=>0),hoverId:null,front:null,seenFront:-Math.PI/2,viewport:`land`,tier:Mi(n),builtTier:-1},u=Mt.map(()=>({w:0})),d=null,f=!1,p=null,m=new e.Vector3,h=hi(e,s,o,{centre:[0,2.2,0],onFront:e=>l.seenFront=e}),g=(e,t,n)=>h(e,n);function _(e){return(t,n,r)=>{h(t,r);let i=e.matrixWorld.elements,a=Math.hypot(i[0],i[1],i[2]);m.set(i[12],i[13],i[14]).applyMatrix4(r.matrixWorldInverse);let o=r.projectionMatrix.elements[5]||1,c=s.uRes.value.y/s.uDpr.value,u=r.isOrthographicCamera?a*o*c/2:a*o/Math.max(-m.z,1e-4)*(c/2),d=Math.min(72,Math.max(6,Math.PI*u/5)),f=Math.log2(d/6),p=e.material.uniforms;if(l.tier>=2){let e=Math.floor(f),t=f-e;p.uPatN.value=6*2**e,p.uPatMix.value=t<=.5?0:t>=1?1:((t-.5)/.5)**2*(3-2*((t-.5)/.5))}else p.uPatN.value=6*2**Math.round(f),p.uPatMix.value=0}}function v(t,n){let r=t=>new e.Vector2(t[0],t[1]);return e.ShapeUtils.triangulateShape(t.map(r),n.map(e=>e.map(r)))}function y(t){let n=new e.BufferGeometry;n.setAttribute(`position`,new e.BufferAttribute(t.position,3)),n.setAttribute(`normal`,new e.BufferAttribute(t.normal,3)),n.setAttribute(`aHatch`,new e.BufferAttribute(t.hatch,2)),n.setAttribute(`aTick`,new e.BufferAttribute(t.tick,2)),n.setAttribute(`aMat`,new e.BufferAttribute(t.mat,4)),n.setAttribute(`aOnormal`,new e.BufferAttribute(t.onormal,4)),t.bone&&n.setAttribute(`aBone`,new e.BufferAttribute(t.bone,1));let r=t.position.length/3;return n.setIndex(new e.BufferAttribute(r<65536?Uint16Array.from(t.index):t.index,1)),n.computeBoundingSphere(),n}function b(t,n,r){let i=Sn(t,n),a=i.pos.length/3,o=new e.BufferGeometry;o.setAttribute(`position`,new e.Float32BufferAttribute(i.pos,3)),o.setAttribute(`normal`,new e.Float32BufferAttribute(i.nrm,3)),o.setAttribute(`aHatch`,new e.Float32BufferAttribute(i.hat,2)),o.setAttribute(`aTick`,new e.Float32BufferAttribute(i.tik,2));let s=new Float32Array(a*4),c=new Float32Array(a*4);for(let e=0;e<a;e++)s[4*e+1]=1,s[4*e+2]=1.05,s[4*e+3]=1,c[4*e]=i.nrm[3*e],c[4*e+1]=i.nrm[3*e+1],c[4*e+2]=i.nrm[3*e+2],c[4*e+3]=r;return o.setAttribute(`aMat`,new e.BufferAttribute(s,4)),o.setAttribute(`aOnormal`,new e.BufferAttribute(c,4)),o.setIndex(i.idx),o.computeBoundingSphere(),o}function x(e){let t=(e,t)=>{let n=Fr(e),r=t.position,i=t.normal,a=new Float32Array(r.length),o=new Float32Array(i.length);for(let e=0;e<r.length;e+=3){let t=r[e],s=r[e+1],c=r[e+2];a[e]=n[0]*t+n[4]*s+n[8]*c+n[12],a[e+1]=n[1]*t+n[5]*s+n[9]*c+n[13],a[e+2]=n[2]*t+n[6]*s+n[10]*c+n[14];let l=i[e],u=i[e+1],d=i[e+2];o[e]=n[0]*l+n[4]*u+n[8]*d,o[e+1]=n[1]*l+n[5]*u+n[9]*d,o[e+2]=n[2]*l+n[6]*u+n[10]*d}return{pos:a,nrm:o,idx:t.index}},n=[`base`,`column`],r=[...n,`rule`,`meridian`,`horizon`,`equator`],i=[`wheel`,`idler`,`pinion`],a=[`ecliptic`,`colure`,`globe`],o={};for(let n of[...r,...i,...a])e[n]&&(o[n]=t(n,e[n]));let s=[64,80,96,112][l.tier],c=[-Pt.radius-.05,Nt-.05,-Pt.radius-.05],u=[Pt.radius+.05,J.c[1]+J.axisHalf+.15,Pt.radius+.05],d=(t,n)=>{let r=e[t],i=new Float32Array(r.position.length/3);n.occlude(o[t],i);for(let e=0;e<i.length;e++)r.mat[4*e+3]=i[e]},f=new Br(c,u,s);for(let e of n)o[e]&&f.splat(o[e]);for(let e of i){if(!o[e])continue;let t=f.clone();t.splat(o[e]),d(e,t)}let p=f;for(let e of r)o[e]&&!n.includes(e)&&p.splat(o[e]);for(let e of[...i,...a])o[e]&&p.splat(o[e]);for(let e of r)o[e]&&d(e,p);let m=new Br([J.c[0]-1.8,J.c[1]-1.8,J.c[2]-1.8],[J.c[0]+1.8,J.c[1]+1.8,J.c[2]+1.8],Math.round(s*.75));for(let e of[`equator`,...a])o[e]&&m.splat(o[e]);for(let e of a)o[e]&&d(e,m);for(let t of Gt){let n=e[`arm:`+t.id];if(!n)continue;let r={pos:n.position,nrm:n.normal,idx:n.index},i=Vr([r]),a=new Br([Math.min(i.min[0],-.3),i.min[1],i.min[2]],i.max,Math.round(s*.9));a.splat(r),o.column&&a.splat(o.column);let c=new Float32Array(n.position.length/3);a.occlude(r,c);for(let e=0;e<c.length;e++)n.mat[4*e+3]=c[e]}}async function S(){if(f)throw Error(`createInstrument: disposed`);let n=Ni();C();let r=l.tier,a=Pr({tier:r,triangulate:v,rng:t(i,`instrument:parts`)});if(await Ai(),f)return;let c={};for(let[e,t]of Object.entries(a.groups))c[e]=Dr(t);if(x(c),await Ai(),f)return;let u={groups:{},spheres:[],armSpheres:[],meshes:[],materials:[],geometries:[],triangles:0},p=e=>(e.onBeforeRender=g,u.meshes.push(e),e),[m,h]=ki[r],S=b(m,h,Z.big),w=b(Math.max(16,m>>1),Math.max(10,h>>1),Z.mid);u.geometries.push(S,w);for(let[t,n]of Object.entries(a.groups)){let r=c[t],i=t.startsWith(`arm:`),a=t===`shell`,l=i?ii.aurora:ii.amber,d=new e.Group;d.name=`instrument:`+t,d.matrixAutoUpdate=!1,o.add(d);let f=y(r);u.geometries.push(f),u.triangles+=r.triangles;let m=ui(e,s,{bones:i,shell:a,accentCol:l}),h=fi(e,s,{bones:i,shell:a,accentCol:l}),g=p(new e.Mesh(f,m)),v=p(new e.Mesh(f,h));i&&(g.frustumCulled=!1,v.frustumCulled=!1),d.add(g,v),u.materials.push(m,h);let b={obj:d,solid:g,hull:v,lines:null,detail:null,spheres:[]};if(n.lines.count){let t=pi(e,s,{bones:i,accentCol:l});b.lines=p(mi(e,n.lines,t)),d.add(b.lines),u.materials.push(t),u.geometries.push(b.lines.geometry),u.triangles+=n.lines.count*2,n.detail.count&&(b.detail=p(mi(e,n.detail,t)),d.add(b.detail),u.geometries.push(b.detail.geometry),u.triangles+=n.detail.count*2)}for(let t of n.spheres){let n=t.r<.15?w:S,r=di(e,s,{pattern:t.pattern,seed:t.seed}),a=new e.Mesh(n,r);a.matrixAutoUpdate=!1,a.onBeforeRender=_(a);let c=p(new e.Mesh(n,fi(e,s,{})));c.matrixAutoUpdate=!1,u.materials.push(r,c.material),u.meshes.push(a),u.triangles+=n.index.count/3,i?(o.add(a,c),u.armSpheres.push({id:t.id,mesh:a,hull:c})):(a.matrix.fromArray(t.matrix),c.matrix.fromArray(t.matrix),d.add(a,c),b.spheres.push({id:t.id,mesh:a,hull:c}))}u.groups[t]=b}return d=u,l.builtTier=r,T(),O(),d.ms=Ni()-n,{triangles:u.triangles,ms:d.ms,tier:r}}function C(){if(d){for(let e of d.geometries)e.dispose();for(let e of d.materials)e.dispose();for(let e of[...o.children])o.remove(e);d=null}}function w(){return l.front??l.seenFront}function T(){if(!d)return;let e=pn({crank:l.crank,arms:l.arms,build:l.build,contact:l.contact,hover:l.hover,front:w(),viewport:l.viewport},c),t=d.groups,n={base:e.reveal.base,wheel:e.reveal.wheel,rule:e.reveal.wheel,idler:e.reveal.idler,pinion:e.reveal.pinion,column:e.reveal.column,meridian:e.reveal.meridian,horizon:e.reveal.horizon,equator:e.reveal.equator,ecliptic:e.reveal.ecliptic,colure:e.reveal.colure,globe:e.reveal.globe};for(let[r,i]of Object.entries(e.groups)){let a=t[r];a&&(a.obj.matrix.fromArray(i),a.obj.matrixWorldNeedsUpdate=!0,r===`shell`?a.obj.visible=e.shell.visible:a.obj.visible=(n[r]??1)>0)}if(t.wheel&&t.wheel.lines){let n=Rt-e.train.main.rot;t.wheel.lines.material.uniforms.uRule.value.set(Math.cos(n),Math.sin(n),+(e.reveal.wheel>0),0)}if(t.shell)for(let n of[t.shell.solid,t.shell.hull]){let t=n.material.uniforms;e.shell.normals.forEach((e,n)=>t.uBandN.value[n].set(e[0],e[1],e[2])),t.uBandS.value=e.shell.full?2:e.shell.sinBeta}if(t.pinion)for(let e of[t.pinion.solid,t.pinion.hull,t.pinion.lines])e&&(e.material.uniforms.uAccentOn.value=l.crankAccent);e.arms.forEach((e,n)=>{let r=t[`arm:`+Mt[n]];if(r){r.obj.matrix.fromArray(e.group),r.obj.matrixWorldNeedsUpdate=!0,r.obj.visible=e.visible;for(let t of[r.solid,r.hull,r.lines]){if(!t)continue;let n=t.material.uniforms;e.bones.forEach((e,t)=>n.uBones.value[t].fromArray(e)),n.uAccentOn.value=e.hover}}let i=d.armSpheres.find(e=>e.id===Mt[n]);i&&(i.mesh.matrix.fromArray(e.sphere),i.hull.matrix.fromArray(e.sphere),i.mesh.matrixWorldNeedsUpdate=!0,i.hull.matrixWorldNeedsUpdate=!0,i.mesh.visible=e.visible&&e.sphereVisible,i.hull.visible=i.mesh.visible&&E())}),D()}let E=()=>l.brass<.8;function D(){if(!d)return;let e=E();for(let t of Object.values(d.groups)){t.hull.visible=e;for(let n of t.spheres)n.hull.visible=e}for(let t of d.armSpheres)t.hull.visible=e&&t.mesh.visible}function O(){if(s.uTier.value=l.tier,d)for(let e of Object.values(d.groups))e.detail&&(e.detail.visible=l.tier>=2)}let k=(e,t)=>[Math.cos(t)*Math.cos(e),Math.sin(t),-Math.cos(t)*Math.sin(e)];function A({dir:t,color:n,intensity:r=1,ambient:i,position:a,range:c,cone:u}={}){if(t){let e=Array.isArray(t)?t:[t.x,t.y,t.z],n=Math.hypot(e[0],e[1],e[2])||1;s.uKeyDir.value.set(e[0]/n,e[1]/n,e[2]/n)}let d=ri(n,[1,1,1]);if(s.uKeyCol.value.set(d[0]*r,d[1]*r,d[2]*r),s.uKeyI.value=Math.min(1.4,r*Math.max(.2126*d[0]+.7152*d[1]+.0722*d[2],0)),i!==void 0&&(s.uAmb.value=i),a){let n=Array.isArray(a)?a:[a.x,a.y,a.z];s.uKeyPoint.value=1,s.uKeyPos.value.set(n[0],n[1],n[2]),s.uKeyRange.value=c??10;let r=new e.Vector3().setFromMatrixPosition(o.matrixWorld),i=t?s.uKeyDir.value.clone().negate():r.sub(s.uKeyPos.value).normalize();s.uSpotDir.value.copy(i),u?s.uSpotCos.value.set(Math.cos(u[0]*G),Math.cos(u[1]*G)):s.uSpotCos.value.set(-2,-1)}else s.uKeyPoint.value=0,s.uSpotCos.value.set(-2,-1);let f=s.uKeyDir.value,p=Math.atan2(-f.z,f.x),m=k(p+105*G,20*G);if(s.uFillDir.value.set(m[0],m[1],m[2]),!l.rimDirSet){let e=k(p+Math.PI,25*G);s.uRimDir.value.set(e[0],e[1],e[2])}}function j({sky:e,ground:t,rim:n,rimDir:r}={}){if(e!==void 0){let t=ri(e);s.uSky.value.set(t[0],t[1],t[2]),s.uFillCol.value.set(t[0]*.6,t[1]*.6,t[2]*.6),s.uAmbCol.value.set(t[0]*4,t[1]*4,t[2]*4)}if(t!==void 0){let e=ri(t);s.uGround.value.set(e[0],e[1],e[2])}if(n!==void 0){let e=ri(n);s.uEnvRim.value.set(e[0],e[1],e[2]),s.uRimCol.value.set(e[0],e[1],e[2])}if(r){let e=Array.isArray(r)?r:[r.x,r.y,r.z],t=Math.hypot(e[0],e[1],e[2])||1;s.uRimDir.value.set(e[0]/t,e[1]/t,e[2]/t),l.rimDirSet=!0}else if(r===null&&l.rimDirSet){l.rimDirSet=!1;let e=s.uKeyDir.value,t=k(Math.atan2(-e.z,e.x)+Math.PI,25*G);s.uRimDir.value.set(t[0],t[1],t[2])}}A({dir:k(225*G,40*G),color:[1,1,1],intensity:1,ambient:.02}),j({sky:`#1b2440`,ground:`#08070b`,rim:`#27e0d0`});function M(e,t={}){if(e!=null&&!Mt.includes(e))throw TypeError(`setHover: unknown stone "${e}"`);l.hoverId=e??null,Mt.forEach((e,n)=>{let i=+(e===l.hoverId);r&&!a&&!t.immediate?(r.killTweensOf(u[n]),r.to(u[n],{w:i,duration:.55,ease:`power2.inOut`,onUpdate:()=>{l.hover[n]=u[n].w,T()}})):(r?.killTweensOf(u[n]),u[n].w=i,l.hover[n]=i)}),T()}function N(e){let t=Mt.indexOf(e);if(t<0)throw TypeError(`unknown stone "${e}"`);return un(t,{crank:l.crank,arms:l.arms,build:l.build,contact:l.contact,hover:l.hover,front:w(),viewport:l.viewport},c[t])}function P(t,n){let r=N(t).centre,i=n||new e.Vector3;return o.updateWorldMatrix(!0,!1),i.set(r[0],r[1],r[2]).applyMatrix4(o.matrixWorld)}function F(){o.updateWorldMatrix(!0,!1);let e=o.matrixWorld.elements;return Math.hypot(e[0],e[1],e[2])||1}function I(){let e=[-Pt.radius,Nt,-Pt.radius],t=[Pt.radius,J.c[1]+J.rings[0].R+.02,Pt.radius],n=pn({crank:l.crank,arms:l.arms,build:l.build,contact:l.contact,hover:l.hover,front:w(),viewport:l.viewport},c);for(let r of n.arms)if(r.visible)for(let n=0;n<3;n++)e[n]=Math.min(e[n],r.centre[n]-r.hoopR),t[n]=Math.max(t[n],r.centre[n]+r.hoopR);let r=[(e[0]+t[0])/2,(e[1]+t[1])/2,(e[2]+t[2])/2];return{min:e,max:t,center:r,radius:Math.hypot(t[0]-r[0],t[1]-r[1],t[2]-r[2]),armillary:{center:J.c.slice(),radius:J.rings[0].R}}}let L={object3D:o,stones:Mt,build(){return p=S(),p},get ready(){return!!d},setBuild(e){l.build=St(Number.isFinite(e)?e:0),T()},setCrank(e){l.crank=Number.isFinite(e)?e:0,T()},setArms(e){l.arms=St(Number.isFinite(e)?e:0),T()},setBrass(e){l.brass=St(Number.isFinite(e)?e:0),s.uBrass.value=l.brass,D()},setHover:M,setContact(e){l.contact=St(Number.isFinite(e)?e:0),T()},setLight:A,setEnvColors:j,stoneWorldPosition:P,stoneRadius(e){return N(e).hoopR*F()},stoneWorldPositions(){return Object.fromEntries(Mt.map(e=>[e,P(e)]))},setEnvironment({light:e,env:t}={}){e&&A(e),t&&j(t)},get bounds(){return I()},setTier(e){l.tier=Mi(e),O()},setViewport(e){if(!Yt.includes(e))throw TypeError(`setViewport: unknown viewport "${e}"`);l.viewport=e,T()},setCamera(t){if(!t){l.front=null;return}o.updateWorldMatrix(!0,!1),t.updateMatrixWorld();let n=new e.Vector3().setFromMatrixPosition(t.matrixWorld).applyMatrix4(new e.Matrix4().copy(o.matrixWorld).invert());Math.hypot(n.x,n.z)>1e-4&&(l.front=Math.atan2(-n.z,n.x)),T()},setCrankAccent(e){l.crankAccent=St(Number.isFinite(e)?e:0),T()},setLook(e={}){e.fog!==void 0&&(e.fog?s.uFog.value.set(e.fog[0],e.fog[1]):s.uFog.value.set(1e6,2e6)),e.fogColor!==void 0&&s.uFogCol.value.set(...ri(e.fogColor)),e.macro!==void 0&&(e.macro?s.uMacro.value.set(e.macro[0],e.macro[1]):s.uMacro.value.set(-2,-1)),e.ink!==void 0&&(s.uInkScale.value=e.ink),e.dark!==void 0&&(s.uDarkScale.value=e.dark),e.outline!==void 0&&(s.uOutline.value=e.outline),e.widthK!==void 0&&(s.uWidthK.value=e.widthK),e.spacing!==void 0&&(s.uSpacing.value=e.spacing),e.brush!==void 0&&(s.uBrush.value=e.brush);let t=e.palette||{};for(let[e,n]of[[`night`,`uNight`],[`stage`,`uStage`],[`ink`,`uInk`],[`muted`,`uMuted`],[`faint`,`uFaint`],[`line`,`uLine`],[`shade`,`uShade`]])t[e]!==void 0&&s[n].value.set(...ri(t[e]));if(!d)return;let n=(e,t)=>e&&e.material.uniforms.uAccentCol.value.set(...ri(t));for(let[t,r]of Object.entries(d.groups))e.hoverColor!==void 0&&t.startsWith(`arm:`)&&[r.solid,r.hull,r.lines].forEach(t=>n(t,e.hoverColor)),e.crankColor!==void 0&&t===`pinion`&&[r.solid,r.hull,r.lines].forEach(t=>n(t,e.crankColor))},stoneScreen(t,n,r){let i=[],a=new e.Vector3,o=new e.Vector3;t.updateMatrixWorld();for(let e of Mt){P(e,a),o.copy(a).applyMatrix4(t.matrixWorldInverse);let s=L.stoneRadius(e),c=t.projectionMatrix.elements[5],l=t.isOrthographicCamera?s*c*r/2:s*c/Math.max(-o.z,1e-4)*(r/2);a.project(t),i.push({id:e,x:(a.x*.5+.5)*n,y:(.5-a.y*.5)*r,r:l,visible:a.z<1&&-o.z>0})}return i},state(){return{crank:l.crank,arms:l.arms,build:l.build,brass:l.brass,contact:l.contact,hover:l.hoverId,viewport:l.viewport,tier:l.tier,builtTier:l.builtTier,front:w(),triangles:d?d.triangles:0,buildMs:d?d.ms:0}},dispose(){if(!f){f=!0;for(let e of u)r?.killTweensOf(e);C(),o.removeFromParent()}}};return L}function Mi(e){return typeof e==`string`&&(e={high:3,medium:2,low:1}[e]??3),Math.max(0,Math.min(3,Number.isFinite(e)?Math.round(e):3))}function Ni(){return typeof performance<`u`?performance.now():Date.now()}var Pi=new Set([`uRes`,`uDpr`,`uFootK`,`uFootOrtho`,`uRefDist`,`uScale`,`uRootInv`,`uAcross`,`uNear`,`uBrass`,`uTier`]),Fi=new WeakMap;function Ii(e,t){for(let n=e;n;n=n.parent)if(n===t)return!0;return!1}function Li(e){let t=e&&e.object3D;if(!t)return null;let n=Fi.get(e);if(n&&Ii(n.probe,t))return n.bag;let r=null;return t.traverse(e=>{if(r||!e.material||!e.material.uniforms)return;let t=e.material.uniforms;t.uKeyDir&&t.uBrass&&t.uFog&&t.uMetal&&(r={bag:t,probe:e})}),r?(Fi.set(e,r),r.bag):null}function Ri(e){return Array.isArray(e)?e.map(Ri):e&&typeof e.clone==`function`?e.clone():e}function zi(e,t){if(Array.isArray(t)){for(let n=0;n<t.length;n++)e[n]=zi(e[n],t[n]);return e}return t&&typeof t.copy==`function`&&e&&typeof e.copy==`function`?e.copy(t):t}function Bi(e){let t=e.object3D,n=null,r=!0,i=!0,a=!1,o=!1,s=!1,c=0,l=[],u=null,d=null,f=[],p=t.position.clone(),m=t.quaternion.clone(),h=t.scale.clone(),g=t.matrix.clone();function _(){let e=t.getObjectByName(`instrument:pinion`),n=e&&e.children.find(e=>e.material&&e.material.uniforms&&e.material.uniforms.uAccentOn);return n?n.material.uniforms.uAccentOn.value:0}return{get held(){return a},get bag(){return u},acquire(v,y={}){if(a&&this.release(),a=!0,o=!1,s=!1,n=t.parent&&t.parent!==v?t.parent:null,p.copy(t.position),m.copy(t.quaternion),h.copy(t.scale),g.copy(t.matrix),r=t.visible,i=t.matrixAutoUpdate,u=Li(e),u){let e=u;if(u!==d)d=u,f=Object.keys(e).filter(e=>!Pi.has(e)),l=f.map(t=>Ri(e[t].value));else for(let t=0;t<f.length;t++)l[t]=zi(l[t],e[f[t]].value)}c=_(),v.add(t);let b=y.position||[0,0,0];t.position.set(b[0],b[1],b[2]),t.rotation.set(0,y.yaw||0,0);let x=y.scale??1;return t.scale.set(x,x,x),t.matrixAutoUpdate=!0,t.visible=!0,t.updateMatrixWorld(!0),u},setPosition(e){t.position.set(e[0],e[1],e[2]),t.updateMatrixWorld(!0)},markPose(){o=!0},usedCamera(){s=!0},release(){if(a){if(a=!1,u&&u===d){let e=u;for(let t=0;t<f.length;t++)e[f[t]].value=zi(e[f[t]].value,l[t])}_()!==c&&e.setCrankAccent(c),s&&(s=!1,e.setCamera(null)),o&&(o=!1,e.setCrank(e.state().crank)),n?n.add(t):t.removeFromParent(),t.position.copy(p),t.quaternion.copy(m),t.scale.copy(h),t.visible=r,t.matrix.copy(g),t.matrixAutoUpdate=i,t.updateMatrixWorld(!0),n=null}}}}var Vi=new WeakMap;function Hi(e){if(!e||e.ready)return Promise.resolve();let t=Vi.get(e);return t||(t=Promise.resolve(e.build()).then(()=>void 0),Vi.set(e,t)),t}var Ui=Object.freeze({phone:22,desk:14});function Wi(e){let t=new e.Vector3,n=new e.Vector3;return function(e,r,i,a,o={}){let s=[],c=o.phone?Ui.phone:Ui.desk,l=r.projectionMatrix.elements[5];for(let u of e.stones){e.stoneWorldPosition(u,t),n.copy(t).applyMatrix4(r.matrixWorldInverse);let d=-n.z,f=e.stoneRadius(u),p=d>1e-4?f*l/d*(a/2):0;t.project(r);let m=(t.x*.5+.5)*i,h=(.5-t.y*.5)*a,g=m>-p&&m<i+p&&h>-p&&h<a+p,_=o.shown!==!1&&d>r.near&&t.z<1&&g&&p>.5;s.push({id:u,x:m,y:h,r:p,radius:p,hit:Math.max(p*1.15,c),depth:d,visible:_})}return s}}function Gi(e,t,n){let r=null,i=1/0,a=1/0;for(let o of e){if(!o.visible)continue;let e=Math.hypot(t-o.x,n-o.y)/o.hit;e>1||(e<i-.05||Math.abs(e-i)<=.05&&o.depth<a)&&(r=o.id,i=e,a=o.depth)}return r}var Ki=0,qi=1,Ji=2,Yi=3,Xi=4,Zi=5,Qi=6,$i={smooth:Ki,linear:qi,in:Ji,out:Yi,inOut:Xi,hold:Zi};Object.freeze([`smooth`,`linear`,`in`,`out`,`inOut`,`hold`,`cubic-bezier`]);var ea=0,ta=1,na=1e-6,ra=1e-9,ia=1e-4;function aa(e,t){if(e==null)return{code:Ki,bz:null};if(typeof e==`string`){if(Object.hasOwn($i,e))return{code:$i[e],bz:null};let n=/^cubic-bezier\(([^)]*)\)$/.exec(e.replace(/\s+/g,``));if(n)return oa(n[1].split(`,`).map(Number),t);throw TypeError(`${t}: unknown ease "${e}"`)}if(Array.isArray(e))return oa(e,t);if(typeof e==`object`&&Array.isArray(e.bezier))return oa(e.bezier,t);throw TypeError(`${t}: unknown ease ${JSON.stringify(e)}`)}function oa(e,t){if(e.length!==4||!e.every(Number.isFinite))throw TypeError(`${t}: cubic-bezier needs four finite numbers`);if(e[0]<0||e[0]>1||e[2]<0||e[2]>1)throw RangeError(`${t}: cubic-bezier x1 and x2 must be in [0, 1]`);return{code:Qi,bz:e.slice()}}function sa(e,t,n,r,i){if(i<=0)return 0;if(i>=1)return 1;let a=3*e,o=3*(n-e)-a,s=1-a-o,c=3*t,l=3*(r-t)-c,u=1-c-l,d=i;for(let e=0;e<8;e++){let e=((s*d+o)*d+a)*d-i;if(Math.abs(e)<1e-12)return((u*d+l)*d+c)*d;let t=(3*s*d+2*o)*d+a;if(Math.abs(t)<1e-9)break;d-=e/t}let f=0,p=1;d=i;for(let e=0;e<60;e++){let e=((s*d+o)*d+a)*d;if(Math.abs(e-i)<1e-12)break;e<i?f=d:p=d,d=.5*(f+p)}return((u*d+l)*d+c)*d}function ca(e,t){let[n,r,i,a]=e;return t?i<1-1e-12?(1-a)/(1-i):a===1?n<1-1e-12?(1-r)/(1-n):r===1?1:r<1?1/0:-1/0:a<1?1/0:-1/0:n>1e-12?r/n:r===0?i>1e-12?a/i:a===0?1:a>0?1/0:-1/0:r>0?1/0:-1/0}function la(e,t,n,r){switch(e){case qi:return r;case Ji:return r*r;case Yi:return r*(2-r);case Xi:return r*r*(3-2*r);case Zi:return 0;case Qi:return sa(t[n],t[n+1],t[n+2],t[n+3],r);default:return r}}function ua(e,t,n,r){switch(e){case qi:return 1;case Ji:return r?2:0;case Yi:return r?0:2;case Xi:return 0;case Zi:return 0;case Qi:return ca([t[n],t[n+1],t[n+2],t[n+3]],r);default:return 1}}function da(e,t){if(Array.isArray(e)){if(e.length<2||e.length>4)throw TypeError(`${t}: a key is [u, value, ease?, flags?]`);return{u:e[0],v:e[1],ease:e[2],flags:e[3]||{}}}if(e&&typeof e==`object`)return{u:e.u,v:e.v,ease:e.ease,flags:e};throw TypeError(`${t}: a key is [u, value, ease?, flags?] or { u, v, ease }`)}function fa(e,t){if(e.length===0)throw RangeError(`track "${t}": needs at least one key`);for(let n=0;n<e.length;n++){if(!Number.isFinite(e[n]))throw TypeError(`track "${t}": key ${n} has a non-finite u`);if(n>0&&e[n]<e[n-1])throw RangeError(`track "${t}": keys must be in u order (key ${n} at ${e[n]} after ${e[n-1]})`);if(n>1&&e[n]===e[n-1]&&e[n]===e[n-2])throw RangeError(`track "${t}": at most two keys may share u = ${e[n]} (a cut)`)}}function pa(e,t,n){let r=0,i=t-1;for(;i-r>1;){let t=r+i>>1;e[t]<=n?r=t:i=t}return r}function ma(e,t,n,r,i,a){let o=e.length,s=Float64Array.from(e),c=Float64Array.from(t),l=new Uint8Array(o),u=new Float64Array(4*o),d=new Uint8Array(o),f=new Uint8Array(o);for(let e=0;e<o;e++){let t=aa(n[e],`track "${a}" key ${e}`);l[e]=t.code,t.bz&&u.set(t.bz,4*e),d[e]=r[e]&&r[e].corner?1:0,f[e]=r[e]&&r[e].rest||i&&i[e]?1:0}let p=e=>s[e+1]-s[e],m=e=>e>=1&&p(e-1)>0?e-1:-1,h=e=>e<=o-2&&p(e)>0?e:-1,g=e=>(c[e+1]-c[e])/p(e)*ua(l[e],u,4*e,!1),_=e=>(c[e+1]-c[e])/p(e)*ua(l[e],u,4*e,!0);function v(e){if(f[e])return 0;let t=m(e),n=h(e);if(t<0||n<0||l[t]===Zi||l[n]===Zi)return 0;let r=l[t]===Ki,i=l[n]===Ki;if(r&&i){let r=p(t),i=p(n),a=(c[e]-c[e-1])/r,o=(c[e+1]-c[e])/i;if(a*o<=0)return 0;let s=(a*i+o*r)/(r+i);return Math.sign(a)*Math.min(2*Math.abs(a),2*Math.abs(o),Math.abs(s))}return r?g(n):_(t)}let y=new Float64Array(o),b=new Float64Array(o);for(let e=0;e<o-1;e++)p(e)>0&&l[e]===Ki&&(y[e]=v(e),b[e]=v(e+1));let x=[];for(let e=0;e<o;e++){e<=o-2&&p(e)===0&&x.push(s[e]);let t=m(e),n=h(e);if(t<0||n<0)continue;if(l[t]===Zi&&c[t]!==c[e]){x.push(s[e]);continue}let r=l[t]===Ki?b[t]:l[t]===Zi?0:_(t),i=l[n]===Ki?y[n]:l[n]===Zi?0:g(n);if(!(r===i||Math.abs(r-i)<=ra*(1+Math.abs(r)+Math.abs(i)))&&!d[e])throw RangeError(`track "${a}": slope breaks at u = ${s[e]} (${r} vs ${i}); make one side smooth or declare { corner: true } on that key`)}return{n:o,U:s,V:c,code:l,bz:u,m0:y,m1:b,cuts:Object.freeze([...new Set(x)])}}function ha(e,t,n){let{U:r,V:i}=e,a=r[t+1]-r[t],o=(n-r[t])/a,s=i[t],c=i[t+1],l=e.code[t];if(l===Ki){let n=o*o,r=n*o;return(2*r-3*n+1)*s+(r-2*n+o)*a*e.m0[t]+(3*n-2*r)*c+(r-n)*a*e.m1[t]}return l===Zi?s:s+(c-s)*la(l,e.bz,4*t,o)}function ga(e,t){let{n,U:r,V:i}=e;return n===1||!(t>r[0])?t===r[0]&&n>1&&r[1]===r[0]?i[1]:i[0]:t>=r[n-1]?i[n-1]:ha(e,pa(r,n,t),t)}function _a(e,{name:t=`scalar`,range:n=null}={}){if(!Array.isArray(e))throw TypeError(`track "${t}": keys must be an array`);let r=e.map((e,n)=>da(e,`track "${t}" key ${n}`)),i=r.map(e=>e.u);fa(i,t),r.forEach((e,n)=>{if(typeof e.v!=`number`||!Number.isFinite(e.v))throw TypeError(`track "${t}": key ${n} needs a finite number`)});let a=ma(i,r.map(e=>e.v),r.map(e=>e.ease),r.map(e=>e.flags),null,t);return Object.freeze({type:`scalar`,name:t,range:n?Object.freeze([n[0],n[1]]):null,us:Object.freeze(i.slice()),cuts:a.cuts,evaluate(e){return ga(a,e)}})}function va(e,{name:t=`vec3`}={}){if(!Array.isArray(e))throw TypeError(`track "${t}": keys must be an array`);let n=e.map((e,n)=>da(e,`track "${t}" key ${n}`)),r=n.map(e=>e.u);fa(r,t);let i=r.length,a=new Float64Array(3*i);n.forEach((e,n)=>{let r=e.v;if(!r||r.length!==3||![r[0],r[1],r[2]].every(Number.isFinite))throw TypeError(`track "${t}": key ${n} needs [x, y, z] finite`);a[3*n]=r[0],a[3*n+1]=r[1],a[3*n+2]=r[2]});let o=new Uint8Array(i);n.forEach((e,n)=>{let r=e.flags.path;if(r!==void 0&&r!==`cr`&&r!==`linear`)throw TypeError(`track "${t}": key ${n} path must be 'cr' or 'linear'`);o[n]=r===`linear`?ta:ea});let s=n.map(e=>e.ease===`hold`),c=e=>r[e+1]-r[e],l=new Float64Array(i);for(let e=0;e<i-1;e++){let t=Math.hypot(a[3*e+3]-a[3*e],a[3*e+4]-a[3*e+1],a[3*e+5]-a[3*e+2]);l[e+1]=l[e]+(c(e)>0?Math.max(Math.sqrt(t),na):1)}let u=e=>e>=0&&e<=i-2&&c(e)>0&&!s[e],d=(e,t)=>(a[3*e+3+t]-a[3*e+t])/(l[e+1]-l[e]);function f(e,t){let n=u(e-1)?e-1:-1,r=u(e)?e:-1;return n>=0&&r>=0?o[n]===ea&&o[r]===ea?(a[3*e+t]-a[3*e-3+t])/(l[e]-l[e-1])-(a[3*e+3+t]-a[3*e-3+t])/(l[e+1]-l[e-1])+(a[3*e+3+t]-a[3*e+t])/(l[e+1]-l[e]):o[n]===ta?d(n,t):d(r,t):r>=0?d(r,t):n>=0?d(n,t):0}let p=new Float64Array(3*i),m=new Float64Array(3*i);for(let e=0;e<i-1;e++)if(u(e)&&o[e]===ea)for(let t=0;t<3;t++)p[3*e+t]=f(e,t),m[3*e+t]=f(e+1,t);let h=new Uint8Array(i);for(let e=1;e<i-1;e++){if(!u(e-1)||!u(e)||o[e-1]!==ta||o[e]!==ta||n[e].flags.corner)continue;let t=[d(e-1,0),d(e-1,1),d(e-1,2)],r=[d(e,0),d(e,1),d(e,2)],i=Math.hypot(t[0],t[1],t[2]),a=Math.hypot(r[0],r[1],r[2]);if(i<1e-9||a<1e-9)continue;let s=(t[0]*r[0]+t[1]*r[1]+t[2]*r[2])/(i*a);Math.acos(Math.min(1,Math.max(-1,s)))>ia&&(h[e]=1)}let g=ma(r,Array.from(l),n.map(e=>e.ease),n.map(e=>e.flags),h,t),_=g.U;function v(e,t){let n;if(n=i===1||!(t>_[0])?+(t===_[0]&&i>1&&_[1]===_[0]):t>=_[i-1]?i-1:-1,n>=0)return e[0]=a[3*n],e[1]=a[3*n+1],e[2]=a[3*n+2],e;n=pa(_,i,t);let r=l[n+1]-l[n],s=(ha(g,n,t)-l[n])/r,c=3*n;if(o[n]===ta)return e[0]=a[c]+(a[c+3]-a[c])*s,e[1]=a[c+1]+(a[c+4]-a[c+1])*s,e[2]=a[c+2]+(a[c+5]-a[c+2])*s,e;let u=s*s,d=u*s,f=2*d-3*u+1,h=(d-2*u+s)*r,v=3*u-2*d,y=(d-u)*r;return e[0]=f*a[c]+h*p[c]+v*a[c+3]+y*m[c],e[1]=f*a[c+1]+h*p[c+1]+v*a[c+4]+y*m[c+1],e[2]=f*a[c+2]+h*p[c+2]+v*a[c+5]+y*m[c+2],e}return Object.freeze({type:`vec3`,name:t,us:Object.freeze(r.slice()),cuts:g.cuts,evaluate(e){return v([0,0,0],e)},evaluateInto:v})}function ya(e,{name:t=`step`}={}){if(!Array.isArray(e))throw TypeError(`track "${t}": keys must be an array`);let n=e.map((e,n)=>da(e,`track "${t}" key ${n}`)),r=n.map(e=>e.u);fa(r,t);let i=n.map(e=>e.v),a=Float64Array.from(r),o=a.length;return Object.freeze({type:`step`,name:t,us:Object.freeze(r.slice()),cuts:Object.freeze([...new Set(r.slice(1))]),evaluate(e){return e>=a[0]?e>=a[o-1]?i[o-1]:i[pa(a,o,e)]:i[0]}})}function ba(e,t,{name:n=`affine`,range:r=null}={}){if(!Number.isFinite(e)||!Number.isFinite(t))throw TypeError(`track "${n}": at0 and perU must be finite`);return Object.freeze({type:`affine`,name:n,range:r?Object.freeze([r[0],r[1]]):null,at0:e,perU:t,us:Object.freeze([]),cuts:Object.freeze([]),evaluate(n){return e+t*n}})}function xa(e,t=`track`){if(typeof e==`number`)return _a([[0,e]],{name:t});if(Array.isArray(e))return e.length===3&&e.every(e=>typeof e==`number`)?va([[0,e]],{name:t}):_a(e,{name:t});if(!e||typeof e!=`object`)throw TypeError(`track "${t}": cannot build a track from ${JSON.stringify(e)}`);let n=e.type||`scalar`;if(n===`scalar`)return _a(e.keys,{name:t,range:e.range||null});if(n===`vec3`)return va(e.keys,{name:t});if(n===`step`)return ya(e.keys,{name:t});if(n===`affine`)return ba(e.at0,e.perU,{name:t,range:e.range||null});throw TypeError(`track "${t}": unknown type "${n}"`)}Object.freeze([`land`,`port`]);var Sa=Object.freeze([`cut`,`fade`,`lift`,`reveal`,`dissolve`]),Ca=Object.freeze({land:1440/900,port:390/844});function wa(e,t){return e>0&&t>0&&e/t<.8?`port`:`land`}var Ta=Math.PI/180,Ea=89.9,Da=Symbol(`timeline.spare`),Oa=e=>e<=0?0:e>=1?1:e*e*(3-2*e);function ka(){return{position:[0,0,0],target:[0,0,-1],fov:50,roll:0}}function Aa(e){if(e[Da])return e[Da];let t={a0:{id:``,weight:1},a1:{id:``,weight:0},transition:{from:``,to:``,t:0,kind:`fade`},cameraB:ka()};return Object.defineProperty(e,Da,{value:t,enumerable:!1}),Array.isArray(e.acts)||(e.acts=[]),e.camera&&Array.isArray(e.camera.position)&&Array.isArray(e.camera.target)||(e.camera=ka()),e.params&&typeof e.params==`object`||(e.params={}),t}function ja(){let e={u:0,section:0,beat:-1,viewport:`land`,acts:[],transition:null,camera:ka(),cameraB:null,params:{}};return Aa(e),e}function Ma(e,t,n,r,i,a,o,s,c,l){let u=Math.max(-89.9,Math.min(Ea,r))*Ta,d=n*Ta,f=Math.cos(u),p=Math.sin(u),m=Math.cos(d),h=Math.sin(d),g=i/Math.tan(.5*a*Ta),_=f*m,v=p,y=-f*h,b=-h,x=-m,S=-m*p,C=f,w=h*p,T=2*s*i*l,E=2*c*i,D=t[0]-b*T+S*E,O=t[1]+C*E,k=t[2]-x*T+w*E;return e.target[0]=D,e.target[1]=O,e.target[2]=k,e.position[0]=D+_*g,e.position[1]=O+v*g,e.position[2]=k+y*g,e.fov=a,e.roll=o,e}function Na(e){if(!e||typeof e!=`object`||Array.isArray(e))return!1;let t=Object.getPrototypeOf(e);return t===Object.prototype||t===null}function Pa(e,t){if(t===void 0)return e;if(!Na(e)||!Na(t))return t;let n={...e};for(let r of Object.keys(t))n[r]=Pa(e[r],t[r]);return n}function Fa(e,t,n){return _a(e==null?[[0,n]]:typeof e==`number`?[[0,e]]:Array.isArray(e)?e:e.keys,{name:t})}function Ia(e,t){if(!e)throw TypeError(`${t}: missing`);return Array.isArray(e)&&e.length===3&&e.every(e=>typeof e==`number`)?va([[0,e]],{name:t}):va(Array.isArray(e)?e:e.keys,{name:t})}function La(e,t){if(!e||typeof e!=`object`)throw TypeError(`${t}: missing camera rig`);if(e.rig===`look`)return{rig:`look`,position:Ia(e.position,`${t}.position`),target:Ia(e.target,`${t}.target`),fov:Fa(e.fov,`${t}.fov`,50),roll:Fa(e.roll,`${t}.roll`,0)};if(e.rig===`orbit`){if(e.size===void 0)throw TypeError(`${t}: an orbit rig needs size (frame half-height at the subject)`);return{rig:`orbit`,subject:Ia(e.subject,`${t}.subject`),az:Fa(e.az,`${t}.az`,-90),el:Fa(e.el,`${t}.el`,0),size:Fa(e.size,`${t}.size`,1),fov:Fa(e.fov,`${t}.fov`,50),roll:Fa(e.roll,`${t}.roll`,0),shiftX:Fa(e.shiftX,`${t}.shiftX`,0),shiftY:Fa(e.shiftY,`${t}.shiftY`,0)}}throw TypeError(`${t}: rig must be 'look' or 'orbit'`)}function Ra(e){let t=new Set;for(let n of Object.keys(e))if(e[n]&&e[n].cuts)for(let r of e[n].cuts)t.add(r);return[...t].sort((e,t)=>e-t)}function za(e,t,n,r,i){return e.rig===`look`?(e.position.evaluateInto(r.position,t),e.target.evaluateInto(r.target,t),r.fov=e.fov.evaluate(t),r.roll=e.roll.evaluate(t),r):(e.subject.evaluateInto(i,t),Ma(r,i,e.az.evaluate(t),e.el.evaluate(t),e.size.evaluate(t),e.fov.evaluate(t),e.roll.evaluate(t),e.shiftX.evaluate(t),e.shiftY.evaluate(t),n))}function Ba(e,t,n){if(!e||typeof e!=`object`)throw TypeError(`createTimeline: missing the ${n} choreography`);let r=e.params||{},i=Object.keys(r).map(e=>{let t=r[e],i=t&&t.range;if(!Array.isArray(i)||i.length!==2||!(i[0]<=i[1]))throw TypeError(`createTimeline: param "${e}" needs range [lo, hi]`);let a=xa(t,`${n}.params.${e}`);if(a.type!==`scalar`&&a.type!==`affine`)throw TypeError(`createTimeline: param "${e}" must be a scalar or affine track`);return{name:e,track:a,range:[i[0],i[1]]}}),a={};for(let r of t)a[r]=La(e.cameras&&e.cameras[r],`${n}.cameras.${r}`);return{params:i,cameras:a}}function Va(e,t){if(!Array.isArray(e))throw TypeError(`createTimeline: transitions must be an array`);let n=e.map((e,n)=>{let r=`createTimeline: transition ${n}`;if(!e||!t.includes(e.from)||!t.includes(e.to))throw TypeError(`${r}: from and to must be acts`);if(!Sa.includes(e.kind))throw TypeError(`${r}: unknown kind "${e.kind}"`);let[i,a]=e.u||[];if(!Number.isInteger(a)||a<1||a>=20)throw RangeError(`${r}: must end on a section boundary`);if(z[a-1].act!==e.from||z[a].act!==e.to)throw RangeError(`${r}: section ${a} is where ${z[a-1].act} hands over to ${z[a].act}`);if(!(i>=a-1&&i<=a))throw RangeError(`${r}: the window must sit inside section ${a-1}`);if(e.kind!==`cut`&&!(i<a))throw RangeError(`${r}: a ${e.kind} needs a window`);return Object.freeze({from:e.from,to:e.to,a:i,b:a,kind:e.kind})}).sort((e,t)=>e.b-t.b);for(let e=1;e<20;e++){if(z[e].act===z[e-1].act)continue;let t=n.filter(t=>t.b===e).length;if(t!==1)throw RangeError(`createTimeline: the hand-over at section ${e} needs exactly one transition (found ${t})`)}if(n.some(e=>z[e.b].act===z[e.b-1].act))throw RangeError(`createTimeline: a transition sits where no act changes`);return Object.freeze(n)}function Ha(e){if(!e||typeof e!=`object`)throw TypeError(`createTimeline: choreography is required`);let t=Array.isArray(e.acts)?e.acts.slice():[];for(let e of z)if(!t.includes(e.act))throw TypeError(`createTimeline: act "${e.act}" (section ${e.id}) is not in choreo.acts`);let n=Va(e.transitions||[],t),r={land:Ba(e.land,t,`land`),port:Ba(Pa(e.land,e.port),t,`port`)},i=r.land.params.map(e=>e.name),a=r.port.params.map(e=>e.name);if(i.join()!==a.join())throw TypeError(`createTimeline: land and port must declare the same params`);let o=Object.freeze(Object.fromEntries(r.land.params.map(e=>[e.name,Object.freeze(e.range)]))),s=new Float64Array(3);function c(e){let t=e===`land`?r.land:e===`port`?r.port:null;if(!t)throw TypeError(`timeline: viewport must be 'land' or 'port' (got ${JSON.stringify(e)})`);return t}function l(e){for(let t=0;t<n.length;t++){let r=n[t];if(e>=r.a&&e<r.b)return r}return null}let u=e=>Number.isFinite(e)?e<0?0:e>20?20:e:0,d=(e,t)=>Number.isFinite(t)&&t>0?t:Ca[e];function f(e,t,n,r){let i=c(n),a=e,o=Aa(a),f=u(t),p=d(n,r);a.u=f,a.section=ne(f),a.beat=te(f),a.viewport=n;let m=l(f);if(m){let e=Oa((f-m.a)/(m.b-m.a));o.a0.id=m.from,o.a0.weight=1-e,o.a1.id=m.to,o.a1.weight=e,a.acts[0]=o.a0,a.acts[1]=o.a1,a.acts.length=2,o.transition.from=m.from,o.transition.to=m.to,o.transition.t=e,o.transition.kind=m.kind,a.transition=o.transition,za(i.cameras[m.from],f,p,a.camera,s),a.cameraB=za(i.cameras[m.to],f,p,o.cameraB,s)}else{let e=z[a.section].act;o.a0.id=e,o.a0.weight=1,a.acts[0]=o.a0,a.acts.length=1,a.transition=null,za(i.cameras[e],f,p,a.camera,s),a.cameraB=null}let h=a.params;for(let e=0;e<i.params.length;e++)h[i.params[e].name]=i.params[e].track.evaluate(f);return a}return Object.freeze({params:Object.freeze(i),ranges:o,transitions:n,acts:Object.freeze(t),evaluate(e,t,n){return f(ja(),e,t,n)},evaluateInto:f,cameraInto(e,t,n,r,i){let a=c(r).cameras[t];if(!a)throw TypeError(`timeline: unknown act "${t}"`);return za(a,u(n),d(r,i),e,s)},cuts(e){let n=c(e);return t.flatMap(e=>Ra(n.cameras[e]).map(t=>({act:e,u:t})))}})}var Ua=Math.PI/180,Wa=e=>[e[0],e[2],-e[1]];function Ga(e,t,n=36,r=16/9){let i=n/2/e,a=t>=r?i/r:i/t;return 2*Math.atan(a)/Ua}var Ka=(e,t)=>e*Math.tan(.5*t*Ua),qa=[`corner`,`rest`];function Ja(e){let t={};for(let n of qa)e[n]&&(t[n]=!0);return t}function Ya(e){let t={subject:[],az:[],el:[],size:[],fov:[],roll:[],shiftX:[],shiftY:[]},n={roll:0,shift:[0,0]};for(let r of e){let e={...n,...r};r.dist===void 0?r.size===void 0&&(e.size=n.size):e.size=Ka(r.dist,e.fov),delete e.dist;for(let t of[`subject`,`az`,`el`,`size`,`fov`])if(e[t]===void 0)throw TypeError(`orbitRig: key at u = ${e.u} has no ${t}`);let i=r.ease,a=Ja(r);t.subject.push([e.u,e.subject.slice(),i,a]),t.az.push([e.u,e.az,i,a]),t.el.push([e.u,e.el,i,a]),t.size.push([e.u,e.size,i,a]),t.fov.push([e.u,e.fov,i,a]),t.roll.push([e.u,e.roll,i,a]),t.shiftX.push([e.u,e.shift[0],i,a]),t.shiftY.push([e.u,e.shift[1],i,a]),n={...e,ease:void 0,corner:void 0,rest:void 0}}return{rig:`orbit`,subject:{type:`vec3`,keys:t.subject},az:{keys:t.az},el:{keys:t.el},size:{keys:t.size},fov:{keys:t.fov},roll:{keys:t.roll},shiftX:{keys:t.shiftX},shiftY:{keys:t.shiftY}}}function Xa(e){let t={position:[],target:[],fov:[],roll:[]},n={roll:0};for(let r of e){let e={...n,...r};for(let t of[`pos`,`tgt`,`fov`])if(e[t]===void 0)throw TypeError(`lookRig: key at u = ${e.u} has no ${t}`);let i=r.ease,a=Ja(r),o=r.path?{...a,path:r.path}:a;t.position.push([e.u,e.pos.slice(),i,o]),t.target.push([e.u,e.tgt.slice(),i,o]),t.fov.push([e.u,e.fov,i,a]),t.roll.push([e.u,e.roll,i,a]),n={...e,ease:void 0,path:void 0,corner:void 0,rest:void 0}}return{rig:`look`,position:{type:`vec3`,keys:t.position},target:{type:`vec3`,keys:t.target},fov:{keys:t.fov},roll:{keys:t.roll}}}function Za(e,t){let n=e.size===void 0?Ka(e.dist,e.fov):e.size,r=e.shift||[0,0];return Ma({position:[0,0,0],target:[0,0,0],fov:0,roll:0},e.subject,e.az,e.el,n,e.fov,e.roll||0,r[0],r[1],t)}function Qa(e,t){let n=Ya(e),r=va(n.subject.keys,{name:`sampler.subject`}),i={};for(let e of[`az`,`el`,`size`,`fov`,`roll`,`shiftX`,`shiftY`])i[e]=_a(n[e].keys,{name:`sampler.${e}`});return e=>Ma({position:[0,0,0],target:[0,0,0],fov:0,roll:0},r.evaluate(e),i.az.evaluate(e),i.el.evaluate(e),i.size.evaluate(e),i.fov.evaluate(e),i.roll.evaluate(e),i.shiftX.evaluate(e),i.shiftY.evaluate(e),t)}function $a(e,t){let n=e[0]-t[0],r=e[1]-t[1],i=e[2]-t[2],a=Math.hypot(n,i);return{az:Math.atan2(-i,n)/Ua,el:Math.atan2(r,a)/Ua,dist:Math.hypot(n,r,i)}}function eo({position:e,yaw:t,scale:n}){let r=Math.cos(t*Ua),i=Math.sin(t*Ua);return{toLocal(t){let a=t[0]-e[0],o=t[1]-e[1],s=t[2]-e[2];return[(a*r-s*i)/n,o/n,(a*i+s*r)/n]},toWorld(t){let a=t[0]*n,o=t[2]*n;return[e[0]+a*r+o*i,e[1]+t[1]*n,e[2]-a*i+o*r]}}}function to(e){if(e&&typeof e==`object`&&!Object.isFrozen(e)){for(let t of Object.values(e))to(t);Object.freeze(e)}return e}var no=2.5*Math.PI,ro=7.25,io=Object.freeze({from:ro,to:ro+2*Math.PI/no,gear:`pinion`,toothFromArm:180,az:Object.freeze({land:32,port:-2}),el:37,dist:.86}),ao=Xo((io.az.land-io.toothFromArm)*Ua-no*io.from,2*Math.PI),oo=1.3,so=Object.freeze({fov:4,el:89}),co=Object.freeze(Ko()),lo=Object.freeze(qo()),uo=19.85,fo=Object.freeze({lift:Object.freeze([3.7,4]),fade:Object.freeze([8.72,9]),dissolve:Object.freeze([17.2,18])}),po=Object.freeze([`plate`,`gears`,`room`,`space`]),mo=Object.freeze([Object.freeze({from:`plate`,to:`gears`,u:fo.lift,kind:`lift`}),Object.freeze({from:`gears`,to:`room`,u:fo.fade,kind:`fade`}),Object.freeze({from:`room`,to:`space`,u:fo.dissolve,kind:`dissolve`})]),ho=[`Night. One orange point. Nothing else but the name.`,`The point draws a single ink line; the line closes into a circle.`,`The drawing fills in like a draughtsman's plate. Still completely flat.`,`The camera tilts off-axis; the wheel lifts off the paper, its outline left as a ghost.`,`Macro, inside the main gear's teeth. Dark, close, only metal edges.`,`A second gear (the idler) slides in and meshes.`,`The pinion arrives; the train is 1:2:4 and turns with scroll.`,`The camera rides one pinion tooth round a full revolution.`,`Rising up the column as the three inner rings arrive, then above them into darkness.`,`False space: the armillary in a dark room before the window reads as planets and stars.`,`The lamp warms; the room lights come up: a desk at 3 a.m., the half-built instrument on it.`,`The room, wide: window with real stars, lamp, the instrument.`,`The instrument at the centre, unfinished (no arms yet).`,`The left monitor (model evaluation curves); the fourth ring arrives.`,`The desk and the middle monitor (ZeroMind); the arms arrive.`,`The board on the back wall; two spheres arrive.`,`The bed and the window, northern lights outside; the other spheres arrive.`,`The lamp clicks off; the room goes dark round the instrument and the window; the stars are all around.`,`The final frame: the instrument afloat, seven labelled spheres on seven arms.`,`Contact: the rings close into one sealed sphere among the stars.`],go=Object.freeze(z.map((e,t)=>{let n=mo.find(e=>e.u[1]===t);return Object.freeze({section:t,id:e.id,act:e.act,enter:n?n.kind:null,frame:ho[t]})})),_o=Object.freeze([{level:.06,u:[3.7,3.95],part:`main gear on its engraved floor (it is the lifted wheel)`},{level:.12,u:[5.1,5.6],part:`idler`},{level:.18,u:[6.1,6.55],part:`pinion`},{level:.24,u:[7.05,7.35],part:`crank handle`},{level:.44,u:[8,8.62],part:`base and column, then the three inner rings one after another`},{level:.5,u:[9,9.4],part:`globe`},{level:.6,u:[13.1,13.5],part:`fourth ring (the loupe lens ring)`},{level:.7,u:[14.1,14.5],part:`the seven arms, retracted (the plotter drum axle)`},{level:.8,u:[15.1,15.5],part:`two spheres (the balance pans)`},{level:1,u:[16.1,16.8],part:`the other five spheres (points of light from the window)`}].map(e=>Object.freeze({...e,u:Object.freeze(e.u)})));function vo(){let e=[[0,0]],t=0;for(let n of _o)e.push([n.u[0],t],[n.u[1],n.level]),t=n.level;return e}var yo=[0,1],bo={draw:{range:yo,keys:[[0,0],[1.08,0],[1.85,.25],[2.1,.25],[2.85,1]]},lift:{range:yo,keys:[[0,0],[3.12,0],[3.6,1]]},train:{range:[0,3],keys:[[0,0],[3.05,0],[3.25,1],[5.1,1],[5.6,2],[6.1,2],[6.55,3]]},crank:{type:`affine`,at0:ao,perU:no,range:[0,1/0]},build:{range:yo,keys:vo()},lights:{range:yo,keys:[[0,0],[10,0],[10.9,1],[17.06,1],[17.12,0]]},screens:{range:yo,keys:[[0,0],[10.64,0],[10.93,1],[17.06,1],[17.18,0]]},aurora:{range:yo,keys:[[0,0],[9.9,0],[10.8,.55],[11.4,.8],[15.6,.8],[16.3,1],[16.8,1],[17.35,.9],[17.9,0]]},galaxy:{range:yo,keys:[[0,0],[8.75,0],[9.15,.35],[9.9,.35],[10.8,.75],[17.25,.75],[17.95,1]]},brass:{range:yo,keys:[[0,0],[8.72,0],[8.72,1],[17,1],[17.55,1],[17.98,0]]},arms:{range:yo,keys:[[0,0],[17,0],[17.58,0],[18,1]]},stones:{range:yo,keys:[[0,0],[18.02,0],[18.3,1],[18.86,1],[19.1,0]]},contact:{range:yo,keys:[[0,0],[19.1,0],[19.7,1]]}};Object.freeze(Object.fromEntries(Object.entries(bo).map(([e,t])=>[e,Object.freeze(t.range.slice())])));var xo=.045,So=e=>[Math.cos(e*Ua),0,-Math.sin(e*Ua)],Co=$o(So(-40),72*xo/2),wo=Zo(Co,$o(So(66),36*xo/2)),To=Object.freeze({idler:Object.freeze(Co),pinion:Object.freeze(wo),mainIdler:Object.freeze(Zo($o(So(-40),48*xo/2),[0,.06,0])),inside:Object.freeze([1.518,.065,.42]),rim:Object.freeze(Zo($o(So(-100),48*xo/2),[0,.05,0])),idlerPinion:Object.freeze(Zo(Zo(Co,$o(So(66),24*xo/2)),[0,.07,0])),hub:Object.freeze(Zo(wo,[0,.1,0]))}),Eo=[{u:0,subject:[0,0,0],az:-90,el:so.el,size:450/147,fov:so.fov,shift:[.124,0]},{u:.75,size:3},{u:1.2,size:2.85},{u:1.9,size:2.3},{u:2.25,size:450/220},{u:2.85,size:2.02},{u:3.08,el:87.5,fov:5}],Do=[{u:0,subject:[0,0,0],az:-90,el:so.el,size:422/108,fov:so.fov,shift:[0,.108]},{u:.75,size:3.86},{u:1.2,size:3.8},{u:1.9,size:3.74},{u:2.25,size:422/114},{u:2.85,size:3.66},{u:3.08,el:87.5,fov:5}],Oo=[{u:3.45,subject:[.35,-.6000000000000001,0],az:-90,el:36,dist:9,fov:30,shift:[.2,.03]},{u:3.62,subject:[.4,-.55,.05],az:-94,el:33,dist:8.4,fov:30,shift:[.19,.02]},{u:3.82,subject:[.7,-.05,.5],az:-112,el:22,dist:2.2,fov:32,shift:[.15,0]},{u:4,subject:[.12,.03,.9],az:-116,el:25,dist:1.6,fov:33,shift:[.13,-.02]},{u:4.4,subject:To.rim,az:-72,el:30,dist:1.22,shift:[.12,-.04]}],ko=[{u:3.45,subject:[0,-.7000000000000001,.3],az:-90,el:40,dist:13.5,fov:34,shift:[0,.12]},{u:3.62,subject:[.05,-.68,.32],az:-93,el:37,dist:12.6,fov:34,shift:[0,.12]},{u:3.82,subject:[.65,-.1,.5],az:-110,el:24,dist:2.8,fov:44,shift:[.04,.12]},{u:4,subject:[.12,.03,.9],az:-113,el:28,dist:1.95,fov:50,shift:[.03,.12]},{u:4.4,subject:To.rim,az:-76,el:34,dist:1.55,fov:52,shift:[0,.12]}];function Ao(e){let t=e===`land`,n=io.az[e];return[...t?Oo:ko,{u:4.85,subject:To.rim,az:t?-68:-72,el:t?31:35,dist:t?1.12:1.45},{u:5.3,subject:To.mainIdler,az:t?-118:-112,el:t?33:37,dist:t?1.42:1.8,shift:t?[.08,-.05]:[0,.1]},{u:5.75,subject:To.mainIdler,az:t?-126:-120,el:t?34:38,dist:t?1.3:1.68},{u:6.08,subject:[1.25,.08,.72],az:t?-82:-95,el:t?46:48,dist:t?1.35:1.7,shift:t?[.06,-.04]:[0,.1]},{u:6.42,subject:To.idlerPinion,az:t?-34:-62,el:t?33:35,dist:t?1.16:1.5,shift:t?[.1,-.05]:[0,.1]},{u:6.7,subject:To.idlerPinion,az:t?-30:-59,el:t?33:35,dist:t?1.1:1.45},{u:7,subject:To.idlerPinion,az:t?-27:-57,el:t?34:36,dist:t?1.06:1.42},{u:io.from,subject:To.hub,az:n,el:io.el+(t?0:2),dist:t?io.dist:1.05,fov:t?40:52,shift:t?[.1,-.02]:[0,.1],ease:`linear`},{u:io.to,az:n+360},{u:8.3,subject:[.3,.75,.1],az:n+425,el:t?22:24,dist:t?2:2.5,fov:t?40:52,shift:t?[.08,0]:[0,.1]},{u:8.44,subject:[.2,.95,.05],az:n+448,el:t?13:15,dist:t?2.6:3.2,fov:t?42:54,shift:t?[.07,0]:[0,.08]},{u:8.6,subject:[0,3.5,0],az:n+480,el:t?-19:-17,dist:t?3.1:3.8,fov:t?44:56,shift:t?[.07,0]:[0,.1]},{u:8.8,subject:[0,3.85,0],az:n+496,el:t?-22:-20,dist:t?3.3:4,shift:t?[.08,0]:[0,.12]},{u:9,subject:[0,4,0],az:n+502,el:t?-23:-21,dist:t?3.5:4.2,shift:t?[.08,0]:[0,.14]}]}var jo=(e,t)=>({...e,subject:[e.subject[0],e.subject[1]+t,e.subject[2]]}),Mo=Ca.land,No={land:{falsespace:Yo({pos:[-.01,-.1647,.309],tgt:[-.25,.2103,-.587],fov:28,drift:[.015,.012,-.01],pan:[.005,.022,0]}),filament:Yo({pos:[-.02,-.1307,.42],tgt:[-.146,.2913,-.4778],fov:36}),reveal:Jo({pos:[-.8,1.1,-5.95],tgt:[-1.42,1.06,-6.5],fov:38}),deskReveal:Jo({pos:[-.3,1.25,-5.1],tgt:[-1.45,1,-6.45],fov:48}),wide:{pos:Wa([.2,.9,1.35]),tgt:Wa([.73,5.4,1.67]),fov:Ga(16,Mo),drift:[-.02,-.01,.06],pan:[-1.03,-.12,-.15]},instrument:Yo({pos:[.562,.1383,.974],tgt:[.1162,-.0843,.107],fov:Ga(38,Mo),drift:[-.06,-.01,-.07]}),screens:{pos:Wa([-3,5.32,1.24]),tgt:Wa([-4.2,6.42,1.07]),fov:Ga(30,Mo),drift:[-.09,-.02,-.08]},desk:{pos:Wa([-3.1,4.05,1.75]),tgt:Wa([-3,6.45,.92]),fov:Ga(21,Mo),drift:[.06,-.03,-.11]},wall:{pos:Wa([1.15,2.3,1.7]),tgt:Wa([1.15,6.96,1.62]),fov:Ga(31,Mo),drift:[0,0,-.16]},bed:{pos:Wa([1.83,3.48,1.4]),tgt:Wa([3.95,5.45,.64]),fov:Ga(28,Mo),drift:[.04,.02,-.08]}},port:{falsespace:Yo({pos:[.05,-.1397,.22],tgt:[-.1744,.3876,-.5993],fov:44,drift:[-.012,.01,0],pan:[-.007,.012,0]}),filament:Yo({pos:[.02,-.1307,.38],tgt:[-.0467,.3487,-.495],fov:52}),reveal:Jo({pos:[-.82,1.1,-5.97],tgt:[-1.4,1.08,-6.48],fov:52}),deskReveal:Jo({pos:[-.25,1.35,-5],tgt:[-1.42,1.02,-6.42],fov:62}),wide:{pos:Wa([.6,1.2,1.45]),tgt:Wa([-2.4,6.3,1.72]),fov:78,drift:[.02,0,.05],pan:[.4,-.06,0]},instrument:Yo({pos:[.475,.1383,1.019],tgt:[.0504,.045,.1184],fov:50,drift:[-.06,-.01,-.07]}),screens:{pos:Wa([-3.3,5.3,1.32]),tgt:Wa([-4.03,6.44,1.06]),fov:68,drift:[-.05,-.01,-.05]},desk:{pos:Wa([-3.05,4.5,1.62]),tgt:Wa([-3.05,6.6,1.06]),fov:72,drift:[0,-.02,-.1]},wall:{pos:Wa([1.15,1.2,1.75]),tgt:Wa([1.15,6.96,2.3]),fov:76,drift:[0,0,-.16]},bed:{pos:Wa([2.72,3.86,1.6]),tgt:Wa([3.8,5.95,.82]),fov:72,drift:[.04,.01,-.08]}}},Po=[[8.72,`falsespace`,-.3],[9.3,`falsespace`,.3],[9.75,`falsespace`,1],[10.18,`filament`,0],[10.45,`reveal`,0],[10.84,`deskReveal`,0],[11.3,`wide`,1],[11.72,`wide`,0],[12.3,`instrument`,-.5],[12.7,`instrument`,.5],[13.3,`screens`,-.5],[13.7,`screens`,.5],[14.3,`desk`,-.5],[14.7,`desk`,.5],[15.3,`wall`,-.5],[15.7,`wall`,.5],[16.3,`bed`,-.5],[16.7,`bed`,.5]],Fo={land:{subject:[0,2.4,0],az:-90,el:15,dist:16.3,fov:30,shift:[.09,-.035]},port:{subject:[0,1.9,0],az:-90,el:60,dist:17,fov:46,shift:[0,.12]}},Io={land:{subject:[0,3.55,0],az:-100,el:4,dist:10.9,fov:30,shift:[.22,.02]},port:{subject:[0,3.35,0],az:-100,el:5,dist:14.9,fov:36,shift:[0,.18]}},Lo={land:[{u:17.2,angle:8,range:2.8,height:1.16,look:1.03,fov:42,shift:[.07,.03]},{u:17.45,angle:10,range:2.12,height:1.15,look:1.03,fov:38,shift:[.07,.025]},{u:17.7,angle:16,range:1.5,height:1.2,look:1.04,fov:34,shift:[.07,.01]}],port:[{u:17.2,angle:8,range:3.1,height:1.2,look:1.12,fov:56,shift:[0,-.06]},{u:17.45,angle:10,range:2.35,height:1.2,look:1.11,fov:54,shift:[0,-.04]},{u:17.7,angle:16,range:1.7,height:1.3,look:1.08,fov:51,shift:[0,0]}]},Ro={land:{u:17.87,subject:[0,3.3,0],az:-90,el:15,dist:17.6,fov:31,shift:[.09,-.035]},port:{u:17.87,subject:[0,2.7,0],az:-90,el:54,dist:18.4,fov:47,shift:[0,.12]}};function zo(e){let t=eo(co),[n,,r]=co.position;return Lo[e].map(e=>{let i=e.angle*Ua,a=t.toLocal([n,e.look,r]),o=$a(t.toLocal([n+e.range*Math.sin(i),e.height,r+e.range*Math.cos(i)]),a);return{u:e.u,subject:a,az:o.az,el:o.el,dist:o.dist,fov:e.fov,shift:e.shift}})}function Bo(e){let t=Fo[e],n=Io[e];return[...zo(e),Ro[e],{u:18,...t},{u:18.85,...t,az:t.az+3,el:t.el+.5,dist:t.dist-.2},{u:19.2,...n},{u:20,...n,az:n.az-3,el:n.el+.5,dist:n.dist-.2}]}function Vo(e){let t=No[e],n=Po.map(([e,n,r])=>{let i=t[n],a=i.drift||[0,0,0],o=i.pan||[0,0,0];return{u:e,pos:Zo(i.pos,$o(a,r)),tgt:Zo(i.tgt,$o(o,r)),fov:i.fov}}),r=eo(co),i=Qa(Bo(e),Ca[e]),[a,o]=fo.dissolve;for(let e=0;e<=Ho;e++){let t=a+(o-a)*e/Ho,s=i(t);n.push({u:t,pos:r.toWorld(s.position),tgt:r.toWorld(s.target),fov:s.fov})}return n}var Ho=24,Q={plateLeft:[-.86,-.26,-.3,.3],liftLeft:[-.86,-.12,-.25,.34],wordLowLeft:[-.86,-.84,.1,-.3],midLeft:[-.86,-.36,-.25,.4],upperLeft:[-.86,-.1,-.15,.34],lowLeft:[-.86,-.82,-.3,-.36],wideTop:[-.86,.22,-.3,.74],lowRight:[.32,-.8,.9,-.4],screensTop:[-.86,.2,-.18,.82],deskLowRight:[.3,-.86,.94,-.25],wallLow:[-.93,-.9,-.28,-.3],bedTop:[-.91,.3,-.25,.9],dissolveLow:[-.86,-.91,-.3,-.5],portTop:[-.86,.36,.86,.88],portTopTall:[-.86,.25,.86,.88],portWordTop:[-.86,.52,.86,.9],portBottom:[-.86,-.88,.86,-.4]},Uo=[[Q.plateLeft,Q.portTop],[Q.plateLeft,Q.portTopTall],[Q.liftLeft,Q.portTop],[Q.wordLowLeft,Q.portWordTop],[Q.wordLowLeft,Q.portWordTop],[Q.wordLowLeft,Q.portWordTop],[Q.wordLowLeft,Q.portWordTop],[Q.midLeft,Q.portTopTall],[Q.upperLeft,Q.portTop],[Q.lowLeft,Q.portTop],[Q.wideTop,Q.portBottom],[Q.lowRight,Q.portTop],[Q.screensTop,Q.portTopTall],[Q.deskLowRight,Q.portTopTall],[Q.wallLow,Q.portBottom],[Q.bedTop,Q.portTopTall],[Q.dissolveLow,Q.portTop]],Wo=Object.freeze(Uo.map(([e,t],n)=>Object.freeze({index:n,id:z[n+1].id,section:n+1,quiet:Object.freeze({land:Object.freeze(e.slice()),port:Object.freeze(t.slice())})})));if(Wo.length!==17)throw Error(`choreography: BEATS must cover every text beat`);var Go=to({version:1,acts:po.slice(),sections:go,transitions:mo.map(e=>({...e,u:e.u.slice()})),land:{params:bo,cameras:{plate:Ya([...Eo,...Oo.map(e=>jo(e,oo))]),gears:Ya(Ao(`land`)),room:Xa(Vo(`land`)),space:Ya(Bo(`land`))}},port:{cameras:{plate:Ya([...Do,...ko.map(e=>jo(e,oo))]),gears:Ya(Ao(`port`)),room:Xa(Vo(`port`)),space:Ya(Bo(`port`))}}});function Ko(){let e={position:[-1.3,.77,-6.22],height:.414,yaw:.4887},t=e.height/6.09,n=e.position;return{position:[n[0],n[1]- -.62*t,n[2]],yaw:e.yaw/Ua,scale:t}}function qo(){let e=Wa([-1.38,6.4,1.06]),t=.118/1.5;return{position:[e[0],e[1]-3.95*t,e[2]],yaw:28,scale:t}}function Jo(e){let t=eo(lo),n=eo(co),r=e=>n.toWorld(t.toLocal(e)),i=r([0,0,0]),a=e=>e?Qo(r(e),i):void 0,o={...e,pos:r(e.pos),tgt:r(e.tgt)};return e.drift&&(o.drift=a(e.drift)),e.pan&&(o.pan=a(e.pan)),o}function Yo(e){let t=co.position,n=[t[0],t[1]+3.95*co.scale,t[2]];return{...e,pos:Zo(n,e.pos),tgt:Zo(n,e.tgt)}}function Xo(e,t){return(e%t+t)%t}function Zo(e,t){return[e[0]+t[0],e[1]+t[1],e[2]+t[2]]}function Qo(e,t){return[e[0]-t[0],e[1]-t[1],e[2]-t[2]]}function $o(e,t){return[e[0]*t,e[1]*t,e[2]*t]}var es=Math.PI/180;function ts(e){return Number.isFinite(e)?e<0?0:e>1?1:e:0}var $=(e,t,n)=>e+(t-e)*n;function ns(e,t,n){let r=ts((n-e)/(t-e));return r*r*(3-2*r)}function rs(e){return e<=.04045?e/12.92:((e+.055)/1.055)**2.4}function is(e,t=1){let n=parseInt(e.replace(`#`,``),16);return[rs((n>>16&255)/255)*t,rs((n>>8&255)/255)*t,rs((n&255)/255)*t]}function as(e,t){let n=e*es,r=t*es;return[Math.cos(r)*Math.cos(n),Math.sin(r),-Math.cos(r)*Math.sin(n)]}function os(e,t,n,r){for(let i=0;i<e.length;i++)e[i]=t[i]+(n[i]-t[i])*r;return e}function ss(e,t,n,r){os(e,t,n,r);let i=Math.hypot(e[0],e[1],e[2])||1;return e[0]/=i,e[1]/=i,e[2]/=i,e}var cs=Object.freeze({night:`#100f15`,stage:`#08070b`,ink:`#ece9e1`,muted:`#a8a398`,faint:`#7a766d`,line:`#2d2b34`,accent:`#e8743b`,amber:`#ffb469`,aurora:`#39f0a6`});function ls(e){return Array.isArray(e)&&e.length===4&&e.every(e=>Number.isFinite(e))}function us(e,t,n){let r=n&&n.isCamera?n:null,i=null;!r&&n&&n.position&&n.target?i=n:t&&t.acts&&t.acts.length>1&&t.acts[1].id===e&&t.cameraB?i=t.cameraB:t&&t.camera&&(i=t.camera);let a=NaN;if(r&&i){let e=r.position,t=i.target;a=Math.hypot(t[0]-e.x,t[1]-e.y,t[2]-e.z)}else i&&(a=Math.hypot(i.target[0]-i.position[0],i.target[1]-i.position[1],i.target[2]-i.position[2]));return{frame:r?null:i,three:r,dist:Number.isFinite(a)&&a>1e-6?a:10}}function ds(e,t,n,r={}){let i=r.offset?r.offset[0]:0,a=r.offset?r.offset[1]:0,o=r.offset?r.offset[2]:0,s=t.position,c=t.target;e.position.set(s[0]+i,s[1]+a,s[2]+o),e.up.set(0,1,0),e.lookAt(c[0]+i,c[1]+a,c[2]+o);let l=Number.isFinite(t.roll)?t.roll:0;l&&e.rotateZ(l*es);let u=Math.max(Math.hypot(c[0]-s[0],c[1]-s[1],c[2]-s[2]),1e-6),d=r.nearK??.02,f=Math.min(Math.max(u*d,r.minNear??.002),r.maxNear??10),p=Math.max(u*(r.farK??3)+(r.farAdd??10),f*4);return e.fov=Number.isFinite(t.fov)&&t.fov>.01?t.fov:50,e.aspect=Number.isFinite(n)&&n>0?n:1,e.near=f,e.far=p,e.updateProjectionMatrix(),e.updateMatrixWorld(!0),u}function fs(e,t,n){let r=e.matrixWorld.elements;t[0]=r[0],t[1]=r[1],t[2]=r[2],n[0]=r[4],n[1]=r[5],n[2]=r[6]}function ps(e,t){return e&&e.width>0&&e.height>0?e.width/e.height:t.width>0&&t.height>0?t.width/t.height:1.6}function ms(e){let t=new e.Color,n=new e.Color;return function(r,i,a,o,s){let c=r.getRenderTarget();r.getClearColor(t);let l=r.getClearAlpha(),u=r.autoClear,d=r.autoClearColor,f=r.autoClearDepth,p=r.autoClearStencil;try{r.setRenderTarget(i||null),n.setRGB(s[0],s[1],s[2],e.LinearSRGBColorSpace),r.setClearColor(n,1),r.autoClear=!0,r.autoClearColor=!0,r.autoClearDepth=!0,r.autoClearStencil=!0,r.render(a,o)}finally{r.autoClear=u,r.autoClearColor=d,r.autoClearDepth=f,r.autoClearStencil=p,r.setClearColor(t,l),r.setRenderTarget(c)}}}function hs(e,t,n){let r=e.getPixelRatio()||1;return e.getRenderTarget()?(e.getCurrentViewport(t),e.getSize(n),n.x>=1&&t.z>=1?t.z/n.x:r):r}function gs(e,t,n){return t.blending=e.CustomBlending,t.blendEquation=e.AddEquation,t.blendSrc=e.OneFactor,t.blendDst=n===`add`?e.OneFactor:e.OneMinusSrcAlphaFactor,t.blendEquationAlpha=e.AddEquation,t.blendSrcAlpha=e.ZeroFactor,t.blendDstAlpha=e.OneFactor,t}var _s=`
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uDpr;
uniform float uScale;
uniform float uLift;
uniform vec2 uFog;
varying vec3 vColor;
varying float vAlpha;
varying float vSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float l = length(mv.xyz);
  // pulled toward the eye so a light on a surface is not cut by it
  if (uLift > 0.0 && l > 1e-5) mv.xyz *= max(1.0 - uLift / l, 0.0);
  gl_Position = projectionMatrix * mv;
  float s = aSize * uScale * uDpr;
  // below 2 device px a point keeps its light by dimming instead of shrinking
  float cover = clamp(s * 0.5, 0.0, 1.0);
  vSize = clamp(max(s, 2.0), 2.0, 128.0);
  gl_PointSize = vSize;
  vColor = aColor;
  vAlpha = aAlpha * cover * cover * (1.0 - smoothstep(uFog.x, uFog.y, l));
}
`,vs=`
uniform float uDisc;
uniform float uHalo;
uniform float uHaloK;
uniform float uCore;
uniform float uCoreK;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
varying float vSize;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  // an anti-aliased disc: distance to its rim in device px
  float disc = clamp((1.0 - r) * vSize * 0.5 + 0.5, 0.0, 1.0);
  float k = uDisc * disc + uHalo * exp(-r2 * uHaloK) + uCore * exp(-r2 * uCoreK);
  float a = k * vAlpha * uOpacity;
  if (a < 0.0005) discard;
  gl_FragColor = vec4(vColor * a, a);
}
`;function ys(e,t,n={}){let r=Math.max(1,t.length),i=new Float32Array(r*3),a=new Float32Array(r*3),o=new Float32Array(r),s=new Float32Array(r);t.forEach((e,t)=>{i.set([e.p[0],e.p[1],e.p[2]],t*3);let n=e.color||[1,1,1];a.set([n[0],n[1],n[2]],t*3),o[t]=e.size??2,s[t]=e.alpha??1});let c=new e.BufferGeometry,l=new e.BufferAttribute(i,3),u=new e.BufferAttribute(a,3),d=new e.BufferAttribute(o,1),f=new e.BufferAttribute(s,1);for(let t of[l,u,d,f])t.setUsage(e.DynamicDrawUsage);c.setAttribute(`position`,l),c.setAttribute(`aColor`,u),c.setAttribute(`aSize`,d),c.setAttribute(`aAlpha`,f),c.setDrawRange(0,t.length);let p=!!n.additive,m={uDpr:{value:1},uScale:{value:1},uLift:{value:n.lift??0},uFog:{value:new e.Vector2(1e6,2e6)},uDisc:{value:n.disc??+!p},uHalo:{value:n.halo??+!!p},uHaloK:{value:n.haloK??6},uCore:{value:n.core??0},uCoreK:{value:n.coreK??40},uOpacity:{value:1}},h=new e.ShaderMaterial({name:n.name||`act-points`,uniforms:m,vertexShader:_s,fragmentShader:vs,transparent:!0,depthWrite:!1,depthTest:n.depthTest??!0});gs(e,h,p?`add`:`over`);let g=new e.Points(c,h);g.name=n.name||`act-points`,g.frustumCulled=!1,g.renderOrder=n.renderOrder??3;let _=new e.Vector4,v=new e.Vector2;return g.onBeforeRender=e=>{m.uDpr.value=hs(e,_,v)},{object3D:g,material:h,uniforms:m,count:t.length,set(e,t){t.p&&(i[e*3]=t.p[0],i[e*3+1]=t.p[1],i[e*3+2]=t.p[2]),t.color&&(a[e*3]=t.color[0],a[e*3+1]=t.color[1],a[e*3+2]=t.color[2]),t.size!==void 0&&(o[e]=t.size),t.alpha!==void 0&&(s[e]=t.alpha)},commit(){l.needsUpdate=!0,u.needsUpdate=!0,d.needsUpdate=!0,f.needsUpdate=!0},setFog(e,t){m.uFog.value.set(e,t)},dispose(){c.dispose(),h.dispose(),g.removeFromParent()}}}var bs=`
varying vec2 vUv;
varying float vDist;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`,xs=`
uniform sampler2D tText;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uReveal;
uniform vec2 uFog;
varying vec2 vUv;
varying float vDist;
void main() {
  float cov = texture2D(tText, vUv).a;
  // written left to right: a soft pen front sweeps across
  float m = clamp((uReveal * 1.08 - vUv.x) / 0.08, 0.0, 1.0);
  float a = cov * m * uAlpha * (1.0 - smoothstep(uFog.x, uFog.y, vDist));
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;function Ss(e,t){let n=globalThis;if(n.document&&typeof n.document.createElement==`function`){let r=n.document.createElement(`canvas`);return r.width=e,r.height=t,r}return typeof n.OffscreenCanvas==`function`?new n.OffscreenCanvas(e,t):null}function Cs(e,t,n={}){let r=n.px??13,i=n.lineHeight??1.35,a=n.scale??4,o=n.font??`italic 400 ${r*a}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`,s=Ss(8,8),c=s&&s.getContext(`2d`);if(!c)return null;c.font=o;let l=Math.ceil(r*.3*a),u=Math.max(...t.map(e=>c.measureText(e).width),1),d=Math.ceil(u+l*2),f=Math.ceil(t.length*r*i*a+l*2),p=Ss(d,f),m=p&&p.getContext(`2d`);if(!m)return null;m.clearRect(0,0,d,f),m.font=o,m.fillStyle=`#ffffff`,m.textBaseline=`alphabetic`,t.forEach((e,t)=>m.fillText(e,l,l+(t+.78)*r*i*a));let h=new e.CanvasTexture(p);return h.colorSpace=e.NoColorSpace,h.generateMipmaps=!0,h.minFilter=e.LinearMipmapLinearFilter,h.magFilter=e.LinearFilter,h.anisotropy=n.anisotropy??1,h.needsUpdate=!0,{texture:h,width:d/a,height:f/a,pad:l/a}}var ws=3.12,Ts=wi(ao+no*ws),Es=q.y0+q.main.thick/2,Ds=jn(q.main.z,q.module).ra,Os=as(128,58),ks=is(cs.night),As=is(`#141319`),js=is(`#34313d`),Ms=is(cs.accent,3.4),Ns=is(cs.ink,1.5),Ps=is(`#d8d4ca`),Fs=is(cs.faint),Is={land:{sheet:[-1.6,-1.82,2.3,1.82],margin:.3,k:220,px:13,notes:[{id:`limb`,lines:[`48 teeth = 360°`],at:[1.36,.06],target:{tooth:8},bow:.18},{id:`rete`,lines:[`rete · twelve stars`],at:[1.25,1.42],target:{star:[.7,.7]},bow:-.22},{id:`rule`,lines:[`the rule turns,`,`the sky stays`],at:[1.22,-1.4],target:{rule:1},bow:.2}]},port:{sheet:[-1.6,-2.78,1.6,1.8],margin:.24,k:114,px:12,notes:[{id:`rete`,lines:[`rete · twelve stars`],at:[-1.3,-1.62],target:{star:[-.55,-.55]},bow:.22},{id:`rule`,lines:[`the rule turns`],at:[-.05,-2.25],target:{rule:1},bow:.2}]}},Ls={limb:[.46,.6],rete:[.69,.82],rule:[.885,.995]},Rs=.42,zs=[208,332,118];function Bs(e){let t=ts(e);return t<=.25?.16/.25*t:.16+(t-.25)/.75*.84}var Vs=`
varying vec3 vW;
varying float vDist;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`,Hs=`
uniform vec3 uNight;
uniform vec3 uPaper;
uniform vec3 uHatch;
uniform float uPageK;
uniform vec4 uShadow;
uniform float uShadowK;
uniform float uDpr;
uniform vec2 uFog;
uniform vec3 uFogCol;
varying vec3 vW;
varying float vDist;
float hatch(float c, float spacing, float hw) {
  float g = max(fwidth(c), 1e-7);
  float spx = spacing / g;
  float d = abs(fract(c / spacing + 0.5) - 0.5) * spx;
  float line = clamp(hw + 0.5 - d, 0.0, 1.0);
  float mean = clamp(2.0 * hw / spx, 0.0, 1.0);
  return mix(mean, line, smoothstep(2.6, 4.2, spx / uDpr));
}
void main() {
  vec2 p = vW.xz;
  float d = length(p - uShadow.xy);
  float sh = (1.0 - smoothstep(uShadow.z - uShadow.w, uShadow.z + uShadow.w, d)) * uShadowK;
  vec3 col = mix(uNight, uPaper, uPageK);
  col = mix(col, uNight * 0.5, 0.75 * sh);
  float hw = 0.42 * uDpr;
  float h1 = hatch(0.7071 * (p.x + p.y), 0.03, hw) * smoothstep(0.08, 0.45, sh);
  float h2 = hatch(0.7071 * (p.x - p.y), 0.03, hw) * smoothstep(0.5, 0.9, sh);
  col = mix(col, uHatch, clamp(max(h1, h2), 0.0, 1.0) * 0.85 * uPageK);
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
  gl_FragColor = vec4(col, 1.0);
}
`,Us=(e,t)=>[e[0]*Math.cos(t)-e[1]*Math.sin(t),e[0]*Math.sin(t)+e[1]*Math.cos(t)],Ws=(e,t=.003)=>[e[0],t,-e[1]],Gs=[0,1,0];function Ks(e){let{wheel:t,fixed:n}=Ti(),r=Ei(e),i=Math.cos(e),a=Math.sin(e),o=[],s=(e,t)=>{for(let n=0;n<e.count;n++){let r=e.o[2*n],s=e.o[2*n+1];if(!(s>r))continue;let c=[e.a[3*n],e.a[3*n+1],e.a[3*n+2]],l=[e.b[3*n],e.b[3*n+1],e.b[3*n+2]];t&&(c=[c[0]*i+c[2]*a,c[1],-c[0]*a+c[2]*i],l=[l[0]*i+l[2]*a,l[1],-l[0]*a+l[2]*i]),o.push({o0:r,o1:s,a:c,b:l})}};s(t,!0),s(n,!1),s(r,!1),o.sort((e,t)=>e.o0-t.o0);let c=Float64Array.from(o.map(e=>e.o0));return{at(e,t){let n=0,r=o.length-1;if(r<0||e<c[0])return null;for(;n<r;){let t=n+r+1>>1;c[t]<=e?n=t:r=t-1}let i=o[n],a=ts((e-i.o0)/(i.o1-i.o0));return t[0]=i.a[0]+(i.b[0]-i.a[0])*a,t[1]=i.a[1]+(i.b[1]-i.a[1])*a,t[2]=i.a[2]+(i.b[2]-i.a[2])*a,t}}}function qs(e,t,n,r,i,a=6){let o=[],s=(e,t,n)=>{for(let r=0;r<=a;r++){let s=n+r/a*(Math.PI/2);o.push([e+i*Math.cos(s),t+i*Math.sin(s)])}};return s(n-i,t+i,-Math.PI/2),s(n-i,r-i,0),s(e+i,r-i,Math.PI/2),s(e+i,t+i,Math.PI),o}function Js(e,t){if(e.star){let n=e.star,r=null;for(let e of t.stars){if(fr(Us(e.tip,-Rt)))continue;let t=Math.hypot(e.tip[0]-n[0],e.tip[1]-n[1]);(!r||t<r.d)&&(r={d:t,p:e.tip})}return r?r.p:n}return e.tooth===void 0?t.ruleTip(e.rule):t.tooth(e.tooth)}function Ys(e){let{THREE:t}=e,n=e.instrument,r=!!e.reducedMotion,i=new t.Scene;i.name=`act:plate`;let a=new t.PerspectiveCamera(30,1.6,.1,100),o=ms(t),s=n?Bi(n):null,c={width:0,height:0,dpr:1};Number.isFinite(e.tier)&&e.tier;let l=!1,u=!1,d=null,f=null,p=null,m={},h=[],g=oi(t);g.uBrass.value=0,g.uDarkScale.value=1;let _=new t.Group,v=hi(t,g,_,{centre:[0,0,0]}),y=(e,t,n)=>v(e,n);function b(e=1){let n=pi(t,g,{draw:!0,bias:0});return n.uniforms.uOutline={value:1},n.uniforms.uDraw.value=e,h.push(n),n}function x(e,n){let r=mi(t,e,n,{draw:!0});return r.onBeforeRender=y,h.push(r.geometry),r}let S=ys(t,[{p:[0,.004,0],color:Ms,size:7,alpha:1},{p:[0,.004,0],color:Ns,size:4.5,alpha:0}],{additive:!0,halo:.32,haloK:3.2,core:1,coreK:16,lift:.002,name:`plate:marks`,renderOrder:6});h.push(S);let C={uNight:{value:new t.Vector3(...ks)},uPaper:{value:new t.Vector3(...As)},uHatch:{value:new t.Vector3(...js)},uPageK:{value:0},uShadow:{value:new t.Vector4(0,0,Ds,.05)},uShadowK:{value:0},uDpr:{value:1},uFog:{value:new t.Vector2(1e6,2e6)},uFogCol:{value:new t.Vector3(...ks)}},w=new t.ShaderMaterial({name:`plate:paper`,uniforms:C,vertexShader:Vs,fragmentShader:Hs});h.push(w);function T(e){let n=Is[e],r=new t.Group;r.name=`plate:page:`+e;let[i,a,o,s]=n.sheet,c=new t.BufferGeometry;c.setAttribute(`position`,new t.Float32BufferAttribute([...Ws([i,a],0),...Ws([o,a],0),...Ws([o,s],0),...Ws([i,s],0)],3)),c.setIndex([0,1,2,0,2,3]),h.push(c);let l=new t.Mesh(c,w);l.name=`plate:sheet`,l.renderOrder=0,l.onBeforeRender=e=>{C.uDpr.value=e.getPixelRatio()||1},r.add(l);let u=new Pn,d=(e,t,n,r)=>u.polyline(e.map(e=>Ws(e)),t,n,{closed:r,normal:Gs,maxLen:.05});d(qs(i,a,o,s,.07),1.3,.55,!0);let f=.045;d([[o+f,s-.16],[o+f,a-f+.05],[o+f-.05,a-f],[i+.16,a-f]],.9,.3,!1),d([[i+n.margin,s-.02],[i+n.margin,a+.02]],.7,-.8,!1),u.order(0,u.count,0,0);let p=b(1.001);r.add(x(u,p));let m=[],g=.2;for(let e=Math.ceil((i+n.margin+.05)/g)*g;e<o-.06;e+=g)for(let t=Math.ceil((a+.06)/g)*g;t<s-.06;t+=g)Math.hypot(e,t)<In.tipR+.08||m.push({p:Ws([e,t],.002),color:Fs,size:1.25,alpha:0});let _=m.map(e=>Math.hypot(e.p[0],e.p[2])),v=Math.max(..._,1),y=ys(t,m,{additive:!1,disc:1,name:`plate:dots`,renderOrder:1});h.push(y),r.add(y.object3D);let S=Di(Ts),T=new Pn,E=[];for(let e of n.notes){let i=Ls[e.id],a=i[0]+(i[1]-i[0])*Rs,o=e.at,s=Js(e.target,S),c=Math.hypot(s[0]-o[0],s[1]-o[1])||1,l=[(s[0]-o[0])/c,(s[1]-o[1])/c],u=[-l[1],l[0]],d=[(o[0]+s[0])/2+u[0]*c*e.bow,(o[1]+s[1])/2+u[1]*c*e.bow],f=[];for(let e=0;e<=40;e++){let t=e/40,n=1-t,r=.004*Math.sin(t*23+o[0]*7)*Math.sin(Math.PI*t);f.push([n*n*o[0]+2*n*t*d[0]+t*t*s[0]+u[0]*r,n*n*o[1]+2*n*t*d[1]+t*t*s[1]+u[1]*r])}let p=f.length-1,m=T.count;T.polyline(f.slice(0,p-1).map(e=>Ws(e,.0035)),1,.68,{normal:Gs}),T.order(m,T.count,i[0],a-.012);let g=f[p-4],_=Math.hypot(s[0]-g[0],s[1]-g[1])||1,v=[(s[0]-g[0])/_,(s[1]-g[1])/_],y=T.count;for(let e of[1,-1]){let t=Us(v,e*.42);T.seg(Ws(s,.0035),Ws([s[0]-t[0]*.05,s[1]-t[1]*.05],.0035),Gs,Gs,1,.68)}T.order(y,T.count,a-.012,a);let b=Cs(t,e.lines,{px:n.px,anisotropy:D()});if(b){let s=n.k,c=Math.PI/180*2.5,l=[o[0]+(2-b.pad)/s,o[1]+(2-b.pad)/s],u=[Math.cos(c)*(b.width/s),Math.sin(c)*(b.width/s)],d=[-Math.sin(c)*(b.height/s),Math.cos(c)*(b.height/s)],f=l,p=[l[0]+u[0],l[1]+u[1]],m=[p[0]+d[0],p[1]+d[1]],g=[l[0]+d[0],l[1]+d[1]],_=new t.BufferGeometry;_.setAttribute(`position`,new t.Float32BufferAttribute([...Ws(f,.0036),...Ws(p,.0036),...Ws(m,.0036),...Ws(g,.0036)],3)),_.setAttribute(`uv`,new t.Float32BufferAttribute([0,0,1,0,1,1,0,1],2)),_.setIndex([0,1,2,0,2,3]);let v=new t.ShaderMaterial({name:`plate:note`,uniforms:{tText:{value:b.texture},uColor:{value:new t.Vector3(...Ps)},uAlpha:{value:0},uReveal:{value:0},uFog:{value:new t.Vector2(1e6,2e6)}},vertexShader:bs,fragmentShader:xs,transparent:!0,depthWrite:!1,side:t.DoubleSide});gs(t,v,`over`);let y=new t.Mesh(_,v);y.name=`plate:note:`+e.id,y.renderOrder=4,r.add(y),h.push(_,v,b.texture),E.push({mesh:y,win:[a,i[1]]})}}let O=b(0);return r.add(x(T,O)),{group:r,pageMat:p,noteMat:O,dotSet:y,dotR:_,dotMax:v,words:E}}let E=(()=>{let e=new Pn,t=oo+q.y0-.003;for(let n of zs){let r=n*Math.PI/180+Ts,i=[Ds*Math.cos(r),Ds*Math.sin(r)],a=e.count;e.pattern([Ws(i,.003),Ws(i,.003+t)],[.045,.03],.7,.36,{}),e.order(a,e.count,0,1)}let n=b(0),r=x(e,n);return r.name=`plate:projections`,{mesh:r,m:n,top:t}})();_.add(E.mesh),i.add(_,S.object3D);function D(){try{return Math.min(8,e.renderer.capabilities.getMaxAnisotropy())}catch{return 1}}async function O(r){if(u)throw Error(`plate act: disposed`);return d||=(async()=>{r?.(0),f=Oi({THREE:t,crank:0,draw:0,ghost:0}),f.setCrank(ao+no*ws),i.add(f.object3D),r?.(.3),p=Ks(Ts),r?.(.5);for(let e of[`land`,`port`])m[e]=T(e),m[e].group.visible=!1,_.add(m[e].group);r?.(.7),n&&await(e.instrumentReady||Hi(n)),u||(l=!0,r?.(1))})(),d}let k=[0,0,0];function A(e,t,n){let i=e.params||{},a=e.viewport===`port`?`port`:`land`,o=Bs(i.draw??0),s=ts(i.lift??0),c=Number.isFinite(e.u)?e.u:0,l=ns(0,.3,s),u=n*1.24,d=n*1.98;for(let e of[`land`,`port`])m[e]&&(m[e].group.visible=e===a);let h=m[a];f.setDraw(o),f.setGhost(l),f.setLook({ink:1,outline:1,widthK:a===`port`?.82:1,fog:[u,d],fogColor:cs.night,palette:{night:cs.night}}),g.uWidthK.value=a===`port`?.82:1,g.uFog.value.set(u,d),g.uNight.value.set(ks[0],ks[1],ks[2]),g.uFogCol.value.set(ks[0],ks[1],ks[2]);let _=ns(0,.2,o),v=$(.5,.3,l);C.uPageK.value=_,C.uFog.value.set(u,d),h.pageMat.uniforms.uOutline.value=_;let y=ns(0,.32,o)*1.15;for(let e=0;e<h.dotR.length;e++){let t=h.dotR[e]/h.dotMax;h.dotSet.set(e,{alpha:v*ns(t-.15,t,y)})}h.dotSet.commit(),h.dotSet.setFog(u,d),h.noteMat.uniforms.uDraw.value=o>=1?1.001:o,h.noteMat.uniforms.uOutline.value=1-l;for(let e of h.words){let t=ts((o-e.win[0])/(e.win[1]-e.win[0]));e.mesh.material.uniforms.uReveal.value=o>=1?1:t,e.mesh.material.uniforms.uAlpha.value=(t>0?.92:0)*(1-l),e.mesh.material.uniforms.uFog.value.set(u,d)}let b=r?1:1+.08*Math.sin(t*1.6);S.set(0,{alpha:1-ns(3.8,3.98,c),size:7*b});let x=0;o>0&&o<1&&p.at(o,k)&&(x=ns(0,.012,o)*(1-ns(.975,.999,o)),S.set(1,{p:[k[0],.0042,k[2]]})),S.set(1,{alpha:x}),S.commit(),S.setFog(u*1.5,d*1.5);let w=$(-.1,oo,s),T=w+Es;s>0&&T>0?(C.uShadow.value.set(-T*Os[0]/Os[1],-T*Os[2]/Os[1],Ds,.03+.2*T),C.uShadowK.value=.85*(1-.4*ns(0,oo,T))*ns(0,.06,T)):C.uShadowK.value=0;let D=ts((w+q.y0-.003)/E.top);return E.m.uniforms.uDraw.value=s>0?D:0,E.m.uniforms.uOutline.value=ns(.02,.25,s)*(1-ns(3.62,3.82,c)),{lift:s,y:w,fog:[u,d]}}function j(e,t,r){let a=e.params||{};s.acquire(i,{position:[0,t,0]}),n.setBuild(.08),n.setCrank(a.crank??0),n.setArms(0),n.setContact(0),n.setBrass(0),n.setViewport(e.viewport===`port`?`port`:`land`),n.setCrankAccent(0),n.setLight({dir:Os,color:[1,1,1],intensity:1,ambient:.03}),n.setEnvColors({sky:`#1b2440`,ground:cs.stage,rim:`#27e0d0`}),n.setLook({fog:r,fogColor:cs.night,macro:[.004,.008],ink:1,dark:.7,outline:1,widthK:1,spacing:3.6,brush:1,palette:{night:cs.night,stage:cs.stage,shade:cs.muted}})}let M=new t.Scene;return{id:`plate`,load:O,get ready(){return l},setTier(e){Math.max(0,Math.min(3,Math.round(Number(e))||0))},resize(e,t,n){c.width=e,c.height=t,c.dpr=n||1},render(t,r,d,f=0){if(u)return;let p=e.renderer;if(!l||!t){o(p,d,M,a,ks);return}let m=us(`plate`,t,r),h=m.three||a,g=m.dist;m.frame&&(g=ds(a,m.frame,ps(d,c),{nearK:.02,minNear:.004,farK:2.5,farAdd:12}));let _=A(t,f,g);try{n&&n.ready&&_.lift>0&&j(t,_.y,_.fog),o(p,d,i,h,ks)}finally{s&&s.held&&s.release()}},pick(){return null},stonesScreen(){return[]},finishHints(){return{glow:{strength:.6,threshold:.8},vignette:.2,grain:.018}},dispose(){if(!u){u=!0,s&&s.held&&s.release(),f?.dispose();for(let e of h)e.dispose?.();i.clear()}}}}var Xs=Object.freeze([[0,0],[.06,.08],[.24,.24],[.44,.548],[.5,.6],[.6,.66],[.7,.83],[.8,.891],[1,1]].map(e=>Object.freeze(e)));function Zs(e){let t=ts(e);for(let e=1;e<Xs.length;e++){let[n,r]=Xs[e];if(t<=n){let[i,a]=Xs[e-1];return a+(t-i)/(n-i)*(r-a)}}return 1}function Qs(e,t){let n=Number.isFinite(e)?e:0,r=sn(t);return{wheel:Math.max(ts(n),r.wheel??0),idler:Math.max(ts(n-1),r.idler??0),pinion:Math.max(ts(n-2),r.pinion??0)}}function $s(e,t){let n=Ut(e),r=At(Lt.idlerAngle),i=At(Lt.pinionAngle),a=Et(t.idler),o=Et(t.pinion);return{T:n,idler:[n.idler.c[0]+r[0]*1.1*(1-a),0,n.idler.c[2]+r[2]*1.1*(1-a)],pinion:[n.pinion.c[0]+i[0]*1.1*(1-o),0,n.pinion.c[2]+i[2]*1.1*(1-o)]}}var ec=new WeakMap;function tc(e,t,n){let r=e.object3D,i=ec.get(e);if(i&&i.idler&&i.idler.parent===r&&i.pinion&&i.pinion.parent===r||(i={idler:r.getObjectByName(`instrument:idler`),pinion:r.getObjectByName(`instrument:pinion`)},ec.set(e,i)),!i.idler||!i.pinion)return!1;let a=$s(t,n);return nc(i.idler,a.idler,a.T.idler.rot,n.idler),nc(i.pinion,a.pinion,a.T.pinion.rot,n.pinion),!0}function nc(e,t,n,r){e.matrix.fromArray(et(K(t),rt(n))),e.matrixWorldNeedsUpdate=!0,e.visible=r>0}var rc=`
varying vec3 vDir;
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  // view-space ray through this NDC point (exact for any perspective
  // projection), turned into world space by the transposed view rotation
  vec3 rayV = vec3(
    (position.x + projectionMatrix[2][0]) / projectionMatrix[0][0],
    (position.y + projectionMatrix[2][1]) / projectionMatrix[1][1],
    -1.0);
  vDir = rayV * mat3(viewMatrix);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,ic=`
uniform vec3 uBase;
uniform vec3 uHorizon;
uniform vec3 uKeyGlow;
uniform vec3 uRimGlow;
uniform vec3 uKeyDir;
uniform vec3 uRimDir;
uniform float uExposure;
uniform vec4 uQuiet;
uniform float uQuietK;
varying vec3 vDir;
varying vec2 vNdc;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(uHorizon, uBase, smoothstep(0.0, 0.75, abs(d.y + 0.08)));
  float k = max(dot(d, uKeyDir), 0.0);
  col += uKeyGlow * (0.55 * pow(k, 5.0) + 0.9 * pow(k, 36.0));
  float r = max(dot(d, uRimDir), 0.0);
  col += uRimGlow * pow(r, 4.0);
  col *= 0.92 + 0.16 * vnoise(d * 2.7 + vec3(3.1, 1.7, 0.4));
  vec2 dq = max(uQuiet.xy - vNdc, vNdc - uQuiet.zw);
  float q = 1.0 - smoothstep(0.0, 0.22, max(dq.x, dq.y));
  col *= 1.0 - 0.45 * uQuietK * q;
  gl_FragColor = vec4(col * uExposure, 1.0);
}
`;function ac(e){let t=()=>new e.Vector3,n={uBase:{value:t()},uHorizon:{value:t()},uKeyGlow:{value:t()},uRimGlow:{value:t()},uKeyDir:{value:new e.Vector3(0,1,0)},uRimDir:{value:new e.Vector3(0,1,0)},uExposure:{value:1},uQuiet:{value:new e.Vector4(-2,-2,-2,-2)},uQuietK:{value:0}},r=new e.ShaderMaterial({name:`act-backdrop`,uniforms:n,vertexShader:rc,fragmentShader:ic,depthTest:!1,depthWrite:!1,side:e.DoubleSide}),i=new e.BufferGeometry;i.setAttribute(`position`,new e.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));let a=new e.Mesh(i,r);return a.name=`act-backdrop`,a.frustumCulled=!1,a.matrixAutoUpdate=!1,a.renderOrder=-1e6,{object3D:a,uniforms:n,setQuiet(e,t){!e||!(t>0)?n.uQuietK.value=0:(n.uQuiet.value.set(Math.min(e[0],e[2]),Math.min(e[1],e[3]),Math.max(e[0],e[2]),Math.max(e[1],e[3])),n.uQuietK.value=t)},dispose(){i.dispose(),r.dispose(),a.removeFromParent()}}}var oc=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,sc=`
uniform sampler2D tDepth;
uniform vec2 uNearFar;
uniform float uFocus;
uniform float uAperture;
uniform vec2 uRange;
// signed blur radius over the largest one: negative in front of the focus
// plane. uRange.x is the depth of the sharp slab either side of the focus
// plane (as a fraction of the focus distance), uRange.y caps the near field.
float cocAt(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  float zn = d * 2.0 - 1.0;
  float z = 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - zn * (uNearFar.y - uNearFar.x));
  float c = uAperture * (1.0 - uFocus / max(z, 1e-5));
  float s = sign(c);
  c = max(abs(c) - uRange.x * uAperture, 0.0);
  return s < 0.0 ? -min(c, uRange.y) : min(c, 1.0);
}
`,cc=`
uniform sampler2D tScene;
uniform vec2 uTexel;
${sc}
varying vec2 vUv;
void main() {
  // the 2 x 2 block under this texel, each sample weighed down as it gets
  // brighter so one hot pixel does not flicker as it moves across the block
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  float coc = 0.0;
  float cmax = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i - (i / 2) * 2) - 0.5, float(i / 2) - 0.5) * uTexel;
    vec3 c = texture2D(tScene, vUv + o).rgb;
    float w = 1.0 / (1.0 + 0.25 * max(c.r, max(c.g, c.b)));
    sum += c * w;
    wsum += w;
    float k = cocAt(vUv + o);
    if (abs(k) >= cmax) {
      cmax = abs(k);
      coc = k;
    }
  }
  gl_FragColor = vec4(sum / wsum, coc);
}
`,lc=`
uniform sampler2D tHalf;
uniform vec2 uStep; // the largest blur radius, in uv
uniform float uRadiusPx; // and in half-resolution pixels
varying vec2 vUv;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec4 c0 = texture2D(tHalf, vUv);
  float centre = abs(c0.a);
  vec3 col = c0.rgb;
  float blur = centre;
  float tot = 1.0;
  // a turn of the spiral per pixel, so undersampling shows as grain, not rings
  float a = hash12(gl_FragCoord.xy) * 6.2831853 * JITTER;
  const float GOLDEN = 2.39996323;
  for (int i = 0; i < TAPS; i++) {
    // denser toward the centre than an even disc (exponent 0.7, not 0.5): small blurs keep a few taps
    float r = pow((float(i) + 0.5) / float(TAPS), 0.7);
    vec2 o = vec2(cos(a), sin(a)) * r;
    a += GOLDEN;
    vec4 s = texture2D(tHalf, vUv + o * uStep);
    float size = abs(s.a);
    // something behind the centre cannot spread over it further than the centre's own blur allows
    if (s.a > c0.a) size = min(size, centre * 2.0);
    float m = smoothstep(r * uRadiusPx - 0.5, r * uRadiusPx + 0.5, size * uRadiusPx);
    col += mix(col / tot, s.rgb, m);
    blur += mix(blur / tot, size, m);
    tot += 1.0;
  }
  gl_FragColor = vec4(col / tot, blur / tot);
}
`,uc=`
uniform sampler2D tHalf;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tHalf, vUv + vec2(0.75, 0.75) * uTexel) + texture2D(tHalf, vUv + vec2(-0.75, 0.75) * uTexel)
         + texture2D(tHalf, vUv + vec2(0.75, -0.75) * uTexel) + texture2D(tHalf, vUv + vec2(-0.75, -0.75) * uTexel);
  gl_FragColor = c * 0.25;
}
`,dc=`
uniform sampler2D tScene;
uniform sampler2D tBlur;
uniform float uRadiusFull; // the largest blur radius in this target's pixels
uniform float uOn;
${sc}
varying vec2 vUv;
void main() {
  vec3 sharp = texture2D(tScene, vUv).rgb;
  vec4 b = texture2D(tBlur, vUv);
  float own = abs(cocAt(vUv));
  float px = max(own, b.a) * uRadiusFull;
  float k = smoothstep(1.2, 4.0, px) * uOn;
  gl_FragColor = vec4(mix(sharp, b.rgb, k), 1.0);
}
`,fc=Object.freeze([0,14,32,56]),pc=Object.freeze([0,.016,.024,.03]);function mc(e){let t=new e.BufferGeometry;t.setAttribute(`position`,new e.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));let n=new e.Mesh(t);n.frustumCulled=!1;let r=new e.Scene;r.add(n);let i=new e.Camera,a=null,o=null,s=null,c=``,l={tDepth:{value:null},uNearFar:{value:new e.Vector2(.01,10)},uFocus:{value:1},uAperture:{value:1},uRange:{value:new e.Vector2(.02,1)}},u={...l,tScene:{value:null},uTexel:{value:new e.Vector2}},d={tHalf:{value:null},uStep:{value:new e.Vector2},uRadiusPx:{value:8}},f={...l,tScene:{value:null},tBlur:{value:null},uRadiusFull:{value:16},uOn:{value:1}},p=(t,n,r,i={})=>new e.ShaderMaterial({name:t,vertexShader:oc,fragmentShader:n,uniforms:r,defines:i,depthTest:!1,depthWrite:!1,blending:e.NoBlending,toneMapped:!1}),m=p(`gears:dof-down`,cc,u),h=new Map,g={tHalf:{value:null},uTexel:{value:new e.Vector2}},_=p(`gears:dof-soft`,uc,g),v=p(`gears:dof-join`,dc,f);function y(e){let t=h.get(e);return t||(t=p(`gears:dof-gather`,lc,d,{TAPS:e,JITTER:e>=30?`0.12`:`1.0`}),h.set(e,t)),t}function b(){for(let e of[a,o,s])e&&(e.depthTexture&&e.depthTexture.dispose(),e.dispose());a=o=s=null,c=``}function x(t){let n=Math.max(1,t.width|0),r=Math.max(1,t.height|0),i=t.samples|0,l=`${n}x${r}x${i}`;if(l===c&&a)return a;b(),c=l;let u=new e.DepthTexture(n,r);u.type=e.UnsignedIntType,u.format=e.DepthFormat,u.minFilter=u.magFilter=e.NearestFilter,a=new e.WebGLRenderTarget(n,r,{type:e.HalfFloatType,format:e.RGBAFormat,minFilter:e.LinearFilter,magFilter:e.LinearFilter,generateMipmaps:!1,depthBuffer:!0,stencilBuffer:!1,samples:i,depthTexture:u}),a.texture.name=`gears:dof-scene`;let d=Math.max(1,Math.ceil(n/2)),f=Math.max(1,Math.ceil(r/2)),p=t=>{let n=new e.WebGLRenderTarget(d,f,{type:e.HalfFloatType,format:e.RGBAFormat,minFilter:e.LinearFilter,magFilter:e.LinearFilter,generateMipmaps:!1,depthBuffer:!1,stencilBuffer:!1});return n.texture.name=t,n};return o=p(`gears:dof-half`),s=p(`gears:dof-blur`),a}let S=new e.Color;function C(e,t,c,p){if(!a)return;let h=Math.max(1,Math.min(3,p.tier|0)),b=a.height,x=pc[h]*b;l.tDepth.value=a.depthTexture,l.uNearFar.value.set(c.near,c.far),l.uFocus.value=p.focus,l.uAperture.value=p.aperture,l.uRange.value.set(p.slab??.02,p.near??1),u.tScene.value=a.texture,u.uTexel.value.set(1/a.width,1/a.height),d.tHalf.value=o.texture,d.uRadiusPx.value=x*.5,d.uStep.value.set(x*.5/o.width,x*.5/o.height),f.tScene.value=a.texture,g.tHalf.value=s.texture,g.uTexel.value.set(1/s.width,1/s.height),f.tBlur.value=o.texture,f.uRadiusFull.value=x,f.uOn.value=p.on??1;let C=e.getRenderTarget();e.getClearColor(S);let w=e.getClearAlpha(),T=e.autoClear;try{e.autoClear=!1,n.material=m,e.setRenderTarget(o),e.render(r,i),n.material=y(fc[h]),e.setRenderTarget(s),e.render(r,i),n.material=_,e.setRenderTarget(o),e.render(r,i),n.material=v,e.setRenderTarget(t||null),e.render(r,i)}finally{e.autoClear=T,e.setClearColor(S,w),e.setRenderTarget(C)}}return{ensure:x,apply:C,free:b,dispose(){b(),t.dispose(),m.dispose(),_.dispose(),v.dispose();for(let e of h.values())e.dispose();h.clear()}}}var hc=Math.PI*2,gc=(q.main.z+q.idler.z)*q.module/2,_c=(q.idler.z+q.pinion.z)*q.module/2,vc=[At(Lt.idlerAngle)[0]*gc,At(Lt.idlerAngle)[2]*gc],yc=[vc[0]+At(Lt.pinionAngle)[0]*_c,vc[1]+At(Lt.pinionAngle)[2]*_c],bc=Object.freeze([[1.98,.74,1,20],[.74,1.47,1.15,-35],[2.08,.02,.85,-60],[.12,1.42,.75,55],[2.45,.9,.9,80],[1.5,-1.35,.9,-40]].map(e=>Object.freeze(e))),xc=Object.freeze([[vc[0],vc[1],.76,1.12,-118,-8,.15,24],[0,0,1.3,1.72,95,228,.19,-18],[0,0,1.32,1.7,32,80,.17,30],[yc[0],yc[1],.45,.74,50,115,.15,40]].map(e=>Object.freeze(e)));function Sc(){let e=[],t=[],n=[],r=[],i=[];return{P:e,N:t,K:n,L:r,I:i,v(i,a,o,s){return e.push(i[0],i[1],i[2]),t.push(a[0],a[1],a[2]),n.push(o),r.push(s[0],s[1],s[2]),e.length/3-1},quad(e,t,n,r){i.push(e,t,n,e,n,r)}}}function Cc(e,t,n,r,i,a,o,s=0,c=!0){let l=i.length,u=Math.cos(s),d=Math.sin(s),f=e=>{let t=i[Math.max(e-1,0)],n=i[Math.min(e+1,l-1)],r=n[0]-t[0],a=n[1]-t[1],o=Math.hypot(r,a)||1;return[a/o,-r/o]},p=(s,c)=>{let l=e.P.length/3;for(let l=0;l<=a;l++){let f=l/a*hc,p=Math.cos(f),m=Math.sin(f),h=i[s][0],g=p*h,_=m*h;e.v([t+g,n+i[s][1],r+_],[p*c[0],c[1],m*c[0]],o,[g*u+_*d,i[s][1],-g*d+_*u])}return l};if(c){let t=p(0,f(0));for(let n=1;n<l;n++){let r=p(n,f(n));for(let n=0;n<a;n++)e.quad(t+n,r+n,r+n+1,t+n+1);t=r}}else for(let t=1;t<l;t++){let n=i[t][0]-i[t-1][0],r=i[t][1]-i[t-1][1],o=Math.hypot(n,r)||1,s=[r/o,-n/o],c=p(t-1,s),l=p(t,s);for(let t=0;t<a;t++)e.quad(c+t,l+t,l+t+1,c+t+1)}}function wc(e,t,n,r,i,a,o,s=!0){let c=.052*i,l=.014*i;Cc(e,t,n,r,[[c*1,0],[c*1,l*.45],[c*.97,l*.8],[c*.9,l],[c*.72,l*1.04],[c*.6,l*.9],[c*.56,l*.55]],o,0);let u=c*.57,d=[];for(let e=0;e<=7;e++){let t=e/7*1.15,n=Math.PI/2*Math.min(t,1);d.push([u*Math.cos(n)+1e-5,l*.55+l*.75*Math.sin(n)])}let f=[[u*.3,l*.55+l*.75*Math.sin(Math.acos(.3))],[u*.2,l*1.12],[u*.08,l*1.02],[1e-5,l*1]];if(Cc(e,t,n,r,d.filter(e=>e[0]>u*.3).concat(f),o,1),!s)return;let p=a*Math.PI/180;for(let a of[-1,1]){let s=c*1.72;Tc(e,t+Math.cos(p)*s*a,n,r-Math.sin(p)*s*a,.023*i,.0105*i,p*.7+a*.9,Math.max(10,o>>1))}}function Tc(e,t,n,r,i,a,o,s){Cc(e,t,n,r,[[i,0],[i,a*.7],[i*.86,a],[1e-5,a]],s,2,o,!1)}function Ec(e,t,n,r,i,a,o,s,c,l){let u=a*Math.PI/180,d=o*Math.PI/180,f=.016,p=c*Math.PI/180,m=Math.cos(p),h=Math.sin(p),g=[[r,0,[-1,0]],[r,s-f,[-1,0]],[r,s-f,[-.707,.707]],[r+f,s,[-.707,.707]],[r+f,s,[0,1]],[i-f,s,[0,1]],[i-f,s,[.707,.707]],[i,s-f,[.707,.707]],[i,s-f,[1,0]],[i,0,[1,0]]],_=(e,r,i)=>[(e-t)*m+(i-n)*h,r,-(e-t)*h+(i-n)*m],v=[];for(let r=0;r<=l;r++){let i=At(u+(d-u)*r/l),a=[];for(let[r,o,s]of g){let c=t+i[0]*r,l=n+i[2]*r;a.push(e.v([c,o,l],[i[0]*s[0],s[1],i[2]*s[0]],3,_(c,o,l)))}v.push(a)}for(let t=0;t<l;t++)for(let n=0;n<g.length;n+=2)e.quad(v[t][n],v[t][n+1],v[t+1][n+1],v[t+1][n]);for(let[a,o]of[[u,-1],[d,1]]){let c=At(a),l=[o*c[2]*(d>u?-1:1),0,o*-c[0]*(d>u?-1:1)],p=(r,i)=>{let a=t+c[0]*r,o=n+c[2]*r;return e.v([a,i,o],l,3,_(a,i,o))},m=p(r,0),h=p(r,s-f),g=p(r+f,s),v=p(i-f,s),y=p(i,s-f),b=p(i,0);e.I.push(m,h,g,m,g,v,m,v,y,m,y,b,m,g,h,m,v,g,m,y,v,m,b,y)}}function Dc(e){let t=Sc(),n=[12,16,28,40][Math.max(0,Math.min(3,e|0))],r=e<=0?bc.slice(0,5):e===1?bc.slice(0,8):bc;for(let[e,i,a,o]of r)wc(t,e,0,i,a,o,n);if(e>=1)for(let[r,i,a,o,s,c,l,u]of xc){Ec(t,r,i,a,o,s,c,l,u,e>=2?96:40);let d=(a+o)/2,f=Math.max(2,Math.round(Math.abs(c-s)*Math.PI/180*d/.42));for(let e=0;e<f;e++){let a=(s+(c-s)*(e+.5)/f)*Math.PI/180,o=At(a),u=r+o[0]*d,p=i+o[2]*d;e%2==0?wc(t,u,l,p,1.25,a*180/Math.PI+90,n):Tc(t,u,l,p,.04,.016,a*3.1,Math.max(12,n>>1))}}return{position:new Float32Array(t.P),normal:new Float32Array(t.N),kind:new Float32Array(t.K),local:new Float32Array(t.L),index:new Uint32Array(t.I),triangles:t.I.length/3}}function Oc(e){let t=Sc();return wc(t,0,0,0,.74,0,[12,16,28,40][Math.max(0,Math.min(3,e|0))],!1),{position:new Float32Array(t.P),normal:new Float32Array(t.N),kind:new Float32Array(t.K),local:new Float32Array(t.L),index:new Uint32Array(t.I),triangles:t.I.length/3}}var kc=`
attribute float aKind;
attribute vec3 aLocal;
varying vec3 vW;
varying vec3 vN;
varying vec3 vL;
varying float vKind;
varying float vDist;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vL = aLocal;
  vKind = aKind;
  vec4 mv = viewMatrix * w;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`,Ac=`
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec3 uBoxDir;
uniform vec3 uBoxCol;
uniform float uBoxSize;
uniform vec3 uPool;
uniform vec2 uPoolR;
uniform vec2 uSlab;
uniform vec3 uFogCol;
uniform vec2 uFog;
uniform float uOpacity;
uniform vec4 uGear[3];
varying vec3 vW;
varying vec3 vN;
varying vec3 vL;
varying float vKind;
varying float vDist;
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}
float box(vec3 R, float size) {
  return exp(-(1.0 - dot(R, uBoxDir)) / size);
}
vec3 room(vec3 R) {
  // a dim warm room: darker below, a faint band at eye level
  return vec3(0.05, 0.036, 0.022) * (0.35 + 0.65 * smoothstep(-0.3, 0.5, R.y)) + vec3(0.03, 0.022, 0.014) * exp(-R.y * R.y * 14.0);
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (dot(N, V) < 0.0) N = -N;
  vec3 R = reflect(-V, N);
  float nv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - nv, 5.0);
  vec3 Hk = normalize(uKeyDir + V);
  vec3 Hr = normalize(uRimDir + V);
  float nl = max(dot(N, uKeyDir), 0.0);
  // the pool of light round the subject
  vec3 pd = vW - uPool;
  pd -= uKeyDir * dot(pd, uKeyDir);
  float pool = 1.0 - smoothstep(uPoolR.x, uPoolR.y, length(pd));
  float sz = (vDist - uSlab.x) / uSlab.y;
  float slab = mix(0.12, 1.0, exp(-sz * sz));
  pool *= slab;
  // derivatives in uniform control flow
  float fl = fwidth(vL.z);
  float fx = fwidth(vL.x);
  float r = length(vL.xz);
  float fr = fwidth(r);

  // the gears' shadows fall across anything on the plate
  float shade = 1.0;
  for (int i = 0; i < 3; i++) {
    vec4 g = uGear[i];
    if (g.w <= 0.0) continue;
    vec2 q = vW.xz - g.xy;
    float sh = 1.0 - smoothstep(g.z - 0.02, g.z + 0.12, length(q + uKeyDir.xz * (0.06 / max(uKeyDir.y, 0.08))));
    shade *= 1.0 - 0.7 * sh * g.w * step(vW.y, 0.06);
  }

  vec3 col;
  if (vKind < 0.5) {
    // gold chaton
    vec3 F0 = vec3(1.0, 0.74, 0.32);
    vec3 F = F0 + (1.0 - F0) * fres;
    col = F * (room(R) + uBoxCol * box(R, uBoxSize) + uKeyCol * pool * shade * (2.4 * pow(max(dot(N, Hk), 0.0), 260.0) + 0.1 * nl)
      + uRimCol * (2.0 * pow(max(dot(N, Hr), 0.0), 60.0)));
  } else if (vKind < 1.5) {
    // ruby: light gathered inside the stone and thrown back from the far side, a hard window highlight on top
    vec3 ruby = vec3(0.62, 0.012, 0.035);
    float inner = 0.16 + 0.95 * pow(max(dot(-N.xz, normalize(uKeyDir.xz + 1e-4)), 0.0) * 0.5 + 0.5 * nl, 1.4);
    float depth = 0.45 + 0.55 * nv;
    col = ruby * (inner * depth * (0.25 + 0.75 * pool * shade) * 1.25 + 0.03);
    col += vec3(0.95, 0.25, 0.2) * 0.3 * pow(nv, 6.0) * pool * shade * 0.5;
    float Fj = 0.07 + 0.93 * fres;
    col += Fj * (room(R) + uBoxCol * box(R, uBoxSize * 0.6) * 1.4 + uRimCol * pow(max(dot(N, Hr), 0.0), 90.0) * 3.0)
      + uKeyCol * pool * shade * pow(max(dot(N, Hk), 0.0), 520.0) * 3.5;
    // the oil sink
    col *= 1.0 - 0.55 * (1.0 - smoothstep(0.004, 0.009, r));
  } else if (vKind < 2.5) {
    // blued steel screw: mirror-polished, the blue of tempered steel
    vec3 F0 = vec3(0.04, 0.085, 0.42);
    vec3 F = F0 + (1.0 - F0) * fres;
    col = F * (room(R) * 1.2 + vec3(0.5, 0.75, 1.5) * uBoxCol * box(R, uBoxSize * 1.3) + uKeyCol * pool * shade * 2.2 * pow(max(dot(N, Hk), 0.0), 320.0)
      + uRimCol * 3.0 * pow(max(dot(N, Hr), 0.0), 50.0));
    col += vec3(0.004, 0.008, 0.03);
    // the slot: a dark groove across the head, its far wall catching the light
    float top = step(0.9, N.y);
    float w = max(0.0038, 1.2 * fl);
    float slot = (1.0 - smoothstep(w * 0.7, w, abs(vL.z))) * top;
    col = mix(col, vec3(0.002, 0.003, 0.008), 0.92 * slot);
    float lip = (1.0 - smoothstep(0.0, 1.6 * fl, abs(abs(vL.z) - w))) * top;
    col += uKeyCol * vec3(0.35, 0.5, 0.9) * 0.35 * lip * pool * shade;
  } else {
    // bridge brass
    vec3 F0 = vec3(0.98, 0.7, 0.33);
    float top = step(0.9, N.y);
    float bevel = step(0.3, N.y) * (1.0 - top);
    // Geneva stripes: bands across local x; the grain direction leans the other way in every other band
    float sw = 0.085;
    float bx = vL.x / sw;
    float band = floor(bx);
    float odd = mod(band, 2.0);
    float fb = fract(bx);
    float edge = min(fb, 1.0 - fb) * sw;
    float lean = mix(-0.55, 0.55, odd);
    vec3 T = normalize(vec3(cos(lean), 0.0, sin(lean)));
    vec3 B = vec3(-T.z, 0.0, T.x);
    vec3 Hb = normalize(uBoxDir + V);
    float thb = dot(T, Hb);
    float thk = dot(T, Hk);
    float grain = 0.6 + 0.8 * mix(noise1(dot(vL.xz, B.xz) * 900.0 + band * 17.0), 0.5, smoothstep(0.2, 0.8, 900.0 * fx));
    // each band arcs a little: the cutter's sweep
    float sweep = 0.75 + 0.25 * cos((fb - 0.5) * 3.1416);
    vec3 topCol = F0 * (room(R) * 0.6
      + uBoxCol * grain * sweep * (0.08 + 1.1 * exp(-thb * thb / 0.045)) * (0.25 + 0.75 * slab)
      + uKeyCol * pool * shade * grain * (0.03 + 0.55 * exp(-thk * thk / 0.012)) * (0.3 + nl));
    topCol *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, max(0.003, 1.5 * fx), edge));
    vec3 F = F0 + (1.0 - F0) * fres;
    vec3 polished = F * (room(R) + uBoxCol * box(R, uBoxSize * 1.4) * 1.2 + uKeyCol * pool * shade * (1.6 * pow(max(dot(N, Hk), 0.0), 140.0) + 0.12 * nl)
      + uRimCol * (2.2 * pow(max(dot(N, Hr), 0.0), 40.0)));
    // the walls are straight-grained and matt
    vec3 wall = F0 * (room(R) * 0.8 + uKeyCol * pool * shade * 0.07 * nl + uRimCol * 0.5 * max(dot(N, uRimDir), 0.0)) * (0.35 + 0.65 * smoothstep(0.0, 0.1, vW.y));
    col = mix(wall, polished, bevel);
    col = mix(col, topCol, top);
  }
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
  gl_FragColor = vec4(col * uOpacity, uOpacity);
}
`;function jc(e,t,n){let r=t=>{let n=new e.BufferGeometry;return n.setAttribute(`position`,new e.BufferAttribute(t.position,3)),n.setAttribute(`normal`,new e.BufferAttribute(t.normal,3)),n.setAttribute(`aKind`,new e.BufferAttribute(t.kind,1)),n.setAttribute(`aLocal`,new e.BufferAttribute(t.local,3)),n.setIndex(new e.BufferAttribute(t.index,1)),n},i=Dc(t),a=r(i),o=Oc(t),s=r(o),c={...n,uOpacity:{value:1}},l=new e.ShaderMaterial({name:`gears:dressing`,uniforms:c,vertexShader:kc,fragmentShader:Ac,transparent:!0});l.side=e.DoubleSide,gs(e,l,`over`);let u=new e.Mesh(a,l);u.name=`gears:dressing`,u.frustumCulled=!1,u.renderOrder=1.2;let d=new e.Mesh(s,l);return d.name=`gears:hub-jewel`,d.frustumCulled=!1,d.renderOrder=1.6,u.add(d),{object3D:u,hub:d,uniforms:c,material:l,tier:t,triangles:i.triangles+o.triangles,dispose(){s.dispose(),a.dispose(),l.dispose(),u.removeFromParent()}}}Object.freeze({idler:Object.freeze(vc),pinion:Object.freeze(yc)});var Mc=as(128,58),Nc=[1,.84,.62],Pc=2.6,Fc=Object.freeze([[4,62,17],[5.4,64,17],[6.05,68,19],[6.45,64,17],[7,66,17],[7.25,70,18],[io.to,70,18],[8.6,76,22],[9,90,24]].map(e=>Object.freeze(e))),Ic=Object.freeze([-38,13]),Lc=[.0034,.0032,.0066],Rc=[.0015,.0014,.003],zc=[.0038,.0036,.0076],Bc=[.03,.022,.014],Vc=[.005,.009,.022],Hc=[.04,.029,.017],Uc=is(`#1b2440`),Wc=[.004,.0034,.003],Gc=[.02,.035,.09],Kc=[.24,.13,.05],qc=[.02,.0105,.0045],Jc=[.2,.42,.95],Yc=[.0036,.0034,.0046],Xc=[1.15,.86,.52],Zc=.03,Qc=[1.06,.37,.1],$c=[1,.9,.74],el={night:`#0d0e18`,stage:`#06070c`},tl=[[.98,.69,.31],[.62,.38,.19],[.66,.67,.7],[.035,.08,.4]],nl=[.2,.3,.16,.14],rl=[.09,.055,.03],il=tl[0],al=6,ol=[[16,12],[40,30],[90,60],[140,90]],sl=[1.7,7],cl=[Math.cos(-40*Math.PI/180)*1.08,q.y0+q.idler.thick+.002,-Math.sin(-40*Math.PI/180)*1.08],ll=(()=>{let e=To.idler,t=66*Math.PI/180,n=q.idler.z*q.module/2;return[e[0]+Math.cos(t)*n,q.y0+q.pinion.thick+.002,e[2]-Math.sin(t)*n]})(),ul=[-1,-1,0,0],dl=(()=>{let e=e=>{let t=e.z*q.module/2;return[t-1.25*q.module,t+q.module,q.y0,q.y0+e.thick]};return[{id:`wheel`,teeth:e(q.main),jewel:ul},{id:`idler`,teeth:e(q.idler),jewel:ul},{id:`pinion`,teeth:e(q.pinion),jewel:[.0365,.0575,q.y0+q.pinion.thick+.0115,q.y0+q.pinion.thick+.026]},{id:`rule`,teeth:[-1,-1,0,0],jewel:ul}]})();function fl(e,t){if(!(t>e[0][0]))return[e[0][1],e[0][2]];for(let n=1;n<e.length;n++)if(t<=e[n][0]){let r=e[n-1],i=e[n],a=ns(r[0],i[0],t);return[$(r[1],i[1],a),$(r[2],i[2],a)]}let n=e[e.length-1];return[n[1],n[2]]}function pl(e,t,n){let[r,i]=fl(Fc,t),a=as(n-r,i);return e[0]=a[0],e[1]=a[1],e[2]=a[2],e}function ml(e,t){let n=as(t-Ic[0],Ic[1]);return e[0]=n[0],e[1]=n[1],e[2]=n[2],e}var hl=`
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}
`,gl=`
varying vec3 vW;
varying float vDist;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`,_l=`
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec3 uBoxDir;
uniform vec3 uBoxCol;
uniform vec3 uPool;
uniform vec2 uPoolR;
uniform vec2 uSlab;
uniform vec3 uBase;
uniform vec3 uTint;
uniform vec3 uFogCol;
uniform vec2 uFog;
uniform float uOpacity;
uniform float uRadius;
uniform vec4 uGear[3];
uniform vec2 uShadowOff;
varying vec3 vW;
varying float vDist;
${hl}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  const float PS = 0.046;
  const float PR = 0.034;
  const float ROW = 0.0398371; // 0.046 * sin 60
  vec2 p = vW.xz;
  float r = length(p);
  vec3 V = normalize(cameraPosition - vW);
  vec3 Hk = normalize(uKeyDir + V);
  vec3 Hr = normalize(uRimDir + V);
  vec3 Hb = normalize(uBoxDir + V);
  // units per pixel here, for the level of detail
  float upp = max(length(fwidth(p)), 1e-7);
  float spotPx = PR / upp;

  // the covering spot: of the lattice points within reach, the latest
  float jr = floor(p.y / ROW + 0.5);
  vec2 best = vec2(PR);
  vec2 bestId = vec2(0.0);
  float bestOrd = -1e9;
  for (int dj = -1; dj <= 1; dj++) {
    float j = jr + float(dj);
    float off = mod(j, 2.0) * 0.5 * PS;
    float ir = floor((p.x - off) / PS + 0.5);
    for (int di = -1; di <= 1; di++) {
      float i = ir + float(di);
      vec2 q = p - vec2(i * PS + off, j * ROW);
      float ord = j * 4096.0 + i;
      if (dot(q, q) < PR * PR && ord > bestOrd) {
        bestOrd = ord;
        best = q;
        bestId = vec2(i, j);
      }
    }
  }
  float rs = length(best);
  float seed = hash21(bestId + 17.0);
  vec3 T = rs > 1e-6 ? vec3(-best.y, 0.0, best.x) / rs : vec3(1.0, 0.0, 0.0);
  float tk = dot(T, Hk);
  float tr = dot(T, Hr);
  float tb = dot(T, Hb);
  // a small spot shows its mean fan, not a sparkle
  float lod = smoothstep(2.5, 6.0, spotPx);
  float sk = mix(0.16, exp(-tk * tk / 0.02), lod);
  float sr = mix(0.3, exp(-tr * tr / 0.06), lod);
  float sb = mix(0.3, exp(-tb * tb / 0.09), lod);
  float fg = rs * 2400.0 + seed * 37.0;
  float grain = mix(noise1(fg), 0.5, smoothstep(0.25, 0.8, 2400.0 * upp));
  float polish = 0.5 + 0.7 * grain + 0.35 * (seed - 0.5);
  float edge = (1.0 - smoothstep(0.6 * upp, 1.8 * upp, PR - rs)) * lod;
  float coarse = noise1(r * 23.0 + 4.0);

  // the pool of light round the subject, across the key's axis
  vec3 pd = vW - uPool;
  pd -= uKeyDir * dot(pd, uKeyDir);
  float pool = 1.0 - smoothstep(uPoolR.x, uPoolR.y, length(pd));
  float sz = (vDist - uSlab.x) / uSlab.y;
  pool *= mix(0.1, 1.0, exp(-sz * sz));

  float keyY = max(uKeyDir.y, 0.0);
  vec3 col = uBase * (0.8 + 0.4 * coarse);
  col += uKeyCol * uTint * (sk * polish * 0.04 * (0.35 + 2.0 * keyY)) * pool;
  col += uBoxCol * uTint * (sb * polish * 0.022) * (0.1 + 0.9 * pool) * max(dot(Hb, vec3(0.0, 1.0, 0.0)), 0.0);
  col += uRimCol * (sr * 0.1 * polish);
  col *= 1.0 - 0.4 * edge;

  // the gears' shadows (long, from the low key) and their contact darkness
  float occ = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 g = uGear[i];
    if (g.w <= 0.0) continue;
    float s = 1.0 - smoothstep(g.z - 0.06, g.z + 0.16, segDist(p, g.xy, g.xy + uShadowOff));
    float c = 1.0 - smoothstep(g.z - 0.12, g.z + 0.05, length(p - g.xy));
    occ = max(occ, max(0.85 * s, 0.7 * c) * g.w);
  }
  col *= 1.0 - occ;
  col = mix(uFogCol, col, 1.0 - smoothstep(uRadius * 0.8, uRadius, r));
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
  gl_FragColor = vec4(col * uOpacity, uOpacity);
}
`,vl=`
attribute vec4 aMat;
varying vec3 vW;
varying vec3 vN;
varying vec3 vP;
varying vec3 vPN;
varying vec3 vAxis;
varying vec3 vCentre;
varying float vAo;
varying float vSteel;
varying float vDist;
void main() {
  vec4 p = vec4(position, 1.0);
  vec4 wp = modelMatrix * p;
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vP = position;
  vPN = normal;
  vAxis = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
  vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vAo = aMat.w;
  // the instrument's variant (aMat.x mod 8): 2 and 3 are steel (the screws, the jewel's chaton)
  vSteel = step(1.5, mod(floor(aMat.x + 0.5), 8.0));
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`,yl=`
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec3 uBoxDir;
uniform vec3 uBoxCol;
uniform vec3 uPool;
uniform vec2 uPoolR;
uniform vec2 uSlab;
uniform vec3 uTint;
uniform vec4 uTooth;
uniform vec2 uFog;
uniform float uOn;
uniform float uSeed;
uniform vec4 uJewel;
varying vec3 vW;
varying vec3 vN;
varying vec3 vP;
varying vec3 vPN;
varying vec3 vAxis;
varying vec3 vCentre;
varying float vAo;
varying float vSteel;
varying float vDist;
${hl}
// one octave of turning marks: bands of polish across the radius, melted to their mean before they alias
float marks(float x) {
  return mix(noise1(x), 0.5, smoothstep(0.2, 0.7, fwidth(x)));
}
vec3 flat2(vec3 v, vec3 A) {
  vec3 h = v - A * dot(v, A);
  return h * inversesqrt(max(dot(h, h), 1e-10));
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// what a circular-grained face throws back of a light whose half vector is H:
// tight along the grooves (T), wide across them (Bv), so the light shows as a
// fan through the arbor
float fan(vec3 T, vec3 Bv, vec3 N, vec3 H, float along, float across) {
  float th = dot(T, H) / along;
  float bh = dot(Bv, H) / across;
  float nh = max(dot(N, H), 0.05);
  return exp(-(th * th + bh * bh) / (nh * nh));
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 A = normalize(vAxis);
  vec3 H = normalize(uKeyDir + V);
  vec3 Hr = normalize(uRimDir + V);
  vec3 Hb = normalize(uBoxDir + V);
  vec3 PN = normalize(vPN);
  float r = length(vP.xz);
  float y = vP.y;
  // every derivative first, in uniform control flow
  float fy = fwidth(y);
  vec3 q = vW - vCentre;
  q -= A * dot(q, A);
  float rq = length(q);
  float m1 = marks(rq * 1700.0 + uSeed);
  float m2 = marks(rq * 420.0 + 3.7 + uSeed);
  float m3 = marks(rq * 90.0 + 11.3 + uSeed);
  float mf = marks(atan(vP.z, vP.x) * r * 2600.0);
  // glitter: one facet in a hundred and fifty of the grain stands square to a light (fixed to
  // the wheel, so it winks as the wheel turns); gone before a facet is under two pixels
  const float CELL = 520.0;
  vec2 gc = vP.xz * CELL;
  vec2 gi = floor(gc);
  float gh = hash21(gi + uSeed);
  float facet = step(0.9935, gh) * (1.0 - smoothstep(0.12, 0.3, length(gc - gi - 0.5)))
              * smoothstep(1.6, 3.0, 1.0 / max(CELL * length(fwidth(vP.xz)), 1e-5));

  // the pool of light round the subject, across the key's axis
  vec3 pd = vW - uPool;
  pd -= uKeyDir * dot(pd, uKeyDir);
  float pool = 1.0 - smoothstep(uPoolR.x, uPoolR.y, length(pd));
  // and through the depth of the frame: the light holds round the sharp plane
  float sz = (vDist - uSlab.x) / uSlab.y;
  float slab = mix(0.1, 1.0, exp(-sz * sz));
  pool *= slab;

  vec3 add = vec3(0.0);
  float dark = 0.4 * (1.0 - clamp(vAo, 0.0, 1.0));
  float top = step(0.95, PN.y);
  float flank = 1.0 - step(0.3, abs(PN.y));
  float teeth = step(0.0, uTooth.x) * step(uTooth.x - 0.006, r) * step(r, uTooth.y + 0.006)
              * step(uTooth.z - 0.002, y) * step(y, uTooth.w + 0.002);
  // anywhere in the plane of the wheel's plate
  float plate = step(0.0, uTooth.x) * step(uTooth.z - 0.002, y) * step(y, uTooth.w + 0.002);
  float jewel = step(0.0, uJewel.x) * step(uJewel.x, r) * step(r, uJewel.y) * step(uJewel.z, y) * step(y, uJewel.w);
  top *= 1.0 - jewel;
  vec3 tint = mix(uTint, vec3(0.5, 0.56, 0.68), vSteel);

  // turned faces: circular graining round the arbor. The instrument's own
  // metal is dimmed under it and the face relit: the soft box as a broad
  // warm fan, the key as a narrow bright one, the rim as a cool one, all
  // broken into fine concentric lines of polish.
  if (top > 0.5) {
    vec3 T = rq > 1e-5 ? cross(A, q) / rq : vec3(1.0, 0.0, 0.0);
    vec3 Bv = cross(T, A);
    float polish = 0.3 + 0.75 * m1 + 0.4 * m2 + 0.25 * m3;
    float fb = fan(T, Bv, A, Hb, 0.17, 1.0);
    float fk = fan(T, Bv, A, H, 0.085, 0.8);
    float fr = fan(T, Bv, A, Hr, 0.16, 0.9);
    vec3 lit = uBoxCol * (0.02 + 0.62 * fb) + uKeyCol * (0.5 * fk) * pool + uRimCol * (0.75 * fr);
    add += tint * lit * polish * (0.06 + 0.94 * pool);
    // a slow change of tone across the wheel, never a flat fill
    add *= 0.85 + 0.3 * m3;
    add += tint * facet * (uBoxCol * (0.6 + 5.0 * fb) * (0.2 + 0.8 * slab) + uKeyCol * (5.0 * fk + 0.5) * pool);
    dark = max(dark, 0.82);
  }
  // every upright wall of the wheel's plate (teeth, spokes, windows): a polished
  // edge break along its top. A rounded edge holds every elevation, so it mirrors
  // the box overhead all the way round, and the key and the rim where its outward
  // bearing faces their half vectors; about two pixels wide, never wider than
  // 0.0035 units.
  if (flank * plate > 0.5) {
    vec3 nh = flat2(N, A);
    float gk = pow(max(dot(nh, flat2(H, A)), 0.0), 40.0);
    float gr = pow(max(dot(nh, flat2(Hr, A)), 0.0), 16.0);
    float w = min(0.0035, 2.4 * fy);
    float band = 1.0 - smoothstep(0.3 * w, w, uTooth.w - y);
    add += band * (uKeyCol * uTint * (2.8 * gk) * pool + uBoxCol * uTint * 0.85 * (0.12 + 0.88 * slab) + uRimCol * (1.6 * gr));
    dark = max(dark, 0.5 * band);
    // vertical draw-filing on the wall: fine upright lines of polish in the key's sheen
    float nl = max(dot(N, uKeyDir), 0.0);
    add += uKeyCol * uTint * (0.04 * nl * (0.4 + 1.2 * mf)) * pool * (1.0 - band);
    // between the teeth: darker roots, a contact shadow at the foot
    if (teeth > 0.5) {
      float span = max(uTooth.y - uTooth.x, 1e-4);
      float root = 1.0 - smoothstep(uTooth.x, uTooth.x + 0.55 * span, r);
      float foot = 1.0 - smoothstep(0.0, 0.022, y - uTooth.z);
      dark = max(dark, max(0.7 * root, 0.45 * foot) * (1.0 - band));
    }
  }
  // the ring jewel in the pinion's chaton: ruby
  if (jewel > 0.5) {
    vec3 ruby = vec3(0.62, 0.012, 0.035);
    float nv = clamp(dot(N, V), 0.0, 1.0);
    float nl = max(dot(N, uKeyDir), 0.0);
    float inner = 0.2 + 0.9 * pow(max(dot(-flat2(q, A), flat2(uKeyDir, A)), 0.0) * 0.6 + 0.4 * nl, 1.3);
    vec3 c = ruby * inner * (0.45 + 0.55 * nv) * (0.3 + 0.7 * pool) * 1.3;
    vec3 R = reflect(-V, N);
    float Fj = 0.07 + 0.93 * pow(1.0 - nv, 5.0);
    c += Fj * (uBoxCol * exp(-(1.0 - dot(R, uBoxDir)) / 0.02) * 1.4 + uRimCol * 2.5 * pow(max(dot(N, Hr), 0.0), 80.0));
    c += uKeyCol * pool * 3.5 * pow(max(dot(N, H), 0.0), 500.0);
    add = c;
    dark = 0.97;
  }
  float k = (1.0 - smoothstep(uFog.x, uFog.y, vDist)) * uOn;
  gl_FragColor = vec4(add * k, clamp(dark, 0.0, 0.97) * k);
}
`,bl=`
attribute vec4 aSeed;
attribute float aField;
uniform vec3 uCentre;
uniform vec2 uBox;
uniform vec2 uW;
uniform float uKeep;
uniform float uTime;
uniform vec3 uDrift;
uniform vec3 uKeyDir;
uniform float uFocus;
uniform float uDpr;
uniform float uNear;
uniform vec2 uFog;
uniform float uBright;
uniform vec4 uQuiet;
uniform float uQuietK;
uniform vec3 uPool;
uniform vec2 uPoolR;
varying float vA;
varying float vSoft;
varying float vSize;
void main() {
  float B = mix(uBox.x, uBox.y, aField);
  float w = mix(uW.x, uW.y, aField);
  float keep = step(fract(aSeed.w * 7.31 + 0.13), uKeep);
  float ph = aSeed.w * 6.2832;
  // a slow drift and a slower wander, wrapped into a box round the shot
  vec3 p = aSeed.xyz * B + uDrift * (uTime * (0.6 + 0.8 * aSeed.w));
  p += (0.05 * B) * vec3(sin(uTime * 0.13 + ph * 3.0), sin(uTime * 0.11 + ph * 5.0), sin(uTime * 0.12 + ph * 7.0));
  vec3 q = mod(p - uCentre + 0.5 * B, B) - 0.5 * B;
  vec3 wp = uCentre + q;
  float edge = max(max(abs(q.x), abs(q.y)), abs(q.z)) / (0.5 * B);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float z = -mv.z;
  gl_Position = projectionMatrix * mv;
  // out of focus a mote becomes a disc (circle of confusion about the focus)
  float coc = abs(1.0 - uFocus / max(z, 1e-4));
  float sizeCss = clamp(2.0 + 9.0 * coc, 2.0, 34.0);
  float s = sizeCss * uDpr;
  // (never under 6 px: the lens works at half resolution, and a smaller speck would come out of it square)
  vSize = clamp(s, 6.0, 120.0);
  gl_PointSize = vSize;
  vSoft = clamp(coc * 0.8, 0.0, 1.0);
  // dust lights up looking toward the light (Henyey-Greenstein, g = 0.55),
  // held to 2.4 so a mote against the key is a mote, not a star
  vec3 V = normalize(wp - cameraPosition);
  float mu = dot(V, uKeyDir);
  float phase = min(0.6975 / pow(max(1.3025 - 1.1 * mu, 1e-4), 1.5), 2.4);
  float tw = 0.65 + 0.35 * pow(0.5 + 0.5 * sin(uTime * (0.5 + 1.2 * aSeed.w) + ph * 11.0), 6.0);
  float spread = 2.0 / sizeCss;
  // dust shows where the lamp's beam passes: bright in the pool of light, nearly gone outside it
  vec3 pd = wp - uPool;
  pd -= uKeyDir * dot(pd, uKeyDir);
  float beam = mix(0.07, 1.0, 1.0 - smoothstep(0.5 * uPoolR.x, 0.9 * uPoolR.y, length(pd)));
  float cover = clamp(s * 0.5, 0.0, 1.0);
  vec2 ndc = gl_Position.xy / max(gl_Position.w, 1e-6);
  vec2 dq = max(uQuiet.xy - ndc, ndc - uQuiet.zw);
  float quiet = 1.0 - smoothstep(0.0, 0.2, max(dq.x, dq.y));
  vA = uBright * w * keep * (0.25 + phase) * tw * spread * cover * cover * mix(beam, 0.6 + 0.4 * beam, aField)
     * (1.0 - smoothstep(0.75, 1.0, edge))
     * smoothstep(uNear * 3.0, uNear * 12.0, z)
     * (1.0 - smoothstep(uFog.x, uFog.y, z))
     * (1.0 - 0.85 * uQuietK * quiet);
  if (vA < 1e-4) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}
`,xl=`
uniform vec3 uColor;
varying float vA;
varying float vSoft;
varying float vSize;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  float sharp = exp(-r2 * 6.0) * (1.0 - r2);
  float disc = smoothstep(0.0, 1.0, (1.0 - r) * max(vSize * 0.3, 1.2)) * (0.75 + 0.25 * smoothstep(0.5, 0.95, r));
  // a small mote is a soft round speck whatever its focus; only a large one shows its disc
  float k = mix(sharp, disc, vSoft * smoothstep(7.0, 12.0, vSize)) * vA;
  gl_FragColor = vec4(uColor * k, k);
}
`;function Sl(e){let{THREE:t}=e,n=e.instrument,r=!!e.reducedMotion,i=e.rngFor,a=new t.Scene;a.name=`act:gears`;let o=new t.PerspectiveCamera(34,1.6,.01,50),s=ms(t),c=n?Bi(n):null,l=mc(t),u={width:0,height:0,dpr:1},d=Number.isFinite(e.tier)?Math.max(0,Math.min(3,Math.round(e.tier))):2,f=!1,p=!1,m=null,h=[],g={uKeyDir:{value:new t.Vector3(0,1,0)},uKeyCol:{value:new t.Vector3(...Nc)},uRimDir:{value:new t.Vector3(0,1,0)},uRimCol:{value:new t.Vector3(...Jc)},uTint:{value:new t.Vector3(...il)},uFog:{value:new t.Vector2(1e6,2e6)},uFogCol:{value:new t.Vector3(...Lc)},uBoxDir:{value:new t.Vector3(0,1,0)},uBoxCol:{value:new t.Vector3(...Xc)},uBoxSize:{value:Zc},uPool:{value:new t.Vector3},uPoolR:{value:new t.Vector2(1e5,2e5)},uSlab:{value:new t.Vector2(1,1e5)},uGear:{value:[new t.Vector4,new t.Vector4,new t.Vector4]}},_=ac(t);h.push(_),a.add(_.object3D);let v={...g,uBase:{value:new t.Vector3(...Yc)},uOpacity:{value:1},uRadius:{value:Pt.radius},uShadowOff:{value:new t.Vector2}},y=new t.ShaderMaterial({name:`gears:floor`,uniforms:v,vertexShader:gl,fragmentShader:_l,transparent:!0});gs(t,y,`over`);let b=new t.CircleGeometry(Pt.radius,128);b.rotateX(-Math.PI/2);let x=new t.Mesh(b,y);x.name=`gears:floor`,x.renderOrder=1,h.push(b,y),a.add(x);let S={value:0},C=new t.BufferGeometry;h.push(C);let w=dl.map((e,n)=>{let r=new t.ShaderMaterial({name:`gears:detail`,uniforms:{...g,uOn:S,uTooth:{value:new t.Vector4(...e.teeth)},uSeed:{value:n*7.31},uJewel:{value:new t.Vector4(...e.jewel)}},vertexShader:vl,fragmentShader:yl,transparent:!0,depthWrite:!1,depthFunc:t.LessEqualDepth,polygonOffset:!0,polygonOffsetFactor:-1,polygonOffsetUnits:-2});gs(t,r,`over`);let i=new t.Mesh(C,r);return i.name=`gears:detail:`+e.id,i.matrixAutoUpdate=!1,i.frustumCulled=!1,i.renderOrder=1.5,i.visible=!1,h.push(r),a.add(i),{id:e.id,mesh:i,group:null,src:null}}),T=null;function E(){return T&&T.tier===d||(T&&T.dispose(),T=jc(t,d,g),a.add(T.object3D)),T}let D=ys(t,[{p:cl,color:Qc,size:16,alpha:0},{p:ll,color:Qc,size:16,alpha:0}],{additive:!0,core:1,coreK:64,halo:.14,haloK:5.5,lift:.012,name:`gears:glint`,renderOrder:5});h.push(D),a.add(D.object3D);let O=null;function k(){let[e,n]=ol[3],r=e+n,o=new Float32Array(r*4),s=new Float32Array(r),c=i?i(7,`gears:motes`):Cl(7);for(let t=0;t<r;t++){for(let e=0;e<4;e++)o[t*4+e]=c();s[t]=t<e?0:1}let l=new t.BufferGeometry;l.setAttribute(`position`,new t.BufferAttribute(new Float32Array(r*3),3)),l.setAttribute(`aSeed`,new t.BufferAttribute(o,4)),l.setAttribute(`aField`,new t.BufferAttribute(s,1));let u={uCentre:{value:new t.Vector3},uBox:{value:new t.Vector2(sl[0],sl[1])},uW:{value:new t.Vector2(1,0)},uKeep:{value:1},uTime:{value:0},uDrift:{value:new t.Vector3(.006,.0025,-.0045)},uKeyDir:g.uKeyDir,uFocus:{value:1},uDpr:{value:1},uNear:{value:.01},uFog:g.uFog,uBright:{value:.36},uQuiet:{value:new t.Vector4(-2,-2,-2,-2)},uQuietK:{value:0},uPool:g.uPool,uPoolR:g.uPoolR,uColor:{value:new t.Vector3(...$c)}},d=new t.ShaderMaterial({name:`gears:motes`,uniforms:u,vertexShader:bl,fragmentShader:xl,transparent:!0,depthWrite:!1});gs(t,d,`add`);let f=new t.Points(l,d);f.name=`gears:motes`,f.frustumCulled=!1,f.renderOrder=4;let p=new t.Vector4,m=new t.Vector2;return f.onBeforeRender=e=>{u.uDpr.value=hs(e,p,m)},h.push(l,d),a.add(f),{points:f,uniforms:u,nf:e,nc:n}}async function A(t){if(p)throw Error(`gears act: disposed`);return m||=(async()=>{t?.(0),O=k(),t?.(.4),n&&await(e.instrumentReady||Hi(n)),p||(f=!0,t?.(1))})(),m}let j={r0:1e5,r1:2e5},M=[0,0,0],N=[0,1,0],P=[0,1,0],F=[0,1,0],I=[0,0,0],ee=[0,0,0],L=[0,0,0],te=0;function ne(e,t,n,i,a,o){let s=e.params||{},c=Number.isFinite(e.u)?e.u:4,l=e.viewport===`port`?`port`:`land`,u=Number.isFinite(s.train)?s.train:1,f=Number.isFinite(s.crank)?s.crank:0,p=ns(3.7,4.25,c),m=ns(8.7,9,c),h=ns(8.25,8.55,c);Math.hypot(o[0],o[2])>1e-4&&(te=Math.atan2(-o[2],o[0])/es),pl(P,c,te),ss(N,Mc,P,p),ml(F,te);let b=$(1,Pc,p)*(1-.15*ns(8.1,8.6,c))*(1-.7*m),C=n*$(1.24,1.05,p),w=$(n*$(1.98,2.7,p),C*1.6,m);{let e=g.uBoxDir.value;e.set(o[0],Math.abs(o[1])+.1,o[2]),e.lengthSq()<1e-8&&e.set(0,1,0),e.normalize();let t=p*(1-.75*m);g.uBoxCol.value.set(Xc[0]*t,Xc[1]*t,Xc[2]*t)}let T=$(40,1,ns(0,.9,p));j.r0=.2*n*T,j.r1=.85*n*T,g.uSlab.value.set(n,.5*n*T),g.uPool.value.set(a[0],a[1],a[2]),g.uPoolR.value.set(j.r0,j.r1),g.uKeyDir.value.set(N[0],N[1],N[2]),g.uKeyCol.value.set(Nc[0]*b,Nc[1]*b,Nc[2]*b),g.uRimDir.value.set(F[0],F[1],F[2]),g.uRimCol.value.set(Jc[0]*p,Jc[1]*p,Jc[2]*p),g.uFog.value.set(C,w);let k=Number.isInteger(e.beat)?e.beat:-1,A=k>=0&&Wo[k]?Wo[k].quiet[l]:null,M=A&&ls(A)?R(c):0,I=_.uniforms;I.uBase.value.set(Rc[0],Rc[1],Rc[2]),I.uHorizon.value.set($(zc[0],qc[0],h),$(zc[1],qc[1],h),$(zc[2],qc[2],h)),I.uKeyGlow.value.set(Bc[0],Bc[1],Bc[2]).multiplyScalar(p*(1-.6*m)),I.uRimGlow.value.set(Vc[0],Vc[1],Vc[2]).multiplyScalar(p),I.uKeyDir.value.set(N[0],N[1],N[2]),I.uRimDir.value.set(F[0],F[1],F[2]),I.uExposure.value=1-.5*m,_.setQuiet(A,M);let ee=Math.max(Zs(s.build??0),Math.min(1,Math.max(0,u))*.08),L=Qs(u,ee),ne=p*(1-ns(0,.6,sn(ee).base??0));x.visible=ne>.002,v.uOpacity.value=ne,y.depthWrite=ne>.995;let z=$s(f,L),re=e=>e*q.module/2+q.module;g.uGear.value[0].set(0,0,re(q.main.z),L.wheel),g.uGear.value[1].set(z.idler[0],z.idler[2],re(q.idler.z),L.idler),g.uGear.value[2].set(z.pinion[0],z.pinion[2],re(q.pinion.z),L.pinion);let B=E();B.object3D.visible=ne>.002,B.uniforms.uOpacity.value=ne,B.material.depthWrite=ne>.995,B.hub.visible=L.idler>.001,B.hub.position.set(z.idler[0],.127,z.idler[2]);let ie=Math.max(N[1],.05);v.uShadowOff.value.set(-N[0]/ie*.08,-N[2]/ie*.08),S.value=ns(.55,.95,p)*(1-.6*m);let ae=ns(1.86,2,u)*(1-ns(2.88,3,u)),V=ns(2.88,3,u)*(1-ns(8.25,8.55,c)),H=e=>{let t=(e-Math.floor(e)-.5)/.18;return .6+.4*Math.exp(-t*t)},oe=p*(1-.7*m);if(D.set(0,{alpha:ae*oe*H(z.T.main.rot*q.main.z/(2*Math.PI))}),D.set(1,{alpha:V*oe*H(z.T.pinion.rot*q.pinion.z/(2*Math.PI))}),D.commit(),D.setFog(C*1.4,w*1.4),O){let e=O.uniforms;e.uTime.value=r?0:t,e.uCentre.value.set(a[0],a[1],a[2]),e.uFocus.value=n,e.uNear.value=i.near,e.uW.value.set(p*(1-h),h*(1-.6*m)),e.uBright.value=$(2.2,4.5,h)*(1-.6*m);let[o,s]=ol[d];e.uKeep.value=(o+s)/(O.nf+O.nc),A&&M>0?(e.uQuiet.value.set(Math.min(A[0],A[2]),Math.min(A[1],A[3]),Math.max(A[0],A[2]),Math.max(A[1],A[3])),e.uQuietK.value=M):e.uQuietK.value=0}return{u:c,vp:l,kIn:p,kOut:m,kUp:h,keyI:b,fog:[C,w],train:u,crank:f,build:ee,reveal:L,centre:a}}function z(e,t){let r=c.acquire(a,{position:[0,0,0]});n.setBuild(t.build),n.setCrank(t.crank),n.setArms(0),n.setContact(0),n.setBrass(1*t.kIn),n.setViewport(t.vp),n.setCrankAccent(0);for(let e=0;e<3;e++)M[e]=t.centre[e]+N[e]*al;n.setLight({dir:N,color:Nc,intensity:t.keyI*$(1,.5,t.kIn),ambient:$(.03,.01,t.kIn),position:M,range:1e4,cone:[Math.min(89,Math.atan(j.r1/al)/es),Math.min(88,Math.atan(j.r0/al)/es)]}),os(I,Uc,Hc,t.kIn),os(I,I,Gc,t.kUp),os(ee,Wc,Kc,t.kUp*(1-t.kOut));for(let e=0;e<3;e++)L[e]=Jc[e]*t.kIn;if(n.setEnvColors({sky:I,ground:ee,rim:L}),n.setLook({fog:t.fog,fogColor:Lc,macro:[.004,.008],ink:1,dark:.75,outline:$(1,.6,t.kIn),widthK:1,spacing:3.6,brush:$(1,.25,t.kIn),palette:{night:el.night,stage:el.stage}}),r){let e=r,n=t.kIn;if(e.uMetal&&Array.isArray(e.uMetal.value)&&e.uMetal.value.forEach((e,t)=>{let r=tl[t];r&&e.set($(e.x,r[0],n),$(e.y,r[1],n),$(e.z,r[2],n))}),e.uRough&&e.uRough.value){let r=e.uRough.value,i=.1*t.kUp;r.set($(r.x,nl[0]+i,n),$(r.y,nl[1]+i*.5,n),$(r.z,nl[2],n),$(r.w,nl[3],n))}e.uPatina&&e.uPatina.value&&e.uPatina.value.set(rl[0],rl[1],rl[2]),e.uRimDir&&e.uRimDir.value&&e.uRimDir.value.set(F[0],F[1],F[2])}tc(n,t.crank,t.reveal)&&c.markPose()}function re(){let e=n.object3D;e.updateMatrixWorld(!0);let t=S.value>.002;for(let n of w){n.group&&n.group.parent===e||(n.group=e.getObjectByName(`instrument:`+n.id)||null,n.src=null),n.group&&(!n.src||n.src.parent!==n.group)&&(n.src=n.group.children.find(e=>e.isMesh&&e.material&&e.material.name===`instrument-solid`)||null);let r=n.src;!t||!r||!n.group.visible||!r.visible?n.mesh.visible=!1:(n.mesh.geometry!==r.geometry&&(n.mesh.geometry=r.geometry),n.mesh.matrix.copy(r.matrixWorld),n.mesh.matrixWorldNeedsUpdate=!0,n.mesh.visible=!0)}}function B(){for(let e of w)e.mesh.visible=!1,e.mesh.geometry=C}function ie(e,t){let n=ns(8.15,8.5,e);return{focus:t,aperture:$(1.5,.13,n)*ns(3.95,4.3,e),slab:$(.07,.2,n),near:1,on:1}}let ae=new t.Scene,V=new t.Vector3,H=new t.Vector3;return{id:`gears`,load:A,get ready(){return f},setTier(e){d=Math.max(0,Math.min(3,Math.round(Number(e))||0))},resize(e,t,n){u.width=e,u.height=t,u.dpr=n||1},render(t,r,i,m=0){if(p)return;let h=e.renderer;if(!f||!t){s(h,i,ae,o,Lc);return}let g=us(`gears`,t,r),_=g.three||o,v=g.dist;g.frame&&(v=ds(o,g.frame,ps(i,u),{nearK:.012,minNear:.003,farK:8,farAdd:8})),_.getWorldDirection(H),V.copy(H).multiplyScalar(v).add(_.position);let y=ne(t,m,v,_,[V.x,V.y,V.z],[H.x,H.y,H.z]);try{n&&n.ready?(z(t,y),re()):B();let e=d>=1&&i&&i.isWebGLRenderTarget?ie(y.u,v):null;e?(s(h,l.ensure(i),a,_,Lc),l.apply(h,i,_,{...e,tier:d})):(l.free(),s(h,i,a,_,Lc))}finally{c&&c.held&&c.release(),B()}},pick(){return null},stonesScreen(){return[]},finishHints(){return{glow:{strength:1,threshold:.9},rolloff:{knee:.8,white:.25},vignette:.34,grain:.026}},dispose(){if(!p){p=!0,c&&c.held&&c.release(),B();for(let e of h)e.dispose?.();l.dispose(),T&&T.dispose(),a.clear()}}}}function Cl(e){return()=>{e=e+1831565813>>>0;let t=e;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}}var wl=Math.PI/180,Tl=Object.freeze({ROOM:0,OUT:1,BG_MAIN:2,BG_REFL:3,FLOOR:4,SEA:5,DUST:6}),El=(...e)=>e.reduce((e,t)=>e|1<<t,0),Dl=Object.freeze({room:El(Tl.ROOM,Tl.BG_MAIN,Tl.FLOOR,Tl.DUST),out:El(Tl.OUT,Tl.SEA),mirrorOut:El(Tl.OUT),mirrorRoom:El(Tl.ROOM,Tl.BG_REFL),sea:El(Tl.OUT)}),Ol=Object.freeze([`Outside_Land`,`Skyline`]),kl=Object.freeze([`Compute_Rack`,`Outside_Land`,`Skyline`]),Al=Object.freeze([`Monitor_Left_Screen`,`Monitor_Center_Screen`,`Monitor_Right_Screen`,`Desk_Mat`]),jl=`Window_Glass`,Ml=Object.freeze([`Monitor_Left_Screen`,`Monitor_Center_Screen`,`Monitor_Right_Screen`,`Desk_Mat`,`Window_Glass`,`Desk_Lamp`,`Floor`,`Sea`,`Outside_Land`,`Skyline`,`Instrument_Contact_Shadow`,`Globe_Lamp_Foot`,`Globe_Lamp_Head`,`Globe_Lamp_Mezz`,`Ring_Light`,`Board`]),Nl=/^Unlit_([0-9a-f]{6})_e([0-9.]+)$/,Pl=new Set(Ol),Fl=new Set(kl),Il=new Set(Al);function Ll({node:e,name:t=``,emit:n,transparent:r=!1}){if(e===`Sea`)return{kind:`sea`,layer:Tl.SEA};if(t===`Contact_Shadow`||e===`Instrument_Contact_Shadow`)return{kind:`shadow`,layer:Tl.ROOM};if(t===`LM_Floor`||e===`Floor`)return{kind:`floor`,layer:Tl.FLOOR};let i=Pl.has(e),a=i?Tl.OUT:Tl.ROOM;if(t.startsWith(`LM_`))return{kind:`bake`,layer:a,lit:!i};if(t.endsWith(`_Unlit`))return Il.has(e)?{kind:`screen`,layer:a}:{kind:`image`,layer:a,lit:!i};let o=Nl.exec(t),s=Number(n);if(o||n!=null&&Number.isFinite(s)){let t=o?Number(o[2]):s;return{kind:`emit`,layer:a,group:i?`outside`:Fl.has(e)?`always`:e===`Desk_Lamp`?`lamp`:`room`,strength:t}}return t===`Glass_Export`||r?{kind:`glass`,layer:a,window:e===jl}:{kind:`fallback`,layer:a,lit:!i}}var Rl=Object.freeze({instrument:`Anchor_Instrument`,monitorLeft:`Anchor_Monitor_Left`,monitorCenter:`Anchor_Monitor_Center`,board:`Anchor_Board`,bed:`Anchor_Bed`,window:`Anchor_Window`,notebook:`Anchor_Notebook`,books:`Anchor_Books`});function zl(e,t,n={}){let r=(e,t)=>Array.isArray(e)&&e.length>=3&&e.every(Number.isFinite)?e.slice(0,3):t.slice(),i={name:e,position:r(t,[0,0,0]),facing:r(n.facing,[0,0,1]),size:r(n.size,[0,0,0]),boundsMin:r(n.bounds_min,t),boundsMax:r(n.bounds_max,t),beat:Number.isInteger(n.beat)?n.beat:null};for(let e of[`height`,`radius`,`yaw`])Number.isFinite(n[e])&&(i[e]=n[e]);return i}function Bl(e){let t={};for(let[n,r]of Object.entries(Rl)){let i=e&&e[r]||Vl[r];t[n]=zl(r,i.position,i)}return t}var Vl={Anchor_Instrument:{position:[-1.3,.77,-6.22],size:[.2932,.414,.2932],bounds_min:[-1.4466,.77,-6.3666],bounds_max:[-1.1534,1.184,-6.0734],height:.414,radius:.1466,yaw:.4887,facing:[0,1,0],beat:null},Anchor_Monitor_Left:{position:[-4.0341,1.12,-6.4365],size:[.6887,.44,.3662],bounds_min:[-4.3785,.9,-6.6196],bounds_max:[-3.6898,1.34,-6.2534],beat:13,facing:[.4695,0,.8829]},Anchor_Monitor_Center:{position:[-3.05,1.15,-6.6195],size:[1.2,.5,0],bounds_min:[-3.65,.9,-6.6195],bounds_max:[-2.45,1.4,-6.6195],beat:14,facing:[0,0,1]},Anchor_Board:{position:[1.15,1.95,-6.955],size:[2.5,1.5625,0],bounds_min:[-.1,1.1688,-6.955],bounds_max:[2.4,2.7313,-6.955],beat:15,facing:[0,0,1]},Anchor_Bed:{position:[3.85,.58,-5.635],size:[2.1618,1.4068,1.9802],bounds_min:[2.7382,0,-6.59],bounds_max:[4.9,1.4068,-4.6098],beat:16,facing:[-.8745,0,.485]},Anchor_Window:{position:[-3.01,2.5,-7.01],size:[4.02,5,.02],bounds_min:[-5.02,0,-7.02],bounds_max:[-1,5,-7],beat:17,facing:[0,0,1]},Anchor_Notebook:{position:[-3.9,.7896,-6.1],size:[.3192,.0161,.2302],bounds_min:[-4.0596,.7735,-6.2151],bounds_max:[-3.7404,.7896,-5.9849],facing:[0,1,0],beat:null},Anchor_Books:{position:[2.02,.593,-2.6195],size:[.3222,.3,.3139],bounds_min:[1.8589,.443,-2.7764],bounds_max:[2.1811,.743,-2.4625],facing:[-.7268,0,.6869],beat:null}},Hl=Object.freeze(Bl(null)),Ul=Object.freeze({ground:Nt,top:J.c[1]+J.rings[0].R+.02,centre:J.c[1]});function Wl(e){let t=Number.isFinite(e.height)?e.height:e.size[1]>0?e.size[1]:.414,n=t/(Ul.top-Ul.ground),r=Number.isFinite(e.yaw)?e.yaw:0,i=e.position,a=[i[0],i[1]-Ul.ground*n,i[2]];return Object.freeze({position:Object.freeze(a),yaw:r/wl,yawRad:r,scale:n,height:t,base:Object.freeze(i.slice()),centre:Object.freeze([a[0],a[1]+Ul.centre*n,a[2]])})}var Gl=Object.freeze([Object.freeze({outScale:.75,outSamples:0,dust:70,anisotropy:1,set:`phone`}),Object.freeze({outScale:1,outSamples:0,dust:120,anisotropy:2,set:`phone`}),Object.freeze({outScale:1,outSamples:2,dust:170,anisotropy:8,set:`desktop`}),Object.freeze({outScale:1,outSamples:4,dust:220,anisotropy:8,set:`desktop`})]);function Kl(e){let t=he(e),n=fe[t],r=Gl[t],i=n.reflection.enabled;return Object.freeze({tier:t,outScale:r.outScale,outSamples:r.outSamples,floor:i?n.reflection.scale:0,sea:i?n.reflection.seaScale:0,sky:n.sky,dust:r.dust,anisotropy:r.anisotropy,set:r.set})}function ql(e,t){let n=Kl(t).set,r=e&&e.sets||{};if(r[n]&&r[n].file)return n;let i=n===`desktop`?`phone`:`desktop`;if(r[i]&&r[i].file)return i;throw Error(`room: the manifest names no desktop or phone set`)}function Jl(e){let t=[];if(!e||typeof e!=`object`)return[`manifest is not an object`];e.version!==1&&t.push(`manifest version ${e.version} (this act reads 1)`);for(let n of[`desktop`,`phone`]){let r=e.sets&&e.sets[n];r&&typeof r.file==`string`&&r.file.endsWith(`.glb`)||t.push(`sets.${n}.file missing`)}let n=e.requires&&e.requires.extensions||[];for(let e of n)Yl.includes(e)||t.push(`requires unknown extension ${e}`);for(let n of Object.values(Rl)){let r=e.anchors&&e.anchors[n];r&&Array.isArray(r.position)&&r.position.length===3||t.push(`anchor ${n} missing`)}return t}var Yl=Object.freeze([`EXT_meshopt_compression`,`KHR_mesh_quantization`,`EXT_texture_webp`,`KHR_materials_unlit`]),Xl=e=>e<=0?0:e>=1?1:e,Zl=(e,t,n)=>{let r=Xl((n-e)/(t-e));return r*r*(3-2*r)};function Ql(e){let t=Xl(Number.isFinite(e)?e:0);return{lamp:Zl(0,.28,t),room:Zl(.2,1,t)}}var $l=Object.freeze({start:.05,perMetre:.088,width:.1,reach:9.6});function eu(e,t){let n=Xl((e-$l.start-$l.perMetre*Math.min(t,$l.reach))/$l.width);return n*n*(3-2*n)}var tu=Object.freeze([Object.freeze({id:`desk`,t:.1,re:/^(Strip_Desk_|Strip_Pedestal_|Strip_Cabinet_(Violet|Floor)|Desk_Objects$)/}),Object.freeze({id:`shelves`,t:.28,re:/^(Strip_Shelf_|Strip_Cabinet_Top|Strip_Mezzanine_|Ornaments$|Globe_Lamp_Mezz$)/}),Object.freeze({id:`ceiling`,t:.46,re:/^(Strip_Ceiling_|Strip_Cove_|Strip_Ring_Light$|Ring_Light$)/}),Object.freeze({id:`bed`,t:.64,re:/^(Strip_Bed_|Strip_Picture_|Globe_Lamp_(Foot|Head)$|Soft_Toys$|Lounge$)/})]),nu=.012,ru=.07;function iu(e,t){let n=tu.find(t=>t.re.test(e)),r=Math.min(Math.max(t,0),$l.reach);return n?n.t+nu*r:$l.start+$l.perMetre*r-.03}function au(e,t){let n=Xl((e-t)/ru);return n*n*(3-2*n)}function ou(e,t){let n=t.emitCap;return n*(1-Math.exp(-Math.max(e,0)*t.emitK/n))}function su(e,t=[0,0,0]){let n=Xl(e);return t[0]=1,t[1]=.22+.38*n,t[2]=.03+(.27-.03)*n,t}function cu(){return{emitK:1.6,emitCap:2.4,screenK:1.7,night:[.004,.0045,.009],pool:1.1,poolReach:.42,glassTransmit:.93,shadow:1,reflection:1,dustStar:[.2,.22,.3],dustLamp:2.2,dustReach:.5,dustDrift:.045,keyIntensity:3.2,keyRange:.45,keyCone:[78,38],ambient:[.012,.035],envNight:[.004,.005,.012],envRoom:[.3,.2,.105],envScreens:[.012,.024,.05],groundNight:[.001,.001,.002],groundRoom:[.034,.023,.015],rimStar:[.03,.045,.11],rimAurora:[.02,.3,.26],fillScreens:[.05,.09,.17],fillRoom:[.03,.022,.03],fillDir:[-.97,.12,-.2],rimDir:[-.36,.34,-.87],contact:[.82,.018,.11]}}var lu=Object.freeze({glow:Object.freeze({strength:1,threshold:1,weights:Object.freeze([.3,.2,.08])}),rolloff:Object.freeze({knee:.9,white:.3}),veil:Object.freeze([.0024,.0021,.0058]),vignette:.22,grain:.02}),uu=`
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,du=`
uniform sampler2D tBg;
uniform vec2 uInvRes;
void main() {
  gl_FragColor = vec4(texture2D(tBg, gl_FragCoord.xy * uInvRes).rgb, 1.0);
}
`,fu=`
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`,pu=`
uniform sampler2D map;
uniform sampler2D tRefl;
uniform sampler2D tReflBlur;
uniform vec3 uLampPos;
uniform vec4 uFront;
uniform vec3 uNight;
uniform vec2 uInvRes;
uniform float uRefl;
varying vec2 vUv;
varying vec3 vWorld;
// the light front (as POOL_FRAG): night until the room's lights reach this tile
float roomFront(float d) {
  float x = clamp((uFront.x - uFront.y - uFront.z * min(d, 9.6)) / uFront.w, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 base = texture2D(map, vUv).rgb * mix(uNight, vec3(1.0), roomFront(length(vWorld - uLampPos)));
  // Blender object space of the Floor box: x = three x, y = -three z - 3.5
  vec2 o = vec2(vWorld.x, -vWorld.z - 3.5);
  float tile = 1.2;
  float row = floor(o.y / tile);
  float xs = o.x + mod(row, 2.0) * 0.5 * tile;
  vec2 id = vec2(floor(xs / tile), row);
  vec2 f = vec2(fract(xs / tile), fract(o.y / tile));
  vec2 e = min(f, 1.0 - f) * tile;
  float edge = min(e.x, e.y);
  // a 3.5 mm joint, antialiased by its screen footprint
  float fw = max(fwidth(edge), 1e-4);
  float joint = 1.0 - smoothstep(0.0012, 0.0012 + 1.5 * fw, edge);
  float th = hash12(id + 4.0);
  // roughness wanders inside a tile and from tile to tile (0.08 .. 0.25)
  float rough = mix(0.08, 0.25, clamp(0.55 * th + 0.6 * vnoise(o * 1.6 + th * 7.0) - 0.1, 0.0, 1.0));
  vec3 col = base * (1.0 - 0.45 * joint);
  if (uRefl > 0.0) {
    // a very low broad bump: reflections waver a little, like real tiles
    vec2 wob = vec2(vnoise(o * 2.3 + th * 11.0), vnoise(o * 2.3 + 17.0 + th * 5.0)) - 0.5;
    vec2 suv = gl_FragCoord.xy * uInvRes + wob * 0.0035;
    vec3 sharp = texture2D(tRefl, suv).rgb;
    vec3 soft = texture2D(tReflBlur, suv).rgb;
    vec3 r = mix(sharp, soft, smoothstep(0.07, 0.2, rough));
    vec3 V = normalize(cameraPosition - vWorld);
    float c = clamp(V.y, 0.0, 1.0);
    // dielectric Fresnel (F0 0.04) plus a faint coat; rough tiles reflect a little less
    float F = 0.04 + 0.96 * pow(1.0 - c, 5.0);
    F *= mix(1.0, 0.7, smoothstep(0.1, 0.25, rough));
    col += r * F * uRefl * (1.0 - joint);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,mu=fu,hu=`
uniform sampler2D tRefl;
uniform vec2 uInvRes;
uniform vec3 uBase;
uniform float uTime;
uniform float uRefl;
varying vec2 vUv;
varying vec3 vWorld;

void main() {
  vec3 col = uBase;
  if (uRefl > 0.0) {
    vec2 uv = gl_FragCoord.xy * uInvRes;
    vec3 V = normalize(cameraPosition - vWorld);
    float c = clamp(V.y, 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
    float dist = length(vWorld.xz - cameraPosition.xz);
    float k = 1.0 / (1.0 + dist * 0.0006);
    vec2 w = vWorld.xz;
    float n1 = sin(w.x * 0.031 + 2.0 * sin(w.y * 0.07 + uTime * 0.35) + uTime * 0.27);
    float n2 = sin(w.y * 0.19 + w.x * 0.013 - uTime * 0.42);
    vec2 off = vec2(0.0035 * n1 + 0.0015 * n2, 0.0) * k;
    vec3 r = vec3(0.0);
    float tw = 0.0;
    for (int i = 0; i < 9; i++) {
      float s = (float(i) - 4.0) / 4.0;
      float wgt = exp(-2.2 * s * s);
      r += texture2D(tRefl, uv + off + vec2(0.0, s * 0.045 * k)).rgb * wgt;
      tw += wgt;
    }
    col += (r / tw) * F * uRefl;
  }
  gl_FragColor = vec4(col, 1.0);
}
`,gu=`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,_u=`
uniform sampler2D tSrc;
uniform vec2 uStep;
uniform float uW[5];
uniform float uO[5];
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * uW[0];
  for (int i = 1; i < 5; i++) {
    c += texture2D(tSrc, vUv + uStep * uO[i]).rgb * uW[i];
    c += texture2D(tSrc, vUv - uStep * uO[i]).rgb * uW[i];
  }
  gl_FragColor = vec4(c, 1.0);
}
`,vu=`
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(min(texture2D(tSrc, vUv).rgb, vec3(32.0)), 1.0);
}
`,yu=`
varying vec3 vRoomW;
`,bu=`
vRoomW = (modelMatrix * vec4(transformed, 1.0)).xyz;
`,xu=`
varying vec3 vRoomW;
uniform vec3 uLampPos;
uniform vec4 uLampPool;
uniform vec4 uFront;
uniform vec3 uNight;
float roomFront(float d) {
  float x = clamp((uFront.x - uFront.y - uFront.z * min(d, 9.6)) / uFront.w, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}
`,Su=`
#ifdef USE_MAP
{
  vec3 dl = vRoomW - uLampPos;
  float d2 = max(dot(dl, dl), 1e-6);
  float lv = roomFront(sqrt(d2));
  diffuseColor.rgb *= mix(uNight, vec3(1.0), lv);
  if (uLampPool.r + uLampPool.g + uLampPool.b > 0.0 && lv < 1.0) {
    float r2 = uLampPool.a * uLampPool.a;
    float att = r2 / (r2 + d2);
    float down = smoothstep(-0.35, 0.55, -dl.y * inversesqrt(d2));
    float above = smoothstep(0.725, 0.765, vRoomW.y);
    diffuseColor.rgb += sampledDiffuseColor.rgb * uLampPool.rgb * (att * down * above * (1.0 - lv));
  }
}
#endif
`,Cu=`
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`,wu=`
uniform vec3 uCentre;
uniform vec4 uShape;
uniform vec2 uClip;
varying vec3 vW;
void main() {
  float r = length(vW.xz - uCentre.xz);
  float core = 1.0 - smoothstep(uShape.x - 0.4 * uShape.y, uShape.x + uShape.y, r);
  float halo = 1.0 - smoothstep(uShape.x - 0.02, uShape.z, r);
  float a = max(core, 0.32 * halo * halo) * uShape.w;
  a *= 1.0 - smoothstep(uClip.x - 0.01, uClip.x, vW.z);
  a *= 1.0 - smoothstep(uClip.y - 0.01, uClip.y, vW.x);
  if (a < 0.002) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}
`,Tu=`
attribute float aSeed;
attribute vec3 aPhase;
uniform float uTime;
uniform float uDpr;
uniform float uAmp;
uniform float uRoom;
uniform vec3 uLampPos;
uniform vec4 uLamp;
uniform vec3 uStar;
varying vec3 vCol;
void main() {
  float t = uTime * (0.05 + 0.05 * aSeed);
  vec3 p = position + uAmp * vec3(sin(t + aPhase.x), 0.6 * sin(0.73 * t + aPhase.y), sin(0.87 * t + aPhase.z));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 1e-3);
  vec3 dl = wp.xyz - uLampPos;
  float r2 = uLamp.a * uLamp.a;
  float lit = r2 / (r2 + dot(dl, dl));
  float tw = 0.8 + 0.2 * sin(uTime * (0.5 + aSeed) + 40.0 * aSeed);
  vec3 c = uStar * (0.35 + 0.65 * aSeed * aSeed) * tw + uLamp.rgb * lit * (0.4 + 0.6 * aSeed);
  // nearer motes are brighter; very near ones (out-of-focus blobs on a real lens) fade out
  c *= clamp(0.6 / dist, 0.15, 2.0) * smoothstep(0.08, 0.2, dist) * (1.0 - 0.7 * uRoom);
  vCol = c;
  gl_PointSize = (1.1 + 1.2 * aSeed) * uDpr;
}
`,Eu=`
varying vec3 vCol;
void main() {
  vec2 q = gl_PointCoord - vec2(0.5);
  float a = 1.0 - smoothstep(0.18, 0.5, length(q));
  gl_FragColor = vec4(vCol, a);
}
`;Object.freeze({BG_VERT:uu,BG_FRAG:du,FLOOR_VERT:fu,FLOOR_FRAG:pu,SEA_VERT:mu,SEA_FRAG:hu,QUAD_VERT:gu,BLUR_FRAG:_u,COPY_FRAG:vu,POOL_VERT_PARS:yu,POOL_VERT:bu,POOL_FRAG_PARS:xu,POOL_FRAG:Su,CONTACT_VERT:Cu,CONTACT_FRAG:wu,DUST_VERT:Tu,DUST_FRAG:Eu});var Du=[-1.2537,1.3608,-6.3542],Ou=Object.freeze({front:-5.98,right:-1.05}),ku=new Set([...Ol,`Sea`]);function Au(e){let t=new D(e);return t.setMeshoptDecoder(M),t}function ju(e,{onProgress:t,bytes:n=0,manager:r}={}){return Au(r).loadAsync(e,e=>{if(!t||!e)return;let r=e.lengthComputable&&e.total>0?e.total:n;r>0&&t(Math.min(1,e.loaded/r))})}function Mu(e,t){let n=e;for(;n.parent&&n.parent!==t;)n=n.parent;return n}function Nu(e,n,r){let i=new t({name:e,map:n,side:2});return i.onBeforeCompile=e=>{e.uniforms.uLampPos=r.uLampPos,e.uniforms.uLampPool=r.uLampPool,e.uniforms.uFront=r.uFront,e.uniforms.uNight=r.uNight,e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>\n${yu}`).replace(`#include <project_vertex>`,`#include <project_vertex>\n${bu}`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\n${xu}`).replace(`#include <map_fragment>`,`#include <map_fragment>\n${Su}`)},i.customProgramCacheKey=()=>`room-bake-front-2`,i}function Pu({centre:e,radius:t,look:n,deskY:c=.7712}){let l=t+n.contact[2],u=new r(2*l,2*l);u.rotateX(-Math.PI/2);let d={uCentre:{value:new a(e[0],c,e[2])},uShape:{value:new o(t,n.contact[1],l,0)},uClip:{value:new i(Ou.front,Ou.right)}},p=new s({name:`Instrument_Contact`,vertexShader:Cu,fragmentShader:wu,uniforms:d,transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-1,polygonOffsetUnits:-2}),m=new f(u,p);return m.name=`room:contact-shadow`,m.position.set(e[0],c,e[2]),m.renderOrder=1,m.layers.set(Tl.ROOM),m.matrixAutoUpdate=!1,m.updateMatrix(),m.updateMatrixWorld(!0),m.visible=!1,{mesh:m,set(e){let t=Math.min(1,Math.max(0,Number(e)||0))*n.contact[0];d.uShape.value.w=t,m.visible=t>.002},dispose(){u.dispose(),p.dispose(),m.removeFromParent()}}}function Fu(e){let t=new j;t.setAttribute(`position`,new x([-1,-1,0,3,-1,0,-1,3,0],3));let n=new s({name:`Backdrop`,vertexShader:uu,fragmentShader:du,uniforms:{tBg:{value:null},uInvRes:{value:new i(1,1)}},depthTest:!1,depthWrite:!1,side:2}),r=new f(t,n);return r.name=`backdrop:${e}`,r.frustumCulled=!1,r.renderOrder=-1e6,r.layers.set(e),r.matrixAutoUpdate=!1,r}function Iu(e,{look:n=cu(),anisotropy:r=1,warn:c=e=>console.warn(e)}={}){let l=e.scene;l.name=`room`,l.updateMatrixWorld(!0);let u={uLampPos:{value:new a().fromArray(Du)},uLampPool:{value:new o(0,0,0,n.poolReach)},uFront:{value:new o(1,$l.start,$l.perMetre,$l.width)},uNight:{value:new a().fromArray(n.night)}},d=[],f=[],p=[],m=[],g=[],_=new Map,v=new Set,y=new Set,b=new Map,x={},S={},C=[],w={meshes:0,primitives:0,triangles:0},E=new h,D=new h,O=new h,k=null,A=null,j=null,M=null,N=null;for(let e of l.children)b.set(e.name,e),e.name.startsWith(`Anchor_`)&&(x[e.name]={...e.userData||{},position:e.getWorldPosition(new a).toArray()});let P=(e,t)=>{if(!_.has(e)){let n=t();_.set(e,n),y.add(n)}return _.get(e)},F=[];l.traverse(e=>{e.isMesh&&F.push(e)});for(let e of F){let o=Mu(e,l).name,_=e.material,b=_.name||``,x=Ll({node:o,name:b,emit:_.userData&&_.userData.emit,transparent:!!_.transparent});S[x.kind]=(S[x.kind]||0)+1,w.primitives++;let F=e.geometry;w.triangles+=F.index?F.index.count/3:F.attributes.position.count/3,e.matrixAutoUpdate=!1,_.map&&(_.map.anisotropy=r,v.add(_.map)),F.boundingBox||F.computeBoundingBox();let I;switch(x.kind){case`sea`:I=M=new s({name:`Sea`,vertexShader:mu,fragmentShader:hu,uniforms:{tRefl:{value:null},uInvRes:{value:new i(1,1)},uBase:{value:new a(.006,.014,.02)},uTime:{value:0},uRefl:{value:0}},side:2}),y.add(I);break;case`floor`:I=A=new s({name:`Floor`,vertexShader:fu,fragmentShader:pu,uniforms:{map:{value:_.map},tRefl:{value:null},tReflBlur:{value:null},uLampPos:u.uLampPos,uFront:u.uFront,uNight:u.uNight,uInvRes:{value:new i(1,1)},uRefl:{value:0}},side:2}),j=Nu(`Floor_Baked`,_.map,u),y.add(A),y.add(j),k=e;break;case`shadow`:I=N=P(`shadow`,()=>new t({name:`Contact_Shadow`,color:0,map:_.map,transparent:!0,opacity:0,depthWrite:!1,side:2,polygonOffset:!0,polygonOffsetFactor:-1,polygonOffsetUnits:-2}));break;case`bake`:case`image`:I=P(b,()=>{if(x.lit)return Nu(b,_.map,u);let e=new t({name:b,map:_.map,side:2});return f.push(e),e});break;case`screen`:I=P(b,()=>{let e=new t({name:b,map:_.map,side:2});return m.push({material:e,mat:o===`Desk_Mat`}),e});break;case`emit`:{I=P(x.group===`room`?`${b}|room|${o}`:`${b}|${x.group}`,()=>{let e=_.color.clone(),n=new t({name:b,color:e.clone(),side:2});return p.push({material:n,base:e,strength:x.strength,group:x.group,node:o,box:new h,t0:0}),n});let n=p.find(e=>e.material===I);n&&n.box.union(O.copy(F.boundingBox).applyMatrix4(e.matrixWorld)),o===`Desk_Lamp`&&E.union(O.copy(F.boundingBox).applyMatrix4(e.matrixWorld));break}case`glass`:I=P(`glass|${x.window}`,()=>{let e=new t({name:x.window?`Window_Glass`:`Glass`,color:x.window?new T(.0016,.002,.004):new T(.006,.007,.01),transparent:!0,opacity:x.window?n.glassTransmit:.82,depthWrite:!1,side:2,blending:5,blendEquation:100,blendSrc:201,blendDst:204,blendSrcAlpha:200,blendDstAlpha:201});return g.push({material:e,window:!!x.window}),e}),o===`Window_Glass`&&D.union(O.copy(F.boundingBox).applyMatrix4(e.matrixWorld));break;default:I=new t({name:`fallback_${b}`,map:_.map||null,color:_.color?_.color.clone():new T(1,1,1),side:2}),y.add(I),x.lit&&d.push(I),C.push(`${b} on ${o}`),c(`[room] unclassified material ${b} on ${o}`)}_!==I&&_.dispose(),e.material=I,e.layers.set(x.layer)}w.meshes=new Set(F.map(e=>Mu(e,l))).size;let I=E.isEmpty()?new a().fromArray(Du):E.getCenter(new a);u.uLampPos.value.copy(I);let ee=new a;for(let e of p)e.t0=e.group===`room`?iu(e.node,e.box.isEmpty()?3:e.box.getCenter(ee).distanceTo(I)):0;let L=[...b.entries()].filter(([e])=>ku.has(e)).map(([,e])=>e);D.isEmpty()&&D.set(new a(-5.02,0,-7.02),new a(-1,5,0));let te=Fu(Tl.BG_MAIN),ne=Fu(Tl.BG_REFL);l.add(te,ne);for(let e of[te,ne])y.add(e.material),e.updateMatrixWorld(!0);let R=Ml.filter(e=>!b.has(e));R.length&&c(`[room] the GLB lacks ${R.join(`, `)}`);let z={lamp:1,room:1,screens:1,glass:1,shadow:0,outside:1},re=new T,B=[0,0,0],ie=su(1),ae=M?M.uniforms.uBase.value.clone():null;function V(){let{lamp:e,room:t}=z;u.uFront.value.x=t,u.uNight.value.fromArray(n.night);let r=eu(t,3),i=n.night;re.setRGB(i[0]+(1-i[0])*r,i[1]+(1-i[1])*r,i[2]+(1-i[2])*r);for(let e of d)e.color.copy(re);su(e,B);let a=n.pool*e;u.uLampPool.value.set(B[0]*a,B[1]*a,B[2]*a,n.poolReach);let o=e**1.6;for(let e of p){let r=e.group===`always`?1:e.group===`outside`?z.outside:e.group===`lamp`?o:au(t,e.t0),i=ou(e.strength,n)*r;e.group===`lamp`?e.material.color.setRGB(e.base.r*i*(B[0]/ie[0]),e.base.g*i*(B[1]/ie[1]),e.base.b*i*(B[2]/ie[2])):e.material.color.copy(e.base).multiplyScalar(i)}}function H(){let e=z.outside;for(let t of f)t.color.setScalar(e);M&&ae&&M.uniforms.uBase.value.copy(ae).multiplyScalar(e);for(let t of L)t.visible=e>.002}function oe(){let e=z.screens,t=e<=0?.004:.004+(n.screenK-.004)*e**1.4,r=.35*Math.max(0,Math.sin(Math.PI*Math.min(1,e*1.25)))*(1-e),i=.35+.65*z.room;for(let e of m){let n=e.mat?t*.62*i:t;e.material.color.setRGB(n+r*.6,n+r*.75,n+r)}}function se(){for(let e of g)e.window&&(e.material.opacity=n.glassTransmit*z.glass)}let ce=e=>Math.min(1,Math.max(0,Number(e)||0));return V(),oe(),{root:l,nodes:b,anchors:Bl(x),lampPos:I,windowBox:D,floorMesh:k,floor:A,floorBaked:j,sea:M,shadow:N,bgMain:te,bgRefl:ne,textures:v,materials:y,counts:w,kinds:S,missing:R,unclassified:C,emitters:p,screens:m,glass:g,baked:d,pool:u,setLights({lamp:e,room:t}){let n=ce(e),r=ce(t);(n!==z.lamp||r!==z.room)&&(z.lamp=n,z.room=r,V(),oe())},setScreens(e){let t=ce(e);t!==z.screens&&(z.screens=t,oe())},setOutside(e){let t=ce(e);t!==z.outside&&(z.outside=t,H(),V())},get outside(){return z.outside},setGlass(e){let t=Math.max(0,Number.isFinite(e)?e:1);t!==z.glass&&(z.glass=t,se())},setShadow(e){z.shadow=ce(e),N&&(N.opacity=z.shadow*n.shadow,N.visible=N.opacity>.002)},useReflection(e){k&&A&&j&&(k.material=e?A:j,A.uniforms.uRefl.value=e?n.reflection:0)},refresh(){V(),oe(),se(),H(),N&&(N.opacity=z.shadow*n.shadow),A&&k&&k.material===A&&(A.uniforms.uRefl.value=n.reflection)},textureBytes(){let e=0;for(let t of v){let n=t.image;n&&(e+=(n.width||0)*(n.height||0)*4*(t.generateMipmaps===!1?1:4/3))}return Math.round(e)},geometryBytes(){let e=0,t=new Set;return l.traverse(n=>{let r=n.geometry;if(r&&!t.has(r)){t.add(r);for(let t of Object.values(r.attributes))e+=t.array.byteLength;r.index&&(e+=r.index.array.byteLength)}}),e},dispose(){let e=new Set;l.traverse(t=>{let n=t.geometry;n&&e.add(n)});for(let t of e)t.dispose();for(let e of y)e.dispose();for(let e of v)e.dispose();l.removeFromParent()}}}var Lu=-36,Ru=(e,t)=>{let n=new d(1,1,{type:m,format:w,minFilter:P,magFilter:P,generateMipmaps:!1,depthBuffer:e,stencilBuffer:!1});return n.texture.name=t,n};function zu(e,t=new I){return t.set(1,0,0,0,0,-1,0,2*e,0,0,1,0,0,0,0,1)}var Bu=new I;function Vu(e,t,n){return zu(n,Bu),e.matrixAutoUpdate=!1,e.matrixWorldAutoUpdate=!1,e.matrixWorld.multiplyMatrices(Bu,t.matrixWorld),e.matrixWorldInverse.multiplyMatrices(t.matrixWorldInverse,Bu),e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse),e.near=t.near,e.far=t.far,e.fov=t.fov,e.aspect=t.aspect,e}function Hu(e){let t=new j;t.setAttribute(`position`,new x([-1,-1,0,3,-1,0,-1,3,0],3));let n=new _,r=new f(t);r.frustumCulled=!1;let o=new C;o.add(r);let c=(e,t)=>new s({vertexShader:gu,fragmentShader:e,uniforms:t,depthTest:!1,depthWrite:!1,blending:0}),l=c(_u,{tSrc:{value:null},uStep:{value:new i},uW:{value:[1,0,0,0,0]},uO:{value:[0,1,2,3,4]}}),u=c(vu,{tSrc:{value:null}}),d=ue(1.6),m=ue(3.2),h=(t,i)=>{r.material=t,e.setRenderTarget(i),e.render(o,n)},g=(e,t,n,r,i)=>{l.uniforms.uW.value=n.W,l.uniforms.uO.value=n.O,l.uniforms.tSrc.value=e.texture,l.uniforms.uStep.value.set(r/e.width,i/e.height),h(l,t)},v=Ru(!0,`room:floor-outside`),y=Ru(!0,`room:floor`),b=Ru(!1,`room:floor-blur`),S=Ru(!1,`room:floor-tmp`),w=Ru(!0,`room:sea`),T=[v,y,b,S],E=new F,D=new F,O=new F,k=[new p(new a(0,1,0),0)],A=[new p(new a(0,1,0),36)],M={floor:!1,sea:!1},N=(e,t,n)=>{let r=Math.max(1,Math.round(t)),i=Math.max(1,Math.round(n));(e.width!==r||e.height!==i)&&e.setSize(r,i)};return{floorOut:v,floorRT:y,floorBlur:b,seaRT:w,virtRoom:E,virtOut:D,virtSea:O,floorClip:k,seaClip:A,get floorOn(){return M.floor},get seaOn(){return M.sea},setSize(e,t,n,r){if(M.floor=n>0,M.sea=r>0,M.floor){let r=e*n,i=t*n;N(y,r,i),N(v,r/2,i/2),N(b,r/2,i/2),N(S,r/2,i/2)}else for(let e of T)e.dispose();M.sea?N(w,e*r,t*r):w.dispose()},renderFloor(t,n,r,i,a){let o=e.clippingPlanes;e.clippingPlanes=k,a&&(Vu(D,n,0).layers.mask=i.out,e.setRenderTarget(v),e.render(t,D)),Vu(E,r,0).layers.mask=i.room,e.setRenderTarget(y),e.render(t,E),e.clippingPlanes=o,u.uniforms.tSrc.value=y.texture,h(u,b),g(b,S,d,1,0),g(S,b,m,0,1)},renderSea(t,n,r){let i=e.clippingPlanes;e.clippingPlanes=A,Vu(O,n,Lu).layers.mask=r,e.setRenderTarget(w),e.render(t,O),e.clippingPlanes=i},bytes(){let e=0;return M.floor&&(e+=y.width*y.height*12+v.width*v.height*12,e+=b.width*b.height*8+S.width*S.height*8),M.sea&&(e+=w.width*w.height*12),e},materials:[l,u],dispose(){for(let e of[...T,w])e.dispose();l.dispose(),u.dispose(),t.dispose()}}}var Uu=Object.freeze({min:Object.freeze([-2.4,.8,-6.95]),max:Object.freeze([-.3,2.1,-5.3])});function Wu({rng:e,count:t=220}){let r=new Float32Array(660),i=new Float32Array(220),c=new Float32Array(660),{min:l,max:u}=Uu;for(let t=0;t<220;t++){for(let n=0;n<3;n++)r[3*t+n]=l[n]+(u[n]-l[n])*e();i[t]=e();for(let n=0;n<3;n++)c[3*t+n]=e()*Math.PI*2}let d=new j;d.setAttribute(`position`,new O(r,3)),d.setAttribute(`aSeed`,new O(i,1)),d.setAttribute(`aPhase`,new O(c,3)),d.setDrawRange(0,Math.min(220,t));let f={uTime:{value:0},uDpr:{value:1},uAmp:{value:.045},uRoom:{value:0},uLampPos:{value:new a},uLamp:{value:new o(0,0,0,.5)},uStar:{value:new a(.2,.22,.3)}},p=new s({name:`room-dust`,vertexShader:Tu,fragmentShader:Eu,uniforms:f,transparent:!0,depthWrite:!1,blending:2}),m=new n(d,p);return m.name=`room:dust`,m.frustumCulled=!1,m.matrixAutoUpdate=!1,m.renderOrder=3,m.layers.set(Tl.DUST),m.updateMatrixWorld(!0),{object3D:m,uniforms:f,setCount(e){d.setDrawRange(0,Math.max(0,Math.min(220,Math.round(e))))},update({time:e,dpr:t,amp:n,room:r,lampPos:i,lamp:a,lampGain:o,reach:s,star:c}){f.uTime.value=e,f.uDpr.value=t,f.uAmp.value=n,f.uRoom.value=r,f.uLampPos.value.copy(i),f.uLamp.value.set(a[0]*o,a[1]*o,a[2]*o,s),f.uStar.value.set(c[0],c[1],c[2])},dispose(){d.dispose(),p.dispose(),m.removeFromParent()}}}var Gu=Object.freeze({fog:null,macro:null,ink:1,dark:.7,outline:1,widthK:1,spacing:3.6,brush:1}),Ku=Object.freeze([.44,.5]),qu=(e,t)=>typeof e==`number`&&Number.isFinite(e)?e:t,Ju=e=>e<=0?0:e>=1?1:e;function Yu(e){return Zs(Ju(qu(e.build,1)))}function Xu(e){let t=Ju(qu(e.build,1)),[n,r]=Ku;return Ju((t-n)/(r-n))}function Zu(e,t){let n=t&&t.object3D?Bi(t):null,r=[0,1,0],i=[1,1,1],a=[0,0,0],o=[0,0,0],s=[0,0,0],c=[0,0,0],l={dir:r,color:i,intensity:0,ambient:.02,position:a,range:1,cone:[78,38]},u={sky:o,ground:s,rim:c,rimDir:[0,0,-1]},d=null;function f(e,r){let i=t.state(),a=Yu(e),o=qu(e.crank,0),s=Ju(qu(e.arms,0)),c=Ju(qu(e.brass,1)),l=Ju(qu(e.contact,0));i.viewport!==r&&t.setViewport(r),i.build!==a&&t.setBuild(a),i.crank!==o&&t.setCrank(o),i.arms!==s&&t.setArms(s),i.brass!==c&&t.setBrass(c),i.contact!==l&&t.setContact(l),p()!==0&&t.setCrankAccent(0),t.setLook(Gu);let u=Xu(e);if(u>0&&(sn(a).globe??0)<u&&(d&&d.parent===t.object3D||(d=t.object3D.getObjectByName(`instrument:globe`)||null),d)){let e=J.c,t=Math.max(Dt(u),.001);d.matrix.fromArray(et(st(e,tn(),fn(o)),ot(e,t))),d.matrixWorldNeedsUpdate=!0,d.visible=!0,n.markPose()}}function p(){let e=t.object3D.getObjectByName(`instrument:pinion`),n=e&&e.children.find(e=>e.material&&e.material.uniforms&&e.material.uniforms.uAccentOn);return n?n.material.uniforms.uAccentOn.value:0}function m(d,f,p,m){let{lamp:h,room:g}=f,_=Ju(qu(m.screens,1)),v=Ju(qu(m.aurora,.8)),y=d.centre,b=p.x-y[0],x=p.y-y[1],S=p.z-y[2],C=Math.hypot(b,x,S)||1;r[0]=b/C,r[1]=x/C,r[2]=S/C,su(h,i),a[0]=p.x,a[1]=p.y,a[2]=p.z;let w=Math.max(.55*h,eu(g,.35));l.intensity=e.keyIntensity*h**1.5,l.ambient=e.ambient[0]+(e.ambient[1]-e.ambient[0])*w,l.range=e.keyRange,l.cone=e.keyCone,t.setLight(l);for(let t=0;t<3;t++)o[t]=e.envNight[t]+(e.envRoom[t]-e.envNight[t])*w+e.envScreens[t]*_,s[t]=e.groundNight[t]+(e.groundRoom[t]-e.groundNight[t])*w,c[t]=e.rimStar[t]+e.rimAurora[t]*v;u.rimDir=e.rimDir,t.setEnvColors(u);let T=n?n.bag:null;if(T){let t=e.fillDir,n=Math.hypot(t[0],t[1],t[2])||1;T.uFillDir&&T.uFillDir.value.set(t[0]/n,t[1]/n,t[2]/n),T.uFillCol&&T.uFillCol.value.set(e.fillRoom[0]*w+e.fillScreens[0]*_,e.fillRoom[1]*w+e.fillScreens[1]*_,e.fillRoom[2]*w+e.fillScreens[2]*_),T.uFarMetal&&(T.uFarMetal.value=1)}}return{get held(){return!!(n&&n.held)},begin(e,r,i,a,o,s){return!n||!t.ready?null:(n.acquire(e,{position:r.position,scale:r.scale,yaw:r.yawRad}),f(i,a),m(r,o,s,i),t.object3D.updateMatrixWorld(!0),t.object3D)},end(){n&&n.held&&(t.setEnvColors({rimDir:null}),n.release())}}}var Qu=.05,$u=150,ed=1,td=4e5,nd=2e6,rd=Math.PI/180,id=Object.freeze({}),ad=new T(723476),od=12,sd=je.window.amounts.horizon,cd=(e,t)=>typeof e==`number`&&Number.isFinite(e)?e:t,ld=e=>e<=0?0:e>=1?1:e*e*(3-2*e),ud=()=>new Promise(e=>setTimeout(e,0));function dd(e){let{renderer:t,assetsBase:n=`/home-assets/`,rngFor:r=ee,instrument:o=null,sky:s=null,reducedMotion:c=!1,seed:l=7}=e||{};if(!t||typeof t.render!=`function`)throw TypeError(`createRoomAct: ctx.renderer is required`);if(typeof n!=`string`||!n.endsWith(`/`))throw TypeError(`createRoomAct: assetsBase must end with "/"`);let u=he(e.tier??2),f=Kl(u),p=cu(),g=Zu(p,o),_=new C;_.name=`room`,_.matrixWorldAutoUpdate=!1;let v=new F(50,1,Qu,$u);v.layers.mask=Dl.room;let y=new F(50,1,ed,td);y.layers.mask=Dl.out;let x=new C,S=s&&typeof s.clone==`function`?s.clone():Je({seed:l,tier:f.sky}),E=S.applyPreset(`window`);S.setTier(f.sky),S.object3D.layers.set(Tl.OUT),_.add(S.object3D);let D=Wu({rng:r(l,`room:dust`),count:f.dust});_.add(D.object3D);let O=new d(1,1,{type:m,format:w,minFilter:P,magFilter:P,generateMipmaps:!1,depthBuffer:!0,stencilBuffer:!1,samples:f.outSamples});O.texture.name=`room:outside`;let k=Hu(t),A={w:0,h:0,dpr:1},j=null,M=!1,N=!1,L=null,te=null,ne=Hl,R=Wl(ne.instrument),z=null,re=null,B=1,ie=new h(new a(-5.27,-.25,-7.27),new a(-.75,5.25,.25)),ae=new h,V=new h(new a(-5.2,-.01,-7.2),new a(5.2,.01,.2)),H=new b,oe=new I,se=new a,ce=[0,0,0],le={outside:!1,floorOutside:!1,floor:!1,sea:!1,instrument:!1,outsideK:1,frames:0};function ue(){ae.min.set(ie.min.x,-ie.max.y,ie.min.z),ae.max.set(ie.max.x,-ie.min.y,ie.max.z)}ue();function de(e,t,n){A.w=Math.max(1,e),A.h=Math.max(1,t),A.dpr=n>0?n:1;let r=Math.min(f.outScale,Math.sqrt(nd/(A.w*A.h))),i=Math.max(1,Math.round(A.w*r)),a=Math.max(1,Math.round(A.h*r));(O.width!==i||O.height!==a)&&O.setSize(i,a),k.setSize(A.w,A.h,f.floor,f.sea),j&&j.useReflection(k.floorOn)}function fe(e){if(A.w>0)return;let n=t.getPixelRatio()||1;if(e)de(e.width/n,e.height/n,n);else{let e=t.getSize(new i);de(e.x,e.y,n)}}function pe(e){if(N)return Promise.reject(Error(`room act: disposed`));if(L)return L;let r=t=>{try{e?.(Math.min(1,Math.max(0,t)))}catch{}};return L=(async()=>{r(0);let e=o?Hi(o).catch(e=>console.warn(`[room] the instrument did not build:`,e)):Promise.resolve(),i=`${n}room/`,a=await fetch(`${i}manifest.json`);if(!a.ok)throw Error(`room act: ${i}manifest.json answered ${a.status}`);let s=await a.json(),c=Jl(s);if(c.length)throw Error(`room act: ${c.join(`; `)}`);if(N)return;r(.03),te=ql(s,u);let l=s.sets[te],d=await ju(i+l.file,{bytes:l.bytes,onProgress:e=>r(.03+.85*e)});if(N){ge(d);return}let m=t.capabilities&&typeof t.capabilities.getMaxAnisotropy==`function`?t.capabilities.getMaxAnisotropy():1;j=Iu(d,{look:p,anisotropy:Math.max(1,Math.min(f.anisotropy,m))}),ne=j.anchors,R=Wl(ne.instrument),ie.copy(j.windowBox).expandByScalar(.25),ue(),_.add(j.root),z=Pu({centre:R.base,radius:Pt.radius*R.scale,look:p}),_.add(z.mesh),j.setShadow(0),A.w>0&&de(A.w,A.h,A.dpr),j.useReflection(k.floorOn),r(.9),await me(),await e,N||(M=!0,r(1))})().catch(e=>{throw L=null,e}),L}async function me(){if(!j)return;let e=[...j.textures];for(let n=0;n<e.length;n++){if(N)return;try{t.initTexture(e[n])}catch{}n%3==2&&await ud()}if(N||typeof t.compileAsync!=`function`)return;let n=[];for(let e of[[],k.floorClip]){let r=t.getRenderTarget(),i=t.clippingPlanes;try{t.clippingPlanes=e,t.setRenderTarget(O),n.push(t.compileAsync(_,v))}catch{}finally{t.clippingPlanes=i,t.setRenderTarget(r)}}await Promise.all(n)}function ge(e){e.scene.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose();for(let e of Array.isArray(t.material)?t.material:t.material?[t.material]:[]){for(let t of Object.values(e))t&&t.isTexture&&t.dispose();e.dispose()}})}function _e(e,t){if(t&&(t.isCamera||Array.isArray(t.position)&&Array.isArray(t.target)))return t;if(e){let t=e.acts||[];if(t[1]&&t[1].id===`room`&&e.cameraB)return e.cameraB;if(e.camera)return e.camera}return null}function ve(e,t){if(e&&e.isCamera)e.updateMatrixWorld(),e.matrixWorld.decompose(v.position,v.quaternion,se),e.isPerspectiveCamera&&e.fov>0&&(v.fov=e.fov);else{let t=e?e.position:[R.centre[0]+.42,R.centre[1]+.12,R.centre[2]+.62],n=e?e.target:R.centre;v.position.set(t[0],t[1],t[2]),v.up.set(0,1,0),Math.hypot(n[0]-t[0],n[1]-t[1],n[2]-t[2])>1e-6&&v.lookAt(n[0],n[1],n[2]);let r=e?cd(e.roll,0):0;r&&v.rotateZ(r*rd),v.fov=e&&cd(e.fov,0)>0?e.fov:40}v.aspect=t,v.near=Qu,v.far=$u,v.updateProjectionMatrix(),v.updateMatrixWorld(!0),y.position.copy(v.position),y.quaternion.copy(v.quaternion),y.fov=v.fov,y.aspect=t,y.updateProjectionMatrix(),y.updateMatrixWorld(!0)}function ye(e){return oe.multiplyMatrices(v.projectionMatrix,v.matrixWorldInverse),H.setFromProjectionMatrix(oe),H.intersectsBox(e)}function be(e){let n=t.getClearColor(new T),r=t.getClearAlpha();t.setClearColor(ad,1),t.setRenderTarget(e),t.render(x,v),t.setClearColor(n,r)}function xe(e,n,r,i){if(N)return;let a=t.getRenderTarget(),o=t.clippingPlanes,s=t.autoClear;t.autoClear=!0;try{!M||!j?be(r??null):Se(e,n,r??null,i)}finally{g.end(),t.clippingPlanes=o,t.autoClear=s,t.setRenderTarget(a)}}function Se(e,n,r,i){let a=j;fe(r);let o=e&&e.params||id,s=e&&e.viewport===`port`?`port`:`land`,l=r?r.width:Math.round(A.w*A.dpr),u=r?r.height:Math.round(A.h*A.dpr);ve(_e(e,n),l/Math.max(1,u));let d=c?0:cd(i,0),f=E.stillTime+d,m=Ql(cd(o.lights,1));a.setLights(m),a.setScreens(cd(o.screens,1));let h=cd(e&&e.u,od)<od?ld(m.room/.25):1;a.setOutside(h),S.setHorizon(sd*h),S.setAurora(cd(o.aurora,.8)),S.setGalaxy(cd(o.galaxy,.75)),S.setTime(f);let b=g.begin(_,R,o,s,m,a.lampPos);z&&z.set(b?sn(Yu(o)).base:0),su(m.lamp,ce);let x=m.lamp**1.5;ce[0]*=x,ce[1]*=x,ce[2]*=x,D.update({time:d,dpr:l/A.w,amp:c?0:p.dustDrift,room:m.room,lampPos:a.lampPos,lamp:ce,lampGain:p.dustLamp,reach:p.dustReach,star:p.dustStar});let C=ye(ie),w=k.floorOn&&ye(V),T=w&&ye(ae),M=a.sea;if(M&&(M.uniforms.uTime.value=f,C&&k.seaOn&&h>.002?(S.setQuietZone(null),k.renderSea(_,y,Dl.sea),M.uniforms.tRefl.value=k.seaRT.texture,M.uniforms.uRefl.value=h):M.uniforms.uRefl.value=0),C&&(S.setQuietZone(re,B),M&&M.uniforms.uInvRes.value.set(1/O.width,1/O.height),t.setRenderTarget(O),t.render(_,y)),w&&a.floor){S.setQuietZone(null),M&&(M.uniforms.uRefl.value=0),a.bgRefl.material.uniforms.tBg.value=k.floorOut.texture,a.bgRefl.material.uniforms.uInvRes.value.set(1/k.floorRT.width,1/k.floorRT.height),b&&(b.visible=!1),k.renderFloor(_,y,v,{out:Dl.mirrorOut,room:Dl.mirrorRoom},T),b&&(b.visible=!0);let e=a.floor.uniforms;e.tRefl.value=k.floorRT.texture,e.tReflBlur.value=k.floorBlur.texture,e.uRefl.value=p.reflection}else a.floor&&(a.floor.uniforms.uRefl.value=0);a.bgMain.material.uniforms.tBg.value=O.texture,a.bgMain.material.uniforms.uInvRes.value.set(1/l,1/u),a.floor&&a.floor.uniforms.uInvRes.value.set(1/l,1/u),t.setRenderTarget(r),t.render(_,v),le.outside=C,le.floor=w,le.floorOutside=T,le.sea=!!(M&&C&&k.seaOn&&h>.002),le.outsideK=h,le.instrument=!!b,le.frames++}return{id:`room`,load:pe,get ready(){return M},setTier(e){N||(u=he(e),f=Kl(u),S.setTier(f.sky),O.samples!==f.outSamples&&(O.samples=f.outSamples,O.dispose()),A.w>0&&de(A.w,A.h,A.dpr),D.setCount(f.dust))},resize(e,n,r){N||de(cd(e,1),cd(n,1),cd(r,t.getPixelRatio()||1))},render:xe,pick(){return null},stonesScreen(){return[]},get anchors(){let{instrument:e,...t}=ne;return{...t,instrument:{...e,position:R.position.slice(),base:R.base.slice(),centre:R.centre.slice(),yaw:R.yaw,yawRad:R.yawRad,scale:R.scale,height:R.height}}},finish:lu,setQuietZone(e,t=1){re=Array.isArray(e)&&e.length===4&&e.every(Number.isFinite)?e.slice():null,B=Math.min(1,Math.max(0,cd(t,1)))},tune(e={}){for(let[t,n]of Object.entries(e||{})){let e=p[t];e!==void 0&&(Array.isArray(e)&&Array.isArray(n)&&n.length===e.length&&n.every(Number.isFinite)?p[t]=n.slice():typeof e==`number`&&Number.isFinite(n)&&(p[t]=n))}return j&&(j.pool.uLampPool.value.w=p.poolReach,j.refresh()),JSON.parse(JSON.stringify(p))},stats(){let e=O.width*O.height,t=O.samples,n=t>0?e*12*t+e*8:e*12;return{ready:M,set:te,tier:u,css:[A.w,A.h],dpr:A.dpr,textureBytes:j?j.textureBytes():0,geometryBytes:j?j.geometryBytes():0,targetBytes:n+k.bytes(),targets:{outside:[O.width,O.height,t],floor:k.floorOn?[k.floorRT.width,k.floorRT.height]:null,sea:k.seaOn?[k.seaRT.width,k.seaRT.height]:null},triangles:j?j.counts.triangles:0,primitives:j?j.counts.primitives:0,meshes:j?j.counts.meshes:0,missing:j?j.missing.slice():[],unclassified:j?j.unclassified.slice():[],last:{...le}}},dispose(){N||(N=!0,M=!1,g.end(),o&&o.object3D&&o.object3D.parent===_&&_.remove(o.object3D),z&&z.dispose(),z=null,j&&j.dispose(),j=null,O.dispose(),k.dispose(),D.dispose(),S.dispose())}}}var fd={night:`#0b0a14`,stage:`#09080f`,shade:`#9ea0ae`},pd=is(fd.night),md={final:[225,40,1],contact:[205,34,.95]},hd={land:{final:[14.5/16.3,29.5/16.3],contact:[10.5/10.9,16.5/10.9]},port:{final:[15/17,30/17],contact:[14/14.9,21/14.9]}},gd=Object.freeze({land:Object.freeze([-.92,-.5,-.12,.5]),port:Object.freeze([-.9,.3,.9,.94])}),_d=Object.freeze({amp:.012,period:140}),vd=(()=>{let e=[.22,1,.12],t=Math.hypot(e[0],e[1],e[2]);return[e[0]/t,e[1]/t,e[2]/t]})(),yd=.006,bd=Object.freeze([17.84,18.28]),xd=Object.freeze({land:Object.freeze({yaw:13,slide:Object.freeze([45,25]),shape:Object.freeze({width:.08,coreLength:.6,dust:1}),nebula:Object.freeze({at:Object.freeze([.78,.84]),radius:.06,roll:.6}),heroes:Object.freeze([Object.freeze({at:Object.freeze([.84,-.72]),flux:.8,color:`#9fc0ff`}),Object.freeze({at:Object.freeze([-.62,-.74]),flux:.5,color:`#ffd6a8`}),Object.freeze({at:Object.freeze([-.92,.62]),flux:.45,color:`#eef0ff`})])}),port:Object.freeze({yaw:13,slide:Object.freeze([45,25]),shape:Object.freeze({width:.08,coreLength:.6,dust:1}),nebula:Object.freeze({at:Object.freeze([.55,.86]),radius:.06,roll:.6}),heroes:Object.freeze([Object.freeze({at:Object.freeze([-.62,.72]),flux:.8,color:`#9fc0ff`}),Object.freeze({at:Object.freeze([.84,.6]),flux:.5,color:`#ffd6a8`}),Object.freeze({at:Object.freeze([-.8,.32]),flux:.4,color:`#eef0ff`})])})}),Sd=Object.freeze([18.88,19.2]),Cd=Object.freeze({centre:Object.freeze([0,2.75,0]),radius:3.1});function wd(e){if(!e||typeof e.applyPreset!=`function`||!e.uniforms)return null;let t=e.applyPreset(`window`),n=e.uniforms;if(!n.uGalPole||!n.uGalCore||!n.uGalShape||!n.uAurFrame||!n.uAurShape)return null;let r=e=>[e.x,e.y,e.z],i=n.uGalShape.value,a=n.uAurFrame.value,o=n.uAurShape.value;return{pole:r(n.uGalPole.value),core:r(n.uGalCore.value),shape:{width:i.x,coreLength:i.y,dust:i.w},aurora:{azimuth:a.x,distance:a.y,spacing:a.z,span:a.w,base:o.x,decay:o.y,folds:o.z,phase:o.w},stillTime:Number.isFinite(t&&t.stillTime)?t.stillTime:0}}function Td(e){return ns(bd[0],bd[1],Number.isFinite(e)?e:18)}function Ed(e,t,n){let r=Number.isFinite(t)?t:0,i=Td(e);return{k:i,sway:n?0:i*_d.amp*Math.sin(2*Math.PI*r/_d.period)}}function Dd(e,t,n,r){let i=e.projectionMatrix.elements;return r.set((t+i[8])/i[0],(n+i[9])/i[5],-1).transformDirection(e.matrixWorld)}function Od(e,t,n,r){let i=xd[n],a=-co.yaw*es,o=a+i.yaw*es,s=new e.Vector3(0,1,0),c=new e.Quaternion().setFromAxisAngle(s,-o),l=new e.Vector3(t.pole[0],t.pole[1],t.pole[2]).normalize(),u=new e.Vector3(t.core[0],t.core[1],t.core[2]).addScaledVector(l,-t.core[0]*l.x-t.core[1]*l.y-t.core[2]*l.z).normalize(),d=new e.Vector3().crossVectors(l,u),f=t=>Dd(r,t[0],t[1],new e.Vector3).applyQuaternion(c);return{yaw:[a,o],pole:l,coreAt(e,t){let n=$(i.slide[0],i.slide[1],e)*es;return t.copy(u).multiplyScalar(Math.cos(n)).addScaledVector(d,Math.sin(n))},shape:[t.shape,i.shape],nebula:{dir:f(i.nebula.at),radius:i.nebula.radius,roll:i.nebula.roll},heroes:i.heroes.map(e=>({dir:f(e.at),flux:e.flux,color:e.color})),aurora:{...t.aurora,azimuth:t.aurora.azimuth-a}}}function kd(e){let{THREE:t}=e,n=e.instrument,r=!!e.reducedMotion,i=new t.Scene;i.name=`act:space`;let a=new t.PerspectiveCamera(30,1.6,.5,200),o=new t.PerspectiveCamera(30,1.6,.5,200),s=ms(t),c=n?Bi(n):null,l=Wi(t),u={width:0,height:0,dpr:1},d=Number.isFinite(e.tier)?Math.max(0,Math.min(3,Math.round(e.tier))):2,f=!1,p=!1,m=null,h=null,g=``,_=null,v=null,y=null,b=new t.Quaternion,x=new t.Quaternion,S=new t.Vector3(vd[0],vd[1],vd[2]),C=new t.Vector3(0,1,0),w=new t.Vector3,T={width:0,coreLength:0,dust:0},E=[],D=NaN,O=NaN,k=NaN,A=new t.Vector3,j=[0,0,0],M=[0,0,0],N=[0,0,0],P={key:``,stones:[]};function F(e,n){if(!h)return;let r=e+`:`+n.toFixed(3);if(r===g)return;g=r;let i=Jt[e],a=Za({subject:i.target,az:i.az,el:i.el,dist:i.dist,fov:i.fov,shift:i.shift},n);if(ds(o,a,n,{nearK:.05,farK:2,farAdd:30}),h.applyPreset(`space`,{view:o,layout:e}),y=v?Od(t,v,e,o):null,y){h.setAuroraFrame(y.aurora),E.length=0;for(let e of y.heroes)E.push({dir:e.dir,flux:0,color:e.color})}D=NaN,O=NaN}async function I(t){if(p)throw Error(`space act: disposed`);return m||=(async()=>{t?.(0),e.sky&&(h=e.sky.clone(),h.setTier(ge(d).sky),v=wd(h),g=``,i.add(h.object3D)),t?.(.3),n&&await(e.instrumentReady||Hi(n)),p||(f=!0,t?.(1))})(),m}function ee(e,t,n){let i=us(`space`,e,t);if(i.three)return{use:i.three,dist:i.dist};if(!i.frame)return{use:a,dist:16};let o=ds(a,i.frame,ps(n,u),{nearK:.05,minNear:.05,farK:1.6,farAdd:30}),s=e&&e.pointer;if(!r&&s&&s.active!==!1&&Number.isFinite(s.x)&&Number.isFinite(s.y)){fs(a,j,M);let e=yd*o,t=Math.max(-1,Math.min(1,s.x))*e,n=Math.max(-1,Math.min(1,s.y))*e;a.position.x+=j[0]*t+M[0]*n,a.position.y+=j[1]*t+M[1]*n,a.position.z+=j[2]*t+M[2]*n,a.updateMatrixWorld(!0)}return{use:a,dist:o}}function L(e){if(e&&Object.prototype.hasOwnProperty.call(e,`hover`)){let t=e.hover;return typeof t==`string`&&Mt.includes(t)?t:null}return _}let te=e=>ts(e.arms??0)>.6&&ts(e.contact??0)<.5&&Zs(e.build??1)>.999;function ne(e,t,a){let o=e.params||{},s=e.viewport===`port`?`port`:`land`,l=ts(o.contact??0);c.acquire(i,{position:[0,0,0]}),n.setViewport(s),n.setBuild(Zs(o.build??1)),n.setCrank(o.crank??0),n.setArms(o.arms??1),n.setContact(l),n.setBrass(o.brass??0),n.setCamera(t),c.usedCamera();let u=L(e);n.state().hover!==u&&n.setHover(u,{immediate:r}),n.setCrankAccent(+!u);let d=l>0?{az:$(md.final[0],md.contact[0],l),el:$(md.final[1],md.contact[1],l),i:$(md.final[2],md.contact[2],l)}:{az:md.final[0],el:md.final[1],i:md.final[2]},f=as(d.az,d.el);N[0]=f[0],N[1]=f[1],N[2]=f[2],n.setLight({dir:N,color:[1,1,1],intensity:d.i,ambient:.02}),n.setEnvColors({sky:`#1b2440`,ground:`#08070b`,rim:`#27e0d0`});let p=hd[s];n.setLook({fog:[a*$(p.final[0],p.contact[0],l),a*$(p.final[1],p.contact[1],l)],fogColor:fd.night,macro:null,ink:1,dark:$(.7,.72,l),outline:1,widthK:1,spacing:3.6,brush:1,palette:{night:fd.night,stage:fd.stage,shade:fd.shade,ink:cs.ink,muted:cs.muted,faint:cs.faint,line:cs.line}})}function z(e,t){let n=t.matrixWorld.elements;return[e.u,e.viewport,u.width,u.height,n[12],n[13],n[14],n[8],n[9],t.fov,L(e),(e.params||{}).arms,(e.params||{}).contact].join(`|`)}function re(e,t){let r=u.width||1440,i=u.height||900,a=e.viewport===`port`||Math.min(r,i)<520;return P.stones=l(n,t,r,i,{phone:a,shown:te(e.params||{})}),P.key=z(e,t),P.stones}function B(e,t,n){if(!h)return;let i=e.params||{},a=e.viewport===`port`?`port`:`land`,o=Number.isFinite(e.u)?e.u:18;F(a,n);let s=Ed(o,t,r),c=ts(i.galaxy??1);if(h.setStars(1),h.setHorizon(0),h.setTime((v?v.stillTime:0)+(r?0:t)),y){if(h.setGalaxy(c*$(1,.9,s.k)),h.setAurora(ts(i.aurora??0)),h.setNebula(.6*s.k*(1-ns(Sd[0],Sd[1],o))),s.k!==D){D=s.k;let[e,t]=y.shape;T.width=$(e.width,t.width,s.k),T.coreLength=$(e.coreLength,t.coreLength,s.k),T.dust=$(e.dust,t.dust,s.k),h.setGalaxyFrame(y.pole,y.coreAt(s.k,w),T),h.setNebulaFrame(y.nebula.dir,y.nebula),y.heroes.forEach((e,t)=>E[t].flux=e.flux*s.k),h.setHeroStars(E),O=NaN}}else h.setGalaxy(.9*c),h.setNebula(.6*ns(.75,1,c));let l=y?$(y.yaw[0],y.yaw[1],s.k):0;Math.abs(s.sway-O)<1e-7&&l===k||(O=s.sway,k=l,b.setFromAxisAngle(S,s.sway).multiply(x.setFromAxisAngle(C,l)),h.setSkyRotation(b));let u=Number.isInteger(e.beat)?e.beat:-1,d=u>=0&&Wo[u]?Wo[u].quiet[a]:null;d&&ls(d)?h.setQuietZone(d,.85*R(o)):o>=19?h.setQuietZone(gd[a],.85*ns(19,19.3,o)):h.setQuietZone(null)}let ie=new t.Scene,ae={id:`space`,load:I,get ready(){return f},setTier(e){d=Math.max(0,Math.min(3,Math.round(Number(e))||0)),h&&h.setTier(ge(d).sky)},resize(e,t,n){u.width=e,u.height=t,u.dpr=n||1,P.key=``},setHover(e){if(e!=null&&!Mt.includes(e))throw TypeError(`space act: unknown stone "${e}"`);_=e??null},get hover(){return _},render(t,r,o,l=0){if(p)return;let d=e.renderer;if(!f||!t){s(d,o,ie,a,pd);return}let{use:m,dist:h}=ee(t,r,o);B(t,l,ps(o,u));try{n&&n.ready&&(ne(t,m,h),re(t,m)),s(d,o,i,m,pd)}finally{c&&c.held&&c.release()}},pick(e,t,n,r){if(!Number.isFinite(e)||!Number.isFinite(t))return null;let i=ae.stonesScreen(n,r),a=u.width||1440,o=u.height||900;return Gi(i,(e*.5+.5)*a,(.5-t*.5)*o)},stonesScreen(e,t){if(!f||!n||!n.ready||!e)return[];let{use:r,dist:i}=ee(e,t,null);if(P.key&&P.key===z(e,r))return P.stones.map(e=>({...e}));try{return ne(e,r,i),re(e,r).map(e=>({...e}))}finally{c&&c.held&&c.release()}},focus(e,t){if(!e)return null;let{use:n}=ee(e,t,null),r=Cd.centre;A.set(r[0],r[1],r[2]).applyMatrix4(n.matrixWorldInverse);let i=-A.z;if(!(i>.001))return null;let a=Cd.radius*n.projectionMatrix.elements[5]/i/2;return A.set(r[0],r[1],r[2]).project(n),!Number.isFinite(A.x)||!Number.isFinite(A.y)?null:{x:A.x,y:A.y,r:Math.min(a,1)}},finishHints(){return{glow:{strength:1,threshold:.7},vignette:.2,grain:.018}},dispose(){p||(p=!0,c&&c.held&&c.release(),h&&h.dispose(),i.clear())}};return ae}function Ad(e,t,n,r){if(!(n>0)||!(r>0))return e;let i=e.x-t,a=e.v+r*i,o=Math.exp(-r*n);return e.x=t+(i+a*n)*o,e.v=(e.v-r*a*n)*o,e}function jd(e,t,n=1e-4){return Math.abs(e.x-t)<n&&Math.abs(e.v)<n*10}var Md=e=>e<=0?0:e>=1?1:e,Nd=Object.freeze({none:e=>e,linear:e=>e,"power1.inOut":e=>e<.5?2*e*e:1-2*(1-e)*(1-e),"power2.inOut":e=>e<.5?4*e*e*e:1-4*(1-e)**3,"power2.out":e=>1-(1-e)**3,"power2.in":e=>e*e*e,"sine.inOut":e=>.5-.5*Math.cos(Math.PI*e)}),Pd=e=>{let t=Md(e);return t*t*(3-2*t)},Fd=new Set([`duration`,`ease`,`delay`,`onUpdate`,`onComplete`,`overwrite`]);function Id(){let e=[];function t(e,t){let n=e.ease(Md(t));for(let t=0;t<e.keys.length;t++)e.target[e.keys[t]]=e.from[t]+(e.to[t]-e.from[t])*n;e.onUpdate?.()}return{to(n,r={}){let i=Object.keys(r).filter(e=>!Fd.has(e)&&typeof r[e]==`number`),a=Math.max(0,Number(r.duration??.5)||0),o=typeof r.ease==`function`?r.ease:Nd[r.ease]||Nd[`power1.inOut`],s={target:n,keys:i,from:i.map(e=>Number(n[e])||0),to:i.map(e=>r[e]),duration:a,delay:Math.max(0,Number(r.delay)||0),t:0,ease:o,onUpdate:r.onUpdate,onComplete:r.onComplete};return a===0&&s.delay===0?(t(s,1),s.onComplete?.(),s):(e.push(s),s)},killTweensOf(t){e.length&&(e=e.filter(e=>e.target!==t))},update(n){if(!e.length||!(n>0))return;let r=[];for(let i of e.slice()){i.t+=n;let e=i.t-i.delay;if(e<0)continue;let a=i.duration>0?e/i.duration:1;t(i,a),a>=1&&r.push(i)}if(r.length){e=e.filter(e=>!r.includes(e));for(let e of r)e.onComplete?.()}},finish(){let n=e;e=[];for(let e of n)t(e,1),e.onComplete?.()},get active(){return e.length>0}}}var Ld=Object.freeze({omega:18,snap:2,rest:2e-4}),Rd=Object.freeze({glow:Object.freeze({strength:1,threshold:.85,weights:Object.freeze([.3,.24,.18])}),rolloff:Object.freeze({knee:1,white:.35}),veil:Object.freeze([0,0,0]),vignette:.2,grain:.018}),zd=Object.freeze({cut:Object.freeze({}),fade:Object.freeze({}),lift:Object.freeze({dir:1,travel:0,feather:.55}),reveal:Object.freeze({}),dissolve:Object.freeze({feather:.2,lead:.4,lag:.25,close:.9,rise:Object.freeze([.4,.84]),lum:Object.freeze([.004,.12]),stretch:.8})}),Bd=.62;function Vd(e,t){return e===`contact`?uo:L(t)}function Hd(){let e={};z.forEach((t,n)=>{let r=e[t.act];r?r[1]=n+1:e[t.act]=[n,n+1]});for(let t of mo){let n=e[t.to];n&&(n[0]=Math.min(n[0],t.u[0]))}return e}var Ud=Hd();function Wd(e){let t=Number.isFinite(e)?Math.min(20,Math.max(0,e)):0;return Object.entries(Ud).map(([e,[n,r]])=>({id:e,dist:t<n?n-t:t<r||r>=20&&t<=r?0:Math.max(t-r,1e-9)})).sort((e,t)=>e.dist-t.dist||Ud[e.id][0]-Ud[t.id][0])}function Gd(e,t,n){let r=Math.min(e[0],e[2]),i=Math.max(e[0],e[2]),a=Math.min(e[1],e[3]),o=Math.max(e[1],e[3]);return[(r+1)/2*t,(1-o)/2*n,(i+1)/2*t,(1-a)/2*n]}function Kd(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function qd(e,t,n,r=null){if(t>=0&&Wo[t]){let r=R(e);return r>0?{ndc:Wo[t].quiet[n],k:r}:null}if(r&&e>=19){let t=Kd(19,19.3,e);return t>0?{ndc:r[n],k:t}:null}return null}var Jd=(e,t,n)=>e+(t-e)*n,Yd=(e,t)=>typeof e==`number`&&Number.isFinite(e)?e:t;function Xd(e,t=Rd){let n=t||Rd,r=e||{},i=typeof r.glow==`number`?{strength:r.glow}:r.glow||{},a=n.glow||Rd.glow,o=Array.isArray(i.weights)?i.weights:a.weights,s=r.rolloff||{},c=n.rolloff||Rd.rolloff,l=Array.isArray(r.veil)?r.veil:n.veil||Rd.veil;return{glow:{strength:Yd(i.strength,a.strength),threshold:Yd(i.threshold,a.threshold),weights:[Yd(o[0],0),Yd(o[1],0),Yd(o[2],0)]},rolloff:{knee:Yd(s.knee,c.knee),white:Yd(s.white,c.white)},veil:[Yd(l[0],0),Yd(l[1],0),Yd(l[2],0)],vignette:Yd(r.vignette,Yd(n.vignette,Rd.vignette)),grain:Yd(r.grain,Yd(n.grain,Rd.grain))}}function Zd(e,t,n,r){let i=Xd(e,r);if(!t||!(n>0))return i;let a=Xd(t,r),o=Math.min(1,n);return{glow:{strength:Jd(i.glow.strength,a.glow.strength,o),threshold:Jd(i.glow.threshold,a.glow.threshold,o),weights:i.glow.weights.map((e,t)=>Jd(e,a.glow.weights[t],o))},rolloff:{knee:Jd(i.rolloff.knee,a.rolloff.knee,o),white:Jd(i.rolloff.white,a.rolloff.white,o)},veil:i.veil.map((e,t)=>Jd(e,a.veil[t],o)),vignette:Jd(i.vignette,a.vignette,o),grain:Jd(i.grain,a.grain,o)}}function Qd(e,t=12){return Number.isFinite(e)?Math.floor(e*t/(2*Math.PI)):0}function $d(e,t,n=.25){if(!e||e.length!==t.length)return!0;for(let r=0;r<t.length;r++){let i=e[r],a=t[r];if(i.id!==a.id||i.visible!==a.visible||Math.abs(i.x-a.x)>n||Math.abs(i.y-a.y)>n||Math.abs(i.radius-a.radius)>n)return!0}return!1}var ef=[[`software`,/swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|mesa offscreen|warp/i],[`strong`,/geforce\s*(gtx\s*1[06-9]\d0|gtx\s*16\d0|rtx)|\brtx\s*\d|quadro\s*rtx|radeon\s*(rx\s*[5-9]\d{3}|pro\s*w)|apple\s*m[1-9]|intel.*\barc\b/i],[`weak`,/mali-?(4\d\d|t\d{3}|g(31|51|52|57|68|71|72))\b|adreno\D*([2-5]\d\d|6[0-1]\d)\b|powervr|sgx|videocore|vivante|tegra|intel.*\b(hd graphics( [2-5]\d{2,3})?|gma)\b/i],[`mid`,/adreno|mali|apple|intel|radeon|geforce|nvidia|amd|immortalis|xclipse/i]];function tf(e){if(!e||typeof e!=`string`)return`unknown`;for(let[t,n]of ef)if(n.test(e))return t;return`unknown`}var nf=e=>typeof e==`number`&&Number.isFinite(e)&&e>0?e:null;function rf({window:e=globalThis,renderer:t=null}={}){let n=e&&e.navigator||{},r=t=>{try{return!!(e&&typeof e.matchMedia==`function`&&e.matchMedia(t).matches)}catch{return!1}},i=null,a=null,o=null;try{let e=t&&t.capabilities;a=nf(e&&e.maxTextureSize),o=typeof(e&&e.maxSamples)==`number`?e.maxSamples:null;let n=t&&typeof t.getContext==`function`?t.getContext():null;if(n){let e=String(n.getParameter(n.RENDERER)||``);if(e&&!/^webkit webgl$/i.test(e))i=e;else{let e=n.getExtension(`WEBGL_debug_renderer_info`);e&&(i=String(n.getParameter(e.UNMASKED_RENDERER_WEBGL)||``)||null)}}}catch{}return{dpr:nf(e&&e.devicePixelRatio)??1,cores:nf(n.hardwareConcurrency),memory:nf(n.deviceMemory),coarse:r(`(pointer: coarse)`),fine:r(`(any-pointer: fine)`),width:nf(e&&e.innerWidth)??1280,height:nf(e&&e.innerHeight)??800,saveData:!!(n.connection&&n.connection.saveData),gpu:i,maxTextureSize:a,maxSamples:o}}function af(e={}){let t=[],n=tf(e.gpu),r=!!e.coarse&&!e.fine;if(n===`software`)return t.push(`software renderer (${e.gpu})`),{tier:0,maxTier:0,minTier:0,gpuClass:n,mobile:r,reasons:t};let i=r?1:2;t.push(r?`touch device: start at 1`:`desktop: start at 2`);let a=pe,o=r?2:pe;n===`weak`?(a=Math.min(a,+!r),t.push(`weak GPU (${e.gpu})`)):n===`strong`&&!r&&(e.cores==null||e.cores>=8)&&(e.memory==null||e.memory>=8)&&(i=3,t.push(`strong GPU (${e.gpu})`)),e.memory!=null&&e.memory<=2?(a=Math.min(a,0),t.push(`${e.memory} GB memory`)):e.memory!=null&&e.memory<=4&&(a=Math.min(a,1),t.push(`${e.memory} GB memory`)),e.cores!=null&&e.cores<=2&&(a=Math.min(a,1),t.push(`${e.cores} cores`)),e.saveData&&(a=Math.min(a,1),t.push(`Save-Data`)),e.maxTextureSize!=null&&e.maxTextureSize<4096&&(a=Math.min(a,1),t.push(`MAX_TEXTURE_SIZE ${e.maxTextureSize}`));let s=he(Math.min(i,a));return a<pe&&(o=Math.min(o,s+1)),{tier:s,maxTier:he(Math.max(s,o)),minTier:0,gpuClass:n,mobile:r,reasons:t}}function of(e){let t=rf(e);return{...af(t),signals:t}}var sf=Object.freeze({budgetMs:1e3/60,slowFactor:1.25,fastFactor:1.08,pauseMs:400,windowFrames:60,windowMs:1e3,minWindowFrames:12,dropShare:.4,dropAfterMs:1200,raiseShare:.01,raiseAfterMs:15e3,settleMs:750,minDropGain:.1});function cf(e={}){let t={...sf};for(let n of Object.keys(sf)){let r=e[n];if(r!==void 0){if(typeof r!=`number`||!Number.isFinite(r)||r<0)throw TypeError(`createGovernor: ${n} must be a non-negative number`);t[n]=r}}let n=Math.round(t.windowFrames);if(n<1)throw TypeError(`createGovernor: windowFrames must be at least 1`);let r=Math.min(n,Math.max(1,Math.round(t.minWindowFrames))),i=t.budgetMs*t.slowFactor,a=t.budgetMs*t.fastFactor,o=new Float64Array(n),s=new Float64Array(n),c=[],l={tier:2,minTier:0,ceiling:pe,frozen:!1,settlingMs:0,clockMs:0,frames:0,ignored:0,tail:0,fill:0,sum:0,slowCount:0,slowRunMs:0,stableRunMs:0,medianMs:null,share:null,lastDrop:null};function u(e){let t=he(e.minTier??0,0),n=Math.max(t,he(e.maxTier??pe,pe));l.minTier=t,l.ceiling=n,l.tier=Math.min(n,Math.max(t,he(e.tier??2))),l.frozen=!1,l.clockMs=0,l.frames=0,l.ignored=0,l.lastDrop=null,c.length=0,d()}function d(){l.tail=0,l.fill=0,l.sum=0,l.slowCount=0,l.slowRunMs=0,l.stableRunMs=0,l.medianMs=null,l.share=null,l.settlingMs=t.settleMs}function f(e){for(l.fill===n&&p(),o[(l.tail+l.fill)%n]=e,l.fill++,l.sum+=e,e>i&&l.slowCount++;l.fill>r&&l.sum-o[l.tail]>=t.windowMs;)p()}function p(){let e=o[l.tail];l.tail=(l.tail+1)%n,l.fill--,l.sum-=e,e>i&&l.slowCount--}function m(){for(let e=0;e<l.fill;e++)s[e]=o[(l.tail+e)%n];let e=s.subarray(0,l.fill).sort(),t=l.fill>>1;return l.fill%2?e[t]:.5*(e[t-1]+e[t])}function h(e,t){let n={from:l.tier,to:e,direction:e>l.tier?`up`:`down`,reason:t,atMs:l.clockMs,medianMs:l.medianMs,slowShare:l.share};return n.direction===`down`&&(l.ceiling=e,l.lastDrop={to:e,medianMs:n.medianMs}),l.tier=e,c.push(n),d(),n}return u(e),{push(e){let o=typeof e==`number`?e:NaN;if(!Number.isFinite(o)||o<=0||o>t.pauseMs)return l.ignored++,null;if(l.clockMs+=o,l.frames++,l.settlingMs>0)return l.settlingMs-=o,null;if(f(o),l.fill<n&&!(l.fill>=r&&l.sum>=t.windowMs))return null;let s=m(),c=l.slowCount/l.fill;l.medianMs=s,l.share=c;let u=s>i||c>=t.dropShare,d=s<=a&&c<=t.raiseShare;return l.slowRunMs=u?l.slowRunMs+o:0,l.stableRunMs=d?l.stableRunMs+o:0,u&&l.slowRunMs>=t.dropAfterMs&&!l.frozen&&l.tier>l.minTier?l.lastDrop&&l.lastDrop.to===l.tier&&s>l.lastDrop.medianMs*(1-t.minDropGain)?(l.frozen=!0,null):h(l.tier-1,`slow`):d&&l.stableRunMs>=t.raiseAfterMs&&l.tier<l.ceiling?h(l.tier+1,`stable`):null},get tier(){return l.tier},get ceiling(){return l.ceiling},get frozen(){return l.frozen},snapshot(){return{tier:l.tier,minTier:l.minTier,ceiling:l.ceiling,frozen:l.frozen,settlingMs:Math.max(0,l.settlingMs),clockMs:l.clockMs,frames:l.frames,ignored:l.ignored,windowFill:l.fill,medianMs:l.medianMs,slowShare:l.share,slowRunMs:l.slowRunMs,stableRunMs:l.stableRunMs,slowMs:i,fastMs:a,changes:c.map(e=>({...e}))}},reset(e={}){u(e)}}}var lf=`187`,uf=7,df=`#100f15`,ff=Object.freeze({plate:Ys,gears:Sl,room:dd,space:kd}),pf=Object.freeze(Object.keys(ff)),mf=Hd(),hf=Object.freeze({plate:3.3,gears:6.5,room:11.6,space:18.4}),gf=2500,_f=1.6,vf=1200,yf=8e3,bf=6e3,xf=1500,Sf=.05,Cf=.35,wf=Object.freeze({push:.7,resolve:.72,hold:1.6,back:.6,posK:.3,tgtK:.7}),Tf=.04;async function Ef({canvas:t,assetsBase:n,state:r,emit:i,audio:o,stones:s=[],debug:c=null,onProgress:l,renderer:u=null}){let f=t.ownerDocument&&t.ownerDocument.defaultView||globalThis,p=t.ownerDocument||globalThis.document||null,h=!!r.reducedMotion,g=!!r.still,_=!h&&!g,v=c||{};if(v.act!=null&&!pf.includes(v.act))throw TypeError(`createStage: unknown act "${v.act}"`);let y=new Map(s.map(e=>[e.id,e.href])),b=()=>f.performance&&typeof f.performance.now==`function`?f.performance.now():Date.now(),x=e=>{try{l?.(Math.min(1,Math.max(0,e)))}catch{}},C=u||new A({canvas:t,antialias:!1,alpha:!1,depth:!1,stencil:!1,premultipliedAlpha:!0,powerPreference:`high-performance`,preserveDrawingBuffer:g});C.outputColorSpace=e,C.toneMapping=0,C.info.autoReset=!1,C.setClearColor(new T(df),1);let E=Number.isFinite(v.tier)?he(v.tier):_e(r.quality),D=of({window:f,renderer:C}),O=E??D.tier,k=E===null&&!g?cf({tier:O,minTier:D.minTier,maxTier:Math.max(O,D.maxTier)}):null,j={w:1,h:1,dpr:1},M=!0,N=0;function P(){return[Math.max(1,Math.round(t.clientWidth||f.innerWidth||1)),Math.max(1,Math.round(t.clientHeight||f.innerHeight||1))]}let F=De(C,{tier:O,background:df}),I=Id(),L=Je({seed:uf,tier:ge(O).sky}),te=ji({THREE:S,rngFor:ee,tier:O,gsap:_?I:null,seed:uf,reducedMotion:!_}),ne=Hi(te),R=Ha(Go),z=ja(),B=ja(),ie={id:v.act||``,weight:1},ae={x:0,y:0,active:!1},V=new Map;function H(e){let t=V.get(e);if(t)return t;let r=ff[e];if(!r)throw TypeError(`stage: no act "${e}"`);let i=r({THREE:S,renderer:C,assetsBase:n,rngFor:ee,instrument:te,sky:L,tier:O,reducedMotion:!_,instrumentReady:ne,seed:uf});return i.setTier(O),i.resize(j.w,j.h,j.dpr),t={act:i,id:e,ready:!1,loading:null,progress:0,failedAt:-1/0,warmed:!1,error:!1},V.set(e,t),t}let oe=0;function se(e){let t=H(e);return t.ready||me?Promise.resolve():t.loading?t.loading:b()-t.failedAt<yf?Promise.resolve():(t.loading=Promise.resolve().then(()=>t.act.load(e=>{t.progress=Number.isFinite(e)?e:t.progress})).then(()=>{t.loading=null,me||(t.ready=!!t.act.ready,t.progress=1,oe=b()+xf,Ze(),xt())},n=>{t.loading=null,t.failedAt=b(),me||console.error(`[home] the ${e} act did not load`,n),Ze()}),t.loading)}let ce=()=>[...V.values()].some(e=>e.loading)||b()<oe,le=[null,null],ue=-1/0;function de(e){return le[e]||(le[e]=F.acquireTarget(`act:${e}`,{msaa:!0})),le[e]}function fe(){let[e,t]=P();N=f.devicePixelRatio||1;let n=ve(O,e,t,N);j.w=e,j.h=t,j.dpr=n,C.setPixelRatio(n),C.setSize(e,t,!1),F.resize(e,t,n);for(let r of V.values())r.act.resize(e,t,n);M=!1}function pe(e,t){let n=he(e);if(n!==O){O=n,F.setTier(n),te.setTier(n),L.setTier(ge(n).sky);for(let e of V.values())e.act.setTier(n);M=!0,Ze(),i(`tier`,{tier:ge(n).name,reason:t})}}let me=!1,ye=!1,be=0,xe=!0,Ce=-1/0,we=0,Te=!1,U=0,Ee=0,Oe=0,ke=0,Ae=0,je=!1,Me={x:0,v:0},Ne=!1,Pe=null,Fe=null,Ie=null,Le=-2,Re=null,ze=0,Be=0,Ve=!1,W=null,He=new a,Ue=new Set,We=new Set,Ge=()=>!!r.paused||!!(p&&p.hidden),Ke=()=>r.focused||(W?W.id:null)||Pe;function qe(e,t){let n=setTimeout(()=>{Ue.delete(n),me||e()},t);return Ue.add(n),n}function Ye(){be||me||ye||Ge()||typeof f.requestAnimationFrame!=`function`||(be=f.requestAnimationFrame(Qe))}function Xe(){be&&typeof f.cancelAnimationFrame==`function`&&f.cancelAnimationFrame(be),be=0}function Ze(e=!1){xe=!0,e&&(Ce=b()),Ye()}function G(){if(!Ne)return!0;let e=Vd(r.mode,r.progress);if(!jd(Me,e,Ld.rest)||I.active||W)return!0;if(ae.active&&r.pointerSeen){let[e,t]=$e();if(Math.abs(e-ae.x)>.001||Math.abs(t-ae.y)>.001)return!0}return!1}function Qe(e){if(be=0,me||ye||Ge())return;let t=_&&(G()||e-Ce<gf),n=xe||G();_&&!n&&(n=e-we>=32.333333333333336),n&&ht(e,t),(_||xe||G())&&Ye()}function $e(){return[r.pointer.x/j.w*2-1,1-r.pointer.y/j.h*2]}function et(e){let t=Vd(r.mode,r.progress);!Ne||!_||Math.abs(t-Me.x)>Ld.snap?(Me.x=t,Me.v=0,Ne=!0):(Ad(Me,t,e,Ld.omega),jd(Me,t,Ld.rest)&&(Me.x=t,Me.v=0))}function tt(e){if(!_||!r.pointerSeen){ae.active=!1;return}let[t,n]=$e(),i=ae.active?1-Math.exp(-e/Cf):1;ae.x+=(t-ae.x)*i,ae.y+=(n-ae.y)*i,ae.active=!0}function K(e){if(!W)return;W.t+=e;let{push:t,resolve:n,hold:r,back:i}=wf;W.k=W.t<t?Pd(W.t/t):W.t<t+r?1:1-Pd((W.t-t-r)/i),!W.done&&W.t>=n&&nt(),W.t>=t+r+i&&(W=null)}function nt(){W&&!W.done&&(W.done=!0,clearTimeout(W.timer),Ue.delete(W.timer),W.resolve())}function rt(e){if(!W||!W.stone||!(W.k>0))return;let t=W.stone,n=wf.posK*W.k,r=wf.tgtK*W.k;for(let i=0;i<3;i++)e.position[i]+=(t[i]-e.position[i])*n,e.target[i]+=(t[i]-e.target[i])*r}let it=e=>{for(let t=0;t<z.acts.length;t++)if(z.acts[t].id===e)return t;return-1},at=e=>e===0?z.camera:z.cameraB;function ot(e){return e?typeof e.finishHints==`function`?e.finishHints():e.finish||null:null}let st={rects:[[0,0,0,0]],strength:Bd};function ct(){let e=wa(j.w,j.h),t=j.w/j.h;R.evaluateInto(z,Me.x,e,t),v.act&&(z.acts[0]=ie,z.acts.length=1,z.transition=null,z.cameraB=null,R.cameraInto(z.camera,v.act,z.u,e,t)),z.pointer=ae,z.hover=Ke();let n=it(`space`);n>=0&&rt(at(n))}function lt(e){let t=z.acts.length,n=!0,r=it(`space`)>=0;!r&&Ve&&te.ready&&te.state().hover!==null&&te.setHover(null,{immediate:!0}),Ve=r;for(let r=0;r<t;r++){let t=z.acts[r].id,i=H(t);if(i.ready||(n=!1,se(t)),t===`room`&&typeof i.act.setQuietZone==`function`){let e=qd(z.u,z.beat,z.viewport,null);i.act.setQuietZone(e?e.ndc:null,e?e.k:0)}try{i.act.render(z,at(r),de(r),e)}catch(e){We.has(t)||(We.add(t),console.error(`[home] the ${t} act failed to draw`,e))}}return n}let ut={...zd.dissolve,focus:[0,0],focusR:0};function dt(e){if(e!==`dissolve`)return zd[e];let t=it(`space`),n=t>=0?V.get(`space`):null,r=n&&n.ready&&typeof n.act.focus==`function`?n.act.focus(z,at(t)):null;return r&&(ut.focus[0]=r.x,ut.focus[1]=r.y,ut.focusR=r.r),ut}function ft(e){let t=z.acts.length>1&&z.transition;if(t){let t=z.transition.kind;F.compose({a:de(0),b:de(1),mix:z.transition.t,kind:t,transitionParams:dt(t)}),ue=e}else F.compose({a:de(0)});let n=Zd(ot(H(z.acts[0].id).act),t?ot(H(z.acts[1].id).act):null,t?z.transition.t:0,Se),r=qd(z.u,z.beat,z.viewport,gd);r&&(st.rects[0]=Gd(r.ndc,j.w,j.h),st.strength=Bd*r.k),F.finish({glow:n.glow,rolloff:n.rolloff,veil:n.veil,vignette:n.vignette,grain:n.grain,quietZones:r?st:null,time:g?0:U}),!t&&le[1]&&e-ue>bf&&(F.releaseTarget(`act:1`),le[1]=null)}function pt(){let e=it(`space`),t=e>=0?V.get(`space`):null;if(t&&t.ready){let n=t.act.stonesScreen(z,at(e)),r=(z.params.stones??1)>Sf;if(Fe=n.map(e=>({id:e.id,x:e.x,y:e.y,r:e.r,radius:e.radius??e.r,hit:e.hit,depth:e.depth,visible:!!e.visible&&r})),$d(Ie,Fe)&&(Ie=Fe,i(`stones:screen`,Fe.map(e=>({...e})))),W)try{te.stoneWorldPosition(W.id,He),W.stone=[He.x,He.y,He.z]}catch{}}else Fe=null,Ie&&Ie.length&&(Ie=[],i(`stones:screen`,[]));mt(),z.beat!==Le&&(Le=z.beat,z.beat>=0&&Wo[z.beat]&&i(`beat`,{index:z.beat,id:Wo[z.beat].id,tone:`dark`}));let n=Qd(z.params.crank),r=it(`gears`);r>=0&&z.acts[r].weight>=.5&&Re!==null&&n!==Re&&o.tick(),Re=n;let a=z.params.lights??0;a>=Tf&&ze<Tf&&z.u>Be&&o.lights(),ze=a,Be=z.u}function mt(){if(!r.pointerSeen)return;let e=Fe?Gi(Fe,r.pointer.x,r.pointer.y):null;if(e===Pe)return;let t=Pe;Pe=e,t&&i(`stone:leave`,{id:t}),e&&i(`stone:enter`,{id:e}),Ze()}function ht(e,t){let n=we?Math.min(.1,Math.max(0,(e-we)/1e3)):1/60;if(k&&t&&Te&&we&&!ce()){let t=k.push(e-we);t&&pe(t.to,t.reason)}we&&e>we&&(Oe=Oe?Oe*.9+100/(e-we):1e3/(e-we)),Te=t,we=e,g||(U+=n),xe=!1,C.info.reset(),(M||(f.devicePixelRatio||1)!==N)&&fe(),et(n),I.update(n),K(n),tt(n),ct(),je=lt(g?0:U),ft(e),ke=C.info.render.calls,Ae=C.info.render.triangles,Ee++,pt(),gt()}function gt(){for(let{id:e,dist:t}of Wd(Me.x)){if(t>_f)break;let n=H(e);!n.ready&&!n.loading&&se(e)}}let _t=!1;function vt(){_t||r.mode!==`story`||(_t=!0,qe(async()=>{for(let{id:e}of Wd(Me.x)){if(me)return;await se(e)}},vf))}let yt=null,bt=!1;function xt(){if(g||bt||me)return;bt=!0;let e=()=>{if(bt=!1,me||ye)return;let e=[...V.values()].find(e=>e.ready&&!e.warmed&&it(e.id)<0);e&&(St(e),xt())};typeof f.requestIdleCallback==`function`?f.requestIdleCallback(e,{timeout:2500}):qe(e,250)}function St(e){e.warmed=!0;let t=wa(j.w,j.h),n=j.w/j.h,r=hf[e.id]??(mf[e.id][0]+mf[e.id][1])/2;R.evaluateInto(B,r,t,n),B.acts[0]={id:e.id,weight:1},B.acts.length=1,B.transition=null,B.cameraB=null,R.cameraInto(B.camera,e.id,r,t,n),B.pointer={x:0,y:0,active:!1},B.hover=Ke(),yt||=new d(64,64,{type:m,format:w,depthBuffer:!0,generateMipmaps:!1});try{e.act.render(B,B.camera,yt,0)}catch{}}let Ct=e=>{e.preventDefault(),ye=!0,Xe(),i(`contextlost`,{})},wt=()=>{ye=!1,We.clear(),M=!0,Ze()},Tt=e=>{let n=t.getBoundingClientRect(),r=kt(e.clientX-n.left,e.clientY-n.top);r&&i(`stone:click`,{id:r,href:y.get(r)})},Et=()=>{M=!0,Ze()},Dt=()=>{Ge()?Xe():Ze()};t.addEventListener(`webglcontextlost`,Ct,!1),t.addEventListener(`webglcontextrestored`,wt,!1),t.addEventListener(`click`,Tt),f.addEventListener?.(`resize`,Et),p?.addEventListener?.(`visibilitychange`,Dt);let Ot=typeof f.ResizeObserver==`function`?new f.ResizeObserver(Et):null;Ot?.observe(t);function kt(e,t){return!Fe||!Number.isFinite(e)||!Number.isFinite(t)?null:Gi(Fe,e,t)}try{if(x(.02),fe(),await ne.then(()=>x(.3)),me)return null;let e=Vd(r.mode,r.progress),t=wa(j.w,j.h),n=v.act?[v.act]:R.evaluate(e,t,j.w/j.h).acts.map(e=>e.id),i=n.map(e=>se(e)),a=re(()=>{let e=n.reduce((e,t)=>e+(V.get(t)?.progress??0),0)/n.length;x(.3+.65*e)},100);try{await Promise.all(i)}finally{clearInterval(a)}if(me)return null;ht(b(),!1),x(1),Ye(),vt(),xt()}catch(e){throw At(),e}function At(){if(!me){me=!0,Xe();for(let e of Ue)clearTimeout(e);Ue.clear(),W&&!W.done&&W.resolve(),W=null,Ot?.disconnect(),t.removeEventListener(`webglcontextlost`,Ct,!1),t.removeEventListener(`webglcontextrestored`,wt,!1),t.removeEventListener(`click`,Tt),f.removeEventListener?.(`resize`,Et),p?.removeEventListener?.(`visibilitychange`,Dt);for(let e of V.values())try{e.act.dispose()}catch{}V.clear(),te.dispose(),L.dispose(),yt?.dispose(),F.dispose(),C.dispose()}}return{revision:lf,get tierName(){return ge(O).name},get frames(){return Ee},invalidate:Ze,modeChanged(){r.mode===`story`&&vt(),Ze(!0)},pointerMoved(){mt(),_&&Ze(!0)},pauseChanged(){Ge()?Xe():Ze()},pick:kt,release(e){return W&&!W.done&&nt(),!_||me||!Fe||!Fe.some(t=>t.id===e&&t.visible)?Promise.resolve():new Promise(t=>{let n={id:e,t:0,k:0,done:!1,resolve:t,timer:null,stone:null};try{te.stoneWorldPosition(e,He),n.stone=[He.x,He.y,He.z]}catch{}n.timer=qe(()=>{W===n?nt():n.done||(n.done=!0,t())},wf.resolve*1e3+500),W=n,Ze(!0)})},stats(){return{frames:Ee,drawCalls:ke,triangles:Ae,tier:ge(O).name,engine:{u:z.u,target:Vd(r.mode,r.progress),section:z.section,beat:z.beat,viewport:z.viewport,acts:z.acts.map(e=>({id:e.id,weight:e.weight})),transition:z.transition?{...z.transition}:null,tierId:O,dpr:j.dpr,css:[j.w,j.h],fps:Math.round(Oe*10)/10,settled:Ee>0&&je&&!xe&&!G()&&z.acts.every(e=>V.get(e.id)?.ready),ready:[...V.values()].filter(e=>e.ready).map(e=>e.id),loading:[...V.values()].filter(e=>e.loading).map(e=>e.id),hover:Ke(),governor:k?{ceiling:k.ceiling,frozen:k.frozen}:null,post:F.stats().lastFrame}}},get debug(){return{THREE:S,renderer:C,post:F,timeline:R,frame:z,instrument:te,sky:L,acts:Object.fromEntries([...V].map(([e,t])=>[e,t.act])),setTier:e=>pe(e,`debug`)}},dispose:At}}export{Ef as createStage};