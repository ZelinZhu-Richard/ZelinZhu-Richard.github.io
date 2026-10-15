export async function createModel(cpu = false) {
  const {FilesetResolver, HandLandmarker} = await import('./vendor/mediapipe/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm', import.meta.url).href);
  const options = {baseOptions: {modelAssetPath: new URL('./vendor/hand_landmarker.task', import.meta.url).href, delegate: cpu ? 'CPU' : 'GPU'}, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .4, minHandPresenceConfidence: .4, minTrackingConfidence: .4};
  try { return await HandLandmarker.createFromOptions(files, options); }
  catch (error) {
    if (cpu) throw error;
    options.baseOptions.delegate = 'CPU';
    return HandLandmarker.createFromOptions(files, options);
  }
}

export class VisionClient {
  constructor({workerFactory = () => {
    if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') throw new Error('Worker frame transfer is unavailable.');
    return new Worker(new URL('./vision-worker.js', import.meta.url));
  }, modelFactory = createModel, bitmapFactory = (...args) => createImageBitmap(...args), timeout = 30000} = {}) {
    this.workerFactory = workerFactory; this.modelFactory = modelFactory; this.bitmapFactory = bitmapFactory; this.timeout = timeout;
    this.pending = new Map(); this.next = 1; this.generation = 0; this.inFlight = false; this.mode = null;
  }
  async start() {
    this.stop();
    const generation = this.generation;
    try {
      const worker = this.workerFactory(); this.worker = worker;
      worker.onmessage = ({data}) => {
        const task = this.pending.get(data.id);
        if (!task) return;
        clearTimeout(task.timer); this.pending.delete(data.id);
        data.error ? task.reject(new Error(data.error)) : task.resolve(data.result);
      };
      worker.onerror = () => {
        if (this.worker !== worker) return;
        this.failure = new Error('Hand tracking stopped. Stop and restart the camera to retry.');
        this.rejectPending(this.failure);
      };
      await this.request('init');
      if (generation !== this.generation) throw new DOMException('Tracking cancelled.', 'AbortError');
      this.mode = 'worker'; return this.mode;
    } catch (error) {
      if (generation !== this.generation) throw error;
      this.worker?.terminate(); this.worker = null; this.rejectPending(error); this.failure = null;
      const model = await this.modelFactory(false);
      if (generation !== this.generation) { model.close(); throw new DOMException('Tracking cancelled.', 'AbortError'); }
      this.model = model; this.mode = 'compatibility'; return this.mode;
    }
  }
  request(type, extra = {}, transfer = []) {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const id = this.next++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Hand tracking took too long. Stop and restart the camera to retry.')); }, type === 'init' ? this.timeout : 3000);
      this.pending.set(id, {resolve, reject, timer});
      try { this.worker.postMessage({id, type, ...extra}, transfer); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async track(video, time) {
    if (this.inFlight) return null;
    if (this.failure) throw this.failure;
    const generation = this.generation;
    this.inFlight = true;
    try {
      if (this.worker) {
        const image = await this.bitmapFactory(video, {resizeWidth: 640, resizeHeight: Math.round(640 * video.videoHeight / video.videoWidth)});
        if (generation !== this.generation) { image.close(); throw new DOMException('Tracking cancelled.', 'AbortError'); }
        try { return await this.request('track', {image, time}, [image]); }
        finally { image.close(); }
      }
      if (!this.model) throw new Error('Hand tracking is not ready. Restart the camera.');
      return this.model.detectForVideo(video, time);
    } finally { if (generation === this.generation) this.inFlight = false; }
  }
  rejectPending(error) {
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(error); }
    this.pending.clear();
  }
  stop() {
    this.generation++; this.worker?.terminate(); this.worker = null;
    this.model?.close(); this.model = null;
    this.rejectPending(new DOMException('Tracking cancelled.', 'AbortError'));
    this.failure = null; this.mode = null; this.inFlight = false;
  }
}
