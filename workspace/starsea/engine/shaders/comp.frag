#version 410
#include "common.glsl"
// Layer stack: background -> back fx -> cels -> front fx; emitters as transmitted light (multi-scale glow
// added in linear light, soft-clipped so cores go white and fringes keep their hue); light diffusion,
// vignette, optical softening, grain and dither are applied in final.frag.
in vec2 v_uv;
uniform sampler2D t_world;
uniform sampler2D t_fxBack;
uniform sampler2D t_cel;
uniform sampler2D t_fxFront;
uniform sampler2D t_g1;
uniform sampler2D t_g2;
uniform sampler2D t_g3;
uniform sampler2D t_g4;
uniform sampler2D t_sglow;
uniform vec4 u_gw;          // glow weights per scale
uniform float u_glowGain;
uniform float u_fade;       // 0 = black, 1 = full
uniform float u_para;
out vec4 o;

vec3 over(vec3 b, vec4 f){ return b*(1.0 - f.a) + f.rgb; }

void main(){
  vec3 c = texture(t_world, v_uv).rgb;
  c = over(c, texture(t_fxBack, v_uv));
  vec4 celA = texture(t_cel, v_uv);
  vec4 ffA = texture(t_fxFront, v_uv);
  vec3 sg = texture(t_sglow, v_uv).rgb*(1.0 - celA.a)*(1.0 - ffA.a);
  c = lin2srgb(srgb2lin(c) + srgb2lin(min(sg, vec3(2.0)))*0.9);
  // cel layer with a para: a vertical multiply gradient that settles the cels into the night
  vec4 cel = texture(t_cel, v_uv);
  vec3 para = mix(vec3(1.0), vec3(0.78, 0.82, 0.98), smoothstep(0.7, 0.0, v_uv.y)*u_para);
  cel.rgb *= para;
  c = over(c, cel);
  c = over(c, texture(t_fxFront, v_uv));
  vec3 lin = srgb2lin(c);
  vec3 g = texture(t_g1, v_uv).rgb*u_gw.x + texture(t_g2, v_uv).rgb*u_gw.y + texture(t_g3, v_uv).rgb*u_gw.z + texture(t_g4, v_uv).rgb*u_gw.w;
  lin += srgb2lin(min(g, vec3(4.0)))*u_glowGain;
  // soft shoulder from 0.8 to clip: hot cores bleach to white
  vec3 sh = 0.8 + 0.2*(1.0 - exp(-(lin - 0.8)/0.2));
  lin = mix(lin, sh, step(0.8, lin));
  float m = max(lin.r, max(lin.g, lin.b));
  lin = mix(lin, vec3(m), sat((m - 0.85)*1.5)*0.6);
  o = vec4(lin2srgb(lin)*u_fade, 1.0);
}
