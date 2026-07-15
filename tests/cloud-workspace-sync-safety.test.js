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

test('main starts cloud workspace sync only after the local runtime becomes interactive', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const bootstrapQueueAt = source.indexOf('const cloudSyncBootstrapQueue =');
  const runtimeImportAt = source.indexOf("const legacyApp = await import('./app/legacy-app.js')");
  const runtimeAt = source.indexOf('STARTUP_MARKS.RUNTIME_INTERACTIVE');
  const syncAt = source.indexOf('initializeCloudWorkspaceSync({');
  const awaitedSyncAt = source.indexOf('await initializeCloudWorkspaceSync');

  assert.ok(bootstrapQueueAt >= 0);
  assert.ok(runtimeImportAt >= 0);
  assert.ok(runtimeAt >= 0);
  assert.ok(bootstrapQueueAt < runtimeImportAt);
  assert.ok(bootstrapQueueAt < runtimeAt);
  assert.ok(syncAt > runtimeAt);
  assert.equal(awaitedSyncAt, -1);
  assert.match(source, /bootstrapQueue:\s*cloudSyncBootstrapQueue/);
  assert.match(source, /window\.__astraCloudWorkspaceSyncReady\s*=\s*cloudSyncReady/);
});

test('cloud workspace passes asset transport into record-level conversation sync', async () => {
  const source = await readFile(new URL('../src/app/sync/cloud-workspace-sync.js', import.meta.url), 'utf8');
  const initializeAt = source.indexOf('initializeConversationShadowSync({');
  const closeAt = source.indexOf('});', initializeAt);
  const initializer = source.slice(initializeAt, closeAt);

  assert.ok(initializeAt >= 0);
  assert.match(initializer, /assetTransport:\s*assets/);
});

test('cloud config metadata and remote commits are serialized through the workspace lock', async () => {
  const source = await readFile(new URL('../src/app/sync/cloud-workspace-sync.js', import.meta.url), 'utf8');

  assert.match(source, /import\s+\{\s*withWorkspaceStorageExclusive\s*\}/);
  assert.match(source, /const\s+mutateMeta\s*=\s*mutator\s*=>\s*withWorkspaceStorageExclusive/);
  assert.match(source, /async\s+function\s+applyRemote[\s\S]*?await\s+withWorkspaceStorageExclusive/);
  assert.match(source, /async\s+function\s+upgradeSyncMetadata[\s\S]*?await\s+mutateMeta/);
  assert.doesNotMatch(source, /const\s+saveMeta\s*=/);
});

test('cloud remote snapshots reject stale fetches and independently retry deferred realtime work', async () => {
  const source = await readFile(new URL('../src/app/sync/cloud-workspace-sync.js', import.meta.url), 'utf8');

  assert.match(source, /const\s+requestEpoch\s*=\s*\+\+remoteWriteEpoch/);
  assert.match(source, /if\s*\(requestEpoch\s*===\s*remoteWriteEpoch\)\s*remote\s*=\s*data/);
  assert.match(source, /const\s+uploadEpoch\s*=\s*\+\+remoteWriteEpoch/);
  assert.match(source, /if\s*\(uploadEpoch\s*===\s*remoteWriteEpoch\)\s*remote\s*=\s*data/);
  assert.match(source, /remoteWriteEpoch\s*\+=\s*1;\s*remote\s*=\s*payload\.new/s);
  assert.match(source, /function\s+scheduleRemoteRefresh\(\)/);
  assert.match(source, /if\s*\(realtimeDeferred\)\s*scheduleRemoteRefresh\(\)/);
});

test('empty sensitive data can clear remote secrets while locked and vault rotation preserves upload order', async () => {
  const source = await readFile(new URL('../src/app/sync/cloud-workspace-sync.js', import.meta.url), 'utf8');
  const emptyAt = source.indexOf("if (!value || !hasApiKeys(value)) return null;");
  const unlockedKeyAt = source.indexOf('const key = getUnlockedSyncVaultKey(username);', emptyAt);

  assert.ok(emptyAt >= 0);
  assert.ok(unlockedKeyAt > emptyAt);
  assert.match(source, /if\s*\(rotation\s*\|\|\s*meta\.sensitive\?\.dirty\)\s*return undefined/);
  assert.match(source, /kind\s*===\s*'sensitive'[\s\S]*?storage\.removeItem\(rotationKey\)[\s\S]*?queueLocalChange\('vault'\)/);
});
