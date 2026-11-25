// Act 4, real space (sections 17-19, and the /contacts/ page). The room goes
// dark round the instrument (engine/post 'dissolve') and the instrument floats
// out into the galaxy. Its brass fades to the engraved line look, the seven
// arms swing out to the ending layout and the seven spheres are the site's
// stones: pickable, hoverable (the arm swings forward and its hoop turns
// aurora green), and reported on screen for the DOM labels. In contact mode
// the rings close into one sealed sphere. The sky sways very slightly and the
// camera shifts a little with the pointer; neither happens under reduced
// motion.
//
// The sky is one sky from the window to the ending. Through the dissolve it is
// the room window's own sky, registered: the same stars, band and aurora as
// the 'window' preset (read off the shared sky, so the two cannot drift
// apart), turned by the instrument's yaw on the desk, so where the walls go
// dark the sky outside the window simply carries on. Once the room has gone
// (SKY_HANDOVER) the sky turns a little about the vertical (a slow pan of the
// stars, ENDING_SKY yaw) and the band's bright core slides along the band out
// of the frame, into the ending's composition: the band sweeps behind one side
// and the instrument stands on calm, dark sky; the small nebula and the spike
// stars come up where no label goes.
//
// World: instrument units, the instrument at its own origin (the room act's
// dissolve keys are this camera mapped onto the desk). Driven by
// frame.params: brass, arms, contact, crank, galaxy, aurora, build;
// frame.pointer ({ x, y } in NDC, y up) if the engine supplies it; the hovered
// stone from setHover(id) or frame.hover.

import { BEATS, ROOM_INSTRUMENT } from '../choreo/choreography.mjs';
import { orbitPose } from '../choreo/rig.mjs';
import { beatOpacity } from '../timeline/schedule.js';
import { FINAL_VIEWS, STONES } from '../instrument/layout.js';
import { tierSettings } from '../quality/tiers.js';
import { DEG, clamp01, smoothstep, lerp, hexLinear, lightDir, isRect, INK } from './shared/math.js';
import { resolveCamera, applyFrameCamera, aspectOf, cameraBasis } from './shared/camera.js';
import { createRenderInto } from './shared/render.js';
import { createLease, ensureBuilt } from './shared/lease.js';
import { instrumentBuild } from './shared/build.js';
import { createStoneProjector, pickFrom } from './shared/stones.js';

// ------------------------------------------------------------------ knobs ---

/** The ending's palette (sketches/instrument shots.js SPACE) and light. */
const SPACE = { night: '#0b0a14', stage: '#09080f', shade: '#9ea0ae' };
const NIGHT = hexLinear(SPACE.night);
/** Key [az, el] and intensity: the final frame, then contact. */
const LIGHT = { final: [225, 40, 1.0], contact: [205, 34, 0.95] };
/** Fog [near, far] as multiples of the camera distance: final, contact (shots.js FOG_FINAL, contact). */
const FOG = {
  land: { final: [14.5 / 16.3, 29.5 / 16.3], contact: [10.5 / 10.9, 16.5 / 10.9] },
  port: { final: [15 / 17, 30 / 17], contact: [14 / 14.9, 21 / 14.9] },
};
/** The coda's text sits here (NDC): left of the sealed sphere on wide screens, above it on phones. */
export const CODA_QUIET = Object.freeze({ land: Object.freeze([-0.92, -0.5, -0.12, 0.5]), port: Object.freeze([-0.9, 0.3, 0.9, 0.94]) });
/**
 * The sky's idle motion: a slow sway about a tilted axis, `amp` radians either way over
 * `period` seconds. Bounded, so the composition holds however long the page stays open
 * (the earlier steady drift of 12 degrees a minute had carried the galaxy's core in behind
 * the instrument within a minute).
 */
const SWAY = Object.freeze({ amp: 0.012, period: 140 });
const SWAY_AXIS = (() => {
  const a = [0.22, 1, 0.12];
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
})();
/** Pointer parallax: how far the camera trucks at the screen's edge, as a fraction of its distance. */
const PARALLAX = 0.006;
/**
 * u over which the sky turns from the window's (registered) to the ending's composition:
 * after the dissolve has taken the room away (engine/core/director.js TRANSITION_PARAMS),
 * done as the labels come up.
 */
