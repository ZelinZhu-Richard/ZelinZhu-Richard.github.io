// GLSL for the instrument: one shader family with a uBrass blend.
//
// uBrass = 1 is live polished metal without ray tracing: anisotropic GGX
// specular from three analytic lights (key, rim, fill), a procedural
// gradient environment seen in the reflection (a bent normal stretches it
// across the machining streaks), warm brass / dark bronze / blued steel bases
// with tarnish, patina in the crevices from the baked per-vertex occlusion,
// fine turning and brushing streaks along each part, the engraved
// graduations and ribbons as dark grooves, and the creases as lit chamfers.
//
// uBrass = 0 is exactly the approved engraved look (sketches/instrument/
// materials.js): a dark solid fill with pale hatching whose width follows the
// light, a hairline cross-hatch in the darkest tone, screen-stable hatch
// octaves that melt into their mean tone instead of aliasing, bare flat
// faces, inverted-hull outlines and crease ribbons, and up close (uMacro) the
// machined-metal fallback.
//
// In between it is one material, not a cross-fade: the metal's body (its
// environment reflection) dims first; its highlights hold longer and pale
// toward the ink as they go; the hatching grows in from hairlines along the
// same light (it is drawn from the same tone), and the outlines widen from
// nothing. At 0.5 the object reads as dimmed metal being engraved.
//
// All colours are linear. Nothing writes the canvas: acts draw into their
// own linear HDR targets.

const VIEW = /* glsl */ `
uniform vec2 uRes;
uniform float uDpr;
uniform float uFootK;
uniform float uFootOrtho;
uniform float uRefDist;
uniform float uScale;
uniform mat4 uRootInv;
uniform vec2 uAcross;
`;

const LOOK = /* glsl */ `
uniform float uBrass;
uniform float uFarMetal;
uniform float uSpacing;
uniform float uInkScale;
uniform float uDarkScale;
uniform float uOutline;
uniform float uWidthK;
uniform vec2 uMacro;
uniform float uBevelW;
uniform float uBrush;
uniform vec2 uFog;
uniform vec3 uFogCol;
uniform float uTier;
uniform vec3 uNight;
uniform vec3 uStage;
uniform vec3 uInk;
uniform vec3 uMuted;
uniform vec3 uFaint;
uniform vec3 uLine;
uniform vec3 uShade;
uniform vec3 uMetal[4];
uniform vec4 uRough;
uniform vec3 uPatina;
`;

const LIGHT = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform float uKeyI;
uniform float uKeyPoint;
uniform vec3 uKeyPos;
uniform float uKeyRange;
uniform vec3 uSpotDir;
uniform vec2 uSpotCos;
uniform vec3 uFillDir;
uniform float uFillI;
uniform vec3 uFillCol;
uniform float uAmb;
uniform vec3 uAmbCol;
uniform float uRim;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uEnvRim;
`;

const BLEND = /* glsl */ `
// how far each layer is in, from uBrass
float metalK() { return smoothstep(0.35, 0.95, uBrass); }
float glintK() { return smoothstep(0.2, 0.9, uBrass); }
float inkK() { return 1.0 - smoothstep(0.25, 0.8, uBrass); }
`;

const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
`;

const LIGHTING = /* glsl */ `
vec3 viewDirW(vec3 P) {
  return isOrthographic ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])) : normalize(cameraPosition - P);
}
vec3 keyDirAt(vec3 P) {
  return uKeyPoint > 0.5 ? normalize(uKeyPos - P) : uKeyDir;
}
// the key's falloff: a lamp loses light with distance and outside its cone
float keyAtt(vec3 P) {
  if (uKeyPoint < 0.5) return 1.0;
  vec3 d = uKeyPos - P;
  float l2 = max(dot(d, d), 1e-8);
  float att = uKeyRange * uKeyRange / (uKeyRange * uKeyRange + l2);
  float cone = smoothstep(uSpotCos.x, uSpotCos.y, dot(-d * inversesqrt(l2), uSpotDir));
  return att * cone;
}
// the engraving's tone in 0..1 (the approved toneAt, without the shadow map;
// baked occlusion takes its place in the crevices)
float toneAt(vec3 N, vec3 V, vec3 P, float albedo, float ao) {
  vec3 L = keyDirAt(P);
  float key = max(dot(N, L), 0.0) * keyAtt(P);
  float fill = max(dot(N, uFillDir), 0.0);
  float nv = clamp(dot(N, V), 0.0, 1.0);
  float rim = pow(1.0 - nv, 3.0);
  float t = uKeyI * key + uFillI * fill + uAmb + uRim * rim * (1.0 - key);
  t *= mix(0.6, 1.0, ao);
  return clamp(t * albedo, 0.0, 1.0);
}

// ---- metal ----
float D_aniso(float at, float ab, float NoH, float ToH, float BoH) {
  float a2 = at * ab;
  vec3 d = vec3(ab * ToH, at * BoH, a2 * NoH);
  float d2 = dot(d, d);
  float w2 = a2 / max(d2, 1e-9);
  return a2 * w2 * w2 * 0.3183099;
}
float V_smith(float a, float NoV, float NoL) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
vec3 F_schlick(vec3 F0, float VoH) {
  float f = pow(1.0 - VoH, 5.0);
  return F0 + (vec3(1.0) - F0) * f;
}
vec3 specLight(vec3 N, vec3 V, vec3 T, vec3 B, vec3 L, vec3 F0, float at, float ab, vec3 radiance) {
  float NoL = dot(N, L);
  if (NoL <= 0.0) return vec3(0.0);
  vec3 H = normalize(L + V);
  float NoV = max(dot(N, V), 1e-4);
  float NoH = max(dot(N, H), 0.0);
  float D = D_aniso(at, ab, NoH, dot(T, H), dot(B, H));
  float Vis = V_smith(sqrt(at * ab), NoV, NoL);
  vec3 F = F_schlick(F0, max(dot(V, H), 0.0));
  return min(D * Vis, 60.0) * F * NoL * radiance;
}
// a small procedural environment: ground below, sky above, a brighter band
// at the horizon (a window line), a soft strip toward the rim light; wider
// and softer for rougher metal
vec3 envColor(vec3 R, float rough) {
  float w = 0.06 + rough * 0.9;
  vec3 c = mix(uGround, uSky, smoothstep(-w, w, R.y));
  c += uSky * 0.55 * exp(-R.y * R.y / (0.008 + 0.3 * rough * rough));
  float rr = max(dot(R, uRimDir), 0.0);
  c += uEnvRim * pow(rr, mix(60.0, 3.0, rough)) * mix(2.2, 0.5, rough);
  vec3 Lk = uKeyDir;
  c += uKeyCol * 0.06 * pow(max(dot(R, Lk), 0.0), mix(40.0, 2.0, rough));
  return c;
}
vec3 envBRDF(vec3 F0, float rough, float NoV) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
  return F0 * AB.x + AB.y;
}
// Live metal: returns the body (environment, ambient) and the glints
// (analytic lights) separately so the blend can dim them at different rates.
// T runs along the machining grooves.
void metalShade(vec3 N, vec3 V, vec3 T, vec3 P, vec3 F0, vec3 F0g, float rough, float ao, out vec3 body, out vec3 glints) {
  vec3 B = normalize(cross(N, T));
  float a = max(rough * rough, 0.002);
  float at = max(a * 0.45, 0.002);
  float ab = max(a * 1.6, 0.004);
  vec3 Lk = keyDirAt(P);
  glints = specLight(N, V, T, B, Lk, F0g, at, ab, uKeyCol * keyAtt(P));
  glints += specLight(N, V, T, B, uRimDir, F0g, at * 1.6, ab * 1.6, uRimCol);
  glints += specLight(N, V, T, B, uFillDir, F0g, at * 3.0, ab * 3.0, uFillCol);
  glints *= mix(0.5, 1.0, ao);
  float NoV = clamp(dot(N, V), 1e-4, 1.0);
  // bend the reflection across the grooves (Filament's anisotropic lookup)
  vec3 aT = cross(T, V);
  vec3 aN = cross(aT, T);
  vec3 bent = normalize(mix(N, aN, 0.55 * clamp(5.0 * rough, 0.0, 1.0)));
  vec3 R = reflect(-V, bent);
  body = envColor(R, clamp(rough * 1.15, 0.03, 1.0)) * envBRDF(F0, rough, NoV) * mix(0.3, 1.0, ao);
  body += F0 * uAmbCol * uAmb * ao;
}
`;

