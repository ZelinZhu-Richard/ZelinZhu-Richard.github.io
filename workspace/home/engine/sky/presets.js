// Sky presets for the acts. Values are the approved compositions from the
// sketches: 'window' is sketches/room/shots.js SKY (checked offscreen against
// the room's skyline), 'space' and 'plain' are the 'space' and 'plain' shots
// of sketches/sky/shots.js.
//
// Two kinds of placement:
//  - frame 'world': directions are fixed in the act's world (three, Y up). The
//    window preset is authored in the room's frame: the window walls face -X
//    (left) and -Z (back-left); sky azimuth runs from -Z toward +X.
//  - frame 'view': features are placed in NDC of a view camera, exactly as the
//    sketch shots did, then turned into world directions once. Pass the act's
//    hero camera as `view` and the composition lands where it was designed in
//    that camera (calm centre for the instrument); afterwards the sky is a true
//    backdrop and pans correctly as the camera moves. Without a camera, a
//    reference camera (the sketch's) looking down -Z, or along `view` when it
//    is a quaternion, is used.
//
// applySkyPreset sets every amount and resets the sky rotation, so a preset
// fully defines what is visible. Frames of features whose amount is 0 are left
// as they were (they are not drawn).

import * as THREE from 'three';
import { directionAtNdc } from './ndc.js';

/**
 * @typedef {[number, number, number]} Vec3Tuple
 * @typedef {[number, number]} NdcPoint
 * @typedef {{ galaxy: number, aurora: number, nebula: number, stars: number, horizon: number, exposure: number, peak: number }} SkyAmounts
 * @typedef {{ width?: number, coreLength?: number, dust?: number }} GalaxyShape
 * @typedef {{ azimuth?: number, distance?: number, spacing?: number, span?: number, base?: number, decay?: number, folds?: number, phase?: number }} AuroraFrame
 * @typedef {{ dir: Vec3Tuple, flux: number, color: string, size?: number }} WorldHero
 * @typedef {{ at: NdcPoint, flux: number, color: string, size?: number }} ViewHero
 * @typedef {{
 *   frame: 'world',
 *   amounts: SkyAmounts,
 *   galaxy: { a: Vec3Tuple, b: Vec3Tuple, core: Vec3Tuple, shape: GalaxyShape } | null,
 *   nebula: { dir: Vec3Tuple, radius: number, roll: number } | null,
 *   aurora: AuroraFrame | null,
 *   heroes: WorldHero[],
 *   stillTime: number,
 * }} WorldPreset
 * @typedef {{
 *   galaxy: { a: NdcPoint, b: NdcPoint, core: NdcPoint, shape: GalaxyShape } | null,
 *   nebula: { at: NdcPoint, radius: number, roll: number } | null,
 *   heroes: ViewHero[],
 * }} ViewLayout
 * @typedef {{
 *   frame: 'view',
 *   amounts: SkyAmounts,
 *   reference: { land: { fov: number, aspect: number }, port: { fov: number, aspect: number } },
 *   layouts: { land: ViewLayout, port: ViewLayout },
 *   stillTime: number,
 * }} ViewPreset
 * @typedef {'window' | 'space' | 'plain'} SkyPresetName
 * @typedef {'land' | 'port'} SkyLayout
 */

// the sketch cameras the 'view' presets were composed in (sketches/sky/shots.js)
const REFERENCE = Object.freeze({ land: Object.freeze({ fov: 50, aspect: 1440 / 900 }), port: Object.freeze({ fov: 64, aspect: 390 / 844 }) });

/** @param {any} o @returns {any} */
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

