#version 410
#include "common.glsl"
#include "sky.glsl"
in vec2 v_uv;
uniform vec2 u_res;
layout(location=0) out vec4 o_col;   // rgb reference, a = flow angle
layout(location=1) out vec4 o_mask;  // x band lum, y dust, z cloud, w region (0 sky, 1 sea)

vec2 flowFor(vec3 d, vec3 T){
  // screen-space direction whose ray change best matches world tangent T (least squares on the Jacobian)
  vec2 px = 1.0/u_res;
  vec3 dx = camRay(v_uv + vec2(px.x, 0.0)) - d;
  vec3 dy = camRay(v_uv + vec2(0.0, px.y)) - d;
  float a = dot(dx,dx), b = dot(dx,dy), c = dot(dy,dy);
  float tx = dot(dx,T), ty = dot(dy,T);
  float det = a*c - b*b;
  vec2 s = vec2(c*tx - b*ty, a*ty - b*tx)/det;
  return normalize(s);
}

void main(){
  vec3 d = camRay(v_uv);
  vec3 m;
  bool sea = d.y < 0.0;
  vec3 ds = sea ? vec3(d.x, -d.y, d.z) : d;
  vec3 c = skyRef(ds, m);
  if(sea){
    // calm mirror: darker, slightly compressed, cooler; brighter toward horizon (fresnel)
    float e = degrees(asin(-d.y));
    float fres = mix(0.62, 0.9, exp(-e/6.0));
    c = mix(hex3(14.0, 18.0, 52.0), c, fres);
    c = mix(c, c*vec3(0.92, 0.96, 1.06), 0.5);
  }
  // flow: horizontal on screen, band tangent inside the Milky Way (sky only)
  vec2 hor = flowFor(d, normalize(cross(vec3(0.0,1.0,0.0), d)*-1.0));
  vec2 f = hor;
  if(!sea){
    vec2 bandF = flowFor(d, bandTangent(d));
    float w = smoothstep(0.08, 0.45, m.x) * (1.0 - m.z);
    if(dot(bandF, hor) < 0.0) bandF = -bandF;
    f = normalize(mix(hor, bandF, w));
  }
  o_col = vec4(c, atan(f.y, f.x));
  o_mask = vec4(m, sea ? 1.0 : 0.0);
}
