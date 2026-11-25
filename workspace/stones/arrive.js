// Destination pages: when the visitor arrives from the homepage, the content rises out of the night.
// The homepage (workspace/home) travels to a section with location.assign(href) once its scene has
// played the stone's release beat, so the arrival is read from the referrer: a fresh navigation from
// / or /contacts/ on this site. A reload or a back/forward visit plays nothing. stones.css has the fade.
(() => {
  try {
    const entry = performance.getEntriesByType?.('navigation')?.[0];
    if (entry && entry.type !== 'navigate') return;
    if (!document.referrer) return;
    const from = new URL(document.referrer);
    if (from.origin !== location.origin || !/^\/(?:contacts\/?)?$/.test(from.pathname)) return;
    document.documentElement.classList.add('stone-arrive');
  } catch { /* an unreadable referrer is no arrival */ }
})();
