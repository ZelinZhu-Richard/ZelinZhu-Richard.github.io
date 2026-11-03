#version 410
#include "common.glsl"
// Per-frame background: painted sky plate, the mirror sea (reflections broken into hand-drawn slices,
// ripple marks, glitter columns, wake), the rails across the water, and low mist.
in vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;       // seconds (1s timing)
uniform float u_t3;         // time quantised to 3s (for redrawn marks)
// sky plate
uniform sampler2D t_plate;
uniform mat3 u_pRot;
uniform float u_pTanH, u_pAspect;
uniform vec2 u_pShift;
uniform vec2 u_pRes;
uniform float u_plateGain;
// cel reflections (train, platform) rendered with mirrored geometry, premultiplied
uniform sampler2D t_refl;
uniform sampler2D t_stars;   // animated bright stars (sky) and their reflected dashes (sea), premultiplied
uniform sampler2D t_reflH;   // height above the water of the reflected cel surface (m), <0 = none
uniform float u_reflOn;
// train / wake
uniform float u_trainS;     // track distance of the loco front (straight part: world x)
uniform float u_trainV;     // m/s
uniform float u_trainLen;
uniform float u_onWater;    // 1 while the train runs on the sea-level track
// rails
uniform vec4 u_seg[96];     // xyz start, w = s
uniform int u_nseg;
uniform float u_railVis;    // base visibility of rails in starlight
uniform float u_revealS;    // rails beyond this s (toward -x) are not yet lit
// lights (headlamps, platform lamp) for gleam + glitter columns
uniform vec4 u_light[4];    // xyz, w intensity
uniform vec3 u_lightCol[4];
// ripple rings (fish, drops): x, z, t0, strength
uniform vec4 u_ring[8];
// mist
uniform float u_mist;
uniform vec3 u_mistCol;
uniform float u_horizonGlow;
uniform float u_skyRailVis;   // the climbing rails stay unseen until the reveal
layout(location=0) out vec4 o;
layout(location=1) out vec4 o_aux;   // x: sky mask, y: sea mask, z: depth (m), w: unused

const float GAUGE = 1.435;

vec2 plateUV(vec3 d, out float ok){
  vec3 l = transpose(u_pRot)*d;
  ok = l.z > 0.01 ? 1.0 : 0.0;
  vec2 ndc = vec2(l.x/(l.z*u_pTanH*u_pAspect), l.y/(l.z*u_pTanH)) - u_pShift;
  return ndc*0.5+0.5;
}
vec3 plate(vec3 d){
  float ok; vec2 uv = plateUV(d, ok);
  return textureLod(t_plate, clamp(uv, vec2(0.0005), vec2(0.9995)), 0.0).rgb*u_plateGain;
}
// horizontally smeared plate sample (reflections are dragged sideways with a flat brush)
vec3 plateSmear(vec3 d, float px){
  float ok; vec2 uv = plateUV(d, ok);
  vec2 dx = vec2(px/u_pRes.x, 0.0);
  float lod = clamp(log2(max(px*0.55, 1.0)), 0.6, 3.2);
  vec3 s = vec3(0.0);
  for(int i=-4;i<=4;i++){
    float fi = float(i);
    s += textureLod(t_plate, clamp(uv + dx*fi*0.55, vec2(0.0005), vec2(0.9995)), lod).rgb*exp(-fi*fi/9.0);
  }
  return s/4.85*u_plateGain;
}

// ---------------------------------------------------------------- rails (analytic capsules)
// distance between ray (o,d) and segment (a,b); returns (dist, t along ray, s along segment 0..1)
vec3 raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b){
  vec3 ba = b - a, oa = ro - a;
  float bb = dot(ba,ba), bd = dot(ba,rd), od = dot(oa,rd), ob = dot(oa,ba);
  float den = bb - bd*bd;
  float h = den > 1e-6 ? clamp((ob - od*bd)/den, 0.0, 1.0) : 0.0;
  float t = max(dot(a + ba*h - ro, rd), 0.0);
  vec3 q = ro + rd*t;
  // re-project once for accuracy
  h = clamp(dot(q - a, ba)/bb, 0.0, 1.0);
  vec3 c = a + ba*h;
  t = max(dot(c - ro, rd), 0.0);
  return vec3(length(ro + rd*t - c), t, h);
}

