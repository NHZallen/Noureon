// The place each language of a split text table lives in (docs/superpowers/specs/2026-10-14-language-split-design.md, §3).
//
// In the browser build, the plugin of scripts/language-split.mjs rewrites a registered text module so that the value of each language,
// `'en': { ... }`, becomes `languageSlot('<module>', 'en')`: an object that is empty at first. The words of that language are in a file of their
// own, loaded by `ensureLanguage` (language-packs.js), which puts them in the slot. The table keeps its shape (`TEXTS[language][key]`), so the
// code that reads it does not change. Tests, the server and the dev server use the whole module and never meet a slot.
//
// Shared by the page and the server: no window, no document, no browser storage.

const slots = new Map();

/** The object that holds one language of one text table (the same object every time it is asked for). */
export function languageSlot(moduleId, language) {
  const key = `${moduleId}\u0000${language}`;
  let slot = slots.get(key);
  if (!slot) {
    slot = {};
    slots.set(key, slot);
  }
  return slot;
}

/** Puts the words of a language in its slot. */
export function fillLanguageSlot(moduleId, language, values) {
  Object.assign(languageSlot(moduleId, language), values);
}
