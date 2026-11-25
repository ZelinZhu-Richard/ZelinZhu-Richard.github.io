// Act 1, the plate (sections 0-3; STORYBOARD.md). Night and one orange point;
// the point's line closes into a circle and the astrolabe wheel is drawn on a
// notebook page like a draughtsman's plate, with a dot grid and handwritten
// notes on curved leaders; then the camera tilts and the wheel rises out of
// its drawing as a solid, leaving its outline on the page as a ghost and a
// soft engraved shadow under it, and the camera dives into its teeth (the
// 'lift' hand-over to the gears act).
//
// World (engine/choreo/choreography.mjs): instrument units, the page on
// y = 0 facing +Y, the drawn wheel at the origin, screen-up -Z. The solid is
// the shared instrument with only its wheel and rule built; at lift = 1 it
// stands PLATE_LIFT_Y up, where the dive's camera keys expect it.
//
// Driven by frame.params: draw (the drawing), lift (the wheel off the page),
// crank (the solid wheel turns once it lifts). The drawing itself does not
// turn: it is drawn at the wheel's angle at the moment the lift begins, so the
// solid leaves it exactly. Everything is a function of (frame, time); time
// only breathes the orange point, and not under reduced motion.

import { createPlateDrawing } from '../instrument/plate.js';
import { plateStrokes, beneathStrokes, plateAnchors, wheelAngle } from '../instrument/strokes.js';
import { LineData } from '../instrument/lines.js';
import { makeUniforms, lineMaterial, lineMesh } from '../instrument/materials.js';
import { createViewSync } from '../instrument/viewsync.js';
import { gearOutline } from '../instrument/gear.js';
import { GEAR, ALIDADE_ANGLE } from '../instrument/layout.js';
import { ASTRO, alidadeCovers } from '../instrument/rete.js';
import { CRANK_PHASE, CRANK_PER_U, PLATE_LIFT_Y } from '../choreo/choreography.mjs';
import { clamp01, smoothstep, lerp, hexLinear, lightDir, INK } from './shared/math.js';
import { resolveCamera, applyFrameCamera, aspectOf } from './shared/camera.js';
import { createRenderInto, premultipliedBlend } from './shared/render.js';
import { createLease, ensureBuilt } from './shared/lease.js';
import { createPoints } from './shared/points.js';
import { textTexture, TEXT_VERT, TEXT_FRAG } from './shared/text.js';

/**
 * @typedef {{ THREE: any, renderer: any, assetsBase?: string, rngFor?: (seed: any, key: string) => () => number,
 *   instrument: any, sky?: any, tier?: number, reducedMotion?: boolean, instrumentReady?: Promise<any> }} ActContext
 */

// ------------------------------------------------------------------ knobs ---

/** The choreography's lift track leaves 0 here; the drawing is drawn at the wheel's angle then. */
export const LIFT_FROM_U = 3.12;
const DRAW_ANGLE = wheelAngle(CRANK_PHASE + CRANK_PER_U * LIFT_FROM_U);

/** How far below the page the solid wheel waits before it rises through it. */
const SUNK = 0.1;
/** The wheel's mid-thickness above its own floor (layout.js GEAR: y0 0.02, thick 0.07). */
const WHEEL_MID = GEAR.y0 + GEAR.main.thick / 2;
const TIP_R = gearOutline(GEAR.main.z, GEAR.module).ra;

/** One light for the act (sketches/instrument shots.js 'lift': key az 128, el 58). */
const KEY = lightDir(128, 58);

const NIGHT = hexLinear(INK.night);
const PAPER = hexLinear('#141319');
const HATCH = hexLinear('#34313d');
const ORANGE = hexLinear(INK.accent, 3.4);
const NIB = hexLinear(INK.ink, 1.5);
const NOTE_INK = hexLinear('#d8d4ca');
const DOT = hexLinear(INK.faint);

