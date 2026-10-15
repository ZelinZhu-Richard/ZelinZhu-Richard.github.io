import {CameraSession, cameraError} from './camera.js';
import {VisionClient} from './vision.js';
import {FrameTracker, DomainState, applyTrackingResult} from './geometry.js';
import {Renderer} from './render.js';
import {FireballState} from './fireball.js';
import {DustState} from './dust.js';

const $ = id => document.getElementById(id);
const video = $('camera'), arena = $('arena'), status = $('status'), error = $('error');
const startButtons = [...document.querySelectorAll('.start-trigger')];
const camera = new CameraSession(video), tracker = new FrameTracker(), domain = new DomainState(), renderer = new Renderer($('view'));
const fireball = new FireballState();
const dust = new DustState();
const effects = {
  domain: {state: domain, guide: 'domain', label: 'FRAME / TRANSFORM', active: 'DOMAIN EXPANDED', prompt: 'Show both hands',
    title: 'Your hands draw the boundary. The world inside becomes pixels.', lead: 'Make room for', emphasis: 'another reality.',
    instruction: 'Show both hands, then spread your thumbs and index fingers. The finger outlines help you frame a window.',
    below: 'Frame with both hands. Move to reshape. Lower a hand to release.', aria: 'Mirrored webcam with a pixelated window between your thumbs and index fingers'},
  fireball: {state: fireball, guide: 'fire', label: 'PALM / CAST', active: 'FIREBALL CAST', prompt: 'Show an open palm',
    title: 'An open palm starts the fire. Cast a fireball toward the camera.', lead: 'Fire at', emphasis: 'your fingertips.',
    instruction: 'Show an open palm to cast. Close and reopen your hand to cast again.',
    below: 'One open palm. One fireball. Close, reopen, and cast again.', aria: 'Mirrored webcam with fireballs launched from your open palms'},
  dust: {state: dust, guide: 'dust', label: 'SEAL / RELEASE', active: '尘遁 · DUST RELEASE', prompt: 'Show both palms toward the camera',
    title: 'Bring your fingertips close. Release a cube of light into dust.', lead: 'A world within', emphasis: 'your hands.',
    instruction: 'Palms toward the camera. Bring thumb to thumb and index to index, leaving a small gap. Hold to release.',
    below: 'Two palms. Four fingertips. Hold to release 尘遁, then separate to cast again.', aria: 'Mirrored webcam with a luminous Dust Release cube between both hands'},
};
const resetEffects = () => { tracker.reset(); Object.values(effects).forEach(({state}) => state.reset()); };
let effect = 'domain', effectRevision = 0;
let vision = null, generation = 0, animation = 0, running = false, busy = false, lastInference = -Infinity, lastVideoTime = -1;

function say(text) { if (status.textContent !== text) status.textContent = text; }
function controls(active) { startButtons.forEach(button => button.disabled = active); $('stop').disabled = !active; }

function stop(message = 'Camera off. Ready when you are.') {
  generation++; running = false; busy = false; cancelAnimationFrame(animation);
  camera.stop(); vision?.stop(); vision = null; resetEffects();
  lastInference = -Infinity; lastVideoTime = -1;
  arena.dataset.state = 'idle'; arena.dataset.active = 'false';
  $('intro').hidden = false; $('loading').hidden = true; $('camera-label').textContent = 'CAMERA OFF';
  $('domain-label').textContent = effects[effect].label;
  controls(false); say(message);
}

function fail(problem, token) {
  if (token !== generation) return;
  stop('Something interrupted hand tracking');
  error.textContent = cameraError(problem); error.hidden = false;
  $('start').focus({preventScroll: true});
}

function loop(time) {
  if (!running) return;
  const token = generation, revision = effectRevision, client = vision;
  const state = effects[effect].state.snapshot(time);
  renderer.draw(video, state, time, Number($('pixel-size').value));
  say(state.reason); arena.dataset.active = String(state.active);
  $('domain-label').textContent = state.active ? effects[effect].active : `${state.hands.length}${effect === 'fireball' ? '' : ' / 2'} HANDS TRACKED`;
  const interval = client.mode === 'worker' ? 45 : 100;
  if (!busy && video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTime && time - lastInference >= interval) {
    busy = true; lastInference = time; lastVideoTime = video.currentTime;
    client.track(video, time).then(result => {
      if (generation !== token || revision !== effectRevision || !running || !result) return;
      applyTrackingResult(tracker, effects[effect].state, result, time, performance.now());
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
    say(effects[effect].prompt); animation = requestAnimationFrame(loop);
  } catch (problem) { fail(problem, token); }
}

document.querySelectorAll('input[name="effect"]').forEach(input => input.addEventListener('change', () => {
  if (!input.checked) return;
  effect = input.value; effectRevision++;
  resetEffects();
  const config = effects[effect];
  arena.dataset.effect = effect; arena.dataset.active = 'false';
  Object.values(effects).forEach(({guide}) => { $(`${guide}-guide`).hidden = guide !== config.guide; $(`${guide}-help`).hidden = guide !== config.guide; });
  $('pixel-control').hidden = effect !== 'domain';
  $('title-copy').textContent = config.title;
  $('intro-lead').textContent = config.lead;
  $('intro-emphasis').textContent = config.emphasis;
  $('intro-instruction').textContent = config.instruction;
  $('effect-instruction').textContent = config.below;
  $('view').setAttribute('aria-label', config.aria);
  $('domain-label').textContent = config.label;
  if (running) say(config.prompt);
  else if (arena.dataset.state !== 'starting') say('Ready when you are');
}));

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
