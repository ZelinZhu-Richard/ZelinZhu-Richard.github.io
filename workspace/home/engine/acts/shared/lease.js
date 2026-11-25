// Borrowing the ONE shared instrument for one draw (ARCHITECTURE.md: every act
// draws the same object). A mesh has one parent and the instrument keeps one
// uniform bag for its light and look, so an act that draws it:
//
//   const lease = createLease(ctx.instrument);
//   lease.acquire(scene, { position, scale });   // moves object3D into `scene`, snapshots the look
//   ...set build, crank, light, look; render...
//   lease.release();                             // puts object3D, its transform and the look back
//
// release() restores: the parent, the transform and visibility of object3D,
// every light / look / palette uniform the instrument's setters write (its
// setLight, setEnvColors, setLook), the crank accent, and the viewer if the act
// set one (setCamera(null), so hover and fold face whoever draws next). It does NOT restore
// build, crank, arms, brass, contact, viewport or hover: every act sets those
// from its FrameState on every draw. If an act overrode a group's pose behind
// the instrument's back (shared/build.js overrideTrain), release() re-poses
// the instrument from its own state.
//
// The uniform bag is not part of the instrument's API; it is found through
// object3D (every material spreads the same uniform objects), and if it cannot
// be found the look is simply not restored.

/**
 * Never saved: what the view sync rewrites before every draw, and the two
 * uniforms that mirror the instrument's own state (setBrass, setTier).
 */
const SKIP_KEYS = new Set(['uRes', 'uDpr', 'uFootK', 'uFootOrtho', 'uRefDist', 'uScale', 'uRootInv', 'uAcross', 'uNear', 'uBrass', 'uTier']);

/** @type {WeakMap<object, { bag: Record<string, { value: any }>, probe: any }>} */
const BAGS = new WeakMap();

/** @param {any} obj @param {any} root */
function under(obj, root) {
  for (let o = obj; o; o = o.parent) if (o === root) return true;
  return false;
}

/**
 * The instrument's shared uniform bag, or null before it is built.
 * @param {any} inst
 * @returns {Record<string, { value: any }> | null}
 */
export function instrumentUniforms(inst) {
  const root = inst && inst.object3D;
  if (!root) return null;
  const hit = BAGS.get(inst);
  if (hit && under(hit.probe, root)) return hit.bag;
  /** @type {any} */
  let found = null;
  root.traverse((/** @type {any} */ o) => {
    if (found || !o.material || !o.material.uniforms) return;
    const u = o.material.uniforms;
    if (u.uKeyDir && u.uBrass && u.uFog && u.uMetal) found = { bag: u, probe: o };
  });
  if (!found) return null;
  BAGS.set(inst, found);
  return found.bag;
}

/** @param {any} v */
function cloneValue(v) {
  if (Array.isArray(v)) return v.map(cloneValue);
  if (v && typeof v.clone === 'function') return v.clone();
  return v;
}
/** @param {any} dst @param {any} src */
function copyValue(dst, src) {
  if (Array.isArray(src)) {
    for (let i = 0; i < src.length; i++) dst[i] = copyValue(dst[i], src[i]);
    return dst;
  }
  if (src && typeof src.copy === 'function' && dst && typeof dst.copy === 'function') return dst.copy(src);
  return src;
}

/**
 * @param {any} inst the shared instrument (engine/instrument createInstrument)
 */
