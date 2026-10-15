const cancelled = () => new DOMException('Camera start cancelled.', 'AbortError');
export class CameraSession {
  constructor(video, devices = globalThis.navigator?.mediaDevices) {
    this.video = video; this.devices = devices; this.generation = 0; this.stream = null;
  }
  async start() {
    this.stop();
    const generation = this.generation;
    if (!this.devices?.getUserMedia) throw new Error('Camera access needs HTTPS and a browser with camera support. Try Chrome, Edge, or Safari.');
    const stream = await this.devices.getUserMedia({audio: false, video: {facingMode: 'user', width: {ideal: 1280}, height: {ideal: 720}}});
    if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); throw cancelled(); }
    this.stream = stream;
    this.video.srcObject = stream;
    try {
      await this.video.play();
      if (generation !== this.generation) throw cancelled();
      return stream;
    } catch (error) {
      stream.getTracks().forEach(track => track.stop());
      if (this.stream === stream) { this.stream = null; this.video.srcObject = null; }
      throw error;
    }
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}

export function cameraError(error) {
  if (error.name === 'NotAllowedError') return 'Camera permission was blocked. Allow camera access in your browser’s site settings, then try again.';
  if (error.name === 'NotFoundError') return 'No camera was found. Connect a webcam, then try again.';
  if (error.name === 'NotReadableError') return 'Your camera is busy. Close other apps using it, then try again.';
  return error.message || 'The camera could not start. Please try again.';
}
