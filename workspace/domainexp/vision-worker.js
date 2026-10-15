let model;
self.onmessage = async ({data: {id, type, image, time}}) => {
  try {
    if (type === 'init') { const {createModel} = await import('./vision.js'); model = await createModel(true); self.postMessage({id, result: true}); }
    else if (type === 'track') self.postMessage({id, result: model.detectForVideo(image, time)});
  } catch (error) { self.postMessage({id, error: error.message || 'Hand tracking could not start. Try again.'}); }
  finally { image?.close(); }
};