/** @type {Readonly<{ window: WorldPreset, space: ViewPreset, plain: ViewPreset }>} */
export const SKY_PRESETS = deepFreeze({
  // Act 3, through the room's window wall: aurora dominant over the far
  // skyline (hem a few degrees over the mountains, 220 km out), the Milky Way
  // rising faintly behind it from the left coast, horizon haze on.
  window: {
    frame: 'world',
    amounts: { galaxy: 0.75, aurora: 0.85, nebula: 0, stars: 0.9, horizon: 1, exposure: 1, peak: 0.82 },
    galaxy: {
      a: [-0.574, 0.0, -0.819], // azimuth -35 deg, on the horizon
      b: [-0.112, 0.766, -0.633], // azimuth -10 deg, 50 deg up
      core: [-0.639, -0.105, -0.762], // just under the horizon, behind the mountains
      shape: { width: 0.08, coreLength: 0.75, dust: 0.9 },
    },
    nebula: null,
    aurora: { azimuth: -0.44, distance: 2.2, spacing: 1.6, span: 1.3, base: 0.45, decay: 0.45, folds: 0.28, phase: 2.6 },
    heroes: [
      { dir: [-0.42, 0.52, -0.74], flux: 0.6, color: '#c9d6ff' },
      { dir: [-0.88, 0.3, 0.36], flux: 0.42, color: '#fff1dc' },
    ],
    stillTime: 24,
  },
  // Act 4: the galaxy band diagonal through the upper left with its core off
  // the lower-left corner, a small nebula at the band's top end, three spike
  // stars; the centre and right stay calm for the instrument.
  space: {
    frame: 'view',
    amounts: { galaxy: 0.9, aurora: 0, nebula: 0.6, stars: 1, horizon: 0, exposure: 1, peak: 0.82 },
    reference: REFERENCE,
    layouts: {
      land: {
        galaxy: { a: [-1.05, -0.62], b: [0.18, 1.08], core: [-1.25, -0.92], shape: { width: 0.085, coreLength: 0.7, dust: 1 } },
        nebula: { at: [-0.04, 0.8], radius: 0.085, roll: 0.6 },
        heroes: [
          { at: [-0.44, 0.58], flux: 1.0, color: '#9fc0ff' },
          { at: [0.86, -0.64], flux: 0.55, color: '#ffd6a8' },
          { at: [-0.8, -0.2], flux: 0.42, color: '#eef0ff' },
        ],
      },
      port: {
        galaxy: { a: [-1.1, 0.02], b: [0.62, 1.08], core: [-1.35, -0.25], shape: { width: 0.085, coreLength: 0.7, dust: 1 } },
        nebula: { at: [0.12, 0.8], radius: 0.085, roll: 0.6 },
        heroes: [
          { at: [-0.55, 0.42], flux: 1.0, color: '#9fc0ff' },
          { at: [0.78, -0.48], flux: 0.55, color: '#ffd6a8' },
          { at: [-0.2, -0.78], flux: 0.42, color: '#eef0ff' },
        ],
      },
    },
    stillTime: 0,
  },
  // The false-space beat and any quiet frame: stars on the base gradient and
  // two small spike stars, nothing else.
  plain: {
    frame: 'view',
    amounts: { galaxy: 0, aurora: 0, nebula: 0, stars: 1, horizon: 0, exposure: 1, peak: 0.82 },
    reference: REFERENCE,
    layouts: {
      land: {
        galaxy: null,
        nebula: null,
        heroes: [
          { at: [0.62, 0.5], flux: 0.6, color: '#c9d6ff' },
          { at: [-0.55, -0.42], flux: 0.42, color: '#fff1dc' },
        ],
      },
      port: {
        galaxy: null,
        nebula: null,
        heroes: [
          { at: [0.48, 0.55], flux: 0.6, color: '#c9d6ff' },
          { at: [-0.6, -0.35], flux: 0.42, color: '#fff1dc' },
        ],
      },
    },
    stillTime: 0,
  },
});

export const SKY_PRESET_NAMES = Object.freeze(/** @type {SkyPresetName[]} */ (Object.keys(SKY_PRESETS)));

/**
 * 'land' or 'port' from a layout word ('land', 'landscape', 'port', 'portrait')
 * or, failing that, from an aspect ratio (w / h < 0.8 is portrait, as in the sketches).
 * @param {string | undefined} layout
 * @param {number | undefined} aspect
 * @returns {SkyLayout}
 */
export function skyLayoutOf(layout, aspect) {
  if (layout === 'port' || layout === 'portrait') return 'port';
  if (layout === 'land' || layout === 'landscape') return 'land';
  if (layout !== undefined && layout !== null) throw new TypeError(`sky preset: unknown layout "${layout}"`);
  return Number.isFinite(aspect) && /** @type {number} */ (aspect) < 0.8 ? 'port' : 'land';
}

const v3 = (/** @type {Vec3Tuple} */ t) => new THREE.Vector3(t[0], t[1], t[2]).normalize();

