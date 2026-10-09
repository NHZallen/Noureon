import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createQuizStores } from '../src/app/runtime/quiz/quiz-store.js';
import { createQuizWatch } from '../src/app/runtime/quiz/quiz-watch.js';
import { hydrateQuizCards, memoryStore } from '../src/app/ui/quiz/quiz-card.js';

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const QUIZ = JSON.stringify({
  title: 'T',
  questions: [
    { type: 'single', question: 'Q1', options: [{ text: 'right', why: 'because' }, { text: 'wrong', why: 'no' }], answer: 0, explanation: 'more' },
    { type: 'single', question: 'Q2', options: [{ text: 'yes', why: 'y' }, { text: 'no', why: 'n' }], answer: 1 }
  ]
});

// A page with one message of a conversation, in the way the chat draws it: the element has the index and carries the message.
function chat({ conversation = {}, message = { id: 'm1', role: 'model', parts: [{ text: 'x' }] }, inList = true } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const document = window.document;
  const element = document.createElement('div');
  element.dataset.messageIndex = '0';
  element.innerHTML = `<div class="quiz-card" data-quiz="${encodeURIComponent(QUIZ)}"></div>`;
  element.__astraRenderedMessage = message;
  document.body.append(element);
  const active = { id: 'c1', messages: inList ? [message] : [], ...conversation };
  return { window, document, element, message, conversation: active, card: element.querySelector('.quiz-card') };
}
const manual = () => {
  const jobs = [];
  return { schedule: (task) => { jobs.push(task); return jobs.length; }, run: () => { const todo = jobs.splice(0); todo.forEach((job) => job()); }, pending: () => jobs.length };
};
const click = (node) => node.dispatchEvent(new node.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
const pickByText = (card, text) => [...card.querySelectorAll('[data-option]')].find((button) => button.textContent.includes(text));
const primary = (card) => card.querySelector('[data-focus="primary"]');

test('what a person answers is kept on the message, saved once after a short wait, and the conversation is marked as changed', () => {
  memoryStore.clear();
  const { document, card, message, conversation } = chat({ conversation: { lastUpdatedAt: '2020-01-01T00:00:00.000Z' } });
  const saves = [];
  const timers = manual();
  const storeFor = createQuizStores({ memory: memoryStore, getActiveConversation: () => conversation, saveAppData: async () => { saves.push(1); }, schedule: timers.schedule });
  hydrateQuizCards({ root: document, language: 'en', storeFor });
  click(pickByText(card, 'right'));
  click(pickByText(card, 'wrong'));
  click(primary(card));
  assert.equal(saves.length, 0, 'not saved at every click');
  assert.equal(timers.pending(), 1, 'one save is waiting');
  timers.run();
  assert.equal(saves.length, 1);
  const kept = Object.values(message.metadata.quiz);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].phase, 'checked');
  assert.deepEqual(Object.values(kept[0].results).map((answer) => answer.correct), [false], 'the answer is there: it was wrong');
  assert.notEqual(conversation.lastUpdatedAt, '2020-01-01T00:00:00.000Z');
  assert.ok(JSON.stringify(message.metadata).length < 2000, 'a small record');
});

test('a conversation opened again shows the answers and goes on where it was left', () => {
  memoryStore.clear();
  const first = chat();
  const timers = manual();
  const stores = (page) => createQuizStores({ memory: memoryStore, getActiveConversation: () => page.conversation, saveAppData: async () => {}, schedule: timers.schedule });
  hydrateQuizCards({ root: first.document, language: 'en', storeFor: stores(first) });
  click(pickByText(first.card, 'wrong'));
  click(primary(first.card));
  assert.ok(first.card.querySelector('.quiz-band.is-wrong'));
  click(primary(first.card));
  assert.equal(first.card.querySelector('.quiz-question').textContent, 'Q2');
  // The page is gone: only the message (what is saved with the conversation) is left, and the memory of the page is empty.
  memoryStore.clear();
  const saved = JSON.parse(JSON.stringify(first.message));
  const second = chat({ message: saved });
  hydrateQuizCards({ root: second.document, language: 'en', storeFor: stores(second) });
  assert.equal(second.card.querySelector('.quiz-question').textContent, 'Q2', 'it is on the second question');
  assert.equal(second.card.querySelectorAll('.quiz-steps i.is-done').length, 2);
  click(pickByText(second.card, 'no'));
  click(primary(second.card));
  click(primary(second.card));
  assert.equal(second.card.dataset.phase, 'done');
  assert.match(second.card.querySelector('.quiz-score').textContent, /1 \/ 2/, 'the first answer (wrong) was kept: one of two');
  assert.equal(second.card.querySelector('.quiz-misses li').textContent.includes('Q1'), true);
});

