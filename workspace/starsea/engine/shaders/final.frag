#version 410
#include "common.glsl"
// Photography stage: restrained light diffusion, vignette, slight optical softness, fine luma grain, dither.
in vec2 v_uv;
uniform sampler2D t_src;
uniform sampler2D t_diff;   // blurred highlights
uniform vec2 u_res;
uniform float u_frame;
uniform float u_diffuse;
uniform float u_vignette;
uniform float u_grain;
out vec4 o;
void main(){
  vec2 px = 1.0/u_res;
  // optical softening (sigma ~0.5 px)
  vec3 c = texture(t_src, v_uv).rgb*0.52;
  c += (texture(t_src, v_uv+vec2(px.x,0)).rgb + texture(t_src, v_uv-vec2(px.x,0)).rgb +
        texture(t_src, v_uv+vec2(0,px.y)).rgb + texture(t_src, v_uv-vec2(0,px.y)).rgb)*0.12;
  // diffusion (screen)
  vec3 D = texture(t_diff, v_uv).rgb;
  c = 1.0 - (1.0 - c)*(1.0 - u_diffuse*D);
  // vignette
  vec2 q = (v_uv - 0.5)*vec2(u_res.x/u_res.y, 1.0);
  float r = length(q)/length(vec2(u_res.x/u_res.y, 1.0)*0.5);
  c *= mix(1.0, 1.0 - u_vignette, smoothstep(0.55, 1.08, r));
  // grain: monochrome, strongest in the midtones, new every frame
  float L = luma(c);
  float sig = u_grain*(0.006 + 0.014*4.0*L*(1.0 - L));
  vec2 gp = gl_FragCoord.xy + vec2(u_frame*17.13, u_frame*31.7);
  float n = (hash12(gp) + hash12(gp + 0.5) + hash12(gp*1.37 + 3.1) - 1.5)*1.4;
  c += sig*n;
  // triangular dither
  c += (hash12(gl_FragCoord.xy + u_frame*0.731) - hash12(gl_FragCoord.yx*1.13 + u_frame)) / 255.0;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}
