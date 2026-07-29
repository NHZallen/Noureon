const asArray = value => Array.isArray(value) ? value : [];

export const MEMORY_SUMMARY_VERSION = 1;
export const MEMORY_OVERVIEW_VERSION = 1;
export const MEMORY_SUMMARY_SECTION_STATES = new Set([
  'current-state',
  'preference-or-constraint',
  'exploration',
  'temporary-state',
  'question'
]);

const asString = value => String(value || '').trim();
const uniqueStrings = values => [...new Set(asArray(values).map(asString).filter(Boolean))];
const timestamp = value => Date.parse(value || '') || 0;

const normalizeSection = (section = {}, now) => {
  const title = asString(section.title);
  const content = asString(section.content);
  const state = MEMORY_SUMMARY_SECTION_STATES.has(section.state)
    ? section.state
    : 'current-state';
  const updatedAt = asString(section.updatedAt) || now();
  const expiresAt = asString(section.expiresAt);

  return {
    id: asString(section.id) || `memory-summary:${crypto.randomUUID()}`,
    key: asString(section.key) || title.toLocaleLowerCase(),
    title: title || 'Memory',
    content,
    state,
    sourceConversationIds: uniqueStrings(section.sourceConversationIds),
    sourceMessageIds: uniqueStrings(section.sourceMessageIds),
    authority: section.authority === 'manual' ? 'manual' : 'automatic',
    createdAt: asString(section.createdAt) || updatedAt,
    updatedAt,
    ...(Number.isFinite(Date.parse(expiresAt)) ? { expiresAt } : {})
  };
};

export function normalizeMemorySummary(raw = {}, { now = () => new Date().toISOString() } = {}) {
  const updatedAt = asString(raw.updatedAt) || now();
  const currentTime = timestamp(now());
  const sections = asArray(raw.sections)
    .map(section => normalizeSection(section, now))
    .filter(section => section.content)
    .filter(section => section.authority === 'manual'
      || section.state !== 'temporary-state'
      || !section.expiresAt
      || timestamp(section.expiresAt) > currentTime);

  return {
    version: MEMORY_SUMMARY_VERSION,
    // An overview has no independent evidence. It is shown only alongside at
    // least one currently valid section, so an expired/removed state cannot
    // linger as a free-floating sentence.
    overview: sections.length > 0 ? asString(raw.overview) : '',
    sections,
    updatedAt,
    status: ['idle', 'pending', 'blocked', 'failed'].includes(raw.status) ? raw.status : 'idle',
    lastError: asString(raw.lastError),
    lastModelId: asString(raw.lastModelId),
    needsRefresh: Boolean(raw.needsRefresh)
  };
}

/**
 * The overview is deliberately a second layer. `memorySummary` is the
 * complete current-state memory the model can use; `memoryOverview` is the
 * shorter, user-facing summary of that memory shown in Settings.
 */
export function normalizeMemoryOverview(raw = {}, { now = () => new Date().toISOString() } = {}) {
  const updatedAt = asString(raw.updatedAt) || now();
  const sections = asArray(raw.sections)
    .map(section => normalizeSection(section, now))
    .filter(section => section.content)
    .slice(0, 6);
  return {
    version: MEMORY_OVERVIEW_VERSION,
    overview: asString(raw.overview),
    sections,
    updatedAt,
    status: ['idle', 'pending', 'blocked', 'failed'].includes(raw.status) ? raw.status : 'idle',
    lastError: asString(raw.lastError),
    lastModelId: asString(raw.lastModelId),
    needsRefresh: Boolean(raw.needsRefresh),
    basedOnMemorySummaryUpdatedAt: asString(raw.basedOnMemorySummaryUpdatedAt)
  };
}

// A message is stable even when the surrounding conversation changes. Do not
// include the conversation snapshot hash here, otherwise every later turn
// would duplicate the same user evidence under a new hash.
const evidenceKey = evidence => [
  asString(evidence?.conversationId),
  asString(evidence?.messageId)
].join(':');

export function normalizeMemoryEvidence(records = [], { now = () => new Date().toISOString() } = {}) {
  const deduplicated = new Map();
  for (const record of asArray(records)) {
    const conversationId = asString(record?.conversationId);
    const messageId = asString(record?.messageId);
    const content = asString(record?.content);
    if (!conversationId || !messageId || !content) continue;
    const normalized = {
      id: asString(record.id) || `memory-evidence:${crypto.randomUUID()}`,
      conversationId,
      messageId,
      sourceHash: asString(record.sourceHash),
      content,
      state: MEMORY_SUMMARY_SECTION_STATES.has(record.state) ? record.state : 'current-state',
      createdAt: asString(record.createdAt) || now(),
      updatedAt: asString(record.updatedAt) || now()
    };
    const key = evidenceKey(normalized);
    const existing = deduplicated.get(key);
    if (!existing || timestamp(normalized.updatedAt) >= timestamp(existing.updatedAt)) {
      deduplicated.set(key, normalized);
    }
  }
  return [...deduplicated.values()];
}

