// Analytic design of the night sky in direction space. This is the "layout" the painter reproduces
// with brush strokes; it is never shown directly.
uniform vec3 u_mwA;   // galactic core direction
uniform vec3 u_mwP;   // galactic pole
uniform float u_cloudShift; // drift of the cloud deck along its ribbons (metres)

vec3 skyGradient(vec3 d){
  float e = degrees(asin(clamp(d.y, -1.0, 1.0)));
  // sapphire at the horizon deepening to indigo overhead
  vec3 c = vec3(35.0, 68.0, 110.0)/255.0;
  c = mix(c, vec3(31.0, 63.0, 105.0)/255.0, lin(0.0, 1.0, e));
  c = mix(c, vec3(25.0, 54.0, 95.0)/255.0, lin(1.0, 4.0, e));
  c = mix(c, vec3(18.0, 42.0, 84.0)/255.0, lin(4.0, 10.0, e));
  c = mix(c, vec3(13.0, 30.0, 68.0)/255.0, lin(10.0, 20.0, e));
  c = mix(c, vec3(9.0, 22.0, 54.0)/255.0, lin(20.0, 32.0, e));
  c = mix(c, vec3(6.0, 13.0, 38.0)/255.0, lin(32.0, 62.0, e));
  // teal-sapphire airglow low over the sea, and a patchy violet veil higher up
  c = mix(c, vec3(44.0, 111.0, 135.0)/255.0, 0.35*exp(-pow((e-6.0)/4.5, 2.0)));
  float veil = smoothstep(0.1, 0.6, fbm(vec2(atan(d.z, d.x)*3.0, e*0.08)+3.0, 4)) * lin(12.0, 20.0, e) * (1.0-lin(30.0, 42.0, e));
  c = mix(c, vec3(70.0, 58.0, 132.0)/255.0, 0.28*veil);
  vec2 hd = normalize(d.xz + 1e-5);
  float coreSide = pow(max(dot(hd, normalize(u_mwA.xz)), 0.0), 3.0);
  c = mix(c, vec3(96.0, 92.0, 168.0)/255.0, 0.42*exp(-max(e, 0.0)/10.0)*coreSide);
  // cooler, moonlike glow low over the far -x horizon where the train will come from
  float moonSide = pow(max(dot(hd, normalize(vec2(-0.95, -0.3))), 0.0), 4.0);
  c = mix(c, vec3(110.0, 150.0, 196.0)/255.0, 0.45*exp(-max(e, 0.0)/7.0)*moonSide);
  return c;
}

vec2 galactic(vec3 d){
  vec3 B = normalize(cross(u_mwP, u_mwA));
  float l = degrees(atan(dot(d, B), dot(d, u_mwA)));
  float b = degrees(asin(clamp(dot(d, u_mwP), -1.0, 1.0)));
  return vec2(l, b);
}