// Screen-stable hatching, verbatim from the approved materials.js.
const HATCH = /* glsl */ `
float markCov(float d, float spx, float hw) {
  float h = max(hw, 0.5);
  float c = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(hw * 2.0, 0.0, 1.0);
  float mean = clamp(2.0 * hw / max(spx, 1e-4), 0.0, 1.0);
  return mix(c, mean, 1.0 - smoothstep(2.4 * uDpr, 3.4 * uDpr, spx));
}
float lineSet(float u, float s, float g, float hw, float S) {
  float spx = s / max(g, 1e-9);
  float d = abs(fract(u / s + 0.5) - 0.5) * spx;
  float k = clamp(sqrt(spx / (1.5 * S)), 0.82, 1.22);
  return markCov(d, spx, hw * k);
}
float hatchOct(float u, float g, float S, float hw) {
  if (g < 1e-8) return 0.0;
  float L = log2(max(S * g, 1e-12));
  float Li = floor(L);
  float f = L - Li;
  float s = exp2(Li + 1.0);
  return mix(lineSet(u, s, g, hw, S), lineSet(u, 2.0 * s, g, hw, S), smoothstep(0.5, 1.0, f));
}
float tickMark(float u, float g, float t, float gt, float len, float hw) {
  float spx = 1.0 / max(g, 1e-9);
  float d = abs(fract(u + 0.5) - 0.5) * spx;
  float h = max(hw, 0.5);
  float c = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(hw * 2.0, 0.0, 1.0);
  float m = clamp((len - t) / gt + 0.5, 0.0, 1.0);
  return c * m * smoothstep(3.0 * uDpr, 5.0 * uDpr, spx);
}
`;

// ------------------------------------------------------------------ solid ---

export const SOLID_VERT = /* glsl */ `
attribute vec2 aHatch;
attribute vec2 aTick;
attribute vec4 aMat;
#ifdef BONES
attribute float aBone;
uniform mat4 uBones[6];
#endif
uniform mat4 uRootInv;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vLPos;
varying vec3 vLNrm;
varying vec3 vObj;
varying vec2 vHatch;
varying vec2 vTick;
varying vec4 vMat;
varying float vDist;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
#ifdef BONES
  mat4 Bm = uBones[int(aBone + 0.5)];
  p = Bm * p;
  n = mat3(Bm) * n;
#endif
  vec4 wp = modelMatrix * p;
  vWPos = wp.xyz;
  vWNrm = normalize(mat3(modelMatrix) * n);
  vLPos = (uRootInv * wp).xyz;
  vLNrm = normalize(mat3(uRootInv) * vWNrm);
  vObj = position;
  vHatch = aHatch;
  vTick = aTick;
  vMat = aMat;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const SOLID_FRAG = /* glsl */ `
${VIEW}
${LOOK}
${LIGHT}
${BLEND}
${NOISE}
${LIGHTING}
${HATCH}
uniform float uAccentOn;
uniform vec3 uAccentCol;
#ifdef SHELL
uniform vec3 uBandN[3];
uniform float uBandS;
#endif
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vLPos;
varying vec3 vLNrm;
varying vec3 vObj;
varying vec2 vHatch;
varying vec2 vTick;
varying vec4 vMat;
varying float vDist;