export const SKY_HANDOVER = Object.freeze([17.84, 18.28]);
/**
 * The ending's sky, per viewport, from the window's own sky. `yaw`: how far the sky turns
 * about +Y at the handover (degrees; positive carries the band toward the viewer's left in
 * the ending's view). `slide`: where the band's bright core sits along the band, degrees
 * from the window's core (which hides under the room's horizon, but would show in space),
 * through the dissolve and in the ending: up out of every approach frame first, then down
 * to just above the ending's frame, so the band glows in from one corner. `shape`: the
 * band's width and core length (radians) and dust in the ending (the window's own until the
 * handover). The nebula and the spike stars are placed in NDC of the ending's camera
 * (FINAL_VIEWS), clear of the instrument and of where the stones' labels go (beside each
 * sphere, on its outer side; below or above on phones), checked against stonesScreen() and
 * app/utils/stones.js placeLabels().
 */
export const ENDING_SKY = Object.freeze({
  // the band glows in from the top-left corner and runs down the left edge, outside the
  // labels' row (about y -0.3 .. 0.45); the instrument (centre right) stands on dark sky;
  // the nebula sits top right above the 'daily' label; spike stars in the empty corners
  // (the lower ones fall below the contact view, so they never sit behind the coda's text
  // or the sealed sphere)
  land: Object.freeze({
    yaw: 13, slide: Object.freeze([45, 25]), shape: Object.freeze({ width: 0.08, coreLength: 0.6, dust: 1 }),
    nebula: Object.freeze({ at: Object.freeze([0.78, 0.84]), radius: 0.06, roll: 0.6 }),
    heroes: Object.freeze([
      Object.freeze({ at: Object.freeze([0.84, -0.72]), flux: 0.8, color: '#9fc0ff' }),
      Object.freeze({ at: Object.freeze([-0.62, -0.74]), flux: 0.5, color: '#ffd6a8' }),
      Object.freeze({ at: Object.freeze([-0.92, 0.62]), flux: 0.45, color: '#eef0ff' }),
    ]),
  }),
  // looking down on the instrument from above: the band stays out of the frame (it would
  // run behind the labels), the nebula and the stars take the top, where no label goes
  port: Object.freeze({
    yaw: 13, slide: Object.freeze([45, 25]), shape: Object.freeze({ width: 0.08, coreLength: 0.6, dust: 1 }),
    nebula: Object.freeze({ at: Object.freeze([0.55, 0.86]), radius: 0.06, roll: 0.6 }),
    heroes: Object.freeze([
      Object.freeze({ at: Object.freeze([-0.62, 0.72]), flux: 0.8, color: '#9fc0ff' }),
      Object.freeze({ at: Object.freeze([0.84, 0.6]), flux: 0.5, color: '#ffd6a8' }),
      Object.freeze({ at: Object.freeze([-0.8, 0.32]), flux: 0.4, color: '#eef0ff' }),
    ]),
  }),
});
/** u over which the nebula fades as the camera turns to the sealed sphere (it would sit behind it). */
const NEBULA_OUT = Object.freeze([18.88, 19.2]);
/** The instrument as the dissolve's iris sees it: a sphere round its middle (instrument units). */
const FOCUS = Object.freeze({ centre: Object.freeze([0, 2.75, 0]), radius: 3.1 });

// --------------------------------------------------------------------- sky ---

/**
 * @typedef {{ pole: number[], core: number[], shape: { width: number, coreLength: number, dust: number },
 *   aurora: { azimuth: number, distance: number, spacing: number, span: number, base: number, decay: number, folds: number, phase: number },
 *   stillTime: number }} WindowSky
 *   the room window's celestial frame (sky 'window' preset), as the sky's own uniforms hold it,
 *   and the clock offset the room runs that sky at (its aurora's and twinkle's phase)
 */

/**
 * Reads the 'window' preset's band and aurora off a sky handle (applies the preset to it).
 * Null if the handle does not expose its uniforms.
 * @param {any} sky engine/sky handle
 * @returns {WindowSky | null}
 */
