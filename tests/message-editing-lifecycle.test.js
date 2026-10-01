import assert from 'node:assert/strict';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createMessageEditingLifecycle } from '../src/app/legacy-runtime/features/message-editing-lifecycle.js';

test('cancelling a desktop message edit restores only the original message without rerendering the chat', async () => {
  const { document, cleanup } = createDom(`
    <main id="messages">
      <article class="message-item" data-message-index="0"><div class="message-stack-user">Original message<div class="user-message-actions"><button type="button" aria-label="Copy"></button></div></div></article>
      <article class="message-item" data-message-index="1">Other message</article>
    </main>
    <div id="composer-parent"><div id="input-bar"><textarea id="message-input"></textarea><div id="previews"></div></div></div>
    <button id="add-file"></button><div id="file-options"></div>
  `);
  try {
    let renderChatCalls = 0;
    const conversation = { messages: [{ role: 'user', parts: [{ text: 'Original message' }] }] };
    const originalStack = document.querySelector('.message-stack-user');
    const lifecycle = createMessageEditingLifecycle({
      document,
      elements: {
        messageList: document.querySelector('#messages'),
        messageInput: document.querySelector('#message-input'),
        inputBarContainer: document.querySelector('#input-bar'),
        filePreviewContainer: document.querySelector('#previews'),
        addFileBtn: document.querySelector('#add-file'),
        fileOptionsPopover: document.querySelector('#file-options')
      },
      getActiveConversation: () => conversation,
      renderChat: () => { renderChatCalls += 1; },
      saveAppData: async () => {},
      submitEditedMessage: async () => {},
      isMobile: () => false
    });

    lifecycle.startMessageEditing(0);
    assert.equal(document.querySelectorAll('.message-edit-inline').length, 1);
    assert.equal(document.querySelectorAll('.message-stack-user').length, 0);

    const editor = document.querySelector('.message-edit-inline');
    const closing = lifecycle.cancelMessageEditing();
    const returningPreview = editor.querySelector('.message-edit-returning');
    assert.notEqual(returningPreview, originalStack);
    assert.equal(returningPreview.classList.contains('user-message'), true);
    assert.notEqual(returningPreview.querySelector('.user-message-actions'), null);

    const transitionEnd = new Event('transitionend');
    Object.defineProperty(transitionEnd, 'propertyName', { value: 'height' });
    editor.dispatchEvent(transitionEnd);
    await closing;

    assert.equal(renderChatCalls, 0);
    assert.equal(document.querySelectorAll('.message-edit-inline').length, 0);
    assert.equal(document.querySelectorAll('.message-stack-user').length, 1);
    assert.equal(document.querySelector('.message-stack-user').textContent, 'Original message');
    assert.equal(document.querySelector('[data-message-index="1"]').textContent, 'Other message');
  } finally {
    cleanup();
  }
});

test('mobile cancellation restores the composer before the editor fade has completed', async () => {
  const { document, cleanup } = createDom(`
    <main id="messages"><article class="message-item" data-message-index="0"><div class="message-stack-user">Original message</div></article></main>
    <div id="composer-parent"><div id="input-bar"><textarea id="message-input"></textarea><div id="previews"></div></div></div>
    <button id="add-file"></button><div id="file-options"></div>
  `);
  try {
    const conversation = { messages: [{ role: 'user', parts: [{ text: 'Original message' }] }] };
    const inputBar = document.querySelector('#input-bar');
    const composerParent = document.querySelector('#composer-parent');
    let updateInputStateCalls = 0;
    let renderInputIndicatorsCalls = 0;
    const lifecycle = createMessageEditingLifecycle({
      document,
      elements: {
        messageList: document.querySelector('#messages'),
        messageInput: document.querySelector('#message-input'),
        inputBarContainer: inputBar,
        filePreviewContainer: document.querySelector('#previews'),
        addFileBtn: document.querySelector('#add-file'),
        fileOptionsPopover: document.querySelector('#file-options')
      },
      getActiveConversation: () => conversation,
      renderChat: () => {},
      renderInputIndicators: () => { renderInputIndicatorsCalls += 1; },
      updateInputState: () => { updateInputStateCalls += 1; },
      saveAppData: async () => {},
      submitEditedMessage: async () => {},
      isMobile: () => true
    });

    lifecycle.startMessageEditing(0);
    const closing = lifecycle.cancelMessageEditing();

    assert.equal(inputBar.parentNode, composerParent);
    assert.equal(updateInputStateCalls, 1);
    assert.equal(renderInputIndicatorsCalls, 1);
    assert.equal(document.body.classList.contains('is-editing-mobile-message'), false);
    await closing;
    assert.equal(document.querySelector('.message-edit-mobile-page'), null);
  } finally {
    cleanup();
  }
});