// returns rgba premultiplied colour of the track along this ray, and its depth in o_depth
vec4 track(vec3 ro, vec3 rd, float pixAng, float tMax, out float tHit, bool refl){
  vec4 acc = vec4(0.0);
  tHit = 1e9;
  for(int i=0;i<95;i++){
    if(i >= u_nseg-1) break;
    vec4 A = u_seg[i], B = u_seg[i+1];
    vec3 tA = normalize(B.xyz - A.xyz);
    vec3 side = normalize(cross(tA, vec3(0.0,1.0,0.0)));
    vec3 upv = cross(side, tA);
    for(int r=0;r<2;r++){
      float sg = r==0 ? 1.0 : -1.0;
      vec3 a = A.xyz + side*sg*GAUGE*0.5, b = B.xyz + side*sg*GAUGE*0.5;
      vec3 q = raySeg(ro, rd, a, b);
      if(q.y <= 0.0 || q.y > tMax) continue;
      float fp = q.y*pixAng;              // pixel footprint (m)
      float rr = 0.05;
      float w = max(rr, fp*0.6);
      float cov = (1.0 - smoothstep(w - fp*0.5, w + fp*0.5, q.x)) * min(1.0, rr/(fp*0.6));
      if(cov <= 0.001) continue;
      float s = mix(A.w, B.w, q.z);
      // shading: dark steel body with a thin bright head; warm gleam where the lamps reach
      float sky = u_railVis * (s < u_revealS ? 0.25 : 1.0);
      vec3 P = mix(a, b, q.z);
      vec3 hitP = ro + rd*q.y;
      float up = dot(hitP - P, upv)/max(w, 1e-4);          // -1 bottom .. 1 top of the rail
      float head = smoothstep(0.45, 0.75, up);
      head = mix(head, 0.45, smoothstep(0.6, 2.0, fp/rr));  // far away the rail is one thin line
      vec3 body = vec3(0.10, 0.11, 0.18);
      vec3 hiC = mix(vec3(0.30, 0.35, 0.48), vec3(0.58, 0.65, 0.80), sky);
      vec3 c = mix(body, hiC, head);
      for(int k=0;k<4;k++){
        if(u_light[k].w <= 0.0) continue;
        float dl = length(P - u_light[k].xyz);
        float g = u_light[k].w * exp(-dl/22.0) * (1.0 - exp(-dl*0.6));
        c += u_lightCol[k]*min(g, 0.6)*0.55*(0.2 + 0.8*head);
      }
      float lift = smoothstep(2.0, 40.0, P.y);
      c = mix(c, vec3(0.86, 0.9, 1.0), lift*0.85);
      if(refl){ c *= 0.7; cov *= 0.55; }
      cov *= mix(1.0, u_skyRailVis, smoothstep(0.8, 3.0, P.y));
      if(q.y < tHit){ tHit = q.y; }
      acc.rgb = acc.rgb*(1.0-cov) + c*cov;
      acc.a = acc.a*(1.0-cov) + cov;
    }
    // sleepers on the sea-level part: a dark ladder that averages to a band far away
    if(A.y < 1.0 && B.y < 1.0 && rd.y < 0.0){
      float yT = A.y - 0.1;
      float tp = (yT - ro.y)/rd.y;
      if(tp > 0.0 && tp < tMax){
        vec3 P = ro + rd*tp;
        vec3 ab = B.xyz - A.xyz;
        float h = dot(P - A.xyz, ab)/dot(ab, ab);
        if(h >= 0.0 && h <= 1.0){
          float fp = tp*pixAng/max(-rd.y, 0.02);
          float lat = abs(dot(P - A.xyz, side));
          float s = mix(A.w, B.w, h);
          float sp = 0.65;
          float ph = abs(fract(s/sp) - 0.5)*2.0;
          float k = fp/sp;
          float tie = 1.0 - smoothstep(0.36 - k*0.5, 0.36 + k*0.5, ph);
          tie = mix(tie, 0.36, smoothstep(0.2, 0.8, k));
          float fpl = tp*pixAng;
          float inside = 1.0 - smoothstep(1.25 - fpl, 1.25 + fpl, lat);
          float cov = inside*tie;
          if(cov > 0.001){
            vec3 c = vec3(0.085, 0.095, 0.165);
            if(refl){ c *= 0.8; cov *= 0.5; }
            tHit = min(tHit, tp);
            acc.rgb = acc.rgb + c*cov*(1.0-acc.a);
            acc.a = acc.a + cov*(1.0-acc.a);
          }
        }
      }
    }
  }
  return acc;
}

