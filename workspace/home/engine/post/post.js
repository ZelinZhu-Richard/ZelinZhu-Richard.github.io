// engine/post: the one composer and film finish for the whole engine.
// Unifies sketches/instrument/finish.js (glow from bright pixels only, quiet
// zones that dim only what is bright under the text, grain, vignette) and
// sketches/room/post.js (half-float HDR input, three glow levels in CSS
// pixels, path to white, sRGB encode in the last pass, dither).
//
// One frame:
//   acts render into targets from acquireTarget()   (linear HDR, one render call each)
//   post.compose({ a, b, mix, kind })                  at most one full-screen pass
//   post.finish({ quietZones, vignette, grain, glow, time })   glow chain + the canvas
//
// Rules this module keeps (and asks of its callers):
//  - three discards a multisampled buffer after every resolve (it calls
//    invalidateFramebuffer right after the blit at the end of each render
//    call), so a second render call into an MSAA target starts from garbage.
//    Every target here is written by exactly one render call per frame; an
//    act gets exactly one render call per MSAA target too. Draw a backdrop
//    into its own non-MSAA target first and sample it as a full-screen quad in
//    the act's single main render (sketches/room does this).
//  - Colour: targets are linear (HalfFloat RGBA, NoColorSpace). Programs that
//    draw into a target are built with three's linear working space, so
//    colorspace_fragment is an identity there. sRGB textures (baked atlases,
//    saved through Blender's display transform) decode to linear in the
//    fetch; nothing tone maps; finish() alone encodes sRGB, with an identity
//    shoulder below 1 by default (rolloff.knee = 1). So a baked texel comes
//    out at its own sRGB value. Keep renderer.outputColorSpace at
//    SRGBColorSpace (three's default; stats() reports it): finish() writes
//    sRGB-encoded values and a Display-P3 drawing buffer would misread them.
//  - Only finish() writes the canvas. Acts never do.

import * as THREE from 'three';
import { SHADERS, COMPOSE_KINDS, QUIET_N, gaussTaps } from './shaders.js';
import { clampTier, msaaSamples, tierSettings } from '../quality/tiers.js';

export { SHADERS, COMPOSE_KINDS, QUIET_N, gaussTaps } from './shaders.js';

