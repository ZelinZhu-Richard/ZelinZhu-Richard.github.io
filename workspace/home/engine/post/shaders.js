// GLSL for engine/post (three ShaderMaterial conventions: three prepends
// `#version 300 es`, precision, `position`/`uv` attributes, the matrices, and
// defines `varying`, `texture2D` and `gl_FragColor`; WebGL2 only, so
// texelFetch, fwidth and integer types are core). Every float literal is
// written as a float: GLSL ES has no implicit int-to-float conversion.
// No three import, so a node script can dump these strings for an offline
// compile check.

// one full-screen triangle; vUv is 0..1 over the viewport
const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMMON = /* glsl */ `
float postLum(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
float postHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

// The two-act composer. KIND (a define, one program per kind, so no dynamic
// branching and fwidth runs in uniform control flow):
//   0 copy A (bilinear: also rescales a target that is not canvas-sized)
//   1 fade      clean linear-light crossfade
//   2 lift      A rises and grows slightly as it lifts away, uncovering B
//               behind a soft edge that follows it (uP: dir, travel, feather)
//   3 reveal    luminance-led wipe: B's brightest pixels (and their
//               neighbourhood) switch on first, its darks last, so lights
//               appear to come on (uP: soft, spread, log2 lum lo, log2 lum hi)
//   4 dissolve  the room leaving for space (sections 17 to 18): a soft iris
//               closes on the instrument, so the room goes to black from the
//               edges inward, its dark surfaces first and its bright ones (the
//               window's sky, the brass) last; space comes up out of the
//               black behind it, only once most of the room is gone, and
//               where the room is bright (the sky, the instrument, both
//               registered in the two acts) it takes over directly, so the
//               window's sky becomes the sky all round. No noise, no edges.
//               uFocus: the instrument's centre (uv), its radius and the
//               iris's reach (fractions of the height, stretched across);
//               uP: feather, brightness lead (fractions of the reach), the
//               stars' lag behind the dark, t at which the iris has closed;
//               uQ: t window in which space comes up, log2 luminance of the
//               lead's dark and bright ends; uK: horizontal stretch, radius
//               of the luminance taps (fraction of the height)
// uMix is 0 (A) .. 1 (B); post.js never runs this with uMix at 0 or 1.
const COMPOSE_FRAG = /* glsl */ `
#ifndef KIND
#define KIND 1
#endif
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uMix;
uniform float uAspect;
uniform float uPxScale;
uniform vec2 uRes;
uniform vec4 uP;
uniform vec4 uQ;
uniform vec4 uK;
uniform vec4 uFocus;
varying vec2 vUv;
${COMMON}
void main() {
  vec2 uv = vUv;
  float t = clamp(uMix, 0.0, 1.0);
  vec3 col;
#if KIND == 1
  col = mix(texture2D(tA, uv).rgb, texture2D(tB, uv).rgb, t);
#elif KIND == 2
  float dir = uP.x < 0.0 ? -1.0 : 1.0;
  float s = clamp(uP.y, 0.0, 0.25) * t;
  // zoom 1 / (1 - 2s) about the centre exactly covers the shift: A is never sampled off its edges
  float z = 1.0 - 2.0 * s;
  vec2 ua = vec2(0.5 + (uv.x - 0.5) * z, 0.5 + (uv.y - 0.5) * z - dir * s);
  float feather = max(uP.z, 0.001);
  float y = dir > 0.0 ? uv.y : 1.0 - uv.y;
  float e = -0.5 * feather + t * (1.0 + feather);
  float wb = 1.0 - smoothstep(e - 0.5 * feather, e + 0.5 * feather, y);
  col = mix(texture2D(tA, ua).rgb, texture2D(tB, uv).rgb, wb);
#elif KIND == 3
  vec3 b = texture2D(tB, uv).rgb;
  vec2 r = vec2(uP.y / max(uAspect, 0.001), uP.y);
  float ln = 0.25 * (postLum(texture2D(tB, uv + r).rgb) + postLum(texture2D(tB, uv - r).rgb)
           + postLum(texture2D(tB, uv + vec2(r.x, -r.y)).rgb) + postLum(texture2D(tB, uv + vec2(-r.x, r.y)).rgb));
  float key = max(max(postLum(b), 0.7 * ln), 0.0);
  float lk = clamp((log2(key + 0.00001) - uP.z) / max(uP.w - uP.z, 0.001), 0.0, 1.0);
  float soft = max(uP.x, 0.001);
  float u = t * (1.0 + 2.0 * soft) - soft;
  float th = 1.0 - lk;
  // lamps snap on (a third of the softness), darks ease in; never outside the sweep, so t 0 is A and t 1 is B
  float sp = soft * mix(1.0, 0.35, lk);
  float wb = smoothstep(th - sp, th + sp, u);
  col = mix(texture2D(tA, uv).rgb, b, wb);
#elif KIND == 4
  vec3 a = texture2D(tA, uv).rgb;
  vec3 b = texture2D(tB, uv).rgb;
  // how far out from the instrument: 0 on it, 1 at the farthest corner (stretched across)
  vec2 dv = (uv - uFocus.xy) * vec2(uAspect * uK.x, 1.0);
  float rho = max(length(dv) - uFocus.z, 0.0) / max(uFocus.w - uFocus.z, 0.001);
  // the room's brightness round this pixel (a small neighbourhood, so a lone city light or
  // a hairline does not linger as a speck), as 0 (dark) .. 1 (bright) on a log scale
  vec2 r = vec2(uK.y / max(uAspect, 0.001), uK.y);
  float la = 0.4 * postLum(a) + 0.15 * (postLum(texture2D(tA, uv + r).rgb) + postLum(texture2D(tA, uv - r).rgb)
           + postLum(texture2D(tA, uv + vec2(r.x, -r.y)).rgb) + postLum(texture2D(tA, uv + vec2(-r.x, r.y)).rgb));
  float key = clamp((log2(max(la, 0.0) + 0.00001) - uQ.z) / max(uQ.w - uQ.z, 0.001), 0.0, 1.0);
  // the iris: its radius closes from beyond the farthest corner to past the instrument's
  // brightest pixel by uP.w; bright pixels sit nearer the centre by the lead, so they go last
  float f = max(uP.x, 0.001);
  float R = mix(1.0 + f, -f - uP.y, clamp(t / max(uP.w, 0.001), 0.0, 1.0));
  float rr = rho - uP.y * key;
  float wa = 1.0 - smoothstep(R - f, R + f, rr);
  // space: behind the room's dark by the lag (black first, then stars); none where the room
  // is bright or on the instrument, which hand straight over; and only from uQ.x on
  float lag = uP.z * (1.0 - key) * smoothstep(0.0, 0.25, rho);
  float wb = smoothstep(R + lag - f, R + lag + f, rr) * smoothstep(uQ.x, uQ.y, t);
  col = a * wa + b * wb;
#else
  col = texture2D(tA, uv).rgb;
#endif
  gl_FragColor = vec4(col, 1.0);
}
`;

// Glow bright pass: a box average over the CSS-px block each output texel
// covers (2x2 bilinear taps at +-block/4: exact for 2 and 4 source texels per
// output texel), so a hairline never crosses the threshold while a lit
// filament, a spike star or a thick bright stroke does.
const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSrcTexel;
uniform float uBlock;
uniform float uThresh;
varying vec2 vUv;
vec3 brightTap(vec2 uv) {
  return clamp(texture2D(tSrc, uv).rgb, 0.0, 24.0);
}
void main() {
  vec2 o = 0.25 * uBlock * uSrcTexel;
  vec3 c = 0.25 * (brightTap(vUv - o) + brightTap(vUv + o) + brightTap(vUv + vec2(o.x, -o.y)) + brightTap(vUv + vec2(-o.x, o.y)));
  float m = max(c.r, max(c.g, c.b));
  float w = smoothstep(uThresh, uThresh * 1.6 + 0.25, m);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

// halve: one bilinear tap at the corner of each 2x2 block
const COPY_FRAG = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0);
}
`;

