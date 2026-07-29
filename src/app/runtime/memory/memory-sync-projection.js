const asArray = value => Array.isArray(value) ? value : [];

export const MEMORY_SYNC_VERSION = 1;

const isConfirmedProfile = entry => entry?.confirmedByUser === true;
const timestamp = value => Date.parse(value || '') || 0;
const latest = (left, right) => timestamp(left?.updatedAt) >= timestamp(right?.updatedAt) ? left : right;

const mergeById = (local = [], remote = []) => {
  const records = new Map();
  for (const item of [...local, ...remote]) {
    if (!item?.id) continue;
    records.set(item.id, records.has(item.id) ? latest(records.get(item.id), item) : item);
  }
  return [...records.values()];
};

const mergeIds = (local = [], remote = []) => [...new Set([
  ...asArray(local).map(String),
  ...asArray(remote).map(String)
])];

const ruleKey = rule => [rule?.id, rule?.type, rule?.target, rule?.scope].join(':');

const mergeRules = (local = [], remote = []) => {
  const rules = new Map();
  for (const rule of [...local, ...remote]) {
    if (!rule?.type || !rule?.target) continue;
    const key = ruleKey(rule);
    rules.set(key, rules.has(key) ? latest(rules.get(key), rule) : rule);
  }
  return [...rules.values()];
};

