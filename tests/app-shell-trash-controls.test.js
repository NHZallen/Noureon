import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import appShell from '../src/templates/app-shell.js';

test('trash batch controls remain outside the translated trash heading', () => {
  const window = new Window();
  window.document.body.innerHTML = appShell;

  const trashSection = window.document.getElementById('trash-section');
  const trashHeading = trashSection?.querySelector('h3[data-lang-key="trash"]');
  const batchSelectButton = window.document.getElementById('trash-batch-select-btn');
  const emptyTrashButton = window.document.getElementById('empty-trash-btn');

  assert.ok(trashSection);
  assert.ok(trashHeading);
  assert.ok(batchSelectButton);
  assert.ok(emptyTrashButton);
  assert.equal(trashHeading.contains(batchSelectButton), false);
  assert.equal(trashHeading.contains(emptyTrashButton), false);

  trashHeading.textContent = '垃圾桶';

  assert.ok(window.document.getElementById('trash-batch-select-btn'));
  assert.ok(window.document.getElementById('empty-trash-btn'));
});
