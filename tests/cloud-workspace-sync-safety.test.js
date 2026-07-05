import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CLOUD_SYNC_KINDS } from '../src/app/sync/cloud-workspace-sync.js';

test('workspace appData returns as a guarded cloud sync kind', () => {
  assert.deepEqual(Object.keys(CLOUD_SYNC_KINDS).sort(), ['appData', 'config', 'sensitive', 'vault']);
});

test('cloud workspace sync routes app_data through guarded merge helpers', async () => {
  const source = await readFile(new URL('../src/app/sync/cloud-workspace-sync.js', import.meta.url), 'utf8');

  assert.equal(source.includes('mergeWorkspaceAppDataForCloud'), true);
  assert.equal(source.includes('prepareWorkspaceAppDataForCloud'), true);
  assert.equal(source.includes('preserveLocalFolderUiState'), true);
  assert.equal(source.includes('assets.hydrate(remote.app_data)'), false);
});

