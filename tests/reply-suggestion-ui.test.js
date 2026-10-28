import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { startReplySuggestion } from '../src/app/ui/reply-suggestion/start-suggestion.js';
import { createReplySuggestionView } from '../src/app/ui/reply-suggestion/suggestion-view.js';
import { emitReplyEnded } from '../src/app/runtime/features/reply-events.js';
import { REPLY_SUGGESTION_TEXTS, replySuggestionText } from '../src/app/runtime/features/reply-suggestion-texts.js';

const flush = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const QUESTION = '我可以做成 A 方案（8 頁精簡版）或 B 方案（15 頁完整版）。要不要採用 A 方案？';

// A box like the page's: a form with an editor that has a `value` (the page's rich editor has one).
function page() {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<div id="message-list"></div><form id="chat-form"><div id="message-input" contenteditable="true"></div></form>';
  const editor = document.getElementById('message-input');
  Object.defineProperty(editor, 'value', { configurable: true, get: () => editor.textContent, set: (value) => { editor.textContent = value; } });
  return { window, document, editor, form: document.getElementById('chat-form'), list: document.getElementById('message-list') };
}

const type = (window, editor, text) => { editor.textContent = text; editor.dispatchEvent(new window.Event('input', { bubbles: true })); };

test('the view shows one line over the empty box, with the arrow, and the box\'s placeholder gives way', () => {
  const { window, document, editor, form } = page();
  try {
    const view = createReplySuggestionView({ document, form, editor, getLabel: () => 'Use this reply' });
    view.show('  好，採用   A 方案 ');
    assert.equal(view.isShown(), true);
    assert.equal(form.classList.contains('has-suggestion'), true);
    assert.equal(document.querySelector('.rs-text').textContent, '好，採用 A 方案');
    const arrow = document.querySelector('.rs-accept');
    assert.equal(arrow.getAttribute('aria-label'), 'Use this reply: 好，採用 A 方案');
    assert.ok(arrow.querySelector('.rs-arrow'));
    view.show('');
    assert.equal(view.isShown(), false);
    assert.equal(form.classList.contains('has-suggestion'), false);
  } finally {
    window.happyDOM.abort();
  }
});

test('the arrow puts the words in the box as real text, with the caret at the end, and the line is gone', () => {
  const { window, document, editor, form } = page();
  try {
    const view = createReplySuggestionView({ document, form, editor });
    const inputs = [];
    editor.addEventListener('input', () => inputs.push(editor.value));
    const accepted = [];
    const again = createReplySuggestionView({ document, form, editor, onAccept: (words) => accepted.push(words) });
    again.show('好，採用 A 方案');
    document.querySelectorAll('.rs-accept')[1].click();
    assert.equal(editor.value, '好，採用 A 方案');
    assert.equal(again.isShown(), false);
    assert.deepEqual(inputs, ['好，採用 A 方案'], 'the box is told it has new words');
    assert.deepEqual(accepted, ['好，採用 A 方案']);
    assert.equal(view.accept(), false);
  } finally {
    window.happyDOM.abort();
  }
});

test('Tab takes it, Escape takes it away, typing takes it away for good', () => {
  const { window, document, editor, form } = page();
  try {
    const view = createReplySuggestionView({ document, form, editor });
    view.show('好，採用 A 方案');
    const tab = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    editor.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true);
    assert.equal(editor.value, '好，採用 A 方案');
    editor.textContent = '';
    // With nothing shown Tab is the browser's own.
    const plain = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    editor.dispatchEvent(plain);
    assert.equal(plain.defaultPrevented, false);
    view.show('好，採用 A 方案');
    editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(view.isShown(), false);
    view.show('第二句');
    type(window, editor, 'ab');
    assert.equal(view.isShown(), false);
    editor.textContent = '';
    editor.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(view.isShown(), false, 'it does not come back when the box is emptied again');
  } finally {
    window.happyDOM.abort();
  }
});

test('it is not shown over words the person already typed', () => {
  const { window, document, editor, form } = page();
  try {
    const view = createReplySuggestionView({ document, form, editor });
    editor.textContent = '先等一下';
    view.show('好，採用 A 方案');
    assert.equal(view.isShown(), false);
    assert.equal(view.accept(), false);
    assert.equal(editor.value, '先等一下');
  } finally {
    window.happyDOM.abort();
  }
});

