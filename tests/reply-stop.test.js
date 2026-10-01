import assert from 'node:assert/strict';
import test from 'node:test';

import { stopReplyAndWait } from '../src/app/runtime/features/reply-stop.js';

test('nothing running: nothing to wait for', async () => {
  assert.equal(await stopReplyAndWait({ getAbortController: () => null }), false);
});

test('the reply is aborted and waited for until its controller is cleared, which is after its last words were kept', async () => {
  const controller = new AbortController();
  let current = controller;
  let waits = 0;
  const done = await stopReplyAndWait({
    getAbortController: () => current,
    wait: async () => {
      waits += 1;
      if (waits === 3) current = null;
    }
  });
  assert.equal(done, true);
  assert.equal(controller.signal.aborted, true);
  assert.equal(waits, 3);
});

test('a reply that never finishes is not waited for forever, and a new reply that took its place is not waited for', async () => {
  const stuck = new AbortController();
  let waits = 0;
  await stopReplyAndWait({ getAbortController: () => stuck, wait: async () => { waits += 1; } });
  assert.equal(waits, 100);

  const first = new AbortController();
  const second = new AbortController();
  let calls = 0;
  waits = 0;
  await stopReplyAndWait({ getAbortController: () => (calls++ === 0 ? first : second), wait: async () => { waits += 1; } });
  assert.equal(waits, 0, 'another controller means the first reply is over');
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
});
