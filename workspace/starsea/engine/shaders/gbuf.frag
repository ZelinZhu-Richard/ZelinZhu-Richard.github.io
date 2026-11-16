#version 410
#include "common.glsl"
in vec3 v_wpos;
in vec3 v_wnrm;
in vec3 v_opos;
flat in float v_mat;
uniform float u_part;
uniform float u_lineScale;   // per-part line weight multiplier
uniform vec3 u_eye;
layout(location=0) out vec4 o_n;    // world normal, material
layout(location=1) out vec4 o_p;    // world position, view distance
layout(location=2) out vec4 o_id;   // part id, pressure noise, line scale, 1
void main(){
  vec3 n = normalize(v_wnrm);
  float pressure = vnoise3(v_opos*3.1 + u_part*7.0);
  o_n = vec4(n, v_mat);
  o_p = vec4(v_wpos, length(v_wpos - u_eye));
  // slow, object-anchored wobble phase for the ink line (hand-drawn lines are never perfectly true)
  float wob = vnoise3(v_opos*0.9 + u_part*3.1);
  o_id = vec4(u_part, pressure, u_lineScale, wob);
}