export function createLease(inst) {
  const root = inst.object3D;
  /** @type {any} */
  let prevParent = null;
  let prevVisible = true;
  let prevAuto = true;
  let held = false;
  let poseDirty = false;
  let camSet = false;
  let accent0 = 0;
  /** @type {any[]} */
  let saved = [];
  /** @type {Record<string, { value: any }> | null} */
  let bag = null;
  /** @type {Record<string, { value: any }> | null} */
  let savedFrom = null;
  /** @type {string[]} */
  let keys = [];
  const P0 = root.position.clone();
  const Q0 = root.quaternion.clone();
  const S0 = root.scale.clone();
  const M0 = root.matrix.clone();

  function accentNow() {
    const g = root.getObjectByName('instrument:pinion');
    const m = g && g.children.find((/** @type {any} */ c) => c.material && c.material.uniforms && c.material.uniforms.uAccentOn);
    return m ? m.material.uniforms.uAccentOn.value : 0;
  }

  return {
    /** Is the instrument currently in this act's scene? */
    get held() {
      return held;
    },
    /** The shared uniform bag while held (null if it could not be found). */
    get bag() {
      return bag;
    },
    /**
     * Moves the instrument into `scene` with this act's transform: position
     * (world), uniform scale (world units per instrument unit), yaw (radians
     * about +Y). Returns the shared uniform bag (or null), already snapshotted,
     * so an act may override look uniforms the setters do not reach.
     * @param {any} scene
     * @param {{ position?: ArrayLike<number>, scale?: number, yaw?: number }} [place]
     */
    acquire(scene, place = {}) {
      if (held) this.release();
      held = true;
      poseDirty = false;
      camSet = false;
      prevParent = root.parent && root.parent !== scene ? root.parent : null;
      P0.copy(root.position);
      Q0.copy(root.quaternion);
      S0.copy(root.scale);
      M0.copy(root.matrix);
      prevVisible = root.visible;
      prevAuto = root.matrixAutoUpdate;
      bag = instrumentUniforms(inst);
      if (bag) {
        const B = /** @type {any} */ (bag);
        if (bag !== savedFrom) {
          savedFrom = bag;
          keys = Object.keys(B).filter((k) => !SKIP_KEYS.has(k));
          saved = keys.map((k) => cloneValue(B[k].value));
        } else {
          for (let i = 0; i < keys.length; i++) saved[i] = copyValue(saved[i], B[keys[i]].value);
        }
      }
      accent0 = accentNow();
      scene.add(root);
      const p = place.position || [0, 0, 0];
      root.position.set(p[0], p[1], p[2]);
      root.rotation.set(0, place.yaw || 0, 0);
      const s = place.scale ?? 1;
      root.scale.set(s, s, s);
      root.matrixAutoUpdate = true;
      root.visible = true;
      root.updateMatrixWorld(true);
      return bag;
    },
    /** Moves the instrument (only its transform) while held. @param {ArrayLike<number>} p */
    setPosition(p) {
      root.position.set(p[0], p[1], p[2]);
      root.updateMatrixWorld(true);
    },
    /** Call after posing groups directly (shared/build.js): release() re-poses from the instrument's state. */
    markPose() {
      poseDirty = true;
    },
    /** Call after inst.setCamera(...): release() hands the viewer back (setCamera(null)). */
    usedCamera() {
      camSet = true;
    },
    release() {
      if (!held) return;
      held = false;
      if (bag && bag === savedFrom) {
        const B = /** @type {any} */ (bag);
        for (let i = 0; i < keys.length; i++) B[keys[i]].value = copyValue(B[keys[i]].value, saved[i]);
      }
      if (accentNow() !== accent0) inst.setCrankAccent(accent0);
      if (camSet) {
        camSet = false;
        inst.setCamera(null);
      }
      if (poseDirty) {
        poseDirty = false;
        // any setter re-runs the instrument's own pose
        inst.setCrank(inst.state().crank);
      }
      if (prevParent) prevParent.add(root);
      else root.removeFromParent();
      root.position.copy(P0);
      root.quaternion.copy(Q0);
      root.scale.copy(S0);
      root.visible = prevVisible;
      root.matrix.copy(M0);
      root.matrixAutoUpdate = prevAuto;
      root.updateMatrixWorld(true);
      prevParent = null;
    },
  };
}

/** @type {WeakMap<object, Promise<void>>} */
const BUILDS = new WeakMap();

/**
 * Builds the shared instrument once, however many acts ask: the first call
 * starts inst.build(), later calls get the same promise. Resolves at once if it
 * is already built. The stage may build it itself before the acts load (then
 * this does nothing) but must not start a second build while this one runs.
 * @param {any} inst
 * @returns {Promise<void>}
 */
export function ensureBuilt(inst) {
  if (!inst || inst.ready) return Promise.resolve();
  let p = BUILDS.get(inst);
  if (!p) {
    p = Promise.resolve(inst.build()).then(() => undefined);
    BUILDS.set(inst, p);
  }
  return p;
}
