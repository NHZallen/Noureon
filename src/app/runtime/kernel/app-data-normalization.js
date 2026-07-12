import { normalizeMemoryState } from '../memory/memory-schema.js';

const resolveDefault = (value) => (typeof value === 'function' ? value() : value);

export function normalizeFolderRecord(record, { defaultFolder } = {}) {
  return {
    ...(resolveDefault(defaultFolder) || {}),
    ...(record || {})
  };
}

export function normalizeConversationRecord(record, {
  defaultGenConfig,
  lastCouncilConfig,
  normalizeCouncilConfig = (value) => value,
  normalizeConversationModel = () => {}
} = {}) {
  const { summary: _legacySummary, ...source } = record || {};
  const normalizedConversation = {
    archived: false,
    folderId: null,
    isWebSearchEnabled: false,
    astrasId: null,
    pinned: false,
    deletedAt: null,
    ...source,
    unsentMessage: source.unsentMessage || '',
    genConfig: source.genConfig || resolveDefault(defaultGenConfig),
    council: normalizeCouncilConfig(source.council || lastCouncilConfig),
    lastUpdatedAt: source.lastUpdatedAt || (
      source.messages && source.messages.length > 0
        ? source.messages[source.messages.length - 1].createdAt
        : source.createdAt
    ),
    stateUpdatedAt: source.stateUpdatedAt || source.deletedAt || source.lastUpdatedAt || source.updatedAt || source.createdAt,
    messages: (source.messages || []).map(message => ({
      ...message,
      createdAt: message.createdAt || source.createdAt,
      parts: Array.isArray(message.parts)
        ? [...message.parts]
        : [{ text: message.content }]
    }))
  };

  normalizeConversationModel(normalizedConversation);
  return normalizedConversation;
}

export function normalizeAstraRecord(record) {
  return {
    avatarUrl: null,
    officialId: null,
    ...(record || {})
  };
}

export function normalizeLoadedLegacyAppData({
  rawData,
  defaultFolder,
  defaultGenConfig,
  lastCouncilConfig,
  normalizeCouncilConfig,
  normalizeConversationModel
} = {}) {
  const data = rawData || {};

  return {
    folders: (data.folders || []).map(folder => normalizeFolderRecord(folder, { defaultFolder })),
    conversations: (data.conversations || []).map(conversation => normalizeConversationRecord(conversation, {
      defaultGenConfig,
      lastCouncilConfig,
      normalizeCouncilConfig,
      normalizeConversationModel
    })),
    astras: (data.astras || []).map(normalizeAstraRecord),
    personalMemories: data.personalMemories || [],
    memoryState: normalizeMemoryState(data)
  };
}
