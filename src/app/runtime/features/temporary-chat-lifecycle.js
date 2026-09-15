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

const SAVE_BOOKMARK_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:1.25rem;height:1.25rem" aria-hidden="true">
    <path data-temporary-chat-save-bookmark d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
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
  let headerStatus;
  let saveButton;
  let messageObserver;
  let mobileLayoutQuery;
  let headerActions;

  const text = (key, fallback) => getText?.(key, fallback) || fallback;

  const closeMemoryMenu = () => {
    memoryMenu?.classList.add('hidden');
    root?.querySelector('#temporary-memory-button')?.setAttribute('aria-expanded', 'false');
  };

  const applyResponsiveLayout = isMobile => {
    if (!root || !memoryMenu) return;
    const mobileValue = value => isMobile ? value : '';
    const useHeader = Boolean(headerActions && (isMobile || root.classList.contains('is-save-layout')));
    const entryButton = root.querySelector('#temporary-chat-entry-button');
    const memoryButton = root.querySelector('#temporary-memory-button');
    const memoryButtonIcon = memoryButton?.querySelector('svg');

    if (useHeader && root.parentElement !== headerActions) {
      headerActions.insertBefore(root, elements.newChatBtnHeader || null);
    } else if (!useHeader && root.parentElement !== elements.chatWorkspace) {
      elements.chatWorkspace.appendChild(root);
    }

    Object.assign(root.style, {
      position: useHeader ? 'static' : '',
      left: useHeader ? '' : mobileValue('.75rem'),
      right: '',
      top: '',
      bottom: useHeader ? '' : mobileValue('calc(4.75rem + env(safe-area-inset-bottom, 0px))'),
      gap: mobileValue('.15rem'),
      flexDirection: isMobile ? 'row-reverse' : ''
    });
    Object.assign(entryButton.style, {
      width: mobileValue('2.75rem'),
      height: mobileValue('2.75rem'),
      minWidth: mobileValue('2.75rem'),
      minHeight: mobileValue('2.75rem')
    });
    Object.assign(memoryButton.style, {
      height: mobileValue('2.75rem'),
      minHeight: mobileValue('2.75rem'),
      paddingInline: mobileValue('.35rem'),
      gap: mobileValue('.2rem'),
      fontSize: mobileValue('.8rem')
    });
    Object.assign(memoryButtonIcon.style, {
      width: mobileValue('.85rem'),
      height: mobileValue('.85rem')
    });
    Object.assign(memoryMenu.style, {
      left: isMobile ? 'auto' : mobileValue('-2.9rem'),
      right: isMobile ? '-2.9rem' : '',
      top: isMobile ? 'calc(100% + .35rem)' : '',
      bottom: isMobile ? 'auto' : mobileValue('calc(100% + .35rem)'),
      width: mobileValue('min(17.5rem, calc(100vw - 1.5rem))'),
      padding: mobileValue('.3rem'),
      borderRadius: mobileValue('.9rem')
    });
    memoryMenu.querySelectorAll('button').forEach(button => Object.assign(button.style, {
      minHeight: mobileValue('3rem'),
      gap: mobileValue('.5rem'),
      padding: mobileValue('.5rem .6rem'),
      borderRadius: mobileValue('.65rem')
    }));
    memoryMenu.querySelectorAll('strong').forEach(label => Object.assign(label.style, {
      fontSize: mobileValue('.82rem'),
      lineHeight: mobileValue('1.2')
    }));
    memoryMenu.querySelectorAll('small').forEach(description => Object.assign(description.style, {
      fontSize: mobileValue('.7rem'),
      lineHeight: mobileValue('1.25')
    }));
    Object.assign(saveButton.style, {
      width: mobileValue('2.75rem'),
      height: mobileValue('2.75rem'),
      minWidth: mobileValue('2.75rem'),
      minHeight: mobileValue('2.75rem'),
      paddingInline: mobileValue('0')
    });
    if (headerStatus) headerStatus.style.display = isMobile ? 'none' : '';
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
      </div>
      <button id="save-temporary-chat-button" class="save-temporary-chat-button hidden w-10 h-10 p-0 items-center justify-center rounded-full" type="button">
        ${SAVE_BOOKMARK_ICON}<span class="sr-only" data-lang-key="temporaryChatSave">永久儲存</span>
      </button>`;
    elements.chatWorkspace.appendChild(root);
    memoryMenu = root.querySelector('#temporary-memory-menu');
    saveButton = root.querySelector('#save-temporary-chat-button');
    const MutationObserverCtor = document.defaultView?.MutationObserver || globalThis.MutationObserver;
    if (!messageObserver && MutationObserverCtor && elements.messageList) {
      messageObserver = new MutationObserverCtor(() => render());
      messageObserver.observe(elements.messageList, { childList: true });
    }

    headerActions = elements.newChatBtnHeader?.parentElement;
    if (headerActions) {
      headerStatus = document.createElement('span');
      headerStatus.id = 'temporary-chat-header-status';
      headerStatus.className = 'temporary-chat-header-status hidden h-9 px-2 items-center text-sm font-medium whitespace-nowrap';
      headerStatus.dataset.langKey = 'temporaryChatTitle';
      headerStatus.textContent = '臨時對話';
      headerActions.insertBefore(headerStatus, elements.newChatBtnHeader || null);
    }

    mobileLayoutQuery = document.defaultView?.matchMedia?.('(max-width: 768px)');
    applyResponsiveLayout(mobileLayoutQuery?.matches ?? (document.defaultView?.innerWidth <= 768));
    mobileLayoutQuery?.addEventListener?.('change', event => applyResponsiveLayout(event.matches));

    saveButton.addEventListener('click', () => { void savePermanent(); });

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

  const renderTemporaryGreeting = (show, memoryEnabled) => {
    const greeting = elements.messageList?.querySelector('.chat-greeting-message');
    if (!greeting) return;
    if (!show) {
      if (greeting.dataset.temporaryChatGreeting === 'true') {
        greeting.innerHTML = greeting.__temporaryChatOriginalHtml || '';
        delete greeting.dataset.temporaryChatGreeting;
        delete greeting.dataset.temporaryChatGreetingMode;
        delete greeting.__temporaryChatOriginalHtml;
      }
      return;
    }
    const greetingMode = memoryEnabled ? 'personalized' : 'unpersonalized';
    if (greeting.dataset.temporaryChatGreeting !== 'true') {
      greeting.__temporaryChatOriginalHtml = greeting.innerHTML;
      greeting.dataset.temporaryChatGreeting = 'true';
    }
    if (greeting.dataset.temporaryChatGreetingMode !== greetingMode) {
      greeting.dataset.temporaryChatGreetingMode = greetingMode;
      const titleKey = memoryEnabled ? 'temporaryChatTitle' : 'temporaryChatUnpersonalizedTitle';
      const descriptionKey = memoryEnabled ? 'temporaryChatDescription' : 'temporaryChatUnpersonalizedNotice';
      const title = text(titleKey, '臨時對話');
      const description = text(
        descriptionKey,
        memoryEnabled
          ? '此對話可以參考既有記憶，但不會顯示在你的對話記錄中，也不會產生新記憶。'
          : '此對話會忽略記憶、外掛程式和自訂指示，也不會顯示在你的對話記錄中。'
      );
      greeting.innerHTML = `
        <div id="temporary-chat-hero" class="temporary-chat-hero">
        <h2 class="text-2xl font-semibold m-0" data-lang-key="${titleKey}">${title}</h2>
        <p data-lang-key="${descriptionKey}">${description}</p>
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
    const showPermanentSave = isEphemeral && hasMessages;
    const memoryEnabled = conversation?.memoryAccessEnabled !== false;

    root.classList.toggle('hidden', !(showEntry || showPermanentSave));
    root.classList.toggle('is-save-layout', showPermanentSave);
    root.querySelector('#temporary-chat-entry-button').classList.toggle('hidden', !showEntry);
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
    renderTemporaryGreeting(showPersonalization, memoryEnabled);
    saveButton.classList.toggle('hidden', !showPermanentSave);
    saveButton.classList.toggle('flex', showPermanentSave);
    saveButton.title = text('temporaryChatSave', '永久儲存');
    headerStatus?.classList.toggle('hidden', !isEphemeral);
    headerStatus?.classList.toggle('flex', isEphemeral);
    if (headerStatus) headerStatus.textContent = text('temporaryChatTitle', '臨時對話');
    applyResponsiveLayout(mobileLayoutQuery?.matches ?? (document.defaultView?.innerWidth <= 768));
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