test('two quizzes in one message are kept apart', () => {
  memoryStore.clear();
  const page = chat();
  const other = JSON.stringify({ title: 'Other', questions: [{ question: 'Other?', options: [{ text: 'a' }, { text: 'b' }], answer: 0 }] });
  page.element.insertAdjacentHTML('beforeend', `<div class="quiz-card" data-quiz="${encodeURIComponent(other)}"></div>`);
  const storeFor = createQuizStores({ memory: memoryStore, getActiveConversation: () => page.conversation, saveAppData: async () => {}, schedule: manual().schedule });
  hydrateQuizCards({ root: page.document, language: 'en', storeFor });
  const [first, second] = page.document.querySelectorAll('.quiz-card');
  click(pickByText(first, 'right'));
  click(primary(first));
  assert.equal(Object.keys(page.message.metadata.quiz).length, 1);
  click(pickByText(second, 'a'));
  click(primary(second));
  assert.equal(Object.keys(page.message.metadata.quiz).length, 2);
});

test('a temporary chat, a message that is not in the open conversation, and a card outside a message keep the answers only in the page', () => {
  memoryStore.clear();
  const timers = manual();
  const make = (page) => createQuizStores({ memory: memoryStore, getActiveConversation: () => page.conversation, saveAppData: async () => { throw new Error('must not save'); }, schedule: timers.schedule });
  for (const page of [chat({ conversation: { isTemporary: true } }), chat({ conversation: { retentionMode: 'ephemeral' } }), chat({ inList: false })]) {
    memoryStore.clear();
    const store = make(page)(page.card);
    assert.equal(store, memoryStore);
    hydrateQuizCards({ root: page.document, language: 'en', storeFor: make(page) });
    click(pickByText(page.card, 'right'));
    click(primary(page.card));
    assert.equal(page.message.metadata, undefined, 'nothing written on the message');
  }
  assert.equal(timers.pending(), 0);
  const window = new Window();
  window.document.body.innerHTML = '<div class="quiz-card"></div>';
  assert.equal(make(chat())(window.document.querySelector('.quiz-card')), memoryStore, 'outside a chat message');
});

test('the message is found by its id when the page holds another copy of it', () => {
  memoryStore.clear();
  const page = chat();
  const own = { id: 'm1', role: 'model', parts: [{ text: 'x' }] };
  page.conversation.messages = [own];
  const storeFor = createQuizStores({ memory: memoryStore, getActiveConversation: () => page.conversation, saveAppData: async () => {}, schedule: manual().schedule });
  storeFor(page.card).set('k', { v: 1 });
  assert.deepEqual(own.metadata.quiz.k, { v: 1 }, 'written on the message of the conversation');
  assert.equal(page.message.metadata, undefined);
});

test('a message that is not on the page yet is waited for: no store, and no card made', () => {
  const page = chat();
  delete page.element.__astraRenderedMessage;
  const storeFor = createQuizStores({ memory: memoryStore, getActiveConversation: () => page.conversation });
  assert.equal(storeFor(page.card), null);
  hydrateQuizCards({ root: page.document, language: 'en', storeFor });
  assert.equal(page.card.dataset.ready, undefined);
  assert.equal(page.card.querySelector('.quiz-question'), null);
});

test('a record that is too large for the cloud is not put on the message', () => {
  memoryStore.clear();
  const page = chat();
  const storeFor = createQuizStores({ memory: memoryStore, getActiveConversation: () => page.conversation, saveAppData: async () => {}, schedule: manual().schedule });
  const store = storeFor(page.card);
  store.set('big', { v: 1, filler: 'x'.repeat(9000) });
  assert.equal(page.message.metadata, undefined);
  assert.equal(store.get('big').v, 1, 'still kept in the page');
  store.set('small', { v: 2 });
  assert.deepEqual(Object.keys(page.message.metadata.quiz), ['small']);
});

test('the watcher finds the message of a card that arrives before its message is attached, and makes the card', async () => {
  memoryStore.clear();
  const window = new Window({ url: 'https://example.test/' });
  const document = window.document;
  const message = { id: 'm1', role: 'model', parts: [{ text: 'x' }] };
  const conversation = { id: 'c1', messages: [message] };
  createQuizWatch({ document, getUiLanguage: () => 'en', getActiveConversation: () => conversation, saveAppData: async () => {}, logger: { warn: () => {} } });
  const element = document.createElement('div');
  element.dataset.messageIndex = '0';
  element.innerHTML = `<div class="quiz-card" data-quiz="${encodeURIComponent(QUIZ)}"></div>`;
  document.body.append(element);
  await tick(60);
  assert.equal(element.querySelector('.quiz-question'), null, 'the message is not attached yet');
  element.__astraRenderedMessage = message;
  await tick(400);
  assert.ok(element.querySelector('.quiz-question'), 'made once the message is there');
  window.close?.();
});
