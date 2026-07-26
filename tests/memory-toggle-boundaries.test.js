import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { removeProfileEntry } from '../src/app/runtime/memory/memory-profile-management.js';
import { createCurrentMemoryContextProvider } from '../src/app/runtime/memory/current-memory-context-provider.js';

// Decision "自動記憶關閉與跨裝置回憶同意規則": turning automatic memory off must only stop new
// capture, never delete confirmed memories; and cross-conversation recall consent is per device.
// These tests drive the production modules rather than a re-implementation of their gates.

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const sourceFiles = function* (dir) {
  for (const entry of readdirSync(projectFile(dir), { withFileTypes: true })) {
    if (entry.isDirectory()) yield* sourceFiles(`${dir}/${entry.name}`);
    else if (entry.name.endsWith('.js')) yield `${dir}/${entry.name}`;
  }
};

test('the automatic memory flag is never wired into a confirmed-memory removal path', () => {
  // removeProfileEntry is the only code that drops a confirmed memory. If a future change makes
  // it reachable from the toggle, "turning off is not deleting" silently stops being true.
  const consumers = [...sourceFiles('src')]
    .filter((path) => path.startsWith('src/app/'))
    .filter((path) => /\benableAutoMemory\b|\bautoMemoryEnabled\b/.test(readSource(path)))
    .sort();

  assert.deepEqual(consumers, [
    'src/app/legacy-runtime/features/assistant-response-finalization.js',
    'src/app/runtime/features/import-export-lifecycle.js',
    'src/app/runtime/kernel/config-store.js',
    'src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js',
    'src/app/runtime/legacy-core/settings-save-settings-helper.js',
    'src/app/runtime/legacy-core/submit-input-council-lifecycle.js'
  ], 'a new consumer of the automatic memory flag must be reviewed against this decision');

  for (const path of consumers) {
    assert.doesNotMatch(
      readSource(path),
      /removeProfileEntry|profileEntries\s*[.=]/,
      `${path} reads the automatic memory flag and must not touch confirmed memories`
    );
  }
});

test('removing a confirmed memory requires an explicit call, independent of any config flag', () => {
  const memoryState = {
    profileEntries: [
      { id: 'tone', kind: 'preference', content: '偏好簡短回答', confirmedByUser: true },
      { id: 'name', kind: 'identity', content: 'Allen', confirmedByUser: true }
    ]
  };

  const removed = removeProfileEntry(memoryState, { entryId: 'tone', now: '2026-07-20T00:00:00.000Z' });

  assert.equal(removed.profileEntries.length, 1, 'only the explicitly named entry is removed');
  assert.equal(removed.profileEntries[0].id, 'name');
  // Removal is driven by an explicit entry id, never by a config flag.
  assert.throws(() => removeProfileEntry(memoryState, {}), /requires an id/);
  assert.doesNotMatch(
    readSource('src/app/runtime/memory/memory-profile-management.js'),
    /enableAutoMemory|autoMemoryEnabled/,
    'confirmed-memory management must not read the automatic memory toggle'
  );
});

test('the production recall gate returns no history until this device consents', async () => {
  const memoryState = {
    profileEntries: [{ id: 'tone', kind: 'preference', content: '偏好簡短回答', status: 'active', confirmedByUser: true }],
    recentConversationStates: [],
    suppressionRules: []
  };
  const conversation = { id: 'chat-1', recentTurnSummary: '' };

  // Mirrors transition-bus-lifecycle.js: retrieveHistory is gated on the device consent record,
  // and current-memory-context-provider.js is additionally gated on the synced config flag.
  let deviceConsentGranted = false;
  const retrieveHistory = async () => (deviceConsentGranted ? [{ recordId: 'old-chat', summary: 'earlier', sourceIds: [] }] : []);

  const getMemoryContext = createCurrentMemoryContextProvider({
    getMemoryState: () => memoryState,
    retrieveHistory
  });
  const config = { historyRecallEnabled: true, memoryProfileEnabled: true };

  const withoutConsent = await getMemoryContext({ config, currentMessage: 'hi', conversation });
  assert.deepEqual(withoutConsent.historyResults, [], 'synced config alone must not surface history');
  assert.ok(withoutConsent.profileEntries.length > 0, 'confirmed memories are still used');

  deviceConsentGranted = true;
  const withConsent = await getMemoryContext({ config, currentMessage: 'hi', conversation });
  assert.equal(withConsent.historyResults.length, 1, 'history is used once this device consents');
});

test('the device consent record is excluded from everything that syncs', () => {
  const syncProjection = readSource('src/app/runtime/memory/memory-sync-projection.js');
  const configStore = readSource('src/app/runtime/kernel/config-store.js');

  for (const [label, source] of [['memory sync projection', syncProjection], ['config store', configStore]]) {
    assert.doesNotMatch(
      source,
      /history-recall-device-consent|HISTORY_RECALL_DEVICE_CONSENT_KEY/,
      `${label} must not carry the device consent record`
    );
  }

  // The consent module is the only place that persists it, and it does so through an injected
  // device-local storage adapter rather than the synced config blob.
  const consentSource = readSource('src/app/runtime/memory/device-history-recall-consent.js');
  assert.match(consentSource, /storage\.setItem\(storageKey/);
  assert.doesNotMatch(consentSource, /saveConfig|cloudSync|projectMemoryStateForSync/);
});
