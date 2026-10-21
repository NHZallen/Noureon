import assert from 'node:assert/strict';
import test from 'node:test';

import { createLedger } from '../../src/app/ui/ledger/ledger.js';
import { createDom } from './helpers/create-dom.js';

// A new step folds the steps that are done, but not the one the reader opened to read.
test('a new step does not fold a finished row the reader opened', () => {
  const dom = createDom('<div id="host"></div>');
  try {
    const ledger = createLedger({ document: dom.document, host: dom.document.getElementById('host') });
    const first = ledger.addRow('Step 1', { body: true });
    const second = ledger.addRow('Step 2', { body: true });
    first.enableBody(true);
    second.enableBody(true);
    first.finish();
    second.finish();

    first.node.querySelector('.ledger-row-head').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    assert.equal(first.openedByReader, false, 'the click closed the row that started open');
    first.node.querySelector('.ledger-row-head').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    assert.equal(first.openedByReader, true);

    ledger.foldFinished();
    assert.equal(first.node.querySelector('.ledger-row-head').getAttribute('aria-expanded'), 'true', 'the row the reader opened stays open');
    assert.equal(second.node.querySelector('.ledger-row-head').getAttribute('aria-expanded'), 'false', 'the other finished row folds');

    first.node.querySelector('.ledger-row-head').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    ledger.foldFinished();
    assert.equal(first.node.querySelector('.ledger-row-head').getAttribute('aria-expanded'), 'false', 'closed by the reader, it stays closed');
    ledger.remove();
  } finally {
    dom.cleanup();
  }
});
