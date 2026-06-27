import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createLegacyRuntimeAppDataStore } from '../src/app/runtime/kernel/app-data-store.js';
import { createRuntimeAppKernel } from '../src/app/runtime-app.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('app data store creates empty pointer groups by default', () => {
  const store = createLegacyRuntimeAppDataStore();

  assert.deepEqual(store.getConversations(), []);
  assert.deepEqual(store.getFolders(), []);
  assert.deepEqual(store.getAstras(), []);
  assert.deepEqual(store.getPersonalMemories(), []);
  assert.deepEqual(store.getSnapshot(), {
    conversations: store.getConversations(),
    folders: store.getFolders(),
    astras: store.getAstras(),
    personalMemories: store.getPersonalMemories()
  });
});

test('app data store preserves custom initial pointer identity', () => {
  const initialConversations = [{ id: 'conv-1' }];
  const initialFolders = [{ id: 'folder-1' }];
  const initialAstras = [{ id: 'astra-1' }];
  const initialPersonalMemories = [{ id: 'memory-1' }];
  const store = createLegacyRuntimeAppDataStore({
    initialConversations,
    initialFolders,
    initialAstras,
    initialPersonalMemories
  });

  assert.equal(store.getConversations(), initialConversations);
  assert.equal(store.getFolders(), initialFolders);
  assert.equal(store.getAstras(), initialAstras);
  assert.equal(store.getPersonalMemories(), initialPersonalMemories);
});

test('replace methods return exact pointers without cloning, merging, or freezing', () => {
  const store = createLegacyRuntimeAppDataStore({
    initialConversations: [{ id: 'old-conv' }],
    initialFolders: [{ id: 'old-folder' }],
    initialAstras: [{ id: 'old-astra' }],
    initialPersonalMemories: [{ id: 'old-memory' }]
  });
  const nextConversations = [{ id: 'next-conv' }];
  const nextFolders = [{ id: 'next-folder' }];
  const nextAstras = [{ id: 'next-astra' }];
  const nextPersonalMemories = [{ id: 'next-memory' }];

  assert.equal(store.replaceConversations(nextConversations), nextConversations);
  assert.equal(store.replaceFolders(nextFolders), nextFolders);
  assert.equal(store.replaceAstras(nextAstras), nextAstras);
  assert.equal(store.replacePersonalMemories(nextPersonalMemories), nextPersonalMemories);
  assert.equal(store.getConversations(), nextConversations);
  assert.equal(store.getFolders(), nextFolders);
  assert.equal(store.getAstras(), nextAstras);
  assert.equal(store.getPersonalMemories(), nextPersonalMemories);
  assert.equal(Object.isFrozen(nextConversations), false);
  assert.equal(Object.isFrozen(nextFolders), false);
  assert.equal(Object.isFrozen(nextAstras), false);
  assert.equal(Object.isFrozen(nextPersonalMemories), false);
});

test('replaceAll updates all pointers and returns the current pointer snapshot', () => {
  const store = createLegacyRuntimeAppDataStore();
  const nextData = {
    conversations: [{ id: 'conv-1' }],
    folders: [{ id: 'folder-1' }],
    astras: [{ id: 'astra-1' }],
    personalMemories: [{ id: 'memory-1' }]
  };

  const snapshot = store.replaceAll(nextData);

  assert.deepEqual(Object.keys(snapshot), ['conversations', 'folders', 'astras', 'personalMemories']);
  assert.equal(snapshot.conversations, nextData.conversations);
  assert.equal(snapshot.folders, nextData.folders);
  assert.equal(snapshot.astras, nextData.astras);
  assert.equal(snapshot.personalMemories, nextData.personalMemories);
  assert.equal(store.getSnapshot().conversations, nextData.conversations);
  assert.equal(store.getSnapshot().folders, nextData.folders);
  assert.equal(store.getSnapshot().astras, nextData.astras);
  assert.equal(store.getSnapshot().personalMemories, nextData.personalMemories);
});

test('getter arrays are live legacy pointers until mirror decomposition', () => {
  const store = createLegacyRuntimeAppDataStore();

  store.getConversations().push({ id: 'conv-live' });
  store.getFolders().push({ id: 'folder-live' });
  store.getAstras().push({ id: 'astra-live' });
  store.getPersonalMemories().push({ id: 'memory-live' });

  assert.deepEqual(store.getConversations(), [{ id: 'conv-live' }]);
  assert.deepEqual(store.getFolders(), [{ id: 'folder-live' }]);
  assert.deepEqual(store.getAstras(), [{ id: 'astra-live' }]);
  assert.deepEqual(store.getPersonalMemories(), [{ id: 'memory-live' }]);
  assert.equal(store.getSnapshot().conversations, store.getConversations());
  assert.equal(store.getSnapshot().folders, store.getFolders());
  assert.equal(store.getSnapshot().astras, store.getAstras());
  assert.equal(store.getSnapshot().personalMemories, store.getPersonalMemories());
});

