// Depth of field for the gears act (a macro lens: a thin slab of the train in
// focus, the near teeth and the far wheels melting into discs).
//
// The act draws its scene ONCE into `scene` (this module's own target: linear
// half-float colour, a depth texture, the same size and MSAA as the act's
// target), then three full-screen passes:
//
//   down    scene -> half A   colour at half resolution, the signed circle of
//                             confusion in alpha (-1 near .. +1 far, in units
//                             of the largest blur radius)
//   gather  half A -> half B  one spiral of taps over the largest disc; a tap
//                             counts where its own blur reaches the centre
//                             (so highlights open into discs, sharp things do
//                             not bleed, and the near field spreads over what
//                             is behind it); alpha is the blur that arrived
//   soften  half B -> half A  a 3 x 3 tent, so the grain at a disc's rim reads as a soft rim
//   join    scene + half A -> the act's target (the ONE render call it gets):
//           sharp where the blur is under a pixel, the gathered colour beyond
//
// Everything is linear HDR, so a glint ten times white opens into a disc that
// is still bright. Cost per frame: the scene's own draw, 8 + TAPS + 4 fetches on
// a quarter of the pixels, 4 fetches on all of them.

export const DOF_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COC = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uNearFar;
uniform float uFocus;
uniform float uAperture;
uniform vec2 uRange;
// signed blur radius over the largest one: negative in front of the focus
// plane. uRange.x is the depth of the sharp slab either side of the focus
// plane (as a fraction of the focus distance), uRange.y caps the near field.
float cocAt(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  float zn = d * 2.0 - 1.0;
  float z = 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - zn * (uNearFar.y - uNearFar.x));
  float c = uAperture * (1.0 - uFocus / max(z, 1e-5));
  float s = sign(c);
  c = max(abs(c) - uRange.x * uAperture, 0.0);
  return s < 0.0 ? -min(c, uRange.y) : min(c, 1.0);
}
`;

export const DOF_DOWN_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uTexel;
${COC}
varying vec2 vUv;
void main() {
  // the 2 x 2 block under this texel, each sample weighed down as it gets
  // brighter so one hot pixel does not flicker as it moves across the block
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  float coc = 0.0;
  float cmax = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i - (i / 2) * 2) - 0.5, float(i / 2) - 0.5) * uTexel;
    vec3 c = texture2D(tScene, vUv + o).rgb;
    float w = 1.0 / (1.0 + 0.25 * max(c.r, max(c.g, c.b)));
    sum += c * w;
    wsum += w;
    float k = cocAt(vUv + o);
    if (abs(k) >= cmax) {
      cmax = abs(k);
      coc = k;
    }
  }
  gl_FragColor = vec4(sum / wsum, coc);
}
`;

export const DOF_GATHER_FRAG = /* glsl */ `
uniform sampler2D tHalf;
uniform vec2 uStep; // the largest blur radius, in uv
uniform float uRadiusPx; // and in half-resolution pixels
varying vec2 vUv;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec4 c0 = texture2D(tHalf, vUv);
  float centre = abs(c0.a);
  vec3 col = c0.rgb;
  float blur = centre;
  float tot = 1.0;
  // a turn of the spiral per pixel, so undersampling shows as grain, not rings
  float a = hash12(gl_FragCoord.xy) * 6.2831853 * JITTER;
  const float GOLDEN = 2.39996323;
  for (int i = 0; i < TAPS; i++) {
    // denser toward the centre than an even disc (exponent 0.7, not 0.5): small blurs keep a few taps
    float r = pow((float(i) + 0.5) / float(TAPS), 0.7);
    vec2 o = vec2(cos(a), sin(a)) * r;
    a += GOLDEN;
    vec4 s = texture2D(tHalf, vUv + o * uStep);
    float size = abs(s.a);
    // something behind the centre cannot spread over it further than the centre's own blur allows
    if (s.a > c0.a) size = min(size, centre * 2.0);
    float m = smoothstep(r * uRadiusPx - 0.5, r * uRadiusPx + 0.5, size * uRadiusPx);
    col += mix(col / tot, s.rgb, m);
    blur += mix(blur / tot, size, m);
    tot += 1.0;
  }
  gl_FragColor = vec4(col / tot, blur / tot);
}
`;

