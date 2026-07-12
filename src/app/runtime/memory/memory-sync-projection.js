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

export function projectMemoryStateForSync(memoryState = {}) {
  return {
    version: MEMORY_SYNC_VERSION,
    profileEntries: asArray(memoryState.profileEntries).filter(isConfirmedProfile),
    suppressionRules: asArray(memoryState.suppressionRules),
    longTermTopicSummaries: asArray(memoryState.longTermTopicSummaries)
  };
}

export function mergeSyncedMemoryState(memoryState = {}, projection = {}) {
  if (projection?.version !== MEMORY_SYNC_VERSION) return memoryState;
  return {
    ...memoryState,
    profileEntries: mergeById(memoryState.profileEntries, projection.profileEntries)
      .filter(isConfirmedProfile),
    suppressionRules: mergeRules(memoryState.suppressionRules, projection.suppressionRules),
    longTermTopicSummaries: mergeById(
      memoryState.longTermTopicSummaries,
      projection.longTermTopicSummaries
    )
  };
}
