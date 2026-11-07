#version 410
in vec2 in_pos;    // px
in vec2 in_uv;     // x along 0..1, y across -1..1
in vec4 in_col;    // rgb, alpha
in float in_soft;  // edge softness 0 hard .. 1 gaussian
uniform vec2 u_res;
out vec2 v_uv;
out vec4 v_col;
out float v_soft;
void main(){
  v_uv = in_uv; v_col = in_col; v_soft = in_soft;
  gl_Position = vec4(in_pos/u_res*2.0-1.0, 0.0, 1.0);
}