// Milky Way: colour + coverage; masks x band luminance, y dust
vec4 milkyWay(vec3 d, out vec2 masks){
  vec2 g = galactic(d);
  float l = g.x, b = g.y;
  float al = abs(l);
  float bc = 2.0*fbm(vec2(l*0.03, 1.7), 3) + 1.0*sin(l*0.028);
  float bb = b - bc;
  float w = mix(6.0, 12.5, exp(-pow(l/32.0, 2.0)));
  float prof = exp(-pow(bb/w, 2.0)*1.3);
  float halo = exp(-pow(bb/(w*2.6), 2.0));
  float bulge = exp(-pow(l/15.0, 2.0) - pow(bb/7.5, 2.0));
  float along = 0.45 + 0.55*exp(-pow(al/65.0, 2.0));
  vec2 q = vec2(l*0.08, bb*0.19);
  q += 0.65*vec2(fbm(q*0.7+3.3, 4), fbm(q*0.7+8.1, 4));
  float clump = fbm(q, 6);
  float fine = fbm(vec2(l*0.3, bb*0.5)+11.0, 4);
  float lum = prof*along*(0.5 + 0.7*clump + 0.15*fine) + 1.1*bulge*(0.75+0.45*clump);
  lum += 0.22*halo*along;
  lum += 0.3*smoothstep(0.3, 0.6, clump + 0.25*fine) * prof * along;

  // Great Rift: an irregular, patchy dark zone running from the core along +l
  float riftOn = lin(-16.0, -4.0, l) * (1.0 - lin(40.0, 85.0, l));
  float rc = 1.4 + 1.6*sin(l*0.05+0.4) + 1.0*fbm(vec2(l*0.06, 4.0), 3);
  float rw = mix(1.1, 2.4, exp(-pow(l/18.0, 2.0)));
  float zone = exp(-pow((bb - rc)/rw, 2.0)) * riftOn;
  vec2 dq = vec2(l*0.13, bb*0.42);
  dq += 0.8*vec2(fbm(dq*0.8+1.3, 4), fbm(dq*0.8+6.1, 4));
  float dustN = fbm(dq+5.0, 5);
  float patchy = smoothstep(-0.15, 0.3, dustN + 0.25*fbm(vec2(l*0.4, bb*0.9)+2.0, 3));
  float dust = smoothstep(0.2, 0.7, zone*patchy*1.2);
  float fil = ridge(vec2(l*0.07, bb*0.3)+21.0, 4);
  dust = max(dust, smoothstep(0.88, 0.97, fil + 0.1*dustN) * prof * 0.5);
  dust *= lin(0.05, 0.3, prof + bulge);

  // ramp: sapphire haze -> violet -> silver-blue body -> near-white star clouds, warm hint at the core
  vec3 col = mix(vec3(28.0, 42.0, 102.0)/255.0, vec3(62.0, 79.0, 160.0)/255.0, lin(0.0, 0.25, lum));
  col = mix(col, vec3(98.0, 96.0, 186.0)/255.0, lin(0.2, 0.42, lum));
  col = mix(col, vec3(132.0, 146.0, 210.0)/255.0, lin(0.42, 0.65, lum));
  col = mix(col, vec3(182.0, 195.0, 239.0)/255.0, lin(0.6, 0.85, lum));
  col = mix(col, vec3(226.0, 232.0, 255.0)/255.0, lin(0.85, 1.15, lum));
  col = mix(col, vec3(236.0, 236.0, 252.0)/255.0, lin(1.25, 1.8, lum));
  col = mix(col, vec3(255.0, 241.0, 230.0)/255.0, 0.5*lin(1.0, 1.6, lum) * lin(30.0, 0.0, al));
  // violet halo around the band
  col = mix(col, vec3(86.0, 70.0, 168.0)/255.0, 0.35*halo*(1.0-prof)*lin(0.05, 0.3, lum));
  float rose = smoothstep(0.5, 0.78, fbm(vec2(l*0.12, bb*0.3)+31.0, 4)+0.35*bulge) * prof * lin(70.0, 5.0, al);
  col = mix(col, vec3(206.0, 128.0, 196.0)/255.0, 0.45*rose);
  float teal = smoothstep(0.45, 0.75, fbm(vec2(l*0.08, bb*0.22)+47.0, 4)) * halo * (1.0-prof*0.5);
  col = mix(col, vec3(66.0, 128.0, 196.0)/255.0, 0.45*teal);
  float elev = degrees(asin(clamp(d.y, -1.0, 1.0)));
  float hfade = smoothstep(0.5, 9.0, elev);
  lum *= mix(0.35, 1.0, hfade);
  float cover = smoothstep(0.05, 0.85, lum)*mix(0.55, 1.0, hfade);
  vec3 dustCol = vec3(16.0, 24.0, 62.0)/255.0;
  vec3 dustEdge = vec3(110.0, 100.0, 190.0)/255.0;
  float dEdge = smoothstep(0.0, 0.45, dust) * (1.0 - smoothstep(0.45, 0.9, dust));
  col = mix(col, dustEdge, 0.45*dEdge*cover);
  col = mix(col, dustCol, 0.72*smoothstep(0.3, 1.0, dust)*cover);
  masks = vec2(lum, dust*cover);
  return vec4(col, cover);
}

// Cloud deck: long thin ribbons on a plane 1600 m up, so perspective lays them toward the horizon.
const float CLOUD_ALT = 1600.0;
float cloudDens(vec2 p){
  vec2 u = normalize(vec2(1.0, -0.42));   // ribbons run toward the far +x/-z horizon
  vec2 v = vec2(-u.y, u.x);
  float s = dot(p, u) + u_cloudShift, t = dot(p, v);
  float lane = t/2600.0;
  float id = floor(lane);
  float ft = fract(lane) - 0.5;
  float wid = mix(0.1, 0.26, hash11(id*1.7+0.3));
  float off = (hash11(id*3.1)-0.5)*0.4;
  float on = step(0.25, hash11(id*5.3+1.0));
  float env = exp(-pow((ft-off)/wid, 2.0));
  float seg = smoothstep(-0.1, 0.25, fbm(vec2(s/5200.0 + id*7.0, id), 3));
  float streak = fbm(vec2(s/2200.0, t/420.0) + id*3.0, 5);
  return on*env*seg*(0.6 + 0.9*streak) - 0.22;
}
vec4 cloudRibbons(vec3 d){
  if(d.y < 0.012) return vec4(0.0);
  vec2 p = d.xz*(CLOUD_ALT/d.y);
  float dist = length(p);
  float den = cloudDens(p);
  if(den <= -0.05) return vec4(0.0);
  float a = smoothstep(-0.02, 0.16, den);
  // lit edge on the side facing the galactic core glow, darker body
  vec2 toward = normalize(u_mwA.xz);
  float denT = cloudDens(p + toward*90.0);
  float rim = smoothstep(0.0, 0.12, den - denT);
  vec3 body = vec3(70.0, 70.0, 150.0)/255.0;
  vec3 mid = vec3(122.0, 120.0, 196.0)/255.0;
  vec3 lit = vec3(204.0, 202.0, 240.0)/255.0;
  vec3 c = mix(body, mid, smoothstep(0.05, 0.3, den));
  c = mix(c, lit, rim*0.85);
  float fade = exp(-dist/16000.0);
  float e = degrees(asin(clamp(d.y, -1.0, 1.0)));
  fade *= 1.0 - smoothstep(7.0, 12.0, e);
  return vec4(c, a*fade*0.75);
}

