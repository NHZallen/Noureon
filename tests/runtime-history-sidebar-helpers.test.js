import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { projectFile, readSource } from './helpers/source-guards.js';

const helperPath = 'src/app/runtime/legacy-core/history-sidebar-helpers.js';
const helperUrl = new URL(`../${helperPath}`, import.meta.url);
const helperExists = existsSync(helperUrl);
const helperModule = helperExists ? await import(helperUrl.href) : {};
const { createHistorySidebarHelpers } = helperModule;
const helperSource = helperExists ? readSource(helperPath) : '';
const legacyCoreSource = readSource('src/app/runtime/legacy-core/legacy-core.js');

function createHarness({
  activeConversation = { messages: [] },
  config = { aiBubbleColor: 'default', userBubbleColor: 'default' },
  conversations = [],
  elements: suppliedElements
} = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = `
    <main id="chat-container"></main>
    <button id="history-panel-toggle-btn" type="button"></button>
    <aside id="history-sidebar"></aside>
    <div id="history-sidebar-overlay" class="hidden"></div>
    <div id="history-sidebar-list"></div>
    <div id="message-list"></div>
    <div id="history-list"></div>
  `;
  const elements = suppliedElements || {
    chatContainer: document.getElementById('chat-container'),
    historySidebar: document.getElementById('history-sidebar'),
    historySidebarList: document.getElementById('history-sidebar-list'),
    historySidebarOverlay: document.getElementById('history-sidebar-overlay'),
    historyPanelToggleBtn: document.getElementById('history-panel-toggle-btn'),
    messageList: document.getElementById('message-list')
  };
  const frames = [];
  const calls = [];
  const timeouts = [];
  const renderedConversations = [];
  const activeConversationReads = [];

  assert.equal(typeof createHistorySidebarHelpers, 'function', 'history sidebar helper factory should be exported');
  const helpers = createHistorySidebarHelpers({
    document,
    elements,
    getRequiredElement: (name) => {
      if (name === 'historyList') return document.getElementById('history-list');
      if (name === 'historySidebarList') return elements.historySidebarList;
      throw new Error(`Unexpected required element: ${name}`);
    },
    getActiveConversation: () => {
      activeConversationReads.push(activeConversation);
      return activeConversation;
    },
    getMessageTypeIcon: (message) => `[${message.role}] `,
    aiBubbleColors: { default: {light: '#eeeeee'} },
    getConfig: () => config,
    hexToRgba: (color, alpha) => color === '#ffffff'
      ? `rgba(255, 255, 255, ${alpha})`
      : `rgba(238, 238, 238, ${alpha})`,
    getTextColorForBackground: () => '#000000',
    getConversations: () => conversations,
    createConversationElement: (conversation) => {
      renderedConversations.push(conversation);
      const item = document.createElement('div');
      item.className = 'rendered-conversation';
      item.dataset.conversationId = conversation.id;
      return item;
    },
    getNamingText: () => 'Naming...',
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    setTimeout: (callback, delay) => {
      timeouts.push({ callback, delay });
      return timeouts.length;
    },
    setupMessageIntersectionObserver: () => calls.push('setupMessageIntersectionObserver')
  });

  return {
    activeConversationReads,
    calls,
    document,
    elements,
    frames,
    helpers,
    renderedConversations,
    timeouts,
    window
  };
}

test('opening the history sidebar preserves overlay and RAF ordering', () => {
  const harness = createHarness();
  try {
    harness.helpers.toggleHistorySidebar(true);

    assert.equal(harness.elements.historySidebarOverlay.classList.contains('hidden'), false);
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), false);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('visible'), false);
    assert.equal(harness.frames.length, 2);

    harness.frames[0]();
    assert.deepEqual(harness.calls, ['setupMessageIntersectionObserver']);
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), false);

    harness.frames[1]();
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), true);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('visible'), true);
  } finally {
    harness.window.close();
  }
});

