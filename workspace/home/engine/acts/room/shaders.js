// GLSL for the room act. Pure strings (no imports). The backdrop, floor, sea and mirror
// blur are sketches/room/room.js and reflect.js (checked in a browser there; the floor now
// follows the room's light front); the light front, the lamp pool, the contact shadow and
// the dust motes are new.
//
// Every program here draws into a linear HalfFloat target: nothing is tone mapped or
// encoded; engine/post finish() encodes once.

// A full-screen backdrop: the outside (sky, coast, city, sea) drawn first in the room
// passes, behind everything (no depth test or write), sampled 1:1 by screen position.
export const BG_VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
export const BG_FRAG = /* glsl */ `
uniform sampler2D tBg;
uniform vec2 uInvRes;
void main() {
  gl_FragColor = vec4(texture2D(tBg, gl_FragCoord.xy * uInvRes).rgb, 1.0);
}
`;

export const FLOOR_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// The polished stone floor: baked colour plus the planar reflection. Tiles, joints and
// per-tile roughness follow floor_stone() in room_materials.py (1.2 m tiles, half-bond
// rows, roughness 0.08 to 0.25, in the Floor object's space: origin at Blender (0, 3.5)).
export const FLOOR_FRAG = /* glsl */ `
uniform sampler2D map;
uniform sampler2D tRefl;
uniform sampler2D tReflBlur;
uniform vec3 uLampPos;
uniform vec4 uFront;
uniform vec3 uNight;
uniform vec2 uInvRes;
uniform float uRefl;
varying vec2 vUv;
varying vec3 vWorld;
// the light front (as POOL_FRAG): night until the room's lights reach this tile
float roomFront(float d) {
  float x = clamp((uFront.x - uFront.y - uFront.z * min(d, 9.6)) / uFront.w, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 base = texture2D(map, vUv).rgb * mix(uNight, vec3(1.0), roomFront(length(vWorld - uLampPos)));
  // Blender object space of the Floor box: x = three x, y = -three z - 3.5
  vec2 o = vec2(vWorld.x, -vWorld.z - 3.5);
  float tile = 1.2;
  float row = floor(o.y / tile);
  float xs = o.x + mod(row, 2.0) * 0.5 * tile;
  vec2 id = vec2(floor(xs / tile), row);
  vec2 f = vec2(fract(xs / tile), fract(o.y / tile));
  vec2 e = min(f, 1.0 - f) * tile;
  float edge = min(e.x, e.y);
  // a 3.5 mm joint, antialiased by its screen footprint
  float fw = max(fwidth(edge), 1e-4);
  float joint = 1.0 - smoothstep(0.0012, 0.0012 + 1.5 * fw, edge);
  float th = hash12(id + 4.0);
  // roughness wanders inside a tile and from tile to tile (0.08 .. 0.25)
  float rough = mix(0.08, 0.25, clamp(0.55 * th + 0.6 * vnoise(o * 1.6 + th * 7.0) - 0.1, 0.0, 1.0));
  vec3 col = base * (1.0 - 0.45 * joint);
  if (uRefl > 0.0) {
    // a very low broad bump: reflections waver a little, like real tiles
    vec2 wob = vec2(vnoise(o * 2.3 + th * 11.0), vnoise(o * 2.3 + 17.0 + th * 5.0)) - 0.5;
    vec2 suv = gl_FragCoord.xy * uInvRes + wob * 0.0035;
    vec3 sharp = texture2D(tRefl, suv).rgb;
    vec3 soft = texture2D(tReflBlur, suv).rgb;
    vec3 r = mix(sharp, soft, smoothstep(0.07, 0.2, rough));
    vec3 V = normalize(cameraPosition - vWorld);
    float c = clamp(V.y, 0.0, 1.0);
    // dielectric Fresnel (F0 0.04) plus a faint coat; rough tiles reflect a little less
    float F = 0.04 + 0.96 * pow(1.0 - c, 5.0);
    F *= mix(1.0, 0.7, smoothstep(0.1, 0.25, rough));
    col += r * F * uRefl * (1.0 - joint);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SEA_VERT = FLOOR_VERT;
// The sea far below the window: near-black water, the mirrored sky and coast streaked
// along screen y (wind ripples stretch reflections toward the viewer), ripple wobble
// shrinking with distance.
export const SEA_FRAG = /* glsl */ `
uniform sampler2D tRefl;
uniform vec2 uInvRes;
uniform vec3 uBase;
uniform float uTime;
uniform float uRefl;
varying vec2 vUv;
varying vec3 vWorld;

