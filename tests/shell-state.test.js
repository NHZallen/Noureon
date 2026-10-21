import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createQuoteStore,
  createReplyStore,
  createSelectionStore,
  createSessionStore,
  createShellState,
  createSidebarStore,
  createUploadsStore
} from '../src/app/runtime/legacy-core/shell-state.js';

// The state the parts of the shell share is a set of small stores, each changed only through its named functions (NOU-78).

test('the session keeps who is signed in until another person signs in', () => {
  const session = createSessionStore();
  assert.equal(session.getCurrentUser(), null);
  const alice = { username: 'alice' };
  assert.equal(session.setCurrentUser(alice), alice);
  assert.equal(session.getCurrentUser(), alice);
  assert.equal(session.setCurrentUser(undefined), null, 'nobody, not undefined');
});

test('the files waiting to be sent are replaced as a whole and cleared after sending', () => {
  const uploads = createUploadsStore();
  assert.deepEqual(uploads.getUploadedFiles(), []);
  const files = [{ name: 'a.txt' }];
  assert.equal(uploads.setUploadedFiles(files), files);
  assert.equal(uploads.getUploadedFiles(), files);
  uploads.setUploadedFiles(null);
  assert.deepEqual(uploads.getUploadedFiles(), [], 'never anything but a list');
  uploads.setUploadedFiles(files);
  uploads.clearUploadedFiles();
  assert.deepEqual(uploads.getUploadedFiles(), []);
});

test('the reply being made: how to stop it, a council meeting, the confirmation to send', () => {
  const reply = createReplyStore();
  assert.equal(reply.getAbortController(), null);
  const controller = new AbortController();
  reply.setAbortController(controller);
  assert.equal(reply.getAbortController(), controller);
  reply.setAbortController(undefined);
  assert.equal(reply.getAbortController(), null);

  assert.equal(reply.isCouncilRunning(), false);
  reply.setCouncilRunning(1);
  assert.equal(reply.isCouncilRunning(), true);
  reply.setCouncilRunning(false);
  assert.equal(reply.isCouncilRunning(), false);

  assert.equal(reply.isSendConfirmed(), false);
  assert.equal(reply.setSendConfirmed(true), true);
  assert.equal(reply.isSendConfirmed(), true);
});

test('the batch selection hands out a copy of the ids; only its functions change them', () => {
  const selection = createSelectionStore();
  assert.equal(selection.isSelectionMode(), false);
  selection.setSelectionMode(true);
  assert.equal(selection.isSelectionMode(), true);

  selection.selectConversation('a');
  selection.selectConversation('b', true);
  selection.selectConversation('a', false);
  const ids = selection.getSelectedConversationIds();
  assert.deepEqual([...ids], ['b']);
  ids.add('c');
  assert.deepEqual([...selection.getSelectedConversationIds()], ['b'], 'changing the copy changes nothing');

  selection.clearSelectedConversations();
  assert.equal(selection.getSelectedConversationIds().size, 0);
});

test('the quoted text and the sidebar keep their value', () => {
  const quote = createQuoteStore();
  assert.equal(quote.getQuoteReference(), null);
  quote.setQuoteReference({ text: 'Hello' });
  assert.deepEqual(quote.getQuoteReference(), { text: 'Hello' });
  quote.setQuoteReference(undefined);
  assert.equal(quote.getQuoteReference(), null);

  const sidebar = createSidebarStore();
  assert.equal(sidebar.isSidebarOpen(), false);
  assert.equal(sidebar.setSidebarOpen('yes'), true);
  assert.equal(sidebar.isSidebarOpen(), true);
});

test('the shell state is one store of each kind, none of them writable from outside', () => {
  const shell = createShellState();
  assert.deepEqual(Object.keys(shell).sort(), ['quote', 'reply', 'selection', 'session', 'sidebar', 'uploads']);
  assert.ok(Object.isFrozen(shell));
  for (const store of Object.values(shell)) assert.ok(Object.isFrozen(store));
  assert.notEqual(createShellState().uploads, shell.uploads, 'each shell has its own stores');
});
