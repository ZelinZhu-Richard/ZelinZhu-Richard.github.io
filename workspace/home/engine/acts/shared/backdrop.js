// A dark backdrop shaded by world view direction, like the sky (one
// full-screen triangle, drawn first, no depth): a vertical gradient, a soft
// haze toward the key light and another toward the rim light (light scattered
// in the air the fog is made of), a faint large-scale breath so the dark is
// never a flat fill, and a darker quiet zone where the text sits. Linear HDR.

export const BACKDROP_VERT = /* glsl */ `
varying vec3 vDir;
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  // view-space ray through this NDC point (exact for any perspective
  // projection), turned into world space by the transposed view rotation
  vec3 rayV = vec3(
    (position.x + projectionMatrix[2][0]) / projectionMatrix[0][0],
    (position.y + projectionMatrix[2][1]) / projectionMatrix[1][1],
    -1.0);
  vDir = rayV * mat3(viewMatrix);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const BACKDROP_FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uHorizon;
uniform vec3 uKeyGlow;
uniform vec3 uRimGlow;
uniform vec3 uKeyDir;
uniform vec3 uRimDir;
uniform float uExposure;
uniform vec4 uQuiet;
uniform float uQuietK;
varying vec3 vDir;
varying vec2 vNdc;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(uHorizon, uBase, smoothstep(0.0, 0.75, abs(d.y + 0.08)));
  float k = max(dot(d, uKeyDir), 0.0);
  col += uKeyGlow * (0.55 * pow(k, 5.0) + 0.9 * pow(k, 36.0));
  float r = max(dot(d, uRimDir), 0.0);
  col += uRimGlow * pow(r, 4.0);
  col *= 0.92 + 0.16 * vnoise(d * 2.7 + vec3(3.1, 1.7, 0.4));
  vec2 dq = max(uQuiet.xy - vNdc, vNdc - uQuiet.zw);
  float q = 1.0 - smoothstep(0.0, 0.22, max(dq.x, dq.y));
  col *= 1.0 - 0.45 * uQuietK * q;
  gl_FragColor = vec4(col * uExposure, 1.0);
}
`;

/**
 * @param {any} THREE
 */
export function createBackdrop(THREE) {
  const v3 = () => new THREE.Vector3();
  const uniforms = {
    uBase: { value: v3() },
    uHorizon: { value: v3() },
    uKeyGlow: { value: v3() },
    uRimGlow: { value: v3() },
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uRimDir: { value: new THREE.Vector3(0, 1, 0) },
    uExposure: { value: 1 },
    uQuiet: { value: new THREE.Vector4(-2, -2, -2, -2) },
    uQuietK: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'act-backdrop',
    uniforms,
    vertexShader: BACKDROP_VERT,
    fragmentShader: BACKDROP_FRAG,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'act-backdrop';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = -1e6;
  return {
    object3D: mesh,
    uniforms,
    /** @param {ArrayLike<number> | null} rect NDC [x0, y0, x1, y1] @param {number} k */
    setQuiet(rect, k) {
      if (!rect || !(k > 0)) {
        uniforms.uQuietK.value = 0;
        return;
      }
      uniforms.uQuiet.value.set(Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3]));
      uniforms.uQuietK.value = k;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
