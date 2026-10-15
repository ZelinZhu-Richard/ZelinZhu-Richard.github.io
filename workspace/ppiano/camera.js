export class CameraSession {
  constructor(video,devices=navigator.mediaDevices){this.video=video;this.devices=devices;this.generation=0;this.stream=null;}
  async start({deviceId='',facingMode='user'}={}){
    this.stop();const generation=this.generation;
    if(!this.devices?.getUserMedia)throw new Error('Camera access needs HTTPS and a supported browser. You can still play the on-screen keys.');
    const stream=await this.devices.getUserMedia({audio:false,video:{width:{ideal:1280},height:{ideal:720},...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:facingMode}})}});
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());throw new Error('Camera start cancelled.');}
    this.stream=stream;this.video.srcObject=stream;
    await this.video.play();
    return stream;
  }
  stop(){this.generation++;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.srcObject=null;}
}
export class VisionClient {
  constructor(){this.pending=new Map();this.next=1;this.generation=0;}
  async start(){
    const generation=++this.generation;
    try{
      if(typeof Worker==='undefined'||typeof createImageBitmap==='undefined')throw new Error('Worker unavailable');
      this.worker=new Worker('/ppiano/vision-worker.js');
      this.worker.onmessage=({data})=>{const task=this.pending.get(data.id);if(!task)return;clearTimeout(task.timer);this.pending.delete(data.id);data.error?task.reject(new Error(data.error)):task.resolve(data.result);};
      this.worker.onerror=()=>this.rejectPending(new Error('Vision worker stopped. Stop and restart the camera to retry.'));
      await this.request('init');
      return 'worker';
    }catch(error){
      if(generation!==this.generation)throw error;
      this.worker?.terminate();this.worker=null;this.rejectPending(error);
      const api=await import('./vision.js');const model=await api.createModel();
      if(generation!==this.generation){model.close();throw new Error('Vision start cancelled.');}
      this.model=model;return 'compatibility';
    }
  }
  request(type,extra={},transfer=[]){
    return new Promise((resolve,reject)=>{const id=this.next++,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Vision processing timed out. Stop and restart to retry.'));},45000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,type,...extra},transfer);});
  }
  async track(video,time){
    if(this.worker){const worker=this.worker,image=await createImageBitmap(video,{resizeWidth:640,resizeHeight:Math.round(640*video.videoHeight/video.videoWidth)});if(worker!==this.worker){image.close();throw new Error('Vision stopped.');}return this.request('track',{image,time},[image]);}
    return this.model.detectForVideo(video,time);
  }
  async scan(image){if(this.worker)return this.request('scan',{image});const [api,detector]=await Promise.all([import('./vision.js'),import('./detection.js')]);return detector.detectKeyboard(await api.loadOpenCV(),image);}
  rejectPending(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
  stop(){this.generation++;this.worker?.terminate();this.worker=null;this.model?.close();this.model=null;this.rejectPending(new Error('Vision stopped.'));}
}
