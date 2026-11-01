// The one Google Drive picker of the page (google-picker.js), shared by the menu of the message box and the sources of a project: one sign-in (and one token) for both. It exists only when the page
// has the three keys (VITE_GOOGLE_PICKER_*, see .env.example); without them there is no such choice anywhere. Page only.

import { createGooglePicker, googlePickerConfigured } from './google-picker.js';

const UI_LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);
let shared = null;

/** The keys of the picker, from the build's environment. */
export const drivePickerConfig = () => ({
  clientId: import.meta.env?.VITE_GOOGLE_PICKER_CLIENT_ID?.trim() || '',
  apiKey: import.meta.env?.VITE_GOOGLE_PICKER_API_KEY?.trim() || '',
  appId: import.meta.env?.VITE_GOOGLE_PICKER_APP_ID?.trim() || ''
});

export const drivePickerAvailable = () => googlePickerConfigured(drivePickerConfig());

/** The picker ({ warm(), pick(), forget() }), or null when the page has no keys for it. `getLanguage()` is the language of the screen. */
export function getDrivePicker({ document, getLanguage = () => 'en' }) {
  if (shared) return shared;
  const config = drivePickerConfig();
  if (!googlePickerConfigured(config)) return null;
  shared = createGooglePicker({ config, document, getLanguage: () => (UI_LANGUAGES.includes(getLanguage()) ? getLanguage() : 'en') });
  return shared;
}

/** For the tests. */
export const resetDrivePicker = () => { shared = null; };
