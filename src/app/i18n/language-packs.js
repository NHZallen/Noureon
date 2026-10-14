// Loads the words of one language for every split text table (docs/superpowers/specs/2026-10-14-language-split-design.md, §3).
//
// Only in the browser build (`__LANGUAGE_SPLIT__`, set by scripts/language-split.mjs); everywhere else the tables are whole and every language is
// there already, so `ensureLanguage` has nothing to do.

import { fillLanguageSlot, setEarlyReadHandler } from './language-slots.js';

export const LANGUAGE_PACK_LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);
export const DEFAULT_PACK_LANGUAGE = 'zh-TW';

const split = typeof __LANGUAGE_SPLIT__ !== 'undefined' && __LANGUAGE_SPLIT__ === true;
const loaded = new Set();
const loading = new Map();

/** The language of a pack for any code: a language the app does not have is the default one. */
export const resolvePackLanguage = (language) => (LANGUAGE_PACK_LANGUAGES.includes(language) ? language : DEFAULT_PACK_LANGUAGE);

// The language the page starts in (src/main.js picks it before anything is made): the first value of `uiLanguage` of the settings, so that what is
// made while the app is built (the sidebar entries and so on) already asks for words of the language that is loaded.
let startupLanguage = null;
export const setStartupLanguage = (language) => { startupLanguage = resolvePackLanguage(language); };
export const getStartupLanguage = () => startupLanguage;

export const isLanguageLoaded = (language) => !split || loaded.has(resolvePackLanguage(language));

/** Loads the words of a language (once; at the same time for every table). Resolves with the language that was loaded; rejects when a file cannot be had (offline and not cached). */
export function ensureLanguage(language) {
  const resolved = resolvePackLanguage(language);
  if (!split || loaded.has(resolved)) return Promise.resolve(resolved);
  if (!loading.has(resolved)) {
    const load = (async () => {
      const { slices } = await import('virtual:language-packs');
      await Promise.all(Object.entries(slices[resolved] || {}).map(async ([moduleId, importSlice]) => {
        const module = await importSlice();
        fillLanguageSlot(moduleId, resolved, module.default);
      }));
      loaded.add(resolved);
      return resolved;
    })();
    // A failed load is forgotten, so the next call tries again.
    loading.set(resolved, load.finally(() => loading.delete(resolved)));
  }
  return loading.get(resolved);
}

// A text read before its language is in: load the language now, and say so once (the page loads the language it shows, so this is a bug to look at).
const warned = new Set();
setEarlyReadHandler((language, moduleId) => {
  if (!split || loaded.has(language)) return;
  if (!warned.has(language)) {
    warned.add(language);
    console.warn(`Words of "${language}" were read before they were loaded (${moduleId}); loading them now.`);
  }
  ensureLanguage(language).catch(() => {});
});
