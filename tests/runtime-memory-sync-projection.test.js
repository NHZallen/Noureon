import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import {
  mergeSyncedMemoryState,
  projectMemoryStateForSync
} from '../src/app/runtime/memory/memory-sync-projection.js';
import { HISTORY_RECALL_DEVICE_CONSENT_KEY } from '../src/app/runtime/memory/device-history-recall-consent.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test('cross-conversation recall consent stays on the device and never enters the sync projection', () => {
  const projection = projectMemoryStateForSync({
    profileEntries: [{ id: 'confirmed', confirmedByUser: true }],
    historyRecallDeviceConsent: { grantedAt: '2026-07-20T00:00:00.000Z' },
    [HISTORY_RECALL_DEVICE_CONSENT_KEY]: { grantedAt: '2026-07-20T00:00:00.000Z' }
  });

  const serialized = JSON.stringify(projection);
  assert.ok(!serialized.includes(HISTORY_RECALL_DEVICE_CONSENT_KEY), 'consent key must not be projected');
  assert.ok(!serialized.includes('grantedAt'), 'consent grant must not be projected');
  assert.ok(!('historyRecallDeviceConsent' in projection));

  // The consent record is written through a device-local storage adapter only. Nothing in the
  // sync projection module should reference it, so a second device must consent for itself.
  const projectionSource = readFileSync(projectFile('src/app/runtime/memory/memory-sync-projection.js'), 'utf8');
  assert.ok(!projectionSource.includes('history-recall'), 'sync projection must not reach for recall consent');
  assert.ok(!projectionSource.includes('Consent'), 'sync projection must not reach for recall consent');
});

test('sync projection includes unresolved candidates while excluding capsules and recent state', () => {
  const projection = projectMemoryStateForSync({
    profileEntries: [
      { id: 'confirmed', confirmedByUser: true },
      { id: 'candidate', confirmedByUser: false }
    ],
    suppressionRules: [{ type: 'do-not-mention', target: 'profile-name' }],
    longTermTopicSummaries: [{ id: 'topic-1', summary: 'A durable topic' }],
    profileCandidates: [{ id: 'review', content: 'Keep' }, { id: 'dismissed', content: 'Drop' }],
    resolvedProfileCandidateIds: ['dismissed'],
    resolvedTopicSummaryIds: [],
    conversationCapsules: [{ id: 'capsule' }],
    recentConversationStates: [{ conversationId: 'chat' }]
  });

  assert.deepEqual(projection, {
    version: 1,
    profileEntries: [{ id: 'confirmed', confirmedByUser: true }],
    profileCandidates: [{ id: 'review', content: 'Keep' }],
    resolvedProfileCandidateIds: ['dismissed'],
    resolvedTopicSummaryIds: [],
    suppressionRules: [{ type: 'do-not-mention', target: 'profile-name' }],
    longTermTopicSummaries: [{ id: 'topic-1', summary: 'A durable topic' }]
  });
});

test('merges confirmed preferences and candidates without replacing local-only index inputs', () => {
  const merged = mergeSyncedMemoryState({
    profileEntries: [{ id: 'language', confirmedByUser: true, content: 'English', updatedAt: '2026-01-01' }],
    conversationCapsules: [{ id: 'local-capsule' }],
    profileCandidates: [{ id: 'local-review' }, { id: 'resolved-remote' }],
    resolvedProfileCandidateIds: [],
    resolvedTopicSummaryIds: []
  }, {
    version: 1,
    profileEntries: [{ id: 'language', confirmedByUser: true, content: 'Traditional Chinese', updatedAt: '2026-07-11' }],
    profileCandidates: [{ id: 'remote-review' }],
    resolvedProfileCandidateIds: ['resolved-remote'],
    resolvedTopicSummaryIds: [],
    suppressionRules: [],
    longTermTopicSummaries: []
  });

  assert.equal(merged.profileEntries[0].content, 'Traditional Chinese');
  assert.deepEqual(merged.conversationCapsules, [{ id: 'local-capsule' }]);
  assert.deepEqual(merged.profileCandidates, [{ id: 'local-review' }, { id: 'remote-review' }]);
  assert.deepEqual(merged.resolvedProfileCandidateIds, ['resolved-remote']);
});
