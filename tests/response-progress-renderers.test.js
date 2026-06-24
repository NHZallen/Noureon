import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createResponseProgressRenderers } from '../src/app/legacy-runtime/features/response-progress-renderers.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const escapeHTML = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const runtimeTexts = {
  completed: 'Completed',
  done: 'Done',
  failed: 'Failed',
  pending: 'Pending',
  running: 'Running',
  sharedSearch: 'Shared search',
  skippedStatus: 'Skipped'
};

const createHarness = ({ uiLanguage = 'en' } = {}) => createResponseProgressRenderers({
  escapeHTML,
  getUiLanguage: () => uiLanguage,
  getCouncilRuntimeTexts: () => runtimeTexts
});

test('council progress renders escaped stage, search, stats, and model rows', () => {
  const { renderCouncilProgress } = createHarness();

  const html = renderCouncilProgress({
    activeParticipants: 2,
    elapsedMs: 2400,
    message: 'Working <now>',
    modelStates: [
      { detail: 'Thinking', modelName: 'Astra <One>', status: 'running' },
      { modelName: 'Astra Two', status: 'done' }
    ],
    search: { detail: 'query <x>', label: 'Shared', status: 'running' },
    stage: 'firstRound',
    totalParticipants: 3
  });

  assert.match(html, /council-progress-panel/);
  assert.match(html, /Independent round/);
  assert.match(html, /2s/);
  assert.match(html, /Working &lt;now&gt;/);
  assert.match(html, /2\/3 models/);
  assert.match(html, /1 done/);
  assert.match(html, /1 running/);
  assert.match(html, /query &lt;x&gt;/);
  assert.match(html, /Astra &lt;One&gt;/);
});

test('council progress preserves string progress fallback', () => {
  const { renderCouncilProgress } = createHarness();

  assert.equal(
    renderCouncilProgress('Loading <state>'),
    '<div class="council-progress-panel"><div class="council-progress-heading">Loading &lt;state&gt;</div></div>'
  );
});

test('single-model progress and error render localized escaped output', () => {
  const { renderSingleModelError, renderSingleModelProgress } = createHarness({ uiLanguage: 'zh-TW' });

  const progressHTML = renderSingleModelProgress({
    elapsedMs: 1100,
    message: '串流 <中>',
    modelName: '模型 A',
    receivedChars: 42,
    stage: 'streaming',
    translatorName: 'Translator <T>'
  });
  const errorHTML = renderSingleModelError({ elapsedMs: 999, modelName: '模型 B' }, '爆炸 <err>');

  assert.match(progressHTML, /模型作答/);
  assert.match(progressHTML, /串流 &lt;中&gt;/);
  assert.match(progressHTML, /已接收字元: 42/);
  assert.match(progressHTML, /Translator &lt;T&gt;/);
  assert.match(errorHTML, /single-progress-panel-error/);
  assert.match(errorHTML, /請求失敗/);
  assert.match(errorHTML, /爆炸 &lt;err&gt;/);
});

test('response progress renderers source avoids runtime side-effect ownership', () => {
  const source = readSource('src/app/legacy-runtime/features/response-progress-renderers.js');

  for (const forbidden of [
    'document.',
    'document[',
    'window',
    'globalThis',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fetch',
    'addEventListener',
    'removeEventListener',
    'querySelector',
    'innerHTML',
    'classList',
    'streamApiCall',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});