const summaryContentSignature = summary => JSON.stringify({
  overview: String(summary?.overview || '').trim(),
  sections: asArray(summary?.sections).map(section => ({
    key: String(section?.key || section?.id || '').trim(),
    title: String(section?.title || '').trim(),
    content: String(section?.content || '').trim(),
    state: String(section?.state || 'current-state').trim(),
    expiresAt: String(section?.expiresAt || '').trim(),
    authority: section?.authority === 'manual' ? 'manual' : 'automatic'
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
});

const hasDifferentSummaryContent = (left, right) => (
  summaryContentSignature(left) !== summaryContentSignature(right)
);

const hasVisibleOverviewContent = overview => Boolean(
  String(overview?.overview || '').trim()
  || asArray(overview?.sections).some(section => String(section?.content || '').trim())
);

const hasCompleteMemoryContent = summary => Boolean(
  String(summary?.overview || '').trim()
  || asArray(summary?.sections).some(section => String(section?.content || '').trim())
);

const mergeMemorySummary = (local, remote) => {
  if (!remote || typeof remote !== 'object') return local;
  if (!local || typeof local !== 'object') {
    return { ...remote, needsRefresh: false, status: 'idle', lastError: '' };
  }
  const preferred = timestamp(remote.updatedAt) >= timestamp(local.updatedAt) ? remote : local;
  const sectionsByKey = new Map();
  for (const section of [...asArray(local.sections), ...asArray(remote.sections)]) {
    const key = String(section?.key || section?.id || '').trim();
    if (!key) continue;
    const existing = sectionsByKey.get(key);
    if (!existing) {
      sectionsByKey.set(key, section);
      continue;
    }
    const existingManual = existing.authority === 'manual';
    const incomingManual = section.authority === 'manual';
    if ((incomingManual && !existingManual)
      || (incomingManual === existingManual && timestamp(section.updatedAt) >= timestamp(existing.updatedAt))) {
      sectionsByKey.set(key, section);
    }
  }
  return {
    ...preferred,
    sections: [...sectionsByKey.values()],
    // `needsRefresh` is device-local work state, never an authoritative
    // cloud field. A timestamp difference alone is normal during delta sync;
    // only actual memory-content disagreement requires reconciliation.
    needsRefresh: local.needsRefresh === true || hasDifferentSummaryContent(local, remote),
    status: 'idle',
    lastError: ''
  };
};

const mergeMemoryOverview = (local, remote, memorySummary) => {
  const withCanonicalFreshness = candidate => {
    if (!candidate || typeof candidate !== 'object') return candidate;
    return {
      ...candidate,
      // This layer is a user-visible cache of the complete memory. A device
      // that only has one copy still must not present it as current when that
      // copy was generated from an older complete-memory revision.
      needsRefresh: String(candidate.basedOnMemorySummaryUpdatedAt || '') !== String(memorySummary?.updatedAt || ''),
      status: candidate.status === 'pending' ? 'idle' : (candidate.status || 'idle'),
      lastError: candidate.status === 'failed' ? (candidate.lastError || '') : ''
    };
  };
  if (!remote || typeof remote !== 'object') return withCanonicalFreshness(local);
  if (!local || typeof local !== 'object') return withCanonicalFreshness(remote);
  // The visible overview is a cache, but it must never disappear merely
  // because a delayed/partial sync contains an empty layer.  Keep the last
  // usable local view while complete memory still exists; a genuine deletion
  // first clears complete memory, and is therefore still allowed to clear the
  // visible cache on every device.
  const preserveLocalContent = hasVisibleOverviewContent(local)
    && !hasVisibleOverviewContent(remote)
    && hasCompleteMemoryContent(memorySummary);
  const preferred = preserveLocalContent
    ? local
    : timestamp(remote.updatedAt) >= timestamp(local.updatedAt) ? remote : local;
  const sectionsByKey = new Map();
  for (const section of [...asArray(local.sections), ...asArray(remote.sections)]) {
    const key = String(section?.key || section?.id || '').trim();
    if (!key) continue;
    const existing = sectionsByKey.get(key);
    if (!existing) {
      sectionsByKey.set(key, section);
      continue;
    }
    const existingManual = existing.authority === 'manual';
    const incomingManual = section.authority === 'manual';
    if ((incomingManual && !existingManual)
      || (incomingManual === existingManual && timestamp(section.updatedAt) >= timestamp(existing.updatedAt))) {
      sectionsByKey.set(key, section);
    }
  }
  const basedOn = String(preferred.basedOnMemorySummaryUpdatedAt || '');
  return {
    ...preferred,
    sections: [...sectionsByKey.values()].slice(0, 6),
    // The overview is only a display cache. It needs an explicit refresh
    // precisely when it is based on an older complete-memory revision, not
    // when another device merely wrote the same view at a different time.
    needsRefresh: basedOn !== String(memorySummary?.updatedAt || ''),
    status: 'idle',
    lastError: ''
  };
};

export function projectMemoryStateForSync(memoryState = {}) {
  const resolvedProfileCandidateIds = mergeIds(memoryState.resolvedProfileCandidateIds);
  const resolvedIds = new Set(resolvedProfileCandidateIds);
  const resolvedTopicSummaryIds = mergeIds(memoryState.resolvedTopicSummaryIds);
  const resolvedTopicIds = new Set(resolvedTopicSummaryIds);
  return {
    version: MEMORY_SYNC_VERSION,
    profileEntries: asArray(memoryState.profileEntries).filter(isConfirmedProfile),
    profileCandidates: asArray(memoryState.profileCandidates)
      .filter(candidate => candidate?.id && !resolvedIds.has(String(candidate.id))),
    resolvedProfileCandidateIds,
    resolvedTopicSummaryIds,
    suppressionRules: asArray(memoryState.suppressionRules),
    longTermTopicSummaries: asArray(memoryState.longTermTopicSummaries)
      .filter(summary => summary?.id && !resolvedTopicIds.has(String(summary.id)))
  };
}

/**
 * This is deliberately limited to the small, legacy config projection. The
 * complete memory and user overview use their own record-level sync table so
 * changing one section never uploads the whole configuration blob.
 */
export function memorySyncProjectionEquals(left = {}, right = {}) {
  return JSON.stringify(projectMemoryStateForSync({
    ...left,
    ...(left?.version ? {} : { version: MEMORY_SYNC_VERSION })
  })) === JSON.stringify(projectMemoryStateForSync({
    ...right,
    ...(right?.version ? {} : { version: MEMORY_SYNC_VERSION })
  }));
}

export function mergeSyncedMemoryState(memoryState = {}, projection = {}) {
  if (projection?.version !== MEMORY_SYNC_VERSION) return memoryState;
  const resolvedProfileCandidateIds = mergeIds(
    memoryState.resolvedProfileCandidateIds,
    projection.resolvedProfileCandidateIds
  );
  const resolvedIds = new Set(resolvedProfileCandidateIds);
  const resolvedTopicSummaryIds = mergeIds(
    memoryState.resolvedTopicSummaryIds,
    projection.resolvedTopicSummaryIds
  );
  const resolvedTopicIds = new Set(resolvedTopicSummaryIds);
  const memorySummary = mergeMemorySummary(memoryState.memorySummary, projection.memorySummary);
  const memoryOverview = mergeMemoryOverview(
    memoryState.memoryOverview,
    projection.memoryOverview,
    memorySummary
  );
  return {
    ...memoryState,
    profileEntries: mergeById(memoryState.profileEntries, projection.profileEntries)
      .filter(isConfirmedProfile),
    profileCandidates: mergeById(memoryState.profileCandidates, projection.profileCandidates)
      .filter(candidate => !resolvedIds.has(String(candidate.id))),
    resolvedProfileCandidateIds,
    resolvedTopicSummaryIds,
    suppressionRules: mergeRules(memoryState.suppressionRules, projection.suppressionRules),
    longTermTopicSummaries: mergeById(
      memoryState.longTermTopicSummaries,
      projection.longTermTopicSummaries
    ).filter(summary => !resolvedTopicIds.has(String(summary.id))),
    memorySummary,
    memoryOverview
  };
}
