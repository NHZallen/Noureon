import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles/reply-wait.css', import.meta.url), 'utf8');
const ledger = readFileSync(new URL('../src/styles/ledger.css', import.meta.url), 'utf8');

test('the step of a slow wait (reading files, converting documents) is drawn again every second without its row fading in again', () => {
  // ledger.css fades every row in; the wait view is redrawn each second, so the row of the wait step must not repeat it.
  assert.match(ledger, /\.ledger-row \{ animation: ledger-in /);
  assert.match(css, /\.reply-wait-step \.ledger-row \{ animation: none; \}/);
});
