// Dust in the air over the desk (STORYBOARD §9-10: the "stars" of the false-space beat
// are the window and dust in lamplight). One Points draw call; positions, sizes and
// drift phases are seeded (rngFor), the drift is a few cm of slow wander driven by the
// act's time (none under reduced motion). See shaders.js DUST_*.

import * as THREE from 'three';
import { DUST_VERT, DUST_FRAG } from './shaders.js';
import { DUST_MAX, LAYERS } from './classify.js';

/** The air the motes fill: over the desk round the lamp and the instrument, in front of the window (room metres). */
export const DUST_BOX = Object.freeze({ min: Object.freeze([-2.4, 0.8, -6.95]), max: Object.freeze([-0.3, 2.1, -5.3]) });

/**
 * @param {{ rng: () => number, count?: number }} o
 */
export function createDust({ rng, count = DUST_MAX }) {
  const n = DUST_MAX;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const phase = new Float32Array(n * 3);
  const { min, max } = DUST_BOX;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) pos[3 * i + k] = min[k] + (max[k] - min[k]) * rng();
    seed[i] = rng();
    for (let k = 0; k < 3; k++) phase[3 * i + k] = rng() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 3));
  geometry.setDrawRange(0, Math.min(n, count));
  const uniforms = {
    uTime: { value: 0 },
    uDpr: { value: 1 },
    uAmp: { value: 0.045 },
    uRoom: { value: 0 },
    uLampPos: { value: new THREE.Vector3() },
    uLamp: { value: new THREE.Vector4(0, 0, 0, 0.5) },
    uStar: { value: new THREE.Vector3(0.2, 0.22, 0.3) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'room-dust',
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'room:dust';
  points.frustumCulled = false;
  points.matrixAutoUpdate = false;
  points.renderOrder = 3;
  points.layers.set(LAYERS.DUST);
  points.updateMatrixWorld(true);
  return {
    object3D: points,
    uniforms,
    /** @param {number} c motes drawn (the tier's count) */
    setCount(c) {
      geometry.setDrawRange(0, Math.max(0, Math.min(n, Math.round(c))));
    },
    /**
     * @param {{ time: number, dpr: number, amp: number, room: number, lampPos: THREE.Vector3,
     *   lamp: number[], lampGain: number, reach: number, star: number[] }} o
     *   lamp: the filament's colour x level (linear)
     */
    update({ time, dpr, amp, room, lampPos, lamp, lampGain, reach, star }) {
      uniforms.uTime.value = time;
      uniforms.uDpr.value = dpr;
      uniforms.uAmp.value = amp;
      uniforms.uRoom.value = room;
      uniforms.uLampPos.value.copy(lampPos);
      uniforms.uLamp.value.set(lamp[0] * lampGain, lamp[1] * lampGain, lamp[2] * lampGain, reach);
      uniforms.uStar.value.set(star[0], star[1], star[2]);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      points.removeFromParent();
    },
  };
}
