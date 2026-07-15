import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import { createMessageListLifecycle } from '../src/app/legacy-runtime/features/message-list-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createFixture = (overrides = {}) => {
  const dom = createDom(`
    <h1 id="title"></h1>
    <div id="models"></div>
    <div id="messages"></div>
    <div id="chat"></div>
  `);
  const conversation = {
    title: 'Untitled',
    messages: [],
    isTemporary: true,
    isRenamed: false,
    archived: false
  };
  const calls = [];
  const lifecycle = createMessageListLifecycle({
    document: dom.document,
    elements: {
      headerTitle: dom.document.querySelector('#title'),
      modelSwitcherContainer: dom.document.querySelector('#models'),
      messageList: dom.document.querySelector('#messages'),
      chatContainer: dom.document.querySelector('#chat')
    },
    getActiveConversation: () => conversation,
    getUiLanguage: () => 'en',
    getAutoNaming: () => true,
    getCurrentUserName: () => 'Astra',
    getText: (key) => ({
      newChat: 'New chat',
      howCanIHelp: 'How can I help?',
      copyContent: 'Copy'
    }[key]),
    buildMessageRenderView: ({ message }) => ({
      messageClassName: message.role === 'user' ? 'user-message' : 'model-message',
      messageHTML: `<div class="message-content">${message.parts[0]?.text || ''}</div>`,
      previewMediaParts: []
    }),
    buildMediaAttachmentView: () => ({ html: '', previewMediaParts: [] }),
    renderUserText: (text) => text,
    renderMarkdownWithFormulas: (text) => text,
    formatTimestamp: () => 'stamp',
    bindMediaPreviewButtons: () => calls.push('bindMedia'),
    saveAppData: async () => calls.push('save'),
    renderModelSwitcher: () => calls.push('modelSwitcher'),
    renderInputIndicators: () => calls.push('inputIndicators'),
    renderCouncilControls: () => calls.push('councilControls'),
    setupMessageIntersectionObserver: () => calls.push('observer'),
    updateInputState: () => calls.push('inputState'),
    scheduleFrame: (callback) => callback(),
    isAutoScrolling: () => false,
    ...overrides
  });
  return { ...dom, conversation, calls, lifecycle };
};

test('addMessageToUI persists, auto-names, renders, and appends a user message in order', async () => {
  const fixture = createFixture();
  try {
    const message = { role: 'user', parts: [{ text: 'A useful title beyond thirty characters' }] };

    const element = fixture.lifecycle.addMessageToUI(message, 0, true, false);
    await Promise.resolve();

    assert.deepEqual(fixture.conversation.messages, [message]);
    assert.equal(fixture.conversation.title, 'A useful title beyond thirty c');
    assert.equal(fixture.document.querySelector('#title').textContent, 'A useful title beyond thirty c');
    assert.equal(element.dataset.messageIndex, '0');
    assert.equal(element.className, 'user-message');
    assert.equal(fixture.document.querySelector('#messages').lastElementChild, element);
    assert.deepEqual(fixture.calls, ['save', 'bindMedia']);
  } finally {
    fixture.cleanup();
  }
});

test('addMessageToUI skips persistence and scrolls only when auto-scrolling is active', () => {
  const scrollCalls = [];
  const fixture = createFixture({
    isAutoScrolling: () => true
  });
  try {
    Object.defineProperty(fixture.document.querySelector('#chat'), 'scrollHeight', { value: 450 });
    fixture.document.querySelector('#chat').scrollTo = (options) => scrollCalls.push(options);
    const message = { role: 'model', parts: [{ text: 'Answer' }] };

    fixture.lifecycle.addMessageToUI(message, 4, false, true);

    assert.deepEqual(fixture.conversation.messages, []);
    assert.deepEqual(scrollCalls, [{ top: 450, behavior: 'smooth' }]);
  } finally {
    fixture.cleanup();
  }
});

