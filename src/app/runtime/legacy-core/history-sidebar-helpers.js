import { sandboxText } from '../sandbox/sandbox-texts.js';
import { liftSandboxRunBlock } from '../../ui/sandbox/sandbox-run-block.js';
import { listableSources, stripCitationMarkers } from '../../ui/citations/citation-model.js';
import { fillSourceList } from '../../ui/citations/source-list.js';
import { plainMarkdown } from '../../ui/citations/plain-text.js';

// A message as the timeline names it: the start of what it says. The record of what the model did (and the markers that
// cite sources) are kept in the message's text but are not what it says.
export function timelineSnippet(message, fallback) {
  const raw = (message?.parts || []).filter((part) => part.text).map((part) => part.text).join('\n');
  const { run, text } = liftSandboxRunBlock(raw);
  const said = plainMarkdown(stripCitationMarkers(text, run?.sources)
    .replace(/(`{3,})file[^\n]*\n[\s\S]*?(?:\1`*|$)/g, ' '));
  return said ? said.slice(0, 240) : fallback;
}

/** The sources of the latest reply that has any (what the Sources tab shows when it was not opened from a reply). */
export function latestSources(conversation) {
  const messages = conversation?.messages || [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'model') continue;
    const { run } = liftSandboxRunBlock((message.parts || []).map((part) => part.text || '').join('\n'));
    const sources = listableSources(run?.sources);
    if (sources.length) return sources;
  }
  return [];
}

