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
    const chatContainer = fixture.document.querySelector('#chat');
    const scrollCalls = [];
    messageList.innerHTML = '<article data-existing-message>Keep this node</article>';
    messageList.classList.add('chat-view-transition');
    const existingMessage = messageList.firstElementChild;
    chatContainer.scrollTop = 275;
    chatContainer.scrollTo = (options) => scrollCalls.push(options);
    fixture.conversation.messages.push({ role: 'model', parts: [{ text: 'Replacement' }] });

    fixture.lifecycle.renderChat({
      renderMessages: false,
      scrollMode: 'bottom',
      reason: 'cloud-config-changed'
    });

    assert.equal(messageList.firstElementChild, existingMessage);
    assert.equal(messageList.textContent, 'Keep this node');
    assert.equal(messageList.classList.contains('chat-view-transition'), true);
    assert.equal(chatContainer.scrollTop, 275);
    assert.deepEqual(scrollCalls, []);
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

test('renderChat scrollMode bottom waits for the render frame before showing the newest message', () => {
  const scheduledFrames = [];
  const scrollCalls = [];
  const fixture = createFixture({
    scheduleFrame: (callback) => scheduledFrames.push(callback)
  });
  try {
    const chatContainer = fixture.document.querySelector('#chat');
    fixture.conversation.messages.push({ role: 'model', parts: [{ text: 'Newest' }] });
    Object.defineProperties(chatContainer, {
      scrollHeight: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 400 }
    });
    chatContainer.scrollTop = 0;
    chatContainer.scrollTo = (options) => {
      scrollCalls.push(options);
      chatContainer.scrollTop = options.top;
    };

    fixture.lifecycle.renderChat({
      animate: true,
      scrollMode: 'bottom',
      reason: 'conversation-switch'
    });

    assert.equal(chatContainer.scrollTop, 0);
    assert.deepEqual(scrollCalls, []);
    assert.equal(scheduledFrames.length, 1);

    scheduledFrames.shift()();

    assert.equal(chatContainer.scrollTop, 900);
    assert.deepEqual(scrollCalls, []);
  } finally {
    fixture.cleanup();
  }
});

test('renderChat ignores a stale bottom frame after a rapid conversation switch', () => {
  const scheduledFrames = [];
  const scrollCalls = [];
  let scrollHeight = 700;
  let activeConversation = {
    title: 'First',
    messages: [{ role: 'model', parts: [{ text: 'First answer' }] }],
    archived: false
  };
  const fixture = createFixture({
    getActiveConversation: () => activeConversation,
    scheduleFrame: (callback) => scheduledFrames.push(callback)
  });
  try {
    const chatContainer = fixture.document.querySelector('#chat');
    Object.defineProperty(chatContainer, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight
    });
    chatContainer.scrollTo = (options) => {
      scrollCalls.push(options);
      chatContainer.scrollTop = options.top;
    };

    fixture.lifecycle.renderChat({ scrollMode: 'bottom', reason: 'conversation-switch' });
    activeConversation = {
      title: 'Second',
      messages: [{ role: 'model', parts: [{ text: 'Second answer' }] }],
      archived: false
    };
    scrollHeight = 1100;
    fixture.lifecycle.renderChat({ scrollMode: 'bottom', reason: 'conversation-switch' });

    assert.equal(scheduledFrames.length, 2);
    scheduledFrames.shift()();
    assert.deepEqual(scrollCalls, []);

    scheduledFrames.shift()();
    assert.equal(chatContainer.scrollTop, 1100);
    assert.deepEqual(scrollCalls, []);
  } finally {
    fixture.cleanup();
  }
});

test('renderChat scrollMode preserve restores a reader position after the render frame', () => {
  let chatContainer;
  const scheduledFrames = [];
  const fixture = createFixture({
    scheduleFrame: (callback) => scheduledFrames.push(callback),
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
      scrollMode: 'preserve',
      reason: 'cloud-current-conversation-changed'
    });

    assert.equal(messageList.classList.contains('chat-view-transition'), false);
    assert.equal(chatContainer.scrollTop, 0);
    assert.equal(scheduledFrames.length, 1);

    scheduledFrames.shift()();

    assert.equal(chatContainer.scrollTop, 250);
  } finally {
    fixture.cleanup();
  }
});

