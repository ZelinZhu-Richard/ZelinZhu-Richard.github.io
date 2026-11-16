#version 410
#include "common.glsl"
// One gouache brush stroke: opaque body, bristle streaks, ragged edges, dry-brush tail, slight
// pigment pooling at the edges, broken up by paper tooth where the brush runs dry.
in vec2 v_uv;
in vec3 v_col;
in vec4 v_par;
in vec2 v_dry;
out vec4 o;
uniform float u_paperScale;

void main(){
  float seed = v_par.x, r = v_par.y, L = v_par.z, op = v_par.w;
  float u = v_uv.x, v = v_uv.y;
  float side = abs(v);
  // ragged edge that wanders along the stroke
  float halfw = 0.8 + 0.2*vnoise(vec2(u*1.3 + seed*17.0, seed*5.0 + sign(v)*3.0));
  float a = 1.0 - smoothstep(halfw - max(0.06, 1.2/r), halfw, side);
  // rounded caps
  float cs = 0.55;
  float capd = length(vec2(max(-u, 0.0)/cs, v/halfw));
  float cape = length(vec2(max(u - L, 0.0)/(cs*1.4), v/halfw));
  a *= 1.0 - smoothstep(0.82, 1.0, max(capd, cape));
  // bristles: streaks along the stroke direction
  float br = vnoise(vec2(v*(5.0 + 0.6*r) + seed*31.0, u*0.12 + seed));
  br = 0.6*br + 0.4*vnoise(vec2(v*(11.0 + 1.2*r) + seed*7.0, u*0.25));
  // paint load runs out along the stroke -> dry brush breaks up on bristles and paper tooth
  float dry = v_dry.x;
  float t = sat(u / max(L, 0.5));
  float load = 1.0 - dry*pow(t, 1.4)*0.9 - dry*0.25;
  float paper = vnoise(gl_FragCoord.xy*u_paperScale) * 0.6 + vnoise(gl_FragCoord.xy*u_paperScale*2.7) * 0.4;
  float tooth = br*0.65 + paper*0.35;
  a *= smoothstep(1.0 - load - 0.12, 1.0 - load + 0.12, tooth);
  a *= op;
  // pigment pools slightly at the stroke edge; faint value variation along the bristles
  vec3 c = v_col * (1.0 - v_dry.y*smoothstep(0.5, 0.95, side/halfw));
  c *= 1.0 + 0.045*(br - 0.5);
  o = vec4(c*a, a);
}