const sectionSources = section => new Set([
  ...uniqueStrings(section?.sourceConversationIds),
  ...uniqueStrings(section?.sourceMessageIds)
]);

const mergeSection = ({ existing, incoming, now, createId }) => {
  const automatic = normalizeSection(incoming, now);
  if (existing?.authority === 'manual') {
    // A direct user edit is authoritative. New automatic evidence can be attached for future
    // reconciliation but it must never rewrite the text the user explicitly supplied.
    return {
      ...existing,
      sourceConversationIds: uniqueStrings([
        ...existing.sourceConversationIds,
        ...automatic.sourceConversationIds
      ]),
      sourceMessageIds: uniqueStrings([
        ...existing.sourceMessageIds,
        ...automatic.sourceMessageIds
      ])
    };
  }
  return {
    ...automatic,
    id: existing?.id || createId('memory-summary'),
    key: automatic.key || existing?.key,
    createdAt: existing?.createdAt || automatic.createdAt,
    authority: 'automatic'
  };
};

/**
 * Applies a model-produced fresh-state summary deterministically. The model may classify a
 * statement, but it cannot smuggle in a source: every rendered automatic section must refer to
 * source user messages supplied by the runtime.
 */
export function reconcileMemorySummary({
  summary,
  patch = {},
  allowedConversationIds = [],
  allowedMessageIds = [],
  now = () => new Date().toISOString(),
  createId = prefix => `${prefix}:${crypto.randomUUID()}`
} = {}) {
  const current = normalizeMemorySummary(summary, { now });
  const allowedConversations = new Set(uniqueStrings(allowedConversationIds));
  const allowedMessages = new Set(uniqueStrings(allowedMessageIds));
  const incomingSections = asArray(patch.sections)
    .map(section => normalizeSection(section, now))
    .filter(section => section.content)
    .filter(section => section.sourceConversationIds.length > 0 || section.sourceMessageIds.length > 0)
    .filter(section => section.sourceConversationIds.every(id => allowedConversations.has(id)))
    .filter(section => section.sourceMessageIds.every(id => allowedMessages.has(id)));
  const incomingByKey = new Map(incomingSections.map(section => [section.key, section]));
  const retained = current.sections.filter(section => {
    if (section.authority === 'manual') return true;
    return !incomingByKey.has(section.key) && !asArray(patch.removeSectionKeys).includes(section.key);
  });
  const existingByKey = new Map(current.sections.map(section => [section.key, section]));
  const merged = [
    ...retained,
    ...incomingSections.map(section => mergeSection({
      existing: existingByKey.get(section.key),
      incoming: section,
      now,
      createId
    }))
  ].sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt));

  return normalizeMemorySummary({
    ...current,
    // An automatic overview is only useful when it is grounded by at least
    // one accepted section. This prevents a free-floating model sentence from
    // becoming visible memory when its proposed evidence was rejected.
    overview: incomingSections.length > 0 ? (asString(patch.overview) || current.overview) : current.overview,
    sections: merged,
    updatedAt: now(),
    status: 'idle',
    lastError: '',
    lastModelId: asString(patch.modelId) || current.lastModelId,
    needsRefresh: false
  }, { now });
}

/** Applies a model-produced short display layer after the complete memory has been reconciled. */
export function reconcileMemoryOverview({
  overview,
  patch = {},
  memorySummary = {},
  now = () => new Date().toISOString(),
  createId = prefix => `${prefix}:${crypto.randomUUID()}`
} = {}) {
  const current = normalizeMemoryOverview(overview, { now });
  const canonical = normalizeMemorySummary(memorySummary, { now });
  const incoming = asArray(patch.sections)
    .map(section => normalizeSection(section, now))
    .filter(section => section.content)
    .slice(0, 6);
  const incomingByKey = new Map(incoming.map(section => [section.key, section]));
  const existingByKey = new Map(current.sections.map(section => [section.key, section]));
  const retained = current.sections.filter(section => (
    section.authority === 'manual' && !incomingByKey.has(section.key)
  ));
  const sections = [
    ...retained,
    ...incoming.map(section => {
      const existing = existingByKey.get(section.key);
      if (existing?.authority === 'manual') return existing;
      return {
        ...section,
        id: existing?.id || createId('memory-overview'),
        createdAt: existing?.createdAt || section.createdAt,
        authority: 'automatic'
      };
    })
  ].slice(0, 6);
  const hasCanonicalMemory = canonical.sections.length > 0;
  return normalizeMemoryOverview({
    ...current,
    overview: hasCanonicalMemory ? (asString(patch.overview) || current.overview) : '',
    sections: hasCanonicalMemory ? sections : retained,
    updatedAt: now(),
    status: 'idle',
    lastError: '',
    lastModelId: asString(patch.modelId) || current.lastModelId,
    needsRefresh: false,
    basedOnMemorySummaryUpdatedAt: canonical.updatedAt
  }, { now });
}

