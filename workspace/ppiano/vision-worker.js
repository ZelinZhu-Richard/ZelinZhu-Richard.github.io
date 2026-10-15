let model,api,detector;
self.onmessage=async({data})=>{
  const {id,type,image,time}=data;
  try{
    api ||= await import('./vision.js');
    if(type==='init'){model=await api.createModel(true);self.postMessage({id,result:true});}
    else if(type==='track')self.postMessage({id,result:model.detectForVideo(image,time)});
    else if(type==='scan'){detector ||= await import('./detection.js');self.postMessage({id,result:detector.detectKeyboard(await api.loadOpenCV(),image)});}
  }catch(error){self.postMessage({id,error:error.message||'Vision processing failed.'});}
  finally{if(type==='track')image?.close?.();}
};