test('sending an edit hands the cut of the conversation to the submit, which makes it once the reply being written is stopped', async () => {
  const { document, cleanup } = createDom(`
    <main id="messages">
      <article class="message-item" data-message-index="0"><div class="message-stack-user">Question</div></article>
      <article class="message-item" data-message-index="1">Answer</article>
    </main>
    <div id="composer-parent"><div id="input-bar"><textarea id="message-input"></textarea><div id="previews"></div></div></div>
    <button id="add-file"></button><div id="file-options"></div>
  `);
  try {
    const conversation = { id: 'c1', messages: [
      { role: 'user', parts: [{ text: 'Question' }] },
      { role: 'model', parts: [{ text: 'Answer' }] }
    ] };
    const log = [];
    let submitted = null;
    const lifecycle = createMessageEditingLifecycle({
      document,
      elements: {
        messageList: document.querySelector('#messages'),
        messageInput: document.querySelector('#message-input'),
        inputBarContainer: document.querySelector('#input-bar'),
        filePreviewContainer: document.querySelector('#previews'),
        addFileBtn: document.querySelector('#add-file'),
        fileOptionsPopover: document.querySelector('#file-options')
      },
      getActiveConversation: () => conversation,
      renderChat: () => log.push(`render:${conversation.messages.length}`),
      saveAppData: async () => { log.push(`save:${conversation.messages.length}`); },
      invalidateConversationMemory: async () => { log.push('memory'); },
      submitEditedMessage: async (options) => { submitted = options; },
      isMobile: () => false
    });
    lifecycle.startMessageEditing(0);
    const textarea = document.querySelector('.message-edit-textarea');
    textarea.value = 'Question, edited';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-edit-send]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(submitted.userMessage, 'Question, edited');
    assert.equal(conversation.messages.length, 2, 'nothing is cut until the submit has stopped what is still writing');
    assert.deepEqual(log, []);
    // The reply that was being written finishes and adds its last words; then the submit cuts, whatever is there.
    conversation.messages.push({ role: 'model', parts: [{ text: 'Late words' }] });
    await submitted.prepare();
    assert.equal(conversation.messages.length, 0, 'the edited message and all after it, the late reply included');
    assert.deepEqual(log, ['memory', 'save:0', 'render:0']);
  } finally {
    cleanup();
  }
});

test('a phone edit also leaves the cut to the submit', () => {
  const { document, cleanup } = createDom(`
    <main id="messages"><article class="message-item" data-message-index="0"><div class="message-stack-user">Question</div></article></main>
    <div id="composer-parent"><div id="input-bar"><textarea id="message-input"></textarea><div id="previews"></div></div></div>
    <button id="add-file"></button><div id="file-options"></div>
  `);
  try {
    const conversation = { id: 'c1', messages: [{ role: 'user', parts: [{ text: 'Question' }] }, { role: 'model', parts: [{ text: 'Answer' }] }] };
    const lifecycle = createMessageEditingLifecycle({
      document,
      elements: {
        messageList: document.querySelector('#messages'),
        messageInput: document.querySelector('#message-input'),
        inputBarContainer: document.querySelector('#input-bar'),
        filePreviewContainer: document.querySelector('#previews'),
        addFileBtn: document.querySelector('#add-file'),
        fileOptionsPopover: document.querySelector('#file-options')
      },
      getActiveConversation: () => conversation,
      renderChat: () => {},
      saveAppData: async () => {},
      submitEditedMessage: async () => {},
      isMobile: () => true
    });
    assert.equal(lifecycle.getComposerEditSubmission(), null, 'not editing: a regular send');
    lifecycle.startMessageEditing(0);
    document.querySelector('#message-input').value = 'Edited on the phone';
    const submission = lifecycle.getComposerEditSubmission();
    assert.equal(submission.userMessage, 'Edited on the phone');
    assert.equal(submission.preserveComposer, true);
    assert.equal(conversation.messages.length, 2, 'asking for the submission cuts nothing');
    assert.equal(typeof submission.prepare, 'function');
  } finally {
    cleanup();
  }
});
