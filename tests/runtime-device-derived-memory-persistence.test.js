import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeviceDerivedMemoryPersistence } from '../src/app/runtime/memory/device-derived-memory-persistence.js';

test('device-derived memory survives a fresh app-data state', async () => {
  let stored = null;
  let memoryState = {
    profileEntries: [{ id: 'profile' }],
    recentConversationStates: [{ conversationId: 'chat-1', sourceHash: 'hash-1' }],
    conversationCapsules: [{ id: 'capsule-1', conversationId: 'chat-1', summary: 'Summary' }],
    mediaMemories: [{ id: 'media-1', conversationId: 'chat-1', sourceHash: 'media-hash' }]
  };
  const storage = {
    getItem: async () => stored,
    setItem: async (_key, value) => { stored = value; }
  };
  const createPersistence = () => createDeviceDerivedMemoryPersistence({
    storage,
    storageKey: 'device-memory',
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; }
  });

  await createPersistence().save();
  memoryState = { profileEntries: [{ id: 'profile' }], recentConversationStates: [], conversationCapsules: [], mediaMemories: [] };
  await createPersistence().load();

  assert.equal(memoryState.profileEntries[0].id, 'profile');
  assert.equal(memoryState.recentConversationStates[0].sourceHash, 'hash-1');
  assert.equal(memoryState.conversationCapsules[0].id, 'capsule-1');
  assert.equal(memoryState.mediaMemories[0].id, 'media-1');
});

test('migrates anonymous derived memory into the current user key', async () => {
  const values = new Map([['derived:anonymous', {
    version: 1,
    recentConversationStates: [{ conversationId: 'chat', sourceHash: 'hash' }],
    conversationCapsules: [{ id: 'capsule', conversationId: 'chat' }],
    mediaMemories: []
  }]]);
  let memoryState = {};
  const persistence = createDeviceDerivedMemoryPersistence({
    storage: {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async key => values.delete(key)
    },
    storageKey: () => 'derived:alice',
    fallbackStorageKeys: () => ['derived:anonymous'],
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; }
  });

  assert.equal(await persistence.load(), true);
  assert.equal(values.has('derived:alice'), true);
  assert.equal(values.has('derived:anonymous'), false);
  assert.equal(memoryState.conversationCapsules[0].id, 'capsule');
});

test('pins derived-memory persistence to the owner used during load', async () => {
  const values = new Map([['derived:alice', {
    version: 1,
    recentConversationStates: [{ conversationId: 'chat', sourceHash: 'hash' }],
    conversationCapsules: [{ id: 'capsule', conversationId: 'chat' }],
    mediaMemories: []
  }]]);
  let username = 'alice';
  let memoryState = {};
  const persistence = createDeviceDerivedMemoryPersistence({
    storage: {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async key => values.delete(key)
    },
    storageKey: () => `derived:${username}`,
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; }
  });

  assert.equal(await persistence.load(), true);
  username = 'supabase:next-session';
  await persistence.save();

  assert.equal(values.has('derived:supabase:next-session'), false);
  assert.equal(values.get('derived:alice').conversationCapsules.length, 1);
});

test('an ordinary empty save cannot replace existing derived memory', async () => {
  const existing = {
    version: 2,
    state: 'ready',
    recentConversationStates: [{ conversationId: 'chat', sourceHash: 'hash' }],
    conversationCapsules: [{ id: 'capsule', conversationId: 'chat' }],
    mediaMemories: []
  };
  const values = new Map([['derived:alice', existing]]);
  const persistence = createDeviceDerivedMemoryPersistence({
    storage: {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value)
    },
    storageKey: 'derived:alice',
    getMemoryState: () => ({
      recentConversationStates: [],
      conversationCapsules: [],
      mediaMemories: []
    }),
    replaceMemoryState: () => {}
  });

  assert.deepEqual(await persistence.save(), { saved: false, reason: 'empty-memory-state' });
  assert.equal(values.get('derived:alice'), existing);
});

test('an explicitly empty owner snapshot never resurrects anonymous derived memory', async () => {
  const values = new Map([
    ['derived:alice', {
      version: 2,
      state: 'explicitly-empty',
      emptyReason: 'permanent-deletion',
      recentConversationStates: [],
      conversationCapsules: [],
      mediaMemories: []
    }],
    ['derived:anonymous', {
      version: 1,
      recentConversationStates: [{ conversationId: 'old', sourceHash: 'old-hash' }],
      conversationCapsules: [{ id: 'old-capsule', conversationId: 'old' }],
      mediaMemories: []
    }]
  ]);
  let memoryState = {
    recentConversationStates: [{ conversationId: 'runtime', sourceHash: 'runtime-hash' }],
    conversationCapsules: [{ id: 'runtime-capsule', conversationId: 'runtime' }],
    mediaMemories: []
  };
  const persistence = createDeviceDerivedMemoryPersistence({
    storage: {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async key => values.delete(key)
    },
    storageKey: 'derived:alice',
    fallbackStorageKeys: ['derived:anonymous'],
    getMemoryState: () => memoryState,
    replaceMemoryState: next => { memoryState = next; }
  });

  assert.equal(await persistence.load(), true);
  assert.deepEqual(memoryState.conversationCapsules, []);
  assert.equal(values.has('derived:anonymous'), true);
});

test('a failed derived-memory migration preserves the anonymous source', async () => {
  const values = new Map([['derived:anonymous', {
    version: 1,
    recentConversationStates: [{ conversationId: 'chat', sourceHash: 'hash' }],
    conversationCapsules: [{ id: 'capsule', conversationId: 'chat' }],
    mediaMemories: []
  }]]);
  const persistence = createDeviceDerivedMemoryPersistence({
    storage: {
      getItem: async key => values.get(key) ?? null,
      setItem: async () => { throw new Error('write failed'); },
      removeItem: async key => values.delete(key)
    },
    storageKey: 'derived:alice',
    fallbackStorageKeys: ['derived:anonymous'],
    getMemoryState: () => ({}),
    replaceMemoryState: () => {}
  });

  await assert.rejects(persistence.load(), /write failed/);
  assert.equal(values.has('derived:anonymous'), true);
});
