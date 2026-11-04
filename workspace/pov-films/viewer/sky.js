// Sky for the POV films viewer: a full-screen shader that implements the
// films/<slug>/web/sky.json contract (see viewer/README.md), plus a small CPU
// evaluator of the same contract used for the fog colour.
//
// Conventions (shared with the Blender kit):
//   A three.js direction t is the Blender world direction (t.x, -t.z, t.y).
//   Equirect lookup for lookup direction L = M * d:
//     u = atan2(L.y, -L.x) / (2 pi) + 0.5
//     v = atan2(L.z, hypot(L.x, L.y)) / pi + 0.5      (v = 0 is the bottom row)
//   Rect layers are gnomonic (pinhole) projections centred on `forward`:
//     u = dot(d, right) / dot(d, forward) / (2 tan(hfov/2)) + 0.5, v likewise with up;
//     feather multiplies smoothstep(0, feather, .) at each of the four edges.
//     "add": false composites the layer over the ones before it with that mask.
//   Layer value = pow(texel, gamma) * gain, summed in linear light.
//   Equirect "horizon_fade": {floor, height_deg} multiplies the layer by
//     floor + (1 - floor) * smoothstep(0, height_deg, elevation) (the kit's extinction).
//   Rect "disc": r hides the layers before it inside a disc of uv radius r around
//     the rect's centre (the kit's moon, laid over the stars), then adds the layer.
//   Grade: exposure (stops), contrast (power around 0.18), saturation (Rec.709
//   luma), tint. Horizon glow adds color * strength * (1 - t)^2 with
//   t = clamp(elevation / height_deg, 0, 1), so it is full strength at and
//   below the horizon and zero from height_deg upward.

import * as THREE from 'three';

const MAX_LAYERS = 8;

const VERTEX = /* glsl */ `
varying vec3 vDirThree;
void main() {
  vec2 ndc = position.xy;
  // View-space ray through this pixel. Only the x/y rows of the projection are
  // used, so an oblique near plane (mirror pass) does not disturb it.
  vec3 ray = vec3(
    (ndc.x + projectionMatrix[2][0]) / projectionMatrix[0][0],
    (ndc.y + projectionMatrix[2][1]) / projectionMatrix[1][1],
    -1.0);
  vDirThree = inverse(mat3(viewMatrix)) * ray;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const FRAGMENT_HEAD = /* glsl */ `
precision highp float;
varying vec3 vDirThree;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uTint;
uniform vec3 uGlowColor;
uniform float uGlowStrength;
uniform float uGlowHeight;
uniform float uSharpen;
uniform float uEnvMode;
uniform vec3 uGround;
uniform vec3 uEnvGain;
uniform vec3 uEnvAmbient;
uniform float uLightView;

#define SKY_PI 3.141592653589793

// Catmull-Rom bicubic in 9 bilinear taps from mip 0. Used where the plate is
// magnified so point stars stay crisp instead of going soft and square.
vec3 skyCubic(sampler2D tex, vec2 uv, vec2 size) {
  vec2 sp = uv * size;
  vec2 t1 = floor(sp - 0.5) + 0.5;
  vec2 f = sp - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t12 = (t1 + w2 / w12) / size;
  vec2 t0 = (t1 - 1.0) / size;
  vec2 t3 = (t1 + 2.0) / size;
  vec3 r = vec3(0.0);
  r += textureLod(tex, vec2(t0.x,  t0.y), 0.0).rgb * w0.x  * w0.y;
  r += textureLod(tex, vec2(t12.x, t0.y), 0.0).rgb * w12.x * w0.y;
  r += textureLod(tex, vec2(t3.x,  t0.y), 0.0).rgb * w3.x  * w0.y;
  r += textureLod(tex, vec2(t0.x,  t12.y), 0.0).rgb * w0.x  * w12.y;
  r += textureLod(tex, vec2(t12.x, t12.y), 0.0).rgb * w12.x * w12.y;
  r += textureLod(tex, vec2(t3.x,  t12.y), 0.0).rgb * w3.x  * w12.y;
  r += textureLod(tex, vec2(t0.x,  t3.y), 0.0).rgb * w0.x  * w3.y;
  r += textureLod(tex, vec2(t12.x, t3.y), 0.0).rgb * w12.x * w3.y;
  r += textureLod(tex, vec2(t3.x,  t3.y), 0.0).rgb * w3.x  * w3.y;
  return max(r, 0.0);
}

