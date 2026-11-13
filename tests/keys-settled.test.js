import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { beginKeysSettling, keysCloudAnswered, keysLocalRead, keysSettled } from '../src/app/runtime/security/keys-settled.js';

// One window for all the tests, as the page has one (the module listens on the first window it sees).
const window = new Window();
globalThis.window = window;
globalThis.CustomEvent = window.CustomEvent;

async function withWindow(run) {
  const events = [];
  const listener = () => events.push('settled');
  window.addEventListener('noureon:keys-settled', listener);
  try {
    return await run({ window, events });
  } finally {
    window.removeEventListener('noureon:keys-settled', listener);
  }
}

test('a local account is settled as soon as the keys of the device were read, and says so once', () => withWindow(({ events }) => {
  beginKeysSettling({ cloud: false });
  assert.equal(keysSettled(), false, 'nothing has answered yet');
  keysLocalRead();
  assert.equal(keysSettled(), true);
  keysLocalRead();
  assert.deepEqual(events, ['settled']);
}));

test('a cloud account also waits for its sync, and for keys that arrive from it', () => withWindow(({ window, events }) => {
  beginKeysSettling({ cloud: true, giveUpMs: 60_000 });
  keysLocalRead();
  assert.equal(keysSettled(), false, 'the sync may still bring the keys');
  keysCloudAnswered();
  assert.equal(keysSettled(), true);
  assert.deepEqual(events, ['settled']);

  beginKeysSettling({ cloud: true, giveUpMs: 60_000 });
  keysLocalRead();
  assert.equal(keysSettled(), false, 'a new sign-in starts again');
  window.dispatchEvent(new window.CustomEvent('astra:cloud-sensitive-config', { detail: {} }));
  assert.equal(keysSettled(), true, 'keys that arrive settle it too');
}));

test('a sync that never answers does not hide a missing key for ever', async () => withWindow(async ({ events }) => {
  beginKeysSettling({ cloud: true, giveUpMs: 10 });
  keysLocalRead();
  assert.equal(keysSettled(), false);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(keysSettled(), true);
  assert.deepEqual(events, ['settled']);
}));

test.after(() => window.close());