export function windowSkyOf(sky) {
  if (!sky || typeof sky.applyPreset !== 'function' || !sky.uniforms) return null;
  const preset = sky.applyPreset('window');
  const U = sky.uniforms;
  if (!U.uGalPole || !U.uGalCore || !U.uGalShape || !U.uAurFrame || !U.uAurShape) return null;
  const v = (/** @type {any} */ x) => [x.x, x.y, x.z];
  const s = U.uGalShape.value;
  const f = U.uAurFrame.value;
  const a = U.uAurShape.value;
  return {
    pole: v(U.uGalPole.value), core: v(U.uGalCore.value), shape: { width: s.x, coreLength: s.y, dust: s.w },
    aurora: { azimuth: f.x, distance: f.y, spacing: f.z, span: f.w, base: a.x, decay: a.y, folds: a.z, phase: a.w },
    stillTime: Number.isFinite(preset && preset.stillTime) ? preset.stillTime : 0,
  };
}

/** 0 while the sky is the window's, 1 once it is the ending's. @param {number} u */
export function skyHandover(u) {
  return smoothstep(SKY_HANDOVER[0], SKY_HANDOVER[1], Number.isFinite(u) ? u : 18);
}

/**
 * The sky's motion at story time u and clock time t (seconds): k, how far it has handed
 * over from the window's composition to the ending's, and the sway angle (radians), which
 * comes in with k: while the sky is the window's it must stay registered with the room's.
 * @param {number} u
 * @param {number} time
 * @param {boolean} reduced
 */
export function endingSkyAt(u, time, reduced) {
  const t = Number.isFinite(time) ? time : 0;
  const k = skyHandover(u);
  return { k, sway: reduced ? 0 : k * SWAY.amp * Math.sin((2 * Math.PI * t) / SWAY.period) };
}

/**
 * World direction through an NDC point of an updated perspective camera (as engine/sky
 * ndc.js, which this module may not import: it imports three).
 * @param {any} camera
 * @param {number} x
 * @param {number} y
 * @param {any} out THREE.Vector3
 */
function ndcDirection(camera, x, y, out) {
  const e = camera.projectionMatrix.elements;
  return out.set((x + e[8]) / e[0], (y + e[9]) / e[5], -1).transformDirection(camera.matrixWorld);
}

/**
 * The sky's two compositions for one viewport, in celestial directions (the sky handle's
 * frame; world = rotation * celestial). The window's: rotation R_Y(-yaw of the instrument on
 * the desk) and the window's own band. The ending's: that rotation turned by ENDING_SKY yaw,
 * the core slid along the band, and the nebula and spike stars placed in NDC of `view`
 * (the ending's camera) and carried back into celestial directions.
 * @param {any} THREE
 * @param {WindowSky} win
 * @param {'land' | 'port'} vp
 * @param {any} view updated PerspectiveCamera of FINAL_VIEWS[vp]
 */
export function endingSkyLayout(THREE, win, vp, view) {
  const L = ENDING_SKY[vp];
  const yaw0 = -ROOM_INSTRUMENT.yaw * DEG;
  const yaw1 = yaw0 + L.yaw * DEG;
  const up = new THREE.Vector3(0, 1, 0);
  const toCelestial = new THREE.Quaternion().setFromAxisAngle(up, -yaw1);
  const pole = new THREE.Vector3(win.pole[0], win.pole[1], win.pole[2]).normalize();
  const core = new THREE.Vector3(win.core[0], win.core[1], win.core[2]).addScaledVector(pole, -win.core[0] * pole.x - win.core[1] * pole.y - win.core[2] * pole.z).normalize();
  const along = new THREE.Vector3().crossVectors(pole, core);
  const at = (/** @type {number[]} */ p) => ndcDirection(view, p[0], p[1], new THREE.Vector3()).applyQuaternion(toCelestial);
  return {
    yaw: [yaw0, yaw1],
    pole,
    /** the core at handover k (0: the window's sky, 1: the ending's) @param {number} k @param {any} out */
    coreAt(k, out) {
      const a = lerp(L.slide[0], L.slide[1], k) * DEG;
      return out.copy(core).multiplyScalar(Math.cos(a)).addScaledVector(along, Math.sin(a));
    },
    shape: [win.shape, L.shape],
    nebula: { dir: at(L.nebula.at), radius: L.nebula.radius, roll: L.nebula.roll },
    heroes: L.heroes.map((h) => ({ dir: at(h.at), flux: h.flux, color: h.color })),
    // the aurora is fixed in the sky's world: the window's, turned into this act's world
    aurora: { ...win.aurora, azimuth: win.aurora.azimuth - yaw0 },
  };
}

