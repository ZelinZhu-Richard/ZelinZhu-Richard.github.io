#version 410
in vec2 v_uv;
uniform sampler2D t_src;
uniform float u_thr;
out vec4 o;
void main(){
  vec3 c = texture(t_src, v_uv).rgb;
  o = vec4(max(c - u_thr, 0.0)/(1.0 - u_thr), 1.0);
}
