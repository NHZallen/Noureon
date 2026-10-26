import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createPendingSteers } from '../src/app/ui/sandbox/steer-bubbles.js';
import { formatSandboxRunBlock, liftSandboxRunBlock, normalizeSandboxRun, summarizeSandboxRunText } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { createSandboxRunElement } from '../src/app/ui/sandbox/sandbox-run-view.js';
import { mergeAdjacentModelMessages } from '../src/app/runtime/reply/stream-api-call.js';
import { replyCut } from '../src/app/runtime/reply/reply-cut.js';

const setup = () => {
  const window = new Window();
  const { document } = window;
  const list = document.createElement('div');
  const reply = document.createElement('div');
  reply.className = 'message-item model-message';
  list.append(reply);
  document.body.append(list);
  return { window, document, list, reply };
};

test('a message the reply has not taken yet is a faded bubble like the person\'s own, under the reply, in the order they came, and goes when it is taken', () => {
  const { window, document, list, reply } = setup();
  try {
    const pending = createPendingSteers({ document, place: () => reply });
    assert.equal(pending.add({ id: 'a', text: 'make it a table' }), true);
    assert.equal(pending.add({ id: 'b', text: 'in <French>' }), true);
    const items = [...list.children];
    assert.equal(items.length, 3);
    assert.equal(items[0], reply);
    assert.ok(items[1].classList.contains('user-message') && items[1].classList.contains('is-pending'));
    assert.equal(items[1].querySelector('.message-content').textContent, 'make it a table');
    assert.equal(items[2].querySelector('.message-content').textContent, 'in <French>', 'the words are text, not markup');
    assert.equal(pending.has('a'), true);
    assert.deepEqual(pending.remove(['a']), ['make it a table']);
    assert.equal(list.children.length, 2);
    assert.deepEqual(pending.remove(), ['in <French>']);
    assert.equal(list.children.length, 1);
    assert.equal(createPendingSteers({ document, place: () => null }).add({ id: 'c', text: 'x' }), false, 'nowhere to put it');
  } finally {
    window.happyDOM.abort();
  }
});

test('after a cut the person\'s messages become messages of the conversation (once), their bubbles go, and the reply is followed in the new message', async () => {
  const { window, document, list, reply } = setup();
  try {
    const added = [];
    const conversation = { messages: [{ id: 'u0', role: 'user', parts: [{ text: 'go' }] }, { id: 'r1', role: 'model', parts: [{ text: '' }] }] };
    replyCut.configure({
      document,
      addMessageToUI: (message, index, shouldSave, shouldScroll, options) => {
        assert.equal(index, conversation.messages.length);
        assert.equal(options.conversation, conversation);
        if (shouldSave) options.conversation.messages.push(message);
        added.push(message);
      },
      now: () => '2026-10-26T00:00:00.000Z'
    });
    replyCut.pending.setPlace(() => reply);
    replyCut.pending.add({ id: 's1', text: 'make it a table' });
    replyCut.pending.add({ id: 's2', text: 'later one' });
    const followed = [];
    const run = { inMessage: (id) => ({ forMessage: id }) };
    const result = await replyCut.continueAfterCut({
      conversation,
      cut: { next: 'r2', sequence: 4, users: [{ id: 's1', text: 'make it a table', sequence: 2 }] },
      serverRun: run,
      abortController: 'controller',
      continueReply: async (conv, followedRun, controller) => {
        followed.push([conv, followedRun, controller]);
        // The follower draws the message the reply goes on in before it first waits.
        const loading = document.createElement('div');
        loading.className = 'message-item model-message';
        list.append(loading);
        Object.defineProperty(conv, '__astraPendingResponse', { configurable: true, value: { loadingMessageDiv: loading } });
        return true;
      }
    });
    assert.equal(result, true);
    assert.deepEqual(conversation.messages.map((message) => message.id), ['u0', 'r1', 's1']);
    assert.deepEqual(conversation.messages[2].metadata, { steer: true });
    assert.deepEqual(followed, [[conversation, { forMessage: 'r2' }, 'controller']]);
    assert.equal(replyCut.pending.has('s1'), false, 'the bubble of the message that was taken is gone');
    assert.equal(replyCut.pending.has('s2'), true, 'the one that was not stays');
    assert.equal(list.children.length, 3, 'the reply, the message it goes on in, and under that what was not taken');
    assert.equal(list.children[1].classList.contains('model-message'), true);
    assert.equal(list.children[2].dataset.steerId, 's2');
    await replyCut.continueAfterCut({ conversation, cut: { next: 'r3', sequence: 5, users: [{ id: 's1', text: 'make it a table', sequence: 2 }] }, serverRun: run, abortController: null, continueReply: async () => true });
    assert.equal(added.length, 1, 'a message the page has already is not made twice');
    replyCut.pending.remove();
  } finally {
    window.happyDOM.abort();
  }
});