function started(overrides = {}) {
  const p = page();
  const state = { conversation: { id: 'c1', messages: [{ role: 'user', parts: [{ text: '幫我做簡報' }] }, { role: 'model', parts: [{ text: QUESTION }] }] }, asked: 0 };
  const result = startReplySuggestion({
    document: p.document,
    getConfig: () => ({ memoryModelId: 'm', uiLanguage: 'zh-TW' }),
    getConversation: () => state.conversation,
    runModel: async () => { state.asked += 1; return '好，採用 A 方案'; },
    isImageConversation: () => false,
    getErrorPrefixes: () => [],
    getLanguage: () => 'zh-TW',
    warn: () => {},
    ...overrides
  });
  return { ...p, state, result };
}

test('when a reply ends the line comes, in the language of the page for the arrow', async () => {
  const { window, document, result } = started();
  try {
    emitReplyEnded();
    await flush(400);
    assert.equal(result.view.isShown(), true);
    assert.equal(document.querySelector('.rs-text').textContent, '好，採用 A 方案');
    assert.equal(document.querySelector('.rs-accept').getAttribute('aria-label'), '使用這句回覆: 好，採用 A 方案');
  } finally {
    window.happyDOM.abort();
    result.controller.cancel();
  }
});

test('sending a message takes it away, and so does another conversation filling the list', async () => {
  const sending = started();
  try {
    emitReplyEnded();
    await flush(400);
    assert.equal(sending.result.view.isShown(), true);
    sending.form.dispatchEvent(new sending.window.Event('submit', { cancelable: true }));
    assert.equal(sending.result.view.isShown(), false);
  } finally {
    sending.window.happyDOM.abort();
    sending.result.controller.cancel();
  }
  const switching = started();
  try {
    emitReplyEnded();
    await flush(400);
    assert.equal(switching.result.view.isShown(), true);
    switching.state.conversation = { id: 'c2', messages: [] };
    switching.list.append(switching.document.createElement('div'));
    await flush(20);
    assert.equal(switching.result.view.isShown(), false);
  } finally {
    switching.window.happyDOM.abort();
    switching.result.controller.cancel();
  }
});

test('nothing starts without the box of the page or without a way to ask', () => {
  const window = new Window({ url: 'https://example.test/' });
  try {
    assert.equal(startReplySuggestion({ document: window.document, getConfig: () => ({}), getConversation: () => null, runModel: async () => '' }), null);
    const { window: other, document } = page();
    assert.equal(startReplySuggestion({ document, getConfig: () => ({}), getConversation: () => null }), null);
    other.happyDOM.abort();
  } finally {
    window.happyDOM.abort();
  }
});

test('the words are the same in the five languages', () => {
  const keys = Object.keys(REPLY_SUGGESTION_TEXTS.en).sort();
  for (const language of ['zh-TW', 'fr', 'ru', 'es']) assert.deepEqual(Object.keys(REPLY_SUGGESTION_TEXTS[language]).sort(), keys, language);
  assert.equal(replySuggestionText('xx', 'use'), 'Use this reply');
});

test('Right arrow takes it in the empty box, and is the caret\'s own with words in the box or with a modifier', () => {
  const { window, document, editor, form } = page();
  try {
    const taken = [];
    const view = createReplySuggestionView({ document, form, editor, onAccept: (words) => taken.push(words) });
    view.show('好，採用 A 方案');
    const withShift = new window.KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true });
    editor.dispatchEvent(withShift);
    assert.equal(withShift.defaultPrevented, false);
    assert.deepEqual(taken, []);
    const arrow = new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    editor.dispatchEvent(arrow);
    assert.equal(arrow.defaultPrevented, true);
    assert.equal(editor.value, '好，採用 A 方案');
    assert.deepEqual(taken, ['好，採用 A 方案']);
    const again = new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    editor.dispatchEvent(again);
    assert.equal(again.defaultPrevented, false, 'nothing is shown any more');
  } finally {
    window.happyDOM.abort();
  }
});