test('closing hides the overlay once it has faded, whether or not a transition ends', () => {
  const harness = createHarness();
  try {
    harness.elements.historySidebar.classList.add('visible');
    harness.elements.historySidebarOverlay.classList.add('visible');
    harness.elements.historySidebarOverlay.classList.remove('hidden');

    harness.helpers.toggleHistorySidebar(false);

    assert.equal(harness.elements.historySidebar.classList.contains('visible'), false);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('visible'), false);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('hidden'), false);

    // Beside the chat the veil is not drawn, so no transition ends: the timer takes it away all the same.
    const hide = harness.timeouts.find((timeout) => timeout.delay === 320);
    assert.ok(hide, 'a timer hides the veil');
    hide.callback();
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('hidden'), true);
  } finally {
    harness.window.close();
  }
});

test('reopening before the close transition keeps the overlay visible', () => {
  const harness = createHarness();
  try {
    harness.elements.historySidebar.classList.add('visible');
    harness.elements.historySidebarOverlay.classList.add('visible');
    harness.elements.historySidebarOverlay.classList.remove('hidden');

    harness.helpers.toggleHistorySidebar(false);
    harness.helpers.toggleHistorySidebar(true);
    for (const frame of harness.frames) frame();
    harness.elements.historySidebarOverlay.dispatchEvent(new harness.window.Event('transitionend'));

    assert.equal(harness.elements.historySidebar.classList.contains('visible'), true);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('visible'), true);
    assert.equal(harness.elements.historySidebarOverlay.classList.contains('hidden'), false);
  } finally {
    harness.window.close();
  }
});

test('missing sidebar elements preserve the current explicit failure boundary', () => {
  const harness = createHarness({ elements: {} });
  try {
    assert.throws(() => harness.helpers.toggleHistorySidebar(true), TypeError);
    assert.throws(() => harness.helpers.toggleHistorySidebar(false), TypeError);
  } finally {
    harness.window.close();
  }
});

test('history message content renders normal and fallback previews through the active conversation dependency', () => {
  const activeConversation = {
    messages: [
      { role: 'user', parts: [{ text: 'First question' }] },
      { role: 'model', parts: [{ text: 'First answer' }] },
      { role: 'user', parts: [] }
    ]
  };
  const harness = createHarness({ activeConversation });
  try {
    harness.helpers.renderHistorySidebarContent();

    const items = [...harness.elements.historySidebarList.querySelectorAll('.history-sidebar-item')];
    assert.equal(harness.activeConversationReads.length, 1);
    assert.equal(harness.activeConversationReads[0], activeConversation);
    assert.equal(items.length, 3);
    assert.deepEqual(items.map((item) => item.dataset.messageIndex), ['0', '1', '2']);
    const said = (item) => item.querySelector('.history-sidebar-text').textContent;
    assert.equal(said(items[0]), '[user] First question');
    assert.equal(said(items[1]), '[model] First answer');
    assert.match(said(items[2]), /^\[user\]\s+.+/);
    assert.deepEqual(items.map((item) => item.classList.contains('is-user')), [true, false, true]);
    assert.deepEqual(items.map((item) => item.querySelector('.history-sidebar-role').textContent), ['你', 'Noureon', '你']);
    assert.equal(items[0].style.backgroundColor, '', 'the timeline is black and white: no bubble colours');
  } finally {
    harness.window.close();
  }
});

test('history message content preserves the empty state for absent and empty conversations', () => {
  for (const activeConversation of [null, { messages: [] }]) {
    const harness = createHarness({ activeConversation });
    try {
      harness.helpers.renderHistorySidebarContent();
      assert.equal(harness.activeConversationReads.length, 1);
      assert.equal(harness.elements.historySidebarList.querySelectorAll('.history-sidebar-item').length, 0);
      assert.match(harness.elements.historySidebarList.innerHTML, /<p class="p-4 text-sm text-center text-\[var\(--text-secondary\)\]">.+<\/p>/);
    } finally {
      harness.window.close();
    }
  }
});

