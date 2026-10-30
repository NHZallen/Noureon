import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createLedger } from '../src/app/ui/ledger/ledger.js';
import { createSandboxLedger } from '../src/app/ui/sandbox/sandbox-ledger.js';

const BASE = 1_000_000_000_000;
const label = (row) => row.node.querySelector('.ledger-time').textContent;

test('a row that runs again counts what it ran for, not the time since its first start; one that is resumed without that keeps its whole time', () => {
  const window = new Window();
  try {
    const { document } = window;
    const ledger = createLedger({ document, host: document.body });
    ledger.happenedAt(BASE);
    const own = ledger.addRow('Using connector: Google');
    const whole = ledger.addRow('Working');
    ledger.happenedAt(BASE + 10_000);
    own.finish('done');
    whole.finish('done');
    ledger.happenedAt(BASE + 50_000);
    own.resume({ own: true });
    whole.resume();
    ledger.happenedAt(BASE + 55_000);
    own.finish('done');
    whole.finish('done');
    assert.equal(label(own), '15s', 'ten seconds, then five more: the forty in between were other work');
    assert.equal(label(whole), '55s', 'the line of the whole work goes on from its start');
  } finally {
    window.happyDOM.abort();
  }
});

test('time spent waiting for the person is not the time of the rows that were running: they began that much later', () => {
  const window = new Window();
  try {
    const { document } = window;
    const ledger = createLedger({ document, host: document.body });
    ledger.happenedAt(BASE);
    const row = ledger.addRow('Using connector: Miro');
    ledger.shiftRunning(30_000);
    ledger.happenedAt(BASE + 45_000);
    row.finish('done');
    assert.equal(label(row), '15s');
  } finally {
    window.happyDOM.abort();
  }
});

test('the clock of the work set forward by the wait moves the running rows of the step list, and a small difference between clocks does not', () => {
  const window = new Window();
  try {
    const { document } = window;
    const host = document.createElement('div');
    document.body.append(host);
    const sandbox = createSandboxLedger({ document, host, language: 'en', startedAt: BASE });
    sandbox.event({ type: 'connector', event: 'call', connector: 'miro', label: 'Using connector: Miro', at: BASE });
    sandbox.setStartedAt(BASE + 200);
    sandbox.setStartedAt(BASE + 30_000);
    // The next step beginning ends the row of the connector.
    sandbox.event({ type: 'searching', label: 'Searching', at: BASE + 45_000 });
    const rows = [...host.querySelectorAll('.ledger-row[data-kind="connector"]')];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].querySelector('.ledger-time').textContent, '15s');
  } finally {
    window.happyDOM.abort();
  }
});
