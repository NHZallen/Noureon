import {
  EPHEMERAL_RETENTION_MODE,
  PERSISTENT_RETENTION_MODE,
  isEphemeralConversation
} from './temporary-chat-state.js';

const TEMPORARY_CHAT_INACTIVE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5.15 16.15A8 8 0 0 1 5 7.9" />
    <path d="M7.8 5.05A8 8 0 1 1 7.95 18.9" />
    <path d="m7.95 18.9-4.2 1.1 1.4-3.85" />
  </svg>`;

const TEMPORARY_CHAT_ACTIVE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5.15 16.15A8 8 0 0 1 5 7.9" />
    <path d="M7.8 5.05A8 8 0 1 1 7.95 18.9" />
    <path d="m7.95 18.9-4.2 1.1 1.4-3.85" />
    <path data-temporary-chat-slash d="m7.25 6.75 9.5 10.5" />
  </svg>`;

export function createTemporaryChatLifecycle({
  document,
  elements,
  getActiveConversation,
  getText,
  saveAppData,
  renderAll,
  showNotification = () => {},
  persistGeneratedImageAssets = async () => {}
} = {}) {
  if (!document || !elements?.chatWorkspace || typeof getActiveConversation !== 'function') {
    throw new TypeError('Temporary chat lifecycle requires the chat workspace and active conversation.');
  }

  let root;
  let memoryMenu;
  let headerAction;
  let messageObserver;

  const text = (key, fallback) => getText?.(key, fallback) || fallback;

  const closeMemoryMenu = () => {
    memoryMenu?.classList.add('hidden');
    root?.querySelector('#temporary-memory-button')?.setAttribute('aria-expanded', 'false');
  };

  const ensureDom = () => {
    if (root?.isConnected) return;

    root = document.createElement('div');
    root.id = 'temporary-chat-controls';
    root.className = 'temporary-chat-controls absolute left-4 bottom-4 z-20 flex items-center gap-1';
    root.innerHTML = `
      <button id="temporary-chat-entry-button" class="temporary-chat-entry-button w-10 h-10 grid place-items-center rounded-full flex-none" type="button">
        <span class="temporary-chat-icon temporary-chat-icon-inactive">${TEMPORARY_CHAT_INACTIVE_ICON}</span>
        <span class="temporary-chat-icon temporary-chat-icon-active">${TEMPORARY_CHAT_ACTIVE_ICON}</span>
        <span class="sr-only" data-lang-key="temporaryChatStart">開始臨時對話</span>
      </button>
      <div id="temporary-chat-personalization" class="temporary-chat-personalization relative hidden">
        <button id="temporary-memory-button" class="temporary-memory-button h-10 px-2 flex items-center gap-1 rounded-full whitespace-nowrap text-[0.95rem]" type="button" aria-haspopup="menu" aria-expanded="false">
          <span id="temporary-memory-label"></span>
          <svg class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
        </button>
        <div id="temporary-memory-menu" class="temporary-memory-menu hidden" role="menu">
          <button class="w-full p-3 flex items-center gap-3 text-left rounded-xl" type="button" role="menuitemradio" data-memory-enabled="true">
            <span class="temporary-memory-option-copy flex-1 grid gap-0.5">
              <strong data-lang-key="temporaryChatPersonalized">個人化</strong>
              <small data-lang-key="temporaryChatPersonalizedDescription">此對話可以參考既有記憶</small>
            </span>
            <span class="temporary-memory-check" aria-hidden="true">✓</span>
          </button>
          <button class="w-full p-3 flex items-center gap-3 text-left rounded-xl" type="button" role="menuitemradio" data-memory-enabled="false">
            <span class="temporary-memory-option-copy flex-1 grid gap-0.5">
              <strong data-lang-key="temporaryChatUnpersonalized">非個人化</strong>
              <small data-lang-key="temporaryChatUnpersonalizedDescription">此對話不會參考既有記憶</small>
            </span>
            <span class="temporary-memory-check" aria-hidden="true">✓</span>
          </button>
        </div>
      </div>`;
    elements.chatWorkspace.appendChild(root);
    memoryMenu = root.querySelector('#temporary-memory-menu');
    const MutationObserverCtor = document.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (!messageObserver && MutationObserverCtor && elements.messageList) {
      messageObserver = new MutationObserverCtor(() => render());
      messageObserver.observe(elements.messageList, { childList: true });
    }

    const headerActions = elements.newChatBtnHeader?.parentElement;
    if (headerActions) {
      headerAction = document.createElement('button');
      headerAction.id = 'save-temporary-chat-button';
      headerAction.type = 'button';
      headerAction.className = 'save-temporary-chat-button hidden h-9 px-3 flex items-center gap-1 text-xs rounded-full';
      headerAction.innerHTML = `${TEMPORARY_CHAT_ACTIVE_ICON}<span data-lang-key="temporaryChatSave">永久儲存</span>`;
      headerActions.insertBefore(headerAction, elements.newChatBtnHeader || null);
      headerAction.addEventListener('click', () => { void savePermanent(); });
    }

    root.querySelector('#temporary-chat-entry-button').addEventListener('click', () => {
      const conversation = getActiveConversation();
      if (!conversation || (conversation.messages?.length || 0) > 0) return;
      if (isEphemeralConversation(conversation)) {
        conversation.retentionMode = PERSISTENT_RETENTION_MODE;
        delete conversation.memoryAccessEnabled;
      } else {
        conversation.retentionMode = EPHEMERAL_RETENTION_MODE;
        conversation.memoryAccessEnabled = true;
      }
      renderAll({ reason: 'temporary-chat-mode-changed', animate: false });
    });

    root.querySelector('#temporary-memory-button').addEventListener('click', event => {
      event.stopPropagation();
      const willOpen = memoryMenu.classList.contains('hidden');
      closeMemoryMenu();
      if (willOpen) {
        memoryMenu.classList.remove('hidden');
        event.currentTarget.setAttribute('aria-expanded', 'true');
      }
    });

    memoryMenu.querySelectorAll('[data-memory-enabled]').forEach(button => {
      button.addEventListener('click', () => {
        const conversation = getActiveConversation();
        if (!conversation || !isEphemeralConversation(conversation) || conversation.messages?.length) return;
        conversation.memoryAccessEnabled = button.dataset.memoryEnabled === 'true';
        closeMemoryMenu();
        render();
      });
    });

    document.addEventListener?.('click', event => {
      if (!root?.contains(event.target)) closeMemoryMenu();
    });
  };

  const renderTemporaryGreeting = (show) => {
    const greeting = elements.messageList?.querySelector('.chat-greeting-message');
    if (!greeting) return;
    if (!show) {
      if (greeting.dataset.temporaryChatGreeting === 'true') {
        greeting.innerHTML = greeting.__temporaryChatOriginalHtml || '';
        delete greeting.dataset.temporaryChatGreeting;
        delete greeting.__temporaryChatOriginalHtml;
      }
      return;
    }
    if (greeting.dataset.temporaryChatGreeting !== 'true') {
      greeting.__temporaryChatOriginalHtml = greeting.innerHTML;
      greeting.dataset.temporaryChatGreeting = 'true';
      greeting.innerHTML = `
        <div id="temporary-chat-hero" class="temporary-chat-hero">
        <h2 class="text-2xl font-semibold m-0" data-lang-key="temporaryChatTitle">臨時對話</h2>
        <p data-lang-key="temporaryChatDescription">此對話可以參考既有記憶，但不會顯示在你的對話記錄中，也不會產生新記憶。</p>
        </div>`;
    }
  };

  const render = () => {
    ensureDom();
    const conversation = getActiveConversation();
    const hasMessages = (conversation?.messages?.length || 0) > 0;
    const isDraft = Boolean(conversation && !conversation.archived && !conversation.deletedAt && !hasMessages);
    const isEphemeral = isEphemeralConversation(conversation);
    const showEntry = isDraft;
    const showPersonalization = isDraft && isEphemeral;
    const memoryEnabled = conversation?.memoryAccessEnabled !== false;

    root.classList.toggle('hidden', !showEntry);
    root.querySelector('#temporary-chat-personalization').classList.toggle('hidden', !showPersonalization);
    root.querySelector('#temporary-chat-entry-button').classList.toggle('is-active', showPersonalization);
    const entryButton = root.querySelector('#temporary-chat-entry-button');
    const entryTextKey = isEphemeral ? 'temporaryChatExit' : 'temporaryChatStart';
    const entryText = text(
      isEphemeral ? 'temporaryChatExit' : 'temporaryChatStart',
      isEphemeral ? '退出臨時對話' : '開始臨時對話'
    );
    entryButton.title = entryText;
    const entryScreenReaderText = entryButton.querySelector('.sr-only');
    entryScreenReaderText.dataset.langKey = entryTextKey;
    entryScreenReaderText.textContent = entryText;
    root.querySelector('#temporary-memory-label').textContent = text(
      memoryEnabled ? 'temporaryChatPersonalized' : 'temporaryChatUnpersonalized',
      memoryEnabled ? '個人化' : '非個人化'
    );
    memoryMenu.querySelectorAll('[data-memory-enabled]').forEach(button => {
      const selected = (button.dataset.memoryEnabled === 'true') === memoryEnabled;
      button.setAttribute('aria-checked', String(selected));
      button.classList.toggle('is-selected', selected);
    });

    elements.chatWorkspace.classList.toggle('is-ephemeral-draft', showPersonalization);
    renderTemporaryGreeting(showPersonalization);
    headerAction?.classList.toggle('hidden', !(isEphemeral && hasMessages));
    if (headerAction) headerAction.title = text('temporaryChatSave', '永久儲存');
    if (!showPersonalization) closeMemoryMenu();
  };

  const savePermanent = async () => {
    const conversation = getActiveConversation();
    if (!isEphemeralConversation(conversation)) return;
    await persistGeneratedImageAssets(conversation);
    conversation.memoryCaptureStartIndex = conversation.messages?.length || 0;
    conversation.retentionMode = PERSISTENT_RETENTION_MODE;
    conversation.isTemporary = false;
    conversation.isNaming = false;
    delete conversation.memoryAccessEnabled;
    conversation.lastUpdatedAt = new Date().toISOString();
    await saveAppData({ immediateCloudSync: true });
    renderAll({ reason: 'temporary-chat-saved', animate: false, scrollMode: 'preserve' });
    showNotification(text('temporaryChatSaved', '已永久儲存，這現在是一般對話。'), 'success');
  };

  return {
    render,
    savePermanent
  };
}
