import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('cloud permanent delete uses the active shadow sync instead of username prefixes', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const cloudDeleteSource = readSource('src/app/runtime/legacy-core/cloud-delete-lifecycle.js');

  assert.match(legacyCoreSource, /import\(['"]\/src\/app\/runtime\/legacy-core\/cloud-delete-lifecycle\.js['"]\)/);
  assert.match(legacyCoreSource, /createCloudDeletionLifecycle\(/);
  assert.match(legacyCoreSource, /getCurrentUser:\s*\(\)\s*=>\s*shell\.currentUser/);
  assert.match(legacyCoreSource, /getConversations:\s*\(\)\s*=>\s*runtimeAppDataStore\.getConversations\(\)/);
  assert.match(legacyCoreSource, /getService\(SERVICES\.cloudSync\)/);
  assert.match(cloudDeleteSource, /getCurrentUser\?\.\(\)\?\.authProvider\s*===\s*['"]supabase['"]/);
  assert.match(cloudDeleteSource, /Cloud conversation sync is not ready yet/);
  assert.match(cloudDeleteSource, /Cloud conversation sync is disabled/);
  assert.match(cloudDeleteSource, /sync\.getStatus\?\.\(\)/);
  assert.match(cloudDeleteSource, /options\.requireSnapshots/);
  assert.match(cloudDeleteSource, /syncMethod:\s*['"]permanentlyDeleteConversations['"]/);
  assert.match(cloudDeleteSource, /payload\.requireSnapshots\s*=\s*Boolean\(options\.requireSnapshots\)/);
  assert.match(cloudDeleteSource, /await\s+sync\[syncMethod\]\(ids,\s*payload\)/);
  assert.doesNotMatch(cloudDeleteSource, /currentUser\?\.username/);
  assert.doesNotMatch(cloudDeleteSource, /startsWith\(['"]supabase:/);
});

test('local conversation saves preserve the shadow debounce boundary', () => {
  const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const observerSource = readSource('src/app/runtime/kernel/cloud-conversation-save-observer.js');

  assert.match(legacyCoreSource, /cloud-conversation-save-observer\.js/);
  assert.match(legacyCoreSource, /onSaved:\s*notifyCloudConversationSave/);
  assert.match(observerSource, /sync\?\.captureWorkspace\?\.\(snapshot,\s*metadata\s*\|\|\s*undefined\)/);
  assert.match(observerSource, /metadata\?\.immediate\s*!==\s*true/);
  assert.match(observerSource, /Promise\.resolve\(sync\.flush\(\)\)\.catch/);
  assert.match(observerSource, /return captured/);
});