test('renderChat renders greeting, populated messages, and no-conversation boundaries', () => {
  const fixture = createFixture();
  try {
    fixture.lifecycle.renderChat();
    assert.match(fixture.document.querySelector('#messages').innerHTML, /Astra, How can I help\?/);
    assert.equal(
      fixture.document.querySelector('#messages').classList.contains('chat-view-transition'),
      true
    );

    fixture.conversation.messages.push({ role: 'model', parts: [{ text: 'Existing' }] });
    fixture.lifecycle.renderChat({ animate: true, reason: 'conversation-switch' });
    assert.equal(fixture.document.querySelectorAll('#messages .model-message').length, 1);
    assert.equal(
      fixture.document.querySelector('#messages').classList.contains('chat-view-transition'),
      true
    );
    assert.deepEqual(
      fixture.calls.filter((call) => ['modelSwitcher', 'inputIndicators', 'councilControls', 'observer', 'inputState'].includes(call)),
      [
        'modelSwitcher', 'inputIndicators', 'councilControls', 'observer', 'inputState',
        'modelSwitcher', 'inputIndicators', 'councilControls', 'observer', 'inputState'
      ]
    );
  } finally {
    fixture.cleanup();
  }

  const emptyFixture = createFixture({ getActiveConversation: () => null });
  try {
    emptyFixture.lifecycle.renderChat();
    assert.equal(emptyFixture.document.querySelector('#messages').innerHTML, '');
    assert.equal(emptyFixture.document.querySelector('#title').textContent, 'New chat');
    assert.deepEqual(emptyFixture.calls, ['inputIndicators', 'councilControls']);
  } finally {
    emptyFixture.cleanup();
  }
});

test('renderChat can update controls without rebuilding or restyling the message list', () => {
  const fixture = createFixture();
  try {
    const messageList = fixture.document.querySelector('#messages');
    messageList.innerHTML = '<article data-existing-message>Keep this node</article>';
    messageList.classList.add('chat-view-transition');
    const existingMessage = messageList.firstElementChild;
    fixture.conversation.messages.push({ role: 'model', parts: [{ text: 'Replacement' }] });

    fixture.lifecycle.renderChat({
      renderMessages: false,
      reason: 'cloud-config-changed'
    });

    assert.equal(messageList.firstElementChild, existingMessage);
    assert.equal(messageList.textContent, 'Keep this node');
    assert.equal(messageList.classList.contains('chat-view-transition'), true);
    assert.deepEqual(fixture.calls, [
      'modelSwitcher',
      'inputIndicators',
      'councilControls',
      'inputState'
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('renderChat can refresh without animation and preserves a reader scroll position', () => {
  let chatContainer;
  const fixture = createFixture({
    buildMessageRenderView: ({ message }) => {
      chatContainer.scrollTop = 0;
      return {
        messageClassName: 'model-message',
        messageHTML: `<div class="message-content">${message.parts[0]?.text || ''}</div>`,
        previewMediaParts: []
      };
    }
  });
  try {
    chatContainer = fixture.document.querySelector('#chat');
    const messageList = fixture.document.querySelector('#messages');
    fixture.conversation.messages.push({ role: 'model', parts: [{ text: 'Existing' }] });
    Object.defineProperties(chatContainer, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 400 }
    });
    chatContainer.scrollTop = 250;
    messageList.classList.add('chat-view-transition');

    fixture.lifecycle.renderChat({
      animate: false,
      preserveScroll: true,
      reason: 'cloud-current-conversation-changed'
    });

    assert.equal(messageList.classList.contains('chat-view-transition'), false);
    assert.equal(chatContainer.scrollTop, 250);
  } finally {
    fixture.cleanup();
  }
});

test('renderChat keeps a near-bottom reader pinned after a non-animated refresh', () => {
  let rebuilt = false;
  let chatContainer;
  const fixture = createFixture({
    buildMessageRenderView: ({ message }) => {
      rebuilt = true;
      chatContainer.scrollTop = 0;
      return {
        messageClassName: 'model-message',
        messageHTML: `<div class="message-content">${message.parts[0]?.text || ''}</div>`,
        previewMediaParts: []
      };
    }
  });
  try {
    chatContainer = fixture.document.querySelector('#chat');
    fixture.conversation.messages.push({ role: 'model', parts: [{ text: 'Existing' }] });
    Object.defineProperties(chatContainer, {
      scrollHeight: {
        configurable: true,
        get: () => (rebuilt ? 1200 : 1000)
      },
      clientHeight: { configurable: true, value: 400 }
    });
    chatContainer.scrollTop = 590;
    chatContainer.scrollTo = (options) => {
      chatContainer.scrollTop = options.top;
    };

    fixture.lifecycle.renderChat({
      animate: false,
      preserveScroll: true,
      reason: 'cloud-current-conversation-changed'
    });

    assert.equal(chatContainer.scrollTop, 1200);
  } finally {
    fixture.cleanup();
  }
});

test('message list lifecycle source avoids provider, storage schema, package, and Vite coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/message-list-lifecycle.js');
  for (const token of [
    'streamApiCall',
    'TextDecoder',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'package.json',
    'vite.config',
    'virtual:legacy-app-runtime'
  ]) {
    assert.equal(source.includes(token), false, token);
  }
});
