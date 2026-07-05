import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CLOUD_SYNC_KINDS } from '../src/app/sync/cloud-workspace-sync.js';

test('legacy appData is not an active cloud sync kind', () => {
  assert.deepEqual(Object.keys(CLOUD_SYNC_KINDS).sort(), ['config', 'sensitive', 'vault']);
});

test('cloud workspace sync no longer hydrates, uploads, or queues legacy app_data', async () => {
  const source = await readFile(new URL('../src/app/sync/cloud-workspace-sync.js', import.meta.url), 'utf8');

  assert.equal(source.includes('remote?.app_data'), false);
  assert.equal(source.includes('assets.hydrate(remote.app_data)'), false);
  assert.equal(source.includes("pending.add('appData')"), false);
});

