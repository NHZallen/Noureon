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
