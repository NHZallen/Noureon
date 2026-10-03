import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createServerVisionFollow } from '../src/app/runtime/server-reply/server-vision.js';
import { chatsUnderVisionCheck, setVisionLocked } from '../src/app/runtime/features/vision-check-lock.js';

const setup = () => {
  const window = new Window();
  const { document } = window;
  const stack = document.createElement('div');
  stack.className = 'message-stack';
  document.body.append(stack);
  window.URL.createObjectURL = () => 'blob:test';
  window.URL.revokeObjectURL = () => {};
  return { window, document, stack };
};
const conversation = { id: 'conv-1' };

function harness({ events = [], find = async () => null, watch } = {}) {
  const { window, document, stack } = setup();
  const requests = [];
  const notices = [];
  const flushes = [];
  const locks = [];
  const serverReply = {
    request: async (method, path) => { requests.push([method, path]); return { ok: true }; },
    find,
    watchRun: watch || (async (runId, { onEvent }) => {
      for (const event of events) if (onEvent(event) === 'done') return true;
      return false;
    })
  };
  const follow = createServerVisionFollow({
    serverReply,
    document,
    getLanguage: () => 'en',
    showNotification: (text, kind) => notices.push([text, kind]),
    getActiveConversation: () => conversation,
    getSync: () => ({ flush: async () => { flushes.push(1); } }),
    onLockChange: () => locks.push([...chatsUnderVisionCheck]),
    wait: async () => {}
  });
  return { follow, requests, notices, flushes, locks, document, stack, window };
}

const call = (m, ...a) => ({ vc: { m, a } });

test('the check the server makes is drawn as the page draws its own, from what the server tells, and the chat is locked meanwhile', async () => {
  const labels = [];
  const events = [
    call('begin', { name: 'deck.pptx', free: false }),
    call('set', 'rendering'),
    call('slide', { index: 0, total: 2, number: 1, url: 'data:image/jpeg;base64,AA==' }),
    call('slide', { index: 1, total: 2, number: 2, url: 'data:image/jpeg;base64,AA==' }),
    call('sheet', { index: 0, total: 1, url: 'data:image/jpeg;base64,AA==' }),
    call('set', 'reviewing', { model: 'Gemini' }),
    call('think', 'Looking at it'),
    call('issues', [{ slide: 2, category: 'text', problem: 'Too small', fix: 'Larger' }]),
    call('set', 'applying'),
    call('file-end', { outcome: 'fixed', messageId: 'm2' }),
    { done: 'complete' }
  ];
  const { follow, document, notices, flushes, locks } = harness({ events });
  const original = events.find((event) => event.vc.m === 'sheet');
  void original;
  const running = follow.attach({ runId: 'run-v', conversation });
  assert.deepEqual([...chatsUnderVisionCheck], ['conv-1'], 'locked at once');
  await running;
  assert.deepEqual([...chatsUnderVisionCheck], [], 'free again');
  assert.deepEqual(locks, [['conv-1'], []], 'the composer is asked to look each time');
  assert.equal(document.querySelectorAll('.ledger').length, 0, 'the line is gone when the check is over');
  assert.deepEqual(notices, [], 'a corrected reply is the message, not a notice');
  assert.equal(flushes.length, 1, 'the sync is asked to bring the corrected reply');
  void labels;
});

test('the line of the check is on the page while it runs: the slides as they are drawn, the problems found', async () => {
  let seen = null;
  const { follow, document } = harness({
    watch: async (runId, { onEvent }) => {
      for (const event of [call('begin', { name: 'd.pptx' }), call('set', 'rendering'), call('slide', { index: 0, total: 3, number: 1, url: 'data:image/jpeg;base64,AA==' }), call('set', 'reviewing', { model: 'M' }), call('issues', [{ slide: 1, category: 'layout', problem: 'Crowded', fix: 'Split' }])]) onEvent(event);
      seen = { thumbs: document.querySelectorAll('.ledger-thumb').length, issues: document.querySelector('.ledger-issues')?.textContent || '', title: document.querySelector('.ledger-label')?.textContent || '' };
      onEvent({ done: 'complete' });
      return true;
    }
  });
  await follow.attach({ runId: 'run-v', conversation });
  assert.equal(seen.thumbs, 3, 'a cell for each slide');
  assert.match(seen.issues, /Crowded/);
  assert.match(seen.title, /Automatic visual check/);
});