/**
 * The minimal sky surface applySkyPreset drives (createSky's handle has it).
 * @typedef {{
 *   setGalaxy(v: number): void, setAurora(v: number): void, setNebula(v: number): void, setStars(v: number): void,
 *   setHorizon(v: number): void, setExposure(v: number): void, setPeak(v: number): void,
 *   setSkyRotation(q: THREE.Quaternion | null): void,
 *   setGalaxyFrame(pole: THREE.Vector3, core: THREE.Vector3, shape?: GalaxyShape): void,
 *   setNebulaFrame(dir: THREE.Vector3, o?: { radius?: number, roll?: number }): void,
 *   setAuroraFrame(o?: AuroraFrame): void,
 *   setHeroStars(list: { dir: THREE.Vector3, flux: number, color: string, size?: number }[] | null): void,
 * }} SkyLike
 */

/**
 * Apply a preset to a sky.
 * @param {SkyLike} sky
 * @param {SkyPresetName} name
 * @param {{
 *   view?: THREE.PerspectiveCamera | THREE.Quaternion | null,  // 'view' presets: the camera (or orientation) to compose in
 *   layout?: 'land' | 'port' | 'landscape' | 'portrait',      // default: from the camera's aspect, else 'land'
 *   aspect?: number,                                          // reference-camera aspect when `view` is not a camera
 * }} [options]
 * @returns {{ name: SkyPresetName, layout: SkyLayout, stillTime: number }}
 */
export function applySkyPreset(sky, name, options = {}) {
  if (!Object.prototype.hasOwnProperty.call(SKY_PRESETS, name)) throw new TypeError(`sky preset: unknown preset "${name}"`);
  const preset = /** @type {WorldPreset | ViewPreset} */ (SKY_PRESETS[name]);
  const view = options.view ?? null;
  const isCam = !!(view && /** @type {any} */ (view).isPerspectiveCamera);
  const layout = skyLayoutOf(options.layout, isCam ? /** @type {THREE.PerspectiveCamera} */ (view).aspect : options.aspect);

  const A = preset.amounts;
  sky.setSkyRotation(null);
  sky.setGalaxy(A.galaxy);
  sky.setAurora(A.aurora);
  sky.setNebula(A.nebula);
  sky.setStars(A.stars);
  sky.setHorizon(A.horizon);
  sky.setExposure(A.exposure);
  sky.setPeak(A.peak);

  if (preset.frame === 'world') {
    const g = preset.galaxy;
    if (g && A.galaxy > 0) sky.setGalaxyFrame(new THREE.Vector3().crossVectors(v3(g.a), v3(g.b)).normalize(), v3(g.core), g.shape);
    const n = preset.nebula;
    if (n && A.nebula > 0) sky.setNebulaFrame(v3(n.dir), { radius: n.radius, roll: n.roll });
    if (preset.aurora && A.aurora > 0) sky.setAuroraFrame(preset.aurora);
    sky.setHeroStars(preset.heroes.map((h) => ({ dir: v3(h.dir), flux: h.flux, color: h.color, ...(h.size != null ? { size: h.size } : {}) })));
    return { name, layout, stillTime: preset.stillTime };
  }

  // 'view': compose in the given camera, or in the sketch's reference camera
  /** @type {THREE.PerspectiveCamera} */
  let cam;
  if (isCam) cam = /** @type {THREE.PerspectiveCamera} */ (view);
  else {
    const ref = preset.reference[layout];
    const aspect = Number.isFinite(options.aspect) && /** @type {number} */ (options.aspect) > 0 ? /** @type {number} */ (options.aspect) : ref.aspect;
    cam = new THREE.PerspectiveCamera(ref.fov, aspect, 0.1, 100);
    if (view && /** @type {any} */ (view).isQuaternion) cam.quaternion.copy(/** @type {THREE.Quaternion} */ (view));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }
  const L = preset.layouts[layout];
  const D = (/** @type {NdcPoint} */ p) => directionAtNdc(cam, p[0], p[1], new THREE.Vector3());
  if (L.galaxy && A.galaxy > 0) {
    const pole = new THREE.Vector3().crossVectors(D(L.galaxy.a), D(L.galaxy.b)).normalize();
    sky.setGalaxyFrame(pole, D(L.galaxy.core), L.galaxy.shape);
  }
  if (L.nebula && A.nebula > 0) sky.setNebulaFrame(D(L.nebula.at), { radius: L.nebula.radius, roll: L.nebula.roll });
  sky.setHeroStars(L.heroes.map((h) => ({ dir: D(h.at), flux: h.flux, color: h.color, ...(h.size != null ? { size: h.size } : {}) })));
  return { name, layout, stillTime: preset.stillTime };
}
