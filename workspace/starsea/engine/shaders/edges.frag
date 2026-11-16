#version 410
// Line seeds from the G-buffer: occlusion contours, part/material borders and creases.
// Each seed stores the half-width of the ink line that will be drawn through it.
in vec2 v_uv;
uniform sampler2D t_n;
uniform sampler2D t_p;
uniform sampler2D t_id;
uniform vec2 u_res;
uniform float u_lineBase;     // half-width (render px) of a contour at reference distance
uniform float u_refDist;      // distance at which u_lineBase applies
uniform float u_creaseCos;
uniform float u_matLine[24];   // line weight for borders of this material (0 = colour separation only)
uniform float u_matPri[24];    // which side's line colour wins at a material border
out vec4 o;   // x half-width, y material, z distance, w seed flag

void main(){
  vec2 px = 1.0/u_res;
  vec4 n0 = texture(t_n, v_uv);
  vec4 p0 = texture(t_p, v_uv);
  vec4 i0 = texture(t_id, v_uv);
  o = vec4(0.0);
  if(n0.w < -0.5) return;
  float d0 = p0.w;
  float cls = 0.0;
  float lmat = n0.w;
  vec2 offs[4] = vec2[4](vec2(1,0), vec2(-1,0), vec2(0,1), vec2(0,-1));
  for(int k=0;k<4;k++){
    vec2 q = v_uv + offs[k]*px;
    vec4 n1 = texture(t_n, q);
    if(n1.w < -0.5){ cls = max(cls, 1.0); continue; }
    vec4 p1 = texture(t_p, q);
    vec4 i1 = texture(t_id, q);
    float dd = p1.w - d0;
    float thr = max(0.012*d0, 0.03);
    if(dd > thr){ cls = max(cls, 0.9); continue; }      // we are in front: occlusion contour
    if(dd < -thr) continue;                              // neighbour in front draws it
    bool once = k == 0 || k == 2;                        // interior edges marked from one side only
    if(!once) continue;
    if(abs(i1.x - i0.x) > 0.5){ cls = max(cls, 0.7); continue; }
    if(abs(n1.w - n0.w) > 0.5){
      float ml = min(u_matLine[int(n0.w+0.5)], u_matLine[int(n1.w+0.5)]);
      if(0.55*ml > cls && u_matPri[int(n1.w+0.5)] > u_matPri[int(n0.w+0.5)]) lmat = n1.w;
      cls = max(cls, 0.55*ml); continue;
    }
    if(dot(n0.xyz, n1.xyz) < u_creaseCos){ cls = max(cls, 0.5); }
  }
  if(cls <= 0.0) return;
  float distScale = clamp(pow(u_refDist/max(d0, 0.01), 0.6), 0.45, 1.5);
  float pressure = 0.72 + 0.56*i0.y;
  // heavy outer contour, clearly lighter interior lines
  float wc = cls >= 0.99 ? 1.45 : (cls >= 0.89 ? 1.05 : cls*0.8);
  float w = u_lineBase*wc*distScale*pressure*i0.z;
  o = vec4(w, lmat, i0.w, 1.0 + cls);   // z carries the wobble phase   // w > 1.95 marks an outer silhouette
}