export function applyManualMemorySummaryEdit({
  summary,
  title,
  content,
  key,
  sectionId,
  now = () => new Date().toISOString(),
  createId = prefix => `${prefix}:${crypto.randomUUID()}`
} = {}) {
  const current = normalizeMemorySummary(summary, { now });
  const normalizedContent = asString(content);
  if (!normalizedContent) throw new TypeError('Memory summary edits require content.');
  const normalizedTitle = asString(title) || 'Memory';
  const normalizedKey = asString(key) || normalizedTitle.toLocaleLowerCase();
  const existing = current.sections.find(section => section.id === sectionId || section.key === normalizedKey);
  const updatedAt = now();
  const replacement = {
    ...existing,
    id: existing?.id || createId('memory-summary'),
    key: normalizedKey,
    title: normalizedTitle,
    content: normalizedContent,
    state: existing?.state || 'current-state',
    sourceConversationIds: existing?.sourceConversationIds || [],
    sourceMessageIds: existing?.sourceMessageIds || [],
    authority: 'manual',
    createdAt: existing?.createdAt || updatedAt,
    updatedAt
  };
  return normalizeMemorySummary({
    ...current,
    sections: [...current.sections.filter(section => section.id !== existing?.id), replacement],
    updatedAt,
    status: 'idle',
    lastError: '',
    needsRefresh: true
  }, { now });
}

export function clearAutomaticMemoryOverview({
  overview,
  now = () => new Date().toISOString()
} = {}) {
  const current = normalizeMemoryOverview(overview, { now });
  return normalizeMemoryOverview({
    ...current,
    overview: '',
    sections: current.sections.filter(section => section.authority === 'manual'),
    updatedAt: now(),
    // Deletion makes the display layer stale; it does not start a refresh.
    // Keeping this idle leaves the explicit Settings update action available.
    status: 'idle',
    lastError: '',
    needsRefresh: true,
    basedOnMemorySummaryUpdatedAt: ''
  }, { now });
}

export function markMemoryOverviewNeedsRefresh({
  overview,
  now = () => new Date().toISOString()
} = {}) {
  const current = normalizeMemoryOverview(overview, { now });
  return normalizeMemoryOverview({
    ...current,
    status: current.status === 'pending' ? 'pending' : 'idle',
    needsRefresh: true
  }, { now });
}

export function removeMemorySummarySources({
  summary,
  evidence = [],
  conversationId,
  messageIds = [],
  now = () => new Date().toISOString()
} = {}) {
  const current = normalizeMemorySummary(summary, { now });
  const targetMessages = new Set(uniqueStrings(messageIds));
  const targetConversation = asString(conversationId);
  const remainingEvidence = normalizeMemoryEvidence(evidence, { now }).filter(record => (
    record.conversationId !== targetConversation && !targetMessages.has(record.messageId)
  ));
  const availableConversations = new Set(remainingEvidence.map(record => record.conversationId));
  const availableMessages = new Set(remainingEvidence.map(record => record.messageId));
  const sections = current.sections.filter(section => {
    if (section.authority === 'manual') return true;
    const sources = sectionSources(section);
    if (sources.size === 0) return false;
    const hasAvailableSource = section.sourceConversationIds.some(id => availableConversations.has(id))
      || section.sourceMessageIds.some(id => availableMessages.has(id));
    return hasAvailableSource;
  });
  const changed = sections.length !== current.sections.length || remainingEvidence.length !== asArray(evidence).length;
  return {
    summary: normalizeMemorySummary({
      ...current,
      // The summary overview has no per-source references.  Once any source
      // is removed, retaining that generated prose could preserve deleted
      // content.  Clear it conservatively; normal background capture rebuilds
      // a fresh overview from the surviving sources.
      overview: changed ? '' : current.overview,
      sections,
      updatedAt: changed ? now() : current.updatedAt,
      needsRefresh: changed || current.needsRefresh
    }, { now }),
    evidence: remainingEvidence,
    changed
  };
}

export function formatMemorySummaryForModel(summary = {}, { maxSections = 5, maxCharacters = 4000 } = {}) {
  const normalized = normalizeMemorySummary(summary);
  const lines = [];
  if (normalized.overview) lines.push(normalized.overview);
  for (const section of normalized.sections.slice(0, Math.max(0, maxSections))) {
    lines.push(`${section.title}: ${section.content}`);
  }
  return lines.join('\n').slice(0, Math.max(0, maxCharacters));
}
