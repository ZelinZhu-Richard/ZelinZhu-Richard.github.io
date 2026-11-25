// Builds one still: (shot, viewport) -> THREE.Scene + camera. No DOM access,
// so the same code can be inspected offline.

import * as THREE from 'three';
import { buildWorld, routeAt, routeSlice, heightAt, mulberry32 } from './world.js';
import { resolveShot } from './shots.js';
import { makeShared, rgb, vec3, HEX } from './glsl.js';
import { buildTerrain } from './terrain.js';
import { buildSkyPass, buildStars, buildTrails } from './sky.js';
import { LineBatch } from './lines.js';
import { buildPoints } from './points.js';
import { buildCairns } from './cairns.js';

const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function arcLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  return s;
}

// Cumulative-length parameter (0 at the tail, 1 at the head) for colour ramps.
function headRamp(pts) {
  const total = arcLength(pts) || 1;
  const out = [0];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    out.push(s / total);
  }
  return out;
}

// The orange tip: hot at the head, cooling to ink and fading along the tail.
function addTail(batch, pts, width) {
  const t = headRamp(pts);
  const accent = rgb(HEX.accent), muted = rgb(HEX.muted);
  batch.add(pts, {
    colors: t.map((x) => mix3(muted, accent, Math.pow(x, 0.6))),
    alphas: t.map((x) => 0.12 + 0.88 * Math.pow(x, 1.4)),
    width,
  });
}

function snowField(cam, S, aspect, seed) {
  const rand = mulberry32(seed);
  const f = norm(sub(cam.target, cam.pos));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const tanY = Math.tan((cam.fov * Math.PI) / 360), tanX = tanY * aspect;
  const out = [];
  for (let tries = 0; tries < S.snow * 6 && out.length < S.snow; tries++) {
    const x = (rand() * 2 - 1) * 1.05 - cam.shift[0], y = (rand() * 2 - 1) * 1.05 - cam.shift[1];
    const d = S.snowNear + (S.snowFar - S.snowNear) * Math.pow(rand(), 1.35);
    const dir = [f[0] + r[0] * x * tanX + u[0] * y * tanY, f[1] + r[1] * x * tanX + u[1] * y * tanY, f[2] + r[2] * x * tanX + u[2] * y * tanY];
    const p = [cam.pos[0] + dir[0] * d, cam.pos[1] + dir[1] * d, cam.pos[2] + dir[2] * d];
    if (p[1] < heightAt(p[0], p[2]) + 0.05) continue;
    const nearK = 1 - (d - S.snowNear) / (S.snowFar - S.snowNear);
    out.push({ p, size: 1.0 + 2.1 * nearK * nearK * rand(), alpha: 0.22 + 0.5 * nearK * (0.5 + 0.5 * rand()) });
  }
  return out;
}

