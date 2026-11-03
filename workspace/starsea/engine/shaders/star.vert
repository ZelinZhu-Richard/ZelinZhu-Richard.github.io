#version 410
in vec2 in_corner;   // per-vertex quad corner -1..1
in vec2 in_c;        // per-instance centre (plate px)
in vec4 in_s;        // radius, alpha, kind, seed
in vec3 in_col;
in float in_ext;     // quad half-size in px
uniform vec2 u_res;
uniform vec2 u_stretch;
out vec2 v_p;        // px offset from centre
out vec4 v_s;
out vec3 v_col;
void main(){
  v_p = in_corner*in_ext;
  v_s = in_s; v_col = in_col;
  gl_Position = vec4((in_c + v_p*u_stretch)/u_res*2.0-1.0, 0.0, 1.0);
}