/**
 * The page per viewport (sketches/instrument layout.js PLATE): the sheet in
 * plan coordinates [x0, y0, x1, y1], the margin, the notes (`at` is where the
 * leader starts and the words sit above-right of it), and the scale the notes'
 * type was set for (CSS px per unit at the plate framing).
 */
const PAGES = {
  land: {
    sheet: [-1.6, -1.82, 2.3, 1.82],
    margin: 0.3,
    k: 220,
    px: 13,
    notes: [
      { id: 'limb', lines: ['48 teeth = 360°'], at: [1.36, 0.06], target: { tooth: 8 }, bow: 0.18 },
      { id: 'rete', lines: ['rete · twelve stars'], at: [1.25, 1.42], target: { star: [0.7, 0.7] }, bow: -0.22 },
      { id: 'rule', lines: ['the rule turns,', 'the sky stays'], at: [1.22, -1.4], target: { rule: 1 }, bow: 0.2 },
    ],
  },
  // the page is narrow on a phone: two notes below the wheel
  port: {
    sheet: [-1.6, -2.78, 1.6, 1.8],
    margin: 0.24,
    k: 114,
    px: 12,
    notes: [
      { id: 'rete', lines: ['rete · twelve stars'], at: [-1.3, -1.62], target: { star: [-0.55, -0.55] }, bow: 0.22 },
      { id: 'rule', lines: ['the rule turns'], at: [-0.05, -2.25], target: { rule: 1 }, bow: 0.2 },
    ],
  },
};

/** Draw-on windows of the notes (leader, then words), on the drawing's own scale. */
const NOTE_WINDOWS = { limb: [0.46, 0.6], rete: [0.69, 0.82], rule: [0.885, 0.995] };
/** Share of a note's window its leader takes before the words are written. */
const LEADER_SHARE = 0.42;

/** Angles (degrees, on the drawing) of the three construction lines the lift draws up to the wheel. */
const PROJECTIONS = [208, 332, 118];

/**
 * The choreography's draw param says "the line closes into a circle" at 0.25;
 * the drawing's own order closes the pitch circle at 0.16 (strokes.js
 * DRAW_ORDER). This maps the first onto the second, so the hold at 0.25 lands
 * on the closed circle.
 * @param {number} d
 */
export function drawOf(d) {
  const x = clamp01(d);
  return x <= 0.25 ? x * (0.16 / 0.25) : 0.16 + ((x - 0.25) / 0.75) * 0.84;
}

// ----------------------------------------------------------------- shaders ---

