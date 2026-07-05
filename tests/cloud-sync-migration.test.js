import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('cloud sync metadata version advances to repair snapshots created before three-way merging', async () => {
  const source = await readFile(new URL('../src/app/sync/cloud-workspace-sync.js', import.meta.url), 'utf8');

  assert.match(source, /const SYNC_META_VERSION = 3;/);
});
