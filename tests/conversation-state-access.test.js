import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createConversationStateAccess } from '../src/app/legacy-runtime/runtime/conversation-state-access.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createHarness = () => {
  let conversations = [
    { id: 'first', title: 'First' },
    { id: 'second', title: 'Second' }
  ];
  let currentConversationId = 'first';
  const access = createConversationStateAccess({
    getConversations: () => conversations,
    getCurrentConversationId: () => currentConversationId,
    setCurrentConversationId: (id) => {
      currentConversationId = id;
    }
  });

  return {
    access,
    getBackingId: () => currentConversationId,
    replaceConversations: (value) => {
      conversations = value;
    }
  };
};

test('reads the latest conversations and current conversation id without snapshots', () => {
  const harness = createHarness();

  assert.equal(harness.access.getCurrentConversationId(), 'first');
  assert.equal(harness.access.getCurrentConversation().title, 'First');

  harness.replaceConversations([{ id: 'first', title: 'Updated' }]);

  assert.equal(harness.access.getConversations()[0].title, 'Updated');
  assert.equal(harness.access.getCurrentConversation().title, 'Updated');
});

test('sets the current conversation id through the backing state setter', () => {
  const harness = createHarness();

  assert.equal(harness.access.setCurrentConversationId('second'), 'second');
  assert.equal(harness.getBackingId(), 'second');
  assert.equal(harness.access.getCurrentConversation().title, 'Second');
});

test('looks up conversations by id and preserves missing boundaries', () => {
  const harness = createHarness();

  assert.equal(harness.access.getConversationById('second').title, 'Second');
  assert.equal(harness.access.getConversationById('missing'), undefined);
  assert.equal(harness.access.getConversationById(null), undefined);

  harness.access.setCurrentConversationId('missing');
  assert.equal(harness.access.getCurrentConversation(), undefined);
});

test('non-array conversation state preserves a safe missing boundary', () => {
  const harness = createHarness();

  harness.replaceConversations(null);

  assert.equal(harness.access.getConversationById('first'), undefined);
  assert.equal(harness.access.getCurrentConversation(), undefined);
});

test('conversation state access source avoids runtime side effects and unrelated systems', () => {
  const source = readSource('src/app/legacy-runtime/runtime/conversation-state-access.js');

  for (const forbidden of [
    'document.',
    'window.',
    'innerHTML',
    'streamApiCall',
    'indexedDB',
    'localStorage',
    'package.json',
    'vite.config',
    'DOMPurify',
    'marked',
    'katex',
    'Peer'
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden, 'i'));
  }
});
