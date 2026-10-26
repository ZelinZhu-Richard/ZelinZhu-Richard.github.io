import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
let manifest;

export async function prepareAssets(onProgress) {
  const response = await fetch('./assets.json');
  if (!response.ok) throw new Error(`assets.json: HTTP ${response.status}`);
  manifest = await response.json();
  const names = Object.keys(manifest);
  let completed = 0;
  const assets = new Map();
  await Promise.all(names.map(async name => {
    assets.set(name, await loadAsset(name));
    onProgress(++completed / names.length);
  }));
  onProgress(1);
  return assets;
}

export async function loadAsset(name) {
  const entry = manifest?.[name];
  if (!entry || !Number.isFinite(entry.scale) || entry.scale <= 0 ||
      !Array.isArray(entry.anchor) || entry.anchor.length !== 3 || !entry.anchor.every(Number.isFinite) ||
      typeof entry.path !== 'string' || !entry.path.startsWith('assets/') || entry.path.includes('..')) {
    throw new Error(`Invalid asset manifest entry: ${name}`);
  }
  const { scene } = await loader.loadAsync(entry.path);
  scene.position.set(...entry.anchor.map(value => -value * entry.scale));
  scene.scale.setScalar(entry.scale);
  const root = new Group();
  root.name = name;
  root.add(scene);
  return root;
}
