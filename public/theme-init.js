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

// The workspace of a computer has the rail of icons (src/app/ui/rail/): the buttons the left menu and the top bar had before it are not shown from the first paint (src/styles/layout.css), not only
// after the rail has started, which comes later (it waits for the account). Whoever turned the rail off (localStorage "noureon.rail" = "off") keeps the old ones. Only 768 px and more is affected: a phone is as it was.
(function () {
  try {
    if (localStorage.getItem('noureon.rail') !== 'off') document.documentElement.setAttribute('data-rail-early', '');
  } catch (error) { /* the page stays as it is */ }
})();

// "Reduce motion" of the Accessibility settings (src/app/ui/motion/motion-preference.js): the choice is mirrored in localStorage ("noureon-reduce-motion" = "on"). The page marks itself from the first paint
// (`data-motion="reduced"`, styled in layout.css) and the questions of the scripts about "prefers-reduced-motion" are answered yes while it is on, as they are when the device asks for it.
(function () {
  try {
    if (localStorage.getItem('noureon-reduce-motion') === 'on') document.documentElement.setAttribute('data-motion', 'reduced');
    var original = window.matchMedia && window.matchMedia.bind(window);
    if (!original) return;
    window.matchMedia = function (query) {
      var result = original(query);
      if (!/prefers-reduced-motion:\s*reduce/.test(String(query)) || document.documentElement.getAttribute('data-motion') !== 'reduced') return result;
      return { matches: true, media: result.media, onchange: null, addEventListener: function () {}, removeEventListener: function () {}, addListener: function () {}, removeListener: function () {}, dispatchEvent: function () { return false; } };
    };
  } catch (error) { /* the page stays as it is */ }
})();
