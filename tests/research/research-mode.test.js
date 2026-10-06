import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createResearchMode, PLAN_INDICATOR_ID, RESEARCH_INDICATOR_ID } from '../../src/app/runtime/research/research-mode.js';
import { getResearchMode } from '../../src/app/runtime/research/research-bridge.js';
import { resetResearchStore, updateResearch } from '../../src/app/runtime/research/research-store.js';
import { chipCloseButton } from '../../src/app/runtime/features/composer-chip.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 15));

function harness({ model = { provider: 'openrouter', id: 'm' }, tools = true, key = true, account = true, image = false, council = false, temporary = false, started = { ok: true, run: { runId: 'run-1' } }, controlResult = { ok: true } } = {}) {
  resetResearchStore();
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = '<div id="file-options-popover"><button id="learning-mode-btn"></button></div>';
  const input = { value: '', focused: 0, events: [], ownerDocument: document, focus() { this.focused += 1; }, dispatchEvent(event) { this.events.push(event.type); return true; } };
  const log = { notices: [], prepared: 0, refreshed: 0, released: [], controls: [], startArgs: [], closed: 0, binding: [] };
  const conversation = { id: 'c1', messages: [{ role: 'user', parts: [{ text: 'x' }] }], ...(temporary ? { retentionMode: 'ephemeral' } : {}) };
  const mode = createResearchMode({
    document,
    getActiveConversation: () => conversation,
    normalizeConversationModel: () => model,
    modelSupportsToolCalling: () => tools,
    isImageConversation: () => image,
    isCouncilEnabled: () => council,
    serverReply: {
      hasAccount: () => account,
      startResearch: async (args) => { log.startArgs.push(args); return started; },
      watchRun: async () => false,
      readMessage: async () => null,
      request: async (method, path, options) => { log.controls.push([method, path, options?.body]); return controlResult; }
    },
    researchTools: { hasKey: () => key },
    prepare: async () => { log.prepared += 1; return { shouldContinue: true, conversation, loadingMessageDiv: null, userMessage: input.value }; },
    messageInput: input,
    addMessageToUI: (message, index, save, scroll, options) => { options.conversation.messages.push(message); return null; },
    saveAppData: async () => {},
    showNotification: (text, kind) => log.notices.push([text, kind]),
    getConfig: () => ({}),
    getUiLanguage: () => 'en',
    setAbortController: (value) => log.released.push(value),
    updateSubmitButtonState: (...args) => log.binding.push(['submit.updateSubmitButtonState', ...args]),
    refresh: () => { log.refreshed += 1; },
    closeAllPopovers: () => { log.closed += 1; },
    logger: { warn: () => {} }
  });
  return { mode, document, input, log, conversation };
}

test('the menu item is made once, in the "+" menu before learning mode, and is hidden where a research cannot be', () => {
  const { mode, document } = harness();
  mode.syncMenu();
  mode.syncMenu();
  const popover = document.getElementById('file-options-popover');
  const buttons = [...popover.children].map((child) => child.id);
  assert.deepEqual(buttons, ['research-mode-menu-btn', 'learning-mode-btn']);
  const button = document.getElementById('research-mode-menu-btn');
  assert.equal(button.querySelector('.composer-menu-label').textContent, 'Deep research');
  assert.match(button.querySelector('img').getAttribute('src'), /deep-research\.png/);
  assert.equal(button.style.display, 'flex');
  const council = harness({ council: true });
  council.mode.syncMenu();
  assert.equal(council.document.getElementById('research-mode-menu-btn').style.display, 'none');
  assert.equal(getResearchMode() !== null, true, 'the cards can reach it');
});

