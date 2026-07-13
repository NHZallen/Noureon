const asArray = value => Array.isArray(value) ? value : [];

const uniqueIds = values => [...new Set(asArray(values).filter(Boolean).map(String))];

const buildProfileEntry = ({
  id,
  content,
  kind = 'preference',
  extractionConfidence = null,
  sourceRefs = [],
  supersedes = [],
  now
} = {}) => {
  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) throw new TypeError('Manual memories require non-empty content.');
  if (!id) throw new TypeError('Manual memories require an id.');
  const identity = kind === 'identity';

  return {
    id,
    kind,
    content: normalizedContent,
    usePolicy: identity ? 'task-only' : 'response-style',
    mentionPolicy: identity ? 'only-on-request' : 'when-helpful',
    status: 'active',
    extractionConfidence,
    confirmedByUser: true,
    effectiveFrom: now,
    createdAt: now,
    updatedAt: now,
    supersedes,
    sourceRefs: asArray(sourceRefs)
  };
};

const hasSupersessionPath = (entriesById, fromId, targetId, visited = new Set()) => {
  if (fromId === targetId) return true;
  if (visited.has(fromId)) return false;
  visited.add(fromId);
  const entry = entriesById.get(fromId);
  return asArray(entry?.supersedes)
    .some(nextId => hasSupersessionPath(entriesById, nextId, targetId, visited));
};

const validateSupersession = (memoryState, { entryId, supersededEntryIds }) => {
  const targetIds = uniqueIds(supersededEntryIds);
  if (targetIds.includes(String(entryId))) {
    throw new TypeError('A profile entry cannot supersede itself.');
  }
  const entries = asArray(memoryState.profileEntries);
  const entriesById = new Map(entries.map(entry => [String(entry.id), entry]));
  if (entriesById.has(String(entryId))) {
    throw new TypeError('Profile entry ids must be unique.');
  }
  if (targetIds.length === 0) return targetIds;
  for (const targetId of targetIds) {
    const target = entriesById.get(targetId);
    if (!target) throw new TypeError('A superseded profile entry was not found.');
    if (target.status !== 'active' || target.confirmedByUser !== true) {
      throw new TypeError('Only active confirmed profile entries can be superseded.');
    }
    if (hasSupersessionPath(entriesById, targetId, String(entryId))) {
      throw new TypeError('Profile supersession chains must be acyclic.');
    }
  }
  return targetIds;
};

const addEntry = (memoryState, entry, supersededEntryIds, now) => ({
  ...memoryState,
  profileEntries: [
    ...asArray(memoryState.profileEntries)
      .filter(existing => !supersededEntryIds.includes(String(existing.id))),
    entry
  ]
});

export function addConfirmedProfileEntry(memoryState = {}, {
  id,
  content,
  supersededEntryIds = [],
  now = new Date().toISOString()
} = {}) {
  const supersedes = validateSupersession(memoryState, { entryId: id, supersededEntryIds });
  const entry = buildProfileEntry({ id, content, supersedes, now });
  return addEntry(memoryState, entry, supersedes, now);
}

export function approveProfileCandidate(memoryState = {}, {
  candidateId,
  profileEntryId,
  supersededEntryIds = [],
  now = new Date().toISOString()
} = {}) {
  const candidates = memoryState.profileCandidates || [];
  const candidate = candidates.find(item => item.id === candidateId);
  if (!candidate) throw new TypeError('Profile candidate was not found.');
  if (!profileEntryId) throw new TypeError('Approved profile candidates require a profile entry id.');
  const supersedes = validateSupersession(memoryState, {
    entryId: profileEntryId,
    supersededEntryIds
  });
  const entry = buildProfileEntry({
    id: profileEntryId,
    kind: candidate.kind || 'preference',
    content: candidate.content,
    extractionConfidence: candidate.extractionConfidence ?? null,
    sourceRefs: candidate.sourceRefs,
    supersedes,
    now
  });
  return {
    ...addEntry(memoryState, entry, supersedes, now),
    profileCandidates: candidates.filter(item => item.id !== candidateId),
    resolvedProfileCandidateIds: [
      ...new Set([...asArray(memoryState.resolvedProfileCandidateIds), String(candidateId)])
    ]
  };
}

export function removeProfileEntry(memoryState = {}, { entryId, now = new Date().toISOString() } = {}) {
  if (!entryId) throw new TypeError('Removing a profile entry requires an id.');
  const entries = asArray(memoryState.profileEntries);
  const entry = entries.find(item => item.id === entryId);
  if (!entry) return memoryState;

  return {
    ...memoryState,
    profileEntries: entries.filter(item => item.id !== entryId)
  };
}