// --------------------------------------------------------------------- act ---

/**
 * @param {import('./plate.js').ActContext} ctx
 */
export function createSpaceAct(ctx) {
  const { THREE } = ctx;
  const inst = ctx.instrument;
  const reduced = !!ctx.reducedMotion;
  const scene = new THREE.Scene();
  scene.name = 'act:space';
  const camera = new THREE.PerspectiveCamera(30, 1.6, 0.5, 200);
  const heroCam = new THREE.PerspectiveCamera(30, 1.6, 0.5, 200);
  const renderInto = createRenderInto(THREE);
  const lease = inst ? createLease(inst) : null;
  const project = createStoneProjector(THREE);
  const css = { width: 0, height: 0, dpr: 1 };
  let tier = Number.isFinite(ctx.tier) ? Math.max(0, Math.min(3, Math.round(/** @type {number} */ (ctx.tier)))) : 2;
  let ready = false;
  let disposed = false;
  /** @type {Promise<void> | null} */
  let loading = null;
  /** @type {any} */
  let sky = null;
  /** @type {string} */
  let skyKey = '';
  /** @type {string | null} */
  let hover = null;
  /** @type {WindowSky | null} the room window's sky, read once off this act's copy of the sky */
  let win = null;
  /** @type {ReturnType<typeof endingSkyLayout> | null} */
  let layout = null;
  const q = new THREE.Quaternion();
  const qTurn = new THREE.Quaternion();
  const swayAxis = new THREE.Vector3(SWAY_AXIS[0], SWAY_AXIS[1], SWAY_AXIS[2]);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const coreNow = new THREE.Vector3();
  const shapeNow = { width: 0, coreLength: 0, dust: 0 };
  /** @type {{ dir: any, flux: number, color: string }[]} */
  const heroesNow = [];
  let lastK = NaN;
  let lastSway = NaN;
  let lastTurn = NaN;
  const focusAt = new THREE.Vector3();
  const right = [0, 0, 0];
  const up = [0, 0, 0];
  const keyDir = [0, 0, 0];
  /** @type {{ key: string, stones: import('./shared/stones.js').StoneScreen[] }} */
  const cache = { key: '', stones: [] };

  /**
   * Composes the sky for this viewport and aspect: the space preset's amounts, then the
   * window's band and aurora and the ending's nebula and spike stars (endingSkyLayout),
   * placed with the ending's own camera. stageSky() moves it between the two each frame.
   * @param {'land' | 'port'} vp @param {number} aspect
   */
  function composeSky(vp, aspect) {
    if (!sky) return;
    const key = vp + ':' + aspect.toFixed(3);
    if (key === skyKey) return;
    skyKey = key;
    const V = FINAL_VIEWS[vp];
    const pose = orbitPose({ subject: V.target, az: V.az, el: V.el, dist: V.dist, fov: V.fov, shift: V.shift }, aspect);
    applyFrameCamera(heroCam, pose, aspect, { nearK: 0.05, farK: 2, farAdd: 30 });
    sky.applyPreset('space', { view: heroCam, layout: vp });
    layout = win ? endingSkyLayout(THREE, win, vp, heroCam) : null;
    if (layout) {
      sky.setAuroraFrame(layout.aurora);
      heroesNow.length = 0;
      for (const h of layout.heroes) heroesNow.push({ dir: h.dir, flux: 0, color: h.color });
    }
    lastK = NaN;
    lastSway = NaN;
  }

  async function load(/** @type {((f: number) => void) | undefined} */ onProgress) {
    if (disposed) throw new Error('space act: disposed');
    loading ||= (async () => {
      onProgress?.(0);
      if (ctx.sky) {
        // a mesh has one parent: this act draws its own copy of the shared sky
        sky = ctx.sky.clone();
        sky.setTier(tierSettings(tier).sky);
        win = windowSkyOf(sky);
        skyKey = '';
        scene.add(sky.object3D);
      }
      onProgress?.(0.3);
      if (inst) await (ctx.instrumentReady || ensureBuilt(inst));
      if (disposed) return;
      ready = true;
      onProgress?.(1);
    })();
    return loading;
  }

  /**
   * The camera this act draws (and picks) with: the frame's, trucked a little
   * by the pointer.
   * @param {any} frame
   * @param {any} cam
   * @param {any} target
   */
  function placeCamera(frame, cam, target) {
    const rc = resolveCamera('space', frame, cam);
    if (rc.three) return { use: rc.three, dist: rc.dist };
    if (!rc.frame) return { use: camera, dist: 16 };
    const dist = applyFrameCamera(camera, rc.frame, aspectOf(target, css), { nearK: 0.05, minNear: 0.05, farK: 1.6, farAdd: 30 });
    const pt = frame && frame.pointer;
    if (!reduced && pt && pt.active !== false && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
      cameraBasis(camera, right, up);
      const k = PARALLAX * dist;
      const px = Math.max(-1, Math.min(1, pt.x)) * k;
      const py = Math.max(-1, Math.min(1, pt.y)) * k;
      camera.position.x += right[0] * px + up[0] * py;
      camera.position.y += right[1] * px + up[1] * py;
      camera.position.z += right[2] * px + up[2] * py;
      camera.updateMatrixWorld(true);
    }
    return { use: camera, dist };
  }

  /** @param {any} frame */
  function hoverOf(frame) {
    if (frame && Object.prototype.hasOwnProperty.call(frame, 'hover')) {
      const h = frame.hover;
      return typeof h === 'string' && STONES.includes(h) ? h : null;
    }
    return hover;
  }

  /** Can the stones be pointed at in this frame? @param {any} p */
  const stonesShown = (p) => clamp01(p.arms ?? 0) > 0.6 && clamp01(p.contact ?? 0) < 0.5 && instrumentBuild(p.build ?? 1) > 0.999;

  /**
   * Puts the instrument in this act's scene with the frame's state.
   * @param {any} frame
   * @param {any} use the camera
   * @param {number} dist
   */
  function hold(frame, use, dist) {
    const p = frame.params || {};
    const vp = frame.viewport === 'port' ? 'port' : 'land';
    const c = clamp01(p.contact ?? 0);
    lease.acquire(scene, { position: [0, 0, 0] });
    inst.setViewport(vp);
    inst.setBuild(instrumentBuild(p.build ?? 1));
    inst.setCrank(p.crank ?? 0);
    inst.setArms(p.arms ?? 1);
    inst.setContact(c);
    inst.setBrass(p.brass ?? 0);
    inst.setCamera(use);
    lease.usedCamera();
    const h = hoverOf(frame);
    if (inst.state().hover !== h) inst.setHover(h, { immediate: reduced });
    // the amber crank is the accent, unless a hovered hoop has taken it
    inst.setCrankAccent(h ? 0 : 1);
    const L = c > 0 ? { az: lerp(LIGHT.final[0], LIGHT.contact[0], c), el: lerp(LIGHT.final[1], LIGHT.contact[1], c), i: lerp(LIGHT.final[2], LIGHT.contact[2], c) } : { az: LIGHT.final[0], el: LIGHT.final[1], i: LIGHT.final[2] };
    const d = lightDir(L.az, L.el);
    keyDir[0] = d[0];
    keyDir[1] = d[1];
    keyDir[2] = d[2];
    inst.setLight({ dir: keyDir, color: [1, 1, 1], intensity: L.i, ambient: 0.02 });
    inst.setEnvColors({ sky: '#1b2440', ground: '#08070b', rim: '#27e0d0' });
    const F = FOG[vp];
    inst.setLook({
      fog: [dist * lerp(F.final[0], F.contact[0], c), dist * lerp(F.final[1], F.contact[1], c)],
      fogColor: SPACE.night, macro: null, ink: 1, dark: lerp(0.7, 0.72, c), outline: 1, widthK: 1, spacing: 3.6, brush: 1,
      palette: { night: SPACE.night, stage: SPACE.stage, shade: SPACE.shade, ink: INK.ink, muted: INK.muted, faint: INK.faint, line: INK.line },
    });
  }

  /** @param {any} frame @param {any} use */
  function cacheKey(frame, use) {
    const e = use.matrixWorld.elements;
    return [frame.u, frame.viewport, css.width, css.height, e[12], e[13], e[14], e[8], e[9], use.fov, hoverOf(frame), (frame.params || {}).arms, (frame.params || {}).contact].join('|');
  }

  /** @param {any} frame @param {any} use */
  function measure(frame, use) {
    const w = css.width || 1440;
    const h = css.height || 900;
    const phone = frame.viewport === 'port' || Math.min(w, h) < 520;
    cache.stones = project(inst, use, w, h, { phone, shown: stonesShown(frame.params || {}) });
    cache.key = cacheKey(frame, use);
    return cache.stones;
  }

  /** @param {any} frame @param {number} time @param {number} aspect */
  function stageSky(frame, time, aspect) {
    if (!sky) return;
    const p = frame.params || {};
    const vp = frame.viewport === 'port' ? 'port' : 'land';
    const u = Number.isFinite(frame.u) ? frame.u : 18;
    composeSky(vp, aspect);
    const s = endingSkyAt(u, time, reduced);
    const g = clamp01(p.galaxy ?? 1);
    sky.setStars(1);
    sky.setHorizon(0);
    // the room runs the window's sky at its preset's clock offset: so does this one, or the
    // aurora's curtains and the twinkle would not line up through the dissolve
    sky.setTime((win ? win.stillTime : 0) + (reduced ? 0 : time));
    if (layout) {
      // the window's sky (k 0) -> the ending's (k 1)
      sky.setGalaxy(g * lerp(1, 0.9, s.k));
      sky.setAurora(clamp01(p.aurora ?? 0));
      sky.setNebula(0.6 * s.k * (1 - smoothstep(NEBULA_OUT[0], NEBULA_OUT[1], u)));
      if (s.k !== lastK) {
        lastK = s.k;
        const [a, b] = layout.shape;
        shapeNow.width = lerp(a.width, b.width, s.k);
        shapeNow.coreLength = lerp(a.coreLength, b.coreLength, s.k);
        shapeNow.dust = lerp(a.dust, b.dust, s.k);
        sky.setGalaxyFrame(layout.pole, layout.coreAt(s.k, coreNow), shapeNow);
        sky.setNebulaFrame(layout.nebula.dir, layout.nebula);
        layout.heroes.forEach((h, i) => (heroesNow[i].flux = h.flux * s.k));
        sky.setHeroStars(heroesNow);
        lastSway = NaN;
      }
    } else {
      // no window sky to read (a stand-in sky): the space preset as composed
      sky.setGalaxy(0.9 * g);
      sky.setNebula(0.6 * smoothstep(0.75, 1, g));
    }
    const turn = layout ? lerp(layout.yaw[0], layout.yaw[1], s.k) : 0;
    if (!(Math.abs(s.sway - lastSway) < 1e-7) || turn !== lastTurn) {
      lastSway = s.sway;
      lastTurn = turn;
      q.setFromAxisAngle(swayAxis, s.sway).multiply(qTurn.setFromAxisAngle(yAxis, turn));
      sky.setSkyRotation(q);
    }
    // calm sky under the text: the last beat, then the coda
    const beat = Number.isInteger(frame.beat) ? frame.beat : -1;
    const bq = beat >= 0 && BEATS[beat] ? BEATS[beat].quiet[vp] : null;
    if (bq && isRect(bq)) sky.setQuietZone(bq, 0.85 * beatOpacity(u));
    else if (u >= 19) sky.setQuietZone(CODA_QUIET[vp], 0.85 * smoothstep(19.0, 19.3, u));
    else sky.setQuietZone(null);
  }

  const empty = new THREE.Scene();

  const api = {
    id: 'space',
    load,
    get ready() {
      return ready;
    },
    /** @param {number} t */
    setTier(t) {
      tier = Math.max(0, Math.min(3, Math.round(Number(t)) || 0));
      if (sky) sky.setTier(tierSettings(tier).sky);
    },
    /** @param {number} width @param {number} height @param {number} dpr */
    resize(width, height, dpr) {
      css.width = width;
      css.height = height;
      css.dpr = dpr || 1;
      cache.key = '';
    },
    /**
     * The hovered stone (the arm swings forward, its hoop turns aurora green).
     * frame.hover, when a frame carries it, wins over this.
     * @param {string | null} id
     */
    setHover(id) {
      if (id !== null && id !== undefined && !STONES.includes(id)) throw new TypeError(`space act: unknown stone "${id}"`);
      hover = id ?? null;
    },
    get hover() {
      return hover;
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
        renderInto(renderer, target, empty, camera, NIGHT);
        return;
      }
      const { use, dist } = placeCamera(frame, cam, target);
      stageSky(frame, time, aspectOf(target, css));
      try {
        if (inst && inst.ready) {
          hold(frame, use, dist);
          measure(frame, use);
        }
        renderInto(renderer, target, scene, use, NIGHT);
      } finally {
        if (lease && lease.held) lease.release();
      }
    },
    /**
     * The stone under an NDC point, or null.
     * @param {number} ndcX
     * @param {number} ndcY
     * @param {any} frame
     * @param {any} cam
     */
    pick(ndcX, ndcY, frame, cam) {
      if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
      const stones = api.stonesScreen(frame, cam);
      const w = css.width || 1440;
      const h = css.height || 900;
      return pickFrom(stones, (ndcX * 0.5 + 0.5) * w, (0.5 - ndcY * 0.5) * h);
    },
    /**
     * Stones on screen in CSS px: [{ id, x, y, r, radius, hit, depth, visible }].
     * The frame drawn last is answered from its cache.
     * @param {any} frame
     * @param {any} cam
     */
    stonesScreen(frame, cam) {
      if (!ready || !inst || !inst.ready || !frame) return [];
      const { use, dist } = placeCamera(frame, cam, null);
      if (cache.key && cache.key === cacheKey(frame, use)) return cache.stones.map((s) => ({ ...s }));
      try {
        hold(frame, use, dist);
        return measure(frame, use).map((s) => ({ ...s }));
      } finally {
        if (lease && lease.held) lease.release();
      }
    },
    /**
     * Where the instrument is on screen in this frame, for the dissolve's iris (the stage
     * passes it to engine/post): NDC x, y (y up) of its middle and its radius as a fraction
     * of the screen height. The room draws the same instrument in the same place (its
     * camera is this one mapped onto the desk), so this is where it is in both images.
     * @param {any} frame
     * @param {any} cam
     * @returns {{ x: number, y: number, r: number } | null}
     */
    focus(frame, cam) {
      if (!frame) return null;
      const { use } = placeCamera(frame, cam, null);
      const c = FOCUS.centre;
      focusAt.set(c[0], c[1], c[2]).applyMatrix4(use.matrixWorldInverse);
      const depth = -focusAt.z;
      if (!(depth > 1e-3)) return null;
      const r = (FOCUS.radius * use.projectionMatrix.elements[5]) / depth / 2;
      focusAt.set(c[0], c[1], c[2]).project(use);
      if (!Number.isFinite(focusAt.x) || !Number.isFinite(focusAt.y)) return null;
      return { x: focusAt.x, y: focusAt.y, r: Math.min(r, 1) };
    },
    /** Suggested film-finish options (the stage may ignore them): the galaxy core and spike stars glow from 0.7. */
    finishHints() {
      return { glow: { strength: 1, threshold: 0.7 }, vignette: 0.2, grain: 0.018 };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (lease && lease.held) lease.release();
      if (sky) sky.dispose();
      scene.clear();
    },
  };
  return api;
}
