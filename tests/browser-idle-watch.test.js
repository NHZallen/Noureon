// The tag of a finished browser task counts down the idle time of the browser and says when the host closed it (ui/browser-agent/browser-idle-watch.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createBrowserIdleWatch } from '../src/app/ui/browser-agent/browser-idle-watch.js';
import { sandboxText } from '../src/app/runtime/sandbox/sandbox-texts.js';

const setup = (status) => {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = '<div class="bcard-pill is-tag"><span class="bcard-text">Done</span></div>';
  const clock = { t: 1_000_000 };
  const notes = [];
  let answer = status;
  const watch = createBrowserIdleWatch({
    document, getActiveConversation: () => ({ id: 'c1' }), getStatus: async () => answer, words: (key, params) => sandboxText('en', key, params),
    showNotification: (message) => notes.push(message), now: () => clock.t, setRepeat: () => null, clearRepeat: () => {}
  });
  return { window, document, watch, clock, notes, text: () => document.querySelector('.bcard-text').textContent, set: (value) => { answer = value; } };
};

test('more than twenty minutes of idle time left: the tag is not touched; from twenty minutes it counts down, with a notice at twenty and at ten', async () => {
  const t = setup({ open: true, conversationId: 'c1', idleMsLeft: 25 * 60_000 });
  try {
    await t.watch.poll();
    assert.equal(t.text(), 'Done');
    t.clock.t += 5 * 60_000; // twenty minutes left
    t.watch.show();
    assert.equal(t.text(), 'Idle · closes in 20 min');
    assert.deepEqual(t.notes, ['Idle · closes in 20 min']);
    t.clock.t += 60_000;
    t.watch.show();
    assert.equal(t.text(), 'Idle · closes in 19 min', 'the number changes every minute');
    t.clock.t += 9 * 60_000; // ten minutes left
    t.watch.show();
    assert.equal(t.text(), 'Idle · closes in 10 min');
    assert.deepEqual(t.notes, ['Idle · closes in 20 min', 'Idle · closes in 10 min']);
    t.clock.t += 60_000;
    t.watch.show();
    assert.equal(t.text(), 'Idle · closes in 9 min');
    assert.equal(t.notes.length, 2, 'no more notices, only the number');
  } finally {
    t.window.happyDOM.abort();
  }
});

test('the browser was used again: the tag has its own words back and the notices may come again; a browser of another conversation is not counted', async () => {
  const t = setup({ open: true, conversationId: 'c1', idleMsLeft: 15 * 60_000 });
  try {
    await t.watch.poll();
    assert.equal(t.text(), 'Idle · closes in 15 min');
    t.set({ open: true, conversationId: 'c1', idleMsLeft: 30 * 60_000 });
    await t.watch.poll();
    assert.equal(t.text(), 'Done');
    t.set({ open: true, conversationId: 'other', idleMsLeft: 5 * 60_000 });
    await t.watch.poll();
    assert.equal(t.text(), 'Done');
  } finally {
    t.window.happyDOM.abort();
  }
});

test('the host closed the browser because it sat idle: the tag says so, at once; a server that does not answer changes nothing', async () => {
  const t = setup({ open: true, conversationId: 'c1', idleMsLeft: 12 * 60_000 });
  try {
    await t.watch.poll();
    t.set(null);
    await t.watch.poll();
    assert.equal(t.text(), 'Idle · closes in 12 min');
    t.set({ open: false, closedReason: 'idle' });
    await t.watch.poll();
    assert.equal(t.text(), 'Closed (idle for too long)');
    t.set({ open: false });
    await t.watch.poll();
    assert.equal(t.text(), 'Done', 'nothing to say any more');
  } finally {
    t.window.happyDOM.abort();
  }
});

test('a page opened with eight minutes left says the notice once, not twice', async () => {
  const t = setup({ open: true, conversationId: 'c1', idleMsLeft: 8 * 60_000 });
  try {
    await t.watch.poll();
    assert.deepEqual(t.notes, ['Idle · closes in 8 min']);
  } finally {
    t.window.happyDOM.abort();
  }
});
