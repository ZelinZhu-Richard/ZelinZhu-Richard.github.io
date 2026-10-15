let model;
self.onmessage=async({data})=>{const {id,type,image,time}=data;try{
  if(type==='init'){const api=await import('./vision.js');model=await api.createModel(true);self.postMessage({id,result:true});}
  else if(type==='track'){const r=model.detectForVideo(image,time);self.postMessage({id,result:{landmarks:r.landmarks}});}
}catch(e){self.postMessage({id,error:e.message||'Pose tracking failed.'});}finally{image?.close();}};
