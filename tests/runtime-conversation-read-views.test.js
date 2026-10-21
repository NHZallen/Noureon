import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createRuntimeAppDataStore } from '../src/app/runtime/kernel/app-data-store.js';
import { createLiveConversationsBridge } from '../src/app/runtime/kernel/live-conversations-bridge.js';
import { createHistorySidebarHelpers } from '../src/app/runtime/shell/history-sidebar-helpers.js';
import { createDom } from './behaviours/helpers/create-dom.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const projectFile = (...segments) => path.join(projectRoot, ...segments);

function listJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

// The retired search preview is guarded in tests/retired-code.test.js; the filtering and order of the history list in
// tests/runtime-history-sidebar-helpers.test.js.

test('the history sidebar shows the conversations the store holds now, through the live bridge', () => {
  const { document, cleanup } = createDom('<div id="history-list"></div>');
  try {
    const store = createRuntimeAppDataStore({ initialConversations: [{ id: 'old', createdAt: '2026-01-01' }] });
    const bridge = createLiveConversationsBridge({
      getConversations: () => store.getConversations(),
      replaceConversations: (next) => store.replaceConversations(next)
    });
    const helpers = createHistorySidebarHelpers({
      document,
      elements: {},
      getRequiredElement: (name) => document.getElementById(name === 'historyList' ? 'history-list' : name),
      getConversations: () => bridge.getConversations(),
      createConversationElement: (conversation) => {
        const item = document.createElement('div');
        item.dataset.id = conversation.id;
        return item;
      },
      getNamingText: () => 'Naming'
    });
    const shown = () => [...document.querySelectorAll('#history-list [data-id]')].map((item) => item.dataset.id);

    helpers.renderHistorySidebar();
    assert.deepEqual(shown(), ['old']);

    bridge.replaceConversations([
      { id: 'new', createdAt: '2026-02-01' },
      { id: 'archived', createdAt: '2026-03-01', archived: true },
      { id: 'trashed', createdAt: '2026-03-01', deletedAt: '2026-03-02' }
    ]);
    helpers.renderHistorySidebar();
    assert.deepEqual(shown(), ['new']);
  } finally {
    cleanup();
  }
});

// Boundary: the list of conversations is replaced through the live bridge; only the composition root, which makes the bridge,
// calls the store directly.
test('direct app data store conversation replacements stay inside the bridge adapter allowlist', () => {
  const directReplacementPattern = /runtimeAppDataStore\.replaceConversations\(/;
  const runtimeFiles = listJavaScriptFiles(projectFile('src', 'app', 'runtime'));
  const filesWithDirectReplacement = runtimeFiles
    .filter((file) => directReplacementPattern.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(projectRoot, file).replaceAll('\\', '/'))
    .sort();

  assert.deepEqual(filesWithDirectReplacement, [
    'src/app/runtime/shell/shell.js'
  ]);
});
