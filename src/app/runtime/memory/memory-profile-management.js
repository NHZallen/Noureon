export function addConfirmedProfileEntry(memoryState = {}, {
  id,
  content,
  now = new Date().toISOString()
} = {}) {
  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) throw new TypeError('Manual memories require non-empty content.');
  if (!id) throw new TypeError('Manual memories require an id.');

  return {
    ...memoryState,
    profileEntries: [
      ...(memoryState.profileEntries || []),
      {
        id,
        kind: 'preference',
        content: normalizedContent,
        usePolicy: 'response-style',
        mentionPolicy: 'when-helpful',
        status: 'active',
        extractionConfidence: null,
        confirmedByUser: true,
        effectiveFrom: now,
        createdAt: now,
        updatedAt: now,
        supersedes: [],
        sourceRefs: []
      }
    ]
  };
}

export function approveProfileCandidate(memoryState = {}, {
  candidateId,
  profileEntryId,
  now = new Date().toISOString()
} = {}) {
  const candidates = memoryState.profileCandidates || [];
  const candidate = candidates.find(item => item.id === candidateId);
  if (!candidate) throw new TypeError('Profile candidate was not found.');
  if (!profileEntryId) throw new TypeError('Approved profile candidates require a profile entry id.');
  const identity = candidate.kind === 'identity';
  return {
    ...memoryState,
    profileEntries: [
      ...(memoryState.profileEntries || []),
      {
        id: profileEntryId,
        kind: candidate.kind || 'preference',
        content: String(candidate.content || '').trim(),
        usePolicy: identity ? 'task-only' : 'response-style',
        mentionPolicy: identity ? 'only-on-request' : 'when-helpful',
        status: 'active',
        extractionConfidence: candidate.extractionConfidence ?? null,
        confirmedByUser: true,
        effectiveFrom: now,
        createdAt: now,
        updatedAt: now,
        supersedes: [],
        sourceRefs: [...(candidate.sourceRefs || [])]
      }
    ],
    profileCandidates: candidates.filter(item => item.id !== candidateId)
  };
}
