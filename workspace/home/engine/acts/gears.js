// Act 2, inside (sections 4-8; STORYBOARD.md). A macro photograph of a watch
// movement, in the dark, before the viewer knows what the object is: the main
// wheel's teeth (§4), a second wheel sliding in and meshing (§5), a third (§6),
// the train turning 1:2:4 with scroll, the camera riding round with the pinion
// for a full turn (§7), then back off the train and up the column, out of the
// machine room into a dark sky of rings (§8).
//
// What is drawn, in one scene:
//
// - The instrument's own train at full brass (gilt, polished: ROUGH), lit by a
//   lamp: the key is a spot LAMP_DIST out, low and ahead-right of the lens,
//   its cone the pool of light round the subject. A cyan-violet rim from
//   behind. The instrument mirrors only a dim warm room (ENV_SKY), so its
//   walls stay dark apart from the lamp's sheen.
// - The detail pass, drawn over the train's own geometry (DETAIL_*): every
//   turned face is circular-grained and relit: the soft box overhead as a broad
//   warm fan through the arbor, the key as a narrow bright one, the rim as a
//   cool one, fine concentric lines of polish, a few glittering facets; every
//   upright wall carries a polished edge break along its top (it mirrors the
//   box all the way round); roots between the teeth are darker; the pinion's
//   ring jewel is ruby.
// - The plate below (FLOOR_*): perlage, lit only in the pool, the gears' long
//   shadows across it.
// - The furniture on the plate (gears/dressing.js): ruby jewels in gold
//   chatons with blued screws, bridges with Geneva stripes and polished
//   bevels, a cap jewel on the idler's hub. It goes with the floor as the
//   instrument's base arrives.
// - Dust in the lamp's beam (MOTE_*), a backdrop with the light's haze, fog
//   that takes the far wheels into the dark, one small warm glint where the
//   teeth mesh.
// - A lens (gears/dof.js): the scene is drawn once into the lens's own target
//   and joined into the act's target through a depth of field, in one render
//   call on that target. Tier 0 has no lens and draws straight into it.
// - On the climb (kUp) the light turns over: the rings mirror the lit machine
//   room below them (warm) and a cold sky above, the lens stops down, the
//   dust reads as points in the dark.
//
// Tiers: 0 no lens, five jewels, no bridges, 28 motes; 1 a 14-tap lens, the
// bridges at low detail, 70 motes; 2 a 32-tap lens, 150 motes; 3 a 56-tap
// lens, 230 motes. The scene's own draw is the same at every tier (the
// instrument sets its own detail by tier).
//
// World: instrument units, the train on its floor (y = 0), the instrument at
// the origin. Driven by frame.params: train (gears present; the fraction is
// the next gear sliding in), crank (exact), build (base, column, rings).
// Deterministic in (frame, time); time only moves the dust, and not under
// reduced motion.

import { BEATS, GEARS, RIDE } from '../choreo/choreography.mjs';
import { beatOpacity } from '../timeline/schedule.js';
import { buildReveal } from '../instrument/pose.js';
import { BASE, GEAR } from '../instrument/layout.js';
import { smoothstep, lerp, hexLinear, lightDir, nlerpInto, mixInto, isRect, DEG } from './shared/math.js';
import { resolveCamera, applyFrameCamera, aspectOf } from './shared/camera.js';
import { createRenderInto, drawPixelRatio, premultipliedBlend } from './shared/render.js';
import { createLease, ensureBuilt } from './shared/lease.js';
import { instrumentBuild, trainReveal, trainCentres, overrideTrain } from './shared/build.js';
import { createPoints } from './shared/points.js';
import { createBackdrop } from './shared/backdrop.js';
import { createDof } from './gears/dof.js';
import { createDressing } from './gears/dressing.js';

// ------------------------------------------------------------------ knobs ---

/** The instrument's brass blend in here: all metal (no hatching, no ink outlines). */
export const METAL = 1;
/** The plate act's key, which this act starts from during the lift. */
const PLATE_KEY = lightDir(128, 58);
const KEY_COL = [1.0, 0.84, 0.62];
const KEY_I = 2.6;

/**
 * The key against the camera, by u: [u, bearing (degrees to the right of the
 * view, horizontally; 0 is straight ahead, 90 square to the side), elevation
 * (degrees)]. Between rows it eases (smoothstep). Ahead-right and low: it
 * rakes the teeth's walls from beyond the subject and stays some 60 degrees
 * from where the frame's flat faces mirror the lens (cameras here look down
 * 25 to 46 degrees, so a top face mirrors a point that far up straight ahead),
 * which is what blew out the first browser pass.
 */
export const KEY_REL = Object.freeze([
  [4, 62, 17],
  [5.4, 64, 17],
  [6.05, 68, 19],
  [6.45, 64, 17],
  [7, 66, 17],
  [7.25, 70, 18],
  [RIDE.to, 70, 18],
  [8.6, 76, 22],
  [9, 90, 24],
].map((r) => Object.freeze(r)));
/** The rim against the camera: behind the subject, to the left, low. */
export const RIM_REL = Object.freeze([-38, 13]);

// colours (linear)
const FOG = [0.0034, 0.0032, 0.0066];
const BG_BASE = [0.0015, 0.0014, 0.003];
const BG_HORIZON = [0.0038, 0.0036, 0.0076];
const KEY_GLOW = [0.03, 0.022, 0.014];
const RIM_GLOW = [0.005, 0.009, 0.022];
/** What the instrument's metal mirrors: a dim warm room; the light on the faces comes from the box (the detail pass). */
const ENV_SKY = [0.04, 0.029, 0.017];
const ENV_SKY_PLATE = hexLinear('#1b2440');
const ENV_GROUND = [0.004, 0.0034, 0.003];
/** On the climb the rings mirror the lit machine room below them and a cold sky above. */
const ENV_SKY_UP = [0.02, 0.035, 0.09];
const ENV_GROUND_UP = [0.24, 0.13, 0.05];
const BG_GLOW = [0.02, 0.0105, 0.0045];
/** The rim's colour (the instrument's rim light and its environment strip): cyan toward violet. */
const ENV_RIM = [0.2, 0.42, 0.95];
const FLOOR_BASE = [0.0036, 0.0034, 0.0046];
/** The soft box overhead, mirrored in every polished face: warm, about ten degrees across. */
const BOX_COL = [1.15, 0.86, 0.52];
const BOX_SIZE = 0.03;
/** The meshing glint: amber-orange. */
const GLINT = [1.06, 0.37, 0.1];
const MOTE = [1.0, 0.9, 0.74];
/** The instrument's palette in here: its fills match the fog. */
const PALETTE = { night: '#0d0e18', stage: '#06070c' };
/**
 * Metal bases (linear F0, by the instrument's variants: brass, bronze, steel,
 * blued steel) and their roughness for this act: gilt brass with a fine
 * polish, tempered-blue steel screws. The room shows its own values; the
 * lease puts them back.
 */
