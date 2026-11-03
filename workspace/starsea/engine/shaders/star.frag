#version 410
#include "common.glsl"
// Painted stars: spatter dots (slightly irregular gouache dots), soft glows, and four-point glints.
in vec2 v_p;
in vec4 v_s;
in vec3 v_col;
out vec4 o;
uniform float u_scale;  // plate px per frame px
uniform float u_glow;   // 1 = glow pass (additive), 0 = paint pass (premultiplied over)

void main(){
  float r = v_s.x, alpha = v_s.y, kind = v_s.z, seed = v_s.w;
  float d = length(v_p);
  float th = atan(v_p.y, v_p.x);
  if(u_glow > 0.5){
    if(kind < 0.5) discard;
    float sg = r*(kind > 1.5 ? 4.0 : 2.6);
    float g = exp(-d*d/(2.0*sg*sg))*0.4 + exp(-d/(sg*2.0))*0.08;
    vec3 c = v_col*g*alpha;
    if(kind > 1.5){
      // four-point glint, slightly rotated per star, tapering spikes
      float rot = (seed-0.5)*0.35;
      vec2 q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot))*v_p;
      float len = r*(9.0 + 7.0*seed)*u_scale;
      float w = 0.55*u_scale;
      float sx = exp(-abs(q.y)/w) * pow(sat(1.0 - abs(q.x)/len), 2.2);
      float sy = exp(-abs(q.x)/w) * pow(sat(1.0 - abs(q.y)/(len*1.15)), 2.2);
      c += v_col*(sx + sy)*alpha*0.9;
    }
    o = vec4(c, 0.0);
    return;
  }
  // irregular dot
  float wa = sat((r/u_scale - 0.9)/2.0);
  float wob = 1.0 + wa*(0.035*sin(3.0*th + seed*20.0) + 0.025*sin(5.0*th + seed*37.0));
  float rr = r*wob;
  float a;
  if(rr < 0.9){
    a = alpha*exp(-d*d/(2.0*0.42*0.42*u_scale*u_scale))*min(1.0, rr*1.3);
  } else {
    a = alpha*(1.0 - smoothstep(rr - 0.55*u_scale, rr + 0.45*u_scale, d));
  }
  // slightly brighter core
  vec3 c = mix(v_col, vec3(1.0), 0.35*(1.0 - smoothstep(0.0, rr*0.6, d)));
  o = vec4(c*a, a);
}
