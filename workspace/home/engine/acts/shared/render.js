// The one render call an act makes per target, with the renderer's state put
// back afterwards (target, clear colour and alpha, autoClear), so acts and the
// stage never leak state into each other. engine/post/post.js explains why it
// must be ONE call per target: three discards a multisampled buffer after each
// resolve.

/**
 * @param {any} THREE
 */
export function createRenderInto(THREE) {
  const prevColor = new THREE.Color();
  const clear = new THREE.Color();
  /**
   * Clears `target` to the linear colour `rgb` (alpha 1) and draws `scene`
   * with `camera` into it, in a single renderer.render call.
   * @param {any} renderer THREE.WebGLRenderer
   * @param {any} target THREE.WebGLRenderTarget | null (null draws the canvas: debugging only)
   * @param {any} scene
   * @param {any} camera
   * @param {ArrayLike<number>} rgb linear clear colour
   */
  return function renderInto(renderer, target, scene, camera, rgb) {
    const prevTarget = renderer.getRenderTarget();
    renderer.getClearColor(prevColor);
    const prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.autoClear;
    const prevAutoC = renderer.autoClearColor;
    const prevAutoD = renderer.autoClearDepth;
    const prevAutoS = renderer.autoClearStencil;
    try {
      renderer.setRenderTarget(target || null);
      // linear values straight into a linear target: no colour-space conversion
      clear.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
      renderer.setClearColor(clear, 1);
      renderer.autoClear = true;
      renderer.autoClearColor = true;
      renderer.autoClearDepth = true;
      renderer.autoClearStencil = true;
      renderer.render(scene, camera);
    } finally {
      renderer.autoClear = prevAuto;
      renderer.autoClearColor = prevAutoC;
      renderer.autoClearDepth = prevAutoD;
      renderer.autoClearStencil = prevAutoS;
      renderer.setClearColor(prevColor, prevAlpha);
      renderer.setRenderTarget(prevTarget);
    }
  };
}

/**
 * Pixel ratio of whatever is being drawn: device px per CSS px. Inside a
 * render target that is the target's viewport width over the canvas's CSS
 * width (a half-size target draws thinner points); on the canvas it is the
 * renderer's pixel ratio.
 * @param {any} renderer
 * @param {any} v4 scratch THREE.Vector4
 * @param {any} v2 scratch THREE.Vector2
 */
export function drawPixelRatio(renderer, v4, v2) {
  const dpr = renderer.getPixelRatio() || 1;
  if (!renderer.getRenderTarget()) return dpr;
  renderer.getCurrentViewport(v4);
  renderer.getSize(v2);
  return v2.x >= 1 && v4.z >= 1 ? v4.z / v2.x : dpr;
}

/**
 * Blending that leaves the target's alpha alone (it stays 1): the shader writes
 * premultiplied colour; 'add' adds it, 'over' lays it over what is there.
 * @param {any} THREE
 * @param {any} material
 * @param {'add' | 'over'} mode
 */
export function premultipliedBlend(THREE, material, mode) {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = mode === 'add' ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  material.blendEquationAlpha = THREE.AddEquation;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  return material;
}