/**
 * @typedef {'cut' | 'fade' | 'lift' | 'reveal' | 'dissolve'} TransitionKind
 * @typedef {THREE.WebGLRenderTarget | THREE.Texture} ActImage
 * @typedef {{
 *   msaa?: boolean,          // multisampled at the tier's sample count (default false)
 *   depth?: boolean,         // depth buffer (default true)
 *   depthTexture?: boolean,  // depth as a sampleable THREE.DepthTexture (default false; implies depth)
 *   stencil?: boolean,       // stencil buffer (default false)
 *   scale?: number,          // size relative to `space` (default 1)
 *   space?: 'device' | 'css',// 'device' = the canvas drawing buffer (default), 'css' = CSS pixels
 *   size?: [number, number] | null, // fixed size in pixels instead (not resized)
 * }} TargetOptions
 * @typedef {{ dir?: number, travel?: number, feather?: number }} LiftParams
 *   dir: +1 A rises (B uncovered from the bottom), -1 A sinks; travel: how far A
 *   moves, fraction of the height (0..0.25); feather: width of the soft edge, fraction of the height
 * @typedef {{ soft?: number, spread?: number, lo?: number, hi?: number }} RevealParams
 *   soft: softness of each pixel's switch-on (0..1 of the sweep); spread: radius of the
 *   neighbourhood that lights with a lamp, fraction of the height; lo, hi: linear
 *   luminance that switches on last / first
 * @typedef {{
 *   focus?: [number, number], focusR?: number, feather?: number, lead?: number, lag?: number, close?: number,
 *   rise?: [number, number], lum?: [number, number], stretch?: number, taps?: number,
 * }} DissolveParams
 *   The iris that takes the room away (shaders.js KIND 4). focus: the instrument's centre in
 *   NDC (x right, y up; the stage takes it from the space act each frame); focusR: its radius,
 *   fraction of the screen height (nothing inside it goes before the rest); feather: softness
 *   of the iris, fraction of its reach; lead: how much nearer the centre the brightest pixels
 *   count (they go last); lag: how far the stars trail the room's dark (must not exceed lead);
 *   close: t at which the iris has closed past everything; rise: t window in which space
 *   comes up; lum: linear luminance of the lead's dark and bright ends; stretch: horizontal
 *   scale of distances (< 1 opens the iris wider than tall); taps: radius of the luminance
 *   neighbourhood, fraction of the height
 * @typedef {{ a?: ActImage | null, b?: ActImage | null, mix?: number, kind?: TransitionKind, transitionParams?: LiftParams & RevealParams & DissolveParams }} ComposeOptions
 * @typedef {[number, number, number, number] | { left: number, top: number, right: number, bottom: number }} CssRect
 *   CSS px from the canvas's top-left: [left, top, right, bottom] or a DOMRect
 * @typedef {CssRect[] | { rects: CssRect[], strength?: number, desaturate?: number, feather?: number, pad?: number, lum?: [number, number] }} QuietZones
 * @typedef {number | { strength?: number, threshold?: number, weights?: [number, number, number] }} GlowOption
 * @typedef {{
 *   quietZones?: QuietZones | null, vignette?: number, grain?: number, glow?: GlowOption, time?: number,
 *   rolloff?: { knee?: number, white?: number }, veil?: [number, number, number], dither?: number,
 *   background?: string | [number, number, number], on?: boolean,
 * }} FinishOptions
 * @typedef {{
 *   tier: number, glowLevels: number, msaa: number, css: [number, number], device: [number, number], dpr: number,
 *   targets: { key: string, width: number, height: number, samples: number, depthTexture: boolean }[],
 *   bytes: number, lastFrame: { compose: string, passes: number, glowLevels: number },
 *   outputColorSpace: string, disposed: boolean,
 * }} PostStats
 * @typedef {{
 *   resize(width: number, height: number, dpr: number): void,
 *   acquireTarget(key: string, options?: TargetOptions): THREE.WebGLRenderTarget,
 *   releaseTarget(key: string): void,
 *   compose(options: ComposeOptions): void,
 *   finish(options?: FinishOptions): void,
 *   setTier(tier: number): void,
 *   readonly tier: number,
 *   stats(): PostStats,
 *   dispose(): void,
 * }} Post
 */

export const TRANSITION_KINDS = Object.freeze(/** @type {TransitionKind[]} */ (['cut', 'fade', 'lift', 'reveal', 'dissolve']));

export const TRANSITION_DEFAULTS = Object.freeze({
  lift: Object.freeze({ dir: 1, travel: 0.08, feather: 0.4 }),
  reveal: Object.freeze({ soft: 0.15, spread: 0.03, lo: 0.002, hi: 1.5 }),
  dissolve: Object.freeze({
    focus: Object.freeze([0, 0]), focusR: 0, feather: 0.2, lead: 0.4, lag: 0.25, close: 0.9,
    rise: Object.freeze([0.4, 0.84]), lum: Object.freeze([0.004, 0.12]), stretch: 0.8, taps: 0.005,
  }),
});

export const FINISH_DEFAULTS = Object.freeze({
  // glow from bright pixels only; weights per level (half, quarter, eighth CSS resolution)
  glow: Object.freeze({ strength: 1, threshold: 0.85, weights: Object.freeze([0.3, 0.24, 0.18]) }),
  // knee 1: identity on 0..1 (baked textures unchanged); lower it to compress the top of the range too
  rolloff: Object.freeze({ knee: 1, white: 0.35 }),
  // dim (and slightly desaturate) only pixels brighter than lum[0] .. lum[1] under the text
  quiet: Object.freeze({ strength: 0.62, desaturate: 0.3, feather: 36, pad: 6, lum: Object.freeze([0.045, 0.2]) }),
  vignette: 0.2,
  grain: 0.018,
  dither: 0.5,
  veil: Object.freeze([0, 0, 0]),
  background: '#100f15',
});

// blur sigma per glow level, in texels of that level: ~4, ~12, ~28 CSS px
const GLOW_SIGMAS = [2.0, 3.0, 3.5];
const GLOW_TAPS = GLOW_SIGMAS.map((s) => gaussTaps(s));

/** @param {number} c */
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * '#rrggbb' (sRGB) or a linear [r, g, b] -> linear [r, g, b].
 * @param {string | number[]} v
 * @returns {[number, number, number]}
 */
