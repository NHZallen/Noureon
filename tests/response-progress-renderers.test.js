import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createResponseProgressRenderers } from '../src/app/runtime/reply/response-progress-renderers.js';

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

test('council progress is the timeline: the stage that runs and its members, names escaped', () => {
  const { renderCouncilProgress } = createHarness();

  const html = renderCouncilProgress({
    elapsedMs: 2400,
    mode: 'consensus',
    stage: 'firstRound',
    stages: [{ key: 'firstRound', startMs: 0 }],
    modelStates: [
      { modelId: 'one', modelName: 'Astra <One>', status: 'running', chars: 300 },
      { modelId: 'two', modelName: 'Astra Two', status: 'done' }
    ]
  });

  assert.match(html, /council-tl-panel/);
  assert.match(html, /<li class="council-tl-stage is-now">[^]*?Answering separately<\/span><span class="council-tl-meta">2s<\/span>/);
  assert.match(html, /Astra &lt;One&gt;/);
  assert.match(html, /Writing<\/span><span class="council-tl-member-meta">300 chars/);
  assert.match(html, /<li class="council-tl-stage is-todo">[^]*?Final answer/);
});

test('council progress preserves string progress fallback', () => {
  const { renderCouncilProgress } = createHarness();

  assert.equal(
    renderCouncilProgress('Loading <state>'),
    '<div class="council-progress-panel"><div class="council-progress-heading">Loading &lt;state&gt;</div></div>'
  );
});

test('before the first word a reply shows only a breathing dot, a quiet line after 15 seconds, and one line for a slow step; errors are escaped', () => {
  const { renderSingleModelError, renderSingleModelProgress } = createHarness({ uiLanguage: 'zh-TW' });

  const early = renderSingleModelProgress({ elapsedMs: 1100, message: '串流 <中>', modelName: '模型 A', receivedChars: 42, stage: 'preparing', translatorName: 'Translator <T>' });
  assert.match(early, /class="reply-wait-dot" style="--wait-phase:-1100ms"/, 'the motion goes on from where it was when drawn again');
  for (const hidden of ['模型 A', '串流', '42', 'Translator', '正在確認目標模型能力', 's<']) assert.ok(!early.includes(hidden), `${hidden} is not shown`);
  assert.doesNotMatch(early, /還在準備/);
  assert.match(renderSingleModelProgress({ elapsedMs: 15_000, stage: 'streaming' }), /reply-wait-still">還在準備…</);

  assert.match(renderSingleModelProgress({ elapsedMs: 3000, stage: 'fileReading' }), /ledger-row is-running.*ledger-label">正在讀取檔案……</);
  assert.match(renderSingleModelProgress({ elapsedMs: 3000, stage: 'documentTranslation' }), /正在請轉譯模型讀取文件……/);
  assert.match(renderSingleModelProgress({ elapsedMs: 3000, stage: 'makingPdf' }), /ledger-label">正在把文件轉成 PDF……</);
  assert.match(createHarness({ uiLanguage: 'en' }).renderSingleModelProgress({ elapsedMs: 3000, stage: 'makingPdf' }), /Converting the documents to PDF…/);
  assert.match(renderSingleModelProgress({ elapsedMs: 3000, stage: 'searchTranslation' }), /正在搜尋網路……/);
  assert.match(createHarness({ uiLanguage: 'en' }).renderSingleModelProgress({ elapsedMs: 20_000, stage: 'preparing' }), /Still getting ready…/);

  const errorHTML = renderSingleModelError({ elapsedMs: 999, modelName: '模型 B' }, '爆炸 <err>');
  assert.match(errorHTML, /single-progress-panel-error/);
  assert.match(errorHTML, /請求失敗/);
  assert.match(errorHTML, /爆炸 &lt;err&gt;/);
});

test('response progress renderers source avoids runtime side-effect ownership', () => {
  const source = readSource('src/app/runtime/reply/response-progress-renderers.js');

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
