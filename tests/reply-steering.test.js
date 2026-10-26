import assert from 'node:assert/strict';
import test from 'node:test';

import { REPLY_INPUT_MODES, normalizeReplyInputMode, replySteering } from '../src/app/runtime/features/reply-steering.js';
import { replySteeringText } from '../src/app/runtime/features/reply-steering-texts.js';

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

/** A page with a reply running (`controller`), the setting, and what the page was asked to do (`log`). */
function setup({ mode = 'steer', steerable = true, running = true } = {}) {
  const log = [];
  let controller = running ? { abort: () => { log.push('abort'); controller = null; } } : null;
  replySteering.configure({
    getConfig: () => ({ replyInputMode: mode }),
    getAbortController: () => controller,
    submitChatForm: () => log.push('submit'),
    isSteerable: () => steerable,
    onChange: () => log.push('change')
  });
  return { log, finishReply: () => { controller = null; } };
}

test('the setting is one of three, and anything else is steer', () => {
  assert.deepEqual([...REPLY_INPUT_MODES], ['steer', 'queue', 'send-now']);
  assert.equal(normalizeReplyInputMode('queue'), 'queue');
  assert.equal(normalizeReplyInputMode('send-now'), 'send-now');
  assert.equal(normalizeReplyInputMode('whatever'), 'steer');
  assert.equal(normalizeReplyInputMode(undefined), 'steer');
});

test('with nothing in the box, or with no reply running, the press is not taken (the page stops the reply, or sends as ever)', () => {
  const { log } = setup();
  replySteering.setDraft(false);
  assert.equal(replySteering.press(), false);
  const idle = setup({ running: false });
  replySteering.setDraft(true);
  assert.equal(replySteering.press(), false);
  assert.deepEqual([...log, ...idle.log], []);
});

test('send now stops the reply, waits until it is over, and sends what is in the box', async () => {
  const { log } = setup({ mode: 'send-now' });
  replySteering.setDraft(true);
  assert.equal(replySteering.press(), true);
  await tick(120);
  assert.deepEqual(log, ['abort', 'submit']);
});

test('steer does the same as send now for a reply that can be steered, until the server takes steering, and queues where nothing may be stopped by accident', async () => {
  const stops = setup({ mode: 'steer', steerable: true });
  replySteering.setDraft(true);
  assert.equal(replySteering.press(), true);
  await tick(120);
  assert.deepEqual(stops.log, ['abort', 'submit']);
  const queues = setup({ mode: 'steer', steerable: false });
  replySteering.setDraft(true);
  assert.equal(replySteering.press(), true);
  assert.equal(replySteering.isQueued(), true);
  assert.deepEqual(queues.log, ['change'], 'nothing was stopped');
});

test('a queued message waits in the box and goes when the reply ends; pressing again does nothing more', async () => {
  const { log, finishReply } = setup({ mode: 'queue' });
  replySteering.setDraft(true);
  assert.equal(replySteering.press(), true);
  assert.equal(replySteering.isQueued(), true);
  assert.equal(replySteering.press(), true, 'taken, and not queued twice');
  assert.deepEqual(log, ['change']);
  finishReply();
  replySteering.onReplyEnded();
  await tick();
  assert.deepEqual(log, ['change', 'change', 'submit']);
  assert.equal(replySteering.isQueued(), false);
});

test('a message that was taken out of the queue, or whose box was emptied, or whose reply was stopped by the person, does not go', async () => {
  let { log } = setup({ mode: 'queue' });
  replySteering.setDraft(true);
  replySteering.press();
  replySteering.cancelQueue();
  replySteering.onReplyEnded();
  await tick();
  assert.equal(log.includes('submit'), false, 'cancelled');
  ({ log } = setup({ mode: 'queue' }));
  replySteering.setDraft(true);
  replySteering.press();
  replySteering.setDraft(false);
  assert.equal(replySteering.isQueued(), false, 'an emptied box takes it out');
  replySteering.onReplyEnded();
  await tick();
  assert.equal(log.includes('submit'), false, 'emptied');
});

test('every word of the choice is in the five languages', () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of ['setting', 'hint', 'steer', 'queue', 'sendNow', 'queued', 'cancelQueue']) {
      assert.ok(replySteeringText(language, key).trim() && replySteeringText(language, key) !== key, `${language} ${key}`);
    }
  }
  assert.notEqual(replySteeringText('fr', 'queue'), replySteeringText('en', 'queue'));
});

// The page: the box and the button as the composer binds them.
import { Window } from 'happy-dom';
import { bindComposerInput } from '../src/app/runtime/features/composer-input-bindings.js';

function page({ mode, running = true, steerable = true }) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<div class="input-wrapper"><textarea id="m"></textarea></div><button id="s" type="button"></button>';
  const messageInput = document.getElementById('m');
  const submitButton = document.getElementById('s');
  const log = [];
  let controller = running ? { abort: () => { log.push('abort'); controller = null; } } : null;
  bindComposerInput({
    window, document, elements: { messageInput, submitButton, inputIndicatorContainer: null }, setSendConfirmed: () => {}, updateInputState: () => {}, adjustTextareaHeight: () => {},
    submitChatForm: () => log.push('submit'), getActiveConversation: () => ({}), getAbortController: () => controller, scheduleAnimationFrame: () => {}, scheduleTimeout: () => {},
    getConfig: () => ({ replyInputMode: mode }), isSteerable: () => steerable, renderInputIndicators: () => log.push('indicators')
  });
  const press = (key) => messageInput.dispatchEvent(new window.KeyboardEvent('keydown', { key, cancelable: true }));
  return { log, submitButton, press, finish: () => { controller = null; } };
}

test('in the page: with something in the box the button and Enter go to the choice, with nothing the button stops the reply and Enter does nothing', async () => {
  const empty = page({ mode: 'queue' });
  replySteering.setDraft(false);
  empty.submitButton.click();
  assert.deepEqual(empty.log, ['abort']);
  const idleEnter = page({ mode: 'queue' });
  replySteering.setDraft(false);
  idleEnter.press('Enter');
  assert.deepEqual(idleEnter.log, [], 'Enter with nothing in the box neither stops nor sends');

  const queue = page({ mode: 'queue' });
  replySteering.setDraft(true);
  queue.press('Enter');
  assert.equal(replySteering.isQueued(), true);
  assert.deepEqual(queue.log, ['indicators']);
  queue.finish();
  replySteering.onReplyEnded();
  await tick();
  assert.deepEqual(queue.log, ['indicators', 'indicators', 'submit']);

  const now = page({ mode: 'send-now' });
  replySteering.setDraft(true);
  now.submitButton.click();
  await tick(120);
  assert.deepEqual(now.log, ['abort', 'submit']);

  // The person stops a reply that has a message waiting: the message stays in the box and does not go.
  const stopped = page({ mode: 'queue' });
  replySteering.setDraft(true);
  stopped.press('Enter');
  replySteering.setDraft(false);
  stopped.submitButton.click();
  stopped.finish();
  replySteering.onReplyEnded();
  await tick();
  assert.equal(stopped.log.includes('submit'), false);
});
