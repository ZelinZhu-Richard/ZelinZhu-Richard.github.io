// Builds every still's world in plain Node (three.js without WebGL) and
// audits what a browser would not report until too late:
//  - every geometry attribute is finite (no NaN from a bad normalize),
//  - exactly one orange accent object per frame (solids, ribbons, points
//    clustered in space),
//  - every uniform a shader declares is supplied by its material,
//  - every function a shader calls is a GLSL built-in or defined in it,
//  - the frame stays under the triangle budget (solids and their hulls),
//  - each space frame's sky (backdrop.js + sketches/sky) configures with
//    finite directions, the accent colour is the frame's own,
//  - the film pass (finish.js) lints clean and stays subtle in every frame
//    (glow, grain and vignette under their caps, the roll-off knee high).
//   node sketches/instrument/smoke.mjs

import * as THREE from 'three';
import { SHOTS, resolveShot } from './shots.js';
import { buildWorld } from './world.js';
import { makeGroup } from './materials.js';
import { applySky, skyCamera, skyFrame } from './backdrop.js';
import { PALETTE, hex } from './palette.js';
import { SHADERS, FINISH_DEFAULT, gaussTaps } from './finish.js';

const TRI_BUDGET = 350000;
const VIEW = { land: [1440, 900], port: [390, 844] };

