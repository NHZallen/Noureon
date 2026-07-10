import assert from 'node:assert/strict';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createMessageEditingLifecycle } from '../src/app/legacy-runtime/features/message-editing-lifecycle.js';

test('cancelling a desktop message edit restores only the original message without rerendering the chat', async () => {
  const { document, cleanup } = createDom(`
    <main id="messages">
      <article class="message-item" data-message-index="0"><div class="message-stack-user">Original message</div></article>
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