test('choosing it arms the chip; a model, a key or an account that is missing says why instead', () => {
  const tries = [
    [{ model: { provider: 'gemini' } }, /does not support Gemini/],
    [{ tools: false }, /cannot call search tools/],
    [{ key: false }, /Tavily or TinyFish/],
    [{ account: false }, /sign in to your cloud account/]
  ];
  for (const [options, message] of tries) {
    const { mode, log } = harness(options);
    mode.toggle();
    assert.match(log.notices[0][0], message);
    assert.equal(mode.takes(), false);
  }
  const { mode, log, input } = harness();
  mode.toggle();
  assert.equal(mode.takes(), true);
  assert.equal(log.closed, 1, 'the "+" menu closes');
  assert.equal(input.focused, 1);
  const map = new Map();
  mode.indicators(map, chipCloseButton);
  assert.deepEqual([...map.keys()], [RESEARCH_INDICATOR_ID]);
  assert.match(map.get(RESEARCH_INDICATOR_ID).html, /Deep research/);
  assert.match(map.get(RESEARCH_INDICATOR_ID).html, /close-research-btn-input/);
  mode.toggle();
  assert.equal(mode.takes(), false, 'a second choice turns it off');
  assert.equal(mode.takes({ preserveComposer: true }), false);
});

test('sending with the chip on: the message is prepared as any, the chip goes after it, and the research starts', async () => {
  const { mode, log, input, conversation } = harness();
  mode.toggle();
  await mode.submit();
  assert.equal(log.prepared, 0, 'nothing is sent without a topic');
  input.value = 'solid-state batteries';
  await mode.submit();
  assert.equal(log.prepared, 1);
  assert.equal(mode.takes(), false, 'the chip is off once it is sent');
  assert.equal(log.startArgs[0].research.topic, 'solid-state batteries');
  assert.equal(conversation.messages.at(-1).parts[1].researchPlan.phase, 'planning');
  assert.deepEqual(log.released, [null], 'the chat is free again');
  assert.deepEqual(log.binding.at(-1), ['submit.updateSubmitButtonState', false]);
});

test('a plan is changed from its card: the countdown is held, the chip carries the plan\'s name, what is sent goes to the plan, and the chip can be given up', async () => {
  const { mode, log, input } = harness();
  assert.equal(await mode.beginEdit({ runId: 'run-1', messageId: 'm1', title: 'Battery research' }), true);
  assert.deepEqual(log.controls[0].slice(0, 2), ['POST', '/v1/runs/run-1/hold']);
  assert.equal(mode.takes(), true);
  assert.equal(mode.isEditing('m1'), true);
  const map = new Map();
  mode.indicators(map, chipCloseButton);
  assert.deepEqual([...map.keys()], [PLAN_INDICATOR_ID]);
  assert.match(map.get(PLAN_INDICATOR_ID).html, /Battery research/);
  input.value = '  only the cost  ';
  await mode.submit();
  assert.equal(log.prepared, 0, 'no message of the chat is made');
  assert.deepEqual(log.controls[1], ['POST', '/v1/runs/run-1/plan', '{"instruction":"only the cost"}']);
  assert.equal(input.value, '', 'the box is emptied');
  assert.deepEqual(input.events, ['input'], 'and told, so it takes its height again');
  assert.equal(mode.takes(), false, 'and the chip is gone: the plan counts down again by itself');

  await mode.beginEdit({ runId: 'run-1', messageId: 'm1', title: 'T' });
  await mode.endEdit();
  assert.deepEqual(log.controls.at(-1).slice(0, 2), ['POST', '/v1/runs/run-1/release']);
  assert.equal(mode.takes(), false);
});

test('an edit the server refuses is told, and the chip is not left on a plan that cannot change', async () => {
  const { mode, log } = harness({ controlResult: { ok: false, status: 409, code: 'wrong_phase' } });
  assert.equal(await mode.beginEdit({ runId: 'run-1', messageId: 'm1', title: 'T' }), false);
  assert.match(log.notices[0][0], /cannot be done right now/);
  assert.equal(mode.takes(), false);
});

test('choosing the research while a plan is being changed lets that plan go on', async () => {
  const { mode, log } = harness();
  await mode.beginEdit({ runId: 'run-1', messageId: 'm1', title: 'T' });
  mode.toggle();
  await flush();
  assert.ok(log.controls.some((entry) => entry[1] === '/v1/runs/run-1/release'));
  assert.equal(mode.takes(), true, 'the new research is armed');
  const map = new Map();
  mode.indicators(map, chipCloseButton);
  assert.deepEqual([...map.keys()], [RESEARCH_INDICATOR_ID]);
});