const AUTO = new Set(['modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'isOrthographic']);
const BUILTIN = new Set(`abs acos all any asin atan ceil clamp cos cross dFdx dFdy degrees determinant distance dot equal exp exp2 faceforward floor fract fwidth
  greaterThan greaterThanEqual inverse inversesqrt length lessThan lessThanEqual log log2 max min mix mod normalize not notEqual pow radians reflect refract round
  sign sin smoothstep sqrt step tan texture textureLod texelFetch transpose trunc float int bool vec2 vec3 vec4 ivec2 ivec3 mat2 mat3 mat4 if for while return`.split(/\s+/).filter(Boolean));

const problems = [];
const shaderSeen = new Set();

function lintShader(name, src, uniforms, stage) {
  const key = name + stage + src.length;
  if (shaderSeen.has(key)) return;
  shaderSeen.add(key);
  const code = src.replace(/\/\/.*$/gm, '');
  for (const m of code.matchAll(/uniform\s+\w+\s+(\w+)(\s*\[\s*\d+\s*\])?\s*;/g)) {
    if (!AUTO.has(m[1]) && !(m[1] in uniforms)) problems.push(`${name} (${stage}): uniform ${m[1]} is declared but not supplied`);
  }
  const defined = new Set([...code.matchAll(/\b(?:float|vec2|vec3|vec4|bool|int|void|mat3)\s+(\w+)\s*\(/g)].map((m) => m[1]));
  for (const m of code.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
    const f = m[1];
    if (BUILTIN.has(f) || defined.has(f) || f === 'main') continue;
    problems.push(`${name} (${stage}): calls unknown function ${f}()`);
  }
  if (stage === 'frag' && !/gl_FragColor/.test(code)) problems.push(`${name}: fragment shader writes no colour`);
}

// the film pass: its shaders, with the uniforms createFinish supplies
{
  const U = (names) => Object.fromEntries(names.map((n) => [n, true]));
  const sets = {
    DOWN_FRAG: U(['tScene', 'tSky', 'uHasSky', 'uBg', 'uSrcTexel', 'uBlock', 'uThresh']),
    HALF_FRAG: U(['tSrc']),
    BLUR_FRAG: U(['tSrc', 'uStep', 'uW', 'uO']),
    OUT_FRAG: U(['tScene', 'tSky', 'tGlow1', 'tGlow2', 'uHasSky', 'uBg', 'uOn', 'uGlow1', 'uGlow2', 'uKnee', 'uGrain', 'uVignette', 'uRes', 'uQuiet', 'uQuietSoft']),
  };
  for (const [k, u] of Object.entries(sets)) {
    lintShader('finish/' + k, SHADERS.VERT, {}, 'vert');
    lintShader('finish/' + k, SHADERS[k], u, 'frag');
  }
  for (const sg of [2, 3]) {
    const g = gaussTaps(sg);
    const sum = g.W[0] + 2 * g.W.slice(1).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-6 || !g.O.every(Number.isFinite)) problems.push(`finish: gaussian taps for sigma ${sg} do not sum to 1`);
  }
}

let total = 0;
for (const id of Object.keys(SHOTS)) {
  for (const layout of ['land', 'port']) {
    const S = resolveShot(id, layout);
    const groups = { inst: makeGroup(), desk: makeGroup(), plate: makeGroup() };
    const { scene } = buildWorld(S, groups);
    scene.updateMatrixWorld(true);
    const accents = [];
    let tris = 0;
    let segs = 0;
    let pts = 0;
    scene.traverse((o) => {
      if (!o.geometry) return;
      const g = o.geometry;
      for (const [an, attr] of Object.entries(g.attributes)) {
        const arr = attr.array;
        for (let i = 0; i < arr.length; i++) {
          if (!Number.isFinite(arr[i])) {
            problems.push(`${id}/${layout}: ${o.material?.name || o.type} attribute ${an} has a non-finite value`);
            break;
          }
        }
      }
      const mat = o.material;
      if (mat && mat.isShaderMaterial) {
        lintShader(mat.name || 'shader', mat.vertexShader, mat.uniforms, 'vert');
        lintShader(mat.name || 'shader', mat.fragmentShader, mat.uniforms, 'frag');
      }
      if (o.isPoints) {
        pts += g.attributes.position.count;
        if (o.name === 'accent-dot') accents.push({ what: 'point', p: new THREE.Vector3().fromBufferAttribute(g.attributes.position, 0) });
        return;
      }
      if (g.isInstancedBufferGeometry) {
        const P = g.attributes.iP.array;
        const A = g.attributes.iA.array;
        segs += g.instanceCount;
        for (let i = 0; i < g.instanceCount; i++) {
          if (P[i * 4 + 2] > 0.5) accents.push({ what: 'ribbon', p: new THREE.Vector3(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]).applyMatrix4(o.matrixWorld) });
        }
        return;
      }
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      const acc = mat?.uniforms?.uAccentOn?.value > 0.5 && mat.name !== 'hull';
      if (acc) {
        g.computeBoundingSphere();
        accents.push({ what: 'solid', p: g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld), r: g.boundingSphere.radius });
      }
    });
    // cluster accent elements that belong to one object (single linkage:
    // a ring of ribbon segments is one object however wide it is)
    let clusters = [];
    for (const a of accents) {
      const near = clusters.filter((k) => k.members.some((m) => m.p.distanceTo(a.p) < 0.4 + (m.r || 0) + (a.r || 0)));
      const merged = { members: [a], what: a.what };
      for (const k of near) merged.members.push(...k.members);
      clusters = clusters.filter((k) => !near.includes(k));
      clusters.push(merged);
    }
    for (const c of clusters) c.p = c.members.reduce((s, m) => s.add(m.p), new THREE.Vector3()).multiplyScalar(1 / c.members.length);
    const where = clusters.map((c) => `${c.what}@(${c.p.x.toFixed(1)}, ${c.p.y.toFixed(1)}, ${c.p.z.toFixed(1)})`).join(' ');
    const accentHex = S.accentColor || '#e8743b';
    let sky = '';
    if (S.sky) {
      const [w, h] = VIEW[layout];
      const cam = skyCamera(S, w, h);
      const F = skyFrame(S, cam);
      const dirs = [F.pole, F.core, F.nebula?.dir, ...F.heroes.map((q) => q.dir)].filter(Boolean);
      if (!dirs.every((v) => Number.isFinite(v.x + v.y + v.z) && Math.abs(v.length() - 1) < 1e-4)) problems.push(`${id}/${layout}: sky directions are not finite unit vectors`);
      const skyScene = applySky(S, cam, w, h, null);
      const m = skyScene.children[0].material;
      for (const [k, u] of Object.entries(m.uniforms)) {
        const v = u.value;
        const nums = typeof v === 'number' ? [v] : v?.toArray ? v.toArray() : Array.isArray(v) ? v.flatMap((q) => q.toArray()) : [];
        if (!nums.every(Number.isFinite)) problems.push(`${id}/${layout}: sky uniform ${k} is not finite`);
      }
      if (!S.palette || hex(S.palette.night).some((c, i) => c > PALETTE.night[i] + 0.02)) problems.push(`${id}/${layout}: space frame without its deep fill`);
      sky = `  sky: galaxy ${F.amount}, nebula ${F.nebula ? 'yes' : 'no'}, ${F.heroes.length} spike star(s)`;
    }
    // the finish must stay a finish: subtle glow, grain and vignette
    const F = { ...FINISH_DEFAULT, ...S.finish };
    if (!(F.glow <= 0.35 && F.grain <= 0.025 && F.vignette <= 0.25 && F.knee >= 0.8 && F.threshold >= 0.6)) problems.push(`${id}/${layout}: film pass too strong (${JSON.stringify(F)})`);
    console.log(`${(id + '/' + layout).padEnd(20)} tris ${String(Math.round(tris)).padStart(7)}  ribbons ${String(segs).padStart(6)}  points ${String(pts).padStart(5)}  accent ${accentHex}: ${where || 'none'}${sky}`);
    if (clusters.length !== 1) problems.push(`${id}/${layout}: ${clusters.length} accent objects (want exactly 1): ${where}`);
    if (tris > TRI_BUDGET) problems.push(`${id}/${layout}: ${Math.round(tris)} triangles (budget ${TRI_BUDGET})`);
    total++;
  }
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of [...new Set(problems)]) console.log('  ' + p);
  process.exitCode = 1;
} else {
  console.log(`\nsmoke: ${total} frames built; geometry finite; one accent each; under ${TRI_BUDGET} triangles; skies configure; shaders lint clean`);
}
