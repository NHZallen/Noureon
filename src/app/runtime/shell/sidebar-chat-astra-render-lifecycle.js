import {
  FOLDER_SVGS,
  FOLDER_TEXT_COLORS
} from '../features/folder-metadata.js';
import { createMediaAttachmentRenderer as createMessageMediaAttachmentRenderer } from '../messages/media-attachment-renderer.js';
import { createMediaPreviewLifecycle as createMessageMediaPreviewLifecycle } from '../messages/media-preview-lifecycle.js';
import { createMessageListLifecycle } from '../messages/message-list-lifecycle.js';
import { escapeHTML as escapeMarkup } from './shell-utilities.js';
import { shareTagsHtml } from '../share/share-ref.js';
import { isHighRiskCustomNouras } from '../nouras/nouras-policy.js';
import { createTemporaryChatLifecycle } from '../features/temporary-chat-lifecycle.js';
import { visionRetryOffered } from '../features/vision-retry-state.js';
import { messageIsCouncilTurn } from '../../ui/council/council-record.js';

const REQUIRED_DEPENDENCIES = [
  'window',
  'document',
  'elements',
  'runtimeAppDataStore',
  'liveConversationsBridge',
  'session',
  'selection',
  'runtimeDomAccess',
  'runtimeConfigAccess',
  'conversationStateAccess',
  'runtimeRenderCoordinator',
  'runtimeDialogCoordinator',
  'i18n',
  'getActiveConversation',
  'saveAppData',
  'saveFolderUiState',
  'renderAstras',
  'renderAll',
  'renderBatchActionBar',
  'loadChat',
  'createHistoryMenu',
  'createFolderMenu',
  'deleteChat',
  'showArchivedChatPreview',
  'unarchiveChat',
  'showMobileContextMenu',
  'showMobileContextMenuForFolder',
  'toggleModal',
  'showNotification',
  'showCustomConfirm',
  'deleteAstrasFromCloud',
  'buildMessageRenderView'
];