// Near metal for the engraved look up close (approved materials.js): a clean
// tone ramp, brushing streaks along the part, an anisotropic sheen across them.
vec3 nearMetal(vec3 N, vec3 V, vec3 T, float tone, float sa, float sb, float sga, float acc) {
  float pa = 0.0009;
  float pl = 0.05;
  float n1 = vnoise(vec3(sa / pa, sb / pl, 3.1));
  float n2 = vnoise(vec3(sa / (pa * 0.37) + 17.0, sb / (pl * 0.55), 7.7));
  float f1 = smoothstep(1.3, 3.2, pa / sga);
  float f2 = smoothstep(1.3, 3.2, pa * 0.37 / sga);
  float br = ((n1 - 0.5) * f1 * 1.3 + (n2 - 0.5) * f2 * 0.7) * uBrush;
  vec3 lo = mix(uStage, mix(uNight, uLine, 0.7), smoothstep(0.0, 0.3, tone));
  vec3 metal = mix(lo, mix(uLine, uMuted, 0.3), smoothstep(0.25, 1.0, tone));
  metal *= 1.0 + 0.16 * br;
  float k = uKeyI * max(dot(N, keyDirAt(vWPos)), 0.0) * keyAtt(vWPos);
  vec3 Hk = normalize(keyDirAt(vWPos) + V);
  float tk = dot(T, Hk);
  float sk = pow(sqrt(max(1.0 - tk * tk, 0.0)), 72.0) * k;
  vec3 Hf = normalize(uFillDir + V);
  float tf = dot(T, Hf);
  float sf = pow(sqrt(max(1.0 - tf * tf, 0.0)), 20.0) * uFillI * max(dot(N, uFillDir), 0.0);
  float lobe = pow(max(dot(N, Hk), 0.0), 20.0) * k;
  float streak = clamp(1.0 + 0.9 * br, 0.2, 1.9);
  metal += uInk * ((0.3 * sk + 0.55 * sf) * streak + 0.1 * lobe);
  metal = mix(metal, uAccentCol * (0.3 + 0.7 * smoothstep(0.1, 0.9, tone)), 0.85 * acc);
  return metal;
}

