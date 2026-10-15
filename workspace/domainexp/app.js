import {CameraSession, cameraError} from './camera.js';
import {VisionClient} from './vision.js';
import {FrameTracker, DomainState} from './geometry.js';
import {Renderer} from './render.js';

const $ = id => document.getElementById(id);
const video = $('camera'), arena = $('arena'), status = $('status'), error = $('error');
const startButtons = [...document.querySelectorAll('.start-trigger')];
const camera = new CameraSession(video), tracker = new FrameTracker(), domain = new DomainState(), renderer = new Renderer($('view'));
let vision = null, generation = 0, animation = 0, running = false, busy = false, lastInference = -Infinity, lastVideoTime = -1;

function say(text) { if (status.textContent !== text) status.textContent = text; }
function controls(active) { startButtons.forEach(button => button.disabled = active); $('stop').disabled = !active; }

function stop(message = 'Camera off. Ready for another domain?') {
  generation++; running = false; busy = false; cancelAnimationFrame(animation);
  camera.stop(); vision?.stop(); vision = null; tracker.reset(); domain.reset();
  lastInference = -Infinity; lastVideoTime = -1;
  arena.dataset.state = 'idle'; arena.dataset.active = 'false';
  $('intro').hidden = false; $('loading').hidden = true; $('camera-label').textContent = 'CAMERA OFF';
  $('domain-label').textContent = 'FRAME / TRANSFORM';
  controls(false); say(message);
}

function fail(problem, token) {
  if (token !== generation) return;
  stop('Something interrupted your domain');
  error.textContent = cameraError(problem); error.hidden = false;
  $('start').focus({preventScroll: true});
}

function loop(time) {
  if (!running) return;
  const token = generation, client = vision;
  const state = domain.snapshot(time);
  renderer.draw(video, state, time, Number($('pixel-size').value));
  say(state.reason); arena.dataset.active = String(state.active);
  $('domain-label').textContent = state.active ? 'DOMAIN EXPANDED' : 'FRAME / TRANSFORM';
  const interval = client.mode === 'worker' ? 45 : 100;
  if (!busy && video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTime && time - lastInference >= interval) {
    busy = true; lastInference = time; lastVideoTime = video.currentTime;
    client.track(video, time).then(result => {
      if (generation !== token || !running || !result) return;
      // Old inference results cannot bring a domain back after a long stall.
      if (performance.now() - time < 200) domain.update(tracker.update(result, time), time);
    }).catch(problem => fail(problem, token)).finally(() => { if (generation === token) busy = false; });
  }
  animation = requestAnimationFrame(loop);
}

async function start() {
  stop();
  const token = generation;
  error.hidden = true; controls(true); $('intro').hidden = true; $('loading').hidden = false;
  $('loading-text').textContent = 'Opening camera…'; say('Waiting for camera permission');
  arena.dataset.state = 'starting';
  // Keep Stop reachable while a browser permission prompt or model load is pending.
  $('stop').focus({preventScroll: true});
  const client = new VisionClient(); vision = client;
  try {
    const stream = await camera.start();
    if (token !== generation) return;
    $('loading-text').textContent = 'Preparing hand tracking…'; say('Preparing hand tracking');
    for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => fail(new Error('The camera disconnected. Reconnect it, then try again.'), token), {once: true});
    await client.start();
    if (token !== generation) return;
    if (document.hidden) { stop('Camera paused while this tab is hidden'); return; }
    running = true; $('loading').hidden = true; arena.dataset.state = 'live';
    $('camera-label').textContent = 'CAMERA ON · LOCAL ONLY';
    say('Show both hands'); animation = requestAnimationFrame(loop);
  } catch (problem) { fail(problem, token); }
}

startButtons.forEach(button => button.addEventListener('click', start));
$('stop').addEventListener('click', () => { stop(); $('start').focus({preventScroll: true}); });
$('pixel-size').addEventListener('input', event => { $('pixel-value').value = event.target.value; });
const experience = document.querySelector('.experience');
if (!experience.requestFullscreen || !document.fullscreenEnabled) {
  $('fullscreen').disabled = true; $('fullscreen').title = 'Fullscreen is unavailable in this browser';
}
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await experience.requestFullscreen();
  } catch { error.textContent = 'Fullscreen is unavailable here. You can keep using the camera in this view.'; error.hidden = false; }
});
document.addEventListener('fullscreenchange', () => {
  const active = Boolean(document.fullscreenElement);
  $('fullscreen').querySelector('span').textContent = active ? 'Exit fullscreen' : 'Fullscreen';
  $('fullscreen').setAttribute('aria-pressed', String(active));
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stop('Camera paused. Press Start camera to resume.'); });
window.addEventListener('pagehide', () => stop());
