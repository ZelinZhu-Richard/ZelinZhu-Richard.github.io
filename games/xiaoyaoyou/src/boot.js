// Keep these available while the module graph and fonts are still loading.
window.__GAME_READY__ = false;
window.__GAME_STATS__ = { drawCalls: 0, triangles: 0, pixelRatio: 0, frame: 0 };
window.__GAME_STATE__ = {
  beat: 'title', motes: 0, kunScale: 1, gameMs: 0,
  translationOn: true, muted: false, settled: false,
};

const loading = document.querySelector('#loading');
const errorPanel = document.querySelector('#load-error');
const progress = document.querySelector('#load-progress');
let runtime;
let booting = false;

async function boot() {
  if (booting) return;
  booting = true;
  window.__GAME_READY__ = false;
  loading.hidden = false;
  errorPanel.hidden = true;
  progress.value = 0.05;
  try {
    const response = await fetch('./text.json');
    if (!response.ok) throw new Error(`text.json: HTTP ${response.status}`);
    const text = await response.json();
    const lines = new Map(text.lines.map(line => [line.id, line]));
    for (const element of document.querySelectorAll('[data-text]')) {
      element.textContent = lines.get(element.dataset.text)[element.dataset.lang];
    }
    document.title = lines.get('title').zh + ' · ' + lines.get('title').en;
    progress.setAttribute('aria-label', lines.get('loading').en);
    document.querySelector('#retry').setAttribute('aria-label', lines.get('retry').en);
    progress.value = 0.22;
    const { createRuntime } = await import('./main.js');
    progress.value = 0.6;
    runtime?.dispose();
    runtime = await createRuntime(text, value => { progress.value = 0.6 + value * 0.35; });
    await runtime.firstFrame();
    progress.value = 1;
    loading.hidden = true;
    const begin = document.querySelector('#begin');
    begin.hidden = false;
    begin.disabled = false;
    // Readiness always follows a real title render, even on a direct checkpoint URL.
    window.__GAME_READY__ = true;
    runtime.applyURL();
  } catch (error) {
    runtime?.dispose();
    loading.hidden = true;
    errorPanel.hidden = false;
    document.querySelector('#begin').hidden = true;
    window.__GAME_READY__ = false;
    console.error('Journey loading failed:', error);
  } finally {
    booting = false;
  }
}

document.querySelector('#retry').addEventListener('click', boot);
boot();