void main() {
  float code = floor(vMat.x + 0.5);
  float variant = mod(code, 8.0);
  float flags = floor(code / 8.0 + 0.01);
  float fBare = mod(flags, 2.0);
  float fTicks = mod(floor(flags * 0.5 + 0.01), 2.0);
  float fAcc = mod(floor(flags * 0.25 + 0.01), 2.0);
  float albedo = vMat.y;
  float hwK = vMat.z;
  float ao = clamp(vMat.w, 0.0, 1.0);
  float acc = fAcc * uAccentOn;

  vec3 N = normalize(vWNrm);
  vec3 V = viewDirW(vWPos);
  vec3 NL = normalize(vLNrm);
  float tone = max(toneAt(N, V, vWPos, albedo, ao), 0.5 * acc);

  // every derivative, in uniform control flow
  vec3 dpx = dFdx(vWPos);
  vec3 dpy = dFdy(vWPos);
  vec3 dNx = dFdx(N);
  vec3 dNy = dFdy(N);
  vec2 dhx = vec2(dFdx(vHatch.x), dFdy(vHatch.x));
  vec2 dhy = vec2(dFdx(vHatch.y), dFdy(vHatch.y));
  bool bareFace = fBare > 0.5 && abs(NL.y) > 0.985;
  // bare faces show only hairlines in shadow, run 35 deg off the view
  vec2 gd = vec2(uAcross.x * 0.819 - uAcross.y * 0.574, uAcross.x * 0.574 + uAcross.y * 0.819);
  vec2 hp = vec2(dot(vLPos.xz, gd), dot(vLPos.xz, vec2(-gd.y, gd.x)));
  vec2 h = bareFace ? hp : vHatch;
  float gu = length(vec2(dFdx(h.x), dFdy(h.x)));
  float gv = length(vec2(dFdx(h.y), dFdy(h.y)));
  float ga = length(vec2(dFdx(vTick.x), dFdy(vTick.x)));
  float gt = max(length(vec2(dFdx(vTick.y), dFdy(vTick.y))), 1e-6);
#ifdef SHELL
  vec3 q = normalize(vObj);
  float bandM = min(min(abs(dot(q, uBandN[0])), abs(dot(q, uBandN[1]))), abs(dot(q, uBandN[2])));
  float bandW = max(fwidth(bandM), 1e-6);
#endif

  // the machining streaks' frame: T along the grooves; sa across them and
  // sb along them in instrument units, sga = units across per device px
  vec3 nf = cross(dpx, dpy);
  float det = max(dot(nf, nf), 1e-36);
  vec3 r1 = cross(dpy, nf);
  vec3 r2 = cross(nf, dpx);
  vec3 Gu = (dhx.x * r1 + dhx.y * r2) / det;
  vec3 Gv = (dhy.x * r1 + dhy.y * r2) / det;
  float sc = max(uScale, 1e-6);
  bool swap = length(Gu) * sc > 6.0;
  float ca = swap ? vHatch.y : vHatch.x;
  float cb = swap ? vHatch.x : vHatch.y;
  vec3 Ga = swap ? Gv : Gu;
  vec3 Gb = swap ? Gu : Gv;
  float la = max(length(Ga) * sc, 1e-6);
  float lb = max(length(Gb) * sc, 1e-6);
  float sa = ca / la;
  float sb = cb / lb;
  float sga = max(length(swap ? dhy : dhx) / la, 1e-9);
  vec3 T = Gb - N * dot(Gb, N);
  T = dot(T, T) > 1e-16 * dot(Gb, Gb) + 1e-30 ? normalize(T) : normalize(cross(N, vec3(0.31, 0.9, 0.29)));

  float iK = inkK();
  float mK = metalK();
  float gK = glintK();

  // graduations (ink in the engraving, grooves in the metal)
  float wmod = clamp(uRefDist / max(vDist, 1e-3), 0.7, 1.35);
  float cT = 0.0;
  if (fTicks > 0.5 && vTick.y >= 0.0) {
    float t = vTick.y;
    float a = vTick.x;
    float hwT = 0.5 * uDpr * wmod;
    float c = tickMark(a * 12.0, ga * 12.0, t, gt, 0.62, hwT * 1.3);
    c = max(c, tickMark(a * 36.0, ga * 36.0, t, gt, 0.42, hwT));
    c = max(c, tickMark(a * 180.0, ga * 180.0, t, gt, 0.24, hwT * 0.85));
    float dl = abs(t - 0.7) / gt;
    c = max(c, clamp(hwT * 0.8 + 0.5 - dl, 0.0, 1.0) * 0.8);
    cT = c;
  }

  // ---------------------------------------------------- engraved layer ---
  // (skipped once the metal covers it completely)
  vec3 colE = uNight;
  if (mK < 0.9995) {
    float S = uSpacing * uDpr;
    float hw = hwK * uDpr * wmod * smoothstep(0.1, 0.95, tone) * mix(0.3, 1.0, iK);
    float cu = bareFace ? 0.0 : hatchOct(h.x, gu, S, hw);
    float dark = (1.0 - smoothstep(0.03, 0.24, tone)) * uDarkScale;
    float hd = 0.5 * uDpr;
    float cd = max(hatchOct(h.x, gu, S, hd), hatchOct(h.y, gv, S, hd)) * dark;
    if (!bareFace) {
      float nv = clamp(dot(N, V), 0.0, 1.0);
      float graze = smoothstep(0.06, 0.3, nv);
      float meanU = clamp(2.0 * hw / (1.5 * S), 0.0, 1.0) * 0.75;
      cu = mix(meanU, cu, graze);
      cd *= graze;
    }
    vec3 fillCol = mix(uStage, uNight, smoothstep(0.0, 0.3, tone));
    if (bareFace) fillCol = mix(fillCol, uLine, 0.42 * smoothstep(0.3, 1.0, tone));
    vec3 inkCol = mix(uShade, uInk, smoothstep(0.35, 0.9, tone));
    inkCol = mix(inkCol, uAccentCol, acc);
    colE = fillCol;
    colE = mix(colE, uLine, cd * 0.9 * iK);
    colE = mix(colE, inkCol, cu * uInkScale * iK);
    // up close: machined metal instead of a wall of hatch lines
    float foot = uFootK * mix(vDist, 1.0, uFootOrtho) / sc;
    float macro = (1.0 - smoothstep(uMacro.x, uMacro.y, foot)) * iK;
    if (macro > 0.001) colE = mix(colE, nearMetal(N, V, T, tone, sa, sb, sga, acc), macro);
    float vis = 0.3 + 0.7 * smoothstep(0.04, 0.45, tone);
    vec3 tc = mix(uFaint, uInk, smoothstep(0.05, 0.6, tone));
    tc = mix(tc, uAccentCol, acc);
    colE = mix(colE, tc, cT * uInkScale * vis * iK);
  }

  // ------------------------------------------------------- metal layer ---
  vec3 col = colE;
  if (mK + gK > 0.0005) {
    int vi = int(variant + 0.5);
    vec3 F0 = uMetal[vi];
    float rough = uRough[vi];
    // tarnish: slow variation in colour and polish
    float tn = vnoise(vLPos * 2.3) * 0.6 + vnoise(vLPos * 7.1 + 3.7) * 0.4;
    F0 *= 0.9 + 0.2 * tn;
    rough = clamp(rough + (tn - 0.5) * 0.1, 0.05, 1.0);
    // patina in the crevices
    float pat = 1.0 - smoothstep(0.22, 0.75, ao);
    F0 = mix(F0, uPatina, pat * 0.75);
    rough = mix(rough, 0.62, pat);
    // turning and brushing streaks, each octave fading before it aliases
    float n1 = vnoise(vec3(sa / 0.0035, sb / 0.06, 3.1));
    float n2 = vnoise(vec3(sa / 0.0012 + 17.0, sb / 0.03, 7.7));
    float n3 = vnoise(vec3(sa / 0.02, sb / 0.4, 1.3));
    float f1 = smoothstep(1.3, 3.2, 0.0035 / sga);
    float f2 = smoothstep(1.3, 3.2, 0.0012 / sga);
    float f3 = smoothstep(1.3, 3.2, 0.02 / sga);
    float br = ((n1 - 0.5) * f1 * 1.2 + (n2 - 0.5) * f2 * 0.7 + (n3 - 0.5) * f3 * 0.8) * uBrush;
    F0 *= 1.0 + 0.12 * br;
    rough = clamp(rough + 0.06 * br, 0.04, 1.0);
    // from across a room (uFarMetal): widen each highlight by how much the normal turns
    // within a pixel (specular anti-aliasing), so rings a pixel or two wide read as solid
    // polished metal instead of a trail of sparkles
    float nVar = 0.15 * (dot(dNx, dNx) + dot(dNy, dNy));
    float aR = rough * rough;
    rough = mix(rough, sqrt(sqrt(aR * aR + min(2.0 * nVar, 0.2))), uFarMetal);
    F0 = mix(F0, uAccentCol, 0.8 * acc);
    // as the metal fades its highlights pale toward the ink
    float g = smoothstep(0.45, 1.0, uBrass);
    vec3 F0g = mix(vec3(dot(F0, vec3(0.3, 0.5, 0.2))) * 1.3, F0, g);
    vec3 body;
    vec3 glints;
    metalShade(N, V, T, vWPos, F0, F0g, rough, ao, body, glints);
    // graduations cut into the metal: dark grooves
    float groove = 1.0 - 0.8 * cT;
    body *= groove;
    glints *= groove;
    col = mix(col, body, mK) + glints * gK;
  }

#ifdef SHELL
  // a drawn edge along the closing border
  float edge = (1.0 - smoothstep(0.6 * uDpr, 1.8 * uDpr, (uBandS - bandM) / bandW)) * step(uBandS, 0.999);
  col = mix(col, mix(col * 2.0 + uMetal[0] * 0.1, uInk, iK), edge);
#endif
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
#ifdef SHELL
  if (bandM > uBandS) discard;
#endif
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------- spheres ---
// Seven engraving laws for the seven stones (and the globe and beads), from
// the approved materials.js. p is the unit-sphere point in the sphere's own
// frame. uPatN is the density octave and uPatMix the blend to twice it, so
// the pattern refines without swimming as the sphere grows on screen. In
// brass the sphere is blued steel and the pattern a brass inlay.

export const SPHERE_FRAG = /* glsl */ `
${VIEW}
${LOOK}
${LIGHT}
${BLEND}
${LIGHTING}
uniform int uPattern;
uniform float uPatN;
uniform float uPatMix;
uniform float uSeed;
uniform float uHW;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vLPos;
varying vec3 vLNrm;
varying vec3 vObj;
varying vec2 vHatch;
varying vec2 vTick;
varying vec4 vMat;
varying float vDist;

const float PI = 3.14159265359;

float markCov(float d, float spx, float hw) {
  float h = max(hw, 0.5);
  float c = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(hw * 2.0, 0.0, 1.0);
  float mean = clamp(2.0 * hw / max(spx, 1e-4), 0.0, 1.0);
  return mix(c, mean, 1.0 - smoothstep(2.4 * uDpr, 3.4 * uDpr, spx));
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float gnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(hash33(i + vec3(0.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3(0.0, 0.0, 0.0));
  float n100 = dot(hash33(i + vec3(1.0, 0.0, 0.0)) * 2.0 - 1.0, f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(hash33(i + vec3(0.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(hash33(i + vec3(1.0, 1.0, 0.0)) * 2.0 - 1.0, f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(hash33(i + vec3(0.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(hash33(i + vec3(1.0, 0.0, 1.0)) * 2.0 - 1.0, f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(hash33(i + vec3(0.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(hash33(i + vec3(1.0, 1.0, 1.0)) * 2.0 - 1.0, f - vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float field(vec3 p) {
  vec3 q = p * 1.35 + vec3(uSeed * 1.7, uSeed * 0.3, -uSeed);
  return gnoise(q) + 0.5 * gnoise(q * 2.03 + 11.0) + 0.22 * gnoise(q * 4.1 - 7.0);
}
vec2 lineFam(float u, float gu) {
  float spx = 1.0 / max(gu, 1e-9);
  return vec2(abs(fract(u + 0.5) - 0.5) * spx, spx);
}

// coverage of the ink marks (x) and of the shadow hairlines (y) at density n
vec2 pattern(float n, vec3 p, vec3 dpx, vec3 dpy, float gp, float theta, float phi, vec2 dtheta, vec2 dphi,
             float fv, vec2 dfv, float hw, float hd, float lit) {
  float cInk = 0.0;
  float cHair = 0.0;
  if (uPattern == 0) {
    float u = theta / PI * n;
    vec2 L = lineFam(u, length(dtheta) * n / PI);
    cInk = markCov(L.x, L.y, hw);
    cHair = markCov(L.x, L.y, hd);
  } else if (uPattern == 1) {
    float K = max(floor(n * 0.7 + 0.5), 5.0);
    float y = clamp(p.y, -0.9995, 0.9995);
    float merc = 0.5 * log((1.0 + y) / (1.0 - y));
    vec2 dm = vec2(dpx.y, dpy.y) / (1.0 - y * y);
    float u = K * (phi / (2.0 * PI) + 0.55 * merc);
    vec2 du = K * (dphi / (2.0 * PI) + 0.55 * dm);
    vec2 L = lineFam(u, length(du));
    cInk = markCov(L.x, L.y, hw);
    cHair = markCov(L.x, L.y, hd);
  } else if (uPattern == 2) {
    float M = max(n * 0.5, 4.0);
    vec3 q = p * M;
    vec3 ci = floor(q);
    float best = 1e9;
    for (int x = -1; x <= 1; x++) {
      for (int yy = -1; yy <= 1; yy++) {
        for (int z = -1; z <= 1; z++) {
          vec3 cell = ci + vec3(float(x), float(yy), float(z));
          vec3 pt = cell + 0.12 + 0.76 * hash33(cell + uSeed * 17.0);
          vec3 ps = normalize(pt) * M;
          if (all(greaterThanEqual(ps, cell)) && all(lessThan(ps, cell + 1.0))) {
            best = min(best, length(q - ps));
          }
        }
      }
    }
    float spx = 1.0 / (M * gp);
    float d = best * spx;
    float rad = spx * 0.36 * sqrt(lit);
    float h = max(rad, 0.55);
    cInk = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(rad * 1.8, 0.0, 1.0);
    cInk = mix(cInk, clamp(1.4 * rad * rad / (spx * spx), 0.0, 1.0), (1.0 - smoothstep(2.4 * uDpr, 3.6 * uDpr, spx)));
    cHair = clamp(0.55 + 0.5 - d, 0.0, 1.0) * smoothstep(2.4 * uDpr, 3.6 * uDpr, spx);
  } else if (uPattern == 3) {
    float levels = max(floor(n * 0.18), 4.0);
    float fu = (fv + 1.2) * levels;
    vec2 L = lineFam(fu, length(dfv) * levels);
    float idx = floor(fu + 0.5);
    float major = 1.0 - step(0.5, abs(mod(idx, 5.0)));
    cInk = markCov(L.x, L.y, hw * mix(1.0, 1.7, major));
    cHair = markCov(L.x, L.y, hd);
  } else if (uPattern == 4) {
    vec3 A = normalize(vec3(0.82, 0.35, 0.45));
    vec3 Bv = normalize(cross(A, vec3(0.0, 1.0, 0.0)));
    float k = n * 0.4;
    float u = dot(p, A) * k;
    float v = dot(p, Bv) * k;
    vec2 Lu = lineFam(u, length(vec2(dot(dpx, A), dot(dpy, A))) * k);
    vec2 Lv = lineFam(v, length(vec2(dot(dpx, Bv), dot(dpy, Bv))) * k);
    cInk = markCov(Lu.x, Lu.y, hw);
    cHair = max(markCov(Lu.x, Lu.y, hd), markCov(Lv.x, Lv.y, hd));
  } else if (uPattern == 5) {
    float Mm = max(floor(n * 0.4 + 0.5) * 2.0, 8.0);
    float Mp = max(floor(n * 0.4 + 0.5), 4.0);
    float um = (phi / (2.0 * PI) + 0.5) * Mm;
    float up = theta / PI * Mp;
    vec2 Lm = lineFam(um, length(dphi) * Mm / (2.0 * PI));
    vec2 Lp = lineFam(up, length(dtheta) * Mp / PI);
    float eq = 1.0 - step(0.5, abs(floor(up + 0.5) - Mp * 0.5));
    cInk = max(markCov(Lm.x, Lm.y, hw), markCov(Lp.x, Lp.y, hw * mix(1.0, 1.8, eq)));
    cHair = max(markCov(Lm.x, Lm.y, hd), markCov(Lp.x, Lp.y, hd));
  } else {
    float Nd = max(floor(n * 0.55), 5.0);
    float k = floor(theta / PI * Nd);
    float thk = (k + 0.5) * PI / Nd;
    float m = max(floor(2.0 * Nd * sin(thk) + 0.5), 1.0);
    float p01 = phi / (2.0 * PI) + 0.5 + mod(k, 2.0) * 0.5 / m;
    float j = floor(p01 * m);
    float dphiC = (p01 - (j + 0.5) / m) * 2.0 * PI;
    float dist = sqrt((theta - thk) * (theta - thk) + sin(theta) * sin(theta) * dphiC * dphiC);
    float spx = (PI / Nd) / gp;
    float d = dist / gp;
    float rad = spx * 0.4 * sqrt(lit);
    float h = max(rad, 0.55);
    cInk = clamp(h + 0.5 - d, 0.0, 1.0) * clamp(rad * 1.8, 0.0, 1.0);
    cInk = mix(cInk, clamp(0.5 * rad * rad / (spx * spx), 0.0, 1.0), (1.0 - smoothstep(2.4 * uDpr, 3.6 * uDpr, spx)));
    cHair = clamp(0.6 + 0.5 - d, 0.0, 1.0) * smoothstep(2.4 * uDpr, 3.6 * uDpr, spx);
  }
  return vec2(cInk, cHair);
}

void main() {
  vec3 N = normalize(vWNrm);
  vec3 V = viewDirW(vWPos);
  float tone = toneAt(N, V, vWPos, 1.0, 1.0);

  vec3 p = normalize(vObj);
  vec3 dpx = dFdx(p);
  vec3 dpy = dFdy(p);
  vec3 dNx = dFdx(N);
  vec3 dNy = dFdy(N);
  float gp = max(max(length(dpx), length(dpy)), 1e-7);
  float rxz0 = length(p.xz);
  float rxz = max(rxz0, 1e-5);
  float theta = atan(rxz, p.y);
  vec2 pxz = rxz0 > 1e-6 ? p.xz : vec2(1.0, 0.0);
  float phi = atan(pxz.y, pxz.x);
  float rr = p.x * p.x + p.z * p.z + 1e-9;
  vec2 dphi = vec2(p.x * dpx.z - p.z * dpx.x, p.x * dpy.z - p.z * dpy.x) / rr;
  vec2 dtheta = vec2(dFdx(theta), dFdy(theta));
  float fv = 0.0;
  vec2 dfv = vec2(0.0);
  if (uPattern == 3) {
    fv = field(p);
    dfv = vec2(dFdx(fv), dFdy(fv));
  }

  float iK = inkK();
  float mK = metalK();
  float gK = glintK();
  float wmod = clamp(uRefDist / max(vDist, 1e-3), 0.7, 1.35);
  float lit = smoothstep(0.1, 0.95, tone);
  float hw = uHW * uDpr * wmod * lit * mix(0.3, 1.0, iK);
  float hd = 0.5 * uDpr;
  // the brass inlay keeps a constant width; it does not follow the light
  float hwB = 0.55 * uDpr * wmod;
  float litB = 0.7;

  vec2 c = pattern(uPatN, p, dpx, dpy, gp, theta, phi, dtheta, dphi, fv, dfv, hw, hd, lit);
  vec2 cB = pattern(uPatN, p, dpx, dpy, gp, theta, phi, dtheta, dphi, fv, dfv, hwB, hd, litB);
  if (uPatMix > 0.001) {
    vec2 c2 = pattern(uPatN * 2.0, p, dpx, dpy, gp, theta, phi, dtheta, dphi, fv, dfv, hw, hd, lit);
    vec2 cB2 = pattern(uPatN * 2.0, p, dpx, dpy, gp, theta, phi, dtheta, dphi, fv, dfv, hwB, hd, litB);
    c = mix(c, c2, uPatMix);
    cB = mix(cB, cB2, uPatMix);
  }

  float dark = (1.0 - smoothstep(0.04, 0.3, tone)) * uDarkScale;
  vec3 fillCol = mix(uStage, uNight, smoothstep(0.0, 0.3, tone));
  vec3 inkCol = mix(uShade, uInk, smoothstep(0.35, 0.9, tone));
  vec3 col = fillCol;
  col = mix(col, uLine, c.y * dark * iK);
  col = mix(col, inkCol, c.x * uInkScale * iK);

  if (mK + gK > 0.0005) {
    // blued steel inlaid with brass along the engraving
    float inlay = clamp(cB.x * 1.2, 0.0, 1.0);
    vec3 F0 = mix(uMetal[3], uMetal[0], inlay);
    float rough = mix(uRough.w, uRough.x, inlay);
    // from across a room: specular anti-aliasing, as the solid parts (small beads stay round, not a sparkle)
    float nVar = 0.15 * (dot(dNx, dNx) + dot(dNy, dNy));
    float aR = rough * rough;
    rough = mix(rough, sqrt(sqrt(aR * aR + min(2.0 * nVar, 0.2))), uFarMetal);
    float g = smoothstep(0.45, 1.0, uBrass);
    vec3 F0g = mix(vec3(dot(F0, vec3(0.3, 0.5, 0.2))) * 1.3, F0, g);
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-4, 0.0, 0.0));
    vec3 body;
    vec3 glints;
    metalShade(N, V, T, vWPos, F0, F0g, rough, 1.0, body, glints);
    col = mix(col, body, mK) + glints * gK;
  }
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
  gl_FragColor = vec4(col, 1.0);
}
`;

// -------------------------------------------------------------------- hull ---

export const HULL_VERT = /* glsl */ `
attribute vec4 aOnormal;
attribute vec4 aMat;
#ifdef BONES
attribute float aBone;
uniform mat4 uBones[6];
#endif
uniform vec2 uRes;
uniform float uDpr;
uniform float uWidthK;
uniform float uRefDist;
uniform float uBrass;
varying float vDist;
varying float vTone;
varying float vAcc;
varying vec3 vObj;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 on = aOnormal.xyz;
#ifdef BONES
  mat4 Bm = uBones[int(aBone + 0.5)];
  p = Bm * p;
  on = mat3(Bm) * on;
#endif
  vObj = position;
  vec4 mv = modelViewMatrix * p;
  vec3 n = normalize(normalMatrix * on);
  vDist = length(mv.xyz);
  vec4 c0 = projectionMatrix * mv;
  vec4 c1 = projectionMatrix * vec4(mv.xyz + n * (0.01 * max(-mv.z, 0.01)), 1.0);
  vec2 s0 = c0.xy / c0.w;
  vec2 s1 = c1.xy / c1.w;
  vec2 dpx = (s1 - s0) * uRes;
  float l = length(dpx);
  vec2 dir = l > 1e-6 ? dpx / l : vec2(0.0);
  // outlines grow in with the ink as the brass fades
  float ik = 1.0 - smoothstep(0.25, 0.8, uBrass);
  float w = aOnormal.w * uWidthK * uDpr * clamp(uRefDist / max(vDist, 1e-3), 0.6, 1.4) * ik;
  c0.xy += dir * w * 2.0 / uRes * c0.w;
  gl_Position = c0;
  float code = floor(aMat.x + 0.5);
  vAcc = mod(floor(floor(code / 8.0 + 0.01) * 0.25 + 0.01), 2.0);
  vTone = clamp((aOnormal.w - 1.0) / 0.5, 0.0, 1.0);
}
`;

export const HULL_FRAG = /* glsl */ `
uniform vec3 uNight;
uniform vec3 uInk;
uniform vec3 uMuted;
uniform vec3 uFogCol;
uniform vec2 uFog;
uniform float uOutline;
uniform float uAccentOn;
uniform vec3 uAccentCol;
#ifdef SHELL
uniform vec3 uBandN[3];
uniform float uBandS;
#endif
varying float vDist;
varying float vTone;
varying float vAcc;
varying vec3 vObj;
void main() {
  vec3 c = mix(uMuted, uInk, mix(0.8, 1.0, vTone));
  float k = uOutline;
  float a = vAcc * uAccentOn;
  c = mix(c, uAccentCol, a);
  k = mix(k, 1.0, a);
  c = mix(uNight, c, k);
  c = mix(c, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
#ifdef SHELL
  vec3 q = normalize(vObj);
  float bandM = min(min(abs(dot(q, uBandN[0])), abs(dot(q, uBandN[1]))), abs(dot(q, uBandN[2])));
  if (bandM > uBandS) discard;
#endif
  gl_FragColor = vec4(c, 1.0);
}
`;

// ----------------------------------------------------------------- ribbons ---
// One instanced quad per segment, expanded in screen space, culled when both
// faces look away (approved LINE_VERT). In brass a crease becomes a lit
// chamfer of fixed width in instrument units and a printed line a dark
// groove; in between, the two are composited by the ink weight.

export const LINE_VERT = /* glsl */ `
attribute vec3 iA;
attribute vec3 iB;
attribute vec3 iNA;
attribute vec3 iNB;
attribute vec4 iP;
#ifdef DRAW
attribute vec2 iO;
uniform float uDraw;
uniform float uGhost;
#endif
#ifdef BONES
uniform mat4 uBones[6];
#endif
${VIEW}
${LOOK}
${LIGHT}
uniform float uNear;
uniform float uBias;
uniform vec4 uRule;
uniform float uAccentOn;
uniform vec3 uAccentCol;
varying float vDist;
varying float vFadeW;
varying float vAcross;
varying float vBevel;
varying vec3 vCol;
varying float vAlpha;

// the alidade's half width at x along it (rete.js ruleHW, ASTRO.alidade)
float ruleHW(float x) {
  float w = 0.012 + (0.04 - 0.012) * pow(1.0 - min(1.0, x / 0.985), 1.4);
  return max(w, sqrt(max(0.0, 0.04 - x * x)));
}
bool underRule(vec3 m) {
  vec2 q = vec2(m.x, -m.z);
  vec2 r = vec2(uRule.x * q.x + uRule.y * q.y, -uRule.y * q.x + uRule.x * q.y);
  float x = abs(r.x);
  if (x > 1.015) return false;
  float w = x > 0.985 ? 0.012 * (1.0 - (x - 0.985) / 0.03) : ruleHW(x);
  bool vane = abs(x - 0.6) < 0.013 && abs(r.y) < 0.054;
  return abs(r.y) < w + 0.004 || vane;
}
void hide() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vDist = 0.0;
  vFadeW = 0.0;
  vAcross = 0.0;
  vBevel = 0.0;
  vCol = vec3(0.0);
  vAlpha = 0.0;
}

void main() {
  vAcross = position.y;
  vBevel = 0.0;
  float code = floor(iP.w + 0.5);
  float flags = mod(code, 8.0);
  vec3 A = iA;
  vec3 Bp = iB;
  vec3 nA = iNA;
  vec3 nB = iNB;
#ifdef BONES
  mat4 Bm = uBones[int(floor(code / 8.0 + 0.01))];
  A = (Bm * vec4(A, 1.0)).xyz;
  Bp = (Bm * vec4(Bp, 1.0)).xyz;
  nA = mat3(Bm) * nA;
  nB = mat3(Bm) * nB;
#endif
  bool hasA = dot(iNA, iNA) > 0.25;
  bool hasB = dot(iNB, iNB) > 0.25;
  if (uRule.z > 0.5 && mod(flags, 2.0) > 0.5 && underRule(0.5 * (A + Bp))) { hide(); return; }
  float alphaK = 1.0;
#ifdef DRAW
  if (uDraw <= iO.x) { hide(); return; }
  float tEnd = clamp((uDraw - iO.x) / max(iO.y - iO.x, 1e-6), 0.0, 1.0);
  Bp = mix(A, Bp, tEnd);
  float plateOnly = mod(floor(flags * 0.5 + 0.01), 2.0);
  float ghostOnly = mod(floor(flags * 0.25 + 0.01), 2.0);
  alphaK = plateOnly > 0.5 ? 1.0 - uGhost : (ghostOnly > 0.5 ? uGhost : 1.0);
  if (alphaK < 0.004) { hide(); return; }
#endif
  vec3 wa = (modelMatrix * vec4(A, 1.0)).xyz;
  vec3 wb = (modelMatrix * vec4(Bp, 1.0)).xyz;
  vec3 na = hasA ? normalize(mat3(modelMatrix) * nA) : vec3(0.0);
  vec3 nb = hasB ? normalize(mat3(modelMatrix) * nB) : vec3(0.0);
  vec3 mid = 0.5 * (wa + wb);
  vec3 toCam = isOrthographic ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])) : normalize(cameraPosition - mid);
  if ((hasA || hasB) && max(dot(na, toCam), dot(nb, toCam)) < -0.03) { hide(); return; }

  vec4 va = viewMatrix * vec4(wa, 1.0);
  vec4 vb = viewMatrix * vec4(wb, 1.0);
  float zn = -uNear * 1.05;
  if (va.z > zn && vb.z > zn) { hide(); return; }
  if (va.z > zn) va = mix(va, vb, (zn - va.z) / (vb.z - va.z));
  if (vb.z > zn) vb = mix(vb, va, (zn - vb.z) / (va.z - vb.z));
  float t = position.x;
  vec4 vp = mix(va, vb, t);
  vDist = length(vp.xyz);
  vec4 ca = projectionMatrix * va;
  vec4 cb = projectionMatrix * vb;
  vec2 sa = ca.xy / ca.w * uRes * 0.5;
  vec2 sb = cb.xy / cb.w * uRes * 0.5;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  float iK = 1.0 - smoothstep(0.25, 0.8, uBrass);
  float tone = iP.y;
  bool crease = hasA && hasB && dot(na, nb) < 0.985;
  vec3 P = mix(wa, wb, t);
  vec3 Vv = isOrthographic ? toCam : normalize(cameraPosition - P);
  vec3 L = uKeyPoint > 0.5 ? normalize(uKeyPos - P) : uKeyDir;
  float foot = uFootK * mix(vDist, 1.0, uFootOrtho) / max(uScale, 1e-6);

  // engraved: the approved ink ribbon, up close a lit chamfer
  float wE = iP.x * uWidthK * uDpr * clamp(uRefDist / max(vDist, 1e-3), 0.55, 1.45);
  vec3 cE = tone < 0.0 ? mix(uLine, uFaint, -tone) : mix(uFaint, uInk, tone);
  float nearK = 1.0 - smoothstep(uMacro.x, uMacro.y, foot);
  if (crease && nearK > 0.001) {
    vec3 bn = normalize(na + nb);
    float glint = pow(max(dot(bn, normalize(L + Vv)), 0.0), 4.0);
    float lit = clamp(uKeyI * (0.5 * max(dot(bn, L), 0.0) + 0.9 * glint) + 1.2 * uFillI * max(dot(bn, uFillDir), 0.0) + uAmb + 0.08, 0.0, 1.0);
    vec3 bev = mix(mix(uLine, uFaint, 0.2) * 0.7, uInk, smoothstep(0.04, 0.8, lit));
    cE = mix(cE, bev, nearK);
    float wBev = min(uBevelW / max(foot, 1e-7), 14.0) * uDpr;
    wE = mix(wE, max(wE, wBev), nearK);
    vBevel = nearK * iK;
  }
  float aE = uOutline;

  // brass: a polished chamfer on a crease, a dark groove for a printed line
  vec3 cB;
  float aB;
  float wB;
  if (crease) {
    vec3 bn = normalize(na + nb);
    float gk = pow(max(dot(bn, normalize(L + Vv)), 0.0), 28.0);
    float gr = pow(max(dot(bn, normalize(uRimDir + Vv)), 0.0), 18.0);
    vec3 R = reflect(-Vv, bn);
    vec3 env = mix(uGround, uSky, smoothstep(-0.25, 0.25, R.y));
    float att = 1.0;
    if (uKeyPoint > 0.5) {
      vec3 dl = uKeyPos - P;
      att = uKeyRange * uKeyRange / (uKeyRange * uKeyRange + dot(dl, dl));
    }
    cB = uMetal[0] * (uKeyCol * att * gk * 2.0 + uRimCol * gr * 1.4 + env * 0.9 + uAmbCol * uAmb);
    wB = min(0.012 / max(foot, 1e-7), 6.0) * uDpr;
    // an edge that catches no light melts into the metal (no ink outlines on brass)
    aB = clamp(dot(cB, vec3(0.3, 0.5, 0.2)) * 3.0, 0.0, 0.9);
    // from across a room (uFarMetal) a chamfer under a pixel or so is already in the
    // solid's own shading: drawn at the 1 px minimum it read as a pale wireframe
    aB *= mix(1.0, smoothstep(0.8 * uDpr, 2.0 * uDpr, wB), uFarMetal);
  } else {
    cB = uMetal[0] * 0.035;
    wB = wE * 0.8;
    aB = 0.8;
    // from across a room a printed line is a groove of fixed width in the metal
    // (0.006 units, about 0.4 mm on the desk): under a pixel it is gone, not a dark stroke
    float wG = min(0.006 / max(foot, 1e-7), 6.0) * uDpr;
    wB = mix(wB, min(wB, wG), uFarMetal);
    aB *= mix(1.0, smoothstep(0.5 * uDpr, 1.5 * uDpr, wG), uFarMetal);
  }
  // composite brass and ink by the ink weight
  float wE2 = iK * aE;
  float wB2 = (1.0 - iK) * aB;
  float alpha = wE2 + wB2;
  vec3 col = (cE * wE2 + cB * wB2) / max(alpha, 1e-4);
  float wWant = mix(wB, wE, iK);
  float acc = iP.z * uAccentOn;
  col = mix(col, uAccentCol, acc);
  alpha = mix(alpha, 1.0, acc);
  vCol = col;
  vAlpha = alpha * alphaK;

  float w = max(wWant, 1.0);
  vFadeW = clamp(wWant, 0.0, 1.0);
  float hw = 0.5 * w;
  vec4 vq = vp;
  if (uFootOrtho > 0.5) vq.z += uBias * abs(vq.z);
  else vq.xyz *= (1.0 - uBias);
  vec4 c = projectionMatrix * vec4(vq.xyz, 1.0);
  vec2 off = nrm * position.y * hw + dir * (t * 2.0 - 1.0) * hw;
  c.xy += off * 2.0 / uRes * c.w;
  gl_Position = c;
}
`;

export const LINE_FRAG = /* glsl */ `
uniform vec3 uFogCol;
uniform vec2 uFog;
varying float vDist;
varying float vFadeW;
varying float vAcross;
varying float vBevel;
varying vec3 vCol;
varying float vAlpha;
void main() {
  vec3 c = vCol;
  // a lit chamfer is a touch brighter along its crown
  c *= mix(1.0, 0.8 + 0.2 * (1.0 - abs(vAcross)), vBevel);
  c = mix(c, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
  float a = vAlpha * vFadeW;
  if (a < 0.002) discard;
  gl_FragColor = vec4(c, a);
}
`;
