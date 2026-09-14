// SplitText measures glyphs during setup; load the local fonts first.
await Promise.all([
  document.fonts.load('italic 16px TheSeasons'),
  document.fonts.load('16px TTNeoris'),
]);
await document.fonts.ready;
await import('./_nuxt/CbdjwYMp.js');