test('a page that joins late is given the calls so far in one go, draws the same line and does not tell again what was told', async () => {
  const { follow, notices } = harness({
    events: [
      { r: { answer: '', vc: [call('begin', { name: 'a.pptx' }).vc, call('file-end', { outcome: 'clean' }).vc, call('begin', { name: 'b.pptx' }).vc, call('set', 'rendering').vc] } },
      call('file-end', { outcome: 'clean' }),
      { done: 'complete' }
    ]
  });
  await follow.attach({ runId: 'run-v', conversation });
  assert.equal(notices.length, 1, 'only the one that happened while this page was watching');
  assert.match(notices[0][0], /nothing needs fixing/);
  assert.equal(notices[0][1], 'success');
});

test('a check that could not finish says why; a stop says nothing', async () => {
  const { follow, notices } = harness({ events: [call('begin', { name: 'a.pptx' }), call('file-end', { outcome: 'failed', code: 'timed_out', reason: 'it took too long' }), call('begin', { name: 'b.pptx' }), call('file-end', { outcome: 'stopped' }), { done: 'complete' }] });
  await follow.attach({ runId: 'run-v', conversation });
  assert.equal(notices.length, 1);
  assert.match(notices[0][0], /did not finish: it took too long/);
  assert.equal(notices[0][1], 'warning');
});

test('the stop of the line stops the check on the server', async () => {
  let stopLine = null;
  const { follow, requests, document } = harness({
    watch: async (runId, { onEvent }) => {
      onEvent(call('begin', { name: 'a.pptx' }));
      stopLine = [...document.querySelectorAll('button')].find((button) => /Stop/.test(button.textContent));
      stopLine?.click();
      onEvent({ done: 'complete' });
      return true;
    }
  });
  await follow.attach({ runId: 'run-v', conversation });
  assert.ok(stopLine, 'the line has its stop button');
  assert.deepEqual(requests, [['POST', '/v1/runs/run-v/stop']]);
});

test('the same check is followed once, and two checks of one chat keep it locked until both are over', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { follow } = harness({ watch: async () => { await gate; return true; } });
  const first = follow.attach({ runId: 'run-a', conversation });
  const again = follow.attach({ runId: 'run-a', conversation });
  const other = follow.attach({ runId: 'run-b', conversation });
  assert.deepEqual([...chatsUnderVisionCheck], ['conv-1']);
  release();
  await Promise.all([first, again, other]);
  assert.deepEqual([...chatsUnderVisionCheck], []);
});

test('a reply whose check the server makes is followed under the reply by its id', async () => {
  const followed = [];
  const { follow, stack } = harness({ watch: async (runId) => { followed.push(runId); return true; } });
  const target = stack.ownerDocument.createElement('div');
  stack.append(target);
  await follow.scheduleServer({ conversation, message: { id: 'm-server' }, targetElement: target, note: { vision: true, visionRunId: 'run-v' } });
  assert.deepEqual(followed, ['run-v']);
});

test('a reply that was told to be checked by the server but whose check was not heard of is looked for, and followed when found', async () => {
  const looks = [];
  const found = [];
  const { follow } = harness({
    find: async () => { looks.push(1); return looks.length < 3 ? null : { runId: 'run-v', kind: 'vision' }; },
    watch: async (runId) => { found.push(runId); return true; }
  });
  await follow.scheduleServer({ conversation, message: { id: 'm-server', parts: [{ text: 'Here.' }, { sandboxFile: { name: 'deck.pptx' } }] }, note: { vision: true } });
  assert.equal(looks.length, 3);
  assert.deepEqual(found, ['run-v']);

  const none = harness({ find: async () => null });
  await none.follow.scheduleServer({ conversation, message: { id: 'm2', parts: [{ text: '````file a.pptx\n{}\n````' }] }, note: { vision: true } });
  assert.deepEqual([...chatsUnderVisionCheck], [], 'no check, no lock');

  // A reply with no presentation is not looked into at all.
  const plain = harness({ find: async () => assert.fail('not looked for') });
  assert.equal(await plain.follow.scheduleServer({ conversation, message: { id: 'm3', parts: [{ text: 'Just words.' }] }, note: { vision: true } }), null);
});

test('the lock is the union of the page\'s own checks and the server\'s', () => {
  setVisionLocked('page', ['a']);
  setVisionLocked('server', ['b']);
  assert.deepEqual([...chatsUnderVisionCheck].sort(), ['a', 'b']);
  setVisionLocked('page', []);
  assert.deepEqual([...chatsUnderVisionCheck], ['b']);
  setVisionLocked('server', []);
  assert.deepEqual([...chatsUnderVisionCheck], []);
});