// ---------------------------------------------------------------- sea surface
float wakeAmp(vec2 p){
  // waves spreading from the line of the track behind the train (straight section: track along x, z=0)
  if(u_onWater < 0.5 && u_trainS < -1e8) return 0.0;
  float behind = u_trainS - p.x;            // metres behind the front
  if(behind < -2.0) return 0.0;
  float age = max(behind, 0.0)/max(u_trainV, 0.1);
  float spread = 1.6 + age*1.1;
  float lat = abs(p.y);
  float front = 1.0 - smoothstep(spread*0.85, spread*1.15, lat);
  float decay = exp(-age/4.5);
  return front*decay*(0.35 + 0.65*smoothstep(0.0, 2.0, lat));
}

vec2 ringField(vec2 p, float t){
  vec2 g = vec2(0.0);
  for(int i=0;i<8;i++){
    if(u_ring[i].w <= 0.0) continue;
    vec2 c = u_ring[i].xy;
    float age = t - u_ring[i].z;
    if(age < 0.0 || age > 3.5) continue;
    float r = length(p - c);
    for(int k=0;k<3;k++){
      float a = age - float(k)*0.25;
      if(a < 0.0) continue;
      float R = 6.0*(1.0 - pow(1.0 - min(a/3.0, 1.0), 2.0)) + 0.2;
      float band = exp(-pow((r - R)/0.18, 2.0));
      g += normalize(p - c + 1e-4)*band*u_ring[i].w*(1.0 - a/3.5);
    }
  }
  return g;
}

// log-depth row coordinate of the sea at a screen position (for the screen height of one row)
float seaRowK(vec2 uv){
  vec3 d = camRay(uv);
  if(d.y >= -1e-5) return 1e3;
  float t = -u_camPos.y/d.y;
  vec3 P = u_camPos + d*t;
  vec2 fwh = normalize(vec2(u_camRot[2].x, u_camRot[2].z) + 1e-5);
  return log(max(dot(P.xz - u_camPos.xz, fwh), 0.5))*9.0;
}