const METALS = [[0.98, 0.69, 0.31], [0.62, 0.38, 0.19], [0.66, 0.67, 0.7], [0.035, 0.08, 0.4]];
const ROUGH = [0.2, 0.3, 0.16, 0.14];
const PATINA = [0.09, 0.055, 0.03];
/** The detail pass and the floor tint their light with the brass. */
const TINT = METALS[0];

/** How far out along its direction the key lamp stands (instrument units). */
const LAMP_DIST = 6;

/** Dust per tier: [fine field (macro), coarse field (the climb)]. A handful. */
const MOTES = [[16, 12], [40, 30], [90, 60], [140, 90]];
const MOTE_BOX = [1.7, 7];

/** Where the teeth mesh (instrument frame), on the top edges at the pitch points. */
const MI = [Math.cos((-40 * Math.PI) / 180) * 1.08, GEAR.y0 + GEAR.idler.thick + 0.002, -Math.sin((-40 * Math.PI) / 180) * 1.08];
/** Idler and pinion: on the pinion's top edge (it stands 0.02 proud of the idler), so the low §6 camera sees it over the teeth. */
const IP = (() => {
  const I = GEARS.idler;
  const a = (66 * Math.PI) / 180;
  const ri = (GEAR.idler.z * GEAR.module) / 2;
  return [I[0] + Math.cos(a) * ri, GEAR.y0 + GEAR.pinion.thick + 0.002, I[2] - Math.sin(a) * ri];
})();

/** The groups the detail pass draws over, with their teeth (root radius, tip radius, underside, top). */
const NONE = [-1, -1, 0, 0];
const DETAIL = (() => {
  const teeth = (/** @type {{ z: number, thick: number }} */ g) => {
    const r = (g.z * GEAR.module) / 2;
    return [r - 1.25 * GEAR.module, r + GEAR.module, GEAR.y0, GEAR.y0 + g.thick];
  };
  return [
    { id: 'wheel', teeth: teeth(GEAR.main), jewel: NONE },
    { id: 'idler', teeth: teeth(GEAR.idler), jewel: NONE },
    // the pinion's ring jewel (parts.js: r 0.037 - 0.057, from 0.012 to 0.025 above the pinion's top)
    { id: 'pinion', teeth: teeth(GEAR.pinion), jewel: [0.0365, 0.0575, GEAR.y0 + GEAR.pinion.thick + 0.0115, GEAR.y0 + GEAR.pinion.thick + 0.026] },
    { id: 'rule', teeth: [-1, -1, 0, 0], jewel: NONE },
  ];
})();

// ------------------------------------------------------------------ light ---

