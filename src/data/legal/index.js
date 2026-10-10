// The Help Center, the Terms of Use and the Privacy Policy, written in full in the five languages of the application. Each language is a file of its own
// (zh-TW.js, en.js, fr.js, ru.js, es.js) with the same three documents: { title, updated, intro: [paragraphs], sections: [{ id, h, blocks }] }, where a
// block is a paragraph (a string) or a list (an array of strings).
// These words are not part of the application's own bundle: scripts/build-public-pages.mjs writes them into the static pages noureon.com/help, /terms and
// /privacy, and PRIVACY.md is made from the English privacy policy (scripts/generate-privacy-md.mjs). The settings only link to the pages.
// When a feature or a data flow changes, change it here (all five languages), then run `npm run build` (pages) and `node scripts/generate-privacy-md.mjs` (PRIVACY.md).

import zhTW from './zh-TW.js';
import en from './en.js';
import fr from './fr.js';
import ru from './ru.js';
import es from './es.js';

export const LEGAL_LANGUAGES = Object.freeze(['zh-TW', 'en', 'fr', 'ru', 'es']);
export const LEGAL_DOCUMENTS = Object.freeze(['help', 'terms', 'privacy']);
export const LEGAL = Object.freeze({ 'zh-TW': zhTW, en, fr, ru, es });

/** Every text of a document, one per paragraph or list item, in reading order (the title and the date included). */
export function documentTexts(doc) {
  return [doc.title, doc.updated, ...doc.intro, ...doc.sections.flatMap((section) => [section.h, ...section.blocks.flatMap((block) => (Array.isArray(block) ? block : [block]))])];
}

export default LEGAL;
