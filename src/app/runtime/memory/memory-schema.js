import { isExcludedLongTermTopic } from './topic-summaries.js';
import {
  normalizeMemoryEvidence,
  normalizeMemoryOverview,
  normalizeMemorySummary
} from './memory-summary-state.js';

// The new summary fields are additive. Retaining v2 keeps existing local data readable without a
// destructive schema migration while clients that understand the fields can start using them.
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
  const normalizedMemorySummary = memoryState.memorySummary && typeof memoryState.memorySummary === 'object'
    ? normalizeMemorySummary(memoryState.memorySummary, { now })
    : null;
  // Older clients stored the only visible layer in memorySummary. Preserve it
  // as a temporary overview, then let the user explicitly refresh the new
  // display layer from the complete memory summary.
  const normalizedMemoryOverview = memoryState.memoryOverview && typeof memoryState.memoryOverview === 'object'
    ? normalizeMemoryOverview(memoryState.memoryOverview, { now })
    : normalizedMemorySummary
      ? normalizeMemoryOverview({
        overview: normalizedMemorySummary.overview,
        sections: normalizedMemorySummary.sections,
        updatedAt: normalizedMemorySummary.updatedAt,
        lastModelId: normalizedMemorySummary.lastModelId,
        // There is no display refresh in flight during migration. Preserve the
        // old text as a stale cache and make the explicit refresh available.
        status: 'idle',
        lastError: '',
        needsRefresh: true,
        basedOnMemorySummaryUpdatedAt: ''
      }, { now })
      : null;

  return {
    version: MEMORY_SCHEMA_VERSION,
    profileEntries: asArray(memoryState.profileEntries)
      .map(entry => normalizeProfileEntry(entry, now))
      .filter(entry => entry.status !== 'superseded'),
    profileCandidates: asArray(memoryState.profileCandidates),
    resolvedProfileCandidateIds: asArray(memoryState.resolvedProfileCandidateIds).map(String),
    recentConversationStates: asArray(memoryState.recentConversationStates),
    mediaMemories: asArray(memoryState.mediaMemories),
    conversationCapsules: asArray(memoryState.conversationCapsules),
    longTermTopicSummaries: asArray(memoryState.longTermTopicSummaries)
      .filter(summary => !isExcludedLongTermTopic(summary)),
    // This is intentionally not a history log. Evidence stays internal so the visible summary can
    // remain concise and current while deleted conversations can still be reconciled safely.
    ...(normalizedMemorySummary
      ? { memorySummary: normalizedMemorySummary }
      : {}),
    ...(normalizedMemoryOverview ? { memoryOverview: normalizedMemoryOverview } : {}),
    ...(asArray(memoryState.memoryEvidence).length > 0
      ? { memoryEvidence: normalizeMemoryEvidence(memoryState.memoryEvidence, { now }) }
      : {}),
    resolvedTopicSummaryIds: asArray(memoryState.resolvedTopicSummaryIds).map(String),
    suppressionRules: asArray(memoryState.suppressionRules),
    legacyInbox: [...legacyInbox, ...legacyMemories.map(entry => migrateLegacyMemory(entry, now))]
  };
}