/** [bearing, elevation] of a KEY_REL-style table at u. @param {ReadonlyArray<ReadonlyArray<number>>} T @param {number} u */
function relAt(T, u) {
  if (!(u > T[0][0])) return [T[0][1], T[0][2]];
  for (let i = 1; i < T.length; i++) {
    if (u <= T[i][0]) {
      const a = T[i - 1];
      const b = T[i];
      const t = smoothstep(a[0], b[0], u);
      return [lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    }
  }
  const z = T[T.length - 1];
  return [z[1], z[2]];
}

/**
 * The key's direction (unit, toward the light) at u for a camera looking
 * along world azimuth `fwdAz` (degrees; dir(a) = (cos a, 0, -sin a), so the
 * view's right is fwdAz - 90): KEY_REL's bearing against the view. On the §7
 * ride that keeps the ridden tooth lit the same while the train and the floor
 * swing round under the light.
 * @param {number[]} out
 * @param {number} u
 * @param {number} fwdAz
 */
export function keyLight(out, u, fwdAz) {
  const [rel, el] = relAt(KEY_REL, u);
  const L = lightDir(fwdAz - rel, el);
  out[0] = L[0];
  out[1] = L[1];
  out[2] = L[2];
  return out;
}

/** The rim's direction for a camera looking along `fwdAz` (degrees). @param {number[]} out @param {number} fwdAz */
export function rimLight(out, fwdAz) {
  const L = lightDir(fwdAz - RIM_REL[0], RIM_REL[1]);
  out[0] = L[0];
  out[1] = L[1];
  out[2] = L[2];
  return out;
}

// ----------------------------------------------------------------- shaders ---

const NOISE1 = /* glsl */ `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}
`;

export const FLOOR_VERT = /* glsl */ `
varying vec3 vW;
varying float vDist;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

// The plate the train turns on, sunk below the bridges: perlage, overlapping
// spots of circular graining on the base's own lattice (parts.js: spacing
// 0.046, rows 0.046 sin 60 apart and staggered, spots 0.034 across the
// radius), each later spot covering the earlier ones. A circular-grained spot
// mirrors a light as a narrow fan through its centre, so every spot shows a
// small bow-tie toward the soft box and a sharper one toward the key; its
// scalloped edge is a dark hairline. Detail melts to its mean before it
// aliases. Only the pool of light round the subject is lit; the gears'
// shadows fall long across it from the low key.
export const FLOOR_FRAG = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec3 uBoxDir;
uniform vec3 uBoxCol;
uniform vec3 uPool;
uniform vec2 uPoolR;
uniform vec2 uSlab;
uniform vec3 uBase;
uniform vec3 uTint;
uniform vec3 uFogCol;
uniform vec2 uFog;
uniform float uOpacity;
uniform float uRadius;
uniform vec4 uGear[3];
uniform vec2 uShadowOff;
varying vec3 vW;
varying float vDist;
${NOISE1}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  const float PS = 0.046;
  const float PR = 0.034;
  const float ROW = 0.0398371; // 0.046 * sin 60
  vec2 p = vW.xz;
  float r = length(p);
  vec3 V = normalize(cameraPosition - vW);
  vec3 Hk = normalize(uKeyDir + V);
  vec3 Hr = normalize(uRimDir + V);
  vec3 Hb = normalize(uBoxDir + V);
  // units per pixel here, for the level of detail
  float upp = max(length(fwidth(p)), 1e-7);
  float spotPx = PR / upp;

  // the covering spot: of the lattice points within reach, the latest
  float jr = floor(p.y / ROW + 0.5);
  vec2 best = vec2(PR);
  vec2 bestId = vec2(0.0);
  float bestOrd = -1e9;
  for (int dj = -1; dj <= 1; dj++) {
    float j = jr + float(dj);
    float off = mod(j, 2.0) * 0.5 * PS;
    float ir = floor((p.x - off) / PS + 0.5);
    for (int di = -1; di <= 1; di++) {
      float i = ir + float(di);
      vec2 q = p - vec2(i * PS + off, j * ROW);
      float ord = j * 4096.0 + i;
      if (dot(q, q) < PR * PR && ord > bestOrd) {
        bestOrd = ord;
        best = q;
        bestId = vec2(i, j);
      }
    }
  }
  float rs = length(best);
  float seed = hash21(bestId + 17.0);
  vec3 T = rs > 1e-6 ? vec3(-best.y, 0.0, best.x) / rs : vec3(1.0, 0.0, 0.0);
  float tk = dot(T, Hk);
  float tr = dot(T, Hr);
  float tb = dot(T, Hb);
  // a small spot shows its mean fan, not a sparkle
  float lod = smoothstep(2.5, 6.0, spotPx);
  float sk = mix(0.16, exp(-tk * tk / 0.02), lod);
  float sr = mix(0.3, exp(-tr * tr / 0.06), lod);
  float sb = mix(0.3, exp(-tb * tb / 0.09), lod);
  float fg = rs * 2400.0 + seed * 37.0;
  float grain = mix(noise1(fg), 0.5, smoothstep(0.25, 0.8, 2400.0 * upp));
  float polish = 0.5 + 0.7 * grain + 0.35 * (seed - 0.5);
  float edge = (1.0 - smoothstep(0.6 * upp, 1.8 * upp, PR - rs)) * lod;
  float coarse = noise1(r * 23.0 + 4.0);

  // the pool of light round the subject, across the key's axis
  vec3 pd = vW - uPool;
  pd -= uKeyDir * dot(pd, uKeyDir);
  float pool = 1.0 - smoothstep(uPoolR.x, uPoolR.y, length(pd));
  float sz = (vDist - uSlab.x) / uSlab.y;
  pool *= mix(0.1, 1.0, exp(-sz * sz));

  float keyY = max(uKeyDir.y, 0.0);
  vec3 col = uBase * (0.8 + 0.4 * coarse);
  col += uKeyCol * uTint * (sk * polish * 0.04 * (0.35 + 2.0 * keyY)) * pool;
  col += uBoxCol * uTint * (sb * polish * 0.022) * (0.1 + 0.9 * pool) * max(dot(Hb, vec3(0.0, 1.0, 0.0)), 0.0);
  col += uRimCol * (sr * 0.1 * polish);
  col *= 1.0 - 0.4 * edge;

  // the gears' shadows (long, from the low key) and their contact darkness
  float occ = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 g = uGear[i];
    if (g.w <= 0.0) continue;
    float s = 1.0 - smoothstep(g.z - 0.06, g.z + 0.16, segDist(p, g.xy, g.xy + uShadowOff));
    float c = 1.0 - smoothstep(g.z - 0.12, g.z + 0.05, length(p - g.xy));
    occ = max(occ, max(0.85 * s, 0.7 * c) * g.w);
  }
  col *= 1.0 - occ;
  col = mix(uFogCol, col, 1.0 - smoothstep(uRadius * 0.8, uRadius, r));
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
  gl_FragColor = vec4(col * uOpacity, uOpacity);
}
`;

// The detail pass: drawn over the instrument's own train geometry (the same
// vertex arithmetic, so the same depth; pulled a hair toward the eye), as
// premultiplied colour + darkening: out = add + under * (1 - dark). In the
// group's frame the gear's arbor is +Y through the origin.
export const DETAIL_VERT = /* glsl */ `
attribute vec4 aMat;
varying vec3 vW;
varying vec3 vN;
varying vec3 vP;
varying vec3 vPN;
varying vec3 vAxis;
varying vec3 vCentre;
varying float vAo;
varying float vSteel;
varying float vDist;
void main() {
  vec4 p = vec4(position, 1.0);
  vec4 wp = modelMatrix * p;
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vP = position;
  vPN = normal;
  vAxis = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
  vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vAo = aMat.w;
  // the instrument's variant (aMat.x mod 8): 2 and 3 are steel (the screws, the jewel's chaton)
  vSteel = step(1.5, mod(floor(aMat.x + 0.5), 8.0));
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const DETAIL_FRAG = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uRimDir;
uniform vec3 uRimCol;
uniform vec3 uBoxDir;
uniform vec3 uBoxCol;
uniform vec3 uPool;
uniform vec2 uPoolR;
uniform vec2 uSlab;
uniform vec3 uTint;
uniform vec4 uTooth;
uniform vec2 uFog;
uniform float uOn;
uniform float uSeed;
uniform vec4 uJewel;
varying vec3 vW;
varying vec3 vN;
varying vec3 vP;
varying vec3 vPN;
varying vec3 vAxis;
varying vec3 vCentre;
varying float vAo;
varying float vSteel;
varying float vDist;
${NOISE1}
// one octave of turning marks: bands of polish across the radius, melted to their mean before they alias
float marks(float x) {
  return mix(noise1(x), 0.5, smoothstep(0.2, 0.7, fwidth(x)));
}
vec3 flat2(vec3 v, vec3 A) {
  vec3 h = v - A * dot(v, A);
  return h * inversesqrt(max(dot(h, h), 1e-10));
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// what a circular-grained face throws back of a light whose half vector is H:
// tight along the grooves (T), wide across them (Bv), so the light shows as a
// fan through the arbor
float fan(vec3 T, vec3 Bv, vec3 N, vec3 H, float along, float across) {
  float th = dot(T, H) / along;
  float bh = dot(Bv, H) / across;
  float nh = max(dot(N, H), 0.05);
  return exp(-(th * th + bh * bh) / (nh * nh));
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 A = normalize(vAxis);
  vec3 H = normalize(uKeyDir + V);
  vec3 Hr = normalize(uRimDir + V);
  vec3 Hb = normalize(uBoxDir + V);
  vec3 PN = normalize(vPN);
  float r = length(vP.xz);
  float y = vP.y;
  // every derivative first, in uniform control flow
  float fy = fwidth(y);
  vec3 q = vW - vCentre;
  q -= A * dot(q, A);
  float rq = length(q);
  float m1 = marks(rq * 1700.0 + uSeed);
  float m2 = marks(rq * 420.0 + 3.7 + uSeed);
  float m3 = marks(rq * 90.0 + 11.3 + uSeed);
  float mf = marks(atan(vP.z, vP.x) * r * 2600.0);
  // glitter: one facet in a hundred and fifty of the grain stands square to a light (fixed to
  // the wheel, so it winks as the wheel turns); gone before a facet is under two pixels
  const float CELL = 520.0;
  vec2 gc = vP.xz * CELL;
  vec2 gi = floor(gc);
  float gh = hash21(gi + uSeed);
  float facet = step(0.9935, gh) * (1.0 - smoothstep(0.12, 0.3, length(gc - gi - 0.5)))
              * smoothstep(1.6, 3.0, 1.0 / max(CELL * length(fwidth(vP.xz)), 1e-5));

  // the pool of light round the subject, across the key's axis
  vec3 pd = vW - uPool;
  pd -= uKeyDir * dot(pd, uKeyDir);
  float pool = 1.0 - smoothstep(uPoolR.x, uPoolR.y, length(pd));
  // and through the depth of the frame: the light holds round the sharp plane
  float sz = (vDist - uSlab.x) / uSlab.y;
  float slab = mix(0.1, 1.0, exp(-sz * sz));
  pool *= slab;

  vec3 add = vec3(0.0);
  float dark = 0.4 * (1.0 - clamp(vAo, 0.0, 1.0));
  float top = step(0.95, PN.y);
  float flank = 1.0 - step(0.3, abs(PN.y));
  float teeth = step(0.0, uTooth.x) * step(uTooth.x - 0.006, r) * step(r, uTooth.y + 0.006)
              * step(uTooth.z - 0.002, y) * step(y, uTooth.w + 0.002);
  // anywhere in the plane of the wheel's plate
  float plate = step(0.0, uTooth.x) * step(uTooth.z - 0.002, y) * step(y, uTooth.w + 0.002);
  float jewel = step(0.0, uJewel.x) * step(uJewel.x, r) * step(r, uJewel.y) * step(uJewel.z, y) * step(y, uJewel.w);
  top *= 1.0 - jewel;
  vec3 tint = mix(uTint, vec3(0.5, 0.56, 0.68), vSteel);

  // turned faces: circular graining round the arbor. The instrument's own
  // metal is dimmed under it and the face relit: the soft box as a broad
  // warm fan, the key as a narrow bright one, the rim as a cool one, all
  // broken into fine concentric lines of polish.
  if (top > 0.5) {
    vec3 T = rq > 1e-5 ? cross(A, q) / rq : vec3(1.0, 0.0, 0.0);
    vec3 Bv = cross(T, A);
    float polish = 0.3 + 0.75 * m1 + 0.4 * m2 + 0.25 * m3;
    float fb = fan(T, Bv, A, Hb, 0.17, 1.0);
    float fk = fan(T, Bv, A, H, 0.085, 0.8);
    float fr = fan(T, Bv, A, Hr, 0.16, 0.9);
    vec3 lit = uBoxCol * (0.02 + 0.62 * fb) + uKeyCol * (0.5 * fk) * pool + uRimCol * (0.75 * fr);
    add += tint * lit * polish * (0.06 + 0.94 * pool);
    // a slow change of tone across the wheel, never a flat fill
    add *= 0.85 + 0.3 * m3;
    add += tint * facet * (uBoxCol * (0.6 + 5.0 * fb) * (0.2 + 0.8 * slab) + uKeyCol * (5.0 * fk + 0.5) * pool);
    dark = max(dark, 0.82);
  }
  // every upright wall of the wheel's plate (teeth, spokes, windows): a polished
  // edge break along its top. A rounded edge holds every elevation, so it mirrors
  // the box overhead all the way round, and the key and the rim where its outward
  // bearing faces their half vectors; about two pixels wide, never wider than
  // 0.0035 units.
  if (flank * plate > 0.5) {
    vec3 nh = flat2(N, A);
    float gk = pow(max(dot(nh, flat2(H, A)), 0.0), 40.0);
    float gr = pow(max(dot(nh, flat2(Hr, A)), 0.0), 16.0);
    float w = min(0.0035, 2.4 * fy);
    float band = 1.0 - smoothstep(0.3 * w, w, uTooth.w - y);
    add += band * (uKeyCol * uTint * (2.8 * gk) * pool + uBoxCol * uTint * 0.85 * (0.12 + 0.88 * slab) + uRimCol * (1.6 * gr));
    dark = max(dark, 0.5 * band);
    // vertical draw-filing on the wall: fine upright lines of polish in the key's sheen
    float nl = max(dot(N, uKeyDir), 0.0);
    add += uKeyCol * uTint * (0.04 * nl * (0.4 + 1.2 * mf)) * pool * (1.0 - band);
    // between the teeth: darker roots, a contact shadow at the foot
    if (teeth > 0.5) {
      float span = max(uTooth.y - uTooth.x, 1e-4);
      float root = 1.0 - smoothstep(uTooth.x, uTooth.x + 0.55 * span, r);
      float foot = 1.0 - smoothstep(0.0, 0.022, y - uTooth.z);
      dark = max(dark, max(0.7 * root, 0.45 * foot) * (1.0 - band));
    }
  }
  // the ring jewel in the pinion's chaton: ruby
  if (jewel > 0.5) {
    vec3 ruby = vec3(0.62, 0.012, 0.035);
    float nv = clamp(dot(N, V), 0.0, 1.0);
    float nl = max(dot(N, uKeyDir), 0.0);
    float inner = 0.2 + 0.9 * pow(max(dot(-flat2(q, A), flat2(uKeyDir, A)), 0.0) * 0.6 + 0.4 * nl, 1.3);
    vec3 c = ruby * inner * (0.45 + 0.55 * nv) * (0.3 + 0.7 * pool) * 1.3;
    vec3 R = reflect(-V, N);
    float Fj = 0.07 + 0.93 * pow(1.0 - nv, 5.0);
    c += Fj * (uBoxCol * exp(-(1.0 - dot(R, uBoxDir)) / 0.02) * 1.4 + uRimCol * 2.5 * pow(max(dot(N, Hr), 0.0), 80.0));
    c += uKeyCol * pool * 3.5 * pow(max(dot(N, H), 0.0), 500.0);
    add = c;
    dark = 0.97;
  }
  float k = (1.0 - smoothstep(uFog.x, uFog.y, vDist)) * uOn;
  gl_FragColor = vec4(add * k, clamp(dark, 0.0, 0.97) * k);
}
`;

export const MOTE_VERT = /* glsl */ `
attribute vec4 aSeed;
attribute float aField;
uniform vec3 uCentre;
uniform vec2 uBox;
uniform vec2 uW;
uniform float uKeep;
uniform float uTime;
uniform vec3 uDrift;
uniform vec3 uKeyDir;
uniform float uFocus;
uniform float uDpr;
uniform float uNear;
uniform vec2 uFog;
uniform float uBright;
uniform vec4 uQuiet;
uniform float uQuietK;
uniform vec3 uPool;
uniform vec2 uPoolR;
varying float vA;
varying float vSoft;
varying float vSize;
void main() {
  float B = mix(uBox.x, uBox.y, aField);
  float w = mix(uW.x, uW.y, aField);
  float keep = step(fract(aSeed.w * 7.31 + 0.13), uKeep);
  float ph = aSeed.w * 6.2832;
  // a slow drift and a slower wander, wrapped into a box round the shot
  vec3 p = aSeed.xyz * B + uDrift * (uTime * (0.6 + 0.8 * aSeed.w));
  p += (0.05 * B) * vec3(sin(uTime * 0.13 + ph * 3.0), sin(uTime * 0.11 + ph * 5.0), sin(uTime * 0.12 + ph * 7.0));
  vec3 q = mod(p - uCentre + 0.5 * B, B) - 0.5 * B;
  vec3 wp = uCentre + q;
  float edge = max(max(abs(q.x), abs(q.y)), abs(q.z)) / (0.5 * B);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float z = -mv.z;
  gl_Position = projectionMatrix * mv;
  // out of focus a mote becomes a disc (circle of confusion about the focus)
  float coc = abs(1.0 - uFocus / max(z, 1e-4));
  float sizeCss = clamp(2.0 + 9.0 * coc, 2.0, 34.0);
  float s = sizeCss * uDpr;
  // (never under 6 px: the lens works at half resolution, and a smaller speck would come out of it square)
  vSize = clamp(s, 6.0, 120.0);
  gl_PointSize = vSize;
  vSoft = clamp(coc * 0.8, 0.0, 1.0);
  // dust lights up looking toward the light (Henyey-Greenstein, g = 0.55),
  // held to 2.4 so a mote against the key is a mote, not a star
  vec3 V = normalize(wp - cameraPosition);
  float mu = dot(V, uKeyDir);
  float phase = min(0.6975 / pow(max(1.3025 - 1.1 * mu, 1e-4), 1.5), 2.4);
  float tw = 0.65 + 0.35 * pow(0.5 + 0.5 * sin(uTime * (0.5 + 1.2 * aSeed.w) + ph * 11.0), 6.0);
  float spread = 2.0 / sizeCss;
  // dust shows where the lamp's beam passes: bright in the pool of light, nearly gone outside it
  vec3 pd = wp - uPool;
  pd -= uKeyDir * dot(pd, uKeyDir);
  float beam = mix(0.07, 1.0, 1.0 - smoothstep(0.5 * uPoolR.x, 0.9 * uPoolR.y, length(pd)));
  float cover = clamp(s * 0.5, 0.0, 1.0);
  vec2 ndc = gl_Position.xy / max(gl_Position.w, 1e-6);
  vec2 dq = max(uQuiet.xy - ndc, ndc - uQuiet.zw);
  float quiet = 1.0 - smoothstep(0.0, 0.2, max(dq.x, dq.y));
  vA = uBright * w * keep * (0.25 + phase) * tw * spread * cover * cover * mix(beam, 0.6 + 0.4 * beam, aField)
     * (1.0 - smoothstep(0.75, 1.0, edge))
     * smoothstep(uNear * 3.0, uNear * 12.0, z)
     * (1.0 - smoothstep(uFog.x, uFog.y, z))
     * (1.0 - 0.85 * uQuietK * quiet);
  if (vA < 1e-4) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}
`;

export const MOTE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
varying float vSoft;
varying float vSize;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  float sharp = exp(-r2 * 6.0) * (1.0 - r2);
  float disc = smoothstep(0.0, 1.0, (1.0 - r) * max(vSize * 0.3, 1.2)) * (0.75 + 0.25 * smoothstep(0.5, 0.95, r));
  // a small mote is a soft round speck whatever its focus; only a large one shows its disc
  float k = mix(sharp, disc, vSoft * smoothstep(7.0, 12.0, vSize)) * vA;
  gl_FragColor = vec4(uColor * k, k);
}
`;

// --------------------------------------------------------------------- act ---

/**
 * @param {import('./plate.js').ActContext} ctx
 */
export function createGearsAct(ctx) {
  const { THREE } = ctx;
  const inst = ctx.instrument;
  const reduced = !!ctx.reducedMotion;
  const rngFor = ctx.rngFor;
  const scene = new THREE.Scene();
  scene.name = 'act:gears';
  const camera = new THREE.PerspectiveCamera(34, 1.6, 0.01, 50);
  const renderInto = createRenderInto(THREE);
  const lease = inst ? createLease(inst) : null;
  const dof = createDof(THREE);
  const css = { width: 0, height: 0, dpr: 1 };
  let tier = Number.isFinite(ctx.tier) ? Math.max(0, Math.min(3, Math.round(/** @type {number} */ (ctx.tier)))) : 2;
  let ready = false;
  let disposed = false;
  /** @type {Promise<void> | null} */
  let loading = null;
  /** @type {any[]} */
  const disposables = [];

  // the lights, shared by the floor, the detail pass and the dust (one set of uniform objects)
  const light = {
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uKeyCol: { value: new THREE.Vector3(...KEY_COL) },
    uRimDir: { value: new THREE.Vector3(0, 1, 0) },
    uRimCol: { value: new THREE.Vector3(...ENV_RIM) },
    uTint: { value: new THREE.Vector3(...TINT) },
    uFog: { value: new THREE.Vector2(1e6, 2e6) },
    uFogCol: { value: new THREE.Vector3(...FOG) },
    // the soft box overhead (direction toward it) and the pool of light round the subject
    uBoxDir: { value: new THREE.Vector3(0, 1, 0) },
    uBoxCol: { value: new THREE.Vector3(...BOX_COL) },
    uBoxSize: { value: BOX_SIZE },
    uPool: { value: new THREE.Vector3() },
    uPoolR: { value: new THREE.Vector2(1e5, 2e5) },
    // the lit slab: distance of the subject from the lens, and how far either side the light holds
    uSlab: { value: new THREE.Vector2(1, 1e5) },
    // the gears' footprints (x, z, tip radius, presence), for shadows on the plate and what stands on it
    uGear: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  };

  // the backdrop
  const backdrop = createBackdrop(THREE);
  disposables.push(backdrop);
  scene.add(backdrop.object3D);

  // the floor
  const floorU = {
    ...light,
    uBase: { value: new THREE.Vector3(...FLOOR_BASE) },
    uOpacity: { value: 1 },
    uRadius: { value: BASE.radius },
    uShadowOff: { value: new THREE.Vector2() },
  };
  const floorMat = new THREE.ShaderMaterial({ name: 'gears:floor', uniforms: floorU, vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true });
  premultipliedBlend(THREE, floorMat, 'over');
  const floorGeo = new THREE.CircleGeometry(BASE.radius, 128);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.name = 'gears:floor';
  floor.renderOrder = 1;
  disposables.push(floorGeo, floorMat);
  scene.add(floor);

  // the detail pass over the train (its geometry is the instrument's, borrowed per draw)
  const detailOn = { value: 0 };
  const placeholder = new THREE.BufferGeometry();
  disposables.push(placeholder);
  const details = DETAIL.map((d, di) => {
    const mat = new THREE.ShaderMaterial({
      name: 'gears:detail',
      uniforms: { ...light, uOn: detailOn, uTooth: { value: new THREE.Vector4(...d.teeth) }, uSeed: { value: di * 7.31 }, uJewel: { value: new THREE.Vector4(...d.jewel) } },
      vertexShader: DETAIL_VERT,
      fragmentShader: DETAIL_FRAG,
      transparent: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    premultipliedBlend(THREE, mat, 'over');
    const mesh = new THREE.Mesh(placeholder, mat);
    mesh.name = 'gears:detail:' + d.id;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1.5;
    mesh.visible = false;
    disposables.push(mat);
    scene.add(mesh);
    return { id: d.id, mesh, group: /** @type {any} */ (null), src: /** @type {any} */ (null) };
  });

  // the furniture on the plate (jewels, screws, bridges), rebuilt when the tier's share of it changes
  /** @type {ReturnType<typeof createDressing> | null} */
  let dressing = null;
  function ensureDressing() {
    if (dressing && dressing.tier === tier) return dressing;
    if (dressing) dressing.dispose();
    dressing = createDressing(THREE, tier, light);
    scene.add(dressing.object3D);
    return dressing;
  }

  // the glints at the two contacts (only one is lit at a time): a ~2 px core, a halo inside the tooth
  const glints = createPoints(THREE, [
    { p: MI, color: GLINT, size: 16, alpha: 0 },
    { p: IP, color: GLINT, size: 16, alpha: 0 },
  ], { additive: true, core: 1, coreK: 64, halo: 0.14, haloK: 5.5, lift: 0.012, name: 'gears:glint', renderOrder: 5 });
  disposables.push(glints);
  scene.add(glints.object3D);

  // the dust
  /** @type {any} */
  let motes = null;
  function buildMotes() {
    const [nf, nc] = MOTES[3];
    const n = nf + nc;
    const seed = new Float32Array(n * 4);
    const field = new Float32Array(n);
    const rand = rngFor ? rngFor(7, 'gears:motes') : mulberry(7);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = rand();
      field[i] = i < nf ? 0 : 1;
    }
    const g = new THREE.BufferGeometry();
    // positions are made in the shader; three still wants a position attribute
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aField', new THREE.BufferAttribute(field, 1));
    const uniforms = {
      uCentre: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector2(MOTE_BOX[0], MOTE_BOX[1]) },
      uW: { value: new THREE.Vector2(1, 0) },
      uKeep: { value: 1 },
      uTime: { value: 0 },
      uDrift: { value: new THREE.Vector3(0.006, 0.0025, -0.0045) },
      uKeyDir: light.uKeyDir,
      uFocus: { value: 1 },
      uDpr: { value: 1 },
      uNear: { value: 0.01 },
      uFog: light.uFog,
      uBright: { value: 0.36 },
      uQuiet: { value: new THREE.Vector4(-2, -2, -2, -2) },
      uQuietK: { value: 0 },
      uPool: light.uPool,
      uPoolR: light.uPoolR,
      uColor: { value: new THREE.Vector3(...MOTE) },
    };
    const material = new THREE.ShaderMaterial({ name: 'gears:motes', uniforms, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, transparent: true, depthWrite: false });
    premultipliedBlend(THREE, material, 'add');
    const points = new THREE.Points(g, material);
    points.name = 'gears:motes';
    points.frustumCulled = false;
    points.renderOrder = 4;
    const v4 = new THREE.Vector4();
    const v2 = new THREE.Vector2();
    points.onBeforeRender = (/** @type {any} */ r) => {
      uniforms.uDpr.value = drawPixelRatio(r, v4, v2);
    };
    disposables.push(g, material);
    scene.add(points);
    return { points, uniforms, nf, nc };
  }

  async function load(/** @type {((f: number) => void) | undefined} */ onProgress) {
    if (disposed) throw new Error('gears act: disposed');
    loading ||= (async () => {
      onProgress?.(0);
      motes = buildMotes();
      onProgress?.(0.4);
      if (inst) await (ctx.instrumentReady || ensureBuilt(inst));
      if (disposed) return;
      ready = true;
      onProgress?.(1);
    })();
    return loading;
  }

  const pool = { r0: 1e5, r1: 2e5 };
  const lamp = [0, 0, 0];
  const keyDir = [0, 1, 0];
  const keyNow = [0, 1, 0];
  const rimDir = [0, 1, 0];
  const envSky = [0, 0, 0];
  const envGround = [0, 0, 0];
  const rimCol = [0, 0, 0];
  let lastFwd = 0;

  /**
   * @param {any} frame
   * @param {number} time
   * @param {number} dist
   * @param {any} cam the THREE camera in use
   * @param {ArrayLike<number>} centre what the camera looks at (the dust gathers round it)
   * @param {ArrayLike<number>} fwd the camera's forward direction (world)
   */
  function stage(frame, time, dist, cam, centre, fwd) {
    const p = frame.params || {};
    const u = Number.isFinite(frame.u) ? frame.u : 4;
    const vp = frame.viewport === 'port' ? 'port' : 'land';
    const train = Number.isFinite(p.train) ? p.train : 1;
    const crank = Number.isFinite(p.crank) ? p.crank : 0;
    // from the plate's look during the lift, into darkness at the end
    const kIn = smoothstep(3.7, 4.25, u);
    const kOut = smoothstep(8.7, 9.0, u);
    // the climb out of the machine room: its glow comes from below, the cold sky from above
    const kUp = smoothstep(8.25, 8.55, u);
    // the lights against this camera
    if (Math.hypot(fwd[0], fwd[2]) > 1e-4) lastFwd = Math.atan2(-fwd[2], fwd[0]) / DEG;
    keyLight(keyNow, u, lastFwd);
    nlerpInto(keyDir, PLATE_KEY, keyNow, kIn);
    rimLight(rimDir, lastFwd);
    const keyI = lerp(1, KEY_I, kIn) * (1 - 0.15 * smoothstep(8.1, 8.6, u)) * (1 - 0.7 * kOut);
    const fogN = dist * lerp(1.24, 1.05, kIn);
    const fogF = lerp(dist * lerp(1.98, 2.7, kIn), fogN * 1.6, kOut);
    // the soft box: where the middle of the frame's flat faces mirror the lens, raised a little
    // (so its light falls beyond the subject and the near field stays dark for the text)
    {
      const b = light.uBoxDir.value;
      b.set(fwd[0], Math.abs(fwd[1]) + 0.1, fwd[2]);
      if (b.lengthSq() < 1e-8) b.set(0, 1, 0);
      b.normalize();
      const boxI = kIn * (1 - 0.75 * kOut);
      light.uBoxCol.value.set(BOX_COL[0] * boxI, BOX_COL[1] * boxI, BOX_COL[2] * boxI);
    }
    // the pool of light round the subject: wide open during the lift, closing as the macro look arrives
    const poolK = lerp(40, 1, smoothstep(0, 0.9, kIn));
    pool.r0 = 0.2 * dist * poolK;
    pool.r1 = 0.85 * dist * poolK;
    light.uSlab.value.set(dist, 0.5 * dist * poolK);
    light.uPool.value.set(centre[0], centre[1], centre[2]);
    light.uPoolR.value.set(pool.r0, pool.r1);
    light.uKeyDir.value.set(keyDir[0], keyDir[1], keyDir[2]);
    light.uKeyCol.value.set(KEY_COL[0] * keyI, KEY_COL[1] * keyI, KEY_COL[2] * keyI);
    light.uRimDir.value.set(rimDir[0], rimDir[1], rimDir[2]);
    light.uRimCol.value.set(ENV_RIM[0] * kIn, ENV_RIM[1] * kIn, ENV_RIM[2] * kIn);
    light.uFog.value.set(fogN, fogF);

    // text quiet zone of the beat in view
    const beat = Number.isInteger(frame.beat) ? frame.beat : -1;
    const quiet = beat >= 0 && BEATS[beat] ? BEATS[beat].quiet[vp] : null;
    const qk = quiet && isRect(quiet) ? beatOpacity(u) : 0;

    // backdrop
    const bu = backdrop.uniforms;
    bu.uBase.value.set(BG_BASE[0], BG_BASE[1], BG_BASE[2]);
    bu.uHorizon.value.set(lerp(BG_HORIZON[0], BG_GLOW[0], kUp), lerp(BG_HORIZON[1], BG_GLOW[1], kUp), lerp(BG_HORIZON[2], BG_GLOW[2], kUp));
    bu.uKeyGlow.value.set(KEY_GLOW[0], KEY_GLOW[1], KEY_GLOW[2]).multiplyScalar(kIn * (1 - 0.6 * kOut));
    bu.uRimGlow.value.set(RIM_GLOW[0], RIM_GLOW[1], RIM_GLOW[2]).multiplyScalar(kIn);
    bu.uKeyDir.value.set(keyDir[0], keyDir[1], keyDir[2]);
    bu.uRimDir.value.set(rimDir[0], rimDir[1], rimDir[2]);
    bu.uExposure.value = 1 - 0.5 * kOut;
    backdrop.setQuiet(quiet, qk);

    // what is built: the gears from `train`, the rest from `build`
    const build = Math.max(instrumentBuild(p.build ?? 0), Math.min(1, Math.max(0, train)) * 0.08);
    const reveal = trainReveal(train, build);
    const baseK = buildReveal(build).base ?? 0;

    // floor: comes in with the act, goes as the base rises to take its place
    const floorK = kIn * (1 - smoothstep(0, 0.6, baseK));
    floor.visible = floorK > 0.002;
    floorU.uOpacity.value = floorK;
    floorMat.depthWrite = floorK > 0.995;
    const C = trainCentres(crank, reveal);
    const tip = (/** @type {number} */ z) => (z * GEAR.module) / 2 + GEAR.module;
    light.uGear.value[0].set(0, 0, tip(GEAR.main.z), reveal.wheel);
    light.uGear.value[1].set(C.idler[0], C.idler[2], tip(GEAR.idler.z), reveal.idler);
    light.uGear.value[2].set(C.pinion[0], C.pinion[2], tip(GEAR.pinion.z), reveal.pinion);
    // the furniture goes with the floor
    const dr = ensureDressing();
    dr.object3D.visible = floorK > 0.002;
    dr.uniforms.uOpacity.value = floorK;
    dr.material.depthWrite = floorK > 0.995;
    // the idler's cap jewel rides its hub (parts.js: the hub's dome tops out at y 0.137)
    dr.hub.visible = reveal.idler > 0.001;
    dr.hub.position.set(C.idler[0], 0.127, C.idler[2]);
    const ly = Math.max(keyDir[1], 0.05);
    floorU.uShadowOff.value.set((-keyDir[0] / ly) * 0.08, (-keyDir[2] / ly) * 0.08);

    // the detail pass comes in once the metal has (the lift starts engraved)
    detailOn.value = smoothstep(0.55, 0.95, kIn) * (1 - 0.6 * kOut);

    // the warm glint where the teeth bear: main and idler, then idler and pinion
    const wMI = smoothstep(1.86, 2.0, train) * (1 - smoothstep(2.88, 3.0, train));
    const wIP = smoothstep(2.88, 3.0, train) * (1 - smoothstep(8.25, 8.55, u));
    const flick = (/** @type {number} */ ph) => {
      const x = (ph - Math.floor(ph) - 0.5) / 0.18;
      return 0.6 + 0.4 * Math.exp(-x * x);
    };
    const gk = kIn * (1 - 0.7 * kOut);
    glints.set(0, { alpha: wMI * gk * flick((C.T.main.rot * GEAR.main.z) / (2 * Math.PI)) });
    glints.set(1, { alpha: wIP * gk * flick((C.T.pinion.rot * GEAR.pinion.z) / (2 * Math.PI)) });
    glints.commit();
    glints.setFog(fogN * 1.4, fogF * 1.4);

    // dust round the shot: the fine field up close, the coarse one on the climb
    if (motes) {
      const mu = motes.uniforms;
      mu.uTime.value = reduced ? 0 : time;
      mu.uCentre.value.set(centre[0], centre[1], centre[2]);
      mu.uFocus.value = dist;
      mu.uNear.value = cam.near;
      mu.uW.value.set(kIn * (1 - kUp), kUp * (1 - 0.6 * kOut));
      mu.uBright.value = lerp(2.2, 4.5, kUp) * (1 - 0.6 * kOut);
      const [nf, nc] = MOTES[tier];
      mu.uKeep.value = (nf + nc) / (motes.nf + motes.nc);
      if (quiet && qk > 0) {
        mu.uQuiet.value.set(Math.min(quiet[0], quiet[2]), Math.min(quiet[1], quiet[3]), Math.max(quiet[0], quiet[2]), Math.max(quiet[1], quiet[3]));
        mu.uQuietK.value = qk;
      } else mu.uQuietK.value = 0;
    }
    return { u, vp, kIn, kOut, kUp, keyI, fog: [fogN, fogF], train, crank, build, reveal, centre };
  }

  /** @param {any} frame @param {ReturnType<typeof stage>} st */
  function holdInstrument(frame, st) {
    const bag = lease.acquire(scene, { position: [0, 0, 0] });
    inst.setBuild(st.build);
    inst.setCrank(st.crank);
    inst.setArms(0);
    inst.setContact(0);
    inst.setBrass(METAL * st.kIn);
    inst.setViewport(st.vp);
    inst.setCrankAccent(0);
    // the key is a lamp LAMP_DIST out along its direction, its cone the pool of light
    for (let i = 0; i < 3; i++) lamp[i] = st.centre[i] + keyDir[i] * LAMP_DIST;
    inst.setLight({
      dir: keyDir, color: KEY_COL, intensity: st.keyI * lerp(1, 0.5, st.kIn), ambient: lerp(0.03, 0.01, st.kIn), position: lamp, range: 1e4,
      cone: [Math.min(89, Math.atan(pool.r1 / LAMP_DIST) / DEG), Math.min(88, Math.atan(pool.r0 / LAMP_DIST) / DEG)],
    });
    mixInto(envSky, ENV_SKY_PLATE, ENV_SKY, st.kIn);
    mixInto(envSky, envSky, ENV_SKY_UP, st.kUp);
    mixInto(envGround, ENV_GROUND, ENV_GROUND_UP, st.kUp * (1 - st.kOut));
    for (let i = 0; i < 3; i++) rimCol[i] = ENV_RIM[i] * st.kIn;
    inst.setEnvColors({ sky: envSky, ground: envGround, rim: rimCol });
    inst.setLook({
      fog: st.fog, fogColor: FOG, macro: [0.004, 0.008], ink: 1, dark: 0.75, outline: lerp(1, 0.6, st.kIn), widthK: 1, spacing: 3.6, brush: lerp(1, 0.25, st.kIn),
      palette: { night: PALETTE.night, stage: PALETTE.stage },
    });
    // uniforms the setters do not reach (the lease restores every one on release): this act's
    // metals, satin roughness, and the rim from behind the subject instead of opposite the key
    if (bag) {
      const B = /** @type {any} */ (bag);
      const k = st.kIn;
      if (B.uMetal && Array.isArray(B.uMetal.value)) {
        B.uMetal.value.forEach((/** @type {any} */ v, /** @type {number} */ i) => {
          const m = METALS[i];
          if (m) v.set(lerp(v.x, m[0], k), lerp(v.y, m[1], k), lerp(v.z, m[2], k));
        });
      }
      if (B.uRough && B.uRough.value) {
        const R = B.uRough.value;
        // (a little softer on the climb, so a ring holds a band of light and not a hairline)
      const up = 0.1 * st.kUp;
      R.set(lerp(R.x, ROUGH[0] + up, k), lerp(R.y, ROUGH[1] + up * 0.5, k), lerp(R.z, ROUGH[2], k), lerp(R.w, ROUGH[3], k));
      }
      if (B.uPatina && B.uPatina.value) B.uPatina.value.set(PATINA[0], PATINA[1], PATINA[2]);
      if (B.uRimDir && B.uRimDir.value) B.uRimDir.value.set(rimDir[0], rimDir[1], rimDir[2]);
    }
    // the gears exactly as `train` says (a gear slides in and meshes)
    if (overrideTrain(inst, st.crank, st.reveal)) lease.markPose();
  }

  /** Lays the detail pass over the instrument's current train meshes. */
  function syncDetail() {
    const root = inst.object3D;
    root.updateMatrixWorld(true);
    const on = detailOn.value > 0.002;
    for (const d of details) {
      if (!d.group || d.group.parent !== root) {
        d.group = root.getObjectByName('instrument:' + d.id) || null;
        d.src = null;
      }
      if (d.group && (!d.src || d.src.parent !== d.group)) {
        d.src = d.group.children.find((/** @type {any} */ c) => c.isMesh && c.material && c.material.name === 'instrument-solid') || null;
      }
      const src = d.src;
      if (!on || !src || !d.group.visible || !src.visible) {
        d.mesh.visible = false;
        continue;
      }
      if (d.mesh.geometry !== src.geometry) d.mesh.geometry = src.geometry;
      d.mesh.matrix.copy(src.matrixWorld);
      d.mesh.matrixWorldNeedsUpdate = true;
      d.mesh.visible = true;
    }
  }
  function hideDetail() {
    for (const d of details) {
      d.mesh.visible = false;
      d.mesh.geometry = placeholder;
    }
  }

  /** The lens at u: the sharp plane sits on the camera's subject. @param {number} u @param {number} dist */
  function lensAt(u, dist) {
    // a macro lens wide open among the teeth; stopped down on the climb, where the rings want to be read
    // (and shut during the lift, where the plate act's line drawing is registered under this one)
    const up = smoothstep(8.15, 8.5, u);
    return { focus: dist, aperture: lerp(1.5, 0.13, up) * smoothstep(3.95, 4.3, u), slab: lerp(0.07, 0.2, up), near: 1, on: 1 };
  }

  const empty = new THREE.Scene();
  const look = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  return {
    id: 'gears',
    load,
    get ready() {
      return ready;
    },
    /** @param {number} t */
    setTier(t) {
      tier = Math.max(0, Math.min(3, Math.round(Number(t)) || 0));
    },
    /** @param {number} width @param {number} height @param {number} dpr */
    resize(width, height, dpr) {
      css.width = width;
      css.height = height;
      css.dpr = dpr || 1;
    },
    /**
     * @param {any} frame FrameState
     * @param {any} cam this act's FrameCamera
     * @param {any} target HalfFloat render target
     * @param {number} time seconds
     */
    render(frame, cam, target, time = 0) {
      if (disposed) return;
      const renderer = ctx.renderer;
      if (!ready || !frame) {
        renderInto(renderer, target, empty, camera, FOG);
        return;
      }
      const rc = resolveCamera('gears', frame, cam);
      const use = rc.three || camera;
      let dist = rc.dist;
      if (rc.frame) dist = applyFrameCamera(camera, rc.frame, aspectOf(target, css), { nearK: 0.012, minNear: 0.003, farK: 8, farAdd: 8 });
      use.getWorldDirection(fwd);
      look.copy(fwd).multiplyScalar(dist).add(use.position);
      const st = stage(frame, time, dist, use, [look.x, look.y, look.z], [fwd.x, fwd.y, fwd.z]);
      try {
        if (inst && inst.ready) {
          holdInstrument(frame, st);
          syncDetail();
        } else hideDetail();
        // tier 0 draws straight into the target; above it the scene goes through the lens
        const lens = tier >= 1 && target && target.isWebGLRenderTarget ? lensAt(st.u, dist) : null;
        if (lens) {
          renderInto(renderer, dof.ensure(target), scene, use, FOG);
          dof.apply(renderer, target, use, { ...lens, tier });
        } else {
          dof.free();
          renderInto(renderer, target, scene, use, FOG);
        }
      } finally {
        if (lease && lease.held) lease.release();
        // never keep the instrument's geometry referenced between draws
        hideDetail();
      }
    },
    pick() {
      return null;
    },
    stonesScreen() {
      return [];
    },
    /**
     * Suggested film-finish options (the stage may ignore them): glow from the highlights
     * above 0.9 (edge breaks, the key's fans, the glint), a shoulder from 0.8 so they roll
     * off instead of clipping, a firmer vignette, a little more grain.
     */
    finishHints() {
      return { glow: { strength: 1, threshold: 0.9 }, rolloff: { knee: 0.8, white: 0.25 }, vignette: 0.34, grain: 0.026 };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (lease && lease.held) lease.release();
      hideDetail();
      for (const d of disposables) d.dispose?.();
      dof.dispose();
      if (dressing) dressing.dispose();
      scene.clear();
    },
  };
}

/** Fallback generator when ctx.rngFor is missing (tests). @param {number} a */
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
