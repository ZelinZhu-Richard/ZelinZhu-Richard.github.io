#version 410
#include "common.glsl"
// Steam, pass 2: paints the plume field as an effects cel. The dense level is opaque: one form shadow and
// a deeper core cut across the whole mass by the light direction, a pale catch-light along the lit rim, a
// colour-trace outline that thins and breaks on the lit side, and sparse interior lines between billows.
// The thin level (old, dissipating steam) is a second cel at fixed transparency with a soft edge and no
// line, the way thinning smoke is put on its own level and made see-through in compositing.
in vec2 v_uv;
uniform vec2 u_res;
uniform float u_margin;     // the field textures extend this far beyond the frame (px)
uniform sampler2D t_f0;     // dense sdf, thin sdf, local radius, warmth
uniform sampler2D t_f1;     // interior line dist, interior line strength, nearest depth, pattern phase
uniform sampler2D t_f2;     // front hero billow sdf toward the light, thinnest-level sdf
uniform sampler2D t_depth;  // occluder distance (cel G-buffer .w), <0 = empty
uniform float u_useDepth;
uniform vec2 u_light;       // screen direction toward the light (sky glow)
uniform vec3 u_base, u_shade, u_line, u_hi, u_warm;
uniform float u_lineW;
uniform float u_mirror;
uniform float u_hiAmt;
uniform float u_lineOn;
uniform float u_thinAlpha;
uniform float u_gain;       // overall opacity (reflections)
out vec4 o;

float sdfAt(vec2 px, int ch){
  vec4 f = texture(t_f0, (px + u_margin)/(u_res + 2.0*u_margin));
  return ch == 0 ? f.x : f.y;
}

void main(){
  vec2 p = v_uv*u_res;
  vec2 fuv = (p + u_margin)/(u_res + 2.0*u_margin);
  vec4 f0 = texture(t_f0, fuv);
  vec4 f1 = texture(t_f1, fuv);
  vec4 f2 = texture(t_f2, fuv);
  float dD = f0.x, dT = f0.y, R = max(f0.z, 1.0), warm = f0.w;
  if(dD > u_lineW + 2.0 && dT > 2.0 && f2.y > 2.0){ o = vec4(0.0); return; }
  if(u_useDepth > 0.5){
    float occ = texture(t_depth, v_uv).w;
    if(occ > 0.0 && f1.z > occ){ o = vec4(0.0); return; }
  }
  vec2 Ls = u_light;
  if(u_mirror > 0.5) Ls.y = -Ls.y;
  vec2 Lp = vec2(-Ls.y, Ls.x);
  float phase = f1.w;

  // ---- dense level. The light comes from above: a lit cap follows the tops of the billows, the rest
  // of the mass is in shade, and a deeper core pools where the mass is thickest below its tops. The
  // terminator width wanders, so the shade is a drawn shape rather than an offset copy of the outline.
  vec2 g = vec2(sdfAt(p + vec2(1.0, 0.0), 0) - sdfAt(p - vec2(1.0, 0.0), 0),
                sdfAt(p + vec2(0.0, 1.0), 0) - sdfAt(p - vec2(0.0, 1.0), 0));
  vec2 nrm = g/max(length(g), 1e-4);
  float lit = dot(nrm, Ls);
  float wav = vnoise(p/(R*0.9));
  float wCap = (0.55 + 0.4*wav)*R;
  vec2 bend = Lp*(wav - 0.5)*0.25*R;
  float dCap = sdfAt(p + Ls*wCap + bend, 0);
  float dCore = sdfAt(p + Ls*(1.15 + 0.3*wav)*R - bend, 0);
  float dBot = sdfAt(p - Ls*(0.8 + 0.35*vnoise(p/(R*1.3) + 5.0))*R, 0);
  float shade = smoothstep(0.6, -0.6, dCap)*smoothstep(-0.6, 0.6, dBot);
  float core = smoothstep(0.6, -0.6, dCore);
  // the front hero billow: a crescent of shade on its far side from the light
  // (where the mass is already in shade, the crescent goes one step deeper so the underside keeps form)
  float selfS = f2.x;
  float cres = smoothstep(0.6, -0.6, selfS);
  core = max(core, cres*shade*0.5);
  shade = max(shade, cres);
  // a thin broken catch-light right on the topmost edges
  float dHi = sdfAt(p + Ls*0.05*R, 0);
  float hiBand = smoothstep(-0.6, 0.6, dHi)*(1.0 - shade)*smoothstep(0.35, 0.7, lit)
               *step(0.5, vnoise(vec2(phase*0.29, 7.0) + p/(R*0.4)));
  vec3 c = mix(u_base, u_shade, shade);
  c = mix(c, u_shade*0.8, core*shade*0.7);
  c = mix(c, u_hi, hiBand*u_hiAmt);
  // warm light from the firebox and lamps catches the young steam from below
  c += u_warm*warm*shade*(1.0 - core*0.5)*0.22;
  float lw = u_lineW*clamp(R/40.0, 0.6, 1.0);
  lw *= mix(1.0, 0.45, sat(lit));
  float edge = 1.0 - smoothstep(lw*0.5, lw*0.5 + 0.8, abs(dD));
  // the trace breaks here and there on the lit side
  float brk = smoothstep(0.3, 0.55, vnoise(vec2(phase*0.37, 0.0) + p/(R*0.45)));
  edge *= mix(1.0, brk, smoothstep(0.1, 0.5, lit))*u_lineOn;
  float inside = 1.0 - smoothstep(-0.6, 0.6, dD);
  // interior lines between billows: few, mostly continuous, a colour between the line and the shade
  float il = (1.0 - smoothstep(lw*0.4, lw*0.4 + 0.8, f1.x))*f1.y*u_lineOn;
  il *= smoothstep(0.18, 0.38, vnoise(vec2(phase*0.53, 3.0) + p/(R*0.6)));
  il *= inside;
  vec3 ilc = mix(mix(u_line, u_shade, 0.4), u_line*0.85, shade);
  c = mix(c, ilc, il*0.85);
  float aD = max(inside, edge);
  vec3 cD = mix(c, u_line, edge/max(aD, 1e-3));

  // ---- thin levels: the dissipating steam goes onto see-through cels in two steps, drawn with the
  // same lit cap and a crisp edge, without a line
  float insideT = 1.0 - smoothstep(-0.7, 0.7, dT);
  float shT = smoothstep(0.6, -0.6, sdfAt(p + Ls*wCap*0.8, 1));
  vec3 cT = mix(mix(u_base, u_hi, 0.12), u_shade, shT*0.75);
  float aT = insideT*u_thinAlpha;
  float dT2 = f2.y;
  float insideT2 = 1.0 - smoothstep(-0.7, 0.7, dT2);
  vec3 cT2 = mix(u_base, u_shade, 0.35);
  float aT2 = insideT2*u_thinAlpha*0.55;

  // the two see-through levels are one cel each: where they overlap the nearer level wins outright,
  // so no darker seams appear from stacked transparency
  float aThin = max(aT, aT2);
  vec3 cThin = aT >= aT2 ? cT : cT2;
  vec3 col = cD*aD + cThin*aThin*(1.0 - aD);
  float a = aD + aThin*(1.0 - aD);
  o = vec4(col, a)*u_gain;
}
