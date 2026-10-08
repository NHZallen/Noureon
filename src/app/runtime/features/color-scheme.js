// The colour theme of the app: "light", "dark", or "system" (follow the device). The settings keep the person's choice
// (`colorScheme`); this turns it into the `data-theme` attribute of <html> that src/styles/tokens.css reads, keeps a copy
// in localStorage for public/theme-init.js (which sets it before the first paint), and follows the device while the
// choice is "system". The default is light.

import { COLOR_SCHEMES, normalizeColorScheme } from '../../../data/color-scheme-choices.js';

export { COLOR_SCHEMES, normalizeColorScheme };
export const COLOR_SCHEME_STORAGE_KEY = 'noureon-color-scheme';
// The colour of the browser's own bars (the address bar of a phone) for each theme.
const BROWSER_BAR = Object.freeze({ light: '#3b82f6', dark: '#212121' });

/** The theme to show for a choice: 'light' or 'dark'. */
export const resolveTheme = (scheme, deviceIsDark = false) => (scheme === 'dark' || (normalizeColorScheme(scheme) === 'system' && deviceIsDark) ? 'dark' : 'light');

export function createColorScheme({ window, document }) {
  const root = document.documentElement;
  const query = typeof window?.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let scheme = 'light';

  const paint = () => {
    const theme = resolveTheme(scheme, Boolean(query?.matches));
    if (root.getAttribute?.('data-theme') !== theme) root.setAttribute?.('data-theme', theme);
    root.style?.removeProperty?.('background-color');
    const meta = document.querySelector?.('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', BROWSER_BAR[theme]);
    return theme;
  };
  const onDeviceChange = () => { if (scheme === 'system') paint(); };
  query?.addEventListener?.('change', onDeviceChange);

  return {
    /** Shows the choice and remembers it for the next start. Returns the theme shown. */
    apply(choice) {
      scheme = normalizeColorScheme(choice);
      try {
        window?.localStorage?.setItem(COLOR_SCHEME_STORAGE_KEY, scheme);
      } catch { /* storage is not available: the choice still holds for this visit */ }
      return paint();
    },
    current: () => scheme,
    dispose: () => query?.removeEventListener?.('change', onDeviceChange)
  };
}