export function createSidebarChatAstraRenderLifecycle(dependencies = {}) {
  for (const key of REQUIRED_DEPENDENCIES) {
    if (dependencies[key] == null) {
      throw new Error(`createSidebarChatAstraRenderLifecycle missing dependency: ${key}`);
    }
  }

  const {
    window,
    document,
    navigator,
    fetch,
    File,
    elements: ALL_ELEMENTS,
    // Functions made after this lifecycle by shell.js, called once the page runs.
    toggleSidebar,
    updateInputState,
    generateTitleAndSummary,
    // The workspace data, who is signed in and the batch selection (shell/shell-state.js).
    runtimeAppDataStore,
    liveConversationsBridge,
    session,
    selection,
    // Whether the conversation is being scrolled down to its latest message (features/chat-scroll-lifecycle.js).
    isAutoScrolling = () => false,
    runtimeDomAccess,
    runtimeConfigAccess,
    conversationStateAccess,
    runtimeRenderCoordinator,
    runtimeDialogCoordinator,
    i18n,
    getActiveConversation,
    normalizeConversationModel = (conversation) => conversation?.model,
    isCouncilEnabled = () => false,
    getCouncilTexts = () => ({ title: '' }),
    resolveFolderColor = (color, _palette, fallback) => color || fallback,
    folderColors = {},
    saveAppData,
    saveFolderUiState,
    renderAstras,
    renderAll,
    renderBatchActionBar,
    loadChat,
    createHistoryMenu,
    createFolderMenu,
    deleteChat,
    showArchivedChatPreview,
    unarchiveChat,
    showMobileContextMenu,
    showMobileContextMenuForFolder,
    openAvatarEditor = () => {},
    syncComposerLayout = () => {},
    toggleModal,
    showNotification,
    showCustomConfirm,
    deleteAstrasFromCloud,
    buildMessageRenderView,
    escapeHTML = (value = '') => String(value ?? ''),
    renderUserText = (value = '') => String(value ?? ''),
    renderMarkdownWithFormulas = (value = '') => String(value ?? ''),
    formatFullTimestamp = () => '',
    renderModelSwitcher = () => {},
    renderInputIndicators = () => {},
    renderCouncilControls = () => {},
    setupMessageIntersectionObserver = () => {},
    bindGeneratedImageAssets = async () => {},
    getGeneratedImageAssetStore = async () => null,
    requestAnimationFrame = (callback) => callback(),
    crypto = globalThis.crypto
  } = dependencies;

  const getConfig = () => runtimeConfigAccess.getConfig();
  const getConversations = () => liveConversationsBridge.getConversations();
  const getFolders = () => runtimeAppDataStore.getFolders();
  const getAstras = () => runtimeAppDataStore.getAstras();
  const getCurrentUser = () => session.getCurrentUser();
  const getCurrentUserDisplayName = () => {
    const user = getCurrentUser();
    return user?.displayName || user?.email || user?.username || 'User';
  };
  // The Noura whose dialog is open for editing, or null when the dialog makes a new one.
  let editingAstrasId = null;
  const getEditingAstrasId = () => editingAstrasId;
  const setEditingAstrasId = (nextId) => { editingAstrasId = nextId; };
  const getIsSelectionMode = () => selection.isSelectionMode();
  const isCouncilConversation = (conversation) => (
    isCouncilEnabled(conversation) ||
    (conversation?.messages || []).some((message) => (
      (message?.role === 'model' && Boolean(message?.council)) || messageIsCouncilTurn(message)
    ))
  );

  const renderFolders = () => {
    const folderList = runtimeDomAccess.getRequiredElement('folderList');
    folderList.innerHTML = '';
    getFolders().forEach(folder => {
      const folderConvs = folder.conversationIds
        .map(id => getConversations().find(c => c.id === id))
        .filter(c => c && !c.archived && !c.deletedAt)
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          const dateB = b.lastUpdatedAt || b.createdAt;
          const dateA = a.lastUpdatedAt || a.createdAt;
          return new Date(dateB) - new Date(dateA);
        });
      const folderElement = document.createElement('div');
      folderElement.className = 'folder-item text-sm';
      folderElement.dataset.id = folder.id;
      folderElement.dataset.open = folder.isOpen;
      const svgPath = FOLDER_SVGS[folder.icon] || FOLDER_SVGS.default;
      const iconColor = resolveFolderColor(folder.color, folderColors, folderColors.gray);
      const textColor = FOLDER_TEXT_COLORS[folder.textColor] || FOLDER_TEXT_COLORS.gray;

      folderElement.innerHTML = `
                    <div class="folder-summary sidebar-item p-3 rounded-lg flex items-center justify-between">
                        <div class="flex items-center gap-2 truncate">
                            <svg class="folder-arrow flex-shrink-0" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            <span class="folder-icon mr-1 flex-shrink-0" style="--folder-icon-color: ${iconColor}; color: ${iconColor};">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="folder-icon-svg">
                                    ${svgPath}
                                </svg>
                            </span>
                            <span class="font-medium truncate" style="color: ${textColor};">${escapeMarkup(folder.name)}</span>
                        </div>
                        <button data-id="${escapeMarkup(folder.id)}" class="folder-options-btn flex-shrink-0 w-6 h-6 rounded-md hover:bg-[var(--active-bg)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg></button>
                    </div>
                    <div class="folder-content-container">
                        <div class="pl-4 mt-1 space-y-1">
                        </div>
                    </div>
                `;

      const contentContainer = folderElement.querySelector('.folder-content-container > div');
      folderConvs.forEach(conv => {
        contentContainer.appendChild(createConversationElement(conv));
      });
      const folderSummary = folderElement.querySelector('.folder-summary');
      let pressTimer = null;
      let touchMoved = false;
      const startPress = (event) => {
        if (window.innerWidth >= 768 || getIsSelectionMode()) return;
        touchMoved = false;
        pressTimer = setTimeout(() => {
          event.preventDefault();
          showMobileContextMenuForFolder(folder.id);
          pressTimer = null;
        }, 500);
      };
      const cancelPress = () => {
        clearTimeout(pressTimer);
        pressTimer = null;
      };
      const handleClick = async (event) => {
        if (pressTimer || !touchMoved) {
          cancelPress();
          if (event.target.closest('.folder-options-btn')) return;
          const folderItem = event.currentTarget.closest('.folder-item');
          const folderObj = getFolders().find(f => f.id === folderItem.dataset.id);
          if (folderObj) {
            folderObj.isOpen = !folderObj.isOpen;
            folderItem.dataset.open = folderObj.isOpen;
            await saveFolderUiState(getFolders());
          }
        }
      };
      folderSummary.addEventListener('touchstart', startPress, { passive: true });
      folderSummary.addEventListener('touchend', cancelPress);
      folderSummary.addEventListener('touchmove', () => { touchMoved = true; cancelPress(); }, { passive: true });
      folderSummary.addEventListener('mousedown', startPress);
      folderSummary.addEventListener('mouseup', cancelPress);
      folderSummary.addEventListener('mouseleave', cancelPress);
      folderSummary.addEventListener('click', handleClick);
      const folderOptionsBtn = folderElement.querySelector('.folder-options-btn');
      folderOptionsBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        createFolderMenu(folder.id, folderOptionsBtn);
      });
      folderList.appendChild(folderElement);
    });
  };

  const createConversationElement = (conv) => {
    const item = document.createElement('div');
    const currentConversationId = conversationStateAccess.getCurrentConversationId();
    item.className = `sidebar-item w-full text-left p-3 rounded-lg flex items-center justify-between cursor-pointer ${conv.id === currentConversationId && !getIsSelectionMode() ? 'active' : ''}`;
    item.dataset.id = conv.id;
    const modelDisplayName = isCouncilConversation(conv)
      ? (getCouncilTexts()?.title || 'Model Council')
      : (normalizeConversationModel(conv)?.name || '');
    const modelNameSuffix = modelDisplayName ? `<span class="model-suffix" title="${escapeHTML(modelDisplayName)}">${escapeHTML(modelDisplayName)}</span>` : '';
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'flex-1 flex items-center justify-between min-w-0';
    contentWrapper.innerHTML = `
                <div class="conversation-sidebar-copy flex-1 min-w-0">
                    <span class="conversation-title-text">${escapeHTML(conv.title)}${conv.pinned ? ' <span class="pinned-icon">📌</span>' : ''}${shareTagsHtml(conv, (key) => i18n[runtimeConfigAccess.getUiLanguage()]?.[key] || '')}</span>
                    ${modelNameSuffix}
                 </div>
                <button class="chat-options-btn flex-shrink-0 w-6 h-6 rounded-md hover:bg-[var(--hover-bg)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg></button>
            `;
    if (getIsSelectionMode()) {
      item.classList.add('pr-2');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'conv-select-checkbox h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3 flex-shrink-0';
      checkbox.checked = selection.getSelectedConversationIds().has(conv.id);
      checkbox.dataset.id = conv.id;
      checkbox.addEventListener('change', () => {
        selection.selectConversation(conv.id, checkbox.checked);
        renderBatchActionBar();
      });
      checkbox.addEventListener('click', event => event.stopPropagation());
      item.appendChild(checkbox);
      contentWrapper.querySelector('.chat-options-btn').classList.add('hidden');
    }
    item.appendChild(contentWrapper);
    let pressTimer = null;
    let touchMoved = false;
    const startPress = (event) => {
      if (window.innerWidth >= 768 || getIsSelectionMode()) return;
      touchMoved = false;
      pressTimer = setTimeout(() => {
        event.preventDefault();
        showMobileContextMenu(conv.id, event.currentTarget);
        pressTimer = null;
      }, 500);
    };
    const cancelPress = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
    };
    const handleClick = () => {
      if (pressTimer || !touchMoved) {
        cancelPress();
        if (getIsSelectionMode()) {
          const checkbox = item.querySelector('.conv-select-checkbox');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
          }
        } else {
          loadChat(conv.id);
          toggleSidebar(false);
        }
      }
    };
    item.addEventListener('touchstart', startPress, { passive: true });
    item.addEventListener('touchend', cancelPress);
    item.addEventListener('touchmove', () => {
      touchMoved = true;
      cancelPress();
    }, { passive: true });
    item.addEventListener('mousedown', startPress);
    item.addEventListener('mouseup', cancelPress);
    item.addEventListener('mouseleave', cancelPress);
    item.addEventListener('click', handleClick);
    const chatOptionsBtn = contentWrapper.querySelector('.chat-options-btn');
    if (chatOptionsBtn) {
      chatOptionsBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        createHistoryMenu(conv.id, chatOptionsBtn);
      });
    }
    return item;
  };

  const renderArchivedChats = () => {
    const archivedChatsContainer = runtimeDomAccess.getRequiredElement('archivedChatsContainer');
    archivedChatsContainer.innerHTML = '';
    const archived = getConversations().filter(c => c.archived).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const uiLanguage = runtimeConfigAccess.getUiLanguage();
    if (archived.length === 0) {
      archivedChatsContainer.innerHTML = `<p class="text-sm text-[var(--text-secondary)] text-center p-4">${i18n[uiLanguage].noArchivedChats || '沒有已封存的對話。'}</p>`;
      return;
    }
    archived.forEach(conv => {
      const item = document.createElement('div');
      item.className = 'archived-chat-item';
      item.innerHTML = `
                    <div class="archived-chat-row">
                        <span class="archived-chat-title">${escapeMarkup(conv.title)}</span>
                        <div class="archived-chat-actions">
                            <button data-id="${escapeMarkup(conv.id)}" class="view-archived-btn text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200">${i18n[uiLanguage].view || '查看'}</button>
                            <button data-id="${escapeMarkup(conv.id)}" class="unarchive-btn text-xs bg-green-100 text-green-800 px-2 py-1 rounded hover:bg-green-200">${i18n[uiLanguage].restore || '還原'}</button>
                            <button data-id="${escapeMarkup(conv.id)}" class="delete-btn text-xs bg-red-100 text-red-800 px-2 py-1 rounded hover:bg-red-200">${i18n[uiLanguage].delete || '刪除'}</button>
                        </div>
                    </div>
                `;
      archivedChatsContainer.appendChild(item);
    });
    archivedChatsContainer.querySelectorAll('.view-archived-btn').forEach(btn => btn.addEventListener('click', (event) => showArchivedChatPreview(event.target.dataset.id, event)));
    archivedChatsContainer.querySelectorAll('.unarchive-btn').forEach(btn => btn.addEventListener('click', (event) => unarchiveChat(event.target.dataset.id, event)));
    archivedChatsContainer.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', (event) => deleteChat(event.target.dataset.id, event)));
  };

  const getActiveAstrasId = () => {
    const conv = getActiveConversation();
    return conv ? conv.astrasId : null;
  };

  const setAstrasForConversation = async (astrasId) => {
    const conv = getActiveConversation();
    if (conv) {
      conv.astrasId = astrasId;
      await saveAppData();
      runtimeRenderCoordinator.renderSidebar();
      renderInputIndicators();
      updateInputState();
      // Activating a Noura while learning mode is on: explain how the two rule sets combine.
      if (astrasId && getConfig().isLearningMode) {
        runtimeDialogCoordinator.showNotification(
          i18n[getConfig().uiLanguage].learningWithNouraNotice || '學習模式與 Noura 同時啟用：角色與語氣保留，衝突時以學習模式優先。',
          'success'
        );
      }
    }
  };

  const deactivateAstras = async () => {
    const conv = getActiveConversation();
    if (conv) {
      conv.astrasId = null;
      await saveAppData();
      runtimeRenderCoordinator.renderSidebar();
      renderInputIndicators();
      updateInputState();
      runtimeDialogCoordinator.showNotification(i18n[getConfig().uiLanguage].astrasDeactivated || '已關閉 Noura。', 'success');
    }
  };

  // Opens the dialog of a Noura with its name, description and instructions, to change them.
  const editAstras = (astrasId) => {
    const ast = getAstras().find(a => a.id === astrasId);
    if (!ast) return;
    setEditingAstrasId(astrasId);
    ALL_ELEMENTS.astrasNameInput.value = ast.name;
    ALL_ELEMENTS.astrasDescInput.value = ast.description;
    ALL_ELEMENTS.astrasInstructionsInput.value = ast.instructions;
    ALL_ELEMENTS.astrasCreateModal.querySelector('h2').textContent = i18n[getConfig().uiLanguage].editAstras || '編輯 Noura';
    toggleModal(ALL_ELEMENTS.astrasCreateModal, true);
  };

  const createAstras = async () => {
    setEditingAstrasId(null);
    ALL_ELEMENTS.astrasCreateModal.querySelector('h2').textContent = i18n[getConfig().uiLanguage].createAstras;
    ALL_ELEMENTS.astrasNameInput.value = '';
    ALL_ELEMENTS.astrasDescInput.value = '';
    ALL_ELEMENTS.astrasInstructionsInput.value = '';
    toggleModal(ALL_ELEMENTS.astrasCreateModal, true);
  };

  const handleSaveAstras = async () => {
    const name = ALL_ELEMENTS.astrasNameInput.value.trim();
    const description = ALL_ELEMENTS.astrasDescInput.value.trim();
    const instructions = ALL_ELEMENTS.astrasInstructionsInput.value.trim();
    if (!name || !instructions) {
      showNotification(i18n[getConfig().uiLanguage].nameAndInstructionsRequired || '名稱和指令為必填。', 'error');
      return;
    }
    if (isHighRiskCustomNouras({ name, description, instructions })) {
      showNotification(
        i18n[getConfig().uiLanguage].highRiskNourasWarning || 'This Nouras may involve a high-risk professional role. It is not verified and cannot replace qualified human help.',
        'warning'
      );
    }
    if (getEditingAstrasId()) {
      const ast = getAstras().find(a => a.id === getEditingAstrasId());
      if (ast) {
        ast.name = name;
        ast.description = description;
        ast.instructions = instructions;
        showNotification(i18n[getConfig().uiLanguage].astrasUpdated || 'Noura 已更新');
      }
      setEditingAstrasId(null);
    } else {
      const newAstras = {
        id: crypto.randomUUID(),
        name,
        description,
        instructions,
        avatarUrl: null,
        officialId: null
      };
      getAstras().unshift(newAstras);
      showNotification(i18n[getConfig().uiLanguage].astrasCreated || 'Noura 已建立');
    }
    await saveAppData();
    renderAstras();
    toggleModal(ALL_ELEMENTS.astrasCreateModal, false);
    ALL_ELEMENTS.astrasNameInput.value = '';
    ALL_ELEMENTS.astrasDescInput.value = '';
    ALL_ELEMENTS.astrasInstructionsInput.value = '';
    ALL_ELEMENTS.astrasCreateModal.querySelector('h2').textContent = i18n[getConfig().uiLanguage].createAstras;
  };

  const deleteAstras = async (id) => {
    if (!(await showCustomConfirm(i18n[getConfig().uiLanguage].confirmDeleteAstras || '確定刪除此 Noura？'))) return;
    const astra = getAstras().find(item => item.id === id);
    try {
      await deleteAstrasFromCloud([id], { astras: astra ? [astra] : [] });
    } catch (error) {
      try { console.warn('Noureon cloud Noura delete failed; keeping the local Noura.', error); } catch {}
      runtimeDialogCoordinator.showNotification(
        i18n[getConfig().uiLanguage].cloudDeleteFailed || '雲端刪除失敗，請稍後再試。',
        'error'
      );
      return;
    }
    runtimeAppDataStore.replaceAstras(getAstras().filter(a => a.id !== id));
    getConversations().forEach(c => {
      if (c.astrasId === id) c.astrasId = null;
    });
    await saveAppData();
    runtimeRenderCoordinator.renderSidebar();
    renderInputIndicators();
    runtimeDialogCoordinator.showNotification(i18n[getConfig().uiLanguage].astrasDeleted || 'Noura 已刪除');
  };

  const createAstrasMenu = (astrasId, targetButton) => {
    const existingPopover = document.getElementById('history-popover');
    if (existingPopover) {
      existingPopover.remove();
      if (existingPopover.dataset.targetId === targetButton.id) return;
    }
    const rect = targetButton.getBoundingClientRect();
    const popover = document.createElement('div');
    popover.id = 'history-popover';
    popover.className = 'popover absolute w-48 rounded-lg border border-[var(--border-color)] z-50';
    popover.dataset.targetId = targetButton.id;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 150) {
      popover.style.bottom = `${window.innerHeight - rect.top}px`;
      popover.style.transformOrigin = 'bottom';
    } else {
      popover.style.top = `${rect.bottom}px`;
      popover.style.transformOrigin = 'top';
    }
    popover.style.left = `${rect.left}px`;
    const astra = getAstras().find(a => a.id === astrasId);
    let menuHTML = '';
    if (astra && astra.officialId) {
      menuHTML = `
                    <button data-id="${astrasId}" class="edit-avatar-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[getConfig().uiLanguage].editAvatar || '編輯頭像'}</button>
                    <button data-id="${astrasId}" class="delete-astras-btn w-full text-left px-4 py-2 text-red-600 hover:bg-red-500/10 text-sm">${i18n[getConfig().uiLanguage].delete || '刪除'}</button>
                `;
    } else {
      menuHTML = `
                    <button data-id="${astrasId}" class="edit-astras-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[getConfig().uiLanguage].edit || '編輯'}</button>
                    <button data-id="${astrasId}" class="edit-avatar-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[getConfig().uiLanguage].editAvatar || '編輯頭像'}</button>
                    <button data-id="${astrasId}" class="delete-astras-btn w-full text-left px-4 py-2 text-red-600 hover:bg-red-500/10 text-sm">${i18n[getConfig().uiLanguage].delete || '刪除'}</button>
                `;
    }
    popover.innerHTML = menuHTML;
    document.body.appendChild(popover);
    requestAnimationFrame(() => popover.classList.add('visible'));
    const editBtn = popover.querySelector('.edit-astras-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        editAstras(astrasId);
        popover.remove();
      });
    }
    popover.querySelector('.edit-avatar-btn').addEventListener('click', () => {
      openAvatarEditor(astrasId);
      popover.remove();
    });
    popover.querySelector('.delete-astras-btn').addEventListener('click', () => { deleteAstras(astrasId); popover.remove(); });
  };

  const {
    buildMediaAttachmentView: buildMessageMediaAttachmentView,
    getInlineMediaSrc: getMessageInlineMediaSrc
  } = createMessageMediaAttachmentRenderer({ escapeHTML, getUiLanguage: () => getConfig().uiLanguage });

  const {
    bindMediaPreviewButtons: bindMessageMediaPreviewButtons
  } = createMessageMediaPreviewLifecycle({
    document,
    navigator,
    fetch,
    File,
    escapeHTML,
    getInlineMediaSrc: getMessageInlineMediaSrc,
    getUiLanguage: () => getConfig().uiLanguage,
    getText: (key, fallback) => i18n[getConfig().uiLanguage]?.[key] || fallback
  });

  const temporaryChatLifecycle = typeof document.addEventListener === 'function'
    ? createTemporaryChatLifecycle({
    document,
    elements: {
      chatWorkspace: ALL_ELEMENTS.chatWorkspace,
      chatContainer: ALL_ELEMENTS.chatContainer,
      messageList: ALL_ELEMENTS.messageList,
      newChatBtnHeader: ALL_ELEMENTS.newChatBtnHeader
    },
    getActiveConversation,
    getText: (key, fallback) => i18n[getConfig().uiLanguage]?.[key] || fallback,
    saveAppData,
    renderAll,
    renderSidebar: (...args) => runtimeRenderCoordinator.renderSidebar(...args),
    getAutoNaming: () => getConfig().autoNaming,
    generateTitleAndSummary: (...args) => generateTitleAndSummary(...args),
    showNotification,
    persistGeneratedImageAssets: async conversation => {
      const assetStore = await getGeneratedImageAssetStore();
      if (!assetStore) return;
      const assets = (conversation?.messages || [])
        .flatMap(message => message?.parts || [])
        .map(part => part?.generatedImage)
        .filter(Boolean);
      await Promise.all(assets.map(asset => assetStore.persist(asset)));
    }
    })
    : { render() {} };
  temporaryChatLifecycle.render();

  const {
    addMessageToUI,
    appendMissingMessages,
    isActiveConversationViewCurrent,
    refreshMessageHistorySources,
    renderChat
  } = createMessageListLifecycle({
    document,
    elements: {
      headerTitle: ALL_ELEMENTS.headerTitle,
      modelSwitcherContainer: ALL_ELEMENTS.modelSwitcherContainer,
      messageList: ALL_ELEMENTS.messageList,
      chatContainer: ALL_ELEMENTS.chatContainer
    },
    getActiveConversation,
    getAutoNaming: () => getConfig().autoNaming,
    getCurrentUserName: getCurrentUserDisplayName,
    getText: (key) => ({
      newChat: i18n[getConfig().uiLanguage].newChat,
      archived: i18n[getConfig().uiLanguage].archived || '已封存',
      howCanIHelp: i18n[getConfig().uiLanguage].howCanIHelp || '有什麼可以為您服務的嗎？',
      copyContent: i18n[getConfig().uiLanguage].copyContent || '複製內容',
      uiLanguage: getConfig().uiLanguage,
      labels: (() => {
        const texts = i18n[getConfig().uiLanguage];
        return {
          imagePreview: texts.imagePreview,
          imageAlt: texts.imageAlt,
          edit: texts.edit,
          imageDownloadOriginal: texts.imageDownloadOriginal,
          imageSetItem: texts.imageSetItem,
          messageActions: texts.messageActions,
          copyMessage: texts.copyMessage,
          editMessage: texts.editMessage
        };
      })()
    }[key]),
    // The conversations a reply looked into are listed in its sources now (ui/citations/source-panel.js), not as a line of their own under it.
    getHistorySourceViews: () => [],
    getHistorySourceTexts: () => ({
      referenceLabel: i18n[getConfig().uiLanguage].historySourcesUsed,
      updatedLabel: i18n[getConfig().uiLanguage].historySourceUpdated,
      unavailableLabel: i18n[getConfig().uiLanguage].historySourceUnavailable,
      autoCheckLabel: i18n[getConfig().uiLanguage].visionAutoNote,
      retryLabel: i18n[getConfig().uiLanguage].visionRetry
    }),
    getVisionRetry: (conversation, message) => getConfig().visionCheckEnabled !== false && visionRetryOffered(conversation, message),
    openHistorySourceConversation: (id) => {
      const sourceConversation = getConversations().find(conversation => conversation.id === id);
      if (!sourceConversation || sourceConversation.deletedAt) return;
      loadChat(sourceConversation.id);
      toggleSidebar(false);
    },
    buildMessageRenderView,
    buildMediaAttachmentView: buildMessageMediaAttachmentView,
    renderUserText,
    renderMarkdownWithFormulas,
    formatTimestamp: formatFullTimestamp,
    bindMediaPreviewButtons: bindMessageMediaPreviewButtons,
    bindGeneratedImageAssets,
    saveAppData,
    renderModelSwitcher,
    renderInputIndicators,
    renderCouncilControls,
    setupMessageIntersectionObserver,
    updateInputState: () => updateInputState(),
    scheduleFrame: (callback) => requestAnimationFrame(callback),
    isAutoScrolling: () => Boolean(isAutoScrolling()),
    syncComposerLayout
  });

  return {
    renderFolders,
    createConversationElement,
    renderArchivedChats,
    renderChat,
    addMessageToUI,
    appendMissingMessages,
    isActiveConversationViewCurrent,
    refreshMessageHistorySources,
    renderAstras,
    getActiveAstrasId,
    setAstrasForConversation,
    deactivateAstras,
    createAstras,
    editAstras,
    handleSaveAstras,
    deleteAstras,
    createAstrasMenu
  };
}
