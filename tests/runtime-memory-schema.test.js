import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MEMORY_SCHEMA_VERSION,
  normalizeMemoryState
} from '../src/app/runtime/memory/memory-schema.js';

test('moves legacy personal memories into a non-active review inbox', () => {
  const state = normalizeMemoryState({
    personalMemories: [{
      id: 'legacy-name',
      content: '使用者叫 Allen',
      enabled: true
    }]
  }, {
    now: () => '2026-07-11T00:00:00.000Z'
  });

  assert.equal(state.version, MEMORY_SCHEMA_VERSION);
  assert.deepEqual(state.profileEntries, []);
  assert.equal(state.legacyInbox.length, 1);
  assert.deepEqual(state.legacyInbox[0], {
    id: 'legacy:legacy-name',
    legacyId: 'legacy-name',
    content: '使用者叫 Allen',
    enabled: true,
    status: 'review',
    createdAt: '2026-07-11T00:00:00.000Z'
  });
});

test('normalizes profile entries with safe identity defaults', () => {
  const state = normalizeMemoryState({
    memoryState: {
      version: MEMORY_SCHEMA_VERSION,
      profileEntries: [{
        id: 'profile-name',
        kind: 'identity',
        content: '使用者叫 Allen',
        confirmedByUser: true
      }]
    }
  }, {
    now: () => '2026-07-11T00:00:00.000Z'
  });

  assert.deepEqual(state.profileEntries, [{
    id: 'profile-name',
    kind: 'identity',
    content: '使用者叫 Allen',
    usePolicy: 'task-only',
    mentionPolicy: 'only-on-request',
    status: 'active',
    extractionConfidence: null,
    confirmedByUser: true,
    effectiveFrom: '2026-07-11T00:00:00.000Z',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    supersedes: [],
    sourceRefs: []
  }]);
});
