import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createActiveConversationStore } from '../src/app/runtime/kernel/active-conversation-store.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('createActiveConversationStore exports a store factory with null default id', () => {
  assert.equal(typeof createActiveConversationStore, 'function');

  const store = createActiveConversationStore();

  assert.equal(store.getActiveConversationId(), null);
  assert.equal(store.hasActiveConversation(), false);
});

test('setActiveConversationId stores and returns the current id', () => {
  const store = createActiveConversationStore();

  assert.equal(store.setActiveConversationId('conversation-1'), 'conversation-1');
  assert.equal(store.getActiveConversationId(), 'conversation-1');
  assert.equal(store.hasActiveConversation(), true);
});

test('nullish ids normalize to null while empty string stays observable but inactive', () => {
  const store = createActiveConversationStore('initial');

  assert.equal(store.setActiveConversationId(undefined), null);
  assert.equal(store.getActiveConversationId(), null);
  assert.equal(store.setActiveConversationId(''), '');
  assert.equal(store.getActiveConversationId(), '');
  assert.equal(store.hasActiveConversation(), false);
});

test('clearActiveConversationId resets the store to null and returns null', () => {
  const store = createActiveConversationStore('conversation-1');

  assert.equal(store.clearActiveConversationId(), null);
  assert.equal(store.getActiveConversationId(), null);
  assert.equal(store.hasActiveConversation(), false);
});

test('active conversation store instances are independent', () => {
  const firstStore = createActiveConversationStore('first');
  const secondStore = createActiveConversationStore('second');

  firstStore.setActiveConversationId('updated-first');

  assert.equal(firstStore.getActiveConversationId(), 'updated-first');
  assert.equal(secondStore.getActiveConversationId(), 'second');
});

test('active conversation store import is inert and kernel-scoped', () => {
  const source = readSource('src/app/runtime/kernel/active-conversation-store.js');

  assert.doesNotMatch(source, /document|window|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/);
});
