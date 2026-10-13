import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

import { i18n } from '../src/data/i18n/index.js';

// What a person reads has to exist in every language. These tests read the source for the keys it asks the interface texts for and check that each
// one is in all five languages (a key that is missing falls back to the Traditional Chinese written beside it, which an English page then shows).

const root = new URL('..', import.meta.url).pathname;
const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];
const CJK = /[\u3400-\u9fff]/;

const sourceFiles = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (path.endsWith('.js')) sourceFiles.push(path);
  }
};
walk(join(root, 'src'));
const sources = sourceFiles
  .filter((path) => !/\/data\/(i18n|legal)\//.test(path))
  .map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }));

const keys = new Set(Object.keys(i18n.en));

const referencedKeys = () => {
  const found = [];
  const add = (key, path) => found.push({ key, path });
  for (const { path, text } of sources) {
    for (const match of text.matchAll(/data-lang-key(?:-placeholder|-title|-aria)?=\\?["']([A-Za-z0-9_]+)/g)) add(match[1], path);
    for (const match of text.matchAll(/dataset\.langKey(?:Placeholder|Title|Aria)?\s*=\s*['"]([A-Za-z0-9_]+)['"]/g)) add(match[1], path);
    for (const match of text.matchAll(/\bi18n\[[^\]]+\]\??\.([A-Za-z0-9_]+)/g)) add(match[1], path);
    // `const translations = i18n[language]` and then `translations.vision`.
    const aliases = new Set([...text.matchAll(/\b(?:const|let|var)\s+(\w+)\s*=\s*(?:\(?\s*)?(?:globalThis\.)?i18n(?:\?\.)?\[[^\]]+\]/g)].map((match) => match[1]));
    for (const alias of aliases) {
      for (const match of text.matchAll(new RegExp(`\\b${alias}\\??\\.([A-Za-z_][A-Za-z0-9_]*)\\b`, 'g'))) add(match[1], path);
    }
    for (const match of text.matchAll(/(?:getSettingsText|getLocalizedText)\(\s*['"]([A-Za-z][A-Za-z0-9_]+)['"]/g)) add(match[1], path);
    for (const match of text.matchAll(/\b(?:labelKey|descriptionKey|placeholderKey|hintKey)\s*[:=]\s*['"]([A-Za-z][A-Za-z0-9_]+)['"]/g)) add(match[1], path);
  }
  return found;
};

test('every language has exactly the keys of every other language, and no Chinese outside Traditional Chinese', () => {
  const reference = Object.keys(i18n['zh-TW']).sort();
  for (const language of LANGUAGES) {
    assert.deepEqual(Object.keys(i18n[language]).sort(), reference, `${language} keys`);
    if (language === 'zh-TW') continue;
    const chinese = Object.entries(i18n[language]).filter(([, value]) => typeof value === 'string' && CJK.test(value)).map(([key]) => key);
    assert.deepEqual(chinese, [], `${language} has Chinese in ${chinese.join(', ')}`);
  }
});

test('every key the source asks the interface texts for exists in every language', () => {
  // `title` of the skill catalog and `js` of a file extension are not interface keys.
  const ignored = new Set(['title', 'js', 'length', 'map', 'filter', 'forEach', 'hasOwnProperty']);
  // A model's `model_…_desc` is the start of its `_tier_…` texts (the price lines), not a key of its own.
  const missing = referencedKeys().filter(({ key }) => !keys.has(key) && !ignored.has(key) && !/^model_\w+_desc$/.test(key));
  assert.deepEqual(missing.map(({ key, path }) => `${key} (${path})`), []);
});

test('a text asked for with Chinese beside it exists in the interface texts or in a table of the module', () => {
  const defined = new Set();
  for (const { text } of sources) {
    for (const match of text.matchAll(/(?:^|[\s{,])['"]?([A-Za-z][A-Za-z0-9_]*)['"]?\s*:/gm)) defined.add(match[1]);
  }
  const missing = [];
  for (const { path, text } of sources) {
    for (const match of text.matchAll(/\b[A-Za-z]*(?:[tT]ext|T)\(\s*['"]([A-Za-z][A-Za-z0-9_]+)['"]\s*,\s*['"`][^'"`]*[\u3400-\u9fff]/g)) {
      if (!keys.has(match[1]) && !defined.has(match[1])) missing.push(`${match[1]} (${path})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('the language picked on the sign-in page is kept across the reload that signing in does', async () => {
  const { applyLoginLanguage, forgetLoginLanguage, readLastUiLanguage, readLoginLanguage, rememberLoginLanguage } = await import('../src/app/runtime/features/login-language.js');
  const storage = (() => {
    const values = new Map();
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  })();

  assert.equal(readLoginLanguage(storage), '');
  rememberLoginLanguage('fr', storage);
  assert.equal(readLoginLanguage(storage), 'fr');
  rememberLoginLanguage('klingon', storage);
  assert.equal(readLoginLanguage(storage), 'fr', 'a language the app does not have is not kept');

  // The settings loaded after signing in are those saved with the account (Traditional Chinese): the pick wins, once.
  const loaded = { uiLanguage: 'zh-TW' };
  assert.equal(applyLoginLanguage(loaded, storage), true);
  assert.equal(loaded.uiLanguage, 'fr');
  assert.equal(readLoginLanguage(storage), '', 'the note is used up');
  assert.equal(applyLoginLanguage(loaded, storage), false);

  // Nothing picked: the saved language stays.
  const saved = { uiLanguage: 'ru' };
  assert.equal(applyLoginLanguage(saved, storage), false);
  assert.equal(saved.uiLanguage, 'ru');

  // The same language: nothing to save, but the note is still used up.
  rememberLoginLanguage('ru', storage);
  assert.equal(applyLoginLanguage(saved, storage), false);
  assert.equal(readLoginLanguage(storage), '');

  storage.setItem('noureon_ui_language', 'es');
  assert.equal(readLastUiLanguage(storage), 'es');
  forgetLoginLanguage(storage);
});

test('the security check is drawn in the language of the page', async () => {
  const { turnstileLanguage } = await import('../src/app/runtime/security/turnstile-client.js');
  assert.deepEqual(['zh-TW', 'en', 'fr', 'ru', 'es'].map(turnstileLanguage), ['zh-tw', 'en', 'fr', 'ru', 'es']);
  assert.equal(turnstileLanguage('de'), 'auto');
});

test('the language of the system: one of the five, any Chinese as Traditional Chinese, nothing for another', async () => {
  const { detectSystemLanguage } = await import('../src/app/runtime/features/login-language.js');
  const of = (...languages) => detectSystemLanguage({ languages, language: languages[0] });
  assert.equal(of('fr-CA', 'en'), 'fr');
  assert.equal(of('en'), 'en');
  assert.equal(of('ru-RU'), 'ru');
  assert.equal(of('es-419'), 'es');
  assert.equal(of('zh-Hans-CN'), 'zh-TW');
  assert.equal(of('ja', 'fr'), 'fr', 'the first language of the list that the app has');
  assert.equal(of('ja', 'de'), '');
  assert.equal(of('english-ish'), '', 'a tag that only starts like one of them is not one');
  assert.equal(detectSystemLanguage({}), '');
  assert.equal(detectSystemLanguage(null), '');
});
