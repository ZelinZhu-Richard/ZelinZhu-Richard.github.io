// Assembles one still's world from its resolved shot: the instrument at
// its build state, the plate drawing, the desk set, stars, dust and the
// orange point. No DOM, so smoke.mjs can build every frame in plain Node.
// The space frames' sky is not part of this scene: main.js draws it first,
// in its own pass (backdrop.js).

import * as THREE from 'three';
import { buildInstrument, LAYERS } from './machine.js';
import { buildDesk } from './desk.js';
import { buildPlate, liftProjections } from './plate.js';
import { starField, dust, accentDot } from './stars.js';
import { makeCamera } from './camera.js';
import { LineSet } from './lines.js';
import { trainLayout, GEAR, ARMILLARY } from './layout.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function buildWorld(S, groups) {
  const scene = new THREE.Scene();
  const parts = { lineMeshes: [] };
  const W = S.world;

  if (S.build && Object.keys(S.build).length) {
    const inst = buildInstrument(S.state, groups.inst);
    if (W.lift) inst.group.position.y = W.lift;
    scene.add(inst.group);
    parts.inst = inst;
    if (inst.lineMesh) parts.lineMeshes.push(inst.lineMesh);
  }

  if (W.plate) {
    const rot = trainLayout(S.state.crank || 0).main.rot;
    const pl = buildPlate({ layout: S.layout, mode: W.plate, rot, group: groups.plate });
    scene.add(pl.group);
    parts.plate = pl;
    parts.lineMeshes.push(pl.lineMesh);
    if (W.plate === 'ghost' && W.lift) {
      // construction lines: the wheel rose straight up off its drawing
      const ls = new LineSet(groups.plate);
      const top = W.lift + GEAR.y0;
      for (const p of liftProjections(rot, top, W.projections || [])) {
        ls.pattern([p.from, p.to], [0.07, 0.05], 0.6, -0.15);
      }
      ls.pattern([[0, 0.004, 0], [0, top + GEAR.main.thick + 0.55, 0]], [0.16, 0.05, 0.03, 0.05], 0.6, 0.05);
      const m = ls.build();
      m.layers.set(LAYERS.INK);
      scene.add(m);
      parts.lineMeshes.push(m);
    }
  }

  if (W.desk) {
    const d = buildDesk({ group: groups.desk, mode: W.desk, accent: W.deskAccent || 'none', show: W.deskShow || {} });
    scene.add(d.group);
    parts.desk = d;
    parts.lineMeshes.push(...d.lineMeshes);
  }

  if (W.stars) {
    const st = starField({ bandN: [-0.6, 0.8, 0.16] });
    st.layers.set(LAYERS.FX);
    scene.add(st);
  }
  if (W.dust === 'room') {
    const C = ARMILLARY.c;
    const camP = V(resolveCamPos(S));
    const ds = dust({
      seed: 0xd057,
      box: [-9, 1.2, -5.6, 9, 11, 1.2],
      count: 80,
      alpha: [0.2, 0.52],
      filter: (p) => Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) > 1.7 && V(p).distanceTo(camP) > 2.6,
    });
    ds.layers.set(LAYERS.FX);
    scene.add(ds);
  }
  if (W.dot === 'centre') {
    const dot = accentDot([0, 0.004, 0], 7);
    dot.layers.set(LAYERS.FX);
    scene.add(dot);
  } else if (W.dot === 'filament') {
    // the lamp's filament, just warming: one orange point among the stars
    const dot = accentDot(S.lamp.filament, 4.2);
    dot.layers.set(LAYERS.FX);
    scene.add(dot);
  }
  scene.updateMatrixWorld(true);
  return { scene, parts };
}

function resolveCamPos(S) {
  const c = makeCamera(S.cam, 100, 100);
  return c.position.toArray();
}

