import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { refreshWhenKeysArrive } from '../src/app/runtime/security/keys-arrived.js';

test('the header is worked out again when keys arrive from the sync or the unlock of the vault, and a failure there changes nothing else', () => {
  const window = new Window();
  let calls = 0;
  const stop = refreshWhenKeysArrive({ window, refresh: () => { calls += 1; } });
  assert.equal(calls, 1, 'what was settled before it started is worked out at once');
  window.dispatchEvent(new window.CustomEvent('astra:cloud-sensitive-config', { detail: { apiKeys: { gemini: 'k' } } }));
  assert.equal(calls, 2);
  window.dispatchEvent(new window.CustomEvent('noureon:keys-settled'));
  assert.equal(calls, 3, 'and when the places the keys come from have all answered');
  window.dispatchEvent(new window.CustomEvent('astra:cloud-config'));
  assert.equal(calls, 3, 'only the keys');
  stop();
  window.dispatchEvent(new window.CustomEvent('astra:cloud-sensitive-config'));
  assert.equal(calls, 3, 'and no more once stopped');

  const failing = new Window();
  const warnings = [];
  failing.console = { warn: (...args) => warnings.push(args) };
  refreshWhenKeysArrive({ window: failing, refresh: () => { throw new Error('not built yet'); } });
  failing.dispatchEvent(new failing.CustomEvent('astra:cloud-sensitive-config'));
  assert.equal(warnings.length, 2, 'once when it starts and once for the event');
});