// A small tent over the gathered buffer: what undersampling left as grain at
// the rim of a disc becomes a soft rim.
export const DOF_SOFT_FRAG = /* glsl */ `
uniform sampler2D tHalf;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tHalf, vUv + vec2(0.75, 0.75) * uTexel) + texture2D(tHalf, vUv + vec2(-0.75, 0.75) * uTexel)
         + texture2D(tHalf, vUv + vec2(0.75, -0.75) * uTexel) + texture2D(tHalf, vUv + vec2(-0.75, -0.75) * uTexel);
  gl_FragColor = c * 0.25;
}
`;

export const DOF_JOIN_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBlur;
uniform float uRadiusFull; // the largest blur radius in this target's pixels
uniform float uOn;
${COC}
varying vec2 vUv;
void main() {
  vec3 sharp = texture2D(tScene, vUv).rgb;
  vec4 b = texture2D(tBlur, vUv);
  float own = abs(cocAt(vUv));
  float px = max(own, b.a) * uRadiusFull;
  float k = smoothstep(1.2, 4.0, px) * uOn;
  gl_FragColor = vec4(mix(sharp, b.rgb, k), 1.0);
}
`;

/** Gather taps per tier (0 draws no depth of field at all). */
export const DOF_TAPS = Object.freeze([0, 14, 32, 56]);
/** Largest blur radius per tier, as a fraction of the frame height. */
export const DOF_RADIUS = Object.freeze([0, 0.016, 0.024, 0.03]);

/**
 * @param {any} THREE
 */
export function createDof(THREE) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(geometry);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCam = new THREE.Camera();

  /** @type {any} */
  let scene = null;
  /** @type {any} */
  let halfA = null;
  /** @type {any} */
  let halfB = null;
  let sig = '';

  const coc = {
    tDepth: { value: null },
    uNearFar: { value: new THREE.Vector2(0.01, 10) },
    uFocus: { value: 1 },
    uAperture: { value: 1 },
    uRange: { value: new THREE.Vector2(0.02, 1) },
  };
  const downU = { ...coc, tScene: { value: null }, uTexel: { value: new THREE.Vector2() } };
  const gatherU = { tHalf: { value: null }, uStep: { value: new THREE.Vector2() }, uRadiusPx: { value: 8 } };
  const joinU = { ...coc, tScene: { value: null }, tBlur: { value: null }, uRadiusFull: { value: 16 }, uOn: { value: 1 } };
  const mat = (/** @type {string} */ name, /** @type {string} */ frag, /** @type {any} */ uniforms, /** @type {any} */ defines = {}) =>
    new THREE.ShaderMaterial({ name, vertexShader: DOF_VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
  const downMat = mat('gears:dof-down', DOF_DOWN_FRAG, downU);
  /** @type {Map<number, any>} */
  const gatherMats = new Map();
  const softU = { tHalf: { value: null }, uTexel: { value: new THREE.Vector2() } };
  const softMat = mat('gears:dof-soft', DOF_SOFT_FRAG, softU);
  const joinMat = mat('gears:dof-join', DOF_JOIN_FRAG, joinU);

  function gatherMat(/** @type {number} */ taps) {
    let m = gatherMats.get(taps);
    if (!m) {
      m = mat('gears:dof-gather', DOF_GATHER_FRAG, gatherU, { TAPS: taps, JITTER: taps >= 30 ? '0.12' : '1.0' });
      gatherMats.set(taps, m);
    }
    return m;
  }

  function free() {
    for (const rt of [scene, halfA, halfB]) {
      if (!rt) continue;
      if (rt.depthTexture) rt.depthTexture.dispose();
      rt.dispose();
    }
    scene = halfA = halfB = null;
    sig = '';
  }

  /**
   * Targets matching the act's target (size, samples). Returns the one the scene is drawn into.
   * @param {any} target
   */
  function ensure(target) {
    const w = Math.max(1, target.width | 0);
    const h = Math.max(1, target.height | 0);
    const samples = target.samples | 0;
    const s = `${w}x${h}x${samples}`;
    if (s === sig && scene) return scene;
    free();
    sig = s;
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    depth.format = THREE.DepthFormat;
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    scene = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      generateMipmaps: false, depthBuffer: true, stencilBuffer: false, samples, depthTexture: depth,
    });
    scene.texture.name = 'gears:dof-scene';
    const hw = Math.max(1, Math.ceil(w / 2));
    const hh = Math.max(1, Math.ceil(h / 2));
    const half = (/** @type {string} */ name) => {
      const rt = new THREE.WebGLRenderTarget(hw, hh, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        generateMipmaps: false, depthBuffer: false, stencilBuffer: false,
      });
      rt.texture.name = name;
      return rt;
    };
    halfA = half('gears:dof-half');
    halfB = half('gears:dof-blur');
    return scene;
  }

  const prevColor = new THREE.Color();

  /**
   * The three passes; the last is the single render call into `target`.
   * @param {any} renderer
   * @param {any} target the act's target
   * @param {any} camera the camera the scene was drawn with
   * @param {{ focus: number, aperture: number, slab?: number, near?: number, tier: number, on?: number }} o
   *   focus: distance of the sharp plane; aperture: blur radius at infinity over the largest radius
   *   (1 = the far field reaches the largest disc); slab: sharp depth either side, as a fraction;
   *   near: cap on the near field's blur (0..1)
   */
  function apply(renderer, target, camera, o) {
    if (!scene) return;
    const tier = Math.max(1, Math.min(3, o.tier | 0));
    const h = scene.height;
    const radiusFull = DOF_RADIUS[tier] * h;
    coc.tDepth.value = scene.depthTexture;
    coc.uNearFar.value.set(camera.near, camera.far);
    coc.uFocus.value = o.focus;
    coc.uAperture.value = o.aperture;
    coc.uRange.value.set(o.slab ?? 0.02, o.near ?? 1);
    downU.tScene.value = scene.texture;
    downU.uTexel.value.set(1 / scene.width, 1 / scene.height);
    gatherU.tHalf.value = halfA.texture;
    gatherU.uRadiusPx.value = radiusFull * 0.5;
    gatherU.uStep.value.set((radiusFull * 0.5) / halfA.width, (radiusFull * 0.5) / halfA.height);
    joinU.tScene.value = scene.texture;
    softU.tHalf.value = halfB.texture;
    softU.uTexel.value.set(1 / halfB.width, 1 / halfB.height);
    joinU.tBlur.value = halfA.texture;
    joinU.uRadiusFull.value = radiusFull;
    joinU.uOn.value = o.on ?? 1;

    const prevTarget = renderer.getRenderTarget();
    renderer.getClearColor(prevColor);
    const prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.autoClear;
    try {
      renderer.autoClear = false;
      quad.material = downMat;
      renderer.setRenderTarget(halfA);
      renderer.render(quadScene, quadCam);
      quad.material = gatherMat(DOF_TAPS[tier]);
      renderer.setRenderTarget(halfB);
      renderer.render(quadScene, quadCam);
      // (half A has been read; it takes the softened result)
      quad.material = softMat;
      renderer.setRenderTarget(halfA);
      renderer.render(quadScene, quadCam);
      quad.material = joinMat;
      renderer.setRenderTarget(target || null);
      renderer.render(quadScene, quadCam);
    } finally {
      renderer.autoClear = prevAuto;
      renderer.setClearColor(prevColor, prevAlpha);
      renderer.setRenderTarget(prevTarget);
    }
  }

  return {
    ensure,
    apply,
    free,
    dispose() {
      free();
      geometry.dispose();
      downMat.dispose();
      softMat.dispose();
      joinMat.dispose();
      for (const m of gatherMats.values()) m.dispose();
      gatherMats.clear();
    },
  };
}
