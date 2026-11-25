// The instrument: ONE object used by every act. On the desk it is polished
// brass (setBrass(1)); floating out into space its metal fades to the pale
// engraved line work of the ending (setBrass(0)). Same geometry throughout:
// an engraved dial base on knurled feet with the astrolabe rete wheel and
// its gear train in a recess and a knurled crank, a turned column, an
// armillary on top (meridian ring in a fork, horizon ring on four posts,
// tilted polar axis, equator and ecliptic bands with graduations, colure,
// small centre globe), and seven arms with seven engraved spheres (the
// site's stones). On the desk the arms are retracted and the spheres small
// (setArms(0)); setArms(1) extends them to the ending layout.
//
// Authored at unit scale (about 6.2 units from the feet to the top of the
// meridian ring; layout.js); the act that draws it places and scales
// `object3D`. THREE comes in through the options, so nothing here imports
// three.js and the pure half (layout, pose, gears, rete) runs in node.
//
// API (all setters cheap; call them every frame from FrameState params):
//   const inst = createInstrument({ THREE, rngFor, tier, gsap?, seed? })
//   await inst.build()          builds the geometry at the current tier
//   inst.object3D               add to the act's scene, place and scale it
//   setBuild(0..1)              parts appear: wheel, gears, base, column, rings, arms, spheres
//   setCrank(rad)               the pinion's angle; the train meshes exactly (1:2:4),
//                               the celestial rings (1/16) and retracted arms (1/24) turn slower
//   setArms(0..1)               retracted desk layout -> ending layout
//   setBrass(0..1)              1 polished brass, 0 engraved
//   setHover(id | null)         the stone's hoop turns aurora green, its arm swings toward the viewer
//   setContact(0..1)            the rings close into a sealed sphere, the arms fold behind
//   setLight({ dir, color, intensity, ambient, position?, range?, cone? })
//   setEnvColors({ sky, ground, rim, rimDir? })
//   stones, stoneWorldPosition(id, out), stoneRadius(id), bounds, setTier(t), dispose()
// Extras: setViewport('land' | 'port'), setCamera(camera), setLook({...}),
//   setCrankAccent(0..1), stoneScreen(camera, w, h), state().

import { STONES, ARMS, ALIDADE_ANGLE, ARMILLARY, BASE, GROUND_Y, VIEWPORTS, FINAL_VIEWS, DEG, dir } from './layout.js';
import { instrumentPose, armPose, buildReveal, sphereTilts, STAGE_ORDER, STAGES } from './pose.js';
import { buildParts, mergeGroup, restMatrix, HULL } from './parts.js';
import { uvSphere } from './geom.js';
import { VoxelGrid, boundsOf } from './ao.js';
import { clamp01 } from './math.js';
import { rngFor as defaultRngFor } from '../core/rng.js';
import { makeUniforms, solidMaterial, sphereMaterial, hullMaterial, lineMaterial, lineMesh, toLinear, PALETTE } from './materials.js';
import { createViewSync } from './viewsync.js';

export { STONES, STAGE_ORDER, STAGES, FINAL_VIEWS, VIEWPORTS, buildReveal };
export { viewPosition, projector } from './views.js';
export { createPlateDrawing } from './plate.js';

const TIER_SPHERE = [[28, 18], [36, 24], [48, 32], [56, 40]];
const yieldTask = () => new Promise((r) => (typeof setTimeout === 'function' ? setTimeout(r, 0) : r()));

/**
 * @param {{ THREE: any, rngFor?: (seed: any, key: string) => () => number, tier?: number,
 *   gsap?: any, seed?: number, reducedMotion?: boolean }} options
 */
