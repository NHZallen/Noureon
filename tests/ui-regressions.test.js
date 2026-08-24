import assert from 'node:assert/strict';
import test from 'node:test';
import { readUiSource } from './helpers/source-guards.js';

test('outlined settings and trash actions use the shared white outline button style', () => {
  const shell03 = readUiSource('src/templates/fragments/03-shell.fragment.js');
  const shell04 = readUiSource('src/templates/fragments/04-shell.fragment.js');
  const trashLifecycle = readUiSource('src/app/runtime/features/trash-lifecycle.js');

  for (const id of ['upload-wallpaper-btn', 'restore-wallpaper-btn', 'export-data-btn', 'import-data-btn', 'open-archived-modal-btn']) {
    assert.match(shell03, new RegExp(`id=\\\\"${id}\\\\"[^"]*class=\\\\"[^"]*btn-outline-white`));
  }

  for (const id of ['trash-batch-select-btn', 'empty-trash-btn']) {
    assert.match(shell04, new RegExp(`id=\\\\"${id}\\\\"[^"]*class=\\\\"[^"]*btn-outline-white`));
  }

  for (const className of ['trash-item-view-btn', 'trash-item-restore-btn', 'trash-item-delete-btn']) {
    assert.match(trashLifecycle, new RegExp(`${className}[^\\n]+btn-outline-white`));
  }
});

test('chat typography uses compact message rhythm without automatic heading dividers', () => {
  const shell = readUiSource('src/templates/fragments/01-shell.fragment.js');
  const chat = readUiSource('src/styles/chat.css');
  const council = readUiSource('src/styles/model-council.css');

  assert.match(shell, /id=\\"message-list\\" class=\\"space-y-5/);
  assert.match(chat, /\.message-content > div > :first-child/);
  assert.match(chat, /\.prose h2\s*\{[^}]*border-bottom:\s*0;/s);
  assert.match(council, /\.prose h2\s*\{[^}]*border-bottom:\s*0;/s);
  assert.match(council, /\.prose hr\s*\{[^}]*width:\s*min\(10rem, 32%\);/s);
});

test('display formulas wrap at logical chunks and contain unavoidable overflow', () => {
  const chat = readUiSource('src/styles/chat.css');

  assert.match(chat, /\.message-content \.katex-display\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;/s);
  assert.match(chat, /\.message-content \.katex-display-responsive\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s);
  assert.match(chat, /\.message-content \.katex-display-line\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;/s);
});
