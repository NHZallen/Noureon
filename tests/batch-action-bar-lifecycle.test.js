import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createBatchActionBarLifecycle } from '../src/app/legacy-runtime/features/batch-action-bar-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createHarness = (overrides = {}) => {
  const { document, cleanup } = createDom(`
    <div id="batch-action-bar" class="hidden">
      <span id="selection-count"></span>
      <button id="batch-delete"></button>
      <button id="batch-archive"></button>
      <button id="batch-move"></button>
    </div>
    <div id="user-controls"></div>
  `);
  const selectedIds = overrides.selectedIds ?? new Set(['c-1', 'c-2']);
  const lifecycle = createBatchActionBarLifecycle({
    elements: {
      batchActionBar: document.querySelector('#batch-action-bar'),
      userControls: document.querySelector('#user-controls'),
      selectionCount: document.querySelector('#selection-count'),
      batchDeleteBtn: document.querySelector('#batch-delete'),
      batchArchiveBtn: document.querySelector('#batch-archive'),
      batchMoveBtn: document.querySelector('#batch-move')
    },
    getI18n: () => ({ en: { selected: 'Selected', items: 'items' } }),
    getIsSelectionMode: () => overrides.isSelectionMode ?? true,
    getSelectedConversationIds: () => selectedIds,
    getUiLanguage: () => 'en'
  });

  return { cleanup, document, lifecycle };
};

test('renders visible batch action bar with selected count and enabled actions', () => {
  const { cleanup, document, lifecycle } = createHarness();
  try {
    assert.equal(lifecycle.renderBatchActionBar(), true);

    assert.equal(document.querySelector('#batch-action-bar').classList.contains('hidden'), false);
    assert.equal(document.querySelector('#user-controls').classList.contains('hidden'), true);
    assert.equal(document.querySelector('#selection-count').textContent, 'Selected 2 items');
    assert.equal(document.querySelector('#batch-delete').disabled, false);
    assert.equal(document.querySelector('#batch-archive').disabled, false);
    assert.equal(document.querySelector('#batch-move').disabled, false);
  } finally {
    cleanup();
  }
});

test('disables actions when selection mode has no selected conversations', () => {
  const { cleanup, document, lifecycle } = createHarness({ selectedIds: new Set() });
  try {
    lifecycle.renderBatchActionBar();

    assert.equal(document.querySelector('#selection-count').textContent, 'Selected 0 items');
    assert.equal(document.querySelector('#batch-delete').disabled, true);
    assert.equal(document.querySelector('#batch-archive').disabled, true);
    assert.equal(document.querySelector('#batch-move').disabled, true);
  } finally {
    cleanup();
  }
});

test('hides batch action bar and restores user controls outside selection mode', () => {
  const { cleanup, document, lifecycle } = createHarness({ isSelectionMode: false });
  try {
    document.querySelector('#batch-action-bar').classList.remove('hidden');
    document.querySelector('#user-controls').classList.add('hidden');

    lifecycle.renderBatchActionBar();

    assert.equal(document.querySelector('#batch-action-bar').classList.contains('hidden'), true);
    assert.equal(document.querySelector('#user-controls').classList.contains('hidden'), false);
  } finally {
    cleanup();
  }
});

test('missing controls remain a safe no-op boundary', () => {
  const lifecycle = createBatchActionBarLifecycle({
    elements: {},
    getIsSelectionMode: () => true,
    getSelectedConversationIds: () => new Set(['c-1'])
  });

  assert.equal(lifecycle.renderBatchActionBar(), false);
});

test('batch action bar lifecycle source avoids unrelated runtime systems', () => {
  const source = readSource('src/app/legacy-runtime/features/batch-action-bar-lifecycle.js');

  for (const forbidden of [
    'TextDecoder',
    'streamApiCall',
    'fetch(',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'DOMPurify',
    'marked',
    'katex',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});