void main() {
  vec3 col = uBase;
  if (uRefl > 0.0) {
    vec2 uv = gl_FragCoord.xy * uInvRes;
    vec3 V = normalize(cameraPosition - vWorld);
    float c = clamp(V.y, 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - c, 5.0);
    float dist = length(vWorld.xz - cameraPosition.xz);
    float k = 1.0 / (1.0 + dist * 0.0006);
    vec2 w = vWorld.xz;
    float n1 = sin(w.x * 0.031 + 2.0 * sin(w.y * 0.07 + uTime * 0.35) + uTime * 0.27);
    float n2 = sin(w.y * 0.19 + w.x * 0.013 - uTime * 0.42);
    vec2 off = vec2(0.0035 * n1 + 0.0015 * n2, 0.0) * k;
    vec3 r = vec3(0.0);
    float tw = 0.0;
    for (int i = 0; i < 9; i++) {
      float s = (float(i) - 4.0) / 4.0;
      float wgt = exp(-2.2 * s * s);
      r += texture2D(tRefl, uv + off + vec2(0.0, s * 0.045 * k)).rgb * wgt;
      tw += wgt;
    }
    col += (r / tw) * F * uRefl;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------ mirror passes ---

export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// separable gaussian, linear-sampled: 9 fetches cover 17 texels
export const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uStep;
uniform float uW[5];
uniform float uO[5];
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * uW[0];
  for (int i = 1; i < 5; i++) {
    c += texture2D(tSrc, vUv + uStep * uO[i]).rgb * uW[i];
    c += texture2D(tSrc, vUv - uStep * uO[i]).rgb * uW[i];
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

export const COPY_FRAG = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(min(texture2D(tSrc, vUv).rgb, vec3(32.0)), 1.0);
}
`;

// --------------------------------- the light front and the lamp pool (injected) ---
// Injected into the baked atlases' MeshBasicMaterial (onBeforeCompile), so map and the
// floor mirror's clipping still work (the material colour stays white).
// The light front: the room's lights come up from the desk lamp outward, so each texel
// goes from the night level (uNight) to its baked value as the front passes it:
// t0 = start + perMetre * distance to the bulb, lit `width` later (classify.js FRONT;
// uFront = (t, start, perMetre, width)). At t = 1 every texel is exactly its bake.
// While only the desk lamp is on, the atlas cannot be relit, so the lamp's pool is the
// bake's own (lit) texel scaled by a falloff round the bulb: the desk, the instrument's
// neighbours and the window frame behind come up warm while the rest of the room stays
// at night; it gives way where the front has lit the bake. The shade throws its light
// down; the desk top stops it. uLampPool.rgb = filament colour x gain, .a = reach (m).

export const POOL_VERT_PARS = /* glsl */ `
varying vec3 vRoomW;
`;
export const POOL_VERT = /* glsl */ `
vRoomW = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;
export const POOL_FRAG_PARS = /* glsl */ `
varying vec3 vRoomW;
uniform vec3 uLampPos;
uniform vec4 uLampPool;
uniform vec4 uFront;
uniform vec3 uNight;
float roomFront(float d) {
  float x = clamp((uFront.x - uFront.y - uFront.z * min(d, 9.6)) / uFront.w, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}
`;
export const POOL_FRAG = /* glsl */ `
#ifdef USE_MAP
{
  vec3 dl = vRoomW - uLampPos;
  float d2 = max(dot(dl, dl), 1e-6);
  float lv = roomFront(sqrt(d2));
  diffuseColor.rgb *= mix(uNight, vec3(1.0), lv);
  if (uLampPool.r + uLampPool.g + uLampPool.b > 0.0 && lv < 1.0) {
    float r2 = uLampPool.a * uLampPool.a;
    float att = r2 / (r2 + d2);
    float down = smoothstep(-0.35, 0.55, -dl.y * inversesqrt(d2));
    float above = smoothstep(0.725, 0.765, vRoomW.y);
    diffuseColor.rgb += sampledDiffuseColor.rgb * uLampPool.rgb * (att * down * above * (1.0 - lv));
  }
}
#endif
`;

// ------------------------------------------------------- the contact shadow ---
// Under the live instrument's plinth (radius uShape.x, m): dark under it and just past
// its rim, then a faint occlusion out to uShape.z; nothing past the desk's front and
// right edges (uClip = (front z, right x)). Black with alpha, over the desk top.
export const CONTACT_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
export const CONTACT_FRAG = /* glsl */ `
uniform vec3 uCentre;
uniform vec4 uShape;
uniform vec2 uClip;
varying vec3 vW;
void main() {
  float r = length(vW.xz - uCentre.xz);
  float core = 1.0 - smoothstep(uShape.x - 0.4 * uShape.y, uShape.x + uShape.y, r);
  float halo = 1.0 - smoothstep(uShape.x - 0.02, uShape.z, r);
  float a = max(core, 0.32 * halo * halo) * uShape.w;
  a *= 1.0 - smoothstep(uClip.x - 0.01, uClip.x, vW.z);
  a *= 1.0 - smoothstep(uClip.y - 0.01, uClip.y, vW.x);
  if (a < 0.002) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}
`;

// ------------------------------------------------------------- dust motes ---
// Dust in the air round the desk: one point each, a few cm of slow drift. With the
// room dark they are faint cool points (the false-space beat's stars); the lamp lights
// the ones near it amber; they recede as the room lights come up.

export const DUST_VERT = /* glsl */ `
attribute float aSeed;
attribute vec3 aPhase;
uniform float uTime;
uniform float uDpr;
uniform float uAmp;
uniform float uRoom;
uniform vec3 uLampPos;
uniform vec4 uLamp;
uniform vec3 uStar;
varying vec3 vCol;
void main() {
  float t = uTime * (0.05 + 0.05 * aSeed);
  vec3 p = position + uAmp * vec3(sin(t + aPhase.x), 0.6 * sin(0.73 * t + aPhase.y), sin(0.87 * t + aPhase.z));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 1e-3);
  vec3 dl = wp.xyz - uLampPos;
  float r2 = uLamp.a * uLamp.a;
  float lit = r2 / (r2 + dot(dl, dl));
  float tw = 0.8 + 0.2 * sin(uTime * (0.5 + aSeed) + 40.0 * aSeed);
  vec3 c = uStar * (0.35 + 0.65 * aSeed * aSeed) * tw + uLamp.rgb * lit * (0.4 + 0.6 * aSeed);
  // nearer motes are brighter; very near ones (out-of-focus blobs on a real lens) fade out
  c *= clamp(0.6 / dist, 0.15, 2.0) * smoothstep(0.08, 0.2, dist) * (1.0 - 0.7 * uRoom);
  vCol = c;
  gl_PointSize = (1.1 + 1.2 * aSeed) * uDpr;
}
`;
export const DUST_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  vec2 q = gl_PointCoord - vec2(0.5);
  float a = 1.0 - smoothstep(0.18, 0.5, length(q));
  gl_FragColor = vec4(vCol, a);
}
`;

/** Every program, for a GLSL check outside the browser. */
export const SHADERS = Object.freeze({
  BG_VERT, BG_FRAG, FLOOR_VERT, FLOOR_FRAG, SEA_VERT, SEA_FRAG, QUAD_VERT, BLUR_FRAG, COPY_FRAG,
  POOL_VERT_PARS, POOL_VERT, POOL_FRAG_PARS, POOL_FRAG, CONTACT_VERT, CONTACT_FRAG, DUST_VERT, DUST_FRAG,
});