test('conversation history rendering preserves filtering, pinned ordering, naming state, and source order', () => {
  const conversations = [
    { id: 'newest', createdAt: '2026-06-03T00:00:00.000Z' },
    {
      id: 'restored-old',
      createdAt: '2026-01-02T00:00:00.000Z',
      lastUpdatedAt: '2026-01-03T00:00:00.000Z',
      stateUpdatedAt: '2026-07-06T09:00:00.000Z'
    },
    { id: 'pinned', pinned: true, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'naming', isNaming: true, createdAt: '2026-06-02T00:00:00.000Z' },
    { id: 'temporary', isTemporary: true, createdAt: '2026-06-04T00:00:00.000Z' },
    { id: 'archived', archived: true, createdAt: '2026-06-05T00:00:00.000Z' },
    { id: 'foldered', folderId: 'folder-1', createdAt: '2026-06-06T00:00:00.000Z' },
    { id: 'deleted', deletedAt: '2026-06-07T00:00:00.000Z', createdAt: '2026-06-07T00:00:00.000Z' }
  ];
  const originalOrder = conversations.map((conversation) => conversation.id);
  const harness = createHarness({ conversations });
  try {
    harness.helpers.renderHistorySidebar();

    const historyList = harness.document.getElementById('history-list');
    assert.deepEqual(harness.renderedConversations.map((conversation) => conversation.id), ['pinned', 'newest', 'restored-old']);
    assert.deepEqual(conversations.map((conversation) => conversation.id), originalOrder);
    assert.equal(historyList.children.length, 4);
    assert.equal(historyList.children[0].dataset.conversationId, 'pinned');
    assert.equal(historyList.children[1].dataset.conversationId, 'newest');
    assert.match(historyList.children[2].textContent, /Naming\.\.\./);
    assert.equal(historyList.children[3].dataset.conversationId, 'restored-old');
    assert.equal(historyList.querySelector('[data-conversation-id="temporary"]'), null);
  } finally {
    harness.window.close();
  }
});

test('history item interaction preserves smooth scroll and highlight timeout, and a panel lying over the chat gives way', () => {
  const harness = createHarness();
  try {
    // Narrower than the width at which the panel sits beside the chat: it lies over it.
    harness.window.innerWidth = 800;
    const item = harness.document.createElement('div');
    item.className = 'history-sidebar-item';
    item.dataset.messageIndex = '2';
    harness.elements.historySidebarList.appendChild(item);

    const message = harness.document.createElement('article');
    message.dataset.messageIndex = '2';
    const bubble = harness.document.createElement('div');
    bubble.className = 'message-bubble';
    message.appendChild(bubble);
    harness.elements.messageList.appendChild(message);
    let scrollOptions;
    message.scrollIntoView = (options) => { scrollOptions = options; };
    harness.elements.historySidebar.classList.add('visible');
    harness.elements.historySidebarOverlay.classList.add('visible');

    harness.helpers.setupHistorySidebarInteractions();
    item.dispatchEvent(new harness.window.MouseEvent('click', { bubbles: true }));

    assert.deepEqual(scrollOptions, { behavior: 'smooth', block: 'start' });
    assert.equal(bubble.classList.contains('message-highlight'), true);
    const highlight = harness.timeouts.filter((timeout) => timeout.delay === 1500);
    assert.equal(highlight.length, 1);
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), false);
    highlight[0].callback();
    assert.equal(bubble.classList.contains('message-highlight'), false);
  } finally {
    harness.window.close();
  }
});

test('beside the chat the panel stays when a message is picked, and the chat gives way to it', () => {
  const harness = createHarness();
  try {
    harness.window.innerWidth = 1400;
    const main = harness.document.createElement('main');
    harness.elements.historySidebar.replaceWith(main);
    main.append(harness.elements.historySidebar);
    const item = harness.document.createElement('div');
    item.className = 'history-sidebar-item';
    item.dataset.messageIndex = '0';
    harness.elements.historySidebarList.appendChild(item);
    const message = harness.document.createElement('article');
    message.dataset.messageIndex = '0';
    message.scrollIntoView = () => {};
    harness.elements.messageList.appendChild(message);
    harness.helpers.setupHistorySidebarInteractions();
    harness.helpers.toggleHistorySidebar(true);
    for (const frame of harness.frames.splice(0)) frame();
    assert.equal(main.classList.contains('history-docked'), true, 'the chat makes room');
    item.dispatchEvent(new harness.window.MouseEvent('click', { bubbles: true }));
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), true, 'it stays');
    harness.helpers.toggleHistorySidebar(false);
    assert.equal(main.classList.contains('history-docked'), false);
  } finally {
    harness.window.close();
  }
});

