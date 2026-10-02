import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { createHistorySidebarHelpers, latestSources, timelineSnippet } from '../src/app/runtime/legacy-core/history-sidebar-helpers.js';
import { formatSandboxRunBlock } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { resetSiteNames } from '../src/app/ui/citations/site-names.js';
import { openSourceSheet } from '../src/app/ui/citations/source-sheet.js';

const pages = [
  { n: 1, title: 'Security - Vercel', url: 'https://vercel.com/security' },
  { n: 2, title: 'WAF', url: 'https://vercel.com/docs/waf', snippet: 'Rate limits' }
];
const reply = (text, sources = pages) => ({ role: 'model', parts: [{ text: `${formatSandboxRunBlock({ status: 'done', steps: [], sources })}${text}` }] });

const createHarness = ({ messages = [], width = 1400, language = 'en' } = {}) => {
  const window = new Window({ url: 'https://noureon.test/' });
  window.innerWidth = width;
  const { document } = window;
  document.body.innerHTML = `
    <main id="main"><div id="chat-container"></div><div id="message-list"></div>
      <div id="history-sidebar-overlay" class="hidden"></div>
      <div id="history-sidebar">
        <header class="history-sidebar-head">
          <div class="history-tabs" role="tablist">
            <button type="button" role="tab" data-history-tab="timeline" aria-selected="true">Timeline</button>
            <button type="button" role="tab" data-history-tab="sources" aria-selected="false">Sources</button>
          </div>
          <button type="button" data-history-close>x</button>
        </header>
        <div id="history-sidebar-list"></div>
        <div id="history-sources-list" hidden></div>
      </div>
      <div id="history-sidebar-trigger-zone"></div>
    </main><div id="history-list"></div>`;
  const elements = {
    chatContainer: document.getElementById('chat-container'),
    historySidebar: document.getElementById('history-sidebar'),
    historySidebarList: document.getElementById('history-sidebar-list'),
    historySidebarOverlay: document.getElementById('history-sidebar-overlay'),
    historySidebarTriggerZone: document.getElementById('history-sidebar-trigger-zone'),
    messageList: document.getElementById('message-list')
  };
  const conversation = { messages };
  const frames = [];
  const helpers = createHistorySidebarHelpers({
    document,
    elements,
    getRequiredElement: (name) => (name === 'historySidebarList' ? elements.historySidebarList : document.getElementById('history-list')),
    getActiveConversation: () => conversation,
    getMessageTypeIcon: () => '',
    userBubbleColors: { default: { light: '#ffffff' } },
    aiBubbleColors: { default: { light: '#eeeeee' } },
    getConfig: () => ({ aiBubbleColor: 'default', userBubbleColor: 'default', uiLanguage: language }),
    hexToRgba: () => 'rgba(0,0,0,0.1)',
    getTextColorForBackground: () => '#000',
    getConversations: () => [],
    createConversationElement: () => document.createElement('div'),
    getNamingText: () => '',
    requestAnimationFrame: (callback) => { frames.push(callback); },
    setTimeout: () => 0,
    setupMessageIntersectionObserver: () => {}
  });
  const settle = () => { for (const frame of frames.splice(0)) frame(); };
  helpers.setupHistorySidebarInteractions();
  helpers.setupHistorySidebarTriggers();
  const selected = () => [...document.querySelectorAll('[data-history-tab]')].find((button) => button.getAttribute('aria-selected') === 'true')?.dataset.historyTab;
  return { window, document, elements, helpers, settle, selected, main: document.getElementById('main') };
};

test('the timeline names a message by what it says, not by the record of what the model did or its citation markers', () => {
  const raw = reply('Tomorrow is mild [1]. Take an umbrella [2].');
  assert.equal(timelineSnippet(raw, 'AI reply'), 'Tomorrow is mild. Take an umbrella.');
  assert.equal(timelineSnippet({ parts: [{ text: formatSandboxRunBlock({ status: 'done', steps: [], sources: pages }) }] }, 'AI reply'), 'AI reply', 'nothing said: the plain name');
  assert.equal(timelineSnippet({ parts: [{ text: '````file deck.pptx\n{"slides":[]}\n````\nHere is the deck.' }] }, 'AI reply'), 'Here is the deck.', 'a file block is not the title');
  assert.equal(timelineSnippet({ parts: [{ text: 'Plain [1] text' }] }, 'x'), 'Plain [1] text');
  assert.equal(timelineSnippet({ parts: [] }, 'AI reply'), 'AI reply');
  assert.equal(timelineSnippet({ parts: [{ text: 'a'.repeat(500) }] }, 'x').length, 240);
});