export function buildShot(shotId, layout, width, height, dpr) {
  const world = buildWorld();
  const R = resolveShot(shotId, layout, world);
  const { cam, scene: S } = R;
  const aspect = width / height;

  const shared = makeShared();
  shared.uRes.value.set(Math.round(width * dpr), Math.round(height * dpr));
  shared.uDpr.value = dpr;
  shared.uQuietK.value = S.quiet;
  shared.uQuietFeather.value = 110 * dpr;

  const camera = new THREE.PerspectiveCamera(cam.fov, aspect, cam.near, cam.far);
  camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
  camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
  if (cam.shift[0] !== 0 || cam.shift[1] !== 0) {
    camera.setViewOffset(width, height, (-cam.shift[0] * width) / 2, (cam.shift[1] * height) / 2, width, height);
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const scene = new THREE.Scene();
  const sky = buildSkyPass(shared, S);
  sky.userData.syncCamera(camera);
  scene.add(sky);
  scene.add(buildTerrain(shared, S, world));
  if (S.cairns) scene.add(buildCairns(shared, S, world));
  if (S.stars > 0) scene.add(buildStars(shared, S, cam));
  if (S.trails && R.pole) scene.add(buildTrails(shared, R.pole, cam));

  const ink = rgb(HEX.ink), muted = rgb(HEX.muted);
  const inkLines = new LineBatch();
  const accentLines = new LineBatch();
  let lamp = null;

  // the climbing route (dashed, like a trail on a map) up to the lamp's tail
  if (S.route > 0) {
    const end = S.lamp ? (S.lamp.s < 0 ? world.routeLength + S.lamp.s : S.lamp.s) - S.lamp.tail : world.routeLength;
    inkLines.add(routeSlice(world, 0, end), { color: ink, alpha: S.route, width: 1.5 });
  }
  if (S.lamp) {
    // a negative position counts back from the end of the route (the cairns)
    const at = S.lamp.s < 0 ? world.routeLength + S.lamp.s : S.lamp.s;
    addTail(accentLines, routeSlice(world, at - S.lamp.tail, at), 1.6);
    lamp = routeAt(world, at);
  }

  // ski tracks: pairs of rails; the lit skier's track stops at the lamp
  if (S.tracks > 0) {
    world.tracks.forEach((t, ti) => {
      let a = t.a, b = t.b;
      if (S.trackLamp && S.trackLamp.track === ti) {
        const n = Math.floor(a.length * S.trackLamp.at);
        const tailN = Math.max(2, Math.round(S.trackLamp.tail / 0.1));
        const aHead = a.slice(Math.max(0, n - tailN), n + 1), bHead = b.slice(Math.max(0, n - tailN), n + 1);
        addTail(accentLines, aHead, 1.2);
        addTail(accentLines, bHead, 1.2);
        lamp = [(a[n][0] + b[n][0]) / 2, (a[n][1] + b[n][1]) / 2, (a[n][2] + b[n][2]) / 2];
        a = a.slice(0, Math.max(1, n - tailN) + 1);
        b = b.slice(0, Math.max(1, n - tailN) + 1);
      }
      inkLines.add(a, { color: ink, alpha: 0.78 * S.tracks, width: 1.05 });
      inkLines.add(b, { color: ink, alpha: 0.78 * S.tracks, width: 1.05 });
    });
  }

  if (inkLines.segs.length) {
    // the route passes behind the copy undimmed: it is the subject of its frame
    scene.add(inkLines.build(shared, { near: cam.near, lift: 0.0025, fog: S.fog, quiet: S.route === 0, renderOrder: 2, name: 'ink-lines' }));
  }
  if (accentLines.segs.length) {
    scene.add(accentLines.build(shared, { maxBlend: false, near: cam.near, lift: 0.003, renderOrder: 4, name: 'accent-lines' }));
  }
  if (lamp) {
    scene.add(buildPoints(shared, [{ p: [lamp[0], lamp[1] + 0.14, lamp[2]], size: 4.2, alpha: 1 }], {
      color: vec3(HEX.accent), maxBlend: false, lift: 0.003, renderOrder: 5, name: 'lamp',
    }));
  }

  if (S.snow > 0) {
    const flakes = snowField(cam, S, aspect, 0x5a0 + shotId.length * 977);
    if (flakes.length) scene.add(buildPoints(shared, flakes, { color: vec3(HEX.ink), quiet: true, renderOrder: 3, name: 'snow' }));
  }

  // Quiet rectangles in drawing-buffer pixels (origin bottom-left).
  function setQuiet(rects) {
    for (let i = 0; i < 3; i++) {
      const r = rects[i];
      if (r) shared.uQuiet.value[i].set(r[0], r[1], r[2], r[3]);
      else shared.uQuiet.value[i].set(0, 0, 0, 0);
    }
  }

  return { scene, camera, shared, R, world, setQuiet };
}

export function disposeShot(shot) {
  if (!shot) return;
  shot.scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
}
