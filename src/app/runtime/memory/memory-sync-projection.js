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

const mergeMemorySummary = (local, remote) => {
  if (!remote || typeof remote !== 'object') return local;
  if (!local || typeof local !== 'object') return remote;
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
    // A remote and local summary can have been produced from different
    // conversation sets. Preserve all authoritative text now and ask the
    // normal background pipeline to reconcile automatic sections later.
    needsRefresh: local.needsRefresh === true || remote.needsRefresh === true
      || timestamp(local.updatedAt) !== timestamp(remote.updatedAt),
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
      needsRefresh: candidate.needsRefresh === true
        || String(candidate.basedOnMemorySummaryUpdatedAt || '') !== String(memorySummary?.updatedAt || ''),
      status: candidate.status === 'pending' ? 'idle' : (candidate.status || 'idle'),
      lastError: candidate.status === 'failed' ? (candidate.lastError || '') : ''
    };
  };
  if (!remote || typeof remote !== 'object') return withCanonicalFreshness(local);
  if (!local || typeof local !== 'object') return withCanonicalFreshness(remote);
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
  const basedOn = String(preferred.basedOnMemorySummaryUpdatedAt || '');
  return {
    ...preferred,
    sections: [...sectionsByKey.values()].slice(0, 6),
    // The overview is only a display cache. If devices disagree about either
    // its own revision or the complete memory it was based on, wait for the
    // user to press the explicit refresh button in Settings.
    needsRefresh: local.needsRefresh === true || remote.needsRefresh === true
      || timestamp(local.updatedAt) !== timestamp(remote.updatedAt)
      || basedOn !== String(memorySummary?.updatedAt || ''),
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
