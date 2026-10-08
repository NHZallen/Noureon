// Sets the colour theme before the first paint, so a dark page never flashes white while the app starts.
// The choice ("light", "dark" or "system") is mirrored in localStorage by src/app/runtime/features/color-scheme.js
// (the settings themselves are in IndexedDB, which cannot be read this early). Keep the logic in step with that file.
// Nothing is set while no choice has been stored: the app is light then, and the public pages (terms, privacy, updates) follow the device.
(function () {
  try {
    var choice = localStorage.getItem('noureon-color-scheme');
    if (choice !== 'light' && choice !== 'dark' && choice !== 'system') return;
    var dark = choice === 'dark' || (choice === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (dark) root.style.backgroundColor = '#212121';
  } catch (error) { /* the page stays as it is */ }
})();
