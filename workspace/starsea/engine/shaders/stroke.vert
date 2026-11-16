#version 410
in vec2 in_pos;     // plate pixels
in vec2 in_uv;      // x: distance along stroke in radii, y: -1..1 across
in vec3 in_col;
in vec4 in_par;     // seed, radius(px), length in radii, opacity
in vec2 in_dry;     // dryness, edge darkening
uniform vec2 u_res;
out vec2 v_uv;
out vec3 v_col;
out vec4 v_par;
out vec2 v_dry;
void main(){
  v_uv = in_uv; v_col = in_col; v_par = in_par; v_dry = in_dry;
  gl_Position = vec4(in_pos/u_res*2.0-1.0, 0.0, 1.0);
}