test('the panel opens on the Timeline by default, with the sources of the latest reply in the other tab', () => {
  const harness = createHarness({ messages: [{ role: 'user', parts: [{ text: 'Weather?' }] }, reply('Mild [1].'), { role: 'user', parts: [{ text: 'And?' }] }, { role: 'model', parts: [{ text: 'No search here.' }] }] });
  assert.deepEqual(latestSources({ messages: [reply('x', []), reply('y')] }).map((source) => source.n), [1, 2], 'the latest reply that has pages');
  harness.helpers.toggleHistorySidebar(true);
  harness.settle();
  assert.equal(harness.selected(), 'timeline');
  assert.equal(harness.elements.historySidebar.classList.contains('visible'), true);
  assert.equal(harness.document.getElementById('history-sidebar-list').hidden, false);
  assert.equal(harness.document.getElementById('history-sources-list').hidden, true);
  assert.deepEqual([...harness.document.querySelectorAll('.history-sidebar-item')].map((item) => item.textContent), ['Weather?', 'Mild.', 'And?', 'No search here.'], 'the record is not what is listed');
  const sourcesTab = harness.document.querySelector('[data-history-tab="sources"]');
  assert.equal(sourcesTab.querySelector('.history-tab-count').textContent, '2');
  sourcesTab.click();
  assert.equal(harness.selected(), 'sources');
  assert.equal(harness.document.getElementById('history-sources-list').hidden, false);
  assert.equal(harness.document.getElementById('history-sidebar-list').hidden, true);
  assert.equal(harness.document.querySelectorAll('#history-sources-list a.source-item').length, 2);
  assert.match(harness.document.querySelector('.history-sources-count').textContent, /Sources · 2/);
  assert.equal(harness.document.querySelector('.source-item-snippet').textContent, 'Rate limits', 'the panel shows the start of the text');
  harness.document.querySelector('[data-history-tab="timeline"]').click();
  assert.equal(harness.selected(), 'timeline');
  harness.window.close();
});

test('the Sources button opens the panel on the Sources tab with the sources of its reply, and an active open is the Timeline again', () => {
  resetSiteNames();
  const harness = createHarness({ messages: [reply('Mild [1].')] });
  const mine = [{ n: 1, title: 'Only this', url: 'https://only.example/a' }];
  harness.document.dispatchEvent(new harness.window.CustomEvent('noureon:open-sources', { detail: { sources: mine } }));
  harness.settle();
  assert.equal(harness.selected(), 'sources');
  assert.deepEqual([...harness.document.querySelectorAll('#history-sources-list .source-item-title')].map((node) => node.textContent), ['Only this']);
  assert.equal(harness.elements.historySidebar.classList.contains('visible'), true);
  harness.document.querySelector('[data-history-close]').click();
  assert.equal(harness.elements.historySidebar.classList.contains('visible'), false);
  // Opened by hand (the edge, a swipe, the toggle): the Timeline, on a computer and on a phone alike.
  harness.elements.historySidebarTriggerZone.dispatchEvent(new harness.window.MouseEvent('mouseenter'));
  harness.settle();
  assert.equal(harness.selected(), 'timeline');
  // It stays on the tab it is on when the pointer touches the edge again.
  harness.document.querySelector('[data-history-tab="sources"]').click();
  harness.elements.historySidebarTriggerZone.dispatchEvent(new harness.window.MouseEvent('mouseenter'));
  assert.equal(harness.selected(), 'sources');
  harness.window.close();
});

test('a panel with no sources says so, and the panel closes with its button and the Escape key, but not under an open sheet', () => {
  const harness = createHarness({ messages: [{ role: 'model', parts: [{ text: 'Plain.' }] }] });
  harness.helpers.toggleHistorySidebar(true, { tab: 'sources' });
  harness.settle();
  assert.equal(harness.selected(), 'sources');
  assert.match(harness.document.querySelector('.history-sources-empty').textContent, /no sources/i);
  assert.equal(harness.document.querySelector('[data-history-tab="sources"] .history-tab-count'), null);
  const esc = () => harness.document.dispatchEvent(new harness.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  openSourceSheet({ document: harness.document, sources: pages, language: 'en' });
  esc();
  assert.equal(harness.elements.historySidebar.classList.contains('visible'), true, 'the sheet takes the key first, and only it closes');
  esc();
  assert.equal(harness.elements.historySidebar.classList.contains('visible'), false);
  harness.window.close();
});

test('on a wide screen the chat makes room for the panel and no veil is needed; narrower, it lies over the chat', () => {
  const wide = createHarness({ width: 1500 });
  wide.helpers.toggleHistorySidebar(true);
  wide.settle();
  assert.equal(wide.main.classList.contains('history-docked'), true);
  wide.helpers.toggleHistorySidebar(false);
  assert.equal(wide.main.classList.contains('history-docked'), false);
  const narrow = createHarness({ width: 900 });
  narrow.helpers.toggleHistorySidebar(true);
  narrow.settle();
  assert.equal(narrow.main.classList.contains('history-docked'), false);
  assert.equal(narrow.elements.historySidebarOverlay.classList.contains('visible'), true, 'over the chat, with its veil');
  wide.window.close();
  narrow.window.close();
});
