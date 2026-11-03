#version 410
#include "common.glsl"
// Cel colouring + ink lines. Flat colour separations (base / shadow / deep shadow / hard highlight),
// rim light from the Milky Way, warm cel-tone pools from lamps, emissive windows.
in vec2 v_uv;
uniform sampler2D t_n;
uniform sampler2D t_p;
uniform sampler2D t_id;
uniform sampler2D t_edge;
uniform vec2 u_res;
uniform vec3 u_eye;
uniform float u_mirror;
#define NMAT 24
uniform vec3 u_base[NMAT];
uniform vec3 u_shade[NMAT];
uniform vec3 u_shade2[NMAT];
uniform vec3 u_hi[NMAT];
uniform vec3 u_line[NMAT];
uniform vec4 u_mp[NMAT];      // x spec threshold (0=none), y rim amount, z emissive, w warm response
uniform vec3 u_keyDir;        // toward key light (sky glow)
uniform vec3 u_rimDir;        // toward rim light (Milky Way)
uniform vec3 u_rimCol;
uniform vec3 u_viewDir;
#define NL 6
uniform vec4 u_lp[NL];        // xyz position, w radius (0 = off)
uniform vec3 u_lc[NL];        // warm light colour
uniform float u_lineAlpha;
uniform float u_emisBoost;
uniform float u_rimW;
uniform float u_shadowT[NMAT];
uniform sampler2D t_shadow;
uniform mat4 u_lvp;
uniform float u_shadowOn;
uniform int u_decalMat;
uniform sampler2D t_decal;
uniform vec3 u_decalO, u_decalU, u_decalV;
layout(location=0) out vec4 o_col;
layout(location=1) out vec4 o_glow;

void main(){
  vec2 px = 1.0/u_res;
  vec4 n0 = texture(t_n, v_uv);
  vec4 p0 = texture(t_p, v_uv);
  // ---- ink: nearest seed within a small window
  float best = 1e3; float bmat = -1.0; float bdist = 0.0; float silD = 1e3;
  for(int y=-5;y<=5;y++) for(int x=-5;x<=5;x++){
    vec4 e = texture(t_edge, v_uv + vec2(x,y)*px);
    if(e.w < 0.5) continue;
    float wa = 6.2832*e.z*3.0;
    vec2 off = vec2(x,y) - vec2(cos(wa), sin(wa))*0.45;
    float L = length(off);
    float v = L - e.x;
    if(v < best){ best = v; bmat = e.y; bdist = e.z; }
    if(e.w > 1.95) silD = min(silD, L);
  }
  float ink = (1.0 - smoothstep(-0.55, 0.55, best)) * u_lineAlpha;
  bool has = n0.w > -0.5;
  vec3 col = vec3(0.0); float a = 0.0; vec3 glow = vec3(0.0);
  if(has){
    int m = int(n0.w + 0.5);
    vec3 n = normalize(n0.xyz);
    vec3 P = p0.xyz;
    vec3 V = normalize(u_eye - P);
    vec3 key = u_keyDir, rimD = u_rimDir;
    if(u_mirror > 0.5){ key.y = -key.y; rimD.y = -rimD.y; }
    vec4 mp = u_mp[m];
    float ndl = dot(n, key);
    vec3 baseC = u_base[m], shadeC = u_shade[m], shade2C = u_shade2[m];
    if(m == u_decalMat){
      vec3 Pd = P; if(u_mirror > 0.5) Pd.y = -Pd.y;
      vec2 duv = vec2(dot(Pd - u_decalO, u_decalU)/dot(u_decalU, u_decalU), dot(Pd - u_decalO, u_decalV)/dot(u_decalV, u_decalV));
      vec3 tc = texture(t_decal, clamp(duv, 0.0, 1.0)).rgb;
      baseC = tc*vec3(0.62, 0.66, 0.82);
      shadeC = tc*vec3(0.36, 0.4, 0.56);
      shade2C = shadeC*0.8;
    }
    vec4 idv = texture(t_id, v_uv);
    float lit = step(u_shadowT[m] + 0.05*(idv.w - 0.5), ndl);
    if(u_shadowOn > 0.5 && lit > 0.5){
      vec3 Ps = P; if(u_mirror > 0.5) Ps.y = -Ps.y;
      vec4 lp = u_lvp*vec4(Ps, 1.0);
      vec3 sc = lp.xyz/lp.w*0.5 + 0.5;
      if(sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0){
        vec2 sp = 1.0/vec2(textureSize(t_shadow, 0));
        float occ = 0.0;
        for(int j=-2;j<=2;j++) for(int i=-2;i<=2;i++)
          occ += step(texture(t_shadow, sc.xy + vec2(i,j)*sp*0.75).r, sc.z - 0.002);
        if(occ/25.0 > 0.5) lit = 0.0;
      }
    }
    col = lit > 0.5 ? baseC : shadeC;
    float down = u_mirror > 0.5 ? n.y : -n.y;
    if(down > 0.55 || ndl < -0.55) col = shade2C;
    // warm pools from lamps: a separate hard-edged tone
    vec3 warm = vec3(0.0); float wsum = 0.0;
    for(int i=0;i<NL;i++){
      if(u_lp[i].w <= 0.0) continue;
      vec3 lpos = u_lp[i].xyz; if(u_mirror > 0.5) lpos.y = -lpos.y;
      vec3 L = lpos - P; float dl = length(L); L /= dl;
      float att = 1.0 - smoothstep(u_lp[i].w*0.35, u_lp[i].w, dl);
      float t = dot(n, L)*att;
      if(t > 0.12){
        float step2 = 0.55 + 0.45*step(0.42, t);
        warm += u_lc[i]*smoothstep(0.12, 0.13, t)*step2; wsum += 1.0;
      }
      // brass catches the lamp as a hard glint
      if(mp.x > 0.0){
        vec3 H = normalize(L + V);
        if(dot(n, H) > mp.x && att > 0.2) col = mix(col, u_hi[m]*vec3(1.0,0.92,0.75), 1.0);
      }
    }
    if(wsum > 0.0){
      vec3 lit = baseC*0.55 + baseC*warm*1.25 + warm*0.06;
      col = mix(col, lit, mp.w);
    }
    // specular from the sky glow
    if(mp.x > 0.0){
      vec3 H = normalize(key + u_viewDir);   // fixed view direction: highlights run as streaks along forms
      float s = dot(n, H);
      if(s > mp.x) col = u_hi[m];
    }
    // rim light from the Milky Way: a thin bright band along edges that face it
    float rim = 1.0 - max(dot(n, V), 0.0);
    if(mp.y > 0.0 && silD < u_rimW && rim > 0.35 && dot(n, rimD) > 0.15) col = mix(col, u_rimCol, mp.y*0.85);
    if(mp.z > 0.0){
      // emissive (windows, lamps): flat bright core with a slightly deeper rim of colour
      col = u_base[m];
      glow = u_base[m]*mp.z*u_emisBoost;
    }
    a = 1.0;
  }
  // ink colour: material line colour (coloured lines near light), slightly translucent at a distance
  if(ink > 0.0){
    int lm = int(max(bmat, 0.0) + 0.5);
    vec3 lc = u_line[lm];
    col = mix(col, lc, ink);
    a = max(a, ink);
    glow *= 1.0 - ink;
  }
  o_col = vec4(col*a, a);
  o_glow = vec4(glow, 1.0);
}