// Trilinear + anisotropic sampling with explicit gradients, blended into the
// bicubic filter when the texture is magnified.
vec3 skySample(sampler2D tex, vec2 size, vec2 uv, vec2 dx, vec2 dy) {
  vec2 px = dx * size;
  vec2 py = dy * size;
  float lod = 0.5 * log2(max(max(dot(px, px), dot(py, py)), 1e-12));
  vec3 c = textureGrad(tex, uv, dx, dy).rgb;
  float w = (1.0 - smoothstep(-0.6, 0.1, lod)) * uSharpen;
  if (w > 0.0) c = mix(c, skyCubic(tex, uv, size), w);
  return c;
}

vec3 skyEquirect(sampler2D tex, vec2 size, mat3 M, vec3 db) {
  vec3 L = M * db;
  float u = atan(L.y, -L.x) * (0.5 / SKY_PI) + 0.5;
  float v = atan(L.z, length(L.xy)) * (1.0 / SKY_PI) + 0.5;
  vec2 uv = vec2(u, v);
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  // The u wrap is a discontinuity; take the smaller gradient of u and
  // fract(u + 0.5) so the seam does not drop to the smallest mip.
  float ua = fract(u + 0.5);
  float dxa = dFdx(ua);
  float dya = dFdy(ua);
  if (abs(dxa) < abs(dx.x)) dx.x = dxa;
  if (abs(dya) < abs(dy.x)) dy.x = dya;
  return skySample(tex, size, uv, dx, dy);
}

// Coverage of a disc of uv radius r centred in a rect layer, anti-aliased over about a texel.
float skyDisc(vec3 fwd, vec3 right, vec3 up, vec2 tanHalf, float r, vec2 size, vec3 db) {
  float z = dot(db, fwd);
  vec2 uv = vec2(dot(db, right), dot(db, up)) / max(z, 1e-3) / (2.0 * tanHalf);
  float d = length(uv);
  float aa = max(0.5 / min(size.x, size.y), fwidth(d));
  return (1.0 - smoothstep(r - aa, r + aa, d)) * step(0.0, z);
}

