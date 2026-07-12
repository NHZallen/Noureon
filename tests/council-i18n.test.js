import assert from 'node:assert/strict';
import test from 'node:test';

import { COUNCIL_TEXT } from '../src/app/runtime/legacy-core/model-registry.js';
import { getCouncilRuntimeTexts } from '../src/app/runtime/legacy-core/council-runtime-texts.js';

const languages = ['zh-TW', 'en', 'fr', 'ru', 'es'];
const councilKeys = Object.keys(COUNCIL_TEXT.en).sort();
const runtimeKeys = Object.keys(getCouncilRuntimeTexts('en')).sort();

test('model council copy is complete for every supported UI language', () => {
  for (const language of languages) {
    assert.deepEqual(Object.keys(COUNCIL_TEXT[language]).sort(), councilKeys, language);
    for (const value of Object.values(COUNCIL_TEXT[language])) {
      assert.ok(String(value).trim(), `${language} contains an empty council label`);
    }
  }
});

test('model council runtime copy is complete for every supported UI language', () => {
  for (const language of languages) {
    const texts = getCouncilRuntimeTexts(language);
    assert.deepEqual(Object.keys(texts).sort(), runtimeKeys, language);
    for (const value of Object.values(texts)) {
      assert.ok(String(value).trim(), `${language} contains an empty runtime label`);
    }
  }
});

test('Russian and Spanish council labels do not fall back to Chinese or English', () => {
  assert.equal(COUNCIL_TEXT.ru.title, 'Совет моделей');
  assert.equal(COUNCIL_TEXT.ru.synthesizer, 'Итоговая модель');
  assert.equal(getCouncilRuntimeTexts('ru').comparisonToggle, 'Обобщить совпадения и различия');
  assert.equal(COUNCIL_TEXT.es.title, 'Consejo de modelos');
  assert.equal(getCouncilRuntimeTexts('es').comparisonToggle, 'Resumir coincidencias y diferencias');
});