test('a message that was cut keeps its process line, which is drawn even when it has only the time', () => {
  const run = normalizeSandboxRun({ status: 'done', steps: [], elapsedMs: 32_000, segment: true });
  assert.equal(run.segment, true);
  assert.equal(normalizeSandboxRun({ status: 'done', steps: [] }).segment, undefined);
  const { window, document } = setup();
  try {
    const view = createSandboxRunElement(document, run, { language: 'en' });
    assert.ok(view.querySelector('summary'), 'a line that opens');
    const { run: lifted } = liftSandboxRunBlock(`${formatSandboxRunBlock(run)}`);
    assert.equal(lifted.segment, true, 'kept in the saved text');
  } finally {
    window.happyDOM.abort();
  }
});

test('for the model, a message with only its process is left out and what the person added joins their message before it', () => {
  const merged = mergeAdjacentModelMessages([
    { role: 'user', parts: [{ text: 'make a deck' }] },
    { role: 'model', parts: [{ text: summarizeSandboxRunText(`${formatSandboxRunBlock({ status: 'done', steps: [], segment: true })}`) }] },
    { role: 'user', parts: [{ text: 'make it five pages' }], metadata: { steer: true } },
    { role: 'user', parts: [{ text: 'and in French' }], metadata: { steer: true } },
    { role: 'model', parts: [{ text: 'Here it is.' }] },
    { role: 'user', parts: [{ text: 'thanks' }] },
    { role: 'user', parts: [{ text: 'a second message that is not a steer' }] }
  ]);
  assert.deepEqual(merged.map((message) => message.role), ['user', 'model', 'user', 'user']);
  assert.equal(merged[0].parts.map((part) => part.text).join(''), 'make a deck\n\nmake it five pages\n\nand in French');
  assert.equal(merged[3].parts[0].text, 'a second message that is not a steer', 'messages that are not steers are left as they were');
});

test('a message of a cut reply counts only the pages its own work found; the earlier ones stay in its list for the answer\'s [n]', () => {
  const sources = [1, 2, 3].map((n) => ({ n, url: `https://site${n}.example/`, title: `Site ${n}` }));
  const run = normalizeSandboxRun({ status: 'done', steps: [], elapsedMs: 9000, sources, sourcesBefore: 2 });
  assert.equal(run.sources.length, 3);
  assert.equal(run.sourcesBefore, 2);
  assert.equal(normalizeSandboxRun({ status: 'done', steps: [], sources }).sourcesBefore, undefined);
  assert.equal(normalizeSandboxRun({ status: 'done', steps: [], sourcesBefore: 2 }).sourcesBefore, undefined, 'no pages, nothing before them');
  const { window, document } = setup();
  try {
    const view = createSandboxRunElement(document, run, { language: 'en' });
    const text = view.textContent;
    assert.match(text, /Searched 1 site|1 site/i, 'one site of its own');
    assert.doesNotMatch(text, /3 sites/);
  } finally {
    window.happyDOM.abort();
  }
});
