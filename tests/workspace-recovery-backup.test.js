import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureWorkspaceRecoveryBackup,
  getWorkspaceRecoveryBackupKey
} from '../src/app/sync/workspace-recovery-backup.js';

test('recovery backup copies the exact app-data JSON once', async () => {
  const values = new Map([['app-data', '{"conversations":[{"id":"c1"}]}']]);
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value)
  };

  const created = await ensureWorkspaceRecoveryBackup({
    storage,
    username: 'supabase:user-1',
    appDataKey: 'app-data',
    now: () => '2026-07-05T15:00:00.000Z'
  });

  assert.equal(created, true);
  assert.deepEqual(JSON.parse(values.get(getWorkspaceRecoveryBackupKey('supabase:user-1'))), {
    version: 1,
    createdAt: '2026-07-05T15:00:00.000Z',
    sourceKey: 'app-data',
    appDataJson: '{"conversations":[{"id":"c1"}]}'
  });

  values.set('app-data', '{"conversations":[]}');
  assert.equal(await ensureWorkspaceRecoveryBackup({
    storage,
    username: 'supabase:user-1',
    appDataKey: 'app-data'
  }), false);
  assert.match(values.get(getWorkspaceRecoveryBackupKey('supabase:user-1')), /c1/);
});

