import { createMediaAttachmentRenderer } from '../../legacy-runtime/features/media-attachment-renderer.js';
import { createMediaPreviewLifecycle } from '../../legacy-runtime/features/media-preview-lifecycle.js';
import { createConversationViewRenderer } from '../../legacy-runtime/features/conversation-view-renderer.js';
import { escapeHTML as escapeMarkup } from '../legacy-core/legacy-core-utilities.js';

export function createLegacyTrashLifecycle({
  document,
  navigator,
  fetch,
  File,
  elements,
  getConversations,
  replaceConversations,
  saveAppData,
  renderAll = () => {},
  renderSidebar = renderAll,
  getI18n,
  getUiLanguage,
  showCustomConfirm,
  showNotification,
  showCoordinatedNotification,
  deleteConversationsFromCloud = async () => {},
  invalidateConversationMemory = async () => {},
  rebuildHistoryIndex = async () => {},
  toggleModal,
  formatFullTimestamp,
  renderUserText,
  renderModelText,
  bindGeneratedImageAssets = async () => {},
  escapeHTML,
  scheduleTimeout,
  clearScheduledTimeout,
  createChangeEvent,
  logger = console
} = {}) {
  let isTrashSelectionMode = false;
  const selectedTrashIds = new Set();

  const getTexts = () => getI18n()[getUiLanguage()];
  const {
    getInlineMediaSrc,
    renderMediaAttachmentGrid
  } = createMediaAttachmentRenderer({ escapeHTML });
  const {
    bindMediaPreviewButtons
  } = createMediaPreviewLifecycle({
    document,
    navigator,
    fetch,
    File,
    escapeHTML,
    getInlineMediaSrc,
    getUiLanguage,
    getText: (key, fallback) => getTexts()?.[key] || fallback
  });
  const trashConversationViewRenderer = createConversationViewRenderer({
    document,
    renderUserText,
    renderModelText,
    renderMediaAttachmentGrid,
    bindMediaPreviewButtons,
    bindGeneratedImageAssets,
    logError: (...args) => logger.error(...args)
  });
  const confirmCloudDeletion = async (conversationIds, conversationSnapshots = []) => {
    try {
      await deleteConversationsFromCloud(conversationIds, {
        conversations: conversationSnapshots,
        requireSnapshots: true
      });
      return true;
    } catch (error) {
      try {
        logger.warn('Noureon cloud permanent delete failed; keeping local trash for safety.', error);
      } catch {}
      showNotification(
        getTexts().cloudDeleteFailed || '雲端刪除失敗，請稍後再試。',
        'error'
      );
      return false;
    }
  };

  const renderTrash = () => {
    const container = elements.trashListContainer;
    const deletedConvs = getConversations()
      .filter(conversation => conversation.deletedAt)
      .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
    container.innerHTML = '';
    if (deletedConvs.length === 0) {
      container.innerHTML = `<p class="text-center text-[var(--text-secondary)] py-4">${getTexts().trashIsEmpty || '垃圾桶是空的。'}</p>`;
      elements.emptyTrashBtn.disabled = true;
      elements.trashBatchSelectBtn.disabled = true;
      return;
    }
    elements.emptyTrashBtn.disabled = false;
    elements.trashBatchSelectBtn.disabled = false;
    deletedConvs.forEach(conversation => {
      const item = document.createElement('div');
      item.className = 'trash-item flex items-center p-2 rounded-lg bg-[var(--hover-bg)] border border-[var(--border-color)]';
      item.dataset.id = conversation.id;
      const checkboxHTML = isTrashSelectionMode
        ? `<input type="checkbox" class="trash-select-checkbox h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3 flex-shrink-0" data-id="${escapeMarkup(conversation.id)}" ${selectedTrashIds.has(conversation.id) ? 'checked' : ''}>`
        : '';
      item.innerHTML = `
        ${checkboxHTML}
        <div class="flex-1 min-w-0">
          <p class="font-medium truncate">${escapeMarkup(conversation.title)}</p>
          <p class="text-xs text-[var(--text-secondary)]">${getTexts().deletedOn || '刪除於'}: ${formatFullTimestamp(conversation.deletedAt)}</p>
        </div>
        <div class="flex gap-2 flex-shrink-0 ml-2">
          <button data-id="${escapeMarkup(conversation.id)}" class="trash-item-view-btn btn-outline-white text-xs px-2 py-1 rounded">${getTexts().view || '檢視'}</button>
          <button data-id="${escapeMarkup(conversation.id)}" class="trash-item-restore-btn btn-outline-white text-xs px-2 py-1 rounded">${getTexts().restore || '還原'}</button>
          <button data-id="${escapeMarkup(conversation.id)}" class="trash-item-delete-btn btn-outline-white text-xs px-2 py-1 rounded">${getTexts().delete || '刪除'}</button>
        </div>
      `;
      container.appendChild(item);
      let pressTimer = null;
      item.addEventListener('touchstart', event => {
        if (event.target.closest('button')) return;
        pressTimer = scheduleTimeout(() => {
          event.preventDefault();
          showTrashItemInViewModal(conversation.id);
        }, 500);
      }, { passive: false });
      item.addEventListener('touchend', () => clearScheduledTimeout(pressTimer));
      item.addEventListener('touchmove', () => clearScheduledTimeout(pressTimer));
      if (isTrashSelectionMode) {
        item.addEventListener('click', event => {
          if (event.target.closest('button')) return;
          const checkbox = item.querySelector('.trash-select-checkbox');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(createChangeEvent());
          }
        });
      }
    });
    container.querySelectorAll('.trash-item-view-btn').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      showTrashItemInViewModal(event.currentTarget.dataset.id);
    }));
    container.querySelectorAll('.trash-item-restore-btn').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      handleRestoreTrashItem(event.currentTarget.dataset.id);
    }));
    container.querySelectorAll('.trash-item-delete-btn').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      handleDeleteTrashItemPermanently(event.currentTarget.dataset.id);
    }));
    container.querySelectorAll('.trash-select-checkbox').forEach(checkbox => {
      checkbox.addEventListener('click', event => event.stopPropagation());
      checkbox.addEventListener('change', event => {
        const id = event.target.dataset.id;
        if (event.target.checked) {
          selectedTrashIds.add(id);
        } else {
          selectedTrashIds.delete(id);
        }
        renderTrashBatchActionBar();
      });
    });
  };

  const handleRestoreTrashItem = async (conversationId) => {
    const conversation = getConversations().find(item => item.id === conversationId);
    if (conversation) {
      const restoredAt = new Date().toISOString();
      conversation.deletedAt = null;
      conversation.stateUpdatedAt = restoredAt;
      conversation.trashStateUpdatedAt = restoredAt;
      await saveAppData({ immediateCloudSync: true });
      renderSidebar();
      renderTrash();
      showCoordinatedNotification(getTexts().itemRestored || '項目已還原。', 'success');
      void rebuildHistoryIndex();
    }
  };

  const handleDeleteTrashItemPermanently = async (conversationId) => {
    if (!(await showCustomConfirm(
      getTexts().confirmPermanentDelete || '此操作將永久刪除此對話，無法復原。您確定嗎？',
      getTexts().permanentDeleteTitle || '永久刪除確認'
    ))) return;
    const conversation = getConversations().find(item => item.id === conversationId);
    if (!await confirmCloudDeletion([conversationId], conversation ? [conversation] : [])) return;
    await invalidateConversationMemory({ conversationId });
    replaceConversations(
      getConversations().filter(conversation => conversation.id !== conversationId)
    );
    await saveAppData();
    renderSidebar();
    renderTrash();
    showNotification(getTexts().itemPermanentlyDeleted || '項目已永久刪除。', 'success');
  };

  const showTrashItemInViewModal = (conversationId) => {
    const conversation = getConversations().find(item => item.id === conversationId);
    if (!conversation) return;
    elements.trashViewTitle.textContent = conversation.title;
    trashConversationViewRenderer.renderConversationMessages({
      conversation,
      contentContainer: elements.trashViewContent,
      emptyHTML: `<p class="text-center text-[var(--text-secondary)]">${getTexts().noMessages || '此對話沒有訊息。'}</p>`
    });
    toggleModal(elements.trashViewModal, true);
  };

  const toggleTrashSelectionMode = () => {
    isTrashSelectionMode = !isTrashSelectionMode;
    selectedTrashIds.clear();
    renderTrash();
    renderTrashBatchActionBar();
  };

  const renderTrashBatchActionBar = () => {
    const {
      trashBatchActionBar,
      trashSelectionCount,
      trashBatchRestoreBtn,
      trashBatchDeleteBtn
    } = elements;
    if (isTrashSelectionMode) {
      trashBatchActionBar.classList.remove('hidden');
      const count = selectedTrashIds.size;
      trashSelectionCount.textContent = `${getTexts().selected || '已選取'} ${count} ${getTexts().items || '個項目'}`;
      const hasSelection = count > 0;
      trashBatchRestoreBtn.disabled = !hasSelection;
      trashBatchDeleteBtn.disabled = !hasSelection;
    } else {
      trashBatchActionBar.classList.add('hidden');
    }
  };

  const handleBatchRestoreFromTrash = async () => {
    const count = selectedTrashIds.size;
    if (count === 0) return;
    selectedTrashIds.forEach(id => {
      const conversation = getConversations().find(item => item.id === id);
      if (conversation) {
        const restoredAt = new Date().toISOString();
        conversation.deletedAt = null;
        conversation.stateUpdatedAt = restoredAt;
        conversation.trashStateUpdatedAt = restoredAt;
      }
    });
    await saveAppData({ immediateCloudSync: true });
    renderSidebar();
    toggleTrashSelectionMode();
    showCoordinatedNotification(
      `${getTexts().batchRestoredSuccess || '已成功還原'} ${count} ${getTexts().items || '個項目'}。`,
      'success'
    );
    void rebuildHistoryIndex();
  };

  const handleBatchDeleteFromTrash = async () => {
    const count = selectedTrashIds.size;
    if (count === 0) return;
    if (!(await showCustomConfirm(
      `${getTexts().confirmBatchPermanentDelete || '您確定要永久刪除這'} ${count} ${getTexts().items || '個項目嗎？'}`,
      getTexts().permanentDeleteTitle || '永久刪除確認'
    ))) return;
    const ids = [...selectedTrashIds];
    const selectedSnapshots = getConversations().filter(conversation => selectedTrashIds.has(conversation?.id));
    if (!await confirmCloudDeletion(ids, selectedSnapshots)) return;
    for (const conversationId of ids) await invalidateConversationMemory({ conversationId });
    replaceConversations(
      getConversations().filter(conversation => !selectedTrashIds.has(conversation.id))
    );
    await saveAppData();
    renderSidebar();
    toggleTrashSelectionMode();
    showNotification(
      `${getTexts().batchPermanentlyDeletedSuccess || '已成功永久刪除'} ${count} ${getTexts().items || '個項目'}。`,
      'success'
    );
  };

  const handleEmptyTrash = async () => {
    if (!(await showCustomConfirm(
      getTexts().confirmEmptyTrash || '您確定要清空垃圾桶嗎？此操作無法復原。',
      getTexts().emptyTrashConfirmationTitle || '清空垃圾桶確認'
    ))) return;
    const conversations = getConversations();
    const count = conversations.filter(conversation => conversation.deletedAt).length;
    const trashSnapshots = conversations.filter(conversation => conversation.deletedAt);
    const ids = trashSnapshots.map(conversation => conversation.id);
    if (!await confirmCloudDeletion(ids, trashSnapshots)) return;
    for (const conversationId of ids) await invalidateConversationMemory({ conversationId });
    replaceConversations(
      conversations.filter(conversation => !conversation.deletedAt)
    );
    await saveAppData();
    renderSidebar();
    renderTrash();
    showNotification(
      `${getTexts().trashEmptiedSuccess || '已成功清空垃圾桶，刪除了'} ${count} ${getTexts().items || '個項目'}。`,
      'success'
    );
  };

  return {
    renderTrash,
    handleRestoreTrashItem,
    handleDeleteTrashItemPermanently,
    showTrashItemInViewModal,
    toggleTrashSelectionMode,
    renderTrashBatchActionBar,
    handleBatchRestoreFromTrash,
    handleBatchDeleteFromTrash,
    handleEmptyTrash
  };
}