test('an instruction for the research that runs: nothing is held, what is sent goes to it, and the chip can be given up without a word to the server', async () => {
  const { mode, log, input } = harness();
  assert.equal(await mode.beginEdit({ runId: 'run-1', messageId: 'm1', title: 'Battery research', kind: 'steer' }), true);
  assert.deepEqual(log.controls, [], 'no hold');
  const map = new Map();
  mode.indicators(map, chipCloseButton);
  assert.match(map.get(PLAN_INDICATOR_ID).html, /Add instructions: Battery/);
  input.value = ' cover the cost ';
  await mode.submit();
  assert.deepEqual(log.controls[0], ['POST', '/v1/runs/run-1/steer', '{"instruction":"cover the cost"}']);
  assert.equal(log.prepared, 0, 'no message of the chat is made');
  assert.match(log.notices.at(-1)[0], /Added: the next round will follow it/);
  assert.equal(mode.takes(), false);
  await mode.beginEdit({ runId: 'run-1', messageId: 'm1', title: 'T', kind: 'steer' });
  await mode.endEdit();
  assert.equal(log.controls.length, 1, 'giving it up tells the server nothing');
});

test('while a research is being done in the open chat the box is for instructions: its words, a chip without a way out, and what is sent goes to the research', async () => {
  const { mode, log, input, conversation } = harness();
  assert.equal(mode.placeholder(), null, 'nothing runs: the box is the chat\'s');
  assert.equal(mode.takes(), false);
  conversation.messages.push({ id: 'r1', role: 'model', parts: [{ text: '' }] });
  updateResearch('r1', { runId: 'run-9', plan: { phase: 'awaiting', title: 'Battery research', clock: 1 } });
  assert.equal(mode.placeholder(), null, 'the countdown is not research yet: the plan has its own edit button');
  const before = log.refreshed;
  updateResearch('r1', { plan: { phase: 'researching', title: 'Battery research', clock: 2 } });
  assert.ok(log.refreshed > before, 'the box is told to draw again');
  assert.deepEqual(log.binding.at(-1), ['submit.updateSubmitButtonState', false], 'and its button and words are brought up to date');
  assert.equal(mode.placeholder(), 'Add instructions for the research…');
  assert.equal(mode.takes(), true);
  const map = new Map();
  mode.indicators(map, chipCloseButton);
  assert.match(map.get(PLAN_INDICATOR_ID).html, /Add instructions: Battery/);
  assert.doesNotMatch(map.get(PLAN_INDICATOR_ID).html, /close-research-plan-btn-input/, 'there is no way out: the box is only for this now');
  input.value = ' focus on cost ';
  await mode.submit();
  assert.deepEqual(log.controls.at(-1), ['POST', '/v1/runs/run-9/steer', '{"instruction":"focus on cost"}']);
  assert.equal(log.prepared, 0, 'no message of the chat is made');
  assert.equal(mode.takes(), true, 'and the box goes on being for instructions');
  updateResearch('r1', { plan: { phase: 'writing', title: 'Battery research', clock: 3 } });
  assert.equal(mode.placeholder(), null, 'when the report is being written the box is the chat\'s again');
  assert.equal(mode.takes(), false);
});

test('a temporary chat has no deep research: no menu item, no chip, nothing taken on send', () => {
  const normal = harness();
  normal.mode.syncMenu();
  assert.equal(normal.document.getElementById('research-mode-menu-btn').style.display, 'flex');
  const temporary = harness({ temporary: true });
  temporary.mode.syncMenu();
  assert.equal(temporary.document.getElementById('research-mode-menu-btn').style.display, 'none');
  temporary.mode.toggle();
  const map = new Map();
  temporary.mode.indicators(map, chipCloseButton);
  assert.equal(map.has(RESEARCH_INDICATOR_ID), false);
  assert.equal(temporary.mode.takes(), false);
});
