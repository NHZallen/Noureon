import assert from 'node:assert/strict';
import test from 'node:test';

import { createServerReplyReattach } from '../src/app/runtime/server-reply/reattach.js';

const harness = ({ messages, run = { assistantMessageId: 'a1', follow: async () => ({}) }, hasAccount = true, abortController = null, find } = {}) => {
  const conv = { id: 'c1', messages };
  const calls = { completed: [], busy: [], removed: [], added: [] };
  const partialElement = { __astraRenderedMessage: { id: 'a1' }, remove: () => calls.removed.push('partial') };
  const lifecycle = createServerReplyReattach({
    getActiveConversation: () => conv,
    getAbortController: () => abortController,
    setAbortController: (value) => { calls.abort = value; },
    serverReply: { hasAccount: () => hasAccount, find: find || (async () => run) },
    messageList: () => ({ children: [{ __astraRenderedMessage: { id: 'u1' } }, partialElement] }),
    setSubmitBusy: (busy) => calls.busy.push(busy),
    addMessageToUI: (message, index) => { calls.added.push([message.parts[0].text, index]); return { querySelector: () => ({ marker: 'content' }), scrollIntoView() {} }; },
    completeReply: async (prepared, options) => { calls.completed.push({ prepared, options, pending: Boolean(conv.__astraPendingResponse), messages: [...conv.messages] }); },
    document: null,
    window: null,
    scheduleTimeout: () => null
  });
  return { conv, calls, lifecycle };
};

test('a reply the server is still making is shown being written: the half-written copy is taken out and the reply is followed', async () => {
  const messages = [{ id: 'u1', role: 'user', parts: [{ text: 'tell a story' }] }, { id: 'a1', role: 'model', parts: [{ text: 'Once' }] }];
  const { calls, lifecycle } = harness({ messages });
  assert.equal(await lifecycle.reattachServerReply(), true);
  const [done] = calls.completed;
  assert.deepEqual(done.messages.map((message) => message.id), ['u1'], 'the copy of the cloud is out');
  assert.deepEqual(calls.removed, ['partial']);
  assert.deepEqual(calls.added, [['...', 1]]);
  assert.deepEqual(calls.busy, [true]);
  assert.equal(done.pending, true, 'the chat counts as having a reply under way (cloud changes wait)');
  assert.equal(done.prepared.userMessage, 'tell a story');
  assert.equal(done.prepared.responseUsesCouncil, false);
  assert.equal(done.options.resumeRun.assistantMessageId, 'a1');
});

test('nothing is shown when there is no such reply, a reply being made here, or the chat does not end with a question', async () => {
  const ask = [{ id: 'u1', role: 'user', parts: [{ text: 'q' }] }];
  const none = harness({ messages: ask, find: async () => null });
  assert.equal(await none.lifecycle.reattachServerReply(), false);
  assert.equal(none.calls.completed.length, 0);
  assert.equal(await harness({ messages: ask, abortController: {} }).lifecycle.reattachServerReply(), false);
  const odd = harness({ messages: [{ id: 'a0', role: 'model', parts: [{ text: 'hi' }] }] });
  assert.equal(await odd.lifecycle.reattachServerReply(), false);
  assert.equal(odd.conv.messages.length, 1, 'nothing is taken out');
  const broken = harness({ messages: ask, find: async () => { throw new Error('offline'); } });
  assert.equal(await broken.lifecycle.reattachServerReply(), false);
});

test('the visual check of a presentation that the server is making is followed, not shown as a reply', async () => {
  const followed = [];
  const messages = [{ id: 'u1', role: 'user', parts: [{ text: 'make a deck' }] }, { id: 'a1', role: 'model', parts: [{ text: 'Here it is' }] }];
  const conv = { id: 'c1', messages };
  const lifecycle = createServerReplyReattach({
    getActiveConversation: () => conv,
    getAbortController: () => null,
    setAbortController() {},
    serverReply: { find: async () => ({ runId: 'run-v', assistantMessageId: 'm-v', kind: 'vision' }), followVision: (args) => followed.push(args) },
    messageList: () => ({ children: [] }),
    setSubmitBusy() { assert.fail('the chat is not made busy'); },
    addMessageToUI() { assert.fail('no reply is shown'); },
    completeReply: async () => assert.fail('no reply is followed'),
    document: null,
    window: null,
    scheduleTimeout: () => null
  });
  assert.equal(await lifecycle.reattachServerReply(), true);
  assert.deepEqual(followed, [{ runId: 'run-v', conversation: conv }]);
  assert.equal(conv.messages.length, 2, 'nothing is taken out of the chat');
});
