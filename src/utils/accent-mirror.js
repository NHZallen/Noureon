// The accent and the bubble colour of the person are in the settings (IndexedDB), which a page that does not start the app cannot read. The app mirrors what it applied in the storage of
// the site, and the page of a shared conversation puts the same colours on itself, so that it looks like the app of the person who opens it (only when the theme is the same one).

const KEY = 'noureon-accent';

/** Called by the app each time it applies the colours: { theme, primary, primaryText, bubbleBg, bubbleText }. */
export function rememberAccent(colors, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(colors)); } catch { /* the page then uses the default colours */ }
}

/** Puts the remembered colours on `root` when they were made for the theme shown (`root`'s data-theme, light when none). */
export function applyRememberedAccent(root, storage = globalThis.localStorage) {
  try {
    const colors = JSON.parse(storage?.getItem(KEY) || 'null');
    const shown = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    if (!colors || colors.theme !== shown) return false;
    const colour = /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%/]+\)$|^color-mix\([^;{}]+\)$|^hsla?\([\d\s.,%/deg]+\)$/i;
    for (const [property, value] of [['--button-primary-bg', colors.primary], ['--button-primary-text', colors.primaryText], ['--user-bubble-bg', colors.bubbleBg], ['--user-bubble-text', colors.bubbleText]]) {
      if (typeof value === 'string' && colour.test(value.trim())) root.style.setProperty(property, value.trim());
    }
    return true;
  } catch { return false; }
}
