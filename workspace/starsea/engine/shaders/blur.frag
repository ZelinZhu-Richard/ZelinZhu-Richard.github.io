#version 410
// separable gaussian (13 taps, linear-filter offsets) on a texture of any size
in vec2 v_uv;
uniform sampler2D t_src;
uniform vec2 u_dir;      // texel step * direction (in uv)
uniform float u_sigma;   // in texels
out vec4 o;
void main(){
  vec4 s = texture(t_src, v_uv);
  float wsum = 1.0;
  for(int i=1;i<=12;i++){
    float x = float(i);
    float w = exp(-x*x/(2.0*u_sigma*u_sigma));
    s += (texture(t_src, v_uv + u_dir*x) + texture(t_src, v_uv - u_dir*x))*w;
    wsum += 2.0*w;
  }
  o = s/wsum;
}
