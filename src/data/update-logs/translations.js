// The update notes in the other languages. src/data/update-logs/entries.js is the notes in Traditional Chinese (the source); en.js, fr.js, ru.js and es.js
// each hold `{ "<version>": [the same list of strings, translated] }` for every version that has notes. A note without a translation is shown in Traditional
// Chinese. Each file is loaded only when it is asked for (the new-version window in the language of the app, the public page /updates in all of them).

export const UPDATE_LOG_LANGUAGES = Object.freeze(['en', 'fr', 'ru', 'es']);

const LOADERS = Object.freeze({
  en: () => import('./en.js'),
  fr: () => import('./fr.js'),
  ru: () => import('./ru.js'),
  es: () => import('./es.js')
});

/** The translated notes of one language: `{ version: [strings] }`, or `{}` for Traditional Chinese or a language that has none (or when the file cannot be loaded). */
export async function loadUpdateTranslation(language) {
  const load = LOADERS[language];
  if (!load) return {};
  try {
    return (await load()).default || {};
  } catch {
    return {};
  }
}

/** All the translations: `{ en: {...}, fr: {...}, ru: {...}, es: {...} }`. */
export async function loadUpdateTranslations() {
  const entries = await Promise.all(UPDATE_LOG_LANGUAGES.map(async (language) => [language, await loadUpdateTranslation(language)]));
  return Object.fromEntries(entries);
}

/** The notes with the text of `language` in place of the Traditional Chinese one (versions without a translation stay as they are). */
export async function localizeUpdateLogs(logs, language) {
  const translation = await loadUpdateTranslation(language);
  return logs.map((log) => (translation[log.version] ? { ...log, content: translation[log.version] } : log));
}