export const PAPER_VERT = /* glsl */ `
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

// The page: night where lit (the paper is only felt through its lines), a
// little lifted as a sheet, and in the lifted wheel's shadow a darker tone
// engraved as a hairline hatch, crossed where the shadow is deepest.
export const PAPER_FRAG = /* glsl */ `
uniform vec3 uNight;
uniform vec3 uPaper;
uniform vec3 uHatch;
uniform float uPageK;
uniform vec4 uShadow;
uniform float uShadowK;
uniform float uDpr;
uniform vec2 uFog;
uniform vec3 uFogCol;
varying vec3 vW;
varying float vDist;
float hatch(float c, float spacing, float hw) {
  float g = max(fwidth(c), 1e-7);
  float spx = spacing / g;
  float d = abs(fract(c / spacing + 0.5) - 0.5) * spx;
  float line = clamp(hw + 0.5 - d, 0.0, 1.0);
  float mean = clamp(2.0 * hw / spx, 0.0, 1.0);
  return mix(mean, line, smoothstep(2.6, 4.2, spx / uDpr));
}
void main() {
  vec2 p = vW.xz;
  float d = length(p - uShadow.xy);
  float sh = (1.0 - smoothstep(uShadow.z - uShadow.w, uShadow.z + uShadow.w, d)) * uShadowK;
  vec3 col = mix(uNight, uPaper, uPageK);
  col = mix(col, uNight * 0.5, 0.75 * sh);
  float hw = 0.42 * uDpr;
  float h1 = hatch(0.7071 * (p.x + p.y), 0.03, hw) * smoothstep(0.08, 0.45, sh);
  float h2 = hatch(0.7071 * (p.x - p.y), 0.03, hw) * smoothstep(0.5, 0.9, sh);
  col = mix(col, uHatch, clamp(max(h1, h2), 0.0, 1.0) * 0.85 * uPageK);
  col = mix(col, uFogCol, smoothstep(uFog.x, uFog.y, vDist));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------------ helpers ---

const rot2 = (/** @type {number[]} */ p, /** @type {number} */ th) => [p[0] * Math.cos(th) - p[1] * Math.sin(th), p[0] * Math.sin(th) + p[1] * Math.cos(th)];
const W = (/** @type {number[]} */ p, y = 0.003) => [p[0], y, -p[1]];
const UP = [0, 1, 0];

/**
 * The pen's path: every drawn segment of the plate drawing in draw order, in
 * world coordinates at the drawing's angle, so the nib sits at the front.
 * @param {number} rot
 */
function penPath(rot) {
  const { wheel, fixed } = plateStrokes();
  const beneath = beneathStrokes(rot);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  /** @type {{ o0: number, o1: number, a: number[], b: number[] }[]} */
  const segs = [];
  const add = (/** @type {any} */ L, turn) => {
    for (let i = 0; i < L.count; i++) {
      const o0 = L.o[2 * i];
      const o1 = L.o[2 * i + 1];
      if (!(o1 > o0)) continue;
      let a = [L.a[3 * i], L.a[3 * i + 1], L.a[3 * i + 2]];
      let b = [L.b[3 * i], L.b[3 * i + 1], L.b[3 * i + 2]];
      // three's rotation.y = rot: (x, z) -> (x c + z s, -x s + z c)
      if (turn) {
        a = [a[0] * c + a[2] * s, a[1], -a[0] * s + a[2] * c];
        b = [b[0] * c + b[2] * s, b[1], -b[0] * s + b[2] * c];
      }
      segs.push({ o0, o1, a, b });
    }
  };
  add(wheel, true);
  add(fixed, false);
  add(beneath, false);
  segs.sort((x, y) => x.o0 - y.o0);
  const o0 = Float64Array.from(segs.map((q) => q.o0));
  return {
    /** The pen's position at draw t, or null outside every window. @param {number} t @param {number[]} out */
    at(t, out) {
      let lo = 0;
      let hi = segs.length - 1;
      if (hi < 0 || t < o0[0]) return null;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (o0[mid] <= t) lo = mid;
        else hi = mid - 1;
      }
      const q = segs[lo];
      const k = clamp01((t - q.o0) / (q.o1 - q.o0));
      out[0] = q.a[0] + (q.b[0] - q.a[0]) * k;
      out[1] = q.a[1] + (q.b[1] - q.a[1]) * k;
      out[2] = q.a[2] + (q.b[2] - q.a[2]) * k;
      return out;
    },
  };
}

/** A rounded rectangle (plan). */
function rounded(x0, y0, x1, y1, r, n = 6) {
  const out = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  return out;
}

/**
 * Where a note's leader ends (plan), from the drawing's anchors at its angle.
 * @param {any} target
 * @param {ReturnType<typeof plateAnchors>} A
 */
function noteTarget(target, A) {
  if (target.star) {
    const want = target.star;
    let best = null;
    for (const s of A.stars) {
      if (alidadeCovers(rot2(s.tip, -ALIDADE_ANGLE))) continue;
      const d = Math.hypot(s.tip[0] - want[0], s.tip[1] - want[1]);
      if (!best || d < best.d) best = { d, p: s.tip };
    }
    return best ? best.p : want;
  }
  if (target.tooth !== undefined) return A.tooth(target.tooth);
  return A.ruleTip(target.rule);
}

// --------------------------------------------------------------------- act ---

