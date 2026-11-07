#version 410
#include "common.glsl"
// Steam, pass 1: the plume as one shape. Every puff is a cluster of round lobes; the field stores the
// signed distance (px) to the union of all dense puffs and, separately, of the thin dissipating ones, so
// the shading pass can cut one form shadow across the whole mass instead of one per puff. Interior lines
// are kept only where a younger puff's edge passes over the body of a puff behind it.
in vec2 v_uv;
uniform vec2 u_res;        // frame size (px)
uniform float u_margin;    // the field extends this far beyond every frame edge (px)
#define NP 96
uniform vec4 u_pc[NP];     // xy centre px, z radius px, w depth (m)
uniform vec4 u_pa[NP];     // x age (frames, quantised), y seed, z warmth, w alpha
uniform vec4 u_pb[NP];     // x drawing index, y kind (0 exhaust, 1 wisp, 2 whistle, 3 cloud), z level (0 dense, 1 thin), w stretch
uniform int u_np;
uniform float u_lineW;
uniform vec2 u_light;      // screen direction toward the light
uniform float u_mirror;
layout(location=0) out vec4 o0;   // x dense sdf, y thin sdf, z local puff radius, w warmth
layout(location=1) out vec4 o1;   // x interior line distance, y interior line strength, z nearest covering depth, w pattern phase
layout(location=2) out vec4 o2;   // x minus the front hero billow's sdf sampled away from the light (<0: its crescent), y thinnest-level sdf

// polynomial smooth minimum: neighbouring puffs flow into one mass instead of meeting at cut corners
float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b - a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0 - h);
}

void lobe(int k, int nl, float seed, float drawing, bool cloud, float R, float st, out vec2 c, out float r){
  float fk = float(k);
  if(k == 0){ c = vec2(0.0); r = cloud ? 0.42 : 0.5; }
  else if(cloud){
    float xo = (fk/float(nl-1) - 0.5)*1.25 + (hash11(seed*2.9+fk)-0.5)*0.18;
    float dome = 1.0 - pow(abs(xo)/0.7, 2.0);
    c = vec2(xo, 0.04 + 0.34*dome*(0.6 + 0.4*hash11(seed*4.1+fk*1.3)));
    r = (0.4 + 0.18*hash11(seed*13.1 + fk*3.7))*(1.0 - 0.3*abs(xo));
  } else {
    float spin = drawing*0.09*(hash11(seed)-0.5);
    float ang = TAU*hash11(seed*3.1 + fk*1.9) + spin;
    // lobes favour the top and the sides: steam billows up and out, its underside stays fuller
    vec2 dir = vec2(cos(ang), sin(ang)*0.8 + 0.25);
    c = dir*mix(0.28, 0.52, hash11(seed*7.7 + fk*2.3));
    r = mix(0.26, 0.58, pow(hash11(seed*13.1 + fk*3.7), 1.4));
  }
  c = vec2(c.x*st, c.y)*R;
  r *= R;
}

float wobR(float r, float th, float seed, float drawing, float erode){
  float wob = 0.09*sin(th*3.0 + seed*9.0 + drawing*0.35) + 0.07*sin(th*5.0 + seed*4.0 - drawing*0.21);
  return r*(1.0 + wob)*(1.0 - erode*0.25);
}

float puffSdf(vec2 p, vec4 pc, float seed, float drawing, bool cloud, float st, float erode, int nl, out float sth){
  float s = 1e4;
  sth = 0.0;
  for(int k=0;k<9;k++){
    if(k >= nl) break;
    vec2 c; float r;
    lobe(k, nl, seed, drawing, cloud, pc.z, st, c, r);
    vec2 q = p - pc.xy - c;
    float th = atan(q.y, q.x);
    float dk = length(q) - wobR(r, th, seed, drawing, erode);
    if(dk < s){ s = dk; sth = th; }
  }
  return s;
}