// One horizontal brush dash per row cell, world anchored and redrawn on 3s: it tapers at both ends,
// its pressure varies along the stroke, and it sits at its own height inside the row. fam picks an
// independent family of cells. Returns coverage; h is the cell's hash.
float brushDash(float lat, float cellL, float row, float rowF, float rowPx, float fam, float prob, float thickPx,
                out vec4 h){
  float u = lat/cellL + hash11(row*1.7 + fam*5.3)*7.0;
  float cell = floor(u);
  float a = fract(u);
  h = hash42(vec2(cell*1.31 + fam*17.0, row + floor(u_t3*8.0)*0.13 + fam*3.7));
  if(h.x > prob) return 0.0;
  float a0 = h.y*0.35;
  float a1 = min(a0 + 0.22 + 0.6*h.z, 0.98);
  float t = (a - a0)/(a1 - a0);
  if(t <= 0.0 || t >= 1.0) return 0.0;
  float prof = pow(sin(PI*t), 0.6)*(0.75 + 0.25*sin(PI*t*2.0 + h.w*6.0));
  float yc = 0.5 + (h.w - 0.5)*0.55;
  float dy = abs(rowF - yc)*rowPx;
  float hw = thickPx*0.5*prof*mix(0.5, 1.55, fract(h.w*7.31 + h.z*3.7));
  return (1.0 - smoothstep(hw - 0.5, hw + 0.5, dy))*min(1.0, hw*2.0 + 0.2);
}

