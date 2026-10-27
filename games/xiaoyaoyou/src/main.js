import * as THREE from 'three';
import { prepareAssets } from './assets.js';
import { prepareKun } from './kun.js';
import { createNorth } from './north.js';

const STEP_SECONDS = 1 / 60;
const CHECKPOINTS = new Map([['title', 'title'], ['north-start', 'north'], ['kun-test', 'test']]);

export async function createRuntime(text, onProgress) {
  const title = document.querySelector('#title-screen');
  const begin = document.querySelector('#begin');
  const state = window.__GAME_STATE__;
  const stats = window.__GAME_STATS__;
  const params = new URLSearchParams(location.search);
  const config = {
    seed: Number(params.get('seed') ?? 1) >>> 0,
    view: ['side', 'top', 'front', 'gameplay', 'rear', 'three-quarter'].includes(params.get('view')) ? params.get('view') : null,
    phase: params.has('phase') ? ((Number(params.get('phase')) || 0) % 1 + 1) % 1 : null,
  };
  // The seed and frozen pose are carried forward for the later hero test scenes.
  let rngState = config.seed;
  const random = () => { rngState = (Math.imul(1664525, rngState) + 1013904223) >>> 0; return rngState / 4294967296; };
  let renderer;
  let animation = 0;
  let disposed = false;
  let resolveFirst;
  const first = new Promise(resolve => { resolveFirst = resolve; });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#172A35');
  scene.fog = new THREE.FogExp2('#172A35', 0.018);
  let kun, north;
  let camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  camera.position.set(0, 3, 12);
  camera.lookAt(0, 0, 0);
  let framesSinceJump = 0;
  let steps = 0;
  let accumulator = 0;
  let previousTime;
  let timescale = 1;
  let autoplayOn = false;

  function setTimescale(value) {
    if (!Number.isFinite(value) || value < 1 || value > 240 || !Number.isInteger(value)) {
      throw new RangeError('Timescale must be an integer from 1 to 240');
    }
    timescale = value;
  }
  function jump(id) {
    if (!CHECKPOINTS.has(id)) throw new Error(`Checkpoint not available: ${id}`);
    steps = 0;
    accumulator = 0;
    previousTime = undefined;
    framesSinceJump = 0;
    rngState = config.seed;
    Object.assign(state, { beat: CHECKPOINTS.get(id), motes: 0, kunScale: 1, gameMs: 0, settled: false });
    title.hidden = state.beat !== 'title';
    begin.disabled = false;
    kun.root.visible = state.beat === 'test';
    const sheet = ['side','top','front'].includes(config.view);
    north.group.visible = state.beat === 'test' && !sheet;
    scene.background = state.beat === 'test' ? (sheet ? new THREE.Color('rgb(155,156,158)') : north.background) : new THREE.Color('#172A35');
    scene.fog.density = sheet && state.beat === 'test' ? 0 : .018;
    resize();
  }
  const start = () => jump('north-start');
  const autoplay = on => { autoplayOn = Boolean(on); if (autoplayOn && state.beat === 'title') start(); };
  function simulate() {
    // Journey progression is M3; the test swim already uses this fixed clock.
    if (state.beat !== 'title') state.gameMs = ++steps * 1000 / 60;
  }
  function render(time) {
    if (disposed) return;
    if (previousTime !== undefined) accumulator += Math.min((time - previousTime) / 1000, 0.25);
    previousTime = time;
    while (accumulator >= STEP_SECONDS) {
      for (let i = 0; i < timescale; i++) simulate();
      accumulator -= STEP_SECONDS;
    }
    kun.update(state.gameMs,config.phase,state.beat !== 'test' || (['side','top','front'].includes(config.view) && config.phase === null));
    renderer.info.reset();
    renderer.render(scene, camera);
    Object.assign(stats, {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      pixelRatio: renderer.getPixelRatio(), frame: stats.frame + 1,
    });
    if (++framesSinceJump >= 30) state.settled = true;
    resolveFirst();
    animation = requestAnimationFrame(render);
  }
  function frameKun() {
    const aspect=innerWidth/innerHeight;
    const sheet=['side','top','front'].includes(config.view);
    const box=sheet && config.phase===null?kun.restBox:kun.bounds;
    const center=box.getCenter(new THREE.Vector3());
    const directions={side:[-1,0,0],top:[0,1,0],front:[0,0,1],
      'three-quarter':[-.6409,.4226,.6409],gameplay:[-.6124,.5,-.6124],rear:[0,.5,-.8660]};
    const direction=new THREE.Vector3(...(directions[config.view]??[-.819,-.12,.561])).normalize();
    camera=sheet?new THREE.OrthographicCamera(-1,1,1,-1,.1,2000):new THREE.PerspectiveCamera(42,aspect,.1,2000);
    camera.up.set(0,config.view==='top'?0:1,config.view==='top'?1:0);
    camera.position.copy(center).addScaledVector(direction,30);camera.lookAt(center);camera.updateMatrixWorld();
    const inverse=camera.matrixWorldInverse;
    const corners=[];
    for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) corners.push(new THREE.Vector3(x,y,z));
    const projected=new THREE.Box3().setFromPoints(corners.map(p=>p.clone().applyMatrix4(inverse)));
    const size=projected.getSize(new THREE.Vector3());
    if(sheet) {
      // Square Blender fit retained vertically, expanded for wide browser panes.
      const extent=Math.max(size.x,size.y)*1.08;
      const height=Math.max(extent,size.x*1.08/aspect);
      camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;
    } else {
      const fill=aspect<.8?.84:.60;
      const tan=Math.tan(THREE.MathUtils.degToRad(42/2));
      let distance=0;
      for(const point of corners) {
        const v=point.clone().sub(center).applyQuaternion(camera.quaternion.clone().invert());
        distance=Math.max(distance,Math.abs(v.x)/(tan*aspect*fill)+v.z,Math.abs(v.y)/(tan*.72)+v.z);
      }
      camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);
    }
    camera.updateProjectionMatrix();camera.updateMatrixWorld();
    north.compose(camera,center);
  }
  function resize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight);
    if(kun && state.beat==='test') frameKun();
    else { camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,2000);camera.position.set(0,3,12);camera.lookAt(0,0,0); }
  }
  function measure() {
    const result={cameraAltitude:camera.position.y};
    if(state.beat==='test') {
      const box=['side','top','front'].includes(config.view) && config.phase===null?kun.restBox:kun.bounds, points=[];
      for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) points.push(new THREE.Vector3(x,y,z).project(camera));
      const b=new THREE.Box3().setFromPoints(points);
      result.kun={widthPx:(b.max.x-b.min.x)*innerWidth/2,heightPx:(b.max.y-b.min.y)*innerHeight/2,
        inFrame:b.min.x>=-1&&b.max.x<=1&&b.min.y>=-1&&b.max.y<=1&&b.min.z>=-1&&b.max.z<=1};
    }
    return result;
  }
  function onKey(event) {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === 't') state.translationOn = !state.translationOn;
    if (event.key.toLowerCase() === 'm') state.muted = !state.muted;
  }
  function dispose() {
    disposed = true;
    cancelAnimationFrame(animation);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    begin.removeEventListener('click', start);
    kun?.dispose();
    north?.dispose();
    renderer?.dispose();
  }

  try {
    const zh = text.lines.map(line => line.zh).join('');
    const en = text.lines.map(line => line.en).join('');
    await Promise.all([
      document.fonts.load('32px "LXGW WenKai"', zh),
      document.fonts.load('24px "EB Garamond"', en),
    ]);
    onProgress(0.5);
    const assets=await prepareAssets(value => onProgress(0.5 + value / 2));
    kun=prepareKun(assets.get('kun'));
    north=createNorth();
    scene.add(kun.root,north.group);
    // Lighting remains available in the grey reference views as well.
    scene.add(new THREE.HemisphereLight('#D4D6CA','#283B48',1.25));
    const referenceLight=new THREE.DirectionalLight('#FFF1D5',1.5);
    referenceLight.position.set(-5,12,6);scene.add(referenceLight);
    renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#world'), antialias: true });
    renderer.info.autoReset = false;
    resize();
    jump('title');
    window.__GAME_DEBUG__ = {
      start, jump, autoplay, setTimescale,
      measure,
      // Read-only inspection, beyond the required hooks, for reproducible captures.
      inspect: () => ({ threeVersion: THREE.REVISION, config, timescale, autoplay: autoplayOn,
        fog: { color: scene.fog.color.getHexString(), density: scene.fog.density },
        objectCount: scene.children.length, randomSample: random(),
        swim:kun.inspect(),atmosphere:{shafts:north.shafts,motes:north.motes},
        camera:{type:camera.type,position:camera.position.toArray(),up:camera.up.toArray()} }),
    };
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    begin.addEventListener('click', start);
    animation = requestAnimationFrame(render);
    return {
      firstFrame: () => first,
      dispose,
      applyURL() {
        const checkpoint = params.get('checkpoint');
        if (checkpoint) jump(checkpoint);
        if (params.has('timescale')) setTimescale(Number(params.get('timescale')));
        if (params.get('autoplay') === '1') autoplay(true);
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