// separable gaussian, linear-sampled: 9 fetches cover 17 texels
const BLUR_FRAG = /* glsl */ `
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

// The film finish: the only pass that writes the canvas. Linear HDR in,
// display sRGB out. Order: glow (added), text quiet zones (dim only what is
// bright under the words), veil, path to white above 1, highlight shoulder
// above uKnee, sRGB encode, vignette and grain in display space, dither.
// With glow, quiet zones, veil, vignette and grain off and uKnee at 1 (the
// default), a linear value in 0..1 encodes back to exactly its sRGB value:
// baked textures (saved through Blender's display transform, decoded by the
// sRGB texture fetch) come out unchanged, give or take the half-step dither.
const FINISH_FRAG = /* glsl */ `
#ifndef GLOW_LEVELS
#define GLOW_LEVELS 3
#endif
#define QUIET_N 12
uniform sampler2D tSrc;
uniform sampler2D tGlow1;
uniform sampler2D tGlow2;
uniform sampler2D tGlow3;
uniform vec3 uGlow;
uniform float uHasSrc;
uniform float uFetch;
uniform vec3 uBg;
uniform float uKnee;
uniform float uWhite;
uniform vec3 uVeil;
uniform float uGrain;
uniform float uVignette;
uniform float uDither;
uniform vec2 uRes;
uniform vec2 uGrainSeed;
uniform vec4 uQuiet[QUIET_N];
uniform int uQuietN;
uniform float uQuietSoft;
uniform float uQuietK;
uniform float uQuietDesat;
uniform vec2 uQuietLum;
varying vec2 vUv;
${COMMON}
vec3 postEncodeSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
// 1 inside a text rectangle (device px, y up), easing to 0 over uQuietSoft outside it
float quietAt(vec2 p) {
  float q = 0.0;
  for (int i = 0; i < QUIET_N; i++) {
    if (i >= uQuietN) break;
    vec4 r = uQuiet[i];
    if (r.z <= r.x || r.w <= r.y) continue;
    vec2 d = max(max(r.xy - p, p - r.zw), vec2(0.0));
    q = max(q, 1.0 - smoothstep(0.0, uQuietSoft, length(d)));
  }
  return q;
}
void main() {
  vec3 col = uBg;
  if (uHasSrc > 0.5) col = uFetch > 0.5 ? texelFetch(tSrc, ivec2(gl_FragCoord.xy), 0).rgb : texture2D(tSrc, vUv).rgb;
  col = clamp(col, 0.0, 65000.0);
#if GLOW_LEVELS >= 1
  col += texture2D(tGlow1, vUv).rgb * uGlow.x;
#endif
#if GLOW_LEVELS >= 2
  col += texture2D(tGlow2, vUv).rgb * uGlow.y;
#endif
#if GLOW_LEVELS >= 3
  col += texture2D(tGlow3, vUv).rgb * uGlow.z;
#endif
  float q = quietAt(gl_FragCoord.xy);
  if (q > 0.0) {
    float l = postLum(col);
    float k = q * smoothstep(uQuietLum.x, uQuietLum.y, l);
    col = mix(col, vec3(l), uQuietDesat * k) * (1.0 - uQuietK * k);
  }
  col += uVeil;
  // path to white: channels above 1 drift toward white (a hot core inside a coloured glow)
  float m = max(col.r, max(col.g, col.b));
  if (m > 1.0) col = mix(col, vec3(m), 1.0 - exp(-(m - 1.0) * uWhite));
  // shoulder on the brightest channel (hue kept): identity below uKnee, asymptote 1
  m = max(col.r, max(col.g, col.b));
  if (m > uKnee) {
    float kw = max(1.0 - uKnee, 0.0001);
    float r = uKnee + kw * (1.0 - exp(-(m - uKnee) / kw));
    col *= r / m;
  }
  vec3 o = postEncodeSrgb(col);
  // vignette: 0 at the centre, 1 in the corners
  float asp = uRes.x / max(uRes.y, 1.0);
  vec2 qv = (vUv - 0.5) * vec2(asp, 1.0);
  float rv = length(qv) / length(vec2(0.5 * asp, 0.5));
  o *= 1.0 - uVignette * smoothstep(0.4, 1.05, rv);
  // grain: triangular, zero mean, strongest in the shadows, faded out at black so clipping cannot lift it
  float lo = postLum(o);
  float mn = min(o.r, min(o.g, o.b));
  vec2 fc = gl_FragCoord.xy;
  float g = postHash12(fc + uGrainSeed) + postHash12(fc + uGrainSeed + 19.7) - 1.0;
  o += g * uGrain * (1.0 - smoothstep(0.06, 0.6, lo)) * smoothstep(0.0, 2.0 * uGrain + 0.0001, mn);
  // dither against 8-bit banding (uDither in 8-bit steps, triangular)
  float dn = postHash12(fc * 1.37 + 71.3) + postHash12(fc * 1.37 + 5.1) - 1.0;
  o += dn * (uDither / 255.0);
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), 1.0);
}
`;

/** Every shader string, for offline compile checks. */
export const SHADERS = Object.freeze({ VERT, COMPOSE_FRAG, BRIGHT_FRAG, COPY_FRAG, BLUR_FRAG, FINISH_FRAG });

/** Compose program per transition kind (the KIND define). */
export const COMPOSE_KINDS = Object.freeze({ copy: 0, fade: 1, lift: 2, reveal: 3, dissolve: 4 });

/** Size of the quiet-zone uniform array (QUIET_N in FINISH_FRAG). */
export const QUIET_N = 12;

/**
 * Gaussian taps for BLUR_FRAG: the centre plus 4 linear-sampled pairs
 * (texels 1..8 each side), normalised.
 * @param {number} sigma in texels
 * @returns {{ W: number[], O: number[] }}
 */
export function gaussTaps(sigma) {
  const w = [];
  for (let i = 0; i <= 8; i++) w.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const W = [w[0]];
  const O = [0];
  for (let k = 0; k < 4; k++) {
    const a = w[2 * k + 1];
    const b = w[2 * k + 2];
    W.push(a + b);
    O.push((a * (2 * k + 1) + b * (2 * k + 2)) / (a + b));
  }
  const sum = W[0] + 2 * (W[1] + W[2] + W[3] + W[4]);
  return { W: W.map((v) => v / sum), O };
}