function linearRgb(v) {
  if (Array.isArray(v) && v.length >= 3) return [num(v[0], 0), num(v[1], 0), num(v[2], 0)];
  if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v)) {
    const n = parseInt(v.replace('#', ''), 16);
    return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
  }
  throw new TypeError(`post: colour must be "#rrggbb" or [r, g, b], got ${JSON.stringify(v)}`);
}

/** @param {unknown} v @param {number} fallback */
function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const clamp = (/** @type {number} */ x, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, x));

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ tier?: number, background?: string | [number, number, number], precompile?: boolean }} [options]
 * @returns {Post}
 */
export function createPost(renderer, options = {}) {
  if (!renderer || typeof renderer.render !== 'function') throw new TypeError('createPost: a THREE.WebGLRenderer is required');
  let tier = clampTier(options.tier ?? 2);
  const baseBg = linearRgb(options.background ?? FINISH_DEFAULTS.background);
  const maxSamples = num(renderer.capabilities && renderer.capabilities.maxSamples, 4);

  // ------------------------------------------------------------ the quad
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const camera = new THREE.Camera();
  const quad = new THREE.Mesh(geometry);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);

  // a valid texture for every sampler that has nothing to read this frame
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;

  /** @param {string} name @param {string} frag @param {Record<string, THREE.IUniform>} uniforms @param {Record<string, number>} [defines] */
  const material = (name, frag, uniforms, defines = {}) =>
    new THREE.ShaderMaterial({ name, vertexShader: SHADERS.VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });

  const cu = {
    tA: { value: /** @type {THREE.Texture} */ (black) },
    tB: { value: /** @type {THREE.Texture} */ (black) },
    uMix: { value: 0 },
    uAspect: { value: 1 },
    uPxScale: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uP: { value: new THREE.Vector4() },
    uQ: { value: new THREE.Vector4() },
    uK: { value: new THREE.Vector4() },
    uFocus: { value: new THREE.Vector4() },
  };
  /** @type {Record<string, THREE.ShaderMaterial>} */
  const composeMats = {};
  for (const [kind, id] of Object.entries(COMPOSE_KINDS)) composeMats[kind] = material(`post-compose-${kind}`, SHADERS.COMPOSE_FRAG, cu, { KIND: id });

  const bu = { tSrc: { value: /** @type {THREE.Texture} */ (black) }, uSrcTexel: { value: new THREE.Vector2(1, 1) }, uBlock: { value: 2 }, uThresh: { value: FINISH_DEFAULTS.glow.threshold } };
  const brightMat = material('post-bright', SHADERS.BRIGHT_FRAG, bu);
  const ku = { tSrc: { value: /** @type {THREE.Texture} */ (black) } };
  const copyMat = material('post-copy', SHADERS.COPY_FRAG, ku);
  const lu = { tSrc: { value: /** @type {THREE.Texture} */ (black) }, uStep: { value: new THREE.Vector2() }, uW: { value: [1, 0, 0, 0, 0] }, uO: { value: [0, 1, 2, 3, 4] } };
  const blurMat = material('post-blur', SHADERS.BLUR_FRAG, lu);
  const fu = {
    tSrc: { value: /** @type {THREE.Texture} */ (black) },
    tGlow1: { value: /** @type {THREE.Texture} */ (black) },
    tGlow2: { value: /** @type {THREE.Texture} */ (black) },
    tGlow3: { value: /** @type {THREE.Texture} */ (black) },
    uGlow: { value: new THREE.Vector3() },
    uHasSrc: { value: 0 },
    uFetch: { value: 0 },
    uBg: { value: new THREE.Vector3().fromArray(baseBg) },
    uKnee: { value: 1 },
    uWhite: { value: FINISH_DEFAULTS.rolloff.white },
    uVeil: { value: new THREE.Vector3() },
    uGrain: { value: FINISH_DEFAULTS.grain },
    uVignette: { value: FINISH_DEFAULTS.vignette },
    uDither: { value: FINISH_DEFAULTS.dither },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrainSeed: { value: new THREE.Vector2() },
    uQuiet: { value: Array.from({ length: QUIET_N }, () => new THREE.Vector4()) },
    uQuietN: { value: 0 },
    uQuietSoft: { value: 24 },
    uQuietK: { value: FINISH_DEFAULTS.quiet.strength },
    uQuietDesat: { value: FINISH_DEFAULTS.quiet.desaturate },
    uQuietLum: { value: new THREE.Vector2().fromArray(FINISH_DEFAULTS.quiet.lum) },
  };
  const finishMat = material('post-finish', SHADERS.FINISH_FRAG, fu, { GLOW_LEVELS: tierSettings(tier).glow.levels });

  // -------------------------------------------------------- own targets
  /** @param {string} name */
  const flat = (name) => {
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      generateMipmaps: false, depthBuffer: false, stencilBuffer: false,
    });
    rt.texture.name = name;
    return rt;
  };
  const composed = flat('post:composed');
  // glow chain: [level, scratch] at half, quarter and eighth CSS resolution
  const glowRT = [0, 1, 2].map((i) => [flat(`post:glow${i + 1}`), flat(`post:glow${i + 1}-tmp`)]);

  /** @type {Map<string, { rt: THREE.WebGLRenderTarget, spec: Required<Omit<TargetOptions, 'size'>> & { size: [number, number] | null }, sig: string }>} */
  const acquired = new Map();

  let css = /** @type {[number, number]} */ ([1, 1]);
  let dev = /** @type {[number, number]} */ ([1, 1]);
  let ratio = 1;
  let disposed = false;
  /** @type {THREE.Texture | null} */
  let source = null;
  let passes = 0;
  const lastFrame = { compose: 'none', passes: 0, glowLevels: 0 };
  const buf = new THREE.Vector2();
  const rsize = new THREE.Vector2();
  const savedViewport = new THREE.Vector4();

  /** @param {THREE.ShaderMaterial} m @param {THREE.WebGLRenderTarget | null} target */
  function pass(m, target) {
    quad.material = m;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    passes++;
  }

  /** @param {THREE.WebGLRenderTarget} src @param {THREE.WebGLRenderTarget} dst */
  function copyTo(src, dst) {
    ku.tSrc.value = src.texture;
    pass(copyMat, dst);
  }

  /** @param {THREE.WebGLRenderTarget} rt @param {THREE.WebGLRenderTarget} tmp @param {{ W: number[], O: number[] }} taps */
  function blurInPlace(rt, tmp, taps) {
    lu.uW.value = taps.W;
    lu.uO.value = taps.O;
    lu.tSrc.value = rt.texture;
    lu.uStep.value.set(1 / rt.width, 0);
    pass(blurMat, tmp);
    lu.tSrc.value = tmp.texture;
    lu.uStep.value.set(0, 1 / tmp.height);
    pass(blurMat, rt);
  }

  // ------------------------------------------------------ act targets
  /** @param {TargetOptions} o */
  function normalizeSpec(o = {}) {
    if (o.space !== undefined && o.space !== 'device' && o.space !== 'css') throw new TypeError(`acquireTarget: space must be 'device' or 'css', got "${o.space}"`);
    let size = null;
    if (o.size != null) {
      if (!Array.isArray(o.size) || o.size.length !== 2 || !o.size.every((v) => Number.isFinite(v) && v >= 1)) throw new TypeError('acquireTarget: size must be [width, height] in pixels');
      size = /** @type {[number, number]} */ ([Math.round(o.size[0]), Math.round(o.size[1])]);
    }
    const scale = num(o.scale, 1);
    if (!(scale > 0)) throw new TypeError('acquireTarget: scale must be > 0');
    return {
      msaa: !!o.msaa,
      depth: o.depth !== false || !!o.depthTexture,
      depthTexture: !!o.depthTexture,
      stencil: !!o.stencil,
      scale,
      space: /** @type {'device' | 'css'} */ (o.space || 'device'),
      size,
    };
  }

  /** @param {ReturnType<typeof normalizeSpec>} spec @returns {[number, number]} */
  function sizeFor(spec) {
    if (spec.size) return [spec.size[0], spec.size[1]];
    const base = spec.space === 'css' ? css : dev;
    return [Math.max(1, Math.round(base[0] * spec.scale)), Math.max(1, Math.round(base[1] * spec.scale))];
  }

  /** @param {ReturnType<typeof normalizeSpec>} spec @param {number} w @param {number} h */
  const samplesFor = (spec, w, h) => (spec.msaa ? msaaSamples(tier, w * h, maxSamples) : 0);

  /** @param {string} key @param {ReturnType<typeof normalizeSpec>} spec */
  function makeTarget(key, spec) {
    const [w, h] = sizeFor(spec);
    const depthTexture = spec.depthTexture
      ? new THREE.DepthTexture(w, h, spec.stencil ? THREE.UnsignedInt248Type : THREE.UnsignedIntType, undefined, undefined, undefined, undefined, undefined, undefined, spec.stencil ? THREE.DepthStencilFormat : THREE.DepthFormat)
      : null;
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      generateMipmaps: false, depthBuffer: spec.depth, stencilBuffer: spec.stencil, samples: samplesFor(spec, w, h), depthTexture,
    });
    rt.texture.name = key;
    return rt;
  }

  /** Re-fit a target to the current size and tier (three reallocates on next use). */
  function refit(/** @type {{ rt: THREE.WebGLRenderTarget, spec: ReturnType<typeof normalizeSpec> }} */ e) {
    const [w, h] = sizeFor(e.spec);
    const s = samplesFor(e.spec, w, h);
    if (e.rt.samples !== s) {
      e.rt.samples = s;
      e.rt.dispose();
    }
    e.rt.setSize(w, h);
  }

  // ------------------------------------------------------------ helpers
  /** @param {ActImage | null | undefined} x @returns {THREE.Texture | null} */
  function textureOf(x) {
    if (x == null) return null;
    if (/** @type {any} */ (x).isRenderTarget || /** @type {any} */ (x).isWebGLRenderTarget) return /** @type {THREE.WebGLRenderTarget} */ (x).texture;
    if (/** @type {any} */ (x).isTexture) return /** @type {THREE.Texture} */ (x);
    throw new TypeError('post.compose: a and b must be render targets, textures or null');
  }

  /** @param {THREE.Texture} t */
  const sizeOf = (t) => [num(t.image && t.image.width, 0), num(t.image && t.image.height, 0)];

  function canvasSized(/** @type {THREE.Texture} */ t) {
    const [w, h] = sizeOf(t);
    return w === buf.x && h === buf.y;
  }

  function warm() {
    const prev = renderer.getRenderTarget();
    try {
      const rtScene = new THREE.Scene();
      for (const m of [...Object.values(composeMats), brightMat, copyMat, blurMat]) {
        const q = new THREE.Mesh(geometry, m);
        q.frustumCulled = false;
        rtScene.add(q);
      }
      renderer.setRenderTarget(composed);
      renderer.compile(rtScene, camera);
      const canvasScene = new THREE.Scene();
      const q = new THREE.Mesh(geometry, finishMat);
      q.frustumCulled = false;
      canvasScene.add(q);
      renderer.setRenderTarget(null);
      renderer.compile(canvasScene, camera);
    } catch (err) {
      // a lost context: programs compile on first use instead
      void err;
    } finally {
      renderer.setRenderTarget(prev);
    }
  }
  if (options.precompile !== false) warm();

  /**
   * The dissolve's uniforms (shaders.js KIND 4). Distances are in screen heights with the
   * horizontal ones scaled by `stretch`; the reach is the farthest corner from the focus,
   * so the iris starts just outside the frame wherever the instrument is.
   * @param {DissolveParams} D defaults already merged in
   */
  function setDissolve(D) {
    const aspect = cu.uAspect.value;
    const stretch = clamp(num(D.stretch, 0.8), 0.25, 4);
    const focus = Array.isArray(D.focus) ? D.focus : [0, 0];
    const fx = clamp(num(focus[0], 0), -1.5, 1.5) * 0.5 + 0.5;
    const fy = clamp(num(focus[1], 0), -1.5, 1.5) * 0.5 + 0.5;
    let reach = 0;
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) reach = Math.max(reach, Math.hypot((cx - fx) * aspect * stretch, cy - fy));
    cu.uFocus.value.set(fx, fy, clamp(num(D.focusR, 0), 0, 0.9 * reach), reach);
    const lead = Math.max(0, num(D.lead, 0.4));
    // the stars may trail the dark by no more than the lead, or a dark pixel near the
    // instrument would still be waiting for space when t reaches 1
    cu.uP.value.set(Math.max(0.01, num(D.feather, 0.2)), lead, clamp(num(D.lag, 0.25), 0, lead), clamp(num(D.close, 0.9), 0.05, 1));
    const rise = Array.isArray(D.rise) ? D.rise : [];
    const r0 = clamp(num(rise[0], 0.4), 0, 0.99);
    const r1 = clamp(num(rise[1], 0.84), r0 + 0.01, 1);
    const lum = Array.isArray(D.lum) ? D.lum : [];
    const lo = Math.max(1e-6, num(lum[0], 0.004));
    const hi = Math.max(lo * 2, num(lum[1], 0.12));
    cu.uQ.value.set(r0, r1, Math.log2(lo), Math.log2(hi));
    cu.uK.value.set(stretch, clamp(num(D.taps, 0.005), 0, 0.05), 0, 0);
  }

  /** @type {Post} */
  const post = {
    resize(width, height, dpr) {
      if (disposed) return;
      css = [Math.max(1, num(width, 1)), Math.max(1, num(height, 1))];
      ratio = num(dpr, 1) > 0 ? num(dpr, 1) : 1;
      // three sizes the drawing buffer as floor(css * pixelRatio)
      dev = [Math.max(1, Math.floor(css[0] * ratio)), Math.max(1, Math.floor(css[1] * ratio))];
      composed.setSize(dev[0], dev[1]);
      const hw = Math.max(1, Math.ceil(css[0] / 2));
      const hh = Math.max(1, Math.ceil(css[1] / 2));
      glowRT.forEach((pair, i) => {
        const k = 1 << i;
        for (const rt of pair) rt.setSize(Math.max(1, Math.ceil(hw / k)), Math.max(1, Math.ceil(hh / k)));
      });
      for (const e of acquired.values()) refit(e);
    },

    acquireTarget(key, opts = {}) {
      if (disposed) throw new Error('post.acquireTarget: post is disposed');
      if (typeof key !== 'string' || !key) throw new TypeError('acquireTarget: key must be a non-empty string');
      const spec = normalizeSpec(opts);
      const sig = JSON.stringify(spec);
      const had = acquired.get(key);
      if (had && had.sig === sig) return had.rt;
      if (had) had.rt.dispose();
      const rt = makeTarget(key, spec);
      acquired.set(key, { rt, spec, sig });
      return rt;
    },

    releaseTarget(key) {
      const e = acquired.get(key);
      if (!e) return;
      e.rt.dispose();
      acquired.delete(key);
    },

    compose({ a = null, b = null, mix = 0, kind = 'fade', transitionParams = {} } = {}) {
      if (disposed) return;
      if (!TRANSITION_KINDS.includes(kind)) throw new TypeError(`post.compose: unknown kind "${kind}"`);
      passes = 0; // a frame starts here: stats().lastFrame.passes counts compose + finish
      renderer.getDrawingBufferSize(buf);
      const ta = textureOf(a);
      const tb = textureOf(b);
      const t = clamp(num(mix, 0), 0, 1);
      /** @type {THREE.Texture | null | undefined} undefined = blend the two */
      let pick;
      if (!tb) pick = ta;
      else if (!ta) pick = tb;
      else if (kind === 'cut') pick = t < 0.5 ? ta : tb;
      else if (t <= 0) pick = ta;
      else if (t >= 1) pick = tb;
      if (pick === null) {
        source = null;
        lastFrame.compose = 'none';
        return;
      }
      cu.uAspect.value = composed.width / composed.height;
      cu.uPxScale.value = composed.width / css[0];
      cu.uRes.value.set(composed.width, composed.height);
      if (pick) {
        if (canvasSized(pick)) {
          source = pick;
          lastFrame.compose = 'direct';
          return;
        }
        // not canvas-sized: rescale once into the composed target
        cu.tA.value = pick;
        cu.tB.value = pick;
        cu.uMix.value = 0;
        pass(composeMats.copy, composed);
        source = composed.texture;
        lastFrame.compose = 'copy';
        return;
      }
      const P = transitionParams || {};
      cu.tA.value = /** @type {THREE.Texture} */ (ta);
      cu.tB.value = /** @type {THREE.Texture} */ (tb);
      cu.uMix.value = t;
      if (kind === 'lift') {
        const L = { ...TRANSITION_DEFAULTS.lift, ...P };
        cu.uP.value.set(num(L.dir, 1) < 0 ? -1 : 1, clamp(num(L.travel, 0.08), 0, 0.25), Math.max(0.001, num(L.feather, 0.4)), 0);
      } else if (kind === 'reveal') {
        const R = { ...TRANSITION_DEFAULTS.reveal, ...P };
        const lo = Math.max(1e-6, num(R.lo, 0.002));
        const hi = Math.max(lo * 2, num(R.hi, 1.5));
        cu.uP.value.set(clamp(num(R.soft, 0.15), 0.001, 1), Math.max(0, num(R.spread, 0.03)), Math.log2(lo), Math.log2(hi));
      } else if (kind === 'dissolve') {
        setDissolve({ ...TRANSITION_DEFAULTS.dissolve, ...P });
      }
      pass(composeMats[kind], composed);
      source = composed.texture;
      lastFrame.compose = kind;
    },

    finish(o = {}) {
      if (disposed) return;
      renderer.getDrawingBufferSize(buf);
      const on = o.on !== false;
      const levels = tierSettings(tier).glow.levels;

      // glow: number = strength, or an object
      const G0 = FINISH_DEFAULTS.glow;
      const gopt = typeof o.glow === 'number' ? { strength: o.glow } : o.glow || {};
      const strength = on ? Math.max(0, num(gopt.strength, G0.strength)) : 0;
      const weights = Array.isArray(gopt.weights) ? gopt.weights : G0.weights;
      const threshold = Math.max(0, num(gopt.threshold, G0.threshold));
      const doGlow = !!source && strength > 0 && levels > 0;
      if (doGlow) {
        const [A] = glowRT[0];
        const [sw, sh] = sizeOf(/** @type {THREE.Texture} */ (source));
        bu.tSrc.value = /** @type {THREE.Texture} */ (source);
        bu.uSrcTexel.value.set(1 / Math.max(1, sw), 1 / Math.max(1, sh));
        bu.uBlock.value = Math.max(1, sw) / A.width;
        bu.uThresh.value = threshold;
        pass(brightMat, A);
        for (let i = 1; i < levels; i++) copyTo(glowRT[i - 1][0], glowRT[i][0]);
        for (let i = 0; i < levels; i++) blurInPlace(glowRT[i][0], glowRT[i][1], GLOW_TAPS[i]);
      }
      const glowTex = [fu.tGlow1, fu.tGlow2, fu.tGlow3];
      for (let i = 0; i < 3; i++) glowTex[i].value = doGlow && i < levels ? glowRT[i][0].texture : black;
      fu.uGlow.value.set(
        doGlow && levels >= 1 ? strength * num(weights[0], 0) : 0,
        doGlow && levels >= 2 ? strength * num(weights[1], 0) : 0,
        doGlow && levels >= 3 ? strength * num(weights[2], 0) : 0,
      );

      // the source, read 1:1 when it matches the canvas
      fu.tSrc.value = source || black;
      fu.uHasSrc.value = source ? 1 : 0;
      fu.uFetch.value = source && canvasSized(source) ? 1 : 0;
      fu.uBg.value.fromArray(o.background != null ? linearRgb(o.background) : baseBg);
      fu.uRes.value.set(buf.x, buf.y);

      // tone: shoulder and path to white
      const R0 = FINISH_DEFAULTS.rolloff;
      const ro = o.rolloff || {};
      fu.uKnee.value = on ? clamp(num(ro.knee, R0.knee), 0.5, 1) : 1;
      fu.uWhite.value = on ? Math.max(0, num(ro.white, R0.white)) : 0;
      const veil = on && Array.isArray(o.veil) ? o.veil : FINISH_DEFAULTS.veil;
      fu.uVeil.value.set(Math.max(0, num(veil[0], 0)), Math.max(0, num(veil[1], 0)), Math.max(0, num(veil[2], 0)));
      fu.uVignette.value = on ? clamp(num(o.vignette, FINISH_DEFAULTS.vignette), 0, 1) : 0;
      fu.uGrain.value = on ? Math.max(0, num(o.grain, FINISH_DEFAULTS.grain)) : 0;
      fu.uDither.value = Math.max(0, num(o.dither, FINISH_DEFAULTS.dither));
      // grain changes 24 times a second of `time`; a fixed time gives a fixed (still) frame
      const frame = Math.floor(num(o.time, 0) * 24);
      fu.uGrainSeed.value.set((((frame * 0.6180339887) % 1) + 1) % 1 * 1024, (((frame * 0.4142135624) % 1) + 1) % 1 * 1024);

      // quiet zones: CSS px rects -> device px, y up
      const Q0 = FINISH_DEFAULTS.quiet;
      const qz = on ? o.quietZones : null;
      const qo = Array.isArray(qz) ? { rects: qz } : qz || { rects: [] };
      const rects = Array.isArray(qo.rects) ? qo.rects : [];
      const sx = buf.x / css[0];
      const sy = buf.y / css[1];
      const pad = Math.max(0, num(qo.pad, Q0.pad));
      let n = 0;
      for (const r of rects) {
        if (n >= QUIET_N) break;
        const box = Array.isArray(r) ? r : r && typeof r === 'object' ? [r.left, r.top, r.right, r.bottom] : null;
        if (!box || !box.every((v) => Number.isFinite(v))) continue;
        const l = Math.min(box[0], box[2]) - pad;
        const rr = Math.max(box[0], box[2]) + pad;
        const tp = Math.min(box[1], box[3]) - pad;
        const bt = Math.max(box[1], box[3]) + pad;
        fu.uQuiet.value[n++].set(l * sx, buf.y - bt * sy, rr * sx, buf.y - tp * sy);
      }
      for (let i = n; i < QUIET_N; i++) fu.uQuiet.value[i].set(0, 0, 0, 0);
      fu.uQuietN.value = n;
      fu.uQuietSoft.value = Math.max(1, num(qo.feather, Q0.feather) * sx);
      fu.uQuietK.value = clamp(num(qo.strength, Q0.strength), 0, 1);
      fu.uQuietDesat.value = clamp(num(qo.desaturate, Q0.desaturate), 0, 1);
      const lum = Array.isArray(qo.lum) ? qo.lum : Q0.lum;
      const lumLo = Math.max(0, num(lum[0], Q0.lum[0]));
      fu.uQuietLum.value.set(lumLo, Math.max(lumLo + 1e-4, num(lum[1], Q0.lum[1])));

      // the canvas: full viewport, no scissor, whatever an act left behind
      renderer.getViewport(savedViewport);
      const scissor = renderer.getScissorTest();
      renderer.setRenderTarget(null);
      renderer.setScissorTest(false);
      renderer.getSize(rsize);
      renderer.setViewport(0, 0, rsize.x, rsize.y);
      pass(finishMat, null);
      renderer.setViewport(savedViewport);
      renderer.setScissorTest(scissor);

      lastFrame.passes = passes;
      lastFrame.glowLevels = doGlow ? levels : 0;
      passes = 0;
    },

    setTier(next) {
      if (disposed) return;
      const t = clampTier(next, /** @type {any} */ (tier));
      if (t === tier) return;
      tier = t;
      const levels = tierSettings(tier).glow.levels;
      if (finishMat.defines.GLOW_LEVELS !== levels) {
        finishMat.defines.GLOW_LEVELS = levels;
        finishMat.needsUpdate = true;
      }
      for (const e of acquired.values()) if (e.spec.msaa) refit(e);
    },

    get tier() {
      return tier;
    },

    stats() {
      let bytes = composed.width * composed.height * 8;
      for (const pair of glowRT) for (const rt of pair) bytes += rt.width * rt.height * 8;
      const targets = [];
      for (const [key, e] of acquired) {
        const px = e.rt.width * e.rt.height;
        const depth = e.spec.depth ? 4 : 0;
        bytes += px * (8 + (e.spec.depthTexture ? 4 : 0)) + (e.rt.samples > 0 ? px * e.rt.samples * (8 + depth) : px * depth);
        targets.push({ key, width: e.rt.width, height: e.rt.height, samples: e.rt.samples, depthTexture: e.spec.depthTexture });
      }
      return {
        tier,
        glowLevels: tierSettings(tier).glow.levels,
        msaa: msaaSamples(tier, dev[0] * dev[1], maxSamples),
        css: /** @type {[number, number]} */ ([...css]),
        device: /** @type {[number, number]} */ ([...dev]),
        dpr: ratio,
        targets,
        bytes,
        lastFrame: { ...lastFrame },
        outputColorSpace: String(renderer.outputColorSpace),
        disposed,
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      source = null;
      composed.dispose();
      for (const pair of glowRT) for (const rt of pair) rt.dispose();
      for (const e of acquired.values()) e.rt.dispose();
      acquired.clear();
      for (const m of [...Object.values(composeMats), brightMat, copyMat, blurMat, finishMat]) m.dispose();
      geometry.dispose();
      black.dispose();
    },
  };
  return post;
}
