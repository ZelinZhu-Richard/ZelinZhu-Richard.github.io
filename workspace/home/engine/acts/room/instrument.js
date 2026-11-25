// The shared instrument (ctx.instrument, engine/instrument) on the room's desk: where it
// stands, what state it is in and how it is lit. Every act draws the same object with
// the same uniform bag, so the room borrows it for each draw through the acts' shared
// lease (../shared/lease.js: acquire moves it into the room's scene at the desk anchor;
// release puts back its parent, transform, light, look and crank accent) and sets, while
// it holds it, everything the room's look depends on: build (choreography levels mapped
// by ../shared/build.js instrumentBuild, as the other acts do), crank, arms, brass,
// contact, viewport, the look switches and the lights.
//
// Light (ROOM.md, ART.md last section: one light direction per act), so the polished
// brass reads like the Blender armillary (_dev/room/room-instrument.png):
//  - key: the desk lamp's bulb, a warm spot aimed at the armillary; it warms with the
//    filament (lightLevels().lamp), deep orange first, then 2700 K amber;
//  - environment (what the metal mirrors): warm above (the lamp-lit room; Blender lit
//    its armillary with a warm card for the same reason), the lamp-lit desk below;
//  - fill: the monitors' cool light from the monitor side (-X), as they wake;
//  - rim: the window wall behind and to the left, starlight plus the aurora. With the
//    lights off (false space) the rim is all there is: dim cool crescents.
// While it holds the instrument the room also turns on the brass's far-view filtering
// (uFarMetal: highlights widen instead of sparkling on rings a pixel or two wide, and
// sub-pixel chamfers and grooves fade instead of drawing as 1 px wireframe).
//
// The globe: the choreography's §9 stage (build 0.44 -> 0.5) is "globe", so the false-
// space beat has its planets, but the instrument's fixed build order puts the globe after
// the colure (the fourth ring, §13). The room shows the globe group (globe, axis, beads)
// with that stage; the instrument's own order resumes as soon as it shows the globe itself.

import { filament, frontLevel } from './classify.js';
import { createLease } from '../shared/lease.js';
import { instrumentBuild } from '../shared/build.js';
import { buildReveal, celestialAngle } from '../../instrument/pose.js';
import { ARMILLARY, polarAxis } from '../../instrument/layout.js';
import { mul, rotateAbout, scaleAbout, easeOutBack } from '../../instrument/math.js';

/** The look switches the room relies on (other acts may change them; the lease restores theirs). */
const LOOK_RESET = Object.freeze({ fog: null, macro: null, ink: 1, dark: 0.7, outline: 1, widthK: 1, spacing: 3.6, brush: 1 });
/** The choreography levels over which the room brings the globe in (BUILD_STAGES: 0.44 three rings, 0.5 globe). */
export const GLOBE_LEVELS = Object.freeze([0.44, 0.5]);

