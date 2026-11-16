import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserLiveHandler } from '../src/app/runtime/reply/browser-live-handler.js';

test('with no run of the server, or no session, nothing is connected', () => {
  const handler = createBrowserLiveHandler({ getRun: () => null, getDocument: () => ({}) });
  assert.equal(handler({}, 'b0123456789abcdef'), undefined);
  const withRun = createBrowserLiveHandler({ getRun: () => ({ api: () => {} }), getDocument: () => ({}) });
  assert.equal(withRun({}, ''), undefined);
});
