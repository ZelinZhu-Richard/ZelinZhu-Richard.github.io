// Export one or more sky shots as plain data for the offscreen GL preview
// (tools/render.py): the real shader source from sky.js, every uniform after
// shots.js has set the shot up, and the camera matrices. Nothing here draws.
//
//   node export.mjs --w 1440 --h 900 --dpr 1 --tier 2 --t 0 --shots space,both
//
// Prints one JSON array on stdout.

import * as THREE from 'three';
import { createSky } from '../sky.js';
import { SHOT_IDS, layoutFor, makeCamera, applyShot, textBox, boxToNdc, hasText } from '../shots.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

const W = Number(arg('w', 1440));
const H = Number(arg('h', 900));
const DPR = Number(arg('dpr', 1));
const TIER = Number(arg('tier', -1));
const T = Number(arg('t', 0));
const SEED = Number(arg('seed', 7));
const shots = String(arg('shots', SHOT_IDS.join(','))).split(',').filter((s) => SHOT_IDS.includes(s));

function ser(v) {
  if (typeof v === 'number') return { t: 'f', v: [v] };
  if (typeof v === 'boolean') return { t: 'f', v: [v ? 1 : 0] };
  if (v && v.isVector3) return { t: 'v3', v: [v.x, v.y, v.z] };
  if (v && v.isVector4) return { t: 'v4', v: [v.x, v.y, v.z, v.w] };
  if (v && v.isMatrix3) return { t: 'm3', v: Array.from(v.elements) };
  if (v && v.isMatrix4) return { t: 'm4', v: Array.from(v.elements) };
  if (Array.isArray(v) && v.length && v[0].isVector4) return { t: 'v4[]', v: v.flatMap((q) => [q.x, q.y, q.z, q.w]), n: v.length };
  throw new Error('unknown uniform type');
}

const out = [];
for (const shot of shots) {
  const layout = layoutFor(W, H);
  const tier = TIER >= 0 ? TIER : layout === 'portrait' ? 1 : 2;
  const sky = createSky({ seed: SEED, tier });
  const camera = makeCamera(shot, layout, W, H);
  applyShot(sky, shot, layout, camera);
  sky.setTime(T);
  let quiet = null;
  if (hasText(shot)) {
    quiet = boxToNdc(textBox(layout), W, H, 30);
    sky.setQuietZone(quiet, 1);
  }
  // what onBeforeRender does in the browser: viewport (device px), DPR, encoding, heroes
  const fake = {
    getCurrentViewport: (v) => v.set(0, 0, Math.round(W * DPR), Math.round(H * DPR)),
    getRenderTarget: () => null,
    getPixelRatio: () => DPR,
    outputColorSpace: THREE.SRGBColorSpace,
  };
  camera.updateMatrixWorld(true);
  sky.object3D.onBeforeRender(fake, null, camera);
  const uniforms = {};
  for (const [k, u] of Object.entries(sky.uniforms)) uniforms[k] = ser(u.value);
  out.push({
    shot,
    layout,
    w: W,
    h: H,
    dpr: DPR,
    tier: sky.tier,
    t: T,
    quiet,
    defines: { ...sky.material.defines },
    vert: sky.material.vertexShader,
    frag: sky.material.fragmentShader,
    uniforms,
    projectionMatrix: Array.from(camera.projectionMatrix.elements),
    viewMatrix: Array.from(camera.matrixWorldInverse.elements),
  });
  sky.dispose();
}
process.stdout.write(JSON.stringify(out));