test('renderChat scrollMode preserve keeps a near-bottom reader pinned after refresh', () => {
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
      scrollMode: 'preserve',
      reason: 'cloud-current-conversation-changed'
    });

    assert.equal(chatContainer.scrollTop, 1200);
  } finally {
    fixture.cleanup();
  }
});

test('renderChat scrollMode none leaves the existing scroll position untouched', () => {
  const scrollCalls = [];
  const fixture = createFixture();
  try {
    const chatContainer = fixture.document.querySelector('#chat');
    fixture.conversation.messages.push({ role: 'model', parts: [{ text: 'Existing' }] });
    Object.defineProperties(chatContainer, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 400 }
    });
    chatContainer.scrollTop = 325;
    chatContainer.scrollTo = (options) => scrollCalls.push(options);

    fixture.lifecycle.renderChat({
      scrollMode: 'none',
      reason: 'controls-refresh'
    });

    assert.equal(chatContainer.scrollTop, 325);
    assert.deepEqual(scrollCalls, []);
  } finally {
    fixture.cleanup();
  }
});

test('renderChat keeps bottom anchoring while delayed media changes the conversation height', () => {
  const scheduledFrames = [];
  const scrollCalls = [];
  let scrollHeight = 700;
  const fixture = createFixture({
    scheduleFrame: (callback) => scheduledFrames.push(callback),
    buildMessageRenderView: () => ({
      messageClassName: 'model-message',
      messageHTML: '<div class="message-content"><img src="delayed.png" alt="Delayed"><video src="delayed.mp4"></video></div>',
      previewMediaParts: []
    })
  });
  try {
    const chatContainer = fixture.document.querySelector('#chat');
    fixture.conversation.messages.push({ role: 'model', parts: [{ text: 'Image' }] });
    Object.defineProperties(chatContainer, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 400 }
    });
    chatContainer.scrollTo = (options) => {
      scrollCalls.push(options);
      chatContainer.scrollTop = options.top;
    };

    fixture.lifecycle.renderChat({ scrollMode: 'bottom', reason: 'conversation-switch' });
    const image = fixture.document.querySelector('#messages img');
    const video = fixture.document.querySelector('#messages video');
    Object.defineProperty(image, 'complete', { configurable: true, value: false });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });

    scheduledFrames.shift()();
    assert.equal(chatContainer.scrollTop, 700);

    scrollHeight = 900;
    image.dispatchEvent(new fixture.window.Event('load'));
    assert.equal(chatContainer.scrollTop, 900);

    scrollHeight = 1100;
    video.dispatchEvent(new fixture.window.Event('loadedmetadata'));
    while (scheduledFrames.length > 0) scheduledFrames.shift()();

    assert.equal(chatContainer.scrollTop, 1100);
    assert.deepEqual(scrollCalls, []);
  } finally {
    fixture.cleanup();
  }
});