vec4 skyRect(sampler2D tex, vec2 size, vec3 fwd, vec3 right, vec3 up, vec2 tanHalf, float feather, vec3 db) {
  float z = dot(db, fwd);
  vec2 p = vec2(dot(db, right), dot(db, up)) / max(z, 1e-3);
  vec2 uv = p / (2.0 * tanHalf) + 0.5;
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);
  // feather: product of a smoothstep over the feather width (uv units) at each of the four edges
  float a;
  if (feather > 0.0) {
    a = smoothstep(0.0, feather, uv.x) * smoothstep(0.0, feather, 1.0 - uv.x)
      * smoothstep(0.0, feather, uv.y) * smoothstep(0.0, feather, 1.0 - uv.y);
  } else {
    a = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  }
  a *= step(0.0, z);
  vec3 c = vec3(0.0);
  if (a > 0.0) c = skySample(tex, size, uv, dx, dy);
  return vec4(c, a);
}
`;

const FRAGMENT_TAIL = /* glsl */ `
  col *= exp2(uExposure);
  col = 0.18 * pow(max(col, 0.0) / 0.18, vec3(uContrast));
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(vec3(luma) + (col - vec3(luma)) * uSaturation, 0.0);
  col *= uTint;
  float t = clamp(elev / max(uGlowHeight, 1e-4), 0.0, 1.0);
  col += uGlowColor * uGlowStrength * (1.0 - t) * (1.0 - t);
  // Lighting capture only: below the horizon the world is ground, not sky (the
  // ground occludes it in Blender too), and the kit lights the scene with
  // sky * gain * tint + ambient rather than the full sky.
  if (uEnvMode > 0.5) {
    col = mix(col, uGround, smoothstep(0.0, -0.06, db.z));
    col = col * uEnvGain + uEnvAmbient;
  } else if (uLightView > 0.5) {
    // mirror pass: reflections see the world as lighting does, as in Blender
    col = col * uEnvGain + uEnvAmbient;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const DEFAULT_GRADE = { exposure: 0, contrast: 1, saturation: 1, tint: [1, 1, 1] };
const DEFAULT_GLOW = { color: [0, 0, 0], strength: 0, height_deg: 10 };

function vec3Of(a, fallback) {
  return Array.isArray(a) && a.length >= 3 ? new THREE.Vector3(+a[0], +a[1], +a[2]) : fallback.clone();
}

function buildFragment(layers) {
  let decl = '';
  let body = `void main() {
  vec3 dt = normalize(vDirThree);
  vec3 db = vec3(dt.x, -dt.z, dt.y);
  float elev = asin(clamp(db.z, -1.0, 1.0));
  vec3 col = vec3(0.0);
`;
  layers.forEach((layer, i) => {
    decl += `uniform sampler2D uTex${i};
uniform vec2 uSize${i};
uniform vec3 uGain${i};
uniform float uGamma${i};
`;
    if (layer.type === 'equirect') {
      decl += `uniform mat3 uMat${i};\n`;
      if (layer.fade) decl += `uniform vec2 uFade${i};\n`;
      body += `  {
    vec3 c = pow(skyEquirect(uTex${i}, uSize${i}, uMat${i}, db), vec3(uGamma${i})) * uGain${i};
    ${layer.fade ? `c *= mix(uFade${i}.x, 1.0, smoothstep(0.0, uFade${i}.y, elev));` : ''}
    col = ${layer.add ? 'col + c' : 'c'};
  }
`;
    } else {
      decl += `uniform vec3 uFwd${i};
uniform vec3 uRight${i};
uniform vec3 uUp${i};
uniform vec2 uTanHalf${i};
uniform float uFeather${i};
`;
      const disc = layer.add && layer.disc > 0;
      if (disc) decl += `uniform float uDisc${i};\n`;
      body += `  {
    vec4 r = skyRect(uTex${i}, uSize${i}, uFwd${i}, uRight${i}, uUp${i}, uTanHalf${i}, uFeather${i}, db);
    vec3 c = pow(r.rgb, vec3(uGamma${i})) * uGain${i};
    ${disc ? `col *= 1.0 - skyDisc(uFwd${i}, uRight${i}, uUp${i}, uTanHalf${i}, uDisc${i}, uSize${i}, db);` : ''}
    col = ${layer.add ? 'col + c * r.a' : 'mix(col, c, r.a)'};
  }
`;
    }
  });
  return FRAGMENT_HEAD + decl + body + FRAGMENT_TAIL;
}

// ---------------------------------------------------------------- loading

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load ' + url));
    img.src = url;
  });
}

function fitToMaxSize(img, maxSize) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w <= maxSize && h <= maxSize) return img;
  const s = maxSize / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w * s));
  c.height = Math.max(1, Math.floor(h * s));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Small linear-light copy of an image for the CPU evaluator.
function cpuCopy(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const data = new Float32Array(w * h * 3);
  // Row 0 of the canvas is the top of the image; store bottom-up so v = 0 is row 0.
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const si = (sy * w + x) * 4;
      const di = (y * w + x) * 3;
      data[di] = SRGB_TO_LINEAR[src[si]];
      data[di + 1] = SRGB_TO_LINEAR[src[si + 1]];
      data[di + 2] = SRGB_TO_LINEAR[src[si + 2]];
    }
  }
  return { w, h, data };
}

