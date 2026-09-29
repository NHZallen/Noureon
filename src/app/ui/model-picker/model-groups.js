// Two small lists the model picker keeps for the person, both in the saved
// settings: council groups (up to five named sets of member models with the model
// that combines them) and the models used lately (shown as "Recent").

export const GROUP_LIMIT = 5;
export const GROUP_NAME_LIMIT = 20;
export const RECENT_STORED = 8;
export const RECENT_SHOWN = 3;

const asId = (value) => (typeof value === 'string' && value ? value : '');

/**
 * Reads groups back from what was saved: known models only, no repeats, members
 * within the limit, names trimmed, at most five groups.
 */
export function normalizeCouncilGroups(value, { isKnownModel = () => true, canonicalizeModelId = (id) => id, maxMembers = 5 } = {}) {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set();
  const groups = [];
  for (const raw of value) {
    if (groups.length >= GROUP_LIMIT || !raw || typeof raw !== 'object') continue;
    let id = asId(raw.id) || `group-${groups.length + 1}`;
    while (seenIds.has(id)) id = `${id}-x`;
    seenIds.add(id);
    const members = [];
    for (const memberId of Array.isArray(raw.participantModelIds) ? raw.participantModelIds : []) {
      const canonical = canonicalizeModelId(asId(memberId));
      if (canonical && isKnownModel(canonical) && !members.includes(canonical) && members.length < maxMembers) members.push(canonical);
    }
    const combiner = canonicalizeModelId(asId(raw.synthesizerModelId));
    groups.push({
      id,
      name: String(raw.name ?? '').trim().slice(0, GROUP_NAME_LIMIT),
      participantModelIds: members,
      synthesizerModelId: combiner && isKnownModel(combiner) ? combiner : null
    });
  }
  return groups;
}

/** A new group id that no group has. */
export function newGroupId(groups) {
  const taken = new Set(groups.map((group) => group.id));
  let n = groups.length + 1;
  while (taken.has(`group-${n}`)) n += 1;
  return `group-${n}`;
}

/** The lowest "Group N" number not used as a name, so new groups never share a default name. */
export function nextGroupNumber(groups, defaultName) {
  const names = new Set(groups.map((group) => group.name));
  let n = 1;
  while (names.has(defaultName(n))) n += 1;
  return n;
}

/** Whether the council as set now is exactly this group: the same members and the same combiner. */
export function councilMatchesGroup(group, council) {
  if (!group || !council) return false;
  const now = council.participantModelIds || [];
  if (!group.participantModelIds.length || now.length !== group.participantModelIds.length) return false;
  if (!group.participantModelIds.every((id) => now.includes(id))) return false;
  return (group.synthesizerModelId || null) === (council.synthesizerModelId || null);
}

export function normalizeRecentModelIds(value, { isKnownModel = () => true, canonicalizeModelId = (id) => id } = {}) {
  if (!Array.isArray(value)) return [];
  const ids = [];
  for (const raw of value) {
    const id = canonicalizeModelId(asId(raw));
    if (id && isKnownModel(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, RECENT_STORED);
}

/** Models just used go to the front, once each, and the list stays short. */
export function noteModelsUsed(recent, usedIds) {
  const front = [];
  for (const id of usedIds) if (asId(id) && !front.includes(id)) front.push(id);
  const rest = (Array.isArray(recent) ? recent : []).filter((id) => !front.includes(id));
  return [...front, ...rest].slice(0, RECENT_STORED);
}

/** The three used most lately among the models on offer, with the one in use always among them. */
export function pickRecentModels(recent, availableIds, { current = null, count = RECENT_SHOWN } = {}) {
  const available = new Set(availableIds);
  const shown = (Array.isArray(recent) ? recent : []).filter((id) => available.has(id));
  const ordered = current && available.has(current) ? [current, ...shown.filter((id) => id !== current)] : shown;
  return ordered.slice(0, count);
}
