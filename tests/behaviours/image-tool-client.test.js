import assert from 'node:assert/strict';
import test from 'node:test';

import { createImageAskCards } from '../../src/app/ui/sandbox/image-ask-card.js';
import { createSandboxLedger } from '../../src/app/ui/sandbox/sandbox-ledger.js';
import { createImageAnswerHandler } from '../../src/app/runtime/image-tool/image-answer.js';
import { registerToolModelsBridge, rememberImageAlways } from '../../src/app/runtime/tool-models/tool-models-bridge.js';
import { createDom } from './helpers/create-dom.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));
const ASK = { type: 'image', event: 'ask', kind: 'draw', id: 'ask-image-1', model: { id: 'openai/gpt-image-2.5-flare', name: 'GPT Image' }, prompt: 'A blue living room with a water jug on the table', count: 1, references: [{ round: 2, source: 'generated', number: 3 }], waitMs: 600000 };

test('the card names the picture model, shows the prompt and has three answers; the answer settles it when the server says so', async () => {
  const dom = createDom('<div id="host"></div>');
  try {
    const answers = [];
    const cards = createImageAskCards({ document: dom.document, host: dom.document.getElementById('host'), language: 'en', onAnswer: async (answer) => { answers.push(answer); return { ok: true }; } });
    cards.handle(ASK);
    cards.handle(ASK);
    assert.equal(dom.document.querySelectorAll('.image-ask').length, 1);
    assert.equal(dom.document.querySelector('.net-ask-title').textContent, 'Draw a picture with “GPT Image”?');
    assert.equal(dom.document.querySelector('.image-ask-prompt').textContent, ASK.prompt);
    assert.deepEqual([...dom.document.querySelectorAll('.net-ask-button')].map((button) => button.textContent), ['Allow once', 'Always allow', 'Refuse']);
    assert.equal(cards.open, 1);
    dom.document.querySelectorAll('.net-ask-button')[0].click();
    await flush();
    assert.deepEqual(answers, [{ id: 'ask-image-1', decision: 'once' }]);
    assert.equal(dom.document.querySelector('.image-ask').classList.contains('is-resolved'), false);
    cards.handle({ type: 'image', event: 'answer', id: 'ask-image-1', answer: 'once' });
    assert.equal(dom.document.querySelector('.net-ask-title').textContent, 'Allowed to draw');
    assert.equal(dom.document.querySelectorAll('.net-ask-button').length, 0);
    assert.equal(cards.open, 0);
  } finally {
    dom.close?.();
  }
});

test('a refusal and a question nobody answered are shown as refused; a send that failed can be tried again', async () => {
  const dom = createDom('<div id="host"></div>');
  try {
    let ok = false;
    const cards = createImageAskCards({ document: dom.document, host: dom.document.getElementById('host'), language: 'en', onAnswer: async () => ({ ok }) });
    cards.handle(ASK);
    cards.handle({ ...ASK, id: 'ask-image-2' });
    dom.document.querySelector('.net-ask-button').click();
    await flush();
    assert.equal(dom.document.querySelector('.net-ask-failed').hidden, false);
    assert.equal(dom.document.querySelector('.net-ask-button').disabled, false);
    ok = true;
    cards.handle({ type: 'image', event: 'answer', id: 'ask-image-1', answer: 'deny' });
    cards.handle({ type: 'image', event: 'answer', id: 'ask-image-2', answer: 'timeout' });
    assert.deepEqual([...dom.document.querySelectorAll('.net-ask-title')].map((node) => node.textContent), ['You refused to draw', 'No answer in time, nothing was drawn']);
    assert.ok([...dom.document.querySelectorAll('.image-ask')].every((node) => node.classList.contains('is-refused')));
  } finally {
    dom.close?.();
  }
});

