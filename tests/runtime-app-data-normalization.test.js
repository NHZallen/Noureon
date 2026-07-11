import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  normalizeAstraRecord,
  normalizeConversationRecord,
  normalizeFolderRecord,
  normalizeLoadedLegacyAppData
} from '../src/app/runtime/kernel/app-data-normalization.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const defaultFolder = () => ({
  color: 'gray',
  icon: 'default',
  textColor: 'gray',
  isOpen: false
});

const defaultGenConfig = () => ({
  temperature: 0.7,
  topP: 0.95,
  maxTokens: null
});

const lastCouncilConfig = {
  enabled: true,
  mode: 'consensus',
  participantModelIds: ['model-a'],
  synthesizerModelId: 'model-b',
  showRawResponses: true,
  showComparisonTable: true
};

test('folder and Astra records preserve legacy defaults with saved-field precedence', () => {
  assert.deepEqual(normalizeFolderRecord({ name: 'Work', color: 'blue' }, { defaultFolder }), {
    color: 'blue',
    icon: 'default',
    textColor: 'gray',
    isOpen: false,
    name: 'Work'
  });
  assert.deepEqual(normalizeAstraRecord({ id: 'astra-1', name: 'A', avatarUrl: 'custom' }), {
    avatarUrl: 'custom',
    officialId: null,
    id: 'astra-1',
    name: 'A'
  });
});

test('conversation records preserve legacy defaults and message fallbacks on a normalized copy', () => {
  const rawConversation = {
    id: 'conv-1',
    title: 'Legacy',
    createdAt: '2026-01-01T00:00:00.000Z',
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'model', createdAt: '2026-01-02T00:00:00.000Z', parts: [{ text: 'world' }] }
    ]
  };
  const calls = [];
  const normalized = normalizeConversationRecord(rawConversation, {
    defaultGenConfig,
    lastCouncilConfig,
    normalizeCouncilConfig: (value) => ({ ...value, normalized: true }),
    normalizeConversationModel: (conversation) => {
      calls.push(conversation);
      conversation.model = 'model-default';
      conversation.provider = 'gemini';
    }
  });

  assert.notEqual(normalized, rawConversation);
  assert.equal(calls[0], normalized);
  assert.equal(rawConversation.model, undefined);
  assert.equal(normalized.model, 'model-default');
  assert.equal(normalized.provider, 'gemini');
  assert.equal(normalized.archived, false);
  assert.equal('summary' in normalized, false);
  assert.equal(normalized.folderId, null);
  assert.equal(normalized.isWebSearchEnabled, false);
  assert.equal(normalized.astrasId, null);
  assert.equal(normalized.pinned, false);
  assert.equal(normalized.deletedAt, null);
  assert.equal(normalized.unsentMessage, '');
  assert.deepEqual(normalized.genConfig, defaultGenConfig());
  assert.deepEqual(normalized.council, { ...lastCouncilConfig, normalized: true });
  assert.equal(normalized.lastUpdatedAt, '2026-01-02T00:00:00.000Z');
  assert.deepEqual(normalized.messages[0], {
    role: 'user',
    content: 'hello',
    createdAt: '2026-01-01T00:00:00.000Z',
    parts: [{ text: 'hello' }]
  });
  assert.deepEqual(normalized.messages[1], {
    role: 'model',
    createdAt: '2026-01-02T00:00:00.000Z',
    parts: [{ text: 'world' }]
  });
  assert.notEqual(normalized.messages, rawConversation.messages);
  assert.notEqual(normalized.messages[1].parts, rawConversation.messages[1].parts);
});

test('loaded app data falls back to empty collections and normalizes every record type', () => {
  const normalizedEmpty = normalizeLoadedLegacyAppData({
    rawData: {},
    defaultFolder,
    defaultGenConfig,
    lastCouncilConfig,
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: () => {}
  });

  assert.deepEqual(normalizedEmpty, {
    conversations: [],
    folders: [],
    astras: [],
    personalMemories: [],
    memoryState: {
      version: 2,
      profileEntries: [],
      profileCandidates: [],
      recentConversationStates: [],
      mediaMemories: [],
      conversationCapsules: [],
      longTermTopicSummaries: [],
      suppressionRules: [],
      memoryUsageRecords: [],
      legacyInbox: []
    }
  });

  const rawData = {
    folders: [{ id: 'folder-1', name: 'Folder' }],
    conversations: [{
      id: 'conv-1',
      title: 'Conversation',
      createdAt: '2026-01-03T00:00:00.000Z',
      council: null,
      messages: []
    }],
    astras: [{ id: 'astra-1', name: 'Astra', officialId: 'official' }],
    personalMemories: [{ id: 'memory-1', content: 'remember', enabled: true }]
  };
  const normalized = normalizeLoadedLegacyAppData({
    rawData,
    defaultFolder,
    defaultGenConfig,
    lastCouncilConfig,
    normalizeCouncilConfig: value => ({ ...value, checked: true }),
    normalizeConversationModel: conversation => {
      conversation.model = 'model-default';
      conversation.provider = 'gemini';
    }
  });

  assert.deepEqual(normalized.folders[0], {
    color: 'gray',
    icon: 'default',
    textColor: 'gray',
    isOpen: false,
    id: 'folder-1',
    name: 'Folder'
  });
  assert.equal(normalized.conversations[0].model, 'model-default');
  assert.deepEqual(normalized.conversations[0].council, { ...lastCouncilConfig, checked: true });
  assert.deepEqual(normalized.astras[0], {
    avatarUrl: null,
    officialId: 'official',
    id: 'astra-1',
    name: 'Astra'
  });
  assert.equal(normalized.personalMemories, rawData.personalMemories);
});

test('loaded app data creates a non-active memory migration inbox from legacy memories', () => {
  const normalized = normalizeLoadedLegacyAppData({
    rawData: {
      personalMemories: [{ id: 'legacy-1', content: '使用者叫 Allen', enabled: true }]
    },
    defaultFolder,
    defaultGenConfig,
    lastCouncilConfig,
    normalizeCouncilConfig: value => value,
    normalizeConversationModel: () => {}
  });

  assert.deepEqual(normalized.memoryState.profileEntries, []);
  assert.equal(normalized.memoryState.legacyInbox.length, 1);
  assert.equal(normalized.memoryState.legacyInbox[0].legacyId, 'legacy-1');
  assert.equal(normalized.memoryState.legacyInbox[0].status, 'review');
});

test('app data normalization module remains pure kernel logic', () => {
  const source = readSource('src/app/runtime/kernel/app-data-normalization.js');

  assert.match(source, /export\s+function\s+normalizeLoadedLegacyAppData/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtimeContext|runtimeConfigStore/);
  assert.doesNotMatch(source, /document|window|addEventListener|currentUser|localStorage|sessionStorage|indexedDB|getItem|setItem|removeItem|openDB/);
  assert.doesNotMatch(source, /showNotification|renderAll|toggleModal|initChatApp|initializeApp/);
});