test('replaceAll moves live mutation to the new active arrays only', () => {
  const store = createLegacyRuntimeAppDataStore({
    initialConversations: [{ id: 'old-conv' }],
    initialFolders: [{ id: 'old-folder' }],
    initialAstras: [{ id: 'old-astra' }],
    initialPersonalMemories: [{ id: 'old-memory' }]
  });
  const oldConversations = store.getConversations();
  const oldFolders = store.getFolders();
  const oldAstras = store.getAstras();
  const oldPersonalMemories = store.getPersonalMemories();
  const nextData = {
    conversations: [{ id: 'new-conv' }],
    folders: [{ id: 'new-folder' }],
    astras: [{ id: 'new-astra' }],
    personalMemories: [{ id: 'new-memory' }]
  };

  const snapshot = store.replaceAll(nextData);
  snapshot.conversations.push({ id: 'new-conv-live' });
  snapshot.folders.push({ id: 'new-folder-live' });
  snapshot.astras.push({ id: 'new-astra-live' });
  snapshot.personalMemories.push({ id: 'new-memory-live' });
  oldConversations.push({ id: 'old-conv-stale' });
  oldFolders.push({ id: 'old-folder-stale' });
  oldAstras.push({ id: 'old-astra-stale' });
  oldPersonalMemories.push({ id: 'old-memory-stale' });

  assert.equal(store.getConversations(), nextData.conversations);
  assert.equal(store.getFolders(), nextData.folders);
  assert.equal(store.getAstras(), nextData.astras);
  assert.equal(store.getPersonalMemories(), nextData.personalMemories);
  assert.deepEqual(store.getConversations().map((item) => item.id), ['new-conv', 'new-conv-live']);
  assert.deepEqual(store.getFolders().map((item) => item.id), ['new-folder', 'new-folder-live']);
  assert.deepEqual(store.getAstras().map((item) => item.id), ['new-astra', 'new-astra-live']);
  assert.deepEqual(store.getPersonalMemories().map((item) => item.id), ['new-memory', 'new-memory-live']);
  assert.deepEqual(oldConversations.map((item) => item.id), ['old-conv', 'old-conv-stale']);
  assert.deepEqual(oldFolders.map((item) => item.id), ['old-folder', 'old-folder-stale']);
  assert.deepEqual(oldAstras.map((item) => item.id), ['old-astra', 'old-astra-stale']);
  assert.deepEqual(oldPersonalMemories.map((item) => item.id), ['old-memory', 'old-memory-stale']);
});

test('app data store instances are independent', () => {
  const first = createLegacyRuntimeAppDataStore();
  const second = createLegacyRuntimeAppDataStore();
  const firstConversations = [{ id: 'first' }];
  const secondConversations = [{ id: 'second' }];

  first.replaceConversations(firstConversations);
  second.replaceConversations(secondConversations);

  assert.equal(first.getConversations(), firstConversations);
  assert.equal(second.getConversations(), secondConversations);
  assert.notEqual(first.getFolders(), second.getFolders());
  assert.notEqual(first.getAstras(), second.getAstras());
  assert.notEqual(first.getPersonalMemories(), second.getPersonalMemories());
});

test('runtime app kernel creates an independent empty app data store', () => {
  const elements = {};
  const rootDocument = {
    getElementById: () => assert.fail('provided elements should avoid DOM registry creation')
  };
  const firstKernel = createRuntimeAppKernel({ elements, rootDocument });
  const secondKernel = createRuntimeAppKernel({ elements, rootDocument });

  assert.deepEqual(firstKernel.appDataStore.getSnapshot(), {
    conversations: [],
    folders: [],
    astras: [],
    personalMemories: []
  });
  assert.notEqual(firstKernel.appDataStore, secondKernel.appDataStore);
  assert.notEqual(
    firstKernel.appDataStore.getConversations(),
    secondKernel.appDataStore.getConversations()
  );
});

test('app data store source owns pointers only', () => {
  const source = readSource('src/app/runtime/kernel/app-data-store.js');
  const store = createLegacyRuntimeAppDataStore();

  assert.deepEqual(Object.keys(store), [
    'getConversations',
    'replaceConversations',
    'getFolders',
    'replaceFolders',
    'getAstras',
    'replaceAstras',
    'getPersonalMemories',
    'replacePersonalMemories',
    'replaceAll',
    'getSnapshot'
  ]);
  assert.match(source, /export\s+function\s+createLegacyRuntimeAppDataStore/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtimeContext/);
  assert.doesNotMatch(source, /document|window|addEventListener|currentUser|localStorage|sessionStorage|indexedDB|getItem|setItem|removeItem|openDB/);
  assert.doesNotMatch(source, /showNotification|renderAll|toggleModal|initChatApp|initializeApp/);
  assert.doesNotMatch(source, /Object\.freeze|structuredClone|JSON\.parse|JSON\.stringify/);
});
