import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CLOUD_SYNC_KINDS } from '../src/app/sync/cloud-workspace-sync.js';

test('workspace appData is disabled while record-level sync is unfinished', () => {
  assert.deepEqual(Object.keys(CLOUD_SYNC_KINDS).sort(), ['config', 'sensitive', 'vault']);
});

test('cloud workspace sync cannot hydrate, upload, or queue monolithic app_data', async () => {
  const source = await readFile(new URL('../src/app/sync/cloud-workspace-sync.js', import.meta.url), 'utf8');

  assert.equal(source.includes("appData: { column: 'app_data'"), false);
  assert.equal(source.includes("queueLocalChange('appData')"), false);
  assert.equal(source.includes("dispatchEvent(new window.CustomEvent('astra:cloud-app-data'"), false);
  assert.equal(source.includes("'app_data',"), false);
});

test('cloud workspace initialization awaits the conversation shadow commit before returning', async () => {
  const source = await readFile(new URL('../src/app/sync/cloud-workspace-sync.js', import.meta.url), 'utf8');
  const initializeAt = source.indexOf('initializeConversationShadowSync({');
  const awaitAt = source.indexOf('await conversationShadowSync.ready;', initializeAt);
  const returnAt = source.indexOf('return api;', initializeAt);

  assert.ok(initializeAt >= 0);
  assert.ok(awaitAt > initializeAt);
  assert.ok(returnAt > awaitAt);
});

