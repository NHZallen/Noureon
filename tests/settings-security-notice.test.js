import assert from 'node:assert/strict';
import test from 'node:test';

import { createSecurityNotifier } from '../src/app/runtime/settings/settings-security-notice.js';

test('the notice goes to the server with the event and nothing else, and a failure of any kind holds nothing up', async () => {
  const calls = [];
  createSecurityNotifier({ request: async (method, path, options) => { calls.push([method, path, JSON.parse(options.body)]); return { ok: true }; } })('passkey-added');
  assert.deepEqual(calls, [['POST', '/v1/security-notice', { event: 'passkey-added' }]]);
  assert.doesNotThrow(() => createSecurityNotifier({ request: async () => { throw new Error('offline'); } })('passkey-added'));
  assert.doesNotThrow(() => createSecurityNotifier({ request: () => { throw new Error('sync failure'); } })('passkey-added'));
  await new Promise((resolve) => setTimeout(resolve, 5)); // no unhandled rejection is left behind
});