test('history sidebar opens by its button and by a swipe, stays open when the pointer leaves, and closes by a swipe', () => {
  const harness = createHarness({ activeConversation: { messages: [{ role: 'user', parts: [{ text: 'Preview' }] }] } });
  const dispatchTouch = (target, type, pointsKey, points) => {
    const event = new harness.window.Event(type, { bubbles: true });
    Object.defineProperty(event, pointsKey, { value: points });
    target.dispatchEvent(event);
  };
  try {
    harness.helpers.setupHistorySidebarTriggers();

    harness.elements.historyPanelToggleBtn.click();
    assert.ok(harness.activeConversationReads.length >= 1);
    for (const frame of harness.frames.splice(0)) frame();
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), true);

    harness.document.body.dispatchEvent(new harness.window.MouseEvent('mousemove', { bubbles: true }));
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), true, 'it stays when the pointer leaves');

    dispatchTouch(harness.elements.historySidebar, 'touchstart', 'touches', [{ clientX: 20, clientY: 50 }]);
    dispatchTouch(harness.elements.historySidebar, 'touchend', 'changedTouches', [{ clientX: 100, clientY: 52 }]);
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), false);

    dispatchTouch(harness.elements.chatContainer, 'touchstart', 'touches', [{ clientX: 120, clientY: 50 }]);
    dispatchTouch(harness.elements.chatContainer, 'touchend', 'changedTouches', [{ clientX: 20, clientY: 55 }]);
    for (const frame of harness.frames.splice(0)) frame();
    assert.equal(harness.elements.historySidebar.classList.contains('visible'), true);
  } finally {
    harness.window.close();
  }
});

test('legacy core delegates the read-only family without moving mutation behavior or runtime contracts', () => {
  assert.equal(existsSync(projectFile(helperPath)), true);
  assert.match(helperSource, /export\s+function\s+createHistorySidebarHelpers\s*\(/);
  assert.match(
    legacyCoreSource,
    /import\s+\{\s*createHistorySidebarHelpers\s*\}\s+from\s+['"]\/src\/app\/runtime\/legacy-core\/history-sidebar-helpers\.js['"]/
  );
  assert.match(legacyCoreSource, /const\s+historySidebarHelpers\s*=\s*createHistorySidebarHelpers\(\{/);
  assert.match(
    legacyCoreSource,
    /createHistorySidebarHelpers\(\{[\s\S]*?elements:\s*ALL_ELEMENTS,[\s\S]*?getActiveConversation,[\s\S]*?getConversations:\s*\(\)\s*=>\s*liveConversationsBridge\.getConversations\(\),[\s\S]*?createConversationElement:[\s\S]*?requestAnimationFrame,[\s\S]*?setupMessageIntersectionObserver/
  );
  for (const name of [
    'toggleHistorySidebar',
    'renderHistorySidebarContent',
    'setupHistorySidebarInteractions',
    'setupHistorySidebarTriggers',
    'renderHistorySidebar'
  ]) {
    assert.match(helperSource, new RegExp(`function\\s+${name}\\s*\\(`));
  }
  assert.doesNotMatch(legacyCoreSource, /function\s+(?:toggleHistorySidebar|renderHistorySidebarContent|setupHistorySidebarInteractions|setupHistorySidebarTriggers)\s*\(/);
  assert.match(
    legacyCoreSource,
    /const\s+renderHistorySidebar\s*=\s*\(\)\s*=>\s*\{[\s\S]*?currentConversations[\s\S]*?historySidebarHelpers\.isVisibleConversation[\s\S]*?historySidebarHelpers\.renderHistorySidebar\(sortedConversations\)/
  );
  assert.doesNotMatch(
    helperSource,
    /legacyRuntimeContext|registerLazyBinding|resolveBinding|resolveOptionalBinding|liveConversationsBridge|runtimeAppDataStore|app-data-store|saveAppData|replaceConversations/
  );
  assert.doesNotMatch(
    helperSource,
    /\.archived\s*=|\.deletedAt\s*=|\.pinned\s*=|\.folderId\s*=|\.title\s*=|\.isRenamed\s*=/
  );
  assert.doesNotMatch(
    helperSource,
    /^import\s+[\s\S]*?from\s+['"][^'"]*(?:runtime-entry|app-bootstrap|startup-lifecycle|settings|input|submit|provider)[^'"]*['"]/m
  );
});
