// Shared helpers: hashing, noise, camera rays, colour.
#define PI 3.14159265359
#define TAU 6.28318530718

float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p3){ p3 = fract(p3*0.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3 hash32(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3 += dot(p3, p3.yxz+33.33); return fract((p3.xxy+p3.yzz)*p3.zyx); }
vec4 hash42(vec2 p){ vec4 p4 = fract(vec4(p.xyxy)*vec4(0.1031,0.1030,0.0973,0.1099)); p4 += dot(p4, p4.wzxy+33.33); return fract((p4.xxyz+p4.yzzw)*p4.zywx); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f*f*(3.0-2.0*f);
  float a = mix(mix(hash13(i), hash13(i+vec3(1,0,0)), u.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), u.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}
// gradient noise, range ~[-1,1]
vec2 grad2(vec2 i){ float a = hash12(i)*TAU; return vec2(cos(a), sin(a)); }
float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  float a = dot(grad2(i), f), b = dot(grad2(i+vec2(1,0)), f-vec2(1,0));
  float c = dot(grad2(i+vec2(0,1)), f-vec2(0,1)), d = dot(grad2(i+vec2(1,1)), f-vec2(1,1));
  return 1.6*mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p, int oct){
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8,-0.6,0.6,0.8);
  for(int i=0;i<oct;i++){ s += a*gnoise(p); p = r*p*2.03+vec2(17.1,9.7); a *= 0.5; }
  return s;
}
float fbm3(vec3 p, int oct){
  float s = 0.0, a = 0.5;
  for(int i=0;i<oct;i++){ s += a*(vnoise3(p)*2.0-1.0); p = p*2.02+vec3(5.3,1.7,9.1); a *= 0.5; }
  return s;
}
float ridge(vec2 p, int oct){
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8,-0.6,0.6,0.8);
  for(int i=0;i<oct;i++){ s += a*(1.0-abs(gnoise(p))); p = r*p*2.07+vec2(3.1,7.7); a *= 0.5; }
  return s;
}

float sat(float x){ return clamp(x,0.0,1.0); }
float lin(float a, float b, float x){ return sat((x-a)/(b-a)); }
vec3 hex3(float r, float g, float b){ return vec3(r,g,b)/255.0; }
float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
vec3 srgb2lin(vec3 c){ return pow(max(c,0.0), vec3(2.2)); }
vec3 lin2srgb(vec3 c){ return pow(max(c,0.0), vec3(1.0/2.2)); }

// Camera: rot columns are right, up, forward (world). tanH = tan(vfov/2).
uniform mat3 u_camRot;
uniform vec3 u_camPos;
uniform float u_tanH;
uniform float u_aspect;
uniform vec2 u_shift;   // lens shift in ndc units
vec3 camRay(vec2 uv){
  vec2 ndc = uv*2.0-1.0 + u_shift;
  return normalize(u_camRot[2] + ndc.x*u_aspect*u_tanH*u_camRot[0] + ndc.y*u_tanH*u_camRot[1]);
}