// Cloud banks painted into the background plate (directions/sizes supplied per shot).
#define NB 8
uniform vec4 u_bank[NB];   // xyz direction, w angular radius (radians)
uniform vec4 u_bankP[NB];  // x seed, y aspect (wide), z brightness, w on
vec4 cloudBanks(vec3 d){
  vec4 acc = vec4(0.0);
  for(int i=0;i<NB;i++){
    if(u_bankP[i].w <= 0.0) continue;
    vec3 c = normalize(u_bank[i].xyz);
    float R = u_bank[i].w;
    vec3 ex = normalize(cross(vec3(0.0,1.0,0.0), c));
    vec3 ey = cross(c, ex);
    vec2 q = vec2(dot(d, ex), dot(d, ey))/R;      // ~[-1,1] across the bank
    if(dot(d, c) < 0.0) continue;
    float seed = u_bankP[i].x;
    q.x /= u_bankP[i].y;
    // scalloped, domed top; ragged soft underside
    float n1 = fbm(q*2.2 + seed*7.0, 4), n2 = fbm(q*5.0 + seed*3.0, 3);
    float top = 0.55*(1.0 - q.x*q.x) + 0.18*sin(q.x*9.0 + seed*5.0) + 0.12*n1;
    float bot = -0.18 - 0.08*n2 + 0.1*q.x*q.x;
    float inside = smoothstep(-0.04, 0.03, top - q.y) * smoothstep(-0.12, 0.08, q.y - bot);
    inside *= smoothstep(1.05, 0.8, abs(q.x) + 0.15*n1);
    if(inside <= 0.0) continue;
    float h = (q.y - bot)/max(top - bot, 1e-3);   // 0 underside .. 1 top
    vec3 shadowC = vec3(70.0, 74.0, 140.0)/255.0;
    vec3 bodyC = vec3(126.0, 132.0, 196.0)/255.0;
    vec3 litC = vec3(198.0, 204.0, 240.0)/255.0;
    vec3 col = mix(shadowC, bodyC, smoothstep(0.08, 0.55, h + 0.08*n2));
    col = mix(col, litC, smoothstep(0.72, 0.92, h + 0.1*n1)*u_bankP[i].z);
    acc.rgb = mix(acc.rgb, col, inside);
    acc.a = max(acc.a, inside);
  }
  return acc;
}

vec4 horizonHaze(vec3 d){
  float e = degrees(asin(clamp(d.y, -1.0, 1.0)));
  float az = degrees(atan(d.z, d.x));
  float h = 2.4 + 1.4*fbm(vec2(az*0.05, 2.0), 4);
  float a = pow(1.0 - smoothstep(0.0, h, abs(e)), 1.5) * 0.8;
  vec3 c = mix(vec3(92.0, 102.0, 182.0)/255.0, vec3(158.0, 164.0, 220.0)/255.0, lin(h, 0.0, abs(e)));
  return vec4(c, a);
}

// masks: x band lum, y dust, z cloud
vec3 skyRef(vec3 d, out vec3 masks){
  vec3 c = skyGradient(d);
  vec2 mm;
  vec4 mw = milkyWay(d, mm);
  c = mix(c, mw.rgb, mw.a);
  vec4 cl = cloudRibbons(d);
  c = mix(c, cl.rgb, cl.a);
  vec4 cb = cloudBanks(d);
  cb.a *= 1.0 - 0.35*smoothstep(0.4, 1.0, mm.x);
  c = mix(c, cb.rgb, cb.a);
  cl.a = max(cl.a, cb.a);
  vec4 hz = horizonHaze(d);
  c = mix(c, hz.rgb, hz.a);
  masks = vec3(mm, cl.a);
  return c;
}

vec3 bandTangent(vec3 d){ return normalize(cross(u_mwP, d)); }