function bilinear(img, u, v, wrapU, out) {
  const { w, h, data } = img;
  let x = u * w - 0.5;
  let y = Math.min(Math.max(v * h - 0.5, 0), h - 1);
  if (!wrapU) x = Math.min(Math.max(x, 0), w - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const xa = wrapU ? ((x0 % w) + w) % w : x0;
  const xb = wrapU ? (((x0 + 1) % w) + w) % w : Math.min(x0 + 1, w - 1);
  const ya = y0;
  const yb = Math.min(y0 + 1, h - 1);
  for (let k = 0; k < 3; k++) {
    const a = data[(ya * w + xa) * 3 + k];
    const b = data[(ya * w + xb) * 3 + k];
    const c = data[(yb * w + xa) * 3 + k];
    const d = data[(yb * w + xb) * 3 + k];
    out[k] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  return out;
}

function normalizeDef(def) {
  const layers = (Array.isArray(def.layers) ? def.layers : [])
    .filter((l) => l && (l.type === 'equirect' || l.type === 'rect') && typeof l.image === 'string')
    .slice(0, MAX_LAYERS)
    .map((l) => ({
      type: l.type,
      image: l.image,
      matrix: Array.isArray(l.matrix) && l.matrix.length === 9 ? l.matrix.map(Number) : [1, 0, 0, 0, 1, 0, 0, 0, 1],
      gain: vec3Of(l.gain, new THREE.Vector3(1, 1, 1)),
      gamma: Number.isFinite(+l.gamma) && +l.gamma > 0 ? +l.gamma : 1,
      add: l.add !== false,
      forward: vec3Of(l.forward, new THREE.Vector3(0, 1, 0)).normalize(),
      right: vec3Of(l.right, new THREE.Vector3(1, 0, 0)).normalize(),
      up: vec3Of(l.up, new THREE.Vector3(0, 0, 1)).normalize(),
      hfov: +l.hfov_deg || 30,
      vfov: +l.vfov_deg || 30,
      feather: Number.isFinite(+l.feather) ? Math.max(0, +l.feather) : 0.05,
      fade: l.horizon_fade && Number.isFinite(+l.horizon_fade.height_deg)
        ? { floor: Number.isFinite(+l.horizon_fade.floor) ? +l.horizon_fade.floor : 0,
            height: THREE.MathUtils.degToRad(Math.max(1e-3, +l.horizon_fade.height_deg)) }
        : null,
      disc: Number.isFinite(+l.disc) ? Math.min(0.5, Math.max(0, +l.disc)) : 0,
    }));
  const grade = { ...DEFAULT_GRADE, ...(def.grade || {}) };
  const glow = { ...DEFAULT_GLOW, ...(def.horizon_glow || {}) };
  return {
    layers,
    grade: {
      exposure: +grade.exposure || 0,
      contrast: Number.isFinite(+grade.contrast) ? +grade.contrast : 1,
      saturation: Number.isFinite(+grade.saturation) ? +grade.saturation : 1,
      tint: vec3Of(grade.tint, new THREE.Vector3(1, 1, 1)),
    },
    glow: {
      color: vec3Of(glow.color, new THREE.Vector3(0, 0, 0)),
      strength: +glow.strength || 0,
      height: THREE.MathUtils.degToRad(+glow.height_deg || 10),
    },
  };
}

/**
 * Load a sky.json and its images.
 * Returns { material, makeMesh(), evaluate(dirBlender) -> [r,g,b] linear, horizonColor(), dispose() }.
 */
export async function loadSky(skyUrl, renderer, json, worldLight = { gain: [1, 1, 1], ambient: [0, 0, 0] }) {
  const def = normalizeDef(json);
  const caps = renderer.capabilities;
  const maxSize = caps.maxTextureSize || 4096;
  const aniso = Math.min(8, caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1);

  const loaded = await Promise.all(def.layers.map(async (layer) => {
    const url = new URL(layer.image, skyUrl).href;
    const img = await loadImage(url);
    const src = fitToMaxSize(img, maxSize);
    const tex = new THREE.Texture(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = aniso;
    tex.wrapS = layer.type === 'equirect' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = true;
    tex.needsUpdate = true;
    const w = src.naturalWidth || src.width;
    const h = src.naturalHeight || src.height;
    const cpu = layer.type === 'equirect' ? cpuCopy(src, 512, 256) : cpuCopy(src, 128, Math.max(8, Math.round(128 * h / w)));
    return { tex, w, h, cpu };
  }));

  const uniforms = {
    uExposure: { value: def.grade.exposure },
    uContrast: { value: def.grade.contrast },
    uSaturation: { value: def.grade.saturation },
    uTint: { value: def.grade.tint },
    uGlowColor: { value: def.glow.color },
    uGlowStrength: { value: def.glow.strength },
    uGlowHeight: { value: def.glow.height },
    uSharpen: { value: 1.0 },
    uEnvMode: { value: 0.0 },
    uGround: { value: new THREE.Vector3() },
    uEnvGain: { value: new THREE.Vector3(...worldLight.gain) },
    uEnvAmbient: { value: new THREE.Vector3(...worldLight.ambient) },
    uLightView: { value: 0.0 },
  };
  def.layers.forEach((layer, i) => {
    const L = loaded[i];
    uniforms['uTex' + i] = { value: L.tex };
    uniforms['uSize' + i] = { value: new THREE.Vector2(L.w, L.h) };
    uniforms['uGain' + i] = { value: layer.gain };
    uniforms['uGamma' + i] = { value: layer.gamma };
    if (layer.type === 'equirect') {
      const m = layer.matrix;
      // Matrix3.set takes row-major arguments, so M * d in GLSL is the contract's M * d.
      uniforms['uMat' + i] = { value: new THREE.Matrix3().set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]) };
      if (layer.fade) uniforms['uFade' + i] = { value: new THREE.Vector2(layer.fade.floor, layer.fade.height) };
    } else {
      uniforms['uFwd' + i] = { value: layer.forward };
      uniforms['uRight' + i] = { value: layer.right };
      uniforms['uUp' + i] = { value: layer.up };
      uniforms['uTanHalf' + i] = {
        value: new THREE.Vector2(
          Math.tan(THREE.MathUtils.degToRad(layer.hfov) / 2),
          Math.tan(THREE.MathUtils.degToRad(layer.vfov) / 2)),
      };
      uniforms['uFeather' + i] = { value: layer.feather };
      if (layer.disc > 0) uniforms['uDisc' + i] = { value: layer.disc };
    }
  });

  const material = new THREE.ShaderMaterial({
    name: 'POVSky',
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: buildFragment(def.layers),
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));

  // Same shader for the environment capture, with the lower hemisphere dimmed.
  const envMaterial = new THREE.ShaderMaterial({
    name: 'POVSkyEnv',
    uniforms: {
      ...uniforms,
      uEnvMode: { value: 1.0 },
      uSharpen: { value: 0.0 },
    },
    vertexShader: VERTEX,
    fragmentShader: material.fragmentShader,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });

  function makeMesh(forEnv = false) {
    const mesh = new THREE.Mesh(geometry, forEnv ? envMaterial : material);
    mesh.name = 'pov_sky';
    mesh.frustumCulled = false;
    mesh.renderOrder = -100000;
    mesh.userData.isSky = true;
    return mesh;
  }

  // CPU evaluation of the same contract (low resolution), in linear light.
  const tmp = [0, 0, 0];
  const smooth = (e0, e1, x) => {
    const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return k * k * (3 - 2 * k);
  };
  function evaluate(db) {
    const col = [0, 0, 0];
    const elev = Math.asin(Math.max(-1, Math.min(1, db[2])));
    def.layers.forEach((layer, i) => {
      const L = loaded[i];
      let a = 1;
      let fade = 1;
      let hide = 0;
      if (layer.type === 'equirect') {
        const m = layer.matrix;
        const lx = m[0] * db[0] + m[1] * db[1] + m[2] * db[2];
        const ly = m[3] * db[0] + m[4] * db[1] + m[5] * db[2];
        const lz = m[6] * db[0] + m[7] * db[1] + m[8] * db[2];
        const u = Math.atan2(ly, -lx) / (2 * Math.PI) + 0.5;
        const v = Math.atan2(lz, Math.hypot(lx, ly)) / Math.PI + 0.5;
        bilinear(L.cpu, u, v, true, tmp);
        if (layer.fade) fade = layer.fade.floor + (1 - layer.fade.floor) * smooth(0, layer.fade.height, elev);
      } else {
        const f = layer.forward, r = layer.right, up = layer.up;
        const z = f.x * db[0] + f.y * db[1] + f.z * db[2];
        if (z <= 0) return;
        const px = (r.x * db[0] + r.y * db[1] + r.z * db[2]) / z;
        const py = (up.x * db[0] + up.y * db[1] + up.z * db[2]) / z;
        const u = px / (2 * Math.tan(THREE.MathUtils.degToRad(layer.hfov) / 2)) + 0.5;
        const v = py / (2 * Math.tan(THREE.MathUtils.degToRad(layer.vfov) / 2)) + 0.5;
        if (Math.min(u, 1 - u, v, 1 - v) <= 0) return;
        const ss = (x) => {
          if (layer.feather <= 0) return 1;
          const k = Math.min(1, Math.max(0, x / layer.feather));
          return k * k * (3 - 2 * k);
        };
        a = ss(u) * ss(1 - u) * ss(v) * ss(1 - v);
        bilinear(L.cpu, u, v, false, tmp);
        if (layer.add && layer.disc > 0 && Math.hypot(u - 0.5, v - 0.5) < layer.disc) hide = 1;
      }
      const g = layer.gain;
      const c = [Math.pow(tmp[0], layer.gamma) * g.x * fade, Math.pow(tmp[1], layer.gamma) * g.y * fade, Math.pow(tmp[2], layer.gamma) * g.z * fade];
      for (let k = 0; k < 3; k++) col[k] = layer.add ? col[k] * (1 - hide) + c[k] * a : col[k] * (1 - a) + c[k] * a;
    });
    const gr = def.grade;
    const ex = Math.pow(2, gr.exposure);
    for (let k = 0; k < 3; k++) col[k] = 0.18 * Math.pow(Math.max(col[k] * ex, 0) / 0.18, gr.contrast);
    const luma = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2];
    const tint = [gr.tint.x, gr.tint.y, gr.tint.z];
    for (let k = 0; k < 3; k++) col[k] = Math.max(luma + (col[k] - luma) * gr.saturation, 0) * tint[k];
    const t = Math.max(0, Math.min(1, elev / Math.max(def.glow.height, 1e-4)));
    const gw = def.glow.strength * (1 - t) * (1 - t);
    const gc = [def.glow.color.x, def.glow.color.y, def.glow.color.z];
    for (let k = 0; k < 3; k++) col[k] += gc[k] * gw;
    return col;
  }

  // Average sky colour in a band just above the horizon, all around.
  function horizonColor() {
    const acc = [0, 0, 0];
    let n = 0;
    for (const elevDeg of [1, 3, 6]) {
      const e = THREE.MathUtils.degToRad(elevDeg);
      for (let i = 0; i < 48; i++) {
        const az = (i / 48) * Math.PI * 2;
        const c = evaluate([Math.cos(az) * Math.cos(e), Math.sin(az) * Math.cos(e), Math.sin(e)]);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
        n++;
      }
    }
    return acc.map((x) => x / n);
  }

  // Dim ground colour for the lighting capture: a fraction of the horizon sky.
  const h0 = horizonColor();
  envMaterial.uniforms.uGround.value.set(h0[0] * 0.12, h0[1] * 0.12, h0[2] * 0.12);

  function dispose() {
    loaded.forEach((L) => L.tex.dispose());
    material.dispose();
    envMaterial.dispose();
    geometry.dispose();
  }

  // While true, the visible sky shows the world as reflections and lighting see it.
  function setLightView(on) {
    uniforms.uLightView.value = on ? 1.0 : 0.0;
  }

  return { def, material, makeMesh, evaluate, horizonColor, setLightView, dispose };
}

/** Plain dark gradient used when a film has no sky.json. */
export function fallbackSkyJson() {
  return { layers: [], grade: {}, horizon_glow: { color: [0.02, 0.03, 0.07], strength: 1, height_deg: 25 } };
}
