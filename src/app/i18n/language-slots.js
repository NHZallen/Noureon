// The place each language of a split text table lives in (docs/superpowers/specs/2026-10-14-language-split-design.md, §3).
//
// In the browser build, the plugin of scripts/language-split.mjs rewrites a registered text module so that the value of each language,
// `'en': { ... }`, becomes `languageSlot('<module>', 'en')`: an object that is empty at first. The words of that language are in a file of their
// own, loaded by `ensureLanguage` (language-packs.js), which puts them in the slot. The table keeps its shape (`TEXTS[language][key]`), so the
// code that reads it does not change. Tests, the server and the dev server use the whole module and never meet a slot.
//
// A slot that is read before its words are in (a language the page did not load: it should not happen, the page loads the language it shows)
// asks for the language in the background and says so once, so the next time the words are there.
//
// Shared by the page and the server: no window, no document, no browser storage.

const slots = new Map();
const filled = new Set();
let onEarlyRead = () => {};

/** What to do when a slot is read before its words are in (language-packs.js: load that language). */
export function setEarlyReadHandler(handler) {
  onEarlyRead = typeof handler === 'function' ? handler : () => {};
}

const keyOf = (moduleId, language) => `${moduleId}\u0000${language}`;

/** The object that holds one language of one text table (the same object every time it is asked for). */
export function languageSlot(moduleId, language) {
  const key = keyOf(moduleId, language);
  let slot = slots.get(key);
  if (!slot) {
    const target = {};
    const proxy = new Proxy(target, {
      get(object, property, receiver) {
        if (typeof property === 'string' && !filled.has(key)) onEarlyRead(language, moduleId);
        return Reflect.get(object, property, receiver);
      }
    });
    slot = { target, proxy };
    slots.set(key, slot);
  }
  return slot.proxy;
}

/** Puts the words of a language in its slot. */
export function fillLanguageSlot(moduleId, language, values) {
  languageSlot(moduleId, language);
  Object.assign(slots.get(keyOf(moduleId, language)).target, values);
  filled.add(keyOf(moduleId, language));
}
