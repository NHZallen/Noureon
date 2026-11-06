import test from 'node:test';
import assert from 'node:assert/strict';
import { branchConversation, branchMessages } from '../src/app/runtime/branch/branch-conversation.js';
import { branchButtonHTML } from '../src/app/runtime/branch/branch-button.js';
import { Window } from 'happy-dom';
import { BRANCH_EVENT, decorateFooters, startBranch } from '../src/app/runtime/branch/start-branch.js';
import { bindMessageListActions } from '../src/app/runtime/features/message-list-actions.js';

let counter = 0;
const uuid = () => `id-${++counter}`;
const conversation = () => ({
  id: 'c1', title: '中和南路改造', model: 'm', provider: 'p', genConfig: { temperature: 1 }, council: { enabled: false }, folderId: 'f1', astrasId: 'n1', isWebSearchEnabled: true,
  messages: [
    { id: 'u1', role: 'user', parts: [{ text: '問題一' }], createdAt: 't1' },
    { id: 'a1', role: 'model', parts: [{ text: '答一' }], createdAt: 't2', metadata: { memoryUsed: ['x'], serverError: 'boom', steer: { a: 1 } } },
    { id: 'u2', role: 'user', parts: [{ text: '問題二' }], createdAt: 't3' },
    { id: 'a2', role: 'model', parts: [{ text: '答二' }, { researchPlan: { steps: [] } }], createdAt: 't4' },
    { id: 'u3', role: 'user', parts: [{ text: '已刪除' }], createdAt: 't5', deletedAt: 'x' }
  ]
});

test('a branch is the messages up to and including the reply, as new messages', () => {
  const source = conversation();
  const branch = branchConversation({ conversation: source, messageIndex: 1, title: 'T (branch)', uuid, now: () => 'now' });
  assert.equal(branch.title, 'T (branch)');
  assert.deepEqual(branch.messages.map((message) => message.parts[0].text), ['問題一', '答一']);
  assert.ok(branch.messages.every((message) => !['u1', 'a1'].includes(message.id)));
  assert.equal(branch.messages[1].status, 'complete');
  // what belongs to a running or failed reply is not carried
  assert.deepEqual(branch.messages[1].metadata, { memoryUsed: ['x'] });
  // the source is not touched
  assert.equal(source.messages.length, 5);
  assert.equal(source.messages[1].metadata.serverError, 'boom');
});

test('a branch goes on with the settings of the source, in the same project, and remembers where it came from', () => {
  const branch = branchConversation({ conversation: conversation(), messageIndex: 3, title: 'T', uuid, now: () => 'now', by: 'Allen' });
  assert.equal(branch.model, 'm');
  assert.equal(branch.folderId, 'f1');
  assert.equal(branch.astrasId, 'n1');
  assert.equal(branch.isWebSearchEnabled, true);
  assert.equal(branch.isRenamed, true);
  assert.equal(branch.pinned, false);
  assert.deepEqual(branch.branchedFrom, { conversationId: 'c1', messageId: 'a2', copied: branch.messages.length, at: 'now', title: '中和南路改造', by: 'Allen' });
  assert.notEqual(branch.genConfig, conversation().genConfig);
  // a research that was not finished is left out of the copy
  assert.deepEqual(branch.messages.at(-1).parts, [{ text: '答二' }]);
});

test('only a reply can be branched from, and a message that is not there gives nothing', () => {
  assert.equal(branchConversation({ conversation: conversation(), messageIndex: 0, title: 'T' }), null);
  assert.equal(branchConversation({ conversation: conversation(), messageIndex: 9, title: 'T' }), null);
  assert.equal(branchConversation({ conversation: null, messageIndex: 0, title: 'T' }), null);
  assert.deepEqual(branchMessages({ messages: [] }, 3), []);
});

test('the copy does not share parts with the source', () => {
  const source = conversation();
  const branch = branchConversation({ conversation: source, messageIndex: 1, title: 'T', uuid });
  branch.messages[0].parts[0].text = 'changed';
  assert.equal(source.messages[0].parts[0].text, '問題一');
});

test('the button is drawn only with a title', () => {
  assert.equal(branchButtonHTML(''), '');
  assert.match(branchButtonHTML('在新聊天中分支'), /branch-message-btn/);
  assert.match(branchButtonHTML('a"b'), /title="a&quot;b"/);
});

const pageWith = () => {
  const window = new Window({ url: 'https://noureon.test/' });
  window.document.body.innerHTML = '<div id="message-list"><div class="message-item" data-message-index="1"><div class="message-footer-left"><button class="copy-content-btn"></button><button class="sources"></button></div></div><div class="message-item" data-message-index="3"><div class="message-footer-left"><button class="copy-content-btn"></button></div></div></div>';
  return window;
};