export function createInstrument({ THREE, rngFor = defaultRngFor, tier = 3, gsap = null, seed = 7, reducedMotion = false } = /** @type {any} */ ({})) {
  if (!THREE) throw new TypeError('createInstrument: THREE is required');
  const root = new THREE.Group();
  root.name = 'instrument';
  const U = makeUniforms(THREE);
  const tilts = sphereTilts(rngFor, seed);
  const S = {
    crank: 0, arms: 0, build: 1, brass: 0, contact: 0, crankAccent: 0,
    hover: STONES.map(() => 0), hoverId: /** @type {string | null} */ (null),
    front: /** @type {number | null} */ (null), seenFront: -Math.PI / 2,
    viewport: 'land', tier: clampTier(tier), builtTier: -1,
  };
  const hoverW = STONES.map(() => ({ w: 0 }));
  /** @type {any} */
  let B = null; // what build() made
  let disposed = false;
  let buildPromise = null;

  // ------------------------------------------------------------- view sync ---
  const tmp = new THREE.Vector3();
  const sync = createViewSync(THREE, U, root, { centre: [0, 2.2, 0], onFront: (a) => (S.seenFront = a) });
  const syncHook = (renderer, scene, camera) => sync(renderer, camera);

  // each sphere's engraving density follows its size on screen, by octaves
  function sphereHook(mesh) {
    return (renderer, scene, camera) => {
      sync(renderer, camera);
      const e = mesh.matrixWorld.elements;
      const r = Math.hypot(e[0], e[1], e[2]);
      tmp.set(e[12], e[13], e[14]).applyMatrix4(camera.matrixWorldInverse);
      const P5 = camera.projectionMatrix.elements[5] || 1;
      const hCss = U.uRes.value.y / U.uDpr.value;
      const rpx = camera.isOrthographicCamera ? (r * P5 * hCss) / 2 : ((r * P5) / Math.max(-tmp.z, 1e-4)) * (hCss / 2);
      const n = Math.min(72, Math.max(6, (Math.PI * rpx) / 5));
      const L = Math.log2(n / 6);
      const u = mesh.material.uniforms;
      if (S.tier >= 2) {
        const Li = Math.floor(L);
        const f = L - Li;
        u.uPatN.value = 6 * Math.pow(2, Li);
        u.uPatMix.value = f <= 0.5 ? 0 : f >= 1 ? 1 : ((f - 0.5) / 0.5) ** 2 * (3 - 2 * ((f - 0.5) / 0.5));
      } else {
        u.uPatN.value = 6 * Math.pow(2, Math.round(L));
        u.uPatMix.value = 0;
      }
    };
  }

  // --------------------------------------------------------------- build ---
  function triangulate(contour, holes) {
    const V2 = (p) => new THREE.Vector2(p[0], p[1]);
    return THREE.ShapeUtils.triangulateShape(contour.map(V2), holes.map((h) => h.map(V2)));
  }

  function geometryOf(m) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
    g.setAttribute('aHatch', new THREE.BufferAttribute(m.hatch, 2));
    g.setAttribute('aTick', new THREE.BufferAttribute(m.tick, 2));
    g.setAttribute('aMat', new THREE.BufferAttribute(m.mat, 4));
    g.setAttribute('aOnormal', new THREE.BufferAttribute(m.onormal, 4));
    if (m.bone) g.setAttribute('aBone', new THREE.BufferAttribute(m.bone, 1));
    const maxIndex = m.position.length / 3;
    g.setIndex(new THREE.BufferAttribute(maxIndex < 65536 ? Uint16Array.from(m.index) : m.index, 1));
    g.computeBoundingSphere();
    return g;
  }

  function sphereGeometry(wSeg, hSeg, hull) {
    const s = uvSphere(wSeg, hSeg);
    const n = s.pos.length / 3;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nrm, 3));
    g.setAttribute('aHatch', new THREE.Float32BufferAttribute(s.hat, 2));
    g.setAttribute('aTick', new THREE.Float32BufferAttribute(s.tik, 2));
    const mat = new Float32Array(n * 4);
    const on = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      mat[4 * i + 1] = 1;
      mat[4 * i + 2] = 1.05;
      mat[4 * i + 3] = 1;
      on[4 * i] = s.nrm[3 * i];
      on[4 * i + 1] = s.nrm[3 * i + 1];
      on[4 * i + 2] = s.nrm[3 * i + 2];
      on[4 * i + 3] = hull;
    }
    g.setAttribute('aMat', new THREE.BufferAttribute(mat, 4));
    g.setAttribute('aOnormal', new THREE.BufferAttribute(on, 4));
    g.setIndex(s.idx);
    g.computeBoundingSphere();
    return g;
  }

  // ambient occlusion: static parts against everything at rest; each
  // turning part against the static parts that are round about its axis
  // and itself; each arm against itself and the column
  function bake(merged) {
    const toRest = (id, m) => {
      const R = restMatrix(id);
      const P = m.position;
      const N = m.normal;
      const pos = new Float32Array(P.length);
      const nrm = new Float32Array(N.length);
      for (let i = 0; i < P.length; i += 3) {
        const x = P[i], y = P[i + 1], z = P[i + 2];
        pos[i] = R[0] * x + R[4] * y + R[8] * z + R[12];
        pos[i + 1] = R[1] * x + R[5] * y + R[9] * z + R[13];
        pos[i + 2] = R[2] * x + R[6] * y + R[10] * z + R[14];
        const a = N[i], b = N[i + 1], c = N[i + 2];
        nrm[i] = R[0] * a + R[4] * b + R[8] * c;
        nrm[i + 1] = R[1] * a + R[5] * b + R[9] * c;
        nrm[i + 2] = R[2] * a + R[6] * b + R[10] * c;
      }
      return { pos, nrm, idx: m.index };
    };
    const ROUND = ['base', 'column'];
    const STATIC = [...ROUND, 'rule', 'meridian', 'horizon', 'equator'];
    const TURNING = ['wheel', 'idler', 'pinion'];
    const CELESTIAL = ['ecliptic', 'colure', 'globe'];
    const rest = {};
    for (const id of [...STATIC, ...TURNING, ...CELESTIAL]) if (merged[id]) rest[id] = toRest(id, merged[id]);
    const cells = [64, 80, 96, 112][S.tier];
    // the instrument without its arms, at rest
    const lo = [-BASE.radius - 0.05, GROUND_Y - 0.05, -BASE.radius - 0.05];
    const hi = [BASE.radius + 0.05, ARMILLARY.c[1] + ARMILLARY.axisHalf + 0.15, BASE.radius + 0.05];
    const write = (id, grid) => {
      const m = merged[id];
      const out = new Float32Array(m.position.length / 3);
      grid.occlude(rest[id], out);
      for (let i = 0; i < out.length; i++) m.mat[4 * i + 3] = out[i];
    };
    // the round static parts; the turning wheels see only these and themselves
    const round = new VoxelGrid(lo, hi, cells);
    for (const id of ROUND) if (rest[id]) round.splat(rest[id]);
    for (const id of TURNING) {
      if (!rest[id]) continue;
      const g = round.clone();
      g.splat(rest[id]);
      write(id, g);
    }
    // static parts see everything at rest
    const full = round;
    for (const id of STATIC) if (rest[id] && !ROUND.includes(id)) full.splat(rest[id]);
    for (const id of [...TURNING, ...CELESTIAL]) if (rest[id]) full.splat(rest[id]);
    for (const id of STATIC) if (rest[id]) write(id, full);
    // the celestial rings and globe see the equator and themselves
    const cel = new VoxelGrid([ARMILLARY.c[0] - 1.8, ARMILLARY.c[1] - 1.8, ARMILLARY.c[2] - 1.8], [ARMILLARY.c[0] + 1.8, ARMILLARY.c[1] + 1.8, ARMILLARY.c[2] + 1.8], Math.round(cells * 0.75));
    for (const id of ['equator', ...CELESTIAL]) if (rest[id]) cel.splat(rest[id]);
    for (const id of CELESTIAL) if (rest[id]) write(id, cel);
    // arms, in their own frame, against themselves and the column
    for (const A of ARMS) {
      const m = merged['arm:' + A.id];
      if (!m) continue;
      const self = { pos: m.position, nrm: m.normal, idx: m.index };
      const ab = boundsOf([self]);
      const g = new VoxelGrid([Math.min(ab.min[0], -0.3), ab.min[1], ab.min[2]], ab.max, Math.round(cells * 0.9));
      g.splat(self);
      if (rest.column) g.splat(rest.column);
      const out = new Float32Array(m.position.length / 3);
      g.occlude(self, out);
      for (let i = 0; i < out.length; i++) m.mat[4 * i + 3] = out[i];
    }
  }

  async function build() {
    if (disposed) throw new Error('createInstrument: disposed');
    const t0 = now();
    clear();
    const tierNow = S.tier;
    const parts = buildParts({ tier: tierNow, triangulate, rng: rngFor(seed, 'instrument:parts') });
    await yieldTask();
    if (disposed) return;
    const merged = {};
    for (const [id, g] of Object.entries(parts.groups)) merged[id] = mergeGroup(g);
    bake(merged);
    await yieldTask();
    if (disposed) return;

    const made = { groups: {}, spheres: [], armSpheres: [], meshes: [], materials: [], geometries: [], triangles: 0 };
    const track = (mesh) => {
      mesh.onBeforeRender = syncHook;
      made.meshes.push(mesh);
      return mesh;
    };
    const [sw, sh] = TIER_SPHERE[tierNow];
    const stoneGeo = sphereGeometry(sw, sh, HULL.big);
    const smallGeo = sphereGeometry(Math.max(16, sw >> 1), Math.max(10, sh >> 1), HULL.mid);
    made.geometries.push(stoneGeo, smallGeo);

    for (const [id, g] of Object.entries(parts.groups)) {
      const m = merged[id];
      const isArm = id.startsWith('arm:');
      const isShell = id === 'shell';
      const accentCol = isArm ? PALETTE.aurora : PALETTE.amber;
      const obj = new THREE.Group();
      obj.name = 'instrument:' + id;
      obj.matrixAutoUpdate = false;
      root.add(obj);
      const geo = geometryOf(m);
      made.geometries.push(geo);
      made.triangles += m.triangles;
      const solid = solidMaterial(THREE, U, { bones: isArm, shell: isShell, accentCol });
      const hull = hullMaterial(THREE, U, { bones: isArm, shell: isShell, accentCol });
      const sMesh = track(new THREE.Mesh(geo, solid));
      const hMesh = track(new THREE.Mesh(geo, hull));
      if (isArm) {
        sMesh.frustumCulled = false;
        hMesh.frustumCulled = false;
      }
      obj.add(sMesh, hMesh);
      made.materials.push(solid, hull);
      const entry = { obj, solid: sMesh, hull: hMesh, lines: null, detail: null, spheres: [] };
      if (g.lines.count) {
        const lm = lineMaterial(THREE, U, { bones: isArm, accentCol });
        entry.lines = track(lineMesh(THREE, g.lines, lm));
        obj.add(entry.lines);
        made.materials.push(lm);
        made.geometries.push(entry.lines.geometry);
        made.triangles += g.lines.count * 2;
        if (g.detail.count) {
          entry.detail = track(lineMesh(THREE, g.detail, lm));
          obj.add(entry.detail);
          made.geometries.push(entry.detail.geometry);
          made.triangles += g.detail.count * 2;
        }
      }
      // sphere-shader meshes: the globe and beads live in their group; the
      // stones are posed by the arms
      for (const sp of g.spheres) {
        const small = sp.r < 0.15;
        const sg = small ? smallGeo : stoneGeo;
        const mat = sphereMaterial(THREE, U, { pattern: sp.pattern, seed: sp.seed });
        const mesh = new THREE.Mesh(sg, mat);
        mesh.matrixAutoUpdate = false;
        mesh.onBeforeRender = sphereHook(mesh);
        const hm = track(new THREE.Mesh(sg, hullMaterial(THREE, U, {})));
        hm.matrixAutoUpdate = false;
        made.materials.push(mat, hm.material);
        made.meshes.push(mesh);
        made.triangles += sg.index.count / 3;
        if (isArm) {
          root.add(mesh, hm);
          made.armSpheres.push({ id: sp.id, mesh, hull: hm });
        } else {
          mesh.matrix.fromArray(sp.matrix);
          hm.matrix.fromArray(sp.matrix);
          obj.add(mesh, hm);
          entry.spheres.push({ id: sp.id, mesh, hull: hm });
        }
      }
      made.groups[id] = entry;
    }
    B = made;
    S.builtTier = tierNow;
    applyAll();
    applyTier();
    B.ms = now() - t0;
    return { triangles: made.triangles, ms: B.ms, tier: tierNow };
  }

  function clear() {
    if (!B) return;
    for (const g of B.geometries) g.dispose();
    for (const m of B.materials) m.dispose();
    for (const c of [...root.children]) root.remove(c);
    B = null;
  }

  // ---------------------------------------------------------------- pose ---
  function front() {
    return S.front ?? S.seenFront;
  }

  function applyAll() {
    if (!B) return;
    const P = instrumentPose({ crank: S.crank, arms: S.arms, build: S.build, contact: S.contact, hover: S.hover, front: front(), viewport: S.viewport }, tilts);
    const G = B.groups;
    const vis = {
      base: P.reveal.base, wheel: P.reveal.wheel, rule: P.reveal.wheel, idler: P.reveal.idler, pinion: P.reveal.pinion,
      column: P.reveal.column, meridian: P.reveal.meridian, horizon: P.reveal.horizon, equator: P.reveal.equator,
      ecliptic: P.reveal.ecliptic, colure: P.reveal.colure, globe: P.reveal.globe,
    };
    for (const [id, m] of Object.entries(P.groups)) {
      const e = G[id];
      if (!e) continue;
      e.obj.matrix.fromArray(m);
      e.obj.matrixWorldNeedsUpdate = true;
      if (id === 'shell') e.obj.visible = P.shell.visible;
      else e.obj.visible = (vis[id] ?? 1) > 0;
    }
    // the alidade clip for the wheel's engraving
    if (G.wheel && G.wheel.lines) {
      const a = ALIDADE_ANGLE - P.train.main.rot;
      G.wheel.lines.material.uniforms.uRule.value.set(Math.cos(a), Math.sin(a), P.reveal.wheel > 0 ? 1 : 0, 0);
    }
    // the shell's bands
    if (G.shell) {
      for (const mesh of [G.shell.solid, G.shell.hull]) {
        const u = mesh.material.uniforms;
        P.shell.normals.forEach((n, k) => u.uBandN.value[k].set(n[0], n[1], n[2]));
        u.uBandS.value = P.shell.full ? 2 : P.shell.sinBeta;
      }
    }
    // the crank's accent
    if (G.pinion) for (const mesh of [G.pinion.solid, G.pinion.hull, G.pinion.lines]) if (mesh) mesh.material.uniforms.uAccentOn.value = S.crankAccent;
    // arms
    P.arms.forEach((a, i) => {
      const e = G['arm:' + STONES[i]];
      if (e) {
        e.obj.matrix.fromArray(a.group);
        e.obj.matrixWorldNeedsUpdate = true;
        e.obj.visible = a.visible;
        for (const mesh of [e.solid, e.hull, e.lines]) {
          if (!mesh) continue;
          const u = mesh.material.uniforms;
          a.bones.forEach((bm, k) => u.uBones.value[k].fromArray(bm));
          u.uAccentOn.value = a.hover;
        }
      }
      const s = B.armSpheres.find((x) => x.id === STONES[i]);
      if (s) {
        s.mesh.matrix.fromArray(a.sphere);
        s.hull.matrix.fromArray(a.sphere);
        s.mesh.matrixWorldNeedsUpdate = true;
        s.hull.matrixWorldNeedsUpdate = true;
        s.mesh.visible = a.visible && a.sphereVisible;
        s.hull.visible = s.mesh.visible && hullsOn();
      }
    });
    applyHullVisibility();
  }

  const hullsOn = () => S.brass < 0.8;
  function applyHullVisibility() {
    if (!B) return;
    const on = hullsOn();
    for (const e of Object.values(B.groups)) {
      e.hull.visible = on;
      for (const s of e.spheres) s.hull.visible = on;
    }
    for (const s of B.armSpheres) s.hull.visible = on && s.mesh.visible;
  }

  function applyTier() {
    U.uTier.value = S.tier;
    if (!B) return;
    for (const e of Object.values(B.groups)) if (e.detail) e.detail.visible = S.tier >= 2;
  }

  // ------------------------------------------------------------ lighting ---
  const lightDir = (az, el) => [Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az)];
  function setLight({ dir: d, color, intensity = 1, ambient, position, range, cone } = {}) {
    if (d) {
      const v = Array.isArray(d) ? d : [d.x, d.y, d.z];
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      U.uKeyDir.value.set(v[0] / l, v[1] / l, v[2] / l);
    }
    const c = toLinear(color, [1, 1, 1]);
    U.uKeyCol.value.set(c[0] * intensity, c[1] * intensity, c[2] * intensity);
    // the engraving's tone takes the key's brightness, held near the approved range
    U.uKeyI.value = Math.min(1.4, intensity * Math.max(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], 0));
    if (ambient !== undefined) U.uAmb.value = ambient;
    if (position) {
      const p = Array.isArray(position) ? position : [position.x, position.y, position.z];
      U.uKeyPoint.value = 1;
      U.uKeyPos.value.set(p[0], p[1], p[2]);
      U.uKeyRange.value = range ?? 10;
      // the lamp's axis: toward the instrument unless `dir` says otherwise
      const target = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
      const ax = d ? U.uKeyDir.value.clone().negate() : target.sub(U.uKeyPos.value).normalize();
      U.uSpotDir.value.copy(ax);
      if (cone) U.uSpotCos.value.set(Math.cos(cone[0] * DEG), Math.cos(cone[1] * DEG));
      else U.uSpotCos.value.set(-2, -1);
    } else {
      U.uKeyPoint.value = 0;
      U.uSpotCos.value.set(-2, -1);
    }
    // fill and rim follow the key: the fill 105 deg round and low, the rim behind
    const k = U.uKeyDir.value;
    const az = Math.atan2(-k.z, k.x);
    const f = lightDir(az + 105 * DEG, 20 * DEG);
    U.uFillDir.value.set(f[0], f[1], f[2]);
    if (!S.rimDirSet) {
      const r = lightDir(az + Math.PI, 25 * DEG);
      U.uRimDir.value.set(r[0], r[1], r[2]);
    }
  }
  function setEnvColors({ sky, ground, rim, rimDir } = {}) {
    if (sky !== undefined) {
      const c = toLinear(sky);
      U.uSky.value.set(c[0], c[1], c[2]);
      U.uFillCol.value.set(c[0] * 0.6, c[1] * 0.6, c[2] * 0.6);
      U.uAmbCol.value.set(c[0] * 4, c[1] * 4, c[2] * 4);
    }
    if (ground !== undefined) {
      const c = toLinear(ground);
      U.uGround.value.set(c[0], c[1], c[2]);
    }
    if (rim !== undefined) {
      const c = toLinear(rim);
      U.uEnvRim.value.set(c[0], c[1], c[2]);
      U.uRimCol.value.set(c[0], c[1], c[2]);
    }
    if (rimDir) {
      const v = Array.isArray(rimDir) ? rimDir : [rimDir.x, rimDir.y, rimDir.z];
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      U.uRimDir.value.set(v[0] / l, v[1] / l, v[2] / l);
      S.rimDirSet = true;
    } else if (rimDir === null && S.rimDirSet) {
      // back to a rim derived from the key (an act that set its own hands it back)
      S.rimDirSet = false;
      const k = U.uKeyDir.value;
      const r = lightDir(Math.atan2(-k.z, k.x) + Math.PI, 25 * DEG);
      U.uRimDir.value.set(r[0], r[1], r[2]);
    }
  }
  // defaults: the approved ending's light (key az 225 el 40, fill, rim) and
  // a night room's environment
  setLight({ dir: lightDir(225 * DEG, 40 * DEG), color: [1, 1, 1], intensity: 1, ambient: 0.02 });
  setEnvColors({ sky: '#1b2440', ground: '#08070b', rim: '#27e0d0' });

  // ---------------------------------------------------------------- hover ---
  function setHover(id, opts = {}) {
    if (id !== null && id !== undefined && !STONES.includes(id)) throw new TypeError(`setHover: unknown stone "${id}"`);
    S.hoverId = id ?? null;
    STONES.forEach((s, i) => {
      const target = s === S.hoverId ? 1 : 0;
      if (gsap && !reducedMotion && !opts.immediate) {
        gsap.killTweensOf(hoverW[i]);
        gsap.to(hoverW[i], {
          w: target, duration: 0.55, ease: 'power2.inOut',
          onUpdate: () => {
            S.hover[i] = hoverW[i].w;
            applyAll();
          },
        });
      } else {
        gsap?.killTweensOf(hoverW[i]);
        hoverW[i].w = target;
        S.hover[i] = target;
      }
    });
    applyAll();
  }

  // --------------------------------------------------------------- stones ---
  function stonePose(id) {
    const i = STONES.indexOf(id);
    if (i < 0) throw new TypeError(`unknown stone "${id}"`);
    return armPose(i, { crank: S.crank, arms: S.arms, build: S.build, contact: S.contact, hover: S.hover, front: front(), viewport: S.viewport }, tilts[i]);
  }
  function stoneWorldPosition(id, out) {
    const p = stonePose(id).centre;
    const v = out || new THREE.Vector3();
    root.updateWorldMatrix(true, false);
    return v.set(p[0], p[1], p[2]).applyMatrix4(root.matrixWorld);
  }
  function worldScale() {
    root.updateWorldMatrix(true, false);
    const e = root.matrixWorld.elements;
    return Math.hypot(e[0], e[1], e[2]) || 1;
  }

  function currentBounds() {
    const min = [-BASE.radius, GROUND_Y, -BASE.radius];
    const max = [BASE.radius, ARMILLARY.c[1] + ARMILLARY.rings[0].R + 0.02, BASE.radius];
    const P = instrumentPose({ crank: S.crank, arms: S.arms, build: S.build, contact: S.contact, hover: S.hover, front: front(), viewport: S.viewport }, tilts);
    for (const a of P.arms) {
      if (!a.visible) continue;
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], a.centre[k] - a.hoopR);
        max[k] = Math.max(max[k], a.centre[k] + a.hoopR);
      }
    }
    const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const radius = Math.hypot(max[0] - center[0], max[1] - center[1], max[2] - center[2]);
    return { min, max, center, radius, armillary: { center: ARMILLARY.c.slice(), radius: ARMILLARY.rings[0].R } };
  }

  // ------------------------------------------------------------------ api ---
  const api = {
    object3D: root,
    stones: STONES,
    build() {
      buildPromise = build();
      return buildPromise;
    },
    get ready() {
      return !!B;
    },
    setBuild(b) {
      S.build = clamp01(Number.isFinite(b) ? b : 0);
      applyAll();
    },
    setCrank(rad) {
      S.crank = Number.isFinite(rad) ? rad : 0;
      applyAll();
    },
    setArms(e) {
      S.arms = clamp01(Number.isFinite(e) ? e : 0);
      applyAll();
    },
    setBrass(k) {
      S.brass = clamp01(Number.isFinite(k) ? k : 0);
      U.uBrass.value = S.brass;
      applyHullVisibility();
    },
    setHover,
    setContact(k) {
      S.contact = clamp01(Number.isFinite(k) ? k : 0);
      applyAll();
    },
    setLight,
    setEnvColors,
    stoneWorldPosition,
    stoneRadius(id) {
      return stonePose(id).hoopR * worldScale();
    },
    /** Every stone's world position, keyed by id (ARCHITECTURE.md's name). */
    stoneWorldPositions() {
      return Object.fromEntries(STONES.map((id) => [id, stoneWorldPosition(id)]));
    },
    /** ARCHITECTURE.md's name for setting both: { light, env }. */
    setEnvironment({ light, env } = {}) {
      if (light) setLight(light);
      if (env) setEnvColors(env);
    },
    get bounds() {
      return currentBounds();
    },
    setTier(t) {
      S.tier = clampTier(t);
      applyTier();
    },
    /** 'land' (wide) or 'port' (tall): which ending layout the arms extend to. */
    setViewport(vp) {
      if (!VIEWPORTS.includes(vp)) throw new TypeError(`setViewport: unknown viewport "${vp}"`);
      S.viewport = vp;
      applyAll();
    },
    /** The viewer, for the hover swing and the contact fold (else the last camera that drew it). */
    setCamera(camera) {
      if (!camera) {
        S.front = null;
        return;
      }
      root.updateWorldMatrix(true, false);
      camera.updateMatrixWorld();
      const p = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert());
      if (Math.hypot(p.x, p.z) > 1e-4) S.front = Math.atan2(-p.z, p.x);
      applyAll();
    },
    /** The amber accent on the crank handle (one accent per frame). */
    setCrankAccent(k) {
      S.crankAccent = clamp01(Number.isFinite(k) ? k : 0);
      applyAll();
    },
    /**
     * Look controls: { fog: [near, far] (world units) | null, fogColor, macro:
     * [near, far] (instrument units per CSS px; up close the engraving gives
     * way to machined metal) | null, ink, dark, outline, widthK, spacing,
     * brush, palette: { night, stage, ink, muted, faint, line, shade },
     * hoverColor, crankColor }.
     */
    setLook(o = {}) {
      if (o.fog !== undefined) {
        if (o.fog) U.uFog.value.set(o.fog[0], o.fog[1]);
        else U.uFog.value.set(1e6, 2e6);
      }
      if (o.fogColor !== undefined) U.uFogCol.value.set(...toLinear(o.fogColor));
      if (o.macro !== undefined) {
        if (o.macro) U.uMacro.value.set(o.macro[0], o.macro[1]);
        else U.uMacro.value.set(-2, -1);
      }
      if (o.ink !== undefined) U.uInkScale.value = o.ink;
      if (o.dark !== undefined) U.uDarkScale.value = o.dark;
      if (o.outline !== undefined) U.uOutline.value = o.outline;
      if (o.widthK !== undefined) U.uWidthK.value = o.widthK;
      if (o.spacing !== undefined) U.uSpacing.value = o.spacing;
      if (o.brush !== undefined) U.uBrush.value = o.brush;
      const P = o.palette || {};
      for (const [k, u] of [['night', 'uNight'], ['stage', 'uStage'], ['ink', 'uInk'], ['muted', 'uMuted'], ['faint', 'uFaint'], ['line', 'uLine'], ['shade', 'uShade']]) {
        if (P[k] !== undefined) U[u].value.set(...toLinear(P[k]));
      }
      if (!B) return;
      const recolor = (mesh, c) => mesh && mesh.material.uniforms.uAccentCol.value.set(...toLinear(c));
      for (const [id, e] of Object.entries(B.groups)) {
        if (o.hoverColor !== undefined && id.startsWith('arm:')) [e.solid, e.hull, e.lines].forEach((m) => recolor(m, o.hoverColor));
        if (o.crankColor !== undefined && id === 'pinion') [e.solid, e.hull, e.lines].forEach((m) => recolor(m, o.crankColor));
      }
    },
    /** Where the stones fall on screen (CSS px) for a camera and a viewport of w x h. */
    stoneScreen(camera, w, h) {
      const out = [];
      const v = new THREE.Vector3();
      const e = new THREE.Vector3();
      camera.updateMatrixWorld();
      for (const id of STONES) {
        stoneWorldPosition(id, v);
        e.copy(v).applyMatrix4(camera.matrixWorldInverse);
        const r = api.stoneRadius(id);
        const P5 = camera.projectionMatrix.elements[5];
        const rpx = camera.isOrthographicCamera ? (r * P5 * h) / 2 : ((r * P5) / Math.max(-e.z, 1e-4)) * (h / 2);
        v.project(camera);
        out.push({ id, x: (v.x * 0.5 + 0.5) * w, y: (0.5 - v.y * 0.5) * h, r: rpx, visible: v.z < 1 && -e.z > 0 });
      }
      return out;
    },
    /** A copy of the current parameters. */
    state() {
      return { crank: S.crank, arms: S.arms, build: S.build, brass: S.brass, contact: S.contact, hover: S.hoverId, viewport: S.viewport, tier: S.tier, builtTier: S.builtTier, front: front(), triangles: B ? B.triangles : 0, buildMs: B ? B.ms : 0 };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const h of hoverW) gsap?.killTweensOf(h);
      clear();
      root.removeFromParent();
    },
  };
  return api;
}

function clampTier(t) {
  if (typeof t === 'string') t = { high: 3, medium: 2, low: 1 }[t] ?? 3;
  return Math.max(0, Math.min(3, Number.isFinite(t) ? Math.round(t) : 3));
}
function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export { dir };
