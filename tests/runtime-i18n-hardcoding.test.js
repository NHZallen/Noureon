import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getRuntimeTexts, SUPPORTED_RUNTIME_LANGUAGES } from '../src/app/runtime/i18n/runtime-texts.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const read = (path) => readFileSync(projectFile(path), 'utf8');

test('runtime i18n dictionary is complete for every supported language', () => {
  assert.deepEqual(SUPPORTED_RUNTIME_LANGUAGES, ['zh-TW', 'en', 'fr', 'ru', 'es']);
  const expectedKeys = Object.keys(getRuntimeTexts('en')).sort();
  for (const language of SUPPORTED_RUNTIME_LANGUAGES) {
    const texts = getRuntimeTexts(language);
    assert.deepEqual(Object.keys(texts).sort(), expectedKeys, language);
    for (const [key, value] of Object.entries(texts)) {
      assert.ok(String(value).trim(), `${language}.${key} must not be empty`);
    }
  }
});

test('Russian and Spanish dynamic UI copy is native rather than English or Chinese fallback', () => {
  assert.equal(getRuntimeTexts('ru').reasoning, 'Глубина рассуждений');
  assert.equal(getRuntimeTexts('ru').requestFailed, 'Ошибка запроса');
  assert.equal(getRuntimeTexts('es').translatedDocuments, 'Documentos traducidos');
  assert.equal(getRuntimeTexts('es').clearAllApiKeys, 'Borrar todas las claves API');
});

test('audited runtime surfaces no longer contain binary English-versus-Chinese language branches', () => {
  const sources = [
    'src/app/legacy-runtime/features/assistant-response-finalization.js',
    'src/app/legacy-runtime/features/council-response-lifecycle.js',
    'src/app/legacy-runtime/features/generated-image-interactions.js',
    'src/app/legacy-runtime/features/model-switcher-lifecycle.js',
    'src/app/legacy-runtime/features/provider-request-support.js',
    'src/app/legacy-runtime/features/response-progress-renderers.js',
    'src/app/legacy-runtime/features/single-model-response-lifecycle.js'
  ];
  for (const path of sources) {
    const source = read(path);
    assert.doesNotMatch(source, /uiLanguage\s*===\s*['"]en['"]\s*\?/, path);
    assert.doesNotMatch(source, /config\.uiLanguage\s*===\s*['"]zh-TW['"]\s*\?/, path);
  }
});

test('learning mode provides a localized model instruction for all five languages', () => {
  const source = read('src/app/legacy-runtime/features/stream-api-call.js');
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    assert.match(source, new RegExp(`(?:['"]${language}['"]|\\b${language}):`), language);
  }
  assert.match(source, /LEARNING_MODE_PROMPTS\[config\.uiLanguage\]/);
});