test('the answer handler sends the answer, and "always" is kept in the settings', async () => {
  const sent = [];
  const config = { permissions: { imageGeneration: 'ask' } };
  let saves = 0;
  registerToolModelsBridge({ getConfig: () => config, saveConfig: async () => { saves += 1; } });
  const handler = createImageAnswerHandler({ getRun: () => ({ answerImage: async (id, decision) => { sent.push([id, decision]); return { ok: true }; } }) });
  assert.deepEqual(await handler({ id: 'a', decision: 'once' }), { ok: true, answered: true });
  assert.equal(config.permissions.imageGeneration, 'ask');
  assert.deepEqual(await handler({ id: 'b', decision: 'always' }), { ok: true, answered: true });
  assert.equal(config.permissions.imageGeneration, 'always');
  assert.equal(saves, 1);
  assert.deepEqual(sent, [['a', 'once'], ['b', 'always']]);
  assert.deepEqual(await createImageAnswerHandler({ getRun: () => null })({ id: 'c', decision: 'once' }), { ok: false });
  const failing = createImageAnswerHandler({ getRun: () => ({ answerImage: async () => ({ ok: false }) }) });
  config.permissions.imageGeneration = 'ask';
  assert.deepEqual(await failing({ id: 'd', decision: 'always' }), { ok: false });
  assert.equal(config.permissions.imageGeneration, 'ask', 'a refused send keeps nothing');
  registerToolModelsBridge(null);
  assert.equal(await rememberImageAlways(), false);
});

test('the step list draws a picture as a row of its own and the card above the steps; the row ends with the picture', async () => {
  const dom = createDom('<div id="host"></div>');
  let ledger = null;
  try {
    ledger = createSandboxLedger({ document: dom.document, host: dom.document.getElementById('host'), language: 'en', summary: true, open: true, onImageAnswer: async () => ({ ok: true }) });
    ledger.event({ type: 'image', event: 'start', label: 'Drawing…', references: [] });
    const row = dom.document.querySelector('.ledger-row[data-kind="image"]');
    assert.ok(row, 'the row has the picture icon');
    ledger.event({ ...ASK });
    await flush();
    assert.match(dom.document.querySelector('.sandbox-run, .ledger-label')?.textContent || '', /./);
    assert.equal(dom.document.querySelectorAll('.image-ask').length, 1);
    assert.match(dom.document.body.textContent, /Waiting for you: draw this picture\?/);
    ledger.event({ type: 'image', event: 'answer', kind: 'draw', id: 'ask-image-1', answer: 'once' });
    await flush();
    assert.doesNotMatch(dom.document.body.textContent, /Waiting for you: draw this picture\?/);
    ledger.event({ type: 'image', event: 'done', count: 1, references: [], label: 'Drew a picture' });
    assert.match(row.textContent, /Drew a picture/);
    assert.equal(row.classList.contains('is-failed'), false);
  } finally {
    ledger?.remove();
    dom.close?.();
  }
});

test('a refusal ends the row with the refusal, a failed drawing marks it failed', async () => {
  const dom = createDom('<div id="host"></div>');
  let ledger = null;
  try {
    ledger = createSandboxLedger({ document: dom.document, host: dom.document.getElementById('host'), language: 'en', summary: false });
    ledger.event({ type: 'image', event: 'start', label: 'Drawing…', references: [] });
    ledger.event({ ...ASK });
    await flush();
    ledger.event({ type: 'image', event: 'answer', kind: 'draw', id: 'ask-image-1', answer: 'deny' });
    await flush();
    const first = dom.document.querySelector('.ledger-row[data-kind="image"]');
    assert.match(first.textContent, /You refused to draw/);
    ledger.event({ type: 'image', event: 'start', label: 'Drawing…', references: [] });
    ledger.event({ type: 'image', event: 'failed', label: 'The picture was not made' });
    const rows = dom.document.querySelectorAll('.ledger-row[data-kind="image"]');
    assert.equal(rows.length, 2);
    assert.equal(rows[1].classList.contains('is-failed'), true);
  } finally {
    ledger?.remove();
    dom.close?.();
  }
});

// The small card that asks which picture is meant.
import { createImagePickCards } from '../../src/app/ui/sandbox/image-pick-card.js';

const THUMB = { mimeType: 'image/jpeg', data: 'AAAA' };
const PICK = { type: 'image', event: 'ask', kind: 'pick', id: 'ask-pick-1', title: 'Which one is the blue living room?', step: 1, of: 2, waitMs: 600000, candidates: [
  { round: 2, source: 'generated', number: 3, caption: 'Round 2, drawn by you, picture 3:', thumb: THUMB },
  { round: 6, source: 'generated', number: 3, caption: 'Round 6, drawn by you, picture 3:', thumb: THUMB },
  { round: 3, source: 'user', number: 3, caption: 'Round 3, sent by the user, picture 3 "bear.jpg":', thumb: null }
] };

