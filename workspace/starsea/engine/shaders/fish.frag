#version 410
#include "common.glsl"
// Luminous fish as effect cels: a curved body with a forked tail, flat bright fill, a paler belly band,
// a cyan trace line, drawn per drawing (the caller holds them on 2s).
in vec2 v_uv;
uniform vec2 u_res;
#define NF 8
uniform vec4 u_f0[NF];   // xy head px, zw direction (unit, screen)
uniform vec4 u_f1[NF];   // x length px, y bend (-1..1), z alpha, w mirror
uniform int u_nf;
out vec4 o;

float fishSDF(vec2 p, float L, float bend){
  // p in fish space: x from head (0) to tail (L), y lateral
  float t = clamp(p.x/L, 0.0, 1.0);
  float cy = bend*L*0.22*(t*t - t*0.2);           // body curve
  float y = p.y - cy;
  float w = L*0.17*sin(PI*pow(t, 0.62))*(1.0 - 0.75*t) + L*0.012;
  float body = (p.x < 0.0 || p.x > L*0.86) ? 1e3 : abs(y) - w;
  // forked tail
  vec2 q = vec2(p.x - L*0.82, y);
  float tail = 1e3;
  if(q.x > 0.0 && q.x < L*0.26){
    float spread = q.x*0.9;
    float fork = abs(abs(q.y) - spread*0.85) - (L*0.05 - q.x*0.12);
    tail = max(fork, q.x - L*0.26);
  }
  return min(body, tail);
}

void main(){
  vec2 p = v_uv*u_res;
  vec3 col = vec3(0.0); float a = 0.0;
  for(int i=0;i<NF;i++){
    if(i >= u_nf) break;
    vec2 head = u_f0[i].xy, dir = u_f0[i].zw;
    float L = u_f1[i].x, bend = u_f1[i].y, al = u_f1[i].z;
    vec2 d = p - head;
    vec2 fp = vec2(dot(d, -dir), dot(d, vec2(-dir.y, dir.x)));
    if(fp.x < -L*0.3 || fp.x > L*1.4 || abs(fp.y) > L*0.6) continue;
    float s = fishSDF(fp, L, bend);
    float lw = max(1.0, L*0.035);
    float fill = 1.0 - smoothstep(-0.6, 0.4, s);
    float line = 1.0 - smoothstep(lw*0.5, lw*0.5 + 0.8, abs(s + lw*0.5));
    vec3 body = vec3(0.50, 0.96, 0.90);
    vec3 belly = vec3(0.91, 1.0, 0.98);
    vec3 lc = vec3(0.22, 0.62, 0.78);
    float bel = smoothstep(0.0, L*0.06, -fp.y + bend*L*0.05);
    vec3 c = mix(body, belly, bel*0.8);
    // eye
    if(length(fp - vec2(L*0.1, -L*0.03)) < L*0.025) c = vec3(0.12, 0.3, 0.42);
    float cov = max(fill, line);
    vec3 cc = mix(c, lc, line*(1.0 - fill*0.3));
    float fa = cov*al;
    col = col*(1.0 - fa) + cc*fa;
    a = a*(1.0 - fa) + fa;
  }
  o = vec4(col, a);
}
