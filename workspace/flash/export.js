import { validateCard } from './state.js';
import { mountCard, mountAurora } from './renderer.js';

export function safeJSON(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function exportFilename(title, extension) {
  const slug = title.normalize('NFKD').replace(/[^a-z\d]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'card';
  return `flash-${slug}.${extension}`;
}
export function buildInteractiveHTML(input, assets) {
  const card = validateCard(input);
  const title = card.title.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const css = assets.css.replace("url('./assets/InstrumentSerif-Regular.ttf')", `url('data:font/ttf;base64,${assets.font}')`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'">
<title>${title} — Holographic card</title>
<style>${css}
*{box-sizing:border-box}html,body{margin:0;background:#101010;color:#aaa;font-family:Arial,Helvetica,sans-serif}body{min-height:100svh}.flash-scene{min-height:100svh}.flash-card-host{min-height:100svh;padding:64px 32px 90px}.hint{position:absolute;bottom:max(24px,env(safe-area-inset-bottom));left:16px;right:16px;text-align:center;font-size:12px;letter-spacing:.025em;pointer-events:none;color:#aaa}.flash-card{max-height:calc(100svh - 160px);max-width:min(var(--card-width),calc((100svh - 160px) * var(--ratio)))}@media(max-width:600px){.hint .desktop{display:none}}@media(min-width:601px){.hint .touch{display:none}}
</style></head><body><main class="flash-scene"><canvas class="flash-aurora" aria-hidden="true"></canvas><div class="flash-card-host"></div><p class="hint"><span class="desktop">Move your pointer to catch the light · Arrow keys work too</span><span class="touch">Drag the card to catch the light</span></p></main>
<script type="application/json" id="flash-design">${safeJSON(card)}</script>
<script>${mountCard.toString()}\n${mountAurora.toString()}\nconst card=JSON.parse(document.getElementById('flash-design').textContent);mountCard(document.querySelector('.flash-card-host'),card);mountAurora(document.querySelector('.flash-aurora'),card.aurora);</script>
<noscript><p style="padding:24px">Enable JavaScript to see this interactive holographic card.</p></noscript></body></html>`;
}
export function download(contents, filename, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
