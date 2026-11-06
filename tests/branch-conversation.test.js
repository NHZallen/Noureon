import test from 'node:test';
import assert from 'node:assert/strict';
import { branchConversation, branchMessages } from '../src/app/runtime/branch/branch-conversation.js';
import { branchButtonHTML } from '../src/app/runtime/branch/branch-button.js';
import { shareTagsHtml } from '../src/app/runtime/share/share-ref.js';

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
  assert.deepEqual(branch.branchedFrom, { conversationId: 'c1', messageId: 'a2', at: 'now', title: '中和南路改造', by: 'Allen' });
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

test('the button is drawn only with a title, and the sidebar tags a branch', () => {
  assert.equal(branchButtonHTML(''), '');
  assert.match(branchButtonHTML('在新聊天中分支'), /branch-message-btn/);
  assert.match(branchButtonHTML('a"b'), /title="a&quot;b"/);
  assert.match(shareTagsHtml({ id: 'x', branchedFrom: { conversationId: 'c1' } }, (key) => (key === 'branchTag' ? '分支' : key)), /data-share-tag="branch">分支</);
  assert.equal(shareTagsHtml({ id: 'x' }, (key) => key), '');
});
