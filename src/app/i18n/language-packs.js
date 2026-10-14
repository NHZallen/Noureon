// Loads the words of one language for every split text table (docs/superpowers/specs/2026-10-14-language-split-design.md, §3).
//
// Only in the browser build (`__LANGUAGE_SPLIT__`, set by scripts/language-split.mjs); everywhere else the tables are whole and every language is
// there already, so `ensureLanguage` has nothing to do.

import { fillLanguageSlot } from './language-slots.js';

export const LANGUAGE_PACK_LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);
export const DEFAULT_PACK_LANGUAGE = 'zh-TW';

const split = typeof __LANGUAGE_SPLIT__ !== 'undefined' && __LANGUAGE_SPLIT__ === true;
const loaded = new Set();
const loading = new Map();

/** The language of a pack for any code: a language the app does not have is the default one. */
export const resolvePackLanguage = (language) => (LANGUAGE_PACK_LANGUAGES.includes(language) ? language : DEFAULT_PACK_LANGUAGE);

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
