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

const translations = {
  thinkingStatus: 'Thinking…',
  councilPreparationGroup: 'Translation and search',
  councilModelStatusGroup: 'Model status',
  councilDocumentTranslation: 'Document translation',
  councilWebSearch: 'Web search',
  councilSynthesizer: 'Synthesizer',
  councilStatusWaiting: 'Waiting',
  councilStatusThinking: 'Thinking',
  councilStatusResponding: 'Responding',
  councilStatusDone: 'Done',
  councilStatusError: 'Error',
  councilStatusInProgress: 'In progress'
};

const createHarness = ({ uiLanguage = 'en' } = {}) => createResponseProgressRenderers({
  escapeHTML,
  getUiLanguage: () => uiLanguage,
  getCouncilRuntimeTexts: () => runtimeTexts,
  getTranslations: () => translations
});

test('council progress renders compact collapsible preparation and model status groups', () => {
  const { renderCouncilProgress } = createHarness();

  const html = renderCouncilProgress({
    activeParticipants: 2,
    elapsedMs: 2400,
    message: 'Working <now>',
    modelStates: [
      { detail: 'Chunk 1', modelName: 'Astra <One>', responseStarted: true, status: 'running' },
      { modelName: 'Astra Two', status: 'done' }
    ],
    search: { detail: 'query <x>', label: 'Shared', status: 'running' },
    synthesizerModelName: 'Astra Synth',
    stage: 'firstRound',
    totalParticipants: 3,
    translation: { status: 'done' }
  });

  assert.match(html, /class="council-status" role="status" aria-live="polite"/);
  assert.match(html, /data-council-status-toggle="preparation"/);
  assert.match(html, /data-council-status-toggle="models"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /Translation and search/);
  assert.match(html, /Document translation/);
  assert.match(html, /Web search/);
  assert.match(html, /In progress/);
  assert.match(html, /Astra &lt;One&gt;/);
  assert.match(html, /Responding/);
  assert.match(html, /Astra Synth/);
  assert.match(html, /Synthesizer/);
  assert.match(html, /Waiting 1 · Responding 1 · Done 1/);
  assert.doesNotMatch(html, /Error 0|Thinking 0/);
  assert.doesNotMatch(html, /2s|Working &lt;now&gt;|2\/3 models|query &lt;x&gt;|Chunk 1|council-progress-panel|council-progress-note|council-progress-stats/);
});

test('council string progress fallback stays localized and metadata-free', () => {
  const { renderCouncilProgress } = createHarness();

  const html = renderCouncilProgress('Loading <state>');

  assert.match(html, /Thinking…/);
  assert.doesNotMatch(html, /Loading|state|council-progress-panel/);
});

test('single-model progress only renders the localized thinking status', () => {
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

  assert.match(progressHTML, /class="assistant-thinking-indicator"/);
  assert.match(progressHTML, /role="status"/);
  assert.match(progressHTML, />Thinking…<\/span>/);
  assert.doesNotMatch(progressHTML, /模型 A|模型作答|串流|已接收字元|Translator|single-progress-panel|council-progress/);
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
