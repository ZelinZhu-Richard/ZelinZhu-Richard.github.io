import { FilesetResolver, HandLandmarker } from './vendor/mediapipe/vision_bundle.mjs';
export async function createModel(cpu=false){
  const files=await FilesetResolver.forVisionTasks('/ppiano/vendor/mediapipe/wasm');
  const options={baseOptions:{modelAssetPath:'/ppiano/vendor/hand_landmarker.task',delegate:cpu?'CPU':'GPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6};
  try{return await HandLandmarker.createFromOptions(files,options);}catch(error){if(cpu)throw error;options.baseOptions.delegate='CPU';return HandLandmarker.createFromOptions(files,options);}
}
export async function loadOpenCV(){
  if(globalThis.cv?.Mat)return globalThis.cv;
  if(typeof importScripts==='function')importScripts('/ppiano/vendor/opencv.js');
  else if(!globalThis.cv)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/ppiano/vendor/opencv.js';s.onload=resolve;s.onerror=()=>{s.remove();reject(new Error('Keyboard recognition could not load. Check your connection and retry.'));};document.head.append(s);});
  const cv=globalThis.cv;
  if(!cv?.Mat)await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(new Error('Keyboard recognition took too long to start.')),30000);const old=cv.onRuntimeInitialized;cv.onRuntimeInitialized=()=>{old?.();clearTimeout(deadline);resolve();};});
  // This OpenCV build has a legacy then() returning itself. Awaiting it loops
  // forever through Promise assimilation; initialization is signalled above.
  delete cv.then;
  return cv;
}