void main(){
  vec2 p = v_uv*(u_res + 2.0*u_margin) - u_margin;
  vec2 Ls = u_light;
  if(u_mirror > 0.5) Ls.y = -Ls.y;
  float selfS = 1e3;
  float dD = 1e4, dT = 1e4, dT2 = 1e4;
  float wsum = 1e-4, rsum = 0.0, warmsum = 0.0;
  float nearD = 1e9;
  float lineD = 1e4, lineA = 0.0;
  float phase = 0.0, bestS = 1e4;
  for(int i=0;i<NP;i++){
    if(i >= u_np) break;
    vec4 pc = u_pc[i];
    float R = pc.z;
    float st = u_pb[i].w;
    vec2 d0 = p - pc.xy;
    vec2 dd0 = vec2(d0.x/st, d0.y);
    float reach = R*1.25 + 3.0;
    if(dot(dd0, dd0) > reach*reach*1.9){
      continue;
    }
    float age = u_pa[i].x, seed = u_pa[i].y, warm = u_pa[i].z;
    float drawing = u_pb[i].x;
    bool cloud = u_pb[i].y > 2.5;
    float level = u_pb[i].z;
    float erode = smoothstep(44.0, 92.0, age);
    int nl = cloud ? 5 + int(hash11(seed*5.3)*3.0) : 6 + int(hash11(seed*5.3)*3.0);
    float sth;
    float s = puffSdf(p, pc, seed, drawing, cloud, st, erode, nl, sth);
    // breakup: the older drawings tear open along the drift (a cut-out, not a fade)
    if(erode > 0.0){
      vec2 hq = vec2(dd0.x/R*1.05, dd0.y/R*2.7);
      float holes = vnoise(hq + seed*31.0 + drawing*0.05) + 0.5*vnoise(hq*2.1 + seed*7.0);
      float hv = holes/1.5 - (erode*1.05 - 0.12);
      s = max(s, -hv*R*0.9);
    }
    float wgt = 1.0 - smoothstep(-0.35*R, 0.5*R, s);
    wsum += wgt; rsum += wgt*R; warmsum += wgt*warm;
    if(s < 0.0) nearD = min(nearD, pc.w);
    if(s < bestS){ bestS = s; phase = seed*37.0 + sth*1.6; }
    if(level > 1.5){
      dT2 = smin(dT2, s, 0.3*R);
    } else if(level > 0.5){
      dT = smin(dT, s, 0.3*R);
    } else {
      // painter's order (far to near): a front puff hides the interior lines behind it, and its own edge
      // becomes an interior line where it lies over a puff already drawn
      // a few big billows in front are drawn as forms of their own: a crescent of shade under them, cut
      // by the light direction, and an interior line where they overlap the mass behind
      bool hero = !cloud && hash11(seed*7.3 + 0.4) < 0.45;
      // (only another hero replaces a crescent: plain puffs would clip it into stray angular shapes)
      if(s < 0.0 && hero){
        float tmp;
        selfS = -puffSdf(p - Ls*(0.22 + 0.14*hash11(seed*3.3))*R, pc, seed, drawing, cloud, st, erode, nl, tmp);
      }
      float lw = u_lineW*2.0;
      if(s < -lw) { lineD = 1e4; lineA = 0.0; }
      if(hero && abs(s) < lw*1.5 && dD < -lw*2.5){
        lineD = abs(s);
        lineA = 1.0 - smoothstep(14.0, 40.0, age);
      }
      dD = smin(dD, s, 0.09*R);
    }
  }
  o0 = vec4(clamp(dD, -1e3, 1e3), clamp(dT, -1e3, 1e3), rsum/wsum, warmsum/wsum);
  o1 = vec4(min(lineD, 6e4), lineA, min(nearD, 6e4), phase);
  o2 = vec4(clamp(selfS, -1e3, 1e3), clamp(dT2, -1e3, 1e3), 0.0, 0.0);
}