/**
 * @param {ActContext} ctx
 */
export function createPlateAct(ctx) {
  const { THREE } = ctx;
  const inst = ctx.instrument;
  const reduced = !!ctx.reducedMotion;
  const scene = new THREE.Scene();
  scene.name = 'act:plate';
  const camera = new THREE.PerspectiveCamera(30, 1.6, 0.1, 100);
  const renderInto = createRenderInto(THREE);
  const lease = inst ? createLease(inst) : null;
  const css = { width: 0, height: 0, dpr: 1 };
  let tier = Number.isFinite(ctx.tier) ? /** @type {number} */ (ctx.tier) : 2;
  let ready = false;
  let disposed = false;
  /** @type {Promise<void> | null} */
  let loading = null;

  /** @type {any} */
  let drawing = null;
  /** @type {any} */
  let pen = null;
  /** @type {Record<string, any>} */
  const pages = {};
  /** @type {any[]} */
  const disposables = [];

  // my own ribbons (page, leaders, construction lines) share one uniform bag
  // with the plate drawing's look
  const U = makeUniforms(THREE);
  U.uBrass.value = 0;
  U.uDarkScale.value = 1;
  const lineRoot = new THREE.Group();
  const sync = createViewSync(THREE, U, lineRoot, { centre: [0, 0, 0] });
  const hook = (/** @type {any} */ r, /** @type {any} */ s, /** @type {any} */ c) => sync(r, c);
  /** @param {number} draw0 */
  function ribbonMaterial(draw0 = 1) {
    const m = lineMaterial(THREE, U, { draw: true, bias: 0 });
    m.uniforms.uOutline = { value: 1 };
    m.uniforms.uDraw.value = draw0;
    disposables.push(m);
    return m;
  }
  /** @param {any} L @param {any} m */
  function ribbons(L, m) {
    const mesh = lineMesh(THREE, L, m, { draw: true });
    mesh.onBeforeRender = hook;
    disposables.push(mesh.geometry);
    return mesh;
  }

  // the centre point and the nib (one draw)
  const marks = createPoints(THREE, [
    { p: [0, 0.004, 0], color: ORANGE, size: 7, alpha: 1 },
    { p: [0, 0.004, 0], color: NIB, size: 4.5, alpha: 0 },
  ], { additive: true, halo: 0.32, haloK: 3.2, core: 1, coreK: 16, lift: 0.002, name: 'plate:marks', renderOrder: 6 });
  disposables.push(marks);

  // the page surface: depth for the solid to rise through, the soft shadow
  const paperU = {
    uNight: { value: new THREE.Vector3(...NIGHT) },
    uPaper: { value: new THREE.Vector3(...PAPER) },
    uHatch: { value: new THREE.Vector3(...HATCH) },
    uPageK: { value: 0 },
    uShadow: { value: new THREE.Vector4(0, 0, TIP_R, 0.05) },
    uShadowK: { value: 0 },
    uDpr: { value: 1 },
    uFog: { value: new THREE.Vector2(1e6, 2e6) },
    uFogCol: { value: new THREE.Vector3(...NIGHT) },
  };
  const paperMat = new THREE.ShaderMaterial({ name: 'plate:paper', uniforms: paperU, vertexShader: PAPER_VERT, fragmentShader: PAPER_FRAG });
  disposables.push(paperMat);

  /** @param {'land' | 'port'} vp */
  function buildPage(vp) {
    const P = PAGES[vp];
    const group = new THREE.Group();
    group.name = 'plate:page:' + vp;
    const [x0, y0, x1, y1] = P.sheet;

    // the sheet
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...W([x0, y0], 0), ...W([x1, y0], 0), ...W([x1, y1], 0), ...W([x0, y1], 0)], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    disposables.push(g);
    const sheet = new THREE.Mesh(g, paperMat);
    sheet.name = 'plate:sheet';
    sheet.renderOrder = 0;
    sheet.onBeforeRender = (/** @type {any} */ r) => {
      paperU.uDpr.value = r.getPixelRatio() || 1;
    };
    group.add(sheet);

    // its edge, the page beneath peeking out, the margin rule: they fade in with the
    // page (one pen at a time: the drawing's)
    const L = new LineData();
    const poly = (pts, w, t, closed) => L.polyline(pts.map((p) => W(p)), w, t, { closed, normal: UP, maxLen: 0.05 });
    poly(rounded(x0, y0, x1, y1, 0.07), 1.3, 0.55, true);
    const o = 0.045;
    poly([[x1 + o, y1 - 0.16], [x1 + o, y0 - o + 0.05], [x1 + o - 0.05, y0 - o], [x0 + 0.16, y0 - o]], 0.9, 0.3, false);
    poly([[x0 + P.margin, y1 - 0.02], [x0 + P.margin, y0 + 0.02]], 0.7, -0.8, false);
    L.order(0, L.count, 0, 0);
    const pageMat = ribbonMaterial(1.001);
    group.add(ribbons(L, pageMat));

    // the dot grid, kept off the wheel; dots come up from the centre outward
    const dots = [];
    const sp = 0.2;
    for (let x = Math.ceil((x0 + P.margin + 0.05) / sp) * sp; x < x1 - 0.06; x += sp) {
      for (let y = Math.ceil((y0 + 0.06) / sp) * sp; y < y1 - 0.06; y += sp) {
        if (Math.hypot(x, y) < ASTRO.tipR + 0.08) continue;
        dots.push({ p: W([x, y], 0.002), color: DOT, size: 1.25, alpha: 0 });
      }
    }
    const dotR = dots.map((d) => Math.hypot(d.p[0], d.p[2]));
    const dotMax = Math.max(...dotR, 1);
    const dotSet = createPoints(THREE, dots, { additive: false, disc: 1, name: 'plate:dots', renderOrder: 1 });
    disposables.push(dotSet);
    group.add(dotSet.object3D);

    // notes: leaders (ribbons, drawn on) and words (textures, written on)
    const A = plateAnchors(DRAW_ANGLE);
    const N = new LineData();
    /** @type {any[]} */
    const words = [];
    for (const n of P.notes) {
      const win = NOTE_WINDOWS[/** @type {'limb' | 'rete' | 'rule'} */ (n.id)];
      const wLead = win[0] + (win[1] - win[0]) * LEADER_SHARE;
      const S = n.at;
      const E = noteTarget(n.target, A);
      const len = Math.hypot(E[0] - S[0], E[1] - S[1]) || 1;
      const u = [(E[0] - S[0]) / len, (E[1] - S[1]) / len];
      const v = [-u[1], u[0]];
      const C = [(S[0] + E[0]) / 2 + v[0] * len * n.bow, (S[1] + E[1]) / 2 + v[1] * len * n.bow];
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const w = 1 - t;
        // a slight tremor, as a pen line has
        const j = 0.004 * Math.sin(t * 23.0 + S[0] * 7) * Math.sin(Math.PI * t);
        pts.push([w * w * S[0] + 2 * w * t * C[0] + t * t * E[0] + v[0] * j, w * w * S[1] + 2 * w * t * C[1] + t * t * E[1] + v[1] * j]);
      }
      const end = pts.length - 1;
      const i0 = N.count;
      N.polyline(pts.slice(0, end - 1).map((p) => W(p, 0.0035)), 1.0, 0.68, { normal: UP });
      N.order(i0, N.count, win[0], wLead - 0.012);
      const back = pts[end - 4];
      const dl = Math.hypot(E[0] - back[0], E[1] - back[1]) || 1;
      const ue = [(E[0] - back[0]) / dl, (E[1] - back[1]) / dl];
      const i1 = N.count;
      for (const sgn of [1, -1]) {
        const a = rot2(ue, sgn * 0.42);
        N.seg(W(E, 0.0035), W([E[0] - a[0] * 0.05, E[1] - a[1] * 0.05], 0.0035), UP, UP, 1.0, 0.68);
      }
      N.order(i1, N.count, wLead - 0.012, wLead);

      // the words, above-right of the leader's start, tilted a little as written
      const tex = textTexture(THREE, n.lines, { px: P.px, anisotropy: anisotropy() });
      if (tex) {
        const k = P.k;
        const ang = 2.5 * (Math.PI / 180);
        const bl = [S[0] + (2 - tex.pad) / k, S[1] + (2 - tex.pad) / k];
        const ex = [Math.cos(ang) * (tex.width / k), Math.sin(ang) * (tex.width / k)];
        const ey = [-Math.sin(ang) * (tex.height / k), Math.cos(ang) * (tex.height / k)];
        const c0 = bl;
        const c1 = [bl[0] + ex[0], bl[1] + ex[1]];
        const c2 = [c1[0] + ey[0], c1[1] + ey[1]];
        const c3 = [bl[0] + ey[0], bl[1] + ey[1]];
        const tg = new THREE.BufferGeometry();
        tg.setAttribute('position', new THREE.Float32BufferAttribute([...W(c0, 0.0036), ...W(c1, 0.0036), ...W(c2, 0.0036), ...W(c3, 0.0036)], 3));
        tg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
        tg.setIndex([0, 1, 2, 0, 2, 3]);
        const tm = new THREE.ShaderMaterial({
          name: 'plate:note',
          uniforms: {
            tText: { value: tex.texture },
            uColor: { value: new THREE.Vector3(...NOTE_INK) },
            uAlpha: { value: 0 },
            uReveal: { value: 0 },
            uFog: { value: new THREE.Vector2(1e6, 2e6) },
          },
          vertexShader: TEXT_VERT,
          fragmentShader: TEXT_FRAG,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        premultipliedBlend(THREE, tm, 'over');
        const mesh = new THREE.Mesh(tg, tm);
        mesh.name = 'plate:note:' + n.id;
        mesh.renderOrder = 4;
        group.add(mesh);
        disposables.push(tg, tm, tex.texture);
        words.push({ mesh, win: [wLead, win[1]] });
      }
    }
    const noteMat = ribbonMaterial(0);
    group.add(ribbons(N, noteMat));

    return { group, pageMat, noteMat, dotSet, dotR, dotMax, words };
  }

  // the construction lines the lift draws from the outline up to the wheel
  const projU = (() => {
    const L = new LineData();
    const top = PLATE_LIFT_Y + GEAR.y0 - 0.003;
    for (const deg of PROJECTIONS) {
      const a = (deg * Math.PI) / 180 + DRAW_ANGLE;
      const p = [TIP_R * Math.cos(a), TIP_R * Math.sin(a)];
      const i0 = L.count;
      L.pattern([W(p, 0.003), W(p, 0.003 + top)], [0.045, 0.03], 0.7, 0.36, {});
      // the three climb together, each from the page up
      L.order(i0, L.count, 0, 1);
    }
    const m = ribbonMaterial(0);
    const mesh = ribbons(L, m);
    mesh.name = 'plate:projections';
    return { mesh, m, top };
  })();
  lineRoot.add(projU.mesh);
  scene.add(lineRoot, marks.object3D);

  function anisotropy() {
    try {
      return Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
    } catch {
      return 1;
    }
  }

  async function load(/** @type {((f: number) => void) | undefined} */ onProgress) {
    if (disposed) throw new Error('plate act: disposed');
    loading ||= (async () => {
      onProgress?.(0);
      drawing = createPlateDrawing({ THREE, crank: 0, draw: 0, ghost: 0 });
      // the drawing's own angle (re-clips the plate beneath once)
      drawing.setCrank(CRANK_PHASE + CRANK_PER_U * LIFT_FROM_U);
      scene.add(drawing.object3D);
      onProgress?.(0.3);
      pen = penPath(DRAW_ANGLE);
      onProgress?.(0.5);
      for (const vp of /** @type {const} */ (['land', 'port'])) {
        pages[vp] = buildPage(vp);
        pages[vp].group.visible = false;
        lineRoot.add(pages[vp].group);
      }
      onProgress?.(0.7);
      if (inst) await (ctx.instrumentReady || ensureBuilt(inst));
      if (disposed) return;
      ready = true;
      onProgress?.(1);
    })();
    return loading;
  }

  const penAt = [0, 0, 0];

  /**
   * Sets up the scene for a frame: page, drawing, notes, marks. Returns the
   * lift, where the solid stands, and the fog.
   * @param {any} frame
   * @param {number} time
   * @param {number} dist camera distance (fog)
   */
  function stage(frame, time, dist) {
    const p = frame.params || {};
    const vp = frame.viewport === 'port' ? 'port' : 'land';
    const draw = drawOf(p.draw ?? 0);
    const lift = clamp01(p.lift ?? 0);
    const u = Number.isFinite(frame.u) ? frame.u : 0;
    const ghost = smoothstep(0, 0.3, lift);
    const fogN = dist * 1.24;
    const fogF = dist * 1.98;

    for (const k of /** @type {const} */ (['land', 'port'])) if (pages[k]) pages[k].group.visible = k === vp;
    const pg = pages[vp];

    // the drawing
    drawing.setDraw(draw);
    drawing.setGhost(ghost);
    drawing.setLook({ ink: 1, outline: 1, widthK: vp === 'port' ? 0.82 : 1, fog: [fogN, fogF], fogColor: INK.night, palette: { night: INK.night } });
    U.uWidthK.value = vp === 'port' ? 0.82 : 1;
    U.uFog.value.set(fogN, fogF);
    U.uNight.value.set(NIGHT[0], NIGHT[1], NIGHT[2]);
    U.uFogCol.value.set(NIGHT[0], NIGHT[1], NIGHT[2]);

    // the page comes up with the first strokes; its dots from the centre out
    const pageK = smoothstep(0, 0.2, draw);
    const dotA = lerp(0.5, 0.3, ghost);
    paperU.uPageK.value = pageK;
    paperU.uFog.value.set(fogN, fogF);
    pg.pageMat.uniforms.uOutline.value = pageK;
    const reach = smoothstep(0, 0.32, draw) * 1.15;
    for (let i = 0; i < pg.dotR.length; i++) {
      const d = pg.dotR[i] / pg.dotMax;
      pg.dotSet.set(i, { alpha: dotA * smoothstep(d - 0.15, d, reach) });
    }
    pg.dotSet.commit();
    pg.dotSet.setFog(fogN, fogF);

    // notes: leaders on the drawing's scale, words after them; gone with the ghost
    pg.noteMat.uniforms.uDraw.value = draw >= 1 ? 1.001 : draw;
    pg.noteMat.uniforms.uOutline.value = 1 - ghost;
    for (const w of pg.words) {
      const t = clamp01((draw - w.win[0]) / (w.win[1] - w.win[0]));
      w.mesh.material.uniforms.uReveal.value = draw >= 1 ? 1 : t;
      w.mesh.material.uniforms.uAlpha.value = (t > 0 ? 0.92 : 0) * (1 - ghost);
      w.mesh.material.uniforms.uFog.value.set(fogN, fogF);
    }

    // the orange point, breathing a little; the nib at the drawing's front
    const breath = reduced ? 1 : 1 + 0.08 * Math.sin(time * 1.6);
    marks.set(0, { alpha: 1 - smoothstep(3.8, 3.98, u), size: 7 * breath });
    let nibA = 0;
    if (draw > 0 && draw < 1 && pen.at(draw, penAt)) {
      nibA = smoothstep(0, 0.012, draw) * (1 - smoothstep(0.975, 0.999, draw));
      marks.set(1, { p: [penAt[0], 0.0042, penAt[2]] });
    }
    marks.set(1, { alpha: nibA });
    marks.commit();
    marks.setFog(fogN * 1.5, fogF * 1.5);

    // the solid rises through the page, then stands PLATE_LIFT_Y up
    const y = lerp(-SUNK, PLATE_LIFT_Y, lift);
    const h = y + WHEEL_MID;
    if (lift > 0 && h > 0) {
      paperU.uShadow.value.set((-h * KEY[0]) / KEY[1], (-h * KEY[2]) / KEY[1], TIP_R, 0.03 + 0.2 * h);
      paperU.uShadowK.value = 0.85 * (1 - 0.4 * smoothstep(0, PLATE_LIFT_Y, h)) * smoothstep(0, 0.06, h);
    } else paperU.uShadowK.value = 0;

    // construction lines climb with the wheel
    const climb = clamp01((y + GEAR.y0 - 0.003) / projU.top);
    projU.m.uniforms.uDraw.value = lift > 0 ? climb : 0;
    projU.m.uniforms.uOutline.value = smoothstep(0.02, 0.25, lift) * (1 - smoothstep(3.62, 3.82, u));
    return { lift, y, fog: [fogN, fogF] };
  }

  /** @param {any} frame @param {number} y @param {number[]} fog */
  function holdInstrument(frame, y, fog) {
    const p = frame.params || {};
    lease.acquire(scene, { position: [0, y, 0] });
    // the wheel and its rule only (instrument build 0.08 is the wheel window's end)
    inst.setBuild(0.08);
    inst.setCrank(p.crank ?? 0);
    inst.setArms(0);
    inst.setContact(0);
    inst.setBrass(0);
    inst.setViewport(frame.viewport === 'port' ? 'port' : 'land');
    inst.setCrankAccent(0);
    inst.setLight({ dir: KEY, color: [1, 1, 1], intensity: 1, ambient: 0.03 });
    inst.setEnvColors({ sky: '#1b2440', ground: INK.stage, rim: '#27e0d0' });
    inst.setLook({
      fog, fogColor: INK.night, macro: [0.004, 0.008], ink: 1, dark: 0.7, outline: 1, widthK: 1, spacing: 3.6, brush: 1,
      palette: { night: INK.night, stage: INK.stage, shade: INK.muted },
    });
  }

  const empty = new THREE.Scene();

  return {
    id: 'plate',
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
     * @param {any} cam this act's FrameCamera (frame.camera or frame.cameraB)
     * @param {any} target HalfFloat render target
     * @param {number} time seconds
     */
    render(frame, cam, target, time = 0) {
      if (disposed) return;
      const renderer = ctx.renderer;
      if (!ready || !frame) {
        renderInto(renderer, target, empty, camera, NIGHT);
        return;
      }
      const rc = resolveCamera('plate', frame, cam);
      const use = rc.three || camera;
      let dist = rc.dist;
      if (rc.frame) dist = applyFrameCamera(camera, rc.frame, aspectOf(target, css), { nearK: 0.02, minNear: 0.004, farK: 2.5, farAdd: 12 });
      const st = stage(frame, time, dist);
      try {
        // the solid exists once the lift begins
        if (inst && inst.ready && st.lift > 0) holdInstrument(frame, st.y, st.fog);
        renderInto(renderer, target, scene, use, NIGHT);
      } finally {
        if (lease && lease.held) lease.release();
      }
    },
    pick() {
      return null;
    },
    stonesScreen() {
      return [];
    },
    /** Suggested film-finish options for this act's frames (the stage may ignore them). */
    finishHints() {
      return { glow: { strength: 0.6, threshold: 0.8 }, vignette: 0.2, grain: 0.018 };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (lease && lease.held) lease.release();
      drawing?.dispose();
      for (const d of disposables) d.dispose?.();
      scene.clear();
    },
  };
}
