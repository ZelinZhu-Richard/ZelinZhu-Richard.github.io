import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CameraSession, cameraError} from '../camera.js';
import {VisionClient} from '../vision.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject}; };
const stream = () => { const track = {stopped: 0, stop() {this.stopped++;}}; return {track, getTracks: () => [track]}; };
const video = () => ({srcObject: null, play: async () => {}, videoWidth: 1280, videoHeight: 720});
function worker({init = true, track = true} = {}) {
  return {terminated: 0, messages: [], terminate() {this.terminated++;}, postMessage(message) {
    this.messages.push(message);
    if ((message.type === 'init' && init) || (message.type === 'track' && track)) queueMicrotask(() => this.onmessage({data: {id: message.id, result: message.type === 'init' ? true : {landmarks: []}}}));
  }};
}

test('late camera permission after Stop releases the stream without attaching it', async () => {
  const pending = deferred(), media = stream(), element = video();
  const camera = new CameraSession(element, {getUserMedia: () => pending.promise});
  const starting = camera.start(); camera.stop(); pending.resolve(media);
  await assert.rejects(starting, {name: 'AbortError'});
  assert.equal(media.track.stopped, 1); assert.equal(element.srcObject, null);
});
test('camera restart stops the old stream and repeated Stop is harmless', async () => {
  const first = stream(), second = stream(); let count = 0;
  const camera = new CameraSession(video(), {getUserMedia: async options => {assert.equal(options.audio, false); return count++ ? second : first;}});
  await camera.start(); await camera.start(); assert.equal(first.track.stopped, 1);
  camera.stop(); camera.stop(); assert.equal(second.track.stopped, 1);
});
test('a late play failure cannot detach a newer camera session', async () => {
  const pending = deferred(), first = stream(), second = stream(), element = video(); let count = 0;
  element.play = () => count === 1 ? pending.promise : Promise.resolve();
  const camera = new CameraSession(element, {getUserMedia: async () => ++count === 1 ? first : second});
  const starting = camera.start(); await Promise.resolve();
  await camera.start(); pending.reject(new Error('Interrupted'));
  await assert.rejects(starting); assert.equal(element.srcObject, second); camera.stop();
});
test('permission denial and unsupported cameras have actionable messages', async () => {
  const camera = new CameraSession(video(), {getUserMedia: async () => {throw new DOMException('denied', 'NotAllowedError');}});
  await assert.rejects(camera.start(), {name: 'NotAllowedError'});
  assert.match(cameraError(new DOMException('', 'NotAllowedError')), /site settings/);
  assert.match(cameraError(new DOMException('', 'NotFoundError')), /Connect a webcam/);
  await assert.rejects(new CameraSession(video(), {}).start(), /HTTPS/);
});
test('Stop during worker initialization rejects startup without creating a fallback', async () => {
  const stub = worker({init: false}); let fallback = 0;
  const client = new VisionClient({workerFactory: () => stub, modelFactory: async () => {fallback++;}});
  const starting = client.start(); client.stop();
  await assert.rejects(starting, {name: 'AbortError'}); assert.equal(fallback, 0); assert.equal(stub.terminated, 1);
});
test('a model resolving after cancellation closes itself', async () => {
  const pending = deferred(), model = {closed: 0, close() {this.closed++;}};
  const client = new VisionClient({workerFactory: () => {throw new Error('unsupported');}, modelFactory: () => pending.promise});
  const starting = client.start(); client.stop(); pending.resolve(model);
  await assert.rejects(starting, {name: 'AbortError'}); assert.equal(model.closed, 1);
});
test('only one inference is in flight; late bitmaps are closed on Stop', async () => {
  const stub = worker(), bitmap = {closed: 0, close() {this.closed++;}}, pending = deferred();
  const client = new VisionClient({workerFactory: () => stub, bitmapFactory: () => pending.promise});
  await client.start(); const tracking = client.track(video(), 1);
  assert.equal(await client.track(video(), 2), null);
  client.stop(); pending.resolve(bitmap);
  await assert.rejects(tracking, {name: 'AbortError'}); assert.equal(bitmap.closed, 1);
});
test('worker failure rejects tracking, and a fresh start can recover', async () => {
  let stub;
  const client = new VisionClient({workerFactory: () => (stub = worker({track: false})), bitmapFactory: async () => ({close() {}})});
  await client.start(); const tracking = client.track(video(), 1); await Promise.resolve();
  stub.onerror(); await assert.rejects(tracking, /Hand tracking stopped/);
  await assert.rejects(client.track(video(), 2), /Hand tracking stopped/);
  assert.equal(await client.start(), 'worker'); client.stop();
});
test('failed worker initialization falls back and model failures remain visible', async () => {
  const model = {close() {}, detectForVideo: () => ({landmarks: []})};
  const client = new VisionClient({workerFactory: () => {throw new Error('unsupported');}, modelFactory: async () => model});
  assert.equal(await client.start(), 'compatibility'); assert.deepEqual(await client.track(video(), 1), {landmarks: [], aspectRatio: 16 / 9}); client.stop();
  const broken = new VisionClient({workerFactory: () => {throw new Error('unsupported');}, modelFactory: async () => {throw new Error('Model unavailable');}});
  await assert.rejects(broken.start(), /Model unavailable/);
});

test('browsers with workers but no bitmap transfer use the compatibility path', async () => {
  const previousWorker = globalThis.Worker, previousBitmap = globalThis.createImageBitmap;
  const model = {close() {}, detectForVideo: () => ({landmarks: []})};
  globalThis.Worker = function () {return worker();};
  globalThis.createImageBitmap = undefined;
  const client = new VisionClient({modelFactory: async () => model});
  try {
    assert.equal(await client.start(), 'compatibility');
    assert.deepEqual(await client.track(video(), 1), {landmarks: [], aspectRatio: 16 / 9});
  } finally {
    client.stop();
    if (previousWorker === undefined) delete globalThis.Worker; else globalThis.Worker = previousWorker;
    if (previousBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = previousBitmap;
  }
});
