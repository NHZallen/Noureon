import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getOutputModeSettingsText } from '../src/app/legacy-runtime/features/output-mode-settings-text.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const expectedShape = ['title', 'desc', 'typewriter', 'realtime'];

const zhTwText = {
  title: '輸出模式',
  desc: '適用於單獨模型與模型理事會回覆。',
  typewriter: '完整輸出後打字機',
  realtime: '即時同步輸出'
};

test('output mode settings text keeps the zh-TW shape and copy', () => {
  assert.deepEqual(getOutputModeSettingsText('zh-TW'), zhTwText);
});

test('output mode settings text keeps the English shape and copy', () => {
  assert.deepEqual(getOutputModeSettingsText('en'), {
    title: 'Output mode',
    desc: 'Applies to single-model and Model Council replies.',
    typewriter: 'Typewriter after completion',
    realtime: 'Realtime API stream'
  });
});

test('output mode settings text keeps the French shape and copy', () => {
  assert.deepEqual(getOutputModeSettingsText('fr'), {
    title: 'Mode de sortie',
    desc: 'S’applique aux réponses mono-modèle et au conseil de modèles.',
    typewriter: 'Machine à écrire après la réponse complète',
    realtime: 'Flux API en temps réel'
  });
});

test('output mode settings text falls back to the existing default copy', () => {
  assert.deepEqual(getOutputModeSettingsText('unknown-locale'), zhTwText);
  assert.deepEqual(getOutputModeSettingsText(), zhTwText);
});

test('output mode settings text values are always strings', () => {
  for (const locale of ['zh-TW', 'en', 'fr', 'unknown-locale']) {
    const text = getOutputModeSettingsText(locale);

    assert.deepEqual(Object.keys(text), expectedShape);
    for (const key of expectedShape) {
      assert.equal(typeof text[key], 'string', `${locale}.${key} should be a string`);
      assert.ok(text[key].length > 0, `${locale}.${key} should not be empty`);
    }
  }
});

test('output mode settings text returns a fresh object like the legacy local helper', () => {
  assert.notEqual(getOutputModeSettingsText('en'), getOutputModeSettingsText('en'));
});

test('output mode settings text helper remains side-effect free', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/output-mode-settings-text.js');

  for (const forbidden of [
    'document',
    'window',
    'globalThis',
    'addEventListener',
    'localStorage',
    'fetch'
  ]) {
    assert.doesNotMatch(helperSource, new RegExp(`\\b${forbidden}\\b`));
  }
});