test('renderChat keeps a near-bottom preserved reader anchored while delayed media loads', () => {
  const scheduledFrames = [];
  const scrollCalls = [];
  let scrollHeight = 700;
  const fixture = createFixture({
    scheduleFrame: (callback) => scheduledFrames.push(callback),
    buildMessageRenderView: () => ({
      messageClassName: 'model-message',
      messageHTML: '<div class="message-content"><img src="delayed.png" alt="Delayed"></div>',
      previewMediaParts: []
    })
  });
  try {
    const chatContainer = fixture.document.querySelector('#chat');
    fixture.conversation.messages.push({ role: 'model', parts: [{ text: 'Image' }] });
    Object.defineProperties(chatContainer, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 400 }
    });
    chatContainer.scrollTop = 290;
    chatContainer.scrollTo = (options) => {
      scrollCalls.push(options);
      chatContainer.scrollTop = options.top;
    };

    fixture.lifecycle.renderChat({
      animate: false,
      scrollMode: 'preserve',
      reason: 'cloud-current-conversation-changed'
    });
    const image = fixture.document.querySelector('#messages img');
    Object.defineProperty(image, 'complete', { configurable: true, value: false });

    assert.equal(chatContainer.scrollTop, 290);
    scheduledFrames.shift()();
    assert.equal(chatContainer.scrollTop, 700);

    scrollHeight = 1100;
    image.dispatchEvent(new fixture.window.Event('load'));
    while (scheduledFrames.length > 0) scheduledFrames.shift()();

    assert.equal(chatContainer.scrollTop, 1100);
    assert.deepEqual(scrollCalls, []);
  } finally {
    fixture.cleanup();
  }
});

test('renderChat treats a generated image without src as pending even when complete is true', () => {
  const scheduledFrames = [];
  const scrollCalls = [];
  let scrollHeight = 600;
  const fixture = createFixture({
    scheduleFrame: (callback) => scheduledFrames.push(callback),
    buildMessageRenderView: () => ({
      messageClassName: 'model-message',
      messageHTML: '<div class="message-content"><img data-generated-image-id="asset-1" alt="Generated"></div>',
      previewMediaParts: []
    })
  });
  try {
    const chatContainer = fixture.document.querySelector('#chat');
    fixture.conversation.messages.push({ role: 'model', parts: [{ text: 'Generated image' }] });
    Object.defineProperties(chatContainer, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 400 }
    });
    chatContainer.scrollTo = (options) => {
      scrollCalls.push(options);
      chatContainer.scrollTop = options.top;
    };

    fixture.lifecycle.renderChat({ scrollMode: 'bottom', reason: 'conversation-switch' });
    const image = fixture.document.querySelector('#messages img');
    Object.defineProperty(image, 'complete', { configurable: true, value: true });
    assert.equal(image.hasAttribute('src'), false);

    scheduledFrames.shift()();
    assert.equal(chatContainer.scrollTop, 600);

    scrollHeight = 1000;
    image.setAttribute('src', 'blob:generated-image');
    image.dispatchEvent(new fixture.window.Event('load'));
    while (scheduledFrames.length > 0) scheduledFrames.shift()();

    assert.equal(chatContainer.scrollTop, 1000);
    assert.deepEqual(scrollCalls, []);
  } finally {
    fixture.cleanup();
  }
});

test('renderChat cancels delayed-media bottom anchoring after the reader scrolls upward', () => {
  const scheduledFrames = [];
  let scrollHeight = 700;
  const fixture = createFixture({
    scheduleFrame: (callback) => scheduledFrames.push(callback),
    buildMessageRenderView: () => ({
      messageClassName: 'model-message',
      messageHTML: '<div class="message-content"><img src="delayed.png" alt="Delayed"></div>',
      previewMediaParts: []
    })
  });
  try {
    const chatContainer = fixture.document.querySelector('#chat');
    fixture.conversation.messages.push({ role: 'model', parts: [{ text: 'Image' }] });
    Object.defineProperties(chatContainer, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 400 }
    });
    chatContainer.scrollTo = (options) => {
      chatContainer.scrollTop = options.top;
    };

    fixture.lifecycle.renderChat({ scrollMode: 'bottom', reason: 'conversation-switch' });
    const image = fixture.document.querySelector('#messages img');
    Object.defineProperty(image, 'complete', { configurable: true, value: false });
    scheduledFrames.shift()();
    assert.equal(chatContainer.scrollTop, 700);

    chatContainer.scrollTop = 100;
    chatContainer.dispatchEvent(new fixture.window.Event('scroll'));
    scrollHeight = 1100;
    image.dispatchEvent(new fixture.window.Event('load'));
    while (scheduledFrames.length > 0) scheduledFrames.shift()();

    assert.equal(chatContainer.scrollTop, 100);
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
