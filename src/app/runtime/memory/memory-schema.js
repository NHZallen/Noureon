export const MEMORY_SCHEMA_VERSION = 2;

const asArray = (value) => Array.isArray(value) ? value : [];

const asIsoDate = (value, now) => (
  typeof value === 'string' && value ? value : now()
);

const normalizeProfileEntry = (entry = {}, now) => {
  const kind = entry.kind || 'preference';
  const identity = kind === 'identity';
  const createdAt = asIsoDate(entry.createdAt, now);

  return {
    id: String(entry.id || crypto.randomUUID()),
    kind,
    content: String(entry.content || ''),
    usePolicy: entry.usePolicy || (identity ? 'task-only' : 'response-style'),
    mentionPolicy: entry.mentionPolicy || (identity ? 'only-on-request' : 'when-helpful'),
    status: entry.status || 'active',
    extractionConfidence: entry.extractionConfidence ?? null,
    confirmedByUser: Boolean(entry.confirmedByUser),
    effectiveFrom: asIsoDate(entry.effectiveFrom, now),
    createdAt,
    updatedAt: asIsoDate(entry.updatedAt, now),
    supersedes: asArray(entry.supersedes),
    ...(entry.supersededBy ? { supersededBy: String(entry.supersededBy) } : {}),
    sourceRefs: asArray(entry.sourceRefs)
  };
};

const migrateLegacyMemory = (entry = {}, now) => ({
  id: `legacy:${String(entry.id || crypto.randomUUID())}`,
  legacyId: String(entry.id || ''),
  content: String(entry.content || ''),
  enabled: Boolean(entry.enabled),
  status: 'review',
  createdAt: now()
});

export function normalizeMemoryState(raw = {}, { now = () => new Date().toISOString() } = {}) {
  const memoryState = raw.memoryState && typeof raw.memoryState === 'object'
    ? raw.memoryState
    : {};
  const legacyInbox = asArray(memoryState.legacyInbox);
  const legacyMemories = memoryState.version === MEMORY_SCHEMA_VERSION
    ? []
    : asArray(raw.personalMemories);

  return {
    version: MEMORY_SCHEMA_VERSION,
    profileEntries: asArray(memoryState.profileEntries)
      .map(entry => normalizeProfileEntry(entry, now)),
    profileCandidates: asArray(memoryState.profileCandidates),
    recentConversationStates: asArray(memoryState.recentConversationStates),
    mediaMemories: asArray(memoryState.mediaMemories),
    conversationCapsules: asArray(memoryState.conversationCapsules),
    longTermTopicSummaries: asArray(memoryState.longTermTopicSummaries),
    suppressionRules: asArray(memoryState.suppressionRules),
    memoryUsageRecords: asArray(memoryState.memoryUsageRecords),
    legacyInbox: [...legacyInbox, ...legacyMemories.map(entry => migrateLegacyMemory(entry, now))]
  };
}
