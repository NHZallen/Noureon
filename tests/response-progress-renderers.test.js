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

test('single-model progress is one dot with no words, and words only when they say something', () => {
  const { renderSingleModelProgress } = createHarness({ uiLanguage: 'zh-TW' });
  const label = (html) => html.match(/progress-dot-label">([^<]*)</)[1];

  const waiting = renderSingleModelProgress({ elapsedMs: 1100, modelName: '模型 A', stage: 'streaming', message: undefined, receivedChars: 0 });
  assert.match(waiting, /class="progress-dot"/);
  assert.match(waiting, /progress-dot-mark/);
  assert.equal(label(waiting), '\u200b', 'nothing to say: the dot alone');
  for (const gone of ['模型 A', '模型作答</', 'council-progress', 'single-progress-panel', '<details', '已接收']) assert.ok(!waiting.includes(gone), `${gone} is no longer drawn`);
  assert.match(waiting, /aria-label="模型作答"/, 'a screen reader still hears what is going on');

  assert.equal(label(renderSingleModelProgress({ elapsedMs: 4000, stage: 'preparing', message: '準備請求' })), '\u200b', 'preparing is instant: no words');
  assert.equal(label(renderSingleModelProgress({ elapsedMs: 5000, stage: 'streaming' })), '5s', 'the seconds come once the wait is long');
  assert.equal(label(renderSingleModelProgress({ elapsedMs: 3000, stage: 'documentTranslation' })), '文件轉譯');
  assert.equal(label(renderSingleModelProgress({ elapsedMs: 3000, stage: 'searchTranslation', message: '搜尋 <網站>' })), '搜尋 &lt;網站&gt;', 'what is said is escaped');
  assert.equal(label(renderSingleModelProgress({ elapsedMs: 9000, stage: 'documentTranslation', translatorName: 'Translator <T>' })), '文件轉譯 · Translator &lt;T&gt; · 9s');
  assert.equal(label(renderSingleModelProgress({ elapsedMs: 2000, stage: 'streaming', receivedChars: 42 })), '已接收字元: 42', 'output at the end: the characters are the only sign of life');
  assert.equal(label(renderSingleModelProgress({ elapsedMs: 12000, stage: 'streaming', receivedChars: 1234 })), '已接收字元: 1234 · 12s');
});

test('the dot keeps one shape from tick to tick, so the timer changes only its text and the breathing is not started again', () => {
  const { renderSingleModelProgress } = createHarness({ uiLanguage: 'en' });
  const shape = (html) => html.replace(/>[^<]*</g, '><');
  const states = [
    { elapsedMs: 1000, stage: 'streaming' }, { elapsedMs: 6000, stage: 'streaming' }, { elapsedMs: 3000, stage: 'documentTranslation' },
    { elapsedMs: 8000, stage: 'streaming', receivedChars: 9 }
  ];
  const [first, ...others] = states.map((state) => shape(renderSingleModelProgress(state)));
  for (const other of others) assert.equal(other, first);
});

test('a failed request is the same dot, still, with the time and the message under it', () => {
  const { renderSingleModelError } = createHarness({ uiLanguage: 'zh-TW' });
  const errorHTML = renderSingleModelError({ elapsedMs: 999, modelName: '模型 B' }, '爆炸 <err>');
  assert.match(errorHTML, /progress-dot-error/);
  assert.match(errorHTML, /single-progress-panel-error/);
  assert.match(errorHTML, /請求失敗 · 1s/);
  assert.match(errorHTML, /爆炸 &lt;err&gt;/);
  assert.ok(!errorHTML.includes('模型 B'), 'the model name is not repeated');
  assert.match(renderSingleModelError({ elapsedMs: 2000 }, ''), /progress-dot-error-message">請求失敗</, 'with no message the failure is said once more as the message');
});

test('the dot is drawn in the colour of the theme, breathes, and sits still for a person who asked for less motion', () => {
  const css = readSource('src/styles/model-council.css');
  assert.match(css, /\.progress-dot-mark \{[^}]*background: var\(--progress-dot-color, #3960ea\);[^}]*animation: progress-dot-breathe 0\.625s ease-in-out infinite alternate/s);
  assert.match(css, /@keyframes progress-dot-breathe \{\s*from \{ transform: scale\(0\.84\); \}\s*to \{ transform: scale\(1\); \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.progress-dot-mark \{[^}]*transform: none/s);
  const dotRules = css.slice(css.indexOf('.progress-dot {'), css.indexOf('@keyframes progress-dot-breathe'));
  assert.doesNotMatch(dotRules, /#ef4444|#dc2626|\bred\b/i, 'an error has no colour of its own: the theme\'s');
  assert.match(dotRules, /\.progress-dot-error \.progress-dot-mark \{\s*animation: none;/);
  assert.doesNotMatch(css, /\.single-progress-panel\b(?!-error)/, 'the big panel has no styles left');
  assert.match(css, /\.thinking-collapse summary/, 'the folding block of the thinking keeps its own');
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
