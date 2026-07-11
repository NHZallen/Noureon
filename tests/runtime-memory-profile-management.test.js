import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addConfirmedProfileEntry,
  approveProfileCandidate,
  removeProfileEntry
} from '../src/app/runtime/memory/memory-profile-management.js';

test('adds a user-confirmed preference without mutating the existing memory state', () => {
  const existing = {
    version: 2,
    profileEntries: [{ id: 'existing', content: '使用繁體中文回答' }],
    legacyInbox: []
  };

  const next = addConfirmedProfileEntry(existing, {
    id: 'new-entry',
    content: '回答先給結論，再補細節',
    now: '2026-07-11T12:00:00.000Z'
  });

  assert.equal(existing.profileEntries.length, 1);
  assert.deepEqual(next.profileEntries.at(-1), {
    id: 'new-entry',
    kind: 'preference',
    content: '回答先給結論，再補細節',
    usePolicy: 'response-style',
    mentionPolicy: 'when-helpful',
    status: 'active',
    extractionConfidence: null,
    confirmedByUser: true,
    effectiveFrom: '2026-07-11T12:00:00.000Z',
    createdAt: '2026-07-11T12:00:00.000Z',
    updatedAt: '2026-07-11T12:00:00.000Z',
    supersedes: [],
    sourceRefs: []
  });
});

test('refuses blank manual memories', () => {
  assert.throws(
    () => addConfirmedProfileEntry({ profileEntries: [] }, { id: 'blank', content: '   ' }),
    /non-empty content/
  );
});

test('moves an approved candidate into active profile memory with safe identity policies', () => {
  const next = approveProfileCandidate({
    profileEntries: [],
    profileCandidates: [{
      id: 'candidate-1',
      kind: 'identity',
      content: '使用者名字是 Allen',
      extractionConfidence: 0.9,
      sourceRefs: [{ messageId: 'user-1', role: 'user', claimType: 'candidate-source' }],
      createdAt: '2026-07-11T11:00:00.000Z'
    }]
  }, {
    candidateId: 'candidate-1',
    profileEntryId: 'profile-1',
    now: '2026-07-11T12:00:00.000Z'
  });

  assert.deepEqual(next.profileCandidates, []);
  assert.deepEqual(next.profileEntries, [{
    id: 'profile-1',
    kind: 'identity',
    content: '使用者名字是 Allen',
    usePolicy: 'task-only',
    mentionPolicy: 'only-on-request',
    status: 'active',
    extractionConfidence: 0.9,
    confirmedByUser: true,
    effectiveFrom: '2026-07-11T12:00:00.000Z',
    createdAt: '2026-07-11T12:00:00.000Z',
    updatedAt: '2026-07-11T12:00:00.000Z',
    supersedes: [],
    sourceRefs: [{ messageId: 'user-1', role: 'user', claimType: 'candidate-source' }]
  }]);
});

test('a newer confirmed preference supersedes the active predecessor and deletion restores it', () => {
  const state = {
    profileEntries: [{
      id: 'brief',
      kind: 'preference',
      content: 'Keep replies concise',
      status: 'active',
      confirmedByUser: true
    }]
  };
  const replaced = addConfirmedProfileEntry(state, {
    id: 'detailed',
    content: 'For this project, explain decisions in detail',
    supersededEntryIds: ['brief'],
    now: '2026-07-11T13:00:00.000Z'
  });

  assert.deepEqual(replaced.profileEntries.map(entry => ({ id: entry.id, status: entry.status, supersededBy: entry.supersededBy, supersedes: entry.supersedes })), [
    { id: 'brief', status: 'superseded', supersededBy: 'detailed', supersedes: undefined },
    { id: 'detailed', status: 'active', supersededBy: undefined, supersedes: ['brief'] }
  ]);
  const restored = removeProfileEntry(replaced, { entryId: 'detailed', now: '2026-07-11T14:00:00.000Z' });
  assert.deepEqual(restored.profileEntries, [{
    id: 'brief',
    kind: 'preference',
    content: 'Keep replies concise',
    status: 'active',
    confirmedByUser: true,
    supersededBy: null,
    updatedAt: '2026-07-11T14:00:00.000Z'
  }]);
});

test('supersession rejects missing or inactive predecessors', () => {
  assert.throws(
    () => addConfirmedProfileEntry({ profileEntries: [] }, {
      id: 'next',
      content: 'New preference',
      supersededEntryIds: ['missing']
    }),
    /not found/
  );
  assert.throws(
    () => addConfirmedProfileEntry({ profileEntries: [{ id: 'existing' }] }, {
      id: 'existing',
      content: 'Duplicate id'
    }),
    /unique/
  );
});