export function createHistorySidebarHelpers({
  document,
  elements,
  getRequiredElement,
  getActiveConversation,
  getMessageTypeIcon,
  userBubbleColors,
  aiBubbleColors,
  getConfig,
  hexToRgba,
  getTextColorForBackground,
  getConversations,
  createConversationElement,
  getNamingText,
  requestAnimationFrame,
  setTimeout,
  setupMessageIntersectionObserver
}) {
  const win = document.defaultView;
  // Wide enough, the panel takes its place beside the chat (and the chat gives way); narrower, it lies over it.
  const isDocked = () => (win?.innerWidth || 0) >= 1024;
  let activeTab = 'timeline';

  const language = () => getConfig()?.uiLanguage || 'zh-TW';

  // Timeline | Sources: the tab shown, with its content.
  function setHistoryTab(tab, { sources = null, highlight = null } = {}) {
    const { historySidebar } = elements;
    activeTab = tab === 'sources' ? 'sources' : 'timeline';
    const timelineList = historySidebar.querySelector('#history-sidebar-list');
    const sourcesList = historySidebar.querySelector('#history-sources-list');
    const shown = sources ? listableSources(sources) : latestSources(getActiveConversation());
    historySidebar.querySelectorAll('[data-history-tab]').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.historyTab === activeTab));
      if (button.dataset.historyTab === 'sources') {
        button.textContent = sandboxText(language(), 'sourcesTab');
        if (shown.length) {
          const count = document.createElement('span');
          count.className = 'history-tab-count';
          count.textContent = String(shown.length);
          button.append(count);
        }
      }
    });
    const closeButton = historySidebar.querySelector('[data-history-close]');
    closeButton?.setAttribute('aria-label', sandboxText(language(), 'closePanel'));
    if (timelineList) timelineList.hidden = activeTab !== 'timeline';
    if (sourcesList) sourcesList.hidden = activeTab !== 'sources';
    if (activeTab === 'timeline') {
      renderHistorySidebarContent();
      return;
    }
    if (!sourcesList) return;
    sourcesList.replaceChildren();
    if (!shown.length) {
      const empty = document.createElement('p');
      empty.className = 'history-sources-empty';
      empty.textContent = sandboxText(language(), 'noSourcesInReply');
      sourcesList.append(empty);
      return;
    }
    const count = document.createElement('div');
    count.className = 'history-sources-count';
    count.textContent = sandboxText(language(), 'sourcesPanelCount', { n: shown.length });
    const list = document.createElement('div');
    fillSourceList(list, shown, { language: language(), detailed: true });
    if (highlight?.size) list.querySelectorAll('.source-item').forEach((item) => item.classList.toggle('is-cited', highlight.has(Number(item.dataset.n))));
    sourcesList.append(count, list);
    list.querySelector('.source-item.is-cited')?.scrollIntoView?.({ block: 'nearest' });
  }

  function toggleHistorySidebar(show, options = {}) {
    const { historySidebar, historySidebarOverlay } = elements;
    const main = historySidebar.closest('main');
    if (show) {
      setHistoryTab(options.tab || 'timeline', options);
      requestAnimationFrame(() => {
        setupMessageIntersectionObserver();
      });
      historySidebarOverlay.classList.remove('hidden');
      if (main && isDocked()) main.classList.add('history-docked');
      requestAnimationFrame(() => {
        historySidebar.classList.add('visible');
        historySidebarOverlay.classList.add('visible');
      });
    } else {
      historySidebar.classList.remove('visible');
      main?.classList.remove('history-docked');
      historySidebarOverlay.classList.remove('visible');
      // The veil is taken out of the way once it has faded. It is not left to a transition ending: beside the chat the veil
      // is not drawn, so nothing fades and nothing ends, and it would stay over the chat and take every tap.
      setTimeout(() => {
        if (!historySidebarOverlay.classList.contains('visible')) historySidebarOverlay.classList.add('hidden');
      }, 320);
    }
  }

  function renderHistorySidebarContent() {
    const historySidebarList = getRequiredElement('historySidebarList');
    const conv = getActiveConversation();

    historySidebarList.innerHTML = '';
    if (!conv || conv.messages.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'p-4 text-sm text-center text-[var(--text-secondary)]';
      empty.textContent = sandboxText(language(), 'timelineEmpty');
      historySidebarList.appendChild(empty);
      return;
    }

    conv.messages.forEach((msg, index) => {
      const isUser = msg.role === 'user';
      const listItem = document.createElement('div');
      listItem.className = `history-sidebar-item ${isUser ? 'is-user' : 'is-model'}`;
      listItem.dataset.messageIndex = index;
      const role = document.createElement('span');
      role.className = 'history-sidebar-role';
      role.textContent = sandboxText(language(), isUser ? 'timelineYou' : 'timelineReply');
      const words = document.createElement('span');
      words.className = 'history-sidebar-text';
      words.textContent = getMessageTypeIcon(msg) + timelineSnippet(msg, sandboxText(language(), isUser ? 'timelineYourMessage' : 'timelineEmptyReply'));
      const dot = document.createElement('span');
      dot.className = 'history-sidebar-dot';
      listItem.append(dot, role, words);
      historySidebarList.appendChild(listItem);
    });
  }

  function setupHistorySidebarInteractions() {
    const { historySidebarList, messageList } = elements;

    historySidebarList.addEventListener('click', (event) => {
      const item = event.target.closest('.history-sidebar-item');
      if (!item) return;

      const messageIndex = item.dataset.messageIndex;
      if (messageIndex === undefined) return;

      const targetMessageElement = messageList.querySelector(`[data-message-index="${messageIndex}"]`);
      if (!targetMessageElement) return;

      targetMessageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const bubble = targetMessageElement.querySelector('.message-bubble');
      if (bubble) {
        bubble.classList.add('message-highlight');
        setTimeout(() => {
          bubble.classList.remove('message-highlight');
        }, 1500);
      }
      // Beside the chat it stays; over it, it gives way to the message.
      if (!isDocked()) toggleHistorySidebar(false);
    });

    const { historySidebar } = elements;
    historySidebar.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-history-tab]');
      if (tab) {
        setHistoryTab(tab.dataset.historyTab);
        return;
      }
      if (event.target.closest('[data-history-close]')) toggleHistorySidebar(false);
    });
    // The "Sources" button under a reply asks for its sources in the panel.
    document.addEventListener('noureon:open-sources', (event) => {
      const detail = event.detail || {};
      toggleHistorySidebar(true, { tab: 'sources', sources: detail.sources || null, highlight: detail.highlight ? new Set(detail.highlight) : null });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && historySidebar.classList.contains('visible') && !document.documentElement.classList.contains('source-sheet-open')) {
        toggleHistorySidebar(false);
      }
    });
  }

  function setupHistorySidebarTriggers() {
    const { chatContainer, historySidebar, historySidebarTriggerZone, historySidebarOverlay, menuToggleBtn } = elements;
    let touchStartX = 0;
    let touchStartY = 0;

    historySidebarOverlay.addEventListener('click', () => {
      historySidebarOverlay.addEventListener('touchstart', (event) => {
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
      }, { passive: true });

      historySidebarOverlay.addEventListener('touchend', (event) => {
        const deltaX = event.changedTouches[0].clientX - touchStartX;
        const deltaY = event.changedTouches[0].clientY - touchStartY;
        if (deltaX > 50 && Math.abs(deltaY) < Math.abs(deltaX) / 2) {
          toggleHistorySidebar(false);
        }
      }, { passive: true });
      toggleHistorySidebar(false);
    });

    // Where the panel lies over the chat, opening the left menu puts the panel away (the two would cover each other).
    menuToggleBtn?.addEventListener('click', () => {
      if (!isDocked() && historySidebar.classList.contains('visible')) toggleHistorySidebar(false);
    });

    // The pointer at the right edge opens the panel on the Timeline. It stays open until it is closed (its button, the
    // Escape key, or a tap on the veil where the panel lies over the chat).
    historySidebarTriggerZone.addEventListener('mouseenter', () => {
      if (!historySidebar.classList.contains('visible')) toggleHistorySidebar(true, { tab: 'timeline' });
    });

    chatContainer.addEventListener('touchstart', (event) => {
      if (event.target.closest('.table-scroll-container')) {
        touchStartX = null;
        return;
      }
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
    }, { passive: true });

    chatContainer.addEventListener('touchend', (event) => {
      if (touchStartX === null) return;
      const deltaX = event.changedTouches[0].clientX - touchStartX;
      const deltaY = event.changedTouches[0].clientY - touchStartY;
      if (deltaX < -50 && Math.abs(deltaY) < Math.abs(deltaX) / 2 && !historySidebar.classList.contains('visible')) {
        toggleHistorySidebar(true, { tab: 'timeline' });
      }
    }, { passive: true });

    historySidebar.addEventListener('touchstart', (event) => {
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
    }, { passive: true });

    historySidebar.addEventListener('touchend', (event) => {
      const deltaX = event.changedTouches[0].clientX - touchStartX;
      const deltaY = event.changedTouches[0].clientY - touchStartY;
      if (deltaX > 50 && Math.abs(deltaY) < Math.abs(deltaX) / 2) {
        toggleHistorySidebar(false);
      }
    }, { passive: true });
  }

  const isVisibleConversation = (conversation) =>
    !conversation.archived
    && !conversation.folderId
    && !conversation.deletedAt
    && conversation.retentionMode !== 'ephemeral';

  function renderHistorySidebar(conversations = getConversations()) {
    const historyList = getRequiredElement('historyList');
    historyList.innerHTML = '';
    const sortedConversations = conversations
      .filter(isVisibleConversation)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        const dateB = b.lastUpdatedAt || b.createdAt;
        const dateA = a.lastUpdatedAt || a.createdAt;
        return new Date(dateB) - new Date(dateA);
      });

    sortedConversations.forEach((conversation) => {
      if (conversation.isTemporary) return;
      if (conversation.isNaming) {
        const thinkingPlaceholder = document.createElement('div');
        thinkingPlaceholder.className = 'sidebar-item p-3 rounded-lg flex items-center gap-3 text-[var(--text-secondary)] italic';
        thinkingPlaceholder.innerHTML = `
          <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span data-lang-key="naming">${getNamingText()}</span>
        `;
        historyList.appendChild(thinkingPlaceholder);
        return;
      }
      historyList.appendChild(createConversationElement(conversation));
    });
  }

  return {
    isVisibleConversation,
    renderHistorySidebar,
    renderHistorySidebarContent,
    setupHistorySidebarInteractions,
    setupHistorySidebarTriggers,
    toggleHistorySidebar
  };
}
