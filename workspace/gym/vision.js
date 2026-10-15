import {FilesetResolver,PoseLandmarker} from './vendor/mediapipe/vision_bundle.mjs';
export async function createModel(cpu=false){
  const files=await FilesetResolver.forVisionTasks('/gym/vendor/mediapipe/wasm');
  const options={baseOptions:{modelAssetPath:'/gym/vendor/pose_landmarker_lite.task',delegate:cpu?'CPU':'GPU'},runningMode:'VIDEO',numPoses:2,minPoseDetectionConfidence:.65,minPosePresenceConfidence:.65,minTrackingConfidence:.65,outputSegmentationMasks:false};
  try{return await PoseLandmarker.createFromOptions(files,options);}catch(e){if(cpu)throw e;options.baseOptions.delegate='CPU';return PoseLandmarker.createFromOptions(files,options);}
}