test('the branch button is put after the copy button of every reply, once', () => {
  const { document } = pageWith();
  const list = document.getElementById('message-list');
  assert.equal(decorateFooters(list, 'Branch'), 2);
  assert.equal(decorateFooters(list, 'Branch'), 0);
  assert.equal(decorateFooters(list, ''), 0);
  const first = list.querySelector('.message-footer-left');
  assert.deepEqual([...first.children].map((node) => node.className.split(' ')[0]), ['copy-content-btn', 'branch-message-btn', 'sources']);
});

test('the page branches the conversation when the button asks, and tells the person', async () => {
  const window = pageWith();
  const { document } = window;
  const conversations = [{ id: 'c1', title: 'Plan', model: 'm', provider: 'p', messages: [
    { id: 'u1', role: 'user', parts: [{ text: 'q' }] }, { id: 'a1', role: 'model', parts: [{ text: 'a' }] }] }];
  const events = [];
  const opened = [];
  let saved = 0;
  const api = startBranch({
    document, window, configAccess: { getUiLanguage: () => 'en' }, i18n: { en: { branchTitle: '{title} (branch)', branchDone: 'done', branchFailed: 'failed', branchNothing: 'nothing', branchChat: 'Branch' } },
    dataStore: { getConversations: () => conversations }, saveAppData: async () => { saved += 1; }, showNotification: (message, kind) => events.push([message, kind]), renderSidebar: () => {}, openConversation: (id) => opened.push(id)
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(document.querySelectorAll('.branch-message-btn').length, 2);
  document.dispatchEvent(new window.CustomEvent(BRANCH_EVENT, { detail: { conversationId: 'c1', messageIndex: 1 } }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(conversations.length, 2);
  assert.equal(conversations[0].title, 'Plan (branch)');
  assert.equal(conversations[0].branchedFrom.conversationId, 'c1');
  assert.deepEqual(opened, [conversations[0].id]);
  assert.equal(saved, 1);
  assert.deepEqual(events, [['done', 'success']]);
  assert.equal(await api.run({ conversationId: 'c1', messageIndex: 0 }), null);
  assert.deepEqual(events.at(-1), ['nothing', 'error']);
});

test('the button under a reply asks for a branch of that reply in the conversation that is open', () => {
  const window = pageWith();
  const { document } = window;
  const list = document.getElementById('message-list');
  decorateFooters(list, 'Branch');
  const conversation = { id: 'c9', messages: [{ role: 'user', parts: [{ text: 'q' }] }, { role: 'model', parts: [{ text: 'a' }] }, { role: 'user', parts: [{ text: 'q2' }] }, { role: 'model', parts: [{ text: 'a2' }] }] };
  bindMessageListActions({ window, document, elements: { messageList: list }, i18n: { en: {} }, config: { uiLanguage: 'en' }, getConfig: () => ({ uiLanguage: 'en' }), getActiveConversation: () => conversation, copyTextToClipboard: async () => {}, showNotification: () => {}, startMessageEditing: () => {}, logger: console });
  const seen = [];
  document.addEventListener(BRANCH_EVENT, (event) => seen.push(event.detail));
  list.querySelectorAll('.branch-message-btn')[1].click();
  list.querySelectorAll('.branch-message-btn')[0].click();
  assert.deepEqual(seen, [{ conversationId: 'c9', messageIndex: 3 }, { conversationId: 'c9', messageIndex: 1 }]);
});

import { markBranchCopies } from '../src/app/runtime/branch/start-branch.js';

test('a branch remembers how many messages were copied; the copies are dimmed and a line says so, once', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = '<div id="list">' + [0, 1, 2, 3].map((index) => `<div class="message-item" data-message-index="${index}">m${index}</div>`).join('') + '</div>';
  const list = document.getElementById('list');
  const conversation = { branchedFrom: { conversationId: 'x', messageId: 'y', copied: 2 } };
  assert.equal(markBranchCopies(list, conversation, 'Copied above'), 2);
  assert.deepEqual([...list.children].map((node) => node.className), ['message-item branch-copied', 'message-item branch-copied', 'branch-divider', 'message-item', 'message-item']);
  assert.equal(list.children[2].textContent, 'Copied above');
  markBranchCopies(list, conversation, 'Copied above');
  assert.equal(list.querySelectorAll('.branch-divider').length, 1);
  // a conversation that is not a branch (or has no count) is left plain, and a divider that is no longer wanted goes
  assert.equal(markBranchCopies(list, { title: 'plain' }, 'Copied above'), 0);
  assert.equal(list.querySelector('.branch-divider'), null);
  assert.equal(list.querySelector('.branch-copied'), null);
});
