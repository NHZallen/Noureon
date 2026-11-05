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
    if (dark) {
      root.style.backgroundColor = '#212121';
      // The browser bar (and the status bar of an installed app) is dark from the first frame: this tag comes first, so it wins over the one of the page.
      var bar = document.createElement('meta');
      bar.name = 'theme-color';
      bar.content = '#212121';
      document.head.insertBefore(bar, document.head.firstChild);
      // The same for the manifest: a browser reads the background of the splash screen and the colour of the bar from it when the app is installed
      // (and again when it checks for an update), so a person who uses the dark theme gets the dark ones. The first manifest link wins.
      var manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = '/manifest-dark.json';
      // With the cookie of the site, as the link of index.html: a test site behind a login would otherwise send the request to the login page.
      manifest.crossOrigin = 'use-credentials';
      document.head.insertBefore(manifest, document.head.firstChild);
    }
  } catch (error) { /* the page stays as it is */ }
})();

// The rail of icons on the left of a computer (src/app/ui/rail/): shown from the first paint when it is on. It is off until it is finished; a person who wants to try it sets
// localStorage "noureon.rail" to "on" (and "off" to leave it).
(function () {
  try {
    var DEFAULT_ON = false;
    var value = localStorage.getItem('noureon.rail');
    if (value === 'on' || (value !== 'off' && DEFAULT_ON)) document.documentElement.setAttribute('data-rail', 'on');
  } catch (error) { /* the page stays as it is */ }
})();
