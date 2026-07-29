import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import {
  mergeSyncedMemoryState,
  projectMemoryStateForSync
} from '../src/app/runtime/memory/memory-sync-projection.js';
import {
  decodeMemorySummaryRecords,
  diffMemorySummaryRecords,
  mergeMemoryStateWithSummaryRecords,
  projectMemorySummaryRecords
} from '../src/app/runtime/memory/memory-summary-records.js';
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

test('moves complete memory and its separate visible overview to record-level sync without raw evidence', () => {
  const localSummary = {
    version: 1,
    overview: 'Use a NUC for the local workload.',
    sections: [{ id: 'local', key: 'deployment', title: 'Deployment', content: 'NUC', updatedAt: '2026-07-28T00:00:00.000Z' }],
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const remoteSummary = {
    version: 1,
    overview: 'Use the NUC for the local workload; keep VPS services lightweight.',
    sections: [{ id: 'remote', key: 'deployment', title: 'Deployment', content: 'NUC for local workload', updatedAt: '2026-07-29T00:00:00.000Z' }],
    updatedAt: '2026-07-29T00:00:00.000Z'
  };
  const localOverview = {
    version: 1,
    overview: 'Older display overview.',
    sections: [{ id: 'local-overview', key: 'deployment', title: 'Deployment', content: 'NUC', updatedAt: '2026-07-28T00:00:00.000Z' }],
    basedOnMemorySummaryUpdatedAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
  const remoteOverview = {
    version: 1,
    overview: 'Current display overview.',
    sections: [{ id: 'remote-overview', key: 'deployment', title: 'Deployment', content: 'NUC for local workload', updatedAt: '2026-07-29T00:00:00.000Z' }],
    basedOnMemorySummaryUpdatedAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z'
  };
  const projection = projectMemoryStateForSync({
    memorySummary: remoteSummary,
    memoryOverview: remoteOverview,
    memoryEvidence: [{ conversationId: 'chat', messageId: 'm', content: 'Private raw evidence' }]
  });
  const records = projectMemorySummaryRecords({
    memorySummary: remoteSummary,
    memoryOverview: remoteOverview,
    memoryEvidence: [{ conversationId: 'chat', messageId: 'm', content: 'Private raw evidence' }]
  });
  const merged = mergeMemoryStateWithSummaryRecords({
    memorySummary: localSummary,
    memoryOverview: localOverview,
    memoryEvidence: [{ conversationId: 'local-chat', messageId: 'local-message', content: 'Keep this local' }]
  }, records);

  assert.equal(projection.memorySummary, undefined);
  assert.equal(projection.memoryOverview, undefined);
  assert.ok(!JSON.stringify(projection).includes('Private raw evidence'));
  assert.ok(!JSON.stringify(records).includes('Private raw evidence'));
  assert.equal(records.length, 4, 'each layer has one meta record and one section record');
  assert.equal(decodeMemorySummaryRecords(records).memorySummary.sections[0].content, 'NUC for local workload');
  assert.equal(merged.memorySummary.sections[0].content, 'NUC for local workload');
  assert.equal(merged.memorySummary.needsRefresh, true);
  assert.deepEqual(merged.memoryEvidence, [{ conversationId: 'local-chat', messageId: 'local-message', content: 'Keep this local' }]);
  assert.equal(merged.memoryOverview.overview, 'Current display overview.');
  assert.equal(merged.memoryOverview.needsRefresh, true, 'conflicting device revisions require an explicit display refresh');
});

test('a changed memory section uploads only that section and the small summary metadata record', () => {
  const initial = {
    memorySummary: {
      overview: 'Current setup.', updatedAt: '2026-07-29T00:00:00.000Z', sections: [
        { id: 'deploy', key: 'deployment', title: 'Deployment', content: 'NUC', updatedAt: '2026-07-29T00:00:00.000Z' },
        { id: 'style', key: 'style', title: 'Style', content: 'Concise', updatedAt: '2026-07-29T00:00:00.000Z' }
      ]
    }
  };
  const initialRecords = projectMemorySummaryRecords(initial);
  const manifest = Object.fromEntries(initialRecords.map(record => [
    record.record_key,
    // A first diff gives us the production manifest without putting text in it.
    diffMemorySummaryRecords({ records: [record] }).manifest[record.record_key]
  ]));
  const changedState = {
    memorySummary: {
      ...initial.memorySummary,
      updatedAt: '2026-07-30T00:00:00.000Z',
      sections: [
        { ...initial.memorySummary.sections[0], content: 'VPS', updatedAt: '2026-07-30T00:00:00.000Z' },
        initial.memorySummary.sections[1]
      ]
    }
  };
  const delta = diffMemorySummaryRecords({
    records: projectMemorySummaryRecords(changedState),
    manifest
  });

  assert.deepEqual(delta.changed.map(record => record.record_key).sort(), [
    'summary:meta',
    'summary:section:deploy'
  ]);
  assert.equal(delta.changed.some(record => JSON.stringify(record).includes('Concise')), false);
});

test('removing a memory section emits one tombstone instead of re-uploading the remaining records', () => {
  const before = projectMemorySummaryRecords({
    memorySummary: {
      updatedAt: '2026-07-29T00:00:00.000Z', sections: [
        { id: 'keep', title: 'Keep', content: 'Keep', updatedAt: '2026-07-29T00:00:00.000Z' },
        { id: 'remove', title: 'Remove', content: 'Remove', updatedAt: '2026-07-29T00:00:00.000Z' }
      ]
    }
  });
  const manifest = diffMemorySummaryRecords({ records: before }).manifest;
  const after = projectMemorySummaryRecords({
    memorySummary: {
      updatedAt: '2026-07-29T00:00:00.000Z', sections: [
        { id: 'keep', title: 'Keep', content: 'Keep', updatedAt: '2026-07-29T00:00:00.000Z' }
      ]
    }
  });
  const { changed } = diffMemorySummaryRecords({ records: after, manifest, now: () => '2026-07-30T00:00:00.000Z' });

  assert.deepEqual(changed, [{
    record_key: 'summary:section:remove',
    layer: 'summary',
    record_type: 'section',
    payload: {},
    updated_at: '2026-07-30T00:00:00.000Z',
    deleted_at: '2026-07-30T00:00:00.000Z'
  }]);
});

test('marks a one-sided synced overview stale when its complete memory is newer', () => {
  const merged = mergeSyncedMemoryState({
    memorySummary: {
      overview: 'New complete memory.', sections: [], updatedAt: '2026-07-29T00:00:00.000Z'
    }
  }, {
    version: 1,
    memoryOverview: {
      overview: 'Old visible overview.', sections: [],
      basedOnMemorySummaryUpdatedAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z'
    }
  });

  assert.equal(merged.memoryOverview.needsRefresh, true);
});

test('sync merge preserves a local manual summary edit over a newer automatic remote section', () => {
  const merged = mergeSyncedMemoryState({
    memorySummary: {
      overview: 'Use the NUC.',
      updatedAt: '2026-07-28T00:00:00.000Z',
      sections: [{ key: 'deployment', title: 'Deployment', content: 'Use the NUC.', authority: 'manual', updatedAt: '2026-07-28T00:00:00.000Z' }]
    }
  }, {
    version: 1,
    memorySummary: {
      overview: 'Use the VPS.',
      updatedAt: '2026-07-29T00:00:00.000Z',
      sections: [{ key: 'deployment', title: 'Deployment', content: 'Use the VPS.', authority: 'automatic', updatedAt: '2026-07-29T00:00:00.000Z' }]
    }
  });

  assert.equal(merged.memorySummary.sections[0].content, 'Use the NUC.');
  assert.equal(merged.memorySummary.sections[0].authority, 'manual');
  assert.equal(merged.memorySummary.needsRefresh, true);
});
