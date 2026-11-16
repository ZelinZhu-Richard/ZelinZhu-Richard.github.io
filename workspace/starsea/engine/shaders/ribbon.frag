#version 410
in vec2 v_uv;
in vec4 v_col;
in float v_soft;
out vec4 o;
void main(){
  float d = abs(v_uv.y);
  float hard = 1.0 - smoothstep(0.75, 1.0, d);
  float soft = exp(-d*d*3.0);
  float a = mix(hard, soft, v_soft)*v_col.a;
  o = vec4(v_col.rgb*a, a);
}
