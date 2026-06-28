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
  function toggleHistorySidebar(show) {
    const { historySidebar, historySidebarOverlay } = elements;
    if (show) {
      requestAnimationFrame(() => {
        setupMessageIntersectionObserver();
      });
      historySidebarOverlay.classList.remove('hidden');
      requestAnimationFrame(() => {
        historySidebar.classList.add('visible');
        historySidebarOverlay.classList.add('visible');
      });
    } else {
      historySidebar.classList.remove('visible');
      historySidebarOverlay.classList.remove('visible');
      historySidebarOverlay.addEventListener('transitionend', () => {
        if (!historySidebarOverlay.classList.contains('visible')) {
          historySidebarOverlay.classList.add('hidden');
        }
      }, { once: true });
    }
  }

  function renderHistorySidebarContent() {
    const historySidebarList = getRequiredElement('historySidebarList');
    const conv = getActiveConversation();

    historySidebarList.innerHTML = '';
    if (!conv || conv.messages.length === 0) {
      historySidebarList.innerHTML = '<p class="p-4 text-sm text-center text-[var(--text-secondary)]">沒有歷史訊息</p>';
      return;
    }

    conv.messages.forEach((msg, index) => {
      const textPart = msg.parts.find((part) => part.text);
      const snippet = textPart ? textPart.text : (msg.role === 'user' ? '用戶訊息' : 'AI 回覆');
      const listItem = document.createElement('div');
      const isUser = msg.role === 'user';
      const colorConfig = isUser ? userBubbleColors : aiBubbleColors;
      const currentConfig = getConfig();
      const colorName = isUser ? currentConfig.userBubbleColor : currentConfig.aiBubbleColor;
      const bgColor = (colorConfig[colorName] || colorConfig.default).light;

      listItem.className = 'history-sidebar-item';
      listItem.dataset.messageIndex = index;
      listItem.style.backgroundColor = hexToRgba(bgColor, 0.4);
      listItem.style.color = getTextColorForBackground(bgColor);
      listItem.textContent = getMessageTypeIcon(msg) + snippet;
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
      toggleHistorySidebar(false);
    });
  }

  function setupHistorySidebarTriggers() {
    const { chatContainer, historySidebar, historySidebarTriggerZone, historySidebarOverlay } = elements;
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

    historySidebarTriggerZone.addEventListener('mouseenter', () => {
      renderHistorySidebarContent();
      toggleHistorySidebar(true);
    });

    document.body.addEventListener('mousemove', (event) => {
      if (historySidebar.classList.contains('visible')) {
        const isOverSidebar = historySidebar.contains(event.target);
        const isOverTrigger = historySidebarTriggerZone.contains(event.target);
        if (!isOverSidebar && !isOverTrigger) {
          toggleHistorySidebar(false);
        }
      }
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
      if (deltaX < -50 && Math.abs(deltaY) < Math.abs(deltaX) / 2) {
        renderHistorySidebarContent();
        toggleHistorySidebar(true);
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
    !conversation.archived && !conversation.folderId && !conversation.deletedAt;

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
