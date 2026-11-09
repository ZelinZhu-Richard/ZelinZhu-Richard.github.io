// Destination pages: if the visitor came from a stone, play the arrival fade from night.
try {
  if (sessionStorage.getItem('stone-arrive')) {
    sessionStorage.removeItem('stone-arrive');
    document.documentElement.classList.add('stone-arrive');
  }
} catch { /* storage is optional */ }