test('the pick card has the question, a counter, the candidates with their number, and a tap is the answer', async () => {
  const dom = createDom('<div id="host"></div>');
  try {
    const answers = [];
    const cards = createImagePickCards({ document: dom.document, host: dom.document.getElementById('host'), language: 'en', onAnswer: async (answer) => { answers.push(answer); return { ok: true, answered: true }; } });
    cards.handle(PICK);
    cards.handle(PICK);
    assert.equal(dom.document.querySelectorAll('.image-pick').length, 1);
    assert.equal(dom.document.querySelector('.net-ask-title').textContent, 'Which one is the blue living room?');
    assert.equal(dom.document.querySelector('.image-pick-count').textContent, '1/2');
    const candidates = [...dom.document.querySelectorAll('.image-pick-cand')];
    assert.equal(candidates.length, 3);
    assert.deepEqual(candidates.map((node) => node.querySelector('.picture-number').textContent), ['3', '3', '3']);
    assert.equal(candidates[0].querySelector('img').src.startsWith('data:image/jpeg;base64,'), true);
    assert.equal(candidates[2].querySelector('img'), null, 'a picture without a small copy shows its number alone');
    assert.equal(candidates[0].getAttribute('aria-label'), 'Choose this one: round 2, picture 3');
    assert.equal(dom.document.querySelector('.image-pick .net-ask-button').textContent, 'Retry');
    candidates[1].click();
    await flush();
    assert.deepEqual(answers, [{ id: 'ask-pick-1', decision: 'pick:1' }]);
    assert.equal(cards.open, 1, 'it folds when the server says it took the answer');
    cards.handle({ type: 'image', event: 'answer', kind: 'pick', id: 'ask-pick-1', answer: 'pick:1' });
    assert.equal(cards.open, 0);
    assert.equal(dom.document.querySelector('.image-picked-text').textContent, 'Used picture 3');
    assert.equal(dom.document.querySelectorAll('.image-pick-cand').length, 0);
    dom.document.querySelector('.image-pick-text-button').click();
    await flush();
    assert.deepEqual(answers.at(-1), { id: 'ask-pick-1', decision: 'redo' });
    assert.equal(dom.document.querySelector('.image-pick-text-button').textContent, 'Choosing again…');
  } finally {
    dom.close?.();
  }
});

test('"none of these" asks again, a change that comes too late is taken away, a failed send can be tried again', async () => {
  const dom = createDom('<div id="host"></div>');
  try {
    let result = { ok: false };
    const cards = createImagePickCards({ document: dom.document, host: dom.document.getElementById('host'), language: 'en', onAnswer: async () => result });
    cards.handle(PICK);
    dom.document.querySelector('.image-pick .net-ask-button').click();
    await flush();
    assert.equal(dom.document.querySelector('.net-ask-failed').hidden, false);
    assert.equal(dom.document.querySelector('.image-pick-cand').disabled, false);
    cards.handle({ type: 'image', event: 'answer', kind: 'pick', id: 'ask-pick-1', answer: 'retry' });
    assert.equal(dom.document.querySelector('.image-picked-text').textContent, 'None of them, looking again');
    cards.handle({ ...PICK, id: 'ask-pick-2' });
    cards.handle({ type: 'image', event: 'answer', kind: 'pick', id: 'ask-pick-2', answer: 'pick:0' });
    result = { ok: true, answered: false };
    dom.document.querySelector('.image-pick-text-button').click();
    await flush();
    assert.equal(dom.document.querySelector('.image-pick-text-button'), null);
  } finally {
    dom.close?.();
  }
});

test('the step list sends the pick questions to their own card and waits for the answer', async () => {
  const dom = createDom('<div id="host"></div>');
  let ledger = null;
  try {
    ledger = createSandboxLedger({ document: dom.document, host: dom.document.getElementById('host'), language: 'en', summary: true, open: true, onImageAnswer: async () => ({ ok: true }) });
    ledger.event(PICK);
    await flush();
    assert.equal(dom.document.querySelectorAll('.image-pick').length, 1);
    assert.match(dom.document.body.textContent, /Waiting for you to choose/);
    ledger.event({ type: 'image', event: 'answer', kind: 'pick', id: 'ask-pick-1', answer: 'pick:0' });
    await flush();
    assert.doesNotMatch(dom.document.body.textContent, /Waiting for you to choose/);
    ledger.event({ type: 'image', event: 'start', label: 'Drawing…', references: [] });
    ledger.event({ type: 'image', event: 'stopped', label: 'Stopped.' });
    assert.match(dom.document.querySelector('.ledger-row[data-kind="image"]').textContent, /Stopped\./);
  } finally {
    ledger?.remove();
    dom.close?.();
  }
});
