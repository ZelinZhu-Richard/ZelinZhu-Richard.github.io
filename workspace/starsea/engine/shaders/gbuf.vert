#version 410
in vec3 in_pos;
in vec3 in_nrm;
in float in_mat;
uniform mat4 u_model;
uniform mat4 u_vp;
uniform float u_mirror;   // 1: geometry reflected through y=0 (for the sea reflection pass)
out vec3 v_wpos;
out vec3 v_wnrm;
out vec3 v_opos;
flat out float v_mat;
void main(){
  vec4 w = u_model*vec4(in_pos, 1.0);
  vec3 n = normalize(mat3(transpose(inverse(u_model)))*in_nrm);
  if(u_mirror > 0.5){ w.y = -w.y; n.y = -n.y; }
  v_wpos = w.xyz;
  v_wnrm = n;
  v_opos = in_pos;
  v_mat = in_mat;
  gl_Position = u_vp*w;
}
