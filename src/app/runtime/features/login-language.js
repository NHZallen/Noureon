// The language picked in the menu of the sign-in page (the home page). Signing in reloads the page (the Email and Google sign-in both do), and
// the account's saved settings are loaded afterwards, so without a note kept across the reload the pick was lost and the app came up in the language
// saved with the account (Traditional Chinese for a new one). The note is read when the page starts (the home page keeps the language), and
// once more when the settings are loaded after signing in, where it wins over the saved one and is then used up.
const KEY = 'noureon_login_language';
// The language the app was last shown in (kept by applyLanguage), what a signed-out visitor who picked nothing sees again.
const LAST_KEY = 'noureon_ui_language';
const LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);

const store = (storage) => {
  try {
    return storage || globalThis.localStorage || null;
  } catch {
    return null;
  }
};

export function rememberLoginLanguage(language, storage) {
  if (!LANGUAGES.includes(language)) return;
  try {
    store(storage)?.setItem(KEY, language);
  } catch {
    // A browser that refuses storage keeps the pick only until the page reloads.
  }
}

export function readLoginLanguage(storage) {
  try {
    const value = store(storage)?.getItem(KEY);
    return LANGUAGES.includes(value) ? value : '';
  } catch {
    return '';
  }
}

export function readLastUiLanguage(storage) {
  try {
    const value = store(storage)?.getItem(LAST_KEY);
    return LANGUAGES.includes(value) ? value : '';
  } catch {
    return '';
  }
}

export function forgetLoginLanguage(storage) {
  try {
    store(storage)?.removeItem(KEY);
  } catch {
    // Nothing to forget where storage is refused.
  }
}

/**
 * Puts the language picked on the sign-in page into the settings just loaded and uses the note up.
 * Returns true when the language of the settings changed (they should be saved).
 */
export function applyLoginLanguage(config, storage) {
  const language = readLoginLanguage(storage);
  if (!language) return false;
  forgetLoginLanguage(storage);
  if (!config || config.uiLanguage === language) return false;
  config.uiLanguage = language;
  return true;
}