const num = (/** @type {unknown} */ v, /** @type {number} */ d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp01 = (/** @type {number} */ x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);

/**
 * The instrument's setBuild value for a frame (choreography level -> instrument windows).
 * @param {Record<string, number>} P frame.params
 */
export function roomBuild(P) {
  return instrumentBuild(clamp01(num(P.build, 1)));
}

/**
 * How far the room has brought the globe in (0..1) for a frame, beyond what the
 * instrument's own build shows.
 * @param {Record<string, number>} P frame.params
 */
export function roomGlobe(P) {
  const level = clamp01(num(P.build, 1));
  const [a, b] = GLOBE_LEVELS;
  return clamp01((level - a) / (b - a));
}

/**
 * @param {ReturnType<typeof import('./classify.js').createLook>} look
 * @param {any} inst ctx.instrument, or null
 */
export function createInstrumentRig(look, inst) {
  const lease = inst && inst.object3D ? createLease(inst) : null;
  const keyDir = [0, 1, 0];
  const keyCol = [1, 1, 1];
  const lampAt = [0, 0, 0];
  const sky = [0, 0, 0];
  const ground = [0, 0, 0];
  const rim = [0, 0, 0];
  const light = { dir: keyDir, color: keyCol, intensity: 0, ambient: 0.02, position: lampAt, range: 1, cone: /** @type {number[]} */ ([78, 38]) };
  const env = { sky, ground, rim, rimDir: /** @type {number[]} */ ([0, 0, -1]) };
  /** @type {any} */
  let globeObj = null;

  /** @param {Record<string, number>} P @param {'land' | 'port'} viewport */
  function pose(P, viewport) {
    const s = inst.state();
    const build = roomBuild(P);
    const crank = num(P.crank, 0);
    const arms = clamp01(num(P.arms, 0));
    const brass = clamp01(num(P.brass, 1));
    const contact = clamp01(num(P.contact, 0));
    if (s.viewport !== viewport) inst.setViewport(viewport);
    if (s.build !== build) inst.setBuild(build);
    if (s.crank !== crank) inst.setCrank(crank);
    if (s.arms !== arms) inst.setArms(arms);
    if (s.brass !== brass) inst.setBrass(brass);
    if (s.contact !== contact) inst.setContact(contact);
    // the amber is the lamp's in this act (one accent per frame); the lease puts the other act's
    // back. setCrankAccent re-poses the whole instrument, so only when it is on.
    if (crankAccent() !== 0) inst.setCrankAccent(0);
    inst.setLook(LOOK_RESET);
    // the globe with its §9 stage (see the header), unless the instrument already shows it
    const gk = roomGlobe(P);
    if (gk > 0 && (buildReveal(build).globe ?? 0) < gk) {
      if (!globeObj || globeObj.parent !== inst.object3D) globeObj = inst.object3D.getObjectByName('instrument:globe') || null;
      if (globeObj) {
        const C = ARMILLARY.c;
        const s = Math.max(easeOutBack(gk), 1e-3);
        globeObj.matrix.fromArray(mul(rotateAbout(C, polarAxis(), celestialAngle(crank)), scaleAbout(C, s)));
        globeObj.matrixWorldNeedsUpdate = true;
        globeObj.visible = true;
        lease.markPose(); // release() re-poses it from the instrument's own state
      }
    }
  }

  /** The crank handle's accent as the instrument has it (its pinion group's uniform), 0 if unknown. */
  function crankAccent() {
    const g = inst.object3D.getObjectByName('instrument:pinion');
    const m = g && g.children.find((/** @type {any} */ c) => c.material && c.material.uniforms && c.material.uniforms.uAccentOn);
    return m ? m.material.uniforms.uAccentOn.value : 0;
  }

  /**
   * @param {ReturnType<typeof import('./classify.js').instrumentFrame>} at
   * @param {{ lamp: number, room: number }} levels lightLevels(params.lights)
   * @param {{ x: number, y: number, z: number }} lampPos the bulb (room metres)
   * @param {Record<string, number>} P frame.params
   */
  function lightIt(at, levels, lampPos, P) {
    const { lamp, room } = levels;
    const screens = clamp01(num(P.screens, 1));
    const aurora = clamp01(num(P.aurora, 0.8));
    const c = at.centre;
    const dx = lampPos.x - c[0];
    const dy = lampPos.y - c[1];
    const dz = lampPos.z - c[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    keyDir[0] = dx / l;
    keyDir[1] = dy / l;
    keyDir[2] = dz / l;
    filament(lamp, keyCol);
    lampAt[0] = lampPos.x;
    lampAt[1] = lampPos.y;
    lampAt[2] = lampPos.z;
    // the surroundings the metal mirrors come up with the lamp, then with the light front
    // as it passes the desk (the instrument stands about 0.3 m from the bulb)
    const lit = Math.max(0.55 * lamp, frontLevel(room, 0.35));
    light.intensity = look.keyIntensity * Math.pow(lamp, 1.5);
    light.ambient = look.ambient[0] + (look.ambient[1] - look.ambient[0]) * lit;
    light.range = look.keyRange;
    light.cone = look.keyCone;
    inst.setLight(light);
    for (let k = 0; k < 3; k++) {
      sky[k] = look.envNight[k] + (look.envRoom[k] - look.envNight[k]) * lit + look.envScreens[k] * screens;
      ground[k] = look.groundNight[k] + (look.groundRoom[k] - look.groundNight[k]) * lit;
      rim[k] = look.rimStar[k] + look.rimAurora[k] * aurora;
    }
    env.rimDir = look.rimDir;
    inst.setEnvColors(env);
    // what the setters do not reach (the lease restores these on release): the monitors'
    // cool fill from the monitor side, and the far-view filtering of the brass
    const bag = lease ? /** @type {any} */ (lease.bag) : null;
    if (bag) {
      const f = look.fillDir;
      const fl = Math.hypot(f[0], f[1], f[2]) || 1;
      if (bag.uFillDir) bag.uFillDir.value.set(f[0] / fl, f[1] / fl, f[2] / fl);
      if (bag.uFillCol) bag.uFillCol.value.set(look.fillRoom[0] * lit + look.fillScreens[0] * screens, look.fillRoom[1] * lit + look.fillScreens[1] * screens, look.fillRoom[2] * lit + look.fillScreens[2] * screens);
      if (bag.uFarMetal) bag.uFarMetal.value = 1;
    }
  }

  return {
    /** Is the instrument in the room's scene right now (between begin and end)? */
    get held() {
      return !!(lease && lease.held);
    },
    /**
     * Borrow the instrument for this draw: stand it on the desk, set its state and
     * light. Returns its root, or null when there is no built instrument.
     * @param {any} scene
     * @param {ReturnType<typeof import('./classify.js').instrumentFrame>} at
     * @param {Record<string, number>} P frame.params
     * @param {'land' | 'port'} viewport
     * @param {{ lamp: number, room: number }} levels
     * @param {{ x: number, y: number, z: number }} lampPos
     */
    begin(scene, at, P, viewport, levels, lampPos) {
      if (!lease || !inst.ready) return null;
      lease.acquire(scene, { position: at.position, scale: at.scale, yaw: at.yawRad });
      pose(P, viewport);
      lightIt(at, levels, lampPos, P);
      inst.object3D.updateMatrixWorld(true);
      return inst.object3D;
    },
    /** Hand it back (parent, transform, light, look, accent as they were before begin). */
    end() {
      if (!lease || !lease.held) return;
      // the room's own rim direction is sticky in the instrument; hand the derived one back
      // (the lease then restores the uniform itself) so the next act's setLight() sets its rim
      inst.setEnvColors({ rimDir: null });
      lease.release();
    },
  };
}