void main(){
  vec3 d = camRay(v_uv);
  float pixAng = 2.0*u_tanH/u_res.y;
  vec3 col;
  float skyMask = 0.0, seaMask = 0.0, depth = 1e5;
  float tTrack;
  if(d.y > 0.0){
    col = plate(d);
    float okp; vec2 puv = plateUV(d, okp);
    float cloudA = textureLod(t_plate, clamp(puv, vec2(0.0005), vec2(0.9995)), 0.0).a;
    vec4 st = texture(t_stars, v_uv)*(1.0 - cloudA);
    col = col*(1.0 - st.a) + st.rgb;
    skyMask = 1.0;
    vec4 tr = track(u_camPos, d, pixAng, 1e5, tTrack, false);
    col = col*(1.0 - tr.a) + tr.rgb;
    if(tr.a > 0.5) depth = tTrack;
  } else {
    seaMask = 1.0;
    float tSea = -u_camPos.y/d.y;
    vec3 P = u_camPos + d*tSea;
    depth = tSea;
    float fp = tSea*pixAng;                 // metres per pixel at the surface
    // screen-y distance below the horizon, in pixels (drives the row structure)
    float below = max(-d.y, 1e-5);
    // row index: rows get taller toward the viewer (log spacing in depth)
    vec2 fwh = normalize(vec2(u_camRot[2].x, u_camRot[2].z) + 1e-5);
    float zdep = max(dot(P.xz - u_camPos.xz, fwh), 0.5);
    float rowK = log(zdep)*9.0;
    float row = floor(rowK);
    float rowF = fract(rowK);
    // world-anchored lateral coordinate for dashes
    vec3 right = u_camRot[0];
    vec2 rgt = normalize(vec2(right.x, right.z));
    float lat = dot(P.xz, rgt);
    float rowPx = 1.0/max(abs(seaRowK(v_uv + vec2(0.0, 1.0/u_res.y)) - rowK), 1e-3);
    // ripple disturbance: calm shimmer + wake + rings
    float wk = wakeAmp(P.xz);
    vec2 rg = ringField(P.xz, u_time);
    float dist = 0.18 + 2.6*wk + 3.0*length(rg);
    // hand-drawn slices: every row gets a held sideways offset, redrawn on 3s
    float rh = hash12(vec2(row, floor(u_t3*8.0 + row*0.37)));
    float rh1 = hash12(vec2(row + 1.0, floor(u_t3*8.0 + (row + 1.0)*0.37)));
    float sliceOff = (mix(rh, rh1, smoothstep(0.78, 1.0, rowF)) - 0.5)*dist;
    // gentle wave-glass shimmer between redraws
    sliceOff += 0.35*sin(rowK*3.1 + u_time*1.4)*(0.6 + dist);
    vec3 n = normalize(vec3(0.0, 1.0, 0.0) + vec3(right.x, 0.0, right.z)*sliceOff*0.0018*(1.0+wk*4.0));
    vec3 r = reflect(d, n);
    r.y = max(r.y, 0.0015);
    float smearPx = 2.0 + 5.0*smoothstep(0.0, 0.25, below) + 6.0*wk;
    vec3 refl = plateSmear(normalize(r), smearPx);
    vec3 skyR = refl;
    // cel reflections (mirrored train / platform), sampled with the same slice offset and softened a
    // little vertically, as a reflection is put slightly out of focus in compositing
    vec2 suv = v_uv + vec2(sliceOff*(1.5 + 8.0*wk + 6.0*length(rg))/u_res.x, 0.0);
    float hR = texture(t_reflH, suv).r;
    // strongest and sharpest where the object meets the water, softer and thinner with height above it
    float hk01 = smoothstep(0.3, 5.0, max(hR, 0.0));
    vec2 vy = vec2(0.0, (1.0 + 3.4*hk01)/u_res.y);
    suv.x += sliceOff*(1.0 + 3.5*hk01)/u_res.x;
    vec4 rc = texture(t_refl, suv)*0.36 + (texture(t_refl, suv + vy*1.4) + texture(t_refl, suv - vy*1.4))*0.22
            + (texture(t_refl, suv + vy*3.0) + texture(t_refl, suv - vy*3.0))*0.1;
    rc *= u_reflOn;
    float fadeH = hR > -0.5 ? mix(1.0, 0.26, hk01) : 0.62;
    // rails reflected
    vec4 tr = track(P + vec3(0.0, 0.001, 0.0), normalize(vec3(d.x, -d.y, d.z)), pixAng, 1e4, tTrack, true);
    vec4 st = texture(t_stars, suv);
    refl = refl*(1.0 - st.a) + st.rgb;
    refl = refl*(1.0 - tr.a) + tr.rgb;
    // reflected cels: darker, cooler, a little greyer than the real thing
    vec3 rcc = rc.rgb*vec3(0.52, 0.57, 0.7);
    rcc = mix(rcc, vec3(luma(rcc))*vec3(0.85, 0.92, 1.1), 0.3*rc.a);
    refl = refl*(1.0 - rc.a*fadeH) + rcc*fadeH;
    // value compression + hue toward the deep sea
    float e = degrees(below);
    vec3 deep = mix(vec3(0.18, 0.35, 0.52), vec3(0.04, 0.09, 0.2), smoothstep(0.0, 14.0, e));
    deep = mix(deep, vec3(0.02, 0.045, 0.12), smoothstep(14.0, 40.0, e));
    float fres = mix(0.44, 0.92, exp(-e/7.0));
    vec3 rv = mix(refl, refl*vec3(0.86,0.92,1.04), 0.4);
    col = mix(deep, rv*0.82, fres);
    // painted water marks: tapered horizontal strokes, never ruled lines. Light strokes are the sky
    // caught on the ripples and cut through the reflections (more often further from the waterline);
    // dark strokes are the troughs. Both thicken toward the viewer and fade out at the horizon.
    float nearFade = smoothstep(0.35, 2.5, e);
    // no water mark runs longer than ~150 px on screen; near the camera they get fewer and fainter
    float focalPx = u_res.y/(2.0*u_tanH);
    float maxCell = 170.0*zdep/focalPx;
    float nearRow = smoothstep(10.0, 45.0, rowPx);
    float onRefl = step(-0.5, hR)*rc.a;
    vec4 hd;
    float thk = clamp(rowPx*0.2, 0.7, 3.2);
    float clus = mix(0.25, 1.8, smoothstep(0.25, 0.75, vnoise(vec2(lat*0.035, row*0.11) + 4.0)));
    float pG = 0.03*clus + onRefl*mix(0.05, 0.22, smoothstep(0.5, 6.0, hR)) + 0.4*wk + 0.5*length(rg);
    float gl = brushDash(lat, min(1.2 + tSea*0.05, maxCell), row, rowF, rowPx, 1.0, pG, thk*mix(0.8, 1.2, onRefl), hd);
    vec3 glintC = skyR*1.15 + vec3(0.04, 0.05, 0.08);
    col = mix(col, glintC, gl*mix(0.4, 0.65, onRefl)*nearFade*mix(0.55, 1.0, hd.w));
    float pK = 0.04*clus + 0.4*wk + 0.5*length(rg);
    float dk = brushDash(lat, min(1.6 + tSea*0.06, maxCell), row, rowF, rowPx, 2.0, pK, thk*mix(1.15, 1.8, nearRow), hd);
    vec3 darkMark = vec3(0.016, 0.035, 0.11);
    col = mix(col, darkMark, dk*0.42*nearFade*mix(1.0, 0.45, nearRow));
    float pL = 0.02*clus + 0.5*wk + 0.6*length(rg);
    float lm = brushDash(lat, min(1.3 + tSea*0.06, maxCell), row, rowF, rowPx, 3.0, pL, thk, hd);
    col = mix(col, vec3(0.37, 0.53, 0.71), lm*0.4*nearFade);
    // glitter columns under the lamps, built in screen space below the light's mirror image: a soft
    // painted glow, and over it broken tapered dashes of light (up to two per row) redrawn on 2s
    for(int k=0;k<4;k++){
      if(u_light[k].w <= 0.0) continue;
      vec3 L = u_light[k].xyz;
      float lowL = 1.0 - smoothstep(5.0, 14.0, L.y);   // only lights near the water lay a column on it
      if(lowL <= 0.0) continue;
      vec3 Lm = vec3(L.x, -L.y, L.z) - u_camPos;
      float zf = dot(Lm, u_camRot[2]);
      if(zf <= 0.1) continue;
      vec2 sp = vec2(dot(Lm, u_camRot[0])/(zf*u_tanH*u_aspect), dot(Lm, u_camRot[1])/(zf*u_tanH)) - u_shift;
      sp = (sp*0.5 + 0.5)*u_res;
      vec3 Lh = vec3(L.x, 0.0, L.z) - u_camPos;
      float zh = dot(Lh, u_camRot[2]);
      float hy = (dot(Lh, u_camRot[1])/(zh*u_tanH) - u_shift.y)*0.5*u_res.y + 0.5*u_res.y;
      vec2 fragp = v_uv*u_res;
      float bl = hy - fragp.y;
      if(bl < -2.0) continue;
      float span = max(hy - sp.y, 4.0);
      float srcW = 0.35/zf*(u_res.y/(2.0*u_tanH));
      float drawing = floor(u_time*12.0);
      float wcol = max(srcW*1.3, 2.5)*(1.0 + 0.5*sat(bl/max(span*3.0, 1.0)))*(1.0 + 1.5*wk);
      float reach = span*(3.0 + 6.0*wk) + 40.0;
      float fall = exp(-max(bl, 0.0)/reach);
      float gw = min(wcol, 28.0)*(0.8 + 1.4*sat(bl/max(span*4.0, 60.0)));
      float gxs = (fragp.x - sp.x - (hash11(row*3.7 + float(k)) - 0.5)*gw*0.8)/gw;
      float glowCol = exp(-gxs*gxs)*exp(-max(bl, 0.0)/(reach*0.45))*smoothstep(-2.0, 8.0, bl)
                    *mix(0.25, 1.0, hash12(vec2(row*1.3, float(k) + drawing*0.17)));
      col += u_lightCol[k]*glowCol*0.14*min(u_light[k].w, 1.5)*lowL;
      float dsum = 0.0;
      // rows come in loose clusters: some groups of rows carry nothing on this drawing
      float grp = hash12(vec2(floor(row/3.0)*3.1 + float(k)*7.0, drawing*0.61));
      float far = smoothstep(8.0, 2.5, wcol);
      for(int j=0;j<3;j++){
        vec4 hk = hash42(vec2(row*1.7 + float(k)*13.0 + float(j)*5.1, drawing + float(j)*0.37));
        if(hk.z < 0.3 + 0.25*float(j) || grp < 0.22) continue;
        float cx = sp.x + (hk.y - 0.5)*wcol*1.5;
        float hl = min(wcol*mix(0.25, 1.5, hk.x*hk.x)*(1.0 + 1.6*far), 90.0);
        float t = (fragp.x - cx)/hl;
        if(abs(t) >= 1.0) continue;
        float sk = hk.w > 0.5 ? 1.0 : -1.0;
        float prof = pow(1.0 - t*t, 0.7)*(1.0 - 0.4*t*sk);
        float yc = 0.5 + (hash11(hk.w*91.0 + float(j)*7.0) - 0.5)*0.6;
        float thick = clamp(rowPx*0.3, 1.0, 2.0 + 3.2*sat(bl/420.0))*mix(0.55, 1.3, fract(hk.w*5.7))*mix(1.0, 0.7, far);
        float hw = thick*0.5*prof;
        float dy = abs(rowF - yc)*rowPx;
        float cov = (1.0 - smoothstep(hw - 0.5, hw + 0.5, dy))*min(1.0, hw*2.0 + 0.2);
        dsum = max(dsum, cov*mix(0.45, 1.0, hk.w)*(j == 0 ? 1.0 : 0.75));
      }
      vec3 lc = u_lightCol[k]*vec3(1.0, 0.93, 0.8);
      col += lc*dsum*fall*min(u_light[k].w, 1.2)*0.8*lowL;
    }
    // ring crests catch the sky light
    float rc2 = length(rg);
    float ringDash = step(0.4, hash12(vec2(floor(lat/0.8 + hash11(row)*3.0), row + floor(u_t3*8.0))));
    col = mix(col, vec3(0.62, 0.74, 0.92), smoothstep(0.35, 0.9, rc2)*0.5*ringDash);
    // the rails themselves, standing just above the water
    float tT;
    vec4 trd = track(u_camPos, d, pixAng, tSea, tT, false);
    col = col*(1.0 - trd.a) + trd.rgb;
    if(trd.a > 0.5) depth = tT;
  }
  // low mist over the water: horizontal dry-brush streaks drifting slowly
  if(u_mist > 0.0){
    float H = 2.2;
    float tIn = d.y < 0.0 ? max((u_camPos.y - H)/max(-d.y, 1e-4), 0.0) : 1e9;
    float tOut = d.y < 0.0 ? -u_camPos.y/d.y : 1e9;
    if(u_camPos.y < H){ tIn = 0.0; if(d.y > 0.0) tOut = (H - u_camPos.y)/max(d.y, 1e-4); }
    tOut = min(tOut, depth);
    float len = max(tOut - tIn, 0.0);
    if(len > 0.0){
      vec3 Pm = u_camPos + d*(tIn + len*0.5);
      vec2 rgt = normalize(vec2(u_camRot[0].x, u_camRot[0].z));
      vec2 fw = vec2(-rgt.y, rgt.x);
      vec2 q = vec2(dot(Pm.xz, rgt)/90.0 + u_time*0.012, dot(Pm.xz, fw)/14.0);
      float bank = smoothstep(-0.25, 0.45, fbm(q, 4));
      float streak = 0.7 + 0.3*fbm(vec2(q.x*6.0, q.y*40.0)+3.0, 3);
      float a = (1.0 - exp(-len/260.0))*bank*streak*u_mist;
      vec3 mc = u_mistCol;
      for(int k=0;k<4;k++){
        if(u_light[k].w <= 0.0) continue;
        float dl = length(Pm - u_light[k].xyz);
        mc += u_lightCol[k]*u_light[k].w*exp(-dl/18.0)*0.9;
      }
      col = mix(col, mc, clamp(a, 0.0, 0.6));
    }
  }
  o = vec4(col, 1.0);
  o_aux = vec4(skyMask, seaMask, depth, 0.0);
}
