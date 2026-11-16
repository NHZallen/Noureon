import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createSandboxLedger } from '../src/app/ui/sandbox/sandbox-ledger.js';

const call = (action, domain, label) => ({ type: 'browser', event: 'call', action, domain, label });
const make = () => {
  const window = new Window();
  const { document } = window;
  const ledger = createSandboxLedger({ document, host: document.body, language: 'en' });
  const rows = () => [...document.body.querySelectorAll('.ledger-row[data-kind="browser"]')];
  return { window, ledger, rows };
};

test('the steps of the browser: one row each, the one before is over when the next begins, and the icon is the browser', () => {
  const { window, ledger, rows } = make();
  try {
    ledger.event(call('open', 'acme.com', 'Browsing: acme.com'));
    ledger.event(call('click', 'acme.com', 'Working the browser on acme.com'));
    assert.equal(rows().length, 2);
    assert.ok(rows()[0].classList.contains('is-done'), 'opening the site is over');
    assert.ok(rows()[1].classList.contains('is-running'), 'the click is running');
    ledger.event(call('close', '', 'Closing the browser'));
    assert.equal(rows().length, 3);
    assert.ok(rows()[1].classList.contains('is-done'));
  } finally {
    window.happyDOM.abort();
  }
});

test('thirty clicks on the same site are one row that goes on, not thirty rows', () => {
  const { window, ledger, rows } = make();
  try {
    ledger.event(call('open', 'acme.com', 'Browsing: acme.com'));
    for (let i = 0; i < 30; i += 1) ledger.event(call(i % 2 ? 'type' : 'click', 'acme.com', 'Working the browser on acme.com'));
    assert.equal(rows().length, 2);
    ledger.event(call('open', 'other.org', 'Browsing: other.org'));
    ledger.event(call('click', 'other.org', 'Working the browser on other.org'));
    assert.equal(rows().length, 4, 'another site is a step of its own');
  } finally {
    window.happyDOM.abort();
  }
});

test('waiting for a free browser is one row that follows the place in the line and goes when the browser opens; a failure is a row that failed', () => {
  const { window, ledger, rows } = make();
  try {
    ledger.event({ type: 'browser', event: 'queued', position: 2, label: 'Waiting for a free browser (2 ahead)' });
    ledger.event({ type: 'browser', event: 'queued', position: 1, label: 'Waiting for a free browser (1 ahead)' });
    assert.equal(rows().length, 1);
    assert.match(rows()[0].textContent, /1 ahead/);
    ledger.event(call('open', 'acme.com', 'Browsing: acme.com'));
    assert.equal(rows().length, 1, 'the waiting row is gone');
    assert.match(rows()[0].textContent, /Browsing: acme.com/);
    ledger.event({ type: 'browser', event: 'failed', label: 'The browser is not available now' });
    assert.ok(rows().at(-1).classList.contains('is-failed'));
  } finally {
    window.happyDOM.abort();
  }
});
